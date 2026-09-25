// Geração procedural de mapas: lagos, montanhas, florestas, veios de ouro, frutas e caça,
// com áreas iniciais justas e garantia de conectividade entre todos os jogadores.
import { TERRAIN, type NodeType, type MapType } from '../constants';
import { RNG, makeNoise } from '../rng';
import type { GameMap, ResourceNode } from '../types';
import { idx, inBounds, dist } from './grid';
import { articulationPoints, invalidateComponents } from './components';

const NODE_AMOUNT: Record<NodeType, number> = { tree: 150, berry: 175, gold: 900, deer: 140, boar: 260, lure: 800 };

/** Parâmetros por tipo de mapa: limiares do ruído de elevação, densidade de bosques e terreno base. */
const MAP_PRESETS: Record<MapType, { water: number; sand: number; dirt: number; mountain: number; forest: number; forestDensity: number; base: number; goldRoll: number }> = {
  continental: { water: 0.34, sand: 0.37, dirt: 0.66, mountain: 0.73, forest: 0.58, forestDensity: 0.85, base: TERRAIN.GRASS, goldRoll: 0.3 },
  mountains: { water: 0.30, sand: 0.33, dirt: 0.56, mountain: 0.62, forest: 0.60, forestDensity: 0.85, base: TERRAIN.GRASS, goldRoll: 0.35 },
  forest: { water: 0.33, sand: 0.36, dirt: 0.70, mountain: 0.78, forest: 0.50, forestDensity: 0.9, base: TERRAIN.GRASS, goldRoll: 0.3 },
  desert: { water: 0.31, sand: 0.34, dirt: 0.62, mountain: 0.70, forest: 0.66, forestDensity: 0.6, base: TERRAIN.SAND, goldRoll: 0.45 },
  lakes: { water: 0.42, sand: 0.45, dirt: 0.70, mountain: 0.78, forest: 0.58, forestDensity: 0.85, base: TERRAIN.GRASS, goldRoll: 0.3 },
};

