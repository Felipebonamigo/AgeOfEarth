// Modelos do Meshy no jogo (docs/ART.md Apêndice I, "Meshy"): edifícios com núcleo .glb, variante sorteada pela posição
// e o catálogo de licenças (só CC0 / CC BY 4.0 entram).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadManifests, validateManifest, glbPathsOf, VARIANT_BY, type ArtManifest } from '../scripts/bake/manifest.mjs';
import { pickVariant, buildingVariant } from '../src/render/art/logic';

const ROOT = path.resolve(__dirname, '..');
const manifests = loadManifests(path.join(ROOT, 'art', 'manifest')).map((l) => l.manifest);
const glbBuildings = manifests.filter((m) => m.kind === 'building' && m.source.type === 'param' && (m.source.params as { style?: string } | undefined)?.style === 'glb');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'art', 'meshy', 'catalogo.json'), 'utf8')) as { modelos: { arquivo: string; licenca: string; autor: string }[] };

describe('edifícios com núcleo .glb', () => {
  it('casa, templo e a maravilha de Zeus usam o núcleo .glb, com um modelo por variante, e os arquivos existem', () => {
    expect(glbBuildings.map((m) => m.id).sort()).toEqual(['house', 'temple', 'wonder_zeus']);
    for (const m of glbBuildings) {
      expect(validateManifest(m), m.id).toEqual([]);
      const paths = glbPathsOf((m.source as { params?: unknown }).params);
      expect(paths.length, m.id).toBe(m.variants?.length ?? 1);
      for (const p of paths) expect(fs.existsSync(path.join(ROOT, p)), p).toBe(true);
    }
  });
  it('o esquema recusa estilo glb sem modelo, sem tamanho ou faltando uma variante', () => {
    const house = manifests.find((m) => m.id === 'house')!;
    const withGlb = (glb: unknown) => ({ ...house, source: { type: 'param', rig: 'building', params: { style: 'glb', glb } } }) as ArtManifest;
    expect(validateManifest(withGlb(undefined)).join()).toMatch(/estilo glb/);
    expect(validateManifest(withGlb({ tavern: { path: 'a.glb', size: 2 } })).join()).toMatch(/estilo glb/);   // falta kalliope
    expect(validateManifest(withGlb({ tavern: { path: 'a.glb', size: 2 }, kalliope: { path: 'b.glb' } })).join()).toMatch(/estilo glb/);
    expect(validateManifest(withGlb({ tavern: { path: 'a.obj', size: 2 }, kalliope: { path: 'b.glb', size: 2 } })).join()).toMatch(/estilo glb/);
    expect(validateManifest(withGlb({ tavern: { path: 'a.glb', size: 2 }, kalliope: { path: 'b.glb', size: 2 } }))).toEqual([]);
  });
  it('todo modelo usado no jogo está no catálogo com licença CC0 ou CC BY 4.0', () => {
    const byFile = new Map(catalog.modelos.map((c) => [`art/meshy/${c.arquivo}`, c]));
    for (const m of glbBuildings) for (const p of glbPathsOf((m.source as { params?: unknown }).params)) {
      const c = byFile.get(p);
      expect(c, p).toBeTruthy();
      expect(['CC0', 'CC BY 4.0'], p).toContain(c!.licenca);
    }
  });
});

describe('variante sorteada pela posição (pick)', () => {
  const V = ['tavern', 'kalliope'];
  it('é estável, fica entre as variantes e não depende de buildingVariant', () => {
    expect(VARIANT_BY).toContain('pick');
    for (let i = 0; i < 50; i++) expect(pickVariant(V, i * 7, i * 3)).toBe(pickVariant(V, i * 7, i * 3));
    expect(pickVariant([], 3, 4)).toBeNull();
    expect(buildingVariant('pick', { mask: 0, age: 0 })).toBeNull();   // o renderizador chama pickVariant direto
  });
  it('mistura as variantes numa grade de casas (nenhuma passa de 65 %)', () => {
    const n: Record<string, number> = {};
    for (let y = 0; y < 40; y += 2) for (let x = 0; x < 40; x += 2) { const v = pickVariant(V, x, y)!; n[v] = (n[v] ?? 0) + 1; }
    const total = Object.values(n).reduce((a, b) => a + b, 0);
    for (const v of V) expect((n[v] ?? 0) / total, v).toBeGreaterThan(0.35);
    // vizinhas na mesma linha também variam (não sai tudo igual numa rua)
    const row = Array.from({ length: 12 }, (_, i) => pickVariant(V, i * 2, 10));
    expect(new Set(row).size).toBe(2);
  });
});
