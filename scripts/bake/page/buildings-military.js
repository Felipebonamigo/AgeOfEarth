// Lote "militar" da Etapa 3 (docs/ART.md §1.8, §4 e Apêndice D): quartel, estábulo, oficina de cerco, fortaleza, portal
// dos titãs e as três maravilhas (Estátua de Zeus, Templo de Ártemis, Colosso). Mesmo contrato de buildings.js: modelos em
// METROS com a origem no centro da área ocupada, chão em y = 0, +x = leste, +z = sul (de frente para a câmera);
// `p.stage` 0–2 = obra (alicerce, meia altura, estrutura sem telhas/acabamento), 3 = pronto; o dano (damage1/2) é o
// genérico de buildings.js (applyDamage) aplicado ao modelo pronto — por isso as paredes usam os materiais de cantaria/
// reboco/mármore do kit (os que o dano reconhece) e os telhados, terracota.
//
// Portal dos titãs: além dos 6 estados, o estado `glow` (6 quadros em loop) é uma SOBREPOSIÇÃO só com a energia — o
// redemoinho do vórtice girando, as chamas dos braseiros tremulando e as runas/fendas pulsando —, com o resto do modelo
// como oclusor (só profundidade: o que está na frente esconde o brilho) e sem sombra. O renderizador desenha esses quadros
// por cima do edifício pronto (também danificado) com blend aditivo; o `complete` já traz um vórtice estático (ícone,
// fantasma e fallback continuam bons sem a animação).
//
// Escala: 1 tile = 2 m; humano 1,8 m. Quartel/estábulo/oficina 3×3 (6 m), fortaleza e maravilhas 4×4 (8 m), portal 5×5
// (10 m). Alturas contidas (≤ ~3 tiles visuais nas maravilhas, o resto ≤ 2) para não esconder tropas; as peças altas
// ficam no meio/fundo da área. Sem Math.random: as variações vêm de k.rand (semente por estilo/estado).

const TAU = Math.PI * 2;

// =================================================================================================================
// Materiais e texturas próprios do lote (fora de materials.js: não mudam o hash das unidades e props)

const EXTRA = new WeakMap();
function mats(k) {
  const { THREE, M } = k;
  let x = EXTRA.get(M);
  if (x) return x;
  const std = (color, roughness, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const glow = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  x = {
    sand: std(0xc4ad80, 1), dirt: std(0x7f6a4e, 1), hay: std(0xc6a65a, 0.95), hayDark: std(0x9a7e40, 0.95),
    water: std(0x335d6a, 0.12), oil: std(0x4a3a24, 0.16), ivory: std(0xeee2c8, 0.42), ebony: std(0x2c221b, 0.55),
    paintBlue: std(0x2d4f7e, 0.75), paintRed: std(0x8e3627, 0.8), rope: M.rope,
    fire: glow(0xff9636), fireCore: glow(0xffe09a), ember: glow(0xff6418), rune: glow(0xffb040),
  };
  EXTRA.set(M, x);
  return x;
}

/** Semente simples (mulberry32) para as texturas procedurais do vórtice (fixas: não dependem do estado). */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

const TEX = new Map();
/**
 * Texturas do vórtice (256²): 'base' = abismo opaco (quase preto no centro, vermelho-escuro, borda laranja) com três
 * braços fracos; 'arms' = só os braços luminosos (alfa = intensidade), a sobreposição animada do estado `glow`.
 */
function vortexTexture(THREE, kind) {
  if (TEX.has(kind)) return TEX.get(kind);
  const N = 256, data = new Uint8Array(N * N * 4), rnd = rng(kind === 'base' ? 1234 : 4321);
  const noise = Array.from({ length: 64 }, () => rnd());
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x + 0.5) / N * 2 - 1, dy = (y + 0.5) / N * 2 - 1, r = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
    const wob = noise[Math.floor(((a + Math.PI) / TAU) * 63.999)] * 0.12;
    const arm = 0.5 + 0.5 * Math.cos(3 * a + 7.5 * r + wob * 6);          // três braços em espiral
    const i = (y * N + x) * 4;
    if (kind === 'base') {
      const rim = smooth(0.55, 0.98, r), deep = 1 - smooth(0.0, 0.5, r);
      let cr = 70 + 150 * rim, cg = 14 + 80 * rim * rim, cb = 20 - 10 * rim;
      cr -= 50 * deep; cg -= 10 * deep; cb += 6 * deep;
      const k2 = 0.72 + 0.45 * Math.pow(arm, 3) * smooth(0.15, 0.6, r);
      data[i] = Math.min(255, Math.max(0, cr * k2)); data[i + 1] = Math.min(255, Math.max(0, cg * k2)); data[i + 2] = Math.min(255, Math.max(0, cb * k2 + 4));
      data[i + 3] = 255;
    } else {
      const ramp = smooth(0.12, 0.55, r) * (1 - smooth(0.86, 1.0, r));
      const al = Math.pow(arm, 4) * ramp;
      const hot = Math.pow(arm, 10);
      data[i] = 255; data[i + 1] = Math.round(120 + 110 * hot); data[i + 2] = Math.round(30 + 110 * hot);
      data[i + 3] = Math.round(255 * Math.min(1, al * 1.15));
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  TEX.set(kind, t);
  return t;
}

// =================================================================================================================
// Peças do lote

/** Cilindro entre dois pontos (metros, no grupo `parent`): lanças, pernas de guindaste, cordas, correntes. */
function rod(k, a, b, r, mat, parent, seg = 8) {
  const { THREE } = k;
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const m = k.mesh(new THREE.CylinderGeometry(r, r, len, seg), mat, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2, parent);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/** Fiadas de cantaria (tons alternados e juntas escuras) no retângulo, de y0 a y1. */
function courses(k, x0, x1, y0, y1, z0, z1, a, b, joint, ch = 0.6) {
  for (let y = y0, i = 0; y < y1 - 1e-6; y += ch, i++) {
    const yy = Math.min(y1, y + ch);
    k.block(x0, x1, y, yy, z0, z1, i % 2 ? b : a);
    if (joint && yy < y1 - 1e-6) k.block(x0 - 0.012, x1 + 0.012, yy - 0.02, yy + 0.02, z0 - 0.012, z1 + 0.012, joint);
  }
}

/** Merlões (quebráveis) ao longo de x (numa borda z) ou de z (numa borda x), a cada ~0,55 m. */
function merlonsX(k, x0, x1, z, y, mat, t = 0.24, h = 0.45) {
  const n = Math.max(1, Math.round((x1 - x0) / 0.55)), s = (x1 - x0) / n;
  for (let i = 0; i < n; i++) k.breakable(k.box(0.3, h, t, mat, x0 + (i + 0.5) * s, y + h / 2, z));
}
function merlonsZ(k, z0, z1, x, y, mat, t = 0.24, h = 0.45) {
  const n = Math.max(1, Math.round((z1 - z0) / 0.55)), s = (z1 - z0) / n;
  for (let i = 0; i < n; i++) k.breakable(k.box(t, h, 0.3, mat, x, y + h / 2, z0 + (i + 0.5) * s));
}
/** Parapeito com merlões em volta do retângulo (bordas externas). */
function parapet(k, x0, x1, z0, z1, y, mat, t = 0.24) {
  merlonsX(k, x0, x1, z0 + t / 2, y, mat, t); merlonsX(k, x0, x1, z1 - t / 2, y, mat, t);
  merlonsZ(k, z0 + 0.35, z1 - 0.35, x0 + t / 2, y, mat, t); merlonsZ(k, z0 + 0.35, z1 - 0.35, x1 - t / 2, y, mat, t);
}

/** Coluna jônica: base com toro, fuste afunilado, equino, volutas (cilindros ao longo de z) e ábaco. */
function ionic(k, x, z, y0, h, r, mat, cap = mat, parent) {
  const { THREE } = k;
  k.cyl(r * 1.35, r * 1.45, 0.08, mat, x, y0, z, 14, parent);
  k.cyl(r * 1.15, r * 1.3, 0.07, mat, x, y0 + 0.08, z, 14, parent);
  const shaft = h - 0.15 - 0.22;
  k.cyl(r * 0.86, r, shaft, mat, x, y0 + 0.15, z, 16, parent);
  const yc = y0 + 0.15 + shaft;
  k.cyl(r * 1.05, r * 0.9, 0.08, cap, x, yc, z, 14, parent);
  k.box(r * 2.9, 0.08, r * 1.2, cap, x, yc + 0.12, z, parent);
  for (const s of [-1, 1]) k.mesh(new THREE.CylinderGeometry(r * 0.42, r * 0.42, r * 1.3, 12), cap, x + s * r * 1.35, yc + 0.08, z, parent).rotation.x = Math.PI / 2;
  k.box(r * 2.5, 0.06, r * 2.5, cap, x, yc + 0.19, z, parent);
}

/** Escudo hoplon (face na cor do time, aro e umbo de bronze) com o centro em (x, y, z), de frente para +z. */
function hoplon(k, x, y, z, r = 0.45, tilt = 0, yaw = 0, parent) {
  const { THREE, M } = k;
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(tilt, yaw, 0, 'YXZ'); (parent ?? k.r).add(g);
  k.mesh(new THREE.CylinderGeometry(r, r, 0.05, 22), M.team, 0, 0, 0, g).rotation.x = Math.PI / 2;
  k.mesh(new THREE.TorusGeometry(r, 0.045, 6, 26), M.bronze, 0, 0, 0.01, g);
  k.mesh(new THREE.SphereGeometry(r * 0.17, 10, 6, 0, TAU, 0, Math.PI / 2), M.bronze, 0, 0, 0.03, g).rotation.x = Math.PI / 2;
  return g;
}

/** Lança de 2,4 m entre dois pontos (haste de madeira, ponta de bronze). */
function spear(k, a, b) {
  const { THREE, M } = k;
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2), u = d.map((v) => v / L);
  rod(k, a, [a[0] + u[0] * (L - 0.25), a[1] + u[1] * (L - 0.25), a[2] + u[2] * (L - 0.25)], 0.022, M.wood, undefined, 6);
  const tip = k.mesh(new THREE.ConeGeometry(0.035, 0.28, 6), M.bronze, a[0] + u[0] * (L - 0.12), a[1] + u[1] * (L - 0.12), a[2] + u[2] * (L - 0.12));
  tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...u));
}

/** Boneco de treino: poste, braços, corpo e cabeça de palha. */
function dummy(k, x, z, y0 = 0) {
  const { THREE, M } = k, X = mats(k);
  k.cyl(0.05, 0.06, 1.7, M.wood, x, y0, z, 8);
  k.box(0.9, 0.07, 0.07, M.wood, x, y0 + 1.32, z);
  k.cyl(0.16, 0.19, 0.6, X.hay, x, y0 + 0.78, z, 10);
  k.breakable(k.mesh(new THREE.SphereGeometry(0.13, 10, 8), X.hay, x, y0 + 1.68, z));
}

/** Braseiro de trípode em bronze com chama estática (`k.flames` guarda as chamas para a sobreposição do portal). */
function brazier(k, x, z, y0 = 0, s = 1) {
  const { THREE, M } = k, X = mats(k);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    rod(k, [x + Math.cos(a) * 0.3 * s, y0, z + Math.sin(a) * 0.3 * s], [x + Math.cos(a) * 0.14 * s, y0 + 0.95 * s, z + Math.sin(a) * 0.14 * s], 0.025 * s, M.bronze, undefined, 5);
  }
  k.mesh(new THREE.SphereGeometry(0.3 * s, 14, 8, 0, TAU, Math.PI / 2, Math.PI / 2), M.bronze, x, y0 + 1.12 * s, z);   // bacia
  k.cyl(0.26 * s, 0.26 * s, 0.03, M.char, x, y0 + 1.08 * s, z, 12);
  const f = k.mesh(new THREE.ConeGeometry(0.22 * s, 0.6 * s, 9), X.fire, x, y0 + 1.38 * s, z); f.userData.noShadow = true;
  const c = k.mesh(new THREE.ConeGeometry(0.12 * s, 0.36 * s, 8), X.fireCore, x, y0 + 1.3 * s, z + 0.05 * s); c.userData.noShadow = true;
  (k.flames ??= []).push({ x, y: y0 + 1.12 * s, z, s });
}

