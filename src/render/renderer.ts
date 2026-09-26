// Renderizador PixiJS: terreno por shader (com fronteiras), nós como sprites, entidades interpoladas, efeitos, névoa e overlays.
import { Application, Container, Graphics, Sprite, Texture, Text, TextStyle } from 'pixi.js';
import { effectiveResolution, resolveQuality, PARTICLE_BUDGET, type Quality } from './quality';
import { TILE, TICK_RATE, DT, PLAYER_COLORS, KOTH_RADIUS, rankOf } from '../core/constants';
import { BUILDINGS, UNITS } from '../core/data';
import type { Building, GameState, Unit, VisualEffect } from '../core/types';
import { Camera } from './camera';
import { TextureCache, darken } from './textures';
import { getUnitStats, getBuildingStats } from '../core/sim/modifiers';
import { componentAt } from '../core/map/components';
import { distToRect } from '../core/map/grid';
import type { EditorUI } from '../editor/types';
import { terrainColor, regionColor, SHADOW_ALPHA } from './palette';
import { FogMesh } from './fog';
import { unitShadow, buildingShadow } from './shadows';
import { ChunkMesh, materialSizeFor, prewarmTerrain } from './terrain/ChunkMesh';
import { PropLayer } from './props';
import { ArtLibrary } from './art/ArtLibrary';
import { UnitView } from './views/UnitView';
import { BuildingView } from './views/BuildingView';
import { SmokeLayer } from './particles';
import {
  animDuration, buildingState, chooseAnim, deathAlpha, dirWithHysteresis, freshHit, isWalking, mulColor, type UnitAnim,
  WALL_LINK_TYPES, wallMask, buildingVariant, ageTier, farmCrop, damageLevel, gateNear, smokeRate, smokeBudget, rubbleAlpha, GLOW_ANIM, glowVariant,
  ghostTint, placementMasks, wallFlagAt, WALL_FLAG_PROBE,
} from './art/logic';

/** Cor de fundo (fora do mapa). */
const BG = 0x0b1020;
/** Folga (tiles) sobre as distâncias de trabalho/ataque da simulação para considerar a unidade "no posto". */
const POST_SLACK = 0.15;
/** Zoom mínimo padrão da partida; em mapas grandes/telas pequenas cai até enquadrar o mapa inteiro (ver updateMinZoom). */
const DEFAULT_MIN_ZOOM = 0.35;
/** Raio (em tiles) do anel de cada início no editor: o gerador limpa esse raio e o kit inicial cabe dentro dele. */
export const START_RING_RADIUS = 8;
/** Deslocamentos (em tiles, a partir do centro do CC) onde createGame põe os 5 cidadãos e o batedor do kit inicial. */
export const KIT_SPOTS: readonly (readonly [number, number])[] = [[-2, 2.5], [-1, 2.5], [0, 2.5], [1, 2.5], [2, 2.5], [3, 1]];

/** Canto (tile superior esquerdo) do footprint de um edifício cujo "centro" está no tile (x, y): equivalente por tile
 *  da colocação centrada no cursor usada na partida. O editor deve usar a mesma regra ao chamar canPlaceBuilding. */
export function buildingCorner(type: string, x: number, y: number): { tx: number; ty: number } {
  const def = BUILDINGS[type];
  if (!def) return { tx: x, ty: y };
  return { tx: x - Math.floor(def.w / 2), ty: y - Math.floor(def.h / 2) };
}

/** Vista de uma entidade: corpo (gira com a unidade) e sombra separada na camada 'shadows' (não gira; cai para sudeste).
 *  Com arte assada, `unit`/`bld` guardam a vista assada (corpo, máscara de time e sombra do atlas) e o corpo não gira. */
interface EntityView { root: Container; body: Sprite; shadow: Sprite | null; type: string; color: number; complete: boolean; angle: number; carry: Sprite | null; label?: Text; rank?: Graphics; rankShown?: number; unit: UnitView | null; bld: BuildingView | null }

/** Morte recente de uma unidade assada (o efeito 'death' do mesmo quadro herda a direção da vista que sumiu). */
interface RecentDeath { type: string; x: number; y: number; dir: number }
/** Edifício assado que sumiu neste quadro (o colapso do mesmo quadro usa a variante que ele mostrava). */
interface RecentGone { type: string; x: number; y: number; variant: string | null }
/** Escombros assados de um edifício que caiu (ficam RUBBLE_SECONDS de jogo no chão, apagando no fim). */
interface RubbleView { body: Sprite; shadow: Sprite | null; t0: number; tx: number; ty: number }

export interface RenderUI {
  localPlayer: number;
  selection: Set<number>;
  hoverId: number;
  placement: { type: string; tx: number; ty: number; ok: boolean; tiles?: { x: number; y: number; ok: boolean }[] } | null;
  dragRect: { x0: number; y0: number; x1: number; y1: number } | null;
  showRanges: boolean;
  editor?: EditorUI | null;          // sobreposições do editor de mapas (pincel, fantasmas, inícios, grade, regiões)
  powerTarget: { radius: number } | null;
  mouseWorld: { x: number; y: number };
}

export class Renderer {
  app!: Application;
  tex!: TextureCache;
  cam = new Camera();
  world = new Container();
  /** Ordem (docs/ART.md §3.7): terrain (shader: chão, água e fronteiras) → shadows → props (nós) → ground →
   *  buildings → units → fx → hp → editor → fog. Com a arte assada: terrain → shadows → ground → props (faixas com nós,
   *  edifícios e unidades ordenados juntos pelo y do pé) → buildings (vazia) → units (só voadoras) → fx → hp → editor → fog. */
  layers = { terrain: new Container(), shadows: new Container(), props: new Container(), ground: new Graphics(), buildings: new Container(), units: new Container(), fx: new Container(), hp: new Graphics(), ghost: new Container(), editor: new Container(), fog: new Container() };
  overlay = new Graphics();
  /** Compatibilidade com o editor (antes: chunks assados em cache). O terreno por shader não tem cache: no-op. */
  chunkCacheLimit = 60;
  /** Terreno por shader (um quad por chunk num Mesh só). */
  private terrain: ChunkMesh | null = null;
  /** Chunks de terreno desenhados no último quadro (overlay ?perf=1). */
  get visibleChunks(): number { return this.terrain?.visibleChunks ?? 0; }
  /** Nós como sprites (props.ts): um Container por faixa de chunks, filhos ordenados por zIndex = y. */
  private props!: PropLayer;
  /** Arte assada + procedural (art/ArtLibrary.ts). */
  art!: ArtLibrary;
  /** Modo assado em vigor (Quality.bakedArt na última reconstrução): ordem das camadas e vistas assadas. */
  private bakedMode = false;
  /** Geração da ArtLibrary já refletida nas vistas/props (mudou → reconstrói). */
  private artGen = -1;
  /** Unidades assadas morrendo/petrificadas (animação no lugar do sprite procedural girado), por efeito. */
  private dying = new Map<VisualEffect, UnitView>();
  private recentDeaths: RecentDeath[] = [];
  private recentGone: RecentGone[] = [];
  /** Fumaça dos edifícios danificados (partículas leves, orçamento do preset). */
  private smoke = new SmokeLayer();
  /** Escombros no chão e colapsos já vistos (um monte por queda). */
  private rubbleViews: RubbleView[] = [];
  private rubbleSeen = new WeakSet<VisualEffect>();
  /** Colapsos desenhados com o quadro assado (afundam em vez de encolher). */
  private bakedCollapses = new WeakSet<Container>();
  /** Topologia das muralhas (muralha/portão/torre): assinatura dos ids e versão; as vistas recalculam o bitmask só
   *  quando a versão muda (uma muralha nova, derrubada ou trocada de dono). */
  private wallSig = 0; private wallCount = -1; wallVersion = 0;
  /** Portões prontos no último quadro e os abertos neste (aliado a GATE_OPEN_RANGE). */
  private gateCount = 0;
  private gatesOpen = new Set<number>();
  /** Fantasma de construção assado (quadro complete translúcido tingido de verde/vermelho). */
  private ghostSprites: Sprite[] = [];
  /** Passo do relógio de jogo neste quadro (s): fumaça. */
  private animDt = 0;
  /** Ícones do HUD compostos (cor + máscara tingida) por tipo e cor, válidos até a próxima geração da arte. */
  private iconCache = new Map<string, string | null>();
  private iconGen = -1;
  private tmpVec = { x: 0, y: 0 };
  /** Ponto do alvo de quem está no posto (engagedTarget). */
  private tgtPt = { x: 0, y: 0 };
  private animIn = { moving: false, attacking: false, carrying: false, working: false };
  /** Relógio (s) das animações assadas: tempo de JOGO, (tick + alpha)/TICK_RATE, nunca voltando para trás. Congela na
   *  pausa e na espera do lockstep (ninguém anda no lugar) e acelera em 2×/3× junto com o movimento e os efeitos (a queda
   *  cabe no efeito 'death' em qualquer velocidade). O relógio real (`time`) segue para água, balanço procedural e tremor. */
  private animClock = 0;
  /** Moldura na cor do fundo em volta do mapa, acima de props e sombras (modo assado): copas e sombras da borda não vazam
   *  para fora do retângulo do mapa, que a névoa não cobre. */
  private edgeFrame = new Graphics();
  private edgeKey = -1;
  // Sobreposições do editor: texturas w×h de regiões/passabilidade (como a névoa), gráfico por quadro e rótulos dos inícios
  private edGfx = new Graphics();
  private edLabels: Text[] = [];
  private regCanvas!: HTMLCanvasElement; private regTex!: Texture; private regSprite!: Sprite; private regKey = '';
  private passCanvas!: HTMLCanvasElement; private passTex!: Texture; private passSprite!: Sprite; private passKey = '';
  /** Versão própria das edições (invalidateRect/setState): as texturas do editor são regeneradas quando ela muda. */
  private editVersion = 0;
  private views = new Map<number, EntityView>();
  /** Espectador: tudo visível (só na renderização; a simulação não muda). */
  revealAll = false;
  private fog: FogMesh | null = null; private fogVersion = -1;
  private terrVersion = -1;
  private fxViews = new Map<VisualEffect, Container>();
  private deathViews: { c: Container; ttl: number; total: number; kind: string }[] = [];
  private state: GameState | null = null;
  time = 0;

  async init(parent: HTMLElement): Promise<void> {
    this.app = new Application();
    // Sem antialias (docs/ART.md §3.9): sprites e terreno já são amostrados por textura; resolução = min(teto do preset, dpr) · renderScale
    await this.app.init({ resizeTo: parent, background: BG, antialias: false, preference: 'webgl', resolution: effectiveResolution(this.quality, window.devicePixelRatio || 1, this.renderScale), autoDensity: true });
    parent.appendChild(this.app.canvas);
    this.tex = new TextureCache(this.app.renderer);
    this.art = new ArtLibrary(this.tex, `${import.meta.env.BASE_URL ?? './'}art/`);
    this.art.configure(this.quality.bakedArt, this.quality.atlasScale);
    this.props = new PropLayer(this.tex, this.art);
    this.app.stage.addChild(this.world, this.overlay);
    this.world.addChild(this.layers.terrain, this.layers.shadows, this.layers.props, this.edgeFrame, this.layers.ground, this.layers.buildings, this.layers.units, this.layers.fx, this.layers.hp, this.layers.ghost, this.layers.editor, this.layers.fog);
    this.layers.fx.addChild(this.smoke.root);
    this.layers.ghost.sortableChildren = true;
    this.layers.ghost.eventMode = 'none';
    this.edgeFrame.visible = false;
    // atlas prontos sobem para a GPU um por quadro (no menu, enquanto a arte carrega): a partida não paga o upload +
    // mipmaps de todos no primeiro quadro que os usa
    this.app.ticker.add(() => this.uploadNextAtlas());
    this.layers.props.addChild(this.props.root);
    this.layers.shadows.addChild(this.props.shadowRoot);
    // Grupos de render (Pixi 8): o mundo é um grupo — mover a câmera muda só a transformação do grupo, sem recalcular a de
    // cada sprite —, e props e sombras dos props são grupos próprios. As faixas NÃO são grupos (cada grupo é um lote e um
    // draw call a mais, e com unidades andando elas refazem as instruções de qualquer jeito).
    this.world.isRenderGroup = true;
    this.layers.props.isRenderGroup = true;
    this.props.shadowRoot.isRenderGroup = true;
    this.layers.editor.visible = false;
    this.layers.units.sortableChildren = true;
    this.layers.buildings.sortableChildren = true;
    this.app.stage.eventMode = 'none';
  }

