#!/usr/bin/env node
// Fundo do menu principal e da tela de carregamento (Etapa 8; docs/ART.md Apêndice H): renderiza a cena de
// scripts/bake/page/backdrop.js (templo, falange e árvores do jogo em contraluz ao pôr do sol) no Chromium headless e grava
// public/ui/fundo-<tomada>.jpg (o que o jogo carrega) e uma cópia em docs/art/etapa8-fundo-<tomada>.jpg.
// Uso: node scripts/bake/backdrop.mjs [--shot menu] [--size 1920x1080] [--ss 2] [--out public/ui] [--docs docs/art]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const [w, h] = opt('--size', '1920x1080').split('x').map(Number);
const ss = Number(opt('--ss', '2'));
const out = path.resolve(ROOT, opt('--out', 'public/ui'));
const docs = opt('--docs', 'docs/art');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const { chromium } = await import('playwright');
const server = await startServer(ROOT);
const launch = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
if (fs.existsSync(CHROME)) launch.executablePath = CHROME;
const b = await chromium.launch(launch);
try {
  const page = await b.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', (e) => console.error('[página]', e.message));
  await page.goto(`http://127.0.0.1:${server.port}/index.html`);
  await page.waitForFunction(() => window.__ready === true || window.__error, null, { timeout: 120000 });
  await page.evaluate(async () => { await import('/backdrop.js'); });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error('página: ' + err);
  const shots = opt('--shot', null)?.split(',') ?? await page.evaluate(() => window.__backdrop.shots);
  const hoplite = readJson('art/manifest/hoplite.json');
  const poses = { main: readJson('art/poses/human.json'), rider: null };
  fs.mkdirSync(out, { recursive: true });
  for (const shot of shots) {
    const t0 = Date.now();
    const r = await page.evaluate((job) => window.__backdrop.renderBackdrop(job), { shot, w, h, ss, hoplite: { params: hoplite.source.params, anims: hoplite.anims }, poses });
    const buf = Buffer.from(r.jpeg, 'base64');
    const file = path.join(out, `fundo-${shot}.jpg`);
    fs.writeFileSync(file, buf);
    if (docs) { fs.mkdirSync(path.resolve(ROOT, docs), { recursive: true }); fs.writeFileSync(path.resolve(ROOT, docs, `etapa8-fundo-${shot}.jpg`), buf); }
    console.log(`  ${shot}: ${r.w}×${r.h}, ${(buf.length / 1024).toFixed(0)} KB → ${path.relative(ROOT, file)} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
} finally {
  await b.close();
  await server.close();
}
