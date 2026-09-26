// Biblioteca de arte do renderizador (docs/ART.md §3.7): une a fonte assada (AtlasSource, atlas do bake) e a procedural
// (ProceduralSource, o TextureCache de hoje). As vistas pedem quadros por (id, animação, direção), edifício por estágio e
// prop por nome; quando não há quadro assado (tipo não assado, atlas carregando/recusado ou opção desligada) a resposta
// é null e quem chamou desenha o procedural — sem erro. Carregamento: com a opção ligada, o configure (ainda no menu) lê o
// manifesto e em seguida os atlas dos grupos buildings/props/icons na escala do preset e, das unidades, só as páginas
// dos tipos "quentes" (os do começo de partida: `warmUnitTypes`) — a primeira partida já começa assada, sem trocar o
// visual no meio do jogo. Unidades são carregadas POR TIPO (Etapa 4): o renderizador pede os tipos da Idade do jogador
// local (`prewarmUnits`) e qualquer tipo que apareça antes disso é pedido na primeira vista (procedural até chegar).
// `generation` muda quando o conjunto de quadros SERVIDOS dos grupos muda (carregou, falhou, trocou a escala,
// ligou/desligou): o renderizador refaz vistas e props. A chegada das páginas de um tipo de unidade muda só `unitGen`:
// o renderizador troca as vistas procedurais daquele tipo, sem reconstruir o resto.
import type { Texture } from 'pixi.js';
import type { TextureCache } from '../textures';
import { UNITS } from '../../core/data';
import { AtlasSource, type LoadKind, type PassFrames } from './AtlasSource';
import { ProceduralSource } from './ProceduralSource';
import { pickScale, unitAnimName, buildingFrameName, rubbleName, BUILDING_STATES, GLOW_ANIM, glowFrameName, warmUnitTypes, type VariantBy } from './logic';
import type { ArtAnimInfo, ArtGroup, ArtPass, ArtScale } from './types';

const GROUPS: readonly ArtGroup[] = ['units', 'buildings', 'props', 'icons'];

/** Arte assada de um tipo de unidade na escala servida. */
export interface UnitArt {
  id: string;
  scale: ArtScale;
  /** Âncora (pé) relativa ao sourceSize; igual em todos os quadros e passes. */
  anchor: { x: number; y: number };
  /** Moldura (px de mundo). */
  size: { w: number; h: number };
  anims: Record<string, ArtAnimInfo>;
  /** Distância (px de mundo) do pé ao topo da cabeça (menor topo visível do parado entre as 8 direções) — régua da
   *  patente e do disco de carga. */
  top: number;
  /** Topo do corpo no parado POR DIREÇÃO (px de mundo acima do pé, sem armas finas; índice `tops`, medido no rig pelo
   *  bake) — régua da barra de vida (a cabeça do cavalo em N, as ameias da helépole nas diagonais); null = só `top`. */
  tops: readonly number[] | null;
  /** Direções espelhadas (--mirror) ou null. */
  mirrored: Record<string, number> | null;
  team: boolean;
  shadow: boolean;
  /** A animação existe para este tipo (criada uma vez: sem closure por quadro na escolha da animação). */
  has: (anim: string) => boolean;
  /** Quadros dos três passes na escala servida (a união das páginas do grupo; o tipo está nelas). */
  passes: { color: PassFrames; team: PassFrames | null; shadow: PassFrames | null };
}

/** Um quadro assado com os passes que existirem (edifícios e props). */
export interface BakedFrame { color: Texture; team: Texture | null; shadow: Texture | null; anchor: { x: number; y: number } }

/** Arte assada de um tipo de edifício (Etapa 3): estados, variantes e passes na escala servida. */
export interface BuildingArt {
  id: string;
  /** Estados com quadro (os 6 de BUILDING_STATES e, no portão, 'open'). */
  states: ReadonlySet<string>;
  /** Variantes ('00'–'15', 'ew'/'ns', 'a0'–'a2') ou null. */
  variants: readonly string[] | null;
  variantBy: VariantBy | null;
  team: boolean;
  shadow: boolean;
  /** Sobreposição animada do edifício pronto (estado `glow` com todos os quadros no atlas de cor) ou null. */
  glow: ArtAnimInfo | null;
}

