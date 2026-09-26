// Desfile do lote "cavalaria" da Etapa 4 (docs/ART.md Apêndice E): batedor (kataskopos), hipeu (hippeus) e hetairo
// (hetairoi) assados no rig do cavalo, numa partida com semente fixa (42, mapa pequeno, 1 IA). Numa área aberta perto do
// Centro Cívico: uma roda de 9 cavaleiros (3 de cada) indo e voltando nas 8 direções — soltos, acima de RUN_SPEED, eles
// galopam (`run`) —, três duplas de cada tipo lutando contra hoplitas inimigos (vida alta) e, depois das capturas, um de
// cada tipo morrendo (a queda `die` assada). O mapa é revelado só no renderizador e o HUD fica oculto.
// Capturas: <out>/<prefixo>-cavalaria-{z10,z22}.png (preset médio, atlas 1×) e -cavalaria-z22-2x.png (preset alto, 2×).
// Falha se houver erro de página, se algum dos três sair procedural, se algum não aparecer galopando e atacando, se quem
// anda/galopa olhar para fora da velocidade, se > 10 % dos quadros de `attack` apontarem a 90°+ do alvo, se a queda não
// sair assada ou se a arte não for servida nas duas escalas.
// Exige `npm run preview` (ou a URL passada). Uso: node scripts/artcavalry.mjs [url] [--out docs/art] [--prefix etapa4]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const url = pos[0] ?? 'http://localhost:4173/';
const outDir = opt('--out', 'docs/art');
const prefix = opt('--prefix', 'etapa4');
mkdirSync(outDir, { recursive: true });
const SEED = 42;
const LOT = ['kataskopos', 'hippeus', 'hetairoi'];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { try { const k = 'aoe_settings_v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), edgeScroll: false, quality: 'medium', bakedArt: true, showFps: false })); } catch { /* ignore */ } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.mouse.move(720, 450);
await page.evaluate((seed) => {
  const players = [{ name: 'Jogador', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'Leônidas (IA)', god: 'poseidon', isAI: true, difficulty: 'easy', team: 1 }];
  window.aoe.startGame({ seed, mapSize: 'small', players, revealMap: false, mode: 'conquest', mapType: 'continental' });
  window.aoe.session.paused = true;
  const h = document.getElementById('hud'); if (h) h.style.visibility = 'hidden';
}, SEED);
await page.evaluate(() => window.aoe.renderer.art.ready());

const scene = await page.evaluate((LOT) => {
  const s = window.aoe.session, st = s.state, map = st.map, me = s.local, foe = (me + 1) % st.players.length;
  const sp = window.aoe.debugSpawn;
  const tc = [...st.buildings.values()].find((b) => b.owner === me && b.type === 'town_center');
  const open = (x, y) => { if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false; const i = y * map.w + x; return !map.blocked[i] && map.nodeAt[i] === -1 && map.buildingAt[i] === -1 && map.terrain[i] !== 1 && map.terrain[i] !== 2 && map.terrain[i] !== 5; };
  // área aberta de 26 × 14 tiles, a mais livre num raio de ~20 do Centro Cívico (longe da borda do mapa)
  let area = null, bestFree = -1;
  for (let y0 = tc.y - 20; y0 <= tc.y + 8; y0++) for (let x0 = tc.x - 24; x0 <= tc.x + 4; x0++) {
    if (x0 < 3 || y0 < 3 || x0 + 26 >= map.w - 3 || y0 + 14 >= map.h - 3) continue;
    let free = 0; for (let y = y0; y < y0 + 14; y++) for (let x = x0; x < x0 + 26; x++) if (open(x, y)) free++;
    free -= Math.abs(x0 + 13 - tc.x) * 0.5 + Math.abs(y0 + 7 - tc.y) * 0.5;   // perto do CC
    if (free > bestFree) { bestFree = free; area = { x: x0, y: y0 }; }
  }
  const ids = (list) => list.filter(Boolean).map((u) => u.id);
  const tough = (u) => { if (u) { u.hp = u.maxHp = 5000; } return u; };
  // roda: 9 cavaleiros passivos, cada um vai e volta 6 tiles numa direção (as 8 + uma repetida)
  const W = { x: area.x + 7, y: area.y + 7 };
  const riders = [];
  for (let k = 0; k < 9; k++) riders.push(sp(me, LOT[k % 3], W.x, W.y));
  s.issue({ type: 'stance', player: me, ids: ids(riders), stance: 'passive' });
  // luta: cada tipo contra hoplitas inimigos (vida alta), em três linhas à direita da roda
  const F = { x: area.x + 19, y: area.y + 2 };
  const fighters = [], foes = [];
  LOT.forEach((t, r) => {
    for (let i = 0; i < 2; i++) {
      const a = tough(sp(me, t, F.x - 1.5, F.y + r * 4 + i * 1.4)), b = tough(sp(foe, 'hoplite', F.x + 1.2, F.y + r * 4 + i * 1.4));
      fighters.push(a); foes.push(b);
      if (a && b) { s.issue({ type: 'attack', player: me, ids: [a.id], targetId: b.id }); s.scheduler.issue({ type: 'attack', player: foe, ids: [b.id], targetId: a.id }); }
    }
  });
  window.__riders = ids(riders); window.__wc = W; window.__lot = LOT; window.__fighters = ids(fighters);
  window.aoe.renderer.revealAll = true;
  return { tc: { x: tc.x, y: tc.y }, area, walk: W, fight: F, riders: riders.filter(Boolean).length, fighters: fighters.filter(Boolean).length };
}, LOT);
console.log('cena:', JSON.stringify(scene));
await page.waitForTimeout(300);
await page.evaluate(() => window.aoe.applyQuality());
// carregamento por tipo: hipeu e hetairo (Idades seguintes) não estavam quentes; pede junto e espera a subida para a GPU
await page.evaluate(() => { window.aoe.renderer.art.prewarmUnits(window.__lot); return window.aoe.renderer.art.ready(); });
// vai e volta: a cada 2,4 s cada cavaleiro alterna entre o centro da roda e 6 tiles na sua direção
await page.evaluate(() => {
  let out = true;
  const go = () => {
    const s = window.aoe.session; if (!s) return;
    window.__riders.forEach((id, k) => {
      const u = s.state.units.get(id); if (!u) return;
      const a = ((k % 8) * Math.PI) / 4, r = out ? 6 : 0;
      s.issue({ type: 'move', player: u.owner, ids: [id], x: window.__wc.x + 0.5 + Math.cos(a) * r, y: window.__wc.y + 0.5 + Math.sin(a) * r });
    });
    out = !out;
  };
  go(); window.__walkTimer = setInterval(go, 2400);
  window.aoe.session.paused = false; window.aoe.session.speed = 1;
});

const look = (p, zoom) => page.evaluate(([x, y, z]) => { const c = window.aoe.renderer.cam; c.zoom = z; c.centerOn(x, y); }, [p.x, p.y, zoom]);
const shot = async (name) => { await page.waitForTimeout(900); const f = join(outDir, `${prefix}-${name}.png`); await page.screenshot({ path: f }); console.log('captura:', f); };
await page.waitForTimeout(1500);

// amostragem das vistas por ~5 s: animações por tipo, direção de quem se move e golpes virados para o alvo
const stats = { byType: {}, procedural: {}, dirOk: 0, dirBad: 0, hitOk: 0, hitOff: 0, samples: [] };
for (let k = 0; k < 20; k++) {
  const r = await page.evaluate(() => {
    const s = window.aoe.session, R = window.aoe.renderer, out = { views: [], procedural: [] };
    for (const [id, v] of R.views) {
      const u = s.state.units.get(id);
      if (!u || !window.__lot.includes(v.type)) continue;
      if (!v.unit) { out.procedural.push(v.type); continue; }
      const dx = u.x - u.px, dy = u.y - u.py, rec = { type: v.type, anim: v.unit.anim, dir: v.unit.dir, move: null, target: null };
      if (dx * dx + dy * dy > 1e-6) rec.move = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
      const t = s.state.units.get(u.targetId);
      if (t) rec.target = ((Math.round(Math.atan2(t.y - u.y, t.x - u.x) / (Math.PI / 4)) % 8) + 8) % 8;
      out.views.push(rec);
    }
    return out;
  });
  for (const t of r.procedural) stats.procedural[t] = (stats.procedural[t] ?? 0) + 1;
  for (const v of r.views) {
    const bt = stats.byType[v.type] ??= {}; bt[v.anim] = (bt[v.anim] ?? 0) + 1;
    const diff = (a, b) => Math.min((a - b + 8) % 8, (b - a + 8) % 8);
    if (v.move !== null && (v.anim === 'walk' || v.anim === 'run')) { if (diff(v.move, v.dir) <= 1) stats.dirOk++; else stats.dirBad++; }
    if (v.anim === 'attack' && v.target !== null) { if (diff(v.target, v.dir) >= 2) { stats.hitOff++; if (stats.samples.length < 5) stats.samples.push(v); } else stats.hitOk++; }
  }
  if (k === 6) { await look({ x: scene.walk.x + 6, y: scene.walk.y }, 1.0); await shot('cavalaria-z10'); }
  if (k === 12) { await look({ x: scene.fight.x, y: scene.fight.y + 4 }, 2.2); await shot('cavalaria-z22'); }
  await page.waitForTimeout(250);
}
console.log('vistas do lote:', JSON.stringify(stats));
if (Object.keys(stats.procedural).length) errors.push(`lote procedural: ${JSON.stringify(stats.procedural)}`);
for (const t of LOT) {
  const bt = stats.byType[t] ?? {};
  if (!bt.run) errors.push(`${t}: nenhuma vista galopando (run): ${JSON.stringify(bt)}`);
  if (!bt.attack) errors.push(`${t}: nenhuma vista atacando: ${JSON.stringify(bt)}`);
}
if (stats.dirBad > 0.05 * (stats.dirOk + stats.dirBad)) errors.push(`direção incoerente em ${stats.dirBad} de ${stats.dirOk + stats.dirBad} amostras em movimento`);
if (stats.hitOk + stats.hitOff === 0) errors.push("nenhum quadro de 'attack' com alvo");
else if (stats.hitOff > 0.1 * (stats.hitOk + stats.hitOff)) errors.push(`${stats.hitOff} de ${stats.hitOk + stats.hitOff} quadros de 'attack' a 90° ou mais do alvo`);

// morte: um de cada tipo da luta cai (vida 1) — a queda sai assada ('die') na faixa do pé
await page.evaluate(() => {
  const s = window.aoe.session, seen = new Set();
  for (const id of window.__fighters) { const u = s.state.units.get(id); if (u && !seen.has(u.type)) { seen.add(u.type); u.hp = 1; } }
});
const falls = {};
for (let k = 0; k < 16; k++) {
  const r = await page.evaluate(() => { const out = []; for (const uv of window.aoe.renderer.dying.values()) out.push([uv.type, uv.anim]); return out; });
  for (const [t, a] of r) if (a === 'die') falls[t] = (falls[t] ?? 0) + 1;
  if (k === 5) { await look({ x: scene.fight.x, y: scene.fight.y + 4 }, 1.6); await shot('cavalaria-queda'); }
  await page.waitForTimeout(200);
}
console.log('quedas assadas:', JSON.stringify(falls));
for (const t of LOT) if (!falls[t]) errors.push(`${t}: a morte não saiu assada`);

const status1 = await page.evaluate(() => ({ ...window.aoe.renderer.art.status(), preset: window.aoe.renderer.quality.preset }));
// preset alto (atlas 2×)
await page.evaluate(() => { window.aoe.settings.quality = 'high'; window.aoe.applyQuality(); });
await page.evaluate(() => { window.aoe.renderer.art.prewarmUnits(window.__lot); return window.aoe.renderer.art.ready(); });
await look({ x: scene.walk.x + 6, y: scene.walk.y }, 2.2); await shot('cavalaria-z22-2x');
const status2 = await page.evaluate(() => ({ ...window.aoe.renderer.art.status(), preset: window.aoe.renderer.quality.preset }));
const proc2 = await page.evaluate(() => { const out = []; for (const [id, v] of window.aoe.renderer.views) if (window.aoe.session.state.units.get(id) && window.__lot.includes(v.type) && !v.unit) out.push(v.type); return out; });
if (proc2.length) errors.push(`lote procedural no 2×: ${proc2.join(', ')}`);
await page.evaluate(() => clearInterval(window.__walkTimer));
console.log('arte (médio):', JSON.stringify(status1));
console.log('arte (alto):', JSON.stringify(status2));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
const bakedOk = /servida:1/.test(status1.units) && /servida:2/.test(status2.units);
if (!bakedOk) console.error('arte assada não foi servida como esperado');
if (errors.length || !bakedOk) process.exit(1);
