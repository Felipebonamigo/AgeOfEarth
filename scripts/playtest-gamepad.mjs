// Controle (Steam Deck / Xbox, passo 6.5): injeta um gamepad falso (navigator.getGamepads devolve um objeto mutável
// controlado pelo teste), a 1280×800 com a interface em 130 %: navega o menu principal com o D-pad (abre os Créditos:
// começam no topo, não rolados até o Fechar) e inicia uma partida com A; move o cursor virtual com o analógico até um cidadão, seleciona com A, manda coletar com B, D-pad ◀ (ocioso),
// LT+A (painel de comandos), exército/atacar-mover, Start abre o menu e B fecha, analógico direito rola a câmera,
// vibração no alerta de ataque e o mouse retomando o controle. Captura em docs/art/controle-deck.png.
// Uso: node scripts/playtest-gamepad.mjs [url]   (exige `npm run build && npx vite preview`)
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => {
  // Controle falso no mapeamento "standard" (índices da Gamepad API) + escala 130 % (legibilidade no Deck)
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = { id: 'Steam Deck Controller (STANDARD GAMEPAD Vendor: 28de Product: 1205)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0,
    vibrationActuator: { type: 'dual-rumble', playEffect: () => { window.__rumbles = (window.__rumbles || 0) + 1; return Promise.resolve('complete'); } } };
  window.__pad = pad; window.__rumbles = 0;
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad.connected ? pad : null, null, null, null] });
  try { if (!localStorage.getItem('aoe_settings_v1')) localStorage.setItem('aoe_settings_v1', JSON.stringify({ uiScale: 1.3 })); } catch { /* ignore */ }
});
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.aoe?.pad, null, { timeout: 30000 });

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const ok = (label, cond, extra = '') => console.log(`${label}: ${cond ? 'ok' : 'FALHOU'}${extra ? ' | ' + extra : ''}`);
const frames = () => page.evaluate(() => window.aoe.pad.frames);
async function waitFrames(n = 2) { const f0 = await frames(); await page.waitForFunction((t) => window.aoe.pad.frames >= t, f0 + n, { timeout: 20000 }); }
async function setBtn(i, v) { await page.evaluate(([i, v]) => { const b = window.__pad.buttons[i]; b.pressed = v; b.value = v ? 1 : 0; }, [i, v]); }
// toque preciso: pressiona por exatamente 1 quadro do laço (sem depender da latência do Playwright) e espera 2 quadros
async function tap(i) {
  await page.evaluate(async (i) => {
    const wait = (n) => new Promise((res) => { const t = window.aoe.pad.frames + n; const chk = () => (window.aoe.pad.frames >= t ? res() : requestAnimationFrame(chk)); chk(); });
    const b = window.__pad.buttons[i]; b.pressed = true; b.value = 1; await wait(1); b.pressed = false; b.value = 0; await wait(2);
  }, i);
}
async function setAxes(a) { await page.evaluate((a) => { window.__pad.axes = a; }, a); }
const focused = () => page.evaluate(() => { const e = document.querySelector('.pad-focus'); if (!e) return null; const t = e.matches('button, select, input, .god, .mission') ? e : e.querySelector('button, select, input') ?? e; return t.id || t.dataset.tab || t.dataset.god || t.className || t.tagName; });

