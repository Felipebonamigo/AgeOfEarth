// Música generativa em modos gregos (dórico, frígio, mixolídio): lira (Karplus-Strong), aulos (dupla palheta:
// serras desafinadas, filtro e vibrato), bordão, tambor de moldura (dum/tek), bumbo grave e trompa (salpinx).
// Três intensidades (paz, tensão, batalha) escolhidas pelo combate visível e por ataques sofridos; o tema cresce com a
// Idade (andamento e instrumentação); menu com tema próprio; cadências de vitória/derrota; troca por crossfade de 4–8 s.
// A parte de teoria (escalas, progressões, melodia com condução de vozes, escolha de intensidade) é pura e testada
// em tests/audio.test.ts; o agendador só roda com AudioContext.
import type { AudioEngine, SynthHost } from './engine';
import { noise, pluck, thump, tone } from './synth';

// ---------------- Teoria (pura) ----------------
export const MODES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
} as const;
export type ModeName = keyof typeof MODES;
export type Intensity = 'peace' | 'tension' | 'battle';
export type Rand = () => number;

export const midiToHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);
/** Grau da escala (0 = tônica, 7 = oitava acima, negativos abaixo) → nota MIDI. */
export function degreeToMidi(tonic: number, mode: ModeName, deg: number): number {
  const s = MODES[mode]; const o = Math.floor(deg / 7); const i = ((deg % 7) + 7) % 7;
  return tonic + 12 * o + s[i];
}
/** A nota MIDI pertence ao modo com essa tônica? */
export function inMode(midi: number, tonic: number, mode: ModeName): boolean { return (MODES[mode] as readonly number[]).includes((((midi - tonic) % 12) + 12) % 12); }
/** Notas do acorde (tríade no modo) sobre o grau `root`, como graus. */
export const chordTones = (root: number): number[] => [root, root + 2, root + 4];
const isChordTone = (deg: number, root: number) => { const r = (((deg - root) % 7) + 7) % 7; return r === 0 || r === 2 || r === 4; };
const pickR = <T>(xs: readonly T[], r: Rand): T => xs[Math.floor(r() * xs.length) % xs.length];

/** Cadências típicas por modo (penúltimo grau → tônica): frígio desce do II bemol, dórico vem do IV, mixolídio do VII bemol. */
export const CADENCES: Record<ModeName, number[]> = { dorian: [3, 6, 4], phrygian: [1, 6, 3], mixolydian: [6, 3, 4] };
/** Progressão de `bars` acordes (graus): começa e termina na tônica, com cadência do modo; nunca repete o acorde anterior. */
export function progression(mode: ModeName, bars: number, r: Rand): number[] {
  const out = [0];
  const pool = [2, 3, 4, 5, 6, 1].filter((d) => mode === 'phrygian' || d !== 1);
  while (out.length < bars - 2) { let d = pickR(pool, r); if (d === out[out.length - 1]) d = pool[(pool.indexOf(d) + 1) % pool.length]; out.push(d); }
  if (bars >= 2) { let c = pickR(CADENCES[mode], r); if (c === out[out.length - 1]) c = CADENCES[mode][(CADENCES[mode].indexOf(c) + 1) % CADENCES[mode].length]; if (bars >= 3) out.push(c); out.push(0); }
  return out.slice(0, bars);
}

/** Próximo grau da melodia: passos predominam, saltos são compensados por passo em sentido contrário, faixa limitada. */
export function nextDegree(prev: number, lastInterval: number, lo: number, hi: number, r: Rand): number {
  let step: number;
  if (Math.abs(lastInterval) >= 3 && r() < 0.85) step = -Math.sign(lastInterval);          // recuperação do salto
  else {
    const x = r();
    step = x < 0.12 ? 0 : x < 0.72 ? 1 : x < 0.92 ? 2 : 3 + Math.floor(r() * 2);            // repete, passo, terça, salto
    const center = (lo + hi) / 2;
    const up = r() < 0.5 + (center - prev) / (hi - lo + 1) * 0.8;                            // tende a voltar ao centro
    if (!up) step = -step;
  }
  let d = prev + step;
  if (d > hi) d = prev - Math.abs(step || 1);
  if (d < lo) d = prev + Math.abs(step || 1);
  return Math.max(lo, Math.min(hi, d));
}
/** Nota do acorde mais próxima de `deg` (condução de vozes: menor movimento). */
export function nearestChordTone(deg: number, root: number): number {
  for (let k = 0; k <= 3; k++) { if (isChordTone(deg - k, root)) return deg - k; if (isChordTone(deg + k, root)) return deg + k; }
  return deg;
}

