// Rig do BÍPEDE GRANDE (Etapa 6, docs/ART.md §1.8 e Apêndice G): o esqueleto do rig humano (rigs/human.js — os mesmos
// pivôs, então as poses humanas servem: art/poses/giant.json usa os pivôs e escalares do humano) com proporções, pele,
// cabeça, pés e arma trocados pelo kit do manifesto — minotauro, ciclope, colosso de bronze e, depois, os titãs.
// O humano é construído em METROS com o kit de roupa/armadura de sempre (`params.human`: armor, tunicTeam, sash, greaves,
// cape, helmet…) e este rig:
//   height   altura (m) do topo da cabeça humana de referência (1,8 m): escala o corpo inteiro (minotauro 2,6)
//   bulk     1 (normal) · 1,2 (brutamontes): tronco, espáduas e membros mais largos, sem mudar a altura
//   skin     'fur' (pelo curto escuro, com cor por vértice: minotauro) · 'skin' (pele humana: ciclope) · 'bronze' (o
//            colosso: bronze polido com a pátina) · 'stone'
//   head     'human' · 'bull' (cabeça de touro: focinho, chifres curvos de marfim, orelhas, argola de bronze no focinho,
//            o cachaço de pelo escuro) · 'cyclops' (um olho só sob a testa pesada)
//   feet     'sandal' (do humano) · 'hoof' (cascos fendidos: minotauro) · 'bare'
//   weapon   arma própria na mão direita (pivô `weapon`, como as do humano): 'labrys' (machado de dois gumes minoico, 1,3 m)
//            · 'maul' (clava de tronco) · 'none' (a arma do kit humano, se houver)
//   bracers  'team' = braçadeiras de couro tingido na cor do time nos dois antebraços (cor de time à vista de todo lado)
// Metros, frente em −z, pés em y = 0; o grupo externo converte para tiles.

import { M2T, dirYaw } from '../camera.js';
import { buildHuman, applyPose, poseAt, JOINTS as HUMAN_JOINTS, SCALARS as HUMAN_SCALARS, KIT as HUMAN_KIT } from './human.js';
import { paint, mottle, mix, smooth, taperTube, sculpt } from './organic.js';

export const JOINTS = HUMAN_JOINTS;
export const SCALARS = HUMAN_SCALARS;
export const KIT = {
  skin: ['fur', 'skin', 'bronze', 'stone'], head: ['human', 'bull', 'cyclops'], feet: ['sandal', 'hoof', 'bare'],
  weapon: ['none', 'labrys', 'maul'], bracers: ['none', 'team'],
};
/** Kit humano aceito em `params.human` (validado junto: scripts/bake/manifest.mjs). */
export const HUMAN_PARAMS = HUMAN_KIT;
const HUMAN_HEIGHT = 1.8;

