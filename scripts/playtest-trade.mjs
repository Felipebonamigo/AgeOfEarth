// Playtest da E5 (comércio): caravana treinada no Mercado faz rota entre o Centro Cívico e um Mercado distante por clique
// direito, rende ouro e mostra a rota no cartão. Exige `npm run preview` (porta 4173).
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'docs/art';
const browser = await chromium.launch({ env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' }, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], fails = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'ok    ' : 'FALHOU'} ${name} ${extra}`); if (!cond) fails.push(name); };
await page.goto(url, { waitUntil: 'networkidle' });
await page.fill('#m-seed', '7');
await page.click('#m-start'); await page.waitForTimeout(1500);
const pause = (v) => page.evaluate((v) => { window.aoe.session.paused = v; }, v);
await pause(true);
const setup = await page.evaluate(() => {
  const a = window.aoe, s = a.session, st = s.state, p = s.player;
  p.age = 1; for (const r of ['food', 'wood', 'stone', 'gold']) p.resources[r] = 2000;
  const tc = [...st.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center');
  const dx = tc.x < st.map.w / 2 ? 22 : -25;
  let m = a.debugBuild(s.local, 'market', tc.tx + dx, tc.ty, 1);
  if (!m) m = a.debugBuild(s.local, 'market', tc.tx + dx, tc.ty + 6, 1) ?? a.debugBuild(s.local, 'market', tc.tx + dx, tc.ty - 6, 1);
  if (!m) return null;
  const c = a.debugSpawn(s.local, 'caravan', tc.x + 3, tc.y + 3);
  s.select([c.id]);
  return { caravan: c.id, mx: m.x, my: m.y, gold: p.resources.gold };
});
ok('Mercado e caravana criados', !!setup);
await page.evaluate((s) => { const a = window.aoe; a.renderer.cam.centerOn((a.session.state.units.get(s.caravan).x + s.mx) / 2, (a.session.state.units.get(s.caravan).y + s.my) / 2); a.renderer.cam.zoom = 0.7; }, setup);
await page.waitForTimeout(400);
const pos = await page.evaluate((s) => window.aoe.renderer.cam.worldToScreen(s.mx, s.my), setup);
await page.mouse.click(pos.x, pos.y, { button: 'right' });
await page.waitForTimeout(300);
await pause(false); await page.evaluate(() => { window.aoe.session.speed = 3; });
await page.waitForTimeout(15000);
await pause(true); await page.evaluate(() => { window.aoe.session.speed = 1; });
const st = await page.evaluate((s) => { const a = window.aoe, u = a.session.state.units.get(s.caravan); return { state: u.state, gold: a.session.player.resources.gold }; }, setup);
ok('a caravana está em rota', st.state === 'route', `| estado ${st.state}`);
ok('a rota rendeu ouro', st.gold > setup.gold, `| +${st.gold - setup.gold}`);
await page.evaluate((s) => window.aoe.session.select([s.caravan]), setup); await page.waitForTimeout(400);
ok('o cartão mostra a rota', (await page.textContent('#selection'))?.includes('Rota'));
await page.screenshot({ path: `${out}/eras-e5-caravana.png` });
ok('nenhum erro no console', errors.length === 0, errors.join(' | '));
await browser.close();
if (fails.length) { console.log(`FALHAS: ${fails.join(', ')}`); process.exit(1); }
console.log('playtest-trade: tudo ok');
