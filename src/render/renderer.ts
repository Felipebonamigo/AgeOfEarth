// Renderizador PixiJS: terreno por shader (com fronteiras), nós como sprites, entidades interpoladas, efeitos, névoa e overlays.
import { Application, Container, Graphics, Sprite, Texture, Text, TextStyle } from 'pixi.js';
import { effectiveResolution, resolveQuality, type Quality } from './quality';
import { TILE, TICK_RATE, PLAYER_COLORS, KOTH_RADIUS, rankOf } from '../core/constants';
import { BUILDINGS, UNITS } from '../core/data';
import type { Building, GameState, Unit, VisualEffect } from '../core/types';
import { Camera } from './camera';
import { TextureCache, darken, NODE_ANCHOR } from './textures';
import { getUnitStats, getBuildingStats } from '../core/sim/modifiers';
import { componentAt } from '../core/map/components';
import type { EditorUI } from '../editor/types';
import { terrainColor, regionColor, SHADOW_ALPHA } from './palette';
import { FogMesh } from './fog';
import { unitShadow, buildingShadow } from './shadows';
import { ChunkMesh, CHUNK, materialSizeFor, prewarmTerrain } from './terrain/ChunkMesh';

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

/** Um nó do mapa (árvore, mina, arbusto, animal) desenhado como sprite na camada 'props' (sombra SE assada no quadro). */
interface PropView { sprite: Sprite; type: string; x: number; y: number; chunk: number }

