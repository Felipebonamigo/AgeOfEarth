// Capturas da página da loja (docs/STEAM.md §5, checklist 6.3; `docs/steam/LOJA.md`): 1920×1080, preset Alta, arte assada,
// HUD visível, em cenas montadas sobre uma partida de verdade — 4 IAs Muito difícil num mapa grande avançadas `--minutes`
// de jogo sem renderizar (o jogador local também é IA, para ter uma cidade de verdade e o HUD de uma partida em
// andamento). Cenas: `cidade` (a maior cidade de IA da partida, mapa revelado), `cerco` (helépoles, petróbolos, falange e
// Héracles contra a cidade de outra IA), `batalha` (falange, arqueiros, cavalaria, cerco e heróis contra criaturas míticas numa clareira), `poder` (Tempestade de
// Raios sobre o exército inimigo), `tita` (Cronos erguendo-se diante do exército), `campanha` (a batalha final, m12, em
// andamento, com fala e objetivos) e `editor` (cópia do mapa Egeu no editor, paleta de edifícios e o fantasma do templo). Saída: <out>/<nn>-<cena>.jpg
// (JPEG 92, como a Steam aceita) e falha com erro de página ou cena vazia.
// Exige `npm run preview`. Uso: node scripts/storeshots.mjs [url] [--out docs/steam/screens] [--minutes 22] [--seed 7]
//   [--only cidade,batalha,…] [--lang pt|en]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const url = pos[0] ?? 'http://localhost:4173/';
const outDir = opt('--out', 'docs/steam/screens');
const MINUTES = Number(opt('--minutes', '22'));
const SEED = Number(opt('--seed', '7'));
const LANG = opt('--lang', 'pt');
const only = opt('--only', '')?.split(',').filter(Boolean) ?? [];
const want = (s) => !only.length || only.includes(s);
const W = 1920, H = 1080;
mkdirSync(outDir, { recursive: true });

const errors = [];
const need = (cond, msg) => { if (!cond) errors.push(msg); };
const browser = await chromium.launch({ env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' }, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function newPage({ campaign = false } = {}) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript(([lang, campaign]) => {
    try {
      const k = 'aoe_settings_v1';
      localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), edgeScroll: false, quality: 'high', bakedArt: true, showFps: false, dayCycle: false }));
      localStorage.setItem('aoe_locale', lang);
      // campanha aberta até a m12 (só nesta página do Chromium de captura)
      if (campaign) localStorage.setItem('aoe_campaign', JSON.stringify({ completed: ['m1_despertar', 'm2_cerco', 'm3_portal', 'm4_caucaso', 'm5_itaca', 'm6_estatua', 'm7_aquiles', 'm8_oceano', 'm9_tenaro', 'm10_otris', 'm11_chamas'] }));
    } catch { /* ignore */ }
  }, [LANG, campaign]);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.mouse.move(W - 4, H / 2);   // fora dos botões (sem dica flutuando) e sem rolar (edgeScroll desligado)
  return page;
}
let n = 0;
const ORDER = ['cidade', 'batalha', 'poder', 'tita', 'cerco', 'campanha', 'editor'];
async function shot(page, name) {
  await page.waitForTimeout(300);
  const f = join(outDir, `${String(ORDER.indexOf(name) + 1).padStart(2, '0')}-${name}.jpg`);
  await page.screenshot({ path: f, type: 'jpeg', quality: 92 });
  n++; console.log('captura:', f);
}
const look = (page, x, y, zoom) => page.evaluate(([x, y, z]) => { const c = window.aoe.renderer.cam; c.zoom = z; c.centerOn(x, y); }, [x, y, zoom]);
const tickNow = (page) => page.evaluate(() => window.aoe.session.state.tick);
async function waitTicks(page, t, timeout = 240000) {
  const end = (await tickNow(page)) + t;
  await page.waitForFunction((e) => window.aoe.session.state.tick >= e, end, { timeout, polling: 50 });
}
const run = (page, speed = 1) => page.evaluate((sp) => { window.aoe.session.paused = false; window.aoe.session.speed = sp; }, speed);
const pause = (page) => page.evaluate(() => { window.aoe.session.paused = true; });
const ready = (page, types = []) => page.evaluate((t) => { window.aoe.applyQuality(); window.aoe.renderer.art.prewarmUnits(t); return window.aoe.renderer.art.ready(); }, types);

