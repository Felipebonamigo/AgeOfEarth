// Quadros 2D pintados (docs/ART_ASSETS.md §3.3): o terceiro caminho de entrega, ao lado do rig paramétrico e do .glb.
// Um manifesto com `"source": { "type": "frames", "path": "art/src/<id>" }` não passa pelo navegador: o bake lê os PNGs da
// pasta, confere nomes e tamanhos contra o manifesto e grava o MESMO cache que o render grava (recorte por passe na caixa
// de render, âncora no pé); daí para frente (atlas, sombra a ½, índice, jogo) nada muda.
//
// Pasta: <path>/<escala>x/<passe>/<quadro>.png — escala 1 e 2 (a 1× pode faltar: sai da 2× por média 2×2, com as âncoras
// alinhadas); passe `color` (obrigatório), `team` (máscara de time, branco iluminado só nas partes de time) e
// `shadow` (só a sombra no chão, preto com alfa); quadro = o nome do manifesto sem o id, com `/` → `_`:
// unidade `walk_3_02` (animação, direção 0–7 a partir do leste no sentido horário, quadro), edifício `complete_0`
// (estado, variante) ou `complete`, ícone de edifício `icon`, prop `tree_0_green`. Cada PNG tem o tamanho da caixa de
// render (size.tiles × 32 px × escala) com o pé no pixel da âncora; `--export-frames <id>` escreve o bake atual nesse
// formato (para pintar por cima), com um guia da caixa e um LEIA-ME com a lista dos arquivos esperados.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { PASSES, ICON_PX } from './manifest.mjs';
import { alphaBounds, crop } from './page/atlas.js';
import { PX_PER_TILE, MIRROR_FROM } from './page/camera.js';

/** Caixa de render (px finais) de um quadro: manifesto ou item de prop (ícone: ICON_PX², centrado). Âncora em px inteiros. */
export function boxOf(m, f, scale) {
  if (f.icon) { const s = ICON_PX * scale; return { w: s, h: s, ax: s / 2, ay: s / 2 }; }
  const tiles = f.item?.size ?? m.size.tiles;
  const anchor = f.item?.anchor ?? m.anchor;
  const w = Math.round(tiles[0] * PX_PER_TILE * scale), h = Math.round(tiles[1] * PX_PER_TILE * scale);
  return { w, h, ax: Math.round(anchor[0] * w), ay: Math.round(anchor[1] * h) };
}

/** Nome do arquivo de um quadro (sem pasta nem extensão). */
export function frameKey(m, f) {
  if (f.icon) return 'icon';
  const n = f.name.startsWith(`${m.id}/`) ? f.name.slice(m.id.length + 1) : f.name;
  return n.replaceAll('/', '_');
}
export const framePath = (dir, scale, pass, key) => path.join(dir, `${scale}x`, pass, `${key}.png`);

export function readPng(file) { const p = PNG.sync.read(fs.readFileSync(file)); return { w: p.width, h: p.height, data: new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.length) }; }
export function writePng(file, w, h, data) {
  const png = new PNG({ width: w, height: h, colorType: 6, inputColorType: 6, bitDepth: 8 });
  png.data = Buffer.from(data.buffer, data.byteOffset, data.length);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png, { colorType: 6, deflateLevel: 9 }));
}

/** PNGs da pasta de quadros (relativos à raiz, em ordem estável): entram no hash de entrada do bake. */
export function frameSourceFiles(root, rel) {
  const base = path.resolve(root, rel);
  const out = [];
  const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.png') && /^[12]x$/.test(path.relative(base, p).split(path.sep)[0])) out.push(path.relative(root, p)); } };
  walk(base);
  return out;
}

/** Média 2×2 com alfa pré-multiplicado (a 2× → 1×). */
export function downsample2(img) {
  const w = img.w >> 1, h = img.h >> 1, src = img.data, out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = ((y * 2 + dy) * img.w + x * 2 + dx) * 4, al = src[i + 3];
      r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += al;
    }
    const o = (y * w + x) * 4;
    if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
    out[o + 3] = Math.round(a / 4);
  }
  return { w, h, data: out };
}

