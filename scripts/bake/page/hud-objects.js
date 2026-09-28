// Biblioteca de OBJETOS dos ícones do HUD (Etapa 7; docs/ART.md Apêndice H): recursos, tecnologias, Idades, habilidades e
// poderes. Cada objeto é um grupo three.js em METROS, base em y = 0, frente para +z (a câmera do contrato olha do sul,
// 50° acima); emblemas planos (raio, olho) ficam de frente para a câmera com `faceCam`. Materiais de materials.js (bronze,
// ouro, madeira, mármore, terracota…) e alguns próprios dos ícones (fogo, vidro, água, brilhos), criados uma vez por
// conjunto de materiais. Determinístico: nada de Math.random (as variações saem de `hash`).


const TAU = Math.PI * 2, DEG = Math.PI / 180;
/** Ruído determinístico em [0, 1) por inteiro. */
const hash = (i) => { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

/** Materiais próprios dos ícones. */
function X(THREE, M) {
  if (M.__hud) return M.__hud;
  const std = (color, roughness, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const glow = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra });
  const env = M.bronze.envMap ?? null;
  M.__hud = {
    fire: glow(0xff8a2a), fireCore: glow(0xffe08a), ember: glow(0xff5a1a),
    glowGreen: glow(0x9dffb0), glowGold: glow(0xffe9a0), glowPurple: glow(0xc59aff), glowBlue: glow(0xcfe6ff), glowWhite: glow(0xffffff),
    glowRed: glow(0xff6a4a),
    glass: std(0xcfe6f0, 0.08, 0, { transparent: true, opacity: 0.45 }),
    water: std(0x3f86c0, 0.12, 0.1, { transparent: true, opacity: 0.88 }),
    ichor: glow(0xffc24a),
    silver: std(0xc8ccd0, 0.26, 1, { envMap: env, envMapIntensity: 0.55 }),
    goldBright: std(0xe0ac38, 0.26, 1, { envMap: env, envMapIntensity: 0.55 }),
    bronzeBright: std(0xa87430, 0.3, 1, { envMap: env, envMapIntensity: 0.5 }),
    cloud: std(0x4a4f5a, 1), cloudLight: std(0x8a909c, 1),
    bread: std(0xb57a38, 0.75), crust: std(0x8a5424, 0.8), apple: std(0x9e2a22, 0.45), appleLeaf: std(0x4f6b32, 0.8),
    wheat: std(0xd9b45c, 0.8), stalk: std(0xc9a24e, 0.85),
    wax: std(0x2e2218, 0.55), papyrus: std(0xe3d2a4, 0.9), ink: std(0x2a2018, 0.9),
    hideTop: std(0xdcc9a0, 0.85), bone: std(0xe6dfcb, 0.65), pink: std(0xd98a9a, 0.8), rose: std(0xb8304a, 0.6),
    peacock: std(0x1f6f78, 0.4, 0.3), peacockEye: std(0x1f3f9a, 0.35, 0.3),
    grape: std(0x4a2458, 0.35), vine: std(0x4f6b32, 0.8), wine: std(0x5a0f1a, 0.2),
    miasma: std(0x5e3380, 0.9, 0, { transparent: true, opacity: 0.75, emissive: 0x3a1a5a, emissiveIntensity: 0.6 }),
    earthDark: std(0x5a4632, 1), grass: std(0x5f7a33, 1), boar: std(0x4a3a2e, 0.95), snout: std(0x8a6a5a, 0.7),
    eyeWhite: std(0xf2ecdc, 0.3), iris: std(0x2a6fb0, 0.25), pupil: std(0x0b0a09, 0.2),
    stoneGlow: std(0x8a857a, 0.9, 0, { emissive: 0xffd88a, emissiveIntensity: 0.15 }),
    red: std(0x8a2a24, 0.85), darkCloth: std(0x2a2630, 0.9),
  };
  return M.__hud;
}

/** Ferramentas de construção: `add(geo, mat, pos, rot, parent)` e geometrias de conveniência. */
function tools(THREE, root) {
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = root) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
  };
  const group = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = root) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx, ry, rz); parent.add(g); return g; };
  const cyl = (rt, rb, h, s = 20) => new THREE.CylinderGeometry(rt, rb, h, s);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const sph = (r, ws = 18, hs = 14) => new THREE.SphereGeometry(r, ws, hs);
  const tor = (R, r, rs = 10, ts = 36, arc = TAU) => new THREE.TorusGeometry(R, r, rs, ts, arc);
  const cone = (r, h, s = 18) => new THREE.ConeGeometry(r, h, s);
  /** Sólido de revolução: perfil [[r, y], …] de baixo para cima. */
  const lathe = (prof, s = 32) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)), s);
  /** Tubo por pontos [x, y, z]. */
  const tube = (pts, r, seg = 40, rs = 8, closed = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed), seg, r, rs, closed);
  /** Extrusão de um contorno 2D [x, y] (no plano XY, espessura em z centrada). */
  const extrude = (pts, depth, bevel = 0.004) => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 16 });
    geo.translate(0, 0, -depth / 2);
    return geo;
  };
  return { add, group, cyl, box, sph, tor, cone, lathe, tube, extrude };
}
/** Inclinação da câmera do ícone (graus; buildObject recebe a do ícone). */
let PITCH = 32;
/** Vira um grupo com a face em +z para ficar de frente para a câmera do ícone (inclinado para trás pela inclinação). */
const faceCam = (g) => { g.rotation.x = -PITCH * DEG; return g; };

// ---------------------------------------------------------------------------------------------------------------
// peças reaproveitadas

function sword(THREE, M, T, parent, { mat, len = 0.62, hilt = M.leather, guard = M.bronze } = {}) {
  const g = T.group(0, 0, 0, 0, 0, 0, parent);
  // lâmina de xifos (folha: larga no meio, ponta aguda)
  T.add(T.extrude([[0, 0], [0.028, 0.06], [0.034, len * 0.55], [0.02, len * 0.85], [0, len], [-0.02, len * 0.85], [-0.034, len * 0.55], [-0.028, 0.06]], 0.008, 0.003), mat, 0, 0.02, 0, 0, 0, 0, g);
  T.add(T.box(0.13, 0.022, 0.03), guard, 0, 0.012, 0, 0, 0, 0, g);
  T.add(T.cyl(0.016, 0.018, 0.12, 12), hilt, 0, -0.055, 0, 0, 0, 0, g);
  T.add(T.sph(0.026, 12, 10), guard, 0, -0.125, 0, 0, 0, 0, g);
  return g;
}
function flame(THREE, M, T, parent, { h = 0.3, r = 0.1, x = 0, y = 0, z = 0, seed = 1 } = {}) {
  const x2 = X(THREE, M);
  const g = T.group(x, y, z, 0, 0, 0, parent);
  const tongue = (hh, rr, ox, oz, mat, lean) => T.add(T.lathe([[0, 0], [rr * 0.8, hh * 0.12], [rr, hh * 0.3], [rr * 0.7, hh * 0.55], [rr * 0.3, hh * 0.8], [0, hh]], 18), mat, ox, 0, oz, 0, 0, lean, g);
  tongue(h, r, 0, 0, x2.fire, 0);
  for (let i = 0; i < 3; i++) tongue(h * (0.55 + 0.25 * hash(seed * 7 + i)), r * 0.55, (hash(seed + i) - 0.5) * r * 1.2, (hash(seed * 3 + i) - 0.5) * r, x2.fire, (hash(seed * 5 + i) - 0.5) * 0.6);
  tongue(h * 0.6, r * 0.55, 0, r * 0.2, x2.fireCore, 0);
  for (const o of g.children) o.userData.noShadow = true;
  return g;
}
function bowModel(THREE, M, T, parent, { mat = M.wood, grip = M.leather, string = M.rope, h = 0.9 } = {}) {
  const g = T.group(0, 0, 0, 0, 0, 0, parent);
  // arco recurvo composto: barriga, pontas voltadas para fora
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16 * 2 - 1, y = t * h / 2;
    const x = -0.12 * (1 - t * t) + 0.05 * Math.pow(Math.abs(t), 6) * 1.0;
    pts.push([x, y, 0]);
  }
  T.add(T.tube(pts, 0.014, 48, 8), mat, 0, 0, 0, 0, 0, 0, g);
  T.add(T.cyl(0.02, 0.02, 0.12, 10), grip, -0.12, 0, 0, 0, 0, 0, g);
  T.add(T.tube([[pts[0][0], pts[0][1], 0], [pts[16][0], pts[16][1], 0]], 0.003, 4, 4), string, 0, 0, 0, 0, 0, 0, g);
  return g;
}
function arrow(THREE, M, T, parent, { len = 0.7, head = M.bronze, shaft = M.wood, fletch = M.linen } = {}) {
  const g = T.group(0, 0, 0, 0, 0, 0, parent);
  T.add(T.cyl(0.007, 0.007, len, 6), shaft, 0, len / 2, 0, 0, 0, 0, g);
  T.add(T.cone(0.022, 0.07, 8), head, 0, len + 0.03, 0, 0, 0, 0, g);
  for (let k = 0; k < 3; k++) T.add(T.box(0.002, 0.09, 0.03), fletch, 0, 0.06, 0, 0, (k * TAU) / 3, 0, g);
  return g;
}
function hoplon(THREE, M, T, parent, { r = 0.45, face = M.bronzeDark, rim = M.bronze, emblem = null } = {}) {
  const g = T.group(0, 0, 0, 0, 0, 0, parent);
  // prato raso de bronze com a borda larga e virada
  T.add(T.lathe([[0, 0.05], [r * 0.5, 0.045], [r * 0.85, 0.02], [r * 0.9, 0.0], [r, 0.004], [r, -0.012], [r * 0.9, -0.016], [0, -0.016]], 40), face, 0, 0, 0, Math.PI / 2, 0, 0, g);
  T.add(T.tor(r * 0.95, 0.02, 8, 48), rim, 0, 0, 0.004, 0, 0, 0, g);
  if (emblem) T.add(T.cyl(r * 0.28, r * 0.28, 0.01, 28), emblem, 0, 0, 0.055, Math.PI / 2, 0, 0, g);
  return g;
}
function amphoraShape(T, mat, parent, { h = 0.8, r = 0.2, x = 0, y = 0, z = 0 } = {}) {
  const prof = [[0.02, 0], [r * 0.3, 0.02 * h], [r * 0.55, 0.12 * h], [r, 0.42 * h], [r * 0.92, 0.6 * h], [r * 0.5, 0.78 * h], [r * 0.32, 0.86 * h], [r * 0.3, 0.97 * h], [r * 0.4, h], [r * 0.3, h]];
  return T.add(T.lathe(prof, 32), mat, x, y, z, 0, 0, 0, parent);
}

// ---------------------------------------------------------------------------------------------------------------
// objetos

