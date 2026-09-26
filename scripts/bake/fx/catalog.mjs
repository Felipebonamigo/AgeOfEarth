// Catálogo do atlas `fx` (docs/ART.md §1.9, §4 "Efeitos" e Apêndice F): cada item é um quadro com nome, família, tamanho
// a 1× (px; o 2× dobra), âncora e a função que o desenha numa escala. Tudo determinístico (noise.mjs, sem Math.random):
// a mesma entrada gera os mesmos bytes, e o cache do gerador (scripts/bake/fx.mjs) é por hash destes arquivos.
//
// Famílias:
//  - projéteis em 8 direções (`proj/<tipo>/<dir>`, 0 = E, sentido horário na tela), fotografados pela câmera do bake com
//    a luz do contrato: flecha, dardo, pedra, espinho (mantícora); bola de fogo e raio mítico são emissivos (aditivos);
//  - partículas: `puff` (a baforada da fumaça da Etapa 3, idêntica), `smoke/0-3`, `dust/0-3`, `spark`, `ember`, `glow`,
//    `mote`, `chip_wood/0-3`, `chip_stone/0-3`, `leaf/0-3`, `drop`, `ring` e o fogo em flipbook `fire/00-07` (ruído
//    periódico: o 8º quadro emenda no 1º);
//  - decalques do chão: `decal/burn/0-1` (queimadura), `decal/crack/0-1` (rachadura), `decal/impact/0-1` (marca de
//    impacto) e `decal/debris/0-1` (escombros espalhados).
// Cores de partícula "tingíveis" (poeira, fumaça, faísca, brilho) saem claras: o jogo multiplica pelo tint.
import { PALETTE } from '../page/materials.js';
import { hexLin, shade, screenNormal, TO_CAMERA } from './light.mjs';
import { raster2d, raymarch, sdCapsule, sdBox, sdEllipsoid, toLocal } from './raster.mjs';
import { fbm, vnoise, vnoise3, hash2, rng, clamp01, smoothstep, mix } from './noise.mjs';

export const FX_DIRS = 8;
/** Projéteis (8 direções cada). */
export const FX_PROJECTILES = ['arrow', 'javelin', 'stone', 'spike', 'fireball', 'bolt'];
/** Quadros do fogo em flipbook. */
export const FX_FIRE_FRAMES = 8;
const SS = 4;   // super-amostragem por eixo
const PX = 32;  // px por tile a 1× (PX_PER_TILE)
const pad2 = (n) => String(n).padStart(2, '0');

const mat = (hex, rough, metal = 0) => ({ albedo: hexLin(hex), rough, metal });

// ---------------------------------------------------------------------------------------------------------------
// projéteis 3D (tiles; frente = +x local; exagerados ~1,5× na espessura para ler a zoom 1: a haste da flecha teria 0,3 px)

