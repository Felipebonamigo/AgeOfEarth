// Cenas das ilustrações da campanha (uma por missão; scripts/bake/illustrations.mjs → public/ui/missao-<id>.jpg). Unidades
// do mundo do fundo do menu (page/backdrop.js): um hoplita tem ~1 de altura, a câmera olha para −z, o sol em `az` 0 fica à
// frente da câmera (contraluz). Cores de time: as do jogo (src/core/constants.ts, PLAYER_COLORS); Argos é o azul.
// Campos: cam, sun, look (céu, névoa, luz ambiente, pós), ground (palette, bumps, coast, snowAbove…), sea, buildings,
// units, rows (fileiras de `from` a `to`), trees, ruins, gods, fires, smoke, chains, pillars, altars, glows, bolts.

const BLUE = 0x3b82f6, RED = 0xef4444, GREEN = 0x22c55e, YELLOW = 0xeab308;
const HADES = 0x7a1e2a, CULT = 0x3a2a4a;

/** Céus de base (misturados com o que a cena mudar). */
const DAWN = { zenith: 0x2a3558, mid: 0x9a6a64, horizon: 0xf2a562, glow: 0xffc27a, clouds: 1, seed: 5.1, fog: 0xd49a70, fogDensity: 0.011, hemiSky: 0x7080b8, hemiGround: 0x2e2218, hemi: 0.34, env: 0.22, exposure: 1.0, bloom: 0.45, bloomThreshold: 0.7, vignette: 118, grain: 7 };
const DUSK = { zenith: 0x1c2244, mid: 0x7a3e4a, horizon: 0xe0703a, glow: 0xff9a50, clouds: 1.2, seed: 6.6, fog: 0x9a5a48, fogDensity: 0.012, hemiSky: 0x5a4a78, hemiGround: 0x241814, hemi: 0.3, env: 0.2, exposure: 1.0, bloom: 0.5, bloomThreshold: 0.68, vignette: 105, grain: 7 };
const NIGHT = { zenith: 0x05070f, mid: 0x131a2c, horizon: 0x2a2c3c, glow: 0x8a9ac0, clouds: 0.9, seed: 9.4, fog: 0x1c2030, fogDensity: 0.014, hemiSky: 0x2a3450, hemiGround: 0x0c0a0a, hemi: 0.35, env: 0.15, exposure: 1.1, bloom: 0.6, bloomThreshold: 0.6, vignette: 90, grain: 9 };
const STORM = { zenith: 0x151c22, mid: 0x34424a, horizon: 0x6f7f80, glow: 0x101418, clouds: 1.6, seed: 8.3, fog: 0x4c5a5e, fogDensity: 0.014, hemiSky: 0x5a6a7a, hemiGround: 0x1a1c1c, hemi: 0.45, env: 0.3, exposure: 1.05, bloom: 0.5, bloomThreshold: 0.72, vignette: 100, grain: 8 };
const COLD = { zenith: 0x2c4470, mid: 0x7c8cb0, horizon: 0xf0c8a8, glow: 0xffd8a8, clouds: 0.8, seed: 2.2, fog: 0xa8b4c8, fogDensity: 0.012, hemiSky: 0x9ab0d8, hemiGround: 0x3a3a40, hemi: 0.35, env: 0.3, exposure: 1.0, bloom: 0.4, bloomThreshold: 0.75, vignette: 120, grain: 6 };
const GOLD = { zenith: 0x3a5a8c, mid: 0xa0a0a8, horizon: 0xf4d09a, glow: 0xffe0a0, clouds: 0.9, seed: 4.4, fog: 0xd8c0a0, fogDensity: 0.008, hemiSky: 0x90a8d0, hemiGround: 0x3a3020, hemi: 0.45, env: 0.25, exposure: 1.0, bloom: 0.4, bloomThreshold: 0.75, vignette: 122, grain: 6 };
const UNDER = { zenith: 0x080405, mid: 0x2a0c0a, horizon: 0x7a2a14, glow: 0xff5a20, clouds: 1.3, seed: 1.9, fog: 0x3a120c, fogDensity: 0.02, hemiSky: 0x5a2014, hemiGround: 0x0a0404, hemi: 0.5, env: 0.12, exposure: 1.1, bloom: 0.6, bloomThreshold: 0.6, vignette: 80, grain: 9 };

