// Terreno fotográfico (docs/ART.md Apêndice I): texturas CC0 do Poly Haven em public/terrain (scripts/terrain-photos.ts),
// empacotadas em runtime por src/render/terrain/photos.ts no mesmo formato do gerador procedural.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { generateMaterials } from '../src/render/terrain/materials';
import { PHOTO_MATERIALS, PHOTO_SIZE, packPhoto, halveRGBA, halveMaterial } from '../src/render/terrain/photos';

const DIR = path.resolve(__dirname, '..', 'public', 'terrain');
const read = (f: string) => PNG.sync.read(fs.readFileSync(path.join(DIR, f)));
const mean = (a: ArrayLike<number>, c: number) => { let s = 0; for (let i = c; i < a.length; i += 4) s += a[i]; return s / (a.length / 4); };

describe('terreno fotográfico: arquivos em public/terrain', () => {
  const index = JSON.parse(fs.readFileSync(path.join(DIR, 'fotos.json'), 'utf8')) as { size: number; license: string; materials: Record<string, { id: string; url: string; authors: string[]; license: string }> };
  it('os 4 materiais têm albedo, normal e altura/oclusão 512², opacos e de fonte CC0 com autor', () => {
    expect(index.size).toBe(PHOTO_SIZE);
    for (const m of PHOTO_MATERIALS) {
      const src = index.materials[m];
      expect(src.license, m).toBe('CC0-1.0');
      expect(src.url, m).toMatch(/^https:\/\/polyhaven\.com\/a\//);
      expect(src.authors.length, m).toBeGreaterThan(0);
      for (const k of ['albedo', 'normal', 'hao']) {
        const p = read(`${m}-${k}.png`);
        expect([p.width, p.height], `${m}-${k}`).toEqual([PHOTO_SIZE, PHOTO_SIZE]);
        let opaque = true; for (let i = 3; i < p.data.length; i += 4) if (p.data[i] !== 255) { opaque = false; break; }
        expect(opaque, `${m}-${k} opaco (o canvas pré-multiplica o alfa)`).toBe(true);
      }
    }
  });
  it('a cor e a altura média de cada material ficam nas do procedural (tom mediterrâneo e equilíbrio do height blend)', () => {
    const proc = generateMaterials(PHOTO_SIZE);
    for (const m of PHOTO_MATERIALS) {
      const a = read(`${m}-albedo.png`).data, h = read(`${m}-hao.png`).data;
      for (let c = 0; c < 3; c++) expect(Math.abs(mean(a, c) - mean(proc[m].albedo, c)), `${m} canal ${c}`).toBeLessThan(20);
      expect(Math.abs(mean(h, 0) - mean(proc[m].albedo, 3)), `${m} altura`).toBeLessThan(3);
      // a altura nunca zera em manchas inteiras (peso (h + 0,2)⁶ do shader): no máximo 1 % abaixo de 8
      let low = 0; for (let i = 0; i < h.length; i += 4) if (h[i] < 8) low++;
      expect(low / (h.length / 4), `${m} altura ~0`).toBeLessThan(0.01 + (m === 'rock' ? 0.02 : 0));
    }
    const g = read('grass-albedo.png').data, d = read('dirt-albedo.png').data;
    expect(mean(g, 1)).toBeGreaterThan(mean(g, 0) - 10);   // grama: verde-oliva, não palha
    expect(mean(d, 0)).toBeGreaterThan(mean(d, 1)); expect(mean(d, 1)).toBeGreaterThan(mean(d, 2));   // terra parda
  });
  it('tileáveis (o salto da última coluna para a primeira é da ordem do salto entre colunas vizinhas) e normais unitárias', () => {
    for (const m of PHOTO_MATERIALS) {
      const a = read(`${m}-albedo.png`).data, N = PHOTO_SIZE;
      let wrap = 0, inner = 0;
      for (let y = 0; y < N; y++) for (let c = 0; c < 3; c++) { const r = y * N * 4 + c; wrap += Math.abs(a[r] - a[r + (N - 1) * 4]); inner += Math.abs(a[r + 256 * 4] - a[r + 255 * 4]); }
      expect(wrap, m).toBeLessThan(inner * 2.5 + N);
      const n = read(`${m}-normal.png`).data;
      let bad = 0;
      for (let i = 0; i < n.length; i += 4) { const x = n[i] / 127.5 - 1, y = n[i + 1] / 127.5 - 1, z = n[i + 2] / 127.5 - 1; if (Math.abs(Math.sqrt(x * x + y * y + z * z) - 1) > 0.05 || z < 0.2) bad++; }
      expect(bad, m).toBe(0);
    }
  });
});

describe('terreno fotográfico: empacotamento em runtime', () => {
  it('packPhoto põe a altura no alfa do albedo e a oclusão no alfa da normal', () => {
    const a = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]), n = new Uint8Array([128, 127, 250, 255, 100, 140, 230, 255]), h = new Uint8Array([7, 200, 0, 255, 99, 33, 0, 255]);
    const m = packPhoto(a, n, h);
    expect([...m.albedo]).toEqual([10, 20, 30, 7, 40, 50, 60, 99]);
    expect([...m.normal]).toEqual([128, 127, 250, 200, 100, 140, 230, 33]);
  });
  it('halveRGBA: média 2×2 e normal renormalizada; halveMaterial leva 512² a 256²', () => {
    const s = 4, src = new Uint8Array(s * s * 4);
    for (let i = 0; i < src.length; i += 4) { src[i] = 200; src[i + 1] = 100; src[i + 2] = (i / 4) % 2 ? 0 : 255; src[i + 3] = 255; }
    const h = halveRGBA(src, s);
    expect(h.length).toBe(2 * 2 * 4);
    expect([h[0], h[1], h[2], h[3]]).toEqual([200, 100, 128, 255]);
    // normal inclinada para +x e −x em colunas alternadas: a média aponta para cima e continua unitária
    const nrm = new Uint8Array(s * s * 4);
    for (let i = 0; i < nrm.length; i += 4) { const px = (i / 4) % 2 ? 1 : -1; nrm[i] = Math.round(127.5 + px * 0.6 * 127.5); nrm[i + 1] = 128; nrm[i + 2] = Math.round(127.5 + 0.8 * 127.5); nrm[i + 3] = 255; }
    const hn = halveRGBA(nrm, s, true);
    expect(Math.abs(hn[0] - 128)).toBeLessThanOrEqual(1);
    expect(hn[2]).toBeGreaterThan(250);
    const mat = { albedo: new Uint8Array(PHOTO_SIZE * PHOTO_SIZE * 4).fill(120), normal: new Uint8Array(PHOTO_SIZE * PHOTO_SIZE * 4).fill(128) };
    const half = halveMaterial(mat, PHOTO_SIZE);
    expect(half.albedo.length).toBe(256 * 256 * 4);
  });
});
