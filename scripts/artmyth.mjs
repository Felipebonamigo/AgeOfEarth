// Criaturas assadas no jogo (Etapa 6, docs/ART.md Apêndice G) — o padrão de scripts/artparade.mjs para as 13 míticas e
// os 3 titãs, cada cena numa partida nova (semente 42, 1 IA fácil, mapa médio, numa clareira longe dos Centros Cívicos),
// o mapa revelado só no renderizador e o HUD oculto. Cenas (`--only a,b,…`; sem a opção, todas):
//  roda      — lote 1 + feras (minotauro, Leão de Nemeia, Pégaso, hidra, Cérbero, Quimera, Mantícora): uma roda por tipo,
//              cada ida girando a direção — as 8 direções, a direção de quem anda coerente com a velocidade, o leão e a
//              mantícora soltos galopando (`run`), o Pégaso voando com a sombra no chão;
//  batalha   — as mesmas contra hoplitas e hetairos (vida alta), o Pégaso por cima: cada uma ataca (≤ 10 % dos golpes
//              virados para longe do alvo) e, no fim, uma de cada cai com a QUEDA ASSADA (o Pégaso cai do céu);
//  hidra     — cinco hidras lado a lado com 1–5 cabeças (o asset pela entidade: hydra, hydra_heads2…5) e uma que ganha uma
//              cabeça no meio da cena (a vista troca de asset);
//  voo       — o Pégaso parado no ar e voando, com a sombra translúcida no chão;
//  desfile   — as criaturas da roda paradas ao lado do hoplita e do hetairo, diante do templo (zoom 1 e 2,2; o 2× no preset
//              alto; e a mesma fila com a arte desligada: o "antes");
//  bipedes   — lote bípedes-espíritos (ciclope, colosso, Medusa, centauro, sentinela e Sombra): roda nas 8 direções (o
//              centauro galopa), batalha (ataque, mira dos arqueiros, translucidez da Sombra, quedas assadas), o poder
//              Sentinelas erguendo as estátuas em volta de um templo e o desfile (1×, 2×, procedural);
//  feras     — o sopro da Quimera (a língua de fogo assada nos quadros 0–2 do ataque com o jato da Etapa 5), a rajada de
//              espinhos da Mantícora (e a mira entre os disparos) e uma matilha de Cérberos mordendo — a z 2,2;
//  titas     — Prometeu sai do Portal dos Titãs pelo caminho do núcleo e Oceano e Cronos nascem com o `titanRise`: a
//              ascensão (`rise`) toca desde o nascimento, uma vez; roda nas 8 direções, batalha (golpe de área virado para
//              o alvo), queda assada e desfile (os titãs só têm 1×);
//  bestiario — integração: as 13 míticas e os 3 titãs parados lado a lado com o hoplita, diante do templo (zoom 1 e 2,2);
//  mista     — integração: batalha mista mítica × humana (as 12 míticas que andam, a sentinela e Cronos contra hoplitas,
//              hipaspistas, toxotas, peltastas, hetairos, hipeus, Aquiles, Héracles e petróbolos): todos assados, todas as
//              míticas atacando, golpes virados para o alvo; mede a VRAM de textura com todas as criaturas carregadas.
// Capturas em <out>/ (padrão docs/art/): <prefixo>-{roda-z10,batalha-z10,batalha-z22,queda-z22,hidra-z22,voo-z22,
// desfile-z10,desfile-z22,desfile-z22-2x,procedural-z10}.png, <prefixo>-bipedes-{roda-z10,batalha-z10,batalha-z22,queda-z22,
// sentinelas-z22,desfile-z10,desfile-z22,desfile-z22-2x,procedural-z10}.png, <prefixo>-feras-{sopro,espinhos,cerbero}-z22.png,
// <prefixo>-titas-{ascensao-z10,ascensao-z22,roda-z10,batalha-z10,queda-z10,desfile-z10,desfile-z22,procedural-z10}.png,
// <prefixo>-bestiario-{z10,z22}.png e <prefixo>-batalha-mista-{z10,z22}.png. Falha com erro de página, criatura
// procedural, tipo que não anda nas 8 direções, direção incoerente, quem galopa sem `run`, Pégaso sem voo/sombra no chão,
// criatura sem ataque (ou sem mira, nas que atiram), golpes virados, queda não assada, hidra com o asset errado para as
// cabeças ou que não troca ao ganhar uma cabeça, Quimera sem o sopro, mantícora sem espinhos no ar, Sombra opaca,
// sentinela que não surge do poder ou titã sem a ascensão desde o nascimento.
// Tudo medido no TEMPO DE JOGO (tick). Exige `npm run preview` (ou a URL).
// Uso: node scripts/artmyth.mjs [url] [--out docs/art] [--prefix etapa6] [--only roda,batalha,hidra,voo,desfile,bipedes,feras,titas,bestiario,mista]
//      (`--lote bipedes` = `--only bipedes`, o nome do lote)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const url = pos[0] ?? 'http://localhost:4173/';
const outDir = opt('--out', 'docs/art');
const prefix = opt('--prefix', 'etapa6');
const only = opt('--only', null)?.split(',') ?? (opt('--lote', null) ? [opt('--lote', null)] : null);
const scene = (name) => !only || only.includes(name);
mkdirSync(outDir, { recursive: true });
const SEED = 42;
const MYTH = ['minotaur', 'nemean_lion', 'pegasus', 'hydra', 'cerberus', 'chimera', 'manticore'];
const FIGHTERS = ['minotaur', 'nemean_lion', 'hydra', 'cerberus', 'chimera', 'manticore'];
/** Quem galopa solto (acima de RUN_SPEED): a roda espera ver `run` de cada um. */
const RUNNERS = ['nemean_lion', 'manticore'];
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
async function waitTicks(n, timeout = Math.max(180000, n * 800)) { const t = (await tickNow()) + n; await page.waitForFunction((t) => window.aoe.session.state.tick >= t, t, { timeout, polling: 100 }); }
// (o limite em ms é só a rede de segurança: a espera é em ticks; numa máquina carregada o jogo anda a poucos ticks/s)
async function waitUntil(cond, maxTicks, timeout = Math.max(300000, maxTicks * 800)) {
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
/** Conta, por tipo, o que `src(R, types)` devolve a cada quadro até `ticks` de jogo (ou até `window.__watchAll(out)`). */
const watchFrames = (types, ticks, src) => page.evaluate(([types, ticks, src]) => new Promise((done) => {
  const s = window.aoe.session, R = window.aoe.renderer, end = s.state.tick + ticks, out = {}, f = (0, eval)(`(${src})`);
  const step = () => { for (const [t] of f(R, types)) out[t] = (out[t] ?? 0) + 1; if (s.state.tick >= end || window.__watchAll?.(out)) done(out); else requestAnimationFrame(step); };
  step();
}), [types, ticks, src]);

// ------------------------------------------------------------------------------------------------------------------
// Lote bípedes-espíritos (Etapa 6, docs/ART.md Apêndice G): ciclope, colosso, Medusa, centauro, Sombra e sentinela, em 4
// cenas próprias (`--only bipedes`) → <prefixo>-bipedes-{roda-z10,
// batalha-z10,batalha-z22,queda-z22,sentinelas-z22,desfile-z10,desfile-z22,desfile-z22-2x,procedural-z10}.png. Falha com
// criatura procedural, quem anda fora das 8 direções ou com a direção incoerente, centauro sem galope, criatura sem ataque
// (e sem mira nas de arco), golpes virados, queda não assada, Sombra sem translucidez ou sentinela que não surge do poder.
if (scene('bipedes')) {
  const WALKERS = ['cyclops', 'colossus', 'medusa', 'centaur', 'shade'];
  const LOT2 = [...WALKERS, 'sentinel'];
  const BOWS = ['medusa', 'centaur', 'sentinel'];
  const warm2 = [...LOT2, 'hoplite', 'hetairoi'];
  const settle2 = async () => { await settle(); await page.evaluate((t) => { window.aoe.renderer.art.prewarmUnits(t); return window.aoe.renderer.art.ready(); }, warm2); };
  // 1. roda: as 5 que andam nas 8 direções (o centauro solto galopa)
  await newGame();
  const roda2 = await page.evaluate((W) => {
    const s = window.aoe.session, me = s.local, sp = window.aoe.debugSpawn, ids = window.__ids;
    const a = window.__area(30, 22);
    window.__rodas = W.map((t, i) => {
      const c = { x: a.x + 5 + (i % 2) * 15 + 3.5, y: a.y + 4 + Math.floor(i / 2) * 7.5 };
      const u = window.__put(sp(me, t, c.x, c.y), c.x, c.y);
      if (u) s.issue({ type: 'stance', player: me, ids: [u.id], stance: 'passive' });
      return { c: { x: c.x - 0.5, y: c.y - 0.5 }, ids: ids([u]), r: 3 };
    });
    window.aoe.renderer.revealAll = true;
    return { area: a, center: { x: a.x + 15, y: a.y + 11 } };
  }, WALKERS);
  console.log('bípedes — roda:', JSON.stringify(roda2));
  await settle2();
  await startSampler(WALKERS);
  await startWalking(80);
  await look(roda2.center, 1.0);
  await waitTicks(150);
  await shot('bipedes-roda-z10', 0);
  await page.evaluate((W) => { window.__rodaTypes = W; }, WALKERS);
  await waitUntil(() => { const st = window.__stats; return window.__rodaTypes.every((t) => (st.dirs[t] ?? []).length >= 8) && st.byType.centaur?.run; }, 16 * 80);
  const sr = await stopSampler();
  await page.evaluate(() => { window.__walkStop = true; });
  console.log('bípedes — roda: direções', JSON.stringify(Object.fromEntries(Object.entries(sr.dirs).map(([t, d]) => [t, d.length]))), 'animações', JSON.stringify(sr.byType), `dirOk=${sr.dirOk} dirBad=${sr.dirBad}`);
  checkDirs(sr, 'bípedes — roda');
  if (Object.keys(sr.procedural).length) errors.push(`bípedes — roda procedural: ${JSON.stringify(sr.procedural)}`);
  for (const t of WALKERS) { const d = sr.dirs[t] ?? []; if (d.length < 8) errors.push(`${t}: andou em ${d.length} das 8 direções (${d.sort().join(',')})`); }
  if (!sr.byType.centaur?.run) errors.push('centaur: nenhuma amostra galopando (run)');

  // 2. batalha: o lote contra hoplitas e hetairos; a sentinela plantada na frente; no fim uma queda de cada
  await newGame();
  const bat2 = await page.evaluate((LOT2) => {
    const s = window.aoe.session, me = s.local, foe = (me + 1) % s.state.players.length, sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
    const a = window.__area(26, 16), cx = a.x + 13, cy = a.y + 8;
    const A = [];
    LOT2.forEach((t, i) => { const u = tough(sp(me, t, cx - 4.5 + (t === 'sentinel' ? 2.5 : 0), cy - 5 + i * 2)); if (u) { A.push(u); if (t === 'sentinel') window.__put(u, u.x, u.y); } });
    const B = [];
    for (let i = 0; i < 10; i++) B.push(tough(sp(foe, i % 3 === 2 ? 'hetairoi' : 'hoplite', cx + 3 + (i % 2) * 0.9, cy - 5 + i)));
    s.issue({ type: 'attackMove', player: me, ids: ids(A.filter((u) => u.type !== 'sentinel')), x: cx + 6, y: cy });
    s.scheduler.issue({ type: 'attackMove', player: foe, ids: ids(B), x: cx - 6, y: cy });
    window.__armyA = ids(A); window.__armyB = ids(B);
    window.aoe.renderer.revealAll = true;
    return { center: { x: cx, y: cy }, a: A.length, b: B.length };
  }, LOT2);
  console.log('bípedes — batalha:', JSON.stringify(bat2));
  await settle2();
  await page.evaluate(() => { window.aoe.session.paused = false; window.aoe.session.speed = 1; });
  await startSampler([...LOT2, 'hoplite', 'hetairoi']);
  await waitTicks(70);
  await look(bat2.center, 1.0); await shot('bipedes-batalha-z10', 300);
  await waitTicks(30);
  await look(bat2.center, 2.2); await shot('bipedes-batalha-z22', 300);
  await page.evaluate((L) => { window.__fighters2 = L; }, LOT2);
  await waitUntil(() => window.__fighters2.every((t) => window.__stats.byType[t]?.attack), 420);
  const sb = await stopSampler();
  console.log('bípedes — batalha: animações', JSON.stringify(sb.byType), `golpes ok=${sb.hitOk} fora=${sb.hitOff}`);
  if (Object.keys(sb.procedural).length) errors.push(`bípedes — batalha procedural: ${JSON.stringify(sb.procedural)}`);
  for (const t of LOT2) if (!sb.byType[t]?.attack) errors.push(`${t}: nenhuma amostra atacando (${JSON.stringify(sb.byType[t] ?? {})})`);
  for (const t of BOWS) if (!sb.byType[t]?.aim) errors.push(`${t}: nenhuma amostra mirando (aim) entre disparos (${JSON.stringify(sb.byType[t] ?? {})})`);
  { const n = sb.hitOk + sb.hitOff; if (!n) errors.push('bípedes — batalha: nenhum golpe com alvo'); else if (sb.hitOff > 0.1 * n) errors.push(`bípedes — batalha: ${sb.hitOff} de ${n} golpes a 90°+ do alvo (${JSON.stringify(sb.hitSamples)})`); }
  // a Sombra translúcida (corpo a 70 %, sombra no chão a 40 %: unitLook)
  const shadeLook = await page.evaluate(() => { for (const [id, v] of window.aoe.renderer.views) { const u = window.aoe.session.state.units.get(id); if (u?.type === 'shade' && v.unit) return { root: +v.unit.root.alpha.toFixed(2), shadow: +v.unit.shadow.alpha.toFixed(3) }; } return null; });
  console.log('bípedes — Sombra:', JSON.stringify(shadeLook));
  if (!shadeLook || !(shadeLook.root < 0.9)) errors.push(`shade: corpo não translúcido (${JSON.stringify(shadeLook)})`);
  // quedas: vida 1 e um inimigo atacando cada criatura do lote
  await page.evaluate(() => {
    const s = window.aoe.session, seen = new Set(), hunters = window.__armyB.map((id) => s.state.units.get(id)).filter(Boolean);
    let h = 0;
    for (const id of window.__armyA) {
      const u = s.state.units.get(id); if (!u || seen.has(u.type)) continue;
      seen.add(u.type); u.hp = 1;
      const by = hunters[h++ % hunters.length];
      if (by) s.scheduler.issue({ type: 'attack', player: by.owner, ids: [by.id], targetId: u.id });
    }
  });
  await page.evaluate((A) => { window.__watchAll = (o) => A.every((t) => o[t]); }, LOT2);
  await look(bat2.center, 2.2);
  const watch2 = (types, ticks, src) => page.evaluate(([types, ticks, src]) => new Promise((done) => {
    const s = window.aoe.session, R = window.aoe.renderer, end = s.state.tick + ticks, out = {}, f = (0, eval)(`(${src})`);
    const step = () => { for (const [t] of f(R, types)) out[t] = (out[t] ?? 0) + 1; if (s.state.tick >= end || window.__watchAll?.(out)) done(out); else requestAnimationFrame(step); };
    step();
  }), [types, ticks, src]);
  const falls2P = watch2(LOT2, 420, ((R) => { const out = []; for (const uv of R.fx.dyingViews()) if (uv.anim === 'die') out.push([uv.type]); return out; }).toString());
  await page.waitForTimeout(1500);
  await shot('bipedes-queda-z22', 0);
  const falls2 = await falls2P;
  await page.evaluate(() => { window.__watchAll = null; });
  console.log('bípedes — quedas assadas:', JSON.stringify(falls2));
  for (const t of LOT2) if (!falls2[t]) errors.push(`${t}: a morte não saiu assada`);

  // 3. Sentinelas: o poder de Hades faz as estátuas surgirem do chão em volta de um templo (coluna de poeira da Etapa 5)
  await newGame();
  const sen2 = await page.evaluate(() => {
    const s = window.aoe.session, me = s.local, st = s.state;
    const a = window.__area(14, 12);
    const t = window.aoe.debugBuild(me, 'temple', a.x + 5, a.y + 4, 1);
    if (!st.players[me].powers.some((p) => p.id === 'sentinel')) st.players[me].powers.push({ id: 'sentinel', used: false });
    window.aoe.renderer.revealAll = true;
    return { center: { x: a.x + 6.5, y: a.y + 5.5 }, temple: t?.id ?? null };
  });
  await settle2();
  await look(sen2.center, 2.2);
  await page.evaluate((id) => { const s = window.aoe.session; s.issue({ type: 'power', player: s.local, power: 'sentinel', targetId: id }); s.paused = false; }, sen2.temple);
  await waitTicks(8);
  await page.evaluate(() => window.aoe.renderer.art.ready());
  await shot('bipedes-sentinelas-z22', 200);
  const sens = await page.evaluate(() => { let n = 0, baked = 0; for (const [id, v] of window.aoe.renderer.views) { const u = window.aoe.session.state.units.get(id); if (u?.type === 'sentinel') { n++; if (v.unit) baked++; } } return { n, baked }; });
  console.log('bípedes — Sentinelas:', JSON.stringify(sens));
  if (sens.n < 4 || sens.baked < sens.n) errors.push(`sentinel: o poder deu ${sens.n} estátuas, ${sens.baked} assadas`);

  // 4. desfile: o lote parado ao lado do hoplita e do hetairo, diante do templo
  await newGame();
  const LINE2 = ['hoplite', 'cyclops', 'colossus', 'medusa', 'centaur', 'sentinel', 'shade', 'hetairoi'];
  const par2 = await page.evaluate((LINE) => {
    const s = window.aoe.session, me = s.local, sp = window.aoe.debugSpawn, ids = window.__ids;
    const a = window.__area(26, 11);
    window.aoe.debugBuild(me, 'temple', a.x + 12, a.y + 1, 1);
    const cx = a.x + 13, out = LINE.map((type, i) => window.__put(sp(me, type, cx, a.y + 8), cx + (i - (LINE.length - 1) / 2) * 3, a.y + 8));
    s.issue({ type: 'stance', player: me, ids: ids(out), stance: 'passive' });
    window.aoe.renderer.revealAll = true;
    return { center: { x: cx, y: a.y + 6.4 }, n: ids(out).length };
  }, LINE2);
  console.log('bípedes — desfile:', JSON.stringify(par2));
  await settle2();
  await page.evaluate(() => { window.aoe.session.paused = false; });
  await waitTicks(10);
  await page.evaluate(() => { window.aoe.session.paused = true; });
  await look(par2.center, 1.0); await shot('bipedes-desfile-z10');
  await look(par2.center, 2.2); await shot('bipedes-desfile-z22');
  const pd2 = await procedural(LINE2);
  if (Object.keys(pd2).length) errors.push(`bípedes — desfile procedural: ${JSON.stringify(pd2)}`);
  await page.evaluate(() => { window.aoe.settings.bakedArt = false; window.aoe.applyQuality(); });
  await look(par2.center, 1.0); await shot('bipedes-procedural-z10');
  await page.evaluate(() => { window.aoe.settings.bakedArt = true; window.aoe.settings.quality = 'high'; window.aoe.applyQuality(); });
  await page.evaluate((t) => { window.aoe.renderer.art.prewarmUnits(t); return window.aoe.renderer.art.ready(); }, warm2);
  await page.evaluate(() => { window.aoe.session.paused = false; });
  await waitTicks(2);
  await page.evaluate(() => window.aoe.renderer.art.ready());
  await page.evaluate(() => { window.aoe.session.paused = true; });
  await look(par2.center, 2.2); await shot('bipedes-desfile-z22-2x', 2000);
  const pd3 = await procedural(LINE2);
  if (Object.keys(pd3).length) errors.push(`bípedes — desfile procedural no 2×: ${JSON.stringify(pd3)}`);
  const st2 = await page.evaluate(() => ({ ready1: window.aoe.renderer.art.unitsReady(1).join(','), ready2: window.aoe.renderer.art.unitsReady(2).join(',') }));
  for (const t of LOT2) if (!st2.ready2.split(',').includes(t)) errors.push(`${t}: páginas 2× não prontas`);
  await page.evaluate(() => { window.aoe.settings.quality = 'medium'; window.aoe.applyQuality(); });
}

// ------------------------------------------------------------------------------------------------------------------
// 1. roda: as criaturas nas 8 direções
if (scene('roda')) {
await newGame();
const roda = await page.evaluate((MYTH) => {
  const s = window.aoe.session, me = s.local, sp = window.aoe.debugSpawn, ids = window.__ids;
  const a = window.__area(28, 7 * Math.ceil(MYTH.length / 2));
  window.__rodas = MYTH.map((t, i) => {
    const c = { x: a.x + 4 + (i % 2) * 14 + 3.5, y: a.y + 3.5 + Math.floor(i / 2) * 7 };
    const u = window.__put(sp(me, t, c.x, c.y), c.x, c.y);
    if (u) s.issue({ type: 'stance', player: me, ids: [u.id], stance: 'passive' });
    return { c: { x: c.x - 0.5, y: c.y - 0.5 }, ids: ids([u]), r: 3 };
  });
  window.aoe.renderer.revealAll = true;
  return { area: a, center: { x: a.x + 14, y: a.y + 3.5 * Math.ceil(MYTH.length / 2) } };
}, MYTH);
console.log('roda:', JSON.stringify(roda));
await settle();
await startSampler(MYTH);
await startWalking(64);
await look(roda.center, 1.0);
await waitTicks(150);
await shot('roda-z10', 0);
await page.evaluate(([M, R]) => { window.__rodaTypes = M; window.__runners = R; }, [MYTH, RUNNERS]);
await waitUntil(() => { const st = window.__stats; return window.__rodaTypes.every((t) => (st.dirs[t] ?? []).length >= 8) && window.__runners.every((t) => st.byType[t]?.run); }, 14 * 64);
const st1 = await stopSampler();
await page.evaluate(() => { window.__walkStop = true; });
console.log('roda — direções:', JSON.stringify(Object.fromEntries(Object.entries(st1.dirs).map(([t, d]) => [t, d.length]))), 'animações:', JSON.stringify(st1.byType), `dirOk=${st1.dirOk} dirBad=${st1.dirBad} sombra do voo ok=${st1.flyShadow.ok} ruim=${st1.flyShadow.bad}`);
checkDirs(st1, 'roda');
if (Object.keys(st1.procedural).length) errors.push(`roda procedural: ${JSON.stringify(st1.procedural)}`);
for (const t of MYTH) { const d = st1.dirs[t] ?? []; if (d.length < 8) errors.push(`${t}: andou em ${d.length} das 8 direções (${d.sort().join(',')})`); }
for (const t of RUNNERS) if (!st1.byType[t]?.run) errors.push(`${t}: nenhuma amostra galopando (run)`);
if (!st1.byType.pegasus?.walk) errors.push('pegasus: nenhuma amostra voando (walk)');
if (!st1.flyShadow.ok || st1.flyShadow.bad > 0.05 * (st1.flyShadow.ok + st1.flyShadow.bad)) errors.push(`pegasus: sombra do voo fora do pé ou forte demais (${JSON.stringify(st1.flyShadow)})`);
}

// ------------------------------------------------------------------------------------------------------------------
// 2. batalha: criaturas × hoplitas e hetairos, o Pégaso por cima; no fim uma queda de cada
if (scene('batalha')) {
await newGame();
const battle = await page.evaluate((FIGHTERS) => {
  const s = window.aoe.session, me = s.local, foe = (me + 1) % s.state.players.length, sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
  const H = Math.max(12, Math.ceil(FIGHTERS.length * 2.2) + 4), a = window.__area(22, H), cx = a.x + 11, cy = a.y + H / 2;
  const A = [], B = [], y0 = cy - FIGHTERS.length * 1.1;
  FIGHTERS.forEach((t, i) => { for (const k of [0, 1]) A.push(tough(sp(me, t, cx - 3.5, y0 + i * 2.2 + k * 1.1))); });
  const nB = Math.max(8, FIGHTERS.length + 2);
  for (let i = 0; i < nB; i++) B.push(tough(sp(foe, i % 3 === 2 ? 'hetairoi' : 'hoplite', cx + 3.5 + (i % 2) * 0.9, cy - nB / 2 + i)));
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
await page.evaluate((A) => { window.__watchAll = (o) => A.every((t) => o[t]); }, [...FIGHTERS, 'pegasus']);
await look(battle.center, 2.2);
const fallsP = watchFrames([...FIGHTERS, 'pegasus'], 300, ((R) => { const out = []; for (const uv of R.fx.dyingViews()) if (uv.anim === 'die') out.push([uv.type]); return out; }).toString());
await page.waitForTimeout(1500);
await shot('queda-z22', 0);   // no meio das quedas (a queda dura 1,2 s de jogo; o cadáver fica 8 s)
const falls = await fallsP;
await page.evaluate(() => { window.__watchAll = null; });
console.log('quedas assadas:', JSON.stringify(falls));
for (const t of [...FIGHTERS, 'pegasus']) if (!falls[t]) errors.push(`${t}: a morte não saiu assada`);
}

// ------------------------------------------------------------------------------------------------------------------
// 3. hidra: 1–5 cabeças lado a lado (o asset pela entidade) e uma que ganha cabeça no meio da cena
if (scene('hidra')) {
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
}

// ------------------------------------------------------------------------------------------------------------------
// 4. voo: o Pégaso parado no ar e voando sobre o campo
if (scene('voo')) {
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
}

// ------------------------------------------------------------------------------------------------------------------
// 5. desfile: as criaturas paradas ao lado do hoplita e do hetairo, diante do templo
if (scene('desfile')) {
await newGame('large');   // (integração: com as feras a fila tem 28 tiles — no mapa médio o templo não cabia na clareira)
const LINE = ['hoplite', 'minotaur', 'nemean_lion', 'hydra', 'pegasus', 'cerberus', 'chimera', 'manticore', 'hetairoi'];
const parade = await page.evaluate((LINE) => {
  const s = window.aoe.session, st = s.state, me = s.local, sp = window.aoe.debugSpawn, ids = window.__ids;
  const W = Math.max(20, Math.ceil(LINE.length * 2.7) + 4), a = window.__area(W, 10, 20);
  const t = window.aoe.debugBuild(me, 'temple', a.x + Math.floor(W / 2) - 1, a.y + 1, 1);   // (tile inteiro: com a fila das feras W é ímpar)
  const cx = a.x + W / 2, out = LINE.map((type, i) => window.__put(sp(me, type, cx, a.y + 7), cx + (i - (LINE.length - 1) / 2) * 2.7, a.y + 7));
  for (const u of out) if (u?.type === 'hydra') u.heads = 3;
  s.issue({ type: 'stance', player: me, ids: ids(out), stance: 'passive' });
  window.aoe.renderer.revealAll = true;
  return { center: { x: cx, y: a.y + 5.6 }, temple: !!t, n: ids(out).length };
}, LINE);
console.log('desfile:', JSON.stringify(parade));
if (!parade.temple) errors.push('desfile: o templo não coube na clareira');
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
}

// ------------------------------------------------------------------------------------------------------------------
// 6. feras: o sopro da Quimera, a rajada da Mantícora e a matilha de Cérberos (lote feras)
if (scene('feras')) {
  await page.evaluate(() => { window.aoe.settings.quality = 'medium'; window.aoe.applyQuality(); });
  /** Monta uma cena: `mine` do jogador contra `foes` do inimigo (vida alta), em ataque-mover; devolve o centro. */
  const setup = (mine, foes, dist) => page.evaluate(([mine, foes, dist]) => {
    const s = window.aoe.session, me = s.local, foe = (me + 1) % s.state.players.length, sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
    const a = window.__area(20, 12), cx = a.x + 10, cy = a.y + 6;
    const A = mine.map((t, i) => tough(window.__put(sp(me, t, cx - dist / 2, cy - (mine.length - 1) * 0.8 + i * 1.6), cx - dist / 2, cy - (mine.length - 1) * 0.8 + i * 1.6)));
    const B = foes.map((t, i) => tough(window.__put(sp(foe, t, cx + dist / 2, cy - (foes.length - 1) * 0.55 + i * 1.1), cx + dist / 2 + (i % 2) * 0.6, cy - (foes.length - 1) * 0.55 + i * 1.1), 20000));
    s.issue({ type: 'attackMove', player: me, ids: ids(A), x: cx + dist, y: cy });
    s.scheduler.issue({ type: 'stance', player: foe, ids: ids(B), stance: 'passive' });
    window.__feraA = ids(A);
    window.aoe.renderer.revealAll = true;
    return { center: { x: cx + 0.6, y: cy } };
  }, [mine, foes, dist]);
  /** Espera (tempo de jogo) até `cond` e captura no mesmo quadro; devolve o que `probe` leu. */
  const catchMoment = async (cond, probe, name, maxTicks = 400) => {
    await page.evaluate(([src, probeSrc]) => { window.__catch = null; const c = (0, eval)(`(${src})`), pr = (0, eval)(`(${probeSrc})`); window.__watchCatch = () => { if (!window.__catch && c()) { window.__catch = pr(); window.aoe.session.paused = true; } }; const loop = () => { window.__watchCatch?.(); if (!window.__catch) requestAnimationFrame(loop); }; loop(); }, [cond.toString(), probe.toString()]);
    await page.evaluate(() => { window.aoe.session.paused = false; window.aoe.session.speed = 1; });
    await waitUntil(() => !!window.__catch, maxTicks);
    await page.evaluate(() => { window.aoe.session.paused = true; });
    const got = await page.evaluate(() => window.__catch);
    await shot(name, 600);
    return got;
  };
  // 6a. Quimera: o sopro (golpe em área recente + a vista no ataque, quadros 0–2 = a língua de fogo assada)
  await newGame();
  const q = await setup(['chimera', 'chimera'], ['hoplite', 'hoplite', 'hoplite', 'hoplite', 'hoplite'], 3.2);
  await settle();
  await look(q.center, 2.2);
  const breath = await catchMoment(
    () => { const s = window.aoe.session, R = window.aoe.renderer; return window.__feraA.some((id) => { const v = R.views.get(id); return v?.unit && v.unit.anim === 'attack' && v.unit.shownFrame >= 1 && v.unit.shownFrame <= 2; }) && s.state.effects.some((e) => e.type === 'splash'); },
    () => { const R = window.aoe.renderer; return { views: window.__feraA.map((id) => { const v = R.views.get(id); return v?.unit ? { art: v.unit.art.id, anim: v.unit.anim, frame: v.unit.shownFrame } : null; }), particles: R.fx.particles.count ?? null }; },
    'feras-sopro-z22');
  console.log('sopro da Quimera:', JSON.stringify(breath));
  if (!breath) errors.push('chimera: nenhum sopro (ataque no quadro da língua de fogo com golpe em área) capturado');
  else if (breath.views.some((v) => !v)) errors.push(`chimera procedural no sopro: ${JSON.stringify(breath.views)}`);
  // 6b. Mantícora: a rajada de espinhos no ar e a mira entre os disparos
  await newGame();
  const mt = await setup(['manticore', 'manticore'], ['hoplite', 'hoplite', 'hoplite', 'hoplite'], 4.5);
  await settle();
  await startSampler(['manticore']);
  await look(mt.center, 2.2);
  const volley = await catchMoment(
    () => window.aoe.session.state.effects.some((e) => e.type === 'projectile' && e.src === 'manticore' && e.ttl < e.total - 1),
    () => ({ spikes: window.aoe.session.state.effects.filter((e) => e.type === 'projectile' && e.src === 'manticore').length }),
    'feras-espinhos-z22');
  await page.evaluate(() => { window.aoe.session.paused = false; });
  await waitUntil(() => window.__stats.byType.manticore?.aim && window.__stats.byType.manticore?.attack, 300);
  const stM = await stopSampler();
  await page.evaluate(() => { window.aoe.session.paused = true; });
  console.log('rajada da Mantícora:', JSON.stringify(volley), 'animações:', JSON.stringify(stM.byType.manticore ?? {}));
  if (!volley?.spikes) errors.push('manticore: nenhum espinho no ar');
  if (!stM.byType.manticore?.aim || !stM.byType.manticore?.attack) errors.push(`manticore: sem atirar/mirar (${JSON.stringify(stM.byType.manticore ?? {})})`);
  if (Object.keys(stM.procedural).length) errors.push(`manticore procedural: ${JSON.stringify(stM.procedural)}`);
  // 6c. Cérbero: a matilha mordendo
  await newGame();
  const cb = await setup(['cerberus', 'cerberus', 'cerberus'], ['hoplite', 'hoplite', 'hetairoi', 'hoplite', 'hoplite'], 3.2);
  await settle();
  await look(cb.center, 2.2);
  const bite = await catchMoment(
    () => { const R = window.aoe.renderer; return window.__feraA.filter((id) => R.views.get(id)?.unit?.anim === 'attack').length >= 2; },
    () => { const R = window.aoe.renderer; return window.__feraA.map((id) => { const v = R.views.get(id); return v?.unit ? `${v.unit.art.id}:${v.unit.anim}` : 'procedural'; }); },
    'feras-cerbero-z22');
  console.log('matilha de Cérberos:', JSON.stringify(bite));
  if (!bite) errors.push('cerberus: a matilha não atacou');
  else if (bite.includes('procedural')) errors.push(`cerberus procedural: ${JSON.stringify(bite)}`);
}

// ------------------------------------------------------------------------------------------------------------------
// 7. titãs (lote titãs): ascensão, roda, batalha, queda e desfile
if (scene('titas')) {
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

// 6e. (integração) Portal dos Titãs em obra, sem titã vivo: as páginas do titã do deus sobem pelo `warmTitans` e ficam
// (a liberação por tipo das páginas próprias não pode soltá-las a cada 20 s enquanto o portal as pede)
await newGame();
await settle();
const gateObra = await page.evaluate(() => {
  const s = window.aoe.session, me = s.local, a = window.__area(12, 10, 18);
  const g = window.aoe.debugBuild(me, 'titan_gate', a.x + 3, a.y + 2, 0.3);
  window.aoe.renderer.revealAll = true;
  window.__readySeq = [];
  window.__sampleStop = false;
  let last = -1;
  const f = () => { if (window.__sampleStop) return; requestAnimationFrame(f); const t = s.state.tick; if (t === last) return; last = t; window.__readySeq.push(window.aoe.renderer.art.unitsReady(1).includes('prometheus') ? 1 : 0); };
  f();
  s.paused = false; s.speed = 3;
  return { gate: !!g, center: { x: a.x + 5.5, y: a.y + 4.5 } };
});
await look(gateObra.center, 1.0);
await waitTicks(700);
const readySeq = await page.evaluate(() => { window.__sampleStop = true; const s = window.aoe.session; s.paused = true; s.speed = 1; return window.__readySeq; });
const firstReady = readySeq.indexOf(1), drops = readySeq.slice(Math.max(0, firstReady)).filter((v) => v === 0).length;
console.log(`titãs — portal em obra: páginas de Prometeu prontas a partir da amostra ${firstReady} de ${readySeq.length}, ${drops} amostras sem elas depois`);
if (!gateObra.gate) errors.push('titãs: portal em obra não colocado');
if (firstReady < 0 || drops > 0) errors.push(`titãs: com o Portal dos Titãs em obra as páginas de Prometeu não ficaram residentes (primeira ${firstReady}, ${drops} amostras sem elas em ${readySeq.length})`);
}

// ------------------------------------------------------------------------------------------------------------------
// Integração da Etapa 6: o bestiário (as 16 lado a lado) e a batalha mista mítica × humana
const ALL_MYTH = ['minotaur', 'nemean_lion', 'pegasus', 'hydra', 'cerberus', 'chimera', 'manticore', 'cyclops', 'colossus', 'medusa', 'centaur', 'sentinel', 'shade'];
const ALL_TITANS = ['prometheus', 'oceanus', 'cronus'];
/** Pede as páginas destes tipos (e das variantes da hidra) e espera subirem: a cena não mede a primeira vista. */
const warmAll = (types) => page.evaluate((t) => { window.aoe.renderer.art.prewarmUnits(t); return window.aoe.renderer.art.ready(); }, types);

// bestiário: 3 fileiras diante do templo — atrás os titãs e o colosso, no meio as míticas grandes, na frente o hoplita e as
// menores; cabe a zoom 2,2 (≈ 20 × 12 tiles na janela de 1440 × 900)
if (scene('bestiario')) {
  await newGame('large');   // (mapa grande: uma clareira sem nós nem árvores para as 3 fileiras)
  const ROWS = [
    { dy: 0, gap: 4.1, types: ['cronus', 'prometheus', '@temple', 'oceanus', 'colossus'] },
    { dy: 3.6, gap: 2.75, types: ['cyclops', 'minotaur', 'centaur', 'medusa', 'pegasus', 'chimera', 'hydra'] },
    { dy: 6.6, gap: 3.1, types: ['hoplite', 'nemean_lion', 'cerberus', 'manticore', 'sentinel', 'shade'] },
  ];
  const best = await page.evaluate((ROWS) => {
    const s = window.aoe.session, me = s.local, sp = window.aoe.debugSpawn, ids = window.__ids;
    const a = window.__area(26, 15, 20), cx = a.x + 13, y0 = a.y + 4.5;
    const out = [];
    let temple = false;
    for (const row of ROWS) row.types.forEach((t, i) => {
      const x = cx + (i - (row.types.length - 1) / 2) * row.gap, y = y0 + row.dy;
      if (t === '@temple') { temple = !!window.aoe.debugBuild(me, 'temple', Math.round(x - 1.5), Math.round(y - 2), 1); return; }
      const u = window.__put(sp(me, t, x, y), x, y);
      if (!u) return;
      if (t === 'hydra') u.heads = 3;
      u.spawnTick = 0;   // (os titãs já em pé: sem a ascensão)
      out.push(u);
    });
    s.issue({ type: 'stance', player: me, ids: ids(out), stance: 'passive' });
    window.__bestIds = ids(out);
    window.aoe.renderer.revealAll = true;
    return { center: { x: cx, y: y0 + 2.2 }, n: out.length, temple, types: out.map((u) => u.type) };
  }, ROWS);
  console.log('bestiário:', JSON.stringify(best));
  if (best.n !== 17 || !best.temple) errors.push(`bestiário: ${best.n} de 17 unidades, templo ${best.temple}`);
  await settle();
  await warmAll([...ALL_MYTH, ...ALL_TITANS, 'hydra_heads3']);
  await page.evaluate(() => { window.aoe.session.paused = false; });
  await waitTicks(6);
  // todos virados para SE (3/4, a vista que mostra o corpo inteiro): a direção da VISTA, parada, fica até a unidade andar
  await look(best.center, 1.0);   // (as vistas só existem para quem está na tela)
  await page.waitForTimeout(500);
  await page.evaluate(() => { for (const id of window.__bestIds) { const v = window.aoe.renderer.views.get(id); if (v?.unit) v.unit.dir = 1; } });
  await waitTicks(2);
  const dirsB = await page.evaluate(() => { window.aoe.session.paused = true; return window.__bestIds.map((id) => { const v = window.aoe.renderer.views.get(id); return v ? (v.unit ? v.unit.dir : 'p') : `x${id}`; }); });
  console.log('bestiário — direções das vistas:', dirsB.join(','));
  await look(best.center, 1.0); await shot('bestiario-z10');
  await look(best.center, 2.2); await shot('bestiario-z22');
  const procB = await procedural([...ALL_MYTH, ...ALL_TITANS, 'hoplite']);
  if (Object.keys(procB).length) errors.push(`bestiário procedural: ${JSON.stringify(procB)}`);
  const artB = await page.evaluate(() => window.__bestIds.map((id) => { const v = window.aoe.renderer.views.get(id); return v?.unit ? v.unit.art.id : `${v?.type}:procedural`; }));
  console.log('bestiário — assets:', artB.join(','));
}

// batalha mista: míticas (e um titã) × exército humano, ataque-mover de um lado contra o outro
if (scene('mista')) {
  await newGame();
  const MYTH_SIDE = ['minotaur', 'nemean_lion', 'hydra', 'cerberus', 'chimera', 'manticore', 'cyclops', 'colossus', 'medusa', 'centaur', 'shade', 'pegasus'];
  const HUMANS = ['hoplite', 'hoplite', 'hoplite', 'hoplite', 'hypaspist', 'hypaspist', 'myrmidon', 'toxotes', 'toxotes', 'toxotes', 'peltast', 'peltast', 'cretan_archer', 'hetairoi', 'hetairoi', 'hippeus', 'achilles', 'heracles', 'petrobolos', 'petrobolos'];
  const mix = await page.evaluate(([MY, HU]) => {
    const s = window.aoe.session, me = s.local, foe = (me + 1) % s.state.players.length, sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
    const a = window.__area(30, 18, 18), cx = a.x + 15, cy = a.y + 9;
    const A = MY.map((t, i) => { const u = tough(sp(me, t, cx - 5 - (i % 2) * 1.6, cy - 7.5 + i * 1.3), 8000); if (u && t === 'hydra') u.heads = 3; return u; });
    const titan = tough(sp(me, 'cronus', cx - 9, cy), 30000); if (titan) titan.spawnTick = 0;
    const sent = window.__put(tough(sp(me, 'sentinel', cx - 3, cy + 5.5), 8000), cx - 3, cy + 5.5);
    const B = HU.map((t, i) => tough(sp(foe, t, cx + 4 + (i % 3) * 1.1, cy - 8 + Math.floor(i / 3) * 2.4 + (i % 3) * 0.5), 5000));
    s.issue({ type: 'attackMove', player: me, ids: ids([...A, titan]), x: cx + 8, y: cy });
    s.scheduler.issue({ type: 'attackMove', player: foe, ids: ids(B), x: cx - 8, y: cy });
    window.__mixA = ids([...A, titan, sent]); window.__mixB = ids(B);
    window.aoe.renderer.revealAll = true;
    return { center: { x: cx, y: cy }, a: window.__mixA.length, b: B.filter(Boolean).length };
  }, [MYTH_SIDE, HUMANS]);
  console.log('batalha mista:', JSON.stringify(mix));
  await settle();
  await warmAll([...ALL_MYTH, 'hydra_heads3', 'cronus', ...new Set(HUMANS)]);
  const texMix = await page.evaluate(() => window.aoe.perf.snapshot().textureMB);
  const all = [...MYTH_SIDE, 'sentinel', 'cronus', ...new Set(HUMANS)];
  await page.evaluate(() => { window.aoe.session.paused = false; window.aoe.session.speed = 1; });
  await startSampler(all);
  await waitTicks(90);
  await page.evaluate(() => { window.aoe.session.paused = true; });
  await look(mix.center, 1.0); await shot('batalha-mista-z10', 300);
  // z 2,2 no meio da luta: o centro das unidades das duas linhas que estão atacando (a média dos que lutam)
  const hot = await page.evaluate(() => { const s = window.aoe.session, R = window.aoe.renderer; let x = 0, y = 0, n = 0; for (const id of [...window.__mixA, ...window.__mixB]) { const u = s.state.units.get(id), v = R.views.get(id); if (u && v?.unit?.anim === 'attack' && u.type !== 'sentinel') { x += u.x; y += u.y; n++; } } return n ? { x: x / n, y: y / n, n } : null; });
  await look(hot ?? mix.center, 2.2); await shot('batalha-mista-z22', 300);
  await page.evaluate(() => { window.aoe.session.paused = false; });
  const fightersM = [...MYTH_SIDE.filter((t) => t !== 'pegasus'), 'sentinel', 'cronus'];
  await page.evaluate((F) => { window.__fighters = F; }, fightersM);
  await waitUntil(() => window.__fighters.every((t) => window.__stats.byType[t]?.attack), 500);
  const stX = await stopSampler();
  await page.evaluate(() => { window.aoe.session.paused = true; });
  console.log('batalha mista — animações:', JSON.stringify(stX.byType), `golpes ok=${stX.hitOk} fora=${stX.hitOff}`, `VRAM de textura com todos carregados: ${texMix} MB`);
  if (Object.keys(stX.procedural).length) errors.push(`batalha mista procedural: ${JSON.stringify(stX.procedural)}`);
  for (const t of fightersM) if (!stX.byType[t]?.attack) errors.push(`mista: ${t} sem amostra atacando (${JSON.stringify(stX.byType[t] ?? {})})`);
  { const n = stX.hitOk + stX.hitOff; if (!n) errors.push('mista: nenhum golpe com alvo'); else if (stX.hitOff > 0.1 * n) errors.push(`mista: ${stX.hitOff} de ${n} golpes a 90°+ do alvo (${JSON.stringify(stX.hitSamples)})`); }
}

console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
if (errors.length) process.exit(1);
