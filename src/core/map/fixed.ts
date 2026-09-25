// Mapas fixos (Fase 3.3): serialização compacta e determinística de um GameMap para JSON (editor, arquivos, lobby)
// e carregamento de volta. Terreno e decoração vão em base64 de bytes (sem depender de btoa/Buffer); nós como listas.
// Também: forma canônica, hash de identificação, validação (erros/avisos), mapa em branco, migração e saveMap.
// Tudo determinístico (só state.rng/makeNoise): o arquivo é a única fonte da verdade; blocked/nodeAt/ids são derivados.
import { MAX_PLAYERS, TERRAIN, type GameMode, type NodeType } from '../constants';
import { BUILDINGS, UNITS } from '../data';
import { RNG, makeNoise } from '../rng';
import type { GameMap, GameState } from '../types';
import { addNode, circleStarts, deriveDeepWater, NODE_AMOUNT, rebuildBlocked } from './mapgen';
import { articulationPoints, componentAt, componentSize } from './components';
import { dist, idx, inBounds, spiralSearch } from './grid';

export interface FixedMapData {
  v: 1;
  name?: string;
  w: number; h: number;
  terrain: string;                              // base64 de w*h bytes (TERRAIN.*)
  decor: string;                                // base64 de w*h bytes
  nodes: [NodeType, number, number, number][];  // tipo, x, y, quantidade (em ordem y, x)
  starts: [number, number][];                   // posições iniciais (uma por jogador); o CC 3x3 fica em (x-1, y-1)
  // ---- opcionais (docs/EDITOR.md §2.1); todos com padrão no carregador ----
  id?: string;                                  // slug estável do mapa (biblioteca/seletor); não muda ao renomear
  nameEn?: string; author?: string; description?: string;
  startKit?: boolean;                           // padrão true: CC + cidadãos + batedor em cada início (createGame)
  entities?: MapEntity[];                       // edifícios e unidades pré-colocados (edifícios antes das unidades, ordem y, x)
  startTeams?: number[];                        // time sugerido por início (ex.: [0, 0, 1, 1]) para atribuição por time
  koth?: [number, number];                      // colina do Rei da Colina; padrão: centro do mapa
  relics?: boolean;                             // padrão true: placeRelics sorteia pela semente; false em cenários
}
export type MapEntity =
  | { kind: 'building'; type: string; owner: number; x: number; y: number; complete?: boolean; tag?: string }   // x, y = canto (tx, ty); complete padrão true
  | { kind: 'unit'; type: string; owner: number; x: number; y: number; tag?: string };                          // tile; nasce em (x+0.5, y+0.5) ou no tile livre mais próximo

/** Limites de um mapa fixo (validação, editor, relay). */
export const MAP_LIMITS = { minSide: 48, maxSide: 160, maxTiles: 25_600, maxJsonBytes: 512 * 1024 } as const;

/** Problema apontado por validateMap; a interface traduz por t('map.issue.' + code, params). */
export interface MapIssue { level: 'error' | 'warn'; code: string; x?: number; y?: number; params?: Record<string, string | number> }

/** Metadados aceitos por saveMap (tudo opcional). */
export type MapMeta = Pick<FixedMapData, 'id' | 'name' | 'nameEn' | 'author' | 'description' | 'startKit' | 'startTeams' | 'koth' | 'relics'>;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}
export function base64ToBytes(s: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  const val = (ch: string) => { const i = B64.indexOf(ch); return i < 0 ? 0 : i; };
  let o = 0;
  for (let i = 0; i + 3 < s.length && o < length; i += 4) {
    const n = (val(s[i]) << 18) | (val(s[i + 1]) << 12) | (val(s[i + 2]) << 6) | val(s[i + 3]);
    out[o++] = (n >> 16) & 255;
    if (o < length && s[i + 2] !== '=') out[o++] = (n >> 8) & 255;
    if (o < length && s[i + 3] !== '=') out[o++] = n & 255;
  }
  return out;
}
/** Nº de bytes que a string base64 codifica, ou -1 se não for base64 válido (comprimento, alfabeto, preenchimento). */
function base64Length(s: unknown): number {
  if (typeof s !== 'string' || s.length % 4 !== 0) return -1;
  let pad = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '=') { if (i < s.length - 2) return -1; pad++; }
    else if (pad > 0 || B64.indexOf(ch) < 0) return -1;
  }
  return (s.length / 4) * 3 - pad;
}

