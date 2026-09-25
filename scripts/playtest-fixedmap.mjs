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
// mapa embutido no seletor
console.log('seletor com mapa do jogo:', await page.$$eval('#m-fixed-sel option', (o) => o.map((x) => x.value).join(',')));
await page.selectOption('#m-fixed-sel', 'estreito'); await page.waitForTimeout(300);
console.log('mapa embutido escolhido:', (await page.textContent('#m-fixed'))?.includes('Estreito') ? 'ok' : 'FALHOU', '| validação:', (await page.textContent('#m-fixed-issues'))?.replace(/\s+/g, ' ').slice(0, 80), '| oponentes limitados a 1:', await page.$$eval('#m-ais option', (o) => o.length) === 1 ? 'ok' : 'FALHOU');
await page.click('#m-start'); await page.waitForTimeout(1200);
const b = await page.evaluate(() => { const s = window.aoe.session; return { id: s.state.config.map?.id, hash: s.state.config.mapHash, w: s.state.map.w }; });
console.log('partida no mapa embutido:', JSON.stringify(b), b.id === 'estreito' && typeof b.hash === 'number' ? 'ok' : 'FALHOU');
// guarda o mapa gerado da partida em Meus mapas pelo menu da partida
page.once('dialog', (d) => d.accept('Ilha do Teste'));
await page.click('#top button:has-text("Menu")'); await page.waitForTimeout(200); await page.click('#m-savemap'); await page.waitForTimeout(300);
console.log('guardar em Meus mapas:', (await page.textContent('#messages'))?.includes('Ilha do Teste') ? 'ok' : 'FALHOU', '| índice local:', await page.evaluate(() => JSON.parse(localStorage.getItem('aoe_maps_v1') ?? '[]').map((e) => e.id).join(',')));
page.once('dialog', (d) => d.accept()); await page.click('#m-quit'); await page.waitForTimeout(500);
// carrega como mapa fixo (o botão abre um seletor de arquivo; aqui injetamos os dados como o seletor faria) — e Meus mapas aparece no seletor
await page.evaluate((d) => { window.aoe.menu.setFixedMap(d, null); }, { ...data, name: 'meu mapa' });
await page.waitForTimeout(200);
console.log('menu mostra o mapa fixo:', (await page.textContent('#m-fixed'))?.includes('meu mapa') ? 'ok' : 'FALHOU', '| tamanho desabilitado:', await page.evaluate(() => document.getElementById('m-map').disabled), '| Meus mapas no seletor:', await page.$$eval('#m-fixed-sel option', (o) => o.some((x) => x.value === 'ilha-do-teste')) ? 'ok' : 'FALHOU');
console.log('mapa guardado é jogável pelo seletor:', await page.evaluate(() => { window.aoe.menu.setFixedMap(null); const sel = document.getElementById('m-fixed-sel'); sel.value = 'ilha-do-teste'; sel.dispatchEvent(new Event('change')); return document.getElementById('m-fixed').textContent.includes('Ilha do Teste'); }) ? 'ok' : 'FALHOU');
await page.evaluate((d) => { window.aoe.menu.setFixedMap(d, null); }, { ...data, name: 'meu mapa' }); await page.waitForTimeout(200);
await page.selectOption('#m-map', 'large').catch(() => {});
await page.fill('#m-seed', '999'); await page.click('#m-start'); await page.waitForTimeout(1200);
const info = await page.evaluate(() => { const s = window.aoe.session; return { w: s.state.map.w, h: s.state.map.h, fixed: !!s.state.config.map, nodes: s.state.map.nodes.size, tick: s.state.tick }; });
console.log('partida no mapa fixo:', JSON.stringify(info), info.fixed && info.w === data.w && info.nodes === data.nodes.length ? 'ok' : 'FALHOU');
await page.click('#top button:has-text("Menu")'); await page.waitForTimeout(200); page.once('dialog', (d) => d.accept()); await page.click('#m-quit'); await page.waitForTimeout(400);
await page.click('#m-fixed-clear'); await page.waitForTimeout(200);
console.log('limpar mapa fixo:', (await page.textContent('#m-fixed'))?.includes('Nenhum') ? 'ok' : 'FALHOU', '| escolha lembrada:', await page.evaluate(() => JSON.parse(localStorage.getItem('aoe_setup') ?? '{}').fixedMapId) === null ? 'ok' : 'FALHOU');
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
