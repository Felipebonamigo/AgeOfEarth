// Formas orgânicas para os rigs das criaturas (Etapa 6, docs/ART.md §1.11 e Apêndice G): "esculturas de primitivas
// deformadas por ruído com pele/escama". Tudo determinístico (ruído por hash inteiro, nada de Math.random): o mesmo
// manifesto gera os mesmos vértices em qualquer máquina, e o bake continua reproduzível.
//   sculpt(geo, fn)          deforma cada vértice por fn(x, y, z) → [x, y, z] (tronco mais fundo no peito, cintura fina…)
//   shaggy(geo, amp, freq)   desloca os vértices pela normal com ruído (juba, pelagem grossa, crina)
//   paint(THREE, geo, fn)    cor por vértice (fn → cor 0xRRGGBB ou THREE.Color): dorso mais escuro que a barriga
//                            (contra-sombreamento), manchas; o material do rig precisa de `vertexColors: true`
//   mottle(base, amt, x, y, z, freq)   cor com manchas de ruído (pelagem, escamas)
//   taperTube(THREE, pts, r0, r1, …)   tubo pela curva com o raio variando da base à ponta (caudas, chifres, pescoços)
// O ruído é função da POSIÇÃO do vértice (não do índice): as costuras das esferas continuam fechadas.

/** Hash inteiro 3D → [0, 1). */
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
/** Ruído de valor 3D suave em [0, 1). */
export function noise3(x, y, z) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  const fx = fade(x - X), fy = fade(y - Y), fz = fade(z - Z);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(X + i, Y + j, Z + k);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy),
    l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
/** Ruído fractal (3 oitavas) em [0, 1). */
export function fbm3(x, y, z) { return (noise3(x, y, z) * 0.57 + noise3(x * 2.03, y * 2.03, z * 2.03) * 0.29 + noise3(x * 4.1, y * 4.1, z * 4.1) * 0.14); }

/** Deforma os vértices de `geo` (no espaço da geometria) e recalcula as normais. */
export function sculpt(geo, fn) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const r = fn(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, r[0], r[1], r[2]);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Desloca os vértices pela normal com ruído (amplitude `amp` m, frequência `freq` por m, semente `seed`). */
export function shaggy(geo, amp, freq = 9, seed = 0) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  // normal média por posição (as costuras têm vértices repetidos com normais diferentes: o deslocamento abriria frestas)
  const key = (i) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  const acc = new Map();
  for (let i = 0; i < p.count; i++) { const k = key(i); const a = acc.get(k) ?? [0, 0, 0]; a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); acc.set(k, a); }
  for (let i = 0; i < p.count; i++) {
    const a = acc.get(key(i)), len = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1;
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = (fbm3(x * freq + seed * 17.3, y * freq + seed * 5.1, z * freq) - 0.5) * 2 * amp;
    p.setXYZ(i, x + (a[0] / len) * d, y + (a[1] / len) * d, z + (a[2] / len) * d);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Cor por vértice: `fn(x, y, z)` no espaço da geometria (ou `world(x, y, z)` com a matriz `m`) → 0xRRGGBB ou Color. */
export function paint(THREE, geo, fn, m = null) {
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3), c = new THREE.Color(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    if (m) v.applyMatrix4(m);
    const r = fn(v.x, v.y, v.z);
    if (typeof r === 'number') c.setHex(r); else c.copy(r);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Mistura duas cores 0xRRGGBB (em sRGB, por canal) com peso t ∈ [0, 1]. */
export function mix(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
/** Escurece/clareia uma cor 0xRRGGBB pelo fator f (1 = igual). */
export function shade(a, f) {
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((a >> s) & 255) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
/** `base` com manchas de ruído (±amt) na frequência `freq` por m. */
export function mottle(base, amt, x, y, z, freq = 6, seed = 0) {
  return shade(base, 1 + (fbm3(x * freq + seed * 3.7, y * freq, z * freq + seed) - 0.5) * 2 * amt);
}
/** Passo suave de a a b. */
export function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

/**
 * Tubo pela curva (CatmullRom pelos pontos `pts`, em m) com o raio indo de `r0` na base a `r1` na ponta (ou `rFn(t)`), com
 * a ponta fechada. `radial` lados, `tubular` anéis.
 */
export function taperTube(THREE, pts, r0, r1, { tubular = 16, radial = 10, rFn = null, closed = true } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => (q.isVector3 ? q : new THREE.Vector3(q[0], q[1], q[2]))));
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const p = geo.attributes.position, c = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular, r = rFn ? rFn(t) : r0 + (r1 - r0) * t;
    curve.getPointAt(t, c);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r);
    }
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  if (!closed) return geo;
  // tampas: esferas pequenas nas pontas ficam a cargo de quem chama (o tubo aberto some de lado a 1×)
  return geo;
}
