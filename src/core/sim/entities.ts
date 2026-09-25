// Criação, posicionamento e remoção de unidades e edifícios; população; regras de colocação.
import { TERRAIN, POP_CAP_MAX } from '../constants';
import { BUILDINGS, UNITS, AGES } from '../data';
import type { Building, GameState, Player, Unit } from '../types';
import { idx, inBounds, spiralSearch, isPassable } from '../map/grid';
import { getBuildingStats, getUnitStats } from './modifiers';
import { t } from '../../i18n';

export function spawnUnit(state: GameState, owner: number, type: string, x: number, y: number): Unit {
  const player = state.players[owner];
  const stats = getUnitStats(state, player, type);
  const def = UNITS[type];
  const u: Unit = {
    id: state.nextId++, kind: 'unit', type, owner, x, y, px: x, py: y, hp: stats.hp, maxHp: stats.hp,
    state: 'idle', tx: x, ty: y, path: null, pathI: 0, targetId: -1, nodeId: -1, carry: null, carryAmt: 0,
    cooldown: 0, stance: def.tags.includes('civilian') ? 'passive' : 'aggressive', leashX: x, leashY: y, kills: 0, heads: 1,
    dead: false, spawnTick: state.tick, repathAt: 0, stuck: 0, order: null, queue: [], attackTick: -100, lastDamageTick: -100, orderTick: state.tick, inside: -1, resumeNodeId: -1,
  };
  state.units.set(u.id, u);
  player.pop += def.pop;
  return u;
}

export function placeBuilding(state: GameState, owner: number, type: string, tx: number, ty: number, complete = false): Building {
  const player = state.players[owner];
  const def = BUILDINGS[type];
  const stats = getBuildingStats(state, player, type);
  const b: Building = {
    id: state.nextId++, kind: 'building', type, owner, tx, ty, w: def.w, h: def.h, x: tx + def.w / 2, y: ty + def.h / 2,
    hp: complete ? stats.hp : Math.max(1, Math.round(stats.hp * 0.1)), maxHp: stats.hp, complete, progress: complete ? stats.buildTime : 0,
    queue: [], rallyX: -1, rallyY: -1, scholars: 0, disabledUntil: 0, wonderStart: -1, cooldown: 0, dead: false, builtTick: state.tick, lastDamageTick: -100, garrison: [],
  };
  state.buildings.set(b.id, b);
  for (let y = ty; y < ty + def.h; y++) for (let x = tx; x < tx + def.w; x++) {
    const i = idx(state.map, x, y);
    state.map.buildingAt[i] = b.id;
    if (!def.passable) state.map.blocked[i] = 1;
  }
  if (!def.passable) pushUnitsOut(state, b);
  if (complete) onBuildingComplete(state, b);
  return b;
}

/** Empurra unidades que estejam sobre a área do edifício para o tile livre mais próximo. */
function pushUnitsOut(state: GameState, b: Building) {
  for (const u of state.units.values()) {
    if (u.dead || UNITS[u.type].flying || u.inside !== -1) continue;
    if (u.x >= b.tx && u.x < b.tx + b.w && u.y >= b.ty && u.y < b.ty + b.h) {
      const t = spiralSearch(Math.floor(u.x), Math.floor(u.y), 8, (x, y) => isPassable(state.map, x, y));
      if (t) { u.x = t.x + 0.5; u.y = t.y + 0.5; u.px = u.x; u.py = u.y; u.path = null; }
    }
  }
}

export function onBuildingComplete(state: GameState, b: Building): void {
  const def = BUILDINGS[b.type];
  const player = state.players[b.owner];
  b.complete = true;
  b.progress = getBuildingStats(state, player, b.type).buildTime;
  if (def.gate) for (let y = b.ty; y < b.ty + b.h; y++) for (let x = b.tx; x < b.tx + b.w; x++) state.map.gateTeam[idx(state.map, x, y)] = player.team;
  if (def.territory) state.territoryDirty = true;
  if (def.wonder) { b.wonderStart = state.tick; state.events.push({ tick: state.tick, type: 'wonder', player: b.owner, x: b.x, y: b.y, text: t('ev.wonder', { player: player.name, name: def.name }) }); }
  if (def.titanGate) state.events.push({ tick: state.tick, type: 'titan', player: b.owner, x: b.x, y: b.y, text: t('ev.titanGate', { player: player.name }) });
  player.stats.buildingsBuilt++;
  recomputePop(state, player);
  if (def.wonder || def.popCap) { /* nada extra */ }
  if (def.wonder) { const { recomputeMods } = requireMods(); recomputeMods(state, player); }
}

