// Materiais tileáveis do terreno (docs/ART.md §1.7, §3.6, Apêndice I) gerados em runtime, determinísticos e sem
// Math.random: ruído periódico (fBm, ridged, Worley com domínio deformado) e objetos espalhados por um PRNG com semente
// numa tela com altura (folhas de grama em touceiras, cascalho e pedras, placas de calcário com fendas, líquen e
// arbustos) — albedo RGB + altura no alfa e normal XYZ + oclusão no alfa, 512²
// (256² no preset baixo), mais o ruído de normais da água e a textura macro (colinas/tom/ruído largo). Também escreve os
// bytes das texturas de dados w×h (pesos de material, tipo/água/manchas secas, dono) a partir de map.terrain/territory —
// funções puras, sem Pixi nem DOM, testadas em tests/terrain-shader.test.ts. Com as texturas fotográficas de
// public/terrain (photos.ts, scripts/terrain-photos.ts), os 4 materiais daqui viram a reserva (sem os arquivos, fora do
// navegador e até as fotos chegarem); a água e a macro continuam daqui.
import { TERRAIN } from '../../core/constants';
import { TERRAIN_PALETTE, GRASS_DRY, hash01, dryness, noise2 } from '../palette';

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

/** Gerador pseudoaleatório pequeno (mulberry32) para espalhar folhas e pedras nos materiais: determinístico por semente. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * Tela de um material com altura e cor por texel, periódica (as coordenadas dão a volta), em que os objetos espalhados
 * (folhas, pedras, arbustos) se sobrepõem por altura: um texel só troca de cor se o objeto novo ficar mais alto ali.
 */
interface Canvas { size: number; mask: number; h: Float32Array; col: Float32Array; rnd: () => number }
function canvas(size: number, seed: number): Canvas {
  return { size, mask: size - 1, h: new Float32Array(size * size), col: new Float32Array(size * size * 3), rnd: prng(seed) };
}
function put(cv: Canvas, x: number, y: number, hh: number, r: number, g: number, b: number): void {
  const q = ((Math.floor(y) & cv.mask) * cv.size) + (Math.floor(x) & cv.mask);
  if (hh > cv.h[q]) { cv.h[q] = hh; cv.col[q * 3] = r; cv.col[q * 3 + 1] = g; cv.col[q * 3 + 2] = b; }
}
/** Uma folha: de (x, y) na direção unitária (dx, dy), comprimento len e largura wd (texels), altura máx. hm; a cor vai de
 *  `base` (junto ao chão) a `tip` (ponta ao sol), × bright. Sobe da base até ~45 % e verga na ponta; curva aleatória. */
function blade(cv: Canvas, x: number, y: number, dx: number, dy: number, len: number, wd: number, hm: number, base: number[], tip: number[], bright: number): void {
  const steps = Math.max(2, Math.ceil(len / 0.6));
  const px = -dy, py = dx;
  const bend = (cv.rnd() - 0.5) * 0.5;
  for (let j = 0; j <= steps; j++) {
    const t = j / steps;
    const w = wd * (1 - 0.7 * t);
    const cx = x + dx * len * t + px * bend * len * t * t, cy = y + dy * len * t + py * bend * len * t * t;
    const ht = hm * (t < 0.45 ? 0.55 + t : 1 - (t - 0.45) * 0.9);
    const r = lerp(base[0], tip[0], t) * bright, g = lerp(base[1], tip[1], t) * bright, b = lerp(base[2], tip[2], t) * bright;
    put(cv, cx, cy, ht, r, g, b);
    if (w >= 0.9) { put(cv, cx + px * w * 0.5, cy + py * w * 0.5, ht - 0.04, r, g, b); put(cv, cx - px * w * 0.5, cy - py * w * 0.5, ht - 0.04, r, g, b); }
  }
}
/** Pedra: elipse girada de semieixos rx, ry (texels) em (x, y), em cúpula achatada de altura hm sobre hb; a cor escurece
 *  um pouco para a borda e ganha grão próprio (a pedra não é lisa). */