export class ArtLibrary {
  readonly procedural: ProceduralSource;
  readonly atlas: AtlasSource;
  /** Opção "Arte assada" (Quality.bakedArt). */
  enabled = true;
  /** Escala pedida pelo preset (1× ou 2×; 2× só se existir no manifesto). */
  wanted: ArtScale = 1;
  /** Muda quando o conjunto de quadros servidos muda (carregou, falhou, trocou a escala, ligou/desligou). */
  generation = 0;
  /** Muda quando chegam as páginas de um tipo de unidade (carregamento por tipo): o renderizador troca as vistas
   *  procedurais dos tipos que passaram a ter arte (e as de outra escala), sem reconstruir o resto. */
  unitGen = 0;
  /** Tipos de unidade pré-carregados (os do começo de partida já no menu; o renderizador acrescenta os da Idade). */
  private warm = new Set<string>(warmUnitTypes(UNITS, 0));
  /** Tipos de unidade já pedidos (quentes e os que apareceram): o `collect` só libera uma escala que nenhum deles serve. */
  private requested = new Set<string>();
  private units = new Map<string, UnitArt | null>();
  private buildingsArt = new Map<string, BuildingArt | null>();
  private prewarmed = false;
  /** Escala servida e passes por grupo, válidos até a próxima geração (caminho quente das vistas: sem string/array). */
  private servedCache = new Map<ArtGroup, ArtScale | null>();
  private passCache = new Map<ArtGroup, Partial<Record<ArtPass, PassFrames | null>>>();

  constructor(cache: TextureCache, base = './art/') {
    this.procedural = new ProceduralSource(cache);
    this.atlas = new AtlasSource(base);
    // um carregamento terminou: o prewarm pede os grupos (se o manifesto acabou de chegar) e a geração só muda quando
    // nada mais está carregando (uma reconstrução das vistas por leva, não uma por atlas)
    this.atlas.onChange = (kind: LoadKind) => {
      if (kind === 'unit') { this.units.clear(); this.unitGen++; return; }
      if (this.prewarmed) this.prewarm();
      if (this.atlas.busyOf('group') === 0) this.bump();
    };
  }

  private bump(): void { this.generation++; this.units.clear(); this.buildingsArt.clear(); this.servedCache.clear(); this.passCache.clear(); }

  /**
   * Aplica a opção e a escala do preset. Ligada: começa já (no menu) a carregar o manifesto e os atlas da escala pedida.
   * A geração só muda se o que é SERVIDO agora mudar (desligar, ou a outra escala já pronta): trocar para uma escala que
   * ainda vai carregar, ou ligar com os atlas por carregar, não reconstrói nada agora — a reconstrução vem uma vez só,
   * quando o carregamento termina.
   */
  configure(enabled: boolean, scale: ArtScale): void {
    const before = this.servedKey();
    this.enabled = enabled; this.wanted = scale;
    this.servedCache.clear();   // served() depende de `wanted`
    if (enabled) this.prewarm();
    if (this.servedKey() !== before) this.bump();
  }
  /** Assinatura do que é servido agora ('off' = nada assado: desligada ou nada pronto ainda). As unidades ficam fora:
   *  vão por tipo e pelo `unitGen`. */
  private servedKey(): string {
    if (!this.enabled || !this.atlas.manifest) return 'off';
    const k = GROUPS.filter((g) => g !== 'units').map((g) => this.served(g) ?? '-');
    return k.every((x) => x === '-') ? 'off' : k.join(',');
  }

