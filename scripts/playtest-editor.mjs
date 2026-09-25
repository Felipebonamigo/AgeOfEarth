// Editor de mapas (docs/EDITOR.md §5 Etapas 3 e 4): aba Editor → mapa gerado 80×80 → pintar lago e bosque com o mouse,
// torre e hoplita do jogador 2, mover o início 2, desfazer/refazer, validação, salvar, testar (partida real) e voltar
// ao editor com a mesma instância, exportar, P/F5 sem pausar nem salvar, Esc abre o menu do editor; Etapa 4: balde,
// conta-gotas, "Corrigir" um gargalo (o aviso some), tabela de recursos, redimensionar (Ctrl+Z volta à instância
// anterior) e cada mapa oficial aberto no editor (sem avisos), testado e de volta, com captura do mapa inteiro em
// docs/art/editor-<id>.png. Captura extra em $3 (opcional).
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
await page.keyboard.press('m'); await page.waitForTimeout(80);
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
// 9) P arma o conta-gotas (não pausa); F5 não grava save
await page.keyboard.press('p'); await page.waitForTimeout(80);
ok('P não altera a pausa do editor (arma o conta-gotas)', await ed(() => window.aoe.session.paused === true && window.aoe.editor.ui.eyedrop === true));
await page.keyboard.press('p'); await page.waitForTimeout(50);
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
// 16) Etapa 4 — balde: botão 🪣 com a ferramenta Terreno, areia (2), clique no lago pintado → a região contígua vira areia
await page.keyboard.press('t'); await page.keyboard.press('2'); await page.waitForTimeout(80);
await page.click('#ed-bucket'); await page.waitForTimeout(80);
ok('balde ligado (botão ativo)', await ed(() => window.aoe.editor.ui.bucket === true) && await page.$eval('#ed-bucket', (e) => e.classList.contains('active')));
const lakeRow = () => ed(() => { const m = window.aoe.editor.map; return [...Array(13).keys()].map((k) => m.terrain[24 * m.w + 20 + k]); });
const lakeBefore = await lakeRow();
const u0 = (await info()).undo;
await look(26, 24); p = await screenOf(26, 24); await page.mouse.move(p.x, p.y); await page.waitForTimeout(80); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250);
const lakeAfter = await lakeRow();
ok('balde preenche a região contígua (lago → areia) num passo', lakeAfter.every((t) => t === 3) && (await info()).undo === u0 + 1, `| antes=${lakeBefore.join('')} depois=${lakeAfter.join('')}`);
await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
ok('Ctrl+Z desfaz o balde', (await lakeRow()).join('') === lakeBefore.join(''));
await page.click('#ed-bucket'); await page.waitForTimeout(50);
// 17) conta-gotas: botão 💧 e clique na torre → ferramenta Edifícios, torre, jogador 2
await ed(() => { window.aoe.editor.ui.player = 0; window.aoe.editor.ui.buildingType = 'barracks'; });
await page.click('#ed-eyedrop'); await page.waitForTimeout(80);
ok('conta-gotas armado (botão ativo, cursor)', await page.$eval('#ed-eyedrop', (e) => e.classList.contains('active')) && await ed(() => document.body.className === 'cur-eyedrop'));
await look(spot.x, spot.y); p = await screenOf(spot.x, spot.y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(80); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150);
st = await info();
ok('conta-gotas copia a torre do jogador 2 sem editar', st.tool === 'building' && st.player === 1 && await ed(() => window.aoe.editor.ui.buildingType === 'tower' && !window.aoe.editor.ui.eyedrop) && st.buildings.filter((x) => x === 'tower@1').length === 1);
// 18) "Corrigir" gargalo: cerca de montanha em volta do início 1 com uma passagem de 1 tile → aviso → Alargar gargalos → some
const s1 = st.starts[0];
await ed(([sx, sy]) => { const e = window.aoe.editor; const m = e.map; const tiles = []; for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== 7 || (dx === 7 && dy === 0)) continue; const x = sx + dx, y = sy + dy; if (x >= 0 && y >= 0 && x < m.w && y < m.h && m.buildingAt[y * m.w + x] === -1) tiles.push(y * m.w + x); } e.apply({ kind: 'paint', tiles, terrain: 2 }); }, s1);
await page.click('#ed-validate'); await page.waitForTimeout(400);
const chokeNear = () => ed(([sx, sy]) => window.aoe.editor.validate().filter((i) => i.code === 'chokepoint' && (i.x - sx) ** 2 + (i.y - sy) ** 2 <= 100).length, s1);
const chokeLi = () => page.$$eval('#editor .issues li[data-code="chokepoint"]', (l) => l.map((x) => x.querySelector('.tx').textContent));
ok('aviso de gargalo perto do início 1 na lista, com "Corrigir"', (await chokeNear()) === 1 && (await page.$$('#editor .issues li[data-code="chokepoint"] .fix')).length > 0, `| ${(await chokeLi()).join(' ; ')}`);
const nChokeBefore = (await chokeLi()).length;
await (await page.$('#editor .issues li[data-code="chokepoint"] .fix')).click(); await page.waitForTimeout(400);
ok('Corrigir (Alargar gargalos) faz o aviso sumir', (await chokeNear()) === 0 && (await chokeLi()).length < nChokeBefore, `| restantes: ${(await chokeLi()).join(' ; ') || 'nenhum'}`);
await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
ok('Ctrl+Z desfaz a correção (o aviso volta)', (await chokeNear()) === 1);
await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
ok('Ctrl+Z desfaz a cerca', (await chokeNear()) === 0);
// 19) tabela de recursos por início
ok('tabela de recursos por início (uma linha por início)', (await page.$$('#ed-res tr[data-start]')).length === st.starts.length, `| ${(await page.$eval('#ed-res', (e) => e.textContent)).replace(/\s+/g, ' ').slice(0, 120)}`);
// 20) redimensionar pelas Propriedades: 96×96 no centro; Ctrl+Z volta à instância anterior, Ctrl+Y refaz
await page.click('#ed-props'); await page.waitForTimeout(150);
await page.fill('#ep-w', '96'); await page.fill('#ep-h', '96'); await page.selectOption('#ep-anchor', 'c'); await page.waitForTimeout(80);
const preview = await page.textContent('#ep-resize-info');
ok('prévia do redimensionamento', preview.length > 5, `| ${preview}`);
page.once('dialog', (d) => d.accept()); await page.click('#ep-resize'); await page.waitForTimeout(800);
st = await info();
ok('redimensionado para 96×96 (nova instância, painel de volta)', st.w === 96 && st.h === 96 && st.mode === 'editor' && await ed(() => window.aoe.editor.__mark === undefined) && await page.isVisible('#editor'), `| ${st.w}×${st.h}, undo=${st.undo}`);
const draftW = () => ed(() => JSON.parse(localStorage.getItem('aoe_editor_autosave') ?? 'null')?.w ?? null);
ok('o rascunho passa a ser o da instância redimensionada', (await draftW()) === 96, `| rascunho ${await draftW()}`);
await page.keyboard.press('Control+z'); await page.waitForTimeout(800);
st = await info();
ok('Ctrl+Z volta à instância de 80×80 com a pilha intacta', st.w === 80 && await ed(() => window.aoe.editor.__mark === 'instancia-1') && st.redo >= 1, `| ${st.w}×${st.h}, undo=${st.undo}, redo=${st.redo}`);
ok('o rascunho acompanha o Ctrl+Z (80×80)', (await draftW()) === 80, `| rascunho ${await draftW()}`);
await page.keyboard.press('Control+y'); await page.waitForTimeout(800);
ok('Ctrl+Y refaz o redimensionamento', (await info()).w === 96);
await page.keyboard.press('Control+s'); await page.waitForTimeout(300);
ok('Ctrl+S depois do Ctrl+Y grava o rascunho de 96×96', (await draftW()) === 96 && await ed(() => window.aoe.editor.dirty === false), `| rascunho ${await draftW()}`);
await page.keyboard.press('Control+z'); await page.waitForTimeout(800);
ok('Ctrl+Z de novo: o rascunho volta a 80×80', (await draftW()) === 80, `| rascunho ${await draftW()}`);
// 15) sair do editor → menu principal (confirmação por dirty) → rascunho disponível
page.once('dialog', (d) => d.accept()); await page.click('#ed-exit'); await page.waitForTimeout(400);
ok('Sair volta ao menu com "Continuar rascunho"', await page.isVisible('#menu') && await page.isVisible('#ed-resume') && await ed(() => window.aoe.session === null));
ok('mapa salvo aparece em Meus mapas e no seletor da Partida rápida', (await page.$$eval('#ed-mine .mapcard', (l) => l.map((x) => x.dataset.id))).includes('teste-editor') && await ed(() => { document.querySelector('#menu [data-tab="skirmish"]').click(); return [...document.querySelectorAll('#m-fixed-sel option')].some((o) => o.value === 'teste-editor'); }));
// 21) mapas oficiais: abrir no editor (cópia), sem avisos, captura do mapa inteiro, Testar contra IAs e voltar
page.removeAllListeners('dialog'); page.on('dialog', (d) => { d.accept().catch(() => {}); });   // daqui em diante toda confirmação é aceita
for (const [id, w, n] of [['estreito', 80, 2], ['egeu', 113, 4]]) {
  await page.setViewportSize({ width: 1600, height: 1000 }); await page.waitForTimeout(200);
  await page.click('#menu [data-tab="editor"]'); await page.waitForTimeout(200);
  await page.click(`#ed-builtin .mapcard[data-id="${id}"] [data-act="copy"]`); await page.waitForTimeout(1500);
  st = await info();
  const issuesN = await ed(() => window.aoe.editor.validate().length);
  ok(`${id}: aberto no editor (${w}×${w}, ${n} inícios, sem avisos)`, st.mode === 'editor' && st.w === w && st.starts.length === n && issuesN === 0 && (await page.textContent('#ed-status')).includes('✔'), `| ${st.nodes} nós, avisos=${issuesN}`);
  const res = await page.$$eval('#ed-res tr[data-start]', (l) => l.map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent).join('/')));
  ok(`${id}: recursos iguais em todos os inícios`, res.length === n && res.every((r) => r === res[0]) && (await page.$$('#ed-res td.low')).length === 0, `| ${res[0]}`);
  if (id === 'egeu') ok('egeu: times sugeridos no arquivo', await ed(() => JSON.stringify(window.aoe.editor.toFile().startTeams) === '[0,0,1,1]'));
  // visão inteira: o rodapé do editor (minimapa, ferramentas, validação) sai da frente só durante a captura e o mapa
  // inteiro fica logo abaixo da barra do editor (fitMap enquadra na janela toda)
  await ed(() => { const r = window.aoe.renderer, m = window.aoe.editor.map; r.fitMap(); r.cam.minZoom = Math.min(r.cam.minZoom, r.cam.zoom * 0.9); r.cam.zoom *= 0.93; r.cam.centerOn(m.w / 2, m.h / 2); const u = window.aoe.editor.ui; u.hover = null; u.tool = 'select'; for (const q of ['#bottom', '#messages']) document.querySelector(q).style.visibility = 'hidden'; });
  await page.mouse.move(800, 5); await page.waitForTimeout(900);
  await page.screenshot({ path: `docs/art/editor-${id}.png` }); console.log(`captura: docs/art/editor-${id}.png`);
  await ed(() => { for (const q of ['#bottom', '#messages']) document.querySelector(q).style.visibility = ''; window.aoe.renderer.fitMap(); });
  // Testar: como início 1, os outros IA normal
  await page.click('#ed-test'); await page.waitForTimeout(300);
  await page.selectOption('#et-as', '0'); for (let i = 1; i < n; i++) await page.selectOption(`#modal [data-slot="${i}"]`, 'normal'); await page.selectOption('#et-mode', 'conquest');
  await page.click('#et-go'); await page.waitForTimeout(2000);
  const tg = await ed(() => { const s = window.aoe.session; return { mode: s.ui.mode, w: s.state.map.w, players: s.state.players.length, tick: s.state.tick, tcs: [...s.state.buildings.values()].filter((b) => b.type === 'town_center').length }; });
  ok(`${id}: partida de teste no mapa oficial`, tg.mode === 'normal' && tg.w === w && tg.players === n && tg.tcs === n && tg.tick > 0, JSON.stringify(tg));
  await page.click('#top-menu'); await page.waitForTimeout(200);
  await page.click('#modal #m-quit'); await page.waitForTimeout(700);
  st = await info();
  ok(`${id}: de volta ao editor após o teste`, st.mode === 'editor' && st.w === w && await page.isVisible('#editor'));
  await page.click('#ed-exit'); await page.waitForTimeout(400);
  ok(`${id}: fora do editor, menu de volta`, await page.isVisible('#menu') && await ed(() => window.aoe.session === null));
}
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