export function buildGiant(THREE, M, params = {}) {
  const P = { height: 2.6, bulk: 1, skin: 'fur', head: 'bull', feet: 'hoof', weapon: 'none', bracers: 'none', human: {}, ...params };
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const joint = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  // o humano de base (em metros): sem cabelo nem elmo se a cabeça for trocada
  const hp = { hair: P.head === 'human', ...(P.head !== 'human' ? { helmet: 'none' } : {}), ...(P.human ?? {}) };
  if (P.weapon !== 'none') hp.weapon = 'none';
  const human = buildHuman(THREE, M, hp, { meters: true });
  const J = human.joints;
  const k = P.height / HUMAN_HEIGHT, g = P.bulk;

  // pele: pelo com cor por vértice (dorso/ombros mais escuros, manchas), bronze ou pedra
  const FUR = { dark: 0x5c4030, base: 0x83603f, light: 0xa5825e };
  const skinMat = P.skin === 'fur' ? M.furV : P.skin === 'bronze' ? M.bronze : P.skin === 'stone' ? M.stone : M.skin;
  const furCol = (x, y, z) => mottle(mix(FUR.base, FUR.dark, 0.6 * smooth(0.1, 0.5, y)), 0.1, x, y, z, 9, 2);
  const skinned = [];
  human.group.traverse((o) => { if (o.isMesh && o.material === M.skin) skinned.push(o); });
  for (const o of skinned) {
    o.material = skinMat;
    if (skinMat === M.furV) { o.geometry = o.geometry.clone(); o.updateMatrix(); paint(THREE, o.geometry, furCol, o.matrix); }
  }

  // corpulência: malhas do tronco mais largas (x, z), espáduas afastadas e membros mais grossos (sem cisalhar: a escala vai
  // na MALHA, os pivôs só se deslocam)
  if (g !== 1) {
    for (const o of J.torso.children) if (o.isMesh) o.scale.set(o.scale.x * g, o.scale.y, o.scale.z * g * 0.96);
    for (const s of ['L', 'R']) J['shoulder' + s].position.x *= g;
    for (const name of ['shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR']) for (const o of J[name].children) if (o.isMesh && o.material === skinMat) o.scale.set(o.scale.x * g * 1.05, o.scale.y, o.scale.z * g * 1.05);
    for (const s of ['L', 'R']) J['hip' + s].position.x *= Math.sqrt(g);
  }

  // cabeça: some a esfera humana (e o cabelo) e entra a da criatura
  const headMeshes = J.head.children.filter((o) => o.isMesh);
  if (P.head !== 'human') for (const o of headMeshes) o.visible = false;
  if (P.head === 'bull') {
    // cachaço: massa de pelo do alto das costas até a nuca (o touro não tem pescoço fino)
    const hump = mesh(new THREE.SphereGeometry(0.26, 16, 12), M.furV, 0, 0.55, 0.04, J.torso); hump.scale.set(1.25 * g, 0.75, 1.0);
    hump.updateMatrix(); paint(THREE, hump.geometry, (x, y, z) => mottle(FUR.dark, 0.1, x, y, z, 9, 3), hump.matrix);
    const H = joint(J.head, 0, 0.08, -0.04);
    const hc = (lo, hi) => (x, y, z) => mottle(mix(lo, hi, smooth(-0.08, 0.1, y)), 0.08, x, y, z, 12, 4);
    // crânio largo e focinho comprido, inclinado para baixo; narinas e o focinho escuro e úmido
    const sk = mesh(new THREE.SphereGeometry(0.16, 16, 12), M.furV, 0, 0.06, 0.0, H); sk.scale.set(1.05, 0.95, 1.05);
    sk.updateMatrix(); paint(THREE, sk.geometry, hc(FUR.base, FUR.dark), sk.matrix);
    const mzg = new THREE.CylinderGeometry(0.095, 0.13, 0.3, 14); mzg.rotateX(Math.PI / 2 + 0.55);
    const mz = mesh(mzg, M.furV, 0, -0.06, -0.15, H);
    mz.updateMatrix(); paint(THREE, mz.geometry, (x, y, z) => mix(0x3a2b22, FUR.light, smooth(-0.2, 0.0, y)), mz.matrix);
    const nose = mesh(new THREE.SphereGeometry(0.085, 12, 8), M.hideV, 0, -0.17, -0.25, H); nose.scale.set(1.15, 0.7, 0.8);
    paint(THREE, nose.geometry, () => 0x221a16);
    mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 14), M.bronze, 0, -0.23, -0.27, H).rotation.x = 0.4;   // argola
    for (const s of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.022, 8, 6), M.eye, s * 0.1, 0.06, -0.1, H);
      // orelha: folha de couro virada para o lado
      const ear = mesh(new THREE.SphereGeometry(0.07, 10, 6), M.furV, s * 0.2, 0.08, 0.02, H); ear.scale.set(1.2, 0.45, 0.6); ear.rotation.z = -s * 0.3;
      paint(THREE, ear.geometry, () => FUR.base);
      // chifre: sai do alto da testa para os lados, curva para cima e para a frente; marfim com a ponta escura
      const horn = taperTube(THREE, [[0, 0, 0], [s * 0.16, 0.03, 0.02], [s * 0.3, 0.14, -0.02], [s * 0.34, 0.3, -0.12]], 0.05, 0.012, { tubular: 14, radial: 8 });
      paint(THREE, horn, (x, y) => mix(0xd8cbac, 0x2e2620, smooth(0.16, 0.3, y)));
      mesh(horn, M.hideV, s * 0.1, 0.13, -0.02, H);
    }
    // topete entre os chifres
    const tuft = mesh(new THREE.SphereGeometry(0.08, 10, 8), M.furV, 0, 0.17, -0.04, H); tuft.scale.set(1.2, 0.6, 0.9);
    paint(THREE, tuft.geometry, () => FUR.dark);
  } else if (P.head === 'cyclops') {
    const H = joint(J.head, 0, 0.12, 0);
    const sk = mesh(new THREE.SphereGeometry(0.13, 16, 12), skinMat, 0, 0, 0, H); sk.scale.set(1.05, 1.08, 1.02);
    mesh(new THREE.BoxGeometry(0.2, 0.05, 0.08), skinMat, 0, 0.04, -0.1, H);                                    // testa pesada
    mesh(new THREE.SphereGeometry(0.045, 12, 10), M.linen, 0, 0.0, -0.11, H);                                   // o olho
    mesh(new THREE.SphereGeometry(0.02, 8, 6), M.crestDark, 0, 0.0, -0.152, H);
    mesh(new THREE.BoxGeometry(0.05, 0.07, 0.05), skinMat, 0, -0.06, -0.12, H);                                 // nariz
    const beard = mesh(new THREE.ConeGeometry(0.1, 0.16, 10), M.hair, 0, -0.1, -0.06, H); beard.rotation.x = Math.PI + 0.3;
  }

  // pés: cascos fendidos (minotauro) no lugar das sandálias
  if (P.feet === 'hoof' || P.feet === 'bare') {
    for (const f of human.feet) {
      if (P.feet === 'hoof') {
        f.geometry = new THREE.CylinderGeometry(0.075, 0.09, 0.1, 10);
        f.material = M.hoof;
        f.position.set(0, f.position.y + 0.025, -0.02);
        const cleft = mesh(new THREE.BoxGeometry(0.012, 0.1, 0.1), M.hornDark, 0, 0, -0.06, f); void cleft;
      } else f.material = skinMat;
    }
  }

  // braçadeiras de time nos antebraços (couro tingido com a borda escura): a cor do time à vista de qualquer lado
  const bracers = [];
  if (P.bracers === 'team') for (const s of ['L', 'R']) {
    const el = J['elbow' + s];
    const b = mesh(new THREE.CylinderGeometry(0.078 * g, 0.07 * g, 0.16, 12), M.team, 0, -0.14, 0, el);
    for (const dy of [-0.08, 0.08]) mesh(new THREE.TorusGeometry(0.074 * g, 0.012, 5, 14), M.leather, 0, -0.14 + dy, 0, el).rotation.x = Math.PI / 2;
    bracers.push(b);
  }

  // arma própria na mão direita (pivô `weapon`, eixo y a partir do punho, como as do humano). Não é item FINO: a cabeça
  // do machado/maça conta no topo do corpo (a barra de vida fica acima dela), ao contrário da lança do hoplita
  const thin = [...human.thin];
  if (P.weapon === 'labrys') {
    const wg = J.weapon = joint(J.elbowR, 0, -0.27, 0);
    // cabo de 1 m (−0,3 a +0,7 do punho; 1,45 m na escala do minotauro) com tiras de couro e o machado de dois gumes de
    // bronze no alto
    mesh(new THREE.CylinderGeometry(0.024, 0.028, 1.0, 8), M.woodDark, 0, 0.2, 0, wg);
    for (const y of [-0.05, 0.05, 0.52]) mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.05, 8), M.leather, 0, y, 0, wg);
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, -0.05); bladeShape.quadraticCurveTo(0.14, -0.08, 0.3, -0.2); bladeShape.quadraticCurveTo(0.36, 0, 0.3, 0.2);
    bladeShape.quadraticCurveTo(0.14, 0.08, 0, 0.05); bladeShape.closePath();
    const bg = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 1 });
    bg.translate(0, 0, -0.011);
    for (const s of [-1, 1]) {
      // as lâminas no plano da frente (xz local): o gume corta para a frente e para trás do cabo
      const bl = mesh(bg, M.bronze, 0, 0.62, 0, wg); bl.rotation.set(0, s === 1 ? Math.PI / 2 : -Math.PI / 2, 0);
    }
    mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.13, 10), M.bronzeDark, 0, 0.62, 0, wg);
  } else if (P.weapon === 'maul') {
    const wg = J.weapon = joint(J.elbowR, 0, -0.27, 0);
    mesh(new THREE.CylinderGeometry(0.13, 0.05, 1.3, 10), M.wood, 0, 0.5, 0, wg);
    mesh(new THREE.SphereGeometry(0.14, 10, 8), M.wood, 0, 1.12, 0, wg);
  }

  const group = new THREE.Group();
  const scaled = new THREE.Group(); scaled.scale.setScalar(M2T * k); group.add(scaled);
  scaled.add(human.group);
  return { group, joints: J, human, feet: human.feet, thin, bracers };
}

/** Rig de unidade bípede grande para o bake: as poses de art/poses/giant.json (pivôs do humano). */
export function giantUnit(THREE, M, params) {
  const rig = buildGiant(THREE, M, params);
  return {
    group: rig.group, feet: rig.feet, thin: rig.thin,
    pose(fr, poses) {
      const def = poses.main?.anims?.[fr.pose];
      if (!def) throw new Error(`pose de bípede grande ${fr.pose} ausente`);
      rig.human.setAnim(fr.anim);
      const p = poseAt(def, fr.frame, fr.frames, JOINTS, SCALARS);
      applyPose(rig.human, p);
      rig.human.post(p);
      rig.group.rotation.y = dirYaw(fr.dir);
    },
  };
}
