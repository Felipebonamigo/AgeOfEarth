// Medições temporárias do painel do editor (revisão): custo por quadro, validação, autosave, cota, i18n/esc, layout.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? '/tmp/claude-0/-home-user-AgeOfEarth/e5c9ffdf-48f3-5297-9a17-1e4aae2c96a5/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const log = (...a) => console.log(...a);
const ed = (fn, arg) => page.evaluate(fn, arg);

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('aoe_map') || k.startsWith('aoe_editor') || k === 'aoe_save_v1' || k === 'aoe_maps_v1') localStorage.removeItem(k); });
await page.click('#menu [data-tab="editor"]'); await page.waitForTimeout(200);
log('sizes:', await page.$$eval('#ed-size option', (l) => l.map((o) => o.value + ':' + o.textContent)));
await page.fill('#ed-name', 'Grande Perf'); await page.selectOption('#ed-size', 'large'); await page.selectOption('#ed-starts', '4'); await page.selectOption('#ed-base', 'gen'); await page.fill('#ed-seed', '7'); await page.selectOption('#ed-maptype', 'continental');
const t0 = Date.now();
await page.click('#ed-create'); await page.waitForFunction(() => window.aoe.editor && window.aoe.session && window.aoe.session.ui.mode === 'editor'); await page.waitForTimeout(800);
log('abrir editor (ms, inclui generateMap):', Date.now() - t0);
let info = await ed(() => { const e = window.aoe.editor; return { w: e.map.w, h: e.map.h, nodes: e.map.nodes.size, starts: e.map.starts.length, units: e.state.units.size, buildings: e.state.buildings.size }; });
log('mapa:', JSON.stringify(info));
// garante >= 1000 nós
await ed(() => { const e = window.aoe.editor; const m = e.map; let need = 1000 - m.nodes.size; const ops = []; for (let y = 2; y < m.h - 2 && need > 0; y += 2) for (let x = 2; x < m.w - 2 && need > 0; x += 2) { if (e.nodeFits(x, y)) { ops.push({ kind: 'addNode', type: 'tree', x, y }); need--; } } if (ops.length) e.apply({ kind: 'batch', ops }); });
await ed(() => { const e = window.aoe.editor; const s = e.map.starts[0]; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const x = s.x + dx, y = s.y + dy; e.ui.tool = 'unit'; if (e.canPlaceAt(x, y) && e.pickAt(x, y) === null) { e.apply({ kind: 'placeEntity', entity: { kind: 'unit', type: 'hoplite', owner: 0, x, y } }); e.ui.tool = 'terrain'; return; } } });
info = await ed(() => { const e = window.aoe.editor; return { nodes: e.map.nodes.size, undo: e.undoDepth, units: e.state.units.size }; });
log('após completar nós:', JSON.stringify(info));
await page.waitForTimeout(800);

