// Playtest da E4 (guerra no mar): tipos de mapa com mar no menu, partida nas Ilhas com peixe, Estaleiro na margem, barco de
// pesca, transporte (embarcar/desembarcar), cartão com carga e botão Desembarcar. Exige `npm run preview` (porta 4173).
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'docs/art';
const browser = await chromium.launch({ env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' }, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], fails = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'ok    ' : 'FALHOU'} ${name} ${extra}`); if (!cond) fails.push(name); };
await page.goto(url, { waitUntil: 'networkidle' });
const types = await page.$$eval('#m-maptype option', (els) => els.map((e) => e.value));
ok('o seletor de mapa tem costeiro, ilhas e mediterrâneo', ['coastal', 'islands', 'mediterranean'].every((t) => types.includes(t)), `| ${types.join(',')}`);
await page.selectOption('#m-mode', 'conquest'); await page.selectOption('#m-maptype', 'islands'); await page.fill('#m-seed', '42');
await page.click('#m-start'); await page.waitForTimeout(1500);
const pause = (v) => page.evaluate((v) => { window.aoe.session.paused = v; }, v);
const flush = async () => { await pause(false); await page.waitForTimeout(300); await pause(true); };
await pause(true);
ok('o mapa das Ilhas tem peixe', await page.evaluate(() => [...window.aoe.session.state.map.nodes.values()].some((n) => n.type === 'fish')));
// 3) Estaleiro: varre o entorno do Centro Cívico até debugBuild aceitar (já confere a margem)
const yardId = await page.evaluate(() => {
  const a = window.aoe, s = a.session;
  const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center');
  s.player.resources.wood = 5000; s.player.resources.gold = 5000; s.player.resources.food = 5000;
  for (let r = 4; r <= 24; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
    const b = a.debugBuild(s.local, 'shipyard', tc.tx + dx, tc.ty + dy, 1);
    if (b) return b.id;
  }
  return -1;
});
ok('o Estaleiro aparece na margem', yardId > 0, `| id ${yardId}`);
await page.evaluate((id) => window.aoe.session.select([id]), yardId); await page.waitForTimeout(400);
const labels = async () => page.$$eval('#commands button.cmd .lbl', (els) => els.map((e) => e.textContent));
{ const l = await labels(); ok('o Estaleiro mostra Barco de Pesca, Transporte e Pentecôntero', ['Barco', 'Transporte', 'Pentec'].every((x) => l.some((y) => y.includes(x))), `| ${l.join(' · ')}`); }
await page.evaluate((id) => window.aoe.session.issue({ type: 'train', player: window.aoe.session.local, buildingId: id, unit: 'fishing_boat' }), yardId);
await pause(false); await page.evaluate(() => { window.aoe.session.speed = 3; });
let boat = false;
for (let i = 0; i < 120 && !boat; i++) { await page.waitForTimeout(500); boat = await page.evaluate(() => { const s = window.aoe.session; const u = [...s.state.units.values()].find((x) => x.owner === s.local && x.type === 'fishing_boat'); if (!u) return false; const t = s.state.map.terrain[Math.floor(u.y) * s.state.map.w + Math.floor(u.x)]; return t === 1 || t === 5 || t === 6; }); }
await pause(true); await page.evaluate(() => { window.aoe.session.speed = 1; });
ok('o barco de pesca sai na água', boat);
// 4) transporte e tropas ao lado do Estaleiro
const setup = await page.evaluate((id) => {
  const a = window.aoe, s = a.session, m = s.state.map, y = s.state.buildings.get(id);
  const water = (x, yy) => { const t = m.terrain[yy * m.w + x]; return t === 1 || t === 5; };
  let w = null;
  for (let dy = -4; dy < y.h + 4 && !w; dy++) for (let dx = -4; dx < y.w + 4 && !w; dx++) { const x = y.tx + dx, yy = y.ty + dy; if (water(x, yy) && m.nodeAt[yy * m.w + x] === -1 && m.buildingAt[yy * m.w + x] === -1) w = { x, y: yy }; }
  if (!w) return null;
  const tr = a.debugSpawn(s.local, 'transport_ship', w.x + 0.5, w.y + 0.5);
  const hops = [0, 1, 2, 3].map((k) => a.debugSpawn(s.local, 'hoplite', y.tx + k, y.ty + y.h + 2));
  const tt = m.terrain[Math.floor(tr.y) * m.w + Math.floor(tr.x)];
  return { tr: tr.id, hops: hops.map((h) => h.id), navigable: tt === 1 || tt === 5 || tt === 6, sx: y.x, sy: y.y };
}, yardId);
ok('transporte e hoplitas criados (o navio nasce na água)', !!setup && setup.navigable);
await page.evaluate((s) => window.aoe.session.issue({ type: 'embark', player: window.aoe.session.local, ids: s.hops, targetId: s.tr }), setup);
await pause(false); await page.evaluate(() => { window.aoe.session.speed = 3; });
let cargo = 0;
for (let i = 0; i < 80 && cargo < 4; i++) { await page.waitForTimeout(500); cargo = await page.evaluate((id) => window.aoe.session.state.units.get(id).cargo.length, setup.tr); }
await pause(true); await page.evaluate(() => { window.aoe.session.speed = 1; });
ok('embarque: os 4 hoplitas sobem a bordo', cargo === 4, `| carga ${cargo}`);
await page.evaluate((id) => window.aoe.session.select([id]), setup.tr); await page.waitForTimeout(400);
ok('o cartão do transporte mostra a Carga', (await page.textContent('#selection'))?.includes('Carga'));
ok('o botão Desembarcar aparece', (await labels()).some((l) => l.includes('Desembarcar')), `| ${(await labels()).join(' · ')}`);
await page.evaluate((id) => { const a = window.aoe, u = a.session.state.units.get(id); a.session.state.config.revealMap = true; a.renderer.cam.zoom = 1.4; a.renderer.cam.centerOn(u.x, u.y); }, setup.tr); await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/e4-naval-transporte.png` });
// desembarca com a tecla U (aqui)
await page.keyboard.press('u'); await flush();
await pause(false); await page.evaluate(() => { window.aoe.session.speed = 3; });
let landed = false;
for (let i = 0; i < 80 && !landed; i++) { await page.waitForTimeout(500); landed = await page.evaluate((s) => { const st = window.aoe.session.state; return st.units.get(s.tr).cargo.length === 0 && s.hops.every((id) => { const u = st.units.get(id); return u && u.inside === -1; }); }, setup); }
await pause(true); await page.evaluate(() => { window.aoe.session.speed = 1; });
ok('desembarque: a carga desce em terra', landed);
const onLand = await page.evaluate((s) => { const st = window.aoe.session.state, m = st.map; return s.hops.every((id) => { const u = st.units.get(id); const t = m.terrain[Math.floor(u.y) * m.w + Math.floor(u.x)]; return t !== 1 && t !== 5; }); }, setup);
ok('os hoplitas desembarcados estão em terra', onLand);
// frota e cardumes a zoom 1: 3 navios de guerra e 2 barcos junto do Estaleiro, câmera no litoral
await page.evaluate((s) => { const a = window.aoe, st = a.session.state, m = st.map; const y = [...st.buildings.values()].find((b) => b.type === 'shipyard' && b.owner === a.session.local); let k = 0; for (let r = 3; r < 12 && k < 5; r++) for (let dy = -r; dy <= r && k < 5; dy += 2) for (let dx = -r; dx <= r && k < 5; dx += 3) { const x = y.tx + dx, yy = y.ty + dy; const t = m.terrain[yy * m.w + x]; if ((t === 1 || t === 5) && m.nodeAt[yy * m.w + x] === -1) { a.debugSpawn(a.session.local, ['penteconter', 'trireme', 'galleon', 'fishing_boat', 'ironclad'][k], x + 0.5, yy + 0.5); k++; } } a.session.state.config.revealMap = true; a.renderer.cam.zoom = 1; a.renderer.cam.centerOn(y.x + 4, y.y); }, setup);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/e4-naval-ilhas.png` });
ok('nenhum erro no console', errors.length === 0, errors.join(' | '));
await browser.close();
if (fails.length) { console.log(`FALHAS: ${fails.join(', ')}`); process.exit(1); }
console.log('playtest-naval: tudo ok');
