// Economia: custos, pagamento, favor (templos), conhecimento (filósofos), cornucópias, mercado,
// regeneração, atrito territorial e contagem de maravilhas. Roda uma vez por segundo.
import { BASE_ATTRITION, FAVOR_DECAY, FAVOR_PER_WORSHIPPER, KNOWLEDGE_PER_SCHOLAR, MARKET_BASE_PRICE, MARKET_TAX, MARKET_TRADE_LOT, NODE_RESOURCE, OIL_FROM_AGE, RARE_GOLD_RATE, RARE_SET, RESOURCES, WONDER_VICTORY_SECONDS, TICK_RATE, GARRISON_HEAL, type ResourceType } from '../constants';
import { BUILDINGS, UNITS } from '../data';
import type { GameState, Player, QueueItem, Unit } from '../types';
import { distToRect } from '../map/grid';
import { removeNode } from '../map/mapgen';
import { territoryOwnerAt } from './territory';
import { getUnitStats, recomputeMods, refreshMaxHp, techCost } from './modifiers';
import { extractorNode, isEnemy } from './queries';
import { clampToFloor, killUnit } from './combat';
import { AGES } from '../data';
import { SCHOLAR_COST } from '../constants';

export function canAfford(player: Player, cost: Record<string, number>): boolean {
  for (const [k, v] of Object.entries(cost)) if ((player.resources[k as ResourceType] ?? 0) < v) return false;
  return true;
}
export function pay(player: Player, cost: Record<string, number>): void {
  for (const [k, v] of Object.entries(cost)) player.resources[k as ResourceType] -= v;
}
export function refund(player: Player, cost: Record<string, number>, frac = 1): void {
  for (const [k, v] of Object.entries(cost)) player.resources[k as ResourceType] += v * frac;
}
/** Custo pago por um item da fila (reembolso ao cancelar/destruir): o valor guardado ao enfileirar ou, em saves antigos, o custo atual. */
export function queueItemCost(state: GameState, player: Player, item: QueueItem): Record<string, number> {
  if (item.paid) return item.paid;
  if (item.kind === 'unit') return getUnitStats(state, player, item.id).cost;
  if (item.kind === 'tech') return techCost(player, item.id);
  if (item.kind === 'scholar') return SCHOLAR_COST as Record<string, number>;
  return (AGES[player.age + 1]?.cost ?? {}) as Record<string, number>;
}
export function missingResources(player: Player, cost: Record<string, number>): ResourceType[] {
  const out: ResourceType[] = [];
  for (const [k, v] of Object.entries(cost)) if ((player.resources[k as ResourceType] ?? 0) < v) out.push(k as ResourceType);
  return out;
}

