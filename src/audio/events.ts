// Áudio posicional a partir do estado: a cada quadro lê os efeitos visuais novos (state.effects) e os eventos novos
// (state.events), escolhe a receita, atenua pela distância ao centro da câmera (fora da tela atenua forte e abafa),
// faz pan estéreo por x e respeita a névoa do jogador local. Muitos golpes no mesmo quadro viram a camada de
// "batalha" (clamor + choques esparsos com intensidade), não dezenas de sons iguais. Trabalho (machado, picareta,
// martelo, colheita), marcha, cascos e fogo vêm de amostragens periódicas das unidades visíveis perto do centro.
// As funções puras (receita por efeito, espacialização, agregação) são testadas em tests/audio.test.ts.
import type { GameEvent, GameState, Unit, VisualEffect } from '../core/types';
import { UNITS } from '../core/data';
import type { AudioEngine } from './engine';
import { RECIPES, RECIPE_CATEGORY, RECIPE_REVERB, type RecipeName } from './sfx';
import { chooseIntensity, type IntensityState, type Music } from './music';
import { sampleBiome, type Ambience, type BiomeMix } from './ambience';
import { rnd, vary } from './synth';

export interface ListenerView { x0: number; y0: number; x1: number; y1: number; zoom: number }
export interface Spatial { gain: number; pan: number; muffle: number; reverb: number }
export interface Cue { recipe: RecipeName; x: number; y: number; delay?: number; gain?: number; global?: boolean }
export interface Placed { cue: Cue; sp: Spatial; cat: string }

/** Categorias de combate: agregadas por quadro e somadas na intensidade de batalha. */
export const COMBAT_CATS: ReadonlySet<string> = new Set(['melee', 'bow', 'arrow', 'impact', 'siege', 'death']);

/** Vista em tiles a partir da câmera do renderizador (tipo estrutural para não depender de src/render). */
export function viewFromCamera(cam: { width: number; height: number; zoom: number; screenToWorld(sx: number, sy: number): { x: number; y: number } }): ListenerView {
  const a = cam.screenToWorld(0, 0); const b = cam.screenToWorld(cam.width, cam.height);
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y, zoom: cam.zoom };
}

/**
 * Ganho/pan/abafamento de um som em (x, y) para a vista: dentro da tela perde no máx. 30 % na borda; fora dela cai
 * rápido (≈ 20 % a meia tela de distância, ≈ 7 % a uma tela) e some além de 2,5 telas. Zoom afastado soa mais distante.
 */
export function spatialize(x: number, y: number, v: ListenerView): Spatial | null {
  const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
  const hw = Math.max(1, (v.x1 - v.x0) / 2), hh = Math.max(1, (v.y1 - v.y0) / 2);
  const dx = (x - cx) / hw, dy = (y - cy) / hh;
  const nd = Math.max(Math.abs(dx), Math.abs(dy));
  if (nd > 2.5) return null;
  let gain = nd <= 1 ? 1 - 0.3 * nd * nd : 0.7 / (1 + ((nd - 1) * 3) ** 2);
  gain *= Math.min(1.1, 0.45 + 0.55 * v.zoom);
  return { gain, pan: Math.max(-1, Math.min(1, dx)) * 0.75, muffle: nd <= 1 ? 0 : Math.min(0.85, (nd - 1) * 0.9), reverb: 0.1 + Math.min(0.4, nd * 0.15) };
}

/** Morte por tipo de unidade: voador, cavalo, criatura/titã, cerco (madeira) ou humano. */
export function deathRecipe(type: string | number | undefined): RecipeName {
  const def = typeof type === 'string' ? UNITS[type] : undefined;
  if (!def) return 'deathHuman';
  if (def.flying) return 'deathWing';
  if (def.cls === 'cavalry' || def.cls === 'scout') return 'deathHorse';
  if (def.cls === 'myth' || def.cls === 'titan') return 'deathMyth';
  if (def.cls === 'siege') return 'treeFall';
  return 'deathHuman';
}

