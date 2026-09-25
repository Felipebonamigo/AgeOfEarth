// Fonte assada (docs/ART.md §3.3, §3.7): lê public/art/manifest.json e carrega os atlas de um grupo (units, buildings,
// props) numa escala (1× ou 2×) sob demanda, com os três passes (cor, time, sombra). Recusa atlas cujo meta.aoe difira do
// contrato (pxPerTile/pitchDeg/versão/passe) e, se qualquer arquivo falhar, o grupo inteiro fica "failed" e o jogo segue
// no procedural. Carrega com Assets.load (cache com prefixo por arquivo: os três passes e as duas escalas repetem os
// mesmos nomes de quadro); se o Assets falhar (file:// no Electron não tem fetch), cai para XHR + <img> + Spritesheet.
import { Assets, ImageSource, Spritesheet, Texture, type TextureSource } from 'pixi.js';
import { checkSheetMeta } from './logic';
import type { ArtGroup, ArtManifest, ArtPass, ArtScale, SheetJson } from './types';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Quadros e animações de um passe de um grupo (união das páginas). */
export interface PassFrames { frames: Map<string, Texture>; anims: Map<string, Texture[]>; mirrored: Record<string, number> | null }

interface GroupLoad {
  status: LoadStatus;
  passes: Partial<Record<ArtPass, PassFrames>>;
  /** Para descarregar: URLs carregadas pelo Assets e folhas criadas à mão (fallback). */
  urls: string[]; manual: Spritesheet[];
  error?: string;
}

/** JSON por fetch; sem fetch para o esquema (file:// no Electron), por XHR. */
async function loadJson<T>(url: string): Promise<T> {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } catch (e) {
    if (typeof XMLHttpRequest === 'undefined') throw e;
    return await new Promise<T>((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('GET', url); x.responseType = 'text';
      x.onload = () => { try { if (x.status !== 0 && x.status !== 200) throw new Error(`HTTP ${x.status}`); resolve(JSON.parse(x.responseText) as T); } catch (err) { reject(err); } };
      x.onerror = () => reject(e);
      x.send();
    });
  }
}
/**
 * Mipmaps em todo atlas (zoom < 1 sem cintilar). Filtro entre níveis: 'nearest' no 1× (presets baixo/médio: um nível
 * por pixel — na renderização por software o trilinear custava ~40 % do fps da cena) e 'linear' (trilinear) no 2×,
 * que só o preset alto usa, em GPU dedicada.
 */
export function textureOptionsFor(scale: ArtScale): { autoGenerateMipmaps: true; mipmapFilter: 'nearest' | 'linear' } {
  return { autoGenerateMipmaps: true, mipmapFilter: scale === 2 ? 'linear' : 'nearest' };
}
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error(`imagem ${url}`)); img.src = url; });
}

export class AtlasSource {
  manifest: ArtManifest | null = null;
  manifestStatus: LoadStatus = 'idle';
  private manifestPromise: Promise<void> | null = null;
  private groups = new Map<string, GroupLoad>();
  private pending = new Set<Promise<unknown>>();
  /** Chamado quando o manifesto ou um grupo termina de carregar (ou falha), já fora da lista de pendentes. */
  onChange: (() => void) | null = null;
  /** Carregamentos em curso (manifesto e grupos). */
  get busy(): number { return this.pending.size; }
  /** Mensagens de recusa/erro (diagnóstico e testes do navegador). */
  readonly errors: string[] = [];
  /** Imagens dos atlas prontos ainda não enviadas à GPU: o renderizador sobe uma por quadro (no menu, antes da partida). */
  readonly uploads: TextureSource[] = [];

  /** `base` = pasta dos atlas relativa à página ('./art/'). */
  constructor(private base: string) {}

  private url(file: string): string { return this.base + file; }
  private track<T>(p: Promise<T>): Promise<T> {
    this.pending.add(p);
    void p.finally(() => { this.pending.delete(p); this.onChange?.(); });
    return p;
  }
  private fail(msg: string): void { this.errors.push(msg); if (this.errors.length > 20) this.errors.shift(); console.warn('[arte]', msg); }

  /** Carrega o manifesto uma vez (as chamadas seguintes devolvem a mesma promessa). */
  loadManifest(): Promise<void> {
    if (this.manifestPromise) return this.manifestPromise;
    this.manifestStatus = 'loading';
    this.manifestPromise = this.track((async () => {
      try {
        const m = await loadJson<ArtManifest>(this.url('manifest.json'));
        if (!m || m.version !== 1 || !m.assets || !Array.isArray(m.atlases)) throw new Error('manifest.json inválido');
        this.manifest = m; this.manifestStatus = 'ready';
      } catch (e) {
        this.manifestStatus = 'failed';
        this.fail(`manifesto indisponível: ${(e as Error).message} (arte procedural)`);
      }
    })());
    return this.manifestPromise;
  }