// Import tardio para evitar ciclo modifiers <-> entities em tempo de módulo.
import * as modsMod from './modifiers';
function requireMods() { return modsMod; }

export function recomputePop(state: GameState, player: Player): void {
  let cap = player.mods.player.popCap;
  for (const b of state.buildings.values()) {
    if (b.owner !== player.id || !b.complete || b.dead) continue;
    cap += BUILDINGS[b.type].popCap ?? 0;
  }
  player.popCap = Math.min(POP_CAP_MAX, cap);
  let pop = 0;
  for (const u of state.units.values()) if (u.owner === player.id && !u.dead) pop += UNITS[u.type].pop;
  for (const b of state.buildings.values()) if (b.owner === player.id && !b.dead) for (const q of b.queue) if (q.kind === 'unit') pop += UNITS[q.id].pop;
  player.pop = pop;
}

export interface PlaceCheck { ok: boolean; reason?: string }

export function countBuildings(state: GameState, owner: number, pred: (b: Building) => boolean): number {
  let n = 0;
  for (const b of state.buildings.values()) if (b.owner === owner && !b.dead && pred(b)) n++;
  return n;
}

export function buildingLimitOk(state: GameState, player: Player, type: string): PlaceCheck {
  const def = BUILDINGS[type];
  if (def.limit === 'city') {
    const n = countBuildings(state, player.id, (b) => b.type === 'town_center');
    if (n >= player.mods.player.cityLimit) return { ok: false, reason: t('err.cityLimit', { n: player.mods.player.cityLimit }) };
  } else if (def.limit === 'wonder') {
    if (countBuildings(state, player.id, (b) => !!BUILDINGS[b.type].wonder) >= 1) return { ok: false, reason: t('err.oneWonder') };
  } else if (typeof def.limit === 'number') {
    if (countBuildings(state, player.id, (b) => b.type === type) >= def.limit) return { ok: false, reason: t('err.limit', { name: def.name, n: def.limit }) };
  }
  return { ok: true };
}

export function canPlaceBuilding(state: GameState, player: Player, type: string, tx: number, ty: number, ignoreLimits = false, force = false): PlaceCheck {
  const def = BUILDINGS[type];
  if (!def || (def.notBuildable && !force)) return { ok: false, reason: t('err.invalidBuilding') };
  if (def.age > player.age && !force) return { ok: false, reason: t('err.requiresAge', { age: AGES[def.age].name }) };
  if (!ignoreLimits && !force) { const lim = buildingLimitOk(state, player, type); if (!lim.ok) return lim; }
  const map = state.map;
  for (let y = ty; y < ty + def.h; y++) for (let x = tx; x < tx + def.w; x++) {
    if (!inBounds(map, x, y)) return { ok: false, reason: t('err.offMap') };
    const i = idx(map, x, y);
    const tt = map.terrain[i];
    if (tt === TERRAIN.WATER || tt === TERRAIN.DEEP || tt === TERRAIN.MOUNTAIN) return { ok: false, reason: t('err.terrain') };
    if (map.nodeAt[i] !== -1 || map.buildingAt[i] !== -1) return { ok: false, reason: t('err.occupied') };
    if (force) continue;
    const owner = state.territory[i];
    if (type === 'town_center') {
      if (owner !== -1 && owner !== player.id) return { ok: false, reason: t('err.enemyTerritory') };
    } else if (owner !== player.id) {
      return { ok: false, reason: t('err.ownTerritory') };
    }
  }
  return { ok: true };
}

