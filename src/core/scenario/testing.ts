// Harness de testes por missão (docs/STORY.md §7.2, Fase 3.5). Só para testes e scripts (nunca importado pelo jogo), mas
// determinístico como o núcleo: mesma missão + dificuldade + roteiro → mesmo stateHash.
//   runPassive: roda N minutos sem comandos do jogador 0 (viabilidade passiva).
//   runScripted: o jogador 0 ganha um estado de IA (aiThink a cada tick, economia e exército como numa partida IA × missão)
//                e, por cima, passos roteirizados { when: Condition, command } aplicados por applyCommand (via tick).
import { TICK_RATE, type Difficulty, type ResourceType } from '../constants';
import { ACADEMY_LINES, BUILDINGS, TECHS, UNITS } from '../data';
import type { Building, Command, GameConfig, GameState, Unit } from '../types';
import { createGame, tick } from '../sim/game';
import { aiThink, findBuildSpot } from '../sim/ai';
import { stateHash } from '../net/hash';
import type { ObjectiveStatus, ScenarioDef } from './types';
import { validateScenario, type CampaignDifficulty, type Condition, type ScenarioFile } from './schema';
import { compileCondition, gameConfigFor } from './compile';
import { campaignMission, isCampaignMission, missionConfig, withCampaignDifficulty, type CampaignEntry } from './campaign';
import { academyTechCount, canAdvanceAge, canResearch, canTrain } from '../sim/commands';
import { getBuildingStats, getUnitStats } from '../sim/modifiers';
import { canAfford } from '../sim/economy';
import { isEnemy, nearestNode } from '../sim/queries';
import { canPlaceBuilding } from '../sim/entities';
import { military, setRaidObserver, tagIds, type RaidRecord } from './helpers';

/** Missão a rodar: id do registro, ScenarioDef registrado ou arquivo JSON (roda como scenarioData). */
export type MissionSource = string | ScenarioDef | ScenarioFile;

/**
 * Passo roteirizado do jogador. `when` é uma condição da gramática (avaliada uma vez por segundo, com os segundos inteiros
 * do runner); `command` monta o(s) comando(s) no momento (null = nada a fazer agora). Sem `every`, dispara uma vez;
 * com `every`, repete a cada N segundos enquanto `when` valer (útil porque a IA do jogador reordena o exército).
 */
export interface ScriptStep { label?: string; when: Condition; command: (state: GameState) => Command | Command[] | null; every?: number }

export interface MissionRunOpts {
  minutes: number;
  difficulty?: CampaignDifficulty;
  /** Duas execuções e comparação do stateHash final (padrão: true). */
  deterministic?: boolean;
  /** Dificuldade da IA que joga pelo jogador 0 em runScripted (padrão: 'hard'). */
  playerAi?: Difficulty;
  /** Objetivos que, por desenho, podem se cumprir antes de 60 s (fora da checagem d); ver MissionScript.earlyOk. */
  earlyOk?: string[];
}
export interface ScriptedRunOpts extends MissionRunOpts {
  steps: ScriptStep[];
  /** Enquanto valer, a IA do jogador 0 não lança ondas de ataque (joga na defesa); a defesa de ameaças continua. */
  hold?: Condition;
  /** Cofre do jogador: enquanto `when` valer, a IA do jogador 0 não enxerga (nem gasta) até `resources` do estoque; os passos veem tudo.
   * Uma lista soma os cofres que valem no momento (cada um com a sua condição). */
  reserve?: ScriptReserve | ScriptReserve[];
  /** Destacamento: unidades do jogador 0 que a IA dele não enxerga (nem comanda) durante o aiThink; só os passos as conduzem. */
  detach?: ScriptDetach;
  /** Poderes guardados para os passos: a IA do jogador 0 não os usa (ver MissionScript.keepPowers). */
  keepPowers?: string[];
  /** Condições conferidas no fim (ver MissionScript.atEnd); as que não valem vão para MissionRunResult.endIssues. */
  atEnd?: ScriptEndCheck[];
}

/**
 * Condição conferida no fim do roteiro, com o rótulo que aparece na falha. Sem `seconds`, precisa valer no estado final; com
 * `seconds`, precisa ter valido em ao menos N segundos da partida (amostrada uma vez por segundo; ex.: o chefe da m8 atacando).
 */
export interface ScriptEndCheck { label: string; when: Condition; seconds?: number }

/**
 * Destacamento de um roteiro (ex.: Odisseu, os náufragos e a escolta da m5, que a IA do jogador levaria de volta ao ponto de
 * encontro ou mandaria coletar do outro lado do mapa): devolve os ids das unidades do jogador 0 que, durante o aiThink, ficam
 * fora do alcance da IA (marcadas como "dentro de um edifício", inside = -2, e restauradas logo depois). Chamado uma vez por
 * segundo. Não mexe no estado fora do aiThink (determinístico); sem destacamento, nada muda.
 */
export type ScriptDetach = (state: GameState) => number[];

/**
 * Cofre de um roteiro (ex.: juntar o custo de uma Maravilha, como um humano faria): enquanto `when` valer (avaliada uma vez por
 * segundo), a parte do estoque em `resources` fica escondida da IA do jogador 0 durante o aiThink e volta logo depois. Os
 * comandos dos passos (aplicados no tick) usam o estoque inteiro. Não mexe no estado fora do aiThink (determinístico).
 */
export interface ScriptReserve { when: Condition; resources: Partial<Record<ResourceType, number>> }

export interface MissionChecks {
  /** (a) nenhuma exceção. */
  noException: boolean;
  /** (d) nenhum objetivo cumprido antes de 60 s (pega tags futuras e condições que valem no segundo 1). */
  noEarlyObjective: boolean;
  /** (e) no máximo 1 unidade viva de cada Titã (qualquer dono) em cada segundo. */
  oneTitanEach: boolean;
  /** (f) toda invasão roteirizada gerou unidades (origem alcançável e alvo existente). */
  raidsSpawned: boolean;
  /** (g) duas execuções com a mesma semente dão o mesmo stateHash. */
  deterministic: boolean;
}

export interface MissionRunResult {
  id: string; difficulty: CampaignDifficulty; mode: 'passive' | 'scripted';
  outcome: 'playing' | 'victory' | 'defeat';
  /** Segundo de jogo do fim (ou os minutos pedidos, se a missão continua). */
  atSeconds: number;
  fired: string[];
  objectives: Record<string, ObjectiveStatus>;
  raids: { total: number; empty: number; noTarget: number };
  stepsFired: string[];
  /** Resumo do jogador 0 no fim: unidades, edifícios e Idade. */
  me: { units: number; buildings: number; age: number; alive: boolean };
  hash: number;
  error?: string;
  checks: MissionChecks;
  /** Rótulos das condições de `atEnd` que não valiam no estado final (só roteiros que as declaram). */
  endIssues?: string[];
}

/** Config de partida da missão na dificuldade pedida (mesma regra da aba Campanha: missionConfig). */
export function missionRunConfig(src: MissionSource, difficulty: CampaignDifficulty): { id: string; config: GameConfig } {
  if (typeof src === 'string') {
    const def = campaignMission(src); if (!def) throw new Error(`missão desconhecida: ${src}`);
    return { id: src, config: missionConfig(def, difficulty) };
  }
  if ('format' in src) {
    return { id: src.id, config: withCampaignDifficulty(gameConfigFor(src), difficulty) };
  }
  if (!isCampaignMission(src.id)) throw new Error(`ScenarioDef fora do registro (use o arquivo JSON): ${src.id}`);
  return { id: src.id, config: missionConfig(src, difficulty) };
}

const TITANS = Object.keys(UNITS).filter((k) => UNITS[k].tags.includes('titan'));

function runOnce(src: MissionSource, opts: MissionRunOpts & { hold?: Condition; reserve?: ScriptReserve | ScriptReserve[]; detach?: ScriptDetach; keepPowers?: string[]; atEnd?: ScriptEndCheck[] }, steps: ScriptStep[] | null): MissionRunResult {
  const difficulty = opts.difficulty ?? 'normal';
  const raids: RaidRecord[] = [];
  const checks: MissionChecks = { noException: true, noEarlyObjective: true, oneTitanEach: true, raidsSpawned: true, deterministic: true };
  let id = typeof src === 'string' ? src : src.id;
  let state: GameState | null = null;
  const stepsFired: string[] = [];
  let error: string | undefined;
  let endIssues: string[] | undefined;
  const endChecks = steps ? (opts.atEnd ?? []).map((c) => ({ ...c, test: compileCondition(c.when), held: 0 })) : [];
  setRaidObserver((r) => raids.push(r));
  try {
    const run = missionRunConfig(src, difficulty); id = run.id;
    state = createGame(run.config);
    const me = state.players[0];
    if (steps) me.ai = { difficulty: opts.playerAi ?? 'hard', nextThink: TICK_RATE * 2, lastAttack: 0, attackTarget: -1, waves: 0, rallyX: 0, rallyY: 0, defending: -1000, builderIds: [], lastExpand: 0, personality: (run.config.seed + 3) % 97 };
    const conds = (steps ?? []).map((s) => compileCondition(s.when));
    const hold = steps && opts.hold ? compileCondition(opts.hold) : null;
    // cofres (um ou vários, cada um com a sua condição): com um só, exatamente como antes
    const reserves = steps && opts.reserve ? (Array.isArray(opts.reserve) ? opts.reserve : [opts.reserve]).map((r) => ({ when: compileCondition(r.when), resources: r.resources })) : [];
    let saving = reserves.map(() => false);   // cofres ativos (reavaliados uma vez por segundo)
    let detached: number[] = [];   // destacamento (reavaliado uma vez por segundo)
    const next = (steps ?? []).map(() => 0);   // próximo segundo em que o passo pode disparar (-1 = encerrado)
    const total = Math.round(opts.minutes * 60 * TICK_RATE);
    for (let i = 0; i < total && !state.gameOver; i++) {
      const cmds: Command[] = [];
      const sec = state.tick / TICK_RATE;
      if (steps && state.tick % TICK_RATE === 0) steps.forEach((st, k) => {
        if (next[k] < 0 || sec < next[k] || !conds[k](state!)) return;
        const c = st.command(state!);
        if (c) { cmds.push(...(Array.isArray(c) ? c : [c])); if (!stepsFired.includes(st.label ?? `#${k}`)) stepsFired.push(st.label ?? `#${k}`); }
        next[k] = st.every ? sec + st.every : -1;
      });
      tick(state, cmds);
      if (hold && me.ai && state.tick % TICK_RATE === 0 && hold(state)) me.ai.lastAttack = state.tick;   // "segura" as ondas da IA do jogador
      if (reserves.length && state.tick % TICK_RATE === 0) saving = reserves.map((r) => r.when(state!));
      if (steps && opts.detach && state.tick % TICK_RATE === 0) detached = opts.detach(state);
      if (steps && me.alive && !state.gameOver) {
        // cofre: a IA pensa sem a parte guardada do estoque (não a gasta) e ela volta intacta logo depois
        const hidden: [ResourceType, number][] = [];
        reserves.forEach((rv, k) => { if (saving[k]) for (const [r, v] of Object.entries(rv.resources) as [ResourceType, number][]) { const h = Math.max(0, Math.min(me.resources[r], v)); me.resources[r] -= h; hidden.push([r, h]); } });
        // destacamento: a IA pensa sem enxergar essas unidades (como se estivessem guarnecidas) e elas voltam logo depois
        const away: Unit[] = [];
        for (const id of detached) { const u = state.units.get(id); if (u && !u.dead && u.owner === 0 && u.inside === -1) { u.inside = -2; away.push(u); } }
        // poderes guardados: a IA os vê como já usados durante o aiThink (os passos os usam na hora certa)
        const kept = opts.keepPowers ? me.powers.filter((p) => !p.used && opts.keepPowers!.includes(p.id)) : [];
        for (const p of kept) p.used = true;
        aiThink(state, me);
        for (const p of kept) p.used = false;
        for (const u of away) u.inside = -1;
        for (const [r, h] of hidden) me.resources[r] += h;
      }
      if (state.tick % TICK_RATE === 0) {
        const s = state.scenario;
        if (s && state.tick < 60 * TICK_RATE && Object.entries(s.objectives).some(([k, o]) => o === 'done' && !opts.earlyOk?.includes(k))) checks.noEarlyObjective = false;
        if (TITANS.length) {
          const n = new Map<string, number>();
          for (const u of state.units.values()) if (!u.dead && TITANS.includes(u.type)) n.set(u.type, (n.get(u.type) ?? 0) + 1);
          for (const v of n.values()) if (v > 1) checks.oneTitanEach = false;
        }
        for (const c of endChecks) if (c.seconds !== undefined && c.test(state)) c.held++;
      }
    }
    if (endChecks.length) { const end = state; endIssues = endChecks.filter((c) => (c.seconds !== undefined ? c.held < c.seconds : !c.test(end))).map((c) => c.label); }
  } catch (e) {
    checks.noException = false; error = (e as Error)?.stack ?? String(e);
  } finally { setRaidObserver(null); }
  const empty = raids.filter((r) => r.spawned === 0 && !r.noTarget).length, noTarget = raids.filter((r) => r.noTarget).length;
  checks.raidsSpawned = empty === 0 && noTarget === 0;
  const sc = state?.scenario;
  return {
    id, difficulty, mode: steps ? 'scripted' : 'passive',
    outcome: sc?.outcome ?? 'playing',
    atSeconds: state ? Math.floor(state.tick / TICK_RATE) : 0,
    fired: sc ? [...sc.fired] : [], objectives: sc ? { ...sc.objectives } : {},
    raids: { total: raids.length, empty, noTarget }, stepsFired,
    me: state ? { units: [...state.units.values()].filter((u) => u.owner === 0 && !u.dead).length, buildings: [...state.buildings.values()].filter((b) => b.owner === 0 && !b.dead).length, age: state.players[0].age, alive: state.players[0].alive } : { units: 0, buildings: 0, age: 0, alive: false },
    hash: state ? stateHash(state) : 0,
    ...(error ? { error } : {}),
    checks,
    ...(endIssues ? { endIssues } : {}),
  };
}

function withDeterminism(src: MissionSource, opts: MissionRunOpts & { hold?: Condition; reserve?: ScriptReserve | ScriptReserve[]; detach?: ScriptDetach; keepPowers?: string[]; atEnd?: ScriptEndCheck[] }, steps: ScriptStep[] | null): MissionRunResult {
  const a = runOnce(src, opts, steps);
  if (opts.deterministic === false || !a.checks.noException) return a;
  const b = runOnce(src, opts, steps);
  a.checks.deterministic = a.hash === b.hash && a.outcome === b.outcome && a.atSeconds === b.atSeconds;
  return a;
}

/** Viabilidade passiva: N minutos sem comandos do jogador 0. */
export function runPassive(src: MissionSource, opts: MissionRunOpts): MissionRunResult { return withDeterminism(src, opts, null); }

/** Jogador roteirizado: IA no jogador 0 + passos { when, command }. */
export function runScripted(src: MissionSource, opts: ScriptedRunOpts): MissionRunResult { return withDeterminism(src, opts, opts.steps); }

/** "3m12s" a partir de segundos. */
export function fmtMinSec(sec: number): string { return `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s`; }

/** Resumo no formato de §7.2: "derrota@3m12s", "vitória@18m40s" ou "em jogo@6m00s". */
export function fmtOutcome(r: MissionRunResult): string {
  return `${r.outcome === 'victory' ? 'vitória' : r.outcome === 'defeat' ? 'derrota' : 'em jogo'}@${fmtMinSec(r.atSeconds)}`;
}

/** Checagens que falharam (vazio = tudo certo). */
export function failedChecks(r: MissionRunResult): string[] { return (Object.keys(r.checks) as (keyof MissionChecks)[]).filter((k) => !r.checks[k]); }

// ---------------------------------------------------------------------------------------------------------------
// Utilidades para escrever roteiros
// ---------------------------------------------------------------------------------------------------------------

/** Ids das unidades militares (não batedores) do jogador. */
export function armyOf(state: GameState, player = 0): number[] {
  const out: number[] = [];
  for (const u of state.units.values()) if (u.owner === player && !u.dead && u.inside === -1 && UNITS[u.type].tags.includes('military') && !UNITS[u.type].tags.includes('scout')) out.push(u.id);
  return out;
}

/** Ataque-movimento de todo o exército até (x, y); null sem exército. */
export function armyAttackMove(state: GameState, x: number, y: number, player = 0): Command | null {
  const ids = armyOf(state, player);
  return ids.length ? { type: 'attackMove', player, ids, x, y } : null;
}

/** Posição de uma entidade guardada numa var/tag do cenário (vars[name]); null se não existe mais. */
export function entityPos(state: GameState, varName: string): { x: number; y: number } | null {
  const id = state.scenario?.vars[varName]; if (id === undefined) return null;
  const e = state.units.get(id) ?? state.buildings.get(id);
  return e && !e.dead ? { x: e.x, y: e.y } : null;
}

/** Primeiro edifício vivo de um tipo de um jogador (menor id). */
export function buildingPos(state: GameState, owner: number, type?: string): { x: number; y: number } | null {
  let best: { id: number; x: number; y: number } | null = null;
  for (const b of state.buildings.values()) if (b.owner === owner && !b.dead && (!type || b.type === type) && (!best || b.id < best.id)) best = { id: b.id, x: b.x, y: b.y };
  return best;
}

/** Comandos para encher as filas (até `queue` itens) dos edifícios militares e do Templo do jogador, gastando só acima de `reserve`.
 * `units`: tipos permitidos por ordem de preferência (padrão: qualquer militar treinável, da Idade mais alta primeiro). */
export function trainArmy(state: GameState, player = 0, opts: { units?: string[]; mix?: Record<string, number>; reserve?: Partial<Record<ResourceType, number>>; queue?: number } = {}): Command[] {
  const p = state.players[player]; if (!p || !p.alive) return [];
  // mix: pesos por tipo; a cada escolha vem primeiro o tipo mais abaixo da sua fatia no exército (contando as filas)
  const have: Record<string, number> = {}; let total = 0;
  if (opts.mix) {
    for (const u of state.units.values()) if (u.owner === player && !u.dead && opts.mix[u.type] !== undefined) { have[u.type] = (have[u.type] ?? 0) + 1; total++; }
    for (const b of state.buildings.values()) if (b.owner === player && !b.dead) for (const q of b.queue) if (q.kind === 'unit' && opts.mix[q.id] !== undefined) { have[q.id] = (have[q.id] ?? 0) + 1; total++; }
  }
  const wsum = opts.mix ? Object.values(opts.mix).reduce((a, b) => a + b, 0) : 1;
  const deficit = (u: string) => (opts.mix![u] / wsum) - (have[u] ?? 0) / Math.max(1, total);
  const left = { ...p.resources };
  const pop = { used: p.pop };
  const out: Command[] = [];
  const reserve = opts.reserve ?? {};
  const queued = new Set<string>();   // heróis únicos já pedidos nesta chamada
  for (const b of state.buildings.values()) {
    if (b.owner !== player || b.dead || !b.complete) continue;
    const def = BUILDINGS[b.type]; if (!def.trains || !(def.military || b.type === 'temple')) continue;
    let q = b.queue.length;
    const base = opts.mix ? Object.keys(opts.mix) : opts.units ?? [...def.trains].sort((x, y) => UNITS[y].age - UNITS[x].age);
    const options = base.filter((u) => def.trains!.includes(u) && UNITS[u].tags.includes('military') && !UNITS[u].tags.includes('scout'));
    if (opts.mix) options.sort((x, y) => deficit(y) - deficit(x));
    for (const u of options) {
      if (q >= (opts.queue ?? 2)) break;
      if (queued.has(u) || !canTrain(state, p, b, u).ok) continue;
      const cost = getUnitStats(state, p, u).cost;
      if (Object.entries(cost).some(([r, v]) => left[r as ResourceType] - (v ?? 0) < (reserve[r as ResourceType] ?? 0))) continue;
      if (pop.used + UNITS[u].pop > p.popCap) continue;
      for (const [r, v] of Object.entries(cost)) left[r as ResourceType] -= v ?? 0;
      pop.used += UNITS[u].pop; q++;
      if (UNITS[u].unique) queued.add(u);
      if (opts.mix) { have[u] = (have[u] ?? 0) + 1; total++; }
      out.push({ type: 'train', player, buildingId: b.id, unit: u });
    }
  }
  return out;
}

