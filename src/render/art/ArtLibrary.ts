// Biblioteca de arte do renderizador (docs/ART.md §3.7): une a fonte assada (AtlasSource, atlas do bake) e a procedural
// (ProceduralSource, o TextureCache de hoje). As vistas pedem quadros por (id, animação, direção), edifício por estágio e
// prop por nome; quando não há quadro assado (tipo não assado, atlas carregando/recusado ou opção desligada) a resposta
// é null e quem chamou desenha o procedural — sem erro. Carregamento: o manifesto no configure; os atlas dos grupos
// units/buildings/props no prewarm (início da partida) ou, preguiçosamente, na primeira vez que um tipo aparece.
// `generation` muda sempre que o conjunto de quadros disponíveis muda: o renderizador então refaz vistas e props.
import type { Texture } from 'pixi.js';
import type { TextureCache } from '../textures';
import { AtlasSource, type PassFrames } from './AtlasSource';
import { ProceduralSource } from './ProceduralSource';
import { pickScale, unitAnimName, buildingFrameName } from './logic';
import type { ArtAnimInfo, ArtGroup, ArtPass, ArtScale } from './types';

const GROUPS: readonly ArtGroup[] = ['units', 'buildings', 'props'];

/** Arte assada de um tipo de unidade na escala servida. */
export interface UnitArt {
  id: string;
  scale: ArtScale;
  /** Âncora (pé) relativa ao sourceSize; igual em todos os quadros e passes. */
  anchor: { x: number; y: number };
  /** Moldura (px de mundo). */
  size: { w: number; h: number };
  anims: Record<string, ArtAnimInfo>;
  /** Distância (px de mundo) do pé ao topo visível mais alto dos quadros de parado — base da barra de vida. */
  top: number;
  /** Direções espelhadas (--mirror) ou null. */
  mirrored: Record<string, number> | null;
  team: boolean;
  shadow: boolean;
  /** A animação existe para este tipo (criada uma vez: sem closure por quadro na escolha da animação). */
  has: (anim: string) => boolean;
}

/** Um quadro assado com os passes que existirem (edifícios e props). */
export interface BakedFrame { color: Texture; team: Texture | null; shadow: Texture | null; anchor: { x: number; y: number } }

export class ArtLibrary {
  readonly procedural: ProceduralSource;
  readonly atlas: AtlasSource;
  /** Opção "Arte assada" (Quality.bakedArt). */
  enabled = true;
  /** Escala pedida pelo preset (1× ou 2×; 2× só se existir no manifesto). */
  wanted: ArtScale = 1;
  /** Muda quando o conjunto de quadros servidos muda (carregou, falhou, trocou a escala, ligou/desligou). */
  generation = 0;
  private units = new Map<string, UnitArt | null>();
  private prewarmed = false;
  /** Escala servida e passes por grupo, válidos até a próxima geração (caminho quente das vistas: sem string/array). */
  private servedCache = new Map<ArtGroup, ArtScale | null>();
  private passCache = new Map<ArtGroup, Partial<Record<ArtPass, PassFrames | null>>>();

  constructor(cache: TextureCache, base = './art/') {
    this.procedural = new ProceduralSource(cache);
    this.atlas = new AtlasSource(base);
    // um carregamento terminou: o prewarm pede os grupos (se o manifesto acabou de chegar) e a geração só muda quando
    // nada mais está carregando (uma reconstrução das vistas por leva, não uma por atlas)
    this.atlas.onChange = () => { if (this.prewarmed) this.prewarm(); if (this.atlas.busy === 0) this.bump(); };
  }

  private bump(): void { this.generation++; this.units.clear(); this.servedCache.clear(); this.passCache.clear(); }

  /** Aplica a opção e a escala do preset; começa a ler o manifesto (barato) se a arte estiver ligada. */
  configure(enabled: boolean, scale: ArtScale): void {
    const changed = enabled !== this.enabled || scale !== this.wanted;
    this.enabled = enabled; this.wanted = scale;
    if (enabled) void this.atlas.loadManifest();
    if (changed) { this.bump(); if (this.prewarmed) this.prewarm(); }
  }

