// Harness de testes por missão (docs/STORY.md §7.2, Fase 3.5). Só para testes e scripts (nunca importado pelo jogo), mas
// determinístico como o núcleo: mesma missão + dificuldade + roteiro → mesmo stateHash.
//   runPassive: roda N minutos sem comandos do jogador 0 (viabilidade passiva).
//   runScripted: o jogador 0 ganha um estado de IA (aiThink a cada tick, economia e exército como numa partida IA × missão)
//                e, por cima, passos roteirizados { when: Condition, command } aplicados por applyCommand (via tick).
import { TICK_RATE, type Difficulty, type ResourceType } from '../constants';
import { BUILDINGS, UNITS } from '../data';
import type { Command, GameConfig, GameState, Unit } from '../types';
import { createGame, tick } from '../sim/game';
import { aiThink } from '../sim/ai';
import { stateHash } from '../net/hash';
import type { ObjectiveStatus, ScenarioDef } from './types';
import { validateScenario, type CampaignDifficulty, type Condition, type ScenarioFile } from './schema';
import { compileCondition, gameConfigFor } from './compile';
import { campaignMission, isCampaignMission, missionConfig, withCampaignDifficulty, type CampaignEntry } from './campaign';
import { canResearch, canTrain } from '../sim/commands';
import { getUnitStats } from '../sim/modifiers';
import { isEnemy, nearestNode } from '../sim/queries';
import { canPlaceBuilding } from '../sim/entities';
import { setRaidObserver, type RaidRecord } from './helpers';

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
}

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

function runOnce(src: MissionSource, opts: MissionRunOpts & { hold?: Condition }, steps: ScriptStep[] | null): MissionRunResult {
  const difficulty = opts.difficulty ?? 'normal';
  const raids: RaidRecord[] = [];
  const checks: MissionChecks = { noException: true, noEarlyObjective: true, oneTitanEach: true, raidsSpawned: true, deterministic: true };
  let id = typeof src === 'string' ? src : src.id;
  let state: GameState | null = null;
  const stepsFired: string[] = [];
  let error: string | undefined;
  setRaidObserver((r) => raids.push(r));
  try {
    const run = missionRunConfig(src, difficulty); id = run.id;
    state = createGame(run.config);
    const me = state.players[0];
    if (steps) me.ai = { difficulty: opts.playerAi ?? 'hard', nextThink: TICK_RATE * 2, lastAttack: 0, attackTarget: -1, waves: 0, rallyX: 0, rallyY: 0, defending: -1000, builderIds: [], lastExpand: 0, personality: (run.config.seed + 3) % 97 };
    const conds = (steps ?? []).map((s) => compileCondition(s.when));
    const hold = steps && opts.hold ? compileCondition(opts.hold) : null;
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
      if (steps && me.alive && !state.gameOver) aiThink(state, me);
      if (state.tick % TICK_RATE === 0) {
        const s = state.scenario;
        if (s && state.tick < 60 * TICK_RATE && Object.entries(s.objectives).some(([k, o]) => o === 'done' && !opts.earlyOk?.includes(k))) checks.noEarlyObjective = false;
        if (TITANS.length) {
          const n = new Map<string, number>();
          for (const u of state.units.values()) if (!u.dead && TITANS.includes(u.type)) n.set(u.type, (n.get(u.type) ?? 0) + 1);
          for (const v of n.values()) if (v > 1) checks.oneTitanEach = false;
        }
      }
    }
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
  };
}

function withDeterminism(src: MissionSource, opts: MissionRunOpts & { hold?: Condition }, steps: ScriptStep[] | null): MissionRunResult {
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
  /** Dificuldades em que a vitória dentro da janela não é exigida, com o motivo (listadas na saída; use só depois de esforço honesto). */
  exceptions?: ScriptExceptions;
  /** Objetivos que um jogador cumpre legitimamente antes de 60 s (ex.: a colônia da m4 com 5 construtores); a checagem (d) os ignora. */
  earlyOk?: string[];
}

/** Veredito de um roteiro: ok (vitória dentro da janela), exceção declarada ou falha com o motivo. */
export interface ScriptVerdict { ok: boolean; inWindow: boolean; exception?: string; reason?: string }

/** Estrito por padrão: exige vitória dentro de `expect`; só uma exceção declarada para a dificuldade dispensa (e é informada). */
export function scriptVerdict(r: MissionRunResult, script: MissionScript | undefined): ScriptVerdict {
  if (!script) return { ok: false, inWindow: false, reason: 'missão sem roteiro em MISSION_SCRIPTS' };
  const [lo, hi] = script.expect;
  const inWindow = r.outcome === 'victory' && r.atSeconds >= lo * 60 && r.atSeconds <= hi * 60;
  if (inWindow) return { ok: true, inWindow };
  const reason = r.outcome !== 'victory' ? `${fmtOutcome(r)}: sem vitória dentro de ${script.minutes} min` : `${fmtOutcome(r)}: vitória fora da janela ${fmtMinSec(Math.round(lo * 60))}–${fmtMinSec(Math.round(hi * 60))}`;
  const exception = script.exceptions?.[r.difficulty];
  return exception ? { ok: true, inWindow, exception, reason } : { ok: false, inWindow, reason };
}

/** Roda o roteiro de uma missão (MISSION_SCRIPTS) numa dificuldade, com as opções do roteiro. */
export function runMissionScript(id: string, difficulty: CampaignDifficulty, deterministic = false): MissionRunResult {
  const sc = MISSION_SCRIPTS[id];
  return runScripted(id, { minutes: sc?.minutes ?? 30, difficulty, steps: sc?.steps ?? [], deterministic, playerAi: sc?.playerAi, hold: sc?.hold, earlyOk: sc?.earlyOk });
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
 * ocioso ou longe do alvo (sem atropelar quem já está lutando).
 */
function m2Counter(state: GameState): Command | null {
  const ours = militaryCount(state, 0), theirs = militaryCount(state, 1);
  if (ours < 30 || ours < 2.5 * theirs) return null;
  const id = state.scenario?.vars.targetTc; const b = id !== undefined ? state.buildings.get(id) : undefined; if (!b || b.dead) return null;
  const ids = armyOf(state).filter((uid) => { const u = state.units.get(uid)!; const dx = u.x - b.x, dy = u.y - b.y; return u.state === 'idle' || (dx * dx + dy * dy > 25 * 25 && u.state !== 'attack'); });
  return ids.length ? { type: 'attackMove', player: 0, ids, x: b.x, y: b.y } : null;
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
      // resistidos os 12 minutos, reagrupa com os reforços de Esparta e, a partir dos 14 min, contra-ataca com vantagem
      { label: 'contra-ataque', when: { all: [{ objective: 'survive', is: 'done' }, { time: { gte: 840 } }] }, every: 5, command: (s) => m2Counter(s) },
      { label: 'poderes', when: { objective: 'survive', is: 'done' }, every: 3, command: (s) => battlePowers(s) },
      // quem já chegou perto do Centro Cívico alvo bate nele (o ataque-movimento se distrai com a Fortaleza e as casas)
      { label: 'cerco', when: { objective: 'survive', is: 'done' }, every: 5, command: (s) => focusTarget(s, s.scenario!.vars.targetTc, 22) },
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
    minutes: 40, expect: [17.5, 39], earlyOk: ['colonia'],
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
      { label: 'héracles', when: { time: { gte: 2 } }, every: 2, command: (s) => m4HeroCare(s) },
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
};

