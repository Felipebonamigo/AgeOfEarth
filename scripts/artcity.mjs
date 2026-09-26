// Captura de cidade da arte assada (docs/ART.md Etapa 3): partida com semente fixa (42, mapa pequeno, 1 IA fácil) e,
// na área aberta mais livre perto do Centro Cívico, uma cidade montada por debugBuild — muralha fechada com torres nos
// cantos, portão ao sul (aberto: um cidadão aliado passando) e a leste (eixo norte-sul), casas (uma em obra, duas
// danificadas soltando fumaça), templo, um trecho de muralha em obra e outro danificado, e os escombros de uma casa
// derrubada (debugDestroy); a muralha tem tê, cruz, cantos, pontas e um pilar avulso (≥ 9 das 16 variantes). O jogador é posto na Idade Clássica (Centro Cívico na variante a1). Depois, o fantasma de
// construção de uma linha de muralha ligando-se à muralha pronta (verde; vermelho onde bloqueia).
// Capturas: <out>/<prefix>-cidade.png (zoom 1,3), <prefix>-cidade-z22.png, <prefix>-fantasma.png e
// <prefix>-cidade-procedural.png (a mesma cena com a arte assada desligada). Falha se houver erro de página, se os
// edifícios da cena não saírem assados, se a muralha não usar ≥ 9 variantes de bitmask, se o portão não abrir, se não
// houver fumaça nem escombros ou se o fantasma não usar sprites assados.
// Exige `npm run preview` (ou a URL passada). Uso: node scripts/artcity.mjs [url] [--out docs/art] [--prefix etapa3-base]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const url = pos[0] ?? 'http://localhost:4173/';
const outDir = opt('--out', 'docs/art');
const prefix = opt('--prefix', 'etapa3-base');
mkdirSync(outDir, { recursive: true });

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
  const W = 24, H = 17;
  const tc = [...st.buildings.values()].find((b) => b.owner === me && b.type === 'town_center');
  const open = (x, y) => { if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false; const i = y * map.w + x; return !map.blocked[i] && map.nodeAt[i] === -1 && map.buildingAt[i] === -1 && map.terrain[i] !== 1 && map.terrain[i] !== 2 && map.terrain[i] !== 5; };
  // retângulo W × H (+ 1 de margem) sem edifícios, com o mínimo de água/montanha e de nós, a até 45 tiles do CC; o que
  // sobrar vira grama livre (cena de teste, fora do lockstep: nós saem do mapa, água/montanha viram grama) e o
  // renderizador refaz terreno e props do retângulo
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
  if (!best) throw new Error('sem área livre para a cidade');
  const { x0, y0 } = best;
  for (let y = y0 - 1; y <= y0 + H; y++) for (let x = x0 - 1; x <= x0 + W; x++) {
    const i = y * map.w + x, id = map.nodeAt[i], t = map.terrain[i];
    if (id !== -1) { map.nodes.delete(id); map.nodeAt[i] = -1; map.blocked[i] = 0; }
    if (t === 1 || t === 2 || t === 5) { map.terrain[i] = 0; map.blocked[i] = 0; }
  }
  window.aoe.renderer.invalidateRect(x0 - 1, y0 - 1, x0 + W, y0 + H);
  st.players[me].age = 1;                                      // Centro Cívico clássico (a1)
  const B = (type, tx, ty, frac = 1) => window.aoe.debugBuild(me, type, x0 + tx, y0 + ty, frac);
  const made = [];
  const put = (b, tag) => { if (b) made.push({ id: b.id, type: b.type, tag }); return b; };
  // muralha: retângulo (0,0)–(W-1, H-1) com torres nos cantos, portão ao sul (ew) e a leste (ns)
  const gx = Math.floor(W / 2), gy = Math.floor(H / 2);
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) put(B((x === 0 || x === W - 1) ? 'tower' : x === gx && y === H - 1 ? 'gate' : 'wall', x, y), 'ring');
  for (let y = 1; y < H - 1; y++) for (const x of [0, W - 1]) put(B(x === W - 1 && y === gy ? 'gate' : 'wall', x, y), 'ring');
  // trecho norte em obra (três estágios) e danificado
  for (const [k, f] of [[15, 0.15], [16, 0.5], [17, 0.85]]) { const i = map.buildingAt[(y0) * map.w + x0 + k]; const w = st.buildings.get(i); if (w) { w.complete = false; w.progress = f * 6; w.hp = Math.max(1, w.maxHp * f); } }
  for (const [k, f] of [[5, 0.55], [6, 0.25], [7, 0.6]]) { const w = st.buildings.get(map.buildingAt[y0 * map.w + x0 + k]); if (w) w.hp = w.maxHp * f; }
  // cidade
  const tcNew = put(B('town_center', 9, 6), 'tc');
  put(B('temple', 16, 3), 'temple');
  put(B('house', 3, 3), 'house'); const hd1 = put(B('house', 3, 7), 'house-dmg1'); const hd2 = put(B('house', 3, 11), 'house-dmg2');
  put(B('house', 13, 11, 0.5), 'house-wip'); put(B('house', 17, 11), 'house');
  if (hd1) hd1.hp = hd1.maxHp * 0.55; if (hd2) hd2.hp = hd2.maxHp * 0.25;
  // muralha interna em L e uma torre avulsa
  for (let y = 9; y <= 12; y++) put(B('wall', 20, y), 'inner');
  put(B('wall', 21, 9), 'inner'); put(B('tower', 20, 13), 'inner');
  // tê na muralha norte (trecho descendo de x = 12), cruz ligada à muralha sul e um pilar avulso
  for (let y = 1; y <= 3; y++) put(B('wall', 12, y), 'inner');
  for (const [x, y] of [[10, 14], [11, 14], [12, 14], [11, 13], [11, 15]]) put(B('wall', x, y), 'inner');
  put(B('wall', 22, 3), 'inner');
  // casa derrubada: colapso + escombros
  const doomed = B('house', 7, 12); if (doomed) window.aoe.debugDestroy(doomed.id);
  // cidadão aliado no portão sul (abre); cidadãos dentro da cidade
  const sp = window.aoe.debugSpawn;
  sp(me, 'villager', x0 + gx + 0.5, y0 + H + 0.3);
  for (let i = 0; i < 3; i++) sp(me, 'villager', x0 + 14 + i, y0 + 9);
  window.aoe.renderer.revealAll = true;
  return { x0, y0, W, H, made: made.length, tc: tcNew?.id ?? null, gateSouth: { x: x0 + gx, y: y0 + H - 1 }, wallEnd: { x: x0 + W - 1, y: y0 + gy + 3 } };
});
console.log('cena:', JSON.stringify(scene));
await page.waitForTimeout(300);
await page.evaluate(() => window.aoe.applyQuality());
// deixa o jogo correr ~3 s (fumaça sobe, o colapso termina e sobram os escombros, o cidadão chega ao portão)
await page.evaluate(() => { window.aoe.session.paused = false; window.aoe.session.speed = 1; });
await page.waitForTimeout(2600);

