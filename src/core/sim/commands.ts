// Comandos: validação e aplicação. Toda mudança de estado originada do jogador/IA/rede passa por aqui,
// o que torna a simulação reproduzível (lockstep, replays, saves).
import { MAX_SCHOLARS, SCHOLAR_COST, TICK_RATE, type Stance } from '../constants';
import { ACADEMY_LINES, AGES, BUILDINGS, MAX_AGE, MINOR_GODS, MAJOR_GODS, TECHS, UNITS } from '../data';
import type { Building, Command, GameState, Player, Unit } from '../types';
import { spiralSearch, canPass, inBounds } from '../map/grid';
import { canAfford, marketTrade, pay, refund, queueItemCost } from './economy';
import { canPlaceBuilding, placeBuilding, recomputePop, unitsOf, countBuildings, ejectGarrison, canGarrison } from './entities';
import { getUnitStats, techCost, getBuildingStats } from './modifiers';
import { queueTotalFor } from './buildings';
import { giveOrder, stopUnit } from './units';
import { entityById, isAlly } from './queries';
import { getRuntime } from './runtime';
import { ABILITIES } from '../data';
import { usePower } from './powers';
import { killUnit, destroyBuilding } from './combat';
import { t } from '../../i18n';

export interface CommandResult { ok: boolean; reason?: string }

/** Habilidade ativa de um herói: aplica o efeito a ele e aos aliados no raio (buff temporário) e inicia a recarga. */
export function useAbility(state: GameState, player: Player, unitId: number): CommandResult {
  const u = state.units.get(unitId);
  if (!u || u.dead || u.owner !== player.id || u.inside !== -1) return { ok: false };
  const ab = UNITS[u.type].ability ? ABILITIES[UNITS[u.type].ability!] : undefined;
  if (!ab) return { ok: false, reason: t('err.noAbility') };
  if (state.tick < u.abilityReadyAt) return { ok: false, reason: t('err.abilityCooldown', { s: Math.ceil((u.abilityReadyAt - state.tick) / TICK_RATE) }) };
  const until = state.tick + ab.duration * TICK_RATE;
  const applyTo = (x: Unit) => {
    if (x.buffUntil < state.tick) { x.buffAttack = 1; x.buffSpeed = 1; x.buffHaste = 1; x.buffWard = false; }   // buff anterior expirou: zera
    x.buffUntil = Math.max(x.buffUntil, until);
    if (ab.effect === 'attack') x.buffAttack = Math.max(x.buffAttack, ab.power);
    if (ab.effect === 'speed') x.buffSpeed = Math.max(x.buffSpeed, ab.power);
    if (ab.effect === 'haste') x.buffHaste = Math.max(x.buffHaste, ab.power);
    if (ab.effect === 'ward') x.buffWard = true;
  };
  if (ab.effect === 'charge') u.chargeUntil = until;
  else if (ab.radius > 0) {
    const r2 = ab.radius * ab.radius;
    getRuntime(state).hash.each(u.x, u.y, ab.radius, (x) => { if (!x.dead && x.inside === -1 && isAlly(state, player.id, x.owner) && (x.x - u.x) ** 2 + (x.y - u.y) ** 2 <= r2) applyTo(x); });
    applyTo(u);
  } else applyTo(u);
  u.abilityReadyAt = state.tick + ab.cooldown * TICK_RATE;
  state.effects.push({ type: 'ability', x: u.x, y: u.y, ttl: 20, total: 20, data: Math.max(1, ab.radius), owner: player.id });
  if (!player.isAI) state.events.push({ tick: state.tick, type: 'ability', player: player.id, x: u.x, y: u.y, text: `${ab.icon} ${ab.name}` });
  return { ok: true };
}

function ownedUnits(state: GameState, player: number, ids: number[]): Unit[] {
  const out: Unit[] = [];
  for (const id of ids) { const u = state.units.get(id); if (u && !u.dead && u.owner === player && u.inside === -1) out.push(u); }
  return out;
}
function ownedBuilding(state: GameState, player: number, id: number): Building | null {
  const b = state.buildings.get(id);
  return b && !b.dead && b.owner === player ? b : null;
}

