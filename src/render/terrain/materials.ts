// Materiais tileáveis do terreno (docs/ART.md §1.7, §3.6) gerados em runtime por ruído determinístico (hash01 → valor
// periódico, fBm, ridged, rachaduras por curvas de nível), sem Math.random: albedo RGB + altura no alfa e normal XYZ + oclusão no alfa, 512²
// (256² no preset baixo), mais o ruído de normais da água e a textura macro (colinas/tom/ruído largo). Também escreve os
// bytes das texturas de dados w×h (pesos de material, tipo/água/manchas secas, dono) a partir de map.terrain/territory —
// funções puras, sem Pixi nem DOM, testadas em tests/terrain-shader.test.ts. O bake em build (page/terrain.js) fica
// para a Etapa 2: quando os PNG existirem, este gerador vira o fallback.
import { TERRAIN } from '../../core/constants';
import { TERRAIN_PALETTE, GRASS_DRY, hash01, dryness } from '../palette';

export type MaterialSize = 256 | 512;
/** Um material: albedo (RGBA, alfa = altura 0..255) e normal (RGBA, xyz em 0..255, alfa = oclusão 0..255). */
export interface MaterialTex { albedo: Uint8Array; normal: Uint8Array }
export interface TerrainMaterials {
  size: MaterialSize;
  grass: MaterialTex; dirt: MaterialTex; sand: MaterialTex; rock: MaterialTex;
  /** Normais da água (RGB) + altura (A), WATER_SIZE², duas camadas animadas no shader. */
  waterNormal: Uint8Array;
  /** Macro MACRO_SIZE²: RG = normal das colinas, B = altura macro (tom/AO), A = ruído largo (grades do bombing, transições). */
  macro: Uint8Array;
  /** Tempo de geração (ms), para o log/QA. */
  ms: number;
}
export const WATER_SIZE = 256;
export const MACRO_SIZE = 256;
/** Tiles cobertos por uma repetição da textura macro no shader (tem de bater com shaders.ts). */
export const MACRO_TILES = 48;

// ---------------- Ruído periódico ----------------
type Octave = readonly [cells: number, amp: number, seed: number];
/**
 * Soma em `out` uma oitava de ruído de valor periódico size² com `cells` células por eixo (interpolação quíntica),
 * multiplicada por `amp`; `ridge` troca o valor n por (1 − |2n − 1|)² (cristas finas). Interpola primeiro a linha de
 * células em y e depois cada pixel em x: 2 leituras por pixel (≈ 3 ns), o que mantém 512² dentro do orçamento.
 */
function addOctave(out: Float32Array, size: number, cellsIn: number, seed: number, amp: number, ridge: boolean): void {
  const cells = Math.max(1, Math.round(cellsIn));
  const lat = new Float32Array(cells * cells);
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) lat[j * cells + i] = hash01(i, j, seed);
  const per = size / cells;
  const i0 = new Int32Array(size), i1 = new Int32Array(size), wt = new Float32Array(size);
  for (let p = 0; p < size; p++) { const f = p / per, i = Math.floor(f), t = f - i; i0[p] = i % cells; i1[p] = (i + 1) % cells; wt[p] = t * t * t * (t * (t * 6 - 15) + 10); }
  const row = new Float32Array(cells);
  for (let y = 0; y < size; y++) {
    const j0 = i0[y] * cells, j1 = i1[y] * cells, ty = wt[y];
    for (let i = 0; i < cells; i++) { const a = lat[j0 + i]; row[i] = a + (lat[j1 + i] - a) * ty; }
    const o = y * size;
    if (ridge) for (let x = 0; x < size; x++) { const a = row[i0[x]]; const v = a + (row[i1[x]] - a) * wt[x]; const r = 1 - Math.abs(2 * v - 1); out[o + x] += r * r * amp; }
    else for (let x = 0; x < size; x++) { const a = row[i0[x]]; out[o + x] += (a + (row[i1[x]] - a) * wt[x]) * amp; }
  }
}
function octaves(size: number, list: readonly Octave[], ridge: boolean): Float32Array {
  const out = new Float32Array(size * size);
  let total = 0;
  for (const [cells, amp, seed] of list) { addOctave(out, size, cells, seed, amp, ridge); total += amp; }
  const k = 1 / total;
  for (let i = 0; i < out.length; i++) out[i] *= k;
  return out;
}
/** Ruído de valor periódico de uma oitava, em [0, 1]. */
const lattice = (size: number, cells: number, seed: number) => octaves(size, [[cells, 1, seed]], false);
/** fBm: soma de oitavas de ruído de valor, normalizada para [0, 1]. */
const fbm = (size: number, list: readonly Octave[]) => octaves(size, list, false);
/** Ridged: 1 − |2n − 1| ao quadrado por oitava (cristas finas), normalizado para [0, 1]. */
const ridged = (size: number, list: readonly Octave[]) => octaves(size, list, true);
/**
 * Rachaduras: linhas de contorno (|n − 0,5| pequeno) de um ruído deformado por outro — curvas fechadas finas que
 * lembram rachaduras/juntas de pedra, a ~1/10 do custo de um Worley. Devolve 0 (nada) … 1 (centro da rachadura).
 */
