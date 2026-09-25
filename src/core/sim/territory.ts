// Fronteiras nacionais (estilo Rise of Nations): cada edifício com "territory" projeta influência;
// o tile pertence a quem tiver a maior influência. Recalculado quando edifícios/tecnologias mudam.
import { BUILDINGS } from '../data';
import type { GameState } from '../types';
import { circleOffsets, idx, inBounds } from '../map/grid';
import { getBuildingStats } from './modifiers';

export function recomputeTerritory(state: GameState): void {
  const map = state.map;
  const n = map.w * map.h;
  const strength = new Float32Array(n);
  state.territory.fill(-1);
  for (const p of state.players) p.territoryTiles = 0;
  const sources: { x: number; y: number; r: number; owner: number }[] = [];
  for (const b of state.buildings.values()) {
    if (b.dead || !b.complete) continue;
    const def = BUILDINGS[b.type];
    if (!def.territory) continue;
    const r = getBuildingStats(state, state.players[b.owner], b.type).territory;
    sources.push({ x: b.x, y: b.y, r, owner: b.owner });
  }
  // Ordem estável: por id de jogador e posição, para desempate determinístico
  sources.sort((a, b) => a.owner - b.owner || a.y - b.y || a.x - b.x);
  for (const s of sources) {
    const offs = circleOffsets(s.r);
    const cx = Math.floor(s.x), cy = Math.floor(s.y);
    for (let i = 0; i < offs.length; i += 2) {
      const x = cx + offs[i], y = cy + offs[i + 1];
      if (!inBounds(map, x, y)) continue;
      const dx = x + 0.5 - s.x, dy = y + 0.5 - s.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const st = s.r - d;
      if (st <= 0) continue;
      const k = idx(map, x, y);
      if (st > strength[k]) { strength[k] = st; state.territory[k] = s.owner; }
    }
  }
  for (let k = 0; k < n; k++) { const o = state.territory[k]; if (o >= 0) state.players[o].territoryTiles++; }
  state.territoryDirty = false;
  state.territoryVersion++;
}

export function territoryOwnerAt(state: GameState, x: number, y: number): number {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (!inBounds(state.map, tx, ty)) return -1;
  return state.territory[idx(state.map, tx, ty)];
}
