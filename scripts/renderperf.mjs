// Mede o custo do renderizador num cenário FIXO e reproduzível (docs/ART.md §6): mapa grande 144×144, semente 42,
// 3 IAs Muito difícil, 20 min simulados por scheduler.step (sem renderizar) e debugSpawn de hoplitas até ≥ 260 unidades.
// Lê os números de window.aoe.perf (src/render/perf.ts): fps, ms de renderer.render (média/p95/máx), draw calls por
// quadro, MB de texturas residentes, sprites e chunks — em 4 cenários (zoom 1, mapa inteiro, aglomerado, rolagem).
// Chromium headless com swiftshader (renderização por software): os ms e o fps são pessimistas e NÃO representam GPU;
// valem draw calls, MB e o custo de CPU, comparados antes/depois. Grava docs/perf/<data>.json e imprime uma tabela.
// Exige `npm run preview` (porta 4173) ou a URL passada.
// Uso: node scripts/renderperf.mjs [url] [minutosDeJogo=20] [--date AAAA-MM-DD] [--out docs/perf] [--units 260] [--label texto] [--baked on|off]
//      [--quality medium|low|high] [--measure 4000]  (preset medido, padrão médio; ms de medição por cenário)
//      [--reveal]  mapa revelado só no renderizador durante a medição: aos 20 min o jogador local (parado) já perdeu a
//                  cidade para as 3 IAs e, sem isto, os cenários "cidade" e "aglomerado" medem quase só terreno e nós
//      --baked off: mede com a arte assada desligada (visual procedural); padrão: a opção salva (ligada)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const url = pos[0] ?? 'http://localhost:4173/';
const warm = Number(pos[1] ?? 20);
const date = opt('--date', new Date().toISOString().slice(0, 10));
const outDir = opt('--out', 'docs/perf');
const minUnits = Number(opt('--units', 260));
const label = opt('--label', '');
const baked = opt('--baked', 'on') !== 'off';
const reveal = args.includes('--reveal');
const SEED = 42, MEASURE_MS = Number(opt('--measure', 4000));
const preset = opt('--quality', 'medium');
let commit = ''; try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* fora do git */ }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
// Sem rolagem na borda (o mouse do Playwright fica em (0,0)) e sem contador na tela (a medição é pela API)
await page.addInitScript(([bakedArt, quality]) => { try { const k = 'aoe_settings_v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), edgeScroll: false, showFps: false, quality, bakedArt })); } catch { /* ignore */ } }, [baked, preset]);
await page.goto(url, { waitUntil: 'networkidle' });
await page.mouse.move(800, 450);
// Partida fixa (mesma configuração do menu, sem depender do DOM): 3 IAs Muito difícil, deuses pela semente
await page.evaluate((seed) => {
  const gods = ['zeus', 'poseidon', 'hades'], names = ['Leônidas', 'Péricles', 'Agamenon', 'Odisseu', 'Temístocles', 'Alexandre'];
  const players = [{ name: 'Jogador', god: 'zeus', isAI: false, difficulty: 'brutal', team: 0 }];
  for (let i = 0; i < 3; i++) players.push({ name: `${names[(seed + i) % names.length]} (IA)`, god: gods[(seed + i * 7) % gods.length], isAI: true, difficulty: 'brutal', team: i + 1 });
  window.aoe.startGame({ seed, mapSize: 'large', players, revealMap: false, mode: 'conquest', mapType: 'continental' });
  window.aoe.session.paused = true;
}, SEED);
if (!(await page.evaluate(() => !!window.aoe.perf))) { console.error('window.aoe.perf ausente: a build não tem src/render/perf.ts'); process.exit(1); }
// avança a simulação diretamente (sem renderizar) até `warm` minutos de jogo, em fatias para não travar a página
for (let done = 0; done < warm * 60 * 20; done += 1200) await page.evaluate((n) => { const s = window.aoe.session; for (let i = 0; i < n; i++) s.scheduler.step(s.state); }, 1200);
// completa até `minUnits` unidades com hoplitas em volta dos Centros Cívicos de cada jogador (alternando donos)
const spawned = await page.evaluate((min) => {
  const s = window.aoe.session; const st = s.state; let n = 0;
  const tcs = [...st.buildings.values()].filter((b) => b.type === 'town_center');
  for (let i = 0; st.units.size < min && i < 2000; i++) { const tc = tcs[i % tcs.length]; if (!tc) break; const r = 4 + (i % 7), a = (i * 2.399) % 6.283; if (window.aoe.debugSpawn(tc.owner, 'hoplite', tc.x + Math.cos(a) * r, tc.y + Math.sin(a) * r)) n++; }
  return n;
}, minUnits);
// o preset automático mede o começo de cada partida mesmo com preset fixo e, sem GPU, rebaixa o 'medium' para 'low'
// (defeito de main.ts anotado à parte): reaplica o preset escolhido para medir de fato no preset médio
await page.evaluate((reveal) => { window.aoe.applyQuality?.(); if (reveal) window.aoe.renderer.revealAll = true; window.aoe.session.paused = false; window.aoe.session.speed = 1; }, reveal);
// arte assada: espera os atlas (carregados sem travar no início da partida) para medir o estado estável
await page.evaluate(() => window.aoe.renderer.art?.ready());
const info = await page.evaluate(() => { const s = window.aoe.session; return { seed: s.state.seed, tick: s.state.tick, minutes: Math.round(s.state.time / 60), units: s.state.units.size, buildings: s.state.buildings.size, map: `${s.state.map.w}×${s.state.map.h}`, quality: window.aoe.renderer.quality.preset, bakedArt: window.aoe.renderer.quality.bakedArt ?? null, art: window.aoe.renderer.art?.status() ?? null, resolution: window.aoe.renderer.app.renderer.resolution, viewport: `${window.innerWidth}×${window.innerHeight}` }; });
console.log('partida:', JSON.stringify(info), `(+${spawned} hoplitas)`);

const measure = async (name, title, setup) => {
  await page.evaluate(setup);
  await page.waitForTimeout(400);   // chunks do novo enquadramento fora da janela de medição
  await page.evaluate(() => window.aoe.perf.reset());
  await page.waitForTimeout(MEASURE_MS);
  const r = await page.evaluate(() => window.aoe.perf.snapshot());
  console.log(`${title.padEnd(32)} fps=${String(r.fps).padStart(5)}  render ${String(r.render.avg).padStart(5)} ms (p95 ${String(r.render.p95).padStart(5)}, máx ${String(r.render.max).padStart(5)})  draw calls=${String(r.drawCalls).padStart(3)} (máx ${r.drawCallsMax})  tex=${r.textureMB} MB (${r.textures})  sprites=${r.sprites}  chunks=${r.chunks}  quadros=${r.render.n}`);
  return { name, title, ...r };
};
const results = {};
results.zoom1 = await measure('zoom1', 'zoom 1 (cidade do jogador)', () => { const s = window.aoe.session; const r = window.aoe.renderer; r.cam.zoom = 1; const tcs = [...s.state.buildings.values()].filter((b) => b.type === 'town_center'); const tc = tcs.find((b) => b.owner === s.local) ?? (r.revealAll ? tcs[0] : undefined); if (tc) r.cam.centerOn(tc.x, tc.y); });
results.zoomOut = await measure('zoomOut', 'zoom mínimo (mapa inteiro)', () => { const r = window.aoe.renderer; if (r.fitMap) r.fitMap(); else r.cam.zoom = r.cam.minZoom; });
// maior aglomerado VISÍVEL: centro numa unidade do jogador local fora de edifícios (antes o maior aglomerado podia ser um
// exército da IA sob a névoa ou uma guarnição, e a cena medida ficava quase vazia)
results.battle = await measure('battle', 'zoom 1,5 (maior aglomerado)', () => { const s = window.aoe.session; const r = window.aoe.renderer; r.cam.zoom = 1.5; let best = null, bestN = -1; for (const u of s.state.units.values()) { if ((u.owner !== s.local && !r.revealAll) || u.inside !== -1) continue; let n = 0; for (const v of s.state.units.values()) if (v.inside === -1 && Math.abs(v.x - u.x) < 12 && Math.abs(v.y - u.y) < 8) n++; if (n > bestN) { bestN = n; best = u; } } if (best) r.cam.centerOn(best.x, best.y); });
results.scroll = await measure('scroll', 'rolagem contínua (chunks novos)', () => { const r = window.aoe.renderer; r.cam.zoom = 1; let t = 0; window.__scroll = setInterval(() => { t += 1; r.cam.centerOn(40 + (t * 3) % 100, 40 + (t * 2) % 100); }, 50); });
await page.evaluate(() => clearInterval(window.__scroll));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();

mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${date}${label ? '-' + label : ''}.json`);
writeFileSync(file, JSON.stringify({ date, commit, label, url, note: 'Chromium headless + swiftshader (software): ms/fps pessimistas, sem GPU; comparar antes/depois. Ver docs/ART.md §6.', scenario: { ...info, warmMinutes: warm, spawned, measureMs: MEASURE_MS, reveal }, results, errors }, null, 2) + '\n');
console.log('gravado em', file);
console.log('\n| Cenário | fps | render média (ms) | p95 | máx | draw calls | tex MB | sprites | chunks |\n|---|---|---|---|---|---|---|---|---|');
for (const r of Object.values(results)) console.log(`| ${r.title} | ${r.fps} | ${r.render.avg} | ${r.render.p95} | ${r.render.max} | ${r.drawCalls} | ${r.textureMB} | ${r.sprites} | ${r.chunks} |`);
if (errors.length) process.exit(1);
