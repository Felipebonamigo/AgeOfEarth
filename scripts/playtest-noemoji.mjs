// Etapas 7–8 (docs/ART.md §5, critério "zero emoji em PT e EN"): nas telas fora da partida (Etapa 8) percorre o menu
// principal (abas, deuses com retrato, campanha com as marcas de cumprida/Difícil, opções, ajuda, enciclopédia, créditos),
// o multiplayer (salas abertas e o lobby, se o relay da porta 8787 estiver de pé) e o editor (ferramentas, paletas,
// inspetor, tabela de recursos, Propriedades, Gatilhos, Testar, atalhos, menu); na partida (Etapa 7) abre uma em cada idioma e percorre os
// estados do HUD (topo, cidadão, Centro Cívico, templo com poderes, quartel, unidade militar, multisseleção, fila,
// objetivos e falas de missão, menu, ajuda, atalhos, enciclopédia em todas as abas, escolha de deus menor, tooltips) e
// falha se algum texto ou atributo visível do DOM tiver emoji. Imagens do atlas `hud` no lugar dos emoji: também confere
// que os ícones carregaram (nenhum marcador vazio `hic-ph` depois de pronto) e grava capturas em docs/art/etapa7-hud-*.png
// (partida) e docs/art/etapa8-*.png (menu, lobby, editor).
// Uso: node scripts/playtest-noemoji.mjs [url] [--out docs/art] [--relay ws://localhost:8787]   (exige `npm run preview`)
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:4173/';
const outIdx = process.argv.indexOf('--out');
const out = outIdx > 0 ? process.argv[outIdx + 1] : 'docs/art';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' }, executablePath: fs.existsSync(CHROME) ? CHROME : undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const relayIdx = process.argv.indexOf('--relay');
const relay = relayIdx > 0 ? process.argv[relayIdx + 1] : 'ws://localhost:8787';
const failures = [];
const errors = [];

// emoji "de verdade" (pictográficos) e os símbolos que o HUD usava como ícone (⬆ ⏸ ⏳ ☰ ✋ …); setas de teclado (⇧ → ←) não contam
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}]/u;

async function scan(page, where) {
  const found = await page.evaluate((src) => {
    const re = new RegExp(src, 'u');
    const hits = [];
    const visible = (el) => { if (!el) return false; const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden') return false; for (let p = el; p; p = p.parentElement) if (p.classList?.contains('hidden')) return false; return true; };
    const roots = [document.querySelector('#hud'), document.querySelector('#modal-back'), document.querySelector('#menu')].filter(Boolean);
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const txt = n.nodeValue ?? '';
        if (n.parentElement?.closest('[data-raw]')) continue;   // conteúdo do jogador (chat): fica como ele escreveu
        if (re.test(txt) && visible(n.parentElement)) hits.push(`texto: "${txt.trim().slice(0, 80)}" em <${n.parentElement.tagName.toLowerCase()} id=${n.parentElement.id} class=${n.parentElement.className}>`);
      }
      for (const el of root.querySelectorAll('[data-tip],[title],[alt],[placeholder]')) {
        for (const a of ['data-tip', 'title', 'alt', 'placeholder']) {
          const v = el.getAttribute(a);
          if (v && re.test(v.replace(/<[^>]+>/g, ''))) hits.push(`${a}: "${v.replace(/<[^>]+>/g, '').slice(0, 80)}" em <${el.tagName.toLowerCase()} class=${el.className}>`);
        }
      }
    }
    return hits;
  }, EMOJI.source);
  const uniq = [...new Set(found)];
  for (const h of uniq) failures.push(`[${where}] ${h}`);
  return uniq.length;
}

