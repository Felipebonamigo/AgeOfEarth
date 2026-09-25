// Áudio sintetizado (docs/DESIGN.md, "Áudio"): tema do menu, ambiente por bioma, sons de trabalho, dois exércitos em
// combate (golpes, arcos, mortes, camada de batalha e música em 'battle' e de volta), raio de Zeus, edifício concluído,
// volumes das opções mudando os ganhos ao vivo (e persistidos), mudo, limite de vozes, custo de CPU e errors: none.
// Cada receita também é renderizada offline (OfflineAudioContext) para conferir que nenhuma sai muda, com NaN ou estourando.
// Uso: node scripts/playtest-audio.mjs [url]   (exige `npm run preview`; o áudio roda com --autoplay-policy)
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { try { const k = 'aoe_settings_v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), edgeScroll: false })); } catch { /* ignore */ } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.mouse.move(640, 400);
const stats = () => page.evaluate(() => window.aoe.audio.stats());
const fails = [];
const check = (label, ok, extra = '') => { console.log(`${ok ? 'ok ' : 'FALHOU'} ${label}${extra ? ' — ' + extra : ''}`); if (!ok) fails.push(label); };
const waitFor = async (fn, ms, step = 250) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await page.waitForTimeout(step); } return false; };

// ---- receitas offline: nível e sanidade ----
const offline = await page.evaluate(async () => { const a = window.aoe.audio; const out = []; for (const n of a.recipes()) out.push(await a.renderOffline(n, 7)); return out; });
const bad = offline.filter((r) => !r || !(r.peak > 0.02) || !(r.peak < 1.2) || !Number.isFinite(r.rms));
check(`${offline.length} receitas renderizadas offline (pico entre 0,02 e 1,2, sem NaN)`, offline.length >= 40 && bad.length === 0, bad.map((r) => r?.name).join(','));

// ---- menu: o primeiro gesto libera o áudio; tema do menu e ambiente ----
await page.keyboard.press('Shift');
const menuOk = await waitFor(() => { const s = window.aoe.audio.stats(); return s.state === 'running' && s.music.theme === 'menu' && s.music.notes > 0; }, 8000);
let s = await stats();
check('menu: contexto rodando, tema do menu tocando', menuOk, `estado=${s.state} tema=${s.music.theme} notas=${s.music.notes}`);
check('menu: ambiente (vento e água costeira)', s.ambience.wind > 0 && s.ambience.water > 0, JSON.stringify(s.ambience));

// ---- partida ----
await page.fill('#m-seed', '7'); await page.click('#m-start'); await page.waitForTimeout(1500);
const tc = await page.evaluate(() => { const ss = window.aoe.session; const b = [...ss.state.buildings.values()].find((x) => x.owner === ss.local && x.type === 'town_center'); return { x: b.x, y: b.y }; });
await waitFor(() => window.aoe.audio.stats().music.theme === 'game', 6000);
s = await stats();
check('partida: tema do jogo em paz', s.music.theme === 'game' && s.music.intensity === 'peace', `${s.music.theme}/${s.music.intensity}`);
check('partida: ambiente por bioma ativo', s.ambience.wind > 0, JSON.stringify(s.ambience));

