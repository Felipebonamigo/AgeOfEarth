// Capturas da Etapa 3 para o dono aprovar (docs/ART.md §5, critério "uma cidade completa por Idade"): para cada Idade
// (Arcaica, Clássica, Heroica, Mítica) uma partida com semente fixa (42, mapa pequeno, 1 IA fácil) e, na área aberta
// mais livre perto do Centro Cívico, uma cidade murada montada por debugBuild com TODOS os edifícios que a Idade libera —
// Centro Cívico na variante da Idade, casas, fazendas nas três plantações, armazéns, templo, quartel e, conforme a Idade,
// mercado, estábulo, academia, oficina de cerco, fortaleza, uma maravilha e a cornucópia —, mais obras nos três estágios,
// danificados (fumaça), os escombros de uma casa derrubada, muralha com torres nos cantos e ladeando o portão sul, trechos
// da muralha em obra e danificados, portão sul aberto (um cidadão aliado passando) e portão leste (eixo norte-sul);
// cidadãos colhendo nas fazendas e uma fileira de hoplitas na rua de baixo. As quadras seguem um traçado em grade
// (ruas de 1 tile, fachadas alinhadas na rua de baixo de cada fileira, fileiras centradas). Por fim, uma praça com as
// 3 Maravilhas e o Portal dos Titãs (vórtice aceso) na Idade dos Titãs.
// Capturas: <out>/<prefix>-{arcaica,classica,heroica,mitica,maravilhas}.png (zoom que enquadra a cidade inteira, ≤ 1,3).
// Falha se houver erro de página, se algum edifício da cena não couber ou não sair assado, se faltar algum estado pedido
// (obra 0–2, dano 1–2, fazenda nas 3 plantações), se o Centro Cívico não usar a variante da Idade, se o portão não abrir,
// se não houver fumaça nem escombros ou se o portal não mostrar o brilho.
// Exige `npm run preview` (ou a URL passada). Uso: node scripts/artages.mjs [url] [--out docs/art] [--prefix etapa3-cidade]
//   [--only arcaica,mitica,…]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const url = pos[0] ?? 'http://localhost:4173/';
const outDir = opt('--out', 'docs/art');
const prefix = opt('--prefix', 'etapa3-cidade');
const only = opt('--only', null)?.split(',');
mkdirSync(outDir, { recursive: true });

/** Idade mínima de cada tipo (src/core/data/buildings.ts); a cornucópia (poder "Fartura") entra na cidade Mítica. */
const AGE_OF = { market: 1, stable: 1, academy: 1, siege_workshop: 2, fortress: 2, wonder_zeus: 3, wonder_artemis: 3, wonder_colossus: 3, cornucopia: 3, titan_gate: 4 };
const TC_TIER = ['a0', 'a1', 'a1', 'a2', 'a2'];

/**
 * Quadras da cidade, uma lista por fileira: { t: tipo, frac: obra 0–1, hp: fração da vida, crop: segundos de plantação,
 * destroy: derrubado (escombros) }, filtradas pela Idade. Fileiras: cívica (templo, Centro Cívico, maravilha, academia),
 * militar/comércio, armazéns, campos (as 3 plantações, fazenda em obra e queimada, casas em obra) e obras/danos da Idade.
 */
function cityPlan(age) {
  const obras = [
    [{ t: 'barracks', frac: 0.85 }, { t: 'temple', hp: 0.3 }, { t: 'granary', frac: 0.15 }],
    [{ t: 'stable', frac: 0.5 }, { t: 'academy', hp: 0.3 }, { t: 'barracks', frac: 0.85 }],
    [{ t: 'fortress', frac: 0.5 }, { t: 'siege_workshop', hp: 0.3 }, { t: 'stable', frac: 0.15 }],
    [{ t: 'wonder_colossus', frac: 0.45 }, { t: 'fortress', hp: 0.3 }, { t: 'academy', frac: 0.85 }],
  ][age];
  const rows = [
    [{ t: 'temple' }, { t: 'town_center' }, { t: 'wonder_zeus' }, { t: 'academy' }],
    [{ t: 'house' }, { t: 'house', hp: 0.55 }, { t: 'barracks' }, { t: 'stable' }, { t: 'fortress' }, { t: 'market' }],
    [{ t: 'granary' }, { t: 'lumber_camp', hp: 0.55 }, { t: 'mine' }, { t: 'siege_workshop' }, { t: 'cornucopia' }, { t: 'market', hp: 0.25, age: 1 }],
    [{ t: 'farm', crop: 5 }, { t: 'farm', crop: 70 }, { t: 'farm', crop: 120 }, { t: 'farm', frac: 0.5 }, { t: 'farm', crop: 120, hp: 0.3 },
      { t: 'house', frac: 0.15 }, { t: 'house', frac: 0.5 }],
    [{ t: 'house', hp: 0.25 }, { t: 'house', destroy: true }, ...obras],
  ];
  return rows.map((r) => r.filter((it) => (it.age ?? AGE_OF[it.t] ?? 0) <= age));
}

