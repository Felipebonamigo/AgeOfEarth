// Etapa 7 (docs/ART.md §5, critério "zero emoji na partida em PT e EN"): abre uma partida em cada idioma, percorre os
// estados do HUD (topo, cidadão, Centro Cívico, templo com poderes, quartel, unidade militar, multisseleção, fila,
// objetivos e falas de missão, menu, ajuda, atalhos, enciclopédia em todas as abas, escolha de deus menor, tooltips) e
// falha se algum texto ou atributo visível do DOM tiver emoji. Imagens do atlas `hud` no lugar dos emoji: também confere
// que os ícones carregaram (nenhum marcador vazio `hic-ph` depois de pronto) e grava capturas em docs/art/etapa7-hud-*.png.
// Uso: node scripts/playtest-noemoji.mjs [url] [--out docs/art]   (exige `npm run preview`)
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:4173/';
const outIdx = process.argv.indexOf('--out');
const out = outIdx > 0 ? process.argv[outIdx + 1] : 'docs/art';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const failures = [];
const errors = [];

// emoji "de verdade" (pictográficos) e os símbolos que o HUD usava como ícone (⬆ ⏸ ⏳ ☰ ✋ …); setas de teclado (⇧ → ←) não contam
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}]/u;

async function scan(page, where) {
  const found = await page.evaluate((src) => {
    const re = new RegExp(src, 'u');
    const hits = [];
    const visible = (el) => { if (!el) return false; const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden') return false; for (let p = el; p; p = p.parentElement) if (p.classList?.contains('hidden')) return false; return true; };
    const roots = [document.querySelector('#hud'), document.querySelector('#modal-back')].filter(Boolean);
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const txt = n.nodeValue ?? '';
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
console.log(failures.length ? `${failures.length} ocorrência(s) de emoji/ícone` : 'nenhum emoji na partida (PT e EN)');
process.exit(failures.length || errors.length ? 1 : 0);
