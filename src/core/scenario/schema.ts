// Cenário declarativo em JSON (docs/EDITOR.md §2.3): gramática FECHADA e tipada, sem eval, sem expressões em string.
// Cada operador mapeia 1:1 num helper (compile.ts → helpers.ts). Textos ({ pt, en } ou string) são resolvidos por tx()
// no momento de emitir e nunca entram no estado nem no hash. validateScenario é pura e nunca lança: só devolve issues.
import { DIFFICULTIES, GAME_MODES, MAP_SIZES, MAP_TYPES, MAX_PLAYERS, RESOURCES, type GameMode, type MapType, type ResourceType } from '../constants';
import { BUILDINGS, MAJOR_GODS, MAX_AGE, MINOR_GODS, TECHS, UNITS } from '../data';
import type { GameConfig, UnitState } from '../types';
import { validateMap, type FixedMapData } from '../map/fixed';
import { CAMPAIGN_PLAN } from './official';

// ---------------------------------------------------------------------------------------------------------------
// Tipos (contrato de §2.3)
// ---------------------------------------------------------------------------------------------------------------

/** Texto exibível: string simples ou por idioma (pt obrigatório). Resolvido por tx() ao emitir. */
export type Text = string | { pt: string; en?: string };
/** Jogador: índice; 'local' = primeiro humano; { team } = primeiro do time; '$p' = jogador do forEachPlayer. */
export type PlayerSel = number | 'local' | { team: number } | '$p';
export type EntityRef =
  | { tag: string; pick?: 'first' | 'nearest' | 'alive'; near?: Point }                // grupo da tag: first = vars['#tag']; alive = primeiro vivo; nearest = mais perto de near
  | { var: string } | { tc: PlayerSel }
  | { player: PlayerSel; type: string; pick?: 'first' | 'nearest'; near?: Point };   // first = menor id; nearest desempata por id
export type Point =
  | { at: [number, number] } | { start: number; dx?: number; dy?: number }
  | { tc: PlayerSel; dx?: number; dy?: number } | { entity: EntityRef; dx?: number; dy?: number };
export type StatName = 'age' | 'pop' | 'popCap' | 'food' | 'wood' | 'gold' | 'favor' | 'knowledge' | 'alive' | 'difficulty';
/** { stat: 'difficulty' } dispensa player: 0 = Fácil, 1 = Normal, 2 = Difícil (config.campaignDifficulty). */
export type Value = number | { stat: Exclude<StatName, 'difficulty'>; player: PlayerSel } | { stat: 'difficulty'; player?: PlayerSel } | { var: string } | { add: [Value, number] };
export type CampaignDifficulty = 'easy' | 'normal' | 'hard';
export interface Cmp { gte?: Value; lte?: Value; eq?: Value; gt?: Value; lt?: Value }

export interface UnitFilter {
  player: PlayerSel; type?: string | string[]; tag?: string; excludeTag?: string; state?: UnitState;
  military?: boolean;                                          // helpers.military: tag 'military' e não 'scout'
  near?: { point: Point; radius: number };                     // dx²+dy² < r², sem trigonometria
  reachable?: { buildingsOf: BuildingFilter };                 // rectReachable (objetivo da Horda)
}
export interface BuildingFilter { player?: PlayerSel; team?: number; notTeam?: number; type?: string | string[]; complete?: boolean; tag?: string }   // tag: o grupo inteiro (#tag[k])

export type Condition =
  | { all: Condition[] } | { any: Condition[] } | { not: Condition }
  | { time: Cmp } | { every: { seconds: number; after?: number } }          // ctx.seconds inteiro; seconds % n === 0
  | { objective: string; is: 'pending' | 'done' | 'failed' } | { fired: string } | ({ firedCount: { prefix: string } } & Cmp)
  | ({ units: UnitFilter } & Cmp) | ({ buildings: BuildingFilter } & Cmp) | ({ value: Value } & Cmp) | ({ var: string } & Cmp)
  | { entity: EntityRef; exists: boolean; complete?: boolean; progress?: Cmp }
  // G2: fim de partida em cenário (segundos segurados da colina pelo time T; segundos com a Maravilha de pé; rei vivo; jogador vivo)
  | ({ koth: { team: number } } & Cmp) | ({ wonderHeld: { player: PlayerSel } } & Cmp) | { kingAlive: PlayerSel } | { alive: PlayerSel }
  // G3: dificuldade da campanha (config.campaignDifficulty; ausente = normal)
  | { difficulty: CampaignDifficulty | CampaignDifficulty[] };

export type Action =
  | { do: 'say'; speaker: Text; text: Text; icon?: string }
  | { do: 'objective'; id: string; status: 'done' | 'failed' | 'pending' } | { do: 'reveal'; id: string }
  | { do: 'raid'; player: PlayerSel; units: string[]; target: Point; angle: number | { base: number; perIndex: number }; distance?: number }
  | { do: 'spawn'; player: PlayerSel; units: string[]; at: Point; tag?: string; state?: 'pray'; prayAt?: EntityRef; scaled?: boolean }   // scaled: escala como raid (scaledGroup)
  | { do: 'place'; player: PlayerSel; building: string; at: Point; exact?: boolean; complete?: boolean; progress?: number; tag?: string }
  | { do: 'give'; player: PlayerSel; resources: Partial<Record<ResourceType, number>> }
  | { do: 'set'; player: PlayerSel; age?: number; resources?: Partial<Record<ResourceType, number>>; techs?: string[]; minorGods?: string[] }
  | { do: 'removeAll'; player?: PlayerSel; team?: number }
  | { do: 'setVar'; name: string; value: Value } | { do: 'addVar'; name: string; delta: number }
  | { do: 'storeEntity'; var: string; entity: EntityRef } | { do: 'advanceBuild'; entity: EntityRef; seconds: number }
  | { do: 'order'; units: { tag: string } | UnitFilter; order: { type: 'move' | 'attackMove'; at: Point } | { type: 'attack' | 'gather' | 'pray' | 'repair'; target: EntityRef } }
  | { do: 'kill'; entity: EntityRef } | { do: 'ceasefire'; seconds: number }
  | { do: 'forEachPlayer'; team?: number; alive?: boolean; then: Action[] };   // dentro: '$p' = jogador, índice k para angle.perIndex

