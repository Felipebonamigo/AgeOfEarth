import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadManifests, validateManifest, validateAll, expandFrames, animationsOf, FRAME_NAME_RE, GROUP_OF } from '../scripts/bake/manifest.mjs';
import { runCheck, BUDGET } from '../scripts/bake/check';
import { alphaBounds, packShelf, blit, sheetJson } from '../scripts/bake/page/atlas.js';
import { DIRS, PAD, EXTRUDE } from '../scripts/bake/page/camera.js';

const ROOT = path.resolve(__dirname, '..');
const manifests = loadManifests(path.join(ROOT, 'art', 'manifest')).map((l) => l.manifest);
const hasArt = fs.existsSync(path.join(ROOT, 'public', 'art', 'manifest.json'));

describe('manifestos de arte (docs/ART.md §3.4)', () => {
  it('existem os manifestos da Etapa 2 (hoplita, cidadão, templo, árvores, nós)', () => {
    expect(manifests.map((m) => m.id).sort()).toEqual(expect.arrayContaining(['hoplite', 'villager', 'temple', 'props-trees', 'props-nodes']));
  });
  it('todo manifesto é válido pelo esquema mínimo e os ids/quadros são únicos', () => {
    for (const m of manifests) expect(validateManifest(m), m.id).toEqual([]);
    expect(validateAll(manifests)).toEqual([]);
    expect(new Set(manifests.map((m) => m.id)).size).toBe(manifests.length);
  });
  it('âncoras dentro de [0,1] (manifesto e itens de props)', () => {
    for (const m of manifests) {
      for (const v of m.anchor) expect(v >= 0 && v <= 1, m.id).toBe(true);
      if (m.source.type === 'param') for (const it of m.source.items ?? []) for (const v of it.anchor ?? []) expect(v >= 0 && v <= 1).toBe(true);
    }
  });
  it('nomes de quadro seguem o padrão <id>/<anim>/<dir>/<nn> · <id>/<estado> · <kind>/<variante>[/<tag>]', () => {
    for (const m of manifests) for (const f of expandFrames(m)) expect(FRAME_NAME_RE[m.kind].test(f.name), f.name).toBe(true);
    expect(FRAME_NAME_RE.unit.test('hoplite/walk/3/05')).toBe(true);
    expect(FRAME_NAME_RE.unit.test('hoplite/walk/8/05')).toBe(false);
    expect(FRAME_NAME_RE.building.test('temple/build0')).toBe(true);
    expect(FRAME_NAME_RE.prop.test('olive/2/big')).toBe(true);
  });
  it('unidades: 8 direções × quadros declarados; cidadão tem carregar 6 e coletar 4', () => {
    const v = manifests.find((m) => m.id === 'villager')!;
    expect(v.anims).toMatchObject({ idle: { frames: 4 }, walk: { frames: 8 }, attack: { frames: 6 }, die: { frames: 6 }, carry: { frames: 6 }, gather: { frames: 4 } });
    expect(expandFrames(v).length).toBe(DIRS * (4 + 8 + 6 + 6 + 6 + 4));
    const anims = animationsOf(v);
    expect(Object.keys(anims).length).toBe(6 * DIRS);
    expect(anims['villager/walk/3']).toEqual(Array.from({ length: 8 }, (_, i) => `villager/walk/3/0${i}`));
    // --mirror: só 5 direções assadas; E/SE/NE apontam para O/SO/NO
    expect(new Set(expandFrames(v, { mirror: true }).map((f) => f.dir))).toEqual(new Set([2, 3, 4, 5, 6]));
    expect(animationsOf(v, { mirror: true })['villager/idle/0'][0]).toBe('villager/idle/4/00');
  });
  it('templo tem 3 estágios de obra + completo; props cobrem árvores, tocos, rochas, frutas, ouro e animais', () => {
    const t = manifests.find((m) => m.id === 'temple')!;
    expect(expandFrames(t).map((f) => f.name)).toEqual(['temple/build0', 'temple/build1', 'temple/build2', 'temple/complete']);
    const props = manifests.filter((m) => m.kind === 'prop').flatMap((m) => expandFrames(m).map((f) => f.name));
    for (const k of ['olive/0/big', 'cypress/3/small', 'oak/0/thin', 'stump/2', 'rock/5', 'berry/empty', 'gold/2', 'lure/0', 'deer/6', 'boar/0']) expect(props).toContain(k);
    expect(GROUP_OF).toEqual({ unit: 'units', building: 'buildings', prop: 'props' });
  });
});

