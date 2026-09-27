#!/usr/bin/env node
// Gerador das poses do QUADRÚPEDE (Etapa 6, docs/ART.md Apêndice G): escreve art/poses/beast.json a partir das medidas de
// perna do rig (rigs/beast.js: LEG, BODY_Y) com IK de duas juntas — no andar e no galope a pata de apoio fica PARADA no
// chão e recua exatamente a passada do ciclo (o bake mede o mesmo recuo em measure.mjs; o renderizador avança o quadro
// pela distância), sem ajuste a olho. Parado, bote e morte também passam pelo IK (patas no chão enquanto apoiam).
// Uso: node scripts/bake/gait.mjs [--check]   (--check: falha se o arquivo versionado difere do gerado)
// Para mexer numa animação: mude os parâmetros abaixo (passada, fração de apoio, fases das patas, arfagem, cauda…) e
// rode de novo; o JSON continua sendo o que o bake lê (art/poses/beast.json).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEG, BODY_Y, JOINTS } from './page/rigs/beast.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'art', 'poses', 'beast.json');
const DEG = 180 / Math.PI;
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;

// o IK leva o CENTRO da pata (pivô nivelado, no fim da perna) a PAW_H acima do ponto de apoio: a almofada fica plana no chão
const Lu = LEG.up, Lc = LEG.low + 0.005, PAW_H = LEG.paw;
const LEGS = {
  fl: { hind: false, x: -LEG.frontX, z: LEG.frontZ }, fr: { hind: false, x: LEG.frontX, z: LEG.frontZ },
  bl: { hind: true, x: -LEG.backX, z: LEG.backZ }, br: { hind: true, x: LEG.backX, z: LEG.backZ },
};
/** Topo da perna (y, z) no modelo, com a raiz em (rootY, rootZ) e a metade do corpo girada `pitch` graus em x. */
function legTop(leg, rootY, rootZ, pitch) {
  const a = pitch / DEG, y0 = LEG.attachY, z0 = leg.hind ? LEG.backZ - 0.05 : leg.z, pz = leg.hind ? 0.05 : 0;
  // rotação x (positiva ergue a frente, −z): y' = y cos − z sin; z' = y sin + z cos (em volta da origem da metade)
  return { y: BODY_Y + rootY + y0 * Math.cos(a) - z0 * Math.sin(a), z: rootZ + pz + y0 * Math.sin(a) + z0 * Math.cos(a) };
}
/**
 * Ângulos [coxa/braço, joelho/jarrete] (graus) para a pata tocar (ty, tz) no modelo, com o topo em `top` e a metade girada
 * `pitch`. Dianteira dobra com o joelho negativo (pata para trás), traseira positivo. Fora do alcance: perna esticada.
 */
function ik(leg, top, ty, tz, pitch) {
  const a = -pitch / DEG;
  let dy = ty - top.y, dz = tz - top.z;
  [dy, dz] = [dy * Math.cos(a) - dz * Math.sin(a), dy * Math.sin(a) + dz * Math.cos(a)];   // para o referencial da metade
  const Y = -dy, Z = -dz, D = Math.min(Lu + Lc - 1e-6, Math.sqrt(Y * Y + Z * Z));
  let c2 = (D * D - Lu * Lu - Lc * Lc) / (2 * Lu * Lc);
  c2 = Math.max(-1, Math.min(1, c2));
  const t2 = Math.acos(c2) * (leg.hind ? 1 : -1);
  const t1 = Math.atan2(Z, Y) - Math.atan2(Lc * Math.sin(t2), Lu + Lc * Math.cos(t2));
  return [t1 * DEG, t2 * DEG];
}
/** Fase de uma pata no ciclo: apoio em [0, β) com a pata recuando de −S·β/2 a +S·β/2; balanço de volta erguendo `lift`. */
function foot(u, S, beta, lift, zc) {
  if (u < beta) return { y: 0, z: zc - (S * beta) / 2 + S * u, planted: true };
  const s = (u - beta) / (1 - beta);
  return { y: lift * Math.sin(Math.PI * s), z: zc + (S * beta) / 2 - S * beta * (s * s * (3 - 2 * s)), planted: false };
}
const legKey = (out, name, a) => { out[name] = [r1(a[0]), 0, 0]; out[name + 'k'] = [r1(a[1]), 0, 0]; };

/**
 * Ciclo de locomoção: `frames` chaves em t = i/frames; S = passada (m por ciclo), beta = fração de apoio, phase = início do
 * apoio de cada pata, lift = altura do balanço, bob = subida da raiz (m, por fase), pitch/hips = arfagem das metades.
 */
