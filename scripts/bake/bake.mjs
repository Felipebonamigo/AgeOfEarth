#!/usr/bin/env node
// Bake de sprites (docs/ART.md §3.1–§3.5): lê art/manifest/*.json, renderiza cada asset no Chromium headless com
// three.js (página scripts/bake/page/) e grava atlas PNG + JSON (formato Spritesheet do PixiJS 8) em public/art/.
//
// Uso:
//   node scripts/bake/bake.mjs [--only hoplite,villager,temple,props] [--scale 1|2|1,2] [--dirs 8|5] [--mirror]
//                              [--pack-only] [--out public/art] [--cache art/cache] [--contact docs/art] [--selftest-glb]
//
// Etapas: (1) valida os manifestos; (2) para cada asset/escala calcula o hash de entrada (manifesto + poses + fontes da
// página + versão do three + PIPELINE_VERSION); se art/cache/<id>/<escala>x-<hash>/ existe, não reassa; senão abre a
// página, assa os quadros (3 passes: cor, time, sombra), recorta e grava no cache; (3) reempacota TODOS os assets com
// cache válido nos atlas `<grupo>[-team|-shadow]-<escala>x-<n>.png/.json` e escreve public/art/manifest.json.
// `--pack-only` pula a etapa 2 (só reempacota o cache; falha se faltar algum asset selecionado).
// `--contact dir` grava as folhas de contato (grade de todas as direções/quadros) em dir/etapa2-<nome>-contato.png.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { startServer } from './server.mjs';
import { loadManifests, validateManifest, validateAll, expandFrames, animationsOf, animSummary, matchesOnly, GROUP_OF, PASSES, bakedDirs, ATLAS_GROUPS, ICON_PX, atlasOf } from './manifest.mjs';
import { alphaBounds, crop, packShelf, blit, sheetJson } from './page/atlas.js';
import { PX_PER_TILE, PIPELINE_VERSION, MIRROR_FROM, atlasMeta } from './page/camera.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE = path.join(ROOT, 'scripts', 'bake', 'page');
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
/** Sufixo de arquivo por passe (docs/ART.md §3.3: units-1x-0 = cor, units-team-1x-0 = máscara, units-shadow-1x-0 = sombra). */
const PASS_SUFFIX = { color: '', team: '-team', shadow: '-shadow' };
/** Nomes das folhas de contato pedidas pelo dono (id → nome em português); os demais usam o id. Unidades e props saem
 *  como etapa2-<nome>, edifícios como etapa3-<nome> (mais etapa3-icones com os ícones do HUD). */
const CONTACT_NAME = { hoplite: 'hoplita', villager: 'cidadao', temple: 'templo', 'props-trees': 'props', 'props-nodes': 'props',
  town_center: 'centro-civico', house: 'casa', wall: 'muralha', gate: 'muralha', tower: 'muralha', rubble: 'escombros' };
const TEAM_PREVIEW = 0x2f4fa8;   // azul de time da tabela 1.6, só nas folhas de contato

// ---------------------------------------------------------------------------------------------------------------
// argumentos

function parseArgs(argv) {
  const o = { only: null, scales: [1], mirror: false, packOnly: false, out: 'public/art', cache: 'art/cache', contact: null, selftestGlb: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--only') o.only = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--scale') o.scales = next().split(',').map(Number);
    else if (a === '--dirs') { const d = Number(next()); if (d === 5) o.mirror = true; else if (d !== 8) throw new Error('--dirs aceita 8 ou 5'); }
    else if (a === '--mirror') o.mirror = true;
    else if (a === '--pack-only') o.packOnly = true;
    else if (a === '--out') o.out = next();
    else if (a === '--cache') o.cache = next();
    else if (a === '--contact') o.contact = next();
    else if (a === '--selftest-glb') o.selftestGlb = true;
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 16).join('\n')); process.exit(0); }
    else throw new Error(`argumento desconhecido: ${a}`);
  }
  if (!o.scales.every((s) => s === 1 || s === 2)) throw new Error('--scale aceita 1, 2 ou 1,2');
  return o;
}

// ---------------------------------------------------------------------------------------------------------------
// hash de entrada e cache

