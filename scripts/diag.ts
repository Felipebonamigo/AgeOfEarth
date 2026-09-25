import { createGame, tick } from '../src/core/sim/game';
import { TICK_RATE, NODE_RESOURCE } from '../src/core/constants';
import { distToRect } from '../src/core/map/grid';
const state = createGame({ seed: 42, mapSize: 'medium', players: [
  { name: 'Zeus IA', god: 'zeus', isAI: true, difficulty: 'normal' },
  { name: 'Poseidon IA', god: 'poseidon', isAI: true, difficulty: 'normal' },
  { name: 'Hades IA', god: 'hades', isAI: true, difficulty: 'normal' } ] });
const minutes = Number(process.argv[2] ?? 8);
for (let i = 0; i < minutes * 60 * TICK_RATE; i++) tick(state);
for (const p of state.players) {
  console.log('==', p.name, 'res', JSON.stringify(Object.fromEntries(Object.entries(p.resources).map(([k, v]) => [k, Math.round(v)]))));
  const tc = [...state.buildings.values()].find((b) => b.owner === p.id && b.type === 'town_center');
  for (const u of state.units.values()) {
    if (u.owner !== p.id || u.type !== 'villager') continue;
    let target = '';
    if (u.nodeId > 0) { const n = state.map.nodes.get(u.nodeId); target = n ? `${n.type}@${n.x},${n.y} amt=${Math.round(n.amount)} d=${distToRect(u.x, u.y, n.x, n.y, 1, 1).toFixed(1)} dTC=${tc ? Math.hypot(n.x - tc.x, n.y - tc.y).toFixed(0) : '?'}` : 'node-missing'; }
    else if (u.nodeId < 0) { const b = state.buildings.get(-u.nodeId); target = b ? `${b.type} d=${distToRect(u.x, u.y, b.tx, b.ty, b.w, b.h).toFixed(1)}` : 'bld-missing'; }
    console.log(`  v${u.id} ${u.state} carry=${u.carry ?? '-'}:${u.carryAmt.toFixed(0)} path=${u.path ? u.path.length / 2 : '-'} stuck=${u.stuck} order=${u.order?.type ?? '-'} pos=${u.x.toFixed(1)},${u.y.toFixed(1)} ${target}`);
  }
  const bl = [...state.buildings.values()].filter((b) => b.owner === p.id).map((b) => `${b.type}${b.complete ? '' : '(obra ' + Math.round(b.progress) + ')'}@${b.tx},${b.ty}`);
  console.log('  edifícios:', bl.join(' '));
}