/** Cavalo (1,6 m na cernelha) olhando para +x no grupo girado `rotY`; `cloth` = xairel na cor do time. */
function horse(k, x, z, rotY, coat, { cloth = false, grazing = false } = {}) {
  const { THREE, M } = k;
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; k.r.add(g);
  const m = (geo, mat, px, py, pz, rz = 0) => { const o = k.mesh(geo, mat, px, py, pz, g); o.rotation.z = rz; return o; };
  m(new THREE.CapsuleGeometry(0.28, 0.8, 6, 12), coat, 0, 1.12, 0, Math.PI / 2);
  m(new THREE.SphereGeometry(0.31, 12, 10), coat, 0.42, 1.16, 0);
  m(new THREE.SphereGeometry(0.31, 12, 10), coat, -0.44, 1.15, 0);
  for (const [lx, lz, fr] of [[0.45, 0.13, 0.08], [0.45, -0.13, -0.05], [-0.47, 0.13, -0.06], [-0.47, -0.13, 0.06]]) {
    const leg = new THREE.Group(); leg.position.set(lx, 1.0, lz); leg.rotation.z = fr; g.add(leg);
    k.mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.5, 8), coat, 0, -0.25, 0, leg);
    k.mesh(new THREE.CylinderGeometry(0.042, 0.04, 0.44, 8), coat, 0, -0.72, 0, leg);
    k.mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.07, 8), M.hoof, 0, -0.96, 0, leg);
  }
  const nAng = grazing ? -2.2 : -0.72;               // pescoço: erguido ou baixado (pastando)
  const nd = [-Math.sin(nAng), Math.cos(nAng)];
  const nb = [0.5, 1.22], nt = [nb[0] + nd[0] * 0.62, nb[1] + nd[1] * 0.62];
  m(new THREE.CapsuleGeometry(0.13, 0.46, 6, 10), coat, (nb[0] + nt[0]) / 2, (nb[1] + nt[1]) / 2, 0, nAng);
  const mane = m(new THREE.BoxGeometry(0.05, 0.5, 0.06), M.hair, (nb[0] + nt[0]) / 2 - nd[1] * 0.1, (nb[1] + nt[1]) / 2 + nd[0] * 0.1, 0, nAng);
  mane.scale.x = 1.4;
  const hAng = grazing ? -3.0 : -2.2, hd = [-Math.sin(hAng), Math.cos(hAng)];
  m(new THREE.CapsuleGeometry(0.095, 0.34, 6, 10), coat, nt[0] + hd[0] * 0.22, nt[1] + hd[1] * 0.22, 0, hAng);
  for (const s of [-1, 1]) m(new THREE.ConeGeometry(0.035, 0.12, 5), coat, nt[0] - 0.02, nt[1] + 0.12, s * 0.06);
  m(new THREE.CapsuleGeometry(0.05, 0.5, 4, 8), M.hair, -0.78, 0.92, 0, 0.35);
  if (cloth) {
    m(new THREE.BoxGeometry(0.55, 0.04, 0.66), M.team, 0.02, 1.43, 0);
    for (const s of [-1, 1]) m(new THREE.BoxGeometry(0.5, 0.34, 0.03), M.team, 0.02, 1.27, s * 0.31);
  }
  return g;
}

/**
 * Figura humana de estátua (proporções do rig humano, 1,8 m) em pé ou sentada, de frente para +z, na escala `S`, com a
 * raiz (os pés) em (x, y, z). `arms`/`legs` = rotações dos pivôs; devolve os pivôs (mãos, cabeça) para os atributos.
 */
function figure(k, o) {
  const { THREE } = k;
  const root = new THREE.Group(); root.position.set(o.x, o.y, o.z); root.scale.setScalar(o.S); k.r.add(root);
  const joint = (parent, x, y, z, r = [0, 0, 0]) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(r[0], r[1], r[2]); parent.add(g); return g; };
  const cap = (r, len, mat, parent, x = 0, y = 0, z = 0) => k.mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat, x, y, z, parent);
  const seat = o.pose === 'seat';
  const skin = o.skin, hair = o.hair ?? skin;
  const J = { root };
  J.pelvis = joint(root, 0, seat ? 0.47 : 0.93, 0);
  const legs = o.legs ?? (seat ? { L: [[-Math.PI / 2, 0, -0.08], [Math.PI / 2 - 0.05, 0, 0]], R: [[-Math.PI / 2, 0, 0.08], [Math.PI / 2 - 0.05, 0, 0]] }
    : { L: [[0, 0, -0.03], [0, 0, 0]], R: [[-0.16, 0, 0.07], [0.3, 0, 0]] });
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const hip = joint(J.pelvis, s * 0.11, 0, 0, legs[side][0]);
    cap(0.088 * (o.limb ?? 1), 0.28, skin, hip, 0, -0.22, 0);
    const knee = joint(hip, 0, -0.44, 0, legs[side][1]);
    cap(0.068, 0.3, skin, knee, 0, -0.21, 0);
    k.mesh(new THREE.BoxGeometry(0.1, 0.06, 0.24), o.sandal ?? skin, 0, -0.44, 0.07, knee);
    J['knee' + side] = knee;
  }
  J.torso = joint(J.pelvis, 0, 0, 0, o.torso ?? [0, 0, 0]);
  cap(0.15, 0.13, skin, J.torso, 0, 0.02, 0).rotation.z = Math.PI / 2;                 // quadris
  k.cyl(0.155, 0.14, 0.26, skin, 0, 0.04, 0, 14, J.torso);                               // ventre
  const chest = cap(0.17, 0.16, skin, J.torso, 0, 0.38, 0); chest.scale.set(...(o.chest ?? [1.2, 1, 0.84]));
  k.cyl(0.055, 0.06, 0.13, skin, 0, 0.55, 0, 10, J.torso);                              // pescoço
  J.head = joint(J.torso, 0, 0.64, 0);
  k.mesh(new THREE.SphereGeometry(0.11, 14, 12), skin, 0, 0.1, 0.005, J.head);
  k.mesh(new THREE.SphereGeometry(0.118, 14, 10, 0, TAU, 0, Math.PI * 0.55), hair, 0, 0.115, -0.01, J.head);
  k.box(0.03, 0.05, 0.04, skin, 0, 0.085, 0.11, J.head);                                // nariz
  if (o.beard) { const b = k.mesh(new THREE.SphereGeometry(0.085, 12, 10), hair, 0, 0.02, 0.055, J.head); b.scale.set(1, 1.15, 0.8); }
  const arms = o.arms ?? { L: [[0, 0, -0.15], [-0.3, 0, 0]], R: [[0, 0, 0.15], [-0.3, 0, 0]] };
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const sh = joint(J.torso, s * 0.215 * (o.chest?.[0] ?? 1.2) / 1.2, 0.47, 0, arms[side][0]);
    k.mesh(new THREE.SphereGeometry(0.068, 10, 8), skin, 0, 0, 0, sh);
    cap(0.052 * (o.limb ?? 1), 0.18, skin, sh, 0, -0.14, 0);
    const el = joint(sh, 0, -0.28, 0, arms[side][1]);
    cap(0.044, 0.17, skin, el, 0, -0.13, 0);
    const hand = joint(el, 0, -0.29, 0);
    k.mesh(new THREE.SphereGeometry(0.047, 10, 8), skin, 0, 0, 0, hand);
    J['hand' + side] = hand; J['elbow' + side] = el;
  }
  return J;
}

/** Posição (metros, no grupo k.r) de um pivô de `figure`. */
function where(k, obj) {
  k.group.updateMatrixWorld(true);
  return k.r.worldToLocal(obj.getWorldPosition(new k.THREE.Vector3()));
}

/** Degraus (krepis) de n patamares: retângulo w×d centrado, cada patamar recuado `inset` e com altura `h`. */
function steps(k, w, d, n, h, inset, mats2, cz = 0) {
  for (let i = 0; i < n; i++) k.box(w - 2 * i * inset, h, d - 2 * i * inset, mats2[i % mats2.length], 0, h * i + h / 2, cz);
  return n * h;
}

/** Andaime numa só face (sul) de x0..x1 em z, até a altura h (obras grandes: sem cercar tudo). */
function scaffoldFace(k, x0, x1, z, h) {
  const { M } = k;
  const n = Math.max(1, Math.round((x1 - x0) / 1.9));
  for (let i = 0; i <= n; i++) { const x = x0 + (i * (x1 - x0)) / n; k.cyl(0.04, 0.05, h, M.wood, x, 0, z, 6); k.cyl(0.04, 0.05, h, M.wood, x, 0, z - 0.7, 6); }
  for (let y = 1.1; y < h; y += 1.1) { k.box(x1 - x0 + 0.1, 0.05, 0.85, M.wood, (x0 + x1) / 2, y, z - 0.35); }
  for (let i = 0; i < n; i++) rod(k, [x0 + (i * (x1 - x0)) / n, 0.1, z + 0.02], [x0 + ((i + 1) * (x1 - x0)) / n, Math.min(h, 2.2), z + 0.02], 0.022, M.woodDark, undefined, 5);
}

// =================================================================================================================
// Estilos

export const MILITARY_BUILDERS = {};
const B = MILITARY_BUILDERS;