/** Converte o mapa atual em dados (só o que é "mapa": terreno, decoração, nós vivos e inícios — edifícios/unidades são do cenário). */
export function mapToData(map: GameMap, name?: string): FixedMapData {
  const nodes: FixedMapData['nodes'] = [...map.nodes.values()].sort((a, b) => a.y - b.y || a.x - b.x).map((n) => [n.type, n.x, n.y, Math.round(n.amount)]);
  return { v: 1, name, w: map.w, h: map.h, terrain: bytesToBase64(map.terrain), decor: bytesToBase64(map.decor), nodes, starts: map.starts.map((s) => [s.x, s.y]) };
}

/**
 * Reconstrói um GameMap a partir dos dados. Ids de nós seguem a sequência atual (chame resetNodeSeq() antes, como
 * createGame faz) e são inseridos na ordem do arquivo. Lança se o tamanho sair de MAP_LIMITS; deriva a água profunda
 * quando o arquivo não tem nenhum byte DEEP (arquivos desenhados só com WATER).
 */
export function mapFromData(input: FixedMapData): GameMap {
  const data = migrateMap(input);
  const w = data.w, h = data.h;
  if (!sizeOk(w, h)) throw new Error(`mapa fixo com tamanho inválido (${w}x${h}); limites ${MAP_LIMITS.minSide}..${MAP_LIMITS.maxSide} por lado e ${MAP_LIMITS.maxTiles} tiles`);
  const map: GameMap = { w, h, terrain: base64ToBytes(data.terrain, w * h), blocked: new Uint8Array(w * h), nodeAt: new Int32Array(w * h).fill(-1), buildingAt: new Int32Array(w * h).fill(-1), gateTeam: new Int8Array(w * h).fill(-1), nodes: new Map(), starts: data.starts.map(([x, y]) => ({ x, y })), decor: base64ToBytes(data.decor, w * h) };
  const maxT = Math.max(...Object.values(TERRAIN));
  let hasDeep = false;
  for (let i = 0; i < w * h; i++) {
    if (map.terrain[i] > maxT) map.terrain[i] = TERRAIN.GRASS;   // valor fora da tabela: grama
    else if (map.terrain[i] === TERRAIN.DEEP) hasDeep = true;
  }
  if (!hasDeep) deriveDeepWater(map);
  for (const [type, x, y, amount] of data.nodes) addNode(map, type, x, y, amount);
  rebuildBlocked(map);
  return map;
}

/** Tamanho aproximado em bytes do JSON (para avisar no lobby). */
export function mapDataSize(data: FixedMapData): number { return JSON.stringify(data).length; }

function sizeOk(w: unknown, h: unknown): w is number {
  return Number.isInteger(w) && Number.isInteger(h) && (w as number) >= MAP_LIMITS.minSide && (w as number) <= MAP_LIMITS.maxSide
    && (h as number) >= MAP_LIMITS.minSide && (h as number) <= MAP_LIMITS.maxSide && (w as number) * (h as number) <= MAP_LIMITS.maxTiles;
}

// ---------------------------------------------------------------------------------------------------------------
// Forma canônica e hash
// ---------------------------------------------------------------------------------------------------------------

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Ordem canônica das entidades: edifícios antes de unidades; em cada grupo (y, x, tipo, dono). */
function entityOrder(a: MapEntity, b: MapEntity): number {
  if (a.kind !== b.kind) return a.kind === 'building' ? -1 : 1;
  return a.y - b.y || a.x - b.x || cmpStr(a.type, b.type) || a.owner - b.owner;
}
function canonEntity(e: MapEntity): MapEntity {
  const out: MapEntity = e.kind === 'building'
    ? { kind: 'building', type: e.type, owner: e.owner, x: e.x, y: e.y }
    : { kind: 'unit', type: e.type, owner: e.owner, x: e.x, y: e.y };
  if (e.kind === 'building' && out.kind === 'building' && e.complete === false) out.complete = false;
  if (typeof e.tag === 'string' && e.tag.length > 0) out.tag = e.tag;
  return out;
}

