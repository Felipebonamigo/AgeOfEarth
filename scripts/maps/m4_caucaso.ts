// Mapa fixo da missão m4 "O Fogo do Cáucaso" (docs/STORY.md §5.1): "Garganta do Cáucaso", 96×144, norte no alto.
// Reprodutível: terreno por primitivas (elipses e trilhas) com bordas de ruído de semente fixa (makeNoise/RNG do núcleo,
// nada de aleatoriedade nativa), aplicado com as MESMAS operações puras do editor (src/editor/ops.ts: paint, addNode,
// placeEntity com tag, setStart) numa partida em branco, e salvo por saveMap (forma canônica). O arquivo sai embutido em
// map.data de src/core/scenario/missions/m4_caucaso.scenario.json (o cenário é a fonte que o jogo importa).
//
// Uso:
//   npx tsx scripts/maps/m4_caucaso.ts            confere: o mapa embutido no cenário é idêntico ao gerado (sai 1 se não)
//   npx tsx scripts/maps/m4_caucaso.ts --write    grava o mapa gerado em map.data do cenário
//   npx tsx scripts/maps/m4_caucaso.ts --out f.map.json   grava também o .map.json avulso (npm run map:check f.map.json)
//
// Relevo e pontos (coordenadas em tiles, como na ficha):
//   sul      praia de desembarque (início 0 = [48,135]; a ficha pedia [48,136], mas a margem mínima de início é 8 tiles
//            da borda: 143 - 8 = 135) com água funda ao sul; Héracles + 6 hipaspistas + 4 arqueiros cretenses +
//            5 cidadãos + 1 petróbolo do jogador 0;
//   centro   Vale da Cólquida (~[48,84], fértil: ouro, bosques, caça, frutas; o CC da colônia vai em [48,84]) e um vale
//            lateral a oeste (~[20,96]) para a 2ª cidade;
//   norte    desfiladeiro em serpentina com 3 platôs: Correntes de Bronze (Torres do jogador 2) corrente1 [28,62],
//            corrente2 [60,46], corrente3 [40,28], com 3/4/5 guardas (grupos guarda1..3, G5); nos platôs 2 e 3 um
//            Santuário (Templo do jogador 2, Hades) projeta território — é ali que há atrito;
//   topo     Rochedo de Prometeu (~[48,13]) cercado de montanha, entrada só pelo platô 3 (início 2 = [52,12], sem kit);
//   nordeste cidade do Culto (início 1 = [82,24]) e a Fortaleza do Passo (fortaleza_culto, canto [74,30]) na saída do
//            passo que desce ao platô 2;
//   leste    ravina oculta do Altar de Hefesto ([88,104]) por uma trilha de 2 tiles desde o vale.
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

export const W = 96, H = 144;
const SEED = 4404;   // ruído das bordas e sorteio dos recursos

/** Pontos nomeados da ficha (tiles). */
export const POINTS = {
  beach: [48, 135], valley: [48, 84], westValley: [20, 96],
  corrente1: [28, 62], corrente2: [60, 46], corrente3: [40, 28],
  rock: [48, 13], prometheus: [48, 14], eagle: [46, 16],
  // onde Prometeu surge ao ser libertado: na descida do platô 3 para o platô 2, rumo à Fortaleza (longe da Águia)
  freed: [56, 41],
  cult: [82, 24], fortress: [74, 30], altar: [88, 104],
} as const;
const STARTS: [number, number][] = [[48, 135], [82, 24], [52, 12]];

type Pt = [number, number];
interface Area { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; jitter: number }
interface Trail { kind: 'trail'; pts: Pt[]; width: number; jitter: number }

