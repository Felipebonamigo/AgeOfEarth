// Rig dos TITÃS (Etapa 6, lote titãs — docs/ART.md §1.3, §1.8 e Apêndice G): Prometeu, Cronos e Oceano, 3,6–4× a
// altura humana. O corpo é ESCULPIDO, não as cápsulas do rig humano: tronco em V com peitorais, abdome, dorsais e glúteos,
// pescoço com trapézio, deltoides, bíceps/tríceps, antebraços, mãos grandes, coxas, joelhos, panturrilhas e pés
// descalços — sólidos de revolução deformados, com a pele por cor de vértice e mapas gerados aqui mesmo (DataTexture,
// determinísticos: pedra, escamas, brasas) — sobre os MESMOS pivôs do rig humano (root, torso, head, shoulder/elbow,
// hip/knee, weapon), então as poses de art/poses/titan.json seguem as convenções de art/poses/human.json.
// Estilo (`params.style`), cada um com material, cabeça e silhueta próprios:
//   prometheus  pele de bronze queimado pelo sol, com fuligem e RACHADURAS EM BRASA nas mãos e antebraços (emissivas),
//               cabelo e barba ruivo-escuros, olhos em brasa, grilhões quebrados com correntes pendendo dos pulsos e FOGO
//               nas duas mãos (línguas de chama que tremulam por quadro + a luz delas no corpo); tanga e talabarte de time
//   cronus      pele de PEDRA gasta pelo tempo (granito com rachaduras e relevo, líquen e musgo nas superfícies de cima),
//               cabelo e barba longos cor de cinza, olhos de âmbar, coroa de ouro velho e a foice de adamante (harpe) na
//               direita; manto (himátion) e tanga de time
//   oceanus     tronco humano sobre uma CAUDA de serpente marinha (escamas, nadadeira dorsal e caudal) — a iconografia dos
//               mosaicos: garras de caranguejo na cabeça, barba e cabelo de algas —, pele verde-azulada e molhada; cinto
//               largo, talabarte e braçadeiras de time
//   height (m, topo da cabeça; padrão do estilo) · bulk (largura do tronco e dos membros; padrão do estilo)
// Escalares de pose (além de draw/hold do humano): wave/amp/coil (a onda e o enrolar da cauda do Oceano: `glide` = a
// passada) e flame (tamanho das chamas de Prometeu; 1 = normal).
// ASCENSÃO (animação `rise`): a raiz começa ABAIXO do chão e sobe. Um plano no chão que só escreve profundidade (desenhado
// antes de tudo e sem sombra) esconde o que está enterrado nos três passes do bake — cor, máscara de time (vira oclusor
// como o resto do corpo) e sombra (o enterrado não projeta: fica atrás do chão para o sol) —, sem mexer em bake.js.
// Metros com os pés em y = 0 e a frente em −z (como o humano); o grupo externo converte para tiles (× altura/1,8).

import { M2T, dirYaw } from '../camera.js';
import { applyPose, poseAt, JOINTS as HUMAN_JOINTS, SCALARS as HUMAN_SCALARS } from './human.js';
import { mottle, mix, smooth, taperTube, sculpt, noise3, fbm3, shade } from './organic.js';

export const JOINTS = HUMAN_JOINTS;
export const SCALARS = [...HUMAN_SCALARS, 'wave', 'amp', 'coil', 'flame'];
export const KIT = { style: ['prometheus', 'cronus', 'oceanus'] };
/** Altura do esqueleto de referência (o humano: topo da cabeça a 1,8 m). */
const REF_H = 1.8;
const HIP_Y = 0.92, THIGH = 0.44, UPPER = 0.28, FORE = 0.27;
/** Do joelho à SOLA (m): a perna do humano (0,44) mais o pé descalço — os pés do titã tocam o chão com a pelve a 0,92 m. */
const SHIN = 0.485;
const STYLE = {
  prometheus: { height: 6.8, bulk: 1.22 },
  cronus: { height: 7.2, bulk: 1.16 },
  oceanus: { height: 6.4, bulk: 1.2 },
};
const TAU = Math.PI * 2;
/** Giro da lâmina da foice em volta da haste (rad): de frente ela mostra a face, não só o fio. */
const BLADE_TURN = 0.6;
const gauss = (x) => Math.exp(-x * x);

// ---------------------------------------------------------------------------------------------------------------
// geometria

/** Normais médias por POSIÇÃO (as costuras dos sólidos de revolução não viram um friso escuro depois de esculpidos). */
function smoothNormals(geo) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, acc = new Map();
  const key = (i) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  for (let i = 0; i < p.count; i++) { const k = key(i); const a = acc.get(k) ?? [0, 0, 0]; a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); acc.set(k, a); }
  for (let i = 0; i < p.count; i++) { const a = acc.get(key(i)), l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; n.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
  n.needsUpdate = true;
  return geo;
}
/** Sólido de revolução em volta de y: perfil [[y, r], …] (qualquer ordem), pontas fechadas. */
function lathe(THREE, prof, seg = 18) {
  const p = [...prof].sort((a, b) => a[0] - b[0]);
  const pts = [new THREE.Vector2(0, p[0][0]), ...p.map(([y, r]) => new THREE.Vector2(Math.max(1e-4, r), y)), new THREE.Vector2(0, p[p.length - 1][0])];
  return new THREE.LatheGeometry(pts, seg);
}
/** Raio do perfil [[y, r]] em y (interpolação suave entre os pontos). */
function profR(prof, y) {
  const p = [...prof].sort((a, b) => a[0] - b[0]);
  if (y <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) if (y <= p[i][0]) { const t = (y - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t * t * (3 - 2 * t); }
  return p[p.length - 1][1];
}
/**
 * Membro que pende do pivô para −y: perfil [[t, r]] (t = 0 no pivô … 1 na ponta) de `len` m e MÚSCULOS [[t, largura,
 * direção, quanto]] — direção em radianos no plano xz a partir da frente (−z), positiva para +x (a direita do modelo).
 */
function limb(THREE, len, prof, muscles = [], seg = 16) {
  const geo = lathe(THREE, prof.map(([t, r]) => [-t * len, r]), seg);
  sculpt(geo, (x, y, z) => {
    const t = -y / len, rr = Math.sqrt(x * x + z * z);
    if (rr < 1e-5) return [x, y, z];
    let d = 0;
    for (const [tc, w, dir, amt] of muscles) {
      const c = (x * Math.sin(dir) - z * Math.cos(dir)) / rr;
      if (c > 0) d += amt * gauss((t - tc) / w) * c * c;
    }
    const k = (rr + d) / rr;
    return [x * k, y, z * k];
  });
  return smoothNormals(geo);
}
/** Elipsoide (esfera escalada na GEOMETRIA: as normais continuam certas). */
function ellipsoid(THREE, rx, ry, rz, ws = 16, hs = 12) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return smoothNormals(g);
}
/** Cor por vértice com a NORMAL (dorso/alto × ventre) no espaço da malha: fn(x, y, z, nx, ny, nz) → 0xRRGGBB. */
function paintN(THREE, geo, fn, m = null) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const col = new Float32Array(p.count * 3), c = new THREE.Color(), v = new THREE.Vector3(), w = new THREE.Vector3();
  const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)); w.set(n.getX(i), n.getY(i), n.getZ(i));
    if (m) { v.applyMatrix4(m); w.applyMatrix3(nm).normalize(); }
    c.setHex(fn(v.x, v.y, v.z, w.x, w.y, w.z));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// ---------------------------------------------------------------------------------------------------------------
// texturas geradas (DataTexture: funcionam também no Node, onde measure.mjs monta o rig sem navegador)

