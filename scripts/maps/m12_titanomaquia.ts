// Mapa fixo da missão m12 "O Fim da Idade de Ouro" (docs/STORY.md §5.9): "Planície da Tessália", 144×144, norte no alto.
// Reprodutível: terreno por primitivas (elipses e trilhas: os maciços do Olimpo, do Ossa e do Ótris, a caverna de Hades, o lago
// Bébeis e a costa de Poseidon) com bordas de ruído de semente fixa (makeNoise/RNG do núcleo, nada de aleatoriedade nativa),
// aplicado com as MESMAS operações puras do editor (src/editor/ops.ts: paint, addNode, placeEntity com tag, setStart) numa
// partida em branco, e salvo por saveMap (forma canônica). O arquivo sai embutido em map.data de
// src/core/scenario/missions/m12_titanomaquia.scenario.json.
//
// Uso:
//   npx tsx scripts/maps/m12_titanomaquia.ts            confere: o mapa embutido no cenário é idêntico ao gerado (sai 1 se não)
//   npx tsx scripts/maps/m12_titanomaquia.ts --write    grava o mapa gerado em map.data do cenário
//   npx tsx scripts/maps/m12_titanomaquia.ts --out f.map.json   grava também o .map.json avulso (npm run map:check f.map.json)
//   npx tsx scripts/maps/m12_titanomaquia.ts --ascii    imprime o mapa em texto (1 caractere a cada 2 tiles)
//
// Relevo e pontos (coordenadas em tiles, como na ficha):
//   noroeste  o Olimpo: o pico no canto e a escarpa que cerca a Nova Argos (início 0 = [24,24], sem kit: a cidade é do mapa).
//             A escarpa tem três passagens: a leste, para o Vale do Tempe; a rampa do sudeste, para o Campo; e a do sul, para a
//             estrada da caverna de Hades. CC, Templo, Academia, Fortaleza em obra (complete: false), 4 Casas, 15 cidadãos,
//             Odisseu (tag odisseu) e Héracles (tag heracles); Perseu nasce do setup do cenário;
//   norte     o Vale do Tempe, entre a escarpa do Olimpo e o esporão do Ossa, que desce da borda norte até o meio do mapa e separa
//             o Olimpo do Ótris (quem vem do trono contorna o Ossa pela planície);
//   nordeste  o Monte Ótris: o pico no canto e o planalto do Culto (início 3 = [120,24], com kit), fechado ao sul pela serra do
//             Ótris com duas saídas (a Estrada do Trono, a sudoeste, e a trilha do leste). O Trono de Cronos é uma Fortaleza do
//             jogador 3 com a tag trono, com o canto em [111,29] (a ficha: [112,30]), guardando a Estrada do Trono; duas torres
//             do Culto na saída;
//   sudoeste  a caverna de Hades (início 1 = [24,120], com kit): terra escura cercada de rocha, com a poça do Estige, uma boca ao
//             norte (a estrada do Olimpo) e outra a leste (o Campo);
//   sudeste   a costa de Poseidon (início 2 = [120,120], com kit): praia e mar (água intransponível, sem naval), aberta para o
//             Campo e para o lago Bébeis;
//   centro    o Campo da Titanomaquia, terra batida com os três Altares da Foice (Templos do jogador 3; centros [72,60], [56,86]
//             e [90,86], como na ficha; tags foice1, foice2, foice3), cada um com três sentinelas do Culto (estátuas guardiãs,
//             imóveis), ligado a todos os cantos por estradas.
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

export const W = 144, H = 144;
const SEED = 12012;   // ruído das bordas e sorteio dos recursos