/** Receita(s) de um efeito visual novo. Projéteis tocam na origem (arco/catapulta) e o impacto chega atrasado no alvo. */
export function cuesForEffect(fx: VisualEffect): Cue[] {
  switch (fx.type) {
    case 'projectile':
      if (fx.data === 'rock') return [{ recipe: 'catapult', x: fx.x, y: fx.y }];
      if (fx.data === 'bolt') return [{ recipe: 'mythShot', x: fx.x, y: fx.y }];
      return [{ recipe: 'bow', x: fx.x, y: fx.y, gain: 0.8 }, { recipe: 'arrowImpact', x: fx.tx ?? fx.x, y: fx.ty ?? fx.y, delay: 0.3 }];
    case 'hit': return [{ recipe: 'melee', x: fx.x, y: fx.y }];
    case 'splash': return [{ recipe: 'stoneImpact', x: fx.x, y: fx.y, delay: 0.35 }];
    case 'death': return [{ recipe: deathRecipe(fx.data), x: fx.x, y: fx.y, gain: 0.8 }];
    case 'collapse': return [{ recipe: 'collapse', x: fx.x, y: fx.y }];
    case 'spawn': return [{ recipe: 'summon', x: fx.x, y: fx.y }];
    case 'heal': return [{ recipe: 'heal', x: fx.x, y: fx.y }];
    case 'bolt': return [{ recipe: 'zeusBolt', x: fx.x, y: fx.y }];
    case 'quake': return [{ recipe: 'quake', x: fx.x, y: fx.y }];
    case 'titanRise': return [{ recipe: 'titanRise', x: fx.x, y: fx.y, gain: 1.2 }];
    case 'ability': return [{ recipe: 'ability', x: fx.x, y: fx.y }];
    case 'curse': return [{ recipe: 'curse', x: fx.x, y: fx.y }];
    case 'pestilence': return [{ recipe: 'pestilence', x: fx.x, y: fx.y }];
    case 'petrify': return [{ recipe: 'petrify', x: fx.x, y: fx.y }];
    case 'bronze': return [{ recipe: 'bronzeRing', x: 0, y: 0, global: true }];
    case 'nodeGone': return fx.data === 'tree' ? [{ recipe: 'treeFall', x: fx.x, y: fx.y, gain: 0.7 }] : fx.data === 'gold' ? [{ recipe: 'rockCrumble', x: fx.x, y: fx.y }] : [];
    default: return [];
  }
}

/**
 * Agregação de um quadro: por categoria de combate, só os `maxEach` mais altos tocam individualmente; o resto vira
 * intensidade de batalha (soma dos ganhos). Categorias fora do combate passam todas (o motor ainda limita vozes).
 */
export function aggregateCombat(items: Placed[], maxEach = 2): { play: Placed[]; overflow: number; intensity: number } {
  const play: Placed[] = []; const byCat = new Map<string, Placed[]>();
  let intensity = 0;
  for (const it of items) {
    if (!COMBAT_CATS.has(it.cat)) { play.push(it); continue; }
    intensity += it.sp.gain;
    const arr = byCat.get(it.cat); if (arr) arr.push(it); else byCat.set(it.cat, [it]);
  }
  let overflow = 0;
  for (const arr of byCat.values()) {
    arr.sort((a, b) => b.sp.gain - a.sp.gain);
    play.push(...arr.slice(0, maxEach)); overflow += Math.max(0, arr.length - maxEach);
  }
  return { play, overflow, intensity };
}

