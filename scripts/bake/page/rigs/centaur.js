// CENTAURO (Etapa 6, lote bípedes-espíritos; docs/ART.md Apêndice G): o rig do cavalo (rigs/horse.js) com
// `centaur: true` perde o pescoço e a cabeça e ganha, na cernelha, o TRONCO HUMANO do rig humano vestido com o corpo
// esculpido de rigs/anatomy.js (sem pernas: a cintura entra no peito do cavalo). O kit do tronco vem em `params.rider`
// (arco, aljava, talabarte…) e as poses dele em `source.riderPoses` (art/poses/centaur.json, pivôs do humano) — como o
// cavaleiro, interpoladas no mesmo quadro que as do cavalo; o tronco é filho do corpo do cavalo (acompanha a arfagem do
// galope e cai junto na morte). A emenda homem-cavalo fica sob um pano de time drapeado na cintura (a cor do time à
// vista de todo lado) e o barril leva uma cilha de couro com a faixa de time. Metros, frente em −z.

import { buildHuman } from './human.js';
import { dressBody, addHair } from './anatomy.js';

/** Onde o quadril humano entra no corpo do cavalo (m, no pivô `body`): acima e um pouco atrás do peito. */
const HIP_AT = [0, 0.17, -0.5];
/** O tronco um pouco maior que um homem: sobre o corpo de cavalo, um tronco de 1,8 m parecia de criança. */
const TORSO_SCALE = 1.25;

/**
 * Monta o tronco do centauro em `J.body` do cavalo. `size` = porte do cavalo (o tronco volta ao tamanho humano),
 * `girth` = grossura do cavalo. Devolve um objeto com a interface do rig humano (joints, setAnim, post, thin) e `skin`.
 */
export function centaurTorso(THREE, M, J, P, { size = 1, girth = 1 } = {}) {
  const human = buildHuman(THREE, M, { hair: false, armor: 'bare', ...(P.rider ?? {}) }, { meters: true });
  const body = dressBody(THREE, M, human, { build: 'heroic', bulk: 1.04, tone: 'tan', legs: false, head: 'male' });
  const HJ = human.joints;
  addHair(THREE, HJ.head, M.furV, { style: 'wild', beard: 'full', color: 0x3a291b, seed: 9 });
  // o pano de time na cintura cobre a emenda com o peito do cavalo e cai sobre a cernelha
  body.skirt(0.12, -0.2, M.team, { flare: 1.1, folds: 12, foldAmp: 0.012, jag: 0.04, jagFreq: 6, rings: 7, seed: 4, off: 0.018 });
  body.band(0.12, 0, 0.045, M.leather, { off: 0.03 });
  // talabarte de time (a aljava pendurada nele) por cima do corpo esculpido
  if (P.rider?.sash === 'team') body.band(0.34, 0.72, 0.07, M.team, { edge: M.leather, off: 0.016 });
  // o grupo humano: o quadril (0,92 m) no ponto HIP_AT do corpo do cavalo, no tamanho humano (desfaz o porte)
  human.group.scale.setScalar(TORSO_SCALE / size);
  human.group.position.set(HIP_AT[0], HIP_AT[1] * girth - 0.92 * TORSO_SCALE / size, HIP_AT[2]);
  J.body.add(human.group);
  // cilha de couro em volta do barril com a faixa de time (o time também à vista de costas e de lado)
  const cg = new THREE.Group(); cg.position.set(0, 0, -0.16); J.body.add(cg);
  const R = 0.3 * girth + 0.012;
  for (const [dz, r, mat] of [[0, 0.028, M.team], [-0.04, 0.012, M.leather], [0.04, 0.012, M.leather]]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(R + 0.006, r, 6, 28), mat); t.position.z = dz; t.castShadow = t.receiveShadow = true; cg.add(t);
  }
  return { ...human, body, skin: body.skin };
}