/** Ritmos por compasso (em colcheias; negativos são pausas). 8 = 4/4, 6 = 3/4, 7 = 7/8 aksak (2+2+3). */
const RHYTHMS: Record<number, Record<Intensity, number[][]>> = {
  8: {
    peace: [[4, 4], [6, 2], [3, 1, 4], [2, 2, 4], [8], [4, 2, 2], [-2, 2, 4], [3, 1, 2, 2]],
    tension: [[2, 2, 2, 2], [3, 1, 2, 2], [2, 1, 1, 4], [3, 3, 2], [4, 2, 2], [1, 1, 2, 4]],
    battle: [[1, 1, 2, 1, 1, 2], [2, 1, 1, 2, 2], [1, 1, 1, 1, 2, 2], [3, 3, 2], [2, 2, 1, 1, 2]],
  },
  6: {
    peace: [[4, 2], [6], [3, 1, 2], [2, 4], [-2, 2, 2]],
    tension: [[2, 2, 2], [3, 1, 2], [2, 1, 1, 2]],
    battle: [[1, 1, 2, 2], [2, 1, 1, 2], [1, 1, 1, 1, 2]],
  },
  7: {
    peace: [[4, 3], [2, 2, 3], [-2, 2, 3]],
    tension: [[2, 2, 3], [2, 2, 1, 2], [1, 1, 2, 3]],
    battle: [[2, 2, 1, 2], [1, 1, 2, 1, 2], [2, 1, 1, 3]],
  },
};
/** Padrões de tambor por compasso: [colcheia, 'd' dum grave | 't' tek agudo]. */
const DRUMS: Record<number, Record<Intensity, [number, 'd' | 't'][]>> = {
  8: { peace: [[0, 'd'], [4, 't']], tension: [[0, 'd'], [3, 't'], [4, 't'], [6, 'd']], battle: [[0, 'd'], [2, 't'], [3, 'd'], [4, 't'], [5, 'd'], [6, 't'], [7, 't']] },
  6: { peace: [[0, 'd'], [3, 't']], tension: [[0, 'd'], [2, 't'], [3, 'd'], [5, 't']], battle: [[0, 'd'], [1, 't'], [2, 't'], [3, 'd'], [4, 't'], [5, 't']] },
  7: { peace: [[0, 'd'], [4, 't']], tension: [[0, 'd'], [2, 't'], [4, 'd'], [6, 't']], battle: [[0, 'd'], [2, 't'], [4, 'd'], [5, 't'], [6, 't']] },
};

export type Inst = 'lyre' | 'aulos' | 'aulos2' | 'arp' | 'bass' | 'drone' | 'dum' | 'tek' | 'bigdrum' | 'horn';
export interface NoteEv { at: number; dur: number; inst: Inst; midi: number; vel: number }
export interface Motif { rhythm: number[]; steps: number[] }
export interface PhraseSpec { mode: ModeName; tonic: number; meter: 6 | 7 | 8; bars: number; intensity: Intensity; age: number; menu?: boolean; prevDeg?: number; motif?: Motif | null; lead?: 'lyre' | 'aulos' }
export interface Phrase { notes: NoteEv[]; length: number; lastDeg: number; motif: Motif; chords: number[]; melody: number[] }

/** Andamento (semínimas por minuto) por Idade e intensidade; o menu é mais lento. */
export function tempoFor(age: number, intensity: Intensity, menu = false): number {
  if (menu) return 58;
  const base = [64, 70, 76, 83, 90][Math.max(0, Math.min(4, age))];
  return Math.round(base * (intensity === 'battle' ? 1.42 : intensity === 'tension' ? 1.18 : 1));
}
/** Instrumentação por Idade: cada Idade acrescenta uma camada. */
export function layersFor(age: number, intensity: Intensity, menu = false): Set<Inst> {
  const s = new Set<Inst>(['lyre', 'bass']);
  if (menu) { for (const i of ['aulos', 'arp', 'drone', 'tek'] as Inst[]) s.add(i); return s; }
  if (intensity === 'peace') s.add('drone');
  if (age >= 1) { s.add('aulos'); s.add('arp'); }
  if (age >= 2 || intensity !== 'peace') { s.add('dum'); s.add('tek'); }
  if (age >= 3) s.add('aulos2');
  if (age >= 3 && intensity === 'battle') s.add('horn');
  if (age >= 4 && intensity !== 'peace') s.add('bigdrum');
  return s;
}

