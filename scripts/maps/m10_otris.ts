// Mapa fixo da missão m10 "O Cerco de Ótris" (docs/STORY.md §5.7): "Monte Ótris", 144×144, norte no alto.
// Reprodutível: terreno por primitivas (bandas de escarpa, elipses e trilhas) com bordas de ruído de semente fixa (makeNoise/RNG
// do núcleo, nada de aleatoriedade nativa), aplicado com as MESMAS operações puras do editor (src/editor/ops.ts: paint,
// addNode, placeEntity com tag, setStart) numa partida em branco, e salvo por saveMap (forma canônica). O arquivo sai embutido
// em map.data de src/core/scenario/missions/m10_otris.scenario.json.
//
// Uso:
//   npx tsx scripts/maps/m10_otris.ts            confere: o mapa embutido no cenário é idêntico ao gerado (sai 1 se não)
//   npx tsx scripts/maps/m10_otris.ts --write    grava o mapa gerado em map.data do cenário
//   npx tsx scripts/maps/m10_otris.ts --out f.map.json   grava também o .map.json avulso (npm run map:check f.map.json)
//
// Relevo e pontos (coordenadas em tiles, como na ficha):
//   norte     o Monte Ótris: um platô cercado de escarpas (a moldura ao norte, as encostas oeste x ≤ 37 e leste x ≥ 107 e a
//             escarpa sul, linhas 51–55). A escarpa sul só se sobe pela rampa do meio (x 70–74), fechada pelo ANEL EXTERNO:
//             muralha do Culto na linha 52; o Portão de Bronze em [72,52] é posto pelo cenário (place com nome, G8), um bloco
//             lacrado que não abre nem para o Culto ("o Culto se trancou no Monte Ótris"). Dentro, o pátio da cidadela
//             (linhas 30–50): o CC do Culto (início 2 = [72,32]), Templo, Quartéis, Estábulo, Academia, Oficina de Cerco,
//             8 Casas, 6 torres e 15 cidadãos, com ouro e bosques nos cantos. Acima do pátio, o santuário num terraço mais alto
//             (x 50–94, linhas 3–26), fechado por cristas (x 46–49 e 95–98) e pela crista sul (linhas 27–29), que só se
//             atravessa pela abertura do meio (x 70–74) — o ANEL INTERNO: muralha na linha 28 com o portão interno
//             (tag portao_interno) em [72,28]. No santuário, os três Pilares do Tempo (Fortalezas do Culto, uma tag por
//             pilar: pilar1 [60,24], pilar2 [84,24], pilar3 [72,14]) e o início 3 = [72,8] das Sentinelas (a ficha pedia
//             [72,6], mas a margem mínima de um início é 8 tiles da borda);
//   centro    a planície da Ftiótida e o Altar do Tempo (a colina do Rei da Colina, koth [72,80]): uma clareira de terra
//             batida cercada de seis pedras eretas; a Via dos Titãs sobe do altar até o Portão de Bronze;
//   sudoeste  o acampamento de Argos (início 0 = [24,120], com kit), com a Oficina de Cerco do mapa;
//   sudeste   o acampamento de Hades (início 1 = [120,120], com kit);
//   flancos   as encostas florestadas do Ótris, a oeste e a leste do platô (fora das muralhas), com ouro.
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
const SEED = 1010;   // ruído das bordas e sorteio dos recursos

/** Pontos nomeados da ficha (tiles). */
export const POINTS = {
  argos: [24, 120], hades: [120, 120], cult: [72, 32], sentinels: [72, 8],
  altar: [72, 80], licaon: [72, 20],
  /** anel externo: linha da muralha e a rampa (x inicial e final); o Portão de Bronze no meio */
  outerRow: 52, ramp: [70, 74], bronzeGate: [72, 52],
  /** anel interno: linha da muralha na crista sul do santuário e a abertura; o portão interno no meio */
  innerRow: 28, opening: [70, 74], innerGate: [72, 28],
  /** os três Pilares do Tempo (centro de cada Fortaleza 4×4) */
  pillars: [[60, 24], [84, 24], [72, 14]],
  /** o pé da rampa, do lado de fora (referência da planície) e o meio do pátio da cidadela */
  rampFoot: [72, 58], bailey: [72, 42], sanctum: [72, 20],
} as const;
const STARTS: [number, number][] = [[24, 120], [120, 120], [72, 32], [72, 8]];
/** Escarpas do platô: encostas oeste/leste (até a linha 55) e a escarpa sul (linhas 51–55). */
const PLATEAU = { west: [32, 37], east: [107, 112], south: [51, 55], bottom: 55 } as const;
/** Cristas do santuário: oeste/leste (linhas 3–29) e a crista sul (linhas 27–29). */
const SANCTUM = { west: [46, 49], east: [95, 98], south: [27, 29] } as const;