// ---- Quartel 3×3 (6×6 m): salão ao norte (reboco sobre soco de pedra, porta ao sul, alpendre de 6 colunas dóricas com
//      escudos de time pendurados na parede, telhado de duas águas leste-oeste) e, ao sul, o pátio de treino em areia
//      com muro baixo, entrada entre dois pilares com estandartes, cavalete de escudos (time), lanças encostadas no muro e
//      bonecos de palha ----
B.barracks = (k, p) => {
  const { THREE, M, block, box } = k, X = mats(k), st = p.stage;
  k.debris = { x0: -3, x1: 3, z0: -3, z1: 3 };
  k.debrisMats = [M.limestone, M.plasterDark, M.stoneWarm];
  const wf = [0.25, 0.6, 1, 1][st];
  block(-3, 3, 0, 0.1, -3, 3, M.stoneWarm);
  if (st >= 1) block(-2.7, 2.7, 0.1, 0.13, -0.15, 2.7, X.sand);
  // salão
  const hx0 = -2.9, hx1 = 2.9, hz0 = -2.9, hz1 = -1.05, base = 0.38, wallH = 2.45;
  block(hx0 - 0.05, hx1 + 0.05, 0.1, base, hz0 - 0.05, -0.2, M.limestoneDark);
  k.room(hx0, hx1, hz0, hz1, base, wallH * wf, 0.22, M.plaster, [-0.45, 0.45, 1.85]);
  if (st >= 1) block(-0.42, 0.42, base, base + Math.min(1.83, wallH * wf), hz1 - 0.19, hz1 - 0.15, M.woodDark);
  const pz = -0.45, colH = wallH - 0.2, colFrac = [0.2, 0.55, 1, 1][st];
  for (const x of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
    if (st === 0 && Math.abs(x) > 1) continue;
    if (colFrac < 1) k.cyl(0.13, 0.15, colH * colFrac, M.limestone, x, base, pz, 12);
    else k.column(x, pz, base, colH, 0.15, M.limestone);
  }
  const eave = base + wallH;
  if (st >= 2) {
    block(hx0, hx1, base + colH, eave, pz - 0.2, pz + 0.2, M.limestone);
    block(hx0 - 0.02, hx1 + 0.02, eave - 0.1, eave, pz + 0.2, pz + 0.23, M.limestoneDark);
    block(hx0, hx1, eave - 0.05, eave, hz1, pz - 0.2, M.woodDark);
    for (let i = 0; i < 12; i++) box(0.12, 0.13, 0.03, M.limestoneDark, hx0 + 0.25 + i * ((hx1 - hx0 - 0.5) / 11), base + colH + 0.1, pz + 0.215);
  }
  const rz0 = hz0 - 0.15, rz1 = pz + 0.35;
  if (st === 2) k.gable({ cx: 0, cz: (rz0 + rz1) / 2, axis: 'x', w: rz1 - rz0, len: hx1 - hx0, y: eave, rise: 0.8, frame: true });
  if (st === 3) {
    k.gable({ cx: 0, cz: (rz0 + rz1) / 2, axis: 'x', w: rz1 - rz0, len: hx1 - hx0 + 0.1, y: eave, rise: 0.8, ped: M.plaster, nRows: 6 });
    for (const x of [hx0 + 0.05, 0, hx1 - 0.05]) k.breakable(k.mesh(new THREE.ConeGeometry(0.1, 0.3, 6), M.limestone, x, eave + 0.93, (rz0 + rz1) / 2));
    block(hx0 + 0.22, hx1 - 0.22, base + 0.35, base + 2.1, hz1, hz1 + 0.02, X.paintRed);            // parede pintada do alpendre
    block(-0.5, 0.5, base, base + 1.9, hz1 + 0.02, hz1 + 0.03, M.woodDark);
    for (const x of [-2.0, -1.0, 1.0, 2.0]) hoplon(k, x, base + 1.2, hz1 + 0.07, 0.3);
  }
  // muro baixo do pátio (oeste, leste e sul) com a entrada ao sul entre dois pilares
  const yh = 0.95 * [0.35, 0.7, 1, 1][st], T = 0.26, yz0 = -0.2, yz1 = 2.95;
  for (const s of [-1, 1]) {
    const xa = s < 0 ? -2.95 : 2.95 - T, xb = s < 0 ? -2.95 + T : 2.95;
    block(xa, xb, 0.1, 0.1 + yh, yz0, yz1, M.stoneWarm);
    block(s < 0 ? -2.95 : 0.85, s < 0 ? -0.85 : 2.95, 0.1, 0.1 + yh, yz1 - T, yz1, M.stoneWarm);
    if (st >= 2) {
      block(xa - 0.03, xb + 0.03, 0.1 + yh, 0.18 + yh, yz0, yz1 + 0.03, M.limestone);
      block(s < 0 ? -2.98 : 0.85, s < 0 ? -0.85 : 2.98, 0.1 + yh, 0.18 + yh, yz1 - T - 0.03, yz1 + 0.03, M.limestone);
    }
    block(s * 0.85 - 0.2, s * 0.85 + 0.2, 0.1, 0.1 + (st >= 2 ? 1.45 : yh), yz1 - 0.36, yz1 + 0.05, M.limestone);
    if (st === 3) k.breakable(k.box(0.46, 0.1, 0.46, M.limestoneDark, s * 0.85, 1.6, yz1 - 0.15));
  }
  if (st === 3) {
    // estandartes na entrada, escudos no cavalete, lanças no muro oeste, bonecos de treino a leste
    k.banner(-1.2, 3.08, 2.6, -1); k.banner(1.2, 3.08, 2.6, 1);
    block(-2.55, -2.47, 0.13, 0.85, 0.45, 0.53, M.wood); block(-1.03, -0.95, 0.13, 0.85, 0.45, 0.53, M.wood);
    block(-2.6, -0.9, 0.72, 0.78, 0.45, 0.53, M.wood);
    for (const x of [-2.25, -1.75, -1.25]) hoplon(k, x, 0.52, 0.64, 0.4, -0.22);
    for (let i = 0; i < 6; i++) { const z = 0.25 + i * 0.3; spear(k, [-2.4, 0.13, z], [-2.66, 2.45, z - 0.05]); }
    dummy(k, 1.2, 0.9, 0.13); dummy(k, 2.1, 1.75, 0.13);
    k.amphora(2.5, 0.2, 0.9); k.amphora(2.25, 0.05, 0.8);
    block(1.0, 1.9, 0.13, 0.5, 2.3, 2.62, M.wood);                                   // banco
  } else {
    k.scaffold({ x0: -3.05, x1: 3.05, z0: -3.05, z1: -0.15, h: [1.3, 2.4, 3.4][st] });
    k.pile(1.4, 1.6, M.limestone); if (st === 0) k.pile(-1.4, 1.2, M.plasterDark);
  }
};

// ---- Estábulo 3×3 (6×6 m): cocheira ao norte (pedra embaixo, reboco em cima, quatro baias com meia-porta de madeira
//      viradas para o sul, um cavalo espiando por cima de uma delas, telhado de duas águas leste-oeste), paliçada de
//      madeira do piquete com dois cavalos (um com xairel na cor do time), bebedouro de pedra, telheiro de feno a leste e
//      mantas de sela (time) na cerca ----
B.stable = (k, p) => {
  const { THREE, M, block, box } = k, X = mats(k), st = p.stage;
  k.debris = { x0: -3, x1: 3, z0: -3, z1: 3 };
  k.debrisMats = [M.stoneWarm, M.plaster, M.wood];
  const wf = [0.3, 0.65, 1, 1][st];
  block(-3, 3, 0, 0.06, -3, 3, X.dirt);
  // cocheira
  const x0 = -2.9, x1 = 2.9, z0 = -2.9, z1 = -1.0, base = 0.25, H = 2.3, T = 0.24;
  block(x0 - 0.05, x1 + 0.05, 0.06, base, z0 - 0.05, z1 + 0.05, M.stoneWarm);
  const h = H * wf, low = Math.min(h, 1.0);
  k.block(x0, x1, base, base + h, z0, z0 + T, M.plaster);
  k.block(x0, x0 + T, base, base + h, z0, z1, M.plaster);
  k.block(x1 - T, x1, base, base + h, z0, z1, M.plaster);
  k.block(x0 - 0.02, x1 + 0.02, base, base + low, z0 - 0.02, z0 + T + 0.02, M.stoneWarm);
  // fachada sul: pilares entre as baias, verga contínua acima de 1,85 m
  const stalls = [-2.1, -0.7, 0.7, 2.1], sw = 0.95, sh = 1.85;
  const edges = [x0, ...stalls.flatMap((c) => [c - sw / 2, c + sw / 2]), x1];
  for (let i = 0; i < edges.length; i += 2) {
    block(edges[i], edges[i + 1], base, base + h, z1 - T, z1, M.plaster);
    block(edges[i] - 0.01, edges[i + 1] + 0.01, base, base + low, z1 - T - 0.01, z1 + 0.01, M.stoneWarm);
  }
  if (h > sh) block(x0, x1, base + sh, base + h, z1 - T, z1, M.plaster);
  block(x0 + T, x1 - T, base, base + 0.02, z0 + T, z1 - T, M.woodDark);
  if (st >= 1) for (const c of stalls) {
    block(c - sw / 2, c + sw / 2, base, base + 1.05, z1 - 0.12, z1 - 0.07, M.wood);                       // meia-porta
    for (const dx of [-0.25, 0, 0.25]) block(c + dx - 0.015, c + dx + 0.015, base + 0.05, base + 1.0, z1 - 0.07, z1 - 0.05, M.woodDark);
    if (st >= 2) block(c - sw / 2 - 0.05, c + sw / 2 + 0.05, base + sh, base + sh + 0.08, z1 - T - 0.02, z1 + 0.04, M.wood);   // verga
  }
  const eave = base + H;
  if (st >= 2) block(x0 - 0.03, x1 + 0.03, eave - 0.1, eave, z0 - 0.03, z1 + 0.03, M.plasterDark);
  if (st === 2) k.gable({ cx: 0, cz: (z0 + z1) / 2, axis: 'x', w: z1 - z0 + 0.5, len: x1 - x0 + 0.2, y: eave, rise: 0.75, frame: true });
  if (st === 3) {
    k.gable({ cx: 0, cz: (z0 + z1) / 2, axis: 'x', w: z1 - z0 + 0.6, len: x1 - x0 + 0.3, y: eave, rise: 0.75, ped: M.plaster, nRows: 5 });
    // postigo aberto (folha superior) e cabeça de cavalo espiando na segunda baia
    const c = stalls[1];
    const leaf = block(c + sw / 2, c + sw / 2 + 0.45, base + 1.1, base + 1.8, z1 + 0.02, z1 + 0.06, M.wood); leaf.rotation.y = -0.2;
    const hd = new THREE.Group(); hd.position.set(c, base + 1.35, z1 - 0.1); k.r.add(hd);
    k.mesh(new THREE.CapsuleGeometry(0.12, 0.3, 6, 10), M.fur, 0, 0.05, 0.05, hd).rotation.x = 0.5;
    k.mesh(new THREE.CapsuleGeometry(0.09, 0.3, 6, 10), M.fur, 0, 0.1, 0.32, hd).rotation.x = 1.75;
    for (const s of [-1, 1]) k.mesh(new THREE.ConeGeometry(0.035, 0.12, 5), M.fur, s * 0.06, 0.3, 0.2, hd);
    k.banner(x1 - 0.1, z1 + 0.25, 2.9, -1, [0.45, 0.75]);
  }
  // piquete: paliçada de madeira (postes a cada ~0,9 m, duas travessas), porteira ao sul
  const px0 = -2.85, px1 = 1.25, pz0 = -0.7, pz1 = 2.85;
  if (st >= 1) {
    const railH = st >= 2 ? [0.55, 1.0] : [0.55];
    const fence = (ax, az, bx, bz, gap = null) => {
      const L = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2), n = Math.max(1, Math.round(L / 0.9));
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (gap && x > gap[0] + 0.05 && x < gap[1] - 0.05) continue;
        k.cyl(0.05, 0.055, st >= 2 ? 1.15 : 0.75, M.wood, x, 0.06, z, 6);
      }
      for (const y of railH) {
        if (gap) { rod(k, [ax, y, az], [gap[0], y, bz], 0.03, M.wood, undefined, 5); rod(k, [gap[1], y, az], [bx, y, bz], 0.03, M.wood, undefined, 5); }
        else rod(k, [ax, y, az], [bx, y, bz], 0.03, M.wood, undefined, 5);
      }
    };
    fence(px0, pz0, px0, pz1); fence(px1, pz0, px1, pz1); fence(px0, pz1, px1, pz1, [-0.6, 0.35]);
  }
  // telheiro de feno a leste
  const bx0 = 1.55, bx1 = 2.95, bz0 = -0.75, bz1 = 1.6;
  if (st >= 1) for (const [x, z] of [[bx0, bz0], [bx1, bz0], [bx0, bz1], [bx1, bz1]]) k.cyl(0.06, 0.07, [1.1, 2.0, 2.0, 2.0][st], M.wood, x, 0.06, z, 7);
  if (st === 2) k.shedX({ z0: bz0, z1: bz1, xHigh: bx1 + 0.1, xLow: bx0 - 0.25, yHigh: 2.3, yLow: 2.0, frame: true });
  if (st === 3) {
    k.shedX({ z0: bz0 - 0.1, z1: bz1 + 0.1, xHigh: bx1 + 0.12, xLow: bx0 - 0.3, yHigh: 2.2, yLow: 1.95, roof: M.wood, rows: M.woodDark, nRows: 6 });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const b = box(0.55, 0.4, 0.9, (i + j) % 2 ? X.hay : X.hayDark, 1.95 + j * 0.6, 0.26 + i * 0.4 - (j && i === 2 ? 1 : 0) * 0, -0.2 + ((i + j) % 2) * 0.05); b.rotation.y = (k.rand() - 0.5) * 0.12; if (i === 2 && j === 1) b.visible = false; }
    box(0.55, 0.4, 0.9, X.hay, 2.25, 0.26, 0.85);
    const stack = k.mesh(new THREE.SphereGeometry(0.62, 14, 10, 0, TAU, 0, Math.PI / 2), X.hay, 2.3, 0.06, 2.35); stack.scale.set(1, 1.3, 0.9);
    // cavalos, bebedouro, mantas de sela na cerca
    horse(k, -1.75, 0.55, 0.12, M.fur, { cloth: true });
    horse(k, 0.15, 1.75, Math.PI - 0.35, M.furDark, { grazing: true });
    block(-2.75, -1.6, 0.06, 0.52, 2.2, 2.62, M.stone);
    block(-2.67, -1.68, 0.46, 0.49, 2.28, 2.54, X.water);
    for (const z of [0.2, 1.1]) {
      box(0.06, 0.03, 0.62, M.team, px1, 1.04, z + 0.2);
      for (const s of [-1, 1]) box(0.03, 0.4, 0.6, M.team, px1 + s * 0.05, 0.84, z + 0.2);
    }
    k.amphora(-2.6, -0.45, 0.8);
  } else {
    k.scaffold({ x0: x0 - 0.2, x1: x1 + 0.2, z0: z0 - 0.2, z1: z1 + 0.3, h: [1.2, 2.2, 3.2][st] });
    k.pile(0.3, 1.5, M.stoneWarm); if (st <= 1) k.pile(-1.6, 1.9, M.wood);
  }
};

