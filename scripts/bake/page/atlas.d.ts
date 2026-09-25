// Tipos de scripts/bake/page/atlas.js (usado pelo bake.mjs e pelos testes).
export interface Rect { x: number; y: number; w: number; h: number }
export interface PackItem { key: string; group: string; w: number; h: number }
export interface PackedPage { w: number; h: number; items: (Rect & { key: string })[] }
export interface SheetFrameIn { name: string; x: number; y: number; w: number; h: number; trim: { x: number; y: number }; sourceSize: { w: number; h: number }; anchor: { x: number; y: number } }

export function alphaBounds(rgba: Uint8Array, w: number, h: number): Rect | null;
export function crop(rgba: Uint8Array, w: number, rect: Rect): Uint8Array;
export function flipX(rgba: Uint8Array, w: number, h: number): Uint8Array;
export function packShelf(items: PackItem[], opts?: { maxSize?: number; pad?: number; extrude?: number }): { pages: PackedPage[] };
export function blit(dst: Uint8Array, dw: number, dh: number, src: Uint8Array, w: number, h: number, x: number, y: number, extrude?: number): void;
export function sheetJson(o: { image: string; size: { w: number; h: number }; scale: number; frames: SheetFrameIn[]; animations: Record<string, string[]>; aoe: Record<string, unknown> }): {
  frames: Record<string, { frame: Rect; rotated: boolean; trimmed: boolean; spriteSourceSize: Rect; sourceSize: { w: number; h: number }; anchor: { x: number; y: number } }>;
  animations: Record<string, string[]>;
  meta: { app: string; version: string; image: string; format: string; size: { w: number; h: number }; scale: string; aoe: Record<string, unknown> };
};
