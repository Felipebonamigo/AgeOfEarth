// Corpo ESCULPIDO sobre o esqueleto do rig humano (Etapa 6, lote bípedes-espíritos; docs/ART.md Apêndice G): no lugar
// das cápsulas do rig humano (boas a 24 px de altura, de manequim no ciclope de 3,6 m ou no colosso de 5 m), um tronco
// em anéis de superelipse com peitorais, abdome, barriga, escápulas, coluna e glúteos; membros torneados (bíceps,
// antebraço, coxa, panturrilha, joelho e cotovelo), punhos, pés com calcanhar e dedos e a cabeça com crânio, mandíbula,
// nariz, arcada, órbitas e orelhas — tudo determinístico (ruído por hash de organic.js) e preso aos MESMOS pivôs do
// humano, então as poses de art/poses/human.json (e as dos lotes) continuam servindo.
//
//   dressBody(THREE, M, human, opts) → { mat, parts, feet, profile, band, skirt, paintAll }
//     human   o rig de buildHuman(…, { meters: true }) (a cabeça e os itens do kit ficam; o corpo de cápsulas some)
//     opts    build 'heroic' (atlético: estátua, colosso, centauro) · 'brute' (ciclope: barril, barriga, pescoço grosso,
//             mãos enormes) · 'female' (Medusa) · 'gaunt' (a Sombra: descarnado); bulk (largura extra, 1 = normal);
//             tone 'tan' · 'ruddy' (sol e pelos) · 'gorgon' (verde-acinzentado) — cor por vértice; legs false (centauro,
//             Medusa: sem pernas); head 'male' · 'female' · 'cyclops' · 'none' (a do kit, se houver elmo); hair e beard
//     band(y, tilt, width, mat, off)   faixa sobre a superfície do tronco (talabarte, cinto) — segue o corpo esculpido
//     skirt(y0, y1, mat, { flare, folds, jag, off })   saia/tanga/pano que sai do tronco e abre para baixo
// O tronco vem em duas malhas (bacia no pivô `root`, peito no `torso`), que se sobrepõem na cintura: o cinto/saia de
// todo bicho do lote cobre a emenda quando o tronco dobra. Metros, frente em −z, pés em y = 0.

import { paint, mottle, mix, smooth, fbm3, shaggy, taperTube } from './organic.js';

const UPPER = 0.28, FORE = 0.27, SHIN = 0.44;
const g = (u, w) => Math.exp(-(u / w) * (u / w));

/** Tipos de corpo: fatores de largura por região e intensidade dos músculos. */
export const BODY_BUILDS = {
  heroic: { sh: 1, chest: 1, waist: 0.9, hip: 0.96, belly: 0, bust: 0, muscle: 1, limb: 1, neck: 1, hand: 1, ribs: 0 },
  brute: { sh: 1.1, chest: 1.12, waist: 1.14, hip: 1.04, belly: 1, bust: 0, muscle: 0.55, limb: 1.22, neck: 1.55, hand: 1.3, ribs: 0 },
  female: { sh: 0.84, chest: 0.86, waist: 0.72, hip: 1.02, belly: 0, bust: 1, muscle: 0.12, limb: 0.8, neck: 0.78, hand: 0.82, ribs: 0 },
  gaunt: { sh: 0.95, chest: 0.9, waist: 0.74, hip: 0.86, belly: -0.35, bust: 0, muscle: 0.35, limb: 0.78, neck: 0.8, hand: 0.95, ribs: 1 },
};
/** Tons de pele (cor por vértice): base, sombra (pernas, dorso), quente (rosto, ombros, joelhos) e pelos. */
export const TONES = {
  tan: { base: 0xb78662, dark: 0x8a5d40, warm: 0xc07a5c, hair: 0x6e4a34, hairy: 0.15 },
  ruddy: { base: 0xb57b56, dark: 0x7d5037, warm: 0xc06a50, hair: 0x4a3122, hairy: 0.6 },
  gorgon: { base: 0x9aa887, dark: 0x66734f, warm: 0xa9a67a, hair: 0x4e5a3a, hairy: 0 },
  pale: { base: 0xc9a488, dark: 0x9c765a, warm: 0xd08c74, hair: 0x6e4a34, hairy: 0 },
};

