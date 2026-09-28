#!/usr/bin/env node
// Bake de sprites (docs/ART.md §3.1–§3.5): lê art/manifest/*.json, renderiza cada asset no Chromium headless com
// three.js (página scripts/bake/page/) e grava atlas PNG + JSON (formato Spritesheet do PixiJS 8) em public/art/.
//
// Uso:
//   node scripts/bake/bake.mjs [--only hoplite,villager,temple,props] [--scale 1|2|1,2] [--dirs 8|5] [--mirror]
//                              [--pack-only] [--out public/art] [--cache art/cache] [--contact docs/art] [--selftest-glb]
//                              [--preview art/examples[,outro.json]] [--export-frames <id> [--to art/src/<id>]]
//                              [--selftest-frames]
//
// Etapas: (1) valida os manifestos; (2) para cada asset/escala calcula o hash de entrada (manifesto + poses + fontes da
// página + versão do three + PIPELINE_VERSION); se art/cache/<id>/<escala>x-<hash>/ existe, não reassa; senão abre a
// página, assa os quadros (3 passes: cor, time, sombra), recorta e grava no cache; (3) reempacota TODOS os assets com
// cache válido nos atlas `<grupo>[-team|-shadow]-<escala>x-<n>.png/.json` e escreve public/art/manifest.json.
// `--pack-only` pula a etapa 2 (só reempacota o cache; falha se faltar algum asset selecionado).
// `--contact dir` grava as folhas de contato (grade de todas as direções/quadros) em dir/etapa<N>-<nome>-contato.png
// (N = `stage` do manifesto; padrão 3 nos edifícios e 2 no resto).
// `--preview pasta|arquivo.json,...` assa manifestos de FORA de art/manifest (exemplos dos rigs, protótipos de um lote)
// só para o cache e as folhas de contato (`--contact`, padrão docs/art): não entram nos atlas nem em public/art.
// Quadros 2D pintados (docs/ART_ASSETS.md §3.3, `frames2d.mjs`): manifesto com `source.type: "frames"` é importado da
// pasta em vez de assado; `--export-frames <id>` escreve o bake atual nesse formato (para pintar por cima) e
// `--selftest-frames` confere a ida e volta byte a byte num cidadão.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { startServer } from './server.mjs';
import { loadManifests, validateManifest, validateAll, expandFrames, animationsOf, animSummary, matchesOnly, GROUP_OF, PASSES, bakedDirs, ATLAS_GROUPS, ICON_PX, atlasOf, posesOf, expandUnitVariants, unitVariantId, scalesOf, mirrorOf, ownMirror } from './manifest.mjs';
import { RIG_FILES } from './page/rigs/units.js';
import { alphaBounds, crop, packShelf, blit, sheetJson, halve, SHADOW_TEXEL } from './page/atlas.js';
import { PX_PER_TILE, PIPELINE_VERSION, MIRROR_FROM, atlasMeta } from './page/camera.js';
import { measureUnit } from './measure.mjs';
import { importFrames, exportFrames, frameSourceFiles, framesMeasure, frameKey, boxOf } from './frames2d.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE = path.join(ROOT, 'scripts', 'bake', 'page');
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
/** Sufixo de arquivo por passe (docs/ART.md §3.3: units-1x-0 = cor, units-team-1x-0 = máscara, units-shadow-1x-0 = sombra). */
const PASS_SUFFIX = { color: '', team: '-team', shadow: '-shadow' };
/** Nomes das folhas de contato pedidas pelo dono (id → nome em português); os demais usam o id. Unidades e props saem
 *  como etapa2-<nome>, edifícios como etapa3-<nome> (mais etapa3-icones com os ícones do HUD). */
const CONTACT_NAME = { hoplite: 'hoplita', villager: 'cidadao', temple: 'templo', 'props-trees': 'props', 'props-nodes': 'props',
  town_center: 'centro-civico', house: 'casa', wall: 'muralha', gate: 'muralha', tower: 'muralha', rubble: 'escombros' };
// lote militar da Etapa 3 numa folha só (docs/art/etapa3-militar-contato.png)
for (const id of ['barracks', 'stable', 'siege_workshop', 'fortress', 'titan_gate', 'wonder_zeus', 'wonder_artemis', 'wonder_colossus']) CONTACT_NAME[id] = 'militar';
const TEAM_PREVIEW = 0x2f4fa8;   // azul de time da tabela 1.6, só nas folhas de contato

// ---------------------------------------------------------------------------------------------------------------
// argumentos