const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const readRel = (p) => fs.readFileSync(path.join(ROOT, p));
/** JSON com chaves ordenadas (hash estável mesmo se o manifesto for reformatado). */
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',')}}`;
  return JSON.stringify(v);
}

function sourceFiles(m) {
  const files = ['scripts/bake/page/camera.js', 'scripts/bake/page/materials.js', 'scripts/bake/page/bake.js'];
  const s = m.source;
  if (s.type === 'glb') files.push(s.path);
  else if (s.rig === 'human') files.push('scripts/bake/page/rigs/human.js', s.poses ?? 'art/poses/human.json');
  else if (s.rig === 'building') files.push('scripts/bake/page/buildings.js', 'scripts/bake/manifest.mjs', ...buildingModules());
  else if (s.rig === 'props') files.push('scripts/bake/page/props.js');
  return files;
}

/** Módulos de estilos de edifícios por lote (page/rigs/buildings-*.js, registrados em buildings.js): entram no hash. */
const buildingModules = () => fs.readdirSync(path.join(PAGE, 'rigs')).filter((f) => /^buildings-.*\.js$/.test(f)).sort().map((f) => `scripts/bake/page/rigs/${f}`);

function inputHash(m, scale, mirror) {
  const h = crypto.createHash('sha256');
  h.update(`pipeline:${PIPELINE_VERSION}\nscale:${scale}\nmirror:${mirror}\n`);
  h.update('three:' + JSON.parse(readRel('node_modules/three/package.json')).version + '\n');
  h.update('manifest:' + canon(m) + '\n');
  for (const f of sourceFiles(m)) { h.update(`file:${f}\n`); h.update(readRel(f)); }
  return h.digest('hex').slice(0, 16);
}

const cacheDir = (opts, m, scale, hash) => path.resolve(ROOT, opts.cache, m.id, `${scale}x-${hash}`);

function readPng(file) { const p = PNG.sync.read(fs.readFileSync(file)); return { w: p.width, h: p.height, data: new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.length) }; }
function writePng(file, w, h, data) {
  const png = new PNG({ width: w, height: h, colorType: 6, inputColorType: 6, bitDepth: 8 });
  png.data = Buffer.from(data.buffer, data.byteOffset, data.length);
  const buf = PNG.sync.write(png, { colorType: 6, deflateLevel: 9 });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return buf;
}

/** Caixa de render (px finais) de um quadro: manifesto ou item de prop (ícone: ICON_PX², centrado). Âncora em px inteiros. */
function boxOf(m, f, scale) {
  if (f.icon) { const s = ICON_PX * scale; return { w: s, h: s, ax: s / 2, ay: s / 2 }; }
  const tiles = f.item?.size ?? m.size.tiles;
  const anchor = f.item?.anchor ?? m.anchor;
  const w = Math.round(tiles[0] * PX_PER_TILE * scale), h = Math.round(tiles[1] * PX_PER_TILE * scale);
  return { w, h, ax: Math.round(anchor[0] * w), ay: Math.round(anchor[1] * h) };
}

// ---------------------------------------------------------------------------------------------------------------
// navegador

let browserCtx = null;
async function browser() {
  if (browserCtx) return browserCtx;
  const { chromium } = await import('playwright');
  const server = await startServer(ROOT);
  const launchOpts = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  if (fs.existsSync(CHROME)) launchOpts.executablePath = CHROME;
  const b = await chromium.launch(launchOpts);
  const page = await b.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', (e) => console.error('[página]', e.message));
  page.on('console', (msg) => { const t = msg.text(); if ((msg.type() === 'error' || msg.type() === 'warning') && !/GPU stall|favicon|status of 404/.test(t)) console.error('[página]', t); });
  await page.goto(`http://127.0.0.1:${server.port}/index.html`);
  await page.waitForFunction(() => window.__ready === true || window.__error, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error('página de bake: ' + err);
  const info = await page.evaluate(() => ({ gl: window.__bake.gl, three: window.__bake.three }));
  console.log(`  navegador pronto (three r${info.three}, ${info.gl})`);
  browserCtx = { b, page, server };
  return browserCtx;
}
async function closeBrowser() { if (browserCtx) { await browserCtx.b.close(); await browserCtx.server.close(); browserCtx = null; } }

