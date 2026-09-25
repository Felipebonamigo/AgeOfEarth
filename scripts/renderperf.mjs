// Mede o custo do renderizador (ms por quadro de renderer.render) numa partida grande com IAs, em vários zooms.
// Chromium headless com swiftshader (renderização por software): os números absolutos são pessimistas; servem para
// comparar antes/depois de mudanças visuais e como limite superior. Exige `npm run preview` (porta 4173).
// Uso: node scripts/renderperf.mjs [url] [minutosDeJogo=20]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const warm = Number(process.argv[3] ?? 20);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.selectOption('#m-map', 'large'); await page.selectOption('#m-ais', '3'); await page.selectOption('#m-diff', 'brutal'); await page.fill('#m-seed', '42');
await page.click('#m-start'); await page.waitForTimeout(1500);
// avança a simulação diretamente (sem renderizar) até `warm` minutos de jogo, em fatias para não travar a página
await page.evaluate(() => { window.aoe.session.paused = true; });
for (let done = 0; done < warm * 60 * 20; done += 1200) await page.evaluate((n) => { const s = window.aoe.session; for (let i = 0; i < n; i++) s.scheduler.step(s.state); }, 1200);
await page.evaluate(() => { window.aoe.session.paused = false; });
// instrumenta renderer.render sem tocar no código do jogo
await page.evaluate(() => {
  const r = window.aoe.renderer; const orig = r.render.bind(r); window.__frames = [];
  r.render = (...a) => { const t0 = performance.now(); orig(...a); window.__frames.push(performance.now() - t0); };
  window.aoe.session.speed = 1;
});
const measure = async (label, setup) => {
  await page.evaluate(setup);
  await page.evaluate(() => { window.__frames = []; });
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => { const f = window.__frames.slice().sort((a, b) => a - b); const avg = f.reduce((a, b) => a + b, 0) / Math.max(1, f.length); return { n: f.length, avg: +avg.toFixed(2), p95: +(f[Math.floor(f.length * 0.95)] ?? 0).toFixed(2), max: +(f[f.length - 1] ?? 0).toFixed(2) }; });
  console.log(`${label.padEnd(34)} quadros=${r.n} média=${r.avg} ms p95=${r.p95} ms máx=${r.max} ms`);
  return r;
};
const info = await page.evaluate(() => { const s = window.aoe.session; return { tick: s.state.tick, units: s.state.units.size, buildings: s.state.buildings.size, map: `${s.state.map.w}×${s.state.map.h}` }; });
console.log('partida:', JSON.stringify(info));
const results = {};
results.zoom1 = await measure('zoom 1 (cidade do jogador)', () => { const s = window.aoe.session; const r = window.aoe.renderer; r.cam.zoom = 1; const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local); if (tc) r.cam.centerOn(tc.x, tc.y); });
results.zoomOut = await measure('zoom mínimo (mapa inteiro)', () => { const r = window.aoe.renderer; if (r.fitMap) r.fitMap(); else r.cam.zoom = r.cam.minZoom; });
results.battle = await measure('zoom 1,5 (maior aglomerado)', () => { const s = window.aoe.session; const r = window.aoe.renderer; r.cam.zoom = 1.5; let best = null, bestN = -1; for (const u of s.state.units.values()) { let n = 0; for (const v of s.state.units.values()) if (Math.abs(v.x - u.x) < 12 && Math.abs(v.y - u.y) < 8) n++; if (n > bestN) { bestN = n; best = u; } } if (best) r.cam.centerOn(best.x, best.y); });
results.scroll = await measure('rolagem contínua (chunks novos)', () => { const r = window.aoe.renderer; r.cam.zoom = 1; let t = 0; window.__scroll = setInterval(() => { t += 1; r.cam.centerOn(40 + (t * 3) % 100, 40 + (t * 2) % 100); }, 50); });
await page.evaluate(() => clearInterval(window.__scroll));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