/** Pontos nomeados da ficha (tiles). */
export const POINTS = {
  olympus: [24, 24], hades: [24, 120], poseidon: [120, 120], othrys: [120, 24],
  /** centros dos três Altares da Foice (Templos 3×3 com o canto um tile acima e à esquerda) */
  altars: [[72, 60], [56, 86], [90, 86]] as [number, number][],
  /** canto do Trono (Fortaleza 4×4 do Culto) e o ponto ao sul dele onde Cronos surge */
  throne: [111, 29], rise: [113, 36],
  /** o meio do Campo da Titanomaquia */
  field: [72, 76],
  /** as passagens da escarpa do Olimpo (leste, sudeste e sul), as saídas do Ótris e as bocas da caverna (centro de cada uma) */
  olympusEast: [45, 19], olympusRamp: [40, 39], olympusSouth: [18, 44],
  throneRoad: [100, 46], othrysEast: [126, 46],
  caveNorth: [19, 100], caveEast: [41, 120],
} as const;
const STARTS: [number, number][] = [[24, 24], [24, 120], [120, 120], [120, 24]];

type Pt = [number, number];
interface Area { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; jitter: number }
interface Trail { kind: 'trail'; pts: Pt[]; width: number; jitter: number }

// ---------------------------------------------------------------------------------------------------------------
// Relevo
// ---------------------------------------------------------------------------------------------------------------

/** Maciços (montanha), além da moldura. */
const MOUNTAINS: (Area | Trail)[] = [
  // o Olimpo: o pico no canto e a escarpa que cerca a Nova Argos (passagens a leste, no sudeste e ao sul)
  { kind: 'ellipse', cx: 6, cy: 6, rx: 11, ry: 10, jitter: 0.25 },
  { kind: 'trail', pts: [[45, 1], [45, 14]], width: 5, jitter: 1 },
  { kind: 'trail', pts: [[45, 24], [44, 33], [43, 35]], width: 5, jitter: 1 },
  { kind: 'trail', pts: [[35, 43], [26, 45]], width: 5, jitter: 1 },
  { kind: 'trail', pts: [[12, 45], [1, 44]], width: 5, jitter: 1 },
  // o esporão do Ossa: da borda norte até o meio do mapa, entre o Tempe e o Ótris
  { kind: 'trail', pts: [[72, 1], [72, 18], [70, 34], [66, 46]], width: 9, jitter: 1.5 },
  // o Ótris: o pico no canto e a serra do sul com duas saídas (Estrada do Trono em x ~96–104, trilha do leste em x ~123–129)
  { kind: 'ellipse', cx: 136, cy: 7, rx: 10, ry: 8, jitter: 0.25 },
  { kind: 'trail', pts: [[74, 44], [93, 47]], width: 5, jitter: 1 },
  { kind: 'trail', pts: [[107, 47], [120, 47]], width: 5, jitter: 1 },
  { kind: 'trail', pts: [[131, 46], [143, 45]], width: 5, jitter: 1 },
  // a caverna de Hades: rocha ao norte e a leste, com uma boca ao norte (x ~16–22) e outra a leste (y ~116–124)
  { kind: 'trail', pts: [[1, 98], [13, 100]], width: 5, jitter: 1 },
  { kind: 'trail', pts: [[25, 100], [37, 103], [41, 111]], width: 5, jitter: 1 },
  { kind: 'trail', pts: [[41, 129], [40, 143]], width: 5, jitter: 1 },
  // outeiros da planície (as colinas de Farsália a oeste, uma a sudeste do Campo, outra ao sul)
  { kind: 'ellipse', cx: 30, cy: 68, rx: 4, ry: 3, jitter: 0.35 },
  { kind: 'ellipse', cx: 104, cy: 102, rx: 3.5, ry: 3, jitter: 0.35 },
  { kind: 'ellipse', cx: 70, cy: 118, rx: 4.5, ry: 2.5, jitter: 0.35 },
];

/** Águas interiores: o lago Bébeis (a leste do Campo) e a poça do Estige, no fundo da caverna. */
const LAKES: Area[] = [
  { kind: 'ellipse', cx: 108, cy: 74, rx: 7, ry: 4, jitter: 0.2 },
  { kind: 'ellipse', cx: 9, cy: 133, rx: 4, ry: 2.5, jitter: 0.2 },
];

