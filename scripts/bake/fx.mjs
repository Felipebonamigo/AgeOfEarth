#!/usr/bin/env node
// Gerador do atlas `fx` (docs/ART.md §1.9, §3.3 e Apêndice F — Etapa 5): projéteis em 8 direções com a luz do contrato,
// fogo em flipbook, partículas (faísca, poeira, fumaça, brasa, lasca, folha, gota, brilho) e decalques do chão, tudo
// desenhado por código determinístico em Node (scripts/bake/fx/*.mjs) — sem navegador, sem IA, sem Math.random.
//
// Uso: node scripts/bake/fx.mjs [--scale 1,2] [--out public/art] [--cache art/cache] [--contact docs/art] [--force]
//      (npm run art:fx)
//
// Etapas: (1) hash de entrada = versão + escala + fontes do gerador (fx.mjs, fx/*.mjs, page/camera.js, page/materials.js,
// page/atlas.js); se art/cache/fx/<escala>x-<hash>/ existe, não redesenha; senão desenha cada item do catálogo, recorta
// pelo alfa e grava no cache (frames.json + um PNG por quadro); (2) empacota com o MESMO empacotador dos atlas do bake
// (page/atlas.js: prateleiras, PAD, extrusão, páginas em múltiplos de 32 px) em `fx-<escala>x-<n>.png/.json` (formato
// Spritesheet do Pixi, com meta.aoe do contrato); (3) funde no índice public/art/manifest.json: grupo `fx` (só o passe
// de cor) e o asset `fx` (kind `fx`, itens e atlas por escala), recalculando os totais. O bake dos modelos
// (scripts/bake/bake.mjs) preserva o grupo `fx` quando reescreve o índice.
// `--contact dir` grava a folha de contato dir/etapa5-fx-contato.png (quadros a 2× sobre grama e sobre escuro, com a
// mistura com que o jogo os usa: aditiva, multiplicativa ou normal).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { alphaBounds, crop, packShelf, blit, sheetJson } from './page/atlas.js';
import { atlasMeta } from './page/camera.js';
import { fxItems, fxAnimations } from './fx/catalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Versão do gerador: mudar força redesenhar (o hash já inclui as fontes). */
export const FX_VERSION = 1;
const SOURCES = ['scripts/bake/fx.mjs', 'scripts/bake/fx/catalog.mjs', 'scripts/bake/fx/noise.mjs', 'scripts/bake/fx/light.mjs', 'scripts/bake/fx/raster.mjs',
  'scripts/bake/page/camera.js', 'scripts/bake/page/materials.js', 'scripts/bake/page/atlas.js'];

function parseArgs(argv) {
  const o = { scales: [1, 2], out: 'public/art', cache: 'art/cache', contact: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--scale') o.scales = next().split(',').map(Number);
    else if (a === '--out') o.out = next();
    else if (a === '--cache') o.cache = next();
    else if (a === '--contact') o.contact = next();
    else if (a === '--force') o.force = true;
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 19).join('\n')); process.exit(0); }
    else throw new Error(`argumento desconhecido: ${a}`);
  }
  if (!o.scales.length || !o.scales.every((s) => s === 1 || s === 2)) throw new Error('--scale aceita 1, 2 ou 1,2');
  return o;
}

const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
export function fxInputHash(scale) {
  const h = crypto.createHash('sha256');
  h.update(`fx:${FX_VERSION}\nscale:${scale}\n`);
  for (const f of SOURCES) { h.update(`file:${f}\n`); h.update(fs.readFileSync(path.join(ROOT, f))); }
  return h.digest('hex').slice(0, 16);
}

function readPng(file) { const p = PNG.sync.read(fs.readFileSync(file)); return { w: p.width, h: p.height, data: new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.length) }; }
function writePng(file, w, h, data) {
  const png = new PNG({ width: w, height: h, colorType: 6, inputColorType: 6, bitDepth: 8 });
  png.data = Buffer.from(data.buffer, data.byteOffset, data.length);
  const buf = PNG.sync.write(png, { colorType: 6, deflateLevel: 9 });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return buf;
}
/** JSON do atlas com um quadro/animação por linha (o mesmo formato do bake). */
function formatSheet(json) {
  const block = (obj) => Object.entries(obj).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  return `{\n "frames": {\n${block(json.frames)}\n },\n "animations": {\n${block(json.animations)}\n },\n "meta": ${JSON.stringify(json.meta)}\n}\n`;
}
const r5 = (v) => Math.round(v * 1e5) / 1e5;

