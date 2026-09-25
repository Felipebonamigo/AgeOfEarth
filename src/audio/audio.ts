// Fachada do áudio (docs/DESIGN.md, "Áudio"): tudo sintetizado pelo próprio código em WebAudio, sem arquivos.
// Mantém a API antiga (`play(nome)`, `volume`, `muted`, `setVolume`, `toggleMute`) usada pela interface e acrescenta
// volumes por barramento, o diretor posicional (events.ts), o ambiente por bioma, a música generativa e `stats()`.
import { AudioEngine, DEFAULT_VOLUMES, SynthCache, type AudioVolumes } from './engine';
import { RECIPES, RECIPE_CATEGORY, RECIPE_REVERB, type RecipeName } from './sfx';
import { Music, composePhrase, playInst, tempoFor, type Inst, type Intensity } from './music';
import { Ambience } from './ambience';
import { AudioDirector, type WorldInput } from './events';

export type { AudioVolumes } from './engine';
export { viewFromCamera } from './events';

/** Sons de interface pedidos por nome (compatibilidade com hud.ts/input.ts/main.ts) → receita. */
const UI_SOUNDS: Record<string, RecipeName> = {
  select: 'uiClick', command: 'uiConfirm', build: 'uiPlace', complete: 'built', age: 'ageUp', alert: 'alertHorn', power: 'divine',
  bolt: 'zeusBolt', death: 'deathHuman', error: 'uiError', coin: 'uiCoin', attack: 'melee', research: 'research',
};
/** Intervalo mínimo entre repetições do mesmo som de interface (ms). */
const MIN_GAP: Record<string, number> = { select: 40, command: 40, build: 150, error: 120, alert: 1500, complete: 200, power: 300 };

export class Audio {
  readonly engine: AudioEngine;
  readonly music: Music;
  readonly ambience: Ambience;
  readonly director: AudioDirector;
  private last = new Map<string, number>();
  private persist: ((v: AudioVolumes) => void) | null;

  constructor(volumes?: Partial<AudioVolumes>, persist?: (v: AudioVolumes) => void) {
    this.engine = new AudioEngine({ ...DEFAULT_VOLUMES, ...volumes });
    this.music = new Music(this.engine);
    this.ambience = new Ambience(this.engine);
    this.director = new AudioDirector(this.engine, this.music, this.ambience);
    this.persist = persist ?? null;
  }

  get volume(): number { return this.engine.volumes.master; }
  get muted(): boolean { return this.engine.volumes.muted; }
  get volumes(): AudioVolumes { return { ...this.engine.volumes }; }
  /** Volume geral (a opção antiga "Volume"). */
  setVolume(v: number): void { this.setVolumes({ master: v }); }
  /** Aplica ao vivo (rampa curta) e persiste. */
  setVolumes(v: Partial<AudioVolumes>): void { this.engine.setVolumes(v); this.persist?.(this.volumes); }
  setMuted(m: boolean): void { this.setVolumes({ muted: m }); }
  toggleMute(): boolean { this.setMuted(!this.muted); return this.muted; }

  /** Som de interface ou receita pelo nome; 'victory'/'defeat' tocam a cadência final da música. */
  play(name: string): void {
    const now = performance.now();
    if (now - (this.last.get(name) ?? 0) < (MIN_GAP[name] ?? 30)) return;
    this.last.set(name, now);
    if (!this.engine.ensure()) return;
    const t0 = performance.now();
    try { this.playNow(name); } finally { this.engine.cpu(performance.now() - t0); }
  }
  private playNow(name: string): void {
    if (name === 'victory' || name === 'defeat') { this.music.cadence(name === 'victory'); return; }
    const recipe = UI_SOUNDS[name] ?? (name in RECIPES ? (name as RecipeName) : null);
    if (!recipe) return;
    this.engine.play(RECIPE_CATEGORY[recipe] === 'ui' ? 'ui' : RECIPE_CATEGORY[recipe], RECIPES[recipe], { bus: 'ui', gain: 0.9, reverb: RECIPE_REVERB[recipe] ?? 0.08, exempt: true, priority: 4 });
  }