const decode = (b64) => { const buf = Buffer.from(b64, 'base64'); return new Uint8Array(buf.buffer, buf.byteOffset, buf.length); };

/** Assa um manifesto numa escala e grava o cache. */
async function bakeAsset(opts, m, scale, hash) {
  const { page } = await browser();
  const t0 = Date.now();
  const frames = expandFrames(m, { mirror: opts.mirror }).map((f) => ({ ...f, box: boxOf(m, f, scale) }));
  const poses = m.source.type === 'param' && m.source.rig === 'human' ? JSON.parse(readRel(m.source.poses ?? 'art/poses/human.json')) : null;
  // lotes: unidade = (animação, direção); edifício = estado (todas as variantes); prop = 6 quadros; ícone = sozinho
  const batches = [];
  if (m.kind === 'prop') for (let i = 0; i < frames.length; i += 6) batches.push(frames.slice(i, i + 6));
  else { const by = new Map(); for (const f of frames) { const k = f.icon ? 'icon' : `${f.anim}/${f.dir}`; if (!by.has(k)) by.set(k, []); by.get(k).push(f); } batches.push(...by.values()); }

  const dir = cacheDir(opts, m, scale, hash);
  const tmp = dir + '.tmp';
  fs.rmSync(tmp, { recursive: true, force: true });
  const entry = { id: m.id, kind: m.kind, hash, scale, mirror: opts.mirror, pipeline: PIPELINE_VERSION, frames: [] };
  const warnings = new Set();
  let idx = 0;
  for (const batch of batches) {
    const res = await page.evaluate((job) => window.__bake.bakeBatch(job), { manifest: m, poses, scale, stateKey: `${m.id}/${hash}`, frames: batch });
    for (let k = 0; k < res.length; k++) {
      const f = batch[k], r = res[k];
      const passes = {};
      for (const pass of PASSES) {
        const b64 = r[pass];
        if (!b64) { passes[pass] = null; continue; }
        const rgba = decode(b64);
        const bb = alphaBounds(rgba, r.w, r.h);
        if (!bb) { passes[pass] = null; continue; }
        if (!f.icon && (bb.x === 0 || bb.y === 0 || bb.x + bb.w === r.w || bb.y + bb.h === r.h)) warnings.add(`${f.name} (${pass}) encosta na borda da caixa ${r.w}×${r.h}: aumente size.tiles`);
        const file = `${pass}/${String(idx).padStart(4, '0')}.png`;
        writePng(path.join(tmp, file), bb.w, bb.h, crop(rgba, r.w, bb));
        passes[pass] = { ...bb, file };
      }
      if (!passes.color) warnings.add(`${f.name}: quadro de cor vazio`);
      entry.frames.push({ name: f.name, group: f.group, anim: f.anim ?? null, variant: f.variant ?? null, atlas: atlasOf(m, f), icon: !!f.icon, dir: f.dir, frame: f.frame, box: f.box, passes });
      idx++;
    }
  }
  fs.writeFileSync(path.join(tmp, 'frames.json'), JSON.stringify(entry, null, 1) + '\n');
  // troca atômica e remove versões antigas deste asset/escala
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  for (const old of fs.readdirSync(path.dirname(dir))) if (old.startsWith(`${scale}x-`) && !old.endsWith('.tmp')) fs.rmSync(path.join(path.dirname(dir), old), { recursive: true, force: true });
  fs.renameSync(tmp, dir);
  for (const w of warnings) console.warn('  aviso:', w);
  console.log(`  ${m.id} ${scale}×: ${entry.frames.length} quadros em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

function loadCache(opts, m, scale, hash) {
  const dir = cacheDir(opts, m, scale, hash);
  const f = path.join(dir, 'frames.json');
  if (!fs.existsSync(f)) return null;
  const entry = JSON.parse(fs.readFileSync(f, 'utf8'));
  entry.dir = dir;
  return entry;
}

// ---------------------------------------------------------------------------------------------------------------
// empacotamento

const r5 = (v) => Math.round(v * 1e5) / 1e5;

/** JSON do atlas com um quadro/animação por linha (diffs legíveis; o Pixi lê como JSON normal). */
function formatSheet(json) {
  const block = (obj) => Object.entries(obj).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  return `{\n "frames": {\n${block(json.frames)}\n },\n "animations": {\n${block(json.animations)}\n },\n "meta": ${JSON.stringify(json.meta)}\n}\n`;
}

/** União dos recortes de um grupo de quadros (todos os passes) → sourceSize e âncora comuns. */
function groupFrames(entry) {
  const groups = new Map();
  for (const fr of entry.frames) {
    if (!groups.has(fr.group)) groups.set(fr.group, []);
    groups.get(fr.group).push(fr);
  }
  const out = new Map();
  for (const [g, list] of groups) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const fr of list) for (const p of PASSES) {
      const r = fr.passes[p]; if (!r) continue;
      x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
    }
    const box = list[0].box;
    if (x0 === Infinity) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; }
    if (list[0].icon) { x0 = 0; y0 = 0; x1 = box.w; y1 = box.h; }   // ícone: moldura fixa ICON_PX² (o HUD enquadra igual)
    // a âncora precisa ficar dentro da caixa (pé de uma sombra deslocada, por exemplo)
    x0 = Math.min(x0, box.ax); y0 = Math.min(y0, box.ay); x1 = Math.max(x1, box.ax + 1); y1 = Math.max(y1, box.ay + 1);
    const w = x1 - x0, h = y1 - y0;
    out.set(g, { x0, y0, w, h, anchor: { x: r5((box.ax - x0) / w), y: r5((box.ay - y0) / h) }, list });
  }
  return out;
}

function packAll(opts, manifests, hashes) {
  const outDir = path.resolve(ROOT, opts.out);
  fs.mkdirSync(outDir, { recursive: true });
  // remove atlas antigos das escalas empacotadas agora (o conjunto é sempre refeito inteiro a partir do cache)
  for (const f of fs.readdirSync(outDir)) if (opts.scales.some((s) => new RegExp(`-${s}x-\\d+\\.(png|json)$`).test(f))) fs.rmSync(path.join(outDir, f));
  const indexPath = path.join(outDir, 'manifest.json');
  const prev = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : null;
  const index = { version: 1, app: 'age-of-earth/scripts/bake', aoe: { ...atlasMeta({ pass: 'color', scale: 1, mirror: opts.mirror }) }, atlases: [], assets: {}, totals: {} };
  delete index.aoe.pass; delete index.aoe.pxPerTile;
  // escalas não refeitas agora continuam no índice
  if (prev) {
    index.atlases = prev.atlases.filter((a) => !opts.scales.includes(a.scale));
    for (const [id, a] of Object.entries(prev.assets)) {
      const keep = Object.fromEntries(Object.entries(a.atlases ?? {}).filter(([s]) => !opts.scales.includes(Number(s))));
      if (Object.keys(keep).length) index.assets[id] = { ...a, atlases: keep };
    }
  }

  const cacheOf = new Map();   // um aviso por asset sem cache (não um por grupo de atlas)
  for (const scale of opts.scales) {
    for (const group of ATLAS_GROUPS) {
      const entries = [];
      for (const m of manifests) {
        const key = `${m.id}/${scale}`;
        if (!cacheOf.has(key)) {
          const e0 = loadCache(opts, m, scale, hashes.get(key));
          if (!e0) console.warn(`  aviso: ${m.id} ${scale}× sem cache válido — fica fora do atlas (assar com --only ${m.id})`);
          cacheOf.set(key, e0);
        }
        const e = cacheOf.get(key);
        if (!e) continue;
        const frames = e.frames.filter((fr) => (fr.atlas ?? GROUP_OF[m.kind]) === group);
        if (!frames.length) continue;
        entries.push({ m, e: { ...e, frames }, groups: groupFrames({ frames }) });
      }
      if (!entries.length) continue;
      for (const pass of PASSES) {
        const items = [];
        const meta = new Map();
        for (const { m, e, groups } of entries) {
          if (pass === 'team' && !m.team) continue;
          if (pass === 'shadow' && !m.shadow) continue;
          for (const [g, G] of groups) for (const fr of G.list) {
            const r = fr.passes[pass]; if (!r) continue;
            items.push({ key: fr.name, group: m.id, w: r.w, h: r.h });   // um asset nunca se divide entre páginas
            meta.set(fr.name, { file: path.join(e.dir, r.file), trim: { x: r.x - G.x0, y: r.y - G.y0 }, sourceSize: { w: G.w, h: G.h }, anchor: G.anchor, m });
          }
        }
        if (!items.length) continue;
        const { pages } = packShelf(items);
        pages.forEach((pg, n) => {
          const base = `${group}${PASS_SUFFIX[pass]}-${scale}x-${n}`;
          const data = new Uint8Array(pg.w * pg.h * 4);
          const frames = [];
          const ids = new Set();
          for (const it of pg.items) {
            const mm = meta.get(it.key);
            const img = readPng(mm.file);
            blit(data, pg.w, pg.h, img.data, img.w, img.h, it.x, it.y);
            frames.push({ name: it.key, x: it.x, y: it.y, w: it.w, h: it.h, trim: mm.trim, sourceSize: mm.sourceSize, anchor: mm.anchor });
            ids.add(mm.m.id);
          }
          frames.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
          const animations = {};
          for (const id of [...ids].sort()) {
            const m = manifests.find((x) => x.id === id);
            const present = new Set(frames.map((f) => f.name));
            for (const [k, list] of Object.entries(animationsOf(m, { mirror: opts.mirror }))) if (list.every((n) => present.has(n))) animations[k] = list;
          }
          const aoe = atlasMeta({ pass, scale, mirror: opts.mirror });
          if (opts.mirror) aoe.mirrored = MIRROR_FROM;
          const json = sheetJson({ image: `${base}.png`, size: { w: pg.w, h: pg.h }, scale, frames, animations, aoe });
          const png = writePng(path.join(outDir, `${base}.png`), pg.w, pg.h, data);
          fs.writeFileSync(path.join(outDir, `${base}.json`), formatSheet(json));
          index.atlases.push({ json: `${base}.json`, image: `${base}.png`, group, pass, scale, page: n, w: pg.w, h: pg.h, frames: frames.length, bytes: png.length, sha256: sha(png) });
          for (const id of ids) {
            const m = manifests.find((x) => x.id === id);
            const a = index.assets[id] ??= {};
            a.atlases ??= {};
            const byScale = a.atlases[String(scale)] ??= {};
            (byScale[pass] ??= []).push(`${base}.json`);
          }
          console.log(`  ${base}: ${pg.w}×${pg.h}, ${frames.length} quadros, ${(png.length / 1024).toFixed(0)} KB`);
        });
      }
      // resumo por asset (o grupo de atlas principal: o dos ícones só acrescenta `icon`)
      for (const { m, e, groups } of entries) {
        const a = index.assets[m.id] ??= {};
        if (group === 'icons') { a.icon = true; continue; }
        const all = cacheOf.get(`${m.id}/${scale}`);
        Object.assign(a, { kind: m.kind, group, sourceHash: e.hash, dirs: m.kind === 'unit' ? m.dirs : 1, mirror: opts.mirror, team: m.team, shadow: m.shadow, frames: all.frames.length });
        if (m.kind === 'building') {
          if (m.variants) { a.variants = m.variants; a.variantBy = m.variantBy; }
          if (m.rubble) a.rubble = true;
        }
        if (m.kind === 'prop') a.items = e.frames.map((f) => f.name);
        else {
          const G = groups.get(m.id);
          a.sizes ??= {};
          a.sizes[String(scale)] = { sourceSize: { w: G.w, h: G.h }, anchor: G.anchor };
          a.anims = animSummary(m);
          if (m.footprint) a.footprint = m.footprint;
        }
      }
    }
  }
  // ordem estável
  index.atlases.sort((x, y) => (x.json < y.json ? -1 : 1));
  const sortedAssets = {};
  for (const id of Object.keys(index.assets).sort()) {
    const a = index.assets[id];
    const atl = {};
    for (const s of Object.keys(a.atlases ?? {}).sort()) { atl[s] = {}; for (const p of PASSES) if (a.atlases[s][p]) atl[s][p] = [...new Set(a.atlases[s][p])].sort(); }
    const { kind, group, sourceHash, dirs, mirror, team, shadow, frames, variants, variantBy, rubble, icon, ...rest } = a;
    sortedAssets[id] = { kind, group, sourceHash, dirs, mirror, team, shadow, frames, ...(variants ? { variants, variantBy } : {}), ...(rubble ? { rubble } : {}), ...(icon ? { icon } : {}), ...rest, atlases: atl };
  }
  index.assets = sortedAssets;
  index.totals = { pngBytes: index.atlases.reduce((s, a) => s + a.bytes, 0), vramBytes: index.atlases.reduce((s, a) => s + a.w * a.h * 4, 0), atlases: index.atlases.length };
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 1) + '\n');
  console.log(`  índice: ${index.atlases.length} atlas, ${(index.totals.pngBytes / 1048576).toFixed(2)} MB em PNG, ${(index.totals.vramBytes / 1048576).toFixed(1)} MB de VRAM se tudo carregado`);
  return index;
}

// ---------------------------------------------------------------------------------------------------------------
// folhas de contato

function cellImg(e, fr, pass, G) {
  const r = fr.passes[pass]; if (!r) return null;
  const img = readPng(path.join(e.dir, r.file));
  return { b64: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length).toString('base64'), w: img.w, h: img.h, x: r.x - G.x0, y: r.y - G.y0 };
}

async function contactSheets(opts, manifests, hashes) {
  const { page } = await browser();
  const outDir = path.resolve(ROOT, opts.contact);
  fs.mkdirSync(outDir, { recursive: true });
  const sheets = new Map();   // nome → { title, rows, cellW, cellH }
  // escombros da pegada no fim da linha de cada edifício (mesma âncora = centro da área), se estiverem no cache
  const rm = loadManifests(path.join(ROOT, 'art', 'manifest')).map((l) => l.manifest).find((x) => x.rubble);
  const re = rm ? loadCache(opts, rm, 1, hashes.get(`${rm.id}/1`)) : null, rg = re ? groupFrames(re) : null;
  const rubbleCell = (m, anchor) => {
    const fr = re && m.footprint && !m.rubble ? re.frames.find((f) => f.anim === `${m.footprint[0]}x${m.footprint[1]}`) : null;
    if (!fr) return null;
    const G = rg.get(fr.group), dx = anchor.x - (fr.box.ax - G.x0), dy = anchor.y - (fr.box.ay - G.y0);
    const c = { color: cellImg(re, fr, 'color', G), team: null, shadow: cellImg(re, fr, 'shadow', G), anchor, label: 'escombros' };
    for (const k of ['color', 'shadow']) if (c[k]) { c[k].x += dx; c[k].y += dy; }
    return c;
  };
  for (const m of manifests) {
    const e = loadCache(opts, m, 1, hashes.get(`${m.id}/1`));
    if (!e) continue;
    const groups = groupFrames(e);
    const name = (m.kind === 'building' ? 'etapa3-' : 'etapa2-') + (m.contact ?? CONTACT_NAME[m.id] ?? m.id);
    const sheet = sheets.get(name) ?? { title: '', rows: [], cellW: 0, cellH: 0, zoom: 2 };
    sheets.set(name, sheet);
    const cell = (fr) => { const G = groups.get(fr.group); return { color: cellImg(e, fr, 'color', G), team: cellImg(e, fr, 'team', G), shadow: cellImg(e, fr, 'shadow', G), anchor: { x: fr.box.ax - G.x0, y: fr.box.ay - G.y0 }, w: G.w, h: G.h }; };
    if (m.kind === 'unit') {
      // linha = direção; colunas = todos os quadros de todas as animações, na ordem do manifesto
      const G = groups.get(m.id);
      sheet.cellW = Math.max(sheet.cellW, G.w); sheet.cellH = Math.max(sheet.cellH, G.h);
      sheet.title = `${m.id} — ${Object.entries(m.anims).map(([a, d]) => `${a} ${d.frames}`).join(' · ')} × 8 direções (linhas: E, SE, S, SO, O, NO, N, NE) · 1× (32 px/tile) ampliado 2×`;
      const dirNames = ['E', 'SE', 'S', 'SO', 'O', 'NO', 'N', 'NE'];
      for (const d of bakedDirs(m, opts.mirror)) {
        const cells = [];
        for (const anim of Object.keys(m.anims)) for (const fr of e.frames.filter((f) => f.anim === anim && f.dir === d)) cells.push({ ...cell(fr), label: fr.frame === 0 ? anim : '' });
        sheet.rows.push({ label: `dir ${d} (${dirNames[d]})`, cells });
      }
    } else if (m.kind === 'building') {
      const G = groups.get(m.id);
      const body = e.frames.filter((fr) => !fr.icon);
      // muralha/portão/torre na mesma folha: células do maior; uma linha por estado quando há variantes
      sheet.cellW = Math.max(sheet.cellW, G.w); sheet.cellH = Math.max(sheet.cellH, G.h);
      sheet.title = (sheet.title ? sheet.title + ' | ' : '') + `${m.id}: ${Object.keys(m.anims).join(' · ')}${m.variants ? ` × ${m.variants.length} variantes (${m.variantBy})` : ''}`;
      const rowCell = { cellW: G.w, cellH: G.h };
      if (m.variants) for (const st of Object.keys(m.anims)) sheet.rows.push({ label: `${m.id} ${st}`, cells: body.filter((fr) => fr.anim === st).map((fr) => ({ ...cell(fr), label: fr.variant })), ...rowCell });
      else sheet.rows.push({ label: m.id, cells: body.map((fr) => ({ ...cell(fr), label: fr.anim })), ...rowCell });
      const rub = rubbleCell(m, { x: body[0].box.ax - G.x0, y: body[0].box.ay - G.y0 });
      if (rub) sheet.rows[sheet.rows.length - 1].cells.push(rub);
      const ic = e.frames.find((fr) => fr.icon);
      if (ic) {
        const icons = sheets.get('etapa3-icones') ?? { title: 'ícones do HUD (64×64 a 1×, cor + máscara de time) ampliados 2×', rows: [{ label: 'ícones', cells: [] }], cellW: ICON_PX, cellH: ICON_PX, zoom: 2 };
        sheets.set('etapa3-icones', icons);
        const IG = groups.get(ic.group);
        icons.rows[0].cells.push({ color: cellImg(e, ic, 'color', IG), team: cellImg(e, ic, 'team', IG), shadow: null, anchor: null, w: IG.w, h: IG.h, label: m.id });
      }
    } else {
      sheet.title = 'props — árvores (oliveira, cipreste, carvalho × 4 variantes × big/small + thin), tocos, rochas, frutas, ouro, Pedra de Poseidon, cervo, javali · 1× ampliado 2×';
      // props: células do tamanho do maior item do manifesto, cada item centrado na horizontal e com o pé a 80 % da altura
      const perRow = 10;
      const all = e.frames.map((fr) => ({ ...cell(fr), label: fr.name }));
      const cw = Math.max(...all.map((c) => c.w));
      const up = Math.max(...all.map((c) => c.anchor.y)), down = Math.max(...all.map((c) => c.h - c.anchor.y));
      const ch = up + down;
      for (const c of all) {
        const dx = Math.floor((cw - c.w) / 2), dy = up - c.anchor.y;
        for (const k of ['color', 'team', 'shadow']) if (c[k]) { c[k].x += dx; c[k].y += dy; }
        c.anchor = { x: c.anchor.x + dx, y: c.anchor.y + dy };
      }
      for (let i = 0; i < all.length; i += perRow) sheet.rows.push({ label: m.id.replace('props-', ''), cells: all.slice(i, i + perRow), cellW: cw, cellH: ch });
      sheet.cellW ||= cw; sheet.cellH ||= ch;
    }
  }
  for (const [name, s] of sheets) {
    const b64 = await page.evaluate((arg) => window.__bake.contactSheet(arg), { title: s.title, rows: s.rows, cellW: s.cellW, cellH: s.cellH, zoom: s.zoom, tint: TEAM_PREVIEW, labelW: 110 });
    const file = path.join(outDir, `${name}-contato.png`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log(`  folha de contato: ${path.relative(ROOT, file)}`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// autoteste do caminho .glb: exporta um modelo de teste pelo próprio three (GLTFExporter), assa-o como `source.type = glb`
// e confere que os quadros saíram (cor e máscara de time). Não toca em public/art.

async function selftestGlb(opts) {
  const { page } = await browser();
  const glbRel = 'art/src/_selftest-villager.glb';
  const b64 = await page.evaluate(() => window.__bake.exportTestGlb());
  fs.mkdirSync(path.join(ROOT, 'art/src'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, glbRel), Buffer.from(b64, 'base64'));
  const m = { id: 'glbtest', kind: 'unit', docs: 'teste do caminho glb', source: { type: 'glb', path: glbRel, scale: 0.5, forward: '-z', anims: { idle: 'Wave' } },
    size: { tiles: [2.4, 2.4] }, anchor: [0.5, 0.62], dirs: 8, anims: { idle: { frames: 4, fps: 10 } }, team: true, shadow: true };
  const errs = validateManifest(m);
  if (errs.length) throw new Error(errs.join('\n'));
  const frames = expandFrames(m).filter((f) => f.dir === 2 || f.dir === 3).map((f) => ({ ...f, box: boxOf(m, f, 1) }));
  const res = await page.evaluate((job) => window.__bake.bakeBatch(job), { manifest: m, poses: null, scale: 1, stateKey: 'glbtest', frames });
  let ok = true;
  const fp = [];
  for (const r of res) {
    const col = alphaBounds(decode(r.color), r.w, r.h), team = r.team && alphaBounds(decode(r.team), r.w, r.h);
    fp.push(sha(Buffer.from(r.color, 'base64')).slice(0, 6));
    if (!col || !team || !r.shadow) { ok = false; console.error(`  ${r.name}: cor=${!!col} time=${!!team} sombra=${!!r.shadow}`); }
  }
  // o clipe "Wave" levanta o braço: os 4 quadros de uma direção têm de diferir
  const distinct = new Set(fp.slice(0, 4)).size;
  if (distinct < 3) { ok = false; console.error(`  a animação do .glb não mudou os quadros (${distinct} distintos)`); }
  console.log(`  autoteste .glb: ${res.length} quadros, ${distinct}/4 distintos na direção S — ${ok ? 'OK' : 'FALHOU'}`);
  if (!ok) process.exitCode = 1;
}

// ---------------------------------------------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const loaded = loadManifests(path.join(ROOT, 'art', 'manifest'));
  const manifests = loaded.map((l) => l.manifest);
  const errors = [...loaded.flatMap((l) => validateManifest(l.manifest).map((e) => `${path.relative(ROOT, l.file)}: ${e}`)), ...validateAll(manifests)];
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  const selected = manifests.filter((m) => matchesOnly(m, opts.only));
  if (opts.only && !selected.length) throw new Error(`--only ${opts.only.join(',')} não casa com nenhum manifesto`);
  const hashes = new Map();
  for (const m of manifests) for (const s of new Set([...opts.scales, 1])) hashes.set(`${m.id}/${s}`, inputHash(m, s, opts.mirror));

  try {
    if (opts.selftestGlb) { await selftestGlb(opts); return; }
    console.log(`bake: ${selected.map((m) => m.id).join(', ')} · escala ${opts.scales.join(',')}× · ${opts.mirror ? '5 direções + 3 espelhadas' : '8 direções'}`);
    for (const scale of opts.scales) for (const m of selected) {
      const hash = hashes.get(`${m.id}/${scale}`);
      if (loadCache(opts, m, scale, hash)) { console.log(`  ${m.id} ${scale}×: cache ${hash} (nada a assar)`); continue; }
      if (opts.packOnly) throw new Error(`${m.id} ${scale}× não está no cache (${hash}); rode sem --pack-only`);
      await bakeAsset(opts, m, scale, hash);
    }
    packAll(opts, manifests, hashes);
    if (opts.contact) await contactSheets(opts, selected, hashes);
  } finally {
    await closeBrowser();
  }
  console.log(`pronto em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
