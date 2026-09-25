// Cenário JSON embutido (docs/EDITOR.md §5 Etapa 5, parte 2): (a) editor → modal Gatilhos (modelos, validação ao vivo, salvar,
// JSON inválido bloqueia) → Testar com cenário (intro, objetivos, diálogo) → voltar ao editor com o cenário; (b) exportar o mapa
// com cenário e importá-lo em Campanha → Cenários personalizados → jogar sem marcar progresso; (c) multiplayer: o convidado vê
// "Cenário: …" no lobby, os dois recebem scenarioData e seguem sincronizados. Uso: node scripts/playtest-scenario.mjs [url] [relay]
// Exige `npm run preview` (porta 4173) e `npm run relay` (porta 8787) — ou os endereços passados como argumentos.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const relay = process.argv[3] ?? 'ws://localhost:8787';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const ok = (label, cond, extra = '') => console.log(`${label}: ${cond ? 'ok' : 'FALHOU'}${extra ? ' ' + extra : ''}`);
const mk = async (name) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} ${m.text()}`); });
  await page.goto(url, { waitUntil: 'networkidle' });
  return page;
};
const page = await mk('Editor');
await page.evaluate(() => { for (const k of ['aoe_maps_v1', 'aoe_map_cenario-teste', 'aoe_editor_autosave', 'aoe_save_v1', 'aoe_editor_test', 'aoe_campaign', 'aoe_setup']) localStorage.removeItem(k); });

// ---------------- (a) editor: mapa gerado 80×80, 2 inícios → Gatilhos ----------------
await page.click('#menu [data-tab="editor"]'); await page.waitForTimeout(200);
await page.fill('#ed-name', 'Cenario Teste'); await page.selectOption('#ed-size', 'small'); await page.selectOption('#ed-starts', '2'); await page.selectOption('#ed-base', 'gen'); await page.fill('#ed-seed', '5');
await page.click('#ed-create'); await page.waitForTimeout(1500);
ok('editor aberto (80×80, 2 inícios)', await page.evaluate(() => { const e = window.aoe.editor; return !!e && e.map.w === 80 && e.map.starts.length === 2; }));
await page.click('#ed-triggers'); await page.waitForTimeout(400);
const initial = await page.inputValue('#es-json');
ok('modal Gatilhos com modelo mínimo', await page.isVisible('#modal #es-json') && initial.includes('"aoe-scenario"') && initial.includes('"cenario-teste"') && (JSON.parse(initial).config.players.length === 2), `| ${initial.length} caracteres`);
ok('modelo mínimo válido', await page.$eval('#es-issues li', (li) => li.className) === 'ok' && !(await page.$eval('#es-save', (b) => b.disabled)));
await page.selectOption('#es-template', 'dialogue'); await page.click('#es-insert'); await page.waitForTimeout(100);
await page.selectOption('#es-template', 'count'); await page.click('#es-insert'); await page.waitForTimeout(400);
let parsed = JSON.parse(await page.inputValue('#es-json'));
ok('modelos inseridos (diálogo + objetivo de contagem)', parsed.triggers.length === 1 && parsed.triggers[0].then[0].do === 'say' && parsed.objectives.length === 1 && parsed.objectives[0].id === 'cidadaos' && JSON.stringify(parsed.victory).includes('"cidadaos"'), `| ${parsed.objectives.length} objetivo(s), ${parsed.triggers.length} gatilho(s)`);
ok('validação sem erros', (await page.textContent('#es-issues'))?.includes('válido') && !(await page.$eval('#es-save', (b) => b.disabled)), `| ${(await page.textContent('#es-issues'))?.trim()}`);
await page.click('#es-save'); await page.waitForTimeout(200);
ok('Salvar → meta.scenario', await page.evaluate(() => { const s = window.aoe.editor.meta.scenario; return !!s && s.objectives.length === 1 && s.triggers.length === 1 && window.aoe.editor.dirty; }) && !(await page.isVisible('#modal-back')));
ok('marca 📜 na barra', (await page.textContent('#ed-name'))?.includes('📜'));
// JSON inválido (vírgula a menos) e id de unidade inexistente → erros com path, Salvar desabilitado
await page.click('#ed-triggers'); await page.waitForTimeout(300);
const good = await page.inputValue('#es-json');
const setJson = async (text) => { await page.fill('#es-json', text); await page.waitForTimeout(450); return { issues: await page.$$eval('#es-issues li', (l) => l.map((x) => x.textContent)), disabled: await page.$eval('#es-save', (b) => b.disabled), bad: await page.$eval('#es-json', (e) => e.classList.contains('bad')) }; };
const r1 = await setJson(good.replace('"version": 1,', '"version": 1'));
ok('JSON com vírgula a menos → erro e Salvar desabilitado', r1.disabled && r1.bad && r1.issues.some((x) => x.includes('JSON inválido')), `| ${r1.issues[1]?.slice(0, 80)}`);
const r2 = await setJson(good.replace('"type": "villager"', '"type": "dragao"'));
ok('id de unidade inexistente → erro com path', r2.disabled && r2.issues.some((x) => x.includes('objectives[0].done') && x.includes('dragao')), `| ${r2.issues[1]?.slice(0, 100)}`);
const r3 = await setJson(good);
ok('JSON corrigido volta a validar', !r3.disabled && !r3.bad);
await page.click('#modal #m-cancel'); await page.waitForTimeout(100);
// Testar com o cenário
await page.click('#ed-test'); await page.waitForTimeout(300);
ok('modal Testar com "Testar com o cenário"', await page.isVisible('#modal #et-scenario') && await page.isChecked('#et-scenario'));
page.on('dialog', (d) => d.accept());
await page.click('#et-go'); await page.waitForTimeout(1500);
const introTitle = (await page.textContent('#modal h2')) ?? '';
ok('intro do cenário (modal com título)', await page.isVisible('#modal #m-go') && introTitle.includes('Cenario Teste') && (await page.textContent('#modal'))?.includes('Treine 10 Cidadãos'), `| "${introTitle.trim()}"`);
const paused = await page.evaluate(() => window.aoe.session.paused);
await page.click('#m-go');
const waitTick = async (p, n) => { const t0 = Date.now(); while (Date.now() - t0 < 30000 && (await p.evaluate(() => window.aoe.session?.state.tick ?? 0)) < n) await p.waitForTimeout(500); };
await waitTick(page, 48);   // gatilho do diálogo aos 2 s de jogo (40 ticks); a renderização por software pode ser lenta
const test = await page.evaluate(() => { const s = window.aoe.session; const c = s.state.config; return { paused: s.paused, tick: s.state.tick, scenarioData: !!c.scenarioData, id: s.state.scenario?.id, players: c.players.length, humans: c.players.filter((p) => !p.isAI).length, local: s.local, objectives: document.querySelector('#objectives')?.textContent ?? '', objVisible: !document.querySelector('#objectives')?.classList.contains('hidden'), dialogue: document.querySelector('#dialogue')?.textContent ?? '', dlgVisible: !document.querySelector('#dialogue')?.classList.contains('hidden'), messages: document.querySelector('#messages')?.textContent ?? '', test: !document.querySelector('#test-badge')?.classList.contains('hidden') }; });
ok('partida de teste com scenarioData (jogadores do cenário)', paused && !test.paused && test.tick > 0 && test.scenarioData && test.id === 'cenario-teste' && test.players === 2 && test.humans === 1 && test.local === 0 && test.test, JSON.stringify({ tick: test.tick, players: test.players, id: test.id }));
ok('#objectives lista o objetivo', test.objVisible && test.objectives.includes('Cenario Teste') && test.objectives.includes('Treine 10 Cidadãos'));
ok('diálogo do gatilho em #dialogue', test.dlgVisible && test.dialogue.includes('Oráculo de Delfos') && test.dialogue.includes('os deuses observam'), `| "${test.dialogue.slice(0, 60)}"`);
// fim do cenário em teste: vitória forçada → modal sem marcar progresso (id não oficial) e botão "Voltar ao editor"
await page.evaluate(() => { const s = window.aoe.session; s.state.scenario.outcome = 'victory'; s.state.gameOver = true; s.state.winner = 0; });
await page.waitForTimeout(400);
ok('fim do cenário em teste: modal sem progresso da campanha', await page.isVisible('#modal #m-quit') && (await page.textContent('#modal h2'))?.includes('Cenario Teste') && await page.evaluate(() => localStorage.getItem('aoe_campaign') === null) && (await page.textContent('#modal #m-quit'))?.includes('editor') && !(await page.$('#modal #m-next')));
await page.click('#modal #m-quit'); await page.waitForTimeout(600);
ok('de volta ao editor com meta.scenario', await page.evaluate(() => window.aoe.session?.ui.mode === 'editor' && !!window.aoe.editor.meta.scenario && window.aoe.editor.meta.scenario.triggers.length === 1) && await page.isVisible('#editor'));

// ---------------- (b) exportar o mapa com cenário e importar na aba Campanha ----------------
const file = await page.evaluate(() => window.aoe.editor.toFile());
ok('toFile() contém scenario', !!file.scenario && file.scenario.id === 'cenario-teste' && file.starts.length === 2);
await page.click('#ed-exit'); await page.waitForTimeout(500);
ok('menu principal (rascunho descartado da biblioteca)', await page.isVisible('#menu') && await page.evaluate(() => !(JSON.parse(localStorage.getItem('aoe_maps_v1') ?? '[]')).some((e) => e.id === 'cenario-teste')));
await page.click('#menu [data-tab="campaign"]'); await page.waitForTimeout(200);
ok('seção Cenários personalizados vazia', await page.isVisible('#m-scenarios') && await page.isVisible('#m-scn-import') && (await page.textContent('#m-scenarios'))?.includes('Nenhum'));
const reserved = await page.evaluate((f) => { try { window.aoe.menu.importScenarioMap(JSON.stringify({ ...f, scenario: { ...f.scenario, id: 'm2_cerco' } })); return 'aceito'; } catch (e) { return e.message; } }, file);
ok('cenário com id reservado é recusado na importação', reserved.includes('reservado'), `| ${reserved.split('\n')[1] ?? reserved}`);
const imported = await page.evaluate((f) => window.aoe.menu.importScenarioMap(JSON.stringify(f)), file);
await page.waitForTimeout(200);
ok('importar → cartão em Cenários personalizados', imported === 'cenario-teste' && await page.isVisible('#m-scenarios [data-scn="cenario-teste"]') && (await page.textContent('#m-scenarios [data-scn="cenario-teste"]'))?.includes('Cenario Teste'));
await page.click('#m-scenarios [data-scn="cenario-teste"] [data-act="play"]'); await page.waitForTimeout(1200);
ok('jogar → intro', await page.isVisible('#modal #m-go') && (await page.textContent('#modal h2'))?.includes('Cenario Teste'));
await page.click('#m-go'); await page.waitForTimeout(2500);
const play = await page.evaluate(() => { const s = window.aoe.session; const c = s.state.config; return { scenarioData: !!c.scenarioData, map: c.map?.id, hash: c.mapHash, tick: s.state.tick, campaign: localStorage.getItem('aoe_campaign') }; });
ok('session.state.config.scenarioData existe (mapa inline com hash)', play.scenarioData && play.map === 'cenario-teste' && typeof play.hash === 'number' && play.tick > 0, JSON.stringify(play));
await page.evaluate(() => { const s = window.aoe.session; s.state.scenario.outcome = 'victory'; s.state.gameOver = true; s.state.winner = 0; });
await page.waitForTimeout(400);
ok('vitória do cenário personalizado não muda aoe_campaign', await page.isVisible('#modal #m-quit') && await page.evaluate(() => localStorage.getItem('aoe_campaign') === null) && !(await page.$('#modal #m-next')));
await page.click('#modal #m-quit'); await page.waitForTimeout(400);

// ---------------- (c) multiplayer: anfitrião com o mapa+cenário como mapa fixo ----------------
const room = 'CEN' + Math.floor(Math.random() * 1000);
const join = async (p, name) => {
  await p.click('#menu [data-tab="multiplayer"]'); await p.waitForTimeout(200);
  await p.fill('#mp-url', relay); await p.fill('#mp-room', room); await p.fill('#mp-name', name);
  await p.click('#mp-join'); await p.waitForTimeout(800);
};
const host = page;
await join(host, 'Anfitrião');
const guest = await mk('Convidado'); await join(guest, 'Convidado'); await host.waitForTimeout(600);
await host.evaluate((d) => window.aoe.menu.setFixedMap(d), file); await guest.waitForTimeout(700);
const seen = await guest.textContent('#mp-scenario').catch(() => null);
ok('convidado vê "Cenário: …" no lobby', !!seen && seen.includes('Cenário') && seen.includes('Cenario Teste'), `| ${seen?.trim().split('\n')[0]}`);
ok('anfitrião vê o resumo do mapa e o cenário', (await host.textContent('#mp-fixed'))?.includes('80×80') && (await host.textContent('#mp-scenario'))?.includes('Cenario Teste'));
await host.evaluate(() => document.querySelector('#mp-start').click()); await host.waitForTimeout(3500);   // clique pelo DOM: o lobby redesenha a cada ping
const info = (p) => p.evaluate(() => { const s = window.aoe.session; const c = s?.state.config; return s ? { tick: s.state.tick, local: s.local, scenarioData: !!c.scenarioData, id: s.state.scenario?.id, players: c.players.map((x) => `${x.name}:${x.isAI ? 'ia' : 'h'}`), map: c.map?.id, hash: c.mapHash, objectives: !document.querySelector('#objectives')?.classList.contains('hidden') } : null; });
const a0 = await info(host), b0 = await info(guest);
console.log('anfitrião:', JSON.stringify(a0)); console.log('convidado:', JSON.stringify(b0));
ok('os dois têm scenarioData (humanos nas vagas do cenário)', a0?.scenarioData && b0?.scenarioData && a0.id === 'cenario-teste' && b0.id === 'cenario-teste' && a0.players.length === 2 && a0.players.every((x) => x.endsWith(':h')) && JSON.stringify(a0.players) === JSON.stringify(b0.players) && a0.hash === b0.hash && a0.objectives && b0.objectives);
const order = (p, dx) => p.evaluate((dx) => { const s = window.aoe.session; const ids = [...s.state.units.values()].filter((u) => u.owner === s.local && u.type === 'villager').map((u) => u.id); const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center'); if (tc) s.issue({ type: 'move', player: s.local, ids, x: tc.x + dx, y: tc.y + 6 }); }, dx);
await order(host, -6); await order(guest, 6);
// páginas em segundo plano rodam a ~1 quadro/s no Chromium headless (≈2 ticks/s em lockstep): espera o gatilho do diálogo (2 s de jogo = 40 ticks)
const t0 = Date.now(); while (Date.now() - t0 < 60000 && (await host.evaluate(() => window.aoe.session?.state.tick ?? 0)) < 48) await host.waitForTimeout(1000);
const snap = (p) => p.evaluate(() => { const s = window.aoe.session; let h = 2166136261 >>> 0; const mix = (v) => { h ^= (v | 0) >>> 0; h = Math.imul(h, 16777619) >>> 0; }; mix(s.state.tick); for (const u of s.state.units.values()) { mix(u.id); mix(Math.floor(u.x * 64)); mix(Math.floor(u.y * 64)); mix(Math.floor(u.hp)); } for (const pl of s.state.players) mix(Math.floor(pl.resources.food)); mix(s.state.scenario.fired.length); return { tick: s.state.tick, hash: h >>> 0, desynced: s.scheduler.desynced, fired: s.state.scenario.fired.join(',') }; });
await host.evaluate(() => { window.aoe.session.paused = true; }); await guest.evaluate(() => { window.aoe.session.paused = true; }); await host.waitForTimeout(300);
let a = await snap(host), b = await snap(guest);
if (a.tick !== b.tick) { const behind = a.tick < b.tick ? host : guest; const target = Math.max(a.tick, b.tick); await behind.evaluate((t) => { const s = window.aoe.session; let g = 0; while (s.state.tick < t && g++ < 400) { if (!s.scheduler.step(s.state)) break; } }, target); a = await snap(host); b = await snap(guest); }
console.log('anfitrião:', JSON.stringify(a)); console.log('convidado:', JSON.stringify(b));
ok('mesmo hash após alguns segundos (gatilho do diálogo disparou nos dois)', a.tick === b.tick && a.hash === b.hash && !a.desynced && !b.desynced && a.fired.includes('dialogo') && a.fired === b.fired);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
