// Abre o jogo no Chromium headless, inicia uma partida e tira screenshots (verificação visual automatizada).
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? '/tmp/shot';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-menu.png` });
await page.fill('#m-seed', '42');
await page.click('#m-start');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}-game.png` });
// seleciona um cidadão por arrasto e mostra o menu de construção
await page.mouse.move(600, 300); await page.mouse.down(); await page.mouse.move(900, 600, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}-select.png` });
// avança o jogo rápido por alguns segundos
await page.evaluate(() => { window.aoe.session.speed = 3; });
await page.waitForTimeout(6000);
await page.evaluate(() => { window.aoe.session.speed = 1; });
await page.screenshot({ path: `${out}-later.png` });
const info = await page.evaluate(() => { const s = window.aoe.session; return { tick: s.state.tick, units: s.state.units.size, buildings: s.state.buildings.size, fps: 'n/a', res: s.player.resources }; });
console.log(JSON.stringify(info));
console.log('errors:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
await browser.close();