function gait({ frames, S, beta, phase, lift, bob, body, hips, neck, head, tail, jaw = () => 0, zc = { fl: -0.02, fr: -0.02, bl: 0.06, br: 0.06 } }) {
  const keys = [];
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    const rootY = bob(t), bp = body(t), hp = hips(t);
    const k = { t: r3(t), root: { pos: [0, r3(rootY), 0] }, body: [r1(bp), 0, 0], hips: [r1(hp), 0, 0], neck: neck(t), head: head(t), jaw: [r1(jaw(t)), 0, 0] };
    Object.assign(k, tail(t));
    for (const [name, leg] of Object.entries(LEGS)) {
      const u = (((t - phase[name]) % 1) + 1) % 1;
      const f = foot(u, S, beta[name] ?? beta.all, lift, zc[name] + leg.z);
      const pitch = leg.hind ? hp : bp;
      legKey(k, name, ik(leg, legTop(leg, rootY, 0, pitch), f.y + PAW_H, f.z, pitch));
    }
    keys.push(k);
  }
  return keys;
}
const sin = (t, ph = 0) => Math.sin(2 * Math.PI * (t + ph));
// cauda: x positivo abaixa (o segmento aponta para trás, +z); a do leão cai da garupa e a ponta volta a subir
const tailSwing = (amp, drop = 42) => (t) => ({ tail0: [r1(drop + 4 * sin(t)), r1(amp * sin(t, 0.1)), 0], tail1: [r1(14), r1(amp * 0.8 * sin(t, 0.25)), 0], tail2: [r1(-16), r1(amp * 0.6 * sin(t, 0.4)), 0], tail3: [r1(-26), r1(amp * 0.5 * sin(t, 0.55)), 0] });

/** Pose parada/estática por IK: patas nas posições neutras (ou `feet`), raiz e metades dadas. */
function stand({ t, rootY = 0, rootZ = 0, rootRot = null, body = 0, hips = 0, neck = [0, 0, 0], head = [0, 0, 0], jaw = 0, tail, feet = {}, free = {} }) {
  const k = { t, root: { pos: [0, r3(rootY), r3(rootZ)], ...(rootRot ? { rot: rootRot } : {}) }, body: [r1(body), 0, 0], hips: [r1(hips), 0, 0], neck, head, jaw: [r1(jaw), 0, 0], ...tail };
  for (const [name, leg] of Object.entries(LEGS)) {
    if (free[name]) { k[name] = free[name][0]; k[name + 'k'] = free[name][1]; continue; }
    const f = feet[name] ?? { y: 0, z: leg.z + (leg.hind ? 0.06 : -0.02) };
    const pitch = leg.hind ? hips : body;
    legKey(k, name, ik(leg, legTop(leg, rootY, rootZ, pitch), f.y + PAW_H, f.z, pitch));
  }
  return k;
}

