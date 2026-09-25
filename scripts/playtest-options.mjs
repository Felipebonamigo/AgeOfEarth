// Opções e atalhos: painel de opções no menu principal, tela de atalhos, ajuda (também no menu principal),
// escala da interface (zoom do HUD), qualidade de renderização (resolução do canvas) e persistência.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });

// Ajuda e atalhos a partir do menu principal (modal fora do #hud)
await page.click('#m-help'); await page.waitForTimeout(200);
console.log('ajuda no menu principal visível:', await page.isVisible('#modal-back'), '|', (await page.textContent('#modal h2'))?.trim());
await page.click('#modal #m-hotkeys'); await page.waitForTimeout(200);
const hkRows = await page.$$eval('#modal table tr', (els) => els.length);
console.log('tela de atalhos:', (await page.textContent('#modal h2'))?.trim(), '| linhas:', hkRows, '| tem portão(K):', (await page.textContent('#modal'))?.includes('Portão'));
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
console.log('modal fechado:', !(await page.isVisible('#modal-back')));

// Painel de opções no menu principal
await page.click('#m-options'); await page.waitForTimeout(200);
console.log('painel de opções:', await page.isVisible('#m-options-panel'), '| campos:', await page.$$eval('#m-options-panel select, #m-options-panel input', (els) => els.map((e) => e.id).join(',')));
await page.selectOption('#m-options-panel #o-ui', '1.3'); await page.waitForTimeout(200);
const zoomMenu = await page.evaluate(() => [document.getElementById('menu').style.zoom, document.getElementById('hud').style.zoom, document.getElementById('modal-back').style.zoom].join('/'));
console.log('zoom aplicado (menu/hud/modal):', zoomMenu);
await page.selectOption('#m-options-panel #o-ui', '1'); await page.waitForTimeout(100);
await page.click('#m-options-panel #o-hotkeys'); await page.waitForTimeout(200);
console.log('atalhos pelo painel:', (await page.textContent('#modal h2'))?.trim());
await page.keyboard.press('Escape'); await page.waitForTimeout(100);

// Partida: menu da partida com opções, qualidade de renderização e persistência
await page.fill('#m-seed', '7'); await page.click('#m-start'); await page.waitForTimeout(1200);
const w0 = await page.evaluate(() => window.aoe.renderer.canvas.width);
await page.click('#top button:has-text("Menu")'); await page.waitForTimeout(300);
console.log('menu da partida com opções:', await page.isVisible('#modal #o-render'), await page.isVisible('#modal #m-ranges'));
await page.selectOption('#modal #o-render', '0.5'); await page.waitForTimeout(300);
const w1 = await page.evaluate(() => window.aoe.renderer.canvas.width);
console.log('largura do canvas 100% → 50%:', w0, '→', w1, w1 < w0 ? 'ok' : 'FALHOU');
await page.selectOption('#modal #o-render', '1'); await page.waitForTimeout(300);
console.log('volta a 100%:', await page.evaluate(() => window.aoe.renderer.canvas.width));
await page.selectOption('#modal #o-ui', '0.9'); await page.waitForTimeout(100);
await page.check('#modal #o-fs'); await page.waitForTimeout(300);
console.log('tela cheia (navegador, pode exigir gesto):', await page.evaluate(() => !!document.fullscreenElement));
await page.uncheck('#modal #o-fs'); await page.waitForTimeout(200);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('aoe_settings_v1') ?? '{}'));
console.log('persistido:', JSON.stringify({ uiScale: saved.uiScale, renderScale: saved.renderScale, fullscreen: saved.fullscreen, edgeScroll: saved.edgeScroll }));
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
// a partida continua e o HUD responde após as trocas
await page.waitForTimeout(800);
console.log('tick avança:', await page.evaluate(() => window.aoe.session.state.tick) > 0);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(300);
console.log('após recarregar, zoom do menu:', await page.evaluate(() => document.getElementById('menu').style.zoom));
await page.screenshot({ path: '/tmp/options.png' });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
