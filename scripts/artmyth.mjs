// Criaturas assadas no jogo (Etapa 6, docs/ART.md Apêndice G) — o padrão de scripts/artparade.mjs para o lote 1
// (minotauro, Leão de Nemeia, Pégaso) e a hidra por cabeças, cada cena numa partida nova (semente 42, 1 IA fácil, mapa
// médio, numa clareira longe dos Centros Cívicos), o mapa revelado só no renderizador e o HUD oculto:
//  1. roda: uma roda por tipo, cada ida girando a direção — as 4 criaturas nas 8 direções (o leão solto galopa `run`,
//     o Pégaso voa), a direção de quem anda coerente com a velocidade;
//  2. batalha: minotauros, leões e hidras de 3 cabeças contra hoplitas e hetairos (vida alta), o Pégaso sobrevoando — cada
//     criatura ataca (≤ 10 % dos golpes virados para longe do alvo) e, no fim, uma de cada cai com a QUEDA ASSADA (o
//     Pégaso cai do céu);
//  3. hidra: cinco hidras lado a lado com 1–5 cabeças (o renderizador escolhe o asset pela entidade: hydra, hydra_heads2…
//     5) e uma que ganha uma cabeça no meio da cena (a vista troca de asset);
//  4. voo: o Pégaso parado no ar e voando, com a sombra no chão (a vista desenha a sombra mais fraca: translúcida);
//  5. desfile: as criaturas paradas ao lado do hoplita e do hetairo, diante do templo (zoom 1 e 2,2; o 2× no preset alto;
//     e a mesma fila com a arte desligada: o "antes").
//  6. titãs (lote titãs): Prometeu sai do Portal dos Titãs pelo caminho do núcleo (o portal pronto liberta o titã do deus)
//     e Oceano e Cronos nascem com o efeito `titanRise` — a ascensão (`rise`) toca desde o nascimento, uma vez; depois uma
//     roda nas 8 direções, a batalha contra hoplitas (golpe de área virado para o alvo), a queda assada e o desfile ao lado
//     do hoplita (zoom 1 e 2,2, a VRAM de textura antes/depois dos titãs e o "antes" procedural). Os titãs só têm 1×.
// Capturas em <out>/ (padrão docs/art/): <prefixo>-{roda-z10,batalha-z10,batalha-z22,queda-z22,hidra-z22,voo-z22,
// desfile-z10,desfile-z22,desfile-z22-2x,procedural-z10}.png e <prefixo>-titas-{ascensao-z10,ascensao-z22,roda-z10,
// batalha-z10,queda-z10,desfile-z10,desfile-z22,procedural-z10}.png. Falha com erro de página, criatura procedural, tipo que não
// anda nas 8 direções, direção incoerente, leão sem galope, Pégaso sem voo/sombra no chão, criatura sem ataque, golpes
// virados, queda não assada, hidra com o asset errado para as cabeças ou que não troca ao ganhar uma cabeça.
// Tudo medido no TEMPO DE JOGO (tick). Exige `npm run preview` (ou a URL). Uso: node scripts/artmyth.mjs [url] [--out docs/art] [--prefix etapa6]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const url = pos[0] ?? 'http://localhost:4173/';
const outDir = opt('--out', 'docs/art');
const prefix = opt('--prefix', 'etapa6');
mkdirSync(outDir, { recursive: true });
const SEED = 42;
const MYTH = ['minotaur', 'nemean_lion', 'pegasus', 'hydra'];
const FIGHTERS = ['minotaur', 'nemean_lion', 'hydra'];
const HYDRA_IDS = ['hydra', 'hydra_heads2', 'hydra_heads3', 'hydra_heads4', 'hydra_heads5'];

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
const tickNow = () => page.evaluate(() => window.aoe.session.state.tick);
async function waitTicks(n, timeout = 180000) { const t = (await tickNow()) + n; await page.waitForFunction((t) => window.aoe.session.state.tick >= t, t, { timeout, polling: 100 }); }
async function waitUntil(cond, maxTicks, timeout = 300000) {
  const limit = (await tickNow()) + maxTicks;
  await page.waitForFunction(([src, limit]) => window.aoe.session.state.tick >= limit || (0, eval)(`(${src})`)(), [cond.toString(), limit], { timeout, polling: 200 });
}
const stopLoops = () => page.evaluate(() => { window.__walkStop = true; window.__sampleStop = true; });
/** Partida nova (pausada, HUD oculto), com as funções de apoio (tile livre, área livre longe dos Centros Cívicos). */
async function newGame(mapSize = 'medium') {
  await stopLoops();
  await page.evaluate(([seed, mapSize]) => {
    const players = [{ name: 'Jogador', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'Leônidas (IA)', god: 'poseidon', isAI: true, difficulty: 'easy', team: 1 }];
    window.aoe.startGame({ seed, mapSize, players, revealMap: false, mode: 'conquest', mapType: 'continental' });
    window.aoe.session.paused = true;
    const h = document.getElementById('hud'); if (h) h.style.visibility = 'hidden';
  }, [SEED, mapSize]);
  await page.evaluate(() => window.aoe.renderer.art.ready());
  await page.evaluate(() => {
    const s = window.aoe.session, map = s.state.map;
    window.__open = (x, y) => { if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false; const i = y * map.w + x; return !map.blocked[i] && map.nodeAt[i] === -1 && map.buildingAt[i] === -1 && map.terrain[i] !== 1 && map.terrain[i] !== 2 && map.terrain[i] !== 5; };
    window.__area = (w, h, minTc = 16) => {
      const tcs = [...s.state.buildings.values()].filter((b) => b.type === 'town_center');
      let area = null, best = -Infinity;
      for (let y0 = 3; y0 + h <= map.h - 3; y0++) for (let x0 = 3; x0 + w <= map.w - 3; x0++) {
        const cx = x0 + w / 2, cy = y0 + h / 2;
        if (cx < 23 || cx > map.w - 23 || cy < 15 || cy > map.h - 15) continue;
        if (tcs.some((b) => Math.sqrt((cx - b.x) ** 2 + (cy - b.y) ** 2) < minTc + Math.max(w, h) / 2)) continue;
        let free = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (window.__open(x, y)) free++;
        if (free > best) { best = free; area = { x: x0, y: y0, free, of: w * h }; }
      }
      return area;
    };
    window.__ids = (list) => list.filter(Boolean).map((u) => u.id);
    window.__tough = (u, hp = 6000) => { if (u) { u.hp = u.maxHp = hp; } return u; };
    window.__put = (u, x, y) => { if (!u) return u; u.x = u.px = u.tx = x; u.y = u.py = u.ty = y; u.lastDamageTick = -1e9; return u; };
  });
}
/** Assets das criaturas e da fila (a hidra tem um por número de cabeças): pedidos antes de medir — no jogo as míticas
 *  carregam na primeira vista (procedural até chegar), e a cena não mede esse instante. */