/** Cidadãos além da meta da IA (um humano não para em 26): cada Centro Cívico ocioso treina um, até `target` cidadãos. */
export function trainVillagers(state: GameState, target: number, player = 0): Command[] {
  const p = state.players[player]; if (!p || !p.alive) return [];
  let n = 0; for (const u of state.units.values()) if (u.owner === player && !u.dead && u.type === 'villager') n++;
  const out: Command[] = [];
  for (const b of state.buildings.values()) {
    if (n >= target) break;
    if (b.owner !== player || b.dead || !b.complete || b.type !== 'town_center' || b.queue.length > 0 || !canTrain(state, p, b, 'villager').ok) continue;
    out.push({ type: 'train', player, buildingId: b.id, unit: 'villager' }); n++;
  }
  return out;
}

/** Unidade inimiga viva mais valiosa (maior vida máxima) a até `radius` de (x, y) que satisfaz `pred`; null se não houver. */
export function enemyNear(state: GameState, x: number, y: number, radius: number, pred: (u: Unit) => boolean = () => true, player = 0): Unit | null {
  let best: Unit | null = null;
  for (const u of state.units.values()) {
    if (u.dead || u.inside !== -1 || !isEnemy(state, player, u.owner) || !pred(u)) continue;
    const dx = u.x - x, dy = u.y - y; if (dx * dx + dy * dy > radius * radius) continue;
    if (!best || u.maxHp > best.maxHp || (u.maxHp === best.maxHp && u.id < best.id)) best = u;
  }
  return best;
}

/** Unidades militares do jogador a até `radius` do edifício/unidade `targetId` passam a atacá-lo; null se não houver. */
export function focusTarget(state: GameState, targetId: number | undefined, radius: number, player = 0): Command | null {
  const t = targetId !== undefined ? state.buildings.get(targetId) ?? state.units.get(targetId) : undefined; if (!t || t.dead) return null;
  const ids = armyOf(state, player).filter((id) => { const u = state.units.get(id)!; const dx = u.x - t.x, dy = u.y - t.y; return dx * dx + dy * dy <= radius * radius && u.targetId !== t.id; });
  return ids.length ? { type: 'attack', player, ids, targetId: t.id } : null;
}

/**
 * Poderes na batalha: Raio no herói/mítica inimigo mais valioso perto do exército (a IA só o usa perto de casa) e
 * Restauração onde houver ≥ 8 militares feridos (< 60 % de vida) num raio de 8. Devolve no máximo um comando.
 */
export function battlePowers(state: GameState, player = 0): Command | null {
  const army = armyOf(state, player).map((id) => state.units.get(id)!);
  if (army.length === 0) return null;
  if (hasPower(state, 'bolt', player)) {
    let best: Unit | null = null;
    for (const u of army) { const e = enemyNear(state, u.x, u.y, 10, (x) => UNITS[x.type].tags.includes('hero') || UNITS[x.type].tags.includes('myth'), player); if (e && (!best || e.maxHp > best.maxHp)) best = e; }
    if (best) return { type: 'power', player, power: 'bolt', targetId: best.id };
  }
  if (hasPower(state, 'restoration', player)) {
    const hurt = army.filter((u) => u.hp < u.maxHp * 0.6);
    for (const h of hurt) { const n = hurt.filter((u) => (u.x - h.x) * (u.x - h.x) + (u.y - h.y) * (u.y - h.y) <= 64).length; if (n >= 8) return { type: 'power', player, power: 'restoration', x: h.x, y: h.y }; }
  }
  return null;
}

/** Tira as unidades do jogador de dentro de uma Tempestade de Raios inimiga ativa (sai pelo lado mais perto, até r + 3). */
export function dodgeStorms(state: GameState, player = 0): Command[] {
  const out: Command[] = [];
  for (const t of state.timed) {
    if (t.type !== 'lightning_storm' || t.until <= state.tick || t.x === undefined || t.y === undefined || !isEnemy(state, player, t.owner)) continue;
    const r = (t.data ?? 6) + 1;
    for (const id of armyOf(state, player)) {
      const u = state.units.get(id)!; const dx = u.x - t.x, dy = u.y - t.y; const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      const k = (r + 2) / Math.max(0.5, d);
      out.push({ type: 'move', player, ids: [id], x: t.x + (d < 0.5 ? r + 2 : dx * k), y: t.y + (d < 0.5 ? 0 : dy * k) });
    }
  }
  return out;
}

/** O poder `power` ainda está disponível para o jogador? */
export function hasPower(state: GameState, power: string, player = 0): boolean { return !!state.players[player]?.powers.some((p) => p.id === power && !p.used); }

/** Exceções explícitas de um roteiro (motivo por dificuldade). Nunca silenciosas: scripts/missions.ts lista cada uma. */
export type ScriptExceptions = Partial<Record<CampaignDifficulty, string>>;

/** Roteiro de uma missão para scripts/missions.ts: passos, duração e janela esperada de vitória (minutos, §4 ±30 %). */
export interface MissionScript {
  minutes: number; steps: ScriptStep[];
  /** Janela esperada de vitória (minutos): o tempo da §4 com ±30 %. Estrito: fora dela (ou sem vitória), scripts/missions.ts falha. */
  expect: [number, number];
  /** Nível da IA que joga pelo jogador 0 (padrão: 'hard'). */
  playerAi?: Difficulty;
  /** Enquanto valer, a IA do jogador não lança ondas de ataque (defesa); os passos continuam valendo. */
  hold?: Condition;
  /** Cofre: parte do estoque que a IA do jogador não gasta enquanto a condição valer (ScriptReserve; uma lista soma os que valem). */
  reserve?: ScriptReserve | ScriptReserve[];
  /** Destacamento: unidades que a IA do jogador não comanda (ScriptDetach); os passos as conduzem. */
  detach?: ScriptDetach;
  /** Dificuldades em que a vitória dentro da janela não é exigida, com o motivo (listadas na saída; use só depois de esforço honesto). */
  exceptions?: ScriptExceptions;
  /** Objetivos que um jogador cumpre legitimamente antes de 60 s (ex.: a colônia da m4 com 5 construtores); a checagem (d) os ignora. */
  earlyOk?: string[];
  /**
   * Poderes que a IA do jogador não usa (ela os vê como já usados durante o aiThink; o estado não muda fora dele): ficam para os
   * passos, que os usam na hora que um jogador usaria (ex.: o Oráculo da m7 aos 150 s, e não no 2º segundo). Sem o campo, nada muda.
   */
  keepPowers?: string[];
  /**
   * Condições conferidas no fim do roteiro, além da janela (ScriptEndCheck: no estado final ou por N segundos da partida; ex.: na
   * m8, Oceano atacando por ao menos 25 s — prova que o chefe lutou, coisa que a janela não discrimina, porque o relógio das
   * marés já põe a vitória mais rápida perto dela). scriptVerdict falha com o rótulo de cada uma que não valer.
   */
  atEnd?: ScriptEndCheck[];
  /** Outros caminhos medidos da mesma missão (ex.: a escolta sem trégua da m5), cada um com a própria janela; scripts/missions.ts roda todos. */
  variants?: MissionVariant[];
}

/**
 * Variante de um roteiro: outro caminho para a vitória, estrito como o principal (vitória dentro da própria `expect`) e com
 * gatilhos que precisam ter disparado (`fired`) ou não (`notFired`) até o fim — é o que prova que o caminho é mesmo o anunciado.
 */
export interface MissionVariant extends Omit<MissionScript, 'variants'> { label: string; fired?: string[]; notFired?: string[] }

/** Problemas de uma variante além da janela: gatilhos exigidos que não dispararam e proibidos que dispararam. */
export function variantIssues(r: MissionRunResult, v: MissionVariant): string[] {
  return [...(v.fired ?? []).filter((id) => !r.fired.includes(id)).map((id) => `gatilho '${id}' não disparou`),
    ...(v.notFired ?? []).filter((id) => r.fired.includes(id)).map((id) => `gatilho '${id}' disparou`)];
}

/** Veredito de um roteiro: ok (vitória dentro da janela), exceção declarada ou falha com o motivo. */
export interface ScriptVerdict { ok: boolean; inWindow: boolean; exception?: string; reason?: string }

/** Estrito por padrão: exige vitória dentro de `expect`; só uma exceção declarada para a dificuldade dispensa (e é informada). */
export function scriptVerdict(r: MissionRunResult, script: MissionScript | undefined): ScriptVerdict {
  if (!script) return { ok: false, inWindow: false, reason: 'missão sem roteiro em MISSION_SCRIPTS' };
  const [lo, hi] = script.expect;
  const inWindow = r.outcome === 'victory' && r.atSeconds >= lo * 60 && r.atSeconds <= hi * 60;
  const missing = r.endIssues ?? [];
  if (inWindow && !missing.length) return { ok: true, inWindow };
  const reason = r.outcome !== 'victory' ? `${fmtOutcome(r)}: sem vitória dentro de ${script.minutes} min`
    : !inWindow ? `${fmtOutcome(r)}: vitória fora da janela ${fmtMinSec(Math.round(lo * 60))}–${fmtMinSec(Math.round(hi * 60))}`
    : `${fmtOutcome(r)}: no fim não vale ${missing.map((m) => `'${m}'`).join(', ')}`;
  const exception = script.exceptions?.[r.difficulty];
  return exception ? { ok: true, inWindow, exception, reason } : { ok: false, inWindow, reason };
}

/** Roda o roteiro de uma missão (MISSION_SCRIPTS) numa dificuldade, com as opções do roteiro (ou de uma variante dele, pelo rótulo). */
export function runMissionScript(id: string, difficulty: CampaignDifficulty, deterministic = false, variant?: string): MissionRunResult {
  const main = MISSION_SCRIPTS[id];
  const sc: MissionScript | undefined = variant === undefined ? main : main?.variants?.find((v) => v.label === variant);
  if (variant !== undefined && !sc) throw new Error(`variante desconhecida: ${id}/${variant}`);
  return runScripted(id, { minutes: sc?.minutes ?? 30, difficulty, steps: sc?.steps ?? [], deterministic, playerAi: sc?.playerAi, hold: sc?.hold, earlyOk: sc?.earlyOk, reserve: sc?.reserve, detach: sc?.detach, keepPowers: sc?.keepPowers, atEnd: sc?.atEnd });
}

/**
 * Validação estática de uma missão do registro (TS ou JSON). JSON: validateScenario sem erros e lint sem avisos. Todas: o
 * ScenarioDef compila/existe com o mesmo id, objetivos e gatilhos com ids únicos, config válida pelo mesmo validador dos
 * arquivos (jogadores, deuses, times explícitos, `puppet` coerente e lint de humano sem marionete) e roteiro de teste.
 */
export function staticMissionIssues(e: CampaignEntry): string[] {
  const out: string[] = [];
  if (e.source === 'json') {
    if (!e.file) return ['arquivo JSON ausente no registro'];
    for (const i of validateScenario(e.file, { allowReserved: true, warnings: true })) out.push(`${i.level === 'warn' ? '(lint) ' : ''}${i.path}: ${i.message}`);
    if (e.file.id !== e.id) out.push(`id do arquivo '${e.file.id}' diferente do registro '${e.id}'`);
  }
  let def: ScenarioDef | undefined;
  try { def = campaignMission(e.id); } catch (err) { out.push(`não compila: ${(err as Error).message}`); return out; }
  if (!def) return [...out, 'campaignMission devolveu undefined'];
  if (def.id !== e.id) out.push(`ScenarioDef com id '${def.id}'`);
  const dup = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
  for (const id of dup(def.objectives.map((o) => o.id))) out.push(`objetivo duplicado: '${id}'`);
  for (const id of dup(def.triggers.map((t) => t.id))) out.push(`gatilho duplicado: '${id}'`);
  if (e.source === 'ts') {
    // a config do TS passa pelo mesmo validador (e lint) dos arquivos, num arquivo mínimo
    const c = def.config;
    const shell: ScenarioFile = { format: 'aoe-scenario', version: 1, id: e.id, title: def.title, intro: def.intro, objectives: [], triggers: [], victory: { time: { gte: 1 } },
      config: { seed: c.seed, players: c.players, ...(c.startingAge !== undefined ? { startingAge: c.startingAge } : {}), ...(c.startingResources ? { startingResources: c.startingResources } : {}), ...(c.startKit !== undefined ? { startKit: c.startKit } : {}), ...(c.mode ? { mode: c.mode } : {}) } };
    for (const i of validateScenario(shell, { allowReserved: true, warnings: true })) out.push(`${i.level === 'warn' ? '(lint) ' : ''}config ${i.path}: ${i.message}`);
    c.players.forEach((p, i) => { if (p.team === undefined) out.push(`config.players[${i}] sem team explícito`); });
    for (const o of def.objectives) if (!o.text) out.push(`objetivo '${o.id}' sem texto`);
  }
  if (!MISSION_SCRIPTS[e.id]) out.push('sem roteiro em MISSION_SCRIPTS');
  return out;
}

/** m2: composição do exército (pesos): infantaria pesada e míticas na frente, arqueiros atrás, cavalaria contra as catapultas. */
const M2_MIX: Record<string, number> = { jason: 1, odysseus: 1, minotaur: 3, hypaspist: 4, hoplite: 4, toxotes: 3, cretan_archer: 3, hippeus: 1, hetairoi: 1, petrobolos: 1 };

/** Militares vivos (não batedores) de um jogador. */
export function militaryCount(state: GameState, player: number): number { return armyOf(state, player).length; }

/**
 * m2: contra-ataque por vantagem, como um jogador faria — avança contra o Centro Cívico original quando o exército tem
 * ≥ 30 militares e ≥ 2,5 × os da Legião (logo depois de uma onda dela quebrar nas nossas defesas); manda só quem está
 * ocioso ou longe do alvo (sem atropelar quem já está lutando). Com o CC alvo a ≤ 25 % da vida, quem sobrou vai terminá-lo
 * sem esperar a vantagem (no Difícil, depois da correção do viés de posição, o 1º assalto o deixava com 110 de vida e o
 * exército refeito nunca voltava a ter 2,5 × o da Legião).
 */
function m2Counter(state: GameState): Command | null {
  const ours = militaryCount(state, 0), theirs = militaryCount(state, 1);
  const id = state.scenario?.vars.targetTc; const b = id !== undefined ? state.buildings.get(id) : undefined; if (!b || b.dead) return null;
  const finish = b.hp <= b.maxHp * 0.25 && ours >= 5;
  if (!finish && (ours < 30 || ours < 2.5 * theirs)) return null;
  const ids = armyOf(state).filter((uid) => { const u = state.units.get(uid)!; const dx = u.x - b.x, dy = u.y - b.y; return u.state === 'idle' || (dx * dx + dy * dy > 25 * 25 && u.state !== 'attack'); });
  return ids.length ? { type: 'attackMove', player: 0, ids, x: b.x, y: b.y } : null;
}

/**
 * Cidadãos do jogador 0 com um militar inimigo a ≤ r tiles vão para o abrigo com vaga mais perto (Centro Cívico, fortaleza,
 * torre), como um jogador faria numa invasão; a IA do jogador os solta 20 s depois da última ameaça. Um comando por abrigo.
 */
export function shelterVillagers(state: GameState, r: number): Command[] {
  const foes = [...state.units.values()].filter((u) => !u.dead && u.inside === -1 && isEnemy(state, 0, u.owner) && UNITS[u.type].tags.includes('military'));
  if (!foes.length) return [];
  const shelters = [...state.buildings.values()].filter((b) => b.owner === 0 && !b.dead && b.complete && (BUILDINGS[b.type].garrison ?? 0) > 0);
  const room = new Map(shelters.map((b) => [b.id, (BUILDINGS[b.type].garrison ?? 0) - b.garrison.length]));
  const by = new Map<number, number[]>();
  for (const v of state.units.values()) {
    if (v.owner !== 0 || v.dead || v.inside !== -1 || v.type !== 'villager' || v.order?.type === 'garrison') continue;
    if (!foes.some((f) => (f.x - v.x) * (f.x - v.x) + (f.y - v.y) * (f.y - v.y) <= r * r)) continue;
    let best: Building | null = null, bd = Infinity;
    for (const b of shelters) { if ((room.get(b.id) ?? 0) <= 0) continue; const d = (b.x - v.x) * (b.x - v.x) + (b.y - v.y) * (b.y - v.y); if (d < bd) { bd = d; best = b; } }
    if (!best) continue;
    room.set(best.id, room.get(best.id)! - 1);
    const list = by.get(best.id) ?? []; list.push(v.id); by.set(best.id, list);
  }
  return [...by].map(([targetId, ids]) => ({ type: 'garrison' as const, player: 0, ids, targetId }));
}

/**
 * m2: quem já chegou perto do Centro Cívico alvo bate nele (o ataque-movimento se distrai com a Fortaleza e as casas) — mas só
 * quando restam ≤ 4 militares da Legião a 15 tiles dele; com mais defensores (a Legião volta com Aquiles e os mirmidões), quem
 * estava no CC volta ao ataque-movimento e luta com eles, como um jogador faria. Bater no CC com a Legião inteira em volta
 * custava o contra-ataque: no Difícil, depois da correção do viés de posição (IA relativa ao centro do mapa, 09/2026), 64
 * militares × 19 viravam derrota aos 19m58s.
 */
