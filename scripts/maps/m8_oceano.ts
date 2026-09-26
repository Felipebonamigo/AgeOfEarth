// Mapa fixo da missão m8 "A Maré de Oceano" (docs/STORY.md §5.5): "Golfo da Argólida", 128×128, norte no alto.
// Reprodutível: terreno por primitivas (elipses, trilhas, a crista da Áspis e o litoral) com bordas de ruído de semente fixa
// (makeNoise/RNG do núcleo, nada de aleatoriedade nativa), aplicado com as MESMAS operações puras do editor
// (src/editor/ops.ts: paint, addNode, placeEntity com tag, setStart) numa partida em branco, e salvo por saveMap (forma
// canônica). O arquivo sai embutido em map.data de src/core/scenario/missions/m8_oceano.scenario.json.
//
// Uso:
//   npx tsx scripts/maps/m8_oceano.ts            confere: o mapa embutido no cenário é idêntico ao gerado (sai 1 se não)
//   npx tsx scripts/maps/m8_oceano.ts --write    grava o mapa gerado em map.data do cenário
//   npx tsx scripts/maps/m8_oceano.ts --out f.map.json   grava também o .map.json avulso (npm run map:check f.map.json)
//
// Relevo e pontos (coordenadas em tiles, como na ficha):
//   norte     Argos na colina da Lárissa (início 0 = [64,20]), um platô de terra batida cercado de montanha: os braços oeste e
//             leste e, ao sul, a crista da Áspis (linhas 36–40) com três passagens — o Portão de Lerna (oeste, x 49–51), a
//             brecha da Via do Golfo (centro, x 62–66) e o Portão do Istmo (leste, x 77–79). A muralha é parcial: os dois
//             portões fecham as passagens laterais (muro, portão, muro), a brecha só tem os muros das pontas (x 62 e 66) e fica
//             aberta no meio (x 63–65). CC, Templo, Academia, Quartel, Estábulo, Oficina de Cerco, 4 Casas e 2 Torres (uma
//             sobre cada portão); 20 cidadãos. Sem kit (a cidade é do mapa);
//   noroeste  Micenas (início 3 = [20,24], com kit), num vale aberto para a planície;
//   leste     a Liga do Istmo (início 1 = [110,64], com kit), num vale do Aracneu com duas passagens para oeste;
//   centro    a planície e os pântanos de Lerna (~[44,78], areia, terra e três poças), onde a Hidra espera (o cenário a cria
//             em [44,80]) junto ao ouro de Lerna; duas estradas descem dos portões até a praia;
//   sul       uma praia larga de areia (linhas ~112–123) e o golfo (água a partir da linha 124, intransponível, sem naval);
//             o início 2 = [64,119] (a ficha pedia [64,120], mas a margem mínima de um início é 8 tiles da borda:
//             127 - 8 = 119) é o ponto de subida de Oceano, sem kit.
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

export const W = 128, H = 128;
const SEED = 8808;   // ruído das bordas e sorteio dos recursos

/** Pontos nomeados da ficha (tiles). */
export const POINTS = {
  argos: [64, 20], league: [110, 64], rise: [64, 118], mycenae: [20, 24],
  lerna: [44, 78], hydra: [44, 80],
  /** linha da muralha na crista e as três passagens (x inicial e final de cada uma) */
  wallRow: 38, westPass: [49, 51], breach: [62, 66], eastPass: [77, 79],
  /** o meio da brecha (alvo da primeira maré) e o pé da crista do lado de fora */
  breachGap: [64, 38], ridgeFoot: [64, 44],
} as const;
const STARTS: [number, number][] = [[64, 20], [110, 64], [64, 119], [20, 24]];
/** Linhas da crista da Áspis (montanha contínua, exceto nas três passagens). */
const RIDGE = { x0: 38, x1: 90, y0: 36, y1: 40 };
/** Primeira linha de água do golfo no meio da praia (onde Oceano sobe); a costa ondula ±1 fora dali. */
export const COAST = 124;

type Pt = [number, number];
interface Area { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; jitter: number }
interface Trail { kind: 'trail'; pts: Pt[]; width: number; jitter: number }

// ---------------------------------------------------------------------------------------------------------------
// Relevo: a planície é grama; montanhas cercam a Lárissa e o vale da Liga, e o golfo fecha o sul.
// ---------------------------------------------------------------------------------------------------------------

