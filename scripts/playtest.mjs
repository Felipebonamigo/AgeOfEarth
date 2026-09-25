// Teste de jogabilidade automatizado: constrói, treina, pesquisa, abre modais e usa um poder.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? '/tmp/pt';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.type()}: ${m.text()}`); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.fill('#m-seed', '7'); await page.click('#m-start'); await page.waitForTimeout(1500);
const pause = (v) => page.evaluate((v) => { window.aoe.session.paused = v; }, v);
await pause(true);
const S = () => page.evaluate(() => { const s = window.aoe.session; return { tick: s.state.tick, sel: [...s.selection], res: Object.fromEntries(Object.entries(s.player.resources).map(([k, v]) => [k, Math.floor(v)])), buildings: [...s.state.buildings.values()].filter((b) => b.owner === s.local).map((b) => b.type + (b.complete ? '' : '*')), units: [...s.state.units.values()].filter((u) => u.owner === s.local).map((u) => u.type + ':' + u.state), mode: s.ui.mode, age: s.player.age }; });
// 1) seleciona todos os cidadãos (duplo clique em um) e constrói uma casa com atalho Q
const vill = await page.evaluate(() => { const s = window.aoe.session; const u = [...s.state.units.values()].find((x) => x.owner === s.local && x.type === 'villager'); const p = window.aoe.renderer.cam.worldToScreen(u.x, u.y); return { x: p.x, y: p.y, wx: u.x, wy: u.y }; });
await page.mouse.click(vill.x, vill.y); await page.waitForTimeout(150); await page.mouse.click(vill.x, vill.y); await page.waitForTimeout(300);
let st = await S(); console.log('seleção após duplo clique:', st.sel.length);
await page.keyboard.press('q'); await page.waitForTimeout(200);
st = await S(); console.log('modo:', st.mode);
const tc = await page.evaluate(() => { const s = window.aoe.session; const b = [...s.state.buildings.values()].find((x) => x.owner === s.local && x.type === 'town_center'); return { x: b.x, y: b.y }; });
// tenta alguns pontos até conseguir colocar
let placed = false;
for (const [dx, dy] of [[-5, 4], [5, 4], [-5, -5], [6, -4], [0, 6], [-7, 0]]) {
  const p = await page.evaluate(([x, y]) => window.aoe.renderer.cam.worldToScreen(x, y), [tc.x + dx, tc.y + dy]);
  await page.mouse.move(p.x, p.y); await page.waitForTimeout(100);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(300);
  await pause(false); await page.waitForTimeout(250); await pause(true);
  st = await S(); if (st.buildings.includes('house*')) { placed = true; break; }
}
console.log('casa colocada:', placed, 'edifícios:', st.buildings.join(','));
await page.screenshot({ path: `${out}-1-build.png` });
// 2) seleciona o centro cívico e treina cidadão com Q
const tcs = await page.evaluate(([x, y]) => window.aoe.renderer.cam.worldToScreen(x, y), [tc.x, tc.y]);
await page.mouse.click(tcs.x, tcs.y); await page.waitForTimeout(300);
await page.keyboard.press('q'); await page.waitForTimeout(300);
st = await S(); console.log('fila TC:', await page.evaluate(() => { const s = window.aoe.session; const b = [...s.state.buildings.values()].find((x) => x.owner === s.local && x.type === 'town_center'); return b.queue.map((q) => q.id).join(','); }));
await page.screenshot({ path: `${out}-2-tc.png` });
// 3) acelera, deixa construir/treinar
await pause(false);
await page.evaluate(() => { window.aoe.session.speed = 3; }); await page.waitForTimeout(9000); await page.evaluate(() => { window.aoe.session.speed = 1; });
await pause(true);
st = await S(); console.log('após 27s:', st.buildings.join(','), '| unidades:', st.units.length, '| res:', JSON.stringify(st.res));
// 4) dá recursos e templo para testar o modal de deus menor
await page.evaluate(() => { const s = window.aoe.session; s.player.resources.food = 2000; s.player.resources.gold = 2000; s.player.resources.wood = 2000; });
await page.keyboard.press('Escape'); await page.waitForTimeout(100);
// constrói templo via atalho S com cidadãos selecionados
const vill2 = await page.evaluate(() => { const s = window.aoe.session; const u = [...s.state.units.values()].find((x) => x.owner === s.local && x.type === 'villager'); const p = window.aoe.renderer.cam.worldToScreen(u.x, u.y); return { x: p.x, y: p.y }; });
await page.mouse.click(vill2.x, vill2.y); await page.waitForTimeout(150); await page.mouse.click(vill2.x, vill2.y); await page.waitForTimeout(200);
console.log('seleção 2:', (await S()).sel.length);
await page.keyboard.press('s'); await page.waitForTimeout(200);
st = await S(); console.log('modo templo:', st.mode);
for (const [dx, dy] of [[7, 0], [-8, 0], [0, -7], [0, 8], [8, 6], [-8, -6]]) {
  const p = await page.evaluate(([x, y]) => window.aoe.renderer.cam.worldToScreen(x, y), [tc.x + dx, tc.y + dy]);
  await page.mouse.move(p.x, p.y); await page.waitForTimeout(80); await page.mouse.click(p.x, p.y); await page.waitForTimeout(200);
  st = await S(); if (st.buildings.includes('temple*')) break;
}
await pause(false); await page.waitForTimeout(400);
st = await S(); console.log('templo:', st.buildings.filter((b) => b.startsWith('temple')).join(','));
await page.evaluate(() => { const s = window.aoe.session; for (const b of s.state.buildings.values()) if (b.owner === s.local && b.type === 'temple') { b.complete = true; b.progress = 60; b.hp = b.maxHp; } });
await page.waitForTimeout(300);
await page.click('#top .btn.gold'); await page.waitForTimeout(400);
await page.screenshot({ path: `${out}-3-minorgod.png` });
const cards = await page.$$('#modal .card'); console.log('cartas de deus menor:', cards.length);
if (cards.length) await cards[0].click();
await page.waitForTimeout(300);
st = await S(); console.log('avanço enfileirado, modo:', st.mode);
// 5) enciclopédia e ajuda
await page.keyboard.press('F2'); await page.waitForTimeout(400); await page.screenshot({ path: `${out}-4-enc.png` }); await page.keyboard.press('Escape');
await page.keyboard.press('F1'); await page.waitForTimeout(300); await page.keyboard.press('Escape');
// 6) poder divino Raio em um inimigo (cria um inimigo perto para o teste)
await page.evaluate(() => { const s = window.aoe.session; const tc = [...s.state.buildings.values()].find((x) => x.owner === s.local && x.type === 'town_center'); window.aoe.testEnemy = tc; });
await page.click('#gods .pw'); await page.waitForTimeout(200);
st = await S(); console.log('modo poder:', st.mode);
await page.keyboard.press('Escape');
// 7) salvar e carregar
await page.keyboard.press('F5'); await page.waitForTimeout(300);
await page.keyboard.press('F9'); await page.waitForTimeout(800);
st = await S(); console.log('após carregar: tick', st.tick, 'edifícios', st.buildings.length);
await page.screenshot({ path: `${out}-5-final.png` });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