/**
 * Traçado em grade: 1 tile de rua entre quadras e entre fileiras, fachadas alinhadas na rua de baixo de cada fileira,
 * fileiras centradas. As fileiras curtas ganham casas prontas (alternando nas duas pontas) até quase a largura da maior:
 * a cidade fica cheia como uma cidade de verdade, com o bloco cívico no meio.
 */
function layout(rows, sizes) {
  const width = (l) => l.reduce((s, it) => s + sizes[it.t][0], 0) + l.length - 1;
  const inner = Math.max(...rows.map(width));
  const lines = rows.map((r) => {
    const l = [...r];
    for (let k = 0; width(l) + 3 <= inner; k++) if (k % 2) l.unshift({ t: 'house' }); else l.push({ t: 'house' });
    return l;
  });
  const placed = [];
  let y = 2;
  for (const l of lines) {
    const rh = Math.max(...l.map((it) => sizes[it.t][1]));
    let x = 2 + Math.floor((inner - width(l)) / 2);
    for (const it of l) { const [bw, bh] = sizes[it.t]; placed.push({ ...it, x, y: y + rh - bh }); x += bw + 1; }
    y += rh + 1;
  }
  // anel: 1 tile de rua a oeste/norte, 2 a leste/sul (portões com a passagem livre)
  return { placed, W: inner + 5, H: y + 2 };
}

