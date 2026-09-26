// Rig de cerco (docs/ART.md §1.8, Etapa 4): máquinas de madeira, corda e bronze sobre rodas, com pivôs animados pelas
// poses de `art/poses/siege.json`:
//   root   posição/rotação (balanço ao rodar, tombo na morte) · body  inclinação do chassi
//   wheel  giro de TODAS as rodas (x, graus; 8 raios: 30° por quadro já lê como rolar sem o efeito estroboscópico)
//   arm    braço de arremesso (petróbolo: torção; helépole: o braço da catapulta do último andar)
//   shutter portinhola do último andar (helépole) · winch  sarilho (petróbolo)
//   escalares: `stone` (≥ 0,5 = pedra na colher) e `collapse` (0–1: peças soltas caem e se espalham, na morte)
// Estilos (`source.params.style`):
//   petrobolos — litóbolo de torção (um braço) num carro de 4 rodas: feixe de corda torcida entre as longarinas, braço
//                com colher e pedra, batente acolchoado (almofada na cor do time envolvendo a travessa) num cavalete à
//                frente, sarilho atrás, flâmula de time. Disparo = o braço sobe de deitado para trás até bater no batente.
//   helepolis  — torre de assalto de 3 andares (≈ 3,5 m + estandarte) sobre 4 rodas maciças, paredes cobertas de couro cru, vigas e
//                cantos de madeira, janelas com portinholas na frente (as do último andar na cor do time), porta atrás,
//                ameias de madeira com uma sanefa de couro tingido na cor do time em volta do topo e estandarte de time;
//                disparo = a portinhola de cima abre e o braço sai pela janela.
// Metros, frente (para onde atira) em −z, rodas no chão (y = 0). O grupo externo converte para tiles.

import { M2T, dirYaw } from '../camera.js';
import { poseAt } from './human.js';

export const JOINTS = ['root', 'body', 'wheel', 'arm', 'shutter', 'winch'];
export const SCALARS = ['stone', 'collapse'];
export const KIT = { style: ['petrobolos', 'helepolis'] };
const DEG = Math.PI / 180;