// ---- trabalho + edifício concluído: cidadãos constroem uma casa ao lado do CC (velocidade 3×) ----
const placed = await page.evaluate(([x, y]) => {
  const ss = window.aoe.session; const st = ss.state;
  const vil = [...st.units.values()].filter((u) => u.owner === ss.local && u.type === 'villager').map((u) => u.id);
  const before = st.buildings.size;
  for (const [dx, dy] of [[4, 0], [-6, 0], [0, 4], [0, -6], [4, 4], [-6, -6], [5, -6], [-6, 5]]) {
    ss.issue({ type: 'build', player: ss.local, ids: vil, building: 'house', tx: Math.floor(x + dx), ty: Math.floor(y + dy) });
    ss.scheduler.step(st);
    if (st.buildings.size > before) return true;
  }
  return false;
}, [tc.x, tc.y]);
await page.evaluate(([x, y]) => { window.aoe.renderer.cam.zoom = 1.3; window.aoe.renderer.cam.centerOn(x, y); window.aoe.session.speed = 3; }, [tc.x, tc.y]);
const built = placed && await waitFor(() => window.aoe.session.state.events.some((e) => e.type === 'built' && e.player === window.aoe.session.local), 40000, 500);
if (!built) await page.evaluate(() => { const ss = window.aoe.session; const b = [...ss.state.buildings.values()].find((x) => x.owner === ss.local); ss.state.events.push({ tick: ss.state.tick, type: 'built', player: ss.local, x: b.x, y: b.y, text: 'teste' }); });
await page.waitForTimeout(800);
s = await stats();
check(`edifício concluído: sino (${built ? 'obra real' : 'evento forçado'})`, (s.created.built ?? 0) > 0, `built=${s.created.built ?? 0} martelos=${s.created.work ?? 0}`);
// depois da obra, os cidadãos vão cortar a árvore mais próxima do CC: machado no centro da tela
const tree = await page.evaluate(([x, y]) => {
  const ss = window.aoe.session; const st = ss.state; let best = null, bd = 1e9;
  for (const n of st.map.nodes.values()) if (n.type === 'tree') { const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; best = n; } }
  const vil = [...st.units.values()].filter((u) => u.owner === ss.local && u.type === 'villager').map((u) => u.id);
  if (best) { ss.issue({ type: 'gather', player: ss.local, ids: vil, targetId: best.id }); window.aoe.renderer.cam.centerOn(best.x, best.y); }
  return best ? { x: best.x, y: best.y } : null;
}, [tc.x, tc.y]);
const worked = await waitFor(() => (window.aoe.audio.stats().created.work ?? 0) >= 2, 20000, 400);
s = await stats();
check('trabalho: martelos na obra e machado na árvore (unidades paradas perto do centro)', worked, `work=${s.created.work ?? 0} árvore=${tree ? 'sim' : 'não'}`);
await page.evaluate(() => { window.aoe.session.speed = 1; });

// ---- batalha: dois exércitos frente a frente, visíveis e no centro da tela ----
await page.evaluate(() => { window.aoe.audio.holdScale = 0.25; });
const mid = await page.evaluate(([tx, ty]) => {
  const ss = window.aoe.session; const st = ss.state; const sp = window.aoe.debugSpawn; const enemy = (ss.local + 1) % st.players.length;
  const mine = ['hoplite', 'hoplite', 'hoplite', 'hoplite', 'toxotes', 'toxotes', 'toxotes', 'hetairoi', 'hetairoi', 'hoplite', 'hoplite', 'hoplite'];
  const theirs = ['hoplite', 'hoplite', 'hoplite', 'hoplite', 'toxotes', 'toxotes', 'toxotes', 'hippeus', 'hippeus', 'hoplite', 'hoplite', 'hoplite'];
  const cx = tx, cy = ty + 9;
  const ids = [];
  mine.forEach((t, i) => { const u = sp(ss.local, t, cx - 2 - Math.floor(i / 4), cy - 2 + (i % 4)); if (u) ids.push(u.id); });
  theirs.forEach((t, i) => { const u = sp(enemy, t, cx + 2 + Math.floor(i / 4), cy - 2 + (i % 4)); if (u) ids.push(u.id); });
  ss.issue({ type: 'attackMove', player: ss.local, ids: ids.filter((id) => st.units.get(id)?.owner === ss.local), x: cx + 4, y: cy });
  window.aoe.renderer.cam.centerOn(cx, cy);
  return { x: cx, y: cy, n: ids.length };
}, [tc.x, tc.y]);
const c0 = (await stats()).created;
const battle = await waitFor(() => { const a = window.aoe.audio.stats(); return a.music.intensity === 'battle' && a.director.intensity === 'battle'; }, 20000, 300);
await page.waitForTimeout(2500);
s = await stats();
const d = (k) => (s.created[k] ?? 0) - (c0[k] ?? 0);
check(`batalha (${mid.n} unidades): música em 'battle'`, battle, `diretor=${s.director.intensity} música=${s.music.intensity} placar=${s.director.score}`);
check('batalha: golpes, arcos e flechas criados', d('melee') > 0 && d('bow') > 0 && d('arrow') > 0, `melee=${d('melee')} bow=${d('bow')} arrow=${d('arrow')} death=${d('death')}`);
check('batalha: camada de batalha (clamor + choques esparsos)', (s.created.battleBed ?? 0) > 0 && d('battle') > 0, `bed=${s.created.battleBed ?? 0} choques=${d('battle')}`);
check(`limite global de vozes respeitado (pico ${s.peak} ≤ 24)`, s.peak <= 24, `descartadas=${s.dropped} roubadas=${s.stolen}`);
const fxCount = await page.evaluate(() => window.aoe.session.state.effects.length);
console.log(`   vozes criadas por categoria: ${JSON.stringify(s.created)} | efeitos vivos no estado: ${fxCount}`);
console.log(`   sons pedidos pelos efeitos (antes da agregação): ${JSON.stringify(s.director.cues)}`);

