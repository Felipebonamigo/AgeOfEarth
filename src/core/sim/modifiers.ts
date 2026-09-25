// Modificadores de jogador: agrega bônus de deus, tecnologias, maravilhas e idade em multiplicadores,
// e calcula os atributos finais de unidades e edifícios (com cache por versão).
import { RESOURCES, type ResourceType } from '../constants';
import { BUILDINGS, MAJOR_GODS, TECHS, UNITS } from '../data';
import type { Effect, EffectMatch, GameState, Player, PlayerMods, PlayerStat } from '../types';
import { getRuntime, type BuildingStats, type UnitStats } from './runtime';

export const PLAYER_STATS: PlayerStat[] = ['territory', 'cityLimit', 'attrition', 'attritionResist', 'favorRate', 'knowledgeRate', 'researchCost', 'buildSpeed', 'trainSpeed', 'popCap', 'los', 'tradeTax', 'regen'];

export function defaultMods(): PlayerMods {
  return {
    gather: { food: 1, wood: 1, gold: 1, knowledge: 1, favor: 1, hunt: 1, farm: 1 },
    player: { territory: 0, cityLimit: 1, attrition: 0, attritionResist: 0, favorRate: 1, knowledgeRate: 1, researchCost: 1, buildSpeed: 1, trainSpeed: 1, popCap: 0, los: 0, tradeTax: 1, regen: 0 },
    unitEffects: [], buildingEffects: [], version: 0,
  };
}

/** Recalcula todos os modificadores do jogador. Chamar sempre que tecnologias, idade, deus ou maravilhas mudarem. */
export function recomputeMods(state: GameState, player: Player): void {
  const mods = defaultMods();
  mods.version = (player.mods?.version ?? 0) + 1;
  const effects: Effect[] = [];
  const god = MAJOR_GODS[player.god];
  if (god) effects.push(...god.bonuses);
  for (const t of player.techs) { const def = TECHS[t]; if (def) effects.push(...def.effects); }
  // Maravilhas concluídas
  for (const b of state.buildings.values()) {
    if (b.owner !== player.id || !b.complete || b.dead) continue;
    if (b.type === 'wonder_zeus') effects.push({ type: 'player', stat: 'favorRate', mult: 1.5 });
    else if (b.type === 'wonder_artemis') effects.push({ type: 'unit', match: { tags: ['myth'] }, stat: 'hp', mult: 1.25 });
    else if (b.type === 'wonder_colossus') { effects.push({ type: 'player', stat: 'territory', add: 4 }); effects.push({ type: 'building', match: 'all', stat: 'hp', mult: 1.2 }); }
  }
  // Dificuldade da IA: bônus/penalidade de coleta
  if (player.isAI) {
    const g = { easy: 0.75, normal: 1.0, hard: 1.3 }[player.difficulty] ?? 1;
    effects.push({ type: 'gather', resource: 'all', mult: g });
  }
  for (const e of effects) {
    if (e.type === 'gather') {
      if (e.resource === 'all') for (const r of RESOURCES) mods.gather[r] *= e.mult;
      else mods.gather[e.resource] *= e.mult;
    } else if (e.type === 'player') {
      if (e.mult !== undefined) mods.player[e.stat] *= e.mult;
      if (e.add !== undefined) mods.player[e.stat] += e.add;
    } else if (e.type === 'unit' || e.type === 'cost') mods.unitEffects.push(e);
    else if (e.type === 'building') mods.buildingEffects.push(e);
  }
  player.mods = mods;
  getRuntime(state).statsCache.delete(player.id);
}

function matches(match: EffectMatch, id: string, tags: string[]): boolean {
  if (match === 'all') return true;
  if (match === 'buildings') return false;
  if (match.types && match.types.includes(id)) return true;
  if (match.tags) for (const t of match.tags) if (tags.includes(t)) return true;
  return false;
}

export function getUnitStats(state: GameState, player: Player, type: string): UnitStats {
  const rt = getRuntime(state);
  let cache = rt.statsCache.get(player.id);
  if (!cache || cache.version !== player.mods.version) { cache = { version: player.mods.version, units: new Map(), buildings: new Map() }; rt.statsCache.set(player.id, cache); }
  const hit = cache.units.get(type);
  if (hit) return hit;
  const def = UNITS[type];
  const s: UnitStats = {
    hp: def.hp, attack: def.attack, armor: { ...def.armor }, range: def.range, speed: def.speed, los: def.los + player.mods.player.los,
    cost: { ...def.cost } as Record<string, number>, trainTime: def.trainTime / player.mods.player.trainSpeed, splash: def.splash ?? 0,
  };
  let costMult = 1;
  for (const e of player.mods.unitEffects) {
    if (e.type === 'cost') { if (matches(e.match, type, def.tags)) costMult *= e.mult; continue; }
    if (e.type !== 'unit' || !matches(e.match, type, def.tags)) continue;
    applyStat(s as unknown as Record<string, unknown>, e.stat, e.mult, e.add);
  }
  for (const k of Object.keys(s.cost)) s.cost[k] = Math.round(s.cost[k] * costMult);
  s.armor.hack = Math.min(0.9, s.armor.hack); s.armor.pierce = Math.min(0.9, s.armor.pierce); s.armor.crush = Math.min(0.9, s.armor.crush);
  s.hp = Math.round(s.hp); s.attack = Math.round(s.attack * 10) / 10;
  cache.units.set(type, s);
  return s;
}

export function getBuildingStats(state: GameState, player: Player, type: string): BuildingStats {
  const rt = getRuntime(state);
  let cache = rt.statsCache.get(player.id);
  if (!cache || cache.version !== player.mods.version) { cache = { version: player.mods.version, units: new Map(), buildings: new Map() }; rt.statsCache.set(player.id, cache); }
  const hit = cache.buildings.get(type);
  if (hit) return hit;
  const def = BUILDINGS[type];
  const s: BuildingStats = {
    hp: def.hp, attack: def.attack ?? 0, range: def.range ?? 0, los: (def.los ?? 6) + player.mods.player.los,
    cost: { ...def.cost } as Record<string, number>, buildTime: def.buildTime, territory: def.territory ? def.territory + player.mods.player.territory : 0,
  };
  for (const e of player.mods.buildingEffects) {
    if (e.type !== 'building' || !matches(e.match, type, [])) continue;
    applyStat(s as unknown as Record<string, unknown>, e.stat, e.mult, e.add);
  }
  for (const e of player.mods.unitEffects) if (e.type === 'cost' && e.match === 'buildings') for (const k of Object.keys(s.cost)) s.cost[k] = Math.round(s.cost[k] * e.mult);
  s.hp = Math.round(s.hp);
  cache.buildings.set(type, s);
  return s;
}

function applyStat(obj: Record<string, unknown>, stat: string, mult?: number, add?: number) {
  const parts = stat.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] as Record<string, unknown>;
  const key = parts[parts.length - 1];
  const cur = o[key] as number;
  if (typeof cur !== 'number') return;
  let v = cur;
  if (mult !== undefined) v *= mult;
  if (add !== undefined) v += add;
  o[key] = v;
}

export function techCost(player: Player, techId: string): Record<string, number> {
  const def = TECHS[techId];
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(def.cost)) out[k] = Math.round((v as number) * player.mods.player.researchCost);
  return out;
}

export function resourceKeys(cost: Record<string, number>): ResourceType[] { return Object.keys(cost) as ResourceType[]; }