const WARM = [...MYTH, ...HYDRA_IDS.slice(1), 'hoplite', 'hetairoi', 'toxotes'];
/** Reaplica o preset (o automático mede o começo de cada partida) e espera as páginas das criaturas. */
async function settle() {
  await page.waitForTimeout(300);
  await page.evaluate(() => window.aoe.applyQuality());
  await page.evaluate((t) => { window.aoe.renderer.art.prewarmUnits(t); return window.aoe.renderer.art.ready(); }, WARM);
  await page.evaluate(() => { window.aoe.session.paused = false; });
  await waitTicks(2);
  await page.evaluate(() => window.aoe.renderer.art.ready());
  await page.evaluate(() => { window.aoe.session.paused = true; });
  await page.waitForTimeout(300);
}
/** Vistas procedurais (sem arte) de unidades vivas destes tipos. */
const procedural = (types) => page.evaluate((types) => {
  const out = {}; for (const [id, v] of window.aoe.renderer.views) if (window.aoe.session.state.units.get(id) && types.includes(v.type) && !v.unit) out[v.type] = (out[v.type] ?? 0) + 1;
  return out;
}, types);
async function startWalking(legTicks) {
  await page.evaluate((legTicks) => {
    let n = 0, next = -1;
    const go = () => {
      const s = window.aoe.session; if (!s) return;
      const out = n % 2 === 0, lap = Math.floor(n / 2);
      for (const R of window.__rodas) R.ids.forEach((id, k) => {
        const u = s.state.units.get(id); if (!u) return;
        const a = ((k + lap) % 8) * Math.PI / 4, r = out ? R.r : 0;
        s.issue({ type: 'move', player: u.owner, ids: [id], x: R.c.x + 0.5 + Math.cos(a) * r, y: R.c.y + 0.5 + Math.sin(a) * r });
      });
      n++;
    };
    window.__walkStop = false;
    const loop = () => { const s = window.aoe.session; if (!s || window.__walkStop) return; if (next < 0 || s.state.tick >= next) { go(); next = s.state.tick + legTicks; } requestAnimationFrame(loop); };
    loop();
    window.aoe.session.paused = false; window.aoe.session.speed = 1;
  }, legTicks);
}
/** Amostrador por tick (como no artparade): animações por tipo, direções coerentes andando, golpes × alvo, procedurais. */
async function startSampler(types) {
  await page.evaluate((types) => {
    const st = window.__stats = { byType: {}, dirs: {}, dirOk: 0, dirBad: 0, hitOk: 0, hitOff: 0, hitSamples: [], procedural: {}, flyShadow: { ok: 0, bad: 0 }, n: 0 };
    const oct = (dx, dy) => ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    const diff = (a, b) => Math.min((a - b + 8) % 8, (b - a + 8) % 8);
    let last = -1;
    window.__sampleStop = false;
    const sample = () => {
      const s = window.aoe.session, R = window.aoe.renderer; if (!s || window.__sampleStop) return;
      requestAnimationFrame(sample);
      if (s.state.tick === last) return;
      last = s.state.tick; st.n++;
      for (const [id, v] of R.views) {
        const u = s.state.units.get(id);
        if (!u || !types.includes(v.type)) continue;
        if (!v.unit) { st.procedural[v.type] = (st.procedural[v.type] ?? 0) + 1; continue; }
        const bt = st.byType[v.type] ??= {}; bt[v.unit.anim] = (bt[v.unit.anim] ?? 0) + 1;
        const dx = u.x - u.px, dy = u.y - u.py, a = v.unit.anim;
        if (dx * dx + dy * dy > 1e-6 && (a === 'walk' || a === 'run')) {
          const d = oct(dx, dy);
          if (diff(d, v.unit.dir) <= 1) { st.dirOk++; const ds = st.dirs[v.type] ??= []; if (!ds.includes(v.unit.dir)) ds.push(v.unit.dir); } else st.dirBad++;
        }
        const t = a === 'attack' ? s.state.units.get(u.targetId) : null;
        if (t) { if (diff(oct(t.x - u.x, t.y - u.y), v.unit.dir) >= 2) { st.hitOff++; if (st.hitSamples.length < 6) st.hitSamples.push({ type: v.type, dir: v.unit.dir }); } else st.hitOk++; }
        // voadora: sombra no chão (no pé, na camada de sombras) mais fraca que a das outras
        if (v.unit.art.flying) { const sh = v.unit.shadow; if (sh && sh.visible && Math.abs(sh.position.y - v.unit.root.position.y) < 0.5 && sh.alpha < 0.4) st.flyShadow.ok++; else st.flyShadow.bad++; }
      }
    };
    sample();
  }, types);
}
const stopSampler = () => page.evaluate(() => { window.__sampleStop = true; return window.__stats; });
const checkDirs = (st, label) => { const n = st.dirOk + st.dirBad; if (st.dirBad > 0.05 * n) errors.push(`${label}: direção incoerente em ${st.dirBad} de ${n} amostras andando`); };

