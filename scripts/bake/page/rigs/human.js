// Rig humano paramétrico (docs/ART.md §1.8, §1.11): esqueleto simples com pivôs — raiz (quadril), tronco, cabeça,
// ombros/cotovelos, quadris/joelhos — e kit de equipamento por parâmetros do manifesto (elmo, couraça, capa, escudo,
// arma, ferramenta, cesto). Modelado em METROS com os pés em y = 0 e a frente em −z; o grupo externo converte para tiles.
// As poses vêm de `art/poses/human.json` (graus por pivô e por quadro-chave) e são interpoladas em `poseAt`.
// Convenções de rotação (three.js): num membro que pende em −y, rotação x positiva = balança para a FRENTE (−z);
// rotação z positiva = leva para +x (o lado direito do modelo). Joelhos dobram com x negativo.

import { M2T } from '../camera.js';

/** Pivôs que uma pose pode mover (itens de mão também são pivôs: `spear`, `axe`, `shield`, `basket`). */
export const JOINTS = ['root', 'torso', 'head', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR', 'spear', 'axe', 'shield', 'basket'];

/** Em que animações cada item aparece por padrão (o manifesto pode sobrescrever em `params.show`). */
const DEFAULT_SHOW = { basket: ['carry'], axe: ['gather', 'attack'], spear: ['*'], shield: ['*'], sword: ['*'] };

const DEG = Math.PI / 180;

/** Constrói o rig. Devolve `{ group, joints, items, setAnim }`. `group` está em tiles e a origem é o pé. */
export function buildHuman(THREE, M, params = {}) {
  const P = { helmet: 'none', hair: true, armor: 'tunic', cape: 'none', shield: 'none', weapon: 'none', carry: 'none', greaves: false, tunicTeam: false, headband: false, ...params };
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const joint = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

  const group = new THREE.Group();
  const rig = new THREE.Group(); rig.scale.setScalar(M2T); group.add(rig);
  const HIP_Y = 0.92, THIGH = 0.44, SHIN = 0.44, UPPER = 0.28, FORE = 0.27;
  const J = {};
  J.root = joint(rig, 0, HIP_Y, 0);
  J.torso = joint(J.root, 0, 0, 0);

  // ---- pernas ----
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const hip = J['hip' + side] = joint(J.root, s * 0.12, 0, 0);
    mesh(new THREE.CapsuleGeometry(0.08, THIGH - 0.12, 4, 10), M.skin, 0, -THIGH / 2, 0, hip);
    const knee = J['knee' + side] = joint(hip, 0, -THIGH, 0);
    mesh(new THREE.CapsuleGeometry(0.07, SHIN - 0.12, 4, 10), M.skin, 0, -SHIN / 2 + 0.02, 0, knee);
    if (P.greaves) mesh(new THREE.CylinderGeometry(0.092, 0.082, 0.34, 12), M.bronze, 0, -SHIN / 2 + 0.03, 0, knee);
    mesh(new THREE.BoxGeometry(0.13, 0.05, 0.26), M.leather, 0, -SHIN + 0.025, -0.05, knee);                   // sandália
  }

  // ---- tronco ----
  // `tunicTeam`: true = túnica inteira na cor do time; 'upper' = só o peito (a saia fica de linho)
  const tunicMat = P.tunicTeam === true ? M.team : M.linen;
  const chestMat = P.tunicTeam ? M.team : M.linen;
  if (P.armor === 'cuirass') {
    mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.34, 14), M.linen, 0, -0.06, 0, J.torso);                    // saiote de linho (ptéruges)
    mesh(new THREE.CapsuleGeometry(0.21, 0.3, 6, 14), M.bronze, 0, 0.34, 0, J.torso);                         // couraça
    mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3), M.bronzeDark, 0, 0.53, 0, J.torso);                           // ombreiras
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

  // ---- cabeça ----
  J.head = joint(J.torso, 0, 0.66, 0);
  mesh(new THREE.SphereGeometry(0.115, 14, 12), M.skin, 0, 0.12, 0, J.head);
  if (P.helmet === 'corinthian') {
    const h = new THREE.Group(); h.position.set(0, 0.13, 0); J.head.add(h);
    mesh(new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), M.bronze, 0, 0, 0, h);   // calota
    mesh(new THREE.BoxGeometry(0.05, 0.18, 0.09), M.bronze, -0.1, -0.09, -0.06, h);                            // faces
    mesh(new THREE.BoxGeometry(0.05, 0.18, 0.09), M.bronze, 0.1, -0.09, -0.06, h);
    mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), M.bronze, 0, -0.06, -0.125, h);                              // nasal
    mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), M.bronze, 0, -0.06, 0.05, h);                                 // nuca
    mesh(new THREE.BoxGeometry(0.035, 0.16, 0.36), M.crest, 0, 0.19, 0.02, h);                                 // crina
  } else if (P.helmet === 'pilos') {
    mesh(new THREE.ConeGeometry(0.135, 0.3, 14), M.bronze, 0, 0.22, 0, J.head);
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
    const disk = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 32), M.bronze, 0, 0, 0, sg);
    mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 32), M.team, 0, 0, 0, sg);
    mesh(new THREE.SphereGeometry(0.07, 12, 10), M.bronze, 0, -0.045, 0, sg);
    mesh(new THREE.TorusGeometry(0.43, 0.025, 8, 32), M.bronzeDark, 0, -0.02, 0, sg).rotation.x = Math.PI / 2;
    disk.rotation.set(0, 0, 0);
  }
  // lança de 2,4 m na mão direita (eixo local y da lança; `poses.spear` inclina no punho)
  if (P.weapon === 'spear') {
    const sg = J.spear = joint(J.elbowR, 0, -FORE, 0);
    items.spear = sg;
    // haste de −0,75 a +1,55 m em relação ao punho (pegada a 1/3 do comprimento; em repouso o conto fica perto do chão)
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.3, 8), M.wood, 0, 0.4, 0, sg);
    mesh(new THREE.ConeGeometry(0.035, 0.26, 10), M.bronze, 0, 1.68, 0, sg);                                  // ponta
    mesh(new THREE.ConeGeometry(0.02, 0.12, 8), M.bronze, 0, -0.8, 0, sg).rotation.x = Math.PI;              // conto (sauroter)
  }
  // machado do cidadão (cabo curto + lâmina de bronze)
  if (P.weapon === 'axe' || P.tool === 'axe') {
    const ag = J.axe = joint(J.elbowR, 0, -FORE, 0);
    items.axe = ag;
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
  return { group, joints: J, items, setAnim };
}

