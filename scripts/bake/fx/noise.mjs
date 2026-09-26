// Ruído determinístico do gerador de efeitos (docs/ART.md Apêndice F): hash inteiro (sem Math.random), ruído de valor
// suave, fBm e um gerador pseudoaleatório com semente. Mesma entrada → mesmos números em qualquer rodada: o atlas `fx`
// sai byte a byte igual (o teste e o `art:check` conferem só o JSON, mas o cache por hash depende disto).

/** Hash de dois inteiros e uma semente → [0, 1). */
export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);
const mod = (a, n) => ((a % n) + n) % n;

/**
 * Ruído de valor 2D suave em [0, 1). `px`/`py` > 0 tornam o ruído periódico nesse eixo (em células): o fogo rola na
 * vertical e o 8º quadro emenda no 1º.
 */
export function vnoise(x, y, seed = 0, px = 0, py = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = fade(x - xi), fy = fade(y - yi);
  const X0 = px ? mod(xi, px) : xi, X1 = px ? mod(xi + 1, px) : xi + 1;
  const Y0 = py ? mod(yi, py) : yi, Y1 = py ? mod(yi + 1, py) : yi + 1;
  const a = hash2(X0, Y0, seed), b = hash2(X1, Y0, seed), c = hash2(X0, Y1, seed), d = hash2(X1, Y1, seed);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

/** fBm: soma de `oct` oitavas (frequência ×2, amplitude ×`gain`), normalizada para [0, 1). Períodos dobram por oitava. */
export function fbm(x, y, seed = 0, oct = 4, gain = 0.5, px = 0, py = 0) {
  let s = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < oct; o++) {
    s += amp * vnoise(x * f, y * f, seed + o * 101, px * f, py * f);
    norm += amp; amp *= gain; f *= 2;
  }
  return s / norm;
}

/** Ruído de valor 3D suave em [0, 1) (a superfície irregular da pedra). */
export function vnoise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = fade(x - xi), fy = fade(y - yi), fz = fade(z - zi);
  const h = (a, b, c) => hash2(a + Math.imul(c, 7919), b, seed);
  const l = (a, b, t) => a + (b - a) * t;
  const x00 = l(h(xi, yi, zi), h(xi + 1, yi, zi), fx), x10 = l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), fx);
  const x01 = l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), fx), x11 = l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), fx);
  return l(l(x00, x10, fy), l(x01, x11, fy), fz);
}

/** Gerador pseudoaleatório (mulberry32) com semente: sequência reprodutível. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
