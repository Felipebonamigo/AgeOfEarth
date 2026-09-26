// Edifícios paramétricos (docs/ART.md §1.8, §4 e Etapa 3). Um "kit" de peças (blocos, colunas, telhados de duas águas,
// andaimes, estandartes, merlões) e um construtor por estilo. Todos modelados em METROS com a origem no CENTRO da área
// ocupada (a posição x/y do edifício no jogo), chão em y = 0, +x = leste, +z = sul (de frente para a câmera).
//
// Estados (nome do quadro `<id>/<estado>[/<variante>]`, docs/ART.md §3.3):
//   build0 / build1 / build2 — obra (< 33 / < 66 / < 100 %): alicerce, meia altura, estrutura sem telhas; andaimes e uma
//                              bandeirola de time mostram de quem é a obra;
//   complete                 — pronto, com estandartes/toldos na máscara de time;
//   damage1 / damage2        — ≥ 33 % / ≥ 66 % da vida perdida: o `complete` com rachaduras, telhas faltando, marcas de
//                              fogo (fuligem), peças caídas e entulho na base (applyDamage, genérico por raios); a fumaça é
//                              partícula no renderizador, não é assada;
//   open                     — portão aberto (só o portão).
// `rubble` (escombros) é um estilo à parte: um quadro por pegada w×h.
//
// Peças especiais marcadas em userData (lidas por bake.js):
//   context  — geometria invisível que só projeta sombra (os vizinhos de uma muralha): a sombra do vizinho cai sobre esta
//              peça como cairia no jogo, e a costura entre peças some;
//   decal    — rachaduras/fuligem/buracos coplanares (não projetam sombra; fora do passe de time);
//   noShadow — não projeta sombra.
// `group.userData.shadowClip = { x0, x1, z0, z1 }` (tiles, ±Infinity = aberto): a sombra projetada no chão é recortada à
// região "dona" da peça (muralhas: a sombra de um trecho contínuo é desenhada uma vez só, sem faixas escuras dobradas).
//
// Sem Math.random: gerador com semente por estilo/estado/variante, então os quadros saem iguais em qualquer rodada.

import { M2T, PITCH_DEG } from './camera.js';
import { ECONOMY_BUILDERS } from './rigs/buildings-economy.js';

/** Estados de todo edifício com arte (o portão tem também `open`). */
export const BUILDING_STATES = ['build0', 'build1', 'build2', 'complete', 'damage1', 'damage2'];

/** Semente inteira a partir de um texto (FNV-1a) e mulberry32 — os mesmos de props.js (cópia: o hash dos edifícios não
 *  depende do arquivo das árvores). */
function seedOf(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Estado → estágio de obra (0–2; 3 = pronto) e nível de dano (0–2). Aceita o `params.stage` antigo (0–3). */
export function stateInfo(params) {
  const state = params.state ?? ['build0', 'build1', 'build2', 'complete'][params.stage ?? 3] ?? 'complete';
  const stage = /^build[0-2]$/.test(state) ? Number(state[5]) : 3;
  const damage = state === 'damage1' ? 1 : state === 'damage2' ? 2 : 0;
  return { state, stage, damage };
}

// =================================================================================================================
// Kit de peças

function makeKit(THREE, M, seed) {
  const group = new THREE.Group();
  const r = new THREE.Group(); r.scale.setScalar(M2T); group.add(r);
  const k = { THREE, M, group, r, rand: rng(seed), breakables: [], debris: null, debrisMats: [M.stone, M.stoneDark] };
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = r) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  k.mesh = mesh;
  /** Caixa pelo centro. */
  k.box = (w, h, d, mat, x = 0, y = 0, z = 0, parent) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  /** Caixa pelos limites (x0..x1, y0..y1, z0..z1). */
  k.block = (x0, x1, y0, y1, z0, z1, mat, parent) => k.box(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, parent);
  /** Cilindro com a base em y0. */
  k.cyl = (rt, rb, h, mat, x, y0, z, seg = 12, parent) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y0 + h / 2, z, parent);
  /** Geometria que só projeta sombra (vizinhos). */
  k.context = (m) => { m.material = M.invisible; m.userData.context = true; m.receiveShadow = false; return m; };
  k.breakable = (m) => { k.breakables.push(m); return m; };

  /** Coluna dórica: fuste levemente afunilado, equino e ábaco. */
  k.column = (x, z, y0, h, rad, mat, capMat = mat, parent) => {
    const shaft = h - 0.22;
    k.cyl(rad * 0.84, rad, shaft, mat, x, y0, z, 14, parent);
    k.cyl(rad * 1.25, rad * 0.9, 0.12, capMat, x, y0 + shaft, z, 14, parent);
    k.box(rad * 2.6, 0.1, rad * 2.6, capMat, x, y0 + shaft + 0.17, z, parent);
  };

  /**
   * Telhado de duas águas com a cumeeira ao longo de `axis` ('z' = frontões norte/sul, como o templo; 'x' = empenas
   * leste/oeste). `w` = largura entre beirais (perpendicular à cumeeira), `len` = comprimento, `y` = altura do beiral,
   * `rise` = altura da cumeeira acima do beiral. `ped` = material dos frontões (null = sem frontão). `frame` = só a
   * estrutura de caibros (obra).
   */
  k.gable = ({ cx = 0, cz = 0, axis = 'z', w, len, y, rise, roof = M.terracotta, rows = M.terracottaDark, ped = null, pedDark = null, nRows = 7, frame = false, parent = r }) => {
    const g = new THREE.Group(); g.position.set(cx, y, cz); if (axis === 'x') g.rotation.y = Math.PI / 2; parent.add(g);
    const halfW = w / 2, slope = Math.sqrt(halfW * halfW + rise * rise), ang = Math.atan2(rise, halfW);
    if (frame) {
      const n = Math.max(3, Math.round(len / 0.9));
      for (let i = 0; i <= n; i++) {
        const z = -len / 2 + 0.1 + i * ((len - 0.2) / n);
        for (const s of [-1, 1]) { const b = k.box(slope, 0.08, 0.08, M.wood, s * halfW / 2, rise / 2, z, g); b.rotation.z = -s * ang; }
      }
      k.box(0.1, 0.1, len, M.wood, 0, rise, 0, g);
      for (const s of [-1, 1]) k.box(0.08, 0.08, len, M.wood, s * halfW * 0.5, rise * 0.5 + 0.06, 0, g);   // terças
      return g;
    }
    if (ped) {
      const tri = new THREE.Shape(); tri.moveTo(-halfW, 0); tri.lineTo(halfW, 0); tri.lineTo(0, rise); tri.closePath();
      mesh(new THREE.ExtrudeGeometry(tri, { depth: len - 0.02, bevelEnabled: false }), ped, 0, 0.001, -len / 2 + 0.01, g);
      if (pedDark) mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.05, bevelEnabled: false }), pedDark, 0, 0.03, len / 2 - 0.03, g).scale.set(0.8, 0.7, 1);
    }
    for (const s of [-1, 1]) {
      const slab = k.box(slope + 0.25, 0.1, len + 0.3, roof, s * halfW / 2, rise / 2 + 0.05, 0, g);
      slab.rotation.z = -s * ang;
      for (let i = 1; i < nRows; i++) k.box(0.05, 0.05, len + 0.3, rows, -slope / 2 + (i * slope) / nRows, 0.07, 0, slab);
      slab.userData.roof = true;
    }
    k.box(0.16, 0.12, len + 0.3, rows, 0, rise + 0.05, 0, g);
    return g;
  };

  /** Telhado de uma água (alpendre): do beiral alto (z = zHigh, y = yHigh) ao baixo (zLow, yLow), largura em x. */
  k.shed = ({ x0, x1, zHigh, zLow, yHigh, yLow, roof = M.terracotta, rows = M.terracottaDark, nRows = 5, frame = false }) => {
    const dz = zLow - zHigh, dy = yLow - yHigh, L = Math.sqrt(dz * dz + dy * dy), ang = Math.atan2(-dy, Math.abs(dz));
    const g = new THREE.Group(); g.position.set((x0 + x1) / 2, (yHigh + yLow) / 2 + 0.06, (zHigh + zLow) / 2); g.rotation.x = Math.sign(dz) * ang; r.add(g);
    if (frame) {
      const n = Math.max(3, Math.round((x1 - x0) / 0.9));
      for (let i = 0; i <= n; i++) k.box(0.08, 0.08, L + 0.2, M.wood, -(x1 - x0) / 2 + 0.1 + (i * (x1 - x0 - 0.2)) / n, 0, 0, g);
      return g;
    }
    const slab = k.box(x1 - x0 + 0.2, 0.1, L + 0.3, roof, 0, 0, 0, g);
    slab.userData.roof = true;
    for (let i = 1; i < nRows; i++) k.box(x1 - x0 + 0.2, 0.05, 0.05, rows, 0, 0.07, -L / 2 + (i * L) / nRows, g);
    return g;
  };

  /** Telhado de uma água com o caimento ao longo de x (alas de pórtico): do beiral alto (xHigh, yHigh) ao baixo. */
  k.shedX = ({ z0, z1, xHigh, xLow, yHigh, yLow, roof = M.terracotta, rows = M.terracottaDark, nRows = 4, frame = false }) => {
    const dx = xLow - xHigh, dy = yLow - yHigh, L = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(-dy, Math.abs(dx));
    const g = new THREE.Group(); g.position.set((xHigh + xLow) / 2, (yHigh + yLow) / 2 + 0.06, (z0 + z1) / 2); g.rotation.z = -Math.sign(dx) * ang; r.add(g);
    if (frame) {
      const n = Math.max(3, Math.round((z1 - z0) / 0.9));
      for (let i = 0; i <= n; i++) k.box(L + 0.2, 0.08, 0.08, M.wood, 0, 0, -(z1 - z0) / 2 + 0.1 + (i * (z1 - z0 - 0.2)) / n, g);
      return g;
    }
    const slab = k.box(L + 0.3, 0.1, z1 - z0 + 0.2, roof, 0, 0, 0, g);
    slab.userData.roof = true;
    for (let i = 1; i < nRows; i++) k.box(0.05, 0.05, z1 - z0 + 0.2, rows, -L / 2 + (i * L) / nRows, 0.07, 0, g);
    return g;
  };

  /** Quatro paredes (espessura T) do retângulo [x0,x1]×[z0,z1] de y0 até y0 + h; `door` = [x0, x1, altura] na parede sul. */
  k.room = (x0, x1, z0, z1, y0, h, T, mat, door = null) => {
    if (h <= 0) return;
    k.block(x0, x1, y0, y0 + h, z0, z0 + T, mat);
    k.block(x0, x0 + T, y0, y0 + h, z0 + T, z1 - T, mat);
    k.block(x1 - T, x1, y0, y0 + h, z0 + T, z1 - T, mat);
    if (!door) { k.block(x0, x1, y0, y0 + h, z1 - T, z1, mat); return; }
    const [d0, d1, dh] = door;
    k.block(x0, d0, y0, y0 + h, z1 - T, z1, mat); k.block(d1, x1, y0, y0 + h, z1 - T, z1, mat);
    if (h > dh) k.block(d0, d1, y0 + dh, y0 + h, z1 - T, z1, mat);
  };

  /** Andaime em volta do retângulo [x0,x1]×[z0,z1] até a altura h, com tábuas, travas na face sul e bandeirola de time. */
  k.scaffold = ({ x0, x1, z0, z1, h, pennant = true }) => {
    const nx = Math.max(1, Math.round((x1 - x0) / 1.9)), nz = Math.max(1, Math.round((z1 - z0) / 1.9));
    const posts = [];
    for (let i = 0; i <= nx; i++) { const x = x0 + (i * (x1 - x0)) / nx; posts.push([x, z1], [x, z0]); }
    for (let j = 1; j < nz; j++) { const z = z0 + (j * (z1 - z0)) / nz; posts.push([x0, z], [x1, z]); }
    for (const [x, z] of posts) k.cyl(0.04, 0.05, h, M.wood, x, 0, z, 6);
    for (let y = 1.1; y < h; y += 1.1) {
      k.box(x1 - x0 + 0.1, 0.05, 0.18, M.wood, (x0 + x1) / 2, y, z1); k.box(x1 - x0 + 0.1, 0.05, 0.18, M.wood, (x0 + x1) / 2, y, z0);
      k.box(0.18, 0.05, z1 - z0 + 0.1, M.wood, x0, y, (z0 + z1) / 2); k.box(0.18, 0.05, z1 - z0 + 0.1, M.wood, x1, y, (z0 + z1) / 2);
    }
    const bh = Math.min(h, 2.2);
    for (let i = 0; i < nx; i++) { const b = k.box(0.04, bh * 1.2, 0.04, M.woodDark, x0 + ((i + 0.5) * (x1 - x0)) / nx, bh / 2, z1 + 0.05); b.rotation.z = 0.7; }
    if (pennant) {
      k.cyl(0.03, 0.03, 0.9, M.wood, x0, h, z1, 6);
      k.box(0.45, 0.28, 0.03, M.team, x0 + 0.25, h + 0.72, z1);
    }
  };

  /** Pilha de material de obra (blocos e toras) em (x, z). */
  k.pile = (x, z, mat = M.limestone) => {
    k.box(0.6, 0.35, 0.4, mat, x, 0.175, z); k.box(0.5, 0.3, 0.38, mat, x + 0.1, 0.5, z - 0.02).rotation.y = 0.2;
    for (let i = 0; i < 3; i++) k.cyl(0.07, 0.07, 1.1, M.wood, x - 0.65, 0.07 + i * 0.13, z + 0.15 - i * 0.05, 7).rotation.z = Math.PI / 2;
  };

  /** Estandarte de time: mastro, pano (máscara de time) e remate dourado. `side` = lado para onde o pano pende. */
  k.banner = (x, z, h = 2.4, side = 1, cloth = [0.5, 0.8]) => {
    k.cyl(0.035, 0.04, h, M.wood, x, 0, z, 8);
    k.box(cloth[0], cloth[1], 0.03, M.team, x + side * (cloth[0] / 2 + 0.02), h - 0.45 - cloth[1] / 2 + 0.4, z);
    k.mesh(new THREE.SphereGeometry(0.06, 8, 6), M.gold, x, h + 0.03, z);
  };

  /** Ânfora de terracota. */
  k.amphora = (x, z, s = 1) => {
    k.mesh(new THREE.SphereGeometry(0.16 * s, 10, 8), M.terracotta, x, 0.2 * s, z).scale.set(1, 1.5, 1);
    k.cyl(0.05 * s, 0.07 * s, 0.14 * s, M.terracotta, x, 0.42 * s, z, 8);
  };
  return k;
}