// ---- raio de Zeus no centro da tela ----
const pw0 = s.created.power ?? 0;
await page.evaluate(([x, y]) => { window.aoe.session.state.effects.push({ type: 'bolt', x, y, ttl: 24, total: 24 }); }, [mid.x, mid.y]);
await page.waitForTimeout(600);
s = await stats();
check('raio de Zeus: estalo + trovão', (s.created.power ?? 0) > pw0, `power=${s.created.power ?? 0}`);

// ---- fim da batalha: câmera longe → a música sai de 'battle' ----
await page.evaluate(() => { const c = window.aoe.renderer.cam; c.x = 0; c.y = 0; c.clamp(); });
await page.evaluate(() => { const ss = window.aoe.session; for (const u of ss.state.units.values()) if (u.type !== 'villager' && u.type !== 'kataskopos') { u.hp = 0; u.dead = true; } });
const calm = await waitFor(() => window.aoe.audio.stats().music.intensity !== 'battle', 15000, 300);
s = await stats();
check('música volta de "battle" com calma', calm, `música=${s.music.intensity} placar=${s.director.score}`);
console.log(`   CPU do áudio (JS por quadro, últimos 300 quadros): mediana ${s.cpuP50} ms · p95 ${s.cpuP95} ms · média móvel ${s.cpuMs} ms · pior ${s.cpuMax} ms (inclui criar os buffers em cache) · buffers: ${s.buffers} · notas de música: ${s.music.notes}`);
check('custo de CPU do áudio: mediana abaixo de 1 ms/quadro', s.cpuP50 < 1, `${s.cpuP50} ms`);

// ---- opções: volumes ao vivo, persistência e mudo ----
await page.click('#top-menu'); await page.waitForTimeout(300);
const setRange = (id, v) => page.evaluate(([id, v]) => { const el = document.querySelector(`#modal ${id}`); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
await setRange('#o-vol', 0.8); await setRange('#o-sfx', 0.4); await setRange('#o-music', 0.2); await setRange('#o-amb', 0);
await page.waitForTimeout(400);
s = await stats();
const near = (a, b) => Math.abs(a - b) < 0.02;
check('volumes das opções mudam os ganhos (geral/efeitos/interface/música/ambiente)', near(s.gains.master, 0.8) && near(s.gains.sfx, 0.4) && near(s.gains.ui, 0.4) && near(s.gains.music, 0.2) && near(s.gains.ambience, 0), JSON.stringify(s.gains));
// ganhos reais dos nós (o Chrome só avalia a automação de barramentos com som passando: mestre, música e ambiente estão ativos)
check('ganhos reais dos nós acompanham (mestre/música/ambiente)', near(s.live.master, 0.8) && near(s.live.music, 0.2) && near(s.live.ambience, 0), JSON.stringify(s.live));
await page.check('#modal #o-mute'); await page.waitForTimeout(400);
const muted = (await stats()).gains.master;
await page.uncheck('#modal #o-mute'); await page.waitForTimeout(400);
const unmuted = (await stats()).gains.master;
check('mudo zera o mestre e volta', near(muted, 0) && near(unmuted, 0.8), `mudo=${muted} depois=${unmuted}`);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('aoe_settings_v1') ?? '{}'));
check('volumes persistidos nas configurações', near(saved.volume, 0.8) && near(saved.sfxVolume, 0.4) && near(saved.musicVolume, 0.2) && near(saved.ambienceVolume, 0) && saved.muted === false, JSON.stringify({ volume: saved.volume, sfx: saved.sfxVolume, music: saved.musicVolume, amb: saved.ambienceVolume, muted: saved.muted }));
await page.keyboard.press('Escape'); await page.waitForTimeout(200);

// ---- vitória: cadência final ----
await page.evaluate(() => window.aoe.audio.play('victory')); await page.waitForTimeout(300);
s = await stats();
check('cadência de vitória', (s.created.victory ?? 0) > 0);

console.log('errors:', errors.length ? errors.join(' | ') : 'none');
console.log(fails.length ? `FALHAS: ${fails.join('; ')}` : 'todas as verificações passaram');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
