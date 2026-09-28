// Quadros 2D pintados (docs/ART_ASSETS.md §3.3, scripts/bake/frames2d.mjs): o importador lê a pasta do artista e grava o
// mesmo cache que o render grava. A ida e volta com um bake real (cidadão, byte a byte) é `node scripts/bake/bake.mjs
// --selftest-frames`; aqui, um manifesto sintético com PNGs gerados cobre nomes, tamanhos, passes, erros e a 1× derivada.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importFrames, frameKey, framePath, boxOf, writePng, readPng, toHalf, framesMeasure, frameSourceFiles, type Box, type FrameIn } from '../scripts/bake/frames2d.mjs';
import { expandFrames, validateManifest, type ArtManifest } from '../scripts/bake/manifest.mjs';


const unit: ArtManifest = {
  id: 'pintado', kind: 'unit', docs: 'quadros 2D de teste', source: { type: 'frames', path: 'x', stride: { walk: 0.9 } },
  size: { tiles: [1.7, 2.3] }, anchor: [0.5, 0.8], dirs: 8,
  anims: { idle: { frames: 1 }, walk: { frames: 2 }, attack: { frames: 1 }, die: { frames: 1 } }, team: true, shadow: true,
};

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'frames2d-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

/** Quadro sintético: um retângulo opaco de pé na âncora (w×h px), cor por direção. */
function paint(box: Box, dir: number, w = 6, h = 14): Uint8Array {
  const d = new Uint8Array(box.w * box.h * 4);
  for (let y = box.ay - h; y < box.ay; y++) for (let x = box.ax - w / 2; x < box.ax + w / 2; x++) { const i = (y * box.w + x) * 4; d[i] = 30 * dir; d[i + 1] = 200; d[i + 2] = 90; d[i + 3] = 255; }
  return d;
}
function frames(m: ArtManifest, scale: number): FrameIn[] {
  return (expandFrames(m) as unknown as FrameIn[]).map((f) => ({ ...f, box: boxOf(m, f, scale), box2: scale === 1 ? boxOf(m, f, 2) : null }));
}
function writeAll(m: ArtManifest, scale: number, passes = ['color'], w = 6) {
  for (const f of frames(m, scale)) for (const p of passes) writePng(framePath(path.join(root, 'x'), scale, p, frameKey(m, f)), f.box.w, f.box.h, paint(f.box, f.dir, w));
}

