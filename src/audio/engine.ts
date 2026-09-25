// Motor de áudio (WebAudio, sem arquivos): contexto criado sob demanda e retomado no primeiro gesto do jogador,
// barramentos (efeitos, interface/voz, música, ambiente) → mestre → compressor → saída, reverberação por convolução
// com resposta ao impulso gerada no próprio código, buffers de ruído em cache, limite de vozes por tipo e no total
// e contadores para testes (`stats`). Nada aqui é determinístico nem precisa ser: o áudio não toca a simulação.

export type Bus = 'sfx' | 'ui' | 'music' | 'ambience';
export type NoiseColor = 'white' | 'pink' | 'brown';
export interface AudioVolumes { master: number; sfx: number; music: number; ambience: number; muted: boolean }
export const DEFAULT_VOLUMES: AudioVolumes = { master: 0.5, sfx: 0.8, music: 0.5, ambience: 0.6, muted: false };

/** Limite total de vozes de efeitos (música e camadas contínuas do ambiente ficam de fora). */
export const MAX_VOICES = 24;
/** Limite de vozes simultâneas por categoria; categorias ausentes usam DEFAULT_LIMIT. */
export const CATEGORY_LIMITS: Record<string, number> = {
  melee: 5, bow: 3, arrow: 3, siege: 3, impact: 3, death: 3, work: 4, march: 3, hooves: 2, battle: 3, bird: 3,
  ui: 3, power: 3, built: 2, collapse: 2, fire: 2, magic: 3, alert: 1, stinger: 2,
};
const DEFAULT_LIMIT = 3;

export interface VoiceOpts {
  bus?: Bus; gain?: number; pan?: number;
  /** 0..1: envio para a reverberação (distância e espaço). */
  reverb?: number;
  /** 0..1: abafamento pela distância (passa-baixa). */
  muffle?: number;
  /** Atraso em segundos a partir de agora (impacto de flecha, cascos). */
  delay?: number;
  /** Maior = mais importante; vozes menos importantes são roubadas quando o limite total estoura. */
  priority?: number;
  /** Ignora o limite total (interface e ferrões musicais). */
  exempt?: boolean;
}

/** Receita de som: conecta fontes em `out` a partir do tempo `t` e devolve a duração em segundos. */
export type Recipe = (h: SynthHost, out: AudioNode, t: number, k: number) => number;

/** O que as receitas enxergam do motor: contexto e recursos em cache. */
export interface SynthHost {
  ctx: BaseAudioContext;
  noise(color: NoiseColor): AudioBuffer;
  pluck(freq: number, bright: number): { buf: AudioBuffer; rate: number };
}

interface Voice { cat: string; start: number; end: number; priority: number; out: GainNode; exempt: boolean }

export interface EngineStats {
  created: Record<string, number>; dropped: number; stolen: number; active: number; peak: number;
  /** Ganhos-alvo aplicados (o Chrome não avalia a automação de nós ociosos, então `live` pode atrasar). */
  state: string; gains: { master: number; sfx: number; ui: number; music: number; ambience: number };
  live: { master: number; sfx: number; ui: number; music: number; ambience: number };
  cpuMs: number; cpuP50: number; cpuP95: number; cpuMax: number; buffers: number;
}

/** Buffers de ruído e de cordas em cache para um contexto (o do jogo ou um OfflineAudioContext de teste). */
export class SynthCache implements SynthHost {
  private noiseBufs = new Map<NoiseColor, AudioBuffer>();
  private pluckBufs = new Map<string, { buf: AudioBuffer; base: number }>();
  constructor(readonly ctx: BaseAudioContext) {
    for (const c of ['white', 'pink', 'brown'] as NoiseColor[]) this.noiseBufs.set(c, makeNoise(ctx, c, 4));
  }
  get size(): number { return this.noiseBufs.size + this.pluckBufs.size; }
  noise(color: NoiseColor): AudioBuffer { return this.noiseBufs.get(color)!; }
  /** Corda dedilhada (Karplus-Strong) pré-calculada em alturas-base a cada 5 semitons; a altura exata sai do playbackRate. */
  pluck(freq: number, bright: number): { buf: AudioBuffer; rate: number } {
    const midi = 69 + 12 * Math.log2(Math.max(20, freq) / 440);
    const baseMidi = Math.round(midi / 5) * 5;
    const br = bright >= 0.5 ? 1 : 0;
    const key = `${baseMidi}:${br}`;
    let e = this.pluckBufs.get(key);
    if (!e) {
      const base = 440 * 2 ** ((baseMidi - 69) / 12);
      const dur = Math.max(0.7, Math.min(2.6, 2.6 - (baseMidi - 40) * 0.03));
      e = { buf: makePluck(this.ctx, base, dur, br ? 0.85 : 0.45), base };
      this.pluckBufs.set(key, e);
    }
    return { buf: e.buf, rate: freq / e.base };
  }
}

