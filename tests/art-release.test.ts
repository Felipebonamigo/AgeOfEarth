// Etapa 6 (lote bípedes-espíritos, docs/ART.md Apêndice G.9): as páginas PRÓPRIAS de uma criatura (`page: 'own'`) saem
// da VRAM quando ela fica `RELEASE_GRACE_S` fora de uso — no cenário de desempenho um ciclope da IA morria cedo e as
// páginas dele ficavam até o fim (104 MB > 100). As páginas compartilhadas (unidades humanas) e os tipos em uso ficam.
// AtlasSource falso (sem Pixi), como tests/art-collect.test.ts.
import { describe, it, expect, vi } from 'vitest';

type Status = 'idle' | 'loading' | 'ready' | 'failed';

vi.mock('../src/render/art/AtlasSource', () => {
  class FakeAtlas {
    manifest: unknown = null;
    manifestStatus: Status = 'idle';
    onChange: ((k: string) => void) | null = null;
    errors: string[] = [];
    uploads: unknown[] = [];
    gpuUpload = false;
    assets = new Map<string, Status>();   // `${id}@${scale}`
    own = new Set<string>();
    released: string[] = [];
    busyOf(): number { return 0; }
    async loadManifest(): Promise<void> {}
    scalesOf(): number[] { return [1, 2]; }
    status(): Status { return 'ready'; }
    ensure(): Status { return 'ready'; }
    assetStatus(id: string, s: number): Status { return this.assets.get(`${id}@${s}`) ?? 'idle'; }
    ensureAsset(id: string, s: number): Status { if (!this.assets.has(`${id}@${s}`)) this.assets.set(`${id}@${s}`, 'ready'); return this.assetStatus(id, s); }
    pass(): unknown { return null; }
    ownsPages(id: string): boolean { return this.own.has(id); }
    unloadAsset(id: string, s: number): boolean {
      if (!this.own.has(id) || this.assets.get(`${id}@${s}`) !== 'ready') return false;
      this.assets.delete(`${id}@${s}`); this.released.push(`${id}@${s}`);
      return true;
    }
    unloadScale(): void {}
    async idle(): Promise<void> {}
  }
  return { AtlasSource: FakeAtlas };
});

const { ArtLibrary, RELEASE_GRACE_S } = await import('../src/render/art/ArtLibrary');

interface Fake { manifest: unknown; manifestStatus: Status; own: Set<string>; released: string[]; assetStatus(id: string, s: number): Status }

function setup() {
  const lib = new ArtLibrary({} as never);
  const atlas = lib.atlas as unknown as Fake;
  const unit = { kind: 'unit', group: 'units', atlases: { 1: {}, 2: {} }, anims: {} };
  atlas.manifest = { version: 1, atlases: [], assets: { hoplite: unit, cyclops: unit, sentinel: unit } };
  atlas.manifestStatus = 'ready';
  atlas.own.add('cyclops'); atlas.own.add('sentinel');
  lib.configure(true, 1);
  return { lib, atlas };
}

describe('páginas próprias das criaturas saem da VRAM fora de uso (releaseUnused)', () => {
  it('a criatura que saiu de cena há mais que o prazo sai; a que está em uso e as páginas compartilhadas ficam', () => {
    const { lib, atlas } = setup();
    for (const id of ['hoplite', 'cyclops', 'sentinel']) lib.unit(id);   // vistas pediram as páginas
    expect(atlas.assetStatus('cyclops', 1)).toBe('ready');
    lib.releaseUnused(['hoplite', 'cyclops', 'sentinel'], 0);
    // o ciclope morre (sai do estado e das vistas); as sentinelas continuam no mapa
    expect(lib.releaseUnused(['hoplite', 'sentinel'], RELEASE_GRACE_S - 1)).toEqual([]);   // ainda no prazo (cadáver, queda)
    expect(lib.releaseUnused(['hoplite', 'sentinel'], RELEASE_GRACE_S + 1)).toEqual(['cyclops']);
    expect(atlas.released).toEqual(['cyclops@1']);
    expect(atlas.assetStatus('cyclops', 1)).toBe('idle');
    // o hoplita (páginas compartilhadas) nunca sai por tipo, nem fora de uso
    expect(lib.releaseUnused([], 10 * RELEASE_GRACE_S)).toEqual(['sentinel']);
    expect(atlas.assetStatus('hoplite', 1)).toBe('ready');
  });
  it('um ciclope novo depois da liberação pede as páginas de novo', () => {
    const { lib, atlas } = setup();
    lib.unit('cyclops');
    lib.releaseUnused([], 0);
    expect(lib.releaseUnused([], RELEASE_GRACE_S + 1)).toEqual(['cyclops']);
    lib.unit('cyclops');
    expect(atlas.assetStatus('cyclops', 1)).toBe('ready');
    // e o relógio dele recomeça: não sai logo em seguida
    expect(lib.releaseUnused([], RELEASE_GRACE_S + 2)).toEqual([]);
  });
  it('relógio de jogo voltando (partida nova, replay): o prazo recomeça em vez de liberar ou prender', () => {
    const { lib } = setup();
    lib.unit('cyclops');
    lib.releaseUnused(['cyclops'], 1500);          // fim da partida anterior (25 min)
    expect(lib.releaseUnused([], 3)).toEqual([]);   // partida nova: 3 s
    expect(lib.releaseUnused([], 3 + RELEASE_GRACE_S - 1)).toEqual([]);
    expect(lib.releaseUnused([], 3 + RELEASE_GRACE_S + 1)).toEqual(['cyclops']);
  });
});
