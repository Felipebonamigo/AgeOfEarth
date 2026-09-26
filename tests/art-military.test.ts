// Lote "militar" da Etapa 3 (docs/ART.md Apêndice D): quartel, estábulo, oficina de cerco, fortaleza, portal dos titãs
// e as três maravilhas. Manifestos (estados, pegada, caixa dentro do orçamento, ícone), construtores registrados no bake,
// a sobreposição animada do portal (`glow`: nomes, loop, só no passe de cor) e — se o bake local existir — os quadros
// que o renderizador vai pedir, nas duas escalas.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadManifests, validateManifest, expandFrames, animationsOf, BUILDING_STATES } from '../scripts/bake/manifest.mjs';
import { BUILDINGS } from '../src/core/data';
import { GLOW_ANIM, glowVariant, glowFrameName, buildingFrameName, frameIndex } from '../src/render/art/logic';
import type { ArtManifest, SheetJson } from '../src/render/art/types';

const ROOT = path.resolve(__dirname, '..');
const LOT = ['barracks', 'stable', 'siege_workshop', 'fortress', 'titan_gate', 'wonder_zeus', 'wonder_artemis', 'wonder_colossus'];
const manifests = new Map(loadManifests(path.join(ROOT, 'art', 'manifest')).map((l) => [l.manifest.id, l.manifest]));

describe('lote militar: manifestos e construtores', () => {
  it('os 8 edifícios têm manifesto válido com os 6 estados, pegada do jogo, ícone, time e sombra', () => {
    for (const id of LOT) {
      const m = manifests.get(id)!;
      expect(m, id).toBeTruthy();
      expect(validateManifest(m), id).toEqual([]);
      expect(m.kind).toBe('building');
      expect(Object.keys(m.anims!), id).toEqual(expect.arrayContaining([...BUILDING_STATES]));
      expect(m.footprint, id).toEqual([BUILDINGS[id].w, BUILDINGS[id].h]);
      expect(m.icon, id).toEqual({ anim: 'complete' });
      expect([m.team, m.shadow], id).toEqual([true, true]);
      expect(m.source).toMatchObject({ type: 'param', rig: 'building', params: { style: id } });
    }
  });
  it('caixa de render dentro do orçamento (≤ 256 px a 1×) e com a pegada inteira dentro dela', () => {
    for (const id of LOT) {
      const m = manifests.get(id)!;
      const [w, h] = m.size.tiles, [ax, ay] = m.anchor, [fw, fh] = m.footprint!;
      expect(w * 32, id).toBeLessThanOrEqual(256);
      expect(h * 32, id).toBeLessThanOrEqual(256);
      // centro da área na caixa: sobra ≥ meia pegada para cada lado (mais o telhado acima e a sombra a leste/sul)
      expect(ax * w, id).toBeGreaterThanOrEqual(fw / 2);
      expect((1 - ax) * w, id).toBeGreaterThanOrEqual(fw / 2 + 0.5);
      expect(ay * h, id).toBeGreaterThanOrEqual(fh / 2 + 1);
      expect((1 - ay) * h, id).toBeGreaterThanOrEqual(fh / 2);
    }
  });
  it('o bake conhece os 8 estilos (registrados em buildings.js a partir de buildings-military.js)', async () => {
    // módulos da página do bake (JS puro, sem three.js no topo): importados pelo caminho, sem tipos
    const page = (f: string) => import(/* @vite-ignore */ path.join(ROOT, 'scripts', 'bake', 'page', f)) as Promise<Record<string, string[]>>;
    const { BUILDING_STYLES } = await page('buildings.js');
    const { MILITARY_STYLES } = await page('buildings-military.js');
    expect([...MILITARY_STYLES].sort()).toEqual([...LOT].sort());
    for (const id of LOT) expect(BUILDING_STYLES, id).toContain(id);
  });
  it('portal dos titãs: estado glow em loop (6 quadros) além dos 6 estados; as demais sem animação', () => {
    const tg = manifests.get('titan_gate')!;
    expect(tg.anims!.glow).toMatchObject({ frames: 6, loop: true });
    expect(tg.variants).toBeUndefined();
    const names = expandFrames(tg).map((f) => f.name);
    for (let i = 0; i < 6; i++) expect(names).toContain(`titan_gate/glow/0${i}`);
    expect(names).toContain('titan_gate/complete');
    expect(animationsOf(tg)['titan_gate/glow']).toEqual(Array.from({ length: 6 }, (_, i) => `titan_gate/glow/0${i}`));
    for (const id of LOT.filter((x) => x !== 'titan_gate')) for (const a of Object.values(manifests.get(id)!.anims!)) expect(a.frames, id).toBe(1);
  });
  it('quadro da sobreposição pelo relógio de jogo: loop a fps, mesmo nome que o bake grava', () => {
    expect(GLOW_ANIM).toBe('glow');
    expect(glowVariant(0, 6, 8)).toBe('00');
    expect(glowVariant(1 / 8, 6, 8)).toBe('01');
    expect(glowVariant(5.99 / 8, 6, 8)).toBe('05');
    expect(glowVariant(6 / 8, 6, 8)).toBe('00');                 // volta ao começo sem repetir o último
    expect(glowVariant(100.3, 6, 8)).toBe(String(frameIndex(100.3, 6, 8, true)).padStart(2, '0'));
    expect(glowFrameName('titan_gate', 2 / 8, 6, 8)).toBe(buildingFrameName('titan_gate', 'glow', '02'));
    expect(new Set(expandFrames(manifests.get('titan_gate')!).map((f) => f.name))).toContain(glowFrameName('titan_gate', 0.4, 6, 8));
  });
});

