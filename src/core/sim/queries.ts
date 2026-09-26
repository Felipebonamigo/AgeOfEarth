// Consultas sobre o estado: nós de recurso, pontos de entrega, edifícios próximos, contagens.
import { NODE_RESOURCE, FARM_GATHERERS, NODE_CAPACITY, type NodeType, type ResourceType } from '../constants';
import { getRuntime } from './runtime';
import { BUILDINGS, UNITS } from '../data';
import type { Building, GameMap, GameState, ResourceNode, Unit } from '../types';
import { distToRect, idx, inBounds } from '../map/grid';

/** Jogadores de times diferentes são inimigos. */
export function isEnemy(state: GameState, a: number, b: number): boolean { return a !== b && state.players[a].team !== state.players[b].team; }
export function isAlly(state: GameState, a: number, b: number): boolean { return a === b || state.players[a].team === state.players[b].team; }

/** Nó de recurso mais próximo (por tipo de recurso ou de nó) dentro de um raio, por busca em anéis no grid. */
export function nearestNode(state: GameState, x: number, y: number, want: ResourceType | NodeType, maxR = 18, exclude = -1, pred?: (n: ResourceNode) => boolean): ResourceNode | null {
  const map = state.map;
  const cx = Math.floor(x), cy = Math.floor(y);
  let best: ResourceNode | null = null, bestD = Infinity;
  const isResource = (want as string) in NODE_RESOURCE ? false : true;
  for (let r = 0; r <= maxR; r++) {
    if (best && bestD < r - 1) break;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      const tx = cx + dx, ty = cy + dy;
      if (!inBounds(map, tx, ty)) continue;
      const id = map.nodeAt[idx(map, tx, ty)];
      if (id === -1 || id === exclude) continue;
      const n = map.nodes.get(id);
      if (!n || n.amount <= 0) continue;
      if (isResource ? NODE_RESOURCE[n.type] !== want : n.type !== want) continue;
      if (nodeAccessTiles(map, n) === 0) continue;   // ex.: árvore no meio do bosque
      if (pred && !pred(n)) continue;
      const d = (tx + 0.5 - x) * (tx + 0.5 - x) + (ty + 0.5 - y) * (ty + 0.5 - y);
      // empate exato de distância: o nó mais longe do centro do mapa (a ordem da varredura começava pelo norte e dava
      // ao norte e ao sul escolhas não espelhadas num mapa simétrico)
      if (d < bestD || (d === bestD && best && centerDist2(map, n.x + 0.5, n.y + 0.5) > centerDist2(map, best.x + 0.5, best.y + 0.5))) { bestD = d; best = n; }
    }
  }
  return best;
}

/** Distância² ao centro do mapa: desempate invariante a espelho e rotação (não favorece norte/sul nem leste/oeste). */
export function centerDist2(map: GameMap, x: number, y: number): number { const dx = x - map.w / 2, dy = y - map.h / 2; return dx * dx + dy * dy; }

/** Nº de coletores designados a um nó neste tick. */
export function nodeGatherers(state: GameState, nodeId: number): number { return getRuntime(state).nodeGatherers.get(nodeId) ?? 0; }
/** Nº de tiles vizinhos (8) do nó onde uma unidade terrestre pode ficar; 0 = inacessível por enquanto. */
export function nodeAccessTiles(map: GameMap, n: ResourceNode): number {
  let c = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const x = n.x + dx, y = n.y + dy;
    if (inBounds(map, x, y) && map.blocked[idx(map, x, y)] === 0) c++;
  }
  return c;
}
/** Capacidade efetiva de coletores: limitada pelos tiles de acesso (um nó com 1 tile livre comporta 1 coletor). */
export function nodeCapacity(state: GameState, n: ResourceNode): number { return Math.min(NODE_CAPACITY[n.type], nodeAccessTiles(state.map, n)); }
export function nodeHasRoom(state: GameState, n: ResourceNode): boolean { return nodeGatherers(state, n.id) < nodeCapacity(state, n); }
/** Nó mais próximo do mesmo recurso com vaga (usado para espalhar coletores por um agrupamento). */
export function nearestNodeWithRoom(state: GameState, x: number, y: number, want: ResourceType | NodeType, maxR = 18, exclude = -1, avoid?: number[]): ResourceNode | null {
  return nearestNode(state, x, y, want, maxR, exclude, (n) => nodeHasRoom(state, n) && !(avoid && avoid.includes(n.id)));
}