// ------------------------------------------------------------------------------------------------------------------
// 1. roda: as 4 criaturas nas 8 direções
await newGame();
const roda = await page.evaluate((MYTH) => {
  const s = window.aoe.session, me = s.local, sp = window.aoe.debugSpawn, ids = window.__ids;
  const a = window.__area(28, 14);
  window.__rodas = MYTH.map((t, i) => {
    const c = { x: a.x + 4 + (i % 2) * 14 + 3.5, y: a.y + 3.5 + Math.floor(i / 2) * 7 };
    const u = window.__put(sp(me, t, c.x, c.y), c.x, c.y);
    if (u) s.issue({ type: 'stance', player: me, ids: [u.id], stance: 'passive' });
    return { c: { x: c.x - 0.5, y: c.y - 0.5 }, ids: ids([u]), r: 3 };
  });
  window.aoe.renderer.revealAll = true;
  return { area: a, center: { x: a.x + 14, y: a.y + 7 } };
}, MYTH);
console.log('roda:', JSON.stringify(roda));
await settle();
await startSampler(MYTH);
await startWalking(64);
await look(roda.center, 1.0);
await waitTicks(150);
await shot('roda-z10', 0);
await page.evaluate((M) => { window.__rodaTypes = M; }, MYTH);
await waitUntil(() => { const st = window.__stats; return window.__rodaTypes.every((t) => (st.dirs[t] ?? []).length >= 8) && st.byType.nemean_lion?.run; }, 14 * 64);
const st1 = await stopSampler();
await page.evaluate(() => { window.__walkStop = true; });
console.log('roda — direções:', JSON.stringify(Object.fromEntries(Object.entries(st1.dirs).map(([t, d]) => [t, d.length]))), 'animações:', JSON.stringify(st1.byType), `dirOk=${st1.dirOk} dirBad=${st1.dirBad} sombra do voo ok=${st1.flyShadow.ok} ruim=${st1.flyShadow.bad}`);
checkDirs(st1, 'roda');
if (Object.keys(st1.procedural).length) errors.push(`roda procedural: ${JSON.stringify(st1.procedural)}`);
for (const t of MYTH) { const d = st1.dirs[t] ?? []; if (d.length < 8) errors.push(`${t}: andou em ${d.length} das 8 direções (${d.sort().join(',')})`); }
if (!st1.byType.nemean_lion?.run) errors.push('nemean_lion: nenhuma amostra galopando (run)');
if (!st1.byType.pegasus?.walk) errors.push('pegasus: nenhuma amostra voando (walk)');
if (!st1.flyShadow.ok || st1.flyShadow.bad > 0.05 * (st1.flyShadow.ok + st1.flyShadow.bad)) errors.push(`pegasus: sombra do voo fora do pé ou forte demais (${JSON.stringify(st1.flyShadow)})`);

