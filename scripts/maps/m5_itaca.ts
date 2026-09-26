// Mapa fixo da missão m5 "O Hóspede de Ítaca" (docs/STORY.md §5.2): "Planície da Argólida", 128×112, norte no alto.
// Reprodutível: terreno por primitivas (elipses, trilhas e o curso do rio) com bordas de ruído de semente fixa
// (makeNoise/RNG do núcleo, nada de aleatoriedade nativa), aplicado com as MESMAS operações puras do editor
// (src/editor/ops.ts: paint, addNode, placeEntity com tag, setStart) numa partida em branco, e salvo por saveMap (forma
// canônica). O arquivo sai embutido em map.data de src/core/scenario/missions/m5_itaca.scenario.json.
//
// Uso:
//   npx tsx scripts/maps/m5_itaca.ts            confere: o mapa embutido no cenário é idêntico ao gerado (sai 1 se não)
//   npx tsx scripts/maps/m5_itaca.ts --write    grava o mapa gerado em map.data do cenário
//   npx tsx scripts/maps/m5_itaca.ts --out f.map.json   grava também o .map.json avulso (npm run map:check f.map.json)
//
// Relevo e pontos (coordenadas em tiles, como na ficha):
//   noroeste  Argos na colina (início 0 = [22,22]), sob o rochedo da Lárissa e a Áspis: CC, Templo, Quartel, Estábulo,
//             Academia e 4 Casas; 12 cidadãos, 6 hoplitas, 4 toxotas e 2 hipeus. Sem kit (a cidade é do mapa);
//   centro    o rio Ínaco desce das montanhas do norte até o golfo (x ≈ 64) e só se cruza a pé nos 2 vaus: norte [64,36] e
//             sul [64,78]; a Via Sagrada (terra batida) liga a praia ao vau sul, ao Heraion e a Argos;
//   Heraion   Templo do jogador 0 (tag heraion) em [50,60], num outeiro à beira da Via Sagrada;
//   sudeste   a praia de Náuplia (areia) com os restos do naufrágio (rochas na linha d'água) em [110,98], onde surgem Odisseu e
//             os náufragos; o golfo da Argólida ocupa o sul;
//   nordeste  Corinto (início 1 = [108,16], com kit) atrás do istmo: montanhas a oeste, o golfo ao norte, o mar a leste e
//             um só gargalo de terra ao sul (~10 tiles) que desce para a planície leste;
//   planície  as torres de sinal da Liga (Torres do jogador 2) sinal1 [84,50] e sinal2 [96,74], em outeiros pedregosos;
//   leste     o acampamento dos Cavaleiros de Poseidon (início 2 = [119,56], sem kit; a ficha pedia [120,56], mas a margem
//             mínima de um início é 8 tiles da borda: 127 - 8 = 119), numa clareira dos montes do leste;
//   sudoeste  o pântano de Lerna, uma lagoa junto à costa.
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { TERRAIN, type NodeType } from '../../src/core/constants';
import { RNG, makeNoise } from '../../src/core/rng';
import { blankMap, mapHash, saveMap, validateMap, type FixedMapData, type MapEntity, type MapIssue } from '../../src/core/map/fixed';
import { createGame } from '../../src/core/sim/game';
import { componentAt } from '../../src/core/map/components';
import { nearestFreeTile } from '../../src/core/map/pathfinding';
import { applyEditOp, type TagMap } from '../../src/editor/ops';

export const W = 128, H = 112;
const SEED = 5505;   // ruído das bordas e sorteio dos recursos

/** Pontos nomeados da ficha (tiles). */
export const POINTS = {
  argos: [22, 22], corinth: [108, 16], riders: [119, 56],
  fordN: [64, 36], fordS: [64, 78], heraion: [50, 60],
  beach: [110, 98], castaways: [106, 100], wreck: [113, 102],
  sinal1: [84, 50], sinal2: [96, 74], lerna: [28, 92],
} as const;
const STARTS: [number, number][] = [[22, 22], [108, 16], [119, 56]];

