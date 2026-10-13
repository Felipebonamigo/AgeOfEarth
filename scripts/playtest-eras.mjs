// 8 Eras no navegador (E9, docs/eras/E9-E10-interface-balanceamento.md): uma partida rápida atravessa as Eras I → VIII pelo
// caminho do jogador — avanço na Biblioteca (tecla E) e carta do deus menor (II–VII) —, com atalhos de teste só para os
// requisitos (estudos das linhas em player.techs, edifícios por debugBuild, cofres cheios) e a simulação por
// scheduler.step. Em cada Era: topo (nome, petróleo só da IV), painel da Biblioteca, árvore (8 colunas, Era atual
// marcada), Quartel com o degrau atual da Infantaria pesada, enciclopédia (8 abas), nenhum emoji e nenhum ícone vazio;
// grava <out>/eras-e9-era<n>[-en].png. Código de saída 1 em qualquer falha.
// Uso: node scripts/playtest-eras.mjs [url] [--lang pt|en] [--out docs/art]   (exige `npm run build && npm run preview`)
import { chromium } from 'playwright';
import fs from 'node:fs';
const args = process.argv.slice(2);
const url = args[0] && !args[0].startsWith('--') ? args[0] : 'http://localhost:4173/';
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const LANG = opt('--lang', 'pt'), OUT = opt('--out', 'docs/art');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' }, executablePath: fs.existsSync(CHROME) ? CHROME : undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [], errors = [];
const check = (label, cond, extra = '') => { console.log(`${label}: ${cond ? 'ok' : 'FALHOU'}${extra ? ' | ' + extra : ''}`); if (!cond) failures.push(label); };
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}]/u;
const emojiIn = (sel) => page.evaluate(([s, src]) => { const re = new RegExp(src, 'u'); const root = document.querySelector(s); if (!root) return []; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const hits = []; for (let n = w.nextNode(); n; n = w.nextNode()) if (re.test(n.nodeValue ?? '') && !n.parentElement?.closest('[data-raw], .hidden')) hits.push((n.nodeValue ?? '').trim().slice(0, 40)); return hits; }, [sel, EMOJI.source]);

