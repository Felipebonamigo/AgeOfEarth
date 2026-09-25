// Regiões conexas do mapa (componentes 4-conexos de tiles passáveis), com cache invalidado quando o bloqueio muda.
// Servem para responder "há caminho?" sem rodar o A*: alvos em outra região (ilha, bolsão, base selada) são
// inalcançáveis; unidades em bolsões minúsculos são resgatadas; a IA evita construir em gargalos.
// Portões contam como passáveis (otimista para inimigos; o A* por time decide o caminho real).
import type { GameMap } from '../types';
import { idx, inBounds } from './grid';

interface Components { labels: Int32Array; sizes: number[] }
const cache = new WeakMap<GameMap, Components>();

export function invalidateComponents(map: GameMap): void { cache.delete(map); }

const passable = (map: GameMap, i: number): boolean => map.blocked[i] === 0 || map.gateTeam[i] >= 0;

function compute(map: GameMap): Components {
  const n = map.w * map.h;
  const labels = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < n; s++) {
    if (labels[s] !== -1 || !passable(map, s)) continue;
    const label = sizes.length;
    let size = 0;
    labels[s] = label; stack.push(s);
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      const x = c % map.w, y = (c - x) / map.w;
      if (x > 0) { const i = c - 1; if (labels[i] === -1 && passable(map, i)) { labels[i] = label; stack.push(i); } }
      if (x < map.w - 1) { const i = c + 1; if (labels[i] === -1 && passable(map, i)) { labels[i] = label; stack.push(i); } }
      if (y > 0) { const i = c - map.w; if (labels[i] === -1 && passable(map, i)) { labels[i] = label; stack.push(i); } }
      if (y < map.h - 1) { const i = c + map.w; if (labels[i] === -1 && passable(map, i)) { labels[i] = label; stack.push(i); } }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

function get(map: GameMap): Components {
  let c = cache.get(map);
  if (!c) { c = compute(map); cache.set(map, c); }
  return c;
}

/** Rótulo da região do tile (-1 se bloqueado ou fora do mapa). */
export function componentAt(map: GameMap, x: number, y: number): number {
  if (!inBounds(map, x, y)) return -1;
  return get(map).labels[idx(map, x, y)];
}
export function componentSize(map: GameMap, label: number): number { return label < 0 ? 0 : get(map).sizes[label] ?? 0; }

/**
 * Há caminho terrestre de (sx,sy) até o retângulo [tx,tx+w)x[ty,ty+h)? Com adjacent, basta alcançar algum tile
 * passável do anel ao redor do retângulo (ou dentro dele, se for passável); sem adjacent, o próprio retângulo.
 */
export function rectReachable(map: GameMap, sx: number, sy: number, tx: number, ty: number, w: number, h: number, adjacent: boolean): boolean {
  const from = componentAt(map, sx, sy);
  if (from < 0) return false;
  const { labels } = get(map);
  const x0 = adjacent ? tx - 1 : tx, y0 = adjacent ? ty - 1 : ty, x1 = adjacent ? tx + w : tx + w - 1, y1 = adjacent ? ty + h : ty + h - 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inBounds(map, x, y)) continue;
    if (labels[idx(map, x, y)] === from) return true;
  }
  return false;
}

/** Tile passável mais próximo pertencente a uma região com pelo menos minSize tiles (busca em anéis). */
export function nearestLargeComponentTile(map: GameMap, x: number, y: number, minSize: number, maxR = 6): { x: number; y: number } | null {
  const c = get(map);
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      const tx = x + dx, ty = y + dy;
      if (!inBounds(map, tx, ty)) continue;
      const l = c.labels[idx(map, tx, ty)];
      if (l >= 0 && c.sizes[l] >= minSize) return { x: tx, y: ty };
    }
  }
  return null;
}

/**
 * Colocar um edifício não passável em [tx,tx+w)x[ty,ty+h) dividiria a passagem local? Testa se os tiles passáveis
 * do anel ao redor continuam conectados entre si numa janela de raio R (BFS 4-conexo com a área marcada como bloqueada).
 */
export function wouldSeal(map: GameMap, tx: number, ty: number, w: number, h: number, R = 10): boolean {
  const inFoot = (x: number, y: number) => x >= tx && x < tx + w && y >= ty && y < ty + h;
  const ring: number[] = [];
  for (let y = ty - 1; y <= ty + h; y++) for (let x = tx - 1; x <= tx + w; x++) {
    if (inFoot(x, y) || !inBounds(map, x, y)) continue;
    if (passable(map, idx(map, x, y))) ring.push(idx(map, x, y));
  }
  if (ring.length <= 1) return false;
  const wx0 = Math.max(0, tx - R), wy0 = Math.max(0, ty - R), wx1 = Math.min(map.w - 1, tx + w - 1 + R), wy1 = Math.min(map.h - 1, ty + h - 1 + R);
  const seen = new Set<number>();
  const stack = [ring[0]]; seen.add(ring[0]);
  while (stack.length) {
    const c = stack.pop()!;
    const x = c % map.w, y = (c - x) / map.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < wx0 || nx > wx1 || ny < wy0 || ny > wy1 || inFoot(nx, ny)) continue;
      const ni = ny * map.w + nx;
      if (seen.has(ni) || !passable(map, ni)) continue;
      seen.add(ni); stack.push(ni);
    }
  }
  for (const r of ring) if (!seen.has(r)) return true;
  return false;
}

/** Pontos de articulação do grafo 4-conexo de tiles passáveis (tiles cuja remoção desconecta uma região). Tarjan iterativo. */
export function articulationPoints(map: GameMap): Uint8Array {
  const w = map.w, n = w * map.h;
  const disc = new Int32Array(n).fill(-1), low = new Int32Array(n), ap = new Uint8Array(n);
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
  let time = 0;
  const sNode: number[] = [], sDir: number[] = [], sParent: number[] = [];
  for (let root = 0; root < n; root++) {
    if (disc[root] !== -1 || !passable(map, root)) continue;
    let rootChildren = 0;
    disc[root] = low[root] = time++;
    sNode.push(root); sDir.push(0); sParent.push(-1);
    while (sNode.length) {
      const top = sNode.length - 1; const v = sNode[top]; const d = sDir[top];
      if (d < 4) {
        sDir[top] = d + 1;
        const x = v % w, y = (v - x) / w; const nx = x + DX[d], ny = y + DY[d];
        if (!inBounds(map, nx, ny)) continue;
        const u = ny * w + nx;
        if (!passable(map, u)) continue;
        if (disc[u] === -1) { disc[u] = low[u] = time++; sNode.push(u); sDir.push(0); sParent.push(v); if (v === root) rootChildren++; }
        else if (u !== sParent[top]) low[v] = Math.min(low[v], disc[u]);
      } else {
        sNode.pop(); sDir.pop(); const p = sParent.pop()!;
        if (p !== -1) { low[p] = Math.min(low[p], low[v]); if (p !== root && low[v] >= disc[p]) ap[p] = 1; }
      }
    }
    if (rootChildren > 1) ap[root] = 1;
  }
  return ap;
}
