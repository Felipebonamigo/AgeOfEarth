// Mapa fixo no lobby: o anfitrião exporta o mapa de uma partida, carrega-o na sala, o convidado vê o resumo
// (tamanho e inícios, seletores travados), recebe o mapa inteiro ao iniciar e os dois seguem sincronizados.
// Exige `npm run preview` (porta 4173) e `npm run relay` (porta 8787).
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const room = 'MAPA' + Math.floor(Math.random() * 1000);
const mk = async (name) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} ${m.text()}`); });
  await page.goto(url, { waitUntil: 'networkidle' });
  return page;
};
const join = async (page, name) => {
  await page.click('[data-tab="multiplayer"]'); await page.waitForTimeout(200);
  await page.fill('#mp-url', 'ws://localhost:8787'); await page.fill('#mp-room', room); await page.fill('#mp-name', name);
  await page.click('#mp-join'); await page.waitForTimeout(800);
};
const host = await mk('Anfitrião');
// 1) o anfitrião joga uma partida rápida num mapa pequeno e exporta o mapa
await host.selectOption('#m-map', 'small'); await host.fill('#m-seed', '77'); await host.click('#m-start'); await host.waitForTimeout(1200);
const data = await host.evaluate(() => window.aoe.mapData());
console.log('mapa exportado:', data && data.v === 1 ? `ok ${data.w}×${data.h}, ${data.starts.length} inícios` : 'FALHOU');
await host.click('#top button:has-text("Menu")'); await host.waitForTimeout(200); host.once('dialog', (d) => d.accept()); await host.click('#m-quit'); await host.waitForTimeout(500);
// 2) sala: anfitrião e convidado
await join(host, 'Anfitrião');
const guest = await mk('Convidado'); await join(guest, 'Convidado'); await host.waitForTimeout(600);
console.log('botão de carregar: anfitrião', await host.$('#mp-fixed-load') ? 'sim' : 'não', '| convidado', await guest.$('#mp-fixed-load') ? 'sim (ERRADO)' : 'não');
await host.evaluate((d) => window.aoe.menu.setFixedMap(d), { ...data, name: 'ilha' });
await guest.waitForTimeout(600);
const seen = await guest.textContent('#mp-fixed');
console.log('convidado vê o mapa fixo:', seen?.includes('ilha') && seen.includes(`${data.w}×${data.h}`) ? `ok (${seen.trim()})` : `FALHOU (${seen})`);
console.log('tamanho/tipo travados no anfitrião:', await host.$eval('#mp-map', (e) => e.disabled) && await host.$eval('#mp-maptype', (e) => e.disabled) ? 'ok' : 'FALHOU');
// limpar e carregar de novo
await host.click('#mp-fixed-clear'); await guest.waitForTimeout(500);
console.log('limpar propaga ao convidado:', (await guest.textContent('#mp-fixed'))?.includes('ilha') ? 'FALHOU' : 'ok');
await host.evaluate((d) => window.aoe.menu.setFixedMap(d), { ...data, name: 'ilha' }); await guest.waitForTimeout(500);
// 3) iniciar: o convidado recebe o mapa inteiro em `start`
await host.click('#mp-start'); await host.waitForTimeout(3000);
const info = (p) => p.evaluate(() => { const s = window.aoe.session; const m = s?.state.config.map; return s ? { tick: s.state.tick, local: s.local, w: s.state.map.w, h: s.state.map.h, fixed: !!m, name: m?.name ?? null, nodes: s.state.map.nodes.size } : null; });
const a0 = await info(host), b0 = await info(guest);
console.log('anfitrião:', JSON.stringify(a0)); console.log('convidado:', JSON.stringify(b0));
console.log('os dois jogam no mapa fixo:', a0?.fixed && b0?.fixed && a0.w === data.w && b0.w === data.w && a0.name === 'ilha' && b0.name === 'ilha' && a0.nodes === b0.nodes ? 'ok' : 'FALHOU');
// 4) ordens diferentes e comparação de hash
const order = (p, dx) => p.evaluate((dx) => { const s = window.aoe.session; const ids = [...s.state.units.values()].filter((u) => u.owner === s.local && u.type === 'villager').map((u) => u.id); const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center'); s.issue({ type: 'move', player: s.local, ids, x: tc.x + dx, y: tc.y + 6 }); }, dx);
await order(host, -6); await order(guest, 6); await host.waitForTimeout(6000);
const snap = (p) => p.evaluate(() => { const s = window.aoe.session; let h = 2166136261 >>> 0; const mix = (v) => { h ^= (v | 0) >>> 0; h = Math.imul(h, 16777619) >>> 0; }; mix(s.state.tick); for (const u of s.state.units.values()) { mix(u.id); mix(Math.floor(u.x * 64)); mix(Math.floor(u.y * 64)); mix(Math.floor(u.hp)); } for (const pl of s.state.players) mix(Math.floor(pl.resources.food)); return { tick: s.state.tick, hash: h >>> 0, desynced: s.scheduler.desynced, units: s.state.units.size }; });
await host.evaluate(() => { window.aoe.session.paused = true; }); await guest.evaluate(() => { window.aoe.session.paused = true; }); await host.waitForTimeout(300);
let a = await snap(host), b = await snap(guest);
if (a.tick !== b.tick) { const behind = a.tick < b.tick ? host : guest; const target = Math.max(a.tick, b.tick); await behind.evaluate((t) => { const s = window.aoe.session; let g = 0; while (s.state.tick < t && g++ < 400) { if (!s.scheduler.step(s.state)) break; } }, target); a = await snap(host); b = await snap(guest); }
console.log('anfitrião:', JSON.stringify(a)); console.log('convidado:', JSON.stringify(b));
console.log(a.tick === b.tick && a.hash === b.hash && !a.desynced && !b.desynced ? 'MAPA FIXO SINCRONIZADO ✔' : 'DIVERGENTES ✘');
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
