// Combate: aquisição de alvos, cálculo de dano (tipos de ataque x armadura x bônus por tag),
// habilidades especiais (petrificação, cabeças da Hidra, dano em área) e morte de unidades/edifícios.
import { TICK_RATE } from '../constants';
import { BUILDINGS, UNITS } from '../data';
import type { Building, GameState, Unit } from '../types';
import { idx } from '../map/grid';
import { getBuildingStats, getUnitStats } from './modifiers';
import { getRuntime } from './runtime';
import { distanceTo, isEnemy } from './queries';
import { recomputePop, spawnUnit } from './entities';

export const ATTACK_INTERVAL: Record<string, number> = { villager: 1.0, scout: 1.0, infantry: 1.0, archer: 1.5, skirmisher: 1.2, cavalry: 1.1, siege: 3.0, hero: 1.1, myth: 1.5, titan: 2.0, building: 2.0 };

export function attackInterval(attacker: Unit | Building): number {
  if (attacker.kind === 'building') return ATTACK_INTERVAL.building;
  return ATTACK_INTERVAL[UNITS[attacker.type].cls] ?? 1.2;
}

function isMelee(state: GameState, attacker: Unit | Building): boolean {
  if (attacker.kind === 'building') return false;
  return getUnitStats(state, state.players[attacker.owner], attacker.type).range < 1.6;
}

export function canTarget(state: GameState, attacker: Unit | Building, target: Unit | Building): boolean {
  if (target.dead) return false;
  if (!isEnemy(state, attacker.owner, target.owner)) return false;
  if (!state.players[target.owner].alive) return false;
  if (target.kind === 'unit' && UNITS[target.type].flying && isMelee(state, attacker)) return false;
  if (attacker.kind === 'unit' && UNITS[attacker.type].attack <= 0) return false;
  return true;
}

/** Procura o melhor alvo dentro de um raio: unidades inimigas primeiro (mais próxima), depois edifícios. */
export function acquireTarget(state: GameState, attacker: Unit | Building, range: number, includeBuildings: boolean, buildingRange = range): Unit | Building | null {
  const rt = getRuntime(state);
  let best: Unit | null = null, bestD = Infinity;
  const ax = attacker.x, ay = attacker.y;
  const attackerIsSiege = attacker.kind === 'unit' && UNITS[attacker.type].cls === 'siege';
  rt.hash.each(ax, ay, range, (u) => {
    if (u.dead || !isEnemy(state, attacker.owner, u.owner)) return;
    if (!canTarget(state, attacker, u)) return;
    const d = distanceTo(attacker, u);
    if (d > range) return;
    // prioriza quem está nos atacando / unidades militares sobre civis
    let score = d;
    if (u.targetId === attacker.id) score -= 3;
    if (UNITS[u.type].tags.includes('civilian')) score += 2;
    if (attackerIsSiege) score += 4;
    if (score < bestD) { bestD = score; best = u; }
  });
  if (best && !(attackerIsSiege && includeBuildings)) return best;
  if (!includeBuildings) return best;
  let bestB: Building | null = null, bestBD = attackerIsSiege ? Infinity : bestD;
  for (const b of state.buildings.values()) {
    if (b.dead || !isEnemy(state, attacker.owner, b.owner) || !canTarget(state, attacker, b)) continue;
    const d = distanceTo(attacker, b);
    if (d > buildingRange) continue;
    let score = d;
    if (BUILDINGS[b.type].wall) score += 6;
    if (score < bestBD) { bestBD = score; bestB = b; }
  }
  return bestB ?? best;
}

