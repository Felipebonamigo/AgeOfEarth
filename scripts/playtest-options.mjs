// Opções e atalhos: painel de opções no menu principal, tela de atalhos, ajuda (também no menu principal),
// escala da interface (zoom do HUD), qualidade de renderização (resolução do canvas), o ciclo de luz opcional (Etapa 5:
// desligado por padrão, filtro de cor no mundo quando ligado, rótulo em PT e EN) e persistência. Sai com 1 se alguma
// verificação marcada FALHOU no bloco do ciclo de luz.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' }, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });

// Ajuda e atalhos a partir do menu principal (modal fora do #hud)
await page.click('#m-help'); await page.waitForTimeout(200);
console.log('ajuda no menu principal visível:', await page.isVisible('#modal-back'), '|', (await page.textContent('#modal h2'))?.trim());
await page.click('#modal #m-hotkeys'); await page.waitForTimeout(200);
const hkRows = await page.$$eval('#modal table tr', (els) => els.length);
console.log('tela de atalhos:', (await page.textContent('#modal h2'))?.trim(), '| linhas:', hkRows, '| tem portão(K):', (await page.textContent('#modal'))?.includes('Portão'));
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
console.log('modal fechado:', !(await page.isVisible('#modal-back')));

// Painel de opções no menu principal
await page.click('#m-options'); await page.waitForTimeout(200);
console.log('painel de opções:', await page.isVisible('#m-options-panel'), '| campos:', await page.$$eval('#m-options-panel select, #m-options-panel input', (els) => els.map((e) => e.id).join(',')));
await page.selectOption('#m-options-panel #o-ui', '1.3'); await page.waitForTimeout(200);
const zoomMenu = await page.evaluate(() => [document.getElementById('menu').style.zoom, document.getElementById('hud').style.zoom, document.getElementById('modal-back').style.zoom].join('/'));
console.log('zoom aplicado (menu/hud/modal):', zoomMenu);
await page.selectOption('#m-options-panel #o-ui', '1'); await page.waitForTimeout(100);
await page.click('#m-options-panel #o-hotkeys'); await page.waitForTimeout(200);
console.log('atalhos pelo painel:', (await page.textContent('#modal h2'))?.trim());
await page.keyboard.press('Escape'); await page.waitForTimeout(100);

// Partida: menu da partida com opções, qualidade de renderização e persistência
await page.fill('#m-seed', '7'); await page.click('#m-start'); await page.waitForTimeout(1200);
const w0 = await page.evaluate(() => window.aoe.renderer.canvas.width);
await page.click('#top button:has-text("Menu")'); await page.waitForTimeout(300);
console.log('menu da partida com opções:', await page.isVisible('#modal #o-render'), await page.isVisible('#modal #m-ranges'));
await page.selectOption('#modal #o-render', '0.5'); await page.waitForTimeout(300);
const w1 = await page.evaluate(() => window.aoe.renderer.canvas.width);
console.log('largura do canvas 100% → 50%:', w0, '→', w1, w1 < w0 ? 'ok' : 'FALHOU');
await page.selectOption('#modal #o-render', '1'); await page.waitForTimeout(300);
console.log('volta a 100%:', await page.evaluate(() => window.aoe.renderer.canvas.width));
await page.selectOption('#modal #o-ui', '0.9'); await page.waitForTimeout(100);
await page.check('#modal #o-fs'); await page.waitForTimeout(300);
console.log('tela cheia (navegador, pode exigir gesto):', await page.evaluate(() => !!document.fullscreenElement));
await page.uncheck('#modal #o-fs'); await page.waitForTimeout(200);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('aoe_settings_v1') ?? '{}'));
console.log('persistido:', JSON.stringify({ uiScale: saved.uiScale, renderScale: saved.renderScale, fullscreen: saved.fullscreen, edgeScroll: saved.edgeScroll }));
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
// fechar o menu com Esc despausa (regressão: ficava pausado para sempre)
const tA = await page.evaluate(() => window.aoe.session.state.tick); await page.waitForTimeout(600);
const tB = await page.evaluate(() => window.aoe.session.state.tick);
console.log('após Esc no menu, a partida continua:', tB > tA ? 'ok' : 'FALHOU (pausada)', '| pausado=', await page.evaluate(() => window.aoe.session.paused));
// pausa manual (P) sobrevive a abrir/fechar o menu
await page.keyboard.press('p'); await page.waitForTimeout(100);
await page.click('#top button:has-text("Menu")'); await page.waitForTimeout(200); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
console.log('pausa manual preservada após menu:', await page.evaluate(() => window.aoe.session.paused) ? 'ok' : 'FALHOU');
await page.keyboard.press('p'); await page.waitForTimeout(100);
// diagnóstico exportável (botão no menu da partida) — aqui via API, sem abrir o diálogo de download
const diag = await page.evaluate(() => JSON.parse(window.aoe.diagnostic()));
console.log('diagnóstico:', diag.version === 1 && diag.session && typeof diag.session.save === 'string' && Array.isArray(diag.errors) ? 'ok' : 'FALHOU', '| campos:', Object.keys(diag).join(','));
await page.click('#top button:has-text("Menu")'); await page.waitForTimeout(200);
console.log('botão de diagnóstico no menu:', await page.isVisible('#modal #m-diag'));
await page.keyboard.press('Escape'); await page.waitForTimeout(200);

