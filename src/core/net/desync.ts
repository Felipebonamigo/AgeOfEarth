// Relatório de dessincronização (ROADMAP 4.5). A cada 100 ticks os pares trocam, junto com o hash total (stateHash), um hash
// por CATEGORIA e por jogador (mundo; e, de cada jogador: dados do jogador, recursos, unidades, edifícios). Quando o total
// diverge, o relatório diz ONDE — "recursos do jogador 1", "unidades do jogador 0", "mundo" — e guarda um resumo legível do
// estado local no mesmo tick (contagens, somas de vida, recursos); comparar o resumo dos diagnósticos de dois jogadores aponta
// o valor que difere. Nada aqui entra no hash total: o stateHash (e o `hash final` do smoke) não muda.
import type { GameState } from '../types';

/** Versão do formato do detalhamento no fio: [versão, nº de jogadores, mundo, (jogador, recursos, unidades, edifícios) × n]. */
export const HASH_PARTS_VERSION = 1;
/** Maior detalhamento aceito da rede (versão + n + mundo + 4 por jogador; folga para cenários com muitas facções). */
export const MAX_HASH_PARTS = 64;
export type DesyncCategory = 'world' | 'players' | 'resources' | 'units' | 'buildings';
const PER_PLAYER: DesyncCategory[] = ['players', 'resources', 'units', 'buildings'];

const FNV = 2166136261 >>> 0;
const step = (h: number, v: number) => Math.imul((h ^ ((v | 0) >>> 0)) >>> 0, 16777619) >>> 0;
function strHash(h: number, s: string): number { for (let i = 0; i < s.length; i++) h = step(h, s.charCodeAt(i)); return step(h, s.length); }

/** Detalhamento do hash por categoria e jogador (formato do fio; ver HASH_PARTS_VERSION). */
export function stateHashParts(state: GameState): number[] {
  const n = state.players.length;
  const own = (o: number) => (o >= 0 && o < n ? o : -1);   // dono fora da lista (não deveria existir) cai no "mundo"
  let world = FNV;
  const pl = new Array<number>(n).fill(FNV), res = new Array<number>(n).fill(FNV), un = new Array<number>(n).fill(FNV), bu = new Array<number>(n).fill(FNV);
  world = step(world, state.tick); world = step(world, state.rng.s); world = step(world, state.nextId);
  world = step(world, state.ceasefireUntil); world = step(world, state.winner); world = step(world, state.gameOver ? 1 : 0);
  for (const p of state.players) {
    let h = pl[p.id];
    h = step(h, p.age); h = step(h, p.pop); h = step(h, p.popCap); h = step(h, p.alive ? 1 : 0); h = step(h, p.team);
    h = strHash(h, p.god); for (const g of p.minorGods) h = strHash(h, g);
    for (const tc of p.techs) h = strHash(h, tc);
    for (const pw of p.powers) { h = strHash(h, pw.id); h = step(h, pw.used ? 1 : 0); }
    h = step(h, p.revealUntil); h = step(h, p.bronzeUntil); h = step(h, p.wonderVictoryAt); h = step(h, p.titanSpawned ? 1 : 0);
    pl[p.id] = h;
    let r = res[p.id];
    const rs = p.resources;
    r = step(r, Math.floor(rs.food)); r = step(r, Math.floor(rs.wood)); r = step(r, Math.floor(rs.gold)); r = step(r, Math.floor(rs.knowledge)); r = step(r, Math.floor(rs.favor * 10));
    for (const k of ['food', 'wood', 'gold', 'knowledge', 'favor'] as const) r = step(r, Math.floor((p.prices[k] ?? 0) * 100));
    res[p.id] = r;
  }
  for (const u of state.units.values()) {
    const o = own(u.owner);
    let h = o < 0 ? world : un[o];
    h = step(h, u.id); h = strHash(h, u.type); h = step(h, Math.floor(u.x * 64)); h = step(h, Math.floor(u.y * 64)); h = step(h, Math.floor(u.hp));
    h = strHash(h, u.state); h = step(h, u.targetId); h = step(h, u.nodeId); h = step(h, Math.floor(u.carryAmt)); h = step(h, u.inside); h = step(h, u.dead ? 1 : 0);
    if (o < 0) world = h; else un[o] = h;
  }
  for (const b of state.buildings.values()) {
    const o = own(b.owner);
    let h = o < 0 ? world : bu[o];
    h = step(h, b.id); h = strHash(h, b.type); h = step(h, Math.floor(b.hp)); h = step(h, Math.floor(b.progress)); h = step(h, b.complete ? 1 : 0);
    h = step(h, b.queue.length); for (const q of b.queue) { h = strHash(h, q.id); h = step(h, Math.floor(q.elapsed * 10)); }
    h = step(h, b.garrison.length); h = step(h, b.scholars); h = step(h, b.dead ? 1 : 0);
    if (o < 0) world = h; else bu[o] = h;
  }
  const map = state.map;
  world = step(world, map.w); world = step(world, map.h);
  const terrain = map.terrain, n4 = terrain.length & ~3;
  let i = 0;
  for (; i < n4; i += 4) world = step(world, terrain[i] | (terrain[i + 1] << 8) | (terrain[i + 2] << 16) | (terrain[i + 3] << 24));
  for (; i < terrain.length; i++) world = step(world, terrain[i]);
  world = step(world, map.nodes.size);
  for (const nd of map.nodes.values()) { world = step(world, nd.id); world = step(world, Math.floor(nd.amount)); }
  for (const r of state.relics) { world = step(world, Math.floor(r.x * 64)); world = step(world, Math.floor(r.y * 64)); world = step(world, r.carrier); world = step(world, r.templeId); }
  const out = [HASH_PARTS_VERSION, n, world];
  for (let p = 0; p < n; p++) out.push(pl[p], res[p], un[p], bu[p]);
  return out;
}