// =================================================================================================================
// Dano genérico: rachaduras, fuligem, buracos no telhado, peças quebradas e entulho na base

let sootTex = null;
/** Textura de mancha de fuligem (radial com ruído), gerada uma vez com semente fixa. */
function sootTexture(THREE) {
  if (sootTex) return sootTex;
  const N = 64, data = new Uint8Array(N * N * 4), rnd = rng(seedOf('soot'));
  const noise = Array.from({ length: 64 }, () => rnd());
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x + 0.5) / N * 2 - 1, dy = (y + 0.5) / N * 2 - 1, d = Math.sqrt(dx * dx + dy * dy);
    const a = Math.atan2(dy, dx), wob = 0.82 + 0.18 * noise[Math.floor(((a + Math.PI) / (2 * Math.PI)) * 63.999)];
    const t = Math.min(1, Math.max(0, (d / wob - 0.3) / 0.7));
    const al = (1 - t * t * (3 - 2 * t)) * (0.8 + 0.2 * noise[(x * 7 + y * 13) & 63]);
    const i = (y * N + x) * 4; data[i] = 24; data[i + 1] = 20; data[i + 2] = 17; data[i + 3] = Math.round(255 * al);
  }
  sootTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  sootTex.colorSpace = THREE.SRGBColorSpace; sootTex.minFilter = THREE.LinearFilter; sootTex.magFilter = THREE.LinearFilter; sootTex.needsUpdate = true;
  return sootTex;
}

let holeTex = null;
/** Recorte de buraco no telhado: contorno irregular (borda recortada, sem gradiente), marrom-escuro por dentro. */
function holeTexture(THREE) {
  if (holeTex) return holeTex;
  const N = 64, data = new Uint8Array(N * N * 4), rnd = rng(seedOf('hole'));
  const noise = Array.from({ length: 24 }, () => rnd());
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x + 0.5) / N * 2 - 1, dy = (y + 0.5) / N * 2 - 1, d = Math.sqrt(dx * dx + dy * dy);
    const a = Math.atan2(dy, dx), f = ((a + Math.PI) / (2 * Math.PI)) * 24, i0 = Math.floor(f) % 24, i1 = (i0 + 1) % 24, t = f - Math.floor(f);
    const edge = 0.62 + 0.3 * (noise[i0] * (1 - t) + noise[i1] * t);
    const al = Math.min(1, Math.max(0, (edge - d) * 20));
    const i = (y * N + x) * 4; data[i] = 46; data[i + 1] = 32; data[i + 2] = 23; data[i + 3] = Math.round(255 * al);
  }
  holeTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  holeTex.colorSpace = THREE.SRGBColorSpace; holeTex.minFilter = THREE.LinearFilter; holeTex.magFilter = THREE.LinearFilter; holeTex.needsUpdate = true;
  return holeTex;
}

const WALL_MATS = ['marble', 'marbleDark', 'limestone', 'limestoneDark', 'plaster', 'plasterDark', 'stone', 'stoneDark', 'stoneWarm', 'stoneLight', 'ashlar', 'ashlar2', 'ashlarDark'];
const ROOF_MATS = ['terracotta', 'terracottaDark'];

/**
 * Aplica o dano `level` (1 ou 2) ao modelo pronto: remove parte das peças quebráveis (merlões, acrotérios), lança raios
 * na direção da câmera para achar paredes e telhados visíveis e cola nelas rachaduras, manchas de fuligem e buracos com
 * ripas à mostra (cada decalque só entra se os quatro cantos caem na mesma superfície: nada pendurado no ar), e espalha
 * entulho (e, no nível 2, uma viga queimada e marcas de queimado no chão) em volta da base.
 */