/** Receita e período (s) do som de trabalho de uma unidade parada coletando/construindo. */
export function workRecipe(state: 'gather' | 'build', nodeType: string | null): { recipe: RecipeName; period: number } | null {
  if (state === 'build') return { recipe: 'hammer', period: 0.9 };
  if (nodeType === 'tree') return { recipe: 'axe', period: 1.3 };
  if (nodeType === 'gold') return { recipe: 'pick', period: 1.15 };
  if (nodeType === 'berry' || nodeType === 'farm') return { recipe: 'rustle', period: nodeType === 'farm' ? 2.2 : 1.7 };
  if (nodeType === 'deer' || nodeType === 'boar' || nodeType === 'lure') return { recipe: 'rustle', period: 2.4 };
  return null;
}

/** Classe de passada de uma unidade que se move: pés, cascos ou passos pesados. */
export function gaitOf(type: string): 'foot' | 'hoof' | 'heavy' | null {
  const d = UNITS[type]; if (!d) return null;
  if (d.flying) return null;
  if (d.cls === 'cavalry' || d.cls === 'scout' || type === 'centaur') return 'hoof';
  if (d.cls === 'titan' || d.cls === 'siege' || (d.cls === 'myth' && d.radius >= 0.55)) return 'heavy';
  return 'foot';
}

export interface WorldInput { state: GameState; local: number; view: ListenerView; revealAll: boolean; paused: boolean; editor: boolean }

/** Clamor de batalha: laço de ruído em faixa de vozes/metal + choques esparsos com a intensidade. */
const battleClash = RECIPES.clash;

export class AudioDirector {
  private state: GameState | null = null;
  private seenFx = new WeakSet<VisualEffect>();
  private lastEvent: GameEvent | null = null;
  private usedPowers: Set<string>[] = [];
  private workNext = new Map<number, number>();
  private workAcc = 0; private moveAcc = 0; private biomeAcc = 99; private fireAcc = 0;
  private marchNext = 0; private hoofNext = 0; private heavyNext = 0;
  private march = { foot: 0, hoof: 0, heavy: 0, pan: 0, gain: 0 };
  /** Golpes visíveis por segundo (ponderados pelo ganho), suavizado. */
  battle = 0;
  private battlePan = 0;
  private bed: { gain: GainNode; pan: StereoPannerNode } | null = null;
  private nextBattleClash = 0;
  private attackedUntil = 0; private lastHorn = -99;
  score = 0;
  /** Sons pedidos pelos efeitos antes da agregação, por categoria (estatística para testes). */
  readonly cues: Record<string, number> = {};
  intensity: IntensityState = { current: 'peace', calm: 0 };
  /** Multiplica os tempos de calma antes de a música baixar de intensidade (testes aceleram). */
  holdScale = 1;
  private mix: BiomeMix | null = null;
  private lastNow = 0; private pendingHits = 0;
  constructor(private engine: AudioEngine, private music: Music, private ambience: Ambience) {}

  /** Quadro sem partida (menu): tema do menu e ambiente costeiro. */
  menu(): void { this.state = null; this.music.set('menu', 'peace', 0); this.music.update(); this.ambience.update(null); this.bedLevel(0); }

