// Fonte assada (docs/ART.md §3.3, §3.7): lê public/art/manifest.json e carrega as PÁGINAS de atlas (JSON + PNG) sob
// demanda, com os três passes (cor, time, sombra), em duas granularidades: um grupo inteiro numa escala (edifícios, props,
// ícones — `ensure`) ou só as páginas de um tipo de unidade (`ensureAsset`, Etapa 4: o empacotador nunca divide um asset
// entre páginas, então um tipo = uma página por passe). Recusa atlas cujo meta.aoe difira do contrato
// (pxPerTile/pitchDeg/versão/passe); uma página que falha deixa o grupo (ou o tipo) "failed" e o jogo segue no
// procedural. Carrega com Assets.load (cache com prefixo por arquivo: os três passes e as duas escalas repetem os mesmos
// nomes de quadro); se o Assets falhar (file:// no Electron não tem fetch), cai para XHR + <img> + Spritesheet.
import { Assets, ImageSource, Spritesheet, Texture, type TextureSource } from 'pixi.js';
import { checkSheetMeta } from './logic';
import type { ArtGroup, ArtManifest, ArtPass, ArtScale, SheetJson } from './types';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'failed';
/** O que terminou de carregar: página de um grupo inteiro (edifícios, props, ícones — muda a geração da ArtLibrary) ou
 *  de um TIPO de unidade (carregamento por tipo — não reconstrói nada: só as vistas daquele tipo são trocadas). */
export type LoadKind = 'group' | 'unit';

/** Quadros e animações de um passe de um grupo (união das páginas já prontas; objeto estável: vistas guardam a referência). */
export interface PassFrames { frames: Map<string, Texture>; anims: Map<string, Texture[]>; mirrored: Record<string, number> | null }

/** Uma página pedida (JSON + PNG de um passe). */
interface SheetLoad { status: LoadStatus; pass: ArtPass }

interface GroupLoad {
  passes: Partial<Record<ArtPass, PassFrames>>;
  /** Páginas pedidas (arquivo JSON → estado). */
  sheets: Map<string, SheetLoad>;
  /** O manifesto não lista nenhum atlas do grupo nesta escala. */
  empty: boolean;
  /** Para descarregar: URLs carregadas pelo Assets e folhas criadas à mão (fallback). */
  urls: string[]; manual: Spritesheet[];
  error?: string;
}