function stone(cv: Canvas, x: number, y: number, rx: number, ry: number, ang: number, hb: number, hm: number, c: number[]): void {
  const ca = Math.cos(ang), sa = Math.sin(ang), R = Math.ceil(Math.max(rx, ry)) + 1;
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    const u = (i * ca + j * sa) / rx, v = (-i * sa + j * ca) / ry, d = u * u + v * v;
    if (d >= 1) continue;
    const dome = Math.sqrt(1 - d);
    const grain = 0.94 + 0.12 * hash01((x + i) | 0, (y + j) | 0, 77);
    const k = (1 - 0.22 * d) * grain;
    put(cv, x + i, y + j, hb + hm * (0.35 + 0.65 * dome), c[0] * k, c[1] * k, c[2] * k);
  }
}
/** Tufo seco/verde: 6–14 folhas curtas em leque. */
function tuftAt(cv: Canvas, x: number, y: number, r: number, hm: number, base: number[], tip: number[], bright: number, count: number): void {
  for (let b = 0; b < count; b++) {
    const a = cv.rnd() * Math.PI * 2, r0 = cv.rnd() * r * 0.25;
    blade(cv, x + Math.cos(a) * r0, y + Math.sin(a) * r0, Math.cos(a), Math.sin(a), r * (0.55 + cv.rnd() * 0.6), 1 + cv.rnd() * 0.7, hm * (0.8 + cv.rnd() * 0.25), base, tip, bright * (0.9 + cv.rnd() * 0.2));
  }
}
function finish(cv: Canvas, strength: number, ao: number): MaterialTex {
  const n = cv.size * cv.size, albedo = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) albedo[i * 4 + c] = Math.max(0, Math.min(255, Math.round(cv.col[i * 3 + c])));
    albedo[i * 4 + 3] = Math.round(clamp01(cv.h[i]) * 255);
  }
  return { albedo, normal: normalMap(cv.h, cv.size, strength, ao) };
}
/**
 * Worley periódico (células de Voronoi) com `cells` células por eixo: para cada texel, F1 e F2 (distâncias ao 1.º e ao
 * 2.º ponto, em células), o índice da célula do ponto mais próximo e o vetor ponto → texel (em células), para facetas.
 * `warp` (ruídos periódicos em [0, 1] e amplitude em células) deforma o domínio: arestas curvas em vez de polígonos.
 */
function worley(size: number, cells: number, seed: number, jitter = 0.8, warp?: { x: Float32Array; y: Float32Array; amp: number }): { f1: Float32Array; f2: Float32Array; id: Int32Array; vx: Float32Array; vy: Float32Array } {
  const C = Math.max(1, Math.round(cells)), n = size * size;
  const ptx = new Float32Array(C * C), pty = new Float32Array(C * C);
  for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) { ptx[j * C + i] = i + 0.5 + (hash01(i, j, seed) - 0.5) * jitter; pty[j * C + i] = j + 0.5 + (hash01(i, j, seed + 1) - 0.5) * jitter; }
  const f1 = new Float32Array(n), f2 = new Float32Array(n), id = new Int32Array(n), vx = new Float32Array(n), vy = new Float32Array(n);
  const sc = C / size;
  for (let y = 0; y < size; y++) {
    const fy = (y + 0.5) * sc, cj = Math.floor(fy);
    for (let x = 0; x < size; x++) {
      const o = y * size + x;
      const fx = (x + 0.5) * sc + (warp ? (warp.x[o] - 0.5) * warp.amp : 0), gy = warp ? fy + (warp.y[o] - 0.5) * warp.amp : fy;
      const ci = Math.floor(fx), cj2 = warp ? Math.floor(gy) : cj;
      let d1 = 1e9, d2 = 1e9, best = 0, bx = 0, by = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = ci + di, nj = cj2 + dj;
        let wi = ni, wj = nj;   // volta periódica sem % (o domínio deformado passa no máximo ~2 células da borda)
        while (wi < 0) wi += C; while (wi >= C) wi -= C; while (wj < 0) wj += C; while (wj >= C) wj -= C;
        const w = wj * C + wi;
        const px = ptx[w] + (ni - wi), py = pty[w] + (nj - wj);
        const ex = fx - px, ey = gy - py, d = ex * ex + ey * ey;
        if (d < d1) { d2 = d1; d1 = d; best = w; bx = ex; by = ey; } else if (d < d2) d2 = d;
      }
      f1[o] = Math.sqrt(d1); f2[o] = Math.sqrt(d2); id[o] = best; vx[o] = bx; vy[o] = by;
    }
  }
  return { f1, f2, id, vx, vy };
}

