// Sistema de efeitos do renderizador (docs/ART.md §1.9, §3.7 e Apêndice F — Etapa 5). A cada quadro:
//  1. confere a fonte das texturas (atlas `fx` assado ou o procedural de reserva; mudou → limpa tudo);
//  2. para cada VisualEffect do estado chama o handler do tipo (registry.ts): `create` na primeira vez, `update` a cada
//     quadro (t e p pelo relógio de JOGO, contínuos entre ticks) e `destroy` quando o núcleo o tira — sem `default`: um
//     tipo sem handler é avisado uma vez no console e contado em `unknown`;
//  3. o mesmo para os TimedEffect (tempestade, terremoto) e os observadores de flags (trégua, oráculo);
//  4. emissões contínuas pedidas pelo renderizador durante o quadro: poeira dos pés e cascos (`footstep`), fumaça e
//     fogo dos edifícios danificados (`buildingSmoke`, `buildingFire`);
//  5. avança as partículas (orçamento total por preset, com prioridade) e os decalques (vida, teto, névoa).
// O renderizador só lê o estado; nada aqui escreve nele.
import { Container } from 'pixi.js';
import { TILE, DT, TICK_RATE } from '../../core/constants';
import type { GameState, TimedEffect, VisualEffect } from '../../core/types';
import type { ArtLibrary } from '../art/ArtLibrary';
import { PARTICLE_BUDGET, type Quality } from '../quality';
import { ParticleSystem, PRIO } from '../particles';
import { DecalLayer } from '../decals';
import { FxTextures, FX_FAMILIES } from './FxTextures';
import { handlerFor, makeWatchers, timedHandlerFor } from './registry';
import type { FxContext, FxHandler, FxHost, FxWatcher, TimedHandler } from './types';
import { DECAL_CAP, DUST_MIN_ZOOM, effectAge, footDustRate, gaitOf, dustColor } from './logic';
import { embers, flame, smokePuffs } from './emitters';
import { terrainAt } from './handlers/util';

interface Inst { h: FxHandler<unknown>; s: unknown; t0: number }
interface TInst { h: TimedHandler<unknown>; s: unknown }
/** Visão da câmera em tiles (Camera.visibleTiles). */
export interface FxView { x0: number; y0: number; x1: number; y1: number }
/** Acumulador de emissão contínua guardado na vista da entidade (sem Map por unidade). */
export interface FxAcc { dust: number }

export interface FxFrame {
  state: GameState; local: number; clock: number; dt: number; zoom: number; baked: boolean; quality: Quality;
  view: FxView; revealAll: boolean;
}

export class FxSystem {
  readonly particles = new ParticleSystem();
  readonly decals = new DecalLayer();
  readonly tex: FxTextures;
  /** Raiz na camada `fx`: sprites dos efeitos (projéteis, quedas procedurais) → partículas normais → aditivas → brilho. */
  readonly root = new Container();
  private sprites = new Container();
  private glow = new Container();
  private live = new Map<VisualEffect, Inst>();
  private timed = new Map<TimedEffect, TInst>();
  private watchers: FxWatcher[] = makeWatchers();
  private warned = new Set<string>();
  /** Efeitos de tipo sem handler vistos (diagnóstico; o teste do registro garante 0 para o que o núcleo emite). */
  unknown = 0;
  private shakeReq = 0;
  private moving = 0; private movingPrev = 0;
  private host: FxHost | null = null;
  private ctx: FxContext;
  private frame: FxFrame | null = null;

  constructor(art: () => ArtLibrary | null) {
    this.tex = new FxTextures(art);
    this.root.addChild(this.sprites, this.particles.normal, this.particles.add, this.glow);
    this.root.eventMode = 'none';
    this.sprites.sortableChildren = false;
    const self = this;
    this.ctx = {
      state: null as unknown as GameState, local: 0, clock: 0, dt: 0, zoom: 1, baked: false, quality: null as unknown as Quality,
      particles: this.particles, decals: this.decals, tex: this.tex, layer: this.sprites, glowLayer: this.glow,
      get host(): FxHost { return self.host!; },
      visibleAt: (x, y) => this.visibleAt(x, y),
      onScreen: (x, y, m = 2) => this.onScreen(x, y, m),
      shake: (a) => { if (a > this.shakeReq) this.shakeReq = a; },
      decal: (name, x, y, o = {}) => this.addDecal(name, x, y, o),
    };
  }
  setHost(h: FxHost): void { this.host = h; }
  /** Orçamento do preset: partículas (PARTICLE_BUDGET) e decalques (DECAL_CAP). */
  setQuality(q: Quality): void {
    this.particles.budget = PARTICLE_BUDGET[q.particles] ?? 800;
    this.decals.cap = DECAL_CAP[q.particles] ?? 128;
  }