type Pt = [number, number];
interface Area { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; jitter: number }
interface Trail { kind: 'trail'; pts: Pt[]; width: number; jitter: number }

// ---------------------------------------------------------------------------------------------------------------
// Relevo
// ---------------------------------------------------------------------------------------------------------------

/** Morros da planície (montanha). */
const HILLS: (Area | Trail)[] = [
  { kind: 'ellipse', cx: 44, cy: 74, rx: 5, ry: 3.5, jitter: 0.3 },
  { kind: 'ellipse', cx: 100, cy: 74, rx: 5, ry: 3.5, jitter: 0.3 },
  { kind: 'ellipse', cx: 72, cy: 116, rx: 6, ry: 3, jitter: 0.3 },
  { kind: 'ellipse', cx: 16, cy: 88, rx: 4, ry: 3, jitter: 0.3 },
  { kind: 'ellipse', cx: 128, cy: 88, rx: 4, ry: 3, jitter: 0.3 },
];
/** As seis pedras eretas em volta do Altar do Tempo (um tile de montanha cada, a ~9 tiles do centro). */
export const STONES: Pt[] = [[81, 80], [63, 80], [77, 72], [67, 72], [77, 88], [67, 88]];

/** Estradas: dos acampamentos ao altar e a Via dos Titãs do altar até o Portão de Bronze. */
const ROADS: Trail[] = [
  { kind: 'trail', pts: [[27, 116], [40, 104], [56, 90], [66, 84]], width: 3, jitter: 0.6 },
  { kind: 'trail', pts: [[117, 116], [104, 104], [88, 90], [78, 84]], width: 3, jitter: 0.6 },
  { kind: 'trail', pts: [[72, 72], [72, 62], [72, 53]], width: 4, jitter: 0.4 },
  { kind: 'trail', pts: [[30, 121], [72, 124], [114, 121]], width: 3, jitter: 0.6 },
];

/** Terra batida: o pátio e o santuário da cidadela, a clareira do altar, os acampamentos e as estradas. */
const DIRT: (Area | Trail)[] = [
  { kind: 'ellipse', cx: 72, cy: 40, rx: 30, ry: 10, jitter: 0.12 },
  { kind: 'ellipse', cx: 72, cy: 16, rx: 20, ry: 11, jitter: 0.12 },
  { kind: 'ellipse', cx: 72, cy: 80, rx: 7.5, ry: 7.5, jitter: 0.1 },
  { kind: 'ellipse', cx: 24, cy: 120, rx: 8, ry: 7, jitter: 0.2 },
  { kind: 'ellipse', cx: 120, cy: 120, rx: 8, ry: 7, jitter: 0.2 },
  ...ROADS,
];
/** Areia: o lajedo em volta da clareira do altar. */
const SAND: Area[] = [{ kind: 'ellipse', cx: 72, cy: 80, rx: 10.5, ry: 10.5, jitter: 0.15 }];

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

/** Coluna na rampa do anel externo? */
export function inRamp(x: number): boolean { return x >= POINTS.ramp[0] && x <= POINTS.ramp[1]; }
/** Coluna na abertura do anel interno? */
export function inOpening(x: number): boolean { return x >= POINTS.opening[0] && x <= POINTS.opening[1]; }

