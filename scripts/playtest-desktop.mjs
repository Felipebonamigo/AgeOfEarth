// Teste da build desktop (Electron) já empacotada: abre o executável, confere o protocolo app:// (fetch de arquivos
// do jogo, bloqueio de caminhos fora da pasta), a ponte window.desktop, uma partida rodando, tela cheia, a
// persistência do localStorage entre duas execuções e o espelho dos saves em arquivos (Steam Cloud, ROADMAP 6.4):
// grava opções e um save, fecha, APAGA o localStorage da origem app://game, reabre e confere que tudo voltou dos arquivos.
// Uso: xvfb-run -a node scripts/playtest-desktop.mjs [executável] [saída.png]
//   executável padrão: desktop/release/linux-unpacked/age-of-earth (gerado por `npm run dist:linux` em desktop/)
// O perfil (userData) é uma pasta temporária (XDG_CONFIG_HOME), apagada no fim: o teste nunca toca no perfil do usuário.
import { _electron as electron } from 'playwright';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const exe = process.argv[2] ?? 'desktop/release/linux-unpacked/age-of-earth';
const shot = process.argv[3] ?? null;
if (!existsSync(exe)) { console.log(`executável não encontrado: ${exe} (rode "npm run dist:linux" em desktop/)`); process.exit(1); }

let failures = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'ok ' : 'FALHOU'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failures++; };
// Chromium do Electron sem GPU: renderização por software, como nos outros playtests
const args = ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const profile = mkdtempSync(path.join(tmpdir(), 'aoe-desktop-'));
const env = { ...process.env, XDG_CONFIG_HOME: profile };

async function launch() {
  const app = await electron.launch({ executablePath: exe, args, env, timeout: 60_000 });
  const page = await app.firstWindow();
  const errors = [], logs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); else logs.push(m.text()); });
  await page.waitForFunction(() => !!window.aoe && !!document.querySelector('#m-start'), null, { timeout: 60_000 });
  return { app, page, errors, logs };
}
const readSave = (dir, file) => { try { return readFileSync(path.join(dir, file), 'utf8'); } catch { return null; } };

