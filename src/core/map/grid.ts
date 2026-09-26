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

/** Passo físico de (x0,y0) a (x1,y1): destino passável e, ao trocar de tile em x e em y ao mesmo tempo, os dois vizinhos
 * ortogonais também (mesma regra do A*: não atravessa a fresta diagonal entre dois obstáculos). */
export function canStep(map: GameMap, x0: number, y0: number, x1: number, y1: number, team: number): boolean {
  const ax = Math.floor(x0), ay = Math.floor(y0), bx = Math.floor(x1), by = Math.floor(y1);
  if (!canPass(map, bx, by, team)) return false;
  if (ax !== bx && ay !== by) return canPass(map, bx, ay, team) && canPass(map, ax, by, team);
  return true;
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

/**
 * Referencial de orientação para buscas e deslocamentos "relativos": um deslocamento local (a, b) vira (a, b) → troca x↔y
 * se swap → multiplica por (sx, sy). O referencial identidade (1, 1, false) é a orientação absoluta antiga (espiral que
 * testa o norte primeiro e anda de oeste para leste). Com o referencial de um ponto e o do seu espelho (ou rotação de 180°,
 * ou transposição), as buscas visitam tiles espelhados na mesma ordem: num mapa simétrico os dois lados decidem igual.
 */
export interface Frame { sx: 1 | -1; sy: 1 | -1; swap: boolean }
export const IDENTITY_FRAME: Frame = { sx: 1, sy: 1, swap: false };

/**
 * Referencial "voltado ao centro do mapa" de (x, y), a partir do vetor ponto→centro (só sinais e o eixo dominante; sem
 * trigonometria): sx = +1 com o centro a leste, sy = +1 com o centro ao sul (o canto noroeste é o identidade) e swap quando
 * o centro está mais longe em x do que em y (a "frente" é leste/oeste; b passa a medir x). Deslocamento local: b > 0 = rumo
 * ao centro no eixo dominante; a = ao longo, a > 0 = rumo ao centro no outro eixo.
 * Invariâncias (o referencial do ponto transformado é o transformado do referencial): espelho em x ou em y e rotação de
 * 180° valem em todo o mapa. Em cima de um eixo do centro (dx = 0 ou dy = 0) o sinal desse eixo segue o do outro, o que
 * vale também para a transposição. Nas diagonais do centro (|dx| = |dy|, ex.: os inícios do Estreito) swap é sempre false:
 * lá a transposição NÃO é respeitada (o ponto e o transposto recebem swap = false, e a e b trocam de papel entre eles); só
 * o espelho e a rotação de 180° — um mapa cuja única simetria entre dois inícios diagonais fosse a transposição decidiria
 * diferente dos dois lados.
 */
export function centerFrame(map: { w: number; h: number }, x: number, y: number): Frame {
  const dx = map.w / 2 - x, dy = map.h / 2 - y;
  const sx: 1 | -1 = dx > 0 ? 1 : dx < 0 ? -1 : dy >= 0 ? 1 : -1;
  const sy: 1 | -1 = dy > 0 ? 1 : dy < 0 ? -1 : dx >= 0 ? 1 : -1;
  return { sx, sy, swap: Math.abs(dx) > Math.abs(dy) };
}

/**
 * Referencial cujo primeiro anel da espiral começa pelo lado (dx, dy): "o lado de quem chega" (swap quando |dx| > |dy|).
 * Com uma componente nula, o sinal dela vem de `tie` (padrão: identidade, o oeste/norte absoluto); passe o centerFrame do
 * ponto para que também o caso alinhado seja espelhado.
 */
export function towardFrame(dx: number, dy: number, tie: Frame = IDENTITY_FRAME): Frame {
  return { sx: dx > 0 ? -1 : dx < 0 ? 1 : tie.sx, sy: dy > 0 ? -1 : dy < 0 ? 1 : tie.sy, swap: Math.abs(dx) > Math.abs(dy) };
}

/**
 * Desempate "b, depois a" (crescentes) entre os deslocamentos p = (pdx, pdy) e q = (qdx, qdy) no referencial f (os dois
 * medidos a partir do mesmo ponto; qualquer origem comum serve): negativo quando p vem antes. Com o centerFrame do ponto de
 * referência, candidatos espelhados comparam igual dos dois lados; (y, x) absolutos preferiam o norte/oeste nos dois.
 */
export function frameCompare(f: Frame, pdx: number, pdy: number, qdx: number, qdy: number): number {
  const pb = f.swap ? pdx * f.sx : pdy * f.sy, qb = f.swap ? qdx * f.sx : qdy * f.sy;
  if (pb !== qb) return pb - qb;
  return f.swap ? (pdy - qdy) * f.sy : (pdx - qdx) * f.sx;
}

/**
 * Arredondamento "espelhável" ao inteiro mais próximo: o meio (.5) sobe no eixo de sinal +1 e desce no de sinal −1, o
 * espelho exato de W − v (Math.round levaria 22,5 a 23 e o espelho 57,5 a 58, não 57).
 */
export function frameRound(v: number, s: 1 | -1): number { return s > 0 ? Math.floor(v + 0.5) : Math.ceil(v - 0.5); }

/** Coordenada mundial de um deslocamento local (a, b) a partir de (x, y) no referencial f. */
export function frameOffset(f: Frame, x: number, y: number, a: number, b: number): { x: number; y: number } {
  return f.swap ? { x: x + b * f.sx, y: y + a * f.sy } : { x: x + a * f.sx, y: y + b * f.sy };
}

/**
 * Tile de uma coordenada contínua "espelhável": no eixo espelhado (sinal −1) um valor inteiro cai no tile de baixo, o
 * espelho exato do tile de (W − v) (sem isso, v = 28 no norte vira o tile 28 e o espelho 85 no sul vira o tile 85, não 84).
 */
export function frameTile(v: number, s: 1 | -1): number { return Math.floor(s < 0 ? v - 1e-6 : v); }

/** Espiral de spiralSearch no referencial f (o identidade é spiralSearch). */
export function spiralSearchFrame(cx: number, cy: number, maxR: number, pred: (x: number, y: number) => boolean, f: Frame): { x: number; y: number } | null {
  if (!f.swap && f.sx === 1 && f.sy === 1) return spiralSearch(cx, cy, maxR, pred);
  // (a, b) local → x = cx + a·ax + b·bx, y = cy + a·ay + b·by
  const ax = f.swap ? 0 : f.sx, ay = f.swap ? f.sy : 0, bx = f.swap ? f.sx : 0, by = f.swap ? 0 : f.sy;
  if (pred(cx, cy)) return { x: cx, y: cy };
  for (let r = 1; r <= maxR; r++) {
    for (let i = -r; i <= r; i++) {
      let x = cx + i * ax - r * bx, y = cy + i * ay - r * by;
      if (pred(x, y)) return { x, y };
      x = cx + i * ax + r * bx; y = cy + i * ay + r * by;
      if (pred(x, y)) return { x, y };
    }
    for (let i = -r + 1; i <= r - 1; i++) {
      let x = cx - r * ax + i * bx, y = cy - r * ay + i * by;
      if (pred(x, y)) return { x, y };
      x = cx + r * ax + i * bx; y = cy + r * ay + i * by;
      if (pred(x, y)) return { x, y };
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