export function generateMap(w: number, h: number, seed: number, playerCount: number, mapType: MapType = 'continental', clearCenter = false): GameMap {
  const P = MAP_PRESETS[mapType] ?? MAP_PRESETS.continental;
  const rng = new RNG(seed ^ 0x5bd1e995);
  const elev = makeNoise(seed);
  const forest = makeNoise(seed + 101);
  const decorN = makeNoise(seed + 202);
  const terrain = new Uint8Array(w * h);
  const decor = new Uint8Array(w * h);
  const map: GameMap = { w, h, terrain, blocked: new Uint8Array(w * h), nodeAt: new Int32Array(w * h).fill(-1), buildingAt: new Int32Array(w * h).fill(-1), gateTeam: new Int8Array(w * h).fill(-1), nodes: new Map(), starts: [], decor };

  // 1) Terreno base a partir de ruído de elevação
  const scale = 0.055;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = elev.fbm(x * scale, y * scale, 5, 2.1, 0.5);
    const i = idx(map, x, y);
    let t: number = P.base;
    if (e < P.water) t = TERRAIN.WATER;
    else if (e < P.sand) t = TERRAIN.SAND;
    else if (e > P.mountain) t = TERRAIN.MOUNTAIN;
    else if (e > P.dirt) t = TERRAIN.DIRT;
    terrain[i] = t;
    decor[i] = Math.floor(decorN.noise(x * 0.9, y * 0.9) * 255);
  }
  // Água profunda: água cercada de água
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = idx(map, x, y);
    if (terrain[i] !== TERRAIN.WATER) continue;
    let deep = true;
    for (let dy = -1; dy <= 1 && deep; dy++) for (let dx = -1; dx <= 1; dx++) if (terrain[idx(map, x + dx, y + dy)] !== TERRAIN.WATER && terrain[idx(map, x + dx, y + dy)] !== TERRAIN.DEEP) { deep = false; break; }
    if (deep) terrain[i] = TERRAIN.DEEP;
  }

  // 2) Posições iniciais em círculo ao redor do centro, com rotação aleatória
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36;
  const rot = rng.float();
  // Sem trigonometria na simulação: usamos pontos pré-calculados de um círculo unitário (32 direções)
  const CIRCLE = unitCircle(32);
  for (let p = 0; p < playerCount; p++) {
    const k = Math.floor(((p / playerCount) + rot) * 32) % 32;
    const sx = Math.round(cx + CIRCLE[k][0] * R), sy = Math.round(cy + CIRCLE[k][1] * R);
    map.starts.push({ x: clampi(sx, 8, w - 9), y: clampi(sy, 8, h - 9) });
  }
  // Limpa área inicial (raio 8) para grama
  for (const s of map.starts) {
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) {
      const x = s.x + dx, y = s.y + dy;
      if (!inBounds(map, x, y) || dx * dx + dy * dy > 81) continue;
      terrain[idx(map, x, y)] = TERRAIN.GRASS;
    }
  }

  // 3) Florestas (ruído) fora das áreas iniciais
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = idx(map, x, y);
    if (terrain[i] !== TERRAIN.GRASS && terrain[i] !== TERRAIN.DIRT && !(P.base === TERRAIN.SAND && terrain[i] === TERRAIN.SAND)) continue;
    if (nearStart(map, x, y, 6.5)) continue;
    const f = forest.fbm(x * 0.09, y * 0.09, 3);
    if (f > P.forest && rng.float() < P.forestDensity) addNode(map, 'tree', x, y);
  }

  // 4) Recursos garantidos perto de cada início
  for (const s of map.starts) {
    // bosque garantido a ~8-10 tiles
    const ang = rng.int(0, 31);
    placeCluster(map, rng, 'tree', s.x + Math.round(CIRCLE[ang][0] * 9), s.y + Math.round(CIRCLE[ang][1] * 9), 4.2, 28);
    // frutas: 2 grupos
    for (let k = 0; k < 2; k++) {
      const a = (ang + 8 + k * 12 + rng.int(-2, 2)) % 32;
      placeCluster(map, rng, 'berry', s.x + Math.round(CIRCLE[a][0] * 5.5), s.y + Math.round(CIRCLE[a][1] * 5.5), 1.4, 6);
    }
    // ouro: 1 veio perto, 1 médio
    const ga = (ang + 20 + rng.int(-3, 3)) % 32;
    placeCluster(map, rng, 'gold', s.x + Math.round(CIRCLE[ga][0] * 7), s.y + Math.round(CIRCLE[ga][1] * 7), 1.2, 4);
    const gb = (ang + 4 + rng.int(-2, 2)) % 32;
    placeCluster(map, rng, 'gold', s.x + Math.round(CIRCLE[gb][0] * 13), s.y + Math.round(CIRCLE[gb][1] * 13), 1.4, 5);
    // caça
    const da = (ang + 26 + rng.int(-3, 3)) % 32;
    placeCluster(map, rng, 'deer', s.x + Math.round(CIRCLE[da][0] * 9), s.y + Math.round(CIRCLE[da][1] * 9), 1.6, 4);
  }

  // 5) Recursos espalhados pelo mapa
  const extra = Math.round((w * h) / 900);
  for (let k = 0; k < extra; k++) {
    const x = rng.int(4, w - 5), y = rng.int(4, h - 5);
    if (nearStart(map, x, y, 16)) continue;
    const roll = rng.float();
    if (roll < P.goldRoll) placeCluster(map, rng, 'gold', x, y, 1.4, 5);
    else if (roll < 0.6) placeCluster(map, rng, 'berry', x, y, 1.5, 6);
    else if (roll < 0.85) placeCluster(map, rng, 'deer', x, y, 1.8, 5);
    else placeCluster(map, rng, 'boar', x, y, 1.2, 2);
  }

  // 6) Bloqueio e conectividade
  rebuildBlocked(map);
  if (clearCenter) {
    // Rei da Colina: clareira no centro do mapa, ligada por terra a todos os inícios
    const cx0 = Math.floor(w / 2), cy0 = Math.floor(h / 2);
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const x = cx0 + dx, y = cy0 + dy;
      if (!inBounds(map, x, y) || dx * dx + dy * dy > 26) continue;
      const i = idx(map, x, y);
      terrain[i] = TERRAIN.GRASS;
      if (map.nodeAt[i] !== -1) removeNode(map, map.nodeAt[i]);
    }
    rebuildBlocked(map);
    map.starts.push({ x: cx0, y: cy0 });
    ensureConnectivity(map);
    map.starts.pop();
  }
  ensureConnectivity(map);
  rebuildBlocked(map);
  widenChokepoints(map);
  return map;
}

function clampi(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }

function unitCircle(n: number): [number, number][] {
  // Pontos do círculo unitário gerados sem trigonometria (rotação por multiplicação complexa, valores fixos)
  const out: [number, number][] = [];
  const c = 0.9807852804032304, s = 0.19509032201612825; // cos/sin de 2π/32, constantes fixas
  let x = 1, y = 0;
  for (let i = 0; i < n; i++) { out.push([x, y]); const nx = x * c - y * s; y = x * s + y * c; x = nx; }
  return out;
}

function nearStart(map: GameMap, x: number, y: number, r: number): boolean {
  for (const s of map.starts) if (dist(s.x, s.y, x, y) < r) return true;
  return false;
}

export function addNode(map: GameMap, type: NodeType, x: number, y: number, amount?: number): ResourceNode | null {
  if (!inBounds(map, x, y)) return null;
  const i = idx(map, x, y);
  if (map.nodeAt[i] !== -1) return null;
  const t = map.terrain[i];
  if (t === TERRAIN.WATER || t === TERRAIN.DEEP || t === TERRAIN.MOUNTAIN) return null;
  const id = nextNodeId(map);
  const amt = amount ?? NODE_AMOUNT[type];
  const node: ResourceNode = { id, type, x, y, amount: amt, max: amt };
  map.nodes.set(id, node);
  map.nodeAt[i] = id;
  map.blocked[i] = 1;
  invalidateComponents(map);
  return node;
}

