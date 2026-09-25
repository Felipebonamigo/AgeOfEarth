// Comandos: validação e aplicação. Toda mudança de estado originada do jogador/IA/rede passa por aqui,
// o que torna a simulação reproduzível (lockstep, replays, saves).
import { MAX_SCHOLARS, SCHOLAR_COST, type Stance } from '../constants';
import { ACADEMY_LINES, AGES, BUILDINGS, MAX_AGE, MINOR_GODS, MAJOR_GODS, TECHS, UNITS } from '../data';
import type { Building, Command, GameState, Player, Unit } from '../types';
import { spiralSearch, isPassable, inBounds } from '../map/grid';
import { canAfford, marketTrade, pay, refund } from './economy';
import { canPlaceBuilding, placeBuilding, recomputePop, unitsOf, countBuildings } from './entities';
import { getUnitStats, techCost, getBuildingStats } from './modifiers';
import { queueTotalFor } from './buildings';
import { giveOrder, stopUnit } from './units';
import { entityById } from './queries';
import { usePower } from './powers';
import { killUnit, destroyBuilding } from './combat';

export interface CommandResult { ok: boolean; reason?: string }

function ownedUnits(state: GameState, player: number, ids: number[]): Unit[] {
  const out: Unit[] = [];
  for (const id of ids) { const u = state.units.get(id); if (u && !u.dead && u.owner === player) out.push(u); }
  return out;
}
function ownedBuilding(state: GameState, player: number, id: number): Building | null {
  const b = state.buildings.get(id);
  return b && !b.dead && b.owner === player ? b : null;
}

/** Offsets em espiral para espalhar um grupo ao redor do destino. */
function groupOffsets(n: number): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  let r = 1;
  while (out.length < n) {
    for (let dy = -r; dy <= r && out.length < n; dy++) for (let dx = -r; dx <= r && out.length < n; dx++) {
      if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      out.push([dx * 0.9, dy * 0.9]);
    }
    r++;
  }
  return out;
}