// ---------------- Menu principal ----------------
await page.fill('#m-seed', '7');
await page.evaluate(() => document.activeElement?.blur());
await tap(B.DOWN);
ok('controle ativo (cursor do sistema oculto)', await page.evaluate(() => document.documentElement.classList.contains('pad-active')));
ok('aviso de conexão', await page.evaluate(() => !document.getElementById('pad-banner').classList.contains('hidden') && document.getElementById('pad-banner').textContent.includes('Steam Deck')));
ok('foco visível no menu (anel dourado)', !!(await focused()), String(await focused()));
ok('dicas de botões no menu', await page.isVisible('#pad-nav-hints'));
await tap(B.RB);
ok('RB troca para a aba Campanha', (await page.evaluate(() => document.querySelector('#menu .tabs .btn.active')?.dataset.tab)) === 'campaign');
await tap(B.LB);
ok('LB volta à Partida rápida', (await page.evaluate(() => document.querySelector('#menu .tabs .btn.active')?.dataset.tab)) === 'skirmish');
// desce com o D-pad até o botão Jogar (sem tocar no mouse)
let path = [];
for (let i = 0; i < 40; i++) {
  const f = await focused(); path.push(f);
  if (f === 'm-start') break;
  await tap(B.DOWN);
  if ((await focused()) === f) await tap(B.LEFT);   // fundo da coluna: vai para a esquerda
}
ok('D-pad chega a Jogar', (await focused()) === 'm-start', `${path.length} passos`);
// Créditos pelo controle: o modal longo abre no topo (foco no título), não rolado até o Fechar do fim
async function walkTo(id, dir, alt) {
  for (let i = 0; i < 16 && (await focused()) !== id; i++) { const f = await focused(); await tap(dir); if ((await focused()) === f) await tap(alt); }
  return (await focused()) === id;
}
ok('D-pad chega a Créditos', await walkTo('m-credits', B.RIGHT, B.DOWN), String(await focused()));
await tap(B.A); await waitFrames(3);
const cred = await page.evaluate(() => {
  const m = document.getElementById('modal'); const team = m.querySelector('.credits-team'); const f = m.querySelector('.pad-focus');
  const r = team?.getBoundingClientRect(), mr = m.getBoundingClientRect();
  return { open: !document.getElementById('modal-back').classList.contains('hidden') && !!m.querySelector('#credits-licenses'), scrollTop: Math.round(m.scrollTop), of: m.scrollHeight - m.clientHeight, focus: f?.id || f?.tagName || null, teamVisible: !!r && r.top >= mr.top && r.bottom <= mr.bottom };
});
ok('Créditos pelo controle abrem no topo (foco no título, equipe à vista)', cred.open && cred.focus === 'H2' && cred.scrollTop <= 5 && cred.teamVisible && cred.of > 200, JSON.stringify(cred));
await tap(B.DOWN);
ok('D-pad desce do título para a lista', !['H2', null].includes(await page.evaluate(() => { const f = document.querySelector('#modal .pad-focus'); return f?.id || f?.tagName || null; })));
await tap(B.B);
ok('B fecha os Créditos', await page.evaluate(() => document.getElementById('modal-back').classList.contains('hidden')));
ok('D-pad volta a Jogar', await walkTo('m-start', B.LEFT, B.UP), String(await focused()));
await tap(B.A);
await page.waitForFunction(() => !!window.aoe.session, null, { timeout: 30000 });
await waitFrames(4);
ok('A inicia a partida', await page.evaluate(() => !!window.aoe.session && document.getElementById('menu').classList.contains('hidden')));