  update(frameDt: number, w: WorldInput): void {
    const e = this.engine; const st = w.state;
    if (st !== this.state) this.reset(st);
    const running = e.running; const now = e.now;
    // Tempo real pelo relógio do áudio (o dt do quadro é limitado a 0,1 s e atrasaria a música em máquinas lentas)
    const dt = running && this.lastNow > 0 ? Math.max(0, Math.min(0.5, now - this.lastNow)) : frameDt;
    this.lastNow = running ? now : 0;
    const vis = w.revealAll || st.config.revealMap ? null : st.players[w.local]?.visibility ?? null;
    const visible = (x: number, y: number) => { if (!vis) return true; const tx = Math.floor(x), ty = Math.floor(y); if (tx < 0 || ty < 0 || tx >= st.map.w || ty >= st.map.h) return false; return vis[ty * st.map.w + tx] === 2; };
    // ---- efeitos novos ----
    const placed: Placed[] = [];
    for (const fx of st.effects) {
      if (this.seenFx.has(fx)) continue;
      this.seenFx.add(fx);
      if (!running) continue;
      for (const cue of cuesForEffect(fx)) {
        if (cue.global) { if (fx.owner === w.local) placed.push({ cue, sp: { gain: 0.8, pan: 0, muffle: 0, reverb: 0.3 }, cat: RECIPE_CATEGORY[cue.recipe] }); continue; }
        // projétil: audível se a origem ou o alvo estiver visível
        if (!visible(cue.x, cue.y) && !(fx.type === 'projectile' && (visible(fx.x, fx.y) || visible(fx.tx ?? -1, fx.ty ?? -1)))) continue;
        const sp = spatialize(cue.x, cue.y, w.view); if (!sp) continue;
        placed.push({ cue, sp, cat: RECIPE_CATEGORY[cue.recipe] });
      }
    }
    for (const p of placed) this.cues[p.cat] = (this.cues[p.cat] ?? 0) + 1;
    const agg = aggregateCombat(placed, 2);
    for (const p of agg.play) this.fire(p);
    // intensidade de batalha: golpes/s ponderados, média exponencial (~1,5 s)
    this.pendingHits += agg.intensity;   // quadros com dt = 0 (mesmo quantum de áudio) acumulam para o próximo
    if (dt > 0) {
      const inst = this.pendingHits / Math.max(dt, 1 / 60); this.pendingHits = 0;
      this.battle += (inst - this.battle) * (1 - Math.exp(-dt / 1.5));
    }
    if (agg.intensity > 0) { let sx = 0, sw = 0; for (const p of placed) if (COMBAT_CATS.has(p.cat)) { sx += p.sp.pan * p.sp.gain; sw += p.sp.gain; } if (sw > 0) this.battlePan += (sx / sw - this.battlePan) * 0.3; }
    // ---- eventos novos ----
    for (const ev of this.newEvents(st)) this.onEvent(ev, w, visible);
    if (running) {
      this.bedUpdate(now);
      // ---- trabalho, marcha e fogo (amostragem periódica) ----
      this.workAcc += dt; this.moveAcc += dt; this.fireAcc += dt;
      if (!w.paused && this.workAcc >= 0.2) { this.workAcc = 0; this.work(w, visible, now); }
      if (!w.paused && this.moveAcc >= 0.25) { this.moveAcc = 0; this.sampleMarch(w, visible); }
      if (w.paused) this.march.foot = this.march.hoof = this.march.heavy = 0;
      this.playMarch(now);
      if (!w.paused && this.fireAcc >= 2) { this.fireAcc = 0; this.fires(w, visible); }
    }
    // ---- música: combate visível + ataques sofridos ----
    this.score = this.battle + (now < this.attackedUntil ? 0.5 : 0);
    this.intensity = chooseIntensity(this.intensity, this.score, dt, this.holdScale);
    const age = st.players[w.local]?.age ?? 0;
    this.music.set('game', w.editor ? 'peace' : this.intensity.current, age);
    this.music.update();
    // ---- ambiente por bioma sob a câmera (a cada 0,5 s) ----
    this.biomeAcc += dt;
    if (this.biomeAcc >= 0.5) { this.biomeAcc = 0; this.mix = sampleBiome(st.map, w.view, vis); }
    this.ambience.update(this.mix);
  }
  private reset(st: GameState): void {
    this.state = st;
    this.seenFx = new WeakSet();
    for (const fx of st.effects) this.seenFx.add(fx);            // efeitos já existentes (save carregado) não tocam
    this.lastEvent = st.events.length ? st.events[st.events.length - 1] : null;
    this.usedPowers = st.players.map((p) => new Set(p.powers.filter((x) => x.used).map((x) => x.id)));
    this.workNext.clear(); this.battle = 0; this.intensity = { current: 'peace', calm: 0 }; this.attackedUntil = 0; this.biomeAcc = 99;
  }