// ---------------------------------------------------------------------------------------------------------------
// Relevo: tudo é montanha; as áreas abaixo são escavadas (e depois pintadas de grama/terra/areia).
// ---------------------------------------------------------------------------------------------------------------
const AREAS: (Area | Trail)[] = [
  // praia e subida até o vale
  { kind: 'ellipse', cx: 48, cy: 134, rx: 29, ry: 7, jitter: 0.35 },
  { kind: 'trail', pts: [[48, 130], [45, 121], [50, 111], [48, 99]], width: 10, jitter: 2 },
  // Vale da Cólquida e o vale lateral (2ª cidade), ligados por um passo
  { kind: 'ellipse', cx: 48, cy: 84, rx: 21, ry: 15, jitter: 0.3 },
  { kind: 'ellipse', cx: 19, cy: 96, rx: 10, ry: 9, jitter: 0.3 },
  { kind: 'trail', pts: [[26, 95], [37, 91]], width: 6, jitter: 1 },
  // desfiladeiro: vale → platô 1 → platô 2 → platô 3 → Rochedo
  { kind: 'trail', pts: [[41, 73], [34, 67], [29, 63]], width: 7, jitter: 1.2 },
  { kind: 'ellipse', cx: 28, cy: 62, rx: 8, ry: 6, jitter: 0.25 },
  { kind: 'trail', pts: [[32, 57], [41, 52], [51, 49], [57, 47]], width: 6, jitter: 1 },
  { kind: 'ellipse', cx: 60, cy: 46, rx: 8, ry: 6, jitter: 0.25 },
  { kind: 'trail', pts: [[56, 41], [50, 36], [44, 31]], width: 6, jitter: 1 },
  { kind: 'ellipse', cx: 40, cy: 28, rx: 8, ry: 6, jitter: 0.25 },
  { kind: 'trail', pts: [[42, 24], [45, 20], [47, 17]], width: 4, jitter: 0 },
  { kind: 'ellipse', cx: 48, cy: 13, rx: 7, ry: 4.5, jitter: 0.15 },
  // o passo do platô 2 à Fortaleza e à cidade do Culto
  { kind: 'trail', pts: [[65, 43], [70, 38], [75, 36]], width: 6, jitter: 1 },
  { kind: 'ellipse', cx: 80, cy: 22, rx: 13, ry: 13, jitter: 0.25 },
  { kind: 'ellipse', cx: 85, cy: 39, rx: 8, ry: 6, jitter: 0.25 },
  // a ravina de Hefesto (trilha estreita, sem ruído: 2 tiles)
  { kind: 'trail', pts: [[64, 90], [71, 95], [78, 99], [85, 103]], width: 2.2, jitter: 0 },
  { kind: 'ellipse', cx: 88, cy: 104, rx: 4.5, ry: 4.5, jitter: 0.1 },
];

/** Regiões de terra batida (platôs, trilhas altas, cidade do Culto, ravina); o resto escavado é grama, a praia é areia. */
const DIRT_AREAS: Area[] = [
  { kind: 'ellipse', cx: 28, cy: 62, rx: 9, ry: 7, jitter: 0 }, { kind: 'ellipse', cx: 60, cy: 46, rx: 9, ry: 7, jitter: 0 },
  { kind: 'ellipse', cx: 40, cy: 28, rx: 9, ry: 7, jitter: 0 }, { kind: 'ellipse', cx: 48, cy: 13, rx: 8, ry: 6, jitter: 0 },
  { kind: 'ellipse', cx: 88, cy: 104, rx: 5, ry: 5, jitter: 0 },
];

/** Anéis de bosque (fração do raio da elipse a partir da qual nascem árvores, se o ruído deixar). */
const FOREST_RINGS: { cx: number; cy: number; rx: number; ry: number; from: number }[] = [
  { cx: 48, cy: 84, rx: 21, ry: 15, from: 0.8 },   // Vale da Cólquida
  { cx: 19, cy: 96, rx: 10, ry: 9, from: 0.7 },    // vale lateral
  { cx: 80, cy: 22, rx: 13, ry: 13, from: 0.78 },  // cidade do Culto
  { cx: 85, cy: 39, rx: 8, ry: 6, from: 0.65 },
];

// Zonas sem recursos (espaço de construção e passagem livre): CC da colônia e da 2ª cidade, inícios, entidades.
const KEEP_OUT: { x: number; y: number; r: number }[] = [
  { x: 48, y: 84, r: 8 }, { x: 20, y: 96, r: 5 }, { x: 48, y: 134, r: 5 }, { x: 82, y: 24, r: 9 }, { x: 75, y: 31, r: 4 },
  { x: 28, y: 62, r: 4 }, { x: 60, y: 46, r: 4 }, { x: 40, y: 28, r: 4 }, { x: 48, y: 13, r: 3 }, { x: 52, y: 12, r: 3 }, { x: 88, y: 104, r: 2 },
];

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - a[0]) * vx + (py - a[1]) * vy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (a[0] + vx * t), dy = py - (a[1] + vy * t);
  return Math.sqrt(dx * dx + dy * dy);
}