/**
 * Compõe uma frase: progressão no modo, melodia por passos com recuperação de saltos e notas do acorde nos tempos
 * fortes, motivo reaproveitado (sequência/inversão) para coerência, baixo, arpejo, bordão, tambores e trompa.
 */
export function composePhrase(spec: PhraseSpec, r: Rand): Phrase {
  const { mode, tonic, meter, bars, intensity, age } = spec;
  const layers = layersFor(age, intensity, spec.menu);
  const chords = progression(mode, bars, r);
  const notes: NoteEv[] = [];
  const lo = 12, hi = 21;                                    // melodia entre a 2ª e a 3ª oitava acima do bordão
  let deg = nearestChordTone(Math.max(lo, Math.min(hi, spec.prevDeg ?? 14)), 0);
  let lastInt = 0;
  const melody: number[] = [];
  let motif: Motif | null = spec.motif ?? null;
  const lead: Inst = spec.lead === 'aulos' && layers.has('aulos') ? 'aulos' : 'lyre';
  const pool = RHYTHMS[meter][intensity];
  let firstMotif: Motif | null = null;
  for (let b = 0; b < bars; b++) {
    const root = chords[b];
    const bar0 = b * meter;
    const last = b === bars - 1;
    // motivo: repetir (transposto ao acorde) ou inverter dá unidade; senão, ritmo novo
    const useMotif = !!motif && b > 0 && !last && r() < 0.4;
    const invert = useMotif && r() < 0.3;
    const rhythm = useMotif && motif!.rhythm.reduce((a, x) => a + Math.abs(x), 0) === meter ? motif!.rhythm : pickR(pool, r);
    const steps: number[] = [];
    let at = bar0; let first = true; let k = 0;
    for (const len of rhythm) {
      const dur = Math.abs(len);
      if (len < 0) { at += dur; continue; }
      let next: number;
      if (first) next = nearestChordTone(deg, root);                                   // tempo forte: nota do acorde mais próxima
      else if (useMotif && k < motif!.steps.length) next = Math.max(lo, Math.min(hi, deg + (invert ? -motif!.steps[k] : motif!.steps[k])));
      else next = nextDegree(deg, lastInt, lo, hi, r);
      if (last && at + dur >= bar0 + meter) next = nearestChordTone(next, 0);          // termina na tônica/acorde da tônica
      if (!first) { steps.push(next - deg); k++; }
      lastInt = next - deg; deg = next; first = false;
      melody.push(deg);
      notes.push({ at, dur, inst: lead, midi: degreeToMidi(tonic, mode, deg), vel: 0.75 + r() * 0.25 });
      if (layers.has('aulos2') && dur >= 3 && intensity !== 'battle') notes.push({ at, dur, inst: 'aulos2', midi: degreeToMidi(tonic, mode, deg - 2), vel: 0.5 });
      if (lead === 'lyre' && intensity === 'battle' && age >= 3) notes.push({ at, dur, inst: 'aulos2', midi: degreeToMidi(tonic, mode, deg - 7), vel: 0.45 });
      at += dur;
    }
    if (!firstMotif) firstMotif = { rhythm, steps };
    // baixo: fundamental no tempo forte (e no meio do compasso na batalha)
    notes.push({ at: bar0, dur: meter, inst: 'bass', midi: degreeToMidi(tonic, mode, root + 7), vel: 0.8 });
    if (intensity === 'battle') notes.push({ at: bar0 + (meter === 7 ? 4 : meter / 2), dur: meter / 2, inst: 'bass', midi: degreeToMidi(tonic, mode, root + 7), vel: 0.6 });
    // arpejo da lira (notas do acorde em semínimas)
    if (layers.has('arp') && (intensity !== 'battle' || r() < 0.5)) {
      const tones = chordTones(root + 7);
      for (let e = 0, i = 0; e < meter; e += 2, i++) notes.push({ at: bar0 + e, dur: 2, inst: 'arp', midi: degreeToMidi(tonic, mode, tones[i % 3] + (i >= 3 ? 7 : 0)), vel: 0.4 + r() * 0.15 });
    }
    // tambores
    if (layers.has('dum') || (spec.menu && layers.has('tek'))) {
      const soft = intensity === 'peace' || spec.menu;
      if (!(soft && b % 2 === 1)) for (const [e, kind] of DRUMS[meter][intensity]) if (!(spec.menu && kind === 'd')) notes.push({ at: bar0 + e, dur: 1, inst: kind === 'd' ? 'dum' : 'tek', midi: 0, vel: (soft ? 0.5 : 0.85) * (e === 0 ? 1 : 0.8) });
    }
    if (layers.has('bigdrum') && b % 2 === 0) notes.push({ at: bar0, dur: 2, inst: 'bigdrum', midi: 0, vel: 1 });
    if (layers.has('horn') && b % 2 === 0) notes.push({ at: bar0, dur: meter * 2 - 1, inst: 'horn', midi: degreeToMidi(tonic, mode, root + 7 + 4), vel: 0.7 });
  }
  // bordão: tônica + quinta sustentadas a frase inteira
  if (layers.has('drone')) { notes.push({ at: 0, dur: bars * meter, inst: 'drone', midi: tonic, vel: 0.6 }); notes.push({ at: 0, dur: bars * meter, inst: 'drone', midi: tonic + 7, vel: 0.4 }); }
  notes.sort((a, b) => a.at - b.at);
  return { notes, length: bars * meter, lastDeg: deg, motif: firstMotif ?? { rhythm: [meter], steps: [] }, chords, melody };
}

