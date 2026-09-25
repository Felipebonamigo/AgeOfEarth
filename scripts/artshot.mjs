// Capturas de referência do visual (docs/ART.md §3.11): partida com semente fixa (42, mapa médio, 1 IA) em três zooms
// centrados no Centro Cívico do jogador, o editor com um mapa gerado (semente 7), a "cidade" após 10 min simulados e
// uma "batalha" (40 unidades de dois donos frente a frente); a cidade é a da IA, com o mapa revelado (só no renderizador). A simulação avança por scheduler.step (determinística) e fica
// pausada nas capturas; o HUD (DOM) fica oculto para que só o renderizador entre na comparação (--hud para mantê-lo).
// Saída: docs/art/<prefixo>-{z035,z13,z22,editor,cidade,batalha}.png (ou docs/art/ref/<nome>.png com --ref).
// Uso: node scripts/artshot.mjs [url] [prefixo=atual] [--ref] [--hud] [--out pasta]
//      npm run art:shot -- http://localhost:4173/ etapa0-antes
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const pos = args.filter((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out');
const url = pos[0] ?? 'http://localhost:4173/';
const prefix = pos[1] ?? 'atual';
const outDir = flags.has('--out') ? args[args.indexOf('--out') + 1] : flags.has('--ref') ? 'docs/art/ref' : 'docs/art';
const keepHud = flags.has('--hud');
mkdirSync(outDir, { recursive: true });
const fileFor = (name) => join(outDir, flags.has('--ref') || flags.has('--out') ? `${name}.png` : `${prefix}-${name}.png`);

const SEED = 42, EDITOR_SEED = 7;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
// Sem rolagem na borda (o mouse do Playwright começa em (0,0) e arrastaria a câmera) e mouse no centro da tela
await page.addInitScript(() => { try { const k = 'aoe_settings_v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), edgeScroll: false })); } catch { /* ignore */ } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.mouse.move(720, 450);
// Configuração igual à do menu "Partida rápida" (1 IA normal, deus da IA pela semente), sem depender do DOM do menu
await page.evaluate((seed) => {
  const gods = ['zeus', 'poseidon', 'hades'];
  const players = [{ name: 'Jogador', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'Leônidas (IA)', god: gods[seed % gods.length], isAI: true, difficulty: 'normal', team: 1 }];
  window.aoe.startGame({ seed, mapSize: 'medium', players, revealMap: false, mode: 'conquest', mapType: 'continental' });
  window.aoe.session.paused = true;
}, SEED);
const setHud = (on) => page.evaluate((on) => { const h = document.getElementById('hud'); if (h) h.style.visibility = on ? '' : 'hidden'; }, on);
if (!keepHud) await setHud(false);
/** Avança `ticks` da simulação sem renderizar (20 ticks = 1 s de jogo), em fatias. */
const advance = async (ticks) => { for (let done = 0; done < ticks; done += 1200) await page.evaluate((n) => { const s = window.aoe.session; for (let i = 0; i < n; i++) s.scheduler.step(s.state); }, Math.min(1200, ticks - done)); };
const home = () => page.evaluate(() => { const s = window.aoe.session; const b = [...s.state.buildings.values()].find((x) => x.owner === s.local && x.type === 'town_center'); return { x: b.x, y: b.y }; });
const look = (x, y, zoom) => page.evaluate(([x, y, z]) => { const c = window.aoe.renderer.cam; c.zoom = z; c.centerOn(x, y); }, [x, y, zoom]);
const shot = async (name) => { await page.waitForTimeout(900); const f = fileFor(name); await page.screenshot({ path: f }); console.log('captura:', f); };

const tc = await home();
await advance(20 * 5);   // 5 s de jogo: cidadãos já saíram do CC
for (const [name, zoom] of [['z035', 0.35], ['z13', 1.3], ['z22', 2.2]]) { await look(tc.x, tc.y, zoom); await shot(name); }
// cidade: 10 min simulados; a cidade da IA (que constrói de verdade), com o mapa revelado só no renderizador
await advance(20 * 60 * 10);
const ai = await page.evaluate(() => { const s = window.aoe.session; const b = [...s.state.buildings.values()].find((x) => x.owner !== s.local && x.type === 'town_center'); window.aoe.renderer.revealAll = true; return { x: b.x, y: b.y, buildings: [...s.state.buildings.values()].filter((x) => x.owner === b.owner).length }; });
console.log('cidade da IA:', JSON.stringify(ai));
await look(ai.x, ai.y, 1.3); await shot('cidade');
await page.evaluate(() => { window.aoe.renderer.revealAll = false; });
// batalha: 20 unidades de cada lado, frente a frente, a 6 tiles do CC (sem simular: ficam paradas na posição)
const mid = await page.evaluate(([tx, ty]) => {
  const s = window.aoe.session; const st = s.state; const sp = window.aoe.debugSpawn; const enemy = (s.local + 1) % st.players.length;
  const mine = ['hoplite', 'hoplite', 'hoplite', 'hoplite', 'hoplite', 'toxotes', 'toxotes', 'toxotes', 'hetairoi', 'hetairoi', 'hoplite', 'hoplite', 'hoplite', 'hoplite', 'hoplite', 'toxotes', 'toxotes', 'toxotes', 'hetairoi', 'hetairoi'];
  const theirs = ['hoplite', 'hoplite', 'hoplite', 'hoplite', 'hoplite', 'toxotes', 'toxotes', 'toxotes', 'hippeus', 'hippeus', 'hoplite', 'hoplite', 'hoplite', 'hoplite', 'hoplite', 'toxotes', 'toxotes', 'toxotes', 'hippeus', 'hippeus'];
  const cx = tx, cy = ty + 8;
  mine.forEach((t, i) => sp(s.local, t, cx - 3 - Math.floor(i / 5), cy - 2 + (i % 5)));
  theirs.forEach((t, i) => sp(enemy, t, cx + 3 + Math.floor(i / 5), cy - 2 + (i % 5)));
  return { x: cx, y: cy, units: st.units.size };
}, [tc.x, tc.y]);
await look(mid.x, mid.y, 1.3); await shot('batalha');
// editor: novo mapa gerado (pequeno, 2 inícios, semente fixa), enquadrado pelo fitMap
await page.evaluate(() => { window.aoe.menu.show(); });
await page.click('#menu [data-tab="editor"]'); await page.waitForTimeout(200);
await page.fill('#ed-name', 'Referencia'); await page.selectOption('#ed-size', 'small'); await page.selectOption('#ed-starts', '2'); await page.selectOption('#ed-base', 'gen'); await page.fill('#ed-seed', String(EDITOR_SEED)); await page.selectOption('#ed-maptype', 'continental');
await page.click('#ed-create'); await page.waitForTimeout(800);
if (!keepHud) await setHud(false);
await page.evaluate(() => window.aoe.renderer.fitMap());
await shot('editor');
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
if (errors.length) process.exit(1);