const OBJ = {};

// ---- recursos ----
OBJ.food = (THREE, M, T) => {
  const x = X(THREE, M);
  // cesto de vime com dois pães redondos e maçãs
  T.add(T.lathe([[0.22, 0], [0.3, 0.05], [0.36, 0.2], [0.35, 0.22], [0.33, 0.2], [0.28, 0.06], [0.001, 0.05]], 36), M.wicker, 0, 0, 0);
  T.add(T.tor(0.355, 0.018, 8, 40), M.wicker, 0, 0.21, 0, Math.PI / 2, 0, 0);
  const loaf = (px, pz, s) => { const m = T.add(T.sph(0.16 * s, 22, 14), x.bread, px, 0.24, pz); m.scale.set(1, 0.62, 1); T.add(T.tor(0.1 * s, 0.012, 6, 24), x.crust, px, 0.3, pz, Math.PI / 2, 0, 0); };
  loaf(-0.1, -0.05, 1); loaf(0.12, 0.06, 0.85);
  for (let i = 0; i < 3; i++) { const a = -0.5 + i * 0.55; T.add(T.sph(0.07, 16, 12), x.apple, Math.cos(a) * 0.2 + 0.02, 0.26 + 0.02 * i, 0.16 + Math.sin(a) * 0.05); }
  T.add(T.box(0.05, 0.004, 0.025), x.appleLeaf, 0.05, 0.34, 0.17, 0.3, 0.5, 0);
};
OBJ.wood = (THREE, M, T) => {
  // pilha de toras: três embaixo, duas em cima (casca e o topo claro com anéis)
  const log = (px, py, pz, len, r) => {
    T.add(T.cyl(r, r * 1.03, len, 18), M.bark, px, py, pz, 0, 0, Math.PI / 2);
    for (const s of [-1, 1]) {
      T.add(T.cyl(r * 0.94, r * 0.94, 0.006, 18), M.limestone, px + s * (len / 2 + 0.002), py, pz, 0, 0, Math.PI / 2);
      T.add(T.tor(r * 0.55, 0.005, 4, 18), M.woodDark, px + s * (len / 2 + 0.005), py, pz, 0, Math.PI / 2, 0);
    }
  };
  log(0, 0.09, -0.19, 0.78, 0.09); log(0.03, 0.09, 0, 0.8, 0.095); log(-0.02, 0.09, 0.19, 0.76, 0.088);
  log(0.02, 0.25, -0.09, 0.74, 0.085); log(-0.01, 0.25, 0.1, 0.72, 0.088);
};
OBJ.gold = (THREE, M, T) => {
  const x = X(THREE, M);
  // pilha de moedas e pepitas
  for (let i = 0; i < 6; i++) T.add(T.cyl(0.11, 0.11, 0.025, 28), x.goldBright, -0.12 + (hash(i) - 0.5) * 0.02, 0.013 + i * 0.026, -0.02 + (hash(i + 9) - 0.5) * 0.02);
  for (let i = 0; i < 4; i++) T.add(T.cyl(0.11, 0.11, 0.025, 28), x.goldBright, 0.12 + (hash(i + 3) - 0.5) * 0.02, 0.013 + i * 0.026, 0.04);
  T.add(T.cyl(0.11, 0.11, 0.025, 28), x.goldBright, 0.02, 0.05, 0.2, 0.9, 0, 0.2);
  for (let i = 0; i < 5; i++) { const n = T.add(new THREE.DodecahedronGeometry(0.05 + 0.02 * hash(i + 20), 0), M.gold, -0.2 + 0.1 * i, 0.03, 0.16 + 0.05 * hash(i + 30)); n.rotation.set(hash(i) * 3, hash(i + 1) * 3, 0); }
};
OBJ.knowledge = (THREE, M, T) => {
  const x = X(THREE, M);
  // rolo de papiro meio aberto, com as varetas e linhas de texto
  const rod = (px) => { T.add(T.cyl(0.07, 0.07, 0.62, 24), x.papyrus, px, 0.07, 0, Math.PI / 2, 0, 0); for (const s of [-1, 1]) T.add(T.cyl(0.018, 0.018, 0.1, 10), M.woodDark, px, 0.07, s * 0.35, Math.PI / 2, 0, 0); };
  rod(-0.3); rod(0.3);
  const sheet = T.add(T.box(0.54, 0.006, 0.6), x.papyrus, 0, 0.02, 0);
  sheet.rotation.x = 0;
  for (let i = 0; i < 6; i++) T.add(T.box(0.34 - 0.08 * hash(i), 0.002, 0.018), x.ink, -0.02 + (hash(i + 5) - 0.5) * 0.04, 0.025, -0.22 + i * 0.085);
};
OBJ.favor = (THREE, M, T) => {
  // trípode de bronze com a chama sagrada
  T.add(T.lathe([[0.001, 0.52], [0.2, 0.54], [0.26, 0.62], [0.27, 0.66], [0.24, 0.66], [0.2, 0.6], [0.001, 0.58]], 32), M.bronze, 0, 0, 0);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.3; T.add(T.cyl(0.018, 0.022, 0.58, 8), M.bronzeDark, Math.cos(a) * 0.17, 0.28, Math.sin(a) * 0.17, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); }
  flame(THREE, M, T, T.root, { h: 0.42, r: 0.15, y: 0.6, seed: 3 });
};

