import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? '/tmp/camp';
const browser = await chromium.launch({ env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' }, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.type()}: ${m.text()}`); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.click('[data-tab="campaign"]'); await page.waitForTimeout(300);
await page.screenshot({ path: `${out}-1-menu.png` });
await page.selectOption('#m-cdiff', 'hard'); await page.waitForTimeout(100);
await page.click('.mission'); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-2-intro.png` });
// ilustração da missão (ROADMAP 2.7) no alto do briefing, carregada de verdade
const art = await page.evaluate(() => new Promise((res) => {
  const el = document.querySelector('#modal .mission-art'); if (!el) { res(null); return; }
  const u = getComputedStyle(el).backgroundImage.replace(/^url\(["']?|["']?\)$/g, ''), img = new Image();
  img.onload = () => res({ u, w: img.naturalWidth }); img.onerror = () => res({ u, w: 0 }); img.src = u;
}));
console.log('ilustração do briefing:', art && art.w >= 1280 ? `ok (${art.u.split('/').pop()}, ${art.w} px)` : `FALHOU ${JSON.stringify(art)}`);
if (!art || art.w < 1280) errors.push('briefing sem a ilustração da missão');
await page.click('#m-go'); await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}-3-play.png` });
const info = await page.evaluate(() => { const s = window.aoe.session; return { scenario: s.state.scenario, tick: s.state.tick, paused: s.paused, campaignDifficulty: s.state.config.campaignDifficulty, savedDiff: localStorage.getItem('aoe_campaign_diff') }; });
console.log('dificuldade da campanha:', info.campaignDifficulty === 'hard' && info.savedDiff === 'hard' ? 'ok (difícil)' : `FALHOU ${info.campaignDifficulty}/${info.savedDiff}`);
console.log(JSON.stringify(info));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