/** Imagem de atlas pronta esperando a vez de subir para a GPU: o renderizador sobe uma por quadro e chama `done`. */
export interface UploadJob { source: TextureSource; done: () => void }

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
  private pending = new Map<Promise<unknown>, LoadKind>();
  /** Chamado quando o manifesto ou uma página termina de carregar (ou falha), já fora da lista de pendentes. */
  onChange: ((kind: LoadKind) => void) | null = null;
  /** Carregamentos em curso (manifesto e páginas, até subirem para a GPU). */
  get busy(): number { return this.pending.size; }
  /** Carregamentos em curso de um tipo (a ArtLibrary só muda a geração quando não há mais nenhum de grupo). */
  busyOf(kind: LoadKind): number { let n = 0; for (const k of this.pending.values()) if (k === kind) n++; return n; }
  /** Mensagens de recusa/erro (diagnóstico e testes do navegador). */
  readonly errors: string[] = [];
  /**
   * Com `gpuUpload` (o renderizador liga), uma página só passa a ser servida DEPOIS de subir para a GPU: vai para
   * `uploads`, o renderizador sobe uma por quadro (`initSource`, com os mipmaps) e chama `done`. Nem o primeiro quadro da
   * partida nem a chegada de um tipo novo no meio dela pagam o upload de várias páginas 2048² de uma vez (20–60 ms cada
   * numa integrada). Desligado (Node, testes): pronta assim que decodificada.
   */
  gpuUpload = false;
  readonly uploads: UploadJob[] = [];

  /** `base` = pasta dos atlas relativa à página ('./art/'). */
  constructor(private base: string) {}

  private url(file: string): string { return this.base + file; }
  private track<T>(p: Promise<T>, kind: LoadKind = 'group'): Promise<T> {
    this.pending.set(p, kind);
    void p.finally(() => { this.pending.delete(p); this.onChange?.(kind); });
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

  /** Estado das páginas pedidas de um grupo numa escala: falhou se alguma falhou; carregando se alguma ainda não chegou. */
  status(group: ArtGroup, scale: ArtScale): LoadStatus {
    const g = this.groups.get(`${group}@${scale}`);
    if (!g) return 'idle';
    if (g.sheets.size === 0) return g.empty ? 'failed' : 'idle';
    let loading = false;
    for (const s of g.sheets.values()) { if (s.status === 'failed') return 'failed'; if (s.status === 'loading') loading = true; }
    return loading ? 'loading' : 'ready';
  }

  /** Começa a carregar (se ainda não começou) TODAS as páginas de um grupo numa escala. Exige o manifesto pronto. */
  ensure(group: ArtGroup, scale: ArtScale): LoadStatus {
    const m = this.manifest;
    if (!m) return 'idle';
    this.ensureSheets(group, scale, m.atlases.filter((a) => a.group === group && a.scale === scale), 'group');
    return this.status(group, scale);
  }

  /** Arquivos de atlas (todos os passes) de um asset numa escala, pelo índice. */
  private assetFiles(id: string, scale: ArtScale): string[] {
    const by = this.manifest?.assets[id]?.atlases?.[String(scale)];
    return by ? [...(by.color ?? []), ...(by.team ?? []), ...(by.shadow ?? [])] : [];
  }
  /** Carregamento POR TIPO (unidades): só as páginas onde o asset está. Devolve o estado delas. */
  ensureAsset(id: string, scale: ArtScale): LoadStatus {
    const m = this.manifest, a = m?.assets[id];
    if (!m || !a) return 'idle';
    const files = new Set(this.assetFiles(id, scale));
    if (!files.size) return 'failed';
    this.ensureSheets(a.group, scale, m.atlases.filter((x) => x.scale === scale && files.has(x.json)), 'unit');
    return this.assetStatus(id, scale);
  }
  /** Estado das páginas de um asset numa escala ('idle' = nenhuma pedida ainda). */
  assetStatus(id: string, scale: ArtScale): LoadStatus {
    const a = this.manifest?.assets[id];
    const files = this.assetFiles(id, scale);
    if (!a || !files.length) return 'failed';
    const g = this.groups.get(`${a.group}@${scale}`);
    if (!g) return 'idle';
    let loading = false, any = false;
    for (const f of files) {
      const s = g.sheets.get(f);
      if (!s) { loading = true; continue; }
      any = true;
      if (s.status === 'failed') return 'failed';
      if (s.status === 'loading') loading = true;
    }
    return !any ? 'idle' : loading ? 'loading' : 'ready';
  }

  /** Pede as páginas que ainda não foram pedidas; cada uma entra na união do seu passe quando fica pronta (e subiu). */
  private ensureSheets(group: ArtGroup, scale: ArtScale, entries: ArtManifest['atlases'], kind: LoadKind): void {
    const key = `${group}@${scale}`;
    let g = this.groups.get(key);
    if (!g) { g = { passes: {}, sheets: new Map(), empty: false, urls: [], manual: [] }; this.groups.set(key, g); }
    const grp = g;
    if (entries.length === 0) { if (grp.sheets.size === 0) { grp.empty = true; grp.error = 'sem atlas'; } return; }
    for (const a of entries) {
      if (grp.sheets.has(a.json)) continue;
      const s: SheetLoad = { status: 'loading', pass: a.pass };
      grp.sheets.set(a.json, s);
      void this.track((async () => {
        try {
          const sheet = await this.loadSheet(grp, a.json, scale);
          const data = sheet.data as unknown as SheetJson;
          const refused = checkSheetMeta(data.meta?.aoe, scale, a.pass);
          if (refused) throw new Error(`${a.json} recusado: ${refused}`);
          await this.upload(sheet.textureSource);
          if (this.groups.get(key) !== grp) return;   // descarregado no meio do caminho
          const p = grp.passes[a.pass] ?? (grp.passes[a.pass] = { frames: new Map(), anims: new Map(), mirrored: null });
          for (const [name, tex] of Object.entries(sheet.textures)) p.frames.set(name, tex as Texture);
          for (const [name, list] of Object.entries(sheet.animations)) p.anims.set(name, list as Texture[]);
          if (data.meta.aoe?.mirrored) p.mirrored = { ...(p.mirrored ?? {}), ...data.meta.aoe.mirrored };
          s.status = 'ready';
        } catch (e) {
          s.status = 'failed'; grp.error = (e as Error).message;
          this.fail(`atlas ${key}: ${grp.error}`);
        }
      })(), kind);
    }
  }

  /** Espera a vez no uploader do renderizador (com gpuUpload) ou resolve já. */
  private upload(source: TextureSource): Promise<void> {
    if (!this.gpuUpload) return Promise.resolve();
    return new Promise((resolve) => this.uploads.push({ source, done: resolve }));
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

  /** Quadros de um passe: a união das páginas já prontas do grupo nessa escala (null se nenhuma). */
  pass(group: ArtGroup, scale: ArtScale, pass: ArtPass): PassFrames | null {
    return this.groups.get(`${group}@${scale}`)?.passes[pass] ?? null;
  }

  /** Descarrega os grupos de uma escala (texturas compartilhadas: só depois que nenhuma vista as usa). */
  unloadScale(scale: ArtScale): void {
    for (const [key, g] of this.groups) {
      if (!key.endsWith(`@${scale}`)) continue;
      let loading = false;
      for (const s of g.sheets.values()) if (s.status === 'loading') loading = true;
      if (loading) continue;
      this.release(g);
      this.groups.delete(key);
    }
  }
  private release(g: GroupLoad): void {
    for (const u of g.urls) void Assets.unload(u).catch(() => undefined);
    for (const s of g.manual) s.destroy(true);
    g.urls = []; g.manual = []; g.passes = {};
  }

  /** Resolve quando não há mais nada carregando nem esperando a GPU (scripts de captura esperam por isto). */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending.keys()]);
  }
}
