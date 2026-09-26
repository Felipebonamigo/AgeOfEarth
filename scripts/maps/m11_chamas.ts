// Mapa fixo da missão m11 "Argos em Chamas" (docs/STORY.md §5.8): "Argólida em Chamas", 128×128, norte no alto.
// Reprodutível: terreno por primitivas (elipses, trilhas, o curso do Ínaco, a costa do golfo) com bordas de ruído de semente
// fixa (makeNoise/RNG do núcleo, nada de aleatoriedade nativa), aplicado com as MESMAS operações puras do editor
// (src/editor/ops.ts: paint, addNode, placeEntity com tag, setStart) numa partida em branco, e salvo por saveMap (forma
// canônica). O arquivo sai embutido em map.data de src/core/scenario/missions/m11_chamas.scenario.json.
//
// Uso:
//   npx tsx scripts/maps/m11_chamas.ts            confere: o mapa embutido no cenário é idêntico ao gerado (sai 1 se não)
//   npx tsx scripts/maps/m11_chamas.ts --write    grava o mapa gerado em map.data do cenário
//   npx tsx scripts/maps/m11_chamas.ts --out f.map.json   grava também o .map.json avulso (npm run map:check f.map.json)
//
// Relevo e pontos (coordenadas em tiles, como na ficha):
//   norte     os montes do norte fecham o mapa; no meio, a Descida de Cronos, um desfiladeiro de terra batida (x 59–69) por
//             onde o Titã desce do Ótris (início 2 = [64,8]: a ficha pedia [64,4], mas a margem mínima de um início é 8 tiles
//             da borda) até a porta norte de Argos;
//   centro-n  Argos inteira (início 0 = [64,40]) na planície, sob o rochedo da Lárissa (a oeste): CC, Templo (tag templo),
//             Academia, Quartel, Estábulo, Mercado, Fortaleza, 10 Casas, a muralha norte (grupo muralha, G5) com o portão
//             (grupo portao) voltado para a Descida e as 2 Torres nas pontas (torre_oeste, torre_leste); 40 cidadãos,
//             8 hoplitas, 6 arqueiros cretenses e 4 hipeus. Sem kit (a cidade é do mapa);
//   nordeste  o vale do Culto de Cronos (início 1 = [116,12], com kit), aberto para oeste entre os montes do norte e o
//             Aracneu, que fecha o leste da planície;
//   meio      a Via de Náuplia (terra batida) desce de Argos a sudoeste até Tirinto em ruínas: uma Torre do jogador 0 em
//             [40,80] (tag tirinto) num outeiro cercado de restos de muralha ciclópica (rocha, com brechas);
//   oeste     o rio Ínaco desce dos montes do norte até o golfo (x ≈ 26–37) e só se cruza a pé em 2 vaus: o do norte [27,46]
//             (a margem oeste, caminho mais longo até o porto) e o do sul [32,94], na Via de Náuplia;
//   sudoeste  o porto de Náuplia: um cais de areia entre a baía a oeste e o golfo ao sul; as naus (um Mercado do jogador 0, tag
//             naus) atracam em [18,112] — o cenário as põe no setup, com nome (G8) —, junto à água do golfo (linha 116);
//   sudeste   os pântanos de Lerna (areia e poças) e a costa do golfo.
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
const SEED = 11011;   // ruído das bordas e sorteio dos recursos

/** Pontos nomeados da ficha (tiles). */
export const POINTS = {
  argos: [64, 40], cult: [116, 12], descent: [64, 8],
  /** canto do Mercado das naus (3×3) e o centro dele */
  naus: [18, 112], quay: [19.5, 113.5],
  tiryns: [40, 80],
  /** os dois vaus do Ínaco */
  fordN: [27, 46], fordS: [32, 94],
  /** linha da muralha norte de Argos e o portão (x inicial e final) */
  wallRow: 26, gate: [63, 65],
  /** a boca da Descida (onde Prometeu surge) */
  descentFoot: [64, 22],
} as const;
const STARTS: [number, number][] = [[64, 40], [116, 12], [64, 8]];
/** Primeira linha de água do golfo sob o cais de Náuplia (reta de x 8 a 32: o cais encosta nela). */
export const QUAY_COAST = 116;
/** Colunas do desfiladeiro da Descida de Cronos (sem montanha). */
export const PASS = [59, 69] as const;

