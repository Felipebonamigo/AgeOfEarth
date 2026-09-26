// Executa objetivos e gatilhos do cenário ativo; roda uma vez por segundo dentro do tick.
import { TICK_RATE } from '../constants';
import type { GameConfig, GameState } from '../types';
import type { ScenarioDef, ScenarioState, TriggerCtx } from './types';
import { HORDE, campaignMission } from './campaign';
import { compileScenarioCached, copyForbid } from './compile';
import { eliminatePlayers } from '../sim/victory';
import { hasAnyEntity, isPuppetConfig, localHumanIndex } from './helpers';
import { emptyKillLog } from './log';
export { scenarioAlive } from './helpers';
import { t } from '../../i18n';

/** Cenário embutido (Horda ou missão do registro da campanha, TS ou JSON) por id. Continua servindo o HUD e a campanha. */
export function getScenario(id: string): ScenarioDef | undefined { return id === HORDE.id ? HORDE : campaignMission(id); }

/**
 * Cenário da partida: config.scenarioData (JSON) compilado com cache por (hash, idioma), senão o registro embutido
 * por config.scenario (ou pelo id do estado). Lança se o JSON for inválido (createGame propaga; a interface avisa).
 */
export function getScenarioFor(state: GameState): ScenarioDef | undefined {
  const cfg = state.config;
  if (cfg.scenarioData) return compileScenarioCached(cfg.scenarioData);
  const id = cfg.scenario ?? state.scenario?.id;
  return id ? getScenario(id) : undefined;
}

/**
 * Save ou replay de missão embutida gravado antes das travas (G6): a config não traz maxAge/forbid, mas os gatilhos que
 * elas substituíram (ex.: derrubar o Portal dos Titãs na m4–m6) já saíram da definição atual. Sem nenhuma trava na config
 * (global ou por jogador), copia as da definição atual. Config com alguma trava, cenário em JSON (scenarioData) ou
 * missão sem travas: devolve a mesma config.
 */
export function migrateScenarioLocks(config: GameConfig): GameConfig {
  if (config.scenarioData || !config.scenario) return config;
  const locked = (c: { maxAge?: number; forbid?: unknown }) => c.maxAge !== undefined || c.forbid !== undefined;
  if (locked(config) || config.players.some(locked)) return config;
  const src = getScenario(config.scenario)?.config;
  if (!src || !(locked(src) || src.players.some(locked))) return config;
  const out: GameConfig = { ...config };
  if (src.maxAge !== undefined) out.maxAge = src.maxAge;
  if (src.forbid) out.forbid = copyForbid(src.forbid);
  out.players = config.players.map((p, i) => {
    const sp = src.players[i]; if (!sp || !locked(sp)) return p;
    const q = { ...p };
    if (sp.maxAge !== undefined) q.maxAge = sp.maxAge;
    if (sp.forbid) q.forbid = copyForbid(sp.forbid);
    return q;
  });
  return out;
}

export function initScenarioState(def: ScenarioDef): ScenarioState {
  const objectives: Record<string, 'pending'> = {}; const hidden: Record<string, boolean> = {};
  for (const o of def.objectives) { objectives[o.id] = 'pending'; hidden[o.id] = !!o.hidden; }
  return { id: def.id, objectives, hidden, fired: [], outcome: 'playing', winnerTeam: -1, vars: {}, powerUses: {}, kills: emptyKillLog() };
}

export function runScenario(state: GameState): void {
  const sc = state.scenario; if (!sc || sc.outcome !== 'playing') return;
  const def = getScenarioFor(state); if (!def) return;
  const ctx: TriggerCtx = {
    say: (speaker, text, icon) => state.events.push({ tick: state.tick, type: 'dialogue', player: -1, text, data: `${icon ?? '🗣️'}|${speaker}` }),
    objective: (id, status) => { if (sc.objectives[id] !== status) { sc.objectives[id] = status; sc.hidden[id] = false; state.events.push({ tick: state.tick, type: 'objective', player: -1, text: `${status === 'done' ? '✅' : status === 'failed' ? '❌' : '📌'} ${def.objectives.find((o) => o.id === id)?.text ?? id}`, data: status }); } },
    reveal: (id) => { if (sc.hidden[id]) { sc.hidden[id] = false; state.events.push({ tick: state.tick, type: 'objective', player: -1, text: `📌 ${t('mission.newObjective')}: ${def.objectives.find((o) => o.id === id)?.text ?? id}`, data: 'pending' }); } },
    seconds: Math.floor((state.tick + 1) / TICK_RATE),   // inteiro: o runner roda no último tick de cada segundo
    fired: (id) => sc.fired.includes(id),
  };
  // G1: objetivos ocultos também são avaliados; ao mudar de estado, ctx.objective os revela (segredos com done/failed)
  for (const o of def.objectives) {
    if (!o.check || sc.objectives[o.id] !== 'pending') continue;
    const st = o.check(state);
    if (st !== 'pending') ctx.objective(o.id, st);
  }
  for (const t of def.triggers) {
    if (!t.repeat && sc.fired.includes(t.id)) continue;
    // G17: gatilho repeat conta os disparos em vars['@id'] (já somado quando o then roda: 1 no 1º disparo); com maxFires,
    // para no teto — setVar '@id' 0 no roteiro o rearma
    const counter = '@' + t.id;
    if (t.repeat && t.maxFires !== undefined && (sc.vars[counter] ?? 0) >= t.maxFires) continue;
    if (!t.when(state, ctx)) continue;
    if (!t.repeat) sc.fired.push(t.id);
    else sc.vars[counter] = (sc.vars[counter] ?? 0) + 1;
    t.then(state, ctx);
  }
  // Fim do cenário. A vitória/derrota do arquivo é do ponto de vista do time do primeiro humano (não marionete); com humanos
  // em times diferentes (cenário em rede), o resultado vale POR TIME: winnerTeam fica no estado e cada cliente decide pela sua.
  const local = localHumanIndex(state.config);
  const localTeam = local >= 0 ? state.players[local].team : -1;
  const humans = state.players.filter((p) => !p.isAI && !isScenarioPuppet(state, p.id));
  const humanTeams = new Set(humans.map((p) => p.team));
  const aliveTeams = new Set(humans.filter((p) => p.alive).map((p) => p.team));
  const others = [...aliveTeams].filter((tm) => tm !== localTeam);
  if (aliveTeams.has(localTeam) && def.victory(state)) endScenario(state, def, localTeam, humanTeams.size > 1);
  else if (def.defeat?.(state)) endScenario(state, def, others.length === 1 ? others[0] : -1, humanTeams.size > 1);   // o time local perdeu: vence o outro time humano, se só restar um
  // derrota implícita: nenhum humano de pé (eliminateInScenario zera alive); em rede, o último time humano de pé vence
  else if (humanTeams.size > 0 && aliveTeams.size === 0) endScenario(state, def, -1, humanTeams.size > 1);
  else if (humanTeams.size > 1 && aliveTeams.size === 1) endScenario(state, def, [...aliveTeams][0], true);
}