const ARROW_MATS = [mat(0xa8865a, 0.8), mat(PALETTE.bronze, 0.35, 0.9), mat(PALETTE.linen, 0.95)];
function arrowSdf(dir) {
  const L = toLocal(dir);
  return (pw) => {
    const p = L(pw);
    let d = sdCapsule(p, [-0.26, 0, 0], [0.2, 0, 0], 0.02), m = 0;
    const head = sdCapsule(p, [0.19, 0, 0], [0.31, 0, 0], 0.042, 0.004);
    if (head < d) { d = head; m = 1; }
    // três penas a 120° em volta da haste (uma para cima)
    for (let k = 0; k < 3; k++) {
      const a = (k * 2 * Math.PI) / 3, c = Math.cos(a), s = Math.sin(a);
      const q = [p[0] + 0.205, p[1] * c + p[2] * s - 0.03, -p[1] * s + p[2] * c];
      const f = sdBox(q, [0.055, 0.028, 0.006]) - 0.002;
      if (f < d) { d = f; m = 2; }
    }
    return { d, m };
  };
}
const JAVELIN_MATS = [mat(0x9a7a50, 0.8), mat(PALETTE.bronze, 0.35, 0.9), mat(PALETTE.leather, 0.85)];
function javelinSdf(dir) {
  const L = toLocal(dir);
  return (pw) => {
    const p = L(pw);
    let d = sdCapsule(p, [-0.4, 0, 0], [0.26, 0, 0], 0.026), m = 0;
    // ponta em folha: larga de lado (z), fina em altura (y) — vista de cima mostra a folha
    const head = sdEllipsoid([p[0] - 0.335, p[1], p[2]], [0.1, 0.014, 0.038]);
    if (head < d) { d = head; m = 1; }
    const grip = sdCapsule(p, [-0.07, 0, 0], [0.05, 0, 0], 0.032);
    if (grip < d) { d = grip; m = 2; }
    return { d, m };
  };
}
const STONE_MATS = [mat(0x8a8378, 0.95), mat(0x6f6960, 0.95)];
function stoneSdf(dir) {
  // cada direção gira a pedra num ângulo diferente (rolando no ar)
  const a = dir * 0.9 + 0.3, b = dir * 1.7 + 0.5;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  return (pw) => {
    let p = [pw[0] * ca + pw[2] * sa, pw[1], -pw[0] * sa + pw[2] * ca];
    p = [p[0], p[1] * cb + p[2] * sb, -p[1] * sb + p[2] * cb];
    const n = vnoise3(p[0] * 14 + 3, p[1] * 14 + 7, p[2] * 14 + 1, 11) - 0.5;
    const n2 = vnoise3(p[0] * 30, p[1] * 30, p[2] * 30, 12) - 0.5;
    const d = sdEllipsoid(p, [0.125, 0.105, 0.115]) + n * 0.035 + n2 * 0.01;
    return { d: d * 0.8, m: n2 > 0.15 ? 1 : 0 };
  };
}
const SPIKE_MATS = [mat(PALETTE.hoof, 0.7), mat(0xcbbb9a, 0.6)];
function spikeSdf(dir) {
  const L = toLocal(dir);
  return (pw) => {
    const p = L(pw);
    const d = sdCapsule(p, [-0.2, 0, 0], [0.22, 0, 0], 0.038, 0.003);
    return { d, m: p[0] > 0.06 ? 1 : 0 };
  };
}

/** Bola de fogo (emissiva): núcleo quente e cauda de chamas irregular para trás, na direção `dir` da tela. */
function fireballFn(dir, s) {
  const a = (dir * Math.PI) / 4, c = Math.cos(a), sn = Math.sin(a);
  const W = 26 * s, R = 0.1 * PX * s, T = 0.36 * PX * s;
  return (x, y) => {
    const dx = x - W / 2, dy = y - W / 2;
    const f = dx * c + dy * sn, l = -dx * sn + dy * c;         // ao longo da direção e de lado
    const back = Math.max(0, -f), k = clamp01(back / T);
    const n = fbm(f / (2.2 * s) + dir * 7, l / (2.2 * s), 21, 3);
    const rc = Math.hypot(Math.max(0, f) * 1.25, l) / R;
    const core = Math.exp(-rc * rc * 2.2);
    const width = R * Math.pow(1 - k, 0.8) * (0.75 + 0.6 * n) + 0.3 * s;
    const tail = f < 0 ? Math.exp(-((l / width) ** 2) * 1.6) * Math.pow(1 - k, 1.4) * (0.35 + 0.9 * n) : 0;
    const I = core * 1.15 + tail * 0.85;
    if (I < 0.03) return null;
    return [...fireRamp(I * 0.92), smoothstep(0.03, 0.45, I)];
  };
}
/** Raio mítico (emissivo): traço de energia com núcleo branco-azulado e bordas irregulares. */
function boltFn(dir, s) {
  const a = (dir * Math.PI) / 4, c = Math.cos(a), sn = Math.sin(a);
  const W = 28 * s, H = 0.3 * PX * s;
  return (x, y) => {
    const dx = x - W / 2, dy = y - W / 2;
    const f = dx * c + dy * sn, l = -dx * sn + dy * c;
    if (Math.abs(f) > H) return null;
    const wob = (vnoise(f / (2.2 * s) + dir * 5, 3, 31) - 0.5) * 2.2 * s;
    const along = 1 - Math.pow(Math.abs(f) / H, 2);
    const k = Math.exp(-(((l - wob) / (0.9 * s)) ** 2)) * along, glow = Math.exp(-(((l - wob) / (3 * s)) ** 2)) * along * 0.45;
    const I = k + glow;
    if (I < 0.02) return null;
    return [mix(0.55, 1, k), mix(0.8, 1, k), 1, clamp01(I)];
  };
}

