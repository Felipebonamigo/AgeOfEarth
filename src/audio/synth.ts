// Blocos de síntese usados pelas receitas (sfx.ts, ambience.ts, music.ts): ruído filtrado, tons com glissando,
// cordas Karplus-Strong, parciais inarmônicas (bronze, sinos), batidas graves e formantes vocais.
// Todos recebem o destino e o tempo de início e agendam o próprio fim (stop), sem alocar buffers novos.
import type { NoiseColor, SynthHost } from './engine';

export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
/** Valor com variação relativa ±pct (altura e tempo diferentes a cada disparo). */
export const vary = (v: number, pct: number): number => v * (1 + (Math.random() * 2 - 1) * pct);
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const SILENT = 0.0001;

/** Envelope ataque → (sustentação) → decaimento exponencial num AudioParam de ganho. */
export function env(p: AudioParam, t: number, peak: number, attack: number, decay: number, hold = 0): number {
  p.setValueAtTime(SILENT, t);
  p.linearRampToValueAtTime(Math.max(SILENT, peak), t + Math.max(0.001, attack));
  if (hold > 0) p.setValueAtTime(Math.max(SILENT, peak), t + attack + hold);
  p.exponentialRampToValueAtTime(SILENT, t + attack + hold + Math.max(0.005, decay));
  return attack + hold + decay;
}

export interface FilterSpec { type: BiquadFilterType; f: number; q?: number; f2?: number; glide?: number; gainDb?: number }

function filter(h: SynthHost, spec: FilterSpec, t: number): BiquadFilterNode {
  const f = h.ctx.createBiquadFilter();
  f.type = spec.type; f.Q.value = spec.q ?? 0.7; if (spec.gainDb !== undefined) f.gain.value = spec.gainDb;
  f.frequency.setValueAtTime(spec.f, t);
  if (spec.f2 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, spec.f2), t + (spec.glide ?? 0.2));
  return f;
}

export interface NoiseSpec { color?: NoiseColor; gain: number; attack?: number; decay: number; hold?: number; filters?: FilterSpec[]; rate?: number }

/** Rajada de ruído filtrado (buffer em cache, posição aleatória). Devolve a duração. */
export function noise(h: SynthHost, out: AudioNode, t: number, s: NoiseSpec): number {
  const ctx = h.ctx;
  const buf = h.noise(s.color ?? 'white');
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = s.rate ?? 1;   // em laço: rajadas longas (Titã, trovão) não cortam no fim do buffer
  const g = ctx.createGain();
  const dur = env(g.gain, t, s.gain, s.attack ?? 0.002, s.decay, s.hold ?? 0);
  let head: AudioNode = src;
  for (const fs of s.filters ?? []) { const f = filter(h, fs, t); head.connect(f); head = f; }
  head.connect(g); g.connect(out);
  const maxOff = Math.max(0, buf.duration - dur * (s.rate ?? 1) - 0.05);
  src.start(t, Math.random() * maxOff); src.stop(t + dur + 0.02);
  return dur;
}

export interface ToneSpec { type?: OscillatorType; f: number; f2?: number; glide?: number; gain: number; attack?: number; decay: number; hold?: number; detune?: number; vibrato?: { rate: number; depth: number; delay?: number }; filter?: FilterSpec }

/** Oscilador com envelope, glissando exponencial, vibrato opcional e filtro. */
export function tone(h: SynthHost, out: AudioNode, t: number, s: ToneSpec): number {
  const ctx = h.ctx;
  const o = ctx.createOscillator(); o.type = s.type ?? 'sine';
  o.frequency.setValueAtTime(s.f, t);
  if (s.f2 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(10, s.f2), t + (s.glide ?? (s.attack ?? 0) + s.decay));
  if (s.detune) o.detune.value = s.detune;
  const g = ctx.createGain();
  const dur = env(g.gain, t, s.gain, s.attack ?? 0.003, s.decay, s.hold ?? 0);
  let head: AudioNode = o;
  if (s.filter) { const f = filter(h, s.filter, t); head.connect(f); head = f; }
  head.connect(g); g.connect(out);
  let lfo: OscillatorNode | null = null;
  if (s.vibrato) {
    lfo = ctx.createOscillator(); lfo.frequency.value = s.vibrato.rate;
    const lg = ctx.createGain(); const depth = s.f * s.vibrato.depth;
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(depth, t + (s.vibrato.delay ?? 0.15) + 0.2);
    lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.02);
  }
  o.start(t); o.stop(t + dur + 0.02);
  return dur;
}

