// Bustos dos 12 deuses para os retratos do HUD (Etapa 7; docs/ART.md §1.10 e Apêndice H): o esqueleto do rig humano
// com o CORPO ESCULPIDO da Etapa 6 (rigs/anatomy.js: cabeça masculina ou feminina, cabelo e barba), vestido com
// quíton/peplos e himátion e com o atributo de cada um perto da cabeça (o retrato é um busto: o que fica na mão some
// do quadro). Metros, frente em −z; o grupo externo gira o busto em três quartos para a câmera do contrato.
//   zeus       barba e cachos grisalhos, coroa de louros de ouro, himátion azul-púrpura, o raio sobre o ombro
//   poseidon   cabelo e barba verde-acinzentados revoltos, diadema, himátion verde-mar, o tridente atrás do ombro
//   hades      cabelo e barba negros, coroa escura de pontas, manto quase preto, o bidente
//   athena     elmo ático com crina alta empurrado para cima, égide de escamas de ouro com o gorgoneion, a lança
//   hermes     jovem, pétaso alado, clâmide ferrugem presa no ombro, o caduceu
//   ares       elmo com crina vermelha, barba escura, couraça de bronze, capa vermelha, a lança
//   apollo     jovem, cabelo dourado longo, coroa de louros verde, a auréola de raios de sol atrás da cabeça
//   dionysus   cachos escuros, coroa de hera com uvas, himátion púrpura e a pele de leopardo (nébride)
//   aphrodite  cabelo ruivo-dourado longo, diadema de pérolas, peplos rosa, colar de ouro, uma rosa no cabelo
//   hera       pólos alto de ouro com véu, peplos púrpura real, o cetro com a flor de lótus e penas de pavão
//   hephaestus barba e cabelo revoltos, pílos de feltro, avental de couro, o martelo no ombro, fagulhas
//   artemis    cabelo preso castanho, diadema com o crescente de prata, quíton verde-oliva, arco e aljava

import { buildHuman } from './rigs/human.js';
import { dressBody, addHair } from './rigs/anatomy.js';

const TAU = Math.PI * 2;
/** Posiciona uma malha e a devolve. */
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

/** Materiais de pano e brilho dos retratos (uma vez por conjunto de materiais). */
function G(THREE, M) {
  if (M.__gods) return M.__gods;
  const std = (color, roughness = 0.9, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const glow = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const env = M.bronze.envMap ?? null;
  M.__gods = {
    cloth: (hex) => (M.__gods.cache[hex] ??= std(hex, 0.88, 0, { side: THREE.DoubleSide })),
    cache: {},
    gold: std(0xe8b84a, 0.24, 1, { envMap: env, envMapIntensity: 0.8 }),
    silver: std(0xd8dde2, 0.22, 1, { envMap: env, envMapIntensity: 0.8 }),
    darkMetal: std(0x2c2a2e, 0.35, 0.9, { envMap: env, envMapIntensity: 0.6 }),
    sclera: std(0xeee6d4, 0.3), iris: std(0x3a2a1a, 0.3), irisBlue: std(0x3a5a7a, 0.3), irisGrey: std(0x6a6e70, 0.3),
    pearl: std(0xf4efe4, 0.25, 0.1), leaf: std(0x5f7a33, 0.8), leafGold: std(0xd9b04a, 0.3, 0.9, { envMap: env, envMapIntensity: 0.7 }),
    ivy: std(0x3f5a2a, 0.75), grape: std(0x4a2458, 0.35), rose: std(0xb8304a, 0.6), leopard: std(0xc08a3a, 0.9), spot: std(0x2a1d14, 0.9),
    glowGold: glow(0xffe29a), glowWhite: glow(0xffffff), fire: glow(0xff9a3a), fireCore: glow(0xffe8a8), ember: glow(0xffb060),
    peacock: std(0x1f6f78, 0.4, 0.3), peacockEye: std(0x1f3f9a, 0.35, 0.3),
    felt: std(0x6b5238, 0.95), crestRed: std(0x9a2a22, 0.85), leather: M.leather,
  };
  return M.__gods;
}

/** Olhos (esclera + íris) nas órbitas da cabeça esculpida (mesma posição dos olhos em brasa do bípede). */
function eyes(THREE, head, g, iris) {
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 12, 10), g.sclera); e.position.set(s * 0.031, 0.133, -0.079); head.add(e);
    const i = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 10, 8), iris); i.position.set(s * 0.031, 0.133, -0.0905); head.add(i);
  }
}

