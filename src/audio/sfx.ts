// Receitas de efeitos sonoros por síntese (sem arquivos). Cada receita varia altura, tempo e timbre a cada disparo
// (k ∈ [0,1) sorteado pelo motor + Math.random interno) e devolve a própria duração.
// Nomes estáveis: events.ts escolhe a receita a partir dos efeitos/eventos do estado; audio.ts mapeia os sons de interface.
import type { Recipe } from './engine';
import { crackles, noise, partials, pick, pluck, rnd, thump, tone, vary, voice, VOWELS } from './synth';

// Razões de parciais medidas em pratos/escudos de bronze (inarmônicas) e em sinos de bronze (terça menor)
const BRONZE = [1, 1.47, 2.09, 2.56, 3.37, 4.72, 5.9] as const;
const BELL = [0.5, 1, 1.19, 1.56, 2, 2.66, 3.01] as const;
const COIN = [1, 1.34, 2.1, 2.72] as const;

// ---------------- Combate ----------------
/** Choque de bronze: espada contra escudo/elmo — parciais inarmônicas, ruído agudo e decaimento curto. */
const clash: Recipe = (h, out, t) => {
  const f = rnd(850, 1500);
  const d = partials(h, out, t, f, BRONZE, 0.09, rnd(0.18, 0.4), { spread: 0.01 });
  noise(h, out, t, { gain: 0.35, decay: 0.03, filters: [{ type: 'highpass', f: 2500 }] });
  if (Math.random() < 0.5) thump(h, out, t, rnd(120, 170), 0.25, 0.08);   // escudo de madeira por trás
  return d;
};
/** Golpe em carne/couro/escudo de madeira: ruído grave + baque, com o assobio da lâmina antes. */
const flesh: Recipe = (h, out, t) => {
  noise(h, out, t, { gain: 0.12, attack: 0.03, decay: 0.03, filters: [{ type: 'bandpass', f: 2400, f2: 700, glide: 0.06, q: 1.2 }] });
  const ti = t + rnd(0.04, 0.06);
  noise(h, out, ti, { color: 'pink', gain: 0.5, decay: vary(0.08, 0.3), filters: [{ type: 'lowpass', f: rnd(500, 900), q: 1 }] });
  thump(h, out, ti, rnd(80, 110), 0.5, 0.12, 0.45);
  return 0.2;
};
/** Escudo de madeira/couro: batida oca. */
const shieldWood: Recipe = (h, out, t) => {
  pluck(h, out, t, rnd(160, 230), 0.35, { bright: 0.2, dur: 0.18 });
  noise(h, out, t, { color: 'pink', gain: 0.35, decay: 0.05, filters: [{ type: 'bandpass', f: rnd(700, 1100), q: 1.5 }] });
  thump(h, out, t, rnd(110, 140), 0.35, 0.09);
  return 0.2;
};
/** Corpo a corpo: sorteia entre bronze, carne e escudo de madeira. */
const melee: Recipe = (h, out, t, k) => (k < 0.45 ? clash(h, out, t, k) : k < 0.8 ? flesh(h, out, t, k) : shieldWood(h, out, t, k));