// ——— partida de verdade: 4 IAs, mapa grande, avançada sem renderizar ———
const ARMY = ['hoplite', 'toxotes', 'hetairoi', 'petrobolos', 'achilles', 'heracles', 'minotaur', 'cyclops', 'hydra', 'medusa', 'chimera', 'manticore', 'peltast', 'cronus', 'helepolis'];
if (['cidade', 'cerco', 'batalha', 'poder', 'tita'].some(want)) {
  const page = await newPage();
  await page.evaluate(([seed]) => {
    const gods = ['zeus', 'poseidon', 'hades', 'zeus'], names = ['Péricles', 'Leônidas', 'Agamenon', 'Temístocles'];
    const players = names.map((name, i) => ({ name, god: gods[i], isAI: i > 0, difficulty: 'brutal', team: i }));
    window.aoe.startGame({ seed, mapSize: 'large', players, revealMap: false, mode: 'conquest', mapType: 'continental' });
    const s = window.aoe.session, me = s.state.players[s.local];
    // o jogador local joga como IA durante o avanço (a partida precisa de um humano para ter o HUD; a IA volta a ser
    // dele antes das capturas)
    me.ai = { ...structuredClone(s.state.players[1].ai), personality: (seed * 13) % 97 }; me.isAI = true;
    s.paused = true;
  }, [SEED]);
  for (let done = 0; done < MINUTES * 60 * 20; done += 1200) await page.evaluate((k) => { const s = window.aoe.session; for (let i = 0; i < k && (s.state.winner ?? -1) < 0; i++) s.scheduler.step(s.state); }, 1200);
  const info = await page.evaluate(() => {
    const s = window.aoe.session, st = s.state, p = st.players[s.local];
    const bs = [...st.buildings.values()];
    // a cidade de vitrine: o jogador (IA) com mais edifícios, no Centro Cívico com mais edifícios em volta
    const cities = st.players.filter((q) => q.alive).map((q) => {
      const own = bs.filter((b) => b.owner === q.id);
      const tcs = own.filter((b) => b.type === 'town_center').map((tc) => ({ tc, near: own.filter((b) => Math.sqrt((b.x - tc.x) ** 2 + (b.y - tc.y) ** 2) < 16) }));
      tcs.sort((a, b) => b.near.length - a.near.length);
      const top = tcs[0];
      if (!top) return null;
      const cx = top.near.reduce((a, b) => a + b.x, 0) / top.near.length, cy = top.near.reduce((a, b) => a + b.y, 0) / top.near.length;
      return { id: q.id, n: own.length, tc: { id: top.tc.id, x: top.tc.x, y: top.tc.y }, cx, cy, near: top.near.length };
    }).filter(Boolean).sort((a, b) => b.n - a.n);
    return { age: p.age, pop: [...st.units.values()].filter((u) => u.owner === s.local).length, buildings: bs.filter((b) => b.owner === s.local).length, winner: st.winner ?? null, map: { w: st.map.w, h: st.map.h }, cities };
  });
  console.log(`partida após ${MINUTES} min:`, JSON.stringify(info));
  const rivals = info.cities.filter((c) => c.id !== 0);
  need(rivals.length >= 1, 'nenhuma cidade de IA de pé');
  // o HUD de uma partida em andamento: cofres de meio de jogo (o avanço deixou o jogador local no vermelho)
  await page.evaluate(() => { const s = window.aoe.session, p = s.state.players[s.local]; p.isAI = false; Object.assign(p.resources, { food: 2150, wood: 1480, gold: 1320 }); p.mods.player.popCap += 200; s.speed = 1; window.aoe.renderer.revealAll = true; });

  if (rivals[0] && want('cidade')) {
    const c = rivals[0];
    await look(page, c.cx, c.cy + 1, 1.2);
    await ready(page); await run(page); await waitTicks(page, 60); await pause(page); await ready(page);
    await shot(page, 'cidade');
  }
  if (rivals.length && want('cerco')) {
    // cerco: o nosso exército de cerco chega pelo lado do centro do mapa à cidade da segunda IA (ou da primeira)
    const c = rivals[1] ?? rivals[0];
    const at = await page.evaluate(([c, W, H]) => {
      const s = window.aoe.session, me = s.local, sp = window.aoe.debugSpawn;
      let dx = W / 2 - c.tc.x, dy = H / 2 - c.tc.y; const d = Math.sqrt(dx * dx + dy * dy) || 1; dx /= d; dy /= d;
      const ox = c.tc.x + dx * 13, oy = c.tc.y + dy * 13, px = -dy, py = dx;   // frente da coluna e o eixo lateral
      const put = (type, fwd, side) => sp(me, type, ox + dx * fwd + px * side, oy + dy * fwd + py * side);
      const army = [];
      for (let i = 0; i < 12; i++) army.push(put('hoplite', -Math.floor(i / 6) * 0.9, (i % 6 - 2.5) * 0.95));
      for (let i = 0; i < 6; i++) army.push(put('toxotes', 2.4, (i - 2.5) * 1.1));
      army.push(put('helepolis', -0.5, -4.5), put('helepolis', -0.5, 4.5), put('petrobolos', 4.2, -2.5), put('petrobolos', 4.2, 0), put('petrobolos', 4.2, 2.5), put('heracles', -2, 0));
      const ids = army.filter(Boolean).map((u) => u.id);
      for (const u of army) if (u) u.hp = u.maxHp = u.maxHp * 3;
      s.issue({ type: 'attackMove', player: me, ids, x: c.tc.x, y: c.tc.y, formation: 'line' });
      s.select?.([]);
      return { n: ids.length, x: (ox + c.tc.x) / 2, y: (oy + c.tc.y) / 2 };
    }, [c, info.map.w, info.map.h]);
    need(at.n >= 20, `cerco com poucas unidades: ${at.n}`);
    await ready(page, ['hoplite', 'toxotes', 'helepolis', 'petrobolos', 'heracles']);
    await look(page, at.x, at.y, 1.45);
    await run(page); await waitTicks(page, 180); await pause(page); await ready(page);
    await shot(page, 'cerco');
  }

  if (['batalha', 'poder', 'tita'].some(want)) {
    // clareira: a área 26×14 mais livre fora das cidades (tiles sem bloqueio, nó, edifício, água ou penhasco)
    const area = await page.evaluate(() => {
      const s = window.aoe.session, st = s.state, map = st.map;
      const open = (x, y) => { const i = y * map.w + x; return !map.blocked[i] && map.nodeAt[i] === -1 && map.buildingAt[i] === -1 && map.terrain[i] !== 1 && map.terrain[i] !== 2 && map.terrain[i] !== 5; };
      const tcs = [...st.buildings.values()].filter((b) => b.type === 'town_center');
      const w = 26, h = 14; let best = null, score = -Infinity;
      for (let y0 = 4; y0 + h <= map.h - 4; y0 += 2) for (let x0 = 4; x0 + w <= map.w - 4; x0 += 2) {
        const cx = x0 + w / 2, cy = y0 + h / 2;
        if (tcs.some((b) => Math.sqrt((cx - b.x) ** 2 + (cy - b.y) ** 2) < 22)) continue;
        let free = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (open(x, y)) free++;
        const sc = free - Math.sqrt((cx - map.w / 2) ** 2 + (cy - map.h / 2) ** 2) / 6;
        if (sc > score) { score = sc; best = { x: x0, y: y0, w, h, free }; }
      }
      return best;
    });
    console.log('clareira:', JSON.stringify(area));
    need(area && area.free > 0.8 * area.w * area.h, 'sem clareira para a batalha');
    const cx = area.x + area.w / 2, cy = area.y + area.h / 2;
    const setup = await page.evaluate(([cx, cy]) => {
      const s = window.aoe.session, st = s.state, me = s.local, sp = window.aoe.debugSpawn;
      const foe = st.players.find((q) => q.id !== me && q.alive)?.id ?? (me + 1) % st.players.length;
      const mine = [], theirs = [];
      // falange de hoplitas em 3 fileiras, arqueiros atrás, cavalaria no flanco, petróbolos na retaguarda, heróis à frente
      for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) mine.push(sp(me, 'hoplite', cx - 3.5 - r * 0.9, cy - 3.5 + i * 0.95));
      for (let i = 0; i < 8; i++) mine.push(sp(me, 'toxotes', cx - 7 - (i % 2) * 0.9, cy - 3 + Math.floor(i / 2) * 1.8));
      for (let i = 0; i < 5; i++) mine.push(sp(me, 'hetairoi', cx - 4 + i * 1.1, cy + 5));
      mine.push(sp(me, 'petrobolos', cx - 9.5, cy - 2), sp(me, 'petrobolos', cx - 9.5, cy + 2));
      const heroes = [sp(me, 'achilles', cx - 2, cy - 0.8), sp(me, 'heracles', cx - 2, cy + 1.2), sp(me, 'minotaur', cx - 2.2, cy + 3.4)];
      for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) theirs.push(sp(foe, i % 3 === 2 ? 'peltast' : 'hoplite', cx + 3.5 + r * 0.9, cy - 3 + i * 0.95));
      theirs.push(sp(foe, 'cyclops', cx + 2, cy - 2), sp(foe, 'hydra', cx + 2.2, cy + 1.5), sp(foe, 'medusa', cx + 6, cy + 3.8), sp(foe, 'chimera', cx + 2.6, cy + 4.4), sp(foe, 'manticore', cx + 6.2, cy - 4.2));
      const ids = (l) => l.filter(Boolean).map((u) => u.id);
      for (const u of [...mine, ...heroes, ...theirs]) if (u) u.hp = u.maxHp = u.maxHp * 4;   // a luta dura a cena inteira
      s.issue({ type: 'attackMove', player: me, ids: ids(mine), x: cx + 6, y: cy, formation: 'line' });
      s.issue({ type: 'attackMove', player: me, ids: ids(heroes), x: cx + 6, y: cy });
      s.scheduler.issue({ type: 'attackMove', player: foe, ids: ids(theirs), x: cx - 6, y: cy });
      s.select?.(ids(heroes));   // os heróis selecionados: o painel mostra as habilidades Q sem encher a cena de anéis
      return { mine: ids(mine).length + ids(heroes).length, theirs: ids(theirs).length, foe };
    }, [cx, cy]);
    need(setup.mine >= 40 && setup.theirs >= 15, `batalha com poucas unidades: ${JSON.stringify(setup)}`);
    await ready(page, ARMY);
    await look(page, cx - 0.5, cy + 0.5, 1.9);
    if (want('batalha')) { await run(page); await waitTicks(page, 70); await pause(page); await ready(page, ARMY); await shot(page, 'batalha'); }
    if (want('poder')) {
      const foeAt = await page.evaluate(([cx, cy, foe]) => {
        const s = window.aoe.session; s.state.players[s.local].powers.push({ id: 'lightning_storm', used: false });
        const us = [...s.state.units.values()].filter((u) => u.owner === foe && Math.sqrt((u.x - cx) ** 2 + (u.y - cy) ** 2) < 12);
        const x = us.reduce((a, u) => a + u.x, 0) / (us.length || 1), y = us.reduce((a, u) => a + u.y, 0) / (us.length || 1);
        s.issue({ type: 'power', player: s.local, power: 'lightning_storm', x: us.length ? x : cx + 3, y: us.length ? y : cy });
        return { x: us.length ? x : cx + 3, y: us.length ? y : cy };
      }, [cx, cy, setup.foe]);
      await look(page, foeAt.x - 2, foeAt.y, 1.6);
      await run(page); await waitTicks(page, 34); await pause(page);
      const used = await page.evaluate(() => { const s = window.aoe.session; return s.state.players[s.local].powers.find((p) => p.id === 'lightning_storm')?.used; });
      need(used, 'poder: a Tempestade de Raios não foi lançada');
      await shot(page, 'poder');
    }
    if (want('tita')) {
      const tid = await page.evaluate(([cx, cy, foe]) => {
        const s = window.aoe.session; const t = window.aoe.debugSpawn(foe, 'cronus', cx + 6, cy + 0.5);
        if (t) { t.hp = t.maxHp = t.maxHp * 4; s.scheduler.issue({ type: 'attackMove', player: foe, ids: [t.id], x: cx - 6, y: cy }); }
        s.select?.([]);
        return t?.id ?? null;
      }, [cx, cy, setup.foe]);
      need(tid !== null, 'titã: Cronos não nasceu');
      await ready(page, ['cronus']);
      await look(page, cx + 3, cy - 0.5, 1.6);
      await run(page); await waitTicks(page, 150); await pause(page); await ready(page, ['cronus']);
      const t = await page.evaluate((id) => { const u = window.aoe.session.state.units.get(id); return u ? { x: u.x, y: u.y } : null; }, tid);
      if (t) await look(page, t.x - 2.5, t.y - 1.2, 1.6);
      await shot(page, 'tita');
    }
  }
  await page.close();
}