function cracks(size: number, cells: number, width: number, seed: number): Float32Array {
  const n = fbm(size, [[cells, 1, seed], [cells * 2, 0.5, seed + 1]]);
  const warp = lattice(size, cells * 3, seed + 2);
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) { const d = Math.abs(n[i] + (warp[i] - 0.5) * 0.06 - 0.5); out[i] = d >= width ? 0 : 1 - (d / width) * (d / width); }
  return out;
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, x: number) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
/** Desfoque em caixa separável de raio r (periódico), para a oclusão. */
function blur(h: Float32Array, size: number, r: number): Float32Array {
  const tmp = new Float32Array(size * size), out = new Float32Array(size * size);
  const n = 2 * r + 1, mask = size - 1;   // size é potência de 2
  for (let y = 0; y < size; y++) {
    const row = y * size; let s = 0;
    for (let k = -r; k <= r; k++) s += h[row + (k & mask)];
    for (let x = 0; x < size; x++) { tmp[row + x] = s / n; s += h[row + ((x + r + 1) & mask)] - h[row + ((x - r) & mask)]; }
  }
  for (let x = 0; x < size; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[(k & mask) * size + x];
    for (let y = 0; y < size; y++) { out[y * size + x] = s / n; s += tmp[((y + r + 1) & mask) * size + x] - tmp[((y - r) & mask) * size + x]; }
  }
  return out;
}

// ---------------- Cor ----------------
const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Normal por diferenças centrais (periódica), z para cima, y para baixo (espaço de tela, como uSun); a força é por
 *  texel, e os materiais a escalam por size/512 para o relevo não dobrar no preset baixo (256²); alfa = oclusão (cavidades = altura abaixo da média local). */
function normalMap(h: Float32Array, size: number, strength: number, aoStrength: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const avg = aoStrength > 0 ? blur(h, size, Math.max(2, size >> 6)) : null;
  const mask = size - 1;
  for (let y = 0; y < size; y++) {
    const row = y * size, rm = ((y - 1) & mask) * size, rp = ((y + 1) & mask) * size;
    for (let x = 0; x < size; x++) {
      const i = row + x;
      const dx = (h[row + ((x + 1) & mask)] - h[row + ((x - 1) & mask)]) * strength, dy = (h[rp + x] - h[rm + x]) * strength;
      const l = 127.5 / Math.sqrt(dx * dx + dy * dy + 1);
      const o = i * 4;
      out[o] = (127.5 - dx * l + 0.5) | 0; out[o + 1] = (127.5 - dy * l + 0.5) | 0; out[o + 2] = (127.5 + l + 0.5) | 0;
      out[o + 3] = avg ? (255 * (1 - clamp01((avg[i] - h[i]) * aoStrength)) + 0.5) | 0 : 255;
    }
  }
  return out;
}