function inArea(a: Area | Trail, x: number, y: number, n: number): boolean {
  if (a.kind === 'ellipse') {
    const dx = (x - a.cx) / a.rx, dy = (y - a.cy) / a.ry;
    return dx * dx + dy * dy <= 1 + (n - 0.5) * a.jitter * 2;
  }
  let d = Infinity;
  for (let i = 0; i + 1 < a.pts.length; i++) d = Math.min(d, segDist(x, y, a.pts[i], a.pts[i + 1]));
  return d <= a.width / 2 + (n - 0.5) * a.jitter;
}

/** Terreno por tile (TERRAIN.*), antes da água profunda (derivada pelo pincel do editor). */
function buildTerrain(): Uint8Array {
  const edge = makeNoise(SEED), soil = makeNoise(SEED + 17), coast = makeNoise(SEED + 31);
  const t = new Uint8Array(W * H).fill(TERRAIN.MOUNTAIN);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (x < 2 || y < 2 || x > W - 3) continue;   // moldura de montanha
    const n = edge.fbm(x * 0.22, y * 0.22, 3);
    if (!AREAS.some((a) => inArea(a, x, y, n))) continue;
    const beach = inArea(AREAS[0], x, y, n);
    const dirt = DIRT_AREAS.some((a) => inArea(a, x, y, 0.5)) || (!beach && soil.fbm(x * 0.12, y * 0.12, 3) > 0.66);
    t[i] = beach && y > 126 ? TERRAIN.SAND : dirt ? TERRAIN.DIRT : TERRAIN.GRASS;
  }
  // mar ao sul: água funda do litoral para baixo (a costa ondula um pouco); a praia de areia sobe até ele
  for (let x = 0; x < W; x++) {
    const cy = 139 + Math.round((coast.noise(x * 0.18, 3.3) - 0.5) * 3);
    for (let y = cy; y < H; y++) t[y * W + x] = TERRAIN.WATER;
    for (let y = cy - 2; y < cy; y++) if (t[y * W + x] === TERRAIN.MOUNTAIN && x > 10 && x < W - 11) t[y * W + x] = TERRAIN.SAND;
  }
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// Recursos
// ---------------------------------------------------------------------------------------------------------------
type Cluster = { type: NodeType; x: number; y: number; n: number; r: number; amount?: number };
const CLUSTERS: Cluster[] = [
  // praia: frutas e um bosque de pinheiros costeiros (dá para começar a colher antes da colônia, sem ponto de entrega)
  { type: 'berry', x: 38, y: 131, n: 4, r: 1.6 }, { type: 'tree', x: 60, y: 129, n: 12, r: 3 },
  // Vale da Cólquida: fértil
  { type: 'gold', x: 35, y: 79, n: 4, r: 1.4 }, { type: 'gold', x: 61, y: 93, n: 4, r: 1.4 }, { type: 'gold', x: 60, y: 75, n: 3, r: 1.2 },
  { type: 'berry', x: 42, y: 93, n: 6, r: 1.7 }, { type: 'berry', x: 55, y: 77, n: 5, r: 1.6 },
  { type: 'deer', x: 37, y: 95, n: 4, r: 2 }, { type: 'deer', x: 63, y: 83, n: 4, r: 2 }, { type: 'boar', x: 56, y: 97, n: 2, r: 1.2 },
  { type: 'tree', x: 31, y: 86, n: 16, r: 3.6 }, { type: 'tree', x: 65, y: 87, n: 12, r: 3 }, { type: 'tree', x: 45, y: 72, n: 10, r: 3 },
  // vale lateral (2ª cidade)
  { type: 'gold', x: 13, y: 91, n: 4, r: 1.4 }, { type: 'berry', x: 25, y: 101, n: 4, r: 1.5 }, { type: 'deer', x: 15, y: 102, n: 3, r: 1.6 },
  { type: 'tree', x: 11, y: 98, n: 12, r: 3 },
  // desfiladeiro: poucos pinheiros nas bordas dos platôs
  { type: 'tree', x: 22, y: 59, n: 5, r: 2 }, { type: 'tree', x: 66, y: 49, n: 4, r: 1.8 }, { type: 'tree', x: 33, y: 31, n: 4, r: 1.8 },
  // cidade do Culto
  { type: 'gold', x: 89, y: 15, n: 4, r: 1.4 }, { type: 'gold', x: 71, y: 17, n: 3, r: 1.2 }, { type: 'berry', x: 87, y: 31, n: 5, r: 1.6 },
  { type: 'deer', x: 78, y: 13, n: 3, r: 1.6 }, { type: 'tree', x: 75, y: 11, n: 12, r: 3 }, { type: 'tree', x: 91, y: 24, n: 10, r: 2.6 },
  { type: 'tree', x: 88, y: 43, n: 8, r: 2.4 },
  // a forja de Hefesto: ouro em volta do altar
  { type: 'gold', x: 90, y: 101, n: 2, r: 1 }, { type: 'gold', x: 91, y: 106, n: 2, r: 1 },
];

