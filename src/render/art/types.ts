// Tipos do contrato do bake (parte A, docs/ART.md §3.3 e Apêndice B): manifest.json geral e JSON de atlas no formato
// Spritesheet do Pixi com o bloco meta.aoe. Sem dependência do Pixi: os testes em Node leem os mesmos arquivos do disco.

/** Versão do contrato que o renderizador entende. */
export const ART_CONTRACT_VERSION = 1;
/** Pixels por tile do atlas 1× (= TILE); o 2× tem o dobro. */
export const ART_PX_PER_TILE = 32;
/** Inclinação da câmera do bake (graus); um atlas assado com outra inclinação é recusado. */
export const ART_PITCH_DEG = 50;

export type ArtGroup = 'units' | 'buildings' | 'props' | 'icons';
export type ArtPass = 'color' | 'team' | 'shadow';
export type ArtScale = 1 | 2;

/** `stride` (animações de andar: walk/run/carry): tiles que o corpo avança num ciclo, medidos no rig pelo bake
 *  (scripts/bake/measure.mjs) — o renderizador avança o quadro pela distância andada e o pé não desliza. */
export interface ArtAnimInfo { frames: number; fps: number; loop: boolean; stride?: number }
export interface ArtSize { sourceSize: { w: number; h: number }; anchor: { x: number; y: number } }

/** Um asset do manifesto: unidade, edifício ou conjunto de props. */
export interface ArtAssetEntry {
  kind: 'unit' | 'building' | 'prop';
  group: ArtGroup;
  sourceHash?: string;
  dirs: number;
  mirror: boolean;
  team: boolean;
  shadow: boolean;
  frames: number;
  /** Tamanho da moldura e âncora por escala ('1', '2'); ausente nos props (cada item tem a sua, no JSON do atlas). */
  sizes?: Record<string, ArtSize>;
  anims?: Record<string, ArtAnimInfo>;
  /** Unidades: topo do corpo no parado por direção (px a 1× acima do pé, sem armas finas; measure.mjs) — régua da barra
   *  de vida. */
  tops?: number[];
  footprint?: [number, number];
  /** Edifícios: variantes (bitmask da muralha '00'–'15', eixo do portão 'ew'/'ns', Idade 'a0'–'a2') e o critério. */
  variants?: string[];
  variantBy?: 'wallMask' | 'gateAxis' | 'ageTier' | 'farmCrop';
  /** Conjunto de escombros (estados = pegadas '1x1'…'5x5'). */
  rubble?: boolean;
  /** Tem ícone no atlas `icons` (quadro com o nome do id). */
  icon?: boolean;
  /** Props: nomes dos itens (`<kind>/<variante>[/<tag>]`). */
  items?: string[];
  /** Arquivos JSON de atlas por escala e passe. */
  atlases: Record<string, Partial<Record<ArtPass, string[]>>>;
}

/** `texel`: densidade de texels em relação à escala (a sombra vem a ½ — `SHADOW_TEXEL` de scripts/bake/page/atlas.js). */
export interface ArtAtlasEntry { json: string; image: string; group: ArtGroup; pass: ArtPass; scale: number; texel?: number; page: number; w: number; h: number; frames: number; bytes: number; sha256: string }

export interface ArtManifest {
  version: number;
  app?: string;
  aoe: { version: number; pitchDeg: number; verticalFactor?: number; sun?: number[]; shadowDir?: string; dirs: number; dirNames?: string[]; fps: number; pad?: number; extrude?: number; mirror: boolean };
  atlases: ArtAtlasEntry[];
  assets: Record<string, ArtAssetEntry>;
  totals?: { pngBytes: number; vramBytes: number; atlases: number };
}

/** Bloco meta.aoe de um JSON de atlas. */
export interface SheetAoeMeta { version: number; pass: ArtPass; pxPerTile: number; pitchDeg: number; texel?: number; dirs?: number; fps?: number; mirror?: boolean; mirrored?: Record<string, number> }

/** Quadro do JSON de atlas (formato Spritesheet do Pixi + âncora). */
export interface SheetFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated?: boolean; trimmed?: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  anchor: { x: number; y: number };
}
export interface SheetJson { frames: Record<string, SheetFrame>; animations?: Record<string, string[]>; meta: { image: string; scale: string; format?: string; size?: { w: number; h: number }; aoe?: SheetAoeMeta } }