/**
 * Chapéu do kit (pétaso, pílos) mais alto e inclinado para trás: no retrato o rosto fica à vista debaixo da aba (os
 * nós de chapéu são os filhos da cabeça criados pelo kit, acima da testa).
 */
function liftHat(head, dy, tilt) {
  for (const c of head.children) {
    if (c.userData.__god) continue;
    const isHat = (c.isGroup && c.position.y > 0.12) || (c.isMesh && c.geometry?.type === 'ConeGeometry' && c.position.y > 0.18);
    if (!isHat) continue;
    c.position.y += dy; c.position.z += 0.02; c.rotation.x += tilt;
  }
}

/** Coroa de folhas em volta da cabeça (louro, hera): `mat` das folhas, frutos opcionais. */
function wreath(THREE, head, mat, { r = 0.122, y = 0.17, n = 22, berry = null, berryEvery = 4, tilt = 0.18 } = {}) {
  const g = new THREE.Group(); g.position.set(0, y, 0.004); g.rotation.x = tilt; head.add(g);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    if (Math.abs(Math.sin(a / 2)) < 0.12) continue;   // aberto na nuca
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), mat);
    l.scale.set(0.45, 0.22, 1.1);
    l.position.set(Math.sin(a) * r, 0.006 * Math.sin(k * 2.3), -Math.cos(a) * r);
    l.rotation.y = -a + Math.PI / 2 + (k % 2 ? 0.5 : -0.5);
    l.rotation.x = k % 2 ? 0.4 : -0.3;
    g.add(l);
    if (berry && k % berryEvery === 0) {
      for (let b = 0; b < 3; b++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), berry); s.position.set(Math.sin(a) * (r + 0.01), -0.012 - b * 0.012, -Math.cos(a) * (r + 0.01) + (b % 2) * 0.008); g.add(s); }
    }
  }
  return g;
}

/** Zigue-zague do raio (plano XY). */
function boltGeo(THREE, s = 1) {
  const zig = [[0.03, 0.2], [-0.05, 0.03], [0.012, 0.025], [-0.04, -0.2], [0.065, -0.008], [0.004, -0.004], [0.08, 0.2]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(zig), { depth: 0.02 * s, bevelEnabled: true, bevelThickness: 0.004 * s, bevelSize: 0.004 * s, bevelSegments: 2 });
  geo.translate(0, 0, -0.01 * s);
  return geo;
}

/** Monta o corpo de um deus. `o` = { female, build, tone, hair, beard, hairColor, iris, kit, dress, drape, drapeColor, bulk }. */
function base(THREE, M, g, o) {
  const kit = { hair: false, armor: 'bare', ...(o.kit ?? {}) };
  const human = buildHuman(THREE, M, kit, { meters: true });
  const J = human.joints;
  const body = dressBody(THREE, M, human, { build: o.female ? 'female' : (o.build ?? 'heroic'), tone: o.tone ?? (o.female ? 'pale' : 'tan'), head: o.female ? 'female' : 'male', bulk: o.bulk ?? 1 });
  if (o.hair !== 'none' || (o.beard ?? 'none') !== 'none') addHair(THREE, J.head, M.furV, { style: o.hair ?? 'short', beard: o.beard ?? 'none', color: o.hairColor ?? 0x3a2a1c, seed: o.seed ?? 3 });
  eyes(THREE, J.head, g, o.iris ?? g.iris);
  // pose de busto: ombros um pouco abertos, cabeça levemente erguida e voltada para a câmera
  J.shoulderL.rotation.z = -0.18; J.shoulderR.rotation.z = 0.18;
  J.elbowL.rotation.x = 0.3; J.elbowR.rotation.x = 0.3;
  J.head.rotation.x = -0.06;
  body.skin?.();
  // veste: peplos/quíton (do peito para baixo, alças nos ombros) e himátion (faixa larga em diagonal)
  if (o.dress) body.skirt(0.5, -0.2, g.cloth(o.dress), { flare: 0.12, folds: 18, foldAmp: 0.006, rings: 8, seed: 5 });
  if (o.drape) body.band(0.4, o.drapeTilt ?? 0.75, o.drapeWidth ?? 0.16, g.cloth(o.drape), { off: 0.012, segs: 48 });
  if (o.collar) body.band(0.575, 0, 0.035, o.collar, { off: 0.008, segs: 40 });
  return { human, J, body };
}