/**
 * Quadro da 2× levado à caixa da 1×: desloca em px inteiros da 2× (exato, sem reamostrar) para a âncora da 2× cair em
 * 2 × a âncora da 1× (as caixas arredondam a cada escala: 109 px a 1× e 218 ou 217 a 2×), recorta/completa em 2w×2h e
 * tira a média 2×2.
 */
export function toHalf(img, box2, box1) {
  const W = box1.w * 2, H = box1.h * 2, dx = box1.ax * 2 - box2.ax, dy = box1.ay * 2 - box2.ay;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < img.h; y++) {
    const ty = y + dy; if (ty < 0 || ty >= H) continue;
    const x0 = Math.max(0, -dx), x1 = Math.min(img.w, W - dx);
    if (x1 > x0) out.set(img.data.subarray((y * img.w + x0) * 4, (y * img.w + x1) * 4), (ty * W + x0 + dx) * 4);
  }
  return downsample2({ w: W, h: H, data: out });
}

/**
 * Importa os quadros de uma escala. `frames` = expandFrames do manifesto com `box` (caixa de render nesta escala) e, na
 * 1×, `box2` (a da 2×, para derivar da 2× quando a pasta 1x não existir). Grava os recortes em `tmp/<passe>/<n>.png` e
 * devolve { frames (do cache), errors, warnings }; com erro, nada deve ser usado.
 */
export function importFrames({ root, m, scale, frames, tmp }) {
  const base = path.resolve(root, m.source.path);
  const errors = [], warnings = [];
  let from = scale, down = false;
  if (!fs.existsSync(path.join(base, `${scale}x`))) {
    if (scale === 1 && fs.existsSync(path.join(base, '2x'))) { from = 2; down = true; }
    else { errors.push(`${m.id}: falta a pasta ${path.relative(root, path.join(base, `${scale}x`))}`); return { frames: [], errors, warnings }; }
  }
  const expected = new Set();
  const out = [];
  frames.forEach((f, idx) => {
    const key = frameKey(m, f);
    const box = f.box, want = down ? f.box2 : box;
    const passes = {};
    for (const pass of PASSES) {
      const file = framePath(base, from, pass, key);
      expected.add(path.resolve(file));
      if (!fs.existsSync(file)) { if (pass === 'color') errors.push(`${m.id} ${scale}×: falta ${path.relative(root, file)}`); passes[pass] = null; continue; }
      let img;
      try { img = readPng(file); } catch (e) { errors.push(`${path.relative(root, file)}: PNG ilegível (${e.message})`); passes[pass] = null; continue; }
      if (img.w !== want.w || img.h !== want.h) { errors.push(`${path.relative(root, file)}: ${img.w}×${img.h}, esperado ${want.w}×${want.h} (a caixa de render; âncora em ${want.ax},${want.ay})`); passes[pass] = null; continue; }
      const px = down ? toHalf(img, want, box) : img;
      const bb = alphaBounds(px.data, px.w, px.h);
      if (!bb) { passes[pass] = null; continue; }
      if (!f.icon && (bb.x === 0 || bb.y === 0 || bb.x + bb.w === px.w || bb.y + bb.h === px.h)) warnings.push(`${f.name} (${pass}) encosta na borda da caixa ${px.w}×${px.h}: deixe margem ou aumente size.tiles`);
      const rel = `${pass}/${String(idx).padStart(4, '0')}.png`;
      writePng(path.join(tmp, rel), bb.w, bb.h, crop(px.data, px.w, bb));
      passes[pass] = { ...bb, file: rel };
    }
    if (passes.color === null && fs.existsSync(framePath(base, from, 'color', key))) warnings.push(`${f.name}: quadro de cor vazio`);
    out.push({ f, passes });
  });
  // arquivos que não casam com nenhum quadro do manifesto (nome errado, direção a mais): aviso, não erro
  for (const pass of PASSES) {
    const d = path.join(base, `${from}x`, pass);
    if (!fs.existsSync(d)) continue;
    for (const n of fs.readdirSync(d)) if (n.endsWith('.png') && !expected.has(path.resolve(d, n))) warnings.push(`${path.relative(root, path.join(d, n))} não é quadro de ${m.id} (esperado ${[...new Set(frames.map((f) => frameKey(m, f)))].slice(0, 3).join(', ')}…)`);
  }
  if (down) warnings.push(`${m.id} 1×: derivada da 2× (média 2×2)`);
  return { frames: out, errors, warnings: [...new Set(warnings)] };
}

