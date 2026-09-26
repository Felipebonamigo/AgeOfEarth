// Captura do HUD de cenário (G4 + G8): m6 "A Estátua de Zeus" com a Estátua de pé e o 1º Colosso chegando — a barra da guarda
// (progress { var: estatua_s, max: { var: guarda }, format: time }) no painel de objetivos — e o 1º Colosso, com o nome
// próprio "Colosso de Poseidon" (spawn { name }), selecionado e sob o cursor (painel de seleção + tooltip).
// O estado é montado no Node com o motor de verdade, salvo (serialize) e carregado no jogo pelo menu (loadGame).
// Uso (com `npm run build` e `npx vite preview --port 4200`): npx tsx scripts/hudshot.ts http://localhost:4200/ docs/art/g4-g8-hud.png [pt|en]
import { chromium } from 'playwright';
import { createGame, tick } from '../src/core/sim/game';
import { serialize } from '../src/core/serialize';
import { TICK_RATE } from '../src/core/constants';
import { campaignMission, missionConfig } from '../src/core/scenario/campaign';
import { advanceBuild, placeNear, tagIds, townCenter } from '../src/core/scenario/helpers';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'docs/art/g4-g8-hud.png';
const locale = process.argv[4] === 'en' ? 'en' : 'pt';

// ---- estado no Node: Mítica, Estátua em obra (chama o Colosso), concluída, 75 s de guarda ----
const s = createGame(missionConfig(campaignMission('m6_estatua')!, 'normal'));
const run = (sec: number) => { for (let i = 0; i < sec * TICK_RATE && !s.gameOver; i++) tick(s); };
run(3);
s.players[0].age = 3;
const tc = townCenter(s, 0)!;
const statue = placeNear(s, 0, 'wonder_zeus', tc.x + 9, tc.y - 9, false);
if (!statue) throw new Error('sem lugar para a Estátua');
run(2);
advanceBuild(s, statue, 9999);
const colossus = tagIds(s, 'colosso1').map((id) => s.units.get(id)).find((u) => u && !u.dead);
if (!colossus) throw new Error('o Colosso não nasceu');
// o Colosso marcha até a Estátua: a cena fica dentro da visão de Argos (sem névoa)
for (let sec = 0; sec < 120 && (colossus.x - statue.x) ** 2 + (colossus.y - statue.y) ** 2 > 10 * 10; sec++) run(1);
console.log(`guarda: ${s.scenario!.vars.estatua_s}s de ${s.scenario!.vars.guarda}s; Colosso ${colossus.id} em (${colossus.x.toFixed(1)}, ${colossus.y.toFixed(1)}), nome ${JSON.stringify(colossus.displayName)}`);
const save = serialize(s);

// ---- navegador: carrega o save, seleciona o Colosso, põe o cursor sobre ele e captura ----
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(([json, loc]) => {
  localStorage.setItem('aoe_save_v1', json);
  let st: Record<string, unknown> = {}; try { st = JSON.parse(localStorage.getItem('aoe_settings_v1') ?? '{}'); } catch { /* padrão */ }
  localStorage.setItem('aoe_settings_v1', JSON.stringify({ ...st, locale: loc }));   // o idioma vem das opções (settings.locale)
}, [save, locale] as const);
await page.goto(url, { waitUntil: 'networkidle' });
await page.mouse.move(720, 450);   // o cursor começa em (0, 0): no canto, a rolagem pela borda arrastaria a câmera
const id = colossus.id;
const pos = await page.evaluate((cid) => {
  const aoe = (window as unknown as { aoe: { loadGame: () => void; session: { paused: boolean; select: (ids: number[]) => void; state: { units: Map<number, { x: number; y: number }> } }; renderer: { cam: { zoom: number; centerOn: (x: number, y: number) => void; worldToScreen: (x: number, y: number) => { x: number; y: number } } } } }).aoe;
  aoe.loadGame();
  aoe.session.paused = true;
  const u = aoe.session.state.units.get(cid)!;
  aoe.session.select([cid]);
  aoe.renderer.cam.zoom = 1.4; aoe.renderer.cam.centerOn(u.x, u.y);
  return aoe.renderer.cam.worldToScreen(u.x, u.y);
}, id);
await page.waitForTimeout(1500);
// a câmera pode ter sido ajustada no quadro seguinte (limites do mapa): recalcula a posição do Colosso na tela
Object.assign(pos, await page.evaluate((cid) => {
  const aoe = (window as unknown as { aoe: { session: { state: { units: Map<number, { x: number; y: number }> } }; renderer: { cam: { worldToScreen: (x: number, y: number) => { x: number; y: number } } } } }).aoe;
  const u = aoe.session.state.units.get(cid)!;
  return aoe.renderer.cam.worldToScreen(u.x, u.y);
}, id));
await page.mouse.move(pos.x, pos.y - 12);
await page.waitForTimeout(600);
await page.mouse.move(pos.x + 1, pos.y - 11);
await page.waitForTimeout(900);
const hud = await page.evaluate(() => ({
  objectives: document.querySelector('#objectives')?.textContent ?? document.body.innerText.match(/Guarda da Estátua[^\n]*|Statue watch[^\n]*/)?.[0] ?? '',
  selection: document.querySelector('#selection .title')?.textContent ?? '',
  tooltip: document.querySelector('#tooltip')?.classList.contains('hidden') ? '' : document.querySelector('#tooltip')?.textContent ?? '',
}));
await page.screenshot({ path: out });
console.log(JSON.stringify(hud));
const barOk = /(Guarda da Estátua|Statue watch): \d+:\d\d \/ 6:00/.test(hud.objectives);
const nameOk = /(Colosso de Poseidon|Colossus of Poseidon)/.test(hud.selection);
const tipOk = /(Colosso de Poseidon|Colossus of Poseidon)/.test(hud.tooltip);
console.log(`barra G4: ${barOk ? 'ok' : 'FALHOU'} · nome G8 no painel: ${nameOk ? 'ok' : 'FALHOU'} · nome G8 no tooltip: ${tipOk ? 'ok' : 'FALHOU'}`);
console.log('erros:', errors.length ? errors.join('\n') : 'nenhum');
console.log('captura salva em', out);
await browser.close();
if (!barOk || !nameOk || !tipOk || errors.length) process.exit(1);
