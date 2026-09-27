// Tipos de tests/feras-probe.mjs (sonda do rig do quadrúpede para tests/art-feras.test.ts).
export interface P3 { x: number; y: number; z: number }
export interface BeastProbe { heads: P3[]; jaws: P3[]; eyes: P3[]; tailTip: P3; wingTips: P3[]; wingEnds: P3[]; backTop: number; jawOpen: number }
export declare function probeBeast(params: Record<string, unknown>, def: unknown, frame: number, frames: number): BeastProbe;