/** Maciços (montanha), além da moldura e da crista da Áspis. */
const MOUNTAINS: (Area | Trail)[] = [
  // braços da Lárissa (oeste e leste): com a moldura norte e a crista, fecham o platô de Argos
  { kind: 'trail', pts: [[41, 2], [40, 12], [40, 24], [41, 36]], width: 6, jitter: 1.5 },
  { kind: 'trail', pts: [[87, 2], [88, 12], [88, 24], [87, 36]], width: 6, jitter: 1.5 },
  // vale da Liga (Aracneu): norte, sul e a serra oeste com duas passagens (linhas ~56–60 e ~68–72)
  { kind: 'trail', pts: [[91, 44], [104, 46], [126, 43]], width: 5, jitter: 1.5 },
  { kind: 'trail', pts: [[91, 85], [106, 83], [126, 87]], width: 5, jitter: 1.5 },
  { kind: 'trail', pts: [[94, 44], [95, 53]], width: 4, jitter: 0.6 },
  { kind: 'trail', pts: [[95, 63], [95, 65]], width: 4, jitter: 0.6 },
  { kind: 'trail', pts: [[95, 75], [94, 84]], width: 4, jitter: 0.6 },
  // outeiros da planície: o monte a leste de Micenas, as colinas do oeste e as do sudeste
  { kind: 'ellipse', cx: 33, cy: 13, rx: 3.5, ry: 3, jitter: 0.3 },
  { kind: 'ellipse', cx: 24, cy: 62, rx: 4, ry: 2.5, jitter: 0.35 },
  { kind: 'ellipse', cx: 100, cy: 98, rx: 4.5, ry: 3, jitter: 0.35 },
];

/** Poças dos pântanos de Lerna (água), além do golfo. */
const PONDS: Area[] = [
  { kind: 'ellipse', cx: 39, cy: 75, rx: 2.2, ry: 1.3, jitter: 0.2 },
  { kind: 'ellipse', cx: 50, cy: 80, rx: 2, ry: 1.2, jitter: 0.2 },
  { kind: 'ellipse', cx: 41, cy: 85, rx: 1.8, ry: 1.1, jitter: 0.2 },
];

/** As duas estradas que descem dos portões até a praia (a oeste por Lerna, a leste pela planície). */
const ROADS: Trail[] = [
  { kind: 'trail', pts: [[50, 34], [50, 44], [47, 56], [46, 70], [46, 88], [50, 100], [54, 112]], width: 3, jitter: 0.6 },
  { kind: 'trail', pts: [[78, 34], [78, 44], [82, 56], [84, 70], [80, 90], [74, 112]], width: 3, jitter: 0.6 },
];

/** Terra batida: a colina de Argos, os vales de Micenas e da Liga, a Via do Golfo na brecha e o ramal da Liga. */
const DIRT: (Area | Trail)[] = [
  { kind: 'ellipse', cx: 64, cy: 20, rx: 18, ry: 12, jitter: 0.15 },
  { kind: 'ellipse', cx: 20, cy: 24, rx: 9, ry: 8, jitter: 0.2 },
  { kind: 'ellipse', cx: 110, cy: 64, rx: 9, ry: 8, jitter: 0.2 },
  { kind: 'trail', pts: [[64, 32], [64, 46]], width: 3, jitter: 0.4 },
  { kind: 'trail', pts: [[84, 66], [92, 70], [100, 68]], width: 3, jitter: 0.5 },
  ...ROADS,
];

/** Pântanos de Lerna (areia), antes das poças. */
const MARSH: Area[] = [{ kind: 'ellipse', cx: 44, cy: 79, rx: 9, ry: 6.5, jitter: 0.3 }];

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

/** Coluna numa das três passagens da crista? */
export function inPass(x: number): boolean {
  const [w0, w1] = POINTS.westPass, [c0, c1] = POINTS.breach, [e0, e1] = POINTS.eastPass;
  return (x >= w0 && x <= w1) || (x >= c0 && x <= c1) || (x >= e0 && x <= e1);
}

/** Primeira linha de água do golfo na coluna x (reta no meio da praia, onde Oceano sobe; ondula ±1 fora dali). */
function coastY(x: number, coast: ReturnType<typeof makeNoise>): number {
  if (x >= 52 && x <= 76) return COAST;
  return COAST + Math.round((coast.noise(x * 0.11, 7.3) - 0.5) * 2.4);
}

