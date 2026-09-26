#!/usr/bin/env node
// Prévia AMPLIADA de poses de um manifesto de unidade (Etapa 4): renderiza só as animações/direções pedidas numa escala
// grande (padrão 3 = 96 px/tile) e compõe uma grade (linhas = direções, colunas = quadros) com sombra, cor e máscara de
// time tingida — para ajustar poses de `art/poses/*.json` e o kit sem assar o asset inteiro nem mexer no cache/atlas.
//
// Uso: node scripts/bake/pose-preview.mjs <manifesto.json> [--anims idle,attack] [--dirs 2,3,6] [--scale 3]
//                                          [--out scratch/prévia.png] [--tint 0xa8322f] [--crop 1.8,2.2]
// `--crop w,h` recorta cada célula em volta do pé (w × h tiles, o pé a 50 % na horizontal e 75 % na vertical).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { validateManifest, expandFrames, posesOf } from './manifest.mjs';
import { PX_PER_TILE } from './page/camera.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!file) { console.error('uso: node scripts/bake/pose-preview.mjs <manifesto.json> [--anims a,b] [--dirs 0,2] [--scale 3] [--out x.png]'); process.exit(2); }
const m = JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
const errs = validateManifest(m);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
const anims = (opt('--anims', Object.keys(m.anims).join(','))).split(',');
const dirs = opt('--dirs', '0,1,2,3,4,5,6,7').split(',').map(Number);
const scale = Number(opt('--scale', '3'));
const out = path.resolve(ROOT, opt('--out', `scratch/preview-${m.id}.png`));
const tint = Number(opt('--tint', '0x2f4fa8'));
const crop = opt('--crop', null)?.split(',').map(Number) ?? null;

const pf = posesOf(m);
const poses = { main: pf.main ? JSON.parse(fs.readFileSync(path.join(ROOT, pf.main), 'utf8')) : null, rider: pf.rider ? JSON.parse(fs.readFileSync(path.join(ROOT, pf.rider), 'utf8')) : null };
const w = Math.round(m.size.tiles[0] * PX_PER_TILE * scale), h = Math.round(m.size.tiles[1] * PX_PER_TILE * scale);
const box = { w, h, ax: Math.round(m.anchor[0] * w), ay: Math.round(m.anchor[1] * h) };
const frames = expandFrames(m).filter((f) => anims.includes(f.anim) && dirs.includes(f.dir)).map((f) => ({ ...f, box }));

const { chromium } = await import('playwright');
const server = await startServer(ROOT);
const b = await chromium.launch({ ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await b.newPage();
  page.on('pageerror', (e) => console.error('[página]', e.message));
  await page.goto(`http://127.0.0.1:${server.port}/index.html`);
  await page.waitForFunction(() => window.__ready === true || window.__error, null, { timeout: 120000 });
  const res = await page.evaluate((job) => window.__bake.bakeBatch(job), { manifest: m, poses, scale, stateKey: `preview/${m.id}/${Date.now()}`, frames });
  // recorte opcional em volta do pé (as imagens voltam da página como RGBA da caixa inteira)
  const cw = crop ? Math.round(crop[0] * PX_PER_TILE * scale) : w, ch = crop ? Math.round(crop[1] * PX_PER_TILE * scale) : h;
  const cx0 = crop ? box.ax - Math.round(cw / 2) : 0, cy0 = crop ? box.ay - Math.round(ch * 0.75) : 0;
  const cut = (b64) => {
    if (!b64 || !crop) return b64;
    const src = Buffer.from(b64, 'base64'), dst = Buffer.alloc(cw * ch * 4);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const sx = x + cx0, sy = y + cy0; if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      src.copy(dst, (y * cw + x) * 4, (sy * w + sx) * 4, (sy * w + sx) * 4 + 4);
    }
    return dst.toString('base64');
  };
  const img = (b64) => (b64 ? { b64: cut(b64), w: cw, h: ch, x: 0, y: 0 } : null);
  const cellOf = (r) => ({ color: img(r.color), team: img(r.team), shadow: img(r.shadow), anchor: { x: box.ax - cx0, y: box.ay - cy0 } });
  const rows = dirs.map((d) => ({ label: `dir ${d}`, cells: frames.map((f, i) => (f.dir === d ? { ...cellOf(res[i]), label: f.frame === 0 ? f.anim : '' } : null)).filter(Boolean) }));
  const b64 = await page.evaluate((arg) => window.__bake.contactSheet(arg), { title: `${m.id} — ${anims.join(', ')} · escala ${scale} (${PX_PER_TILE * scale} px/tile)`, rows, cellW: cw, cellH: ch, zoom: 1, tint, labelW: 60 });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(`prévia: ${path.relative(ROOT, out)} (${frames.length} quadros)`);
} finally {
  await b.close(); await server.close();
}
