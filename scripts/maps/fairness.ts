// Justiça de um mapa fixo entre inícios: roda partidas IA x IA com o MESMO deus em todos os inícios (e com os deuses
// em rodízio), várias sementes, e conta vitórias e minutos das idades por início. Num mapa justo nenhum início vence
// sistematicamente. Uso: npx tsx scripts/maps/fairness.ts <arquivo.map.json> [minutos=35] [sementes=1,2,3,4] [deuses=zeus]
import fs from 'node:fs';
import { createGame, tick } from '../../src/core/sim/game';
import { TICK_RATE } from '../../src/core/constants';
import { migrateMap } from '../../src/core/map/fixed';

const [file, minArg, seedArg, godArg] = process.argv.slice(2);
if (!file) { console.error('Uso: npx tsx scripts/maps/fairness.ts <arquivo.map.json> [minutos] [sementes] [deuses]'); process.exit(1); }
const map = migrateMap(JSON.parse(fs.readFileSync(file, 'utf8')));
const minutes = Number(minArg ?? 35);
const seeds = (seedArg ?? '1,2,3,4').split(',').map(Number);
const gods = (godArg ?? 'zeus').split(',');
const n = Math.min(4, map.starts.length);
const teams = map.startTeams && n === 4 ? map.startTeams : null;
const wins = new Array(n).fill(0); const ages: number[][][] = Array.from({ length: n }, () => [[], [], [], []]);
for (const seed of seeds) {
  const players = Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, god: gods[(i + seed) % gods.length], isAI: true, difficulty: 'normal' as const, team: teams ? teams[i] : i }));
  const state = createGame({ seed, mapSize: 'medium', map, players });
  const reached: number[][] = players.map(() => []);
  for (let t = 0; t < minutes * 60 * TICK_RATE && !state.gameOver; t++) {
    tick(state);
    if (t % TICK_RATE === 0) for (const p of state.players) while (reached[p.id].length < p.age) reached[p.id].push(Math.round(state.time / 60));
  }
  const winner = state.gameOver ? state.winner : -1;
  const winTeam = winner >= 0 ? state.players[winner].team : -1;
  state.players.forEach((p, i) => { if (winTeam >= 0 && p.team === winTeam) wins[i]++; reached[i].forEach((m, k) => ages[i][k].push(m)); });
  console.log(`semente ${seed}: ${state.gameOver ? `vence ${winTeam >= 0 ? `time ${winTeam}` : 'ninguém'} aos ${Math.round(state.time / 60)} min` : `sem vencedor aos ${minutes} min`} · ` + state.players.map((p, i) => `${p.name}(${p.god}) idades [${reached[i].join(',')}] ${p.alive ? 'vivo' : 'morto'}`).join(' · '));
}
const avg = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '—');
for (let i = 0; i < n; i++) console.log(`início ${i + 1}: vitórias ${wins[i]}/${seeds.length} · Clássica ${avg(ages[i][0])} · Heroica ${avg(ages[i][1])} · Mítica ${avg(ages[i][2])} · Titãs ${avg(ages[i][3])}`);