// ---------------- Partida: cursor virtual ----------------
const W = 1280, H = 800, SCALE = 1.3;
const safe = { x0: 30, x1: W - 30, y0: 60 * SCALE, y1: H - 204 * SCALE - 40 };
async function steerTo(getTarget, tol = 5) {
  for (let i = 0; i < 400; i++) {
    const st = await page.evaluate(getTarget);
    if (!st) return false;
    const dx = st.tx - st.cx, dy = st.ty - st.cy; const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= tol) { await setAxes([0, 0, 0, 0]); await waitFrames(3); return true; }
    const a = Math.max(0.3, Math.min(1, d / 140));
    await setAxes([(dx / d) * a, (dy / d) * a, 0, 0]);
    await waitFrames(1);
  }
  await setAxes([0, 0, 0, 0]);
  return false;
}
await setAxes([0.6, 0, 0, 0]); await waitFrames(3); await setAxes([0, 0, 0, 0]); await waitFrames(2);
ok('cursor virtual visível', await page.isVisible('#pad-cursor'));
ok('dicas de botões no HUD', await page.isVisible('#pad-hints'), (await page.textContent('#pad-hints'))?.slice(0, 80));
const vid = await page.evaluate((safe) => {
  const s = window.aoe.session; const cam = window.aoe.renderer.cam;
  const vs = [...s.state.units.values()].filter((u) => u.owner === s.local && u.type === 'villager').map((u) => ({ u, p: cam.worldToScreen(u.x, u.y) })).filter(({ p }) => p.x > safe.x0 && p.x < safe.x1 && p.y > safe.y0 && p.y < safe.y1);
  vs.sort((a, b) => Math.abs(a.p.x - 640) + Math.abs(a.p.y - 330) - (Math.abs(b.p.x - 640) + Math.abs(b.p.y - 330)));
  return vs[0]?.u.id ?? -1;
}, safe);
const reached = await steerTo(`(() => { const u = window.aoe.session.state.units.get(${vid}); if (!u) return null; const p = window.aoe.renderer.cam.worldToScreen(u.x, u.y); const c = window.aoe.pad.cursor; return { tx: p.x, ty: p.y, cx: c.x, cy: c.y }; })()`);
ok('analógico leva o cursor até um cidadão', reached, `id ${vid}`);
await tap(B.A);
const sel = await page.evaluate(() => [...window.aoe.session.selection]);
ok('A seleciona o cidadão', sel.includes(vid), `seleção ${JSON.stringify(sel)}`);
// recurso mais próximo na tela
const nid = await page.evaluate(([vid, safe]) => {
  const s = window.aoe.session; const cam = window.aoe.renderer.cam; const u = s.state.units.get(vid);
  let best = -1, bd = Infinity;
  for (const n of s.state.map.nodes.values()) {
    if (!['berry', 'tree', 'gold'].includes(n.type)) continue;
    const p = cam.worldToScreen(n.x + 0.5, n.y + 0.5);
    if (p.x < safe.x0 || p.x > safe.x1 || p.y < safe.y0 || p.y > safe.y1) continue;
    const d = (n.x - u.x) ** 2 + (n.y - u.y) ** 2; if (d < bd) { bd = d; best = n.id; }
  }
  return best;
}, [vid, safe]);
const onNode = await steerTo(`(() => { const n = window.aoe.session.state.map.nodes.get(${nid}); if (!n) return null; const p = window.aoe.renderer.cam.worldToScreen(n.x + 0.5, n.y + 0.5); const c = window.aoe.pad.cursor; return { tx: p.x, ty: p.y, cx: c.x, cy: c.y }; })()`, 6);
await tap(B.B);
await page.waitForTimeout(400); await waitFrames(3);
const gather = await page.evaluate(([vid, nid]) => { const u = window.aoe.session.state.units.get(vid); return { order: u.order?.type ?? null, state: u.state, node: u.nodeId, want: nid }; }, [vid, nid]);
ok('B dá a ordem contextual (coletar no recurso)', onNode && (gather.order === 'gather' || gather.node === nid || gather.state === 'gather' || gather.state === 'move'), JSON.stringify(gather));
// Y com o cidadão selecionado: para (fica ocioso); depois D-pad ◀ o encontra como ocioso
await tap(B.Y);
await page.waitForTimeout(300); await waitFrames(3);
await page.evaluate(() => window.aoe.session.select([]));
await tap(B.LEFT);
const idle = await page.evaluate(() => { const s = window.aoe.session; const ids = [...s.selection]; const u = ids.length === 1 ? s.state.units.get(ids[0]) : null; return { sel: ids, type: u?.type, state: u?.state, order: u?.order?.type ?? null }; });
// (parado com carga, o cidadão pode sair em seguida para entregar: vale ter sido o escolhido pelo ◀)
ok('Y para o cidadão e D-pad ◀ o seleciona como ocioso', idle.type === 'villager' && idle.sel.length === 1 && idle.sel[0] === vid && idle.order !== 'gather', JSON.stringify(idle));
// LT + A: primeiro botão do painel (cidadão: construção) → modo de colocação; B cancela
await setBtn(B.LT, true); await waitFrames(3);
const badges = await page.evaluate(() => [...document.querySelectorAll('#commands .cmd[data-pad]')].map((b) => b.dataset.pad).join(''));
ok('LT marca a página do painel com A/B/X/Y', badges === 'ABXY', badges);
await tap(B.A);
await setBtn(B.LT, false); await waitFrames(2);
const mode = await page.evaluate(() => window.aoe.session.ui.mode);
ok('LT + A aciona o botão do painel (colocação)', mode === 'place', mode);
await page.screenshot({ path: 'docs/art/controle-deck.png' });   // cursor, dicas "Construir/Cancelar" e o fantasma do edifício
await tap(B.B);
ok('B cancela o modo', (await page.evaluate(() => window.aoe.session.ui.mode)) === 'normal');
// Exército (D-pad ▶) e atacar-mover (X) no cursor
await page.evaluate(() => { const s = window.aoe.session; const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center'); for (let i = 0; i < 3; i++) window.aoe.debugSpawn(s.local, 'hoplite', tc.x + 3, tc.y + 3); });
await tap(B.RIGHT);
const army = await page.evaluate(() => { const s = window.aoe.session; return s.ownSelectedUnits().filter((u) => u.type === 'hoplite').length; });
ok('D-pad ▶ seleciona o exército', army === 3, `${army} hoplitas`);
// cursor bem longe do grupo (senão alguém chega ao ponto antes da verificação)
await page.evaluate(() => { const c = window.aoe.pad.cursor; c.x = 900; c.y = 280; });   // ▶ centrou a câmera no exército: ponto no mapa, fora dos painéis
await waitFrames(2);
await tap(B.X);
await page.waitForTimeout(300); await waitFrames(2);
const am = await page.evaluate(() => window.aoe.session.ownSelectedUnits().map((u) => u.order?.type ?? u.state));
ok('X dá atacar-mover no cursor', am.filter((x) => x === 'attackMove').length >= 2, JSON.stringify(am));
await tap(B.Y);
await page.waitForTimeout(300); await waitFrames(2);
ok('Y para as unidades', await page.evaluate(() => window.aoe.session.ownSelectedUnits().every((u) => !u.order || u.order.type !== 'attackMove')));
// Start abre o menu da partida (pausa); B fecha e despausa
await tap(B.START);
const menuOpen = await page.evaluate(() => ({ modal: !document.getElementById('modal-back').classList.contains('hidden'), paused: window.aoe.session.paused, cont: !!document.querySelector('#modal #m-continue') }));
ok('Start abre o menu da partida', menuOpen.modal && menuOpen.paused && menuOpen.cont);
ok('foco no menu da partida', await page.evaluate(() => !!document.querySelector('#modal .pad-focus')), String(await focused()));
ok('cursor virtual some com o modal', !(await page.isVisible('#pad-cursor')));
await tap(B.DOWN); await tap(B.DOWN);
ok('D-pad move o foco no modal', (await focused()) !== 'm-continue', String(await focused()));
await tap(B.B);
const closed = await page.evaluate(() => ({ modal: !document.getElementById('modal-back').classList.contains('hidden'), paused: window.aoe.session.paused }));
ok('B fecha o menu e a partida continua', !closed.modal && !closed.paused, JSON.stringify(closed));
// analógico direito rola a câmera
await page.evaluate(() => { const s = window.aoe.session; window.aoe.renderer.cam.centerOn(s.state.map.w / 2, s.state.map.h / 2); });   // longe das bordas (a câmera para no limite do mapa)
const cam0 = await page.evaluate(() => ({ x: window.aoe.renderer.cam.x, y: window.aoe.renderer.cam.y }));
await setAxes([0, 0, 1, 0]); await waitFrames(6); await setAxes([0, 0, 0, 1]); await waitFrames(6); await setAxes([0, 0, 0, 0]); await waitFrames(2);
const cam1 = await page.evaluate(() => ({ x: window.aoe.renderer.cam.x, y: window.aoe.renderer.cam.y }));
ok('analógico direito rola a câmera', cam1.x > cam0.x + 20 && cam1.y > cam0.y + 20, `${Math.round(cam0.x)},${Math.round(cam0.y)} → ${Math.round(cam1.x)},${Math.round(cam1.y)}`);
// Visão geral (segurar ⧉) e volta
const z0 = await page.evaluate(() => window.aoe.renderer.cam.zoom);
await setBtn(B.VIEW, true); await waitFrames(3);
const zOver = await page.evaluate(() => window.aoe.renderer.cam.zoom);
await setBtn(B.VIEW, false); await waitFrames(3);
const z1 = await page.evaluate(() => window.aoe.renderer.cam.zoom);
ok('⧉ segurado mostra o mapa inteiro e volta ao zoom', zOver < z0 && Math.abs(z1 - z0) < 1e-6, `${z0.toFixed(2)} → ${zOver.toFixed(2)} → ${z1.toFixed(2)}`);
// vibração no alerta de ataque
await page.evaluate(() => { const s = window.aoe.session; s.state.events.push({ type: 'underAttack', player: s.local, tick: s.state.tick, x: 10, y: 10, text: 'Teste: ataque!' }); });
await page.waitForTimeout(300); await waitFrames(3);
ok('vibra ao sofrer ataque', (await page.evaluate(() => window.__rumbles)) >= 1, `${await page.evaluate(() => window.__rumbles)} vibração(ões)`);
// legibilidade 1280×800 a 130 %: barra superior e painel inferior cabem na tela
const fit = await page.evaluate(() => {
  const top = document.getElementById('top'); const kids = [...top.children].filter((e) => e.getClientRects().length);
  const right = Math.max(...kids.map((e) => e.getBoundingClientRect().right));
  const tr = top.getBoundingClientRect();
  // nada da barra superior quebra linha nem sai dela (texto da idade, botões de velocidade, menu)
  const spill = [...top.querySelectorAll('*')].filter((e) => e.getClientRects().length && (e.getBoundingClientRect().bottom > tr.bottom + 1 || e.getBoundingClientRect().top < tr.top - 1)).map((e) => e.id || e.className || e.tagName);
  const cmds = document.getElementById('commands');
  return { right: Math.round(right), w: window.innerWidth, spill: spill.slice(0, 4), topOverflow: top.scrollWidth > top.clientWidth + 1, cmdOverflow: cmds.scrollHeight > cmds.clientHeight + 1, zoom: document.getElementById('hud').style.zoom, narrow: document.getElementById('hud').classList.contains('narrow') };
});
ok('HUD cabe em 1280×800 a 130 %', fit.zoom === '1.3' && fit.right <= fit.w && !fit.topOverflow && fit.spill.length === 0 && !fit.cmdOverflow, JSON.stringify(fit));
// mouse retoma o controle
await page.mouse.move(600, 400); await page.mouse.move(640, 430, { steps: 4 }); await waitFrames(2);
const mouseBack = await page.evaluate(() => ({ active: document.documentElement.classList.contains('pad-active'), cursor: !document.getElementById('pad-cursor').classList.contains('hidden'), hints: !document.getElementById('pad-hints').classList.contains('hidden') }));
ok('mexer o mouse devolve o controle a ele', !mouseBack.active && !mouseBack.cursor && !mouseBack.hints, JSON.stringify(mouseBack));
await tap(B.A);
ok('usar o controle de novo o reativa', await page.evaluate(() => document.documentElement.classList.contains('pad-active')));
// desconexão
await page.evaluate(() => { window.__pad.connected = false; }); await waitFrames(3);
ok('desconectar esconde o cursor e avisa', await page.evaluate(() => !document.documentElement.classList.contains('pad-active') && document.getElementById('messages').textContent.includes('desconectado')));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