// ---------------------------------------------------------------------------------------------------------------
// partículas 2D

/** Rampa de corpo negro do fogo (sRGB): vermelho escuro → laranja → amarelo → branco-amarelado. */
export function fireRamp(I) {
  const stops = [[0, [0.45, 0.06, 0.02]], [0.3, [1, 0.36, 0.05]], [0.6, [1, 0.72, 0.22]], [1, [1, 0.95, 0.75]]];
  const t = Math.min(1, Math.max(0, I));
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    const [t0, c0] = stops[i - 1], [t1, c1] = stops[i], k = (t - t0) / (t1 - t0);
    return [mix(c0[0], c1[0], k), mix(c0[1], c1[1], k), mix(c0[2], c1[2], k)];
  }
  return stops[stops.length - 1][1];
}

/** A baforada da fumaça da Etapa 3 (antes um gradiente de canvas em runtime): o MESMO perfil radial — alfa 0,9 no
 *  círculo de raio 1 px, 0,55 a 45 % e 0 na borda (32 px), branco — para a fumaça dos edifícios não mudar de aparência. */
function puffFn(s) {
  const N = 32 * s, r0 = 1 * s, r1 = N / 2;
  return (x, y) => {
    const r = Math.hypot(x - N / 2, y - N / 2);
    const t = clamp01((r - r0) / (r1 - r0));
    const a = t <= 0.45 ? mix(0.9, 0.55, t / 0.45) : mix(0.55, 0, (t - 0.45) / 0.55);
    return [1, 1, 1, a];
  };
}

/** Normal de um "bilhete" voltado para a câmera (nuvem): u direita, v baixo, w para a câmera → three. */
function billboardNormal(u, v, w) {
  const up = [0, TO_CAMERA[2], -TO_CAMERA[1]];   // "para cima" da tela no mundo (norte e para cima)
  const n = [u + TO_CAMERA[0] * w, -v * up[1] + TO_CAMERA[1] * w, -v * up[2] + TO_CAMERA[2] * w];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

/** Nuvem macia (fumaça/poeira): densidade por 4–6 bolhas gaussianas + fBm (fiapos), iluminada de leve como um volume de
 *  frente para a câmera (o lado noroeste um pouco mais claro — sem o relevo duro de uma pedra). `seed` varia a forma;
 *  `albedo` claro (o jogo tinge). */
function cloudFn(size, s, seed, { albedo, lobes = 5, rough = 0.35, alpha = 0.9 }) {
  const N = size * s, R = rng(seed);
  const blobs = [];
  for (let i = 0; i < lobes; i++) {
    const a = R() * Math.PI * 2, d = R() * 0.3;
    blobs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.22 + R() * 0.14 });
  }
  const dens = (u, v) => {
    let D = 0;
    for (const b of blobs) D += Math.exp(-(((u - b.x) ** 2 + (v - b.y) ** 2) / (b.r * b.r)));
    return D * smoothstep(1, 0.7, Math.hypot(u, v) * 1.22);
  };
  const m = mat(albedo, 1), flat = shade(billboardNormal(0, 0, 1), m);
  return (x, y) => {
    const u = x / N * 2 - 1, v = y / N * 2 - 1;
    const D = dens(u, v);
    const wisp = mix(1 - rough, 1 + rough * 0.4, fbm(u * 4.5 + seed, v * 4.5 - seed, seed, 4));
    const a = smoothstep(0.06, 1.35, D * wisp);
    if (a <= 0.004) return null;
    const e = 0.05, gx = dens(u + e, v) - dens(u - e, v), gy = dens(u, v + e) - dens(u, v - e);
    const lit = shade(billboardNormal(-gx * 0.45, -gy * 0.45, 1), m);
    // normalizada para o lado iluminado ficar quase branco: a COR vem do tint do jogo (poeira da cor do chão, fumaça
    // cinza/escura) — com o cinza médio do sombreado, poeira × tint saía da mesma luminância da grama e sumia
    const k = 1.18;
    return [Math.min(1, mix(flat[0], lit[0], 0.55) * k), Math.min(1, mix(flat[1], lit[1], 0.55) * k), Math.min(1, mix(flat[2], lit[2], 0.55) * k), a * alpha];
  };
}

