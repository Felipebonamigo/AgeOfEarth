// Renderizador PixiJS: chunks de terreno, fronteiras, entidades interpoladas, efeitos, névoa e overlays.
import { Application, Container, Graphics, Sprite, Texture, Rectangle, Text, TextStyle } from 'pixi.js';
import { TILE, TICK_RATE, PLAYER_COLORS } from '../core/constants';
import { BUILDINGS, UNITS } from '../core/data';
import type { Building, GameState, Unit, VisualEffect } from '../core/types';
import { Camera } from './camera';
import { TextureCache, darken } from './textures';
import { getUnitStats, getBuildingStats } from '../core/sim/modifiers';

const CHUNK = 16;

interface EntityView { root: Container; body: Sprite; type: string; color: number; complete: boolean; angle: number; carry: Sprite | null; label?: Text }

export interface RenderUI {
  localPlayer: number;
  selection: Set<number>;
  hoverId: number;
  placement: { type: string; tx: number; ty: number; ok: boolean; tiles?: { x: number; y: number; ok: boolean }[] } | null;
  dragRect: { x0: number; y0: number; x1: number; y1: number } | null;
  showRanges: boolean;
  powerTarget: { radius: number } | null;
  mouseWorld: { x: number; y: number };
}

export class Renderer {
  app!: Application;
  tex!: TextureCache;
  cam = new Camera();
  world = new Container();
  layers = { terrain: new Container(), territory: new Container(), ground: new Graphics(), buildings: new Container(), units: new Container(), fx: new Container(), hp: new Graphics(), fog: new Container() };
  overlay = new Graphics();
  private chunks = new Map<string, Sprite>();
  private chunkNodeCount = new Map<string, number>();
  private views = new Map<number, EntityView>();
  private fogCanvas!: HTMLCanvasElement; private fogTex!: Texture; private fogSprite!: Sprite; private fogVersion = -1;
  private terrCanvas!: HTMLCanvasElement; private terrTex!: Texture; private terrSprite!: Sprite; private borders = new Graphics(); private terrVersion = -1;
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
    this.world.addChild(this.layers.terrain, this.layers.territory, this.layers.ground, this.layers.buildings, this.layers.units, this.layers.fx, this.layers.hp, this.layers.fog);
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
    this.chunks.clear(); this.chunkNodeCount.clear();
    for (const v of this.views.values()) v.root.destroy({ children: true });
    this.views.clear();
    for (const v of this.fxViews.values()) v.destroy({ children: true });
    this.fxViews.clear();
    for (const d of this.deathViews) d.c.destroy({ children: true });
    this.deathViews = [];
    this.layers.territory.removeChildren();
    this.layers.fog.removeChildren();
    const { w, h } = state.map;
    this.fogCanvas = document.createElement('canvas'); this.fogCanvas.width = w; this.fogCanvas.height = h;
    this.fogTex = Texture.from(this.fogCanvas); this.fogTex.source.scaleMode = 'linear';
    this.fogSprite = new Sprite(this.fogTex); this.fogSprite.width = w * TILE; this.fogSprite.height = h * TILE;
    this.layers.fog.addChild(this.fogSprite);
    this.terrCanvas = document.createElement('canvas'); this.terrCanvas.width = w; this.terrCanvas.height = h;
    this.terrTex = Texture.from(this.terrCanvas); this.terrTex.source.scaleMode = 'nearest';
    this.terrSprite = new Sprite(this.terrTex); this.terrSprite.width = w * TILE; this.terrSprite.height = h * TILE; this.terrSprite.alpha = 0.09;
    this.layers.territory.addChild(this.terrSprite, this.borders);
    this.fogVersion = -1; this.terrVersion = -1; this.lastNodeCount = -1;
    const start = state.map.starts[0];
    this.cam.zoom = 1.3;
    this.cam.centerOn(start.x, start.y);
  }

  resize(): void { this.cam.resize(this.app.screen.width, this.app.screen.height); }

  // ---------------- Terreno em chunks ----------------
  private chunkKey(cx: number, cy: number) { return `${cx},${cy}`; }
  private buildChunk(state: GameState, cx: number, cy: number): Sprite {
    const map = state.map;
    const c = new Container();
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    let nodes = 0;
    for (let y = y0; y < Math.min(map.h, y0 + CHUNK); y++) for (let x = x0; x < Math.min(map.w, x0 + CHUNK); x++) {
      const i = y * map.w + x;
      const s = new Sprite(this.tex.tile(map.terrain[i], map.decor[i] % 256));
      s.position.set((x - x0) * TILE, (y - y0) * TILE);
      c.addChild(s);
    }
    // Transições suaves entre terrenos (areia/grama/água) e espuma nas margens
    const blend = new Graphics();
    const TCOL: Record<number, number> = { 0: 0x5a9438, 1: 0x2f79b5, 2: 0x7f7e77, 3: 0xdccd93, 4: 0x927346, 5: 0x1f5a8f };
    for (let y = y0; y < Math.min(map.h, y0 + CHUNK); y++) for (let x = x0; x < Math.min(map.w, x0 + CHUNK); x++) {
      const t = map.terrain[y * map.w + x];
      const px = (x - x0) * TILE, py = (y - y0) * TILE;
      const nb: [number, number, number, number, number, number][] = [[x + 1, y, px + TILE - 8, py, 8, TILE], [x - 1, y, px, py, 8, TILE], [x, y + 1, px, py + TILE - 8, TILE, 8], [x, y - 1, px, py, TILE, 8]];
      for (const [nx, ny, rx, ry, rw, rh] of nb) {
        if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
        const nt = map.terrain[ny * map.w + nx];
        if (nt === t) continue;
        const water = t === 1 || t === 5, nwater = nt === 1 || nt === 5;
        if (water && !nwater) { blend.rect(rx, ry, rw, rh).fill({ color: 0xbfe3f7, alpha: 0.35 }); continue; }   // espuma
        if (!water && nwater) { blend.rect(rx, ry, rw, rh).fill({ color: 0xe9dfb0, alpha: 0.25 }); continue; }   // margem
        blend.rect(rx, ry, rw, rh).fill({ color: TCOL[nt] ?? 0x000000, alpha: 0.28 });
      }
    }
    c.addChild(blend);
    for (let y = y0; y < Math.min(map.h, y0 + CHUNK); y++) for (let x = x0; x < Math.min(map.w, x0 + CHUNK); x++) {
      const id = map.nodeAt[y * map.w + x];
      if (id === -1) continue;
      const n = map.nodes.get(id)!;
      const s = new Sprite(this.tex.node(n.type, map.decor[y * map.w + x] % 256));
      s.anchor.set(0.5, 0.6);
      s.position.set((x - x0 + 0.5) * TILE, (y - y0 + 0.5) * TILE);
      if (n.type === 'tree') { const k = 0.85 + (map.decor[y * map.w + x] % 40) / 100; s.scale.set(k); }
      c.addChild(s); nodes++;
    }
    const w = Math.min(map.w - x0, CHUNK) * TILE, h = Math.min(map.h - y0, CHUNK) * TILE;
    const tex = this.app.renderer.generateTexture({ target: c, resolution: 1, frame: new Rectangle(0, 0, w, h) });
    c.destroy({ children: true });
    const sp = new Sprite(tex);
    sp.position.set(x0 * TILE, y0 * TILE);
    this.chunkNodeCount.set(this.chunkKey(cx, cy), nodes);
    return sp;
  }

  private refreshChunksIfNeeded(state: GameState): void {
    if (state.map.nodes.size === this.lastNodeCount) return;
    this.lastNodeCount = state.map.nodes.size;
    // Recontagem por chunk; chunks cuja contagem mudou são regenerados
    const counts = new Map<string, number>();
    for (const n of state.map.nodes.values()) { const k = this.chunkKey(Math.floor(n.x / CHUNK), Math.floor(n.y / CHUNK)); counts.set(k, (counts.get(k) ?? 0) + 1); }
    for (const [k, sp] of this.chunks) {
      if ((counts.get(k) ?? 0) !== (this.chunkNodeCount.get(k) ?? 0)) { sp.destroy({ texture: true }); this.chunks.delete(k); this.layers.terrain.removeChild(sp); }
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
    if (this.chunks.size > 60) for (const [k, sp] of this.chunks) if (!wanted.has(k)) { sp.destroy({ texture: true }); this.chunks.delete(k); this.layers.terrain.removeChild(sp); }
  }

  // ---------------- Fronteiras ----------------
  private updateTerritory(state: GameState): void {
    if (state.territoryVersion === this.terrVersion) return;
    this.terrVersion = state.territoryVersion;
    const { w, h } = state.map;
    const ctx = this.terrCanvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < w * h; i++) {
      const o = state.territory[i];
      if (o < 0) continue;
      const c = PLAYER_COLORS[o % PLAYER_COLORS.length].num;
      d[i * 4] = (c >> 16) & 255; d[i * 4 + 1] = (c >> 8) & 255; d[i * 4 + 2] = c & 255; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.terrTex.source.update();
    const g = this.borders; g.clear();
    const t = state.territory;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = t[y * w + x];
      if (o < 0) continue;
      const c = PLAYER_COLORS[o % PLAYER_COLORS.length].num;
      const px = x * TILE, py = y * TILE;
      if (x === w - 1 || t[y * w + x + 1] !== o) g.moveTo(px + TILE, py).lineTo(px + TILE, py + TILE).stroke({ width: 2.5, color: c, alpha: 0.85 });
      if (x === 0 || t[y * w + x - 1] !== o) g.moveTo(px, py).lineTo(px, py + TILE).stroke({ width: 2.5, color: c, alpha: 0.85 });
      if (y === h - 1 || t[(y + 1) * w + x] !== o) g.moveTo(px, py + TILE).lineTo(px + TILE, py + TILE).stroke({ width: 2.5, color: c, alpha: 0.85 });
      if (y === 0 || t[(y - 1) * w + x] !== o) g.moveTo(px, py).lineTo(px + TILE, py).stroke({ width: 2.5, color: c, alpha: 0.85 });
    }
  }

  // ---------------- Névoa ----------------
  private updateFog(state: GameState, local: number): void {
    if (state.fogVersion === this.fogVersion) return;
    this.fogVersion = state.fogVersion;
    const { w, h } = state.map;
    const vis = state.players[local].visibility;
    const ctx = this.fogCanvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < w * h; i++) { const v = vis[i]; d[i * 4] = 4; d[i * 4 + 1] = 6; d[i * 4 + 2] = 14; d[i * 4 + 3] = v === 2 ? 0 : v === 1 ? 120 : 245; }
    ctx.putImageData(img, 0, 0);
    this.fogTex.source.update();
  }

  private visibleToLocal(state: GameState, local: number, e: Unit | Building): boolean {
    if (e.owner === local || state.config.revealMap) return true;
    const vis = state.players[local].visibility;
    const i = Math.floor(e.y) * state.map.w + Math.floor(e.x);
    if (i < 0 || i >= vis.length) return false;
    return e.kind === 'building' ? vis[i] >= 1 : vis[i] === 2;
  }

  // ---------------- Entidades ----------------
  private getView(e: Unit | Building, color: number): EntityView {
    let v = this.views.get(e.id);
    const complete = e.kind === 'building' ? e.complete : true;
    if (v && (v.type !== e.type || v.color !== color || v.complete !== complete)) { v.root.destroy({ children: true }); this.views.delete(e.id); v = undefined; }
    if (!v) {
      const root = new Container();
      const body = new Sprite(e.kind === 'unit' ? this.tex.unit(e.type, color) : this.tex.building(e.type, color, complete));
      body.anchor.set(0.5);
      root.addChild(body);
      v = { root, body, type: e.type, color, complete, angle: 0, carry: null };
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
      v.body.tint = state.tick - u.lastDamageTick < 3 ? 0xff8080 : (state.tick < state.players[u.owner].bronzeUntil ? 0xffd28a : 0xffffff);
      v.body.alpha = u.type === 'shade' ? 0.7 : 1;
      // carga
      if (u.carry && u.carryAmt > 0) {
        if (!v.carry) { v.carry = new Sprite(this.tex.disc(3.5, 0xffffff)); v.carry.anchor.set(0.5); v.root.addChild(v.carry); }
        v.carry.visible = true; v.carry.tint = u.carry === 'food' ? 0xef4444 : u.carry === 'wood' ? 0x92400e : 0xf2c14e;
        v.carry.position.set(-8, -8);
      } else if (v.carry) v.carry.visible = false;
      seen.add(u.id);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { const e = state.units.get(id) ?? state.buildings.get(id); if (!e) { v.root.destroy({ children: true }); this.views.delete(id); } else v.root.visible = false; }
  }

  // ---------------- Overlays: seleção, vida, construção, alcance, fantasma ----------------
  private updateGround(state: GameState, alpha: number, ui: RenderUI): void {
    const g = this.layers.ground; g.clear();
    const hp = this.layers.hp; hp.clear();
    const local = ui.localPlayer;
    for (const id of ui.selection) {
      const e = state.units.get(id) ?? state.buildings.get(id);
      if (!e) continue;
      const color = e.owner === local ? 0x8ff58f : state.players[e.owner].team === state.players[local].team ? 0xfde68a : 0xff7b7b;
      if (e.kind === 'unit') {
        const ix = e.px + (e.x - e.px) * alpha, iy = e.py + (e.y - e.py) * alpha;
        const r = UNITS[e.type].radius * TILE * 1.4;
        g.ellipse(ix * TILE, iy * TILE + r * 0.3, r, r * 0.6).stroke({ width: 2, color, alpha: 0.9 });
        if (ui.showRanges) { const st = getUnitStats(state, state.players[e.owner], e.type); if (st.range >= 1.6) g.circle(ix * TILE, iy * TILE, st.range * TILE).stroke({ width: 1, color: 0xffffff, alpha: 0.25 }); }
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