function applyDamage(k, level) {
  const { THREE, M, group, rand } = k;
  const matName = new Map(Object.entries(M).map(([n, m]) => [m, n]));
  // 1) peças quebráveis: some uma fração, e um pedaço delas vai para o chão
  const nBreak = Math.round(k.breakables.length * (level === 1 ? 0.15 : 0.45));
  const order = k.breakables.map((m) => ({ m, s: rand() })).sort((a, b) => a.s - b.s);
  for (let i = 0; i < nBreak; i++) order[i].m.parent?.remove(order[i].m);
  group.updateMatrixWorld(true);

  const solids = [];
  group.traverse((o) => { if (o.isMesh && !o.userData.context && !o.userData.decal && !o.material?.userData?.team) solids.push(o); });
  if (!solids.length) return;
  const bb = new THREE.Box3(); for (const s of solids) bb.expandByObject(s);
  const pitch = (PITCH_DEG * Math.PI) / 180;
  const view = new THREE.Vector3(0, -Math.sin(pitch), -Math.cos(pitch));        // direção do olhar da câmera do bake
  const upS = new THREE.Vector3(0, Math.cos(pitch), -Math.sin(pitch));           // "para cima" na tela
  const right = new THREE.Vector3(1, 0, 0);
  const center = bb.getCenter(new THREE.Vector3());
  let v0 = Infinity, v1 = -Infinity;
  for (const cx of [bb.min.x, bb.max.x]) for (const cy of [bb.min.y, bb.max.y]) for (const cz of [bb.min.z, bb.max.z]) {
    const v = new THREE.Vector3(cx, cy, cz).sub(center).dot(upS); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const ray = new THREE.Raycaster();
  const cast = (p) => { ray.set(p.clone().addScaledVector(view, -40), view); return ray.intersectObjects(solids, false)[0] ?? null; };
  const at = (u, v) => center.clone().addScaledVector(right, u).addScaledVector(upS, v);
  /** Base (t1 horizontal, t2 "para cima" na superfície) de um ponto atingido. */
  const basis = (h) => {
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    let t1 = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0));
    if (t1.lengthSq() < 1e-4) t1 = new THREE.Vector3(1, 0, 0); else t1.normalize();
    let t2 = new THREE.Vector3().crossVectors(t1, n).normalize();
    if (t2.y < 0 || (Math.abs(t2.y) < 1e-3 && t2.z > 0)) t2.negate();
    return { n, t1, t2 };
  };
  /** Todos os cantos do retângulo (centro p, meias-medidas a·t1, b·t2) caem na superfície (sem pendurar no ar)? */
  const fits = (p, t1, t2, a, b) => {
    for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
      const c = p.clone().addScaledVector(t1, sa * a).addScaledVector(t2, sb * b);
      const h = cast(c);
      if (!h || Math.abs(h.point.clone().sub(c).dot(view)) > 0.012) return false;
    }
    return true;
  };
  const place = (geo, mat, p, bs, lift = 0.0015) => {
    const m = new THREE.Mesh(geo, mat);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(bs.t1, bs.t2, bs.n));
    m.position.copy(p).addScaledVector(bs.n, lift);
    m.userData.decal = true; m.userData.noShadow = true; m.castShadow = false; m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const decal = (opts) => new THREE.MeshStandardMaterial({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...opts });
  const sootMats = [0.38, 0.52, 0.66].map((o) => decal({ map: sootTexture(THREE), transparent: true, depthWrite: false, opacity: o }));
  const crackMat = decal({ color: 0x221a14 });
  const holeMat = decal({ map: holeTexture(THREE), transparent: true, depthWrite: false });
  const T = M2T;   // metros → tiles (os decalques vão no grupo externo, em tiles)

  // quantidade proporcional ao tamanho (uma torre 1×1 leva ~1/3 do que leva um templo 3×3)
  const size = Math.min(1.3, Math.max(0.35, (bb.max.x - bb.min.x) / 3));
  const n = (v) => Math.max(1, Math.round(v * size));
  const want = level === 1 ? { soot: n(2), crack: n(4), hole: n(2), streak: level === 1 ? 0 : 1 } : { soot: n(4), crack: n(7), hole: n(5), streak: n(3) };
  const done = { soot: 0, crack: 0, hole: 0, streak: 0 };
  for (let tries = 0; tries < 400; tries++) {
    const h = cast(at(bb.min.x + rand() * (bb.max.x - bb.min.x), v0 + rand() * (v1 - v0)));
    if (!h) continue;
    const name = matName.get(h.object.material) ?? '';
    const bs = basis(h);
    const rel = (h.point.y - bb.min.y) / Math.max(1e-6, bb.max.y - bb.min.y);
    if (ROOF_MATS.includes(name) && done.hole < want.hole) {
      const a = (0.3 + rand() * 0.25) * T, b = (0.24 + rand() * 0.18) * T;
      if (!fits(h.point, bs.t1, bs.t2, a * 0.7, b * 0.7)) continue;
      place(new THREE.PlaneGeometry(2 * a, 2 * b), holeMat, h.point, bs);
      for (const s of [-0.4, 0.05, 0.45]) {   // ripas de madeira à mostra atravessando o buraco
        const g = new THREE.BoxGeometry(2 * a * (0.8 + rand() * 0.3), 0.08 * T, 0.04 * T);
        const m = place(g, M.wood, h.point.clone().addScaledVector(bs.t2, s * b).addScaledVector(bs.t1, (rand() - 0.5) * a * 0.3), bs, 0.015 * T);
        m.rotateZ((rand() - 0.5) * 0.25);
      }
      for (let i = 0; i < 3; i++) {   // telhas soltas em volta
        const q = h.point.clone().addScaledVector(bs.t1, (rand() - 0.5) * a * 2.6).addScaledVector(bs.t2, (rand() < 0.5 ? -1 : 1) * b * (0.9 + rand() * 0.4));
        if (!fits(q, bs.t1, bs.t2, 0.08 * T, 0.06 * T)) continue;
        const m = place(new THREE.BoxGeometry(0.2 * T, 0.14 * T, 0.03 * T), rand() < 0.5 ? M.terracottaDark : M.terracotta, q, bs, 0.02 * T);
        m.rotateZ((rand() - 0.5) * 1.2);
      }
      done.hole++;
    } else if (WALL_MATS.includes(name) && Math.abs(bs.n.y) < 0.5) {
      if (done.crack < want.crack && rand() < 0.55) {
        // rachadura: polilinha em zigue-zague descendo pela parede
        let p = h.point.clone(); let ok = true; const segs = [];
        const n = 3 + Math.floor(rand() * 3);
        for (let i = 0; i < n; i++) {
          const len = (0.16 + rand() * 0.18) * T, ang = -Math.PI / 2 + (rand() - 0.5) * 1.6;
          const dir = bs.t1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(bs.t2, Math.sin(ang));
          const mid = p.clone().addScaledVector(dir, len / 2);
          const t1 = dir.clone(), t2 = new THREE.Vector3().crossVectors(bs.n, t1).normalize();
          if (!fits(mid, t1, t2, len / 2, 0.02 * T)) { ok = false; break; }
          segs.push({ mid, t1, t2, len, w: Math.max(0.035, 0.075 - i * 0.01) * T });
          p = p.clone().addScaledVector(dir, len);
        }
        if (!ok || !segs.length) continue;
        for (const s of segs) place(new THREE.PlaneGeometry(s.len * 1.08, s.w), crackMat, s.mid, { n: bs.n, t1: s.t1, t2: s.t2 });
        done.crack++;
      } else if (done.streak < want.streak && rel > 0.35 && rand() < 0.5) {
        // marca de fogo: fuligem alongada subindo pela parede
        const a = (0.22 + rand() * 0.15) * T, b = (0.45 + rand() * 0.35) * T;
        const c = h.point.clone().addScaledVector(bs.t2, b * 0.6);
        if (!fits(c, bs.t1, bs.t2, a * 0.8, b * 0.8)) continue;
        place(new THREE.PlaneGeometry(2 * a, 2 * b), sootMats[2], c, bs, 0.002);
        done.streak++;
      } else if (done.soot < want.soot) {
        const s = (0.28 + rand() * 0.3) * T;
        if (!fits(h.point, bs.t1, bs.t2, s * 0.75, s * 0.75)) continue;
        place(new THREE.PlaneGeometry(2 * s, 2 * s * 0.8), sootMats[Math.floor(rand() * 2)], h.point, bs, 0.0025);
        done.soot++;
      }
    }
    if (done.soot >= want.soot && done.crack >= want.crack && done.hole >= want.hole && done.streak >= want.streak) break;
  }

  // 2) entulho na base (lados sul e leste, os visíveis) e, no nível 2, viga queimada e queimado no chão
  const area = k.debris ?? { x0: bb.min.x / T, x1: bb.max.x / T, z0: bb.min.z / T, z1: bb.max.z / T };
  const nChunks = Math.round((level === 1 ? 4 : 9) * Math.min(2.2, Math.max(0.5, ((area.x1 - area.x0) + (area.z1 - area.z0)) / 8)));
  for (let i = 0; i < nChunks; i++) {
    const side = rand();
    let x, z;
    if (side < 0.55) { x = area.x0 + rand() * (area.x1 - area.x0); z = area.z1 + (rand() - 0.25) * 0.5; }
    else if (side < 0.8) { x = area.x1 + (rand() - 0.25) * 0.5; z = area.z0 + rand() * (area.z1 - area.z0); }
    else { x = area.x0 - (rand() - 0.25) * 0.4; z = area.z0 + rand() * (area.z1 - area.z0); }
    const s = 0.08 + rand() * (level === 1 ? 0.14 : 0.2);
    const roofShard = rand() < 0.3;
    const geo = roofShard ? new THREE.BoxGeometry(s * 2, 0.05, s * 1.4) : new THREE.IcosahedronGeometry(s, 0);
    const m = k.mesh(geo, roofShard ? M.terracotta : k.debrisMats[Math.floor(rand() * k.debrisMats.length)], x, roofShard ? 0.03 : s * 0.55, z);
    m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    if (roofShard) m.rotation.set((rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4);
  }
  if (level === 2) {
    const bx = area.x0 + (area.x1 - area.x0) * (0.3 + rand() * 0.4), bz = area.z1 + 0.15;
    const beam = k.cyl(0.07, 0.08, Math.min(1.4, (area.x1 - area.x0) * 0.45), M.char, bx, 0, bz, 7);
    beam.rotation.set(0.1, rand() * 0.8 - 0.4, Math.PI / 2); beam.position.y = 0.1;
    for (let i = 0; i < Math.max(1, Math.round(2 * size)); i++) {   // queimado no chão, na frente
      const s = (0.5 + rand() * 0.4) * T * Math.max(0.6, size);
      const gm = new THREE.Mesh(new THREE.PlaneGeometry(2 * s, 2 * s), sootMats[0]);
      gm.rotation.x = -Math.PI / 2;
      gm.position.set((area.x0 + (area.x1 - area.x0) * (0.2 + rand() * 0.6)) * T, 0.004, (area.z1 + 0.1) * T);
      gm.userData.decal = true; gm.userData.noShadow = true; gm.castShadow = false;
      group.add(gm);
    }
  }
}