/** Arco: corda curta (Karplus-Strong) + estalo de soltura + início do assobio da flecha. */
const bow: Recipe = (h, out, t) => {
  pluck(h, out, t, rnd(170, 260), 0.35, { bright: 0.7, dur: 0.22 });
  noise(h, out, t, { gain: 0.12, decay: 0.02, filters: [{ type: 'bandpass', f: 1800, q: 2 }] });
  noise(h, out, t + 0.02, { gain: 0.09, attack: 0.05, decay: 0.12, filters: [{ type: 'bandpass', f: 3200, f2: 1400, glide: 0.2, q: 4 }] });
  return 0.3;
};
/** Chegada da flecha: fim do assobio + fincada (terra/madeira) ou tinido raro em armadura. */
const arrowImpact: Recipe = (h, out, t, k) => {
  noise(h, out, t, { gain: 0.07, attack: 0.06, decay: 0.05, filters: [{ type: 'bandpass', f: 1800, f2: 900, glide: 0.1, q: 5 }] });
  const ti = t + 0.1;
  if (k < 0.2) partials(h, out, ti, rnd(2400, 3400), [1, 2.3, 3.9], 0.05, 0.08);
  else { noise(h, out, ti, { color: 'pink', gain: 0.25, decay: 0.035, filters: [{ type: 'lowpass', f: rnd(700, 1200) }] }); thump(h, out, ti, rnd(180, 240), 0.15, 0.04); }
  return 0.25;
};
/** Projétil mítico (ciclope, mantícora...): zumbido com queda de altura. */
const mythShot: Recipe = (h, out, t) => {
  tone(h, out, t, { type: 'sawtooth', f: rnd(500, 700), f2: 160, glide: 0.35, gain: 0.05, attack: 0.02, decay: 0.33, filter: { type: 'lowpass', f: 1500 } });
  noise(h, out, t, { gain: 0.08, attack: 0.04, decay: 0.3, filters: [{ type: 'bandpass', f: 1200, f2: 400, glide: 0.35, q: 3 }] });
  return 0.4;
};
/** Catapulta disparando: rangido de madeira + estalo do braço + baque. */
const catapult: Recipe = (h, out, t) => {
  pluck(h, out, t, rnd(70, 95), 0.3, { bright: 0.2, dur: 0.35, bend: 0.8 });
  noise(h, out, t + 0.12, { color: 'pink', gain: 0.4, decay: 0.07, filters: [{ type: 'bandpass', f: 600, q: 1 }] });
  thump(h, out, t + 0.12, 70, 0.5, 0.2);
  noise(h, out, t + 0.16, { color: 'pink', gain: 0.12, attack: 0.05, decay: 0.3, filters: [{ type: 'bandpass', f: 500, f2: 250, glide: 0.35, q: 2 }] });
  return 0.55;
};
/** Impacto de pedra/catapulta: baque grave + estrondo + estilhaços. */
const stoneImpact: Recipe = (h, out, t) => {
  thump(h, out, t, rnd(60, 80), 0.9, 0.45, 0.45);
  noise(h, out, t, { color: 'brown', gain: 0.8, decay: vary(0.5, 0.2), filters: [{ type: 'lowpass', f: 450 }] });
  noise(h, out, t, { color: 'pink', gain: 0.25, decay: 0.12, filters: [{ type: 'bandpass', f: 1400, q: 0.8 }] });
  crackles(h, out, t + 0.04, Math.floor(rnd(6, 12)), 0.45, 0.25, 1500, 5000);
  return 0.6;
};

// ---------------- Movimento ----------------
/** Cascos: galope (três batidas e pausa) com variação de tempo e timbre; `k` = densidade (1 = tropa). */
const hooves: Recipe = (h, out, t, k) => {
  const strides = 2; const riders = k > 0.6 ? 2 : 1;
  for (let r = 0; r < riders; r++) {
    let tt = t + r * rnd(0.03, 0.09);
    for (let s = 0; s < strides; s++) {
      for (const gap of [0, 0.075, 0.075]) {
        tt += vary(gap, 0.25);
        noise(h, out, tt, { gain: rnd(0.25, 0.4), decay: 0.03, filters: [{ type: 'bandpass', f: rnd(700, 1300), q: 1.8 }] });
        thump(h, out, tt, rnd(150, 200), 0.3, 0.035);
      }
      tt += vary(0.2, 0.15);
    }
  }
  return 0.9;
};
/** Passos de tropa em marcha: batidas de sandália/cascalho sobrepostas (k = tamanho da tropa). */
const march: Recipe = (h, out, t, k) => {
  const feet = 2 + Math.floor(k * 5);
  for (let i = 0; i < feet; i++) {
    const tt = t + rnd(0, 0.09);
    noise(h, out, tt, { color: 'brown', gain: rnd(0.25, 0.45), decay: rnd(0.04, 0.07), filters: [{ type: 'lowpass', f: rnd(350, 600) }] });
    noise(h, out, tt + 0.01, { gain: rnd(0.03, 0.07), decay: 0.03, filters: [{ type: 'highpass', f: 2500 }] });
  }
  if (k > 0.5 && Math.random() < 0.4) partials(h, out, t + rnd(0, 0.1), rnd(1800, 2600), [1, 2.7], 0.015, 0.06);   // armaduras chacoalhando
  return 0.2;
};
/** Passos pesados de criatura (ciclope, titã). */
const heavyStep: Recipe = (h, out, t) => { thump(h, out, t, rnd(45, 60), 0.8, 0.35, 0.6); noise(h, out, t, { color: 'brown', gain: 0.4, decay: 0.3, filters: [{ type: 'lowpass', f: 200 }] }); return 0.4; };

