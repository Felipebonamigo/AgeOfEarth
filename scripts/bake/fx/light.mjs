// Luz do contrato (docs/ART.md §1.5, scripts/bake/page/camera.js) reproduzida em JS puro para o gerador de efeitos:
// sol de noroeste-alto (SUN_DIR, SUN_COLOR × SUN_INTENSITY), hemisfério céu/chão (SKY/GROUND × HEMI_INTENSITY),
// difuso de Lambert com as convenções do three.js r0.186 (luzes físicas: irradiância = cor × intensidade, BRDF = albedo/π),
// um especular Blinn-Phong pela rugosidade, reflexo de ambiente nos metais (o RoomEnvironment do bake, aproximado por um
// cinza), tone mapping ACES Filmic (o mesmo do three) e saída sRGB. Assim flechas, pedras e lascas saem com a mesma luz
// das unidades assadas, sem abrir o navegador.
import { SUN_DIR, SUN_COLOR, SUN_INTENSITY, SKY, GROUND, HEMI_INTENSITY, PITCH_DEG } from '../page/camera.js';

export const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
/** 0xRRGGBB (sRGB) → [r, g, b] lineares. */
export const hexLin = (hex) => [srgbToLin(((hex >> 16) & 255) / 255), srgbToLin(((hex >> 8) & 255) / 255), srgbToLin((hex & 255) / 255)];

const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** Direção PARA o sol (three: +x leste, y altura, +z sul). */
export const SUN = norm3(SUN_DIR);
const SUN_RGB = hexLin(SUN_COLOR).map((c) => c * SUN_INTENSITY);
const SKY_RGB = hexLin(SKY).map((c) => c * HEMI_INTENSITY);
const GROUND_RGB = hexLin(GROUND).map((c) => c * HEMI_INTENSITY);
const PITCH = (PITCH_DEG * Math.PI) / 180;
/** Direção de VISÃO da câmera do bake (para o norte e para baixo) e o vetor que aponta para a câmera. */
export const VIEW_DIR = [0, -Math.sin(PITCH), -Math.cos(PITCH)];
export const TO_CAMERA = [0, Math.sin(PITCH), Math.cos(PITCH)];
/** Altura visual das verticais (cot 50° ≈ 0,84): uma altura h (tiles) sobe h·VERTICAL na tela. */
export const VERTICAL = Math.cos(PITCH) / Math.sin(PITCH);

/** ACES Filmic do three.js (exposição 1): entrada e saída lineares. */
export function aces(r, g, b) {
  r /= 0.6; g /= 0.6; b /= 0.6;
  const ir = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const ig = 0.076 * r + 0.90834 * g + 0.01566 * b;
  const ib = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  const fit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  const fr = fit(ir), fg = fit(ig), fb = fit(ib);
  const c = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  return [c(1.60475 * fr - 0.53108 * fg - 0.07367 * fb), c(-0.10208 * fr + 1.10813 * fg - 0.00605 * fb), c(-0.00327 * fr - 0.07276 * fg + 1.07602 * fb)];
}

/**
 * Cor sRGB [0, 1]³ de um ponto de normal `n` (three: y para cima), material `{ albedo: [lin], rough, metal }`, visto da
 * câmera do bake. `ao` escurece o preenchimento (oclusão de contato), `sun` (0–1) atenua o sol (sombra própria).
 */
export function shade(n, mat, ao = 1, sun = 1) {
  const [ar, ag, ab] = mat.albedo;
  const metal = mat.metal ?? 0, rough = mat.rough ?? 0.8;
  const ndl = Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]) * sun;
  const w = 0.5 * n[1] + 0.5;
  const hemi = [GROUND_RGB[0] + (SKY_RGB[0] - GROUND_RGB[0]) * w, GROUND_RGB[1] + (SKY_RGB[1] - GROUND_RGB[1]) * w, GROUND_RGB[2] + (SKY_RGB[2] - GROUND_RGB[2]) * w];
  const kd = (1 - metal) / Math.PI;
  let r = ar * kd * (SUN_RGB[0] * ndl + hemi[0] * ao);
  let g = ag * kd * (SUN_RGB[1] * ndl + hemi[1] * ao);
  let b = ab * kd * (SUN_RGB[2] * ndl + hemi[2] * ao);
  // especular (Blinn-Phong pela rugosidade) com Fresnel de Schlick; F0 = 0,04 nos dielétricos, o albedo nos metais
  const h = norm3([SUN[0] + TO_CAMERA[0], SUN[1] + TO_CAMERA[1], SUN[2] + TO_CAMERA[2]]);
  const ndh = Math.max(0, n[0] * h[0] + n[1] * h[1] + n[2] * h[2]);
  const ndv = Math.max(0, n[0] * TO_CAMERA[0] + n[1] * TO_CAMERA[1] + n[2] * TO_CAMERA[2]);
  const shin = 2 / Math.max(0.02, rough * rough * rough * rough) - 2;
  const spec = ndl > 0 ? ((shin + 8) / (8 * Math.PI)) * Math.pow(ndh, shin) * ndl : 0;
  const fres = Math.pow(1 - ndv, 5);
  const f0 = [0.04 + (ar - 0.04) * metal, 0.04 + (ag - 0.04) * metal, 0.04 + (ab - 0.04) * metal];
  for (let k = 0; k < 3; k++) {
    const F = f0[k] + (1 - f0[k]) * fres;
    const add = F * spec * SUN_RGB[k];
    if (k === 0) r += add; else if (k === 1) g += add; else b += add;
  }
  // reflexo de ambiente dos metais (RoomEnvironment × 0,55 no bake): um cinza claro que some com a rugosidade
  if (metal > 0) {
    const env = 0.55 * 0.6 * (1 - rough * 0.7) * metal;
    r += ar * env * ao; g += ag * env * ao; b += ab * env * ao;
  }
  const t = aces(r, g, b);
  return [linToSrgb(t[0]), linToSrgb(t[1]), linToSrgb(t[2])];
}

/** Normal de TELA (x direita/leste, y baixo/sul, z para cima/para fora do chão) → normal do three (x, y altura, z sul). */
export const screenNormal = (nx, ny, nz) => norm3([nx, nz, ny]);