/** Ids de nós de recurso vivem num intervalo disjunto dos ids de unidades/edifícios (state.nextId), para nunca colidirem. */
export const NODE_ID_BASE = 1 << 20;
let nodeSeq = NODE_ID_BASE;
function nextNodeId(map: GameMap): number {
  // ids de nós são crescentes; garante unicidade mesmo após remoções
  let id = nodeSeq++;
  while (map.nodes.has(id)) id = nodeSeq++;
  return id;
}
export function resetNodeSeq(v = NODE_ID_BASE) { nodeSeq = v; }

export function removeNode(map: GameMap, id: number): void {
  const n = map.nodes.get(id);
  if (!n) return;
  map.nodes.delete(id);
  const i = idx(map, n.x, n.y);
  map.nodeAt[i] = -1;
  map.blocked[i] = 0;
  invalidateComponents(map);
}

function placeCluster(map: GameMap, rng: RNG, type: NodeType, cx: number, cy: number, radius: number, count: number) {
  let placed = 0, tries = 0;
  while (placed < count && tries++ < count * 12) {
    const dx = Math.round(rng.range(-radius, radius)), dy = Math.round(rng.range(-radius, radius));
    if (dx * dx + dy * dy > radius * radius + 1) continue;
    const x = cx + dx, y = cy + dy;
    if (!inBounds(map, x, y)) continue;
    if (nearStart(map, x, y, 3.2)) continue;
    if (addNode(map, type, x, y)) placed++;
  }
}

export function rebuildBlocked(map: GameMap): void {
  const { w, h, terrain, blocked } = map;
  for (let i = 0; i < w * h; i++) {
    const t = terrain[i];
    blocked[i] = (t === TERRAIN.WATER || t === TERRAIN.DEEP || t === TERRAIN.MOUNTAIN || map.nodeAt[i] !== -1) ? 1 : 0;
  }
  invalidateComponents(map);
}

/** Alarga gargalos de 1 tile: remove árvores/veios ao redor de cada ponto de articulação (unidades não travam e a IA não sela a base). */
function widenChokepoints(map: GameMap): void {
  // até 3 passes: abrir um gargalo pode expor o próximo (custa ~10% das árvores, só nas bordas dos bosques)
  for (let pass = 0; pass < 3; pass++) {
    const ap = articulationPoints(map);
    let removed = 0;
    for (let i = 0; i < ap.length; i++) {
      if (!ap[i]) continue;
      const x = i % map.w, y = (i - x) / map.w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (!inBounds(map, xx, yy)) continue;
        const id = map.nodeAt[idx(map, xx, yy)];
        if (id !== -1) { removeNode(map, id); removed++; }
      }
    }
    if (removed === 0) break;
  }
}

/** Garante que todos os inícios estão conectados por terra; abre corredores quando necessário. */
function ensureConnectivity(map: GameMap): void {
  if (map.starts.length < 2) return;
  for (let guard = 0; guard < 8; guard++) {
    const reach = floodFrom(map, map.starts[0].x, map.starts[0].y);
    let fixed = false;
    for (let p = 1; p < map.starts.length; p++) {
      const s = map.starts[p];
      if (reach[idx(map, s.x, s.y)]) continue;
      // acha o tile alcançável mais próximo e abre um corredor reto até ele
      let bx = map.starts[0].x, by = map.starts[0].y, bd = Infinity;
      for (let y = 0; y < map.h; y += 2) for (let x = 0; x < map.w; x += 2) {
        if (!reach[idx(map, x, y)]) continue;
        const d = dist(x, y, s.x, s.y);
        if (d < bd) { bd = d; bx = x; by = y; }
      }
      carveCorridor(map, s.x, s.y, bx, by);
      fixed = true;
    }
    if (!fixed) return;
    rebuildBlocked(map);
  }
}

function floodFrom(map: GameMap, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(map.w * map.h);
  const stack = [idx(map, sx, sy)];
  seen[stack[0]] = 1;
  while (stack.length) {
    const c = stack.pop()!;
    const x = c % map.w, y = (c - x) / map.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const ni = ny * map.w + nx;
      if (seen[ni] || map.blocked[ni]) continue;
      seen[ni] = 1; stack.push(ni);
    }
  }
  return seen;
}

function carveCorridor(map: GameMap, x0: number, y0: number, x1: number, y1: number) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (!inBounds(map, xx, yy)) continue;
      const i = idx(map, xx, yy);
      const tt = map.terrain[i];
      if (tt === TERRAIN.WATER || tt === TERRAIN.DEEP) map.terrain[i] = TERRAIN.SAND;
      else if (tt === TERRAIN.MOUNTAIN) map.terrain[i] = TERRAIN.DIRT;
      if (map.nodeAt[i] !== -1) removeNode(map, map.nodeAt[i]);
    }
  }
}
