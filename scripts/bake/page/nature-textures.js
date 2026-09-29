// Texturas dos props naturais (Etapa 9 do visual, docs/ART.md Apêndice I): rocha calcária (fendas, grão, líquen) e o
// topo cortado de um toco (anéis, cerne, rachaduras radiais). Geradas em canvas por pixel com mapa normal por Sobel, sem
// Math.random. `worldUV` dá a qualquer malha UV em METROS por triângulo no espaço do prop (u horizontal ao longo da face,
// v subindo a face; faces deitadas usam x, z), como nos edifícios — as pedras de um monte continuam a mesma textura.

const TEX = new Map();
function hash2(x, y, s) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };

/** fBm periódico de ruído de valor (`p` células no lado `size`, `oct` oitavas), em [0, 1]; `ridge` = cristas finas. */
function fbm(size, p, oct, seed, ridge = false) {
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++, amp *= 0.5) {
    const c = p << o, per = size / c;
    for (let y = 0; y < size; y++) {
      const fy = y / per, j = Math.floor(fy), ty = fy - j, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = x / per, i = Math.floor(fx), tx = fx - i, sx = tx * tx * (3 - 2 * tx);
        const a = hash2(i % c, j % c, seed + o), b = hash2((i + 1) % c, j % c, seed + o), cc = hash2(i % c, (j + 1) % c, seed + o), d = hash2((i + 1) % c, (j + 1) % c, seed + o);
        let v = (a + (b - a) * sx) + ((cc + (d - cc) * sx) - (a + (b - a) * sx)) * sy;
        if (ridge) { v = 1 - Math.abs(2 * v - 1); v *= v; }
        out[y * size + x] += amp * v;
      }
    }
    tot += amp;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function toCanvas(size, col) {
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
  const g = cv.getContext('2d'), img = g.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) { d[i * 4] = clamp01(col[i * 3]) * 255; d[i * 4 + 1] = clamp01(col[i * 3 + 1]) * 255; d[i * 4 + 2] = clamp01(col[i * 3 + 2]) * 255; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  return cv;
}
function normalCanvas(size, h, k) {
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
  const g = cv.getContext('2d'), img = g.createImageData(size, size), d = img.data, m = size - 1;
  const H = (x, y) => h[(y & m) * size + (x & m)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1)) - (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1));
    let nx = -dx * k, ny = -dy * k, nz = 1; const l = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}
function tex(THREE, cv, meters) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(1 / meters, 1 / meters); return t; }

/** Rocha calcária: cristas e fendas finas, grão, manchas quentes/frias e líquen amarelo e cinza (multiplicador da cor). */
function rockSet(THREE) {
  if (TEX.has('rock')) return TEX.get('rock');
  const size = 512, meters = 1.6, seed = 9101;
  const ridge = fbm(size, 4, 4, seed, true), low = fbm(size, 3, 3, seed + 10), grain = fbm(size, 32, 3, seed + 20);
  const crackN = fbm(size, 5, 3, seed + 30), lich = fbm(size, 12, 3, seed + 40), lichMask = fbm(size, 3, 2, seed + 50);
  const col = new Float32Array(size * size * 3), h = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const crack = 1 - smooth(0, 0.035, Math.abs(crackN[i] - 0.5));
    h[i] = 0.5 * ridge[i] + 0.3 * low[i] + 0.12 * grain[i] - 0.35 * crack;
    let s = (0.82 + 0.2 * low[i]) * (0.9 + 0.18 * grain[i]) * (0.9 + 0.12 * ridge[i]) * (1 - 0.45 * crack);
    let cr = s * (1.02 + (low[i] - 0.5) * 0.08), cg = s, cb = s * (0.96 - (low[i] - 0.5) * 0.08);
    const lk = smooth(0.55, 0.75, lichMask[i]) * smooth(0.6, 0.72, lich[i]);
    const yellow = hash2(Math.floor(i / size / 40), Math.floor((i % size) / 40), seed) < 0.5;
    cr += ((yellow ? 1.05 : 0.8) - cr) * lk * 0.6; cg += ((yellow ? 0.98 : 0.86) - cg) * lk * 0.6; cb += ((yellow ? 0.55 : 0.74) - cb) * lk * 0.6;
    col[i * 3] = cr * 0.82; col[i * 3 + 1] = cg * 0.82; col[i * 3 + 2] = cb * 0.82;
  }
  let mean = 0; for (let i = 0; i < col.length; i++) mean += col[i]; mean /= col.length;
  const set = { map: tex(THREE, toCanvas(size, col), meters), normalMap: tex(THREE, normalCanvas(size, h, 6), meters), mean };
  TEX.set('rock', set);
  return set;
}