/** Perfil do tronco (y no tronco, a = meia-largura, b = meia-profundidade, c = z do centro; frente em −z). */
function torsoKeys(B) {
  const k = [
    [-0.17, 0.09, 0.07, 0.02, 'hip'], [-0.13, 0.165, 0.11, 0.02, 'hip'], [-0.05, 0.196, 0.124, 0.022, 'hip'],
    [0.04, 0.182, 0.118, 0.004, 'hip'], [0.13, 0.152, 0.112, -0.004, 'waist'], [0.23, 0.162, 0.118, -0.006, 'chest'],
    [0.33, 0.185, 0.128, -0.01, 'chest'], [0.43, 0.212, 0.13, -0.006, 'chest'], [0.505, 0.24, 0.116, 0.008, 'sh'],
    [0.565, 0.19, 0.092, 0.016, 'sh'], [0.6, 0.12, 0.078, 0.016, 'neck'], [0.625, 0.074, 0.068, 0.014, 'neck'], [0.7, 0.058, 0.058, 0.006, 'neck'], [0.78, 0.05, 0.05, 0.0, 'neck'],
  ];
  return k.map(([y, a, b, c, reg]) => {
    const f = B[reg];
    // a barriga do brutamontes aprofunda a cintura; o busto não mexe no perfil (é relevo)
    const bb = reg === 'waist' || (reg === 'hip' && y > 0) ? b * (1 + 0.25 * Math.max(0, B.belly)) : b;
    return [y, a * f, bb * (reg === 'neck' ? f : 0.55 + 0.45 * f), c];
  });
}
/** Interpolação Catmull-Rom de uma coluna do perfil em y. */
function profileAt(keys, y) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1][0] < y) i++;
  const p0 = keys[Math.max(0, i - 1)], p1 = keys[i], p2 = keys[i + 1], p3 = keys[Math.min(keys.length - 1, i + 2)];
  const t = Math.max(0, Math.min(1, (y - p1[0]) / (p2[0] - p1[0])));
  const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  return { a: cr(p0[1], p1[1], p2[1], p3[1]), b: cr(p0[2], p1[2], p2[2], p3[2]), c: cr(p0[3], p1[3], p2[3], p3[3]) };
}
const SE = 2.35;   // expoente da superelipse (um pouco "quadrada": costas e peito planos, flancos arredondados)
const sgnPow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

/** Relevo muscular (m, para fora) num ponto do tronco: `side` = cosθ (±1 nos flancos), `front` = −sinθ (1 na frente). */
function torsoRelief(B, x, y, front) {
  const m = B.muscle, back = -front;
  let d = 0;
  if (front > 0) {
    const f = Math.pow(front, 1.5);
    for (const s of [-1, 1]) {
      // peitorais: a borda de baixo é um vinco (gaussiana mais estreita abaixo do centro)
      d += 0.024 * m * f * g(x - s * 0.095, 0.075) * g(y - 0.415, y < 0.415 ? 0.032 : 0.07);
      // busto
      d += 0.05 * B.bust * f * g(x - s * 0.083, 0.052) * g(y - 0.395, y < 0.395 ? 0.045 : 0.07);
      // costelas (descarnado)
      d += 0.005 * B.ribs * f * Math.max(0, Math.sin((y - 0.2) * 2 * Math.PI / 0.045)) * smooth(0.18, 0.24, y) * smooth(0.46, 0.4, y) * g(Math.abs(x) - 0.1, 0.07);
    }
    // abdome (gomos), linha alba e umbigo; barriga do brutamontes (e o ventre fundo do descarnado)
    const abs = smooth(0.08, 0.13, y) * smooth(0.34, 0.3, y);
    d += 0.007 * m * f * abs * g(x, 0.07) * (0.5 + 0.5 * Math.cos((y - 0.1) * 2 * Math.PI / 0.075));
    d -= 0.004 * m * f * g(x, 0.012) * abs;
    d -= 0.006 * f * g(x, 0.012) * g(y - 0.12, 0.014);
    d += 0.05 * B.belly * f * g(x, 0.15) * g(y - 0.1, y > 0.1 ? 0.13 : 0.1);
    // clavículas
    d += 0.006 * m * f * g(y - 0.535, 0.012) * smooth(0.02, 0.05, Math.abs(x)) * smooth(0.19, 0.14, Math.abs(x));
  }
  if (back > 0) {
    const bk = Math.pow(back, 1.5);
    d -= 0.008 * bk * g(x, 0.02) * smooth(0.0, 0.08, y) * smooth(0.58, 0.5, y);                       // sulco da coluna
    for (const s of [-1, 1]) {
      d += 0.015 * m * bk * g(x - s * 0.1, 0.06) * g(y - 0.45, 0.06);                                // escápulas
      d += (0.03 + 0.012 * B.bust) * bk * g(x - s * 0.075, 0.07) * g(y + 0.065, 0.06);               // glúteos
      d += 0.012 * m * bk * g(x - s * 0.13, 0.05) * g(y - 0.3, 0.1);                                 // dorsais
    }
    d += 0.035 * (B.neck - 1) * bk * g(x, 0.12) * g(y - 0.57, 0.05);                                // cachaço (brutamontes)
  }
  return d;
}

