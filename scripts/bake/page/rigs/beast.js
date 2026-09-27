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
//           com cravos de bronze em cada pescoço e a manta curta no lombo) · 'harness' (peitoral e cilha de time) ·
//           'croup' (manta de time na garupa, atrás da cabra da quimera, e a coleira no pescoço do leão)
// Lote feras (Etapa 6: Cérbero, quimera, mantícora; o leão não usa nada disto e sai byte a byte igual):
//   coat    'hellhound' (Cérbero: carvão com as marcas castanhas nos focinhos, no peito e nas patas — as três cabeças
//           se destacam do corpo escuro)
//   eyes    'amber' · 'fire' (brasa: emissivo vermelho-alaranjado)
//   mouth   'closed' · 'fangs' (boca de dentro vermelho-escura, presas em cima e embaixo: aparece ao abrir) · 'fire'
//           (a goela em brasa: a quimera que cospe fogo)
//   back    'none' · 'serpents' (serpentes pequenas erguidas ao longo do dorso: a crina do Cérbero)
//   com 3 cabeças os pescoços se abrem mais (cada cabeça separada a zoom 1); a cabra da quimera tem pescoço e chifres
//   longos anelados; a cauda de serpente termina numa cabeça de víbora de boca aberta; a de escorpião em quitina com o
//   ferrão e o feixe de espinhos (o projétil da mantícora); as asas de morcego com a membrana de couro dupla-face
// Metros, frente em −z, patas em y = 0; o grupo externo converte para tiles. `feet` = as patas (o bake mede a passada
// pelo recuo delas), `thin` = nada (a barra de vida fica acima do corpo inteiro).

import { M2T, dirYaw } from '../camera.js';
import { poseAt } from './human.js';
import { buildWings } from './wings.js';
import { sculpt, shaggy, paint, mix, mottle, smooth, taperTube } from './organic.js';

export const JOINTS = ['root', 'body', 'hips', 'neck', 'head', 'jaw', 'tail0', 'tail1', 'tail2', 'tail3', 'fl', 'flk', 'fr', 'frk', 'bl', 'blk', 'br', 'brk', 'wing', 'wingTip'];
export const SCALARS = [];
export const KIT = {
  build: ['lion', 'hound', 'heavy'], coat: ['nemean', 'lion', 'black', 'tawny', 'grey', 'hellhound', 'chimera'], mane: ['none', 'lion', 'ruff'],
  heads: [1, 2, 3], face: ['lion', 'hound', 'human'], tail: ['tuft', 'hound', 'serpent', 'scorpion'], goat: [false, true],
  wings: [false, 'bat', 'feather'], team: ['cloth', 'collar', 'harness', 'croup'],
  eyes: ['amber', 'fire'], mouth: ['closed', 'fangs', 'fire'], back: ['none', 'serpents'],
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
  tawny: { back: 0x7e3c1c, base: 0xb05e2c, belly: 0xd49a64, mane: 0x4a2412, maneTip: 0x7c4220, muzzle: 0xd9b28c, nose: 0x2e1a14, tuft: 0x2a140c },
  grey: { back: 0x55524d, base: 0x77726a, belly: 0xa39d92, mane: 0x3a3733, maneTip: 0x5e5a54, muzzle: 0xb3ab9e, nose: 0x1e1c1a, tuft: 0x2a2826 },
  // Cérbero: carvão com reflexo castanho, as marcas castanhas (`points`) no focinho, no peito e nas patas
  // quimera: fulvo mais escuro e quente que o leão comum, juba quase negra (a fera, não o rei)
  chimera: { back: 0x6e4a2a, base: 0x9a7244, belly: 0xbf9e70, mane: 0x32200f, maneTip: 0x6a4624, muzzle: 0xcdb48c, nose: 0x2e1e16, tuft: 0x2a1a0e },
  hellhound: { back: 0x2a2420, base: 0x443a34, belly: 0x5a4a40, mane: 0x1e1a18, maneTip: 0x3c322c, muzzle: 0x9a6a40, nose: 0x0c0a09, tuft: 0x1e1a18, points: 0x8e5e36 },
};