type Pt = [number, number];
interface Area { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; jitter: number }
interface Trail { kind: 'trail'; pts: Pt[]; width: number; jitter: number }

// ---------------------------------------------------------------------------------------------------------------
// Relevo
// ---------------------------------------------------------------------------------------------------------------

/** O rochedo da Lárissa, a oeste da cidade, e os outeiros da planície. */
const HILLS: Area[] = [
  { kind: 'ellipse', cx: 47, cy: 34, rx: 4.5, ry: 6, jitter: 0.25 },
  { kind: 'ellipse', cx: 88, cy: 52, rx: 3, ry: 2.2, jitter: 0.3 },
  { kind: 'ellipse', cx: 14, cy: 74, rx: 2.5, ry: 3.5, jitter: 0.3 },
  { kind: 'ellipse', cx: 62, cy: 88, rx: 3, ry: 2, jitter: 0.3 },
];

/** O curso do Ínaco (nasce ao pé dos montes do norte e desemboca no golfo, a leste do cais). */
export const RIVER: Pt[] = [[26, 17], [28, 32], [27, 46], [26, 60], [29, 76], [32, 94], [35, 106], [37, 120]];

/** A Via de Náuplia (Argos → Tirinto → vau do sul → cais) e o caminho da margem oeste (vau do norte → cais). */
const VIA_NAUPLIA: Trail = { kind: 'trail', pts: [[64, 44], [60, 54], [52, 64], [45, 73], [42, 78], [38, 85], [32, 94], [26, 103], [21, 109]], width: 3, jitter: 0.5 };
const VIA_OESTE: Trail = { kind: 'trail', pts: [[52, 45], [40, 46], [27, 46], [16, 56], [12, 70], [11, 88], [14, 100], [18, 108]], width: 2.6, jitter: 0.5 };
const ROADS: Trail[] = [VIA_NAUPLIA, VIA_OESTE];

/** Terra batida: Argos, a Descida, o caminho do Culto, o vale do Culto, o outeiro de Tirinto e as estradas. */
const DIRT: (Area | Trail)[] = [
  { kind: 'ellipse', cx: 64, cy: 39, rx: 15, ry: 13, jitter: 0.15 },
  { kind: 'trail', pts: [[64, 4], [64, 27]], width: 5, jitter: 0.6 },
  { kind: 'trail', pts: [[110, 20], [98, 27], [82, 30], [74, 34]], width: 2.6, jitter: 0.5 },
  { kind: 'ellipse', cx: 116, cy: 13, rx: 8, ry: 7, jitter: 0.2 },
  { kind: 'ellipse', cx: 40, cy: 80, rx: 6, ry: 5, jitter: 0.2 },
  ...ROADS,
];

/** Areia: o cais de Náuplia e os pântanos de Lerna. */
const SANDS: Area[] = [
  { kind: 'ellipse', cx: 20, cy: 108, rx: 11, ry: 7, jitter: 0.25 },
  { kind: 'ellipse', cx: 88, cy: 105, rx: 11, ry: 6.5, jitter: 0.3 },
];
/** Poças de Lerna. */
const PONDS: Area[] = [
  { kind: 'ellipse', cx: 83, cy: 104, rx: 2, ry: 1.2, jitter: 0.2 },
  { kind: 'ellipse', cx: 93, cy: 107, rx: 2.2, ry: 1.3, jitter: 0.2 },
  { kind: 'ellipse', cx: 89, cy: 100, rx: 1.6, ry: 1, jitter: 0.2 },
];

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - a[0]) * vx + (py - a[1]) * vy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (a[0] + vx * t), dy = py - (a[1] + vy * t);
  return Math.sqrt(dx * dx + dy * dy);
}
export function polyDist(pts: Pt[], x: number, y: number): number {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, segDist(x, y, pts[i], pts[i + 1]));
  return d;
}
function inArea(a: Area | Trail, x: number, y: number, n: number): boolean {
  if (a.kind === 'ellipse') {
    const dx = (x - a.cx) / a.rx, dy = (y - a.cy) / a.ry;
    return dx * dx + dy * dy <= 1 + (n - 0.5) * a.jitter * 2;
  }
  return polyDist(a.pts, x, y) <= a.width / 2 + (n - 0.5) * a.jitter;
}
const near = (x: number, y: number, p: readonly [number, number], r: number) => (x - p[0]) * (x - p[0]) + (y - p[1]) * (y - p[1]) <= r * r;
/** Tile num dos dois vaus do Ínaco (sem água). */
export const inFord = (x: number, y: number) => near(x, y, POINTS.fordN, 3.2) || near(x, y, POINTS.fordS, 3.2);