/** Vista de uma entidade: corpo (gira com a unidade) e sombra separada na camada 'shadows' (não gira; cai para sudeste). */
interface EntityView { root: Container; body: Sprite; shadow: Sprite | null; type: string; color: number; complete: boolean; angle: number; carry: Sprite | null; label?: Text; rank?: Graphics; rankShown?: number }

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
   *  buildings → units → fx → hp → editor → fog. */
  layers = { terrain: new Container(), shadows: new Container(), props: new Container(), ground: new Graphics(), buildings: new Container(), units: new Container(), fx: new Container(), hp: new Graphics(), editor: new Container(), fog: new Container() };
  overlay = new Graphics();
  /** Compatibilidade com o editor (antes: chunks assados em cache). O terreno por shader não tem cache: no-op. */
  chunkCacheLimit = 60;
  /** Terreno por shader (um quad por chunk num Mesh só). */
  private terrain: ChunkMesh | null = null;
  /** Chunks de terreno desenhados no último quadro (overlay ?perf=1). */
  get visibleChunks(): number { return this.terrain?.visibleChunks ?? 0; }
  /** Nós como sprites: por id; um Container por faixa de chunks (linha cy), filhos ordenados por zIndex = y. */
  private props = new Map<number, PropView>();
  private propRows: Container[] = [];
  private propFrame = 0;
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
    await this.app.init({ resizeTo: parent, background: 0x0b1020, antialias: false, preference: 'webgl', resolution: effectiveResolution(this.quality, window.devicePixelRatio || 1, this.renderScale), autoDensity: true });
    parent.appendChild(this.app.canvas);
    this.tex = new TextureCache(this.app.renderer);
    this.app.stage.addChild(this.world, this.overlay);
    this.world.addChild(this.layers.terrain, this.layers.shadows, this.layers.props, this.layers.ground, this.layers.buildings, this.layers.units, this.layers.fx, this.layers.hp, this.layers.editor, this.layers.fog);
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
    this.layers.shadows.removeChildren();
    for (const v of this.fxViews.values()) v.destroy({ children: true });
    this.fxViews.clear();
    for (const d of this.deathViews) d.c.destroy({ children: true });
    this.deathViews = [];
    this.layers.fog.removeChildren();
    this.layers.terrain.removeChildren();
    this.fog?.destroy(); this.terrain?.destroy();
    const { w, h } = state.map;
    // Terreno (e fronteiras) por shader: texturas w×h escritas a partir do mapa; névoa: malha w×h própria (fog.ts)
    this.terrain = new ChunkMesh(state.map, this.quality); this.layers.terrain.addChild(this.terrain.mesh);
    this.fog = new FogMesh(w, h); this.layers.fog.addChild(this.fog.mesh);
    this.resetProps(state);
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
    this.syncPropsRect(st, ax0, ay0, ax1, ay1);
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

  // ---------------- Nós (camada 'props') ----------------
  // Um Sprite por nó (quadro do atlas de nós com a sombra SE assada). Os sprites vivem num Container por FAIXA de chunks
  // (16 linhas de tiles), ordenado por zIndex = y: a ordem por y vale para o mapa inteiro (faixas em ordem crescente de
  // y, e dentro da faixa o sort do Pixi), sem costura de ordenação nas colunas de chunk. O culling é por chunk
  // (sprite.visible dos nós do chunk ao entrar/sair da tela) e um nó num tile nunca explorado fica oculto (senão a copa
  // das árvores da borda do mapa escaparia da névoa, que cobre só o retângulo do mapa). A conferência é sempre por
  // chunk (≤ 256 tiles, nunca O(nós do mapa), para cortar árvores não dar pico): os chunks visíveis quando
  // map.nodes.size muda (corte/caça esgotando um nó, poderes que criam nós) e a cada 30 quadros; um chunk que volta à
  // tela é conferido antes de aparecer; invalidateRect (editor) confere os chunks do retângulo. Nada de generateTexture.
  private lastNodeCount = -1;
  /** Ids dos props de cada chunk (índice cy · cw + cx). */
  private propIds: Set<number>[] = [];
  /** Chunks de props na tela no último quadro (1), chave da névoa já aplicada aos props e jogador local. */
  private propVis = new Uint8Array(0);
  private propFogKey = -1;
  private propLocal = 0;
  private propCw = 0;
  private resetProps(state: GameState): void {
    for (const c of this.propRows) c.destroy({ children: true });
    this.props.clear();
    this.layers.props.removeChildren();
    const cw = Math.ceil(state.map.w / CHUNK), ch = Math.ceil(state.map.h / CHUNK);
    this.propCw = cw;
    this.propRows = []; this.propIds = []; this.propVis = new Uint8Array(cw * ch); this.propFogKey = -1;
    for (let r = 0; r < ch; r++) { const c = new Container(); c.sortableChildren = true; c.visible = false; this.propRows.push(c); this.layers.props.addChild(c); }
    for (let i = 0; i < cw * ch; i++) this.propIds.push(new Set());
    for (const n of state.map.nodes.values()) this.addProp(state, n.id);
    this.lastNodeCount = state.map.nodes.size;
  }
  private addProp(state: GameState, id: number): void {
    const map = state.map, n = map.nodes.get(id);
    if (!n) return;
    const decor = map.decor[n.y * map.w + n.x] % 256;
    const s = new Sprite(this.tex.node(n.type, decor));
    s.anchor.set(NODE_ANCHOR.x, NODE_ANCHOR.y);
    s.position.set((n.x + 0.5) * TILE, (n.y + 0.5) * TILE);
    s.scale.set(n.type === 'tree' ? 0.85 + (decor % 40) / 100 : 1);
    s.zIndex = n.y;
    const cy = Math.floor(n.y / CHUNK), chunk = cy * this.propCw + Math.floor(n.x / CHUNK);
    s.visible = this.propVis[chunk] === 1 && this.propExplored(state, n.x, n.y);
    this.propRows[cy]?.addChild(s);
    this.propIds[chunk]?.add(id);
    this.props.set(id, { sprite: s, type: n.type, x: n.x, y: n.y, chunk });
  }
  private dropProp(id: number, v: PropView): void { v.sprite.destroy(); this.props.delete(id); this.propIds[v.chunk]?.delete(id); }
  /** O jogador local já viu o tile (ou o mapa está revelado): só então o nó aparece. */
  private propExplored(state: GameState, x: number, y: number): boolean {
    if (this.revealAll || state.config.revealMap) return true;
    const vis = state.players[this.propLocal]?.visibility;
    return !vis || vis[y * state.map.w + x] > 0;
  }
  /** Confere um chunk contra o mapa: some o prop cujo tile não aponta mais para ele (ou mudou de tipo); nasce o que falta. */
  private syncPropChunk(state: GameState, chunk: number): void {
    const map = state.map, cw = this.propCw;
    const ids = this.propIds[chunk]; if (!ids) return;
    for (const id of ids) { const v = this.props.get(id)!; const n = map.nodes.get(id); if (!n || n.type !== v.type || map.nodeAt[v.y * map.w + v.x] !== id) this.dropProp(id, v); }
    const cx = chunk % cw, cy = (chunk - cx) / cw;
    const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = Math.min(map.w, x0 + CHUNK), y1 = Math.min(map.h, y0 + CHUNK);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const id = map.nodeAt[y * map.w + x]; if (id !== -1 && !this.props.has(id)) this.addProp(state, id); }
  }
  /** Visibilidade dos sprites de um chunk: na tela e em tile explorado. */
  private showPropChunk(state: GameState, chunk: number, on: boolean): void {
    const ids = this.propIds[chunk]; if (!ids) return;
    for (const id of ids) { const v = this.props.get(id); if (v) v.sprite.visible = on && this.propExplored(state, v.x, v.y); }
  }
  /** Editor: confere os chunks que tocam o retângulo. */
  private syncPropsRect(state: GameState, x0: number, y0: number, x1: number, y1: number): void {
    const cw = this.propCw;
    for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) this.syncPropChunk(state, cy * cw + cx);
  }
  private updateProps(state: GameState, local: number): void {
    const changed = state.map.nodes.size !== this.lastNodeCount || ++this.propFrame % 30 === 0;
    this.lastNodeCount = state.map.nodes.size;
    // névoa: um tile recém-explorado revela os nós dele (só nos chunks na tela; os outros são conferidos ao voltar)
    const fogKey = this.revealAll || state.config.revealMap ? -2 : state.fogVersion * 8 + local;
    const fogChanged = fogKey !== this.propFogKey;
    this.propFogKey = fogKey; this.propLocal = local;
    // Culling por chunk (1 tile de folga: copas e sombras passam da borda do tile)
    const v = this.cam.visibleTiles(), cw = this.propCw;
    const cx0 = Math.floor((v.x0 - 1) / CHUNK), cy0 = Math.floor((v.y0 - 1) / CHUNK), cx1 = Math.floor((v.x1 + 1) / CHUNK), cy1 = Math.floor((v.y1 + 1) / CHUNK);
    for (let i = 0; i < this.propVis.length; i++) {
      const cx = i % cw, cy = (i - cx) / cw;
      const vis = cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1;
      const was = this.propVis[i] === 1;
      this.propVis[i] = vis ? 1 : 0;
      if (vis && (changed || !was)) this.syncPropChunk(state, i);
      if (vis !== was || (vis && fogChanged)) this.showPropChunk(state, i, vis);
    }
    for (let r = 0; r < this.propRows.length; r++) this.propRows[r].visible = r >= cy0 && r <= cy1;
  }

  // ---------------- Névoa (bordas macias por shader em fog.ts) ----------------
  private updateFog(state: GameState, local: number): void {
    const f = this.fog; if (!f) return;
    f.mesh.visible = !this.revealAll;
    if (this.revealAll || state.fogVersion === this.fogVersion) return;
    this.fogVersion = state.fogVersion;
    f.update(state.players[local].visibility);
  }

  private visibleToLocal(state: GameState, local: number, e: Unit | Building): boolean {
    if (e.owner === local || state.config.revealMap || this.revealAll) return true;
    const vis = state.players[local].visibility;
    const i = Math.floor(e.y) * state.map.w + Math.floor(e.x);
    if (i < 0 || i >= vis.length) return false;
    return e.kind === 'building' ? vis[i] >= 1 : vis[i] === 2;
  }

  // ---------------- Entidades ----------------
  private destroyView(v: EntityView): void { v.root.destroy({ children: true }); v.shadow?.destroy(); }

  private getView(e: Unit | Building, color: number): EntityView {
    let v = this.views.get(e.id);
    const complete = e.kind === 'building' ? e.complete : true;
    if (v && (v.type !== e.type || v.color !== color || v.complete !== complete)) { this.destroyView(v); this.views.delete(e.id); v = undefined; }
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
      v = { root, body, shadow, type: e.type, color, complete, angle: 0, carry: null };
      (e.kind === 'unit' ? this.layers.units : this.layers.buildings).addChild(root);
      this.views.set(e.id, v);
    }
    return v;
  }

  private updateEntities(state: GameState, alpha: number, ui: RenderUI): void {
    const seen = new Set<number>();
    const vt = this.cam.visibleTiles();
    for (const b of state.buildings.values()) {
      if (b.x < vt.x0 - 3 || b.x > vt.x1 + 3 || b.y < vt.y0 - 3 || b.y > vt.y1 + 3) continue;
      if (!this.visibleToLocal(state, ui.localPlayer, b)) continue;
      const color = PLAYER_COLORS[b.owner % PLAYER_COLORS.length].num;
      const v = this.getView(b, color);
      v.root.position.set(b.x * TILE, b.y * TILE);
      v.root.zIndex = b.y;
      v.root.visible = true;
      if (v.shadow) { const sh = buildingShadow(b.type)!; v.shadow.position.set(b.x * TILE + sh.dx, b.y * TILE + sh.dy); v.shadow.visible = true; }
      if (state.tick - b.lastDamageTick < 3) v.body.tint = 0xff9999; else v.body.tint = 0xffffff;
      if (b.disabledUntil > state.tick) v.body.tint = 0xb39ddb;
      seen.add(b.id);
    }
    for (const u of state.units.values()) {
      if (u.inside !== -1) continue;
      const ix = u.px + (u.x - u.px) * alpha, iy = u.py + (u.y - u.py) * alpha;
      if (ix < vt.x0 - 2 || ix > vt.x1 + 2 || iy < vt.y0 - 2 || iy > vt.y1 + 2) continue;
      if (!this.visibleToLocal(state, ui.localPlayer, u)) continue;
      const color = PLAYER_COLORS[u.owner % PLAYER_COLORS.length].num;
      const v = this.getView(u, color);
      v.root.position.set(ix * TILE, iy * TILE);
      v.root.zIndex = iy + (UNITS[u.type].flying ? 1000 : 0);
      v.root.visible = true;
      // direção
      const dx = u.x - u.px, dy = u.y - u.py;
      if (dx * dx + dy * dy > 1e-6) v.angle = Math.atan2(dy, dx);
      else if (u.state === 'attack' || u.state === 'gather' || u.state === 'build') {
        const t = u.state === 'attack' ? (state.units.get(u.targetId) ?? state.buildings.get(u.targetId)) : (u.nodeId > 0 ? state.map.nodes.get(u.nodeId) : (u.nodeId < 0 ? state.buildings.get(-u.nodeId) : state.buildings.get(u.targetId)));
        if (t) { const tx = 'kind' in t ? t.x : t.x + 0.5, ty = 'kind' in t ? t.y : t.y + 0.5; v.angle = Math.atan2(ty - iy, tx - ix); }
      }
      v.body.rotation = v.angle;
      // animações simples: balanço ao andar, investida ao atacar
      const moving = dx * dx + dy * dy > 1e-6;
      const bob = moving ? 1 + Math.sin(this.time * 14 + u.id) * 0.06 : 1;
      const lunge = state.tick - u.attackTick < 4 ? 1 + (4 - (state.tick - u.attackTick)) * 0.08 : 1;
      v.body.scale.set(bob * lunge, bob);
      if (UNITS[u.type].flying) v.body.position.y = -6 + Math.sin(this.time * 3 + u.id) * 2;
      // sombra: acompanha o pé, não gira, cai para sudeste (mais longe e mais fraca para voadoras)
      if (v.shadow) {
        const sh = unitShadow(u.type);
        v.shadow.position.set(ix * TILE + sh.dx, iy * TILE + sh.dy);
        v.shadow.scale.set(bob);
        v.shadow.alpha = UNITS[u.type].flying ? SHADOW_ALPHA * 0.6 : u.type === 'shade' ? SHADOW_ALPHA * 0.4 : SHADOW_ALPHA;
        v.shadow.visible = true;
      }
      v.body.tint = state.tick - u.lastDamageTick < 3 ? 0xff8080 : (state.tick < state.players[u.owner].bronzeUntil ? 0xffd28a : 0xffffff);
      v.body.alpha = u.type === 'shade' ? 0.7 : 1;
      // patente de veterano (estrelas acima da unidade)
      const rk = UNITS[u.type].tags.includes('military') && !UNITS[u.type].tags.includes('titan') ? rankOf(u.kills) : 0;
      if (rk !== (v.rankShown ?? 0)) {
        v.rankShown = rk;
        if (!v.rank) { v.rank = new Graphics(); v.root.addChild(v.rank); }
        v.rank.clear();
        for (let i = 0; i < rk; i++) v.rank.star(-6 + i * 6 - (rk - 1) * 3 + 3, -16, 4, 3, 1.5).fill({ color: 0xfde047 });
      }
      // carga
      if (u.carry && u.carryAmt > 0) {
        if (!v.carry) { v.carry = new Sprite(this.tex.disc(3.5, 0xffffff)); v.carry.anchor.set(0.5); v.root.addChild(v.carry); }
        v.carry.visible = true; v.carry.tint = u.carry === 'food' ? 0xef4444 : u.carry === 'wood' ? 0x92400e : 0xf2c14e;
        v.carry.position.set(-8, -8);
      } else if (v.carry) v.carry.visible = false;
      seen.add(u.id);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { const e = state.units.get(id) ?? state.buildings.get(id); if (!e) { this.destroyView(v); this.views.delete(id); } else { v.root.visible = false; if (v.shadow) v.shadow.visible = false; } }
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
      const w = Math.max(18, r * 2.4), x = ix * TILE - w / 2, y = iy * TILE - r - 8;
      const frac = Math.max(0, u.hp / u.maxHp);
      hp.rect(x, y, w, 3.5).fill({ color: 0x000000, alpha: 0.6 });
      hp.rect(x, y, w * frac, 3.5).fill(frac > 0.6 ? 0x4ade80 : frac > 0.3 ? 0xfacc15 : 0xef4444);
    }
    for (const b of state.buildings.values()) {
      if (b.x < vt.x0 - 3 || b.x > vt.x1 + 3 || b.y < vt.y0 - 3 || b.y > vt.y1 + 3) continue;
      if (!this.visibleToLocal(state, local, b)) continue;
      const selected = ui.selection.has(b.id);
      const w = b.w * TILE - 6, x = b.tx * TILE + 3, y = b.ty * TILE - 7;
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
    // fantasma de construção
    if (ui.placement) {
      const p = ui.placement;
      const tiles = p.tiles ?? [{ x: p.tx, y: p.ty, ok: p.ok }];
      const def = BUILDINGS[p.type];
      for (const t of tiles) {
        g.rect(t.x * TILE, t.y * TILE, def.w * TILE, def.h * TILE).fill({ color: t.ok ? 0x4ade80 : 0xef4444, alpha: 0.35 }).rect(t.x * TILE, t.y * TILE, def.w * TILE, def.h * TILE).stroke({ width: 1.5, color: t.ok ? 0x4ade80 : 0xef4444, alpha: 0.9 });
      }
      if (def.territory) g.circle((p.tx + def.w / 2) * TILE, (p.ty + def.h / 2) * TILE, (def.territory + state.players[local].mods.player.territory) * TILE).stroke({ width: 1, color: 0xffffff, alpha: 0.3 });
    }
    if (ui.powerTarget) g.circle(ui.mouseWorld.x * TILE, ui.mouseWorld.y * TILE, ui.powerTarget.radius * TILE).stroke({ width: 2, color: 0xfde68a, alpha: 0.8 }).circle(ui.mouseWorld.x * TILE, ui.mouseWorld.y * TILE, ui.powerTarget.radius * TILE).fill({ color: 0xfde68a, alpha: 0.12 });
  }

  // ---------------- Efeitos ----------------
  private updateEffects(state: GameState, ui: RenderUI): void {
    const seen = new Set<VisualEffect>();
    for (const e of state.effects) {
      seen.add(e);
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
          if (typeof e.data === 'string' && BUILDINGS[e.data]) { const s = new Sprite(this.tex.building(e.data, 0x888888, true)); s.anchor.set(0.5); s.tint = 0x777777; c.addChild(s); }
        } else if (e.type === 'quake') this.cam.shake = 10;
        c.position.set(e.x * TILE, e.y * TILE);
      }
      if (e.type === 'projectile' && e.tx !== undefined && e.ty !== undefined) {
        const x = e.x + (e.tx - e.x) * p, y = e.y + (e.ty - e.y) * p;
        c.position.set(x * TILE, y * TILE - Math.sin(p * Math.PI) * 10);
        c.rotation = Math.atan2(e.ty - e.y, e.tx - e.x);
      } else if (e.type === 'death' || e.type === 'collapse' || e.type === 'petrify') {
        c.alpha = 1 - p; if (e.type === 'collapse') c.scale.set(1 - p * 0.2);
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
        // CC 3×3 em (x-1, y-1) e os 6 pontos onde createGame põe cidadãos (amarelo) e batedor (azul-claro)
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
    this.cam.resize(this.app.screen.width, this.app.screen.height);
    const sx = this.cam.shake > 0 ? (Math.random() - 0.5) * this.cam.shake : 0, sy = this.cam.shake > 0 ? (Math.random() - 0.5) * this.cam.shake : 0;
    if (this.cam.shake > 0) this.cam.shake = Math.max(0, this.cam.shake - dtReal * 12);
    this.world.scale.set(this.cam.zoom);
    this.world.position.set(-this.cam.x * this.cam.zoom + sx, -this.cam.y * this.cam.zoom + sy);
    this.updateTerrain(state, ui.localPlayer);
    this.updateEntities(state, alpha, ui);
    this.updateGround(state, alpha, ui);
    this.updateEffects(state, ui);
    this.updateEditor(state, ui);
    this.updateFog(state, ui.localPlayer);
    const o = this.overlay; o.clear();
    if (ui.dragRect) { const r = ui.dragRect; o.rect(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0)).fill({ color: 0x8ff58f, alpha: 0.12 }).rect(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0)).stroke({ width: 1, color: 0x8ff58f, alpha: 0.9 }); }
  }

  /** Entidade sob o ponto (em tiles). Unidades têm prioridade sobre edifícios. */
  pick(state: GameState, x: number, y: number, local: number): Unit | Building | null {
    let best: Unit | null = null, bestD = Infinity;
    for (const u of state.units.values()) {
      if (u.inside !== -1 || !this.visibleToLocal(state, local, u)) continue;
      const r = Math.max(0.45, UNITS[u.type].radius * 1.5);
      const dx = u.x - x, dy = u.y - y; const d = dx * dx + dy * dy;
      if (d <= r * r && d < bestD) { bestD = d; best = u; }
    }
    if (best) return best;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= state.map.w || ty >= state.map.h) return null;
    const bid = state.map.buildingAt[ty * state.map.w + tx];
    if (bid !== -1) { const b = state.buildings.get(bid); if (b && this.visibleToLocal(state, local, b)) return b; }
    return null;
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
