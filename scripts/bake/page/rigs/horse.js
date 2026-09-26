// Rig de cavalo (docs/ART.md §1.8, Etapa 4): quadrúpede com pivôs — raiz, corpo (arfagem), pescoço, cabeça, cauda e
// duas juntas por perna (fl/flk = dianteira esquerda e joelho, fr/frk, bl/blk = traseira esquerda e jarrete, br/brk) — e
// um CAVALEIRO que é o rig humano (rigs/human.js, em metros) sentado no dorso, filho do corpo (galopa junto).
// Parâmetros do manifesto (`source.params`):
//   coat     'bay' (baio, canelas pretas) · 'chestnut' (alazão) · 'grey' (tordilho) · 'black'
//   cloth    true = xairel (manta) na cor do time sobre o dorso e nos flancos (padrão) · false
//   peytral  true = peitoral de bronze (cavalaria pesada)
//   rider    kit do cavaleiro (os mesmos parâmetros do rig humano: helmet, armor, cape, shield, weapon…); null = sem cavaleiro
// Poses: `art/poses/horse.json` (pivôs do cavalo) + `art/poses/human.json` para o cavaleiro — cada animação do manifesto
// tem `pose` (cavalo) e `rider` (cavaleiro), interpoladas no mesmo quadro. Metros, frente em −z, cascos em y = 0.
// Convenções: perna pendendo em −y; rotação x positiva leva o casco para a FRENTE (−z). O joelho dianteiro dobra com x
// negativo (casco para trás); o jarrete traseiro dobra com x positivo (casco para a frente, sob a barriga).

import { M2T, dirYaw } from '../camera.js';
import { buildHuman, applyPose, poseAt, JOINTS as HUMAN_JOINTS, SCALARS as HUMAN_SCALARS } from './human.js';

export const JOINTS = ['root', 'body', 'neck', 'head', 'tail', 'fl', 'flk', 'fr', 'frk', 'bl', 'blk', 'br', 'brk'];
export const SCALARS = [];
export const KIT = { coat: ['bay', 'chestnut', 'grey', 'black'] };
const DEG = Math.PI / 180;
/** Altura do centro do corpo (m); a raiz da pose parte daqui (como o quadril do humano, 0,92). */
export const BODY_Y = 1.1;
/** Altura do assento do cavaleiro sobre o centro do corpo (m) e recuo em z. */
const SEAT = [0, 0.37, 0.04];