function grassMaterial(size: number): MaterialTex {
  const s = size / 128;   // células por tile (1 tile = 128 px a 512²)
  const low = fbm(size, [[2 * s, 1, 101], [4 * s, 0.5, 102], [8 * s, 0.25, 103]]);
  const blades = ridged(size, [[24 * s, 1, 105], [48 * s, 0.6, 106], [96 * s, 0.35, 107]]);
  const patches = fbm(size, [[1.5 * s, 1, 108], [3 * s, 0.5, 109]]);
  const albedo = new Uint8Array(size * size * 4), h = new Float32Array(size * size);
  const base = rgb(TERRAIN_PALETTE[TERRAIN.GRASS]), dark = rgb(0x4a5f28), light = rgb(0x788f3a), dry = rgb(GRASS_DRY);
  for (let i = 0; i < h.length; i++) {
    const b = blades[i], l = low[i];
    h[i] = 0.5 * l + 0.5 * b;
    const t = clamp01(b * 0.8 + l * 0.4 - 0.15);
    const dryK = smooth(0.52, 0.8, patches[i]) * 0.45;
    for (let c = 0; c < 3; c++) {
      let v = lerp(lerp(dark[c], light[c], t), base[c], 0.45);
      v = lerp(v, dry[c], dryK);
      albedo[i * 4 + c] = Math.round(v);
    }
    albedo[i * 4 + 3] = Math.round(h[i] * 255);
  }
  return { albedo, normal: normalMap(h, size, 5 * s / 4, 2.5) };
}

function dirtMaterial(size: number): MaterialTex {
  const s = size / 128;
  const low = fbm(size, [[2 * s, 1, 201], [4 * s, 0.5, 202], [8 * s, 0.25, 203], [32 * s, 0.12, 204]]);
  const cr = cracks(size, 3 * s, 0.014, 205);
  const pebN = lattice(size, Math.round(40 * s), 206), pebSel = lattice(size, Math.round(6 * s), 207);
  const albedo = new Uint8Array(size * size * 4), h = new Float32Array(size * size);
  const dark = rgb(0x6e5533), light = rgb(0x9a7a4c), pebC = rgb(0xa89878), crackC = rgb(0x4f3b22);
  for (let i = 0; i < h.length; i++) {
    const crack = cr[i];
    const pebble = pebSel[i] > 0.45 ? smooth(0.66, 0.8, pebN[i]) : 0;
    h[i] = clamp01(0.55 * low[i] + 0.15 - 0.2 * crack + 0.45 * pebble);
    for (let c = 0; c < 3; c++) {
      let v = lerp(dark[c], light[c], low[i]);
      v = lerp(v, pebC[c], pebble * 0.8);
      v = lerp(v, crackC[c], crack * 0.4);
      albedo[i * 4 + c] = Math.round(v);
    }
    albedo[i * 4 + 3] = Math.round(h[i] * 255);
  }
  return { albedo, normal: normalMap(h, size, 6 * s / 4, 3) };
}