/** Corda dedilhada (Karplus-Strong em cache); `bend` desloca a altura ao longo da nota (rangido de madeira). */
export function pluck(h: SynthHost, out: AudioNode, t: number, f: number, gain: number, opts: { bright?: number; dur?: number; bend?: number; filter?: FilterSpec } = {}): number {
  const ctx = h.ctx;
  const { buf, rate } = h.pluck(f, opts.bright ?? 0.6);
  const src = ctx.createBufferSource(); src.buffer = buf;
  src.playbackRate.setValueAtTime(rate, t);
  if (opts.bend) src.playbackRate.exponentialRampToValueAtTime(rate * opts.bend, t + (opts.dur ?? 0.5));
  const g = ctx.createGain();
  const dur = Math.min(opts.dur ?? buf.duration / rate, buf.duration / rate);
  g.gain.setValueAtTime(gain, t); g.gain.setValueAtTime(gain, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur);
  let head: AudioNode = src;
  if (opts.filter) { const fl = filter(h, opts.filter, t); head.connect(fl); head = fl; }
  head.connect(g); g.connect(out);
  src.start(t); src.stop(t + dur + 0.02);
  return dur;
}

/** Soma de parciais senoidais com decaimentos próprios: bronze, sinos, címbalos, moedas. */
export function partials(h: SynthHost, out: AudioNode, t: number, f: number, ratios: readonly number[], gain: number, decay: number, opts: { spread?: number; decayTilt?: number } = {}): number {
  let dur = 0;
  const tilt = opts.decayTilt ?? 0.6;
  ratios.forEach((r, i) => {
    const fr = f * r * (1 + (Math.random() * 2 - 1) * (opts.spread ?? 0.004));
    const d = decay * (1 / (1 + i * tilt)) * rnd(0.8, 1.2);
    dur = Math.max(dur, tone(h, out, t, { f: fr, gain: gain / (1 + i * 0.55), attack: 0.001, decay: d }));
  });
  return dur;
}

/** Batida grave com queda de altura (bumbo, corpo caindo, pedra no chão). */
export function thump(h: SynthHost, out: AudioNode, t: number, f: number, gain: number, decay: number, drop = 0.5): number {
  tone(h, out, t, { f, f2: f * drop, glide: decay * 0.8, gain, attack: 0.002, decay });
  return decay;
}

/** Série de estalos curtos (estilhaços, crepitar, cascalho) espalhados em `span` segundos. */
export function crackles(h: SynthHost, out: AudioNode, t: number, n: number, span: number, gain: number, fLo = 1200, fHi = 5000, len = 0.012): number {
  for (let i = 0; i < n; i++) {
    const dt = Math.random() * span;
    noise(h, out, t + dt, { gain: gain * rnd(0.3, 1), decay: len * rnd(0.5, 1.6), filters: [{ type: 'bandpass', f: rnd(fLo, fHi), q: rnd(1, 4) }] });
  }
  return span + len * 2;
}

/** Vogais (formantes F1/F2) para gritos estilizados e rugidos. */
export const VOWELS = { a: [730, 1090], o: [570, 840], e: [530, 1840], u: [440, 1020], ah: [640, 1190] } as const;

/** Voz estilizada: dente de serra + ruído de sopro por dois formantes, com contorno de altura. Discreta, sem gore. */
export function voice(h: SynthHost, out: AudioNode, t: number, s: { f: number; f2: number; dur: number; gain: number; vowel: readonly number[]; breath?: number; attack?: number; rough?: number }): number {
  const ctx = h.ctx;
  const mix = ctx.createGain(); mix.gain.value = 1;
  const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = s.vowel[0]; f1.Q.value = 6;
  const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = s.vowel[1]; f2.Q.value = 8;
  const g2 = ctx.createGain(); g2.gain.value = 0.55;
  mix.connect(f1); mix.connect(f2); f2.connect(g2);
  const g = ctx.createGain(); f1.connect(g); g2.connect(g); g.connect(out);
  const dur = env(g.gain, t, s.gain, s.attack ?? 0.03, s.dur * 0.75, s.dur * 0.1);
  tone(h, mix, t, { type: 'sawtooth', f: s.f, f2: s.f2, glide: s.dur, gain: 1, attack: 0.01, decay: dur, vibrato: s.rough ? { rate: rnd(18, 30), depth: s.rough, delay: 0 } : { rate: 5.5, depth: 0.012, delay: 0.05 } });
  if (s.breath) noise(h, mix, t, { color: 'pink', gain: s.breath, attack: 0.02, decay: dur });
  return dur;
}
