// Modificadores de jogador: agrega bônus de deus, tecnologias, maravilhas e idade em multiplicadores,
// e calcula os atributos finais de unidades e edifícios (com cache por versão).
import { RESOURCES, DIFFICULTIES, VETERAN_BONUS, TITAN_ERA_ATTACK, TITAN_ERA_HP, rankOf, type ResourceType } from '../constants';
import { eraMythOn } from './restrictions';
import type { Unit } from '../types';
import { BUILDINGS, MAJOR_GODS, RARES, TECHS, UNITS } from '../data';
import type { Effect, EffectMatch, GameState, Player, PlayerMods, PlayerStat } from '../types';
import { getRuntime, type BuildingStats, type UnitStats } from './runtime';

export const PLAYER_STATS: PlayerStat[] = ['territory', 'cityLimit', 'attrition', 'attritionResist', 'favorRate', 'knowledgeRate', 'researchCost', 'buildSpeed', 'trainSpeed', 'popCap', 'los', 'tradeTax', 'regen', 'tradeIncome', 'seaTradeIncome', 'enemySpeed', 'territoryRegen', 'veteranRate', 'studySlots', 'coastSight'];

export function defaultMods(): PlayerMods {
  return {
    gather: { food: 1, wood: 1, stone: 1, gold: 1, oil: 1, knowledge: 1, favor: 1, hunt: 1, farm: 1, fish: 1 },
    player: { territory: 0, cityLimit: 1, attrition: 0, attritionResist: 0, favorRate: 1, knowledgeRate: 1, researchCost: 1, buildSpeed: 1, trainSpeed: 1, popCap: 0, los: 0, tradeTax: 1, regen: 0, tradeIncome: 1, seaTradeIncome: 1, enemySpeed: 1, territoryRegen: 0, veteranRate: 1, studySlots: 0, coastSight: 0 },
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
  // E6: os Titãs chegam na Era VIII diante de exércitos de pólvora e aço (docs/eras/E6, D20); campanha e cenários sem isso
  if (eraMythOn(state)) effects.push({ type: 'unit', match: { tags: ['titan'] }, stat: 'hp', mult: TITAN_ERA_HP }, { type: 'unit', match: { tags: ['titan'] }, stat: 'attack', mult: TITAN_ERA_ATTACK });
  for (const t of player.techs) { const def = TECHS[t]; if (def) effects.push(...def.effects); }
  for (const r of player.rares ?? []) { const d = RARES[r]; if (d) effects.push(...d.effects); }   // E2: raros ocupados por um Mercador
  // Maravilhas concluídas (efeitos nos dados: BuildingDef.wonderEffects)
  for (const b of state.buildings.values()) {
    if (b.owner !== player.id || !b.complete || b.dead) continue;
    const we = BUILDINGS[b.type].wonderEffects;
    if (we) effects.push(...we);
  }
  // Dificuldade da IA: bônus/penalidade de coleta
  if (player.isAI) {
    const g = DIFFICULTIES[player.difficulty]?.gather ?? 1;
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

/** Atualiza maxHp de unidades e edifícios após mudanças de modificadores (mantém a fração de vida). */
export function refreshMaxHp(state: GameState, player: Player): void {
  for (const u of state.units.values()) {
    if (u.owner !== player.id || u.dead) continue;
    const target = unitMaxHp(state, player, u);
    if (target !== u.maxHp) { const frac = u.hp / u.maxHp; u.maxHp = target; u.hp = Math.round(target * frac); }
  }
  for (const b of state.buildings.values()) {
    if (b.owner !== player.id || b.dead) continue;
    const st = getBuildingStats(state, player, b.type);
    if (st.hp !== b.maxHp) { const frac = b.hp / b.maxHp; b.maxHp = st.hp; b.hp = Math.round(st.hp * frac); }
  }
}

/** E7: patente por abates (o Estádio Panatenaico dobra o ritmo: veteranRate). */
export function unitRank(state: GameState, u: Unit): number { return rankOf(u.kills * (state.players[u.owner]?.mods.player.veteranRate ?? 1)); }

/** Vida máxima de uma unidade: estatística do tipo × bônus de veterania (patente por abates). */
export function unitMaxHp(state: GameState, player: Player, u: Unit): number {
  const base = getUnitStats(state, player, u.type).hp;
  const def = UNITS[u.type];
  const vet = def.tags.includes('military') && !def.tags.includes('titan') ? unitRank(state, u) : 0;
  return Math.round(base * (1 + VETERAN_BONUS * vet));
}

export function techCost(player: Player, techId: string): Record<string, number> {
  const def = TECHS[techId];
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(def.cost)) out[k] = Math.round((v as number) * player.mods.player.researchCost);
  return out;
}

export function resourceKeys(cost: Record<string, number>): ResourceType[] { return Object.keys(cost) as ResourceType[]; }
