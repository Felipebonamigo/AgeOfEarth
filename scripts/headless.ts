// Simulação sem interface: IA contra IA por N minutos, para validar estabilidade e balanceamento.
import { createGame, tick, summarize } from '../src/core/sim/game';
import { TICK_RATE } from '../src/core/constants';

const minutes = Number(process.argv[2] ?? 12);
const seed = Number(process.argv[3] ?? 42);
const state = createGame({
  seed, mapSize: 'medium',
  players: [
    { name: 'Zeus IA', god: 'zeus', isAI: true, difficulty: 'normal' },
    { name: 'Poseidon IA', god: 'poseidon', isAI: true, difficulty: 'normal' },
    { name: 'Hades IA', god: 'hades', isAI: true, difficulty: 'normal' },
  ],
});
const t0 = Date.now();
const total = minutes * 60 * TICK_RATE;
for (let i = 0; i < total; i++) {
  tick(state);
  if (state.tick % (TICK_RATE * 60) === 0) {
    console.log(`--- minuto ${state.tick / TICK_RATE / 60} (${((Date.now() - t0) / 1000).toFixed(1)}s reais) ---`);
    console.log(summarize(state));
  }
  if (state.gameOver) { console.log('FIM:', state.events.filter((e) => e.type === 'victory').map((e) => e.text)); break; }
}
const ms = Date.now() - t0;
console.log(`Ticks: ${state.tick}, tempo real: ${ms}ms, ${(ms / state.tick).toFixed(2)} ms/tick, unidades: ${state.units.size}, edifícios: ${state.buildings.size}`);
console.log('Eventos:', state.events.filter((e) => ['age', 'victory', 'defeated', 'wonder', 'titan', 'powerUsed', 'buildingLost'].includes(e.type)).map((e) => `${Math.floor(e.tick / TICK_RATE / 60)}m ${e.text}`).slice(-30).join('\n  '));
for (const p of state.players) console.log(p.name, 'ondas de ataque:', p.ai?.waves, 'abates:', p.stats.kills, 'perdas:', p.stats.losses, 'destruídos:', p.stats.razed, 'coletado:', JSON.stringify(Object.fromEntries(Object.entries(p.stats.gathered).map(([k, v]) => [k, Math.round(v as number)]))));
