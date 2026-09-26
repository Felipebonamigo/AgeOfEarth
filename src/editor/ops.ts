// Operações do editor de mapas (docs/EDITOR.md §3.2 e §5 Etapa 3), puras e sem DOM: cada EditOp é aplicada
// diretamente ao estado de uma sessão PAUSADA (nunca por Command) e devolve a sua inversa exata, de modo que
// aplicar op e depois a inversa restaura o estado byte a byte (serialize idêntico). Para isso:
// - ids de unidades/edifícios/nós são preservados nas inversas (placeEntity.id, addNode.id) e a ordem de inserção
//   dos Maps é mantida crescente por id (serialize percorre os Maps em ordem de inserção);
// - state.nextId volta ao valor anterior ao desfazer uma colocação (removeEntity.nextId);
// - estatísticas (buildingsBuilt) e eventos gerados por onBuildingComplete são descartados (o editor não conta);
// - a água profunda (DEEP) é derivada no retângulo ±1 após pintar; a inversa restaura os valores exatos por tile
//   (paint.terrains) sem rederivar, porque o terreno original pode não estar "derivado" (generateMap não rederiva
//   após abrir clareiras e corredores).
// Este módulo vive fora de src/core, mas não usa nada não determinístico.
import { MAX_PLAYERS, TERRAIN, type NodeType } from '../core/constants';
import { BUILDINGS, UNITS } from '../core/data';
import type { Building, GameMap, GameState, ResourceNode, Unit } from '../core/types';
import { idx, inBounds, isPassable } from '../core/map/grid';
import { addNode, deriveDeepWater, rebuildBlocked, removeNode, resetNodeSeq, getNodeSeq, NODE_ID_BASE } from '../core/map/mapgen';
import { invalidateComponents } from '../core/map/components';
import { canPlaceBuilding, onBuildingComplete, placeBuilding, pushUnitsOutOfTile, recomputePop, removeBuildingNow, removeUnitNow, spawnUnit } from '../core/sim/entities';
import { recomputeMods, refreshMaxHp } from '../core/sim/modifiers';
import type { MapEntity } from '../core/map/fixed';
import type { EditOp } from './types';

export type EditErrorCode = 'underBuilding' | 'noRoom' | 'badOwner' | 'occupied' | 'notFound' | 'badTile' | 'badType' | 'badIndex' | 'badTerrain' | 'badId';

/** Operação recusada; a interface traduz por t('editor.err.' + code). O estado não é alterado quando lançado. */
export class EditError extends Error {
  code: EditErrorCode; x?: number; y?: number;
  constructor(code: EditErrorCode, x?: number, y?: number) {
    super(code);
    this.name = 'EditError';
    this.code = code;
    if (x !== undefined) this.x = x;
    if (y !== undefined) this.y = y;
  }
}

/** Tags das entidades (id → tag). Vivem fora do estado (não são serializadas); ops recebe/devolve tags pelo op. */
export type TagMap = Map<number, string>;

export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Metadados do arquivo que ops alteram (setRelics, G10). Vivem na MapEditor (meta), fora do estado; ops recebe a referência. */
export type MetaRef = { relics?: boolean | [number, number][] };
const copyRelics = (v: boolean | [number, number][]): boolean | [number, number][] => (Array.isArray(v) ? v.map(([x, y]) => [x, y] as [number, number]) : v);

const isSolid = (t: number) => t === TERRAIN.WATER || t === TERRAIN.DEEP || t === TERRAIN.MOUNTAIN;
const MAX_TERRAIN = Math.max(...Object.values(TERRAIN));

// ---------------------------------------------------------------------------------------------------------------
// Geometria (sem trigonometria)
// ---------------------------------------------------------------------------------------------------------------

/** Tiles do pincel centrado em (cx, cy): círculo por dx²+dy² ≤ r², quadrado por max(|dx|,|dy|) ≤ r; dentro do mapa, em ordem crescente de índice. */
export function brushTiles(cx: number, cy: number, r: number, shape: 'circle' | 'square', w: number, h: number): number[] {
  const out: number[] = [];
  const R = Math.max(0, Math.floor(r)), r2 = R * R;
  for (let y = Math.max(0, cy - R); y <= Math.min(h - 1, cy + R); y++) for (let x = Math.max(0, cx - R); x <= Math.min(w - 1, cx + R); x++) {
    const dx = x - cx, dy = y - cy;
    if (shape === 'circle' && dx * dx + dy * dy > r2) continue;
    out.push(y * w + x);
  }
  return out;
}