/** Terreno por tile (TERRAIN.*), antes da água profunda (derivada pelo pincel do editor). */
function buildTerrain(): Uint8Array {
  const edge = makeNoise(SEED), frame = makeNoise(SEED + 43), ridgeN = makeNoise(SEED + 59), coast = makeNoise(SEED + 31), east = makeNoise(SEED + 71);
  const t = new Uint8Array(W * H).fill(TERRAIN.GRASS);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const n = edge.fbm(x * 0.2, y * 0.2, 3);
    // moldura: montanhas a oeste, ao norte e a leste (o sul é o golfo)
    const f = frame.fbm(x * 0.1, y * 0.1, 2);
    const west = x < 3 + Math.round(f * 3), north = y < 3 + Math.round(f * 3), eastF = x > W - 4 - Math.round(f * 2);
    let tt: number = TERRAIN.GRASS;
    if (west || north || eastF) tt = TERRAIN.MOUNTAIN;
    // os montes do norte: a oeste da Descida até a linha ~16, a leste até ~19; a Descida (x 59–69) e o vale do Culto (x ≥ 98) abertos
    const r = ridgeN.noise(x * 0.15, 2.3);
    if (x < PASS[0] && y < 16 + Math.round((r - 0.5) * 4)) tt = TERRAIN.MOUNTAIN;
    if (x > PASS[1] && x < 98 && y < 19 + Math.round((r - 0.5) * 4)) tt = TERRAIN.MOUNTAIN;
    // o Aracneu fecha o leste da planície (x ≥ ~104, linhas 38–104) e o espigão ao sul do vale do Culto (linhas 34–39)
    const e = east.noise(y * 0.12, 5.1);
    if (x >= 104 + Math.round((e - 0.5) * 6) && y >= 38 && y <= 104) tt = TERRAIN.MOUNTAIN;
    if (x >= 100 && y >= 34 && y <= 39) tt = TERRAIN.MOUNTAIN;
    if (HILLS.some((a) => inArea(a, x, y, n))) tt = TERRAIN.MOUNTAIN;
    if (tt !== TERRAIN.MOUNTAIN && SANDS.some((a) => inArea(a, x, y, n))) tt = TERRAIN.SAND;
    if (tt !== TERRAIN.MOUNTAIN && DIRT.some((a) => inArea(a, x, y, n))) tt = TERRAIN.DIRT;
    // a Descida é terra batida de ponta a ponta (sem ruído: o desfiladeiro tem sempre a mesma largura)
    if (x >= PASS[0] + 1 && x <= PASS[1] - 1 && y >= 3 && y <= 20) tt = TERRAIN.DIRT;
    // Tirinto em ruínas: um anel quebrado de muralha ciclópica (rocha) em volta do outeiro, aberto onde passa a Via
    const dT = Math.sqrt((x + 0.5 - 40.5) * (x + 0.5 - 40.5) + (y + 0.5 - 80.5) * (y + 0.5 - 80.5));
    if (dT >= 4.3 && dT <= 5.3 && polyDist(VIA_NAUPLIA.pts, x, y) > 2.6 && ridgeN.noise(x * 0.9, y * 0.9) > 0.42) tt = TERRAIN.MOUNTAIN;
    if (PONDS.some((a) => inArea(a, x, y, n))) tt = TERRAIN.WATER;
    // o Ínaco: 3 tiles de largura (4 no baixo curso), vaus de areia
    const rd = polyDist(RIVER, x, y);
    if (rd <= (y >= 88 ? 1.8 : 1.3) && tt !== TERRAIN.MOUNTAIN) tt = inFord(x, y) ? TERRAIN.SAND : TERRAIN.WATER;
    t[i] = tt;
  }
  // o golfo da Argólida ao sul (reto sob o cais de Náuplia) e a baía a oeste do cais; praia de areia acompanhando a costa
  const coastY = (x: number) => (x >= 8 && x <= 32 ? QUAY_COAST : 118 + Math.round((coast.noise(x * 0.11, 7.3) - 0.5) * 3));
  for (let x = 0; x < W; x++) {
    const cy = coastY(x);
    for (let y = cy; y < H; y++) t[y * W + x] = TERRAIN.WATER;
    for (let y = cy - 3; y < cy; y++) if (y >= 0 && t[y * W + x] !== TERRAIN.WATER && t[y * W + x] !== TERRAIN.MOUNTAIN) t[y * W + x] = TERRAIN.SAND;
  }
  for (let y = 96; y < H; y++) {
    const bx = 7 + Math.round((coast.noise(3.1, y * 0.13) - 0.5) * 2);
    for (let x = 0; x < bx; x++) t[y * W + x] = TERRAIN.WATER;
    for (let x = bx; x < bx + 2 && x < W; x++) if (t[y * W + x] !== TERRAIN.WATER && t[y * W + x] !== TERRAIN.MOUNTAIN) t[y * W + x] = TERRAIN.SAND;
  }
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// Recursos
// ---------------------------------------------------------------------------------------------------------------
type Cluster = { type: NodeType; x: number; y: number; n: number; r: number; amount?: number };
const CLUSTERS: Cluster[] = [
  // Argos: frutas e o olival perto da cidade (ao alcance das ordens iniciais), ouro nas encostas, caça
  { type: 'berry', x: 52, y: 47, n: 6, r: 1.5 }, { type: 'tree', x: 77, y: 49, n: 10, r: 2.4 },
  { type: 'gold', x: 81, y: 33, n: 4, r: 1.2 }, { type: 'gold', x: 45, y: 43, n: 3, r: 1 },
  { type: 'tree', x: 44, y: 23, n: 10, r: 2.6 }, { type: 'tree', x: 50, y: 55, n: 8, r: 2.2 }, { type: 'deer', x: 73, y: 57, n: 4, r: 1.8 },
  // os olivais de Argos: madeira perto da cidade (sem eles, os lenhadores subiam até a boca do vale do Culto)
  { type: 'tree', x: 45, y: 51, n: 14, r: 3 }, { type: 'tree', x: 84, y: 45, n: 12, r: 2.8 }, { type: 'tree', x: 80, y: 57, n: 10, r: 2.6 },
  { type: 'tree', x: 55, y: 20, n: 8, r: 2.2 },
  // o vale do Culto
  { type: 'berry', x: 109, y: 8, n: 6, r: 1.4 }, { type: 'gold', x: 121, y: 20, n: 4, r: 1.2 }, { type: 'gold', x: 106, y: 17, n: 3, r: 1.1 },
  { type: 'deer', x: 104, y: 11, n: 4, r: 1.6 }, { type: 'boar', x: 121, y: 7, n: 2, r: 1 },
  { type: 'tree', x: 120, y: 28, n: 10, r: 2.4 }, { type: 'tree', x: 110, y: 27, n: 8, r: 2.2 },
  // a planície: bosques, ouro disputado e caça
  { type: 'tree', x: 84, y: 62, n: 12, r: 3 }, { type: 'tree', x: 57, y: 76, n: 10, r: 2.8 }, { type: 'tree', x: 93, y: 85, n: 12, r: 3 },
  { type: 'tree', x: 72, y: 96, n: 10, r: 2.6 }, { type: 'tree', x: 97, y: 48, n: 8, r: 2.2 }, { type: 'tree', x: 48, y: 101, n: 8, r: 2.4 },
  { type: 'gold', x: 89, y: 73, n: 4, r: 1.4 }, { type: 'gold', x: 53, y: 92, n: 3, r: 1.2 },
  { type: 'deer', x: 77, y: 71, n: 4, r: 2 }, { type: 'boar', x: 97, y: 63, n: 2, r: 1.2 }, { type: 'boar', x: 61, y: 101, n: 2, r: 1.2 },
  // a margem oeste do Ínaco
  { type: 'tree', x: 14, y: 30, n: 12, r: 3 }, { type: 'tree', x: 18, y: 84, n: 12, r: 3 }, { type: 'gold', x: 11, y: 62, n: 3, r: 1.2 },
  { type: 'deer', x: 19, y: 40, n: 4, r: 1.8 },
  // Náuplia: pinheiros atrás do cais e frutas na baía
  { type: 'tree', x: 28, y: 109, n: 6, r: 1.8 }, { type: 'berry', x: 12, y: 103, n: 4, r: 1.2 },
];

