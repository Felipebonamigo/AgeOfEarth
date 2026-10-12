// Playtest da E6 (mitologia nas Eras), em PT e em EN: partida rápida na Era VII com os 9 poderes novos, criaturas novas e Bênçãos.
// Confere o painel do Templo (criaturas novas + uma Bênção), usa cada poder nesta ordem (os que matam por último) e olha a dica de
// cada poder; falha com pageerror, poder não usado, ícone vazio (`hic-ph`) ou emoji no HUD. Capturas só em PT: docs/art/e6-*.png.
// Exige `npm run preview` (porta 4173). Uso: node scripts/playtest-myth.mjs [url] [saída]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'docs/art';
const failures = [], errors = [];
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}]/u;
const POWERS = ['crossroads', 'divine_harvest', 'winged_victory', 'retribution', 'spring', 'panic', 'gale', 'sun_chariot', 'tidal_wave'];
const browser = await chromium.launch({ env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' }, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function scan(page, where) {
  const found = await page.evaluate((src) => {
    const re = new RegExp(src, 'u'); const hits = [];
    const root = document.querySelector('#hud'); if (!root) return hits;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const visible = (el) => { for (let q = el; q && q !== document.body; q = q.parentElement) { const st = getComputedStyle(q); if (st.display === 'none' || st.visibility === 'hidden' || q.classList?.contains('hidden')) return false; } return true; };
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (re.test(n.nodeValue ?? '') && visible(n.parentElement)) hits.push(`texto: "${(n.nodeValue ?? '').trim().slice(0, 80)}"`);
    for (const el of root.querySelectorAll('[data-tip],[title]')) for (const a of ['data-tip', 'title']) { const v = el.getAttribute(a); if (v && re.test(v.replace(/<[^>]+>/g, ''))) hits.push(`${a}: "${v.replace(/<[^>]+>/g, '').slice(0, 80)}"`); }
    if (root.querySelector('.hic-ph')) hits.push('ícone vazio (hic-ph)');
    return hits;
  }, EMOJI.source);
  for (const h of new Set(found)) failures.push(`[${where}] ${h}`);
}

for (const locale of ['pt', 'en']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(`${locale}: ${e.message}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.selectOption('#m-locale', locale).catch(() => {});
  await page.fill('#m-seed', '2024');
  await page.click('#m-start'); await page.waitForTimeout(1500);
  await page.evaluate(() => { window.aoe.session.paused = true; });
  const setup = await page.evaluate(() => {
    const a = window.aoe, s = a.session, st = s.state, p = s.player;
    p.age = 6; p.minorGods = ['athena', 'apollo', 'hera', 'hephaestus', 'pan', 'aeolus', 'helios'];
    for (const r of ['food', 'wood', 'stone', 'gold', 'oil', 'knowledge', 'favor']) p.resources[r] = 99999;
    p.visibility.fill(2);
    const ids = ['panic', 'crossroads', 'spring', 'gale', 'tidal_wave', 'divine_harvest', 'sun_chariot', 'winged_victory', 'retribution'];
    p.powers = ids.map((id) => ({ id, used: false }));
    const tc = [...st.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center');
    const mine = ['satyr', 'harpy', 'phoenix', 'talos', 'hoplite', 'hoplite'].map((t, i) => a.debugSpawn(s.local, t, tc.x + 4 + i, tc.y + 5)).filter(Boolean).map((u) => u.id);
    const foes = (n) => { for (let i = 0; i < n; i++) a.debugSpawn(1, 'hoplite', tc.x + 9 + (i % 4), tc.y + 8 + Math.floor(i / 4)); };
    foes(8);
    let tmp = null;
    for (let r = 6; r <= 20 && !tmp; r += 2) for (let dy = -r; dy <= r && !tmp; dy += 2) for (let dx = -r; dx <= r && !tmp; dx += 2) { if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; tmp = a.debugBuild(s.local, 'temple', tc.tx + dx, tc.ty + dy, 1); }
    if (tmp) s.select([tmp.id]);
    return { mine, tmp: tmp?.id ?? null, tcx: tc.x, tcy: tc.y };
  });
  if (!setup.tmp) failures.push(`[${locale}] Templo não foi posto`);
  await page.evaluate(() => { window.aoe.session.paused = false; }); await page.waitForTimeout(600); await page.evaluate(() => { window.aoe.session.paused = true; });
  await page.waitForTimeout(400);
  const readPanel = () => page.evaluate(() => [...document.querySelectorAll('#commands button, #commands .cmd, #commands [data-tip]')].map((e) => (e.getAttribute('data-tip') ?? e.textContent ?? '').replace(/<[^>]+>/g, ' ').trim()).join(' | '));
  let panel = await readPanel();
  for (let k = 0; k < 6 && !panel.includes('Talos'); k++) { await page.waitForTimeout(500); panel = await readPanel(); }
  for (const needle of locale === 'pt' ? ['Sátiro', 'Fênix', 'Talos', 'Bênção do Olimpo'] : ['Satyr', 'Phoenix', 'Talos', 'Blessing of Olympus']) if (!panel.includes(needle)) failures.push(`[${locale}/templo] o painel do Templo não mostra "${needle}"`);
  if (panel.split(' | ').some((x) => x.startsWith(locale === 'pt' ? 'Colosso' : 'Colossus'))) failures.push(`[${locale}/templo] o Colosso deveria sumir na Era VII`);
  await scan(page, `${locale}/templo`);
  if (locale === 'pt') await page.screenshot({ path: `${out}/e6-templo.png` });
  for (const id of POWERS) {
    const r = await page.evaluate(({ id, mine }) => {
      const a = window.aoe, s = a.session, st = s.state;
      const foes = [...st.units.values()].filter((u) => u.owner === 1 && !u.dead && u.type === 'hoplite');
      const tcb = [...st.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center');
      if (foes.length < 4 && id !== 'crossroads' && id !== 'divine_harvest' && id !== 'winged_victory' && id !== 'retribution') for (let i = 0; i < 8; i++) a.debugSpawn(1, 'hoplite', tcb.x + 9 + (i % 4), tcb.y + 8 + Math.floor(i / 4));
      const live = [...st.units.values()].filter((u) => u.owner === 1 && !u.dead && u.type === 'hoplite');
      const cx = live.length ? live.reduce((q, u) => q + u.x, 0) / live.length : tcb.x + 10, cy = live.length ? live.reduce((q, u) => q + u.y, 0) / live.length : tcb.y + 10;
      const cmd = id === 'crossroads' ? { type: 'power', player: s.local, power: id, x: tcb.x + 12, y: tcb.y, ids: mine } : { type: 'power', player: s.local, power: id, x: cx, y: cy };
      s.issue(cmd);
      s.paused = false;
      return { cx, cy };
    }, { id, mine: setup.mine });
    void r;
    await page.waitForTimeout(600);
    await page.evaluate(() => { window.aoe.session.paused = true; });
    const used = await page.evaluate((id) => window.aoe.session.player.powers.find((x) => x.id === id)?.used === true, id);
    if (!used) failures.push(`[${locale}/${id}] o poder não foi usado`);
    if (locale === 'pt') await page.screenshot({ path: `${out}/e6-poder-${id}.png` });
    await scan(page, `${locale}/${id}`);
  }
  const pws = await page.$$('#gods .pw, .pw');
  for (const el of pws) { await el.hover().catch(() => {}); await page.waitForTimeout(80); await scan(page, `${locale}/dica`); }
  await page.close();
}
await browser.close();
for (const e of errors) failures.push(`pageerror ${e}`);
if (failures.length) { console.log('FALHAS:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
console.log('playtest-myth: tudo ok');