// ---- tecnologias ----
OBJ.column = (THREE, M, T, p) => {
  // coluna com capitel (dórico, jônico ou coríntio) sobre degrau
  const order = p.order ?? 'doric';
  T.add(T.box(0.5, 0.08, 0.5), M.marbleDark, 0, 0.04, 0);
  const shaft = T.add(T.cyl(0.13, 0.155, 0.95, 20), M.marble, 0, 0.08 + 0.475, 0);
  for (let k = 0; k < 20; k++) { const a = (k / 20) * TAU; T.add(T.box(0.01, 0.93, 0.01), M.marbleDark, Math.cos(a) * 0.142, 0.555, Math.sin(a) * 0.142); }
  void shaft;
  const top = 1.03;
  if (order === 'doric') { T.add(T.cyl(0.2, 0.14, 0.07, 24), M.marble, 0, top + 0.035, 0); T.add(T.box(0.44, 0.07, 0.44), M.marble, 0, top + 0.105, 0); }
  else if (order === 'ionic') {
    T.add(T.box(0.44, 0.05, 0.3), M.marble, 0, top + 0.03, 0);
    for (const s of [-1, 1]) T.add(T.tor(0.06, 0.028, 10, 24), M.marble, s * 0.2, top - 0.02, 0.12, 0, 0, 0);
    T.add(T.box(0.4, 0.04, 0.36), M.marble, 0, top + 0.075, 0);
  } else {
    // coríntio: sino com duas coroas de folhas de acanto
    T.add(T.cyl(0.19, 0.14, 0.2, 20), M.marble, 0, top + 0.1, 0);
    for (let row = 0; row < 2; row++) for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + row * 0.4; const l = T.add(T.sph(0.06, 10, 8), M.marble, Math.cos(a) * (0.15 + row * 0.02), top + 0.04 + row * 0.08, Math.sin(a) * (0.15 + row * 0.02)); l.scale.set(0.6, 1.2, 0.5); }
    T.add(T.box(0.44, 0.06, 0.44), M.marble, 0, top + 0.23, 0);
  }
};
OBJ.scales = (THREE, M, T) => {
  // balança de bronze: coluna, travessão e dois pratos com correntes
  T.add(T.cyl(0.14, 0.18, 0.05, 24), M.bronzeDark, 0, 0.025, 0);
  T.add(T.cyl(0.02, 0.025, 0.8, 12), M.bronze, 0, 0.45, 0);
  T.add(T.sph(0.035, 12, 10), M.bronze, 0, 0.87, 0);
  const beam = T.group(0, 0.84, 0, 0, 0, 0.08);
  T.add(T.box(0.8, 0.02, 0.025), M.bronze, 0, 0, 0, 0, 0, 0, beam);
  for (const s of [-1, 1]) {
    for (const k of [-1, 1]) T.add(T.cyl(0.003, 0.003, 0.4, 4), M.bronzeDark, s * 0.39 + k * 0.06, -0.2, 0, 0, 0, k * 0.15, beam);
    T.add(T.lathe([[0.001, 0], [0.12, 0.01], [0.14, 0.045], [0.135, 0.05], [0.11, 0.02], [0.001, 0.012]], 28), M.bronze, s * 0.39, -0.42, 0, 0, 0, 0, beam);
  }
  T.add(T.cyl(0.04, 0.04, 0.03, 20), X(THREE, M).goldBright, -0.39, -0.39, 0, 0, 0, 0, beam);
};
OBJ.crossed_swords = (THREE, M, T, p) => {
  const mat = p.iron ? M.iron : M.bronzeDark;
  const g = faceCam(T.group(0, 0.35, 0));
  for (const s of [-1, 1]) { const w = sword(THREE, M, T, g, { mat, len: 0.62 }); w.position.set(s * 0.05, -0.3, 0); w.rotation.z = s * 0.62; w.position.y = -0.28; }
};
OBJ.armillary = (THREE, M, T) => {
  // esfera armilar: anéis de bronze em volta de um globo, sobre pé
  T.add(T.lathe([[0.001, 0], [0.16, 0.01], [0.12, 0.05], [0.04, 0.09], [0.03, 0.3], [0.001, 0.3]], 24), M.bronzeDark, 0, 0, 0);
  const g = T.group(0, 0.62, 0, 0.35, 0, 0.4);
  T.add(T.sph(0.1, 20, 16), X(THREE, M).peacockEye, 0, 0, 0, 0, 0, 0, g);
  T.add(T.tor(0.3, 0.012, 8, 56), M.bronze, 0, 0, 0, 0, 0, 0, g);
  T.add(T.tor(0.3, 0.012, 8, 56), M.bronze, 0, 0, 0, Math.PI / 2, 0, 0, g);
  T.add(T.tor(0.28, 0.01, 8, 56), M.gold, 0, 0, 0, Math.PI / 2, 0.45, 0, g);
  T.add(T.tor(0.26, 0.01, 8, 56), M.bronze, 0, 0, 0, 0, Math.PI / 2, 0, g);
  T.add(T.cyl(0.008, 0.008, 0.7, 6), M.bronzeDark, 0, 0, 0, 0, 0, 0, g);
};
OBJ.blocks = (THREE, M, T) => {
  // blocos de cantaria empilhados e um maço de pedreiro
  const b = (x, y, z, w, h, d, r = 0) => T.add(T.box(w, h, d), hash(Math.round(x * 100 + y * 10)) > 0.5 ? M.ashlar : M.ashlar2, x, y, z, 0, r, 0);
  b(-0.2, 0.1, 0, 0.38, 0.2, 0.3); b(0.2, 0.1, 0.02, 0.38, 0.2, 0.3, 0.05); b(0, 0.3, -0.01, 0.4, 0.2, 0.3, -0.04);
  T.add(T.box(0.12, 0.1, 0.1), M.woodDark, 0.28, 0.25, 0.22, 0, 0.3, 0); T.add(T.cyl(0.015, 0.015, 0.3, 8), M.wood, 0.2, 0.25, 0.3, Math.PI / 2, 0, 0.9);
};
OBJ.ballista = (THREE, M, T) => {
  // balista: coronha, arco de torção e o virote armado, num tripé
  const g = T.group(0, 0.4, 0, -0.25, 0.5, 0);
  T.add(T.box(0.1, 0.07, 0.9), M.wood, 0, 0, 0, 0, 0, 0, g);
  T.add(T.box(0.62, 0.12, 0.1), M.woodDark, 0, 0.02, -0.3, 0, 0, 0, g);
  for (const s of [-1, 1]) { T.add(T.cyl(0.035, 0.035, 0.16, 12), M.rope, s * 0.2, 0.02, -0.3, 0, 0, 0, g); T.add(T.box(0.34, 0.03, 0.03), M.wood, s * 0.36, 0.02, -0.2, 0, s * -0.5, 0, g); }
  T.add(T.cyl(0.008, 0.008, 0.9, 6), M.wood, 0, 0.05, -0.1, Math.PI / 2, 0, 0, g);
  T.add(T.cone(0.02, 0.08, 6), M.iron, 0, 0.05, -0.58, -Math.PI / 2, 0, 0, g);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; T.add(T.cyl(0.02, 0.02, 0.45, 8), M.woodDark, Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); }
};
OBJ.satchel = (THREE, M, T) => {
  // bolsa de couro com alça e um cantil
  const bag = T.add(T.sph(0.25, 24, 16), M.leather, 0, 0.22, 0); bag.scale.set(1.2, 0.9, 0.7);
  T.add(T.box(0.5, 0.16, 0.05), M.hide, 0, 0.34, 0.15, -0.3, 0, 0);
  T.add(T.tor(0.3, 0.02, 6, 30, Math.PI), M.leather, 0, 0.4, -0.02);
  T.add(T.cyl(0.03, 0.03, 0.05, 10), M.bronze, 0, 0.28, 0.19, Math.PI / 2, 0, 0);
  amphoraShape(T, M.terracotta, T.root, { h: 0.34, r: 0.1, x: 0.34, y: 0, z: 0.08 });
};
OBJ.wheel = (THREE, M, T) => {
  // roda de raios com aro de bronze, de frente para a câmera
  const g = faceCam(T.group(0, 0.4, 0));
  T.add(T.tor(0.36, 0.035, 10, 48), M.wood, 0, 0, 0, 0, 0, 0, g);
  T.add(T.tor(0.39, 0.012, 6, 48), M.bronzeDark, 0, 0, 0, 0, 0, 0, g);
  T.add(T.cyl(0.07, 0.07, 0.12, 20), M.woodDark, 0, 0, 0, Math.PI / 2, 0, 0, g);
  T.add(T.cyl(0.04, 0.04, 0.14, 16), M.bronze, 0, 0, 0, Math.PI / 2, 0, 0, g);
  for (let k = 0; k < 8; k++) T.add(T.cyl(0.016, 0.02, 0.32, 8), M.wood, 0, 0, 0, 0, 0, (k / 8) * TAU, g).translateY(0.19);
};
OBJ.tablet = (THREE, M, T) => {
  const x = X(THREE, M);
  // tábua de cera (díptico) aberta e o estilete
  const g = T.group(0, 0.02, 0, 0, 0.2, 0);
  for (const s of [-1, 1]) {
    T.add(T.box(0.34, 0.035, 0.46), M.wood, s * 0.18, 0, 0, 0, 0, s * -0.06, g);
    T.add(T.box(0.28, 0.01, 0.38), x.wax, s * 0.18, 0.02, 0, 0, 0, s * -0.06, g);
    for (let i = 0; i < 4; i++) T.add(T.box(0.18, 0.004, 0.012), M.linenDark, s * 0.18, 0.027, -0.12 + i * 0.08, 0, 0, s * -0.06, g);
  }
  T.add(T.cyl(0.008, 0.012, 0.42, 8), M.bronze, 0.22, 0.08, 0.1, 0.2, 0, 1.2);
};
OBJ.sheaf = (THREE, M, T) => {
  const x = X(THREE, M);
  // feixe de trigo amarrado: hastes em leque e as espigas
  const n = 15;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, rr = 0.03 + 0.035 * hash(i), lean = 0.2 + 0.15 * hash(i + 40);
    const top = [Math.cos(a) * (rr + lean * 0.55), 0.78 + 0.08 * hash(i + 3), Math.sin(a) * (rr + lean * 0.4)];
    T.add(T.tube([[Math.cos(a) * rr * 1.5, 0, Math.sin(a) * rr * 1.5], [Math.cos(a) * rr, 0.35, Math.sin(a) * rr], top], 0.007, 12, 5), x.stalk, 0, 0, 0);
    const ear = T.add(T.sph(0.028, 10, 8), x.wheat, top[0], top[1] + 0.05, top[2]); ear.scale.set(0.8, 2.6, 0.8); ear.rotation.z = -Math.cos(a) * 0.3; ear.rotation.x = Math.sin(a) * 0.3;
  }
  T.add(T.tor(0.06, 0.02, 6, 20), M.rope, 0, 0.36, 0, Math.PI / 2, 0, 0);
};
OBJ.hydria = (THREE, M, T) => {
  const x = X(THREE, M);
  // hídria inclinada derramando água num canal de pedra
  T.add(T.box(0.8, 0.08, 0.24), M.stone, 0, 0.04, 0.12);
  T.add(T.box(0.72, 0.03, 0.14), x.water, 0, 0.075, 0.12);
  const j = T.group(-0.1, 0.42, -0.05, 0, 0, -0.75);
  amphoraShape(T, M.terracotta, j, { h: 0.5, r: 0.16, y: -0.25 });
  T.add(T.tube([[0.24, 0.46, -0.05], [0.26, 0.32, 0.02], [0.2, 0.1, 0.1]], 0.025, 16, 8), x.water, 0, 0, 0);
};
OBJ.axe = (THREE, M, T, p) => {
  const head = p.iron ? M.iron : M.bronzeDark;
  // machado de lenhador cravado num toco
  T.add(T.cyl(0.24, 0.27, 0.22, 24), M.bark, 0, 0.11, 0); T.add(T.cyl(0.235, 0.235, 0.01, 24), M.limestone, 0, 0.225, 0);
  // cabo apoiado no toco, a lâmina no alto com a face para a câmera
  const g = faceCam(T.group(0.02, 0.22, 0.05));
  const h = T.group(0, 0, 0, 0, 0, -0.35, g);
  T.add(T.cyl(0.02, 0.024, 0.8, 10), M.wood, 0, 0.4, 0, 0, 0, 0, h);
  T.add(T.extrude([[0, -0.05], [0.2, -0.13], [0.23, 0], [0.2, 0.13], [0, 0.05]], 0.03, 0.006), head, 0.01, 0.7, 0, 0, 0, 0, h);
  T.add(T.box(0.06, 0.1, 0.05), head, 0, 0.7, 0, 0, 0, 0, h);
};
OBJ.saw = (THREE, M, T) => {
  // serra de moldura (lâmina de ferro esticada por corda) sobre uma tora
  T.add(T.cyl(0.12, 0.12, 0.8, 18), M.bark, 0, 0.12, 0, 0, 0, Math.PI / 2);
  const g = faceCam(T.group(0, 0.5, 0.05));
  T.add(T.box(0.7, 0.05, 0.008), M.iron, 0, -0.2, 0, 0, 0, 0, g);
  for (let i = 0; i < 14; i++) T.add(T.cone(0.012, 0.03, 3), M.iron, -0.33 + i * 0.05, -0.235, 0, Math.PI, 0, 0, g);
  for (const s of [-1, 1]) T.add(T.box(0.03, 0.46, 0.03), M.wood, s * 0.34, 0, 0, 0, 0, 0, g);
  T.add(T.box(0.66, 0.025, 0.025), M.wood, 0, 0, 0, 0, 0, 0, g);
  T.add(T.cyl(0.006, 0.006, 0.66, 4), M.rope, 0, 0.21, 0, 0, 0, Math.PI / 2, g);
};
OBJ.pickaxe = (THREE, M, T, p) => {
  // picareta sobre um bloco de minério (ouro ou pedra); `gallery`: escora de madeira atrás
  if (p.gallery) { for (const s of [-1, 1]) T.add(T.box(0.07, 0.8, 0.07), M.woodDark, s * 0.36, 0.4, -0.25); T.add(T.box(0.86, 0.08, 0.09), M.woodDark, 0, 0.82, -0.25); }
  const ore = T.add(new THREE.DodecahedronGeometry(0.2, 0), M.stone, -0.05, 0.14, 0.05); ore.scale.set(1.3, 0.8, 1);
  for (let i = 0; i < 4; i++) T.add(T.sph(0.035, 8, 6), M.gold, -0.14 + i * 0.07, 0.24 + 0.02 * hash(i), 0.12 + 0.04 * hash(i + 2));
  const g = faceCam(T.group(0.1, 0.45, 0.1));
  const h = T.group(0, 0, 0, 0, 0, -0.5, g);
  T.add(T.cyl(0.02, 0.022, 0.65, 10), M.wood, 0, 0, 0, 0, 0, 0, h);
  T.add(T.tube([[-0.28, 0.2, 0], [0, 0.33, 0], [0.28, 0.2, 0]], 0.022, 20, 8), M.iron, 0, 0, 0, 0, 0, 0, h);
};
OBJ.crucible = (THREE, M, T) => {
  const x = X(THREE, M);
  // cadinho de barro com metal derretido sobre as brasas
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; T.add(new THREE.DodecahedronGeometry(0.07, 0), i % 2 ? x.ember : M.char, Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2); }
  T.add(T.lathe([[0.001, 0.08], [0.13, 0.09], [0.2, 0.2], [0.21, 0.36], [0.18, 0.36], [0.17, 0.2], [0.001, 0.13]], 28), M.terracottaDark, 0, 0, 0);
  T.add(T.cyl(0.17, 0.17, 0.01, 24), x.ichor, 0, 0.33, 0);
  flame(THREE, M, T, T.root, { h: 0.2, r: 0.12, y: 0.03, z: 0.18, seed: 7 });
};
OBJ.coins = (THREE, M, T) => {
  const x = X(THREE, M);
  // moedas cunhadas (dracma com a coruja em relevo) em pilhas
  const coin = (px, py, pz, rx = 0) => { T.add(T.cyl(0.1, 0.1, 0.022, 28), x.silver, px, py, pz, rx, 0, 0); };
  for (let i = 0; i < 5; i++) coin(-0.13, 0.011 + i * 0.023, -0.05);
  for (let i = 0; i < 3; i++) coin(0.12, 0.011 + i * 0.023, -0.08);
  const g = faceCam(T.group(0.02, 0.2, 0.18));
  T.add(T.cyl(0.14, 0.14, 0.025, 32), x.silver, 0, 0, 0, Math.PI / 2, 0, 0, g);
  // coruja em relevo
  const o = T.add(T.sph(0.05, 14, 10), M.bronzeDark, 0, -0.015, 0.02, 0, 0, 0, g); o.scale.set(0.8, 1, 0.4);
  for (const s of [-1, 1]) T.add(T.sph(0.018, 10, 8), M.bronzeDark, s * 0.022, 0.035, 0.03, 0, 0, 0, g);
};
OBJ.tripod = (THREE, M, T, p) => {
  const x = X(THREE, M);
  // trípode de Delfos com a bacia fumegante (e ramo de louro em `laurel`)
  T.add(T.lathe([[0.001, 0.62], [0.2, 0.64], [0.25, 0.74], [0.24, 0.76], [0.19, 0.7], [0.001, 0.68]], 32), M.bronze, 0, 0, 0);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.5; T.add(T.cyl(0.016, 0.02, 0.7, 8), M.bronzeDark, Math.cos(a) * 0.19, 0.33, Math.sin(a) * 0.19, Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22); T.add(T.tor(0.05, 0.01, 6, 16), M.bronze, Math.cos(a) * 0.24, 0.82, Math.sin(a) * 0.24, 0, -a, 0); }
  for (let i = 0; i < 4; i++) { const s = T.add(T.sph(0.09 + 0.03 * i, 14, 10), p.glow ? x.glowPurple : x.cloudLight, 0.03 * Math.sin(i * 2), 0.85 + i * 0.12, 0); s.material = s.material.clone(); s.material.transparent = true; s.material.opacity = 0.6 - i * 0.12; s.userData.noShadow = true; }
  if (p.laurel) for (let i = 0; i < 7; i++) { const l = T.add(T.sph(0.035, 8, 6), M.olive, -0.28 + i * 0.03, 0.12 + i * 0.06, 0.2); l.scale.set(0.5, 1.4, 0.3); l.rotation.z = 0.6; }
};
OBJ.altar = (THREE, M, T) => {
  // altar de mármore com a chama e guirlanda
  T.add(T.box(0.56, 0.08, 0.44), M.marbleDark, 0, 0.04, 0);
  T.add(T.box(0.46, 0.4, 0.34), M.marble, 0, 0.28, 0);
  T.add(T.box(0.56, 0.06, 0.44), M.marbleDark, 0, 0.5, 0);
  for (let i = 0; i < 9; i++) { const l = T.add(T.sph(0.03, 8, 6), M.olive, -0.2 + i * 0.05, 0.36 - Math.sin((i / 8) * Math.PI) * 0.08, 0.18); l.scale.set(1.2, 0.7, 0.5); }
  flame(THREE, M, T, T.root, { h: 0.4, r: 0.14, y: 0.53, seed: 11 });
};
OBJ.vial = (THREE, M, T) => {
  const x = X(THREE, M);
  // frasco de vidro com o icor dourado brilhando (sangue dos deuses)
  T.add(T.lathe([[0.001, 0], [0.16, 0.01], [0.2, 0.12], [0.18, 0.28], [0.07, 0.38], [0.055, 0.5], [0.07, 0.52], [0.001, 0.52]], 32), x.glass, 0, 0, 0);
  T.add(T.lathe([[0.001, 0.01], [0.15, 0.02], [0.185, 0.12], [0.17, 0.24], [0.001, 0.24]], 28), x.ichor, 0, 0, 0);
  T.add(T.cyl(0.05, 0.045, 0.08, 14), M.cork ?? M.wood, 0, 0.55, 0);
  for (let i = 0; i < 5; i++) { const s = T.add(T.sph(0.015, 8, 6), x.glowGold, (hash(i) - 0.5) * 0.5, 0.2 + 0.4 * hash(i + 7), 0.12); s.userData.noShadow = true; }
};
OBJ.divine_sword = (THREE, M, T) => {
  const x = X(THREE, M);
  // espada dos deuses: lâmina de ouro com o fio brilhando e raios de luz
  const g = faceCam(T.group(0, 0.1, 0));
  const w = sword(THREE, M, T, g, { mat: x.goldBright, len: 0.78, guard: M.gold, hilt: M.leather }); w.rotation.z = 0.35;
  for (let k = 0; k < 8; k++) { const r = T.add(T.box(0.012, 0.22, 0.002), x.glowGold, 0, 0, 0.01, 0, 0, (k / 8) * TAU, g); r.translateY(0.5); r.position.x += 0; r.userData.noShadow = true; r.userData.noFrame = true; r.position.set(Math.sin((k / 8) * TAU) * -0.22 - 0.12, 0.45 + Math.cos((k / 8) * TAU) * 0.22, 0.01); }
};
OBJ.phalanx = (THREE, M, T) => {
  // três hoplons sobrepostos (a parede de escudos) e lanças acima
  const g = faceCam(T.group(0, 0.3, 0));
  for (const [s, dz] of [[-1, 0], [1, 0.01], [0, 0.03]]) { const h = hoplon(THREE, M, T, g, { r: 0.24, emblem: M.team }); h.position.set(s * 0.26, s === 0 ? -0.06 : 0.02, dz); }
  for (const s of [-0.3, 0, 0.3]) { T.add(T.cyl(0.008, 0.008, 0.9, 6), M.wood, s, 0.35, -0.02, 0, 0, -0.12, g); T.add(T.cone(0.02, 0.08, 6), M.bronze, s - 0.055, 0.83, -0.02, 0, 0, -0.12, g); }
};
OBJ.cuirass = (THREE, M, T) => {
  // couraça anatômica de frente: a placa em V (ombros largos, cintura), peitorais e abdome em relevo, as cavas dos braços
  // e do pescoço, e os ptéruges de couro embaixo
  const g = faceCam(T.group(0, 0.42, 0));
  const out = [[-0.2, -0.3], [-0.25, -0.24], [-0.24, 0.1], [-0.22, 0.2], [-0.27, 0.26], [-0.3, 0.34], [-0.2, 0.4], [-0.1, 0.37], [0, 0.34], [0.1, 0.37], [0.2, 0.4], [0.3, 0.34], [0.27, 0.26], [0.22, 0.2], [0.24, 0.1], [0.25, -0.24], [0.2, -0.3], [0, -0.33]];
  T.add(T.extrude(out, 0.1, 0.035), M.bronzeDark, 0, 0, 0, 0, 0, 0, g);
  for (const s of [-1, 1]) { const pec = T.add(T.sph(0.11, 18, 12), M.bronze, s * 0.1, 0.18, 0.06, 0, 0, 0, g); pec.scale.set(1, 0.62, 0.5); }
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const ab = T.add(T.sph(0.055, 12, 8), M.bronze, s * 0.06, -0.02 - i * 0.085, 0.07, 0, 0, 0, g); ab.scale.set(1, 0.6, 0.45); }
  T.add(T.tor(0.1, 0.014, 6, 24, Math.PI), M.bronzeDark, 0, 0.36, 0.05, 0, 0, Math.PI, g);
  for (let i = 0; i < 8; i++) T.add(T.box(0.055, 0.16, 0.02), M.leather, -0.2 + i * 0.057, -0.4, 0.04, 0, 0, 0, g);
};
OBJ.iron_sword = (THREE, M, T) => {
  // espada de ferro e ponta de lança sobre um escudo
  const g = faceCam(T.group(0, 0.35, 0));
  const w = sword(THREE, M, T, g, { mat: M.iron, len: 0.7 }); w.rotation.z = -0.5; w.position.set(0.08, -0.28, 0.02);
  const s = T.group(-0.1, -0.3, 0, 0, 0, 0.5, g);
  T.add(T.cyl(0.012, 0.012, 0.7, 6), M.wood, 0, 0.35, 0, 0, 0, 0, s); T.add(T.extrude([[0, 0], [0.035, 0.05], [0, 0.2], [-0.035, 0.05]], 0.01), M.iron, 0, 0.68, 0, 0, 0, 0, s);
};
OBJ.bow = (THREE, M, T, p) => {
  const x = X(THREE, M);
  const mat = p.mat === 'gold' ? x.goldBright : p.mat === 'silver' ? x.silver : M.wood;
  const g = faceCam(T.group(0, 0.45, 0));
  const b = bowModel(THREE, M, T, g, { mat, h: 0.95 }); b.rotation.z = -0.5;
  const a = arrow(THREE, M, T, g, { len: 0.8, head: p.mat === 'gold' ? M.gold : M.bronze }); a.rotation.z = -0.5 - Math.PI / 2 + 0.2; a.position.set(-0.3, -0.18, 0.02);
  if (p.moon) { const moon = T.add(T.extrude(crescent(0.26, 0.2, 0.07), 0.03), x.silver, 0.2, 0.2, -0.05, 0, 0, 0.3, g); void moon; }
};
function crescent(R, r, off) {
  const pts = [];
  for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + (i / 24) * Math.PI; pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
  for (let i = 24; i >= 0; i--) { const a = -Math.PI / 2 + (i / 24) * Math.PI; pts.push([Math.cos(a) * r + off, Math.sin(a) * r * 0.92]); }
  return pts.map(([x, y]) => [x - R * 0.4, y]);
}
OBJ.compass = (THREE, M, T) => {
  const x = X(THREE, M);
  // compasso de bronze e esquadro sobre a pedra do petróbolo
  const stone = T.add(T.sph(0.16, 18, 14), M.stone, -0.18, 0.16, 0.05); void stone;
  const g = faceCam(T.group(0.1, 0.4, 0.05));
  for (const s of [-1, 1]) T.add(T.cyl(0.012, 0.004, 0.6, 8), M.bronze, s * 0.1, -0.05, 0, 0, 0, s * 0.33, g);
  T.add(T.sph(0.03, 10, 8), x.bronzeBright, 0, 0.24, 0, 0, 0, 0, g);
  T.add(T.extrude([[-0.35, -0.35], [0.1, -0.35], [0.1, -0.31], [-0.31, -0.31], [-0.31, 0.1], [-0.35, 0.1]], 0.012), M.wood, 0, 0, -0.03, 0, 0, 0, g);
};
OBJ.aegis = (THREE, M, T) => {
  const x = X(THREE, M);
  // égide: escudo de bronze com o gorgoneion (rosto com serpentes) no centro
  const g = faceCam(T.group(0, 0.4, 0));
  hoplon(THREE, M, T, g, { r: 0.42 });
  const face = T.add(T.sph(0.12, 20, 16), M.gold, 0, 0, 0.07, 0, 0, 0, g); face.scale.set(1, 1.05, 0.5);
  for (const s of [-1, 1]) T.add(T.sph(0.02, 8, 6), x.pupil, s * 0.045, 0.03, 0.12, 0, 0, 0, g);
  T.add(T.box(0.07, 0.015, 0.01), x.pupil, 0, -0.06, 0.125, 0, 0, 0, g);
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; T.add(T.tube([[Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.07], [Math.cos(a + 0.2) * 0.19, Math.sin(a + 0.2) * 0.19, 0.08], [Math.cos(a - 0.1) * 0.24, Math.sin(a - 0.1) * 0.24, 0.07]], 0.014, 10, 6), M.bronzeDark, 0, 0, 0, 0, 0, 0, g); }
};
OBJ.owl = (THREE, M, T) => {
  const x = X(THREE, M);
  // coruja de Atena num ramo de oliveira
  T.add(T.cyl(0.02, 0.025, 0.7, 8), M.bark, 0, 0.08, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 6; i++) { const l = T.add(T.sph(0.04, 8, 6), M.olive, -0.3 + i * 0.12, 0.1 + (i % 2) * 0.03, 0.03); l.scale.set(1.6, 0.4, 0.6); }
  const body = T.add(T.sph(0.2, 22, 16), M.fur, 0, 0.3, 0); body.scale.set(0.95, 1.2, 0.85);
  const belly = T.add(T.sph(0.16, 18, 14), M.linenDark, 0, 0.27, 0.06); belly.scale.set(0.85, 1.1, 0.7);
  const head = T.add(T.sph(0.16, 22, 16), M.fur, 0, 0.58, 0.02); head.scale.set(1.1, 0.9, 0.9);
  for (const s of [-1, 1]) {
    T.add(T.cyl(0.07, 0.07, 0.02, 20), M.linen, s * 0.07, 0.6, 0.14, Math.PI / 2, 0, 0);
    T.add(T.sph(0.04, 14, 10), M.eye ?? x.glowGold, s * 0.07, 0.6, 0.15);
    T.add(T.sph(0.018, 10, 8), x.pupil, s * 0.07, 0.6, 0.185);
    T.add(T.cone(0.04, 0.1, 8), M.fur, s * 0.12, 0.72, 0.02, 0, 0, -s * 0.4);
    const wing = T.add(T.sph(0.12, 14, 10), M.furDark, s * 0.17, 0.3, -0.02); wing.scale.set(0.35, 1.1, 0.8);
  }
  T.add(T.cone(0.022, 0.06, 6), M.horn, 0, 0.55, 0.17, Math.PI / 2 + 0.4, 0, 0);
};
OBJ.sandal = (THREE, M, T) => {
  // sandália alada de Hermes
  const sole = T.add(T.box(0.2, 0.03, 0.5), M.leather, 0, 0.03, 0); sole.rotation.y = 0.5;
  for (let i = 0; i < 4; i++) T.add(T.tor(0.09, 0.012, 6, 16, Math.PI), M.leather, Math.sin(0.5) * (-0.15 + i * 0.1), 0.05, Math.cos(0.5) * (-0.15 + i * 0.1), 0, 0.5, 0);
  for (const s of [-1, 1]) {
    const w = T.group(0, 0.2, 0.1, 0, 0.5 + s * 1.2, 0.3);
    for (let i = 0; i < 5; i++) { const f = T.add(T.box(0.05, 0.012, 0.22 - i * 0.03), M.feather, 0, i * 0.04, -0.1 - i * 0.01, 0.5 + i * 0.12, 0, 0, w); f.scale.z = 1; }
  }
};
OBJ.caduceus = (THREE, M, T) => {
  // caduceu: bastão de ouro, duas serpentes em hélice e asas no alto
  const x = X(THREE, M);
  T.add(T.cyl(0.018, 0.02, 1.0, 10), x.goldBright, 0, 0.5, 0);
  T.add(T.sph(0.04, 12, 10), x.goldBright, 0, 1.02, 0);
  for (const ph of [0, Math.PI]) {
    const pts = [];
    for (let i = 0; i <= 30; i++) { const t = i / 30, a = ph + t * TAU * 2.2; pts.push([Math.cos(a) * 0.07 * (1 - 0.2 * t), 0.12 + t * 0.72, Math.sin(a) * 0.07 * (1 - 0.2 * t)]); }
    T.add(T.tube(pts, 0.018, 80, 8), M.bronze, 0, 0, 0);
    const last = pts[pts.length - 1];
    T.add(T.sph(0.03, 10, 8), M.bronze, last[0] * 1.6, last[1] + 0.02, last[2] * 1.6 + 0.02);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) T.add(T.box(0.16 - i * 0.025, 0.012, 0.04), M.feather, s * (0.1 + i * 0.03), 0.93 + i * 0.035, 0, 0, 0, s * (0.35 + i * 0.12));
};
OBJ.helm = (THREE, M, T, p) => {
  // elmo coríntio com crina (vermelha para Ares, `crest`), de três quartos
  const mat = p.metal === 'dark' ? M.bronzeBlack : M.bronze;
  const g = T.group(0, 0, 0, 0, 0.5, 0);
  const shell = T.add(T.sph(0.2, 28, 20, 0, TAU, 0, Math.PI * 0.62), mat, 0, 0.3, 0, 0, 0, 0, g); shell.scale.set(0.9, 1.2, 1.05);
  const cheek = T.add(T.cyl(0.19, 0.16, 0.2, 28, 1, true, -1.9, 3.8), mat, 0, 0.17, 0, 0, Math.PI, 0, g); cheek.material = mat;
  T.add(T.box(0.03, 0.12, 0.06), mat, 0, 0.2, 0.2, 0, 0, 0, g);
  T.add(T.box(0.12, 0.022, 0.03), X(THREE, M).pupil, -0.07, 0.27, 0.19, 0, 0.35, 0, g); T.add(T.box(0.12, 0.022, 0.03), X(THREE, M).pupil, 0.07, 0.27, 0.19, 0, -0.35, 0, g);
  const crestMat = p.crest === 'team' ? M.team : p.crest === 'dark' ? M.crestDark : M.crest;
  const c = T.group(0, 0.53, 0, 0, 0, 0, g);
  T.add(T.box(0.03, 0.06, 0.3), mat, 0, -0.02, 0, 0, 0, 0, c);
  const hair = T.add(T.lathe([[0.001, -0.02], [0.05, 0], [0.045, 0.14], [0.001, 0.17]], 12), crestMat, 0, 0, 0, 0, 0, 0, c); hair.scale.set(0.5, 1, 3);
  if (p.flame) flame(THREE, M, T, g, { h: 0.35, r: 0.12, y: 0.52, z: -0.12, seed: 21 });
};
OBJ.drum = (THREE, M, T) => {
  const x = X(THREE, M);
  // tímpano de guerra: tambor de moldura com pele esticada, cordas e baquetas
  const g = T.group(0, 0.3, 0, 0.95, 0.2, 0);
  T.add(T.cyl(0.3, 0.3, 0.2, 32), M.wood, 0, 0, 0, 0, 0, 0, g);
  T.add(T.cyl(0.29, 0.29, 0.005, 32), x.hideTop, 0, 0.103, 0, 0, 0, 0, g);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; T.add(T.cyl(0.006, 0.006, 0.22, 4), M.rope, Math.cos(a) * 0.305, 0, Math.sin(a) * 0.305, 0, 0, 0.3, g); }
  T.add(T.tor(0.3, 0.015, 6, 40), M.team, 0, 0.1, 0, Math.PI / 2, 0, 0, g);
  for (const s of [-1, 1]) T.add(T.cyl(0.012, 0.016, 0.45, 8), M.woodDark, s * 0.12, 0.62, 0.1, 0.3, 0, s * 0.5);
};
OBJ.grapes = (THREE, M, T) => {
  const x = X(THREE, M);
  // cacho de uvas com folha e gavinha
  const rows = [5, 5, 4, 4, 3, 2, 1];
  let k = 0;
  rows.forEach((n, j) => { for (let i = 0; i < n; i++) { const a = (i / n) * TAU + j; T.add(T.sph(0.055, 14, 10), x.grape, Math.cos(a) * 0.022 * n, 0.62 - j * 0.075, Math.sin(a) * 0.022 * n + 0.03); k++; } });
  T.add(T.cyl(0.012, 0.012, 0.15, 6), x.vine, 0, 0.72, 0, 0, 0, 0.3);
  const leaf = T.add(T.extrude([[0, 0], [0.12, 0.08], [0.2, 0.2], [0.1, 0.18], [0.08, 0.3], [0, 0.22], [-0.08, 0.3], [-0.1, 0.18], [-0.2, 0.2], [-0.12, 0.08]], 0.008), x.vine, 0.12, 0.72, -0.02, -0.6, 0, -0.7);
  void leaf; void k;
};
OBJ.kylix = (THREE, M, T) => {
  const x = X(THREE, M);
  // taça (kylix) de figuras negras com vinho
  T.add(T.lathe([[0.001, 0], [0.12, 0.005], [0.1, 0.03], [0.03, 0.06], [0.025, 0.14], [0.08, 0.17], [0.3, 0.24], [0.32, 0.26], [0.3, 0.26], [0.08, 0.2], [0.001, 0.19]], 36), M.terracotta, 0, 0, 0);
  T.add(T.cyl(0.285, 0.285, 0.005, 32), x.wine, 0, 0.245, 0);
  T.add(T.tor(0.29, 0.012, 6, 40), M.char, 0, 0.225, 0, Math.PI / 2, 0, 0);
  for (const s of [-1, 1]) T.add(T.tor(0.06, 0.012, 6, 16, Math.PI), M.terracotta, s * 0.33, 0.23, 0, 0, 0, s * -Math.PI / 2);
};
OBJ.hand_mirror = (THREE, M, T) => {
  const x = X(THREE, M);
  // espelho de mão de bronze polido (Afrodite), com fita rosa e rosa
  const g = faceCam(T.group(0, 0.45, 0, 0, 0, 0));
  g.rotation.z = -0.35;
  T.add(T.cyl(0.24, 0.24, 0.02, 40), M.mirror, 0, 0.1, 0, Math.PI / 2, 0, 0, g);
  T.add(T.tor(0.245, 0.02, 8, 48), M.gold, 0, 0.1, 0, 0, 0, 0, g);
  T.add(T.cyl(0.025, 0.03, 0.34, 10), M.gold, 0, -0.3, 0, 0, 0, 0, g);
  T.add(T.tube([[0, -0.15, 0.03], [0.12, -0.25, 0.05], [0.05, -0.4, 0.04]], 0.012, 12, 6), x.pink, 0, 0, 0, 0, 0, 0, g);
  const rose = T.add(T.sph(0.06, 12, 10), x.rose, -0.18, -0.2, 0.06, 0, 0, 0, g); rose.scale.set(1, 0.8, 1);
};
OBJ.ambrosia = (THREE, M, T) => {
  const x = X(THREE, M);
  // ânfora de ouro com a ambrosia brilhando na boca
  amphoraShape(T, x.goldBright, T.root, { h: 0.8, r: 0.22 });
  for (const s of [-1, 1]) T.add(T.tor(0.08, 0.018, 6, 16, Math.PI * 1.2), M.gold, s * 0.12, 0.66, 0, 0, 0, s * 1.2);
  T.add(T.cyl(0.06, 0.06, 0.01, 16), x.glowGold, 0, 0.8, 0);
  for (let i = 0; i < 6; i++) { const s = T.add(T.sph(0.018, 8, 6), x.glowGold, (hash(i) - 0.5) * 0.3, 0.85 + 0.25 * hash(i + 3), (hash(i + 5) - 0.5) * 0.2); s.userData.noShadow = true; }
};
OBJ.diadem = (THREE, M, T) => {
  const x = X(THREE, M);
  // diadema de Hera (pólos alto de ouro) e pena de pavão
  const g = T.group(0, 0, 0, 0.3, 0, 0);
  T.add(T.cyl(0.2, 0.22, 0.2, 36, 1, true), x.goldBright, 0, 0.1, 0, 0, 0, 0, g);
  for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; T.add(T.sph(0.022, 10, 8), k % 2 ? x.peacockEye : M.berry, Math.cos(a) * 0.215, 0.1, Math.sin(a) * 0.215, 0, 0, 0, g); }
  T.add(T.tor(0.21, 0.012, 6, 40), M.gold, 0, 0.2, 0, Math.PI / 2, 0, 0, g);
  const f = T.group(0.22, 0.05, -0.05, 0, 0, -0.5);
  T.add(T.cyl(0.006, 0.006, 0.7, 4), M.linen, 0, 0.35, 0, 0, 0, 0, f);
  const vane = T.add(T.sph(0.1, 16, 12), x.peacock, 0, 0.6, 0, 0, 0, 0, f); vane.scale.set(0.9, 1.5, 0.15);
  const eye1 = T.add(T.sph(0.05, 14, 10), M.gold, 0, 0.66, 0.012, 0, 0, 0, f); eye1.scale.set(1, 1.2, 0.2);
  const eye2 = T.add(T.sph(0.03, 12, 8), x.peacockEye, 0, 0.66, 0.02, 0, 0, 0, f); eye2.scale.set(1, 1.2, 0.2);
};
OBJ.crown = (THREE, M, T) => {
  const x = X(THREE, M);
  // coroa radiada de ouro com gemas
  T.add(T.cyl(0.24, 0.24, 0.1, 40, 1, true), x.goldBright, 0, 0.05, 0);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; T.add(T.cone(0.035, 0.2, 4), x.goldBright, Math.cos(a) * 0.24, 0.2, Math.sin(a) * 0.24); if (k % 3 === 0) T.add(T.sph(0.025, 10, 8), M.berry, Math.cos(a) * 0.25, 0.05, Math.sin(a) * 0.25); }
  T.add(T.tor(0.24, 0.014, 6, 40), M.gold, 0, 0.1, 0, Math.PI / 2, 0, 0);
};
OBJ.anvil = (THREE, M, T) => {
  const x = X(THREE, M);
  // bigorna, martelo e o lingote em brasa (a forja divina)
  T.add(T.cyl(0.14, 0.18, 0.2, 16), M.woodDark, 0, 0.1, 0);
  T.add(T.box(0.22, 0.1, 0.18), M.iron, 0, 0.25, 0);
  T.add(T.box(0.48, 0.08, 0.22), M.iron, 0, 0.34, 0);
  T.add(T.cone(0.07, 0.2, 12), M.iron, -0.33, 0.34, 0, 0, 0, Math.PI / 2);
  T.add(T.box(0.22, 0.04, 0.08), x.ember, 0.04, 0.4, 0.02);
  const h = T.group(0.15, 0.55, 0.05, 0, 0, 0.5);
  T.add(T.cyl(0.018, 0.02, 0.5, 8), M.wood, 0, 0.15, 0, 0, 0, 0, h);
  T.add(T.box(0.2, 0.08, 0.08), M.bronze, 0, 0.4, 0, 0, 0, 0, h);
  for (let i = 0; i < 8; i++) { const s = T.add(T.sph(0.012, 6, 4), x.fireCore, 0.05 + (hash(i) - 0.5) * 0.4, 0.45 + 0.25 * hash(i + 1), 0.05 + (hash(i + 2) - 0.5) * 0.2); s.userData.noShadow = true; }
};
OBJ.antlers = (THREE, M, T) => {
  // troféu de caça: galhada de cervo sobre placa, com lança de caça atravessada
  const g = faceCam(T.group(0, 0.35, 0));
  const plaque = T.add(T.extrude([[-0.16, -0.22], [0.16, -0.22], [0.2, 0], [0.12, 0.16], [-0.12, 0.16], [-0.2, 0]], 0.04), M.wood, 0, 0, -0.03, 0, 0, 0, g); void plaque;
  for (const s of [-1, 1]) {
    T.add(T.tube([[s * 0.05, 0.1, 0], [s * 0.18, 0.28, 0.02], [s * 0.26, 0.48, 0.03], [s * 0.24, 0.62, 0.02]], 0.022, 16, 6), M.horn, 0, 0, 0, 0, 0, 0, g);
    T.add(T.tube([[s * 0.16, 0.26, 0.02], [s * 0.08, 0.4, 0.04]], 0.015, 6, 5), M.horn, 0, 0, 0, 0, 0, 0, g);
    T.add(T.tube([[s * 0.24, 0.46, 0.03], [s * 0.36, 0.56, 0.04]], 0.014, 6, 5), M.horn, 0, 0, 0, 0, 0, 0, g);
    T.add(T.tube([[s * 0.25, 0.56, 0.02], [s * 0.16, 0.66, 0.03]], 0.012, 6, 5), M.horn, 0, 0, 0, 0, 0, 0, g);
  }
  T.add(T.cyl(0.01, 0.01, 0.9, 6), M.wood, 0, -0.05, 0.05, 0, 0, 1.2, g);
  T.add(T.cone(0.025, 0.1, 6), M.bronze, -0.44, 0.12, 0.05, 0, 0, 1.2, g);
};