  get canvas(): HTMLCanvasElement { return this.app.canvas; }

  setState(state: GameState): void {
    this.state = state;
    this.cam.setMap(state.map.w, state.map.h);
    this.cam.resize(this.app.screen.width, this.app.screen.height);
    for (const v of this.views.values()) this.destroyView(v);
    this.views.clear();
    this.clearDying();
    this.layers.shadows.removeChildren();
    this.layers.shadows.addChild(this.props.shadowRoot);
    for (const v of this.fxViews.values()) v.destroy({ children: true });
    this.fxViews.clear();
    for (const d of this.deathViews) d.c.destroy({ children: true });
    this.deathViews = [];
    this.clearBakedExtras();
    this.wallCount = -1; this.wallVersion++;
    this.layers.fog.removeChildren();
    this.layers.terrain.removeChildren();
    this.fog?.destroy(); this.terrain?.destroy();
    const { w, h } = state.map;
    // Terreno (e fronteiras) por shader: texturas w×h escritas a partir do mapa; névoa: malha w×h própria (fog.ts)
    this.terrain = new ChunkMesh(state.map, this.quality); this.layers.terrain.addChild(this.terrain.mesh);
    this.fog = new FogMesh(w, h); this.layers.fog.addChild(this.fog.mesh);
    // arte assada: pré-aquecimento dos atlas (sem esperar; enquanto carrega, tudo sai procedural)
    this.bakedMode = this.quality.bakedArt; this.artGen = this.art.generation;
    this.animClock = 0;
    this.applyLayerOrder();
    this.props.reset(state, this.bakedMode, this.art.propsReady());
    this.art.prewarm();
    // Camada do editor: regiões e passabilidade como texturas w×h (regeneradas só quando algo muda), gráfico e rótulos
    this.layers.editor.removeChildren();
    for (const l of this.edLabels) l.destroy(); this.edLabels = [];
    this.regCanvas = document.createElement('canvas'); this.regCanvas.width = w; this.regCanvas.height = h;
    this.regTex = Texture.from(this.regCanvas); this.regTex.source.scaleMode = 'nearest';
    this.regSprite = new Sprite(this.regTex); this.regSprite.width = w * TILE; this.regSprite.height = h * TILE; this.regSprite.visible = false;
    this.passCanvas = document.createElement('canvas'); this.passCanvas.width = w; this.passCanvas.height = h;
    this.passTex = Texture.from(this.passCanvas); this.passTex.source.scaleMode = 'nearest';
    this.passSprite = new Sprite(this.passTex); this.passSprite.width = w * TILE; this.passSprite.height = h * TILE; this.passSprite.visible = false;
    this.edGfx = new Graphics();
    this.layers.editor.addChild(this.regSprite, this.passSprite, this.edGfx);
    this.layers.editor.visible = false;
    this.regKey = ''; this.passKey = ''; this.editVersion++;
    this.fogVersion = -1; this.terrVersion = -1; this.revealAll = false;
    this.updateMinZoom();
    // Mapa sem inícios (editor, mapa em branco): centra no meio
    const start = state.map.starts[0] ?? { x: w / 2, y: h / 2 };
    this.cam.zoom = 1.3;
    this.cam.centerOn(start.x, start.y);
  }

  resize(): void { this.cam.resize(this.app.screen.width, this.app.screen.height); this.updateMinZoom(); }

