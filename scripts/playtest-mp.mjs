// Multiplayer: dois navegadores entram na mesma sala, o anfitrião inicia, cada um dá ordens diferentes,
// e verificamos que os estados permanecem idênticos (hash) — prova do lockstep determinístico.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const relay = process.argv[3] ?? 'ws://localhost:8787';   // relay em outra porta: node scripts/playtest-mp.mjs <url> <ws>
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const mk = async (name) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} ${m.text()}`); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('[data-tab="multiplayer"]'); await page.waitForTimeout(200);
  await page.fill('#mp-url', relay); await page.fill('#mp-room', 'TESTE'); await page.fill('#mp-name', name);
  await page.click('#mp-join'); await page.waitForTimeout(800);
  return page;
};
const host = await mk('Anfitrião');
const guest = await mk('Convidado');
await host.waitForTimeout(500);
console.log('lobby anfitrião:', await host.evaluate(() => document.querySelector('#mp table')?.innerText.replace(/\n/g, ' | ')));
// ping medido pelo relay aparece na tabela dos dois lados
await host.waitForTimeout(2500);
const pings = await host.$$eval('#mp table td.ping', (els) => els.map((e) => e.textContent.trim()));
console.log('pings (anfitrião vê):', pings.join(', '), pings.every((x) => /\d+ ms/.test(x)) ? 'ok' : 'FALHOU');
// bate-papo no lobby: convidado escreve, anfitrião lê
await guest.fill('#mp-chat-input', 'olá do convidado'); await guest.keyboard.press('Enter'); await host.waitForTimeout(500);
const chatHost = await host.evaluate(() => document.querySelector('#mp-chat-log')?.innerText ?? '');
console.log('chat no anfitrião:', chatHost.includes('olá do convidado') ? 'ok' : `FALHOU (${chatHost})`);
// botão Remover só para o anfitrião e nunca sobre si mesmo
console.log('botões remover: anfitrião', await host.$$eval('[data-kick]', (e) => e.length), '| convidado', await guest.$$eval('[data-kick]', (e) => e.length));
await host.selectOption('#mp-ais', '1'); await host.waitForTimeout(300);
await host.click('#mp-start');
await host.waitForTimeout(3000);
const info = async (p) => p.evaluate(() => { const s = window.aoe.session; return s ? { tick: s.state.tick, local: s.local, players: s.state.players.map((x) => x.name) } : null; });
console.log('anfitrião:', JSON.stringify(await info(host)));
console.log('convidado:', JSON.stringify(await info(guest)));
// bate-papo na partida: Enter abre o campo, mensagem chega como aviso no outro lado
await guest.keyboard.press('Enter'); await guest.waitForTimeout(150);
console.log('campo de chat aberto no convidado:', await guest.evaluate(() => !document.getElementById('chat').classList.contains('hidden')));
await guest.keyboard.type('gg em breve'); await guest.keyboard.press('Enter'); await host.waitForTimeout(600);
console.log('chat na partida (anfitrião):', (await host.textContent('#messages'))?.includes('gg em breve') ? 'ok' : 'FALHOU');
// ordens diferentes em cada cliente: cada um manda seus cidadãos para um ponto distinto
const order = (p, dx) => p.evaluate((dx) => { const s = window.aoe.session; const ids = [...s.state.units.values()].filter((u) => u.owner === s.local && u.type === 'villager').map((u) => u.id); const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center'); s.issue({ type: 'move', player: s.local, ids, x: tc.x + dx, y: tc.y + 6 }); }, dx);
await order(host, -6); await order(guest, 6);
await host.waitForTimeout(8000);
await order(host, 5); await order(guest, -5);
await host.waitForTimeout(8000);
const snap = async (p) => p.evaluate(async () => { const s = window.aoe.session; let h = 2166136261 >>> 0; const mix = (v) => { h ^= (v | 0) >>> 0; h = Math.imul(h, 16777619) >>> 0; }; mix(s.state.tick); for (const u of s.state.units.values()) { mix(u.id); mix(Math.floor(u.x * 64)); mix(Math.floor(u.y * 64)); mix(Math.floor(u.hp)); } for (const pl of s.state.players) { mix(Math.floor(pl.resources.food)); mix(Math.floor(pl.resources.wood)); } return { tick: s.state.tick, hash: h, waiting: s.scheduler.waiting, desynced: s.scheduler.desynced, units: s.state.units.size }; });
// pausa os dois para comparar no mesmo tick: aguarda até ambos alcançarem o mesmo tick
let a = await snap(host), b = await snap(guest);
for (let i = 0; i < 20 && a.tick !== b.tick; i++) { await host.waitForTimeout(150); a = await snap(host); b = await snap(guest); }
// congela: compara o estado no menor tick comum pausando ambos
await host.evaluate(() => { window.aoe.session.paused = true; }); await guest.evaluate(() => { window.aoe.session.paused = true; });
await host.waitForTimeout(300);
a = await snap(host); b = await snap(guest);
console.log('anfitrião:', JSON.stringify(a)); console.log('convidado:', JSON.stringify(b));
if (a.tick !== b.tick) {
  // avança o que estiver atrás até igualar (o agendador só avança com comandos de ambos; os do outro já chegaram)
  const behind = a.tick < b.tick ? host : guest; const target = Math.max(a.tick, b.tick);
  await behind.evaluate((t) => { const s = window.aoe.session; let guard = 0; while (s.state.tick < t && guard++ < 200) { if (!s.scheduler.step(s.state)) break; } }, target);
  a = await snap(host); b = await snap(guest);
  console.log('após nivelar → anfitrião:', JSON.stringify(a), 'convidado:', JSON.stringify(b));
}
console.log(a.tick === b.tick && a.hash === b.hash ? 'SINCRONIZADOS ✔' : 'DIVERGENTES ✘');
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