// Ciclo de luz (Etapa 5, pergunta 10): desligado por padrão (meio-dia fixo, sem filtro); ligado pelo menu da partida
// põe o ColorMatrixFilter na camada do mundo e persiste; desligado tira o filtro; rótulo em PT e EN
const fails = [];
const check = (ok, msg) => { console.log(msg + ':', ok ? 'ok' : 'FALHOU'); if (!ok) fails.push(msg); };
const lightState = () => page.evaluate(() => {
  const R = window.aoe.renderer, w = R.app.stage.children[0];
  // o nome da classe sai minificado na build: o ColorMatrixFilter se reconhece pela matriz 4×5
  return { setting: window.aoe.settings.dayCycle, enabled: R.dayCycle.enabled, filters: (w.filters ?? []).map((f) => (Array.isArray(f.matrix) && f.matrix.length === 20 ? 'ColorMatrix' : 'outro')), saved: JSON.parse(localStorage.getItem('aoe_settings_v1') ?? '{}').dayCycle ?? false };
});
let ls = await lightState();
check(!ls.setting && !ls.enabled && ls.filters.length === 0, `ciclo de luz desligado por padrão (sem filtro) ${JSON.stringify(ls)}`);
await page.click('#top button:has-text("Menu")'); await page.waitForTimeout(300);
await page.evaluate(() => { const d = document.querySelector('#modal details'); if (d) d.open = true; });
const lblPt = (await page.textContent('#modal label:has(#o-daycycle)'))?.trim() ?? '';
check(/Ciclo de luz/.test(lblPt), `opção no menu da partida em PT ("${lblPt}")`);
check(!(await page.isChecked('#modal #o-daycycle')), 'caixa desmarcada por padrão');
await page.check('#modal #o-daycycle'); await page.waitForTimeout(300);
ls = await lightState();
check(ls.setting && ls.enabled && ls.saved && ls.filters.some((n) => /ColorMatrix/.test(n)), `ligado: filtro de cor no mundo e salvo ${JSON.stringify(ls)}`);
// a cor muda com o relógio de jogo: no entardecer a matriz não é a identidade
const m = await page.evaluate(() => { const d = window.aoe.renderer.dayCycle; d.offset = (0.8 - 0.18) * 14 * 60; d.last = -1; window.aoe.renderer.render(window.aoe.session.state, 0.5, window.aoe.input.renderUI(), 1 / 60); const f = window.aoe.renderer.app.stage.children[0].filters.find((x) => x.matrix); const mm = Array.from(f.matrix); d.offset = 0; d.last = -1; return mm; });
check(Math.abs(m[0] - 1) > 0.02 && m[0] > m[12], `entardecer quente (R ${m[0].toFixed(2)} > B ${m[12].toFixed(2)})`);
await page.uncheck('#modal #o-daycycle'); await page.waitForTimeout(300);
ls = await lightState();
check(!ls.setting && !ls.enabled && !ls.saved && ls.filters.length === 0, `desligado de novo: sem filtro e salvo ${JSON.stringify(ls)}`);
await page.selectOption('#modal #o-lang', 'en'); await page.waitForTimeout(300);
await page.evaluate(() => { const d = document.querySelector('#modal details'); if (d) d.open = true; });
const lblEn = (await page.textContent('#modal label:has(#o-daycycle)'))?.trim() ?? '';
check(/Day-light cycle/.test(lblEn), `opção em EN ("${lblEn}")`);
await page.selectOption('#modal #o-lang', 'pt'); await page.waitForTimeout(300);
await page.keyboard.press('Escape'); await page.waitForTimeout(200);

await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(300);
console.log('após recarregar, zoom do menu:', await page.evaluate(() => document.getElementById('menu').style.zoom));
await page.screenshot({ path: '/tmp/options.png' });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
if (fails.length) { console.log('falhas:', fails.join(' | ')); process.exit(1); }
