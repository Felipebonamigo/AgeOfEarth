#!/usr/bin/env node
// Ilustrações da campanha (ROADMAP 2.7; docs/ART.md Apêndice H): renderiza as cenas de scripts/bake/illustrations/scenes.mjs
// (uma por missão) com a página do bake (page/illustrations.js: os modelos do jogo sobre o relevo, o céu e o pós do fundo do
// menu) e grava public/ui/missao-<id>.jpg (o briefing e a tela de carregamento da missão usam) e, com --contact, uma folha
// com todas lado a lado em docs/art/etapa8-missoes.jpg.
// Uso: node scripts/bake/illustrations.mjs [--only m4_caucaso,m12_titanomaquia] [--size 1920x1080] [--ss 2] [--out public/ui]
//   [--contact docs/art] [--quality 0.86]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { posesOf } from './manifest.mjs';
import { SCENES } from './illustrations/scenes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const [w, h] = opt('--size', '1920x1080').split('x').map(Number);
const ss = Number(opt('--ss', '2'));
const quality = Number(opt('--quality', '0.86'));
const out = path.resolve(ROOT, opt('--out', 'public/ui'));
const contact = opt('--contact', null);
const only = opt('--only', null)?.split(',');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

/** Manifestos e poses de cada tipo de unidade que a cena usa (soltas e em fileiras). */
const poseCache = new Map();
function unitsFor(scene) {
  const types = new Set();
  for (const u of scene.units ?? []) types.add(u.type);
  for (const r of scene.rows ?? []) for (const t of [].concat(r.type)) types.add(t);
  const units = {};
  for (const t of types) {
    const m = readJson(`art/manifest/${t}.json`);
    const p = posesOf(m);
    const load = (f) => { if (!f) return null; if (!poseCache.has(f)) poseCache.set(f, readJson(f)); return poseCache.get(f); };
    units[t] = { source: m.source, anims: m.anims, poses: { main: load(p.main), rider: load(p.rider) } };
  }
  return units;
}

const ids = Object.keys(SCENES).filter((id) => !only || only.includes(id));
if (!ids.length) { console.error('nenhuma cena:', only?.join(',')); process.exit(1); }
const { chromium } = await import('playwright');
const server = await startServer(ROOT);
const launch = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
if (fs.existsSync(CHROME)) launch.executablePath = CHROME;
const b = await chromium.launch(launch);
const made = [];
try {
  const page = await b.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.error('[página]', e.message); });
  await page.goto(`http://127.0.0.1:${server.port}/index.html`);
  await page.waitForFunction(() => window.__ready === true || window.__error, null, { timeout: 120000 });
  await page.evaluate(async () => { await import('/illustrations.js'); });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error('página: ' + err);
  fs.mkdirSync(out, { recursive: true });
  for (const id of ids) {
    const t0 = Date.now();
    const r = await page.evaluate((job) => window.__illustrations.renderIllustration(job), { scene: SCENES[id], w, h, ss, quality, units: unitsFor(SCENES[id]) });
    const file = path.join(out, `missao-${id}.jpg`);
    fs.writeFileSync(file, Buffer.from(r.jpeg, 'base64'));
    made.push({ id, file });
    console.log(`  ${id}: ${r.w}×${r.h} → ${path.relative(ROOT, file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  if (errors.length) throw new Error(`erros na página: ${errors.join(' | ')}`);
  if (contact && made.length) {
    // folha de contato: miniaturas 480×270 em 3 colunas, com o id embaixo
    const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(3,480px);gap:6px;padding:6px;font:13px sans-serif;color:#ddd">${made.map((m) => `<figure style="margin:0"><img src="data:image/jpeg;base64,${fs.readFileSync(m.file).toString('base64')}" style="width:480px;height:270px;display:block"><figcaption>${m.id}</figcaption></figure>`).join('')}</body>`;
    const rows = Math.ceil(made.length / 3);
    const cp = await b.newPage({ viewport: { width: 3 * 480 + 4 * 6, height: rows * 296 + 12 } });
    await cp.setContent(html); await cp.waitForTimeout(300);
    const f = path.resolve(ROOT, contact, 'etapa8-missoes.jpg');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    await cp.screenshot({ path: f, type: 'jpeg', quality: 85, fullPage: true });
    console.log('  folha:', path.relative(ROOT, f));
  }
} finally {
  await b.close();
  await server.close();
}