// ---- Idades ----
OBJ.amphora = (THREE, M, T) => {
  // ânfora de figuras negras (Idade Arcaica)
  amphoraShape(T, M.terracotta, T.root, { h: 0.9, r: 0.24 });
  for (const s of [-1, 1]) T.add(T.tor(0.08, 0.02, 6, 16, Math.PI * 1.1), M.terracotta, s * 0.15, 0.72, 0, 0, 0, s * 1.3);
  T.add(T.cyl(0.245, 0.235, 0.14, 32, 1, true), M.char, 0, 0.4, 0);
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; T.add(T.box(0.035, 0.08, 0.01), M.terracotta, Math.cos(a) * 0.247, 0.4, Math.sin(a) * 0.247, 0, -a + Math.PI / 2, 0); }
};
OBJ.trident = (THREE, M, T) => {
  const x = X(THREE, M);
  // tridente de Poseidon (Idade Mítica), de frente, com respingos
  const g = faceCam(T.group(0, 0.05, 0));
  T.add(T.cyl(0.018, 0.02, 0.9, 10), x.goldBright, 0, 0.45, 0, 0, 0, 0, g);
  T.add(T.tube([[-0.16, 1.05, 0], [-0.16, 0.9, 0], [0, 0.86, 0], [0.16, 0.9, 0], [0.16, 1.05, 0]], 0.02, 24, 8), x.goldBright, 0, 0, 0, 0, 0, 0, g);
  T.add(T.cyl(0.02, 0.02, 0.26, 8), x.goldBright, 0, 0.99, 0, 0, 0, 0, g);
  for (const px of [-0.16, 0, 0.16]) T.add(T.cone(0.04, 0.12, 8), x.goldBright, px, px === 0 ? 1.18 : 1.1, 0, 0, 0, 0, g);
  for (let i = 0; i < 7; i++) { const s = T.add(T.sph(0.025 + 0.015 * hash(i), 8, 6), x.water, (hash(i) - 0.5) * 0.5, 0.1 + 0.3 * hash(i + 4), 0.05, 0, 0, 0, g); s.userData.noShadow = true; }
};
OBJ.volcano = (THREE, M, T) => {
  const x = X(THREE, M);
  // monte em erupção (Idade dos Titãs)
  T.add(T.lathe([[0.001, 0], [0.55, 0], [0.45, 0.12], [0.3, 0.38], [0.16, 0.56], [0.12, 0.56], [0.1, 0.5], [0.001, 0.5]], 36), M.stoneDark, 0, 0, 0);
  T.add(T.cyl(0.11, 0.11, 0.02, 20), x.ember, 0, 0.54, 0);
  for (let i = 0; i < 4; i++) T.add(T.tube([[Math.cos(i * 1.6) * 0.12, 0.54, Math.sin(i * 1.6) * 0.12 + 0.02], [Math.cos(i * 1.6) * 0.25, 0.35, Math.sin(i * 1.6) * 0.25 + 0.06], [Math.cos(i * 1.6) * 0.38, 0.12, Math.sin(i * 1.6) * 0.38 + 0.1]], 0.02, 12, 6), x.ember, 0, 0, 0);
  flame(THREE, M, T, T.root, { h: 0.35, r: 0.13, y: 0.54, seed: 31 });
  for (let i = 0; i < 4; i++) { const c = T.add(T.sph(0.1 + 0.04 * i, 14, 10), x.cloud, 0.05 * i, 0.9 + i * 0.1, -0.05); c.userData.noShadow = true; }
};