// ---------------- Trabalho ----------------
/** Machado na madeira: ressonância do tronco (Karplus grave) + estalo + lascas. */
const axe: Recipe = (h, out, t) => {
  pluck(h, out, t, rnd(130, 190), 0.4, { bright: 0.25, dur: 0.25 });
  noise(h, out, t, { color: 'pink', gain: 0.4, decay: 0.05, filters: [{ type: 'bandpass', f: rnd(900, 1500), q: 1.4 }] });
  thump(h, out, t, rnd(100, 130), 0.3, 0.06);
  if (Math.random() < 0.3) crackles(h, out, t + 0.02, 3, 0.12, 0.08, 2000, 5000);
  return 0.3;
};
/** Picareta na pedra/ouro: tinido metálico + pó de pedra. */
const pick_: Recipe = (h, out, t) => {
  partials(h, out, t, rnd(2100, 3200), [1, 2.76, 5.4], 0.07, rnd(0.08, 0.16));
  noise(h, out, t, { gain: 0.2, decay: 0.02, filters: [{ type: 'highpass', f: 3000 }] });
  crackles(h, out, t + 0.01, 3, 0.1, 0.1, 1500, 4000);
  return 0.25;
};
/** Colheita/frutas/fazenda: farfalhar de folhas em pequenas rajadas. */
const rustle: Recipe = (h, out, t) => {
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) noise(h, out, t + i * rnd(0.06, 0.12), { color: 'pink', gain: rnd(0.1, 0.2), attack: 0.02, decay: rnd(0.06, 0.14), filters: [{ type: 'highpass', f: 1500 }, { type: 'peaking', f: 4200, q: 1, gainDb: 6 }] });
  return 0.5;
};
/** Martelos de construção: 1–3 batidas irregulares em madeira, às vezes um prego (metal). */
const hammer: Recipe = (h, out, t) => {
  const n = 1 + Math.floor(Math.random() * 3); let tt = t;
  for (let i = 0; i < n; i++) {
    if (Math.random() < 0.25) partials(h, out, tt, rnd(1800, 2600), [1, 2.4, 4.1], 0.05, 0.06);
    pluck(h, out, tt, rnd(280, 480), 0.3, { bright: 0.35, dur: 0.12 });
    noise(h, out, tt, { gain: 0.18, decay: 0.015, filters: [{ type: 'bandpass', f: 2200, q: 1 }] });
    tt += rnd(0.14, 0.3);
  }
  return tt - t + 0.15;
};
/** Edifício concluído: sino de bronze suave + címbalo leve. */
const built: Recipe = (h, out, t) => {
  const f = pick([392, 440, 523]);
  const d = partials(h, out, t, f, BELL, 0.06, 2.2, { decayTilt: 0.35 });
  noise(h, out, t, { gain: 0.03, attack: 0.01, decay: 1.2, filters: [{ type: 'highpass', f: 6000 }] });
  return d;
};
/** Desabamento: estrondo grave longo + ruído médio + estalos de madeira e pedra. */
const collapse: Recipe = (h, out, t) => {
  noise(h, out, t, { color: 'brown', gain: 0.9, attack: 0.08, decay: 2.2, filters: [{ type: 'lowpass', f: 280 }] });
  noise(h, out, t + 0.05, { color: 'pink', gain: 0.3, attack: 0.1, decay: 1.2, filters: [{ type: 'bandpass', f: 800, f2: 300, glide: 1.3, q: 0.8 }] });
  crackles(h, out, t, Math.floor(rnd(10, 16)), 1.4, 0.3, 900, 4000, 0.02);
  pluck(h, out, t + 0.1, rnd(60, 80), 0.3, { bright: 0.2, dur: 0.8, bend: 0.7 });
  thump(h, out, t + rnd(0.3, 0.6), 55, 0.8, 0.5);
  return 2.4;
};
/** Árvore tombando: rangido + assobio da copa + baque + folhas. */
const treeFall: Recipe = (h, out, t) => {
  pluck(h, out, t, rnd(90, 120), 0.3, { bright: 0.2, dur: 0.7, bend: 0.6 });
  noise(h, out, t + 0.3, { color: 'pink', gain: 0.15, attack: 0.3, decay: 0.3, filters: [{ type: 'highpass', f: 1200 }] });
  thump(h, out, t + 0.9, 70, 0.6, 0.35);
  noise(h, out, t + 0.9, { color: 'pink', gain: 0.2, decay: 0.5, filters: [{ type: 'highpass', f: 2000 }] });
  return 1.5;
};
/** Veio esgotado / pedra rachando. */
const rockCrumble: Recipe = (h, out, t) => { noise(h, out, t, { color: 'brown', gain: 0.4, decay: 0.6, filters: [{ type: 'lowpass', f: 350 }] }); crackles(h, out, t, 10, 0.6, 0.2, 1200, 4000, 0.015); return 0.7; };
/** Fogo: crepitar por ruído granulado sobre um sopro grave. */
const fire: Recipe = (h, out, t) => {
  noise(h, out, t, { color: 'brown', gain: 0.25, attack: 0.3, decay: 1.2, hold: 0.4, filters: [{ type: 'lowpass', f: 700 }] });
  crackles(h, out, t, Math.floor(rnd(14, 26)), 1.8, 0.25, 1500, 6000, 0.006);
  return 2.0;
};

