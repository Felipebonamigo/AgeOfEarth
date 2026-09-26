// "Desfile" da arte assada (docs/ART.md §5, Etapa 2 parte B): partida com semente fixa (42, mapa pequeno, 1 IA) e, numa
// área aberta ao sul de um bosque perto do Centro Cívico, um templo completo, um templo em obra (≈ 45 %, cidadãos
// construindo), 8 hoplitas indo e voltando nas 8 direções (roda do desfile, postura passiva), 6 contra 6 hoplitas lutando
// (vida alta para a luta durar as capturas), um aglomerado de 5 contra 5 em ataque-mover que se mistura, cidadãos cortando
// o bosque (dos dois jogadores) e carregando madeira. Etapa 4 (lote 1): mais ao sul, uma segunda roda com milícias,
// hipaspistas, mirmidões e toxotas indo e voltando nas 8 direções, toxotas atirando (mira entre um disparo e outro) e
// mirmidões contra hipaspistas inimigos; captura própria <prefixo>-lote1-{z10,z22}.png.
// O mapa é revelado só no renderizador e o HUD fica oculto.
// Capturas em docs/art/: <prefixo>-desfile-z10.png e -desfile-z22.png (preset médio, atlas 1×), -desfile-z22-2x.png
// (preset alto, atlas 2×) e <prefixo>-procedural-z10.png (a mesma cena com a arte assada desligada, para comparar).
// Imprime o estado da ArtLibrary e falha se houver erro de página, se a arte assada não for servida, se quem anda olhar
// para fora da velocidade, se mais de 10 % dos quadros de 'attack' (amostrados na luta e no aglomerado, onde o empurrão
// da separação mexe em todos) estiverem a 90° ou mais do alvo, se algum tipo do lote 1 sair procedural ou se nenhum
// toxota aparecer atirando e mirando.
// Exige `npm run preview` (ou a URL passada). Uso: node scripts/artparade.mjs [url] [--out docs/art] [--prefix etapa2b]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const url = pos[0] ?? 'http://localhost:4173/';
const outDir = opt('--out', 'docs/art');
const prefix = opt('--prefix', 'etapa2b');
mkdirSync(outDir, { recursive: true });
const SEED = 42;

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

