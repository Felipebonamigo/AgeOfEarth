#!/usr/bin/env node
// Gerador do atlas `hud` (Etapa 7; docs/ART.md §1.10 e Apêndice H): ícones de unidades, tecnologias, poderes, recursos,
// Idades e habilidades e os retratos dos 12 deuses, renderizados dos MESMOS modelos do bake (rigs das unidades, objetos
// de scripts/bake/page/hud-objects.js, bustos de hud-gods.js) com a câmera e a luz do contrato, numa página própria do
// navegador (scripts/bake/page/hud.js) — sem IA, determinístico.
//
// Uso: node scripts/bake/hud.mjs [--scale 1,2] [--out public/art] [--cache art/cache] [--contact docs/art] [--force]
//      [--only unit/,god/zeus]   (npm run art:hud)
//
// Etapas: (1) hash de entrada = versão + escala + fontes (hud.mjs, hud/catalog.mjs, page/hud*.js, camera.js,
// materials.js, atlas.js, os rigs e as poses das unidades, os manifestos de unidade e de edifício, buildings*.js); com o hash no
// cache (art/cache/hud/<escala>x-<hash>/), não renderiza; (2) empacota com o empacotador dos atlas (page/atlas.js) em
// `hud-<escala>x-<n>.png/.json` — cor e, para quem tem partes de time, a máscara (`hud-<escala>x-team-<n>`); (3) funde o
// grupo `hud` no índice public/art/manifest.json (o bake e o art:fx preservam). `--only` renderiza só os nomes com um
// dos prefixos (para iterar; não grava o índice nem o cache). `--contact dir` grava dir/etapa7-icones-contato.png.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { startServer } from './server.mjs';
import { alphaBounds, crop, packShelf, blit, sheetJson } from './page/atlas.js';
import { atlasMeta } from './page/camera.js';
import { posesOf } from './manifest.mjs';
import { RIG_FILES } from './page/rigs/units.js';
import { hudItems } from './hud/catalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
/** Versão do gerador: mudar força renderizar de novo. */
export const HUD_VERSION = 1;

function parseArgs(argv) {
  const o = { scales: [1, 2], out: 'public/art', cache: 'art/cache', contact: null, force: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--scale') o.scales = next().split(',').map(Number);
    else if (a === '--out') o.out = next();
    else if (a === '--cache') o.cache = next();
    else if (a === '--contact') o.contact = next();
    else if (a === '--force') o.force = true;
    else if (a === '--only') o.only = next().split(',').filter(Boolean);
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 17).join('\n')); process.exit(0); }
    else throw new Error(`argumento desconhecido: ${a}`);
  }
  if (!o.scales.length || !o.scales.every((s) => s === 1 || s === 2)) throw new Error('--scale aceita 1, 2 ou 1,2');
  return o;
}

const readRel = (f) => fs.readFileSync(path.join(ROOT, f));
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const pageFiles = () => fs.readdirSync(path.join(ROOT, 'scripts/bake/page')).filter((f) => /^(hud.*|buildings.*|camera|materials|atlas|props)\.js$/.test(f)).sort().map((f) => `scripts/bake/page/${f}`);
const MANIFEST_MJS = 'scripts/bake/manifest.mjs';
const rigFiles = () => [...new Set(['scripts/bake/page/rigs/units.js', ...Object.values(RIG_FILES).flat(), ...fs.readdirSync(path.join(ROOT, 'scripts/bake/page/rigs')).filter((f) => f.endsWith('.js')).map((f) => `scripts/bake/page/rigs/${f}`)])].sort();

/** Manifestos de unidade e de edifício (os ícones de edifício saem do estado/variante do `icon` do manifesto). */
function loadUnitManifests() {
  const dir = path.join(ROOT, 'art/manifest');
  const out = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (m.kind === 'unit' || m.kind === 'building') out[m.id] = m;
  }
  return out;
}
const poseCache = new Map();
function posesFor(m) {
  const p = posesOf(m);
  const load = (f) => { if (!f) return null; if (!poseCache.has(f)) poseCache.set(f, JSON.parse(readRel(f).toString('utf8'))); return poseCache.get(f); };
  return { main: load(p.main), rider: load(p.rider) };
}