await page.goto(url, { waitUntil: 'networkidle' });
await page.selectOption('#m-locale', LANG).catch(() => {});
await page.fill('#m-seed', '31'); await page.selectOption('#m-ais', '1').catch(() => {});
await page.click('#m-start');
await page.waitForFunction(() => window.aoe?.session, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const s = window.aoe.session; s.paused = true;
  window.__build = (type) => {   // edifício pronto perto do Centro Cívico (anel de tentativas, como no playtest-noemoji)
    const st = s.state; const old = [...st.buildings.values()].find((x) => x.owner === s.local && x.type === type && !x.dead); if (old) return old;
    const tc = [...st.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center');
    for (let r = 5; r < 18; r++) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; const b = window.aoe.debugBuild(s.local, type, Math.round(tc.x + Math.cos(a) * r), Math.round(tc.y + Math.sin(a) * r)); if (b) return b; }
    return null;
  };
  window.__ff = (sec) => { for (let i = 0; i < sec * 20; i++) s.scheduler.step(s.state); };
  // cofres cheios; o petróleo só a partir da Era dele (a E2 esconde o petróleo do topo só com age < OIL_FROM_AGE **e** oil < 1)
  window.__rich = (oil) => { for (const r of Object.keys(s.player.resources)) s.player.resources[r] = r === 'oil' && !oil ? 0 : 99999; };
});
const N = await page.evaluate(() => window.aoe.debugNames());
check('8 Eras nos dados', N.ages.length === 8, N.ages.join(', '));
const lib = await page.evaluate(() => window.__build('academy')?.id ?? -1);
const brk = await page.evaluate(() => window.__build('barracks')?.id ?? -1);
check('Biblioteca e Quartel prontos', lib >= 0 && brk >= 0);
const oilIdx = N.resources.indexOf('oil');
for (let k = 0; k < N.ages.length; k++) {
  await page.waitForTimeout(500);
  const top = await page.evaluate((oi) => { const res = [...document.querySelectorAll('#top .res')]; return { age: document.querySelector('#top .age')?.textContent ?? '', oil: res[oi] ? !res[oi].classList.contains('hidden') : false }; }, oilIdx);
  check(`Era ${k + 1}: topo mostra ${N.ages[k]}`, top.age.includes(N.ages[k]), top.age);
  check(`Era ${k + 1}: petróleo ${k >= N.oilFromAge ? 'visível' : 'escondido'}`, top.oil === (k >= N.oilFromAge));
  // Infantaria pesada no degrau da Era (estudos de evolução empurrados até a Era atual)
  const heavy = N.lines.heavy_infantry;
  const want = N.units[[...heavy.slice(0, k + 1)].reverse().find(Boolean)];
  await page.evaluate(([k, id]) => { const s = window.aoe.session; for (let n = 1; n <= k; n++) { const t = `evo_heavy_infantry_${n + 1}`; if (!s.player.techs.includes(t)) s.player.techs.push(t); } s.select([id]); }, [k, brk]);
  await page.waitForTimeout(400);
  const labels = await page.$$eval('#commands .cmd .lbl', (els) => els.map((e) => e.textContent.trim()));
  check(`Era ${k + 1}: Quartel treina ${want}`, labels.some((l) => l.includes(want)), labels.slice(0, 4).join(', '));
  // árvore de estudos
  await page.keyboard.press('F3'); await page.waitForTimeout(600);
  const tree = await page.evaluate(() => ({ open: !!document.querySelector('#modal.tree'), eras: document.querySelectorAll('#modal .tree-era').length, cur: document.querySelector('#modal .tree-era.cur')?.textContent ?? '', ph: document.querySelectorAll('#modal .hic-ph').length, h2: document.querySelector('#modal h2')?.textContent ?? '' }));
  check(`Era ${k + 1}: árvore com 8 colunas e a Era marcada`, tree.open && tree.eras === 8 && tree.cur.includes(N.ages[k]) && tree.ph === 0, JSON.stringify(tree));
  if (LANG === 'en') check(`Era ${k + 1}: árvore em inglês`, tree.h2.includes('Study tree'), tree.h2);
  check(`Era ${k + 1}: árvore sem emoji`, (await emojiIn('#modal')).length === 0);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  // enciclopédia
  await page.keyboard.press('F2'); await page.waitForTimeout(500);
  check(`Era ${k + 1}: enciclopédia com 8 abas`, (await page.$$('#modal [data-tab]')).length === 8);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check(`Era ${k + 1}: HUD sem emoji`, (await emojiIn('#hud')).length === 0);
  await page.evaluate((id) => window.aoe.session.select([id]), lib); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/eras-e9-era${k + 1}${LANG === 'en' ? '-en' : ''}.png` });
  if (k === N.ages.length - 1) break;
  // requisitos da próxima Era (atalhos de teste) e avanço pelo caminho do jogador
  const req = N.reqBuilding[k + 1];
  if (req) check(`Era ${k + 2}: requisito ${req}`, await page.evaluate((t) => !!window.__build(t), req));
  await page.evaluate(([n, lines, oil]) => { const p = window.aoe.session.player; window.__rich(oil); for (let i = 0; i < n; i++) { const id = `${lines[i % lines.length]}${Math.floor(i / lines.length) + 1}`; if (!p.techs.includes(id)) p.techs.push(id); } }, [N.techCount[k + 1], N.academyLines, k + 1 >= N.oilFromAge]);
  await page.evaluate((id) => window.aoe.session.select([id]), lib); await page.waitForTimeout(400);
  await page.keyboard.press('e'); await page.waitForTimeout(500);
  if (N.minorGod[k + 1]) {
    const cards = await page.$$('#modal .card');
    check(`Era ${k + 2}: modal do deus menor com 2 cartas`, cards.length === 2, String(cards.length));
    if (cards.length) await cards[0].click();
    await page.waitForTimeout(300);
  }
  // o avanço entra na fila da Biblioteca pelo comando de verdade; aqui só se encurta a espera (o tempo da Era, 60–150 s):
  // 8 Eras de espera inteira dariam ~15 min de jogo, e a IA adversária atacaria uma cidade sem exército
  const reached = await page.evaluate((target) => { const s = window.aoe.session; window.__ff(0.2); for (const b of s.state.buildings.values()) if (b.owner === s.local) for (const q of b.queue) if (q.kind === 'age') q.elapsed = Math.max(q.elapsed, q.total - 0.5); for (let i = 0; i < 20 && s.player.age < target; i++) window.__ff(1); return s.player.age; }, k + 1);
  check(`avanço para a Era ${k + 2}`, reached === k + 1, `Era ${reached + 1}`);
}
// Era VIII: Portal dos Titãs no menu de construção do cidadão
await page.evaluate(() => { const s = window.aoe.session; const v = [...s.state.units.values()].find((u) => u.owner === s.local && u.type === 'villager'); if (v) s.select([v.id]); });
await page.waitForTimeout(400);
check('Era VIII: Portal dos Titãs no menu', (await page.textContent('#commands'))?.includes(N.buildings.titan_gate) ?? false);
console.log('errors:', errors.length ? errors.join(' | ') : 'none');
console.log(failures.length ? `${failures.length} falha(s): ${failures.join('; ')}` : 'playtest-eras: tudo ok');
await browser.close();
process.exit(failures.length || errors.length ? 1 : 0);
