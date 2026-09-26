// Rig humano paramétrico (docs/ART.md §1.8, §1.11): esqueleto simples com pivôs — raiz (quadril), tronco, cabeça,
// ombros/cotovelos, quadris/joelhos — e KIT de equipamento escolhido pelo manifesto (`source.params`), sem código novo
// por unidade (Etapa 4):
//   armor   'tunic' | 'none' (túnica) · 'linothorax' (couraça de linho com faixa de bronze) · 'cuirass' (couraça de bronze)
//   helmet  'none' · 'corinthian' · 'chalcidian' · 'phrygian' · 'pilos'   (+ helmetMat 'bronze' | 'felt' | 'team': gorro)
//   metal   'bronze' (polido) · 'dark' (bronze escurecido: elmo, couraça, grevas e escudo; detalhes de ferro)
//   crest   'long' (frente-trás) · 'transverse' (de lado a lado) · 'tall' · 'none'   (+ crestColor 'red' | 'dark' | 'team')
//   shield  'none' · 'hoplon' (bronze; shieldTeam 'center' = centro de time, 'full' = face inteira, 'rim' = faixa na borda)
//           · 'pelte' (crescente de vime, face de time)
//   weapon  'none' · 'spear' (lança 2,4 m) · 'dory' (lança curta 1,7 m) · 'sword' (kopis) · 'club' (clava) · 'bow' (arco + aljava)
//           · 'javelin' (dardo na direita + feixe na esquerda) · 'axe'
//   cape    'none' · 'short' · 'long' (cor de time)          greaves (grevas de bronze) · quiver (aljava; padrão com o arco)
//   hair · headband (fita de time) · tunicTeam true | 'upper' · tool 'axe' · carry 'basket' (cidadão)
// Heróis e rei (Etapa 4, lote heróis): helmet 'crown' (coroa radiada de ouro sobre o cabelo) · 'lion' (pele do leão de
//   Nemeia: capuz com a cabeça, o couro nas costas e as patas no peito) · 'petasos' (chapéu de aba larga com asas);
//   metal 'gold' (bronze dourado); armor 'bare' (peito nu com a saia curta); shield 'mirror' (bronze polido como espelho,
//   borda de time) e shieldTeam 'ornate' (hoplon com anel de time, faixas e umbo de ouro); weapon 'harpe' (espada com o
//   gancho de foice) · 'greatclub' (clava de 1,15 m); offhand 'scepter' (cetro de ouro na mão esquerda) · 'fleece' (velo de
//   ouro dobrado no antebraço esquerdo); stature 'tall' (×1,05) · 'huge' (×1,1)
// Modelado em METROS com os pés em y = 0 e a frente em −z; o grupo externo converte para tiles (`meters: true` deixa em
// metros, para o cavaleiro montado no rig do cavalo). As poses vêm de `art/poses/human.json` (graus por pivô e por
// quadro-chave) e são interpoladas em `poseAt`; além dos pivôs, uma pose pode ter escalares: `draw` (0–1, puxada da
// corda do arco: a corda e a flecha seguem a mão direita) e `hold` (0–1; < 0,5 esconde a arma da mão direita — o dardo
// que acabou de sair no arremesso).
// Convenções de rotação (three.js): num membro que pende em −y, rotação x positiva = balança para a FRENTE (−z);
// rotação z positiva = leva para +x (o lado direito do modelo). Joelhos dobram com x negativo. Itens de mão (lança,
// dory, espada, clava, dardo, machado) saem do punho ao longo do +y local do antebraço (com o braço pendendo, x = −90
// aponta a arma para a frente); o arco tem as pontas em ±z local e a barriga em −y (braço esticado à frente = arco em pé).

import { M2T, dirYaw } from '../camera.js';

/** Pivôs que uma pose pode mover. Itens de mão também são pivôs: `spear`/`weapon` (a mesma arma da mão direita — o
 *  hoplita usa `spear`), `axe` (ferramenta), `shield`, `basket`, `bow` (mão esquerda), `bundle` (feixe de dardos) e
 *  `offhand` (cetro ou velo na mão esquerda). */