export function computeDamage(state: GameState, attacker: Unit | Building, target: Unit | Building): number {
  const tp = state.players[target.owner];
  let attack: number, attackType: string, bonus: Record<string, number> = {};
  if (attacker.kind === 'unit') {
    const st = getUnitStats(state, state.players[attacker.owner], attacker.type);
    const def = UNITS[attacker.type];
    attack = st.attack; attackType = def.attackType; bonus = def.bonus;
    if (def.special === 'heads') attack *= 1 + 0.2 * (attacker.heads - 1);
  } else {
    const st = getBuildingStats(state, state.players[attacker.owner], attacker.type);
    attack = st.attack; attackType = BUILDINGS[attacker.type].attackType ?? 'pierce';
  }
  let armor: { hack: number; pierce: number; crush: number };
  let tags: string[];
  if (target.kind === 'unit') { armor = getUnitStats(state, tp, target.type).armor; tags = UNITS[target.type].tags; }
  else { armor = BUILDINGS[target.type].armor; tags = ['building']; }
  let mult = 1;
  for (const [tag, m] of Object.entries(bonus)) if (tags.includes(tag) && m > mult) mult = m;
  let reduction: number;
  if (attackType === 'divine') reduction = Math.min(armor.hack, armor.pierce) * 0.5;
  else reduction = armor[attackType as 'hack' | 'pierce' | 'crush'] ?? 0;
  if (target.kind === 'unit' && state.tick < tp.bronzeUntil) reduction = Math.min(0.9, reduction + 0.3);
  return Math.max(1, attack * mult * (1 - reduction));
}

export function applyDamage(state: GameState, target: Unit | Building, dmg: number, attackerOwner: number, attacker?: Unit | Building): void {
  if (target.dead) return;
  target.hp -= dmg;
  target.lastDamageTick = state.tick;
  const victim = state.players[target.owner];
  // Alerta "sob ataque" para o jogador (limitado)
  if (!victim.isAI) {
    const key = `attack:${Math.floor(target.x / 12)}:${Math.floor(target.y / 12)}`;
    const recent = state.events.some((e) => e.type === 'underAttack' && e.player === target.owner && e.data === key && state.tick - e.tick < 15 * TICK_RATE);
    if (!recent) state.events.push({ tick: state.tick, type: 'underAttack', player: target.owner, x: target.x, y: target.y, data: key, text: target.kind === 'building' ? `${BUILDINGS[target.type].name} sob ataque!` : `${UNITS[target.type].name} sob ataque!` });
  }
  if (target.hp <= 0) {
    target.hp = 0;
    if (target.kind === 'unit') killUnit(state, target, attackerOwner, attacker);
    else destroyBuilding(state, target, attackerOwner);
  }
}

export function performAttack(state: GameState, attacker: Unit | Building, target: Unit | Building): void {
  const owner = state.players[attacker.owner];
  const ranged = attacker.kind === 'building' || getUnitStats(state, owner, attacker.type).range >= 1.6;
  const kind = attacker.kind === 'building' ? 'arrow' : (UNITS[attacker.type].cls === 'siege' ? 'rock' : (UNITS[attacker.type].cls === 'myth' ? 'bolt' : 'arrow'));
  if (ranged) state.effects.push({ type: 'projectile', x: attacker.x, y: attacker.y, tx: target.x, ty: target.y, owner: attacker.owner, ttl: 8, total: 8, data: kind });
  else state.effects.push({ type: 'hit', x: target.x, y: target.y, ttl: 6, total: 6 });
  if (attacker.kind === 'unit') attacker.attackTick = state.tick;
  // Petrificação da Medusa
  if (attacker.kind === 'unit' && UNITS[attacker.type].special === 'petrify' && target.kind === 'unit') {
    const tdef = UNITS[target.type];
    if (tdef.tags.includes('human') && !tdef.tags.includes('hero') && state.rng.chance(0.12)) {
      state.effects.push({ type: 'petrify', x: target.x, y: target.y, ttl: 30, total: 30, data: target.type });
      killUnit(state, target, attacker.owner, attacker);
      return;
    }
  }
  const dmg = computeDamage(state, attacker, target);
  applyDamage(state, target, dmg, attacker.owner, attacker);
  // Dano em área (Quimera, Titãs)
  if (attacker.kind === 'unit') {
    const splash = getUnitStats(state, owner, attacker.type).splash;
    if (splash > 0) {
      const rt = getRuntime(state);
      const tx = target.x, ty = target.y;
      rt.hash.each(tx, ty, splash, (u) => {
        if (u === target || u.dead || !canTarget(state, attacker, u)) return;
        const dx = u.x - tx, dy = u.y - ty;
        if (dx * dx + dy * dy > splash * splash) return;
        applyDamage(state, u, computeDamage(state, attacker, u) * 0.5, attacker.owner, attacker);
      });
      state.effects.push({ type: 'splash', x: tx, y: ty, ttl: 10, total: 10, data: splash });
    }
  }
}