// =================================================================================================================
// Estilos

const BUILDERS = {};
Object.assign(BUILDERS, ECONOMY_BUILDERS);   // lote "economia": fazenda, celeiro, serraria, mina, mercado, academia, cornucópia

// ---- Templo 3×3 (6×6 m): estilóbato de 3 degraus, 20 colunas, cela, frontão ao sul, telhado de terracota ----
BUILDERS.temple = (k, p) => {
  const { THREE, M, mesh, box } = k;
  const stage = p.stage;
  k.debris = { x0: -3, x1: 3, z0: -3, z1: 3 };
  k.debrisMats = [M.marble, M.marbleDark];
  box(6.0, 0.15, 6.0, M.marbleDark, 0, 0.075, 0);
  if (stage >= 1) { box(5.6, 0.15, 5.6, M.marble, 0, 0.225, 0); box(5.2, 0.15, 5.2, M.marble, 0, 0.375, 0); }
  else { box(5.6, 0.15, 3.2, M.marble, 0, 0.225, -1.2); }
  const base = stage >= 1 ? 0.45 : 0.3;
  const colH = 2.4;
  const colFrac = [0.22, 0.55, 1, 1][stage];
  const cols = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { if (i > 0 && i < 5 && j > 0 && j < 5) continue; cols.push([-2.25 + i * 0.9, -2.25 + j * 0.9]); }
  cols.forEach(([x, z], n) => {
    if (stage === 0 && z > 0.5 && n % 2) return;
    const h = colH * colFrac;
    mesh(new THREE.CylinderGeometry(0.15, 0.18, h, 14), M.marble, x, base + h / 2, z);
    if (stage >= 2) {
      mesh(new THREE.CylinderGeometry(0.21, 0.16, 0.12, 14), M.marble, x, base + colH - 0.02, z);
      box(0.42, 0.1, 0.42, M.marble, x, base + colH + 0.05, z);
    }
  });
  const cellaH = colH * [0.15, 0.5, 1, 1][stage];
  box(3.0, cellaH, 3.9, M.marble, 0, base + cellaH / 2, -0.15);
  if (stage >= 2) box(0.8, 1.7, 0.08, M.woodDark, 0, base + 0.85, 1.83);
  const top = base + colH + 0.1;
  if (stage >= 2) {
    box(5.3, 0.26, 5.3, M.marble, 0, top + 0.13, 0);
    box(5.32, 0.2, 5.32, M.marbleDark, 0, top + 0.36, 0);
    for (let i = 0; i < 12; i++) box(0.1, 0.16, 0.04, M.marble, -2.48 + i * 0.45, top + 0.36, 2.67);
  }
  const eaves = top + 0.46;
  const roofH = 1.05, halfW = 2.75, len = 5.7;
  if (stage === 2) {
    const slope = Math.sqrt(halfW * halfW + roofH * roofH), ang = Math.atan2(roofH, halfW);
    for (let n = 0; n < 7; n++) {
      const z = -len / 2 + 0.2 + n * ((len - 0.4) / 6);
      for (const s of [-1, 1]) { const b = box(slope, 0.08, 0.08, M.wood, s * halfW / 2, eaves + roofH / 2, z); b.rotation.z = -s * ang; }
    }
    box(0.1, 0.1, len, M.wood, 0, eaves + roofH, 0);
  }
  if (stage === 3) {
    const tri = new THREE.Shape(); tri.moveTo(-halfW, 0); tri.lineTo(halfW, 0); tri.lineTo(0, roofH); tri.closePath();
    mesh(new THREE.ExtrudeGeometry(tri, { depth: len, bevelEnabled: false }), M.marble, 0, eaves, -len / 2);
    mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.06, bevelEnabled: false }), M.marbleDark, 0, eaves + 0.02, len / 2 - 0.02).scale.set(0.82, 0.72, 1);
    const slope = Math.sqrt(halfW * halfW + roofH * roofH), ang = Math.atan2(roofH, halfW);
    for (const s of [-1, 1]) {
      const slab = box(slope + 0.25, 0.1, len + 0.3, M.terracotta, s * halfW / 2, eaves + roofH / 2 + 0.05, 0);
      slab.rotation.z = -s * ang;
      for (let n = 1; n < 7; n++) box(0.05, 0.05, len + 0.3, M.terracottaDark, -slope / 2 + n * slope / 7, 0.07, 0, slab);
    }
    box(0.16, 0.12, len + 0.3, M.terracottaDark, 0, eaves + roofH + 0.05, 0);
    box(5.4, 0.12, 0.22, M.marbleDark, 0, eaves - 0.02, len / 2 + 0.06);
    for (const s of [-1, 1]) {
      const x = s * 1.1, z = 2.95;
      mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.4, 8), M.wood, x, 1.2, z);
      box(0.5, 0.8, 0.03, M.team, x + s * 0.27, 1.95, z);
      mesh(new THREE.SphereGeometry(0.06, 8, 6), M.gold, x, 2.43, z);
    }
    // acrotérios (quebráveis no dano) nos cantos do frontão sul
    for (const s of [-1, 0, 1]) k.breakable(mesh(new THREE.ConeGeometry(0.1, 0.3, 6), M.marble, s * (s ? 2.6 : 1), eaves + (s ? 0.15 : roofH + 0.2), len / 2 + 0.05));
  }
  if (stage <= 2) {
    const sh = [1.3, 2.4, 3.6][stage];
    const posts = [];
    for (let i = 0; i < 4; i++) posts.push([-2.85 + i * 1.9, 2.95], [-2.85 + i * 1.9, -2.95]);
    for (const zz of [-1, 1]) posts.push([-2.95, zz * 0.95], [2.95, zz * 0.95]);
    for (const [x, z] of posts) mesh(new THREE.CylinderGeometry(0.04, 0.05, sh, 6), M.wood, x, sh / 2, z);
    for (let lvl = 1; lvl * 1.1 < sh; lvl++) {
      const y = lvl * 1.1;
      box(5.9, 0.05, 0.25, M.wood, 0, y, 2.95); box(5.9, 0.05, 0.25, M.wood, 0, y, -2.95);
      box(0.25, 0.05, 5.9, M.wood, -2.95, y, 0); box(0.25, 0.05, 5.9, M.wood, 2.95, y, 0);
    }
    for (let i = 0; i < 3; i++) { const b = box(0.04, Math.min(sh, 2.2) * 1.2, 0.04, M.woodDark, -1.9 + i * 1.9, Math.min(sh, 2.2) / 2, 3.0); b.rotation.z = 0.7; }
    box(0.6, 0.4, 0.4, M.marble, 2.2, 0.2, 3.5); box(0.5, 0.35, 0.4, M.marbleDark, 1.5, 0.175, 3.6);
    if (stage === 0) { box(0.7, 0.4, 0.45, M.marble, -2.0, 0.2, 3.5); mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.8, 12), M.marble, 2.4, 0.17, 1.5).rotation.z = Math.PI / 2; }
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), M.wood, -2.85, sh + 0.45, 2.95);
    box(0.45, 0.28, 0.03, M.team, -2.6, sh + 0.72, 2.95);
  }
};

