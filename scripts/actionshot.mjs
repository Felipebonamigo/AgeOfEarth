// Gera uma captura de batalha para o README: exército do jogador contra criaturas míticas inimigas.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'docs/screenshot.png';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.fill('#m-seed', '2024'); await page.selectOption('#m-ais', '2'); await page.click('#m-start'); await page.waitForTimeout(1200);
await page.evaluate(() => { window.aoe.session.speed = 3; }); await page.waitForTimeout(5000); await page.evaluate(() => { window.aoe.session.speed = 1; });
await page.evaluate(() => {
  const s = window.aoe.session; const st = s.state; const p = s.player;
  const tc = [...st.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center');
  p.age = 3; p.resources.food = 5000; p.resources.gold = 5000; p.resources.wood = 5000; p.resources.favor = 500; p.mods.player.popCap += 60;
  if (window.aoe.debugSpawn) {
    const sp = window.aoe.debugSpawn;
    const mine = ['hoplite', 'hoplite', 'hoplite', 'hoplite', 'toxotes', 'toxotes', 'toxotes', 'hetairoi', 'hetairoi', 'heracles', 'minotaur', 'centaur', 'petrobolos'];
    const theirs = ['hoplite', 'hoplite', 'hoplite', 'cyclops', 'hydra', 'medusa', 'chimera', 'toxotes', 'toxotes', 'hippeus'];
    mine.forEach((t, i) => sp(s.local, t, tc.x - 4 + (i % 5), tc.y + 4 + Math.floor(i / 5)));
    theirs.forEach((t, i) => sp((s.local + 1) % st.players.length, t, tc.x + 5 + (i % 5), tc.y + 5 + Math.floor(i / 5)));
    const ids = [...st.units.values()].filter((u) => u.owner === s.local && u.type !== 'villager').map((u) => u.id);
    s.issue({ type: 'attackMove', player: s.local, ids, x: tc.x + 6, y: tc.y + 7 });
    s.select(ids);
  }
  window.aoe.renderer.cam.zoom = 1.6; window.aoe.renderer.cam.centerOn(tc.x + 1, tc.y + 6);
});
await page.waitForTimeout(5500);
await page.screenshot({ path: out });
console.log('captura salva em', out);
await browser.close();
