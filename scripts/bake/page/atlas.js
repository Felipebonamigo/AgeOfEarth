// Empacotador de atlas (docs/ART.md §3.3). Módulo puro — sem three.js nem DOM — usado pelo bake.mjs no Node (e
// disponível para a página). Trabalha com RGBA não pré-multiplicado em Uint8Array.
//
// - `alphaBounds`: caixa dos pixels com alfa > 0 (recorte / trim).
// - `packShelf`: prateleiras (shelf) em páginas de até `maxSize`², com `pad` px entre quadros e `extrude` px de borda
//   repetida em volta de cada quadro (mipmaps/filtragem bilinear sem sangrar o vizinho). Determinístico: a ordem de
//   entrada decide tudo; um "grupo" (asset) nunca é dividido entre páginas, para as animações do JSON do Pixi
//   referenciarem só quadros da mesma folha.
// - `blit`: copia o quadro recortado para a página e extruda as bordas.
// - `sheetJson`: JSON no formato Spritesheet do PixiJS 8 (frames com anchor, animations, meta).

import { PAD, EXTRUDE } from './camera.js';

/** Caixa `{x, y, w, h}` dos pixels com alfa > 0, ou `null` se o quadro está vazio. */
export function alphaBounds(rgba, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (rgba[row + x * 4 + 3] !== 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Recorta `rect` de uma imagem RGBA `w` de largura. */
export function crop(rgba, w, rect) {
  const out = new Uint8Array(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y++) {
    const src = ((rect.y + y) * w + rect.x) * 4;
    out.set(rgba.subarray(src, src + rect.w * 4), y * rect.w * 4);
  }
  return out;
}

/** Espelha horizontalmente uma imagem RGBA. */
export function flipX(rgba, w, h) {
  const out = new Uint8Array(rgba.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4, d = (y * w + (w - 1 - x)) * 4;
    out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = rgba[s + 3];
  }
  return out;
}

const nextPow2 = (v) => { let p = 1; while (p < v) p *= 2; return p; };

/**
 * Empacota `items` (`{ key, group, w, h }`, na ordem desejada) em páginas. Cada grupo é ordenado por altura
 * decrescente (desempate pelo índice original) e colocado inteiro numa página; se não couber, abre-se outra.
 * Devolve `{ pages: [{ w, h, items: [{ key, x, y, w, h }] }] }` (x/y já descontam a extrusão: são o canto do quadro).
 */
export function packShelf(items, { maxSize = 2048, pad = PAD, extrude = EXTRUDE } = {}) {
  const groups = [];
  const byGroup = new Map();
  items.forEach((it, i) => {
    if (!byGroup.has(it.group)) { const g = []; byGroup.set(it.group, g); groups.push(g); }
    byGroup.get(it.group).push({ ...it, i });
  });
  const cell = (it) => ({ cw: it.w + 2 * extrude + pad, ch: it.h + 2 * extrude + pad });
  const newPage = () => ({ shelves: [], y: 0, usedW: 0, items: [] });
  const pages = [newPage()];

  const tryPlace = (page, list) => {
    // simula num clone raso para poder desfazer se o grupo não couber
    const shelves = page.shelves.map((s) => ({ ...s }));
    let y = page.y, usedW = page.usedW;
    const placed = [];
    for (const it of list) {
      const { cw, ch } = cell(it);
      if (cw > maxSize || ch > maxSize) throw new Error(`quadro ${it.key} (${it.w}×${it.h}) maior que o atlas ${maxSize}²`);
      let shelf = shelves.find((s) => s.h >= ch && s.x + cw <= maxSize && s.h <= ch * 1.6);
      if (!shelf) {
        if (y + ch > maxSize) return null;
        shelf = { y, h: ch, x: 0 }; shelves.push(shelf); y += ch;
      }
      placed.push({ key: it.key, x: shelf.x + extrude, y: shelf.y + extrude, w: it.w, h: it.h });
      shelf.x += cw; usedW = Math.max(usedW, shelf.x);
    }
    return { shelves, y, usedW, placed };
  };

  for (const g of groups) {
    const list = [...g].sort((a, b) => b.h - a.h || a.i - b.i);
    let page = pages[pages.length - 1];
    let r = tryPlace(page, list);
    if (!r) { page = newPage(); pages.push(page); r = tryPlace(page, list); }
    if (!r) throw new Error(`grupo ${g[0].group} não cabe num atlas ${maxSize}²`);
    page.shelves = r.shelves; page.y = r.y; page.usedW = r.usedW; page.items.push(...r.placed);
  }
  return {
    pages: pages.filter((p) => p.items.length).map((p) => ({ w: Math.min(maxSize, nextPow2(Math.max(1, p.usedW))), h: Math.min(maxSize, nextPow2(Math.max(1, p.y))), items: p.items })),
  };
}

/** Copia `src` (w×h) para `dst` (largura `dw`) em (x, y) e repete as bordas `extrude` px para fora. */
export function blit(dst, dw, dh, src, w, h, x, y, extrude = EXTRUDE) {
  for (let yy = -extrude; yy < h + extrude; yy++) {
    const sy = Math.min(h - 1, Math.max(0, yy)), ty = y + yy;
    if (ty < 0 || ty >= dh) continue;
    for (let xx = -extrude; xx < w + extrude; xx++) {
      const sx = Math.min(w - 1, Math.max(0, xx)), tx = x + xx;
      if (tx < 0 || tx >= dw) continue;
      const s = (sy * w + sx) * 4, d = (ty * dw + tx) * 4;
      dst[d] = src[s]; dst[d + 1] = src[s + 1]; dst[d + 2] = src[s + 2]; dst[d + 3] = src[s + 3];
    }
  }
}

/**
 * JSON de Spritesheet do Pixi 8. `frames`: `[{ name, x, y, w, h, trim: {x, y}, sourceSize: {w, h}, anchor: {x, y} }]`
 * (x/y/w/h no atlas; trim = deslocamento do recorte dentro do quadro de origem). Chaves em ordem estável.
 */
export function sheetJson({ image, size, scale, frames, animations, aoe }) {
  const out = { frames: {}, animations: {}, meta: {} };
  for (const f of frames) {
    out.frames[f.name] = {
      frame: { x: f.x, y: f.y, w: f.w, h: f.h },
      rotated: false,
      trimmed: f.w !== f.sourceSize.w || f.h !== f.sourceSize.h,
      spriteSourceSize: { x: f.trim.x, y: f.trim.y, w: f.w, h: f.h },
      sourceSize: { w: f.sourceSize.w, h: f.sourceSize.h },
      anchor: { x: f.anchor.x, y: f.anchor.y },
    };
  }
  for (const [k, v] of Object.entries(animations)) out.animations[k] = v;
  out.meta = { app: 'age-of-earth/scripts/bake', version: '1', image, format: 'RGBA8888', size: { w: size.w, h: size.h }, scale: String(scale), aoe };
  return out;
}