  /** Eventos após o último visto (por identidade: o núcleo descarta os antigos acima de 200 e os índices andam). */
  private newEvents(st: GameState): GameEvent[] {
    const evs = st.events; if (!evs.length) return [];
    let from = 0;
    if (this.lastEvent) { const i = evs.lastIndexOf(this.lastEvent); from = i >= 0 ? i + 1 : 0; }
    this.lastEvent = evs[evs.length - 1];
    return from < evs.length ? evs.slice(from) : [];
  }

  private fire(p: Placed, extraDelay = 0): void {
    const { cue, sp, cat } = p;
    this.engine.play(cat, RECIPES[cue.recipe], { gain: sp.gain * (cue.gain ?? 1), pan: sp.pan, muffle: sp.muffle, reverb: Math.max(sp.reverb, RECIPE_REVERB[cue.recipe] ?? 0), delay: (cue.delay ?? 0) + extraDelay, priority: cat === 'power' ? 3 : cat === 'death' || cat === 'collapse' ? 2 : 1 });
  }
  private cueAt(recipe: RecipeName, x: number, y: number, w: WorldInput, minGain = 0, gain = 1): void {
    const sp = spatialize(x, y, w.view) ?? { gain: 0, pan: 0, muffle: 0.8, reverb: 0.4 };
    const g = Math.max(minGain, sp.gain) * gain; if (g <= 0.01) return;
    this.fire({ cue: { recipe, x, y }, sp: { ...sp, gain: g }, cat: RECIPE_CATEGORY[recipe] });
  }
  private ui(recipe: RecipeName, gain = 1): void { this.engine.play(RECIPE_CATEGORY[recipe], RECIPES[recipe], { bus: 'ui', gain, reverb: RECIPE_REVERB[recipe] ?? 0.1, exempt: true, priority: 4 }); }

  private onEvent(ev: GameEvent, w: WorldInput, visible: (x: number, y: number) => boolean): void {
    const mine = ev.player === w.local; const now = this.engine.now;
    const at = ev.x !== undefined && ev.y !== undefined;
    switch (ev.type) {
      case 'underAttack':
        if (!mine) return;
        this.attackedUntil = now + 12;
        if (now - this.lastHorn > 8) { this.lastHorn = now; this.ui('alertHorn', 0.9); }
        return;
      case 'built': if (mine && at) this.cueAt('built', ev.x!, ev.y!, w, 0.55); return;
      case 'research': if (mine) this.ui('research', 0.8); return;
      case 'age': if (mine) this.ui('ageUp'); else this.ui('ageOther', 0.7); return;
      case 'heroDied': if (mine) this.ui('toll', 0.8); return;
      case 'titan': this.ui('toll', 0.9); return;
      case 'defeated': if (!mine) this.ui('toll', 0.6); return;
      case 'wonder': this.ui('divine', 0.8); return;
      case 'relic': if (mine) this.ui('research', 0.7); return;
      case 'ceasefire': this.ui('built', 0.7); return;
      case 'powerUsed': {
        const p = w.state.players[ev.player];
        const prev = this.usedPowers[ev.player] ?? new Set<string>();
        // o evento traz o id do poder (G11: um poder reposto pelo roteiro pode ser usado de novo); saves antigos: pelo que ficou gasto
        const fresh = ev.data ? [ev.data] : p ? p.powers.filter((x) => x.used && !prev.has(x.id)).map((x) => x.id) : [];
        this.usedPowers[ev.player] = new Set(p?.powers.filter((x) => x.used).map((x) => x.id) ?? []);
        if (mine) this.ui('divine', 0.7);
        if (at && (visible(ev.x!, ev.y!) || mine)) {
          if (fresh.includes('lure')) this.cueAt('waves', ev.x!, ev.y!, w, mine ? 0.5 : 0);   // Poseidon: ondas
          if (fresh.includes('plenty') || fresh.includes('oracle')) this.cueAt('summon', ev.x!, ev.y!, w, mine ? 0.4 : 0, 0.7);
        }
        return;
      }
    }
  }

