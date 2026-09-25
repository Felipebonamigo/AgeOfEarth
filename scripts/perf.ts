// Desempenho da simulação: mapa grande, 4 IAs "Muito difícil" (mais unidades), 30 minutos; mede ms/tick e pico.
import { createGame, tick } from '../src/core/sim/game';
import { TICK_RATE } from '../src/core/constants';
const state = createGame({ seed: 2026, mapSize: 'large', players: ['zeus', 'poseidon', 'hades', 'zeus'].map((g, i) => ({ name: `IA${i}`, god: g, isAI: true, difficulty: 'brutal' as const, team: i })) });
const minutes = Number(process.argv[2] ?? 30);
let worst = 0, worstTick = 0; const t0 = performance.now(); let lastMin = 0;
const windowMs: number[] = [];
for (let i = 0; i < minutes * 60 * TICK_RATE && !state.gameOver; i++) {
  const a = performance.now(); tick(state); const d = performance.now() - a;
  windowMs.push(d); if (d > worst) { worst = d; worstTick = state.tick; }
  if (state.tick % (60 * TICK_RATE) === 0) {
    const avg = windowMs.reduce((s, v) => s + v, 0) / windowMs.length; const p95 = [...windowMs].sort((x, y) => x - y)[Math.floor(windowMs.length * 0.95)];
    console.log(`min ${state.tick / TICK_RATE / 60}: unidades=${state.units.size} edifícios=${state.buildings.size} média=${avg.toFixed(2)}ms p95=${p95.toFixed(2)}ms`);
    windowMs.length = 0; lastMin = state.tick;
  }
}
void lastMin;
console.log(`total ${((performance.now() - t0) / 1000).toFixed(1)}s reais, pior tick ${worst.toFixed(1)}ms (tick ${worstTick}); orçamento por tick a 20 Hz = 50ms`);
