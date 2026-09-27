// Rig BÍPEDE (Etapa 6, lote bípedes-espíritos; docs/ART.md §1.8 e Apêndice G): o esqueleto do rig humano (os mesmos
// pivôs: as poses de art/poses/biped.json usam os do humano) vestido com o CORPO ESCULPIDO de rigs/anatomy.js e um
// ACABAMENTO de material — carne (ciclope), bronze polido com pátina (colosso), mármore pintado (sentinela) ou espectro
// (a Sombra de Hades) —, mais as peças próprias do lote. Kit (`source.params`; o manifesto é recusado com outro valor):
//   height   altura (m) de referência do esqueleto humano de 1,8 m: escala tudo (ciclope 3,6; colosso 5; sentinela 2,2)
//   bulk     largura extra (1 = normal)                              build   'heroic' · 'brute' · 'gaunt' (anatomy.js)
//   finish   'flesh' (pele por vértice no `tone`) · 'bronze' (bronze polido, escuro nas dobras, pátina verde em manchas e
//            escorridos, mais nas pernas) · 'marble' (mármore com veios, encardido embaixo, líquen no pedestal) ·
//            'spectral' (fumaça escura azulada com brilho frio próprio; o renderizador desenha a Sombra a 70 %)
//   tone     'tan' · 'ruddy' · 'pale'                               head    'male' · 'cyclops' (um olho grande, pálpebra)
//   hair     'none' · 'short' · 'curls' · 'wild'                    beard   'none' · 'full'
//   weapon   arma própria na mão direita (pivô `weapon`): 'trunk' (tronco de árvore com nós, tocos de galho e a raiz na
//            ponta: a clava do ciclope) · 'hammer' (malho de ferreiro de Hefesto, cabeça de bronze) · 'none' (a do kit
//            humano, se houver: arco da sentinela, kopis da Sombra)
//   garment  'hide' (tanga de couro de cabra com pelo, barra recortada) · 'kilt' (saiote de pano de time com pregas) ·
//            'perizoma' (pano curto drapeado com a barra pintada de time: estátua) · 'shroud' (manto até o chão, esfarrapado
//            e sumindo embaixo: espectro) · 'none'
//   sash     'team' = talabarte de time sobre o corpo esculpido     bracers 'team' · 'bronze' · 'none'
//   cloak    'tattered' (capa de time rasgada nas costas) · 'chlamys' (clâmide curta presa no ombro, barra de time) · 'none'
//   plinth   true = pedestal de pedra sob os pés (a estátua fica em cima)
//   eyes     'ember' (brasa nos olhos: colosso animado) · 'frost' (brilho frio: Sombra) · 'none'
//   glide    passada do flutuar (m do esqueleto por ciclo de `walk`): quem não pisa (a Sombra) anda pela distância assim
//   human    kit do rig humano (elmo, crina, escudo, arma, capa…; validado com o KIT humano)
// Escalares de pose (além de draw/hold do humano):
//   crumble  0–1: a estátua desmorona — as peças (tronco em duas, membros, cabeça, arco) se soltam, giram e caem no chão
//            em volta do pedestal, com lascas surgindo (morte da sentinela); no espectro, o elmo de bronze cai no chão
//   fade     0–1: o espectro se desfaz (opacidade dos materiais próprios; as partes de time somem na metade, menos a
//            crina do elmo, que fica no chão com ele)
// Metros, frente em −z, pés em y = 0 (no pedestal, em cima dele); o grupo externo converte para tiles.

import { M2T, dirYaw } from '../camera.js';
import { buildHuman, applyPose, poseAt, JOINTS as HUMAN_JOINTS, SCALARS as HUMAN_SCALARS } from './human.js';
import { dressBody, addHair } from './anatomy.js';
import { paint, mottle, mix, smooth, fbm3, taperTube, shaggy } from './organic.js';

export const JOINTS = HUMAN_JOINTS;
export const SCALARS = [...HUMAN_SCALARS, 'crumble', 'fade'];
export const KIT = {
  build: ['heroic', 'brute', 'gaunt'], finish: ['flesh', 'bronze', 'marble', 'spectral'], tone: ['tan', 'ruddy', 'pale'],
  head: ['male', 'cyclops'], hair: ['none', 'short', 'curls', 'wild'], beard: ['none', 'full'], weapon: ['none', 'trunk', 'hammer'],
  garment: ['none', 'hide', 'kilt', 'perizoma', 'shroud'], sash: ['none', 'team'], bracers: ['none', 'team', 'bronze'],
  cloak: ['none', 'tattered', 'chlamys'], plinth: [false, true], eyes: ['none', 'ember', 'frost'], helm: ['none', 'corinthian'],
  crest: ['none', 'team'],
};
const H0 = 1.8;
const FORE = 0.27;
const g = (u, w) => Math.exp(-(u / w) * (u / w));

