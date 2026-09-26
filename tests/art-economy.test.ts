// Etapa 3, lote "economia" (docs/ART.md Apêndice D): fazenda, celeiro, serraria, mina, mercado, academia e cornucópia.
// Plantação da fazenda (variante farmCrop, ciclo de colheita no renderizador), manifestos (pegada = dados do jogo,
// 6 estados, ícone, time, folha de contato) e o contrato com os atlas de public/art — toda chave que o renderizador vai
// pedir existe na cor e na sombra (e na máscara de time) nas duas escalas, com âncora e moldura fixas por edifício.
// A parte dos atlas exige o bake local destes manifestos (`npm run art:bake -- --scale 1,2`).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadManifests, validateManifest, expandFrames, BUILDING_STATES, VARIANT_BY } from '../scripts/bake/manifest.mjs';
import { ECONOMY_BUILDERS } from '../scripts/bake/page/rigs/buildings-economy.js';
import { FARM_CROPS, FARM_CYCLE, farmCrop, buildingVariant, buildingFrameName, rubbleName } from '../src/render/art/logic';
import { BUILDINGS } from '../src/core/data';
import type { ArtManifest, SheetJson } from '../src/render/art/types';

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'public', 'art');
const LOT = ['farm', 'granary', 'lumber_camp', 'mine', 'market', 'academy', 'cornucopia'];
const manifests = loadManifests(path.join(ROOT, 'art', 'manifest')).map((l) => l.manifest);

describe('fazenda: plantação por ciclo de colheita (variante farmCrop)', () => {
  it('semeado → crescendo → maduro → semeado de novo, em FARM_CYCLE s de jogo desde a colocação', () => {
    expect([...FARM_CROPS]).toEqual(['sown', 'growing', 'ripe']);
    expect(farmCrop(0)).toBe('sown');
    expect(farmCrop(25)).toBe('sown');                               // a obra (25 s) termina ainda no semeado
    expect(farmCrop(FARM_CYCLE * 0.45)).toBe('growing');
    expect(farmCrop(FARM_CYCLE * 0.8)).toBe('ripe');
    expect(farmCrop(FARM_CYCLE * 1.05)).toBe('sown');                // colhido e semeado de novo
    expect(farmCrop(FARM_CYCLE * 3.5)).toBe('growing');
    expect(farmCrop(-10)).toBe('sown'); expect(farmCrop(Number.NaN)).toBe('sown');
    // as três fases aparecem num ciclo, nessa ordem
    const seq: string[] = [];
    for (let t = 0; t < FARM_CYCLE; t += 1) { const c = farmCrop(t); if (seq[seq.length - 1] !== c) seq.push(c); }
    expect(seq).toEqual(['sown', 'growing', 'ripe']);
  });
  it('defasagem por id (≤ 12 % do ciclo): fazendas colocadas juntas não trocam no mesmo quadro; a obra continua no semeado', () => {
    const at = (id: number) => { for (let t = 0; t < FARM_CYCLE; t += 0.5) if (farmCrop(t, id) !== 'sown') return t; return -1; };
    const starts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(at));
    expect(starts.size).toBeGreaterThan(4);
    for (let id = 0; id < 200; id++) { expect(farmCrop(25, id), `id ${id}`).toBe('sown'); expect(at(id)).toBeGreaterThan(FARM_CYCLE * 0.17); }
  });
  it('buildingVariant: farmCrop pelo tempo; sem tempo (fantasma de construção) → semeado; o esquema aceita o critério', () => {
    expect(buildingVariant('farmCrop', { mask: 0, age: 0, crop: FARM_CYCLE * 0.8, id: 0 })).toBe('ripe');
    expect(buildingVariant('farmCrop', { mask: 0, age: 0 })).toBe('sown');
    expect(buildingVariant('ageTier', { mask: 0, age: 3, crop: 999 })).toBe('a2');   // os outros critérios ignoram o campo
    expect(VARIANT_BY).toContain('farmCrop');
  });
});