  /** Pré-aquecimento (início da partida): manifesto + atlas de units/buildings/props na escala servida, sem esperar. */
  prewarm(): void {
    this.prewarmed = true;
    if (!this.enabled) return;
    if (!this.atlas.manifest) { void this.atlas.loadManifest(); return; }   // onChange chama prewarm de novo
    for (const g of GROUPS) this.atlas.ensure(g, this.scaleFor(g));
  }

  /** Resolve quando nada mais está carregando (capturas e testes do navegador). */
  async ready(): Promise<void> { await this.atlas.idle(); await this.atlas.idle(); }

  /** Escala a carregar para um grupo: a do preset se o manifesto a tiver. */
  private scaleFor(group: ArtGroup): ArtScale { return pickScale(this.wanted, this.atlas.scalesOf(group)); }
  /** Escala servida agora para um grupo: a pedida se pronta, senão a outra se já estiver pronta (troca sem piscar). */
  private served(group: ArtGroup): ArtScale | null {
    const hit = this.servedCache.get(group);
    if (hit !== undefined) return hit;
    const w = this.scaleFor(group);
    let r: ArtScale | null = w;
    if (this.atlas.status(group, w) !== 'ready') {
      this.atlas.ensure(group, w);
      const o: ArtScale = w === 1 ? 2 : 1;
      r = this.atlas.status(group, o) === 'ready' ? o : null;
    }
    this.servedCache.set(group, r);
    return r;
  }
  private passOf(group: ArtGroup, pass: ArtPass): PassFrames | null {
    let g = this.passCache.get(group);
    if (!g) { g = {}; this.passCache.set(group, g); }
    const hit = g[pass];
    if (hit !== undefined) return hit;
    const s = this.served(group);
    const r = s === null ? null : this.atlas.pass(group, s, pass);
    g[pass] = r;
    return r;
  }

  /**
   * Chamado pelo renderizador depois de refazer as vistas: descarrega a escala que deixou de ser servida (as texturas
   * são compartilhadas entre vistas; só saem quando nenhuma vista as usa mais).
   */
  collect(): void {
    if (!this.atlas.manifest) return;
    for (const s of [1, 2] as ArtScale[]) {
      if (!this.enabled) { this.atlas.unloadScale(s); continue; }
      const stillServed = GROUPS.some((g) => this.served(g) === s || this.scaleFor(g) === s);
      if (!stillServed) this.atlas.unloadScale(s);
    }
  }