export function buildBeast(THREE, M, params = {}) {
  const P = { build: 'lion', size: 1, coat: 'lion', mane: 'none', heads: 1, face: 'lion', tail: 'tuft', goat: false, wings: false, team: 'cloth', eyes: 'amber', mouth: 'closed', back: 'none', ...params };
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
  const bodyCol0 = (x, y, z) => {
    const t = (y + R) / (2 * R);
    const c = t < 0.45 ? mix(C.belly, C.base, smooth(0.12, 0.45, t)) : mix(C.base, C.back, smooth(0.55, 1.0, t));
    return mottle(c, 0.06, x, y, z, 5, 1);
  };
  // pelagem com marcas (Cérbero): a mancha castanha no peito, na frente e embaixo (z < −HL, y < 0)
  const bodyCol = C.points
    ? (x, y, z) => { const c = bodyCol0(x, y, z); const k = smooth(-HL * 0.7, -HL - R * 0.6, z) * smooth(0.1, -0.2, y); return k > 0 ? mix(c, mottle(C.points, 0.08, x, y, z, 9, 4), k * 0.85) : c; }
    : bodyCol0;
  /** Materiais do lote feras derivados dos do contrato (clones LOCAIS: materials.js fica intocado — o hash e a ordem dos
   *  materiais dos outros assets não mudam): brasa emissiva (olhos, goela) e o céu da boca vermelho-escuro. */
  const glowMat = (hex, k) => { const m = M.eye.clone(); m.color.setHex(hex); m.emissive.setHex(hex); m.emissiveIntensity = k; return m; };
  const eyeMat = P.eyes === 'fire' ? glowMat(0xff5a1e, 1.3) : M.eye, eyeR = P.eyes === 'fire' ? 0.028 : 0.022;
  const mawMat = P.mouth === 'fire' ? glowMat(0xffa03c, 2.4) : P.mouth === 'fangs' ? (() => { const m = M.skin.clone(); m.color.setHex(0x5e1c18); m.roughness = 0.55; return m; })() : null;

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

  if (P.team === 'croup') {
    // manta de time na GARUPA (o meio do dorso é da cabra da quimera), mais larga que o tronco para cobrir as ancas, com
    // a borda de bronze; a coleira de time vai no pescoço do leão (abaixo)
    const RR = R * 1.16, arc = 2.2, len = 0.42, zc = HL * 0.5;
    const c = mesh(new THREE.CylinderGeometry(RR * 0.97, RR, len, 26, 1, true, Math.PI - arc / 2, arc), M.team, 0, -0.02, zc, J.hips);
    c.rotation.x = Math.PI / 2;
    teamParts.push(c);
    for (const e of [-1, 1]) mesh(new THREE.TorusGeometry(RR + 0.006, 0.017, 5, 26, arc), M.bronzeDark, 0, -0.02, zc + e * len / 2, J.hips).rotation.z = Math.PI / 2 - arc / 2;
  }

  // ---- pescoço(s) e cabeça(s) ----
  const n = Math.max(1, Math.min(3, P.heads | 0));
  // três cabeças (Cérbero): o leque abre mais, os pescoços de fora tombam para os lados e a do meio fica mais alta — cada
  // cabeça separada das outras a zoom 1 (com 0,46 rad as três viravam um vulto só)
  // (rotation.y positivo leva a frente, −z, para −x: o pescoço da esquerda, x < 0, gira com y POSITIVO para abrir; com o
  // sinal trocado os pescoços de fora se cruzavam na frente do peito e as três cabeças viravam uma)
  const yaws = n === 1 ? [0] : n === 2 ? [0.3, -0.3] : [0.62, 0, -0.62];
  const fanDx = n === 3 ? 0.22 : 0.16;
  J.neck = []; J.head = []; J.jaw = [];
  const flames = [];
  const neckBase = joint(J.body, 0, R * 0.42, -HL - 0.05);
  const headCol0 = (x, y, z) => mottle(mix(C.base, C.back, smooth(-0.05, 0.2, y)), 0.05, x, y, z, 7, 2);
  // marcas castanhas do Cérbero: o focinho e as sobrancelhas (a parte de baixo e da frente da cabeça)
  const headCol = C.points ? (x, y, z) => mix(headCol0(x, y, z), mottle(C.points, 0.08, x, y, z, 11, 6), 0.7 * smooth(0.02, -0.06, y) * smooth(-0.08, -0.2, z)) : headCol0;
  for (let k = 0; k < n; k++) {
    const fan = joint(neckBase, (k - (n - 1) / 2) * fanDx, n === 3 && k === 1 ? 0.1 : 0, n === 3 && k === 1 ? -0.06 : 0); fan.rotation.y = yaws[k];
    if (n === 3 && k !== 1) { fan.rotation.z = (k - 1) * -0.42; fan.rotation.x = -0.1; }
    const nk = joint(fan, 0, 0, 0);
    J.neck.push(nk);
    // pescoço: tubo afilado para a frente e para cima (a pose gira `neck`)
    const NL = B.neck * (n === 3 ? 1.12 : 1), nr0 = R * (n === 3 ? 0.6 : 0.72), nr1 = R * 0.5 * B.head * (n === 3 ? 0.9 : 1);
    const ng = taperTube(THREE, [[0, 0, 0.08], [0, NL * 0.35, -NL * 0.45], [0, NL * 0.62, -NL * 0.95]], nr0, nr1, { tubular: 10, radial: 12 });
    fur(ng, (x, y, z) => bodyCol(x, y - 0.1, z), 0, 0, 0, nk);
    const hd = joint(nk, 0, NL * 0.62, -NL * 0.95);
    J.head.push(hd);
    const hs = B.head * (n === 3 ? 0.92 : 1);
    // crânio (testa larga, bochechas) — o rosto fica à FRENTE da juba: a 50° a câmera vê a testa e o focinho
    fur(new THREE.SphereGeometry(0.19 * hs, 18, 14), headCol, 0, 0.05 * hs, 0, hd, { scale: [1.0, 0.86, 1.08] });
    if (P.face === 'human') {
      // rosto de homem (mantícora): testa, nariz, barba, olhos claros; a juba em volta
      mesh(new THREE.SphereGeometry(0.15 * hs, 14, 12), M.skin, 0, 0.02 * hs, -0.14 * hs, hd).scale.set(0.95, 1.12, 0.8);
      mesh(new THREE.BoxGeometry(0.04 * hs, 0.07 * hs, 0.05 * hs), M.skin, 0, 0.0, -0.265 * hs, hd);
      const beard = mesh(new THREE.ConeGeometry(0.11 * hs, 0.2 * hs, 10), M.furV, 0, -0.12 * hs, -0.18 * hs, hd); beard.rotation.x = Math.PI + 0.35;
      paint(THREE, beard.geometry, () => C.mane);
      for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.018 * hs, 6, 5), P.eyes === 'fire' ? eyeMat : M.eye, s * 0.05 * hs, 0.05 * hs, -0.25 * hs, hd);
      const hj = joint(hd, 0, -0.06 * hs, -0.12 * hs);
      J.jaw.push(hj);
      if (mawMat) {
        // a boca aberta da mantícora: o fundo escuro e as fileiras de dentes (em cima no rosto, embaixo na mandíbula)
        mesh(new THREE.SphereGeometry(0.045 * hs, 10, 8), mawMat, 0, 0.005 * hs, -0.11 * hs, hj).scale.set(1, 0.5, 0.6);
        mesh(new THREE.BoxGeometry(0.085 * hs, 0.02 * hs, 0.03 * hs), M.horn, 0, -0.03 * hs, -0.24 * hs, hd);
        mesh(new THREE.BoxGeometry(0.075 * hs, 0.018 * hs, 0.03 * hs), M.horn, 0, 0.022 * hs, -0.125 * hs, hj);
      }
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
        mesh(new THREE.SphereGeometry(eyeR * hs, 8, 6), eyeMat, s * 0.07 * hs, 0.075 * hs, -0.18 * hs, hd);
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
      if (mawMat) {
        // a boca por dentro (vermelho-escura, ou em brasa na quimera): o céu da boca sob o focinho e a língua na mandíbula —
        // escondidos com a boca fechada, à mostra no bote/sopro; presas de cima descendo do lábio e as de baixo subindo
        // (o céu da boca abaixo das bochechas e a língua acima do queixo: fechada, a mandíbula os cobre; aberta, aparecem)
        mesh(new THREE.SphereGeometry(0.07 * hs, 10, 8), mawMat, 0, -0.07 * hs, -(0.2 + ext * 0.8) * hs, hd).scale.set(0.8, 0.42, 1.35 * long);
        mesh(new THREE.SphereGeometry(0.07 * hs, 10, 8), mawMat, 0, 0.04 * hs, -(0.15 + ext / 2) * hs, jw).scale.set(0.7, 0.34, 1.25 * long);
        // o fundo da goela entre as mandíbulas (a brasa da quimera, o vermelho do Cérbero)
        mesh(new THREE.SphereGeometry(0.05 * hs, 10, 8), mawMat, 0, -0.08 * hs, -0.13 * hs, hd).scale.set(1, 0.7, 1.2);
        if (P.mouth === 'fire') {
          // a LÍNGUA DE FOGO do sopro: dois cones emissivos (laranja por fora, amarelo por dentro) saindo da goela para a
          // frente, que só aparecem com a boca bem aberta (applyBeastPose: `jaw` ≥ ~30°) — vista de cima a 50° a boca
          // aberta fica sob o focinho, e a chama é o que diz "sopro" a zoom 1; o jato de partículas da Etapa 5
          // (fx/handlers/splash.ts) continua dela até o alvo
          const fl = joint(hd, 0, -0.07 * hs, -(0.3 + ext) * hs);
          // (a superfície das chamas desgrenhada por ruído: línguas, não um cone liso; cores saturadas — o ACES clareia)
          for (const [hex, r, h, k, sd] of [[0xff4a10, 0.11, 0.5, 1.5, 3], [0xff9a26, 0.065, 0.4, 1.8, 5], [0xffd060, 0.03, 0.26, 2.0, 7]]) {
            const c = mesh(shaggy(new THREE.ConeGeometry(r * hs, h * hs, 14, 4), r * 0.35 * hs, 22, sd), glowMat(hex, k), 0, 0, -h * 0.5 * hs, fl);
            c.rotation.x = Math.PI / 2;   // a ponta na goela, a base larga à frente
            c.castShadow = false;
          }
          fl.visible = false;
          flames.push(fl);
        }
        for (const s of [-1, 1]) {
          const up = mesh(new THREE.ConeGeometry(0.014 * hs, 0.065 * hs, 6), M.horn, s * 0.042 * hs, -0.05 * hs, -(0.285 + ext) * hs, hd); up.rotation.x = Math.PI;
          mesh(new THREE.ConeGeometry(0.012 * hs, 0.05 * hs, 6), M.horn, s * 0.04 * hs, 0.03 * hs, -(0.25 + ext) * hs, jw);
        }
      }
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
    if (P.team === 'collar' || P.team === 'croup') {
      // coleira larga de time com cravos de bronze, na base de cada pescoço (Cérbero: uma por cabeça)
      const cr = nr0 * 1.02, cl = mesh(new THREE.TorusGeometry(cr, 0.045, 8, 26), M.team, 0, NL * 0.14, -NL * 0.16, nk); cl.rotation.x = Math.PI / 2 - 0.6;
      cl.scale.set(1, 1, 1.5);
      teamParts.push(cl);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, sp = mesh(new THREE.ConeGeometry(0.018, 0.075, 6), M.bronze, Math.cos(a) * (cr + 0.05), Math.sin(a) * (cr + 0.05), 0, cl);
        sp.rotation.z = a - Math.PI / 2;   // o cravo aponta para fora
      }
    }
  }

  // ---- cabeça de cabra no dorso (quimera) ----
  if (P.goat) {
    // a cabra da Quimera: pescoço peludo saindo do meio do dorso, erguido e um pouco para a frente, cabeça de bode de
    // focinho estreito e claro, orelhas caídas, barbicha e os chifres longos anelados curvados para trás (como os do
    // íbex) — a 1× o segundo "pico" da silhueta, entre a juba e a cauda de serpente
    const gn = joint(J.body, 0, R * 0.72, 0.02); gn.rotation.x = 0.18;
    const goatCol = (x, y, z) => mottle(mix(0x4e4438, 0x857661, smooth(-0.15, 0.45, y)), 0.13, x, y, z, 13, 9);
    const gneck = shaggy(taperTube(THREE, [[0, -0.2, 0.05], [0, 0.12, 0.0], [0, 0.4, -0.08], [0, 0.58, -0.2]], 0.17, 0.085, { tubular: 12, radial: 12 }), 0.024, 16, 3);
    fur(gneck, goatCol, 0, 0, 0, gn);
    const gh = joint(gn, 0, 0.6, -0.22); gh.rotation.x = -0.3;
    fur(new THREE.SphereGeometry(0.1, 14, 10), goatCol, 0, 0.02, 0, gh, { scale: [0.84, 0.92, 1.25] });
    const muz = new THREE.CylinderGeometry(0.038, 0.06, 0.2, 10); muz.rotateX(Math.PI / 2 - 0.25);
    fur(muz, (x, y, z) => mottle(0xa29379, 0.08, x, y, z, 15, 2), 0, -0.025, -0.15, gh);
    fur(new THREE.SphereGeometry(0.032, 8, 6), () => 0x2a2420, 0, -0.05, -0.245, gh, { scale: [1.15, 0.75, 0.8] });
    const gb = mesh(new THREE.ConeGeometry(0.035, 0.15, 8), M.furV, 0, -0.115, -0.13, gh); gb.rotation.x = Math.PI + 0.35;
    paint(THREE, gb.geometry, () => 0x3a3128);
    for (const s of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.017, 8, 6), M.eye, s * 0.066, 0.045, -0.075, gh);
      const ear = fur(new THREE.ConeGeometry(0.035, 0.13, 8), goatCol, s * 0.1, 0.02, 0.02, gh, { scale: [1, 1, 0.45] });
      ear.rotation.z = s * 1.95;
      // chifre anelado: tubo afilado para cima e para trás, com os anéis escuros pela distância da base
      const hg = taperTube(THREE, [[0, 0, 0], [s * 0.03, 0.14, 0.05], [s * 0.07, 0.23, 0.18], [s * 0.1, 0.21, 0.33], [s * 0.12, 0.11, 0.43]], 0.042, 0.009, { tubular: 18, radial: 8 });
      fur(hg, (x, y, z) => { const d = Math.sqrt((x - s * 0.04) ** 2 + (y - 0.09) ** 2 + (z + 0.03) ** 2); return mix(0x3e352c, 0x7c6e5a, 0.5 + 0.5 * Math.sin(d * 70)); }, s * 0.04, 0.09, -0.03, gh, { mat: M.hideV });
    }
  }

  // ---- serpentes no dorso (Cérbero) ----
  if (P.back === 'serpents') {
    // serpentes pequenas erguidas ao longo do dorso, da cernelha ao lombo, inclinadas para os dois lados e olhando para a
    // frente: a 1× uma crista eriçada que nenhum cão tem
    const snake = (x, y, z) => mottle(mix(0x2a3222, 0x5e6e44, smooth(-0.02, 0.2, y)), 0.18, x, y, z, 30, 7);
    for (let i = 0; i < 7; i++) {
      const u = i / 6, rear = u > 0.55, half = rear ? J.hips : J.body;
      const z = -HL * 0.75 + u * HL * 1.45 - (rear ? 0.05 : 0), side = i % 2 ? 1 : -1, h = 0.19 + 0.07 * Math.sin(i * 1.7 + 0.5), l = 0.07 * side;
      const tg = taperTube(THREE, [[0, 0, 0], [l * 0.6, h * 0.5, 0.04], [l * 1.4, h * 0.88, -0.02], [l * 1.7, h, -0.1]], 0.04, 0.02, { tubular: 9, radial: 7 });
      fur(tg, snake, 0, R * 0.86, z, half, { mat: M.scaleV });
      fur(new THREE.SphereGeometry(0.036, 8, 6), snake, l * 1.75, R * 0.86 + h - 0.005, z - 0.13, half, { mat: M.scaleV, scale: [0.85, 0.6, 1.5] });
    }
  }

  // ---- cauda (4 segmentos) ----
  J.tail0 = joint(J.hips, 0, R * 0.5, HL + R * 0.55);
  // (escorpião e serpente mais longos e grossos que no exemplo da base: a cauda arqueada sobre o dorso é a silhueta da
  // mantícora e a terceira cabeça da quimera)
  const seg = [0.3, 0.28, 0.26, 0.24].map((v) => v * (P.tail === 'scorpion' ? 1.45 : P.tail === 'hound' ? 0.8 : P.tail === 'serpent' ? 1.35 : 1));
  const tailR = P.tail === 'scorpion' ? [0.105, 0.096, 0.088, 0.08] : P.tail === 'serpent' ? [0.095, 0.085, 0.075, 0.065] : [0.055, 0.045, 0.038, 0.032];
  /** Escamas da cauda de serpente: dorso oliva-escuro com faixas em losango, flanco, ventre creme. */
  const snakeCol = (x, y, z) => { const t = smooth(-0.06, 0.06, y); let c = mix(0x8e865e, 0x4a5a30, t); c = mix(c, 0x222a18, 0.55 * t * smooth(0.3, 0.8, Math.abs(Math.sin(z * 26 + x * 30)))); return mottle(c, 0.1, x, y, z, 22, 5); };
  const chitin = (x, y, z) => mottle(mix(0x4a2410, 0xb07a32, smooth(-0.08, 0.07, y)), 0.1, x, y, z, 14, 4);
  let prev = J.tail0;
  for (let i = 0; i < 4; i++) {
    const tj = i === 0 ? J.tail0 : (J['tail' + i] = joint(prev, 0, 0, seg[i - 1]));
    if (P.tail === 'scorpion') {
      // segmento de quitina (bulbo alongado), vermelho-escuro brilhante, com o anel escuro da junta
      const b = mesh(new THREE.SphereGeometry(tailR[i], 12, 10), M.scaleV, 0, 0, seg[i] * 0.5, tj); b.scale.set(1, 0.92, (seg[i] * 0.6) / tailR[i]);
      paint(THREE, b.geometry, chitin);
      mesh(new THREE.TorusGeometry(tailR[i] * 0.78, 0.014, 5, 14), M.hornDark, 0, 0, seg[i] * 0.98, tj);
    } else if (P.tail === 'serpent') {
      // corpo de serpente saindo da garupa (o primeiro segmento ainda com pelo na raiz)
      const tg = new THREE.CylinderGeometry(tailR[i] * 0.88, tailR[i], seg[i] + 0.03, 12); tg.rotateX(Math.PI / 2);
      fur(tg, i === 0 ? (x, y, z) => mix(bodyCol(x, y, z), snakeCol(x, y, z), smooth(-0.1, 0.2, z)) : snakeCol, 0, 0, seg[i] * 0.5, tj, { mat: i === 0 ? M.furV : M.scaleV });
      if (i < 3) fur(new THREE.SphereGeometry(tailR[i] * 0.9, 10, 8), snakeCol, 0, 0, seg[i], tj, { mat: M.scaleV });
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
    // telson: o bulbo de veneno, o ferrão curvo e o FEIXE DE ESPINHOS que a mantícora dispara (o projétil `spike` do
    // atlas fx), claros sobre a quitina escura
    const sting = mesh(new THREE.SphereGeometry(0.11, 12, 10), M.scaleV, 0, 0, 0.09, tipJ); sting.scale.set(1, 0.95, 1.35);
    paint(THREE, sting.geometry, chitin);
    const barb = taperTube(THREE, [[0, 0, 0], [0, -0.02, 0.09], [0, -0.09, 0.15], [0, -0.17, 0.14]], 0.03, 0.004, { tubular: 10, radial: 7 });
    mesh(barb, M.hornDark, 0, -0.01, 0.2, tipJ);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, q = mesh(new THREE.ConeGeometry(0.012, 0.2, 5), M.horn, Math.cos(a) * 0.08, Math.sin(a) * 0.08 + 0.03, 0.08, tipJ);
      q.rotation.set(Math.sin(a) * -0.9 - 0.25, 0, Math.cos(a) * -0.9);   // espinhos eriçados para fora e para cima
    }
  } else if (P.tail === 'serpent') {
    // a cabeça de víbora na ponta, de boca aberta (presas e o fundo escuro), olhos amarelos: a terceira cabeça
    const hc = (x, y, z) => mottle(0x3a4626, 0.14, x, y, z, 24, 6);
    fur(new THREE.SphereGeometry(0.085, 14, 10), hc, 0, 0.012, 0.09, tipJ, { mat: M.scaleV, scale: [1.05, 0.62, 1.55] });
    const lj = joint(tipJ, 0, -0.02, 0.04); lj.rotation.x = 0.55;
    fur(new THREE.SphereGeometry(0.07, 12, 8), (x, y, z) => mottle(0x7a7450, 0.1, x, y, z, 24, 3), 0, -0.008, 0.08, lj, { mat: M.scaleV, scale: [0.95, 0.35, 1.5] });
    mesh(new THREE.SphereGeometry(0.06, 10, 8), mawMat ?? M.hornDark, 0, 0.0, 0.1, tipJ).scale.set(0.8, 0.3, 1.2);
    for (const s of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.014, 6, 5), M.eye, s * 0.05, 0.04, 0.12, tipJ);
      const f = mesh(new THREE.ConeGeometry(0.009, 0.05, 6), M.horn, s * 0.035, -0.02, 0.19, tipJ); f.rotation.x = Math.PI;
    }
  }

  // ---- patas ----
  const feet = [], paws = [];
  const legCol0 = (x, y, z) => mottle(mix(C.base, C.belly, 0.45 * smooth(-0.1, -0.5, y)), 0.05, x, y, z, 8, 7);
  // (Cérbero: as canelas castanhas, como as marcas do focinho e do peito)
  const legCol = C.points ? (x, y, z) => mix(legCol0(x, y, z), mottle(C.points, 0.06, x, y, z, 9, 7), 0.8 * smooth(-0.22, -0.4, y)) : legCol0;
  const pawCol = C.points ? mix(C.points, C.belly, 0.3) : mix(C.base, C.belly, 0.5), toeCol = C.points ? mix(C.points, C.belly, 0.4) : mix(C.base, C.belly, 0.55);
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
    const paw = fur(new THREE.SphereGeometry(0.11, 12, 8), (xx, yy, zz) => mottle(pawCol, 0.04, xx, yy, zz, 9, 8), 0, 0, -0.04, pg, { scale: [0.95, 0.5, 1.3] });
    feet.push(paw);
    for (const tx of [-0.05, -0.017, 0.017, 0.05]) fur(new THREE.SphereGeometry(0.033, 8, 6), () => toeCol, tx, -0.015, -0.15, pg, { scale: [1, 0.8, 1.1] });
    paws.push({ g: pg, top, knee, half: hind ? J.hips : J.body });
  }

  // ---- asas (mantícora, opcional) ----
  // (a membrana do morcego é dupla-face — com a face única a membrana virada para baixo sumia e só os dedos apareciam — e
  // num couro vermelho-escuro, entre a quitina da cauda e a pelagem)
  const membrane = P.wings === 'bat' ? (() => { const m = M.leather.clone(); m.side = THREE.DoubleSide; m.color.setHex(0x4a261c); m.roughness = 0.72; return m; })() : M.leather;
  const wings = P.wings ? buildWings(THREE, M, J.body, { style: P.wings, at: [R * 0.55, R * 0.72, -0.25], span: 1.8, membrane }) : null;
  return { group, joints: J, feet, paws, wings, teamParts, flames };
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
  // a língua de fogo da quimera cresce com a boca aberta (só no sopro: o parado e o andar abrem ≤ 12°)
  if (rig.flames?.length) {
    const k = smooth(28, 42, pose.jaw?.[0] ?? 0);
    for (const f of rig.flames) { f.visible = k > 0.01; f.scale.setScalar(Math.max(0.01, k)); }
  }
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