// ---------------- Mortes (estilizadas, discretas) ----------------
/** Humano: grito curto estilizado + corpo e armadura caindo. */
const deathHuman: Recipe = (h, out, t) => {
  const f = rnd(170, 280);
  voice(h, out, t, { f, f2: f * rnd(0.55, 0.7), dur: rnd(0.28, 0.42), gain: 0.1, vowel: pick([VOWELS.a, VOWELS.ah, VOWELS.o]), breath: 0.15 });
  const tf = t + rnd(0.3, 0.45);
  thump(h, out, tf, rnd(90, 120), 0.4, 0.14);
  noise(h, out, tf, { color: 'pink', gain: 0.2, decay: 0.12, filters: [{ type: 'lowpass', f: 900 }] });
  if (Math.random() < 0.5) partials(h, out, tf + 0.03, rnd(1500, 2400), [1, 2.5], 0.025, 0.12);
  return 0.7;
};
/** Criatura mítica: rugido grave com aspereza + queda pesada. */
const deathMyth: Recipe = (h, out, t) => {
  const f = rnd(70, 110);
  voice(h, out, t, { f, f2: f * 0.6, dur: rnd(0.6, 0.9), gain: 0.16, vowel: VOWELS.o, breath: 0.3, rough: 0.05 });
  thump(h, out, t + 0.6, 55, 0.7, 0.4);
  noise(h, out, t + 0.6, { color: 'brown', gain: 0.4, decay: 0.4, filters: [{ type: 'lowpass', f: 300 }] });
  return 1.1;
};
/** Cavalo: relincho curto estilizado (vibrato rápido descendente) + queda. */
const deathHorse: Recipe = (h, out, t) => {
  tone(h, out, t, { type: 'sawtooth', f: rnd(650, 800), f2: 380, glide: 0.5, gain: 0.05, attack: 0.03, decay: 0.5, vibrato: { rate: 14, depth: 0.05, delay: 0 }, filter: { type: 'bandpass', f: 1300, q: 2 } });
  noise(h, out, t + 0.45, { color: 'pink', gain: 0.15, attack: 0.02, decay: 0.2, filters: [{ type: 'bandpass', f: 900, q: 1 }] });
  thump(h, out, t + 0.55, 70, 0.6, 0.3);
  return 0.9;
};
/** Voador (pégaso): bater de asas e queda. */
const deathWing: Recipe = (h, out, t) => {
  for (let i = 0; i < 3; i++) noise(h, out, t + i * 0.12, { color: 'pink', gain: 0.18, attack: 0.03, decay: 0.07, filters: [{ type: 'bandpass', f: 600, q: 1 }] });
  thump(h, out, t + 0.5, 90, 0.5, 0.2);
  return 0.75;
};