const anims = {};
// parado (4 quadros): respira, olha em volta devagar, a cauda balança
anims.idle_beast = { loop: true, ease: 'smooth', keys: [
  stand({ t: 0, rootY: 0, neck: [4, 0, 0], head: [0, -6, 0], tail: tailSwing(14)(0) }),
  stand({ t: 0.5, rootY: -0.012, body: -0.6, neck: [6, 0, 0], head: [3, 8, 0], jaw: 4, tail: tailSwing(14)(0.5) }),
] };
// andar (8 quadros, sequência lateral: traseira esq., dianteira esq., traseira dir., dianteira dir.; apoio 70 %)
anims.walk_beast = { loop: true, keys: gait({
  frames: 8, S: 1.5, beta: { all: 0.7 }, phase: { bl: 0, fl: 0.25, br: 0.5, fr: 0.75 }, lift: 0.12,
  bob: (t) => -0.015 + 0.015 * Math.cos(4 * Math.PI * t), body: (t) => 1.2 * sin(t, 0.1), hips: (t) => -1.2 * sin(t, 0.35),
  neck: (t) => [r1(2 + 3 * Math.cos(4 * Math.PI * t)), 0, 0], head: (t) => [r1(-2 * Math.cos(4 * Math.PI * t)), r1(3 * sin(t)), 0],
  tail: tailSwing(12, 36),
}) };
// galope (8 quadros, galope rotativo dos felinos: traseiras quase juntas, dianteiras quase juntas, fase no ar; apoio 30 %)
anims.run_beast = { loop: true, keys: gait({
  frames: 8, S: 3.8, beta: { all: 0.3 }, phase: { br: 0.0, bl: 0.09, fl: 0.46, fr: 0.56 }, lift: 0.3,
  // o corpo mais baixo no galope (pernas dobradas: alcançam o chão com a arfagem das metades) e sobe na fase no ar
  bob: (t) => -0.08 + 0.05 * Math.max(0, sin(t, 0.62)),
  body: (t) => r1(7 * sin(t, 0.05)), hips: (t) => r1(-9 * sin(t, 0.18)),
  neck: (t) => [r1(-6 + 5 * sin(t, 0.3)), 0, 0], head: (t) => [r1(4 * sin(t, 0.55)), 0, 0], jaw: () => 6,
  tail: (t) => ({ tail0: [r1(14 + 10 * sin(t, 0.4)), 0, 0], tail1: [4, 0, 0], tail2: [-6, 0, 0], tail3: [-12, 0, 0] }),
}) };
// bote/mordida (6 quadros, sem loop): agacha, salta com as garras à frente (o golpe chega no 2º quadro), morde e volta
const T = (a, b, c, d) => ({ tail0: [a, 0, 0], tail1: [b, 0, 0], tail2: [c, 0, 0], tail3: [d, 0, 0] });
anims.attack_beast = { loop: false, keys: [
  stand({ t: 0, rootY: -0.1, rootZ: 0.06, body: -5, hips: 6, neck: [-10, 0, 0], head: [8, 0, 0], jaw: 10, tail: T(30, 10, -12, -20) }),
  stand({ t: 0.2, rootY: 0.06, rootZ: -0.3, body: 12, hips: -4, neck: [-4, 0, 0], head: [-6, 0, 0], jaw: 34, tail: T(14, 2, -6, -10),
    free: { fl: [[64, 0, 0], [-58, 0, 0]], fr: [[48, 0, 0], [-40, 0, 0]] } }),
  stand({ t: 0.4, rootY: -0.03, rootZ: -0.26, body: 2, hips: 2, neck: [-14, 0, 0], head: [18, 0, 0], jaw: 6, tail: T(22, 6, -10, -16),
    feet: { fl: { y: 0, z: LEGS.fl.z - 0.36 }, fr: { y: 0, z: LEGS.fr.z - 0.3 } } }),
  stand({ t: 0.7, rootY: -0.02, rootZ: -0.12, body: 1, hips: 0, neck: [-4, 0, 0], head: [6, 0, 0], jaw: 16, tail: T(34, 12, -14, -22),
    feet: { fl: { y: 0, z: LEGS.fl.z - 0.2 }, fr: { y: 0.04, z: LEGS.fr.z - 0.1 } } }),
  stand({ t: 1, rootY: 0, rootZ: 0, neck: [4, 0, 0], head: [0, 0, 0], jaw: 4, tail: T(42, 14, -16, -26) }),
] };
// morte (6 quadros): as patas cedem, tomba sobre o flanco e fica deitado com as patas soltas
anims.die_beast = { loop: false, ease: 'smooth', keys: [
  stand({ t: 0, rootY: -0.02, body: 2, neck: [6, 0, 0], head: [-6, 0, 0], jaw: 24, tail: T(42, 14, -16, -26) }),
  { ...stand({ t: 0.4, rootY: -0.34, body: -6, hips: 4, neck: [-6, 0, 12], head: [10, 0, 0], jaw: 18, tail: T(30, 10, -6, -8) }), root: { pos: [0.05, -0.34, 0], rot: [0, 0, 22] } },
  { t: 1, root: { pos: [0.26, -(BODY_Y - 0.4), 0], rot: [0, 0, 82] }, body: [0, 0, 0], hips: [0, 0, 0], neck: [18, 0, 10], head: [14, 0, 0], jaw: [22, 0, 0],
    ...T(20, 8, 4, 2), fl: [26, 0, 0], flk: [-24, 0, 0], fr: [8, 0, 0], frk: [-10, 0, 0], bl: [-20, 0, 0], blk: [16, 0, 0], br: [-34, 0, 0], brk: [8, 0, 0] },
] };

const UNITS = 'GERADO por scripts/bake/gait.mjs (IK das patas a partir de rigs/beast.js: LEG, BODY_Y) — edite o gerador e rode de novo. Graus por pivô [x, y, z] (perna pendendo: x positivo leva a pata para a frente; joelho dianteiro dobra com x negativo, jarrete com x positivo); root: { pos: [m] a partir do corpo em BODY_Y, rot: [graus] }; body/hips: arfagem das metades (x positivo ergue a frente); jaw: x positivo abre; t em 0..1; loop = o último quadro não repete o primeiro';
// um quadro-chave por linha (diff legível)
const text = `{\n "rig": "beast",\n "version": 1,\n "units": ${JSON.stringify(UNITS)},\n "joints": ${JSON.stringify(JOINTS)},\n "anims": {\n`
  + Object.entries(anims).map(([n, a]) => `  ${JSON.stringify(n)}: {\n   "loop": ${a.loop},${a.ease ? ` "ease": ${JSON.stringify(a.ease)},` : ''} "keys": [\n`
    + a.keys.map((k) => '    ' + JSON.stringify(k)).join(',\n') + '\n   ]\n  }').join(',\n') + '\n }\n}\n';
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== text) { console.error('art/poses/beast.json difere do gerado por scripts/bake/gait.mjs'); process.exit(1); }
  console.log('beast.json em dia');
} else {
  fs.writeFileSync(OUT, text);
  console.log(`poses do quadrúpede: ${path.relative(ROOT, OUT)} (${Object.keys(anims).join(', ')})`);
}
