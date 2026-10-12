// Névoa de guerra por jogador: 0 = inexplorado, 1 = explorado (memória), 2 = visível agora.
import { BUILDINGS } from '../data';
import type { GameMap, GameState, Player } from '../types';
import { isNavigableTerrain } from '../map/naval';
import { circleOffsets, idx, inBounds } from '../map/grid';
import { getBuildingStats, getUnitStats } from './modifiers';

const coastCache = new WeakMap<GameMap, Int32Array>();
/** Litoral que o Farol de Alexandria revela: tiles de água com um vizinho (4 lados) de terra. O terreno não muda em
 *  partida, então a lista vale para o mapa inteiro (cache por mapa, fora do save e do hash). */
function coastTiles(map: GameMap): Int32Array {
  let c = coastCache.get(map);
  if (!c) {
    const out: number[] = [];
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if (!isNavigableTerrain(map.terrain[i])) continue;
      if ((x > 0 && !isNavigableTerrain(map.terrain[i - 1])) || (x < map.w - 1 && !isNavigableTerrain(map.terrain[i + 1])) || (y > 0 && !isNavigableTerrain(map.terrain[i - map.w])) || (y < map.h - 1 && !isNavigableTerrain(map.terrain[i + map.w]))) out.push(i);
    }
    c = Int32Array.from(out); coastCache.set(map, c);
  }
  return c;
}

export function updateFog(state: GameState, player: Player): void {
  const vis = player.visibility;
  const map = state.map;
  if (state.tick < player.revealUntil || state.config.revealMap) { vis.fill(2); state.fogVersion++; return; }
  for (let i = 0; i < vis.length; i++) if (vis[i] === 2) vis[i] = 1;
  const mark = (x: number, y: number, r: number) => {
    const offs = circleOffsets(r);
    const cx = Math.floor(x), cy = Math.floor(y);
    for (let i = 0; i < offs.length; i += 2) {
      const tx = cx + offs[i], ty = cy + offs[i + 1];
      if (inBounds(map, tx, ty)) vis[idx(map, tx, ty)] = 2;
    }
  };
  // Visão compartilhada entre aliados (mesmo time)
  for (const u of state.units.values()) {
    if (u.dead || u.inside !== -1 || state.players[u.owner].team !== player.team) continue;
    mark(u.x, u.y, getUnitStats(state, state.players[u.owner], u.type).los);
  }
  for (const b of state.buildings.values()) {
    if (b.dead || state.players[b.owner].team !== player.team) continue;
    const los = b.complete ? getBuildingStats(state, state.players[b.owner], b.type).los : Math.max(3, (BUILDINGS[b.type].los ?? 6) / 2);
    mark(b.x, b.y, los);
  }
  if (state.players.some((q) => q.team === player.team && q.alive && q.mods.player.coastSight > 0)) for (const i of coastTiles(map)) vis[i] = 2;   // E7: Farol de Alexandria
  state.fogVersion++;
}

export function isVisible(state: GameState, player: Player, x: number, y: number): boolean {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (!inBounds(state.map, tx, ty)) return false;
  return player.visibility[idx(state.map, tx, ty)] === 2;
}
export function isExplored(state: GameState, player: Player, x: number, y: number): boolean {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (!inBounds(state.map, tx, ty)) return false;
  return player.visibility[idx(state.map, tx, ty)] >= 1;
}
