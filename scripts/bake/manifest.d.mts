// Tipos de scripts/bake/manifest.mjs (usados por scripts/bake/check.ts e tests/art-manifest.test.ts).

export type AssetKind = 'unit' | 'building' | 'prop';
export type Pass = 'color' | 'team' | 'shadow';

export interface AnimDef { frames: number; fps?: number; loop?: boolean; pose?: string; clip?: string; params?: Record<string, unknown> }
export interface PropItem { kind: string; variants: (number | string)[]; tags?: string[]; size?: [number, number]; anchor?: [number, number] }
export interface ParamSource { type: 'param'; rig: 'human' | 'building' | 'props'; poses?: string; params?: Record<string, unknown>; items?: PropItem[] }
export interface GlbSource { type: 'glb'; path: string; scale: number; forward?: '-z' | '+z' | '+x' | '-x'; anims?: Record<string, string>; teamMaterials?: string[] }

export interface ArtManifest {
  id: string;
  kind: AssetKind;
  docs: string;
  source: ParamSource | GlbSource;
  size: { tiles: [number, number] };
  anchor: [number, number];
  dirs?: number;
  footprint?: [number, number];
  anims?: Record<string, AnimDef>;
  team: boolean;
  shadow: boolean;
}

export interface ExpandedFrame {
  name: string; group: string; anim?: string; dir: number; frame: number; frames: number; loop: boolean; pose?: string;
  params?: Record<string, unknown>; item?: { kind: string; variant: number | string; tag: string | null; size?: [number, number]; anchor?: [number, number] };
}

export const KINDS: AssetKind[];
export const GROUP_OF: Record<AssetKind, string>;
export const PASSES: Pass[];
export const RIGS: string[];
export const FRAME_NAME_RE: Record<AssetKind, RegExp>;
export function loadManifests(dir: string): { file: string; manifest: ArtManifest }[];
export function validateManifest(m: unknown): string[];
export function validateAll(list: ArtManifest[]): string[];
export function bakedDirs(m: ArtManifest, mirror?: boolean): number[];
export function expandFrames(m: ArtManifest, opts?: { mirror?: boolean }): ExpandedFrame[];
export function animationsOf(m: ArtManifest, opts?: { mirror?: boolean }): Record<string, string[]>;
export function animSummary(m: ArtManifest): Record<string, { frames: number; fps: number; loop: boolean }>;
export function matchesOnly(m: ArtManifest, only: string[] | null): boolean;