/** Linha de Bresenham entre dois tiles (inclui as duas pontas). */
export function lineTiles(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let x = x0, y = y0;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, guard = 0;
  for (;;) {
    out.push({ x, y });
    if ((x === x1 && y === y1) || guard++ > 1000) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return out;
}

/** Região contígua (4-conexa) do mesmo terreno a partir de (x, y), em ordem crescente de índice; água e água profunda contam como o mesmo terreno. Limite de 25 600 tiles. */
export function floodRegion(map: GameMap, x: number, y: number, limit = 25_600): number[] {
  if (!inBounds(map, x, y)) return [];
  const w = map.w, h = map.h;
  const cls = (t: number) => (t === TERRAIN.DEEP ? TERRAIN.WATER : t);
  const target = cls(map.terrain[idx(map, x, y)]);
  const seen = new Uint8Array(w * h);
  const stack = [idx(map, x, y)];
  seen[stack[0]] = 1;
  const out: number[] = [];
  while (stack.length && out.length < limit) {
    const c = stack.pop()!;
    out.push(c);
    const cx = c % w, cy = (c - cx) / w;
    if (cx > 0) visit(c - 1);
    if (cx < w - 1) visit(c + 1);
    if (cy > 0) visit(c - w);
    if (cy < h - 1) visit(c + w);
  }
  return out.sort((a, b) => a - b);
  function visit(i: number) { if (!seen[i] && cls(map.terrain[i]) === target) { seen[i] = 1; stack.push(i); } }
}

/** Retângulo de tiles afetado pela op (para invalidar chunks/minimapa) ou null se não houver (ou se depender do estado e ele não for passado). */
export function dirtyRectOf(op: EditOp, w: number, state?: GameState): Rect | null {
  switch (op.kind) {
    case 'paint': {
      if (op.tiles.length === 0) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const i of op.tiles) { const x = i % w, y = (i - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return { x0: x0 - 1, y0: y0 - 1, x1: x1 + 1, y1: y1 + 1 };   // ±1: a água profunda derivada muda vizinhos
    }
    case 'addNode': case 'removeNode': case 'setNodeAmount': case 'setStart':
      return { x0: op.x, y0: op.y, x1: op.x, y1: op.y };
    case 'removeStart': case 'setRelics': return null;   // relíquias: sobreposição redesenhada a cada quadro
    case 'placeEntity': return entityRect(op.entity);
    case 'removeEntity': case 'setEntity': {
      if (!state) return null;
      const e = state.units.get(op.id) ?? state.buildings.get(op.id);
      return e ? liveRect(e) : null;
    }
    case 'moveEntity': {
      if (!state) return null;
      const e = state.units.get(op.id) ?? state.buildings.get(op.id);
      if (!e) return null;
      const from = liveRect(e);
      const to = e.kind === 'building' ? { x0: op.x, y0: op.y, x1: op.x + e.w - 1, y1: op.y + e.h - 1 } : { x0: op.x, y0: op.y, x1: op.x, y1: op.y };
      return unionRect(from, to);
    }
    case 'batch': {
      let r: Rect | null = null;
      for (const o of op.ops) { const s = dirtyRectOf(o, w, state); if (s) r = r ? unionRect(r, s) : s; }
      return r;
    }
  }
}
export function unionRect(a: Rect, b: Rect): Rect { return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }; }
function entityRect(e: MapEntity): Rect {
  if (e.kind === 'building') { const d = BUILDINGS[e.type]; const bw = d?.w ?? 1, bh = d?.h ?? 1; return { x0: e.x, y0: e.y, x1: e.x + bw - 1, y1: e.y + bh - 1 }; }
  return { x0: e.x, y0: e.y, x1: e.x, y1: e.y };
}
function liveRect(e: Unit | Building): Rect {
  if (e.kind === 'building') return { x0: e.tx, y0: e.ty, x1: e.tx + e.w - 1, y1: e.ty + e.h - 1 };
  const x = Math.floor(e.x), y = Math.floor(e.y);
  return { x0: x, y0: y, x1: x, y1: y };
}

// ---------------------------------------------------------------------------------------------------------------
// Utilitários de estado
// ---------------------------------------------------------------------------------------------------------------

/** Reordena um Map por id crescente no lugar (mesmo objeto), só quando a última chave inserida não é a maior. */
function sortMapById<T>(m: Map<number, T>): void {
  let last = -1, sorted = true;
  for (const k of m.keys()) { if (k < last) { sorted = false; break; } last = k; }
  if (sorted) return;
  const entries = [...m.entries()].sort((a, b) => a[0] - b[0]);
  m.clear();
  for (const [k, v] of entries) m.set(k, v);
}
function maxNodeId(map: GameMap): number {
  let mx = NODE_ID_BASE - 1;
  for (const id of map.nodes.keys()) if (id > mx) mx = id;
  return mx;
}
/** Insere um nó; com id, força esse id (deve estar livre) e mantém a sequência global em max+1 e o Map ordenado. */
function insertNode(map: GameMap, type: NodeType, x: number, y: number, amount: number | undefined, id?: number): ResourceNode {
  if (id !== undefined) {
    if (map.nodes.has(id)) throw new EditError('badId', x, y);
    resetNodeSeq(id);
  }
  const n = addNode(map, type, x, y, amount);
  if (!n) { if (id !== undefined) resetNodeSeq(maxNodeId(map) + 1); throw new EditError('occupied', x, y); }
  if (id !== undefined) { resetNodeSeq(maxNodeId(map) + 1); sortMapById(map.nodes); }
  return n;
}
/** Centro do tile: onde unidades do editor sempre ficam. Zera destino/coleira para o estado ser reproduzível. */
function settleUnit(u: Unit, tx: number, ty: number): void {
  u.x = tx + 0.5; u.y = ty + 0.5; u.px = u.x; u.py = u.y; u.tx = u.x; u.ty = u.y; u.leashX = u.x; u.leashY = u.y; u.path = null; u.pathI = 0;
}
function playerOk(state: GameState, owner: number): boolean { return Number.isInteger(owner) && owner >= 0 && owner < state.players.length; }
function tagOf(tags: TagMap | undefined, id: number): string | undefined { return tags?.get(id); }
function setTag(tags: TagMap | undefined, id: number, tag: string | null | undefined): void {
  if (!tags || tag === undefined) return;
  if (tag === null || tag === '') tags.delete(id); else tags.set(id, tag);
}
/** Efeitos colaterais de onBuildingComplete que o editor não quer (estatísticas, eventos). */
function withoutSideEffects<T>(state: GameState, owner: number, fn: () => T): T {
  const p = state.players[owner];
  const built = p.stats.buildingsBuilt, ev = state.events.length;
  const out = fn();
  p.stats.buildingsBuilt = built;
  state.events.length = ev;
  return out;
}
function refreshWonderMods(state: GameState, ...owners: number[]): void {
  for (const o of new Set(owners)) { const p = state.players[o]; if (!p) continue; recomputeMods(state, p); refreshMaxHp(state, p); }
}

// ---------------------------------------------------------------------------------------------------------------
// applyEditOp
// ---------------------------------------------------------------------------------------------------------------

/**
 * Aplica a op ao estado (sessão pausada) e devolve a inversa exata. Lança EditError sem alterar o estado quando
 * a op é recusada (ver códigos). tags: mapa externo id → tag mantido pela MapEditor (opcional).
 */
/** Aplica a operação e devolve a inversa exata. O contador global de ids de nós (gravado no save) também é restaurado pela inversa. */
export function applyEditOp(state: GameState, op: EditOp, tags?: TagMap, meta?: MetaRef): EditOp {
  const prev = getNodeSeq();
  let inv: EditOp;
  try { inv = applyEditOpInner(state, op, tags, meta); } catch (e) { resetNodeSeq(prev); throw e; }   // op recusada: nada muda, nem o contador
  if ('nodeSeq' in op && op.nodeSeq !== undefined) resetNodeSeq(op.nodeSeq);
  if (inv.kind === 'paint' || inv.kind === 'addNode' || inv.kind === 'removeNode' || inv.kind === 'batch') inv.nodeSeq = prev;
  return inv;
}
function applyEditOpInner(state: GameState, op: EditOp, tags?: TagMap, meta?: MetaRef): EditOp {
  switch (op.kind) {
    case 'setRelics': {   // G10: troca a lista de relíquias dos metadados; a inversa devolve a anterior (ausente = sorteio)
      if (!meta) throw new EditError('notFound');
      const before = meta.relics;
      if (op.relics === undefined) delete meta.relics; else meta.relics = copyRelics(op.relics);
      return before === undefined ? { kind: 'setRelics' } : { kind: 'setRelics', relics: copyRelics(before) };
    }
    case 'paint': return applyPaint(state, op);
    case 'addNode': {
      const map = state.map;
      if (!inBounds(map, op.x, op.y)) throw new EditError('badTile', op.x, op.y);
      if (!isNodeType(op.type)) throw new EditError('badType', op.x, op.y);
      const i = idx(map, op.x, op.y);
      if (isSolid(map.terrain[i]) || map.buildingAt[i] !== -1 || map.nodeAt[i] !== -1) throw new EditError('occupied', op.x, op.y);
      insertNode(map, op.type, op.x, op.y, op.amount, op.id);
      // unidades sobre o tile (agora bloqueado) são empurradas; a inversa as traz de volta ao tile exato
      const moved = pushUnitsFrom(state, [i]);
      state.territoryDirty = true;
      const inv: EditOp = { kind: 'removeNode', x: op.x, y: op.y };
      if (moved.length === 0) return inv;
      return { kind: 'batch', ops: [inv, ...moved.map((m): EditOp => ({ kind: 'moveEntity', id: m.id, x: m.x, y: m.y }))] };
    }
    case 'removeNode': {
      const map = state.map;
      if (!inBounds(map, op.x, op.y)) throw new EditError('badTile', op.x, op.y);
      const id = map.nodeAt[idx(map, op.x, op.y)];
      const n = map.nodes.get(id);
      if (id === -1 || !n) throw new EditError('notFound', op.x, op.y);
      const inv: EditOp = { kind: 'addNode', type: n.type, x: n.x, y: n.y, amount: n.amount, id: n.id };
      removeNode(map, id);
      state.territoryDirty = true;
      return inv;
    }
    case 'setNodeAmount': {
      const map = state.map;
      if (!inBounds(map, op.x, op.y)) throw new EditError('badTile', op.x, op.y);
      const n = map.nodes.get(map.nodeAt[idx(map, op.x, op.y)]);
      if (!n) throw new EditError('notFound', op.x, op.y);
      const before = n.amount;
      const amt = Math.max(1, Math.round(op.amount));
      n.amount = amt; n.max = amt;
      return { kind: 'setNodeAmount', x: op.x, y: op.y, amount: before };
    }
    case 'setStart': {
      const starts = state.map.starts;
      if (!inBounds(state.map, op.x, op.y)) throw new EditError('badTile', op.x, op.y);
      if (!Number.isInteger(op.index) || op.index < 0 || op.index > starts.length) throw new EditError('badIndex', op.x, op.y);
      if (op.insert || op.index === starts.length) {
        if (starts.length >= MAX_PLAYERS) throw new EditError('badIndex', op.x, op.y);
        starts.splice(op.index, 0, { x: op.x, y: op.y });
        return { kind: 'removeStart', index: op.index };
      }
      const s = starts[op.index];
      const inv: EditOp = { kind: 'setStart', index: op.index, x: s.x, y: s.y };
      s.x = op.x; s.y = op.y;
      return inv;
    }
    case 'removeStart': {
      const starts = state.map.starts;
      if (!Number.isInteger(op.index) || op.index < 0 || op.index >= starts.length) throw new EditError('badIndex');
      const [s] = starts.splice(op.index, 1);
      return { kind: 'setStart', index: op.index, x: s.x, y: s.y, insert: true };
    }
    case 'placeEntity': return applyPlace(state, op, tags);
    case 'removeEntity': {
      const e = state.units.get(op.id) ?? state.buildings.get(op.id);
      if (!e || e.dead) throw new EditError('notFound');
      const tag = tagOf(tags, e.id);
      const inv: EditOp = { kind: 'placeEntity', id: e.id, entity: entityOf(e, tag) };
      if (e.kind === 'building') {
        removeBuildingNow(state, e);
        if (BUILDINGS[e.type].wonder && e.complete) refreshWonderMods(state, e.owner);
      } else removeUnitNow(state, e);
      tags?.delete(e.id);
      if (op.nextId !== undefined) state.nextId = op.nextId;
      return inv;
    }
    case 'setEntity': {
      const e = state.units.get(op.id) ?? state.buildings.get(op.id);
      if (!e || e.dead) throw new EditError('notFound');
      if (op.owner !== undefined && !playerOk(state, op.owner)) throw new EditError('badOwner');
      const inv: EditOp = { kind: 'setEntity', id: e.id };
      if (op.tag !== undefined) { inv.tag = tagOf(tags, e.id) ?? null; setTag(tags, e.id, op.tag); }
      if (op.complete !== undefined && e.kind === 'building' && op.complete !== e.complete) {
        inv.complete = e.complete;
        setComplete(state, e, op.complete);
      }
      if (op.owner !== undefined && op.owner !== e.owner) {
        inv.owner = e.owner;
        const from = e.owner;
        e.owner = op.owner;
        if (e.kind === 'building') {
          const def = BUILDINGS[e.type];
          if (def.gate && e.complete) for (let y = e.ty; y < e.ty + e.h; y++) for (let x = e.tx; x < e.tx + e.w; x++) state.map.gateTeam[idx(state.map, x, y)] = state.players[e.owner].team;
          if (def.territory) state.territoryDirty = true;
          if (def.wonder && e.complete) refreshWonderMods(state, from, e.owner);
        }
        recomputePop(state, state.players[from]); recomputePop(state, state.players[e.owner]);
      }
      return inv;
    }
    case 'moveEntity': {
      const e = state.units.get(op.id) ?? state.buildings.get(op.id);
      if (!e || e.dead) throw new EditError('notFound');
      if (e.kind === 'unit') {
        if (!isPassable(state.map, op.x, op.y)) throw new EditError('noRoom', op.x, op.y);
        const inv: EditOp = { kind: 'moveEntity', id: e.id, x: Math.floor(e.x), y: Math.floor(e.y) };
        settleUnit(e, op.x, op.y);
        return inv;
      }
      const inv: EditOp = { kind: 'moveEntity', id: e.id, x: e.tx, y: e.ty };
      const ent = entityOf(e);
      const savedNext = state.nextId;
      removeBuildingNow(state, e);
      const player = state.players[e.owner];
      if (!canPlaceBuilding(state, player, e.type, op.x, op.y, true, true).ok) {
        // não cabe: recoloca exatamente onde estava (mesmo id) e recusa
        placeWithId(state, ent, e.id, savedNext);
        throw new EditError('noRoom', op.x, op.y);
      }
      const moved = snapshotThenPlace(state, { ...ent, x: op.x, y: op.y }, e.id, savedNext);
      if (BUILDINGS[e.type].wonder && e.complete) refreshWonderMods(state, e.owner);
      return moved.length === 0 ? inv : { kind: 'batch', ops: [inv, ...moved] };
    }
    case 'batch': {
      const done: EditOp[] = [];
      try {
        for (const o of op.ops) done.push(applyEditOp(state, o, tags, meta));
      } catch (err) {
        // desfaz o que já foi aplicado para a op composta ser atômica
        for (let i = done.length - 1; i >= 0; i--) applyEditOp(state, done[i], tags, meta);
        throw err;
      }
      return { kind: 'batch', ops: done.reverse() };
    }
  }
}

function isNodeType(t: string): t is NodeType { return t === 'tree' || t === 'berry' || t === 'gold' || t === 'deer' || t === 'boar' || t === 'lure'; }

/** Empurra as unidades terrestres que estejam sobre os tiles (já bloqueados) e devolve, para cada uma que saiu, o tile de origem. */
function pushUnitsFrom(state: GameState, tiles: number[]): { id: number; x: number; y: number }[] {
  const map = state.map;
  const posBefore = new Map<number, { x: number; y: number }>();
  for (const u of state.units.values()) if (!u.dead) posBefore.set(u.id, { x: Math.floor(u.x), y: Math.floor(u.y) });
  for (const i of tiles) {
    if (!map.blocked[i]) continue;
    const x = i % map.w, y = (i - x) / map.w;
    pushUnitsOutOfTile(state, x, y);
  }
  const moved: { id: number; x: number; y: number }[] = [];
  for (const u of state.units.values()) {
    const p = posBefore.get(u.id);
    if (p && (Math.floor(u.x) !== p.x || Math.floor(u.y) !== p.y)) { settleUnit(u, Math.floor(u.x), Math.floor(u.y)); moved.push({ id: u.id, x: p.x, y: p.y }); }
  }
  return moved;
}

function entityOf(e: Unit | Building, tag?: string): MapEntity {
  const out: MapEntity = e.kind === 'building'
    ? { kind: 'building', type: e.type, owner: e.owner, x: e.tx, y: e.ty, complete: e.complete }
    : { kind: 'unit', type: e.type, owner: e.owner, x: Math.floor(e.x), y: Math.floor(e.y) };
  if (tag) out.tag = tag;
  return out;
}

/** Coloca a entidade; com id, força esse id (deve estar livre) e devolve nextId a max(savedNext, id + 1). */
function placeWithId(state: GameState, ent: MapEntity, id: number | undefined, savedNext: number): Unit | Building {
  if (id !== undefined) {
    if (state.units.has(id) || state.buildings.has(id)) throw new EditError('badId', ent.x, ent.y);
    state.nextId = id;
  }
  let out: Unit | Building;
  if (ent.kind === 'building') {
    out = withoutSideEffects(state, ent.owner, () => placeBuilding(state, ent.owner, ent.type, ent.x, ent.y, ent.complete ?? true));
  } else {
    out = spawnUnit(state, ent.owner, ent.type, ent.x + 0.5, ent.y + 0.5);
  }
  if (id !== undefined) {
    state.nextId = Math.max(savedNext, id + 1);
    if (ent.kind === 'building') sortMapById(state.buildings); else sortMapById(state.units);
  }
  recomputePop(state, state.players[ent.owner]);
  return out;
}
function applyPlace(state: GameState, op: Extract<EditOp, { kind: 'placeEntity' }>, tags?: TagMap): EditOp {
  const ent = op.entity;
  if (!playerOk(state, ent.owner)) throw new EditError('badOwner', ent.x, ent.y);
  if (!Number.isInteger(ent.x) || !Number.isInteger(ent.y)) throw new EditError('badTile', ent.x, ent.y);
  const map = state.map;
  const savedNext = state.nextId;
  if (ent.kind === 'building') {
    if (!BUILDINGS[ent.type]) throw new EditError('badType', ent.x, ent.y);
    if (!canPlaceBuilding(state, state.players[ent.owner], ent.type, ent.x, ent.y, true, true).ok) throw new EditError('noRoom', ent.x, ent.y);
  } else {
    if (!UNITS[ent.type]) throw new EditError('badType', ent.x, ent.y);
    if (!inBounds(map, ent.x, ent.y)) throw new EditError('badTile', ent.x, ent.y);
    if (!isPassable(map, ent.x, ent.y)) throw new EditError('noRoom', ent.x, ent.y);
  }
  // unidades sobre o footprint de um edifício não passável são empurradas por placeBuilding; a inversa as traz de volta
  const moved = snapshotThenPlace(state, ent, op.id, savedNext);
  const e = (ent.kind === 'building' ? state.buildings : state.units).get(op.id ?? savedNext)!;
  if (ent.tag) setTag(tags, e.id, ent.tag);
  if (ent.kind === 'building' && BUILDINGS[ent.type].wonder && e.kind === 'building' && e.complete) refreshWonderMods(state, ent.owner);
  const inv: EditOp = { kind: 'removeEntity', id: e.id, nextId: savedNext };
  return moved.length === 0 ? inv : { kind: 'batch', ops: [inv, ...moved] };
}

/** Coloca a entidade e devolve as ops que trazem de volta as unidades que placeBuilding empurrou do footprint. */
function snapshotThenPlace(state: GameState, ent: MapEntity, id: number | undefined, savedNext: number): EditOp[] {
  const posBefore = new Map<number, { x: number; y: number }>();
  if (ent.kind === 'building' && !BUILDINGS[ent.type].passable) for (const u of state.units.values()) if (!u.dead) posBefore.set(u.id, { x: Math.floor(u.x), y: Math.floor(u.y) });
  placeWithId(state, ent, id, savedNext);
  const moved: EditOp[] = [];
  for (const u of state.units.values()) {
    const p = posBefore.get(u.id);
    if (p && (Math.floor(u.x) !== p.x || Math.floor(u.y) !== p.y)) { settleUnit(u, Math.floor(u.x), Math.floor(u.y)); moved.push({ kind: 'moveEntity', id: u.id, x: p.x, y: p.y }); }
  }
  return moved;
}

/** Marca um edifício como completo (caminho do jogo: onBuildingComplete, sem estatísticas/eventos) ou volta a "em obra". */
function setComplete(state: GameState, b: Building, complete: boolean): void {
  const def = BUILDINGS[b.type];
  const player = state.players[b.owner];
  if (complete) {
    withoutSideEffects(state, b.owner, () => onBuildingComplete(state, b));
    b.hp = b.maxHp;
  } else {
    b.complete = false; b.progress = 0; b.wonderStart = -1;
    b.hp = Math.max(1, Math.round(b.maxHp * 0.1));
    if (def.gate) for (let y = b.ty; y < b.ty + b.h; y++) for (let x = b.tx; x < b.tx + b.w; x++) state.map.gateTeam[idx(state.map, x, y)] = -1;
    if (def.territory) state.territoryDirty = true;
    recomputePop(state, player);
    if (def.wonder) refreshWonderMods(state, b.owner);
  }
}

function applyPaint(state: GameState, op: Extract<EditOp, { kind: 'paint' }>): EditOp {
  const map = state.map;
  const w = map.w, h = map.h;
  const tiles = op.tiles;
  if (tiles.length === 0) return { kind: 'paint', tiles: [], terrain: op.terrain };
  const terrainAt = (k: number) => (op.terrains ? op.terrains[k] : op.terrain);
  // validação: terreno válido, tiles no mapa, nenhum edifício sob um tile que vai virar sólido
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let k = 0; k < tiles.length; k++) {
    const i = tiles[k];
    if (!Number.isInteger(i) || i < 0 || i >= w * h) throw new EditError('badTile');
    const t = terrainAt(k);
    if (!Number.isInteger(t) || t < 0 || t > MAX_TERRAIN) throw new EditError('badTerrain');
    const x = i % w, y = (i - x) / w;
    if (isSolid(t) && map.buildingAt[i] !== -1) throw new EditError('underBuilding', x, y);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  // região que pode mudar: tiles pintados ±1 (derivação da água profunda)
  const rx0 = Math.max(0, x0 - 1), ry0 = Math.max(0, y0 - 1), rx1 = Math.min(w - 1, x1 + 1), ry1 = Math.min(h - 1, y1 + 1);
  const before = new Uint8Array((rx1 - rx0 + 1) * (ry1 - ry0 + 1));
  for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) before[(y - ry0) * (rx1 - rx0 + 1) + (x - rx0)] = map.terrain[idx(map, x, y)];
  // nós sob tiles que ficam sólidos saem (a inversa os recoloca com o mesmo id e quantidade)
  const removedNodes: ResourceNode[] = [];
  for (let k = 0; k < tiles.length; k++) {
    const i = tiles[k];
    if (!isSolid(terrainAt(k))) continue;
    const id = map.nodeAt[i];
    if (id !== -1) { const n = map.nodes.get(id); if (n) { removedNodes.push({ ...n }); removeNode(map, id); } }
  }
  for (let k = 0; k < tiles.length; k++) map.terrain[tiles[k]] = terrainAt(k);
  // Com terrains (inversa) os valores são restaurados tal qual, sem derivar: o original pode não ser "derivado"
  // (generateMap abre corredores e clareiras sem rederivar) e a inversa tem de ser exata.
  if (!op.terrains) deriveDeepWater(map, { x0, y0, x1, y1 });
  rebuildBlocked(map);
  invalidateComponents(map);
  // unidades sobre tiles que ficaram sólidos são empurradas (a inversa as traz de volta ao tile exato)
  const moved = pushUnitsFrom(state, tiles);
  state.territoryDirty = true;
  // inversa: restaura os terrenos exatos dos tiles que mudaram, recoloca os nós e traz as unidades de volta
  const invTiles: number[] = [], invTerr: number[] = [];
  const rw = rx1 - rx0 + 1;
  for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
    const i = idx(map, x, y), b = before[(y - ry0) * rw + (x - rx0)];
    if (map.terrain[i] !== b) { invTiles.push(i); invTerr.push(b); }
  }
  const inv: EditOp[] = [];
  if (invTiles.length > 0) inv.push({ kind: 'paint', tiles: invTiles, terrain: invTerr[0], terrains: invTerr });
  for (const n of removedNodes) inv.push({ kind: 'addNode', type: n.type, x: n.x, y: n.y, amount: n.amount, id: n.id });
  for (const m of moved) inv.push({ kind: 'moveEntity', id: m.id, x: m.x, y: m.y });
  if (inv.length === 1 && inv[0].kind === 'paint') return inv[0];
  return { kind: 'batch', ops: inv };
}
