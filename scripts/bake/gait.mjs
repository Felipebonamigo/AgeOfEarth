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
/**
 * Fase de uma pata no ciclo: apoio em [0, β) com a pata recuando de −S·β/2 a +S·β/2; balanço de volta erguendo `lift`.
 * `retract` (0–1, Etapa 6): no balanço a pata sai e chega com essa fração da velocidade do chão (Hermite cúbica em vez
 * do smoothstep parado nas pontas) — ao sair do chão ela ainda recua um pouco antes de voltar, e antes de pousar recolhe
 * para trás; sem `retract`, o balanço de sempre (o leão e as outras poses não mudam).
 */
function foot(u, S, beta, lift, zc, retract = 0) {
  if (u < beta) return { y: 0, z: zc - (S * beta) / 2 + S * u, planted: true };
  const s = (u - beta) / (1 - beta);
  if (!retract) return { y: lift * Math.sin(Math.PI * s), z: zc + (S * beta) / 2 - S * beta * (s * s * (3 - 2 * s)), planted: false };
  const h01 = s * s * (3 - 2 * s), m = retract * S * (1 - beta);
  return { y: lift * Math.sin(Math.PI * s), z: zc + (S * beta) / 2 - S * beta * h01 + m * (s * s * s - 2 * s * s + s) + m * (s * s * s - s * s), planted: false };
}
const legKey = (out, name, a) => { out[name] = [r1(a[0]), 0, 0]; out[name + 'k'] = [r1(a[1]), 0, 0]; };

/**
 * Ciclo de locomoção: `frames` chaves em t = i/frames; S = passada (m por ciclo), beta = fração de apoio, phase = início do
 * apoio de cada pata, lift = altura do balanço, bob = subida da raiz (m, por fase), pitch/hips = arfagem das metades.
 */