  /** Escalas presentes no manifesto para um grupo. */
  scalesOf(group: ArtGroup): number[] {
    const out: number[] = [];
    for (const a of this.manifest?.atlases ?? []) if (a.group === group && !out.includes(a.scale)) out.push(a.scale);
    return out;
  }

  status(group: ArtGroup, scale: ArtScale): LoadStatus { return this.groups.get(`${group}@${scale}`)?.status ?? 'idle'; }

  /** Começa a carregar (se ainda não começou) os atlas de um grupo numa escala. Exige o manifesto pronto. */
  ensure(group: ArtGroup, scale: ArtScale): LoadStatus {
    const key = `${group}@${scale}`;
    const cur = this.groups.get(key);
    if (cur) return cur.status;
    const m = this.manifest;
    if (!m) return 'idle';
    const entries = m.atlases.filter((a) => a.group === group && a.scale === scale);
    const g: GroupLoad = { status: 'loading', passes: {}, urls: [], manual: [] };
    this.groups.set(key, g);
    if (entries.length === 0) { g.status = 'failed'; g.error = 'sem atlas'; return g.status; }
    void this.track((async () => {
      try {
        // allSettled: se um arquivo falhar, os outros já carregados também são liberados em release()
        const settled = await Promise.allSettled(entries.map(async (a) => ({ a, sheet: await this.loadSheet(g, a.json, scale) })));
        const bad = settled.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
        if (bad) throw bad.reason instanceof Error ? bad.reason : new Error(String(bad.reason));
        for (const r of settled) {
          const { a, sheet } = (r as PromiseFulfilledResult<{ a: (typeof entries)[number]; sheet: Spritesheet }>).value;
          const data = sheet.data as unknown as SheetJson;
          const refused = checkSheetMeta(data.meta?.aoe, scale, a.pass);
          if (refused) throw new Error(`${a.json} recusado: ${refused}`);
          const p = g.passes[a.pass] ?? (g.passes[a.pass] = { frames: new Map(), anims: new Map(), mirrored: null });
          for (const [name, tex] of Object.entries(sheet.textures)) p.frames.set(name, tex as Texture);
          for (const [name, list] of Object.entries(sheet.animations)) p.anims.set(name, list as Texture[]);
          if (data.meta.aoe?.mirrored) p.mirrored = { ...(p.mirrored ?? {}), ...data.meta.aoe.mirrored };
        }
        if (this.groups.get(key) === g) {
          g.status = 'ready';
          for (const r of settled) this.uploads.push((r as PromiseFulfilledResult<{ sheet: Spritesheet }>).value.sheet.textureSource);
        }
      } catch (e) {
        g.status = 'failed'; g.error = (e as Error).message;
        this.fail(`atlas ${key}: ${g.error}`);
        this.release(g);
      }
    })());
    return g.status;
  }

  /** Assets.load com prefixo de cache por arquivo e mipmaps (zoom < 1 sem cintilar); fallback manual se falhar. */
  private async loadSheet(g: GroupLoad, file: string, scale: ArtScale): Promise<Spritesheet> {
    const url = this.url(file);
    try {
      const sheet = await Assets.load<Spritesheet>({ src: url, data: { cachePrefix: `${file}:`, textureOptions: textureOptionsFor(scale) } });
      if (!(sheet instanceof Spritesheet)) throw new Error('não é um Spritesheet');
      g.urls.push(url);
      return sheet;
    } catch (e) {
      const json = await loadJson<SheetJson>(url);
      const dir = url.slice(0, url.lastIndexOf('/') + 1);
      const img = await loadImage(dir + json.meta.image);
      const source = new ImageSource({ resource: img, resolution: parseFloat(json.meta.scale) || 1, ...textureOptionsFor(scale) });
      const sheet = new Spritesheet(new Texture({ source }), json as never);
      await sheet.parse();
      g.manual.push(sheet);
      void e;
      return sheet;
    }
  }

  /** Quadros de um passe (null se o grupo não está pronto nessa escala ou o passe não existe). */
  pass(group: ArtGroup, scale: ArtScale, pass: ArtPass): PassFrames | null {
    const g = this.groups.get(`${group}@${scale}`);
    return g && g.status === 'ready' ? g.passes[pass] ?? null : null;
  }

  /** Descarrega os grupos de uma escala (texturas compartilhadas: só depois que nenhuma vista as usa). */
  unloadScale(scale: ArtScale): void {
    for (const [key, g] of this.groups) {
      if (!key.endsWith(`@${scale}`) || g.status === 'loading') continue;
      this.release(g);
      this.groups.delete(key);
    }
  }
  private release(g: GroupLoad): void {
    for (const u of g.urls) void Assets.unload(u).catch(() => undefined);
    for (const s of g.manual) s.destroy(true);
    g.urls = []; g.manual = []; g.passes = {};
  }

  /** Resolve quando não há mais nada carregando (scripts de captura esperam por isto). */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }
}
