// A* em grade com 8 direções, sem cortar cantos, heap binário e suavização por linha de visada.
import type { GameMap } from '../types';
import { idx, inBounds, lineClear, isPassable, frameOffset, IDENTITY_FRAME, type Frame } from './grid';

class MinHeap {
  keys: number[] = []; vals: number[] = [];
  get size() { return this.keys.length; }
  push(key: number, val: number) {
    this.keys.push(key); this.vals.push(val);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p); i = p;
    }
  }
  pop(): number {
    const top = this.vals[0];
    const lk = this.keys.pop()!, lv = this.vals.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lk; this.vals[0] = lv;
      let i = 0; const n = this.keys.length;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < n && this.keys[l] < this.keys[m]) m = l;
        if (r < n && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  swap(a: number, b: number) {
    const tk = this.keys[a]; this.keys[a] = this.keys[b]; this.keys[b] = tk;
    const tv = this.vals[a]; this.vals[a] = this.vals[b]; this.vals[b] = tv;
  }
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const SQRT2 = 1.4142135623730951;

// Buffers reutilizados (evita alocar por chamada)
let gBuf = new Float32Array(0), parentBuf = new Int32Array(0), closedBuf = new Uint8Array(0), stampBuf = new Uint32Array(0);
let stamp = 1;
function ensureBuffers(n: number) {
  if (gBuf.length < n) { gBuf = new Float32Array(n); parentBuf = new Int32Array(n); closedBuf = new Uint8Array(n); stampBuf = new Uint32Array(n); }
}

export interface PathGoal { tx: number; ty: number; w: number; h: number }   // retângulo-alvo (tiles); w=h=1 para ponto

function goalDist(x: number, y: number, g: PathGoal): number {
  const cx = x < g.tx ? g.tx : x >= g.tx + g.w ? g.tx + g.w - 1 : x;
  const cy = y < g.ty ? g.ty : y >= g.ty + g.h ? g.ty + g.h - 1 : y;
  const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
  return (dx > dy) ? (dx - dy) + SQRT2 * dy : (dy - dx) + SQRT2 * dx;
}
function isGoal(x: number, y: number, g: PathGoal, adjacent: boolean): boolean {
  if (adjacent) {
    return x >= g.tx - 1 && x <= g.tx + g.w && y >= g.ty - 1 && y <= g.ty + g.h && !(x >= g.tx && x < g.tx + g.w && y >= g.ty && y < g.ty + g.h);
  }
  return x >= g.tx && x < g.tx + g.w && y >= g.ty && y < g.ty + g.h;
}

/**
 * Encontra um caminho de (sx,sy) até o objetivo. Se adjacent=true, termina em qualquer tile livre adjacente ao retângulo.
 * Retorna array plano de centros de tiles [x0,y0,x1,y1,...] (excluindo a origem) ou null se nada for alcançável.
 * Se o objetivo for inalcançável dentro do orçamento, retorna um caminho parcial até o tile mais próximo explorado.
 */
export function findPath(map: GameMap, sx: number, sy: number, goal: PathGoal, adjacent = false, maxNodes = 6000, team = -1): number[] | null {
  return findPathEx(map, sx, sy, goal, adjacent, maxNodes, team).path;
}

/** Como findPath, mas informa se o caminho chegou de fato ao objetivo (false = parcial por orçamento ou inalcançável). */
export function findPathEx(map: GameMap, sx: number, sy: number, goal: PathGoal, adjacent = false, maxNodes = 6000, team = -1): { path: number[] | null; complete: boolean } {
  const pass = (i: number) => map.blocked[i] === 0 || (team >= 0 && map.gateTeam[i] === team);
  const n = map.w * map.h;
  ensureBuffers(n);
  stamp++;
  if (stamp === 0xffffffff) { stampBuf.fill(0); stamp = 1; }
  if (!inBounds(map, sx, sy)) return { path: null, complete: false };
  const start = idx(map, sx, sy);
  if (isGoal(sx, sy, goal, adjacent)) return { path: [], complete: true };
  const heap = new MinHeap();
  gBuf[start] = 0; parentBuf[start] = -1; stampBuf[start] = stamp; closedBuf[start] = 0;
  heap.push(goalDist(sx, sy, goal), start);
  let best = start, bestH = goalDist(sx, sy, goal);
  let expanded = 0;
  let found = -1;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closedBuf[cur] === 1 && stampBuf[cur] === stamp) continue;
    closedBuf[cur] = 1;
    const cx = cur % map.w, cy = (cur - cx) / map.w;
    if (isGoal(cx, cy, goal, adjacent)) { found = cur; break; }
    if (++expanded > maxNodes) break;
    const gc = gBuf[cur];
    for (let d = 0; d < 8; d++) {
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (!inBounds(map, nx, ny)) continue;
      const ni = ny * map.w + nx;
      if (!pass(ni)) continue;
      if (d >= 4) { // diagonal: não cortar cantos
        if (!pass(cy * map.w + nx) || !pass(ny * map.w + cx)) continue;
      }
      const ng = gc + (d >= 4 ? SQRT2 : 1);
      if (stampBuf[ni] === stamp) {
        if (closedBuf[ni] === 1 || ng >= gBuf[ni]) continue;
      } else { stampBuf[ni] = stamp; closedBuf[ni] = 0; }
      gBuf[ni] = ng; parentBuf[ni] = cur;
      const h = goalDist(nx, ny, goal);
      if (h < bestH) { bestH = h; best = ni; }
      heap.push(ng + h * 1.001, ni);
    }
  }
  const end = found >= 0 ? found : best;
  if (end === start) return found >= 0 ? { path: [], complete: true } : { path: null, complete: false };
  const rev: number[] = [];
  let c = end;
  while (c !== -1 && c !== start) { rev.push(c); c = parentBuf[c]; }
  const tiles: number[] = [];
  for (let i = rev.length - 1; i >= 0; i--) { const t = rev[i]; const x = t % map.w; tiles.push(x, (t - x) / map.w); }
  return { path: smoothPath(map, sx, sy, tiles, team), complete: found >= 0 };
}