const GODS = {
  zeus(THREE, M, g) {
    const r = base(THREE, M, g, { hair: 'curls', beard: 'full', hairColor: 0xcfc8bc, iris: g.irisGrey, drape: 0x3b3d8a, drapeWidth: 0.2, tone: 'tan', bulk: 1.05 });
    wreath(THREE, r.J.head, g.leafGold, { r: 0.124 });
    const b = new THREE.Mesh(boltGeo(THREE, 1.6), g.gold); b.position.set(0.3, 1.72, 0.02); b.rotation.set(0, Math.PI, -0.35); r.human.group.add(b);
    const core = new THREE.Mesh(boltGeo(THREE, 1.1), g.glowWhite); core.position.set(0.305, 1.73, -0.012); core.rotation.set(0, Math.PI, -0.35); core.userData.noShadow = true; r.human.group.add(core);
    return r;
  },
  poseidon(THREE, M, g) {
    const r = base(THREE, M, g, { hair: 'wild', beard: 'full', hairColor: 0x3d4f4b, iris: g.irisBlue, drape: 0x2e6f68, drapeWidth: 0.2, tone: 'tan', bulk: 1.05, seed: 7 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.008, 6, 40), g.gold); band.position.set(0, 0.165, 0.005); band.rotation.x = Math.PI / 2 + 0.15; r.J.head.add(band);
    // tridente em pé atrás do ombro direito, com os dentes acima da cabeça
    const t = new THREE.Group(); t.position.set(-0.3, 0, 0.12); r.human.group.add(t);
    t.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 2.2, 10), g.gold), 0, 1.1, 0));
    const prong = (x, h) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h, 8), g.gold); m.position.set(x, 2.2 + h / 2, 0); t.add(m); const c = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.08, 8), g.gold); c.position.set(x, 2.2 + h + 0.03, 0); t.add(c); };
    prong(-0.12, 0.2); prong(0, 0.3); prong(0.12, 0.2);
    const bar = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.014, 6, 24, Math.PI), g.gold); bar.position.set(0, 2.24, 0); bar.rotation.z = Math.PI; t.add(bar);
    return r;
  },
  hades(THREE, M, g) {
    const r = base(THREE, M, g, { hair: 'short', beard: 'full', hairColor: 0x141011, iris: g.iris, drape: 0x201c24, drapeWidth: 0.26, drapeTilt: 0.6, tone: 'pale', bulk: 1.03, seed: 9 });
    // coroa escura de pontas
    const c = new THREE.Group(); c.position.set(0, 0.19, 0.004); c.rotation.x = 0.12; r.J.head.add(c);
    c.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.122, 0.035, 36, 1, true), g.darkMetal));
    for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; const s = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.085, 5), g.darkMetal); s.position.set(Math.sin(a) * 0.12, 0.055, -Math.cos(a) * 0.12); c.add(s); }
    for (let k = 0; k < 3; k++) { const a = (k / 3 - 0.33) * 1.2; const s = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), g.fire); s.position.set(Math.sin(a) * 0.123, 0.0, -Math.cos(a) * 0.123); c.add(s); }
    // bidente atrás do ombro esquerdo
    const t = new THREE.Group(); t.position.set(0.3, 0, 0.14); r.human.group.add(t);
    t.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 2.2, 10), g.darkMetal), 0, 1.1, 0));
    for (const x of [-0.07, 0.07]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.32, 8), g.darkMetal); m.position.set(x, 2.36, 0); t.add(m); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.03), g.darkMetal); bar.position.set(0, 2.2, 0); t.add(bar);
    return r;
  },
  athena(THREE, M, g) {
    const r = base(THREE, M, g, { female: true, hair: 'long', hairColor: 0x5a3b22, iris: g.irisGrey, dress: 0x6f7f96, seed: 12 });
    // elmo ático empurrado para cima: calota de bronze, aba da testa e a crina alta
    const h = new THREE.Group(); h.position.set(0, 0.19, 0.01); h.rotation.x = -0.25; r.J.head.add(h);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.13, 28, 16, 0, TAU, 0, Math.PI * 0.5), M.bronze); dome.scale.set(1, 0.9, 1.1); h.add(dome);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.01, 6, 36), M.bronze); brim.rotation.x = Math.PI / 2; h.add(brim);
    const crestH = new THREE.Group(); crestH.position.set(0, 0.11, 0); h.add(crestH);
    crestH.add(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.04, 0.22), M.bronzeDark));
    const crest = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 12, 0, TAU, 0, Math.PI / 2), g.crestRed); crest.scale.set(0.18, 1.15, 1.35); crest.position.set(0, 0.02, 0.02); crestH.add(crest);
    // égide: gola de escamas de ouro e o gorgoneion no peito
    const ae = r.body.band(0.53, 0, 0.07, g.gold, { off: 0.01, segs: 48 }); void ae;
    const gor = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 12), g.gold); gor.scale.set(1, 1, 0.45); gor.position.set(0, 0.48, -0.14); r.J.torso.add(gor);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; const s = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 4, 8, Math.PI), M.bronzeDark); s.position.set(Math.cos(a) * 0.045, 0.48 + Math.sin(a) * 0.045, -0.145); s.rotation.z = a; r.J.torso.add(s); }
    // lança em pé
    const sp = new THREE.Group(); sp.position.set(-0.3, 0, 0.1); r.human.group.add(sp);
    sp.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 2.1, 8), M.wood), 0, 1.05, 0));
    sp.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 8), M.bronze), 0, 2.2, 0));
    return r;
  },
  hermes(THREE, M, g) {
    const r = base(THREE, M, g, { hair: 'curls', hairColor: 0x4a3222, iris: g.iris, drape: 0x9a4a28, drapeWidth: 0.14, drapeTilt: -0.8, kit: { helmet: 'petasos' }, seed: 14 });
    liftHat(r.J.head, 0.045, -0.35);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), g.gold); pin.position.set(-0.17, 0.53, -0.07); r.J.torso.add(pin);
    // caduceu diante do ombro esquerdo
    const c = new THREE.Group(); c.position.set(0.28, 0.9, -0.06); c.rotation.z = -0.12; r.human.group.add(c);
    c.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 1.0, 8), g.gold), 0, 0.5, 0));
    for (const ph of [0, Math.PI]) {
      const pts = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24, a = ph + t * TAU * 2; pts.push(new THREE.Vector3(Math.cos(a) * 0.04, 0.4 + t * 0.46, Math.sin(a) * 0.04)); }
      c.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.011, 6), M.bronze));
    }
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.09 - i * 0.015, 0.008, 0.025), M.feather); f.position.set(s * (0.055 + i * 0.02), 0.95 + i * 0.022, 0); f.rotation.z = s * (0.3 + i * 0.15); c.add(f); }
    return r;
  },
  ares(THREE, M, g) {
    const r = base(THREE, M, g, { hair: 'short', beard: 'full', hairColor: 0x2a1c14, iris: g.iris, drape: 0x8a2420, drapeWidth: 0.18, drapeTilt: -0.7, tone: 'ruddy', bulk: 1.1, seed: 16 });
    // couraça de bronze (faixa larga no peito) e o elmo com a crina vermelha empurrado para cima
    r.body.band(0.38, 0, 0.3, M.bronze, { off: 0.014, segs: 48 });
    const h = new THREE.Group(); h.position.set(0, 0.2, 0.012); h.rotation.x = -0.3; r.J.head.add(h);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.132, 28, 16, 0, TAU, 0, Math.PI * 0.55), M.bronze); dome.scale.set(1, 0.95, 1.12); h.add(dome);
    for (const s of [-1, 1]) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.08), M.bronze); ch.position.set(s * 0.12, -0.03, -0.07); h.add(ch); }
    const crest = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 12, 0, TAU, 0, Math.PI / 2), g.crestRed); crest.scale.set(0.2, 1.3, 1.5); crest.position.set(0, 0.11, 0.02); h.add(crest);
    const sp = new THREE.Group(); sp.position.set(-0.32, 0, 0.1); sp.rotation.z = 0.08; r.human.group.add(sp);
    sp.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 2.1, 8), M.wood), 0, 1.05, 0));
    sp.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.22, 8), M.iron), 0, 2.2, 0));
    return r;
  },
  apollo(THREE, M, g) {
    const r = base(THREE, M, g, { hair: 'long', hairColor: 0xc9a24a, iris: g.irisBlue, drape: 0xe6d8a8, drapeWidth: 0.2, seed: 18 });
    wreath(THREE, r.J.head, g.leaf, { r: 0.126 });
    // auréola de raios de sol atrás da cabeça
    const halo = new THREE.Group(); halo.position.set(0, 0.14, 0.14); r.J.head.add(halo);
    const disc = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 48), g.glowGold); disc.userData.noShadow = true; halo.add(disc);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; const ray = new THREE.Mesh(new THREE.BoxGeometry(0.012, k % 2 ? 0.1 : 0.15, 0.004), g.glowGold); ray.position.set(Math.sin(a) * (0.26 + (k % 2 ? 0 : 0.025)), Math.cos(a) * (0.26 + (k % 2 ? 0 : 0.025)), 0); ray.rotation.z = -a; ray.userData.noShadow = true; halo.add(ray); }
    return r;
  },
  dionysus(THREE, M, g) {
    const r = base(THREE, M, g, { hair: 'curls', hairColor: 0x2e1f16, iris: g.iris, drape: 0x5a2a6a, drapeWidth: 0.16, tone: 'ruddy', seed: 20 });
    wreath(THREE, r.J.head, g.ivy, { r: 0.13, n: 18, berry: g.grape, berryEvery: 3 });
    // nébride (pele de leopardo) no outro ombro
    const neb = r.body.band(0.42, -0.7, 0.13, g.leopard, { off: 0.03, segs: 48 }); void neb;
    for (let k = 0; k < 10; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), g.spot); s.scale.set(1, 1, 0.3); s.position.set(-0.14 + k * 0.03, 0.54 - k * 0.028, -0.12 + Math.abs(k - 5) * 0.004); r.J.torso.add(s); }
    return r;
  },
  aphrodite(THREE, M, g) {
    const r = base(THREE, M, g, { female: true, hair: 'long', hairColor: 0xa4552a, iris: g.irisBlue, dress: 0xd98a9a, collar: g.gold, seed: 22 });
    const d = new THREE.Group(); d.position.set(0, 0.17, 0.004); d.rotation.x = 0.2; r.J.head.add(d);
    for (let k = 0; k < 14; k++) { const a = -1.2 + (k / 13) * 2.4; const p = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), g.pearl); p.position.set(Math.sin(a) * 0.126, 0, -Math.cos(a) * 0.126); d.add(p); }
    const rose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), g.rose); rose.position.set(0.1, 0.14, -0.02); r.J.head.add(rose);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), g.leaf); leaf.scale.set(1.4, 0.4, 0.8); leaf.position.set(0.125, 0.12, -0.0); r.J.head.add(leaf);
    return r;
  },
  hera(THREE, M, g) {
    const r = base(THREE, M, g, { female: true, hair: 'long', hairColor: 0x3a2618, iris: g.iris, dress: 0x6a2a5a, collar: g.gold, seed: 24 });
    // pólos (coroa cilíndrica alta) de ouro com gemas e o véu caindo atrás
    const p = new THREE.Group(); p.position.set(0, 0.2, 0.01); p.rotation.x = 0.1; r.J.head.add(p);
    p.add(new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.12, 0.1, 36), g.gold));
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; const s = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), k % 2 ? g.peacockEye : M.berry); s.position.set(Math.sin(a) * 0.119, 0, -Math.cos(a) * 0.119); p.add(s); }
    const veil = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16, 0, Math.PI, 0, Math.PI * 0.7), g.cloth(0xe9e2d0)); veil.position.set(0, 0.12, 0.03); veil.scale.set(1.05, 1.6, 1.1); veil.rotation.x = 0.25; r.J.head.add(veil);   // só a metade de trás (+z): o rosto fica livre
    // leque de penas de pavão atrás da cabeça (a coroa de Hera)
    const fan = new THREE.Group(); fan.position.set(0, 0.13, 0.12); r.J.head.add(fan);
    for (let k = 0; k < 9; k++) {
      const a = -1.15 + (k / 8) * 2.3;
      const f = new THREE.Group(); f.rotation.z = -a; fan.add(f);
      const v = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), g.peacock); v.scale.set(0.55, 1.7, 0.12); v.position.set(0, 0.2, 0); f.add(v);
      const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), g.gold); e1.scale.set(0.8, 1.1, 0.2); e1.position.set(0, 0.26, -0.008); f.add(e1);
      const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), g.peacockEye); e2.scale.set(0.8, 1.1, 0.25); e2.position.set(0, 0.26, -0.014); f.add(e2);
    }
    return r;
  },
  hephaestus(THREE, M, g) {
    const r = base(THREE, M, g, { hair: 'wild', beard: 'full', hairColor: 0x2a1a12, iris: g.iris, tone: 'ruddy', build: 'brute', bulk: 1.05, kit: { helmet: 'pilos', helmetMat: 'felt' }, seed: 26 });
    liftHat(r.J.head, 0.05, -0.3);
    r.body.band(0.44, 0.72, 0.06, M.leather, { off: 0.012, segs: 48 });
    r.body.band(0.2, 0, 0.3, M.leather, { off: 0.02, segs: 48 });
    // martelo apoiado no ombro direito, fagulhas
    const h = new THREE.Group(); h.position.set(-0.24, 1.3, -0.02); h.rotation.set(0, 0, -0.9); r.human.group.add(h);
    h.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.6, 8), M.wood), 0, 0.1, 0));
    h.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.1), M.bronze), 0, 0.42, 0));
    for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), g.ember); s.position.set(-0.35 + 0.08 * Math.sin(i * 2.1), 1.55 + 0.03 * i, -0.08 + 0.05 * Math.cos(i * 1.7)); s.userData.noShadow = true; r.human.group.add(s); }
    return r;
  },
  artemis(THREE, M, g) {
    const r = base(THREE, M, g, { female: true, hair: 'long', hairColor: 0x6a3a22, iris: g.irisGrey, dress: 0x7a8a5a, kit: { quiver: true }, seed: 28 });
    // diadema com o crescente de prata
    const d = new THREE.Group(); d.position.set(0, 0.18, 0.004); d.rotation.x = 0.2; r.J.head.add(d);
    { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.006, 6, 40), g.silver); ring.rotation.x = Math.PI / 2; d.add(ring); }
    const pts = [];
    for (let i = 0; i <= 20; i++) { const a = -Math.PI / 2 + (i / 20) * Math.PI; pts.push(new THREE.Vector2(Math.cos(a) * 0.05, Math.sin(a) * 0.05)); }
    for (let i = 20; i >= 0; i--) { const a = -Math.PI / 2 + (i / 20) * Math.PI; pts.push(new THREE.Vector2(Math.cos(a) * 0.036 + 0.018, Math.sin(a) * 0.044)); }
    const moon = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.008, bevelEnabled: false }), g.silver);
    moon.position.set(-0.01, 0.045, -0.12); moon.rotation.set(0, Math.PI, Math.PI / 2); d.add(moon);
    // arco atravessado nas costas (a ponta aparece acima do ombro)
    const bow = new THREE.Group(); bow.position.set(0.05, 1.3, 0.16); bow.rotation.set(0, 0, 0.7); r.human.group.add(bow);
    const bpts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16 * 2 - 1; bpts.push(new THREE.Vector3(-0.1 * (1 - t * t), t * 0.55, 0)); }
    bow.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bpts), 40, 0.012, 6), g.silver));
    return r;
  },
};

/** Constrói o busto do deus `key`, já em tiles e girado em três quartos para a câmera. */
export function buildGod(THREE, M, key, params = {}) {
  const fn = GODS[key];
  if (!fn) throw new Error(`deus desconhecido: ${key}`);
  const g = G(THREE, M);
  const r = fn(THREE, M, g);
  const root = new THREE.Group();
  root.add(r.human.group);
  // frente do rig em −z; a câmera olha do sul (+z): gira de frente e um pouco para a esquerda (três quartos)
  r.human.group.rotation.y = Math.PI + (params.yaw ?? 0.42);
  return root;
}
export const GOD_KEYS = Object.keys(GODS);