// ---------------- Poderes e magia ----------------
/** Raio de Zeus: estalo seco, rasgo agudo e trovão longo com ribombo. */
const zeusBolt: Recipe = (h, out, t) => {
  noise(h, out, t, { gain: 1.0, decay: 0.05, filters: [{ type: 'highpass', f: 1500 }] });
  noise(h, out, t + 0.01, { gain: 0.5, decay: 0.18, filters: [{ type: 'bandpass', f: 6000, f2: 900, glide: 0.18, q: 1.2 }] });
  thump(h, out, t, 90, 0.7, 0.3, 0.4);
  // ribombo: várias massas graves sobrepostas com atrasos crescentes
  const n = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const d = 0.12 + i * rnd(0.25, 0.55);
    noise(h, out, t + d, { color: 'brown', gain: rnd(0.5, 0.9) / (1 + i * 0.25), attack: rnd(0.05, 0.2), decay: rnd(0.8, 1.8), filters: [{ type: 'lowpass', f: rnd(160, 320) }] });
  }
  return 4.2;
};
/** Terremoto: rumble subgrave com solavancos e rachaduras. */
const quake: Recipe = (h, out, t) => {
  noise(h, out, t, { color: 'brown', gain: 0.9, attack: 0.5, decay: 2.6, hold: 1.2, filters: [{ type: 'lowpass', f: 140 }] });
  tone(h, out, t, { f: rnd(34, 42), gain: 0.4, attack: 0.6, decay: 2.5, hold: 1, vibrato: { rate: 3.5, depth: 0.15, delay: 0 } });
  for (let i = 0; i < 4; i++) thump(h, out, t + rnd(0.2, 3), rnd(45, 60), 0.5, 0.35);
  crackles(h, out, t + 0.4, 12, 3.2, 0.2, 800, 3000, 0.025);
  return 4.4;
};
/** Ondas (Poseidon): três vagas com filtro abrindo e fechando + espuma. */
const waves: Recipe = (h, out, t) => {
  for (let i = 0; i < 3; i++) {
    const tt = t + i * rnd(0.7, 1.1);
    noise(h, out, tt, { color: 'pink', gain: 0.5, attack: 0.9, decay: 1.4, filters: [{ type: 'lowpass', f: 350, f2: 2400, glide: 0.9, q: 0.5 }] });
    noise(h, out, tt + 0.8, { gain: 0.12, attack: 0.1, decay: 0.9, filters: [{ type: 'highpass', f: 3500 }] });
  }
  return 4.0;
};
/** Invocação/aparição mítica: drone que cresce + brilho de sinos altos. */
const summon: Recipe = (h, out, t) => {
  const f = pick([110, 123.5, 98]);
  for (const r of [1, 1.5, 2.01]) tone(h, out, t, { type: 'sawtooth', f: f * r, gain: 0.03, attack: 0.5, decay: 1.2, filter: { type: 'lowpass', f: 300, f2: 1800, glide: 0.8 } });
  for (let i = 0; i < 7; i++) tone(h, out, t + 0.3 + i * rnd(0.08, 0.16), { f: pick([1318, 1568, 1760, 1976, 2349]), gain: 0.03, attack: 0.003, decay: rnd(0.4, 0.8) });
  noise(h, out, t, { gain: 0.06, attack: 0.6, decay: 0.3, filters: [{ type: 'highpass', f: 4000 }] });
  return 1.9;
};
/** Ascensão de Titã: drone muito grave subindo + rumble + serra que se abre. */
const titanRise: Recipe = (h, out, t) => {
  tone(h, out, t, { f: 30, f2: 48, glide: 5, gain: 0.5, attack: 2, decay: 3.5, hold: 1 });
  tone(h, out, t, { type: 'sawtooth', f: 41, f2: 62, glide: 5, gain: 0.12, attack: 2.5, decay: 3, hold: 1, filter: { type: 'lowpass', f: 120, f2: 900, glide: 5 } });
  noise(h, out, t, { color: 'brown', gain: 0.6, attack: 2.5, decay: 3, hold: 0.8, filters: [{ type: 'lowpass', f: 180 }] });
  return 6.5;
};
/** Cura: cordas suaves (acorde maior em serra filtrada, ataque lento) + brilho. */
const heal: Recipe = (h, out, t) => {
  const root = pick([293.7, 329.6, 261.6]);
  for (const r of [1, 1.26, 1.5, 2]) tone(h, out, t, { type: 'sawtooth', f: root * r, detune: rnd(-6, 6), gain: 0.025, attack: 0.5, decay: 1.6, hold: 0.4, vibrato: { rate: 5, depth: 0.004 }, filter: { type: 'lowpass', f: 1400 } });
  for (let i = 0; i < 4; i++) tone(h, out, t + 0.4 + i * 0.2, { f: root * pick([4, 5.04, 6]), gain: 0.015, decay: 0.6 });
  return 2.6;
};
/** Maldição (Afrodite): trinado oscilante descendente. */
const curse: Recipe = (h, out, t) => { tone(h, out, t, { type: 'triangle', f: rnd(700, 850), f2: 240, glide: 0.9, gain: 0.06, attack: 0.05, decay: 0.9, vibrato: { rate: 9, depth: 0.06, delay: 0 } }); return 1.0; };
/** Pestilência: zumbido de moscas + nota grave dissonante. */
const pestilence: Recipe = (h, out, t) => {
  for (let i = 0; i < 5; i++) tone(h, out, t + rnd(0, 0.5), { type: 'sawtooth', f: rnd(190, 260), gain: 0.012, attack: 0.3, decay: 2, vibrato: { rate: rnd(6, 12), depth: 0.04, delay: 0 }, filter: { type: 'bandpass', f: 800, q: 2 } });
  tone(h, out, t, { type: 'sawtooth', f: 73, gain: 0.05, attack: 0.6, decay: 2, filter: { type: 'lowpass', f: 400 } });
  tone(h, out, t, { type: 'sawtooth', f: 77.8, gain: 0.04, attack: 0.6, decay: 2, filter: { type: 'lowpass', f: 400 } });
  return 2.8;
};
/** Petrificação: moagem de pedra + estalos. */
const petrify: Recipe = (h, out, t) => { noise(h, out, t, { color: 'brown', gain: 0.4, attack: 0.1, decay: 0.8, filters: [{ type: 'bandpass', f: 220, q: 2 }] }); crackles(h, out, t, 14, 0.8, 0.2, 1500, 5000, 0.01); return 1.0; };
/** Habilidade de herói: brado curto (formante subindo) + deslocamento de ar. */
const ability: Recipe = (h, out, t) => {
  const f = rnd(150, 200);
  voice(h, out, t, { f, f2: f * 1.25, dur: 0.45, gain: 0.1, vowel: VOWELS.ah, breath: 0.2, attack: 0.05 });
  noise(h, out, t + 0.05, { gain: 0.15, attack: 0.1, decay: 0.3, filters: [{ type: 'bandpass', f: 500, f2: 2500, glide: 0.35, q: 1 }] });
  return 0.6;
};
/** Poder divino genérico: acorde brilhante + ondulação grave. */
const divine: Recipe = (h, out, t) => {
  const tr = vary(1, 0.04);
  for (const f of [587, 880, 1175, 1760]) tone(h, out, t + rnd(0, 0.1), { f: f * tr, gain: 0.03, attack: 0.08, decay: vary(1.4, 0.15) });
  tone(h, out, t, { type: 'sawtooth', f: 73.4, gain: 0.08, attack: 0.3, decay: 1.2, filter: { type: 'lowpass', f: 300, f2: 900, glide: 0.8 } });
  noise(h, out, t, { gain: 0.05, attack: 0.4, decay: 0.8, filters: [{ type: 'highpass', f: 5000 }] });
  return 1.6;
};
/** Bronze (poder): anel metálico longo. */
const bronzeRing: Recipe = (h, out, t) => partials(h, out, t, vary(220, 0.04), BRONZE, 0.07, vary(2.4, 0.15), { decayTilt: 0.3 });