  /** Zoom que enquadra o mapa inteiro na tela atual. */
  private fitZoom(): number {
    if (!this.state) return DEFAULT_MIN_ZOOM;
    const { w, h } = this.state.map;
    return Math.min(this.app.screen.width / (w * TILE), this.app.screen.height / (h * TILE));
  }
  /** minZoom = min(padrão, zoom que enquadra o mapa): nunca mais restritivo que hoje, mas sempre dá para ver o mapa inteiro. */
  private updateMinZoom(): void {
    this.cam.minZoom = Math.min(DEFAULT_MIN_ZOOM, this.fitZoom());
    if (this.cam.zoom < this.cam.minZoom) { this.cam.zoom = this.cam.minZoom; this.cam.clamp(); }
  }
  /** Nome da GPU (WEBGL_debug_renderer_info) ou null; usado para detectar renderização por software. */
  gpuName(): string | null {
    try {
      const gl = (this.app.renderer as unknown as { gl?: WebGLRenderingContext }).gl; if (!gl) return null;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '') || null;
    } catch { return null; }
  }
  /** Enquadra o mapa inteiro: recalcula minZoom, aplica o zoom de enquadramento e centra a câmera (editor ao abrir). */
  fitMap(): void {
    if (!this.state) return;
    this.cam.resize(this.app.screen.width, this.app.screen.height);
    this.updateMinZoom();
    this.cam.zoom = Math.max(this.cam.minZoom, Math.min(this.cam.maxZoom, this.fitZoom()));
    this.cam.centerOn(this.state.map.w / 2, this.state.map.h / 2);
  }

  /**
   * Editor: o terreno/nós mudaram no retângulo de tiles [x0,x1]×[y0,y1] (inclusivo). Reescreve só os bytes desse
   * retângulo (mais a vizinhança que a profundidade/altura leem) nas texturas do terreno, re-sincroniza os sprites de
   * nós do retângulo e marca as texturas do editor (regiões/passabilidade) para regenerar. Nenhum mesh é recriado.
   */
  invalidateRect(x0: number, y0: number, x1: number, y1: number): void {
    const st = this.state; if (!st) return;
    const map = st.map;
    const ax0 = Math.max(0, Math.min(x0, x1)), ay0 = Math.max(0, Math.min(y0, y1));
    const ax1 = Math.min(map.w - 1, Math.max(x0, x1)), ay1 = Math.min(map.h - 1, Math.max(y0, y1));
    this.editVersion++;
    if (ax1 < ax0 || ay1 < ay0) return;
    this.terrain?.invalidateRect(ax0, ay0, ax1, ay1);
    this.props.syncRect(st, ax0, ay0, ax1, ay1);
  }
  /** Preset de qualidade em vigor (docs/ART.md §3.9); as etapas seguintes leem daqui sombras, partículas, água e shader. */
  quality: Quality = resolveQuality('auto');
  private renderScale = 1;
  private applyResolution(): void {
    this.app.renderer.resolution = effectiveResolution(this.quality, window.devicePixelRatio || 1, this.renderScale);
    this.app.resize();
    this.resize();
  }
  /** Resolução de renderização: fração da resolução nativa (0.25–1). Menos pixels = mais leve em GPUs fracas. */
  setRenderScale(scale: number): void {
    this.renderScale = Math.max(0.25, Math.min(1, scale));
    this.applyResolution();
  }
  /** Aplica um preset de qualidade: teto de resolução e, no terreno, shader completo/simples, normais e água animada. */
  setQuality(q: Quality): void {
    this.quality = q;
    this.terrain?.setQuality(q);
    // arte assada: liga/desliga e escala 1×/2× (a ArtLibrary muda de geração e as vistas são refeitas no próximo quadro)
    this.art?.configure(q.bakedArt, q.atlasScale);
    this.smoke.budget = smokeBudget(PARTICLE_BUDGET[q.particles] ?? 800);
    // materiais do preset gerados em segundo plano (um por macrotarefa, ≈ 250 ms no total a 512²) enquanto o menu está
    // aberto; main.ts chama setQuality logo após init, então a primeira partida já os encontra prontos
    prewarmTerrain(materialSizeFor(q));
    this.applyResolution();
  }

  // ---------------- Terreno (shader) e fronteiras ----------------
  private updateTerrain(state: GameState, local: number): void {
    const t = this.terrain; if (!t) return;
    t.cull(this.cam.visibleTiles());
    t.frame(this.time, this.cam.zoom);
    // Fronteiras: só uOwner é reescrito quando o território muda
    if (state.territoryVersion !== this.terrVersion) { this.terrVersion = state.territoryVersion; t.updateOwner(state.territory); }
    this.updateProps(state, local);
  }

  // ---------------- Nós (camada 'props', props.ts) ----------------
  private updateProps(state: GameState, local: number): void {
    this.props.update(state, local, this.revealAll, this.cam.visibleTiles());
  }

  // ---------------- Arte assada: modo, camadas e reconstrução ----------------
  /** Ordem das camadas do modo em vigor (ver `layers`). */
  private applyLayerOrder(): void {
    const L = this.layers;
    const F = this.edgeFrame;
    const order: Container[] = this.bakedMode
      ? [L.terrain, L.shadows, L.ground, L.props, F, L.buildings, L.units, L.fx, L.hp, L.ghost, L.editor, L.fog]
      : [L.terrain, L.shadows, L.props, F, L.ground, L.buildings, L.units, L.fx, L.hp, L.ghost, L.editor, L.fog];
    order.forEach((c, i) => this.world.setChildIndex(c, i));
    F.visible = this.bakedMode;   // desligada: visual idêntico ao anterior
  }
  /**
   * A ArtLibrary mudou de geração (atlas carregou/falhou, escala 1×/2× ou opção ligada/desligada): refaz as vistas de
   * entidades e os props com as texturas servidas agora, reordena as camadas e só então libera a escala que saiu de uso.
   */
  private rebuildArt(): void {
    this.artGen = this.art.generation;
    this.bakedMode = this.quality.bakedArt;
    for (const v of this.views.values()) this.destroyView(v);
    this.views.clear();
    this.clearDying();
    for (const v of this.fxViews.values()) v.destroy({ children: true });   // colapsos podem usar o atlas
    this.fxViews.clear();
    this.clearBakedExtras();
    this.wallVersion++;
    this.applyLayerOrder();
    if (this.state) this.props.reset(this.state, this.bakedMode, this.art.propsReady(), true);
    this.art.collect();
  }
  private clearDying(): void { for (const d of this.dying.values()) d.destroy(); this.dying.clear(); this.recentDeaths.length = 0; }
  /** Escombros, fumaça e fantasmas assados (usam texturas do atlas: saem antes de uma troca de arte ou de partida). */
  private clearBakedExtras(): void {
    for (const r of this.rubbleViews) { r.body.destroy(); r.shadow?.destroy(); }
    this.rubbleViews = []; this.rubbleSeen = new WeakSet(); this.recentGone.length = 0;
    this.smoke.clear();
    for (const g of this.ghostSprites) g.destroy();
    this.ghostSprites = [];
    this.iconCache.clear();
  }
  /** Moldura para um mapa w×h (redesenhada só quando o tamanho muda: setState, editor). */
  private updateEdgeFrame(w: number, h: number): void {
    const k = w * 65536 + h; if (k === this.edgeKey) return;
    this.edgeKey = k;
    // folga maior que o que a câmera mostra fora do mapa no zoom mínimo (mapa pequeno em tela 4K); cada faixa é um
    // retângulo preenchido à parte (vários retângulos num só caminho viram furos/sobras na triangulação)
    const W = w * TILE, H = h * TILE, M = Math.max(W, H) * 4 + 4096;
    const g = this.edgeFrame.clear();
    g.rect(-M, -M, W + 2 * M, M).fill(BG);
    g.rect(-M, H, W + 2 * M, M).fill(BG);
    g.rect(-M, 0, M, H).fill(BG);
    g.rect(W, 0, M, H).fill(BG);
  }
  /** Sobe para a GPU a próxima imagem de atlas pronta (uma por quadro do ticker). */
  private uploadNextAtlas(): void {
    const q = this.art?.atlas.uploads; if (!q || q.length === 0) return;
    const src = q.shift()!;
    if (src.destroyed) return;
    try { this.app.renderer.texture.initSource(src); } catch { /* sobe no primeiro uso */ }
  }

  // ---------------- Névoa (bordas macias por shader em fog.ts) ----------------
  private updateFog(state: GameState, local: number): void {
    const f = this.fog; if (!f) return;
    f.mesh.visible = !this.revealAll;
    if (this.revealAll || state.fogVersion === this.fogVersion) return;
    this.fogVersion = state.fogVersion;
    f.update(state.players[local].visibility);
  }

  /** O jogador local vê o edifício AGORA (dele, mapa revelado ou o tile do centro com visão): senão, sob a névoa, a
   *  vista assada mantém a última versão vista (docs/ART.md §1.8). Aliados dividem a visão (vis = 2 no tile deles). */
  private liveToLocal(state: GameState, local: number, b: Building): boolean {
    if (b.owner === local || state.config.revealMap || this.revealAll) return true;
    const vis = state.players[local].visibility;
    const i = Math.floor(b.y) * state.map.w + Math.floor(b.x);
    return i >= 0 && i < vis.length && vis[i] === 2;
  }
  /** Espessura (px de mundo) do contorno de time dos edifícios: ≈ 1,8 px de tela, entre 0,8 e 6 px de mundo. */
  private outlineWidth(): number { return Math.min(6, Math.max(0.8, 1.8 / Math.max(0.05, this.cam.zoom))); }

  private visibleToLocal(state: GameState, local: number, e: Unit | Building): boolean {
    if (e.owner === local || state.config.revealMap || this.revealAll) return true;
    const vis = state.players[local].visibility;
    const i = Math.floor(e.y) * state.map.w + Math.floor(e.x);
    if (i < 0 || i >= vis.length) return false;
    return e.kind === 'building' ? vis[i] >= 1 : vis[i] === 2;
  }

  // ---------------- Entidades ----------------
  private destroyView(v: EntityView): void {
    if (v.unit) v.unit.destroy(); else if (v.bld) v.bld.destroy();
    else { v.root.destroy({ children: true }); v.shadow?.destroy(); }
  }
  /**
   * y de desenho de um edifício (zIndex e faixa no modo assado; também a régua do pick): o centro, como as unidades pelo
   * pé. Edifício plano e pisável (fazenda) fica sob quem está em cima dele: a borda de cima do footprint. Com a arte
   * desligada, o centro (ordem só entre edifícios, como antes).
   */
  private buildingDrawY(b: Building): number { return this.bakedMode && BUILDINGS[b.type]?.passable ? b.ty - 0.01 : b.y; }
  /** Container onde a vista vive: no modo assado, a faixa de props do y do pé (ordem global); senão a camada antiga. */
  private parentFor(kind: 'unit' | 'building', y: number, flying: boolean): Container {
    if (this.bakedMode && !flying) { const row = this.props.rowFor(y); if (row) return row; }
    return kind === 'unit' ? this.layers.units : this.layers.buildings;
  }

  private getView(e: Unit | Building, color: number): EntityView {
    let v = this.views.get(e.id);
    const complete = e.kind === 'building' ? e.complete : true;
    // edifício assado troca de estágio sem refazer a vista; o procedural refaz ao completar (textura de obra → pronta)
    if (v && (v.type !== e.type || v.color !== color || (v.complete !== complete && !v.bld))) { this.destroyView(v); this.views.delete(e.id); v = undefined; }
    if (!v && this.bakedMode) v = this.makeBakedView(e, color);
    if (!v) {
      const root = new Container();
      const body = new Sprite(e.kind === 'unit' ? this.tex.unit(e.type, color) : this.tex.building(e.type, color, complete));
      body.anchor.set(0.5);
      root.addChild(body);
      // sombra separada: elipse (unidade) ou footprint (edifício), deslocada para sudeste, multiply, sem rotação
      let shadow: Sprite | null = null;
      if (e.kind === 'unit') { const sh = unitShadow(e.type); shadow = new Sprite(this.tex.shadowEllipse(sh.rx, sh.ry)); }
      else { const sh = buildingShadow(e.type); if (sh) shadow = new Sprite(this.tex.shadowRect(sh.w, sh.h)); }
      if (shadow) { shadow.anchor.set(0.5); shadow.alpha = SHADOW_ALPHA; shadow.blendMode = 'multiply'; this.layers.shadows.addChild(shadow); }
      v = { root, body, shadow, type: e.type, color, complete, angle: 0, carry: null, unit: null, bld: null };
      this.parentFor(e.kind, e.kind === 'building' ? this.buildingDrawY(e) : e.y, e.kind === 'unit' && !!UNITS[e.type]?.flying).addChild(root);
      this.views.set(e.id, v);
    }
    return v;
  }
  /** Vista assada (hoplita, cidadão, templo…) se a ArtLibrary tiver o tipo servido; senão undefined (procedural). */
  private makeBakedView(e: Unit | Building, color: number): EntityView | undefined {
    if (e.kind === 'unit') {
      if (UNITS[e.type]?.flying) return undefined;
      const art = this.art.unit(e.type);
      if (!art) return undefined;
      const uv = new UnitView(art, this.art, e.type, color, this.layers.shadows, 2);
      uv.lastAttackTick = e.attackTick;   // um golpe antigo não dispara a animação de ataque ao criar a vista
      const v: EntityView = { root: uv.root, body: uv.body, shadow: uv.shadow, type: e.type, color, complete: true, angle: Math.PI / 2, carry: null, unit: uv, bld: null };
      this.parentFor('unit', e.y, false).addChild(uv.root);
      this.views.set(e.id, v);
      return v;
    }
    // só com todos os estados assados em todas as variantes (senão a obra ou o dano ficariam sem quadro): procedural
    if (!this.art.buildingArt(e.type)) return undefined;
    const bv = new BuildingView(this.art, e.type, color, this.layers.shadows);
    const v: EntityView = { root: bv.root, body: bv.body, shadow: bv.shadow, type: e.type, color, complete: e.complete, angle: 0, carry: null, unit: null, bld: bv };
    this.parentFor('building', this.buildingDrawY(e), false).addChild(bv.root);
    this.views.set(e.id, v);
    return v;
  }

  /** Ids vistos no quadro (reutilizado: nada de Set novo por quadro). */
  private seen = new Set<number>();
  private updateEntities(state: GameState, alpha: number, ui: RenderUI): void {
    const seen = this.seen; seen.clear();
    const vt = this.cam.visibleTiles();
    if (this.bakedMode) this.updateGatesOpen(state, ui.localPlayer);
    let wallSig = 0, wallCount = 0, gateCount = 0;
    for (const b of state.buildings.values()) {
      if (WALL_LINK_TYPES.has(b.type)) {
        // id, dono e POSIÇÃO: o editor move uma muralha mantendo o id (moveEntity), e o bitmask dos vizinhos muda
        wallSig = (Math.imul(wallSig, 31) + ((b.id * 4 + b.owner) ^ (b.tx * 4096 + b.ty))) | 0; wallCount++;
        if (b.type === 'gate' && b.complete) gateCount++;
      }
      if (b.x < vt.x0 - 3 || b.x > vt.x1 + 3 || b.y < vt.y0 - 3 || b.y > vt.y1 + 3) continue;
      if (!this.visibleToLocal(state, ui.localPlayer, b)) continue;
      const color = PLAYER_COLORS[b.owner % PLAYER_COLORS.length].num;
      const v = this.getView(b, color);
      const tint = b.disabledUntil > state.tick ? 0xb39ddb : state.tick - b.lastDamageTick < 3 ? 0xff9999 : 0xffffff;
      if (v.bld) {
        // estado: obra pelo progresso (< 33 / 66 / 100 %), pronto, dano pela vida (≥ 1/3, ≥ 2/3 perdida) ou portão aberto;
        // variante: bitmask da muralha / eixo do portão (recalculados só quando a topologia muda) ou Idade do dono.
        // Edifício de outro time sob a névoa (explorado, fora de vista): fica a última versão vista — estado, variante,
        // fumaça e brilho não mudam (senão o portão abrindo, o dano ou a muralha nova vazariam o que a névoa esconde).
        const art = this.art.buildingArt(b.type);
        const live = this.liveToLocal(state, ui.localPlayer, b) || v.bld.state === '';
        let open = false, hpFrac = 1;
        if (live) {
          const frac = b.complete ? 1 : b.progress / Math.max(1e-6, getBuildingStats(state, state.players[b.owner], b.type).buildTime);
          hpFrac = b.hp / Math.max(1, b.maxHp);
          open = !!art?.states.has('open') && b.complete && this.gatesOpen.has(b.id);
          let variant: string | null = null;
          if (art?.variantBy === 'ageTier') variant = ageTier(state.players[b.owner].age);
          else if (art?.variantBy === 'farmCrop') variant = farmCrop((state.tick - b.builtTick) / TICK_RATE, b.id);
          else if (art?.variantBy) {
            if (v.bld.maskVersion !== this.wallVersion) {
              v.bld.mask = this.wallMaskOf(state, b); v.bld.maskVersion = this.wallVersion;
              v.bld.maskVariant = buildingVariant(art.variantBy, { mask: v.bld.mask, age: 0, flag: !!art.variants?.includes(WALL_FLAG_PROBE) && wallFlagAt(b.tx, b.ty) });
            }
            variant = v.bld.maskVariant;
          }
          v.bld.show(buildingState(frac, b.complete, hpFrac, open), variant);
        }
        // sobreposição animada do edifício pronto (portal dos titãs), no relógio de jogo, também danificado
        if (art?.glow) v.bld.showGlow(v.bld.shownComplete ? this.art.building(b.type, GLOW_ANIM, glowVariant(this.animClock, art.glow.frames, art.glow.fps)) : null);
        v.bld.place(b.x * TILE, b.y * TILE);
        v.bld.setOutline(this.quality.teamOutline ? this.outlineWidth() : 0);
        // fumaça de dano (partícula, não assada): só pronto e danificado, dentro do orçamento do preset, e à vista
        const dmg = live && b.complete && !open ? damageLevel(hpFrac) : 0;
        if (dmg) this.emitSmoke(v.bld, b, dmg);
        v.bld.tint(tint, mulColor(color, tint));
        v.complete = b.complete;
        const by = this.buildingDrawY(b);
        const parent = this.parentFor('building', by, false); if (v.root.parent !== parent) parent.addChild(v.root);
        v.root.zIndex = by;
        v.bld.visible = true;
        seen.add(b.id);
        continue;
      }
      v.root.position.set(b.x * TILE, b.y * TILE);
      v.root.zIndex = this.buildingDrawY(b);
      v.root.visible = true;
      if (v.shadow) { const sh = buildingShadow(b.type)!; v.shadow.position.set(b.x * TILE + sh.dx, b.y * TILE + sh.dy); v.shadow.visible = true; }
      v.body.tint = tint;
      seen.add(b.id);
    }
    // topologia das muralhas mudou: as vistas recalculam o bitmask no próximo quadro
    if (wallSig !== this.wallSig || wallCount !== this.wallCount) { this.wallSig = wallSig; this.wallCount = wallCount; this.wallVersion++; }
    this.gateCount = gateCount;
    for (const u of state.units.values()) {
      if (u.inside !== -1) continue;
      const ix = u.px + (u.x - u.px) * alpha, iy = u.py + (u.y - u.py) * alpha;
      if (ix < vt.x0 - 2 || ix > vt.x1 + 2 || iy < vt.y0 - 2 || iy > vt.y1 + 2) continue;
      if (!this.visibleToLocal(state, ui.localPlayer, u)) continue;
      const color = PLAYER_COLORS[u.owner % PLAYER_COLORS.length].num;
      const v = this.getView(u, color);
      const flying = !!UNITS[u.type].flying;
      v.root.zIndex = iy + (flying ? 1000 : 0);
      v.root.visible = true;
      const bodyTint = state.tick - u.lastDamageTick < 3 ? 0xff8080 : (state.tick < state.players[u.owner].bronzeUntil ? 0xffd28a : 0xffffff);
      if (v.unit) this.updateBakedUnit(state, u, v, ix, iy, bodyTint, color);
      else {
        // direção: movimento, ou o alvo quando parado atacando/coletando/construindo
        const dx = u.x - u.px, dy = u.y - u.py;
        const moving = dx * dx + dy * dy > 1e-6;
        if (moving) v.angle = Math.atan2(dy, dx);
        else if (u.state === 'attack' || u.state === 'gather' || u.state === 'build') {
          const t = u.state === 'attack' ? (state.units.get(u.targetId) ?? state.buildings.get(u.targetId)) : (u.nodeId > 0 ? state.map.nodes.get(u.nodeId) : (u.nodeId < 0 ? state.buildings.get(-u.nodeId) : state.buildings.get(u.targetId)));
          if (t) { const tx = 'kind' in t ? t.x : t.x + 0.5, ty = 'kind' in t ? t.y : t.y + 0.5; v.angle = Math.atan2(ty - iy, tx - ix); }
        }
        v.root.position.set(ix * TILE, iy * TILE);
        v.body.rotation = v.angle;
        // animações simples: balanço ao andar, investida ao atacar
        const bob = moving ? 1 + Math.sin(this.time * 14 + u.id) * 0.06 : 1;
        const lunge = state.tick - u.attackTick < 4 ? 1 + (4 - (state.tick - u.attackTick)) * 0.08 : 1;
        v.body.scale.set(bob * lunge, bob);
        if (flying) v.body.position.y = -6 + Math.sin(this.time * 3 + u.id) * 2;
        // sombra: acompanha o pé, não gira, cai para sudeste (mais longe e mais fraca para voadoras)
        if (v.shadow) {
          const sh = unitShadow(u.type);
          v.shadow.position.set(ix * TILE + sh.dx, iy * TILE + sh.dy);
          v.shadow.scale.set(bob);
          v.shadow.alpha = flying ? SHADOW_ALPHA * 0.6 : u.type === 'shade' ? SHADOW_ALPHA * 0.4 : SHADOW_ALPHA;
          v.shadow.visible = true;
        }
        v.body.tint = bodyTint;
        v.body.alpha = u.type === 'shade' ? 0.7 : 1;
      }
      if (this.bakedMode) { const parent = this.parentFor('unit', iy, flying); if (v.root.parent !== parent) parent.addChild(v.root); }
      // patente de veterano (estrelas acima da unidade; na assada, acima do topo do quadro)
      const rk = UNITS[u.type].tags.includes('military') && !UNITS[u.type].tags.includes('titan') ? rankOf(u.kills) : 0;
      if (rk !== (v.rankShown ?? 0)) {
        v.rankShown = rk;
        if (!v.rank) { v.rank = new Graphics(); v.root.addChild(v.rank); if (v.unit) v.rank.position.y = 16 - v.unit.art.top - 6; }
        v.rank.clear();
        for (let i = 0; i < rk; i++) v.rank.star(-6 + i * 6 - (rk - 1) * 3 + 3, -16, 4, 3, 1.5).fill({ color: 0xfde047 });
      }
      // carga: disco na cor do recurso (também na assada — o cesto da animação 'carry' é o mesmo para tudo e some com a
      // unidade parada), ao lado da cabeça
      if (u.carry && u.carryAmt > 0) {
        if (!v.carry) { v.carry = new Sprite(this.tex.disc(3.5, 0xffffff)); v.carry.anchor.set(0.5); v.root.addChild(v.carry); }
        v.carry.visible = true; v.carry.tint = u.carry === 'food' ? 0xef4444 : u.carry === 'wood' ? 0x92400e : 0xf2c14e;
        v.carry.position.set(v.unit ? -10 : -8, v.unit ? -v.unit.art.top * 0.8 : -8);
      } else if (v.carry) v.carry.visible = false;
      seen.add(u.id);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) {
      const e = state.units.get(id) ?? state.buildings.get(id);
      if (!e) {
        // unidade assada que sumiu (morreu): o efeito 'death' deste quadro herda a direção dela
        if (v.unit && v.root.visible) this.recentDeaths.push({ type: v.type, x: v.root.position.x, y: v.root.position.y, dir: v.unit.dir });
        if (v.bld && v.bld.visible) this.recentGone.push({ type: v.type, x: v.bld.x, y: v.bld.y, variant: v.bld.variant });
        this.destroyView(v); this.views.delete(id);
      } else if (v.unit) v.unit.visible = false;
      else if (v.bld) v.bld.visible = false;
      else { v.root.visible = false; if (v.shadow) v.shadow.visible = false; }
    }
  }

  /** Bitmask (N = 1, L = 2, S = 4, O = 8) dos vizinhos muralha/portão/torre do mesmo dono em volta de um edifício 1×1. */
  private wallMaskOf(state: GameState, b: Building): number {
    const map = state.map, w = map.w;
    const link = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= w || y >= map.h) return false;
      const id = map.buildingAt[y * w + x];
      if (id === -1 || id === b.id) return false;
      const o = state.buildings.get(id);
      return !!o && o.owner === b.owner && WALL_LINK_TYPES.has(o.type);
    };
    return wallMask(link(b.tx, b.ty - 1), link(b.tx + b.w, b.ty), link(b.tx, b.ty + b.h), link(b.tx - 1, b.ty));
  }
  /**
   * Portões abertos neste quadro: pronto e com uma unidade do mesmo time a GATE_OPEN_RANGE do centro (o estado que o
   * núcleo já tem: `gateTeam` deixa o time passar). Só conta unidade que o jogador local vê (a dele, a de aliado ou a
   * inimiga em tile visível): um inimigo escondido pela névoa não abre o portão na tela. Só varre as unidades se algum
   * portão existia no último quadro.
   */
  private updateGatesOpen(state: GameState, local: number): void {
    this.gatesOpen.clear();
    if (this.gateCount === 0) return;
    const map = state.map, w = map.w;
    for (const u of state.units.values()) {
      if (u.inside !== -1 || !this.visibleToLocal(state, local, u)) continue;
      const team = state.players[u.owner]?.team;
      const fx = Math.floor(u.x), fy = Math.floor(u.y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = fx + dx, y = fy + dy;
        if (x < 0 || y < 0 || x >= w || y >= map.h) continue;
        const i = y * w + x;
        if (map.gateTeam[i] !== team) continue;
        if (gateNear(u.x, u.y, x + 0.5, y + 0.5)) this.gatesOpen.add(map.buildingAt[i]);
      }
    }
  }
  /** Fumaça de um edifício danificado: baforadas do terço de cima do quadro, na taxa do nível de dano. */
  private emitSmoke(bv: BuildingView, b: Building, level: 1 | 2): void {
    bv.smokeAcc += smokeRate(level, b.w * b.h) * this.animDt;
    if (bv.smokeAcc < 1) return;
    const n = Math.floor(bv.smokeAcc); bv.smokeAcc -= n;
    const hw = b.w * TILE * 0.38, top = bv.y - bv.top;
    this.smoke.emit(n, bv.x - hw, bv.x + hw, top + bv.top * 0.12, top + bv.top * 0.45, level === 2);
  }

  /**
   * Unidade no posto: alvo ao alcance, golpeando (entre golpes também), coletando ou construindo. Mesmas distâncias da
   * simulação (core/sim/units.ts: alcance do ataque + raios, 1,0 do nó, 0,9 da fazenda, 0,95 da obra) com POST_SLACK de
   * folga; o ponto do alvo vai para tgtPt. No posto a vista fica parada virada para o alvo, e o empurrão da separação
   * entre vizinhos (que mexe no x/y todo tick num aglomerado) não vira passo nem direção.
   */
  private engagedTarget(state: GameState, u: Unit): boolean {
    const p = this.tgtPt;
    if (u.state === 'attack') {
      const t = state.units.get(u.targetId) ?? state.buildings.get(u.targetId);
      if (!t) return false;
      const reach = getUnitStats(state, state.players[u.owner], u.type).range + UNITS[u.type].radius + (t.kind === 'unit' ? UNITS[t.type].radius : 0);
      const d = t.kind === 'building' ? distToRect(u.x, u.y, t.tx, t.ty, t.w, t.h) : Math.sqrt((u.x - t.x) * (u.x - t.x) + (u.y - t.y) * (u.y - t.y));
      if (d > reach + POST_SLACK) return false;
      p.x = t.x; p.y = t.y; return true;
    }
    if (u.state === 'gather') {
      if (u.nodeId > 0) {
        const n = state.map.nodes.get(u.nodeId);
        if (!n || distToRect(u.x, u.y, n.x, n.y, 1, 1) > 1.0 + POST_SLACK) return false;
        p.x = n.x + 0.5; p.y = n.y + 0.5; return true;
      }
      const f = u.nodeId < 0 ? state.buildings.get(-u.nodeId) : undefined;
      if (!f || distToRect(u.x, u.y, f.tx, f.ty, f.w, f.h) > 0.9 + POST_SLACK) return false;
      p.x = f.x; p.y = f.y; return true;
    }
    if (u.state === 'build') {
      const b = state.buildings.get(u.targetId);
      if (!b || distToRect(u.x, u.y, b.tx, b.ty, b.w, b.h) > 0.95 + POST_SLACK) return false;
      p.x = b.x; p.y = b.y; return true;
    }
    return false;
  }

  /**
   * Unidade assada. Direção (com histerese, pela projeção NA TELA): no posto, para o alvo; andando de fato, pela
   * velocidade; senão mantém a última. Andar = deslocamento do tick acima de uma fração do passo (isWalking), nunca no
   * posto. Animação pelo estado (cada golpe novo e recente recomeça o ataque do quadro 0), quadro a 10 fps no relógio de
   * jogo (animClock). O cesto de 'carry' só com comida (não há quadros de carga por recurso: madeira e ouro andam com
   * 'walk' e o disco da cor do recurso).
   */
  private updateBakedUnit(state: GameState, u: Unit, v: EntityView, ix: number, iy: number, bodyTint: number, color: number): void {
    const uv = v.unit!, art = uv.art, clock = this.animClock;
    const posted = this.engagedTarget(state, u);
    const dx = u.x - u.px, dy = u.y - u.py;
    const walking = !posted && isWalking(dx * dx + dy * dy, getUnitStats(state, state.players[u.owner], u.type).speed * DT, uv.anim === 'walk' || uv.anim === 'carry');
    let dir = uv.dir;
    const s = posted ? this.cam.worldDeltaToScreen(this.tgtPt.x - ix, this.tgtPt.y - iy, this.tmpVec) : walking ? this.cam.worldDeltaToScreen(dx, dy, this.tmpVec) : null;
    if (s && (s.x * s.x + s.y * s.y) > 1e-6) dir = dirWithHysteresis(Math.atan2(s.y, s.x), uv.dir);
    const atk = art.anims.attack;
    const hit = freshHit(u.attackTick, uv.lastAttackTick, state.tick, atk ? Math.ceil(animDuration(atk.frames, atk.fps) * TICK_RATE) : 0);
    uv.lastAttackTick = u.attackTick;
    const attacking = hit || (uv.anim === 'attack' && !uv.finished(clock));
    const ai = this.animIn;
    ai.moving = walking; ai.attacking = attacking; ai.carrying = u.carry === 'food' && u.carryAmt >= 1;
    ai.working = posted && (u.state === 'gather' || u.state === 'build');
    const anim: UnitAnim = chooseAnim(ai, art.has);
    uv.pose(anim, dir, clock, hit && anim === 'attack');
    uv.tick(clock, (u.id % 13) * 0.077);
    uv.place(ix * TILE, iy * TILE);
    uv.tint(bodyTint, mulColor(color, bodyTint));
    uv.visible = true;
  }

  // ---------------- Overlays: seleção, vida, construção, alcance, fantasma ----------------
  private updateGround(state: GameState, alpha: number, ui: RenderUI): void {
    const g = this.layers.ground; g.clear();
    const hp = this.layers.hp; hp.clear();
    const local = ui.localPlayer;
    for (const r of state.relics) {   // relíquias no chão (ou acima do herói que a carrega)
      if (r.templeId !== -1) continue;
      const y = r.carrier !== -1 ? r.y - 0.9 : r.y;
      g.circle(r.x * TILE, y * TILE, 7).fill({ color: 0x7c3aed, alpha: 0.9 }).stroke({ width: 2, color: 0xfde047 });
      g.circle(r.x * TILE, y * TILE, 3).fill({ color: 0xfde047 });
    }
    if (state.koth) {   // Rei da Colina: anel da colina na cor do time que a segura
      const k = state.koth;
      const holder = k.team === -1 ? null : state.players.find((p) => p.team === k.team);
      const color = holder ? PLAYER_COLORS[holder.id % PLAYER_COLORS.length].num : 0xf2c14e;
      const pulse = 1 + 0.03 * Math.sin(performance.now() / 300);
      g.circle(k.x * TILE, k.y * TILE, KOTH_RADIUS * TILE * pulse).stroke({ width: 3, color, alpha: 0.85 });
      g.circle(k.x * TILE, k.y * TILE, KOTH_RADIUS * TILE).fill({ color, alpha: 0.08 });
      g.circle(k.x * TILE, k.y * TILE, 6).fill({ color: 0xf2c14e, alpha: 0.9 });
    }
    for (const id of ui.selection) {
      const e = state.units.get(id) ?? state.buildings.get(id);
      if (!e) continue;
      const color = e.owner === local ? 0x8ff58f : state.players[e.owner].team === state.players[local].team ? 0xfde68a : 0xff7b7b;
      if (e.kind === 'unit') {
        const ix = e.px + (e.x - e.px) * alpha, iy = e.py + (e.y - e.py) * alpha;
        const r = UNITS[e.type].radius * TILE * 1.4;
        g.ellipse(ix * TILE, iy * TILE + r * 0.3, r, r * 0.6).stroke({ width: 2, color, alpha: 0.9 });
        if (ui.showRanges) { const st = getUnitStats(state, state.players[e.owner], e.type); if (st.range >= 1.6) g.circle(ix * TILE, iy * TILE, st.range * TILE).stroke({ width: 1, color: 0xffffff, alpha: 0.25 }); }
        // waypoints: destino atual + ordens enfileiradas (Shift)
        if (e.owner === local && (e.state === 'move' || e.state === 'attackMove' || e.queue.length > 0)) {
          let lx = ix * TILE, ly = iy * TILE;
          const pts: { x: number; y: number; atk: boolean }[] = [];
          if (e.state === 'move' || e.state === 'attackMove') pts.push({ x: e.tx, y: e.ty, atk: e.state === 'attackMove' });
          for (const o of e.queue) if (o.x !== undefined && o.y !== undefined) pts.push({ x: o.x, y: o.y, atk: o.type === 'attackMove' });
          for (const p of pts) { g.moveTo(lx, ly).lineTo(p.x * TILE, p.y * TILE).stroke({ width: 1, color: p.atk ? 0xff7b7b : 0x8ff58f, alpha: 0.45 }); g.circle(p.x * TILE, p.y * TILE, 3).fill({ color: p.atk ? 0xff7b7b : 0x8ff58f, alpha: 0.7 }); lx = p.x * TILE; ly = p.y * TILE; }
        }
      } else {
        g.rect(e.tx * TILE - 2, e.ty * TILE - 2, e.w * TILE + 4, e.h * TILE + 4).stroke({ width: 2, color, alpha: 0.9 });
        if (e.owner === local && e.rallyX >= 0) {
          g.moveTo(e.x * TILE, e.y * TILE).lineTo(e.rallyX * TILE, e.rallyY * TILE).stroke({ width: 1.5, color: 0xffe66d, alpha: 0.7 });
          g.rect(e.rallyX * TILE - 1, e.rallyY * TILE - 14, 2, 14).fill(0xffe66d).poly([e.rallyX * TILE + 1, e.rallyY * TILE - 14, e.rallyX * TILE + 10, e.rallyY * TILE - 10, e.rallyX * TILE + 1, e.rallyY * TILE - 6]).fill(0xffe66d);
        }
        if (ui.showRanges && BUILDINGS[e.type].attack) { const st = getBuildingStats(state, state.players[e.owner], e.type); g.circle(e.x * TILE, e.y * TILE, st.range * TILE).stroke({ width: 1, color: 0xffffff, alpha: 0.25 }); }
      }
    }
    // hover
    if (ui.hoverId >= 0 && !ui.selection.has(ui.hoverId)) {
      const e = state.units.get(ui.hoverId) ?? state.buildings.get(ui.hoverId);
      if (e && this.visibleToLocal(state, local, e)) {
        if (e.kind === 'unit') g.circle(e.x * TILE, e.y * TILE, UNITS[e.type].radius * TILE * 1.4).stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
        else g.rect(e.tx * TILE, e.ty * TILE, e.w * TILE, e.h * TILE).stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
      }
    }
    // barras de vida e progresso
    const vt = this.cam.visibleTiles();
    for (const u of state.units.values()) {
      if (u.inside !== -1) continue;
      if (u.x < vt.x0 || u.x > vt.x1 || u.y < vt.y0 || u.y > vt.y1) continue;
      if (!this.visibleToLocal(state, local, u)) continue;
      const selected = ui.selection.has(u.id);
      if (!selected && u.hp >= u.maxHp && state.tick - u.lastDamageTick > 6 * TICK_RATE) continue;
      const ix = u.px + (u.x - u.px) * alpha, iy = u.py + (u.y - u.py) * alpha;
      const r = UNITS[u.type].radius * TILE;
      // assada: acima do topo visível do quadro (a moldura inteira inclui lança/morte/sombra e deixaria a barra solta)
      const uv = this.views.get(u.id)?.unit;
      const w = Math.max(18, r * 2.4), x = ix * TILE - w / 2, y = uv ? iy * TILE - uv.art.top - 6 : iy * TILE - r - 8;
      const frac = Math.max(0, u.hp / u.maxHp);
      hp.rect(x, y, w, 3.5).fill({ color: 0x000000, alpha: 0.6 });
      hp.rect(x, y, w * frac, 3.5).fill(frac > 0.6 ? 0x4ade80 : frac > 0.3 ? 0xfacc15 : 0xef4444);
    }
    for (const b of state.buildings.values()) {
      if (b.x < vt.x0 - 3 || b.x > vt.x1 + 3 || b.y < vt.y0 - 3 || b.y > vt.y1 + 3) continue;
      if (!this.visibleToLocal(state, local, b)) continue;
      const selected = ui.selection.has(b.id);
      const bv = this.views.get(b.id)?.bld;
      const w = b.w * TILE - 6, x = b.tx * TILE + 3, y = bv ? Math.min(b.ty * TILE - 7, b.y * TILE - bv.top - 6) : b.ty * TILE - 7;
      if (!b.complete) {
        const bt = getBuildingStats(state, state.players[b.owner], b.type).buildTime;
        const frac = Math.min(1, b.progress / bt);
        hp.rect(x, y, w, 4).fill({ color: 0x000000, alpha: 0.6 }); hp.rect(x, y, w * frac, 4).fill(0x60a5fa);
      } else if (selected || b.hp < b.maxHp) {
        const frac = Math.max(0, b.hp / b.maxHp);
        hp.rect(x, y, w, 4).fill({ color: 0x000000, alpha: 0.6 }); hp.rect(x, y, w * frac, 4).fill(frac > 0.6 ? 0x4ade80 : frac > 0.3 ? 0xfacc15 : 0xef4444);
      }
      if (b.garrison.length > 0 && this.visibleToLocal(state, local, b)) { hp.rect(b.tx * TILE + 2, b.ty * TILE + 2, 10, 10).fill({ color: 0x000000, alpha: 0.6 }); hp.circle(b.tx * TILE + 7, b.ty * TILE + 7, 3).fill(0xffffff); }
      if (b.owner === local && b.complete && b.queue.length > 0 && !selected) {
        const q = b.queue[0]; const frac = q.elapsed / q.total;
        hp.rect(x, y + 5, w, 2.5).fill({ color: 0x000000, alpha: 0.5 }); hp.rect(x, y + 5, w * frac, 2.5).fill(0xfbbf24);
      }
    }
    // fantasma de construção (e alvo de poder): no modo assado, por cima de tudo (árvores e edifícios altos o cobririam)
    const top = this.bakedMode ? hp : g;
    const ghosts = this.updateGhost(state, ui);
    if (ui.placement) {
      const p = ui.placement;
      const tiles = p.tiles ?? [{ x: p.tx, y: p.ty, ok: p.ok }];
      const def = BUILDINGS[p.type];
      // com o fantasma assado por cima, o retângulo do footprint fica mais leve onde PODE; onde não pode continua forte
      // (o fantasma vermelho sobre telhado de terracota, sozinho, lê quase como um edifício de verdade)
      for (const t of tiles) {
        const fillA = t.ok && ghosts > 0 ? 0.2 : 0.35;
        top.rect(t.x * TILE, t.y * TILE, def.w * TILE, def.h * TILE).fill({ color: t.ok ? 0x4ade80 : 0xef4444, alpha: fillA }).rect(t.x * TILE, t.y * TILE, def.w * TILE, def.h * TILE).stroke({ width: 1.5, color: t.ok ? 0x4ade80 : 0xef4444, alpha: 0.9 });
      }
      if (def.territory) top.circle((p.tx + def.w / 2) * TILE, (p.ty + def.h / 2) * TILE, (def.territory + state.players[local].mods.player.territory) * TILE).stroke({ width: 1, color: 0xffffff, alpha: 0.3 });
    }
    if (ui.powerTarget) top.circle(ui.mouseWorld.x * TILE, ui.mouseWorld.y * TILE, ui.powerTarget.radius * TILE).stroke({ width: 2, color: 0xfde68a, alpha: 0.8 }).circle(ui.mouseWorld.x * TILE, ui.mouseWorld.y * TILE, ui.powerTarget.radius * TILE).fill({ color: 0xfde68a, alpha: 0.12 });
  }

  /**
   * Fantasma de construção com a arte assada: o quadro `complete` de cada tile da colocação, translúcido e tingido de
   * verde/vermelho, na variante que o edifício teria ali (bitmask da linha de muralha somada às muralhas existentes do
   * jogador, eixo do portão, Idade do jogador). Devolve quantos sprites mostrou (0 = só o retângulo, como antes).
   */
  private updateGhost(state: GameState, ui: RenderUI): number {
    let used = 0;
    const p = ui.placement;
    const art = this.bakedMode && p ? this.art.buildingArt(p.type) : null;
    if (p && art) {
      const def = BUILDINGS[p.type];
      const tiles = p.tiles ?? [{ x: p.tx, y: p.ty, ok: p.ok }];
      const local = ui.localPlayer, map = state.map;
      const linked = (x: number, y: number): boolean => {
        if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
        const id = map.buildingAt[y * map.w + x];
        const o = id === -1 ? undefined : state.buildings.get(id);
        return !!o && o.owner === local && WALL_LINK_TYPES.has(o.type);
      };
      const masks = art.variantBy === 'wallMask' || art.variantBy === 'gateAxis' ? placementMasks(tiles, linked) : null;
      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        const variant = art.variantBy === 'ageTier' ? ageTier(state.players[local]?.age ?? 0) : art.variantBy ? buildingVariant(art.variantBy, { mask: masks?.[i] ?? 0, age: 0, flag: !!art.variants?.includes(WALL_FLAG_PROBE) && wallFlagAt(t.x, t.y) }) : null;
        const f = this.art.building(p.type, 'complete', variant);
        if (!f) continue;
        let s = this.ghostSprites[used];
        if (!s) { s = new Sprite(); this.ghostSprites.push(s); this.layers.ghost.addChild(s); }
        s.texture = f.color; s.anchor.set(f.anchor.x, f.anchor.y);
        s.position.set((t.x + def.w / 2) * TILE, (t.y + def.h / 2) * TILE);
        s.zIndex = t.y + def.h / 2;
        s.alpha = t.ok ? 0.6 : 0.5; s.tint = ghostTint(t.ok); s.visible = true;
        used++;
      }
    }
    for (let i = used; i < this.ghostSprites.length; i++) this.ghostSprites[i].visible = false;
    return used;
  }

  /**
   * Escombros de uma queda (modo assado): o monte `rubble/<w>x<h>` no lugar do edifício, com sombra, deitado na faixa
   * da borda de cima da pegada (quem passa por cima fica na frente); some depois de RUBBLE_SECONDS de jogo, apagando.
   */
  private addRubble(e: VisualEffect, type: string): void {
    const def = BUILDINGS[type]; if (!def) return;
    const f = this.art.rubble(def.w, def.h); if (!f) return;
    const body = new Sprite(f.color); body.anchor.set(f.anchor.x, f.anchor.y); body.position.set(e.x * TILE, e.y * TILE);
    const zy = e.y - def.h / 2 - 0.01;
    body.zIndex = zy;
    this.parentFor('building', zy, false).addChild(body);
    let shadow: Sprite | null = null;
    if (f.shadow) { shadow = new Sprite(f.shadow); shadow.anchor.set(f.anchor.x, f.anchor.y); shadow.position.set(e.x * TILE, e.y * TILE); shadow.alpha = SHADOW_ALPHA; shadow.blendMode = 'multiply'; this.layers.shadows.addChild(shadow); }
    this.rubbleViews.push({ body, shadow, t0: this.animClock - (e.total - e.ttl) / TICK_RATE, tx: Math.floor(e.x), ty: Math.floor(e.y) });
  }
  private updateRubble(state: GameState, local: number): void {
    if (this.rubbleViews.length === 0) return;
    const map = state.map, vis = state.players[local]?.visibility;
    let w = 0;
    for (const r of this.rubbleViews) {
      const a = rubbleAlpha(this.animClock - r.t0);
      const i = r.ty * map.w + r.tx;
      // acabou, ou um edifício novo ocupou o lugar
      if (a <= 0 || (i >= 0 && i < map.buildingAt.length && map.buildingAt[i] !== -1)) { r.body.destroy(); r.shadow?.destroy(); continue; }
      const seen = this.revealAll || state.config.revealMap || !vis || (vis[i] ?? 0) >= 1;
      r.body.alpha = a; r.body.visible = seen;
      if (r.shadow) { r.shadow.alpha = SHADOW_ALPHA * a; r.shadow.visible = seen; }
      this.rubbleViews[w++] = r;
    }
    this.rubbleViews.length = w;
  }

  /**
   * Ícone assado de um edifício para o HUD (data URL 64×64 — 128 no atlas 2× —: cor + máscara de time na cor `color`),
   * ou null — o HUD usa o emoji. Composto uma vez por tipo e cor e guardado até a arte mudar de geração.
   */
  iconUrl(type: string, color: number): string | null {
    if (!this.art || !this.quality.bakedArt) return null;
    if (this.art.generation !== this.iconGen) { this.iconCache.clear(); this.iconGen = this.art.generation; }
    const key = `${type}:${color}`;
    const hit = this.iconCache.get(key);
    if (hit !== undefined) return hit;
    const f = this.art.icon(type);
    if (!f) return null;
    let url: string | null = null;
    try {
      // composição em canvas 2D direto da imagem do atlas (cor por cima; máscara tingida por multiplicação e recortada
      // pelo próprio alfa): síncrona, sem render na GPU
      const res = f.color.source.resolution || 1, W = Math.round(f.color.orig.width * res), H = Math.round(f.color.orig.height * res);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d')!;
      const blit = (ctx: CanvasRenderingContext2D, t: Texture): void => {
        const fr = t.frame, tr = t.trim;
        ctx.drawImage(t.source.resource as CanvasImageSource, fr.x * res, fr.y * res, fr.width * res, fr.height * res, (tr?.x ?? 0) * res, (tr?.y ?? 0) * res, fr.width * res, fr.height * res);
      };
      blit(g, f.color);
      if (f.team) {
        const tc = document.createElement('canvas'); tc.width = W; tc.height = H;
        const tg = tc.getContext('2d')!;
        blit(tg, f.team);
        tg.globalCompositeOperation = 'multiply'; tg.fillStyle = '#' + color.toString(16).padStart(6, '0'); tg.fillRect(0, 0, W, H);
        tg.globalCompositeOperation = 'destination-in'; blit(tg, f.team);
        g.drawImage(tc, 0, 0);
      }
      url = cv.toDataURL('image/png');
    } catch { url = null; }
    this.iconCache.set(key, url);
    return url;
  }

  // ---------------- Efeitos ----------------
  /** Efeitos vistos no quadro (reutilizado). */
  private fxSeen = new Set<VisualEffect>();
  /**
   * Morte/petrificação de uma unidade assada: a animação 'die' (direção herdada da vista que sumiu neste quadro) ou a
   * estátua (quadro parado em cinza), na faixa do y do pé. A queda corre no relógio de jogo a partir do tick da morte (em
   * 2×/3× ela acelera junto com o efeito e chega ao último quadro) e só apaga depois dele. false = procedural.
   */
  private updateDying(state: GameState, e: VisualEffect): boolean {
    const p = 1 - e.ttl / e.total;
    let uv = this.dying.get(e);
    if (!uv) {
      if (this.fxViews.has(e)) return false;   // já desenhado pelo procedural (a arte chegou depois)
      const type = typeof e.data === 'string' ? e.data : '';
      const art = type && UNITS[type] && !UNITS[type].flying ? this.art.unit(type) : null;
      if (!art) return false;
      // petrificada: a estátua (efeito 'petrify' no mesmo ponto) substitui a queda
      if (e.type === 'death' && state.effects.some((o) => o.type === 'petrify' && o.data === type && Math.abs(o.x - e.x) < 0.01 && Math.abs(o.y - e.y) < 0.01)) {
        const c = new Container(); this.fxViews.set(e, c); this.layers.fx.addChild(c); return true;
      }
      let dir = 2;
      for (const d of this.recentDeaths) if (d.type === type && Math.abs(d.x - e.x * TILE) < TILE && Math.abs(d.y - e.y * TILE) < TILE) { dir = d.dir; break; }
      const color = PLAYER_COLORS[(e.owner ?? 0) % PLAYER_COLORS.length].num;
      uv = new UnitView(art, this.art, type, color, this.layers.shadows, dir);
      if (e.type === 'death') uv.pose('die', dir, this.animClock - (e.total - e.ttl) / TICK_RATE, true);
      else { uv.pose('idle', dir, this.animClock); uv.tick(0, 0); uv.tint(0x9ca3af, 0x9ca3af); }
      uv.place(e.x * TILE, e.y * TILE);
      uv.root.zIndex = e.y - 0.01;
      this.parentFor('unit', e.y, false).addChild(uv.root);
      this.dying.set(e, uv);
    }
    if (e.type === 'death') {
      uv.tick(this.animClock, 0);
      const die = uv.art.anims.die;
      uv.alpha = deathAlpha(p, die ? animDuration(die.frames, die.fps) * TICK_RATE : 0, e.total);
    } else uv.alpha = 1 - p;
    return true;
  }

  private updateEffects(state: GameState, ui: RenderUI): void {
    const seen = this.fxSeen; seen.clear();
    for (const e of state.effects) {
      seen.add(e);
      if ((e.type === 'death' || e.type === 'petrify') && this.bakedMode && this.updateDying(state, e)) continue;
      let c = this.fxViews.get(e);
      const p = 1 - e.ttl / e.total;
      if (!c) {
        c = new Container();
        this.fxViews.set(e, c);
        this.layers.fx.addChild(c);
        if (e.type === 'projectile') { const s = new Sprite(this.tex.arrow(String(e.data))); s.anchor.set(0.5); c.addChild(s); }
        else if (e.type === 'death' || e.type === 'petrify') {
          if (typeof e.data === 'string' && UNITS[e.data]) { const s = new Sprite(this.tex.unit(e.data, PLAYER_COLORS[(e.owner ?? 0) % PLAYER_COLORS.length].num)); s.anchor.set(0.5); s.rotation = 1.2; if (e.type === 'petrify') s.tint = 0x9ca3af; c.addChild(s); }
        } else if (e.type === 'collapse') {
          // assada: o quadro damage2 (na variante que o edifício mostrava) afundando e apagando, poeira e escombros
          let f = null;
          if (this.bakedMode && typeof e.data === 'string') {
            const gone = this.recentGone.find((g) => g.type === e.data && Math.abs(g.x - e.x * TILE) < 1 && Math.abs(g.y - e.y * TILE) < 1);
            const art = this.art.buildingArt(e.data);
            const variant = gone?.variant ?? (art?.variants ? art.variants[0] : null);
            f = this.art.building(e.data, 'damage2', variant) ?? this.art.building(e.data, 'complete', variant);
            if (!this.rubbleSeen.has(e)) {
              this.rubbleSeen.add(e); this.addRubble(e, e.data);
              const d = BUILDINGS[e.data];
              if (d) this.smoke.emit(4 + d.w * d.h * 2, (e.x - d.w / 2) * TILE, (e.x + d.w / 2) * TILE, (e.y - d.h / 2) * TILE, (e.y + d.h / 3) * TILE, false);
            }
          }
          if (f) {
            // o quadro que cai vai para a faixa do edifício, na ordem por y dele (o que estava na frente continua na
            // frente); poeira e fumaça seguem na camada de efeitos
            const s = new Sprite(f.color); s.anchor.set(f.anchor.x, f.anchor.y); s.tint = 0x8a847c; c.addChild(s); this.bakedCollapses.add(c);
            const d = BUILDINGS[e.data as string];
            const zy = d?.passable ? e.y - d.h / 2 - 0.01 : e.y;
            c.zIndex = zy;
            this.parentFor('building', zy, false).addChild(c);
          }
          else if (typeof e.data === 'string' && BUILDINGS[e.data]) { const s = new Sprite(this.tex.building(e.data, 0x888888, true)); s.anchor.set(0.5); s.tint = 0x777777; c.addChild(s); }
        } else if (e.type === 'quake') this.cam.shake = 10;
        c.position.set(e.x * TILE, e.y * TILE);
      }
      if (e.type === 'projectile' && e.tx !== undefined && e.ty !== undefined) {
        const x = e.x + (e.tx - e.x) * p, y = e.y + (e.ty - e.y) * p;
        c.position.set(x * TILE, y * TILE - Math.sin(p * Math.PI) * 10);
        c.rotation = Math.atan2(e.ty - e.y, e.tx - e.x);
      } else if (e.type === 'death' || e.type === 'collapse' || e.type === 'petrify') {
        c.alpha = 1 - p;
        if (e.type === 'collapse') {
          // assado: afunda (o monte de escombros fica por baixo); procedural: encolhe como antes
          if (this.bakedCollapses.has(c)) { c.scale.set(1, 1 - p * 0.55); c.position.y = e.y * TILE + p * 6; }
          else c.scale.set(1 - p * 0.2);
        }
      } else {
        const g = (c.children[0] as Graphics | undefined) instanceof Graphics ? (c.children[0] as Graphics) : (() => { const ng = new Graphics(); c.addChild(ng); return ng; })();
        g.clear();
        switch (e.type) {
          case 'hit': g.circle(0, 0, 4 + p * 6).fill({ color: 0xffffff, alpha: 0.8 * (1 - p) }); break;
          case 'splash': g.circle(0, 0, (Number(e.data) || 1.5) * TILE * p).stroke({ width: 3, color: 0xf97316, alpha: 1 - p }); break;
          case 'heal': g.circle(0, 0, (Number(e.data) || 8) * TILE * (0.3 + p * 0.7)).stroke({ width: 3, color: 0x4ade80, alpha: 1 - p }); break;
          case 'spawn': g.circle(0, 0, 6 + p * 14).stroke({ width: 2, color: 0xffffff, alpha: 1 - p }); break;
          case 'ability': g.circle(0, 0, 8 + p * Number(e.data ?? 1) * TILE).stroke({ width: 3, color: 0xfde047, alpha: 1 - p }); break;
          case 'curse': g.circle(0, 0, 6 + p * 10).fill({ color: 0xec4899, alpha: 0.6 * (1 - p) }); break;
          case 'pestilence': g.circle(0, 0, (Number(e.data) || 10) * TILE).fill({ color: 0x7e22ce, alpha: 0.18 * (1 - p) }); break;
          case 'quake': g.circle(0, 0, (Number(e.data) || 7) * TILE).stroke({ width: 4, color: 0x92400e, alpha: 0.6 * (1 - p) }); this.cam.shake = Math.max(this.cam.shake, 4 * (1 - p)); break;
          case 'titanRise': g.circle(0, 0, 20 + p * 120).stroke({ width: 6, color: 0xef4444, alpha: 1 - p }); this.cam.shake = 8; break;
          case 'bolt': {
            const top = -14 * TILE;
            g.moveTo(0, top);
            let y = top, x = 0;
            while (y < 0) { y += 24; x += (Math.sin(y * 7.3 + e.x) * 12); g.lineTo(x * (1 - (y / top) * 0), y); }
            g.lineTo(0, 0).stroke({ width: 3, color: 0xffffff, alpha: 1 - p * 0.7 }).moveTo(0, top).lineTo(0, 0).stroke({ width: 8, color: 0x60a5fa, alpha: 0.4 * (1 - p) });
            g.circle(0, 0, 10 + p * 20).fill({ color: 0xbfdbfe, alpha: 0.6 * (1 - p) });
            break;
          }
          default: break;
        }
      }
    }
    for (const [e, c] of this.fxViews) if (!seen.has(e)) { c.destroy({ children: true }); this.fxViews.delete(e); }
    for (const [e, uv] of this.dying) if (!seen.has(e)) { uv.destroy(); this.dying.delete(e); }
    this.recentDeaths.length = 0;
    this.recentGone.length = 0;
    void ui;
  }

  // ---------------- Editor de mapas ----------------
  /**
   * Sobreposições do editor, só quando ui.editor existe: regiões/passabilidade (texturas w×h, regeneradas quando a
   * versão das edições muda), grade da área visível, inícios numerados com anel de raio 8, fantasma do kit inicial,
   * contorno do pincel, linha de pré-visualização, fantasmas de edifício/unidade, seleção e tile piscando.
   * Fora das regenerações são algumas dezenas de primitivas (mais as linhas da grade visível) por quadro.
   */
  private updateEditor(state: GameState, ui: RenderUI): void {
    const ed = ui.editor;
    const layer = this.layers.editor;
    if (!ed) { if (layer.visible) { layer.visible = false; this.edGfx.clear(); } return; }
    layer.visible = true;
    const map = state.map, w = map.w, h = map.h;
    const now = performance.now();
    const zoom = this.cam.zoom, lw = 1 / zoom;                       // lw = 1 px de tela em unidades de mundo
    const mk = Math.min(6, Math.max(1, lw));                          // marcadores com tamanho quase constante na tela
    // Texturas: a chave muda com invalidateRect/setState, com o nº de edifícios (bloqueio) e de nós
    const key = `${this.editVersion}:${state.buildings.size}:${map.nodes.size}:${w}x${h}`;
    this.regSprite.visible = ed.showRegions;
    if (ed.showRegions && this.regKey !== key) {
      this.regKey = key;
      const ctx = this.regCanvas.getContext('2d')!;
      const img = ctx.createImageData(w, h); const d = img.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const l = componentAt(map, x, y);
        if (l < 0) continue;
        const c = regionColor(l), i = (y * w + x) * 4;
        d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 105;
      }
      ctx.putImageData(img, 0, 0); this.regTex.source.update();
    }
    this.passSprite.visible = ed.showPassable;
    if (ed.showPassable && this.passKey !== key) {
      this.passKey = key;
      const ctx = this.passCanvas.getContext('2d')!;
      const img = ctx.createImageData(w, h); const d = img.data;
      for (let i = 0; i < w * h; i++) {
        if (map.blocked[i] === 0 || map.gateTeam[i] >= 0) continue;
        d[i * 4] = 239; d[i * 4 + 1] = 68; d[i * 4 + 2] = 68; d[i * 4 + 3] = 120;
      }
      ctx.putImageData(img, 0, 0); this.passTex.source.update();
    }
    const g = this.edGfx; g.clear();
    // Grade: só a área visível da câmera
    if (ed.showGrid) {
      const v = this.cam.visibleTiles();
      const x0 = Math.max(0, v.x0), y0 = Math.max(0, v.y0), x1 = Math.min(w, v.x1), y1 = Math.min(h, v.y1);
      for (let x = x0; x <= x1; x++) g.moveTo(x * TILE, y0 * TILE).lineTo(x * TILE, y1 * TILE);
      for (let y = y0; y <= y1; y++) g.moveTo(x0 * TILE, y * TILE).lineTo(x1 * TILE, y * TILE);
      g.stroke({ width: lw, color: 0xffffff, alpha: 0.2 });
    }
    // Inícios: anel de raio 8, disco numerado, destaque do selecionado e fantasma do kit inicial
    const starts = map.starts;
    for (let i = 0; i < starts.length; i++) {
      const s = starts[i];
      const cx = (s.x + 0.5) * TILE, cy = (s.y + 0.5) * TILE;
      const color = PLAYER_COLORS[i % PLAYER_COLORS.length].num;
      const sel = ed.selected?.kind === 'start' && ed.selected.id === i;
      g.circle(cx, cy, START_RING_RADIUS * TILE).fill({ color, alpha: sel ? 0.08 : 0.04 }).stroke({ width: (sel ? 3 : 1.5) * lw, color, alpha: sel ? 0.95 : 0.7 });
      if (sel) g.circle(cx, cy, START_RING_RADIUS * TILE + 3 * lw).stroke({ width: 1.5 * lw, color: 0xffffff, alpha: 0.85 });
      if (ed.showKit) {
        // anel de recursos (raio 16: a tabela de recursos por início do painel) e o fantasma do kit inicial:
        // CC 3×3 em (x-1, y-1) e os 6 pontos onde createGame põe cidadãos (amarelo) e batedor (azul-claro)
        g.circle(cx, cy, 16 * TILE).stroke({ width: lw, color, alpha: 0.35 });
        g.rect((s.x - 1) * TILE, (s.y - 1) * TILE, 3 * TILE, 3 * TILE).fill({ color, alpha: 0.2 }).stroke({ width: 1.5 * lw, color, alpha: 0.8 });
        KIT_SPOTS.forEach(([dx, dy], k) => {
          const px = Math.floor(s.x + 0.5 + dx) + 0.5, py = Math.floor(s.y + 0.5 + dy) + 0.5;
          g.circle(px * TILE, py * TILE, 5 * Math.min(1.6, mk)).fill({ color: k < 5 ? 0xfde68a : 0x93c5fd, alpha: 0.85 }).stroke({ width: lw, color: 0x000000, alpha: 0.5 });
        });
      }
      g.circle(cx, cy, 11 * mk).fill({ color, alpha: 0.92 }).stroke({ width: 2 * lw, color: 0xffffff, alpha: sel ? 1 : 0.75 });
      let l = this.edLabels[i];
      if (!l) {
        l = new Text({ text: String(i + 1), style: new TextStyle({ fontSize: 14, fontWeight: 'bold', fill: 0xffffff, stroke: { color: 0x000000, width: 3 } }) });
        l.anchor.set(0.5); layer.addChild(l); this.edLabels[i] = l;
      }
      l.visible = true; l.position.set(cx, cy); l.scale.set(mk);
    }
    for (let i = starts.length; i < this.edLabels.length; i++) this.edLabels[i].visible = false;
    // Colina do Rei da Colina: a do arquivo (dourada) ou o centro do mapa (apagada)
    const kh = ed.koth ?? { x: Math.floor(w / 2), y: Math.floor(h / 2) };
    const kx = (kh.x + 0.5) * TILE, ky = (kh.y + 0.5) * TILE, ka = ed.koth ? 0.95 : 0.4;
    g.circle(kx, ky, 2.5 * TILE).stroke({ width: 1.5 * lw, color: 0xfde68a, alpha: ka });
    g.poly([kx, ky - 8 * mk, kx + 7 * mk, ky + 5 * mk, kx - 7 * mk, ky + 5 * mk]).fill({ color: 0xfde68a, alpha: ka * 0.8 }).stroke({ width: lw, color: 0x000000, alpha: ka * 0.6 });
    // Relíquias fixas do arquivo (G10): como na partida (disco roxo com miolo dourado); fora do mapa, sobre tile bloqueado ou no CC do kit, anel vermelho
    for (const r of ed.relics ?? []) {
      const rx = (r.x + 0.5) * TILE, ry = (r.y + 0.5) * TILE, bad = r.bad;
      g.circle(rx, ry, 7 * mk).fill({ color: 0x7c3aed, alpha: 0.9 }).stroke({ width: 2 * lw, color: bad ? 0xef4444 : 0xfde047 });
      g.circle(rx, ry, 3 * mk).fill({ color: 0xfde047 });
      if (bad) g.circle(rx, ry, 10 * mk).stroke({ width: 2 * lw, color: 0xef4444, alpha: 0.9 });
    }
    // Cursor: pincel, linha, fantasmas
    const hv = ed.hover;
    if (hv) {
      const tool = ed.tool;
      const cx = (hv.x + 0.5) * TILE, cy = (hv.y + 0.5) * TILE;
      if (tool === 'terrain' || tool === 'node') {
        const r = ed.brushRadius, color = tool === 'terrain' ? terrainColor(ed.terrain) : 0xa3e635;
        if (ed.brushShape === 'circle') g.circle(cx, cy, (r + 0.5) * TILE).fill({ color, alpha: 0.18 }).stroke({ width: 2 * lw, color, alpha: 0.95 });
        else g.rect((hv.x - r) * TILE, (hv.y - r) * TILE, (2 * r + 1) * TILE, (2 * r + 1) * TILE).fill({ color, alpha: 0.18 }).stroke({ width: 2 * lw, color, alpha: 0.95 });
        g.rect(hv.x * TILE, hv.y * TILE, TILE, TILE).stroke({ width: lw, color: 0xffffff, alpha: 0.7 });
        if (ed.lineFrom) {
          const fx = (ed.lineFrom.x + 0.5) * TILE, fy = (ed.lineFrom.y + 0.5) * TILE;
          g.moveTo(fx, fy).lineTo(cx, cy).stroke({ width: (2 * r + 1) * TILE, color, alpha: 0.12 });
          g.moveTo(fx, fy).lineTo(cx, cy).stroke({ width: 2 * lw, color: 0xffffff, alpha: 0.85 });
          g.circle(fx, fy, 4 * mk).fill({ color: 0xffffff, alpha: 0.9 });
        }
      } else if (tool === 'building') {
        const def = BUILDINGS[ed.buildingType];
        if (def) {
          const { tx, ty } = buildingCorner(ed.buildingType, hv.x, hv.y);
          const c = ed.ghostOk ? 0x4ade80 : 0xef4444;
          g.rect(tx * TILE, ty * TILE, def.w * TILE, def.h * TILE).fill({ color: c, alpha: 0.35 }).stroke({ width: 1.5 * lw, color: c, alpha: 0.9 });
        }
      } else if (tool === 'unit') {
        const def = UNITS[ed.unitType];
        const c = ed.ghostOk ? 0x4ade80 : 0xef4444, rr = Math.max(0.35, def?.radius ?? 0.4) * TILE * 1.4;
        g.circle(cx, cy, rr).fill({ color: c, alpha: 0.35 }).stroke({ width: 1.5 * lw, color: c, alpha: 0.9 });
        g.rect(hv.x * TILE, hv.y * TILE, TILE, TILE).stroke({ width: lw, color: c, alpha: 0.6 });
      } else if (tool === 'start') {
        const idx = ed.selected?.kind === 'start' ? ed.selected.id : starts.length;
        const c = PLAYER_COLORS[idx % PLAYER_COLORS.length].num;
        g.circle(cx, cy, START_RING_RADIUS * TILE).stroke({ width: 1.5 * lw, color: c, alpha: 0.5 });
        g.rect((hv.x - 1) * TILE, (hv.y - 1) * TILE, 3 * TILE, 3 * TILE).fill({ color: c, alpha: 0.25 }).stroke({ width: 1.5 * lw, color: c, alpha: 0.8 });
      } else {
        // selecionar / borracha: só o tile sob o cursor
        g.rect(hv.x * TILE, hv.y * TILE, TILE, TILE).stroke({ width: 1.5 * lw, color: tool === 'erase' ? 0xef4444 : 0xffffff, alpha: 0.8 });
      }
    }
    // Entidade / nó selecionado no inspetor (inícios já foram destacados acima)
    const sel = ed.selected;
    if (sel && sel.kind !== 'start') {
      const c = 0xfde68a;
      if (sel.kind === 'unit') { const u = state.units.get(sel.id); if (u) { const r = UNITS[u.type].radius * TILE * 1.6; g.ellipse(u.x * TILE, u.y * TILE + r * 0.3, r, r * 0.6).stroke({ width: 2 * lw, color: c, alpha: 0.95 }); } }
      else if (sel.kind === 'building') { const b = state.buildings.get(sel.id); if (b) g.rect(b.tx * TILE - 2 * lw, b.ty * TILE - 2 * lw, b.w * TILE + 4 * lw, b.h * TILE + 4 * lw).stroke({ width: 2 * lw, color: c, alpha: 0.95 }); }
      else { const n = map.nodes.get(sel.id); if (n) g.rect(n.x * TILE, n.y * TILE, TILE, TILE).stroke({ width: 2 * lw, color: c, alpha: 0.95 }); }
    }
    // "Ir até": tile piscando até flash.until
    const f = ed.flash;
    if (f && now < f.until && Math.floor(now / 160) % 2 === 0) {
      g.rect(f.x * TILE, f.y * TILE, TILE, TILE).fill({ color: 0xffffff, alpha: 0.55 }).stroke({ width: 2 * lw, color: 0xfde047, alpha: 1 });
      g.circle((f.x + 0.5) * TILE, (f.y + 0.5) * TILE, 1.6 * TILE).stroke({ width: 2 * lw, color: 0xfde047, alpha: 0.8 });
    }
  }

  // ---------------- Quadro ----------------
  render(state: GameState, alpha: number, ui: RenderUI, dtReal: number): void {
    this.time += dtReal;
    if (this.art.generation !== this.artGen) this.rebuildArt();
    this.cam.resize(this.app.screen.width, this.app.screen.height);
    const sx = this.cam.shake > 0 ? (Math.random() - 0.5) * this.cam.shake : 0, sy = this.cam.shake > 0 ? (Math.random() - 0.5) * this.cam.shake : 0;
    if (this.cam.shake > 0) this.cam.shake = Math.max(0, this.cam.shake - dtReal * 12);
    this.world.scale.set(this.cam.zoom);
    this.world.position.set(-this.cam.x * this.cam.zoom + sx, -this.cam.y * this.cam.zoom + sy);
    // relógio de jogo das animações assadas (não volta: retomar a pausa com alpha < 1 não recua o quadro)
    const clock = (state.tick + alpha) / TICK_RATE;
    const prevClock = this.animClock;
    if (clock > this.animClock || clock < this.animClock - 1) this.animClock = clock;
    this.animDt = Math.max(0, Math.min(0.25, this.animClock - prevClock));
    if (this.bakedMode) this.updateEdgeFrame(state.map.w, state.map.h);
    this.updateTerrain(state, ui.localPlayer);
    this.updateEntities(state, alpha, ui);
    this.updateGround(state, alpha, ui);
    this.updateEffects(state, ui);
    this.updateRubble(state, ui.localPlayer);
    this.smoke.update(this.animDt);
    this.updateEditor(state, ui);
    this.updateFog(state, ui.localPlayer);
    const o = this.overlay; o.clear();
    if (ui.dragRect) { const r = ui.dragRect; o.rect(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0)).fill({ color: 0x8ff58f, alpha: 0.12 }).rect(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0)).stroke({ width: 1, color: 0x8ff58f, alpha: 0.9 }); }
  }

  /**
   * Entidade sob o ponto (em tiles). Sem a arte assada: a unidade mais próxima cujo círculo contém o ponto, senão o
   * edifício do tile. Com a arte assada (docs/ART.md §1.8), em estágios:
   *  1. voadoras pelo círculo (a camada delas fica acima das faixas);
   *  2. unidades procedurais pelo círculo (pequenas: a caixa larga de um sprite assado vizinho não pode escondê-las —
   *     clicar no inimigo encostado no seu hoplita tem de atacar, não mover);
   *  3. caixas: quadro das unidades assadas (clicar no elmo/escudo pega a unidade mesmo com o chão sob o cursor sendo de
   *     outro tile), quadro dos edifícios assados (telhado/fachada acima do footprint) e o footprint de qualquer edifício;
   *     entre as que contêm o ponto ganha a desenhada na frente (maior y de desenho: pé da unidade, buildingDrawY do
   *     edifício) — o telhado do templo cobre o cidadão atrás dele, e o hoplita na frente do templo continua ganhando;
   *  4. o círculo de qualquer unidade (abaixo do pé, fora da caixa).
   * A névoa decide pela posição do pé.
   */
  pick(state: GameState, x: number, y: number, local: number): Unit | Building | null {
    const baked = this.bakedMode;
    let best: Unit | null = null, bestD = Infinity, fly: Unit | null = null, flyD = Infinity, small: Unit | null = null, smallD = Infinity;
    for (const u of state.units.values()) {
      if (u.inside !== -1 || !this.visibleToLocal(state, local, u)) continue;
      const r = Math.max(0.45, UNITS[u.type].radius * 1.5);
      const dx = u.x - x, dy = u.y - y; const d = dx * dx + dy * dy;
      if (d > r * r) continue;
      if (d < bestD) { bestD = d; best = u; }
      if (!baked) continue;
      if (UNITS[u.type].flying) { if (d < flyD) { flyD = d; fly = u; } }
      else if (!this.views.get(u.id)?.unit && d < smallD) { smallD = d; small = u; }
    }
    const tx = Math.floor(x), ty = Math.floor(y);
    const bid = tx >= 0 && ty >= 0 && tx < state.map.w && ty < state.map.h ? state.map.buildingAt[ty * state.map.w + tx] : -1;
    const tileB = bid !== -1 ? state.buildings.get(bid) : undefined;
    const onTile = tileB && this.visibleToLocal(state, local, tileB) ? tileB : null;
    if (!baked) return best ?? onTile;
    if (fly) return fly;
    if (small) return small;
    const wx = x * TILE, wy = y * TILE;
    let front: Unit | Building | null = null, frontY = -Infinity;
    for (const [id, v] of this.views) {
      if (v.unit) {
        if (!v.unit.visible || !v.unit.contains(wx, wy)) continue;
        const u = state.units.get(id);
        if (u && u.inside === -1 && u.y > frontY && this.visibleToLocal(state, local, u)) { front = u; frontY = u.y; }
      } else if (v.bld) {
        if (!v.bld.visible || !v.bld.contains(wx, wy)) continue;
        const b = state.buildings.get(id);
        const by = b ? this.buildingDrawY(b) : 0;
        if (b && by > frontY && this.visibleToLocal(state, local, b)) { front = b; frontY = by; }
      }
    }
    if (onTile && this.buildingDrawY(onTile) > frontY) front = onTile;
    return front ?? best;
  }

  /** Data URL de uma miniatura (retrato) para a interface. */
  portrait(kind: 'unit' | 'building', type: string, color: number): Promise<string> {
    const t = kind === 'unit' ? this.tex.unit(type, color) : this.tex.building(type, color, true);
    const s = new Sprite(t);
    const url = this.app.renderer.extract.base64({ target: s, format: 'png' });
    s.destroy();
    return url;
  }

  makeLabel(text: string): Text { return new Text({ text, style: new TextStyle({ fontSize: 12, fill: 0xffffff }) }); }
}

export { darken };