// ---- Casa 2×2 (4×4 m): soco de pedra, paredes de reboco, telhado de duas águas (empenas leste/oeste), porta ao sul
//      com toldo de time, janela com postigo, ânforas e um banco ----
BUILDERS.house = (k, p) => {
  const { M, box, block } = k;
  const st = p.stage;
  k.debris = { x0: -1.8, x1: 1.8, z0: -1.6, z1: 1.5 };
  k.debrisMats = [M.plaster, M.stoneWarm, M.plasterDark];
  const x0 = -1.65, x1 = 1.65, z0 = -1.55, z1 = 1.2;       // paredes
  block(x0 - 0.1, x1 + 0.1, 0, 0.3, z0 - 0.1, z1 + 0.1, M.stoneWarm);    // soco
  const wallH = 2.25, base = 0.3;
  const h = wallH * [0.22, 0.6, 1, 1][st];
  const T = 0.22;   // espessura
  // paredes: sul com vão da porta (x -0.95..-0.15) e da janela (0.55..1.05, y 1.0..1.6)
  const doorX0 = -0.95, doorX1 = -0.15, doorH = 1.75, winX0 = 0.55, winX1 = 1.1, winY0 = 1.0, winY1 = 1.55;
  const wall = M.plaster;
  block(x0, x1, base, base + h, z0, z0 + T, wall);                          // norte
  block(x0, x0 + T, base, base + h, z0, z1, wall);                          // oeste
  block(x1 - T, x1, base, base + h, z0, z1, wall);                          // leste
  // sul (com vãos)
  block(x0, doorX0, base, base + h, z1 - T, z1, wall);
  block(doorX1, winX0, base, base + h, z1 - T, z1, wall);
  block(winX1, x1, base, base + h, z1 - T, z1, wall);
  block(winX0, winX1, base, base + Math.min(h, winY0), z1 - T, z1, wall);
  if (h > winY1) block(winX0, winX1, base + winY1, base + h, z1 - T, z1, wall);
  if (h > doorH) block(doorX0, doorX1, base + doorH, base + h, z1 - T, z1, wall);
  // interior escuro visto pelos vãos
  block(x0 + T, x1 - T, base, base + 0.02, z0 + T, z1 - T, M.woodDark);
  if (st >= 1) {
    block(doorX0 - 0.06, doorX1 + 0.06, base + Math.min(h, doorH), base + Math.min(h, doorH) + 0.1, z1 - T - 0.02, z1 + 0.04, M.wood);   // verga
    box(0.05, 0.5, 0.05, M.woodDark, (winX0 + winX1) / 2, base + (winY0 + winY1) / 2, z1 - 0.02);
    block(winX0 - 0.05, winX1 + 0.05, base + winY0 - 0.06, base + winY0, z1 - T, z1 + 0.05, M.limestone);   // peitoril
  }
  if (st >= 2) {
    block(doorX0 + 0.04, doorX1 - 0.04, base, base + doorH - 0.02, z1 - T + 0.06, z1 - T + 0.1, M.woodDark);   // porta
    const shutter = block(winX1 + 0.02, winX1 + 0.3, base + winY0, base + winY1, z1 + 0.02, z1 + 0.06, M.wood);   // postigo aberto
    shutter.rotation.y = -0.3;
    // barrote de reboco no topo (cinta) e cabeças de caibro sob o beiral
    block(x0 - 0.03, x1 + 0.03, base + wallH - 0.12, base + wallH, z0 - 0.03, z1 + 0.03, M.plasterDark);
    for (let i = 0; i < 8; i++) box(0.08, 0.08, 0.2, M.woodDark, x0 + 0.2 + i * ((x1 - x0 - 0.4) / 7), base + wallH - 0.05, z1 + 0.12);
  }
  const eaves = base + wallH, cz = (z0 + z1) / 2;
  if (st === 2) k.gable({ cx: 0, cz, axis: 'x', w: z1 - z0 + 0.5, len: x1 - x0 + 0.3, y: eaves, rise: 0.95, frame: true });
  if (st === 3) {
    // empenas (leste/oeste) em reboco sob o telhado; telhado com beirais
    k.gable({ cx: 0, cz, axis: 'x', w: z1 - z0 + 0.55, len: x1 - x0 + 0.25, y: eaves, rise: 0.95, ped: M.plaster, nRows: 6 });
    // toldo de time sobre a porta (máscara de time) em dois esteios
    const aw = k.shed({ x0: doorX0 - 0.25, x1: doorX1 + 0.25, zHigh: z1, zLow: z1 + 0.75, yHigh: base + 2.05, yLow: base + 1.8, roof: M.team, rows: M.team, nRows: 1 });
    aw.children.forEach((c) => { c.scale.y = 0.4; });
    for (const x of [doorX0 - 0.2, doorX1 + 0.2]) k.cyl(0.03, 0.03, base + 1.8, M.wood, x, 0, z1 + 0.72, 6);
    // ânforas e banco
    k.amphora(0.35, z1 + 0.35); k.amphora(0.6, z1 + 0.45, 0.85);
    block(x1 - 0.95, x1 - 0.15, 0.3, 0.38, z1 + 0.12, z1 + 0.42, M.wood);
    for (const x of [x1 - 0.85, x1 - 0.25]) block(x - 0.04, x + 0.04, 0, 0.3, z1 + 0.2, z1 + 0.34, M.woodDark);
  }
  if (st <= 2) {
    k.scaffold({ x0: x0 - 0.3, x1: x1 + 0.3, z0: z0 - 0.3, z1: z1 + 0.35, h: [1.2, 2.2, 3.3][st] });
    k.pile(1.3, 1.85, M.plasterDark);
  }
};

// ---- Torre de vigia 1×1 (2×2 m): torre quadrada de pedra em fiadas, seteiras, parapeito com merlões, telhadinho de
//      quatro águas sobre esteios e bandeira de time no alto ----
BUILDERS.tower = (k, p) => {
  const { THREE, M, box, block } = k;
  const st = p.stage;
  k.debris = { x0: -1, x1: 1, z0: -1, z1: 1 };
  k.debrisMats = [M.ashlar, M.ashlar2, M.stone];
  const hw = 0.9, bodyH = 3.7;
  const h = bodyH * [0.25, 0.6, 1, 1][st];
  // fiadas alternadas (0,6 m) com juntas escuras
  for (let y = 0, i = 0; y < h - 1e-6; y += 0.6, i++) {
    const yy = Math.min(h, y + 0.6);
    const inset = i === 0 ? 0 : 0.02;
    block(-hw + inset, hw - inset, y, yy, -hw + inset, hw - inset, i % 2 ? M.ashlar2 : M.ashlar);
    if (yy < h - 1e-6) block(-hw + 0.01, hw - 0.01, yy - 0.025, yy + 0.025, -hw + 0.01, hw - 0.01, M.ashlarDark);
  }
  // seteiras (sul e leste)
  for (const y of [1.3, 2.6]) if (h > y + 0.5) {
    block(-0.05, 0.05, y, y + 0.5, hw - 0.005, hw + 0.01, M.char);
    block(hw - 0.005, hw + 0.01, y, y + 0.5, -0.05, 0.05, M.char);
  }
  if (st >= 2) {
    // mísulas e parapeito saliente
    block(-hw - 0.12, hw + 0.12, bodyH, bodyH + 0.18, -hw - 0.12, hw + 0.12, M.ashlarDark);
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      box(0.14, 0.2, 0.14, M.ashlarDark, -hw + 0.25 + i * 0.43, bodyH - 0.1, s * (hw + 0.05));
      box(0.14, 0.2, 0.14, M.ashlarDark, s * (hw + 0.05), bodyH - 0.1, -hw + 0.25 + i * 0.43);
    }
  }
  if (st === 3) {
    const py = bodyH + 0.18, e = hw + 0.12;
    block(-e, e, py, py + 0.25, e - 0.2, e, M.ashlar); block(-e, e, py, py + 0.25, -e, -e + 0.2, M.ashlar);
    block(-e, -e + 0.2, py, py + 0.25, -e, e, M.ashlar); block(e - 0.2, e, py, py + 0.25, -e, e, M.ashlar);
    for (let i = 0; i < 4; i++) {
      const t = -e + 0.18 + i * ((2 * e - 0.36) / 3);
      for (const s of [-1, 1]) {
        k.breakable(box(0.26, 0.32, 0.2, M.ashlar, t, py + 0.41, s * (e - 0.1)));
        if (i > 0 && i < 3) k.breakable(box(0.2, 0.32, 0.26, M.ashlar, s * (e - 0.1), py + 0.41, t));
      }
    }
    // telhadinho de quatro águas em 4 esteios
    for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) k.cyl(0.05, 0.05, 1.0, M.wood, x, py, z, 6);
    const roof = k.mesh(new THREE.ConeGeometry(0.98, 0.75, 4, 1), M.terracotta, 0, py + 1.0 + 0.37, 0);
    roof.rotation.y = Math.PI / 4; roof.userData.roof = true;
    k.cyl(0.02, 0.02, 0.9, M.wood, 0, py + 1.55, 0, 6);
    box(0.42, 0.26, 0.02, M.team, 0.23, py + 2.25, 0);
    k.mesh(new THREE.SphereGeometry(0.05, 8, 6), M.gold, 0, py + 2.47, 0);
  }
  if (st <= 2) {
    k.scaffold({ x0: -hw - 0.3, x1: hw + 0.3, z0: -hw - 0.3, z1: hw + 0.3, h: [1.4, 2.6, 4.0][st] });
    k.pile(0.9, 1.45, M.ashlar2);
  }
};

// ---- Muralha 1×1 por bitmask (N = 1, L = 2, S = 4, O = 8): braços do centro até a borda do tile na direção de cada
//      vizinho muralha/portão/torre; reta (5 ou 10) contínua, demais com um pilar no centro. Fiadas horizontais e
//      merlões em posições periódicas (a cada 0,5 m, alinhados ao tile), então dois trechos vizinhos se encontram sem
//      costura. Os vizinhos oeste e norte entram como geometria de contexto (só sombra: a sombra deles cai nesta peça
//      como no jogo) e a sombra no chão é recortada à região desta peça (sem faixas dobradas). ----
export const WALL = { T: 1.2, H: 2.4, EPS: 0.08, merlon: [0.3, 0.26, 0.5], pier: 1.5, pierH: 2.85 };
const DIRV = { 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] };   // N, L, S, O → (dx, dz)