const center = { x: scene.x0 + scene.W / 2, y: scene.y0 + scene.H / 2 + 0.5 };
const look = (p, zoom) => page.evaluate(([x, y, z]) => { const c = window.aoe.renderer.cam; c.zoom = z; c.centerOn(x, y); }, [p.x, p.y, zoom]);
const shot = async (name) => { await page.waitForTimeout(900); const f = join(outDir, `${prefix}-${name}.png`); await page.screenshot({ path: f }); console.log('captura:', f); };
await look(center, 1.3); await shot('cidade');

const checks = await page.evaluate(() => {
  const s = window.aoe.session, R = window.aoe.renderer, out = { baked: 0, procedural: 0, wallMasks: [], states: {}, open: 0, smoke: R.smoke.count, rubble: R.rubbleViews.length };
  const masks = new Set();
  for (const [id, v] of R.views) {
    const b = s.state.buildings.get(id); if (!b) continue;
    if (!v.bld) { out.procedural++; continue; }
    out.baked++;
    out.states[`${b.type}:${v.bld.state}`] = (out.states[`${b.type}:${v.bld.state}`] ?? 0) + 1;
    if (b.type === 'wall') masks.add(v.bld.variant);
    if (b.type === 'gate' && v.bld.state === 'open') out.open++;
  }
  out.wallMasks = [...masks].sort();
  return out;
});
console.log('conferência:', JSON.stringify(checks));
if (checks.baked < 30) errors.push(`só ${checks.baked} edifícios assados`);
if (checks.wallMasks.length < 9) errors.push(`muralha com só ${checks.wallMasks.length} variantes de bitmask`);
if (checks.open < 1) errors.push('nenhum portão aberto');
if (checks.smoke < 1) errors.push('sem fumaça nos edifícios danificados');
if (checks.rubble < 1) errors.push('sem escombros da casa derrubada');
for (const k of ['house:damage1', 'house:damage2', 'house:build1', 'wall:damage2', 'town_center:complete', 'temple:complete']) if (!checks.states[k]) errors.push(`nenhum ${k}`);

