// Reconexão: dois navegadores jogam em lockstep; o convidado recarrega a página no meio da partida,
// entra de novo na mesma sala com o mesmo nome, recebe o instantâneo do anfitrião e os dois voltam a ficar sincronizados.
// Exige `npm run preview` (porta 4173) e `npm run relay` (porta 8787).
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const room = 'RECON' + Math.floor(Math.random() * 1000);
const join = async (page, name) => {
  await page.click('[data-tab="multiplayer"]'); await page.waitForTimeout(200);
  await page.fill('#mp-url', 'ws://localhost:8787'); await page.fill('#mp-room', room); await page.fill('#mp-name', name);
  await page.click('#mp-join'); await page.waitForTimeout(800);
};
const mk = async (name) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} ${m.text()}`); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await join(page, name);
  return page;
};
const host = await mk('Anfitrião');
const guest = await mk('Convidado');
await host.waitForTimeout(500);
await host.click('#mp-start'); await host.waitForTimeout(2500);
const info = (p) => p.evaluate(() => { const s = window.aoe.session; return s ? { tick: s.state.tick, local: s.local, paused: s.paused } : null; });
console.log('início → anfitrião:', JSON.stringify(await info(host)), 'convidado:', JSON.stringify(await info(guest)));
// o convidado dá uma ordem, depois "cai" (recarrega a página)
await guest.evaluate(() => { const s = window.aoe.session; const ids = [...s.state.units.values()].filter((u) => u.owner === s.local && u.type === 'villager').map((u) => u.id); const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local); s.issue({ type: 'move', player: s.local, ids, x: tc.x + 6, y: tc.y + 6 }); });
await host.waitForTimeout(1500);
await guest.reload({ waitUntil: 'networkidle' });
await host.waitForTimeout(1200);
console.log('após queda → anfitrião continua:', JSON.stringify(await info(host)), '| avisos:', (await host.textContent('#messages'))?.includes('saiu') ? 'saiu ✔' : 'sem aviso');
// o anfitrião dá ordens enquanto o convidado está fora
await host.evaluate(() => { const s = window.aoe.session; const ids = [...s.state.units.values()].filter((u) => u.owner === s.local && u.type === 'villager').map((u) => u.id); const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local); s.issue({ type: 'move', player: s.local, ids, x: tc.x - 6, y: tc.y + 6 }); });
await host.waitForTimeout(1500);
// reconexão: mesma sala, mesmo nome
await join(guest, 'Convidado');
await guest.waitForTimeout(3000);
console.log('após reconectar → anfitrião:', JSON.stringify(await info(host)), 'convidado:', JSON.stringify(await info(guest)));
console.log('aviso de reconexão no anfitrião:', (await host.textContent('#messages'))?.includes('reconectou') ? 'ok' : 'FALHOU');
// os dois voltam a avançar juntos; ordens novas de ambos os lados
await guest.evaluate(() => { const s = window.aoe.session; const ids = [...s.state.units.values()].filter((u) => u.owner === s.local && u.type === 'villager').map((u) => u.id); const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local); s.issue({ type: 'move', player: s.local, ids, x: tc.x + 3, y: tc.y - 6 }); });
await host.waitForTimeout(6000);
const snap = (p) => p.evaluate(() => { const s = window.aoe.session; let h = 2166136261 >>> 0; const mix = (v) => { h ^= (v | 0) >>> 0; h = Math.imul(h, 16777619) >>> 0; }; mix(s.state.tick); for (const u of s.state.units.values()) { mix(u.id); mix(Math.floor(u.x * 64)); mix(Math.floor(u.y * 64)); mix(Math.floor(u.hp)); } for (const pl of s.state.players) mix(Math.floor(pl.resources.food)); return { tick: s.state.tick, hash: h >>> 0, waiting: s.scheduler.waiting, desynced: s.scheduler.desynced, units: s.state.units.size }; });
await host.evaluate(() => { window.aoe.session.paused = true; }); await guest.evaluate(() => { window.aoe.session.paused = true; });
await host.waitForTimeout(300);
let a = await snap(host), b = await snap(guest);
if (a.tick !== b.tick) {
  const behind = a.tick < b.tick ? host : guest; const target = Math.max(a.tick, b.tick);
  await behind.evaluate((t) => { const s = window.aoe.session; let guard = 0; while (s.state.tick < t && guard++ < 400) { if (!s.scheduler.step(s.state)) break; } }, target);
  a = await snap(host); b = await snap(guest);
}
console.log('anfitrião:', JSON.stringify(a)); console.log('convidado:', JSON.stringify(b));
console.log(a.tick === b.tick && a.hash === b.hash ? 'RECONECTADO E SINCRONIZADO ✔' : 'DIVERGENTES ✘');
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