describe('quadros 2D pintados', () => {
  it('o manifesto de quadros é válido e o nome de cada arquivo sai do nome do quadro', () => {
    expect(validateManifest(unit)).toEqual([]);
    expect(validateManifest({ ...unit, source: { type: 'frames' } }).join()).toContain('source.path');
    expect(validateManifest({ ...unit, source: { type: 'frames', path: 'x', stride: { walk: -1 } } }).join()).toContain('stride');
    const f = frames(unit, 1);
    expect(f.length).toBe(8 * (1 + 2 + 1 + 1));
    expect(frameKey(unit, f.find((x) => x.anim === 'walk' && x.dir === 3 && x.frame === 1)!)).toBe('walk_3_01');
    expect(frameKey({ id: 'casa' }, { name: 'casa/complete/2' })).toBe('complete_2');
    expect(frameKey({ id: 'casa' }, { name: 'casa', icon: true })).toBe('icon');
    expect(frameKey({ id: 'props-trees' }, { name: 'tree/0/green' })).toBe('tree_0_green');
  });

  it('importa cor, time e sombra recortados na caixa, com a âncora no pé', () => {
    writeAll(unit, 1, ['color', 'team', 'shadow']);
    const tmp = path.join(root, 'cache');
    const r = importFrames({ root, m: unit, scale: 1, frames: frames(unit, 1), tmp });
    expect(r.errors).toEqual([]);
    expect(r.frames).toHaveLength(40);
    const fr = r.frames.find((x) => x.f.anim === 'idle' && x.f.dir === 0)!;
    const box = fr.f.box;
    expect(fr.passes.color).toMatchObject({ x: box.ax - 3, y: box.ay - 14, w: 6, h: 14 });
    for (const p of ['team', 'shadow']) expect(fr.passes[p]).toMatchObject({ w: 6, h: 14 });
    const png = readPng(path.join(tmp, fr.passes.color!.file));
    expect([png.w, png.h]).toEqual([6, 14]);
    // medidas para o índice: topo do corpo pelo alfa (14 px acima do pé) e a passada do manifesto
    const entry = { frames: r.frames.map((x) => ({ ...x.f, passes: x.passes })) };
    expect(framesMeasure(unit, entry, 1)).toEqual({ strides: { walk: 0.9 }, tops: [14, 14, 14, 14, 14, 14, 14, 14] });
  });

  it('falta de quadro, tamanho errado e PNG a mais viram erro ou aviso com o caminho', () => {
    writeAll(unit, 1);
    const base = path.join(root, 'x');
    const f = frames(unit, 1);
    fs.rmSync(framePath(base, 1, 'color', 'walk_5_01'));
    writePng(framePath(base, 1, 'color', 'die_2_00'), 10, 10, new Uint8Array(400));
    writePng(framePath(base, 1, 'color', 'walk_9_00'), f[0].box.w, f[0].box.h, new Uint8Array(f[0].box.w * f[0].box.h * 4));
    const r = importFrames({ root, m: unit, scale: 1, frames: f, tmp: path.join(root, 'cache') });
    expect(r.errors.some((e: string) => e.includes('falta') && e.includes('walk_5_01.png'))).toBe(true);
    expect(r.errors.some((e: string) => e.includes('die_2_00.png') && e.includes('10×10') && e.includes(`esperado ${f[0].box.w}×${f[0].box.h}`))).toBe(true);
    expect(r.warnings.some((w: string) => w.includes('walk_9_00.png') && w.includes('não é quadro'))).toBe(true);
    // sem a pasta da escala: erro claro
    const r2 = importFrames({ root, m: unit, scale: 2, frames: frames(unit, 2), tmp: path.join(root, 'cache2') });
    expect(r2.errors[0]).toContain('2x');
  });

  it('a 1× sai da 2× quando a pasta 1x falta: média 2×2 com as âncoras alinhadas (caixas que não dobram exatamente)', () => {
    // 1,7 tile: 54 px a 1× (âncora 27) e 109 px a 2× (âncora 55 = 2 × 27 + 1): a 2× desloca 1 px antes da média
    const b1 = boxOf(unit, { name: 'x' }, 1), b2 = boxOf(unit, { name: 'x' }, 2);
    expect([b1.w, b1.ax, b2.w, b2.ax]).toEqual([54, 27, 109, 55]);
    writeAll(unit, 2, ['color'], 8);
    const r = importFrames({ root, m: unit, scale: 1, frames: frames(unit, 1), tmp: path.join(root, 'cache') });
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w: string) => w.includes('derivada da 2×'))).toBe(true);
    const fr = r.frames[0];
    // retângulo de 8×14 a 2× centrado na âncora → 4×7 cheios a 1×, de pé na âncora da 1×
    expect(fr.passes.color).toMatchObject({ x: b1.ax - 2, y: b1.ay - 7, w: 4, h: 7 });
    const px = readPng(path.join(root, 'cache', fr.passes.color!.file));
    expect([...px.data].filter((_, k) => k % 4 === 3).every((a) => a === 255)).toBe(true);
    // toHalf: pixel da âncora da 2× cai no pixel da âncora da 1×
    const one = new Uint8Array(b2.w * b2.h * 4); const i = ((b2.ay - 1) * b2.w + b2.ax) * 4; one.set([255, 255, 255, 255], i);
    const h = toHalf({ w: b2.w, h: b2.h, data: one }, b2, b1);
    const at = (((b1.ay - 1) >> 0) * b1.w + b1.ax) * 4;
    expect([h.w, h.h]).toEqual([b1.w, b1.h]);
    expect(h.data[at + 3]).toBeGreaterThan(0);
  });

  it('o hash de entrada vê os PNGs das pastas 1x/2x (e ignora o guia e o LEIA-ME)', () => {
    writeAll(unit, 1);
    fs.writeFileSync(path.join(root, 'x', 'LEIA-ME.txt'), 'x');
    writePng(path.join(root, 'x', 'guia-1x.png'), 2, 2, new Uint8Array(16));
    const files = frameSourceFiles(root, 'x');
    expect(files).toHaveLength(40);
    expect(files.every((f: string) => f.startsWith(path.join('x', '1x', 'color')))).toBe(true);
  });
});
