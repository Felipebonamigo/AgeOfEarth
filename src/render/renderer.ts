// Renderizador PixiJS: terreno por shader (com fronteiras), nós como sprites, entidades interpoladas, efeitos (fx/: um
// handler por tipo de efeito, partículas, decalques), névoa e overlays.
import { Application, Container, Graphics, Sprite, Texture, Text, TextStyle } from 'pixi.js';
import { effectiveResolution, resolveQuality, type Quality } from './quality';
import { TILE, TICK_RATE, DT, PLAYER_COLORS, KOTH_RADIUS, rankOf } from '../core/constants';
import { ABILITIES, BUILDINGS, MAJOR_GODS, UNITS } from '../core/data';
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
import { buildWear } from './terrain/materials';
import { PropLayer } from './props';
import { ArtLibrary } from './art/ArtLibrary';
import { UnitView } from './views/UnitView';
import { BuildingView } from './views/BuildingView';
import { FxSystem, type FxAcc } from './fx/FxSystem';
import { deathView } from './fx/handlers/death';
import { DayCycle } from './fx/light';
import { CloudShadows } from './fx/clouds';
import { vignetteTexture } from './fx/screen';
import { bronzeTint } from './fx/handlers/bronze';
import {
  abilityUseTick, animDuration, buildingState, chooseAnim, riseElapsed, corpseAlpha, CORPSE_TTL, MAX_CORPSES, dirWithHysteresis, freshHit, isWalking, isRunning, isMoveAnim, warmUnitTypes, unitLook, mulColor, type UnitAnim, type AnimInput,
  WALL_LINK_TYPES, wallMask, buildingVariant, ageTier, farmCrop, pickVariant, damageLevel, gateNear, smokeRate, rubbleAlpha, GLOW_ANIM, glowVariant,
  ghostTint, placementMasks, wallFlagAt, WALL_FLAG_PROBE,
} from './art/logic';

/** Cor de fundo (fora do mapa). */
const BG = 0x0b1020;
/** Folga (tiles) sobre as distâncias de trabalho/ataque da simulação para considerar a unidade "no posto". */
const POST_SLACK = 0.15;
/** Zoom mínimo padrão da partida; em mapas grandes/telas pequenas cai até enquadrar o mapa inteiro (ver updateMinZoom). */
const DEFAULT_MIN_ZOOM = 0.35;
/** Tick do último uso da habilidade do herói (-1: nunca, ou tipo sem habilidade), lido da recarga do núcleo. */
function abilityTick(u: Unit): number {
  const id = UNITS[u.type]?.ability;
  return id ? abilityUseTick(u.abilityReadyAt, ABILITIES[id].cooldown * TICK_RATE) : -1;
}
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
interface EntityView { root: Container; body: Sprite; shadow: Sprite | null; type: string; color: number; complete: boolean; angle: number; carry: Sprite | null; label?: Text; rank?: Graphics; rankShown?: number; unit: UnitView | null; bld: BuildingView | null;
  /** Asset de arte da unidade assada (Etapa 6: a hidra troca de asset quando ganha uma cabeça). */
  artId?: string;
  /** Acumulador da poeira dos pés (unidade) / das chamas (edifício muito danificado) — fx/FxSystem. */
  fxAcc: FxAcc;
  /** Edifício: mostrava o estado vivo ao jogador local no último quadro (dele ou à vista; não a última versão vista sob a
   *  névoa) — o desabamento dele se vê (FxHost.goneSeen). */
  live?: boolean }

/** Morte recente de uma unidade assada (o efeito 'death' do mesmo quadro herda a direção da vista que sumiu). */
interface RecentDeath { type: string; x: number; y: number; dir: number; artId: string }
/** Edifício que sumiu neste quadro (o colapso do mesmo quadro usa a variante que ele mostrava e sabe se ele estava à vista). */
interface RecentGone { type: string; x: number; y: number; variant: string | null; live: boolean }
/** Escombros assados de um edifício que caiu (ficam RUBBLE_SECONDS de jogo no chão, apagando no fim). `revealed`: a queda
 *  foi vista ou o tile foi visto depois dela (antes disso ficam escondidos, como os decalques). */