/** Tons da grama (albedo antes da luz): a folha vai da base (sombra dentro da touceira) à ponta (sol na ponta). */
const GRASS_TONES: { base: number; tip: number; w: number }[] = [
  { base: 0x44602a, tip: 0x88a24a, w: 0.38 },   // verde de pasto
  { base: 0x52622a, tip: 0xa0a24c, w: 0.28 },   // verde-amarelado
  { base: 0x385632, tip: 0x74945a, w: 0.18 },   // verde-azulado (mais úmido)
  { base: 0x686034, tip: 0xb2a468, w: 0.11 },   // palha (folhas secas misturadas)
  { base: 0x5a5430, tip: 0x968a52, w: 0.05 },   // pardo
];
const STRAW = { base: rgb(0x6a5f36), tip: rgb(0xb4a46c) };
/**
 * Grama de pasto mediterrâneo vista de cima: TOUCEIRAS (grade com jitter, 7 × 7 por tile, uma em dez ausente) de 26–60
 * folhas que saem do centro em leque, mais folhas soltas entre elas, sobre um chão de palha e terra que aparece nas
 * falhas; regiões mais úmidas puxam para os verdes, as secas para palha e pardo. A zoom 1 (4 texels por pixel) cada
 * touceira é um tufo de 4–8 px com o lado do sol claro e o de sudeste na sombra; a zoom 2,2+ as folhas aparecem.
 */