// ---- Oficina de cerco 3×3 (6×6 m): galpão de madeira aberto ao sul (muro de pedra ao fundo, esteios, telhado de duas
//      águas leste-oeste com sanefa na cor do time) com bancada e um aríete em montagem, cabrilha de três pernas (o ponto
//      alto: 4 m) içando uma viga, um litóbolo pronto no pátio apontado para sudeste, balas de pedra, toras e uma roda
//      grande encostada ----
B.siege_workshop = (k, p) => {
  const { THREE, M, block, box } = k, X = mats(k), st = p.stage;
  k.debris = { x0: -3, x1: 3, z0: -3, z1: 3 };
  k.debrisMats = [M.wood, M.stoneWarm, M.woodDark];
  block(-3, 3, 0, 0.06, -3, 3, X.dirt);
  if (st >= 1) for (let i = 0; i < 14; i++) { const c = box(0.3 + k.rand() * 0.3, 0.012, 0.18 + k.rand() * 0.2, X.sand, -2.6 + k.rand() * 5.2, 0.066, -0.1 + k.rand() * 2.9); c.rotation.y = k.rand() * 3; c.userData.noShadow = true; }
  // galpão
  const gx0 = -2.9, gx1 = 1.0, gz0 = -2.9, gz1 = -0.35, H = 2.6;
  const wf = [0.3, 0.65, 1, 1][st];
  block(gx0, gx1, 0.06, 0.06 + H * wf, gz0, gz0 + 0.3, M.stoneWarm);                    // muro do fundo
  block(gx0, gx0 + 0.3, 0.06, 0.06 + H * wf * 0.9, gz0, gz1 - 0.6, M.stoneWarm);           // muro oeste
  if (st >= 1) for (const x of [gx0 + 0.15, -1.0, gx1 - 0.1]) { k.cyl(0.1, 0.11, 0.2, M.stone, x, 0.06, gz1, 8); k.cyl(0.08, 0.09, H * wf, M.wood, x, 0.26, gz1, 8); }
  if (st >= 1) k.cyl(0.08, 0.09, H * wf, M.wood, gx1 - 0.1, 0.26, (gz0 + gz1) / 2, 8);
  const eave = 0.26 + H;
  if (st >= 2) { block(gx0, gx1 + 0.05, eave - 0.18, eave, gz1 - 0.1, gz1 + 0.1, M.wood); block(gx1 - 0.2, gx1, eave - 0.18, eave, gz0, gz1, M.wood); }
  if (st === 2) k.gable({ cx: (gx0 + gx1) / 2, cz: (gz0 + gz1) / 2, axis: 'x', w: gz1 - gz0 + 0.5, len: gx1 - gx0 + 0.2, y: eave, rise: 0.8, frame: true });
  if (st === 3) {
    k.gable({ cx: (gx0 + gx1) / 2, cz: (gz0 + gz1) / 2, axis: 'x', w: gz1 - gz0 + 0.6, len: gx1 - gx0 + 0.3, y: eave, rise: 0.8, ped: M.wood, nRows: 5 });
    for (let i = 0; i < 6; i++) { const x = gx0 + 0.25 + i * ((gx1 - gx0 - 0.5) / 5); box(0.52, 0.5, 0.03, M.team, x, eave - 0.35, gz1 + 0.13); }   // sanefa de time
    // bancada e ferramentas, aríete em montagem
    block(-2.6, -1.2, 0.06, 0.85, -2.45, -1.95, M.wood); box(1.5, 0.06, 0.6, M.woodDark, -1.9, 0.88, -2.2);
    for (const x of [-0.9, 0.5]) { rod(k, [x, 0.06, -1.9], [x, 1.5, -1.3], 0.05, M.wood); rod(k, [x, 0.06, -0.7], [x, 1.5, -1.3], 0.05, M.wood); }
    rod(k, [-0.9, 1.5, -1.3], [0.5, 1.5, -1.3], 0.05, M.wood);
    rod(k, [-1.3, 0.75, -1.3], [1.0, 0.75, -1.3], 0.13, M.woodDark, undefined, 10);        // aríete (tronco)
    k.mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.35, 10), M.bronze, 1.1, 0.75, -1.3).rotation.z = Math.PI / 2;   // cabeça de bronze
    for (const x of [-0.9, 0.5]) rod(k, [x, 1.5, -1.3], [x - 0.1, 0.85, -1.3], 0.012, X.rope, undefined, 4);
  }
  // cabrilha (três pernas) a leste, içando uma viga
  if (st >= 2) {
    const top = [2.15, 4.0, -0.7];
    rod(k, [1.45, 0.06, -1.6], top, 0.07, M.wood); rod(k, [2.85, 0.06, -1.6], top, 0.07, M.wood); rod(k, [2.15, 0.06, 0.9], top, 0.07, M.wood);
    rod(k, top, [2.15, 1.55, -0.55], 0.018, X.rope, undefined, 4);
    k.cyl(0.14, 0.14, 0.12, M.woodDark, 2.15, 3.8, -0.7, 10).rotation.x = Math.PI / 2;                  // roldana
    if (st === 3) {
      const beam = box(1.8, 0.2, 0.2, M.wood, 2.15, 1.45, -0.55); beam.rotation.y = 0.35;
      for (const s of [-1, 1]) rod(k, [2.15, 1.55, -0.55], [2.15 + s * 0.7, 1.52, -0.55 - s * 0.26], 0.014, X.rope, undefined, 4);
      k.cyl(0.02, 0.02, 0.9, M.wood, top[0], top[1], top[2], 6);
      k.box(0.45, 0.28, 0.03, M.team, top[0] + 0.25, top[1] + 0.72, top[2]);
    }
  }
  if (st === 3) {
    // litóbolo (atira-pedras) pronto, apontado para sudeste
    const g = new THREE.Group(); g.position.set(-0.8, 0.06, 1.3); g.rotation.y = -0.3; g.scale.setScalar(1.2); k.r.add(g);
    const P = (x0, x1, y0, y1, z0, z1, mat) => k.block(x0, x1, y0, y1, z0, z1, mat, g);
    for (const s of [-1, 1]) P(-1.0, 1.0, 0, 0.16, s * 0.35 - 0.08, s * 0.35 + 0.08, M.wood);        // longarinas
    for (const x of [-0.85, 0, 0.85]) P(x - 0.08, x + 0.08, 0.16, 0.3, -0.45, 0.45, M.wood);            // travessas
    P(-0.1, 0.1, 0.3, 1.0, -0.12, 0.12, M.wood);                                                          // coluna
    const tr = new THREE.Group(); tr.position.set(0, 1.0, 0); tr.rotation.z = 0.28; g.add(tr);          // calha inclinada
    k.block(-1.3, 1.1, 0, 0.1, -0.1, 0.1, M.woodDark, tr);
    for (const s of [-1, 1]) {
      k.cyl(0.11, 0.11, 0.62, X.rope, 0.85, -0.3, s * 0.34, 10, tr);                                      // molas de torção
      k.cyl(0.13, 0.13, 0.05, M.bronze, 0.85, -0.32, s * 0.34, 10, tr); k.cyl(0.13, 0.13, 0.05, M.bronze, 0.85, 0.3, s * 0.34, 10, tr);
      const arm = k.box(0.08, 0.08, 0.7, M.wood, 0.72, 0.05, s * 0.62, tr); arm.rotation.y = s * 0.55;
      rod(k, [0.55, 0.06, s * 0.9], [-0.9, 0.08, 0], 0.01, X.rope, tr, 3);
    }
    k.cyl(0.07, 0.07, 0.5, M.wood, -1.15, 0.05, 0, 8, tr).rotation.x = Math.PI / 2;                      // sarilho
    k.mesh(new THREE.SphereGeometry(0.12, 10, 8), M.stoneLight, -0.2, 0.2, 0, tr);
    // balas de pedra em pirâmide, toras, roda encostada, lascas
    const balls = [[0, 0, 0], [0.26, 0, 0], [0.52, 0, 0], [0.13, 0, 0.22], [0.39, 0, 0.22], [0.26, 0, 0.44], [0.13, 0.21, 0.08], [0.39, 0.21, 0.08], [0.26, 0.21, 0.3], [0.26, 0.4, 0.15]];
    for (const [bx, by, bz] of balls) k.mesh(new THREE.SphereGeometry(0.13, 10, 8), M.stoneLight, 0.3 + bx, 0.19 + by, 2.3 + bz);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) k.cyl(0.12, 0.12, 1.9, M.wood, 1.9, 0.18 + i * 0.21, 2.55 + (j - (2 - i) / 2) * 0.25, 10).rotation.z = Math.PI / 2;
    const wheel = k.mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 18), M.wood, -2.55, 0.62, 0.4); wheel.rotation.set(0, Math.PI / 2 - 0.25, 0.12);
    for (let i = 0; i < 4; i++) { const sp = k.box(0.05, 1.05, 0.05, M.woodDark, -2.55, 0.62, 0.4); sp.rotation.set(0, Math.PI / 2 - 0.25, (i * Math.PI) / 4); }
    k.banner(-2.7, 2.7, 2.5, 1);
  } else {
    k.scaffold({ x0: gx0 - 0.15, x1: gx1 + 0.15, z0: gz0 - 0.15, z1: gz1 + 0.25, h: [1.2, 2.2, 3.4][st] });
    for (let i = 0; i < 3; i++) k.cyl(0.12, 0.12, 1.9, M.wood, 1.9, 0.18, 2.3 + i * 0.26, 10).rotation.z = Math.PI / 2;
    k.pile(-1.0, 1.6, M.stoneWarm);
  }
};

