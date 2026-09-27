// Integração da Etapa 6 da arte (docs/ART.md Apêndice G): com a arte assada ligada, NENHUMA unidade do jogo sai
// procedural — as 35 de `UNITS` (19 humanas/montadas/cerco, 13 míticas e 3 titãs), cada variante que a entidade pode ter
// (a hidra de 1 a 5 cabeças) e nos dois presets de escala (1× no Baixo/Médio, 2× no Alto; os titãs só têm 1× e o Alto usa a
// 1×). O teste passa pela ArtLibrary DE VERDADE (a mesma decisão `unit()` do renderizador: asset no índice, animações ×
// 8 direções no passe de cor, moldura) com um AtlasSource falso que serve os JSON do bake (public/art), sem Pixi nem GPU.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Status = 'idle' | 'loading' | 'ready' | 'failed';

vi.mock('../src/render/art/AtlasSource', () => {
  class FakeAtlas {
    manifest: unknown = null;
    manifestStatus: Status = 'idle';
    onChange: ((k: string) => void) | null = null;
    errors: string[] = [];
    uploads: unknown[] = [];
    gpuUpload = false;
    /** `${grupo}@${escala}@${passe}` → quadros e animações (a união das páginas, como o AtlasSource monta). */
    passes = new Map<string, unknown>();
    busyOf(): number { return 0; }
    async loadManifest(): Promise<void> {}
    scalesOf(): number[] { return [1, 2]; }
    status(): Status { return 'ready'; }
    ensure(): Status { return 'ready'; }
    assetStatus(): Status { return 'ready'; }
    ensureAsset(): Status { return 'ready'; }
    pass(group: string, scale: number, pass: string): unknown { return this.passes.get(`${group}@${scale}@${pass}`) ?? null; }
    ownsPages(): boolean { return false; }
    unloadAsset(): boolean { return false; }
    unloadScale(): void {}
    async idle(): Promise<void> {}
  }
  return { AtlasSource: FakeAtlas };
});

const { ArtLibrary } = await import('../src/render/art/ArtLibrary');
const { UNITS } = await import('../src/core/data');
const { loadManifests } = await import('../scripts/bake/manifest.mjs');

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'public', 'art');
const hasArt = fs.existsSync(path.join(ART, 'manifest.json'));

interface Sheet { frames: Record<string, { sourceSize: { w: number; h: number } }>; animations?: Record<string, string[]>; meta: { aoe?: { mirrored?: Record<string, number>; mirroredAssets?: Record<string, Record<string, number>> } } }
interface Idx { atlases: { json: string; group: string; scale: number; pass: string }[]; assets: Record<string, { kind: string; anims?: Record<string, { frames: number }>; atlases: Record<string, unknown>; unitVariants?: { ids: string[] } }> }

/** Variantes que a entidade de cada tipo pode ter (o núcleo: `special: 'heads'` = 1–5 cabeças; o resto, 1). */
const headsOf = (type: string): number[] => (UNITS[type].special === 'heads' ? [1, 2, 3, 4, 5] : [1]);

describe('Etapa 6: todo tipo de unidade do jogo tem manifesto de arte (nenhum fica no ProceduralSource)', () => {
  it('os 35 tipos de UNITS — humanos, montados, cerco, as 13 míticas e os 3 titãs — têm art/manifest/<tipo>.json de unidade', () => {
    const ids = new Set(loadManifests(path.join(ROOT, 'art', 'manifest')).map((l: { manifest: { id: string; kind: string } }) => l.manifest).filter((m: { kind: string }) => m.kind === 'unit').map((m: { id: string }) => m.id));
    const types = Object.keys(UNITS);
    expect(types).toHaveLength(35);
    expect(types.filter((t) => !ids.has(t))).toEqual([]);
    expect(types.filter((t) => UNITS[t].tags.includes('myth') && !UNITS[t].tags.includes('titan'))).toHaveLength(13);
    expect(types.filter((t) => UNITS[t].tags.includes('titan'))).toEqual(['prometheus', 'oceanus', 'cronus']);
  });
});

