// Custo de CPU do renderizador sem o ruído da rasterização por software (complementa scripts/renderperf.mjs): mesmo
// cenário (mapa 144×144, semente 42, 3 IAs Muito difícil, 20 min simulados, 260+ unidades), mapa revelado só no
// renderizador, resolução de renderização 0,25 (a CPU faz o mesmo trabalho; o swiftshader quase não rasteriza) e laços
// síncronos de N quadros com a simulação avançando 1 tick a cada 3 quadros. Mede em ms/quadro:
//   render = renderer.render (nosso código: vistas, props, sobreposições, efeitos)
//   pixi   = app.renderer.render (Pixi: transformações, lotes, upload e comandos GL — sem esperar a GPU)
// em 4 vistas (zoom 1 numa cidade, mapa inteiro, zoom 1,5 no maior aglomerado, rolagem), alternando a arte assada
// (--modes, p = procedural, a = assada; a build base sem a opção ignora). Grava docs/perf/<data>-<rótulo>-cpu.json.
// Uso: node scripts/rendercpu.mjs [url] [--frames 150] [--modes papa] [--quality low] [--label texto] [--minutes 20]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const url = pos[0] ?? 'http://localhost:4173/';
const N = Number(opt('--frames', 150));
const modes = opt('--modes', 'papa').split('').map((c) => c === 'a');
const quality = opt('--quality', 'low');
const warm = Number(opt('--minutes', 20));
const label = opt('--label', 'cpu');
const date = new Date().toISOString().slice(0, 10);
let commit = ''; try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* fora do git */ }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.addInitScript((q) => { try { localStorage.setItem('aoe_settings_v1', JSON.stringify({ edgeScroll: false, quality: q, bakedArt: true })); } catch { /* ignore */ } }, quality);
await page.goto(url, { waitUntil: 'networkidle' });
await page.mouse.move(800, 450);
await page.evaluate(() => {
  const gods = ['zeus', 'poseidon', 'hades'];
  const players = [{ name: 'Jogador', god: 'zeus', isAI: false, difficulty: 'brutal', team: 0 }];
  for (let i = 0; i < 3; i++) players.push({ name: `IA ${i + 1}`, god: gods[(42 + i * 7) % 3], isAI: true, difficulty: 'brutal', team: i + 1 });
  window.aoe.startGame({ seed: 42, mapSize: 'large', players, revealMap: false, mode: 'conquest', mapType: 'continental' });
  window.aoe.session.paused = true;
});
for (let done = 0; done < warm * 60 * 20; done += 1200) await page.evaluate((n) => { const s = window.aoe.session; for (let i = 0; i < n; i++) s.scheduler.step(s.state); }, 1200);
const info = await page.evaluate((min) => {
  const s = window.aoe.session; const st = s.state;
  const tcs = [...st.buildings.values()].filter((b) => b.type === 'town_center');
  for (let i = 0; st.units.size < min && i < 2000; i++) { const tc = tcs[i % tcs.length]; if (!tc) break; const r = 4 + (i % 7), a = (i * 2.399) % 6.283; window.aoe.debugSpawn(tc.owner, 'hoplite', tc.x + Math.cos(a) * r, tc.y + Math.sin(a) * r); }
  window.aoe.renderer.revealAll = true;
  window.aoe.applyQuality();
  window.aoe.renderer.setRenderScale(0.25);
  return { units: st.units.size, buildings: st.buildings.size, localAlive: tcs.some((b) => b.owner === s.local) };
}, 260);
console.log('estado:', JSON.stringify(info));

const run = (view) => page.evaluate(([view, N]) => {
  const s = window.aoe.session, st = s.state, R = window.aoe.renderer, app = R.app;
  const tcs = [...st.buildings.values()].filter((b) => b.type === 'town_center');
  const tc = tcs.find((b) => b.owner === s.local) ?? tcs[0];
  if (view === 'zoom1') { R.cam.zoom = 1; R.cam.centerOn(tc.x, tc.y + 3); }
  else if (view === 'zoomOut') R.fitMap();
  else if (view === 'scroll') { R.cam.zoom = 1; R.cam.centerOn(40, 40); }
  else { R.cam.zoom = 1.5; let best = null, bn = -1; for (const u of st.units.values()) { if (u.inside !== -1) continue; let n = 0; for (const v of st.units.values()) if (v.inside === -1 && Math.abs(v.x - u.x) < 12 && Math.abs(v.y - u.y) < 8) n++; if (n > bn) { bn = n; best = u; } } R.cam.centerOn(best.x, best.y); }
  const ui = window.aoe.input.renderUI();
  const tR = [], tP = [];
  for (let i = 0; i < N + 20; i++) {
    if (i % 3 === 0) s.scheduler.step(st);
    if (view === 'scroll' && i % 3 === 0) { const t = i / 3; R.cam.centerOn(40 + (t * 3) % 100, 40 + (t * 2) % 100); }
    const a = performance.now(); R.render(st, (i % 3) / 3, ui, 1 / 60); const b = performance.now(); app.renderer.render({ container: app.stage }); const c = performance.now();
    if (i >= 20) { tR.push(b - a); tP.push(c - b); }
  }
  const stat = (v) => { const x = [...v].sort((p, q) => p - q); return { avg: +(x.reduce((p, q) => p + q, 0) / x.length).toFixed(3), med: +x[Math.floor(x.length / 2)].toFixed(3), p95: +x[Math.floor(x.length * 0.95)].toFixed(2) }; };
  let spr = 0; const walk = (o) => { if (!o.visible) return; if (o.texture) spr++; for (const ch of o.children ?? []) walk(ch); }; walk(R.world);
  return { render: stat(tR), pixi: stat(tP), sprites: spr };
}, [view, N]);

const results = [];
for (const baked of modes) {
  await page.evaluate((b) => { window.aoe.settings.bakedArt = b; window.aoe.applyQuality(); }, baked);
  await page.evaluate(() => window.aoe.renderer.art?.ready());
  await page.waitForTimeout(300);
  for (const v of ['zoom1', 'zoomOut', 'battle', 'scroll']) {
    const r = await run(v);
    results.push({ baked, view: v, ...r });
    console.log(`${baked ? 'assada    ' : 'procedural'} ${v.padEnd(8)} render ${r.render.avg} (med ${r.render.med}, p95 ${r.render.p95})  pixi ${r.pixi.avg} (med ${r.pixi.med}, p95 ${r.pixi.p95})  sprites ${r.sprites}`);
  }
}
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
mkdirSync('docs/perf', { recursive: true });
const file = join('docs/perf', `${date}-${label}-cpu.json`);
writeFileSync(file, JSON.stringify({ date, commit, label, url, quality, frames: N, note: 'CPU por quadro (ms) em laço síncrono, resolução 0,25 (sem rasterização relevante); render = renderer.render, pixi = app.renderer.render.', scenario: { ...info, warmMinutes: warm }, results, errors }, null, 2) + '\n');
console.log('gravado em', file);
if (errors.length) process.exit(1);