export function farmGatherers(state: GameState, farmId: number): number {
  let n = 0;
  for (const u of state.units.values()) if (!u.dead && u.nodeId === -farmId && (u.state === 'gather' || u.state === 'return')) n++;
  return n;
}
/** Id do agricultor titular da fazenda (o primeiro na ordem de criação); os demais são excedentes. */
export function farmPrimary(state: GameState, farmId: number): number {
  for (const u of state.units.values()) if (!u.dead && u.nodeId === -farmId && (u.state === 'gather' || u.state === 'return')) return u.id;
  return -1;
}

/** Fazenda concluída do jogador com vaga, mais próxima. */
export function nearestFreeFarm(state: GameState, owner: number, x: number, y: number, maxR = 20, avoid?: number[]): Building | null {
  let best: Building | null = null, bestD = Infinity;
  for (const b of state.buildings.values()) {
    if (b.owner !== owner || b.dead || !b.complete || !BUILDINGS[b.type].farm) continue;
    if (avoid && avoid.includes(b.id)) continue;
    const d = distToRect(x, y, b.tx, b.ty, b.w, b.h);
    if (d > maxR || d >= bestD) continue;
    if (farmGatherers(state, b.id) >= FARM_GATHERERS) continue;
    bestD = d; best = b;
  }
  return best;
}

export function nearestDropoff(state: GameState, owner: number, x: number, y: number, resource: ResourceType, avoid?: number[]): Building | null {
  let best: Building | null = null, bestD = Infinity;
  for (const b of state.buildings.values()) {
    if (b.owner !== owner || b.dead || !b.complete) continue;
    if (avoid && avoid.includes(b.id)) continue;
    const def = BUILDINGS[b.type];
    if (!def.dropoff || !def.dropoff.includes(resource)) continue;
    const d = distToRect(x, y, b.tx, b.ty, b.w, b.h);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

export function nearestBuilding(state: GameState, owner: number, x: number, y: number, pred: (b: Building) => boolean, maxR = Infinity): Building | null {
  let best: Building | null = null, bestD = maxR;
  for (const b of state.buildings.values()) {
    if (b.owner !== owner || b.dead || !pred(b)) continue;
    const d = distToRect(x, y, b.tx, b.ty, b.w, b.h);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

export function nearestEnemyBuilding(state: GameState, owner: number, x: number, y: number, pred?: (b: Building) => boolean): Building | null {
  let best: Building | null = null, bestD = Infinity;
  for (const b of state.buildings.values()) {
    if (!isEnemy(state, owner, b.owner) || b.dead || (pred && !pred(b))) continue;
    if (!state.players[b.owner].alive) continue;
    const d = distToRect(x, y, b.tx, b.ty, b.w, b.h);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

export function countUnits(state: GameState, owner: number, pred: (u: Unit) => boolean = () => true): number {
  let n = 0;
  for (const u of state.units.values()) if (u.owner === owner && !u.dead && pred(u)) n++;
  return n;
}

export function isMilitary(u: Unit): boolean { const d = UNITS[u.type]; return d.tags.includes('military') && !d.tags.includes('scout') && d.attack > 0; }
export function isVillager(u: Unit): boolean { return u.type === 'villager'; }

export function entityById(state: GameState, id: number): Unit | Building | undefined {
  return state.units.get(id) ?? state.buildings.get(id);
}

/** Distância entre uma unidade e uma entidade (borda do retângulo para edifícios, centro para unidades). */
export function distanceTo(u: { x: number; y: number }, target: Unit | Building): number {
  if (target.kind === 'building') return distToRect(u.x, u.y, target.tx, target.ty, target.w, target.h);
  const dx = u.x - target.x, dy = u.y - target.y;
  return Math.sqrt(dx * dx + dy * dy);
}
