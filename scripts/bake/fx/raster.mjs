// Rasterização do gerador de efeitos (docs/ART.md Apêndice F), em JS puro e determinístico:
//  - `raymarch`: modelos 3D pequenos (flecha, dardo, pedra, espinho) por campo de distância (SDF), fotografados pela
//    MESMA câmera do bake (ortográfica, pitch 50°, chão 1:1, verticais × cot 50°) e iluminados pela luz do contrato
//    (light.mjs). Super-amostragem ss×ss por pixel; alfa = cobertura.
//  - `raster2d`: texturas 2D (partículas, decalques, fogo) com super-amostragem: `fn(x, y)` em px da imagem devolve
//    [r, g, b, a] em sRGB [0, 1] com alfa reto (não pré-multiplicado); a média pondera a cor pelo alfa.
// Saída: RGBA8 não pré-multiplicado (como o PNG e o empacotador de page/atlas.js esperam).
import { shade, VIEW_DIR, VERTICAL } from './light.mjs';

const clampByte = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));

/** Imagem RGBA8 de `w`×`h` com super-amostragem: `fn(x, y)` → [r, g, b, a] sRGB/alfa reto, ou null (transparente). */
export function raster2d(w, h, ss, fn) {
  const out = new Uint8Array(w * h * 4);
  const n = ss * ss;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
      const c = fn(px + (i + 0.5) / ss, py + (j + 0.5) / ss);
      if (!c || !(c[3] > 0)) continue;
      const al = Math.min(1, c[3]);
      r += c[0] * al; g += c[1] * al; b += c[2] * al; a += al;
    }
    if (a <= 0) continue;
    const k = (py * w + px) * 4;
    out[k] = clampByte(r / a); out[k + 1] = clampByte(g / a); out[k + 2] = clampByte(b / a); out[k + 3] = clampByte(a / n);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// SDF

export const v3 = (x, y, z) => [x, y, z];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));

/** Cápsula de `a` a `b` com raio `ra` em `a` e `rb` em `b` (cone arredondado simples: raio interpolado ao longo do eixo). */
export function sdCapsule(p, a, b, ra, rb = ra) {
  const pa = sub(p, a), ba = sub(b, a);
  const h = Math.max(0, Math.min(1, dot(pa, ba) / dot(ba, ba)));
  const q = [pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h];
  return len(q) - (ra + (rb - ra) * h);
}
/** Caixa centrada na origem com meias-medidas `b`. */
export function sdBox(p, b) {
  const q = [Math.abs(p[0]) - b[0], Math.abs(p[1]) - b[1], Math.abs(p[2]) - b[2]];
  const o = len([Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)]);
  return o + Math.min(Math.max(q[0], Math.max(q[1], q[2])), 0);
}
/** Elipsoide (aproximação de Inigo Quilez) com semieixos `r`. */
export function sdEllipsoid(p, r) {
  const k0 = len([p[0] / r[0], p[1] / r[1], p[2] / r[2]]);
  const k1 = len([p[0] / (r[0] * r[0]), p[1] / (r[1] * r[1]), p[2] / (r[2] * r[2])]);
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
}

/**
 * Fotografa um SDF com a câmera do bake. `size` = [w, h] px, `anchor` = px da origem do modelo (o centro do projétil),
 * `ppt` = px por tile, `sdf(p)` → { d, m } (distância em tiles e índice do material), `mats` = materiais de light.mjs
 * (`{ albedo, rough, metal }`). Raios paralelos: o pixel (x, y) da tela vê os pontos com x = sx e z − y·cot 50° = sy.
 */
export function raymarch({ size: [w, h], anchor: [ax, ay], ppt, sdf, mats, ss = 4, reach = 1.2 }) {
  const out = new Uint8Array(w * h * 4);
  const n = ss * ss;
  const D = VIEW_DIR, Y0 = reach, tMax = (2 * reach) / -D[1];
  const eps = 0.0015;
  const normalAt = (p) => {
    const dx = sdf([p[0] + eps, p[1], p[2]]).d - sdf([p[0] - eps, p[1], p[2]]).d;
    const dy = sdf([p[0], p[1] + eps, p[2]]).d - sdf([p[0], p[1] - eps, p[2]]).d;
    const dz = sdf([p[0], p[1], p[2] + eps]).d - sdf([p[0], p[1], p[2] - eps]).d;
    const l = Math.hypot(dx, dy, dz) || 1;
    return [dx / l, dy / l, dz / l];
  };
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    let r = 0, g = 0, b = 0, cov = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
      const sx = (px + (i + 0.5) / ss - ax) / ppt, sy = (py + (j + 0.5) / ss - ay) / ppt;
      const o = [sx, Y0, sy + Y0 * VERTICAL];
      let t = 0, hit = null;
      for (let s = 0; s < 96 && t < tMax; s++) {
        const p = [o[0] + D[0] * t, o[1] + D[1] * t, o[2] + D[2] * t];
        const q = sdf(p);
        if (q.d < 0.0006) { hit = { p, m: q.m }; break; }
        t += Math.max(q.d * 0.85, 0.0008);
      }
      if (!hit) continue;
      const c = shade(normalAt(hit.p), mats[hit.m]);
      r += c[0]; g += c[1]; b += c[2]; cov++;
    }
    if (!cov) continue;
    const k = (py * w + px) * 4;
    out[k] = clampByte(r / cov); out[k + 1] = clampByte(g / cov); out[k + 2] = clampByte(b / cov); out[k + 3] = clampByte(cov / n);
  }
  return out;
}

/**
 * Base de um modelo na direção `dir` (0 = E, sentido horário na tela: E, SE, S, SO, O, NO, N, NE): converte o ponto do
 * mundo (x leste, y altura, z sul) para o referencial local do projétil (x = frente, y = altura, z = lado direito).
 */
export function toLocal(dir) {
  const a = (dir * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
  return (p) => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