type Pt = [number, number];
interface Area { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; jitter: number }
interface Trail { kind: 'trail'; pts: Pt[]; width: number; jitter: number }

// ---------------------------------------------------------------------------------------------------------------
// Relevo: a planície é grama; montanhas cercam a Argólida, o rio a corta de norte a sul e o golfo a fecha ao sul.
// ---------------------------------------------------------------------------------------------------------------

/** Maciços (montanha). */
const MOUNTAINS: (Area | Trail)[] = [
  // Lárissa (rochedo da acrópole, atrás de Argos) e a Áspis; o esporão sudoeste fecha a colina pelo oeste
  { kind: 'ellipse', cx: 8, cy: 9, rx: 7, ry: 6, jitter: 0.3 },
  { kind: 'ellipse', cx: 33, cy: 5, rx: 6, ry: 3.5, jitter: 0.3 },
  { kind: 'trail', pts: [[3, 40], [10, 43], [16, 42]], width: 4, jitter: 1.5 },
  // montes ao norte da planície (nascente do Ínaco) e a serra que separa Corinto da planície
  { kind: 'trail', pts: [[40, 3], [56, 6], [70, 5]], width: 6, jitter: 2 },
  { kind: 'trail', pts: [[70, 4], [80, 9], [88, 16], [92, 24], [96, 29]], width: 9, jitter: 2 },
  // montes do leste (Aracneu), com a clareira dos Cavaleiros aberta depois
  { kind: 'trail', pts: [[122, 40], [118, 48], [121, 64], [117, 76], [121, 88]], width: 9, jitter: 2 },
  // outeiros pedregosos das torres de sinal (atrás delas, do lado de quem vem de Argos)
  { kind: 'ellipse', cx: 87, cy: 47, rx: 1.6, ry: 1.2, jitter: 0 },
  { kind: 'ellipse', cx: 99, cy: 72, rx: 1.6, ry: 1.2, jitter: 0 },
  // colinas do sul da planície (entre Lerna e o rio)
  { kind: 'ellipse', cx: 44, cy: 86, rx: 5, ry: 3, jitter: 0.35 },
];

/** Água (lagos e baías), antes do mar. */
const WATERS: Area[] = [
  // golfo de Corinto (a oeste do istmo) e o golfo Sarônico (a leste): o istmo é a terra entre os dois
  { kind: 'ellipse', cx: 92, cy: 34, rx: 11, ry: 5, jitter: 0.25 },
  { kind: 'ellipse', cx: 126, cy: 34, rx: 13, ry: 8, jitter: 0.25 },
  // pântano de Lerna
  { kind: 'ellipse', cx: 28, cy: 92, rx: 4.5, ry: 2.5, jitter: 0.2 },
];

/** Terra batida: a colina de Argos, o Heraion, Corinto, o acampamento e a Via Sagrada (praia → vau sul → Heraion → Argos). */
const DIRT: (Area | Trail)[] = [
  { kind: 'ellipse', cx: 22, cy: 22, rx: 11, ry: 10, jitter: 0.2 },
  { kind: 'ellipse', cx: 51, cy: 61, rx: 5, ry: 4, jitter: 0.15 },
  { kind: 'ellipse', cx: 108, cy: 16, rx: 8, ry: 7, jitter: 0.2 },
  { kind: 'ellipse', cx: 119, cy: 56, rx: 4, ry: 4, jitter: 0.1 },
  { kind: 'trail', pts: [[108, 97], [96, 93], [82, 86], [70, 80], [64, 78], [58, 70], [52, 64], [46, 54], [38, 42], [30, 32], [25, 26]], width: 3, jitter: 0.6 },
];

