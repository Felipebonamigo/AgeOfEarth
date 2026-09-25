// Hash determinístico do estado, para detectar dessincronização entre jogadores.
// Inclui o terreno inteiro e os nós de recurso (id e quantidade): um mapa fixo divergente ou uma coleta
// divergente aparece já no primeiro hash trocado (tick 100). Custo medido num mapa médio (112×112, ~1,9 k nós): ~0,04 ms.
import type { GameState } from '../types';

export function stateHash(state: GameState): number {
  let h = 2166136261 >>> 0;
  const mix = (v: number) => { h ^= (v | 0) >>> 0; h = Math.imul(h, 16777619) >>> 0; };
  mix(state.tick); mix(state.rng.s); mix(state.nextId);
  for (const p of state.players) { mix(Math.floor(p.resources.food)); mix(Math.floor(p.resources.wood)); mix(Math.floor(p.resources.gold)); mix(Math.floor(p.resources.favor * 10)); mix(p.pop); mix(p.age); mix(p.techs.length); }
  for (const u of state.units.values()) { mix(u.id); mix(Math.floor(u.x * 64)); mix(Math.floor(u.y * 64)); mix(Math.floor(u.hp)); mix(u.state.length); }
  for (const b of state.buildings.values()) { mix(b.id); mix(Math.floor(b.hp)); mix(Math.floor(b.progress)); mix(b.queue.length); }
  const map = state.map;
  mix(map.w); mix(map.h);
  // Terreno inteiro, 4 bytes por mistura (~0,04 ms num mapa 112×112; byte a byte custava ~0,14 ms)
  const terrain = map.terrain;
  const n4 = terrain.length & ~3;
  let i = 0;
  for (; i < n4; i += 4) mix(terrain[i] | (terrain[i + 1] << 8) | (terrain[i + 2] << 16) | (terrain[i + 3] << 24));
  for (; i < terrain.length; i++) mix(terrain[i]);
  mix(map.nodes.size);
  for (const n of map.nodes.values()) { mix(n.id); mix(Math.floor(n.amount)); }
  return h >>> 0;
}
