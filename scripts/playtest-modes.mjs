// Modos de jogo e tipos de mapa no menu: Rei da Colina mostra a colina no topo e no mapa; Regicídio cria o rei;
// Deathmatch começa com cofres cheios; tipos de mapa geram partidas diferentes.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
console.log('modos no menu:', await page.$$eval('#m-mode option', (els) => els.map((e) => e.value).join(',')), '| tipos de mapa:', await page.$$eval('#m-maptype option', (els) => els.map((e) => e.value).join(',')));

const start = async (mode, mapType, seed) => {
  await page.selectOption('#m-mode', mode); await page.selectOption('#m-maptype', mapType); await page.fill('#m-seed', String(seed));
  await page.click('#m-start'); await page.waitForTimeout(1500);
  return page.evaluate(() => { const s = window.aoe.session; return { mode: s.state.config.mode, mapType: s.state.config.mapType, koth: s.state.koth ?? null, age: s.player.age, food: Math.floor(s.player.resources.food), king: [...s.state.units.values()].some((u) => u.owner === s.local && u.type === 'basileus'), tick: s.state.tick }; });
};
const back = async () => { await page.click('#top button:has-text("Menu")'); await page.waitForTimeout(200); page.once('dialog', (d) => d.accept()); await page.click('#m-quit'); await page.waitForTimeout(500); };

const k = await start('koth', 'lakes', 31);
console.log('Rei da Colina:', JSON.stringify(k), k.koth ? 'ok' : 'FALHOU');
console.log('topo mostra a colina:', (await page.textContent('#top'))?.includes('Colina') ? 'ok' : 'FALHOU');
await page.screenshot({ path: '/tmp/koth.png' });
await back();
const r = await start('regicide', 'mountains', 32);
console.log('Regicídio:', JSON.stringify(r), r.king ? 'ok (rei presente)' : 'FALHOU');
console.log('aviso do rei:', (await page.textContent('#messages'))?.includes('rei') ? 'ok' : 'FALHOU');
// veterania: unidade com abates mostra estrelas (renderizador) e a patente no painel
await page.evaluate(() => { const s = window.aoe.session; const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local); const u = window.aoe.debugSpawn(s.local, 'hoplite', tc.x + 4, tc.y + 4); u.kills = 9; s.select([u.id]); });
await page.waitForTimeout(400);
console.log('veterania no painel:', (await page.textContent('#selection'))?.includes('⭐⭐') ? 'ok' : 'FALHOU');
// habilidade de herói: botão no painel e tecla Q
await page.evaluate(() => { const s = window.aoe.session; const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local); const h = window.aoe.debugSpawn(s.local, 'jason', tc.x - 4, tc.y + 4); s.select([h.id]); });
await page.waitForTimeout(400);
console.log('botão da habilidade:', (await page.textContent('#commands'))?.includes('Grito') ? 'ok' : 'FALHOU');
await page.keyboard.press('q'); await page.waitForTimeout(400);
const ab = await page.evaluate(() => { const s = window.aoe.session; const h = [...s.state.units.values()].find((u) => u.type === 'jason'); return { ready: h.abilityReadyAt, tick: s.state.tick, buff: h.buffAttack }; });
console.log('Q ativou a habilidade:', ab.ready > ab.tick && ab.buff > 1 ? 'ok' : `FALHOU ${JSON.stringify(ab)}`, '| recarga no painel:', (await page.textContent('#commands'))?.includes('Recarga') || (await page.evaluate(() => document.querySelector('#commands .cmd[disabled], #commands .cmd.disabled') !== null)) ? 'ok' : 'não visível');
await back();
const d = await start('deathmatch', 'desert', 33);
console.log('Deathmatch:', JSON.stringify(d), d.age === 1 && d.food >= 3000 ? 'ok' : 'FALHOU');
await back();
console.log('setup salvo:', await page.evaluate(() => JSON.parse(localStorage.getItem('aoe_setup') ?? '{}').mode));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