describe.skipIf(!hasArt)('Etapa 6: com a arte ligada, nenhuma unidade sai procedural (bake local)', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8')) as Idx;
  /** A ArtLibrary do renderizador sobre os JSON do bake: cada passe = união das páginas do grupo/escala. */
  function library(scale: 1 | 2) {
    const lib = new ArtLibrary({} as never);
    const atlas = lib.atlas as unknown as { manifest: unknown; manifestStatus: Status; passes: Map<string, unknown> };
    atlas.manifest = index; atlas.manifestStatus = 'ready';
    for (const a of index.atlases) {
      if (a.group !== 'units') continue;
      const j = JSON.parse(fs.readFileSync(path.join(ART, a.json), 'utf8')) as Sheet;
      const key = `${a.group}@${a.scale}@${a.pass}`;
      type Pass = { frames: Map<string, unknown>; anims: Map<string, unknown[]>; mirrored: Record<string, number> | null; mirroredBy?: Map<string, Record<string, number>> };
      const p: Pass = (atlas.passes.get(key) as Pass | undefined) ?? { frames: new Map(), anims: new Map(), mirrored: null };
      // textura falsa: só o que `unit()` lê (a altura do quadro e o recorte)
      const tex = (name: string) => ({ orig: { height: j.frames[name].sourceSize.h }, trim: null });
      for (const name of Object.keys(j.frames)) p.frames.set(name, tex(name));
      for (const [name, list] of Object.entries(j.animations ?? {})) p.anims.set(name, list.map(tex));
      if (j.meta.aoe?.mirrored) p.mirrored = { ...(p.mirrored ?? {}), ...j.meta.aoe.mirrored };
      for (const [id, mm] of Object.entries(j.meta.aoe?.mirroredAssets ?? {})) (p.mirroredBy ??= new Map()).set(id, mm);
      atlas.passes.set(key, p);
    }
    lib.configure(true, scale);
    return lib;
  }

  for (const scale of [1, 2] as const) {
    it(`preset ${scale === 1 ? 'Baixo/Médio (1×)' : 'Alto (2×)'}: as 35 unidades e as 5 hidras saem assadas, com parado, andar, golpe e queda`, () => {
      const lib = library(scale);
      const procedural: string[] = [], served: Record<string, number> = {};
      for (const type of Object.keys(UNITS)) for (const heads of headsOf(type)) {
        const id = lib.unitId(type, heads);
        const art = lib.unit(id);
        if (!art) { procedural.push(`${type}×${heads} → ${id}`); continue; }
        served[id] = art.scale;
        const u = UNITS[type];
        const want = ['idle', 'die', ...(u.speed > 0 ? ['walk'] : []), ...(u.attack > 0 ? ['attack'] : [])];
        for (const a of want) expect(art.has(a), `${id} sem ${a}`).toBe(true);
        expect(art.team && art.shadow, `${id}: máscara de time e sombra`).toBe(true);
      }
      expect(procedural).toEqual([]);
      // a hidra troca de asset pelas cabeças; a 2×, só os titãs (sem 2×) ficam na 1×
      expect([1, 2, 3, 4, 5].map((h) => lib.unitId('hydra', h))).toEqual(['hydra', 'hydra_heads2', 'hydra_heads3', 'hydra_heads4', 'hydra_heads5']);
      expect(Object.keys(served)).toHaveLength(35 + 4);
      const at1 = Object.entries(served).filter(([, s]) => s !== scale).map(([id]) => id).sort();
      expect(at1).toEqual(scale === 1 ? [] : ['cronus', 'oceanus', 'prometheus']);
    });
  }

  it('a arte desligada (opção "Arte assada") devolve procedural para todos — o "antes" continua desenhável', () => {
    const lib = library(1);
    lib.configure(false, 1);
    for (const type of Object.keys(UNITS)) expect(lib.unit(lib.unitId(type)), type).toBeNull();
  });
});