/** Cadência final: vitória (mixolídio, I–IV–VII♭–I com trompas) ou derrota (tetracorde frígio descendente e sino grave). */
export function composeCadence(won: boolean, tonic = 50): { notes: NoteEv[]; tempo: number } {
  const n: NoteEv[] = [];
  if (won) {
    const mode: ModeName = 'mixolydian';
    [0, 3, 6, 0].forEach((root, i) => {
      const at = i * 4; const len = i === 3 ? 16 : 4;
      for (const d of chordTones(root + 14)) n.push({ at, dur: len, inst: 'aulos', midi: degreeToMidi(tonic, mode, d), vel: 0.55 });
      n.push({ at, dur: len, inst: 'horn', midi: degreeToMidi(tonic, mode, root + 7), vel: 0.8 });
      n.push({ at, dur: len, inst: 'bass', midi: degreeToMidi(tonic, mode, root), vel: 0.9 });
      n.push({ at, dur: 1, inst: i === 3 ? 'bigdrum' : 'dum', midi: 0, vel: 1 });
      chordTones(root + 14).concat([root + 21]).forEach((d, j) => n.push({ at: at + j * 0.5, dur: 3, inst: 'lyre', midi: degreeToMidi(tonic, mode, d), vel: 0.7 }));
    });
    return { notes: n, tempo: 76 };
  }
  const mode: ModeName = 'phrygian';
  n.push({ at: 0, dur: 20, inst: 'drone', midi: tonic, vel: 0.6 });
  [18, 17, 16, 15, 14].forEach((d, i) => n.push({ at: i * 3, dur: i === 4 ? 9 : 3, inst: 'aulos', midi: degreeToMidi(tonic, mode, d), vel: 0.7 }));
  [0, 6, 12].forEach((at) => n.push({ at, dur: 2, inst: 'bigdrum', midi: 0, vel: 0.8 }));
  n.push({ at: 12, dur: 8, inst: 'bass', midi: degreeToMidi(tonic, mode, 0), vel: 0.9 });
  return { notes: n, tempo: 56 };
}