// Zonas sem recursos (espaço de construção e passagem livre): a cidade e a porta norte, a Descida, o início do Culto,
// Tirinto, os vaus, o cais.
const KEEP_OUT: { x: number; y: number; r: number }[] = [
  { x: 64, y: 39, r: 10 }, { x: 64, y: 23, r: 5 }, { x: 116, y: 12, r: 5 }, { x: 40, y: 80, r: 5.5 },
  { x: 27, y: 46, r: 4.5 }, { x: 32, y: 94, r: 4.5 }, { x: 19, y: 112, r: 7 },
];

// ---------------------------------------------------------------------------------------------------------------
// Entidades (dono = índice do início; uma tag por entidade, como pede a §5.0; muralha e portão são grupos por tag repetida, G5)
// ---------------------------------------------------------------------------------------------------------------
function entities(): MapEntity[] {
  const u = (type: string, owner: number, x: number, y: number, tag?: string): MapEntity => (tag ? { kind: 'unit', type, owner, x, y, tag } : { kind: 'unit', type, owner, x, y });
  const b = (type: string, owner: number, x: number, y: number, tag?: string): MapEntity => (tag ? { kind: 'building', type, owner, x, y, tag } : { kind: 'building', type, owner, x, y });
  const row = POINTS.wallRow, [g0, g1] = POINTS.gate;
  const out: MapEntity[] = [
    // Argos: CC centrado no início [64,40], Templo de Zeus, Academia, Quartel, Estábulo, Mercado e a Fortaleza voltada ao Culto
    b('town_center', 0, 63, 39), b('temple', 0, 57, 35, 'templo'), b('academy', 0, 69, 35), b('barracks', 0, 57, 43), b('stable', 0, 69, 43),
    b('market', 0, 51, 39), b('fortress', 0, 74, 38),
    // 10 Casas: 6 ao norte (a avenida do portão fica livre) e 4 ao sul (a Via de Náuplia sai entre elas)
    b('house', 0, 55, 30), b('house', 0, 58, 30), b('house', 0, 61, 30), b('house', 0, 67, 30), b('house', 0, 70, 30), b('house', 0, 73, 30),
    b('house', 0, 54, 49), b('house', 0, 57, 49), b('house', 0, 69, 49), b('house', 0, 72, 49),
    // a muralha norte, voltada para a Descida, com o portão no meio e uma torre em cada ponta
    b('tower', 0, 51, row, 'torre_oeste'), b('tower', 0, 77, row, 'torre_leste'),
    // Tirinto em ruínas: a torre de parada no meio do caminho
    b('tower', 0, POINTS.tiryns[0], POINTS.tiryns[1], 'tirinto'),
  ];
  for (let x = 52; x <= 76; x++) out.push(x >= g0 && x <= g1 ? b('gate', 0, x, row, 'portao') : b('wall', 0, x, row, 'muralha'));
  // 40 cidadãos em quatro fileiras de 10 em volta do CC
  for (const y of [33, 38, 42, 47]) for (let k = 0; k < 10; k++) out.push(u('villager', 0, 59 + k, y));
  // 8 hoplitas e 6 arqueiros cretenses atrás do portão; 4 hipeus a leste da Fortaleza
  for (let k = 0; k < 8; k++) out.push(u('hoplite', 0, 60 + k, 28));
  for (let k = 0; k < 6; k++) out.push(u('cretan_archer', 0, 61 + k, 27));
  for (let k = 0; k < 4; k++) out.push(u('hippeus', 0, 79 + k, 40));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Montagem pelo pipeline do editor
// ---------------------------------------------------------------------------------------------------------------

/** Gera o mapa canônico (saveMap). Determinístico: mesma saída a cada chamada. */
export function buildFlamesMap(): FixedMapData {
  const blank = blankMap(W, H, STARTS.length, SEED);
  const state = createGame({ seed: 1, mapSize: 'medium', map: { ...blank, starts: STARTS.map(([x, y]) => [x, y]), startKit: false, relics: false }, players: [
    { name: 'Argos', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 },
    { name: 'Culto de Cronos', god: 'hades', isAI: false, difficulty: 'normal', team: 1 },
    { name: 'Cronos', god: 'hades', isAI: false, difficulty: 'normal', team: 1 },
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
  const [ax, ay] = [60, 60];   // tile da planície, no caminho de Argos a Tirinto (referência da região principal)
  const main = componentAt(map, ax, ay);
  const orphan: number[] = [];
  for (let i = 0; i < W * H; i++) {
    const tt = map.terrain[i];
    if (tt === TERRAIN.MOUNTAIN || tt === TERRAIN.WATER || tt === TERRAIN.DEEP) continue;
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
  // 4) recursos em grupos sorteados por RNG de semente fixa, só em terra livre, fora das zonas reservadas, das estradas e das
  //    margens do rio, sem criar bolsões (um nó que isole algum tile vizinho da região principal é desfeito na hora)
  const rng = new RNG(SEED);
  const reserved = (x: number, y: number) => KEEP_OUT.some((k) => (x - k.x) * (x - k.x) + (y - k.y) * (y - k.y) <= k.r * k.r)
    || ROADS.some((r) => polyDist(r.pts, x, y) <= 2.5)
    || polyDist(RIVER, x, y) <= 3
    || (x >= PASS[0] - 1 && x <= PASS[1] + 1 && y <= 24)
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
    if (type === 'tree' && map.terrain[y * W + x] === TERRAIN.SAND && y < 104) return false;   // nada de árvore no pântano
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
  // bosques ao pé das montanhas (ruído), longe das estradas, dos vaus e do cais (passagens sempre livres)
  const forest = makeNoise(SEED + 101);
  const nearMountain = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && map.terrain[ny * W + nx] === TERRAIN.MOUNTAIN) return true;
    }
    return false;
  };
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    if (map.terrain[y * W + x] !== TERRAIN.GRASS || !nearMountain(x, y, 3) || forest.fbm(x * 0.18, y * 0.18, 3) < 0.52) continue;
    let byOther = false;   // árvore colada em ouro/frutas/caça pode cercá-los (nó sem acesso)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const id = map.nodeAt[(y + dy) * W + x + dx]; if (id !== -1 && map.nodes.get(id)?.type !== 'tree') byOther = true; }
    if (!byOther) tryNode('tree', x, y);
  }
  // 5) inícios (a partida em branco já tem os três; setStart grava as posições exatas)
  STARTS.forEach(([x, y], index) => applyEditOp(state, { kind: 'setStart', index, x, y }));
  return saveMap(state, {
    id: 'm11_chamas', name: 'Argólida em Chamas', nameEn: 'Argolis in Flames', author: 'Age of Earth',
    description: 'Missão 11 (Argos em Chamas): Argos inteira na planície, sob a Descida de Cronos ao norte; o vale do Culto a nordeste; a Via de Náuplia desce por Tirinto em ruínas até o cais de Náuplia, a sudoeste, do outro lado do rio Ínaco (dois vaus); os pântanos de Lerna ao sul.',
    startKit: false, relics: false,
  }, (id) => tags.get(id));
}

/** Validação do mapa como a missão o usa (3 jogadores). */
export function flamesIssues(data: FixedMapData): MapIssue[] { return validateMap(data, { players: 3 }); }

// ---------------------------------------------------------------------------------------------------------------
// Linha de comando
// ---------------------------------------------------------------------------------------------------------------
const SCENARIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/core/scenario/missions/m11_chamas.scenario.json');

function main(): void {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const data = buildFlamesMap();
  const issues = flamesIssues(data);
  const errors = issues.filter((i) => i.level === 'error');
  const json = JSON.stringify(data);
  console.log(`Argólida em Chamas ${data.w}x${data.h} · ${data.starts.length} inícios · ${data.nodes.length} nós · ${data.entities?.length ?? 0} entidades · ${json.length} bytes · hash #${mapHash(data).toString(16)} · ${errors.length} erro(s), ${issues.length - errors.length} aviso(s)`);
  for (const i of issues) console.log(`  ${i.level === 'error' ? 'ERRO ' : 'aviso'} ${i.code}${i.x !== undefined ? ` (${i.x}, ${i.y})` : ''}${i.params ? ' ' + JSON.stringify(i.params) : ''}`);
  if (errors.length) process.exit(1);
  if (outAt >= 0 && args[outAt + 1]) { fs.writeFileSync(args[outAt + 1], json); console.log(`gravado ${args[outAt + 1]}`); }
  if (!fs.existsSync(SCENARIO)) { console.log(`${SCENARIO} ainda não existe`); return; }
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