/** Classe de formação: 0 = linha de frente (corpo a corpo), 1 = à distância, 2 = cerco/civis. */
function formationRank(u: Unit): number {
  const d = UNITS[u.type];
  if (d.cls === 'siege' || d.cls === 'villager' || d.cls === 'scout') return 2;
  if (d.tags.includes('ranged')) return 1;
  return 0;
}

/** Formação em fileiras perpendiculares à direção do deslocamento; corpo a corpo à frente, arqueiros atrás, cerco por último. */
function formationOffsets(units: Unit[], cx: number, cy: number, tx: number, ty: number): [number, number][] {
  const n = units.length;
  let dx = tx - cx, dy = ty - cy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) { dx = 0; dy = 1; } else { dx /= len; dy /= len; }
  const px = -dy, py = dx;              // perpendicular
  const width = Math.max(2, Math.ceil(Math.sqrt(n * 1.6)));
  const spacing = 0.95;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / width), col = (i % width) - (Math.min(width, n - row * width) - 1) / 2;
    out.push([px * col * spacing - dx * row * spacing, py * col * spacing - dy * row * spacing]);
  }
  return out;
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
  if (!player || !player.alive) return { ok: false, reason: t('err.invalidPlayer') };
  switch (cmd.type) {
    case 'move': case 'attackMove': {
      const units = ownedUnits(state, cmd.player, cmd.ids).filter((u) => !UNITS[u.type].immobile && u.inside === -1);
      if (units.length === 0) return { ok: false };
      let offs: [number, number][];
      if (units.length >= 4) {
        // formação: corpo a corpo na frente, arqueiros atrás, cerco/civis por último; dentro da fileira, os mais próximos ao centro
        const cx = units.reduce((s, u) => s + u.x, 0) / units.length, cy = units.reduce((s, u) => s + u.y, 0) / units.length;
        units.sort((a, b) => formationRank(a) - formationRank(b) || a.id - b.id);
        offs = formationOffsets(units, cx, cy, cmd.x, cmd.y);
      } else {
        units.sort((a, b) => ((a.x - cmd.x) ** 2 + (a.y - cmd.y) ** 2) - ((b.x - cmd.x) ** 2 + (b.y - cmd.y) ** 2));
        offs = groupOffsets(units.length);
      }
      const taken = new Set<number>();
      units.forEach((u, i) => {
        let x = cmd.x + offs[i][0], y = cmd.y + offs[i][1];
        const tx = Math.floor(x), ty = Math.floor(y);
        if (!inBounds(state.map, tx, ty) || !canPass(state.map, tx, ty, player.team)) {
          // destino bloqueado: procura o tile livre mais próximo do próprio offset, evitando repetir tiles
          const t = spiralSearch(Math.max(0, Math.min(state.map.w - 1, tx)), Math.max(0, Math.min(state.map.h - 1, ty)), 8, (a, b) => canPass(state.map, a, b, player.team) && !taken.has(b * state.map.w + a));
          if (t) { x = t.x + 0.5; y = t.y + 0.5; taken.add(t.y * state.map.w + t.x); }
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
      if (builders.length === 0) return { ok: false, reason: t('err.noBuilders') };
      const check = canPlaceBuilding(state, player, cmd.building, cmd.tx, cmd.ty);
      if (!check.ok) return check;
      const cost = getBuildingStats(state, player, cmd.building).cost;
      if (!canAfford(player, cost)) return { ok: false, reason: t('err.noResources') };
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
      if (b.scholars + queued >= MAX_SCHOLARS) return { ok: false, reason: t('err.maxScholars', { n: MAX_SCHOLARS }) };
      if (!canAfford(player, SCHOLAR_COST)) return { ok: false, reason: t('err.noResources') };
      const paid = { ...SCHOLAR_COST } as Record<string, number>;
      pay(player, paid);
      b.queue.push({ kind: 'scholar', id: 'scholar', elapsed: 0, total: queueTotalFor(state, player, 'scholar', 'scholar'), paid, uid: state.nextId++ });
      return { ok: true };
    }
    case 'cancel': {
      const b = ownedBuilding(state, cmd.player, cmd.buildingId);
      if (!b) return { ok: false };
      if (cmd.index === -1) { // cancela construção inteira
        if (!b.complete) { refund(player, getBuildingStats(state, player, b.type).cost, 1); destroyBuilding(state, b, -1); return { ok: true }; }
        return { ok: false };
      }
      // por uid quando informado (o índice pode ter mudado entre o clique e a execução, ex.: lockstep)
      const index = cmd.itemId !== undefined ? b.queue.findIndex((q) => q.uid === cmd.itemId) : cmd.index;
      const item = b.queue[index];
      if (!item) return { ok: false };
      b.queue.splice(index, 1);
      refund(player, queueItemCost(state, player, item));   // devolve o que foi pago (não o custo atual)
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
    case 'ability': return useAbility(state, player, cmd.unitId);
    case 'trade': {
      if (countBuildings(state, player.id, (b) => b.complete && !!BUILDINGS[b.type].trade) === 0) return { ok: false, reason: t('err.needMarket') };
      return marketTrade(state, player, cmd.action, cmd.resource) ? { ok: true } : { ok: false, reason: t('err.noResources') };
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
      if (b.garrison.length > 0) ejectGarrison(state, b);
      return { ok: true };
    }
    case 'garrison': {
      const b = state.buildings.get(cmd.targetId);
      if (!b || b.dead || state.players[b.owner].team !== player.team) return { ok: false };
      const units = ownedUnits(state, cmd.player, cmd.ids).filter((u) => canGarrison(u, b));
      if (units.length === 0) return { ok: false, reason: t('err.noGarrison') };
      for (const u of units) giveOrder(state, u, { type: 'garrison', targetId: b.id }, cmd.queue);
      return { ok: true };
    }
  }
  return { ok: false, reason: t('err.unknown') };
}

export function canTrain(state: GameState, player: Player, b: Building, unit: string): CommandResult {
  const def = UNITS[unit];
  if (!def || !b.complete) return { ok: false };
  const bdef = BUILDINGS[b.type];
  if (!bdef.trains || !bdef.trains.includes(unit)) return { ok: false, reason: t('err.notTrained') };
  if (def.age > player.age) return { ok: false, reason: t('err.requiresAge', { age: AGES[def.age].name }) };
  if (def.god) {
    const major = MAJOR_GODS[player.god];
    const allowed = (major && major.mythUnit === unit) || player.minorGods.some((g) => MINOR_GODS[g]?.mythUnit === unit) || (def.god === player.god);
    if (!allowed) return { ok: false, reason: t('err.requiresGod') };
  }
  if (def.unique) {
    for (const u of state.units.values()) if (u.owner === player.id && !u.dead && u.type === unit) return { ok: false, reason: t('err.alreadyAlive', { name: def.name }) };
    for (const ob of state.buildings.values()) if (ob.owner === player.id && !ob.dead && ob.queue.some((q) => q.kind === 'unit' && q.id === unit)) return { ok: false, reason: t('err.alreadyTraining', { name: def.name }) };
  }
  if (b.queue.length >= 10) return { ok: false, reason: t('err.queueFull') };
  if (player.pop + def.pop > player.popCap) return { ok: false, reason: t('err.popCap') };
  const cost = getUnitStats(state, player, unit).cost;
  if (!canAfford(player, cost)) return { ok: false, reason: t('err.noResources') };
  return { ok: true };
}

function train(state: GameState, player: Player, buildingId: number, unit: string): CommandResult {
  const b = ownedBuilding(state, player.id, buildingId);
  if (!b) return { ok: false };
  const c = canTrain(state, player, b, unit);
  if (!c.ok) return c;
  const paid = { ...getUnitStats(state, player, unit).cost };
  pay(player, paid);
  b.queue.push({ kind: 'unit', id: unit, elapsed: 0, total: queueTotalFor(state, player, 'unit', unit), paid, uid: state.nextId++ });
  recomputePop(state, player);
  return { ok: true };
}

export function canResearch(state: GameState, player: Player, b: Building, tech: string): CommandResult {
  const def = TECHS[tech];
  if (!def || !b.complete) return { ok: false };
  if (def.building !== b.type) return { ok: false };
  if (player.techs.includes(tech)) return { ok: false, reason: t('err.researched') };
  if (def.age > player.age) return { ok: false, reason: t('err.requiresAge', { age: AGES[def.age].name }) };
  if (def.god && !player.minorGods.includes(def.god) && player.god !== def.god) return { ok: false, reason: t('err.requiresBlessing', { god: MINOR_GODS[def.god]?.name ?? def.god }) };
  for (const p of def.prereq) if (!player.techs.includes(p)) return { ok: false, reason: t('err.requiresTech', { name: TECHS[p].name }) };
  for (const ob of state.buildings.values()) if (ob.owner === player.id && !ob.dead && ob.queue.some((q) => q.kind === 'tech' && q.id === tech)) return { ok: false, reason: t('err.researching') };
  if (b.queue.length >= 10) return { ok: false, reason: t('err.queueFull') };
  if (!canAfford(player, techCost(player, tech))) return { ok: false, reason: t('err.noResources') };
  return { ok: true };
}

function research(state: GameState, player: Player, buildingId: number, tech: string): CommandResult {
  const b = ownedBuilding(state, player.id, buildingId);
  if (!b) return { ok: false };
  const c = canResearch(state, player, b, tech);
  if (!c.ok) return c;
  const paid = { ...techCost(player, tech) };
  pay(player, paid);
  b.queue.push({ kind: 'tech', id: tech, elapsed: 0, total: TECHS[tech].time, paid, uid: state.nextId++ });
  return { ok: true };
}

export function academyTechCount(player: Player): number {
  let n = 0;
  for (const t of player.techs) { const d = TECHS[t]; if (d && d.line && ACADEMY_LINES.includes(d.line)) n++; }
  return n;
}

export function canAdvanceAge(state: GameState, player: Player, b?: Building): CommandResult & { minorOptions?: string[] } {
  if (player.age >= MAX_AGE) return { ok: false, reason: t('err.maxAge') };
  const next = AGES[player.age + 1];
  if (b && (b.type !== 'town_center' || !b.complete)) return { ok: false, reason: t('err.advanceAtTC') };
  for (const ob of state.buildings.values()) if (ob.owner === player.id && !ob.dead && ob.queue.some((q) => q.kind === 'age')) return { ok: false, reason: t('err.advancing') };
  if (next.requires.building && countBuildings(state, player.id, (x) => x.type === next.requires.building && x.complete) === 0) return { ok: false, reason: t('err.requiresBuilding', { name: BUILDINGS[next.requires.building].name }) };
  if (next.requires.techCount && academyTechCount(player) < next.requires.techCount) return { ok: false, reason: t('err.requiresTechCount', { n: next.requires.techCount, have: academyTechCount(player) }) };
  if (!canAfford(player, next.cost as Record<string, number>)) return { ok: false, reason: t('err.noResources') };
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
    if (!minorGod || !c.minorOptions?.includes(minorGod)) return { ok: false, reason: t('err.chooseMinor') };
  } else minorGod = undefined;   // Idade sem escolha: ignora qualquer deus enviado (cliente modificado)
  const paid = { ...(next.cost as Record<string, number>) };
  pay(player, paid);
  b.queue.push({ kind: 'age', id: `age:${minorGod ?? ''}`, elapsed: 0, total: next.time, paid, uid: state.nextId++ });
  return { ok: true };
}
