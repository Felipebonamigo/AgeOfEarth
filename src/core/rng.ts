// Gerador pseudoaleatório determinístico (mulberry32) e ruído 2D. Sem Math.random.

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class RNG {
  s: number;
  constructor(seed: number | string = 1) {
    this.s = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }
  float(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number { return min + Math.floor(this.float() * (max - min + 1)); }
  range(min: number, max: number): number { return min + this.float() * (max - min); }
  chance(p: number): boolean { return this.float() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.float() * arr.length)]; }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
}

function lattice(seed: number, x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);

export interface Noise2D {
  noise(x: number, y: number): number;
  fbm(x: number, y: number, octaves?: number, lacunarity?: number, gain?: number): number;
}

/** Ruído de valor 2D em [0,1]. */
export function makeNoise(seed: number): Noise2D {
  const s = seed >>> 0;
  const noise = (x: number, y: number): number => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const a = lattice(s, x0, y0), b = lattice(s, x0 + 1, y0);
    const c = lattice(s, x0, y0 + 1), d = lattice(s, x0 + 1, y0 + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  const fbm = (x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number => {
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