/** Clareiras forçadas (grama/terra): a clareira dos Cavaleiros nos montes do leste e o istmo. */
const CLEAR: Area[] = [
  { kind: 'ellipse', cx: 119, cy: 56, rx: 6, ry: 5, jitter: 0.15 },
  { kind: 'ellipse', cx: 107, cy: 58, rx: 12, ry: 3.5, jitter: 0.1 },   // passagem da clareira para a planície
];

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - a[0]) * vx + (py - a[1]) * vy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (a[0] + vx * t), dy = py - (a[1] + vy * t);
  return Math.sqrt(dx * dx + dy * dy);
}
function trailDist(t: Trail, x: number, y: number): number {
  let d = Infinity;
  for (let i = 0; i + 1 < t.pts.length; i++) d = Math.min(d, segDist(x, y, t.pts[i], t.pts[i + 1]));
  return d;
}
function inArea(a: Area | Trail, x: number, y: number, n: number): boolean {
  if (a.kind === 'ellipse') {
    const dx = (x - a.cx) / a.rx, dy = (y - a.cy) / a.ry;
    return dx * dx + dy * dy <= 1 + (n - 0.5) * a.jitter * 2;
  }
  return trailDist(a, x, y) <= a.width / 2 + (n - 0.5) * a.jitter;
}

/** Centro do rio Ínaco na linha y (meandro por ruído, reto nos vaus). */
const riverNoise = makeNoise(SEED + 7);
export function riverX(y: number): number {
  const n = riverNoise.fbm(y * 0.06, 1.7, 2);
  const nearFord = Math.min(Math.abs(y - POINTS.fordN[1]), Math.abs(y - POINTS.fordS[1]));
  const k = nearFord >= 8 ? 1 : nearFord / 8;   // endireita perto dos vaus
  return Math.round(64 + (n - 0.5) * 7 * k);
}
/** Linha da costa (primeira linha de água) na coluna x. */
function coastY(x: number, coast: ReturnType<typeof makeNoise>): number {
  return 103 + Math.round((coast.noise(x * 0.09, 5.1) - 0.5) * 3) - (x > 120 ? Math.round((x - 120) * 0.8) : 0);
}

