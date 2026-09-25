// Condições de vitória: conquista (eliminar todos) ou maravilha mantida por 6 minutos.
import { BUILDINGS } from '../data';
import type { GameState } from '../types';

export function checkVictory(state: GameState): void {
  if (state.gameOver) return;
  for (const p of state.players) {
    if (!p.alive) continue;
    let hasBuilding = false, hasVillager = false;
    for (const b of state.buildings.values()) if (b.owner === p.id && !b.dead && !BUILDINGS[b.type].wall && !BUILDINGS[b.type].farm) { hasBuilding = true; break; }
    if (!hasBuilding) for (const u of state.units.values()) if (u.owner === p.id && !u.dead && u.type === 'villager') { hasVillager = true; break; }
    if (!hasBuilding && !hasVillager) {
      p.alive = false; p.defeatedTick = state.tick;
      state.events.push({ tick: state.tick, type: 'defeated', player: p.id, text: `${p.name} foi eliminado!` });
      // unidades restantes do derrotado desaparecem
      for (const u of state.units.values()) if (u.owner === p.id && !u.dead) { u.dead = true; state.effects.push({ type: 'death', x: u.x, y: u.y, owner: p.id, ttl: 20, total: 20, data: u.type }); }
    }
  }
  const alive = state.players.filter((p) => p.alive);
  const teams = new Set(alive.map((p) => p.team));
  if (alive.length === 0) { state.gameOver = true; state.winner = -1; return; }
  if (teams.size === 1 && state.players.length > 1) {
    const w = alive.find((p) => !p.isAI) ?? alive[0];
    state.gameOver = true; state.winner = w.id;
    state.events.push({ tick: state.tick, type: 'victory', player: w.id, text: alive.length > 1 ? `A aliança de ${alive.map((p) => p.name).join(' e ')} venceu por conquista!` : `${w.name} venceu por conquista!` });
    return;
  }
  for (const p of alive) if (p.wonderVictoryAt >= 0) {
    state.gameOver = true; state.winner = p.id;
    state.events.push({ tick: state.tick, type: 'victory', player: p.id, text: `${p.name} venceu pela Maravilha!` });
    return;
  }
}