function parseArgs(argv) {
  const o = { only: null, scales: [1], mirror: false, packOnly: false, out: 'public/art', cache: 'art/cache', contact: null, selftestGlb: false, preview: null, exportFrames: null, to: null, selftestFrames: false };
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
    else if (a === '--export-frames') o.exportFrames = next();
    else if (a === '--to') o.to = next();
    else if (a === '--selftest-frames') o.selftestFrames = true;
    else if (a === '--preview') o.preview = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 20).join('\n')); process.exit(0); }
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
  else if (s.type === 'frames') files.push('scripts/bake/frames2d.mjs', ...frameSourceFiles(ROOT, s.path));
  else if (RIG_FILES[s.rig]) {
    // rigs de unidade (Etapa 4): o registro, os arquivos do rig (o cavalo e o cerco incluem o humano) e as poses
    const p = posesOf(m);
    files.push('scripts/bake/page/rigs/units.js', ...RIG_FILES[s.rig], ...[p.main, p.rider].filter(Boolean));
  }
  else if (s.rig === 'building') {
    // buildings.js, os módulos de lote em page/ (buildings-*.js) e em page/rigs/ (buildings-*.js), em ordem estável
    files.push(...fs.readdirSync(PAGE).filter((f) => /^buildings(-[a-z0-9-]+)?\.js$/.test(f)).sort().map((f) => `scripts/bake/page/${f}`), 'scripts/bake/manifest.mjs', ...buildingModules());
  }
  else if (s.rig === 'props') files.push('scripts/bake/page/props.js');
  return files;
}

/** Módulos de estilos de edifícios por lote (page/rigs/buildings-*.js, registrados em buildings.js): entram no hash. */
const buildingModules = () => fs.readdirSync(path.join(PAGE, 'rigs')).filter((f) => /^buildings-.*\.js$/.test(f)).sort().map((f) => `scripts/bake/page/rigs/${f}`);