/** Terreno por tile (TERRAIN.*), antes da água profunda (derivada pelo pincel do editor). */
function buildTerrain(): Uint8Array {
  const edge = makeNoise(SEED), coast = makeNoise(SEED + 31), frame = makeNoise(SEED + 43);
  const t = new Uint8Array(W * H).fill(TERRAIN.GRASS);
  const fordRows = (y: number) => Math.abs(y - POINTS.fordN[1]) <= 2 || Math.abs(y - POINTS.fordS[1]) <= 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const n = edge.fbm(x * 0.2, y * 0.2, 3);
    // moldura: montanhas a oeste e ao norte (a costa e o leste são tratados abaixo)
    const f = frame.fbm(x * 0.1, y * 0.1, 2);
    const west = x < 3 + Math.round(f * 3), north = y < 3 + Math.round(f * 3), east = x > W - 4 - Math.round(f * 2);
    let tt: number = TERRAIN.GRASS;
    if (west || north || east || MOUNTAINS.some((a) => inArea(a, x, y, n))) tt = TERRAIN.MOUNTAIN;
    if (tt !== TERRAIN.MOUNTAIN && DIRT.some((a) => inArea(a, x, y, n))) tt = TERRAIN.DIRT;
    if (!east && CLEAR.some((a) => inArea(a, x, y, n))) tt = TERRAIN.DIRT;   // clareiras abertas nos montes
    if (WATERS.some((a) => inArea(a, x, y, n))) tt = TERRAIN.WATER;
    // rio Ínaco: nasce nos montes do norte (y ≥ 7) e desce até o golfo; 3 tiles de largura (5 no baixo curso); vaus de areia
    if (y >= 7) {
      const rx = riverX(y), half = y >= 60 ? 2 : 1;
      if (Math.abs(x - rx) <= half) tt = fordRows(y) ? TERRAIN.SAND : TERRAIN.WATER;
      else if (fordRows(y) && Math.abs(x - rx) <= half + 2 && tt !== TERRAIN.MOUNTAIN) tt = TERRAIN.SAND;   // margens do vau
    }
    t[i] = tt;
  }
  // golfo da Argólida ao sul; a praia de Náuplia (areia) acompanha a costa a leste do rio
  for (let x = 0; x < W; x++) {
    const cy = coastY(x, coast);
    for (let y = cy; y < H; y++) t[y * W + x] = TERRAIN.WATER;
    const sand = x >= 70 ? 6 : 2;
    for (let y = cy - sand; y < cy; y++) if (y >= 0 && t[y * W + x] !== TERRAIN.WATER) t[y * W + x] = TERRAIN.SAND;
  }
  // restos do naufrágio: o casco (rochas) na linha d'água da praia
  for (const [x, y] of [[112, 102], [113, 102], [114, 101], [115, 101]] as Pt[]) t[y * W + x] = TERRAIN.MOUNTAIN;
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// Recursos
// ---------------------------------------------------------------------------------------------------------------
type Cluster = { type: NodeType; x: number; y: number; n: number; r: number; amount?: number };
const CLUSTERS: Cluster[] = [
  // Argos: frutas, caça e uma mina de ouro só (o ouro é pouco de propósito: o Mercado vale a pena)
  { type: 'berry', x: 13, y: 31, n: 6, r: 1.6 }, { type: 'gold', x: 31, y: 11, n: 3, r: 1.2 },
  { type: 'deer', x: 9, y: 26, n: 4, r: 1.8 }, { type: 'boar', x: 34, y: 33, n: 2, r: 1.2 },
  { type: 'tree', x: 16, y: 7, n: 10, r: 2.5 }, { type: 'tree', x: 6, y: 30, n: 10, r: 2.5 },
  // planície oeste (entre Argos e o rio)
  { type: 'gold', x: 35, y: 48, n: 4, r: 1.4 }, { type: 'berry', x: 36, y: 64, n: 5, r: 1.6 },
  { type: 'deer', x: 47, y: 38, n: 4, r: 2 }, { type: 'boar', x: 24, y: 72, n: 2, r: 1.2 },
  { type: 'tree', x: 44, y: 27, n: 12, r: 3 }, { type: 'tree', x: 27, y: 55, n: 14, r: 3.2 }, { type: 'tree', x: 56, y: 52, n: 8, r: 2.2 },
  { type: 'tree', x: 18, y: 82, n: 12, r: 3 }, { type: 'gold', x: 52, y: 92, n: 3, r: 1.2 },
  // norte da planície, perto do vau norte
  { type: 'tree', x: 54, y: 20, n: 10, r: 2.6 }, { type: 'tree', x: 74, y: 20, n: 8, r: 2.4 },
  // planície leste
  { type: 'gold', x: 80, y: 64, n: 4, r: 1.4 }, { type: 'deer', x: 92, y: 58, n: 4, r: 2 },
  { type: 'tree', x: 74, y: 56, n: 10, r: 2.8 }, { type: 'tree', x: 106, y: 66, n: 10, r: 2.8 }, { type: 'tree', x: 88, y: 84, n: 8, r: 2.4 },
  { type: 'tree', x: 104, y: 44, n: 8, r: 2.4 },
  // praia de Náuplia: frutas (sem ponto de entrega por perto) e pinheiros costeiros
  { type: 'berry', x: 100, y: 94, n: 4, r: 1.4 }, { type: 'tree', x: 120, y: 92, n: 6, r: 2 },
  // Corinto
  { type: 'berry', x: 116, y: 22, n: 6, r: 1.6 }, { type: 'gold', x: 98, y: 11, n: 4, r: 1.4 }, { type: 'gold', x: 118, y: 9, n: 3, r: 1.2 },
  { type: 'deer', x: 99, y: 22, n: 4, r: 1.8 }, { type: 'boar', x: 112, y: 27, n: 2, r: 1.2 },
  { type: 'tree', x: 100, y: 5, n: 10, r: 2.6 }, { type: 'tree', x: 120, y: 15, n: 10, r: 2.6 },
];