function gait({ frames, S, beta, phase, lift, bob, body, hips, neck, head, tail, jaw = () => 0, zc = { fl: -0.02, fr: -0.02, bl: 0.06, br: 0.06 }, retract = 0 }) {
  const keys = [];
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    const rootY = bob(t), bp = body(t), hp = hips(t);
    const k = { t: r3(t), root: { pos: [0, r3(rootY), 0] }, body: [r1(bp), 0, 0], hips: [r1(hp), 0, 0], neck: neck(t), head: head(t), jaw: [r1(jaw(t)), 0, 0] };
    Object.assign(k, tail(t));
    for (const [name, leg] of Object.entries(LEGS)) {
      const u = (((t - phase[name]) % 1) + 1) % 1;
      const f = foot(u, S, beta[name] ?? beta.all, lift, zc[name] + leg.z, retract);
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
const WALK = {
  frames: 8, S: 1.5, beta: { all: 0.7 }, phase: { bl: 0, fl: 0.25, br: 0.5, fr: 0.75 }, lift: 0.12,
  bob: (t) => -0.015 + 0.015 * Math.cos(4 * Math.PI * t), body: (t) => 1.2 * sin(t, 0.1), hips: (t) => -1.2 * sin(t, 0.35),
  neck: (t) => [r1(2 + 3 * Math.cos(4 * Math.PI * t)), 0, 0], head: (t) => [r1(-2 * Math.cos(4 * Math.PI * t)), r1(3 * sin(t)), 0],
  tail: tailSwing(12, 36),
};
anims.walk_beast = { loop: true, keys: gait(WALK) };
// galope (8 quadros, galope rotativo dos felinos: traseiras quase juntas, dianteiras quase juntas, fase no ar; apoio 30 %)
const RUN = {
  frames: 8, S: 3.8, beta: { all: 0.3 }, phase: { br: 0.0, bl: 0.09, fl: 0.46, fr: 0.56 }, lift: 0.3,
  // o corpo mais baixo no galope (pernas dobradas: alcançam o chão com a arfagem das metades) e sobe na fase no ar
  bob: (t) => -0.08 + 0.05 * Math.max(0, sin(t, 0.62)),
  body: (t) => r1(7 * sin(t, 0.05)), hips: (t) => r1(-9 * sin(t, 0.18)),
  neck: (t) => [r1(-6 + 5 * sin(t, 0.3)), 0, 0], head: (t) => [r1(4 * sin(t, 0.55)), 0, 0], jaw: () => 6,
  tail: (t) => ({ tail0: [r1(14 + 10 * sin(t, 0.4)), 0, 0], tail1: [4, 0, 0], tail2: [-6, 0, 0], tail3: [-12, 0, 0] }),
};
anims.run_beast = { loop: true, keys: gait(RUN) };
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

// ---- lote feras (Etapa 6): Cérbero, quimera e mantícora sobre as bases acima (as MESMAS patas por IK), com a cauda, as
// asas e a boca de cada uma. `over` troca/acrescenta pivôs em cada quadro-chave de uma base (a ordem das chaves fica).
const over = (base, fn) => ({ ...base, keys: base.keys.map((k, i) => ({ ...k, ...fn(k, i) })) });
// Cérbero: a cauda de cão erguida (não pende como a do leão) e as bocas entreabertas mostrando as presas
const houndTail = (amp, lift = 8) => (t) => ({ tail0: [r1(lift + 4 * sin(t)), r1(amp * sin(t, 0.1)), 0], tail1: [r1(-8), r1(amp * 0.8 * sin(t, 0.25)), 0], tail2: [r1(-10), r1(amp * 0.6 * sin(t, 0.4)), 0], tail3: [r1(-8), r1(amp * 0.5 * sin(t, 0.55)), 0] });
anims.idle_cerberus = over(anims.idle_beast, (k) => ({ jaw: [r1(10 + 8 * sin(k.t, 0.2)), 0, 0], ...houndTail(10)(k.t) }));
anims.walk_cerberus = over(anims.walk_beast, (k) => ({ jaw: [8, 0, 0], ...houndTail(12, 12)(k.t) }));
// (sem galope: com `run` o Cérbero a 1,4 não cabia numa página 2048² a 2× — 256 quadros; o carregamento por tipo pede
// uma página por passe. A 3,4 tiles/s ele anda pelo `walk` avançado pela distância, como a quimera e o minotauro)
anims.attack_cerberus = over(anims.attack_beast, (k) => ({ jaw: [r1(Math.min(46, k.jaw[0] * 1.35 + 6)), 0, 0], tail0: [r1(k.tail0[0] - 26), 0, 0] }));

// quimera: a cauda de serpente ARQUEADA sobre a garupa com a cabeça de víbora olhando para a frente (a terceira cabeça),
// balançando devagar; x negativo ergue o segmento (aponta para trás, +z)
const snakeTail = (sway = 8, rise = 0) => (t) => ({ tail0: [r1(-38 - rise), r1(sway * 0.4 * sin(t, 0.1)), 0], tail1: [r1(-30 - rise * 0.5), r1(sway * 0.6 * sin(t, 0.3)), 0], tail2: [-34, r1(sway * sin(t, 0.5)), 0], tail3: [-26, r1(sway * 0.8 * sin(t, 0.7)), 0] });
anims.idle_chimera = over(anims.idle_beast, (k) => ({ jaw: [r1(6 + 4 * sin(k.t, 0.2)), 0, 0], ...snakeTail(10)(k.t) }));
// (andar pesado: passada de 1,4 m no rig — ×1,5 do `size` = 1,05 tile por ciclo, dentro do 0,6–1,1 dos quadrúpedes)
anims.walk_chimera = over({ loop: true, keys: gait({ ...WALK, S: 1.4 }) }, (k) => snakeTail(7)(k.t));
// sopro de fogo (6 quadros, sem loop): o golpe em área chega no tick em que o ataque começa (combat.ts attackTick), e o
// jato de fogo da Etapa 5 (fx/handlers/splash.ts) sai da boca nesse instante e dura ≈ 0,3 s — então o quadro 0 JÁ É o
// sopro (cabeça erguida, goela aberta em brasa com a língua de fogo), segurado nos quadros
// 1–2 (a cabeça varre um pouco), e a boca fecha e o corpo volta nos quadros 3–5. A víbora da cauda se ergue junto.
anims.attack_chimera = { loop: false, keys: [
  // (a cabeça ERGUIDA, focinho para cima: vista de cima a 50°, uma cabeça nivelada esconde a boca; erguida, a goela em
  // brasa fica à mostra de frente e de lado)
  stand({ t: 0, rootY: -0.05, rootZ: -0.1, body: -2, hips: 3, neck: [6, 0, 0], head: [40, -4, 0], jaw: 54, tail: snakeTail(0, 20)(0),
    feet: { fl: { y: 0, z: LEGS.fl.z - 0.12 }, fr: { y: 0, z: LEGS.fr.z - 0.04 } } }),
  stand({ t: 0.2, rootY: -0.06, rootZ: -0.11, body: -3, hips: 3, neck: [4, 5, 0], head: [38, 5, 0], jaw: 58, tail: snakeTail(0, 26)(0.2),
    feet: { fl: { y: 0, z: LEGS.fl.z - 0.12 }, fr: { y: 0, z: LEGS.fr.z - 0.04 } } }),
  stand({ t: 0.4, rootY: -0.05, rootZ: -0.1, body: -2, hips: 3, neck: [4, -4, 0], head: [34, -3, 0], jaw: 48, tail: snakeTail(0, 14)(0.4),
    feet: { fl: { y: 0, z: LEGS.fl.z - 0.12 }, fr: { y: 0, z: LEGS.fr.z - 0.04 } } }),
  stand({ t: 0.65, rootY: -0.02, rootZ: -0.04, body: -1, hips: 1, neck: [2, 0, 0], head: [12, 0, 0], jaw: 18, tail: snakeTail(4, 4)(0.65),
    feet: { fl: { y: 0.03, z: LEGS.fl.z - 0.07 } } }),
  stand({ t: 1, rootY: 0, rootZ: 0, neck: [4, 0, 0], head: [0, -6, 0], jaw: 6, tail: snakeTail(10)(0) }),
] };
// (na morte o corpo tomba girando +82° em z: o +x do corpo vira o ALTO — a cauda se deita com y NEGATIVO, para o chão;
// com y positivo ela ficava espetada para cima no bicho caído)
anims.die_chimera = over(anims.die_beast, (k, i) => (i === 0 ? snakeTail(6)(0) : i === 1 ? { tail0: [-10, -20, 0], tail1: [-10, -16, 0], tail2: [-6, -10, 0], tail3: [4, -6, 0] } : { tail0: [8, -34, 0], tail1: [4, -24, 0], tail2: [2, -16, 0], tail3: [0, -12, 0] }));

// mantícora: a cauda de escorpião ARMADA sobre o dorso (o feixe de espinhos por cima da cabeça), as asas de morcego
// dobradas ao longo dos flancos (x = torção, y = varrer para trás, z = erguer; wingTip em relação ao braço)
const scorp = (amp = 4, cock = 0) => (t) => ({ tail0: [r1(-86 - cock + 3 * sin(t)), r1(amp * sin(t, 0.1)), 0], tail1: [r1(-24 - cock * 0.5), r1(amp * 0.6 * sin(t, 0.3)), 0], tail2: [-34, 0, 0], tail3: [-40, 0, 0] });
// recolhida (`FOLD`): o braço meio aberto para os lados e para trás, a mão dobrada para trás e caída sobre o flanco — a
// membrana como um manto sobre as ancas (a asa colada ao dorso somava com a juba e a cauda num vulto de leão: a silhueta
// da mantícora ficava a 31 % da do Leão de Nemeia); aberta (`spread` 1): braço quase na horizontal, a mão estendida
const FOLD = { wing: [10, 42, 20], wingTip: [0, 44, -42] };
const wingsAt = (spread) => ({ wing: [r1(10 * (1 - spread)), r1(42 * (1 - spread) + 8 * spread), r1(20 * (1 - spread) + 34 * spread)], wingTip: [0, r1(44 * (1 - spread) + 6 * spread), r1(-42 * (1 - spread) - 6 * spread)] });
anims.idle_manticore = over(anims.idle_beast, (k) => ({ jaw: [r1(4 + 6 * sin(k.t, 0.2)), 0, 0], ...scorp(5)(k.t), ...FOLD }));
anims.walk_manticore = over(anims.walk_beast, (k) => ({ ...scorp(4)(k.t), ...FOLD }));
// galope da mantícora: o do leão com o apoio um pouco mais longo (34 % em vez de 30 %: as mesmas duas fases no ar, mais
// curtas) e o balanço com `retract` 0,5 (a pata sai do chão ainda recuando e recolhe antes de pousar). Com o do leão, a
// pata que acaba de sair do chão quase não se move entre dois quadros e, na mantícora menor (1,05), a faixa das patas nos
// pixels 2× lia esse vulto parado como o apoio: o pé acompanhava 79 % do chão (art-units-review: ≥ 80 %; o leão fica em
// 80 %). Medidos: apoio 30–36 % → 79, 79, 88, 85 %, mas a 34 % a troca de apoio entra na passada com recuo ≈ 0 (1,59
// tile < 1,6); com o `retract` 0,5, 86 % e 1,70 tile. As asas vão coladas e erguidas sobre o dorso, batendo pouco (abertas
// para os lados, a de perto da câmera caía sobre a faixa das patas nas vistas E/O)
const RUN_MANTICORE = { ...RUN, beta: { all: 0.34 }, retract: 0.5 };
anims.run_manticore = over({ loop: true, keys: gait(RUN_MANTICORE) }, (k) => ({ tail0: [r1(-46 + 6 * sin(k.t, 0.4)), 0, 0], tail1: [-26, 0, 0], tail2: [-26, 0, 0], tail3: [-20, 0, 0], wing: [8, 80, r1(30 + 8 * sin(k.t, 0.2))], wingTip: [0, 60, -24] }));
// disparo (6 quadros, sem loop; o projétil sai no tick do ataque, como o arco — docs/ART.md Apêndice E): quadro 0 = a
// cauda ACABOU de chicotear para a frente por cima da cabeça (os espinhos já voam), asas abertas, o peito erguido;
// depois a cauda volta e arma de novo, as asas recolhem pela metade
const whip = { tail0: [-96, 0, 0], tail1: [-58, 0, 0], tail2: [-26, 0, 0], tail3: [-8, 0, 0] };
anims.attack_manticore = { loop: false, keys: [
  stand({ t: 0, rootY: 0.02, rootZ: -0.04, body: 5, hips: -2, neck: [-6, 0, 0], head: [10, 0, 0], jaw: 30, tail: whip }),
  { ...stand({ t: 0.2, rootY: 0.01, rootZ: -0.03, body: 3, hips: -1, neck: [-4, 0, 0], head: [8, 0, 0], jaw: 22, tail: { tail0: [-86, 0, 0], tail1: [-50, 0, 0], tail2: [-32, 0, 0], tail3: [-18, 0, 0] } }), ...wingsAt(0.95) },
  { ...stand({ t: 0.5, rootY: -0.02, rootZ: -0.01, body: 0, neck: [0, 0, 0], head: [4, 0, 0], jaw: 10, tail: scorp(0, 10)(0) }), ...wingsAt(0.6) },
  { ...stand({ t: 1, rootY: -0.04, body: -2, hips: 1, neck: [-2, 0, 0], head: [6, 0, 0], jaw: 8, tail: scorp(0, 16)(0) }), ...wingsAt(0.4) },
] };
anims.attack_manticore.keys[0] = { ...anims.attack_manticore.keys[0], ...wingsAt(1) };
// mira (entre um disparo e outro): agachada, a cauda armada no alto tremendo, as asas meio abertas, rosnando
anims.aim_manticore = { loop: true, keys: [0, 0.5].map((t) => ({ ...stand({ t, rootY: -0.04 - 0.01 * sin(t), body: -2, hips: 1, neck: [-2, 0, 0], head: [6, 0, 0], jaw: 8 + 6 * sin(t, 0.25), tail: scorp(3, 16)(t) }), ...wingsAt(0.4 + 0.05 * sin(t)) })) };
// (a cauda se deita para o chão como a da quimera; as asas recolhidas e caídas: com o bicho de lado, a de cima se
// deita sobre o flanco — erguidas, ficavam espetadas como uma bandeira preta)
anims.die_manticore = over(anims.die_beast, (k, i) => (i === 0 ? { ...scorp(0)(0), ...wingsAt(0.6) } : i === 1 ? { tail0: [-30, -10, 0], tail1: [-14, -8, 0], tail2: [-10, 0, 0], tail3: [-6, 0, 0], wing: [4, 60, -20], wingTip: [0, 50, -24] } : { tail0: [10, -30, 0], tail1: [6, -16, 0], tail2: [4, -10, 0], tail3: [2, -6, 0], wing: [0, 70, -58], wingTip: [0, 48, -14] }));

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
