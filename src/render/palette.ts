// Paleta compartilhada da renderização (docs/ART.md §1.5–1.6): cor-base terrosa de cada terreno (usada pelos
// materiais e uniforms do shader do terreno, pelo minimapa e pelas sobreposições do editor), materiais do placeholder,
// cor de time tingida, sol/sombra e o ruído determinístico de baixa frequência (manchas secas da grama, tom macro) que o
// shader e o minimapa compartilham. Fica fora do núcleo determinístico.
import { TERRAIN, PLAYER_COLORS } from '../core/constants';

/** Cor-base (0xRRGGBB) de cada terreno; 6 = água profunda forçada pelo pincel do editor. */
export const TERRAIN_PALETTE: Record<number, number> = {
  [TERRAIN.GRASS]: 0x5f7a33,
  [TERRAIN.WATER]: 0x2a6a86,
  [TERRAIN.MOUNTAIN]: 0x74736c,
  [TERRAIN.SAND]: 0xd3c294,
  [TERRAIN.DIRT]: 0x8a6b40,
  [TERRAIN.DEEP]: 0x184a66,
  6: 0x184a66,
};
/** Grama seca (manchas na grama viva), topo claro da montanha, espuma e areia molhada (§1.6). */
export const GRASS_DRY = 0x8a8a4a;
export const MOUNTAIN_TOP = 0xd8d6cf;
export const FOAM = 0xc9dde3;

/** Materiais do placeholder (albedo aproximado; rugosidade/metal ficam para o bake da Etapa 2). */
export const MATERIALS = {
  marble: 0xd9cdb4, marbleDark: 0xb8ad95,
  bronze: 0x8c6a2e, bronzeLight: 0xb08a3e,
  terracotta: 0xa3552e,
  wood: 0x6b4a2b, woodDark: 0x4a3219,
  leather: 0x5a3d26,
  linen: 0xe8dcc0,
  stone: 0xa8a396, stoneDark: 0x74736c,
  iron: 0x8e8a80,
  gold: 0xd0a12e,
  skin: 0xd9b08a, skinDark: 0xb08a62,
} as const;

/** Cor de time tingida (para túnica/capa/telhado no placeholder); a HUD e o minimapa mantêm PLAYER_COLORS saturadas. */
export const TEAM_TINT: number[] = [0x2f4fa8, 0xa8322f, 0x5a8a2f, 0xd0a12e];
/** Versão tingida de uma cor de PLAYER_COLORS (cores desconhecidas são dessaturadas levemente). */
export function teamTint(color: number): number {
  const i = PLAYER_COLORS.findIndex((p) => p.num === color);
  if (i >= 0 && i < TEAM_TINT.length) return TEAM_TINT[i];
  return mixColor(color, 0x8a7a5a, 0.3);
}

/** Sol único a noroeste-alto (espaço de tela, y para baixo, z para cima; §1.5) e a projeção da sombra no chão (sudeste).
 *  O shader do terreno recebe SUN_DIR normalizado como uSun (terrain/ChunkMesh.ts). */
export const SUN_DIR = { x: -0.45, y: -0.55, z: 0.7 } as const;
export const SHADOW_DIR = { x: 0.633, y: 0.774 } as const;   // -SUN_DIR.xy normalizado: direita-baixo
/** Alfa das sombras separadas (camada 'shadows', blend multiply). */
export const SHADOW_ALPHA = 0.45;
/** Deslocamento (px) da sombra de um objeto com altura visual `height` (px): metade da altura, na direção do sol. */
export function shadowOffset(height: number): { x: number; y: number } { return { x: SHADOW_DIR.x * height * 0.5, y: SHADOW_DIR.y * height * 0.5 }; }

/** Cor de um terreno (magenta para valores desconhecidos, para saltar à vista). */
export function terrainColor(t: number): number { return TERRAIN_PALETTE[t] ?? 0xff00ff; }

/** Mesma cor em '#rrggbb' para canvas 2D. */
export function terrainHex(t: number): string { return '#' + terrainColor(t).toString(16).padStart(6, '0'); }

/** Cores translúcidas das regiões conexas (rótulo → cor cíclica), distintas entre vizinhas na maioria dos mapas. */
export const REGION_PALETTE: number[] = [0xf97316, 0x22d3ee, 0xa3e635, 0xe879f9, 0xfacc15, 0x60a5fa, 0xf472b6, 0x34d399, 0xfb7185, 0xc084fc, 0x38bdf8, 0xfbbf24];
export function regionColor(label: number): number { return REGION_PALETTE[label % REGION_PALETTE.length]; }

