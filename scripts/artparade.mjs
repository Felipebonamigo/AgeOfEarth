// "Desfile" da arte assada (docs/ART.md §5; Etapa 2 parte B, ampliado na integração da Etapa 4): cinco cenas, cada uma
// numa partida nova com semente fixa (42, 1 IA fácil; a cena no mapa pequeno, as outras no médio, numa clareira longe
// do Centro Cívico), o mapa revelado só no renderizador e o HUD oculto.
//  1. cena: ao sul de um bosque perto do Centro Cívico, um templo completo, um templo em obra (≈ 45 %, cidadãos
//     construindo), 8 hoplitas indo e voltando nas 8 direções, 6 contra 6 hoplitas lutando (vida alta), um aglomerado de
//     5 contra 5 em ataque-mover que se mistura, cidadãos cortando o bosque (dos dois jogadores) e carregando madeira.
//  2. roda: as 17 unidades da Etapa 4 (lote 1, distância-cerco, cavalaria, heróis), uma roda por tipo numa grade, cada
//     uma indo e voltando e girando a direção a cada ida — em 4 voltas cada tipo anda nas 8 direções (a cavalaria
//     solta galopa).
//  3. batalha mista: os 18 tipos humanos/montados/cerco (os 17 + hoplita) de cada lado em ataque-mover um contra o outro
//     (vida alta), os heróis usando a habilidade Q no meio da luta e, no fim, um de cada tipo caindo (queda assada).
//  4. desfile: os 19 tipos (os 18 + cidadão) parados em fila virados para a câmera — 14 a pé na frente, cavalaria e cerco
//     atrás — diante de quartel, estábulo, oficina de cerco, templo e academia.
//  5. pick: um hoplita inimigo logo atrás de uma helépole, visto pelo vão da torre (pick pelo alfa das unidades).
// Capturas em <out>/ (padrão docs/art/): <prefixo>-cena-{z10,z22}.png, -roda-z10.png, -batalha-{z10,z22}.png,
// -desfile-{z10,z22}.png (preset médio, atlas 1×), -procedural-z10.png (o desfile com a arte assada desligada: o "antes")
// e -desfile-z22-2x.png (preset alto, atlas 2×).
// Falha se houver erro de página, se a arte assada não for servida, se algum tipo sair procedural, se quem anda olhar
// para fora da velocidade (> 5 % das amostras), se algum tipo da Etapa 4 não andar nas 8 direções, se a cavalaria não
// galopar, se > 10 % dos quadros de 'attack' (aglomerado de hoplitas e batalha mista) estiverem a 90° ou mais do alvo, se
// algum tipo não atacar na batalha, se os de arco/dardo não atirarem E mirarem, se um herói usar a Q sem a animação
// `ability`, se a queda de algum tipo não sair assada ou se o clique direito num hoplita inimigo visível atrás de uma
// helépole (pelo vão da torre, dentro da caixa dela) não virar ataque ao hoplita (5ª cena, pick pelo alfa das unidades).
// Tudo é medido no TEMPO DE JOGO (tick): as idas e voltas, as amostras (uma por tick, num requestAnimationFrame) e as
// esperas (até a condição valer ou um teto de ticks) — com a máquina carregada o laço do jogo anda mais devagar que o
// relógio, e as esperas em ms cortavam as idas do cerco e a batalha antes do fim.
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
/** A pé, na ordem da fila do desfile (cidadão, infantaria, à distância, rei e heróis). */
const FOOT = ['villager', 'militia', 'hoplite', 'hypaspist', 'myrmidon', 'peltast', 'toxotes', 'cretan_archer', 'basileus', 'jason', 'odysseus', 'heracles', 'achilles', 'perseus'];
/** Montados e cerco (a fila de trás do desfile). */
const BIG = ['petrobolos', 'kataskopos', 'hippeus', 'hetairoi', 'helepolis'];
/** Os 17 tipos da Etapa 4 (tudo menos cidadão e hoplita, da Etapa 2). */
const NEW = [...FOOT, ...BIG].filter((t) => t !== 'villager' && t !== 'hoplite');
/** Os 18 da batalha mista (os 17 + hoplita). */
const ARMY = [...NEW, 'hoplite'];
const RANGED = ['toxotes', 'peltast', 'cretan_archer', 'odysseus'];
const CAVALRY = ['kataskopos', 'hippeus', 'hetairoi'];
const HEROES_Q = ['jason', 'odysseus', 'heracles', 'achilles', 'perseus'];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { try { const k = 'aoe_settings_v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), edgeScroll: false, quality: 'medium', bakedArt: true, showFps: false })); } catch { /* ignore */ } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.mouse.move(720, 450);

const look = (p, zoom) => page.evaluate(([x, y, z]) => { const c = window.aoe.renderer.cam; c.zoom = z; c.centerOn(x, y); }, [p.x, p.y, zoom]);
const shot = async (name, wait = 1400) => { await page.waitForTimeout(wait); const f = join(outDir, `${prefix}-${name}.png`); await page.screenshot({ path: f }); console.log('captura:', f); };
const diff8 = (a, b) => Math.min((a - b + 8) % 8, (b - a + 8) % 8);
const tickNow = () => page.evaluate(() => window.aoe.session.state.tick);
/** Espera `n` ticks de jogo (a partida tem de estar rodando). */
async function waitTicks(n, timeout = 180000) {
  const t = (await tickNow()) + n;
  await page.waitForFunction((t) => window.aoe.session.state.tick >= t, t, { timeout, polling: 100 });
}
/** Espera até `cond` (função do navegador, sem argumentos) valer ou passarem `maxTicks` ticks de jogo. */
async function waitUntil(cond, maxTicks, timeout = 300000) {
  const limit = (await tickNow()) + maxTicks;
  await page.waitForFunction(([src, limit]) => window.aoe.session.state.tick >= limit || (0, eval)(`(${src})`)(), [cond.toString(), limit], { timeout, polling: 200 });
}
/** Para a roda e o amostrador da cena anterior. */
const stopLoops = () => page.evaluate(() => { window.__walkStop = true; window.__sampleStop = true; });
/** Partida nova (pausada, HUD oculto) com as páginas dos tipos pedidas e já na GPU. */
async function newGame(types, mapSize = 'small') {
  await stopLoops();
  await page.evaluate(([seed, mapSize]) => {
    const players = [{ name: 'Jogador', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'Leônidas (IA)', god: 'poseidon', isAI: true, difficulty: 'easy', team: 1 }];
    window.aoe.startGame({ seed, mapSize, players, revealMap: false, mode: 'conquest', mapType: 'continental' });
    window.aoe.session.paused = true;
    const h = document.getElementById('hud'); if (h) h.style.visibility = 'hidden';
  }, [SEED, mapSize]);
  await page.evaluate(() => window.aoe.renderer.art.ready());
  // funções de apoio da cena (no navegador): tile livre e a área retangular mais livre do mapa — longe do Centro Cívico
  // (os cidadãos e o batedor do começo não entram na cena) e com o centro a meia tela da borda (a captura a zoom 1,
  // 45 × 28 tiles, não mostra fora do mapa)
  await page.evaluate(() => {
    const s = window.aoe.session, map = s.state.map;
    window.__open = (x, y) => { if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false; const i = y * map.w + x; return !map.blocked[i] && map.nodeAt[i] === -1 && map.buildingAt[i] === -1 && map.terrain[i] !== 1 && map.terrain[i] !== 2 && map.terrain[i] !== 5; };
    window.__area = (w, h, { minTc = 14, mx = 23, my = 15 } = {}) => {
      const tcs = [...s.state.buildings.values()].filter((b) => b.type === 'town_center');
      const tc = tcs.find((b) => b.owner === s.local);
      let area = null, best = -Infinity;
      for (let y0 = 3; y0 + h <= map.h - 3; y0++) for (let x0 = 3; x0 + w <= map.w - 3; x0++) {
        const cx = x0 + w / 2, cy = y0 + h / 2, d = Math.sqrt((cx - tc.x) ** 2 + (cy - tc.y) ** 2);
        if (cx < mx || cx > map.w - mx || cy < my || cy > map.h - my) continue;
        if (tcs.some((b) => Math.sqrt((cx - b.x) ** 2 + (cy - b.y) ** 2) < minTc + Math.max(w, h) / 2)) continue;
        let free = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (window.__open(x, y)) free++;
        const score = 4 * free - d / 8;   // o mais livre possível; entre os livres, o mais perto do Centro Cívico
        if (score > best) { best = score; area = { x: x0, y: y0, free, of: w * h }; }
      }
      return area;
    };
    window.__ids = (list) => list.filter(Boolean).map((u) => u.id);
    window.__tough = (u, hp = 5000) => { if (u) { u.hp = u.maxHp = hp; } return u; };
  });
  if (types?.length) await page.evaluate((t) => { window.aoe.renderer.art.prewarmUnits(t); return window.aoe.renderer.art.ready(); }, types);
}
/** Depois de montar a cena: reaplica o preset (o automático mede o começo de cada partida) e espera as páginas. */
async function settle(types) {
  await page.waitForTimeout(300);
  await page.evaluate(() => window.aoe.applyQuality());
  await page.evaluate((t) => { window.aoe.renderer.art.prewarmUnits(t); return window.aoe.renderer.art.ready(); }, types);
}
/** Vistas procedurais (sem arte) de unidades vivas destes tipos. */
const procedural = (types) => page.evaluate((types) => {
  const out = {}; for (const [id, v] of window.aoe.renderer.views) if (window.aoe.session.state.units.get(id) && types.includes(v.type) && !v.unit) out[v.type] = (out[v.type] ?? 0) + 1;
  return out;
}, types);

// ------------------------------------------------------------------------------------------------------------------
// 1. cena: bosque, templos, cidadãos, desfile e lutas de hoplitas
await newGame([]);
const scene = await page.evaluate(() => {
  const s = window.aoe.session, st = s.state, map = st.map, me = s.local, foe = (me + 1) % st.players.length;
  const sp = window.aoe.debugSpawn, open = window.__open, ids = window.__ids, tough = window.__tough;
  const tc = [...st.buildings.values()].find((b) => b.owner === me && b.type === 'town_center');
  const trees = [...map.nodes.values()].filter((n) => n.type === 'tree');
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
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
  const a = spot(E.x - 9, E.y + 1), templeDone = a ? window.aoe.debugBuild(me, 'temple', a.x, a.y, 1) : null;
  const b = spot(E.x + 5, E.y + 1), templeWip = b ? window.aoe.debugBuild(me, 'temple', b.x, b.y, 0.45) : null;
  // luta: 6 × 6 frente a frente (vida alta para durar)
  const F = { x: E.x, y: E.y + 7 };
  const mine = [], theirs = [];
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
  window.__rodas = [{ c: W, ids: ids(walkers), r: 4, fixed: true }];
  window.aoe.renderer.revealAll = true;
  return { tc: { x: tc.x, y: tc.y }, tree: { x: tree.x, y: tree.y }, edge: E, fight: F, walk: W, templeDone: templeDone?.id ?? null, templeWip: templeWip?.id ?? null, foeVillagers: foeCut.length, units: st.units.size };
});
console.log('cena:', JSON.stringify(scene));
await settle(['hoplite', 'villager']);
/**
 * Rodas: a cada `legTicks` ticks de JOGO cada unidade alterna entre o centro da sua roda e `r` tiles numa direção. Com
 * `fixed` a direção é a do índice (k · 45°); senão gira uma casa a cada volta (k + volta), e em 4 voltas cada uma anda
 * nas 8 direções. Conferido a cada quadro (requestAnimationFrame): a ida dura o mesmo tempo de jogo com a máquina lenta.
 */
async function startWalking(legTicks) {
  await page.evaluate((legTicks) => {
    let n = 0, next = -1;
    const go = () => {
      const s = window.aoe.session; if (!s) return;
      const out = n % 2 === 0, lap = Math.floor(n / 2);
      for (const R of window.__rodas) R.ids.forEach((id, k) => {
        const u = s.state.units.get(id); if (!u) return;
        const a = ((R.fixed ? k : k + lap) % 8) * Math.PI / 4, r = out ? R.r : 0;
        s.issue({ type: 'move', player: u.owner, ids: [id], x: R.c.x + 0.5 + Math.cos(a) * r, y: R.c.y + 0.5 + Math.sin(a) * r });
      });
      n++;
    };
    window.__walkStop = false;
    const loop = () => {
      const s = window.aoe.session; if (!s || window.__walkStop) return;
      if (next < 0 || s.state.tick >= next) { go(); next = s.state.tick + legTicks; }
      requestAnimationFrame(loop);
    };
    loop();
    window.aoe.session.paused = false; window.aoe.session.speed = 1;
  }, legTicks);
}
/**
 * Amostrador no navegador (uma amostra por tick de jogo, conferido a cada quadro): por tipo, as animações vistas, as
 * direções da vista em que andou coerente com a velocidade, quem anda olhando para fora dela (±1 octante de folga, a
 * histerese) e golpes × alvo.
 */
async function startSampler(types) {
  await page.evaluate((types) => {
    const st = window.__stats = { byType: {}, dirs: {}, dirOk: 0, dirBad: 0, hitOk: 0, hitOff: 0, hitSamples: [], procedural: {}, n: 0 };
    const oct = (dx, dy) => ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    const diff = (a, b) => Math.min((a - b + 8) % 8, (b - a + 8) % 8);
    let last = -1;
    window.__sampleStop = false;
    const sample = () => {
      const s = window.aoe.session, R = window.aoe.renderer; if (!s || window.__sampleStop) return;
      requestAnimationFrame(sample);
      if (s.state.tick === last) return;
      last = s.state.tick;
      st.n++;
      for (const [id, v] of R.views) {
        const u = s.state.units.get(id);
        if (!u || !types.includes(v.type)) continue;
        if (!v.unit) { st.procedural[v.type] = (st.procedural[v.type] ?? 0) + 1; continue; }
        const bt = st.byType[v.type] ??= {}; bt[v.unit.anim] = (bt[v.unit.anim] ?? 0) + 1;
        const dx = u.x - u.px, dy = u.y - u.py, a = v.unit.anim;
        if (dx * dx + dy * dy > 1e-6 && (a === 'walk' || a === 'run' || a === 'carry')) {
          const d = oct(dx, dy);
          // direções (quadros das 8) em que a vista andou coerente com a velocidade (±1 octante, a histerese)
          if (diff(d, v.unit.dir) <= 1) { st.dirOk++; const ds = st.dirs[v.type] ??= []; if (!ds.includes(v.unit.dir)) ds.push(v.unit.dir); } else st.dirBad++;
        }
        const t = a === 'attack' ? s.state.units.get(u.targetId) : null;
        if (t) {
          if (diff(oct(t.x - u.x, t.y - u.y), v.unit.dir) >= 2) { st.hitOff++; if (st.hitSamples.length < 6) st.hitSamples.push({ type: v.type, dir: v.unit.dir, to: oct(t.x - u.x, t.y - u.y) }); } else st.hitOk++;
        }
      }
    };
    sample();
  }, types);
}
const stopSampler = () => page.evaluate(() => { window.__sampleStop = true; return window.__stats; });
const checkDirs = (st, label) => {
  const n = st.dirOk + st.dirBad;
  if (st.dirBad > 0.05 * n) errors.push(`${label}: direção incoerente em ${st.dirBad} de ${n} amostras andando`);
};
const checkHits = (st, label) => {
  const n = st.hitOk + st.hitOff;
  if (n === 0) errors.push(`${label}: nenhum quadro de 'attack' com alvo`);
  else if (st.hitOff > 0.1 * n) errors.push(`${label}: ${st.hitOff} de ${n} quadros de 'attack' a 90° ou mais do alvo (${JSON.stringify(st.hitSamples)})`);
};

await startWalking(52);   // idas de 2,6 s de jogo
await startSampler(['hoplite', 'villager']);
await waitTicks(70);   // os cidadãos chegam às árvores, a luta começa, o desfile sai da roda
const mid = { x: scene.edge.x - 3, y: scene.edge.y + 5 };
await look(mid, 1.0); await shot('cena-z10');
await waitTicks(30);
await look(mid, 2.2); await shot('cena-z22');
// cortar, construir e golpear: até ver as três (ou 10 s de jogo a mais)
await waitUntil(() => { const b = Object.values(window.__stats.byType); return ['walk', 'gather', 'attack'].every((a) => b.some((m) => m[a])); }, 200);
const st1 = await stopSampler();
console.log('cena — vistas:', JSON.stringify({ byType: st1.byType, dirOk: st1.dirOk, dirBad: st1.dirBad, hitOk: st1.hitOk, hitOff: st1.hitOff, procedural: st1.procedural }));
checkDirs(st1, 'cena');
checkHits(st1, 'cena (luta e aglomerado de hoplitas)');
for (const a of ['walk', 'gather', 'attack']) if (!Object.values(st1.byType).some((m) => m[a])) errors.push(`cena: nenhuma unidade em '${a}'`);
if (Object.keys(st1.procedural).length) errors.push(`cena procedural: ${JSON.stringify(st1.procedural)}`);
const statusMedium = await page.evaluate(() => ({ ...window.aoe.renderer.art.status(), preset: window.aoe.renderer.quality.preset }));

// ------------------------------------------------------------------------------------------------------------------
// 2. roda: os 17 tipos da Etapa 4 nas 8 direções
await newGame(NEW, 'medium');
const roda = await page.evaluate((NEW) => {
  const s = window.aoe.session, me = s.local, sp = window.aoe.debugSpawn, ids = window.__ids;
  // uma roda por tipo, cada uma numa célula de 5 × 5 tiles toda livre (ninguém cruza o caminho de outro no centro nem
  // tropeça numa árvore): a janela de 40 × 25 tiles do mapa (longe dos Centros Cívicos, sem mostrar fora do mapa) com
  // mais células livres, e nela as mais centrais
  const map = s.state.map, tcs = [...s.state.buildings.values()].filter((b) => b.type === 'town_center');
  const freeCell = (cx, cy) => { for (let y = Math.floor(cy - 2.5); y < cy + 2.5; y++) for (let x = Math.floor(cx - 2.5); x < cx + 2.5; x++) if (!window.__open(x, y)) return false; return true; };
  let area = null, cells = [];
  for (let y0 = 3; y0 + 25 <= map.h - 3; y0 += 5) for (let x0 = 3; x0 + 40 <= map.w - 3; x0 += 5) {
    const cx = x0 + 20, cy = y0 + 12.5;
    if (cx < 23 || cx > map.w - 23 || cy < 15 || cy > map.h - 15 || tcs.some((b) => Math.sqrt((cx - b.x) ** 2 + (cy - b.y) ** 2) < 30)) continue;
    const got = [];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 8; i++) { const c = { x: x0 + 2.5 + i * 5, y: y0 + 2.5 + j * 5 }; if (freeCell(c.x, c.y)) got.push({ c, d: (c.x - cx) ** 2 + (c.y - cy) ** 2 }); }
    if (got.length > cells.length) { cells = got; area = { x: x0, y: y0 }; }
  }
  cells.sort((p, q) => p.d - q.d);
  while (cells.length < NEW.length) cells.push(cells[cells.length - 1]);   // mapa sem espaço: repete (e a conferência acusa)
  window.__rodas = NEW.map((t, i) => {
    const c = cells[i].c;
    const u = sp(me, t, c.x, c.y);
    if (u) { s.issue({ type: 'stance', player: me, ids: [u.id], stance: 'passive' }); u.x = u.px = u.tx = c.x; u.y = u.py = u.ty = c.y; }
    return { c: { x: c.x - 0.5, y: c.y - 0.5 }, ids: ids([u]), r: 2, fixed: false };
  });
  window.aoe.renderer.revealAll = true;
  const used = cells.slice(0, NEW.length);
  return { area, walkers: window.__rodas.reduce((n, R) => n + R.ids.length, 0), freeCells: new Set(used.map((c) => `${c.c.x},${c.c.y}`)).size,
    center: { x: used.reduce((v, c) => v + c.c.x, 0) / used.length, y: used.reduce((v, c) => v + c.c.y, 0) / used.length } };
}, NEW);
console.log('roda:', JSON.stringify(roda));
await page.evaluate(([t, c]) => { window.__rodaTypes = t; window.__rodaCav = c; }, [NEW, CAVALRY]);
await settle(NEW);
await startSampler(NEW);
await startWalking(60);   // idas/voltas de 3 s de jogo: o cerco (1,2–1,4 tile/s) chega à ponta; a cavalaria galopa e espera
await look(roda.center, 1.0);
await waitTicks(166);   // na 2ª ida: todos longe do centro da roda
await shot('roda-z10', 0);
// até cada tipo andar nas 8 direções e a cavalaria galopar (4 voltas = 8 idas; teto de 12 idas)
await waitUntil(() => {
  const st = window.__stats, types = window.__rodaTypes, cav = window.__rodaCav;
  return types.every((t) => (st.dirs[t] ?? []).length >= 8) && cav.every((t) => st.byType[t]?.run);
}, 12 * 60 - 166);
const st2 = await stopSampler();
await page.evaluate(() => { window.__walkStop = true; });
console.log('roda — direções por tipo:', JSON.stringify(Object.fromEntries(Object.entries(st2.dirs).map(([t, d]) => [t, d.length]))));
console.log('roda — animações:', JSON.stringify(st2.byType), `dirOk=${st2.dirOk} dirBad=${st2.dirBad}`);
checkDirs(st2, 'roda');
if (Object.keys(st2.procedural).length) errors.push(`roda procedural: ${JSON.stringify(st2.procedural)}`);
for (const t of NEW) {
  const d = st2.dirs[t] ?? [];
  if (d.length < 8) errors.push(`${t}: andou em ${d.length} das 8 direções (${d.sort().join(',')})`);
}
for (const t of CAVALRY) if (!st2.byType[t]?.run) errors.push(`${t}: nenhuma amostra galopando (run)`);

// ------------------------------------------------------------------------------------------------------------------
// 3. batalha mista: 18 tipos contra 18 tipos, heróis usando a Q e uma queda de cada tipo
await newGame(ARMY, 'medium');
const battle = await page.evaluate((ARMY) => {
  const s = window.aoe.session, me = s.local, foe = (me + 1) % s.state.players.length, sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
  const area = window.__area(26, 12);
  const cx = area.x + 13, cy = area.y + 6;
  // corpo a corpo na frente, à distância atrás, cerco no fundo; os dois exércitos espelhados em torno de cx
  const rank = (t) => (['petrobolos', 'helepolis'].includes(t) ? 3 : ['toxotes', 'peltast', 'cretan_archer', 'odysseus'].includes(t) ? 2 : 0);
  const side = (owner, sign) => {
    const out = [], n = [0, 0, 0, 0];
    for (const t of ARMY) {
      const r = rank(t), k = n[r]++;
      // o cerco nas pontas da linha (atrás dos arqueiros ele não alcançava a luta)
      if (r === 3) out.push(tough(sp(owner, t, cx + sign * 4.8, cy + (k ? 5 : -5))));
      else out.push(tough(sp(owner, t, cx + sign * (3 + r * 1.5 + (k % 2) * 0.8), cy - 4 + (k * 1.15) % 9)));
    }
    return out;
  };
  const A = side(me, -1), B = side(foe, 1);
  s.issue({ type: 'attackMove', player: me, ids: ids(A), x: cx + 6, y: cy });
  s.scheduler.issue({ type: 'attackMove', player: foe, ids: ids(B), x: cx - 6, y: cy });
  window.__armyA = ids(A); window.__armyB = ids(B); window.__bc = { x: cx, y: cy };
  window.aoe.renderer.revealAll = true;
  return { area, center: { x: cx, y: cy }, a: ids(A).length, b: ids(B).length };
}, ARMY);
console.log('batalha:', JSON.stringify(battle));
await settle(ARMY);
await page.evaluate(() => { window.aoe.session.paused = false; window.aoe.session.speed = 1; });
await waitTicks(40);   // os exércitos se encontram
// o cerco mira a unidade inimiga mais próxima (no ataque-mover ele fica atrás do corpo a corpo, fora do alcance)
await page.evaluate(() => {
  const s = window.aoe.session, st = s.state;
  for (const [mine, theirs] of [[window.__armyA, window.__armyB], [window.__armyB, window.__armyA]]) for (const id of mine) {
    const u = st.units.get(id); if (!u || !['petrobolos', 'helepolis'].includes(u.type)) continue;
    let best = null, bd = Infinity;
    for (const tid of theirs) { const t = st.units.get(tid); if (!t) continue; const d = (t.x - u.x) ** 2 + (t.y - u.y) ** 2; if (d < bd) { bd = d; best = t; } }
    if (!best) continue;
    const c = { type: 'attack', player: u.owner, ids: [u.id], targetId: best.id };
    if (u.owner === s.local) s.issue(c); else s.scheduler.issue(c);
  }
});
await waitTicks(30);   // e se misturam
await startSampler(ARMY);
await waitTicks(50);
await look(battle.center, 1.0); await shot('batalha-z10', 300);
await waitTicks(40);
await look({ x: battle.center.x, y: battle.center.y }, 2.2); await shot('batalha-z22', 300);
// até todo tipo atacar e os de arco/dardo mirarem (teto: 15 s de jogo)
await page.evaluate(([a, r]) => { window.__army = a; window.__ranged = r; }, [ARMY, RANGED]);
await waitUntil(() => { const b = window.__stats.byType; return window.__army.every((t) => b[t]?.attack) && window.__ranged.every((t) => b[t]?.aim); }, 300);
const st3 = await stopSampler();
console.log('batalha — animações:', JSON.stringify(st3.byType), `golpes ok=${st3.hitOk} fora=${st3.hitOff}`);
checkHits(st3, 'batalha mista');
if (Object.keys(st3.procedural).length) errors.push(`batalha procedural: ${JSON.stringify(st3.procedural)}`);
for (const t of ARMY) if (!st3.byType[t]?.attack) errors.push(`${t}: nenhuma amostra atacando na batalha (${JSON.stringify(st3.byType[t] ?? {})})`);
for (const t of RANGED) if (!st3.byType[t]?.aim) errors.push(`${t}: nenhuma amostra mirando na batalha (${JSON.stringify(st3.byType[t] ?? {})})`);
// habilidade Q: os heróis dos dois lados usam a habilidade no mesmo tick; a vista toca `ability` (o rei não tem)
await page.evaluate(() => {
  const s = window.aoe.session;
  for (const id of [...window.__armyA, ...window.__armyB]) { const u = s.state.units.get(id); if (!u) continue; const c = { type: 'ability', player: u.owner, unitId: id }; if (u.owner === s.local) s.issue(c); else s.scheduler.issue(c); }
});
/** Conta, a cada quadro por `ticks` ticks de jogo, as vistas destes tipos que satisfazem `pick` (no navegador). */
const watchFrames = (types, ticks, src) => page.evaluate(([types, ticks, src]) => new Promise((done) => {
  const s = window.aoe.session, R = window.aoe.renderer, end = s.state.tick + ticks, out = {}, f = (0, eval)(`(${src})`);
  const step = () => {
    for (const [t, a] of f(R, types)) out[t] = (out[t] ?? 0) + 1;
    if (s.state.tick >= end || window.__watchAll?.(out)) done(out); else requestAnimationFrame(step);
  };
  step();
}), [types, ticks, src]);
// a habilidade dura 0,8 s de jogo (16 ticks): as vistas amostradas a cada quadro por 24 ticks
const used = await watchFrames([...HEROES_Q, 'basileus'], 24, ((R, H) => { const out = []; for (const [, v] of R.views) if (v.unit && H.includes(v.type) && v.unit.anim === 'ability') out.push([v.type]); return out; }).toString());
console.log('habilidade Q (amostras em ability):', JSON.stringify(used));
for (const t of HEROES_Q) if (!used[t]) errors.push(`${t}: usou a Q sem a animação 'ability'`);
if (used.basileus) errors.push('basileus: o rei não tem habilidade e tocou ability');
// quedas: um de cada tipo do jogador fica com vida 1 e vira o alvo de uma unidade inimiga (o arqueiro e o cerco da
// retaguarda não estariam sob ataque) — a morte sai assada ('die') na faixa do pé
await page.evaluate(() => {
  const s = window.aoe.session, seen = new Set();
  const hunters = window.__armyB.map((id) => s.state.units.get(id)).filter((u) => u && !['petrobolos', 'helepolis'].includes(u.type));
  let h = 0;
  for (const id of window.__armyA) {
    const u = s.state.units.get(id); if (!u || seen.has(u.type)) continue;
    seen.add(u.type); u.hp = 1;
    const by = hunters[h++ % hunters.length];
    if (by) s.scheduler.issue({ type: 'attack', player: by.owner, ids: [by.id], targetId: u.id });
  }
});
// cada queda (efeito de 1,2 s) é vista a cada quadro até aparecer a de todos os tipos (teto: 12 s de jogo)
await page.evaluate((A) => { window.__watchAll = (o) => A.every((t) => o[t]); }, ARMY);
const falls = await watchFrames(ARMY, 240, ((R) => { const out = []; for (const uv of R.dying.values()) if (uv.anim === 'die') out.push([uv.type]); return out; }).toString());
await page.evaluate(() => { window.__watchAll = null; });
console.log('quedas assadas:', JSON.stringify(falls));
for (const t of ARMY) if (!falls[t]) errors.push(`${t}: a morte não saiu assada`);

// ------------------------------------------------------------------------------------------------------------------
// 4. desfile: os 19 tipos em fila diante dos edifícios militares
await newGame([...FOOT, ...BIG], 'medium');
const parade = await page.evaluate(([FOOT, BIG]) => {
  const s = window.aoe.session, st = s.state, me = s.local, sp = window.aoe.debugSpawn, ids = window.__ids;
  // área 24 × 12 com as duas filas (linhas 5–11) toda livre e o fundo (edifícios) o mais livre possível
  const map = st.map, tcs = [...st.buildings.values()].filter((b) => b.type === 'town_center'), tc0 = tcs.find((b) => b.owner === me);
  let area = null, best = -Infinity;
  for (let y0 = 3; y0 + 12 <= map.h - 3; y0++) for (let x0 = 3; x0 + 24 <= map.w - 3; x0++) {
    const cx = x0 + 12, cy = y0 + 6;
    if (cx < 23 || cx > map.w - 23 || cy < 15 || cy > map.h - 15 || tcs.some((b) => Math.sqrt((cx - b.x) ** 2 + (cy - b.y) ** 2) < 24)) continue;   // longe das flechas dos Centros Cívicos
    let rows = true; for (let y = y0 + 5; y < y0 + 12 && rows; y++) for (let x = x0 + 1; x < x0 + 23; x++) if (!window.__open(x, y)) { rows = false; break; }
    if (!rows) continue;
    let free = 0; for (let y = y0; y < y0 + 5; y++) for (let x = x0; x < x0 + 24; x++) if (window.__open(x, y)) free++;
    const score = 4 * free - Math.sqrt((cx - tc0.x) ** 2 + (cy - tc0.y) ** 2) / 8;
    if (score > best) { best = score; area = { x: x0, y: y0, free, of: 120 }; }
  }
  area ??= window.__area(24, 12, { minTc: 10 });
  // o jogador na Idade Heroica; edifícios prontos ao fundo, cada um no primeiro lugar livre perto do previsto
  st.players[me].age = Math.max(st.players[me].age, 2);
  const built = [];
  ['barracks', 'stable', 'siege_workshop', 'temple', 'academy'].forEach((t, i) => {
    const x0 = area.x + 1 + Math.floor(i * 4.5), y0 = area.y + 1;
    const offs = [];
    for (let dy = -2; dy <= 1; dy++) for (let dx = -3; dx <= 3; dx++) offs.push([dx, dy]);
    offs.sort((p, q) => Math.abs(p[0]) + 2 * Math.abs(p[1]) - Math.abs(q[0]) - 2 * Math.abs(q[1]));
    for (const [dx, dy] of offs) { const b = window.aoe.debugBuild(me, t, x0 + dx, y0 + dy, 1); if (b) { built.push(t); break; } }
  });
  // posição exata (fora da grade dos tiles), sem a barra de vida do começo da partida (a de quem "acabou de levar dano")
  const place = (u, x, y) => { if (!u) return u; u.x = u.px = u.tx = x; u.y = u.py = u.ty = y; u.lastDamageTick = -1e9; return u; };
  const cx = area.x + 12;
  const back = BIG.map((t, i) => place(sp(me, t, cx, area.y + 6), cx + (i - (BIG.length - 1) / 2) * 2.6, area.y + 6.8));
  const front = FOOT.map((t, i) => place(sp(me, t, cx, area.y + 9), cx + (i - (FOOT.length - 1) / 2) * 1.35, area.y + 9.8));
  s.issue({ type: 'stance', player: me, ids: ids([...back, ...front]), stance: 'passive' });
  window.aoe.renderer.revealAll = true;
  return { area, built, back: ids(back).length, front: ids(front).length, cx };
}, [FOOT, BIG]);
console.log('desfile:', JSON.stringify(parade));
await settle([...FOOT, ...BIG]);
await page.evaluate(() => { window.aoe.session.paused = false; window.aoe.session.speed = 1; });
await waitTicks(12);
await page.evaluate(() => { window.aoe.session.paused = true; });   // parados: congela o relógio das animações
const lineup = { x: parade.cx, y: parade.area.y + 6 };
await look(lineup, 1.0); await shot('desfile-z10');
await look({ x: parade.cx, y: parade.area.y + 6.6 }, 2.2); await shot('desfile-z22');
const proc4 = await procedural([...FOOT, ...BIG]);
if (Object.keys(proc4).length) errors.push(`desfile procedural: ${JSON.stringify(proc4)}`);
if (parade.built.length < 5) errors.push(`desfile: só ${parade.built.length} dos 5 edifícios couberam (${parade.built.join(',')})`);
// a mesma fila com a arte assada desligada (visual procedural: o "antes")
await page.evaluate(() => { window.aoe.settings.bakedArt = false; window.aoe.applyQuality(); });
await look(lineup, 1.0); await shot('procedural-z10');
// de volta à arte assada, preset alto (atlas 2×)
await page.evaluate(() => { window.aoe.settings.bakedArt = true; window.aoe.settings.quality = 'high'; window.aoe.applyQuality(); });
await page.evaluate((t) => { window.aoe.renderer.art.prewarmUnits(t); return window.aoe.renderer.art.ready(); }, [...FOOT, ...BIG]);
await look({ x: parade.cx, y: parade.area.y + 6.6 }, 2.2); await shot('desfile-z22-2x', 2000);
const proc4b = await procedural([...FOOT, ...BIG]);
if (Object.keys(proc4b).length) errors.push(`desfile procedural no 2×: ${JSON.stringify(proc4b)}`);
const statusHigh = await page.evaluate(() => ({ ...window.aoe.renderer.art.status(), preset: window.aoe.renderer.quality.preset }));

// ------------------------------------------------------------------------------------------------------------------
// 5. pick pelo alfa das unidades (revisão da Etapa 4): um hoplita inimigo logo atrás (norte) de uma helépole minha, visto
// pelo vão da torre — dentro da caixa do quadro dela, mas num pixel transparente dela. O pick nesses pontos tem de dar o
// hoplita, e o clique direito de verdade (mouse do Playwright) com o meu hoplita selecionado tem de virar ataque a ele.
await page.evaluate(() => { window.aoe.settings.quality = 'medium'; window.aoe.applyQuality(); });
await newGame(['helepolis', 'hoplite'], 'medium');
const pk = await page.evaluate(() => {
  const s = window.aoe.session, st = s.state, me = s.local, foe = (me + 1) % st.players.length, sp = window.aoe.debugSpawn;
  const a = window.__area(10, 8);
  const C = { x: a.x + 5.5, y: a.y + 4.5 };
  const put = (u, x, y) => { u.x = u.px = u.tx = x; u.y = u.py = u.ty = y; u.lastDamageTick = -1e9; return u; };
  const hel = put(sp(me, 'helepolis', C.x, C.y), C.x, C.y);
  const enemy = put(sp(foe, 'hoplite', C.x - 0.75, C.y - 0.45), C.x - 0.75, C.y - 0.45);
  const mine = put(sp(me, 'hoplite', C.x - 3, C.y + 2.5), C.x - 3, C.y + 2.5);
  s.issue({ type: 'stance', player: me, ids: [hel.id, mine.id], stance: 'passive' });
  s.scheduler.issue({ type: 'stance', player: foe, ids: [enemy.id], stance: 'passive' });
  window.aoe.renderer.revealAll = true;
  return { C, hel: hel.id, enemy: enemy.id, mine: mine.id };
});
await settle(['helepolis', 'hoplite']);
await page.evaluate(() => { window.aoe.session.paused = false; });
await waitTicks(4);
await page.evaluate(() => { window.aoe.session.paused = true; });
await look(pk.C, 2.0);
await page.waitForTimeout(600);
const probe = await page.evaluate(({ hel, enemy }) => {
  const R = window.aoe.renderer, s = window.aoe.session;
  const vh = R.views.get(hel)?.unit, ve = R.views.get(enemy)?.unit;
  if (!vh || !ve) return { error: `vista procedural (helépole ${!!vh}, hoplita ${!!ve})` };
  const pts = [];
  for (let y = Math.ceil(ve.by0); y <= ve.by1; y++) for (let x = Math.ceil(ve.bx0); x <= ve.bx1; x++) {
    if (!ve.contains(x, y)) continue;                                               // pixel opaco do hoplita
    if (!(x >= vh.bx0 && x <= vh.bx1 && y >= vh.by0 && y <= vh.by1) || vh.contains(x, y)) continue;   // na caixa da helépole, transparente
    pts.push({ x, y });
  }
  let ok = 0; const wrong = {};
  for (const p of pts) { const e = R.pick(s.state, p.x / 32, p.y / 32, s.local); if (e?.id === enemy) ok++; else wrong[e?.type ?? 'nada'] = (wrong[e?.type ?? 'nada'] ?? 0) + 1; }
  const mid = pts.sort((a, b) => a.y - b.y || a.x - b.x)[Math.floor(pts.length / 2)] ?? null;
  const scr = mid ? R.cam.worldToScreen(mid.x / 32, mid.y / 32) : null;
  return { n: pts.length, ok, wrong, click: scr };
}, pk);
console.log('pick (hoplita atrás da helépole):', JSON.stringify(probe));
if (probe.error) errors.push(`pick: ${probe.error}`);
else if (probe.n < 10) errors.push(`pick: só ${probe.n} pixels do hoplita visíveis na caixa da helépole (cena mal montada)`);
else if (probe.ok < probe.n) errors.push(`pick: ${probe.n - probe.ok} de ${probe.n} pixels do hoplita visível atrás da helépole deram outra coisa (${JSON.stringify(probe.wrong)})`);
if (probe.click) {
  await page.evaluate((id) => {
    const s = window.aoe.session; s.select([id]); window.__issued = [];
    const orig = s.issue.bind(s); s.issue = (c) => { window.__issued.push(c); return orig(c); };
  }, pk.mine);
  await page.mouse.move(probe.click.x, probe.click.y);
  await page.waitForTimeout(200);
  await page.mouse.click(probe.click.x, probe.click.y, { button: 'right' });
  await page.waitForTimeout(200);
  const issued = await page.evaluate(() => window.__issued);
  console.log('clique direito:', JSON.stringify(issued));
  if (!issued.some((c) => c.type === 'attack' && c.targetId === pk.enemy)) errors.push(`clique direito no hoplita atrás da helépole não virou ataque: ${JSON.stringify(issued)}`);
}
console.log('arte (médio):', JSON.stringify(statusMedium));
console.log('arte (alto):', JSON.stringify(statusHigh));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
const bakedOk = /servida:1/.test(statusMedium.units) && /servida:1/.test(statusMedium.buildings) && /servida:1/.test(statusMedium.props) && /servida:2/.test(statusHigh.units);
if (!bakedOk) console.error('arte assada não foi servida como esperado');
if (errors.length || !bakedOk) process.exit(1);