/** Detalhamento recebido da rede é válido? (array curto de inteiros sem sinal de 32 bits, na versão conhecida) */
export function validHashParts(v: unknown): v is number[] {
  return Array.isArray(v) && v.length >= 3 && v.length <= MAX_HASH_PARTS && v.every((x) => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 0xffffffff)
    && v[0] === HASH_PARTS_VERSION && v.length === 3 + 4 * v[1];
}

/**
 * Categorias em que dois detalhamentos diferem: 'world' ou '<categoria>:<jogador>' (ex.: 'resources:1'). ['?'] quando o par
 * não mandou o detalhamento (cliente antigo) ou mandou outro formato.
 */
export function diffHashParts(mine: number[], theirs: unknown): string[] {
  if (!validHashParts(theirs) || !validHashParts(mine) || theirs[1] !== mine[1]) return ['?'];
  const out: string[] = [];
  if (mine[2] !== theirs[2]) out.push('world');
  for (let p = 0; p < mine[1]; p++) for (let k = 0; k < 4; k++) { const i = 3 + p * 4 + k; if (mine[i] !== theirs[i]) out.push(`${PER_PLAYER[k]}:${p}`); }
  return out;
}

export interface PlayerSummary {
  id: number; name: string; alive: boolean; age: number; pop: number; popCap: number; techs: number;
  resources: Record<string, number>; units: number; unitHp: number; buildings: number; buildingHp: number; queued: number;
}
/** Resumo legível do estado num tick (vai no relatório; os de dois jogadores lado a lado mostram o valor que difere). */
export interface StateSummary { tick: number; rng: number; nextId: number; units: number; buildings: number; nodes: number; nodeAmount: number; players: PlayerSummary[] }

export function summarizeState(state: GameState): StateSummary {
  const players: PlayerSummary[] = state.players.map((p) => ({
    id: p.id, name: p.name, alive: p.alive, age: p.age, pop: p.pop, popCap: p.popCap, techs: p.techs.length,
    resources: Object.fromEntries(Object.entries(p.resources).map(([k, v]) => [k, Math.floor(v * 100) / 100])),
    units: 0, unitHp: 0, buildings: 0, buildingHp: 0, queued: 0,
  }));
  for (const u of state.units.values()) { const s = players[u.owner]; if (s && !u.dead) { s.units++; s.unitHp += Math.floor(u.hp); } }
  for (const b of state.buildings.values()) { const s = players[b.owner]; if (s && !b.dead) { s.buildings++; s.buildingHp += Math.floor(b.hp); s.queued += b.queue.length; } }
  let nodeAmount = 0;
  for (const nd of state.map.nodes.values()) nodeAmount += Math.floor(nd.amount);
  return { tick: state.tick, rng: state.rng.s, nextId: state.nextId, units: state.units.size, buildings: state.buildings.size, nodes: state.map.nodes.size, nodeAmount, players };
}

/** Relatório da primeira dessincronização vista por um NetworkScheduler (vai no "Exportar diagnóstico"). */
export interface DesyncReport {
  tick: number;
  /** Jogador local (-1 = espectador). */
  local: number;
  /** Hash local e [jogador, hash] dos outros pares nesse tick (formato anterior, mantido). */
  mine: number; theirs: [number, number][];
  /** Por jogador com hash diferente do local: categorias que divergem (ver diffHashParts). */
  diverged: { player: number; categories: string[] }[];
  /** Detalhamento local do hash (compare com o `parts` do relatório de outro jogador). */
  parts: number[];
  /** Resumo legível do estado local no tick. */
  summary: StateSummary;
}