const SIZES = {
  town_center: [3, 3], house: [2, 2], farm: [2, 2], granary: [2, 2], lumber_camp: [2, 2], mine: [2, 2], market: [3, 3], temple: [3, 3],
  barracks: [3, 3], stable: [3, 3], siege_workshop: [3, 3], academy: [3, 3], fortress: [4, 4], wonder_zeus: [4, 4], wonder_artemis: [4, 4],
  wonder_colossus: [4, 4], titan_gate: [5, 5], cornucopia: [2, 2],
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const VIEW = { width: 1440, height: 900 };

async function scene(name, age, build, extra, W, H) {
  // enquadra a cidade inteira (os edifícios sobem ≈ 2–3 tiles acima da pegada), zoom ≤ 1,3; a área escolhida deixa a
  // tela inteira dentro do mapa (sem a faixa escura além da borda)
  const zoom = Math.min(1.3, VIEW.width / ((W + 3) * 32), VIEW.height / ((H + 4.5) * 32));
  const view = { w: VIEW.width / (32 * zoom), h: VIEW.height / (32 * zoom), dy: -0.8 };
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
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
  await page.evaluate(installArea, view);
  const sc = await page.evaluate(build, { age, SIZES, W, H, ...extra });
  console.log(`${name}: ${JSON.stringify({ x0: sc.x0, y0: sc.y0, W: sc.W, H: sc.H, edifícios: sc.made.length, falhas: sc.failed })}`);
  for (const f of sc.failed) errs.push(`${name}: não coube ${f}`);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.aoe.applyQuality());
  // 4 s de JOGO (por software a partida anda mais devagar que o relógio): a fumaça sobe, o colapso (1,5 s) termina e
  // sobram os escombros, o cidadão chega ao portão, a colheita começa
  const t0 = await page.evaluate(() => { const s = window.aoe.session; s.paused = false; s.speed = 1; return s.state.tick; });
  await page.waitForFunction((t) => window.aoe.session.state.tick >= t + 80, t0, { timeout: 60000, polling: 100 });
  await page.evaluate(() => { window.aoe.session.paused = true; });
  await page.evaluate(([x, y, z]) => { const c = window.aoe.renderer.cam; c.zoom = z; c.centerOn(x, y); }, [sc.x0 + W / 2, sc.y0 + H / 2 + view.dy, zoom]);
  await page.waitForTimeout(900);
  const file = join(outDir, `${prefix}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`captura: ${file} (zoom ${zoom.toFixed(2)})`);
  const ck = await page.evaluate(() => {
    const s = window.aoe.session, R = window.aoe.renderer, out = { baked: 0, procedural: [], states: {}, variants: {}, open: 0, smoke: R.smoke.count, rubble: R.rubbleViews.length, glow: 0 };
    for (const [id, v] of R.views) {
      const b = s.state.buildings.get(id); if (!b || b.owner !== s.local) continue;
      if (!v.bld) { out.procedural.push(b.type); continue; }
      out.baked++;
      out.states[`${b.type}:${v.bld.state}`] = (out.states[`${b.type}:${v.bld.state}`] ?? 0) + 1;
      if (v.bld.variant) out.variants[`${b.type}:${v.bld.variant}`] = (out.variants[`${b.type}:${v.bld.variant}`] ?? 0) + 1;
      if (b.type === 'gate' && v.bld.state === 'open') out.open++;
      if (v.bld.glowSprite?.visible) out.glow++;
    }
    return out;
  });
  console.log(`  conferência: ${JSON.stringify(ck)}`);
  if (ck.procedural.length) errs.push(`${name}: procedurais ${[...new Set(ck.procedural)].join(', ')}`);
  for (const k of sc.expect) if (!ck.states[k] && !ck.variants[k]) errs.push(`${name}: nenhum ${k}`);
  if (sc.walls && ck.open < 1) errs.push(`${name}: portão sul não abriu`);
  if (sc.walls && ck.smoke < 1) errs.push(`${name}: sem fumaça nos danificados`);
  if (sc.walls && ck.rubble < 1) errs.push(`${name}: sem escombros`);
  if (sc.glow && ck.glow < 1) errs.push(`${name}: portal sem o brilho`);
  errors.push(...errs);
  await page.close();
}

/**
 * Instala na página `window.__area(W, H)`: o retângulo W × H (+ 1 de margem) sem edifícios, com o mínimo de água,
 * montanha e nós, a até 60 tiles do Centro Cívico do jogador e com a tela (`view`, em tiles, centrada na área) dentro
 * do mapa; o que sobrar vira grama livre (cena de teste, fora do lockstep: nós saem, água/montanha viram grama) e o
 * renderizador refaz terreno e props do retângulo. Devolve o canto { x0, y0 }.
 */
function installArea(view) {
  window.__area = (W, H) => {
    const s = window.aoe.session, st = s.state, map = st.map, me = s.local;
    const tc = [...st.buildings.values()].find((b) => b.owner === me && b.type === 'town_center');
    let best = null, bestScore = -Infinity;
    for (let y0 = 3; y0 + H < map.h - 3; y0++) for (let x0 = 3; x0 + W < map.w - 3; x0++) {
      const d = Math.hypot(x0 + W / 2 - tc.x, y0 + H / 2 - tc.y); if (d > 60) continue;
      const cx = x0 + W / 2, cy = y0 + H / 2 + view.dy;
      const out = Math.max(0, view.w / 2 - cx) + Math.max(0, cx + view.w / 2 - map.w) + Math.max(0, view.h / 2 - cy) + Math.max(0, cy + view.h / 2 - map.h);
      let n = 0, bad = false;
      for (let y = y0 - 1; y <= y0 + H && !bad; y++) for (let x = x0 - 1; x <= x0 + W; x++) {
        const i = y * map.w + x, t = map.terrain[i];
        if (map.buildingAt[i] !== -1) { bad = true; break; }
        n += t === 1 || t === 2 || t === 5 ? -3 : map.nodeAt[i] === -1 ? 1 : 0.3;
      }
      if (bad) continue;
      const score = n - d * 0.3 - out * 400;
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
    return best;
  };
}

/** Cidade murada da Idade `age` (roda na página). */
function buildCity({ age, plan, TC_TIER }) {
  const s = window.aoe.session, st = s.state, map = st.map, me = s.local;
  const { placed, W, H } = plan;
  const { x0, y0 } = window.__area(W, H);
  st.players[me].age = age;
  const failed = [], made = [];
  const B = (type, tx, ty, frac = 1) => { const b = window.aoe.debugBuild(me, type, x0 + tx, y0 + ty, frac); if (!b) failed.push(`${type}@${tx},${ty}`); else made.push(b.id); return b; };
  // muralha: torres nos cantos e ladeando o portão sul (eixo leste-oeste); portão leste (eixo norte-sul)
  const gx = Math.floor(W / 2), gy = Math.floor(H / 2);
  const towerAt = (x, y) => (x === 0 || x === W - 1) && (y === 0 || y === H - 1) || (y === H - 1 && (x === gx - 2 || x === gx + 2));
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) B(towerAt(x, y) ? 'tower' : x === gx && y === H - 1 ? 'gate' : 'wall', x, y);
  for (let y = 1; y < H - 1; y++) for (const x of [0, W - 1]) B(x === W - 1 && y === gy ? 'gate' : 'wall', x, y);
  // norte: um trecho em obra (três estágios) e outro danificado
  const wallAt = (x, y) => st.buildings.get(map.buildingAt[(y0 + y) * map.w + x0 + x]);
  const k0 = Math.max(3, W - 9);
  [0.15, 0.5, 0.85].forEach((f, i) => { const w = wallAt(k0 + i, 0); if (w) { w.complete = false; w.progress = f * 6; w.hp = Math.max(1, w.maxHp * f); } });
  [0.55, 0.25, 0.6].forEach((f, i) => { const w = wallAt(3 + i, 0); if (w) w.hp = w.maxHp * f; });
  // quadras
  const farms = [];
  let doomed = null;
  for (const it of placed) {
    const b = B(it.t, it.x, it.y, it.frac ?? 1);
    if (!b) continue;
    if (it.hp) b.hp = b.maxHp * it.hp;
    if (it.crop !== undefined) { b.builtTick = st.tick - it.crop * 20; if (!it.hp) farms.push(b); }
    if (it.destroy) doomed = b;
  }
  if (doomed) window.aoe.debugDestroy(doomed.id);
  // gente: cidadãos colhendo, um cidadão entrando pelo portão sul (abre), hoplitas na rua de baixo
  const sp = window.aoe.debugSpawn;
  for (const f of farms) { const u = sp(me, 'villager', f.x, f.y + 1.2); if (u) s.issue({ type: 'gather', player: me, ids: [u.id], targetId: f.id }); }
  sp(me, 'villager', x0 + gx + 0.5, y0 + H + 0.3);
  for (let i = 0; i < 6; i++) sp(me, 'hoplite', x0 + 2.5 + i * 0.8, y0 + H - 2.4);
  window.aoe.renderer.revealAll = true;
  const expect = [`town_center:${TC_TIER[age]}`, 'house:build0', 'house:build1', 'house:damage1', 'house:damage2', 'farm:sown', 'farm:growing', 'farm:ripe', 'farm:build1', 'wall:damage2', 'gate:open', 'tower:complete'];
  for (const it of placed) {
    if (it.frac !== undefined && it.frac < 1) expect.push(`${it.t}:build${it.frac < 1 / 3 ? 0 : it.frac < 2 / 3 ? 1 : 2}`);
    else if (it.hp) expect.push(`${it.t}:damage${it.hp < 1 / 3 ? 2 : 1}`);
    else if (!it.destroy && it.crop === undefined) expect.push(`${it.t}:complete`);
  }
  return { x0, y0, W, H, made, failed, expect: [...new Set(expect)], walls: true };
}

/** Praça das maravilhas: as três e o Portal dos Titãs prontos, Idade dos Titãs (o portal não liberta o titã). */
function buildWonders({ W, H }) {
  const s = window.aoe.session, st = s.state, me = s.local;
  const { x0, y0 } = window.__area(W, H);
  st.players[me].age = 4;
  st.players[me].titanSpawned = true;
  const failed = [], made = [];
  const B = (type, tx, ty) => { const b = window.aoe.debugBuild(me, type, x0 + tx, y0 + ty, 1); if (!b) failed.push(`${type}@${tx},${ty}`); else made.push(b.id); return b; };
  B('wonder_zeus', 1, 3); B('wonder_artemis', 7, 3); B('wonder_colossus', 13, 3); B('titan_gate', 19, 2);
  // gente para a escala: hoplitas e cidadãos na frente das maravilhas
  const sp = window.aoe.debugSpawn;
  for (let i = 0; i < 8; i++) sp(me, 'hoplite', x0 + 3 + i * 0.8, y0 + 9.2);
  for (let i = 0; i < 4; i++) sp(me, 'villager', x0 + 15 + i * 1.1, y0 + 9.4);
  window.aoe.renderer.revealAll = true;
  return { x0, y0, W, H, made, failed, expect: ['wonder_zeus:complete', 'wonder_artemis:complete', 'wonder_colossus:complete', 'titan_gate:complete'], walls: false, glow: true };
}

const AGES = [['arcaica', 0], ['classica', 1], ['heroica', 2], ['mitica', 3]];
for (const [name, age] of AGES) {
  if (only && !only.includes(name)) continue;
  const plan = layout(cityPlan(age), SIZES);
  await scene(name, age, buildCity, { plan, TC_TIER }, plan.W, plan.H);
}
if (!only || only.includes('maravilhas')) await scene('maravilhas', 4, buildWonders, {}, 26, 12);

console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
if (errors.length) process.exit(1);
