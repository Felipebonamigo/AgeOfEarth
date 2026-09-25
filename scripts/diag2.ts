import { createGame, tick } from '../src/core/sim/game';
import { TICK_RATE } from '../src/core/constants';
import { findBuildSpot } from '../src/core/sim/ai';
import { canAfford } from '../src/core/sim/economy';
import { getBuildingStats } from '../src/core/sim/modifiers';
const state = createGame({ seed: 42, mapSize: 'medium', players: [
  { name: 'Zeus IA', god: 'zeus', isAI: true, difficulty: 'normal' },
  { name: 'Poseidon IA', god: 'poseidon', isAI: true, difficulty: 'normal' },
  { name: 'Hades IA', god: 'hades', isAI: true, difficulty: 'normal' } ] });
for (let i = 0; i < 25 * 60 * TICK_RATE; i++) tick(state);
for (const p of state.players) {
  const bl = [...state.buildings.values()].filter((b) => b.owner === p.id);
  console.log('==', p.name, 'idade', p.age, 'techs', p.techs.join(','));
  console.log('  edifícios:', bl.map((b) => `${b.type}${b.complete ? '' : '(obra ' + Math.round(b.progress) + ')'}`).join(' '));
  const tc = bl.find((b) => b.type === 'town_center');
  if (tc) {
    for (const t of ['academy', 'house', 'stable', 'market']) {
      const spot = findBuildSpot(state, p, t, tc.x, tc.y, 1, 18);
      console.log(`  spot ${t}:`, spot, 'afford:', canAfford(p, getBuildingStats(state, p, t).cost), 'cost', JSON.stringify(getBuildingStats(state, p, t).cost));
    }
  }
  const vill = [...state.units.values()].filter((u) => u.owner === p.id && u.type === 'villager');
  const byState: Record<string, number> = {};
  for (const v of vill) byState[v.state] = (byState[v.state] ?? 0) + 1;
  console.log('  cidadãos por estado:', JSON.stringify(byState), 'construtores em obras:', vill.filter((v) => v.state === 'build').map((v) => state.buildings.get(v.targetId)?.type).join(','));
}
