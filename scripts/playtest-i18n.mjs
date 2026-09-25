// Troca o idioma para inglês no menu e confere HUD, comandos, tooltips e mensagens; depois volta para português.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.selectOption('#m-locale', 'en'); await page.waitForTimeout(300);
console.log('menu EN:', (await page.textContent('#m-start'))?.trim(), '|', (await page.textContent('#menu .sub'))?.slice(0, 40));
await page.fill('#m-seed', '11'); await page.click('#m-start'); await page.waitForTimeout(1500);
console.log('toast:', (await page.textContent('#messages'))?.trim().slice(0, 80));
console.log('age button:', (await page.textContent('#top .btn.gold'))?.trim());
// seleciona o centro cívico → painel e comandos em inglês
const tc = await page.evaluate(() => { const s = window.aoe.session; const b = [...s.state.buildings.values()].find((x) => x.owner === s.local && x.type === 'town_center'); return window.aoe.renderer.cam.worldToScreen(b.x, b.y); });
await page.mouse.click(tc.x, tc.y); await page.waitForTimeout(300);
console.log('painel:', (await page.textContent('#selection .title'))?.trim(), '|', (await page.textContent('#selection .stats'))?.trim().slice(0, 60));
console.log('comandos:', (await page.$$eval('#commands .cmd .lbl', (els) => els.map((e) => e.textContent.trim()))).slice(0, 6).join(', '));
await page.keyboard.press('F2'); await page.waitForTimeout(300);
console.log('enciclopédia:', (await page.textContent('#modal h2'))?.trim(), '|', (await page.$$eval('#modal table tr td', (els) => els.slice(0, 2).map((e) => e.textContent.trim()))).join(' / '));
await page.keyboard.press('Escape');
await page.screenshot({ path: '/tmp/en.png' });
// menu in-game: idioma de volta para PT
await page.click('#top button:has-text("Menu")'); await page.waitForTimeout(300);
await page.selectOption('#modal #o-lang', 'pt'); await page.waitForTimeout(300);
console.log('menu PT:', (await page.textContent('#modal h2'))?.trim(), (await page.textContent('#m-continue'))?.trim());
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
console.log('age button PT:', (await page.textContent('#top .btn.gold'))?.trim());
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
