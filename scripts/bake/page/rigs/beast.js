// Rig do QUADRÚPEDE GRANDE (Etapa 6, docs/ART.md §1.8 e Apêndice G): felinos e cães míticos — Leão de Nemeia, Cérbero,
// mantícora, quimera — com o mesmo esqueleto e o kit pelo manifesto (`source.params`), sem código novo por criatura.
// Pivôs (poses em art/poses/beast.json; mesma convenção do cavalo — perna pendendo em −y, x positivo leva a pata para a
// FRENTE (−z); a "junta de baixo" da dianteira dobra com x negativo (pata para trás), o jarrete traseiro com x positivo):
//   root   { pos: [m] a partir do corpo na altura BODY_Y do porte, rot: [graus] }
//   body   metade da frente (peito, espáduas, pescoço, patas dianteiras)   hips  metade de trás (ancas, patas traseiras,
//          cauda) — as duas giram em torno do meio do dorso: a coluna flexiona no galope e no bote
//   neck · head · jaw (boca: x positivo abre)      tail0–tail3  cauda em 4 segmentos (x = sobe/desce, y = para os lados)
//   fl/flk · fr/frk · bl/blk · br/brk  patas com duas juntas                       wing · wingTip  asas (rigs/wings.js)
// Kit (KIT):
//   build   'lion' (felino grande: peito fundo, cintura fina) · 'hound' (cão: mais alto de pernas, peito estreito,
//           focinho longo) · 'heavy' (mais encorpado)                     size  escala do corpo inteiro (0,8–1,6)
//   coat    pelagem por cor de vértice (dorso escuro → barriga clara, manchas): 'nemean' (dourado com reflexo — a pele
//           impenetrável) · 'lion' · 'black' (Cérbero) · 'tawny' (mantícora, ruivo) · 'grey'
//   mane    'none' · 'lion' (juba cheia no pescoço, na cabeça e no peito) · 'ruff' (colar de pelo mais curto)
//   heads   1 · 2 · 3 (os pescoços se abrem em leque; pose de neck/head/jaw vale para todas)
//   face    'lion' · 'hound' · 'human' (rosto de homem barbado emoldurado pela juba: mantícora)
//   tail    'tuft' (leão: tufo escuro na ponta) · 'hound' · 'serpent' (termina numa cabeça de serpente: quimera) ·
//           'scorpion' (segmentos de quitina curvados sobre o dorso e o ferrão: mantícora)
//   goat    true = cabeça de cabra com chifres saindo do meio do dorso (quimera)
//   wings   false · 'bat' (membrana: mantícora) · 'feather'
//   team    'cloth' (manta de time moldada ao dorso, borda com tachas de bronze e cilha) · 'collar' (coleira larga de time
//           com tachas em cada pescoço) · 'harness' (peitoral e cilha de time)
// Metros, frente em −z, patas em y = 0; o grupo externo converte para tiles. `feet` = as patas (o bake mede a passada
// pelo recuo delas), `thin` = nada (a barra de vida fica acima do corpo inteiro).

import { M2T, dirYaw } from '../camera.js';
import { poseAt } from './human.js';
import { buildWings } from './wings.js';
import { sculpt, shaggy, paint, mix, mottle, smooth, taperTube } from './organic.js';

export const JOINTS = ['root', 'body', 'hips', 'neck', 'head', 'jaw', 'tail0', 'tail1', 'tail2', 'tail3', 'fl', 'flk', 'fr', 'frk', 'bl', 'blk', 'br', 'brk', 'wing', 'wingTip'];
export const SCALARS = [];
export const KIT = {
  build: ['lion', 'hound', 'heavy'], coat: ['nemean', 'lion', 'black', 'tawny', 'grey'], mane: ['none', 'lion', 'ruff'],
  heads: [1, 2, 3], face: ['lion', 'hound', 'human'], tail: ['tuft', 'hound', 'serpent', 'scorpion'], goat: [false, true],
  wings: [false, 'bat', 'feather'], team: ['cloth', 'collar', 'harness'],
};
const DEG = Math.PI / 180;
/**
 * Pernas (m, antes do `size`): comprimento dos dois segmentos e da pata, e onde prendem no corpo. As MESMAS em todos os
 * portes (proporção de perna fixa): as poses de andar/galopar (IK em scripts/bake/gait.mjs) servem a todos.
 */