export function hudInputHash(scale, manifests) {
  const h = crypto.createHash('sha256');
  h.update(`hud:${HUD_VERSION}\nscale:${scale}\n`);
  h.update('three:' + JSON.parse(readRel('node_modules/three/package.json')).version + '\n');
  for (const f of ['scripts/bake/hud.mjs', 'scripts/bake/hud/catalog.mjs', MANIFEST_MJS, ...pageFiles(), ...rigFiles()]) { h.update(`file:${f}\n`); h.update(readRel(f)); }
  for (const f of fs.readdirSync(path.join(ROOT, 'art/poses')).filter((f) => f.endsWith('.json')).sort()) { h.update(`poses:${f}\n`); h.update(readRel(`art/poses/${f}`)); }
  for (const id of Object.keys(manifests).sort()) h.update(`manifest:${id}:${JSON.stringify(manifests[id])}\n`);
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
const decode = (b64) => { const buf = Buffer.from(b64, 'base64'); return new Uint8Array(buf.buffer, buf.byteOffset, buf.length); };
function formatSheet(json) {
  const block = (obj) => Object.entries(obj).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  return `{\n "frames": {\n${block(json.frames)}\n },\n "animations": {\n${block(json.animations)}\n },\n "meta": ${JSON.stringify(json.meta)}\n}\n`;
}

async function withPage(fn) {
  const { chromium } = await import('playwright');
  const server = await startServer(ROOT);
  const launch = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  if (fs.existsSync(CHROME)) launch.executablePath = CHROME;
  const b = await chromium.launch(launch);
  try {
    const page = await b.newPage({ viewport: { width: 600, height: 400 } });
    page.on('pageerror', (e) => console.error('[página]', e.message));
    page.on('console', (msg) => { const t = msg.text(); if ((msg.type() === 'error' || msg.type() === 'warning') && !/GPU stall|favicon|status of 404/.test(t)) console.error('[página]', t); });
    await page.goto(`http://127.0.0.1:${server.port}/index.html`);
    await page.waitForFunction(() => window.__ready === true || window.__error || window.__bake, null, { timeout: 120000 });
    await page.evaluate(async () => { await import('/hud.js'); });
    const err = await page.evaluate(() => window.__error);
    if (err) throw new Error('página: ' + err);
    return await fn(page);
  } finally { await b.close(); await server.close(); }
}

/** Renderiza (ou lê do cache) os ícones de uma escala: [{ name, file, team, trim, w, h, sourceSize }]. */
async function renderScale(opts, scale, items, manifests, page) {
  const hash = hudInputHash(scale, manifests);
  const dir = path.resolve(ROOT, opts.cache, 'hud', `${scale}x-${hash}`);
  const index = path.join(dir, 'frames.json');
  const partial = !!opts.only;
  if (!opts.force && !partial && fs.existsSync(index)) {
    console.log(`  hud ${scale}×: cache ${hash} (nada a renderizar)`);
    return { hash, frames: JSON.parse(fs.readFileSync(index, 'utf8')).frames.map((f) => ({ ...f, file: path.join(dir, f.file), teamFile: f.teamFile ? path.join(dir, f.teamFile) : null })) };
  }
  const list = partial ? items.filter((it) => opts.only.some((p) => it.name.startsWith(p))) : items;
  const t0 = Date.now();
  const tmp = partial ? path.resolve(ROOT, opts.cache, 'hud', `only-${scale}x`) : dir + '.tmp';
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const frames = [];
  const BATCH = 6;
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    const res = await page.evaluate((job) => window.__hud.renderIcons(job), { scale, items: batch });
    res.forEach((r, k) => {
      const idx = i + k;
      const rgba = decode(r.color);
      const bb = alphaBounds(rgba, r.w, r.h);
      if (!bb) throw new Error(`${r.name}: ícone vazio`);
      const file = `${String(idx).padStart(3, '0')}.png`;
      writePng(path.join(tmp, file), bb.w, bb.h, crop(rgba, r.w, bb));
      let teamFile = null;
      if (r.team) { teamFile = `${String(idx).padStart(3, '0')}-team.png`; writePng(path.join(tmp, teamFile), bb.w, bb.h, crop(decode(r.team), r.w, bb)); }
      const edge = bb.x === 0 || bb.y === 0 || bb.x + bb.w === r.w || bb.y + bb.h === r.h;
      frames.push({ name: r.name, file, teamFile, trim: { x: bb.x, y: bb.y }, w: bb.w, h: bb.h, sourceSize: { w: r.w, h: r.h }, edge });
    });
    process.stdout.write(`\r  hud ${scale}×: ${Math.min(i + BATCH, list.length)}/${list.length}`);
  }
  process.stdout.write('\n');
  fs.writeFileSync(path.join(tmp, 'frames.json'), JSON.stringify({ version: HUD_VERSION, scale, hash, frames }, null, 1) + '\n');
  if (!partial) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
    for (const old of fs.readdirSync(path.dirname(dir))) if (old.startsWith(`${scale}x-`) && path.join(path.dirname(dir), old) !== dir) fs.rmSync(path.join(path.dirname(dir), old), { recursive: true, force: true });
  }
  const base = partial ? tmp : dir;
  console.log(`  hud ${scale}×: ${frames.length} ícones em ${((Date.now() - t0) / 1000).toFixed(1)} s (${hash})`);
  return { hash, frames: frames.map((f) => ({ ...f, file: path.join(base, f.file), teamFile: f.teamFile ? path.join(base, f.teamFile) : null })) };
}