// Cena: bosque com área aberta ao sul, perto do CC do jogador
const scene = await page.evaluate(() => {
  const s = window.aoe.session, st = s.state, map = st.map, me = s.local, foe = (me + 1) % st.players.length;
  const sp = window.aoe.debugSpawn;
  const tc = [...st.buildings.values()].find((b) => b.owner === me && b.type === 'town_center');
  const trees = [...map.nodes.values()].filter((n) => n.type === 'tree');
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const open = (x, y) => { if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false; const i = y * map.w + x; return !map.blocked[i] && map.nodeAt[i] === -1 && map.buildingAt[i] === -1 && map.terrain[i] !== 1 && map.terrain[i] !== 2 && map.terrain[i] !== 5; };
  // árvore de borda de bosque (≥ 5 vizinhas no raio 3) com o retângulo 21 × 10 ao sul o mais livre possível
  let tree = null, best = -Infinity;
  for (const t of trees) {
    const d = d2(t, tc); if (d > 32 * 32) continue;
    if (t.x < 16 || t.x > map.w - 20 || t.y < 6 || t.y > map.h - 18) continue;   // longe da borda (câmera sem faixa escura)
    if (trees.filter((o) => d2(o, t) <= 9).length < 5) continue;
    let freeN = 0; for (let y = t.y + 2; y < t.y + 12; y++) for (let x = t.x - 10; x <= t.x + 10; x++) if (open(x, y)) freeN++;
    const score = freeN / 210 - Math.sqrt(d) / 200;
    if (score > best) { best = score; tree = t; }
  }
  tree = tree ?? trees.sort((a, b) => d2(a, tc) - d2(b, tc))[0];
  const E = { x: tree.x, y: tree.y + 2 };
  const free3 = (tx, ty) => { for (let y = ty - 1; y < ty + 4; y++) for (let x = tx - 1; x < tx + 4; x++) if (!open(x, y)) return false; return true; };
  const spot = (x0, y0) => { for (let r = 0; r < 10; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; if (free3(x0 + dx, y0 + dy)) return { x: x0 + dx, y: y0 + dy }; } return null; };
  const ids = (list) => list.filter(Boolean).map((u) => u.id);
  const a = spot(E.x - 9, E.y + 1), templeDone = a ? window.aoe.debugBuild(me, 'temple', a.x, a.y, 1) : null;
  const b = spot(E.x + 5, E.y + 1), templeWip = b ? window.aoe.debugBuild(me, 'temple', b.x, b.y, 0.45) : null;
  // luta: 6 × 6 frente a frente (vida alta para durar)
  const F = { x: E.x, y: E.y + 7 };
  const mine = [], theirs = [];
  const tough = (u) => { if (u) { u.hp = u.maxHp = 5000; } return u; };
  for (let i = 0; i < 6; i++) { mine.push(tough(sp(me, 'hoplite', F.x - 1.5, F.y - 2 + i * 0.8))); theirs.push(tough(sp(foe, 'hoplite', F.x + 1.5, F.y - 2 + i * 0.8))); }
  mine.forEach((u, i) => { if (u && theirs[i]) s.issue({ type: 'attack', player: me, ids: [u.id], targetId: theirs[i].id }); });
  theirs.forEach((u, i) => { if (u && mine[i]) s.scheduler.issue({ type: 'attack', player: foe, ids: [u.id], targetId: mine[i].id }); });
  // aglomerado: 5 × 5 em ataque-mover um contra o outro (os exércitos se misturam e se empurram)
  const K = spot(E.x + 6, E.y + 7) ?? { x: F.x + 5, y: F.y };
  const ka = [], kb = [];
  for (let i = 0; i < 5; i++) { ka.push(tough(sp(me, 'hoplite', K.x - 1, K.y + 1))); kb.push(tough(sp(foe, 'hoplite', K.x + 3, K.y + 1))); }
  s.issue({ type: 'attackMove', player: me, ids: ids(ka), x: K.x + 4, y: K.y + 1 });
  s.scheduler.issue({ type: 'attackMove', player: foe, ids: ids(kb), x: K.x - 2, y: K.y + 1 });
  // roda do desfile: 8 hoplitas do jogador, passivos, cada um vai e volta numa das 8 direções
  const W = { x: E.x - 9, y: E.y + 8 };
  const walkers = [];
  for (let k = 0; k < 8; k++) walkers.push(sp(me, 'hoplite', W.x, W.y));
  s.issue({ type: 'stance', player: me, ids: ids(walkers), stance: 'passive' });
  // cidadãos: 4 cortando a borda do bosque, 3 construindo o templo em obra, 2 carregando madeira até o CC
  const edge = trees.filter((t) => d2(t, tree) <= 12).sort((p, q) => q.y - p.y).slice(0, 4);
  const cut = [];
  for (let i = 0; i < 4; i++) cut.push(sp(me, 'villager', E.x - 1 + i, E.y + 1));
  cut.forEach((u, i) => u && edge.length && s.issue({ type: 'gather', player: me, ids: [u.id], targetId: edge[i % edge.length].id }));
  const builders = [];
  for (let i = 0; i < 3; i++) builders.push(sp(me, 'villager', (b?.x ?? E.x) + i, (b?.y ?? E.y) + 4));
  if (templeWip) s.issue({ type: 'repair', player: me, ids: ids(builders), targetId: templeWip.id });
  const carriers = [];
  for (let i = 0; i < 2; i++) { const u = sp(me, 'villager', E.x + 2 + i, E.y + 3); if (u) { u.carry = 'wood'; u.carryAmt = 10; carriers.push(u); } }
  if (carriers.length) s.issue({ type: 'move', player: me, ids: ids(carriers), x: tc.x - 9, y: tc.y + 4 });
  // cidadãos do outro jogador cortando o mesmo bosque mais a leste (longe das tropas)
  const far = trees.filter((t) => { const d = Math.sqrt(d2(t, E)); return d >= 9 && d <= 16 && t.y <= E.y; }).sort((p, q) => d2(p, E) - d2(q, E)).slice(0, 3);
  const foeCut = [];
  for (let i = 0; i < far.length; i++) { const u = sp(foe, 'villager', far[i].x, far[i].y + 1); if (u) { foeCut.push(u); s.scheduler.issue({ type: 'gather', player: foe, ids: [u.id], targetId: far[i].id }); } }
  // Etapa 4 (lote 1): segunda roda com os tipos novos, toxotas atirando e mirmidões × hipaspistas inimigos
  const LOT = ['militia', 'hypaspist', 'myrmidon', 'toxotes'];
  // área aberta de 22 × 11 tiles ao sul da cena (a mais livre num raio de 16): roda à esquerda, tiro e luta à direita
  let area = null, bestFree = -1;
  for (let y0 = E.y + 8; y0 <= E.y + 24; y0++) for (let x0 = E.x - 18; x0 <= E.x + 8; x0++) {
    if (x0 < 2 || y0 < 2 || x0 + 22 >= map.w - 2 || y0 + 11 >= map.h - 2) continue;
    let free = 0; for (let y = y0; y < y0 + 11; y++) for (let x = x0; x < x0 + 22; x++) if (open(x, y)) free++;
    if (free > bestFree) { bestFree = free; area = { x: x0, y: y0 }; }
  }
  area ??= { x: W.x - 2, y: W.y + 5 };
  const W2 = { x: area.x + 5, y: area.y + 5 };
  const walkers2 = [];
  for (let k = 0; k < 8; k++) walkers2.push(sp(me, LOT[k % 4], W2.x, W2.y));
  s.issue({ type: 'stance', player: me, ids: ids(walkers2), stance: 'passive' });
  const R = { x: area.x + 15, y: area.y + 3 };
  const archers = [], targets = [], myr = [], hyp = [];
  for (let i = 0; i < 3; i++) {
    archers.push(tough(sp(me, 'toxotes', R.x - 3, R.y - 1 + i)));
    targets.push(tough(sp(foe, 'militia', R.x + 2, R.y - 1 + i)));
    myr.push(tough(sp(me, 'myrmidon', R.x - 1, R.y + 3 + i * 0.8)));
    hyp.push(tough(sp(foe, 'hypaspist', R.x + 1, R.y + 3 + i * 0.8)));
  }
  s.scheduler.issue({ type: 'stance', player: foe, ids: ids(targets), stance: 'passive' });
  archers.forEach((u, i) => { if (u && targets[i]) s.issue({ type: 'attack', player: me, ids: [u.id], targetId: targets[i].id }); });
  myr.forEach((u, i) => { if (u && hyp[i]) s.issue({ type: 'attack', player: me, ids: [u.id], targetId: hyp[i].id }); });
  hyp.forEach((u, i) => { if (u && myr[i]) s.scheduler.issue({ type: 'attack', player: foe, ids: [u.id], targetId: myr[i].id }); });
  window.__walkers = ids(walkers); window.__wc = W;
  window.__walkers2 = ids(walkers2); window.__wc2 = W2; window.__lot = LOT;
  window.aoe.renderer.revealAll = true;
  return { tc: { x: tc.x, y: tc.y }, tree: { x: tree.x, y: tree.y }, edge: E, fight: F, walk: W, walk2: W2, ranged: R, lotArea: area, templeDone: templeDone?.id ?? null, templeWip: templeWip?.id ?? null, foeVillagers: foeCut.length, units: st.units.size };
});
console.log('cena:', JSON.stringify(scene));
// o preset automático mede o começo de cada partida mesmo com preset fixo: reaplica o preset escolhido (médio)
await page.waitForTimeout(300);
await page.evaluate(() => window.aoe.applyQuality());
// carregamento por tipo: hipaspista e mirmidão (de Idades seguintes) não estavam quentes; chegam na primeira vista —
// aqui só se pede junto e se espera (as páginas sobem para a GPU uma por quadro)
await page.evaluate(() => { window.aoe.renderer.art.prewarmUnits(window.__lot); return window.aoe.renderer.art.ready(); });
// vai e volta: a cada 2,6 s cada hoplita do desfile alterna entre o centro da roda e 4 tiles na sua direção
await page.evaluate(() => {
  let out = true;
  const go = () => {
    const s = window.aoe.session; if (!s) return;
    for (const [list, c] of [[window.__walkers, window.__wc], [window.__walkers2, window.__wc2]]) list.forEach((id, k) => {
      const u = s.state.units.get(id); if (!u) return;
      const a = (k * Math.PI) / 4, r = out ? 4 : 0;
      s.issue({ type: 'move', player: u.owner, ids: [id], x: c.x + 0.5 + Math.cos(a) * r, y: c.y + 0.5 + Math.sin(a) * r });
    });
    out = !out;
  };
  go(); window.__walkTimer = setInterval(go, 2600);
  window.aoe.session.paused = false; window.aoe.session.speed = 1;
});

