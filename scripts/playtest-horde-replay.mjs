// Modo Horda (intro + primeira onda) e replay: joga uma partida curta, sai, reabre o replay e compara o estado.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
// Horda
await page.click('#m-horde'); await page.waitForTimeout(800);
console.log('intro horda:', (await page.textContent('#modal h2'))?.trim());
await page.click('#m-go'); await page.waitForTimeout(500);
await page.evaluate(() => { window.aoe.session.speed = 3; }); await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/horde.png' });
const h = await page.evaluate(() => { const s = window.aoe.session; return { scenario: s.state.scenario.id, tick: s.state.tick, fired: s.state.scenario.fired }; });
console.log('horda:', JSON.stringify(h));
// Partida rápida curta com ordens, depois sair (grava replay) e assistir
await page.evaluate(() => { window.aoe.session.speed = 1; });
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
page.once('dialog', (d) => d.accept());
await page.click('#m-quit'); await page.waitForTimeout(600);
await page.fill('#m-seed', '5'); await page.click('#m-start'); await page.waitForTimeout(800);
await page.evaluate(() => { const s = window.aoe.session; const ids = [...s.state.units.values()].filter((u) => u.owner === s.local && u.type === 'villager').map((u) => u.id); const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center'); s.issue({ type: 'move', player: s.local, ids, x: tc.x + 6, y: tc.y + 6 }); s.speed = 3; });
await page.waitForTimeout(4000);
const before = await page.evaluate(() => { const s = window.aoe.session; return { tick: s.state.tick, frames: s.scheduler.frames.length }; });
// sai para o menu (salva replay) e assiste
await page.evaluate(() => { window.aoe.session.speed = 1; });
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
page.once('dialog', (d) => d.accept());
await page.click('#m-quit'); await page.waitForTimeout(500);
const replayEnabled = await page.evaluate(() => !document.querySelector('#m-replay').disabled);
console.log('replay disponível:', replayEnabled, 'partida original:', JSON.stringify(before));
await page.click('#m-replay'); await page.waitForTimeout(500);
await page.evaluate(() => { window.aoe.session.speed = 3; });
await page.waitForTimeout(4500);
const after = await page.evaluate(() => { const s = window.aoe.session; return { tick: s.state.tick, spectator: s.spectator, finished: s.scheduler.finished }; });
console.log('replay:', JSON.stringify(after));
await page.screenshot({ path: '/tmp/replay.png' });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
