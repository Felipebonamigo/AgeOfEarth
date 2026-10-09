#!/usr/bin/env node
// Exporta o modelo de um quadro de um manifesto como .glb (metros), para render offline (Blender/Cycles, Unreal) e
// volta como quadros 2D (scripts/bake/frames2d.mjs). Uso:
//   node scripts/bake/export-glb.mjs <manifesto.json> --anim idle --dir 2 [--frame 0] [--variant v] --out x.glb
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { expandFrames, posesOf } from './manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const file = args[0];
const m = JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
const anim = opt('--anim', Object.keys(m.anims)[0]), dir = Number(opt('--dir', '2')), fr = Number(opt('--frame', '0')), variant = opt('--variant', null);
const frame = expandFrames(m).find((f) => f.anim === anim && (f.dir ?? 0) === (m.dirs > 1 ? dir : f.dir ?? 0) && f.frame === fr && (!variant || f.variant === variant));
if (!frame) { console.error(`quadro ${anim}/${dir}/${fr}${variant ? '/' + variant : ''} não existe em ${m.id}`); process.exit(1); }
const pf = posesOf(m);
const poses = { main: pf.main ? JSON.parse(fs.readFileSync(path.join(ROOT, pf.main), 'utf8')) : null, rider: pf.rider ? JSON.parse(fs.readFileSync(path.join(ROOT, pf.rider), 'utf8')) : null };
const { chromium } = await import('playwright');
const server = await startServer(ROOT);
const b = await chromium.launch({ ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await b.newPage();
  page.on('pageerror', (e) => console.error('[página]', e.message));
  await page.goto(`http://127.0.0.1:${server.port}/index.html`);
  await page.waitForFunction(() => window.__ready === true || window.__error, null, { timeout: 120000 });
  const b64 = await page.evaluate((job) => window.__bake.exportFrameGlb(job), { manifest: m, poses, frame });
  const out = path.resolve(opt('--out', `${m.id}.glb`));
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(`${m.id} ${anim}/${dir}/${fr} → ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
} finally { await b.close(); server.close(); }