/**
 * Medidas de uma unidade de quadros pintados para o índice (o rig paramétrico mede no Node; aqui não há rig): o topo do
 * corpo por direção sai do alfa dos quadros `idle` (px a 1× acima do pé, para a barra de vida) e a passada vem do
 * manifesto (`source.stride`: { walk: tiles por ciclo, run: … }).
 */
export function framesMeasure(m, entry, scale) {
  const tops = new Array(8).fill(-Infinity);
  for (const fr of entry.frames) {
    if (fr.anim !== 'idle' || !fr.passes.color) continue;
    tops[fr.dir] = Math.max(tops[fr.dir], (fr.box.ay - fr.passes.color.y) / scale);
  }
  for (let d = 0; d < 8; d++) if (tops[d] === -Infinity) tops[d] = tops[MIRROR_FROM[d] ?? d] ?? -Infinity;
  const fallback = Math.max(...tops.filter(Number.isFinite), 0);
  const strides = {};
  for (const [anim, v] of Object.entries(m.source?.stride ?? {})) if (typeof v === 'number' && v > 0) strides[anim] = v;
  return { strides, tops: tops.map((t) => Math.round((Number.isFinite(t) ? t : fallback) * 10) / 10) };
}

/** Quadro do cache colado na caixa de render inteira (o formato que o artista pinta). */
function fullBox(entryDir, fr, pass) {
  const r = fr.passes[pass];
  if (!r) return null;
  const src = readPng(path.join(entryDir, r.file));
  const { w, h } = fr.box, out = new Uint8Array(w * h * 4);
  for (let y = 0; y < r.h; y++) out.set(src.data.subarray(y * r.w * 4, (y + 1) * r.w * 4), ((r.y + y) * w + r.x) * 4);
  return { w, h, data: out };
}

/** Guia da caixa: borda, cruz na âncora (pé), quadrado de 1 tile (2 m) no chão e a altura de um homem (1,8 m). */
function guide(box, scale) {
  const { w, h, ax, ay } = box, d = new Uint8Array(w * h * 4);
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3]; };
  for (let x = 0; x < w; x++) { put(x, 0, [128, 128, 128, 255]); put(x, h - 1, [128, 128, 128, 255]); }
  for (let y = 0; y < h; y++) { put(0, y, [128, 128, 128, 255]); put(w - 1, y, [128, 128, 128, 255]); }
  const t = PX_PER_TILE * scale, half = t / 2;
  for (let k = -half; k <= half; k++) { put(Math.round(ax + k), Math.round(ay - half), [242, 193, 78, 200]); put(Math.round(ax + k), Math.round(ay + half), [242, 193, 78, 200]); put(Math.round(ax - half), Math.round(ay + k), [242, 193, 78, 200]); put(Math.round(ax + half), Math.round(ay + k), [242, 193, 78, 200]); }
  const man = Math.round(0.9 * t * 0.84);   // 1,8 m = 0,9 tile; as verticais saem a ×0,84 (pitch 50°)
  for (let y = 0; y <= man; y++) put(ax + Math.round(half) + 3, ay - y, [96, 165, 250, 220]);
  for (let k = -4 * scale; k <= 4 * scale; k++) { put(ax + k, ay, [239, 68, 68, 255]); put(ax, ay + k, [239, 68, 68, 255]); }
  return { w, h, data: d };
}