/** Terreno por tile (TERRAIN.*), antes da água profunda (derivada pelo pincel do editor). */
function buildTerrain(): Uint8Array {
  const edge = makeNoise(SEED), coast = makeNoise(SEED + 31), frame = makeNoise(SEED + 43), ridgeN = makeNoise(SEED + 59);
  const t = new Uint8Array(W * H).fill(TERRAIN.GRASS);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const n = edge.fbm(x * 0.2, y * 0.2, 3);
    // moldura: montanhas a oeste, ao norte e a leste (o sul é o golfo)
    const f = frame.fbm(x * 0.1, y * 0.1, 2);
    const west = x < 3 + Math.round(f * 3), north = y < 3 + Math.round(f * 3), east = x > W - 4 - Math.round(f * 2);
    let tt: number = TERRAIN.GRASS;
    if (west || north || east || MOUNTAINS.some((a) => inArea(a, x, y, n))) tt = TERRAIN.MOUNTAIN;
    // a crista da Áspis: linhas 36–40 contínuas (as bordas norte e sul ondulam um tile), menos nas três passagens
    if (x >= RIDGE.x0 && x <= RIDGE.x1 && !inPass(x)) {
      const r = ridgeN.noise(x * 0.3, 1.7);
      const top = RIDGE.y0 - (r > 0.62 ? 1 : 0), bottom = RIDGE.y1 + (r < 0.38 ? 1 : 0);
      if (y >= top && y <= bottom) tt = TERRAIN.MOUNTAIN;
    }
    if (tt !== TERRAIN.MOUNTAIN && MARSH.some((a) => inArea(a, x, y, n))) tt = TERRAIN.SAND;
    if (tt !== TERRAIN.MOUNTAIN && DIRT.some((a) => inArea(a, x, y, n))) tt = TERRAIN.DIRT;
    // as passagens da crista são terra batida de ponta a ponta (sem ruído: a muralha fecha exatamente a largura delas)
    if (inPass(x) && y >= RIDGE.y0 - 1 && y <= RIDGE.y1 + 1) tt = TERRAIN.DIRT;
    if (PONDS.some((a) => inArea(a, x, y, n))) tt = TERRAIN.WATER;
    t[i] = tt;
  }
  // o golfo da Argólida ao sul e a praia larga (areia) acompanhando a costa
  for (let x = 0; x < W; x++) {
    const cy = coastY(x, coast);
    for (let y = cy; y < H; y++) t[y * W + x] = TERRAIN.WATER;
    for (let y = cy - 12; y < cy; y++) if (y >= 0 && t[y * W + x] !== TERRAIN.WATER && t[y * W + x] !== TERRAIN.MOUNTAIN) t[y * W + x] = TERRAIN.SAND;
  }
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// Recursos
// ---------------------------------------------------------------------------------------------------------------
type Cluster = { type: NodeType; x: number; y: number; n: number; r: number; amount?: number };
const CLUSTERS: Cluster[] = [
  // Argos (dentro da muralha): dois veios de ouro, bosques nas encostas, frutas e caça
  { type: 'gold', x: 48, y: 11, n: 4, r: 1.2 }, { type: 'gold', x: 80, y: 11, n: 4, r: 1.2 },
  { type: 'berry', x: 55, y: 30, n: 6, r: 1.6 }, { type: 'deer', x: 73, y: 30, n: 4, r: 1.8 },
  { type: 'tree', x: 46, y: 21, n: 12, r: 2.8 }, { type: 'tree', x: 82, y: 21, n: 12, r: 2.8 },
  { type: 'tree', x: 55, y: 6, n: 8, r: 2.2 }, { type: 'tree', x: 73, y: 6, n: 8, r: 2.2 },
  // Micenas
  { type: 'berry', x: 26, y: 30, n: 6, r: 1.6 }, { type: 'gold', x: 12, y: 13, n: 4, r: 1.2 }, { type: 'gold', x: 31, y: 38, n: 3, r: 1.2 },
  { type: 'deer', x: 10, y: 32, n: 4, r: 1.8 }, { type: 'boar', x: 28, y: 18, n: 2, r: 1.2 },
  { type: 'tree', x: 8, y: 20, n: 10, r: 2.5 }, { type: 'tree', x: 24, y: 8, n: 10, r: 2.5 }, { type: 'tree', x: 14, y: 41, n: 10, r: 2.5 },
  // Liga do Istmo (vale do Aracneu)
  { type: 'berry', x: 118, y: 72, n: 6, r: 1.6 }, { type: 'gold', x: 118, y: 53, n: 4, r: 1.2 }, { type: 'gold', x: 103, y: 77, n: 3, r: 1.2 },
  { type: 'deer', x: 102, y: 55, n: 4, r: 1.8 }, { type: 'boar', x: 116, y: 78, n: 2, r: 1.2 },
  { type: 'tree', x: 121, y: 62, n: 10, r: 2.5 }, { type: 'tree', x: 107, y: 50, n: 8, r: 2.2 }, { type: 'tree', x: 111, y: 80, n: 8, r: 2.2 },
  // planície: ouro contestado, bosques, caça
  { type: 'gold', x: 30, y: 57, n: 4, r: 1.4 }, { type: 'gold', x: 92, y: 104, n: 4, r: 1.4 }, { type: 'gold', x: 64, y: 92, n: 3, r: 1.2 },
  { type: 'tree', x: 28, y: 48, n: 12, r: 3 }, { type: 'tree', x: 57, y: 60, n: 10, r: 2.8 }, { type: 'tree', x: 73, y: 72, n: 10, r: 2.8 },
  { type: 'tree', x: 20, y: 98, n: 12, r: 3 }, { type: 'tree', x: 106, y: 106, n: 10, r: 2.8 }, { type: 'tree', x: 88, y: 50, n: 8, r: 2.2 },
  { type: 'deer', x: 70, y: 52, n: 4, r: 2 }, { type: 'deer', x: 34, y: 100, n: 4, r: 2 },
  { type: 'boar', x: 90, y: 60, n: 2, r: 1.2 }, { type: 'boar', x: 58, y: 100, n: 2, r: 1.2 }, { type: 'berry', x: 82, y: 100, n: 5, r: 1.6 },
  // o ouro de Lerna, junto da Hidra
  { type: 'gold', x: 50, y: 74, n: 3, r: 1 },
  // pinheiros costeiros nas pontas da praia (longe de onde Oceano sobe)
  { type: 'tree', x: 16, y: 114, n: 6, r: 2 }, { type: 'tree', x: 112, y: 114, n: 6, r: 2 },
];