// ------------------------------------------------------------------------------------------------------------------
// 2. batalha: criaturas × hoplitas e hetairos, o Pégaso por cima; no fim uma queda de cada
await newGame();
const battle = await page.evaluate((FIGHTERS) => {
  const s = window.aoe.session, me = s.local, foe = (me + 1) % s.state.players.length, sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
  const a = window.__area(22, 12), cx = a.x + 11, cy = a.y + 6;
  const A = [], B = [];
  FIGHTERS.forEach((t, i) => { for (const k of [0, 1]) A.push(tough(sp(me, t, cx - 3.5, cy - 3 + i * 2.2 + k * 1.1))); });
  for (let i = 0; i < 8; i++) B.push(tough(sp(foe, i % 3 === 2 ? 'hetairoi' : 'hoplite', cx + 3.5 + (i % 2) * 0.9, cy - 3.5 + i)));
  const peg = tough(sp(me, 'pegasus', cx, cy - 1));
  // arqueiros inimigos atrás da linha: o corpo a corpo não alcança quem voa, e eles derrubam o Pégaso no fim
  const archers = [0, 1].map((k) => tough(sp(foe, 'toxotes', cx + 6, cy - 1 + k * 2)));
  s.scheduler.issue({ type: 'stance', player: foe, ids: ids(archers), stance: 'passive' });
  window.__archers = ids(archers);
  const heads = s.state.units.get(A.find((u) => u?.type === 'hydra')?.id);
  for (const u of A) if (u?.type === 'hydra') u.heads = 3;
  s.issue({ type: 'attackMove', player: me, ids: ids(A), x: cx + 6, y: cy });
  s.scheduler.issue({ type: 'attackMove', player: foe, ids: ids(B), x: cx - 6, y: cy });
  if (peg) s.issue({ type: 'move', player: me, ids: [peg.id], x: cx + 1, y: cy + 1 });
  window.__armyA = ids(A); window.__armyB = ids(B); window.__peg = peg?.id;
  window.aoe.renderer.revealAll = true;
  return { center: { x: cx, y: cy }, a: A.length, b: B.length, hydraHeads: heads?.heads };
}, FIGHTERS);
console.log('batalha:', JSON.stringify(battle));
await settle();
await page.evaluate(() => { window.aoe.session.paused = false; window.aoe.session.speed = 1; });
await startSampler([...MYTH, 'hoplite', 'hetairoi']);
await waitTicks(60);
await look(battle.center, 1.0); await shot('batalha-z10', 300);
await waitTicks(30);
await look(battle.center, 2.2); await shot('batalha-z22', 300);
await page.evaluate((F) => { window.__fighters = F; }, FIGHTERS);
await waitUntil(() => window.__fighters.every((t) => window.__stats.byType[t]?.attack), 360);
const st2 = await stopSampler();
console.log('batalha — animações:', JSON.stringify(st2.byType), `golpes ok=${st2.hitOk} fora=${st2.hitOff}`);
if (Object.keys(st2.procedural).length) errors.push(`batalha procedural: ${JSON.stringify(st2.procedural)}`);
for (const t of FIGHTERS) if (!st2.byType[t]?.attack) errors.push(`${t}: nenhuma amostra atacando (${JSON.stringify(st2.byType[t] ?? {})})`);
{ const n = st2.hitOk + st2.hitOff; if (!n) errors.push('batalha: nenhum golpe com alvo'); else if (st2.hitOff > 0.1 * n) errors.push(`batalha: ${st2.hitOff} de ${n} golpes a 90°+ do alvo (${JSON.stringify(st2.hitSamples)})`); }
// quedas: uma de cada criatura (vida 1, atacada por um inimigo) e o Pégaso (morre no ar e cai)
await page.evaluate(() => {
  const s = window.aoe.session, seen = new Set();
  const hunters = window.__armyB.map((id) => s.state.units.get(id)).filter(Boolean);
  let h = 0;
  for (const id of window.__armyA) {
    const u = s.state.units.get(id); if (!u || seen.has(u.type)) continue;
    seen.add(u.type); u.hp = 1;
    const by = hunters[h++ % hunters.length];
    if (by) s.scheduler.issue({ type: 'attack', player: by.owner, ids: [by.id], targetId: u.id });
  }
  // o Pégaso: vida 1 e os arqueiros atiram nele (quem voa só cai por projétil)
  const peg = s.state.units.get(window.__peg);
  if (peg) { peg.hp = 1; s.scheduler.issue({ type: 'attack', player: (s.local + 1) % s.state.players.length, ids: window.__archers, targetId: peg.id }); }
});
const watchFrames = (types, ticks, src) => page.evaluate(([types, ticks, src]) => new Promise((done) => {
  const s = window.aoe.session, R = window.aoe.renderer, end = s.state.tick + ticks, out = {}, f = (0, eval)(`(${src})`);
  const step = () => { for (const [t] of f(R, types)) out[t] = (out[t] ?? 0) + 1; if (s.state.tick >= end || window.__watchAll?.(out)) done(out); else requestAnimationFrame(step); };
  step();
}), [types, ticks, src]);
await page.evaluate((A) => { window.__watchAll = (o) => A.every((t) => o[t]); }, [...FIGHTERS, 'pegasus']);
await look(battle.center, 2.2);
const fallsP = watchFrames([...FIGHTERS, 'pegasus'], 300, ((R) => { const out = []; for (const uv of R.fx.dyingViews()) if (uv.anim === 'die') out.push([uv.type]); return out; }).toString());
await page.waitForTimeout(1500);
await shot('queda-z22', 0);   // no meio das quedas (a queda dura 1,2 s de jogo; o cadáver fica 8 s)
const falls = await fallsP;
await page.evaluate(() => { window.__watchAll = null; });
console.log('quedas assadas:', JSON.stringify(falls));
for (const t of [...FIGHTERS, 'pegasus']) if (!falls[t]) errors.push(`${t}: a morte não saiu assada`);