/**
 * Escreve o bake atual de um asset no formato de quadros 2D: <out>/<escala>x/<passe>/<quadro>.png (caixa inteira),
 * <out>/guia-<escala>x.png e <out>/LEIA-ME.txt. `entries` = { escala: entrada do cache (com `dir`) }.
 */
export function exportFrames({ root, m, entries, out, strides = null }) {
  const outAbs = path.resolve(root, out);
  let files = 0;
  const lines = [];
  for (const [scale, entry] of Object.entries(entries)) {
    const s = Number(scale);
    const first = entry.frames.find((f) => !f.icon);
    if (first) writePng(path.join(outAbs, `guia-${s}x.png`), first.box.w, first.box.h, guide(first.box, s).data);
    for (const fr of entry.frames) {
      const key = frameKey(m, fr);
      for (const pass of PASSES) {
        const img = fullBox(entry.dir, fr, pass);
        if (!img) continue;
        writePng(framePath(outAbs, s, pass, key), img.w, img.h, img.data);
        files++;
      }
      if (s === 1 || !entries[1]) lines.push(`${key}.png  ${fr.box.w}×${fr.box.h} a ${s}× (âncora ${fr.box.ax},${fr.box.ay})${fr.anim ? `  · ${fr.anim}${m.kind === 'unit' ? ` dir ${fr.dir} quadro ${fr.frame}` : ''}` : ''}`);
    }
  }
  const scales = Object.keys(entries).map(Number);
  const readme = [
    `Quadros 2D de ${m.id} (${m.kind}) — Age of Earth, docs/ART_ASSETS.md §3.3`,
    '',
    `Exportados do bake atual para pintar por cima. Pastas: ${scales.map((s) => `${s}x`).join(', ')}; em cada uma, color/ (obrigatório),`,
    'team/ (máscara de time: branco iluminado só nas partes que levam a cor do jogador; o resto transparente) e shadow/ (só a',
    'sombra projetada no chão, preto com alfa). Cada PNG tem o tamanho exato da caixa de render com o pé no pixel da âncora',
    '(guia-<escala>x.png: cruz vermelha = âncora, quadrado dourado = 1 tile = 2 m no chão, traço azul = 1,8 m de altura).',
    'Contrato de câmera e luz: docs/ART_ASSETS.md §2 (ortográfica, pitch 50°, sol de noroeste, sombras para sudeste, 8',
    'direções a partir do leste no sentido horário, 10 fps). A pasta 1x pode faltar: sai da 2× (média 2×2, âncoras alinhadas).',
    '',
    'Para usar: copie a pasta para art/src/<id>/ e troque o source do manifesto (art/manifest/<id>.json) por',
    `  "source": { "type": "frames", "path": "art/src/${m.id}"${m.kind === 'unit' ? `, "stride": ${strides && Object.keys(strides).length ? JSON.stringify(strides) : '{ "walk": <tiles por ciclo> }'}` : ''} }`,
    ...(m.kind === 'unit' ? ['(stride = tiles andados por ciclo de cada animação de andar; os valores acima são os do rig atual — mude se o passo', ' pintado for mais longo ou mais curto, senão os pés deslizam)'] : []),
    'e rode npm run art:bake -- --only <id> --scale 1,2 --contact docs/art ; depois npm run art:check.',
    '',
    `Arquivos esperados por passe (${lines.length}):`,
    ...lines,
    '',
  ].join('\n');
  fs.mkdirSync(outAbs, { recursive: true });
  fs.writeFileSync(path.join(outAbs, 'LEIA-ME.txt'), readme);
  return { files, dir: outAbs };
}