function sandMaterial(size: number): MaterialTex {
  const s = size / 128;
  // Areia: ondulação de baixa frequência (dunas suaves, com deformação larga) + grão fino de amplitude mínima —
  // sem o "papel amassado" do protótipo (§1.7): a altura tem pouca amplitude e quase nenhuma alta frequência.
  const warp = fbm(size, [[1 * s, 1, 301], [2 * s, 0.5, 302]]);
  const low = fbm(size, [[2 * s, 1, 303], [4 * s, 0.4, 304]]);
  const grain = fbm(size, [[64 * s, 1, 305], [128 * s, 0.5, 306]]);
  const albedo = new Uint8Array(size * size * 4), h = new Float32Array(size * size);
  const dark = rgb(0xc4b283), light = rgb(0xdccc9f), base = rgb(TERRAIN_PALETTE[TERRAIN.SAND]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const ph = (y / size) * Math.PI * 2 * 7 + (x / size) * Math.PI * 2 * 1 + warp[i] * 5.5;
    const rip = 0.5 + 0.5 * Math.sin(ph);
    const ripS = rip * rip * (3 - 2 * rip);   // crista mais estreita que o vale
    h[i] = clamp01(0.35 + 0.22 * ripS + 0.18 * (low[i] - 0.5) + 0.05 * (grain[i] - 0.5));
    for (let c = 0; c < 3; c++) {
      let v = lerp(dark[c], light[c], 0.45 + 0.22 * ripS + 0.5 * (low[i] - 0.5));   // ondulação mais no relevo que na cor
      v = lerp(v, base[c], 0.4) + (grain[i] - 0.5) * 8;
      albedo[i * 4 + c] = Math.round(clamp01(v / 255) * 255);
    }
    albedo[i * 4 + 3] = Math.round(h[i] * 255);
  }
  return { albedo, normal: normalMap(h, size, 2.5 * s / 4, 1.5) };
}

function rockMaterial(size: number): MaterialTex {
  const s = size / 128;
  // Rocha: cristas (ridged) em várias escalas + grão fino; fendas quase apagadas (as curvas de nível fortes do protótipo
  // pareciam um mapa topográfico desenhado, não pedra)
  const r = ridged(size, [[1.5 * s, 1, 401], [3 * s, 0.6, 402], [6 * s, 0.35, 403], [12 * s, 0.2, 404]]);
  const low = fbm(size, [[1 * s, 1, 406], [2 * s, 0.5, 407]]);
  const grain = fbm(size, [[24 * s, 1, 409], [48 * s, 0.6, 410]]);
  const cr = cracks(size, 2 * s, 0.008, 408);
  const albedo = new Uint8Array(size * size * 4), h = new Float32Array(size * size);
  const dark = rgb(0x5a5850), light = rgb(0x8f8c83), warm = rgb(0x7f7466), cool = rgb(0x6c7077), base = rgb(TERRAIN_PALETTE[TERRAIN.MOUNTAIN]);
  for (let i = 0; i < h.length; i++) {
    const crack = cr[i];
    h[i] = clamp01(0.6 * r[i] + 0.3 * low[i] + 0.1 * grain[i] - 0.12 * crack);
    for (let c = 0; c < 3; c++) {
      let v = lerp(dark[c], light[c], clamp01(h[i] * 1.1 - 0.05 + (grain[i] - 0.5) * 0.25));
      v = lerp(v, lerp(warm[c], cool[c], low[i]), 0.35);
      v = lerp(v, base[c], 0.2) * (1 - crack * 0.18);
      albedo[i * 4 + c] = (v + 0.5) | 0;
    }
    albedo[i * 4 + 3] = (h[i] * 255 + 0.5) | 0;
  }
  return { albedo, normal: normalMap(h, size, 9 * s / 4, 3.5) };
}

/** Normais da água: fBm de 4 oitavas, RGB = normal, A = altura (espuma/brilho). */
function waterNormal(size: number): Uint8Array {
  const h = fbm(size, [[3, 1, 501], [6, 0.5, 502], [12, 0.25, 503], [24, 0.12, 504]]);
  const n = normalMap(h, size, 6, 0);
  for (let i = 0; i < h.length; i++) n[i * 4 + 3] = Math.round(h[i] * 255);
  return n;
}
/** Macro: RG = normal das colinas (baixa frequência), B = altura macro, A = ruído largo independente. */
function macroTexture(size: number): Uint8Array {
  const h = fbm(size, [[2, 1, 601], [4, 0.5, 602], [8, 0.25, 603]]);
  const wide = fbm(size, [[4, 1, 604], [8, 0.5, 605], [16, 0.25, 606]]);
  const n = normalMap(h, size, 1.2, 0);
  for (let i = 0; i < h.length; i++) { n[i * 4 + 2] = Math.round(h[i] * 255); n[i * 4 + 3] = Math.round(wide[i] * 255); }
  return n;
}