/** Textura size² por fn(u, v) → [r, g, b] (0–255), repetível, com mipmaps. */
function dataTexture(THREE, size, fn, { srgb = true, repeat = [1, 1] } = {}) {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = fn(x / size, y / size), o = (y * size + x) * 4;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}
/** Ruído periódico em u (a costura do sólido de revolução fecha): `f` células na volta, `fv` por unidade de v. */
function pnoise(u, v, f, fv, seed = 0) {
  const a = u * TAU, R = f / TAU;
  return fbm3(Math.cos(a) * R + seed * 7.1, Math.sin(a) * R + seed * 3.3, v * fv + seed * 1.7);
}
/** Crista do ruído (1 no meio das rachaduras). */
const ridge = (n) => 1 - Math.abs(2 * n - 1);

// ---------------------------------------------------------------------------------------------------------------
// materiais do titã (criados aqui, depois de todos os de materials.js: a ordem dos antigos não muda e nenhum outro asset
// é afetado; os metais — ouro, ferro, bronze — e o de time são os compartilhados)

function titanMaterials(THREE, M, style) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const out = {};
  if (style === 'prometheus') {
    // brasas: rachaduras finas em laranja-amarelo sobre preto (mapa emissivo das mãos e antebraços)
    const ember = dataTexture(THREE, 128, (u, v) => {
      const r = ridge(pnoise(u, v, 9, 7, 3)), r2 = ridge(pnoise(u, v, 17, 13, 5));
      const k = Math.max(smooth(0.88, 0.975, r), 0.6 * smooth(0.92, 0.985, r2));
      return [255 * k, 150 * k * k + 40 * k, 30 * k * k * k];
    });
    out.skin = std({ color: 0xffffff, vertexColors: true, roughness: 0.68, metalness: 0 });
    out.ember = std({ color: 0xffffff, vertexColors: true, roughness: 0.74, emissive: 0xff6a22, emissiveMap: ember, emissiveIntensity: 1.5 });
    out.hair = std({ color: 0xffffff, vertexColors: true, roughness: 0.92 });
    out.eye = new THREE.MeshBasicMaterial({ color: 0xffb24a, toneMapped: false });
    out.flameCore = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    out.flame = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0.78, depthWrite: false });
  } else if (style === 'cronus') {
    // granito gasto: grão, rachaduras escuras (e fundas no relevo), manchas de líquen
    const stoneAt = (u, v) => {
      const g = pnoise(u, v, 40, 40, 1), c = ridge(pnoise(u, v, 7, 6, 2)), c2 = ridge(pnoise(u, v, 15, 12, 9)), l = pnoise(u, v, 5, 4, 4);
      const crack = Math.max(smooth(0.88, 0.97, c), 0.8 * smooth(0.92, 0.985, c2));
      return { g, crack, lichen: smooth(0.6, 0.72, l) };
    };
    const map = dataTexture(THREE, 256, (u, v) => {
      const s = stoneAt(u, v), k = (0.9 + 0.3 * (s.g - 0.5)) * (1 - 0.6 * s.crack);
      const base = [250 * k, 246 * k, 238 * k];
      if (s.lichen > 0) { const t = s.lichen * (1 - s.crack); base[0] = base[0] * (1 - t) + 172 * t; base[1] = base[1] * (1 - t) + 168 * t; base[2] = base[2] * (1 - t) + 96 * t; }
      return base;
    }, { repeat: [2, 2] });
    const bump = dataTexture(THREE, 256, (u, v) => { const s = stoneAt(u, v); const h = 200 + 50 * (s.g - 0.5) - 150 * s.crack; return [h, h, h]; }, { srgb: false, repeat: [2, 2] });
    out.skin = std({ color: 0xffffff, vertexColors: true, map, bumpMap: bump, bumpScale: 1.4, roughness: 0.93, metalness: 0 });
    out.hair = std({ color: 0xffffff, vertexColors: true, roughness: 0.95 });
    out.eye = new THREE.MeshBasicMaterial({ color: 0xffc860, toneMapped: false });
  } else {
    // escamas imbricadas (meias-luas em fileiras alternadas) para a cauda; pele molhada no tronco
    const scaleAt = (u, v) => {
      const U = u * 34, V = v * 10, row = Math.floor(U), fu = U - row, off = (row % 2) * 0.5, fv = ((V + off) % 1 + 1) % 1;
      const dx = (fv - 0.5) * 1.3, dy = fu;   // a meia-lua: borda de trás de cada escama
      const d = Math.sqrt(dx * dx + dy * dy);
      return { rim: smooth(0.62, 0.74, d) * (1 - smooth(0.88, 1.0, d)), h: 1 - d * 0.8 };
    };
    const map = dataTexture(THREE, 256, (u, v) => { const s = scaleAt(u, v), k = 0.95 - 0.32 * s.rim + 0.08 * s.h; return [228 * k, 236 * k, 232 * k]; });
    const bump = dataTexture(THREE, 256, (u, v) => { const s = scaleAt(u, v), h = 90 + 140 * s.h * (1 - s.rim); return [h, h, h]; }, { srgb: false });
    out.skin = std({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.02, bumpMap: bump, bumpScale: 0.35 });
    out.tail = std({ color: 0xffffff, vertexColors: true, map, bumpMap: bump, bumpScale: 1.1, roughness: 0.32, metalness: 0.06 });
    out.fin = std({ color: 0xffffff, vertexColors: true, roughness: 0.45, side: THREE.DoubleSide });
    out.weed = std({ color: 0xffffff, vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
    out.hair = out.weed;
    out.claw = std({ color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0.05 });
    out.eye = new THREE.MeshBasicMaterial({ color: 0x9ff0e0, toneMapped: false });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// o titã

/** Cor de pele de cada estilo no ponto (espaço do corpo, metros) com a normal: contra-sombreamento e manchas. */
function skinColor(style, part) {
  if (style === 'prometheus') {
    // bronze queimado; fuligem subindo das mãos pelos antebraços; mais escuro nas costas e nos ombros (sol)
    return (x, y, z, nx, ny) => {
      let c = mix(0xa47c64, 0x7d5a47, 0.35 * smooth(-0.2, 0.8, ny) + 0.2 * smooth(0, 0.3, z));
      c = mix(c, 0x8c5f4a, 0.3 * smooth(0.55, 0.75, fbm3(x * 7, y * 7, z * 7)));
      if (part === 'fore') c = mix(c, 0x32261f, 0.2 + 0.8 * smooth(-0.04, -0.24, y));
      if (part === 'hand') c = mix(0x2c211b, 0x4a3428, smooth(-0.2, 0.6, ny));
      return mottle(c, 0.06, x, y, z, 18, 2);
    };
  }
  if (style === 'cronus') {
    // granito cinza-pardo, mais claro no alto (luz) e com musgo nas superfícies viradas para cima (o tempo)
    return (x, y, z, nx, ny) => {
      let c = mottle(mix(0xc4beb2, 0xa39c90, fbm3(x * 5, y * 5, z * 5)), 0.07, x, y, z, 9, 6);
      c = mix(c, 0x857d70, 0.35 * smooth(-0.2, -0.8, ny));   // o de baixo mais sujo
      const moss = smooth(0.4, 0.85, ny) * smooth(0.45, 0.68, fbm3(x * 6 + 3, y * 6, z * 6 + 1));
      c = mix(c, 0x6d7a42, 0.7 * moss);
      if (part === 'hand' || part === 'foot') c = shade(c, 0.9);
      return c;
    };
  }
  // Oceano: verde-azulado molhado, dorso mais escuro, ventre claro e manchas como de peixe
  return (x, y, z, nx, ny, nz) => {
    let c = mix(0x6c8e84, 0x3f5e5e, smooth(-0.2, 0.6, nz) * 0.6 + smooth(0.2, 0.9, ny) * 0.25);
    if (part === 'torso') c = mix(c, 0x9eb4a2, 0.45 * smooth(0.1, 0.8, -nz) * (1 - smooth(0.35, 0.5, y)));
    c = mix(c, 0x32504e, 0.35 * smooth(0.58, 0.72, fbm3(x * 9 + 2, y * 9, z * 9)));
    return mottle(c, 0.06, x, y, z, 16, 8);
  };
}

export function buildTitan(THREE, M, params = {}) {
  const style = KIT.style.includes(params.style) ? params.style : 'prometheus';
  const P = { ...STYLE[style], ...params, style };
  const naga = style === 'oceanus';
  const g = P.bulk, gl = Math.pow(g, 0.95);
  const T = titanMaterials(THREE, M, style);
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const joint = (parent, x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
  /** Malha de pele: cor por vértice do estilo no espaço do corpo (a matriz da malha em relação ao pivô). */
  const skinMesh = (geo, parent, x, y, z, part, mat = T.skin) => {
    const m = mesh(geo, mat, x, y, z, parent);
    m.updateMatrix();
    paintN(THREE, geo, skinColor(style, part), m.matrix);
    return m;
  };

  const group = new THREE.Group();
  const k = P.height / REF_H;
  const rig = new THREE.Group(); rig.scale.setScalar(M2T * k); group.add(rig);
  const J = {};
  J.root = joint(rig, 0, HIP_Y, 0);
  J.torso = joint(J.root, 0, 0, 0);
  J.head = joint(J.torso, 0, 0.66, 0);
  const thin = [], feet = [], teamParts = [];

  // ---- tronco: V largo, peitorais, abdome, dorsais, espinha, glúteos ----
  const TORSO = [[-0.26, 0.05], [-0.22, 0.15], [-0.14, 0.2], [-0.05, 0.2], [0.04, 0.18], [0.13, 0.172], [0.23, 0.188], [0.33, 0.212], [0.42, 0.228], [0.5, 0.224], [0.56, 0.19], [0.61, 0.13], [0.64, 0.07]];
  const sxOf = (y) => g * (1.06 + 0.28 * smooth(0.12, 0.44, y) - 0.12 * smooth(0.52, 0.64, y));
  const szOf = (y) => 0.74 + 0.06 * smooth(0.25, 0.45, y) + 0.08 * smooth(0.05, -0.18, y);
  const torsoG = lathe(THREE, TORSO, 30);
  sculpt(torsoG, (x, y, z) => {
    let X = x * sxOf(y), Z = z * szOf(y);
    const ax = Math.abs(X);
    if (Z < 0) {
      const pec = 0.034 * g * gauss((ax - 0.12 * g) / (0.1 * g)) * (y < 0.4 ? gauss((y - 0.4) / 0.035) : gauss((y - 0.4) / 0.085));
      const abs = y > 0.02 && y < 0.33 ? 0.011 * gauss(ax / 0.08) * (0.55 + 0.45 * Math.cos(TAU * (y - 0.06) / 0.085)) : 0;
      const alba = 0.009 * gauss(ax / 0.014) * smooth(0.0, 0.1, y) * (1 - smooth(0.3, 0.37, y));
      const oblique = 0.012 * gauss((ax - 0.16 * g) / 0.05) * gauss((y - 0.05) / 0.08);
      Z -= pec + abs - alba + oblique;
    } else {
      const lat = 0.03 * g * gauss((ax - 0.15 * g) / (0.08 * g)) * gauss((y - 0.37) / 0.1);
      const blade = 0.016 * gauss((ax - 0.12 * g) / 0.05) * gauss((y - 0.46) / 0.05);
      const spine = 0.016 * gauss(ax / 0.024) * smooth(-0.12, 0.08, y);
      const glute = y < 0.02 ? 0.045 * gauss((ax - 0.085) / 0.075) * gauss((y + 0.12) / 0.075) : 0;
      Z += lat + blade - spine + glute;
    }
    return [X, y, Z];
  });
  smoothNormals(torsoG);
  skinMesh(torsoG, J.torso, 0, 0, 0, 'torso');
  /** Meia-largura (x) e meia-profundidade (z) do tronco em y (sem os músculos): para a tanga, o talabarte e o manto. */
  const torsoRX = (y) => profR(TORSO, y) * sxOf(y), torsoRZ = (y) => profR(TORSO, y) * szOf(y);
  // pescoço com o trapézio descendo para os ombros
  const neckG = lathe(THREE, [[0.5, 0.13 * g], [0.57, 0.1 * Math.sqrt(g)], [0.64, 0.083 * Math.sqrt(g)], [0.74, 0.075]], 18);
  skinMesh(neckG, J.torso, 0, 0, 0.005, 'neck');
  for (const s of [-1, 1]) {
    const trap = ellipsoid(THREE, 0.13 * g, 0.06, 0.09);
    const t = skinMesh(trap, J.torso, s * 0.12 * g, 0.555, 0.03, 'torso'); t.rotation.z = -s * 0.42;
  }

  // ---- braços: um volume só do ombro ao cotovelo (deltoide no alto, bíceps, tríceps), antebraço, punho fechado ----
  const hands = {};
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1, out = s * Math.PI / 2;
    const sh = J['shoulder' + side] = joint(J.torso, s * 0.285 * g, 0.5, 0);
    skinMesh(ellipsoid(THREE, 0.064 * g, 0.07 * g, 0.074 * g), sh, -s * 0.012, 0.0, 0, 'arm');   // a junta no tronco
    skinMesh(limb(THREE, 0.35, [[0, 0.066], [0.12, 0.074], [0.28, 0.07], [0.5, 0.067], [0.8, 0.057], [1, 0.052]].map(([t, r]) => [t, r * g]),
      [[0.16, 0.14, out, 0.016 * g], [0.16, 0.12, 0, 0.01 * g], [0.16, 0.12, Math.PI, 0.008 * g], [0.56, 0.2, 0, 0.018 * g], [0.44, 0.24, Math.PI, 0.015 * g]], 18), sh, 0, 0.035, 0, 'arm');
    const el = J['elbow' + side] = joint(sh, 0, -UPPER, 0);
    const fore = limb(THREE, 0.32, [[0, 0.054], [0.15, 0.062], [0.45, 0.054], [0.8, 0.043], [1, 0.041]].map(([t, r]) => [t, r * g]),
      [[0.22, 0.2, out * 0.6, 0.013 * g], [0.3, 0.2, 0, 0.009 * g]], 16);
    skinMesh(fore, el, 0, 0.03, 0, 'fore', T.ember ?? T.skin);
    // punho fechado: palma, nós dos dedos, polegar
    const hand = joint(el, 0, -FORE - 0.05, -0.005);
    hands[side] = hand;
    skinMesh(ellipsoid(THREE, 0.05 * g, 0.066 * g, 0.058 * g), hand, 0, 0, 0, 'hand', T.ember ?? T.skin);
    skinMesh(ellipsoid(THREE, 0.046 * g, 0.03 * g, 0.049 * g), hand, 0, -0.05 * g, -0.012, 'hand', T.ember ?? T.skin);
    const th = skinMesh(ellipsoid(THREE, 0.021 * g, 0.044 * g, 0.021 * g), hand, -s * 0.044 * g, -0.01, -0.035, 'hand', T.ember ?? T.skin); th.rotation.set(0.5, 0, s * 0.5);
  }

  // ---- pernas: coxa, joelho, perna com panturrilha, pé descalço (só os bípedes) ----
  if (!naga) for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1, inward = -s * Math.PI / 2;
    const hip = J['hip' + side] = joint(J.root, s * 0.11 * Math.pow(g, 0.7), 0, 0);
    skinMesh(limb(THREE, 0.49, [[0, 0.112], [0.12, 0.118], [0.45, 0.105], [0.8, 0.084], [1, 0.072]].map(([t, r]) => [t, r * gl]),
      [[0.45, 0.3, 0, 0.022 * gl], [0.82, 0.12, inward * 0.6, 0.014 * gl], [0.4, 0.3, Math.PI, 0.012 * gl], [0.3, 0.25, -inward, 0.01 * gl]]), hip, 0, 0.04, 0, 'leg');
    const knee = J['knee' + side] = joint(hip, 0, -THIGH, 0);
    skinMesh(ellipsoid(THREE, 0.06 * gl, 0.064 * gl, 0.062 * gl), knee, 0, 0.0, -0.008, 'leg');
    skinMesh(limb(THREE, 0.47, [[0, 0.07], [0.2, 0.075], [0.55, 0.058], [0.9, 0.046], [1, 0.047]].map(([t, r]) => [t, r * gl]),
      [[0.24, 0.16, Math.PI, 0.03 * gl], [0.22, 0.14, Math.PI + s * 0.5, 0.012 * gl], [0.3, 0.3, 0, 0.006 * gl]]), knee, 0, 0.02, 0, 'leg');
    // pé descalço: sola plana no chão (y = −SHIN do joelho), mais largo nos dedos, calcanhar redondo
    const fg = new THREE.SphereGeometry(1, 16, 10);
    sculpt(fg, (x, y, z) => {
      const front = smooth(0.2, -0.9, z);
      const Y = Math.max(y * 0.045, -0.034) + 0.004 * (1 - front);
      return [x * 0.054 * gl * (0.85 + 0.35 * front), Y * (1 - 0.35 * front * smooth(-0.5, 0.9, y)), z * 0.138];
    });
    smoothNormals(fg);
    const foot = skinMesh(fg, knee, 0, -SHIN + 0.034, -0.055, 'foot');
    feet.push(foot);
    skinMesh(ellipsoid(THREE, 0.036 * gl, 0.05, 0.036 * gl), knee, 0, -SHIN + 0.075, 0.015, 'foot');   // tornozelo
  }

  // ---- cabeça: crânio, maxilar, arcada, nariz, orelhas, olhos (e o que o estilo põe por cima) ----
  const H = joint(J.head, 0, 0, 0);
  skinMesh(ellipsoid(THREE, 0.098, 0.115, 0.108), H, 0, 0.13, 0.004, 'head');
  skinMesh(ellipsoid(THREE, 0.078, 0.06, 0.08), H, 0, 0.06, -0.035, 'head');                       // maxilar
  skinMesh(ellipsoid(THREE, 0.082, 0.024, 0.04), H, 0, 0.158, -0.082, 'head');                       // arcada
  const nose = new THREE.ConeGeometry(0.02, 0.06, 6); nose.rotateX(-0.35); skinMesh(nose, H, 0, 0.125, -0.108, 'head');
  for (const s of [-1, 1]) {
    skinMesh(ellipsoid(THREE, 0.014, 0.03, 0.02), H, s * 0.1, 0.125, 0.01, 'head');
    mesh(new THREE.SphereGeometry(0.012, 8, 6), T.eye, s * 0.034, 0.14, -0.1, H).userData.noShadow = true;
  }

  // cabelo/barba: massas com fios (deslocamento pela normal) e cor por vértice
  const hairCol = style === 'prometheus' ? [0x3a2014, 0x6a3a22] : style === 'cronus' ? [0x4c4844, 0x9c968c] : [0x243a22, 0x4f6a36];
  const hairMass = (geo, parent, x, y, z, amp = 0.012, freq = 22) => {
    // fios: ruído alongado em y (mechas), mais fundo que o da pele
    const p = geo.attributes.position; geo.computeVertexNormals();
    const n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i), d = (fbm3(X * freq, Y * freq * 0.25, Z * freq) - 0.5) * 2 * amp;
      p.setXYZ(i, X + n.getX(i) * d, Y + n.getY(i) * d, Z + n.getZ(i) * d);
    }
    smoothNormals(geo);
    const m = mesh(geo, T.hair, x, y, z, parent);
    m.updateMatrix();
    paintN(THREE, geo, (X, Y, Z, nx, ny) => mix(hairCol[0], hairCol[1], 0.35 * smooth(-0.3, 0.9, ny) + 0.5 * fbm3(X * 40, Y * 8, Z * 40)), m.matrix);
    return m;
  };
  if (style === 'prometheus') {
    // cabelo cheio e ondulado até a nuca, barba cerrada até o alto do peito
    const cap = new THREE.SphereGeometry(0.118, 18, 12, 0, TAU, 0, Math.PI * 0.62); cap.scale(1, 1.02, 1.08);
    hairMass(cap, H, 0, 0.14, 0.02, 0.016, 20).rotation.x = 0.55;
    hairMass(ellipsoid(THREE, 0.1, 0.1, 0.06), H, 0, 0.07, 0.07, 0.018, 18);
    const beard = lathe(THREE, [[0, 0.075], [-0.06, 0.082], [-0.13, 0.06], [-0.19, 0.025]], 16); beard.scale(1, 1, 0.8);
    hairMass(beard, H, 0, 0.075, -0.05, 0.014, 22).rotation.x = -0.35;
    // fita de time prendendo o cabelo (à vista de cima em qualquer direção — até saindo da terra)
    const hb = mesh(new THREE.TorusGeometry(0.118, 0.014, 6, 24), M.team, 0, 0.165, 0.012, H); hb.rotation.x = Math.PI / 2 + 0.3; hb.scale.set(1, 1.08, 1);
    teamParts.push(hb);
  } else if (style === 'cronus') {
    // cabelo longo até os ombros, barba longa até o meio do peito, coroa de ouro velho com pontas irregulares
    const cap = new THREE.SphereGeometry(0.118, 18, 12, 0, TAU, 0, Math.PI * 0.6); cap.scale(1, 1, 1.08);
    hairMass(cap, H, 0, 0.14, 0.02, 0.014, 20).rotation.x = 0.55;
    const back = lathe(THREE, [[0, 0.1], [-0.12, 0.11], [-0.26, 0.085], [-0.32, 0.05]], 16); back.scale(1.05, 1, 0.55);
    hairMass(back, H, 0, 0.16, 0.07, 0.015, 18).rotation.x = 0.18;
    const beard = lathe(THREE, [[0, 0.08], [-0.1, 0.092], [-0.24, 0.072], [-0.36, 0.036], [-0.44, 0.01]], 16); beard.scale(1.05, 1, 0.8);
    hairMass(beard, H, 0, 0.085, -0.075, 0.016, 20).rotation.x = -0.55;
    for (const s of [-1, 1]) { const mo = lathe(THREE, [[0, 0.018], [-0.06, 0.02], [-0.14, 0.006]], 8); hairMass(mo, H, s * 0.035, 0.1, -0.1, 0.006, 30).rotation.z = s * 0.25; }
    const crownG = new THREE.CylinderGeometry(0.118, 0.114, 0.035, 24, 1, true);
    const crown = joint(H, 0, 0.2, 0.004);
    mesh(crownG, M.gold, 0, 0, 0, crown).scale.set(1, 1, 1.08);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU, h = 0.05 + 0.025 * ((i * 7) % 3) / 2;
      const sp = mesh(new THREE.ConeGeometry(0.018, h, 5), M.gold, Math.sin(a) * 0.117, 0.017 + h / 2, -Math.cos(a) * 0.126, crown);
      sp.rotation.set(-Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2);
    }
    // gemas de time no aro da coroa, uma por ponta (a cor do dono na cabeça, vista de todo lado)
    for (let i = 0; i < 9; i++) {
      const a = ((i + 0.5) / 9) * TAU;
      teamParts.push(mesh(new THREE.SphereGeometry(0.015, 8, 6), M.team, Math.sin(a) * 0.121, 0.0, -Math.cos(a) * 0.13, crown));
    }
  } else {
    // Oceano: cabelo e barba de algas (mechas longas), garras de caranguejo saindo das têmporas
    const cap = new THREE.SphereGeometry(0.118, 18, 12, 0, TAU, 0, Math.PI * 0.6); cap.scale(1, 1, 1.08);
    hairMass(cap, H, 0, 0.14, 0.02, 0.018, 16).rotation.x = 0.55;
    const beard = lathe(THREE, [[0, 0.078], [-0.1, 0.085], [-0.22, 0.06], [-0.3, 0.02]], 16); beard.scale(1, 1, 0.75);
    hairMass(beard, H, 0, 0.078, -0.052, 0.02, 16).rotation.x = -0.3;
    for (const s of [-1, 1]) {
      // garra de caranguejo (quela): haste curva de carapaça subindo para fora, a palma inchada e os dois dedos em pinça,
      // pontas escuras
      const clawCol = (x, y, z, nx, ny) => mottle(mix(0x6a2818, 0xb05a38, smooth(-0.3, 0.8, ny)), 0.08, x, y, z, 30, 5);
      const stalk = taperTube(THREE, [[0, 0, 0], [s * 0.04, 0.05, 0.01], [s * 0.08, 0.1, 0.0], [s * 0.1, 0.15, -0.02]], 0.024, 0.022, { tubular: 12, radial: 8 });
      smoothNormals(stalk); paintN(THREE, stalk, clawCol);
      mesh(stalk, T.claw, s * 0.07, 0.2, -0.01, H);
      const cl = joint(H, s * 0.17, 0.36, -0.035); cl.rotation.set(-0.25, 0, -s * 0.45);
      const palm = ellipsoid(THREE, 0.036, 0.06, 0.03); paintN(THREE, palm, clawCol);
      mesh(palm, T.claw, 0, 0.02, 0, cl);
      for (const [dx, ang, len, r0] of [[-0.014, 0.28, 0.085, 0.017], [0.016, -0.32, 0.07, 0.014]]) {
        const f = taperTube(THREE, [[0, 0, 0], [0, len * 0.55, -0.006], [-Math.sign(ang) * 0.012, len, -0.01]], r0, 0.003, { tubular: 8, radial: 6 });
        smoothNormals(f);
        paintN(THREE, f, (x, y) => mix(0x9a4a30, 0x241008, smooth(len * 0.5, len, y)));
        const fm = mesh(f, T.claw, s * dx, 0.07, 0, cl); fm.rotation.z = s * ang;
      }
    }
    // mechas de alga caindo pelas costas e pelos ombros
    for (let i = 0; i < 7; i++) {
      const a = -0.9 + (i / 6) * 1.8, x0 = Math.sin(a) * 0.1, z0 = 0.05 + Math.cos(a) * 0.06;
      const len = 0.3 + 0.08 * ((i * 5) % 3);
      const w = taperTube(THREE, [[0, 0, 0], [x0 * 0.4, -0.1, 0.05], [x0 * 0.7, -0.2 - 0.02 * (i % 2), 0.06], [x0, -len, 0.04 + 0.02 * (i % 3)]], 0.02, 0.006, { tubular: 10, radial: 6 });
      w.scale(1, 1, 0.45);
      smoothNormals(w);
      const wm = mesh(w, T.weed, x0, 0.15, z0, H);
      paintN(THREE, w, (x, y) => mix(0x2e3e1c, 0x5c6e30, smooth(-0.35, 0, y)));
      void wm;
    }
  }

  // ---- peças de TIME (braçadeira, faixa, tanga, manto): visíveis de todos os lados ----
  const leather = M.leather;
  /**
   * Faixa em volta do tronco, na superfície dele: centro em y = yc(φ) (φ = 0 na frente, +x à direita), largura w,
   * afastada `off` do tronco. Tira de vértices (topo, base) fechada na volta.
   */
  const band = (yc, w, off, mat, n = 64, minR = 0) => {
    const pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const phi = (i / n) * TAU;
      for (const e of [0.5, -0.5]) {
        const y = yc(phi) + e * w;
        const rx = Math.max(torsoRX(y), minR) + off, rz = Math.max(torsoRZ(y), minR) + off + (Math.cos(phi) > 0 ? 0.03 * g * gauss((y - 0.42) / 0.07) : 0);
        pos.push(Math.sin(phi) * rx, y, -Math.cos(phi) * rz);
      }
    }
    for (let i = 0; i < n; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    smoothNormals(geo);
    return mesh(geo, mat, 0, 0, 0, J.torso);
  };
  // tanga (perizoma): faixa na cintura, abas da frente e de trás (acompanham as coxas: `post`) e o cinto de couro
  const flaps = [];
  let kilt = null;   // himátion de Cronos: assenta no corpo quando ele cai (afterPose)
  const loincloth = (mat) => {
    teamParts.push(band(() => -0.1, 0.24, 0.012, mat));
    band(() => 0.02, 0.035, 0.02, leather);
    for (const [zs, len] of [[-1, 0.4], [1, 0.34]]) {
      const piv = joint(J.root, 0, 0.0, zs * (torsoRZ(-0.1) + 0.018));
      const W = 0.3 * g;
      const geo = new THREE.BoxGeometry(W, len, 0.024, 10, 6, 1);
      sculpt(geo, (x, y, z) => {
        const u = x / (W / 2), v = (y + len / 2) / len;   // v = 1 no cinto, 0 na barra
        const fold = 0.008 * Math.sin(u * 7.5 + 0.7) * (1 - v);
        const hem = -0.03 * (1 - v) * (0.5 + 0.5 * Math.sin(u * 5.1 + 1.3)) * smooth(0.2, 0, v);
        // abraça o corpo nas pontas (vira para trás) e cai um pouco mais nas laterais
        return [x * (1 - 0.08 * (1 - v)), y + hem, z - zs * (0.05 * u * u + fold)];
      });
      geo.translate(0, -len / 2, 0);
      smoothNormals(geo);
      const fl = mesh(geo, mat, 0, 0, 0, piv);
      mesh(new THREE.BoxGeometry(W * 0.95, 0.03, 0.03), leather, 0, -0.012, 0, piv);   // dobra no cinto
      teamParts.push(fl);
      flaps.push({ piv, zs });
    }
  };
  if (style === 'prometheus') loincloth(M.team);
  // talabarte (do ombro direito ao quadril esquerdo), por cima do peito
  if (style === 'prometheus' || style === 'oceanus') {
    const sash = (phi) => 0.3 + 0.2 * Math.sin(phi);
    teamParts.push(band(sash, 0.1, 0.02, M.team));
    band((phi) => sash(phi) + 0.055, 0.015, 0.024, leather);
    band((phi) => sash(phi) - 0.055, 0.015, 0.024, leather);
  }
  // himátion de Cronos (como nas estátuas dos deuses maiores): o pano de time enrolado na cintura até abaixo do joelho,
  // aberto em sino (as coxas andam por dentro) e com dobras, e a ponta jogada sobre o ombro esquerdo (a faixa diagonal);
  // casca dupla (a de dentro virada para dentro) para ter face dos dois lados sem material de dupla face (a máscara de
  // time é de uma face)
  if (style === 'cronus') {
    const n = 48, rows = 12, pos = [], idx = [];
    const y0 = 0.06, y1 = -0.42;
    for (const inner of [0, 1]) for (let r = 0; r <= rows; r++) for (let i = 0; i <= n; i++) {
      const v = r / rows, a = (i / n) * TAU;   // a = 0 na frente (−z), crescendo para +x
      const y = y0 + (y1 - y0) * v;
      const front = Math.max(0, Math.cos(a));   // 1 na frente (a = 0: −z)
      const flare = 0.03 + v * v * (0.07 + 0.15 * Math.abs(Math.cos(a)) + 0.04 * front);   // folga na frente e atrás: as coxas andam por dentro
      const fold = 0.016 * v * Math.sin(a * 11 + 0.4) + 0.008 * Math.sin(a * 23 + 1.1) * v;
      const R = inner ? -0.016 : 0;
      const yy = Math.max(-0.2, y);
      const rx = torsoRX(yy) * (1 - 0.1 * v) + flare + fold + R, rz = torsoRZ(yy) + flare * 0.9 + fold + R;
      // a barra cai um pouco mais atrás e tem a ponta enviesada (pano, não um cilindro cortado)
      const hem = v === 1 ? -0.04 * (0.5 + 0.5 * Math.cos(a)) - 0.03 * Math.sin(a * 3 + 0.5) : 0;
      pos.push(Math.sin(a) * rx, y + hem, -Math.cos(a) * rz);
    }
    const W = n + 1, off = (rows + 1) * W;
    for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
      const a = r * W + i, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, b, c, b, d, c);
      idx.push(off + a, off + c, off + b, off + b, off + c, off + d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    kilt = mesh(geo, M.team, 0, 0, 0, J.root);
    teamParts.push(kilt);
    // a ponta sobre o ombro esquerdo: faixa larga do ombro esquerdo ao quadril direito, e o cinto de couro
    const drape = (phi) => 0.3 - 0.21 * Math.sin(phi);
    teamParts.push(band(drape, 0.16, 0.022, M.team));
    band((phi) => drape(phi) + 0.083, 0.016, 0.026, leather);
    band(() => 0.06, 0.04, 0.03, leather);
    // fíbula de ouro no ombro esquerdo
    mesh(new THREE.SphereGeometry(0.035, 10, 8), M.gold, -0.2 * g, 0.53, -0.1, J.torso);
  }
  // Oceano: cinto largo de time onde o tronco vira cauda (a junção), braçadeiras de time
  if (naga) {
    // por fora do tronco E do começo da cauda (mais grosso que a pelve na frente e atrás)
    const R0 = 0.19 * g * 1.05;
    teamParts.push(band(() => -0.13, 0.2, 0.02, M.team, 64, R0));
    for (const dy of [-0.235, -0.025]) band(() => dy, 0.024, 0.028, leather, 64, R0);
  }
  if (style === 'oceanus' || style === 'cronus') for (const s of ['L', 'R']) {
    // braçadeira de couro tingido no alto do antebraço
    const b = mesh(new THREE.CylinderGeometry(0.068 * g, 0.064 * g, 0.09, 16), style === 'oceanus' ? M.team : leather, 0, -0.1, 0, J['elbow' + s]);
    if (style === 'oceanus') teamParts.push(b);
  }

  // ---- Prometeu: grilhões quebrados e FOGO nas mãos ----
  const flames = [], chains = [];
  if (style === 'prometheus') {
    for (const s of ['L', 'R']) {
      const el = J['elbow' + s];
      mesh(new THREE.CylinderGeometry(0.058 * g, 0.058 * g, 0.075, 14), M.iron, 0, -0.24, 0, el);
      for (const a of [0, 2.1, 4.2]) mesh(new THREE.SphereGeometry(0.009, 6, 4), M.iron, Math.sin(a) * 0.06 * g, -0.24, Math.cos(a) * 0.06 * g, el);
      // corrente pendurada do grilhão (orientada para baixo no mundo em `post`); o último elo aberto
      const ch = joint(el, (s === 'L' ? -1 : 1) * 0.055 * g, -0.25, 0.01);
      for (let i = 0; i < 5; i++) {
        const open = i === 4;
        const l = mesh(new THREE.TorusGeometry(0.024, 0.0075, 5, 10, open ? Math.PI * 1.4 : TAU), M.iron, 0, -0.03 - i * 0.036, 0, ch);
        l.scale.set(1, 1.35, 1); l.rotation.y = i % 2 ? Math.PI / 2 : 0;
      }
      chains.push(ch); thin.push(ch);
      // chamas: núcleo claro opaco e línguas translúcidas por fora (tremulam por quadro em `post`), com a luz do fogo
      const fg = joint(hands[s], 0, 0, 0);
      const tongues = [];
      const flameCol = (core) => (x, y) => core ? mix(0xfff2b0, 0xffb040, smooth(0.0, 0.2, y)) : mix(0xffc050, mix(0xff5a14, 0x8a1a06, smooth(0.25, 0.4, y)), smooth(0.03, 0.25, y));
      const core = lathe(THREE, [[-0.03, 0.03], [0.02, 0.06], [0.1, 0.045], [0.2, 0.012], [0.24, 0.0]], 12);
      paintN(THREE, core, flameCol(true));
      const cm = mesh(core, T.flameCore, 0, 0.02, 0, fg); cm.userData.noShadow = true; cm.castShadow = false;
      tongues.push({ m: cm, base: [0, 0.02, 0], h: 1, a: 0 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.4, h = 0.28 + 0.08 * ((i * 3) % 4) / 3;
        const t = lathe(THREE, [[-0.02, 0.028], [0.03, 0.045], [h * 0.45, 0.03], [h * 0.8, 0.01], [h, 0.0]], 10);
        paintN(THREE, t, flameCol(false));
        const tm = mesh(t, T.flame, Math.sin(a) * 0.035, 0.0, Math.cos(a) * 0.035, fg); tm.userData.noShadow = true; tm.castShadow = false;
        tongues.push({ m: tm, base: [Math.sin(a) * 0.035, 0.0, Math.cos(a) * 0.035], h: 1, a });
      }
      const light = new THREE.PointLight(0xff8a3c, 0.5, 3.2, 2); light.position.set(0, 0.12, 0); fg.add(light);
      flames.push({ fg, tongues, light, seed: s === 'L' ? 11 : 23 });
      thin.push(fg);
    }
  }

  // ---- Cronos: a foice de adamante (a harpe que Gaia lhe deu): uma foice GRANDE de mão, não uma gadanha de haste ----
  if (style === 'cronus') {
    const wg = J.weapon = joint(J['elbowR'], 0, -FORE - 0.05, 0);
    // cabo de 0,5 m (−0,14 a +0,36 do punho) com cintas de ferro e pomo de ouro; a lâmina em crescente sai do alto do cabo,
    // sobe e se curva para a frente e para baixo (≈ 0,8 m de corda), de adamante escuro com o fio claro por dentro
    mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.5, 10), M.woodDark, 0, 0.11, 0, wg);
    for (const y of [-0.08, 0.1, 0.3]) mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.035, 10), M.iron, 0, y, 0, wg);
    mesh(new THREE.SphereGeometry(0.048, 10, 8), M.gold, 0, -0.16, 0, wg);
    mesh(new THREE.CylinderGeometry(0.046, 0.04, 0.09, 10), M.gold, 0, 0.37, 0, wg);   // encaixe
    // crescente no plano (frente = +x do desenho, cima = +y): costas grossas por fora, fio fino por dentro
    const shape = new THREE.Shape();
    shape.moveTo(-0.035, 0.0); shape.quadraticCurveTo(-0.02, 0.52, 0.34, 0.66); shape.quadraticCurveTo(0.6, 0.72, 0.72, 0.44);
    shape.quadraticCurveTo(0.58, 0.58, 0.36, 0.53); shape.quadraticCurveTo(0.1, 0.44, 0.05, 0.0); shape.closePath();
    const bg = new THREE.ExtrudeGeometry(shape, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.012, bevelSegments: 1, curveSegments: 18 });
    bg.translate(0, 0, -0.013); bg.scale(0.85, 0.85, 1);
    // plano da lâmina = plano (frente, cima) do cabo: o +x do desenho vai para −z (a frente do punho)
    const blade = mesh(bg, M.iron, 0, 0.4, 0, wg); blade.rotation.y = Math.PI / 2 + BLADE_TURN;
    const edge = new THREE.Shape();
    edge.moveTo(0.05, 0.02); edge.quadraticCurveTo(0.1, 0.44, 0.36, 0.53); edge.quadraticCurveTo(0.58, 0.58, 0.72, 0.44);
    edge.quadraticCurveTo(0.56, 0.54, 0.36, 0.49); edge.quadraticCurveTo(0.14, 0.4, 0.085, 0.02); edge.closePath();
    const eg = new THREE.ExtrudeGeometry(edge, { depth: 0.03, bevelEnabled: false, curveSegments: 14 }); eg.translate(0, 0, -0.015); eg.scale(0.85, 0.85, 1);
    const em = mesh(eg, M.mirror ?? M.iron, 0, 0.4, 0, wg); em.rotation.y = Math.PI / 2 + BLADE_TURN;
    thin.push(wg);
  }

  // ---- Oceano: a cauda (refeita a cada pose), nadadeiras e algas nos ombros ----
  let tail = null;
  if (naga) {
    const body = mesh(new THREE.BufferGeometry(), T.tail, 0, 0, 0, rig);
    const dorsal = mesh(new THREE.BufferGeometry(), T.fin, 0, 0, 0, rig);
    const fluke = mesh(new THREE.BufferGeometry(), T.fin, 0, 0, 0, rig);
    tail = { body, dorsal, fluke, R0: 0.19 * g, len: 0.9, waves: 0.7 };
    // a cauda deitada no chão atrás não conta no topo do corpo (a barra de vida fica acima da cabeça, não da ponta)
    thin.push(body, dorsal, fluke);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const w = taperTube(THREE, [[0, 0, 0], [s * 0.02, -0.12, 0.02], [s * 0.03, -0.26 - 0.04 * i, 0.03]], 0.018, 0.005, { tubular: 8, radial: 5 });
      w.scale(1, 1, 0.5); smoothNormals(w);
      mesh(w, T.weed, s * (0.24 + 0.03 * i) * g, 0.54 - 0.03 * i, -0.04 + 0.05 * i, J.torso);
      paintN(THREE, w, (x, y) => mix(0x2a3a1a, 0x60723a, smooth(-0.3, 0, y)));
    }
  }

  // ---- plano do chão que esconde o que está enterrado (ascensão) ----
  const occluder = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), M.occluder);
  occluder.rotation.x = -Math.PI / 2; occluder.position.y = -0.01;
  occluder.renderOrder = -10; occluder.userData.noShadow = true; occluder.castShadow = false; occluder.receiveShadow = false;
  occluder.visible = false;
  group.add(occluder);

  return { group, rig, joints: J, feet, thin, teamParts, flames, chains, flaps, kilt, tail, occluder, P, T, style, naga, k };
}