// ---------------- Cor ----------------
export function scaleColor(c: number, f: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((c >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((c >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((c & 255) * f)));
  return (r << 16) | (g << 8) | b;
}
export function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

// ---------------- Ruído determinístico ----------------
/** Hash inteiro → [0, 1) de coordenadas inteiras e uma semente (mesma função no terreno, nos detalhes e no minimapa). */
export function hash01(x: number, y: number, s: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const NOISE_N = 128;
let noiseTable: Float32Array | null = null;
/** Tabela periódica 128×128 × 2 canais de ruído suave (3 oitavas de ruído de valor), gerada uma vez a partir de hash01. */
function buildNoise(): Float32Array {
  const t = new Float32Array(NOISE_N * NOISE_N * 2);
  const octaves: [number, number, number][] = [[16, 1, 11], [8, 0.5, 12], [4, 0.25, 13]];   // [período em células, amplitude, semente]
  let total = 0;
  for (const [, amp] of octaves) total += amp;
  const smooth = (f: number) => f * f * (3 - 2 * f);
  for (let ch = 0; ch < 2; ch++) for (let y = 0; y < NOISE_N; y++) for (let x = 0; x < NOISE_N; x++) {
    let v = 0;
    for (const [period, amp, seed] of octaves) {
      const cells = NOISE_N / period, sd = seed + ch * 100;
      const fx = x / period, fy = y / period;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = smooth(fx - ix), ty = smooth(fy - iy);
      const a = hash01(ix % cells, iy % cells, sd), b = hash01((ix + 1) % cells, iy % cells, sd);
      const c = hash01(ix % cells, (iy + 1) % cells, sd), d = hash01((ix + 1) % cells, (iy + 1) % cells, sd);
      v += amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
    }
    t[(y * NOISE_N + x) * 2 + ch] = v / total;
  }
  return t;
}
/** Ruído suave em [0, 1] em coordenadas contínuas (bilinear na tabela periódica; período 128 unidades), canal 0. */
export function noise2(x: number, y: number): number {
  const t = noiseTable ?? (noiseTable = buildNoise());
  const fx = x - Math.floor(x / NOISE_N) * NOISE_N, fy = y - Math.floor(y / NOISE_N) * NOISE_N;
  const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
  const ix1 = (ix + 1) & (NOISE_N - 1), iy1 = (iy + 1) & (NOISE_N - 1);
  const a = t[(iy * NOISE_N + ix) * 2], b = t[(iy * NOISE_N + ix1) * 2], c = t[(iy1 * NOISE_N + ix) * 2], d = t[(iy1 * NOISE_N + ix1) * 2];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
/** Quanto a grama está seca em (x, y) tiles: manchas de ~5 tiles (0 = viva, 1 = seca). */
export function dryness(x: number, y: number): number {
  const n = noise2(x * 0.19 + 40, y * 0.19 + 9);
  const k = (n - 0.5) / 0.26;
  return k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
}
/** Tom macro (colinas de baixa frequência): fator multiplicativo ≈ 0,92–1,08. */
export function macroTone(x: number, y: number): number { return 0.92 + 0.16 * noise2(x * 0.11 + 70, y * 0.11 + 50); }

/**
 * Cor de um tile (terreno em x, y com variação `decor`) já modulada pelo ruído de baixa frequência: manchas secas na
 * grama (o mesmo dryness que o shader do terreno lê em uKind.b), topo claro na montanha, jitter leve de matiz por tile.
 * É a base do minimapa, coerente com o terreno por shader sem precisar de uma RenderTexture.
 */
export function tileColor(terrain: number, x: number, y: number, decor: number): number {
  let c = terrainColor(terrain);
  if (terrain === TERRAIN.GRASS) c = mixColor(c, GRASS_DRY, dryness(x, y) * 0.85);
  else if (terrain === TERRAIN.MOUNTAIN) { const n = noise2(x * 0.3 + 5, y * 0.3 + 77); if (n > 0.6) c = mixColor(c, MOUNTAIN_TOP, (n - 0.6) * 2); }
  const j = 0.96 + (decor % 64) / 64 * 0.08;
  return scaleColor(c, j * macroTone(x, y));
}