// ——— campanha: a batalha final (m12) em andamento, com fala e objetivos ———
if (want('campanha')) {
  const page = await newPage({ campaign: true });
  await page.click('[data-tab="campaign"]'); await page.waitForTimeout(300);
  await page.click('.mission[data-id="m12_titanomaquia"]'); await page.waitForTimeout(1500);
  await page.click('#m-go'); await page.waitForTimeout(2500);
  const ok = await page.evaluate(() => window.aoe.session?.state.scenario?.id ?? window.aoe.session?.state.config?.scenarioId ?? !!window.aoe.session?.state.scenario);
  need(ok, 'campanha: a m12 não começou');
  await ready(page);
  await run(page, 3);
  // a fala do juramento (gatilho aos 25 s de jogo; as falas ficam na tela pelo relógio real, em fila)
  await page.waitForFunction(() => { const s = window.aoe.session; const d = document.getElementById('dialogue'); return s.state.tick > 26 * 20 && !!d && !d.classList.contains('hidden') && d.textContent.trim().length > 20; }, null, { timeout: 240000, polling: 100 }).catch(() => errors.push('campanha: nenhuma fala depois de 26 s'));
  await pause(page); await ready(page); await page.waitForTimeout(600);
  await shot(page, 'campanha');
  await page.close();
}

