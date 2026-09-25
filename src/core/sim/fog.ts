// Névoa de guerra por jogador: 0 = inexplorado, 1 = explorado (memória), 2 = visível agora.
import { BUILDINGS } from '../data';
import type { GameState, Player } from '../types';
import { circleOffsets, idx, inBounds } from '../map/grid';
import { getBuildingStats, getUnitStats } from './modifiers';

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
    if (u.dead || state.players[u.owner].team !== player.team) continue;
    mark(u.x, u.y, getUnitStats(state, state.players[u.owner], u.type).los);
  }
  for (const b of state.buildings.values()) {
    if (b.dead || state.players[b.owner].team !== player.team) continue;
    const los = b.complete ? getBuildingStats(state, state.players[b.owner], b.type).los : Math.max(3, (BUILDINGS[b.type].los ?? 6) / 2);
    mark(b.x, b.y, los);
  }
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