const cache = new Map<number, TerrainMaterials>();
/** Materiais já gerados neste tamanho (null se ainda não). */
export function cachedMaterials(size: MaterialSize): TerrainMaterials | null { return cache.get(size) ?? null; }
/**
 * Gera os materiais em passos (um material por `next()`), para o chamador espalhar o custo de 512² (≈ 250 ms em JS
 * frio) por várias macrotarefas no menu. O resultado final entra no cache. Determinístico.
 */
export function* generateMaterialsLazy(size: MaterialSize = 512): Generator<string, TerrainMaterials, void> {
  const hit = cache.get(size);
  if (hit) return hit;
  // ms = só o tempo de cálculo (as pausas entre os passos, quando o chamador espalha a geração, não contam)
  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
  let ms = 0, t = now();
  const lap = () => { const n = now(); ms += n - t; t = n; };
  const grass = grassMaterial(size); lap(); yield 'grass'; t = now();
  const dirt = dirtMaterial(size); lap(); yield 'dirt'; t = now();
  const sand = sandMaterial(size); lap(); yield 'sand'; t = now();
  const rock = rockMaterial(size); lap(); yield 'rock'; t = now();
  const water = waterNormal(WATER_SIZE), macro = macroTexture(MACRO_SIZE); lap();
  const m: TerrainMaterials = { size, grass, dirt, sand, rock, waterNormal: water, macro, ms };
  cache.set(size, m);
  return m;
}
/** Gera (ou devolve do cache) os materiais no tamanho pedido, de uma vez (Node/V8: 256² ≈ 50 ms; 512² ≈ 250 ms). */
export function generateMaterials(size: MaterialSize = 512): TerrainMaterials {
  const g = generateMaterialsLazy(size);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}

// ---------------- Texturas de dados w×h ----------------
/** O que as texturas de dados leem do mapa (subconjunto de GameMap). */
export interface TerrainSource { w: number; h: number; terrain: Uint8Array }
/** Canais de uWeights: R grama, G terra, B areia, A rocha. */
export const WEIGHT_CHANNEL = { grass: 0, dirt: 1, sand: 2, rock: 3 } as const;
/** Canais de uKind: R água (0/255), G profundidade (distância à margem: 0 na beira … 255 ao largo), B grama seca
 *  (manchas de ~5 tiles pelo mesmo ruído não periódico do minimapa, palette.dryness), A altura da montanha (distância à
 *  borda da serra: ≈ 64 na encosta … 255 no topo; 0 fora da montanha). */
export const KIND_CHANNEL = { water: 0, depth: 1, dry: 2, mountain: 3 } as const;
/** Raio (tiles) lido em volta de cada tile para profundidade/altura: uma edição muda os bytes até essa distância. */
export const TERRAIN_INFLUENCE = 5;
/** Deslocamentos até TERRAIN_INFLUENCE ordenados por distância (a primeira ocorrência é a mais próxima). */
const RING: { dx: number; dy: number; d: number }[] = [];
for (let dy = -TERRAIN_INFLUENCE; dy <= TERRAIN_INFLUENCE; dy++) for (let dx = -TERRAIN_INFLUENCE; dx <= TERRAIN_INFLUENCE; dx++) {
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 0 && d <= TERRAIN_INFLUENCE + 0.01) RING.push({ dx, dy, d });
}
RING.sort((p, q) => p.d - q.d || p.dy - q.dy || p.dx - q.dx);
const isWaterT = (t: number) => t === TERRAIN.WATER || t === TERRAIN.DEEP;
/** Distância (tiles) do tile (x, y) ao tile mais próximo que NÃO satisfaz `inside`; fora do mapa conta como dentro. */
function distToOutside(map: TerrainSource, x: number, y: number, inside: (t: number) => boolean): number {
  for (const r of RING) {
    const nx = x + r.dx, ny = y + r.dy;
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
    if (!inside(map.terrain[ny * map.w + nx])) return r.d;
  }
  return TERRAIN_INFLUENCE + 1;
}
const isMountain = (t: number) => t === TERRAIN.MOUNTAIN;

