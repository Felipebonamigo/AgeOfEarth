// Consultas sobre o estado: nós de recurso, pontos de entrega, edifícios próximos, contagens.
import { NODE_RESOURCE, FARM_GATHERERS, NODE_CAPACITY, NOT_GATHERED, OIL_FROM_AGE, RARE_SET, WELL_NODES, type NodeType, type ResourceType } from '../constants';
import { getRuntime } from './runtime';
import { AGES, BUILDINGS, UNITS } from '../data';
import { t } from '../../i18n';
import type { Building, GameMap, GameState, Player, ResourceNode, Unit } from '../types';
import { distToRect, idx, inBounds, centerFrame, frameCompare } from '../map/grid';

/** Jogadores de times diferentes são inimigos. */
export function isEnemy(state: GameState, a: number, b: number): boolean { return a !== b && state.players[a].team !== state.players[b].team; }
export function isAlly(state: GameState, a: number, b: number): boolean { return a === b || state.players[a].team === state.players[b].team; }

/** Nó de recurso mais próximo (por tipo de recurso ou de nó) dentro de um raio, por busca em anéis no grid. */
export function nearestNodeBy(state: GameState, x: number, y: number, match: (n: ResourceNode) => boolean, maxR = 18, exclude = -1, pred?: (n: ResourceNode) => boolean): ResourceNode | null {
  const map = state.map;
  const cx = Math.floor(x), cy = Math.floor(y);
  let best: ResourceNode | null = null, bestD = Infinity;
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
      if (!match(n)) continue;
      if (nodeAccessTiles(map, n) === 0) continue;   // ex.: árvore no meio do bosque
      if (pred && !pred(n)) continue;
      const d = (tx + 0.5 - x) * (tx + 0.5 - x) + (ty + 0.5 - y) * (ty + 0.5 - y);
      // empate exato de distância: o nó mais longe do centro do mapa e, se ainda empatar, b e a no referencial do ponto
      // voltado ao centro (a ordem da varredura começava pelo norte e dava ao norte e ao sul — ou aos dois lados de uma
      // diagonal — escolhas não espelhadas num mapa simétrico)
      if (d < bestD) { bestD = d; best = n; }
      else if (d === bestD && best) {
        const c = centerDist2(map, n.x + 0.5, n.y + 0.5), bc = centerDist2(map, best.x + 0.5, best.y + 0.5);
        if (c > bc || (c === bc && frameCompare(centerFrame(map, x, y), n.x - best.x, n.y - best.y, 0, 0) < 0)) best = n;
      }
    }
  }
  return best;
}

export function nearestNode(state: GameState, x: number, y: number, want: ResourceType | NodeType, maxR = 18, exclude = -1, pred?: (n: ResourceNode) => boolean): ResourceNode | null {
  const byType = (want as string) in NODE_RESOURCE;
  // busca por recurso nunca devolve raro nem jazida (ninguém os coleta: Mercador e Poço de Petróleo os acham pelo tipo)
  const match = byType ? (n: ResourceNode) => n.type === want : (n: ResourceNode) => NODE_RESOURCE[n.type] === want && !NOT_GATHERED.has(n.type);
  return nearestNodeBy(state, x, y, match, maxR, exclude, pred);
}
export function nearestRareNode(state: GameState, x: number, y: number, maxR = 40, pred?: (n: ResourceNode) => boolean): ResourceNode | null {
  return nearestNodeBy(state, x, y, (n) => RARE_SET.has(n.type), maxR, -1, pred);
}

/** Regra única de "quem pode trabalhar este nó" (comando, ordem e interface). */
export function canWorkNode(player: Player, unitType: string, node: ResourceNode): { ok: boolean; reason?: string } {
  const merchant = UNITS[unitType]?.tags.includes('merchant') ?? false;
  if (WELL_NODES.has(node.type)) return { ok: false, reason: t('err.wellOnly') };
  if (RARE_SET.has(node.type)) return merchant ? { ok: true } : { ok: false, reason: t('err.merchantOnly') };
  if (merchant) return { ok: false, reason: t('err.merchantRare') };
  if (NODE_RESOURCE[node.type] === 'oil' && player.age < OIL_FROM_AGE) return { ok: false, reason: t('err.oilEra', { age: AGES[OIL_FROM_AGE].name }) };
  return { ok: true };
}

/** Nó `type` encostado no anel da pegada (8 vizinhos dos tiles da borda), com quantidade > 0: o de mais quantidade;
 *  empate pelo menor id (só muda qual nó seca primeiro, não o total extraído). */
export function extractorNode(map: GameMap, tx: number, ty: number, w: number, h: number, type: NodeType): ResourceNode | null {
  let best: ResourceNode | null = null;
  for (let y = ty - 1; y <= ty + h; y++) for (let x = tx - 1; x <= tx + w; x++) {
    if (x >= tx && x < tx + w && y >= ty && y < ty + h) continue;
    if (!inBounds(map, x, y)) continue;
    const id = map.nodeAt[idx(map, x, y)];
    if (id === -1) continue;
    const n = map.nodes.get(id);
    if (!n || n.type !== type || n.amount <= 0) continue;
    if (!best || n.amount > best.amount || (n.amount === best.amount && n.id < best.id)) best = n;
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
