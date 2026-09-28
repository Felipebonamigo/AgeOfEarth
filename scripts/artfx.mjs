// Cenas de efeitos da Etapa 5 (docs/ART.md §1.9 e Apêndice F): partidas montadas (semente 42, 1 IA fácil, mapa médio,
// numa clareira longe do Centro Cívico), mapa revelado só no renderizador, HUD oculto, idas e esperas no TEMPO DE JOGO.
//  1. combate: hoplitas × hoplitas no corpo a corpo (faíscas no bronze), toxotas e peltastas atirando flechas e dardos
//     (arco com sombra no chão, orientação pela velocidade), petróbolos bombardeando uma casa (pedra rolando, poeira,
//     lascas e marca de impacto) → <prefixo>-combate-{z10,z22}.png e o mesmo com a arte desligada (atlas procedural de
//     reserva) → <prefixo>-procedural-z13.png;
//  2. marcha: coluna de hoplitas, hipeus galopando e cerco rodando — poeira dos pés, cascos e rodas → -marcha-z13.png;
//  3. cerco: quartel muito danificado (fogo em flipbook + fumaça), casa danificada (fumaça), pedras caindo e uma casa
//     desabando (poeira, escombros no chão) → -cerco-z13.png;
//  4. lote combate-ambiente: queda, estatua, desabamento, splash, herois e ambiente (cenas descritas no bloco delas);
//  5. poderes (lote poderes-luz): cada um dos 12 poderes numa partida própria, a zoom 1, no meio do efeito
//     → -poder-<id>.png (e a duração dos que duram: -poder-{pestilence,bronze,ceasefire}-duracao.png), a Q de um herói
//     e o titã saindo do portal (titanRise); confere o canal do raio, o clarão, as colunas de luz, a sombra da
//     tempestade, as rachaduras, o chão manchado, as vinhetas e o olho, e que ninguém mira na trégua;
//  6. luz: o ciclo de luz ligado (opção), no amanhecer, no entardecer e no crepúsculo → -luz-{amanhecer,entardecer,
//     crepusculo}.png, e o custo do filtro (1º quartil de 12 blocos alternados, teto 0,5 ms);
//  7. orçamento: batalha mista 100 × 100 (infantaria, arqueiros, dardos, cavalaria, petróbolos, quimeras e um quartel
//     em chamas) no preset alto → -batalha-{z10,z22}.png, e depois com Tempestade e Terremoto caindo nela — o pico de
//     partículas vivas não passa de 2 000 e nenhum efeito do núcleo fica sem handler.
// Falha se houver erro de página, efeito sem handler (`fx.unknown`), partículas acima do orçamento, se a arte `fx`
// assada não for servida, se faltarem projéteis, faíscas, poeira, fogo, decalques ou o arco dos projéteis.
// Exige `npm run preview` (ou a URL). Uso: node scripts/artfx.mjs [url] [--out docs/art] [--prefix etapa5]
//   [--only combate,marcha,cerco,queda,estatua,desabamento,splash,herois,ambiente,poderes,luz,orcamento]
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