// ---------------- Interface e alertas ----------------
/** Clique de mármore: pedra polida, muito curto. */
const uiClick: Recipe = (h, out, t) => { noise(h, out, t, { gain: 0.12, decay: 0.006, filters: [{ type: 'bandpass', f: rnd(2300, 2800), q: 2 }] }); tone(h, out, t, { f: rnd(1700, 1900), gain: 0.03, decay: 0.03 }); return 0.05; };
/** Confirmação: toque de bronze curto. */
const uiConfirm: Recipe = (h, out, t) => { partials(h, out, t, rnd(1150, 1250), [1, 2.4, 3.9], 0.035, 0.12); noise(h, out, t, { gain: 0.06, decay: 0.008, filters: [{ type: 'highpass', f: 3000 }] }); return 0.15; };
/** Erro: duas batidas surdas em pedra. */
const uiError: Recipe = (h, out, t) => { for (const d of [0, 0.11]) { thump(h, out, t + d, 170, 0.25, 0.08, 0.7); noise(h, out, t + d, { color: 'pink', gain: 0.12, decay: 0.03, filters: [{ type: 'lowpass', f: 700 }] }); } return 0.22; };
/** Moeda: dois tinidos de metal fino. */
const uiCoin: Recipe = (h, out, t) => { partials(h, out, t, rnd(3000, 3400), COIN, 0.035, 0.25); partials(h, out, t + rnd(0.06, 0.1), rnd(3300, 3700), COIN, 0.03, 0.3); return 0.4; };
/** Fundação posicionada: pedra assentada no chão + cascalho. */
const uiPlace: Recipe = (h, out, t) => { thump(h, out, t, 110, 0.35, 0.12); noise(h, out, t, { color: 'pink', gain: 0.2, decay: 0.08, filters: [{ type: 'lowpass', f: 900 }] }); crackles(h, out, t + 0.02, 4, 0.1, 0.08, 2000, 5000); return 0.2; };
/** Pesquisa concluída: pergaminho + sininho agudo. */
const research: Recipe = (h, out, t) => { noise(h, out, t, { color: 'pink', gain: 0.08, attack: 0.03, decay: 0.15, filters: [{ type: 'highpass', f: 2000 }] }); partials(h, out, t + 0.12, 1046, [1, 2.76, 5.4], 0.03, 0.8); return 0.9; };
/** Trompa de guerra (salpinx): alerta de ataque sofrido, duas notas. */
const alertHorn: Recipe = (h, out, t) => {
  const f = pick([196, 207.7, 220]);
  tone(h, out, t, { type: 'sawtooth', f: f * 0.97, f2: f, glide: 0.08, gain: 0.07, attack: 0.05, decay: 0.25, hold: 0.25, vibrato: { rate: 5, depth: 0.008 }, filter: { type: 'lowpass', f: 700, f2: 1600, glide: 0.2, q: 2 } });
  tone(h, out, t + 0.55, { type: 'sawtooth', f: f * 1.5 * 0.97, f2: f * 1.5, glide: 0.08, gain: 0.07, attack: 0.05, decay: 0.45, hold: 0.2, vibrato: { rate: 5, depth: 0.01 }, filter: { type: 'lowpass', f: 900, f2: 2000, glide: 0.2, q: 2 } });
  return 1.3;
};
/** Nova Idade: duas trompas em quinta, rufar de tambor e glissando de lira. */
const ageUp: Recipe = (h, out, t) => {
  for (const [r, d] of [[1, 0], [1.5, 0], [2, 0.6]] as const) tone(h, out, t + d, { type: 'sawtooth', f: 146.8 * r, gain: 0.05, attack: 0.08, decay: 1.2, hold: 0.4, vibrato: { rate: 5, depth: 0.006 }, filter: { type: 'lowpass', f: 800, f2: 2200, glide: 0.4, q: 1.5 } });
  for (let i = 0; i < 10; i++) { const tt = t + i * 0.06; noise(h, out, tt, { color: 'pink', gain: 0.08 + i * 0.02, decay: 0.05, filters: [{ type: 'bandpass', f: 250, q: 1 }] }); }
  [293.7, 329.6, 349.2, 392, 440, 523.3, 587.3].forEach((f, i) => pluck(h, out, t + 0.6 + i * 0.05, f, 0.12, { bright: 0.8, dur: 1.2 }));
  thump(h, out, t + 0.6, 65, 0.6, 0.6);
  return 2.4;
};
/** Idade de outro jogador: trompa distante. */
const ageOther: Recipe = (h, out, t) => { tone(h, out, t, { type: 'sawtooth', f: 146.8, gain: 0.035, attack: 0.15, decay: 1, hold: 0.3, filter: { type: 'lowpass', f: 600 } }); return 1.5; };
/** Herói caído: sino grave. */
const toll: Recipe = (h, out, t) => partials(h, out, t, vary(110, 0.03), BELL, 0.08, vary(3, 0.1), { decayTilt: 0.3 });