/** Um braço de muralha do centro até a borda na direção `bit` (ou, com `ctx`, o trecho inteiro do vizinho). */
function wallArm(k, bit, ctx = false) {
  const { M } = k;
  const [dx, dz] = DIRV[bit];
  const { T, H, EPS } = WALL;
  const out = [];
  // extensão ao longo do braço: 0 → 1 + EPS (m); contexto: o tile vizinho inteiro (1 → 3)
  const a0 = ctx ? 1 : 0, a1 = ctx ? 3 : 1 + EPS;
  const rect = (along0, along1, across0, across1, y0, y1, mat) => {
    // along = distância do centro na direção (dx, dz); across = perpendicular
    const xs = dx !== 0 ? [dx * along0, dx * along1] : [across0, across1];
    const zs = dz !== 0 ? [dz * along0, dz * along1] : [across0, across1];
    const m = k.block(Math.min(...xs), Math.max(...xs), y0, y1, Math.min(...zs), Math.max(...zs), mat);
    out.push(m); return m;
  };
  // corpo em 4 fiadas de 0,6 m (tons alternados) + juntas + capeamento
  for (let i = 0; i < 4; i++) rect(a0, a1, -T / 2, T / 2, i * 0.6, (i + 1) * 0.6, i % 2 ? M.ashlar2 : M.ashlar);
  if (!ctx) for (let i = 1; i < 4; i++) rect(a0, a1, -T / 2 - 0.01, T / 2 + 0.01, i * 0.6 - 0.02, i * 0.6 + 0.02, M.ashlarDark);
  rect(a0, a1, -T / 2 - 0.05, T / 2 + 0.05, H, H + 0.1, M.ashlarDark);
  // merlões nas duas bordas, a cada 0,5 m (centros em 0,25 / 0,75 / …)
  const [mw, mt, mh] = WALL.merlon;
  for (let c = 0.25; c < a1 - 0.1; c += 0.5) {
    if (c < a0) continue;
    for (const s of [-1, 1]) {
      const m = rect(c - mw / 2, c + mw / 2, s > 0 ? T / 2 - mt : -T / 2, s > 0 ? T / 2 : -T / 2 + mt, H + 0.1, H + 0.1 + mh, M.ashlar);
      if (!ctx) k.breakable(m);
    }
  }
  if (ctx) for (const m of out) k.context(m);
  return out;
}

BUILDERS.wall = (k, p) => {
  const { M, block } = k;
  const mask = Number(p.variant ?? 0) & 15;
  const st = p.stage;
  const { T, H, pier, pierH } = WALL;
  k.debrisMats = [M.ashlar, M.ashlar2, M.stone];
  k.debris = { x0: -0.9, x1: 0.9, z0: -T / 2, z1: T / 2 };
  const straight = mask === 5 || mask === 10;
  // obra: fiadas até a altura do estágio (sem merlões), andaime baixo
  if (st <= 2) {
    const h = [0.6, 1.2, 2.0][st];
    const arms = [1, 2, 4, 8].filter((b) => mask & b);
    const core = straight ? 0 : T / 2;
    if (!straight || !arms.length) block(-T / 2, T / 2, 0, h, -T / 2, T / 2, M.ashlar);
    for (const b of arms) {
      const [dx, dz] = DIRV[b];
      const a1 = 1 + WALL.EPS;
      const xs = dx ? [dx * core, dx * a1] : [-T / 2, T / 2], zs = dz ? [dz * core, dz * a1] : [-T / 2, T / 2];
      for (let y = 0, i = 0; y < h - 1e-6; y += 0.6, i++) block(Math.min(...xs), Math.max(...xs), y, Math.min(h, y + 0.6), Math.min(...zs), Math.max(...zs), i % 2 ? M.ashlar2 : M.ashlar);
    }
    if (st >= 1) { for (const s of [-1, 1]) k.cyl(0.035, 0.045, h + 0.9, M.wood, s * 0.55, 0, T / 2 + 0.25, 6); k.box(1.3, 0.05, 0.25, M.wood, 0, h + 0.2, T / 2 + 0.25); }
    k.pile(0.35, T / 2 + 0.55, M.ashlar2);
  } else {
    for (const b of [1, 2, 4, 8]) if (mask & b) wallArm(k, b);
    if (!straight) {
      // pilar no centro (ponta, canto, tê, cruz ou trecho isolado)
      const hp = pier / 2;
      block(-hp, hp, 0, pierH, -hp, hp, M.ashlar);
      block(-hp - 0.01, hp + 0.01, 1.18, 1.22, -hp - 0.01, hp + 0.01, M.ashlarDark);
      block(-hp - 0.06, hp + 0.06, pierH, pierH + 0.12, -hp - 0.06, hp + 0.06, M.ashlarDark);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.breakable(block(x * hp - (x > 0 ? 0.32 : 0), x * hp + (x < 0 ? 0.32 : 0), pierH + 0.12, pierH + 0.62, z * hp - (z > 0 ? 0.32 : 0), z * hp + (z < 0 ? 0.32 : 0), M.ashlar));
    }
  }
  // vizinhos oeste e norte como contexto (só sombra) e a região da sombra no chão desta peça
  if (st === 3 || st > 3) { if (mask & 8) wallArm(k, 8, true); if (mask & 1) wallArm(k, 1, true); }
  k.group.userData.shadowClip = { x0: -0.5, x1: mask & 2 ? 0.5 : Infinity, z0: -0.5, z1: mask & 4 ? 0.5 : Infinity };
};

// ---- Portão 1×1: dois pilares nas pontas do eixo da muralha (até a borda do tile, para casar com os trechos
//      vizinhos), verga com merlões, folhas de madeira com ferragens; 'ew' = muralha leste-oeste (passagem norte-sul,
//      as folhas fechadas de frente para a câmera), 'ns' = muralha norte-sul (as folhas abertas giram para leste, onde a
//      câmera as vê). Estandartes de time nos pilares. ----
BUILDERS.gate = (k, p) => {
  const { M, block, box } = k;
  const axis = p.variant === 'ns' ? 'ns' : 'ew';
  const st = p.stage, open = p.state === 'open';
  const { EPS, H } = WALL;
  const TP = 1.4, pw = 0.5, gateH = 3.5, doorH = 2.2;
  k.debrisMats = [M.ashlar, M.ashlar2, M.wood];
  // (a = ao longo da muralha, b = através) → (x, z)
  const B = (a0, a1, y0, y1, b0, b1, mat) => axis === 'ew' ? block(a0, a1, y0, y1, b0, b1, mat) : block(b0, b1, y0, y1, a0, a1, mat);
  k.debris = axis === 'ew' ? { x0: -1, x1: 1, z0: -TP / 2, z1: TP / 2 } : { x0: -TP / 2, x1: TP / 2, z0: -1, z1: 1 };
  const h = st <= 2 ? [0.6, 1.3, 2.4][st] : gateH;
  for (const s of [-1, 1]) {
    const a0 = s < 0 ? -1 - EPS : 1 - pw, a1 = s < 0 ? -1 + pw : 1 + EPS;
    for (let y = 0, i = 0; y < h - 1e-6; y += 0.6, i++) B(a0, a1, y, Math.min(h, y + 0.6), -TP / 2, TP / 2, i % 2 ? M.ashlar2 : M.ashlar);
    if (st >= 3) {
      B(a0 - 0.02, a1 + 0.02, gateH, gateH + 0.12, -TP / 2 - 0.05, TP / 2 + 0.05, M.ashlarDark);
      for (const c of [s < 0 ? -0.75 : 0.75]) for (const t of [-1, 1]) k.breakable(B(c - 0.15, c + 0.15, gateH + 0.12, gateH + 0.62, t > 0 ? TP / 2 - 0.26 : -TP / 2, t > 0 ? TP / 2 : -TP / 2 + 0.26, M.ashlar));
    }
  }
  if (st >= 2) {
    // verga (arco reto) sobre o vão, com friso
    B(-1 + pw, 1 - pw, doorH, st >= 3 ? gateH : 2.4, -TP / 2 + 0.05, TP / 2 - 0.05, M.ashlar);
    B(-1 + pw - 0.02, 1 - pw + 0.02, doorH - 0.08, doorH, -TP / 2, TP / 2, M.ashlarDark);
  }
  if (st >= 3) {
    B(-1 + pw, 1 - pw, gateH, gateH + 0.12, -TP / 2 - 0.05, TP / 2 + 0.05, M.ashlarDark);
    for (const c of [-0.25, 0.25]) for (const t of [-1, 1]) k.breakable(B(c - 0.15, c + 0.15, gateH + 0.12, gateH + 0.62, t > 0 ? TP / 2 - 0.26 : -TP / 2, t > 0 ? TP / 2 : -TP / 2 + 0.26, M.ashlar));
    // folhas de madeira com ferragens, dobradiça na face interna de cada pilar. 'ew': fechadas no plano z = 0,25 (de
    // frente para a câmera), abertas giram para dentro (norte) e somem de perfil — a passagem fica vazada; 'ns': fechadas
    // na face leste (de perfil, invisíveis nesta câmera), abertas giram para fora (leste) e aparecem de frente.
    const leaf = (s) => {
      const hinge = new k.THREE.Group(); k.r.add(hinge);
      const L = (a0, a1, y0, y1, b0, b1, mat) => axis === 'ew' ? k.block(a0, a1, y0, y1, b0, b1, mat, hinge) : k.block(b0, b1, y0, y1, a0, a1, mat, hinge);
      const a0 = Math.min(0, -s * 0.5), a1 = Math.max(0, -s * 0.5);
      L(a0, a1, 0.02, doorH - 0.04, -0.04, 0.04, M.wood);
      for (const y of [0.35, 1.0, 1.65]) L(a0, a1, y, y + 0.09, 0.04, 0.07, M.iron);
      for (let i = 1; i < 3; i++) { const a = a0 + (i * (a1 - a0)) / 3; L(a - 0.012, a + 0.012, 0.1, doorH - 0.12, 0.04, 0.05, M.woodDark); }
      if (axis === 'ew') hinge.position.set(s * 0.5, 0, 0.25); else hinge.position.set(TP / 2 - 0.04, 0, s * 0.5);
      if (open) hinge.rotation.y = -s * 1.45;
    };
    for (const s of [-1, 1]) leaf(s);
    // estandartes de time: 'ew' na face sul dos pilares; 'ns' na face sul do pilar sul
    if (axis === 'ew') for (const s of [-1, 1]) box(0.34, 0.95, 0.03, M.team, s * 0.75, 2.2, TP / 2 + 0.03);
    else { box(0.5, 0.95, 0.03, M.team, 0, 2.2, 1 + EPS + 0.02); }
    // chão batido na passagem (sombra de contato)
    B(-1 + pw, 1 - pw, 0, 0.02, -TP / 2, TP / 2, M.earth);
  } else {
    k.pile(axis === 'ew' ? 0 : 1.1, axis === 'ew' ? TP / 2 + 0.6 : 0.2, M.ashlar2);
    for (const s of [-1, 1]) k.cyl(0.035, 0.045, h + 0.9, M.wood, axis === 'ew' ? s * 0.8 : TP / 2 + 0.25, 0, axis === 'ew' ? TP / 2 + 0.25 : s * 0.8, 6);
    k.cyl(0.03, 0.03, 0.8, M.wood, axis === 'ew' ? -0.8 : TP / 2 + 0.25, h + 0.9, axis === 'ew' ? TP / 2 + 0.25 : 0.8, 6);
    box(0.4, 0.26, 0.03, M.team, (axis === 'ew' ? -0.8 : TP / 2 + 0.25) + 0.22, h + 1.5, axis === 'ew' ? TP / 2 + 0.25 : 0.8);
  }
  // vizinhos da muralha como contexto (só sombra) e região da sombra no chão
  if (st >= 3) { if (axis === 'ew') wallArm(k, 8, true); else wallArm(k, 1, true); }
  k.group.userData.shadowClip = axis === 'ew' ? { x0: -0.5, x1: 0.5, z0: -0.5, z1: Infinity } : { x0: -0.5, x1: Infinity, z0: -0.5, z1: 0.5 };
  void H;
};