function inputHash(m, scale, mirror) {
  const h = crypto.createHash('sha256');
  h.update(`pipeline:${PIPELINE_VERSION}\nscale:${scale}\nmirror:${mirrorOf(m, mirror)}${ownMirror(m, mirror) ? '/sombra8' : ''}\n`);
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
  const pf = posesOf(m);
  const poses = { main: pf.main ? JSON.parse(readRel(pf.main)) : null, rider: pf.rider ? JSON.parse(readRel(pf.rider)) : null };
  // lotes: unidade = (animação, direção); edifício = estado (todas as variantes); prop = 6 quadros; ícone = sozinho
  const batches = [];
  if (m.kind === 'prop') for (let i = 0; i < frames.length; i += 6) batches.push(frames.slice(i, i + 6));
  else { const by = new Map(); for (const f of frames) { const k = f.icon ? 'icon' : `${f.anim}/${f.dir}`; if (!by.has(k)) by.set(k, []); by.get(k).push(f); } batches.push(...by.values()); }

  const dir = cacheDir(opts, m, scale, hash);
  const tmp = dir + '.tmp';
  fs.rmSync(tmp, { recursive: true, force: true });
  const entry = { id: m.id, kind: m.kind, hash, scale, mirror: mirrorOf(m, opts.mirror), pipeline: PIPELINE_VERSION, frames: [] };
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
  commitCache(dir, tmp, scale, entry);
  for (const w of warnings) console.warn('  aviso:', w);
  console.log(`  ${m.id} ${scale}×: ${entry.frames.length} quadros em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

/** Grava frames.json e troca a pasta temporária pela do cache (atômico), removendo versões antigas deste asset/escala. */
function commitCache(dir, tmp, scale, entry) {
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'frames.json'), JSON.stringify(entry, null, 1) + '\n');
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  for (const old of fs.readdirSync(path.dirname(dir))) if (old.startsWith(`${scale}x-`) && !old.endsWith('.tmp')) fs.rmSync(path.join(path.dirname(dir), old), { recursive: true, force: true });
  fs.renameSync(tmp, dir);
}

/** Quadros 2D pintados (source.type "frames"): importa a pasta para o cache, sem navegador (frames2d.mjs). */
function importAsset(opts, m, scale, hash) {
  const t0 = Date.now();
  const frames = expandFrames(m, { mirror: opts.mirror }).map((f) => ({ ...f, box: boxOf(m, f, scale), box2: scale === 1 ? boxOf(m, f, 2) : null }));
  const dir = cacheDir(opts, m, scale, hash);
  const tmp = dir + '.tmp';
  fs.rmSync(tmp, { recursive: true, force: true });
  const res = importFrames({ root: ROOT, m, scale, frames, tmp });
  for (const w of res.warnings) console.warn('  aviso:', w);
  if (res.errors.length) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error(`quadros 2D de ${m.id} ${scale}× (${m.source.path}):\n  ${res.errors.slice(0, 20).join('\n  ')}${res.errors.length > 20 ? `\n  … e mais ${res.errors.length - 20}` : ''}`);
  }
  const entry = { id: m.id, kind: m.kind, hash, scale, mirror: mirrorOf(m, opts.mirror), pipeline: PIPELINE_VERSION, source: 'frames',
    frames: res.frames.map(({ f, passes }) => ({ name: f.name, group: f.group, anim: f.anim ?? null, variant: f.variant ?? null, atlas: atlasOf(m, f), icon: !!f.icon, dir: f.dir, frame: f.frame, box: f.box, passes })) };
  commitCache(dir, tmp, scale, entry);
  console.log(`  ${m.id} ${scale}×: ${entry.frames.length} quadros importados de ${m.source.path} em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
/** Assa ou importa, conforme a fonte do manifesto. */
const produce = (opts, m, scale, hash) => (m.source?.type === 'frames' ? importAsset(opts, m, scale, hash) : bakeAsset(opts, m, scale, hash));

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

/**
 * União dos recortes de um grupo de quadros (todos os passes) → sourceSize e âncora comuns. `even` (atlas): caixa par com
 * a âncora num canto par (ver abaixo); as folhas de contato usam a caixa justa, a mesma de antes da sombra a ½.
 */
function groupFrames(entry, { even = false } = {}) {
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
    // caixa par e com a âncora num canto par (sombra a ½: SHADOW_TEXEL): o sourceSize da metade é exato e as bordas dos
    // tiles (a ±16·k px da âncora) caem entre dois blocos 2×2 — a sombra recortada da muralha emenda na vizinha
    if (even && !list[0].icon) { x0 -= (box.ax - x0) % 2; y0 -= (box.ay - y0) % 2; x1 += (x1 - x0) % 2; y1 += (y1 - y0) % 2; }
    const w = x1 - x0, h = y1 - y0;
    out.set(g, { x0, y0, w, h, anchor: { x: r5((box.ax - x0) / w), y: r5((box.ay - y0) / h) }, list });
  }
  return out;
}

/** Medidas do rig de uma unidade paramétrica (passada das animações de andar e topo do corpo por direção), uma vez por
 *  manifesto: vão para o índice (`anims.<anim>.stride`, `tops`). Sem navegador: o rig roda no Node (measure.mjs). */
const measured = new Map();
function measureOf(m) {
  if (!measured.has(m.id)) {
    const pf = posesOf(m);
    const poses = { main: pf.main ? JSON.parse(readRel(pf.main)) : null, rider: pf.rider ? JSON.parse(readRel(pf.rider)) : null };
    measured.set(m.id, measureUnit(m, poses));
  }
  return measured.get(m.id);
}

function packAll(opts, manifests, hashes) {
  const outDir = path.resolve(ROOT, opts.out);
  fs.mkdirSync(outDir, { recursive: true });
  // remove atlas antigos das escalas empacotadas agora (o conjunto é sempre refeito inteiro a partir do cache); o grupo
  // `fx` (Etapa 5) é do gerador próprio (scripts/bake/fx.mjs) e fica como está
  for (const f of fs.readdirSync(outDir)) if (!f.startsWith('fx-') && opts.scales.some((s) => new RegExp(`-${s}x-\\d+\\.(png|json)$`).test(f))) fs.rmSync(path.join(outDir, f));
  const indexPath = path.join(outDir, 'manifest.json');
  const prev = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : null;
  const index = { version: 1, app: 'age-of-earth/scripts/bake', aoe: { ...atlasMeta({ pass: 'color', scale: 1, mirror: opts.mirror }) }, atlases: [], assets: {}, totals: {} };
  delete index.aoe.pass; delete index.aoe.pxPerTile;
  // escalas não refeitas agora continuam no índice
  // (e os grupos `fx` do gerador de efeitos e `hud` do gerador de ícones, em todas as escalas)
  if (prev) {
    index.atlases = prev.atlases.filter((a) => a.group === 'fx' || a.group === 'hud' || !opts.scales.includes(a.scale));
    for (const [id, a] of Object.entries(prev.assets)) {
      if (a.kind === 'fx' || a.kind === 'hud') { index.assets[id] = a; continue; }
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
        if (!scalesOf(m, [scale]).length) continue;   // Etapa 6: o manifesto não assa esta escala (titãs só a 1×)
        if (!cacheOf.has(key)) {
          const e0 = loadCache(opts, m, scale, hashes.get(key));
          if (!e0) console.warn(`  aviso: ${m.id} ${scale}× sem cache válido — fica fora do atlas (assar com --only ${m.id})`);
          cacheOf.set(key, e0);
        }
        const e = cacheOf.get(key);
        if (!e) continue;
        const frames = e.frames.filter((fr) => (fr.atlas ?? GROUP_OF[m.kind]) === group);
        if (!frames.length) continue;
        entries.push({ m, e: { ...e, frames }, groups: groupFrames({ frames }, { even: true }) });
      }
      if (!entries.length) continue;
      // Etapa 6: assets com página própria (`page: 'own'`, as criaturas) depois dos outros, cada um começando numa página
      // nova — as páginas das unidades de antes saem iguais e o carregamento por tipo sobe só as da criatura que apareceu
      entries.sort((x, y) => (x.m.page === 'own' ? 1 : 0) - (y.m.page === 'own' ? 1 : 0));
      for (const pass of PASSES) {
        const items = [];
        const meta = new Map();
        // sombra a ½ resolução (SHADOW_TEXEL): o recorte é reduzido aqui, no empacotamento (o cache guarda o de 1:1)
        const texel = pass === 'shadow' ? SHADOW_TEXEL : 1;
        // quadros idênticos do mesmo asset (mesmos pixels no mesmo lugar da moldura — ex.: a torre, cujas variantes só
        // mudam a sombra) ocupam um lugar só no atlas: o JSON lista todos os nomes apontando para o mesmo retângulo
        const aliases = new Map(), firstOf = new Map();
        for (const { m, e, groups } of entries) {
          if (pass === 'team' && !m.team) continue;
          if (pass === 'shadow' && !m.shadow) continue;
          // espelhamento do manifesto (Etapa 6, titãs): a cor e o time de E, SE e NE ficam fora (o jogo espelha O, SO e NO),
          // menos nas animações assadas só em algumas direções (`dirs`: nunca espelhadas)
          const skip = ownMirror(m, opts.mirror) && pass !== 'shadow' ? (fr) => MIRROR_FROM[fr.dir] !== undefined && !m.anims?.[fr.anim]?.dirs : null;
          for (const [g, G] of groups) for (const fr of G.list) {
            const r = fr.passes[pass]; if (!r || skip?.(fr)) continue;
            const file = path.join(e.dir, r.file);
            let trim = { x: r.x - G.x0, y: r.y - G.y0 }, img = null;
            if (texel !== 1) { const src = readPng(file); img = halve(src.data, src.w, src.h, trim.x, trim.y); trim = { x: img.x, y: img.y }; }
            meta.set(fr.name, { file, img, trim, sourceSize: { w: G.w * texel, h: G.h * texel }, anchor: G.anchor, m });
            const dk = `${m.id}|${g}|${trim.x},${trim.y}|${sha(fs.readFileSync(file))}`;
            const first = firstOf.get(dk);
            if (first) { aliases.get(first).push(fr.name); continue; }
            firstOf.set(dk, fr.name); aliases.set(fr.name, []);
            // um asset só se divide entre páginas se não couber inteiro numa (titãs a 2×): por animação × direção
            items.push({ key: fr.name, group: m.id, w: img ? img.w : r.w, h: img ? img.h : r.h, fresh: m.page === 'own', sub: `${fr.anim ?? ''}/${fr.dir}` });
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
            const img = mm.img ?? readPng(mm.file);
            blit(data, pg.w, pg.h, img.data, img.w, img.h, it.x, it.y);
            for (const name of [it.key, ...aliases.get(it.key)]) { const ma = meta.get(name); frames.push({ name, x: it.x, y: it.y, w: it.w, h: it.h, trim: ma.trim, sourceSize: ma.sourceSize, anchor: ma.anchor }); }
            ids.add(mm.m.id);
          }
          frames.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
          const animations = {};
          for (const id of [...ids].sort()) {
            const m = manifests.find((x) => x.id === id);
            const present = new Set(frames.map((f) => f.name));
            for (const [k, list] of Object.entries(animationsOf(m, { mirror: opts.mirror, pass }))) if (list.every((n) => present.has(n))) animations[k] = list;
          }
          const aoe = atlasMeta({ pass, scale, mirror: opts.mirror });
          if (opts.mirror) aoe.mirrored = MIRROR_FROM;
          else {
            // Etapa 6 (lote titãs): espelhamento por asset — a página (própria) diz quem ela espelha; o global fica intacto
            // (só cor e time: a sombra desses assets tem as 8 direções e não espelha)
            const mids = pass === 'shadow' ? [] : [...ids].filter((id) => mirrorOf(manifests.find((x) => x.id === id))).sort();
            if (mids.length) aoe.mirroredAssets = Object.fromEntries(mids.map((id) => [id, MIRROR_FROM]));
          }
          if (texel !== 1) aoe.texel = texel;
          const json = sheetJson({ image: `${base}.png`, size: { w: pg.w, h: pg.h }, scale: scale * texel, frames, animations, aoe });
          const png = writePng(path.join(outDir, `${base}.png`), pg.w, pg.h, data);
          fs.writeFileSync(path.join(outDir, `${base}.json`), formatSheet(json));
          index.atlases.push({ json: `${base}.json`, image: `${base}.png`, group, pass, scale, ...(texel !== 1 ? { texel } : {}), page: n, w: pg.w, h: pg.h, frames: frames.length, bytes: png.length, sha256: sha(png) });
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
        Object.assign(a, { kind: m.kind, group, sourceHash: e.hash, dirs: m.kind === 'unit' ? m.dirs : 1, mirror: mirrorOf(m, opts.mirror), team: m.team, shadow: m.shadow, frames: all.frames.length });
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
          const me = m.kind !== 'unit' ? null : m.source?.type === 'frames' ? framesMeasure(m, e, scale) : measureOf(m);
          if (me) {
            for (const [anim, st] of Object.entries(me.strides)) if (a.anims[anim] && st > 0) a.anims[anim].stride = st;
            a.tops = me.tops;
          }
          if (m.footprint) a.footprint = m.footprint;
          // Etapa 6: classe de tamanho, voadora e variantes pela entidade (hidra: o renderizador escolhe o asset pelas cabeças)
          if (m.kind === 'unit') {
            if (m.sizeClass && m.sizeClass !== 'unit') a.sizeClass = m.sizeClass;
            if (m.flying) a.flying = true;
            if (m.unitVariants) a.unitVariants = { by: m.unitVariants.by, ids: Object.fromEntries(m.unitVariants.values.map((v) => [String(v), unitVariantId(m, v)])) };
            if (m.variantOf) { a.variantOf = m.variantOf; a.variantValue = m.variantValue; }
          }
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

/**
 * Célula espelhada como o jogo desenha uma direção espelhada (Etapa 6, `mirror` no asset): cor e time com `scale.x = −1`
 * em torno da âncora (eixo arredondado a ½ px), cortados à largura da célula; a sombra fica como está (o sol é fixo).
 */
function flipCell(c, cw) {
  const ax2 = Math.round(2 * c.anchor.x);
  const flip = (img) => {
    if (!img) return null;
    const x0 = ax2 - img.x - img.w;
    const from = Math.max(0, -x0), to = Math.min(img.w, cw - x0);
    if (to <= from) return null;
    const src = Buffer.from(img.b64, 'base64'), w = to - from, out = Buffer.alloc(w * img.h * 4);
    for (let y = 0; y < img.h; y++) for (let x = from; x < to; x++) {
      const s = (y * img.w + (img.w - 1 - x)) * 4;
      src.copy(out, (y * w + x - from) * 4, s, s + 4);
    }
    return { ...img, b64: out.toString('base64'), w, x: x0 + from };
  };
  return { ...c, color: flip(c.color), team: flip(c.team), anchor: { x: ax2 / 2, y: c.anchor.y } };
}

/**
 * Célula dos escombros da pegada de um edifício (`rubble/<w>x<h>`), com a âncora no mesmo ponto da âncora do edifício na
 * célula (`anc`, px na caixa de união do edifício). null sem manifesto/cache de escombros.
 */
function rubbleCell(opts, all, hashes, m, anc) {
  const rm = all.find((x) => x.rubble);
  const fp = m.footprint;
  if (!rm || !fp) return null;
  const e = loadCache(opts, rm, 1, hashes.get(`${rm.id}/1`));
  const fr = e?.frames.find((f) => f.name === `rubble/${fp[0]}x${fp[1]}`);
  if (!fr) return null;
  const G = { x0: fr.box.ax - anc.x, y0: fr.box.ay - anc.y };
  return { color: cellImg(e, fr, 'color', G), team: null, shadow: cellImg(e, fr, 'shadow', G), anchor: { ...anc }, label: 'escombros' };
}

/** Célula com o quadro `top` somado (blend aditivo, como no jogo) sobre a cor de `base` (brilho animado do portal). */
function addCell(base, top) {
  const W = base.w, H = base.h, out = new Uint8Array(W * H * 4);
  const put = (img, add) => {
    if (!img) return;
    const src = Buffer.from(img.b64, 'base64');
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const dx = img.x + x, dy = img.y + y;
      if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
      const s = (y * img.w + x) * 4, d = (dy * W + dx) * 4, a = src[s + 3] / 255;
      if (!a) continue;
      if (add) { for (let c = 0; c < 3; c++) out[d + c] = Math.min(255, out[d + c] + src[s + c] * a); out[d + 3] = Math.max(out[d + 3], src[s + 3]); }
      else { for (let c = 0; c < 4; c++) out[d + c] = src[s + c]; }
    }
  };
  put(base.color, false); put(top.color, true);
  return { ...base, color: { b64: Buffer.from(out).toString('base64'), w: W, h: H, x: 0, y: 0 } };
}

async function contactSheets(opts, manifests, hashes, all = manifests) {
  const { page } = await browser();
  const outDir = path.resolve(ROOT, opts.contact);
  fs.mkdirSync(outDir, { recursive: true });
  const sheets = new Map();   // nome → { title, rows, cellW, cellH }
  for (const m of manifests) {
    const e = loadCache(opts, m, 1, hashes.get(`${m.id}/1`));
    if (!e) continue;
    const groups = groupFrames(e);
    const name = `etapa${m.stage ?? (m.kind === 'building' ? 3 : 2)}-` + (m.contact ?? CONTACT_NAME[m.id] ?? m.id);
    const sheet = sheets.get(name) ?? { title: '', rows: [], cellW: 0, cellH: 0, zoom: 2 };
    sheets.set(name, sheet);
    const cell = (fr) => { const G = groups.get(fr.group); return { color: cellImg(e, fr, 'color', G), team: cellImg(e, fr, 'team', G), shadow: cellImg(e, fr, 'shadow', G), anchor: { x: fr.box.ax - G.x0, y: fr.box.ay - G.y0 }, w: G.w, h: G.h }; };
    if (m.kind === 'unit') {
      // linha = direção; colunas = todos os quadros de todas as animações, na ordem do manifesto
      const G = groups.get(m.id);
      sheet.cellW = Math.max(sheet.cellW, G.w); sheet.cellH = Math.max(sheet.cellH, G.h);
      const dirNames = ['E', 'SE', 'S', 'SO', 'O', 'NO', 'N', 'NE'];
      const mirrored = mirrorOf(m, opts.mirror);
      if (m.sizeClass === 'titan') sheet.zoom = 1;   // titãs: já têm ~260 px a 1× — a folha fica em tamanho de jogo
      // Etapa 6 (titãs): animação só em algumas direções (`dirs`) e asset espelhado dizem isso no título
      const only = (d) => (d.dirs ? ` só ${d.dirs.map((x) => dirNames[x]).join('/')}` : '');
      sheet.title = `${m.id} — ${Object.entries(m.anims).map(([a, d]) => `${a} ${d.frames}${only(d)}`).join(' · ')} × 8 direções${mirrored ? ` (E, SE e NE: corpo e time de O, SO e NO espelhados em torno da âncora, como no jogo; a sombra ${ownMirror(m, opts.mirror) ? 'é a assada da própria direção' : 'é a da origem'})` : ''} (linhas: E, SE, S, SO, O, NO, N, NE) · 1× (32 px/tile)${sheet.zoom > 1 ? ` ampliado ${sheet.zoom}×` : ''}`;
      const rowOf = new Map();
      const want = (d) => !m.contactDirs || m.contactDirs.includes(d);
      for (const d of bakedDirs(m, opts.mirror).filter(want)) {
        const cells = [];
        for (const anim of Object.keys(m.anims)) for (const fr of e.frames.filter((f) => f.anim === anim && f.dir === d)) cells.push({ ...cell(fr), label: fr.frame === 0 ? anim : '' });
        rowOf.set(d, { label: `${m.variantOf ? `${m.unitVariants?.by ?? 'var'} ${m.variantValue} · ` : ''}dir ${d} (${dirNames[d]})`, cells });
      }
      if (mirrored) for (const [d, src] of Object.entries(MIRROR_FROM)) {
        const base = rowOf.get(src), own = rowOf.get(+d);   // `own`: espelhamento do manifesto (a direção foi assada pela sombra)
        if (!want(+d) || !base) continue;
        const cells = base.cells.map((c, i) => (own ? { ...flipCell(c, G.w), shadow: own.cells[i]?.shadow ?? null } : flipCell(c, G.w)));
        rowOf.set(+d, { label: `dir ${d} (${dirNames[d]}) = ${dirNames[src]} espelhada`, cells });
      }
      for (const d of [...rowOf.keys()].sort((a, b) => a - b)) sheet.rows.push(rowOf.get(d));
      if (m.sizeClass === 'titan') {
        // escala: o hoplita parado S com o pé na mesma âncora, ao lado do titã parado S
        const hm = all.find((x) => x.id === 'hoplite'), he = hm && loadCache(opts, hm, 1, hashes.get('hoplite/1'));
        const hf = he?.frames.find((f) => f.anim === 'idle' && f.dir === 2 && f.frame === 0);
        const tf = e.frames.find((f) => f.anim === 'idle' && f.dir === 2 && f.frame === 0);
        if (hf && tf) {
          const t = cell(tf), HG = { x0: hf.box.ax - t.anchor.x, y0: hf.box.ay - t.anchor.y };
          const hop = { color: cellImg(he, hf, 'color', HG), team: cellImg(he, hf, 'team', HG), shadow: cellImg(he, hf, 'shadow', HG), anchor: { ...t.anchor }, label: 'hoplita (1,8 m)' };
          sheet.rows.push({ label: 'escala (parado S)', cells: [hop, { ...t, label: `${m.id} (${m.source?.params?.height ?? '?'} m)` }] });
        }
      }
    } else if (m.kind === 'building') {
      const G = groups.get(m.id);
      const body = e.frames.filter((fr) => !fr.icon);
      // muralha/portão/torre na mesma folha: células do maior; uma linha por estado quando há variantes
      sheet.cellW = Math.max(sheet.cellW, G.w); sheet.cellH = Math.max(sheet.cellH, G.h);
      sheet.title = (sheet.title ? sheet.title + ' | ' : '') + `${m.id}: ${Object.keys(m.anims).join(' · ')}${m.variants ? ` × ${m.variants.length} variantes (${m.variantBy})` : ''}`;
      const rowCell = { cellW: G.w, cellH: G.h };
      if (m.variants) {
        for (const st of Object.keys(m.anims)) sheet.rows.push({ label: `${m.id} ${st}`, cells: body.filter((fr) => fr.anim === st).map((fr) => ({ ...cell(fr), label: fr.variant })), ...rowCell });
        // escombros da pegada no fim da última linha (mesma âncora = centro da área)
        const rb = body.length ? rubbleCell(opts, all, hashes, m, cell(body[0]).anchor) : null;
        if (rb) sheet.rows[sheet.rows.length - 1].cells.push(rb);
      } else {
        // estados de um quadro + escombros da pegada; animações (brilho do portal) numa linha própria, somadas ao complete
        const still = body.filter((fr) => (m.anims[fr.anim]?.frames ?? 1) === 1);
        const cells = still.map((fr) => ({ ...cell(fr), label: fr.anim }));
        const rb = still.length ? rubbleCell(opts, all, hashes, m, cell(still[0]).anchor) : null;
        if (rb) cells.push(rb);
        sheet.rows.push({ label: m.id, cells, ...rowCell });
        const loops = body.filter((fr) => (m.anims[fr.anim]?.frames ?? 1) > 1);
        const base = still.find((fr) => fr.anim === 'complete');
        if (loops.length && base) sheet.rows.push({ label: `${m.id} ${loops[0].anim}`, cells: loops.map((fr) => ({ ...addCell(cell(base), cell(fr)), label: `${fr.anim} ${fr.frame} (aditivo sobre complete)` })), ...rowCell });
      }
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
  const clip = { frames: 4, fps: 10 };
  const m = { id: 'glbtest', kind: 'unit', docs: 'teste do caminho glb', source: { type: 'glb', path: glbRel, scale: 0.5, forward: '-z', anims: { idle: 'Wave', walk: 'Wave', attack: 'Wave', die: 'Wave' } },
    size: { tiles: [2.4, 2.4] }, anchor: [0.5, 0.62], dirs: 8, anims: { idle: clip, walk: clip, attack: clip, die: clip }, team: true, shadow: true };
  const errs = validateManifest(m);
  if (errs.length) throw new Error(errs.join('\n'));
  const frames = expandFrames(m).filter((f) => f.anim === 'idle' && (f.dir === 2 || f.dir === 3)).map((f) => ({ ...f, box: boxOf(m, f, 1) }));
  const res = await page.evaluate((job) => window.__bake.bakeBatch(job), { manifest: m, poses: { main: null, rider: null }, scale: 1, stateKey: 'glbtest', frames });
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

/**
 * `--preview`: assa manifestos de fora de art/manifest (pastas ou arquivos) e grava as folhas de contato; não empacota
 * nada (public/art fica intacto). Os ids não podem repetir os de art/manifest (o cache é por id).
 */
async function preview(opts, official) {
  const list = [];
  for (const p of opts.preview) {
    const abs = path.resolve(ROOT, p);
    if (fs.statSync(abs).isDirectory()) list.push(...loadManifests(abs));
    else list.push({ file: abs, manifest: JSON.parse(fs.readFileSync(abs, 'utf8')) });
  }
  const errors = [...list.flatMap((l) => validateManifest(l.manifest).map((e) => `${path.relative(ROOT, l.file)}: ${e}`)), ...validateAll(list.map((l) => l.manifest))];
  for (const l of list) if (official.some((o) => o.id === l.manifest.id)) errors.push(`${path.relative(ROOT, l.file)}: id ${l.manifest.id} já existe em art/manifest`);
  if (errors.length) throw new Error(errors.join('\n'));
  const manifests = list.flatMap((l) => expandUnitVariants(l.manifest)).filter((m) => matchesOnly(m, opts.only));
  const hashes = new Map();
  for (const m of manifests) for (const s of new Set([...opts.scales, 1])) hashes.set(`${m.id}/${s}`, inputHash(m, s, opts.mirror));
  console.log(`prévia: ${manifests.map((m) => m.id).join(', ')} · escala ${opts.scales.join(',')}× (fora dos atlas)`);
  for (const scale of new Set([...opts.scales, 1])) for (const m of manifests) {
    if (!scalesOf(m, [scale]).length) continue;
    const hash = hashes.get(`${m.id}/${scale}`);
    if (loadCache(opts, m, scale, hash)) { console.log(`  ${m.id} ${scale}×: cache ${hash}`); continue; }
    await produce(opts, m, scale, hash);
  }
  await contactSheets({ ...opts, contact: opts.contact ?? 'docs/art' }, manifests, hashes, manifests);
}

// ---------------------------------------------------------------------------------------------------------------
// quadros 2D (frames2d.mjs)

/** Cache de um asset numa escala, assando se faltar (o bake é determinístico: sai igual ao atlas publicado). */
async function ensureCache(opts, m, scale) {
  const hash = inputHash(m, scale, opts.mirror);
  let e = loadCache(opts, m, scale, hash);
  if (!e) { await produce(opts, m, scale, hash); e = loadCache(opts, m, scale, hash); }
  return e;
}

/** --export-frames <id>: o bake atual no formato de quadros 2D (art/src/<id>/ ou --to), com guia e LEIA-ME. */
async function exportFramesCmd(opts, manifests) {
  const m = manifests.find((x) => x.id === opts.exportFrames);
  if (!m) throw new Error(`--export-frames: manifesto ${opts.exportFrames} não existe`);
  if (m.source.type === 'frames') throw new Error(`${m.id} já é de quadros 2D (${m.source.path})`);
  const entries = {};
  for (const scale of scalesOf(m, [1, 2])) entries[scale] = await ensureCache(opts, m, scale);
  const r = exportFrames({ root: ROOT, m, entries, out: opts.to ?? `art/src/${m.id}`, strides: m.kind === 'unit' ? measureOf(m)?.strides : null });
  console.log(`  ${m.id}: ${r.files} PNGs em ${path.relative(ROOT, r.dir)} (${Object.keys(entries).map((s) => `${s}x`).join(', ')}; LEIA-ME.txt, guia-<escala>x.png)`);
}

/**
 * --selftest-frames: exporta o cidadão (assa se faltar o cache), importa a pasta como manifesto de quadros e confere que
 * cada recorte de cada passe volta idêntico, byte a byte e na mesma posição; depois apaga a pasta 1x e confere que a 1×
 * derivada da 2× tem os mesmos quadros, a mesma caixa e a mesma âncora.
 */
async function selftestFrames(opts, manifests) {
  const src = manifests.find((x) => x.id === 'villager');
  const rel = path.relative(ROOT, path.resolve(ROOT, opts.cache, '_selftest-frames'));
  fs.rmSync(path.join(ROOT, rel), { recursive: true, force: true });
  const entries = { 1: await ensureCache(opts, src, 1), 2: await ensureCache(opts, src, 2) };
  exportFrames({ root: ROOT, m: src, entries, out: rel });
  const m = { ...src, id: 'selftest_frames', source: { type: 'frames', path: rel, stride: { walk: 1 } } };
  const errs = validateManifest(m);
  if (errs.length) throw new Error(errs.join('\n'));
  const cmp = (a, b, what) => {
    if (a.frames.length !== b.frames.length) throw new Error(`${what}: ${b.frames.length} quadros, esperado ${a.frames.length}`);
    let px = 0;
    a.frames.forEach((fa, i) => {
      const fb = b.frames[i];
      if (frameKey(src, fa) !== frameKey(m, fb) || JSON.stringify(fa.box) !== JSON.stringify(fb.box)) throw new Error(`${what}: quadro ${i} (${fa.name} × ${fb.name}) com nome ou caixa diferente`);
      for (const pass of PASSES) {
        const ra = fa.passes[pass], rb = fb.passes[pass];
        if (!ra !== !rb) throw new Error(`${what}: ${fa.name} ${pass} presente num lado só`);
        if (!ra) continue;
        if (ra.x !== rb.x || ra.y !== rb.y || ra.w !== rb.w || ra.h !== rb.h) throw new Error(`${what}: ${fa.name} ${pass} recorte ${JSON.stringify(rb)} ≠ ${JSON.stringify(ra)}`);
        const da = fs.readFileSync(path.join(a.dir, ra.file)), db = fs.readFileSync(path.join(b.dir, rb.file));
        if (!da.equals(db)) throw new Error(`${what}: ${fa.name} ${pass} com pixels diferentes`);
        px += ra.w * ra.h;
      }
    });
    return px;
  };
  for (const s of [1, 2]) {
    const back = await ensureCache(opts, m, s);
    const px = cmp(entries[s], back, `ida e volta ${s}×`);
    console.log(`  ${s}×: ${back.frames.length} quadros × 3 passes idênticos ao bake (${(px / 1e6).toFixed(2)} Mpx)`);
  }
  fs.rmSync(path.join(ROOT, rel, '1x'), { recursive: true, force: true });
  const m2 = { ...m, id: 'selftest_frames_half' };
  const half = await ensureCache(opts, m2, 1);
  if (half.frames.length !== entries[1].frames.length || half.frames.some((f, i) => JSON.stringify(f.box) !== JSON.stringify(entries[1].frames[i].box) || !f.passes.color)) throw new Error('1× derivada da 2×: quadros ou caixas diferentes da 1× assada');
  const me = framesMeasure(m, entries[1], 1), ref = measureOf(src);
  const dTop = Math.max(...me.tops.map((t, d) => Math.abs(t - ref.tops[d])));
  console.log(`  1× derivada da 2×: ${half.frames.length} quadros nas caixas da 1×; topo do corpo pelo alfa × rig: ${dTop.toFixed(1)} px no pior caso`);
  for (const id of ['selftest_frames', 'selftest_frames_half']) fs.rmSync(path.resolve(ROOT, opts.cache, id), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, rel), { recursive: true, force: true });
  console.log('selftest dos quadros 2D: ok');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const loaded = loadManifests(path.join(ROOT, 'art', 'manifest'));
  // variantes de unidade (Etapa 6: hidra por cabeças) viram um asset cada
  const manifests = loaded.flatMap((l) => expandUnitVariants(l.manifest));
  const errors = [...loaded.flatMap((l) => expandUnitVariants(l.manifest).flatMap((m) => validateManifest(m).map((e) => `${path.relative(ROOT, l.file)}${m.variantOf ? ` (${m.id})` : ''}: ${e}`))), ...validateAll(manifests)];
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  // `--only hydra` pega também as variantes (hydra_heads2…)
  const selected = manifests.filter((m) => matchesOnly(m, opts.only) || (m.variantOf && matchesOnly({ ...m, id: m.variantOf }, opts.only)));
  if (opts.only && !selected.length && !opts.preview) throw new Error(`--only ${opts.only.join(',')} não casa com nenhum manifesto`);
  const hashes = new Map();
  for (const m of manifests) for (const s of new Set([...opts.scales, 1])) hashes.set(`${m.id}/${s}`, inputHash(m, s, opts.mirror));

  try {
    if (opts.selftestGlb) { await selftestGlb(opts); return; }
    if (opts.exportFrames) { await exportFramesCmd(opts, manifests); return; }
    if (opts.selftestFrames) { await selftestFrames(opts, manifests); return; }
    if (opts.preview) { await preview(opts, manifests); return; }
    console.log(`bake: ${selected.map((m) => m.id).join(', ')} · escala ${opts.scales.join(',')}× · ${opts.mirror ? '5 direções + 3 espelhadas' : '8 direções'}`);
    for (const scale of opts.scales) for (const m of selected) {
      if (!scalesOf(m, [scale]).length) continue;   // o manifesto não assa esta escala
      const hash = hashes.get(`${m.id}/${scale}`);
      if (loadCache(opts, m, scale, hash)) { console.log(`  ${m.id} ${scale}×: cache ${hash} (nada a assar)`); continue; }
      if (opts.packOnly) throw new Error(`${m.id} ${scale}× não está no cache (${hash}); rode sem --pack-only`);
      await produce(opts, m, scale, hash);
    }
    packAll(opts, manifests, hashes);
    if (opts.contact) await contactSheets(opts, selected, hashes, manifests);
  } finally {
    await closeBrowser();
  }
  console.log(`pronto em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