// ---------------------------------------------------------------------------------------------------------------
// depois da pose: chamas, correntes, abas da tanga, cauda

const _q = { a: null, b: null };
/** Gira o grupo `o` para que o eixo +y dele aponte para cima NO MUNDO (chamas, correntes penduradas). */
function worldUpright(THREE, o) {
  _q.a ??= new THREE.Quaternion(); _q.b ??= new THREE.Quaternion();
  o.parent.getWorldQuaternion(_q.a);
  o.quaternion.copy(_q.a.invert());
}

/** Cor da cauda por vértice pela normal: dorso escuro verde-azulado, flanco com manchas, ventre creme. */
function colorTail(THREE, geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const up = n.getY(i), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let h = up > -0.25 ? mix(0x3f7c78, 0x1f4a52, smooth(-0.1, 0.8, up)) : mix(0xc8d6b8, 0x3f7c78, smooth(-0.85, -0.25, up));
    h = mix(h, 0x173a40, 0.35 * smooth(0.6, 0.75, fbm3(x * 6, y * 6, z * 6)) * smooth(-0.2, 0.3, up));
    c.setHex(mottle(h, 0.05, x, y, z, 14, 3));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/**
 * Cauda do Oceano pela pose: da pelve (a raiz, com a inclinação dela) desce e assenta no chão atrás do corpo; no chão
 * segue um rumo que ondula (`wave`, `amp`, graus) e enrola (`coil`), com o raio afinando até a nadadeira. Tudo no espaço
 * do rig (metros antes da escala). A parte deitada fica no chão mesmo com a raiz erguida (bote); com a raiz abaixo do
 * repouso (ascensão, queda) a cauda desce junto.
 */
function buildTail(THREE, R, pose) {
  const t = R.tail, J = R.joints;
  R.rig.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(R.rig.matrixWorld).invert();
  const root = new THREE.Vector3().setFromMatrixPosition(J.root.matrixWorld).applyMatrix4(inv);
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(J.root.quaternion);
  const sink = Math.min(0, root.y - HIP_Y);   // < 0: a raiz abaixo do repouso (a cauda desce junto)
  const R0 = t.R0;
  const wave = pose.wave ?? 0, amp = ((pose.amp ?? 18) * Math.PI) / 180, coil = pose.coil ?? 0;
  // trecho 1: da pelve até o chão (Bézier: sai na direção da raiz para baixo, chega deitado para trás)
  const P0 = root.clone().addScaledVector(down, 0.05);
  const P1 = P0.clone().addScaledVector(down, Math.max(0.2, (root.y - R0) * 0.55));
  const gy = R0 * 0.9 + sink;
  const P3 = new THREE.Vector3(root.x + down.x * 0.25, gy, root.z + 0.45 + Math.max(0, down.z) * 0.3);
  const P2 = new THREE.Vector3(P3.x, gy + 0.05, P3.z - 0.28);
  const pts = [];
  const bez = (u) => { const a = 1 - u; return new THREE.Vector3().addScaledVector(P0, a * a * a).addScaledVector(P1, 3 * a * a * u).addScaledVector(P2, 3 * a * u * u).addScaledVector(P3, u * u * u); };
  for (let i = 0; i <= 6; i++) pts.push(bez(i / 6));
  // trecho 2: no chão, com o rumo ondulando da frente para trás (o corpo segue o próprio rastro) e enrolando
  const n = 22, ds = t.len / n;
  let x = P3.x, z = P3.z, head = 0;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    head = amp * Math.sin(TAU * (wave - u * t.waves)) * (0.35 + 0.65 * u) + coil * Math.PI * 1.25 * u * u;
    x += Math.sin(head) * ds; z += Math.cos(head) * ds;
    const r = R0 * (1 - 0.86 * Math.pow(u, 1.2));
    pts.push(new THREE.Vector3(x, gy - R0 * 0.9 + r * 0.95, z));
  }
  const N = pts.length, tubular = (N - 1) * 3, radial = 16;
  const rFn = (u) => {
    const idx = u * (N - 1);
    if (idx <= 6) return R0 * (1.05 - 0.05 * idx / 6);
    return R0 * (1 - 0.86 * Math.pow((idx - 6) / (N - 7), 1.2));
  };
  const geo = taperTube(THREE, pts, 0, 0, { tubular, radial, rFn });
  smoothNormals(geo);
  colorTail(THREE, geo);
  t.body.geometry.dispose(); t.body.geometry = geo;
  // nadadeira dorsal: fita de pé sobre o dorso do trecho no chão, recortada em raios
  const curve = new THREE.CatmullRomCurve3(pts);
  const dpos = [], dcol = [], didx = [], c = new THREE.Color();
  const M = 40;
  for (let i = 0; i <= M; i++) {
    const u = 0.3 + 0.6 * (i / M), p = curve.getPointAt(u), r = rFn(u);
    const hgt = 0.11 * Math.sin(Math.PI * (i / M)) * (0.75 + 0.25 * Math.abs(Math.sin(i * 1.7)));
    dpos.push(p.x, p.y + r * 0.8, p.z, p.x, p.y + r * 0.8 + hgt, p.z);
    for (const hex of [0x1e4a4e, 0x6fb0a0]) { c.setHex(hex); dcol.push(c.r, c.g, c.b); }
  }
  for (let i = 0; i < M; i++) { const a = i * 2; didx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(dpos, 3)); dg.setAttribute('color', new THREE.Float32BufferAttribute(dcol, 3)); dg.setIndex(didx);
  dg.computeVertexNormals();
  t.dorsal.geometry.dispose(); t.dorsal.geometry = dg;
  // nadadeira caudal: dois lobos em leque, quase na horizontal (lê de cima, na câmera de 50°)
  const tip = pts[N - 1], prev = pts[N - 3], dir = tip.clone().sub(prev).setY(0).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x);
  const fpos = [], fcol = [], fidx = [];
  const F = 10;
  fpos.push(tip.x, tip.y, tip.z); c.setHex(0x2a5c5e); fcol.push(c.r, c.g, c.b);
  for (let i = 0; i <= F; i++) {
    const a = -1 + 2 * (i / F), notch = 1 - 0.45 * gauss(a / 0.28);
    const L = 0.42 * notch, sp = 0.38 * a;
    const q = tip.clone().addScaledVector(dir, L * Math.cos(sp * 1.2)).addScaledVector(side, L * Math.sin(sp * 1.2) + a * 0.1);
    q.y += 0.06 + 0.05 * Math.abs(a);
    fpos.push(q.x, q.y, q.z); c.setHex(mix(0x6fb0a0, 0x2e6a6a, 0.3 * Math.abs(a))); fcol.push(c.r, c.g, c.b);
  }
  for (let i = 1; i <= F; i++) fidx.push(0, i, i + 1);
  const fgm = new THREE.BufferGeometry();
  fgm.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3)); fgm.setAttribute('color', new THREE.Float32BufferAttribute(fcol, 3)); fgm.setIndex(fidx);
  fgm.computeVertexNormals();
  t.fluke.geometry.dispose(); t.fluke.geometry = fgm;
}