interface RubbleView { body: Sprite; shadow: Sprite | null; t0: number; tx: number; ty: number; revealed: boolean }

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
  /** Ordem (docs/ART.md §3.7): terrain (shader: chão, água e fronteiras) → decals (queimaduras, rachaduras, escombros)
   *  → shadows → props (nós) → ground → buildings → units → fx → hp → editor → fog. Com a arte assada: terrain → decals →
   *  shadows → ground → props (faixas com nós, edifícios e unidades ordenados juntos pelo y do pé) → buildings (vazia) →
   *  units (só voadoras) → fx → hp → editor → fog. */
  layers = { terrain: new Container(), decals: new Container(), shadows: new Container(), props: new Container(), ground: new Graphics(), buildings: new Container(), units: new Container(), fx: new Container(), clouds: new Container(), hp: new Graphics(), ghost: new Container(), editor: new Container(), fog: new Container() };
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
  /** `unitGen` da ArtLibrary já refletido (chegaram as páginas de um tipo de unidade → troca só as vistas dele). */
  private unitGenSeen = -1;
  /** Etapa 6: relógio de jogo (s) da última checagem das páginas próprias de criaturas fora de uso (`releaseUnusedArt`). */
  private releaseAt = 0;
  /** Idade do jogador local cujos tipos de unidade já foram pré-carregados (-1 = pedir no próximo quadro). */
  private warmAge = -1;
  /** Contador de quadros da conferência dos portais dos titãs (warmTitans). */
  private titanWarmFrame = -1;
  /** Titãs que algum Portal dos Titãs mantém quentes (warmTitans): ficam fora da liberação por tipo (releaseUnusedArt). */
  private titansWanted = new Set<string>();
  /** Cadáveres assados (docs/ART.md §1.9): a vista da queda continua no chão depois do efeito 'death', no último quadro
   *  de `die`, até CORPSE_TTL s da morte (relógio de jogo); no máximo MAX_CORPSES (sai o mais velho). */
  private corpses: { uv: UnitView; born: number }[] = [];
  private recentDeaths: RecentDeath[] = [];
  private recentGone: RecentGone[] = [];
  /** Efeitos (Etapa 5, fx/): um handler por tipo de VisualEffect, partículas com orçamento e prioridade (a fumaça dos
   *  edifícios da Etapa 3 inclusive), decalques no chão e projéteis. */
  readonly fx = new FxSystem(() => this.art ?? null);
  /** Ciclo de luz opcional (cor da luz por ColorMatrixFilter na camada do mundo; desligado por padrão). */
  private dayCycle = new DayCycle();
  /** Sombras de nuvens (Etapa 9): presets Médio e Alto, fora do editor. */
  private clouds = new CloudShadows();
  /** Vinheta escura suave nos cantos (preset Alto, `quality.post`): a lente de uma foto. */
  private vignette: Sprite | null = null;
  /** Escombros no chão (um monte por queda). */
  private rubbleViews: RubbleView[] = [];
  /** Topologia das muralhas (muralha/portão/torre): assinatura dos ids e versão; as vistas recalculam o bitmask só
   *  quando a versão muda (uma muralha nova, derrubada ou trocada de dono). */
  private wallSig = 0; private wallCount = -1; wallVersion = 0;
  /** Portões prontos no último quadro e os abertos neste (aliado a GATE_OPEN_RANGE). */
  private gateCount = 0;
  private gatesOpen = new Set<number>();
  /** Fantasma de construção assado (quadro complete translúcido tingido de verde/vermelho). */
  private ghostSprites: Sprite[] = [];
  /** Passo do relógio de jogo neste quadro (s): partículas, fumaça, barras. */
  private animDt = 0;
  /** Ícones do HUD compostos (cor + máscara tingida) por tipo e cor, válidos até a próxima geração da arte. */
  private iconCache = new Map<string, string | null>();
  private iconGen = -1;
  private tmpVec = { x: 0, y: 0 };
  /** Ponto do alvo de quem está no posto (engagedTarget). */
  private tgtPt = { x: 0, y: 0 };
  private animIn: AnimInput = { moving: false, attacking: false, carrying: false, working: false, engaged: false, running: false, ability: false, rising: false };
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
  /** Assinatura do conjunto de edifícios do último chão batido ('' = refazer) e contador de quadros da checagem. */
  private wearKey = ''; private wearTick = 0;
  private state: GameState | null = null;
  time = 0;

  async init(parent: HTMLElement): Promise<void> {
    this.app = new Application();
    // Sem antialias (docs/ART.md §3.9): sprites e terreno já são amostrados por textura; resolução = min(teto do preset, dpr) · renderScale
    await this.app.init({ resizeTo: parent, background: BG, antialias: false, preference: 'webgl', resolution: effectiveResolution(this.quality, window.devicePixelRatio || 1, this.renderScale), autoDensity: true });
    parent.appendChild(this.app.canvas);
    this.tex = new TextureCache(this.app.renderer);
    this.art = new ArtLibrary(this.tex, `${import.meta.env.BASE_URL ?? './'}art/`);
    this.art.atlas.gpuUpload = true;   // página servida só depois de subir para a GPU (uploadNextAtlas, uma por quadro)
    this.art.configure(this.quality.bakedArt, this.quality.atlasScale);
    this.props = new PropLayer(this.tex, this.art);
    // camada de TELA dos efeitos (vinhetas da Trégua e do Oráculo, clarão do raio) entre o mundo e o overlay da interface
    this.vignette = new Sprite(vignetteTexture()); this.vignette.tint = 0x0a0806; this.vignette.alpha = 0.3; this.vignette.eventMode = 'none'; this.vignette.visible = false;
    this.app.stage.addChild(this.world, this.vignette, this.fx.screen.root, this.overlay);
    this.world.addChild(this.layers.terrain, this.layers.decals, this.layers.shadows, this.layers.props, this.edgeFrame, this.layers.ground, this.layers.buildings, this.layers.units, this.layers.fx, this.layers.clouds, this.layers.hp, this.layers.ghost, this.layers.editor, this.layers.fog);
    // efeitos: partículas/sprites na camada fx, decalques na camada decals (acima do terreno, abaixo das sombras)
    this.layers.fx.addChild(this.fx.root);
    this.layers.decals.addChild(this.fx.decals.root);
    this.layers.decals.eventMode = 'none';
    const self = this;
    this.fx.setHost({
      get art() { return self.art; },
      get tex() { return self.tex; },
      get shadows() { return self.layers.shadows; },
      entityParent: (kind, y, flying) => this.parentFor(kind, y, flying),
      deathDir: (type, x, y) => { for (const d of this.recentDeaths) if (d.type === type && Math.abs(d.x - x * TILE) < TILE && Math.abs(d.y - y * TILE) < TILE) return d.dir; return 2; },
      deathArt: (type, x, y) => { for (const d of this.recentDeaths) if (d.type === type && Math.abs(d.x - x * TILE) < TILE && Math.abs(d.y - y * TILE) < TILE) return d.artId; return type; },
      goneVariant: (type, x, y) => this.recentGone.find((g) => g.type === type && Math.abs(g.x - x * TILE) < 1 && Math.abs(g.y - y * TILE) < 1)?.variant ?? null,
      goneSeen: (type, x, y) => this.recentGone.some((g) => g.live && g.type === type && Math.abs(g.x - x * TILE) < 1 && Math.abs(g.y - y * TILE) < 1),
      addRubble: (e, type, seen) => this.addRubble(e, type, seen),
      addCorpse: (uv) => { this.corpses.push({ uv, born: uv.animStart }); if (this.corpses.length > MAX_CORPSES) this.corpses.shift()!.uv.destroy(); },
    });
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

  /** Atlas carregando e já carregados (tela de carregamento, src/ui/loading.ts). */
  artLoading(): { busy: number; done: number } { return this.art.loading(); }
  setState(state: GameState): void {
    this.state = state;
    this.cam.setMap(state.map.w, state.map.h);
    this.cam.resize(this.app.screen.width, this.app.screen.height);
    for (const v of this.views.values()) this.destroyView(v);
    this.views.clear();
    this.fx.reset();   // antes de esvaziar as sombras: as quedas assadas e os projéteis põem sombra lá
    this.clearDying();
    this.layers.shadows.removeChildren();
    this.layers.shadows.addChild(this.props.shadowRoot);
    this.clearBakedExtras();
    this.wallCount = -1; this.wallVersion++;
    this.layers.fog.removeChildren();
    this.layers.terrain.removeChildren();
    this.fog?.destroy(); this.terrain?.destroy();
    const { w, h } = state.map;
    // Terreno (e fronteiras) por shader: texturas w×h escritas a partir do mapa; névoa: malha w×h própria (fog.ts)
    this.terrain = new ChunkMesh(state.map, this.quality); this.layers.terrain.addChild(this.terrain.mesh);
    this.wearKey = '';
    this.fog = new FogMesh(w, h); this.layers.fog.addChild(this.fog.mesh);
    // arte assada: pré-aquecimento dos atlas (sem esperar; enquanto carrega, tudo sai procedural)
    this.bakedMode = this.quality.bakedArt; this.artGen = this.art.generation;
    this.animClock = 0;
    this.applyLayerOrder();
    this.props.reset(state, this.bakedMode, this.art.propsReady());
    this.art.prewarm();
    this.art.collect();   // a escala que o preset deixou de pedir (trocada no menu) sai da memória já na partida nova
    this.warmAge = -1; this.unitGenSeen = this.art.unitGen;   // tipos da partida/Idade: no primeiro quadro (render)
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
    this.fx.clearRect(ax0, ay0, ax1, ay1);   // decalques do chão que mudou
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
    // orçamento TOTAL de partículas e teto de decalques do preset (a fumaça dos edifícios ocupa até 35 % dele)
    this.fx.setQuality(q);
    if (this.app?.stage) this.dayCycle.set(this.world, q.dayCycle, q.post);
    if (this.vignette) this.vignette.visible = q.post;
    if (this.app?.stage) this.clouds.set(this.layers.clouds, q.terrainShader === 'full');
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
    // Chão batido em volta dos edifícios: refeito quando o conjunto muda (assinatura barata a cada 15 quadros)
    if (this.wearKey === '' || ++this.wearTick % 15 === 0) {
      let ids = 0; for (const id of state.buildings.keys()) ids = (ids + id * 2654435761) >>> 0;
      const key = `${state.buildings.size}:${ids}`;
      if (key !== this.wearKey) { this.wearKey = key; const wear = buildWear(state.map.w, state.map.h, state.buildings.values()); t.setWear(wear); this.props.wear = wear; }
    }
    this.updateProps(state, local);
  }

  // ---------------- Nós (camada 'props', props.ts) ----------------
  private updateProps(state: GameState, local: number): void {
    this.props.update(state, local, this.revealAll, this.cam.visibleTiles(), this.cam.zoom);
  }

  // ---------------- Arte assada: modo, camadas e reconstrução ----------------
  /** Ordem das camadas do modo em vigor (ver `layers`). */
  private applyLayerOrder(): void {
    const L = this.layers;
    const F = this.edgeFrame;
    const order: Container[] = this.bakedMode
      ? [L.terrain, L.decals, L.shadows, L.ground, L.props, F, L.buildings, L.units, L.fx, L.clouds, L.hp, L.ghost, L.editor, L.fog]
      : [L.terrain, L.decals, L.shadows, L.props, F, L.ground, L.buildings, L.units, L.fx, L.clouds, L.hp, L.ghost, L.editor, L.fog];
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
    this.fx.reset();   // quedas, colapsos e partículas podem usar o atlas (refeitos no próximo quadro)
    this.clearDying();
    this.clearBakedExtras();
    this.wallVersion++;
    this.applyLayerOrder();
    if (this.state) this.props.reset(this.state, this.bakedMode, this.art.propsReady(), true);
    this.art.collect();
  }
  /**
   * Carregamento por tipo (Etapa 4): no começo da partida e a cada Idade do jogador local, pede as páginas dos tipos de
   * unidade que ele pode treinar até ali e dos que já estão no mapa (sem esperar: sobem para a GPU uma por quadro).
   */
  private warmUnits(state: GameState, local: number): void {
    this.warmTitans(state);
    const age = state.players[local]?.age ?? 0;
    if (age === this.warmAge) return;
    this.warmAge = age;
    const present = new Set<string>();
    for (const u of state.units.values()) present.add(u.type);
    this.art.prewarmUnits(warmUnitTypes(UNITS, age, present));
  }
  /**
   * Etapa 6 (lote bípedes-espíritos): as páginas PRÓPRIAS das criaturas que saíram de cena (a última morreu há 20 s de
   * jogo: `RELEASE_GRACE_S`, o mesmo relógio do cadáver) saem da VRAM — antes ficavam até o fim da partida. Em uso: os
   * assets das unidades vivas no estado (mesmo fora da tela: rolar a câmera não recarrega), das vistas, das quedas e dos
   * cadáveres.
   */
  private releaseUnusedArt(state: GameState, clock: number): void {
    const used = new Set<string>();
    for (const u of state.units.values()) used.add(this.art.unitId(u.type, u.heads));
    for (const v of this.views.values()) if (v.unit) used.add(v.unit.art.id);
    for (const uv of this.fx.dyingViews()) used.add(uv.art.id);
    for (const c of this.corpses) used.add(c.uv.art.id);
    // (integração da Etapa 6: o titã que um Portal dos Titãs mantém quente — `warmTitans` — também está em uso; sem isso
    // as páginas dele saíam a cada 20 s e o portal as pedia de novo no quadro seguinte)
    for (const t of this.titansWanted) used.add(this.art.unitId(t));
    this.art.releaseUnused(used, clock);
  }
  /**
   * Titãs (Etapa 6, lote titãs): as páginas do titã do deus de quem ergue um Portal dos Titãs sobem já na obra — ele
   * nasce do portal saindo do chão (`rise`), e a primeira vista não pode sair procedural. Confere a cada 30 quadros.
   */
  private warmTitans(state: GameState): void {
    if ((this.titanWarmFrame = (this.titanWarmFrame + 1) % 30) !== 0) return;
    this.titansWanted.clear();
    for (const b of state.buildings.values()) {
      if (!BUILDINGS[b.type]?.titanGate) continue;
      const titan = MAJOR_GODS[state.players[b.owner]?.god ?? '']?.titan;
      if (titan) { this.titansWanted.add(titan); this.art.prewarmUnits([titan]); }
    }
  }
  /**
   * Chegaram as páginas de algum tipo de unidade: as vistas procedurais dos tipos que agora têm arte (e as assadas numa
   * escala que deixou de ser a servida) saem; o próximo quadro as recria assadas. Nada mais é reconstruído.
   */
  private refreshUnitViews(state: GameState): void {
    this.unitGenSeen = this.art.unitGen;
    if (!this.bakedMode) return;
    for (const [id, v] of this.views) {
      if (v.bld || !state.units.has(id)) continue;
      const art = this.art.unit(v.artId ?? v.type);
      if (art && (!v.unit || v.unit.art.scale !== art.scale)) { this.destroyView(v); this.views.delete(id); }
    }
    // quedas e cadáveres numa escala que deixou de ser a servida também saem (a queda em curso é refeita no próximo quadro)
    const stale = (uv: UnitView) => { const art = this.art.unit(uv.art.id); return !!art && art.scale !== uv.art.scale; };
    this.fx.recreate((_e, s) => { const uv = deathView(s); return !!uv && stale(uv); });
    this.corpses = this.corpses.filter((c) => { if (!stale(c.uv)) return true; c.uv.destroy(); return false; });
    // e a escala velha das unidades sai da memória quando nenhum tipo pedido é mais servido nela (trocar 1×/2× no meio
    // da partida não deixa as duas escalas carregadas)
    this.art.collect();
  }
  private clearDying(): void {
    this.recentDeaths.length = 0;
    for (const c of this.corpses) c.uv.destroy();
    this.corpses.length = 0;
  }
  /** Cadáveres: apagam de CORPSE_HOLD a CORPSE_TTL s depois da morte; saem ao fim (ou se o relógio voltou: replay). */
  private updateCorpses(): void {
    const now = this.animClock;
    let w = 0;
    for (const c of this.corpses) {
      const age = now - c.born;
      if (!(age >= 0 && age < CORPSE_TTL)) { c.uv.destroy(); continue; }
      c.uv.alpha = corpseAlpha(age);
      this.corpses[w++] = c;
    }
    this.corpses.length = w;
  }
  /** Escombros e fantasmas assados (usam texturas do atlas: saem antes de uma troca de arte ou de partida; a fumaça e as
   *  demais partículas saem no fx.reset). */
  private clearBakedExtras(): void {
    for (const r of this.rubbleViews) { r.body.destroy(); r.shadow?.destroy(); }
    this.rubbleViews = []; this.recentGone.length = 0;
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
  /** Sobe para a GPU a próxima imagem de atlas pronta (uma por quadro do ticker); só então a página passa a ser servida. */
  private uploadNextAtlas(): void {
    const q = this.art?.atlas.uploads; if (!q || q.length === 0) return;
    const job = q.shift()!;
    if (!job.source.destroyed) { try { this.app.renderer.texture.initSource(job.source); } catch { /* sobe no primeiro uso */ } }
    job.done();
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
    // edifício assado troca de estágio sem refazer a vista; o procedural refaz ao completar (textura de obra → pronta); a
    // hidra assada troca de asset quando ganha uma cabeça (Etapa 6: uma variante por número de cabeças)
    if (v && (v.type !== e.type || v.color !== color || (v.complete !== complete && !v.bld) || (v.unit && e.kind === 'unit' && v.artId !== this.art.unitId(e.type, e.heads)))) { this.destroyView(v); this.views.delete(e.id); v = undefined; }
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
      v = { root, body, shadow, type: e.type, color, complete, angle: 0, carry: null, unit: null, bld: null, fxAcc: { dust: Math.random() } };
      this.parentFor(e.kind, e.kind === 'building' ? this.buildingDrawY(e) : e.y, e.kind === 'unit' && !!UNITS[e.type]?.flying).addChild(root);
      this.views.set(e.id, v);
    }
    return v;
  }
  /** Vista assada (hoplita, cidadão, templo…) se a ArtLibrary tiver o tipo servido; senão undefined (procedural). */
  private makeBakedView(e: Unit | Building, color: number): EntityView | undefined {
    if (e.kind === 'unit') {
      // Etapa 6: voadoras (Pégaso, assado no ar com a sombra no chão) e variantes pela entidade (hidra por cabeças)
      const artId = this.art.unitId(e.type, e.heads);
      const art = this.art.unit(artId);
      if (!art) return undefined;
      const flying = !!UNITS[e.type]?.flying;
      const uv = new UnitView(art, this.art, e.type, color, this.layers.shadows, 2, unitLook(e.type, flying));
      uv.lastAttackTick = e.attackTick;   // um golpe antigo não dispara a animação de ataque ao criar a vista
      uv.lastAbilityTick = abilityTick(e);   // nem uma habilidade antiga
      const v: EntityView = { root: uv.root, body: uv.body, shadow: uv.shadow, type: e.type, color, complete: true, angle: Math.PI / 2, carry: null, unit: uv, bld: null, fxAcc: { dust: Math.random() }, artId };
      this.parentFor('unit', e.y, flying).addChild(uv.root);
      this.views.set(e.id, v);
      return v;
    }
    // só com todos os estados assados em todas as variantes (senão a obra ou o dano ficariam sem quadro): procedural
    if (!this.art.buildingArt(e.type)) return undefined;
    const bv = new BuildingView(this.art, e.type, color, this.layers.shadows);
    const v: EntityView = { root: bv.root, body: bv.body, shadow: bv.shadow, type: e.type, color, complete: e.complete, angle: 0, carry: null, unit: null, bld: bv, fxAcc: { dust: Math.random() } };
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
        v.live = live;
        let open = false, hpFrac = 1;
        if (live) {
          const frac = b.complete ? 1 : b.progress / Math.max(1e-6, getBuildingStats(state, state.players[b.owner], b.type).buildTime);
          hpFrac = b.hp / Math.max(1, b.maxHp);
          open = !!art?.states.has('open') && b.complete && this.gatesOpen.has(b.id);
          let variant: string | null = null;
          if (art?.variantBy === 'ageTier') variant = ageTier(state.players[b.owner].age);
          else if (art?.variantBy === 'farmCrop') variant = farmCrop((state.tick - b.builtTick) / TICK_RATE, b.id);
          else if (art?.variantBy === 'pick') variant = pickVariant(art.variants ?? [], b.tx, b.ty);
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
        if (dmg) this.emitSmoke(v.bld, b, dmg, v.fxAcc);
        else if (live && b.complete && !open) this.fx.building(v.fxAcc, b, v.bld);   // lareira/forja de quem produz (fx/ambient.ts)
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
      v.live = this.liveToLocal(state, ui.localPlayer, b);
      if (v.shadow) { const sh = buildingShadow(b.type)!; v.shadow.position.set(b.x * TILE + sh.dx, b.y * TILE + sh.dy); v.shadow.visible = true; }
      v.body.tint = tint;
      if (b.complete) this.fx.building(v.fxAcc, b, null);
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
      // Pele de Bronze: bronze polido com um reflexo passando (fx/handlers/bronze.ts); os brilhos especulares são partículas
      const bodyTint = state.tick - u.lastDamageTick < 3 ? 0xff8080 : (state.tick < state.players[u.owner].bronzeUntil ? bronzeTint(this.animClock, u.id) : 0xffffff);
      // poeira dos pés, cascos e rodas (Etapa 5): só quem está à vista e na tela (o laço já cortou o resto), pela
      // velocidade do tick; a densidade cai com o número de unidades andando na tela (fx/logic.ts footDustRate)
      const mdx = u.x - u.px, mdy = u.y - u.py, md2 = mdx * mdx + mdy * mdy;
      if (md2 > 4e-4 && !flying) this.fx.footstep(v.fxAcc, u.type, ix, iy, Math.sqrt(md2) / DT, mdx, mdy);
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
      // halo dos heróis, auras das habilidades, cura, coleta/obra e margem da água (fx/unitFx.ts), depois da vista
      this.fx.unit(v.fxAcc, u, ix, iy, v.unit);
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
        if (v.unit && v.root.visible) this.recentDeaths.push({ type: v.type, x: v.root.position.x, y: v.root.position.y, dir: v.unit.dir, artId: v.unit.art.id });
        if (v.bld && v.bld.visible) this.recentGone.push({ type: v.type, x: v.bld.x, y: v.bld.y, variant: v.bld.variant, live: !!v.live });
        else if (!v.unit && !v.bld && v.root.visible && v.live !== undefined) this.recentGone.push({ type: v.type, x: v.root.position.x, y: v.root.position.y, variant: null, live: v.live });
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
  /** Fumaça de um edifício danificado: baforadas do terço de cima do quadro, na taxa do nível de dano (partículas do
   *  fx, a receita da Etapa 3); muito danificado (nível 2), também chamas do flipbook `fire` no telhado (Etapa 5). */
  private emitSmoke(bv: BuildingView, b: Building, level: 1 | 2, acc: FxAcc): void {
    const hw = b.w * TILE * 0.38, top = bv.y - bv.top;
    if (level === 2) this.fx.buildingFire(acc, 1.6 * Math.sqrt(b.w * b.h), bv.x - hw * 0.8, bv.x + hw * 0.8, top + bv.top * 0.3, top + bv.top * 0.62);
    bv.smokeAcc += smokeRate(level, b.w * b.h) * this.animDt;
    if (bv.smokeAcc < 1) return;
    const n = Math.floor(bv.smokeAcc); bv.smokeAcc -= n;
    this.fx.buildingSmoke(n, bv.x - hw, bv.x + hw, top + bv.top * 0.12, top + bv.top * 0.45, level === 2);
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
    const dx = u.x - u.px, dy = u.y - u.py, disp2 = dx * dx + dy * dy;
    const walking = !posted && isWalking(disp2, getUnitStats(state, state.players[u.owner], u.type).speed * DT, isMoveAnim(uv.anim));
    let dir = uv.dir;
    const s = posted ? this.cam.worldDeltaToScreen(this.tgtPt.x - ix, this.tgtPt.y - iy, this.tmpVec) : walking ? this.cam.worldDeltaToScreen(dx, dy, this.tmpVec) : null;
    if (s && (s.x * s.x + s.y * s.y) > 1e-6) dir = dirWithHysteresis(Math.atan2(s.y, s.x), uv.dir);
    const atk = art.anims.attack;
    const hit = freshHit(u.attackTick, uv.lastAttackTick, state.tick, atk ? Math.ceil(animDuration(atk.frames, atk.fps) * TICK_RATE) : 0);
    uv.lastAttackTick = u.attackTick;
    const attacking = hit || (uv.anim === 'attack' && !uv.finished(clock));
    // habilidade do herói (Q): toca uma vez do quadro 0 no tick do uso, por cima do resto (só com a animação no atlas)
    const abi = art.anims.ability;
    let abFresh = false;
    if (abi) {
      const used = abilityTick(u);
      abFresh = freshHit(used, uv.lastAbilityTick, state.tick, Math.ceil(animDuration(abi.frames, abi.fps) * TICK_RATE));
      uv.lastAbilityTick = used;
    }
    // ascensão (Etapa 6, lote titãs): quem tem `rise` no atlas (o titã do Portal dos Titãs) sai do chão ao nascer, por
    // cima de tudo, contada do tick em que surgiu (a vista que aparece no meio pega do quadro certo)
    const rs = art.anims.rise;
    const risen = rs ? riseElapsed(u.spawnTick, state.tick, Math.ceil(animDuration(rs.frames, rs.fps) * TICK_RATE), TICK_RATE) : -1;
    const ai = this.animIn;
    ai.rising = risen >= 0;
    ai.ability = abFresh || (uv.anim === 'ability' && !uv.finished(clock));
    ai.moving = walking; ai.attacking = attacking; ai.carrying = u.carry === 'food' && u.carryAmt >= 1;
    ai.working = posted && (u.state === 'gather' || u.state === 'build');
    // cavalaria: galope (`run`) na velocidade dela; em formação com a infantaria anda mais devagar e trota (`walk`).
    // À distância no posto, entre um disparo e outro: `aim` (arco puxado, dardo armado; o cerco fica carregado)
    ai.running = walking && art.has('run') && isRunning(disp2, DT, uv.anim === 'run');
    // na Trégua ninguém golpeia: quem está no posto relaxa a guarda (armas baixadas, a pose parada) até ela acabar
    ai.engaged = posted && u.state === 'attack' && state.tick >= state.ceasefireUntil;
    const anim: UnitAnim = chooseAnim(ai, art.has);
    const riseStart = anim === 'rise' && uv.anim !== 'rise';
    uv.pose(anim, dir, clock, (hit && anim === 'attack') || (abFresh && anim === 'ability') || riseStart);
    if (riseStart) uv.animStart = clock - risen;
    uv.place(ix * TILE, iy * TILE);   // antes do tick: o andar avança o quadro pela distância andada neste quadro
    uv.tick(clock, (u.id % 13) * 0.077);
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
      // assada: acima do topo do corpo na direção da vista (medido no rig sem lança/xyston/mastro: a cabeça do cavalo e as
      // ameias da helépole não ficam por cima da barra), suavizado ao virar
      const uv = this.views.get(u.id)?.unit;
      const w = Math.max(18, r * 2.4), x = ix * TILE - w / 2, y = uv ? iy * TILE - uv.barTop(this.animDt) - 6 : iy * TILE - r - 8;
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
        const variant = art.variantBy === 'ageTier' ? ageTier(state.players[local]?.age ?? 0) : art.variantBy === 'pick' ? pickVariant(art.variants ?? [], t.x, t.y) : art.variantBy ? buildingVariant(art.variantBy, { mask: masks?.[i] ?? 0, age: 0, flag: !!art.variants?.includes(WALL_FLAG_PROBE) && wallFlagAt(t.x, t.y) }) : null;
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
  private addRubble(e: VisualEffect, type: string, seen: boolean): void {
    const def = BUILDINGS[type]; if (!def) return;
    const f = this.art.rubble(def.w, def.h); if (!f) return;
    const body = new Sprite(f.color); body.anchor.set(f.anchor.x, f.anchor.y); body.position.set(e.x * TILE, e.y * TILE);
    const zy = e.y - def.h / 2 - 0.01;
    body.zIndex = zy;
    this.parentFor('building', zy, false).addChild(body);
    let shadow: Sprite | null = null;
    if (f.shadow) { shadow = new Sprite(f.shadow); shadow.anchor.set(f.anchor.x, f.anchor.y); shadow.position.set(e.x * TILE, e.y * TILE); shadow.alpha = SHADOW_ALPHA; shadow.blendMode = 'multiply'; this.layers.shadows.addChild(shadow); }
    body.visible = seen; if (shadow) shadow.visible = seen;
    this.rubbleViews.push({ body, shadow, t0: this.animClock - (e.total - e.ttl) / TICK_RATE, tx: Math.floor(e.x), ty: Math.floor(e.y), revealed: seen });
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
      // queda fora da vista: os escombros só aparecem depois que o jogador vir o tile (nunca revelam o que a névoa esconde)
      if (!r.revealed) r.revealed = this.revealAll || !!state.config.revealMap || !vis || vis[i] === 2;
      const seen = r.revealed;
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

  // ---------------- Efeitos (fx/: registro por tipo, partículas, decalques) ----------------
  /**
   * Efeitos do quadro: os handlers de cada VisualEffect/TimedEffect (fx/registry.ts), as partículas (orçamento total do
   * preset com prioridade) e os decalques (névoa, vida, teto); o tremor pedido por eles vai para a câmera. Depois, os
   * cadáveres assados e a limpeza das mortes/quedas deste quadro (que os handlers de morte e colapso já consultaram).
   */
  private updateEffects(): void {
    const shake = this.fx.update();
    if (shake > this.cam.shake) this.cam.shake = shake;
    this.updateCorpses();
    this.recentDeaths.length = 0;
    this.recentGone.length = 0;
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
    this.warmUnits(state, ui.localPlayer);
    if (this.art.unitGen !== this.unitGenSeen) this.refreshUnitViews(state);
    { const t = state.tick / TICK_RATE; if (t - this.releaseAt >= 2 || t < this.releaseAt) { this.releaseAt = t; this.releaseUnusedArt(state, t); } }
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
    // efeitos: o quadro começa antes das vistas (a poeira dos pés e a fumaça dos edifícios saem durante updateEntities)
    this.fx.beginFrame({ state, local: ui.localPlayer, clock: this.animClock, dt: this.animDt, zoom: this.cam.zoom, baked: this.bakedMode, quality: this.quality, view: this.cam.visibleTiles(), revealAll: this.revealAll, screenW: this.app.screen.width, screenH: this.app.screen.height });
    this.updateTerrain(state, ui.localPlayer);
    this.updateEntities(state, alpha, ui);
    this.updateGround(state, alpha, ui);
    this.updateEffects();
    this.updateRubble(state, ui.localPlayer);
    if (this.dayCycle.enabled) { const z = this.cam.zoom; this.dayCycle.update(this.animClock, { x: -this.world.x / z - 2, y: -this.world.y / z - 2, w: this.app.screen.width / z + 4, h: this.app.screen.height / z + 4 }); }
    if (this.vignette?.visible) { this.vignette.width = this.app.screen.width; this.vignette.height = this.app.screen.height; }
    if (this.clouds.enabled) { const z = this.cam.zoom; this.clouds.update(this.animClock, { x: -this.world.x / z - 2, y: -this.world.y / z - 2, w: this.app.screen.width / z + 4, h: this.app.screen.height / z + 4 }, this.layers.editor.visible); }
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