// ---------------------------------------------------------------------------------------------------------------
// Entidades (dono = índice do início; tags da ficha, uma por entidade ou grupo por tag repetida — G5)
// ---------------------------------------------------------------------------------------------------------------
function entities(): MapEntity[] {
  const u = (type: string, owner: number, x: number, y: number, tag?: string): MapEntity => (tag ? { kind: 'unit', type, owner, x, y, tag } : { kind: 'unit', type, owner, x, y });
  const b = (type: string, owner: number, x: number, y: number, tag?: string): MapEntity => (tag ? { kind: 'building', type, owner, x, y, tag } : { kind: 'building', type, owner, x, y });
  const out: MapEntity[] = [
    // jogador 1 (Culto): a Fortaleza do Passo
    b('fortress', 1, 74, 30, 'fortaleza_culto'),
    // jogador 2 (Guardiões): as três Correntes de Bronze (Torres) e os Santuários dos platôs 2 e 3 (território → atrito)
    b('tower', 2, 28, 62, 'corrente1'), b('tower', 2, 60, 46, 'corrente2'), b('tower', 2, 40, 28, 'corrente3'),
    b('temple', 2, 63, 48), b('temple', 2, 34, 27),
    // guardas (3/4/5)
    u('hoplite', 2, 27, 64, 'guarda1'), u('hoplite', 2, 29, 64, 'guarda1'), u('toxotes', 2, 28, 60, 'guarda1'),
    u('hypaspist', 2, 58, 48, 'guarda2'), u('hypaspist', 2, 61, 48, 'guarda2'), u('toxotes', 2, 59, 44, 'guarda2'), u('toxotes', 2, 62, 45, 'guarda2'),
    u('hypaspist', 2, 39, 30, 'guarda3'), u('hypaspist', 2, 41, 30, 'guarda3'), u('hoplite', 2, 42, 29, 'guarda3'), u('toxotes', 2, 38, 27, 'guarda3'), u('toxotes', 2, 41, 26, 'guarda3'),
    // jogador 0 (Argos) na praia: Héracles, 6 hipaspistas, 4 arqueiros cretenses, 5 cidadãos, 1 petróbolo
    u('heracles', 0, 48, 131, 'heracles'),
    u('hypaspist', 0, 45, 130), u('hypaspist', 0, 46, 130), u('hypaspist', 0, 47, 130), u('hypaspist', 0, 49, 130), u('hypaspist', 0, 50, 130), u('hypaspist', 0, 51, 130),
    u('cretan_archer', 0, 46, 132), u('cretan_archer', 0, 47, 132), u('cretan_archer', 0, 49, 132), u('cretan_archer', 0, 50, 132),
    u('villager', 0, 45, 136), u('villager', 0, 46, 137), u('villager', 0, 50, 136), u('villager', 0, 51, 137), u('villager', 0, 52, 136),
    u('petrobolos', 0, 48, 133),
  ];
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Montagem pelo pipeline do editor
// ---------------------------------------------------------------------------------------------------------------

/** Gera o mapa canônico (saveMap). Determinístico: mesma saída a cada chamada. */
export function buildCaucasusMap(): FixedMapData {
  const blank = blankMap(W, H, STARTS.length, SEED);
  const state = createGame({ seed: 1, mapSize: 'medium', map: { ...blank, starts: STARTS.map(([x, y]) => [x, y]), startKit: false, relics: false }, players: [
    { name: 'Argos', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 },
    { name: 'Culto de Cronos', god: 'hades', isAI: false, difficulty: 'normal', team: 1 },
    { name: 'Guardiões do Cáucaso', god: 'hades', isAI: false, difficulty: 'normal', team: 1 },
  ], mode: 'conquest' });
  const tags: TagMap = new Map();
  // 1) terreno: um traço de pincel por tipo (a água profunda é derivada pelo próprio paint)
  const terrain = buildTerrain();
  for (const kind of [TERRAIN.MOUNTAIN, TERRAIN.DIRT, TERRAIN.SAND, TERRAIN.WATER]) {
    const tiles: number[] = [];
    for (let i = 0; i < terrain.length; i++) if (terrain[i] === kind) tiles.push(i);
    if (tiles.length) applyEditOp(state, { kind: 'paint', tiles, terrain: kind });
  }
  // 2) terra firme fora da região da praia vira montanha (sem bolsões soltos de ruído)
  const map = state.map;
  const [bx, by] = STARTS[0];
  const main = componentAt(map, bx, by - 2);
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
  // 4) recursos em grupos sorteados por RNG de semente fixa, só em terra livre, fora das zonas reservadas e sem criar
  //    bolsões (um nó que isole algum tile vizinho da região principal é desfeito na hora)
  const rng = new RNG(SEED);
  const reserved = (x: number, y: number) => KEEP_OUT.some((k) => (x - k.x) * (x - k.x) + (y - k.y) * (y - k.y) <= k.r * k.r)
    || ents.some((e) => e.kind === 'unit' && Math.abs(e.x - x) <= 1 && Math.abs(e.y - y) <= 1);
  const free = (x: number, y: number) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1 && map.blocked[y * W + x] === 0;
  const isolates = (x: number, y: number): boolean => {
    const m = componentAt(map, bx, by - 2);
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
  // bosques nas bordas dos vales e da cidade do Culto (ruído), longe das trilhas (passagens sempre livres)
  const forest = makeNoise(SEED + 101);
  const trails = AREAS.filter((a): a is Trail => a.kind === 'trail');
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const ring = FOREST_RINGS.some((r) => { const dx = (x - r.cx) / r.rx, dy = (y - r.cy) / r.ry; const d = dx * dx + dy * dy; return d >= r.from * r.from && d <= 1.5; });
    if (!ring || forest.fbm(x * 0.16, y * 0.16, 3) < 0.53) continue;
    if (trails.some((t) => { let d = Infinity; for (let i = 0; i + 1 < t.pts.length; i++) d = Math.min(d, segDist(x, y, t.pts[i], t.pts[i + 1])); return d <= t.width / 2 + 2.5; })) continue;
    let byOther = false;   // árvore colada em ouro/frutas/caça pode cercá-los (nó sem acesso)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const id = map.nodeAt[(y + dy) * W + x + dx]; if (id !== -1 && map.nodes.get(id)?.type !== 'tree') byOther = true; }
    if (!byOther) tryNode('tree', x, y);
  }
  // 5) inícios (a partida em branco já tem os três; setStart grava as posições exatas)
  STARTS.forEach(([x, y], index) => applyEditOp(state, { kind: 'setStart', index, x, y }));
  return saveMap(state, {
    id: 'm4_caucaso', name: 'Garganta do Cáucaso', nameEn: 'Caucasus Gorge', author: 'Age of Earth',
    description: 'Missão 4 (O Fogo do Cáucaso): praia ao sul, Vale da Cólquida no centro, desfiladeiro em serpentina com as 3 Correntes, Rochedo de Prometeu no topo, cidade do Culto a nordeste e a ravina de Hefesto a leste.',
    relics: false,
  }, (id) => tags.get(id));
}

/** Validação do mapa como a missão o usa (3 jogadores). */
export function caucasusIssues(data: FixedMapData): MapIssue[] { return validateMap(data, { players: 3 }); }

// ---------------------------------------------------------------------------------------------------------------
// Linha de comando
// ---------------------------------------------------------------------------------------------------------------
const SCENARIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/core/scenario/missions/m4_caucaso.scenario.json');

function main(): void {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const data = buildCaucasusMap();
  const issues = caucasusIssues(data);
  const errors = issues.filter((i) => i.level === 'error');
  const json = JSON.stringify(data);
  console.log(`Garganta do Cáucaso ${data.w}x${data.h} · ${data.starts.length} inícios · ${data.nodes.length} nós · ${data.entities?.length ?? 0} entidades · ${json.length} bytes · hash #${mapHash(data).toString(16)} · ${errors.length} erro(s), ${issues.length - errors.length} aviso(s)`);
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