export function buildSiege(THREE, M, params = {}) {
  const P = { style: 'petrobolos', ...params };
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const joint = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const box = (w, h, d, mat, x, y, z, parent) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  /** Viga de a até b (m) com seção s. */
  const beam = (a, b, s, mat, parent) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
    const m = mesh(new THREE.BoxGeometry(s, d.length(), s), mat, 0, 0, 0, parent);
    m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  };

  const group = new THREE.Group();
  const rig = new THREE.Group(); rig.scale.setScalar(M2T); group.add(rig);
  const J = {};
  J.root = joint(rig, 0, 0, 0);
  J.body = joint(J.root, 0, 0, 0);
  const wheels = [];
  /** Peças que se soltam na morte: deslocamento/rotação finais (escalados por `collapse`). */
  const loose = [];
  const breakable = (o, dx, dy, dz, rx = 0, rz = 0) => { loose.push({ o, p: o.position.clone(), r: o.rotation.clone(), dx, dy, dz, rx, rz }); return o; };
  /** Roda de raio r em (x, y = r, z), eixo em x; `solid` = disco de tábuas (helépole) em vez de raios. */
  const wheel = (x, z, r, solid = false) => {
    const w = joint(J.body, x, r, z);
    const spin = new THREE.Group(); w.add(spin); wheels.push(spin);
    if (solid) {
      mesh(new THREE.CylinderGeometry(r, r, 0.14, 20), M.woodDark, 0, 0, 0, spin).rotation.z = Math.PI / 2;
      for (let i = 0; i < 4; i++) { const b = box(0.15, r * 1.9, 0.04, M.wood, Math.sign(x) * 0.075, 0, 0, spin); b.rotation.x = (i * Math.PI) / 4; }
      mesh(new THREE.TorusGeometry(r - 0.02, 0.03, 6, 20), M.iron, Math.sign(x) * 0.072, 0, 0, spin).rotation.y = Math.PI / 2;
    } else {
      mesh(new THREE.TorusGeometry(r - 0.04, 0.045, 6, 20), M.wood, 0, 0, 0, spin).rotation.y = Math.PI / 2;   // aro
      mesh(new THREE.TorusGeometry(r - 0.005, 0.02, 5, 20), M.iron, 0, 0, 0, spin).rotation.y = Math.PI / 2;   // calço de ferro
      for (let i = 0; i < 4; i++) { const s = box(0.04, 2 * (r - 0.05), 0.05, M.woodDark, 0, 0, 0, spin); s.rotation.x = (i * Math.PI) / 4; } // 8 raios
      mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 10), M.woodDark, 0, 0, 0, spin).rotation.z = Math.PI / 2; // cubo
    }
    return w;
  };

  if (P.style === 'petrobolos') {
    // chassi: longarinas, travessas e rodas
    for (const s of [-1, 1]) box(0.16, 0.2, 2.5, M.wood, s * 0.5, 0.46, 0, J.body);
    for (const z of [-1.12, -0.1, 1.1]) box(1.16, 0.14, 0.16, M.woodDark, 0, 0.44, z, J.body);
    for (const z of [-0.82, 0.82]) {
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8), M.iron, 0, 0.34, z, J.body).rotation.z = Math.PI / 2;   // eixo
      for (const s of [-1, 1]) breakable(wheel(s * 0.68, z, 0.34), s * 0.5, -0.1, 0, 0, s * 1.3);
    }
    // feixe de torção entre as longarinas (corda) com arruelas de bronze
    mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.84, 14), M.rope, 0, 0.62, 0.12, J.body).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), M.bronze, s * 0.46, 0.62, 0.12, J.body).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) box(0.14, 0.34, 0.14, M.woodDark, s * 0.5, 0.66, 0.12, J.body);
    // braço: deitado para trás (+z) em repouso; a colher com a pedra na ponta
    J.arm = joint(J.body, 0, 0.62, 0.12);
    const arm = new THREE.Group(); J.arm.add(arm);
    box(0.12, 0.13, 1.72, M.wood, 0, 0.02, 0.8, arm);
    for (const z of [0.3, 0.9, 1.4]) box(0.15, 0.16, 0.05, M.iron, 0, 0.02, z, arm);
    mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.12, 12), M.woodDark, 0, 0.12, 1.62, arm);                    // colher
    const stone = mesh(new THREE.IcosahedronGeometry(0.13, 1), M.stone, 0, 0.2, 1.62, arm);
    // cavalete do batente à frente, travessa acolchoada (almofada de time) onde o braço bate
    for (const s of [-1, 1]) {
      beam([s * 0.5, 0.54, -0.42], [s * 0.46, 1.7, -0.22], 0.12, M.wood, J.body);
      beam([s * 0.5, 0.54, -1.1], [s * 0.46, 1.62, -0.28], 0.1, M.woodDark, J.body);                         // escora
    }
    const bar = box(1.06, 0.15, 0.15, M.wood, 0, 1.62, -0.2, J.body);
    // almofada de couro na cor do time ENVOLVENDO a travessa (lote distância-cerco): vista de frente, de trás e de cima
    // — é a mancha de time mais alta da máquina (a de antes só aparecia pelas costas)
    const pad = box(0.56, 0.23, 0.27, M.team, 0, 1.61, -0.17, J.body);
    breakable(bar, 0, -1.1, -0.3, 0.8, 0.4); breakable(pad, 0.2, -1.2, -0.2, 1.2, 0);
    // sarilho atrás com as manivelas
    J.winch = joint(J.body, 0, 0.66, 1.02);
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 12), M.woodDark, 0, 0, 0, J.winch).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) { for (let i = 0; i < 2; i++) { const h = box(0.04, 0.5, 0.04, M.wood, s * 0.47, 0, 0, J.winch); h.rotation.x = (i * Math.PI) / 2; } }
    // flâmula de time num mastro no canto traseiro
    beam([0.56, 0.56, 1.18], [0.56, 2.05, 1.18], 0.045, M.woodDark, J.body);
    const flag = box(0.02, 0.34, 0.54, M.team, 0.56, 1.86, 0.91, J.body);
    breakable(flag, 0.3, -1.5, 0.2, 0.5, 1.2);
    breakable(arm, 0, -0.3, 0.2, 0.6, 0.3);   // o grupo de dentro (o pivô J.arm é da pose)
    return finish({ stone });
  }

  if (P.style === 'helepolis') {
    // (lote distância-cerco) um pouco menor que o exemplo da base — 3,5 m + estandarte e base 2,1 × 2,2 m, perto do
    // círculo do jogo (raio 0,5 tile) — para caber no teto de 128 px de unidade a 1× e numa página 2048² a 2×
    const LEVELS = [0.5, 1.52, 2.54, 3.5];   // pisos (m): térreo, 1º, 2º andar, topo (torre ≈ 4,4 m com o estandarte)
    const W0 = 2.1, D0 = 2.2, W1 = 1.6, D1 = 1.66;
    const size = (y) => { const t = (y - LEVELS[0]) / (LEVELS[3] - LEVELS[0]); return [W0 + (W1 - W0) * t, D0 + (D1 - D0) * t]; };
    const WIN = 0.47;                        // altura da janela no andar (fração), abaixo da sanefa do topo
    // chassi e rodas maciças
    box(W0 + 0.2, 0.22, D0 + 0.1, M.woodDark, 0, 0.5, 0, J.body);
    for (const z of [-0.76, 0.76]) for (const s of [-1, 1]) breakable(wheel(s * (W0 / 2 + 0.2), z, 0.42, true), s * 0.3, -0.1, 0, 0, s * 1.4);
    // andares: tronco de pirâmide de 4 lados coberto de couro cru, vigas nos pisos e nos cantos
    const storeys = [];
    for (let i = 0; i < 3; i++) {
      const y0 = LEVELS[i], y1 = LEVELS[i + 1], [w0, d0] = size(y0), [w1, d1] = size(y1);
      const st = new THREE.Group(); J.body.add(st); storeys.push(st);
      const g = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * (w0 / w1), y1 - y0, 4, 1);
      g.rotateY(Math.PI / 4);
      const shell = mesh(g, M.hide, 0, (y0 + y1) / 2, 0, st); shell.scale.set(w1, 1, d1);
      box(w0 + 0.08, 0.14, d0 + 0.08, M.wood, 0, y0 + 0.07, 0, st);                                        // viga do piso
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam([sx * w0 / 2, y0, sz * d0 / 2], [sx * w1 / 2, y1, sz * d1 / 2], 0.13, M.woodDark, st);
      // janela da frente com portinhola (a do último andar é o pivô `shutter`, na cor do time)
      const wy = y0 + (y1 - y0) * WIN, fz = -((d0 + d1) / 4) - 0.02;
      box(0.62, 0.5, 0.06, M.char, 0, wy, fz + 0.03, st);                                                     // vão escuro
      if (i < 2) box(0.58, 0.46, 0.05, M.wood, 0, wy, fz - 0.01, st);
      // térreo: porta de trás (por onde a tropa entra), com o batente de madeira — o que se vê de norte
      if (i === 0) {
        const bz = (d0 + d1) / 4 + 0.03;
        box(0.72, 0.78, 0.05, M.char, 0, y0 + 0.47, bz, st);
        box(0.84, 0.08, 0.07, M.woodDark, 0, y0 + 0.88, bz + 0.01, st);
        for (const sx of [-1, 1]) box(0.07, 0.8, 0.07, M.woodDark, sx * 0.4, y0 + 0.47, bz + 0.01, st);
      }
    }
    // na morte cada andar desaba sobre o de baixo e escorrega um pouco para trás, girando (o de cima vai mais longe);
    // a queda fica dentro da silhueta de pé (caixa do atlas ≤ 128 px a 1×)
    storeys.forEach((st, i) => breakable(st, (i - 1) * 0.12, -0.95 * i, 0.05 + i * 0.08, 0.06 + i * 0.07, (i - 1) * 0.1));
    // topo: plataforma, ameias de madeira, sanefa de couro tingido na cor do time (vista de todo lado) e estandarte
    const [wt, dt] = size(LEVELS[3]);
    const top = new THREE.Group(); J.body.add(top);
    box(wt + 0.14, 0.12, dt + 0.14, M.wood, 0, LEVELS[3] + 0.06, 0, top);
    for (let k = -2; k <= 2; k++) for (const [x, z, w, d] of [[k * wt / 5, -dt / 2, 0.2, 0.08], [k * wt / 5, dt / 2, 0.2, 0.08], [-wt / 2, k * dt / 5, 0.08, 0.2], [wt / 2, k * dt / 5, 0.08, 0.2]]) box(w, 0.3, d, M.woodDark, x, LEVELS[3] + 0.27, z, top);
    const VY = LEVELS[3] - 0.1, VH = 0.26;   // sanefa pendurada na borda da plataforma (acima da janela de cima)
    for (const sz of [-1, 1]) box(wt + 0.2, VH, 0.035, M.team, 0, VY, sz * (dt / 2 + 0.09), top);
    for (const sx of [-1, 1]) box(0.035, VH, dt + 0.2, M.team, sx * (wt / 2 + 0.09), VY, 0, top);
    beam([wt / 2 - 0.15, LEVELS[3], dt / 2 - 0.15], [wt / 2 - 0.15, LEVELS[3] + 0.95, dt / 2 - 0.15], 0.06, M.woodDark, top);
    box(0.02, 0.34, 0.56, M.team, wt / 2 - 0.15, LEVELS[3] + 0.76, dt / 2 - 0.48, top);
    breakable(top, 0.12, -2.85, 0.22, 0.2, 0.16);   // (o giro é em volta do chão: ângulos pequenos)
    // portinhola do último andar (time), articulada em cima; o braço da catapulta sai pela janela ao disparar
    const y2 = LEVELS[2] + (LEVELS[3] - LEVELS[2]) * WIN, [, d2a] = size(LEVELS[2]), [, d2b] = size(LEVELS[3]);
    const fz2 = -((d2a + d2b) / 4) - 0.04;
    J.shutter = joint(storeys[2], 0, y2 + 0.25, fz2);          // no último andar: cai junto na morte
    box(0.62, 0.5, 0.05, M.team, 0, -0.25, 0, J.shutter);
    box(0.64, 0.05, 0.06, M.iron, 0, -0.03, -0.01, J.shutter);
    // em repouso (x = 180°) o braço fica deitado para trás, dentro do andar; no disparo gira por cima até sair pela janela
    J.arm = joint(storeys[2], 0, LEVELS[2] + 0.2, -0.2);
    box(0.1, 0.1, 0.9, M.wood, 0, 0, -0.45, J.arm);
    const stone = mesh(new THREE.IcosahedronGeometry(0.1, 1), M.stone, 0, 0.1, -0.86, J.arm);
    return finish({ stone });
  }
  throw new Error(`estilo de cerco desconhecido: ${P.style}`);

  function finish({ stone }) {
    const post = (pose = {}) => {
      if (stone) stone.visible = (pose.stone ?? 1) >= 0.5;
      const c = Math.max(0, Math.min(1, pose.collapse ?? 0));
      for (const l of loose) {
        l.o.position.set(l.p.x + l.dx * c, l.p.y + l.dy * c, l.p.z + l.dz * c);
        l.o.rotation.set(l.r.x + l.rx * c, l.r.y, l.r.z + l.rz * c);
      }
    };
    return { group, joints: J, wheels, post };
  }
}

