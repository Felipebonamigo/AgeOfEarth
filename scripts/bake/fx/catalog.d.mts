// Tipos de scripts/bake/fx/catalog.mjs (usados por scripts/bake/check.ts e pelos testes em TypeScript).
export declare const FX_DIRS: number;
export declare const FX_PROJECTILES: readonly string[];
export declare const FX_FIRE_FRAMES: number;
export interface FxItem { name: string; family: string; w: number; h: number; anchor: [number, number]; blend: 'normal' | 'add' | 'multiply'; draw: (scale: number) => Uint8Array }
export declare function fxItems(): FxItem[];
export declare function fxNames(): string[];
export declare function fxAnimations(): Record<string, string[]>;
export declare function fireRamp(I: number): [number, number, number];
