// Editor de mapas (docs/EDITOR.md §5 Etapa 3): aba Editor → mapa gerado 80×80 → pintar lago e bosque com o mouse,
// torre e hoplita do jogador 2, mover o início 2, desfazer/refazer, validação, salvar, testar (partida real) e voltar
// ao editor com a mesma instância, exportar, P/F5 sem efeito, Esc abre o menu do editor. Captura em $3 (opcional).
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const shot = process.argv[3] ?? '';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ok = (label, cond, extra = '') => console.log(`${label}: ${cond ? 'ok' : 'FALHOU'}${extra ? ' ' + extra : ''}`);
const ed = (fn, arg) => page.evaluate(fn, arg);
/** Coordenadas de tela do centro de um tile. */
const screenOf = (x, y) => ed(([x, y]) => window.aoe.renderer.cam.worldToScreen(x + 0.5, y + 0.5), [x, y]);
/** Centra a câmera no tile com zoom 1 (tiles de 32 px na tela). */
const look = (x, y) => ed(([x, y]) => { const c = window.aoe.renderer.cam; c.zoom = 1; c.centerOn(x, y); }, [x, y]);
const terrainAt = (x, y) => ed(([x, y]) => { const m = window.aoe.editor.map; return m.terrain[y * m.w + x]; }, [x, y]);
const info = () => ed(() => { const e = window.aoe.editor; const s = window.aoe.session; return { mode: s.ui.mode, w: e.map.w, h: e.map.h, starts: e.map.starts.map((p) => [p.x, p.y]), nodes: e.map.nodes.size, undo: e.undoDepth, redo: e.redoDepth, dirty: e.dirty, tool: e.ui.tool, player: e.ui.player, units: [...e.state.units.values()].map((u) => `${u.type}@${u.owner}`), buildings: [...e.state.buildings.values()].map((b) => `${b.type}@${b.owner}`) }; });

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.removeItem('aoe_maps_v1'); localStorage.removeItem('aoe_map_teste-editor'); localStorage.removeItem('aoe_editor_autosave'); localStorage.removeItem('aoe_save_v1'); localStorage.removeItem('aoe_editor_test'); });
// 1) aba Editor → novo mapa gerado por semente, 80×80, 2 inícios
await page.click('#menu [data-tab="editor"]'); await page.waitForTimeout(200);
ok('aba Editor', await page.isVisible('#ed-create'));
await page.fill('#ed-name', 'Teste Editor'); await page.selectOption('#ed-size', 'small'); await page.selectOption('#ed-starts', '2'); await page.selectOption('#ed-base', 'gen'); await page.fill('#ed-seed', '5'); await page.selectOption('#ed-maptype', 'continental');
await page.click('#ed-create'); await page.waitForTimeout(1500);
let st = await info();
ok('editor aberto (window.aoe.editor, ui.mode)', await ed(() => !!window.aoe.editor) && st.mode === 'editor', `| ${st.w}×${st.h}, ${st.starts.length} inícios, ${st.nodes} nós`);
ok('HUD em modo editor (painel e barra)', await page.isVisible('#editor') && await page.isVisible('#editor-top') && !(await page.isVisible('#selection')) && !(await page.isVisible('#top .res')));
await ed(() => { window.aoe.editor.__mark = 'instancia-1'; });
// 2) lago com o mouse real: ferramenta Terreno (T), água (4), raio 3, arraste horizontal
await page.keyboard.press('t'); await page.keyboard.press('4'); await page.waitForTimeout(100);
await ed(() => { window.aoe.editor.ui.brushRadius = 3; });
ok('subpaleta de terreno com cor', await page.$$eval('#editor .chip .sw', (l) => l.length) === 6 && await ed(() => window.aoe.editor.ui.terrain) === 1);
const lake = { x0: 20, y0: 24, x1: 32, y1: 24 };
const wasWater = await terrainAt(26, 24);
await look(26, 24);
let a = await screenOf(lake.x0, lake.y0), b = await screenOf(lake.x1, lake.y1);
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, a.y, { steps: 6 }); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(250);
const waterRow = []; for (let x = lake.x0; x <= lake.x1; x++) waterRow.push(await terrainAt(x, lake.y0));
st = await info();
ok('lago pintado com o mouse', waterRow.every((t) => t === 1 || t === 5) && st.undo >= 1, `| terreno antes=${wasWater} linha=${waterRow.join('')} undo=${st.undo}`);
// 3) bosque: ferramenta Recursos (N), árvore, arraste
await page.keyboard.press('n'); await page.waitForTimeout(100);
ok('paleta de nós', await page.$$eval('#editor .chip[data-node]', (l) => l.length) === 6);
const nodesBefore = st.nodes;
await look(26, 40);
a = await screenOf(18, 40); b = await screenOf(34, 40);
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(250);
st = await info();
ok('bosque pintado', st.nodes > nodesBefore, `| nós ${nodesBefore} → ${st.nodes}`);
// 4) torre do jogador 2 (Shift+2) num tile livre; hoplita do jogador 2
await page.keyboard.press('b'); await page.keyboard.press('Shift+2'); await page.waitForTimeout(100);
await page.click('#editor .chip[data-building="tower"]'); await page.waitForTimeout(100);
st = await info();
ok('ferramenta edifícios + jogador 2 + torre', st.tool === 'building' && st.player === 1 && await ed(() => window.aoe.editor.ui.buildingType) === 'tower');
const spot = await ed(() => { const e = window.aoe.editor; const s = e.map.starts[1]; for (let r = 5; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = s.x + dx, y = s.y + dy; if (x > 2 && y > 2 && x < e.map.w - 3 && y < e.map.h - 3 && e.canPlaceAt(x, y)) return { x, y }; } return null; });
ok('tile livre para a torre', !!spot, JSON.stringify(spot));
await look(spot.x, spot.y);
let p = await screenOf(spot.x, spot.y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(80); await page.mouse.click(p.x, p.y); await page.waitForTimeout(200);
st = await info();
ok('torre do jogador 2 colocada', st.buildings.includes('tower@1'), `| edifícios: ${st.buildings.join(',')}`);
await page.keyboard.press('u'); await page.waitForTimeout(80);
await page.click('#editor .chip[data-unit="hoplite"]'); await page.waitForTimeout(80);
const uspot = await ed(([sx, sy]) => { const e = window.aoe.editor; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const x = sx + dx, y = sy + dy; if ((dx || dy) && e.canPlaceAt(x, y) && e.pickAt(x, y) === null) return { x, y }; } return null; }, [spot.x, spot.y]);
p = await screenOf(uspot.x, uspot.y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(80); await page.mouse.click(p.x, p.y); await page.waitForTimeout(200);
st = await info();
ok('hoplita do jogador 2 colocado', st.units.includes('hoplite@1'), `| unidades: ${st.units.join(',')}`);
// 5) mover o início 2: ferramenta Inícios (I), Tab Tab seleciona o 2º, clique no destino
const start2 = st.starts[1];
await page.keyboard.press('i'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(80);
ok('início 2 selecionado por Tab', await ed(() => JSON.stringify(window.aoe.editor.ui.selected)) === '{"kind":"start","id":1}');
const dest = await ed(([sx, sy]) => { const e = window.aoe.editor; const m = e.map; const clear = (x, y) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const i = (y + dy) * m.w + x + dx; if (m.terrain[i] !== 0 || m.nodeAt[i] !== -1 || m.buildingAt[i] !== -1 || e.pickAt(x + dx, y + dy) !== null) return false; } return true; }; for (let r = 4; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = sx + dx, y = sy + dy; if (x > 8 && y > 8 && x < m.w - 9 && y < m.h - 9 && clear(x, y)) return { x, y }; } return null; }, start2);
await look(dest.x, dest.y);
p = await screenOf(dest.x, dest.y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(80); await page.mouse.click(p.x, p.y); await page.waitForTimeout(200);
st = await info();
ok('início 2 movido', st.starts[1][0] === dest.x && st.starts[1][1] === dest.y, `| ${JSON.stringify(start2)} → ${JSON.stringify(st.starts[1])}`);
// 6) desfazer / refazer
const undoBefore = st.undo;
await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
let st2 = await info();
ok('Ctrl+Z desfaz (undoDepth cai, início volta)', st2.undo === undoBefore - 1 && st2.redo === 1 && st2.starts[1][0] === start2[0] && st2.starts[1][1] === start2[1], `| undo ${undoBefore} → ${st2.undo}, redo ${st2.redo}`);
await page.keyboard.press('Control+y'); await page.waitForTimeout(100);
st2 = await info();
ok('Ctrl+Y refaz', st2.undo === undoBefore && st2.redo === 0 && st2.starts[1][0] === dest.x);
// 7) validação (lista com itens) — força pelo menos um aviso: início 2 sem recursos ao redor é comum; senão nada
await page.click('#ed-validate'); await page.waitForTimeout(400);
const issues = await page.$$eval('#editor .issues li', (l) => l.map((x) => x.className + ':' + x.querySelector('.tx')?.textContent));
const nIssues = issues.filter((i) => !i.startsWith('ok')).length;
ok('lista de validação mostra avisos', nIssues > 0, `| ${nIssues} itens: ${issues.slice(0, 3).join(' ; ')}`);
ok('status na barra', (await page.textContent('#ed-status'))?.trim() !== '', `| ${(await page.textContent('#ed-status'))?.trim()}`);
const goto = await page.$('#editor .issues li button');
if (goto) { await goto.click(); await page.waitForTimeout(100); ok('"Ir até" pisca o tile', await ed(() => !!window.aoe.editor.ui.flash)); }
// 8) salvar → Meus mapas
await page.click('#ed-save'); await page.waitForTimeout(300);
const index = await ed(() => JSON.parse(localStorage.getItem('aoe_maps_v1') ?? '[]').map((e) => e.id));
ok('Salvar → aoe_maps_v1', index.includes('teste-editor') && !(await info()).dirty, `| índice: ${index.join(',')}`);
ok('toast de salvo', (await page.textContent('#messages'))?.includes('Teste Editor'));
// captura do editor
if (shot) { await look(st.starts[1][0], st.starts[1][1]); await ed(() => { window.aoe.editor.ui.tool = 'building'; window.aoe.editor.ui.showGrid = true; }); await page.mouse.move(640, 300); await page.waitForTimeout(400); await page.screenshot({ path: shot }); console.log('captura:', shot); }
// 9) P não pausa/despausa; F5 não grava save
await page.keyboard.press('p'); await page.waitForTimeout(80);
ok('P não altera a pausa do editor', await ed(() => window.aoe.session.paused === true));
await page.keyboard.press('F5'); await page.waitForTimeout(200);
ok('F5 não grava save', await ed(() => localStorage.getItem('aoe_save_v1') === null));
// 10) Esc abre o menu do editor
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
ok('Esc abre o menu do editor', await page.isVisible('#modal #em-back') && await page.isVisible('#modal #em-test'));
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
ok('Esc fecha o menu', !(await page.isVisible('#modal-back')));
// 11) Testar → modal → iniciar → partida real
await page.click('#ed-test'); await page.waitForTimeout(300);
ok('modal Testar', await page.isVisible('#modal #et-go'));
await page.selectOption('#et-as', '0'); await page.selectOption('#modal [data-slot="1"]', 'easy'); await page.selectOption('#et-mode', 'conquest');
page.once('dialog', (d) => d.accept());   // avisos pedem confirmação
await page.click('#et-go'); await page.waitForTimeout(1500);
const test = await ed(() => { const s = window.aoe.session; const cfg = s.state.config; const f = window.aoe.editor.toFile(); return { mode: s.ui.mode, w: s.state.map.w, h: s.state.map.h, players: cfg.players.length, tower: [...s.state.buildings.values()].filter((b) => b.type === 'tower').map((b) => b.owner), kitCfg: cfg.map.startKit, kitFile: f.startKit, hash: cfg.mapHash, startOrder: cfg.startOrder, paused: s.paused, tick: s.state.tick, tcs: [...s.state.buildings.values()].filter((b) => b.type === 'town_center').length }; });
ok('partida de teste criada do arquivo', test.mode === 'normal' && test.w === 80 && test.h === 80 && test.players === 2 && !test.paused && test.tick > 0, JSON.stringify(test));
ok('torre presente no estado (dona do início 2 = jogador 2)', test.tower.length === 1 && test.tower[0] === 1);
ok('config.map.startKit conforme o arquivo', test.kitCfg === test.kitFile && test.tcs === 2);
ok('selo de modo de teste', await page.isVisible('#test-badge') && !(await page.isVisible('#editor')));
ok('autosave antes de testar', await ed(() => { const d = JSON.parse(localStorage.getItem('aoe_editor_autosave') ?? 'null'); return !!d && d.w === 80; }));
// 12) Menu → Voltar ao editor → mesma instância, undo preservado
await page.click('#top-menu'); await page.waitForTimeout(200);
ok('botão de sair vira "Voltar ao editor"', (await page.textContent('#modal #m-quit'))?.includes('editor'));
page.once('dialog', (d) => d.accept()); await page.click('#modal #m-quit'); await page.waitForTimeout(600);
st2 = await info();
ok('de volta ao editor com a mesma instância', st2.mode === 'editor' && await ed(() => window.aoe.editor.__mark === 'instancia-1') && st2.undo === undoBefore && st2.w === 80, `| undo=${st2.undo}, marca=${await ed(() => window.aoe.editor.__mark)}`);
ok('painel e barra de volta, selo escondido', await page.isVisible('#editor') && await page.isVisible('#editor-top') && !(await page.isVisible('#test-badge')));
// 13) exportar (ponte de arquivo simulada como no Electron)
await ed(() => { window.desktop = { saveFile: async (name, content) => { window.__exported = { name, size: content.length }; return true; } }; });
await page.click('#ed-export'); await page.waitForTimeout(300);
const exp = await ed(() => window.__exported);
ok('Exportar gera <id>.map.json', !!exp && exp.name === 'teste-editor.map.json' && exp.size > 1000, JSON.stringify(exp));
// 14) propriedades (modal) e renomear
await page.click('#ed-props'); await page.waitForTimeout(150);
ok('modal Propriedades', await page.isVisible('#modal #ep-ok') && (await page.inputValue('#ep-id')) === 'teste-editor');
await page.fill('#ep-author', 'Playwright'); await page.click('#ep-ok'); await page.waitForTimeout(100);
ok('autor gravado nos metadados', await ed(() => window.aoe.editor.meta.author === 'Playwright' && window.aoe.editor.dirty));
// 15) sair do editor → menu principal (confirmação por dirty) → rascunho disponível
page.once('dialog', (d) => d.accept()); await page.click('#ed-exit'); await page.waitForTimeout(400);
ok('Sair volta ao menu com "Continuar rascunho"', await page.isVisible('#menu') && await page.isVisible('#ed-resume') && await ed(() => window.aoe.session === null));
ok('mapa salvo aparece em Meus mapas e no seletor da Partida rápida', (await page.$$eval('#ed-mine .mapcard', (l) => l.map((x) => x.dataset.id))).includes('teste-editor') && await ed(() => { document.querySelector('#menu [data-tab="skirmish"]').click(); return [...document.querySelectorAll('#m-fixed-sel option')].some((o) => o.value === 'teste-editor'); }));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