export const LEG = { up: 0.56, low: 0.5, paw: 0.055, frontZ: -0.5, backZ: 0.52, frontX: 0.17, backX: 0.16, attachY: -0.12 };
/** Altura do centro do corpo (m, antes do `size`): em pé, a perna fica a 86 % do comprimento (dobrada, como a de um
 *  felino): sobra alcance para a pata de apoio ficar no chão do começo ao fim da passada (IK em scripts/bake/gait.mjs). */
export const BODY_Y = -LEG.attachY + 0.86 * (LEG.up + LEG.low + 0.005) + LEG.paw;
/** Porte: comprimento do tronco (núcleo da cápsula), raio, pescoço e cabeça. */
const BUILDS = {
  lion: { len: 0.95, r: 0.36, neck: 0.44, head: 1, chest: 1.12, waist: 0.84 },
  hound: { len: 0.98, r: 0.31, neck: 0.52, head: 0.92, chest: 1.08, waist: 0.78 },
  heavy: { len: 1.0, r: 0.4, neck: 0.42, head: 1.05, chest: 1.12, waist: 0.9 },
};
/** Paletas de pelagem (sRGB): dorso, flanco, barriga, juba, ponta da juba, focinho, nariz/lábios, tufo. */
const COATS = {
  nemean: { back: 0x8c6a40, base: 0xbc9a62, belly: 0xd8c49a, mane: 0x5e3e22, maneTip: 0xa27c4a, muzzle: 0xe4d6b6, nose: 0x3a2821, tuft: 0x3a2515 },
  lion: { back: 0x9c7648, base: 0xbf9a64, belly: 0xdcc6a0, mane: 0x6a4a2a, maneTip: 0x9a7448, muzzle: 0xe8dcc0, nose: 0x3e2c24, tuft: 0x3a2818 },
  black: { back: 0x1a1716, base: 0x2a2523, belly: 0x463d37, mane: 0x141211, maneTip: 0x2a2421, muzzle: 0x3c3430, nose: 0x0e0c0b, tuft: 0x121010 },
  tawny: { back: 0x6e371c, base: 0x9a532b, belly: 0xc78a58, mane: 0x3e1e10, maneTip: 0x6a3a1c, muzzle: 0xd9b28c, nose: 0x2e1a14, tuft: 0x2a140c },
  grey: { back: 0x55524d, base: 0x77726a, belly: 0xa39d92, mane: 0x3a3733, maneTip: 0x5e5a54, muzzle: 0xb3ab9e, nose: 0x1e1c1a, tuft: 0x2a2826 },
};