const look = (p, zoom) => page.evaluate(([x, y, z]) => { const c = window.aoe.renderer.cam; c.zoom = z; c.centerOn(x, y); }, [p.x, p.y, zoom]);
const shot = async (name) => { await page.waitForTimeout(1400); const f = join(outDir, `${prefix}-${name}.png`); await page.screenshot({ path: f }); console.log('captura:', f); };
await page.waitForTimeout(3500);   // os cidadãos chegam às árvores, a luta começa, o desfile sai da roda
const mid = { x: scene.edge.x - 3, y: scene.edge.y + 5 };
await look(mid, 1.0); await shot('desfile-z10');
// conferência das vistas assadas: animações em uso e direção de quem anda coerente com a velocidade (±1 octante, histerese)
const checks = await page.evaluate(() => {
  const s = window.aoe.session, R = window.aoe.renderer, out = { baked: 0, anims: {}, dirOk: 0, dirBad: 0, byType: {}, procedural: {} };
  for (const [id, v] of R.views) {
    if (s.state.units.get(id) && !v.unit && window.__lot.includes(v.type)) out.procedural[v.type] = (out.procedural[v.type] ?? 0) + 1;
    if (!v.unit) continue;
    out.baked++; out.anims[v.unit.anim] = (out.anims[v.unit.anim] ?? 0) + 1;
    const bt = out.byType[v.type] ??= {}; bt[v.unit.anim] = (bt[v.unit.anim] ?? 0) + 1;
    const u = s.state.units.get(id); if (!u) continue;
    const dx = u.x - u.px, dy = u.y - u.py;
    if (dx * dx + dy * dy > 1e-6 && (v.unit.anim === 'walk' || v.unit.anim === 'carry')) {
      const d = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8, diff = Math.min((d - v.unit.dir + 8) % 8, (v.unit.dir - d + 8) % 8);
      if (diff <= 1) out.dirOk++; else out.dirBad++;
    }
  }
  return out;
});
console.log('vistas assadas:', JSON.stringify(checks));
if (checks.dirBad > 0) errors.push(`direção incoerente em ${checks.dirBad} unidade(s) andando`);
for (const a of ['walk', 'gather']) if (!checks.anims[a]) errors.push(`nenhuma unidade em '${a}'`);
for (const t of ['militia', 'hypaspist', 'myrmidon', 'toxotes']) if (!checks.byType[t]) errors.push(`${t}: nenhuma vista assada`);
if (Object.keys(checks.procedural).length) errors.push(`lote 1 procedural: ${JSON.stringify(checks.procedural)}`);
// golpes virados para o alvo: amostra os quadros de 'attack' (luta em linha e aglomerado) por alguns segundos
const facing = { ok: 0, off: 0, samples: [] };
for (let k = 0; k < 12; k++) {
  const r = await page.evaluate(() => {
    const s = window.aoe.session, R = window.aoe.renderer, out = [];
    for (const [id, v] of R.views) {
      if (!v.unit || v.unit.anim !== 'attack') continue;
      const u = s.state.units.get(id), t = u && s.state.units.get(u.targetId); if (!t) continue;
      const d = ((Math.round(Math.atan2(t.y - u.y, t.x - u.x) / (Math.PI / 4)) % 8) + 8) % 8;
      out.push({ id, dir: v.unit.dir, toTarget: d, diff: Math.min((d - v.unit.dir + 8) % 8, (v.unit.dir - d + 8) % 8) });
    }
    return out;
  });
  for (const f of r) { if (f.diff >= 2) { facing.off++; if (facing.samples.length < 5) facing.samples.push(f); } else facing.ok++; }
  await page.waitForTimeout(250);
}
console.log('golpes × direção do alvo:', JSON.stringify(facing));
// toxotas: atirando (attack, a corda solta no tick do disparo) e mirando entre um disparo e outro (aim)
const archery = { attack: 0, aim: 0, other: 0 };
for (let k = 0; k < 12; k++) {
  const r = await page.evaluate(() => { const out = []; for (const [, v] of window.aoe.renderer.views) if (v.unit && v.type === 'toxotes') out.push(v.unit.anim); return out; });
  for (const a of r) archery[a === 'attack' || a === 'aim' ? a : 'other']++;
  await page.waitForTimeout(200);
}
console.log('toxotas (disparo/mira):', JSON.stringify(archery));
if (!archery.aim || !archery.attack) errors.push(`toxotas sem disparo e mira: ${JSON.stringify(archery)}`);
await look({ x: scene.lotArea.x + 11, y: scene.lotArea.y + 5 }, 1.0); await shot('lote1-z10');
await look({ x: scene.ranged.x - 1.5, y: scene.ranged.y + 2 }, 2.2); await shot('lote1-z22');
if (facing.ok + facing.off === 0) errors.push("nenhuma unidade em 'attack'");
else if (facing.off > 0.1 * (facing.ok + facing.off)) errors.push(`${facing.off} de ${facing.ok + facing.off} quadros de 'attack' a 90° ou mais do alvo`);
await look(mid, 2.2); await shot('desfile-z22');
const status1 = await page.evaluate(() => ({ ...window.aoe.renderer.art.status(), preset: window.aoe.renderer.quality.preset }));
// a mesma cena com a arte assada desligada (visual procedural)
await page.evaluate(() => { window.aoe.settings.bakedArt = false; window.aoe.applyQuality(); });
await look(mid, 1.0); await shot('procedural-z10');
// de volta à arte assada, preset alto (atlas 2×)
await page.evaluate(() => { window.aoe.settings.bakedArt = true; window.aoe.settings.quality = 'high'; window.aoe.applyQuality(); });
await page.evaluate(() => window.aoe.renderer.art.ready());
await look(mid, 2.2); await shot('desfile-z22-2x');
const status2 = await page.evaluate(() => ({ ...window.aoe.renderer.art.status(), preset: window.aoe.renderer.quality.preset }));
await page.evaluate(() => clearInterval(window.__walkTimer));
console.log('arte (médio):', JSON.stringify(status1));
console.log('arte (alto):', JSON.stringify(status2));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
const bakedOk = /servida:1/.test(status1.units) && /servida:1/.test(status1.buildings) && /servida:1/.test(status1.props) && /servida:2/.test(status2.units);
if (!bakedOk) console.error('arte assada não foi servida como esperado');
if (errors.length || !bakedOk) process.exit(1);