describe('empacotador de atlas (scripts/bake/page/atlas.js)', () => {
  it('recorte pelo alfa', () => {
    const w = 5, h = 4, px = new Uint8Array(w * h * 4);
    px[(2 * w + 3) * 4 + 3] = 255; px[(1 * w + 1) * 4 + 3] = 10;
    expect(alphaBounds(px, w, h)).toEqual({ x: 1, y: 1, w: 3, h: 2 });
    expect(alphaBounds(new Uint8Array(16), 2, 2)).toBeNull();
  });
  it('prateleiras sem sobreposição, com espaçamento e extrusão, grupo inteiro numa página', () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ key: `a/${i}`, group: i < 20 ? 'a' : 'b', w: 30 + (i % 7) * 11, h: 20 + (i % 5) * 13 }));
    const { pages } = packShelf(items, { maxSize: 320 });
    expect(pages.length).toBe(2);                     // os dois grupos não cabem juntos em 320²
    expect(() => packShelf(items, { maxSize: 128 })).toThrow(/não cabe/);
    for (const p of pages) {
      const groups = new Set(p.items.map((it) => (Number(it.key.split('/')[1]) < 20 ? 'a' : 'b')));
      expect(groups.size).toBe(1);
      for (const a of p.items) {
        expect(a.x - EXTRUDE >= 0 && a.y - EXTRUDE >= 0 && a.x + a.w + EXTRUDE <= p.w && a.y + a.h + EXTRUDE <= p.h).toBe(true);
        for (const b of p.items) if (a !== b) {
          const sep = PAD + 2 * EXTRUDE;
          const apart = a.x + a.w + sep <= b.x || b.x + b.w + sep <= a.x || a.y + a.h + sep <= b.y || b.y + b.h + sep <= a.y;
          expect(apart, `${a.key} × ${b.key}`).toBe(true);
        }
      }
    }
    expect(packShelf(items, { maxSize: 320 })).toEqual(packShelf(items, { maxSize: 320 }));   // determinístico
  });
  it('extrusão repete a borda e o JSON segue o formato Spritesheet do Pixi', () => {
    const dst = new Uint8Array(6 * 6 * 4);
    const src = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]);
    blit(dst, 6, 6, src, 2, 2, 2, 2, 1);
    expect([...dst.subarray((1 * 6 + 1) * 4, (1 * 6 + 1) * 4 + 4)]).toEqual([1, 2, 3, 255]);   // canto extrudado
    const j = sheetJson({ image: 'x.png', size: { w: 64, h: 64 }, scale: 1, frames: [{ name: 'hoplite/idle/0/00', x: 1, y: 1, w: 10, h: 12, trim: { x: 3, y: 4 }, sourceSize: { w: 20, h: 20 }, anchor: { x: 0.5, y: 0.8 } }], animations: { 'hoplite/idle/0': ['hoplite/idle/0/00'] }, aoe: { pass: 'color' } });
    expect(j.frames['hoplite/idle/0/00']).toMatchObject({ frame: { x: 1, y: 1, w: 10, h: 12 }, spriteSourceSize: { x: 3, y: 4, w: 10, h: 12 }, sourceSize: { w: 20, h: 20 }, anchor: { x: 0.5, y: 0.8 }, trimmed: true });
    expect(j.meta).toMatchObject({ image: 'x.png', scale: '1', format: 'RGBA8888', size: { w: 64, h: 64 } });
  });
});

describe('artefatos gerados (public/art, se existirem)', () => {
  it.runIf(hasArt)('art:check sem erros: quadros de todas as animações/direções presentes, hashes e orçamento', () => {
    const r = runCheck(ROOT);
    expect(r.errors).toEqual([]);
    expect(r.stats.pngBytes).toBeLessThanOrEqual(BUDGET.maxPngMB * 1048576);
    expect(r.stats.vramBytes).toBeLessThanOrEqual(BUDGET.maxVramMB * 1048576);
  });
  it.runIf(hasArt)('todo manifesto está no índice e as animações declaradas estão no JSON do atlas', () => {
    const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'art', 'manifest.json'), 'utf8'));
    for (const m of manifests) {
      const a = index.assets[m.id];
      expect(a, m.id).toBeTruthy();
      const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'art', a.atlases['1'].color[0]), 'utf8'));
      for (const [k, list] of Object.entries(animationsOf(m, { mirror: a.mirror }))) expect(json.animations[k], k).toEqual(list);
      for (const f of expandFrames(m, { mirror: a.mirror })) expect(json.frames[f.name], f.name).toBeTruthy();
    }
  });
});
