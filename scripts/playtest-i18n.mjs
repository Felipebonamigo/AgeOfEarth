// Troca o idioma para inglês no menu e confere HUD, comandos, tooltips e mensagens; depois volta para português.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' }, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], fails = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.selectOption('#m-locale', 'en'); await page.waitForTimeout(300);
console.log('menu EN:', (await page.textContent('#m-start'))?.trim(), '|', (await page.textContent('#menu .sub'))?.slice(0, 40));
await page.fill('#m-seed', '11'); await page.click('#m-start'); await page.waitForTimeout(1500);
console.log('toast:', (await page.textContent('#messages'))?.trim().slice(0, 80));
console.log('age button:', (await page.textContent('#top .btn.gold'))?.trim());
// seleciona o centro cívico → painel e comandos em inglês
const tc = await page.evaluate(() => { const s = window.aoe.session; const b = [...s.state.buildings.values()].find((x) => x.owner === s.local && x.type === 'town_center'); return window.aoe.renderer.cam.worldToScreen(b.x, b.y); });
await page.mouse.click(tc.x, tc.y); await page.waitForTimeout(300);
console.log('painel:', (await page.textContent('#selection .title'))?.trim(), '|', (await page.textContent('#selection .stats'))?.trim().slice(0, 60));
console.log('comandos:', (await page.$$eval('#commands .cmd .lbl', (els) => els.map((e) => e.textContent.trim()))).slice(0, 6).join(', '));
// vazamento de português: em inglês nenhum texto do modal pode ter acento ou palavra dos dados em PT
const PT_LEAK = /[ãõçÃÕÇ]|\b(Biblioteca|Pedra|Petróleo|Maravilha|Estudos?|Cidadãos?|Fortaleza|Templo|Comida|Madeira|Ouro|Conhecimento|Estaleiro|Caravana|Mercador|Idade|Linha)\b/;
const leaksOf = () => page.evaluate((src) => { const re = new RegExp(src); const out = []; const root = document.querySelector('#modal'); if (!root) return out; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (re.test(n.nodeValue ?? '') && !n.parentElement?.closest('[data-raw]')) out.push((n.nodeValue ?? '').trim().slice(0, 50)); return out; }, PT_LEAK.source);
const checkLeaks = async (where) => { const l = await leaksOf(); if (l.length) fails.push(`${where}: texto em português no modal: ${l.slice(0, 5).join(' | ')}`); };
// árvore de estudos (F3)
await page.keyboard.press('F3'); await page.waitForTimeout(500);
const treeTitle = (await page.textContent('#modal h2').catch(() => '')) ?? '';
console.log('árvore EN:', treeTitle.trim());
if (!treeTitle.includes('Study tree')) fails.push(`árvore em inglês: título "${treeTitle.trim()}"`);
await checkLeaks('árvore de estudos');
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
// ajuda (F1)
await page.keyboard.press('F1'); await page.waitForTimeout(400);
await checkLeaks('ajuda');
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
const ageTop = (await page.textContent('#top .age').catch(() => '')) ?? '';
if (!ageTop.includes('Era')) fails.push(`#top .age sem "Era": "${ageTop.trim()}"`);
await page.keyboard.press('F2'); await page.waitForTimeout(300);
for (const id of await page.$$eval('#modal [data-tab]', (els) => els.map((e) => e.dataset.tab))) { await page.click('#modal [data-tab="' + id + '"]'); await page.waitForTimeout(250); await checkLeaks('enciclopédia/' + id); }
console.log('enciclopédia:', (await page.textContent('#modal h2'))?.trim(), '|', (await page.$$eval('#modal table tr td', (els) => els.slice(0, 2).map((e) => e.textContent.trim()))).join(' / '));
await page.keyboard.press('Escape');
await page.screenshot({ path: '/tmp/en.png' });
// menu in-game: idioma de volta para PT
await page.click('#top button:has-text("Menu")'); await page.waitForTimeout(300);
await page.selectOption('#modal #o-lang', 'pt'); await page.waitForTimeout(300);
console.log('menu PT:', (await page.textContent('#modal h2'))?.trim(), (await page.textContent('#m-continue'))?.trim());
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
console.log('age button PT:', (await page.textContent('#top .btn.gold'))?.trim());
console.log('errors:', errors.length ? errors.join('\n') : 'none');
if (fails.length) console.log('FALHAS:\n' + fails.map((f) => ' - ' + f).join('\n'));
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
