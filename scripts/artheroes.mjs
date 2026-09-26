// Lote heróis da Etapa 4 no jogo (docs/ART.md, Apêndice E): partida com semente fixa (42, mapa pequeno, 1 IA fácil) e,
// numa área aberta perto do Centro Cívico do jogador, o rei e os 5 heróis parados em fila (virados para a câmera), a
// mesma fila andando (vai e volta na horizontal) e cada herói com habilidade lutando contra um hoplita inimigo (vida
// alta) e usando a habilidade Q no mesmo tick — a captura pega a animação `ability` no meio (sessão pausada: o relógio
// das animações é o de jogo e congela). O HUD fica oculto e o mapa é revelado só no renderizador.
// Capturas em <out>/: <prefixo>-z10.png e -z22.png (fila parada e andando), -habilidade-z22.png (as 5 habilidades) e
// -z22-2x.png (a fila no preset alto, atlas 2×). Falha se houver erro de página, se algum tipo do lote sair procedural,
// se algum herói com habilidade não tocar `ability`, se o arco de Odisseu não atirar/mirar ou se quem anda olhar para
// fora da velocidade. Exige `npm run preview` (ou a URL passada).
// Uso: node scripts/artheroes.mjs [url] [--out scratch] [--prefix etapa4-herois]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const url = pos[0] ?? 'http://localhost:4173/';
const outDir = opt('--out', 'scratch');
const prefix = opt('--prefix', 'etapa4-herois');
mkdirSync(outDir, { recursive: true });
const HEROES = ['basileus', 'jason', 'odysseus', 'heracles', 'achilles', 'perseus'];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { try { const k = 'aoe_settings_v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), edgeScroll: false, quality: 'medium', bakedArt: true, showFps: false })); } catch { /* ignore */ } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.mouse.move(720, 450);
await page.evaluate(() => {
  const players = [{ name: 'Jogador', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'IA', god: 'poseidon', isAI: true, difficulty: 'easy', team: 1 }];
  window.aoe.startGame({ seed: 42, mapSize: 'small', players, revealMap: false, mode: 'conquest', mapType: 'continental' });
  window.aoe.session.paused = true;
  const h = document.getElementById('hud'); if (h) h.style.visibility = 'hidden';
}, null);
await page.evaluate((ids) => { window.aoe.renderer.art.prewarmUnits(ids); return window.aoe.renderer.art.ready(); }, HEROES);

const scene = await page.evaluate((HEROES) => {
  const s = window.aoe.session, st = s.state, map = st.map, me = s.local, foe = (me + 1) % st.players.length;
  const sp = window.aoe.debugSpawn;
  const tc = [...st.buildings.values()].find((b) => b.owner === me && b.type === 'town_center');
  const open = (x, y) => { if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false; const i = y * map.w + x; return !map.blocked[i] && map.nodeAt[i] === -1 && map.buildingAt[i] === -1 && map.terrain[i] !== 1 && map.terrain[i] !== 2 && map.terrain[i] !== 5; };
  // retângulo aberto de 16 × 12 tiles o mais livre possível num raio de 24 do Centro Cívico, longe da borda do mapa
  let area = null, best = -1;
  for (let y0 = Math.max(4, tc.y - 24); y0 <= Math.min(map.h - 16, tc.y + 12); y0++) for (let x0 = Math.max(4, tc.x - 24); x0 <= Math.min(map.w - 20, tc.x + 8); x0++) {
    let free = 0; for (let y = y0; y < y0 + 12; y++) for (let x = x0; x < x0 + 16; x++) if (open(x, y)) free++;
    const score = free - Math.hypot(x0 + 8 - tc.x, y0 + 6 - tc.y) / 8;
    if (score > best) { best = score; area = { x: x0, y: y0 }; }
  }
  const tough = (u) => { if (u) { u.hp = u.maxHp = 50000; } return u; };
  const ids = (list) => list.filter(Boolean).map((u) => u.id);
  // fila parada (passiva) e fila que anda
  const idle = HEROES.map((t, i) => sp(me, t, area.x + 2 + i * 2, area.y + 1));
  const walk = HEROES.map((t, i) => sp(me, t, area.x + 2 + i * 2, area.y + 4));
  s.issue({ type: 'stance', player: me, ids: ids([...idle, ...walk]), stance: 'passive' });
  // duelos: cada herói contra um hoplita inimigo passivo (vida alta: a luta dura as capturas)
  const duel = [], foes = [];
  HEROES.forEach((t, i) => {
    const x = area.x + 1 + i * 2.5, y = area.y + 8;
    duel.push(tough(sp(me, t, x, y)));
    foes.push(tough(sp(foe, 'hoplite', x, y + (t === 'odysseus' ? 4 : 1.2))));   // Odisseu atira de 4 tiles
  });
  s.scheduler.issue({ type: 'stance', player: foe, ids: ids(foes), stance: 'passive' });
  duel.forEach((u, i) => { if (u && foes[i]) s.issue({ type: 'attack', player: me, ids: [u.id], targetId: foes[i].id }); });
  window.__idle = ids(idle); window.__walk = ids(walk); window.__duel = ids(duel); window.__area = area;
  window.aoe.renderer.revealAll = true;
  return { area, tc: { x: tc.x, y: tc.y }, idle: ids(idle).length, walk: ids(walk).length, duel: ids(duel).length };
}, HEROES);
console.log('cena:', JSON.stringify(scene));
await page.waitForTimeout(300);
await page.evaluate(() => window.aoe.applyQuality());
await page.evaluate((ids) => { window.aoe.renderer.art.prewarmUnits(ids); return window.aoe.renderer.art.ready(); }, HEROES);
// a fila de baixo vai e volta na horizontal (4 tiles) a cada 2,4 s
await page.evaluate(() => {
  let out = true;
  const go = () => {
    const s = window.aoe.session; if (!s) return;
    window.__walk.forEach((id, k) => { const u = s.state.units.get(id); if (u) s.issue({ type: 'move', player: u.owner, ids: [id], x: window.__area.x + 2.5 + k * 2 + (out ? 3 : 0), y: window.__area.y + 4.5 }); });
    out = !out;
  };
  go(); window.__walkTimer = setInterval(go, 2400);
  window.aoe.session.paused = false; window.aoe.session.speed = 1;
});
const look = (p, zoom) => page.evaluate(([x, y, z]) => { const c = window.aoe.renderer.cam; c.zoom = z; c.centerOn(x, y); }, [p.x, p.y, zoom]);
const shot = async (name, wait = 1200) => { await page.waitForTimeout(wait); const f = join(outDir, `${prefix}-${name}.png`); await page.screenshot({ path: f }); console.log('captura:', f); };
const views = () => page.evaluate((HEROES) => {
  const s = window.aoe.session, R = window.aoe.renderer, out = { byType: {}, procedural: {}, dirBad: 0 };
  for (const [id, v] of R.views) {
    const u = s.state.units.get(id);
    if (!u || !HEROES.includes(v.type)) continue;
    if (!v.unit) { out.procedural[v.type] = (out.procedural[v.type] ?? 0) + 1; continue; }
    const bt = out.byType[v.type] ??= {}; bt[v.unit.anim] = (bt[v.unit.anim] ?? 0) + 1;
    const dx = u.x - u.px, dy = u.y - u.py;
    if (dx * dx + dy * dy > 1e-6 && v.unit.anim === 'walk') {
      const d = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8, diff = Math.min((d - v.unit.dir + 8) % 8, (v.unit.dir - d + 8) % 8);
      if (diff > 1) out.dirBad++;
    }
  }
  return out;
}, HEROES);

await page.waitForTimeout(3000);   // os duelos começam e a fila de baixo sai andando
const center = { x: scene.area.x + 8, y: scene.area.y + 5 };
await look(center, 1.0); await shot('z10');
await look({ x: scene.area.x + 8, y: scene.area.y + 3 }, 2.2); await shot('z22');
// arco de Odisseu: disparo (attack) e mira (aim) entre um e outro
const bow = { attack: 0, aim: 0, other: 0 };
const odysseus = await page.evaluate(() => window.__duel[2]);
for (let k = 0; k < 14; k++) {
  const r = await page.evaluate((id) => window.aoe.renderer.views.get(id)?.unit?.anim ?? null, odysseus);
  bow[r === 'attack' || r === 'aim' ? r : 'other']++;
  await page.waitForTimeout(200);
}
console.log('Odisseu (disparo/mira):', JSON.stringify(bow));
if (!bow.aim || !bow.attack) errors.push(`Odisseu sem disparo e mira: ${JSON.stringify(bow)}`);
const v1 = await views();
console.log('vistas:', JSON.stringify(v1));
if (Object.keys(v1.procedural).length) errors.push(`heróis procedurais: ${JSON.stringify(v1.procedural)}`);
for (const t of HEROES) if (!v1.byType[t]) errors.push(`${t}: nenhuma vista assada`);
if (v1.dirBad) errors.push(`direção incoerente em ${v1.dirBad} herói(s) andando`);

// habilidades: os 5 heróis dos duelos usam a Q no mesmo tick; a captura sai no meio da animação (sessão pausada)
await page.evaluate(() => { const s = window.aoe.session; for (const id of window.__duel) { const u = s.state.units.get(id); if (u) s.issue({ type: 'ability', player: u.owner, unitId: id }); } });
await page.waitForTimeout(350);
await page.evaluate(() => { window.aoe.session.paused = true; });
const used = await page.evaluate((HEROES) => {
  const s = window.aoe.session, R = window.aoe.renderer, out = {};
  for (const id of window.__duel) { const u = s.state.units.get(id), v = R.views.get(id); if (u) out[u.type] = { anim: v?.unit?.anim ?? null, ready: u.abilityReadyAt, tick: s.state.tick }; }
  return out;
}, HEROES);
console.log('habilidade:', JSON.stringify(used));
for (const t of HEROES) {
  const want = t === 'basileus' ? null : 'ability';
  if (want && used[t]?.anim !== 'ability') errors.push(`${t}: habilidade usada sem a animação ability (${used[t]?.anim})`);
  if (!want && used[t]?.anim === 'ability') errors.push(`${t}: o rei não tem habilidade`);
}
await look({ x: scene.area.x + 8, y: scene.area.y + 8.5 }, 2.2); await shot('habilidade-z22', 400);
await page.evaluate(() => { window.aoe.session.paused = false; });
// preset alto (atlas 2×)
await page.evaluate(() => { window.aoe.settings.quality = 'high'; window.aoe.applyQuality(); });
await page.evaluate((ids) => { window.aoe.renderer.art.prewarmUnits(ids); return window.aoe.renderer.art.ready(); }, HEROES);
await look({ x: scene.area.x + 8, y: scene.area.y + 3 }, 2.2); await shot('z22-2x', 1600);
const v2 = await views();
if (Object.keys(v2.procedural).length) errors.push(`heróis procedurais no 2×: ${JSON.stringify(v2.procedural)}`);
const status = await page.evaluate(() => ({ ...window.aoe.renderer.art.status(), preset: window.aoe.renderer.quality.preset }));
await page.evaluate(() => clearInterval(window.__walkTimer));
console.log('arte (alto):', JSON.stringify(status));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
if (errors.length) process.exit(1);