  // ---------------- Camada de batalha ----------------
  private bedLevel(level: number): void {
    if (!this.bed) return;
    const now = this.engine.now;
    this.bed.gain.gain.setTargetAtTime(level, now, level > 0.01 ? 0.6 : 1.2);
  }
  private bedUpdate(now: number): void {
    const lvl = Math.max(0, Math.min(1, (this.battle - 1.2) / 6));     // começa com ~1,2 golpes/s visíveis
    if (lvl > 0 && !this.bed) this.buildBed();
    if (this.bed) { this.bedLevel(lvl * 0.35); this.bed.pan.pan.setTargetAtTime(this.battlePan * 0.6, now, 0.5); }
    // choques esparsos (dão textura sem 50 sons iguais): até ~6/s com a intensidade
    if (lvl > 0.05 && now >= this.nextBattleClash) {
      this.nextBattleClash = now + 1 / (1 + 5 * lvl) * rnd(0.5, 1.5);
      const pan = Math.max(-1, Math.min(1, this.battlePan + rnd(-0.4, 0.4)));
      const r = Math.random();
      const recipe = r < 0.55 ? battleClash : r < 0.8 ? RECIPES.shieldWood : RECIPES.flesh;
      this.engine.play('battle', recipe, { gain: 0.25 + 0.35 * lvl * rnd(0.4, 1), pan, muffle: rnd(0.2, 0.6), reverb: 0.3, priority: 0 });
    }
  }
  private buildBed(): void {
    const e = this.engine; const ctx = e.ctx;
    const src = ctx.createBufferSource(); src.buffer = e.noise('pink'); src.loop = true;
    // clamor: faixa das vozes (formantes largos) + brilho metálico abafado
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 650; f1.Q.value = 0.9;
    const f2 = ctx.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 2600; f2.Q.value = 1.2; f2.gain.value = 4;
    const am = ctx.createGain(); am.gain.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.7; const lg = ctx.createGain(); lg.gain.value = 0.3; lfo.connect(lg); lg.connect(am.gain); lfo.start();
    const gain = ctx.createGain(); gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    src.connect(f1); f1.connect(f2); f2.connect(am); am.connect(gain); gain.connect(pan);
    const bus = e.input('sfx'); pan.connect(bus.dry); const send = ctx.createGain(); send.gain.value = 0.3; pan.connect(send); send.connect(bus.wet);
    src.start();
    this.bed = { gain, pan };
    e.count('battleBed');
  }

