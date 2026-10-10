// E1 (docs/eras/E1-eras-biblioteca.md): Era inicial pelo seletor, painel da Biblioteca (avançar, árvore, filósofo, fila n/5),
// atalho E, árvore de estudos em tela cheia (F3) em PT e EN, sem emoji. Capturas em docs/art/eras-e1-*.png.
// Uso: node scripts/playtest-library.mjs [url]   (precisa do `npm run preview`)
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' }, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.type()}: ${m.text()}`); });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FALHA'} ${msg}`); if (!ok) failed++; };
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]/u;
const pause = (v) => page.evaluate((v) => { window.aoe.session.paused = v; }, v);

await page.goto(url, { waitUntil: 'networkidle' });
await page.fill('#m-seed', '7');
await page.selectOption('#m-startage', '2'); await page.selectOption('#m-endage', '4');
await page.click('#m-start'); await page.waitForTimeout(1500);
await pause(true);
const st0 = await page.evaluate(() => { const s = window.aoe.session; const p = s.player; return { age: p.age, minor: p.minorGods.length, studies: p.techs.filter((t) => /^(civic|commerce|military|science)\d$/.test(t)).length, max: s.state.config.maxAge }; });
check(st0.age === 2 && st0.minor === 2 && st0.studies === 2 && st0.max === 4, `Era inicial 2 (deuses menores ${st0.minor}, estudos ${st0.studies}, Era final ${st0.max})`);

// Biblioteca pronta pela tecla Z (cidadãos selecionados), como o jogador faria
await page.evaluate(() => { const r = window.aoe.session.player.resources; for (const k of Object.keys(r)) r[k] = 9000; });
const tc = await page.evaluate(() => { const s = window.aoe.session; const b = [...s.state.buildings.values()].find((x) => x.owner === s.local && x.type === 'town_center'); return { x: b.x, y: b.y }; });
const vill = await page.evaluate(() => { const s = window.aoe.session; const u = [...s.state.units.values()].find((x) => x.owner === s.local && x.type === 'villager'); const p = window.aoe.renderer.cam.worldToScreen(u.x, u.y); return { x: p.x, y: p.y }; });
await page.mouse.click(vill.x, vill.y); await page.waitForTimeout(150); await page.mouse.click(vill.x, vill.y); await page.waitForTimeout(250);
await page.keyboard.press('z'); await page.waitForTimeout(200);
let placed = false;
for (const [dx, dy] of [[-7, 0], [0, 7], [7, -6], [-8, 6]]) {
  const p = await page.evaluate(([x, y]) => window.aoe.renderer.cam.worldToScreen(x, y), [tc.x + dx, tc.y + dy]);
  await page.mouse.move(p.x, p.y); await page.waitForTimeout(80); await page.mouse.click(p.x, p.y); await page.waitForTimeout(200);
  await pause(false); await page.waitForTimeout(250); await pause(true);
  placed = await page.evaluate(() => { const s = window.aoe.session; return [...s.state.buildings.values()].some((b) => b.owner === s.local && b.type === 'academy'); });
  if (placed) break;
}
check(placed, 'Biblioteca posta pela tecla Z');
await page.evaluate(() => { const s = window.aoe.session; for (const b of s.state.buildings.values()) if (b.owner === s.local && b.type === 'academy') { b.complete = true; b.progress = 60; b.hp = b.maxHp; } });
if (await page.evaluate(() => window.aoe.session.ui.mode !== 'normal')) await page.keyboard.press('Escape');   // só sai do modo de colocação (Esc sem modo abre o menu)
// seleciona a Biblioteca (pelo estado: o clique no sprite depende do zoom)
const selectLib = async () => { await page.evaluate(() => { const s = window.aoe.session; const b = [...s.state.buildings.values()].find((x) => x.owner === s.local && x.type === 'academy'); s.select([b.id]); }); await page.waitForTimeout(400); };
await selectLib();
const lbls = await page.$$eval('#commands .cmd .lbl', (els) => els.map((e) => e.textContent.trim()));
check(/Bizantina/.test(lbls[0] ?? ''), `1º botão avança para a Bizantina ("${lbls[0]}")`);
check(/Árvore de estudos/.test(lbls[1] ?? ''), `2º botão abre a árvore ("${lbls[1]}")`);
check(/Fila/.test((await page.textContent('#selection .stats')) ?? ''), 'o cartão mostra a fila');

// encher a fila só com estudos (nunca clicar às cegas por índice)
await pause(false);
for (let i = 0; i < 8; i++) {
  if (/5\/5/.test((await page.textContent('#selection .stats')) ?? '')) break;
  const idx = await page.$$eval('#commands .cmd', (els) => els.findIndex((e) => !e.disabled && /^(Civismo|Comércio|Militar|Ciência|Alvenaria|Logística)/.test(e.querySelector('.lbl')?.textContent.trim() ?? '')));
  if (idx < 0) break;
  await (await page.$$('#commands .cmd'))[idx].click(); await page.waitForTimeout(300);
}
check(/5\/5/.test((await page.textContent('#selection .stats')) ?? ''), 'fila da Biblioteca cheia (5/5)');
await page.keyboard.press('e'); await page.waitForTimeout(300);
const toast = await page.$$eval('.toast.warn', (els) => els.map((e) => e.textContent));
check(toast.some((x) => /Fila cheia/.test(x)), 'avançar com a fila cheia: "Fila cheia"');

// árvore de estudos em tela cheia (F3)
await page.keyboard.press('F3'); await page.waitForTimeout(500);
check(await page.isVisible('#modal.tree'), 'F3 abre a árvore');
check((await page.$$('#modal .tree-era')).length === 8, '8 colunas de Era');
check((await page.$$('#modal .tree-node.st-active')).length >= 1, 'há um estudo em andamento');
check((await page.$$('#modal .hic-ph')).length === 0, 'nenhum ícone vazio');
check(!EMOJI.test((await page.textContent('#modal')) ?? ''), 'sem emoji na árvore');
await page.screenshot({ path: 'docs/art/eras-e1-arvore-pt.png' });
await page.keyboard.press('Escape'); await page.waitForTimeout(200);

// EN: idioma pelo menu da partida
await page.click('#top-menu'); await page.waitForTimeout(300);
await page.selectOption('#modal #o-lang', 'en'); await page.waitForTimeout(300);
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.keyboard.press('F3'); await page.waitForTimeout(500);
check(/Study tree/.test((await page.textContent('#modal h2')) ?? ''), 'árvore em EN ("Study tree")');
await page.screenshot({ path: 'docs/art/eras-e1-arvore-en.png' });
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.click('#top-menu'); await page.waitForTimeout(300);
await page.selectOption('#modal #o-lang', 'pt'); await page.waitForTimeout(300);
await page.keyboard.press('Escape'); await page.waitForTimeout(200);

// painel da Biblioteca
await selectLib();
await page.screenshot({ path: 'docs/art/eras-e1-biblioteca.png' });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
