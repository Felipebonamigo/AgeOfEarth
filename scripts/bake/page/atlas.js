// Empacotador de atlas (docs/ART.md §3.3). Módulo puro — sem three.js nem DOM — usado pelo bake.mjs no Node (e
// disponível para a página). Trabalha com RGBA não pré-multiplicado em Uint8Array.
//
// - `alphaBounds`: caixa dos pixels com alfa > 0 (recorte / trim).
// - `packShelf`: prateleiras (shelf) em páginas de até `maxSize`² (lados em múltiplos de `PAGE_ALIGN`), com `pad` px
//   entre quadros e `extrude` px de borda repetida em volta de cada quadro (mipmaps/filtragem bilinear sem sangrar o vizinho). Determinístico: a ordem de
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

/**
 * Lado de página: o usado arredondado para cima a múltiplos de `PAGE_ALIGN` px (Etapa 4, orçamento de VRAM): o WebGL2
 * (exigido pelo terreno) aceita texturas NPOT com mipmaps, e a potência de 2 deixava páginas quase vazias — props em
 * 2048×512 com 11 % de ocupação, a máscara dos edifícios em 1024² usando 630×511. Múltiplo de 32 mantém blocos 4×4
 * (compressão KTX2 futura) e os primeiros níveis de mipmap inteiros.
 */
export const PAGE_ALIGN = 32;
const alignUp = (v) => Math.ceil(v / PAGE_ALIGN) * PAGE_ALIGN;

/**
 * Densidade de texels do passe de SOMBRA em relação à escala do atlas (Etapa 4, orçamento de VRAM de docs/ART.md §6):
 * a sombra é macia (PCF) e desenhada a 0,45 em multiply, então vai para o atlas a ½ resolução — ¼ da memória. O JSON
 * dela tem `meta.scale` = escala × ½ (o Pixi usa como resolução da textura: o quadro continua do mesmo tamanho no
 * mundo) e `meta.aoe.texel` = ½; frame, recorte e sourceSize ficam em texels da metade.
 */
export const SHADOW_TEXEL = 0.5;

/**
 * Reduz à metade um recorte `w×h` posto em (`ox`, `oy`) da caixa do asset: cada texel é a média 2×2 da grade PAR da
 * caixa (o bake alinha a caixa para a âncora cair num canto par — `groupFrames` —, então um bloco 2×2 nunca atravessa
 * a borda de um tile e a sombra recortada de uma muralha continua emendando na vizinha). Cor pela média ponderada
 * pelo alfa, alfa pela média simples. Devolve `{ data, w, h, x, y }` já recortado ao alfa > 0 (em texels da metade;
 * um recorte que some vira um texel transparente).
 */
export function halve(rgba, w, h, ox, oy) {
  const x0 = Math.floor(ox / 2), y0 = Math.floor(oy / 2);
  const W = Math.ceil((ox + w) / 2) - x0, H = Math.ceil((oy + h) / 2) - y0;
  const out = new Uint8Array(W * H * 4);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    let a = 0, r = 0, g = 0, b = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const sx = (x0 + X) * 2 + dx - ox, sy = (y0 + Y) * 2 + dy - oy;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const s = (sy * w + sx) * 4, al = rgba[s + 3];
      a += al; r += rgba[s] * al; g += rgba[s + 1] * al; b += rgba[s + 2] * al;
    }
    if (!a) continue;
    const d = (Y * W + X) * 4;
    out[d] = Math.round(r / a); out[d + 1] = Math.round(g / a); out[d + 2] = Math.round(b / a); out[d + 3] = Math.round(a / 4);
  }
  const bb = alphaBounds(out, W, H);
  if (!bb) return { data: new Uint8Array(4), w: 1, h: 1, x: x0, y: y0 };
  return { data: bb.w === W && bb.h === H ? out : crop(out, W, bb), w: bb.w, h: bb.h, x: x0 + bb.x, y: y0 + bb.y };
}

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
    pages: pages.filter((p) => p.items.length).map((p) => ({ w: Math.min(maxSize, alignUp(Math.max(1, p.usedW))), h: Math.min(maxSize, alignUp(Math.max(1, p.y))), items: p.items })),
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