// ------------------------------------------------------------------------------------------------------------------
// 3. hidra: 1–5 cabeças lado a lado (o asset pela entidade) e uma que ganha cabeça no meio da cena
await newGame();
const hyd = await page.evaluate(() => {
  const s = window.aoe.session, me = s.local, sp = window.aoe.debugSpawn;
  const a = window.__area(20, 8), out = [];
  for (let i = 0; i < 5; i++) { const u = window.__put(sp(me, 'hydra', a.x + 2.5 + i * 3.6, a.y + 5), a.x + 2.5 + i * 3.6, a.y + 5); if (u) { u.heads = i + 1; out.push(u.id); } }
  s.issue({ type: 'stance', player: me, ids: out, stance: 'passive' });
  window.__hyd = out;
  window.aoe.renderer.revealAll = true;
  return { center: { x: a.x + 9.7, y: a.y + 4.2 }, ids: out };
});
await settle();
await page.evaluate(() => { window.aoe.session.paused = false; });
await waitTicks(8);
await page.evaluate(() => { window.aoe.session.paused = true; });
await look(hyd.center, 2.2); await shot('hidra-z22');
const hydArt = await page.evaluate(() => window.__hyd.map((id) => { const v = window.aoe.renderer.views.get(id); return v?.unit ? v.unit.art.id : null; }));
console.log('hidra — assets pelas cabeças:', JSON.stringify(hydArt));
HYDRA_IDS.forEach((id, i) => { if (hydArt[i] !== id) errors.push(`hidra de ${i + 1} cabeça(s) com o asset ${hydArt[i]} (esperado ${id})`); });
// ganha uma cabeça (2 → 3): a vista troca de asset
await page.evaluate(() => { const u = window.aoe.session.state.units.get(window.__hyd[1]); if (u) u.heads = 3; window.aoe.session.paused = false; });
await waitTicks(4);
await page.evaluate(() => window.aoe.renderer.art.ready());
await waitTicks(4);
const grown = await page.evaluate(() => { const v = window.aoe.renderer.views.get(window.__hyd[1]); window.aoe.session.paused = true; return v?.unit ? v.unit.art.id : null; });
console.log('hidra que ganhou cabeça:', grown);
if (grown !== 'hydra_heads3') errors.push(`hidra que ganhou a 3ª cabeça ficou com ${grown}`);

// ------------------------------------------------------------------------------------------------------------------
// 4. voo: o Pégaso parado no ar e voando sobre o campo
await newGame();
const voo = await page.evaluate(() => {
  const s = window.aoe.session, me = s.local, sp = window.aoe.debugSpawn;
  const a = window.__area(12, 8);
  const p1 = window.__put(sp(me, 'pegasus', a.x + 3.5, a.y + 4), a.x + 3.5, a.y + 4);
  const p2 = window.__put(sp(me, 'pegasus', a.x + 6, a.y + 5), a.x + 6, a.y + 5);
  const hop = window.__put(sp(me, 'hoplite', a.x + 4.8, a.y + 4.6), a.x + 4.8, a.y + 4.6);
  s.issue({ type: 'move', player: me, ids: [p2.id], x: a.x + 11, y: a.y + 2 });
  window.aoe.renderer.revealAll = true;
  window.__vooIds = [p1.id, p2.id, hop.id];
  return { center: { x: a.x + 5.5, y: a.y + 4 }, ids: [p1.id, p2.id] };
});
await settle();
await page.evaluate(() => { window.aoe.session.paused = false; });
await waitTicks(10);
await page.evaluate(() => { window.aoe.session.paused = true; });
await look(voo.center, 2.2); await shot('voo-z22');
const fly = await page.evaluate(() => window.__vooIds.map((id) => { const v = window.aoe.renderer.views.get(id); return v?.unit ? { type: v.type, anim: v.unit.anim, shadowAlpha: +v.unit.shadow.alpha.toFixed(3), bodyBottom: +(v.unit.by1 - v.unit.root.position.y).toFixed(1) } : null; }));
console.log('voo:', JSON.stringify(fly));
if (!fly[0] || !fly[2] || !(fly[0].shadowAlpha < fly[2].shadowAlpha)) errors.push(`voo: a sombra do Pégaso não é mais fraca que a do hoplita (${JSON.stringify(fly)})`);
if (!fly[0] || !(fly[0].bodyBottom < -6)) errors.push(`voo: o corpo do Pégaso não está no ar (${JSON.stringify(fly[0])})`);

