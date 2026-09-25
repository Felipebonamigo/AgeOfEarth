// Mapas fixos: exporta o mapa da partida atual (API), carrega no menu como mapa fixo e inicia uma nova partida nele.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.selectOption('#m-map', 'small'); await page.fill('#m-seed', '77'); await page.click('#m-start'); await page.waitForTimeout(1200);
const data = await page.evaluate(() => window.aoe.mapData());
console.log('mapa exportado:', data && data.v === 1 ? `ok ${data.w}×${data.h}, ${data.nodes.length} nós, ${data.starts.length} inícios, ${JSON.stringify(data).length} bytes` : 'FALHOU');
await page.click('#top button:has-text("Menu")'); await page.waitForTimeout(200);
console.log('botão exportar mapa:', await page.isVisible('#modal #m-exportmap'));
page.once('dialog', (d) => d.accept()); await page.click('#m-quit'); await page.waitForTimeout(500);
// carrega como mapa fixo (o botão abre um seletor de arquivo; aqui injetamos os dados como o seletor faria)
await page.evaluate((d) => { window.aoe.menu.fixedMap = d; window.aoe.menu.show(); }, { ...data, name: 'meu mapa' });
await page.waitForTimeout(200);
console.log('menu mostra o mapa fixo:', (await page.textContent('#m-fixed'))?.includes('meu mapa') ? 'ok' : 'FALHOU', '| tamanho desabilitado:', await page.evaluate(() => document.getElementById('m-map').disabled));
await page.selectOption('#m-map', 'large').catch(() => {});
await page.fill('#m-seed', '999'); await page.click('#m-start'); await page.waitForTimeout(1200);
const info = await page.evaluate(() => { const s = window.aoe.session; return { w: s.state.map.w, h: s.state.map.h, fixed: !!s.state.config.map, nodes: s.state.map.nodes.size, tick: s.state.tick }; });
console.log('partida no mapa fixo:', JSON.stringify(info), info.fixed && info.w === data.w && info.nodes === data.nodes.length ? 'ok' : 'FALHOU');
await page.click('#top button:has-text("Menu")'); await page.waitForTimeout(200); page.once('dialog', (d) => d.accept()); await page.click('#m-quit'); await page.waitForTimeout(400);
await page.click('#m-fixed-clear'); await page.waitForTimeout(200);
console.log('limpar mapa fixo:', (await page.textContent('#m-fixed'))?.includes('Nenhum') ? 'ok' : 'FALHOU');
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
