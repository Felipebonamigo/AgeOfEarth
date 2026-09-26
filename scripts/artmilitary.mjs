// Captura do lote "militar" da arte assada (docs/ART.md Etapa 3, Apêndice D): partida com semente fixa (42, mapa
// pequeno, 1 IA fácil) e, na área aberta mais livre perto do Centro Cívico, os 8 edifícios do lote prontos — quartel,
// estábulo, oficina de cerco, fortaleza, portal dos titãs, Estátua de Zeus, Templo de Ártemis e Colosso —, mais obras
// (quartel/estábulo/oficina nos três estágios), dano (fortaleza e quartel) e os escombros de um estábulo derrubado
// (debugDestroy). O jogador vai à Idade dos Titãs (todos no menu de construção).
// Capturas: <out>/<prefix>-cidade.png (zoom 1,0), <prefix>-z13.png, <prefix>-portal-a.png e -portal-b.png (o vórtice do
// portal em dois instantes do loop, zoom 2,2), <prefix>-fantasma.png (fantasma assado da fortaleza), <prefix>-hud.png
// (ícones assados no menu de construção) e <prefix>-procedural.png (arte assada desligada).
// Falha se houver erro de página, se algum dos 8 tipos não sair assado, se faltar obra/dano/escombros, se a sobreposição
// do portal não estiver visível ou não trocar de quadro com o relógio de jogo, se o fantasma não usar o sprite assado ou
// se o menu de construção não mostrar os ícones assados do lote.
// Exige `npm run preview` (ou a URL passada). Uso: node scripts/artmilitary.mjs [url] [--out docs/art] [--prefix etapa3-militar]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const url = pos[0] ?? 'http://localhost:4173/';
const outDir = opt('--out', 'docs/art');
const prefix = opt('--prefix', 'etapa3-militar');
mkdirSync(outDir, { recursive: true });
const LOT = ['barracks', 'stable', 'siege_workshop', 'fortress', 'titan_gate', 'wonder_zeus', 'wonder_artemis', 'wonder_colossus'];

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