/** Remove waypoints intermediários quando há linha de visada livre. */
function smoothPath(map: GameMap, sx: number, sy: number, tiles: number[], team = -1): number[] {
  const n = tiles.length / 2;
  if (n <= 1) return tiles.map((v) => v + 0.5);
  const out: number[] = [];
  let ax = sx, ay = sy;
  let i = 0;
  while (i < n) {
    let j = n - 1;
    while (j > i) {
      if (lineClear(map, ax, ay, tiles[2 * j], tiles[2 * j + 1], team)) break;
      j--;
    }
    out.push(tiles[2 * j] + 0.5, tiles[2 * j + 1] + 0.5);
    ax = tiles[2 * j]; ay = tiles[2 * j + 1];
    i = j + 1;
  }
  return out;
}

/** Caminho em linha reta (unidades voadoras). */
export function straightPath(x: number, y: number): number[] { return [x, y]; }

/**
 * Tile livre mais próximo de (x,y) (busca em anéis). O referencial f orienta a ordem dentro de cada anel (padrão: linhas do
 * norte para o sul, oeste→leste); com towardFrame(dx, dy) o anel começa pelo lado (dx, dy) — o de quem chega.
 */
export function nearestFreeTile(map: GameMap, x: number, y: number, maxR = 12, f: Frame = IDENTITY_FRAME): { x: number; y: number } | null {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (isPassable(map, cx, cy)) return { x: cx, y: cy };
  for (let r = 1; r <= maxR; r++) {
    for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) {
      if (Math.abs(a) !== r && Math.abs(b) !== r) continue;
      const q = frameOffset(f, cx, cy, a, b);
      if (isPassable(map, q.x, q.y)) return q;
    }
  }
  return null;
}