// Zonas sem recursos (espaço de construção e passagem livre): Argos, inícios, Heraion, torres, vaus, praia do desembarque.
const KEEP_OUT: { x: number; y: number; r: number }[] = [
  { x: 22, y: 22, r: 9 }, { x: 108, y: 16, r: 6 }, { x: 119, y: 56, r: 4 }, { x: 51, y: 61, r: 4 },
  { x: 84, y: 50, r: 3 }, { x: 96, y: 74, r: 3 }, { x: 64, y: 36, r: 6 }, { x: 64, y: 78, r: 6 }, { x: 108, y: 99, r: 5 },
];

// ---------------------------------------------------------------------------------------------------------------
// Entidades (dono = índice do início; uma tag por entidade, como pede a §5.0)
// ---------------------------------------------------------------------------------------------------------------
function entities(): MapEntity[] {
  const u = (type: string, owner: number, x: number, y: number, tag?: string): MapEntity => (tag ? { kind: 'unit', type, owner, x, y, tag } : { kind: 'unit', type, owner, x, y });
  const b = (type: string, owner: number, x: number, y: number, tag?: string): MapEntity => (tag ? { kind: 'building', type, owner, x, y, tag } : { kind: 'building', type, owner, x, y });
  const out: MapEntity[] = [
    // Argos (jogador 0): CC centrado no início [22,22], Templo, Quartel, Estábulo, Academia e 4 Casas
    b('town_center', 0, 21, 21), b('temple', 0, 27, 16), b('barracks', 0, 27, 25), b('stable', 0, 21, 28), b('academy', 0, 14, 21),
    b('house', 0, 15, 16), b('house', 0, 18, 16), b('house', 0, 15, 26), b('house', 0, 18, 27),
    // o Heraion, templo de Hera à beira da Via Sagrada
    b('temple', 0, 50, 60, 'heraion'),
    // as torres de sinal da Liga (jogador 2)
    b('tower', 2, 84, 50, 'sinal1'), b('tower', 2, 96, 74, 'sinal2'),
  ];
  // 12 cidadãos em volta do CC; 6 hoplitas, 4 toxotas e 2 hipeus a leste, no caminho da planície
  for (let k = 0; k < 6; k++) out.push(u('villager', 0, 19 + k, 19), u('villager', 0, 19 + k, 25));
  for (let k = 0; k < 6; k++) out.push(u('hoplite', 0, 32 + (k % 3), 20 + Math.floor(k / 3)));
  for (let k = 0; k < 4; k++) out.push(u('toxotes', 0, 32 + (k % 2), 23 + Math.floor(k / 2)));
  out.push(u('hippeus', 0, 35, 21), u('hippeus', 0, 35, 23));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Montagem pelo pipeline do editor
// ---------------------------------------------------------------------------------------------------------------

/** Gera o mapa canônico (saveMap). Determinístico: mesma saída a cada chamada. */
export function buildArgolisMap(): FixedMapData {
  const blank = blankMap(W, H, STARTS.length, SEED);
  const state = createGame({ seed: 1, mapSize: 'medium', map: { ...blank, starts: STARTS.map(([x, y]) => [x, y]), startKit: false, relics: false }, players: [
    { name: 'Argos', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 },
    { name: 'Liga do Istmo', god: 'poseidon', isAI: false, difficulty: 'normal', team: 1 },
    { name: 'Cavaleiros de Poseidon', god: 'poseidon', isAI: false, difficulty: 'normal', team: 1 },
  ], mode: 'conquest' });
  const tags: TagMap = new Map();
  const map = state.map;
  // 1) terreno: um traço de pincel por tipo (a água profunda é derivada pelo próprio paint)
  const terrain = buildTerrain();
  for (const kind of [TERRAIN.MOUNTAIN, TERRAIN.DIRT, TERRAIN.SAND, TERRAIN.WATER]) {
    const tiles: number[] = [];
    for (let i = 0; i < terrain.length; i++) if (terrain[i] === kind) tiles.push(i);
    if (tiles.length) applyEditOp(state, { kind: 'paint', tiles, terrain: kind });
  }
  // 2) terra firme fora da região principal (a de Argos) vira montanha: sem bolsões soltos de ruído
  const [ax, ay] = [STARTS[0][0] + 3, STARTS[0][1]];   // tile livre a leste do CC de Argos (referência da região principal)
  const main = componentAt(map, ax, ay);
  const orphan: number[] = [];
  for (let i = 0; i < W * H; i++) {
    const t = map.terrain[i];
    if (t === TERRAIN.MOUNTAIN || t === TERRAIN.WATER || t === TERRAIN.DEEP) continue;
    if (componentAt(map, i % W, (i - (i % W)) / W) !== main) orphan.push(i);
  }
  if (orphan.length) applyEditOp(state, { kind: 'paint', tiles: orphan, terrain: TERRAIN.MOUNTAIN });
  // 3) entidades (antes dos recursos, para que os bosques não as cubram)
  const ents = entities();
  for (const e of ents) {
    // unidade: tile livre mais próximo (mesma regra do editor ao abrir um arquivo); edifício: canto exato ou erro
    const at = e.kind === 'unit' ? nearestFreeTile(map, e.x, e.y, 6) : { x: e.x, y: e.y };
    if (!at) throw new Error(`sem espaço para ${e.type} em (${e.x}, ${e.y})`);
    applyEditOp(state, { kind: 'placeEntity', entity: { ...e, x: at.x, y: at.y } }, tags);
  }
  // 4) recursos em grupos sorteados por RNG de semente fixa, só em terra livre, fora das zonas reservadas e da Via Sagrada,
  //    sem criar bolsões (um nó que isole algum tile vizinho da região principal é desfeito na hora)
  const rng = new RNG(SEED);
  const road = DIRT[DIRT.length - 1] as Trail;
  const reserved = (x: number, y: number) => KEEP_OUT.some((k) => (x - k.x) * (x - k.x) + (y - k.y) * (y - k.y) <= k.r * k.r)
    || trailDist(road, x, y) <= 2.5
    || ents.some((e) => e.kind === 'unit' && Math.abs(e.x - x) <= 1 && Math.abs(e.y - y) <= 1);
  const free = (x: number, y: number) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1 && map.blocked[y * W + x] === 0;
  const isolates = (x: number, y: number): boolean => {
    const m = componentAt(map, ax, ay);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && free(nx, ny) && componentAt(map, nx, ny) !== m) return true;
    }
    return false;
  };
  const tryNode = (type: NodeType, x: number, y: number, amount?: number): boolean => {
    if (!free(x, y) || reserved(x, y) || map.nodeAt[y * W + x] !== -1) return false;
    if (map.terrain[y * W + x] === TERRAIN.SAND && type === 'tree' && y < 90) return false;   // nada de árvore no vau
    applyEditOp(state, { kind: 'addNode', type, x, y, ...(amount ? { amount } : {}) });
    if (isolates(x, y)) { applyEditOp(state, { kind: 'removeNode', x, y }); return false; }
    return true;
  };
  for (const c of CLUSTERS) {
    let placed = 0;
    for (let tries = 0; tries < c.n * 30 && placed < c.n; tries++) {
      const x = Math.round(c.x + (rng.float() * 2 - 1) * c.r), y = Math.round(c.y + (rng.float() * 2 - 1) * c.r);
      if (tryNode(c.type, x, y, c.amount)) placed++;
    }
  }
  // bosques ao pé das montanhas (ruído), longe da Via Sagrada, dos vaus e das margens do rio (passagens sempre livres)
  const forest = makeNoise(SEED + 101);
  const nearMountain = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && map.terrain[ny * W + nx] === TERRAIN.MOUNTAIN) return true;
    }
    return false;
  };
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    if (map.terrain[y * W + x] !== TERRAIN.GRASS || !nearMountain(x, y, 3) || forest.fbm(x * 0.18, y * 0.18, 3) < 0.5) continue;
    if (Math.abs(x - riverX(y)) <= 4) continue;
    let byOther = false;   // árvore colada em ouro/frutas/caça pode cercá-los (nó sem acesso)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const id = map.nodeAt[(y + dy) * W + x + dx]; if (id !== -1 && map.nodes.get(id)?.type !== 'tree') byOther = true; }
    if (!byOther) tryNode('tree', x, y);
  }
  // 5) inícios (a partida em branco já tem os três; setStart grava as posições exatas)
  STARTS.forEach(([x, y], index) => applyEditOp(state, { kind: 'setStart', index, x, y }));
  return saveMap(state, {
    id: 'm5_itaca', name: 'Planície da Argólida', nameEn: 'Plain of Argolis', author: 'Age of Earth',
    description: 'Missão 5 (O Hóspede de Ítaca): Argos na colina a noroeste, o rio Ínaco com dois vaus no centro, o Heraion à beira da Via Sagrada, a praia de Náuplia a sudeste, Corinto atrás do istmo a nordeste e as torres de sinal da Liga na planície leste.',
    startKit: false, relics: false,
  }, (id) => tags.get(id));
}