function grassMaterial(size: number): MaterialTex {
  const s = 4, r = size / 128, k = size / 512;   // s: células por tile × 4 (os ruídos têm o mesmo tamanho no mundo a 256² e 512²); r: força do relevo por texel; k: comprimento em texels
  const cv = canvas(size, 0x9e3779b1), { rnd, mask } = cv, n = size * size;
  const low = fbm(size, [[2 * s, 1, 101], [4 * s, 0.5, 102], [16 * s, 0.3, 103]]);
  const moist = fbm(size, [[1 * s, 1, 108], [2 * s, 0.5, 109]]);
  const soil = rgb(0x5e5034), thatch = rgb(0x6c683a), moss = rgb(0x4a5e2c);
  for (let i = 0; i < n; i++) {
    const l = low[i];
    cv.h[i] = 0.08 + 0.14 * l;
    const a = smooth(0.35, 0.7, l), g = 0.3 + smooth(0.35, 0.8, moist[i]) * 0.5;
    for (let c = 0; c < 3; c++) cv.col[i * 3 + c] = lerp(lerp(soil[c], thatch[c], a), moss[c], g);
  }
  const tones = GRASS_TONES.map((t) => ({ base: rgb(t.base), tip: rgb(t.tip), w: t.w }));
  const pick = (u: number, wet: number): number => {
    let acc = 0; const ws = tones.map((t, i) => t.w * (i <= 2 ? 0.6 + 0.8 * wet : 1.4 - 0.9 * wet));
    const tot = ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ws.length; i++) { acc += ws[i] / tot; if (u < acc) return i; }
    return ws.length - 1;
  };
  const wetAt = (x: number, y: number) => smooth(0.3, 0.7, moist[((y | 0) & mask) * size + ((x | 0) & mask)]);
  const per = 7 * s, cell = size / per;   // 7 touceiras por tile em cada eixo
  const clumps: { x: number; y: number; r: number; hm: number; tone: number; bright: number }[] = [];
  for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) {
    if (rnd() < 0.1) continue;
    const x = (i + 0.15 + 0.7 * rnd()) * cell, y = (j + 0.15 + 0.7 * rnd()) * cell;
    clumps.push({ x, y, r: (8 + rnd() * 9) * k, hm: 0.55 + rnd() * 0.4, tone: pick(rnd(), wetAt(x, y)), bright: 0.86 + rnd() * 0.28 });
  }
  clumps.sort((a, b) => a.hm - b.hm);
  const loose = Math.round(per * per * 8);
  for (let q = 0; q < loose; q++) {
    const x = rnd() * size, y = rnd() * size, a = rnd() * Math.PI * 2;
    const tn = tones[pick(rnd(), wetAt(x, y))];
    blade(cv, x, y, Math.cos(a), Math.sin(a), (4 + rnd() * 6) * k, 1 + rnd() * 0.6, 0.3 + rnd() * 0.2, tn.base, tn.tip, 0.8 + rnd() * 0.3);
  }
  for (const c of clumps) {
    const tn = tones[c.tone];
    const blades = Math.round(26 + rnd() * 34);
    for (let b = 0; b < blades; b++) {
      const a = rnd() * Math.PI * 2, r0 = rnd() * c.r * 0.25;
      const t = rnd() < 0.1 ? STRAW : tn;   // folhas secas no meio de qualquer touceira
      blade(cv, c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0, Math.cos(a), Math.sin(a), c.r * (0.55 + rnd() * 0.6), 1 + rnd() * 0.7, c.hm * (0.8 + rnd() * 0.25), t.base, t.tip, c.bright * (0.9 + rnd() * 0.2));
    }
  }
  return finish(cv, 2.2 * r, 3.2);
}

/** Cores de pedra solta (calcário claro, cinza, arenito, avermelhada). */
const PEBBLES = [0xa39a88, 0x8c8474, 0xb3a994, 0x96806a, 0x7a7266, 0xa08c70].map(rgb);
/**
 * Terra batida mediterrânea: solo pardo-avermelhado (terra rossa) em manchas largas, grão fino, cascalho denso de 1–3
 * texels, pedras de 3–8 texels meio enterradas e tufos secos esparsos. Sem as "curvas de nível" do protótipo: o que
 * sombreia são as pedras e o grão.
 */