/** Empacota os ícones de uma escala: páginas de cor `hud-<s>x-<n>` e de máscara `hud-<s>x-team-<n>` (mesmas posições). */
function packScale(opts, scale, frames) {
  const outDir = path.resolve(ROOT, opts.out);
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (new RegExp(`^hud-${scale}x-(team-)?\\d+\\.(png|json)$`).test(f)) fs.rmSync(path.join(outDir, f));
  const byName = new Map(frames.map((f) => [f.name, f]));
  const { pages } = packShelf(frames.map((f) => ({ key: f.name, group: f.name.split('/')[0], w: f.w, h: f.h })));
  const entries = [];
  pages.forEach((pg, n) => {
    for (const pass of ['color', 'team']) {
      const base = pass === 'color' ? `hud-${scale}x-${n}` : `hud-${scale}x-team-${n}`;
      const data = new Uint8Array(pg.w * pg.h * 4);
      const out = [];
      for (const it of pg.items) {
        const f = byName.get(it.key);
        const file = pass === 'color' ? f.file : f.teamFile;
        if (!file) continue;
        const img = readPng(file);
        blit(data, pg.w, pg.h, img.data, img.w, img.h, it.x, it.y);
        out.push({ name: f.name, x: it.x, y: it.y, w: it.w, h: it.h, trim: f.trim, sourceSize: f.sourceSize, anchor: { x: 0.5, y: 0.5 } });
      }
      if (!out.length) continue;
      out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      const json = sheetJson({ image: `${base}.png`, size: { w: pg.w, h: pg.h }, scale, frames: out, animations: {}, aoe: atlasMeta({ pass, scale, mirror: false }) });
      const png = writePng(path.join(outDir, `${base}.png`), pg.w, pg.h, data);
      fs.writeFileSync(path.join(outDir, `${base}.json`), formatSheet(json));
      entries.push({ json: `${base}.json`, image: `${base}.png`, group: 'hud', pass, scale, page: n, w: pg.w, h: pg.h, frames: out.length, bytes: png.length, sha256: sha(png) });
      console.log(`  ${base}: ${pg.w}×${pg.h}, ${out.length} ícones, ${(png.length / 1024).toFixed(0)} KB`);
    }
  });
  return entries;
}

/** Funde o grupo `hud` no índice public/art/manifest.json. */
function mergeIndex(opts, results) {
  const file = path.resolve(ROOT, opts.out, 'manifest.json');
  const index = JSON.parse(fs.readFileSync(file, 'utf8'));
  const redone = new Set(results.map((r) => r.scale));
  index.atlases = index.atlases.filter((a) => !(a.group === 'hud' && redone.has(a.scale)));
  for (const r of results) index.atlases.push(...r.entries);
  index.atlases.sort((x, y) => (x.json < y.json ? -1 : 1));
  const atlases = {};
  for (const a of index.atlases) if (a.group === 'hud') ((atlases[String(a.scale)] ??= { color: [], team: [] })[a.pass]).push(a.json);
  const one = results.find((r) => r.scale === 1) ?? results[0];
  const names = one.frames.map((f) => f.name).sort();
  const teamNames = one.frames.filter((f) => f.teamFile).map((f) => f.name).sort();
  const asset = { kind: 'hud', group: 'hud', sourceHash: one.hash, dirs: 1, mirror: false, team: true, shadow: false, frames: names.length, items: names, teamItems: teamNames, atlases };
  const assets = {};
  for (const id of [...new Set([...Object.keys(index.assets), 'hud'])].sort()) assets[id] = id === 'hud' ? asset : index.assets[id];
  index.assets = assets;
  index.totals = { pngBytes: index.atlases.reduce((s, a) => s + a.bytes, 0), vramBytes: index.atlases.reduce((s, a) => s + a.w * a.h * 4, 0), atlases: index.atlases.length };
  fs.writeFileSync(file, JSON.stringify(index, null, 1) + '\n');
  const bytes = index.atlases.filter((a) => a.group === 'hud').reduce((s, a) => s + a.bytes, 0);
  console.log(`  índice: grupo hud com ${names.length} ícones (${teamNames.length} com máscara de time), ${(bytes / 1048576).toFixed(2)} MB de PNG (todas as escalas)`);
}