// ---- 1) custo por quadro de panel.update() e editor.flush() / hud.update ----
const perFrame = await ed(async () => {
  const p = window.aoe.editorPanel, e = window.aoe.editor;
  const samples = { update: [], flush: [] };
  const u0 = p.update.bind(p), f0 = e.flush.bind(e);
  p.update = () => { const a = performance.now(); u0(); samples.update.push(performance.now() - a); };
  e.flush = () => { const a = performance.now(); f0(); samples.flush.push(performance.now() - a); };
  // com a barra de progresso e hover variando (simula mouse sobre o mapa)
  let i = 0;
  const hov = setInterval(() => { e.setHover(10 + (i % 50), 10 + (i % 37)); i++; }, 8);
  await new Promise((r) => setTimeout(r, 2000));
  clearInterval(hov);
  p.update = u0; e.flush = f0;
  const stat = (a) => { a.sort((x, y) => x - y); return { n: a.length, avg: +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(3), p50: +a[Math.floor(a.length / 2)].toFixed(3), p95: +a[Math.floor(a.length * 0.95)].toFixed(3), max: +a[a.length - 1].toFixed(3) }; };
  return { update: stat(samples.update), flush: stat(samples.flush) };
});
log('por quadro (ms), ocioso + hover:', JSON.stringify(perFrame));
// com unidade selecionada (inspetor ativo) e hover variando
const perFrameSel = await ed(async () => {
  const p = window.aoe.editorPanel, e = window.aoe.editor;
  const u = [...e.state.units.values()][0]; if (u) e.ui.selected = { kind: 'unit', id: u.id };
  const samples = [];
  const u0 = p.update.bind(p);
  p.update = () => { const a = performance.now(); u0(); samples.push(performance.now() - a); };
  let i = 0; const hov = setInterval(() => { e.setHover(10 + (i % 50), 10 + (i % 37)); i++; }, 8);
  await new Promise((r) => setTimeout(r, 1500)); clearInterval(hov); p.update = u0; e.ui.selected = null;
  samples.sort((a, b) => a - b); return { n: samples.length, avg: +(samples.reduce((s, v) => s + v, 0) / samples.length).toFixed(3), p95: +samples[Math.floor(samples.length * 0.95)].toFixed(3), max: +samples[samples.length - 1].toFixed(3), hasUnit: !!u };
});
log('por quadro (ms), unidade selecionada + hover:', JSON.stringify(perFrameSel));

// ---- 2) validação e toFile ----
const val = await ed(() => {
  const e = window.aoe.editor, p = window.aoe.editorPanel;
  const r = {};
  let a = performance.now(); const f = e.toFile(); r.toFile = +(performance.now() - a).toFixed(2); r.jsonKB = +(JSON.stringify(f).length / 1024).toFixed(1);
  e.issues = null; a = performance.now(); const iss = e.validate(); r.validate = +(performance.now() - a).toFixed(2); r.issues = iss.length; r.codes = [...new Set(iss.map((i) => i.code))];
  e.issues = null; a = performance.now(); p.validateNow(); r.validateNowIncl = +(performance.now() - a).toFixed(2);
  a = performance.now(); p.autosaveNow(); r.autosave = +(performance.now() - a).toFixed(2); r.autosaveKB = +((localStorage.getItem('aoe_editor_autosave') ?? '').length / 1024).toFixed(1);
  // lista sintética com centenas de itens
  const big = []; for (let i = 0; i < 600; i++) big.push({ level: i % 3 ? 'warn' : 'error', code: ['pocket', 'nodeNoAccess', 'lowStartFood', 'chokepoint', 'startsDisconnected'][i % 5], x: i % 100, y: (i * 7) % 100, params: { start: 1 + (i % 4), tiles: 3, type: 'gold' } });
  const saved = p.issues; p.issues = big; a = performance.now(); p.renderIssues(); r.renderIssues600 = +(performance.now() - a).toFixed(2); r.issuesDom = document.querySelectorAll('#ed-issues *').length;
  p.issues = saved; p.renderIssues();
  return r;
});
log('validação/arquivo:', JSON.stringify(val));

// ---- 3) debounce durante um traço longo (raio 8) e custo do traço ----
const stroke = await ed(async () => {
  const e = window.aoe.editor, p = window.aoe.editorPanel;
  let validates = 0; const v0 = e.validate.bind(e); e.validate = () => { validates++; return v0(); };
  e.ui.tool = 'terrain'; e.ui.terrain = 1; e.ui.brushRadius = 8;
  const frames = []; let last = performance.now();
  const raf = () => { const n = performance.now(); frames.push(n - last); last = n; if (running) requestAnimationFrame(raf); }; let running = true; requestAnimationFrame(raf);
  e.pointerDown(20, 60, 0, {});
  for (let i = 0; i < 80; i++) { e.pointerMove(20 + i, 60 + Math.floor(i / 4), 0, {}); await new Promise((r) => setTimeout(r, 16)); }
  e.pointerUp(100, 80, 0, {});
  const duringStroke = validates;
  await new Promise((r) => setTimeout(r, 600));
  running = false; e.validate = v0;
  frames.sort((a, b) => a - b);
  return { validatesDuringStroke: duringStroke, validatesAfter: validates, undo: e.undoDepth, frameP50: +frames[Math.floor(frames.length / 2)].toFixed(1), frameP95: +frames[Math.floor(frames.length * 0.95)].toFixed(1), frameMax: +frames[frames.length - 1].toFixed(1), n: frames.length };
});
log('traço raio 8 (80 moves):', JSON.stringify(stroke));