export function applyCommand(state: GameState, cmd: Command): CommandResult {
  const player = state.players[cmd.player];
  if (!player || !player.alive) return { ok: false, reason: 'Jogador inválido.' };
  switch (cmd.type) {
    case 'move': case 'attackMove': {
      const units = ownedUnits(state, cmd.player, cmd.ids).filter((u) => !UNITS[u.type].immobile);
      if (units.length === 0) return { ok: false };
      // ordena por distância ao destino para que os mais próximos fiquem mais perto do centro
      units.sort((a, b) => ((a.x - cmd.x) ** 2 + (a.y - cmd.y) ** 2) - ((b.x - cmd.x) ** 2 + (b.y - cmd.y) ** 2));
      const offs = groupOffsets(units.length);
      units.forEach((u, i) => {
        let x = cmd.x + offs[i][0], y = cmd.y + offs[i][1];
        const tx = Math.floor(x), ty = Math.floor(y);
        if (!inBounds(state.map, tx, ty) || !isPassable(state.map, tx, ty)) {
          const t = spiralSearch(Math.floor(cmd.x), Math.floor(cmd.y), 6, (a, b) => isPassable(state.map, a, b));
          if (t) { x = t.x + 0.5; y = t.y + 0.5; }
        }
        giveOrder(state, u, { type: cmd.type, x, y }, cmd.queue);
      });
      return { ok: true };
    }
    case 'attack': {
      const target = entityById(state, cmd.targetId);
      if (!target || target.dead) return { ok: false };
      for (const u of ownedUnits(state, cmd.player, cmd.ids)) giveOrder(state, u, { type: 'attack', targetId: cmd.targetId }, cmd.queue);
      return { ok: true };
    }
    case 'gather': {
      for (const u of ownedUnits(state, cmd.player, cmd.ids)) if (UNITS[u.type].canGather) giveOrder(state, u, { type: 'gather', targetId: cmd.targetId }, cmd.queue);
      return { ok: true };
    }
    case 'pray': {
      for (const u of ownedUnits(state, cmd.player, cmd.ids)) if (UNITS[u.type].canGather) giveOrder(state, u, { type: 'pray', targetId: cmd.targetId }, cmd.queue);
      return { ok: true };
    }
    case 'repair': {
      const b = ownedBuilding(state, cmd.player, cmd.targetId);
      if (!b) return { ok: false };
      for (const u of ownedUnits(state, cmd.player, cmd.ids)) if (UNITS[u.type].canBuild) giveOrder(state, u, { type: 'repair', targetId: b.id }, cmd.queue);
      return { ok: true };
    }
    case 'build': {
      const builders = ownedUnits(state, cmd.player, cmd.ids).filter((u) => UNITS[u.type].canBuild);
      if (builders.length === 0) return { ok: false, reason: 'Nenhum construtor selecionado.' };
      const check = canPlaceBuilding(state, player, cmd.building, cmd.tx, cmd.ty);
      if (!check.ok) return check;
      const cost = getBuildingStats(state, player, cmd.building).cost;
      if (!canAfford(player, cost)) return { ok: false, reason: 'Recursos insuficientes.' };
      pay(player, cost);
      const b = placeBuilding(state, cmd.player, cmd.building, cmd.tx, cmd.ty, false);
      for (const u of builders) giveOrder(state, u, { type: 'build', targetId: b.id }, cmd.queue);
      return { ok: true };
    }
    case 'stop': {
      for (const u of ownedUnits(state, cmd.player, cmd.ids)) stopUnit(u);
      return { ok: true };
    }
    case 'stance': {
      const st = cmd.stance as Stance;
      for (const u of ownedUnits(state, cmd.player, cmd.ids)) { u.stance = st; if (st === 'passive' && u.state === 'attack' && !u.order) { u.state = 'idle'; u.targetId = -1; } }
      return { ok: true };
    }
    case 'train': return train(state, player, cmd.buildingId, cmd.unit);
    case 'research': return research(state, player, cmd.buildingId, cmd.tech);
    case 'hireScholar': {
      const b = ownedBuilding(state, cmd.player, cmd.buildingId);
      if (!b || !b.complete || !BUILDINGS[b.type].scholars) return { ok: false };
      const queued = b.queue.filter((q) => q.kind === 'scholar').length;
      if (b.scholars + queued >= MAX_SCHOLARS) return { ok: false, reason: `Máximo de ${MAX_SCHOLARS} filósofos por Academia.` };
      if (!canAfford(player, SCHOLAR_COST)) return { ok: false, reason: 'Recursos insuficientes.' };
      pay(player, SCHOLAR_COST);
      b.queue.push({ kind: 'scholar', id: 'scholar', elapsed: 0, total: queueTotalFor(state, player, 'scholar', 'scholar') });
      return { ok: true };
    }
    case 'cancel': {
      const b = ownedBuilding(state, cmd.player, cmd.buildingId);
      if (!b) return { ok: false };
      if (cmd.index === -1) { // cancela construção inteira
        if (!b.complete) { refund(player, getBuildingStats(state, player, b.type).cost, 1); destroyBuilding(state, b, -1); return { ok: true }; }
        return { ok: false };
      }
      const item = b.queue[cmd.index];
      if (!item) return { ok: false };
      b.queue.splice(cmd.index, 1);
      if (item.kind === 'unit') refund(player, getUnitStats(state, player, item.id).cost);
      else if (item.kind === 'tech') refund(player, techCost(player, item.id));
      else if (item.kind === 'scholar') refund(player, SCHOLAR_COST);
      else if (item.kind === 'age') refund(player, AGES[player.age + 1].cost as Record<string, number>);
      recomputePop(state, player);
      return { ok: true };
    }
    case 'rally': {
      const b = ownedBuilding(state, cmd.player, cmd.buildingId);
      if (!b) return { ok: false };
      b.rallyX = cmd.x; b.rallyY = cmd.y;
      return { ok: true };
    }
    case 'advanceAge': return advanceAge(state, player, cmd.buildingId, cmd.minorGod);
    case 'power': return usePower(state, player, cmd.power, cmd.x, cmd.y, cmd.targetId);
    case 'trade': {
      if (countBuildings(state, player.id, (b) => b.complete && !!BUILDINGS[b.type].trade) === 0) return { ok: false, reason: 'Requer um Mercado.' };
      return marketTrade(state, player, cmd.action, cmd.resource) ? { ok: true } : { ok: false, reason: 'Recursos insuficientes.' };
    }
    case 'delete': {
      for (const id of cmd.ids) {
        const u = state.units.get(id);
        if (u && u.owner === cmd.player && !u.dead) { killUnit(state, u, -1); continue; }
        const b = state.buildings.get(id);
        if (b && b.owner === cmd.player && !b.dead) { if (!b.complete) refund(player, getBuildingStats(state, player, b.type).cost, 1); destroyBuilding(state, b, -1); }
      }
      return { ok: true };
    }
    case 'ungarrison': {
      const b = ownedBuilding(state, cmd.player, cmd.buildingId);
      if (!b) return { ok: false };
      for (const u of unitsOf(state, cmd.player)) if (u.state === 'pray' && u.nodeId === -b.id) stopUnit(u);
      return { ok: true };
    }
  }
  return { ok: false, reason: 'Comando desconhecido.' };
}

export function canTrain(state: GameState, player: Player, b: Building, unit: string): CommandResult {
  const def = UNITS[unit];
  if (!def || !b.complete) return { ok: false };
  const bdef = BUILDINGS[b.type];
  if (!bdef.trains || !bdef.trains.includes(unit)) return { ok: false, reason: 'Este edifício não treina essa unidade.' };
  if (def.age > player.age) return { ok: false, reason: `Requer a ${AGES[def.age].name}.` };
  if (def.god) {
    const major = MAJOR_GODS[player.god];
    const allowed = (major && major.mythUnit === unit) || player.minorGods.some((g) => MINOR_GODS[g]?.mythUnit === unit) || (def.god === player.god);
    if (!allowed) return { ok: false, reason: 'Requer a bênção do deus correspondente.' };
  }
  if (def.unique) {
    for (const u of state.units.values()) if (u.owner === player.id && !u.dead && u.type === unit) return { ok: false, reason: `${def.name} já está vivo.` };
    for (const ob of state.buildings.values()) if (ob.owner === player.id && !ob.dead && ob.queue.some((q) => q.kind === 'unit' && q.id === unit)) return { ok: false, reason: `${def.name} já está em treinamento.` };
  }
  if (b.queue.length >= 10) return { ok: false, reason: 'Fila cheia.' };
  if (player.pop + def.pop > player.popCap) return { ok: false, reason: 'População máxima atingida. Construa Casas.' };
  const cost = getUnitStats(state, player, unit).cost;
  if (!canAfford(player, cost)) return { ok: false, reason: 'Recursos insuficientes.' };
  return { ok: true };
}