function m2Siege(state: GameState): Command | null {
  const id = state.scenario?.vars.targetTc; const b = id !== undefined ? state.buildings.get(id) : undefined; if (!b || b.dead) return null;
  const defenders = armyOf(state, 1).filter((uid) => { const u = state.units.get(uid)!; return (u.x - b.x) * (u.x - b.x) + (u.y - b.y) * (u.y - b.y) <= 15 * 15; }).length;
  if (defenders <= 4) return focusTarget(state, b.id, 22);
  const onTc = armyOf(state).filter((uid) => state.units.get(uid)!.targetId === b.id);
  return onTc.length ? { type: 'attackMove', player: 0, ids: onTc, x: b.x, y: b.y } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// m4 "O Fogo do Cáucaso": expedição sem cidade (colônia no Vale da Cólquida) e as três correntes em sequência
// ---------------------------------------------------------------------------------------------------------------

/** m4: composição do exército (pesos): infantaria pesada na frente, arqueiros atrás, Minotauros de Atena e petróbolos contra as torres. */
const M4_MIX: Record<string, number> = { hypaspist: 4, hoplite: 2, cretan_archer: 3, toxotes: 2, minotaur: 2, manticore: 1, petrobolos: 1, hetairoi: 1 };
/** m4: o CC da colônia (canto do 3×3 centrado em [48,84], como pede a ficha) e o da 2ª cidade no vale lateral ([20,96]). */
const M4_COLONY = { tx: 47, ty: 83 }, M4_SECOND = { tx: 19, ty: 95 };
/**
 * m4: militares para começar o assalto a uma corrente — o mesmo em todas as dificuldades (estado do jogo, não relógio: o tempo
 * medido é o ritmo real da economia e das lutas). Com 26–28 o Normal perdia a colônia; com 45 e 50 o Fácil vencia aos 16m13s
 * e 16m51s (abaixo da janela); 55 é quase 5× o exército do desembarque.
 */
const M4_ASSAULT_ARMY = 55;
/** m4: as correntes na ordem do desfiladeiro. */
const M4_CHAINS = ['corrente1', 'corrente2', 'corrente3'] as const;

/** Pesquisa possível agora (roteiros): mesma regra do comando 'research'. */
function canResearchNow(state: GameState, buildingId: number, tech: string): boolean {
  const b = state.buildings.get(buildingId); return !!b && !b.dead && canResearch(state, state.players[0], b, tech).ok;
}

/** Héracles (tag 'heracles'): se cair, a missão está perdida. */
function m4Heracles(state: GameState): Unit | null { const id = state.scenario?.vars['#heracles']; const u = id !== undefined ? state.units.get(id) : undefined; return u && !u.dead ? u : null; }

/** Exército de assalto da m4: todos os militares menos Héracles (se ele cair, a missão está perdida; fica na colônia). */
function m4Army(state: GameState): number[] {
  const h = m4Heracles(state);
  return armyOf(state).filter((id) => !h || id !== h.id);
}

/** Ataque-movimento do exército da m4 (e de Prometeu, quando livre) até a entidade da tag; perto dela, todos a atacam. */
function m4Assault(state: GameState, tag: string, focusRadius = 10): Command[] {
  const p = entityPos(state, '#' + tag); if (!p) return [];
  const ids = m4Army(state); if (!ids.length) return [];
  const out: Command[] = [{ type: 'attackMove', player: 0, ids, x: p.x, y: p.y }];
  const f = focusTarget(state, state.scenario?.vars['#' + tag], focusRadius); if (f) out.push(f);
  return out;
}

/** m4: torres na saída do desfiladeiro (a única entrada do vale por terra), onde chegam as ondas do Culto e as vinganças. */
const M4_CHOKE_TOWERS: [number, number][] = [[43, 73], [40, 75], [46, 72]];

/** Uma torre por vez na saída do desfiladeiro (até 3), com o cidadão mais perto, quando há madeira e ouro. */
function m4ChokeTower(state: GameState): Command | null {
  const p = state.players[0]; if (p.resources.wood < 130 || p.resources.gold < 70) return null;
  const busy = [...state.buildings.values()].some((b) => b.owner === 0 && !b.dead && b.type === 'tower' && !b.complete);
  if (busy) return null;
  const spot = M4_CHOKE_TOWERS.find(([x, y]) => canPlaceBuilding(state, p, 'tower', x, y).ok);
  if (!spot) return null;
  let best: Unit | null = null, bd = Infinity;
  for (const u of state.units.values()) {
    if (u.owner !== 0 || u.dead || u.type !== 'villager' || u.inside !== -1 || u.state === 'build') continue;
    const d = (u.x - spot[0]) * (u.x - spot[0]) + (u.y - spot[1]) * (u.y - spot[1]); if (d < bd) { bd = d; best = u; }
  }
  return best ? { type: 'build', player: 0, ids: [best.id], building: 'tower', tx: spot[0], ty: spot[1] } : null;
}

/** Madeira em falta com ouro sobrando (a IA poupa para a Idade e trava as construções): 3 mineiros vão cortar lenha. */
function m4Wood(state: GameState): Command[] {
  const p = state.players[0]; if (p.resources.wood >= 150 || p.resources.gold < 600) return [];
  const tc = buildingPos(state, 0, 'town_center'); if (!tc) return [];
  const tree = nearestNode(state, tc.x, tc.y, 'wood', 30); if (!tree) return [];
  const miners = [...state.units.values()].filter((u) => u.owner === 0 && !u.dead && u.type === 'villager' && (u.state === 'gather' || u.state === 'return') && u.nodeId > 0 && state.map.nodes.get(u.nodeId)?.type === 'gold').slice(0, 3);
  return miners.length ? [{ type: 'gather', player: 0, ids: miners.map((u) => u.id), targetId: tree.id }] : [];
}

/** Militares do exército de assalto a até `r` tiles de (x, y). */
function m4ArmyNear(state: GameState, x: number, y: number, r: number): number {
  return m4Army(state).filter((id) => { const u = state.units.get(id)!; return (u.x - x) * (u.x - x) + (u.y - y) * (u.y - y) <= r * r; }).length;
}

/**
 * Corrente sob assalto agora (a próxima de pé, na ordem): começa com ≥ M4_ASSAULT_ARMY militares e continua enquanto ≥ 10
 * deles estiverem nela (histerese: as baixas do assalto não fazem o exército recuar no meio); null fora de assalto.
 */
function m4AssaultTarget(state: GameState): string | null {
  const next = M4_CHAINS.find((t) => entityPos(state, '#' + t)); if (!next) return null;
  if (militaryCount(state, 0) >= M4_ASSAULT_ARMY) return next;
  const p = entityPos(state, '#' + next)!;
  return m4ArmyNear(state, p.x, p.y, 16) >= 10 ? next : null;
}

/** m4: onde o exército espera no platô 3 enquanto Héracles sobe para a Águia (a 15 tiles dela, fora da visão das duas partes). */
const M4_STAGE = { x: 40, y: 31 };
/** m4: retaguarda do assalto à corrente3 (na trilha do platô 2, a 13 tiles da torre e a 18 do Templo): onde Héracles espera. */
const M4_REAR = { x: 50, y: 36 };

/** Distância² entre uma unidade e um ponto. */
const m4D2 = (u: { x: number; y: number }, p: { x: number; y: number }) => (u.x - p.x) * (u.x - p.x) + (u.y - p.y) * (u.y - p.y);

/**
 * m4: caça à Águia no Fácil — herói contra mítica, a mecânica cobrada pela ficha. Lá o platô 3 não tem guardas nem vingança:
 * na corrente3 Héracles sai do CC quando o exército já está nela e espera na retaguarda (M4_REAR); livre Prometeu, com ≥ 45 %
 * de vida, sobe ao Rochedo e ataca a Águia, com o exército de escolta. No Normal/Difícil ele fica guarnecido o tempo todo: com
 * ele no front (350 de vida), o Difícil o deixava com 18 %, e a vingança da corrente3, que nasce perto dele, o pegava sozinho
 * a caminho (derrota) — por isso lá as vinganças chegam pelo vale (§7.2). true = Héracles está (ou deve ir) lá fora.
 */
function m4HeroOut(state: GameState): boolean {
  const h = m4Heracles(state); if (!h || state.config.campaignDifficulty !== 'easy') return false;
  if (!state.scenario?.fired.includes('libertado')) {
    const c3 = entityPos(state, '#corrente3');
    return !!c3 && m4AssaultTarget(state) === 'corrente3' && h.hp >= h.maxHp * 0.6 && m4ArmyNear(state, c3.x, c3.y, 16) >= 10;
  }
  return m4Hunting(state);
}

/** Fácil, livre Prometeu e viva a Águia: Héracles, fora do vale (subiu para a corrente3) e com ≥ 45 % de vida, a caça. */
function m4Hunting(state: GameState): boolean {
  const h = m4Heracles(state);
  return !!h && state.config.campaignDifficulty === 'easy' && !!state.scenario?.fired.includes('libertado') && !!entityPos(state, '#aguia') && h.inside === -1 && h.y < 66 && h.hp >= h.maxHp * 0.45;
}

/** Héracles na corrente3 (sai do CC e vai à retaguarda) e, livre Prometeu, contra a Águia. */
function m4HeroMove(state: GameState): Command | null {
  const h = m4Heracles(state); if (!h || !m4HeroOut(state)) return null;
  if (h.inside !== -1) return { type: 'ungarrison', player: 0, buildingId: h.inside };
  const eagleId = state.scenario?.vars['#aguia'];
  if (m4Hunting(state) && eagleId !== undefined) return h.targetId === eagleId ? null : { type: 'attack', player: 0, ids: [h.id], targetId: eagleId };
  return m4D2(h, M4_REAR) > 3 * 3 ? { type: 'move', player: 0, ids: [h.id], x: M4_REAR.x, y: M4_REAR.y } : null;
}

/**
 * Livre Prometeu: durante a caça, o exército (sem Prometeu, que espera onde nasceu) derruba o Templo do platô 3 (fim do
 * atrito) e espera Héracles; com ele a até 16 tiles da Águia, sobe junto. Depois, todos (e Prometeu) contra a Fortaleza.
 */
function m4Fortress(state: GameState): Command[] {
  if (m4Hunting(state)) {
    const h = m4Heracles(state)!, eagle = entityPos(state, '#aguia')!;
    const prom = state.scenario?.vars['#prometeu'];
    const ids = m4Army(state).filter((id) => id !== prom); if (!ids.length) return [];
    if (m4D2(h, eagle) <= 16 * 16) return [{ type: 'attackMove', player: 0, ids, x: eagle.x, y: eagle.y }];
    const temple = [...state.buildings.values()].find((b) => b.owner === 2 && !b.dead && b.type === 'temple' && m4D2(b, M4_STAGE) <= 10 * 10);
    return [temple ? { type: 'attack', player: 0, ids, targetId: temple.id } : { type: 'move', player: 0, ids, x: M4_STAGE.x, y: M4_STAGE.y }];
  }
  return m4Assault(state, 'fortaleza_culto', 12);
}

/** Militares no desfiladeiro (acima do vale, y < 66) fora de um assalto voltam ao norte do vale. */
function m4Regroup(state: GameState): Command | null {
  const ids = m4Army(state).filter((id) => state.units.get(id)!.y < 66);
  return ids.length ? { type: 'move', player: 0, ids, x: 46, y: 78 } : null;
}

/**
 * Héracles fica guarnecido no Centro Cívico da colônia (a IA do jogador libera as guarnições 20 s depois de cada ameaça; o
 * roteiro o põe de volta): se ele cair, a missão está perdida, e as invasões de vingança das correntes vêm atrás dele.
 */
function m4HeroCare(state: GameState): Command | null {
  const h = m4Heracles(state); if (!h || h.inside !== -1 || m4HeroOut(state)) return null;
  const tc = [...state.buildings.values()].filter((b) => b.owner === 0 && !b.dead && b.complete && b.type === 'town_center' && b.garrison.length < (BUILDINGS[b.type].garrison ?? 0)).sort((a, b) => a.id - b.id)[0];
  return tc ? { type: 'garrison', player: 0, ids: [h.id], targetId: tc.id } : null;
}

/** Cidadãos vivos do jogador fora de edifícios, do mais perto ao mais longe de (x, y) (desempate por id). */
function villagersNear(state: GameState, x: number, y: number, player = 0): Unit[] {
  const out: Unit[] = [];
  for (const u of state.units.values()) if (u.owner === player && !u.dead && u.inside === -1 && u.type === 'villager') out.push(u);
  const d = (u: Unit) => (u.x - x) * (u.x - x) + (u.y - y) * (u.y - y);
  return out.sort((a, b) => d(a) - d(b) || a.id - b.id);
}

/** Edifício vivo do tipo `type` do jogador (o de menor id, em obra ou não); null se não houver. */
function firstBuilding(state: GameState, type: string, player = 0): Building | null {
  let best: Building | null = null;
  for (const b of state.buildings.values()) if (b.owner === player && !b.dead && b.type === type && (!best || b.id < best.id)) best = b;
  return best;
}

/**
 * m6: ergue a Estátua de Zeus perto do Centro Cívico com `builders` cidadãos quando houver recursos e pelo menos `minArmy`
 * militares para guardá-la, como um jogador cauteloso (a obra chama o Colosso e a Frota; a IA do jogador só ergueria a
 * Maravilha da própria "personalidade", e bem mais tarde). null enquanto faltar exército, recurso, local ou Centro Cívico.
 */
function m6Statue(state: GameState, builders: number, minArmy: number): Command | null {
  const p = state.players[0];
  if (militaryCount(state, 0) < minArmy) return null;
  const tc = [...state.buildings.values()].find((b) => b.owner === 0 && !b.dead && b.complete && b.type === 'town_center'); if (!tc) return null;
  if (!canAfford(p, getBuildingStats(state, p, 'wonder_zeus').cost)) return null;
  const spot = findBuildSpot(state, p, 'wonder_zeus', tc.x, tc.y, 4, 14); if (!spot) return null;
  const ids = villagersNear(state, spot.x + 2, spot.y + 2).slice(0, builders).map((u) => u.id);
  return ids.length ? { type: 'build', player: 0, ids, building: 'wonder_zeus', tx: spot.x, ty: spot.y } : null;
}

/** m6: mantém `n` cidadãos na obra ou no reparo da Estátua enquanto ela estiver em obra ou ferida (os mais perto dela). */
function m6Repair(state: GameState, n: number): Command | null {
  const w = firstBuilding(state, 'wonder_zeus'); if (!w || (w.complete && w.hp >= w.maxHp)) return null;
  const near = villagersNear(state, w.x, w.y);
  const working = near.filter((u) => u.state === 'build' && u.targetId === w.id).length;
  if (working >= n) return null;
  const ids = near.filter((u) => u.targetId !== w.id).slice(0, n - working).map((u) => u.id);
  return ids.length ? { type: 'repair', player: 0, ids, targetId: w.id } : null;
}

/** m6: até `n` torres a até 9 tiles da Estátua (lado do mar primeiro: sudeste, sul, leste…), uma por chamada, com recurso de sobra. */
function m6Towers(state: GameState, n: number): Command | null {
  const w = firstBuilding(state, 'wonder_zeus'); if (!w) return null;
  const p = state.players[0];
  let have = 0;
  for (const b of state.buildings.values()) if (b.owner === 0 && !b.dead && b.type === 'tower' && (b.x - w.x) * (b.x - w.x) + (b.y - w.y) * (b.y - w.y) <= 81) have++;
  if (have >= n) return null;
  const cost = getBuildingStats(state, p, 'tower').cost;
  if (p.resources.wood < (cost.wood ?? 0) + 150 || p.resources.gold < (cost.gold ?? 0) + 100) return null;
  const dirs: [number, number][] = [[1, 1], [0, 1], [1, 0], [-1, 1], [1, -1], [-1, 0]];
  const [dx, dy] = dirs[have % dirs.length];
  const spot = findBuildSpot(state, p, 'tower', w.x + dx * 5, w.y + dy * 5, 0, 3); if (!spot) return null;
  const v = villagersNear(state, spot.x, spot.y).find((u) => !(u.state === 'build' && u.targetId === w.id)); if (!v) return null;
  return { type: 'build', player: 0, ids: [v.id], building: 'tower', tx: spot.x, ty: spot.y };
}

/** m6: militares a mais de `radius` tiles da Estátua (ou do Centro Cívico, antes dela) voltam a ela em ataque-movimento. */
function m6Home(state: GameState, radius: number): Command | null {
  const home = firstBuilding(state, 'wonder_zeus') ?? firstBuilding(state, 'town_center'); if (!home) return null;
  const ids = armyOf(state).filter((id) => { const u = state.units.get(id)!; const dx = u.x - home.x, dy = u.y - home.y; return dx * dx + dy * dy > radius * radius; });
  return ids.length ? { type: 'attackMove', player: 0, ids, x: home.x, y: home.y } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// m5 "O Hóspede de Ítaca": escolta de Odisseu da praia de Náuplia até Argos
// ---------------------------------------------------------------------------------------------------------------

/** m5: a Via Sagrada, da praia de Náuplia ao Centro Cívico de Argos (margem leste do vau sul → margem oeste → Heraion → pé da colina). */
const M5_ROUTE: [number, number][] = [[108, 97], [72, 81], [57, 74], [56, 62], [40, 44], [32, 34], [25, 26]];
/** m5: o pé da colina de Argos (fora do raio da vitória), onde Odisseu espera os náufragos que ainda estão na estrada. */
const M5_FOOT = { x: 32, y: 34 };
/** m5: o posto na praia — Odisseu junto ao casco, os náufragos atrás dele e a escolta entre os dois e o nordeste (de onde vem a caça). */
const M5_POST = { x: 113, y: 99 }, M5_SCREEN = { x: 116, y: 95 }, M5_HUDDLE = { x: 110, y: 100 };
/** m5: o posto da guarda do Heraion (a leste do templo, na Via Sagrada) e o mínimo de militares nele. */
const M5_HERAION_POST = { x: 55, y: 60 }, M5_HERAION_GUARD = 10;
/**
 * m5: tamanho da guarda do Heraion — o mínimo ou 80 % do exército da Liga, o que for maior (quem joga olha o exército dela: o
 * Heraion é o 1º alvo de cada onda). Com a IA relativa ao centro do mapa (26/09/2026), a Liga (canto nordeste) deixou de perder
 * tempo com casas e kit mal orientados e, no Difícil, passa do limiar de onda da Idade Heroica (16 × 1,3 = 21 militares) antes
 * de juntar para a Mítica: a 1ª onda chega aos ~7 min (~13 hipaspistas e 4 arqueiros), não aos ~10,5 min depois da Mítica; com a
 * guarda fixa de 10 o Heraion caía aos 7m55s e Argos aos 11m35s.
 */
function m5HeraionGuardSize(state: GameState): number { return Math.max(M5_HERAION_GUARD, Math.ceil(0.8 * militaryCount(state, 1))); }
/** m5: coluna a partir da qual (x maior) um militar de Argos está "em campo", na margem leste do Ínaco. */
const M5_EAST_BANK = 67;

const m5D2 = (u: { x: number; y: number }, p: { x: number; y: number }) => (u.x - p.x) * (u.x - p.x) + (u.y - p.y) * (u.y - p.y);

/** Unidades vivas de uma tag do cenário (o grupo inteiro, fora de edifícios ou não). */
function tagUnits(state: GameState, tag: string): Unit[] {
  return tagIds(state, tag).map((id) => state.units.get(id)).filter((u): u is Unit => !!u && !u.dead);
}
/** Odisseu (tag 'odisseu'), se vivo. */
function m5Odysseus(state: GameState): Unit | null { return tagUnits(state, 'odisseu')[0] ?? null; }

/**
 * Escolta da m5: os militares que o mapa dá a Argos (ids anteriores ao de Odisseu, que nasce no setup), quem já cruzou para a
 * margem leste do Ínaco (reforços a caminho da praia) e, fora de Argos, quem estiver a até 10 tiles dele. Sem Odisseu, ninguém.
 */
function m5Escort(state: GameState): Unit[] {
  const o = m5Odysseus(state); if (!o) return [];
  const out: Unit[] = [];
  for (const u of state.units.values()) {
    if (u.owner !== 0 || u.dead || u.id === o.id || !military(u)) continue;
    if (u.id < o.id || u.x > M5_EAST_BANK || (o.x > 45 && m5D2(u, o) <= 100)) out.push(u);
  }
  return out;
}

/** Guarda do Heraion: militares de casa (fora da escolta) a até 9 tiles do posto dela. */
function m5HeraionGuard(state: GameState): Unit[] {
  const esc = new Set(m5Escort(state).map((u) => u.id));
  return armyOf(state).map((id) => state.units.get(id)!).filter((u) => !esc.has(u.id) && u.type !== 'odysseus' && m5D2(u, M5_HERAION_POST) <= 81);
}

/** Exército de casa: militares vivos fora de edifícios que não são a escolta, a guarda do Heraion nem Odisseu. */
function m5HomeArmy(state: GameState): Unit[] {
  const skip = new Set([...m5Escort(state), ...m5HeraionGuard(state)].map((u) => u.id)); const o = m5Odysseus(state);
  return armyOf(state).map((id) => state.units.get(id)!).filter((u) => !skip.has(u.id) && (!o || u.id !== o.id));
}

/**
 * Próximo ponto da Via Sagrada para quem está em (x, y), rumo a Argos (home = true) ou à praia: o fim do trecho mais próximo no
 * sentido da viagem (sem estado: só a posição). Perto do fim do trecho, já mira o seguinte (não para em cada ponto).
 */
function m5Next(x: number, y: number, home = true): { x: number; y: number } {
  const route = home ? M5_ROUTE : [...M5_ROUTE].reverse();
  let best = 1, bd = Infinity;
  for (let i = 0; i + 1 < route.length; i++) {
    const [ax, ay] = route[i], [bx, by] = route[i + 1];
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    let t = ((x - ax) * vx + (y - ay) * vy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (ax + vx * t), dy = y - (ay + vy * t), d = dx * dx + dy * dy;
    if (d < bd - 1e-9) { bd = d; best = i + 1; }
  }
  const [nx, ny] = route[best];
  if (best + 1 < route.length && (x - nx) * (x - nx) + (y - ny) * (y - ny) < 16) best++;
  return { x: route[best][0], y: route[best][1] };
}

/** Náufragos vivos ainda na estrada (a mais de 8 tiles do Centro Cívico, o raio do objetivo). */
function m5CastawaysOut(state: GameState): Unit[] {
  const tc = buildingPos(state, 0, 'town_center');
  return tagUnits(state, 'naufragos').filter((u) => u.inside === -1 && (!tc || m5D2(u, tc) > 64));
}

/** O objetivo dos náufragos desta dificuldade (4 no Fácil/Normal, os 6 no Difícil) ainda está pendente? */
function m5CastawaysPending(state: GameState): boolean {
  const o = state.scenario?.objectives; if (!o) return false;
  return (state.config.campaignDifficulty === 'hard' ? o.naufragos_todos : o.naufragos) === 'pending';
}

/** Destacamento: Odisseu, os náufragos (até a vitória: a IA os mandaria coletar longe do Centro Cívico), a escolta (até a vitória) e a guarda do Heraion. */
function m5Detach(state: GameState): number[] {
  const out: number[] = [];
  const o = m5Odysseus(state); if (o) out.push(o.id);
  if (state.scenario?.objectives.escolta === 'pending') for (const u of tagUnits(state, 'naufragos')) out.push(u.id);
  if (state.scenario?.objectives.escolta === 'pending') for (const u of m5Escort(state)) out.push(u.id);
  for (const u of m5HeraionGuard(state)) out.push(u.id);
  return out;
}

/** Ida: quem da escolta ainda não está no posto segue a Via Sagrada até a praia em marcha (move: não se desvia para caçar). */
function m5Outbound(state: GameState): Command[] {
  const o = m5Odysseus(state); if (!o) return [];
  const out: Command[] = [];
  for (const u of m5Escort(state)) {
    if (u.inside !== -1 || m5D2(u, o) <= 100) continue;
    const p = m5D2(u, o) <= 400 ? M5_SCREEN : m5Next(u.x, u.y, false);
    out.push({ type: 'move', player: 0, ids: [u.id], x: p.x, y: p.y });
  }
  return out;
}

/** Posto na praia: Odisseu junto ao casco, os náufragos atrás dele e a escolta ociosa de volta à frente (lado nordeste). */
function m5Post(state: GameState): Command[] {
  const o = m5Odysseus(state); if (!o) return [];
  const out: Command[] = [];
  if (o.state === 'idle' && m5D2(o, M5_POST) > 4) out.push({ type: 'move', player: 0, ids: [o.id], x: M5_POST.x, y: M5_POST.y });
  const cast = tagUnits(state, 'naufragos').filter((u) => u.state === 'idle' && m5D2(u, M5_HUDDLE) > 9).map((u) => u.id);
  if (cast.length) out.push({ type: 'move', player: 0, ids: cast, x: M5_HUDDLE.x, y: M5_HUDDLE.y });
  const esc = m5Escort(state).filter((u) => u.state === 'idle' && m5D2(u, o) <= 400 && m5D2(u, M5_SCREEN) > 16).map((u) => u.id);
  if (esc.length) out.push({ type: 'attackMove', player: 0, ids: esc, x: M5_SCREEN.x, y: M5_SCREEN.y });
  return out;
}

/** Odisseu atira de onde está (postura defensiva: não corre atrás da caça) e, ferido, recebe a Restauração de Atena. */
function m5Care(state: GameState): Command | null {
  const o = m5Odysseus(state); if (!o) return null;
  if (o.stance !== 'defensive') return { type: 'stance', player: 0, ids: [o.id], stance: 'defensive' };
  if (o.hp < o.maxHp * 0.5 && hasPower(state, 'restoration')) return { type: 'power', player: 0, power: 'restoration', x: o.x, y: o.y };
  return null;
}

/** Reforço da praia: com menos de `size` na escolta (junto de Odisseu ou a caminho), até 8 militares de casa cruzam o vau sul. */
function m5Reinforce(state: GameState, size = 12): Command | null {
  const o = m5Odysseus(state); if (!o) return null;
  const esc = m5Escort(state);
  if (esc.filter((u) => m5D2(u, o) <= 100 || u.state === 'move').length >= size) return null;
  const ids = m5HomeArmy(state).filter((u) => u.state === 'idle' && UNITS[u.type].speed >= 2.2).slice(0, 8).map((u) => u.id);
  const [x, y] = M5_ROUTE[1];
  return ids.length ? { type: 'move', player: 0, ids, x, y } : null;
}

/**
 * Heraion: a guarda (m5HeraionGuardSize militares de casa) fica no posto a leste do templo — quem se afasta volta —, e, sem inimigos
 * por perto, 2 cidadãos o reparam quando está ferido (a Liga o ataca primeiro: é o edifício de Argos mais perto de Corinto).
 */
function m5Heraion(state: GameState): Command[] {
  const h = entityPos(state, '#heraion'); if (!h) return [];
  const out: Command[] = [];
  const guard = m5HeraionGuard(state);
  const back = guard.filter((u) => u.state === 'idle' && m5D2(u, M5_HERAION_POST) > 16).map((u) => u.id);
  if (back.length) out.push({ type: 'attackMove', player: 0, ids: back, x: M5_HERAION_POST.x, y: M5_HERAION_POST.y });
  const size = m5HeraionGuardSize(state);
  if (guard.length < size) {
    const ids = m5HomeArmy(state).filter((u) => u.state === 'idle').slice(0, size - guard.length).map((u) => u.id);
    if (ids.length) out.push({ type: 'move', player: 0, ids, x: M5_HERAION_POST.x, y: M5_HERAION_POST.y });
  }
  const b = state.buildings.get(state.scenario?.vars['#heraion'] ?? -1);
  if (b && !b.dead && b.hp < b.maxHp && !enemyNear(state, h.x, h.y, 12)) {
    const working = [...state.units.values()].filter((u) => u.owner === 0 && !u.dead && u.type === 'villager' && u.targetId === b.id).length;
    const naufragos = new Set(tagIds(state, 'naufragos'));
    const ids = villagersNear(state, h.x, h.y).filter((u) => !naufragos.has(u.id) && u.targetId !== b.id).slice(0, Math.max(0, 2 - working)).map((u) => u.id);
    if (ids.length) out.push({ type: 'repair', player: 0, ids, targetId: b.id });
  }
  return out;
}

/** m5: segundo a partir do qual o ouro do resgate (1500) fica guardado (a oferta vem aos 15/16/17 min). */
const M5_SAVE_FROM = 480;
/**
 * m5: torres de vigia junto do Heraion (até M5_HERAION_TOWERS a ≤ 12 tiles dele, uma obra por vez, com o cidadão mais perto):
 * quem joga sabe que o templo é o 1º alvo de cada onda da Liga. Local por findBuildSpot a 1–6 tiles do posto da guarda.
 */
const M5_HERAION_TOWERS = 3;
function m5HeraionTower(state: GameState): Command | null {
  const p = state.players[0]; const h = entityPos(state, '#heraion'); if (!h) return null;
  const cost = getBuildingStats(state, p, 'tower').cost as Partial<Record<ResourceType, number>>;
  if (p.resources.wood < (cost.wood ?? 0) + 30 || p.resources.gold < (cost.gold ?? 0) + 20) return null;
  const towers = [...state.buildings.values()].filter((b) => b.owner === 0 && !b.dead && b.type === 'tower' && (b.x - h.x) * (b.x - h.x) + (b.y - h.y) * (b.y - h.y) <= 12 * 12);
  if (towers.length >= M5_HERAION_TOWERS || towers.some((b) => !b.complete)) return null;
  const spot = findBuildSpot(state, p, 'tower', M5_HERAION_POST.x, M5_HERAION_POST.y, 1, 6);
  if (!spot) return null;
  const v = villagersNear(state, spot.x, spot.y).find((u) => u.state !== 'build' && !tagIds(state, 'naufragos').includes(u.id));
  return v ? { type: 'build', player: 0, ids: [v.id], building: 'tower', tx: spot.x, ty: spot.y } : null;
}

/**
 * Viagem pela Via Sagrada (na trégua comprada): cada náufrago segue do seu trecho até o Centro Cívico; Odisseu vai junto e, enquanto
 * o objetivo dos náufragos estiver pendente, espera no pé da colina (a vitória vem com ele no Centro Cívico e encerra a missão);
 * a escolta o acompanha em ataque-movimento.
 */
function m5Travel(state: GameState): Command[] {
  const o = m5Odysseus(state); if (!o) return [];
  const out: Command[] = [];
  const road = m5CastawaysOut(state);
  for (const u of road) { const p = m5Next(u.x, u.y); out.push({ type: 'move', player: 0, ids: [u.id], x: p.x, y: p.y }); }
  let p = m5Next(o.x, o.y);
  const last = M5_ROUTE[M5_ROUTE.length - 1];
  if (road.length > 0 && m5CastawaysPending(state) && ((p.x === last[0] && p.y === last[1]) || (o.x <= M5_FOOT.x + 2 && o.y <= M5_FOOT.y + 2))) p = M5_FOOT;
  out.push({ type: 'move', player: 0, ids: [o.id], x: p.x, y: p.y });
  const esc = m5Escort(state).map((u) => u.id);
  if (esc.length) out.push({ type: 'attackMove', player: 0, ids: esc, x: p.x, y: p.y });
  return out;
}

/** m5 (variante "escolta"): militares junto de Odisseu (a até 10 tiles) com que ele deixa a praia sem trégua comprada, por dificuldade. */
const M5_CONVOY: Record<CampaignDifficulty, number> = { easy: 16, normal: 20, hard: 24 };
/** m5 (variante "escolta"): comboios que já partiram (a partida é uma decisão só; depois, dispersa, a escolta se reagrupa na estrada). */
const m5Departed = new WeakMap<GameState, true>();
/** m5 (variante "escolta"): na praia, com a escolta completa, o comboio parte; antes disso, o posto (como no roteiro principal). */
function m5ConvoyOrPost(state: GameState): Command[] {
  const o = m5Odysseus(state); if (!o) return [];
  if (!m5Departed.has(state)) {
    const size = M5_CONVOY[state.config.campaignDifficulty ?? 'normal'];
    const near = armyOf(state).filter((id) => id !== o.id && m5D2(state.units.get(id)!, o) <= 100).length;
    if (near < size) return [...m5Outbound(state), ...m5Post(state)];
    m5Departed.set(state, true);
  }
  return m5Convoy(state);
}

/**
 * Comboio sem trégua (variante "escolta"): Odisseu sobe a Via Sagrada colado na escolta. Quem da escolta ficou para trás (14–30
 * tiles) e não está lutando volta até ele. Com inimigos a até 12 tiles dele, ele para e atira (postura defensiva) e quem da escolta
 * está ocioso, andando ou afastado ataca em volta dele; sem inimigos, o comboio anda em passos de até 4 tiles pela Via Sagrada: a
 * escolta (ao menos 4) marcha em ataque-movimento até o passo e Odisseu só o dá com o centro dela a até 4 tiles dele. Os náufragos
 * vão atrás dele e, no pé da colina, seguem até o Centro Cívico (Odisseu espera lá por eles, como na viagem com trégua).
 */
function m5Convoy(state: GameState): Command[] {
  const o = m5Odysseus(state); if (!o) return [];
  const out: Command[] = [];
  const road = m5CastawaysOut(state);
  const foot = m5D2(o, M5_FOOT) <= 16;
  for (const u of road) {
    if (foot || m5D2(u, M5_FOOT) <= 36) { const p = m5Next(u.x, u.y); out.push({ type: 'move', player: 0, ids: [u.id], x: p.x, y: p.y }); }
    else if (m5D2(u, o) > 9) out.push({ type: 'move', player: 0, ids: [u.id], x: o.x, y: o.y });
  }
  const army = armyOf(state).map((id) => state.units.get(id)!).filter((u) => u.id !== o.id);
  const guard = army.filter((u) => m5D2(u, o) <= 196);
  const late = army.filter((u) => m5D2(u, o) > 196 && m5D2(u, o) <= 900 && (u.state === 'idle' || u.state === 'move')).map((u) => u.id);
  if (late.length) out.push({ type: 'attackMove', player: 0, ids: late, x: o.x, y: o.y });
  const stop = () => { if (o.state === 'move') out.push({ type: 'stop', player: 0, ids: [o.id] }); };
  if (enemyNear(state, o.x, o.y, 12)) {
    stop();
    const ids = guard.filter((u) => u.state === 'idle' || u.state === 'move' || m5D2(u, o) > 36).map((u) => u.id);
    if (ids.length) out.push({ type: 'attackMove', player: 0, ids, x: o.x, y: o.y });
    return out;
  }
  if (guard.length < 4) { stop(); return out; }
  let p = m5Next(o.x, o.y);
  const last = M5_ROUTE[M5_ROUTE.length - 1];
  if (road.length > 0 && m5CastawaysPending(state) && ((p.x === last[0] && p.y === last[1]) || foot)) p = M5_FOOT;
  // um passo de até 4 tiles rumo ao ponto: a escolta vai à frente e Odisseu só dá o passo com ela junto (o comboio anda no passo dela)
  const dx = p.x - o.x, dy = p.y - o.y, len = Math.sqrt(dx * dx + dy * dy), k = len > 4 ? 4 / len : 1;
  const step = { x: o.x + dx * k, y: o.y + dy * k };
  let cx = 0, cy = 0; for (const u of guard) { cx += u.x; cy += u.y; }
  if (m5D2(o, { x: cx / guard.length, y: cy / guard.length }) <= 16) out.push({ type: 'move', player: 0, ids: [o.id], x: step.x, y: step.y });
  else stop();
  out.push({ type: 'attackMove', player: 0, ids: guard.map((u) => u.id), x: step.x, y: step.y });
  return out;
}

/** Mercado perto do Centro Cívico com 2 cidadãos, se ainda não houver (a IA também o ergue sozinha com 14 cidadãos). */
function m5Market(state: GameState): Command | null {
  const p = state.players[0];
  if (firstBuilding(state, 'market')) return null;
  const tc = firstBuilding(state, 'town_center'); if (!tc || !canAfford(p, getBuildingStats(state, p, 'market').cost)) return null;
  const spot = findBuildSpot(state, p, 'market', tc.x, tc.y, 4, 14); if (!spot) return null;
  const naufragos = new Set(tagIds(state, 'naufragos'));
  const ids = villagersNear(state, spot.x + 1, spot.y + 1).filter((u) => !naufragos.has(u.id)).slice(0, 2).map((u) => u.id);
  return ids.length ? { type: 'build', player: 0, ids, building: 'market', tx: spot.x, ty: spot.y } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// m7 "A Cólera de Aquiles": caça ao herói (Oráculo quando ele marcha, espera na aldeia2, as naus e depois ele)
// ---------------------------------------------------------------------------------------------------------------

/** m7: composição do exército (pesos): hipaspistas na frente, arqueiros cretenses atrás, cavalaria para chegar antes dele. */
const M7_MIX: Record<string, number> = { hypaspist: 4, cretan_archer: 4, hoplite: 1, toxotes: 1, hetairoi: 2, hippeus: 1, petrobolos: 2 };
/**
 * m7: militares para sair contra as naus (o acampamento) — estado, não relógio (o tempo medido é o ritmo real da economia e das
 * lutas): pelo menos M7_ASSAULT_ARMY e M7_ASSAULT_RATIO × os militares dos mirmidões, como um jogador que só ataca com folga.
 * Enquanto o acampamento das naus está de pé, Tétis devolve Aquiles a cada queda: é lá que a caça termina. O assalto segue
 * enquanto metade do exército estiver nas naus (histerese, como na m4). Medido: com 55–70 a vitória saía aos 13–15 min em alguma dificuldade (no
 * limite ou abaixo da janela) e, sem Oficina, os assaltos do Difícil morriam na Fortaleza (flechas mal a arranham) até os 32–34 min.
 */
const M7_ASSAULT_ARMY = 80, M7_ASSAULT_RATIO = 2;
/** m7: distância às naus do ponto de reunião antes do assalto (rumo a Argos). */
const M7_STAGE = 26;

/** Aquiles vivo (tag 'aquiles'; Tétis o devolve às naus com a mesma tag enquanto o acampamento estiver de pé). */
function m7Achilles(state: GameState): Unit | null { const id = state.scenario?.vars['#aquiles']; const u = id !== undefined ? state.units.get(id) : undefined; return u && !u.dead ? u : null; }

/** Militares do jogador a até `r` tiles de (x, y). */
function armyNear(state: GameState, x: number, y: number, r: number): number {
  return armyOf(state).filter((id) => { const u = state.units.get(id)!; return (u.x - x) * (u.x - x) + (u.y - y) * (u.y - y) <= r * r; }).length;
}

/**
 * Assalto às naus em curso: começa com o exército da folga (M7_ASSAULT_*) e continua enquanto metade dele (e ≥ 10) estiver a até
 * 18 tiles delas — alguns perseguidores que chegam às naus atrás dos mirmidões não arrastam o exército inteiro para lá.
 */
function m7Assaulting(state: GameState): boolean {
  const camp = entityPos(state, '#acampamento'); if (!camp) return false;
  const ours = militaryCount(state, 0);
  return (ours >= M7_ASSAULT_ARMY && ours >= M7_ASSAULT_RATIO * militaryCount(state, 2)) || armyNear(state, camp.x, camp.y, 18) >= Math.max(10, ours / 2);
}

/**
 * O assalto: todo o exército em ataque-movimento até as naus; a até 18 tiles delas, infantaria, cavalaria e cerco batem no
 * acampamento (as flechas mal arranham a Fortaleza) e os arqueiros ficam nos mirmidões.
 */
function m7Assault(state: GameState): Command[] {
  const camp = entityPos(state, '#acampamento'); const campId = state.scenario?.vars['#acampamento'];
  if (!camp || campId === undefined || !m7Assaulting(state)) return [];
  const out: Command[] = [];
  const d2 = (u: Unit) => (u.x - camp.x) * (u.x - camp.x) + (u.y - camp.y) * (u.y - camp.y);
  const army = armyOf(state).map((id) => state.units.get(id)!);
  // reagrupar antes de avançar: sem ninguém lutando nas naus, o exército se junta a M7_STAGE tiles delas (no rumo de Argos) e só
  // avança com ≥ 70 % no ponto — espalhado entre a vigia e a casa, ele chegava aos poucos e os mirmidões o desfaziam por partes
  if (armyNear(state, camp.x, camp.y, 18) < 10) {
    const tc = firstBuilding(state, 'town_center');
    if (tc) {
      const vx = tc.x - camp.x, vy = tc.y - camp.y, vl = Math.sqrt(vx * vx + vy * vy) || 1;
      const st = { x: camp.x + vx / vl * M7_STAGE, y: camp.y + vy / vl * M7_STAGE };
      const at = army.filter((u) => (u.x - st.x) * (u.x - st.x) + (u.y - st.y) * (u.y - st.y) <= 12 * 12);
      if (at.length < 0.7 * army.length) {
        const go = army.filter((u) => !at.includes(u) && u.state !== 'attack').map((u) => u.id);
        return go.length ? [{ type: 'attackMove', player: 0, ids: go, x: st.x, y: st.y }] : [];
      }
    }
  }
  const far = army.filter((u) => d2(u) > 18 * 18).map((u) => u.id);
  if (far.length) out.push({ type: 'attackMove', player: 0, ids: far, x: camp.x, y: camp.y });
  const breakers = army.filter((u) => d2(u) <= 18 * 18 && u.targetId !== campId && (!UNITS[u.type].tags.includes('ranged') || UNITS[u.type].tags.includes('siege'))).map((u) => u.id);
  if (breakers.length) out.push({ type: 'attack', player: 0, ids: breakers, targetId: campId });
  return out;
}

/** Um edifício de `type` perto do Centro Cívico, com o cidadão mais perto, se o jogador ainda não tem nenhum e tem o custo com folga. */
function m7Build(state: GameState, type: string): Command | null {
  const p = state.players[0];
  if (firstBuilding(state, type)) return null;
  const cost = getBuildingStats(state, p, type).cost;
  if (p.resources.wood < (cost.wood ?? 0) + 100 || p.resources.gold < (cost.gold ?? 0) + 50) return null;
  const tc = firstBuilding(state, 'town_center'); if (!tc || !tc.complete) return null;
  const spot = findBuildSpot(state, p, type, tc.x, tc.y, 5, 14); if (!spot) return null;
  const v = villagersNear(state, spot.x, spot.y).find((u) => u.state !== 'build'); if (!v) return null;
  return { type: 'build', player: 0, ids: [v.id], building: type, tx: spot.x, ty: spot.y };
}

/**
 * m7, "esteja onde ele vai estar" (Odisseu): a aldeia da vez a partir da aldeia2 (a 1ª marcha, aos 150 s, é cedo demais para
 * enfrentar a pilha): a da marcha em curso, se ela ainda está de pé com mirmidões por perto, ou a próxima de pé que ainda não foi
 * atacada. null quando não há mais aldeia a defender.
 */
function m7Watch(state: GameState): { x: number; y: number } | null {
  const fired = state.scenario?.fired ?? [];
  for (let n = 4; n >= 2; n--) {
    const p = entityPos(state, '#aldeia' + n);
    if (p && fired.includes('rota' + n) && enemyNear(state, p.x, p.y, 20)) return p;
  }
  for (let n = 2; n <= 4; n++) { const p = entityPos(state, '#aldeia' + n); if (p && !fired.includes('rota' + n)) return p; }
  return null;
}

/**
 * m7: militares para esperar Aquiles numa aldeia — M7_GUARD_RATIO × quem marcha com ele (os mirmidões do desembarque ainda vivos,
 * ele e uma escolta de até M7_ESCORT). Com menos, o exército fica em casa (medido: 18 militares na aldeia2 aos 5 min morriam
 * todos e a IA não se reerguia até a derrota).
 */
const M7_GUARD_RATIO = 2, M7_ESCORT = 5;

/**
 * m7: o exército espera Aquiles na aldeia da vez (m7Watch) quando é forte o bastante (M7_GUARD_RATIO) — quem está a mais de 10
 * tiles dela vai em ataque-movimento —, salvo com inimigos a até 22 tiles do Centro Cívico (a Liga pelo leste): aí todos voltam
 * para casa. Nada durante o assalto às naus.
 */
function m7Guard(state: GameState): Command | null {
  if (m7Assaulting(state)) return null;
  const tc = firstBuilding(state, 'town_center');
  const home = tc && enemyNear(state, tc.x, tc.y, 22) ? { x: tc.x, y: tc.y } : null;
  const marchers = 1 + M7_ESCORT + tagIds(state, 'mirmidoes').filter((id) => { const u = state.units.get(id); return u && !u.dead; }).length;
  const at = home ?? (militaryCount(state, 0) >= M7_GUARD_RATIO * marchers ? m7Watch(state) : null); if (!at) return null;
  const ids = armyOf(state).filter((id) => { const u = state.units.get(id)!; return (u.x - at.x) * (u.x - at.x) + (u.y - at.y) * (u.y - at.y) > 10 * 10; });
  return ids.length ? { type: 'attackMove', player: 0, ids, x: at.x, y: at.y } : null;
}

/** Sem as naus, Aquiles vem até Argos: todo o exército em ataque-movimento até ele e foco nele a até 14 tiles. */
function m7Hunt(state: GameState): Command[] {
  const a = m7Achilles(state); if (!a) return [];
  const out: Command[] = [];
  const far = armyOf(state).filter((id) => { const u = state.units.get(id)!; return (u.x - a.x) * (u.x - a.x) + (u.y - a.y) * (u.y - a.y) > 14 * 14; });
  if (far.length) out.push({ type: 'attackMove', player: 0, ids: far, x: a.x, y: a.y });
  const f = focusTarget(state, a.id, 14); if (f) out.push(f);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// m8 "A Maré de Oceano": defesa de Argos na crista da Áspis e o chefe-Titã em três marés (o roteiro guarda o Raio para a última)
// ---------------------------------------------------------------------------------------------------------------

/** m8: composição do exército (pesos): os três heróis de Argos (dano triplo em míticas, e o Titã é uma; Aquiles morreu na m7 e
 * está proibido), infantaria pesada na frente, arqueiros cretenses atrás, Minotauros de Atena e petróbolos contra as ondas. */
const M8_MIX: Record<string, number> = { jason: 1, odysseus: 1, heracles: 1, hypaspist: 3, myrmidon: 3, cretan_archer: 3, minotaur: 2, hetairoi: 1, petrobolos: 1 };
/** m8: a brecha da crista (as três casas abertas entre os muros das pontas) e o ponto de reunião do exército, dentro da muralha. */
const M8_BREACH: [number, number][] = [[63, 38], [64, 38], [65, 38]];
const M8_HOME = { x: 64, y: 32 };
/** m8: as torres do sul (atrás das três passagens da crista, do lado de dentro). */
const M8_TOWERS: [number, number][] = [[48, 34], [53, 33], [60, 34], [68, 34], [61, 31], [67, 31], [75, 33], [80, 34]];

/** Oceano vivo (tag 'oceano'). */
function m8Oceanus(state: GameState): Unit | null { const id = state.scenario?.vars['#oceano']; const u = id !== undefined ? state.units.get(id) : undefined; return u && !u.dead ? u : null; }
/** Maré alta: Oceano marcha sobre Argos (entre o ergue_k e o recua_k do cenário). */
function m8High(state: GameState): boolean { return state.scenario?.vars.alta === 1; }

/** m8: até `n` torres nos pontos de M8_TOWERS (na ordem), uma por chamada, com recurso de sobra. */
function m8Towers(state: GameState, n: number): Command | null {
  const p = state.players[0];
  let have = 0;
  for (const b of state.buildings.values()) if (b.owner === 0 && !b.dead && b.type === 'tower' && b.y > 28) have++;
  if (have >= n) return null;
  const cost = getBuildingStats(state, p, 'tower').cost;
  if (p.resources.wood < (cost.wood ?? 0) + 200 || p.resources.gold < (cost.gold ?? 0) + 150) return null;
  for (const [x, y] of M8_TOWERS) {
    if (!canPlaceBuilding(state, p, 'tower', x, y).ok) continue;
    const v = villagersNear(state, x, y).find((u) => u.state !== 'build'); if (!v) return null;
    return { type: 'build', player: 0, ids: [v.id], building: 'tower', tx: x, ty: y };
  }
  return null;
}

/** m8: fecha a brecha com muralha (um cidadão por casa), como a dica de Jasão sugere; nada se ela já estiver fechada. */
function m8Breach(state: GameState): Command[] {
  const p = state.players[0];
  const open = M8_BREACH.filter(([x, y]) => canPlaceBuilding(state, p, 'wall', x, y).ok);
  if (!open.length) return [];
  const vills = villagersNear(state, 64, 34).filter((u) => u.state !== 'build');
  const out: Command[] = [];
  open.forEach(([x, y], k) => { const v = vills[k]; if (v) out.push({ type: 'build', player: 0, ids: [v.id], building: 'wall', tx: x, ty: y }); });
  return out;
}

/**
 * m8, a luta na maré alta: com Oceano a até 34 tiles do Centro Cívico (ele desce da praia e bate na crista), os heróis (menos
 * Jasão) e Prometeu batem nele (dano triplo dos heróis) e o resto do exército vai em ataque-movimento até ele (a escolta e as
 * ondas ficam pelo caminho). Com `cautious` (variante dos Titãs, que guarda o Favor e fica sem heróis), a 1ª maré — que só bate na
 * crista — não é enfrentada sem ao menos dois deles: o exército fica em casa e o Titã desmancha muros e torres até a maré baixar.
 * Na maré baixa, ninguém persegue o mar até a praia: quem está a mais de 20 tiles do ponto de reunião volta para dentro da muralha.
 * Jasão fica sempre de fora (m8JasonCare).
 */
function m8Fight(state: GameState, cautious = false): Command[] {
  const o = m8Oceanus(state);
  const tc = firstBuilding(state, 'town_center');
  const out: Command[] = [];
  const army = armyOf(state).map((id) => state.units.get(id)!).filter((u) => u.type !== 'jason');
  const d2 = (u: { x: number; y: number }, p: { x: number; y: number }) => (u.x - p.x) * (u.x - p.x) + (u.y - p.y) * (u.y - p.y);
  const striker = (u: Unit) => UNITS[u.type].tags.includes('hero') || u.type === 'prometheus';
  if (o && tc && m8High(state) && d2(o, tc) <= 34 * 34) {
    const engage = !cautious || army.filter(striker).length >= 2 || (state.scenario?.vars.mare ?? 0) >= 2;
    if (engage) {
      const heroes = army.filter((u) => striker(u) && u.targetId !== o.id).map((u) => u.id);
      if (heroes.length) out.push({ type: 'attack', player: 0, ids: heroes, targetId: o.id });
      const rest = army.filter((u) => !striker(u) && d2(u, o) > 12 * 12 && u.state !== 'attack').map((u) => u.id);
      if (rest.length) out.push({ type: 'attackMove', player: 0, ids: rest, x: o.x, y: o.y });
      return out;
    }
  }
  const disengage = !m8High(state) || (cautious && (state.scenario?.vars.mare ?? 0) < 2);
  if (m8High(state) && !disengage) return out;   // maré alta com Oceano ainda longe: o exército espera em casa (a IA do jogador defende)
  // maré baixa (ou a 1ª maré, com cautela): quem persegue Oceano desengaja com 'move' (num ataque-movimento, o Titã a um passo
  // seria o alvo de novo; na praia ele é invulnerável e esmaga quem chega — medido: 76 de 82 militares morreram assim no 1º recuo);
  // os demais longe de casa voltam em ataque-movimento
  const chasing = o ? army.filter((u) => (u.targetId === o.id && (u.state === 'attack' || u.state === 'attackMove')) || d2(u, o) <= 14 * 14).map((u) => u.id) : [];
  if (chasing.length) out.push({ type: 'move', player: 0, ids: chasing, x: M8_HOME.x, y: M8_HOME.y - (cautious ? 14 : 0) });
  const far = army.filter((u) => !chasing.includes(u.id) && ((d2(u, M8_HOME) > 20 * 20 && u.state !== 'attack') || d2(u, M8_HOME) > 45 * 45)).map((u) => u.id);
  if (far.length) out.push({ type: 'attackMove', player: 0, ids: far, x: M8_HOME.x, y: M8_HOME.y });
  return out;
}

/**
 * m8, o segredo de Lerna: antes de Oceano subir, os heróis (menos Jasão) e até 8 militares vão aos pântanos e matam a Hidra (dano
 * triplo dos heróis); morta a Hidra, quem foi volta para dentro da muralha. null quando não há o que fazer.
 */
function m8Hydra(state: GameState): Command | null {
  const h = entityPos(state, '#hidra');
  const army = armyOf(state).map((id) => state.units.get(id)!).filter((u) => u.type !== 'jason');
  if (!h) {
    const back = army.filter((u) => u.y > 44 && u.state !== 'attack').map((u) => u.id);
    return back.length ? { type: 'attackMove', player: 0, ids: back, x: M8_HOME.x, y: M8_HOME.y } : null;
  }
  const heroes = army.filter((u) => UNITS[u.type].tags.includes('hero'));
  if (heroes.length < 2) return null;
  const hydra = state.scenario!.vars['#hidra'];
  const escort = army.filter((u) => !UNITS[u.type].tags.includes('hero') && !UNITS[u.type].tags.includes('siege')).slice(0, 8);
  const ids = [...heroes, ...escort].filter((u) => u.targetId !== hydra).map((u) => u.id);
  return ids.length ? { type: 'attack', player: 0, ids, targetId: hydra } : null;
}

/**
 * m8, o caminho dos Titãs (a 3ª resposta da ficha): as pesquisas da Academia que faltam para 6 (a de nível mais baixo primeiro),
 * a Fortaleza perto do Centro Cívico, a Idade dos Titãs assim que der e o Portal dos Titãs com 8 cidadãos (em cenário, a IA do
 * jogador não põe construtores no Portal: quem o ergue é o roteiro). Um comando por chamada, na ordem do que falta.
 */
function m8Titans(state: GameState): Command | null {
  const p = state.players[0];
  const tc = firstBuilding(state, 'town_center'); if (!tc || !tc.complete) return null;
  if (p.age >= 4) {
    const gate = firstBuilding(state, 'titan_gate');
    if (gate) {
      if (gate.complete) return null;
      const near = villagersNear(state, gate.x, gate.y).filter((u) => u.state !== 'pray');
      const working = near.filter((u) => u.state === 'build' && u.targetId === gate.id).length;
      const ids = near.filter((u) => u.targetId !== gate.id).slice(0, Math.max(0, 8 - working)).map((u) => u.id);
      return ids.length ? { type: 'repair', player: 0, ids, targetId: gate.id } : null;
    }
    if (!canAfford(p, getBuildingStats(state, p, 'titan_gate').cost)) return null;
    const spot = findBuildSpot(state, p, 'titan_gate', tc.x, tc.y, 4, 16); if (!spot) return null;
    const ids = villagersNear(state, spot.x + 2, spot.y + 2).filter((u) => u.state !== 'pray').slice(0, 8).map((u) => u.id);
    return ids.length ? { type: 'build', player: 0, ids, building: 'titan_gate', tx: spot.x, ty: spot.y } : null;
  }
  if (academyTechCount(p) < 6) {
    const ac = [...state.buildings.values()].find((b) => b.owner === 0 && !b.dead && b.complete && b.type === 'academy' && b.queue.length === 0); if (!ac) return null;
    const next = Object.keys(TECHS).filter((t) => TECHS[t].line && ACADEMY_LINES.includes(TECHS[t].line!) && !p.techs.includes(t) && canResearchNow(state, ac.id, t))
      .sort((a, b) => (TECHS[a].level ?? 0) - (TECHS[b].level ?? 0) || (a < b ? -1 : 1))[0];
    return next ? { type: 'research', player: 0, buildingId: ac.id, tech: next } : null;
  }
  if (!firstBuilding(state, 'fortress')) {
    if (!canAfford(p, getBuildingStats(state, p, 'fortress').cost)) return null;
    const spot = findBuildSpot(state, p, 'fortress', tc.x, tc.y, 4, 14); if (!spot) return null;
    const ids = villagersNear(state, spot.x + 2, spot.y + 2).filter((u) => u.state !== 'pray').slice(0, 4).map((u) => u.id);
    return ids.length ? { type: 'build', player: 0, ids, building: 'fortress', tx: spot.x, ty: spot.y } : null;
  }
  const f = firstBuilding(state, 'fortress');
  if (!f || !f.complete) return null;
  return canAdvanceAge(state, p, tc).ok ? { type: 'advanceAge', player: 0, buildingId: tc.id } : null;
}

/** m8, variante dos Titãs: cidadãos rezando no Templo de Argos (o Favor da Idade dos Titãs e do Portal: 500). */
const M8_WORSHIPPERS = 10;
/** Cidadãos do jogador 0 rezando agora (menor id primeiro). */
function m8Praying(state: GameState): Unit[] {
  return [...state.units.values()].filter((u) => u.owner === 0 && !u.dead && u.type === 'villager' && u.state === 'pray').sort((a, b) => a.id - b.id);
}
/** m8, variante dos Titãs: completa M8_WORSHIPPERS cidadãos rezando no Templo (os mais perto dele), até Prometeu atender. */
function m8Pray(state: GameState): Command | null {
  const t = [...state.buildings.values()].find((b) => b.owner === 0 && !b.dead && b.complete && b.type === 'temple'); if (!t) return null;
  const n = M8_WORSHIPPERS - m8Praying(state).length; if (n <= 0) return null;
  const ids = villagersNear(state, t.x, t.y).filter((u) => u.state !== 'pray' && u.state !== 'build').slice(0, n).map((u) => u.id);
  return ids.length ? { type: 'pray', player: 0, ids, targetId: t.id } : null;
}

/** m8: o abrigo de Jasão durante as marés (atrás do Centro Cívico, junto das casas) e o instante em que ele vai para lá. */
const M8_JASON_SAFE = { x: 64, y: 8 }, M8_JASON_FROM = 570;
/** Jasão vivo (tag 'jasao'). */
function m8Jason(state: GameState): Unit | null { const id = state.scenario?.vars['#jasao']; const u = id !== undefined ? state.units.get(id) : undefined; return u && !u.dead ? u : null; }
/**
 * m8, "Jasão sobrevive à onda": pouco antes da 1ª maré, Jasão (200 de vida, dois golpes do Titã) sai da linha — postura passiva e
 * abrigo atrás do Centro Cívico, fora do alcance da IA do jogador (destacamento), como um jogador que quer o objetivo o guardaria.
 */
function m8JasonCare(state: GameState): Command[] {
  const j = m8Jason(state); if (!j || j.inside !== -1) return [];
  const out: Command[] = [];
  if (j.stance !== 'passive') out.push({ type: 'stance', player: 0, ids: [j.id], stance: 'passive' });
  if ((j.x - M8_JASON_SAFE.x) * (j.x - M8_JASON_SAFE.x) + (j.y - M8_JASON_SAFE.y) * (j.y - M8_JASON_SAFE.y) > 9) out.push({ type: 'move', player: 0, ids: [j.id], x: M8_JASON_SAFE.x, y: M8_JASON_SAFE.y });
  return out;
}

/**
 * m8: destacamento — Jasão a partir de pouco antes da 1ª maré (a IA do jogador não o comanda; m8JasonCare o guarda) e, na variante
 * dos Titãs, quem reza no Templo até Prometeu atender (a IA os mandaria coletar).
 */
function m8Detach(state: GameState, titans: boolean): number[] {
  const j = m8Jason(state);
  const out = j && state.tick >= M8_JASON_FROM * TICK_RATE ? [j.id] : [];
  if (titans && !state.scenario?.fired.includes('prometeu')) for (const u of m8Praying(state).slice(0, M8_WORSHIPPERS)) out.push(u.id);
  return out;
}

/**
 * m8: folga das filas militares. No roteiro principal, só uma sobra; na variante dos Titãs, também o custo do que falta, na
 * ordem (Fortaleza, Idade dos Titãs, Portal) e o Favor da Idade e do Portal, até Prometeu atender.
 */
function m8ArmyReserve(state: GameState, titans: boolean): Partial<Record<ResourceType, number>> {
  const base = { food: 150, wood: 150, gold: 100 };
  if (!titans || state.scenario?.fired.includes('prometeu')) return base;
  if (!firstBuilding(state, 'fortress')) return { food: 150, wood: 550, gold: 400, favor: 500 };
  if (state.players[0].age < 4) return { food: 1650, wood: 150, gold: 1600, favor: 500 };
  if (!firstBuilding(state, 'titan_gate')) return { food: 750, wood: 750, gold: 700, favor: 200 };
  return base;
}

/**
 * m8: o chefe lutou — Oceano em `attack` por ao menos 25 s na partida. A janela não discrimina um Titã que só marcha (o relógio
 * das marés já põe a vitória mais rápida perto dos 22 min), e foi assim que uma coleira que o trocava para `move` desde a subida
 * passou despercebida: com ela, 1–15 s de ataque nas três dificuldades; corrigida, 41–135 s nas três e na
 * variante (o Raio o derruba em segundos na 3ª maré). Abates não servem de prova: com o dano em área, 8 s de ataque na brecha
 * já davam 40.
 */
const M8_FOUGHT: ScriptEndCheck[] = [{ label: 'Oceano atacou por ao menos 25 s', when: { units: { player: 2, tag: 'oceano', state: 'attack' }, gte: 1 }, seconds: 25 }];

/** m8: os passos do roteiro (titans: a variante dos Titãs acrescenta o caminho até Prometeu e guarda o custo dele). */
function m8Steps(titans: boolean): ScriptStep[] {
  return [
    { label: 'cidadãos', when: { time: { gte: 3 } }, every: 4, command: (s) => trainVillagers(s, 45) },
    { label: 'jasão', when: { time: { gte: M8_JASON_FROM } }, every: 2, command: (s) => m8JasonCare(s) },
    { label: 'treino', when: { time: { gte: 5 } }, every: 5, command: (s) => trainArmy(s, 0, { mix: M8_MIX, reserve: m8ArmyReserve(s, titans) }) },
    ...(titans ? [
      { label: 'titãs', when: { all: [{ time: { gte: 10 } }, { not: { fired: 'prometeu' } }] }, every: 5, command: (s: GameState) => m8Titans(s) } satisfies ScriptStep,
      { label: 'reza', when: { all: [{ time: { gte: 10 } }, { not: { fired: 'prometeu' } }] }, every: 10, command: (s: GameState) => m8Pray(s) } satisfies ScriptStep,
    ] : []),
    // a brecha da crista fechada com muralha (a dica de Jasão) e torres atrás das três passagens
    { label: 'brecha', when: { time: { gte: 20 } }, every: 20, command: (s) => m8Breach(s) },
    { label: 'torres', when: { time: { gte: 30 } }, every: 15, command: (s) => m8Towers(s, 8) },
    { label: 'tempestade', when: { time: { gte: 1 } }, every: 1, command: (s) => dodgeStorms(s) },
    { label: 'restauração', when: { time: { gte: 2 } }, every: 3, command: (s) => m8Restore(s) },
    // o segredo de Lerna: com dois heróis, a Hidra do pântano antes de Oceano subir (e quem foi volta)
    { label: 'hidra', when: { all: [{ time: { gte: 240 } }, { not: { fired: 'ergue' } }] }, every: 10, command: (s) => m8Hydra(s) },
    // maré alta: heróis (e Prometeu) em Oceano e o exército junto dele; maré baixa: todos dentro da muralha
    { label: 'maré', when: { fired: 'ergue' }, every: 2, command: (s) => m8Fight(s, titans) },
    { label: 'raio', when: { fired: 'ergue3' }, every: 1, command: (s) => m8Bolt(s) },
  ];
}

/** m8: o Raio de Zeus em Oceano na última maré (sem piso, metade da vida o derruba de vez), com ele a até 40 tiles do CC. */
function m8Bolt(state: GameState): Command | null {
  const o = m8Oceanus(state); const tc = firstBuilding(state, 'town_center');
  if (!o || !tc || !m8High(state) || state.scenario?.vars.mare !== 3 || !hasPower(state, 'bolt')) return null;
  return (o.x - tc.x) * (o.x - tc.x) + (o.y - tc.y) * (o.y - tc.y) <= 40 * 40 ? { type: 'power', player: 0, power: 'bolt', targetId: o.id } : null;
}

/** m8: Restauração onde houver ≥ 8 militares feridos (< 60 % de vida) num raio de 8 (o Raio fica para Oceano: m8Bolt). */
function m8Restore(state: GameState): Command | null {
  if (!hasPower(state, 'restoration')) return null;
  const hurt = armyOf(state).map((id) => state.units.get(id)!).filter((u) => u.hp < u.maxHp * 0.6);
  for (const h of hurt) { const n = hurt.filter((u) => (u.x - h.x) * (u.x - h.x) + (u.y - h.y) * (u.y - h.y) <= 64).length; if (n >= 8) return { type: 'power', player: 0, power: 'restoration', x: h.x, y: h.y }; }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// m9 "A Descida ao Tênaro": jogando como Hades — míticas e heróis contra as jaulas e as fendas, um alvo por vez
// ---------------------------------------------------------------------------------------------------------------

/**
 * m9: composição do exército (pesos): as míticas do Templo na frente (Minotauros de Atena, Mantícoras de Apolo e o Cérbero de
 * Hades), hipaspistas e arqueiros cretenses atrás, petróbolos contra as torres (jaulas) e os templos (fendas).
 */
const M9_MIX: Record<string, number> = { minotaur: 3, manticore: 2, cerberus: 2, hypaspist: 3, cretan_archer: 3, petrobolos: 1 };
/**
 * m9: os alvos na ordem da caminhada a partir do Palácio (distâncias a pé no mapa 9909): a fenda do Estige, a oeste da única
 * entrada do platô do Culto (38), as duas jaulas do platô (64 e 84), a jaula e a fenda da faixa norte (87 e 101) e, por último,
 * a fenda do Aqueronte, além do lago do sul (160).
 */
const M9_TARGETS = ['fenda1', 'jaula1', 'jaula2', 'jaula3', 'fenda3', 'fenda2'] as const;
/** m9: militares para sair contra o próximo alvo (estado, não relógio), o mesmo nas três dificuldades. */
const M9_ASSAULT_ARMY = 40;

/** Militares do jogador a até `r` tiles de (x, y). */
function m9ArmyNear(state: GameState, x: number, y: number, r: number): number {
  return armyOf(state).filter((id) => { const u = state.units.get(id)!; return (u.x - x) * (u.x - x) + (u.y - y) * (u.y - y) <= r * r; }).length;
}

/**
 * m9: alvo sob assalto agora (o próximo de pé, na ordem de M9_TARGETS): começa com ≥ M9_ASSAULT_ARMY militares e continua
 * enquanto ≥ 10 deles estiverem a até 16 tiles dele (histerese, como na m4); null fora de assalto.
 */
function m9AssaultTarget(state: GameState): string | null {
  const next = M9_TARGETS.find((t) => entityPos(state, '#' + t)); if (!next) return null;
  if (militaryCount(state, 0) >= M9_ASSAULT_ARMY) return next;
  const p = entityPos(state, '#' + next)!;
  return m9ArmyNear(state, p.x, p.y, 16) >= 10 ? next : null;
}

/**
 * m9: uma Casa perto do Palácio quando faltam menos de `slack` de população (a IA do jogador só ergue a próxima com ≤ 6 de
 * folga, e as míticas ocupam 3 a 5 cada: medido, o Normal ficava em 70/70 dos 7 aos 14 min), com o cidadão mais perto.
 */
function m9House(state: GameState, slack: number): Command | null {
  const p = state.players[0];
  if (p.popCap - p.pop >= slack || p.popCap >= 250 || p.resources.wood < 80) return null;
  if ([...state.buildings.values()].some((b) => b.owner === 0 && !b.dead && b.type === 'house' && !b.complete)) return null;
  const tc = firstBuilding(state, 'town_center'); if (!tc) return null;
  const spot = findBuildSpot(state, p, 'house', tc.x, tc.y, 4, 16); if (!spot) return null;
  const v = villagersNear(state, spot.x, spot.y).find((u) => u.state !== 'build'); if (!v) return null;
  return { type: 'build', player: 0, ids: [v.id], building: 'house', tx: spot.x, ty: spot.y };
}

/** m9: ataque-movimento de todo o exército até o alvo; perto dele (10 tiles), todos batem na jaula ou na fenda. */
function m9Assault(state: GameState, tag: string): Command[] {
  const p = entityPos(state, '#' + tag); if (!p) return [];
  const ids = armyOf(state); if (!ids.length) return [];
  const out: Command[] = [{ type: 'attackMove', player: 0, ids, x: p.x, y: p.y }];
  const f = focusTarget(state, state.scenario?.vars['#' + tag], 10); if (f) out.push(f);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// m11 "Argos em Chamas": o êxodo até as naus de Náuplia em levas, o arconte guardado no cais e os poderes um a um
// ---------------------------------------------------------------------------------------------------------------

/**
 * m11: o cais (os cidadãos esperam a nau a ≤ 5 tiles do centro das naus, em [19.5,113.5]), o abrigo do arconte (atrás do
 * cais, junto à baía) e o posto da escolta (na boca do porto, onde chegam a Via de Náuplia e o caminho da margem oeste).
 */
const M11_QUAY = { x: 19.5, y: 110.5 }, M11_ARCHON_SAFE = { x: 12.5, y: 112.5 }, M11_GUARD = { x: 20, y: 104 };
/** m11: instantes das naus e de Cronos por dificuldade (os mesmos do cenário) e os lugares de cada nau. */
const M11_SHIPS: Record<CampaignDifficulty, number[]> = { easy: [240, 540, 780], normal: [240, 540, 780], hard: [240, 540, 780, 840] };
const M11_PLACES: Record<CampaignDifficulty, number[]> = { easy: [7, 7, 6], normal: [10, 10, 10], hard: [10, 10, 10, 10] };
const M11_CRONUS: Record<CampaignDifficulty, number> = { easy: 750, normal: 720, hard: 600 };
/** m11: a leva sai M11_LEAD s antes da nau dela (a viagem leva ~40–50 s) e ninguém fica na cidade depois de Cronos − M11_EVAC s. */
const M11_LEAD = 70, M11_EVAC = 80;
/** m11: folga de cada leva (cidadãos a mais que os lugares da nau, para as perdas no caminho). */
const M11_SPARE = 2;

/** m11: quem já está no êxodo (cidadãos mandados ao cais) e a escolta do arconte (o exército inicial), por partida. */
interface M11Memo { exodus: Set<number>; escort: Set<number>; levas: number }
const m11Memos = new WeakMap<GameState, M11Memo>();
function m11Memo(state: GameState): M11Memo {
  let m = m11Memos.get(state);
  if (!m) { m = { exodus: new Set(), escort: new Set(), levas: 0 }; m11Memos.set(state, m); }
  return m;
}
const m11Diff = (state: GameState): CampaignDifficulty => state.config.campaignDifficulty ?? 'normal';

/**
 * m11: as levas da dificuldade — uma por nau, M11_LEAD s antes dela, com os lugares da nau + M11_SPARE cidadãos; a última
 * leva leva todos os que restam e sai antes de Cronos chegar à cidade (Cronos − M11_EVAC), mesmo que a nau dela ainda demore.
 */
export function m11Levas(d: CampaignDifficulty): { at: number; size: number | 'all' }[] {
  const ships = M11_SHIPS[d], places = M11_PLACES[d], evac = M11_CRONUS[d] - M11_EVAC;
  const out: { at: number; size: number | 'all' }[] = [];
  for (let k = 0; k < ships.length - 1; k++) {
    const at = ships[k] - M11_LEAD;
    if (at >= evac) break;
    out.push({ at, size: places[k] + M11_SPARE });
  }
  out.push({ at: Math.min(ships[ships.length - 1] - M11_LEAD, evac), size: 'all' });
  return out;
}

/** Unidade viva de uma tag do cenário (a primeira do grupo). */
function tagUnit(state: GameState, tag: string): Unit | null { const id = state.scenario?.vars['#' + tag]; const u = id !== undefined ? state.units.get(id) : undefined; return u && !u.dead ? u : null; }
const m11D2 = (u: { x: number; y: number }, p: { x: number; y: number }) => (u.x - p.x) * (u.x - p.x) + (u.y - p.y) * (u.y - p.y);

/**
 * m11: as levas. Na hora de cada uma, os cidadãos mais perto do Centro Cívico (fora de edifícios) entram no êxodo e vão ao
 * cais; na última, todos — e, dali em diante, quem nascer ou sair de uma guarnição também (os abrigos sem inimigo por perto
 * soltam quem está dentro). Os do êxodo que pararam longe do cais voltam a andar até ele.
 */
function m11Exodus(state: GameState): Command[] {
  const memo = m11Memo(state), d = m11Diff(state), sec = state.tick / TICK_RATE;
  const levas = m11Levas(d);
  const out: Command[] = [];
  const tc = firstBuilding(state, 'town_center');
  const home = tc ? { x: tc.x, y: tc.y } : { x: 64, y: 40 };
  const free = villagersNear(state, home.x, home.y).filter((u) => !memo.exodus.has(u.id));
  const add: number[] = [];
  while (memo.levas < levas.length && sec >= levas[memo.levas].at) {
    const size = levas[memo.levas].size;
    const pool = free.filter((u) => !add.includes(u.id));   // duas levas vencidas na mesma chamada não escolhem os mesmos
    for (const u of size === 'all' ? pool : pool.slice(0, size)) add.push(u.id);
    memo.levas++;
  }
  const last = memo.levas >= levas.length;
  if (last) {
    for (const u of free) if (!add.includes(u.id)) add.push(u.id);
    // abrigos com cidadãos e sem inimigo a 12 tiles: soltam (a IA do jogador os guarneceu numa ameaça)
    for (const b of state.buildings.values()) {
      if (b.owner !== 0 || b.dead || !b.garrison.some((id) => state.units.get(id)?.type === 'villager')) continue;
      if (!enemyNear(state, b.x, b.y, 12, (e) => UNITS[e.type].tags.includes('military'))) out.push({ type: 'ungarrison', player: 0, buildingId: b.id });
    }
  }
  for (const id of add) memo.exodus.add(id);
  // quem está no êxodo, fora de edifícios, parado ou coletando longe do cais: ao cais
  const walk = [...memo.exodus].map((id) => state.units.get(id)).filter((u): u is Unit => !!u && !u.dead && u.inside === -1 && m11D2(u, M11_QUAY) > 3 * 3 && (add.includes(u.id) || u.state !== 'move'));
  if (walk.length) out.push({ type: 'move', player: 0, ids: walk.map((u) => u.id), x: M11_QUAY.x, y: M11_QUAY.y });
  return out;
}

/**
 * m11: o arconte. Com a 1ª leva, ele e o exército inicial (a escolta) descem a Via de Náuplia; no porto, o arconte fica em
 * postura passiva atrás do cais (não persegue ninguém) e a escolta guarda a boca do porto: inimigo a ≤ 20 tiles do posto, do
 * cais ou do arconte, ela o ataca; sem inimigo, quem se afastou volta ao posto.
 */
function m11Archon(state: GameState): Command[] {
  const memo = m11Memo(state), sec = state.tick / TICK_RATE;
  const a = tagUnit(state, 'arconte'); if (!a) return [];
  const out: Command[] = [];
  const first = m11Levas(m11Diff(state))[0].at;
  if (sec < first) return out;
  if (memo.escort.size === 0) for (const id of armyOf(state)) if (id !== a.id) memo.escort.add(id);
  if (a.stance !== 'passive') out.push({ type: 'stance', player: 0, ids: [a.id], stance: 'passive' });
  if (a.inside === -1 && m11D2(a, M11_ARCHON_SAFE) > 2 * 2 && a.state !== 'move') out.push({ type: 'move', player: 0, ids: [a.id], x: M11_ARCHON_SAFE.x, y: M11_ARCHON_SAFE.y });
  const escort = [...memo.escort].map((id) => state.units.get(id)).filter((u): u is Unit => !!u && !u.dead && u.inside === -1);
  if (!escort.length) return out;
  const foe = enemyNear(state, M11_GUARD.x, M11_GUARD.y, 20, (e) => UNITS[e.type].tags.includes('military') && !UNITS[e.type].tags.includes('titan'))
    ?? enemyNear(state, M11_QUAY.x, M11_QUAY.y, 16, (e) => UNITS[e.type].tags.includes('military') && !UNITS[e.type].tags.includes('titan'))
    ?? enemyNear(state, a.x, a.y, 16, (e) => UNITS[e.type].tags.includes('military') && !UNITS[e.type].tags.includes('titan'));
  if (foe) {
    const go = escort.filter((u) => u.state !== 'attack' || m11D2(u, foe) > 12 * 12).map((u) => u.id);
    if (go.length) out.push({ type: 'attackMove', player: 0, ids: go, x: foe.x, y: foe.y });
    return out;
  }
  const back = escort.filter((u) => m11D2(u, M11_GUARD) > 8 * 8 && u.state !== 'move').map((u) => u.id);
  if (back.length) out.push({ type: 'attackMove', player: 0, ids: back, x: M11_GUARD.x, y: M11_GUARD.y });
  return out;
}

/**
 * m11: ao evacuar a cidade (a última leva), o exército que a IA do jogador treinou também desce ao porto e passa à escolta
 * (a cidade vai cair com Cronos; o que importa é o cais).
 */
function m11Evacuate(state: GameState): void {
  const memo = m11Memo(state);
  const a = tagUnit(state, 'arconte');
  for (const id of armyOf(state)) if (id !== a?.id && state.units.get(id)!.type !== 'prometheus') memo.escort.add(id);
}

/** m11: destacamento — o arconte, o sacerdote, Prometeu, a escolta e o êxodo (a IA do jogador levaria todos de volta à cidade). */
function m11Detach(state: GameState): number[] {
  const memo = m11Memo(state);
  const out = [...memo.exodus, ...memo.escort];
  for (const t of ['arconte', 'sacerdote', 'prometeu']) { const u = tagUnit(state, t); if (u) out.push(u.id); }
  return out;
}

/** Centro do grupo mais denso de unidades inimigas que satisfazem `pred` num raio `r` (cada uma é candidata a centro). */
function m11Clump(state: GameState, r: number, pred: (u: Unit) => boolean): { x: number; y: number; n: number } | null {
  const foes = [...state.units.values()].filter((u) => !u.dead && u.inside === -1 && isEnemy(state, 0, u.owner) && pred(u));
  let best: { x: number; y: number; n: number } | null = null;
  for (const c of foes) {
    const near = foes.filter((u) => m11D2(u, c) <= r * r);
    if (!best || near.length > best.n) best = { x: near.reduce((s, u) => s + u.x, 0) / near.length, y: near.reduce((s, u) => s + u.y, 0) / near.length, n: near.length };
  }
  return best;
}

/**
 * O que o jogador 0 protege perto do ponto (a até `r` tiles): um edifício (sem muralha), um cidadão fora de edifícios ou o
 * arconte. O exército e o batedor não contam (a Tempestade não é gasta na base do Culto porque um batedor passou por lá).
 */
function m11Guarded(state: GameState, p: { x: number; y: number }, r: number): boolean {
  for (const u of state.units.values()) if (u.owner === 0 && !u.dead && u.inside === -1 && (u.type === 'villager' || u.type === 'basileus') && m11D2(u, p) <= r * r) return true;
  for (const b of state.buildings.values()) if (b.owner === 0 && !b.dead && !BUILDINGS[b.type].wall && m11D2(b, p) <= r * r) return true;
  return false;
}

/**
 * m11: os poderes um a um, cada um na onda para a qual veio (no máximo um por chamada):
 * - a Maldição num grupo de ≥ 4 soldados humanos (sem heróis) num raio de 4 a ≤ 14 tiles do que o jogador protege
 *   (m11Guarded): os hoplitas da 1ª onda, antes de chegarem à cidade;
 * - a Tempestade de Raios num grupo de ≥ 4 arqueiros num raio de 6 a ≤ 22 tiles do arconte ou do cais (os arqueiros da 2ª
 *   onda vêm caçar o arconte; a escolta os pegaria antes se esperássemos mais) ou, a partir dos 7 min, em ≥ 6 militares perto
 *   do que o jogador protege;
 * - a Trégua com ≥ 3 cavaleiros inimigos a ≤ 18 tiles do cais com cidadãos esperando a nau (a 3ª onda mira as naus: a fila
 *   embarca enquanto ninguém mata), ou com ≥ 3 militares a ≤ 10 do arconte;
 * - a Restauração em ≥ 6 militares nossos feridos (< 60 %) num raio de 8;
 * - o Raio no inimigo mais valioso a ≤ 12 tiles do arconte ou do cais (e, sem ninguém assim, em Cronos quando ele chega a
 *   14 tiles de cidadãos nossos).
 */
function m11Powers(state: GameState): Command | null {
  const tags = (u: Unit) => UNITS[u.type].tags;
  const soldier = (u: Unit) => tags(u).includes('human') && tags(u).includes('military') && !tags(u).includes('hero');
  const mil = (u: Unit) => tags(u).includes('military') && !tags(u).includes('titan');
  const a = tagUnit(state, 'arconte');
  const nearArchonOrQuay = (p: { x: number; y: number }, r: number) => m11D2(p, M11_QUAY) <= r * r || (!!a && m11D2(p, a) <= r * r);
  if (hasPower(state, 'curse')) {
    const c = m11Clump(state, 4, soldier);
    if (c && c.n >= 4 && m11Guarded(state, c, 14)) return { type: 'power', player: 0, power: 'curse', x: c.x, y: c.y };
  }
  if (hasPower(state, 'lightning_storm')) {
    const archers = m11Clump(state, 6, (u) => tags(u).includes('archer'));
    if (archers && archers.n >= 4 && nearArchonOrQuay(archers, 22)) return { type: 'power', player: 0, power: 'lightning_storm', x: archers.x, y: archers.y };
    const c = state.tick >= 420 * TICK_RATE ? m11Clump(state, 6, mil) : null;
    if (c && c.n >= 6 && m11Guarded(state, c, 14)) return { type: 'power', player: 0, power: 'lightning_storm', x: c.x, y: c.y };
  }
  const quayFolk = villagersNear(state, M11_QUAY.x, M11_QUAY.y).filter((u) => m11D2(u, M11_QUAY) <= 6 * 6);
  if (hasPower(state, 'ceasefire')) {
    const threat = (p: { x: number; y: number }, r: number, pred: (u: Unit) => boolean) => [...state.units.values()].filter((u) => !u.dead && u.inside === -1 && isEnemy(state, 0, u.owner) && pred(u) && m11D2(u, p) <= r * r).length;
    if ((quayFolk.length && threat(M11_QUAY, 18, (u) => tags(u).includes('cavalry')) >= 3) || (a && a.inside === -1 && threat(a, 10, mil) >= 3)) return { type: 'power', player: 0, power: 'ceasefire' };
  }
  if (hasPower(state, 'restoration')) {
    const hurt = armyOf(state).map((id) => state.units.get(id)!).filter((u) => u.hp < u.maxHp * 0.6);
    for (const h of hurt) if (hurt.filter((u) => m11D2(u, h) <= 64).length >= 6) return { type: 'power', player: 0, power: 'restoration', x: h.x, y: h.y };
  }
  if (hasPower(state, 'bolt')) {
    const near = (a ? enemyNear(state, a.x, a.y, 12, mil) : null) ?? enemyNear(state, M11_QUAY.x, M11_QUAY.y, 12, mil);
    if (near && near.maxHp >= 150) return { type: 'power', player: 0, power: 'bolt', targetId: near.id };
    const c = tagUnit(state, 'cronos');
    if (c && c.hp > c.maxHp * 0.6 && villagersNear(state, c.x, c.y).some((u) => m11D2(u, c) <= 14 * 14)) return { type: 'power', player: 0, power: 'bolt', targetId: c.id };
  }
  return null;
}

/**
 * m11: a mecânica em destaque aconteceu — a Maldição e a Tempestade de Raios foram usadas nas ondas para as quais vieram (os
 * hoplitas da 1ª, os arqueiros que caçam o arconte na 2ª) — e o clímax veio antes do fim (Cronos desceu: o êxodo não termina
 * antes dele em nenhuma dificuldade). A janela não discrimina nada disso: o calendário das naus põe toda vitória possível entre
 * a última nau + o embarque (~13 min; ~14 no Difícil, com a 4ª nau) e a partida das naus (18 min), dentro da janela da §4 ±30 %
 * — ela só confere que houve vitória; a prova da missão são estas checagens. A Trégua fica de fora de propósito: ela só serve
 * quando a cavalaria da 3ª onda chega à fila do cais (Fácil e Normal); no Difícil o exército da cidade já desceu ao porto e a
 * mata antes, com os lugares da 2ª nau cheios — gastá-la ali só para passar na checagem seria frear/forçar o roteiro.
 */
const M11_END_CHECKS: ScriptEndCheck[] = [
  { label: 'Maldição e Tempestade de Raios usadas', when: { all: [{ powerUsed: { player: 0, id: 'curse' } }, { powerUsed: { player: 0, id: 'lightning_storm' } }] } },
  { label: 'Cronos desceu antes do fim', when: { fired: 'cronos' } },
];

/** m11: cidadãos a treinar (vivos + a bordo) até a meta com folga, enquanto a cidade existe e a última leva não saiu. */
function m11Villagers(state: GameState): Command[] {
  const sc = state.scenario; if (!sc) return [];
  const levas = m11Levas(m11Diff(state));
  if (state.tick / TICK_RATE >= levas[levas.length - 1].at - 20) return [];
  let alive = 0; for (const u of state.units.values()) if (u.owner === 0 && !u.dead && u.type === 'villager') alive++;
  const want = (sc.vars.meta ?? 30) + 8 - (sc.vars.embarcados ?? 0);
  return alive < want ? trainVillagers(state, want) : [];
}

/**
 * Roteiros das missões registradas (o jogador 0 é uma IA "difícil"; os passos cobram o objetivo que a IA não faz sozinha).
 * Missão nova: acrescente uma entrada com o id; sem entrada, scripts/missions.ts roda só a IA do jogador.
 */
export const MISSION_SCRIPTS: Record<string, MissionScript> = {
  m1_despertar: {
    minutes: 30, expect: [10.5, 26],
    steps: [
      // Templo pronto e menos de 3 rezando: 3 cidadãos vão rezar (a IA sozinha nem sempre junta 3 ao mesmo tempo)
      { label: 'templo', when: { all: [{ buildings: { player: 0, type: 'temple', complete: true }, gte: 1 }, { units: { player: 0, state: 'pray' }, lt: 3 }, { objective: 'temple', is: 'pending' }] }, every: 30,
        command: (s) => {
          const t = [...s.buildings.values()].find((b) => b.owner === 0 && !b.dead && b.complete && b.type === 'temple'); if (!t) return null;
          const ids = [...s.units.values()].filter((u) => u.owner === 0 && !u.dead && u.type === 'villager' && u.state !== 'pray').slice(0, 3).map((u) => u.id);
          return ids.length ? { type: 'pray', player: 0, ids, targetId: t.id } : null;
        } },
      // depois da Idade Clássica, Zeus revela o acampamento: o exército vai até ele (o início do jogador 1)
      { label: 'acampamento', when: { fired: 'reveal_camp' }, every: 45, command: (s) => { const b = buildingPos(s, 1) ?? s.map.starts[1]; return armyAttackMove(s, b.x, b.y); } },
    ],
  },
  m2_cerco: {
    minutes: 35, expect: [14, 32.5],
    // defesa (Centro Cívico, exército e reforços em casa): a IA do jogador nunca sai em ondas; quem ataca é o roteiro
    hold: { time: { gte: 0 } },
    steps: [
      // economia e exército de quem defende: cidadãos até 38 (a IA para em 26 na Clássica) e filas militares sempre cheias
      { label: 'cidadãos', when: { time: { gte: 3 } }, every: 4, command: (s) => trainVillagers(s, 38) },
      { label: 'treino', when: { time: { gte: 5 } }, every: 5, command: (s) => trainArmy(s, 0, { mix: M2_MIX, reserve: { food: 150, wood: 100, gold: 60 } }) },
      { label: 'tempestade', when: { time: { gte: 1 } }, every: 1, command: (s) => dodgeStorms(s) },
      // cidadãos com um militar inimigo a ≤ 6 tiles se abrigam (a IA do jogador só os guarnece com o exército fraco: com ele
      // forte, seguiam coletando no meio da invasão — no Difícil, com a IA de 09/2026, a onda dos 7 min levava 10 cidadãos)
      { label: 'refúgio', when: { time: { gte: 1 } }, every: 2, command: (s) => shelterVillagers(s, 6) },
      // resistidos os 12 minutos, reagrupa com os reforços de Esparta e, a partir dos 14 min, contra-ataca com vantagem
      { label: 'contra-ataque', when: { all: [{ objective: 'survive', is: 'done' }, { time: { gte: 840 } }] }, every: 5, command: (s) => m2Counter(s) },
      { label: 'poderes', when: { objective: 'survive', is: 'done' }, every: 3, command: (s) => battlePowers(s) },
      // quem já chegou perto do Centro Cívico alvo bate nele depois que os defensores em volta caíram (m2Siege)
      { label: 'cerco', when: { objective: 'survive', is: 'done' }, every: 5, command: (s) => m2Siege(s) },
    ],
  },
  m3_portal: {
    minutes: 40, expect: [17.5, 39],
    // defesa em casa enquanto o Culto reza; a IA do jogador nunca sai em ondas, quem ataca é o roteiro
    hold: { time: { gte: 0 } },
    steps: [
      { label: 'treino', when: { time: { gte: 5 } }, every: 5, command: (s) => trainArmy(s, 0, { reserve: { food: 150, wood: 100, gold: 60 } }) },
      { label: 'tempestade', when: { time: { gte: 1 } }, every: 1, command: (s) => dodgeStorms(s) },
      // aos 17,5 min (ritual em ~85 %), todo o exército assalta o Portal; perto dele, todos batem no Portal
      { label: 'portal', when: { all: [{ time: { gte: 1050 } }, { entity: { player: 1, type: 'titan_gate' }, exists: true }, { not: { fired: 'cronus_rises' } }] }, every: 30, command: (s) => { const g = buildingPos(s, 1, 'titan_gate'); return g ? armyAttackMove(s, g.x, g.y) : null; } },
      { label: 'cerco', when: { all: [{ entity: { player: 1, type: 'titan_gate' }, exists: true }, { not: { fired: 'cronus_rises' } }] }, every: 5, command: (s) => focusTarget(s, [...s.buildings.values()].find((b) => b.owner === 1 && b.type === 'titan_gate' && !b.dead)?.id, 12) },
      { label: 'poderes', when: { time: { gte: 2 } }, every: 3, command: (s) => battlePowers(s) },
      // se Cronos surgir, o exército o enfrenta quando ele chega perto de Argos (Raio: battlePowers)
      { label: 'cronos', when: { fired: 'cronus_rises' }, every: 10, command: (s) => { const c = [...s.units.values()].find((u) => u.owner === 1 && u.type === 'cronus' && !u.dead); const tc = buildingPos(s, 0, 'town_center'); if (!c || !tc) return null; const dx = c.x - tc.x, dy = c.y - tc.y; return dx * dx + dy * dy < 30 * 30 ? { type: 'attack', player: 0, ids: armyOf(s), targetId: c.id } : null; } },
    ],
  },
  m4_caucaso: {
    minutes: 40,
    // janela revista em 26/09/2026: a §4 (25–30 min ± 30 %) dava 17m30s, mas com a IA relativa ao centro do mapa a colônia cresce
    // mais depressa (Fácil, aos 13 min: 15 casas × 11 e Mítica aos 13 min × 15) e o roteiro, com os mesmos 55 militares, vence o
    // Fácil aos ~16 min (era 18m47s): a m4 ficou mais fácil no Fácil (docs/STORY.md §4 e §7.2). Não se freia o roteiro para caber
    // na janela antiga (o 55 → 60 da 1ª correção fazia isso e foi desfeito)
    expect: [15, 39], earlyOk: ['colonia'],
    // a IA do jogador nunca sai em ondas (o alvo "mais fraco" dela seria qualquer torre do mapa); quem ataca é o roteiro
    hold: { time: { gte: 0 } },
    steps: [
      // desembarque: os 5 cidadãos erguem o CC no centro do Vale da Cólquida já no 1º segundo (antes que a IA do jogador funde a
      // cidade na praia) e o resto sobe junto; a colônia fica pronta aos ~40 s (por isso earlyOk: a checagem d não vale para ela)
      { label: 'colônia', when: { time: { gte: 0 } }, command: (s) => {
        const vills = [...s.units.values()].filter((u) => u.owner === 0 && !u.dead && u.type === 'villager').map((u) => u.id);
        const rest = [...s.units.values()].filter((u) => u.owner === 0 && !u.dead && u.type !== 'villager').map((u) => u.id);
        const cmds: Command[] = [];
        if (vills.length) cmds.push({ type: 'build', player: 0, ids: vills, building: 'town_center', tx: M4_COLONY.tx, ty: M4_COLONY.ty });
        if (rest.length) cmds.push({ type: 'move', player: 0, ids: rest, x: 48, y: 90 });
        return cmds;
      } },
      // economia de quem começa sem nada: cidadãos além da meta da IA e filas militares cheias
      { label: 'cidadãos', when: { objective: 'colonia', is: 'done' }, every: 4, command: (s) => trainVillagers(s, 42) },
      { label: 'treino', when: { objective: 'colonia', is: 'done' }, every: 5, command: (s) => trainArmy(s, 0, { mix: M4_MIX, reserve: { food: 150, wood: 150, gold: 80 } }) },
      // a cada segundo (a cada 2 s, a IA do jogador — que libera as guarnições 20 s depois de cada ameaça — às vezes o soltava
      // bem quando chegava uma vingança, e ele saía para lutar: derrota no Difícil aos 15m24s com a IA de 09/2026)
      { label: 'héracles', when: { time: { gte: 2 } }, every: 1, command: (s) => m4HeroCare(s) },
      { label: 'torres', when: { objective: 'colonia', is: 'done' }, every: 20, command: (s) => m4ChokeTower(s) },
      { label: 'madeira', when: { objective: 'colonia', is: 'done' }, every: 15, command: (s) => m4Wood(s) },
      { label: 'poderes', when: { time: { gte: 2 } }, every: 3, command: (s) => battlePowers(s) },
      // Difícil: a 2ª cidade é obrigatória — Civismo I na Academia e o CC no vale lateral
      { label: 'civismo', when: { all: [{ difficulty: 'hard' }, { buildings: { player: 0, type: 'academy', complete: true }, gte: 1 }, { objective: 'cidades_dificil', is: 'pending' }] }, every: 10, command: (s) => {
        const p = s.players[0]; if (p.techs.includes('civic1')) return null;
        const ac = [...s.buildings.values()].find((b) => b.owner === 0 && !b.dead && b.complete && b.type === 'academy');
        return ac && canResearchNow(s, ac.id, 'civic1') ? { type: 'research', player: 0, buildingId: ac.id, tech: 'civic1' } : null;
      } },
      { label: '2ª cidade', when: { all: [{ difficulty: 'hard' }, { buildings: { player: 0, type: 'town_center' }, lt: 2 }, { objective: 'cidades_dificil', is: 'pending' }] }, every: 15, command: (s) => {
        const p = s.players[0]; if (!p.techs.includes('civic1') || p.resources.wood < 320 || p.resources.gold < 170) return null;
        const vills = [...s.units.values()].filter((u) => u.owner === 0 && !u.dead && u.type === 'villager' && u.state !== 'build').slice(0, 4).map((u) => u.id);
        return vills.length ? { type: 'build', player: 0, ids: vills, building: 'town_center', tx: M4_SECOND.tx, ty: M4_SECOND.ty } : null;
      } },
      // as três correntes em sequência (corrente1 → corrente2 → corrente3), cada uma quando o exército tem ≥ M4_ASSAULT_ARMY
      // militares (estado, não relógio); fora dos assaltos, quem persegue inimigos desfiladeiro acima volta ao vale (não se toma
      // um platô por acaso). No Fácil, Héracles vai à retaguarda do assalto à corrente3 e caça a Águia (m4HeroMove)
      { label: 'disciplina', when: { not: { fired: 'libertado' } }, every: 5, command: (s) => (m4AssaultTarget(s) ? null : m4Regroup(s)) },
      { label: 'assalto', when: { not: { fired: 'libertado' } }, every: 15, command: (s) => { const t = m4AssaultTarget(s); return t ? m4Assault(s, t) : null; } },
      { label: 'héracles no front', when: { entity: { tag: 'corrente2' }, exists: false }, every: 3, command: (s) => m4HeroMove(s) },
      // libertado: (Fácil) Héracles caça a Águia com o exército de escolta; depois, com Prometeu, a Fortaleza
      { label: 'fortaleza', when: { fired: 'libertado' }, every: 10, command: (s) => m4Fortress(s) },
    ],
  },
  m5_itaca: {
    minutes: 40, expect: [14, 32.5],
    // jogador paciente: guarda Odisseu na praia até o Emissário voltar (15/16/17 min) e o traz na trégua comprada; a escolta ativa
    // sem trégua (os caçadores das fogueiras e o vau) é a variante "escolta", logo abaixo (docs/STORY.md §5.2)
    // a IA do jogador nunca sai em ondas (defende Argos da Liga); Odisseu, os náufragos, a escolta e a guarda do Heraion são do roteiro
    hold: { time: { gte: 0 } },
    detach: (s) => m5Detach(s),
    // o ouro do resgate fica separado a partir dos 8 min (a IA não o gasta; vende a sobra de madeira e comida no Mercado). Antes
    // ficava desde o 1º segundo; com a Liga sem as desvantagens de orientação (26/09/2026) a 1ª onda dela chega aos ~7 min no
    // Difícil com 11 tecnologias contra 3 de Argos (sem ouro para pesquisar) e arrasava a cidade: quem joga só junta o resgate
    // quando a oferta se aproxima (15/16/17 min) e antes disso investe no exército
    reserve: { when: { all: [{ time: { gte: M5_SAVE_FROM } }, { not: { fired: 'resgate_pago' } }, { objective: 'escolta', is: 'pending' }] }, resources: { gold: 1500 } },
    steps: [
      // a escolta do mapa (6 hoplitas, 4 toxotas, 2 hipeus) desce a Via Sagrada até a praia pelo vau sul, sem se desviar para caçar
      { label: 'escolta', when: { all: [{ time: { gte: 15 } }, { objective: 'encontrar', is: 'pending' }] }, every: 4, command: (s) => m5Outbound(s) },
      // na praia: Odisseu junto ao casco (defensivo), os náufragos atrás e a escolta à frente; reforços quando ela encolhe
      { label: 'posto', when: { all: [{ objective: 'encontrar', is: 'done' }, { not: { fired: 'resgate_pago' } }] }, every: 4, command: (s) => [...m5Outbound(s), ...m5Post(s)] },
      { label: 'odisseu', when: { time: { gte: 1 } }, every: 2, command: (s) => m5Care(s) },
      { label: 'reforço', when: { all: [{ objective: 'encontrar', is: 'done' }, { not: { fired: 'resgate_pago' } }] }, every: 15, command: (s) => m5Reinforce(s) },
      { label: 'heraion', when: { all: [{ time: { gte: 30 } }, { objective: 'escolta', is: 'pending' }] }, every: 5, command: (s) => m5Heraion(s) },
      { label: 'torres', when: { all: [{ time: { gte: 120 } }, { objective: 'escolta', is: 'pending' }] }, every: 10, command: (s) => m5HeraionTower(s) },
      { label: 'mercado', when: { time: { gte: 20 } }, every: 10, command: (s) => m5Market(s) },
      // filas militares cheias; dos 8 min até pagar o resgate, só com a sobra acima dele
      { label: 'treino', when: { time: { gte: 5 } }, every: 5, command: (s) => trainArmy(s, 0, { reserve: s.scenario?.fired.includes('resgate_pago') || s.tick < M5_SAVE_FROM * TICK_RATE ? { food: 150, wood: 100, gold: 60 } : { food: 150, wood: 100, gold: 1560 } }) },
      { label: 'poderes', when: { time: { gte: 2 } }, every: 3, command: (s) => battlePowers(s) },
      { label: 'tempestade', when: { time: { gte: 1 } }, every: 1, command: (s) => dodgeStorms(s) },
      // trégua comprada: náufragos, Odisseu e escolta sobem a Via Sagrada (vau sul → Heraion → colina de Argos)
      { label: 'viagem', when: { all: [{ fired: 'resgate_pago' }, { objective: 'escolta', is: 'pending' }] }, every: 3, command: (s) => m5Travel(s) },
    ],
    variants: [{
      // escolta ativa, sem Mercado nem trégua: a escolta do mapa chega à praia, os reforços de casa a completam até M5_CONVOY
      // militares e o comboio sobe a Via Sagrada sob os caçadores das fogueiras e a emboscada do vau
      label: 'escolta', minutes: 25, expect: [5, 14],
      fired: ['estrada_aviso', 'vau'], notFired: ['oferta', 'resgate_pago', 'sinais_caem'],
      hold: { time: { gte: 0 } },
      detach: (s) => m5Detach(s),
      steps: [
        { label: 'escolta', when: { all: [{ time: { gte: 15 } }, { objective: 'encontrar', is: 'pending' }] }, every: 4, command: (s) => m5Outbound(s) },
        { label: 'comboio', when: { all: [{ objective: 'encontrar', is: 'done' }, { objective: 'escolta', is: 'pending' }] }, every: 2, command: (s) => m5ConvoyOrPost(s) },
        { label: 'odisseu', when: { time: { gte: 1 } }, every: 2, command: (s) => m5Care(s) },
        { label: 'reforço', when: { objective: 'encontrar', is: 'done' }, every: 15, command: (s) => (m5Departed.has(s) ? null : m5Reinforce(s, M5_CONVOY[s.config.campaignDifficulty ?? 'normal'] + 2)) },
        { label: 'heraion', when: { all: [{ time: { gte: 30 } }, { objective: 'escolta', is: 'pending' }] }, every: 5, command: (s) => m5Heraion(s) },
        { label: 'treino', when: { time: { gte: 5 } }, every: 5, command: (s) => trainArmy(s, 0, { reserve: { food: 150, wood: 100, gold: 60 } }) },
        { label: 'poderes', when: { time: { gte: 2 } }, every: 3, command: (s) => battlePowers(s) },
        { label: 'tempestade', when: { time: { gte: 1 } }, every: 1, command: (s) => dodgeStorms(s) },
      ],
    }],
  },
  m6_estatua: {
    minutes: 40, expect: [17.5, 39],
    // guarda da Maravilha: a IA do jogador nunca sai em ondas (o exército defende a Estátua e o Centro Cívico)
    hold: { time: { gte: 0 } },
    // na Mítica, junta o custo da Estátua antes de gastar em outra coisa (a IA sozinha gastaria tudo na Idade dos Titãs)
    reserve: { when: { all: [{ value: { stat: 'age', player: 0 }, gte: 3 }, { buildings: { player: 0, type: 'wonder_zeus' }, eq: 0 }] }, resources: { wood: 800, gold: 800, food: 600, favor: 100 } },
    steps: [
      // Idade Mítica (a IA pesquisa a 4ª linha da Academia e avança sozinha); com o custo guardado e 28 militares, a Estátua perto
      // do Centro Cívico com 6 cidadãos na obra; depois, torres ao redor e 6 cidadãos reparando sempre que ela sofrer dano
      { label: 'estatua', when: { all: [{ value: { stat: 'age', player: 0 }, gte: 3 }, { buildings: { player: 0, type: 'wonder_zeus' }, eq: 0 }] }, every: 5, command: (s) => m6Statue(s, 6, 28) },
      { label: 'torres', when: { buildings: { player: 0, type: 'wonder_zeus' }, gte: 1 }, every: 10, command: (s) => m6Towers(s, 4) },
      { label: 'reparo', when: { buildings: { player: 0, type: 'wonder_zeus' }, gte: 1 }, every: 5, command: (s) => m6Repair(s, 6) },
      // na Mítica, filas militares cheias só com a sobra acima do custo da Estátua (e, com ela de pé, acima de uma reserva pequena)
      { label: 'treino', when: { value: { stat: 'age', player: 0 }, gte: 3 }, every: 5, command: (s) => trainArmy(s, 0, { reserve: firstBuilding(s, 'wonder_zeus') ? { food: 200, wood: 150, gold: 100 } : { food: 800, wood: 950, gold: 950, favor: 100 } }) },
      // o exército não se afasta da Estátua (ou do Centro Cívico, antes dela): quem passou de 28 tiles volta atacando pelo caminho
      { label: 'casa', when: { time: { gte: 10 } }, every: 5, command: (s) => m6Home(s, 28) },
      { label: 'tempestade', when: { time: { gte: 1 } }, every: 1, command: (s) => dodgeStorms(s) },
      { label: 'poderes', when: { time: { gte: 2 } }, every: 3, command: (s) => battlePowers(s) },
      // Colosso perto da Estátua: todo o exército por perto bate nele (Jasão tem dano triplo em míticas)
      { label: 'colosso', when: { fired: 'obra' }, every: 3, command: (s) => { const w = firstBuilding(s, 'wonder_zeus'); const c = w ? enemyNear(s, w.x, w.y, 16, (u) => u.type === 'colossus') : null; return c ? focusTarget(s, c.id, 22) : null; } },
    ],
  },
  m7_aquiles: {
    minutes: 40, expect: [14, 39],
    // a IA do jogador nunca sai em ondas (o alvo "mais fraco" dela seria o acampamento, e o assalto é do roteiro); ela defende as
    // aldeias sozinha quando os mirmidões chegam perto dos edifícios dela
    hold: { time: { gte: 0 } },
    // o Oráculo e o Raio ficam para o roteiro: a IA gastaria o Oráculo no 2º segundo e o Raio no primeiro mirmidão perto de casa
    keepPowers: ['oracle', 'bolt'],
    steps: [
      { label: 'cidadãos', when: { time: { gte: 3 } }, every: 4, command: (s) => trainVillagers(s, 40) },
      { label: 'treino', when: { time: { gte: 5 } }, every: 5, command: (s) => trainArmy(s, 0, { mix: M7_MIX, reserve: { food: 150, wood: 100, gold: 80 } }) },
      // cavalaria para chegar antes dele e petróbolos para as naus (a IA sozinha nem sempre ergue o Estábulo e a Oficina)
      { label: 'estábulo', when: { time: { gte: 60 } }, every: 20, command: (s) => m7Build(s, 'stable') },
      { label: 'oficina', when: { time: { gte: 60 } }, every: 20, command: (s) => m7Build(s, 'siege_workshop') },
      // Apolo fala aos 90 s; o Oráculo sai quando Aquiles marcha (rota1, 150 s): o mapa inteiro por 60 s, para ver a rota
      { label: 'oráculo', when: { fired: 'rota1' }, command: () => ({ type: 'power', player: 0, power: 'oracle' }) },
      // "esteja onde ele vai estar" (Odisseu): depois da 1ª marcha, o exército espera Aquiles na aldeia da vez (aldeia2, 3, 4)
      { label: 'vigia', when: { all: [{ fired: 'rota1' }, { not: { fired: 'isca' } }] }, every: 5, command: (s) => m7Guard(s) },
      // Raio em Aquiles quando ele encosta no exército (Tétis o devolve às naus) e Restauração nos feridos
      { label: 'poderes', when: { fired: 'rota1' }, every: 2, command: (s) => battlePowers(s) },
      // com o exército formado, as naus: enquanto o acampamento estiver de pé, Tétis devolve Aquiles a cada queda
      { label: 'naus', when: { entity: { tag: 'acampamento' }, exists: true }, every: 5, command: (s) => m7Assault(s) },
      // sem as naus, Aquiles vem até Argos (isca): todos atrás dele e foco nele
      { label: 'caça', when: { fired: 'isca' }, every: 5, command: (s) => m7Hunt(s) },
    ],
  },
  m8_oceano: {
    minutes: 50, expect: [21, 45.5],
    // defesa: a IA do jogador nunca sai em ondas (o exército guarda a crista); o Raio fica para a última maré (m8Bolt)
    hold: { time: { gte: 0 } },
    keepPowers: ['bolt'],
    detach: (s) => m8Detach(s, false),
    atEnd: M8_FOUGHT,
    steps: m8Steps(false),
    variants: [{
      // a 3ª resposta da ficha: Idade dos Titãs e Prometeu pelo Portal (Fortaleza, 6 pesquisas da Academia, a Idade e o Portal,
      // com os cofres na ordem); Prometeu entra na luta junto dos heróis e o Raio continua guardado para a última maré
      label: 'titãs', minutes: 50, expect: [21, 45.5], fired: ['prometeu'],
      hold: { time: { gte: 0 } },
      keepPowers: ['bolt'],
      detach: (s) => m8Detach(s, true),
      atEnd: M8_FOUGHT,
      reserve: [
        { when: { not: { fired: 'prometeu' } }, resources: { favor: 500, knowledge: 1000 } },
        { when: { buildings: { player: 0, type: 'fortress' }, eq: 0 }, resources: { wood: 400, gold: 300 } },
        { when: { all: [{ buildings: { player: 0, type: 'fortress', complete: true }, gte: 1 }, { value: { stat: 'age', player: 0 }, lt: 4 }] }, resources: { food: 1500, gold: 1500 } },
        { when: { all: [{ value: { stat: 'age', player: 0 }, gte: 4 }, { buildings: { player: 0, type: 'titan_gate' }, eq: 0 }] }, resources: { food: 600, wood: 600, gold: 600 } },
      ],
      steps: m8Steps(true),
    }],
  },
  m9_tenaro: {
    minutes: 40, expect: [17.5, 39],
    // a IA do jogador (Hades) nunca sai em ondas: quem ataca as jaulas e as fendas é o roteiro, um alvo por vez
    hold: { time: { gte: 0 } },
    steps: [
      { label: 'cidadãos', when: { time: { gte: 3 } }, every: 4, command: (s) => trainVillagers(s, 40) },
      { label: 'casas', when: { time: { gte: 3 } }, every: 5, command: (s) => m9House(s, 15) },
      { label: 'treino', when: { time: { gte: 5 } }, every: 5, command: (s) => trainArmy(s, 0, { mix: M9_MIX, reserve: { food: 150, wood: 100, gold: 80 } }) },
      { label: 'poderes', when: { time: { gte: 2 } }, every: 3, command: (s) => battlePowers(s) },
      { label: 'tempestade', when: { time: { gte: 1 } }, every: 1, command: (s) => dodgeStorms(s) },
      // jaulas e fendas na ordem da caminhada, cada uma quando o exército tem ≥ M9_ASSAULT_ARMY militares
      { label: 'assalto', when: { time: { gte: 10 } }, every: 10, command: (s) => { const t = m9AssaultTarget(s); return t ? m9Assault(s, t) : null; } },
    ],
  },
  m11_chamas: {
    // §4: 18 min (cronômetro fixo) ±30 %. Exceção de fato: toda vitória possível cai entre ~13 min (a última nau + o embarque;
    // ~14 no Difícil) e 18 min (as naus zarpam), dentro da janela — ela só confere a vitória; a prova é o atEnd (M11_END_CHECKS)
    minutes: 19, expect: [12.6, 23.4],
    // a IA do jogador defende a cidade e nunca sai em ondas; o êxodo, o arconte, a escolta e os poderes são do roteiro
    hold: { time: { gte: 0 } },
    keepPowers: ['bolt', 'curse', 'lightning_storm', 'ceasefire', 'restoration'],
    detach: (s) => m11Detach(s),
    atEnd: M11_END_CHECKS,
    steps: [
      { label: 'cidadãos', when: { time: { gte: 3 } }, every: 4, command: (s) => m11Villagers(s) },
      { label: 'treino', when: { time: { gte: 5 } }, every: 5, command: (s) => trainArmy(s, 0, { reserve: { food: 150, wood: 100, gold: 60 } }) },
      // as levas: uma por nau (a última com todos, antes de Cronos chegar à cidade); o sacerdote vai na 1ª
      { label: 'levas', when: { time: { gte: 2 } }, every: 3, command: (s) => m11Exodus(s) },
      { label: 'sacerdote', when: { time: { gte: 2 } }, every: 5, command: (s) => {
        const p = tagUnit(s, 'sacerdote'); if (!p || p.inside !== -1 || s.tick / TICK_RATE < m11Levas(m11Diff(s))[0].at || m11D2(p, M11_QUAY) <= 9 || p.state === 'move') return null;
        return { type: 'move', player: 0, ids: [p.id], x: M11_QUAY.x, y: M11_QUAY.y };
      } },
      // o arconte e o exército inicial descem com a 1ª leva; no porto, o arconte atrás do cais e a escolta na boca do porto
      { label: 'arconte', when: { time: { gte: 2 } }, every: 2, command: (s) => m11Archon(s) },
      // na última leva, o exército da cidade também desce ao porto
      { label: 'evacuação', when: { time: { gte: 2 } }, every: 10, command: (s) => { const l = m11Levas(m11Diff(s)); if (s.tick / TICK_RATE >= l[l.length - 1].at) m11Evacuate(s); return null; } },
      { label: 'poderes', when: { time: { gte: 2 } }, every: 1, command: (s) => m11Powers(s) },
    ],
  },
};

