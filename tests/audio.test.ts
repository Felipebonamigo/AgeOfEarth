// Áudio: lógica pura sem AudioContext (receita por efeito, espacialização, agregação de batalha, intensidade musical,
// escalas modais e composição, ambiente por bioma, cordas Karplus-Strong, migração dos volumes nas configurações).
import { describe, it, expect } from 'vitest';
import type { GameMap, VisualEffect } from '../src/core/types';
import { TERRAIN } from '../src/core/constants';
import { aggregateCombat, cuesForEffect, deathRecipe, gaitOf, spatialize, workRecipe, COMBAT_CATS, type Placed, type ListenerView } from '../src/audio/events';
import { RECIPES, RECIPE_CATEGORY } from '../src/audio/sfx';
import { MODES, chooseIntensity, composePhrase, degreeToMidi, inMode, layersFor, midiToHz, nearestChordTone, progression, tempoFor, composeCadence, INTENSITY_RULES, type IntensityState, type ModeName } from '../src/audio/music';
import { ambienceTargets, sampleBiome } from '../src/audio/ambience';
import { ksFill, CATEGORY_LIMITS, MAX_VOICES } from '../src/audio/engine';
import { loadSettings } from '../src/game/settings';

/** Gerador reprodutível para os testes de composição. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const fx = (type: string, extra: Partial<VisualEffect> = {}): VisualEffect => ({ type, x: 10, y: 10, ttl: 5, total: 5, ...extra });
const VIEW: ListenerView = { x0: 0, y0: 0, x1: 40, y1: 20, zoom: 1 };

describe('áudio: receita por efeito', () => {
  it('projéteis tocam na origem e o impacto chega atrasado no alvo', () => {
    const arrow = cuesForEffect(fx('projectile', { tx: 20, ty: 12, data: 'arrow' }));
    expect(arrow.map((c) => c.recipe)).toEqual(['bow', 'arrowImpact']);
    expect(arrow[1]).toMatchObject({ x: 20, y: 12 }); expect(arrow[1].delay).toBeGreaterThan(0.1);
    expect(cuesForEffect(fx('projectile', { data: 'rock' }))[0].recipe).toBe('catapult');
    expect(cuesForEffect(fx('projectile', { data: 'bolt' }))[0].recipe).toBe('mythShot');
    expect(cuesForEffect(fx('splash'))[0]).toMatchObject({ recipe: 'stoneImpact' });
  });
  it('cada efeito do núcleo tem som; desconhecidos ficam mudos', () => {
    const map: Record<string, string> = { hit: 'melee', collapse: 'collapse', spawn: 'summon', heal: 'heal', bolt: 'zeusBolt', quake: 'quake', titanRise: 'titanRise', ability: 'ability', curse: 'curse', pestilence: 'pestilence', petrify: 'petrify', bronze: 'bronzeRing' };
    for (const [type, recipe] of Object.entries(map)) expect(cuesForEffect(fx(type))[0]?.recipe, type).toBe(recipe);
    expect(cuesForEffect(fx('nodeGone', { data: 'tree' }))[0].recipe).toBe('treeFall');
    expect(cuesForEffect(fx('nodeGone', { data: 'berry' }))).toEqual([]);
    expect(cuesForEffect(fx('algoNovo'))).toEqual([]);
    expect(cuesForEffect(fx('bronze'))[0].global).toBe(true);
  });
  it('morte por tipo de unidade (humano, cavalo, criatura, voador, cerco)', () => {
    expect(deathRecipe('hoplite')).toBe('deathHuman'); expect(deathRecipe('villager')).toBe('deathHuman');
    expect(deathRecipe('hippeus')).toBe('deathHorse'); expect(deathRecipe('minotaur')).toBe('deathMyth');
    expect(deathRecipe('pegasus')).toBe('deathWing'); expect(deathRecipe('petrobolos')).toBe('treeFall');
    expect(deathRecipe('cronus')).toBe('deathMyth'); expect(deathRecipe(undefined)).toBe('deathHuman');
    expect(cuesForEffect(fx('death', { data: 'hippeus' }))[0].recipe).toBe('deathHorse');
  });
  it('todas as receitas existem e têm categoria com limite de vozes', () => {
    for (const name of Object.keys(RECIPES) as (keyof typeof RECIPES)[]) {
      expect(typeof RECIPES[name]).toBe('function');
      const cat = RECIPE_CATEGORY[name]; expect(cat, name).toBeTruthy();
      expect(CATEGORY_LIMITS[cat] ?? 3).toBeLessThanOrEqual(MAX_VOICES);
    }
    expect(Object.keys(RECIPES).length).toBeGreaterThanOrEqual(40);
    expect(MAX_VOICES).toBe(24);
  });
  it('sons de trabalho e passadas', () => {
    expect(workRecipe('gather', 'tree')?.recipe).toBe('axe'); expect(workRecipe('gather', 'gold')?.recipe).toBe('pick');
    expect(workRecipe('gather', 'berry')?.recipe).toBe('rustle'); expect(workRecipe('gather', 'farm')?.recipe).toBe('rustle');
    expect(workRecipe('build', null)?.recipe).toBe('hammer'); expect(workRecipe('gather', null)).toBeNull();
    expect(gaitOf('hoplite')).toBe('foot'); expect(gaitOf('hippeus')).toBe('hoof'); expect(gaitOf('pegasus')).toBeNull(); expect(gaitOf('cronus')).toBe('heavy');
  });
});

describe('áudio: espacialização e agregação', () => {
  it('atenua pela distância ao centro da câmera; fora da tela cai forte e abafa', () => {
    const c = spatialize(20, 10, VIEW)!; expect(c.gain).toBeCloseTo(1, 5); expect(c.pan).toBeCloseTo(0); expect(c.muffle).toBe(0);
    const edge = spatialize(40, 10, VIEW)!; expect(edge.gain).toBeCloseTo(0.7, 5); expect(edge.pan).toBeGreaterThan(0.5);
    const left = spatialize(0, 10, VIEW)!; expect(left.pan).toBeLessThan(-0.5);
    const half = spatialize(50, 10, VIEW)!;   // meia tela fora
    expect(half.gain).toBeLessThan(0.3); expect(half.muffle).toBeGreaterThan(0.3);
    const far = spatialize(60, 10, VIEW)!; expect(far.gain).toBeLessThan(half.gain);
    expect(spatialize(90, 10, VIEW)).toBeNull();
    // afastar o zoom deixa tudo mais distante
    expect(spatialize(20, 10, { ...VIEW, zoom: 0.4 })!.gain).toBeLessThan(0.8);
  });
  it('muitos golpes no mesmo quadro viram intensidade de batalha, não 50 sons', () => {
    const items: Placed[] = [];
    for (let i = 0; i < 50; i++) items.push({ cue: { recipe: 'melee', x: 20, y: 10 }, sp: { gain: 0.5 + (i % 5) * 0.1, pan: 0, muffle: 0, reverb: 0.1 }, cat: 'melee' });
    items.push({ cue: { recipe: 'zeusBolt', x: 20, y: 10 }, sp: { gain: 1, pan: 0, muffle: 0, reverb: 0.1 }, cat: 'power' });
    for (let i = 0; i < 6; i++) items.push({ cue: { recipe: 'bow', x: 20, y: 10 }, sp: { gain: 0.4, pan: 0, muffle: 0, reverb: 0.1 }, cat: 'bow' });
    const agg = aggregateCombat(items, 2);
    expect(agg.play.filter((p) => p.cat === 'melee')).toHaveLength(2);
    expect(agg.play.filter((p) => p.cat === 'bow')).toHaveLength(2);
    expect(agg.play.some((p) => p.cat === 'power')).toBe(true);
    expect(agg.overflow).toBe(48 + 4);
    expect(agg.play.filter((p) => p.cat === 'melee').every((p) => p.sp.gain >= 0.9)).toBe(true);   // os mais altos tocam
    expect(agg.intensity).toBeGreaterThan(30);
    expect(COMBAT_CATS.has('power')).toBe(false);
    expect(aggregateCombat([], 2)).toEqual({ play: [], overflow: 0, intensity: 0 });
  });
});

describe('áudio: intensidade da música', () => {
  it('sobe na hora e desce só após calma (com histerese)', () => {
    let s: IntensityState = { current: 'peace', calm: 0 };
    s = chooseIntensity(s, 0.1, 1); expect(s.current).toBe('peace');
    s = chooseIntensity(s, 0.5, 0.1); expect(s.current).toBe('tension');
    s = chooseIntensity(s, 3, 0.1); expect(s.current).toBe('battle');
    for (let i = 0; i < 70; i++) s = chooseIntensity(s, 1.5, 0.1);   // ainda há luta: segura a batalha
    expect(s.current).toBe('battle');
    for (let i = 0; i < 75; i++) s = chooseIntensity(s, 0, 0.1);     // 7,5 s de calma: ainda batalha
    expect(s.current).toBe('battle');
    for (let i = 0; i < 10; i++) s = chooseIntensity(s, 0, 0.1);
    expect(s.current).toBe('tension');
    for (let i = 0; i < INTENSITY_RULES.tensionHold * 10 + 5; i++) s = chooseIntensity(s, 0, 0.1);
    expect(s.current).toBe('peace');
    // holdScale encurta a volta (usado pelo playtest)
    let q: IntensityState = { current: 'battle', calm: 0 };
    for (let i = 0; i < 20; i++) q = chooseIntensity(q, 0, 0.1, 0.2);
    expect(q.current).toBe('tension');
  });
  it('andamento e instrumentação crescem com a Idade e a intensidade', () => {
    expect(tempoFor(4, 'peace')).toBeGreaterThan(tempoFor(0, 'peace'));
    expect(tempoFor(2, 'battle')).toBeGreaterThan(tempoFor(2, 'tension'));
    expect(tempoFor(2, 'tension')).toBeGreaterThan(tempoFor(2, 'peace'));
    expect(tempoFor(3, 'battle', true)).toBe(58);
    const sizes = [0, 1, 2, 3, 4].map((a) => layersFor(a, 'battle').size);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
    expect(layersFor(0, 'peace').has('aulos')).toBe(false); expect(layersFor(1, 'peace').has('aulos')).toBe(true);
    expect(layersFor(4, 'battle').has('bigdrum')).toBe(true); expect(layersFor(0, 'peace', true).has('drone')).toBe(true);
  });
});

describe('áudio: escalas modais e composição', () => {
  it('modos gregos (dórico, frígio, mixolídio) e graus → MIDI', () => {
    expect([...MODES.dorian]).toEqual([0, 2, 3, 5, 7, 9, 10]);
    expect([...MODES.phrygian]).toEqual([0, 1, 3, 5, 7, 8, 10]);
    expect([...MODES.mixolydian]).toEqual([0, 2, 4, 5, 7, 9, 10]);
    // Ré dórico: D E F G A B C D
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((d) => degreeToMidi(50, 'dorian', d))).toEqual([50, 52, 53, 55, 57, 59, 60, 62]);
    expect(degreeToMidi(50, 'phrygian', -1)).toBe(48);   // abaixo da tônica
    expect(inMode(51, 50, 'phrygian')).toBe(true); expect(inMode(51, 50, 'dorian')).toBe(false);
    expect(midiToHz(69)).toBeCloseTo(440); expect(midiToHz(81)).toBeCloseTo(880);
    expect(nearestChordTone(3, 0)).toBe(2); expect(nearestChordTone(7, 0)).toBe(7);
  });
  it('progressões começam e terminam na tônica, com cadência do modo', () => {
    const r = mulberry32(7);
    for (const mode of Object.keys(MODES) as ModeName[]) for (let i = 0; i < 30; i++) {
      const p = progression(mode, 4, r);
      expect(p).toHaveLength(4); expect(p[0]).toBe(0); expect(p[3]).toBe(0);
      for (let j = 1; j < p.length; j++) expect(p[j]).not.toBe(p[j - 1]);
      if (mode !== 'phrygian') expect(p).not.toContain(1);
    }
  });
  it('melodia no modo, por passos, termina em nota do acorde da tônica; nada se repete em 10 minutos', () => {
    const r = mulberry32(42);
    let steps = 0, total = 0, recovered = 0, leaps = 0; let prevDeg = 14;
    const seen = new Set<string>();
    let seconds = 0; let phrases = 0;
    while (seconds < 600) {
      const intensity = (['peace', 'tension', 'battle'] as const)[phrases % 3];
      const mode = (Object.keys(MODES) as ModeName[])[phrases % 3];
      const meter = ([8, 6, 7] as const)[phrases % 3];
      const p = composePhrase({ mode, tonic: 43, meter, bars: 4, intensity, age: phrases % 5, prevDeg, motif: null }, r);
      expect(p.length).toBe(4 * meter);
      for (const n of p.notes) { expect(n.at).toBeGreaterThanOrEqual(0); expect(n.at).toBeLessThan(p.length); if (n.midi) expect(inMode(n.midi, 43, mode), `${mode} ${n.inst} ${n.midi}`).toBe(true); }
      const m = p.melody;
      for (let i = 1; i < m.length; i++) {
        const iv = m[i] - m[i - 1]; total++;
        if (Math.abs(iv) <= 2) steps++;
        expect(Math.abs(iv)).toBeLessThanOrEqual(7);
        if (i >= 2 && Math.abs(m[i - 1] - m[i - 2]) >= 3) { leaps++; if (Math.sign(iv) === -Math.sign(m[i - 1] - m[i - 2]) || iv === 0) recovered++; }
      }
      expect(((p.lastDeg % 7) + 7) % 7 === 0 || ((p.lastDeg % 7) + 7) % 7 === 2 || ((p.lastDeg % 7) + 7) % 7 === 4).toBe(true);
      seen.add(`${mode}:${meter}:${m.join(',')}`);
      prevDeg = p.lastDeg;
      seconds += p.length * (30 / tempoFor(phrases % 5, intensity)); phrases++;
    }
    expect(steps / total).toBeGreaterThan(0.6);
    expect(recovered / Math.max(1, leaps)).toBeGreaterThan(0.6);
    expect(seen.size).toBe(phrases);   // nenhuma frase igual em 10 minutos de música
    expect(phrases).toBeGreaterThan(40);
  });
  it('cadências de vitória (mixolídio) e derrota (frígio)', () => {
    const v = composeCadence(true, 50); const d = composeCadence(false, 52);
    expect(v.notes.filter((n) => n.midi).every((n) => inMode(n.midi, 50, 'mixolydian'))).toBe(true);
    expect(d.notes.filter((n) => n.midi).every((n) => inMode(n.midi, 52, 'phrygian'))).toBe(true);
    expect(v.tempo).toBeGreaterThan(d.tempo);
  });
});

describe('áudio: ambiente por bioma', () => {
  const mk = (w: number, h: number, fill: (x: number, y: number) => number, trees: [number, number][] = []): GameMap => {
    const terrain = new Uint8Array(w * h); const nodeAt = new Int32Array(w * h).fill(-1); const nodes = new Map();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) terrain[y * w + x] = fill(x, y);
    trees.forEach(([x, y], i) => { nodeAt[y * w + x] = i; nodes.set(i, { id: i, type: 'tree', x, y, amount: 100, max: 100 }); });
    return { w, h, terrain, nodeAt, nodes } as unknown as GameMap;
  };
  it('proporção de água, montanha e floresta sob a câmera', () => {
    const coast = mk(40, 40, (x) => (x < 20 ? TERRAIN.WATER : TERRAIN.GRASS));
    const m = sampleBiome(coast, { x0: 0, y0: 0, x1: 39, y1: 39, zoom: 1 });
    expect(m.water).toBeGreaterThan(0.4); expect(m.water).toBeLessThan(0.6); expect(m.grass).toBeGreaterThan(0.4);
    const inland = sampleBiome(coast, { x0: 25, y0: 0, x1: 39, y1: 20, zoom: 1 });
    expect(inland.water).toBe(0);
    expect(ambienceTargets(m).water).toBeGreaterThan(ambienceTargets(inland).water);
    const trees: [number, number][] = []; for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) trees.push([x, y]);
    const forest = sampleBiome(mk(40, 40, () => TERRAIN.GRASS, trees), { x0: 0, y0: 0, x1: 39, y1: 39, zoom: 1 });
    expect(forest.forest).toBe(1);
    expect(ambienceTargets(forest).birdRate).toBeGreaterThan(ambienceTargets(m).birdRate);
    expect(ambienceTargets(forest).leaves).toBeGreaterThan(0);
    const alps = sampleBiome(mk(20, 20, () => TERRAIN.MOUNTAIN), { x0: 0, y0: 0, x1: 19, y1: 19, zoom: 1 });
    expect(ambienceTargets(alps).mountain).toBeGreaterThan(0.3); expect(ambienceTargets(alps).birdRate).toBe(0);
    // zoom afastado: mais vento, menos pássaros
    expect(ambienceTargets({ ...m, zoom: 0.35 }).wind).toBeGreaterThan(ambienceTargets(m).wind);
    expect(ambienceTargets({ ...m, zoom: 0.35 }).birdRate).toBeLessThan(ambienceTargets(m).birdRate);
    // tiles inexplorados não contam
    const vis = new Uint8Array(40 * 40); for (let y = 0; y < 40; y++) for (let x = 20; x < 40; x++) vis[y * 40 + x] = 1;
    expect(sampleBiome(coast, { x0: 0, y0: 0, x1: 39, y1: 39, zoom: 1 }, vis).water).toBe(0);
  });
});

describe('áudio: síntese e configurações', () => {
  it('Karplus-Strong: corda com a altura pedida e decaimento', () => {
    const sr = 48000; const d = new Float32Array(sr); ksFill(d, sr, 220, 0.7);
    const energy = (a: number, b: number) => { let e = 0; for (let i = a; i < b; i++) e += d[i] * d[i]; return e; };
    expect(energy(0, 4800)).toBeGreaterThan(energy(sr - 4800, sr) * 4);
    // autocorrelação: pico no período (≈ sr/220 amostras)
    const p = Math.round(sr / 220); const ac = (lag: number) => { let s = 0; for (let i = 2000; i < 12000; i++) s += d[i] * d[i + lag]; return s; };
    expect(ac(p)).toBeGreaterThan(ac(Math.round(p / 2)));
    expect(ac(p)).toBeGreaterThan(0);
  });
  it('volumes separados com padrão para saves antigos e migração do volume antigo', () => {
    const store: Record<string, string> = { aoe_settings_v1: JSON.stringify({ volume: 0.3, muted: false }), aoe_volume: '0.7', aoe_muted: '1' };
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    try {
      const s = loadSettings();
      expect(s).toMatchObject({ volume: 0.7, muted: true, sfxVolume: 0.8, musicVolume: 0.5, ambienceVolume: 0.6 });
      store.aoe_settings_v1 = JSON.stringify({ volume: 0.2, muted: false, sfxVolume: 0.1, musicVolume: 2, ambienceVolume: 'x' });
      expect(loadSettings()).toMatchObject({ volume: 0.2, muted: false, sfxVolume: 0.1, musicVolume: 1, ambienceVolume: 0.6 });   // já migrado: aoe_volume ignorado; inválidos corrigidos
    } finally { delete (globalThis as { localStorage?: unknown }).localStorage; }
  });
});