/** Depois de `applyPose` e do giro da direção: chamas (tremulando por quadro), correntes, abas da tanga e a cauda. */
function afterPose(THREE, R, pose, fr) {
  const J = R.joints;
  R.group.updateMatrixWorld(true);
  const fl = pose.flame ?? 1;
  for (const f of R.flames) {
    worldUpright(THREE, f.fg);
    f.fg.updateMatrixWorld(true);
    const seed = f.seed + (fr.frame ?? 0) * 3.7 + (fr.anim === 'attack' ? 40 : fr.anim === 'die' ? 80 : fr.anim === 'rise' ? 120 : 0);
    for (let i = 0; i < f.tongues.length; i++) {
      const t = f.tongues[i];
      const n1 = noise3(seed, i * 1.9, 0.5), n2 = noise3(seed + 5.5, i * 2.3, 1.5), n3 = noise3(seed + 9.1, i * 1.3, 2.5);
      const h = fl * (i === 0 ? 0.9 + 0.3 * n1 : 0.7 + 0.7 * n1);
      t.m.scale.set(fl * (0.85 + 0.3 * n2), Math.max(0.05, h), fl * (0.85 + 0.3 * n3));
      t.m.rotation.set((n2 - 0.5) * 0.7, n1 * 3, (n3 - 0.5) * 0.7);
    }
    f.light.intensity = 0.5 * fl * (0.8 + 0.4 * noise3(seed, 7.7, 3.3));
    f.fg.visible = fl > 0.02;
  }
  for (const ch of R.chains) worldUpright(THREE, ch);
  // abas da tanga: a da frente acompanha a coxa que vai à frente; a de trás, a que vai atrás (sem atravessar)
  if (R.flaps.length) {
    const hl = J.hipL?.rotation.x ?? 0, hr = J.hipR?.rotation.x ?? 0;
    for (const f of R.flaps) f.piv.rotation.x = f.zs < 0 ? Math.max(0, Math.max(hl, hr)) * 0.85 : Math.min(0, Math.min(hl, hr)) * 0.85;
  }
  // o himátion é uma casca rígida presa à pelve: com o corpo deitado (a queda) o pano assenta sobre ele em vez de ficar
  // de pé como um sino — achata na frente/atrás da pelve conforme ela deita
  if (R.kilt) {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(J.root.getWorldQuaternion(new THREE.Quaternion()));
    const lying = Math.min(1, Math.max(0, (1 - Math.abs(up.y) - 0.3) / 0.6));
    R.kilt.scale.set(1, 1, 1 - 0.62 * lying);
  }
  if (R.tail) buildTail(THREE, R, pose);
}

