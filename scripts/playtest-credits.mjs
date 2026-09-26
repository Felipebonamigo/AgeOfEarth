// Tela Créditos (ROADMAP 6.7) no navegador: abre pelo menu principal em PT e em EN, confere equipe, tecnologias e a tabela
// de licenças (a mesma lista de src/ui/third-party.json) e grava as capturas docs/art/creditos-{pt,en}.png.
// Uso: node scripts/playtest-credits.mjs [url] (exige `npm run preview` ou outro servidor com o build)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const expected = JSON.parse(readFileSync(new URL('../src/ui/third-party.json', import.meta.url), 'utf8')).packages;
let failures = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'ok ' : 'FALHOU'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failures++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });

for (const [locale, team, title, shot] of [['pt', 'criação e direção', 'Créditos', 'docs/art/creditos-pt.png'], ['en', 'creation and direction', 'Credits', 'docs/art/creditos-en.png']]) {
  await page.selectOption('#m-locale', locale); await page.waitForTimeout(200);
  const btn = (await page.textContent('#m-credits'))?.trim();
  check(btn?.includes(title), `[${locale}] botão no menu principal`, btn);
  await page.click('#m-credits'); await page.waitForSelector('#modal #credits-licenses');
  const info = await page.evaluate(() => {
    const m = document.querySelector('#modal');
    const rows = [...m.querySelectorAll('#credits-licenses tr')].filter((r) => r.querySelector('td')).map((r) => r.querySelector('td').childNodes[0].textContent.trim());
    return { h2: m.querySelector('h2')?.textContent?.trim(), text: m.textContent, rows, details: m.querySelectorAll('details').length, fits: m.getBoundingClientRect().bottom <= window.innerHeight + 1, top: m.scrollTop };
  });
  check(info.top === 0, `[${locale}] abre no topo (mesmo depois de rolar outro modal)`, String(info.top));
  check(info.h2?.includes(title), `[${locale}] título`, info.h2);
  check(info.text.includes('Felipe Bonamigo') && info.text.includes(team), `[${locale}] equipe`);
  check(info.text.includes('Claude Code'), `[${locale}] assistência de IA`);
  check(info.text.includes('PixiJS') && info.text.includes('Electron') && info.text.includes('Steamworks'), `[${locale}] tecnologias`);
  const byScope = ['game', 'desktop', 'relay'].flatMap((s) => expected.filter((p) => p.s === s).map((p) => p.n));   // a tela agrupa jogo → desktop → servidor
  check(JSON.stringify(info.rows) === JSON.stringify(byScope), `[${locale}] tabela de licenças = src/ui/third-party.json`, `${info.rows.length} linhas`);
  check(info.details >= 2, `[${locale}] textos das licenças (MIT, ISC, BSD…)`, String(info.details));
  check(info.fits, `[${locale}] modal cabe na janela (rola por dentro)`);
  await page.screenshot({ path: shot }); console.log('   captura:', shot);
  await page.click('#modal #m-close'); await page.waitForTimeout(150);
  check(!(await page.isVisible('#modal #credits-licenses')), `[${locale}] fechar`);
}
await page.selectOption('#m-locale', 'pt');
check(errors.length === 0, 'sem erros no console', errors.slice(0, 5).join(' | '));
await browser.close();
console.log(failures ? `${failures} verificação(ões) falharam` : 'todas as verificações passaram');
process.exit(failures ? 1 : 0);