// ---- 4) acúmulo de listeners/nós DOM ao alternar ferramentas ----
const dom = await ed(() => {
  const e = window.aoe.editor, p = window.aoe.editorPanel;
  const count = () => document.querySelectorAll('#editor *').length + document.querySelectorAll('#editor-top *').length;
  const before = count();
  const tools = ['terrain', 'node', 'building', 'unit', 'start', 'select', 'erase'];
  for (let i = 0; i < 700; i++) { e.ui.tool = tools[i % tools.length]; p.update(); }
  e.ui.tool = 'terrain'; p.update();
  const after = count();
  // inspetor: seleciona/deseleciona 300 vezes
  const u = [...e.state.units.values()][0];
  for (let i = 0; i < 300; i++) { e.ui.selected = i % 2 ? { kind: 'unit', id: u.id } : null; p.update(); }
  e.ui.selected = null; p.update();
  return { before, after, after2: count() };
});
log('nós DOM antes/depois de 700 trocas de ferramenta:', JSON.stringify(dom));

// ---- 5) tooltip com <br> literal, títulos dos botões ----
const tips = await ed(() => {
  const e = window.aoe.editor, p = window.aoe.editorPanel; e.ui.tool = 'building'; p.update();
  const chip = document.querySelector('#editor .chip[data-building="tower"]');
  const noTitle = [...document.querySelectorAll('#editor button, #editor-top button')].filter((b) => !b.title).map((b) => (b.id || b.className) + ':' + b.textContent.trim().slice(0, 20));
  return { towerTitle: chip?.title, noTitle };
});
log('tooltips:', JSON.stringify(tips));

// ---- 6) minimapa: clique centra; botão direito não emite ordem; inícios numerados (captura) ----
const mm = await ed(() => {
  const s = window.aoe.session; const cam = window.aoe.renderer.cam; const c = document.querySelector('#minimap'); const r = c.getBoundingClientRect();
  let cmds = 0; const c0 = s.command?.bind(s); if (c0) s.command = (...a) => { cmds++; return c0(...a); };
  const before = { x: cam.x, y: cam.y };
  const ev = (type, btn, buttons) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + r.width * 0.8, clientY: r.top + r.height * 0.8, button: btn, buttons }));
  ev('pointerdown', 0, 1); ev('pointerup', 0, 0);
  const after = { x: cam.x, y: cam.y };
  ev('pointerdown', 2, 2); ev('pointerup', 2, 0);
  if (c0) s.command = c0;
  return { before, after, moved: before.x !== after.x || before.y !== after.y, cmds, hasCommand: !!c0 };
});
log('minimapa:', JSON.stringify(mm));
await page.screenshot({ path: `${out}/minimap-720.png`, clip: { x: 0, y: 720 - 200, width: 210, height: 200 } });