export class AudioEngine implements SynthHost {
  ctx!: AudioContext;
  private cache!: SynthCache;
  private ready = false;
  private failed = false;
  private master!: GainNode;
  private comp!: DynamicsCompressorNode;
  private convolver!: ConvolverNode;
  readonly buses = {} as Record<Bus, { dry: GainNode; wet: GainNode }>;
  private voices: Voice[] = [];
  volumes: AudioVolumes = { ...DEFAULT_VOLUMES };
  readonly created: Record<string, number> = {};
  dropped = 0; stolen = 0; peak = 0;
  /** Tempo de CPU (JS) gasto no áudio por quadro, média móvel em ms. */
  cpuMs = 0;

  constructor(v?: Partial<AudioVolumes>) {
    if (v) this.volumes = { ...this.volumes, ...v };
    if (typeof window !== 'undefined') {
      // Navegadores só liberam o áudio depois de um gesto: retoma no primeiro clique/tecla
      const kick = () => { if (this.ensure() && this.ctx.state === 'suspended') void this.ctx.resume(); };
      window.addEventListener('pointerdown', kick, { capture: true });
      window.addEventListener('keydown', kick, { capture: true });
    }
  }

  get running(): boolean { return this.ready && this.ctx.state === 'running'; }
  get now(): number { return this.ready ? this.ctx.currentTime : 0; }

