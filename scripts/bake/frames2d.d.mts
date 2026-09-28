// Tipos de scripts/bake/frames2d.mjs (quadros 2D pintados, docs/ART_ASSETS.md §3.3).
import type { ArtManifest } from './manifest.mjs';
export interface Box { w: number; h: number; ax: number; ay: number }
export interface Img { w: number; h: number; data: Uint8Array }
export interface Rect { x: number; y: number; w: number; h: number; file: string }
export interface FrameIn { name: string; group?: string; anim?: string; dir: number; frame: number; icon?: boolean; box: Box; box2?: Box | null; [k: string]: unknown }
export function boxOf(m: ArtManifest | Record<string, unknown>, f: { icon?: boolean; item?: { size?: number[]; anchor?: number[] }; [k: string]: unknown }, scale: number): Box;
export function frameKey(m: { id: string }, f: { name: string; icon?: boolean }): string;
export function framePath(dir: string, scale: number, pass: string, key: string): string;
export function readPng(file: string): Img;
export function writePng(file: string, w: number, h: number, data: Uint8Array): void;
export function frameSourceFiles(root: string, rel: string): string[];
export function downsample2(img: Img): Img;
export function toHalf(img: Img, box2: Box, box1: Box): Img;
export function importFrames(o: { root: string; m: ArtManifest; scale: number; frames: FrameIn[]; tmp: string }): { frames: { f: FrameIn; passes: Record<string, Rect | null> }[]; errors: string[]; warnings: string[] };
export function framesMeasure(m: ArtManifest, entry: { frames: { anim?: string | null; dir: number; box: Box; passes: Record<string, Rect | null> }[] }, scale: number): { strides: Record<string, number>; tops: number[] };
export function exportFrames(o: { root: string; m: ArtManifest; entries: Record<number, unknown>; out: string; strides?: Record<string, number> | null }): { files: number; dir: string };
