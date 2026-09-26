// Cenas de efeitos da Etapa 5 (docs/ART.md §1.9 e Apêndice F): partidas montadas (semente 42, 1 IA fácil, mapa médio,
// numa clareira longe do Centro Cívico), mapa revelado só no renderizador, HUD oculto, idas e esperas no TEMPO DE JOGO.
//  1. combate: hoplitas × hoplitas no corpo a corpo (faíscas no bronze), toxotas e peltastas atirando flechas e dardos
//     (arco com sombra no chão, orientação pela velocidade), petróbolos bombardeando uma casa (pedra rolando, poeira,
//     lascas e marca de impacto) → <prefixo>-combate-{z10,z22}.png e o mesmo com a arte desligada (atlas procedural de
//     reserva) → <prefixo>-procedural-z13.png;
//  2. marcha: coluna de hoplitas, hipeus galopando e cerco rodando — poeira dos pés, cascos e rodas → -marcha-z13.png;
//  3. cerco: quartel muito danificado (fogo em flipbook + fumaça), casa danificada (fumaça), pedras caindo e uma casa
//     desabando (poeira, escombros no chão) → -cerco-z13.png;
//  4. poderes (1ª versão da base; o lote de poderes refina): cada um dos 12 poderes e a Q de um herói, o surgimento de
//     um titã (titanRise), a partir de uma cena montada → -poder-<id>.png;
//  5. luz: o ciclo de luz ligado (opção), no amanhecer e no entardecer → -luz-{amanhecer,entardecer}.png;
//  6. orçamento: batalha grande (60 × 60, metade à distância) no preset alto — o pico de partículas não passa de 2 000
//     e nenhum efeito do núcleo fica sem handler.
// Falha se houver erro de página, efeito sem handler (`fx.unknown`), partículas acima do orçamento, se a arte `fx`
// assada não for servida, se faltarem projéteis, faíscas, poeira, fogo, decalques ou o arco dos projéteis.
// Exige `npm run preview` (ou a URL). Uso: node scripts/artfx.mjs [url] [--out docs/art] [--prefix etapa5] [--only combate,poderes]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const url = pos[0] ?? 'http://localhost:4173/';
const outDir = opt('--out', 'docs/art');
const prefix = opt('--prefix', 'etapa5');
const only = opt('--only', '').split(',').filter(Boolean);
const want = (s) => !only.length || only.includes(s);
mkdirSync(outDir, { recursive: true });
const SEED = 42;
const errors = [];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && m.text().includes('[efeitos]'))) errors.push(m.text()); });
await page.addInitScript(() => { try { const k = 'aoe_settings_v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), edgeScroll: false, quality: 'medium', bakedArt: true, showFps: false, dayCycle: false })); } catch { /* ignore */ } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.mouse.move(720, 450);

const look = (p, zoom) => page.evaluate(([x, y, z]) => { const c = window.aoe.renderer.cam; c.zoom = z; c.centerOn(x, y); }, [p.x, p.y, zoom]);
const shot = async (name) => { await page.waitForTimeout(250); const f = join(outDir, `${prefix}-${name}.png`); await page.screenshot({ path: f }); console.log('captura:', f); return f; };
const tickNow = () => page.evaluate(() => window.aoe.session.state.tick);
async function waitTicks(n, timeout = 240000) {
  const t = (await tickNow()) + n;
  await page.waitForFunction((t) => window.aoe.session.state.tick >= t, t, { timeout, polling: 50 });
}
const run = (speed = 1) => page.evaluate((sp) => { window.aoe.session.paused = false; window.aoe.session.speed = sp; }, speed);
const pause = () => page.evaluate(() => { window.aoe.session.paused = true; });
const stats = () => page.evaluate(() => window.aoe.renderer.fx.stats());
const setQuality = (q, baked = true) => page.evaluate(([q, b]) => { const s = window.aoe.settings; s.quality = q; s.bakedArt = b; window.aoe.applyQuality(); return window.aoe.renderer.art.ready(); }, [q, baked]);

/** Partida nova pausada, HUD oculto, com as funções de apoio da cena (área livre longe do Centro Cívico etc.). */
async function newGame(types = []) {
  await page.evaluate((seed) => {
    const players = [{ name: 'Jogador', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'Leônidas (IA)', god: 'poseidon', isAI: true, difficulty: 'easy', team: 1 }];
    window.aoe.startGame({ seed, mapSize: 'medium', players, revealMap: false, mode: 'conquest', mapType: 'continental' });
    window.aoe.session.paused = true;
    const h = document.getElementById('hud'); if (h) h.style.visibility = 'hidden';
  }, SEED);
  await page.evaluate(() => {
    const s = window.aoe.session, map = s.state.map;
    window.__open = (x, y) => { if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false; const i = y * map.w + x; return !map.blocked[i] && map.nodeAt[i] === -1 && map.buildingAt[i] === -1 && map.terrain[i] !== 1 && map.terrain[i] !== 2 && map.terrain[i] !== 5; };
    window.__area = (w, h, { minTc = 14, mx = 23, my = 15, skip = [], preferSoil = false } = {}) => {
      const tcs = [...s.state.buildings.values()].filter((b) => b.type === 'town_center');
      const tc = tcs.find((b) => b.owner === s.local);
      let area = null, best = -Infinity;
      for (let y0 = 3; y0 + h <= map.h - 3; y0++) for (let x0 = 3; x0 + w <= map.w - 3; x0++) {
        const cx = x0 + w / 2, cy = y0 + h / 2, d = Math.sqrt((cx - tc.x) ** 2 + (cy - tc.y) ** 2);
        if (cx < mx || cx > map.w - mx || cy < my || cy > map.h - my) continue;
        if (tcs.some((b) => Math.sqrt((cx - b.x) ** 2 + (cy - b.y) ** 2) < minTc + Math.max(w, h) / 2)) continue;
        if (skip.some((a) => x0 < a.x + a.w + 4 && x0 + w + 4 > a.x && y0 < a.y + a.h + 4 && y0 + h + 4 > a.y)) continue;
        let free = 0, soil = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (window.__open(x, y)) { free++; const t = map.terrain[y * map.w + x]; if (t === 3 || t === 4) soil++; }
        if (preferSoil && free < 0.93 * w * h) continue;   // a marcha precisa do caminho livre (sem água no meio)
        const score = 4 * free + (preferSoil ? soil : 0) - d / 8;
        if (score > best) { best = score; area = { x: x0, y: y0, w, h, free, of: w * h }; }
      }
      return area;
    };
    window.__ids = (list) => list.filter(Boolean).map((u) => u.id);
    // edifício pronto no tile livre mais perto de (x, y) (espiral até 6 tiles); frac < 1 = em obra
    window.__build = (owner, type, x, y, frac = 1) => {
      for (let r = 0; r <= 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const b = window.aoe.debugBuild(owner, type, Math.floor(x) + dx, Math.floor(y) + dy, frac);
        if (b) return b;
      }
      return null;
    };
    window.__tough = (u, hp = 4000) => { if (u) { u.hp = u.maxHp = hp; } return u; };
    window.aoe.renderer.revealAll = true;
  });
  await page.evaluate((t) => { window.aoe.renderer.art.prewarmUnits(t); return window.aoe.renderer.art.ready(); }, types);
}
async function settle(types) {
  await page.waitForTimeout(200);
  await page.evaluate(() => window.aoe.applyQuality());
  await page.evaluate((t) => { window.aoe.renderer.art.prewarmUnits(t); return window.aoe.renderer.art.ready(); }, types);
}
/** Amostrador: a cada tick de jogo, projéteis vistos (e o arco: a altura do sprite acima do chão), partículas por mistura
 *  e família, decalques e o pico. */
async function startSampler() {
  await page.evaluate(() => {
    const S = window.__fx = { ticks: 0, proj: 0, projKinds: {}, arcOk: 0, arcBad: 0, add: 0, dust: 0, fire: 0, smoke: 0, decals: 0, peak: 0, types: {} };
    let last = -1;
    window.__fxStop = false;
    const loop = () => {
      const s = window.aoe.session, R = window.aoe.renderer; if (!s || window.__fxStop) return;
      requestAnimationFrame(loop);
      if (s.state.tick === last) return;
      last = s.state.tick; S.ticks++;
      const fx = R.fx, ps = fx.particles;
      for (const e of s.state.effects) S.types[e.type] = (S.types[e.type] ?? 0) + 1;
      for (const [e, inst] of fx.live) {
        if (e.type !== 'projectile' || !inst.s?.body?.visible) continue;
        S.proj++; S.projKinds[inst.s.kind] = (S.projKinds[inst.s.kind] ?? 0) + 1;
        // no meio do voo o sprite fica ACIMA do ponto do chão (arco) e a sombra abaixo-à-direita dele
        const p = (fx.frame.clock - inst.t0) / (e.total / 20);
        if (p > 0.3 && p < 0.7 && inst.s.shadow) {
          const gy = (e.y + (e.ty - e.y) * p) * 32;
          if (inst.s.body.y < gy - 1 && inst.s.shadow.y > inst.s.body.y && inst.s.shadow.x >= inst.s.body.x - 0.5) S.arcOk++; else S.arcBad++;
        }
      }
      S.add = Math.max(S.add, ps.add.particleChildren.length);
      S.dust = Math.max(S.dust, ps.groupCount('dust'));
      S.fire = Math.max(S.fire, ps.groupCount('fire'));
      S.smoke = Math.max(S.smoke, ps.groupCount('smoke'));
      S.decals = Math.max(S.decals, fx.decals.count);
      S.peak = Math.max(S.peak, ps.count);
    };
    loop();
  });
}
const stopSampler = () => page.evaluate(() => { window.__fxStop = true; return window.__fx; });
const need = (cond, msg) => { if (!cond) errors.push(msg); };
const checkFx = async (label) => {
  const s = await stats();
  need(s.unknown === 0, `${label}: ${s.unknown} efeito(s) sem handler`);
  need(s.peak <= s.budget, `${label}: pico de ${s.peak} partículas > orçamento ${s.budget}`);
  return s;
};

// ------------------------------------------------------------------------------------------------------------------
// 1. combate
const COMBAT_TYPES = ['hoplite', 'toxotes', 'peltast', 'petrobolos', 'hypaspist'];
async function combatScene() {
  await newGame(COMBAT_TYPES);
  const c = await page.evaluate(() => {
    const s = window.aoe.session, st = s.state, me = s.local, foe = (me + 1) % st.players.length;
    const sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
    const A = window.__area(30, 14);
    const cx = A.x + 15, cy = A.y + 7;
    const mine = [], theirs = [], rangedA = [], rangedB = [];
    for (let i = 0; i < 8; i++) { mine.push(tough(sp(me, i % 2 ? 'hypaspist' : 'hoplite', cx - 3, cy - 3.5 + i))); theirs.push(tough(sp(foe, 'hoplite', cx + 3, cy - 3.5 + i))); }
    for (let i = 0; i < 6; i++) { rangedA.push(tough(sp(me, 'toxotes', cx - 9, cy - 3 + i * 1.2))); rangedB.push(tough(sp(foe, 'toxotes', cx + 9, cy - 3 + i * 1.2))); }
    for (let i = 0; i < 4; i++) rangedA.push(tough(sp(me, 'peltast', cx - 6, cy - 2 + i * 1.4)));
    // petróbolos ao sul da linha, a ≈ 6 tiles de uma casa inimiga (alcance 7): as pedras voam desde o começo
    const cats = [tough(sp(me, 'petrobolos', cx - 12, cy + 5)), tough(sp(me, 'petrobolos', cx - 11, cy + 7))];
    const house = window.__build(foe, 'house', cx - 6, cy + 5);
    if (house) { house.hp = house.maxHp = 60000; }
    s.issue({ type: 'attackMove', player: me, ids: ids([...mine, ...rangedA]), x: cx + 6, y: cy });
    s.scheduler.issue({ type: 'attackMove', player: foe, ids: ids([...theirs, ...rangedB]), x: cx - 6, y: cy });
    if (house) s.issue({ type: 'attack', player: me, ids: ids(cats), targetId: house.id });
    return { A, c: { x: cx, y: cy }, house: house?.id ?? null, units: st.units.size };
  });
  console.log('combate:', JSON.stringify(c));
  await settle(COMBAT_TYPES);
  return c;
}
if (want('combate')) {
  const c = await combatScene();
  await startSampler();
  await run(1);
  await look(c.c, 1.0);
  await waitTicks(70);
  await pause(); await shot('combate-z10');
  await look({ x: c.c.x + 1, y: c.c.y }, 2.2);
  await run(1); await waitTicks(14); await pause(); await shot('combate-z22');
  await run(1); await waitTicks(40);
  const S = await stopSampler(); await pause();
  const st = await checkFx('combate');
  console.log('combate fx:', JSON.stringify({ ...S, types: undefined }), JSON.stringify(st), 'tipos:', JSON.stringify(S.types));
  need(S.proj > 0 && S.projKinds.arrow > 0, 'combate: nenhuma flecha em voo');
  need(S.projKinds.javelin > 0, 'combate: nenhum dardo dos peltastas');
  need(S.projKinds.stone > 0, 'combate: nenhuma pedra dos petróbolos');
  need(S.arcOk > 0 && S.arcBad <= 0.05 * (S.arcOk + S.arcBad), `combate: arco dos projéteis incoerente (${S.arcBad} de ${S.arcOk + S.arcBad})`);
  need(S.add > 0, 'combate: nenhuma faísca (partícula aditiva)');
  need(S.decals > 0, 'combate: nenhuma marca de impacto no chão');
  need(st.source === 'baked', `combate: atlas fx não servido (${st.source})`);
  // a mesma cena com a arte desligada: o atlas procedural de reserva
  const c2 = await combatScene();
  await setQuality('medium', false);
  await run(1); await look(c2.c, 1.3); await waitTicks(70); await pause();
  await shot('procedural-z13');
  const sp = await checkFx('procedural');
  need(sp.source === 'fallback', `procedural: fonte ${sp.source} (esperado fallback)`);
  need(sp.particles > 0, 'procedural: sem partículas');
  await setQuality('medium', true);
}

// ------------------------------------------------------------------------------------------------------------------
// 2. marcha: poeira dos pés, cascos e rodas
if (want('marcha')) {
  const T = ['hoplite', 'hippeus', 'helepolis', 'petrobolos'];
  await newGame(T);
  const m = await page.evaluate(() => {
    const s = window.aoe.session, st = s.state, me = s.local;
    const sp = window.aoe.debugSpawn, ids = window.__ids;
    const A = window.__area(34, 12, { preferSoil: true }) ?? window.__area(34, 12);
    const y = A.y + 6, x0 = A.x + 3;
    const foot = [], horse = [], siege = [];
    for (let i = 0; i < 12; i++) foot.push(sp(me, 'hoplite', x0 + (i % 4) * 0.9, y - 2.5 + Math.floor(i / 4) * 0.9));
    for (let i = 0; i < 5; i++) horse.push(sp(me, 'hippeus', x0 - 1, y + 1.5 + i * 0.9));
    siege.push(sp(me, 'helepolis', x0 + 2, y + 4.2), sp(me, 'petrobolos', x0 - 1, y + 4.2));
    s.issue({ type: 'move', player: me, ids: ids(foot), x: x0 + 28, y: y - 1.5 });
    s.issue({ type: 'move', player: me, ids: ids(horse), x: x0 + 30, y: y + 3 });
    s.issue({ type: 'move', player: me, ids: ids(siege), x: x0 + 26, y: y + 4.5 });
    return { A, c: { x: x0 + 12, y: y + 1 } };
  });
  await settle(T);
  await startSampler();
  // a câmera acompanha a coluna (a poeira só sai do que está na tela)
  const follow = () => page.evaluate(() => { const s = window.aoe.session; let x = 0, y = 0, n = 0; for (const u of s.state.units.values()) if (u.owner === s.local && u.type === 'hoplite' && u.x > 0) { x += u.x; y += u.y; n++; } const c = window.aoe.renderer.cam; c.zoom = 1.3; c.centerOn(x / n + 3, y / n + 2); });
  await follow(); await run(1);
  for (let i = 0; i < 4; i++) { await waitTicks(12); await follow(); }
  await pause();
  await shot('marcha-z13');
  const S = await stopSampler();
  await checkFx('marcha');
  console.log('marcha fx:', JSON.stringify({ dust: S.dust, peak: S.peak }));
  need(S.dust > 0, 'marcha: nenhuma poeira de pés/cascos/rodas');
  void m;
}

// ------------------------------------------------------------------------------------------------------------------
// 3. cerco: fogo, fumaça, pedras, desabamento
if (want('cerco')) {
  const T = ['petrobolos', 'hoplite'];
  await newGame(T);
  const c = await page.evaluate(() => {
    const s = window.aoe.session, st = s.state, me = s.local, foe = (me + 1) % st.players.length;
    const sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
    const A = window.__area(28, 14);
    const cx = A.x + 16, cy = A.y + 6;
    const bar = window.__build(foe, 'barracks', cx - 1, cy - 2);
    if (bar) { bar.maxHp = 60000; bar.hp = 60000 * 0.2; }
    const house = window.__build(foe, 'house', cx + 4, cy - 2);
    if (house) house.hp = house.maxHp * 0.5;
    const doomed = window.__build(foe, 'house', cx + 3, cy + 3);
    const cats = [tough(sp(me, 'petrobolos', cx - 10, cy - 2)), tough(sp(me, 'petrobolos', cx - 10, cy + 1)), tough(sp(me, 'petrobolos', cx - 9, cy + 4))];
    if (bar) s.issue({ type: 'attack', player: me, ids: ids(cats), targetId: bar.id });
    return { c: { x: cx + 1, y: cy + 1 }, doomed: doomed?.id ?? null, bar: bar?.id ?? null };
  });
  await settle(T);
  await startSampler();
  await look(c.c, 1.3);
  await run(1); await waitTicks(60);
  if (c.doomed) await page.evaluate((id) => window.aoe.debugDestroy(id), c.doomed);
  await waitTicks(12); await pause();
  await shot('cerco-z13');
  const S = await stopSampler();
  await checkFx('cerco');
  console.log('cerco fx:', JSON.stringify({ fire: S.fire, smoke: S.smoke, decals: S.decals, stones: S.projKinds.stone ?? 0, peak: S.peak }));
  need(S.fire > 0, 'cerco: sem fogo no quartel muito danificado');
  need(S.smoke > 0, 'cerco: sem fumaça nos edifícios danificados');
  need(S.decals > 0, 'cerco: sem decalques (impacto/escombros)');
}

// ------------------------------------------------------------------------------------------------------------------
// 4. poderes (1ª versão) e a Q de um herói, o titã saindo do portal
if (want('poderes')) {
  const T = ['hoplite', 'toxotes', 'heracles', 'villager'];
  await newGame(T);
  const P = await page.evaluate(() => {
    const s = window.aoe.session, st = s.state, me = s.local, foe = (me + 1) % st.players.length;
    const sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
    const A = window.__area(30, 16);
    const cx = A.x + 15, cy = A.y + 8;
    st.players[me].powers = ['bolt', 'lure', 'sentinel', 'restoration', 'ceasefire', 'pestilence', 'oracle', 'bronze', 'curse', 'lightning_storm', 'plenty', 'earthquake'].map((id) => ({ id, used: false }));
    st.players[me].age = 3;
    const foes = [], friends = [];
    for (let i = 0; i < 10; i++) foes.push(tough(sp(foe, i % 3 ? 'hoplite' : 'toxotes', cx + 4 + (i % 4) * 0.9, cy - 2 + Math.floor(i / 4) * 1.1), 400));
    for (let i = 0; i < 8; i++) { const u = sp(me, 'hoplite', cx - 5 + (i % 4) * 0.9, cy - 1 + Math.floor(i / 4) * 1.1); if (u) { u.hp = u.maxHp * 0.3; friends.push(u); } }
    const hero = sp(me, 'heracles', cx - 2, cy + 3);
    const bar = window.__build(foe, 'barracks', cx + 6, cy + 3);
    const tower = window.__build(foe, 'tower', cx + 10, cy - 3);
    const mine = window.__build(me, 'house', cx - 9, cy + 3);
    s.issue({ type: 'stance', player: me, ids: ids([...friends, hero]), stance: 'passive' });
    s.scheduler.issue({ type: 'stance', player: foe, ids: ids(foes), stance: 'passive' });
    return { c: { x: cx, y: cy }, foe: foes.map((u) => u?.id), friends: ids(friends), hero: hero?.id ?? null, bar: bar?.id ?? null, tower: tower?.id ?? null, house: mine?.id ?? null, tc: (() => { const b = [...st.buildings.values()].find((b) => b.owner === me && b.type === 'town_center'); return b ? { x: b.x, y: b.y } : null; })() };
  });
  await settle(T);
  const use = (power, extra) => page.evaluate(([power, extra]) => { const s = window.aoe.session; s.issue({ type: 'power', player: s.local, power, ...extra }); }, [power, extra]);
  const foeAt = (i) => page.evaluate((id) => { const u = window.aoe.session.state.units.get(id); return u ? { x: u.x, y: u.y, id } : null; }, P.foe[i]);
  const powerShot = async (id, extra, ticks, at = P.c, zoom = 1.0) => {
    await look(at, zoom);
    await use(id, extra);
    await run(1); await waitTicks(ticks); await pause();
    await shot(`poder-${id}`);
    const st = await checkFx(`poder ${id}`);
    const used = await page.evaluate((id) => window.aoe.session.state.players[window.aoe.session.local].powers.find((p) => p.id === id)?.used, id);
    need(used, `poder ${id}: não foi usado (comando recusado)`);
    return st;
  };
  const f0 = await foeAt(0);
  await powerShot('bolt', { targetId: f0?.id }, 3, f0 ?? P.c);
  await powerShot('restoration', { x: P.c.x - 4, y: P.c.y }, 8, { x: P.c.x - 3, y: P.c.y });
  const f1 = await foeAt(1);
  await powerShot('curse', { x: f1?.x ?? P.c.x + 5, y: f1?.y ?? P.c.y }, 4, f1 ?? P.c);
  await powerShot('pestilence', { x: P.c.x + 7, y: P.c.y + 4 }, 16, { x: P.c.x + 7, y: P.c.y + 3 });
  await powerShot('earthquake', { x: P.c.x + 7, y: P.c.y + 1 }, 24, { x: P.c.x + 7, y: P.c.y + 1 });
  await powerShot('lightning_storm', { x: P.c.x + 6, y: P.c.y }, 36, { x: P.c.x + 6, y: P.c.y });
  await powerShot('lure', { x: P.c.x - 7, y: P.c.y - 4 }, 4, { x: P.c.x - 7, y: P.c.y - 4 });
  if (P.house) await powerShot('sentinel', { targetId: P.house }, 4, { x: P.c.x - 8, y: P.c.y + 4 });
  // a cornucópia só nasce no território do jogador: perto do Centro Cívico
  if (P.tc) await powerShot('plenty', { x: P.tc.x + 5, y: P.tc.y + 4 }, 4, { x: P.tc.x + 5, y: P.tc.y + 4 });
  await powerShot('bronze', {}, 4, { x: P.c.x - 3, y: P.c.y });
  await powerShot('ceasefire', {}, 40, { x: P.c.x + 1, y: P.c.y });
  if (P.tc) await powerShot('oracle', {}, 4, P.tc, 0.8);
  // Q de Héracles (Golpe Titânico: onda dourada no raio da habilidade)
  if (P.hero) {
    await look({ x: P.c.x - 2, y: P.c.y + 3 }, 1.3);
    await page.evaluate((id) => { const s = window.aoe.session; s.issue({ type: 'ability', player: s.local, unitId: id }); }, P.hero);
    await run(1); await waitTicks(4); await pause();
    await shot('poder-habilidade');
  }
  // titã saindo do portal (o efeito titanRise do núcleo, ao completar o Portal dos Titãs)
  const gate = await page.evaluate(() => {
    const s = window.aoe.session, st = s.state, me = s.local;
    const A = window.__area(8, 8, { minTc: 20 });
    const g = A ? window.__build(me, 'titan_gate', A.x + 1, A.y + 1) : null;   // pronto: o titã sai no próximo tick
    return g ? { id: g.id, x: g.x, y: g.y } : null;
  });
  if (gate) {
    await look({ x: gate.x, y: gate.y + 1 }, 1.0);
    await run(1);
    await page.waitForFunction(() => window.aoe.session.state.effects.some((e) => e.type === 'titanRise') || window.aoe.session.state.tick > 1e9, null, { timeout: 120000, polling: 50 }).catch(() => errors.push('titanRise: o portal não completou'));
    await waitTicks(10); await pause();
    await shot('poder-titanRise');
  }
  await checkFx('poderes');
}

// ------------------------------------------------------------------------------------------------------------------
// 5. ciclo de luz (opção desligada por padrão): amanhecer e entardecer na cena de combate
if (want('luz')) {
  const c = await combatScene();
  await page.evaluate(() => { window.aoe.settings.dayCycle = true; window.aoe.applyQuality(); });
  await run(1); await look(c.c, 1.0); await waitTicks(40); await pause();
  for (const [name, frac] of [['amanhecer', 0.03], ['entardecer', 0.8]]) {
    await page.evaluate((frac) => { const R = window.aoe.renderer, d = R.dayCycle, t = R.animClock; d.offset = (frac - 0.18) * 14 * 60 - t; d.last = -1; }, frac);
    await run(1); await waitTicks(2); await pause();
    await shot(`luz-${name}`);
  }
  // custo de CPU do filtro (ms por renderer.render, laço síncrono): ligado × desligado
  const cost = await page.evaluate(() => {
    const s = window.aoe.session, R = window.aoe.renderer, ui = window.aoe.input.renderUI();
    R.setRenderScale(0.25);
    const t = () => { const a = performance.now(); for (let i = 0; i < 60; i++) { R.render(s.state, 0.5, ui, 1 / 60); R.app.renderer.render({ container: R.app.stage }); } return (performance.now() - a) / 60; };
    t();
    const on = t();
    window.aoe.settings.dayCycle = false; window.aoe.applyQuality();
    const off = t();
    R.setRenderScale(1);
    return { on: +on.toFixed(2), off: +off.toFixed(2), delta: +(on - off).toFixed(2) };
  });
  console.log('ciclo de luz (ms/quadro: render + Pixi, resolução 0,25):', JSON.stringify(cost));
  need(cost.delta <= 0.5, `ciclo de luz: +${cost.delta} ms por quadro (teto 0,5)`);
  await page.evaluate(() => { window.aoe.renderer.dayCycle.offset = 0; });
}

// ------------------------------------------------------------------------------------------------------------------
// 6. orçamento: batalha 60 × 60 (metade à distância) no preset alto
if (want('orcamento')) {
  const T = ['hoplite', 'toxotes', 'peltast', 'hippeus'];
  await newGame(T);
  const b = await page.evaluate(() => {
    const s = window.aoe.session, st = s.state, me = s.local, foe = (me + 1) % st.players.length;
    const sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
    const A = window.__area(36, 20);
    const cx = A.x + 18, cy = A.y + 10, types = ['hoplite', 'toxotes', 'peltast', 'hippeus'];
    const a = [], bb = [];
    for (let i = 0; i < 60; i++) { const t = types[i % 4]; a.push(tough(sp(me, t, cx - 8 - (i % 6), cy - 7 + Math.floor(i / 6) * 1.5), 1500)); bb.push(tough(sp(foe, t, cx + 8 + (i % 6), cy - 7 + Math.floor(i / 6) * 1.5), 1500)); }
    s.issue({ type: 'attackMove', player: me, ids: ids(a), x: cx + 10, y: cy });
    s.scheduler.issue({ type: 'attackMove', player: foe, ids: ids(bb), x: cx - 10, y: cy });
    return { c: { x: cx, y: cy }, units: st.units.size };
  });
  await setQuality('high', true);
  await settle(T);
  await page.evaluate(() => window.aoe.renderer.fx.particles.resetStats());
  await startSampler();
  await look(b.c, 1.0);
  await run(1); await waitTicks(160); await pause();
  await shot('batalha-z10');
  const S = await stopSampler();
  const st = await checkFx('batalha');
  console.log('batalha 60×60 fx:', JSON.stringify({ peak: S.peak, budget: st.budget, dropped: st.dropped, proj: S.proj, decals: S.decals }));
  need(st.budget === 2000, `batalha: orçamento do preset alto ${st.budget} ≠ 2000`);
  need(S.peak <= 2000, `batalha: pico ${S.peak} > 2000`);
  await setQuality('medium', true);
}

console.log('erros:', errors.length ? '\n' + errors.join('\n') : 'nenhum');
await browser.close();
if (errors.length) process.exit(1);
