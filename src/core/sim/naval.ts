// Navios no núcleo (E4; docs/eras/E4-naval.md): onde parar para alcançar um alvo no outro meio, onde encostar na margem,
// embarque e desembarque, entrega de peixe. Determinístico: só o estado; desempates pelo centro do mapa e por frameCompare
// (justiça de posição, CLAUDE.md), nunca pela ordem da varredura.
import { UNITS, BUILDINGS } from '../data';
import type { Building, GameMap, GameState, Unit } from '../types';
import type { ResourceType } from '../constants';
import { centerFrame, distToRect, dist, frameCompare, idx, isPassable, spiralSearchFrame, towardFrame } from '../map/grid';
import { componentAt, rectReachable } from '../map/components';
import { isOpenWater, layerOf, type Layer } from '../map/naval';
import { centerDist2, nearestDropoff, nodeAccessTiles } from './queries';
import { openTile } from './entities';
import { navalOn } from './restrictions';

/** Desempate justo entre dois candidatos à mesma distância: o mais perto do centro do mapa; depois frameCompare no
 *  referencial de `ref` voltado ao centro. true = `a` ganha de `b`. */
export function fairer(map: GameMap, ref: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const ca = centerDist2(map, a.x + 0.5, a.y + 0.5), cb = centerDist2(map, b.x + 0.5, b.y + 0.5);
  if (ca !== cb) return ca < cb;
  return frameCompare(centerFrame(map, ref.x, ref.y), a.x - b.x, a.y - b.y, 0, 0) < 0;
}

/** Tile da camada `layer`, na mesma região de (fx, fy), a até `reach` do alvo (centro do tile ao ponto mais próximo
 *  dele): o mais perto de quem anda. null = o alvo está longe demais da água (ou da terra). */
export function approachTile(map: GameMap, layer: Layer, fx: number, fy: number, target: Unit | Building, reach: number): { x: number; y: number } | null {
  const from = componentAt(map, Math.floor(fx), Math.floor(fy), layer);
  if (from < 0) return null;
  const R = Math.ceil(reach) + 1;
  const b = target.kind === 'building' ? target : null;
  const x0 = b ? b.tx : Math.floor(target.x), y0 = b ? b.ty : Math.floor(target.y), w = b ? b.w : 1, h = b ? b.h : 1;
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (let y = y0 - R; y < y0 + h + R; y++) for (let x = x0 - R; x < x0 + w + R; x++) {
    if (!isPassable(map, x, y, layer) || componentAt(map, x, y, layer) !== from) continue;
    const cx = x + 0.5, cy = y + 0.5;
    const dT = b ? distToRect(cx, cy, b.tx, b.ty, b.w, b.h) : dist(cx, cy, target.x, target.y);
    if (dT > reach) continue;
    const d = (cx - fx) * (cx - fx) + (cy - fy) * (cy - fy);
    if (d < bd || (d === bd && best && fairer(map, target, { x, y }, best))) { bd = d; best = { x, y }; }
  }
  return best;
}

/** Tile navegável do mar do navio em (sx, sy), encostado (4-vizinhança) num tile caminhável, mais perto de (x, y), a até
 *  maxR. É onde o navio encosta para embarcar ou desembarcar. */
export function shoreTileNear(map: GameMap, sx: number, sy: number, x: number, y: number, maxR = 12): { x: number; y: number } | null {
  const sea = componentAt(map, Math.floor(sx), Math.floor(sy), 'naval');
  if (sea < 0) return null;
  const ox = Math.floor(x), oy = Math.floor(y);
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (let ty = oy - maxR; ty <= oy + maxR; ty++) for (let tx = ox - maxR; tx <= ox + maxR; tx++) {
    if (componentAt(map, tx, ty, 'naval') !== sea) continue;
    if (!isPassable(map, tx + 1, ty) && !isPassable(map, tx - 1, ty) && !isPassable(map, tx, ty + 1) && !isPassable(map, tx, ty - 1)) continue;
    const cx = tx + 0.5, cy = ty + 0.5, d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
    if (d > maxR * maxR) continue;
    if (d < bd || (d === bd && best && fairer(map, { x, y }, { x: tx, y: ty }, best))) { bd = d; best = { x: tx, y: ty }; }
  }
  return best;
}

/** E6: camada de uma unidade nesta partida — anfíbia só com navios ligados (na campanha, Oceano anda só em terra; D15). */
export function unitLayer(state: GameState, def: { naval?: boolean; amphibious?: boolean }): Layer {
  if (def.amphibious && !navalOn(state)) return 'land';
  return layerOf(def);
}
/** E6: em que meio a unidade está agora (terra × mar): naval no mar; anfíbia pelo tile (água aberta = mar; baixio = terra). */
export function mediumOf(state: GameState, u: Unit): 'land' | 'sea' {
  const lay = unitLayer(state, UNITS[u.type]);
  if (lay === 'naval') return 'sea';
  if (lay === 'amphibious') { const m = state.map; const tx = Math.floor(u.x), ty = Math.floor(u.y); return tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && isOpenWater(m.terrain[idx(m, tx, ty)]) ? 'sea' : 'land'; }
  return 'land';
}