function dirtMaterial(size: number): MaterialTex {
  const s = 4, r = size / 128, k = size / 512;
  const cv = canvas(size, 0x51ed270b), { rnd } = cv, n = size * size;
  const low = fbm(size, [[1 * s, 1, 201], [2 * s, 0.5, 202], [4 * s, 0.3, 203]]);
  const red = fbm(size, [[1.5 * s, 1, 204], [3 * s, 0.5, 205]]);
  const grain = fbm(size, [[32 * s, 1, 206], [64 * s, 0.6, 207]]);
  const dark = rgb(0x6c5238), light = rgb(0x9a7c54), rossa = rgb(0x8c5a3a);
  for (let i = 0; i < n; i++) {
    const l = low[i], g = grain[i] - 0.5;
    cv.h[i] = 0.12 + 0.2 * l + 0.06 * g;
    for (let c = 0; c < 3; c++) {
      let v = lerp(dark[c], light[c], clamp01(l * 1.2 - 0.1));
      v = lerp(v, rossa[c], smooth(0.5, 0.8, red[i]) * 0.45);
      cv.col[i * 3 + c] = v * (1 + g * 0.16);
    }
  }
  const area = size * size / (128 * k * 128 * k);   // tiles cobertos pela textura (16)
  // cascalho: muitas pedrinhas pequenas
  // pedra coberta de pó: puxa a cor para a do solo
  const dusty = (c: number[], x: number, y: number) => { const o = ((y | 0) & cv.mask) * size + ((x | 0) & cv.mask); return c.map((v, j) => lerp(v, cv.col[o * 3 + j], 0.3)); };
  for (let q = 0, N = Math.round(90 * area); q < N; q++) {
    const r = (0.8 + rnd() * 1.8) * k * 2, x = rnd() * size, y = rnd() * size;
    stone(cv, x, y, r, r * (0.6 + rnd() * 0.4), rnd() * Math.PI, 0.18, 0.12 + rnd() * 0.1, dusty(PEBBLES[(rnd() * PEBBLES.length) | 0], x, y));
  }
  // pedras maiores, em grupos (onde o solo é mais claro)
  for (let q = 0, N = Math.round(5 * area); q < N; q++) {
    const x = rnd() * size, y = rnd() * size, r = (3 + rnd() * 5) * k * 2;
    stone(cv, x, y, r, r * (0.55 + rnd() * 0.4), rnd() * Math.PI, 0.2, 0.3 + rnd() * 0.25, dusty(PEBBLES[(rnd() * PEBBLES.length) | 0], x, y));
  }
  // tufos secos
  for (let q = 0, N = Math.round(2.5 * area); q < N; q++) tuftAt(cv, rnd() * size, rnd() * size, (5 + rnd() * 5) * k * 2, 0.55, STRAW.base, STRAW.tip, 0.85 + rnd() * 0.2, 10 + ((rnd() * 10) | 0));
  return finish(cv, 2.4 * r, 3);
}

function sandMaterial(size: number): MaterialTex {
  const s = 4, r = size / 128, k = size / 512;
  // Areia: ondulação de baixa frequência (dunas suaves, com deformação larga) + grão fino de amplitude mínima —
  // sem o "papel amassado" do protótipo (§1.7); conchas e seixos raros por cima
  const warp = fbm(size, [[1 * s, 1, 301], [2 * s, 0.5, 302]]);
  const low = fbm(size, [[2 * s, 1, 303], [4 * s, 0.4, 304]]);
  const grain = fbm(size, [[64 * s, 1, 305], [128 * s, 0.5, 306]]);
  const tone = fbm(size, [[1.5 * s, 1, 307], [3 * s, 0.5, 308]]);
  const cv = canvas(size, 0x2545f491), { rnd } = cv;
  const dark = rgb(0xc4b283), light = rgb(0xdccc9f), base = rgb(TERRAIN_PALETTE[TERRAIN.SAND]), grey = rgb(0xb8ae94);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const ph = (y / size) * Math.PI * 2 * 7 + (x / size) * Math.PI * 2 * 1 + warp[i] * 5.5;
    const rip = 0.5 + 0.5 * Math.sin(ph);
    const ripS = rip * rip * (3 - 2 * rip);
    cv.h[i] = clamp01(0.3 + 0.18 * ripS + 0.18 * (low[i] - 0.5) + 0.05 * (grain[i] - 0.5));
    for (let c = 0; c < 3; c++) {
      let v = lerp(dark[c], light[c], 0.45 + 0.22 * ripS + 0.5 * (low[i] - 0.5));
      v = lerp(v, base[c], 0.4);
      v = lerp(v, grey[c], smooth(0.55, 0.85, tone[i]) * 0.35) + (grain[i] - 0.5) * 12;
      cv.col[i * 3 + c] = v;
    }
  }
  const area = size * size / (128 * k * 128 * k);
  for (let q = 0, N = Math.round(10 * area); q < N; q++) {
    const r = (0.8 + rnd() * 1.6) * k * 2;
    stone(cv, rnd() * size, rnd() * size, r, r * (0.6 + rnd() * 0.4), rnd() * Math.PI, 0.3, 0.08, rnd() < 0.5 ? rgb(0xe8e0cc) : PEBBLES[(rnd() * PEBBLES.length) | 0]);
  }
  return finish(cv, 2.5 * r / 4, 1.5);
}