/** Processamento econômico de 1 segundo de jogo. */
export function economySecond(state: GameState): void {
  const map = state.map;
  // Devotos por templo
  const worship = new Map<number, number>();
  for (const u of state.units.values()) {
    if (u.dead || u.state !== 'pray' || u.nodeId >= 0) continue;
    const templeId = -u.nodeId;
    worship.set(templeId, (worship.get(templeId) ?? 0) + 1);
  }
  for (const b of state.buildings.values()) {
    if (b.dead || !b.complete) continue;
    const def = BUILDINGS[b.type];
    const p = state.players[b.owner];
    if (def.worship) {
      const n = worship.get(b.id) ?? 0;
      if (n > 0) {
        // Devotos estão adjacentes ao templo? (o estado 'pray' já implica estar adjacente)
        let rate = 0, k = FAVOR_PER_WORSHIPPER;
        for (let i = 0; i < n; i++) { rate += k; k *= FAVOR_DECAY; }
        const gain = rate * p.mods.player.favorRate * p.mods.gather.favor;
        p.resources.favor += gain; p.stats.gathered.favor += gain;
      }
    }
    if (def.scholars && b.scholars > 0) {
      const gain = b.scholars * KNOWLEDGE_PER_SCHOLAR * p.mods.player.knowledgeRate * p.mods.gather.knowledge;
      p.resources.knowledge += gain; p.stats.gathered.knowledge += gain;
    }
    if (def.plenty) { p.resources.food += 1.5; p.resources.wood += 1.5; p.resources.gold += 1.5; }
    if (def.extract) {
      const n = extractorNode(map, b.tx, b.ty, b.w, b.h, def.extract.node);
      if (n) {
        const take = Math.min(def.extract.rate * p.mods.gather[NODE_RESOURCE[n.type]], n.amount);
        n.amount -= take;
        p.resources[NODE_RESOURCE[n.type]] += take; p.stats.gathered[NODE_RESOURCE[n.type]] += take;
        if (n.amount <= 0.001) {
          removeNode(map, n.id);
          state.effects.push({ type: 'nodeGone', x: n.x + 0.5, y: n.y + 0.5, ttl: 6, total: 6, data: n.type });
        }
      }
    }
    if (def.wonder && b.wonderStart >= 0 && p.wonderVictoryAt < 0) {
      if (state.tick - b.wonderStart >= WONDER_VICTORY_SECONDS * TICK_RATE) p.wonderVictoryAt = state.tick;
    }
  }
  // Raros ocupados (E2): em cada raro, o Mercador de MENOR id em 'gather' nele e ao lado (distância à borda do tile ≤ 1)
  // rende RARE_GOLD_RATE de ouro por segundo ao dono e conta o tipo do raro para o bônus; outros no mesmo nó não rendem
  const holder = new Map<number, Unit>();
  for (const u of state.units.values()) {
    if (u.dead || u.state !== 'gather' || u.nodeId <= 0 || !UNITS[u.type].tags.includes('merchant')) continue;
    const n = map.nodes.get(u.nodeId);
    if (!n || !RARE_SET.has(n.type) || distToRect(u.x, u.y, n.x, n.y, 1, 1) > 1) continue;
    const h = holder.get(n.id);
    if (!h || u.id < h.id) holder.set(n.id, u);
  }
  const occ: string[][] = state.players.map(() => []);
  for (const [nodeId, u] of holder) {
    const n = map.nodes.get(nodeId)!, p = state.players[u.owner];
    const g = RARE_GOLD_RATE * p.mods.gather.gold;
    p.resources.gold += g; p.stats.gathered.gold += g;
    if (!occ[u.owner].includes(n.type)) occ[u.owner].push(n.type);
  }
  for (const p of state.players) {
    const next = occ[p.id].sort();
    if (next.join(',') === p.rares.join(',')) continue;
    p.rares = next; recomputeMods(state, p); refreshMaxHp(state, p);
  }
  // Regeneração e atrito
  for (const u of state.units.values()) {
    if (u.dead) continue;
    const p = state.players[u.owner];
    const def = UNITS[u.type];
    if (u.inside !== -1) { if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + GARRISON_HEAL); continue; }
    if (p.mods.player.regen > 0 && u.hp < u.maxHp && state.tick - u.lastDamageTick > 5 * TICK_RATE) u.hp = Math.min(u.maxHp, u.hp + p.mods.player.regen);
    if (def.tags.includes('titan')) continue;
    const owner = territoryOwnerAt(state, u.x, u.y);
    if (owner !== -1 && isEnemy(state, owner, u.owner) && state.players[owner].alive) {
      const rate = (BASE_ATTRITION + state.players[owner].mods.player.attrition) * Math.max(0, 1 - p.mods.player.attritionResist);
      if (rate > 0 && state.tick >= state.ceasefireUntil) {
        const before = u.hp;
        u.hp -= rate;
        clampToFloor(u, before);   // G9: piso de vida roteirizado
        if (u.hp <= 0) killUnit(state, u, owner);   // via killUnit: recalcula população, estatísticas, sombras e eventos
      }
    }
  }
  // Preços de mercado voltam lentamente ao equilíbrio
  for (const p of state.players) for (const r of RESOURCES) {
    if (r === 'knowledge' || r === 'favor' || r === 'gold') continue;
    p.prices[r] += (MARKET_BASE_PRICE - p.prices[r]) * 0.01;
  }
}

export function marketTrade(state: GameState, player: Player, action: 'buy' | 'sell', resource: ResourceType): boolean {
  if (resource === 'gold' || resource === 'knowledge' || resource === 'favor') return false;
  if (resource === 'oil' && player.age < OIL_FROM_AGE) return false;
  const tax = MARKET_TAX * player.mods.player.tradeTax;
  const price = player.prices[resource];
  if (action === 'sell') {
    if (player.resources[resource] < MARKET_TRADE_LOT) return false;
    player.resources[resource] -= MARKET_TRADE_LOT;
    player.resources.gold += Math.round(price * (1 - tax));
    player.prices[resource] = Math.max(20, price * 0.94);
  } else {
    const cost = Math.round(price * (1 + tax));
    if (player.resources.gold < cost) return false;
    player.resources.gold -= cost;
    player.resources[resource] += MARKET_TRADE_LOT;
    player.prices[resource] = Math.min(600, price * 1.06);
  }
  return true;
}

export function gatherRateFor(state: GameState, player: Player, unitType: string): number {
  // Reservado para bônus por unidade (ex.: cidadãos especiais). Mantido para extensão.
  void state; void player; void unitType;
  return 1;
}

export function unitCost(state: GameState, player: Player, type: string): Record<string, number> {
  return getUnitStats(state, player, type).cost;
}