// ---------------- Etapa 8: menu principal, multiplayer e editor ----------------
const relayUp = await new Promise((res) => { try { const ws = new WebSocket(relay); const t = setTimeout(() => { try { ws.close(); } catch { /* */ } res(false); }, 2500); ws.onopen = () => { clearTimeout(t); ws.close(); res(true); }; ws.onerror = () => { clearTimeout(t); res(false); }; } catch { res(false); } });
if (!relayUp) console.log(`relay ${relay} fora do ar: lobby não verificado (npm run relay)`);
for (const locale of ['pt', 'en']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(`menu ${locale}: ${e.message}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.setItem('aoe_campaign', JSON.stringify({ completed: ['m1_despertar', 'm2_cerco', 'm3_portal'], hard: ['m1_despertar'] })); localStorage.removeItem('aoe_editor_autosave'); });
  await page.selectOption('#m-locale', locale).catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('#menu .gods img.hic-god').length === 3, null, { timeout: 30000 }).catch(() => failures.push(`[${locale}/menu] os retratos dos deuses não carregaram`));
  const shot = async (name) => { if (locale === 'pt') await page.screenshot({ path: `${out}/etapa8-${name}.png` }); };
  const tab = async (t) => { await page.click(`#menu [data-tab="${t}"]`); await page.waitForTimeout(400); };
  await scan(page, `${locale}/menu-partida`); await shot('menu-partida');
  await tab('campaign');
  await scan(page, `${locale}/menu-campanha`); await shot('menu-campanha');
  const camp = await page.evaluate(() => ({ icons: document.querySelectorAll('#menu .mission img.hic').length, missions: document.querySelectorAll('#menu .mission').length, done: document.querySelectorAll('#menu .mission .mark.done svg').length, hard: document.querySelectorAll('#menu .mission .mark.hard svg').length }));
  if (camp.icons !== camp.missions || camp.missions < 12) failures.push(`[${locale}/menu-campanha] ${camp.icons} ícones para ${camp.missions} missões`);
  if (camp.done !== 3 || camp.hard !== 1) failures.push(`[${locale}/menu-campanha] marcas: ${camp.done} cumpridas (esperado 3), ${camp.hard} no Difícil (esperado 1)`);
  await tab('multiplayer');
  await scan(page, `${locale}/menu-multiplayer`);
  if (relayUp) {
    await page.fill('#mp-url', relay); await page.click('#mp-browse'); await page.waitForTimeout(1500);
    await scan(page, `${locale}/salas-abertas`);
    await page.click('#mp-browse').catch(() => {});
    await page.fill('#mp-url', relay); await page.fill('#mp-room', `EMOJI${locale.toUpperCase()}`); await page.fill('#mp-name', 'Ícaro');
    await page.click('#mp-join');
    const inLobby = await page.waitForSelector('#mp-chat', { timeout: 8000 }).then(() => true).catch(() => false);
    if (!inLobby) failures.push(`[${locale}/lobby] não entrou na sala`);
    else {
      await page.fill('#mp-chat-input', 'olá 🙂'); await page.click('#mp-chat-send'); await page.waitForTimeout(600);
      const lobby = await page.evaluate(() => ({ god: document.querySelectorAll('#menu td img.hic-god, #menu td .hic-god').length, host: document.querySelectorAll('#menu .host svg').length, chat: document.querySelector('#mp-chat-log')?.textContent ?? '' }));
      if (!lobby.god || !lobby.host) failures.push(`[${locale}/lobby] sem retrato do deus (${lobby.god}) ou coroa do anfitrião (${lobby.host})`);
      if (!lobby.chat.includes('🙂')) failures.push(`[${locale}/lobby] o chat perdeu o emoji do jogador ("${lobby.chat}") — conteúdo do jogador fica intacto`);
      await scan(page, `${locale}/lobby`); await shot('menu-lobby');
      await page.click('#mp-leave').catch(() => {}); await page.waitForTimeout(400);
    }
  }
  await tab('editor');
  await scan(page, `${locale}/menu-editor`); await shot('menu-editor');
  await tab('skirmish');
  await page.click('#m-options'); await page.waitForTimeout(300);
  await scan(page, `${locale}/menu-opcoes`);
  await page.click('#m-options'); await page.waitForTimeout(200);
  for (const [sel, name] of [['#m-help', 'ajuda'], ['#m-enc', 'enciclopedia'], ['#m-credits', 'creditos']]) {
    await page.click(sel).catch(() => {}); await page.waitForTimeout(500);
    await scan(page, `${locale}/menu-${name}`);
    for (const tb of await page.$$('#modal [data-tab]')) { await tb.click().catch(() => {}); await page.waitForTimeout(200); await scan(page, `${locale}/menu-${name}`); }
    if (name === 'enciclopedia') await shot('menu-enciclopedia');
    await page.evaluate(() => window.aoe.hud?.hideModal?.()); await page.waitForTimeout(200);
  }
  // editor: mapa novo 80×80 gerado, cada ferramenta e paleta, inspetor, modais
  await tab('editor');
  await page.fill('#ed-name', 'Sem emoji'); await page.selectOption('#ed-size', 'small'); await page.fill('#ed-seed', '5');
  await page.click('#ed-create');
  const opened = await page.waitForFunction(() => !!window.aoe?.editor, null, { timeout: 30000 }).then(() => true).catch(() => false);
  if (!opened) { failures.push(`[${locale}/editor] não abriu`); await page.close(); continue; }
  await page.waitForTimeout(1200);
  for (const k of ['t', 'n', 'b', 'm', 'i', 'v', 'e']) { await page.keyboard.press(k); await page.waitForTimeout(250); await scan(page, `${locale}/editor-${k}`); if (k === 'b') await shot('editor-edificios'); }
  // edifício e unidade do jogador 2 postos pelo próprio editor e selecionados: inspetor com ícone
  const placed = await page.evaluate(() => {
    const ed = window.aoe.editor; const m = ed.map; const s = m.starts[0];
    const free = () => { for (let r = 6; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = s.x + dx, y = s.y + dy; if (ed.canPlaceAt(x, y)) return [x, y]; } return null; };
    ed.ui.player = 1;
    ed.ui.tool = 'building'; ed.ui.buildingType = 'temple'; const b = free(); if (!b) return false; ed.pointerDown(b[0], b[1], 0); ed.pointerUp(b[0], b[1], 0);
    ed.ui.tool = 'select'; ed.pointerDown(b[0], b[1], 0); ed.pointerUp(b[0], b[1], 0);
    return ed.ui.selected?.kind === 'building';
  });
  await page.waitForTimeout(500);
  if (!placed) failures.push(`[${locale}/editor] não pôs/selecionou o templo`);
  else {
    const insp = await page.evaluate(() => document.querySelectorAll('#ed-insp img.hic, #ed-insp .hic-ph').length);
    if (!insp) failures.push(`[${locale}/editor] inspetor do edifício sem ícone`);
    await scan(page, `${locale}/editor-inspetor`); await shot('editor-inspetor');
  }
  for (const sel of ['#ed-props', '#ed-triggers', '#ed-test', '#ed-hotkeys']) {
    const has = await page.$(sel); if (!has) { failures.push(`[${locale}/editor] sem ${sel}`); continue; }
    await page.click(sel).catch(() => {}); await page.waitForTimeout(500);
    await scan(page, `${locale}/editor${sel}`);
    if (sel === '#ed-triggers') await shot('editor-gatilhos');
    await page.evaluate(() => window.aoe.hud?.hideModal?.()); await page.waitForTimeout(200);
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await scan(page, `${locale}/editor-menu`);
  const ph = await page.evaluate(() => [...document.querySelectorAll('.hic-ph')].filter((e) => e.offsetParent).map((e) => e.dataset.ic));
  if (ph.length) failures.push(`[${locale}/menu+editor] ${ph.length} ícones ainda como marcador vazio: ${[...new Set(ph)].slice(0, 6).join(', ')}`);
  await page.close();
}

for (const locale of ['pt', 'en']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(`${locale}: ${e.message}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.selectOption('#m-locale', locale).catch(() => {});
  await page.waitForTimeout(300);
  await page.fill('#m-seed', '2024').catch(() => {});
  await page.selectOption('#m-ais', '1').catch(() => {});
  await page.click('#m-start');
  await page.waitForFunction(() => window.aoe?.session, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  // ícones do HUD prontos
  await page.waitForFunction(() => document.querySelectorAll('#top .res img.hic').length >= 5, null, { timeout: 30000 }).catch(() => failures.push(`[${locale}] os ícones de recursos não carregaram`));
  await page.evaluate(() => {
    const s = window.aoe.session; const p = s.player;
    p.age = 3; Object.assign(p.resources, { food: 9000, wood: 9000, gold: 9000, favor: 900, knowledge: 900 });
  });
  await page.evaluate(() => {
    // edifício de teste perto do Centro Cívico: tenta posições em anel até caber (debugBuild recusa lugar ocupado)
    window.__build = (type) => {
      const s = window.aoe.session; const st = s.state; const tc = [...st.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center');
      for (let r = 5; r < 16; r++) for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2; const b = window.aoe.debugBuild?.(s.local, type, Math.round(tc.x + Math.cos(a) * r), Math.round(tc.y + Math.sin(a) * r));
        if (b) return b;
      }
      return [...st.buildings.values()].find((x) => x.owner === s.local && x.type === type) ?? null;
    };
  });
  const shot = async (name) => { if (locale === 'pt') await page.screenshot({ path: `${out}/etapa7-hud-${name}.png` }); };
  const step = async (name, fn) => { await page.evaluate(fn); await page.waitForTimeout(700); const n = await scan(page, `${locale}/${name}`); await shot(name); return n; };
  await step('topo', () => {});
  await step('cidadao', () => { const s = window.aoe.session; const v = [...s.state.units.values()].find((u) => u.owner === s.local && u.type === 'villager'); s.select([v.id]); });
  await step('centro', () => { const s = window.aoe.session; const b = [...s.state.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center'); s.select([b.id]); s.issue({ type: 'train', player: s.local, buildingId: b.id, unit: 'villager' }); });
  // tropa e edifícios militares (debug hooks do jogo)
  await step('militar', () => {
    const s = window.aoe.session; const st = s.state; const tc = [...st.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center');
    const sp = window.aoe.debugSpawn; if (!sp) return;
    for (const [i, t] of ['hoplite', 'hoplite', 'toxotes', 'hetairoi', 'heracles', 'minotaur'].entries()) sp(s.local, t, tc.x + 4 + i, tc.y + 5);
    const ids = [...st.units.values()].filter((u) => u.owner === s.local && u.type !== 'villager').map((u) => u.id);
    s.select(ids);
  });
  await step('heroi', () => { const s = window.aoe.session; const h = [...s.state.units.values()].find((u) => u.owner === s.local && u.type === 'heracles'); if (h) { h.kills = 12; s.select([h.id]); } });
  await step('templo', () => { const b = window.__build('temple'); if (b) window.aoe.session.select([b.id]); });
  await step('quartel', () => { const b = window.__build('barracks'); if (b) window.aoe.session.select([b.id]); });
  await step('academia', () => { const b = window.__build('academy'); if (b) window.aoe.session.select([b.id]); });
  await step('mercado', () => { const b = window.__build('market'); if (b) window.aoe.session.select([b.id]); });
  // tooltips dos botões de comando
  const btns = await page.$$('#commands button.cmd');
  for (const b of btns.slice(0, 6)) { await b.hover().catch(() => {}); await page.waitForTimeout(120); }
  await scan(page, `${locale}/tooltips`);
  // escolha do deus menor (modal de avançar de Idade)
  await step('deus-menor', () => { window.aoe.hud.showMinorGodChoice(['athena', 'hermes'], () => {}); });
  await page.evaluate(() => window.aoe.hud?.hideModal?.());
  // menu, ajuda, atalhos, enciclopédia
  await step('menu', () => { window.aoe.hud?.showMenu?.(); });
  for (const sel of ['#m-help', '#m-keys', '#m-enc', '#m-encyclopedia']) {
    const has = await page.$(sel);
    if (!has) continue;
    await page.click(sel).catch(() => {});
    await page.waitForTimeout(500);
    await scan(page, `${locale}/menu${sel}`);
    // abas da enciclopédia
    for (const tab of await page.$$('#modal [data-tab]')) { await tab.click().catch(() => {}); await page.waitForTimeout(250); await scan(page, `${locale}/enciclopédia`); }
    await page.evaluate(() => window.aoe.hud?.showMenu?.());
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => window.aoe.hud?.hideModal?.());
  const ph = await page.evaluate(() => document.querySelectorAll('#hud .hic-ph').length);
  if (ph > 0) failures.push(`[${locale}] ${ph} ícones ainda como marcador vazio (atlas hud não carregou ou nome sem ícone)`);
  await page.close();
}

// missão da campanha (objetivos, falas com retrato)
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(`campanha: ${e.message}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  let started = false;
  try {
    await page.click('[data-tab="campaign"]'); await page.waitForTimeout(300);
    await page.click('.mission'); await page.waitForTimeout(1000);
    await page.click('#m-go'); started = true;
  } catch { failures.push('campanha: não abriu a m1 pelo menu'); }
  if (started) {
    await page.waitForFunction(() => window.aoe?.session?.state?.scenario, null, { timeout: 60000 });
    await page.waitForTimeout(2500);
    await scan(page, 'campanha/m1');
    await page.screenshot({ path: `${out}/etapa7-hud-missao.png` });
  }
  await page.close();
}

await browser.close();
for (const f of failures) console.log('FALHA', f);
console.log(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
console.log(failures.length ? `${failures.length} ocorrência(s) de emoji/ícone` : `nenhum emoji no menu, no editor${relayUp ? ', no lobby' : ''} e na partida (PT e EN)`);
process.exit(failures.length || errors.length ? 1 : 0);
