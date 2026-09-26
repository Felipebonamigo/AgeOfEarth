// Tipos de scripts/bake/page/rigs/units.js usados pelo lado TypeScript (testes, check.ts).
export type UnitRig = 'human' | 'horse' | 'siege';
export const UNIT_RIGS: Record<UnitRig, unknown>;
export const DEFAULT_POSES: Record<UnitRig, string>;
export const UNIT_KITS: Record<UnitRig, Record<string, string[]>>;
export const UNIT_POSE_KEYS: Record<UnitRig, { joints: string[]; scalars: string[] }>;
export const RIG_FILES: Record<UnitRig, string[]>;