describe('manifestos do lote economia', () => {
  it('um manifesto por edifício, válido, com a pegada do jogo, os 6 estados, ícone, time, sombra e um construtor', () => {
    for (const id of LOT) {
      const m = manifests.find((x) => x.id === id)!;
      expect(m, id).toBeTruthy();
      expect(validateManifest(m), id).toEqual([]);
      expect(m.kind).toBe('building');
      expect(m.footprint, id).toEqual([BUILDINGS[id].w, BUILDINGS[id].h]);
      expect(Object.keys(m.anims!), id).toEqual([...BUILDING_STATES]);
      expect(m.team && m.shadow, id).toBe(true);
      expect(m.icon?.anim, id).toBe('complete');
      expect(m.contact, id).toBe('economia');
      const style = m.source.type === 'param' ? String(m.source.params?.style) : '';
      expect(typeof ECONOMY_BUILDERS[style], `${id}: construtor ${style}`).toBe('function');
      // a caixa de render cobre a pegada com folga para o entulho do dano (≥ 1,3 tile à esquerda do centro)
      expect(m.size.tiles[0] * m.anchor[0], id).toBeGreaterThanOrEqual(m.footprint![0] / 2 + 0.3);
    }
  });
  it('fazenda: 3 variantes de plantação em todos os estados (+ ícone maduro)', () => {
    const farm = manifests.find((m) => m.id === 'farm')!;
    expect([farm.variantBy, farm.variants]).toEqual(['farmCrop', ['sown', 'growing', 'ripe']]);
    expect(farm.icon).toEqual({ anim: 'complete', variant: 'ripe' });
    const names = expandFrames(farm).filter((f) => !f.icon).map((f) => f.name);
    expect(names).toHaveLength(6 * 3);
    expect(names).toEqual(expect.arrayContaining(['farm/build0/sown', 'farm/complete/growing', 'farm/damage2/ripe']));
    for (const id of LOT.filter((x) => x !== 'farm')) expect(manifests.find((m) => m.id === id)!.variants, id).toBeUndefined();
  });
});

const hasArt = fs.existsSync(path.join(ART, 'manifest.json'));
describe.skipIf(!hasArt)('atlas do lote economia (public/art)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8')) as ArtManifest;
  const sheets = new Map<string, SheetJson>();
  for (const a of manifest.atlases) sheets.set(a.json, JSON.parse(fs.readFileSync(path.join(ART, a.json), 'utf8')) as SheetJson);
  const passOf = (group: string, scale: number, pass: string) => {
    const frames = new Set<string>();
    for (const a of manifest.atlases) if (a.group === group && a.scale === scale && a.pass === pass) for (const k of Object.keys(sheets.get(a.json)!.frames)) frames.add(k);
    return frames;
  };
  const scales = [1, 2];

  it('todo estado × variante na cor e na sombra, máscara de time, ícone e escombros da pegada, nas duas escalas', () => {
    for (const id of LOT) {
      const a = manifest.assets[id];
      expect(a?.kind, `${id} no índice (rode o bake)`).toBe('building');
      expect(a.icon, id).toBe(true);
      for (const s of scales) {
        const color = passOf('buildings', s, 'color'), shadow = passOf('buildings', s, 'shadow'), team = passOf('buildings', s, 'team');
        let withTeam = 0;
        for (const st of BUILDING_STATES) for (const v of a.variants ?? [null]) {
          const n = buildingFrameName(id, st, v);
          expect(color.has(n), `${n} cor ${s}x`).toBe(true);
          expect(shadow.has(n), `${n} sombra ${s}x`).toBe(true);
          if (team.has(n)) withTeam++;
        }
        // estandarte/toldo/espantalho de time em todo quadro pronto (e na bandeirola da obra)
        expect(withTeam, `${id} máscara ${s}x`).toBe(BUILDING_STATES.length * (a.variants?.length ?? 1));
        expect(passOf('icons', s, 'color').has(id) && passOf('icons', s, 'team').has(id), `${id} ícone ${s}x`).toBe(true);
        expect(color.has(rubbleName(BUILDINGS[id].w, BUILDINGS[id].h)), `${id} escombros ${s}x`).toBe(true);
      }
    }
    expect(manifest.assets.farm.variantBy).toBe('farmCrop');
  });
  it('âncora e moldura iguais em todos os estados/variantes de cada edifício (a vista troca só a textura)', () => {
    for (const id of LOT) for (const s of scales) {
      const size = manifest.assets[id].sizes![String(s)];
      let n = 0;
      for (const a of manifest.atlases) if (a.group === 'buildings' && a.scale === s) for (const [k, f] of Object.entries(sheets.get(a.json)!.frames)) if (k.startsWith(id + '/')) {
        expect(f.anchor, k).toEqual(size.anchor); expect(f.sourceSize, k).toEqual(size.sourceSize); n++;
      }
      expect(n, `${id} ${s}x`).toBeGreaterThanOrEqual(6 * 3);   // cor, sombra e máscara dos 6 estados
    }
  });
});