export type ScenarioHud =
  | { type: 'countdown'; seconds: number; while: Condition; label: Text }
  | { type: 'progress'; entity: EntityRef; max: number; label: Text };

export interface ScenarioObjectiveDef { id: string; text: Text; optional?: boolean; hidden?: boolean; done?: Condition; failed?: Condition }
export interface ScenarioTriggerDef { id: string; when: Condition; then: Action[]; repeat?: boolean }

export interface ScenarioFile {
  format: 'aoe-scenario'; version: 1;
  id: string; title: Text; subtitle?: Text; icon?: string; intro: Text[]; outro?: Text[]; hints?: Text[];
  map?: { gen: { mapSize: 'small' | 'medium' | 'large'; mapType?: MapType; seed: number } } | { data: FixedMapData };   // omitido quando embutido num mapa
  config: {
    seed?: number; players: GameConfig['players']; startingAge?: number; startingResources?: Partial<Record<ResourceType, number>>;
    revealMap?: boolean; startKit?: boolean | boolean[]; mode?: GameMode; campaignDifficulty?: 'easy' | 'normal' | 'hard';
  };
  vars?: Record<string, number>;
  setup?: Action[];                              // após as entidades do mapa; tags → vars['#tag'] = id
  objectives: ScenarioObjectiveDef[];
  triggers: ScenarioTriggerDef[];
  victory: Condition; defeat?: Condition;        // a derrota implícita do runner (humanos do time local sem nada) continua
  hud?: ScenarioHud[];
}

/** Limites de um arquivo de cenário. */
export const SCENARIO_LIMITS = { maxJsonBytes: 256 * 1024, maxDepth: 8, maxObjectives: 64, maxTriggers: 256 } as const;
/** Ids reservados (campanha/Horda/conquistas) para arquivos externos, inclusive as missões oficiais ainda sem arquivo; prefixo 'wave' é reservado em gatilhos. */
export const RESERVED_SCENARIO_IDS: readonly string[] = ['horde', ...CAMPAIGN_PLAN.map((m) => m.id)];
export const RESERVED_TRIGGER_PREFIX = 'wave';

/** Problema de validação. level ausente = 'error' (API antiga); 'warn' só aparece com opts.warnings (lint, G7). */
export interface ScenarioIssue { path: string; message: string; level?: 'error' | 'warn' }
export interface ValidateScenarioOpts { allowReserved?: boolean; warnings?: boolean }
/** Só os erros (issues sem level ou com level 'error'). */
export function scenarioErrors(issues: ScenarioIssue[]): ScenarioIssue[] { return issues.filter((i) => i.level !== 'warn'); }
/** Avisos do lint (G7): tag futura sem { fired }, objetivo oculto que nunca aparece, falas longas ou sem en. */
export function lintScenario(file: unknown): ScenarioIssue[] { return validateScenario(file, { allowReserved: true, warnings: true }).filter((i) => i.level === 'warn'); }
/** Tamanho máximo de uma fala (say) antes do aviso do lint. */
export const MAX_LINE_CHARS = 200;

// ---------------------------------------------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------------------------------------------