  // ---------------- Trabalho ----------------
  private work(w: WorldInput, visible: (x: number, y: number) => boolean, now: number): void {
    const st = w.state; const v = w.view;
    const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2, hw = (v.x1 - v.x0) / 2, hh = (v.y1 - v.y0) / 2;
    if (w.view.zoom < 0.5) return;                                  // muito longe: sem detalhe de trabalho
    const cands: { u: Unit; d: number; r: { recipe: RecipeName; period: number } }[] = [];
    for (const u of st.units.values()) {
      if (u.dead || u.inside !== -1 || (u.state !== 'gather' && u.state !== 'build')) continue;
      if (u.x !== u.px || u.y !== u.py) continue;                   // andando até o recurso: ainda não trabalha
      const dx = (u.x - cx) / hw, dy = (u.y - cy) / hh; const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d > 0.8 || !visible(u.x, u.y)) continue;
      const nodeType = u.state === 'gather' ? (u.nodeId < 0 ? 'farm' : st.map.nodes.get(u.nodeId)?.type ?? null) : null;
      const r = workRecipe(u.state, nodeType); if (!r) continue;
      cands.push({ u, d, r });
    }
    cands.sort((a, b) => a.d - b.d);
    const keep = new Set<number>();
    for (const c of cands.slice(0, 4)) {
      keep.add(c.u.id);
      const next = this.workNext.get(c.u.id);
      if (next === undefined) { this.workNext.set(c.u.id, now + Math.random() * c.r.period); continue; }   // fase aleatória
      if (now < next) continue;
      this.workNext.set(c.u.id, now + vary(c.r.period, 0.15));
      const sp = spatialize(c.u.x, c.u.y, v); if (!sp) continue;
      this.engine.play('work', RECIPES[c.r.recipe], { gain: sp.gain * 0.55, pan: sp.pan, muffle: sp.muffle, reverb: 0.12, priority: 0 });
    }
    for (const id of this.workNext.keys()) if (!keep.has(id)) this.workNext.delete(id);
  }

  // ---------------- Marcha, cascos e passos pesados ----------------
  private sampleMarch(w: WorldInput, visible: (x: number, y: number) => boolean): void {
    const st = w.state; const v = w.view;
    const cx = (v.x0 + v.x1) / 2, hw = (v.x1 - v.x0) / 2, cy = (v.y0 + v.y1) / 2, hh = (v.y1 - v.y0) / 2;
    let foot = 0, hoof = 0, heavy = 0, sx = 0;
    for (const u of st.units.values()) {
      if (u.dead || u.inside !== -1 || (u.x === u.px && u.y === u.py)) continue;
      const dx = (u.x - cx) / hw, dy = (u.y - cy) / hh; if (Math.max(Math.abs(dx), Math.abs(dy)) > 1.1 || !visible(u.x, u.y)) continue;
      const g = gaitOf(u.type); if (!g) continue;
      if (g === 'foot') foot++; else if (g === 'hoof') hoof++; else heavy++;
      sx += Math.max(-1, Math.min(1, dx));
    }
    const n = foot + hoof + heavy;
    this.march = { foot, hoof, heavy, pan: n ? (sx / n) * 0.7 : 0, gain: Math.min(1.1, 0.45 + 0.55 * v.zoom) };
  }
  private playMarch(now: number): void {
    const m = this.march;
    if (m.foot >= 4 && now >= this.marchNext) {
      this.marchNext = now + vary(0.42, 0.1);
      const k = Math.min(1, (m.foot - 3) / 20);
      this.engine.play('march', RECIPES.march, { gain: (0.2 + 0.3 * k) * m.gain, pan: m.pan, reverb: 0.1, priority: 0 }, k);
    }
    if (m.hoof >= 2 && now >= this.hoofNext) {
      this.hoofNext = now + vary(0.85, 0.1);
      this.engine.play('hooves', RECIPES.hooves, { gain: (0.25 + 0.25 * Math.min(1, m.hoof / 10)) * m.gain, pan: m.pan, reverb: 0.1, priority: 0 }, Math.min(1, m.hoof / 8));
    }
    if (m.heavy >= 1 && now >= this.heavyNext) {
      this.heavyNext = now + vary(1.1, 0.1);
      this.engine.play('march', RECIPES.heavyStep, { gain: 0.35 * m.gain, pan: m.pan, reverb: 0.2, priority: 0 });
    }
  }

  // ---------------- Fogo em edifícios danificados ----------------
  private fires(w: WorldInput, visible: (x: number, y: number) => boolean): void {
    const st = w.state; let best: { x: number; y: number; d: number } | null = null;
    const v = w.view; const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2, hw = (v.x1 - v.x0) / 2, hh = (v.y1 - v.y0) / 2;
    for (const b of st.buildings.values()) {
      if (b.dead || !b.complete || b.hp > b.maxHp * 0.5) continue;
      const d = Math.max(Math.abs((b.x - cx) / hw), Math.abs((b.y - cy) / hh));
      if (d > 1 || !visible(b.x, b.y)) continue;
      if (!best || d < best.d) best = { x: b.x, y: b.y, d };
    }
    if (best) this.cueAt('fire', best.x, best.y, w, 0, 0.8);
  }
}
