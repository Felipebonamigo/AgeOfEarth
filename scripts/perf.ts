// Desempenho da simulação: mapa grande, 4 IAs "Muito difícil" (mais unidades); mede ms/tick por minuto e o pico.
// Uso: npx tsx scripts/perf.ts [minutos=30] [--seed 2026] [--size large] [--map-type continental] [--start-age N] [--json saída]
// Orçamento (E10): média ≤ 5 ms em todo minuto, p95 ≤ 12 ms, pior tick ≤ 50 ms; código de saída 1 se FORA.
import fs from 'node:fs';
import { createGame, tick } from '../src/core/sim/game';
import { MAP_SIZES, MAP_TYPES, TICK_RATE, type MapSize, type MapType } from '../src/core/constants';
const argv = process.argv.slice(2);
const opt = new Map<string, string>(); const pos: string[] = [];
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) opt.set(argv[i].slice(2), argv[++i] ?? ''); else pos.push(argv[i]); }
const minutes = Number(pos[0] ?? 30);
const size = (opt.get('size') ?? 'large') as MapSize; const mapType = (opt.get('map-type') ?? 'continental') as MapType;
if (!(size in MAP_SIZES) || !MAP_TYPES.includes(mapType)) { console.error('Uso: npx tsx scripts/perf.ts [minutos] [--seed N] [--size small|medium|large] [--map-type tipo] [--start-age N] [--json saída]'); process.exit(1); }
const startAge = opt.has('start-age') ? Number(opt.get('start-age')) : undefined;
const state = createGame({ seed: Number(opt.get('seed') ?? 2026), mapSize: size, mapType, ...(startAge !== undefined ? { startingAge: startAge } : {}), players: ['zeus', 'poseidon', 'hades', 'zeus'].map((g, i) => ({ name: `IA${i}`, god: g, isAI: true, difficulty: 'brutal' as const, team: i })) });
let worst = 0, worstTick = 0; const t0 = performance.now();
const windowMs: number[] = []; const perMin: { min: number; units: number; buildings: number; avg: number; p95: number }[] = [];
for (let i = 0; i < minutes * 60 * TICK_RATE && !state.gameOver; i++) {
  const a = performance.now(); tick(state); const d = performance.now() - a;
  windowMs.push(d); if (d > worst) { worst = d; worstTick = state.tick; }
  if (state.tick % (60 * TICK_RATE) === 0) {
    const avg = windowMs.reduce((s, v) => s + v, 0) / windowMs.length; const p95 = [...windowMs].sort((x, y) => x - y)[Math.floor(windowMs.length * 0.95)];
    perMin.push({ min: state.tick / TICK_RATE / 60, units: state.units.size, buildings: state.buildings.size, avg, p95 });
    console.log(`min ${state.tick / TICK_RATE / 60}: unidades=${state.units.size} edifícios=${state.buildings.size} média=${avg.toFixed(2)}ms p95=${p95.toFixed(2)}ms`);
    windowMs.length = 0;
  }
}
const inside = perMin.every((m) => m.avg <= 5 && m.p95 <= 12) && worst <= 50;
console.log(`total ${((performance.now() - t0) / 1000).toFixed(1)}s reais, pior tick ${worst.toFixed(1)}ms (tick ${worstTick}); orçamento por tick a 20 Hz = 50ms`);
console.log(`orçamento (média ≤ 5 ms em todo minuto, p95 ≤ 12 ms, pior ≤ 50 ms): ${inside ? 'DENTRO' : 'FORA'}`);
const json = opt.get('json');
if (json) fs.writeFileSync(json, JSON.stringify({ minutes, seed: Number(opt.get('seed') ?? 2026), size, mapType, startAge: startAge ?? null, worst, worstTick, perMin, inside }, null, 1));
if (!inside) process.exitCode = 1;