/** Nivelamento por receita (medido com renderOffline: picos entre ~0,15 e ~0,8 antes dos barramentos). */
const LEVEL: Record<string, number> = {
  stoneImpact: 0.75, zeusBolt: 0.75, quake: 0.8, heavyStep: 0.7, collapse: 0.9,
  ability: 8, ageOther: 3, uiClick: 2.5, mythShot: 5, curse: 4, heal: 3.5, pestilence: 3.5, petrify: 3, research: 2.5, alertHorn: 3.5,
  uiConfirm: 1.8, uiCoin: 2, rustle: 2, summon: 2.2, built: 1.8, divine: 2, arrowImpact: 2, march: 2, bronzeRing: 1.5, toll: 1.3,
  pick: 1.6, fire: 1.5, rockCrumble: 1.8, waves: 1.5,
};
const leveled = <T extends Record<string, Recipe>>(rs: T): T => {
  const out = {} as Record<string, Recipe>;
  for (const [name, r] of Object.entries(rs)) {
    const lv = LEVEL[name];
    out[name] = lv === undefined ? r : (h, o, t, k) => { const g = h.ctx.createGain(); g.gain.value = lv; g.connect(o); return r(h, g, t, k); };
  }
  return out as T;
};

export const RECIPES = leveled({
  clash, flesh, shieldWood, melee, bow, arrowImpact, mythShot, catapult, stoneImpact,
  hooves, march, heavyStep,
  axe, pick: pick_, rustle, hammer, built, collapse, treeFall, rockCrumble, fire,
  deathHuman, deathMyth, deathHorse, deathWing,
  zeusBolt, quake, waves, summon, titanRise, heal, curse, pestilence, petrify, ability, divine, bronzeRing,
  uiClick, uiConfirm, uiError, uiCoin, uiPlace, research, alertHorn, ageUp, ageOther, toll,
} satisfies Record<string, Recipe>);
export type RecipeName = keyof typeof RECIPES;