  // ---------------- visibilidade ----------------
  visibleAt(x: number, y: number): boolean {
    const f = this.frame; if (!f) return false;
    if (f.revealAll || f.state.config.revealMap) return true;
    const m = f.state.map, tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false;
    return f.state.players[f.local]?.visibility[ty * m.w + tx] === 2;
  }
  onScreen(x: number, y: number, margin = 2): boolean {
    const v = this.frame?.view; if (!v) return false;
    return x >= v.x0 - margin && x <= v.x1 + margin && y >= v.y0 - margin && y <= v.y1 + margin;
  }
  private addDecal(name: string, x: number, y: number, o: { rot?: number; size?: number; alpha?: number; life?: number; tint?: number }): void {
    const f = this.frame; if (!f) return;
    // nome de família ('decal/burn') → uma variante aleatória; nome de quadro ('decal/burn/1') → ele mesmo
    const tex = FX_FAMILIES[name] ? this.tex.pick(name) : this.tex.frame(name);
    const w = tex.orig?.width || 64;
    const blend = name.startsWith('decal/debris') ? 'normal' : 'multiply';
    this.decals.add({ tex, x: x * TILE, y: y * TILE, rot: o.rot, scale: (o.size ?? w) / w, alpha: o.alpha, life: o.life ?? 30, blend, tint: o.tint }, f.clock, this.visibleAt(x, y));
  }

  // ---------------- quadro ----------------
  /** Começo do quadro (antes das vistas): o número de unidades andando na tela do quadro anterior decide a densidade da
   *  poeira dos pés. */
  beginFrame(f: FxFrame): void {
    this.frame = f;
    const c = this.ctx;
    c.state = f.state; c.local = f.local; c.clock = f.clock; c.dt = f.dt; c.zoom = f.zoom; c.baked = f.baked; c.quality = f.quality;
    if (this.tex.refresh()) this.reset(true);
    this.movingPrev = this.moving; this.moving = 0;
  }