/**
 * Escreve os bytes de uWeights (RGBA) e uKind (RGBA) dos tiles do retângulo [x0,x1]×[y0,y1] (inclusivo, recortado ao
 * mapa) a partir de map.terrain (e da posição, para as manchas secas). Só esses bytes mudam (os vizinhos até
 * TERRAIN_INFLUENCE são lidos, não escritos); função pura e determinística. Água e profunda levam areia por baixo
 * (leito visível na margem); montanha leva rocha. Devolve o retângulo efetivamente escrito ou null se vazio.
 */
export function writeTerrainRect(map: TerrainSource, weights: Uint8Array, kind: Uint8Array, x0: number, y0: number, x1: number, y1: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const ax0 = Math.max(0, Math.min(x0, x1)), ay0 = Math.max(0, Math.min(y0, y1));
  const ax1 = Math.min(map.w - 1, Math.max(x0, x1)), ay1 = Math.min(map.h - 1, Math.max(y0, y1));
  if (ax1 < ax0 || ay1 < ay0) return null;
  for (let y = ay0; y <= ay1; y++) for (let x = ax0; x <= ax1; x++) {
    const i = y * map.w + x, o = i * 4, t = map.terrain[i];
    weights[o] = 0; weights[o + 1] = 0; weights[o + 2] = 0; weights[o + 3] = 0;
    kind[o] = 0; kind[o + 1] = 0; kind[o + 2] = 0; kind[o + 3] = 0;
    switch (t) {
      case TERRAIN.GRASS: weights[o] = 255; kind[o + 2] = (dryness(x, y) * 255 + 0.5) | 0; break;
      case TERRAIN.DIRT: weights[o + 1] = 255; break;
      case TERRAIN.SAND: weights[o + 2] = 255; break;
      case TERRAIN.MOUNTAIN: {
        weights[o + 3] = 255;
        const d = distToOutside(map, x, y, isMountain);
        kind[o + 3] = (Math.min(1, d / 4) * 255 + 0.5) | 0;
        break;
      }
      case TERRAIN.WATER: case TERRAIN.DEEP: default: {
        weights[o + 2] = 255; kind[o] = 255;
        const k = Math.min(1, Math.max(0, (distToOutside(map, x, y, isWaterT) - 0.5) / 4.5));
        const depth = t === TERRAIN.WATER ? Math.min(k, 0.6) : Math.max(k, 0.7);
        kind[o + 1] = (depth * 255 + 0.5) | 0;
        break;
      }
    }
  }
  return { x0: ax0, y0: ay0, x1: ax1, y1: ay1 };
}

/** Escreve uOwner (RGBA: RGB = cor do dono, A = dono + 1, 0 = ninguém) a partir de state.territory (w·h entradas). */
export function writeOwner(w: number, h: number, territory: ArrayLike<number>, colors: readonly number[], out: Uint8Array): void {
  const n = w * h;
  for (let i = 0, k = 0; i < n; i++, k += 4) {
    const o = territory[i];
    if (o < 0) { out[k] = 0; out[k + 1] = 0; out[k + 2] = 0; out[k + 3] = 0; continue; }
    const c = colors[o % colors.length];
    out[k] = (c >> 16) & 255; out[k + 1] = (c >> 8) & 255; out[k + 2] = c & 255; out[k + 3] = Math.min(255, o + 1);
  }
}