  /** Pré-aquecimento: manifesto + atlas de buildings/props/icons na escala do preset e as páginas dos tipos de unidade
   *  quentes, sem esperar (idempotente). */
  prewarm(): void {
    this.prewarmed = true;
    if (!this.enabled) return;
    if (!this.atlas.manifest) { void this.atlas.loadManifest(); return; }   // onChange chama prewarm de novo
    for (const g of GROUPS) if (g !== 'units') this.atlas.ensure(g, this.scaleFor(g));
    for (const id of this.warm) this.requestUnit(id);
  }
  /** Pré-carrega as páginas destes tipos de unidade (os treináveis na Idade do jogador local, os da partida), sem esperar. */
  prewarmUnits(types: Iterable<string>): void {
    for (const id of types) { if (this.warm.has(id)) continue; this.warm.add(id); this.requestUnit(id); }
  }
  /** Pede as páginas de um tipo na escala desejada (nada se desligada, sem manifesto ou sem arte). */
  private requestUnit(id: string): void {
    const a = this.enabled ? this.atlas.manifest?.assets[id] : undefined;
    if (a?.kind === 'unit') { this.requested.add(id); this.atlas.ensureAsset(id, this.unitWanted(a)); }
  }
  /** Escala desejada para um tipo de unidade: a do preset se o tipo a tiver. */
  private unitWanted(a: { atlases: Record<string, unknown> }): ArtScale { return pickScale(this.wanted, Object.keys(a.atlases).map(Number)); }
  /** Escala SERVIDA para um tipo: a desejada se as páginas dele estão prontas; senão a outra, se prontas (troca sem
   *  piscar); null enquanto nada chegou (a primeira chamada já pede as páginas). */
  private unitScale(id: string, a: { atlases: Record<string, unknown> }): ArtScale | null {
    this.requested.add(id);
    const w = this.unitWanted(a);
    if (this.atlas.ensureAsset(id, w) === 'ready') return w;
    const o: ArtScale = w === 1 ? 2 : 1;
    return a.atlases[String(o)] && this.atlas.assetStatus(id, o) === 'ready' ? o : null;
  }

  /** Resolve quando nada mais está carregando (capturas e testes do navegador). */
  async ready(): Promise<void> { await this.atlas.idle(); await this.atlas.idle(); }