/** Materiais próprios do lote (criados uma vez por conjunto de materiais, depois de todos os de materials.js). */
function mats(THREE, M) {
  if (M.__biped) return M.__biped;
  const std = (o) => new THREE.MeshStandardMaterial({ color: 0xffffff, ...o });
  const env = M.bronze.envMap ?? null;
  M.__biped = {
    bronze: std({ vertexColors: true, metalness: 0.72, roughness: 0.4, envMap: env, envMapIntensity: 0.5 }),
    marble: std({ vertexColors: true, roughness: 0.46, metalness: 0 }),
    spectral: std({ vertexColors: true, roughness: 0.9, metalness: 0, emissive: 0x1e3044, emissiveIntensity: 0.55, transparent: true, opacity: 1 }),
    hide: std({ vertexColors: true, roughness: 0.94 }),
    wood: std({ vertexColors: true, roughness: 0.9 }),
    sclera: std({ color: 0xe8e0cc, roughness: 0.22 }),
    iris: std({ color: 0x6a4a1c, roughness: 0.3 }),
    pupil: std({ color: 0x0b0a09, roughness: 0.2 }),
    ember: new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }),
    frost: new THREE.MeshBasicMaterial({ color: 0xc8ecff, toneMapped: false, transparent: true, opacity: 1 }),
  };
  return M.__biped;
}

/** Cores dos acabamentos no espaço do rig em repouso (m, pés em y = 0). */
const FINISH = {
  bronze: (x, y, z) => {
    // bronze polido (mais claro no alto, escuro embaixo), pátina verde-azulada em manchas e escorridos (mais nas pernas)
    let c = mix(0x946a34, 0x503818, 0.5 * smooth(1.6, 0.2, y) + 0.3 * fbm3(x * 5, y * 5, z * 5));
    const patch = smooth(0.48, 0.66, fbm3(x * 7 + 3, y * 7, z * 7)) * (0.45 + 0.55 * smooth(1.3, 0.3, y));
    const drip = smooth(0.58, 0.7, fbm3(x * 26, y * 2.2, z * 26)) * smooth(0.2, 1.0, y);
    c = mix(c, mix(0x3f7a68, 0x78aa94, fbm3(x * 20, y * 20, z * 20)), Math.min(0.9, patch + 0.6 * drip));
    return mottle(c, 0.06, x, y, z, 24, 5);
  },
  marble: (x, y, z) => {
    // mármore de Paros: branco quente, veios cinza finos, encardido e líquen embaixo (o pedestal pega mais)
    let c = mix(0xe9e2d2, 0xd5cfc2, fbm3(x * 4, y * 4, z * 4));
    const vein = Math.abs(Math.sin((x * 2.2 + y * 1.3 + z * 1.7 + fbm3(x * 3, y * 3, z * 3) * 5) * 3.1));
    c = mix(c, 0x98948a, 0.4 * smooth(0.07, 0.0, vein));
    c = mix(c, 0xa59a82, 0.45 * smooth(0.6, 0.0, y) * fbm3(x * 9, y * 9, z * 9));
    const lichen = smooth(0.62, 0.72, fbm3(x * 12 + 7, y * 12, z * 12)) * smooth(0.5, 0.1, y);
    c = mix(c, 0x8a9464, 0.6 * lichen);
    return mottle(c, 0.035, x, y, z, 30, 2);
  },
  spectral: (x, y, z) => {
    // fumaça escura: azul-ardósia no alto, quase preta embaixo, manchas mais claras (a névoa que se move)
    let c = mix(0x333a46, 0x0b0d11, smooth(1.6, 0.3, y));
    c = mix(c, 0x5d6f86, 0.3 * smooth(0.55, 0.8, fbm3(x * 9, y * 5, z * 9)));
    return mottle(c, 0.1, x, y, z, 18, 7);
  },
};