  /** Cria o contexto e o grafo fixo na primeira chamada; falso se não houver WebAudio (testes, navegador antigo). */
  ensure(): boolean {
    if (this.ready) return true;
    if (this.failed || typeof window === 'undefined') return false;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) { this.failed = true; return false; }
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.knee.value = 12; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.25;
      this.master.connect(this.comp); this.comp.connect(ctx.destination);
      this.convolver = ctx.createConvolver();
      this.convolver.buffer = makeImpulse(ctx, 2.4, 0.5);
      const ret = ctx.createGain(); ret.gain.value = 0.55;
      this.convolver.connect(ret); ret.connect(this.master);
      for (const b of ['sfx', 'ui', 'music', 'ambience'] as Bus[]) {
        const dry = ctx.createGain(); const wet = ctx.createGain();
        dry.connect(this.master); wet.connect(this.convolver);
        this.buses[b] = { dry, wet };
      }
      this.cache = new SynthCache(ctx);
      this.ready = true;
      this.applyVolumes(true);
      this.prewarm();
      return true;
    } catch { this.failed = true; return false; }
  }

  // ---------------- Volumes ----------------
  setVolumes(v: Partial<AudioVolumes>): void { this.volumes = { ...this.volumes, ...v }; this.applyVolumes(false); }
  private busGain(b: Bus): number {
    const v = this.volumes;
    return b === 'music' ? v.music : b === 'ambience' ? v.ambience : v.sfx;
  }
  private applyVolumes(instant: boolean): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const set = (p: AudioParam, x: number) => { if (instant) p.value = x; else { p.cancelScheduledValues(t); p.setTargetAtTime(x, t, 0.03); } };
    set(this.master.gain, this.volumes.muted ? 0 : clamp01(this.volumes.master));
    for (const b of Object.keys(this.buses) as Bus[]) { const g = clamp01(this.busGain(b)); set(this.buses[b].dry.gain, g); set(this.buses[b].wet.gain, g); }
  }

  /** Pré-calcula as cordas das alturas usadas (lira, baixo, arco, madeira) aos poucos, sem travar quadros no meio da partida. */
  private prewarm(): void {
    const jobs: [number, number][] = [];
    for (let m = 35; m <= 90; m += 5) { jobs.push([m, 0.8]); jobs.push([m, 0.3]); }
    let i = 0;
    const step = () => { if (i >= jobs.length) return; const [m, br] = jobs[i++]; this.cache.pluck(440 * 2 ** ((m - 69) / 12), br); setTimeout(step, 40); };
    setTimeout(step, 200);
  }

  // ---------------- Recursos em cache ----------------
  noise(color: NoiseColor): AudioBuffer { return this.cache.noise(color); }
  pluck(freq: number, bright: number): { buf: AudioBuffer; rate: number } { return this.cache.pluck(freq, bright); }

  // ---------------- Vozes ----------------
  private prune(now: number) { if (this.voices.length) this.voices = this.voices.filter((v) => v.end > now); }
  activeCount(cat?: string): number { const now = this.now; let n = 0; for (const v of this.voices) if (v.end > now && (!cat || v.cat === cat)) n++; return n; }

  /**
   * Toca uma receita numa voz nova: ganho → (passa-baixa de distância) → pan → barramento seco + envio de reverberação.
   * Respeita o limite da categoria (descarta a nova) e o total (rouba a voz menos importante e mais antiga).
   */
  play(cat: string, recipe: Recipe, opts: VoiceOpts = {}, k = Math.random()): boolean {
    if (!this.running) return false;
    const ctx = this.ctx; const now = ctx.currentTime;
    this.prune(now);
    const limit = CATEGORY_LIMITS[cat] ?? DEFAULT_LIMIT;
    let same = 0; for (const v of this.voices) if (v.cat === cat) same++;
    if (same >= limit) { this.dropped++; return false; }
    const priority = opts.priority ?? 1;
    if (!opts.exempt) {
      const counted = this.voices.filter((v) => !v.exempt);
      if (counted.length >= MAX_VOICES) {
        let victim: Voice | null = null;
        for (const v of counted) if (v.priority <= priority && (!victim || v.priority < victim.priority || (v.priority === victim.priority && v.start < victim.start))) victim = v;
        if (!victim) { this.dropped++; return false; }
        victim.out.gain.cancelScheduledValues(now); victim.out.gain.setTargetAtTime(0, now, 0.015);
        victim.end = now; this.stolen++;
        this.voices = this.voices.filter((v) => v !== victim);
      }
    }
    const bus = this.buses[opts.bus ?? 'sfx'];
    const out = ctx.createGain(); out.gain.value = opts.gain ?? 1;
    let head: AudioNode = out;
    const muffle = opts.muffle ?? 0;
    if (muffle > 0.03) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + 17000 * (1 - muffle) * (1 - muffle); lp.Q.value = 0.5; head.connect(lp); head = lp; }
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0));
    head.connect(pan); pan.connect(bus.dry);
    const rv = opts.reverb ?? 0.15;
    let send: GainNode | null = null;
    if (rv > 0.01) { send = ctx.createGain(); send.gain.value = rv; pan.connect(send); send.connect(bus.wet); }
    const t = now + 0.005 + Math.max(0, opts.delay ?? 0);
    let dur = 0.5;
    try { dur = recipe(this, out, t, k); } catch { dur = 0.1; }
    const end = t + dur;
    this.voices.push({ cat, start: t, end, priority, out, exempt: !!opts.exempt });
    this.created[cat] = (this.created[cat] ?? 0) + 1;
    const active = this.voices.filter((v) => !v.exempt).length; if (active > this.peak) this.peak = active;
    // Desmonta a voz depois do fim (as fontes já têm stop agendado; sem conexões, o coletor as libera)
    setTimeout(() => { try { out.disconnect(); pan.disconnect(); send?.disconnect(); } catch { /* ignore */ } }, (end - now + 0.6 + (rv > 0.01 ? 0.1 : 0)) * 1000);
    return true;
  }

  /** Conta uma voz criada fora de `play` (notas da música, camadas contínuas) nas estatísticas. */
  count(cat: string, n = 1): void { this.created[cat] = (this.created[cat] ?? 0) + n; }
  /** Custo de CPU (ms) do quadro atual, somado só no nível de cima (Audio.update e Audio.play) para não contar em dobro. */
  private frameCost = 0;
  /** Pior quadro desde o início (ms). */
  cpuMax = 0;
  cpu(ms: number): void { this.frameCost += ms; }
  private costs = new Float32Array(300); private costN = 0;
  endFrame(): void {
    this.cpuMs = this.cpuMs * 0.95 + this.frameCost * 0.05; if (this.frameCost > this.cpuMax) this.cpuMax = this.frameCost;
    this.costs[this.costN++ % this.costs.length] = this.frameCost; this.frameCost = 0;
  }
  /** Percentil do custo por quadro nos últimos 300 quadros (a mediana ignora preempções de uma máquina carregada). */
  cpuPercentile(p: number): number {
    const n = Math.min(this.costN, this.costs.length); if (!n) return 0;
    const xs = Array.from(this.costs.subarray(0, n)).sort((a, b) => a - b);
    return xs[Math.min(n - 1, Math.floor(p * n))];
  }

  /** Nó de entrada de um barramento (música e ambiente conectam camadas persistentes aqui). */
  input(bus: Bus): { dry: GainNode; wet: GainNode } { return this.buses[bus]; }

  stats(): EngineStats {
    const g = (b: Bus) => (this.ready ? round3(this.buses[b].dry.gain.value) : 0);
    const v = this.volumes; const tg = (b: Bus) => round3(clamp01(this.busGain(b)));
    return {
      created: { ...this.created }, dropped: this.dropped, stolen: this.stolen, active: this.ready ? this.activeCount() : 0, peak: this.peak,
      state: this.ready ? this.ctx.state : 'none',
      gains: { master: v.muted ? 0 : round3(clamp01(v.master)), sfx: tg('sfx'), ui: tg('ui'), music: tg('music'), ambience: tg('ambience') },
      live: { master: this.ready ? round3(this.master.gain.value) : 0, sfx: g('sfx'), ui: g('ui'), music: g('music'), ambience: g('ambience') },
      cpuMs: round3(this.cpuMs), cpuP50: round3(this.cpuPercentile(0.5)), cpuP95: round3(this.cpuPercentile(0.95)), cpuMax: round3(this.cpuMax), buffers: this.ready ? this.cache.size + 1 : 0,
    };
  }
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Ruído branco, rosa (Paul Kellet) ou marrom (integrado), mono, `secs` segundos. */
function makeNoise(ctx: BaseAudioContext, color: NoiseColor, secs: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'white') d[i] = w * 0.5;
    else if (color === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  }
  // Emenda suave para laços contínuos (vento, água)
  const fade = Math.min(2048, n >> 3);
  for (let i = 0; i < fade; i++) { const a = i / fade; d[n - fade + i] = d[n - fade + i] * (1 - a) + d[i] * a; }
  return buf;
}