// ---------------- Intensidade (pura) ----------------
export interface IntensityState { current: Intensity; calm: number }
/** Limiares com histerese: combate visível (golpes/s ponderados) sobe na hora; descer exige calma por alguns segundos. */
export const INTENSITY_RULES = { battleOn: 2.2, battleOff: 1.0, tensionOn: 0.35, tensionOff: 0.12, battleHold: 8, tensionHold: 15 };
export function chooseIntensity(s: IntensityState, score: number, dt: number, holdScale = 1): IntensityState {
  const R = INTENSITY_RULES;
  if (score >= R.battleOn) return { current: 'battle', calm: 0 };
  if (s.current === 'battle') {
    if (score >= R.battleOff) return { current: 'battle', calm: 0 };
    const calm = s.calm + dt;
    return calm >= R.battleHold * holdScale ? { current: 'tension', calm: 0 } : { current: 'battle', calm };
  }
  if (score >= R.tensionOn) return { current: 'tension', calm: 0 };
  if (s.current === 'tension') {
    if (score >= R.tensionOff) return { current: 'tension', calm: 0 };
    const calm = s.calm + dt;
    return calm >= R.tensionHold * holdScale ? { current: 'peace', calm: 0 } : { current: 'tension', calm };
  }
  return { current: 'peace', calm: 0 };
}
/** Duração do crossfade ao entrar em cada intensidade (batalha chega rápido, a paz volta devagar). */
export const FADE_INTO: Record<Intensity, number> = { battle: 4, tension: 6, peace: 8 };

// ---------------- Instrumentos (runtime) ----------------
function aulos(h: SynthHost, out: AudioNode, t: number, hz: number, dur: number, vel: number, bright = 2200) {
  const ctx = h.ctx;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = bright; f.Q.value = 0.8;
  const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1300; pk.Q.value = 1.4; pk.gain.value = 7;
  const g = ctx.createGain(); f.connect(pk); pk.connect(g); g.connect(out);
  const a = Math.min(0.08, dur * 0.3); const rel = 0.12;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * vel, t + a);
  g.gain.setValueAtTime(0.05 * vel, t + Math.max(a, dur - rel)); g.gain.linearRampToValueAtTime(0.0001, t + dur + rel);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2 + Math.random() * 0.8;
  const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(hz * 0.006, t + Math.min(0.5, dur));
  lfo.connect(lg);
  for (const det of [-7, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(hz * 0.985, t); o.frequency.exponentialRampToValueAtTime(hz, t + 0.05); o.detune.value = det; lg.connect(o.frequency); o.connect(f); o.start(t); o.stop(t + dur + rel + 0.02); }
  lfo.start(t); lfo.stop(t + dur + rel + 0.02);
  noise(h, f, t, { color: 'pink', gain: 0.04 * vel, attack: a, decay: 0.1, hold: Math.max(0, dur - a), filters: [{ type: 'bandpass', f: Math.min(6000, hz * 2), q: 2 }] });
}
function drone(h: SynthHost, out: AudioNode, t: number, hz: number, dur: number, vel: number) {
  const ctx = h.ctx;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(350, t); f.frequency.linearRampToValueAtTime(650, t + dur / 2); f.frequency.linearRampToValueAtTime(380, t + dur);
  const g = ctx.createGain(); f.connect(g); g.connect(out);
  const a = Math.min(1.5, dur / 3);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035 * vel, t + a); g.gain.setValueAtTime(0.035 * vel, t + dur - a); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
  for (const det of [-5, 4]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = det; o.connect(f); o.start(t); o.stop(t + dur + 0.6); }
}
function horn(h: SynthHost, out: AudioNode, t: number, hz: number, dur: number, vel: number) {
  tone(h, out, t, { type: 'sawtooth', f: hz * 0.97, f2: hz, glide: 0.1, gain: 0.09 * vel, attack: 0.12, hold: Math.max(0, dur - 0.4), decay: 0.4, vibrato: { rate: 5, depth: 0.006, delay: 0.3 }, filter: { type: 'lowpass', f: 500, f2: 1700, glide: 0.25, q: 1.5 } });
}
/** Toca uma nota de um instrumento (exportado para a medição offline dos níveis). */
export function playInst(h: SynthHost, out: AudioNode, ev: NoteEv, t: number, eighth: number): void {
  const dur = ev.dur * eighth; const hz = midiToHz(ev.midi);
  switch (ev.inst) {
    case 'lyre': pluck(h, out, t, hz, 0.22 * ev.vel, { bright: 0.8, dur: Math.min(2.4, dur + 1.1) }); break;
    case 'arp': pluck(h, out, t, hz, 0.12 * ev.vel, { bright: 0.55, dur: Math.min(1.8, dur + 0.8) }); break;
    case 'bass': pluck(h, out, t, hz, 0.28 * ev.vel, { bright: 0.35, dur: Math.min(2.6, dur + 0.6) }); break;
    case 'aulos': aulos(h, out, t, hz, dur * 0.95, ev.vel); break;
    case 'aulos2': aulos(h, out, t, hz, dur * 0.95, ev.vel * 0.8, 1600); break;
    case 'drone': drone(h, out, t, hz, dur, ev.vel); break;
    case 'horn': horn(h, out, t, hz, dur, ev.vel); break;
    case 'dum': thump(h, out, t, 88 + Math.random() * 8, 0.35 * ev.vel, 0.28, 0.6); noise(h, out, t, { color: 'brown', gain: 0.25 * ev.vel, decay: 0.12, filters: [{ type: 'lowpass', f: 400 }] }); break;
    case 'tek': noise(h, out, t, { gain: 0.32 * ev.vel, decay: 0.035, filters: [{ type: 'bandpass', f: 2400 + Math.random() * 600, q: 1.5 }] }); tone(h, out, t, { f: 420, gain: 0.08 * ev.vel, decay: 0.03 }); break;
    case 'bigdrum': thump(h, out, t, 55, 0.45 * ev.vel, 0.6, 0.6); noise(h, out, t, { color: 'brown', gain: 0.4 * ev.vel, decay: 0.4, filters: [{ type: 'lowpass', f: 160 }] }); break;
  }
}

