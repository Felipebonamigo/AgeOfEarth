// Gerador pseudoaleatório determinístico (mulberry32) e ruído 2D.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed = 1) {
    this.s = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }
  float() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min, max) { return min + Math.floor(this.float() * (max - min + 1)); }
  range(min, max) { return min + this.float() * (max - min); }
  chance(p) { return this.float() < p; }
  pick(arr) { return arr[Math.floor(this.float() * arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  toJSON() { return { s: this.s }; }
  static fromJSON(o) { const r = new RNG(1); r.s = o.s >>> 0; return r; }
}

function lattice(seed, x, y) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);

/** Ruído de valor 2D em [0,1]. */
export function makeNoise(seed) {
  const s = seed >>> 0;
  const noise = (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const a = lattice(s, x0, y0), b = lattice(s, x0 + 1, y0);
    const c = lattice(s, x0, y0 + 1), d = lattice(s, x0 + 1, y0 + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  const fbm = (x, y, octaves = 4, lacunarity = 2, gain = 0.5) => {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
  return { noise, fbm };
}