/** Aplica a pose do cerco: pivôs (graus), `wheel` gira todas as rodas; a raiz em (0, 0, 0) + pos. */
export function applySiegePose(rig, pose) {
  for (const name of JOINTS) {
    const v = pose[name];
    if (name === 'root') {
      const pos = v?.pos ?? [0, 0, 0], rot = v?.rot ?? [0, 0, 0];
      rig.joints.root.position.set(pos[0], pos[1], pos[2]);
      rig.joints.root.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
    } else if (name === 'wheel') {
      const r = Array.isArray(v) ? v : [0, 0, 0];
      for (const w of rig.wheels) w.rotation.set(r[0] * DEG, 0, 0);
    } else {
      const g = rig.joints[name]; if (!g) continue;
      const r = Array.isArray(v) ? v : [0, 0, 0];
      g.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
    }
  }
}

/** Rig de cerco para o bake: `pose(fr, poses)` com `fr.pose` em poses.main (art/poses/siege.json). */
export function siegeUnit(THREE, M, params) {
  const rig = buildSiege(THREE, M, params);
  return {
    group: rig.group,
    pose(fr, poses) {
      const def = poses.main?.anims?.[fr.pose];
      if (!def) throw new Error(`pose de cerco ${fr.pose} ausente`);
      const p = poseAt(def, fr.frame, fr.frames, JOINTS, SCALARS);
      applySiegePose(rig, p);
      rig.post(p);
      rig.group.rotation.y = dirYaw(fr.dir);
    },
  };
}