// ---------------- Agendador (runtime) ----------------
export type Theme = 'menu' | 'game' | 'off';
const LOOKAHEAD = 0.35;
const TONICS = [38, 40, 43, 45];   // Ré, Mi, Sol, Lá (bordão na 2ª oitava)

export class Music {
  theme: Theme = 'off'; intensity: Intensity = 'peace'; age = 0;
  private section: GainNode | null = null;
  private phrase: Phrase | null = null;
  private phraseStart = 0; private eighth = 0.25; private idx = 0;
  private mode: ModeName = 'dorian'; private tonic = 38; private phrasesInKey = 0; private lastDeg = 14; private motif: Motif | null = null; private phraseCount = 0;
  private holdUntil = 0;   // depois de uma cadência final, silêncio antes de voltar
  notes = 0;
  constructor(private engine: AudioEngine) {}

  /** Tema/intensidade/Idade desejados; muda com crossfade quando algo difere. */
  set(theme: Theme, intensity: Intensity, age: number): void {
    if (theme === this.theme && intensity === this.intensity && age === this.age && (this.section || this.holding())) return;
    if (this.holding()) { this.theme = theme; this.intensity = intensity; this.age = age; return; }   // silêncio após a cadência final
    const fade = theme !== this.theme ? 4 : FADE_INTO[intensity];
    this.theme = theme; this.intensity = intensity; this.age = age;
    this.phrasesInKey = 99;   // novo tema/Idade/intensidade: novo centro tonal e modo coerente com a intensidade
    if (!this.engine.running) { this.section = null; return; }
    this.crossfade(fade);
  }

  private crossfade(fade: number): void {
    const ctx = this.engine.ctx; const now = ctx.currentTime;
    if (this.section) { const old = this.section; old.gain.cancelScheduledValues(now); old.gain.setValueAtTime(old.gain.value, now); old.gain.linearRampToValueAtTime(0.0001, now + fade); setTimeout(() => { try { old.disconnect(); } catch { /* ignore */ } }, (fade + 4) * 1000); }
    this.section = null; this.phrase = null;
    if (this.theme === 'off') return;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(1, now + Math.max(1.5, fade * 0.8));
    const bus = this.engine.input('music'); g.connect(bus.dry);
    const send = ctx.createGain(); send.gain.value = 0.35; g.connect(send); send.connect(bus.wet);
    this.section = g;
    this.phraseStart = now + 0.15;
  }

  private holding(): boolean { return this.engine.running && this.engine.ctx.currentTime < this.holdUntil; }