/** Lugar que a unidade ocupa a bordo: a população dela, no mínimo 1 (milícia, rei e Sombras têm pop 0 e não podem
 *  lotar um transporte infinito). */
export const seatsOf = (type: string): number => Math.max(1, UNITS[type].pop);
/** Lugares ocupados a bordo. */
export function cargoPop(state: GameState, ship: Unit): number {
  let n = 0;
  for (const id of ship.cargo) { const u = state.units.get(id); if (u && !u.dead) n += seatsOf(u.type); }
  return n;
}
/** A unidade pode embarcar neste transporte agora (dono, tipo e lugar)? Quem carrega relíquia não embarca (afundando,
 *  a relíquia cairia no mar, onde ninguém a recolhe). */
export function canBoard(state: GameState, u: Unit, ship: Unit): boolean {
  const d = UNITS[u.type], sd = UNITS[ship.type];
  if (!sd.capacity || ship.dead || u.dead || u.id === ship.id || ship.owner !== u.owner || u.inside !== -1 || ship.inside !== -1) return false;
  if (d.naval || d.amphibious || d.flying || d.immobile || d.tags.includes('titan')) return false;
  if (state.relics.some((r) => r.carrier === u.id)) return false;
  return cargoPop(state, ship) + seatsOf(u.type) <= sd.capacity;
}
/** Sobe a bordo (como enterGarrison: some do mapa e para de pensar). */
export function boardShip(state: GameState, u: Unit, ship: Unit): boolean {
  if (!canBoard(state, u, ship)) return false;
  u.inside = ship.id; u.state = 'garrison'; u.order = null; u.queue.length = 0; u.path = null; u.targetId = -1; u.nodeId = -1; u.resumeNodeId = -1;
  u.x = ship.x; u.y = ship.y; u.px = u.x; u.py = u.y;
  ship.cargo.push(u.id);
  return true;
}
/** Desce a carga nos tiles caminháveis livres a até 3 tiles do navio, começando pelo lado de (toX, toY). Devolve quem
 *  desceu (quem não coube fica a bordo). Quem chama dá as ordens (evita ciclo units ↔ naval). */
export function dropCargo(state: GameState, ship: Unit, toX: number, toY: number): Unit[] {
  const map = state.map, out: Unit[] = [], left: number[] = [], taken = new Set<number>();
  const f = towardFrame(toX - ship.x, toY - ship.y, centerFrame(map, ship.x, ship.y));
  for (const id of ship.cargo) {
    const u = state.units.get(id);
    if (!u || u.dead) continue;
    const t = spiralSearchFrame(Math.floor(ship.x), Math.floor(ship.y), 3, (a, b) => openTile(state, a, b) && !taken.has(b * map.w + a), f);
    if (!t) { left.push(id); continue; }
    taken.add(t.y * map.w + t.x);
    u.inside = -1; u.state = 'idle'; u.order = null; u.path = null; u.targetId = -1; u.orderTick = state.tick;
    u.x = t.x + 0.5; u.y = t.y + 0.5; u.px = u.x; u.py = u.y;
    out.push(u);
  }
  ship.cargo = left;
  return out;
}
/** Estaleiro (navalDropoff) do dono que aceita `res` e que o navio alcança pelo mar; o mais perto, desempate justo. */
export function nearestNavalDropoff(state: GameState, owner: number, x: number, y: number, res: ResourceType, avoid?: number[]): Building | null {
  const map = state.map, sx = Math.floor(x), sy = Math.floor(y);
  let best: Building | null = null, bd = Infinity;
  for (const b of state.buildings.values()) {
    if (b.owner !== owner || b.dead || !b.complete || (avoid && avoid.includes(b.id))) continue;
    if (!BUILDINGS[b.type].navalDropoff?.includes(res)) continue;
    if (!rectReachable(map, sx, sy, b.tx, b.ty, b.w, b.h, true, 'naval')) continue;
    const d = distToRect(x, y, b.tx, b.ty, b.w, b.h);
    if (d < bd || (d === bd && best && fairer(map, { x, y }, { x: b.tx, y: b.ty }, { x: best.tx, y: best.ty }))) { bd = d; best = b; }
  }
  return best;
}
/** Ponto de entrega da unidade: navio só entrega no Estaleiro pelo mar; o resto, como sempre. */
export function dropoffFor(state: GameState, u: Unit, res: ResourceType, avoid?: number[]): Building | null {
  return UNITS[u.type].naval ? nearestNavalDropoff(state, u.owner, u.x, u.y, res, avoid) : nearestDropoff(state, u.owner, u.x, u.y, res, avoid);
}
/** Cardumes (fish, com quantidade e acesso pelo mar) a até r de (x, y). */
export function fishNear(state: GameState, x: number, y: number, r = 26): number {
  let n = 0;
  for (const nd of state.map.nodes.values()) if (nd.type === 'fish' && nd.amount > 0 && dist(nd.x + 0.5, nd.y + 0.5, x, y) <= r && nodeAccessTiles(state.map, nd) > 0) n++;
  return n;
}
