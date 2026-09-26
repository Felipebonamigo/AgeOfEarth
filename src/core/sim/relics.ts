// Relíquias (Fase 5.2): objetos no mapa que heróis recolhem e guardam num Templo próprio; cada relíquia guardada rende favor.
// Determinístico: posições escolhidas com state.rng; atualização uma vez por segundo.
import { MAX_FIXED_RELICS, RELIC_COUNT_BASE, RELIC_FAVOR_PER_SECOND, RELIC_SNAP_RADIUS } from '../constants';
import { BUILDINGS, UNITS } from '../data';
import type { GameState } from '../types';
import { componentAt, componentSize } from '../map/components';
import { isPassable, dist, inBounds, spiralSearch } from '../map/grid';
import { t } from '../../i18n';

/** Espalha relíquias em tiles passáveis da região principal, longe dos inícios e umas das outras. */
export function placeRelics(state: GameState): void {
  const map = state.map;
  const n = RELIC_COUNT_BASE + state.players.length;
  let bestComp = -1, bestSize = 0;
  for (const s of map.starts) { const c = componentAt(map, s.x, s.y + 3); if (componentSize(map, c) > bestSize) { bestSize = componentSize(map, c); bestComp = c; } }
  let tries = 0;
  while (state.relics.length < n && tries++ < 400) {
    const x = state.rng.int(6, map.w - 7), y = state.rng.int(6, map.h - 7);
    if (!isPassable(map, x, y) || componentAt(map, x, y) !== bestComp) continue;
    if (map.starts.some((s) => dist(s.x, s.y, x, y) < 16)) continue;
    if (state.relics.some((r) => dist(r.x, r.y, x, y) < 12)) continue;
    state.relics.push({ x: x + 0.5, y: y + 0.5, carrier: -1, templeId: -1 });
  }
}

/**
 * G10: relíquias em posições fixas (map.relics / config.relics = [[x, y], …], tiles), na ordem da lista. Cada uma fica no
 * centro do tile se ele for terra passável na região de algum início; senão, no tile assim mais próximo (até
 * RELIC_SNAP_RADIUS; mapa gerado, em que a posição não pôde ser conferida antes), ou é descartada. Sem state.rng.
 */
export function placeRelicsAt(state: GameState, list: readonly (readonly [number, number])[]): void {
  const map = state.map;
  const regions = new Set<number>();
  for (const s of map.starts) {   // com kit, o CC ocupa o tile do início: vale o tile livre mais próximo
    const t = spiralSearch(s.x, s.y, 3, (a, b) => isPassable(map, a, b));
    if (t) regions.add(componentAt(map, t.x, t.y));
  }
  const ok = (a: number, b: number) => isPassable(map, a, b) && regions.has(componentAt(map, a, b));
  for (const p of list.slice(0, MAX_FIXED_RELICS)) {
    if (!Array.isArray(p) || !Number.isInteger(p[0]) || !Number.isInteger(p[1]) || !inBounds(map, p[0], p[1])) continue;
    const spot = ok(p[0], p[1]) ? { x: p[0], y: p[1] } : spiralSearch(p[0], p[1], RELIC_SNAP_RADIUS, ok);
    if (spot) state.relics.push({ x: spot.x + 0.5, y: spot.y + 0.5, carrier: -1, templeId: -1 });
  }
}

/** Herói passa por cima: recolhe; herói com relíquia perto de Templo próprio: guarda; portador morto/Templo destruído: cai no chão. */
export function updateRelics(state: GameState): void {
  for (const r of state.relics) {
    if (r.templeId !== -1) {
      const b = state.buildings.get(r.templeId);
      if (!b || b.dead) { r.templeId = -1; if (b) { r.x = b.x; r.y = b.y; } continue; }
      state.players[b.owner].resources.favor += RELIC_FAVOR_PER_SECOND;
      continue;
    }
    if (r.carrier !== -1) {
      const u = state.units.get(r.carrier);
      if (!u || u.dead) { r.carrier = -1; if (u) { r.x = u.x; r.y = u.y; } continue; }
      r.x = u.x; r.y = u.y;
      for (const b of state.buildings.values()) {
        if (b.owner !== u.owner || b.dead || !b.complete || !BUILDINGS[b.type].worship) continue;
        if (dist(u.x, u.y, b.x, b.y) <= b.w / 2 + 1.6) {
          r.carrier = -1; r.templeId = b.id; r.x = b.x; r.y = b.y;
          state.events.push({ tick: state.tick, type: 'relic', player: u.owner, x: b.x, y: b.y, text: t('ev.relicStored', { player: state.players[u.owner].name, n: relicsOf(state, u.owner) }) });
          break;
        }
      }
      continue;
    }
    // no chão: o primeiro herói vivo a passar a 1 tile recolhe
    for (const u of state.units.values()) {
      if (u.dead || u.inside !== -1 || !UNITS[u.type].tags.includes('hero')) continue;
      if (dist(u.x, u.y, r.x, r.y) <= 1.0) {
        r.carrier = u.id;
        state.events.push({ tick: state.tick, type: 'relic', player: u.owner, x: u.x, y: u.y, text: t('ev.relicPicked', { name: UNITS[u.type].name, player: state.players[u.owner].name }) });
        break;
      }
    }
  }
}

export function relicsOf(state: GameState, player: number): number {
  let n = 0;
  for (const r of state.relics) if (r.templeId !== -1) { const b = state.buildings.get(r.templeId); if (b && !b.dead && b.owner === player) n++; }
  return n;
}