// ------------------------------------------------------------------------------------------------------------------
// 5. desfile: as criaturas paradas ao lado do hoplita e do hetairo, diante do templo
await newGame();
const LINE = ['hoplite', 'minotaur', 'nemean_lion', 'hydra', 'pegasus', 'hetairoi'];
const parade = await page.evaluate((LINE) => {
  const s = window.aoe.session, st = s.state, me = s.local, sp = window.aoe.debugSpawn, ids = window.__ids;
  const a = window.__area(20, 10);
  const t = window.aoe.debugBuild(me, 'temple', a.x + 9, a.y + 1, 1);
  const cx = a.x + 10, out = LINE.map((type, i) => window.__put(sp(me, type, cx, a.y + 7), cx + (i - (LINE.length - 1) / 2) * 2.7, a.y + 7));
  for (const u of out) if (u?.type === 'hydra') u.heads = 3;
  s.issue({ type: 'stance', player: me, ids: ids(out), stance: 'passive' });
  window.aoe.renderer.revealAll = true;
  return { center: { x: cx, y: a.y + 5.6 }, temple: !!t, n: ids(out).length };
}, LINE);
console.log('desfile:', JSON.stringify(parade));
await settle();
await page.evaluate(() => { window.aoe.session.paused = false; });
await waitTicks(10);
await page.evaluate(() => { window.aoe.session.paused = true; });
await look(parade.center, 1.0); await shot('desfile-z10');
await look(parade.center, 2.2); await shot('desfile-z22');
const procD = await procedural(LINE);
if (Object.keys(procD).length) errors.push(`desfile procedural: ${JSON.stringify(procD)}`);
const statusMedium = await page.evaluate(() => ({ ...window.aoe.renderer.art.status(), ready1: window.aoe.renderer.art.unitsReady(1).join(',') }));
await page.evaluate(() => { window.aoe.settings.bakedArt = false; window.aoe.applyQuality(); });
await look(parade.center, 1.0); await shot('procedural-z10');
await page.evaluate(() => { window.aoe.settings.bakedArt = true; window.aoe.settings.quality = 'high'; window.aoe.applyQuality(); });
await page.evaluate((t) => { window.aoe.renderer.art.prewarmUnits(t); return window.aoe.renderer.art.ready(); }, WARM);
await page.evaluate(() => { window.aoe.session.paused = false; });
await waitTicks(2);
await page.evaluate(() => window.aoe.renderer.art.ready());
await page.evaluate(() => { window.aoe.session.paused = true; });
await look(parade.center, 2.2); await shot('desfile-z22-2x', 2000);
const procD2 = await procedural(LINE);
if (Object.keys(procD2).length) errors.push(`desfile procedural no 2×: ${JSON.stringify(procD2)}`);
const statusHigh = await page.evaluate(() => ({ ...window.aoe.renderer.art.status(), ready2: window.aoe.renderer.art.unitsReady(2).join(',') }));
console.log('arte (médio):', JSON.stringify(statusMedium));
console.log('arte (alto):', JSON.stringify(statusHigh));
for (const t of MYTH) { if (!statusMedium.ready1.split(',').includes(t)) errors.push(`${t}: páginas 1× não prontas`); if (!statusHigh.ready2.split(',').includes(t)) errors.push(`${t}: páginas 2× não prontas`); }

// ------------------------------------------------------------------------------------------------------------------
// 6. titãs (lote titãs): ascensão, roda, batalha, queda e desfile
const TITANS = ['prometheus', 'oceanus', 'cronus'];
await page.evaluate(() => { window.aoe.settings.quality = 'medium'; window.aoe.applyQuality(); });
/** Páginas dos titãs (só 1×) prontas antes de medir: no jogo o Portal dos Titãs já as pede (warmTitans do renderizador). */
const warmTitans = () => page.evaluate((t) => { window.aoe.renderer.art.prewarmUnits(t); return window.aoe.renderer.art.ready(); }, TITANS);
// 6a. ascensão: o Portal de Prometeu (Zeus) pronto → o núcleo liberta o titã com o `titanRise`; Oceano e Cronos nascem
// com o mesmo efeito no pé (como o núcleo faz), no mesmo tick. Antes, a VRAM de textura sem e com as páginas dos titãs
// (preset Médio; as páginas ficam na sessão, então a medida é aqui, na primeira vez que elas sobem)
await newGame();
await settle();
const texBefore = await page.evaluate(() => window.aoe.perf.snapshot().textureMB);
await warmTitans();
const texAfter = await page.evaluate(() => window.aoe.perf.snapshot().textureMB);
console.log(`titãs — VRAM de textura (preset Médio, com mipmaps): ${texBefore} MB → ${texAfter} MB com as páginas dos 3 (+${(texAfter - texBefore).toFixed(1)} MB)`);
const rise = await page.evaluate(() => {
  const s = window.aoe.session, st = s.state, me = s.local, sp = window.aoe.debugSpawn;
  const a = window.__area(34, 12, 18);
  const gate = window.aoe.debugBuild(me, 'titan_gate', a.x + 2, a.y + 3, 1);
  for (const [t, dx] of [['oceanus', 17], ['cronus', 27]]) {
    const u = window.__put(sp(me, t, a.x + dx, a.y + 6), a.x + dx, a.y + 6);
    if (u) { u.stance = 'passive'; st.effects.push({ type: 'titanRise', x: u.x, y: u.y, ttl: 60, total: 60 }); }
  }
  window.aoe.renderer.revealAll = true;
  return { center: { x: a.x + 17, y: a.y + 6 }, cronus: { x: a.x + 27, y: a.y + 5 }, gate: !!gate, tick: st.tick };
});
console.log('titãs — ascensão:', JSON.stringify(rise));
if (!rise.gate) errors.push('titãs: o Portal dos Titãs não foi colocado');
await page.evaluate((TITANS) => {
  // a animação de cada titã por tick desde o nascimento (a ascensão dura 8 quadros a 5 fps = 32 ticks)
  const R = window.aoe.renderer, s = window.aoe.session, out = window.__rise = {};
  window.__sampleStop = false;
  let last = -1;
  const f = () => {
    if (window.__sampleStop) return;
    requestAnimationFrame(f);
    if (s.state.tick === last) return;
    last = s.state.tick;
    for (const u of s.state.units.values()) {
      if (!TITANS.includes(u.type)) continue;
      if (u.stance !== 'passive') u.stance = 'passive';   // (o titã do portal nasce agressivo: fica parado para a cena)
      const v = R.views.get(u.id), o = out[u.type] ??= { born: u.spawnTick, seq: [], procedural: 0 };
      if (!v) continue;   // (a vista nasce no quadro seguinte ao tick)
      if (!v.unit) { o.procedural++; continue; }
      o.seq.push([s.state.tick - u.spawnTick, v.unit.anim]);
    }
  };
  f();
  s.paused = false; s.speed = 1;
}, TITANS);
// (o relógio das animações é o do jogo: pausado no meio da ascensão, a captura sai no quadro certo)
await look(rise.center, 1.0);
await waitTicks(12);
await page.evaluate(() => { window.aoe.session.paused = true; });
await shot('titas-ascensao-z10', 600);
await look(rise.cronus, 2.2);
await shot('titas-ascensao-z22', 600);
await look(rise.center, 1.0);   // os três à vista de novo (a vista fora da tela não é atualizada)
await page.evaluate(() => { window.aoe.session.paused = false; });
await waitTicks(54);
const riseSt = await page.evaluate(() => { window.__sampleStop = true; window.aoe.session.paused = true; return window.__rise; });
for (const t of TITANS) {
  const o = riseSt[t];
  if (!o) { errors.push(`${t}: não nasceu na cena da ascensão`); continue; }
  const during = o.seq.filter(([d]) => d >= 0 && d < 30), after = o.seq.filter(([d]) => d >= 34);
  const r = during.filter(([, a]) => a === 'rise').length;
  console.log(`titãs — ${t}: nasceu no tick ${o.born}, ascensão em ${r}/${during.length} amostras dos 30 primeiros ticks, depois ${[...new Set(after.map(([, a]) => a))].join(',')}, procedural ${o.procedural}`);
  if (o.procedural) errors.push(`${t}: procedural em ${o.procedural} amostras (páginas não prontas)`);
  if (!during.length || r < 0.9 * during.length) errors.push(`${t}: a ascensão não tocou desde o nascimento (${r}/${during.length})`);
  if (!after.length || after.some(([, a]) => a === 'rise')) errors.push(`${t}: a ascensão não terminou (ou repetiu) depois de 1,6 s`);
}

