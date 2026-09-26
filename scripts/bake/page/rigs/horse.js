// Rig de cavalo (docs/ART.md §1.8, Etapa 4): quadrúpede com pivôs — raiz, corpo (arfagem), pescoço, cabeça, cauda e
// duas juntas por perna (fl/flk = dianteira esquerda e joelho, fr/frk, bl/blk = traseira esquerda e jarrete, br/brk) — e
// um CAVALEIRO que é o rig humano (rigs/human.js, em metros) sentado no dorso, filho do corpo (galopa junto).
// Parâmetros do manifesto (`source.params`):
//   coat     'bay' (baio, canelas pretas) · 'chestnut' (alazão) · 'grey' (tordilho) · 'black'
//   build    'light' (menor e esguio: o pônei do batedor) · 'medium' (padrão) · 'heavy' (maior e mais encorpado) —
//            o cavaleiro não muda de tamanho, só sobe/desce com o dorso
//   cloth    true = xairel (manta) na cor do time sobre o dorso e nos flancos (padrão) · 'long' = xairel longo até
//            abaixo da barriga, com barra de bronze (cavalaria pesada) · 'fleece' = pelego de carneiro com cilha, sem
//            cor de time (cavalaria leve: o time fica no cavaleiro) · false
//   peytral  true = peitoral de bronze na frente do peito (cavalaria pesada)
//   chamfron true = testeira de bronze (prometopídio) sobre a face
//   rider    kit do cavaleiro (os mesmos parâmetros do rig humano: helmet, armor, cape, shield, weapon…); null = sem cavaleiro
// Poses: `art/poses/horse.json` (pivôs do cavalo) + `art/poses/human.json` para o cavaleiro — cada animação do manifesto
// tem `pose` (cavalo) e `rider` (cavaleiro), interpoladas no mesmo quadro. Metros, frente em −z, cascos em y = 0.
// Convenções: perna pendendo em −y; rotação x positiva leva o casco para a FRENTE (−z). O joelho dianteiro dobra com x
// negativo (casco para trás); o jarrete traseiro dobra com x positivo (casco para a frente, sob a barriga).

import { M2T, dirYaw } from '../camera.js';
import { buildHuman, applyPose, poseAt, JOINTS as HUMAN_JOINTS, SCALARS as HUMAN_SCALARS } from './human.js';

export const JOINTS = ['root', 'body', 'neck', 'head', 'tail', 'fl', 'flk', 'fr', 'frk', 'bl', 'blk', 'br', 'brk'];
export const SCALARS = [];
export const KIT = { coat: ['bay', 'chestnut', 'grey', 'black'], build: ['light', 'medium', 'heavy'], cloth: [true, false, 'long', 'fleece'], peytral: [true, false], chamfron: [true, false] };
/** Porte do cavalo: `size` escala o cavalo inteiro (não o cavaleiro); `girth` engrossa corpo, pescoço e antebraços. */
const BUILDS = { light: { size: 0.95, girth: 0.88 }, medium: { size: 1, girth: 1 }, heavy: { size: 1.06, girth: 1.1 } };
const DEG = Math.PI / 180;
/** Altura do centro do corpo (m); a raiz da pose parte daqui (como o quadril do humano, 0,92). */
export const BODY_Y = 1.1;
/** Altura do assento do cavaleiro sobre o centro do corpo (m) e recuo em z. */
const SEAT = [0, 0.37, 0.04];

