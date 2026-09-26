// Atlas `fx` da Etapa 5 (scripts/bake/fx.mjs, docs/ART.md Apêndice F): o índice public/art/manifest.json tem o grupo
// `fx` com os itens do catálogo nas duas escalas, o renderizador (FX_FAMILIES) conhece as mesmas famílias com os mesmos
// tamanhos e âncoras, projéteis nas 8 direções, fogo em 8 quadros, VRAM pequena, `art:check` sem erro no grupo, e a
// baforada da fumaça igual ao gradiente da Etapa 3 (a fumaça não mudou de aparência).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PNG } from 'pngjs';
import { fxItems, fxNames, FX_PROJECTILES, FX_DIRS, FX_FIRE_FRAMES } from '../scripts/bake/fx/catalog.mjs';
import { fxInputHash } from '../scripts/bake/fx.mjs';
import { FX_FAMILIES, allFxNames, fxFrameName } from '../src/render/fx/FxTextures';
import { runCheck, fxErrors, BUDGET } from '../scripts/bake/check';

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'art');
const index = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
interface Frame { frame: { x: number; y: number; w: number; h: number }; spriteSourceSize: { x: number; y: number }; sourceSize: { w: number; h: number }; anchor: { x: number; y: number } }
const sheet = (json: string) => JSON.parse(fs.readFileSync(path.join(OUT, json), 'utf8')) as { frames: Record<string, Frame>; animations: Record<string, string[]>; meta: { image: string; scale: string } };

