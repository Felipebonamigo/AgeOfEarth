// A estátua da petrificação (docs/ART.md §1.9 e Apêndice F — lote combate-ambiente): sem um passe "pedra" no bake (o
// orçamento de VRAM das unidades é o apertado), o QUADRO do corpo assado vira pedra em tempo de execução — o recorte do
// atlas lido num canvas (art/alphaMask.ts readPixels), a luminância do corpo (o sombreado do bake: a luz de noroeste
// continua) aplicada a um cinza de pedra quente com grão e manchas de ruído, a cor de time e o bronze somem. Três
// estágios: limpa, rachando e muito rachada (sulcos escuros com a borda de baixo-direita clara, a luz vem de noroeste,
// só sobre pixels opacos). As texturas ficam em cache por quadro (a mesma estátua de um tipo na mesma direção sai
// igual) com contagem de uso: saem do cache só quando ninguém usa (teto STONE_CACHE conjuntos). Sem DOM (Node) ou sem o
// recurso da imagem do atlas (textura procedural gerada na GPU): null, e quem chamou tinge o corpo de cinza.
import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import { readPixels } from '../art/alphaMask';

export interface StoneSet {
  /** 0 = pedra limpa, 1 = rachando, 2 = muito rachada. */
  stages: Texture[];
  /** Recorte (px de mundo) e a posição dele no quadro original — para cortar a estátua de cima ao esfarelar. */
  orig: Rectangle; trim: Rectangle; fw: number; fh: number;
  users: number;
}
export const STONE_CACHE = 16;
const cache = new Map<Texture, StoneSet | null>();

/** Cor base da pedra (cinza quente, calcário), multiplicada pelo sombreado do corpo. */
const STONE = [182, 176, 165] as const;

const hash = (x: number, y: number, s: number): number => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Ruído de valor suave (manchas) em células de `c` px. */
function blotch(x: number, y: number, c: number, s: number): number {
  const gx = Math.floor(x / c), gy = Math.floor(y / c), fx = x / c - gx, fy = y / c - gy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(gx, gy, s), b = hash(gx + 1, gy, s), cc = hash(gx, gy + 1, s), d = hash(gx + 1, gy + 1, s);
  return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v;
}

/** Sulcos (rachaduras) por passeio aleatório a partir de pixels opacos: escurece o sulco e clareia a borda sudeste. */
function crack(px: Uint8ClampedArray, w: number, h: number, alpha: Uint8ClampedArray, n: number, len: number, res: number, seed: number): void {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && alpha[y * w + x] > 150;
  const mul = (x: number, y: number, k: number) => { const i = (y * w + x) * 4; px[i] = Math.min(255, px[i] * k); px[i + 1] = Math.min(255, px[i + 1] * k); px[i + 2] = Math.min(255, px[i + 2] * k); };
  for (let c = 0; c < n; c++) {
    // começa num pixel opaco sorteado
    let x = 0, y = 0, tries = 0;
    do { x = Math.floor(rnd() * w); y = Math.floor(rnd() * h); } while (!opaque(x, y) && ++tries < 200);
    if (tries >= 200) return;
    let a = rnd() * Math.PI * 2;
    const L = len * (0.6 + rnd() * 0.8) * res;
    let fx = x, fy = y;
    for (let i = 0; i < L; i++) {
      a += (rnd() - 0.5) * 0.9;
      fx += Math.cos(a); fy += Math.sin(a);
      const ix = Math.round(fx), iy = Math.round(fy);
      if (!opaque(ix, iy)) break;
      for (let t = 0; t < res; t++) {
        if (opaque(ix + t, iy)) mul(ix + t, iy, 0.42);
        if (opaque(ix + t + res, iy + res)) mul(ix + t + res, iy + res, 1.12);
      }
    }
  }
}

function build(tex: Texture): StoneSet | null {
  if (tex.rotate) return null;
  const p = readPixels(tex);
  if (!p) return null;
  const { w, h, res, rgba } = p;
  const alpha = new Uint8ClampedArray(w * h);
  const base = new Uint8ClampedArray(rgba.length);
  const seed = Math.floor(Math.random() * 1e6);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3];
    alpha[i] = a;
    if (a === 0) continue;
    const x = i % w, y = (i - x) / w;
    const lum = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255;
    // pedra é mais uniforme que o corpo pintado: o sombreado fica, o contraste de cor some
    const v = (0.34 + 0.74 * lum) * (1 + (hash(x, y, seed) - 0.5) * 0.14 + (blotch(x, y, 4 * res, seed + 7) - 0.5) * 0.18);
    base[i * 4] = STONE[0] * v; base[i * 4 + 1] = STONE[1] * v; base[i * 4 + 2] = STONE[2] * v; base[i * 4 + 3] = a;
  }
  const one = new Uint8ClampedArray(base); crack(one, w, h, alpha, 2, 9, res, seed + 1);
  const two = new Uint8ClampedArray(one); crack(two, w, h, alpha, 4, 13, res, seed + 2);
  const orig = tex.orig.clone();
  const trim = tex.trim ? tex.trim.clone() : new Rectangle(0, 0, orig.width, orig.height);
  const stages = [base, one, two].map((data) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    if (!g) throw new Error('canvas 2d');
    const img = g.createImageData(w, h); img.data.set(data); g.putImageData(img, 0, 0);
    return new Texture({ source: new CanvasSource({ resource: cv, resolution: res }), orig, trim, defaultAnchor: tex.defaultAnchor });
  });
  return { stages, orig, trim, fw: w / res, fh: h / res, users: 0 };
}

/** Os três estágios de pedra do quadro `tex` (em uso até `releaseStone`), ou null (sem DOM/recurso). */
export function acquireStone(tex: Texture): StoneSet | null {
  let set = cache.get(tex);
  if (set === undefined) {
    try { set = build(tex); } catch { set = null; }
    cache.set(tex, set);
    // teto: sai o conjunto mais antigo que ninguém usa (a ordem do Map é a de inserção)
    if (cache.size > STONE_CACHE) for (const [k, v] of cache) {
      if (cache.size <= STONE_CACHE) break;
      if (k === tex || (v && v.users > 0)) continue;
      cache.delete(k);
      v?.stages.forEach((t) => t.destroy(true));
    }
  }
  if (set) set.users++;
  return set;
}
export function releaseStone(set: StoneSet | null): void { if (set && set.users > 0) set.users--; }

/** Textura que mostra só a parte de BAIXO da estátua, a partir da fração `cut` (0–1) da altura do recorte: a estátua
 *  esfarela de cima para baixo. Uma por estátua (dinâmica: `crop` só mexe no recorte). */
export function cropTexture(set: StoneSet): Texture {
  return new Texture({ source: set.stages[2].source, frame: new Rectangle(0, 0, set.fw, set.fh), orig: set.orig, trim: set.trim.clone(), defaultAnchor: set.stages[2].defaultAnchor, dynamic: true });
}
export function crop(t: Texture, set: StoneSet, cut: number): void {
  const k = Math.max(0, Math.min(0.999, cut)), dy = set.fh * k;
  t.frame.y = dy; t.frame.height = set.fh - dy;
  t.trim!.y = set.trim.y + dy; t.trim!.height = set.trim.height - dy;
  t.update();
}
/** Diagnóstico/testes. */
export function stoneCacheSize(): number { return cache.size; }