export function buildHorse(THREE, M, params = {}) {
  const P = { coat: 'bay', cloth: true, peytral: false, rider: {}, ...params };
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const joint = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const coat = { bay: M.horseBay, chestnut: M.horseChestnut, grey: M.horseGrey, black: M.horseBlack }[P.coat] ?? M.horseBay;
  const points = P.coat === 'bay' || P.coat === 'black' ? M.horseBlack : coat;   // canelas (baio tem as "pontas" pretas)
  const hair = P.coat === 'grey' ? M.stoneLight : P.coat === 'chestnut' ? M.horseChestnut : M.mane;

  const group = new THREE.Group();
  const rig = new THREE.Group(); rig.scale.setScalar(M2T); group.add(rig);
  const J = {};
  J.root = joint(rig, 0, BODY_Y, 0);
  J.body = joint(J.root, 0, 0, 0);

  // ---- corpo: barril, peito, ancas, cernelha ----
  mesh(new THREE.CapsuleGeometry(0.3, 0.92, 6, 16), coat, 0, 0, 0, J.body).rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.31, 14, 12), coat, 0, 0.04, -0.52, J.body);                                  // peito
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.21, 12, 10), coat, s * 0.13, 0.02, 0.5, J.body);    // ancas
  mesh(new THREE.SphereGeometry(0.2, 12, 10), coat, 0, 0.2, -0.5, J.body);                                     // cernelha
  if (P.peytral) {
    const pt = mesh(new THREE.SphereGeometry(0.335, 16, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.4), M.bronze, 0, 0.04, -0.54, J.body);
    pt.rotation.x = -Math.PI / 2;
  }
  // xairel: manta de time no dorso, caindo nos flancos
  if (P.cloth) {
    mesh(new THREE.BoxGeometry(0.62, 0.03, 0.66), M.team, 0, 0.305, 0.04, J.body);
    for (const s of [-1, 1]) { const d = mesh(new THREE.BoxGeometry(0.03, 0.34, 0.6), M.team, s * 0.305, 0.15, 0.04, J.body); d.rotation.z = s * 0.12; }
    mesh(new THREE.BoxGeometry(0.66, 0.02, 0.05), M.bronzeDark, 0, 0.32, -0.29, J.body);                     // barra da manta
  }

  // ---- pescoço e cabeça ----
  J.neck = joint(J.body, 0, 0.16, -0.6);
  J.neck.rotation.x = -0.62;
  mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.74, 12), coat, 0, 0.33, 0, J.neck);
  const mane = mesh(new THREE.BoxGeometry(0.06, 0.66, 0.1), hair, 0, 0.36, 0.13, J.neck); mane.rotation.x = 0.1;
  J.head = joint(J.neck, 0, 0.68, 0);
  const skull = new THREE.Group(); skull.rotation.x = -1.55; J.head.add(skull);
  mesh(new THREE.CylinderGeometry(0.075, 0.12, 0.5, 10), coat, 0, 0.2, -0.02, skull);
  mesh(new THREE.SphereGeometry(0.12, 10, 8), coat, 0, -0.02, 0.02, skull);                                   // ganacha
  mesh(new THREE.SphereGeometry(0.085, 10, 8), points === M.horseBlack ? M.horseBlack : coat, 0, 0.44, -0.02, skull); // focinho
  for (const s of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(0.03, 0.12, 6), coat, s * 0.06, -0.06, 0.1, skull); e.rotation.x = Math.PI / 2 + 0.3; e.rotation.z = -s * 0.2; } // orelhas
  mesh(new THREE.TorusGeometry(0.09, 0.012, 5, 14), M.leather, 0, 0.36, -0.02, skull).rotation.x = Math.PI / 2; // cabeçada
  mesh(new THREE.BoxGeometry(0.06, 0.12, 0.08), hair, 0, -0.08, 0.06, skull);                                // topete

  // ---- cauda ----
  J.tail = joint(J.body, 0, 0.14, 0.76);
  mesh(new THREE.CylinderGeometry(0.07, 0.035, 0.7, 8), hair, 0, -0.33, 0, J.tail);

  // ---- pernas ----
  const UP = 0.5, LOW = 0.45;
  for (const [name, x, z, hind] of [['fl', -0.15, -0.5, false], ['fr', 0.15, -0.5, false], ['bl', -0.15, 0.5, true], ['br', 0.15, 0.5, true]]) {
    const top = J[name] = joint(J.body, x, -0.06, z);
    mesh(new THREE.CylinderGeometry(hind ? 0.1 : 0.085, 0.055, UP, 10), coat, 0, -UP / 2, 0, top);
    const knee = J[name + 'k'] = joint(top, 0, -UP, 0);
    mesh(new THREE.SphereGeometry(0.058, 8, 6), coat, 0, 0, 0, knee);
    mesh(new THREE.CylinderGeometry(0.045, 0.04, LOW, 8), points, 0, -LOW / 2, 0, knee);
    mesh(new THREE.SphereGeometry(0.05, 8, 6), points, 0, -LOW, 0, knee);                                     // boleto
    mesh(new THREE.CylinderGeometry(0.052, 0.064, 0.08, 10), M.hoof, 0, -LOW - 0.05, -0.01, knee);            // casco
  }

  // ---- cavaleiro (rig humano em metros, sentado no dorso) ----
  let rider = null;
  if (P.rider) {
    rider = buildHuman(THREE, M, P.rider, { meters: true });
    rider.group.position.set(SEAT[0], SEAT[1] - 0.92, SEAT[2]);
    J.body.add(rider.group);
  }
  return { group, joints: J, rider };
}

/** Aplica a pose do cavalo (mesmo formato do humano; a raiz parte de BODY_Y). */
export function applyHorsePose(rig, pose) {
  for (const name of JOINTS) {
    const g = rig.joints[name]; if (!g) continue;
    const v = pose[name];
    if (name === 'root') {
      const pos = v?.pos ?? [0, 0, 0], rot = v?.rot ?? [0, 0, 0];
      g.position.set(pos[0], BODY_Y + pos[1], pos[2]);
      g.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
    } else {
      const base = name === 'neck' ? -0.62 : 0;   // repouso do pescoço (inclinado para a frente)
      const r = Array.isArray(v) ? v : [0, 0, 0];
      g.rotation.set(base + r[0] * DEG, r[1] * DEG, r[2] * DEG);
    }
  }
}

/** Rig de unidade montada para o bake: `pose(fr, poses)` com `fr.pose` (cavalo, poses.main) e `fr.rider` (poses.rider). */
export function horseUnit(THREE, M, params) {
  const rig = buildHorse(THREE, M, params);
  return {
    group: rig.group,
    pose(fr, poses) {
      const def = poses.main?.anims?.[fr.pose];
      if (!def) throw new Error(`pose de cavalo ${fr.pose} ausente`);
      applyHorsePose(rig, poseAt(def, fr.frame, fr.frames, JOINTS, SCALARS));
      if (rig.rider) {
        const rd = poses.rider?.anims?.[fr.rider];
        if (!rd) throw new Error(`pose de cavaleiro ${fr.rider} ausente`);
        rig.rider.setAnim(fr.anim);
        const p = poseAt(rd, fr.frame, fr.frames, HUMAN_JOINTS, HUMAN_SCALARS);
        applyPose(rig.rider, p);
        rig.rider.post(p);
      }
      rig.group.rotation.y = dirYaw(fr.dir);
    },
  };
}
