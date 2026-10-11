// Playtest da E3 (linhas de unidade): a evolução no painel da Biblioteca, a transformação das unidades, o botão do
// Quartel no degrau novo e a linha de unidade na árvore de estudos (F3). Exige `npm run preview` (porta 4173).
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? '/tmp/e3';
const browser = await chromium.launch({ env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' }, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], fails = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'OK   ' : 'FALHA'} ${name} ${extra}`); if (!cond) fails.push(name); };
await page.goto(url, { waitUntil: 'networkidle' });
await page.fill('#m-seed', '7'); await page.click('#m-start'); await page.waitForTimeout(1500);
const pause = (v) => page.evaluate((v) => { window.aoe.session.paused = v; }, v);
// comandos do HUD e dos atalhos entram na fila do agendador e só valem no próximo tick: com o jogo pausado, solte
// alguns ticks antes de conferir o estado (como o scripts/playtest.mjs faz depois de colocar a casa)
const flush = async () => { await pause(false); await page.waitForTimeout(300); await pause(true); };
await pause(true);
// cenário: Era II, recursos, Biblioteca e Quartel prontos perto do Centro Cívico, 4 hoplitas
const ids = await page.evaluate(() => {
  const a = window.aoe, s = a.session, p = s.player;
  p.age = 1;
  for (const r of Object.keys(p.resources)) p.resources[r] = 5000;
  const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center');
  const put = (type, dx, dy) => { for (let r = 0; r < 8; r++) for (const [ox, oy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) { const b = a.debugBuild(s.local, type, tc.tx + dx + ox, tc.ty + dy + oy, 1); if (b) return b.id; } return -1; };
  const lib = put('academy', -6, 0), bar = put('barracks', 6, 0);
  const hops = [0, 1, 2, 3].map((k) => a.debugSpawn(s.local, 'hoplite', tc.x - 2 + k, tc.y + 4)?.id ?? -1);
  return { lib, bar, hops };
});
ok('Biblioteca, Quartel e hoplitas', ids.lib > 0 && ids.bar > 0 && ids.hops.every((h) => h > 0), JSON.stringify(ids));
const labels = () => page.$$eval('#commands button.cmd .lbl', (els) => els.map((e) => e.textContent));
const select = async (id) => { await page.evaluate((id) => window.aoe.session.select([id]), id); await page.waitForTimeout(400); };
// 1) a Biblioteca mostra a evolução; clicar põe na fila
await select(ids.lib);
ok('Biblioteca mostra "Infantaria pesada: Hipaspista"', (await labels()).includes('Infantaria pesada: Hipaspista'), `| ${(await labels()).join(' · ')}`);
await page.screenshot({ path: `${out}-1-biblioteca.png` });
await page.locator('#commands button.cmd', { hasText: 'Infantaria pesada: Hipaspista' }).click();
await flush();
const queued = await page.evaluate((id) => window.aoe.session.state.buildings.get(id).queue.map((q) => q.id), ids.lib);
ok('estudo na fila da Biblioteca', queued.includes('evo_heavy_infantry_2'), queued.join(','));
// 2) acelera até o estudo terminar (33 s de jogo); os hoplitas viram hipaspistas
await pause(false); await page.evaluate(() => { window.aoe.session.speed = 3; });
const done = () => page.evaluate(() => window.aoe.session.player.techs.includes('evo_heavy_infantry_2'));
for (let i = 0; i < 120 && !(await done()); i++) await page.waitForTimeout(500);   // até 60 s reais: com o swiftshader o quadro é lento e o jogo anda abaixo de 3×
await pause(true); await page.evaluate(() => { window.aoe.session.speed = 1; });
ok('estudo terminou', await done());
const types = await page.evaluate((hs) => hs.map((h) => window.aoe.session.state.units.get(h)?.type), ids.hops);
ok('hoplitas transformados', types.every((x) => x === 'hypaspist'), types.join(','));
// 3) o Quartel treina o degrau novo pela tecla Q
await select(ids.bar);
ok('Quartel mostra o Hipaspista', (await labels()).includes('Hipaspista'), `| ${(await labels()).join(' · ')}`);
await page.keyboard.press('q'); await flush();
const barQ = await page.evaluate((id) => window.aoe.session.state.buildings.get(id).queue.map((q) => q.id), ids.bar);
ok('Q no Quartel enfileira hipaspista', barQ.at(-1) === 'hypaspist', barQ.join(','));
await page.screenshot({ path: `${out}-2-quartel.png` });
// 4) árvore de estudos: a linha da infantaria pesada com o próximo degrau
await page.keyboard.press('F3'); await page.waitForTimeout(500);
ok('árvore tem a evolução seguinte', !!(await page.$('[data-study="evo_heavy_infantry_3"]')));
await page.screenshot({ path: `${out}-3-arvore.png` });
await page.keyboard.press('Escape');
ok('sem erros no console', errors.length === 0, errors.join(' | '));
await browser.close();
if (fails.length) { console.log(`FALHAS: ${fails.join(', ')}`); process.exit(1); }
console.log('playtest-lines: tudo OK');