describe.skipIf(!hasArt)('Etapa 6: silhuetas a zoom 1 entre os lotes (bake local)', () => {
  // Cada lote conferiu as suas criaturas entre si e contra o hoplita/hetairo; aqui os pares ENTRE lotes (ex.: Prometeu ×
  // colosso, minotauro × ciclope, centauro × Pégaso, Mantícora × Quimera): parado, as 8 direções, pixels opacos da cor a
  // 1× relativos ao pé que diferem sobre a união (a mesma conta de tests/art-myth.test.ts).
  const index = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8')) as Idx & { atlases: { json: string; image: string; group: string; scale: number; pass: string }[] };
  const sheets = new Map<string, { frames: Record<string, { frame: { x: number; y: number; w: number; h: number }; spriteSourceSize: { x: number; y: number }; sourceSize: { w: number; h: number }; anchor: { x: number; y: number } }>; animations?: Record<string, string[]>; meta: { aoe?: { mirroredAssets?: Record<string, Record<string, number>> } } }>();
  for (const a of index.atlases) if (a.group === 'units' && a.scale === 1 && a.pass === 'color') sheets.set(a.json, JSON.parse(fs.readFileSync(path.join(ART, a.json), 'utf8')));
  const imgs = new Map<string, { width: number; data: Uint8Array }>();
  const pngOf = async (file: string) => { if (!imgs.has(file)) { const { PNG } = await import('pngjs'); imgs.set(file, PNG.sync.read(fs.readFileSync(path.join(ART, file)))); } return imgs.get(file)!; };
  /** Pontos opacos do parado (quadro 0) na direção `dir` — a animação resolve as direções espelhadas dos titãs. */
  const silhouette = async (id: string, dir: number): Promise<Set<string>> => {
    for (const a of index.atlases) {
      if (a.group !== 'units' || a.scale !== 1 || a.pass !== 'color') continue;
      const j = sheets.get(a.json)!;
      const name = j.animations?.[`${id}/idle/${dir}`]?.[0];
      const f = name ? j.frames[name] : undefined;
      if (!f) continue;
      const img = await pngOf(a.image), out = new Set<string>();
      const mirrored = j.meta.aoe?.mirroredAssets?.[id]?.[String(dir)] !== undefined;   // (titã espelhado: E/SE/NE com scale.x = −1)
      const ax = f.anchor.x * f.sourceSize.w, ay = f.anchor.y * f.sourceSize.h;
      for (let y = 0; y < f.frame.h; y++) for (let x = 0; x < f.frame.w; x++) {
        if (img.data[((f.frame.y + y) * img.width + f.frame.x + x) * 4 + 3] < 128) continue;
        const px = Math.round(f.spriteSourceSize.x + x - ax), py = Math.round(f.spriteSourceSize.y + y - ay);
        out.add(`${mirrored ? -px : px},${py}`);
      }
      return out;
    }
    throw new Error(`${id}/idle/${dir} sem quadro`);
  };
  const MYTHS = ['minotaur', 'nemean_lion', 'pegasus', 'hydra', 'cerberus', 'chimera', 'manticore', 'cyclops', 'colossus', 'medusa', 'centaur', 'sentinel', 'shade', 'prometheus', 'oceanus', 'cronus'];

  it('as 16 entre si e contra o hoplita e o hetairo: média ≥ 36 % nas 8 direções e nenhuma vista < 20 %', async () => {
    const ids = [...MYTHS, 'hoplite', 'hetairoi'];
    const sil = new Map<string, Set<string>[]>();
    for (const id of ids) { const d: Set<string>[] = []; for (let dir = 0; dir < 8; dir++) d.push(await silhouette(id, dir)); sil.set(id, d); }
    const bad: string[] = [];
    let closest = { pair: '', mean: 1 };
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      if (!MYTHS.includes(ids[i])) continue;
      const ds: number[] = [];
      for (let dir = 0; dir < 8; dir++) {
        const A = sil.get(ids[i])![dir], B = sil.get(ids[j])![dir];
        let only = 0; for (const k of A) if (!B.has(k)) only++; for (const k of B) if (!A.has(k)) only++;
        ds.push(only / new Set([...A, ...B]).size);
      }
      const mean = ds.reduce((a, b) => a + b, 0) / 8;
      if (mean < closest.mean) closest = { pair: `${ids[i]} × ${ids[j]}`, mean };
      if (mean < 0.36 || Math.min(...ds) < 0.2) bad.push(`${ids[i]} × ${ids[j]}: média ${(100 * mean).toFixed(0)} % (${ds.map((d) => (100 * d).toFixed(0)).join(', ')})`);
    }
    expect(bad, `par mais próximo: ${closest.pair} ${(100 * closest.mean).toFixed(0)} %`).toEqual([]);
  });
});
