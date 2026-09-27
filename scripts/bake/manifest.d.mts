// Tipos de scripts/bake/manifest.mjs (usados por scripts/bake/check.ts e tests/art-manifest.test.ts).

export type AssetKind = 'unit' | 'building' | 'prop';
export type Pass = 'color' | 'team' | 'shadow';

export interface AnimDef { frames: number; fps?: number; loop?: boolean; pose?: string; rider?: string; clip?: string; params?: Record<string, unknown>; /** Etapa 6: direções assadas desta animação (as outras usam a mais próxima: animDirOf). */ dirs?: number[] }
export interface PropItem { kind: string; variants: (number | string)[]; tags?: string[]; size?: [number, number]; anchor?: [number, number] }
export interface ParamSource { type: 'param'; rig: 'human' | 'horse' | 'siege' | 'beast' | 'giant' | 'serpent' | 'titan' | 'building' | 'props'; poses?: string; riderPoses?: string; params?: Record<string, unknown>; items?: PropItem[] }
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
  /** Edifícios: variantes (bitmask da muralha, eixo do portão, Idade, plantação da fazenda) e como o renderizador escolhe a variante. */
  variants?: string[];
  variantBy?: 'wallMask' | 'gateAxis' | 'ageTier' | 'farmCrop';
  /** Edifícios: ícone do HUD a partir de um estado (e variante). */
  icon?: { anim: string; variant?: string };
  /** Conjunto de escombros (um estado por pegada w×h). */
  rubble?: boolean;
  /** Folha de contato (`--contact`): etapa3-<contact>-contato.png; sem o campo, o nome da tabela do bake ou o id. */
  contact?: string;
  /** Etapa do prefixo da folha de contato (`etapa<stage>-<nome>-contato.png`); padrão 3 nos edifícios e 2 no resto. */
  stage?: number;
  team: boolean;
  shadow: boolean;
  /** Etapa 6: classe de tamanho (teto do quadro no art:check: SIZE_CLASSES), padrão 'unit'. */
  sizeClass?: 'unit' | 'myth' | 'titan';
  /** Etapa 6: escalas assadas (padrão todas as do CLI; [1] = só 1×, ex.: titãs). */
  scales?: (1 | 2)[];
  /** Etapa 6: unidade voadora (assada no ar; sem passada medida: o quadro de voo anda pelo relógio). */
  flying?: boolean;
  /** Etapa 6: 'own' = o asset começa páginas próprias no atlas (carregamento por tipo sem mexer nas páginas das outras). */
  page?: 'own';
  /** Etapa 6 (lote titãs): espelhamento só deste asset (5 direções assadas; E/SE/NE = O/SO/NO com scale.x = −1). */
  mirror?: boolean;
  /** Etapa 6: variantes da unidade pela entidade (hidra: cabeças 1–5), cada uma um asset `<id>_<by><valor>`. */
  unitVariants?: { by: 'heads'; param: string; values: number[] };
  /** Variante expandida: id base e valor (preenchidos por expandUnitVariants). */
  variantOf?: string;
  variantValue?: number;
  /** Direções nas folhas de contato (padrão as 8); `variantContactDirs` = as das variantes. */
  contactDirs?: number[];
  variantContactDirs?: number[];
}

export interface ExpandedFrame {
  name: string; group: string; anim?: string; dir: number; frame: number; frames: number; loop: boolean; pose?: string; rider?: string;
  variant?: string; atlas?: string; icon?: boolean;
  params?: Record<string, unknown>; item?: { kind: string; variant: number | string; tag: string | null; size?: [number, number]; anchor?: [number, number] };
}

export const KINDS: AssetKind[];
export const GROUP_OF: Record<AssetKind, string>;
export const PASSES: Pass[];
export const ATLAS_GROUPS: string[];
export const BUILDING_STATES: string[];
export const VARIANT_BY: string[];
export const ICON_PX: number;
export const RIGS: string[];
export const SIZE_CLASSES: Record<'unit' | 'myth' | 'titan', number>;
export const UNIT_VARIANT_BY: string[];
export function unitVariantId(m: ArtManifest, value: number): string;
export function expandUnitVariants(m: ArtManifest): ArtManifest[];
export function loadAssets(dir: string): ArtManifest[];
export function scalesOf(m: ArtManifest, wanted?: number[]): number[];
export function sizeCeiling(m: ArtManifest): number;
export const UNIT_RIG_POSES: Record<string, string>;
export const UNIT_ANIMS: string[];
export const REQUIRED_UNIT_ANIMS: string[];
export const ONCE_UNIT_ANIMS: string[];
export function posesOf(m: ArtManifest): { main: string | null; rider: string | null };
export function animDirOf(a: AnimDef | undefined, dir: number): number;
export function mirrorOf(m: ArtManifest, mirror?: boolean): boolean;
export function ownMirror(m: ArtManifest, mirror?: boolean): boolean;
export function packedDirs(m: ArtManifest, pass: 'color' | 'team' | 'shadow', mirror?: boolean): number[];
export const FRAME_NAME_RE: Record<AssetKind | 'icon', RegExp>;
export function atlasOf(m: ArtManifest, f: ExpandedFrame): string;
export function buildingFrame(id: string, state: string, variant?: string | null): string;
export function loadManifests(dir: string): { file: string; manifest: ArtManifest }[];
export function validateManifest(m: unknown): string[];
export function validateAll(list: ArtManifest[]): string[];
export function bakedDirs(m: ArtManifest, mirror?: boolean): number[];
export function expandFrames(m: ArtManifest, opts?: { mirror?: boolean }): ExpandedFrame[];
export function animationsOf(m: ArtManifest, opts?: { mirror?: boolean; pass?: 'color' | 'team' | 'shadow' }): Record<string, string[]>;
export function animSummary(m: ArtManifest): Record<string, { frames: number; fps: number; loop: boolean; dirs?: number[] }>;
export function matchesOnly(m: ArtManifest, only: string[] | null): boolean;