/** Estradas (terra batida) que ligam as quatro bases ao Campo. */
const ROADS: Trail[] = [
  { kind: 'trail', pts: [[30, 30], [40, 39], [52, 54], [66, 68], [72, 76]], width: 3, jitter: 0.6 },    // do Olimpo, pela rampa
  { kind: 'trail', pts: [[18, 38], [18, 46], [19, 70], [19, 104]], width: 3, jitter: 0.6 },              // Olimpo → caverna
  { kind: 'trail', pts: [[34, 120], [44, 120], [58, 104], [72, 76]], width: 3, jitter: 0.6 },            // da caverna
  { kind: 'trail', pts: [[112, 114], [98, 100], [84, 88], [72, 76]], width: 3, jitter: 0.6 },            // da costa
  { kind: 'trail', pts: [[108, 34], [100, 46], [90, 58], [78, 70], [72, 76]], width: 3, jitter: 0.6 },   // do Trono
];

/** Terra batida: o planalto da Nova Argos, o do Culto, o chão da caverna e o Campo da Titanomaquia. */
const DIRT: (Area | Trail)[] = [
  { kind: 'ellipse', cx: 25, cy: 25, rx: 13, ry: 11, jitter: 0.15 },
  { kind: 'ellipse', cx: 116, cy: 26, rx: 13, ry: 10, jitter: 0.15 },
  { kind: 'ellipse', cx: 22, cy: 121, rx: 15, ry: 15, jitter: 0.2 },
  { kind: 'ellipse', cx: 72, cy: 74, rx: 22, ry: 18, jitter: 0.25 },
  ...ROADS,
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

/** O mar de Poseidon no sudeste: faixas junto das bordas leste e sul e a enseada do canto (água intransponível). */
function inSea(x: number, y: number, coast: ReturnType<typeof makeNoise>): boolean {
  const wob = Math.round((coast.noise(x * 0.12, y * 0.12) - 0.5) * 3);
  if (x >= 136 + wob && y >= 92) return true;
  if (y >= 136 + wob && x >= 92) return true;
  const dx = x - 150, dy = y - 150;
  return dx * dx + dy * dy <= (30 + wob) * (30 + wob);
}

/** Terreno por tile (TERRAIN.*), antes da água profunda (derivada pelo pincel do editor). */
function buildTerrain(): Uint8Array {
  const edge = makeNoise(SEED), coast = makeNoise(SEED + 31), frame = makeNoise(SEED + 43);
  const t = new Uint8Array(W * H).fill(TERRAIN.GRASS);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const n = edge.fbm(x * 0.2, y * 0.2, 3);
    // moldura: montanha ao norte, a oeste, a leste (até o mar) e ao sul (até o mar); o sudeste é o mar de Poseidon
    const f = frame.fbm(x * 0.1, y * 0.1, 2);
    const west = x < 3 + Math.round(f * 3), north = y < 3 + Math.round(f * 3);
    const east = y < 92 && x > W - 4 - Math.round(f * 2), south = x < 92 && y > H - 4 - Math.round(f * 2);
    let tt: number = TERRAIN.GRASS;
    if (west || north || east || south || MOUNTAINS.some((a) => inArea(a, x, y, n))) tt = TERRAIN.MOUNTAIN;
    if (tt !== TERRAIN.MOUNTAIN && DIRT.some((a) => inArea(a, x, y, n))) tt = TERRAIN.DIRT;
    if (LAKES.some((a) => inArea(a, x, y, n))) tt = TERRAIN.WATER;
    if (inSea(x, y, coast)) tt = TERRAIN.WATER;
    t[i] = tt;
  }
  // praias: areia a até 3 tiles da água (mar e lago), fora da montanha
  const near = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && t[yy * W + xx] === TERRAIN.WATER) return true;
    }
    return false;
  };
  const sand: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (t[i] === TERRAIN.GRASS && near(x, y, x > 90 && y > 90 ? 4 : 2)) sand.push(i);
  }
  for (const i of sand) t[i] = TERRAIN.SAND;
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// Recursos
// ---------------------------------------------------------------------------------------------------------------
type Cluster = { type: NodeType; x: number; y: number; n: number; r: number; amount?: number };
const CLUSTERS: Cluster[] = [
  // Nova Argos, no planalto do Olimpo
  { type: 'gold', x: 11, y: 29, n: 4, r: 1.2 }, { type: 'gold', x: 35, y: 10, n: 4, r: 1.2 },
  { type: 'berry', x: 14, y: 35, n: 6, r: 1.6 }, { type: 'deer', x: 36, y: 22, n: 4, r: 1.8 },
  { type: 'tree', x: 20, y: 9, n: 10, r: 2.6 }, { type: 'tree', x: 38, y: 31, n: 8, r: 2.2 }, { type: 'tree', x: 7, y: 38, n: 8, r: 2.2 },
  // o Vale do Tempe
  { type: 'gold', x: 56, y: 10, n: 5, r: 1.3 }, { type: 'gold', x: 58, y: 32, n: 4, r: 1.2 },
  { type: 'tree', x: 52, y: 5, n: 10, r: 2.6 }, { type: 'tree', x: 61, y: 21, n: 10, r: 2.6 }, { type: 'deer', x: 53, y: 38, n: 4, r: 1.8 },
  // o planalto do Culto (Ótris)
  { type: 'berry', x: 128, y: 32, n: 6, r: 1.6 }, { type: 'gold', x: 132, y: 22, n: 4, r: 1.2 }, { type: 'gold', x: 98, y: 12, n: 4, r: 1.2 },
  { type: 'deer', x: 90, y: 24, n: 4, r: 1.8 }, { type: 'boar', x: 124, y: 12, n: 2, r: 1.2 },
  { type: 'tree', x: 86, y: 8, n: 10, r: 2.6 }, { type: 'tree', x: 136, y: 38, n: 8, r: 2.2 }, { type: 'tree', x: 84, y: 36, n: 8, r: 2.2 },
  // a caverna de Hades
  { type: 'berry', x: 30, y: 128, n: 6, r: 1.6 }, { type: 'gold', x: 11, y: 113, n: 4, r: 1.2 }, { type: 'gold', x: 33, y: 136, n: 3, r: 1.2 },
  { type: 'deer', x: 10, y: 123, n: 4, r: 1.8 }, { type: 'boar', x: 32, y: 108, n: 2, r: 1.2 },
  { type: 'tree', x: 8, y: 105, n: 10, r: 2.4 }, { type: 'tree', x: 20, y: 138, n: 8, r: 2.2 },
  // a costa de Poseidon (a praia não tem árvores: os bosques ficam no capim, dentro do raio do Centro Cívico)
  { type: 'berry', x: 110, y: 127, n: 6, r: 1.6 }, { type: 'gold', x: 126, y: 108, n: 4, r: 1.2 }, { type: 'gold', x: 106, y: 128, n: 3, r: 1.2 },
  { type: 'deer', x: 116, y: 131, n: 4, r: 1.8 }, { type: 'boar', x: 124, y: 130, n: 2, r: 1.2 },
  { type: 'tree', x: 112, y: 108, n: 10, r: 2.4 }, { type: 'tree', x: 106, y: 114, n: 10, r: 2.4 },
  { type: 'tree', x: 128, y: 96, n: 8, r: 2.2 }, { type: 'tree', x: 96, y: 124, n: 10, r: 2.6 },
  // a planície: ouro contestado, bosques e caça em volta do Campo
  { type: 'gold', x: 46, y: 60, n: 4, r: 1.3 }, { type: 'gold', x: 98, y: 60, n: 4, r: 1.3 }, { type: 'gold', x: 72, y: 100, n: 4, r: 1.3 },
  { type: 'gold', x: 38, y: 92, n: 3, r: 1.2 }, { type: 'gold', x: 108, y: 92, n: 3, r: 1.2 },
  { type: 'tree', x: 50, y: 48, n: 10, r: 2.8 }, { type: 'tree', x: 94, y: 52, n: 10, r: 2.8 }, { type: 'tree', x: 30, y: 82, n: 12, r: 3 },
  { type: 'tree', x: 118, y: 86, n: 10, r: 2.8 }, { type: 'tree', x: 56, y: 124, n: 12, r: 3 }, { type: 'tree', x: 86, y: 126, n: 10, r: 2.8 },
  { type: 'tree', x: 8, y: 60, n: 10, r: 2.6 }, { type: 'tree', x: 132, y: 62, n: 10, r: 2.6 },
  { type: 'deer', x: 58, y: 70, n: 4, r: 2 }, { type: 'deer', x: 88, y: 70, n: 4, r: 2 }, { type: 'boar', x: 72, y: 94, n: 2, r: 1.2 },
];