/**
 * Forma canônica: nós em ordem (y, x); entidades em ordem canônica e sem campos com valor padrão (complete:true);
 * campos com valor padrão removidos (startKit:true, relics:true, entities:[], startTeams vazio, textos vazios).
 * Devolve um objeto novo; a entrada não é alterada. saveMap(createGame({ map: f })) ≡ canonicalize(f).
 */
export function canonicalize(data: FixedMapData): FixedMapData {
  const out: FixedMapData = { v: 1, w: data.w, h: data.h, terrain: data.terrain, decor: data.decor, nodes: [], starts: [] };
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);
  if (str(data.id)) out.id = data.id;
  if (str(data.name)) out.name = data.name;
  if (str(data.nameEn)) out.nameEn = data.nameEn;
  if (str(data.author)) out.author = data.author;
  if (str(data.description)) out.description = data.description;
  out.starts = (data.starts ?? []).map(([x, y]) => [x, y]);
  if (Array.isArray(data.startTeams) && data.startTeams.length > 0) out.startTeams = data.startTeams.slice();
  if (data.startKit === false) out.startKit = false;
  if (Array.isArray(data.koth)) out.koth = [data.koth[0], data.koth[1]];
  if (data.relics === false) out.relics = false;
  out.nodes = (data.nodes ?? []).map(([t, x, y, a]) => [t, x, y, a] as FixedMapData['nodes'][number]).sort((a, b) => a[2] - b[2] || a[1] - b[1]);
  const ents = (data.entities ?? []).map(canonEntity).sort(entityOrder);
  if (ents.length > 0) out.entities = ents;
  return out;
}

/**
 * Identificação do mapa (lobby, replay, biblioteca): FNV-1a 32 bits (mesma mixagem de stateHash) sobre w, h, cada byte
 * do terreno decodificado, inícios, times sugeridos, kit inicial, nós, entidades, colina e relíquias — em forma canônica.
 * Não inclui name/nameEn/author/description/decor: renomear ou "variar visual" não muda o hash. Não é segurança.
 */
export function mapHash(input: FixedMapData): number {
  const data = canonicalize(input);
  let h = 2166136261 >>> 0;
  const mix = (v: number) => { h ^= (v | 0) >>> 0; h = Math.imul(h, 16777619) >>> 0; };
  const mixStr = (s: string) => { mix(s.length); for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i)); };
  mix(data.w); mix(data.h);
  const n = data.w * data.h;
  const terrain = base64ToBytes(data.terrain, n > 0 ? n : 0);
  for (let i = 0; i < terrain.length; i++) mix(terrain[i]);
  mix(data.starts.length);
  for (const [x, y] of data.starts) { mix(x); mix(y); }
  const teams = data.startTeams ?? [];
  mix(teams.length);
  for (const t of teams) mix(t);
  mix(data.startKit === false ? 0 : 1);
  mix(data.nodes.length);
  for (const [t, x, y, a] of data.nodes) { mixStr(t); mix(x); mix(y); mix(a); }
  const ents = data.entities ?? [];
  mix(ents.length);
  for (const e of ents) { mix(e.kind === 'building' ? 1 : 2); mixStr(e.type); mix(e.owner); mix(e.x); mix(e.y); mix(e.kind === 'building' && e.complete === false ? 0 : 1); mixStr(e.tag ?? ''); }
  if (data.koth) { mix(1); mix(data.koth[0]); mix(data.koth[1]); } else mix(0);
  mix(data.relics === false ? 0 : 1);
  return h >>> 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Migração, mapa em branco, saveMap
// ---------------------------------------------------------------------------------------------------------------

/** Aceita v ausente/1 (e versões futuras) e devolve dados v:1 num objeto novo. Lança só se não for um objeto. */
export function migrateMap(data: unknown): FixedMapData {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('mapa fixo inválido: esperado um objeto JSON');
  const d = data as Partial<FixedMapData> & Record<string, unknown>;
  const out = { ...d, v: 1 } as FixedMapData;
  if (!Array.isArray(out.nodes)) out.nodes = [];
  if (!Array.isArray(out.starts)) out.starts = [];
  if (typeof out.terrain !== 'string') out.terrain = '';
  if (typeof out.decor !== 'string') out.decor = '';
  return out;
}