// ---- Centro Cívico 3×3 (6×6 m): uma pequena ágora — pátio lajeado aberto para o sul (a entrada, de frente para a
//      câmera) com altar e trípode no meio e dois estandartes de time na entrada; ao fundo o pritaneu (salão com alpendre
//      de 4 colunas e telhado de duas águas com a cumeeira leste-oeste, que esta câmera lê bem), nas laterais duas alas de
//      pórtico (stoas) com telhado de uma água caindo para o pátio, e no canto nordeste a torre de guarda (a "cidadela")
//      com bandeira de time. Variantes por Idade (materiais): a0 = arcaica (reboco, colunas de madeira, pedra rústica,
//      pátio de terra batida), a1 = clássica/heroica (calcário), a2 = mítica/titãs (mármore, bronze e ouro). ----
BUILDERS.town_center = (k, p) => {
  const { THREE, M, box, block } = k;
  const st = p.stage;
  const tier = p.variant === 'a0' ? 0 : p.variant === 'a2' ? 2 : 1;
  const wallM = [M.plaster, M.limestone, M.marble][tier], wallD = [M.plasterDark, M.limestoneDark, M.marbleDark][tier];
  const colM = [M.wood, M.limestone, M.marble][tier], baseM = [M.stoneWarm, M.limestoneDark, M.marbleDark][tier];
  const floorM = [M.earth, M.limestone, M.marble][tier], jointM = [M.earth, M.limestoneDark, M.marbleDark][tier];
  const towerM = [M.ashlar2, M.ashlar, M.marble][tier], towerB = [M.ashlarDark, M.ashlar2, M.marbleDark][tier];
  const metal = tier === 2 ? M.gold : M.bronze;
  k.debris = { x0: -3, x1: 3, z0: -3, z1: 3 };
  k.debrisMats = [wallM, baseM, towerM];
  const wf = [0.25, 0.6, 1, 1][st];       // fração da altura das paredes na obra
  // plataforma, degraus da entrada e piso do pátio
  block(-3, 3, 0, 0.16, -3, 3, baseM);
  const base = st >= 1 ? 0.3 : 0.16;
  if (st >= 1) {
    block(-2.9, 2.9, 0.16, 0.3, -2.9, 2.6, floorM);
    if (tier > 0) for (let x = -1.5; x <= 1.51; x += 0.6) block(x - 0.015, x + 0.015, 0.3, 0.305, -1.1, 2.6, jointM);
    if (tier > 0) for (let z = -0.8; z <= 2.61; z += 0.6) block(-1.65, 1.65, 0.3, 0.305, z - 0.015, z + 0.015, jointM);
    block(-1.4, 1.4, 0.16, 0.23, 2.6, 2.95, baseM);                                   // degrau da entrada
  }
  // --- pritaneu ao norte: salão com porta e alpendre de 4 colunas; telhado de duas águas leste-oeste
  const hx0 = -2.85, hx1 = 1.35, hz0 = -2.85, hz1 = -1.45, hallH = 2.45;
  k.room(hx0, hx1, hz0, hz1, base, hallH * wf, 0.22, wallM, [-1.15, -0.45, 1.8]);
  if (st >= 1) block(-1.12, -0.48, base, base + Math.min(1.78, hallH * wf), hz1 - 0.2, hz1 - 0.16, M.woodDark);
  const pz = -0.95, colH = hallH - 0.2;
  const pcols = [-2.45, -1.55, -0.05, 0.95];
  const colFrac = [0.2, 0.55, 1, 1][st];
  for (const x of pcols) {
    if (st === 0 && x > 0) continue;
    if (tier === 0 || colFrac < 1) k.cyl(tier === 0 ? 0.1 : 0.14, tier === 0 ? 0.12 : 0.16, colH * colFrac, colM, x, base, pz, 12);
    else k.column(x, pz, base, colH, 0.16, colM, colM);
  }
  const eave = base + hallH;
  if (st >= 2) {
    block(hx0, hx1, base + colH, eave, pz - 0.2, pz + 0.2, tier === 0 ? M.wood : wallM);           // arquitrave do alpendre
    block(hx0 - 0.02, hx1 + 0.02, eave - 0.12, eave, pz + 0.2, pz + 0.23, tier === 0 ? M.woodDark : wallD);
    if (tier === 2) block(hx0, hx1, eave - 0.08, eave - 0.04, pz + 0.23, pz + 0.25, M.gold);
    block(hx0, hx1, eave - 0.05, eave, hz1, pz - 0.2, M.woodDark);                                   // forro do alpendre
  }
  const rz0 = hz0 - 0.15, rz1 = pz + 0.35;
  if (st === 2) k.gable({ cx: (hx0 + hx1) / 2, cz: (rz0 + rz1) / 2, axis: 'x', w: rz1 - rz0, len: hx1 - hx0, y: eave, rise: 0.75, frame: true });
  if (st === 3) {
    k.gable({ cx: (hx0 + hx1) / 2, cz: (rz0 + rz1) / 2, axis: 'x', w: rz1 - rz0, len: hx1 - hx0 + 0.1, y: eave, rise: 0.75, ped: wallM, nRows: 5 });
    // acrotérios nas pontas da cumeeira e no meio (quebráveis)
    for (const x of [hx0 + 0.05, (hx0 + hx1) / 2, hx1 - 0.05]) {
      const y = eave + 0.8;
      const a = tier === 2 ? k.mesh(new THREE.SphereGeometry(0.12, 10, 8), M.gold, x, y + 0.08, (rz0 + rz1) / 2)
        : k.mesh(new THREE.ConeGeometry(0.1, 0.28, 6), tier === 0 ? M.terracotta : wallM, x, y + 0.1, (rz0 + rz1) / 2);
      k.breakable(a);
    }
  }
  // --- alas de pórtico (oeste e leste): parede de fundo por fora, 3 colunas para o pátio, telhado de uma água
  const wingZ0 = -0.55, wingZ1 = 2.35, wingH = 2.2;
  for (const s of [-1, 1]) {
    const xo = s * 2.85, xi = s * 1.75;                     // fora / colunata
    const xw0 = Math.min(xo, xo - s * 0.22), xw1 = Math.max(xo, xo - s * 0.22);
    block(xw0, xw1, base, base + wingH * wf + (st >= 3 ? 0.25 : 0), wingZ0, wingZ1, wallM);
    block(Math.min(xo, xi), Math.max(xo, xi), base, base + wingH * wf * (st >= 2 ? 1 : 0.6), wingZ1 - 0.2, wingZ1, wallM);   // cabeceira sul
    for (const z of [-0.1, 0.85, 1.8]) {
      if (st === 0 && z > 0.5) continue;
      if (tier === 0 || colFrac < 1) k.cyl(tier === 0 ? 0.09 : 0.12, tier === 0 ? 0.11 : 0.14, wingH * colFrac, colM, xi, base, z, 12);
      else k.column(xi, z, base, wingH, 0.14, colM, colM);
    }
    if (st >= 2) block(xi - 0.18, xi + 0.18, base + wingH, base + wingH + 0.16, wingZ0, wingZ1, tier === 0 ? M.wood : wallD);
    if (st === 2) k.shedX({ z0: wingZ0, z1: wingZ1, xHigh: xo, xLow: xi - s * 0.2, yHigh: base + wingH + 0.45, yLow: base + wingH + 0.16, frame: true });
    if (st === 3) k.shedX({ z0: wingZ0 - 0.05, z1: wingZ1 + 0.05, xHigh: xo + s * 0.05, xLow: xi - s * 0.28, yHigh: base + wingH + 0.45, yLow: base + wingH + 0.12, nRows: 5 });
  }
  // --- torre de guarda no canto nordeste
  const tx0 = 1.45, tx1 = 2.85, tz0 = -2.85, tz1 = -1.45, towerH = 3.9;
  const th = towerH * [0.15, 0.45, 1, 1][st];
  for (let y = 0, i = 0; y < th - 1e-6; y += 0.65, i++) block(tx0, tx1, base + y, base + Math.min(th, y + 0.65), tz0, tz1, i % 2 ? towerB : towerM);
  if (th > 2.3) { block(2.1, 2.2, base + 1.7, base + 2.2, tz1 - 0.01, tz1 + 0.01, M.char); if (th > 3.3) block(2.1, 2.2, base + 2.8, base + 3.3, tz1 - 0.01, tz1 + 0.01, M.char); }
  if (st === 3) {
    const y = base + towerH;
    block(tx0 - 0.08, tx1 + 0.08, y, y + 0.12, tz0 - 0.08, tz1 + 0.08, towerB);
    for (let i = 0; i < 3; i++) for (const z of [tz1 - 0.08, tz0 + 0.08]) k.breakable(box(0.26, 0.34, 0.24, towerM, tx0 + 0.12 + i * 0.58, y + 0.29, z));
    for (const x of [tx0 - 0.02, tx1 + 0.02]) k.breakable(box(0.24, 0.34, 0.26, towerM, x, y + 0.29, (tz0 + tz1) / 2));
    k.cyl(0.025, 0.03, 1.1, M.wood, (tx0 + tx1) / 2, y + 0.12, (tz0 + tz1) / 2, 6);
    box(0.5, 0.3, 0.03, M.team, (tx0 + tx1) / 2 + 0.27, y + 1.02, (tz0 + tz1) / 2);
    if (tier === 2) k.mesh(new THREE.SphereGeometry(0.07, 8, 6), M.gold, (tx0 + tx1) / 2, y + 1.26, (tz0 + tz1) / 2);
  }
  // --- pátio: altar com trípode, estandartes de time na entrada, ânforas
  if (st === 3) {
    block(-0.4, 0.4, base, base + 0.5, 0.45, 1.05, tier === 0 ? M.stone : wallD);
    block(-0.45, 0.45, base + 0.5, base + 0.58, 0.4, 1.1, tier === 0 ? M.stoneDark : wallM);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const l = k.cyl(0.02, 0.02, 0.5, metal, Math.cos(a) * 0.13, base + 0.58, 0.75 + Math.sin(a) * 0.13, 5); l.rotation.z = Math.cos(a) * 0.2; }
    k.mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), metal, 0, base + 1.1, 0.75).rotation.x = Math.PI;
    k.banner(-1.3, 2.75, 2.6, -1); k.banner(1.3, 2.75, 2.6, 1);
    k.amphora(-1.35, -0.2, 0.9); k.amphora(-1.1, -0.35, 0.8); k.amphora(1.3, 1.9, 0.9);
  }
  if (st <= 2) {
    k.scaffold({ x0: -3.0, x1: 3.0, z0: -3.0, z1: 2.6, h: [1.3, 2.5, 3.5][st] });
    k.pile(0.4, 2.95, wallM); if (st === 0) k.pile(-0.9, 1.2, tier === 0 ? M.wood : colM);
  }
};

