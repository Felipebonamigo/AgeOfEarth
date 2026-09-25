// Economia: custos, pagamento, favor (templos), conhecimento (filósofos), cornucópias, mercado,
// regeneração, atrito territorial e contagem de maravilhas. Roda uma vez por segundo.
import { BASE_ATTRITION, FAVOR_DECAY, FAVOR_PER_WORSHIPPER, KNOWLEDGE_PER_SCHOLAR, MARKET_BASE_PRICE, MARKET_TAX, MARKET_TRADE_LOT, RESOURCES, WONDER_VICTORY_SECONDS, TICK_RATE, type ResourceType } from '../constants';
import { BUILDINGS, UNITS } from '../data';
import type { GameState, Player } from '../types';
import { territoryOwnerAt } from './territory';
import { getUnitStats } from './modifiers';
import { isEnemy } from './queries';

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
    if (def.wonder && b.wonderStart >= 0 && p.wonderVictoryAt < 0) {
      if (state.tick - b.wonderStart >= WONDER_VICTORY_SECONDS * TICK_RATE) p.wonderVictoryAt = state.tick;
    }
  }
  // Regeneração e atrito
  for (const u of state.units.values()) {
    if (u.dead) continue;
    const p = state.players[u.owner];
    const def = UNITS[u.type];
    if (p.mods.player.regen > 0 && u.hp < u.maxHp && state.tick - u.lastDamageTick > 5 * TICK_RATE) u.hp = Math.min(u.maxHp, u.hp + p.mods.player.regen);
    if (def.tags.includes('titan')) continue;
    const owner = territoryOwnerAt(state, u.x, u.y);
    if (owner !== -1 && isEnemy(state, owner, u.owner) && state.players[owner].alive) {
      const rate = (BASE_ATTRITION + state.players[owner].mods.player.attrition) * Math.max(0, 1 - p.mods.player.attritionResist);
      if (rate > 0 && state.tick >= state.ceasefireUntil) {
        u.hp -= rate;
        if (u.hp <= 0) { u.hp = 0; u.dead = true; p.stats.losses++; state.effects.push({ type: 'death', x: u.x, y: u.y, owner: u.owner, ttl: 20, total: 20, data: u.type }); }
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
