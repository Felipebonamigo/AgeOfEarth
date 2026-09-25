// Executa objetivos e gatilhos do cenário ativo; roda uma vez por segundo dentro do tick.
import { TICK_RATE } from '../constants';
import type { GameState } from '../types';
import type { ScenarioDef, ScenarioState, TriggerCtx } from './types';
import { HORDE, campaignMission } from './campaign';
import { compileScenarioCached } from './compile';
import { eliminatePlayers } from '../sim/victory';
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

export function initScenarioState(def: ScenarioDef): ScenarioState {
  const objectives: Record<string, 'pending'> = {}; const hidden: Record<string, boolean> = {};
  for (const o of def.objectives) { objectives[o.id] = 'pending'; hidden[o.id] = !!o.hidden; }
  return { id: def.id, objectives, hidden, fired: [], outcome: 'playing', vars: {} };
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
    if (!t.when(state, ctx)) continue;
    if (!t.repeat) sc.fired.push(t.id);
    t.then(state, ctx);
  }
  const local = localHuman(state);
  if (def.victory(state)) { sc.outcome = 'victory'; state.gameOver = true; state.winner = state.config.players.findIndex((p) => !p.isAI); state.events.push({ tick: state.tick, type: 'victory', player: state.winner, text: t('ev.missionDone', { title: def.title }) }); }
  // derrota implícita: todos os humanos do time local eliminados (eliminateInScenario zera alive)
  else if (def.defeat?.(state) || (local >= 0 && state.players.filter((p) => !p.isAI && p.team === state.players[local].team).every((p) => !p.alive))) { sc.outcome = 'defeat'; state.gameOver = true; state.winner = -2; state.events.push({ tick: state.tick, type: 'defeated', player: -1, text: t('ev.missionFailed', { title: def.title }) }); }
}

/** Primeiro humano da configuração (o "jogador local" dos cenários); -1 se não houver. */
function localHuman(state: GameState): number { return state.config.players.findIndex((p) => !p.isAI); }

/**
 * Marionete roteirizada: jogador sem IA fora do time local (Saqueadores da m1, Tártaro da Horda, guardas do mapa). Age só
 * por gatilhos e costuma não ter cidade — nunca é eliminada automaticamente (o cenário decide com `alive`/`kill`).
 */
export function isScenarioPuppet(state: GameState, id: number): boolean {
  const p = state.players[id]; const local = localHuman(state);
  return !!p && !p.isAI && local >= 0 && p.team !== state.players[local].team;
}

/**
 * G2: eliminação dentro de cenário, uma vez por segundo antes do runner. Mesma regra de checkVictory (sem edifícios que
 * contam e sem cidadãos, respeitando hasStartKit; Regicídio sem rei), com os eventos de derrota, mas sem declarar vencedor
 * global: quem encerra a partida é o runner (vitória/derrota do cenário ou derrota implícita do time local).
 */
export function eliminateInScenario(state: GameState): void {
  const sc = state.scenario; if (!sc || sc.outcome !== 'playing' || state.gameOver) return;
  eliminatePlayers(state, (p) => isScenarioPuppet(state, p.id));
}