/** Aplica uma pose `{ joint: [rx, ry, rz] (graus) | root: { pos: [m], rot: [graus] } }` a um rig; pivôs ausentes voltam ao repouso. */
export function applyPose(rig, pose) {
  for (const name of JOINTS) {
    const g = rig.joints[name]; if (!g) continue;
    const v = pose[name];
    if (name === 'root') {
      const pos = v?.pos ?? [0, 0, 0], rot = v?.rot ?? [0, 0, 0];
      g.position.set(pos[0], 0.92 + pos[1], pos[2]);
      g.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
    } else {
      const r = Array.isArray(v) ? v : [0, 0, 0];
      g.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
    }
  }
}

const lerp = (a, b, t) => a + (b - a) * t;
function lerpVec(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function lerpPose(A, B, t) {
  const out = {};
  for (const name of JOINTS) {
    if (name === 'root') {
      const ra = A.root ?? {}, rb = B.root ?? {};
      out.root = { pos: lerpVec(ra.pos ?? [0, 0, 0], rb.pos ?? [0, 0, 0], t), rot: lerpVec(ra.rot ?? [0, 0, 0], rb.rot ?? [0, 0, 0], t) };
    } else if (A[name] || B[name]) out[name] = lerpVec(A[name] ?? [0, 0, 0], B[name] ?? [0, 0, 0], t);
  }
  return out;
}

/**
 * Pose interpolada do quadro `i` de `frames` da animação `def` (`{ loop, keys: [{ t, ...pose }] }`).
 * Em loop o tempo é cíclico (o último quadro ainda não repete o primeiro); sem loop, o último quadro é t = 1.
 */
export function poseAt(def, i, frames) {
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
  return lerpPose(a, b, e);
}
