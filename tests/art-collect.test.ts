// Revisão da Etapa 4: trocar a escala 1×/2× no meio da partida não pode deixar as duas escalas na VRAM. Com as unidades
// carregadas por tipo, o `collect` da ArtLibrary só libera a escala velha quando nenhum tipo pedido é mais servido nela —
// e o renderizador chama o collect também quando chegam as páginas de um tipo (não só na reconstrução da geração).
// AtlasSource falso (sem Pixi): as páginas "chegam" quando o teste manda.
import { describe, it, expect, vi } from 'vitest';

type Status = 'idle' | 'loading' | 'ready' | 'failed';
type Kind = 'group' | 'unit';

vi.mock('../src/render/art/AtlasSource', () => {
  class FakeAtlas {
    manifest: unknown = null;
    manifestStatus: Status = 'idle';
    onChange: ((k: Kind) => void) | null = null;
    errors: string[] = [];
    uploads: unknown[] = [];
    gpuUpload = false;
    groups = new Map<string, Status>();   // `${group}@${scale}`
    assets = new Map<string, Status>();   // `${id}@${scale}`
    unloaded: number[] = [];
    pending = new Map<string, Kind>();
    busyOf(k: Kind): number { let n = 0; for (const v of this.pending.values()) if (v === k) n++; return n; }
    async loadManifest(): Promise<void> {}
    scalesOf(): number[] { return [1, 2]; }
    status(g: string, s: number): Status { return this.groups.get(`${g}@${s}`) ?? 'idle'; }
    ensure(g: string, s: number): Status {
      const k = `${g}@${s}`;
      if (!this.groups.has(k)) { this.groups.set(k, 'loading'); this.pending.set(k, 'group'); }
      return this.status(g, s);
    }
    assetStatus(id: string, s: number): Status { return this.assets.get(`${id}@${s}`) ?? 'idle'; }
    ensureAsset(id: string, s: number): Status {
      const k = `${id}@${s}`;
      if (!this.assets.has(k)) { this.assets.set(k, 'loading'); this.pending.set(k, 'unit'); }
      return this.assetStatus(id, s);
    }
    pass(): unknown { return null; }
    unloadScale(s: number): void {
      this.unloaded.push(s);
      for (const k of [...this.groups.keys()]) if (k.endsWith(`@${s}`)) this.groups.delete(k);
      for (const k of [...this.assets.keys()]) if (k.endsWith(`@${s}`)) this.assets.delete(k);
    }
    async idle(): Promise<void> {}
    /** O teste entrega as páginas pedidas: grupos ou tipos numa escala. */
    arrive(kind: Kind, scale: number): void {
      for (const [k, v] of [...this.pending]) {
        if (v !== kind || !k.endsWith(`@${scale}`)) continue;
        this.pending.delete(k);
        (kind === 'group' ? this.groups : this.assets).set(k, 'ready');
        this.onChange?.(kind);
      }
    }
  }
  return { AtlasSource: FakeAtlas };
});

const { ArtLibrary } = await import('../src/render/art/ArtLibrary');

interface Fake { manifest: unknown; manifestStatus: Status; unloaded: number[]; arrive(k: Kind, s: number): void }

function setup() {
  const lib = new ArtLibrary({} as never);
  const atlas = lib.atlas as unknown as Fake;
  const unit = { kind: 'unit', group: 'units', atlases: { 1: {}, 2: {} } };
  atlas.manifest = { version: 1, atlases: [], assets: { hoplite: unit, villager: unit, hippeus: unit } };
  atlas.manifestStatus = 'ready';
  return { lib, atlas };
}

describe('collect da ArtLibrary com unidades por tipo (troca de escala no meio da partida)', () => {
  it('páginas dos grupos chegam antes das das unidades: a escala velha só sai quando os tipos chegaram', () => {
    const { lib, atlas } = setup();
    lib.configure(true, 1);
    atlas.arrive('group', 1); atlas.arrive('unit', 1);
    lib.unit('hippeus');                        // um tipo que apareceu na partida (fora dos quentes)
    lib.collect();
    expect(atlas.unloaded).toEqual([2]);       // nada na 2×: sai (no-op)
    atlas.unloaded.length = 0;

    lib.configure(true, 2);                     // preset Alto no meio da partida
    lib.unit('hippeus');
    atlas.arrive('group', 2);                   // edifícios/props/ícones 2× prontos → reconstrução da geração
    lib.collect();
    expect(atlas.unloaded, 'unidades ainda servidas na 1×').not.toContain(1);

    atlas.arrive('unit', 2);                    // as páginas 2× dos tipos chegaram → o renderizador troca as vistas
    lib.collect();
    expect(atlas.unloaded).toContain(1);
  });

  it('unidades antes dos grupos: a escala velha segue enquanto algum grupo ainda é servido nela', () => {
    const { lib, atlas } = setup();
    lib.configure(true, 2);
    atlas.arrive('group', 2); atlas.arrive('unit', 2);
    lib.collect(); atlas.unloaded.length = 0;
    lib.configure(true, 1);                     // Alto → Médio
    atlas.arrive('unit', 1);
    lib.collect();
    expect(atlas.unloaded).not.toContain(2);    // edifícios ainda na 2×
    atlas.arrive('group', 1);
    lib.collect();
    expect(atlas.unloaded).toContain(2);
  });

  it('desligada: libera tudo', () => {
    const { lib, atlas } = setup();
    lib.configure(true, 1); atlas.arrive('group', 1); atlas.arrive('unit', 1);
    lib.configure(false, 1);
    lib.collect();
    expect(atlas.unloaded).toEqual([1, 2]);
  });
});