/** Tronco em anéis de superelipse de y0 a y1 (com tampa embaixo), relevo muscular incluído. */
function torsoGeo(THREE, B, keys, y0, y1, { segs = 30, step = 0.018, capBottom = true } = {}) {
  const rings = Math.max(2, Math.round((y1 - y0) / step) + 1);
  const pos = [], idx = [];
  for (let r = 0; r < rings; r++) {
    const y = y0 + (y1 - y0) * (r / (rings - 1));
    const { a, b, c } = profileAt(keys, y);
    for (let i = 0; i < segs; i++) {
      const th = (i / segs) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
      const sx = sgnPow(cs, 2 / SE), sz = sgnPow(sn, 2 / SE);
      // normal aproximada da superelipse (para o relevo sair para fora)
      let nx = sx / a, nz = sz / b; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      const x0 = a * sx, d = torsoRelief(B, x0, y, -sn);
      pos.push(x0 + nx * d, y, c + b * sz + nz * d);
    }
  }
  for (let r = 0; r < rings - 1; r++) for (let i = 0; i < segs; i++) {
    const a0 = r * segs + i, a1 = r * segs + ((i + 1) % segs), b0 = a0 + segs, b1 = a1 + segs;
    idx.push(a0, b0, a1, a1, b0, b1);   // normal para fora (θ cresce de +x para +z, os anéis sobem)
  }
  if (capBottom) {
    const { c } = profileAt(keys, y0);
    const ci = pos.length / 3; pos.push(0, y0 - 0.025, c);
    for (let i = 0; i < segs; i++) idx.push(ci, i, (i + 1) % segs);   // tampa virada para baixo
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Membro torneado (LatheGeometry) do pivô (y = 0) até −L: `radii` = [[t, r], …] (t de 0 no pivô a 1 na ponta),
 * `bulge` = [[t, largura, amp, lado]] com lado −1 = frente (−z), 1 = trás, 0 = em volta; `flat` achata em z.
 */
function limbGeo(THREE, L, radii, { bulge = [], flat = 1, segs = 16, steps = 14 } = {}) {
  const rAt = (t) => {
    let i = 0; while (i < radii.length - 2 && radii[i + 1][0] < t) i++;
    const [t0, r0] = radii[i], [t1, r1] = radii[i + 1];
    const u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
    return r0 + (r1 - r0) * (u * u * (3 - 2 * u));
  };
  const pts = [];
  for (let k = steps; k >= 0; k--) { const t = k / steps; pts.push(new THREE.Vector2(Math.max(0.004, rAt(t)), -t * L)); }
  const geo = new THREE.LatheGeometry(pts, segs);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = -y / L, rl = Math.hypot(x, z) || 1, nx = x / rl, nz = z / rl;
    let d = 0;
    for (const [bt, w, amp, side] of bulge) {
      const facing = side === 0 ? 1 : Math.max(0, side * nz);
      d += amp * g(t - bt, w) * Math.pow(facing, 1.2);
    }
    x += nx * d; z += nz * d;
    p.setXYZ(i, x, y, z * flat);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Elipsoide esculpível (esfera unitária → raios) com função de deslocamento opcional em coordenadas da esfera. */
function blob(THREE, r, fn = null, ws = 18, hs = 12) {
  const geo = new THREE.SphereGeometry(1, ws, hs);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i), w = p.getZ(i);
    const q = fn ? fn(u, v, w) : [u, v, w];
    p.setXYZ(i, q[0] * r[0], q[1] * r[1], q[2] * r[2]);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Cabeça: `kind` 'male' (crânio, mandíbula quadrada, arcada, órbitas, maçãs, queixo), 'female' (rosto mais estreito e
 * liso) ou 'cyclops' (crânio largo e baixo, uma órbita grande no meio da testa sob a arcada única, nariz largo e
 * achatado, mandíbula pesada). Centro do crânio em (0, 0.12, 0) do pivô `head`. Devolve { group, skull, eyeAt }.
 */
function headGeo(THREE, kind) {
  const cyc = kind === 'cyclops', fem = kind === 'female';
  const R = cyc ? [0.104, 0.118, 0.112] : fem ? [0.084, 0.108, 0.097] : [0.088, 0.112, 0.1];
  return blob(THREE, R, (u, v, w) => {
    const front = Math.max(0, -w), back = Math.max(0, w);
    let x = u, y = v, z = w;
    // mandíbula e queixo: a parte de baixo afina para o queixo (menos no ciclope e no masculino: mandíbula quadrada)
    const low = smooth(-0.1, -0.95, v);
    x *= 1 - low * (fem ? 0.34 : cyc ? 0.08 : 0.18);
    z -= front * low * (fem ? 0.02 : 0.08);                                   // queixo à frente
    y -= low * 0.06;
    // occipital atrás e testa: o ciclope tem a testa baixa e fugidia
    z += back * smooth(-0.2, 0.5, v) * 0.1;
    if (cyc) { z += front * smooth(0.35, 0.9, v) * 0.18; y -= smooth(0.5, 1, v) * 0.08; }
    // arcada supraciliar: uma só, pesada, no ciclope; duas no masculino
    const brow = cyc ? 0.12 * g(u, 0.6) * g(v - 0.32, 0.14) : (fem ? 0.03 : 0.07) * g(Math.abs(u) - 0.35, 0.3) * g(v - 0.27, 0.12);
    z -= front * brow;
    // órbitas (os olhos ficam na sombra da arcada): uma grande no meio do ciclope
    const orb = cyc ? 0.16 * g(u, 0.32) * g(v - 0.06, 0.2) : 0.07 * g(Math.abs(u) - 0.36, 0.17) * g(v - 0.12, 0.12);
    z += front * orb;
    // maçãs do rosto e mandíbula larga
    x *= 1 + 0.06 * g(v + 0.08, 0.25) * (cyc ? 1.6 : 1);
    return [x, y, z];
  }, 28, 20);
}

/** Pinta um mesh com `fn(x, y, z)` no espaço do rig em repouso (`root`), clonando a geometria. */
function paintRest(THREE, o, root, fn) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
  o.geometry = o.geometry.clone();
  paint(THREE, o.geometry, fn, m);
}

/** Material de pele (branco × cor por vértice), um por conjunto de materiais. */
export function skinMaterial(THREE, M) {
  return (M.__skinV ??= new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.66, metalness: 0, vertexColors: true }));
}