// Zonas sem recursos (espaço de construção e passagem livre): a cidade de Argos, os inícios, as passagens da crista e o pé
// delas, a subida de Oceano na praia e o covil da Hidra.
const KEEP_OUT: { x: number; y: number; r: number }[] = [
  { x: 64, y: 20, r: 12 }, { x: 110, y: 64, r: 6 }, { x: 20, y: 24, r: 6 }, { x: 64, y: 116, r: 8 },
  { x: 50, y: 37, r: 4 }, { x: 64, y: 37, r: 5 }, { x: 78, y: 37, r: 4 }, { x: 50, y: 43, r: 3 }, { x: 64, y: 44, r: 4 }, { x: 78, y: 43, r: 3 },
  { x: 44, y: 80, r: 2 }, { x: 95, y: 58, r: 3 }, { x: 95, y: 70, r: 3 },
];

// ---------------------------------------------------------------------------------------------------------------
// Entidades (dono = índice do início; uma tag por entidade, como pede a §5.0; a muralha é um grupo por tag repetida, G5)
// ---------------------------------------------------------------------------------------------------------------
function entities(): MapEntity[] {
  const u = (type: string, owner: number, x: number, y: number, tag?: string): MapEntity => (tag ? { kind: 'unit', type, owner, x, y, tag } : { kind: 'unit', type, owner, x, y });
  const b = (type: string, owner: number, x: number, y: number, tag?: string): MapEntity => (tag ? { kind: 'building', type, owner, x, y, tag } : { kind: 'building', type, owner, x, y });
  const row = POINTS.wallRow;
  const out: MapEntity[] = [
    // Argos (jogador 0): CC centrado no início [64,20], Templo, Academia, Quartel, Estábulo, Oficina de Cerco e 4 Casas
    b('town_center', 0, 63, 19), b('temple', 0, 57, 14), b('academy', 0, 69, 14), b('barracks', 0, 57, 23), b('stable', 0, 69, 23),
    b('siege_workshop', 0, 63, 27), b('house', 0, 59, 10), b('house', 0, 62, 10), b('house', 0, 65, 10), b('house', 0, 68, 10),
    // as duas torres, uma sobre cada portão (do lado de dentro)
    b('tower', 0, 52, 34, 'torre_oeste'), b('tower', 0, 76, 34, 'torre_leste'),
    // a muralha parcial da crista: muro-portão-muro nas passagens laterais; na brecha, só os muros das pontas
    b('wall', 0, POINTS.westPass[0], row, 'muralha'), b('gate', 0, POINTS.westPass[0] + 1, row, 'portao_oeste'), b('wall', 0, POINTS.westPass[1], row, 'muralha'),
    b('wall', 0, POINTS.breach[0], row, 'muralha'), b('wall', 0, POINTS.breach[1], row, 'muralha'),
    b('wall', 0, POINTS.eastPass[0], row, 'muralha'), b('gate', 0, POINTS.eastPass[0] + 1, row, 'portao_leste'), b('wall', 0, POINTS.eastPass[1], row, 'muralha'),
  ];
  // 20 cidadãos em duas fileiras, ao norte e ao sul do CC
  for (let k = 0; k < 10; k++) out.push(u('villager', 0, 59 + k, 17), u('villager', 0, 59 + k, 23));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Montagem pelo pipeline do editor
// ---------------------------------------------------------------------------------------------------------------

/** Gera o mapa canônico (saveMap). Determinístico: mesma saída a cada chamada. */
export function buildGulfMap(): FixedMapData {
  const blank = blankMap(W, H, STARTS.length, SEED);
  const state = createGame({ seed: 1, mapSize: 'medium', map: { ...blank, starts: STARTS.map(([x, y]) => [x, y]), startKit: false, relics: false }, players: [
    { name: 'Argos', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 },
    { name: 'Liga do Istmo', god: 'poseidon', isAI: false, difficulty: 'normal', team: 1 },
    { name: 'Oceano', god: 'poseidon', isAI: false, difficulty: 'normal', team: 1 },
    { name: 'Micenas', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 },
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
  // 2) terra firme fora da região principal (a da planície) vira montanha: sem bolsões soltos de ruído
  const [ax, ay] = POINTS.ridgeFoot;   // tile livre ao pé da crista, fora da muralha (referência da região principal)
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
  // 4) recursos em grupos sorteados por RNG de semente fixa, só em terra livre, fora das zonas reservadas e das estradas,
  //    sem criar bolsões (um nó que isole algum tile vizinho da região principal é desfeito na hora)
  const rng = new RNG(SEED);
  const reserved = (x: number, y: number) => KEEP_OUT.some((k) => (x - k.x) * (x - k.x) + (y - k.y) * (y - k.y) <= k.r * k.r)
    || ROADS.some((r) => trailDist(r, x, y) <= 2.5)
    || (inPass(x) && y >= RIDGE.y0 - 3 && y <= RIDGE.y1 + 3)
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
    if (type === 'tree' && map.terrain[y * W + x] === TERRAIN.SAND && y < 100) return false;   // nada de árvore no pântano
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
  // bosques ao pé das montanhas (ruído), longe das estradas, das passagens e da praia (passagens sempre livres)
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
    let byOther = false;   // árvore colada em ouro/frutas/caça pode cercá-los (nó sem acesso)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const id = map.nodeAt[(y + dy) * W + x + dx]; if (id !== -1 && map.nodes.get(id)?.type !== 'tree') byOther = true; }
    if (!byOther) tryNode('tree', x, y);
  }
  // 5) inícios (a partida em branco já tem os quatro; setStart grava as posições exatas)
  STARTS.forEach(([x, y], index) => applyEditOp(state, { kind: 'setStart', index, x, y }));
  return saveMap(state, {
    id: 'm8_oceano', name: 'Golfo da Argólida', nameEn: 'Gulf of Argolis', author: 'Age of Earth',
    description: 'Missão 8 (A Maré de Oceano): Argos na colina da Lárissa ao norte, atrás da crista da Áspis com dois portões e uma brecha; Micenas a noroeste, a Liga do Istmo no vale do leste, os pântanos de Lerna no centro e a praia larga do golfo ao sul, de onde Oceano sobe.',
    startKit: false, relics: false,
  }, (id) => tags.get(id));
}

/** Validação do mapa como a missão o usa (4 jogadores). */
export function gulfIssues(data: FixedMapData): MapIssue[] { return validateMap(data, { players: 4 }); }

// ---------------------------------------------------------------------------------------------------------------
// Linha de comando
// ---------------------------------------------------------------------------------------------------------------
const SCENARIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/core/scenario/missions/m8_oceano.scenario.json');

function main(): void {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const data = buildGulfMap();
  const issues = gulfIssues(data);
  const errors = issues.filter((i) => i.level === 'error');
  const json = JSON.stringify(data);
  console.log(`Golfo da Argólida ${data.w}x${data.h} · ${data.starts.length} inícios · ${data.nodes.length} nós · ${data.entities?.length ?? 0} entidades · ${json.length} bytes · hash #${mapHash(data).toString(16)} · ${errors.length} erro(s), ${issues.length - errors.length} aviso(s)`);
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