/** Desenha (ou lê do cache) todos os itens numa escala: [{ name, family, file, trim, w, h, sourceSize, anchor }]. */
function renderScale(opts, scale) {
  const hash = fxInputHash(scale);
  const dir = path.resolve(ROOT, opts.cache, 'fx', `${scale}x-${hash}`);
  const index = path.join(dir, 'frames.json');
  if (!opts.force && fs.existsSync(index)) {
    console.log(`  fx ${scale}×: cache ${hash} (nada a desenhar)`);
    return { hash, frames: JSON.parse(fs.readFileSync(index, 'utf8')).frames.map((f) => ({ ...f, file: path.join(dir, f.file) })) };
  }
  const t0 = Date.now();
  const tmp = dir + '.tmp';
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const frames = [];
  fxItems().forEach((it, i) => {
    const W = it.w * scale, H = it.h * scale;
    const rgba = it.draw(scale);
    if (rgba.length !== W * H * 4) throw new Error(`${it.name}: desenho ${rgba.length / 4} px ≠ ${W}×${H}`);
    const bb = alphaBounds(rgba, W, H) ?? { x: 0, y: 0, w: 1, h: 1 };
    const img = crop(rgba, W, bb);
    const file = `${String(i).padStart(3, '0')}.png`;
    writePng(path.join(tmp, file), bb.w, bb.h, img);
    frames.push({ name: it.name, family: it.family, blend: it.blend, file, trim: { x: bb.x, y: bb.y }, w: bb.w, h: bb.h, sourceSize: { w: W, h: H }, anchor: { x: r5(it.anchor[0]), y: r5(it.anchor[1]) } });
  });
  fs.writeFileSync(path.join(tmp, 'frames.json'), JSON.stringify({ version: FX_VERSION, scale, hash, frames }, null, 1) + '\n');
  // troca atômica e limpeza das versões velhas desta escala
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
  for (const old of fs.readdirSync(path.dirname(dir))) if (old.startsWith(`${scale}x-`) && path.join(path.dirname(dir), old) !== dir) fs.rmSync(path.join(path.dirname(dir), old), { recursive: true, force: true });
  console.log(`  fx ${scale}×: ${frames.length} quadros desenhados em ${((Date.now() - t0) / 1000).toFixed(1)} s (${hash})`);
  return { hash, frames: frames.map((f) => ({ ...f, file: path.join(dir, f.file) })) };
}

/** Empacota os quadros de uma escala em páginas `fx-<escala>x-<n>` e devolve as entradas do índice. */
function packScale(opts, scale, frames) {
  const outDir = path.resolve(ROOT, opts.out);
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (new RegExp(`^fx-${scale}x-\\d+\\.(png|json)$`).test(f)) fs.rmSync(path.join(outDir, f));
  const byName = new Map(frames.map((f) => [f.name, f]));
  const { pages } = packShelf(frames.map((f) => ({ key: f.name, group: f.family, w: f.w, h: f.h })));
  const animations = fxAnimations();
  const entries = [];
  pages.forEach((pg, n) => {
    const base = `fx-${scale}x-${n}`;
    const data = new Uint8Array(pg.w * pg.h * 4);
    const out = [];
    for (const it of pg.items) {
      const f = byName.get(it.key), img = readPng(f.file);
      blit(data, pg.w, pg.h, img.data, img.w, img.h, it.x, it.y);
      out.push({ name: f.name, x: it.x, y: it.y, w: it.w, h: it.h, trim: f.trim, sourceSize: f.sourceSize, anchor: f.anchor });
    }
    out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const present = new Set(out.map((f) => f.name));
    const anims = {};
    for (const [k, list] of Object.entries(animations)) if (list.every((x) => present.has(x))) anims[k] = list;
    const json = sheetJson({ image: `${base}.png`, size: { w: pg.w, h: pg.h }, scale, frames: out, animations: anims, aoe: atlasMeta({ pass: 'color', scale, mirror: false }) });
    const png = writePng(path.join(outDir, `${base}.png`), pg.w, pg.h, data);
    fs.writeFileSync(path.join(outDir, `${base}.json`), formatSheet(json));
    entries.push({ json: `${base}.json`, image: `${base}.png`, group: 'fx', pass: 'color', scale, page: n, w: pg.w, h: pg.h, frames: out.length, bytes: png.length, sha256: sha(png) });
    console.log(`  ${base}: ${pg.w}×${pg.h}, ${out.length} quadros, ${(png.length / 1024).toFixed(0)} KB`);
  });
  return entries;
}

