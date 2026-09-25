// Paleta compartilhada da renderização: cor-base de cada terreno (usada pelas transições dos chunks, pelo minimapa e
// pelas sobreposições do editor) e cores das regiões conexas do overlay do editor. Fica fora do núcleo determinístico.
import { TERRAIN } from '../core/constants';

/** Cor-base (0xRRGGBB) de cada terreno; 6 = água profunda forçada pelo pincel do editor. */
export const TERRAIN_PALETTE: Record<number, number> = {
  [TERRAIN.GRASS]: 0x4f8a34,
  [TERRAIN.WATER]: 0x2f79b5,
  [TERRAIN.MOUNTAIN]: 0x74736c,
  [TERRAIN.SAND]: 0xd8c78c,
  [TERRAIN.DIRT]: 0x8a6b40,
  [TERRAIN.DEEP]: 0x1f5a8f,
  6: 0x1f5a8f,
};

/** Cor de um terreno (magenta para valores desconhecidos, para saltar à vista). */
export function terrainColor(t: number): number { return TERRAIN_PALETTE[t] ?? 0xff00ff; }

/** Mesma cor em '#rrggbb' para canvas 2D. */
export function terrainHex(t: number): string { return '#' + terrainColor(t).toString(16).padStart(6, '0'); }

/** Cores translúcidas das regiões conexas (rótulo → cor cíclica), distintas entre vizinhas na maioria dos mapas. */
export const REGION_PALETTE: number[] = [0xf97316, 0x22d3ee, 0xa3e635, 0xe879f9, 0xfacc15, 0x60a5fa, 0xf472b6, 0x34d399, 0xfb7185, 0xc084fc, 0x38bdf8, 0xfbbf24];
export function regionColor(label: number): number { return REGION_PALETTE[label % REGION_PALETTE.length]; }