await look(center, 2.2); await shot('cidade-z22');

// fantasma de construção: linha de muralha dentro da cidade, do meio até a muralha oeste (liga-se a ela: a ponta
// oeste sai como trecho reto emendado, a leste como ponta); o cursor fica no fim da linha
await page.evaluate(() => { window.aoe.session.paused = true; });
const gl = { x0: scene.x0 + 8, x1: scene.x0 + 1, y: scene.y0 + 10 };
await look({ x: scene.x0 + 5, y: gl.y }, 2.0);
const ghost = await page.evaluate((g) => {
  const s = window.aoe.session, cam = window.aoe.renderer.cam;
  s.ui.mode = 'place'; s.ui.placeType = 'wall'; s.ui.wallStart = { x: g.x0, y: g.y };
  // tela = (mundo·TILE − cam.x)·zoom
  return { x: ((g.x1 + 0.5) * 32 - cam.x) * cam.zoom, y: ((g.y + 0.5) * 32 - cam.y) * cam.zoom };
}, gl);
await page.mouse.move(ghost.x, ghost.y);
await page.waitForTimeout(500);
const ghostN = await page.evaluate(() => window.aoe.renderer.ghostSprites.filter((g) => g.visible).length);
console.log('fantasma: sprites assados', ghostN);
if (ghostN < 3) errors.push('fantasma sem sprites assados');
await shot('fantasma');
await page.evaluate(() => { const s = window.aoe.session; s.ui.mode = 'normal'; s.ui.placeType = null; s.ui.wallStart = null; });
await page.mouse.move(5, 5);

// ícones assados no HUD: seleciona um cidadão (menu de construção) e depois a casa danificada (painel de seleção)
await page.evaluate(() => { const h = document.getElementById('hud'); if (h) h.style.visibility = 'visible'; });
const hud = await page.evaluate(() => {
  const s = window.aoe.session, me = s.local;
  const v = [...s.state.units.values()].find((u) => u.owner === me && u.type === 'villager');
  s.select([v.id]);
  return { villager: v.id };
});
await page.waitForTimeout(700);
const icons = await page.evaluate(() => ({ cmd: document.querySelectorAll('#commands img.art-ic, .cmd img.art-ic').length, emoji: [...document.querySelectorAll('.cmd .ic')].filter((e) => !e.querySelector('img')).length }));
console.log('ícones no menu de construção:', JSON.stringify(icons));
if (icons.cmd < 6) errors.push(`só ${icons.cmd} ícones assados no menu de construção`);
await shot('hud-icones');
await page.evaluate(() => { const h = document.getElementById('hud'); if (h) h.style.visibility = 'hidden'; window.aoe.session.select([]); });

// a mesma cena procedural (interruptor "Arte assada" desligado)
await page.evaluate(() => { window.aoe.settings.bakedArt = false; window.aoe.applyQuality(); });
await look(center, 1.3); await shot('cidade-procedural');
const proc = await page.evaluate(() => { let n = 0; for (const v of window.aoe.renderer.views.values()) if (v.bld) n++; return n; });
if (proc !== 0) errors.push(`${proc} vistas assadas com a arte desligada`);
const status = await page.evaluate(() => window.aoe.renderer.art.status());
console.log('arte:', JSON.stringify(status));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
if (errors.length) process.exit(1);