/** Pequeno sólido deitado no chão (lasca, pedrinha, folha): máscara `inside(u, v)` e altura `height(u, v)` → normal por
 *  diferenças, luz do contrato, contorno macio. u/v em px a 1×. */
function solidFn(inside, height, m) {
  return (u, v) => {
    const k = inside(u, v);
    if (k <= 0) return null;
    const e = 0.25, hx = height(u + e, v) - height(u - e, v), hy = height(u, v + e) - height(u, v - e);
    const n = screenNormal(-hx / (2 * e), -hy / (2 * e), 1);
    const c = shade(n, typeof m === 'function' ? m(u, v) : m);
    return [c[0], c[1], c[2], Math.min(1, k)];
  };
}
/** Polígono convexo aleatório (raio ~`r`, 5–7 lados) como máscara + facetas inclinadas (lasca de pedra). */
function chipStone(seed, s) {
  const R = rng(seed), nv = 5 + Math.floor(R() * 3), c = 3.5 * s, r = (1.9 + R() * 0.8) * s;
  const pts = [];
  for (let i = 0; i < nv; i++) { const a = (i / nv) * Math.PI * 2 + R() * 0.5; const rr = r * (0.7 + R() * 0.45); pts.push([c + Math.cos(a) * rr, c + Math.sin(a) * rr]); }
  const tilt = pts.map(() => [(R() - 0.5) * 1.4, (R() - 0.5) * 1.4]);
  const inside = (u, v) => {
    let md = Infinity;
    for (let i = 0; i < nv; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % nv];
      const ex = x1 - x0, ey = y1 - y0, l = Math.hypot(ex, ey);
      const d = ((v - y0) * ex - (u - x0) * ey) / l;   // > 0 dentro (vértices em ângulo crescente)
      md = Math.min(md, d);
    }
    return clamp01(md / (0.6 * s) + 0.5);
  };
  const height = (u, v) => {
    const a = Math.atan2(v - c, u - c), i = Math.floor((((a / (Math.PI * 2)) % 1 + 1) % 1) * nv) % nv;
    const t = tilt[i];
    return 1.2 * s - Math.hypot(u - c, v - c) * 0.35 + (u - c) * t[0] * 0.3 + (v - c) * t[1] * 0.3;
  };
  const m = mat(R() < 0.5 ? PALETTE.stoneLight : PALETTE.limestone, 0.9);
  return solidFn(inside, height, m);
}
/** Lasca de madeira: tira alongada num ângulo aleatório, com veio. */
function chipWood(seed, s) {
  const R = rng(seed), c = 3.5 * s, a = R() * Math.PI, L = (2.4 + R() * 0.8) * s, W = (0.7 + R() * 0.3) * s;
  const ca = Math.cos(a), sa = Math.sin(a);
  const inside = (u, v) => {
    const f = (u - c) * ca + (v - c) * sa, l = -(u - c) * sa + (v - c) * ca;
    const w = W * (1 - 0.5 * Math.abs(f) / L);
    return clamp01(Math.min((L - Math.abs(f)) / (0.5 * s), (w - Math.abs(l)) / (0.4 * s)) + 0.5);
  };
  const height = (u, v) => { const l = -(u - c) * sa + (v - c) * ca; return 0.8 * s - Math.abs(l) * 0.6; };
  const tone = R() < 0.5 ? 0xb89366 : 0x8a6a45;
  return solidFn(inside, height, (u, v) => mat(hash2(Math.floor(((u - c) * ca + (v - c) * sa) / s * 2), 3, seed) < 0.3 ? 0x6b4a2b : tone, 0.85));
}
/** Folha de oliveira/carvalho: lanceolada, nervura central, levemente curvada. */
function leaf(seed, s) {
  const R = rng(seed), c = 4 * s, a = R() * Math.PI, L = (2.9 + R() * 0.5) * s, W = (1.05 + R() * 0.25) * s;
  const ca = Math.cos(a), sa = Math.sin(a);
  const tone = [PALETTE.olive, PALETTE.oak2, PALETTE.leafDry, PALETTE.olive2][seed % 4];
  const inside = (u, v) => {
    const f = (u - c) * ca + (v - c) * sa, l = -(u - c) * sa + (v - c) * ca;
    const w = W * Math.sqrt(Math.max(0, 1 - (f / L) ** 2));
    return clamp01((w - Math.abs(l)) / (0.45 * s) + 0.5);
  };
  const height = (u, v) => { const f = (u - c) * ca + (v - c) * sa, l = -(u - c) * sa + (v - c) * ca; return 0.6 * s - (f * f) * 0.03 / s + Math.abs(l) * 0.35; };
  return solidFn(inside, height, (u, v) => { const l = -(u - c) * sa + (v - c) * ca; return mat(Math.abs(l) < 0.28 * s ? PALETTE.leafDry : tone, 0.8); });
}