// ---- habilidades ----
OBJ.salpinx = (THREE, M, T) => {
  // salpinx (trombeta de guerra de bronze) com ondas de som
  const g = faceCam(T.group(0, 0.35, 0, 0, 0, 0));
  const tr = T.group(0, 0, 0, 0, 0, -0.35, g);
  T.add(T.cyl(0.015, 0.018, 0.8, 10), M.bronze, 0, 0, 0, 0, 0, Math.PI / 2, tr);
  T.add(T.lathe([[0.02, 0], [0.04, 0.08], [0.1, 0.16], [0.14, 0.18]], 24), M.bronze, 0.4, 0, 0, 0, 0, -Math.PI / 2, tr);
  T.add(T.cyl(0.025, 0.02, 0.05, 10), M.bronzeDark, -0.42, 0, 0, 0, 0, Math.PI / 2, tr);
  for (let i = 0; i < 3; i++) { const w = T.add(T.tor(0.12 + i * 0.08, 0.008, 4, 24, 1.3), X(THREE, M).glowWhite, 0.6, 0.2, 0.02, 0, 0, -0.65 - 0.35, g); w.userData.noShadow = true; w.position.set(0.45, 0.2, 0.02); w.scale.setScalar(1); }
};
OBJ.wooden_horse = (THREE, M, T) => {
  // o cavalo de madeira de Troia sobre rodas (a astúcia de Odisseu)
  const g = T.group(0, 0, 0, 0, 0.6, 0);
  T.add(T.box(0.8, 0.05, 0.36), M.woodDark, 0, 0.1, 0, 0, 0, 0, g);
  for (const sx of [-0.3, 0.3]) for (const sz of [-0.19, 0.19]) T.add(T.cyl(0.08, 0.08, 0.04, 16), M.wood, sx, 0.08, sz, Math.PI / 2, 0, 0, g);
  for (const sx of [-0.25, 0.25]) for (const sz of [-0.1, 0.1]) T.add(T.box(0.06, 0.34, 0.06), M.wood, sx, 0.29, sz, 0, 0, 0, g);
  T.add(T.box(0.7, 0.26, 0.3), M.wood, 0, 0.56, 0, 0, 0, 0, g);
  for (let i = 0; i < 5; i++) T.add(T.box(0.72, 0.01, 0.31), M.woodDark, 0, 0.45 + i * 0.05, 0, 0, 0, 0, g);
  T.add(T.box(0.14, 0.4, 0.14), M.wood, 0.33, 0.8, 0, 0, 0, -0.35, g);
  T.add(T.box(0.3, 0.13, 0.14), M.wood, 0.48, 1.0, 0, 0, 0, 0.2, g);
  T.add(T.box(0.03, 0.2, 0.16), M.woodDark, 0.3, 0.92, 0, 0, 0, -0.35, g);
  T.add(T.box(0.2, 0.05, 0.04), M.rope, -0.4, 0.5, 0, 0, 0, 0.6, g);
};
OBJ.club_impact = (THREE, M, T) => {
  const x = X(THREE, M);
  // a clava de Héracles golpeando o chão: rachaduras, pedras voando e poeira
  T.add(T.cyl(0.5, 0.5, 0.06, 32), x.earthDark, 0, 0.03, 0);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; T.add(T.box(0.3, 0.02, 0.02), x.ember, Math.cos(a) * 0.18, 0.065, Math.sin(a) * 0.18, 0, -a, 0); }
  for (let i = 0; i < 6; i++) { const r = T.add(new THREE.DodecahedronGeometry(0.04 + 0.02 * hash(i), 0), M.stone, (hash(i) - 0.5) * 0.7, 0.15 + 0.3 * hash(i + 1), (hash(i + 2) - 0.5) * 0.4); r.rotation.set(hash(i) * 3, hash(i + 3) * 3, 0); }
  const g = T.group(0.05, 0.1, 0, 0, 0.3, 0.9);
  T.add(T.lathe([[0.03, 0], [0.04, 0.3], [0.08, 0.6], [0.1, 0.72], [0.06, 0.8], [0.001, 0.8]], 16), M.woodDark, 0, 0, 0, 0, 0, 0, g);
  for (let i = 0; i < 6; i++) T.add(T.sph(0.025, 8, 6), M.bark, Math.cos(i * 2) * 0.08, 0.5 + i * 0.04, Math.sin(i * 2) * 0.08, 0, 0, 0, g);
};
OBJ.flaming_spear = (THREE, M, T) => {
  // lança de Aquiles envolta em chamas
  const g = faceCam(T.group(0, 0.05, 0, 0, 0, 0));
  const sp = T.group(0, 0, 0, 0, 0, -0.55, g);
  T.add(T.cyl(0.014, 0.014, 1.1, 8), M.wood, 0, 0.55, 0, 0, 0, 0, sp);
  T.add(T.extrude([[0, 0], [0.045, 0.07], [0, 0.26], [-0.045, 0.07]], 0.012), M.gold, 0, 1.08, 0, 0, 0, 0, sp);
  flame(THREE, M, T, sp, { h: 0.45, r: 0.12, y: 0.95, seed: 41 });
};
OBJ.mirror_shield = (THREE, M, T) => {
  const x = X(THREE, M);
  // escudo espelhado de Perseu refletindo o clarão (a harpe atrás)
  const g = faceCam(T.group(0, 0.4, 0));
  hoplon(THREE, M, T, g, { r: 0.42, face: M.mirror, rim: M.gold });
  const glint = T.add(T.extrude([[0, 0.12], [0.02, 0.02], [0.12, 0], [0.02, -0.02], [0, -0.12], [-0.02, -0.02], [-0.12, 0], [-0.02, 0.02]], 0.004), x.glowWhite, -0.12, 0.12, 0.08, 0, 0, 0, g); glint.userData.noShadow = true;
  const hp = T.group(0.32, -0.1, -0.08, 0, 0, -0.5, g);
  T.add(T.cyl(0.015, 0.015, 0.16, 8), M.leather, 0, -0.1, 0, 0, 0, 0, hp);
  T.add(T.box(0.05, 0.5, 0.01), M.iron, 0, 0.25, 0, 0, 0, 0, hp);
  T.add(T.tor(0.1, 0.02, 6, 16, Math.PI), M.iron, -0.08, 0.35, 0, 0, 0, Math.PI / 2, hp);
};

