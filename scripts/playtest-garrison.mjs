// Guarnição e portões pela interface: clique direito no Centro Cívico guarnece cidadãos; botão libera; portão pelo atalho K.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.fill('#m-seed', '7'); await page.click('#m-start'); await page.waitForTimeout(1200);
const pause = (v) => page.evaluate((v) => { window.aoe.session.paused = v; }, v);
const S = () => page.evaluate(() => { const s = window.aoe.session; const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center'); return { garrison: tc.garrison.length, villStates: [...s.state.units.values()].filter((u) => u.owner === s.local && u.type === 'villager').map((u) => u.state), buildings: [...s.state.buildings.values()].filter((b) => b.owner === s.local).map((b) => b.type), sel: s.selection.size }; });
await pause(true);
// seleciona todos os cidadãos (duplo clique) e clica direito no centro cívico → guarnição
const v = await page.evaluate(() => { const s = window.aoe.session; const u = [...s.state.units.values()].find((x) => x.owner === s.local && x.type === 'villager'); return window.aoe.renderer.cam.worldToScreen(u.x, u.y); });
await page.mouse.click(v.x, v.y); await page.waitForTimeout(120); await page.mouse.click(v.x, v.y); await page.waitForTimeout(200);
console.log('selecionados:', (await S()).sel);
const tc = await page.evaluate(() => { const s = window.aoe.session; const b = [...s.state.buildings.values()].find((x) => x.owner === s.local && x.type === 'town_center'); return window.aoe.renderer.cam.worldToScreen(b.x, b.y); });
await page.mouse.click(tc.x, tc.y, { button: 'right' }); await page.waitForTimeout(100);
await pause(false); await page.evaluate(() => { window.aoe.session.speed = 3; }); await page.waitForTimeout(5000); await pause(true);
let st = await S(); console.log('após guarnecer:', JSON.stringify({ garrison: st.garrison, states: st.villStates }));
// seleciona o centro cívico e confere o painel + botão liberar
await page.mouse.click(tc.x, tc.y); await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/garrison.png' });
const panel = await page.textContent('#selection'); console.log('painel contém Guarnição:', /Guarnição/.test(panel ?? ''));
await page.keyboard.press('u'); await pause(false); await page.waitForTimeout(600); await pause(true);
st = await S(); console.log('após liberar:', JSON.stringify({ garrison: st.garrison, states: st.villStates }));
// portão: seleciona cidadãos (posições novas após a liberação), K, coloca perto do centro
const v2 = await page.evaluate(() => { const s = window.aoe.session; const u = [...s.state.units.values()].find((x) => x.owner === s.local && x.type === 'villager'); return window.aoe.renderer.cam.worldToScreen(u.x, u.y); });
await page.mouse.click(v2.x, v2.y); await page.waitForTimeout(120); await page.mouse.click(v2.x, v2.y); await page.waitForTimeout(200);
console.log('selecionados 2:', (await S()).sel);
await page.keyboard.press('k'); await page.waitForTimeout(150);
const mode = await page.evaluate(() => window.aoe.session.ui.mode + ':' + window.aoe.session.ui.placeType); console.log('modo:', mode);
for (const [dx, dy] of [[-4, 4], [4, 4], [-5, 0], [5, 0], [0, -4]]) {
  const p = await page.evaluate(([x, y]) => { const s = window.aoe.session; const b = [...s.state.buildings.values()].find((z) => z.owner === s.local && z.type === 'town_center'); return window.aoe.renderer.cam.worldToScreen(b.x + x, b.y + y); }, [dx, dy]);
  await page.mouse.move(p.x, p.y); await page.waitForTimeout(60); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120);
  await pause(false); await page.waitForTimeout(200); await pause(true);
  st = await S(); if (st.buildings.includes('gate')) break;
}
console.log('portão colocado:', (await S()).buildings.includes('gate'));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