/** Fogo em flipbook: quadro `f` de 8, ruído periódico na vertical (rola para cima e emenda no 1º quadro): línguas que
 *  se separam no alto, base mais quente (amarela) e bordas vermelho-escuras. */
function fireFn(f, s) {
  const W = 24 * s, H = 40 * s, base = H * 0.92;
  const phase = (f / FX_FIRE_FRAMES) * 4;
  return (x, y) => {
    const u = (x - W / 2) / (W / 2), v = (base - y) / base;
    if (v < -0.08 || v > 1) return null;
    const sway = (vnoise(v * 3 - phase * 0.75, 1.5, 44, 0, 3) - 0.5) * 0.6 * Math.max(0, v);
    const uu = u + sway;
    const width = 0.85 * Math.pow(Math.max(0, 1 - v), 0.7) + 0.03;
    const shape = 1 - Math.abs(uu) / width;
    if (shape <= 0) return null;
    const n = fbm(uu * 2.4 + 11, v * 3.2 - phase, 45, 3, 0.55, 0, 4);
    const t = fbm(uu * 5.5 + 3, v * 6.4 - phase * 2, 46, 3, 0.5, 0, 8);
    const I = shape * (0.3 + 1.1 * n) * (0.7 + 0.6 * t) - v * 0.62 + (v < 0 ? v * 3 : 0);
    if (I < 0.03) return null;
    const heat = I * (1.05 - v * 0.45);
    return [...fireRamp(heat), smoothstep(0.03, 0.3, I)];
  };
}

// ---------------------------------------------------------------------------------------------------------------
// decalques (chão; burn/crack/impact são desenhados em multiply: a cor é o fator que escurece o terreno)