// ——— editor: cópia do Egeu com a paleta de edifícios, no início do jogador 1 ———
if (want('editor')) {
  const page = await newPage();
  await page.evaluate(() => { localStorage.removeItem('aoe_editor_autosave'); });
  await page.click('#menu [data-tab="editor"]'); await page.waitForTimeout(300);
  const card = await page.$('.mapcard[data-id="egeu"] [data-act="copy"]') ?? await page.$('.mapcard [data-act="copy"]');
  need(card, 'editor: sem mapa embutido para copiar');
  if (card) {
    await card.click(); await page.waitForTimeout(2000);
    await page.click('#editor .tool[data-tool="building"]'); await page.waitForTimeout(200);
    const chip = await page.$('#editor .chip[data-building="temple"]');
    need(chip, 'editor: sem o templo na paleta');
    if (chip) { await chip.click(); await page.waitForTimeout(200); }
    const at = await page.evaluate(() => { const f = window.aoe.editor?.toFile?.(); const s = f?.starts?.[0]; return s ? { x: s[0], y: s[1] } : null; });
    need(at, 'editor: sem início no mapa');
    if (at) await look(page, at.x + 4, at.y + 2, 1.15);
    await page.mouse.move(W / 2 + 180, H / 2 - 40);   // o fantasma do templo sob o cursor
    await page.waitForTimeout(1200);
    await shot(page, 'editor');
  }
  await page.close();
}

await browser.close();
if (!n) errors.push('nenhuma captura');
if (errors.length) { console.error('FALHOU:\n  ' + [...new Set(errors)].join('\n  ')); process.exit(1); }
console.log(`ok: ${n} capturas em ${outDir}`);
