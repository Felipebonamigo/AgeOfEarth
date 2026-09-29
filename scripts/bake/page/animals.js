// Animais de caça (Etapa 9 do visual, docs/ART.md Apêndice I): cervo e javali esculpidos com as ferramentas orgânicas das
// criaturas (rigs/organic.js) — tronco de esfera deformada (peito fundo, cintura, garupa), pelagem por cor de vértice
// (dorso escuro → barriga clara, espelho branco do cervo, lista do lombo), pernas afuniladas com joelho e jarrete, cascos,
// pescoço e cabeça, orelhas, galhada ramificada (cervo) e focinho, presas e crina de cerdas (javali). Estáticos (o nó
// não anda): o cervo pasta nas direções 2 e 6 (cabeça baixa). METROS, frente em −z, patas em y = 0; o chamador gira para a
// direção e converte para tiles. Sem Math.random.

import { sculpt, shaggy, paint, mix, mottle, smooth, taperTube } from './rigs/organic.js';

function mesh(THREE, parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
/** Perna afunilada do ombro/anca (x, yTop, z) ao casco, com a junta do meio deslocada em z por `bend` (m). */
function leg(THREE, parent, mat, hoofMat, x, yTop, z, bend, rTop, rLow) {
  const pts = [[x, yTop, z], [x, yTop * 0.62, z + bend * 0.6], [x, yTop * 0.3, z + bend], [x, 0.06, z + bend * 0.7]];
  mesh(THREE, parent, taperTube(THREE, pts, rTop, rLow, { tubular: 12, radial: 8 }), mat);
  mesh(THREE, parent, new THREE.CylinderGeometry(rLow * 1.05, rLow * 1.35, 0.07, 8), hoofMat, x, 0.035, z + bend * 0.7);
}

/** Cervo (Cervus elaphus): 1,5 m de comprimento, 1,05 m na cernelha; galhada de 3–4 pontas. `graze` = cabeça baixa. */
export function buildDeer(THREE, M, graze = false) {
  const g = new THREE.Group();
  const coat = (x, y, z) => {
    // dorso castanho-avermelhado → flancos → barriga clara; espelho branco na garupa; lista escura no lombo
    const back = 0x7a4a2a, side = 0x9a643a, belly = 0xdcccae;
    let c = mix(side, back, smooth(0.08, 0.2, y) + smooth(0.15, 0.02, Math.abs(x)) * smooth(0.12, 0.24, y) * 0.6);
    c = mix(c, belly, smooth(-0.05, -0.2, y));
    c = mix(c, 0xeee6d6, smooth(0.5, 0.66, z) * smooth(-0.1, 0.1, y) * 0.9);   // espelho
    return mottle(c, 0.07, x, y, z, 7, 3);
  };
  // tronco
  const body = sculpt(new THREE.SphereGeometry(1, 28, 18), (x, y, z) => {
    const front = smooth(0.2, -0.8, z);                          // peito fundo na frente
    const hy = 0.26 + 0.05 * front - 0.04 * smooth(-0.1, 0.5, z) * (y < 0 ? 1 : 0);   // barriga recolhida atrás
    return [x * (0.2 + 0.03 * front), y * hy + (y < 0 ? -0.03 * front : 0), z * 0.68];
  });
  paint(THREE, body, coat);
  mesh(THREE, g, body, M.furV, 0, 1.0, 0);
  // pescoço e cabeça
  const neckEnd = graze ? [0, 0.62, -1.05] : [0, 1.52, -0.86];
  const neck = taperTube(THREE, [[0, 1.08, -0.5], [0, graze ? 1.0 : 1.3, -0.72], neckEnd], 0.13, 0.075, { tubular: 12, radial: 10 });
  paint(THREE, neck, (x, y, z) => mottle(0x8a5634, 0.06, x, y, z, 7, 5));
  mesh(THREE, g, neck, M.furV);
  const head = new THREE.Group(); head.position.set(...neckEnd); head.rotation.x = graze ? 0.9 : 0.25; g.add(head);
  const skull = sculpt(new THREE.SphereGeometry(1, 16, 12), (x, y, z) => [x * 0.075 * (z < 0 ? 0.75 : 1), y * 0.085 * (z < 0 ? 0.8 : 1), z * 0.16]);
  paint(THREE, skull, (x, y, z) => (z < -0.12 ? 0x2e241c : mix(0x8a5a36, 0xd8c8aa, smooth(0, -0.07, y))));
  mesh(THREE, head, skull, M.furV, 0, 0, -0.08);
  for (const s of [-1, 1]) {
    const ear = mesh(THREE, head, new THREE.ConeGeometry(0.035, 0.13, 6), M.fur, s * 0.07, 0.07, 0.02); ear.rotation.z = -s * 1.0; ear.rotation.x = -0.3;
    // galhada: haste curva para cima e para trás com 3 pontas
    const base = [s * 0.04, 0.07, 0.03], tip = [s * 0.2, 0.42, 0.14];
    mesh(THREE, head, taperTube(THREE, [base, [s * 0.1, 0.2, 0.0], [s * 0.16, 0.32, 0.06], tip], 0.018, 0.008, { tubular: 10, radial: 6 }), M.horn);
    for (const [t0, dz, dy] of [[[s * 0.1, 0.2, 0.0], -0.12, 0.08], [[s * 0.15, 0.3, 0.05], -0.08, 0.12]]) {
      mesh(THREE, head, taperTube(THREE, [t0, [t0[0] + s * 0.02, t0[1] + dy * 0.6, t0[2] + dz * 0.6], [t0[0] + s * 0.03, t0[1] + dy, t0[2] + dz]], 0.012, 0.005, { tubular: 6, radial: 5 }), M.horn);
    }
  }
  // pernas finas: dianteiras quase retas, traseiras com o jarrete para trás
  for (const s of [-1, 1]) {
    leg(THREE, g, M.fur, M.hoof, s * 0.1, 0.86, -0.42, 0.04, 0.06, 0.024);
    leg(THREE, g, M.fur, M.hoof, s * 0.1, 0.92, 0.44, -0.1, 0.075, 0.026);
  }
  // cauda curta e clara
  const tail = mesh(THREE, g, new THREE.ConeGeometry(0.045, 0.16, 6), M.linenDark, 0, 1.08, 0.7); tail.rotation.x = 2.5;
  return g;
}

/** Javali (Sus scrofa): 1,35 m, 0,8 m na cernelha, espáduas altas com crina de cerdas, focinho em cunha e presas. */
export function buildBoar(THREE, M) {
  const g = new THREE.Group();
  const coat = (x, y, z) => {
    let c = mix(0x6a5846, 0x3e3226, smooth(0.05, 0.25, y));     // pardo-acinzentado, dorso escuro
    c = mix(c, 0x857060, smooth(-0.05, -0.25, y) * 0.5);
    return mottle(c, 0.12, x, y, z, 10, 9);
  };
  const body = sculpt(new THREE.SphereGeometry(1, 28, 18), (x, y, z) => {
    const front = smooth(0.4, -0.7, z);                          // espáduas altas e cheias, garupa baixa
    return [x * (0.23 + 0.05 * front), y * (0.25 + 0.08 * front) + 0.05 * front * (y > 0 ? 1 : 0), z * 0.62];
  });
  shaggy(body, 0.018, 14, 4);
  paint(THREE, body, coat);
  mesh(THREE, g, body, M.furV, 0, 0.58, 0);
  // crina de cerdas no alto das espáduas
  const mane = sculpt(new THREE.CylinderGeometry(0.03, 0.06, 0.62, 8, 4), (x, y, z) => [x, y, z]);
  shaggy(mane, 0.02, 20, 7); paint(THREE, mane, () => 0x2a2018);
  const mn = mesh(THREE, g, mane, M.furV, 0, 0.9, -0.15); mn.rotation.x = Math.PI / 2 - 0.25;
  // cabeça em cunha com o focinho, orelhas e presas
  const head = new THREE.Group(); head.position.set(0, 0.56, -0.62); head.rotation.x = 0.35; g.add(head);
  const skull = sculpt(new THREE.CylinderGeometry(0.05, 0.16, 0.42, 10, 3), (x, y, z) => [x, y, z * 0.8]);
  skull.rotateX(-Math.PI / 2);
  paint(THREE, skull, (x, y, z) => mottle(z < -0.16 ? 0x4a3c30 : 0x5a4a3a, 0.1, x, y, z, 12, 2));
  mesh(THREE, head, skull, M.furV, 0, 0, -0.14);
  mesh(THREE, head, new THREE.CylinderGeometry(0.055, 0.055, 0.03, 10), M.hoof, 0, 0, -0.36).rotation.x = Math.PI / 2;   // disco do focinho
  for (const s of [-1, 1]) {
    const ear = mesh(THREE, head, new THREE.ConeGeometry(0.04, 0.12, 6), M.furDark, s * 0.09, 0.12, 0.02); ear.rotation.z = -s * 0.5;
    const tusk = mesh(THREE, head, taperTube(THREE, [[s * 0.05, -0.02, -0.28], [s * 0.08, 0.02, -0.3], [s * 0.08, 0.07, -0.27]], 0.012, 0.004, { tubular: 6, radial: 5 }), M.horn);
    tusk.castShadow = false;
  }
  // pernas curtas e fortes
  for (const s of [-1, 1]) {
    leg(THREE, g, M.furDark, M.hoof, s * 0.12, 0.5, -0.36, 0.03, 0.075, 0.032);
    leg(THREE, g, M.furDark, M.hoof, s * 0.12, 0.52, 0.38, -0.06, 0.085, 0.034);
  }
  const tail = mesh(THREE, g, taperTube(THREE, [[0, 0.66, 0.6], [0, 0.55, 0.66], [0, 0.45, 0.66]], 0.015, 0.008, { tubular: 6, radial: 5 }), M.furDark);
  tail.castShadow = false;
  return g;
}