/** Folha de contato: cada família numa linha, sobre o azul do HUD, com a máscara tingida de azul de time. */
function contactSheet(opts, frames, scale, fileName = 'etapa7-icones-contato.png') {
  const GAP = 8, BG = [0x12, 0x1a, 0x2e], TEAM = [0x3b, 0x82, 0xf6];
  const fams = [];
  for (const f of frames) { const k = f.name.split('/')[0]; let g = fams.find((x) => x.name === k); if (!g) { g = { name: k, list: [] }; fams.push(g); } g.list.push(f); }
  const MAXW = 1500;
  const rows = [];
  for (const g of fams) {
    let row = { list: [], w: GAP, h: 0 };
    for (const f of g.list) {
      if (row.w + f.sourceSize.w + GAP > MAXW) { rows.push(row); row = { list: [], w: GAP, h: 0 }; }
      row.list.push(f); row.w += f.sourceSize.w + GAP; row.h = Math.max(row.h, f.sourceSize.h);
    }
    rows.push(row);
  }
  const W = Math.max(...rows.map((r) => r.w)), H = rows.reduce((s, r) => s + r.h + GAP, GAP);
  const data = new Uint8Array(W * H * 4);
  for (let k = 0; k < data.length; k += 4) { data[k] = BG[0]; data[k + 1] = BG[1]; data[k + 2] = BG[2]; data[k + 3] = 255; }
  let y = GAP;
  for (const row of rows) {
    let x = GAP;
    for (const f of row.list) {
      // moldura do botão
      for (let j = 0; j < f.sourceSize.h; j++) for (let i = 0; i < f.sourceSize.w; i++) { const d = ((y + j) * W + x + i) * 4; data[d] = 0x1b; data[d + 1] = 0x26; data[d + 2] = 0x40; }
      const img = readPng(f.file), team = f.teamFile ? readPng(f.teamFile) : null;
      for (let j = 0; j < img.h; j++) for (let i = 0; i < img.w; i++) {
        const s = (j * img.w + i) * 4; let a = img.data[s + 3] / 255; if (!a) continue;
        const d = ((y + f.trim.y + j) * W + (x + f.trim.x + i)) * 4;
        let c = [img.data[s], img.data[s + 1], img.data[s + 2]];
        if (team) { const ta = team.data[s + 3] / 255; if (ta) c = c.map((v, q) => Math.round(v * (1 - ta) + (team.data[s + q] / 255) * TEAM[q] * ta)); }
        for (let q = 0; q < 3; q++) data[d + q] = Math.round(data[d + q] * (1 - a) + c[q] * a);
      }
      x += f.sourceSize.w + GAP;
    }
    y += row.h + GAP;
  }
  const out = path.resolve(ROOT, opts.contact, fileName);
  writePng(out, W, H, data);
  console.log(`  folha de contato (${scale}×): ${path.relative(ROOT, out)} (${W}×${H})`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const manifests = loadUnitManifests();
  const items = hudItems(manifests, posesFor);
  console.log(`hud: ${items.length} ícones, escala ${opts.scales.join(',')}×${opts.only ? ` (só ${opts.only.join(', ')})` : ''}`);
  const results = await withPage(async (page) => {
    const out = [];
    for (const scale of opts.scales) out.push({ scale, ...(await renderScale(opts, scale, items, manifests, page)) });
    return out;
  });
  // (unidades e retratos encostam de propósito: a arma fina sai do quadro, o busto é cortado embaixo)
  const edges = results.flatMap((r) => r.frames.filter((f) => f.edge && !/^(god|unit|bld)\//.test(f.name) && !['tech/horse_breeding', 'tech/barding', 'tech/automatons'].includes(f.name)).map((f) => `${f.name}@${r.scale}×`));
  if (edges.length) console.warn(`  aviso: encostam na borda (pode estar cortado): ${edges.join(', ')}`);
  if (opts.only) {
    if (opts.contact) contactSheet(opts, (results.find((r) => r.scale === 2) ?? results[0]).frames, 2, 'etapa7-icones-parcial.png');
    console.log(`parcial em ${((Date.now() - t0) / 1000).toFixed(1)} s (índice e atlas não mudaram)`);
    return;
  }
  for (const r of results) r.entries = packScale(opts, r.scale, r.frames);
  mergeIndex(opts, results);
  if (opts.contact) { const big = results.find((r) => r.scale === 2) ?? results[0]; contactSheet(opts, big.frames, big.scale); }
  console.log(`pronto em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