  /**
   * Poeira dos pés/cascos/rodas de uma unidade à vista andando a `speed` tiles/s na direção (dx, dy): baforadas no chão,
   * na cor do terreno, empurradas para trás; densidade pela velocidade e pelo número de unidades andando na tela
   * (footDustRate). `acc` = acumulador guardado na vista.
   */
  footstep(acc: FxAcc, type: string, x: number, y: number, speed: number, dx: number, dy: number): void {
    const f = this.frame; if (!f || f.dt <= 0 || f.zoom < DUST_MIN_ZOOM) return;
    this.moving++;
    const gait = gaitOf(type);
    const terrain = terrainAt(f.state, x, y);
    acc.dust += footDustRate(gait, speed, this.movingPrev, terrain) * f.dt;
    if (acc.dust < 1) return;
    const n = Math.floor(acc.dust); acc.dust -= n;
    const l = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / l, uy = dy / l;
    const big = gait === 'hoof' || gait === 'wheel';
    // legível a zoom 1: o cavalo a galope levanta uma nuvem clara que se vê; o passo, um pó discreto
    const tint = dustColor(terrain), alpha = (terrain === 0 ? 0.42 : 0.55) * (big ? 1.15 : 1);
    for (let i = 0; i < n; i++) {
      const s = (big ? 0.5 : 0.34) * (0.8 + Math.random() * 0.4);
      const side = (Math.random() - 0.5) * (big ? 10 : 5);
      if (!this.particles.emit({
        frames: [this.tex.pick('dust')], blend: 'normal', prio: PRIO.ambient, group: 'dust',
        x: x * TILE - ux * 4 - uy * side, y: y * TILE - uy * 3 + ux * side * 0.6 + 1, z: 1,
        vx: -ux * speed * 5 + (Math.random() - 0.5) * 6, vy: -uy * speed * 3 + (Math.random() - 0.5) * 4, vz: 3 + Math.random() * 5, drag: 2.5, wind: 0.5,
        life: (big ? 1.2 : 0.9) * (0.8 + Math.random() * 0.4), scale0: s, scale1: s * 2.5, alpha0: alpha, alpha1: 0, fadeIn: 0.1, tint, rot: Math.random() * 6.28,
      })) return;
    }
  }
  /** Fumaça de edifício danificado (Etapa 3, mesma receita): `n` baforadas no retângulo (px de mundo). */
  buildingSmoke(n: number, x0: number, x1: number, y0: number, y1: number, dark: boolean): number {
    return smokePuffs(this.particles, this.tex, n, x0, x1, y0, y1, dark);
  }
  /** Chamas (flipbook `fire`) no telhado de um edifício muito danificado: `rate`/s acumulado em `acc`; retângulo em px. */
  buildingFire(acc: FxAcc, rate: number, x0: number, x1: number, y0: number, y1: number): void {
    const f = this.frame; if (!f || f.dt <= 0) return;
    acc.dust += rate * f.dt;
    if (acc.dust < 1) return;
    const n = Math.floor(acc.dust); acc.dust -= n;
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.random() * (x1 - x0), y = y0 + Math.random() * (y1 - y0);
      if (!flame(this.particles, this.tex, x, y, 0, 0.5 + Math.random() * 0.3, 0.7 + Math.random() * 0.45, PRIO.ambient, 'fire')) return;
      if (Math.random() < 0.3) embers(this.particles, this.tex, x, y - 6, 0, 1, PRIO.ambient, 'fire');
    }
  }

  /** Efeitos do estado, poderes com duração, observadores, partículas e decalques. Devolve o tremor pedido (px). */
  update(): number {
    const f = this.frame; if (!f) return 0;
    const ctx = this.ctx, st = f.state;
    this.shakeReq = 0;
    const seen = this.seenSet; seen.clear();
    for (const e of st.effects) {
      seen.add(e);
      let inst = this.live.get(e);
      if (!inst) {
        const h = handlerFor(e.type);
        if (!h) { this.unknownType(e.type); continue; }
        const age = effectAge(e, TICK_RATE);
        inst = { h, s: h.create(e, ctx, age), t0: f.clock - age };
        this.live.set(e, inst);
      }
      if (inst.h.update) {
        const t = f.clock - inst.t0, dur = Math.max(DT, e.total / TICK_RATE);
        inst.h.update(e, inst.s, ctx, t, Math.max(0, Math.min(1, t / dur)));
      }
    }
    for (const [e, inst] of this.live) if (!seen.has(e)) { inst.h.destroy?.(e, inst.s, ctx, true); this.live.delete(e); }
    // poderes com duração
    const tseen = this.tseenSet; tseen.clear();
    for (const t of st.timed) {
      tseen.add(t);
      let inst = this.timed.get(t);
      if (!inst) {
        const h = timedHandlerFor(t.type);
        if (!h) { this.unknownType(`timed:${t.type}`); continue; }
        inst = { h, s: h.create(t, ctx) };
        this.timed.set(t, inst);
      }
      inst.h.update?.(t, inst.s, ctx);
    }
    for (const [t, inst] of this.timed) if (!tseen.has(t)) { inst.h.destroy?.(t, inst.s, ctx); this.timed.delete(t); }
    for (const w of this.watchers) w.update(ctx);
    this.particles.update(f.dt);
    const vis = st.players[f.local]?.visibility ?? null;
    this.decals.update(f.clock, vis, st.map.w, f.revealAll || !!st.config.revealMap);
    return this.shakeReq;
  }
  private seenSet = new Set<VisualEffect>();
  private tseenSet = new Set<TimedEffect>();
  private unknownType(type: string): void {
    this.unknown++;
    if (this.warned.has(type)) return;
    this.warned.add(type);
    console.warn(`[efeitos] tipo sem handler: ${type} (registre em src/render/fx/registry.ts)`);
  }

  /** Refaz as instâncias cujo estado `stale` aponta (ex.: queda assada numa escala que deixou de ser servida): saem agora
   *  e são recriadas no próximo quadro. */
  recreate(stale: (e: VisualEffect, s: unknown) => boolean): void {
    for (const [e, inst] of this.live) if (stale(e, inst.s)) { inst.h.destroy?.(e, inst.s, this.ctx, false); this.live.delete(e); }
  }
  /** Tira tudo (troca de partida ou de arte). `sourceChanged`: a fonte das texturas mudou (os lotes esquecem a antiga). */
  reset(sourceChanged = false): void {
    for (const [e, inst] of this.live) inst.h.destroy?.(e, inst.s, this.ctx, false);
    this.live.clear();
    for (const [t, inst] of this.timed) inst.h.destroy?.(t, inst.s, this.ctx);
    this.timed.clear();
    for (const w of this.watchers) w.reset?.();
    this.particles.clear(sourceChanged);
    this.decals.clear(sourceChanged);
    this.sprites.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.glow.removeChildren().forEach((c) => c.destroy({ children: true }));
  }
  /** Editor: o chão mudou no retângulo de tiles (decalques dali saem). */
  clearRect(x0: number, y0: number, x1: number, y1: number): void { this.decals.clearRect(x0, y0, x1, y1); }
  /** Diagnóstico (?perf=1, scripts de captura). */
  stats(): { particles: number; budget: number; peak: number; dropped: number; decals: number; decalCap: number; effects: number; unknown: number; source: string } {
    return { particles: this.particles.count, budget: this.particles.budget, peak: this.particles.peak, dropped: this.particles.dropped, decals: this.decals.count, decalCap: this.decals.cap, effects: this.live.size, unknown: this.unknown, source: this.tex.source };
  }
}
