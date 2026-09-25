// Balanceamento: roda várias partidas IA x IA e imprime quando cada IA avança de Idade, ondas e vencedor.
import { createGame, tick } from '../src/core/sim/game';
import { TICK_RATE } from '../src/core/constants';
import { AGES } from '../src/core/data';

const minutes = Number(process.argv[2] ?? 30);
const seeds = (process.argv[3] ?? '1,2,3').split(',').map(Number);
const gods = ['zeus', 'poseidon', 'hades'];
for (const seed of seeds) {
  const state = createGame({ seed, mapSize: 'medium', players: gods.map((g, i) => ({ name: `${g}${i}`, god: g, isAI: true, difficulty: 'normal' as const })) });
  const ageAt: Record<string, number[]> = {}; for (const p of state.players) ageAt[p.name] = [0];
  const t0 = Date.now();
  for (let i = 0; i < minutes * 60 * TICK_RATE && !state.gameOver; i++) {
    tick(state);
    for (const p of state.players) if (ageAt[p.name].length <= p.age) ageAt[p.name].push(Math.round(state.time / 60));
  }
  const ms = Date.now() - t0;
  console.log(`\n=== semente ${seed} · ${Math.round(state.time / 60)} min de jogo em ${(ms / 1000).toFixed(1)}s reais · ${(ms / state.tick).toFixed(2)} ms/tick ===`);
  for (const p of state.players) {
    console.log(`${p.name.padEnd(10)} ${p.alive ? 'vivo ' : 'morto'} idade=${AGES[p.age].short.padEnd(8)} idades aos minutos [${ageAt[p.name].join(', ')}] ondas=${p.ai?.waves} abates=${p.stats.kills} perdas=${p.stats.losses} destruídos=${p.stats.razed} território=${p.territoryTiles} techs=${p.techs.length}`);
  }
  if (state.gameOver) console.log('Vencedor:', state.winner >= 0 ? state.players[state.winner].name : 'nenhum');
}