// 6b. roda: os 3 titãs nas 8 direções (Oceano desliza), já em pé (sem ascensão)
await newGame();
await settle();
await warmTitans();
const rodaT = await page.evaluate((TITANS) => {
  const s = window.aoe.session, me = s.local, sp = window.aoe.debugSpawn, ids = window.__ids;
  const a = window.__area(36, 12, 18);
  window.__rodas = TITANS.map((t, i) => {
    const c = { x: a.x + 6 + i * 12, y: a.y + 6 };
    const u = window.__put(sp(me, t, c.x, c.y), c.x, c.y);
    if (u) { u.spawnTick = 0; s.issue({ type: 'stance', player: me, ids: [u.id], stance: 'passive' }); }
    return { c: { x: c.x - 0.5, y: c.y - 0.5 }, ids: ids([u]), r: 4 };
  });
  window.aoe.renderer.revealAll = true;
  return { center: { x: a.x + 18, y: a.y + 6 } };
}, TITANS);
await startSampler(TITANS);
await startWalking(80);
await look(rodaT.center, 1.0);
await waitTicks(120);
await shot('titas-roda-z10', 0);
await page.evaluate((T) => { window.__rodaTypes = T; }, TITANS);
await waitUntil(() => { const st = window.__stats; return window.__rodaTypes.every((t) => (st.dirs[t] ?? []).length >= 8); }, 18 * 80);
const st6 = await stopSampler();
await page.evaluate(() => { window.__walkStop = true; });
console.log('titãs — roda:', JSON.stringify(Object.fromEntries(Object.entries(st6.dirs).map(([t, d]) => [t, d.length]))), 'animações:', JSON.stringify(st6.byType), `dirOk=${st6.dirOk} dirBad=${st6.dirBad}`);
checkDirs(st6, 'titãs — roda');
if (Object.keys(st6.procedural).length) errors.push(`titãs — roda procedural: ${JSON.stringify(st6.procedural)}`);
for (const t of TITANS) { const d = st6.dirs[t] ?? []; if (d.length < 8) errors.push(`${t}: andou em ${d.length} das 8 direções (${d.sort().join(',')})`); }

