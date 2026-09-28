#!/usr/bin/env node
// Fundo do menu principal e da tela de carregamento (Etapa 8; docs/ART.md Apêndice H): renderiza a cena de
// scripts/bake/page/backdrop.js (templo, falange e árvores do jogo em contraluz ao pôr do sol) no Chromium headless e grava
// public/ui/fundo-<tomada>.jpg (o que o jogo carrega) e uma cópia em docs/art/etapa8-fundo-<tomada>.jpg.
// Com `--steam [pasta]` gera as peças da página da loja (docs/STEAM.md §5; padrão docs/steam): cápsulas (cabeçalho,
// pequena, principal, vertical), biblioteca (cápsula, cabeçalho, herói sem texto, logo em PNG transparente) e o fundo da
// página, com a mesma cena em variantes de câmera por proporção e o logo em Cinzel entre louros.
// Uso: node scripts/bake/backdrop.mjs [--shot menu] [--size 1920x1080] [--ss 2] [--out public/ui] [--docs docs/art] [--steam [dir]]
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
const steamIdx = args.indexOf('--steam');
const steamDir = steamIdx >= 0 ? path.resolve(ROOT, args[steamIdx + 1] && !args[steamIdx + 1].startsWith('--') ? args[steamIdx + 1] : 'docs/steam') : null;
/** Peças da loja (tamanhos atuais da Steam): logo sobre a cena; o herói da biblioteca não leva texto (a Steam põe o logo). */
const STEAM = [
  { name: 'header_capsule_920x430', w: 920, h: 430, shot: 'header', logo: { y: 0.33, width: 0.82 }, shade: 0.35 },
  { name: 'small_capsule_462x174', w: 462, h: 174, shot: 'small', logo: { y: 0.46, width: 0.94 }, shade: 0.55, ss: 3 },
  { name: 'main_capsule_1232x706', w: 1232, h: 706, shot: 'menu', logo: { y: 0.23, width: 0.64 }, shade: 0.3 },
  { name: 'vertical_capsule_748x896', w: 748, h: 896, shot: 'vertical', logo: { y: 0.21, width: 0.9 }, shade: 0.35 },
  { name: 'library_capsule_600x900', w: 600, h: 900, shot: 'vertical', logo: { y: 0.21, width: 0.9 }, shade: 0.35 },
  { name: 'library_header_920x430', w: 920, h: 430, shot: 'header', logo: { y: 0.33, width: 0.82 }, shade: 0.35 },
  { name: 'library_hero_3840x1240', w: 3840, h: 1240, shot: 'hero', logo: null, ss: 1 },
  { name: 'library_logo_1280x720', w: 1280, h: 720, shot: null, logo: { y: 0.5, width: 0.96, glow: 0.35 }, format: 'png' },
  { name: 'page_background_1438x810', w: 1438, h: 810, shot: 'menu', dim: 0.45, logo: null },
];

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
  const hoplite = readJson('art/manifest/hoplite.json');
  const poses = { main: readJson('art/poses/human.json'), rider: null };
  if (steamDir) {
    fs.mkdirSync(steamDir, { recursive: true });
    for (const it of STEAM) {
      const t0 = Date.now();
      const [r] = await page.evaluate((job) => window.__backdrop.renderSteam(job), { items: [it], hoplite: { params: hoplite.source.params, anims: hoplite.anims }, poses });
      const file = path.join(steamDir, `${r.name}.${r.mime === 'image/png' ? 'png' : 'jpg'}`);
      fs.writeFileSync(file, Buffer.from(r.b64, 'base64'));
      console.log(`  ${r.name}: ${r.w}×${r.h} → ${path.relative(ROOT, file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
    process.exitCode = 0;
  }
  const shots = steamDir ? [] : opt('--shot', null)?.split(',') ?? await page.evaluate(() => window.__backdrop.shots);
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