export function buildHorse(THREE, M, params = {}) {
  const P = { coat: 'bay', build: 'medium', cloth: true, peytral: false, chamfron: false, rider: {}, ...params };
  const B = BUILDS[P.build] ?? BUILDS.medium, g = B.girth;
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const joint = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const coat = { bay: M.horseBay, chestnut: M.horseChestnut, grey: M.horseGrey, black: M.horseBlack }[P.coat] ?? M.horseBay;
  const points = P.coat === 'bay' || P.coat === 'black' ? M.horseBlack : coat;   // canelas (baio tem as "pontas" pretas)
  const hair = P.coat === 'grey' ? M.stoneLight : P.coat === 'chestnut' ? M.horseChestnut : M.mane;

  const group = new THREE.Group();
  const rig = new THREE.Group(); rig.scale.setScalar(M2T); group.add(rig);
  const J = {};
  // o porte escala tudo abaixo daqui (cascos continuam em y = 0 e a pose da raiz escala junto); o cavaleiro desfaz a escala
  const sized = new THREE.Group(); sized.scale.setScalar(B.size); rig.add(sized);
  J.root = joint(sized, 0, BODY_Y, 0);
  J.body = joint(J.root, 0, 0, 0);

  // ---- corpo: barril, peito, ancas, cernelha ----
  mesh(new THREE.CapsuleGeometry(0.3 * g, 0.92, 6, 16), coat, 0, 0, 0, J.body).rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.31 * g, 14, 12), coat, 0, 0.04, -0.52, J.body);                              // peito
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.21 * g, 12, 10), coat, s * 0.13 * g, 0.02, 0.5, J.body); // ancas
  mesh(new THREE.SphereGeometry(0.2 * g, 12, 10), coat, 0, 0.2 * g, -0.5, J.body);                             // cernelha
  if (P.peytral) {
    // peitoral: placa curva de bronze na frente do peito (de ombro a ombro), com um umbo no meio
    mesh(new THREE.CylinderGeometry(0.335 * g, 0.3 * g, 0.3, 18, 1, true, Math.PI - 1.15, 2.3), M.bronze, 0, -0.02, -0.53, J.body);
    mesh(new THREE.TorusGeometry(0.33 * g, 0.014, 5, 18, 2.3), M.bronzeDark, 0, 0.13, -0.53, J.body).rotation.set(Math.PI / 2, 0, -Math.PI / 2 - 1.15);
    mesh(new THREE.SphereGeometry(0.05, 10, 8), M.bronzeDark, 0, -0.01, -0.53 - 0.335 * g, J.body);
  }
  // xairel: manta de time moldada ao dorso (casca de cilindro em volta do barril, lida com o sombreado do corpo) com a
  // borda da frente em bronze; 'long' desce até abaixo da barriga, com barras de bronze nas bordas de baixo
  const R = 0.3 * g + 0.018;
  /** Manta em volta do barril: comprimento `len` (m, ao longo do corpo), abertura `arc` (rad, centrada no dorso), centro em z. */
  const wrap = (mat, len, arc, z) => {
    const c = mesh(new THREE.CylinderGeometry(R, R, len, 24, 1, true, Math.PI - arc / 2, arc), mat, 0, 0, z, J.body);
    c.rotation.x = Math.PI / 2;   // eixo do cilindro ao longo do corpo; θ = π cai no alto do dorso
    return c;
  };
  const frontBar = (arc, z) => { mesh(new THREE.TorusGeometry(R + 0.004, 0.013, 5, 24, arc), M.bronzeDark, 0, 0, z, J.body).rotation.z = Math.PI / 2 - arc / 2; };
  if (P.cloth === true) {
    wrap(M.team, 0.66, 3.3, 0.04);
    frontBar(3.3, 0.04 - 0.33);
  } else if (P.cloth === 'long') {
    const arc = 4.1, len = 0.84, z = 0.06;
    wrap(M.team, len, arc, z);
    frontBar(arc, z - len / 2);
    for (const sd of [-1, 1]) {
      const bar = mesh(new THREE.CylinderGeometry(0.016, 0.016, len, 6), M.bronzeDark, sd * (R + 0.004) * Math.sin(arc / 2), (R + 0.004) * Math.cos(arc / 2), z, J.body);
      bar.rotation.x = Math.PI / 2;
    }
  } else if (P.cloth === 'fleece') {
    // pelego de carneiro preso por uma cilha de couro (sem time: na cavalaria leve a cor fica no cavaleiro)
    wrap(M.fur, 0.56, 2.3, 0.04);
    mesh(new THREE.TorusGeometry(0.305 * g, 0.016, 6, 24), M.leather, 0, 0, -0.2, J.body);                     // cilha
  }

  // ---- pescoço e cabeça ----
  J.neck = joint(J.body, 0, 0.16, -0.6);
  J.neck.rotation.x = -0.62;
  mesh(new THREE.CylinderGeometry(0.12 * g, 0.2 * g, 0.74, 12), coat, 0, 0.33, 0, J.neck);
  const mane = mesh(new THREE.BoxGeometry(0.06, 0.66, 0.1), hair, 0, 0.36, 0.13, J.neck); mane.rotation.x = 0.1;
  J.head = joint(J.neck, 0, 0.68, 0);
  const skull = new THREE.Group(); skull.rotation.x = -1.55; J.head.add(skull);
  mesh(new THREE.CylinderGeometry(0.075, 0.12, 0.5, 10), coat, 0, 0.2, -0.02, skull);
  mesh(new THREE.SphereGeometry(0.12, 10, 8), coat, 0, -0.02, 0.02, skull);                                   // ganacha
  mesh(new THREE.SphereGeometry(0.085, 10, 8), points === M.horseBlack ? M.horseBlack : coat, 0, 0.44, -0.02, skull); // focinho
  for (const s of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(0.03, 0.12, 6), coat, s * 0.06, -0.06, 0.1, skull); e.rotation.x = Math.PI / 2 + 0.3; e.rotation.z = -s * 0.2; } // orelhas
  mesh(new THREE.TorusGeometry(0.09, 0.012, 5, 14), M.leather, 0, 0.36, -0.02, skull).rotation.x = Math.PI / 2; // cabeçada
  mesh(new THREE.BoxGeometry(0.06, 0.12, 0.08), hair, 0, -0.08, 0.06, skull);                                // topete
  if (P.chamfron) {
    // testeira de bronze sobre a face (da testa ao meio do chanfro; o focinho fica de fora), com um botão na testa
    mesh(new THREE.CylinderGeometry(0.094, 0.126, 0.3, 12, 1, true, -0.65, 1.3), M.bronze, 0, 0.13, -0.02, skull);
    mesh(new THREE.SphereGeometry(0.03, 8, 6), M.bronzeDark, 0, 0.04, 0.1, skull);
  }

  // ---- cauda ----
  J.tail = joint(J.body, 0, 0.14, 0.76);
  mesh(new THREE.CylinderGeometry(0.07, 0.035, 0.7, 8), hair, 0, -0.33, 0, J.tail);

  // ---- pernas ----
  const UP = 0.5, LOW = 0.45;
  const hooves = [];
  for (const [name, x, z, hind] of [['fl', -0.15, -0.5, false], ['fr', 0.15, -0.5, false], ['bl', -0.15, 0.5, true], ['br', 0.15, 0.5, true]]) {
    const top = J[name] = joint(J.body, x, -0.06, z);
    mesh(new THREE.CylinderGeometry((hind ? 0.1 : 0.085) * g, 0.055, UP, 10), coat, 0, -UP / 2, 0, top);
    const knee = J[name + 'k'] = joint(top, 0, -UP, 0);
    mesh(new THREE.SphereGeometry(0.058, 8, 6), coat, 0, 0, 0, knee);
    mesh(new THREE.CylinderGeometry(0.045, 0.04, LOW, 8), points, 0, -LOW / 2, 0, knee);
    mesh(new THREE.SphereGeometry(0.05, 8, 6), points, 0, -LOW, 0, knee);                                     // boleto
    hooves.push(mesh(new THREE.CylinderGeometry(0.052, 0.064, 0.08, 10), M.hoof, 0, -LOW - 0.05, -0.01, knee)); // casco
  }

  // ---- cavaleiro (rig humano em metros, sentado no dorso) ----
  let rider = null;
  if (P.rider) {
    rider = buildHuman(THREE, M, P.rider, { meters: true });
    // o assento acompanha o dorso (porte e grossura); o cavaleiro volta ao tamanho real (1 / porte)
    rider.group.scale.setScalar(1 / B.size);
    rider.group.position.set(SEAT[0], SEAT[1] + 0.3 * (g - 1) - 0.92 / B.size, SEAT[2]);
    J.body.add(rider.group);
  }
  return { group, joints: J, rider, hooves };
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
    // para o bake medir passada e topo (scripts/bake/measure.mjs): os cascos e as armas finas do cavaleiro
    group: rig.group, feet: rig.hooves, thin: rig.rider?.thin ?? [],
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