// ---- poderes ----
OBJ.bolt = (THREE, M, T) => {
  const x = X(THREE, M);
  // raio de Zeus: o feixe de raios dourado em zigue-zague com clarão branco
  const g = faceCam(T.group(0, 0.5, 0));
  const zig = [[0.08, 0.5], [-0.12, 0.08], [0.03, 0.06], [-0.1, -0.5], [0.16, -0.02], [0.01, -0.01], [0.2, 0.5]];
  T.add(T.extrude(zig, 0.05, 0.01), x.goldBright, 0, 0, 0, 0, 0, 0, g);
  T.add(T.extrude(zig.map(([a, b]) => [a * 0.6 + 0.02, b * 0.85]), 0.052, 0.005), x.glowWhite, 0, 0, 0.012, 0, 0, 0, g).userData.noShadow = true;
  for (let k = 0; k < 10; k++) { const r = T.add(T.box(0.01, 0.16, 0.002), x.glowGold, 0, 0, -0.02, 0, 0, (k / 10) * TAU, g); r.translateY(0.42); r.userData.noShadow = true; r.userData.noFrame = true; }
};
OBJ.lure_stone = (THREE, M, T) => {
  const x = X(THREE, M);
  // pedra sagrada de Poseidon (a isca): monólito com espirais e o brilho, oferendas de peixe ao pé
  const s = T.add(T.lathe([[0.001, 0], [0.22, 0], [0.24, 0.2], [0.2, 0.55], [0.12, 0.75], [0.001, 0.78]], 16), x.stoneGlow, 0, 0, 0); s.scale.set(1, 1, 0.75);
  for (let i = 0; i < 3; i++) T.add(T.tor(0.06 + i * 0.04, 0.008, 4, 24), x.glowBlue, 0, 0.42, 0.17 - i * 0.005, 0, 0, 0).userData.noShadow = true;
  for (let i = 0; i < 3; i++) { const f = T.add(T.sph(0.06, 12, 8), x.silver, -0.25 + i * 0.25, 0.04, 0.24); f.scale.set(2, 0.6, 0.8); }
};
OBJ.chalice = (THREE, M, T) => {
  const x = X(THREE, M);
  // restauração: cálice de ouro transbordando luz verde e folhas
  T.add(T.lathe([[0.001, 0], [0.16, 0.01], [0.12, 0.04], [0.035, 0.08], [0.03, 0.3], [0.09, 0.34], [0.2, 0.5], [0.22, 0.56], [0.2, 0.56], [0.08, 0.4], [0.001, 0.38]], 32), x.goldBright, 0, 0, 0);
  T.add(T.cyl(0.19, 0.19, 0.01, 28), x.glowGreen, 0, 0.54, 0);
  for (let i = 0; i < 7; i++) { const s = T.add(T.sph(0.035 - 0.003 * i, 10, 8), x.glowGreen, (hash(i) - 0.5) * 0.25, 0.62 + i * 0.06, (hash(i + 4) - 0.5) * 0.1); s.userData.noShadow = true; }
  for (let i = 0; i < 5; i++) { const l = T.add(T.sph(0.04, 8, 6), M.olive, -0.2 + i * 0.1, 0.56 + 0.02 * (i % 2), 0.18); l.scale.set(1.4, 0.4, 0.7); }
};
OBJ.olive_branch = (THREE, M, T) => {
  const x = X(THREE, M);
  // trégua: ramo de oliveira com a pomba branca
  T.add(T.tube([[-0.4, 0.2, 0.05], [-0.1, 0.3, 0.1], [0.2, 0.26, 0.12], [0.42, 0.34, 0.1]], 0.015, 20, 6), M.bark, 0, 0, 0);
  for (let i = 0; i < 12; i++) { const t = i / 11, px = -0.38 + t * 0.78; const l = T.add(T.sph(0.045, 10, 6), i % 3 ? M.olive : M.olive2, px, 0.28 + 0.05 * Math.sin(t * 5) + (i % 2 ? 0.05 : -0.04), 0.1 + (i % 2 ? 0.02 : -0.02)); l.scale.set(1.8, 0.35, 0.7); l.rotation.z = (i % 2 ? 0.6 : -0.6); }
  for (let i = 0; i < 3; i++) T.add(T.sph(0.025, 10, 8), M.olive2, -0.1 + i * 0.15, 0.2, 0.14);
  const dove = T.group(0.05, 0.62, 0.05, 0, -0.3, 0);
  const b = T.add(T.sph(0.1, 16, 12), M.feather, 0, 0, 0, 0, 0, 0, dove); b.scale.set(1.6, 0.9, 0.9);
  T.add(T.sph(0.06, 12, 10), M.feather, 0.16, 0.05, 0, 0, 0, 0, dove);
  T.add(T.cone(0.015, 0.05, 6), M.horn, 0.23, 0.05, 0, 0, 0, -Math.PI / 2, dove);
  for (const s of [-1, 1]) { const w = T.add(T.sph(0.12, 14, 10), M.feather, -0.02, 0.12, s * 0.08, s * 0.5, 0, 0.5, dove); w.scale.set(1.3, 0.25, 0.7); }
  T.add(T.sph(0.012, 6, 4), x.pupil, 0.19, 0.07, 0.045, 0, 0, 0, dove);
};
OBJ.skull_miasma = (THREE, M, T) => {
  const x = X(THREE, M);
  // pestilência: crânio envolto no miasma roxo
  const sk = T.add(T.sph(0.2, 24, 18), x.bone, 0, 0.35, 0); sk.scale.set(0.95, 1, 1.05);
  const jaw = T.add(T.box(0.2, 0.1, 0.16), x.bone, 0, 0.16, 0.06); void jaw;
  for (const s of [-1, 1]) { const e = T.add(T.sph(0.055, 12, 10), x.pupil, s * 0.075, 0.33, 0.16); e.scale.set(1, 1.1, 0.6); T.add(T.sph(0.018, 8, 6), x.glowPurple, s * 0.075, 0.33, 0.19).userData.noShadow = true; }
  T.add(T.cone(0.03, 0.06, 3), x.pupil, 0, 0.25, 0.19, Math.PI, 0, 0);
  for (let i = 0; i < 5; i++) T.add(T.box(0.025, 0.04, 0.02), x.bone, -0.06 + i * 0.03, 0.17, 0.14);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; const c = T.add(T.sph(0.1 + 0.05 * hash(i), 12, 10), x.miasma, Math.cos(a) * 0.3, 0.08 + 0.35 * hash(i + 2), Math.sin(a) * 0.22 - 0.05); c.userData.noShadow = true; }
};
OBJ.eye = (THREE, M, T) => {
  const x = X(THREE, M);
  // oráculo: o olho que tudo vê, dourado, com raios
  const g = faceCam(T.group(0, 0.45, 0));
  const almond = [];
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI; almond.push([Math.cos(a) * 0.36, Math.sin(a) * 0.16]); }
  for (let i = 1; i < 24; i++) { const a = Math.PI + (i / 24) * Math.PI; almond.push([Math.cos(a) * 0.36, Math.sin(a) * 0.16]); }
  T.add(T.extrude(almond, 0.03, 0.01), x.eyeWhite, 0, 0, 0, 0, 0, 0, g);
  T.add(T.cyl(0.13, 0.13, 0.02, 32), x.goldBright, 0, 0, 0.025, Math.PI / 2, 0, 0, g);
  T.add(T.cyl(0.06, 0.06, 0.02, 24), x.pupil, 0, 0, 0.035, Math.PI / 2, 0, 0, g);
  T.add(T.sph(0.02, 8, 6), x.glowWhite, -0.04, 0.04, 0.05, 0, 0, 0, g).userData.noShadow = true;
  const outline = T.add(T.tor(0.36, 0.014, 6, 48, Math.PI), M.gold, 0, -0.004, 0.02, 0, 0, 0, g); outline.scale.y = 0.46;
  const outline2 = T.add(T.tor(0.36, 0.014, 6, 48, Math.PI), M.gold, 0, 0.004, 0.02, 0, 0, Math.PI, g); outline2.scale.y = 0.46;
  for (let k = 0; k < 12; k++) { const r = T.add(T.box(0.014, 0.12, 0.002), x.glowGold, 0, 0, -0.02, 0, 0, (k / 12) * TAU, g); r.translateY(0.34); r.userData.noShadow = true; r.userData.noFrame = true; }
};
OBJ.bronze_shield = (THREE, M, T) => {
  const x = X(THREE, M);
  // pele de bronze: hoplon polido com a luz refletida e o antebraço de bronze
  const g = faceCam(T.group(0, 0.4, 0));
  hoplon(THREE, M, T, g, { r: 0.42, face: M.bronzeDark, rim: M.bronze, emblem: M.gold });
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; T.add(T.sph(0.018, 8, 6), M.gold, Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.03, 0, 0, 0, g); }
  for (const [px, py, s] of [[-0.18, 0.18, 1], [0.2, -0.12, 0.6]]) { const gl = T.add(T.extrude([[0, 0.1 * s], [0.015, 0.015], [0.1 * s, 0], [0.015, -0.015], [0, -0.1 * s], [-0.015, -0.015], [-0.1 * s, 0], [-0.015, 0.015]], 0.004), x.glowGold, px, py, 0.07, 0, 0, 0, g); gl.userData.noShadow = true; }
};
OBJ.boar = (THREE, M, T) => {
  const x = X(THREE, M);
  // maldição: cabeça de javali (quem é amaldiçoado vira javali)
  const g = T.group(0, 0.3, 0, 0, 0.5, 0);
  const head = T.add(T.sph(0.24, 22, 16), x.boar, 0, 0, 0, 0, 0, 0, g); head.scale.set(0.9, 0.85, 1.15);
  const snout = T.add(T.cyl(0.1, 0.14, 0.26, 18), x.boar, 0, -0.06, 0.26, Math.PI / 2 + 0.25, 0, 0, g); void snout;
  T.add(T.cyl(0.1, 0.1, 0.02, 18), x.snout, 0, -0.1, 0.39, Math.PI / 2 + 0.25, 0, 0, g);
  for (const s of [-1, 1]) {
    T.add(T.sph(0.018, 8, 6), x.pupil, s * 0.035, -0.1, 0.405, 0, 0, 0, g);
    T.add(T.tube([[s * 0.08, -0.12, 0.3], [s * 0.13, -0.08, 0.34], [s * 0.12, 0.0, 0.35]], 0.016, 10, 6), x.bone, 0, 0, 0, 0, 0, 0, g);
    T.add(T.sph(0.03, 10, 8), x.glowRed, s * 0.11, 0.06, 0.18, 0, 0, 0, g);
    T.add(T.cone(0.07, 0.16, 8), x.boar, s * 0.14, 0.2, -0.02, -0.3, 0, -s * 0.4, g);
  }
  for (let i = 0; i < 8; i++) T.add(T.cone(0.02, 0.1, 5), M.furDark, 0, 0.18 + 0.02 * Math.sin(i), -0.1 - i * 0.04, -0.6, 0, 0, g);
  for (let i = 0; i < 5; i++) { const h = T.add(T.sph(0.03, 10, 8), x.rose, -0.25 + 0.12 * i, -0.3 + 0.05 * hash(i), 0.2); h.scale.set(1, 0.9, 0.6); }
};
OBJ.storm_cloud = (THREE, M, T) => {
  const x = X(THREE, M);
  // tempestade de raios: nuvem escura com vários raios caindo
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; const c = T.add(T.sph(0.16 + 0.06 * hash(i), 16, 12), i % 3 ? x.cloud : x.cloudLight, Math.cos(a) * 0.26, 0.72 + 0.08 * hash(i + 1), Math.sin(a) * 0.12); c.userData.noShadow = false; }
  const g = faceCam(T.group(0, 0.35, 0.1));
  for (const [px, s] of [[-0.22, 0.7], [0.05, 1], [0.28, 0.75]]) {
    const zig = [[0.03, 0.3], [-0.05, 0.05], [0.02, 0.04], [-0.06, -0.3], [0.08, -0.01], [0, 0], [0.09, 0.3]].map(([a, b]) => [a * s + px, b * s]);
    T.add(T.extrude(zig, 0.02, 0.004), x.glowWhite, 0, 0, 0, 0, 0, 0, g).userData.noShadow = true;
  }
};
OBJ.cornucopia = (THREE, M, T) => {
  const x = X(THREE, M);
  // abundância: chifre de ouro transbordando frutas, trigo e moedas
  const pts = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([0.35 - t * 0.6, 0.12 + Math.sin(t * Math.PI * 0.9) * 0.28 + t * 0.1, 0]); }
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, 40, 1, 20, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // afina: raio vai de 0,2 (boca, i=0 → t=0) a 0,02 (ponta)
    const seg = Math.floor(i / 21), t = seg / 40, c = curve.getPointAt(Math.min(1, t));
    const r = 0.2 * (1 - t) + 0.02 * t;
    const vx = pos.getX(i) - c.x, vy = pos.getY(i) - c.y, vz = pos.getZ(i) - c.z;
    pos.setXYZ(i, c.x + vx * r, c.y + vy * r, c.z + vz * r);
  }
  geo.computeVertexNormals();
  T.add(geo, x.goldBright, 0, 0, 0);
  T.add(T.tor(0.19, 0.02, 6, 28), M.gold, 0.35, 0.12, 0, 0, Math.PI / 2, 0);
  for (let i = 0; i < 4; i++) T.add(T.sph(0.07, 12, 10), x.apple, 0.42 + 0.06 * Math.cos(i * 1.7), 0.14 + 0.08 * Math.sin(i * 1.7), 0.03 * i);
  for (let i = 0; i < 6; i++) T.add(T.sph(0.04, 10, 8), x.grape, 0.5 + 0.03 * i, 0.03 + 0.02 * (i % 2), 0.06);
  for (let i = 0; i < 3; i++) T.add(T.cyl(0.05, 0.05, 0.012, 16), x.goldBright, 0.55 + i * 0.08, 0.01, 0.12 - i * 0.05, 0.3, 0, 0.3);
  const w = T.add(T.sph(0.025, 8, 6), x.wheat, 0.46, 0.3, -0.02); w.scale.set(0.8, 2.6, 0.8); w.rotation.z = -0.5;
};
OBJ.quake = (THREE, M, T) => {
  const x = X(THREE, M);
  // terremoto: bloco de terra partido ao meio, lava na fenda e pedras soltas
  const half = (s) => { const g = T.group(s * 0.03, 0, 0, 0, 0, s * 0.12); T.add(T.box(0.4, 0.3, 0.6), M.stone, s * 0.2, 0.15, 0, 0, 0, 0, g); T.add(T.box(0.4, 0.04, 0.6), x.grass, s * 0.2, 0.32, 0, 0, 0, 0, g); return g; };
  half(-1); half(1);
  T.add(T.box(0.06, 0.28, 0.58), x.ember, 0, 0.12, 0);
  for (let i = 0; i < 6; i++) { const r = T.add(new THREE.DodecahedronGeometry(0.035 + 0.02 * hash(i), 0), M.stoneDark, (hash(i) - 0.5) * 0.5, 0.45 + 0.25 * hash(i + 1), (hash(i + 2) - 0.5) * 0.3); r.rotation.set(hash(i) * 3, hash(i + 1) * 3, 0); }
  for (let i = 0; i < 4; i++) { const c = T.add(T.sph(0.08 + 0.03 * i, 12, 8), x.cloudLight, (i - 1.5) * 0.12, 0.42 + 0.03 * i, -0.2); c.userData.noShadow = true; c.material = c.material.clone(); c.material.transparent = true; c.material.opacity = 0.6; }
};

/** Constrói o objeto `key` (grupo three.js em metros). */
export function buildObject(THREE, M, key, params = {}, { pitch = 32 } = {}) {
  PITCH = pitch;
  const fn = OBJ[key];
  if (!fn) throw new Error(`objeto de ícone desconhecido: ${key}`);
  const root = new THREE.Group();
  const T = tools(THREE, root);
  T.root = root;
  fn(THREE, M, T, params);
  return root;
}
export const OBJECT_KEYS = Object.keys(OBJ);