// ---- Fortaleza 4×4 (8×8 m): muralhas de cantaria (2,5 m, merlões na borda externa, adarve por dentro) recuadas entre
//      quatro torres quadradas de canto salientes (3,7 m, parapeito com merlões, seteiras), portão ao sul entre dois
//      pilones com merlões e estandartes, pátio de terra batida com poço, rampa para o adarve, caixotes, lanças e escudos,
//      e a torre de menagem ao fundo (seteiras, telhado de duas águas leste-oeste); estandartes de time nas torres do sul.
//      Obra: alicerces → meia altura → muros e torres sem merlões, telhado em caibros; andaime na frente e na menagem. ----
B.fortress = (k, p) => {
  const { THREE, M, block, box } = k, X = mats(k), st = p.stage;
  k.debris = { x0: -4, x1: 4, z0: -4, z1: 4 };
  k.debrisMats = [M.ashlar, M.ashlar2, M.stone];
  const A = M.ashlar, A2 = M.ashlar2, AD = M.ashlarDark;
  const E = 4, TW = 2.2, I = 0.3, WT = 0.9, WH = 2.5, TH = 3.7;
  const wh = [0.6, 1.5, WH, WH][st], th = [0.9, 2.1, TH, TH][st];
  block(-E, E, 0, 0.08, -E, E, M.stoneWarm);
  if (st >= 1) block(-E + I + WT, E - I - WT, 0.08, 0.1, -E + I + WT, E - I - WT, X.dirt);
  // muralhas recuadas entre as torres (a do sul com o vão do portão)
  const gw = 0.8, gp = 0.65;
  const wall = (x0, x1, z0, z1) => { courses(k, x0, x1, 0.08, wh, z0, z1, A, A2, AD); if (st >= 2) block(x0 - 0.02, x1 + 0.02, wh, wh + 0.1, z0 - 0.04, z1 + 0.04, AD); };
  const n0 = -E + I, s1 = E - I;
  wall(-E + TW, E - TW, n0, n0 + WT);
  wall(n0, n0 + WT, -E + TW, E - TW); wall(s1 - WT, s1, -E + TW, E - TW);
  wall(-E + TW, -gw - gp, s1 - WT, s1); wall(gw + gp, E - TW, s1 - WT, s1);
  if (st === 3) {
    merlonsX(k, -E + TW, E - TW, n0 + 0.12, WH + 0.1, A); merlonsZ(k, -E + TW, E - TW, n0 + 0.12, WH + 0.1, A); merlonsZ(k, -E + TW, E - TW, s1 - 0.12, WH + 0.1, A);
    merlonsX(k, -E + TW, -gw - gp, s1 - 0.12, WH + 0.1, A); merlonsX(k, gw + gp, E - TW, s1 - 0.12, WH + 0.1, A);
  }
  // portão: dois pilones até a borda, verga com merlões, folhas de madeira com ferragens
  const ph = st >= 2 ? WH + 0.8 : wh;
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -gw - gp : gw, x1 = x0 + gp;
    courses(k, x0, x1, 0.08, ph, s1 - WT - 0.1, E, A, A2, AD);
    if (st >= 2) block(x0 - 0.04, x1 + 0.04, ph, ph + 0.12, s1 - WT - 0.14, E + 0.04, AD);
    if (st === 3) { for (const t of [0.14, 0.51]) k.breakable(box(0.24, 0.42, 0.24, A, x0 + t, ph + 0.33, E - 0.12)); box(0.4, 0.9, 0.03, M.team, (x0 + x1) / 2, 1.75, E + 0.02); }
  }
  if (st >= 2) {
    block(-gw, gw, 2.2, WH, s1 - WT, s1, A); block(-gw - 0.02, gw + 0.02, 2.14, 2.2, s1 - WT, s1 + 0.02, AD);
    block(-gw - 0.02, gw + 0.02, WH, WH + 0.1, s1 - WT - 0.04, s1 + 0.04, AD);
    if (st === 3) merlonsX(k, -gw, gw, s1 - 0.12, WH + 0.1, A);
    block(-gw, gw, 0.08, 2.14, s1 - 0.4, s1 - 0.33, M.wood);
    for (const y of [0.45, 1.1, 1.75]) block(-gw, gw, y, y + 0.09, s1 - 0.33, s1 - 0.3, M.iron);
    block(-0.015, 0.015, 0.1, 2.12, s1 - 0.33, s1 - 0.3, M.woodDark);
  }
  // torres de canto (salientes: as muralhas estão recuadas I da borda)
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x0 = sx < 0 ? -E : E - TW, x1 = x0 + TW, z0 = sz < 0 ? -E : E - TW, z1 = z0 + TW;
    courses(k, x0, x1, 0.08, th, z0, z1, A, A2, AD);
    for (const y of [1.3, 2.5]) if (th > y + 0.5) { block((x0 + x1) / 2 - 0.05, (x0 + x1) / 2 + 0.05, y, y + 0.45, z1 - 0.005, z1 + 0.01, M.char); block(x1 - 0.005, x1 + 0.01, y, y + 0.45, (z0 + z1) / 2 - 0.05, (z0 + z1) / 2 + 0.05, M.char); }
    if (st >= 2) block(x0 - 0.08, x1 + 0.08, th, th + 0.14, z0 - 0.08, z1 + 0.08, AD);
    if (st === 3) {
      parapet(k, x0 - 0.06, x1 + 0.06, z0 - 0.06, z1 + 0.06, th + 0.14, A);
      if (sz > 0) { k.cyl(0.025, 0.03, 1.4, M.wood, (x0 + x1) / 2, th + 0.14, (z0 + z1) / 2, 6); box(0.55, 0.34, 0.03, M.team, (x0 + x1) / 2 - sx * 0.3, th + 1.3, (z0 + z1) / 2); k.mesh(new THREE.SphereGeometry(0.05, 8, 6), M.gold, (x0 + x1) / 2, th + 1.57, (z0 + z1) / 2); }
    }
  }
  // torre de menagem ao fundo
  const kx0 = -1.45, kx1 = 1.45, kz0 = n0 + WT - 0.02, kz1 = -1.0, KH = 4.4;
  const kh = [0.5, 1.8, KH, KH][st];
  courses(k, kx0, kx1, 0.1, kh, kz0, kz1, A2, A, AD, 0.65);
  if (kh > 1.5) block(-0.42, 0.42, 0.1, 1.85, kz1 - 0.01, kz1 + 0.02, M.woodDark);
  for (const x of [-0.9, 0.9]) if (kh > 3.2) block(x - 0.06, x + 0.06, 2.6, 3.2, kz1 - 0.005, kz1 + 0.01, M.char);
  if (st >= 2) block(kx0 - 0.08, kx1 + 0.08, KH, KH + 0.14, kz0 - 0.08, kz1 + 0.08, AD);
  if (st === 2) k.gable({ cx: 0, cz: (kz0 + kz1) / 2, axis: 'x', w: kz1 - kz0 + 0.3, len: kx1 - kx0 + 0.2, y: KH + 0.14, rise: 0.8, frame: true });
  if (st === 3) {
    k.gable({ cx: 0, cz: (kz0 + kz1) / 2, axis: 'x', w: kz1 - kz0 + 0.45, len: kx1 - kx0 + 0.3, y: KH + 0.14, rise: 0.8, ped: A, nRows: 5 });
    for (const x of [kx0 - 0.05, kx1 + 0.05]) k.breakable(k.mesh(new THREE.ConeGeometry(0.1, 0.3, 6), A, x, KH + 1.05, (kz0 + kz1) / 2));
    // pátio: poço, rampa para o adarve (oeste), caixotes, lanças e escudos
    k.cyl(0.4, 0.43, 0.55, M.stone, 1.75, 0.1, 1.25, 14); k.cyl(0.31, 0.31, 0.02, X.water, 1.75, 0.6, 1.25, 14);
    for (const s of [-1, 1]) k.cyl(0.03, 0.03, 1.0, M.wood, 1.75 + s * 0.36, 0.6, 1.25, 6);
    k.cyl(0.035, 0.035, 0.85, M.wood, 1.75, 1.58, 1.25, 6).rotation.z = Math.PI / 2;
    const ramp = box(0.8, 0.12, 3.3, M.stoneWarm, n0 + WT + 0.4, 1.25, 0.6); ramp.rotation.x = -0.72;
    for (const [x, z, s] of [[2.0, 2.45, 0.5], [2.5, 2.55, 0.45], [2.25, 2.15, 0.42]]) { const c = box(s, s, s, M.wood, x, 0.1 + s / 2, z); c.rotation.y = k.rand() * 0.6; }
    for (let i = 0; i < 5; i++) { const z = -0.3 + i * 0.28; spear(k, [-1.85, 0.1, z], [-2.12, 2.3, z - 0.05]); }
    hoplon(k, -1.0, 0.5, 0.45, 0.4, -0.25); hoplon(k, -0.35, 0.5, 0.55, 0.4, -0.25, 0.2);
  } else {
    scaffoldFace(k, -E + 0.2, E - 0.2, E + 0.55, [1.3, 2.4, 3.4][st]);
    k.scaffold({ x0: kx0 - 0.25, x1: kx1 + 0.25, z0: kz0 + 0.1, z1: kz1 + 0.3, h: [1.2, 2.5, 5.0][st], pennant: false });
    k.pile(1.6, 1.4, A2); k.pile(-1.2, 2.0, A);
  }
};