  /** Chamado a cada quadro pelo laço principal: partida (posicional, ambiente, música) ou menu (tema do menu). */
  update(dt: number, world: WorldInput | null): void {
    const e = this.engine;
    // Electron/autoplay liberado ou gesto já feito: cria o contexto sem esperar outro clique
    if (!e.running) {
      const ua = (typeof navigator !== 'undefined' ? (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation : undefined);
      if (ua?.hasBeenActive && e.ensure() && e.ctx.state === 'suspended') void e.ctx.resume();
    }
    const t0 = performance.now();
    if (world) this.director.update(dt, world); else if (e.running) this.director.menu();
    e.cpu(performance.now() - t0);
    e.endFrame();
  }

  /** Contadores para testes e depuração (window.aoe.audio.stats()). */
  stats() {
    return {
      ...this.engine.stats(),
      music: { theme: this.music.theme, intensity: this.music.intensity, age: this.music.age, notes: this.music.notes },
      director: { cues: { ...this.director.cues }, intensity: this.director.intensity.current, score: Math.round(this.director.score * 100) / 100, battle: Math.round(this.director.battle * 100) / 100 },
      ambience: this.ambience.levels(),
      volumes: this.volumes,
    };
  }
  /** Nomes das receitas (para testes). */
  recipes(): string[] { return Object.keys(RECIPES); }
  /**
   * Testes: renderiza uma receita num OfflineAudioContext (sem tocar) e mede duração declarada, pico e RMS —
   * confere que nenhuma receita sai muda, com NaN ou estourando.
   */
  async renderOffline(name: string, secs = 5): Promise<{ name: string; dur: number; peak: number; rms: number } | null> {
    const OAC = typeof window !== 'undefined' ? window.OfflineAudioContext : undefined;
    const recipe = (RECIPES as Record<string, (typeof RECIPES)[RecipeName]>)[name];
    const inst = name.startsWith('inst:') ? name.slice(5) as Inst : null;
    const phrase = name.startsWith('phrase:') ? name.split(':') : null;   // phrase:<intensidade>:<idade>
    if (!OAC || (!recipe && !inst && !phrase)) return null;
    const sr = 44100; const ctx = new OAC(2, Math.ceil(sr * secs), sr);
    const host = new SynthCache(ctx);
    const out = ctx.createGain(); out.connect(ctx.destination);
    let dur: number;
    if (recipe) dur = recipe(host, out, 0.01, Math.random());
    else if (inst) { const ev = { at: 0, dur: 4, inst, midi: inst === 'bass' || inst === 'drone' ? 43 : 67, vel: 1 }; playInst(host, out, ev, 0.01, 0.25); dur = 1; }
    else {
      const menu = phrase![1] === 'menu'; const intensity = (menu ? 'peace' : phrase![1] ?? 'peace') as Intensity; const age = Number(phrase![2] ?? 0);
      const p = composePhrase({ mode: 'dorian', tonic: 38, meter: 8, bars: 4, intensity, age, menu }, Math.random);
      const eighth = 30 / tempoFor(age, intensity, menu); for (const ev of p.notes) playInst(host, out, ev, 0.01 + ev.at * eighth, eighth);
      dur = Math.min(secs, p.length * eighth);
    }
    const buf = await ctx.startRendering();
    let peak = 0, sum = 0; const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const x = d[i]; if (!Number.isFinite(x)) return { name, dur, peak: NaN, rms: NaN }; const a = Math.abs(x); if (a > peak) peak = a; sum += x * x; }
    const n = Math.max(1, Math.min(d.length, Math.ceil((dur + 0.02) * sr)));
    return { name, dur: Math.round(dur * 1000) / 1000, peak: Math.round(peak * 1000) / 1000, rms: Math.round(Math.sqrt(sum / n) * 10000) / 10000 };
  }
  /** Testes: encurta os tempos de calma antes de a música baixar de intensidade. */
  set holdScale(v: number) { this.director.holdScale = v; }
  get holdScale(): number { return this.director.holdScale; }
}
