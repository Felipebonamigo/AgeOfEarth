// MEDUSA (Etapa 6, lote bípedes-espíritos; docs/ART.md Apêndice G): o tronco da górgona no rig da serpente
// (rigs/serpent.js, `form: 'medusa'`) — o rig humano vestido com o corpo esculpido FEMININO de rigs/anatomy.js (pele
// verde-acinzentada, sem pernas: a cintura sai do peito da serpente), a cabeleira de serpentes, os olhos que brilham
// (o olhar que petrifica; a estátua da vítima é o efeito da Etapa 5), a faixa do peplo e o pano drapeado na cintura na
// cor do time (à vista de todo lado, cobrindo a emenda com as escamas), braçadeiras de ouro e o kit humano de
// `params.torso` (arco, aljava, talabarte). O tronco fica EM PÉ qualquer que seja o erguer do peito da serpente
// (`upright`, chamado depois da pose do corpo) e tomba junto com o `roll` da morte. Metros, frente em −z.

import { buildHuman } from './human.js';
import { dressBody, addHair } from './anatomy.js';

/** Escala do tronco sobre a serpente (a górgona é maior que um homem). */
const TORSO_SCALE = 1.5;

/**
 * Monta o tronco em `chest` (o fim do peito da serpente, raio `F.r`). Devolve um objeto com a interface do rig
 * humano (joints, setAnim, post, thin), `skin` e `upright(rollG)`.
 */
export function medusaTorso(THREE, M, chest, P, F) {
  const human = buildHuman(THREE, M, { hair: false, armor: 'bare', ...(P.torso ?? {}) }, { meters: true });
  const body = dressBody(THREE, M, human, { build: 'female', tone: 'gorgon', legs: false, head: 'female' });
  const J = human.joints;
  addHair(THREE, J.head, M.furV, { style: 'snakes', seed: 11, snakeColor: { back: 0x34502a, belly: 0xb4b27a } });
  // peplo: faixa de time sobre o busto, cinto de ouro e o pano de time na cintura caindo sobre as escamas
  body.band(0.39, 0, 0.17, M.team, { off: 0.012 });
  body.band(0.12, 0, 0.035, M.gold, { off: 0.02 });
  body.skirt(0.12, -0.1, M.team, { flare: 0.5, folds: 13, foldAmp: 0.008, jag: 0.035, jagFreq: 6, rings: 6, seed: 6, off: 0.016 });
  if (P.torso?.sash === 'team') body.band(0.33, 0.72, 0.055, M.leather, { off: 0.03 });
  // braçadeiras de ouro nos braços
  for (const s of ['L', 'R']) {
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 6, 16), M.gold); b.position.set(0, -0.1, 0); b.rotation.x = Math.PI / 2;
    b.castShadow = b.receiveShadow = true; J['shoulder' + s].add(b);
  }
  // os olhos: brilho amarelo (o olhar que petrifica)
  const glow = M.__gaze ??= new THREE.MeshBasicMaterial({ color: 0xffd84a, toneMapped: false });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), glow); e.position.set(s * 0.029, 0.134, -0.078); J.head.add(e); }
  // pivô no quadril: o tronco gira em volta da cintura (fica em pé sobre o peito erguido)
  const hip = new THREE.Group(); hip.position.set(0, F.r * 0.25, 0); chest.add(hip);
  human.group.scale.setScalar(TORSO_SCALE);
  human.group.position.set(0, -0.92 * TORSO_SCALE, 0);
  hip.add(human.group);
  const qc = new THREE.Quaternion(), qr = new THREE.Quaternion();
  /** Depois da pose do corpo: o tronco com a orientação do grupo de tombo (em pé, de frente, tomba com o `roll`). */
  const upright = (rollG) => {
    hip.parent.updateMatrixWorld(true);
    hip.parent.getWorldQuaternion(qc); rollG.getWorldQuaternion(qr);
    hip.quaternion.copy(qc.invert().multiply(qr));
  };
  return { ...human, body, skin: body.skin, upright };
}