/** Material de rocha texturizado com a cor-base `hex` (a média da textura é compensada). */
export function rockMaterial(THREE, hex, roughness = 0.92) {
  const key = `rockmat/${hex}/${roughness}`;
  if (TEX.has(key)) return TEX.get(key);
  const set = rockSet(THREE);
  const m = new THREE.MeshStandardMaterial({ color: hex, roughness, metalness: 0, map: set.map, normalMap: set.normalMap });
  m.color.multiplyScalar(1 / set.mean);
  TEX.set(key, m);
  return m;
}

/** Rocha com cor por vértice (a cor absoluta vem da malha; a textura só dá grão, fendas e líquen, média compensada). */
export function rockVertexMaterial(THREE, roughness = 0.9) {
  const key = `rockvc/${roughness}`;
  if (TEX.has(key)) return TEX.get(key);
  const set = rockSet(THREE);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness: 0, map: set.map, normalMap: set.normalMap, vertexColors: true });
  m.color.multiplyScalar(1 / set.mean);
  TEX.set(key, m);
  return m;
}

/** Topo cortado do toco: anéis concêntricos, cerne escuro, rachaduras radiais e borda de casca (UV 0–1 no disco). */
export function stumpTopMaterial(THREE) {
  if (TEX.has('stumptop')) return TEX.get('stumptop');
  const size = 128, col = new Float32Array(size * size * 3), h = new Float32Array(size * size);
  const n = fbm(size, 8, 3, 9201);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5, d = Math.sqrt(dx * dx + dy * dy) * 2;
    const ring = 0.5 + 0.5 * Math.sin((d + (n[i] - 0.5) * 0.08) * 60);
    const ang = Math.atan2(dy, dx), crack = d > 0.15 && d < 0.9 && Math.abs(Math.sin(ang * 3 + 1.3)) < 0.03 ? 1 : 0;
    const heart = 1 - smooth(0.1, 0.45, d), barkRim = smooth(0.86, 0.92, d);
    let s = (0.86 + 0.14 * ring) * (1 - 0.25 * heart) * (1 - 0.5 * crack) * (1 - 0.55 * barkRim);
    h[i] = 0.5 + 0.1 * ring - 0.3 * crack;
    col[i * 3] = s * 0.95; col[i * 3 + 1] = s * 0.78; col[i * 3 + 2] = s * 0.56;
  }
  const t = new THREE.CanvasTexture(toCanvas(size, col)); t.colorSpace = THREE.SRGBColorSpace;
  const nm = new THREE.CanvasTexture(normalCanvas(size, h, 3)); nm.colorSpace = THREE.NoColorSpace;
  const m = new THREE.MeshStandardMaterial({ color: 0xb89a74, map: t, normalMap: nm, roughness: 0.9 });
  TEX.set('stumptop', m);
  return m;
}

/**
 * UV em METROS por triângulo no espaço de `root` (que deve estar na origem; `toMeters` converte as unidades dele): u na
 * horizontal ao longo da face, v subindo a face; faces deitadas usam (x, z). A malha vira não indexada (UV por face).
 */
export function worldUV(THREE, root, mesh, toMeters) {
  root.updateMatrixWorld(true);
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);
  const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3();
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), mm = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
  for (let i = 0; i < pos.count; i += 3) {
    for (let k = 0; k < 3; k++) p[k].fromBufferAttribute(pos, i + k).applyMatrix4(mm);
    n.crossVectors(e1.subVectors(p[1], p[0]), e2.subVectors(p[2], p[0]));
    if (n.lengthSq() < 1e-14) continue;
    n.normalize();
    if (Math.abs(n.y) > 0.97) { t.set(1, 0, 0); b.set(0, 0, 1); } else { t.crossVectors(up, n).normalize(); b.crossVectors(n, t); if (b.y < 0) b.negate(); }
    for (let k = 0; k < 3; k++) { uv[(i + k) * 2] = p[k].dot(t) * toMeters; uv[(i + k) * 2 + 1] = p[k].dot(b) * toMeters; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  mesh.geometry = geo;
}