/**
 * Rig de unidade titã para o bake: as poses de art/poses/titan.json (pivôs do humano + escalares da cauda e do fogo).
 * `glide` (Oceano): a cauda segue o próprio rastro — avança um comprimento de onda por onda; no andar a fase vai de 0 a 1.
 */
export function titanUnit(THREE, M, params) {
  const R = buildTitan(THREE, M, params);
  const unit = {
    group: R.group, feet: R.feet, thin: R.thin,
    pose(fr, poses) {
      const def = poses.main?.anims?.[fr.pose];
      if (!def) throw new Error(`pose de titã ${fr.pose} ausente`);
      const p = poseAt(def, fr.frame, fr.frames, JOINTS, SCALARS);
      applyPose(R, p);
      R.group.rotation.y = dirYaw(fr.dir);
      // a ascensão (e só ela) começa enterrada: o plano do chão esconde o que ainda está embaixo
      R.occluder.visible = fr.anim === 'rise';
      afterPose(THREE, R, p, fr);
    },
  };
  if (R.naga) {
    unit.glide = (a, poses) => {
      const def = poses.main?.anims?.[a.pose];
      if (!def) return 0;
      let waves = 0;
      for (let i = 0; i < a.frames; i++) {
        const w0 = poseAt(def, i, a.frames, ['root'], ['wave']).wave ?? 0, w1 = poseAt(def, (i + 1) % a.frames, a.frames, ['root'], ['wave']).wave ?? 0;
        let d = (w1 - w0) % 1; if (d > 0.5) d -= 1; if (d <= -0.5) d += 1;
        waves += d;
      }
      // um comprimento de onda do trecho no chão por onda, na escala do titã (tiles)
      return Math.abs(waves) * (R.tail.len / R.tail.waves) * R.k * M2T;
    };
  }
  return unit;
}
