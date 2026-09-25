// Som ambiente por bioma sob a câmera: vento contínuo com rajadas, vento de montanha (assobio), água/ondas pela
// proporção de água visível, folhas na floresta, cigarras em grama/areia (em ciclos) e pássaros esparsos (chirps
// sintetizados). As camadas contínuas são laços de ruído em cache; os alvos mudam com crossfade suave.
import type { AudioEngine, Recipe } from './engine';
import { pick, rnd, tone } from './synth';
import { TERRAIN } from '../core/constants';
import type { GameMap } from '../core/types';

export interface BiomeMix { grass: number; forest: number; water: number; mountain: number; sand: number; zoom: number }
export const MENU_MIX: BiomeMix = { grass: 0.5, forest: 0.1, water: 0.35, mountain: 0.05, sand: 0.1, zoom: 1 };

/**
 * Proporções de bioma no retângulo visível (amostragem em grade, no máx. ~15×15 pontos). Tiles inexplorados
 * (visibilidade 0) não contam; sem nada explorado, o resultado é neutro (só vento).
 */
export function sampleBiome(map: GameMap, view: { x0: number; y0: number; x1: number; y1: number; zoom: number }, vis?: Uint8Array | null): BiomeMix {
  const x0 = Math.max(0, Math.floor(view.x0)), y0 = Math.max(0, Math.floor(view.y0));
  const x1 = Math.min(map.w - 1, Math.ceil(view.x1)), y1 = Math.min(map.h - 1, Math.ceil(view.y1));
  const step = Math.max(1, Math.floor(Math.max(x1 - x0, y1 - y0) / 15));
  let n = 0, grass = 0, forest = 0, water = 0, mountain = 0, sand = 0;
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
    const i = y * map.w + x;
    if (vis && vis[i] === 0) continue;
    n++;
    const tr = map.terrain[i];
    if (tr === TERRAIN.WATER || tr === TERRAIN.DEEP) water++;
    else if (tr === TERRAIN.MOUNTAIN) mountain++;
    else if (tr === TERRAIN.SAND) sand++;
    else { const nid = map.nodeAt[i]; if (nid >= 0 && map.nodes.get(nid)?.type === 'tree') forest++; else grass++; }
  }
  if (n === 0) return { grass: 0, forest: 0, water: 0, mountain: 0, sand: 0, zoom: view.zoom };
  return { grass: grass / n, forest: forest / n, water: water / n, mountain: mountain / n, sand: sand / n, zoom: view.zoom };
}

export interface AmbienceTargets { wind: number; mountain: number; water: number; leaves: number; cicadas: number; birdRate: number }
/** Mistura-alvo das camadas: quanto mais longe (zoom baixo), mais vento e menos detalhe (pássaros, cigarras, folhas). */
export function ambienceTargets(m: BiomeMix): AmbienceTargets {
  const near = Math.max(0.35, Math.min(1, (m.zoom - 0.3) / 0.9));   // 0,35 (longe) … 1 (perto)
  const land = m.grass + m.forest + m.sand;
  return {
    wind: 0.18 + 0.25 * (1 - near) + 0.2 * m.mountain + 0.1 * m.sand,
    mountain: 0.5 * m.mountain,
    water: Math.min(0.7, 0.9 * Math.sqrt(m.water)),
    leaves: 0.45 * m.forest * near,
    cicadas: 0.22 * Math.min(1, (m.grass * 0.7 + m.sand + m.forest * 0.4) * 1.3) * near,
    birdRate: land > 0.05 ? (0.12 + 0.35 * m.forest + 0.15 * m.grass) * near : 0,   // chirps por segundo
  };
}

// ---------------- Pássaros (chirps sintetizados) ----------------
/** Pardal: 3–6 piados curtos com glissando descendente. */
const sparrow: Recipe = (h, out, t) => {
  const n = 3 + Math.floor(Math.random() * 4); const f = rnd(3200, 4800); let tt = t;
  for (let i = 0; i < n; i++) { tone(h, out, tt, { f: f * rnd(0.95, 1.08), f2: f * 0.7, glide: 0.05, gain: 0.03, attack: 0.005, decay: 0.05 }); tt += rnd(0.07, 0.13); }
  return tt - t + 0.06;
};
/** Toutinegra: trinado com modulação rápida, descendo. */
const warbler: Recipe = (h, out, t) => { const f = rnd(2800, 4000); tone(h, out, t, { f, f2: f * 0.75, glide: 0.5, gain: 0.02, attack: 0.02, decay: 0.45, vibrato: { rate: rnd(24, 38), depth: 0.08, delay: 0 } }); return 0.5; };
/** Rolinha (mediterrânea): "cu-CUU-cu" grave e suave. */
const dove: Recipe = (h, out, t) => {
  const f = rnd(480, 560);
  [[0, 0.18, 0.8], [0.3, 0.42, 1], [0.85, 0.3, 0.7]].forEach(([d, len, g]) => tone(h, out, t + d, { f: f * (g === 1 ? 1.06 : 1), f2: f * 0.94, glide: len, gain: 0.025 * g, attack: 0.05, decay: len, vibrato: { rate: 6, depth: 0.01 } }));
  return 1.3;
};
const BIRDS = [sparrow, sparrow, warbler, dove];

export class Ambience {
  private built = false;
  private layers: Record<'wind' | 'mountain' | 'water' | 'leaves' | 'cicadas', { gain: GainNode; filter: BiquadFilterNode }> | null = null;
  private targets: AmbienceTargets = { wind: 0, mountain: 0, water: 0, leaves: 0, cicadas: 0, birdRate: 0 };
  private nextGust = 0; private nextSwell = 0; private nextBird = 0; private cicadaOn = true; private nextCicada = 0; private nextWhistle = 0;
  constructor(private engine: AudioEngine) {}