/** Terreno por tile (TERRAIN.*), antes da água profunda. */
function buildTerrain(): Uint8Array {
  const edge = makeNoise(SEED), frame = makeNoise(SEED + 43), cliff = makeNoise(SEED + 59);
  const t = new Uint8Array(W * H).fill(TERRAIN.GRASS);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const n = edge.fbm(x * 0.2, y * 0.2, 3);
    // moldura: montanha nas quatro bordas (mais grossa ao norte, o cume do Ótris)
    const f = frame.fbm(x * 0.1, y * 0.1, 2);
    const west = x < 3 + Math.round(f * 3), east = x > W - 4 - Math.round(f * 3), south = y > H - 4 - Math.round(f * 3), north = y < 3 + Math.round(f * 2);
    let tt: number = TERRAIN.GRASS;
    if (west || east || south || north || HILLS.some((a) => inArea(a, x, y, n))) tt = TERRAIN.MOUNTAIN;
    // escarpas do platô: o lado de dentro é reto (a cidadela é fechada), o de fora engrossa com o ruído (0 a 2 tiles)
    const grow = Math.max(0, Math.round((cliff.noise(x * 0.15, y * 0.15) - 0.5) * 5));
    if (y <= PLATEAU.bottom) {
      if (x >= PLATEAU.west[0] - grow && x <= PLATEAU.west[1]) tt = TERRAIN.MOUNTAIN;
      if (x >= PLATEAU.east[0] && x <= PLATEAU.east[1] + grow) tt = TERRAIN.MOUNTAIN;
    }
    if (x >= PLATEAU.west[0] && x <= PLATEAU.east[1] && !inRamp(x) && y >= PLATEAU.south[0] && y <= PLATEAU.south[1] + grow) tt = TERRAIN.MOUNTAIN;
    // cristas do santuário (retas: o terraço só se abre pela abertura do anel interno)
    if (y >= 3 && y <= SANCTUM.south[1]) {
      if (x >= SANCTUM.west[0] && x <= SANCTUM.west[1]) tt = TERRAIN.MOUNTAIN;
      if (x >= SANCTUM.east[0] && x <= SANCTUM.east[1]) tt = TERRAIN.MOUNTAIN;
    }
    if (x >= SANCTUM.west[0] && x <= SANCTUM.east[1] && y >= SANCTUM.south[0] && y <= SANCTUM.south[1] && !inOpening(x)) tt = TERRAIN.MOUNTAIN;
    // chão: dentro da cidadela, grama com a terra batida do pátio e do santuário; fora, a terra das estradas e da clareira
    // do altar e o lajedo de areia em volta dela
    const inside = x > PLATEAU.west[1] && x < PLATEAU.east[0] && y < PLATEAU.south[0];
    if (tt !== TERRAIN.MOUNTAIN) {
      if (DIRT.some((a) => inArea(a, x, y, n))) tt = TERRAIN.DIRT;
      else if (!inside && SAND.some((a) => inArea(a, x, y, n))) tt = TERRAIN.SAND;
    }
    // a rampa e a abertura são terra batida de ponta a ponta (a muralha fecha exatamente a largura delas)
    if (inRamp(x) && y >= PLATEAU.south[0] - 1 && y <= PLATEAU.south[1] + 1) tt = TERRAIN.DIRT;
    if (inOpening(x) && y >= SANCTUM.south[0] - 1 && y <= SANCTUM.south[1] + 1) tt = TERRAIN.DIRT;
    if (STONES.some(([sx, sy]) => sx === x && sy === y)) tt = TERRAIN.MOUNTAIN;
    t[i] = tt;
  }
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// Recursos
// ---------------------------------------------------------------------------------------------------------------
type Cluster = { type: NodeType; x: number; y: number; n: number; r: number; amount?: number };
const CLUSTERS: Cluster[] = [
  // Argos (sudoeste)
  { type: 'berry', x: 17, y: 126, n: 6, r: 1.6 }, { type: 'deer', x: 32, y: 130, n: 4, r: 1.8 }, { type: 'boar', x: 12, y: 112, n: 2, r: 1.2 },
  { type: 'gold', x: 12, y: 122, n: 4, r: 1.2 }, { type: 'gold', x: 36, y: 108, n: 4, r: 1.2 },
  { type: 'tree', x: 8, y: 132, n: 12, r: 3 }, { type: 'tree', x: 22, y: 136, n: 10, r: 2.8 }, { type: 'tree', x: 10, y: 102, n: 10, r: 2.8 },
  // Hades (sudeste)
  { type: 'berry', x: 127, y: 126, n: 6, r: 1.6 }, { type: 'deer', x: 112, y: 130, n: 4, r: 1.8 }, { type: 'boar', x: 132, y: 112, n: 2, r: 1.2 },
  { type: 'gold', x: 132, y: 122, n: 4, r: 1.2 }, { type: 'gold', x: 108, y: 108, n: 4, r: 1.2 },
  { type: 'tree', x: 136, y: 132, n: 12, r: 3 }, { type: 'tree', x: 122, y: 136, n: 10, r: 2.8 }, { type: 'tree', x: 134, y: 102, n: 10, r: 2.8 },
  // a cidadela: ouro nos cantos do pátio, bosques nas encostas de dentro, frutas; ouro e bosque nos bolsões ao lado do santuário
  { type: 'gold', x: 42, y: 40, n: 4, r: 1.2 }, { type: 'gold', x: 102, y: 40, n: 4, r: 1.2 },
  { type: 'berry', x: 50, y: 46, n: 5, r: 1.5 }, { type: 'berry', x: 94, y: 46, n: 5, r: 1.5 },
  { type: 'tree', x: 41, y: 14, n: 12, r: 3 }, { type: 'tree', x: 103, y: 14, n: 12, r: 3 },
  { type: 'tree', x: 40, y: 48, n: 6, r: 2 }, { type: 'tree', x: 104, y: 48, n: 6, r: 2 },
  { type: 'gold', x: 55, y: 7, n: 3, r: 1 }, { type: 'gold', x: 89, y: 7, n: 3, r: 1 },
  // flancos do Ótris (fora das muralhas): bosques e ouro
  { type: 'tree', x: 16, y: 30, n: 14, r: 4 }, { type: 'tree', x: 128, y: 30, n: 14, r: 4 },
  { type: 'gold', x: 20, y: 48, n: 4, r: 1.3 }, { type: 'gold', x: 124, y: 48, n: 4, r: 1.3 },
  // planície: ouro disputado perto do altar, bosques e caça
  { type: 'gold', x: 56, y: 94, n: 4, r: 1.3 }, { type: 'gold', x: 88, y: 94, n: 4, r: 1.3 },
  { type: 'tree', x: 30, y: 84, n: 12, r: 3 }, { type: 'tree', x: 114, y: 84, n: 12, r: 3 },
  { type: 'tree', x: 50, y: 64, n: 8, r: 2.4 }, { type: 'tree', x: 94, y: 64, n: 8, r: 2.4 },
  { type: 'tree', x: 48, y: 128, n: 8, r: 2.4 }, { type: 'tree', x: 96, y: 128, n: 8, r: 2.4 },
  { type: 'deer', x: 60, y: 104, n: 4, r: 2 }, { type: 'deer', x: 84, y: 104, n: 4, r: 2 },
  { type: 'boar', x: 38, y: 94, n: 2, r: 1.2 }, { type: 'boar', x: 106, y: 94, n: 2, r: 1.2 },
];