// ---- Portal dos Titãs 5×5 (10×10 m): plataforma de três degraus em pedra escura com fendas de brasa irradiando do
//      portal; o anel colossal de pedra (6,4 m de altura) com faixas de bronze e runas acesas, entre dois pilones
//      ciclópicos com correntes partidas e braseiros no alto; dentro do anel o vórtice do Tártaro (abismo escuro com a
//      borda em brasa). Afloramento de rocha vulcânica atrás; braseiros e estandartes de time na frente.
//      Obra: plataforma e alicerces → pilones a meia altura e cimbre de madeira → anel quase fechado sobre o cimbre. ----
const TG = { cz: -1.3, R: 2.55, tube: 0.5, plat: 0.75 };
B.titan_gate = (k, p) => {
  const { THREE, M, block, box } = k, X = mats(k), st = p.stage;
  const glow = p.state === 'glow';
  k.debris = { x0: -4.6, x1: 4.6, z0: -3.2, z1: 4.6 };
  k.debrisMats = [M.stoneDark, M.stone, M.stoneDark];
  const D = M.stoneDark, S = M.stone;
  // plataforma
  const lv = st === 0 ? 1 : 3;
  for (let i = 0; i < lv; i++) k.box(10 - i * 0.9, 0.25, 10 - i * 0.9, [D, S, S][i], 0, 0.125 + i * 0.25, 0);
  const top = lv * 0.25;
  // juntas do lajeado no patamar de cima
  if (st >= 1) {
    const h = (10 - 2 * 0.9) / 2;
    for (let i = 1; i < 7; i++) {
      const t = -h + (i * 2 * h) / 7;
      for (const [w, d, x, z] of [[2 * h, 0.035, 0, t], [0.035, 2 * h, t, 0]]) { const j = k.box(w, 0.012, d, D, x, top + 0.004, z); j.userData.noShadow = true; }
    }
  }
  const cy = TG.plat + 0.12 + TG.R, cz = TG.cz;
  // soleira do anel
  if (st >= 1) block(-1.4, 1.4, top, top + 0.3, cz - 0.7, cz + 0.7, S);
  // pilones ciclópicos: blocos escalonados, cada fiada um pouco recuada
  const ph = [0.8, 2.3, 4.3, 4.3][st];
  for (const s of [-1, 1]) {
    const px = s * 3.55;
    const tiers = [[1.9, 2.3, 1.1], [1.7, 2.1, 1.1], [1.5, 1.9, 1.05], [1.3, 1.7, 1.05]];
    let y = top;
    for (let i = 0; i < tiers.length && y < top + ph - 1e-6; i++) {
      const [w, d, h] = tiers[i], hh = Math.min(h, top + ph - y);
      k.box(w, hh, d, i % 2 ? D : S, px, y + hh / 2, cz);
      if (hh > 0.5) k.box(w + 0.02, 0.04, d + 0.02, D, px, y + hh * 0.5, cz).userData.noShadow = true;   // junta
      y += hh;
    }
    if (st === 3) {
      // fenda de brasa em zigue-zague descendo pela face sul do pilone (pulsa na sobreposição)
      for (let r = 0; r < 3; r++) {
        const zf = cz + [1.15, 1.05, 0.95][r] + 0.006, x0 = px + s * 0.15 + (r % 2 ? -0.12 : 0.1);
        const rn = k.box(0.07, 0.95, 0.02, X.ember, x0, top + 0.55 + r * 1.07, zf); rn.rotation.z = (r % 2 ? 0.22 : -0.18) * s;
        rn.userData.noShadow = true; rn.userData.pulse = 7 + r + (s > 0 ? 4 : 0); rn.userData.ember = true;
      }
      k.box(1.5, 0.14, 1.9, S, px, y + 0.07, cz);
      brazier(k, px, cz, y + 0.14, 0.95);
      // correntes partidas penduradas na face interna
      for (const dz of [-0.45, 0.45]) {
        for (let i = 0; i < 6; i++) {
          const l = k.mesh(new THREE.TorusGeometry(0.09, 0.025, 5, 10), M.iron, px - s * 0.8, y - 0.45 - i * 0.16, cz + dz);
          l.rotation.y = i % 2 ? Math.PI / 2 : 0; l.rotation.z = Math.PI / 2;
        }
        k.cyl(0.07, 0.07, 0.12, M.iron, px - s * 0.78, y - 0.4, cz + dz, 8).rotation.z = Math.PI / 2;
      }
    }
  }
  // o anel: parcial na obra (sobe pelos dois lados a partir de baixo), completo depois
  const arc = [0, 0.9, 1.65, 2][st] * Math.PI;
  if (arc > 0) {
    const ring = k.mesh(new THREE.TorusGeometry(TG.R, TG.tube, 14, 56, arc), D, 0, cy, cz);
    ring.rotation.z = -Math.PI / 2 - arc / 2;
    const rim = k.mesh(new THREE.TorusGeometry(TG.R - TG.tube * 0.9, 0.07, 6, 56, arc), S, 0, cy, cz + 0.28);
    rim.rotation.z = ring.rotation.z;
    // faixas de bronze (segmentos radiais) e runas acesas na face sul
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + ((i + 0.5) / n - 0.5) * TAU;
      if (Math.abs(((a + Math.PI / 2 + TAU * 1.5) % TAU) - Math.PI) > arc / 2) continue;
      const c = Math.cos(a), si = Math.sin(a);
      const band = k.box(0.14, TG.tube * 2.15, TG.tube * 2.1, M.bronze, c * TG.R, cy + si * TG.R, cz);
      band.rotation.z = a;
      if (st === 3 && i % 2) {
        const rr = TG.R + TG.tube * 0.05;
        const rune = k.box(0.1, 0.34, 0.03, X.rune, Math.cos(a + 0.13) * rr, cy + Math.sin(a + 0.13) * rr, cz + TG.tube * 0.93);
        rune.rotation.z = a; rune.userData.noShadow = true; rune.userData.pulse = i;
      }
    }
    if (st === 3) for (const s of [-1, 1]) k.breakable(k.mesh(new THREE.ConeGeometry(0.2, 0.55, 5), D, s * 0.9, cy + TG.R + 0.45, cz));
    if (st === 3) k.breakable(k.mesh(new THREE.ConeGeometry(0.26, 0.8, 5), D, 0, cy + TG.R + TG.tube + 0.3, cz));
  }
  // cimbre de madeira (obra do arco)
  if (st === 1 || st === 2) {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI + (i / n) * Math.PI, a1 = Math.PI + ((i + 1) / n) * Math.PI, r = TG.R - TG.tube - 0.05;
      for (const dz of [-0.35, 0.35]) rod(k, [Math.cos(a0) * r, cy - Math.sin(a0) * r, cz + dz], [Math.cos(a1) * r, cy - Math.sin(a1) * r, cz + dz], 0.06, M.wood, undefined, 6);
    }
    for (const x of [-1.6, -0.6, 0.6, 1.6]) for (const dz of [-0.35, 0.35]) { const r = TG.R - TG.tube - 0.05, yy = cy + Math.sqrt(Math.max(0, r * r - x * x)); rod(k, [x, top + 0.3, cz + dz], [x, yy, cz + dz], 0.05, M.wood, undefined, 6); }
    k.scaffold({ x0: -4.6, x1: 4.6, z0: cz - 1.3, z1: cz + 1.3, h: [0, 3.2, 5.6][st], pennant: true });
  }
  if (st === 0) {
    k.pile(-2.2, 2.6, D); k.pile(1.8, 3.0, S); k.pile(2.8, 1.2, D);
    // estacas e cordel marcando o círculo do anel, blocos do primeiro patamar à espera
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; k.cyl(0.03, 0.03, 0.5, M.wood, Math.cos(a) * TG.R, top, cz + Math.sin(a) * TG.R * 0.35, 5); }
    for (const [x, z] of [[-3.0, 2.2], [-2.3, 2.3], [3.1, 2.0]]) k.box(0.9, 0.4, 0.7, S, x, top + 0.2, z).rotation.y = k.rand() * 0.4;
  }
  if (st === 3) {
    // vórtice (estático: abismo com a borda em brasa e braços fracos)
    const disc = k.mesh(new THREE.CircleGeometry(TG.R - TG.tube * 0.55, 64), new THREE.MeshBasicMaterial({ map: vortexTexture(THREE, 'base'), toneMapped: false }), 0, cy, cz);
    disc.userData.noShadow = true; disc.userData.vortex = true;
    // afloramento vulcânico atrás (baixo, para não esconder tropas), com fendas de brasa
    for (const [x, z, s, h] of [[-1.9, -3.9, 0.9, 1.0], [-0.6, -4.2, 1.1, 1.4], [0.9, -4.0, 1.0, 1.15], [2.2, -3.8, 0.8, 0.9], [0.1, -3.5, 0.7, 0.8]]) {
      const r = k.mesh(new THREE.IcosahedronGeometry(s, 0), D, x, top + h * 0.35, z); r.scale.set(1.1, h / s * 0.7, 0.9); r.rotation.set(k.rand(), k.rand() * 3, k.rand() * 0.5);
    }
    // fendas de brasa na plataforma, irradiando do portal para a frente
    const cracks = [[-0.3, 0.2, -1.4, 2.6], [0.4, 0.2, 1.5, 2.4], [0.0, 0.3, 0.3, 4.1], [-0.9, 0.0, -2.9, 1.2], [1.0, 0.0, 3.0, 0.9]];
    cracks.forEach(([ax, az, bx, bz], i) => {
      const L = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2), segs = 3;
      let px = ax, pz = az;
      for (let j = 0; j < segs; j++) {
        const t = (j + 1) / segs, jx = ax + (bx - ax) * t + (j < segs - 1 ? (k.rand() - 0.5) * 0.5 : 0), jz = az + (bz - az) * t + (j < segs - 1 ? (k.rand() - 0.5) * 0.3 : 0);
        const len = Math.sqrt((jx - px) ** 2 + (jz - pz) ** 2), w = 0.09 * (1 - j * 0.25);
        const c = k.box(w, 0.02, len, X.ember, (px + jx) / 2, top + 0.012, (pz + jz) / 2); c.rotation.y = Math.atan2(jx - px, jz - pz);
        c.userData.noShadow = true; c.userData.pulse = i * 3 + j; c.userData.ember = true;
        px = jx; pz = jz;
      }
      void L;
    });
    // corrente colossal partida e tambores de coluna caídos no lajeado
    for (let i = 0; i < 5; i++) { const l = k.mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 12), M.iron, -3.3 + i * 0.36, top + 0.07, 1.5 + i * 0.12); l.rotation.set(i % 2 ? Math.PI / 2 : 0.1, 0.3, 0); if (i % 2 === 0) l.rotation.x = Math.PI / 2 - 1.4; }
    k.cyl(0.45, 0.45, 0.7, D, 3.3, top, 1.4, 14).rotation.set(Math.PI / 2, 0, 0.5);
    k.cyl(0.45, 0.45, 0.5, S, 3.55, top, 2.3, 14);
    // braseiros e estandartes na frente
    brazier(k, -2.4, 2.9, top, 0.9); brazier(k, 2.4, 2.9, top, 0.9);
    k.banner(-1.3, 3.9, 2.8, -1); k.banner(1.3, 3.9, 2.8, 1);
  }
  if (glow) glowOverlay(k, p, cy, cz);
};

/**
 * Estado `glow` do portal: o modelo pronto vira oclusor (só profundidade, sem sombra) e só a energia é desenhada — braços
 * luminosos do vórtice girando 1/3 de volta no loop (simetria de 3: sem salto), chamas tremulando e runas/fendas
 * pulsando. Tudo sem mistura (NoBlending): o alfa gravado é a intensidade; o jogo soma (blend aditivo) sobre o edifício.
 */
function glowOverlay(k, p, cy, cz) {
  const { THREE, M } = k;
  const f = Number(p.frame ?? 0), F = Math.max(1, Number(p.frames ?? 1)), ph = (f / F) * TAU;
  const lit = [];
  k.group.traverse((o) => { if (o.isMesh) lit.push(o); });
  for (const o of lit) {
    o.userData.noShadow = true;
    if (o.userData.pulse !== undefined) {
      const a = 0.35 + 0.55 * (0.5 + 0.5 * Math.cos(ph + o.userData.pulse * 1.3));
      o.material = new THREE.MeshBasicMaterial({ color: o.userData.ember ? 0xff8a2a : 0xffc860, toneMapped: false, transparent: false, blending: THREE.NoBlending, opacity: a });
      o.renderOrder = 1;
      o.position.y += o.userData.ember ? 0.004 : 0;
    } else { o.material = M.occluder; o.renderOrder = -1; }
  }
  const nb = (map, opacity, color = 0xffffff) => new THREE.MeshBasicMaterial({ map, color, toneMapped: false, transparent: false, blending: THREE.NoBlending, opacity });
  const arms = k.mesh(new THREE.CircleGeometry(TG.R - TG.tube * 0.55, 64), nb(vortexTexture(THREE, 'arms'), 0.82 + 0.18 * Math.cos(ph)), 0, cy, cz + 0.03);
  arms.rotation.z = -(TAU / 3) * (f / F);
  arms.renderOrder = 1; arms.userData.noShadow = true;
  // chamas: cone luminoso esticado/encolhido com fase por braseiro
  (k.flames ?? []).forEach((fl, i) => {
    const q = 1 + 0.28 * Math.sin(ph + i * 2.1), s = fl.s;
    const c = k.mesh(new THREE.ConeGeometry(0.2 * s, 0.62 * s * q, 9), new THREE.MeshBasicMaterial({ color: 0xffd070, toneMapped: false, transparent: false, blending: THREE.NoBlending, opacity: 0.55 + 0.25 * Math.cos(ph * 2 + i) }), fl.x, fl.y + 0.1 * s + 0.31 * s * q, fl.z + 0.02);
    c.renderOrder = 1; c.userData.noShadow = true;
  });
}