// ---- Escombros por pegada w×h (tiles): leito baixo de terra e pó, pilha de blocos soltos e inclinados concentrada na
//      pegada, telhas quebradas, vigas queimadas e, nos grandes, tambores de coluna caídos; baixo (≤ 0,8 m), para as
//      unidades passarem por cima ----
BUILDERS.rubble = (k, p) => {
  const { THREE, M, rand } = k;
  const w = Number(p.w ?? 2) * 2, d = Number(p.h ?? 2) * 2;   // metros
  const rx = w * 0.42, rz = d * 0.42, peak = Math.min(0.55, 0.16 + w * 0.045);
  // leito de terra e pó (esfera achatada, borda irregular)
  const bed = k.mesh(new THREE.SphereGeometry(1, 28, 10), M.earth, 0, 0, 0);
  const pos = bed.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x), wob = 0.9 + 0.1 * Math.sin(a * 5 + w) + 0.06 * Math.sin(a * 11);
    pos.setXYZ(i, x * wob, Math.max(0, y) * (0.9 + 0.2 * rand()), z * wob);
  }
  bed.geometry.computeVertexNormals();
  bed.scale.set(rx, peak, rz);
  const height = (x, z) => { const q = 1 - (x * x) / (rx * rx) - (z * z) / (rz * rz); return q > 0 ? peak * Math.sqrt(q) : 0; };
  const inside = () => {
    for (let t = 0; t < 50; t++) { const x = (rand() * 2 - 1) * rx, z = (rand() * 2 - 1) * rz; if ((x * x) / (rx * rx) + (z * z) / (rz * rz) <= 1) return [x, z]; }
    return [0, 0];
  };
  const mats = [M.ashlar, M.ashlar2, M.limestone, M.stoneLight, M.plasterDark];
  const area = w * d;
  const nBlocks = Math.round(6 + area * 1.4);
  for (let i = 0; i < nBlocks; i++) {
    const [x, z] = inside();
    const s = 0.12 + rand() * 0.26;
    const m = k.box(s * (1.2 + rand() * 0.8), s * (0.6 + rand() * 0.5), s * (0.9 + rand() * 0.5), mats[Math.floor(rand() * mats.length)], x, height(x, z) + s * 0.2, z);
    m.rotation.set((rand() - 0.5) * 0.8, rand() * 3, (rand() - 0.5) * 0.8);
  }
  for (let i = 0; i < Math.round(area * 0.35); i++) {   // telhas quebradas
    const [x, z] = inside();
    const m = k.box(0.22 + rand() * 0.12, 0.04, 0.16 + rand() * 0.08, rand() < 0.5 ? M.terracotta : M.terracottaDark, x, height(x, z) + 0.03, z);
    m.rotation.set((rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5);
  }
  for (let i = 0; i < Math.max(1, Math.floor(w / 2)); i++) {   // vigas queimadas
    const [x, z] = inside();
    const len = Math.min(w * 0.5, 0.8 + rand() * 0.9);
    const m = k.cyl(0.06, 0.07, len, M.char, x, 0, z, 7);
    m.rotation.set(Math.PI / 2 + (rand() - 0.5) * 0.25, 0, rand() * 3); m.position.y = height(x, z) + 0.08;
  }
  for (let i = 0; i < Math.floor(w / 3); i++) {   // tambores de coluna caídos
    const [x, z] = inside();
    const c = k.cyl(0.19, 0.19, 0.45, M.limestone, x, 0, z, 14); c.rotation.set(0, rand() * 3, Math.PI / 2); c.position.y = height(x, z) + 0.15;
  }
  k.debris = null;
};

// =================================================================================================================

/**
 * Constrói `style` no estado de `params` (`state`: build0–2, complete, damage1–2, open; `variant`: bitmask da muralha,
 * eixo do portão, Idade do Centro Cívico; `w`/`h`: pegada dos escombros). Devolve um grupo em tiles com
 * `userData.shadowClip` opcional.
 */
export function buildBuilding(THREE, M, style, params = {}) {
  const B = BUILDERS[style];
  if (!B) throw new Error(`edifício desconhecido: ${style}`);
  const info = stateInfo(params);
  const k = makeKit(THREE, M, seedOf(`${style}/${params.variant ?? ''}/${info.state}/${params.w ?? ''}x${params.h ?? ''}`));
  // o dano parte do edifício pronto: o mesmo modelo do `complete` (a semente do dano é a do estado)
  B(k, { ...params, ...info, stage: info.stage });
  if (info.damage) applyDamage(k, info.damage);
  return k.group;
}

/** Estilos conhecidos (para validação dos manifestos no Node). */
export const BUILDING_STYLES = Object.keys(BUILDERS);