function train(state: GameState, player: Player, buildingId: number, unit: string): CommandResult {
  const b = ownedBuilding(state, player.id, buildingId);
  if (!b) return { ok: false };
  const c = canTrain(state, player, b, unit);
  if (!c.ok) return c;
  pay(player, getUnitStats(state, player, unit).cost);
  b.queue.push({ kind: 'unit', id: unit, elapsed: 0, total: queueTotalFor(state, player, 'unit', unit) });
  recomputePop(state, player);
  return { ok: true };
}

export function canResearch(state: GameState, player: Player, b: Building, tech: string): CommandResult {
  const def = TECHS[tech];
  if (!def || !b.complete) return { ok: false };
  if (def.building !== b.type) return { ok: false };
  if (player.techs.includes(tech)) return { ok: false, reason: 'Já pesquisado.' };
  if (def.age > player.age) return { ok: false, reason: `Requer a ${AGES[def.age].name}.` };
  if (def.god && !player.minorGods.includes(def.god) && player.god !== def.god) return { ok: false, reason: `Requer a bênção de ${MINOR_GODS[def.god]?.name ?? def.god}.` };
  for (const p of def.prereq) if (!player.techs.includes(p)) return { ok: false, reason: `Requer ${TECHS[p].name}.` };
  for (const ob of state.buildings.values()) if (ob.owner === player.id && !ob.dead && ob.queue.some((q) => q.kind === 'tech' && q.id === tech)) return { ok: false, reason: 'Já em pesquisa.' };
  if (b.queue.length >= 10) return { ok: false, reason: 'Fila cheia.' };
  if (!canAfford(player, techCost(player, tech))) return { ok: false, reason: 'Recursos insuficientes.' };
  return { ok: true };
}

function research(state: GameState, player: Player, buildingId: number, tech: string): CommandResult {
  const b = ownedBuilding(state, player.id, buildingId);
  if (!b) return { ok: false };
  const c = canResearch(state, player, b, tech);
  if (!c.ok) return c;
  pay(player, techCost(player, tech));
  b.queue.push({ kind: 'tech', id: tech, elapsed: 0, total: TECHS[tech].time });
  return { ok: true };
}

export function academyTechCount(player: Player): number {
  let n = 0;
  for (const t of player.techs) { const d = TECHS[t]; if (d && d.line && ACADEMY_LINES.includes(d.line)) n++; }
  return n;
}

export function canAdvanceAge(state: GameState, player: Player, b?: Building): CommandResult & { minorOptions?: string[] } {
  if (player.age >= MAX_AGE) return { ok: false, reason: 'Idade máxima alcançada.' };
  const next = AGES[player.age + 1];
  if (b && (b.type !== 'town_center' || !b.complete)) return { ok: false, reason: 'Avance a Idade em um Centro Cívico.' };
  for (const ob of state.buildings.values()) if (ob.owner === player.id && !ob.dead && ob.queue.some((q) => q.kind === 'age')) return { ok: false, reason: 'Avanço de Idade já em andamento.' };
  if (next.requires.building && countBuildings(state, player.id, (x) => x.type === next.requires.building && x.complete) === 0) return { ok: false, reason: `Requer ${BUILDINGS[next.requires.building].name}.` };
  if (next.requires.techCount && academyTechCount(player) < next.requires.techCount) return { ok: false, reason: `Requer ${next.requires.techCount} pesquisas das linhas da Academia (${academyTechCount(player)}/${next.requires.techCount}).` };
  if (!canAfford(player, next.cost as Record<string, number>)) return { ok: false, reason: 'Recursos insuficientes.' };
  const minorOptions = next.minorGod ? (MAJOR_GODS[player.god]?.minorGods[player.age] ?? []) : [];
  return { ok: true, minorOptions };
}

function advanceAge(state: GameState, player: Player, buildingId: number, minorGod?: string): CommandResult {
  const b = ownedBuilding(state, player.id, buildingId);
  if (!b) return { ok: false };
  const c = canAdvanceAge(state, player, b);
  if (!c.ok) return c;
  const next = AGES[player.age + 1];
  if (next.minorGod) {
    if (!minorGod || !c.minorOptions?.includes(minorGod)) return { ok: false, reason: 'Escolha um deus menor.' };
  }
  pay(player, next.cost as Record<string, number>);
  b.queue.push({ kind: 'age', id: `age:${minorGod ?? ''}`, elapsed: 0, total: next.time });
  return { ok: true };
}