function burnFn(seed, s) {
  const N = 64 * s;
  return (x, y) => {
    const u = x / N * 2 - 1, v = y / N * 2 - 1, r = Math.hypot(u, v);
    const th = Math.atan2(v, u);
    const edge = r + (fbm(u * 2.2 + seed, v * 2.2, seed, 4) - 0.5) * 0.55;
    let m = smoothstep(0.98, 0.42, edge);
    const rays = fbm(Math.cos(th) * 2.5 + seed * 3, Math.sin(th) * 2.5, seed + 9, 3);
    m *= mix(1, 0.25 + rays * 1.1, smoothstep(0.35, 0.95, r));
    if (m <= 0.01) return null;
    const soot = fbm(u * 9, v * 9, seed + 3, 3);
    const k = clamp01(1 - r * 1.25 + (soot - 0.5) * 0.5);
    const c = [mix(0.33, 0.1, k), mix(0.27, 0.085, k), mix(0.2, 0.07, k)];
    return [c[0], c[1], c[2], m * mix(0.55, 0.92, k)];
  };
}
/** Rachaduras: galhos de passeio aleatório a partir do centro (3–5 principais, com ramos), afinando para a ponta. */
function crackFn(seed, s) {
  const N = 64 * s, R = rng(seed), segs = [];
  const walk = (x, y, a, n, w) => {
    for (let i = 0; i < n; i++) {
      a += (R() - 0.5) * 0.7;
      const l = (2.2 + R() * 1.6) * s;
      const x1 = x + Math.cos(a) * l, y1 = y + Math.sin(a) * l;
      if (Math.hypot(x1 - N / 2, y1 - N / 2) > N * 0.46) break;
      const wi = w * (1 - (i / n) * 0.65);
      segs.push([x, y, x1, y1, wi]);
      if (R() < 0.22 && n - i > 3) walk(x1, y1, a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.5), Math.floor((n - i) * 0.55), wi * 0.7);
      x = x1; y = y1;
    }
  };
  const main = 3 + Math.floor(R() * 3);
  for (let k = 0; k < main; k++) walk(N / 2 + (R() - 0.5) * 3 * s, N / 2 + (R() - 0.5) * 3 * s, (k / main) * Math.PI * 2 + R() * 0.8, 9 + Math.floor(R() * 5), (1.2 + R() * 0.4) * s);
  return (x, y) => {
    let best = Infinity, bw = 1;
    for (const [x0, y0, x1, y1, w] of segs) {
      const ex = x1 - x0, ey = y1 - y0, t = clamp01(((x - x0) * ex + (y - y0) * ey) / (ex * ex + ey * ey));
      const d = Math.hypot(x - x0 - ex * t, y - y0 - ey * t) / w;
      if (d < best) { best = d; bw = w; }
    }
    const line = smoothstep(0.75, 0.25, best), halo = smoothstep(3.2, 0.6, best) * 0.2;
    const r = Math.hypot(x - N / 2, y - N / 2) / (N / 2);
    const pit = smoothstep(0.35, 0, r) * 0.22;
    const a = Math.max(line * 0.92, halo, pit);
    if (a <= 0.01) return null;
    void bw;
    return line > halo ? [0.16, 0.13, 0.1, a] : [0.35, 0.3, 0.24, a];
  };
}
function impactFn(seed, s) {
  const N = 32 * s, R = rng(seed);
  const specks = [];
  for (let i = 0; i < 16; i++) { const a = R() * Math.PI * 2, d = 0.55 + R() * 0.4; specks.push([Math.cos(a) * d, Math.sin(a) * d, (0.05 + R() * 0.05)]); }
  return (x, y) => {
    const u = x / N * 2 - 1, v = y / N * 2 - 1, r = Math.hypot(u, v) + (fbm(u * 3, v * 3, seed, 3) - 0.5) * 0.25;
    let a = smoothstep(0.75, 0.45, r) * 0.42 + Math.exp(-(((r - 0.56) / 0.12) ** 2)) * 0.35;
    for (const [sx, sy, sr] of specks) if (Math.hypot(u - sx, v - sy) < sr) a = Math.max(a, 0.6);
    if (a <= 0.01) return null;
    return [0.3, 0.24, 0.17, clamp01(a)];
  };
}
/** Escombros espalhados: pedrinhas e lascas iluminadas, com a sombrinha de contato para sudeste. */
function debrisFn(seed, s) {
  const N = 64 * s, R = rng(seed), bits = [];
  const n = 18 + Math.floor(R() * 6);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = Math.pow(R(), 0.7) * 0.8;
    bits.push({ x: N / 2 + Math.cos(a) * d * N / 2, y: N / 2 + Math.sin(a) * d * N / 2, r: (1.1 + R() * 1.9) * s, wood: R() < 0.2, tone: R(), sx: 0.7 + R() * 0.6, rot: R() * Math.PI });
  }
  bits.sort((p, q) => p.y - q.y);
  const stoneM = [mat(PALETTE.stoneLight, 0.9), mat(PALETTE.limestone, 0.85), mat(PALETTE.stoneWarm, 0.92)], woodM = mat(0x8a6a45, 0.85);
  return (x, y) => {
    let out = null;
    let sh = 0;
    for (const b of bits) {
      const c = Math.cos(b.rot), sn = Math.sin(b.rot);
      const dx = x - b.x, dy = y - b.y;
      const f = (dx * c + dy * sn) / (b.wood ? b.r * 1.8 : b.r * b.sx), l = (-dx * sn + dy * c) / (b.wood ? b.r * 0.45 : b.r);
      const q = f * f + l * l;
      const sdx = x - b.x - 0.9 * s, sdy = y - b.y - 0.6 * s;
      const sq = ((sdx * c + sdy * sn) / (b.wood ? b.r * 1.8 : b.r * b.sx)) ** 2 + ((-sdx * sn + sdy * c) / (b.wood ? b.r * 0.45 : b.r)) ** 2;
      if (sq < 1.3) sh = Math.max(sh, 0.42 * clamp01((1.3 - sq) * 2));
      if (q < 1) {
        const hz = Math.sqrt(1 - q);
        const nrm = screenNormal(f * 0.9, l * 0.9, hz + 0.25);
        const col = shade(nrm, b.wood ? woodM : stoneM[Math.floor(b.tone * 3)]);
        out = [col[0], col[1], col[2], clamp01((1 - q) * 6)];
      }
    }
    if (out) return out;
    return sh > 0.01 ? [0.12, 0.1, 0.08, sh] : null;
  };
}