/** Resposta ao impulso estéreo: reflexões iniciais esparsas + cauda de ruído que escurece com o tempo (sala de pedra/ar livre). */
function makeImpulse(ctx: BaseAudioContext, secs: number, damp: number): AudioBuffer {
  const sr = ctx.sampleRate; const n = Math.floor(sr * secs);
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / sr;
      const a = 0.9 - (0.9 - 0.08) * Math.min(1, tt / (secs * damp + 0.2));   // o filtro fecha: agudos morrem antes
      lp += a * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.exp(-tt * 3.2) * (tt < 0.012 ? tt / 0.012 : 1);
    }
    for (let r = 0; r < 7; r++) { const i = Math.floor(sr * (0.008 + Math.random() * 0.06)); if (i < n) d[i] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - r * 0.05); }
  }
  return buf;
}

/** Karplus-Strong: ruído filtrado num laço de atraso com média (perda) — corda de lira, arco, madeira. */
export function makePluck(ctx: BaseAudioContext, freq: number, secs: number, bright: number): AudioBuffer {
  const sr = ctx.sampleRate; const n = Math.floor(sr * secs);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  ksFill(d, sr, freq, bright);
  return buf;
}

/** Preenche `d` com uma corda Karplus-Strong (exposto para testes sem AudioContext). */
export function ksFill(d: Float32Array, sr: number, freq: number, bright: number): void {
  const period = Math.max(2, Math.round(sr / freq));
  const n = d.length;
  let prev = 0;
  for (let i = 0; i < period && i < n; i++) { const w = Math.random() * 2 - 1; prev = prev + bright * (w - prev); d[i] = prev; }
  const decay = 0.996 + Math.min(0.0035, period / sr * 0.35);   // notas graves soam mais tempo
  const keep = bright * 0.3;                                         // mais brilho = menos média = agudos duram mais
  for (let i = period; i < n; i++) {
    const a = d[i - period]; const b = i - period - 1 >= 0 ? d[i - period - 1] : 0;
    d[i] = decay * ((a + b) * 0.5 * (1 - keep) + a * keep);
  }
  // final suave (sem estalo quando o buffer acaba)
  const fin = Math.min(512, n >> 2);
  for (let i = 0; i < fin; i++) d[n - 1 - i] *= i / fin;
}