/** Funde o grupo `fx` no índice public/art/manifest.json (as escalas refeitas agora substituem as antigas). */
function mergeIndex(opts, results) {
  const file = path.resolve(ROOT, opts.out, 'manifest.json');
  let index;
  if (fs.existsSync(file)) index = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    const aoe = atlasMeta({ pass: 'color', scale: 1, mirror: false }); delete aoe.pass; delete aoe.pxPerTile;
    index = { version: 1, app: 'age-of-earth/scripts/bake', aoe, atlases: [], assets: {}, totals: {} };
  }
  const redone = new Set(results.map((r) => r.scale));
  index.atlases = index.atlases.filter((a) => !(a.group === 'fx' && redone.has(a.scale)));
  for (const r of results) index.atlases.push(...r.entries);
  index.atlases.sort((x, y) => (x.json < y.json ? -1 : 1));
  const prev = index.assets.fx;
  const atlases = {};
  for (const a of index.atlases) if (a.group === 'fx') ((atlases[String(a.scale)] ??= { color: [] }).color).push(a.json);
  const names = fxItems().map((i) => i.name);
  const one = results.find((r) => r.scale === 1) ?? results[0];
  const asset = { kind: 'fx', group: 'fx', sourceHash: one.hash ?? prev?.sourceHash, dirs: 8, mirror: false, team: false, shadow: false, frames: names.length, items: names, atlases };
  const assets = {};
  for (const id of [...new Set([...Object.keys(index.assets), 'fx'])].sort()) assets[id] = id === 'fx' ? asset : index.assets[id];
  index.assets = assets;
  index.totals = { pngBytes: index.atlases.reduce((s, a) => s + a.bytes, 0), vramBytes: index.atlases.reduce((s, a) => s + a.w * a.h * 4, 0), atlases: index.atlases.length };
  fs.writeFileSync(file, JSON.stringify(index, null, 1) + '\n');
  const fxBytes = index.atlases.filter((a) => a.group === 'fx').reduce((s, a) => s + a.w * a.h * 4, 0);
  console.log(`  índice: grupo fx com ${Object.keys(atlases).length} escala(s), ${(fxBytes / 1048576).toFixed(2)} MB de VRAM (todas as escalas); total ${index.atlases.length} atlas`);
}

/** Folha de contato: cada família numa linha, quadros a 2× sobre grama (em cima) e sobre escuro (embaixo), com a mistura
 *  do jogo (add / multiply / normal). */
function contactSheet(opts, frames2, scale) {
  const GAP = 6, bgA = [0x5f, 0x7a, 0x33], bgB = [0x24, 0x22, 0x20];
  const fams = [];
  for (const f of frames2) { let g = fams.find((x) => x.name === f.family); if (!g) { g = { name: f.family, list: [] }; fams.push(g); } g.list.push(f); }
  // cada família é um bloco (grama em cima, escuro embaixo); os blocos vão lado a lado até MAXW e quebram a linha
  const MAXW = 1180;
  const bw = (g) => g.list.reduce((s, f) => s + f.sourceSize.w + GAP, GAP), bh = (g) => Math.max(...g.list.map((f) => f.sourceSize.h)) + GAP;
  const place = [];
  let cx = 0, cy = 0, lineH = 0, W = 0;
  for (const g of fams) {
    if (cx > 0 && cx + bw(g) > MAXW) { cx = 0; cy += lineH + GAP; lineH = 0; }
    place.push({ g, x: cx, y: cy });
    cx += bw(g) + GAP; lineH = Math.max(lineH, 2 * bh(g)); W = Math.max(W, cx);
  }
  const H = cy + lineH;
  const data = new Uint8Array(W * H * 4);
  for (let k = 0; k < data.length; k += 4) { data[k] = data[k + 1] = data[k + 2] = 0x10; data[k + 3] = 255; }
  for (const { g, x: bx, y: by } of place) {
    const rh = bh(g), w = bw(g);
    for (let band = 0; band < 2; band++) {
      const bg = band ? bgB : bgA, y = by + band * rh;
      for (let yy = y; yy < y + rh; yy++) for (let x = bx; x < bx + w; x++) { const k = (yy * W + x) * 4; data[k] = bg[0]; data[k + 1] = bg[1]; data[k + 2] = bg[2]; }
      let x = bx + GAP;
      for (const f of g.list) {
        const img = readPng(f.file);
        for (let j = 0; j < img.h; j++) for (let i = 0; i < img.w; i++) {
          const s = (j * img.w + i) * 4, a = img.data[s + 3] / 255; if (!a) continue;
          const d = ((y + GAP / 2 + f.trim.y + j) * W + (x + f.trim.x + i)) * 4;
          for (let c = 0; c < 3; c++) {
            const src = img.data[s + c], dst = data[d + c];
            data[d + c] = f.blend === 'add' ? Math.min(255, Math.round(dst + src * a)) : f.blend === 'multiply' ? Math.round(dst * (1 - a * (1 - src / 255))) : Math.round(dst * (1 - a) + src * a);
          }
        }
        x += f.sourceSize.w + GAP;
      }
    }
  }
  const file = path.resolve(ROOT, opts.contact, 'etapa5-fx-contato.png');
  writePng(file, W, H, data);
  console.log(`  folha de contato (${scale}×): ${path.relative(ROOT, file)} (${W}×${H})`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  console.log(`fx: escala ${opts.scales.join(',')}×`);
  const results = [];
  for (const scale of opts.scales) {
    const r = renderScale(opts, scale);
    results.push({ scale, hash: r.hash, frames: r.frames, entries: packScale(opts, scale, r.frames) });
  }
  mergeIndex(opts, results);
  if (opts.contact) {
    const big = results.find((r) => r.scale === 2) ?? results[0];
    contactSheet(opts, big.frames, big.scale);
  }
  console.log(`pronto em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