// 6c. batalha: os titãs contra hoplitas (golpe de área virado para o alvo) e, no fim, a queda assada de cada um
await newGame();
await settle();
await warmTitans();
const battleT = await page.evaluate((TITANS) => {
  const s = window.aoe.session, me = s.local, foe = (me + 1) % s.state.players.length, sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
  const a = window.__area(30, 14, 18), cx = a.x + 15, cy = a.y + 7;
  const A = TITANS.map((t, i) => { const u = tough(sp(me, t, cx - 5, cy - 4 + i * 4), 20000); if (u) u.spawnTick = 0; return u; });
  const B = [];
  for (let i = 0; i < 12; i++) B.push(tough(sp(foe, 'hoplite', cx + 3 + (i % 3) * 0.9, cy - 5 + i * 0.9), 3000));
  s.issue({ type: 'attackMove', player: me, ids: ids(A), x: cx + 8, y: cy });
  s.scheduler.issue({ type: 'attackMove', player: foe, ids: ids(B), x: cx - 8, y: cy });
  window.__armyA = ids(A); window.__armyB = ids(B);
  window.aoe.renderer.revealAll = true;
  return { center: { x: cx, y: cy } };
}, TITANS);
await page.evaluate(() => { window.aoe.session.paused = false; window.aoe.session.speed = 1; });
await startSampler([...TITANS, 'hoplite']);
await waitTicks(70);
await look(battleT.center, 1.0);
await shot('titas-batalha-z10', 300);
await page.evaluate((T) => { window.__fighters = T; }, TITANS);
await waitUntil(() => window.__fighters.every((t) => window.__stats.byType[t]?.attack), 400);
const st7 = await stopSampler();
console.log('titãs — batalha:', JSON.stringify(st7.byType), `golpes ok=${st7.hitOk} fora=${st7.hitOff}`);
if (Object.keys(st7.procedural).length) errors.push(`titãs — batalha procedural: ${JSON.stringify(st7.procedural)}`);
for (const t of TITANS) if (!st7.byType[t]?.attack) errors.push(`${t}: nenhuma amostra atacando (${JSON.stringify(st7.byType[t] ?? {})})`);
{ const n = st7.hitOk + st7.hitOff; if (!n) errors.push('titãs — batalha: nenhum golpe com alvo'); else if (st7.hitOff > 0.1 * n) errors.push(`titãs — batalha: ${st7.hitOff} de ${n} golpes a 90°+ do alvo (${JSON.stringify(st7.hitSamples)})`); }
await page.evaluate(() => {
  const s = window.aoe.session, hunters = window.__armyB.map((id) => s.state.units.get(id)).filter(Boolean);
  window.__armyA.forEach((id, k) => {
    const u = s.state.units.get(id);
    if (!u) return;
    u.hp = 1;
    const by = hunters[k % Math.max(1, hunters.length)];
    if (by) s.scheduler.issue({ type: 'attack', player: by.owner, ids: [by.id], targetId: u.id });
  });
});
await page.evaluate((A) => { window.__watchAll = (o) => A.every((t) => o[t]); }, TITANS);
await look(battleT.center, 1.0);
const fallsTP = watchFrames(TITANS, 300, ((R) => { const out = []; for (const uv of R.fx.dyingViews()) if (uv.anim === 'die') out.push([uv.type]); return out; }).toString());
await page.waitForTimeout(1200);
await shot('titas-queda-z10', 0);
const fallsT = await fallsTP;
await page.evaluate(() => { window.__watchAll = null; });
console.log('titãs — quedas assadas:', JSON.stringify(fallsT));
for (const t of TITANS) if (!fallsT[t]) errors.push(`${t}: a morte não saiu assada`);

// 6d. desfile: o hoplita e os 3 titãs parados
await newGame();
await settle();
const LINE_T = ['hoplite', 'prometheus', 'cronus', 'oceanus'];
const paradeT = await page.evaluate((LINE_T) => {
  const s = window.aoe.session, me = s.local, sp = window.aoe.debugSpawn, ids = window.__ids;
  const a = window.__area(24, 10, 18), cx = a.x + 12;
  const out = LINE_T.map((type, i) => { const x = cx + (i - 1.5) * 5.5, u = window.__put(sp(me, type, x, a.y + 7), x, a.y + 7); if (u) u.spawnTick = 0; return u; });
  s.issue({ type: 'stance', player: me, ids: ids(out), stance: 'passive' });
  window.aoe.renderer.revealAll = true;
  return { center: { x: cx, y: a.y + 5 }, n: ids(out).length };
}, LINE_T);
await warmTitans();
await page.evaluate(() => { window.aoe.session.paused = false; });
await waitTicks(10);
await page.evaluate(() => { window.aoe.session.paused = true; });
await look(paradeT.center, 1.0);
await shot('titas-desfile-z10');
await look({ x: paradeT.center.x - 5.5, y: paradeT.center.y }, 2.2);
await shot('titas-desfile-z22');
const procT = await procedural(LINE_T);
if (Object.keys(procT).length) errors.push(`titãs — desfile procedural: ${JSON.stringify(procT)}`);
const readyT = await page.evaluate(() => window.aoe.renderer.art.unitsReady(1));
for (const t of TITANS) if (!readyT.includes(t)) errors.push(`${t}: páginas 1× não prontas`);
await page.evaluate(() => { window.aoe.settings.bakedArt = false; window.aoe.applyQuality(); });
await look(paradeT.center, 1.0);
await shot('titas-procedural-z10');
await page.evaluate(() => { window.aoe.settings.bakedArt = true; window.aoe.applyQuality(); });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
if (errors.length) process.exit(1);