export function buildBeast(THREE, M, params = {}) {
  const P = { build: 'lion', size: 1, coat: 'lion', mane: 'none', heads: 1, face: 'lion', tail: 'tuft', goat: false, wings: false, team: 'cloth', ...params };
  const B = BUILDS[P.build] ?? BUILDS.lion, C = COATS[P.coat] ?? COATS.lion;
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const joint = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  /** Malha de pelagem: a cor por vértice é pintada no espaço do PAI (a posição/escala da malha aplicada), por `fn(x, y, z)`. */
  const fur = (geo, fn, x, y, z, parent, { rot = null, scale = null, mat = M.furV } = {}) => {
    const m = mesh(geo, mat, x, y, z, parent);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    m.updateMatrix();
    paint(THREE, geo, fn, m.matrix);
    return m;
  };
  const R = B.r, HL = B.len / 2;
  /** Contra-sombreamento do tronco: barriga clara embaixo, flanco, dorso escuro em cima (y relativo ao centro). */
  const bodyCol = (x, y, z) => {
    const t = (y + R) / (2 * R);
    const c = t < 0.45 ? mix(C.belly, C.base, smooth(0.12, 0.45, t)) : mix(C.base, C.back, smooth(0.55, 1.0, t));
    return mottle(c, 0.06, x, y, z, 5, 1);
  };

  const group = new THREE.Group();
  const rig = new THREE.Group(); rig.scale.setScalar(M2T); group.add(rig);
  const sized = new THREE.Group(); sized.scale.setScalar(P.size); rig.add(sized);
  const J = {};
  J.root = joint(sized, 0, BODY_Y, 0);
  J.body = joint(J.root, 0, 0, 0);                 // metade da frente
  J.hips = joint(J.root, 0, 0, 0.05);              // metade de trás (gira em torno do meio do dorso)

  // ---- tronco: duas cápsulas (frente e trás) esculpidas — peito fundo, cintura fina, garupa ----
  const trunk = (half) => {
    const g = new THREE.CapsuleGeometry(R, HL, 8, 22);
    g.rotateX(Math.PI / 2);   // ao longo de z
    return sculpt(g, (x, y, z) => {
      // u = 1 na ponta de fora da metade (peito na da frente, garupa na de trás) e 0 no meio do corpo (cintura)
      const u = half === 'front' ? smooth(HL * 0.6, -HL * 0.9, z) : smooth(-HL * 0.6, HL * 0.9, z);
      const deep = 1 + ((half === 'front' ? B.chest : B.chest * 0.92) - 1) * u;
      const tuck = B.waist + (1 - B.waist) * u;
      // a barriga sobe na cintura (y < 0 encolhe mais); o dorso fica quase reto
      const sy = y < 0 ? y * tuck * deep : y * (0.92 + 0.08 * u) * Math.min(1.08, deep);
      return [x * (0.9 + 0.1 * u) * Math.sqrt(tuck), sy, z];
    });
  };
  fur(trunk('front'), (x, y, z) => bodyCol(x, y, z), 0, 0, -HL / 2, J.body);
  fur(trunk('rear'), (x, y, z) => bodyCol(x, y, z), 0, 0, HL / 2 - 0.05, J.hips);
  // espáduas e ancas (massas musculares arredondadas nos flancos)
  for (const s of [-1, 1]) {
    fur(new THREE.SphereGeometry(R * 0.62, 14, 10), bodyCol, s * R * 0.42, 0.02, LEG.frontZ + 0.06, J.body, { scale: [0.85, 1.15, 1.25] });
    fur(new THREE.SphereGeometry(R * 0.66, 14, 10), bodyCol, s * R * 0.4, 0.04, LEG.backZ - 0.07, J.hips, { scale: [0.9, 1.15, 1.3] });
  }
  // peito (a quilha à frente das espáduas)
  fur(new THREE.SphereGeometry(R * 0.86, 16, 12), bodyCol, 0, -0.06, -HL - R * 0.35, J.body, { scale: [0.95, 1.08, 0.9] });

  // ---- peças de time ----
  const teamParts = [];
  if (P.team === 'cloth' || P.team === 'harness') {
    // manta de time moldada ao dorso (casca de cilindro sobre o meio do tronco) com a borda de tachas de bronze e a cilha
    const RR = R + 0.02, arc = P.team === 'cloth' ? 2.0 : 1.6, len = P.team === 'cloth' ? 0.5 : 0.36;
    const c = mesh(new THREE.CylinderGeometry(RR, RR * 0.97, len, 24, 1, true, Math.PI - arc / 2, arc), M.team, 0, 0.0, 0.02, J.body);
    c.rotation.x = Math.PI / 2;
    teamParts.push(c);
    for (const e of [-1, 1]) mesh(new THREE.TorusGeometry(RR + 0.006, 0.016, 5, 24, arc), M.bronzeDark, 0, 0, 0.02 + e * len / 2, J.body).rotation.z = Math.PI / 2 - arc / 2;
    if (P.team === 'harness') {
      // peitoral de time na frente do peito
      const pc = mesh(new THREE.TorusGeometry(R * 0.9, 0.045, 6, 22, Math.PI * 1.1), M.team, 0, -0.02, -HL - R * 0.55, J.body);
      pc.rotation.set(0, 0, Math.PI * 0.95);
      teamParts.push(pc);
    }
  }

  // ---- pescoço(s) e cabeça(s) ----
  const n = Math.max(1, Math.min(3, P.heads | 0));
  const yaws = n === 1 ? [0] : n === 2 ? [-0.3, 0.3] : [-0.46, 0, 0.46];
  J.neck = []; J.head = []; J.jaw = [];
  const neckBase = joint(J.body, 0, R * 0.42, -HL - 0.05);
  const headCol = (x, y, z) => mottle(mix(C.base, C.back, smooth(-0.05, 0.2, y)), 0.05, x, y, z, 7, 2);
  for (let k = 0; k < n; k++) {
    const fan = joint(neckBase, (k - (n - 1) / 2) * 0.16, 0, 0); fan.rotation.y = yaws[k];
    const nk = joint(fan, 0, 0, 0);
    J.neck.push(nk);
    // pescoço: tubo afilado para a frente e para cima (a pose gira `neck`)
    const NL = B.neck, nr0 = R * 0.72, nr1 = R * 0.5 * B.head;
    const ng = taperTube(THREE, [[0, 0, 0.08], [0, NL * 0.35, -NL * 0.45], [0, NL * 0.62, -NL * 0.95]], nr0, nr1, { tubular: 10, radial: 12 });
    fur(ng, (x, y, z) => bodyCol(x, y - 0.1, z), 0, 0, 0, nk);
    const hd = joint(nk, 0, NL * 0.62, -NL * 0.95);
    J.head.push(hd);
    const hs = B.head;
    // crânio (testa larga, bochechas) — o rosto fica à FRENTE da juba: a 50° a câmera vê a testa e o focinho
    fur(new THREE.SphereGeometry(0.19 * hs, 18, 14), headCol, 0, 0.05 * hs, 0, hd, { scale: [1.0, 0.86, 1.08] });
    if (P.face === 'human') {
      // rosto de homem (mantícora): testa, nariz, barba, olhos claros; a juba em volta
      mesh(new THREE.SphereGeometry(0.15 * hs, 14, 12), M.skin, 0, 0.02 * hs, -0.14 * hs, hd).scale.set(0.95, 1.12, 0.8);
      mesh(new THREE.BoxGeometry(0.04 * hs, 0.07 * hs, 0.05 * hs), M.skin, 0, 0.0, -0.265 * hs, hd);
      const beard = mesh(new THREE.ConeGeometry(0.11 * hs, 0.2 * hs, 10), M.furV, 0, -0.12 * hs, -0.18 * hs, hd); beard.rotation.x = Math.PI + 0.35;
      paint(THREE, beard.geometry, () => C.mane);
      for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.018 * hs, 6, 5), M.eye, s * 0.05 * hs, 0.05 * hs, -0.25 * hs, hd);
      J.jaw.push(joint(hd, 0, -0.06 * hs, -0.12 * hs));
    } else {
      const long = P.face === 'hound' ? 1.4 : 1, ext = 0.1 * (long - 1);
      const light = (x, y, z) => mottle(mix(mix(C.muzzle, C.base, 0.35), C.base, smooth(0.0, 0.1, y)), 0.04, x, y, z, 14, 3);
      // testa (arcada sobre os olhos) e a ponte do focinho, na cor da cabeça
      fur(new THREE.SphereGeometry(0.12 * hs, 14, 10), headCol, 0, 0.1 * hs, -0.12 * hs, hd, { scale: [1.2, 0.55, 0.75] });
      const br = new THREE.CylinderGeometry(0.065 * hs, 0.085 * hs, (0.2 + ext) * hs, 12); br.rotateX(Math.PI / 2 - 0.25);
      fur(br, headCol, 0, 0.035 * hs, -(0.22 + ext / 2) * hs, hd);
      // bochechas/almofadas dos bigodes, claras, e o lábio de cima
      for (const s of [-1, 1]) fur(new THREE.SphereGeometry(0.065 * hs, 12, 10), light, s * 0.05 * hs, -0.015 * hs, -(0.25 + ext) * hs, hd, { scale: [1, 0.8, 0.95] });
      // trufa escura
      const nose = fur(new THREE.SphereGeometry(0.045 * hs, 10, 8), () => C.nose, 0, 0.03 * hs, -(0.325 + ext) * hs, hd, { scale: [1.2, 0.7, 0.75] });
      void nose;
      // olhos âmbar sob a testa e as orelhas (redondas no leão, pontudas no cão)
      for (const s of [-1, 1]) {
        mesh(new THREE.SphereGeometry(0.022 * hs, 8, 6), M.eye, s * 0.07 * hs, 0.075 * hs, -0.18 * hs, hd);
        const ear = P.face === 'hound' ? new THREE.ConeGeometry(0.055 * hs, 0.15 * hs, 8) : new THREE.SphereGeometry(0.055 * hs, 10, 8);
        const e = fur(ear, headCol, s * 0.12 * hs, 0.16 * hs, 0.0, hd, { scale: P.face === 'hound' ? [1, 1, 0.5] : [1, 1.1, 0.45] });
        e.rotation.z = -s * 0.35;
      }
      // mandíbula (pivô `jaw`: abre com x positivo): queixo claro e as presas
      const jw = joint(hd, 0, -0.07 * hs, -0.02 * hs);
      J.jaw.push(jw);
      fur(new THREE.SphereGeometry(0.1 * hs, 12, 8), light, 0, -0.02 * hs, -(0.17 + ext / 2) * hs, jw, { scale: [0.85, 0.5, 1.5 * long] });
      // presas (aparecem com a boca aberta: ficam atrás do lábio de cima com ela fechada)
      for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(0.01 * hs, 0.045 * hs, 6), M.horn, s * 0.035 * hs, 0.012 * hs, -(0.26 + ext) * hs, jw);
    }
    // juba: o colar em volta do rosto (anel de pelo desgrenhado virado para a frente, o rosto no furo), a massa atrás da
    // cabeça e a crina ao longo do pescoço — escura, com as pontas mais claras perto do rosto; nunca na frente da cara
    if (P.mane === 'lion' || P.mane === 'ruff') {
      const big = P.mane === 'lion', q = big ? 1 : 0.75;
      const maneCol = (x, y, z) => mottle(mix(C.mane, C.maneTip, smooth(0.05, -0.35, z) * 0.8), 0.14, x, y, z, 11, 3);
      const ring = shaggy(new THREE.TorusGeometry(0.2 * hs, 0.12 * q * hs, 12, 26), 0.05 * q, 11, 1 + k);
      fur(ring, maneCol, 0, 0.02 * hs, 0.05 * hs, hd, { scale: [1.12, 1.18, 1.1] });
      const back = shaggy(new THREE.SphereGeometry(0.25 * q * hs, 18, 14), 0.06 * q, 10, 7 + k);
      fur(back, maneCol, 0, 0.06 * hs, 0.2 * hs, hd, { scale: [1.15, 1.1, 0.95] });
      const nm = shaggy(new THREE.SphereGeometry(0.25 * q, 18, 14), 0.06 * q, 9, 13 + k);
      fur(nm, maneCol, 0, NL * 0.36, -NL * 0.3, nk, { scale: [1.12, 1.22, 1.25] });
      if (big) {
        const bib = shaggy(new THREE.SphereGeometry(0.24, 16, 12), 0.06, 9, 11);
        fur(bib, maneCol, 0, -0.1, -HL - R * 0.6, J.body, { scale: [0.95, 1.3, 0.75] });
      }
    }
    if (P.team === 'collar') {
      // coleira larga de time com tachas de bronze, na base do pescoço
      const cl = mesh(new THREE.TorusGeometry(R * 0.72, 0.05, 8, 24), M.team, 0, NL * 0.12, -NL * 0.12, nk); cl.rotation.x = Math.PI / 2 - 0.6;
      teamParts.push(cl);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; cl.add(mesh(new THREE.SphereGeometry(0.022, 6, 5), M.bronze, Math.cos(a) * R * 0.76, Math.sin(a) * R * 0.76, 0, cl)); }
    }
  }

  // ---- cabeça de cabra no dorso (quimera) ----
  if (P.goat) {
    const gn = joint(J.body, 0, R * 0.7, 0.1); gn.rotation.x = 0.35;
    const gcol = () => 0x7a6a52;
    fur(taperTube(THREE, [[0, -0.1, 0], [0, 0.2, -0.05], [0, 0.42, -0.12]], 0.12, 0.08, { tubular: 8, radial: 10 }), gcol, 0, 0, 0, gn);
    const gh = joint(gn, 0, 0.44, -0.14);
    fur(new THREE.SphereGeometry(0.1, 12, 10), gcol, 0, 0, 0, gh, { scale: [0.85, 0.9, 1.3] });
    fur(new THREE.CylinderGeometry(0.045, 0.065, 0.16, 8).rotateX(Math.PI / 2), () => 0x8a7a62, 0, -0.03, -0.14, gh);
    for (const s of [-1, 1]) {
      const horn = taperTube(THREE, [[0, 0, 0], [s * 0.05, 0.12, 0.06], [s * 0.1, 0.16, 0.18], [s * 0.13, 0.08, 0.26]], 0.03, 0.008, { tubular: 10, radial: 7 });
      mesh(horn, M.hornDark, s * 0.05, 0.06, -0.02, gh);
    }
  }

  // ---- cauda (4 segmentos) ----
  J.tail0 = joint(J.hips, 0, R * 0.5, HL + R * 0.55);
  const seg = [0.3, 0.28, 0.26, 0.24].map((v) => v * (P.tail === 'scorpion' ? 1.05 : P.tail === 'hound' ? 0.8 : 1));
  const tailR = P.tail === 'scorpion' ? [0.075, 0.065, 0.055, 0.045] : P.tail === 'serpent' ? [0.07, 0.065, 0.06, 0.055] : [0.055, 0.045, 0.038, 0.032];
  let prev = J.tail0;
  for (let i = 0; i < 4; i++) {
    const tj = i === 0 ? J.tail0 : (J['tail' + i] = joint(prev, 0, 0, seg[i - 1]));
    if (P.tail === 'scorpion') {
      // segmento de quitina (bulbo), vermelho-escuro brilhante
      const b = mesh(new THREE.SphereGeometry(tailR[i], 10, 8), M.scaleV, 0, 0, seg[i] * 0.5, tj); b.scale.set(1, 0.9, (seg[i] * 0.62) / tailR[i]);
      paint(THREE, b.geometry, (x, y, z) => mottle(mix(0x4a1a12, 0x7a2c1a, smooth(-0.05, 0.05, y)), 0.1, x, y, z, 14, 4));
    } else {
      const tg = new THREE.CylinderGeometry(tailR[i] * 0.85, tailR[i], seg[i] + 0.02, 8); tg.rotateX(Math.PI / 2);
      const col = P.tail === 'serpent' && i >= 2 ? (x, y, z) => mottle(0x4e5a34, 0.12, x, y, z, 16, 5) : (x, y, z) => mottle(C.base, 0.06, x, y, z, 8, 5);
      fur(tg, col, 0, 0, seg[i] * 0.5, tj, { mat: P.tail === 'serpent' && i >= 2 ? M.scaleV : M.furV });
    }
    prev = tj;
  }
  const tipJ = joint(prev, 0, 0, seg[3]);
  if (P.tail === 'tuft') fur(shaggy(new THREE.SphereGeometry(0.075, 10, 8), 0.02, 16, 5), () => C.tuft, 0, 0, 0.03, tipJ, { scale: [1, 1, 1.6] });
  else if (P.tail === 'scorpion') {
    const sting = mesh(new THREE.SphereGeometry(0.06, 10, 8), M.scaleV, 0, 0, 0.04, tipJ); sting.scale.set(1, 1, 1.3);
    paint(THREE, sting.geometry, () => 0x5a2016);
    const barb = mesh(new THREE.ConeGeometry(0.025, 0.16, 8), M.hornDark, 0, -0.04, 0.1, tipJ); barb.rotation.x = Math.PI / 2 + 0.9;
  } else if (P.tail === 'serpent') {
    // a cabeça da serpente na ponta, olhando para trás
    const sh = mesh(new THREE.SphereGeometry(0.07, 12, 10), M.scaleV, 0, 0.01, 0.07, tipJ); sh.scale.set(0.9, 0.7, 1.5);
    paint(THREE, sh.geometry, (x, y, z) => mottle(0x3e4a2a, 0.12, x, y, z, 18, 6));
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.012, 6, 5), M.eye, s * 0.035, 0.03, 0.1, tipJ);
  }

  // ---- patas ----
  const feet = [], paws = [];
  const legCol = (x, y, z) => mottle(mix(C.base, C.belly, 0.45 * smooth(-0.1, -0.5, y)), 0.05, x, y, z, 8, 7);
  for (const [name, x, z, hind] of [['fl', -LEG.frontX, LEG.frontZ, false], ['fr', LEG.frontX, LEG.frontZ, false], ['bl', -LEG.backX, LEG.backZ, true], ['br', LEG.backX, LEG.backZ, true]]) {
    const top = J[name] = joint(hind ? J.hips : J.body, x, LEG.attachY, hind ? z - 0.05 : z);
    // segmento de cima: antebraço forte (dianteira) ou coxa larga (traseira), afilando
    const ug = new THREE.CylinderGeometry(hind ? 0.1 : 0.1, hind ? 0.18 : 0.14, LEG.up + 0.06, 12);
    fur(ug, (xx, yy, zz) => mottle(mix(C.base, C.back, 0.25 * smooth(-0.2, 0.05, yy)), 0.05, xx, yy, zz, 8, 6), 0, -LEG.up / 2 + 0.02, hind ? 0.02 : 0, top, { scale: [1, 1, hind ? 1.35 : 1.15] });
    const knee = J[name + 'k'] = joint(top, 0, -LEG.up, 0);
    fur(new THREE.SphereGeometry(hind ? 0.085 : 0.095, 10, 8), legCol, 0, 0, 0, knee);
    fur(new THREE.CylinderGeometry(hind ? 0.07 : 0.085, hind ? 0.08 : 0.095, LEG.low, 10), legCol, 0, -LEG.low / 2, 0, knee);
    // pata: almofada larga com os dedos na frente, num pivô que a mantém NIVELADA com o chão (applyBeastPose desfaz o giro
    // da perna): apoiada, ela fica parada e plana, sem afundar a ponta
    const pg = joint(knee, 0, -LEG.low - 0.005, 0);
    const paw = fur(new THREE.SphereGeometry(0.11, 12, 8), (xx, yy, zz) => mottle(mix(C.base, C.belly, 0.5), 0.04, xx, yy, zz, 9, 8), 0, 0, -0.04, pg, { scale: [0.95, 0.5, 1.3] });
    feet.push(paw);
    for (const tx of [-0.05, -0.017, 0.017, 0.05]) fur(new THREE.SphereGeometry(0.033, 8, 6), () => mix(C.base, C.belly, 0.55), tx, -0.015, -0.15, pg, { scale: [1, 0.8, 1.1] });
    paws.push({ g: pg, top, knee, half: hind ? J.hips : J.body });
  }

  // ---- asas (mantícora, opcional) ----
  const wings = P.wings ? buildWings(THREE, M, J.body, { style: P.wings, at: [R * 0.55, R * 0.72, -0.25], span: 1.8, membrane: M.leather }) : null;
  return { group, joints: J, feet, paws, wings, teamParts };
}

