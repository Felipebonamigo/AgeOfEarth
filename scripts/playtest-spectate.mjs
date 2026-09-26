// Espectadores: um espectador entra na sala antes de começar (vê a lista, sem seleção de deus) e outro entra
// no meio da partida pela lista de salas ("Assistir"); os dois recebem o estado, avançam junto com os jogadores,
// não conseguem dar ordens e veem o mapa revelado. Exige `npm run preview` e `npm run relay`.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const relay = process.argv[3] ?? 'ws://localhost:8787';   // relay em outra porta: node scripts/playtest-spectate.mjs <url> <ws>
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const room = 'OLHO' + Math.floor(Math.random() * 1000);
const mk = async (name) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} ${m.text()}`); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('[data-tab="multiplayer"]'); await page.waitForTimeout(200);
  await page.fill('#mp-url', relay); await page.fill('#mp-room', room); await page.fill('#mp-name', name);
  return page;
};
const host = await mk('Anfitrião'); await host.click('#mp-join'); await host.waitForTimeout(600);
const guest = await mk('Convidado'); await guest.click('#mp-join'); await guest.waitForTimeout(600);
const spec1 = await mk('Coruja'); await spec1.click('#mp-spectate'); await spec1.waitForTimeout(800);
console.log('espectador no lobby (anfitrião vê):', (await host.textContent('#mp-spectators'))?.includes('Coruja') ? 'ok' : 'FALHOU', '| sem seleção de deus:', await spec1.$('#mp-mygod') ? 'FALHOU' : 'ok', '| jogadores na tabela:', await host.$$eval('#mp table tr', (r) => r.length - 1));
await host.click('#mp-start'); await host.waitForTimeout(3000);
const info = (p) => p.evaluate(() => { const s = window.aoe.session; return s ? { tick: s.state.tick, local: s.local, spectator: s.spectator, reveal: window.aoe.renderer.revealAll, paused: s.paused } : null; });
console.log('início → anfitrião:', JSON.stringify(await info(host)), '| espectador 1:', JSON.stringify(await info(spec1)));
// espectador tardio entra pela lista de salas ("Assistir" numa sala em andamento)
const spec2 = await mk('Falcão'); await spec2.click('#mp-browse'); await spec2.waitForTimeout(1000);
const list = await spec2.textContent('#mp-rooms');
console.log('sala em andamento na lista:', list?.includes(room) && list.includes('andamento') && !(await spec2.$(`[data-room="${room}"]`)) ? 'ok' : `FALHOU (${list})`);
await spec2.evaluate((r) => document.querySelector(`[data-spectate="${r}"]`).click(), room); await host.waitForTimeout(1500);
console.log('aviso no anfitrião:', (await host.textContent('#messages'))?.includes('Falcão') ? 'ok' : 'FALHOU');
// o instantâneo (~350 KB) chega quando a página do espectador termina de montar a sessão (vários segundos com 4 navegadores em software)
let s2 = null; for (let i = 0; i < 40; i++) { await spec2.waitForTimeout(500); s2 = await info(spec2); if (s2 && !s2.paused && s2.tick > 0) break; }
console.log('espectador 2 recebeu o instantâneo:', JSON.stringify(s2), s2 && !s2.paused && s2.spectator && s2.reveal ? 'ok' : 'FALHOU');
// ordens: jogadores comandam, espectadores não
const order = (p, dx) => p.evaluate((dx) => { const s = window.aoe.session; const ids = [...s.state.units.values()].filter((u) => u.owner === s.local && u.type === 'villager').map((u) => u.id); const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center'); s.issue({ type: 'move', player: s.local, ids, x: tc.x + dx, y: tc.y + 6 }); return ids.length; }, dx);
await order(host, -6); await order(guest, 6); await order(spec1, 3); await order(spec2, -3);
await host.waitForTimeout(6000);
const snap = (p) => p.evaluate(() => { const s = window.aoe.session; let h = 2166136261 >>> 0; const mix = (v) => { h ^= (v | 0) >>> 0; h = Math.imul(h, 16777619) >>> 0; }; mix(s.state.tick); for (const u of s.state.units.values()) { mix(u.id); mix(Math.floor(u.x * 64)); mix(Math.floor(u.y * 64)); mix(Math.floor(u.hp)); } return { tick: s.state.tick, hash: h >>> 0, desynced: s.scheduler.desynced, units: s.state.units.size }; });
for (const p of [host, guest, spec1, spec2]) await p.evaluate(() => { window.aoe.session.paused = true; });
await host.waitForTimeout(300);
const snaps = await Promise.all([host, guest, spec1, spec2].map(snap));
const target = Math.max(...snaps.map((s) => s.tick));
for (const p of [host, guest, spec1, spec2]) await p.evaluate((t) => { const s = window.aoe.session; let g = 0; while (s.state.tick < t && g++ < 400) { if (!s.scheduler.step(s.state)) break; } }, target);
const final = await Promise.all([host, guest, spec1, spec2].map(snap));
console.log('anfitrião/convidado/espectador1/espectador2:', final.map((s) => `${s.tick}:${s.hash}`).join(' | '));
console.log(final.every((s) => s.tick === final[0].tick && s.hash === final[0].hash && !s.desynced) ? 'ESPECTADORES SINCRONIZADOS ✔' : 'DIVERGENTES ✘');
console.log('topo do espectador:', (await spec1.textContent('#top'))?.includes('Espectador') ? 'ok' : 'FALHOU');
// espectador sai: ninguém pausa
for (const p of [host, guest, spec1]) await p.evaluate(() => { window.aoe.session.paused = false; });
await spec2.close(); await host.waitForTimeout(800);
console.log('saída do espectador não pausa os jogadores:', (await info(host)).paused ? 'FALHOU' : 'ok');
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
