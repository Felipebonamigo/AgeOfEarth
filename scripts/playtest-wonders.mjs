// Playtest da E7 (maravilhas): Partenon e Biblioteca de Alexandria prontos, pontos no cartão e na barra do topo ("Maravilhas 5/20"),
// a tecla M com cidadãos selecionados alterna só entre as maravilhas ainda livres. Exige `npm run preview` (porta 4173).
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
await page.evaluate(() => { window.aoe.session.paused = true; });
const setup = await page.evaluate(() => {
  const a = window.aoe, s = a.session, st = s.state, p = s.player;
  p.age = 7; for (const r of ['food', 'wood', 'stone', 'gold', 'oil', 'knowledge', 'favor']) p.resources[r] = 20000;
  const tc = [...st.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center');
  const tryPlace = (type) => { for (let r = 6; r <= 20; r += 2) for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) { if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; const b = a.debugBuild(s.local, type, tc.tx + dx, tc.ty + dy, 1); if (b) return b; } return null; };
  const w1 = tryPlace('wonder_parthenon'), w2 = tryPlace('wonder_great_library');
  const vill = [...st.units.values()].filter((u) => u.owner === s.local && u.type === 'villager').slice(0, 3).map((u) => u.id);
  s.select([w1.id]);
  return { w1: w1.id, w2: w2.id, vill };
});
ok('as duas maravilhas foram postas', !!setup.w1 && !!setup.w2);
await page.waitForTimeout(500);
ok('o cartão mostra os pontos de maravilha', (await page.textContent('#selection'))?.includes('Pontos de maravilha'));
await page.evaluate(() => { window.aoe.session.paused = false; }); await page.waitForTimeout(1500); await page.evaluate(() => { window.aoe.session.paused = true; });
const top = await page.textContent('#top');
ok('a barra do topo mostra "Maravilhas 5/20"', top?.includes('Maravilhas 5/20'), `| ${top?.replace(/\s+/g, ' ').slice(-90)}`);
await page.evaluate((s) => window.aoe.session.select(s.vill), setup); await page.waitForTimeout(400);
const seen = [];
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('m'); await page.waitForTimeout(200);
  seen.push(await page.evaluate(() => window.aoe.session.ui.placeType));
}
ok('M alterna só entre maravilhas livres', seen.every((x) => typeof x === 'string' && x.startsWith('wonder_') && x !== 'wonder_parthenon' && x !== 'wonder_great_library'), `| ${seen.join(', ')}`);
await page.keyboard.press('Escape');
await page.screenshot({ path: `${out}/eras-e7-maravilhas.png` });
ok('nenhum erro no console', errors.length === 0, errors.join(' | '));
await browser.close();
if (fails.length) { console.log(`FALHAS: ${fails.join(', ')}`); process.exit(1); }
console.log('playtest-wonders: tudo ok');