const scene = await page.evaluate((LOT) => {
  const s = window.aoe.session, st = s.state, map = st.map, me = s.local;
  const W = 27, H = 18;
  const tc = [...st.buildings.values()].find((b) => b.owner === me && b.type === 'town_center');
  // retângulo W × H (+ 1 de margem) sem edifícios, com o mínimo de água/montanha e de nós, perto do CC; o que sobrar
  // vira grama livre (cena de teste, fora do lockstep) e o renderizador refaz terreno e props do retângulo
  let best = null, bestScore = -Infinity;
  for (let y0 = 3; y0 + H < map.h - 3; y0++) for (let x0 = 3; x0 + W < map.w - 3; x0++) {
    const d = Math.hypot(x0 + W / 2 - tc.x, y0 + H / 2 - tc.y); if (d > 60) continue;
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
  if (!best) throw new Error('sem área livre para a cena');
  const { x0, y0 } = best;
  for (let y = y0 - 1; y <= y0 + H; y++) for (let x = x0 - 1; x <= x0 + W; x++) {
    const i = y * map.w + x, id = map.nodeAt[i], t = map.terrain[i];
    if (id !== -1) { map.nodes.delete(id); map.nodeAt[i] = -1; map.blocked[i] = 0; }
    if (t === 1 || t === 2 || t === 5) { map.terrain[i] = 0; map.blocked[i] = 0; }
  }
  window.aoe.renderer.invalidateRect(x0 - 1, y0 - 1, x0 + W, y0 + H);
  st.players[me].age = 4;
  st.players[me].titanSpawned = true;                          // o portal pronto não liberta o titã (cena parada)
  const B = (type, tx, ty, frac = 1) => window.aoe.debugBuild(me, type, x0 + tx, y0 + ty, frac);
  const made = {};
  const put = (b, tag) => { if (b) made[tag] = b.id; return b; };
  // fila de cima: os cinco militares prontos; fila do meio: as maravilhas e as obras; fila de baixo: dano e escombros
  put(B('barracks', 1, 1), 'barracks'); put(B('stable', 5, 1), 'stable'); put(B('siege_workshop', 9, 1), 'siege_workshop');
  put(B('fortress', 13, 1), 'fortress'); put(B('titan_gate', 19, 1), 'titan_gate');
  put(B('wonder_zeus', 1, 7), 'wonder_zeus'); put(B('wonder_artemis', 6, 7), 'wonder_artemis'); put(B('wonder_colossus', 11, 7), 'wonder_colossus');
  put(B('barracks', 16, 8, 0.2), 'barracks-wip0'); put(B('stable', 20, 8, 0.5), 'stable-wip1'); put(B('siege_workshop', 24, 8, 0.85), 'siege-wip2');
  const fd = put(B('fortress', 1, 13), 'fortress-dmg1'); const bd = put(B('barracks', 6, 14), 'barracks-dmg2');
  if (fd) fd.hp = fd.maxHp * 0.55; if (bd) bd.hp = bd.maxHp * 0.25;
  const doomed = B('stable', 10, 14); if (doomed) window.aoe.debugDestroy(doomed.id);
  // tropas para a escala: hoplitas diante do quartel, cidadãos junto do portal
  const sp = window.aoe.debugSpawn;
  for (let i = 0; i < 4; i++) sp(me, 'hoplite', x0 + 1.5 + i * 0.7, y0 + 4.6);
  for (let i = 0; i < 3; i++) sp(me, 'villager', x0 + 20 + i, y0 + 6.5);
  window.aoe.renderer.revealAll = true;
  return { x0, y0, W, H, made, missing: LOT.filter((t) => !made[t]) };
}, LOT);
console.log('cena:', JSON.stringify(scene));
if (scene.missing.length) errors.push(`não coube: ${scene.missing.join(', ')}`);
await page.waitForTimeout(300);
await page.evaluate(() => window.aoe.applyQuality());
await page.evaluate(() => { window.aoe.session.paused = false; window.aoe.session.speed = 1; });
await page.waitForTimeout(2600);
await page.evaluate(() => { window.aoe.session.paused = true; });

const look = (p, zoom) => page.evaluate(([x, y, z]) => { const c = window.aoe.renderer.cam; c.zoom = z; c.centerOn(x, y); }, [p.x, p.y, zoom]);
const shot = async (name) => { await page.waitForTimeout(900); const f = join(outDir, `${prefix}-${name}.png`); await page.screenshot({ path: f }); console.log('captura:', f); };
const center = { x: scene.x0 + scene.W / 2, y: scene.y0 + scene.H / 2 + 0.3 };
await look(center, 1.0); await shot('cidade');

const checks = await page.evaluate((LOT) => {
  const s = window.aoe.session, R = window.aoe.renderer, out = { baked: {}, procedural: [], states: {}, rubble: R.rubbleViews.length, smoke: R.smoke.count };
  for (const [id, v] of R.views) {
    const b = s.state.buildings.get(id); if (!b || !LOT.includes(b.type)) continue;
    if (!v.bld) { out.procedural.push(b.type); continue; }
    out.baked[b.type] = (out.baked[b.type] ?? 0) + 1;
    out.states[`${b.type}:${v.bld.state}`] = (out.states[`${b.type}:${v.bld.state}`] ?? 0) + 1;
  }
  return out;
}, LOT);
console.log('conferência:', JSON.stringify(checks));
for (const t of LOT) if (!checks.baked[t]) errors.push(`${t} não saiu assado`);
if (checks.procedural.length) errors.push(`procedurais: ${checks.procedural.join(', ')}`);
for (const k of ['barracks:build0', 'stable:build1', 'siege_workshop:build2', 'fortress:damage1', 'barracks:damage2', 'titan_gate:complete', 'wonder_colossus:complete']) if (!checks.states[k]) errors.push(`nenhum ${k}`);
if (checks.rubble < 1) errors.push('sem escombros do estábulo derrubado');
if (checks.smoke < 1) errors.push('sem fumaça nos danificados');

await look(center, 1.3); await shot('z13');

// portal dos titãs: a sobreposição aditiva existe, está visível e troca de quadro com o relógio de jogo
const tgId = scene.made.titan_gate;
const tgPos = await page.evaluate((id) => { const b = window.aoe.session.state.buildings.get(id); return { x: b.x, y: b.y }; }, tgId);
await look(tgPos, 2.2);
const glowOf = () => page.evaluate((id) => { const v = window.aoe.renderer.views.get(id); const g = v?.bld?.glowSprite; return g ? { visible: g.visible, blend: g.blendMode, tex: g.texture?.label ?? String(g.texture?.uid) } : null; }, tgId);
await shot('portal-a');
const g1 = await glowOf();
await page.evaluate(() => { window.aoe.session.paused = false; });
await page.waitForTimeout(330);
await page.evaluate(() => { window.aoe.session.paused = true; });
await shot('portal-b');
const g2 = await glowOf();
console.log('brilho do portal:', JSON.stringify([g1, g2]));
if (!g1?.visible || g1.blend !== 'add') errors.push('sobreposição do portal ausente ou sem blend aditivo');
if (g1 && g2 && g1.tex === g2.tex) errors.push('o brilho do portal não trocou de quadro com o tempo de jogo');

// fantasma de construção assado da fortaleza, ao sul da cena
const gpos = { x: scene.x0 + 16, y: scene.y0 + 14 };
await look({ x: gpos.x + 2, y: gpos.y + 1 }, 1.6);
const gscreen = await page.evaluate((g) => {
  const s = window.aoe.session, cam = window.aoe.renderer.cam;
  s.ui.mode = 'place'; s.ui.placeType = 'fortress'; s.ui.wallStart = null;
  return { x: ((g.x + 2) * 32 - cam.x) * cam.zoom, y: ((g.y + 2) * 32 - cam.y) * cam.zoom };
}, gpos);
await page.mouse.move(gscreen.x, gscreen.y);
await page.waitForTimeout(500);
const ghostN = await page.evaluate(() => window.aoe.renderer.ghostSprites.filter((g) => g.visible).length);
console.log('fantasma: sprites assados', ghostN);
if (ghostN < 1) errors.push('fantasma da fortaleza sem sprite assado');
await shot('fantasma');
await page.evaluate(() => { const s = window.aoe.session; s.ui.mode = 'normal'; s.ui.placeType = null; });
await page.mouse.move(5, 5);

// ícones assados no menu de construção (Idade dos Titãs: todo o lote aparece)
await look(center, 1.0);
await page.evaluate(() => { const h = document.getElementById('hud'); if (h) h.style.visibility = 'visible'; });
await page.evaluate(() => {
  const s = window.aoe.session, me = s.local;
  const v = [...s.state.units.values()].find((u) => u.owner === me && u.type === 'villager');
  s.select([v.id]);
});
await page.waitForTimeout(700);
const icons = await page.evaluate((LOT) => {
  const alt = new Set([...document.querySelectorAll('.cmd img.art-ic')].map((i) => i.alt));
  return { n: document.querySelectorAll('.cmd img.art-ic').length, alt: [...alt] };
}, LOT);
console.log('ícones assados no menu de construção:', JSON.stringify(icons));
// o lote (8) + o lote 1 (6) assados; o alt é o emoji do tipo (sem arte, o botão mostra o emoji e não tem <img>)
if (icons.n < 14) errors.push(`só ${icons.n} ícones assados no menu de construção`);
for (const e of ['⚔️', '🐴', '🪨', '🏰', '🌋', '🗽', '🗿']) if (!icons.alt.includes(e)) errors.push(`sem ícone assado para ${e}`);
await shot('hud');
await page.evaluate(() => { const h = document.getElementById('hud'); if (h) h.style.visibility = 'hidden'; window.aoe.session.select([]); });

// a mesma cena procedural (interruptor "Arte assada" desligado)
await page.evaluate(() => { window.aoe.settings.bakedArt = false; window.aoe.applyQuality(); });
await look(center, 1.0); await shot('procedural');
const proc = await page.evaluate(() => { let n = 0; for (const v of window.aoe.renderer.views.values()) if (v.bld) n++; return n; });
if (proc !== 0) errors.push(`${proc} vistas assadas com a arte desligada`);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
if (errors.length) process.exit(1);
