// Tipos das constantes de scripts/bake/page/camera.js usadas pelo lado TypeScript (check.ts, testes).
export const PIPELINE_VERSION: number;
export const PX_PER_TILE: number;
export const PITCH_DEG: number;
export const STRETCH_Y: number;
export const VERTICAL_FACTOR: number;
export const SUN_DIR: [number, number, number];
export const DIRS: number;
export const DIR_NAMES: string[];
export const FPS: number;
export const PAD: number;
export const EXTRUDE: number;
export const SSAA: number;
export const M2T: number;
export const MIRROR_BAKED: number[];
export const MIRROR_FROM: Record<number, number>;
export function dirYaw(dir: number, dirs?: number): number;
export function atlasMeta(o: { pass: string; scale: number; mirror: boolean }): Record<string, unknown>;
