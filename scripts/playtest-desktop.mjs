// Teste da build desktop (Electron) já empacotada: abre o executável, confere o protocolo app:// (fetch de arquivos
// do jogo, bloqueio de caminhos fora da pasta), a ponte window.desktop, uma partida rodando, tela cheia e a
// persistência do localStorage entre duas execuções.
// Uso: xvfb-run -a node scripts/playtest-desktop.mjs [executável] [saída.png]
//   executável padrão: desktop/release/linux-unpacked/age-of-earth (gerado por `npm run dist:linux` em desktop/)
import { _electron as electron } from 'playwright';
import { existsSync } from 'node:fs';

const exe = process.argv[2] ?? 'desktop/release/linux-unpacked/age-of-earth';
const shot = process.argv[3] ?? null;
if (!existsSync(exe)) { console.log(`executável não encontrado: ${exe} (rode "npm run dist:linux" em desktop/)`); process.exit(1); }

let failures = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'ok ' : 'FALHOU'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failures++; };
// Chromium do Electron sem GPU: renderização por software, como nos outros playtests
const args = ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function launch() {
  const app = await electron.launch({ executablePath: exe, args, timeout: 60_000 });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.waitForFunction(() => !!window.aoe && !!document.querySelector('#m-start'), null, { timeout: 60_000 });
  return { app, page, errors };
}

// 1ª execução
let { app, page, errors } = await launch();
check(page.url().startsWith('app://game/'), 'página servida por app://', page.url());
const fetched = await page.evaluate(async () => {
  const r = await fetch('index.html'); const idx = r.ok && (await r.text()).includes('<');
  let art = null; try { const m = await fetch('art/manifest.json'); art = m.ok ? Object.keys((await m.json()).assets ?? {}).length : `http ${m.status}`; } catch (e) { art = 'erro: ' + e.message; }
  let escape = null; try { const x = await fetch('app://game/..%2F..%2Fapp.asar'); escape = x.status; } catch (e) { escape = 'recusado'; }
  return { idx, art, escape };
});
check(fetched.idx, 'fetch de arquivo do jogo');
check(typeof fetched.art === 'number' && fetched.art > 0, 'fetch do manifesto de arte (art/manifest.json)', String(fetched.art));
check(fetched.escape !== 200, 'caminho fora da pasta do jogo bloqueado', String(fetched.escape));
await page.waitForTimeout(300); errors.length = 0;   // o 403 acima é esperado (e aparece no console)
const bridge = await page.evaluate(async () => ({ has: !!window.desktop, keys: Object.keys(window.desktop ?? {}).sort().join(','), steam: await window.desktop?.steamName?.() }));
check(bridge.has, 'ponte window.desktop', bridge.keys);
check(bridge.steam === null || typeof bridge.steam === 'string', 'Steam ausente tratada (steamName → null)', String(bridge.steam));
const packaged = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: process.versions.electron }));
check(packaged.packaged, 'executável empacotado', `Electron ${packaged.version}`);

// grava uma opção para conferir a persistência na 2ª execução
await page.evaluate(() => { localStorage.setItem('aoe_desktop_probe', 'persistiu'); });

// partida rápida
await page.fill('#m-seed', '7'); await page.click('#m-start');
await page.waitForFunction(() => !!window.aoe.session && window.aoe.session.state.tick > 0, null, { timeout: 60_000 });
const t0 = await page.evaluate(() => window.aoe.session.state.tick);
await page.waitForTimeout(6000);
const t1 = await page.evaluate(() => window.aoe.session.state.tick);
check(t1 > t0 + 20, 'partida avança', `tick ${t0} → ${t1}`);
const gpu = await page.evaluate(() => window.aoe.renderer.gpuName?.() ?? null);
console.log('   GPU:', gpu);
if (shot) { await page.screenshot({ path: shot }); console.log('   captura:', shot); }

// tela cheia pela ponte
await page.evaluate(() => window.desktop.setFullscreen(true)); await page.waitForTimeout(800);
const fsOn = await page.evaluate(() => window.desktop.isFullscreen());
await page.evaluate(() => window.desktop.setFullscreen(false)); await page.waitForTimeout(800);
const fsOff = await page.evaluate(() => window.desktop.isFullscreen());
check(fsOn === true && fsOff === false, 'tela cheia liga e desliga', `${fsOn}/${fsOff}`);
check(errors.length === 0, 'sem erros na 1ª execução', errors.slice(0, 5).join(' | '));
await app.close();

// 2ª execução: o localStorage da origem app://game sobrevive
({ app, page, errors } = await launch());
const probe = await page.evaluate(() => { const v = localStorage.getItem('aoe_desktop_probe'); localStorage.removeItem('aoe_desktop_probe'); return v; });
check(probe === 'persistiu', 'localStorage persiste entre execuções', String(probe));
check(errors.length === 0, 'sem erros na 2ª execução', errors.slice(0, 5).join(' | '));
await app.close();

console.log(failures ? `${failures} verificação(ões) falharam` : 'todas as verificações passaram');
process.exit(failures ? 1 : 0);