/** Categoria (limite de vozes e estatísticas) de cada receita. */
export const RECIPE_CATEGORY: Record<RecipeName, string> = {
  clash: 'melee', flesh: 'melee', shieldWood: 'melee', melee: 'melee', bow: 'bow', arrowImpact: 'arrow', mythShot: 'magic', catapult: 'siege', stoneImpact: 'impact',
  hooves: 'hooves', march: 'march', heavyStep: 'march',
  axe: 'work', pick: 'work', rustle: 'work', hammer: 'work', built: 'built', collapse: 'collapse', treeFall: 'collapse', rockCrumble: 'collapse', fire: 'fire',
  deathHuman: 'death', deathMyth: 'death', deathHorse: 'death', deathWing: 'death',
  zeusBolt: 'power', quake: 'power', waves: 'power', summon: 'magic', titanRise: 'power', heal: 'magic', curse: 'magic', pestilence: 'magic', petrify: 'magic', ability: 'magic', divine: 'power', bronzeRing: 'power',
  uiClick: 'ui', uiConfirm: 'ui', uiError: 'ui', uiCoin: 'ui', uiPlace: 'ui', research: 'ui', alertHorn: 'alert', ageUp: 'stinger', ageOther: 'stinger', toll: 'stinger',
};

/** Reverberação típica por receita (espaço aberto: pouco; poderes e sinos: muito). */
export const RECIPE_REVERB: Partial<Record<RecipeName, number>> = { zeusBolt: 0.6, quake: 0.35, titanRise: 0.5, summon: 0.5, heal: 0.45, built: 0.4, toll: 0.6, ageUp: 0.35, divine: 0.5, collapse: 0.3, alertHorn: 0.3 };