  /** Vitória/derrota: a trilha sai em 1,5 s, a cadência toca e depois há silêncio antes da paz voltar. */
  cadence(won: boolean): void {
    if (!this.engine.running) return;
    const ctx = this.engine.ctx; const now = ctx.currentTime;
    if (this.section) { const old = this.section; old.gain.cancelScheduledValues(now); old.gain.setValueAtTime(old.gain.value, now); old.gain.linearRampToValueAtTime(0.0001, now + 1.5); setTimeout(() => { try { old.disconnect(); } catch { /* ignore */ } }, 6000); }
    this.section = null; this.phrase = null;
    const { notes, tempo } = composeCadence(won, won ? 50 : 52);
    const g = ctx.createGain(); g.gain.value = 1;
    const bus = this.engine.input('music'); g.connect(bus.dry);
    const send = ctx.createGain(); send.gain.value = 0.45; g.connect(send); send.connect(bus.wet);
    const eighth = 30 / tempo; const t0 = now + 0.8;
    for (const ev of notes) playInst(this.engine, g, ev, t0 + ev.at * eighth, eighth);
    this.notes += notes.length; this.engine.count(won ? 'victory' : 'defeat'); this.engine.count('music', notes.length);
    const end = t0 + Math.max(...notes.map((n) => n.at + n.dur)) * eighth + 3;
    setTimeout(() => { try { g.disconnect(); } catch { /* ignore */ } }, (end - now + 3) * 1000);
    this.holdUntil = end + 6;
  }

  /** Chamado a cada quadro: agenda as notas que caem na janela de antecipação e compõe a próxima frase quando preciso. */
  update(): void {
    if (!this.engine.running || this.theme === 'off') return;
    const now = this.engine.ctx.currentTime;
    if (now < this.holdUntil) return;
    if (!this.section) { this.crossfade(3); if (!this.section) return; }
    let guard = 0;
    while (guard++ < 4) {
      if (!this.phrase) this.compose();
      const p = this.phrase!;
      while (this.idx < p.notes.length) {
        const ev = p.notes[this.idx]; const t = this.phraseStart + ev.at * this.eighth;
        if (t > now + LOOKAHEAD) break;
        if (t >= now - 0.05) { playInst(this.engine, this.section!, ev, Math.max(t, now), this.eighth); this.notes++; this.engine.count('music'); }
        this.idx++;
      }
      const end = this.phraseStart + p.length * this.eighth;
      if (this.idx < p.notes.length || end > now + LOOKAHEAD) break;
      this.phraseStart = Math.max(end, now); this.phrase = null;
    }
  }

  private compose(): void {
    const r = Math.random;
    const menu = this.theme === 'menu';
    // Centro tonal muda a cada 2–4 frases; o modo acompanha a intensidade
    if (this.phrasesInKey >= 2 + Math.floor(r() * 3)) {
      this.phrasesInKey = 0;
      this.tonic = menu ? 38 : pickR(TONICS, r);
      this.mode = menu ? (r() < 0.7 ? 'dorian' : 'mixolydian') : this.intensity === 'peace' ? (r() < 0.55 ? 'dorian' : 'mixolydian') : this.intensity === 'tension' ? (r() < 0.6 ? 'phrygian' : 'dorian') : (r() < 0.75 ? 'phrygian' : 'dorian');
      this.motif = null;
    }
    this.phrasesInKey++; this.phraseCount++;
    const meter: 6 | 7 | 8 = this.intensity === 'peace' || menu ? (r() < 0.6 ? 8 : 6) : this.intensity === 'tension' ? (r() < 0.4 ? 7 : 8) : (r() < 0.5 ? 7 : 8);
    const tempo = tempoFor(this.age, this.intensity, menu) * (0.97 + r() * 0.06);
    this.eighth = 30 / tempo;
    // Respiro: de vez em quando a paz tem uma frase só de bordão e arpejo (menos fadiga em partidas longas)
    const breathe = (this.intensity === 'peace' || menu) && this.phraseCount % 5 === 0;
    const p = composePhrase({ mode: this.mode, tonic: this.tonic, meter, bars: 4, intensity: this.intensity, age: this.age, menu, prevDeg: this.lastDeg, motif: this.motif, lead: this.phraseCount % 2 === 0 ? 'aulos' : 'lyre' }, r);
    if (breathe) p.notes = p.notes.filter((n) => n.inst !== 'lyre' && n.inst !== 'aulos' && n.inst !== 'aulos2');
    this.phrase = p; this.idx = 0; this.lastDeg = p.lastDeg; this.motif = r() < 0.7 ? p.motif : null;
  }
}
