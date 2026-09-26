// Lote "distância-cerco" da Etapa 4 (docs/ART.md Apêndice E) no jogo: partida com semente fixa (42, mapa pequeno,
// 1 IA) e, numa área aberta perto do Centro Cívico, uma roda com peltastas, arqueiros cretenses, petróbolos e helépoles
// indo e voltando nas 8 direções (postura passiva), peltastas e arqueiros cretenses atirando em milícias inimigas
// (mira entre um disparo e outro) e petróbolos e helépoles bombardeando casas inimigas (vida alta: a cena dura as
// capturas). O mapa é revelado só no renderizador e o HUD fica oculto.
// Capturas em docs/art/: <prefixo>-distancia-cerco-z10.png (preset médio, atlas 1×, zoom 1), -z16.png (o cerco de perto)
// e -z16-2x.png (preset alto, atlas 2×).
// Falha se houver erro de página, se algum dos 4 tipos sair procedural, se quem anda olhar para fora da velocidade, se
// peltastas/arqueiros não aparecerem atirando E mirando ou se o cerco não aparecer disparando e rodando.
// Exige `npm run preview` (ou a URL passada). Uso: node scripts/artlote-distancia.mjs [url] [--out docs/art] [--prefix etapa4]
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
const LOT = ['peltast', 'cretan_archer', 'petrobolos', 'helepolis'];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { try { const k = 'aoe_settings_v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), edgeScroll: false, quality: 'medium', bakedArt: true, showFps: false })); } catch { /* ignore */ } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.mouse.move(720, 450);
await page.evaluate(() => {
  const players = [{ name: 'Jogador', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'Leônidas (IA)', god: 'poseidon', isAI: true, difficulty: 'easy', team: 1 }];
  window.aoe.startGame({ seed: 42, mapSize: 'small', players, revealMap: false, mode: 'conquest', mapType: 'continental' });
  window.aoe.session.paused = true;
  const h = document.getElementById('hud'); if (h) h.style.visibility = 'hidden';
});
await page.evaluate(() => window.aoe.renderer.art.ready());

const scene = await page.evaluate((LOT) => {
  const s = window.aoe.session, st = s.state, map = st.map, me = s.local, foe = (me + 1) % st.players.length;
  const sp = window.aoe.debugSpawn;
  const tc = [...st.buildings.values()].find((b) => b.owner === me && b.type === 'town_center');
  const open = (x, y) => { if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false; const i = y * map.w + x; return !map.blocked[i] && map.nodeAt[i] === -1 && map.buildingAt[i] === -1 && map.terrain[i] !== 1 && map.terrain[i] !== 2 && map.terrain[i] !== 5; };
  // área aberta de 30 × 14 tiles, a mais livre num raio de ~24 do Centro Cívico (longe da borda do mapa)
  let area = null, bestFree = -1;
  for (let y0 = Math.max(3, Math.floor(tc.y) - 24); y0 <= Math.floor(tc.y) + 12; y0++) for (let x0 = Math.max(3, Math.floor(tc.x) - 28); x0 <= Math.floor(tc.x) + 8; x0++) {
    if (x0 + 30 >= map.w - 3 || y0 + 14 >= map.h - 3) continue;
    let free = 0; for (let y = y0; y < y0 + 14; y++) for (let x = x0; x < x0 + 30; x++) if (open(x, y)) free++;
    if (free > bestFree) { bestFree = free; area = { x: x0, y: y0 }; }
  }
  const ids = (list) => list.filter(Boolean).map((u) => u.id);
  const tough = (u) => { if (u) { u.hp = u.maxHp = 50000; } return u; };
  // roda: 2 de cada tipo, passivos, indo e voltando nas 8 direções
  const W = { x: area.x + 6, y: area.y + 7 };
  const walkers = [];
  for (let k = 0; k < 8; k++) walkers.push(sp(me, LOT[k % 4], W.x, W.y));
  s.issue({ type: 'stance', player: me, ids: ids(walkers), stance: 'passive' });
  // tiro: peltastas (alcance 3,5) e arqueiros cretenses (6,5) contra milícias inimigas passivas
  const R = { x: area.x + 17, y: area.y + 2 };
  const shooters = [], targets = [];
  for (let i = 0; i < 3; i++) {
    const t1 = tough(sp(foe, 'militia', R.x + 3, R.y + i)), t2 = tough(sp(foe, 'militia', R.x + 3, R.y + 4 + i));
    targets.push(t1, t2);
    const p = tough(sp(me, 'peltast', R.x, R.y + i)), c = tough(sp(me, 'cretan_archer', R.x - 3, R.y + 4 + i));
    shooters.push([p, t1], [c, t2]);
  }
  s.scheduler.issue({ type: 'stance', player: foe, ids: ids(targets), stance: 'passive' });
  shooters.forEach(([u, t]) => { if (u && t) s.issue({ type: 'attack', player: me, ids: [u.id], targetId: t.id }); });
  // cerco: casas inimigas a leste; petróbolos (alcance 7) e helépoles (6) bombardeando
  const houses = [];
  for (const [dx, dy] of [[26, 2], [26, 8]]) { const b = window.aoe.debugBuild(foe, 'house', area.x + dx, area.y + dy, 1); if (b) { b.hp = b.maxHp = 1e6; houses.push(b); } }
  const siege = [];
  for (let i = 0; i < 2; i++) {
    const h = houses[i % Math.max(1, houses.length)];
    const pb = tough(sp(me, 'petrobolos', area.x + 19, area.y + 9 + i * 2)), hl = tough(sp(me, 'helepolis', area.x + 21, area.y + 4 + i * 5));
    for (const u of [pb, hl]) if (u && h) s.issue({ type: 'attack', player: me, ids: [u.id], targetId: h.id });
    siege.push(pb, hl);
  }
  window.__walkers = ids(walkers); window.__wc = W; window.__lot = LOT;
  window.aoe.renderer.revealAll = true;
  return { area, walk: W, ranged: R, houses: houses.map((b) => ({ x: b.x, y: b.y })), siege: ids(siege).length, units: st.units.size };
}, LOT);
console.log('cena:', JSON.stringify(scene));
await page.waitForTimeout(300);
await page.evaluate(() => window.aoe.applyQuality());
// carregamento por tipo: os 4 tipos (Idades 1–3) chegam na primeira vista; aqui se pede junto e se espera
await page.evaluate(() => { window.aoe.renderer.art.prewarmUnits(window.__lot); return window.aoe.renderer.art.ready(); });
await page.evaluate(() => {
  let out = true;
  const go = () => {
    const s = window.aoe.session; if (!s) return;
    window.__walkers.forEach((id, k) => {
      const u = s.state.units.get(id); if (!u) return;
      const a = (k * Math.PI) / 4, r = out ? 3.5 : 0;
      s.issue({ type: 'move', player: u.owner, ids: [id], x: window.__wc.x + 0.5 + Math.cos(a) * r, y: window.__wc.y + 0.5 + Math.sin(a) * r });
    });
    out = !out;
  };
  go(); window.__walkTimer = setInterval(go, 3400);
  window.aoe.session.paused = false; window.aoe.session.speed = 1;
});

const look = (p, zoom) => page.evaluate(([x, y, z]) => { const c = window.aoe.renderer.cam; c.zoom = z; c.centerOn(x, y); }, [p.x, p.y, zoom]);
const shot = async (name) => { await page.waitForTimeout(1400); const f = join(outDir, `${prefix}-${name}.png`); await page.screenshot({ path: f }); console.log('captura:', f); };
await page.waitForTimeout(3000);
// amostras das vistas: animação por tipo, procedurais e direção de quem anda
const tally = { byType: {}, procedural: {}, dirOk: 0, dirBad: 0 };
for (let k = 0; k < 24; k++) {
  const r = await page.evaluate(() => {
    const s = window.aoe.session, R = window.aoe.renderer, out = { byType: {}, procedural: {}, dirOk: 0, dirBad: 0 };
    for (const [id, v] of R.views) {
      const u = s.state.units.get(id);
      if (!u || !window.__lot.includes(v.type)) continue;
      if (!v.unit) { out.procedural[v.type] = (out.procedural[v.type] ?? 0) + 1; continue; }
      const bt = out.byType[v.type] ??= {}; bt[v.unit.anim] = (bt[v.unit.anim] ?? 0) + 1;
      const dx = u.x - u.px, dy = u.y - u.py;
      if (dx * dx + dy * dy > 1e-6 && v.unit.anim === 'walk') {
        const d = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8, diff = Math.min((d - v.unit.dir + 8) % 8, (v.unit.dir - d + 8) % 8);
        if (diff <= 1) out.dirOk++; else out.dirBad++;
      }
    }
    return out;
  });
  for (const [t, m] of Object.entries(r.byType)) for (const [a, n] of Object.entries(m)) { const bt = tally.byType[t] ??= {}; bt[a] = (bt[a] ?? 0) + n; }
  for (const [t, n] of Object.entries(r.procedural)) tally.procedural[t] = (tally.procedural[t] ?? 0) + n;
  tally.dirOk += r.dirOk; tally.dirBad += r.dirBad;
  await page.waitForTimeout(250);
}
console.log('vistas do lote:', JSON.stringify(tally));
for (const t of LOT) if (!tally.byType[t]) errors.push(`${t}: nenhuma vista assada`);
if (Object.keys(tally.procedural).length) errors.push(`lote procedural: ${JSON.stringify(tally.procedural)}`);
if (tally.dirBad > 0) errors.push(`direção incoerente em ${tally.dirBad} amostra(s) andando`);
for (const t of ['peltast', 'cretan_archer']) for (const a of ['attack', 'aim', 'walk']) if (!tally.byType[t]?.[a]) errors.push(`${t}: nenhuma amostra em '${a}'`);
for (const t of ['petrobolos', 'helepolis']) for (const a of ['attack', 'walk']) if (!tally.byType[t]?.[a]) errors.push(`${t}: nenhuma amostra em '${a}'`);
await look({ x: scene.area.x + 15, y: scene.area.y + 7 }, 1.0); await shot('distancia-cerco-z10');
await look({ x: scene.area.x + 22, y: scene.area.y + 7 }, 1.6); await shot('distancia-cerco-z16');
const status1 = await page.evaluate(() => ({ ...window.aoe.renderer.art.status(), preset: window.aoe.renderer.quality.preset }));
// preset alto (atlas 2×)
await page.evaluate(() => { window.aoe.settings.quality = 'high'; window.aoe.applyQuality(); });
await page.evaluate(() => { window.aoe.renderer.art.prewarmUnits(window.__lot); return window.aoe.renderer.art.ready(); });
await look({ x: scene.area.x + 22, y: scene.area.y + 7 }, 1.6); await shot('distancia-cerco-z16-2x');
const status2 = await page.evaluate(() => ({ ...window.aoe.renderer.art.status(), preset: window.aoe.renderer.quality.preset }));
await page.evaluate(() => clearInterval(window.__walkTimer));
console.log('arte (médio):', JSON.stringify(status1));
console.log('arte (alto):', JSON.stringify(status2));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
if (errors.length) process.exit(1);