/**
 * Veste o esqueleto de `human` (buildHuman em metros) com o corpo esculpido. Esconde as cápsulas de pele, o tronco
 * da armadura 'bare' e as sandálias; o resto do kit (elmo, capa, aljava, armas, escudo, talabarte) fica.
 */
export function dressBody(THREE, M, human, opts = {}) {
  const O = { build: 'heroic', bulk: 1, tone: 'tan', legs: true, head: 'male', hair: 'short', beard: 'none', ...opts };
  const B = BODY_BUILDS[O.build] ?? BODY_BUILDS.heroic, T = TONES[O.tone] ?? TONES.tan;
  const J = human.joints;
  const mat = O.mat ?? skinMaterial(THREE, M);
  const parts = { body: [], limbs: {}, head: null, extra: [] };
  const mesh = (geo, m, x, y, z, parent, list = parts.body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); list.push(o); return o; };

  // ---- esconde o corpo de cápsulas (e o tronco da armadura 'bare', o cinto dela e as sandálias) ----
  const feetSet = new Set(human.feet);
  human.group.traverse((o) => {
    if (!o.isMesh) return;
    const armorBare = o.parent === J.torso && ((o.material === M.linen && o.geometry.type === 'CylinderGeometry') || (o.material === M.leather && o.geometry.type === 'TorusGeometry' && Math.abs(o.position.y - 0.11) < 0.02));
    if (o.material === M.skin || armorBare || feetSet.has(o)) o.visible = false;
  });

  // ---- proporções: ombros e quadris pelo tipo de corpo (e pela largura extra) ----
  const bulk = O.bulk;
  for (const s of ['L', 'R']) J['shoulder' + s].position.x *= B.sh * bulk;
  for (const s of ['L', 'R']) J['hip' + s].position.x *= Math.sqrt(B.hip * bulk);
  const keys = torsoKeys(B);
  const W = (geo) => { geo.scale(bulk, 1, bulk * 0.97); return geo; };

  // ---- tronco: bacia (pivô root) e peito/pescoço (pivô torso), sobrepostos na cintura ----
  const yTop = O.head === 'none' ? 0.7 : 0.8;
  // UMA malha só, no pivô root, com "pele" de dois ossos refeita a cada pose (`skin`): a bacia segue o root, do umbigo
  // para cima segue o tronco (a dobra da cintura não abre fresta nem mostra tampa) e o pescoço acompanha a cabeça
  const torso = mesh(W(torsoGeo(THREE, B, keys, O.legs ? -0.17 : -0.02, yTop)), mat, 0, 0, 0, J.root);
  parts.torso = torso;
  const L = B.limb * Math.sqrt(bulk), mu = B.muscle;

  // ---- braços ----
  for (const s of ['L', 'R']) {
    const sh = J['shoulder' + s], el = J['elbow' + s];
    // deltoide: calota sobre o ombro, presa ao braço (acompanha o levantar)
    mesh(blob(THREE, [0.066 * L, 0.082 * L, 0.07 * L], (u, v, w) => [u * (1 - 0.25 * smooth(0.2, -1, v)), v, w * (1 - 0.2 * smooth(0.2, -1, v))]), mat, 0, -0.035, 0.0, sh);
    mesh(limbGeo(THREE, UPPER, [[0, 0.07], [0.3, 0.066], [0.55, 0.058], [0.85, 0.048], [1, 0.046]].map(([t, r]) => [t, r * L]),
      { bulge: [[0.5, 0.2, 0.014 * (0.5 + mu) * L, -1], [0.35, 0.22, 0.01 * (0.5 + mu) * L, 1]], flat: 0.92 }), mat, 0, 0, 0, sh);
    mesh(blob(THREE, [0.047 * L, 0.047 * L, 0.047 * L]), mat, 0, 0, 0, el);                                        // cotovelo
    mesh(limbGeo(THREE, FORE - 0.035, [[0, 0.047], [0.25, 0.05], [0.6, 0.04], [1, 0.032]].map(([t, r]) => [t, r * L]),
      { bulge: [[0.22, 0.2, 0.008 * (0.5 + mu) * L, 0]], flat: 0.82 }), mat, 0, 0, 0, el);
    // punho fechado (segura arma/arco pelo pivô da mão, em −FORE): palma, dedos dobrados e o polegar por cima
    const hk = B.hand * Math.sqrt(bulk);
    const fist = mesh(blob(THREE, [0.042 * hk, 0.052 * hk, 0.046 * hk], (u, v, w) => [u * (1 - 0.15 * Math.max(0, v)), v, w - 0.18 * Math.max(0, -w) * smooth(-0.3, 0.6, v)]), mat, 0, -FORE + 0.005, 0.0, el);
    mesh(blob(THREE, [0.017 * hk, 0.03 * hk, 0.017 * hk]), mat, (s === 'L' ? 0.03 : -0.03) * hk, -FORE + 0.02, -0.02 * hk, el).rotation.z = s === 'L' ? -0.5 : 0.5;
    parts.limbs['hand' + s] = fist;
  }

  // ---- pernas (sem elas no centauro e na Medusa) ----
  const feet = [];
  if (O.legs) for (const s of ['L', 'R']) {
    const hp = J['hip' + s], kn = J['knee' + s];
    // coxa: começa numa cúpula DENTRO da bacia (8 cm acima do pivô do quadril), sem borda aberta saindo do flanco
    mesh(limbGeo(THREE, 0.52, [[0, 0.025], [0.1, 0.08], [0.25, 0.09], [0.62, 0.072], [0.9, 0.055], [1, 0.052]].map(([t, r]) => [t, r * L]),
      { bulge: [[0.5, 0.22, 0.014 * (0.5 + mu) * L, -1], [0.36, 0.22, 0.008 * L, 1]], flat: 0.95 }), mat, 0, 0.08, 0, hp);
    mesh(blob(THREE, [0.056 * L, 0.058 * L, 0.058 * L]), mat, 0, 0, 0, kn);                                       // joelho
    mesh(blob(THREE, [0.026 * L, 0.03 * L, 0.016 * L]), mat, 0, -0.012, -0.044 * L, kn);                            // patela
    mesh(limbGeo(THREE, 0.4, [[0, 0.054], [0.28, 0.062], [0.7, 0.04], [1, 0.034]].map(([t, r]) => [t, r * L]),
      { bulge: [[0.3, 0.18, 0.016 * L, 1]], flat: 0.96 }), mat, 0, 0, 0, kn);
    // pé: calcanhar atrás do tornozelo, peito do pé descendo aos dedos; sola em y = 0 com a perna esticada
    const fk = (O.build === 'brute' ? 1.04 : 1) * Math.sqrt(Math.sqrt(L));
    const foot = mesh(blob(THREE, [0.044 * fk, 0.052, 0.112 * fk], (u, v, w) => {
      const toe = smooth(0.2, -0.95, w), heel = smooth(0.3, 1, w);          // para a frente (−z) o peito do pé desce
      return [u * (1 + 0.18 * toe - 0.08 * heel), v > 0 ? v * (1 - 0.7 * toe) : Math.max(-0.92, v), w];
    }), mat, 0, -SHIN - 0.04 + 0.052 * 0.92, -0.036 * fk, kn);
    feet.push(foot);
  }

  // ---- cabeça ----
  let skull = null;
  if (O.head !== 'none') {
    for (const o of J.head.children) if (o.isMesh && o.material === M.skin) o.visible = false;
    skull = mesh(headGeo(THREE, O.head), mat, 0, 0.12, 0.005, J.head);
    // nariz (cunha), orelhas
    const cyc = O.head === 'cyclops';
    const nose = mesh(blob(THREE, cyc ? [0.03, 0.03, 0.03] : [0.014, 0.03, 0.02], (u, v, w) => [u * (1 + 0.4 * smooth(0.5, -1, v)), v, w - 0.5 * Math.max(0, -w) * smooth(0.8, -0.6, v)]), mat, 0, cyc ? 0.07 : 0.1, cyc ? -0.108 : -0.093, J.head);
    nose.rotation.x = cyc ? 0.25 : 0.15;
    for (const s of [-1, 1]) {
      const ear = mesh(blob(THREE, cyc ? [0.014, 0.04, 0.03] : [0.011, 0.028, 0.019]), mat, s * (cyc ? 0.106 : 0.088), cyc ? 0.1 : 0.115, cyc ? 0.0 : 0.005, J.head);
      ear.rotation.y = s * -0.35;
    }
    parts.head = skull;
  }

  // ---- cor por vértice (tom, sombra embaixo, calor nos ombros/joelhos/rosto, pelos) ----
  const rootG = human.group;
  const skinAt = (x, y, z) => {
    const H = 1.8;   // altura de referência do esqueleto
    let c = mix(T.base, T.dark, 0.45 * smooth(0.95, 0.1, y) + 0.2 * smooth(0, 0.12, z) * smooth(1.1, 1.4, y));
    // calor: rosto, ombros e joelhos
    c = mix(c, T.warm, 0.35 * g(y - 1.62, 0.1) + 0.2 * g(y - 1.42, 0.05) * smooth(0.12, 0.25, Math.abs(x)) + 0.18 * g(y - 0.47, 0.05));
    // pelos (peito, barriga, antebraços e canelas do ciclope)
    if (T.hairy > 0) {
      const zone = g(y - 1.25, 0.2) * g(x, 0.14) * smooth(0.02, -0.05, z) + g(y - 0.3, 0.14) + 0.6 * g(y - 1.05, 0.08) * smooth(0.3, 0.45, Math.abs(x));
      const n = fbm3(x * 38, y * 38, z * 38);
      c = mix(c, T.hair, T.hairy * Math.min(1, zone) * smooth(0.38, 0.62, n));
    }
    void H;
    return mottle(c, 0.07, x, y, z, 16, 3);
  };
  const paintAll = (fn = skinAt) => { for (const o of parts.body) paintRest(THREE, o, rootG, fn); };
  /** Rosto (no espaço da malha do crânio, centro na origem): órbitas escuras, sobrancelhas, lábios. */
  const faceAt = (base) => (x, y, z) => {
    const cyc = O.head === 'cyclops', front = smooth(0.0, -0.06, z);
    let c = base(x, y, z);
    const orb = cyc ? g(x, 0.034) * g(y - 0.01, 0.03) : g(Math.abs(x) - 0.031, 0.016) * g(y - 0.012, 0.014);
    c = mix(c, T.dark, 0.55 * orb * front);
    if (O.head !== 'female') c = mix(c, T.hair, 0.5 * front * (cyc ? g(y - 0.045, 0.01) * g(x, 0.06) : g(y - 0.03, 0.007) * g(Math.abs(x) - 0.032, 0.022)));
    c = mix(c, T.warm, 0.35 * front * g(y + 0.052, 0.008) * g(x, cyc ? 0.035 : 0.022));
    return c;
  };
  if (!O.mat) {
    paintAll();
    if (skull) {
      // o crânio de novo, com o rosto por cima do tom (coordenadas da malha: centro do crânio na origem)
      skull.updateMatrixWorld(true); rootG.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(rootG.matrixWorld).invert().multiply(skull.matrixWorld);
      const v = new THREE.Vector3();
      paint(THREE, skull.geometry, faceAt((x, y, z) => { v.set(x, y, z).applyMatrix4(inv); return skinAt(v.x, v.y, v.z); }));
    }
  }

  // ---- faixas e saias sobre o corpo esculpido ----
  /** Superfície do tronco no ângulo θ e altura y (com o relevo), afastada `off` m. */
  const surf = (th, y, off) => {
    const { a, b, c } = profileAt(keys, y), cs = Math.cos(th), sn = Math.sin(th);
    const sx = sgnPow(cs, 2 / SE), sz = sgnPow(sn, 2 / SE);
    let nx = sx / a, nz = sz / b; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const x0 = a * sx, d = torsoRelief(B, x0, y, -sn) + off;
    return [(x0 + nx * d) * bulk, y, (c + b * sz + nz * d) * bulk * 0.97];
  };
  /**
   * Faixa sobre o tronco (talabarte com `tilt` rad: sobe para o lado +x; cinto com 0), largura `w`, no pivô do peito
   * (y ≥ 0,1) ou da bacia. Borda de couro opcional (`edge`).
   */
  const band = (yc, tilt, w, m, { off = 0.012, edge = null, parent = null, segs = 40 } = {}) => {
    const pos = [], idx = [], t = Math.tan(tilt);
    for (let i = 0; i <= segs; i++) {
      const th = (i / segs) * Math.PI * 2;
      for (const e of [-1, 1]) {
        const { a } = profileAt(keys, yc);
        const y = yc + t * a * Math.cos(th) + e * w / 2;
        pos.push(...surf(th, y, off));
      }
    }
    for (let i = 0; i < segs; i++) { const a0 = i * 2, b0 = a0 + 2; idx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; (parent ?? (yc > 0.12 ? J.torso : J.root)).add(o);
    if (edge) for (const e of [-1, 1]) band(yc + e * w / 2, tilt, 0.016, edge, { off: off + 0.003, parent, segs });
    parts.extra.push(o);
    return o;
  };
  /**
   * Saia/tanga/pano: sai do tronco em y0 e desce até y1 abrindo `flare` (fração da largura), com `folds` pregas e barra
   * recortada (`jag`, m) — couro, pano de time, mármore ou bronze.
   */
  const skirt = (y0, y1, m, { flare = 0.35, folds = 0, foldAmp = 0.012, jag = 0, jagFreq = 3, off = 0.014, segs = 36, rings = 8, seed = 1, front = 1, parent = null, color = null, t0 = 0, t1 = 1, lift = 0 } = {}) => {
    const pos = [], idx = [];
    for (let r = 0; r <= rings; r++) {
      const t = t0 + (t1 - t0) * (r / rings), y = y0 + (y1 - y0) * t;
      for (let i = 0; i <= segs; i++) {
        const th = (i / segs) * Math.PI * 2;
        // o pano sai da cintura (y0) e abre; nunca entra no corpo (glúteos, coxas): fica por fora do que estiver mais longe
        const pt = surf(th, y0, off), pb = surf(th, Math.max(-0.1, Math.min(y0, y)), off + 0.01);
        const rt = Math.hypot(pt[0], pt[2]), rb = Math.hypot(pb[0], pb[2]), p = rb > rt ? [pt[0] * rb / rt, 0, pt[2] * rb / rt] : pt;
        const k = 1 + flare * t * t * (0.6 + 0.4 * t) + (folds ? foldAmp * Math.sin(th * folds + seed) * t / 0.2 : 0);
        // a frente (sinθ < 0) pode ficar mais curta (tanga): `front` < 1 encurta a barra na frente
        const cut = front < 1 ? (1 - front) * Math.max(0, -Math.sin(th)) : 0;
        let yy = y0 + (y1 - y0) * t * (1 - cut);
        // barra recortada: o recorte vale na barra e sobe junto (t1 < 1 = só uma faixa da saia, a barra de outra cor)
        if (jag) yy += jag * (fbm3(Math.cos(th) * jagFreq + seed, Math.sin(th) * jagFreq, seed) - 0.5) * 2 * smooth(0.6, 1, t);
        pos.push(p[0] * k * (1 + lift), yy, p[2] * k * (1 + lift));
      }
    }
    for (let r = 0; r < rings; r++) for (let i = 0; i < segs; i++) {
      const a0 = r * (segs + 1) + i, b0 = a0 + segs + 1;
      idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; (parent ?? J.root).add(o);
    if (color) paint(THREE, geo, color);
    parts.extra.push(o);
    return o;
  };

  // ---- pele do tronco: bacia → tronco → cabeça (pesos pela altura; o pivô do tronco está na origem do root) ----
  // (a geometria pode ser trocada depois — acabamento, pintura —, então `skin` lê a atual; o repouso fica aqui)
  const rest = Float32Array.from(torso.geometry.attributes.position.array);
  const HEAD_Y = J.head.position.y;
  const qT = new THREE.Quaternion(), qH = new THREE.Quaternion(), v = new THREE.Vector3(), w = new THREE.Vector3();
  const skin = () => {
    const tp = torso.geometry.attributes.position;
    qT.copy(J.torso.quaternion); qH.copy(J.head.quaternion);
    const hs = J.head.scale.x;
    for (let i = 0; i < tp.count; i++) {
      const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
      const wt = smooth(-0.04, 0.22, y), wh = smooth(0.64, 0.78, y);
      // parte da cabeça: gira em volta do pivô dela (no espaço do tronco) e acompanha a escala dela
      v.set(x, y - HEAD_Y, z);
      if (wh > 0) { w.copy(v).multiplyScalar(hs).applyQuaternion(qH); v.lerp(w, wh); }
      v.y += HEAD_Y;
      // parte do tronco: gira com o tronco
      if (wt > 0) { w.copy(v).applyQuaternion(qT); v.lerp(w, wt); }
      tp.setXYZ(i, v.x, v.y, v.z);
    }
    tp.needsUpdate = true;
    torso.geometry.computeVertexNormals();
  };
  skin();

  return { mat, parts, feet, profile: (y) => profileAt(keys, y), surf, band, skirt, paintAll, skinAt, tone: T, B, bulk, skin };
}

/**
 * Cabelo: 'short' (calota rente), 'curls' (cachos arcaicos em bolotas: estátua), 'wild' (juba desgrenhada do ciclope),
 * 'long' (feminino, descendo às costas), 'snakes' (Medusa: serpentes saindo da cabeça, cada uma com a cabeça e a
 * língua) e barba 'full'. `mat` com cor por vértice (`color` = cor base). Devolve as malhas.
 */
export function addHair(THREE, head, mat, { style = 'short', beard = 'none', color = 0x2e2118, scale = 1, seed = 3, cyclops = false, snakeColor = null } = {}) {
  const out = [];
  const add = (geo, x, y, z, m = mat) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; head.add(o); out.push(o); return o; };
  const col = (base, amt = 0.14, f = 40) => (x, y, z) => mottle(base, amt, x, y, z, f, seed);
  const R = cyclops ? [0.112, 0.12, 0.118] : [0.095, 0.112, 0.104];
  if (style === 'short' || style === 'curls' || style === 'wild' || style === 'long') {
    // calota: a parte de cima e de trás do crânio, com a linha do cabelo na testa
    const cap = blob(THREE, R.map((r) => r * 1.06 * scale), (u, v, w) => {
      const keep = v > (w < 0 ? 0.25 + 0.2 * (1 - Math.abs(u)) : -0.55 + (style === 'long' ? -0.35 : 0));
      return keep ? [u, v, w] : [u * 0.96, Math.max(v, 0.2) * 0.96, w * 0.96];
    }, 22, 16);
    if (style === 'curls') shaggy(cap, 0.012, 95, seed);
    else if (style === 'wild') shaggy(cap, 0.028, 32, seed);
    else shaggy(cap, 0.006, 60, seed);
    paint(THREE, cap, col(color));
    add(cap, 0, 0.13, 0.012);
    if (style === 'long') {
      const back = blob(THREE, [0.1 * scale, 0.16 * scale, 0.05 * scale]); shaggy(back, 0.01, 40, seed); paint(THREE, back, col(color));
      add(back, 0, 0.02, 0.07);
    }
    if (style === 'wild') {
      // mechas caindo pela nuca e pelos lados
      const mane = blob(THREE, [0.13, 0.09, 0.08]); shaggy(mane, 0.03, 26, seed + 1); paint(THREE, mane, col(color));
      add(mane, 0, 0.06, 0.07);
    }
  }
  if (beard === 'full') {
    const bd = blob(THREE, cyclops ? [0.1, 0.1, 0.075] : [0.07, 0.075, 0.055], (u, v, w) => [u, v - 0.35 * Math.max(0, -v) * Math.max(0, -w), w]);
    shaggy(bd, cyclops ? 0.022 : 0.01, 34, seed + 2); paint(THREE, bd, col(color));
    add(bd, 0, cyclops ? 0.02 : 0.035, cyclops ? -0.06 : -0.05);
  }
  if (style === 'snakes') {
    // cabeleira de serpentes: 16 cobras saindo do crânio em volta (mais para trás e para os lados), curvas, afinando
    // até a cabeça de cada uma; escamas por vértice (dorso escuro, barriga clara)
    const sc = snakeColor ?? { back: 0x3a5226, belly: 0xb8b27a };
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.2 * Math.sin(i * 2.3);
      const ca = Math.cos(a), sa = Math.sin(a);
      const up = 0.55 + 0.35 * Math.abs(Math.sin(i * 1.7));      // inclinação para cima
      const len = 0.16 + 0.06 * ((i * 7) % 5) / 4;
      const base = [ca * 0.075, 0.18 + 0.02 * Math.cos(i), sa * 0.07 + 0.01];
      const dir = [ca, up, sa * 0.9 + (sa > 0 ? 0.3 : 0)];
      const dl = Math.hypot(...dir); dir[0] /= dl; dir[1] /= dl; dir[2] /= dl;
      const side = [-sa, 0, ca];
      const pts = [];
      for (let k = 0; k <= 5; k++) {
        const t = k / 5, wv = Math.sin(t * Math.PI * 2 + i) * 0.03 * t;
        const droop = -0.12 * t * t;                              // o peso curva a ponta para baixo
        pts.push([base[0] + dir[0] * len * t + side[0] * wv, base[1] + dir[1] * len * t + droop * len, base[2] + dir[2] * len * t + side[2] * wv]);
      }
      const tube = taperTube(THREE, pts, 0.016, 0.007, { tubular: 12, radial: 6 });
      // escamas: faixas escuras ao longo do corpo da cobra sobre o verde, manchas claras
      paint(THREE, tube, (x, y, z) => mottle(mix(sc.back, sc.belly, 0.2 + 0.25 * Math.sin((x + y + z) * 90 + i)), 0.2, x, y, z, 70, i));
      add(tube, 0, 0, 0);
      // cabeça da cobra na ponta, virada para fora (o eixo longo, z, na direção da ponta)
      const hp = pts[5], hd = new THREE.Vector3(hp[0] - pts[4][0], hp[1] - pts[4][1], hp[2] - pts[4][2]).normalize();
      const hg = blob(THREE, [0.012, 0.009, 0.02]); paint(THREE, hg, () => sc.back);
      const hm = add(hg, hp[0] + hd.x * 0.012, hp[1] + hd.y * 0.012, hp[2] + hd.z * 0.012);
      hm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hd);
    }
  }
  return out;
}
