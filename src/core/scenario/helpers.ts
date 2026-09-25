// Utilidades para cenários: contagens, invocação de esquadrões inimigos, recursos.
import { UNITS } from '../data';
import type { GameState, Unit } from '../types';
import { spawnUnit, placeBuilding, canPlaceBuilding } from '../sim/entities';
import { giveOrder } from '../sim/units';
import { spiralSearch, isPassable, idx, inBounds } from '../map/grid';
import { rectReachable } from '../map/components';

/** Há caminho de (a,b) até o ponto (x,y)? Se o ponto estiver sobre um edifício, basta alcançar o anel ao redor dele. */
function reachesPoint(state: GameState, a: number, b: number, x: number, y: number): boolean {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (!inBounds(state.map, tx, ty)) return false;
  const bid = state.map.buildingAt[idx(state.map, tx, ty)];
  const bld = bid !== -1 ? state.buildings.get(bid) : undefined;
  return bld ? rectReachable(state.map, a, b, bld.tx, bld.ty, bld.w, bld.h, true) : rectReachable(state.map, a, b, tx, ty, 1, 1, true);
}
import { recomputeMods, refreshMaxHp } from '../sim/modifiers';

export function count(state: GameState, owner: number, pred: (u: Unit) => boolean): number {
  let n = 0; for (const u of state.units.values()) if (u.owner === owner && !u.dead && pred(u)) n++; return n;
}
export function countBuildings(state: GameState, owner: number, type?: string): number {
  let n = 0; for (const b of state.buildings.values()) if (b.owner === owner && !b.dead && b.complete && (!type || b.type === type)) n++; return n;
}
export function military(u: Unit): boolean { return UNITS[u.type].tags.includes('military') && !UNITS[u.type].tags.includes('scout'); }
export function localPlayer(state: GameState): number { return state.config.players.findIndex((p) => !p.isAI); }
export function townCenter(state: GameState, owner: number) { return [...state.buildings.values()].find((b) => b.owner === owner && b.type === 'town_center' && !b.dead) ?? null; }

/** Invoca um esquadrão a distância do alvo e o manda atacar-mover até ele. */
export function raid(state: GameState, owner: number, types: string[], targetX: number, targetY: number, fromAngleIndex: number, distance = 22): void {
  const dirs: [number, number][] = [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]];
  const [dx, dy] = dirs[((fromAngleIndex % 8) + 8) % 8];
  // tile de origem: passável e na mesma região do alvo (nunca numa ilha ou bolsão); se não houver, aproxima-se do alvo
  const connected = (a: number, b: number) => isPassable(state.map, a, b) && reachesPoint(state, a, b, targetX, targetY);
  let ox = 0, oy = 0, origin: { x: number; y: number } | null = null;
  for (let d = distance; d >= 4 && !origin; d -= 3) {
    ox = Math.max(2, Math.min(state.map.w - 3, Math.round(targetX + dx * d)));
    oy = Math.max(2, Math.min(state.map.h - 3, Math.round(targetY + dy * d)));
    origin = spiralSearch(ox, oy, 8, connected);
  }
  if (!origin) return;
  types.forEach((t, i) => {
    const spot = spiralSearch(origin!.x + (i % 4), origin!.y + Math.floor(i / 4), 8, connected);
    if (!spot) return;
    const u = spawnUnit(state, owner, t, spot.x + 0.5, spot.y + 0.5);
    u.stance = 'aggressive';
    giveOrder(state, u, { type: 'attackMove', x: targetX, y: targetY });
    state.effects.push({ type: 'spawn', x: u.x, y: u.y, ttl: 20, total: 20 });
  });
}

export function give(state: GameState, owner: number, res: Partial<Record<'food' | 'wood' | 'gold' | 'favor' | 'knowledge', number>>): void {
  const p = state.players[owner];
  for (const [k, v] of Object.entries(res)) p.resources[k as 'food'] += v ?? 0;
}

export function grantTech(state: GameState, owner: number, tech: string): void {
  const p = state.players[owner];
  if (!p.techs.includes(tech)) { p.techs.push(tech); recomputeMods(state, p); refreshMaxHp(state, p); }
}

export function placeNear(state: GameState, owner: number, type: string, x: number, y: number, complete = true): void {
  const spot = spiralSearch(Math.floor(x), Math.floor(y), 14, (a, b) => canPlaceBuilding(state, state.players[owner], type, a, b, true, true).ok);
  if (spot) placeBuilding(state, owner, type, spot.x, spot.y, complete);
}

export function spawnGroup(state: GameState, owner: number, types: string[], x: number, y: number): Unit[] {
  const out: Unit[] = [];
  // prefere tiles na mesma região do ponto pedido (o ponto pode ser um edifício: basta ser adjacente a ele)
  const ax = Math.floor(x), ay = Math.floor(y);
  const ok = (a: number, b: number) => isPassable(state.map, a, b) && reachesPoint(state, a, b, x, y);
  types.forEach((t, i) => {
    const spot = spiralSearch(ax + (i % 3), ay + Math.floor(i / 3), 8, ok) ?? spiralSearch(ax + (i % 3), ay + Math.floor(i / 3), 8, (a, b) => isPassable(state.map, a, b));
    if (spot) out.push(spawnUnit(state, owner, t, spot.x + 0.5, spot.y + 0.5));
  });
  return out;
}