/**
 * Rocha calcária: placas de Voronoi (≈ 1,25 por tile) inclinadas cada uma para um lado (facetas que pegam a luz de
 * formas diferentes), com fendas entre elas (F2 − F1 pequeno), fraturas menores (4 por tile), grão, líquen amarelo e
 * cinza-esverdeado em manchas e arbustos baixos (maquis) crescendo nas fendas.
 */
/** Campos da rocha (a parte cara: dois Worley com domínio deformado e os ruídos), num passo próprio da geração. */
function rockFields(size: number) {
  const s = 4;
  // domínio deformado: arestas das placas curvas e irregulares (sem o "calçamento" de polígonos retos); o y da
  // deformação é o mesmo ruído lido meia textura adiante (descorrelacionado e sem custo)
  const shifted = (a: Float32Array) => { const o = new Float32Array(a.length), half = (size >> 1) * size + (size >> 1); for (let i = 0; i < a.length; i++) o[i] = a[(i + half) % a.length]; return o; };
  const n1 = fbm(size, [[2 * s, 1, 431], [5 * s, 0.4, 432]]), n2 = fbm(size, [[6 * s, 1, 435], [12 * s, 0.5, 436]]);
  const big = worley(size, 1.25 * s, 401, 0.9, { x: n1, y: shifted(n1), amp: 1.1 }), small = worley(size, 4 * s, 405, 0.9, { x: n2, y: shifted(n2), amp: 0.9 });
  const crackW = fbm(size, [[3 * s, 1, 439], [6 * s, 0.5, 440]]);   // largura da fenda (e fendas que se fecham)
  const grain = fbm(size, [[16 * s, 1, 411], [32 * s, 0.6, 412]]);
  const rough = ridged(size, [[3 * s, 1, 413], [6 * s, 0.5, 414], [12 * s, 0.3, 417]]);
  const lichenMask = fbm(size, [[1.5 * s, 1, 415], [3 * s, 0.5, 416]]);
  const spots = lattice(size, 10 * s, 409);   // manchas de líquen
  return { big, small, crackW, grain, rough, lichenMask, spots };
}
function rockMaterial(size: number, f: ReturnType<typeof rockFields>): MaterialTex {
  const s = 4, r = size / 128, k = size / 512;
  const cv = canvas(size, 0x68e31da4), { rnd } = cv, n = size * size;
  const { big, small, crackW, grain, rough, lichenMask, spots } = f;
  const pale = rgb(0xa39d90), mid = rgb(0x8a857a), warm = rgb(0x9a8a74), crackC = rgb(0x4a453c), dust = rgb(0x6e604a);
  const lichY = rgb(0xa89452), lichG = rgb(0x7c8268);
  // sorteios por célula (uma vez por célula, não por texel): inclinação e altura da placa, tom, fratura
  const perCell = (cells: number, seed: number, k: number) => { const C = Math.max(1, Math.round(cells)), out = new Float32Array(C * C * k); for (let c = 0; c < C * C; c++) for (let j = 0; j < k; j++) out[c * k + j] = hash01(c, j, seed); return out; };
  const B = perCell(1.25 * s, 421, 4), S = perCell(4 * s, 422, 4);
  for (let i = 0; i < n; i++) {
    const b = big.id[i] * 4, sm = small.id[i] * 4;
    // placa: altura-base e inclinação por célula
    const tx = (B[b] - 0.5) * 0.9, ty = (B[b + 1] - 0.5) * 0.9;
    const plate = 0.45 + (B[b + 2] - 0.5) * 0.3 + tx * big.vx[i] + ty * big.vy[i];
    const sub = (S[sm] - 0.5) * 0.08 + (S[sm + 1] - 0.5) * 0.25 * small.vx[i] + (S[sm + 2] - 0.5) * 0.25 * small.vy[i];
    const eBig = big.f2[i] - big.f1[i], eSm = small.f2[i] - small.f1[i];
    const cw = crackW[i], open = smooth(0.3, 0.55, cw);
    const crack = (1 - smooth(0.0, 0.02 + 0.08 * cw, eBig)) * open, crackS = (1 - smooth(0.0, 0.035, eSm)) * 0.5 * smooth(0.45, 0.7, 1 - cw);
    const bevel = smooth(0, 0.22, eBig);   // a placa arredonda perto da fenda
    cv.h[i] = clamp01((plate + sub) * (0.6 + 0.4 * bevel) + 0.16 * (rough[i] - 0.5) + 0.06 * (grain[i] - 0.5) - 0.25 * crack - 0.08 * crackS);
    const tone = B[b + 3], g = grain[i] - 0.5;
    for (let c = 0; c < 3; c++) {
      let v = lerp(mid[c], pale[c], clamp01(tone * 0.8 + bevel * 0.3 - 0.05));
      v = lerp(v, warm[c], S[sm + 3] * 0.35);
      v *= 1 + g * 0.18;
      // líquen: manchas pequenas (Worley fino) só onde a máscara larga deixa
      const lk = smooth(0.55, 0.8, lichenMask[i]) * smooth(0.6, 0.72, spots[i]);
      v = lerp(v, lichenMask[i] < 0.68 ? lichY[c] : lichG[c], lk * 0.55);
      v = lerp(v, dust[c], Math.max(crack, crackS) * 0.5);
      v = lerp(v, crackC[c], crack * 0.55);
      cv.col[i * 3 + c] = v;
    }
  }
  // arbustos baixos (maquis) nas fendas: tufos verde-escuros onde F2 − F1 é pequeno
  const bush = { base: rgb(0x2e3a1e), tip: rgb(0x5c6a36) };
  const area = size * size / (128 * k * 128 * k);
  for (let q = 0, N = Math.round(40 * area), placed = 0; q < N && placed < 2.2 * area; q++) {
    const x = rnd() * size, y = rnd() * size, o = ((y | 0) & cv.mask) * size + ((x | 0) & cv.mask);
    if (big.f2[o] - big.f1[o] > 0.05 || crackW[o] < 0.35) continue;
    placed++;
    tuftAt(cv, x, y, (4 + rnd() * 5) * k * 2, 0.7, bush.base, bush.tip, 0.9 + rnd() * 0.2, 18 + ((rnd() * 14) | 0));
  }
  return finish(cv, 2.6 * r, 3.5);
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

let extras: { waterNormal: Uint8Array; macro: Uint8Array } | null = null;
/** Normais da água e textura macro (procedurais também com o terreno fotográfico: photos.ts só troca os 4 materiais). */
export function proceduralExtras(): { waterNormal: Uint8Array; macro: Uint8Array } {
  return (extras ??= { waterNormal: waterNormal(WATER_SIZE), macro: macroTexture(MACRO_SIZE) });
}

const cache = new Map<number, TerrainMaterials>();
/** Materiais já gerados neste tamanho (null se ainda não). */
export function cachedMaterials(size: MaterialSize): TerrainMaterials | null { return cache.get(size) ?? null; }
/**
 * Gera os materiais em passos (um material por `next()`, a rocha em dois), para o chamador espalhar o custo de 512²
 * (≈ 500 ms em JS frio, nenhum passo acima de ~140 ms) por várias macrotarefas no menu. O resultado final entra no cache. Determinístico.
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
  const rf = rockFields(size); lap(); yield 'rock-fields'; t = now();
  const rock = rockMaterial(size, rf); lap(); yield 'rock'; t = now();
  const { waterNormal: water, macro } = proceduralExtras(); lap();
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
export function writeTerrainRect(map: TerrainSource, weights: Uint8Array, kind: Uint8Array, x0: number, y0: number, x1: number, y1: number, wear?: Uint8Array | null): { x0: number; y0: number; x1: number; y1: number } | null {
  const ax0 = Math.max(0, Math.min(x0, x1)), ay0 = Math.max(0, Math.min(y0, y1));
  const ax1 = Math.min(map.w - 1, Math.max(x0, x1)), ay1 = Math.min(map.h - 1, Math.max(y0, y1));
  if (ax1 < ax0 || ay1 < ay0) return null;
  for (let y = ay0; y <= ay1; y++) for (let x = ax0; x <= ax1; x++) {
    const i = y * map.w + x, o = i * 4, t = map.terrain[i];
    weights[o] = 0; weights[o + 1] = 0; weights[o + 2] = 0; weights[o + 3] = 0;
    kind[o] = 0; kind[o + 1] = 0; kind[o + 2] = 0; kind[o + 3] = 0;
    switch (t) {
      case TERRAIN.GRASS: { const k = wear ? (wear[i] * WEAR_DIRT + 127) >> 8 : 0; weights[o] = 255 - k; weights[o + 1] = k; kind[o + 2] = (dryness(x, y) * 255 + 0.5) | 0; break; }
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

// ---------------- Chão batido (Etapa 9, docs/ART.md Apêndice I) ----------------
/** Fração máxima (/256) do peso da grama que o chão mais pisado passa para a terra (o resto deixa touceiras furando a terra). */
export const WEAR_DIRT = 200;
/** Raio (tiles, a partir da borda da pegada) do chão batido por tipo de edifício; os ausentes (fazenda, muralha, torre) não pisam. */
export const WEAR_RADIUS: Readonly<Record<string, number>> = {
  town_center: 3.4, market: 2.6, wonder_zeus: 2.8, wonder_artemis: 2.8, wonder_colossus: 2.8, titan_gate: 2.6, fortress: 2.4,
  barracks: 2.2, stable: 2.2, siege_workshop: 2.2, temple: 2.2, academy: 2, granary: 2, lumber_camp: 2, mine: 2,
  cornucopia: 1.8, house: 1.3, gate: 1.6,
};
export interface WearSource { type: string; tx: number; ty: number; w: number; h: number }
/**
 * Chão batido em volta dos edifícios (só do renderizador): por tile, 0–255 de quanto o movimento de gente e animais
 * gastou a grama — 255 encostado na pegada, caindo até 0 em WEAR_RADIUS[tipo] tiles, com a borda recortada por um ruído
 * largo (manchas, não anéis) e o máximo entre edifícios. Determinístico pelos edifícios; função pura (testada em Node).
 */
export function buildWear(w: number, h: number, buildings: Iterable<WearSource>): Uint8Array {
  const out = new Uint8Array(w * h);
  for (const b of buildings) {
    const R = WEAR_RADIUS[b.type];
    if (!R) continue;
    const r = Math.ceil(R + 1);
    const x0 = Math.max(0, b.tx - r), y0 = Math.max(0, b.ty - r), x1 = Math.min(w - 1, b.tx + b.w - 1 + r), y1 = Math.min(h - 1, b.ty + b.h - 1 + r);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      // distância do centro do tile à pegada [tx, tx + w] × [ty, ty + h]
      const cx = x + 0.5, cy = y + 0.5;
      const dx = Math.max(b.tx - cx, 0, cx - (b.tx + b.w)), dy = Math.max(b.ty - cy, 0, cy - (b.ty + b.h));
      const d = Math.sqrt(dx * dx + dy * dy) + (noise2(x * 0.45 + 17, y * 0.45 + 91) - 0.5) * 1.6 + (hash01(x, y, 87) - 0.5) * 0.35;
      const k = 1 - Math.max(0, Math.min(1, (d - 0.2) / (R - 0.2)));
      const v = Math.round(255 * k * k * (3 - 2 * k)), i = y * w + x;
      if (v > out[i]) out[i] = v;
    }
  }
  return out;
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