try {
  // ---------------- 1ª execução ----------------
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
  const bridge = await page.evaluate(async () => ({ has: !!window.desktop, keys: Object.keys(window.desktop ?? {}).sort(), steam: await window.desktop?.steamName?.() }));
  check(bridge.has, 'ponte window.desktop', bridge.keys.join(','));
  check(['cloudReadAll', 'cloudRemove', 'cloudWrite'].every((k) => bridge.keys.includes(k)) && !bridge.keys.some((k) => /fs|read(File|Dir)|writeFile|path|require/i.test(k)), 'ponte do espelho só com as três operações (sem fs genérico)');
  check(bridge.steam === null || typeof bridge.steam === 'string', 'Steam ausente tratada (steamName → null)', String(bridge.steam));
  const packaged = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: process.versions.electron, userData: app.getPath('userData') }));
  check(packaged.packaged, 'executável empacotado', `Electron ${packaged.version}`);
  const savesDir = path.join(packaged.userData, 'saves');
  check(packaged.userData.startsWith(profile), 'perfil isolado (userData)', packaged.userData);
  console.log('   pasta do espelho:', path.relative(profile, savesDir), '(relativa a $XDG_CONFIG_HOME)');
  const thirdParty = path.join(path.dirname(exe), 'resources', 'THIRD_PARTY.md');
  check(existsSync(thirdParty) && readFileSync(thirdParty, 'utf8').includes('pixi.js'), 'resources/THIRD_PARTY.md no pacote');
  check(existsSync(path.join(path.dirname(exe), 'LICENSES.chromium.html')), 'LICENSES.chromium.html ao lado do executável');

  // IPC do espelho recusa o que não é da lista, caminhos e valores grandes
  const refused = await page.evaluate(async () => {
    const d = window.desktop;
    return {
      desync: await d.cloudWrite('aoe_desync_v1', 'x'), path: await d.cloudWrite('../../fora', 'x'), num: await d.cloudWrite('aoe_save_v1', 42),
      big: await d.cloudWrite('aoe_replay_v1', 'x'.repeat(16 * 1024 * 1024 + 1)), rm: await d.cloudRemove('../../fora'),
    };
  });
  check(Object.values(refused).every((v) => v === false), 'espelho recusa chave fora da lista, caminho, não-texto e > 16 MB', JSON.stringify(refused));

  // grava opções pelo menu: inglês e sem rolagem pela borda (vão para o localStorage e para saves/*.json)
  await page.evaluate(() => localStorage.setItem('aoe_desktop_probe', 'persistiu'));
  await page.selectOption('#m-locale', 'en'); await page.waitForTimeout(200);
  await page.click('#m-options'); await page.waitForSelector('#o-edge');
  if (await page.isChecked('#o-edge')) await page.click('#o-edge');
  await page.waitForTimeout(500);
  const settingsFile = readSave(savesDir, 'settings.json');
  check(!!settingsFile && JSON.parse(settingsFile).edgeScroll === false && JSON.parse(settingsFile).locale === 'en', 'opções gravadas em saves/settings.json', settingsFile?.slice(0, 80) ?? 'ausente');
  check(readSave(savesDir, 'locale.json') === 'en', 'idioma gravado em saves/locale.json');

  // partida rápida + save (F5) → saves/save.json
  await page.fill('#m-seed', '7'); await page.click('#m-start');
  await page.waitForFunction(() => !!window.aoe.session && window.aoe.session.state.tick > 0, null, { timeout: 60_000 });
  const t0 = await page.evaluate(() => window.aoe.session.state.tick);
  await page.waitForTimeout(6000);
  const t1 = await page.evaluate(() => window.aoe.session.state.tick);
  check(t1 > t0 + 20, 'partida avança', `tick ${t0} → ${t1}`);
  const gpu = await page.evaluate(() => window.aoe.renderer.gpuName?.() ?? null);
  console.log('   GPU:', gpu);
  if (shot) { await page.screenshot({ path: shot }); console.log('   captura:', shot); }
  await page.keyboard.press('F5'); await page.waitForTimeout(800);
  const saveLocal = await page.evaluate(() => localStorage.getItem('aoe_save_v1'));
  const saveFile = readSave(savesDir, 'save.json');
  check(!!saveLocal && saveFile === saveLocal, 'save (F5) no localStorage e igual em saves/save.json', `${saveFile ? Math.round(saveFile.length / 1024) : 0} KB`);

  // tela cheia pela ponte
  await page.evaluate(() => window.desktop.setFullscreen(true)); await page.waitForTimeout(800);
  const fsOn = await page.evaluate(() => window.desktop.isFullscreen());
  await page.evaluate(() => window.desktop.setFullscreen(false)); await page.waitForTimeout(800);
  const fsOff = await page.evaluate(() => window.desktop.isFullscreen());
  check(fsOn === true && fsOff === false, 'tela cheia liga e desliga', `${fsOn}/${fsOff}`);
  check(errors.length === 0, 'sem erros na 1ª execução', errors.slice(0, 5).join(' | '));
  await app.close();

  // ---------------- 2ª execução: o localStorage da origem app://game sobrevive; depois é APAGADO ----------------
  let logs;
  ({ app, page, errors, logs } = await launch());
  const probe = await page.evaluate(() => { const v = localStorage.getItem('aoe_desktop_probe'); localStorage.removeItem('aoe_desktop_probe'); return v; });
  check(probe === 'persistiu', 'localStorage persiste entre execuções', String(probe));
  check(!logs.some((l) => l.startsWith('cloud:')), 'nada a restaurar com localStorage e arquivos iguais', logs.filter((l) => l.startsWith('cloud:')).join(' | '));
  check(errors.length === 0, 'sem erros na 2ª execução', errors.slice(0, 5).join(' | '));
  await page.evaluate(() => localStorage.setItem('aoe_desktop_probe2', 'deve sumir'));   // chave fora do espelho: prova que apagou
  await page.goto('about:blank');
  const cleared = await app.evaluate(async ({ session }) => { await session.defaultSession.clearStorageData({ origin: 'app://game', storages: ['localstorage'] }); return true; });
  check(cleared, 'localStorage da origem app://game apagado (clearStorageData)');
  await app.close();

  // ---------------- 3ª execução: tudo volta dos arquivos ----------------
  ({ app, page, errors, logs } = await launch());
  const after = await page.evaluate(() => ({
    probe2: localStorage.getItem('aoe_desktop_probe2'), settings: localStorage.getItem('aoe_settings_v1'), save: (localStorage.getItem('aoe_save_v1') ?? '').length,
    edge: window.aoe.settings.edgeScroll, locale: window.aoe.settings.locale, play: document.querySelector('#m-start')?.textContent?.trim(), load: !document.querySelector('#m-load')?.disabled,
  }));
  check(after.probe2 === null, 'o localStorage estava mesmo vazio (chave fora do espelho sumiu)', String(after.probe2));
  check(after.edge === false && after.locale === 'en' && !!after.settings, 'opções restauradas do arquivo (sem rolagem pela borda, inglês)', `edge=${after.edge} locale=${after.locale}`);
  check(after.play === '▶ Play', 'menu já abre em inglês', String(after.play));
  check(after.save === (saveFile ?? '').length && after.load, 'save restaurado do arquivo (Carregar habilitado)', `${Math.round(after.save / 1024)} KB`);
  const restoredLog = logs.find((l) => l.startsWith('cloud:')) ?? '';
  check(/aoe_settings_v1/.test(restoredLog) && /aoe_save_v1/.test(restoredLog), 'boot registra o que restaurou', restoredLog.slice(0, 160));
  await page.click('#m-load');
  await page.waitForFunction(() => !!window.aoe.session && window.aoe.session.state.tick > 0, null, { timeout: 60_000 });
  check(true, 'save restaurado carrega');
  check(errors.length === 0, 'sem erros na 3ª execução', errors.slice(0, 5).join(' | '));
  console.log('   arquivos:', readdirSync(savesDir).sort().join(', '));
  await app.close();
} finally {
  rmSync(profile, { recursive: true, force: true });
}

console.log(failures ? `${failures} verificação(ões) falharam` : 'todas as verificações passaram');
process.exit(failures ? 1 : 0);