export function killUnit(state: GameState, u: Unit, killerOwner: number, killer?: Unit | Building): void {
  if (u.dead) return;
  u.dead = true; u.hp = 0;
  const def = UNITS[u.type];
  const victim = state.players[u.owner];
  victim.stats.losses++;
  state.effects.push({ type: 'death', x: u.x, y: u.y, owner: u.owner, ttl: 24, total: 24, data: u.type });
  if (killerOwner >= 0 && killerOwner !== u.owner) {
    const kp = state.players[killerOwner];
    kp.stats.kills++;
    if (killer && killer.kind === 'unit') {
      killer.kills++;
      if (UNITS[killer.type].special === 'heads') killer.heads = Math.min(5, 1 + Math.floor(killer.kills / 3));
    }
  }
  if (def.tags.includes('hero')) state.events.push({ tick: state.tick, type: 'heroDied', player: u.owner, x: u.x, y: u.y, text: `${def.name} caiu em batalha.` });
  if (def.tags.includes('titan')) state.events.push({ tick: state.tick, type: 'titanDied', player: u.owner, x: u.x, y: u.y, text: `O Titã ${def.name} foi derrotado!` });
  // Hades: sombras
  if (victim.god === 'hades' && def.tags.includes('human') && def.tags.includes('military') && !def.tags.includes('hero') && state.rng.chance(0.25)) {
    const s = spawnUnit(state, u.owner, 'shade', u.x, u.y);
    s.stance = 'aggressive';
    state.effects.push({ type: 'spawn', x: u.x, y: u.y, ttl: 12, total: 12 });
  }
  recomputePop(state, victim);
}

export function destroyBuilding(state: GameState, b: Building, killerOwner: number): void {
  if (b.dead) return;
  b.dead = true; b.hp = 0;
  const def = BUILDINGS[b.type];
  const victim = state.players[b.owner];
  // Libera tiles
  for (let y = b.ty; y < b.ty + b.h; y++) for (let x = b.tx; x < b.tx + b.w; x++) {
    const i = idx(state.map, x, y);
    if (state.map.buildingAt[i] === b.id) { state.map.buildingAt[i] = -1; if (!def.passable) state.map.blocked[i] = 0; }
  }
  // Devolve população da fila
  b.queue.length = 0;
  if (def.territory) state.territoryDirty = true;
  state.effects.push({ type: 'collapse', x: b.x, y: b.y, ttl: 30, total: 30, data: b.type });
  if (b.complete) {
    victim.stats.buildingsLost++;
    if (killerOwner >= 0 && killerOwner !== b.owner) state.players[killerOwner].stats.razed++;
    if (!def.wall && !def.farm) state.events.push({ tick: state.tick, type: 'buildingLost', player: b.owner, x: b.x, y: b.y, text: `${def.name} foi destruído!` });
    // Poseidon: milícia
    if (victim.god === 'poseidon' && !def.wall && !def.farm && victim.alive) {
      for (let k = 0; k < 2; k++) { const m = spawnUnit(state, b.owner, 'militia', b.x + (k === 0 ? -0.6 : 0.6), b.y + 0.4); m.stance = 'aggressive'; }
    }
    if (def.wonder) { victim.wonderVictoryAt = -1; state.events.push({ tick: state.tick, type: 'wonderLost', player: b.owner, x: b.x, y: b.y, text: `A maravilha ${def.name} de ${victim.name} foi destruída!` }); }
    if (def.wonder) { const m = modsModule(); m.recomputeMods(state, victim); }
  }
  recomputePop(state, victim);
}
import * as modsModuleNs from './modifiers';
function modsModule() { return modsModuleNs; }