export const JOINTS = ['root', 'torso', 'head', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR', 'spear', 'weapon', 'axe', 'shield', 'basket', 'bow', 'bundle', 'offhand'];
/** Escalares de pose (interpolados como os ângulos). */
export const SCALARS = ['draw', 'hold'];
/** Valores do kit aceitos pelo manifesto (validados em scripts/bake/manifest.mjs). */
export const KIT = {
  armor: ['none', 'tunic', 'linothorax', 'cuirass', 'bare'],
  helmet: ['none', 'corinthian', 'chalcidian', 'phrygian', 'pilos', 'crown', 'lion', 'petasos'],
  helmetMat: ['bronze', 'felt', 'team'],
  metal: ['bronze', 'dark', 'gold'],
  crest: ['long', 'transverse', 'tall', 'none'],
  crestColor: ['red', 'dark', 'team'],
  shield: ['none', 'hoplon', 'pelte', 'mirror'],
  shieldTeam: ['center', 'full', 'rim', 'ornate'],
  weapon: ['none', 'spear', 'dory', 'sword', 'club', 'bow', 'javelin', 'axe', 'harpe', 'greatclub'],
  cape: ['none', 'short', 'long'],
  offhand: ['none', 'scepter', 'fleece'],
  stature: ['normal', 'tall', 'huge'],
};
/** Escala do corpo inteiro por `stature` (heróis um pouco maiores que a tropa; Héracles o maior). */
const STATURE = { normal: 1, tall: 1.05, huge: 1.1 };

/** Em que animações cada item aparece por padrão (o manifesto pode sobrescrever em `params.show`). */
const DEFAULT_SHOW = { basket: ['carry'], axe: ['gather', 'attack'], spear: ['*'], weapon: ['*'], shield: ['*'], bow: ['*'], bundle: ['*'], offhand: ['*'] };
/** Crina padrão de cada elmo (o coríntio e o calcídico com crina frente-trás; frígio e pílos sem). */
const DEFAULT_CREST = { corinthian: 'long', chalcidian: 'long', phrygian: 'none', pilos: 'none', none: 'none', crown: 'none', lion: 'none', petasos: 'none' };

const DEG = Math.PI / 180;

/** Constrói o rig. Devolve `{ group, joints, items, setAnim, post }`. `group` está em tiles (ou metros) e a origem é o pé. */
export function buildHuman(THREE, M, params = {}, { meters = false } = {}) {
  const P = { helmet: 'none', hair: true, armor: 'tunic', cape: 'none', shield: 'none', weapon: 'none', carry: 'none', greaves: false, tunicTeam: false, headband: false, ...params };
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const joint = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

  const group = new THREE.Group();
  const rig = new THREE.Group(); rig.scale.setScalar((meters ? 1 : M2T) * (STATURE[P.stature] ?? 1)); group.add(rig);
  const HIP_Y = 0.92, THIGH = 0.44, SHIN = 0.44, UPPER = 0.28, FORE = 0.27;
  const J = {};
  J.root = joint(rig, 0, HIP_Y, 0);
  J.torso = joint(J.root, 0, 0, 0);

  // metal da armadura (elmo, couraça, grevas, escudo): bronze polido ou 'dark' (bronze escurecido, com detalhes de ferro)
  // ('gold': bronze dourado, com os detalhes em bronze)
  const BZ = P.metal === 'dark' ? M.bronzeBlack : P.metal === 'gold' ? M.gold : M.bronze, BZ2 = P.metal === 'dark' ? M.iron : P.metal === 'gold' ? M.bronze : M.bronzeDark;

  // ---- pernas ----
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const hip = J['hip' + side] = joint(J.root, s * 0.12, 0, 0);
    mesh(new THREE.CapsuleGeometry(0.08, THIGH - 0.12, 4, 10), M.skin, 0, -THIGH / 2, 0, hip);
    const knee = J['knee' + side] = joint(hip, 0, -THIGH, 0);
    mesh(new THREE.CapsuleGeometry(0.07, SHIN - 0.12, 4, 10), M.skin, 0, -SHIN / 2 + 0.02, 0, knee);
    if (P.greaves) mesh(new THREE.CylinderGeometry(0.092, 0.082, 0.34, 12), BZ, 0, -SHIN / 2 + 0.03, 0, knee);
    mesh(new THREE.BoxGeometry(0.13, 0.05, 0.26), M.leather, 0, -SHIN + 0.025, -0.05, knee);                   // sandália
  }

  // ---- tronco ----
  // `tunicTeam`: true = túnica inteira na cor do time; 'upper' = só o peito (a saia fica de linho)
  const tunicMat = P.tunicTeam === true ? M.team : M.linen;
  const chestMat = P.tunicTeam ? M.team : M.linen;
  if (P.armor === 'cuirass') {
    mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.34, 14), M.linen, 0, -0.06, 0, J.torso);                    // saiote de linho (ptéruges)
    mesh(new THREE.CapsuleGeometry(0.21, 0.3, 6, 14), BZ, 0, 0.34, 0, J.torso);                         // couraça
    mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3), BZ2, 0, 0.53, 0, J.torso);                           // ombreiras
  } else if (P.armor === 'linothorax') {
    // couraça de linho colado: corpo quase cilíndrico branco, ombreiras de linho amarradas, faixa de escamas de bronze
    // na barriga e duas fileiras de ptéruges (linho mais escuro) — lê como "tronco claro" contra a couraça de bronze
    mesh(new THREE.CylinderGeometry(0.23, 0.29, 0.3, 14), M.linenDark, 0, -0.08, 0, J.torso);                 // ptéruges
    mesh(new THREE.CapsuleGeometry(0.205, 0.28, 6, 14), M.linen, 0, 0.33, 0, J.torso);                        // corpo de linho
    mesh(new THREE.CylinderGeometry(0.218, 0.222, 0.11, 14), BZ2, 0, 0.17, 0, J.torso);              // faixa de escamas
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.17, 0.05, 0.3), M.linen, s * 0.14, 0.555, 0, J.torso).rotation.z = -s * 0.22; // ombreiras
  } else if (P.armor === 'bare') {
    // peito nu (Héracles): tronco de pele largo, saia curta (perizoma; de time com `tunicTeam`) e cinto
    mesh(new THREE.CylinderGeometry(0.21, 0.28, 0.3, 14), tunicMat, 0, -0.04, 0, J.torso);                    // saia curta
    mesh(new THREE.CapsuleGeometry(0.205, 0.28, 6, 14), M.skin, 0, 0.33, 0, J.torso);                         // peito
    mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 20), M.leather, 0, 0.11, 0, J.torso).rotation.x = Math.PI / 2; // cinto
  } else {
    mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 14), tunicMat, 0, -0.1, 0, J.torso);                      // túnica (saia)
    mesh(new THREE.CapsuleGeometry(0.19, 0.28, 6, 14), chestMat, 0, 0.33, 0, J.torso);                        // túnica (peito)
    mesh(new THREE.TorusGeometry(0.21, 0.025, 6, 20), M.leather, 0, 0.12, 0, J.torso).rotation.x = Math.PI / 2; // cinto
  }
  if (P.cape !== 'none') {
    const len = P.cape === 'long' ? 1.1 : 0.78;
    const cape = mesh(new THREE.BoxGeometry(0.46, len, 0.04), M.team, 0, 0.5 - len / 2 + 0.02, 0.24, J.torso); // capa (cor de time)
    cape.rotation.x = 0.12;
  }
  // aljava de couro nas costas (pontas das flechas de linho à mostra), inclinada sobre o ombro direito
  if (P.quiver ?? P.weapon === 'bow') {
    const q = joint(J.torso, 0.08, 0.36, P.cape !== 'none' ? 0.32 : 0.2);   // por cima da capa, se houver
    q.rotation.set(0.12, 0, -0.38);
    mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.56, 10), M.leather, 0, 0, 0, q);
    mesh(new THREE.TorusGeometry(0.066, 0.012, 6, 14), M.bronzeDark, 0, 0.26, 0, q).rotation.x = Math.PI / 2;
    for (const [x, z] of [[-0.025, -0.02], [0.02, 0.015], [0.0, 0.03], [0.03, -0.025]]) mesh(new THREE.BoxGeometry(0.018, 0.1, 0.04), M.linen, x, 0.33, z, q);
  }

  // ---- cabeça ----
  J.head = joint(J.torso, 0, 0.66, 0);
  mesh(new THREE.SphereGeometry(0.115, 14, 12), M.skin, 0, 0.12, 0, J.head);
  const crestKind = P.crest ?? DEFAULT_CREST[P.helmet] ?? 'none';
  const crestMat = P.crestColor === 'team' ? M.team : P.crestColor === 'dark' ? M.crestDark : M.crest;
  /** Crina de crina de cavalo sobre o elmo (grupo `h` na altura da calota). */
  const crest = (h) => {
    if (crestKind === 'long') mesh(new THREE.BoxGeometry(0.035, 0.16, 0.36), crestMat, 0, 0.19, 0.02, h);
    else if (crestKind === 'tall') { mesh(new THREE.BoxGeometry(0.035, 0.26, 0.34), crestMat, 0, 0.25, 0.03, h); mesh(new THREE.BoxGeometry(0.02, 0.08, 0.04), BZ, 0, 0.13, -0.1, h); }
    else if (crestKind === 'transverse') { mesh(new THREE.BoxGeometry(0.4, 0.15, 0.04), crestMat, 0, 0.19, 0, h); mesh(new THREE.BoxGeometry(0.04, 0.06, 0.04), BZ, 0, 0.12, 0, h); }
  };
  if (P.helmet === 'corinthian') {
    const h = new THREE.Group(); h.position.set(0, 0.13, 0); J.head.add(h);
    mesh(new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), BZ, 0, 0, 0, h);   // calota
    mesh(new THREE.BoxGeometry(0.05, 0.18, 0.09), BZ, -0.1, -0.09, -0.06, h);                            // faces
    mesh(new THREE.BoxGeometry(0.05, 0.18, 0.09), BZ, 0.1, -0.09, -0.06, h);
    mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), BZ, 0, -0.06, -0.125, h);                              // nasal
    mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), BZ, 0, -0.06, 0.05, h);                                 // nuca
    crest(h);
  } else if (P.helmet === 'chalcidian') {
    // calcídico: rosto aberto, sem nasal, jugulares articuladas e nuca alargada
    const h = new THREE.Group(); h.position.set(0, 0.13, 0); J.head.add(h);
    mesh(new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), BZ, 0, 0, 0, h);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.035, 0.14, 0.1), BZ, s * 0.11, -0.085, -0.035, h).rotation.y = s * 0.25;   // jugulares
    mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.08, 14, 1, true, -Math.PI * 0.38, Math.PI * 0.76), BZ, 0, -0.07, 0.01, h); // nuca alargada (atrás, +z)
    mesh(new THREE.TorusGeometry(0.128, 0.012, 6, 20, Math.PI), BZ2, 0, 0.0, 0, h).rotation.x = -Math.PI / 2;            // aba da testa (frente)
    crest(h);
  } else if (P.helmet === 'phrygian') {
    // frígio: calota alta com o ápice curvado para a frente e jugulares grandes
    const h = new THREE.Group(); h.position.set(0, 0.13, 0); J.head.add(h);
    // (com helmetMat 'felt' é o gorro cita de feltro dos arqueiros: a mesma silhueta, abas moles no lugar das jugulares)
    const hm = P.helmetMat === 'felt' ? M.felt : P.helmetMat === 'team' ? M.team : BZ;
    mesh(new THREE.SphereGeometry(0.138, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hm, 0, 0, 0, h);
    const apex = new THREE.Group(); apex.position.set(0, 0.09, 0.01); apex.rotation.x = -0.85; h.add(apex);
    mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.12, 12), hm, 0, 0.04, 0, apex);
    mesh(new THREE.ConeGeometry(0.05, 0.12, 12), hm, 0, 0.15, 0, apex);
    mesh(new THREE.SphereGeometry(0.03, 8, 6), hm === BZ ? BZ2 : hm, 0, 0.21, 0, apex);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.04, 0.17, 0.12), hm, s * 0.112, -0.095, -0.03, h).rotation.y = s * 0.2;
    mesh(new THREE.BoxGeometry(0.2, 0.09, 0.1), hm, 0, -0.07, 0.07, h);
    crest(h);
  } else if (P.helmet === 'pilos') {
    mesh(new THREE.ConeGeometry(0.135, 0.3, 14), P.helmetMat === 'felt' ? M.felt : P.helmetMat === 'team' ? M.team : BZ, 0, 0.22, 0, J.head);
    if (crestKind !== 'none') { const h = new THREE.Group(); h.position.set(0, 0.2, 0); J.head.add(h); crest(h); }
  } else if (P.helmet === 'crown') {
    // coroa radiada de ouro (stephane) sobre o cabelo: aro, 9 pontas abertas para fora e uma gema na frente
    mesh(new THREE.SphereGeometry(0.125, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair, 0, 0.13, 0, J.head);
    const c = new THREE.Group(); c.position.set(0, 0.165, 0.005); J.head.add(c);
    mesh(new THREE.TorusGeometry(0.124, 0.02, 6, 24), M.gold, 0, 0, 0, c).rotation.x = Math.PI / 2;
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group(); g.rotation.y = (i / 9) * Math.PI * 2; c.add(g);
      mesh(new THREE.ConeGeometry(0.024, 0.1, 4), M.gold, 0, 0.055, 0.124, g).rotation.x = 0.3;   // ponta (inclinada para fora)
    }
    mesh(new THREE.SphereGeometry(0.022, 8, 6), M.crest, 0, 0.005, -0.14, c);                         // gema
  } else if (P.helmet === 'lion') {
    // pele do leão de Nemeia (Héracles): o capuz é a cabeça do leão — focinho sobre a testa, orelhas, olhos e a juba em
    // volta do rosto (aberta na frente); o couro desce pelas costas até a panturrilha, com as patas traseiras e a cauda, e
    // as patas dianteiras se cruzam num nó no peito. Não é cor de time: o time fica na saia (`tunicTeam`).
    const h = new THREE.Group(); h.position.set(0, 0.14, 0.01); J.head.add(h);
    mesh(new THREE.SphereGeometry(0.152, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.64), M.lion, 0, 0, 0, h);   // capuz
    mesh(new THREE.BoxGeometry(0.14, 0.09, 0.14), M.lion, 0, 0.06, -0.12, h).rotation.x = 0.3;               // focinho
    mesh(new THREE.BoxGeometry(0.07, 0.045, 0.05), M.lionMane, 0, 0.075, -0.2, h).rotation.x = 0.3;          // nariz
    for (const s of [-1, 1]) {
      mesh(new THREE.ConeGeometry(0.04, 0.07, 6), M.lion, s * 0.1, 0.14, -0.02, h).rotation.z = -s * 0.35;  // orelhas
      mesh(new THREE.SphereGeometry(0.016, 6, 5), M.crestDark, s * 0.045, 0.1, -0.18, h);                    // olhos
      mesh(new THREE.ConeGeometry(0.012, 0.05, 5), M.linen, s * 0.05, -0.005, -0.19, h).rotation.x = Math.PI; // presas
    }
    const mg = new THREE.Group(); mg.position.set(0, -0.03, 0.01); mg.rotation.x = Math.PI / 2; h.add(mg);
    mesh(new THREE.TorusGeometry(0.155, 0.055, 8, 20, Math.PI * 1.4), M.lionMane, 0, 0, 0, mg).rotation.z = -Math.PI * 0.2; // juba
    // couro nas costas (mais largo em cima, sobre os ombros), patas traseiras e cauda
    const pelt = new THREE.Group(); pelt.position.set(0, 0.56, 0.22); pelt.rotation.x = -0.2; J.torso.add(pelt);   // a ponta de baixo se afasta do corpo
    // contorno de couro (pescoço, ombros, flancos e as patas traseiras abertas nas pontas de baixo), não uma placa
    const hide = new THREE.Shape();
    [[-0.14, 0.02], [0.14, 0.02], [0.3, -0.06], [0.29, -0.26], [0.22, -0.46], [0.25, -0.66], [0.36, -0.9], [0.27, -1.0], [0.16, -0.84],
      [0.05, -0.9], [-0.05, -0.9], [-0.16, -0.84], [-0.27, -1.0], [-0.36, -0.9], [-0.25, -0.66], [-0.22, -0.46], [-0.29, -0.26], [-0.3, -0.06]]
      .forEach(([x, y], i) => (i ? hide.lineTo(x, y) : hide.moveTo(x, y)));
    mesh(new THREE.ExtrudeGeometry(hide, { depth: 0.04, bevelEnabled: false }), M.lion, 0, -0.04, -0.02, pelt);
    mesh(new THREE.BoxGeometry(0.1, 0.8, 0.02), M.lionMane, 0, -0.44, 0.025, pelt);                            // lombo mais escuro
    mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 6), M.lion, 0.02, -1.04, 0.03, pelt);                    // cauda
    mesh(new THREE.SphereGeometry(0.04, 8, 6), M.lionMane, 0.02, -1.2, 0.03, pelt);
    // patas dianteiras sobre os ombros, cruzadas no peito
    for (const s of [-1, 1]) mesh(new THREE.CapsuleGeometry(0.05, 0.3, 4, 8), M.lion, s * 0.1, 0.5, -0.19, J.torso).rotation.set(0.25, 0, s * 0.95);
    mesh(new THREE.SphereGeometry(0.06, 8, 6), M.lion, 0, 0.43, -0.23, J.torso);                             // nó
  } else if (P.helmet === 'petasos') {
    // pétaso alado (Perseu; o "elmo de Hades" dos vasos): copa baixa, aba larga e duas asas de penas brancas
    mesh(new THREE.SphereGeometry(0.125, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair, 0, 0.13, 0, J.head);
    const hm = P.helmetMat === 'bronze' ? BZ : P.helmetMat === 'team' ? M.team : M.felt;
    const h = new THREE.Group(); h.position.set(0, 0.15, 0); J.head.add(h);
    mesh(new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hm, 0, 0, 0, h);          // copa
    mesh(new THREE.CylinderGeometry(0.215, 0.225, 0.02, 24), hm, 0, 0.0, 0, h);                               // aba
    for (const s of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(s * 0.12, 0.06, 0.02); w.rotation.set(0.35, 0, -s * 0.5); h.add(w);
      [[0.0, 0.17], [0.035, 0.14], [0.07, 0.1]].forEach(([dz, len], i) => mesh(new THREE.BoxGeometry(0.018, len, 0.05), M.linen, 0, len / 2, dz, w).rotation.x = 0.15 * i);
    }
  } else if (P.hair) {
    mesh(new THREE.SphereGeometry(0.125, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair, 0, 0.13, 0, J.head);
    if (P.headband) mesh(new THREE.TorusGeometry(0.12, 0.018, 6, 20), M.team, 0, 0.15, 0, J.head).rotation.x = Math.PI / 2; // fita (time)
  }

  // ---- braços e itens ----
  const items = {};
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const sh = J['shoulder' + side] = joint(J.torso, s * 0.27, 0.5, 0);
    mesh(new THREE.CapsuleGeometry(0.06, UPPER - 0.1, 4, 10), M.skin, 0, -UPPER / 2, 0, sh);
    const el = J['elbow' + side] = joint(sh, 0, -UPPER, 0);
    mesh(new THREE.CapsuleGeometry(0.055, FORE - 0.1, 4, 10), M.skin, 0, -FORE / 2, 0, el);
    mesh(new THREE.SphereGeometry(0.06, 10, 8), M.skin, 0, -FORE, 0, el);                                        // mão
  }
  // escudo hoplon no antebraço esquerdo: disco de bronze com centro na cor do time, virado para a frente quando o cotovelo dobra 90°
  if (P.shield === 'hoplon') {
    // o disco fica logo além da mão (visto de fora cobre o antebraço, como a pegada real porpax/antilabe)
    const sg = J.shield = joint(J.elbowL, -0.04, -FORE - 0.05, 0);
    items.shield = sg;
    const disk = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 32), BZ, 0, 0, 0, sg);
    mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 32), M.team, 0, 0, 0, sg);
    mesh(new THREE.SphereGeometry(0.07, 12, 10), BZ, 0, -0.045, 0, sg);
    mesh(new THREE.TorusGeometry(0.43, 0.025, 8, 32), BZ2, 0, -0.02, 0, sg).rotation.x = Math.PI / 2;
    disk.rotation.set(0, 0, 0);
    if (P.shieldTeam === 'full') mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.062, 32), M.team, 0, 0.001, 0, sg);   // face inteira pintada
    // 'rim': o centro volta a ser de metal e só uma faixa larga perto da borda é pintada (o inverso do hoplita)
    if (P.shieldTeam === 'rim') { mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.062, 32), M.team, 0, 0.001, 0, sg); mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.066, 32), BZ, 0, 0.001, 0, sg); }
    // 'ornate' (o escudo de Aquiles, obra de Hefesto): anel de time perto da borda, campo de metal com faixas concêntricas
    // de ouro, borda e umbo de ouro — lê como "escudo dourado" e não como o centro de time do hoplita
    if (P.shieldTeam === 'ornate') {
      mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.062, 32), M.team, 0, 0.001, 0, sg);
      mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.066, 32), BZ, 0, 0.001, 0, sg);
      for (const [r, t] of [[0.43, 0.03], [0.33, 0.014], [0.24, 0.012], [0.15, 0.012]]) mesh(new THREE.TorusGeometry(r, t, 6, 32), M.gold, 0, -0.03, 0, sg).rotation.x = Math.PI / 2;
      mesh(new THREE.SphereGeometry(0.085, 12, 10), M.gold, 0, -0.05, 0, sg);
    }
  } else if (P.shield === 'mirror') {
    // escudo espelhado de Perseu (presente de Atena): disco de bronze polido como espelho, borda de time e filete de ouro
    const sg = J.shield = joint(J.elbowL, -0.04, -FORE - 0.05, 0);
    items.shield = sg;
    mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 32), M.mirror, 0, 0, 0, sg);
    mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 32), M.team, 0, -0.01, 0, sg).rotation.x = Math.PI / 2;
    mesh(new THREE.TorusGeometry(0.34, 0.01, 6, 32), M.gold, 0, -0.022, 0, sg).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.05, 10, 8), M.gold, 0, -0.03, 0, sg);
  } else if (P.shield === 'pelte') {
    // pelta: crescente de vime com a face pintada na cor do time (a mordida do crescente fica em cima com o braço à frente)
    const sg = J.shield = joint(J.elbowL, -0.04, -FORE - 0.04, 0);
    items.shield = sg;
    const R = 0.34, r = 0.21, c = 0.27;
    const yi = (R * R - r * r + c * c) / (2 * c), xi = Math.sqrt(R * R - yi * yi);
    const a0 = Math.atan2(yi, xi), b0 = Math.atan2(yi - c, xi);
    const shape = new THREE.Shape();
    shape.absarc(0, 0, R, Math.PI - a0, a0 + 2 * Math.PI, false);                 // borda de fora (por baixo)
    shape.absarc(0, c, r, b0, -Math.PI - b0, true);                              // mordida (arco de dentro)
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false, curveSegments: 20 });
    geo.translate(0, 0, -0.015);
    const face = mesh(geo, M.team, 0, 0, 0, sg); face.rotation.x = -Math.PI / 2;
    const back = mesh(geo.clone(), M.wicker, 0, 0.018, 0, sg); back.rotation.x = -Math.PI / 2; back.scale.set(1.06, 1.06, 1);
    mesh(new THREE.SphereGeometry(0.045, 10, 8), M.bronze, 0, -0.03, 0.1, sg);                               // umbo
  }
  // arma da mão direita (eixo local y a partir do punho; `poses.spear`/`poses.weapon` inclinam no punho)
  const W = P.weapon;
  if (W === 'spear') {
    // lança de 2,4 m: haste de −0,75 a +1,55 m em relação ao punho (pegada a 1/3; em repouso o conto fica perto do chão)
    const sg = J.spear = J.weapon = joint(J.elbowR, 0, -FORE, 0);
    items.spear = sg;
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.3, 8), M.wood, 0, 0.4, 0, sg);
    mesh(new THREE.ConeGeometry(0.035, 0.26, 10), M.bronze, 0, 1.68, 0, sg);                                  // ponta
    mesh(new THREE.ConeGeometry(0.02, 0.12, 8), M.bronze, 0, -0.8, 0, sg).rotation.x = Math.PI;              // conto (sauroter)
  } else if (W === 'dory') {
    // lança curta de 1,7 m, empunhada perto do meio (golpe por cima do escudo)
    const sg = J.spear = J.weapon = joint(J.elbowR, 0, -FORE, 0);
    items.weapon = sg;
    mesh(new THREE.CylinderGeometry(0.019, 0.019, 1.55, 8), M.wood, 0, 0.27, 0, sg);
    mesh(new THREE.ConeGeometry(0.034, 0.24, 10), M.bronze, 0, 1.16, 0, sg);
    mesh(new THREE.ConeGeometry(0.02, 0.1, 8), M.bronze, 0, -0.55, 0, sg).rotation.x = Math.PI;
  } else if (W === 'sword') {
    // kopis de ferro: lâmina larga curvada para a frente (duas partes), guarda e punho de madeira
    const sg = J.weapon = joint(J.elbowR, 0, -FORE, 0);
    items.weapon = sg;
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 8), M.woodDark, 0, 0, 0, sg);
    mesh(new THREE.SphereGeometry(0.028, 8, 6), M.bronze, 0, -0.075, 0, sg);
    mesh(new THREE.BoxGeometry(0.11, 0.022, 0.035), M.bronze, 0, 0.075, 0, sg);
    mesh(new THREE.BoxGeometry(0.014, 0.3, 0.05), M.iron, 0, 0.23, 0.004, sg);
    const tip = mesh(new THREE.BoxGeometry(0.014, 0.26, 0.068), M.iron, 0, 0.49, -0.02, sg); tip.rotation.x = -0.2;
  } else if (W === 'club') {
    // clava de oliveira: cilindro afunilado com nós e a cabeça grossa
    const sg = J.weapon = joint(J.elbowR, 0, -FORE, 0);
    items.weapon = sg;
    mesh(new THREE.CylinderGeometry(0.062, 0.028, 0.78, 10), M.wood, 0, 0.3, 0, sg);
    mesh(new THREE.SphereGeometry(0.075, 10, 8), M.wood, 0, 0.68, 0, sg);
    for (const [x, y, z] of [[0.045, 0.52, 0.01], [-0.04, 0.44, -0.03], [0.02, 0.6, -0.05]]) mesh(new THREE.SphereGeometry(0.03, 6, 5), M.woodDark, x, y, z, sg);
  } else if (W === 'harpe') {
    // harpe de Perseu: punho, lâmina reta de ferro e o gancho em foice que sai da ponta para a frente e desce
    const sg = J.weapon = joint(J.elbowR, 0, -FORE, 0);
    items.weapon = sg;
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 8), M.woodDark, 0, 0, 0, sg);
    mesh(new THREE.SphereGeometry(0.028, 8, 6), M.gold, 0, -0.075, 0, sg);
    mesh(new THREE.BoxGeometry(0.1, 0.022, 0.035), M.gold, 0, 0.075, 0, sg);
    mesh(new THREE.BoxGeometry(0.014, 0.36, 0.045), M.iron, 0, 0.26, 0, sg);
    mesh(new THREE.TorusGeometry(0.085, 0.016, 5, 14, Math.PI * 7 / 6), M.iron, 0, 0.44, -0.085, sg).rotation.set(0, Math.PI / 2, -Math.PI / 6);
  } else if (W === 'greatclub') {
    // clava de Héracles (um tronco de oliveira): 1,15 m, grossa na ponta e cheia de nós
    const sg = J.weapon = joint(J.elbowR, 0, -FORE, 0);
    items.weapon = sg;
    mesh(new THREE.CylinderGeometry(0.1, 0.042, 1.08, 10), M.wood, 0, 0.44, 0, sg);
    mesh(new THREE.SphereGeometry(0.11, 10, 8), M.wood, 0, 0.98, 0, sg);
    for (const [x, y, z, r] of [[0.07, 0.8, 0.02, 0.04], [-0.06, 0.66, -0.04, 0.035], [0.03, 0.9, -0.08, 0.04], [-0.05, 0.5, 0.04, 0.03], [0.05, 0.36, -0.03, 0.028], [-0.02, 1.05, 0.06, 0.035]]) mesh(new THREE.SphereGeometry(r, 6, 5), M.woodDark, x, y, z, sg);
  } else if (W === 'javelin') {
    // dardo (akontion) na direita, empunhado perto do meio; `hold` < 0,5 esconde (acabou de ser lançado)
    const sg = J.weapon = joint(J.elbowR, 0, -FORE, 0);
    items.weapon = sg;
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 6), M.wood, 0, 0.18, 0, sg);
    mesh(new THREE.ConeGeometry(0.022, 0.13, 8), M.iron, 0, 0.94, 0, sg);
    mesh(new THREE.TorusGeometry(0.016, 0.006, 4, 8), M.leather, 0, 0.08, 0, sg).rotation.x = Math.PI / 2; // ankyle (alça)
  }
  // feixe de dardos na mão esquerda (reserva) — atrás do escudo, se houver
  if (W === 'javelin' && P.bundle !== false) {
    const bg = J.bundle = joint(J.elbowL, 0, -FORE, 0);
    items.bundle = bg;
    for (const [x, z] of [[-0.02, 0.015], [0.02, -0.01]]) {
      mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.35, 6), M.wood, x, 0.12, z, bg);
      mesh(new THREE.ConeGeometry(0.02, 0.12, 8), M.iron, x, 0.85, z, bg);
    }
  }
  // arco composto na mão esquerda: pontas em ±z, barriga (o que aponta para o alvo) em −y; corda e flecha seguem a mão
  // direita pelo escalar `draw` da pose (`post`)
  let bowParts = null;
  if (W === 'bow') {
    const bg = J.bow = joint(J.elbowL, 0, -FORE, 0);
    items.bow = bg;
    const pts = [[0, 0.14, -0.62], [0, 0.15, -0.56], [0, 0.07, -0.36], [0, 0.0, -0.1], [0, -0.01, 0], [0, 0.0, 0.1], [0, 0.07, 0.36], [0, 0.15, 0.56], [0, 0.14, 0.62]].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.016, 6, false), M.woodDark, 0, 0, 0, bg);
    mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.12, 8), M.leather, 0, -0.005, 0, bg).rotation.x = Math.PI / 2;   // punho
    const str = () => { const s = mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 4), M.linen, 0, 0, 0, bg); s.castShadow = false; return s; };
    const arrow = new THREE.Group(); bg.add(arrow);
    mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.78, 5), M.wood, 0, 0.39, 0, arrow);
    mesh(new THREE.ConeGeometry(0.016, 0.07, 6), M.iron, 0, 0.8, 0, arrow);
    mesh(new THREE.BoxGeometry(0.004, 0.09, 0.035), M.linen, 0, 0.06, 0, arrow);
    bowParts = { bg, s1: str(), s2: str(), arrow, t1: pts[0].clone(), t2: pts[pts.length - 1].clone() };
  }
  // mão esquerda dos heróis: cetro do rei (pivô `offhand`; em pé com o cotovelo dobrado a 90° e o pivô a −90°) ou o velo
  // de ouro de Jasão dobrado sobre o antebraço (com o mesmo ângulo, −y local = para baixo e +z = para o cotovelo)
  if (P.offhand === 'scepter') {
    const og = J.offhand = joint(J.elbowL, 0, -FORE, 0);
    items.offhand = og;
    // haste de 2 m (−1,12 a +0,9 do punho: com a mão na cintura o pomo passa da cabeça), anéis de bronze, pomo e lótus
    mesh(new THREE.CylinderGeometry(0.017, 0.02, 2.02, 8), M.gold, 0, -0.11, 0, og);
    for (const y of [-0.5, 0.1, 0.5, 0.8]) mesh(new THREE.TorusGeometry(0.022, 0.008, 5, 10), M.bronzeDark, 0, y, 0, og).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.05, 10, 8), M.gold, 0, 0.94, 0, og);                    // pomo
    mesh(new THREE.ConeGeometry(0.045, 0.13, 8), M.gold, 0, 1.04, 0, og);                    // flor (lótus)
  } else if (P.offhand === 'fleece') {
    const og = J.offhand = joint(J.elbowL, 0, -FORE, 0);
    items.offhand = og;
    mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 10), M.fleece, 0, 0.02, 0.1, og).rotation.x = Math.PI / 2;   // dobra sobre o braço
    mesh(new THREE.BoxGeometry(0.15, 0.62, 0.3), M.fleece, 0, -0.3, 0.1, og);                                          // as duas metades pendendo
    // tufos de lã (posições fixas: nada aleatório no bake)
    for (const [x, y, z, r] of [[-0.08, -0.1, 0.0, 0.07], [0.08, -0.16, 0.18, 0.07], [-0.08, -0.34, 0.2, 0.075], [0.08, -0.4, -0.02, 0.07],
      [-0.07, -0.55, 0.08, 0.07], [0.07, -0.58, 0.2, 0.06], [0.0, -0.64, 0.02, 0.065], [0.08, -0.05, 0.02, 0.06], [-0.08, -0.22, 0.12, 0.06]]) mesh(new THREE.SphereGeometry(r, 8, 6), M.fleece, x, y, z, og);
    // cabeça do carneiro com os chifres enrolados, pendendo embaixo
    mesh(new THREE.SphereGeometry(0.06, 8, 6), M.fleece, 0, -0.68, -0.04, og);
    for (const sx of [-1, 1]) mesh(new THREE.TorusGeometry(0.035, 0.014, 5, 10), M.gold, sx * 0.06, -0.66, -0.03, og).rotation.y = Math.PI / 2;
  }
  // machado do cidadão (cabo curto + lâmina de bronze)
  if (W === 'axe' || P.tool === 'axe') {
    const ag = J.axe = joint(J.elbowR, 0, -FORE, 0);
    items.axe = ag;
    if (W === 'axe') J.weapon = ag;
    mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.7, 8), M.wood, 0, 0.2, 0, ag);
    mesh(new THREE.BoxGeometry(0.06, 0.16, 0.2), M.bronze, 0, 0.5, -0.09, ag);
  }
  // cesto de vime com frutas, segurado à frente nas duas mãos (só em `carry`)
  if (P.carry === 'basket') {
    const bg = J.basket = joint(J.torso, 0, 0.02, -0.36);
    items.basket = bg;
    mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.26, 14, 1, true), M.wicker, 0, 0, 0, bg);
    mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 14), M.wicker, 0, -0.12, 0, bg);
    mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 20), M.woodDark, 0, 0.13, 0, bg).rotation.x = Math.PI / 2;
    const fruit = [[0.08, 0.1, 0.04], [-0.07, 0.11, -0.05], [0.01, 0.13, 0.08], [-0.03, 0.12, -0.09], [0.1, 0.1, -0.06], [-0.1, 0.1, 0.06]];
    fruit.forEach(([x, y, z], i) => mesh(new THREE.SphereGeometry(0.05, 8, 6), i % 2 ? M.terracotta : M.olive2, x, y, z, bg));
  }

  const show = { ...DEFAULT_SHOW, ...(P.show ?? {}) };
  /** Liga/desliga itens conforme a animação (`show[item]` = lista de animações ou ['*']). */
  const setAnim = (anim) => { for (const [name, g] of Object.entries(items)) { const list = show[name] ?? ['*']; g.visible = list.includes('*') || list.includes(anim); } };

  // ---- pós-pose: corda/flecha do arco e o dardo lançado ----
  const up = new THREE.Vector3(0, 1, 0), hand = new THREE.Vector3(), mid = new THREE.Vector3(), nock = new THREE.Vector3(), d = new THREE.Vector3();
  const segment = (m, a, b) => { d.subVectors(b, a); const len = d.length(); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(up, d.normalize()); m.scale.set(1, Math.max(1e-3, len), 1); };
  /** Depois de `applyPose`: escalares `draw` (corda puxada até a mão direita, flecha encaixada) e `hold`. */
  const post = (pose = {}) => {
    const hold = pose.hold ?? 1;
    if (J.weapon && W !== 'bow' && items.weapon && hold < 0.5) items.weapon.visible = false;
    if (bowParts) {
      const { bg, s1, s2, arrow, t1, t2 } = bowParts;
      const draw = Math.max(0, Math.min(1, pose.draw ?? 0));
      mid.addVectors(t1, t2).multiplyScalar(0.5);
      rig.updateMatrixWorld(true);
      hand.set(0, -FORE, 0).applyMatrix4(J.elbowR.matrixWorld);
      bg.worldToLocal(hand);
      nock.copy(mid).lerp(hand, draw);
      segment(s1, t1, nock); segment(s2, nock, t2);
      arrow.visible = draw > 0.15 && bg.visible;
      if (arrow.visible) { d.set(0, 0, 0).sub(nock).normalize(); arrow.position.copy(nock); arrow.quaternion.setFromUnitVectors(up, d); }
    }
  };
  return { group, joints: J, items, setAnim, post };
}