export function buildBiped(THREE, M, params = {}) {
  const P = { height: H0, bulk: 1, build: 'heroic', finish: 'flesh', tone: 'tan', head: 'male', hair: 'short', beard: 'none', weapon: 'none', garment: 'none', sash: 'none', bracers: 'none', cloak: 'none', plinth: false, eyes: 'none', human: {}, ...params };
  const X = mats(THREE, M);
  const k = P.height / H0;
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const joint = (parent, x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
  const hp = { hair: false, armor: 'bare', ...(P.human ?? {}) };
  if (P.weapon !== 'none') hp.weapon = 'none';
  const human = buildHuman(THREE, M, hp, { meters: true });
  const J = human.joints;
  const body = dressBody(THREE, M, human, { build: P.build, bulk: P.bulk, tone: P.tone, head: P.head });
  const extra = [];            // peças do lote (entram no acabamento e no desmoronar)
  const keep = new Set();      // peças que o acabamento não troca (olhos, brasa)
  const teamParts = [];

  // ---- cabelo e barba ----
  if (P.hair !== 'none' || P.beard !== 'none') {
    const hairCol = P.head === 'cyclops' ? 0x241a14 : 0x3a2a1c;
    extra.push(...addHair(THREE, J.head, M.furV, { style: P.hair, beard: P.beard, color: hairCol, cyclops: P.head === 'cyclops' }));
  }
  // ---- o olho do ciclope: globo úmido, íris âmbar escura, pupila e a pálpebra de cima pesada ----
  if (P.head === 'cyclops') {
    // (a cabeça do brutamontes é 15 % maior: o olho e a cara precisam ler a zoom 1)
    J.head.scale.setScalar(1.15);
    const eg = joint(J.head, 0, 0.127, -0.07); eg.rotation.x = -0.12;
    const eye = mesh(new THREE.SphereGeometry(0.036, 18, 14), X.sclera, 0, 0, 0, eg);
    const iris = mesh(new THREE.CircleGeometry(0.018, 18), X.iris, 0, 0, -0.0362, eg); iris.rotation.y = Math.PI;
    const pupil = mesh(new THREE.CircleGeometry(0.0085, 14), X.pupil, 0, 0, -0.0366, eg); pupil.rotation.y = Math.PI;
    const lid = mesh(new THREE.SphereGeometry(0.039, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.4), body.mat, 0, 0.002, 0.002, eg); lid.rotation.x = -0.62;
    for (const o of [eye, iris, pupil]) keep.add(o);
    extra.push(lid);
    body.parts.body.push(lid);
  }
  // pinta a pálpebra com a pele (a malha entrou depois da pintura do corpo)
  if (P.head === 'cyclops') { const lid = body.parts.body[body.parts.body.length - 1]; paint(THREE, lid.geometry, () => mix(body.tone.base, body.tone.dark, 0.3)); }

  // ---- elmo coríntio esculpido: calota com a nuca alargada, faces e nasal inteiros, as aberturas dos olhos e da boca
  // em T (o rosto aparece por elas) e a crina de crina de cavalo arqueada da testa à nuca (time). Num grupo próprio na
  // cabeça: na Sombra o elmo é de bronze DE VERDADE (fora do acabamento espectral) e é o que cai no chão e fica quando o
  // espectro se desfaz ----
  let helmG = null;
  if (P.helm === 'corinthian') {
    helmG = new THREE.Group(); J.head.add(helmG);
    const R = [0.106, 0.126, 0.118];
    const hg = new THREE.SphereGeometry(1, 30, 22);
    const hp = hg.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      let u = hp.getX(i), v = hp.getY(i), w = hp.getZ(i);
      const front = -w, back = w;
      let k = 1;
      // aberturas: olhos (em cima do nasal) e a fenda da boca/queixo — os vértices entram no crânio
      const eye = front > 0.3 && Math.abs(u) > 0.09 && Math.abs(u) < 0.52 && v > -0.08 && v < 0.2;
      const mouth = front > 0.3 && Math.abs(u) < 0.2 && v < -0.18;
      if (eye || mouth) k = 0.7;
      // aba da testa e as faces um pouco à frente; nuca alargada para trás e para fora
      if (front > 0.2 && v > 0.18 && v < 0.34) k *= 1.04;
      let y = v;
      if (v < -0.6) y = -0.6 - (v + 0.6) * 0.15;
      if (back > 0 && v < -0.2) { k *= 1 + 0.25 * smooth(-0.2, -0.75, v) * back; }
      hp.setXYZ(i, u * R[0] * k, y * R[1] * (eye || mouth ? 1 : 1), w * R[2] * k * (front > 0.3 && v < 0 && !mouth ? 1.06 : 1));
    }
    hp.needsUpdate = true; hg.computeVertexNormals();
    const helm = mesh(hg, M.bronze, 0, 0.13, 0.004, helmG);
    extra.push(helm);
    if (P.finish === 'spectral') keep.add(helm);
    if (P.crest === 'team') {
      // crina: perfil arqueado (testa → alto → nuca, caindo nas costas) extrudado fino, com o pelo por deslocamento
      const sh = new THREE.Shape();
      const top = [[-0.1, 0.1], [-0.06, 0.2], [0.03, 0.25], [0.12, 0.22], [0.2, 0.12], [0.24, 0.0]];
      sh.moveTo(-0.1, 0.1);
      for (const [z, y] of top.slice(1)) sh.lineTo(z, y);
      sh.lineTo(0.2, -0.02); sh.lineTo(0.12, 0.1); sh.lineTo(0.03, 0.13); sh.lineTo(-0.05, 0.11); sh.closePath();
      const cg = new THREE.ExtrudeGeometry(sh, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 4 });
      cg.translate(0, 0, -0.0225); cg.rotateY(-Math.PI / 2);   // perfil no plano zy (frente em −z)
      shaggy(cg, 0.006, 90, 5);
      const tm = M.team.clone(); tm.side = THREE.DoubleSide;
      teamParts.push(mesh(cg, tm, 0, 0.12, 0.0, helmG));
      const holder = mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), M.bronzeDark, 0, 0.245, 0.02, helmG);   // suporte
      extra.push(holder);
      if (P.finish === 'spectral') keep.add(holder);
    }
  }

  // ---- olhos brilhando (colosso animado: brasa; Sombra: frio) ----
  if (P.eyes !== 'none') for (const s of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.013, 8, 6), P.eyes === 'ember' ? X.ember : X.frost, s * 0.031, 0.133, -0.08, J.head);
    e.castShadow = false; keep.add(e);
  }

  // ---- roupa ----
  if (P.garment === 'hide') {
    // tanga de couro de cabra: pelo castanho com manchas escuras, barra recortada; por cima, uma faixa de pano tingido
    // (time) com as bordas de couro cru — a cor do dono à vista de todos os lados, também de costas
    const hideCol = (x, y, z) => mottle(mix(0x6e5238, 0x33261b, smooth(0.42, 0.6, fbm3(x * 10, y * 10, z * 10))), 0.18, x, y, z, 40, 4);
    const sk = body.skirt(0.1, -0.2, X.hide, { flare: 0.32, jag: 0.05, folds: 5, foldAmp: 0.008, rings: 6, seed: 2, front: 0.7 });
    paint(THREE, sk.geometry, hideCol); shaggy(sk.geometry, 0.008, 40, 1);
    extra.push(sk);
    teamParts.push(body.band(0.1, 0, 0.06, M.team, { edge: M.leather, off: 0.03, segs: 44 }));
  } else if (P.garment === 'kilt') {
    // saiote de pano de time com pregas, preso por um cinturão largo (vira bronze no colosso)
    teamParts.push(body.skirt(0.1, -0.27, M.team, { flare: 0.4, folds: 16, foldAmp: 0.009, rings: 7, seed: 3 }));
    extra.push(body.band(0.1, 0, 0.07, M.leather, { off: 0.03, segs: 44 }));
  } else if (P.garment === 'perizoma') {
    // pano drapeado curto (mármore) com a barra pintada na cor do time, como as estátuas pintadas da Grécia arcaica
    extra.push(body.skirt(0.08, -0.2, M.linen, { flare: 0.35, folds: 11, foldAmp: 0.008, rings: 6, seed: 5, front: 0.85, t1: 0.82 }));
    teamParts.push(body.skirt(0.08, -0.2, M.team, { flare: 0.35, folds: 11, foldAmp: 0.008, rings: 2, seed: 5, front: 0.85, t0: 0.8, lift: 0.004 }));
  } else if (P.garment === 'shroud') {
    // manto do espectro: do peito ao chão, abrindo e esfarrapado embaixo (a barra some em tiras)
    extra.push(body.skirt(0.14, -0.86, M.linen, { flare: 0.9, folds: 9, foldAmp: 0.02, jag: 0.2, jagFreq: 7, rings: 12, seed: 7, off: 0.02, segs: 56 }));
  }
  if (P.sash === 'team') teamParts.push(body.band(0.34, 0.72, 0.075, M.team, { edge: M.leather, off: 0.016 }));
  // ---- braçadeiras ----
  if (P.bracers !== 'none') for (const s of ['L', 'R']) {
    const L = body.B.limb * Math.sqrt(P.bulk);
    const b = mesh(new THREE.CylinderGeometry(0.047 * L, 0.041 * L, 0.12, 14, 1, true), P.bracers === 'team' ? M.team : M.bronze, 0, -0.17, 0, J['elbow' + s]);
    b.scale.z = 0.86;
    (P.bracers === 'team' ? teamParts : extra).push(b);
    for (const dy of [-0.06, 0.06]) { const r = mesh(new THREE.TorusGeometry(0.046 * L, 0.006, 5, 16), M.leather, 0, -0.17 + dy, 0, J['elbow' + s]); r.rotation.x = Math.PI / 2; r.scale.y = 0.86; extra.push(r); }
  }
  // ---- capa ----
  if (P.cloak !== 'none') {
    // capa pendurada das espáduas: segue o contorno das costas no alto (body.surf) e cai reta, sem encostar na cintura;
    // 'tattered' = longa e rasgada em tiras embaixo (espectro); 'chlamys' = curta, com a barra pintada de time
    const tattered = P.cloak === 'tattered', len = tattered ? 1.2 : 0.6, y0 = 0.53, cols = 16, rows = 12;
    const span0 = 1.9, span1 = tattered ? 2.5 : 2.1;     // abertura em radianos em volta das costas (θ = π/2 é o meio)
    const zTop = (th) => body.surf(th, 0.46, 0.035)[2];
    const grid = (r0, r1, lift = 0) => {
      const pos = [], idx = [];
      for (let r = r0; r <= r1; r++) for (let c = 0; c <= cols; c++) {
        const u = c / cols - 0.5, t = r / rows, th = Math.PI / 2 + u * (span0 + (span1 - span0) * t);
        let y = y0 - t * len;
        if (tattered && r === rows) y += 0.3 * smooth(0.4, 0.75, fbm3(u * 11, 1, 3)) + 0.14 * Math.abs(Math.sin(u * 29));
        const p = body.surf(th, Math.max(y, -0.1), 0.03 + lift);
        const hang = zTop(th) * (1 - 0.08 * t) + 0.04 * t;           // cai reto das espáduas
        const z = Math.max(p[2], hang) + 0.012 * Math.sin(u * 19 + t * 4) * t + lift;
        pos.push(p[0] * (1 + 0.25 * t), y, z);
      }
      const n = cols + 1;
      for (let r = 0; r < r1 - r0; r++) for (let c = 0; c < cols; c++) { const a = r * n + c, b = a + n; idx.push(a, a + 1, b, a + 1, b + 1, b); }   // normal para fora (costas)
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      return geo;
    };
    if (tattered) {
      const tm = M.team.clone(); tm.side = THREE.DoubleSide;
      teamParts.push(mesh(grid(0, rows), tm, 0, 0, 0, J.torso));
    } else {
      const lm = M.linen.clone(); lm.side = THREE.DoubleSide;
      extra.push(mesh(grid(0, rows - 2), lm, 0, 0, 0, J.torso));
      const tm = M.team.clone(); tm.side = THREE.DoubleSide;
      teamParts.push(mesh(grid(rows - 2, rows, 0.002), tm, 0, 0, 0, J.torso));
      extra.push(mesh(new THREE.SphereGeometry(0.028, 10, 8), M.gold, 0.19, 0.5, -0.06, J.torso));   // fíbula no ombro
    }
  }

  // ---- armas próprias (pivô `weapon` no punho direito, eixo +y do antebraço) ----
  const thin = [...human.thin];
  if (P.weapon === 'trunk') {
    // tronco de oliveira arrancado: 1,5 m (3 m no ciclope), a raiz grossa na ponta, nós, tocos de galho, casca por vértice
    const wg = J.weapon = joint(J.elbowR, 0, -FORE, 0);
    const pts = [[0, -0.16, 0], [0.01, 0.16, 0.01], [-0.02, 0.5, -0.01], [0.02, 0.82, 0.02], [0.0, 1.06, 0.0]];
    const tube = taperTube(THREE, pts, 0, 0, { tubular: 28, radial: 12, rFn: (t) => 0.04 + 0.066 * t * t + 0.04 * smooth(0.82, 1, t) });
    shaggy(tube, 0.012, 14, 4);
    const bark = (x, y, z) => mottle(mix(0x5a4430, 0x2e241a, smooth(0.35, 0.65, fbm3(x * 18, y * 4, z * 18))), 0.14, x, y, z, 30, 2);
    paint(THREE, tube, bark);
    extra.push(mesh(tube, X.wood, 0, 0, 0, wg));
    // raiz: 4 raízes curtas abertas na ponta; tocos de galho quebrado; nós
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.4, ca = Math.cos(a), sa = Math.sin(a);
      const rg = taperTube(THREE, [[0, 0.99, 0], [ca * 0.09, 1.08, sa * 0.09], [ca * 0.17, 1.12, sa * 0.17]], 0.045, 0.012, { tubular: 8, radial: 7 });
      paint(THREE, rg, bark); extra.push(mesh(rg, X.wood, 0, 0, 0, wg));
    }
    for (const [y, a, l] of [[0.46, 0.8, 0.13], [0.72, 3.6, 0.1], [0.3, 2.2, 0.07]]) {
      const bg = taperTube(THREE, [[0, y, 0], [Math.cos(a) * l * 0.5, y + l * 0.3, Math.sin(a) * l * 0.5], [Math.cos(a) * l, y + l * 0.55, Math.sin(a) * l]], 0.035, 0.018, { tubular: 6, radial: 7 });
      paint(THREE, bg, bark); extra.push(mesh(bg, X.wood, 0, 0, 0, wg));
    }
  } else if (P.weapon === 'hammer') {
    // malho de Hefesto: cabo de 1,35 m cintado, cabeça de bronze 0,46 × 0,22 × 0,22 com faces chanfradas e o olho reforçado
    const wg = J.weapon = joint(J.elbowR, 0, -FORE, 0);
    // (o malho não é da estátua: cabo de madeira escura, cabeça de ferro e cintas de bronze — fica fora do acabamento)
    const ham = [];
    ham.push(mesh(new THREE.CylinderGeometry(0.026, 0.032, 1.15, 10), M.woodDark, 0, 0.36, 0, wg));
    for (const y of [-0.08, 0.02, 0.76]) ham.push(mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.05, 10), M.bronzeDark, 0, y, 0, wg));
    const head = new THREE.Group(); head.position.set(0, 0.98, 0); wg.add(head);
    const hg = new THREE.BoxGeometry(0.15, 0.15, 0.36, 2, 2, 4);
    { const p = hg.attributes.position; for (let i = 0; i < p.count; i++) { const zz = p.getZ(i); const f = 1 - 0.14 * smooth(0.1, 0.18, Math.abs(zz)); p.setX(i, p.getX(i) * f); p.setY(i, p.getY(i) * f); } hg.computeVertexNormals(); }
    ham.push(mesh(hg, M.iron, 0, 0, 0, head));
    for (const e of [-1, 1]) ham.push(mesh(new THREE.BoxGeometry(0.165, 0.165, 0.03), M.iron, 0, 0, e * 0.165, head));
    ham.push(mesh(new THREE.BoxGeometry(0.17, 0.045, 0.085), M.bronzeDark, 0, 0, 0, head));
    for (const o of ham) { keep.add(o); extra.push(o); }
  }

  // o tronco e o malho passam muito da cabeça (3 m no ciclope): ficam fora do topo do corpo, como a lança do hoplita —
  // a barra de vida fica na altura da cabeça
  if (P.weapon !== 'none' && J.weapon) thin.push(J.weapon);

  // ---- pedestal ----
  const PL = P.plinth ? 0.32 : 0;
  let plinth = null;
  if (P.plinth) {
    plinth = new THREE.Group();
    const stone = (x, y, z) => FINISH.marble(x, y, z);
    const blocks = [[0.86, 0.08, 0.86, 0.04], [0.74, 0.18, 0.74, 0.17], [0.82, 0.06, 0.82, 0.29]];
    for (const [w, h, d, y] of blocks) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 3, 1, 3), X.marble); b.position.y = y; b.castShadow = b.receiveShadow = true; plinth.add(b); b.updateMatrix(); paint(THREE, b.geometry, stone, b.matrix); }
    // faixa pintada de time na face do pedestal (a inscrição da dedicatória), dos quatro lados
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.15), M.team);
      const a = i * Math.PI / 2; f.position.set(Math.sin(a) * 0.372, 0.172, Math.cos(a) * 0.372); f.rotation.y = a;
      f.receiveShadow = true; plinth.add(f); teamParts.push(f);
    }
  }

  // ---- acabamento: troca o material de tudo que não é time (nem olho) e pinta no espaço do rig em repouso ----
  const rootG = human.group;
  if (P.finish !== 'flesh') {
    const fin = FINISH[P.finish], mat = X[P.finish];
    rootG.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(rootG.matrixWorld).invert();
    rootG.traverse((o) => {
      if (!o.isMesh || !o.visible || keep.has(o) || o.material?.userData?.team) return;
      o.updateMatrixWorld(true);
      o.geometry = o.geometry.clone();
      paint(THREE, o.geometry, fin, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      o.material = mat;
    });
  }
  // (o espectro: a capa de time translúcida acompanha o desfazer; nada do espectro projeta sombra forte — a vista
  // desenha a sombra dele a 40 %)

  // ---- grupos: escala, pedestal e o corpo em cima dele ----
  const group = new THREE.Group();
  const scaled = new THREE.Group(); scaled.scale.setScalar(M2T * k); group.add(scaled);
  if (plinth) scaled.add(plinth);
  rootG.position.y = PL;
  scaled.add(rootG);

  // ---- desmoronar (estátua): peças = todas as malhas visíveis do corpo e do kit, menos o pedestal ----
  const pieces = [];
  if (P.finish === 'marble' || P.finish === 'bronze') {
    rootG.traverse((o) => { if (o.isMesh && o.visible) pieces.push({ o }); });
    // lascas: pedaços de mármore que só aparecem no desmoronar, espalhados em volta do pedestal
    for (let i = 0; i < 14; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.05 + 0.04 * ((i * 7) % 5) / 4, 0), X[P.finish]);
      const a = i * 2.39996, d = 0.3 + 0.25 * ((i * 3) % 7) / 6;
      r.position.set(Math.cos(a) * d, 0.04, Math.sin(a) * d); r.rotation.set(i, i * 1.3, i * 0.7);
      r.castShadow = r.receiveShadow = true; r.visible = false; scaled.add(r);
      r.updateMatrix(); r.geometry = r.geometry.clone(); paint(THREE, r.geometry, FINISH[P.finish], r.matrix);
      pieces.push({ o: r, chip: true, t: 0.35 + 0.45 * ((i * 5) % 9) / 8 });
    }
  }
  const spectral = P.finish === 'spectral';
  const tmp = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const invParent = new THREE.Matrix4();
  /** Estátua desmoronando: cada peça cai ao chão (em volta do pé), gira e se espalha; lascas aparecem. */
  // o desmoronar mexe na posição das malhas; `uncrumble` (no começo de cada pose, antes do post() do arco que também as
  // mexe) devolve as do quadro anterior ao lugar
  let moved = [];
  const uncrumble = () => { for (const [o, p0, q0] of moved) { o.position.copy(p0); o.quaternion.copy(q0); } moved = []; };
  const crumble = (c) => {
    for (const pc of pieces) if (pc.chip) pc.o.visible = c > pc.t;
    if (!(c > 0)) return;
    for (const pc of pieces) if (!pc.chip) moved.push([pc.o, pc.o.position.clone(), pc.o.quaternion.clone()]);
    scaled.updateMatrixWorld(true);
    pieces.forEach((pc, i) => {
      if (pc.chip) return;
      const o = pc.o;
      // centro da peça no espaço do grupo escalado (m)
      o.getWorldPosition(tmp); scaled.worldToLocal(tmp);
      const r1 = ((i * 37) % 11) / 10, r2 = ((i * 53) % 13) / 12, r3 = ((i * 29) % 7) / 6;
      const start = 0.05 + 0.35 * (1 - Math.min(1, tmp.y / (PL + 1.8))) * 0.5 + 0.25 * r1;   // o alto cai primeiro
      const f = smooth(start, Math.min(1, start + 0.45), c);
      if (f <= 0) { o.rotation.x += 0.03 * c * (r2 - 0.5); return; }
      const ang = r2 * Math.PI * 2 + 0.6, spread = (0.15 + 0.45 * r3) * f;
      const tx = tmp.x + Math.cos(ang) * spread + 0.25 * f, tz = tmp.z + Math.sin(ang) * spread;
      // cai em cima do pedestal se estiver sobre ele, senão no chão em volta
      const onPlinth = PL > 0 && Math.abs(tx) < 0.36 && Math.abs(tz) < 0.36;
      const target = new THREE.Vector3(tx, (onPlinth ? PL : 0) + 0.05 + 0.05 * r1, tz);
      // queda: parábola (acelera no fim)
      const fy = f * f;
      const pos = new THREE.Vector3(tmp.x + (target.x - tmp.x) * f, tmp.y + (target.y - tmp.y) * fy, tmp.z + (target.z - tmp.z) * f);
      // de volta ao espaço do pai da peça
      scaled.localToWorld(pos); invParent.copy(o.parent.matrixWorld).invert(); pos.applyMatrix4(invParent);
      o.position.copy(pos);
      e.set((r1 - 0.5) * 3 * f, (r2 - 0.5) * 2 * f, (r3 - 0.5) * 3 * f); q.setFromEuler(e); o.quaternion.premultiply(q);
    });
  };
  /** Espectro se desfazendo: opacidade dos materiais próprios e das partes de time. */
  // tudo que é de time no espectro (as peças do lote e as do kit humano: centro do escudo) some no meio do desfazer;
  // os olhos apagam e, da metade em diante, nada mais projeta sombra (o material translúcido projetaria inteira)
  // (menos o elmo: ele é de bronze, cai no chão — `dropHelm` — e fica, com a crina de time e a sombra dele)
  const teamAll = [], spectralMeshes = [];
  const inHelm = (o) => { for (let p = o; p; p = p.parent) if (p === helmG) return true; return false; };
  if (spectral) rootG.traverse((o) => { if (!o.isMesh || inHelm(o)) return; if (o.material?.userData?.team) teamAll.push(o); spectralMeshes.push(o); });
  if (helmG) helmG.traverse((o) => { if (o.isMesh) o.userData.helm = true; });
  /** Sombra se desfazendo (`crumble` na queda dela): o elmo solta da cabeça, cai de lado no chão, à frente e à direita
   *  do corpo, e fica ali (a crina deitada) — é o que a vista mostra como o cadáver. */
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qS = new THREE.Quaternion();
  const HELM_REST = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.6, Math.PI / 2 * 0.94, 'YXZ'));
  const dropHelm = (c) => {
    if (!helmG || !(c > 0)) return;
    moved.push([helmG, helmG.position.clone(), helmG.quaternion.clone()]);
    scaled.updateMatrixWorld(true);
    helmG.getWorldPosition(tmp); scaled.worldToLocal(tmp);
    const f = smooth(0.1, 0.8, c), fy = f * f;
    // origem do grupo = a junta da cabeça; deitado, o centro do elmo (0,13 acima dela) fica ~0,1 acima do chão
    const target = new THREE.Vector3(0.24, 0.1, -0.3);
    const pos = new THREE.Vector3(tmp.x + (target.x - tmp.x) * f, tmp.y + (target.y - tmp.y) * fy, tmp.z + (target.z - tmp.z) * f);
    scaled.localToWorld(pos); helmG.parent.worldToLocal(pos);
    helmG.position.copy(pos);
    // orientação no espaço do grupo escalado: da atual (a da cabeça) para deitado de lado
    scaled.getWorldQuaternion(qS); helmG.getWorldQuaternion(qA); qA.premultiply(qS.clone().invert());
    qA.slerp(HELM_REST, f);
    helmG.parent.getWorldQuaternion(qB); qB.premultiply(qS.clone().invert());
    helmG.quaternion.copy(qB.invert().multiply(qA));
  };
  const fade = (v) => {
    if (!spectral) return;
    X.spectral.opacity = 1 - v;
    X.frost.opacity = 1 - v;
    for (const t of teamAll) t.visible = v < 0.45;
    // translúcido da metade em diante: nem sombra nem oclusor da máscara de time (`decal`: o bake o tira do passe de
    // time) — senão o vulto quase invisível apagaria a crina do elmo caído atrás dele
    for (const o of spectralMeshes) { o.userData.noShadow = v >= 0.5; o.userData.decal = v >= 0.5; }
  };
  // o espectro não deixa o material translúcido para os outros assets da página
  const restore = () => { X.spectral.opacity = 1; X.frost.opacity = 1; };

  return { group, joints: J, human, body, feet: body.feet, thin, crumble: spectral ? dropHelm : crumble, uncrumble, fade, restore, teamParts, k, PL };
}

/** Rig de unidade bípede para o bake: poses de art/poses/biped.json (pivôs do humano + crumble/fade). */
export function bipedUnit(THREE, M, params) {
  const rig = buildBiped(THREE, M, params);
  const P = { glide: 0, ...params };
  return {
    group: rig.group, feet: rig.feet, thin: rig.thin,
    ...(P.glide > 0 ? { glide: () => P.glide * M2T * rig.k } : {}),
    pose(fr, poses) {
      const def = poses.main?.anims?.[fr.pose];
      if (!def) throw new Error(`pose de bípede ${fr.pose} ausente`);
      rig.uncrumble();
      rig.human.setAnim(fr.anim);
      const p = poseAt(def, fr.frame, fr.frames, JOINTS, SCALARS);
      applyPose(rig.human, p);
      rig.human.post(p);
      rig.body.skin();
      rig.crumble(p.crumble ?? 0);
      rig.restore(); rig.fade(p.fade ?? 0);
      rig.group.rotation.y = dirYaw(fr.dir);
    },
  };
}
