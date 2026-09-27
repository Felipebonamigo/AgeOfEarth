// Tipos de scripts/bake/measure.mjs (usado pelos testes em TypeScript).
export declare const MOVE_ANIMS: readonly string[];
export interface UnitMeasure { strides: Record<string, number>; tops: number[] }
export declare function measureUnit(m: unknown, poses: { main: unknown; rider: unknown }): UnitMeasure | null;
export declare function bodyHeight(m: unknown, poses: { main: unknown; rider: unknown }, anim: string, frame: number): number | null;
export declare function footSamples(m: unknown, poses: { main: unknown; rider: unknown }, anim: string): { low: number; z: number }[][] | null;