// ---------------------------------------------------------------------------------------------------------------
// catálogo

/**
 * Itens do atlas: `{ name, family, w, h, anchor: [ax, ay], blend, draw(scale) → RGBA8 (w·scale × h·scale) }`.
 * `blend` é a mistura com que o jogo usa o quadro (documentação; o atlas é um só).
 */
export function fxItems() {
  const items = [];
  const add = (name, family, w, h, anchor, blend, fn) => items.push({ name, family, w, h, anchor, blend, draw: (s) => fn(s) });
  const lit = { arrow: [arrowSdf, ARROW_MATS, 26], javelin: [javelinSdf, JAVELIN_MATS, 32], stone: [stoneSdf, STONE_MATS, 14], spike: [spikeSdf, SPIKE_MATS, 20] };
  for (const kind of FX_PROJECTILES) for (let d = 0; d < FX_DIRS; d++) {
    const name = `proj/${kind}/${d}`;
    if (lit[kind]) {
      const [mk, mats, size] = lit[kind];
      add(name, `proj/${kind}`, size, size, [0.5, 0.5], 'normal', (s) => raymarch({ size: [size * s, size * s], anchor: [size * s / 2, size * s / 2], ppt: PX * s, sdf: mk(d), mats, ss: SS, reach: 0.6 }));
    } else if (kind === 'fireball') add(name, 'proj/fireball', 26, 26, [0.5, 0.5], 'add', (s) => raster2d(26 * s, 26 * s, SS, fireballFn(d, s)));
    else add(name, 'proj/bolt', 28, 28, [0.5, 0.5], 'add', (s) => raster2d(28 * s, 28 * s, SS, boltFn(d, s)));
  }
  add('puff', 'puff', 32, 32, [0.5, 0.5], 'normal', (s) => raster2d(32 * s, 32 * s, 1, puffFn(s)));
  for (let k = 0; k < 4; k++) add(`smoke/${k}`, 'smoke', 32, 32, [0.5, 0.5], 'normal', (s) => raster2d(32 * s, 32 * s, SS, cloudFn(32, s, 100 + k, { albedo: 0xd8d4cc, lobes: 5 })));
  for (let k = 0; k < 4; k++) add(`dust/${k}`, 'dust', 24, 24, [0.5, 0.5], 'normal', (s) => raster2d(24 * s, 24 * s, SS, cloudFn(24, s, 200 + k, { albedo: 0xf0e8d8, lobes: 4, rough: 0.5, alpha: 0.8 })));
  add('spark', 'spark', 12, 4, [0.83, 0.5], 'add', (s) => raster2d(12 * s, 4 * s, SS, (x, y) => {
    const t = x / (10 * s), k = Math.exp(-(((y - 2 * s) / (0.8 * s)) ** 2)) * (t <= 1 ? Math.pow(t, 1.6) : Math.max(0, 1 - (t - 1) * 5));
    return k < 0.01 ? null : [1, mix(0.62, 0.97, k), mix(0.25, 0.85, k), k];
  }));
  add('ember', 'ember', 6, 6, [0.5, 0.5], 'add', (s) => raster2d(6 * s, 6 * s, SS, (x, y) => {
    const r = Math.hypot(x - 3 * s, y - 3 * s) / (2.6 * s), k = Math.exp(-r * r * 2.6);
    return k < 0.01 ? null : [1, mix(0.35, 0.85, k), mix(0.08, 0.5, k), k];
  }));
  add('glow', 'glow', 32, 32, [0.5, 0.5], 'add', (s) => raster2d(32 * s, 32 * s, SS, (x, y) => {
    const r = Math.hypot(x - 16 * s, y - 16 * s) / (16 * s), k = Math.exp(-r * r * 5.5) * smoothstep(1, 0.85, r);
    return k < 0.004 ? null : [1, 1, 1, k];
  }));
  add('mote', 'mote', 12, 12, [0.5, 0.5], 'add', (s) => raster2d(12 * s, 12 * s, SS, (x, y) => {
    const dx = (x - 6 * s) / s, dy = (y - 6 * s) / s, r = Math.hypot(dx, dy);
    const k = Math.exp(-r * r * 0.9) + 0.55 * (Math.exp(-dy * dy * 6) + Math.exp(-dx * dx * 6)) * Math.exp(-r * 0.55);
    return k < 0.01 ? null : [1, 1, 1, clamp01(k)];
  }));
  for (let k = 0; k < 4; k++) add(`chip_wood/${k}`, 'chip_wood', 7, 7, [0.5, 0.5], 'normal', (s) => raster2d(7 * s, 7 * s, SS, chipWood(300 + k, s)));
  for (let k = 0; k < 4; k++) add(`chip_stone/${k}`, 'chip_stone', 7, 7, [0.5, 0.5], 'normal', (s) => raster2d(7 * s, 7 * s, SS, chipStone(400 + k, s)));
  for (let k = 0; k < 4; k++) add(`leaf/${k}`, 'leaf', 8, 8, [0.5, 0.5], 'normal', (s) => raster2d(8 * s, 8 * s, SS, leaf(500 + k, s)));
  add('drop', 'drop', 6, 8, [0.5, 0.6], 'normal', (s) => raster2d(6 * s, 8 * s, SS, (x, y) => {
    const u = (x - 3 * s) / s, v = (y - 5 * s) / s;
    const r = v < 0 ? Math.abs(u) / Math.max(0.01, 1.8 * (1 + v / 3.5)) + Math.max(0, -v / 3.5) : Math.hypot(u, v) / 1.8;
    if (r > 1) return null;
    const hl = Math.exp(-(((u + 0.7) ** 2 + (v + 0.2) ** 2) * 1.6));
    return [mix(0.62, 1, hl), mix(0.75, 1, hl), mix(0.88, 1, hl), clamp01((1 - r) * 4) * 0.85];
  }));
  add('ring', 'ring', 64, 64, [0.5, 0.5], 'add', (s) => raster2d(64 * s, 64 * s, SS, (x, y) => {
    const r = Math.hypot(x - 32 * s, y - 32 * s) / (32 * s);
    const k = Math.exp(-(((r - 0.84) / 0.07) ** 2)) + smoothstep(0.84, 0.2, r) * 0.06 * smoothstep(0, 0.5, r);
    return k < 0.004 ? null : [1, 1, 1, clamp01(k)];
  }));
  for (let f = 0; f < FX_FIRE_FRAMES; f++) add(`fire/${pad2(f)}`, 'fire', 24, 40, [0.5, 0.92], 'add', (s) => raster2d(24 * s, 40 * s, SS, fireFn(f, s)));
  for (let k = 0; k < 2; k++) {
    add(`decal/burn/${k}`, 'decal/burn', 64, 64, [0.5, 0.5], 'multiply', (s) => raster2d(64 * s, 64 * s, SS, burnFn(600 + k, s)));
    add(`decal/crack/${k}`, 'decal/crack', 64, 64, [0.5, 0.5], 'multiply', (s) => raster2d(64 * s, 64 * s, SS, crackFn(700 + k, s)));
    add(`decal/impact/${k}`, 'decal/impact', 32, 32, [0.5, 0.5], 'multiply', (s) => raster2d(32 * s, 32 * s, SS, impactFn(800 + k, s)));
    add(`decal/debris/${k}`, 'decal/debris', 64, 64, [0.5, 0.5], 'normal', (s) => raster2d(64 * s, 64 * s, 2, debrisFn(900 + k, s)));
  }
  return items;
}

/** Nomes esperados no atlas (teste e `art:check`). */
export function fxNames() { return fxItems().map((i) => i.name); }
/** Animações do JSON: cada família com mais de um quadro, na ordem do catálogo (projéteis: as 8 direções). */
export function fxAnimations() {
  const out = {};
  for (const it of fxItems()) (out[it.family] ??= []).push(it.name);
  for (const k of Object.keys(out)) if (out[k].length < 2) delete out[k];
  return out;
}
