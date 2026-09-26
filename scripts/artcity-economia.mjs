// Captura do lote "economia" da arte assada (docs/ART.md Etapa 3, Apêndice D): partida com semente fixa (42, mapa
// pequeno, 1 IA fácil) e, na área aberta mais livre perto do Centro Cívico, uma vila montada por debugBuild — fazendas
// nas três plantações (semeada, crescendo, madura; o ciclo vem do tempo desde a colocação, então a cena ajusta o
// builtTick) com cidadãos colhendo, uma em obra e uma danificada; celeiro, serraria, mina e cornucópia prontos, em obra
// e danificados; mercado e academia (3×3) prontos, danificado e em obra; e os escombros de um celeiro derrubado
// (debugDestroy). Depois, o fantasma de construção de uma fazenda e os ícones assados no menu de construção.
// Capturas: <out>/<prefix>-cidade.png (zoom 1,3), <prefix>-z10.png (zoom 1, legibilidade), <prefix>-z22.png (fazendas e
// armazéns de perto), <prefix>-fantasma.png, <prefix>-hud-icones.png e <prefix>-procedural.png (a mesma cena com a
// arte assada desligada: o "antes"). Falha se houver erro de página, se algum edifício do lote não sair assado, se a
// fazenda não mostrar as três plantações, se faltar obra/dano/fumaça/escombros, se o fantasma não usar sprite assado ou
// se o menu de construção não tiver os ícones assados do lote.
// Exige `npm run preview` (ou a URL passada). Uso: node scripts/artcity-economia.mjs [url] [--out docs/art] [--prefix etapa3-economia]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const url = pos[0] ?? 'http://localhost:4173/';
const outDir = opt('--out', 'docs/art');
const prefix = opt('--prefix', 'etapa3-economia');
mkdirSync(outDir, { recursive: true });
const LOT = ['farm', 'granary', 'lumber_camp', 'mine', 'market', 'academy', 'cornucopia'];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { try { const k = 'aoe_settings_v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), edgeScroll: false, quality: 'medium', bakedArt: true, showFps: false })); } catch { /* ignore */ } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.mouse.move(5, 5);
await page.evaluate(() => {
  const players = [{ name: 'Jogador', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'Leônidas (IA)', god: 'poseidon', isAI: true, difficulty: 'easy', team: 1 }];
  window.aoe.startGame({ seed: 42, mapSize: 'small', players, revealMap: false, mode: 'conquest', mapType: 'continental' });
  window.aoe.session.paused = true;
  const h = document.getElementById('hud'); if (h) h.style.visibility = 'hidden';
});
await page.evaluate(() => window.aoe.renderer.art.ready());

const scene = await page.evaluate(() => {
  const s = window.aoe.session, st = s.state, map = st.map, me = s.local;
  const W = 22, H = 14;
  const tc = [...st.buildings.values()].find((b) => b.owner === me && b.type === 'town_center');
  // retângulo W × H (+ 1 de margem) sem edifícios, com o mínimo de água/montanha e de nós, a até 45 tiles do CC; o que
  // sobrar vira grama livre (cena de teste, fora do lockstep) e o renderizador refaz terreno e props do retângulo
  let best = null, bestScore = -Infinity;
  for (let y0 = 3; y0 + H < map.h - 3; y0++) for (let x0 = 3; x0 + W < map.w - 3; x0++) {
    const d = Math.hypot(x0 + W / 2 - tc.x, y0 + H / 2 - tc.y); if (d > 45) continue;
    let n = 0, bad = false;
    for (let y = y0 - 1; y <= y0 + H && !bad; y++) for (let x = x0 - 1; x <= x0 + W; x++) {
      const i = y * map.w + x, t = map.terrain[i];
      if (map.buildingAt[i] !== -1) { bad = true; break; }
      n += t === 1 || t === 2 || t === 5 ? -3 : map.nodeAt[i] === -1 ? 1 : 0.3;
    }
    if (bad) continue;
    const score = n - d * 0.3;
    if (score > bestScore) { bestScore = score; best = { x0, y0 }; }
  }
  if (!best) throw new Error('sem área livre para a vila');
  const { x0, y0 } = best;
  for (let y = y0 - 1; y <= y0 + H; y++) for (let x = x0 - 1; x <= x0 + W; x++) {
    const i = y * map.w + x, id = map.nodeAt[i], t = map.terrain[i];
    if (id !== -1) { map.nodes.delete(id); map.nodeAt[i] = -1; map.blocked[i] = 0; }
    if (t === 1 || t === 2 || t === 5) { map.terrain[i] = 0; map.blocked[i] = 0; }
  }
  window.aoe.renderer.invalidateRect(x0 - 1, y0 - 1, x0 + W, y0 + H);
  st.players[me].age = 2;
  const B = (type, tx, ty, frac = 1) => window.aoe.debugBuild(me, type, x0 + tx, y0 + ty, frac);
  const hp = (b, f) => { if (b) b.hp = b.maxHp * f; return b; };
  // fazendas: o ciclo de plantação conta do builtTick (5 s = semeada, 70 s = crescendo, 120 s = madura)
  const crop = (b, sec) => { if (b) b.builtTick = st.tick - sec * 20; return b; };
  const farms = [crop(B('farm', 0, 0), 5), crop(B('farm', 3, 0), 70), crop(B('farm', 6, 0), 120), crop(B('farm', 9, 0), 120), crop(B('farm', 0, 3), 70)];
  B('farm', 12, 0, 0.5);
  hp(crop(B('farm', 15, 0), 120), 0.25);
  // armazéns (2×2): prontos, em obra e danificados
  B('granary', 3, 3); B('lumber_camp', 6, 3); B('mine', 9, 3); B('cornucopia', 12, 3);
  hp(B('lumber_camp', 15, 3), 0.55); B('mine', 18, 3, 0.8);
  B('granary', 0, 11, 0.15); hp(B('granary', 3, 11), 0.3); B('lumber_camp', 6, 11, 0.5); hp(B('cornucopia', 9, 11), 0.5);
  // 3×3: mercado e academia prontos, mercado danificado, academia em obra
  B('market', 0, 7); B('academy', 4, 7); hp(B('market', 8, 7), 0.3); B('academy', 12, 7, 0.85); hp(B('mine', 16, 7), 0.3);
  // celeiro derrubado: colapso + escombros
  const doomed = B('granary', 18, 0); if (doomed) window.aoe.debugDestroy(doomed.id);
  // cidadãos colhendo nas fazendas prontas
  const sp = window.aoe.debugSpawn;
  for (const f of farms) if (f) { const u = sp(me, 'villager', f.x, f.y + 1.2); if (u) s.issue({ type: 'gather', player: me, ids: [u.id], targetId: f.id }); }
  window.aoe.renderer.revealAll = true;
  return { x0, y0, W, H };
});
console.log('cena:', JSON.stringify(scene));
await page.waitForTimeout(300);
await page.evaluate(() => window.aoe.applyQuality());
// ~3 s de jogo: fumaça sobe, o colapso termina e sobram os escombros, os cidadãos chegam às fazendas
await page.evaluate(() => { window.aoe.session.paused = false; window.aoe.session.speed = 1; });
await page.waitForTimeout(2800);
await page.evaluate(() => { window.aoe.session.paused = true; });

const center = { x: scene.x0 + scene.W / 2, y: scene.y0 + scene.H / 2 + 0.5 };
const look = (p, zoom) => page.evaluate(([x, y, z]) => { const c = window.aoe.renderer.cam; c.zoom = z; c.centerOn(x, y); }, [p.x, p.y, zoom]);
const shot = async (name) => { await page.waitForTimeout(900); const f = join(outDir, `${prefix}-${name}.png`); await page.screenshot({ path: f }); console.log('captura:', f); };
await look(center, 1.3); await shot('cidade');

const checks = await page.evaluate((lot) => {
  const s = window.aoe.session, R = window.aoe.renderer, out = { baked: {}, procedural: [], states: {}, farm: [], smoke: R.smoke.count, rubble: R.rubbleViews.length };
  const crops = new Set();
  for (const [id, v] of R.views) {
    const b = s.state.buildings.get(id); if (!b || !lot.includes(b.type)) continue;
    if (!v.bld) { out.procedural.push(b.type); continue; }
    out.baked[b.type] = (out.baked[b.type] ?? 0) + 1;
    out.states[`${b.type}:${v.bld.state}`] = (out.states[`${b.type}:${v.bld.state}`] ?? 0) + 1;
    if (b.type === 'farm' && b.complete) crops.add(v.bld.variant);
  }
  out.farm = [...crops].sort();
  return out;
}, LOT);
console.log('conferência:', JSON.stringify(checks));
for (const t of LOT) if (!checks.baked[t]) errors.push(`${t} não saiu assado`);
if (checks.procedural.length) errors.push(`procedurais: ${checks.procedural.join(', ')}`);
if (checks.farm.length < 3) errors.push(`fazenda com só ${checks.farm.join('/')} (esperado sown/growing/ripe)`);
for (const k of ['farm:build1', 'farm:damage2', 'granary:build0', 'granary:damage2', 'lumber_camp:damage1', 'lumber_camp:build1', 'mine:build2', 'mine:damage2', 'market:complete', 'market:damage2', 'academy:complete', 'academy:build2', 'cornucopia:complete', 'cornucopia:damage1']) if (!checks.states[k]) errors.push(`nenhum ${k}`);
if (checks.smoke < 1) errors.push('sem fumaça nos edifícios danificados');
if (checks.rubble < 1) errors.push('sem escombros do celeiro derrubado');

await look(center, 1.0); await shot('z10');
await look({ x: scene.x0 + 7, y: scene.y0 + 3 }, 2.2); await shot('z22');

// fantasma de construção de uma fazenda (verde) no canto livre da vila
await look({ x: scene.x0 + 17, y: scene.y0 + 11 }, 2.0);
const g = await page.evaluate((p) => {
  const s = window.aoe.session, cam = window.aoe.renderer.cam;
  s.ui.mode = 'place'; s.ui.placeType = 'farm';
  return { x: ((p.x + 1) * 32 - cam.x) * cam.zoom, y: ((p.y + 1) * 32 - cam.y) * cam.zoom };
}, { x: scene.x0 + 17, y: scene.y0 + 11 });
await page.mouse.move(g.x, g.y);
await page.waitForTimeout(500);
const ghostN = await page.evaluate(() => window.aoe.renderer.ghostSprites.filter((s) => s.visible).length);
console.log('fantasma: sprites assados', ghostN);
if (ghostN < 1) errors.push('fantasma sem sprite assado');
await shot('fantasma');
await page.evaluate(() => { const s = window.aoe.session; s.ui.mode = 'normal'; s.ui.placeType = null; });
await page.mouse.move(5, 5);

// ícones assados no menu de construção (cidadão selecionado)
await page.evaluate(() => { const h = document.getElementById('hud'); if (h) h.style.visibility = 'visible'; });
await look(center, 1.3);
await page.evaluate(() => { const s = window.aoe.session, me = s.local; const v = [...s.state.units.values()].find((u) => u.owner === me && u.type === 'villager'); s.select([v.id]); });
await page.waitForTimeout(700);
const icons = await page.evaluate(() => document.querySelectorAll('#commands img.art-ic, .cmd img.art-ic').length);
console.log('ícones assados no menu de construção:', icons);
if (icons < 11) errors.push(`só ${icons} ícones assados no menu de construção`);
await shot('hud-icones');
await page.evaluate(() => { const h = document.getElementById('hud'); if (h) h.style.visibility = 'hidden'; window.aoe.session.select([]); });

// a mesma cena procedural (interruptor "Arte assada" desligado): o "antes"
await page.evaluate(() => { window.aoe.settings.bakedArt = false; window.aoe.applyQuality(); });
await look(center, 1.3); await shot('procedural');
const proc = await page.evaluate(() => { let n = 0; for (const v of window.aoe.renderer.views.values()) if (v.bld) n++; return n; });
if (proc !== 0) errors.push(`${proc} vistas assadas com a arte desligada`);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
if (errors.length) process.exit(1);
