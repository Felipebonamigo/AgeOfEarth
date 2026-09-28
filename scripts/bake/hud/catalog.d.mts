// Tipos de scripts/bake/hud/catalog.mjs (usado por art:check e pelos testes em TypeScript).
export interface HudSpec { kind: 'unit' | 'object' | 'god' | 'building'; key?: string; unit?: string; params?: Record<string, unknown>; frame?: Record<string, unknown>; team?: boolean; [k: string]: unknown }
export interface HudItem { name: string; size: number; spec: HudSpec }
export declare const ICON: number;
export declare const PORTRAIT: number;
export declare const TECH_ICONS: Record<string, HudSpec>;
export declare const POWER_ICONS: Record<string, HudSpec>;
export declare const GODS: string[];
export declare const AGE_ICONS: HudSpec[];
export declare const ABILITY_ICONS: Record<string, HudSpec>;
export declare const RESOURCE_ICONS: Record<string, HudSpec>;
export declare function techIconKey(id: string): string;
export declare function unitFrame(m: { id: string; source?: { rig?: string } }): Record<string, unknown>;
export declare function hudItems(manifests: Record<string, unknown>, poses: (m: unknown) => unknown): HudItem[];
/** Nomes dos ícones sem renderizar (unidades pelos ids dos manifestos de unidade). */
export declare function hudNames(unitIds: string[], buildingIds?: string[]): string[];