  // ---------------- Unidades ----------------
  /** Arte de uma unidade (null = procedural). A primeira chamada de um tipo dispara o carregamento do grupo. */
  unit(id: string): UnitArt | null {
    if (!this.enabled) return null;
    const hit = this.units.get(id);
    if (hit !== undefined) return hit;
    const m = this.atlas.manifest;
    if (!m) { if (this.atlas.manifestStatus === 'idle') void this.atlas.loadManifest(); return null; }
    const a = m.assets[id];
    if (!a || a.kind !== 'unit' || !a.anims) { this.units.set(id, null); return null; }
    const scale = this.served(a.group);
    if (scale === null) return null;          // carregando: não guarda (a próxima geração tenta de novo)
    const color = this.atlas.pass(a.group, scale, 'color');
    const size = a.sizes?.[String(scale)] ?? a.sizes?.['1'];
    if (!color || !size) { this.units.set(id, null); return null; }
    // confere que toda animação × 8 direções existe no passe de cor (senão procedural: nada de quadro faltando)
    for (const [anim, info] of Object.entries(a.anims)) for (let d = 0; d < 8; d++) {
      const list = color.anims.get(unitAnimName(id, anim, d));
      if (!list || list.length !== info.frames) { this.units.set(id, null); return null; }
    }
    // topo visível dos quadros de parado (a moldura inclui lança, morte e sombra: alta demais para a barra de vida)
    let top = 0;
    for (let d = 0; d < 8; d++) for (const t of color.anims.get(unitAnimName(id, 'idle', d)) ?? []) {
      const trimY = t.trim ? t.trim.y : 0;
      top = Math.max(top, size.anchor.y * t.orig.height - trimY);
    }
    const res = scale, anims = a.anims;
    const art: UnitArt = {
      id, scale, anchor: { ...size.anchor }, size: { w: size.sourceSize.w / res, h: size.sourceSize.h / res }, anims: a.anims,
      top: top || size.anchor.y * size.sourceSize.h / res, mirrored: color.mirrored,
      team: !!a.team && !!this.atlas.pass(a.group, scale, 'team'), shadow: !!a.shadow && !!this.atlas.pass(a.group, scale, 'shadow'),
      has: (anim: string) => !!anims[anim],
    };
    this.units.set(id, art);
    return art;
  }
  private unitAnim(art: UnitArt, pass: ArtPass, anim: string, dir: number): readonly Texture[] | null {
    const p = this.passOf('units', pass);
    return p?.anims.get(unitAnimName(art.id, anim, dir)) ?? null;
  }
  /** Quadros de cor de (id, anim, dir); null se não houver. */
  frames(art: UnitArt, anim: string, dir: number): readonly Texture[] | null { return this.unitAnim(art, 'color', anim, dir); }
  /** Quadros da máscara de time (mesmos nomes). */
  teamFrames(art: UnitArt, anim: string, dir: number): readonly Texture[] | null { return art.team ? this.unitAnim(art, 'team', anim, dir) : null; }
  /** Quadros da sombra projetada (mesmos nomes). */
  shadowFrames(art: UnitArt, anim: string, dir: number): readonly Texture[] | null { return art.shadow ? this.unitAnim(art, 'shadow', anim, dir) : null; }

  // ---------------- Edifícios e props ----------------
  private frameOf(group: ArtGroup, name: string, passes: { team: boolean; shadow: boolean }): BakedFrame | null {
    const color = this.passOf(group, 'color')?.frames.get(name);
    if (!color) return null;
    const team = passes.team ? this.passOf(group, 'team')?.frames.get(name) ?? null : null;
    const shadow = passes.shadow ? this.passOf(group, 'shadow')?.frames.get(name) ?? null : null;
    const a = color.defaultAnchor;
    return { color, team, shadow, anchor: { x: a?.x ?? 0.5, y: a?.y ?? 1 } };
  }
  /** Edifício `<id>/<estágio>` (build0/build1/build2/complete); null = procedural. */
  building(id: string, stage: string): BakedFrame | null {
    if (!this.enabled) return null;
    const a = this.atlas.manifest?.assets[id];
    if (!a || a.kind !== 'building') { if (!this.atlas.manifest && this.atlas.manifestStatus === 'idle') void this.atlas.loadManifest(); return null; }
    return this.frameOf(a.group, buildingFrameName(id, stage), { team: a.team, shadow: a.shadow });
  }
  /** Prop pelo nome do quadro (`<kind>/<variante>[/<tag>]`); null = procedural. */
  prop(name: string): BakedFrame | null {
    if (!this.enabled || !this.atlas.manifest) return null;
    return this.frameOf('props', name, { team: false, shadow: true });
  }
  /** Os atlas de props estão servidos (o renderizador troca o atlas procedural de nós pelos props assados). */
  propsReady(): boolean { return this.enabled && !!this.atlas.manifest && this.served('props') !== null; }

  /** Resumo para diagnóstico/scripts: estado do manifesto e de cada grupo. */
  status(): Record<string, string> {
    const out: Record<string, string> = { enabled: String(this.enabled), wanted: `${this.wanted}x`, manifest: this.atlas.manifestStatus, generation: String(this.generation) };
    for (const g of GROUPS) out[g] = `1x:${this.atlas.status(g, 1)} 2x:${this.atlas.status(g, 2)} servida:${this.served(g) ?? '-'}`;
    return out;
  }
}