  /** Escala a carregar para um grupo: a do preset se o manifesto a tiver. */
  private scaleFor(group: ArtGroup): ArtScale { return pickScale(this.wanted, this.atlas.scalesOf(group)); }
  /**
   * Escala servida agora para um grupo: a pedida se pronta, senão a outra se já estiver pronta (troca sem piscar). As
   * unidades vão por tipo (`unitScale`): aqui só se lê o estado das páginas já pedidas (sem pedir o grupo inteiro nem
   * guardar no cache, que só é limpo a cada geração).
   */
  private served(group: ArtGroup): ArtScale | null {
    const byType = group === 'units';
    const hit = byType ? undefined : this.servedCache.get(group);
    if (hit !== undefined) return hit;
    const w = this.scaleFor(group);
    let r: ArtScale | null = w;
    if (this.atlas.status(group, w) !== 'ready') {
      if (!byType) this.atlas.ensure(group, w);
      const o: ArtScale = w === 1 ? 2 : 1;
      r = this.atlas.status(group, o) === 'ready' ? o : null;
    }
    if (!byType) this.servedCache.set(group, r);
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
   * Chamado pelo renderizador depois de refazer as vistas (reconstrução da geração, troca das vistas de unidade quando
   * chegam as páginas de um tipo, nova partida): descarrega a escala que deixou de ser servida (as texturas são
   * compartilhadas entre vistas; só saem quando nenhuma vista as usa mais). Grupos: pela escala servida/pedida de cada
   * um; unidades: POR TIPO pedido — enquanto as páginas de algum tipo na escala nova carregam, a velha ainda o serve.
   */
  collect(): void {
    if (!this.atlas.manifest) return;
    for (const s of [1, 2] as ArtScale[]) {
      if (!this.enabled) { this.atlas.unloadScale(s); continue; }
      const stillServed = GROUPS.some((g) => g !== 'units' && (this.served(g) === s || this.scaleFor(g) === s)) || this.unitsServedAt(s);
      if (!stillServed) { this.atlas.unloadScale(s); this.units.clear(); }
    }
  }
  /** Algum tipo de unidade pedido é servido (ou desejado) na escala `s`? */
  private unitsServedAt(s: ArtScale): boolean {
    const m = this.atlas.manifest;
    if (!m) return false;
    for (const id of this.requested) {
      const a = m.assets[id];
      if (a?.kind !== 'unit') continue;
      if (this.unitWanted(a) === s || this.unitScale(id, a) === s) return true;
    }
    return false;
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
    const scale = this.unitScale(id, a);
    if (scale === null) return null;          // carregando: não guarda (a chegada muda unitGen e limpa o cache)
    const color = this.atlas.pass(a.group, scale, 'color');
    const size = a.sizes?.[String(scale)] ?? a.sizes?.['1'];
    if (!color || !size) { this.units.set(id, null); return null; }
    // confere que toda animação × 8 direções existe no passe de cor (senão procedural: nada de quadro faltando)
    for (const [anim, info] of Object.entries(a.anims)) for (let d = 0; d < 8; d++) {
      const list = color.anims.get(unitAnimName(id, anim, d));
      if (!list || list.length !== info.frames) { this.units.set(id, null); return null; }
    }
    // altura da cabeça: o topo visível dos quadros de parado na direção em que ele é mais BAIXO (a cabeça tem a mesma
    // altura em todas; a lança/arma só sobe o topo em algumas — o máximo deixava a barra ~0,5 tile acima do elmo)
    let top = 0;
    for (let d = 0; d < 8; d++) {
      let dirTop = 0;
      for (const t of color.anims.get(unitAnimName(id, 'idle', d)) ?? []) dirTop = Math.max(dirTop, size.anchor.y * t.orig.height - (t.trim ? t.trim.y : 0));
      if (dirTop > 0 && (top === 0 || dirTop < top)) top = dirTop;
    }
    // topo do corpo por direção medido no rig (sem lança/xyston/mastro): a barra de vida fica acima do corpo em todas
    const tops = Array.isArray(a.tops) && a.tops.length === 8 && a.tops.every((t) => t > 0) ? a.tops : null;
    if (tops) top = Math.min(...tops);
    const res = scale, anims = a.anims;
    const team = a.team ? this.atlas.pass(a.group, scale, 'team') : null, shadow = a.shadow ? this.atlas.pass(a.group, scale, 'shadow') : null;
    const art: UnitArt = {
      id, scale, anchor: { ...size.anchor }, size: { w: size.sourceSize.w / res, h: size.sourceSize.h / res }, anims: a.anims,
      top: top || size.anchor.y * size.sourceSize.h / res, tops, mirrored: color.mirrored,
      team: !!team, shadow: !!shadow,
      has: (anim: string) => !!anims[anim],
      passes: { color, team, shadow },
    };
    this.units.set(id, art);
    return art;
  }
  private unitAnim(art: UnitArt, pass: ArtPass, anim: string, dir: number): readonly Texture[] | null {
    return art.passes[pass]?.anims.get(unitAnimName(art.id, anim, dir)) ?? null;
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
  /**
   * Arte de um tipo de edifício (null = procedural): exige os 6 estados de BUILDING_STATES com quadro de cor em todas as
   * variantes — sem isso a obra ou o dano ficariam sem quadro em algum momento. O conjunto de escombros não conta.
   */
  buildingArt(id: string): BuildingArt | null {
    if (!this.enabled) return null;
    const hit = this.buildingsArt.get(id);
    if (hit !== undefined) return hit;
    const m = this.atlas.manifest;
    if (!m) { if (this.atlas.manifestStatus === 'idle') void this.atlas.loadManifest(); return null; }
    const a = m.assets[id];
    if (!a || a.kind !== 'building' || a.rubble || !a.anims) { this.buildingsArt.set(id, null); return null; }
    if (this.served(a.group) === null) return null;          // carregando: não guarda
    const color = this.passOf(a.group, 'color');
    const variants = a.variants && a.variants.length ? a.variants : null;
    const states = new Set(Object.keys(a.anims));
    for (const st of BUILDING_STATES) {
      if (!states.has(st)) { this.buildingsArt.set(id, null); return null; }
      for (const v of variants ?? [null]) if (!color?.frames.has(buildingFrameName(id, st, v))) { this.buildingsArt.set(id, null); return null; }
    }
    const g = a.anims[GLOW_ANIM];
    let glow: ArtAnimInfo | null = g && g.frames > 1 && !variants ? g : null;
    for (let i = 0; glow && i < glow.frames; i++) if (!color?.frames.has(glowFrameName(id, i / glow.fps, glow.frames, glow.fps))) glow = null;
    const art: BuildingArt = { id, states, variants, variantBy: variants ? (a.variantBy ?? null) : null, team: !!a.team, shadow: !!a.shadow, glow };
    this.buildingsArt.set(id, art);
    return art;
  }
  /** Edifício `<id>/<estado>[/<variante>]` (build0/1/2, complete, damage1/2, open); null = procedural. */
  building(id: string, stage: string, variant?: string | null): BakedFrame | null {
    if (!this.enabled) return null;
    const a = this.atlas.manifest?.assets[id];
    if (!a || a.kind !== 'building') { if (!this.atlas.manifest && this.atlas.manifestStatus === 'idle') void this.atlas.loadManifest(); return null; }
    return this.frameOf(a.group, buildingFrameName(id, stage, variant), { team: a.team, shadow: a.shadow });
  }
  /** Escombros de uma pegada w×h (quadro `rubble/<w>x<h>`); null = sem arte (o colapso fica só procedural). */
  rubble(w: number, h: number): BakedFrame | null {
    if (!this.enabled) return null;
    const a = this.atlas.manifest?.assets.rubble;
    if (!a || !a.rubble) return null;
    return this.frameOf(a.group, rubbleName(w, h), { team: false, shadow: a.shadow });
  }
  /** Ícone do HUD (atlas `icons`, quadro = id): cor + máscara de time; null = emoji. */
  icon(id: string): BakedFrame | null {
    if (!this.enabled) return null;
    const a = this.atlas.manifest?.assets[id];
    if (!a || !a.icon) return null;
    return this.frameOf('icons', id, { team: a.team, shadow: false });
  }
  /** Prop pelo nome do quadro (`<kind>/<variante>[/<tag>]`); null = procedural. */
  prop(name: string): BakedFrame | null {
    if (!this.enabled || !this.atlas.manifest) return null;
    return this.frameOf('props', name, { team: false, shadow: true });
  }
  /** Os atlas de props estão servidos (o renderizador troca o atlas procedural de nós pelos props assados). */
  propsReady(): boolean { return this.enabled && !!this.atlas.manifest && this.served('props') !== null; }

  /** Tipos de unidade com páginas prontas numa escala (diagnóstico). */
  unitsReady(scale: ArtScale): string[] {
    const m = this.atlas.manifest; if (!m) return [];
    return Object.entries(m.assets).filter(([id, a]) => a.kind === 'unit' && this.atlas.assetStatus(id, scale) === 'ready').map(([id]) => id).sort();
  }

  /** Resumo para diagnóstico/scripts: estado do manifesto e de cada grupo (unidades: as páginas pedidas até agora). */
  status(): Record<string, string> {
    const out: Record<string, string> = { enabled: String(this.enabled), wanted: `${this.wanted}x`, manifest: this.atlas.manifestStatus, generation: String(this.generation), unitGen: String(this.unitGen) };
    for (const g of GROUPS) out[g] = `1x:${this.atlas.status(g, 1)} 2x:${this.atlas.status(g, 2)} servida:${this.served(g) ?? '-'}`;
    return out;
  }
}