// Zonas sem recursos: os acampamentos, a cidadela (edifícios, rampa, abertura), a clareira do altar e a Via dos Titãs.
const KEEP_OUT: { x: number; y: number; r: number }[] = [
  { x: 24, y: 120, r: 7 }, { x: 120, y: 120, r: 7 }, { x: 30, y: 114, r: 4 },
  { x: 72, y: 80, r: 11 }, { x: 72, y: 56, r: 6 }, { x: 72, y: 28, r: 5 },
];

// ---------------------------------------------------------------------------------------------------------------
// Entidades (dono = índice do início; uma tag por entidade, como pede a §5.0; cada anel de muralha é um grupo por tag repetida, G5)
// ---------------------------------------------------------------------------------------------------------------

/** Canto (tx, ty) de cada Pilar do Tempo (Fortaleza 4×4 centrada no ponto da ficha). */
export const PILLAR_CORNERS: Pt[] = POINTS.pillars.map(([x, y]) => [x - 2, y - 2]);

function entities(): MapEntity[] {
  const u = (type: string, owner: number, x: number, y: number, tag?: string): MapEntity => (tag ? { kind: 'unit', type, owner, x, y, tag } : { kind: 'unit', type, owner, x, y });
  const b = (type: string, owner: number, x: number, y: number, tag?: string): MapEntity => (tag ? { kind: 'building', type, owner, x, y, tag } : { kind: 'building', type, owner, x, y });
  const out: MapEntity[] = [
    // Argos (jogador 0): a Oficina de Cerco do acampamento (o CC vem do kit)
    b('siege_workshop', 0, 29, 112),
    // o Culto (jogador 2): CC centrado no início [72,32], Templo, 2 Quartéis, Estábulo, Academia, Oficina de Cerco e 8 Casas
    b('town_center', 2, 71, 31), b('temple', 2, 56, 33), b('barracks', 2, 85, 33), b('barracks', 2, 85, 40), b('stable', 2, 56, 40),
    b('academy', 2, 78, 44), b('siege_workshop', 2, 63, 44),
    b('house', 2, 63, 36), b('house', 2, 66, 36), b('house', 2, 76, 36), b('house', 2, 79, 36),
    b('house', 2, 63, 39), b('house', 2, 66, 39), b('house', 2, 76, 39), b('house', 2, 79, 39),
    // torres: quatro atrás do Portão de Bronze (em duas linhas) e duas ao lado do portão interno
    b('tower', 2, 68, 49), b('tower', 2, 76, 49), b('tower', 2, 65, 47), b('tower', 2, 79, 47), b('tower', 2, 67, 31), b('tower', 2, 77, 31),
    // os três Pilares do Tempo (uma tag por pilar)
    b('fortress', 2, PILLAR_CORNERS[0][0], PILLAR_CORNERS[0][1], 'pilar1'),
    b('fortress', 2, PILLAR_CORNERS[1][0], PILLAR_CORNERS[1][1], 'pilar2'),
    b('fortress', 2, PILLAR_CORNERS[2][0], PILLAR_CORNERS[2][1], 'pilar3'),
  ];
  // anel externo: muralha na linha 52 de ponta a ponta da rampa; o vão do meio é o Portão de Bronze, que o cenário põe (place com nome)
  for (let x: number = POINTS.ramp[0]; x <= POINTS.ramp[1]; x++) if (x !== POINTS.bronzeGate[0]) out.push(b('wall', 2, x, POINTS.outerRow, 'muralha_externa'));
  // anel interno: muralha na linha 28 fechando a abertura da crista do santuário, com o portão interno no meio
  for (let x: number = POINTS.opening[0]; x <= POINTS.opening[1]; x++) out.push(x === POINTS.innerGate[0] ? b('gate', 2, x, POINTS.innerRow, 'portao_interno') : b('wall', 2, x, POINTS.innerRow, 'muralha_interna'));
  // 15 cidadãos do Culto em duas fileiras ao sul do CC
  for (let k = 0; k < 8; k++) out.push(u('villager', 2, 68 + k, 34));
  for (let k = 0; k < 7; k++) out.push(u('villager', 2, 69 + k, 43));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Montagem pelo pipeline do editor
// ---------------------------------------------------------------------------------------------------------------

/** Gera o mapa canônico (saveMap). Determinístico: mesma saída a cada chamada. */
export function buildOthrysMap(): FixedMapData {
  const blank = blankMap(W, H, STARTS.length, SEED);
  const state = createGame({ seed: 1, mapSize: 'medium', map: { ...blank, starts: STARTS.map(([x, y]) => [x, y]), startKit: false, relics: false }, players: [
    { name: 'Argos', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 },
    { name: 'Hades', god: 'hades', isAI: false, difficulty: 'normal', team: 0 },
    { name: 'Culto de Cronos', god: 'hades', isAI: false, difficulty: 'normal', team: 1 },
    { name: 'Sentinelas de Ótris', god: 'hades', isAI: false, difficulty: 'normal', team: 1 },
  ], mode: 'conquest' });
  const tags: TagMap = new Map();
  const map = state.map;
  // 1) terreno: um traço de pincel por tipo
  const terrain = buildTerrain();
  for (const kind of [TERRAIN.MOUNTAIN, TERRAIN.DIRT, TERRAIN.SAND]) {
    const tiles: number[] = [];
    for (let i = 0; i < terrain.length; i++) if (terrain[i] === kind) tiles.push(i);
    if (tiles.length) applyEditOp(state, { kind: 'paint', tiles, terrain: kind });
  }
  // 2) terra firme fora da região principal (a da planície, que alcança a cidadela pela rampa ainda aberta) vira montanha
  const [ax, ay] = POINTS.rampFoot;
  const main = componentAt(map, ax, ay);
  const orphan: number[] = [];
  for (let i = 0; i < W * H; i++) {
    const t = map.terrain[i];
    if (t === TERRAIN.MOUNTAIN || t === TERRAIN.WATER || t === TERRAIN.DEEP) continue;
    if (componentAt(map, i % W, (i - (i % W)) / W) !== main) orphan.push(i);
  }
  if (orphan.length) applyEditOp(state, { kind: 'paint', tiles: orphan, terrain: TERRAIN.MOUNTAIN });
  // 3) recursos em grupos sorteados por RNG de semente fixa, só em terra livre, fora das zonas reservadas, das estradas e da
  //    cidadela construída, sem criar bolsões (um nó que isole algum tile vizinho da região principal é desfeito na hora).
  //    Vêm antes das entidades para que a muralha feche a cidadela só no fim (a checagem de bolsão usa a região única).
  const ents = entities();
  const footprint = (x: number, y: number) => ents.some((e) => {
    if (e.kind === 'unit') return Math.abs(e.x - x) <= 1 && Math.abs(e.y - y) <= 1;
    const sz = e.type === 'fortress' ? 4 : e.type === 'house' ? 2 : e.type === 'wall' || e.type === 'gate' || e.type === 'tower' ? 1 : 3;
    return x >= e.x - 1 && x <= e.x + sz && y >= e.y - 1 && y <= e.y + sz;
  });
  const rng = new RNG(SEED);
  const reserved = (x: number, y: number) => KEEP_OUT.some((k) => (x - k.x) * (x - k.x) + (y - k.y) * (y - k.y) <= k.r * k.r)
    || ROADS.some((r) => trailDist(r, x, y) <= 2.5)
    || (inRamp(x) && y >= PLATEAU.south[0] - 3 && y <= PLATEAU.south[1] + 3)
    || (inOpening(x) && y >= SANCTUM.south[0] - 3 && y <= SANCTUM.south[1] + 3)
    || footprint(x, y);
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
  // bosques ao pé das montanhas da planície e dos flancos (ruído), longe das estradas, da rampa e da clareira do altar
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
    if (STONES.some(([sx, sy]) => Math.abs(sx - x) <= 3 && Math.abs(sy - y) <= 3)) continue;   // as pedras do altar ficam à vista
    let byOther = false;   // árvore colada em ouro/frutas/caça pode cercá-los (nó sem acesso)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const id = map.nodeAt[(y + dy) * W + x + dx]; if (id !== -1 && map.nodes.get(id)?.type !== 'tree') byOther = true; }
    if (!byOther) tryNode('tree', x, y);
  }
  // 4) entidades: edifícios no canto exato (ou erro); unidades no tile livre mais próximo (mesma regra do editor ao abrir um arquivo)
  for (const e of ents) {
    const at = e.kind === 'unit' ? nearestFreeTile(map, e.x, e.y, 6) : { x: e.x, y: e.y };
    if (!at) throw new Error(`sem espaço para ${e.type} em (${e.x}, ${e.y})`);
    applyEditOp(state, { kind: 'placeEntity', entity: { ...e, x: at.x, y: at.y } }, tags);
  }
  // 5) inícios (a partida em branco já tem os quatro; setStart grava as posições exatas)
  STARTS.forEach(([x, y], index) => applyEditOp(state, { kind: 'setStart', index, x, y }));
  return saveMap(state, {
    id: 'm10_otris', name: 'Monte Ótris', nameEn: 'Mount Othrys', author: 'Age of Earth',
    description: 'Missão 10 (O Cerco de Ótris): a cidadela do Culto no platô do Ótris ao norte, com dois anéis de muralha (o Portão de Bronze no externo) e os três Pilares do Tempo no santuário; o Altar do Tempo no meio da planície; Argos a sudoeste e Hades a sudeste.',
    startKit: false, koth: [POINTS.altar[0], POINTS.altar[1]], relics: false,
  }, (id) => tags.get(id));
}

/** Validação do mapa como a missão o usa (4 jogadores, Rei da Colina). */
export function othrysIssues(data: FixedMapData): MapIssue[] { return validateMap(data, { players: 4, mode: 'koth' }); }

// ---------------------------------------------------------------------------------------------------------------
// Linha de comando
// ---------------------------------------------------------------------------------------------------------------
const SCENARIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/core/scenario/missions/m10_otris.scenario.json');

function main(): void {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const data = buildOthrysMap();
  const issues = othrysIssues(data);
  const errors = issues.filter((i) => i.level === 'error');
  const json = JSON.stringify(data);
  console.log(`Monte Ótris ${data.w}x${data.h} · ${data.starts.length} inícios · ${data.nodes.length} nós · ${data.entities?.length ?? 0} entidades · ${json.length} bytes · hash #${mapHash(data).toString(16)} · ${errors.length} erro(s), ${issues.length - errors.length} aviso(s)`);
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