/** Aplica a pose do quadrúpede (mesmo formato do cavalo; pescoço/cabeça/mandíbula valem para todas as cabeças). */
export function applyBeastPose(rig, pose) {
  for (const name of JOINTS) {
    const g = rig.joints[name]; if (!g) continue;
    const v = pose[name];
    if (name === 'root') {
      const pos = v?.pos ?? [0, 0, 0], rot = v?.rot ?? [0, 0, 0];
      g.position.set(pos[0], BODY_Y + pos[1], pos[2]);
      g.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
      continue;
    }
    const r = Array.isArray(v) ? v : [0, 0, 0];
    for (const j of Array.isArray(g) ? g : [g]) j.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
  }
  // patas niveladas: desfazem o giro da perna, do joelho e da metade do corpo (e a arfagem da raiz)
  const rx = rig.joints.root.rotation.x;
  for (const p of rig.paws) p.g.rotation.x = -(p.top.rotation.x + p.knee.rotation.x + p.half.rotation.x + rx);
  rig.wings?.apply(pose);
}

/** Rig de unidade quadrúpede para o bake: `pose(fr, poses)` com `fr.pose` em poses.main (art/poses/beast.json). */
export function beastUnit(THREE, M, params) {
  const rig = buildBeast(THREE, M, params);
  return {
    group: rig.group, feet: rig.feet, thin: [],
    pose(fr, poses) {
      const def = poses.main?.anims?.[fr.pose];
      if (!def) throw new Error(`pose de quadrúpede ${fr.pose} ausente`);
      applyBeastPose(rig, poseAt(def, fr.frame, fr.frames, JOINTS, SCALARS));
      rig.group.rotation.y = dirYaw(fr.dir);
    },
  };
}