// ---------------- Artefatos do bake local (public/art), se já incluírem o lote ----------------
const ART = path.join(ROOT, 'public', 'art');
const index = fs.existsSync(path.join(ART, 'manifest.json')) ? (JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8')) as ArtManifest) : null;
const baked = !!index && LOT.every((id) => index.assets[id]);
describe.skipIf(!baked)('lote militar no atlas (bake local)', () => {
  const sheets = new Map<string, SheetJson>();
  for (const a of index!.atlases) sheets.set(a.json, JSON.parse(fs.readFileSync(path.join(ART, a.json), 'utf8')) as SheetJson);
  const passOf = (group: string, scale: number, pass: string) => {
    const frames = new Map<string, SheetJson['frames'][string]>(), anims = new Map<string, string[]>();
    for (const a of index!.atlases) if (a.group === group && a.scale === scale && a.pass === pass) {
      const j = sheets.get(a.json)!;
      for (const [k, v] of Object.entries(j.frames)) frames.set(k, v);
      for (const [k, v] of Object.entries(j.animations ?? {})) anims.set(k, v);
    }
    return { frames, anims };
  };
  const scales = [...new Set(index!.atlases.map((a) => a.scale))].sort();
  it('cada estado na cor e na sombra, a máscara de time (estandartes) no pronto, ícone, moldura ≤ 256 px por escala', () => {
    for (const id of LOT) for (const s of scales) {
      const color = passOf('buildings', s, 'color'), shadow = passOf('buildings', s, 'shadow'), team = passOf('buildings', s, 'team');
      for (const st of BUILDING_STATES) {
        const n = buildingFrameName(id, st);
        expect(color.frames.has(n), `${n} cor ${s}x`).toBe(true);
        expect(shadow.frames.has(n), `${n} sombra ${s}x`).toBe(true);
        expect(color.frames.get(n)!.sourceSize.w, n).toBeLessThanOrEqual(256 * s);
        expect(color.frames.get(n)!.sourceSize.h, n).toBeLessThanOrEqual(256 * s);
      }
      expect(team.frames.has(buildingFrameName(id, 'complete')), `${id} time ${s}x`).toBe(true);
      expect(passOf('icons', s, 'color').frames.has(id), `${id} ícone ${s}x`).toBe(true);
      expect(passOf('icons', s, 'team').frames.has(id), `${id} ícone time ${s}x`).toBe(true);
    }
  });
  it('portal: os 6 quadros do glow só no passe de cor, com a animação declarada e a mesma âncora do edifício', () => {
    for (const s of scales) {
      const color = passOf('buildings', s, 'color'), shadow = passOf('buildings', s, 'shadow'), team = passOf('buildings', s, 'team');
      const names = Array.from({ length: 6 }, (_, i) => `titan_gate/glow/0${i}`);
      expect(color.anims.get('titan_gate/glow'), `${s}x`).toEqual(names);
      const base = color.frames.get('titan_gate/complete')!;
      for (const n of names) {
        const f = color.frames.get(n)!;
        expect(f, n).toBeTruthy();
        expect([f.anchor, f.sourceSize], n).toEqual([base.anchor, base.sourceSize]);
        expect(shadow.frames.has(n) || team.frames.has(n), n).toBe(false);
      }
    }
    expect(index!.assets.titan_gate.anims!.glow).toMatchObject({ frames: 6, loop: true });
  });
});