/** Mapa em branco: grama com decor pelo mesmo ruído de generateMap (seed + 202), inícios em círculo, sem nós. */
export function blankMap(w: number, h: number, nStarts: number, seed: number): FixedMapData {
  const decorN = makeNoise(seed + 202);
  const terrain = new Uint8Array(w * h);   // TERRAIN.GRASS = 0
  const decor = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) decor[y * w + x] = Math.floor(decorN.noise(x * 0.9, y * 0.9) * 255);
  const rot = new RNG(seed ^ 0x5bd1e995).float();   // mesma rotação de generateMap com a mesma semente
  const starts = circleStarts(w, h, nStarts, rot).map((s) => [s.x, s.y] as [number, number]);
  return canonicalize({ v: 1, w, h, terrain: bytesToBase64(terrain), decor: bytesToBase64(decor), nodes: [], starts });
}

/**
 * Converte uma partida (editor ou jogo) em arquivo: mapToData + entidades a partir dos edifícios (canto, completo, dono)
 * e unidades vivas (tile inteiro, dono) + metadados. O resultado já é canônico.
 */
export function saveMap(state: GameState, meta: MapMeta = {}): FixedMapData {
  const data = mapToData(state.map, meta.name);
  const entities: MapEntity[] = [];
  for (const b of state.buildings.values()) {
    if (b.dead) continue;
    entities.push({ kind: 'building', type: b.type, owner: b.owner, x: b.tx, y: b.ty, complete: b.complete });
  }
  for (const u of state.units.values()) {
    if (u.dead) continue;
    entities.push({ kind: 'unit', type: u.type, owner: u.owner, x: Math.floor(u.x), y: Math.floor(u.y) });
  }
  return canonicalize({
    ...data, entities,
    id: meta.id, nameEn: meta.nameEn, author: meta.author, description: meta.description,
    startKit: meta.startKit, startTeams: meta.startTeams, koth: meta.koth, relics: meta.relics,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------------------------------------------

export interface ValidateOpts { players?: number; mode?: GameMode; ai?: boolean[] }

const FOOD_NODES: ReadonlySet<string> = new Set(['berry', 'deer', 'boar', 'lure']);
const START_MARGIN = 8;          // distância mínima de um início à borda (generateMap usa a mesma)
const FOOD_RADIUS = 14, WOOD_RADIUS = 16;   // raios de nearestNode nas ordens iniciais de createGame
const CHOKE_RADIUS = 10, POCKET_TILES = 8, MAIN_COMPONENT_MIN = 0.6;
const MAX_PER_CODE = 25;         // limite de itens por código (bolsões, nós sem acesso…) para a lista não explodir

const isSolid = (t: number) => t === TERRAIN.WATER || t === TERRAIN.DEEP || t === TERRAIN.MOUNTAIN;

/**
 * Valida um arquivo de mapa (docs/EDITOR.md §2.1). Erros bloqueiam Testar/Iniciar/Import; avisos só informam.
 * opts.players: nº de jogadores da partida; opts.mode: modo (regicide/koth); opts.ai[i]: se o jogador i é IA
 * (aiNoTc só é emitido quando informado). Nunca lança: dados malformados viram erros.
 */
export function validateMap(input: FixedMapData, opts: ValidateOpts = {}): MapIssue[] {
  const issues: MapIssue[] = [];
  const counts = new Map<string, number>();
  const push = (level: MapIssue['level'], code: string, x?: number, y?: number, params?: MapIssue['params']) => {
    const c = (counts.get(code) ?? 0) + 1;
    counts.set(code, c);
    if (c > MAX_PER_CODE) return;
    const it: MapIssue = { level, code };
    if (x !== undefined) it.x = x;
    if (y !== undefined) it.y = y;
    if (params) it.params = params;
    issues.push(it);
  };
  const err = (code: string, x?: number, y?: number, params?: MapIssue['params']) => push('error', code, x, y, params);
  const warn = (code: string, x?: number, y?: number, params?: MapIssue['params']) => push('warn', code, x, y, params);

  let data: FixedMapData;
  try { data = migrateMap(input); } catch { return [{ level: 'error', code: 'size' }]; }
  const w = data.w, h = data.h;

  // ---- tamanho e arquivo ----
  if (!sizeOk(w, h)) err('size', undefined, undefined, { w: Number(w) || 0, h: Number(h) || 0 });
  let bytes = 0;
  try { bytes = JSON.stringify(data).length; } catch { bytes = Infinity; }
  if (bytes > MAP_LIMITS.maxJsonBytes) err('fileTooBig', undefined, undefined, { bytes, max: MAP_LIMITS.maxJsonBytes });
  if (issues.some((i) => i.code === 'size')) return issues;   // sem tamanho válido não há como checar o resto
  const n = w * h;

  // ---- terreno e decor ----
  const tLen = base64Length(data.terrain), dLen = base64Length(data.decor);
  if (tLen !== n) err('terrainLen', undefined, undefined, { expected: n, got: tLen });
  if (dLen !== n) err('decorLen', undefined, undefined, { expected: n, got: dLen });
  const terrain = base64ToBytes(data.terrain, n);
  const maxT = Math.max(...Object.values(TERRAIN));
  for (let i = 0; i < n; i++) if (terrain[i] > maxT) { err('badTerrain', i % w, (i - (i % w)) / w, { value: terrain[i] }); break; }
  if (tLen !== n) return issues;   // as checagens espaciais precisam do terreno

  // ---- inícios ----
  const starts = data.starts.filter((s) => Array.isArray(s) && Number.isInteger(s[0]) && Number.isInteger(s[1]));
  const nPlayers = opts.players ?? 0;
  if (starts.length !== data.starts.length || starts.length < 2 || starts.length > MAX_PLAYERS || starts.length < nPlayers) err('startsCount', undefined, undefined, { count: data.starts.length, players: nPlayers, max: MAX_PLAYERS });
  for (const [x, y] of starts) if (x < START_MARGIN || y < START_MARGIN || x > w - 1 - START_MARGIN || y > h - 1 - START_MARGIN) err('startOut', x, y);

  // ---- nós ----
  const nodeAt = new Int32Array(n).fill(-1);
  const nodes: { type: NodeType; x: number; y: number }[] = [];
  for (const nd of data.nodes) {
    if (!Array.isArray(nd)) { err('unknownNode'); continue; }
    const [type, x, y] = nd;
    if (!(type in NODE_AMOUNT)) { err('unknownNode', x, y, { type: String(type) }); continue; }
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h) { err('nodeOut', x, y); continue; }
    const i = y * w + x;
    if (isSolid(terrain[i])) { err('nodeOnBlocked', x, y); continue; }
    if (nodeAt[i] !== -1) { err('nodeDup', x, y); continue; }
    nodeAt[i] = nodes.length;
    nodes.push({ type, x, y });
  }

  // ---- kit inicial: CC 3x3 sobre água/montanha/nó ----
  const kit = data.startKit !== false;
  if (kit) for (const [sx, sy] of starts) {
    let bad = false;
    for (let dy = -1; dy <= 1 && !bad; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = sx + dx, y = sy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) { bad = true; break; }
      const i = y * w + x;
      if (isSolid(terrain[i]) || nodeAt[i] !== -1) { bad = true; break; }
    }
    if (bad) err('startBlocked', sx, sy);
  }

  // ---- entidades ----
  const buildingAt = new Int32Array(n).fill(-1);
  const gateAt = new Int8Array(n).fill(-1);
  const tcOf = new Set<number>();
  let entIndex = 0;
  for (const e of data.entities ?? []) {
    const k = entIndex++;
    if (!e || (e.kind !== 'building' && e.kind !== 'unit')) { err('unknownType', undefined, undefined, { type: String((e as { type?: unknown })?.type ?? '?') }); continue; }
    const def = e.kind === 'building' ? BUILDINGS[e.type] : UNITS[e.type];
    if (!def || typeof e.type !== 'string') { err('unknownType', e.x, e.y, { type: String(e.type) }); continue; }
    if (!Number.isInteger(e.owner) || e.owner < 0 || e.owner >= starts.length) { err('badOwner', e.x, e.y, { owner: Number(e.owner), starts: starts.length }); continue; }
    if (!Number.isInteger(e.x) || !Number.isInteger(e.y)) { err('entityOverlap', e.x, e.y, { type: e.type }); continue; }
    if (e.kind === 'building') {
      const bw = (def as { w: number }).w, bh = (def as { h: number }).h;
      let bad = false;
      for (let y = e.y; y < e.y + bh && !bad; y++) for (let x = e.x; x < e.x + bw; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) { bad = true; break; }
        const i = y * w + x;
        if (isSolid(terrain[i]) || nodeAt[i] !== -1 || buildingAt[i] !== -1) { bad = true; break; }
      }
      if (bad) { err('entityOverlap', e.x, e.y, { type: e.type }); continue; }
      const bdef = BUILDINGS[e.type];
      for (let y = e.y; y < e.y + bh; y++) for (let x = e.x; x < e.x + bw; x++) {
        const i = y * w + x;
        buildingAt[i] = k;
        if (bdef.gate) gateAt[i] = e.owner;
      }
      if (e.type === 'town_center') tcOf.add(e.owner);
      if (bdef.wonder && e.complete !== false) warn('wonderComplete', e.x, e.y, { type: e.type });
    } else {
      if (e.x < 0 || e.y < 0 || e.x >= w || e.y >= h || isSolid(terrain[e.y * w + e.x])) err('entityOverlap', e.x, e.y, { type: e.type });
    }
  }

  // ---- modo ----
  const mode = opts.mode;
  const playersToCheck = Math.min(starts.length, nPlayers > 0 ? nPlayers : starts.length);
  if (mode === 'regicide' && !kit) for (let p = 0; p < playersToCheck; p++) if (!tcOf.has(p)) err('regicideNoTc', starts[p]?.[0], starts[p]?.[1], { player: p + 1 });
  if (opts.ai && !kit) for (let p = 0; p < playersToCheck; p++) if (opts.ai[p] && !tcOf.has(p)) warn('aiNoTc', starts[p]?.[0], starts[p]?.[1], { player: p + 1 });

  // ---- análise espacial (só se não houver erro estrutural nos inícios) ----
  // Mapa temporário para components.ts: terreno sólido, nós e edifícios (exceto passáveis) bloqueiam; portões contam como passáveis
  const map: GameMap = { w, h, terrain, blocked: new Uint8Array(n), nodeAt, buildingAt, gateTeam: gateAt, nodes: new Map(), starts: starts.map(([x, y]) => ({ x, y })), decor: new Uint8Array(0) };
  const ents = data.entities ?? [];
  for (let i = 0; i < n; i++) {
    let blocked = isSolid(terrain[i]) || nodeAt[i] !== -1;
    if (!blocked && buildingAt[i] !== -1) { const e = ents[buildingAt[i]]; blocked = !BUILDINGS[e.type]?.passable; }
    map.blocked[i] = blocked ? 1 : 0;
  }
  // com kit inicial, o CC 3x3 também bloqueia
  if (kit) for (const [sx, sy] of starts) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBounds(map, sx + dx, sy + dy)) map.blocked[idx(map, sx + dx, sy + dy)] = 1;

  const accessTiles = (x: number, y: number): number => {
    let c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (inBounds(map, x + dx, y + dy) && map.blocked[idx(map, x + dx, y + dy)] === 0) c++;
    }
    return c;
  };
  // tile passável que representa um início (o próprio ou o mais próximo em raio 3: com kit o centro é o CC)
  const startTile = (sx: number, sy: number) => spiralSearch(sx, sy, 3, (a, b) => inBounds(map, a, b) && map.blocked[idx(map, a, b)] === 0);
  const startComp = starts.map(([sx, sy]) => { const t = startTile(sx, sy); return t ? componentAt(map, t.x, t.y) : -1; });

  // inícios em regiões diferentes
  for (let p = 1; p < starts.length; p++) if (startComp[p] !== startComp[0]) warn('startsDisconnected', starts[p][0], starts[p][1], { start: p + 1 });

  // gargalos perto de um início (o ponto de articulação mais próximo de cada início)
  if (starts.length > 0) {
    const ap = articulationPoints(map);
    for (let p = 0; p < starts.length; p++) {
      const [sx, sy] = starts[p];
      let bx = -1, by = -1, bd = CHOKE_RADIUS + 1;
      for (let y = Math.max(0, sy - CHOKE_RADIUS); y <= Math.min(h - 1, sy + CHOKE_RADIUS); y++) for (let x = Math.max(0, sx - CHOKE_RADIUS); x <= Math.min(w - 1, sx + CHOKE_RADIUS); x++) {
        if (!ap[y * w + x]) continue;
        const d = dist(x, y, sx, sy);
        if (d <= CHOKE_RADIUS && d < bd) { bd = d; bx = x; by = y; }
      }
      if (bx >= 0) warn('chokepoint', bx, by, { start: p + 1 });
    }
  }

  // bolsões e tamanho da região principal (bolsões fechados só por nós — clareiras num bosque — são normais e abrem ao coletar)
  let passable = 0, largest = 0;
  const seenComp = new Set<number>();
  const pockets: { x: number; y: number; size: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (map.blocked[i]) continue;
    passable++;
    const x = i % w, y = (i - x) / w;
    const c = componentAt(map, x, y);
    if (c < 0 || seenComp.has(c)) continue;
    seenComp.add(c);
    const size = componentSize(map, c);
    if (size > largest) largest = size;
    if (size < POCKET_TILES && pocketBoundedByTerrain(map, x, y, c)) pockets.push({ x, y, size });
  }
  if (passable > 0 && largest < passable * MAIN_COMPONENT_MIN) warn('mainComponentSmall', undefined, undefined, { percent: Math.round((largest / passable) * 100) });

  // nós sem acesso (árvores no meio de um bosque são normais; os demais tipos precisam de um tile livre ao lado)
  for (const nd of nodes) if (nd.type !== 'tree' && accessTiles(nd.x, nd.y) === 0) warn('nodeNoAccess', nd.x, nd.y, { type: nd.type });

  // comida/madeira ao alcance das ordens iniciais (só nós acessíveis, como nearestNode)
  if (kit) for (let p = 0; p < starts.length; p++) {
    const [sx, sy] = starts[p];
    let food = false, wood = false;
    for (const nd of nodes) {
      if (food && wood) break;
      const d = dist(nd.x, nd.y, sx, sy);
      if (nd.type === 'tree') { if (!wood && d <= WOOD_RADIUS && accessTiles(nd.x, nd.y) > 0) wood = true; }
      else if (FOOD_NODES.has(nd.type) && !food && d <= FOOD_RADIUS && accessTiles(nd.x, nd.y) > 0) food = true;
    }
    if (!food) warn('lowStartFood', sx, sy, { start: p + 1 });
    if (!wood) warn('lowStartWood', sx, sy, { start: p + 1 });
  }

  // colina do Rei da Colina alcançável por todos os inícios
  if (mode === 'koth' || data.koth) {
    const kx = data.koth ? data.koth[0] : Math.floor(w / 2), ky = data.koth ? data.koth[1] : Math.floor(h / 2);
    const hill = spiralSearch(kx, ky, 8, (a, b) => inBounds(map, a, b) && map.blocked[idx(map, a, b)] === 0);
    const hc = hill ? componentAt(map, hill.x, hill.y) : -1;
    if (hc < 0 || startComp.some((c) => c !== hc)) warn('kothUnreachable', kx, ky);
  }
  for (const p of pockets) warn('pocket', p.x, p.y, { tiles: p.size });

  // erros antes dos avisos, mantendo a ordem de detecção dentro de cada nível
  return issues.filter((i) => i.level === 'error').concat(issues.filter((i) => i.level === 'warn'));
}

/** Um bolsão (região pequena) é reportado só se algum vizinho bloqueado for terreno sólido ou edifício (não apenas nós). */
function pocketBoundedByTerrain(map: GameMap, sx: number, sy: number, label: number): boolean {
  const stack = [idx(map, sx, sy)];
  const seen = new Set<number>(stack);
  while (stack.length) {
    const c = stack.pop()!;
    const x = c % map.w, y = (c - x) / map.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const ni = idx(map, nx, ny);
      if (map.blocked[ni]) { if (isSolid(map.terrain[ni]) || map.buildingAt[ni] !== -1) return true; continue; }
      if (seen.has(ni) || componentAt(map, nx, ny) !== label) continue;
      seen.add(ni); stack.push(ni);
    }
  }
  return false;
}