describe('atlas fx', () => {
  it('o índice tem o grupo fx nas escalas 1× e 2×, só o passe de cor, e os itens do catálogo', () => {
    const a = index.assets.fx;
    expect(a).toBeTruthy();
    expect(a.kind).toBe('fx');
    expect(a.items).toEqual(fxNames());
    expect(Object.keys(a.atlases).sort()).toEqual(['1', '2']);
    for (const s of ['1', '2']) { expect(a.atlases[s].color.length).toBeGreaterThan(0); expect(a.atlases[s].team ?? []).toEqual([]); expect(a.atlases[s].shadow ?? []).toEqual([]); }
  });
  it('o renderizador (FX_FAMILIES) conhece as mesmas famílias, quadros, tamanhos e âncoras do catálogo', () => {
    expect([...allFxNames()].sort()).toEqual([...fxNames()].sort());
    for (const it of fxItems()) {
      const f = FX_FAMILIES[it.family];
      expect(f, it.family).toBeTruthy();
      expect([f.w, f.h], it.name).toEqual([it.w, it.h]);
      expect([f.ax ?? 0.5, f.ay ?? 0.5], it.name).toEqual(it.anchor);
    }
    for (const [fam, f] of Object.entries(FX_FAMILIES)) for (let i = 0; i < f.n; i++) expect(fxNames()).toContain(fxFrameName(fam, i));
  });
  it('em cada escala: todos os quadros, sourceSize = tamanho × escala, projéteis em 8 direções, fogo em 8 quadros, PNG = índice', () => {
    const items = new Map(fxItems().map((i) => [i.name, i]));
    for (const e of index.atlases.filter((x: { group: string }) => x.group === 'fx')) {
      const sh = sheet(e.json);
      expect(sh.meta.scale).toBe(String(e.scale));
      const buf = fs.readFileSync(path.join(OUT, e.image));
      expect(crypto.createHash('sha256').update(buf).digest('hex')).toBe(e.sha256);
      for (const [name, it] of items) {
        const f = sh.frames[name];
        expect(f, `${name} ${e.scale}×`).toBeTruthy();
        expect(f.sourceSize).toEqual({ w: it.w * e.scale, h: it.h * e.scale });
        expect(f.anchor.x).toBeCloseTo(it.anchor[0], 4); expect(f.anchor.y).toBeCloseTo(it.anchor[1], 4);
      }
      for (const k of FX_PROJECTILES) expect(sh.animations[`proj/${k}`]).toEqual(Array.from({ length: FX_DIRS }, (_, d) => `proj/${k}/${d}`));
      expect(sh.animations.fire.length).toBe(FX_FIRE_FRAMES);
    }
  });
  it('VRAM pequena (≤ 2 MB por escala em texels de 1×) e art:check sem erro no grupo fx', () => {
    const r = runCheck(ROOT);
    const fx = r.errors.filter((m) => m.startsWith('fx') || m.includes('fx-'));
    expect(fx).toEqual([]);
    const sheets = new Map<string, never>();
    expect(fxErrors(index, sheets as never, [])).toContain('fx 1×: 91 quadros ausentes (ex.: proj/arrow/0, proj/arrow/1, proj/arrow/2)'.replace('91', String(fxNames().length)));
    for (const s of [1, 2]) {
      const bytes = index.atlases.filter((x: { group: string; scale: number }) => x.group === 'fx' && x.scale === s).reduce((t: number, x: { w: number; h: number }) => t + x.w * x.h * 4, 0);
      expect(bytes / s / s / 1048576).toBeLessThanOrEqual(BUDGET.maxFxVramMB);
    }
  });
  it('a baforada `puff` é o gradiente da fumaça da Etapa 3 (alfa 0,9 → 0,55 a 45 % → 0 na borda), a menos de 2/255', () => {
    const e = index.atlases.find((x: { group: string; scale: number }) => x.group === 'fx' && x.scale === 1);
    const sh = sheet(e.json), f = sh.frames.puff;
    const png = PNG.sync.read(fs.readFileSync(path.join(OUT, e.image)));
    const alphaAt = (x: number, y: number) => {
      const lx = x - f.spriteSourceSize.x, ly = y - f.spriteSourceSize.y;
      if (lx < 0 || ly < 0 || lx >= f.frame.w || ly >= f.frame.h) return 0;
      return png.data[((f.frame.y + ly) * png.width + f.frame.x + lx) * 4 + 3];
    };
    const old = (x: number, y: number) => {   // o createRadialGradient(16, 16, 1, 16, 16, 16) do SmokeLayer
      const r = Math.hypot(x + 0.5 - 16, y + 0.5 - 16), t = Math.min(1, Math.max(0, (r - 1) / 15));
      return 255 * (t <= 0.45 ? 0.9 + (0.55 - 0.9) * (t / 0.45) : 0.55 * (1 - (t - 0.45) / 0.55));
    };
    let worst = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) worst = Math.max(worst, Math.abs(alphaAt(x, y) - old(x, y)));
    expect(worst).toBeLessThanOrEqual(2);
  });
  it('projéteis iluminados: as 8 vistas não são cópias giradas (a luz de noroeste muda o sombreado) e a pedra rola', () => {
    const e = index.atlases.find((x: { group: string; scale: number }) => x.group === 'fx' && x.scale === 2);
    const sh = sheet(e.json);
    const png = PNG.sync.read(fs.readFileSync(path.join(OUT, e.image)));
    const lum = (name: string) => {
      const f = sh.frames[name].frame; let s = 0, n = 0;
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) { const k = (y * png.width + x) * 4; if (png.data[k + 3] > 200) { s += png.data[k] + png.data[k + 1] + png.data[k + 2]; n++; } }
      return s / Math.max(1, n);
    };
    for (const k of ['arrow', 'javelin', 'stone']) {
      const L = Array.from({ length: 8 }, (_, d) => lum(`proj/${k}/${d}`));
      expect(Math.max(...L) - Math.min(...L), k).toBeGreaterThan(3);
    }
  });
  it('o hash de entrada do gerador muda com a escala (cache por escala) e é estável', () => {
    expect(fxInputHash(1)).toBe(fxInputHash(1));
    expect(fxInputHash(1)).not.toBe(fxInputHash(2));
    expect(index.assets.fx.sourceHash).toBe(fxInputHash(1));
  });
});
