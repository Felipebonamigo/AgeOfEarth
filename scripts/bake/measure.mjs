// Medidas de unidade tiradas do PRÓPRIO rig do bake (revisão da Etapa 4), em Node com o three.js, sem navegador e sem
// renderizar: entram no índice public/art/manifest.json (bake.mjs, `packAll`) e são conferidas por art:check e pelos testes.
//
//   passada (`anims.<walk|run|carry>.stride`, tiles por ciclo): quanto o chão anda sob a unidade num ciclo da animação —
//     o pé (ou casco) de apoio recua em relação ao corpo; a soma do recuo dele quadro a quadro é o avanço do corpo. Nas
//     máquinas de cerco é o raio da roda × o giro do ciclo. O renderizador avança o quadro pela DISTÂNCIA andada
//     (quadros = distância / passada × quadros do ciclo): o pé não desliza em nenhuma velocidade (formação, lentidão,
//     melhorias).
//   topo do corpo por direção (`tops`, px a 1× acima do pé): o ponto mais alto da silhueta do parado sem as armas e itens
//     finos (lança, xyston, dardos, arco, cetro, mastro e estandarte do cerco) — régua da barra de vida (a cabeça do
//     cavalo e as ameias da helépole sobem o topo em algumas direções; a lança não conta).
//
// A câmera do contrato (camera.js) projeta o ponto (x, y, z) do mundo — tiles, y = altura, +z = sul — em
// (x, −(y · VERTICAL_FACTOR − z)) tiles a partir do pé: o topo na tela é o máximo de y · VF − z.

import * as THREE from 'three';
import { createMaterials } from './page/materials.js';
import { UNIT_RIGS } from './page/rigs/units.js';
import { PX_PER_TILE, VERTICAL_FACTOR, dirYaw } from './page/camera.js';
import { poseAt } from './page/rigs/human.js';

/** Animações em que a unidade se desloca (o quadro avança pela distância andada). */
export const MOVE_ANIMS = ['walk', 'run', 'carry'];

let M = null;
const materials = () => (M ??= createMaterials(THREE));

/** Cadeia de pais visível (itens escondidos pela animação — cesto, machado — não contam) e fora dos itens finos. */
function counts(o, thin) {
  for (let p = o; p; p = p.parent) { if (!p.visible || thin.has(p)) return false; }
  return true;
}

const tmp = new THREE.Vector3();
/** Ponto mais alto na tela (tiles acima do pé) de todas as malhas visíveis fora de `thin`. */
function screenTop(root, thin) {
  root.updateMatrixWorld(true);
  let top = -Infinity;
  root.traverse((o) => {
    if (!o.isMesh || !counts(o, thin)) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      tmp.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const up = tmp.y * VERTICAL_FACTOR - tmp.z;
      if (up > top) top = up;
    }
  });
  return top;
}

/** Altura (tiles) até onde um pé/casco conta como apoiado no chão: ≈ 2,5 px a 1× — o que ainda se lê "no chão" a zoom 1–2,2
 *  (o casco que pousa ou decola no galope entra; o que balança no alto, não). */
const GROUND_EPS = 0.08;

/** Ponto mais baixo (altura, tiles) de uma malha e o centro dela (z) no espaço do modelo. */
function footSample(o) {
  const pos = o.geometry.attributes.position;
  let y = Infinity;
  for (let i = 0; i < pos.count; i++) { tmp.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); if (tmp.y < y) y = tmp.y; }
  return { y, z: new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).z };
}

/**
 * Passada (tiles por ciclo) de uma animação em loop: com a unidade virada para −z (sem giro), em cada par de quadros
 * consecutivos o apoio é o pé (casco) APOIADO nos dois (a ≤ GROUND_EPS do chão) que mais recua — nas poses o pé que
 * balança mal sai do chão na troca de apoio, e o que recua é o que carrega o corpo. O recuo médio do apoio por quadro
 * (pares sem apoio — a fase no ar do galope — ficam fora) × quadros do ciclo = o que o corpo avança num ciclo.
 * Rodas: raio × giro do ciclo.
 */
function strideOf(unit, anim, a, poses) {
  const n = a.frames;
  const at = (i) => {
    unit.pose({ anim, pose: a.pose, rider: a.rider, dir: 0, frame: i % n, frames: n, loop: true }, poses);
    unit.group.rotation.y = 0;   // espaço do modelo: frente em −z
    unit.group.updateMatrixWorld(true);
  };
  if (unit.wheels?.length && unit.wheelRadius > 0) {
    // giro acumulado do ciclo (graus da pose; o último par fecha em t = 1, que é o quadro 0 do ciclo seguinte)
    const def = poses.main.anims[a.pose];
    let turn = 0;
    for (let i = 0; i < n; i++) turn += (poseAt(def, i + 1, n, ['wheel'], []).wheel?.[0] ?? 0) - (poseAt(def, i, n, ['wheel'], []).wheel?.[0] ?? 0);
    return unit.wheelRadius * Math.abs(turn) * Math.PI / 180;
  }
  const feet = unit.feet ?? [];
  if (!feet.length) return 0;
  const samples = [];
  for (let i = 0; i < n; i++) { at(i); samples.push(feet.map((f) => footSample(f))); }
  const planted = [];
  for (let i = 0; i < n; i++) {
    const A = samples[i], B = samples[(i + 1) % n];
    let back = -Infinity;
    for (let k = 0; k < feet.length; k++) if (Math.max(A[k].y, B[k].y) <= GROUND_EPS) back = Math.max(back, B[k].z - A[k].z);
    if (back > -Infinity) planted.push(back);
  }
  if (!planted.length) return 0;
  return (planted.reduce((x, y) => x + y, 0) / planted.length) * n;
}

/**
 * Medidas de um manifesto de unidade paramétrico: `{ strides: { anim: tiles }, tops: [8 px a 1×] }` ou null (glb, rig
 * sem registro). `poses` = { main, rider } já lidos (os mesmos que o bake manda à página).
 */
export function measureUnit(m, poses) {
  const s = m?.source;
  if (m?.kind !== 'unit' || s?.type !== 'param' || !UNIT_RIGS[s.rig]) return null;
  const unit = UNIT_RIGS[s.rig](THREE, materials(), s.params ?? {});
  const thin = new Set(unit.thin ?? []);
  const strides = {};
  for (const anim of MOVE_ANIMS) {
    const a = m.anims?.[anim];
    if (!a || a.loop === false) continue;
    strides[anim] = Math.round(strideOf(unit, anim, a, poses) * 1000) / 1000;
  }
  const idle = m.anims.idle;
  const tops = [];
  for (let d = 0; d < 8; d++) {
    let t = -Infinity;
    for (let i = 0; i < idle.frames; i++) {
      unit.pose({ anim: 'idle', pose: idle.pose, rider: idle.rider, dir: d, frame: i, frames: idle.frames, loop: true }, poses);
      unit.group.rotation.y = dirYaw(d);
      t = Math.max(t, screenTop(unit.group, thin));
    }
    tops.push(Math.round(t * PX_PER_TILE * 10) / 10);
  }
  return { strides, tops };
}
