// Sonda do rig do quadrúpede em Node para tests/art-feras.test.ts (lote feras da Etapa 6): monta o rig de um manifesto
// com o three.js — sem navegador e sem renderizar, como scripts/bake/measure.mjs —, aplica uma pose e devolve pontos do
// modelo em METROS (x = direita, y = altura, z = −frente; o bicho olhando para −z): as cabeças, os olhos, a ponta da
// cauda, as pontas das asas e o topo do dorso. Serve para conferir a forma que a folha de contato mostra (três cabeças
// separadas, cauda armada sobre o dorso, asas dobradas × abertas, boca aberta no sopro) sem depender de pixels.
import * as THREE from 'three';
import { createMaterials } from '../scripts/bake/page/materials.js';
import { buildBeast, applyBeastPose, JOINTS, SCALARS } from '../scripts/bake/page/rigs/beast.js';
import { poseAt } from '../scripts/bake/page/rigs/human.js';
import { M2T } from '../scripts/bake/page/camera.js';

let M = null;
const v = new THREE.Vector3();
/** Posição de um objeto no espaço do grupo externo, em metros. */
const at = (root, o) => { root.updateMatrixWorld(true); o.getWorldPosition(v); return { x: v.x / M2T, y: v.y / M2T, z: v.z / M2T }; };

/**
 * `params` do manifesto (source.params), a definição da animação (poses.main.anims[pose]) e o quadro. Devolve
 * { heads, jaws, eyes, tailTip, wingTips (pulsos), wingEnds (pontas), backTop, jawOpen } (metros; jawOpen em graus).
 */
export function probeBeast(params, def, frame, frames) {
  M ??= createMaterials(THREE);
  const rig = buildBeast(THREE, M, params);
  const pose = poseAt(def, frame, frames, JOINTS, SCALARS);
  applyBeastPose(rig, pose);
  const g = rig.group;
  const heads = rig.joints.head.map((h) => at(g, h));
  const jaws = rig.joints.jaw.map((j) => at(g, j));
  const eyes = [];
  g.traverse((o) => { if (o.isMesh && o.material?.emissive && o.material.emissive.getHex() !== 0 && o.geometry.type === 'SphereGeometry' && o.geometry.parameters.radius < 0.05) eyes.push(at(g, o)); });
  // ponta da cauda: o último filho do tail3 (o pivô da ponta)
  const tail3 = rig.joints.tail3;
  const tipJ = tail3.children.find((c) => c.isGroup && !c.isMesh);
  const tailTip = at(g, tipJ ?? tail3);
  const wingTips = rig.wings ? rig.wings.sides.map((sd) => at(g, sd.tip)) : [];
  // ponta da asa: o fim do dedo mais longo (a mão tem 0,6 da envergadura de 1,8 m do rig: rigs/beast.js → wings.js)
  const wingEnds = rig.wings ? rig.wings.sides.map((sd) => { g.updateMatrixWorld(true); const q = sd.tip.localToWorld(new THREE.Vector3(sd.s * 1.08, 0, 0)); return { x: q.x / M2T, y: q.y / M2T, z: q.z / M2T }; }) : [];
  // topo do dorso: o ponto mais alto do tronco (as malhas das duas metades do corpo, sem pescoço/cauda/asas)
  let backTop = -Infinity;
  for (const half of [rig.joints.body, rig.joints.hips]) for (const o of half.children) if (o.isMesh) {
    const pos = o.geometry.attributes.position; o.updateMatrixWorld(true);
    for (let i = 0; i < pos.count; i += 7) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); backTop = Math.max(backTop, v.y / M2T); }
  }
  return { heads, jaws, eyes, tailTip, wingTips, wingEnds, backTop, jawOpen: pose.jaw?.[0] ?? 0 };
}