// ---- Estátua de Zeus (maravilha 4×4, 8×8 m): Zeus sentado no trono (marfim e ouro, criselefantina como a de Olímpia,
//      com a Nike na mão direita e o cetro com a águia na esquerda) sobre um pedestal alto, diante de uma êxedra de
//      colunas com parede curva ao fundo; na frente, o espelho d'água de azeite escuro, braseiros e estandartes de time.
//      Obra: plataforma → êxedra e pedestal → a armação de madeira da estátua (como era feita) com andaime. ----
B.wonder_zeus = (k, p) => {
  const { THREE, M, block, box } = k, X = mats(k), st = p.stage;
  k.debris = { x0: -4, x1: 4, z0: -4, z1: 4 };
  k.debrisMats = [M.marble, M.marbleDark, M.marble];
  const top = steps(k, 8, 8, st === 0 ? 1 : 3, 0.2, 0.3, [M.marbleDark, M.marble, M.marble]);
  // êxedra: parede curva ao fundo (norte) e colunata em semicírculo
  const ex = { cx: 0, cz: -0.35, rw: 3.55, rc: 2.95, n: 9 };
  const colH = 2.9, cf = [0, 0.45, 1, 1][st];
  if (st >= 1) {
    const segs = 14;
    for (let i = 0; i < segs; i++) {
      const a0 = Math.PI + (i / segs) * Math.PI, a1 = Math.PI + ((i + 1) / segs) * Math.PI, am = (a0 + a1) / 2;
      const len = 2 * ex.rw * Math.sin((a1 - a0) / 2) + 0.06;
      const w = box(len, (colH + 0.35) * cf, 0.4, M.marble, ex.cx + Math.cos(am) * ex.rw, top + ((colH + 0.35) * cf) / 2, ex.cz + Math.sin(am) * ex.rw);
      w.rotation.y = -am - Math.PI / 2;
    }
    for (let i = 0; i < ex.n; i++) {
      const a = Math.PI + ((i + 0.5) / ex.n) * Math.PI, x = ex.cx + Math.cos(a) * ex.rc, z = ex.cz + Math.sin(a) * ex.rc;
      if (cf < 1) k.cyl(0.14, 0.16, colH * cf, M.marble, x, top, z, 12); else ionic(k, x, z, top, colH, 0.16, M.marble, M.marbleDark);
    }
  }
  if (st >= 2) {
    // entablamento curvo (segmentos entre as colunas e a parede) e cobertura plana
    const segs = 18;
    for (let i = 0; i < segs; i++) {
      const a0 = Math.PI + (i / segs) * Math.PI, a1 = Math.PI + ((i + 1) / segs) * Math.PI, am = (a0 + a1) / 2;
      const r = (ex.rc + ex.rw) / 2 + 0.05, len = 2 * (ex.rw + 0.3) * Math.sin((a1 - a0) / 2) + 0.05;
      const e = box(len, 0.36, ex.rw - ex.rc + 0.55, M.marble, ex.cx + Math.cos(am) * r, top + colH + 0.18, ex.cz + Math.sin(am) * r);
      e.rotation.y = -am - Math.PI / 2;
      const fr = box(2 * ex.rc * Math.sin((a1 - a0) / 2) + 0.02, 0.14, 0.05, st === 3 ? M.gold : M.marbleDark, ex.cx + Math.cos(am) * (ex.rc - 0.26), top + colH + 0.2, ex.cz + Math.sin(am) * (ex.rc - 0.26));
      fr.rotation.y = -am - Math.PI / 2;
    }
  }
  if (st === 3) for (let i = 0; i <= 4; i++) { const a = Math.PI + (i / 4) * Math.PI; k.breakable(k.mesh(new THREE.ConeGeometry(0.1, 0.32, 6), M.gold, ex.cx + Math.cos(a) * (ex.rc + 0.3), top + colH + 0.52, ex.cz + Math.sin(a) * (ex.rc + 0.3))); }
  // pedestal
  const pz0 = -1.75, pz1 = 0.55, px = 1.3, ph = [0.35, 1.05, 1.05, 1.05][st];
  block(-px, px, top, top + ph, pz0, pz1, M.marbleDark);
  if (st >= 1) { block(-px - 0.08, px + 0.08, top + ph - 0.12, top + ph, pz0 - 0.08, pz1 + 0.08, M.marble); block(-px - 0.06, px + 0.06, top, top + 0.14, pz0 - 0.06, pz1 + 0.06, M.marble); }
  if (st === 3) for (let i = 0; i < 5; i++) box(0.3, 0.42, 0.03, M.gold, -1.0 + i * 0.5, top + 0.52, pz1 + 0.015);
  const pt = top + ph;
  // estátua: armação de madeira na obra (build2), ouro e marfim pronta
  const S = 3.05;
  const seatY = pt + 0.4 * S, backZ = pz0 + 0.2, frontZ = backZ + 1.35;
  if (st >= 2) {
    const trim = st === 3 ? M.gold : M.wood, body = st === 3 ? X.ebony : M.wood;
    block(-0.95, 0.95, pt, seatY, backZ, frontZ, body);                                    // assento
    block(-1.0, 1.0, seatY - 0.1, seatY, backZ - 0.05, frontZ + 0.05, trim);
    block(-1.0, 1.0, pt, seatY + 2.8, backZ - 0.3, backZ, body);                             // espaldar
    if (st === 3) { for (const [x0, x1, y0, y1] of [[-0.85, 0.85, seatY + 2.55, seatY + 2.65], [-0.85, -0.75, seatY + 0.9, seatY + 2.65], [0.75, 0.85, seatY + 0.9, seatY + 2.65]]) block(x0, x1, y0, y1, backZ, backZ + 0.03, M.gold); }
    block(-1.05, 1.05, seatY + 2.8, seatY + 2.95, backZ - 0.34, backZ + 0.04, trim);
    for (const s of [-1, 1]) {
      block(s * 0.95 - 0.15, s * 0.95 + 0.15, seatY, seatY + 0.85, backZ, frontZ - 0.1, body);   // braços do trono
      block(s * 0.95 - 0.17, s * 0.95 + 0.17, seatY + 0.85, seatY + 0.93, backZ, frontZ - 0.05, trim);
      if (st === 3) k.breakable(k.mesh(new THREE.SphereGeometry(0.13, 10, 8), M.gold, s * 0.92, seatY + 3.05, backZ - 0.15));
    }
    block(-0.8, 0.8, pt, pt + 0.2, frontZ + 0.15, frontZ + 0.75, trim);                       // escabelo
    if (st === 2) {
      // armação: postes e travessas no lugar do corpo
      for (const [x, z] of [[-0.35, backZ + 0.4], [0.35, backZ + 0.4], [-0.35, frontZ + 0.3], [0.35, frontZ + 0.3]]) k.cyl(0.06, 0.06, (z > frontZ ? 0.4 : 2.5) * S * 0.6, M.wood, x, z > frontZ ? pt + 0.2 : seatY, z, 6);
      for (let y = seatY + 0.5; y < seatY + 2.3; y += 0.55) k.box(0.9, 0.08, 0.08, M.wood, 0, y, backZ + 0.4);
      k.cyl(0.05, 0.05, 1.3, M.wood, 0, seatY + 0.3, backZ + 0.8, 6).rotation.x = Math.PI / 2;
      k.scaffold({ x0: -1.6, x1: 1.6, z0: pz0 - 0.3, z1: pz1 + 0.45, h: 5.5, pennant: true });
    }
  }
  if (st === 3) {
    const J = figure(k, { x: 0, y: pt + 0.2, z: backZ + 0.45, S, pose: 'seat', skin: X.ivory, hair: M.gold, sandal: M.gold, beard: true,
      arms: { L: [[0.05, 0, -1.35], [0, 0, -1.72]], R: [[-0.38, 0, 0.12], [-1.15, 0, 0]] } });
    // himátion de ouro: colo, cortina da frente até os pés e faixa pelo ombro esquerdo
    const kn = where(k, J.kneeL), knR = where(k, J.kneeR);
    const kz = (kn.z + knR.z) / 2;
    block(-0.58, 0.58, seatY + 0.05, seatY + 0.42, backZ + 0.35, kz + 0.2, M.gold);
    const fall = box(1.12, seatY + 0.35 - (pt + 0.45), 0.14, M.gold, 0, (seatY + 0.35 + pt + 0.45) / 2, kz + 0.24); fall.rotation.x = 0.1;
    const band = box(0.34, 1.9, 0.14, M.gold, -0.18, seatY + 1.55, backZ + 0.72); band.rotation.z = 0.62;
    // Nike na mão direita, cetro com a águia na esquerda, coroa de oliveira
    const hr = where(k, J.handR);
    k.mesh(new THREE.ConeGeometry(0.17, 0.5, 10), M.gold, hr.x, hr.y + 0.36, hr.z);
    k.mesh(new THREE.SphereGeometry(0.075, 10, 8), M.gold, hr.x, hr.y + 0.66, hr.z);
    for (const s of [-1, 1]) { const w = box(0.34, 0.2, 0.03, M.gold, hr.x + s * 0.17, hr.y + 0.56, hr.z - 0.06); w.rotation.z = s * 0.5; }
    const hl = where(k, J.handL);
    rod(k, [hl.x, pt + 0.2, hl.z], [hl.x, hl.y + 1.0, hl.z], 0.045, M.gold, undefined, 8);
    const eagle = new THREE.Group(); eagle.position.set(hl.x, hl.y + 1.1, hl.z); k.r.add(eagle);
    k.mesh(new THREE.SphereGeometry(0.13, 10, 8), M.gold, 0, 0, 0, eagle).scale.set(1, 0.9, 1.4);
    for (const s of [-1, 1]) { const w = k.box(0.42, 0.05, 0.2, M.gold, s * 0.24, 0.1, 0, eagle); w.rotation.z = s * -0.55; k.breakable(w); }
    const hd = where(k, J.head);
    k.mesh(new THREE.TorusGeometry(0.36, 0.05, 6, 18), M.gold, hd.x, hd.y + 0.42, hd.z + 0.01).rotation.x = Math.PI / 2;
    // espelho d'água de azeite, braseiros, estandartes
    for (const [x0, x1, z0, z1] of [[-1.65, 1.65, 1.3, 1.5], [-1.65, 1.65, 2.9, 3.1], [-1.65, -1.45, 1.5, 2.9], [1.45, 1.65, 1.5, 2.9]]) block(x0, x1, top, top + 0.26, z0, z1, M.marbleDark);
    block(-1.45, 1.45, top, top + 0.16, 1.5, 2.9, X.oil);
    brazier(k, -2.45, 1.55, top, 0.85); brazier(k, 2.45, 1.55, top, 0.85);
    k.banner(-3.3, 3.25, 2.8, 1); k.banner(3.3, 3.25, 2.8, -1);
  } else if (st <= 1) {
    k.scaffold({ x0: -1.6, x1: 1.6, z0: pz0 - 0.3, z1: pz1 + 0.45, h: [1.2, 2.4][st], pennant: true });
    k.pile(-2.4, 2.4, M.marble); k.pile(2.2, 2.7, M.marbleDark);
  }
};

