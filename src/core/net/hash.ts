// Hash determinístico do estado, para detectar dessincronização entre jogadores.
import type { GameState } from '../types';

export function stateHash(state: GameState): number {
  let h = 2166136261 >>> 0;
  const mix = (v: number) => { h ^= (v | 0) >>> 0; h = Math.imul(h, 16777619) >>> 0; };
  mix(state.tick); mix(state.rng.s); mix(state.nextId);
  for (const p of state.players) { mix(Math.floor(p.resources.food)); mix(Math.floor(p.resources.wood)); mix(Math.floor(p.resources.gold)); mix(Math.floor(p.resources.favor * 10)); mix(p.pop); mix(p.age); mix(p.techs.length); }
  for (const u of state.units.values()) { mix(u.id); mix(Math.floor(u.x * 64)); mix(Math.floor(u.y * 64)); mix(Math.floor(u.hp)); mix(u.state.length); }
  for (const b of state.buildings.values()) { mix(b.id); mix(Math.floor(b.hp)); mix(Math.floor(b.progress)); mix(b.queue.length); }
  mix(state.map.nodes.size);
  return h >>> 0;
}