/** Validação do mapa como a missão o usa (3 jogadores). */
export function argolisIssues(data: FixedMapData): MapIssue[] { return validateMap(data, { players: 3 }); }

// ---------------------------------------------------------------------------------------------------------------
// Linha de comando
// ---------------------------------------------------------------------------------------------------------------
const SCENARIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/core/scenario/missions/m5_itaca.scenario.json');

function main(): void {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const data = buildArgolisMap();
  const issues = argolisIssues(data);
  const errors = issues.filter((i) => i.level === 'error');
  const json = JSON.stringify(data);
  console.log(`Planície da Argólida ${data.w}x${data.h} · ${data.starts.length} inícios · ${data.nodes.length} nós · ${data.entities?.length ?? 0} entidades · ${json.length} bytes · hash #${mapHash(data).toString(16)} · ${errors.length} erro(s), ${issues.length - errors.length} aviso(s)`);
  for (const i of issues) console.log(`  ${i.level === 'error' ? 'ERRO ' : 'aviso'} ${i.code}${i.x !== undefined ? ` (${i.x}, ${i.y})` : ''}${i.params ? ' ' + JSON.stringify(i.params) : ''}`);
  if (errors.length) process.exit(1);
  if (outAt >= 0 && args[outAt + 1]) { fs.writeFileSync(args[outAt + 1], json); console.log(`gravado ${args[outAt + 1]}`); }
  // o cenário é escrito à mão; o mapa ocupa uma linha só ("map": { "data": … },), trocada por inteiro no --write
  const text = fs.readFileSync(SCENARIO, 'utf8');
  const line = /^  "map": .*,$/m;
  if (!line.test(text)) { console.error(`${SCENARIO}: linha "map" não encontrada`); process.exit(1); }
  if (args.includes('--write')) {
    fs.writeFileSync(SCENARIO, text.replace(line, () => `  "map": { "data": ${json} },`));
    console.log(`map.data gravado em ${path.relative(process.cwd(), SCENARIO)}`);
    return;
  }
  const same = JSON.stringify(JSON.parse(text).map?.data) === json;
  console.log(same ? 'cenário: map.data idêntico ao gerado' : 'cenário: map.data DIFERENTE do gerado (rode com --write)');
  if (!same) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