// Zonas sem recursos (espaço de construção e passagem livre): as quatro bases, os altares, o trono e o ponto onde Cronos surge,
// as passagens do Olimpo, as saídas do Ótris e as bocas da caverna.
const KEEP_OUT: { x: number; y: number; r: number }[] = [
  { x: 24, y: 24, r: 11 }, { x: 24, y: 120, r: 7 }, { x: 120, y: 120, r: 7 }, { x: 120, y: 24, r: 7 },
  ...POINTS.altars.map(([x, y]) => ({ x, y, r: 6 })),
  { x: 113, y: 31, r: 5 }, { x: 113, y: 37, r: 3 },
  { x: 45, y: 19, r: 4 }, { x: 40, y: 39, r: 4 }, { x: 18, y: 44, r: 4 }, { x: 100, y: 46, r: 5 }, { x: 126, y: 46, r: 4 },
  { x: 19, y: 100, r: 4 }, { x: 41, y: 120, r: 4 },
];

// ---------------------------------------------------------------------------------------------------------------
// Entidades (dono = índice do início; uma tag por entidade, como pede a §5.0)
// ---------------------------------------------------------------------------------------------------------------
function entities(): MapEntity[] {
  const u = (type: string, owner: number, x: number, y: number, tag?: string): MapEntity => (tag ? { kind: 'unit', type, owner, x, y, tag } : { kind: 'unit', type, owner, x, y });
  const b = (type: string, owner: number, x: number, y: number, tag?: string, complete = true): MapEntity => ({ kind: 'building', type, owner, x, y, ...(complete ? {} : { complete: false }), ...(tag ? { tag } : {}) });
  const out: MapEntity[] = [
    // a Nova Argos (jogador 0): CC centrado no início [24,24], Templo, Academia, a Fortaleza em obra e 4 Casas (a população
    // dos 15 cidadãos e dos três heróis não cabe só no CC)
    b('town_center', 0, 23, 23), b('temple', 0, 17, 18), b('academy', 0, 28, 18), b('fortress', 0, 29, 27, undefined, false),
    b('house', 0, 17, 23), b('house', 0, 17, 26), b('house', 0, 20, 29), b('house', 0, 23, 30),
    // as torres das três passagens da escarpa (do lado de dentro): a rampa do sudeste, a passagem do sul e a do leste
    b('tower', 0, 36, 35, 'torre_rampa'), b('tower', 0, 18, 40, 'torre_sul'), b('tower', 0, 41, 19, 'torre_leste'),
    // o Culto (jogador 3): o Trono de Cronos na Estrada do Trono, duas torres na saída e os três Altares da Foice no Campo
    b('fortress', 3, POINTS.throne[0], POINTS.throne[1], 'trono'),
    b('tower', 3, 97, 42, 'torre_trono1'), b('tower', 3, 104, 42, 'torre_trono2'),
    ...POINTS.altars.map(([x, y], k) => b('temple', 3, x - 1, y - 1, `foice${k + 1}`)),
    // as sentinelas da Foice: três estátuas guardiãs (imóveis; a IA do Culto não as leva embora) em volta de cada Altar
    ...POINTS.altars.flatMap(([x, y]) => [u('sentinel', 3, x, y - 3), u('sentinel', 3, x - 3, y + 2), u('sentinel', 3, x + 3, y + 2)]),
    // os heróis que vieram de Argos (Perseu nasce do setup)
    u('odysseus', 0, 27, 25, 'odisseu'), u('heracles', 0, 27, 26, 'heracles'),
  ];
  // 15 cidadãos em três fileiras ao norte e a oeste do CC
  for (let k = 0; k < 5; k++) out.push(u('villager', 0, 21 + k, 21), u('villager', 0, 21 + k, 27), u('villager', 0, 21, 22 + k));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Montagem pelo pipeline do editor
// ---------------------------------------------------------------------------------------------------------------

/** Gera o mapa canônico (saveMap). Determinístico: mesma saída a cada chamada. */
export function buildThessalyMap(): FixedMapData {
  const blank = blankMap(W, H, STARTS.length, SEED);
  const state = createGame({ seed: 1, mapSize: 'medium', map: { ...blank, starts: STARTS.map(([x, y]) => [x, y]), startKit: false, relics: false }, players: [
    { name: 'Exilados de Argos', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 },
    { name: 'Hades', god: 'hades', isAI: false, difficulty: 'normal', team: 0 },
    { name: 'Poseidon', god: 'poseidon', isAI: false, difficulty: 'normal', team: 0 },
    { name: 'Culto de Cronos', god: 'hades', isAI: false, difficulty: 'normal', team: 1 },
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
  // 2) terra firme fora da região principal (a do Campo) vira montanha: sem bolsões soltos de ruído
  const [ax, ay] = POINTS.field;
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
    const at = e.kind === 'unit' ? nearestFreeTile(map, e.x, e.y, 6) : { x: e.x, y: e.y };
    if (!at) throw new Error(`sem espaço para ${e.type} em (${e.x}, ${e.y})`);
    applyEditOp(state, { kind: 'placeEntity', entity: { ...e, x: at.x, y: at.y } }, tags);
  }
  for (const e of ents) if (e.kind === 'building' && ![...state.buildings.values()].some((b) => b.tx === e.x && b.ty === e.y && b.type === e.type)) throw new Error(`edifício ${e.type} não coube em (${e.x}, ${e.y})`);
  // 4) recursos em grupos sorteados por RNG de semente fixa, só em terra livre, fora das zonas reservadas, das estradas e do
  //    3×3 do CC do kit dos inícios 1–3 (e da fileira dos cidadãos dele), sem criar bolsões
  const rng = new RNG(SEED);
  const kitStarts = STARTS.slice(1);
  const reserved = (x: number, y: number) => KEEP_OUT.some((k) => (x - k.x) * (x - k.x) + (y - k.y) * (y - k.y) <= k.r * k.r)
    || ROADS.some((r) => trailDist(r, x, y) <= 2.5)
    || kitStarts.some(([sx, sy]) => Math.abs(sx - x) <= 5 && Math.abs(sy - y) <= 5)
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
    if (type === 'tree' && map.terrain[y * W + x] === TERRAIN.SAND) return false;   // nada de árvore na praia
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
  // bosques ao pé das montanhas (ruído), longe das estradas, das passagens e do Campo (passagens sempre livres)
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
  // 5) inícios (a partida em branco já tem os quatro; setStart grava as posições exatas)
  STARTS.forEach(([x, y], index) => applyEditOp(state, { kind: 'setStart', index, x, y }));
  return saveMap(state, {
    id: 'm12_titanomaquia', name: 'Planície da Tessália', nameEn: 'Plain of Thessaly', author: 'Age of Earth',
    description: 'Missão 12 (O Fim da Idade de Ouro): a Nova Argos na encosta do Olimpo a noroeste, o Monte Ótris e o Trono de Cronos a nordeste, além do esporão do Ossa; a caverna de Hades a sudoeste, a costa de Poseidon a sudeste e, no meio da planície, o Campo da Titanomaquia com os três Altares da Foice.',
    startKit: false, relics: false,
  }, (id) => tags.get(id));
}

/** Validação do mapa como a missão o usa (4 jogadores). */
export function thessalyIssues(data: FixedMapData): MapIssue[] { return validateMap(data, { players: 4 }); }

/** O mapa em texto (1 caractere a cada 2×2 tiles): ^ montanha, ~ água, . terra, , areia, espaço grama, T bosque, $ ouro, # edifício. */
export function asciiMap(data: FixedMapData): string {
  const state = createGame({ seed: 1, mapSize: 'medium', map: data, players: [
    { name: 'a', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'b', god: 'hades', isAI: false, difficulty: 'normal', team: 0 },
    { name: 'c', god: 'poseidon', isAI: false, difficulty: 'normal', team: 0 }, { name: 'd', god: 'hades', isAI: false, difficulty: 'normal', team: 1 },
  ], startKit: [false, true, true, true], mode: 'conquest' });
  const m = state.map;
  const lines: string[] = [];
  for (let y = 0; y < H; y += 2) {
    let s = '';
    for (let x = 0; x < W; x += 2) {
      let c = ' ';
      const cells = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
      const ts = cells.map(([a, b]) => m.terrain[b * W + a]);
      if (cells.some(([a, b]) => m.buildingAt[b * W + a] !== -1)) c = '#';
      else if (cells.some(([a, b]) => { const n = m.nodes.get(m.nodeAt[b * W + a]); return n && n.type === 'gold'; })) c = '$';
      else if (cells.some(([a, b]) => { const n = m.nodes.get(m.nodeAt[b * W + a]); return n && n.type !== 'tree'; })) c = '*';
      else if (cells.some(([a, b]) => m.nodeAt[b * W + a] !== -1)) c = 'T';
      else if (ts.filter((t) => t === TERRAIN.MOUNTAIN).length >= 2) c = '^';
      else if (ts.filter((t) => t === TERRAIN.WATER || t === TERRAIN.DEEP).length >= 2) c = '~';
      else if (ts.filter((t) => t === TERRAIN.DIRT).length >= 2) c = '.';
      else if (ts.filter((t) => t === TERRAIN.SAND).length >= 2) c = ',';
      s += c;
    }
    lines.push(s);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// Linha de comando
// ---------------------------------------------------------------------------------------------------------------
const SCENARIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/core/scenario/missions/m12_titanomaquia.scenario.json');

function main(): void {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const data = buildThessalyMap();
  const issues = thessalyIssues(data);
  const errors = issues.filter((i) => i.level === 'error');
  const json = JSON.stringify(data);
  console.log(`Planície da Tessália ${data.w}x${data.h} · ${data.starts.length} inícios · ${data.nodes.length} nós · ${data.entities?.length ?? 0} entidades · ${json.length} bytes · hash #${mapHash(data).toString(16)} · ${errors.length} erro(s), ${issues.length - errors.length} aviso(s)`);
  for (const i of issues) console.log(`  ${i.level === 'error' ? 'ERRO ' : 'aviso'} ${i.code}${i.x !== undefined ? ` (${i.x}, ${i.y})` : ''}${i.params ? ' ' + JSON.stringify(i.params) : ''}`);
  if (args.includes('--ascii')) console.log(asciiMap(data));
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
