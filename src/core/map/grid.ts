// Utilitários de grade. Sem funções trigonométricas: a simulação precisa ser determinística entre máquinas.
import type { GameMap } from '../types';

export const idx = (map: { w: number }, x: number, y: number): number => y * map.w + x;
export const inBounds = (map: { w: number; h: number }, x: number, y: number): boolean => x >= 0 && y >= 0 && x < map.w && y < map.h;
export const dist = (ax: number, ay: number, bx: number, by: number): number => { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); };
export const dist2 = (ax: number, ay: number, bx: number, by: number): number => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Distância de um ponto ao retângulo de tiles [tx, tx+w) x [ty, ty+h). */
export function distToRect(px: number, py: number, tx: number, ty: number, w: number, h: number): number {
  const cx = clamp(px, tx, tx + w), cy = clamp(py, ty, ty + h);
  return dist(px, py, cx, cy);
}

const circleCache = new Map<number, Int16Array>();
/** Offsets (dx,dy) de todos os tiles dentro de um círculo de raio r (em tiles), com cache. */
export function circleOffsets(r: number): Int16Array {
  const key = Math.round(r * 4);
  let c = circleCache.get(key);
  if (c) return c;
  const R = Math.ceil(r);
  const out: number[] = [];
  const r2 = r * r;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= r2) out.push(dx, dy);
  c = Int16Array.from(out);
  circleCache.set(key, c);
  return c;
}

export function isPassable(map: GameMap, x: number, y: number): boolean {
  return inBounds(map, x, y) && map.blocked[idx(map, x, y)] === 0;
}
/** Passável para uma unidade de determinado time (portões do próprio time são atravessáveis). */
export function canPass(map: GameMap, x: number, y: number, team: number): boolean {
  if (!inBounds(map, x, y)) return false;
  const i = idx(map, x, y);
  return map.blocked[i] === 0 || (team >= 0 && map.gateTeam[i] === team);
}

/** Percorre tiles em espiral a partir de (cx,cy) até pred retornar true. Retorna o tile ou null. */
export function spiralSearch(cx: number, cy: number, maxR: number, pred: (x: number, y: number) => boolean): { x: number; y: number } | null {
  if (pred(cx, cy)) return { x: cx, y: cy };
  for (let r = 1; r <= maxR; r++) {
    for (let i = -r; i <= r; i++) {
      if (pred(cx + i, cy - r)) return { x: cx + i, y: cy - r };
      if (pred(cx + i, cy + r)) return { x: cx + i, y: cy + r };
    }
    for (let i = -r + 1; i <= r - 1; i++) {
      if (pred(cx - r, cy + i)) return { x: cx - r, y: cy + i };
      if (pred(cx + r, cy + i)) return { x: cx + r, y: cy + i };
    }
  }
  return null;
}

/** Verdadeiro se a linha entre dois pontos (em tiles) não cruza tiles bloqueados (Bresenham supercover). */
export function lineClear(map: GameMap, x0: number, y0: number, x1: number, y1: number, team = -1): boolean {
  let ix = Math.floor(x0), iy = Math.floor(y0);
  const ex = Math.floor(x1), ey = Math.floor(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x1 > x0 ? 1 : -1, sy = y1 > y0 ? 1 : -1;
  let err = dx - dy;
  let guard = 0;
  while (guard++ < 4096) {
    if (!canPass(map, ix, iy, team)) return false;
    if (ix === ex && iy === ey) return true;
    const e2 = 2 * err;
    let moved = 0;
    if (e2 > -dy) { err -= dy; ix += sx; moved++; }
    if (e2 < dx) { err += dx; iy += sy; moved++; }
    if (moved === 2) {
      // movimento diagonal: exige que os dois vizinhos ortogonais também sejam livres (evita cortar cantos)
      if (!canPass(map, ix - sx, iy, team) || !canPass(map, ix, iy - sy, team)) return false;
    }
  }
  return false;
}