// ---- Templo de Ártemis (maravilha 4×4, 8×8 m): o Artemísio de Éfeso — jônico, díptero na frente (duas filas de 8
//      colunas, os tambores de baixo esculpidos), 8 colunas em cada flanco, cela de mármore com portas de bronze, friso
//      pintado de azul com figuras douradas, frontão ao sul com o tímpano azul e esculturas douradas, telhado de terracota
//      com acrotérios de ouro; estandartes de time na escadaria. ----
B.wonder_artemis = (k, p) => {
  const { THREE, M, block, box } = k, X = mats(k), st = p.stage;
  k.debris = { x0: -3.9, x1: 3.9, z0: -3.9, z1: 3.9 };
  k.debrisMats = [M.marble, M.marbleDark, M.marble];
  const top = steps(k, 8, 8, st === 0 ? 1 : 3, 0.2, 0.25, [M.marbleDark, M.marble, M.marble]);
  const colH = 3.0, r = 0.17, cf = [0.2, 0.5, 1, 1][st];
  const xs = Array.from({ length: 8 }, (_, i) => -3.15 + i * 0.9);
  const zs = Array.from({ length: 8 }, (_, i) => -3.3 + i * ((2.95 + 3.3) / 7));
  const cols = [];
  for (const x of xs) { cols.push([x, 2.95, true]); cols.push([x, 2.1, true]); cols.push([x, -3.3, false]); }
  for (const z of zs.slice(1, -1)) for (const x of [-3.15, 3.15]) cols.push([x, z, false]);
  cols.forEach(([x, z, front], n) => {
    if (st === 0 && n % 3 === 1) return;
    if (cf < 1) { k.cyl(r * 0.9, r, colH * cf, M.marble, x, top, z, 12); return; }
    ionic(k, x, z, top, colH, r, M.marble, st === 3 ? M.marbleDark : M.marble);
    if (front) k.cyl(r * 1.18, r * 1.2, 0.55, M.marbleDark, x, top + 0.15, z, 14);          // tambor esculpido
    if (front && st === 3) k.cyl(r * 1.22, r * 1.22, 0.04, M.gold, x, top + 0.68, z, 14);
  });
  // cela com portas de bronze
  const ch = colH * [0.15, 0.5, 1, 1][st];
  block(-1.9, 1.9, top, top + ch, -2.6, 1.4, M.marble);
  if (st >= 2) { block(-0.55, 0.55, top, top + 2.1, 1.4, 1.43, st === 3 ? M.bronze : M.woodDark); block(-0.7, 0.7, top + 2.1, top + 2.3, 1.4, 1.45, M.marbleDark); }
  const et = top + colH;
  if (st >= 2) {
    // entablamento: arquitrave de três faixas, friso pintado e cornija
    block(-3.4, 3.4, et, et + 0.36, -3.55, 3.2, M.marble);
    for (const y of [0.12, 0.24]) block(-3.42, 3.42, et + y - 0.012, et + y + 0.012, 3.2, 3.215, M.marbleDark);
    block(-3.42, 3.42, et + 0.36, et + 0.62, -3.57, 3.22, st === 3 ? X.paintBlue : M.marble);
    block(-3.5, 3.5, et + 0.62, et + 0.76, -3.65, 3.3, M.marbleDark);
    if (st === 3) for (let i = 0; i < 16; i++) box(0.14, 0.18, 0.03, M.gold, -3.2 + i * (6.4 / 15), et + 0.49, 3.235);
  }
  const eave = et + 0.76;
  if (st === 2) k.gable({ cx: 0, cz: -0.17, axis: 'z', w: 7.0, len: 6.9, y: eave, rise: 1.2, frame: true });
  if (st === 3) {
    // telhas de terracota escura (a do templo comum é a clara) com cumeeira dourada e antefixas de ouro nos beirais
    k.gable({ cx: 0, cz: -0.17, axis: 'z', w: 7.1, len: 6.95, y: eave, rise: 1.2, roof: M.terracottaDark, rows: M.terracotta, ped: M.marble, pedDark: X.paintBlue, nRows: 8 });
    k.box(0.14, 0.1, 7.2, M.gold, 0, eave + 1.29, -0.17);
    for (let i = 0; i < 10; i++) for (const sx of [-1, 1]) k.breakable(k.mesh(new THREE.ConeGeometry(0.07, 0.2, 5), M.gold, sx * 3.62, eave + 0.02, -3.5 + i * (6.7 / 9)));
    // esculturas douradas no tímpano e acrotérios de ouro (quebráveis)
    for (const [x, h] of [[-1.5, 0.3], [-0.8, 0.5], [0, 0.72], [0.8, 0.5], [1.5, 0.3]]) { const f = box(0.26, h, 0.1, M.gold, x, eave + 0.08 + h / 2, 3.33); f.userData.pediment = true; }
    for (const [x, y] of [[-3.55, eave + 0.2], [0, eave + 1.45], [3.55, eave + 0.2]]) {
      k.breakable(k.mesh(new THREE.ConeGeometry(0.16, 0.5, 6), M.gold, x, y, 3.3));
      k.breakable(k.mesh(new THREE.ConeGeometry(0.16, 0.5, 6), M.gold, x, y, -3.55));
    }
    k.banner(-3.75, 3.75, 2.6, 1); k.banner(3.75, 3.75, 2.6, -1);
    brazier(k, -1.2, 3.65, 0.2, 0.7); brazier(k, 1.2, 3.65, 0.2, 0.7);
  } else {
    k.scaffold({ x0: -3.75, x1: 3.75, z0: -3.8, z1: 3.55, h: [1.2, 2.6, 4.9][st] });
    k.pile(2.9, 3.75, M.marble); if (st === 0) k.cyl(0.19, 0.19, 0.9, M.marble, -2.4, 0.19, 3.6, 12).rotation.z = Math.PI / 2;
  }
};

// ---- Colosso de Rodes (maravilha 4×4, 8×8 m): Hélio em bronze (6 m), em contraposto, a tocha erguida na mão direita,
//      a clâmide pendendo do braço esquerdo e a coroa radiada de ouro, sobre pedestal de mármore em dois tambores com
//      faixas de bronze; praça de três degraus, braseiros e estandartes de time.
//      Obra: pedestal → pernas fundidas com o esqueleto de ferro e pedra à mostra → corpo até o peito, andaime alto. ----
B.wonder_colossus = (k, p) => {
  const { THREE, M, block, box } = k, X = mats(k), st = p.stage;
  k.debris = { x0: -3.9, x1: 3.9, z0: -3.9, z1: 3.9 };
  k.debrisMats = [M.marble, M.marbleDark, M.bronze];
  const top = steps(k, 8, 8, st === 0 ? 1 : 3, 0.18, 0.4, [M.marbleDark, M.marble, M.marble]);
  const cz = -0.25;
  if (st >= 1) for (let i = 1; i < 6; i++) { const t = -3.2 + (i * 6.4) / 6; for (const [w, d, x, z] of [[6.4, 0.035, 0, t], [0.035, 6.4, t, 0]]) k.box(w, 0.012, d, M.marbleDark, x, top + 0.004, z).userData.noShadow = true; }
  k.cyl(2.3, 2.35, 0.25, M.marbleDark, 0, top, cz, 32);
  const b0 = top + 0.25;
  // pedestal: tambor largo + tambor estreito com cornija e faixas de bronze
  const d1 = [0.5, 1.0, 1.0, 1.0][st], d2 = st >= 1 ? 0.95 : 0;
  k.cyl(1.35, 1.45, d1, M.marble, 0, b0, cz, 28);
  if (st >= 1) {
    k.cyl(1.48, 1.48, 0.12, M.bronze, 0, b0 + 0.2, cz, 28);
    k.cyl(1.1, 1.18, d2, M.marble, 0, b0 + d1, cz, 28);
    k.cyl(1.25, 1.2, 0.14, M.marbleDark, 0, b0 + d1 + d2, cz, 28);
    k.cyl(1.2, 1.2, 0.08, M.bronze, 0, b0 + d1 + d2 * 0.6, cz, 28);
  }
  const pt = b0 + d1 + d2 + 0.14;
  const S = 3.3;
  if (st >= 1) {
    const J = figure(k, { x: 0, y: pt, z: cz, S, pose: 'stand', skin: M.bronze, hair: M.bronzeDark, chest: [1.4, 1.05, 0.92], limb: 1.15,
      arms: { L: [[-0.12, 0, -0.22], [-0.75, 0, 0]], R: [[-0.2, 0, 2.62], [0, 0, 0.3]] } });
    if (st < 3) {
      // esconde o que ainda não foi fundido: build1 = só as pernas; build2 = até o peito, sem braços nem cabeça
      const hide = (g) => g.traverse((o) => { if (o.isMesh) o.visible = false; });
      if (st === 1) hide(J.torso);
      else { hide(J.head); hide(J.elbowL.parent); hide(J.elbowR.parent); }
      // esqueleto de ferro e pedra (colunas internas) à mostra acima do bronze
      const yTop = st === 1 ? pt + 1.0 * S : pt + 1.4 * S;
      for (const x of [-0.25, 0.25]) k.cyl(0.12, 0.14, yTop + (st === 1 ? 1.2 : 1.6) - pt, M.stone, x, pt, cz, 8);
      for (let y = pt + 0.8; y < yTop + 1.4; y += 0.6) k.box(0.9, 0.06, 0.06, M.iron, 0, y, cz + 0.12);
      k.scaffold({ x0: -1.45, x1: 1.45, z0: cz - 1.4, z1: cz + 1.4, h: st === 1 ? 5.4 : 7.6, pennant: true });
      k.pile(-2.6, 2.6, M.bronzeDark); k.pile(2.4, 2.9, M.marble);
    } else {
      // tocha na mão direita, clâmide no braço esquerdo, coroa radiada
      const hr = where(k, J.handR);
      rod(k, [hr.x, hr.y - 0.35, hr.z], [hr.x + 0.05, hr.y + 0.55, hr.z], 0.07, M.bronzeDark, undefined, 8);
      k.cyl(0.14, 0.1, 0.18, M.gold, hr.x + 0.05, hr.y + 0.52, hr.z, 10);
      const fl = k.mesh(new THREE.ConeGeometry(0.2, 0.62, 9), X.fire, hr.x + 0.05, hr.y + 1.0, hr.z); fl.userData.noShadow = true;
      const fc = k.mesh(new THREE.ConeGeometry(0.11, 0.36, 8), X.fireCore, hr.x + 0.05, hr.y + 0.9, hr.z + 0.04); fc.userData.noShadow = true;
      const el = where(k, J.elbowL), hl = where(k, J.handL);
      const drape = box(0.42, 1.55, 0.12, M.bronzeDark, (el.x + hl.x) / 2 - 0.05, (el.y + hl.y) / 2 - 0.45, (el.z + hl.z) / 2); drape.rotation.z = -0.08;
      const hd = where(k, J.head);
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.1 + (0.8 * i) / 8), rr = 0.46;
        const ray = k.mesh(new THREE.ConeGeometry(0.075, 0.62, 5), M.gold, hd.x + Math.cos(a) * rr, hd.y + 0.36 + Math.sin(a) * rr * 0.9, hd.z + 0.02);
        ray.rotation.z = a - Math.PI / 2; k.breakable(ray);
      }
      k.mesh(new THREE.TorusGeometry(0.33, 0.04, 6, 18), M.gold, hd.x, hd.y + 0.34, hd.z).rotation.x = Math.PI / 2 - 0.2;
      brazier(k, -2.7, 2.7, top, 0.85); brazier(k, 2.7, 2.7, top, 0.85);
      k.banner(-3.5, 3.5, 2.8, 1); k.banner(3.5, 3.5, 2.8, -1);
      // estela de dedicatória à frente do pedestal
      block(-0.45, 0.45, top, top + 0.9, 1.95, 2.1, M.marble); block(-0.5, 0.5, top + 0.9, top + 1.0, 1.9, 2.15, M.marbleDark);
    }
  } else {
    k.scaffold({ x0: -1.6, x1: 1.6, z0: cz - 1.6, z1: cz + 1.6, h: 1.4, pennant: true });
    k.pile(-2.6, 2.6, M.marble); k.pile(2.4, 2.9, M.marbleDark);
  }
};

/** Estilos do lote (conferência em manifest/bake). */
export const MILITARY_STYLES = Object.keys(MILITARY_BUILDERS);