const CMP_KEYS = ['gte', 'lte', 'eq', 'gt', 'lt'] as const;
const STATS: readonly string[] = ['age', 'pop', 'popCap', 'food', 'wood', 'gold', 'favor', 'knowledge', 'alive', 'difficulty'];
const CAMPAIGN_DIFFS: readonly string[] = ['easy', 'normal', 'hard'];
const UNIT_STATES: readonly string[] = ['idle', 'move', 'attackMove', 'attack', 'gather', 'return', 'build', 'pray', 'hold', 'garrison'];
const OBJ_STATUS: readonly string[] = ['pending', 'done', 'failed'];
const ORDER_POINT = ['move', 'attackMove'], ORDER_TARGET = ['attack', 'gather', 'pray', 'repair'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Valida um arquivo de cenário. Devolve a lista de problemas (vazia = válido); nunca lança para JSON de tipo errado.
 * opts.allowReserved: aceita ids reservados (só para os arquivos embutidos em src/core/scenario/missions).
 */
export function validateScenario(file: unknown, opts: ValidateScenarioOpts = {}): ScenarioIssue[] {
  const issues: ScenarioIssue[] = [];
  const err = (path: string, message: string) => { issues.push({ path, message }); };
  if (!isObj(file)) return [{ path: '', message: 'esperado um objeto JSON' }];
  const f = file as Record<string, unknown>;

  // ---- tamanho ----
  let bytes = 0;
  try { bytes = JSON.stringify(file).length; } catch { bytes = Infinity; }
  if (bytes > SCENARIO_LIMITS.maxJsonBytes) err('', `arquivo com ${bytes} bytes; máximo ${SCENARIO_LIMITS.maxJsonBytes}`);

  // ---- cabeçalho ----
  if (f.format !== 'aoe-scenario') err('format', "esperado 'aoe-scenario'");
  if (f.version !== 1) err('version', 'versão desconhecida (esperado 1)');
  if (typeof f.id !== 'string' || f.id.length === 0) err('id', 'id obrigatório (texto não vazio)');
  else if (!opts.allowReserved && RESERVED_SCENARIO_IDS.includes(f.id)) err('id', `id reservado: '${f.id}'`);
  if (!isText(f.title)) err('title', 'título obrigatório (texto ou { pt, en })');
  if (f.subtitle !== undefined && !isText(f.subtitle)) err('subtitle', 'texto inválido');
  if (f.icon !== undefined && typeof f.icon !== 'string') err('icon', 'esperado texto');
  for (const k of ['intro', 'outro', 'hints'] as const) {
    if (f[k] === undefined) { if (k === 'intro') err(k, 'intro obrigatória (lista de textos)'); continue; }
    if (!Array.isArray(f[k])) { err(k, 'esperada uma lista de textos'); continue; }
    (f[k] as unknown[]).forEach((t, i) => { if (!isText(t)) err(`${k}[${i}]`, 'texto inválido'); });
  }

  // ---- config ----
  let nPlayers = 0;
  let mode: GameMode | undefined;
  if (!isObj(f.config)) err('config', 'config obrigatória');
  else {
    const c = f.config;
    if (!Array.isArray(c.players) || c.players.length === 0) err('config.players', 'lista de jogadores obrigatória (1 a ' + MAX_PLAYERS + ')');
    else {
      nPlayers = c.players.length;
      if (nPlayers > MAX_PLAYERS) err('config.players', `no máximo ${MAX_PLAYERS} jogadores`);
      c.players.forEach((p: unknown, i: number) => {
        const path = `config.players[${i}]`;
        if (!isObj(p)) { err(path, 'esperado um objeto'); return; }
        if (typeof p.name !== 'string') err(`${path}.name`, 'nome obrigatório');
        if (typeof p.god !== 'string' || !has(MAJOR_GODS, p.god)) err(`${path}.god`, `deus maior desconhecido: '${String(p.god)}'`);
        if (typeof p.isAI !== 'boolean') err(`${path}.isAI`, 'esperado true/false');
        if (typeof p.difficulty !== 'string' || !has(DIFFICULTIES, p.difficulty)) err(`${path}.difficulty`, `dificuldade desconhecida: '${String(p.difficulty)}'`);
        if (p.team !== undefined && !isInt(p.team)) err(`${path}.team`, 'esperado um inteiro');
      });
    }
    if (c.seed !== undefined && !isInt(c.seed)) err('config.seed', 'esperado um inteiro');
    if (c.startingAge !== undefined && (!isInt(c.startingAge) || c.startingAge < 0 || c.startingAge > MAX_AGE)) err('config.startingAge', `esperado um inteiro entre 0 e ${MAX_AGE}`);
    if (c.startingResources !== undefined) checkResources(c.startingResources, 'config.startingResources', err);
    if (c.revealMap !== undefined && typeof c.revealMap !== 'boolean') err('config.revealMap', 'esperado true/false');
    if (c.startKit !== undefined && typeof c.startKit !== 'boolean' && !(Array.isArray(c.startKit) && c.startKit.every((b) => typeof b === 'boolean'))) err('config.startKit', 'esperado true/false ou lista de true/false');
    if (c.mode !== undefined) { if (typeof c.mode === 'string' && GAME_MODES.includes(c.mode as GameMode)) mode = c.mode as GameMode; else err('config.mode', `modo desconhecido: '${String(c.mode)}'`); }
    if (c.campaignDifficulty !== undefined && !['easy', 'normal', 'hard'].includes(c.campaignDifficulty as string)) err('config.campaignDifficulty', "esperado 'easy', 'normal' ou 'hard'");
  }

  // ---- mapa ----
  if (f.map !== undefined) {
    if (!isObj(f.map)) err('map', 'esperado { gen } ou { data }');
    else if (isObj(f.map.gen)) {
      const g = f.map.gen;
      if (typeof g.mapSize !== 'string' || !has(MAP_SIZES, g.mapSize)) err('map.gen.mapSize', "esperado 'small', 'medium' ou 'large'");
      if (g.mapType !== undefined && !MAP_TYPES.includes(g.mapType as MapType)) err('map.gen.mapType', `tipo de mapa desconhecido: '${String(g.mapType)}'`);
      if (!isInt(g.seed)) err('map.gen.seed', 'semente obrigatória (inteiro)');
    } else if (f.map.data !== undefined) {
      if (!isObj(f.map.data)) err('map.data', 'esperado um mapa fixo (FixedMapData)');
      else {
        let mapIssues: ReturnType<typeof validateMap> = [];
        try { mapIssues = validateMap(f.map.data as unknown as FixedMapData, { players: nPlayers || undefined, mode }); } catch { mapIssues = [{ level: 'error', code: 'invalid' }]; }
        for (const mi of mapIssues) if (mi.level === 'error') err('map.data', `mapa fixo inválido: ${mi.code}${mi.x !== undefined ? ` em (${mi.x}, ${mi.y})` : ''}`);
      }
    } else err('map', 'esperado { gen } ou { data }');
  }

  // ---- vars ----
  if (f.vars !== undefined) {
    if (!isObj(f.vars)) err('vars', 'esperado um objeto { nome: número }');
    else for (const [k, v] of Object.entries(f.vars)) if (!isNum(v)) err(`vars.${k}`, 'esperado um número');
  }

  // ---- objetivos e gatilhos: ids ----
  const objIds = new Set<string>();
  const trigIds = new Set<string>();
  if (!Array.isArray(f.objectives)) err('objectives', 'lista de objetivos obrigatória');
  else {
    if (f.objectives.length > SCENARIO_LIMITS.maxObjectives) err('objectives', `no máximo ${SCENARIO_LIMITS.maxObjectives} objetivos`);
    f.objectives.forEach((o: unknown, i: number) => {
      const path = `objectives[${i}]`;
      if (!isObj(o)) { err(path, 'esperado um objeto'); return; }
      if (typeof o.id !== 'string' || o.id.length === 0) err(`${path}.id`, 'id obrigatório');
      else if (objIds.has(o.id)) err(`${path}.id`, `objetivo duplicado: '${o.id}'`);
      else objIds.add(o.id);
      if (!isText(o.text)) err(`${path}.text`, 'texto obrigatório');
      if (o.optional !== undefined && typeof o.optional !== 'boolean') err(`${path}.optional`, 'esperado true/false');
      if (o.hidden !== undefined && typeof o.hidden !== 'boolean') err(`${path}.hidden`, 'esperado true/false');
    });
  }
  if (!Array.isArray(f.triggers)) err('triggers', 'lista de gatilhos obrigatória');
  else {
    if (f.triggers.length > SCENARIO_LIMITS.maxTriggers) err('triggers', `no máximo ${SCENARIO_LIMITS.maxTriggers} gatilhos`);
    f.triggers.forEach((tr: unknown, i: number) => {
      const path = `triggers[${i}]`;
      if (!isObj(tr)) { err(path, 'esperado um objeto'); return; }
      if (typeof tr.id !== 'string' || tr.id.length === 0) err(`${path}.id`, 'id obrigatório');
      else {
        if (trigIds.has(tr.id)) err(`${path}.id`, `gatilho duplicado: '${tr.id}'`);
        else trigIds.add(tr.id);
        if (!opts.allowReserved && tr.id.startsWith(RESERVED_TRIGGER_PREFIX)) err(`${path}.id`, `prefixo reservado '${RESERVED_TRIGGER_PREFIX}': '${tr.id}'`);
      }
      if (tr.repeat !== undefined && typeof tr.repeat !== 'boolean') err(`${path}.repeat`, 'esperado true/false');
    });
  }

  // ---- condições e ações (com o conjunto de ids já conhecido) ----
  const v = new Validator(err, nPlayers, objIds, trigIds);
  if (Array.isArray(f.objectives)) f.objectives.forEach((o: unknown, i: number) => {
    if (!isObj(o)) return;
    if (o.done !== undefined) v.condition(o.done, `objectives[${i}].done`, 1, false);
    if (o.failed !== undefined) v.condition(o.failed, `objectives[${i}].failed`, 1, false);
  });
  if (Array.isArray(f.triggers)) f.triggers.forEach((tr: unknown, i: number) => {
    if (!isObj(tr)) return;
    if (tr.when === undefined) err(`triggers[${i}].when`, 'condição obrigatória'); else v.condition(tr.when, `triggers[${i}].when`, 1, false);
    if (!Array.isArray(tr.then)) err(`triggers[${i}].then`, 'lista de ações obrigatória'); else v.actions(tr.then, `triggers[${i}].then`, 1, false);
  });
  if (f.setup !== undefined) { if (!Array.isArray(f.setup)) err('setup', 'esperada uma lista de ações'); else v.actions(f.setup, 'setup', 1, false); }
  if (f.victory === undefined) err('victory', 'condição de vitória obrigatória'); else v.condition(f.victory, 'victory', 1, false);
  if (f.defeat !== undefined) v.condition(f.defeat, 'defeat', 1, false);
  if (f.hud !== undefined) {
    if (!Array.isArray(f.hud)) err('hud', 'esperada uma lista');
    else f.hud.forEach((h: unknown, i: number) => {
      const path = `hud[${i}]`;
      if (!isObj(h)) { err(path, 'esperado um objeto'); return; }
      if (!isText(h.label)) err(`${path}.label`, 'rótulo obrigatório');
      if (h.type === 'countdown') { if (!isNum(h.seconds)) err(`${path}.seconds`, 'esperado um número'); if (h.while === undefined) err(`${path}.while`, 'condição obrigatória'); else v.condition(h.while, `${path}.while`, 1, false); }
      else if (h.type === 'progress') { if (!isNum(h.max) || h.max <= 0) err(`${path}.max`, 'esperado um número positivo'); v.entity(h.entity, `${path}.entity`, false); }
      else err(`${path}.type`, "esperado 'countdown' ou 'progress'");
    });
  }
  if (opts.warnings) { try { lint(f, (path, message) => issues.push({ path, message, level: 'warn' })); } catch { /* arquivo malformado: os erros acima já dizem */ } }
  return issues;
}

function isText(v: unknown): v is Text { return typeof v === 'string' || (isObj(v) && typeof v.pt === 'string' && (v.en === undefined || typeof v.en === 'string')); }

function checkResources(r: unknown, path: string, err: (p: string, m: string) => void): void {
  if (!isObj(r)) { err(path, 'esperado um objeto { food, wood, gold, favor, knowledge }'); return; }
  for (const [k, val] of Object.entries(r)) {
    if (!(RESOURCES as readonly string[]).includes(k)) err(`${path}.${k}`, `recurso desconhecido: '${k}'`);
    else if (!isNum(val)) err(`${path}.${k}`, 'esperado um número');
  }
}

/** Percorre condições/ações com controle de profundidade e de '$p' (só dentro de forEachPlayer). */
class Validator {
  constructor(private err: (p: string, m: string) => void, private nPlayers: number, private objIds: Set<string>, private trigIds: Set<string>) {}

  private depthOk(depth: number, path: string): boolean {
    if (depth > SCENARIO_LIMITS.maxDepth) { this.err(path, `aninhamento acima de ${SCENARIO_LIMITS.maxDepth} níveis`); return false; }
    return true;
  }

  player(p: unknown, path: string, inLoop: boolean): void {
    if (isInt(p)) { if (p < 0 || (this.nPlayers > 0 && p >= this.nPlayers)) this.err(path, `jogador ${p} fora do intervalo (0 a ${this.nPlayers - 1})`); return; }
    if (p === 'local') return;
    if (p === '$p') { if (!inLoop) this.err(path, "'$p' só vale dentro de forEachPlayer"); return; }
    if (isObj(p) && isInt(p.team)) return;
    this.err(path, "jogador inválido (índice, 'local', { team } ou '$p')");
  }

  unitType(t: unknown, path: string): void { if (typeof t !== 'string' || !has(UNITS, t)) this.err(path, `unidade desconhecida: '${String(t)}'`); }
  buildingType(t: unknown, path: string): void { if (typeof t !== 'string' || !has(BUILDINGS, t)) this.err(path, `edifício desconhecido: '${String(t)}'`); }
  typeList(t: unknown, path: string, kind: 'unit' | 'building'): void {
    const one = (x: unknown, p: string) => (kind === 'unit' ? this.unitType(x, p) : this.buildingType(x, p));
    if (Array.isArray(t)) t.forEach((x, i) => one(x, `${path}[${i}]`)); else one(t, path);
  }

  entity(e: unknown, path: string, inLoop: boolean): void {
    if (!isObj(e)) { this.err(path, 'referência de entidade inválida'); return; }
    if (has(e, 'tag')) {
      if (typeof e.tag !== 'string') this.err(`${path}.tag`, 'esperado texto');
      if (e.pick !== undefined && e.pick !== 'first' && e.pick !== 'nearest' && e.pick !== 'alive') this.err(`${path}.pick`, "esperado 'first', 'nearest' ou 'alive'");
      if (e.pick === 'nearest' && e.near === undefined) this.err(`${path}.near`, "'nearest' exige um ponto em near");
      if (e.near !== undefined) this.point(e.near, `${path}.near`, inLoop);
      return;
    }
    if (has(e, 'var')) { if (typeof e.var !== 'string') this.err(`${path}.var`, 'esperado texto'); return; }
    if (has(e, 'tc')) { this.player(e.tc, `${path}.tc`, inLoop); return; }
    if (has(e, 'player')) {
      this.player(e.player, `${path}.player`, inLoop);
      if (typeof e.type !== 'string' || !(has(UNITS, e.type) || has(BUILDINGS, e.type))) this.err(`${path}.type`, `tipo desconhecido: '${String(e.type)}'`);
      if (e.pick !== undefined && e.pick !== 'first' && e.pick !== 'nearest') this.err(`${path}.pick`, "esperado 'first' ou 'nearest'");
      if (e.pick === 'nearest' && e.near === undefined) this.err(`${path}.near`, "'nearest' exige um ponto em near");
      if (e.near !== undefined) this.point(e.near, `${path}.near`, inLoop);
      return;
    }
    this.err(path, 'referência de entidade desconhecida (tag, var, tc ou player+type)');
  }

  point(p: unknown, path: string, inLoop: boolean): void {
    if (!isObj(p)) { this.err(path, 'ponto inválido'); return; }
    if (has(p, 'at')) { if (!Array.isArray(p.at) || p.at.length !== 2 || !isNum(p.at[0]) || !isNum(p.at[1])) this.err(`${path}.at`, 'esperado [x, y]'); return; }
    if (p.dx !== undefined && !isNum(p.dx)) this.err(`${path}.dx`, 'esperado um número');
    if (p.dy !== undefined && !isNum(p.dy)) this.err(`${path}.dy`, 'esperado um número');
    if (has(p, 'start')) { if (!isInt(p.start) || p.start < 0) this.err(`${path}.start`, 'esperado o índice de um início'); return; }
    if (has(p, 'tc')) { this.player(p.tc, `${path}.tc`, inLoop); return; }
    if (has(p, 'entity')) { this.entity(p.entity, `${path}.entity`, inLoop); return; }
    this.err(path, 'ponto desconhecido (at, start, tc ou entity)');
  }

  value(v: unknown, path: string, inLoop: boolean, depth = 1): void {
    if (isNum(v)) return;
    if (!isObj(v)) { this.err(path, 'valor inválido (número, { stat, player }, { var } ou { add })'); return; }
    if (!this.depthOk(depth, path)) return;
    if (has(v, 'stat')) {
      if (!STATS.includes(v.stat as string)) this.err(`${path}.stat`, `estatística desconhecida: '${String(v.stat)}'`);
      if (v.stat !== 'difficulty' || v.player !== undefined) this.player(v.player, `${path}.player`, inLoop);   // difficulty dispensa player
      return;
    }
    if (has(v, 'var')) { if (typeof v.var !== 'string') this.err(`${path}.var`, 'esperado texto'); return; }
    if (has(v, 'add')) {
      if (!Array.isArray(v.add) || v.add.length !== 2 || !isNum(v.add[1])) { this.err(`${path}.add`, 'esperado [valor, número]'); return; }
      this.value(v.add[0], `${path}.add[0]`, inLoop, depth + 1); return;
    }
    this.err(path, 'valor desconhecido');
  }

  cmp(c: Record<string, unknown>, path: string, inLoop: boolean, required: boolean): void {
    let n = 0;
    for (const k of CMP_KEYS) if (c[k] !== undefined) { n++; this.value(c[k], `${path}.${k}`, inLoop); }
    if (required && n === 0) this.err(path, 'comparação obrigatória (gte, lte, eq, gt ou lt)');
  }

  unitFilter(u: unknown, path: string, inLoop: boolean, depth: number): void {
    if (!isObj(u)) { this.err(path, 'filtro de unidades inválido'); return; }
    this.player(u.player, `${path}.player`, inLoop);
    if (u.type !== undefined) this.typeList(u.type, `${path}.type`, 'unit');
    if (u.tag !== undefined && typeof u.tag !== 'string') this.err(`${path}.tag`, 'esperado texto');
    if (u.excludeTag !== undefined && typeof u.excludeTag !== 'string') this.err(`${path}.excludeTag`, 'esperado texto');
    if (u.state !== undefined && !UNIT_STATES.includes(u.state as string)) this.err(`${path}.state`, `estado desconhecido: '${String(u.state)}'`);
    if (u.military !== undefined && typeof u.military !== 'boolean') this.err(`${path}.military`, 'esperado true/false');
    if (u.near !== undefined) {
      if (!isObj(u.near) || !isNum(u.near.radius)) this.err(`${path}.near`, 'esperado { point, radius }');
      else this.point(u.near.point, `${path}.near.point`, inLoop);
    }
    if (u.reachable !== undefined) {
      if (!isObj(u.reachable)) this.err(`${path}.reachable`, 'esperado { buildingsOf }');
      else this.buildingFilter(u.reachable.buildingsOf, `${path}.reachable.buildingsOf`, inLoop, depth + 1);
    }
  }

  buildingFilter(b: unknown, path: string, inLoop: boolean, _depth: number): void {
    if (!isObj(b)) { this.err(path, 'filtro de edifícios inválido'); return; }
    if (b.player !== undefined) this.player(b.player, `${path}.player`, inLoop);
    if (b.team !== undefined && !isInt(b.team)) this.err(`${path}.team`, 'esperado um inteiro');
    if (b.notTeam !== undefined && !isInt(b.notTeam)) this.err(`${path}.notTeam`, 'esperado um inteiro');
    if (b.type !== undefined) this.typeList(b.type, `${path}.type`, 'building');
    if (b.complete !== undefined && typeof b.complete !== 'boolean') this.err(`${path}.complete`, 'esperado true/false');
    if (b.tag !== undefined && typeof b.tag !== 'string') this.err(`${path}.tag`, 'esperado texto');
  }

  objectiveRef(id: unknown, path: string): void {
    if (typeof id !== 'string') this.err(path, 'esperado o id de um objetivo');
    else if (!this.objIds.has(id)) this.err(path, `objetivo sem definição: '${id}'`);
  }

  condition(c: unknown, path: string, depth: number, inLoop: boolean): void {
    if (!isObj(c)) { this.err(path, 'condição inválida'); return; }
    if (!this.depthOk(depth, path)) return;
    if (has(c, 'all') || has(c, 'any')) {
      const k = has(c, 'all') ? 'all' : 'any';
      if (!Array.isArray(c[k])) { this.err(`${path}.${k}`, 'esperada uma lista de condições'); return; }
      (c[k] as unknown[]).forEach((x, i) => this.condition(x, `${path}.${k}[${i}]`, depth + 1, inLoop)); return;
    }
    if (has(c, 'not')) { this.condition(c.not, `${path}.not`, depth + 1, inLoop); return; }
    if (has(c, 'time')) { if (!isObj(c.time)) this.err(`${path}.time`, 'esperada uma comparação'); else this.cmp(c.time, `${path}.time`, inLoop, true); return; }
    if (has(c, 'every')) {
      if (!isObj(c.every) || !isInt(c.every.seconds) || (c.every.seconds as number) <= 0) this.err(`${path}.every`, 'esperado { seconds (inteiro > 0), after? }');
      else if (c.every.after !== undefined && !isNum(c.every.after)) this.err(`${path}.every.after`, 'esperado um número');
      return;
    }
    if (has(c, 'objective')) { this.objectiveRef(c.objective, `${path}.objective`); if (!OBJ_STATUS.includes(c.is as string)) this.err(`${path}.is`, "esperado 'pending', 'done' ou 'failed'"); return; }
    if (has(c, 'fired')) { if (typeof c.fired !== 'string') this.err(`${path}.fired`, 'esperado o id de um gatilho'); else if (!this.trigIds.has(c.fired)) this.err(`${path}.fired`, `gatilho sem definição: '${c.fired}'`); return; }
    if (has(c, 'firedCount')) { if (!isObj(c.firedCount) || typeof c.firedCount.prefix !== 'string') this.err(`${path}.firedCount`, 'esperado { prefix }'); this.cmp(c, path, inLoop, true); return; }
    if (has(c, 'units')) { this.unitFilter(c.units, `${path}.units`, inLoop, depth); this.cmp(c, path, inLoop, true); return; }
    if (has(c, 'buildings')) { this.buildingFilter(c.buildings, `${path}.buildings`, inLoop, depth); this.cmp(c, path, inLoop, true); return; }
    if (has(c, 'value')) { this.value(c.value, `${path}.value`, inLoop); this.cmp(c, path, inLoop, true); return; }
    if (has(c, 'var')) { if (typeof c.var !== 'string') this.err(`${path}.var`, 'esperado texto'); this.cmp(c, path, inLoop, true); return; }
    if (has(c, 'entity')) {
      this.entity(c.entity, `${path}.entity`, inLoop);
      if (typeof c.exists !== 'boolean') this.err(`${path}.exists`, 'esperado true/false');
      if (c.complete !== undefined && typeof c.complete !== 'boolean') this.err(`${path}.complete`, 'esperado true/false');
      if (c.progress !== undefined) { if (!isObj(c.progress)) this.err(`${path}.progress`, 'esperada uma comparação'); else this.cmp(c.progress, `${path}.progress`, inLoop, true); }
      return;
    }
    if (has(c, 'koth')) { if (!isObj(c.koth) || !isInt(c.koth.team)) this.err(`${path}.koth`, 'esperado { team (inteiro) }'); this.cmp(c, path, inLoop, true); return; }
    if (has(c, 'wonderHeld')) { if (!isObj(c.wonderHeld)) this.err(`${path}.wonderHeld`, 'esperado { player }'); else this.player(c.wonderHeld.player, `${path}.wonderHeld.player`, inLoop); this.cmp(c, path, inLoop, true); return; }
    if (has(c, 'kingAlive')) { this.player(c.kingAlive, `${path}.kingAlive`, inLoop); return; }
    if (has(c, 'alive')) { this.player(c.alive, `${path}.alive`, inLoop); return; }
    if (has(c, 'difficulty')) {
      const d = c.difficulty;
      const ok = typeof d === 'string' ? CAMPAIGN_DIFFS.includes(d) : Array.isArray(d) && d.length > 0 && d.every((x) => typeof x === 'string' && CAMPAIGN_DIFFS.includes(x));
      if (!ok) this.err(`${path}.difficulty`, "esperado 'easy', 'normal', 'hard' ou uma lista deles");
      return;
    }
    this.err(path, `operador de condição desconhecido: ${Object.keys(c).join(', ') || '(vazio)'}`);
  }

  actions(list: unknown[], path: string, depth: number, inLoop: boolean): void {
    list.forEach((a, i) => this.action(a, `${path}[${i}]`, depth, inLoop));
  }

  action(a: unknown, path: string, depth: number, inLoop: boolean): void {
    if (!isObj(a)) { this.err(path, 'ação inválida'); return; }
    if (!this.depthOk(depth, path)) return;
    const units = (u: unknown, p: string) => { if (!Array.isArray(u) || u.length === 0) this.err(p, 'lista de unidades obrigatória'); else u.forEach((t, i) => this.unitType(t, `${p}[${i}]`)); };
    switch (a.do) {
      case 'say':
        if (!isText(a.speaker)) this.err(`${path}.speaker`, 'texto obrigatório');
        if (!isText(a.text)) this.err(`${path}.text`, 'texto obrigatório');
        if (a.icon !== undefined && typeof a.icon !== 'string') this.err(`${path}.icon`, 'esperado texto');
        return;
      case 'objective': this.objectiveRef(a.id, `${path}.id`); if (!OBJ_STATUS.includes(a.status as string)) this.err(`${path}.status`, "esperado 'pending', 'done' ou 'failed'"); return;
      case 'reveal': this.objectiveRef(a.id, `${path}.id`); return;
      case 'raid':
        this.player(a.player, `${path}.player`, inLoop); units(a.units, `${path}.units`); this.point(a.target, `${path}.target`, inLoop);
        if (!(isNum(a.angle) || (isObj(a.angle) && isNum(a.angle.base) && isNum(a.angle.perIndex)))) this.err(`${path}.angle`, 'esperado um número ou { base, perIndex }');
        if (a.distance !== undefined && !isNum(a.distance)) this.err(`${path}.distance`, 'esperado um número');
        return;
      case 'spawn':
        this.player(a.player, `${path}.player`, inLoop); units(a.units, `${path}.units`); this.point(a.at, `${path}.at`, inLoop);
        if (a.tag !== undefined && typeof a.tag !== 'string') this.err(`${path}.tag`, 'esperado texto');
        if (a.state !== undefined && a.state !== 'pray') this.err(`${path}.state`, "esperado 'pray'");
        if (a.prayAt !== undefined) this.entity(a.prayAt, `${path}.prayAt`, inLoop);
        if (a.state === 'pray' && a.prayAt === undefined) this.err(`${path}.prayAt`, "state 'pray' exige prayAt");
        if (a.scaled !== undefined && typeof a.scaled !== 'boolean') this.err(`${path}.scaled`, 'esperado true/false');
        return;
      case 'place':
        this.player(a.player, `${path}.player`, inLoop); this.buildingType(a.building, `${path}.building`); this.point(a.at, `${path}.at`, inLoop);
        if (a.exact !== undefined && typeof a.exact !== 'boolean') this.err(`${path}.exact`, 'esperado true/false');
        if (a.complete !== undefined && typeof a.complete !== 'boolean') this.err(`${path}.complete`, 'esperado true/false');
        if (a.progress !== undefined && !isNum(a.progress)) this.err(`${path}.progress`, 'esperado um número');
        if (a.tag !== undefined && typeof a.tag !== 'string') this.err(`${path}.tag`, 'esperado texto');
        return;
      case 'give': this.player(a.player, `${path}.player`, inLoop); checkResources(a.resources, `${path}.resources`, this.err); return;
      case 'set':
        this.player(a.player, `${path}.player`, inLoop);
        if (a.age !== undefined && (!isInt(a.age) || a.age < 0 || a.age > MAX_AGE)) this.err(`${path}.age`, `esperado um inteiro entre 0 e ${MAX_AGE}`);
        if (a.resources !== undefined) checkResources(a.resources, `${path}.resources`, this.err);
        if (a.techs !== undefined) { if (!Array.isArray(a.techs)) this.err(`${path}.techs`, 'esperada uma lista'); else a.techs.forEach((t, i) => { if (typeof t !== 'string' || !has(TECHS, t)) this.err(`${path}.techs[${i}]`, `tecnologia desconhecida: '${String(t)}'`); }); }
        if (a.minorGods !== undefined) { if (!Array.isArray(a.minorGods)) this.err(`${path}.minorGods`, 'esperada uma lista'); else a.minorGods.forEach((g, i) => { if (typeof g !== 'string' || !has(MINOR_GODS, g)) this.err(`${path}.minorGods[${i}]`, `deus menor desconhecido: '${String(g)}'`); }); }
        return;
      case 'removeAll':
        if (a.player !== undefined) this.player(a.player, `${path}.player`, inLoop);
        if (a.team !== undefined && !isInt(a.team)) this.err(`${path}.team`, 'esperado um inteiro');
        if (a.player === undefined && a.team === undefined) this.err(path, 'removeAll exige player ou team');
        return;
      case 'setVar': if (typeof a.name !== 'string') this.err(`${path}.name`, 'nome obrigatório'); this.value(a.value, `${path}.value`, inLoop); return;
      case 'addVar': if (typeof a.name !== 'string') this.err(`${path}.name`, 'nome obrigatório'); if (!isNum(a.delta)) this.err(`${path}.delta`, 'esperado um número'); return;
      case 'storeEntity': if (typeof a.var !== 'string') this.err(`${path}.var`, 'nome obrigatório'); this.entity(a.entity, `${path}.entity`, inLoop); return;
      case 'advanceBuild': this.entity(a.entity, `${path}.entity`, inLoop); if (!isNum(a.seconds)) this.err(`${path}.seconds`, 'esperado um número'); return;
      case 'order': {
        if (!isObj(a.units)) this.err(`${path}.units`, 'esperado { tag } ou um filtro de unidades');
        else if (has(a.units, 'tag') && !has(a.units, 'player')) { if (typeof a.units.tag !== 'string') this.err(`${path}.units.tag`, 'esperado texto'); }
        else this.unitFilter(a.units, `${path}.units`, inLoop, depth);
        const o = a.order;
        if (!isObj(o)) { this.err(`${path}.order`, 'ordem inválida'); return; }
        if (ORDER_POINT.includes(o.type as string)) this.point(o.at, `${path}.order.at`, inLoop);
        else if (ORDER_TARGET.includes(o.type as string)) this.entity(o.target, `${path}.order.target`, inLoop);
        else this.err(`${path}.order.type`, `tipo de ordem desconhecido: '${String(o.type)}'`);
        return;
      }
      case 'kill': this.entity(a.entity, `${path}.entity`, inLoop); return;
      case 'ceasefire': if (!isNum(a.seconds)) this.err(`${path}.seconds`, 'esperado um número'); return;
      case 'forEachPlayer':
        if (a.team !== undefined && !isInt(a.team)) this.err(`${path}.team`, 'esperado um inteiro');
        if (a.alive !== undefined && typeof a.alive !== 'boolean') this.err(`${path}.alive`, 'esperado true/false');
        if (!Array.isArray(a.then)) this.err(`${path}.then`, 'lista de ações obrigatória'); else this.actions(a.then, `${path}.then`, depth + 1, true);
        return;
      default: this.err(`${path}.do`, `ação desconhecida: '${String(a.do)}'`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Lint (G7): avisos que não impedem o arquivo de rodar, mas quase sempre são erro de autoria
// ---------------------------------------------------------------------------------------------------------------

/**
 * 1) tag que só nasce num gatilho (spawn/place com tag dentro de `then`), usada numa condição que vale com o grupo
 *    ausente (exists:false, contagem que aceita 0, ou o contrário sob `not`) sem { fired: <gatilho que a cria> } num
 *    `all` acima dela — senão a condição vale no segundo 1;
 * 2) objetivo `hidden` sem done/failed e sem gatilho que o revele ou conclua (nunca aparece);
 * 3) fala (`say`) sem `en` ou com mais de MAX_LINE_CHARS caracteres.
 */
function lint(f: Record<string, unknown>, warn: (path: string, message: string) => void): void {
  const setupTags = new Set<string>();
  const triggerTags = new Map<string, Set<string>>();       // tag → gatilhos que a criam
  const touchedObjectives = new Set<string>();              // reveal/objective em gatilhos ou setup
  const eachAction = (list: unknown, path: string, visit: (a: Record<string, unknown>, path: string) => void): void => {
    if (!Array.isArray(list)) return;
    list.forEach((a, i) => {
      if (!isObj(a)) return;
      visit(a, `${path}[${i}]`);
      if (a.do === 'forEachPlayer') eachAction(a.then, `${path}[${i}].then`, visit);
    });
  };
  // mapa fixo no arquivo: tags das entidades existem desde o início
  const map = isObj(f.map) && isObj(f.map.data) ? f.map.data : undefined;
  if (map && Array.isArray(map.entities)) for (const e of map.entities) if (isObj(e) && typeof e.tag === 'string') setupTags.add(e.tag);
  const collect = (trig: string | null) => (a: Record<string, unknown>) => {
    if ((a.do === 'spawn' || a.do === 'place') && typeof a.tag === 'string') {
      if (trig === null) setupTags.add(a.tag);
      else { const set = triggerTags.get(a.tag) ?? new Set<string>(); set.add(trig); triggerTags.set(a.tag, set); }
    }
    if ((a.do === 'reveal' || a.do === 'objective') && typeof a.id === 'string') touchedObjectives.add(a.id);
  };
  eachAction(f.setup, 'setup', collect(null));
  const triggers = Array.isArray(f.triggers) ? f.triggers : [];
  for (const tr of triggers) if (isObj(tr) && typeof tr.id === 'string') eachAction(tr.then, '', collect(tr.id));

  // 1) tags futuras
  const zeroPasses = (c: Record<string, unknown>): boolean => {
    for (const k of CMP_KEYS) {
      const v = c[k]; if (v === undefined) continue;
      if (!isNum(v)) return true;   // valor dinâmico: pode aceitar 0
      if ((k === 'gte' && !(0 >= v)) || (k === 'lte' && !(0 <= v)) || (k === 'eq' && v !== 0) || (k === 'gt' && !(0 > v)) || (k === 'lt' && !(0 < v))) return false;
    }
    return true;
  };
  const check = (tag: unknown, risky: boolean, guards: Set<string>, path: string) => {
    if (typeof tag !== 'string' || !risky || setupTags.has(tag)) return;
    const creators = triggerTags.get(tag); if (!creators) return;
    for (const id of creators) if (guards.has(id)) return;
    const first = [...creators][0];
    warn(path, `tag '${tag}' só nasce no gatilho '${[...creators].join("', '")}': proteja a condição com { "fired": "${first}" } no mesmo all (senão ela vale no segundo 1)`);
  };
  const pointTag = (p: unknown): unknown => (isObj(p) && isObj(p.entity) ? p.entity.tag : undefined);
  const walk = (c: unknown, path: string, guards: Set<string>, negated: boolean): void => {
    if (!isObj(c)) return;
    if (Array.isArray(c.all)) {
      const g = new Set(guards);
      for (const x of c.all) if (isObj(x) && typeof x.fired === 'string') g.add(x.fired);
      c.all.forEach((x, i) => walk(x, `${path}.all[${i}]`, g, negated));
      return;
    }
    if (Array.isArray(c.any)) { c.any.forEach((x, i) => walk(x, `${path}.any[${i}]`, guards, negated)); return; }
    if (has(c, 'not')) { walk(c.not, `${path}.not`, guards, !negated); return; }
    if (isObj(c.entity)) { check(c.entity.tag, (c.exists === false) !== negated, guards, `${path}.entity.tag`); return; }
    if (isObj(c.units)) {
      const risky = zeroPasses(c) !== negated;
      check(c.units.tag, risky, guards, `${path}.units.tag`);
      if (isObj(c.units.near)) check(pointTag(c.units.near.point), risky, guards, `${path}.units.near.point`);
      return;
    }
    if (isObj(c.buildings)) check(c.buildings.tag, zeroPasses(c) !== negated, guards, `${path}.buildings.tag`);
  };
  const objectives = Array.isArray(f.objectives) ? f.objectives : [];
  objectives.forEach((o, i) => { if (!isObj(o)) return; walk(o.done, `objectives[${i}].done`, new Set(), false); walk(o.failed, `objectives[${i}].failed`, new Set(), false); });
  triggers.forEach((tr, i) => { if (isObj(tr)) walk(tr.when, `triggers[${i}].when`, new Set(), false); });
  walk(f.victory, 'victory', new Set(), false);
  walk(f.defeat, 'defeat', new Set(), false);
  if (Array.isArray(f.hud)) f.hud.forEach((h, i) => { if (isObj(h)) walk(h.while, `hud[${i}].while`, new Set(), false); });

  // 2) objetivo oculto que nunca aparece
  objectives.forEach((o, i) => {
    if (!isObj(o) || o.hidden !== true || typeof o.id !== 'string') return;
    if (o.done === undefined && o.failed === undefined && !touchedObjectives.has(o.id)) warn(`objectives[${i}]`, `objetivo oculto '${o.id}' sem done/failed e sem gatilho que o revele (reveal) ou conclua (objective): nunca aparece`);
  });

  // 3) falas
  const sayCheck = (a: Record<string, unknown>, path: string) => {
    if (a.do !== 'say') return;
    const t = a.text;
    if (typeof t === 'string') { warn(`${path}.text`, 'fala sem en (use { "pt", "en" })'); if (t.length > MAX_LINE_CHARS) warn(`${path}.text`, `fala com ${t.length} caracteres (máximo ${MAX_LINE_CHARS})`); return; }
    if (!isObj(t)) return;
    if (typeof t.en !== 'string' || t.en.length === 0) warn(`${path}.text.en`, 'fala sem en');
    for (const k of ['pt', 'en'] as const) { const v = t[k]; if (typeof v === 'string' && v.length > MAX_LINE_CHARS) warn(`${path}.text.${k}`, `fala com ${v.length} caracteres (máximo ${MAX_LINE_CHARS})`); }
  };
  eachAction(f.setup, 'setup', sayCheck);
  triggers.forEach((tr, i) => { if (isObj(tr)) eachAction(tr.then, `triggers[${i}].then`, sayCheck); });
}