/** Tile livre mais próximo ao redor de um edifício para posicionar uma unidade nova. */
export function findSpawnTile(state: GameState, b: Building, towardX?: number, towardY?: number): { x: number; y: number } {
  const map = state.map;
  let bestX = b.tx, bestY = b.ty + b.h, bestD = Infinity;
  const ring = (r: number) => {
    for (let y = b.ty - r; y < b.ty + b.h + r; y++) for (let x = b.tx - r; x < b.tx + b.w + r; x++) {
      const onRing = x === b.tx - r || x === b.tx + b.w + r - 1 || y === b.ty - r || y === b.ty + b.h + r - 1;
      if (!onRing || !isPassable(map, x, y)) continue;
      const d = towardX !== undefined && towardY !== undefined ? (x - towardX) * (x - towardX) + (y - towardY) * (y - towardY) : (x - b.x) * (x - b.x) + (y - b.y) * (y - b.y);
      if (d < bestD) { bestD = d; bestX = x; bestY = y; }
    }
  };
  for (let r = 1; r <= 6 && bestD === Infinity; r++) ring(r);
  return { x: bestX + 0.5, y: bestY + 0.5 };
}

export function unitDef(u: Unit) { return UNITS[u.type]; }
export function buildingDef(b: Building) { return BUILDINGS[b.type]; }

/** Todas as unidades vivas de um jogador. */
export function unitsOf(state: GameState, owner: number): Unit[] {
  const out: Unit[] = [];
  for (const u of state.units.values()) if (u.owner === owner && !u.dead) out.push(u);
  return out;
}
export function buildingsOf(state: GameState, owner: number): Building[] {
  const out: Building[] = [];
  for (const b of state.buildings.values()) if (b.owner === owner && !b.dead) out.push(b);
  return out;
}

// ---------------- Guarnição ----------------
import { GARRISON_TAGS } from '../constants';
export function canGarrison(u: Unit, b: Building): boolean {
  const def = UNITS[u.type]; const bdef = BUILDINGS[b.type];
  if (!bdef.garrison || !b.complete || b.dead || u.dead || u.inside !== -1) return false;
  if (!def.tags.some((t) => GARRISON_TAGS.has(t)) || def.tags.includes('myth') || def.tags.includes('siege') || def.tags.includes('cavalry')) return false;
  return b.garrison.length < bdef.garrison;
}
export function enterGarrison(state: GameState, u: Unit, b: Building): boolean {
  if (!canGarrison(u, b)) return false;
  u.inside = b.id; u.state = 'garrison'; u.order = null; u.queue.length = 0; u.path = null; u.targetId = -1;
  u.resumeNodeId = u.nodeId; u.nodeId = -1;
  u.x = b.x; u.y = b.y; u.px = u.x; u.py = u.y;
  b.garrison.push(u.id);
  return true;
}
/** Libera todas as unidades de um edifício (ou só as listadas), colocando-as ao redor e retomando a coleta. */
export function ejectGarrison(state: GameState, b: Building, ids?: number[]): void {
  const list = ids ? b.garrison.filter((id) => ids.includes(id)) : [...b.garrison];
  b.garrison = b.garrison.filter((id) => !list.includes(id));
  let k = 0;
  for (const id of list) {
    const u = state.units.get(id); if (!u || u.dead) continue;
    const spot = findSpawnTile(state, b, b.x + ((k % 3) - 1) * 4, b.y + (Math.floor(k / 3) - 1) * 4); k++;
    u.x = spot.x; u.y = spot.y; u.px = u.x; u.py = u.y; u.inside = -1; u.state = 'idle'; u.path = null;
    if (u.resumeNodeId !== -1) {
      const node = u.resumeNodeId > 0 ? state.map.nodes.get(u.resumeNodeId) : null;
      const farm = u.resumeNodeId < 0 ? state.buildings.get(-u.resumeNodeId) : null;
      if ((node && node.amount > 0) || (farm && !farm.dead)) { u.nodeId = u.resumeNodeId; u.state = 'gather'; u.orderTick = state.tick; }
      u.resumeNodeId = -1;
    }
  }
}
