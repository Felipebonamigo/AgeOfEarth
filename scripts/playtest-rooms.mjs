// Lista pública de salas: o anfitrião abre uma sala; outro navegador consulta a lista, vê a sala (anfitrião, 1/4, modo)
// e entra por ela; o anfitrião torna a sala privada e um terceiro navegador não a vê mais.
// Exige `npm run preview` (porta 4173) e `npm run relay` (porta 8787) — ou os endereços passados como argumentos.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const relay = process.argv[3] ?? 'ws://localhost:8787';   // relay em outra porta: node scripts/playtest-rooms.mjs <url> <ws>
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const room = 'LISTA' + Math.floor(Math.random() * 1000);
const mk = async (name) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} ${m.text()}`); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('[data-tab="multiplayer"]'); await page.waitForTimeout(200);
  await page.fill('#mp-url', relay); await page.fill('#mp-name', name);
  return page;
};
const host = await mk('Anfitrião');
await host.fill('#mp-room', room); await host.click('#mp-join'); await host.waitForTimeout(800);
await host.selectOption('#mp-mode', 'regicide'); await host.waitForTimeout(300);
const guest = await mk('Convidado');
await guest.click('#mp-browse'); await guest.waitForTimeout(1000);
const list = await guest.textContent('#mp-rooms');
console.log('lista no convidado:', list?.includes(room) && list.includes('Anfitrião') && list.includes('1/4') && list.includes('Regicídio') ? `ok (${list.replace(/\s+/g, ' ').trim().slice(0, 120)})` : `FALHOU (${list})`);
await guest.click(`[data-room="${room}"]`); await guest.waitForTimeout(1000);
console.log('entrou pela lista:', (await guest.textContent('#mp'))?.includes(room) && await guest.$('#mp-leave') ? 'ok' : 'FALHOU', '| jogadores na sala (anfitrião vê):', await host.$$eval('#mp table tr', (r) => r.length - 1));
// sala privada some da lista
await host.uncheck('#mp-public'); await host.waitForTimeout(400);
const third = await mk('Curioso');
await third.click('#mp-browse'); await third.waitForTimeout(1000);
const list2 = await third.textContent('#mp-rooms');
console.log('sala privada não aparece:', list2?.includes(room) ? `FALHOU (${list2})` : 'ok');
await host.check('#mp-public'); await third.waitForTimeout(3600);   // a lista se atualiza sozinha a cada 3 s
console.log('volta a aparecer ao tornar pública (atualização automática):', (await third.textContent('#mp-rooms'))?.includes(room) ? 'ok' : 'FALHOU');
await third.click('#mp-browse'); await third.waitForTimeout(200);
console.log('fechar lista:', (await third.textContent('#mp-rooms'))?.trim() === '' ? 'ok' : 'FALHOU');
// sala iniciada: continua na lista, mas só para assistir (desde os espectadores, 4.x) — sem o botão Entrar
await host.click('#mp-start'); await host.waitForTimeout(2500);
await third.click('#mp-browse'); await third.waitForTimeout(1000);
const startedRow = await third.evaluate((code) => ({ enter: !!document.querySelector(`[data-room="${code}"]`), spectate: !!document.querySelector(`[data-spectate="${code}"]`) }), room);
console.log('sala iniciada só para assistir:', !startedRow.enter && startedRow.spectate ? 'ok' : `FALHOU (${JSON.stringify(startedRow)})`, '| partida rodando no convidado:', await guest.evaluate(() => !!window.aoe.session) ? 'ok' : 'FALHOU');
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