/**
 * Aplica uma pose `{ joint: [rx, ry, rz] (graus) | root: { pos: [m], rot: [graus] } }` a um rig; pivôs ausentes voltam ao
 * repouso. Dois nomes podem apontar para o mesmo pivô (`spear` e `weapon`): vale o que a pose trouxer.
 */
export function applyPose(rig, pose) {
  const set = new Set();
  for (const name of JOINTS) {
    const g = rig.joints[name]; if (!g) continue;
    const v = pose[name];
    if (name === 'root') {
      const pos = v?.pos ?? [0, 0, 0], rot = v?.rot ?? [0, 0, 0];
      g.position.set(pos[0], 0.92 + pos[1], pos[2]);
      g.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
      set.add(g);
    } else if (Array.isArray(v)) { g.rotation.set(v[0] * DEG, v[1] * DEG, v[2] * DEG); set.add(g); }
  }
  for (const name of JOINTS) { const g = rig.joints[name]; if (g && !set.has(g)) { g.rotation.set(0, 0, 0); set.add(g); } }
}

const lerp = (a, b, t) => a + (b - a) * t;
function lerpVec(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
/** Interpola duas poses de um conjunto de pivôs (`joints`, com `root` especial) e de escalares. */
export function lerpPose(A, B, t, joints = JOINTS, scalars = SCALARS) {
  const out = {};
  for (const name of joints) {
    if (name === 'root') {
      const ra = A.root ?? {}, rb = B.root ?? {};
      out.root = { pos: lerpVec(ra.pos ?? [0, 0, 0], rb.pos ?? [0, 0, 0], t), rot: lerpVec(ra.rot ?? [0, 0, 0], rb.rot ?? [0, 0, 0], t) };
    } else if (A[name] || B[name]) out[name] = lerpVec(A[name] ?? [0, 0, 0], B[name] ?? [0, 0, 0], t);
  }
  for (const s of scalars) if (A[s] !== undefined || B[s] !== undefined) out[s] = lerp(A[s] ?? B[s], B[s] ?? A[s], t);
  return out;
}

/**
 * Pose interpolada do quadro `i` de `frames` da animação `def` (`{ loop, keys: [{ t, ...pose }] }`).
 * Em loop o tempo é cíclico (o último quadro ainda não repete o primeiro); sem loop, o último quadro é t = 1.
 * `joints`/`scalars`: o conjunto do rig (o cavalo e o cerco usam os seus).
 */
export function poseAt(def, i, frames, joints = JOINTS, scalars = SCALARS) {
  const keys = [...def.keys].sort((a, b) => a.t - b.t);
  let t = def.loop ? i / frames : frames > 1 ? i / (frames - 1) : 0;
  t = Math.min(1, Math.max(0, t));
  if (def.loop && keys[keys.length - 1].t < 1) keys.push({ ...keys[0], t: 1 });   // fecha o ciclo
  let k = 0;
  while (k < keys.length - 2 && keys[k + 1].t <= t) k++;
  const a = keys[k], b = keys[Math.min(k + 1, keys.length - 1)];
  const span = b.t - a.t;
  const u = span > 1e-9 ? (t - a.t) / span : 0;
  const e = def.ease === 'smooth' ? u * u * (3 - 2 * u) : u;
  return lerpPose(a, b, e, joints, scalars);
}

/** Rig de unidade humana para o bake: `pose(fr, poses)` com `fr.pose` em poses.main (art/poses/human.json). */
export function humanUnit(THREE, M, params) {
  const rig = buildHuman(THREE, M, params);
  return {
    group: rig.group,
    pose(fr, poses) {
      const def = poses.main?.anims?.[fr.pose];
      if (!def) throw new Error(`pose ${fr.pose} ausente`);
      rig.setAnim(fr.anim);
      const p = poseAt(def, fr.frame, fr.frames);
      applyPose(rig, p);
      rig.post(p);
      rig.group.rotation.y = dirYaw(fr.dir);
    },
  };
}