/** Cordilheira: morros recortados sobrepostos de x0 a x1 perto de z (determinístico pela semente). */
function range(x0, x1, z, n, h0, h1, seed, { rx = [7, 13], rz = [6, 10], zj = 10, jag = 0.5, sharp = 1.15, base = 0 } = {}) {
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push({ x: x0 + (x1 - x0) * t + (r() - 0.5) * 6, z: z + (r() - 0.5) * zj, rx: rx[0] + r() * (rx[1] - rx[0]), rz: rz[0] + r() * (rz[1] - rz[0]), h: h0 + r() * (h1 - h0), sharp, rocky: 1, jag, jf: 0.12 + r() * 0.06, base });
  }
  return out;
}

export const SCENES = {
  // Ato I · m1 — a aldeia de Argos ao amanhecer: o Centro Cívico, casas, a fazenda e o Templo de Zeus em obra
  m1_despertar: {
    cam: { pos: [1, 5.2, 5], target: [0, 0.4, -16], fov: 40 },
    sun: { az: 0.75, el: 0.15, color: 0xffc080, intensity: 3.4 },
    look: { ...DAWN, fog: 0xdcae88, fogDensity: 0.01, exposure: 1.1, hemi: 0.45 },
    focus: [0, 0, -10],
    ground: { palette: 'greek', base: 0.2, seed: 11, coast: { z: -34, slope: 0.25 }, bumps: [{ x: 0, z: -9, rx: 13, rz: 8, h: 0.8 }, ...range(-60, -18, -70, 5, 7, 12, 3), ...range(26, 70, -80, 5, 8, 14, 5)] },
    sea: { level: -1.25, color: 0x1a3a50 },
    buildings: [
      { type: 'town_center', variant: 'a0', team: BLUE, x: 0, z: -11, yaw: 0.35, scale: 1.25 },
      { type: 'house', team: BLUE, x: -5.2, z: -8.4, yaw: 0.6, scale: 1.2 },
      { type: 'house', team: BLUE, x: -6.6, z: -12.6, yaw: 0.2, scale: 1.2 },
      { type: 'house', team: BLUE, x: 5, z: -7.2, yaw: -0.3, scale: 1.2 },
      { type: 'farm', variant: 'ripe', team: BLUE, x: 5.5, z: -13.5, yaw: 0.1, scale: 1.2 },
      { type: 'temple', state: 'build1', team: BLUE, x: -2.4, z: -19, yaw: 0.3, scale: 1.3 },
    ],
    rows: [{ type: 'villager', team: BLUE, from: [-2.2, -4.2], to: [2.6, -5.2], rows: 1, per: 4, dir: 6, anim: 'walk', jitter: 0.6, yawJitter: 1.2 }],
    units: [{ type: 'villager', team: BLUE, x: 4.2, z: -11.8, dir: 3, anim: 'walk' }, { type: 'villager', team: BLUE, x: -3.6, z: -16.8, dir: 1, anim: 'idle' }],
    trees: [['olive', 0, 'small', -9, -6, 1.1], ['olive', 1, 'small', 9.5, -9, 1.0], ['cypress', 2, 'big', -9.6, -15, 1.4], ['cypress', 0, 'big', 8.8, -18, 1.3], ['olive', 3, 'small', 2.8, -2.4, 0.9], ['cypress', 1, 'big', -12, -10, 1.3], ['olive', 2, 'small', 12, -14, 1.0]],
    smoke: [{ x: 0.8, z: -11.2, y: 3.2, h: 6, size: 0.8, color: 0xc8c0b8, opacity: 0.35, drift: [0.5, 0] }],
  },

  // Ato I · m2 — o exército de Hades ao pôr do sol diante das muralhas de Argos, com helépoles; a cidade acende os fogos
  m2_cerco: {
    cam: { pos: [0, 1.6, 10], target: [0, 3.4, -40], fov: 38 },
    sun: { az: -0.25, el: 0.06, color: 0xff9a5a, intensity: 3.0 },
    look: { ...DUSK },
    focus: [0, 0, -22],
    ground: { palette: 'greek', base: 0.2, seed: 23, dryness: 0.3, bumps: [{ x: 1, z: -34, rx: 11, rz: 6, h: 3.8, mesa: 0.6, base: -0.2 }, ...range(-70, 70, -95, 9, 6, 13, 7)] },
    buildings: [
      ...[-6, -4.4, -2.8, 2.8, 4.4, 6].map((x) => ({ type: 'wall', variant: '10', team: BLUE, x, z: -28, scale: 1.6 })),
      { type: 'gate', variant: 'ew', team: BLUE, x: 0, z: -28, scale: 1.6 },
      { type: 'tower', variant: '00', team: BLUE, x: -7.8, z: -28, scale: 1.6 }, { type: 'tower', variant: '00', team: BLUE, x: 7.8, z: -28, scale: 1.6 },
      { type: 'temple', team: BLUE, x: 1, y: 3.7, z: -35, yaw: 0.2, scale: 1.5 },
      { type: 'helepolis_dummy', skip: true },
    ].filter((b) => !b.skip),
    rows: [
      { type: ['hoplite', 'hoplite', 'peltast'], team: HADES, from: [-9, -9], to: [-2, -10], rows: 3, per: 8, rowGap: 0.8, back: -1, dir: 6, anim: 'walk' },
      { type: ['hoplite', 'militia'], team: HADES, from: [2.5, -10], to: [9.5, -9], rows: 3, per: 8, rowGap: 0.8, back: -1, dir: 6, anim: 'walk' },
    ],
    units: [
      { type: 'helepolis', team: HADES, x: -4.5, z: -17, dir: 6, anim: 'walk', scale: 1.1 },
      { type: 'helepolis', team: HADES, x: 5.5, z: -18, dir: 6, anim: 'walk', scale: 1.1 },
      { type: 'petrobolos', team: HADES, x: 0.5, z: -6.5, dir: 6, anim: 'attack' },
    ],
    fires: [{ x: -7.8, y: 5.2, z: -27.6, size: 0.4, smoke: false }, { x: 7.8, y: 5.2, z: -27.6, size: 0.4, smoke: false }, { x: 3.2, z: -31, size: 0.9, smokeH: 8 }, { x: -12, z: -22, size: 0.7, smokeH: 7 }],
    smoke: [{ x: -2, z: -40, h: 10, size: 2, color: 0x3a2a26, opacity: 0.5 }],
  },

  // Ato I · m3 — o Portal dos Titãs aceso nas montanhas, à noite; os sacerdotes do Culto em volta, a coluna de Argos chegando
  m3_portal: {
    cam: { pos: [-1, 2, 2], target: [0, 4.6, -30], fov: 42 },
    sun: { az: -0.5, el: 0.35, color: 0x8aa0d8, intensity: 1.1 },
    skySun: { az: -0.5, el: -0.3 },
    look: { ...NIGHT },
    focus: [0, 0, -22],
    ground: { palette: 'alpine', snowAbove: 7, base: 0.2, seed: 33, bumps: [{ x: 0, z: -24, rx: 8, rz: 6, h: 2.2, mesa: 0.6 }, ...range(-60, 60, -60, 9, 12, 24, 11, { jag: 0.55 }), { x: -16, z: -8, rx: 7, rz: 4, h: 1.4, sharp: 1.6 }] },
    buildings: [{ type: 'titan_gate', team: CULT, x: 0, y: 2.3, z: -25, yaw: 0, scale: 1.8 }],
    glows: [{ x: 0, y: 5.4, z: -24.4, color: 0xb070ff, size: 12, opacity: 0.8, light: 90, distance: 30 }, { x: 0, y: 3.2, z: -23.5, color: 0xe0b0ff, size: 5, opacity: 0.7 }],
    rows: [
      { type: 'militia', team: CULT, from: [-5, -19], to: [-2.2, -20.5], rows: 1, per: 4, dir: 6, anim: 'idle' },
      { type: 'militia', team: CULT, from: [2.2, -20.5], to: [5, -19], rows: 1, per: 4, dir: 6, anim: 'idle' },
      { type: ['hoplite', 'hoplite', 'toxotes'], team: BLUE, from: [-13, -7.2], to: [-9, -8.2], rows: 2, per: 5, rowGap: 0.8, back: -1, dir: 7, anim: 'walk' },
    ],
    fires: [{ x: -3.5, z: -18, size: 0.45, smoke: false }, { x: 3.5, z: -18, size: 0.45, smoke: false }, { x: -11, z: -6.5, size: 0.35, smoke: false, light: 0.6 }],
  },

  // Ato I · m4 — Prometeu acorrentado no rochedo do Cáucaso, em contraluz; a expedição de Héracles no vale nevado
  m4_caucaso: {
    cam: { pos: [0, 1.6, 10], target: [1.5, 7.5, -40], fov: 36 },
    sun: { az: 0.1, el: 0.1, color: 0xffd8b0, intensity: 3.0 },
    look: { ...COLD },
    focus: [2, 0, -26],
    ground: {
      palette: 'alpine', snowAbove: 0.55, base: 0.2, seed: 41,
      bumps: [
        { x: -6, z: -6, rx: 7.5, rz: 3.5, h: 1.0, sharp: 1.6 },                        // ledge da expedição
        { x: 2.5, z: -30, rx: 4.6, rz: 4.2, h: 7.6, mesa: 0.5, base: -0.5, jag: 0.12 }, // o rochedo
        ...range(-70, -12, -62, 5, 16, 26, 21), ...range(14, 70, -70, 5, 18, 30, 22), ...range(-40, 40, -115, 6, 26, 38, 23, { rx: [12, 20] }),
      ],
    },
    units: [
      { type: 'prometheus', x: 2.5, z: -30, dir: 2, anim: 'idle', frame: 1, scale: 1.25 },
      { type: 'heracles', team: BLUE, x: -3.4, z: -5.4, dir: 6, anim: 'idle', frame: 0, yaw: 0.2 },
    ],
    rows: [
      { type: ['hoplite', 'hoplite', 'toxotes'], team: BLUE, from: [-10, -4.4], to: [-5.2, -3.8], rows: 2, per: 5, rowGap: 0.8, back: -1, dir: 6, jitter: 0.2 },
    ],
    // as correntes descem dos pulsos até a pedra, ao lado dos pés
    chains: [
      { from: [0.9, 13.2, -29.8], to: [-0.6, 7.2, -29.2], link: 0.28 },
      { from: [4.1, 13.2, -29.8], to: [5.6, 7.2, -29.2], link: 0.28 },
    ],
    trees: [['cypress', 1, 'big', -11.5, -7.5, 1.2], ['cypress', 2, 'big', 9, -13, 1.3], ['cypress', 0, 'small', 11.5, -10, 1.1]],
  },

  // Ato II · m5 — a praia de Náuplia depois do naufrágio: Odisseu e os náufragos entre os destroços; os cavaleiros de
  // Corinto na crista, contra o céu que abre depois da tempestade
  m5_itaca: {
    cam: { pos: [1.5, 1.5, 7], target: [-1, 2.6, -40], fov: 40 },
    sun: { az: 0.35, el: 0.1, color: 0xffd0a0, intensity: 2.6 },
    skySun: { az: 0.35, el: -0.15 },
    look: { ...STORM, zenith: 0x243038, mid: 0x6a7478, horizon: 0xe0c098, glow: 0xffd0a0, fog: 0x8a8e8a, fogDensity: 0.011, hemi: 0.5 },
    focus: [0, 0, -14],
    ground: { palette: 'greek', base: 0.3, seed: 51, coast: { axis: 'x', at: -3.5, slope: 0.28, dir: -1 }, bumps: [{ x: 9, z: -18, rx: 11, rz: 4, h: 3.0, sharp: 1.5 }, { x: 24, z: -30, rx: 14, rz: 10, h: 7, sharp: 1.3, jag: 0.4, rocky: 1 }, ...range(-70, -30, -80, 4, 6, 10, 31)] },
    sea: { level: -1.25, color: 0x1a2c34, roughness: 0.4 },
    wreck: [{ x: -3.2, z: -5, yaw: 0.6, planks: 9, ribs: 3 }, { x: -1.6, z: -9.5, yaw: -0.3, planks: 5, ribs: 0 }],
    units: [
      { type: 'odysseus', team: BLUE, x: 0.6, z: -3.4, dir: 1, anim: 'walk', scale: 1.1 },
    ],
    rows: [
      { type: 'villager', team: BLUE, from: [-1.8, -4.8], to: [1.8, -6.6], rows: 2, per: 4, rowGap: 0.9, back: 1, dir: 1, anim: 'walk', jitter: 0.5 },
      { type: 'hippeus', team: RED, from: [4.5, -16.4], to: [13, -17.6], rows: 1, per: 6, dir: 3, anim: 'idle', jitter: 0.3 },
    ],
    smoke: [{ x: -12, y: -1.1, z: -10, h: 1.2, size: 3, color: 0xe0e8ea, opacity: 0.3, puffs: 6, drift: [1, 0] }, { x: -8, y: -1.1, z: -20, h: 1.2, size: 3, color: 0xe0e8ea, opacity: 0.25, puffs: 6, drift: [1, 0] }],
  },

  // Ato II · m6 — a Estátua de Zeus erguida na Argólida, ao sol da tarde; Micenas e Argos em fileiras diante dela
  m6_estatua: {
    cam: { pos: [0, 1.3, 9], target: [0, 6.4, -40], fov: 38 },
    sun: { az: 0.55, el: 0.22, color: 0xffe0b0, intensity: 3.2 },
    look: { ...GOLD },
    focus: [0, 0, -18],
    ground: { palette: 'greek', base: 0.2, seed: 61, coast: { z: -40, slope: 0.25 }, bumps: [{ x: 0, z: -22, rx: 9, rz: 7, h: 2.4, mesa: 0.65 }, ...range(-70, -25, -70, 4, 8, 14, 41), ...range(25, 70, -75, 4, 8, 13, 43)] },
    sea: { level: -1.25, color: 0x1c4058 },
    buildings: [{ type: 'wonder_zeus', team: BLUE, x: 0, y: 2.55, z: -22, yaw: 0, scale: 2.5 }],
    rows: [
      { type: 'hoplite', team: BLUE, from: [-9, -9], to: [-2, -10.5], rows: 3, per: 8, rowGap: 0.8, back: -1, dir: 6 },
      { type: 'hoplite', team: YELLOW, from: [2, -10.5], to: [9, -9], rows: 3, per: 8, rowGap: 0.8, back: -1, dir: 6 },
    ],
    trees: [['cypress', 0, 'big', -6, -20, 1.5], ['cypress', 1, 'big', 6, -20, 1.5], ['olive', 1, 'small', -11, -12, 1.1], ['olive', 2, 'small', 11.5, -13, 1.0]],
    smoke: [{ x: -26, z: -48, h: 14, size: 2.4, color: 0x4a3a30, opacity: 0.45 }],
  },

  // Ato II · m7 — Aquiles e os mirmidões diante das aldeias de Argos em chamas, ao entardecer
  m7_aquiles: {
    cam: { pos: [0, 1.2, 4], target: [0, 3, -40], fov: 40 },
    sun: { az: -0.3, el: 0.05, color: 0xff8a4a, intensity: 2.8 },
    look: { ...DUSK, horizon: 0xf07a40, fog: 0xa05a40 },
    focus: [0, 0, -18],
    ground: { palette: 'greek', base: 0.2, seed: 71, dryness: 0.4, bumps: [{ x: -2, z: -3, rx: 10, rz: 3, h: 0.7 }, ...range(-70, 70, -90, 8, 6, 12, 51)] },
    buildings: [
      { type: 'house', state: 'damage2', team: BLUE, x: -6, z: -20, yaw: 0.4, scale: 1.3 }, { type: 'house', state: 'damage1', team: BLUE, x: -2.5, z: -23, yaw: -0.2, scale: 1.3 },
      { type: 'house', state: 'damage2', team: BLUE, x: 3.5, z: -21, yaw: 0.2, scale: 1.3 }, { type: 'granary', state: 'damage2', team: BLUE, x: 8, z: -24, yaw: -0.4, scale: 1.3 },
    ],
    fires: [{ x: -6, z: -20, size: 1.1, smokeH: 9 }, { x: -2.3, z: -23, size: 0.8, smokeH: 8 }, { x: 3.6, z: -21, size: 1.2, smokeH: 10 }, { x: 8, z: -24, size: 1.0, smokeH: 9 }, { x: 12, z: -30, size: 0.9, smokeH: 8 }],
    units: [{ type: 'achilles', team: GREEN, x: 0.4, z: -3.2, dir: 2, anim: 'walk', frame: 2, scale: 1.3 }],
    rows: [{ type: 'myrmidon', team: GREEN, from: [-6, -6], to: [6.5, -6.4], rows: 3, per: 11, rowGap: 0.8, back: 1, dir: 2, anim: 'walk' }],
  },

  // Ato II · m8 — Oceano se ergue do golfo na tempestade; as torres e a falange de Argos na praia
  m8_oceano: {
    cam: { pos: [0, 1.5, 9], target: [0, 6.5, -40], fov: 38 },
    sun: { az: 0.35, el: 0.16, color: 0xa8bcc8, intensity: 1.4 },
    skySun: { az: 0.35, el: -0.3 },
    look: { ...STORM },
    focus: [0, 0, -22],
    ground: { palette: 'greek', base: 0.25, coast: { z: -9, slope: 0.3 }, seed: 12, bumps: [{ x: -14, z: -4, rx: 6, rz: 4, h: 1.2 }, { x: 15, z: -6, rx: 7, rz: 4, h: 1.3 }, ...range(-70, -30, -70, 3, 5, 9, 61, { base: -2 })] },
    sea: { level: -1.25, color: 0x122228, roughness: 0.45, env: 1.5 },
    units: [
      { type: 'oceanus', x: 0.5, y: -3.6, z: -25, dir: 2, anim: 'rise', frame: 6, scale: 2.8 },
    ],
    rows: [
      { type: 'hoplite', team: BLUE, from: [-6.5, -7], to: [5.5, -7.4], rows: 3, per: 11, rowGap: 0.7, back: -1, dir: 6, jitter: 0.15 },
      { type: 'toxotes', team: BLUE, from: [-4, -5.2], to: [4, -5.4], rows: 1, per: 7, dir: 6, jitter: 0.2 },
    ],
    buildings: [
      { type: 'tower', variant: '00', team: BLUE, x: -8, z: -6, yaw: 0.3, scale: 1.5 },
      { type: 'tower', variant: '00', team: BLUE, x: 8.5, z: -6.5, yaw: -0.2, scale: 1.5 },
    ],
    smoke: [
      { x: -4, y: -1.2, z: -23, h: 2.5, size: 3.4, color: 0xdfe8ea, opacity: 0.4, drift: [-0.8, 0], puffs: 10 },
      { x: 5, y: -1.2, z: -24, h: 2.5, size: 3.4, color: 0xdfe8ea, opacity: 0.4, drift: [0.8, 0], puffs: 10 },
      { x: 0.5, y: -1.2, z: -21, h: 1.5, size: 4, color: 0xe8f0f2, opacity: 0.35, drift: [0, 0.2], puffs: 8 },
    ],
    bolts: [{ from: [-20, 42, -75], to: [-12, -1, -46] }, { from: [22, 40, -85], to: [16, -1, -52], light: 30 }],
  },

  // Ato III · m9 — a descida ao Tênaro: as legiões de Hades, Cérbero e os Ciclopes acorrentados no fundo da terra
  m9_tenaro: {
    cam: { pos: [0, 1.4, 10], target: [0, 3.2, -40], fov: 40 },
    sun: { az: 0.2, el: 0.2, color: 0xff6a3a, intensity: 1.4 },
    skySun: { az: 0.2, el: -0.4 },
    look: { ...UNDER },
    focus: [0, 0, -18],
    ground: { palette: 'ash', base: 0.2, seed: 91, rough: 1.4, bumps: [...range(-40, -12, -24, 5, 10, 22, 71, { rx: [4, 7], rz: [8, 14], zj: 20, jag: 0.6 }), ...range(12, 40, -24, 5, 10, 22, 73, { rx: [4, 7], rz: [8, 14], zj: 20, jag: 0.6 }), ...range(-30, 30, -70, 6, 14, 26, 75)] },
    units: [
      { type: 'cerberus', team: HADES, x: 0, z: -4.2, dir: 2, anim: 'idle', scale: 1.5 },
      { type: 'cyclops', x: -4.5, z: -26, dir: 2, anim: 'idle', scale: 1.1 }, { type: 'cyclops', x: 5, z: -27, dir: 2, anim: 'idle', scale: 1.1 },
    ],
    chains: [{ from: [-4.9, 3.2, -25.6], to: [-6.5, 0.3, -24.6] }, { from: [-4.1, 3.2, -25.6], to: [-2.6, 0.3, -24.6] }, { from: [4.6, 3.2, -26.6], to: [3, 0.3, -25.6] }, { from: [5.4, 3.2, -26.6], to: [7, 0.3, -25.6] }],
    rows: [
      { type: ['shade', 'hoplite', 'shade'], team: HADES, from: [-8, -9], to: [8, -9.5], rows: 3, per: 12, rowGap: 0.9, back: -1, dir: 2, anim: 'walk' },
    ],
    glows: [{ x: -12, z: -18, y: 0.5, color: 0xff5a1a, size: 8, light: 40 }, { x: 12, z: -20, y: 0.5, color: 0xff5a1a, size: 8, light: 40 }, { x: 0, z: -34, y: 1, color: 0xff7a2a, size: 14, light: 60, distance: 40 }],
    fires: [{ x: -9, z: -14, size: 0.7, smokeH: 6 }, { x: 9, z: -15, size: 0.7, smokeH: 6 }],
  },

  // Ato III · m10 — o cerco de Ótris: a cidadela murada no monte, os três Pilares acesos; Hades, Ciclopes e helépoles
  m10_otris: {
    cam: { pos: [0, 1.6, 10], target: [0, 5.2, -40], fov: 38 },
    sun: { az: -0.2, el: 0.14, color: 0xd8c0a0, intensity: 2.2 },
    look: { ...STORM, zenith: 0x1c2230, mid: 0x4a4a58, horizon: 0xb08a70, glow: 0x9a7a60, fog: 0x6a6070, fogDensity: 0.011 },
    focus: [0, 0, -24],
    ground: { palette: 'greek', base: 0.2, seed: 101, dryness: 0.5, bumps: [{ x: 0, z: -36, rx: 13, rz: 9, h: 6.5, mesa: 0.62, base: -0.3, jag: 0.08 }, ...range(-70, -20, -80, 4, 10, 18, 81), ...range(20, 70, -85, 4, 10, 18, 83)] },
    buildings: [
      ...[-7.2, -5.6, -4, -2.4, 2.4, 4, 5.6, 7.2].map((x) => ({ type: 'wall', variant: '10', team: CULT, x, y: 6.1, z: -29.5, scale: 1.4 })),
      { type: 'gate', variant: 'ew', team: CULT, x: 0, y: 6.1, z: -29.5, scale: 1.4 },
      { type: 'tower', variant: '00', team: CULT, x: -8.8, y: 6.1, z: -29.5, scale: 1.4 }, { type: 'tower', variant: '00', team: CULT, x: 8.8, y: 6.1, z: -29.5, scale: 1.4 },
      { type: 'fortress', team: CULT, x: 0, y: 6.2, z: -40, scale: 1.3 },
    ],
    pillars: [{ x: -5, y: 6.2, z: -36, h: 7, color: 0xa07bff }, { x: 0, y: 6.2, z: -34, h: 8, color: 0xa07bff }, { x: 5, y: 6.2, z: -36, h: 7, color: 0xa07bff }],
    units: [
      { type: 'helepolis', team: HADES, x: -5, z: -15, dir: 6, anim: 'walk', scale: 1.1 }, { type: 'helepolis', team: HADES, x: 6, z: -16, dir: 6, anim: 'walk', scale: 1.1 },
      { type: 'cyclops', team: HADES, x: -1.2, z: -9, dir: 6, anim: 'walk', scale: 1.15 }, { type: 'cyclops', team: HADES, x: 2.6, z: -10, dir: 6, anim: 'walk', scale: 1.15 },
    ],
    rows: [{ type: ['hoplite', 'hoplite', 'shade'], team: HADES, from: [-10, -6.5], to: [10, -6.5], rows: 2, per: 14, rowGap: 0.8, back: -1, dir: 6, anim: 'walk' }],
    fires: [{ x: -10, y: 6.8, z: -31, size: 0.6, smokeH: 7 }, { x: 11, y: 6.5, z: -32, size: 0.5, smokeH: 6 }],
  },

  // Ato III · m11 — Argos em chamas à noite: o arconte leva o povo ao porto enquanto Cronos avança atrás da cidade
  m11_chamas: {
    cam: { pos: [-3, 2, 9], target: [3, 5.2, -40], fov: 40 },
    sun: { az: 0.4, el: 0.3, color: 0x8a9ac8, intensity: 0.8 },
    skySun: { az: 0.4, el: -0.3 },
    look: { ...NIGHT, horizon: 0x6a2a18, mid: 0x2a1418, glow: 0x3a2020, fog: 0x2a1614, fogDensity: 0.009, exposure: 1.15 },
    focus: [2, 0, -20],
    ground: { palette: 'greek', base: 0.2, seed: 111, coast: { axis: 'x', at: -6, slope: 0.25, dir: -1 }, bumps: [{ x: 6, z: -22, rx: 12, rz: 10, h: 2.6, mesa: 0.7 }, { x: 6, z: -6, rx: 10, rz: 5, h: 1.0 }] },
    sea: { level: -1.25, color: 0x0e1820 },
    buildings: [
      { type: 'temple', state: 'damage2', team: BLUE, x: 9, y: 2.8, z: -24, yaw: -0.3, scale: 1.5 },
      { type: 'town_center', variant: 'a2', state: 'damage2', team: BLUE, x: 3.5, y: 2.8, z: -20, yaw: 0.2, scale: 1.3 },
      { type: 'house', state: 'damage2', team: BLUE, x: 13.5, z: -18, yaw: 0.4, scale: 1.3 }, { type: 'house', state: 'damage1', team: BLUE, x: 11, z: -14, scale: 1.3 },
    ],
    fires: [{ x: 9, y: 3.2, z: -24, size: 1.4, smokeH: 12 }, { x: 3.5, y: 3, z: -20, size: 1.3, smokeH: 11 }, { x: 13.5, z: -18, size: 1.0, smokeH: 9 }, { x: 11, z: -14, size: 0.8, smokeH: 8 }, { x: 16, z: -24, size: 1.2, smokeH: 10 }],
    units: [
      { type: 'cronus', x: 8, z: -40, dir: 1, anim: 'walk', frame: 3, scale: 3.6 },
      { type: 'basileus', team: BLUE, x: -1.8, z: -2.6, dir: 7, anim: 'walk', scale: 1.1 },
    ],
    rows: [
      { type: 'villager', team: BLUE, from: [5, -7], to: [-0.5, -4.5], rows: 2, per: 7, rowGap: 0.9, back: 1, dir: 7, anim: 'walk', jitter: 0.5 },
      { type: 'hoplite', team: BLUE, from: [7.5, -9.5], to: [4, -8], rows: 1, per: 4, dir: 7, anim: 'walk' },
    ],
    glows: [{ x: 8, y: 14, z: -44, color: 0xff4a1a, size: 34, opacity: 0.35, light: 0 }],
  },

  // Ato III · m12 — a Titanomaquia: Cronos no trono da planície, os três Altares da Foice acesos, Zeus, Hades e Poseidon
  // à frente dos exércitos dos três irmãos e dos exilados de Argos
  m12_titanomaquia: {
    cam: { pos: [0, 1.5, 10], target: [0, 5.5, -40], fov: 40 },
    sun: { az: 0.05, el: 0.07, color: 0xffb070, intensity: 3.2 },
    look: { ...DAWN, fogDensity: 0.011 },
    focus: [0, 0, -22],
    ground: { palette: 'plain', base: 0.2, seed: 77, dryness: 0.25, bumps: [{ x: 0, z: -2, rx: 9, rz: 3, h: 0.6 }, { x: 0.5, z: -36, rx: 6, rz: 5, h: 1.4 }, ...range(-80, -20, -120, 5, 12, 20, 91), ...range(20, 80, -130, 5, 14, 24, 93)] },
    units: [
      { type: 'cronus', x: 0.5, z: -36, dir: 2, anim: 'attack', frame: 1, scale: 2.8 },
    ],
    gods: [
      { key: 'zeus', x: -4.2, z: -5, yaw: Math.PI + 0.15, scale: 0.6, halo: 0xfff0c0 },
      { key: 'poseidon', x: 4.4, z: -5.2, yaw: Math.PI - 0.1, scale: 0.6 },
      { key: 'hades', x: 7.8, z: -4.2, yaw: Math.PI - 0.25, scale: 0.6 },
    ],
    rows: [
      { type: 'hoplite', team: BLUE, from: [-14, -12], to: [-5, -14], rows: 3, per: 10, rowGap: 0.8, back: -1, dir: 6, anim: 'walk' },
      { type: ['hoplite', 'hippeus'], team: GREEN, from: [-3.5, -15.5], to: [3.5, -16], rows: 2, per: 7, rowGap: 0.9, back: -1, dir: 6, anim: 'walk' },
      { type: ['hoplite', 'hoplite', 'cyclops'], team: HADES, from: [5, -14], to: [14, -12], rows: 3, per: 9, rowGap: 0.8, back: -1, dir: 6, anim: 'walk' },
    ],
    altars: [{ x: -10, z: -28, color: 0xff5a2a }, { x: 12, z: -29, color: 0xff5a2a }, { x: -3.5, z: -24, color: 0xff5a2a }],
    fires: [{ x: -18, z: -40, size: 1.1, smokeH: 10 }, { x: 20, z: -44, size: 1.2, smokeH: 11 }],
  },
};
