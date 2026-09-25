// Edifícios paramétricos (docs/ART.md §1.8 e §4). Por enquanto só o templo 3×3 (6×6 m): estilóbato de 3 degraus,
// 20 colunas dóricas (6 por lado), cela com porta, entablamento com friso, frontão voltado para o SUL (de frente para a
// câmera) e telhado de terracota de duas águas. Obra em 3 estágios (`stage` 0/1/2 = progresso < 33 / 66 / 100 %) por
// altura + andaimes de madeira; `stage` 3 = completo, com dois estandartes na cor do time à frente da escadaria.
// Modelado em METROS com a origem no CENTRO da área ocupada (a posição x/y do edifício no jogo) e o chão em y = 0.

import { M2T } from './camera.js';

/** Constrói `style` (hoje: 'temple') no estágio `params.stage` (0–3). Devolve um grupo em tiles. */
export function buildBuilding(THREE, M, style, params = {}) {
  if (style !== 'temple') throw new Error(`edifício desconhecido: ${style}`);
  const stage = params.stage ?? 3;
  const group = new THREE.Group();
  const r = new THREE.Group(); r.scale.setScalar(M2T); group.add(r);
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = r) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, parent) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);

  // ---- estilóbato: completo desde o estágio 1; no estágio 0 só o degrau de baixo + blocos soltos ----
  box(6.0, 0.15, 6.0, M.marbleDark, 0, 0.075, 0);
  if (stage >= 1) { box(5.6, 0.15, 5.6, M.marble, 0, 0.225, 0); box(5.2, 0.15, 5.2, M.marble, 0, 0.375, 0); }
  else { box(5.6, 0.15, 3.2, M.marble, 0, 0.225, -1.2); }
  const base = stage >= 1 ? 0.45 : 0.3;
  const colH = 2.4;
  const colFrac = [0.22, 0.55, 1, 1][stage];           // altura das colunas por estágio

  // ---- colunas (6 por lado, 20 no total) ----
  const cols = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    if (i > 0 && i < 5 && j > 0 && j < 5) continue;
    cols.push([-2.25 + i * 0.9, -2.25 + j * 0.9]);
  }
  cols.forEach(([x, z], k) => {
    // no estágio 0 só metade das bases de coluna existe (obra começando pelo fundo)
    if (stage === 0 && z > 0.5 && k % 2) return;
    const h = colH * colFrac;
    mesh(new THREE.CylinderGeometry(0.15, 0.18, h, 14), M.marble, x, base + h / 2, z);
    if (stage >= 2) {
      mesh(new THREE.CylinderGeometry(0.21, 0.16, 0.12, 14), M.marble, x, base + colH - 0.02, z);    // equino
      box(0.42, 0.1, 0.42, M.marble, x, base + colH + 0.05, z);                                   // ábaco
    }
  });

  // ---- cela (paredes internas) ----
  const cellaH = colH * [0.15, 0.5, 1, 1][stage];
  box(3.0, cellaH, 3.9, M.marble, 0, base + cellaH / 2, -0.15);
  if (stage >= 2) box(0.8, 1.7, 0.08, M.woodDark, 0, base + 0.85, 1.83);                          // porta ao sul

  const top = base + colH + 0.1;
  // ---- entablamento e telhado ----
  if (stage >= 2) {
    box(5.3, 0.26, 5.3, M.marble, 0, top + 0.13, 0);                                              // arquitrave
    box(5.32, 0.2, 5.32, M.marbleDark, 0, top + 0.36, 0);                                         // friso
    for (let i = 0; i < 12; i++) box(0.1, 0.16, 0.04, M.marble, -2.48 + i * 0.45, top + 0.36, 2.67); // tríglifos (sul)
  }
  const eaves = top + 0.46;
  const roofH = 1.05, halfW = 2.75, len = 5.7;
  if (stage === 2) {
    // estrutura do telhado em madeira (caibros), sem telhas
    const slope = Math.sqrt(halfW * halfW + roofH * roofH), ang = Math.atan2(roofH, halfW);
    for (let k = 0; k < 7; k++) {
      const z = -len / 2 + 0.2 + k * ((len - 0.4) / 6);
      for (const s of [-1, 1]) { const b = box(slope, 0.08, 0.08, M.wood, s * halfW / 2, eaves + roofH / 2, z); b.rotation.z = -s * ang; }
    }
    box(0.1, 0.1, len, M.wood, 0, eaves + roofH, 0);                                              // cumeeira
  }
  if (stage === 3) {
    const tri = new THREE.Shape(); tri.moveTo(-halfW, 0); tri.lineTo(halfW, 0); tri.lineTo(0, roofH); tri.closePath();
    mesh(new THREE.ExtrudeGeometry(tri, { depth: len, bevelEnabled: false }), M.marble, 0, eaves, -len / 2);   // frontões
    mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.06, bevelEnabled: false }), M.marbleDark, 0, eaves + 0.02, len / 2 - 0.02).scale.set(0.82, 0.72, 1); // tímpano (sombra interna)
    const slope = Math.sqrt(halfW * halfW + roofH * roofH), ang = Math.atan2(roofH, halfW);
    for (const s of [-1, 1]) {
      const slab = box(slope + 0.25, 0.1, len + 0.3, M.terracotta, s * halfW / 2, eaves + roofH / 2 + 0.05, 0);
      slab.rotation.z = -s * ang;
      for (let k = 1; k < 7; k++) box(0.05, 0.05, len + 0.3, M.terracottaDark, -slope / 2 + k * slope / 7, 0.07, 0, slab); // fileiras de telhas
    }
    box(0.16, 0.12, len + 0.3, M.terracottaDark, 0, eaves + roofH + 0.05, 0);                     // cumeeira
    box(5.4, 0.12, 0.22, M.marbleDark, 0, eaves - 0.02, len / 2 + 0.06);                          // cornija do frontão (sul)
    // estandartes de time à frente da escadaria (máscara de time)
    for (const s of [-1, 1]) {
      const x = s * 1.1, z = 2.95;
      mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.4, 8), M.wood, x, 1.2, z);
      box(0.5, 0.8, 0.03, M.team, x + s * 0.27, 1.95, z);
      mesh(new THREE.SphereGeometry(0.06, 8, 6), M.gold, x, 2.43, z);
    }
  }

  // ---- andaimes (estágios 0–2): postes e tábuas de madeira em volta da obra ----
  if (stage <= 2) {
    const sh = [1.3, 2.4, 3.6][stage];
    const posts = [];
    for (let i = 0; i < 4; i++) posts.push([-2.85 + i * 1.9, 2.95], [-2.85 + i * 1.9, -2.95]);
    for (const zz of [-1, 1]) posts.push([-2.95, zz * 0.95], [2.95, zz * 0.95]);
    for (const [x, z] of posts) mesh(new THREE.CylinderGeometry(0.04, 0.05, sh, 6), M.wood, x, sh / 2, z);
    for (let lvl = 1; lvl * 1.1 < sh; lvl++) {
      const y = lvl * 1.1;
      box(5.9, 0.05, 0.25, M.wood, 0, y, 2.95); box(5.9, 0.05, 0.25, M.wood, 0, y, -2.95);
      box(0.25, 0.05, 5.9, M.wood, -2.95, y, 0); box(0.25, 0.05, 5.9, M.wood, 2.95, y, 0);
    }
    // diagonais de travamento na face sul
    for (let i = 0; i < 3; i++) { const b = box(0.04, Math.min(sh, 2.2) * 1.2, 0.04, M.woodDark, -1.9 + i * 1.9, Math.min(sh, 2.2) / 2, 3.0); b.rotation.z = 0.7; }
    // blocos de mármore e cordas no canteiro (sudeste)
    box(0.6, 0.4, 0.4, M.marble, 2.2, 0.2, 3.5); box(0.5, 0.35, 0.4, M.marbleDark, 1.5, 0.175, 3.6);
    if (stage === 0) { box(0.7, 0.4, 0.45, M.marble, -2.0, 0.2, 3.5); mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.8, 12), M.marble, 2.4, 0.17, 1.5).rotation.z = Math.PI / 2; }
    // bandeirola de time no alto do andaime (mostra de quem é a obra)
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), M.wood, -2.85, sh + 0.45, 2.95);
    box(0.45, 0.28, 0.03, M.team, -2.6, sh + 0.72, 2.95);
  }
  return group;
}