const browser = await chromium.launch({ env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' }, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
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
async function newGame(types = [], mapType = 'continental', mapSize = 'medium') {
  await page.evaluate(([seed, mapType, mapSize]) => {
    const players = [{ name: 'Jogador', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'Leônidas (IA)', god: 'poseidon', isAI: true, difficulty: 'easy', team: 1 }];
    window.aoe.startGame({ seed, mapSize, players, revealMap: false, mode: 'conquest', mapType });
    window.aoe.session.paused = true;
    const h = document.getElementById('hud'); if (h) h.style.visibility = 'hidden';
  }, [SEED, mapType, mapSize]);
  await page.evaluate(() => {
    const s = window.aoe.session, map = s.state.map;
    window.__open = (x, y) => { if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false; const i = y * map.w + x; return !map.blocked[i] && map.nodeAt[i] === -1 && map.buildingAt[i] === -1 && map.terrain[i] !== 1 && map.terrain[i] !== 2 && map.terrain[i] !== 5; };
    window.__area = (w, h, { minTc = 14, mx = 23, my = 15, skip = [], preferSoil = false, minFree = 0 } = {}) => {
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
        if (free < minFree * w * h) continue;   // clareira de verdade (a batalha grande não pode lutar dentro do bosque)
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
      S.add = Math.max(S.add, ps.addCount);
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
// 4. lote combate-ambiente (docs/ART.md Apêndice F): cenas próprias, cada uma com a sua captura olhada com Read.
//  queda — hoplitas, hipeus e um petróbolo frágeis caindo (a poeira pelo porte, o cerco em lascas) → -queda-z20.png;
//  estatua — Medusas petrificando hoplitas e mantícoras atirando rajadas de espinhos: a estátua de pedra rachando e
//    esfarelando → -estatua-z22.png, -estatua-esfarela-z22.png, -espinhos-z22.png;
//  desabamento — um quartel e uma casa caindo (poeira pesada, pedaços, escombros) → -desabamento-z16.png;
//  splash — a Quimera cuspindo fogo, os três titãs batendo e o Golpe Titânico de Héracles → -splash-fogo-z13.png,
//    -splash-titas-z13.png, -golpe-titanico-z13.png;
//  herois — a Q de cada um dos cinco heróis (onda até o raio, aliados alcançados), o halo e as auras →
//    -q-<herói>.png, -halo-z22.png;
//  ambiente — coleta (lascas e folhas no golpe do machado, ouro), árvore esgotada, obra, fumaça das forjas/lareira de
//    quem produz, cura (regeneração), margem da água (respingos) e o vento num mapa de deserto → -coleta-z22.png,
//    -arvore-cai-z22.png, -fumaca-trabalho-z13.png, -cura-z22.png, -margem-z22.png, -vento-deserto-z10.png.
/** Instâncias vivas de efeitos de um tipo (o estado do handler de cada uma). */
const liveFx = (type) => page.evaluate((type) => { const out = []; for (const [e, inst] of window.aoe.renderer.fx.live) if (e.type === type) { const s = inst.s ?? {}; out.push({ ttl: e.ttl, hero: s.hero, kind: s.kind, wave: s.wave, stone: s.statue ? !!s.statue.set : null }); } return out; }, type);
const fxCounts = () => page.evaluate(() => ({ unit: { ...window.aoe.renderer.fx.unitFx.counts, halos: window.aoe.renderer.fx.unitFx.haloCount }, amb: { ...window.aoe.renderer.fx.ambient.counts, arid: window.aoe.renderer.fx.ambient.aridNow } }));
const resetCounts = () => page.evaluate(() => { const f = window.aoe.renderer.fx; for (const o of [f.unitFx.counts, f.ambient.counts]) for (const k in o) o[k] = 0; });
const waitEffect = (type, n = 1, timeout = 120000) => page.waitForFunction(([t, n]) => window.aoe.session.state.effects.filter((e) => e.type === t).length >= n, [type, n], { timeout, polling: 30 });

if (want('queda')) {
  const T = ['hoplite', 'hippeus', 'petrobolos'];
  await newGame(T);
  const q = await page.evaluate(() => {
    const s = window.aoe.session, st = s.state, me = s.local, foe = (me + 1) % st.players.length;
    const sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
    const A = window.__area(24, 12);
    const cx = A.x + 12, cy = A.y + 6;
    // infantaria, cavalaria e cerco com 1 de vida, passivos: caem no primeiro golpe, cada porte com a sua poeira
    const victims = [];
    for (let i = 0; i < 4; i++) victims.push(sp(foe, 'hoplite', cx + 1.2, cy - 3 + i * 1.4));
    for (let i = 0; i < 3; i++) victims.push(sp(foe, 'hippeus', cx + 2.6, cy - 2.4 + i * 1.8));
    victims.push(sp(foe, 'petrobolos', cx + 1.6, cy + 3));
    for (const v of victims) if (v) v.hp = 1;
    const killers = [];
    for (let i = 0; i < 8; i++) killers.push(tough(sp(me, 'hoplite', cx - 0.5, cy - 3.5 + i)));
    s.scheduler.issue({ type: 'stance', player: foe, ids: ids(victims), stance: 'passive' });
    s.issue({ type: 'attackMove', player: me, ids: ids(killers), x: cx + 4, y: cy });
    return { c: { x: cx + 1.5, y: cy } };
  });
  await settle(T);
  await look({ x: q.c.x + 0.6, y: q.c.y }, 2.0);
  await run(1);
  // a queda de um hipeu (o cavalo tomba ao comprido): a poeira sai quando o corpo bate no chão (≈ 0,45 s)
  await page.waitForFunction(() => window.aoe.session.state.effects.some((e) => e.type === 'death' && e.data === 'hippeus'), null, { timeout: 120000, polling: 20 });
  await run(0.25);
  await page.waitForFunction(() => window.aoe.session.state.effects.some((e) => e.type === 'death' && e.data === 'hippeus' && e.total - e.ttl >= 12), null, { timeout: 120000, polling: 20 });
  await pause();
  const st = await checkFx('queda');
  need(st.particles > 0, 'queda: sem partículas (poeira da queda)');
  await shot('queda-z20');
}

if (want('estatua')) {
  const T = ['hoplite', 'toxotes'];
  await newGame(T);
  const q = await page.evaluate(() => {
    const s = window.aoe.session, st = s.state, me = s.local, foe = (me + 1) % st.players.length;
    const sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
    const A = window.__area(24, 12);
    const cx = A.x + 12, cy = A.y + 6;
    // hoplitas resistentes e passivos; Medusas (12 % de petrificar por golpe) e mantícoras (rajadas de espinhos) atirando
    const targets = [];
    for (let i = 0; i < 12; i++) targets.push(tough(sp(me, 'hoplite', cx + (i % 4) * 0.9, cy - 1.5 + Math.floor(i / 4) * 1.1), 3000));
    s.issue({ type: 'stance', player: me, ids: ids(targets), stance: 'passive' });
    const shooters = [];
    for (let i = 0; i < 6; i++) shooters.push(tough(sp(foe, 'medusa', cx - 5, cy - 3 + i * 1.2)));
    for (let i = 0; i < 3; i++) shooters.push(tough(sp(foe, 'manticore', cx + 8, cy - 2 + i * 1.6)));
    for (const u of shooters) if (u) s.scheduler.issue({ type: 'attack', player: foe, ids: [u.id], targetId: targets[Math.floor(Math.random() * targets.length)].id });
    return { c: { x: cx + 1.5, y: cy } };
  });
  await settle(T);
  await look(q.c, 1.3);
  await run(1);
  // a estátua no meio da petrificação (rachando) e depois esfarelando
  await waitEffect('petrify', 1, 240000);
  const zoomOn = () => page.evaluate(() => { const e = window.aoe.session.state.effects.find((x) => x.type === 'petrify'); if (e) { const c = window.aoe.renderer.cam; c.zoom = 2.2; c.centerOn(e.x, e.y - 0.4); } });
  await zoomOn(); await run(0.25);
  await page.waitForFunction(() => window.aoe.session.state.effects.some((e) => e.type === 'petrify' && e.ttl <= 15), null, { timeout: 60000, polling: 20 });
  await pause();
  const statues = await liveFx('petrify');
  await shot('estatua-z22');
  need(statues.length > 0, 'estátua: nenhuma petrificação viva');
  need(statues.some((x) => x.stone === true), 'estátua: o quadro não virou pedra (stone.ts)');
  await run(0.25);
  await page.waitForFunction(() => window.aoe.session.state.effects.some((e) => e.type === 'petrify' && e.ttl <= 7), null, { timeout: 60000, polling: 20 });
  await pause(); await shot('estatua-esfarela-z22');
  // rajada de espinhos da mantícora em voo
  await look({ x: q.c.x + 3, y: q.c.y }, 2.2);
  await run(1);
  await page.waitForFunction(() => { for (const [e, inst] of window.aoe.renderer.fx.live) if (e.type === 'projectile' && inst.s.kind === 'spike' && inst.s.body?.visible) return true; return false; }, null, { timeout: 60000, polling: 20 }).catch(() => errors.push('espinhos: nenhuma rajada de mantícora em voo'));
  await pause(); await shot('espinhos-z22');
  await checkFx('estatua');
}

if (want('desabamento')) {
  const T = ['hoplite'];
  await newGame(T);
  const d = await page.evaluate(() => {
    const s = window.aoe.session, st = s.state, me = s.local, foe = (me + 1) % st.players.length;
    const A = window.__area(20, 12);
    const bar = window.__build(foe, 'barracks', A.x + 9, A.y + 5);
    const house = window.__build(foe, 'house', A.x + 14, A.y + 6);
    return { c: { x: A.x + 10.5, y: A.y + 6 }, bar: bar?.id ?? null, house: house?.id ?? null, me };
  });
  await settle(T);
  await look(d.c, 1.6);
  await run(0.25); await waitTicks(2);
  if (d.bar) await page.evaluate((id) => window.aoe.debugDestroy(id), d.bar);
  await waitTicks(3);
  if (d.house) await page.evaluate((id) => window.aoe.debugDestroy(id), d.house);
  await waitTicks(5); await pause();
  await shot('desabamento-z16');
  const st = await checkFx('desabamento');
  need(st.decals >= 2, `desabamento: ${st.decals} decalque(s) (esperado mancha + escombros)`);
}

if (want('splash')) {
  const T = ['hoplite', 'heracles'];
  await newGame(T);
  const q = await page.evaluate(() => {
    const s = window.aoe.session, st = s.state, me = s.local, foe = (me + 1) % st.players.length;
    const sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
    const A = window.__area(40, 14, { mx: 34 });   // longe da borda: a câmera em Héracles não mostra o fim do mapa
    const cx = A.x + 20, cy = A.y + 7;
    const groups = [];
    // Quimera (fogo) à esquerda, os três titãs no meio, Héracles à direita
    const make = (type, x, y) => {
      const foes = [];
      for (let i = 0; i < 5; i++) foes.push(tough(sp(foe, 'hoplite', x + 1.6 + (i % 2) * 0.8, y - 1.6 + i * 0.8), 6000));
      const a = tough(sp(me, type, x - 0.8, y), 20000);
      s.scheduler.issue({ type: 'stance', player: foe, ids: ids(foes), stance: 'passive' });
      if (a) s.issue({ type: 'attack', player: me, ids: [a.id], targetId: foes[2].id });
      groups.push({ type, id: a?.id ?? null, x, y });
    };
    make('chimera', cx - 15, cy);
    make('prometheus', cx - 6, cy); make('oceanus', cx + 1, cy); make('cronus', cx + 8, cy);
    make('heracles', cx + 15, cy);
    return { c: { x: cx, y: cy }, groups };
  });
  await settle(T);
  const g = (t) => q.groups.find((x) => x.type === t);
  // fogo da Quimera
  await look({ x: g('chimera').x + 1, y: g('chimera').y }, 1.3);
  await run(1);
  await page.waitForFunction((id) => { const u = window.aoe.session.state.units.get(id); const st = window.aoe.session.state; return u && st.effects.some((e) => e.type === 'splash' && Math.abs(e.x - u.x) < 3); }, g('chimera').id, { timeout: 120000, polling: 20 }).catch(() => errors.push('splash: a Quimera não golpeou'));
  await run(0.25); await waitTicks(4); await pause();
  await shot('splash-fogo-z13');
  // os três titãs (a onda de Oceano no meio, o fogo de Prometeu à esquerda e a pancada de Cronos à direita)
  await look({ x: g('oceanus').x + 0.5, y: g('oceanus').y }, 1.3);
  await run(1); await waitTicks(10);
  await page.waitForFunction((id) => { const u = window.aoe.session.state.units.get(id); const st = window.aoe.session.state; return u && st.effects.some((e) => e.type === 'splash' && e.total - e.ttl <= 3 && Math.abs(e.x - u.x) < 3.5); }, g('oceanus').id, { timeout: 60000, polling: 20 }).catch(() => errors.push('splash: Oceano não golpeou'));
  await run(0.25); await waitTicks(3); await pause();
  await shot('splash-titas-z13');
  // Golpe Titânico: Q de Héracles e o golpe seguinte
  const her = g('heracles');
  if (her.id) {
    await look({ x: her.x + 0.8, y: her.y }, 1.3);
    await page.evaluate((id) => { const s = window.aoe.session; const u = s.state.units.get(id); if (u) u.abilityReadyAt = 0; s.issue({ type: 'ability', player: s.local, unitId: id }); }, her.id);
    await run(1);
    await page.waitForFunction((id) => { const u = window.aoe.session.state.units.get(id); const st = window.aoe.session.state; return u && u.chargeUntil === 0 && st.effects.some((e) => e.type === 'splash' && Math.abs(e.x - u.x) < 3); }, her.id, { timeout: 60000, polling: 20 }).catch(() => errors.push('golpe titânico: Héracles não golpeou carregado'));
    await run(0.25); await waitTicks(3); await pause();
    await shot('golpe-titanico-z13');
  }
  await checkFx('splash');
}

if (want('herois')) {
  const HEROES = ['jason', 'odysseus', 'heracles', 'achilles', 'perseus'];
  const T = ['hoplite', ...HEROES];
  await newGame(T);
  const q = await page.evaluate((HEROES) => {
    const s = window.aoe.session, st = s.state, me = s.local;
    const sp = window.aoe.debugSpawn, ids = window.__ids;
    // cada herói numa clareira própria de 13 × 11 tiles (≥ 97 % livre, sem bosque nem água), perto do Centro Cívico mas
    // fora da cidade, com 6 hoplitas em volta; as clareiras não se sobrepõem (as ondas não se tocam)
    const map = st.map, W = 13, H = 11;
    const tc = [...st.buildings.values()].find((b) => b.owner === me && b.type === 'town_center');
    const cands = [];
    for (let y0 = 3; y0 + H <= map.h - 3; y0 += 2) for (let x0 = 3; x0 + W <= map.w - 3; x0 += 2) {
      const d = Math.sqrt((x0 + W / 2 - tc.x) ** 2 + (y0 + H / 2 - tc.y) ** 2);
      if (d < 14) continue;
      let free = 0; for (let y = y0; y < y0 + H; y++) for (let x = x0; x < x0 + W; x++) if (window.__open(x, y)) free++;
      if (free >= 0.97 * W * H) cands.push({ x: x0, y: y0, d });
    }
    cands.sort((a, b) => a.d - b.d);
    const picked = [];
    for (const c of cands) { if (picked.length >= HEROES.length) break; if (picked.every((p) => Math.abs(p.x - c.x) >= W + 2 || Math.abs(p.y - c.y) >= H + 2)) picked.push(c); }
    const out = [];
    HEROES.forEach((type, k) => {
      const A = picked[k] ?? window.__area(W, H);
      const x = A.x + W / 2, cy = A.y + H / 2;
      const h = sp(me, type, x, cy);
      const allies = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; allies.push(sp(me, 'hoplite', x + Math.cos(a) * 3, cy + Math.sin(a) * 2.2)); }
      s.issue({ type: 'stance', player: me, ids: ids([h, ...allies]), stance: 'passive' });
      if (h) h.abilityReadyAt = 0;
      out.push({ type, id: h?.id ?? null, x, y: cy });
    });
    return { heroes: out };
  }, HEROES);
  await settle(T); await resetCounts();
  const AT = { jason: 10, odysseus: 11, heracles: 11, achilles: 8, perseus: 10 };
  for (const h of q.heroes) {
    if (!h.id) { errors.push(`q ${h.type}: herói não nasceu`); continue; }
    await look({ x: h.x, y: h.y - 0.3 }, 1.3);
    await page.evaluate((id) => { const s = window.aoe.session; s.issue({ type: 'ability', player: s.local, unitId: id }); }, h.id);
    // câmera lenta (¼): a pausa cai no tick certo mesmo com a renderização por software
    await run(0.25); await waitTicks(AT[h.type]); await pause();
    await shot(`q-${h.type}`);
    const inst = await liveFx('ability');
    const mine = inst.find((x) => x.hero === h.id);
    need(!!mine, `q ${h.type}: efeito sem handler vivo`);
    need(mine?.kind === h.type, `q ${h.type}: herói identificado como ${mine?.kind}`);
    need((mine?.wave ?? -1) >= 0, `q ${h.type}: a onda não saiu`);
    await run(1); await waitTicks(20); await pause();
  }
  // halo de Héracles, ainda carregado (a luz dourada juntando na clava), com os hoplitas em volta, a zoom 2,2
  const her = q.heroes.find((h) => h.type === 'heracles');
  await look({ x: her.x, y: her.y - 0.3 }, 2.2);
  await run(1); await waitTicks(8); await pause();
  await shot('halo-z22');
  const c = await fxCounts();
  need(c.unit.halos >= 1, `halo: ${c.unit.halos} halo(s)`);
  need(c.unit.aura > 0, 'auras: nenhuma aura de habilidade em curso');
  await checkFx('herois');
}

if (want('ambiente')) {
  const T = ['villager', 'hoplite', 'hippeus'];
  await newGame(T);
  const q = await page.evaluate(() => {
    const s = window.aoe.session, st = s.state, map = st.map, me = s.local;
    const sp = window.aoe.debugSpawn, ids = window.__ids, open = window.__open;
    const P = st.players[me];
    P.resources.food = P.resources.wood = P.resources.gold = P.resources.favor = 9000; P.age = 3; P.mods.player.popCap = 200; P.popCap = 200;
    const tc = [...st.buildings.values()].find((b) => b.owner === me && b.type === 'town_center');
    const nodes = [...map.nodes.values()];
    const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    // bosque perto do CC com chão livre ao sul (os cidadãos cortam a borda)
    const trees = nodes.filter((n) => n.type === 'tree' && d2(n, tc) < 30 * 30 && open(n.x, n.y + 1) && open(n.x, n.y + 2)).sort((a, b) => d2(a, tc) - d2(b, tc));
    const edge = trees.slice(0, 4);
    const cutters = [];
    edge.forEach((t) => { const u = sp(me, 'villager', t.x + 0.5, t.y + 1.5); if (u) { cutters.push(u); s.issue({ type: 'gather', player: me, ids: [u.id], targetId: t.id }); } });
    // uma árvore quase no fim: o cidadão a derruba (nodeGone)
    if (edge[0]) edge[0].amount = 3;
    const gold = nodes.filter((n) => n.type === 'gold').sort((a, b) => d2(a, tc) - d2(b, tc))[0];
    const miners = [];
    if (gold) for (let i = 0; i < 3; i++) { const u = sp(me, 'villager', gold.x + 0.5 + (i - 1), gold.y + 1.6); if (u) { miners.push(u); s.issue({ type: 'gather', player: me, ids: [u.id], targetId: gold.id }); } }
    // produção: quartel, estábulo e oficina com fila, e o CC treinando (fumaça das forjas e a lareira do pátio)
    const A = window.__area(20, 10, { minTc: 9 });
    const bar = window.__build(me, 'barracks', A.x + 3, A.y + 4), stab = window.__build(me, 'stable', A.x + 9, A.y + 4), shop = window.__build(me, 'siege_workshop', A.x + 15, A.y + 4);
    for (const b of [bar, stab, shop]) if (b) for (let i = 0; i < 4; i++) s.issue({ type: 'train', player: me, buildingId: b.id, unit: b === bar ? 'hoplite' : b === stab ? 'hippeus' : 'petrobolos' });
    for (let i = 0; i < 4; i++) s.issue({ type: 'train', player: me, buildingId: tc.id, unit: 'villager' });
    // cura: hoplitas feridos com regeneração forte (a Ambrosia dá 1/s; aqui 6/s para a captura)
    P.mods.player.regen = 6;
    const hurt = [];
    for (let i = 0; i < 6; i++) { const u = sp(me, 'hoplite', A.x + 4 + i * 0.9, A.y + 9); if (u) { u.hp = u.maxHp * 0.3; u.lastDamageTick = -9999; hurt.push(u); } }
    s.issue({ type: 'stance', player: me, ids: ids(hurt), stance: 'passive' });
    // margem: um trecho de chão colado na água (o tile de água mais perto do CC com terra passável ao lado)
    let shore = null, bestS = Infinity;
    for (let y = 4; y < map.h - 4; y++) for (let x = 4; x < map.w - 4; x++) {
      if (!open(x, y)) continue;
      // água ao norte ou ao sul e 7 tiles de chão livre na linha: a tropa anda rente à água
      const wd = [[0, 1], [0, -1]].find(([dx, dy]) => { const t = map.terrain[(y + dy) * map.w + x + dx]; return t === 1 || t === 5; });
      if (!wd) continue;
      let run = 0; for (let k = -3; k <= 3; k++) if (open(x + k, y)) run++;
      if (run < 7) continue;
      const d = d2({ x, y }, tc); if (d < bestS) { bestS = d; shore = { x, y, wy: wd[1] }; }
    }
    const walkers = [];
    if (shore) {
      // rente à linha d'água: o pé a menos de um raio do tile de água (o corpo encosta nela)
      const ly = shore.y + 0.5 + shore.wy * 0.25;
      for (let i = 0; i < 3; i++) walkers.push(sp(me, 'hoplite', shore.x - 3 + i * 0.6, ly));
      for (let i = 0; i < 2; i++) walkers.push(sp(me, 'hippeus', shore.x - 3.4, ly));
      for (const u of walkers) if (u) u.y = u.py = ly;
      shore.ly = ly;
      s.issue({ type: 'move', player: me, ids: ids(walkers), x: shore.x + 3.5, y: ly });
    }
    return { tree: edge[0] ? { x: edge[0].x + 0.5, y: edge[0].y + 1 } : null, treeId: edge[0]?.id ?? null, gold: gold ? { x: gold.x + 0.5, y: gold.y + 1 } : null, prod: { x: A.x + 10, y: A.y + 3 }, tc: { x: tc.x, y: tc.y }, hurt: { x: A.x + 6.5, y: A.y + 9 }, shore, walkers: ids(walkers) };
  });
  console.log('ambiente:', JSON.stringify(q));
  await settle(T); await resetCounts();
  // margem da água (primeiro: a tropa começa a andar rente à água logo na montagem)
  if (q.shore) {
    await look({ x: q.shore.x, y: q.shore.ly }, 2.2);
    await run(0.35);
    await page.waitForFunction(() => window.aoe.renderer.fx.unitFx.counts.shore >= 2, null, { timeout: 90000, polling: 10 }).catch(() => errors.push('margem: ninguém andou rente à água'));
    await pause();
    await shot('margem-z22');
  } else errors.push('margem: nenhum trecho de margem achado');
  // coleta: golpes do machado com lascas e folhas
  if (q.tree) {
    await look({ x: q.tree.x, y: q.tree.y - 0.3 }, 2.2);
    await run(1); await waitTicks(50); await pause();
    await shot('coleta-z22');
    // a árvore quase no fim cai: folhas da copa, lascas e serragem no chão
    await run(1);
    await waitEffect('nodeGone', 1, 120000).catch(() => errors.push('coleta: a árvore não foi derrubada'));
    await waitTicks(5); await pause();
    await shot('arvore-cai-z22');
  }
  // fumaça de trabalho e cura
  await look(q.prod, 1.3);
  await run(1); await waitTicks(40); await pause();
  await shot('fumaca-trabalho-z13');
  await page.evaluate(() => { const s = window.aoe.session; for (const u of s.state.units.values()) if (u.owner === s.local && u.type === 'hoplite' && u.hp >= u.maxHp) u.hp = u.maxHp * 0.3; });
  await look({ x: q.hurt.x, y: q.hurt.y - 0.3 }, 2.2);
  // logo depois de um ganho de vida (a regeneração do núcleo é no segundo cheio: tick % 20 = 0)
  await run(1); await waitTicks(20); await run(0.25);
  await page.waitForFunction(() => window.aoe.session.state.tick % 20 === 5, null, { timeout: 60000, polling: 10 });
  await pause();
  await shot('cura-z22');
  const c = await fxCounts();
  console.log('ambiente fx:', JSON.stringify(c));
  need(c.unit.strike > 0, 'coleta: nenhum golpe com lascas');
  need(c.unit.leaf > 0, 'coleta: nenhuma folha caindo da copa');
  need(c.amb.smoke > 0, 'fumaça de trabalho: nenhuma baforada');
  need(c.unit.heal > 0, 'cura: nenhum brilho de cura');
  if (q.shore) need(c.unit.shore > 0, 'margem: nenhum respingo');
  await checkFx('ambiente');
  // vento: mapa de deserto
  await newGame(['hoplite'], 'desert');
  const dz = await page.evaluate(() => {
    const s = window.aoe.session, map = s.state.map;
    const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center');
    let best = null, bs = -1;
    for (let y = 14; y < map.h - 14; y += 3) for (let x = 22; x < map.w - 22; x += 3) {
      let n = 0; for (let dy = -10; dy <= 10; dy += 2) for (let dx = -18; dx <= 18; dx += 3) { const t = map.terrain[(y + dy) * map.w + x + dx]; if (t === 3 || t === 4) n++; }
      const sc = n - Math.sqrt((x - tc.x) ** 2 + (y - tc.y) ** 2) / 20;
      if (sc > bs) { bs = sc; best = { x, y }; }
    }
    return best;
  });
  await settle(['hoplite']); await resetCounts();
  await look(dz, 1.0);
  await run(1); await waitTicks(80); await pause();
  await shot('vento-deserto-z10');
  const w = await fxCounts();
  console.log('vento:', JSON.stringify(w.amb));
  need(w.amb.wind > 0, `vento: nenhuma rajada de poeira no deserto (árido ${w.amb.arid})`);
  await checkFx('vento');
}

// ------------------------------------------------------------------------------------------------------------------
// 5. poderes (lote poderes-luz): CADA poder numa partida própria (nada do poder anterior na captura), a zoom 1, no meio
//    do efeito — o lançamento (a área, o alvo) e, para os que duram, também a duração (-duracao). Conferido por quadro
//    (amostrador): partículas de poder, sprites de luz (canal do raio, colunas), clarão e vinhetas na tela, o olho do
//    Oráculo, a sombra da tempestade, decalques (rachaduras, queimadura, chão manchado) e que o amaldiçoado não cai.
const ALL_POWERS = ['bolt', 'lure', 'sentinel', 'restoration', 'ceasefire', 'pestilence', 'oracle', 'bronze', 'curse', 'lightning_storm', 'plenty', 'earthquake'];
const PT = ['hoplite', 'toxotes', 'villager', 'heracles'];
/** Cena dos poderes: numa clareira, um pelotão inimigo (resistente) à direita e o nosso (ferido) à esquerda, quartel e
 *  estábulo inimigos, uma casa nossa e Héracles; `fight` = os dois lutando (senão, parados e passivos). */
async function powerScene({ fight = false } = {}) {
  await newGame(PT);
  const P = await page.evaluate(([fight, powers]) => {
    const s = window.aoe.session, st = s.state, me = s.local, foe = (me + 1) % st.players.length;
    const sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
    const A = window.__area(30, 16);
    const cx = A.x + 15, cy = A.y + 7;
    st.players[me].powers = powers.map((id) => ({ id, used: false }));
    st.players[me].age = 3;
    const foes = [], friends = [];
    for (let i = 0; i < 12; i++) foes.push(tough(sp(foe, i % 3 ? 'hoplite' : 'toxotes', cx + 3 + (i % 4) * 0.9, cy - 2 + Math.floor(i / 4) * 1.1), fight ? 2500 : 400));
    for (let i = 0; i < 12; i++) { const u = sp(me, i % 3 ? 'hoplite' : 'toxotes', cx - 6 + (i % 4) * 0.9, cy - 2 + Math.floor(i / 4) * 1.1); if (u) { if (fight) tough(u, 2500); else u.hp = u.maxHp * 0.3; friends.push(u); } }
    const hero = sp(me, 'heracles', cx - 3, cy + 3.5);
    const bar = window.__build(foe, 'barracks', cx + 6, cy + 5);
    const stable = window.__build(foe, 'stable', cx + 11, cy + 1);
    const house = window.__build(me, 'house', cx - 10, cy + 5);
    if (fight) {
      s.issue({ type: 'attackMove', player: me, ids: ids(friends), x: cx + 6, y: cy });
      s.scheduler.issue({ type: 'attackMove', player: foe, ids: ids(foes), x: cx - 6, y: cy });
    } else {
      s.issue({ type: 'stance', player: me, ids: ids([...friends, hero]), stance: 'passive' });
      s.scheduler.issue({ type: 'stance', player: foe, ids: ids(foes), stance: 'passive' });
    }
    const tc = [...st.buildings.values()].find((b) => b.owner === me && b.type === 'town_center');
    const at = (b) => (b ? { id: b.id, x: b.x, y: b.y } : null);
    return { c: { x: cx, y: cy }, foe: ids(foes), friends: ids(friends), hero: hero?.id ?? null, bar: at(bar), stable: at(stable), house: at(house), tc: at(tc) };
  }, [fight, ALL_POWERS]);
  await settle(PT);
  return P;
}
const use = (power, extra) => page.evaluate(([power, extra]) => { const s = window.aoe.session; s.issue({ type: 'power', player: s.local, power, ...extra }); }, [power, extra]);
const unitAt = (id) => page.evaluate((id) => { const u = window.aoe.session.state.units.get(id); return u ? { x: u.x, y: u.y, id } : null; }, id);
/** Amostrador dos poderes (por quadro): picos de partículas de poder, aditivas e normais, sprites de luz (camada de
 *  brilho) e do chão (sombra da tempestade), clarão e vinhetas da tela, o olho, decalques. */
async function startPowerSampler() {
  await page.evaluate(() => {
    const S = window.__pw = { power: 0, add: 0, normal: 0, glow: 0, sprites: 0, flash: 0, vigCease: 0, vigOracle: 0, embCease: 0, embOracle: 0, screenKids: 0, decals: 0 };
    window.__pwStop = false;
    const loop = () => {
      const R = window.aoe.renderer; if (!R || window.__pwStop) return;
      requestAnimationFrame(loop);
      const fx = R.fx, ps = fx.particles;
      S.power = Math.max(S.power, ps.countOf(2));
      S.add = Math.max(S.add, ps.addCount);
      S.normal = Math.max(S.normal, ps.normalCount);
      S.glow = Math.max(S.glow, fx.glow.children.length);
      S.sprites = Math.max(S.sprites, fx.sprites.children.filter((c) => c.visible && c.alpha > 0.05).length);
      S.flash = Math.max(S.flash, fx.screen.flashAlpha);
      S.vigCease = Math.max(S.vigCease, fx.screen.vignetteAlpha('ceasefire'));
      S.vigOracle = Math.max(S.vigOracle, fx.screen.vignetteAlpha('oracle'));
      S.embCease = Math.max(S.embCease, fx.screen.emblemAlpha('ceasefire'));
      S.embOracle = Math.max(S.embOracle, fx.screen.emblemAlpha('oracle'));
      S.screenKids = Math.max(S.screenKids, fx.screen.root.children.filter((c) => c.visible && c.alpha > 0.02).length);
      S.decals = Math.max(S.decals, fx.decals.count);
    };
    loop();
  });
}
const stopPowerSampler = () => page.evaluate(() => { window.__pwStop = true; return window.__pw; });
/** Lança `id` com a câmera em `at` (zoom 1), roda `ticks` de jogo, pausa e captura; devolve o amostrado. */
async function powerShot(id, extra, ticks, at, { zoom = 1, name = `poder-${id}` } = {}) {
  await look(at, zoom);
  await startPowerSampler();
  await use(id, extra);
  await run(1); await waitTicks(ticks); await pause();
  await shot(name);
  const S = await stopPowerSampler();
  const st = await checkFx(`poder ${id}`);
  const used = await page.evaluate((id) => window.aoe.session.state.players[window.aoe.session.local].powers.find((p) => p.id === id)?.used, id);
  need(used, `poder ${id}: não foi usado (comando recusado)`);
  console.log(`poder ${id}:`, JSON.stringify(S), `partículas ${st.particles}/${st.budget}`);
  return S;
}
/** Mais `ticks` de jogo e uma captura da DURAÇÃO do poder; devolve o amostrado nesse trecho. */
async function durationShot(id, ticks, at) {
  if (at) await look(at, 1);
  await startPowerSampler();
  await run(1); await waitTicks(ticks); await pause();
  await shot(`poder-${id}-duracao`);
  const S = await stopPowerSampler();
  await checkFx(`poder ${id} (duração)`);
  console.log(`poder ${id} (duração):`, JSON.stringify(S));
  return S;
}

if (want('poderes')) {
  // Raio de Zeus num hoplita inimigo: o canal com galhos, o clarão, a queimadura
  let P = await powerScene();
  const f0 = await unitAt(P.foe[5]);
  let S = await powerShot('bolt', { targetId: f0?.id }, 2, f0 ?? P.c);
  need(S.glow >= 60, `bolt: canal do raio com ${S.glow} sprites de luz (esperado ≥ 60: 3 camadas × segmentos + galhos)`);
  need(S.flash >= 0.15, `bolt: sem clarão na tela (${S.flash})`);
  need(S.decals >= 2, `bolt: sem queimadura no chão (${S.decals} decalques)`);
  // Restauração no nosso pelotão ferido: anéis, poça de luz e uma coluna de luz por unidade curada
  P = await powerScene();
  S = await powerShot('restoration', { x: P.c.x - 4.6, y: P.c.y - 0.9 }, 9, { x: P.c.x - 3, y: P.c.y });
  need(S.glow >= 10, `restoration: ${S.glow} colunas de luz (esperado uma por unidade curada, ≥ 10)`);
  need(S.power >= 40, `restoration: ${S.power} partículas de poder`);
  // Maldição no pelotão inimigo: a área e a transformação em javali (sem queda nem cadáver)
  P = await powerScene();
  const corpses0 = await page.evaluate(() => window.aoe.renderer.corpses.length);
  S = await powerShot('curse', { x: P.c.x + 4.4, y: P.c.y - 0.9 }, 6, { x: P.c.x + 4, y: P.c.y });
  need(S.power >= 40, `curse: ${S.power} partículas de poder`);
  await run(1); await waitTicks(40); await pause();
  const cur = await page.evaluate(() => ({ corpses: window.aoe.renderer.corpses.length, boars: [...window.aoe.session.state.map.nodes.values()].filter((n) => n.type === 'boar').length }));
  need(cur.boars > 0, 'curse: nenhum javali');
  need(cur.corpses === corpses0, `curse: ${cur.corpses - corpses0} cadáver(es) de amaldiçoados (a transformação não deixa corpo)`);
  // Pestilência no quartel e no estábulo inimigos: a frente de miasma e, depois, a névoa e as moscas enquanto dura
  P = await powerScene();
  const pc = { x: (P.bar?.x ?? P.c.x + 7) + 1, y: (P.bar?.y ?? P.c.y + 5) - 2 };
  S = await powerShot('pestilence', pc, 22, pc);
  need(S.power >= 60, `pestilence: ${S.power} partículas de poder (frente de miasma)`);
  need(S.decals >= 2, `pestilence: sem chão manchado sob os edifícios (${S.decals} decalques)`);
  S = await durationShot('pestilence', 140, pc);
  need(S.power >= 20, `pestilence (duração): ${S.power} partículas (miasma e moscas sobre os edifícios parados)`);
  // Terremoto nos edifícios inimigos: rachaduras se abrindo, poeira, ondas
  P = await powerScene();
  const qc = { x: (P.bar?.x ?? P.c.x + 7) + 1.5, y: (P.bar?.y ?? P.c.y + 5) - 2.5 };
  S = await powerShot('earthquake', qc, 30, qc);
  need(S.decals >= 12, `earthquake: ${S.decals} decalques (rachaduras se abrindo: esperado ≥ 12)`);
  need(S.power >= 60, `earthquake: ${S.power} partículas de poder`);
  // Tempestade de Raios no pelotão inimigo: a sombra da nuvem, a chuva e os raios
  P = await powerScene();
  const sc = { x: P.c.x + 4.5, y: P.c.y };
  S = await powerShot('lightning_storm', sc, 40, sc);
  need(S.sprites >= 1, 'lightning_storm: sem a sombra da nuvem');
  need(S.normal >= 30, `lightning_storm: ${S.normal} partículas normais (chuva e nuvens)`);
  need(S.glow >= 30, `lightning_storm: sem raio (${S.glow} sprites de luz)`);
  // Isca de Poseidon, Sentinelas e Abundância: cada surgimento com a sua arte
  P = await powerScene();
  S = await powerShot('lure', { x: P.c.x - 8, y: P.c.y - 4 }, 4, { x: P.c.x - 7, y: P.c.y - 3 });
  need(S.glow >= 1 && S.normal >= 10, `lure: coluna de luz ${S.glow} / gotas e anéis ${S.normal}`);
  if (P.house) {
    S = await powerShot('sentinel', { targetId: P.house.id }, 6, { x: P.house.x, y: P.house.y - 1 });
    need(S.normal >= 30, `sentinel: ${S.normal} partículas normais (poeira e pedras)`);
  } else errors.push('sentinel: casa não construída');
  if (P.tc) {
    S = await powerShot('plenty', { x: P.tc.x + 5, y: P.tc.y + 4 }, 6, { x: P.tc.x + 5, y: P.tc.y + 3 });
    need(S.glow >= 1 && S.power >= 30, `plenty: coluna ${S.glow} / partículas ${S.power}`);
  } else errors.push('plenty: sem Centro Cívico');
  // Pele de Bronze no nosso pelotão: o brilho subindo e, depois, os reflexos metálicos enquanto dura
  P = await powerScene();
  S = await powerShot('bronze', {}, 6, { x: P.c.x - 4, y: P.c.y });
  need(S.add >= 20, `bronze: ${S.add} partículas aditivas no lançamento`);
  S = await durationShot('bronze', 60, null);
  need(S.add >= 6, `bronze (duração): ${S.add} reflexos (aditivos) nas unidades`);
  // Trégua no meio de uma luta: a onda na tela, a vinheta, os halos — e ninguém mira
  P = await powerScene({ fight: true });
  await look({ x: P.c.x, y: P.c.y }, 1); await run(1); await waitTicks(50); await pause();
  S = await powerShot('ceasefire', {}, 14, { x: P.c.x, y: P.c.y });
  need(S.vigCease >= 0.15, `ceasefire: vinheta ${S.vigCease}`);
  need(S.embCease >= 0.4, `ceasefire: emblema da pomba ${S.embCease}`);
  need(S.screenKids >= 2, 'ceasefire: sem a onda/vinheta/emblema na tela');
  await run(1); await waitTicks(20); await pause();
  const aiming = await page.evaluate(() => { let n = 0; for (const v of window.aoe.renderer.views.values()) if (v.unit && v.unit.visible && v.unit.anim === 'aim') n++; return n; });
  need(aiming === 0, `ceasefire: ${aiming} arqueiro(s) ainda mirando na trégua (armas baixadas)`);
  S = await durationShot('ceasefire', 100, null);
  need(S.vigCease >= 0.15 && S.embCease >= 0.9, `ceasefire (duração): vinheta ${S.vigCease}, emblema ${S.embCease}`);
  // Oráculo: a névoa de verdade (sem o revelar do renderizador), o olho e a vinheta dourados
  P = await powerScene();
  await page.evaluate(() => { window.aoe.renderer.revealAll = false; });
  if (P.tc) {
    await look(P.tc, 1); await run(1); await waitTicks(6); await pause();
    S = await powerShot('oracle', {}, 8, P.tc);
    need(S.vigOracle >= 0.12, `oracle: vinheta dourada ${S.vigOracle}`);
    need(S.screenKids >= 3, `oracle: sem o olho na tela (${S.screenKids} sprites de tela: olho, vinheta, emblema)`);
    need(S.embOracle >= 0.3, `oracle: emblema do olho ${S.embOracle}`);
  } else errors.push('oracle: sem Centro Cívico');
  // Q de Héracles (Golpe Titânico: onda dourada no raio da habilidade) — arte do lote de combate
  P = await powerScene();
  if (P.hero) {
    await look({ x: P.c.x - 3, y: P.c.y + 3 }, 1.3);
    await page.evaluate((id) => { const s = window.aoe.session; s.issue({ type: 'ability', player: s.local, unitId: id }); }, P.hero);
    await run(1); await waitTicks(4); await pause();
    await shot('poder-habilidade');
  }
  // titã saindo do portal (o efeito titanRise do núcleo, ao completar o Portal dos Titãs)
  await newGame(PT);
  const gate = await page.evaluate(() => {
    const s = window.aoe.session, me = s.local;
    const A = window.__area(8, 8, { minTc: 20 });
    const g = A ? window.__build(me, 'titan_gate', A.x + 1, A.y + 1) : null;   // pronto: o titã sai no próximo tick
    return g ? { id: g.id, x: g.x, y: g.y } : null;
  });
  if (gate) {
    await settle(PT);
    await look({ x: gate.x, y: gate.y }, 1.0);
    await startPowerSampler();
    await run(1);
    await page.waitForFunction(() => window.aoe.session.state.effects.some((e) => e.type === 'titanRise') || window.aoe.session.state.tick > 1e9, null, { timeout: 120000, polling: 50 }).catch(() => errors.push('titanRise: o portal não completou'));
    await waitTicks(10); await pause();
    await shot('poder-titanRise');
    S = await stopPowerSampler();
    console.log('titanRise:', JSON.stringify(S));
    need(S.glow >= 2 && S.power >= 60, `titanRise: coluna ${S.glow} / partículas ${S.power}`);
  } else errors.push('titanRise: portal não construído');
  await checkFx('poderes');
}

// ------------------------------------------------------------------------------------------------------------------
// 6. ciclo de luz (opção desligada por padrão): amanhecer, entardecer e crepúsculo na cena de combate
if (want('luz')) {
  const c = await combatScene();
  await page.evaluate(() => { window.aoe.settings.dayCycle = true; window.aoe.applyQuality(); });
  await run(1); await look(c.c, 1.0); await waitTicks(40); await pause();
  for (const [name, frac] of [['amanhecer', 0.03], ['entardecer', 0.8], ['crepusculo', 0.9]]) {
    await page.evaluate((frac) => { const R = window.aoe.renderer, d = R.dayCycle, t = R.animClock; d.offset = (frac - 0.18) * 14 * 60 - t; d.last = -1; }, frac);
    await run(1); await waitTicks(2); await pause();
    await shot(`luz-${name}`);
  }
  // custo de CPU do filtro (ms por renderer.render + render do Pixi, laço síncrono): ligado × desligado em 12 blocos
  // curtos alternados (liga-desliga, desliga-liga), sem trocar o preset (só o filtro); o 1º quartil de cada lado (a
  // máquina é dividida com outros processos: o quartil de baixo é o custo sem interferência)
  const cost = await page.evaluate(() => {
    const s = window.aoe.session, R = window.aoe.renderer, ui = window.aoe.input.renderUI(), d = R.dayCycle, world = R.app.stage.children[0];
    R.setRenderScale(0.25);
    const t = (n = 30) => { const a = performance.now(); for (let i = 0; i < n; i++) { R.render(s.state, 0.5, ui, 1 / 60); R.app.renderer.render({ container: R.app.stage }); } return (performance.now() - a) / n; };
    const set = (on) => { d.set(world, on); t(4); };
    const on = [], off = [];
    set(true); t();
    for (let k = 0; k < 12; k++) {
      if (k % 2 === 0) { set(true); on.push(t()); set(false); off.push(t()); } else { set(false); off.push(t()); set(true); on.push(t()); }
    }
    d.set(world, window.aoe.settings.dayCycle);
    R.setRenderScale(1);
    const q1 = (l) => l.slice().sort((p, q) => p - q)[Math.floor(l.length / 4)];
    return { on: +q1(on).toFixed(3), off: +q1(off).toFixed(3), delta: +(q1(on) - q1(off)).toFixed(3), onAll: on.map((v) => +v.toFixed(2)), offAll: off.map((v) => +v.toFixed(2)) };
  });
  console.log('ciclo de luz (ms/quadro: render + Pixi, resolução 0,25, 1º quartil de 12 blocos alternados):', JSON.stringify(cost));
  need(cost.delta <= 0.5, `ciclo de luz: +${cost.delta} ms por quadro (teto 0,5)`);
  await page.evaluate(() => { window.aoe.renderer.dayCycle.offset = 0; });
}

// ------------------------------------------------------------------------------------------------------------------
// 7. orçamento: a batalha mista 100 × 100 da Etapa 5 no preset alto (orçamento 2 000), capturada a zoom 1 e 2,2, e
//    depois a mesma batalha com Tempestade de Raios e Terremoto na linha inimiga (o pior caso do orçamento): conta as
//    partículas VIVAS a cada tick (pico), e nenhum efeito pode ficar sem handler.
if (want('orcamento')) {
  const T = ['hoplite', 'hypaspist', 'toxotes', 'peltast', 'hippeus', 'petrobolos', 'chimera'];
  await newGame(T, 'continental', 'large');
  const b = await page.evaluate(() => {
    const s = window.aoe.session, st = s.state, me = s.local, foe = (me + 1) % st.players.length;
    const sp = window.aoe.debugSpawn, ids = window.__ids, tough = window.__tough;
    const A = window.__area(44, 24, { minTc: 20, minFree: 0.985 }) ?? window.__area(44, 24, { minTc: 20 });
    const cx = A.x + 22, cy = A.y + 11, types = ['hoplite', 'toxotes', 'hypaspist', 'peltast', 'hippeus'];
    const a = [], bb = [];
    // 96 em 12 fileiras de 8 (infantaria, arqueiros, dardos e cavalaria misturados) + 4 petróbolos de cada lado; do nosso,
    // 2 no lugar de 2 petróbolos são quimeras (o fogo em flipbook do `splash`)
    for (let i = 0; i < 96; i++) {
      const t = types[i % 5], col = i % 8, row = Math.floor(i / 8);
      a.push(tough(sp(me, t, cx - 7 - col * 0.9, cy - 8 + row * 1.35), 1500));
      bb.push(tough(sp(foe, t, cx + 7 + col * 0.9, cy - 8 + row * 1.35), 1500));
    }
    for (let i = 0; i < 4; i++) {
      a.push(tough(sp(me, i < 2 ? 'chimera' : 'petrobolos', cx - (i < 2 ? 5 : 16), cy - 3 + i * 2), 1500));
      bb.push(tough(sp(foe, 'petrobolos', cx + 16, cy - 3 + i * 2), 1500));
    }
    // o nosso quartel muito danificado atrás da linha (fogo em flipbook e fumaça; dano 2 = hp < 1/3)
    const bar = window.__build(me, 'barracks', cx - 13, cy + 9);
    if (bar) { bar.maxHp = 60000; bar.hp = 60000 * 0.2; }
    s.issue({ type: 'attackMove', player: me, ids: ids(a), x: cx + 10, y: cy });
    s.scheduler.issue({ type: 'attackMove', player: foe, ids: ids(bb), x: cx - 10, y: cy });
    st.players[me].powers = [{ id: 'lightning_storm', used: false }, { id: 'earthquake', used: false }];
    st.players[me].age = 3;
    return { c: { x: cx, y: cy }, A, units: st.units.size, mine: a.filter(Boolean).length, theirs: bb.filter(Boolean).length, bar: !!bar };
  });
  console.log('batalha:', JSON.stringify(b));
  // o meio da luta agora: média de quem está golpeando/atirando (senão, o centro da cena)
  const fightAt = () => page.evaluate((c) => { let x = 0, y = 0, n = 0; for (const u of window.aoe.session.state.units.values()) if (u.state === 'attack' && u.hp > 0) { x += u.x; y += u.y; n++; } return n ? { x: x / n, y: y / n } : c; }, b.c);
  need(b.mine >= 100 && b.theirs >= 100, `batalha: ${b.mine} × ${b.theirs} unidades (esperado 100 × 100)`);
  await setQuality('high', true);
  await settle(T);
  await page.evaluate(() => window.aoe.renderer.fx.particles.resetStats());
  await startSampler();
  await look(b.c, 1.0);
  await run(1); await waitTicks(150); await pause();
  await look({ x: b.c.x - 3, y: b.c.y + 1 }, 1.0);
  await shot('batalha-z10');
  await look(await fightAt(), 2.2);
  await run(1); await waitTicks(12); await pause();
  await look(await fightAt(), 2.2);
  await shot('batalha-z22');
  await look(b.c, 1.0);
  await run(1); await waitTicks(40); await pause();
  const S = await stopSampler();
  const st = await checkFx('batalha');
  console.log('batalha 100×100 fx:', JSON.stringify({ peak: S.peak, budget: st.budget, dropped: st.dropped, proj: S.proj, kinds: S.projKinds, add: S.add, dust: S.dust, fire: S.fire, smoke: S.smoke, decals: S.decals }));
  need(st.budget === 2000, `batalha: orçamento do preset alto ${st.budget} ≠ 2000`);
  need(S.peak <= 2000, `batalha: pico ${S.peak} > 2000`);
  need(S.proj > 0 && S.projKinds.arrow > 0 && S.projKinds.javelin > 0 && S.projKinds.stone > 0, `batalha: faltam projéteis (${JSON.stringify(S.projKinds)})`);
  need(S.add > 0 && S.dust > 0 && S.fire > 0, `batalha: sem faíscas (${S.add}), poeira (${S.dust}) ou fogo (${S.fire})`);
  // o pior caso: os dois poderes de área mais pesados caindo no meio da mesma batalha
  await page.evaluate(() => window.aoe.renderer.fx.particles.resetStats());
  await startSampler();
  await use('lightning_storm', { x: b.c.x + 4, y: b.c.y });
  await use('earthquake', { x: b.c.x + 6, y: b.c.y + 3 });
  await run(1); await waitTicks(80); await pause();
  const S2 = await stopSampler();
  const st2 = await checkFx('batalha + poderes');
  console.log('batalha 100×100 + Tempestade + Terremoto fx:', JSON.stringify({ peak: S2.peak, budget: st2.budget, dropped: st2.dropped, decals: S2.decals }));
  need(S2.peak <= 2000, `batalha + poderes: pico ${S2.peak} > 2000`);
  await setQuality('medium', true);
}

console.log('erros:', errors.length ? '\n' + errors.join('\n') : 'nenhum');
await browser.close();
if (errors.length) process.exit(1);