  private build(): void {
    const e = this.engine; const ctx = e.ctx; const bus = e.input('ambience');
    const loop = (color: 'white' | 'pink' | 'brown', type: BiquadFilterType, f: number, q: number, rate = 1) => {
      const src = ctx.createBufferSource(); src.buffer = e.noise(color); src.loop = true; src.playbackRate.value = rate;
      const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = f; filter.Q.value = q;
      const gain = ctx.createGain(); gain.gain.value = 0;
      src.connect(filter); filter.connect(gain); gain.connect(bus.dry);
      src.start(ctx.currentTime, Math.random() * 3);
      return { gain, filter };
    };
    const cic = loop('white', 'bandpass', 5200, 7);
    // cigarras: modulação de amplitude rápida (tímbalo) por um LFO somado ao ganho
    const am = ctx.createGain(); am.gain.value = 0.5;
    cic.gain.disconnect(); cic.filter.disconnect(); cic.filter.connect(am); am.connect(cic.gain); cic.gain.connect(bus.dry);
    const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = rnd(38, 52);
    const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain); lfo.start();
    const water = loop('pink', 'lowpass', 600, 0.5);
    const wet = ctx.createGain(); wet.gain.value = 0.3; water.gain.connect(wet); wet.connect(bus.wet);
    this.layers = {
      wind: loop('brown', 'bandpass', 380, 0.6),
      mountain: loop('white', 'bandpass', 1000, 9),
      water,
      leaves: loop('white', 'highpass', 2600, 0.7),
      cicadas: cic,
    };
    this.built = true;
    this.engine.count('ambience', 5);
  }

  /** Mistura atual (para testes/estatísticas). */
  levels(): AmbienceTargets { return { ...this.targets }; }

  /** A cada quadro: alvos por bioma, rajadas, vagas, ciclos de cigarra e pássaros. */
  update(mix: BiomeMix | null): void {
    const e = this.engine; if (!e.running) return;
    if (!this.built) this.build();
    const ctx = e.ctx; const now = ctx.currentTime; const L = this.layers!;
    const tg = ambienceTargets(mix ?? MENU_MIX);
    const moved = (Object.keys(tg) as (keyof AmbienceTargets)[]).some((k) => Math.abs(tg[k] - this.targets[k]) > 0.01);
    this.targets = tg;
    if (moved) {
      // crossfade suave ao mover a câmera
      L.mountain.gain.gain.setTargetAtTime(tg.mountain, now, 1.2);
      L.leaves.gain.gain.setTargetAtTime(tg.leaves, now, 1.2);
    }
    // cigarras: cantam em ciclos (6–14 s) com pausas (4–15 s)
    if (now >= this.nextCicada) { this.cicadaOn = !this.cicadaOn; this.nextCicada = now + (this.cicadaOn ? rnd(6, 14) : rnd(4, 15)); L.cicadas.gain.gain.setTargetAtTime(this.cicadaOn ? tg.cicadas : 0, now, this.cicadaOn ? 1.5 : 0.8); L.cicadas.filter.frequency.setTargetAtTime(rnd(4600, 5800), now, 0.5); }
    else if (moved && this.cicadaOn) L.cicadas.gain.gain.setTargetAtTime(tg.cicadas, now, 1.2);
    // rajadas de vento
    if (now >= this.nextGust || moved) {
      if (now >= this.nextGust) this.nextGust = now + rnd(2, 6);
      const g = tg.wind * rnd(0.6, 1.4);
      L.wind.gain.gain.setTargetAtTime(g, now, 1.3); L.wind.filter.frequency.setTargetAtTime(rnd(260, 620), now, 1.5);
      L.leaves.gain.gain.setTargetAtTime(tg.leaves * rnd(0.5, 1.3), now, 1);
    }
    if (now >= this.nextWhistle) { this.nextWhistle = now + rnd(1.5, 4); L.mountain.filter.frequency.setTargetAtTime(rnd(700, 1500), now, 1.2); }
    // vagas: a água sobe e desce a cada 5–9 s, com o filtro abrindo na crista
    if (now >= this.nextSwell || moved) {
      if (now >= this.nextSwell) {
        const per = rnd(5, 9); this.nextSwell = now + per;
        const p = L.water.gain.gain; p.cancelScheduledValues(now); p.setTargetAtTime(tg.water * rnd(0.9, 1.2), now, per * 0.2); p.setTargetAtTime(tg.water * 0.45, now + per * 0.45, per * 0.2);
        const f = L.water.filter.frequency; f.cancelScheduledValues(now); f.setTargetAtTime(rnd(900, 1500), now, per * 0.2); f.setTargetAtTime(420, now + per * 0.45, per * 0.2);
      } else L.water.gain.gain.setTargetAtTime(tg.water * 0.8, now, 1.2);
    }
    // pássaros esparsos
    if (tg.birdRate > 0 && now >= this.nextBird) {
      this.nextBird = now + (1 / tg.birdRate) * rnd(0.4, 1.8);
      e.play('bird', pick(BIRDS), { bus: 'ambience', gain: rnd(0.5, 1), pan: rnd(-0.8, 0.8), reverb: 0.35, muffle: rnd(0, 0.3), priority: 0 });
    } else if (tg.birdRate === 0) this.nextBird = now + 1;
  }
}