// ---- 7) layout 1280x720: paleta de edifícios + lista de validação, estouro da barra ----
await ed(() => { const e = window.aoe.editor, p = window.aoe.editorPanel; e.ui.tool = 'building'; e.ui.showGrid = true; p.update(); const u = [...e.state.units.values()][0]; e.ui.selected = { kind: 'unit', id: u.id }; p.update(); });
await page.mouse.move(640, 300); await page.waitForTimeout(300);
const layout = async () => ed(() => {
  const m = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight }; };
  return { top: m('#top'), editorTop: m('#editor-top'), bottom: m('#bottom'), editor: m('#editor'), tools: m('#ed-tools'), mid: m('#editor .col.mid'), right: m('#editor .col.right'), palette: m('#ed-palette'), issues: m('#ed-issues'), insp: m('#ed-insp'), minimap: m('#minimap'), name: m('#ed-name'), exitBtn: m('#ed-exit'), mute: m('#top > button:last-of-type') };
});
log('layout 1280x720:', JSON.stringify(await layout()));
await page.screenshot({ path: `${out}/editor-1280.png` });
// nome longo
await ed(() => { window.aoe.editor.setMeta({ name: 'Um nome de mapa muito comprido para testar a barra superior 12345' }); window.aoe.editorPanel.update(); });
await page.waitForTimeout(100);
log('layout nome longo:', JSON.stringify((await layout()).editorTop), JSON.stringify((await layout()).top));
await page.screenshot({ path: `${out}/editor-1280-longname.png`, clip: { x: 0, y: 0, width: 1280, height: 44 } });
await ed(() => { window.aoe.editor.setMeta({ name: 'Grande Perf' }); });
// modal Testar (4 inícios)
await page.click('#ed-test'); await page.waitForTimeout(300);
log('modal testar visível:', await page.isVisible('#modal #et-go'), JSON.stringify(await ed(() => { const r = document.querySelector('#modal').getBoundingClientRect(); const m = document.querySelector('#modal'); return { h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), scrollH: m.scrollHeight, clientH: m.clientHeight }; })));
await page.screenshot({ path: `${out}/test-modal-720.png` });
await page.click('#modal #m-cancel'); await page.waitForTimeout(100);
// 1920x1080
await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(500);
await ed(() => { const e = window.aoe.editor, p = window.aoe.editorPanel; e.ui.tool = 'unit'; p.update(); });
await page.mouse.move(900, 400); await page.waitForTimeout(300);
log('layout 1920x1080:', JSON.stringify(await layout()));
await page.screenshot({ path: `${out}/editor-1920.png` });
await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(300);

// ---- 8) cota do localStorage: salvar e autosave ----
const quota = await ed(() => {
  const p = window.aoe.editorPanel;
  const filler = 'x'.repeat(256 * 1024); let n = 0;
  try { for (; n < 200; n++) localStorage.setItem('__fill' + n, filler); } catch { /* cheio */ }
  const before = document.querySelectorAll('#messages .toast').length;
  const saved = p.save();
  const toasts = [...document.querySelectorAll('#messages .toast')].slice(before).map((t) => t.className + ': ' + t.textContent);
  const idx = localStorage.getItem('aoe_maps_v1'); const item = localStorage.getItem('aoe_map_grande-perf');
  // autosave com cota cheia
  localStorage.removeItem('aoe_editor_autosave');
  const before2 = document.querySelectorAll('#messages .toast').length;
  window.aoe.editor.setMeta({ author: 'quota' });
  p.autosaveNow();
  const autos = localStorage.getItem('aoe_editor_autosave');
  const toasts2 = [...document.querySelectorAll('#messages .toast')].slice(before2).map((t) => t.className + ': ' + t.textContent);
  for (let i = 0; i < n; i++) localStorage.removeItem('__fill' + i);
  return { fillersMB: +(n * 0.25).toFixed(2), saved, toasts, indexHasMap: !!idx && idx.includes('grande-perf'), itemStored: !!item, dirty: window.aoe.editor.dirty, autosaveStored: !!autos, toasts2 };
});
log('cota:', JSON.stringify(quota));

// ---- 9) HTML no nome do mapa (arquivo importado) → toast editor.opened ----
const xss = await ed(() => {
  const f = window.aoe.editor.toFile();
  f.name = '<b id="xss-probe">nome</b>'; f.id = 'xss';
  window.aoe.startEditor(f);
  return { probeInToast: !!document.querySelector('#messages #xss-probe'), topName: document.querySelector('#ed-name')?.innerHTML.slice(0, 60), bodyProbe: !!document.querySelector('#xss-probe') };
});
log('html no nome:', JSON.stringify(xss));

