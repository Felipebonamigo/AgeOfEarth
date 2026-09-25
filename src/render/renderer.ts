// Renderizador PixiJS: chunks de terreno, fronteiras, entidades interpoladas, efeitos, névoa e overlays.
import { Application, Container, Graphics, Sprite, Texture, Rectangle, Text, TextStyle } from 'pixi.js';
import { TILE, TICK_RATE, PLAYER_COLORS, KOTH_RADIUS, rankOf } from '../core/constants';
import { BUILDINGS, UNITS } from '../core/data';
import type { Building, GameState, Unit, VisualEffect } from '../core/types';
import { Camera } from './camera';
import { TextureCache, darken, paintChunkBase, drawChunkDetail, SUB, CHUNK_MARGIN } from './textures';
import { getUnitStats, getBuildingStats } from '../core/sim/modifiers';
import { componentAt } from '../core/map/components';
import type { EditorUI } from '../editor/types';
import { terrainColor, regionColor, SHADOW_ALPHA } from './palette';
import { FogMesh, TerritoryMesh } from './fog';
import { unitShadow, buildingShadow, nodeShadow } from './shadows';

const CHUNK = 16;
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
  /** Ordem (docs/ART.md §3.7): terrain → territory → shadows → ground → buildings → units → fx → hp → editor → fog.
   *  'shadows' é inserida antes de 'ground' em setState (init() monta o resto). */
  layers = { terrain: new Container(), territory: new Container(), shadows: new Container(), ground: new Graphics(), buildings: new Container(), units: new Container(), fx: new Container(), hp: new Graphics(), editor: new Container(), fog: new Container() };
  overlay = new Graphics();
  /** Quantos chunks de terreno ficam em cache antes de descartar os fora da tela (60 na partida; no editor, todos). */
  chunkCacheLimit = 60;
  private chunks = new Map<string, Sprite>();
  private chunkNodeCount = new Map<string, number>();
  /** Ids dos nós desenhados em cada chunk (inclui a margem de 1 tile): se algum sumir, o chunk é regenerado. */
  private chunkNodes = new Map<string, number[]>();
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
  private terr: TerritoryMesh | null = null; private terrVersion = -1;
  private fxViews = new Map<VisualEffect, Container>();
  private deathViews: { c: Container; ttl: number; total: number; kind: string }[] = [];
  private lastNodeCount = -1;
  private state: GameState | null = null;
  time = 0;

  async init(parent: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({ resizeTo: parent, background: 0x0b1020, antialias: true, preference: 'webgl', resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
    parent.appendChild(this.app.canvas);
    this.tex = new TextureCache(this.app.renderer);
    this.app.stage.addChild(this.world, this.overlay);
    this.world.addChild(this.layers.terrain, this.layers.territory, this.layers.ground, this.layers.buildings, this.layers.units, this.layers.fx, this.layers.hp, this.layers.editor, this.layers.fog);
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
    for (const s of this.chunks.values()) s.destroy({ texture: true });
    this.chunks.clear(); this.chunkNodeCount.clear(); this.chunkNodes.clear();
    for (const v of this.views.values()) this.destroyView(v);
    this.views.clear();
    // Camada de sombras entre territory e ground (init() monta as demais; aqui só se ainda não estiver no mundo)
    if (this.layers.shadows.parent !== this.world) this.world.addChildAt(this.layers.shadows, this.world.getChildIndex(this.layers.ground));
    this.layers.shadows.removeChildren();
    for (const v of this.fxViews.values()) v.destroy({ children: true });
    this.fxViews.clear();
    for (const d of this.deathViews) d.c.destroy({ children: true });
    this.deathViews = [];
    this.layers.territory.removeChildren();
    this.layers.fog.removeChildren();
    this.fog?.destroy(); this.terr?.destroy();
    const { w, h } = state.map;
    // Névoa e fronteiras: malhas w×h por shader (fog.ts), atualizadas só quando fogVersion/territoryVersion mudam
    this.fog = new FogMesh(w, h); this.layers.fog.addChild(this.fog.mesh);
    this.terr = new TerritoryMesh(w, h); this.layers.territory.addChild(this.terr.mesh);
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
    this.fogVersion = -1; this.terrVersion = -1; this.lastNodeCount = -1; this.revealAll = false;
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
   * Editor: o terreno/nós mudaram no retângulo de tiles [x0,x1]×[y0,y1] (inclusivo). Destrói só os chunks tocados
   * (regenerados no próximo quadro se estiverem na tela), atualiza a contagem de nós desses chunks e marca as
   * texturas do editor (regiões/passabilidade) para regenerar. O resto do mapa não é tocado.
   */
  invalidateRect(x0: number, y0: number, x1: number, y1: number): void {
    const st = this.state; if (!st) return;
    const map = st.map;
    const ax0 = Math.max(0, Math.min(x0, x1)), ay0 = Math.max(0, Math.min(y0, y1));
    const ax1 = Math.min(map.w - 1, Math.max(x0, x1)), ay1 = Math.min(map.h - 1, Math.max(y0, y1));
    this.editVersion++;
    if (ax1 < ax0 || ay1 < ay0) return;
    for (let cy = Math.floor(ay0 / CHUNK); cy <= Math.floor(ay1 / CHUNK); cy++) for (let cx = Math.floor(ax0 / CHUNK); cx <= Math.floor(ax1 / CHUNK); cx++) {
      const k = this.chunkKey(cx, cy);
      const sp = this.chunks.get(k);
      if (sp) { sp.destroy({ texture: true }); this.chunks.delete(k); this.chunkNodes.delete(k); this.layers.terrain.removeChild(sp); }
      // Recontagem de nós do chunk: mantém refreshChunksIfNeeded coerente sem regenerar os outros chunks
      let nodes = 0;
      for (let y = cy * CHUNK; y < Math.min(map.h, (cy + 1) * CHUNK); y++) for (let x = cx * CHUNK; x < Math.min(map.w, (cx + 1) * CHUNK); x++) if (map.nodeAt[y * map.w + x] !== -1) nodes++;
      this.chunkNodeCount.set(k, nodes);
    }
    this.lastNodeCount = map.nodes.size;
  }
  /** Qualidade de renderização: fração da resolução nativa (0.5–1). Menos pixels = mais leve em GPUs fracas. */
  setRenderScale(scale: number): void {
    const s = Math.max(0.25, Math.min(1, scale));
    this.app.renderer.resolution = Math.min(2, window.devicePixelRatio || 1) * s;
    this.app.resize();
    this.resize();
  }

  // ---------------- Terreno em chunks ----------------
  private chunkKey(cx: number, cy: number) { return `${cx},${cy}`; }
  /**
   * Gera a textura de um chunk (16×16 tiles): camada de cor contínua (canvas a SUB px/tile ampliado com filtro
   * bilinear — sem grade), detalhes de alta frequência por tile, sombras dos nós (assadas aqui, caindo para sudeste
   * pela regra de shadows.ts) e os sprites dos nós. Nós numa margem de 1 tile também são desenhados (recortados pela
   * moldura) para que árvores/sombras que cruzam a borda apareçam iguais nos dois chunks vizinhos.
   */
  private buildChunk(state: GameState, cx: number, cy: number): Sprite {
    const map = state.map;
    const c = new Container();
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const tw = Math.min(map.w - x0, CHUNK), th = Math.min(map.h - y0, CHUNK);
    // cor-base (baixa frequência)
    const baseTex = Texture.from(paintChunkBase(map, x0, y0, tw, th));
    baseTex.source.scaleMode = 'linear';
    const base = new Sprite(baseTex);
    base.scale.set(TILE / SUB);
    base.position.set(-CHUNK_MARGIN * TILE / SUB, -CHUNK_MARGIN * TILE / SUB);
    c.addChild(base);
    // detalhes (alta frequência) e sombras dos nós
    const detail = new Graphics();
    drawChunkDetail(detail, map, x0, y0, tw, th);
    c.addChild(detail);
    const shadows = new Graphics();
    let anyShadow = false;
    const ids: number[] = [];
    let nodes = 0;
    const nodeSprites: Sprite[] = [];
    for (let y = y0 - 1; y <= y0 + th; y++) for (let x = x0 - 1; x <= x0 + tw; x++) {
      if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
      const id = map.nodeAt[y * map.w + x];
      if (id === -1) continue;
      const n = map.nodes.get(id)!;
      const own = x >= x0 && y >= y0 && x < x0 + tw && y < y0 + th;
      if (own) nodes++;
      ids.push(id);
      const decor = map.decor[y * map.w + x] % 256;
      const k = n.type === 'tree' ? 0.85 + (decor % 40) / 100 : 1;
      const px = (x - x0 + 0.5) * TILE, py = (y - y0 + 0.5) * TILE;
      const sh = nodeShadow(n.type, k);
      if (sh) { shadows.ellipse(px + sh.dx, py + sh.dy, sh.rx, sh.ry); anyShadow = true; }
      const s = new Sprite(this.tex.node(n.type, decor));
      s.anchor.set(0.5, 0.6);
      s.position.set(px, py);
      s.scale.set(k);
      s.zIndex = y;
      nodeSprites.push(s);
    }
    if (anyShadow) shadows.fill({ color: 0x000000, alpha: SHADOW_ALPHA });   // um fill só para todas as elipses
    c.addChild(shadows);
    nodeSprites.sort((a, b) => a.zIndex - b.zIndex);
    for (const s of nodeSprites) c.addChild(s);
    const tex = this.app.renderer.generateTexture({ target: c, resolution: 1, frame: new Rectangle(0, 0, tw * TILE, th * TILE) });
    base.destroy({ texture: true, textureSource: true });
    c.destroy({ children: true });
    const sp = new Sprite(tex);
    sp.position.set(x0 * TILE, y0 * TILE);
    const key = this.chunkKey(cx, cy);
    this.chunkNodeCount.set(key, nodes);
    this.chunkNodes.set(key, ids);
    return sp;
  }

  private dropChunk(k: string, sp: Sprite): void {
    sp.destroy({ texture: true }); this.chunks.delete(k); this.chunkNodes.delete(k); this.layers.terrain.removeChild(sp);
  }

  private refreshChunksIfNeeded(state: GameState): void {
    if (state.map.nodes.size === this.lastNodeCount) return;
    this.lastNodeCount = state.map.nodes.size;
    // Recontagem por chunk; chunks cuja contagem mudou ou cujo algum nó desenhado (inclusive na margem) sumiu são regenerados
    const counts = new Map<string, number>();
    for (const n of state.map.nodes.values()) { const k = this.chunkKey(Math.floor(n.x / CHUNK), Math.floor(n.y / CHUNK)); counts.set(k, (counts.get(k) ?? 0) + 1); }
    for (const [k, sp] of this.chunks) {
      if ((counts.get(k) ?? 0) !== (this.chunkNodeCount.get(k) ?? 0)) { this.dropChunk(k, sp); continue; }
      const ids = this.chunkNodes.get(k);
      if (ids) for (const id of ids) if (!state.map.nodes.has(id)) { this.dropChunk(k, sp); break; }
    }
  }

  private updateTerrain(state: GameState): void {
    this.refreshChunksIfNeeded(state);
    const v = this.cam.visibleTiles();
    const cx0 = Math.floor(v.x0 / CHUNK), cy0 = Math.floor(v.y0 / CHUNK), cx1 = Math.floor(Math.min(state.map.w - 1, v.x1) / CHUNK), cy1 = Math.floor(Math.min(state.map.h - 1, v.y1) / CHUNK);
    const wanted = new Set<string>();
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = this.chunkKey(cx, cy);
      wanted.add(k);
      if (!this.chunks.has(k)) { const sp = this.buildChunk(state, cx, cy); this.chunks.set(k, sp); this.layers.terrain.addChild(sp); }
    }
    // descarta chunks distantes quando há muitos em cache
    if (this.chunks.size > this.chunkCacheLimit) for (const [k, sp] of this.chunks) if (!wanted.has(k)) this.dropChunk(k, sp);
  }

  // ---------------- Fronteiras (linha fina + tingimento, por shader em fog.ts) ----------------
  private updateTerritory(state: GameState): void {
    const t = this.terr; if (!t) return;
    t.setZoom(this.cam.zoom);
    if (state.territoryVersion === this.terrVersion) return;
    this.terrVersion = state.territoryVersion;
    t.update(state.territory);
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
    this.updateTerrain(state);
    this.updateTerritory(state);
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