/** Encerra o cenário com o time vencedor (-1 = ninguém). outcome segue o time do primeiro humano; o HUD usa winnerTeam. */
function endScenario(state: GameState, def: ScenarioDef, winnerTeam: number, versus: boolean): void {
  const sc = state.scenario!;
  const local = localHumanIndex(state.config);
  const localTeam = local >= 0 ? state.players[local].team : -1;
  const winners = winnerTeam >= 0 ? state.players.filter((p) => p.team === winnerTeam && !p.isAI && !isScenarioPuppet(state, p.id)) : [];
  sc.winnerTeam = winnerTeam;
  sc.outcome = winnerTeam >= 0 && winnerTeam === localTeam ? 'victory' : 'defeat';
  state.gameOver = true;
  state.winner = winners.length ? (winners.find((p) => p.alive) ?? winners[0]).id : -2;
  if (winnerTeam < 0) state.events.push({ tick: state.tick, type: 'defeated', player: -1, text: t('ev.missionFailed', { title: def.title }) });
  else if (!versus) state.events.push({ tick: state.tick, type: 'victory', player: state.winner, text: t('ev.missionDone', { title: def.title }) });
  else {   // humanos em times diferentes: o texto do evento nomeia os vencedores (é o mesmo em todos os clientes)
    const names = winners.filter((p) => p.alive).map((p) => p.name);
    state.events.push({ tick: state.tick, type: 'victory', player: state.winner, text: names.length > 1 ? t('ev.victoryAlliance', { players: names.join(' & ') }) : t('ev.victoryConquest', { player: names[0] ?? winners[0].name }) });
  }
}

/** Vitória do cenário para quem joga no time `team` (tela de fim de cada cliente): winnerTeam decide; sem ele (save antigo), outcome. */
export function scenarioWon(sc: Pick<ScenarioState, 'outcome'> & { winnerTeam?: number }, team: number): boolean {
  if (sc.outcome === 'playing') return false;
  return sc.winnerTeam !== undefined ? sc.winnerTeam >= 0 && sc.winnerTeam === team : sc.outcome === 'victory';
}

/** Marionete roteirizada: jogador marcado com `puppet: true` na config (Saqueadores da m1, Tártaro da Horda, guardas do mapa). */
export function isScenarioPuppet(state: GameState, id: number): boolean { return isPuppetConfig(state.config, id); }

/** Sincroniza o `alive` das marionetes com scenarioAlive (combate e IA ignoram jogadores mortos). Sem eventos: é o ritmo do roteiro. */
export function refreshPuppets(state: GameState): void {
  for (const p of state.players) {
    if (!isScenarioPuppet(state, p.id)) continue;
    const alive = hasAnyEntity(state, p.id);
    if (alive !== p.alive) { p.alive = alive; p.defeatedTick = alive ? -1 : state.tick; }
  }
}

/**
 * G2: eliminação dentro de cenário, uma vez por segundo antes do runner. Jogador comum é eliminado sem edifício que conta e
 * sem NENHUMA unidade viva (anyUnit; Regicídio sem rei), com os eventos de derrota, mas sem declarar vencedor global: quem
 * encerra a partida é o runner. Marionetes seguem scenarioAlive (refreshPuppets).
 */
export function eliminateInScenario(state: GameState): void {
  const sc = state.scenario; if (!sc || sc.outcome !== 'playing' || state.gameOver) return;
  eliminatePlayers(state, (p) => isScenarioPuppet(state, p.id), true);
  refreshPuppets(state);
}