// ---- 10) atalhos: H (editor), F1 → ajuda → Atalhos (do jogo?) ----
await page.mouse.click(640, 300); await page.keyboard.press('h'); await page.waitForTimeout(150);
log('H abre atalhos do editor:', (await page.textContent('#modal h2'))?.trim());
await page.keyboard.press('Escape'); await page.waitForTimeout(100);
await page.keyboard.press('F1'); await page.waitForTimeout(150);
log('F1 abre:', (await page.textContent('#modal h2'))?.trim());
if (await page.$('#modal #m-hotkeys')) { await page.click('#modal #m-hotkeys'); await page.waitForTimeout(150); log('F1→Atalhos abre:', (await page.textContent('#modal h2'))?.trim()); }
await page.keyboard.press('Escape'); await page.waitForTimeout(100);

// ---- 11) KotH "escolher no mapa" pendente após Esc ----
await page.click('#ed-props'); await page.waitForTimeout(150); await page.click('#ep-koth-pick'); await page.waitForTimeout(100);
await page.keyboard.press('Escape'); await page.waitForTimeout(100); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
const koth = await ed(() => { const e = window.aoe.editor; e.ui.tool = 'terrain'; e.ui.terrain = 3; const before = e.undoDepth; const kb = e.meta.koth; return { before, kb }; });
await page.mouse.click(640, 300); await page.waitForTimeout(150);
log('koth pendente após Esc:', JSON.stringify(koth), JSON.stringify(await ed(() => ({ koth: window.aoe.editor.meta.koth, undo: window.aoe.editor.undoDepth }))));

// ---- 12) modo de teste: menu → Salvar grava aoe_save_v1? F5 bloqueado? barra superior 1280 ----
await ed(() => { localStorage.removeItem('aoe_save_v1'); window.aoe.testFromEditor({ as: 0, slots: ['empty', 'easy', 'empty', 'empty'], god: 'zeus', mode: 'conquest', reveal: false }); });
await page.waitForTimeout(1200);
log('teste iniciado:', JSON.stringify(await ed(() => ({ mode: window.aoe.session.ui.mode, badge: !document.querySelector('#test-badge').classList.contains('hidden'), revealAll: window.aoe.renderer.revealAll, players: window.aoe.session.state.config.players.length }))));
await page.screenshot({ path: `${out}/testmode-top-1280.png`, clip: { x: 0, y: 0, width: 1280, height: 44 } });
log('top em modo teste:', JSON.stringify(await ed(() => { const el = document.querySelector('#top'); return { scrollW: el.scrollWidth, clientW: el.clientWidth }; })));
await page.keyboard.press('F5'); await page.waitForTimeout(200);
log('F5 em teste grava save?', await ed(() => localStorage.getItem('aoe_save_v1') !== null));
await page.click('#top-menu'); await page.waitForTimeout(200);
log('menu em teste botões:', await page.$$eval('#modal button', (l) => l.map((b) => b.id + '=' + b.textContent.trim()).join(' | ')));
if (await page.$('#modal #m-save')) { await page.click('#modal #m-save'); await page.waitForTimeout(200); log('Menu→Salvar em teste grava aoe_save_v1?', await ed(() => localStorage.getItem('aoe_save_v1') !== null), (await page.textContent('#messages'))?.slice(-80)); }
await page.evaluate(() => localStorage.removeItem('aoe_save_v1'));
// volta ao editor
await page.click('#top-menu'); await page.waitForTimeout(200); page.once('dialog', (d) => d.accept()); await page.click('#modal #m-quit'); await page.waitForTimeout(600);
log('de volta:', JSON.stringify(await ed(() => ({ mode: window.aoe.session?.ui.mode, body: document.body.className, revealAll: window.aoe.renderer.revealAll }))));

log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
