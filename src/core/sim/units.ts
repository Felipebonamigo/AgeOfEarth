// Comportamento das unidades: máquina de estados (mover, atacar, coletar, construir, rezar),
// seguimento de caminho com separação suave e perseguição com "coleira" (retorno ao ponto de origem).
import { CARRY_CAPACITY, GATHER_RATES, HUNT_TYPES, NODE_RESOURCE, TICK_RATE, type ResourceType } from '../constants';
import { BUILDINGS, UNITS } from '../data';
import type { Building, GameState, Order, ResourceNode, Unit } from '../types';
import { distToRect, idx, inBounds, isPassable, dist } from '../map/grid';
import { findPath, nearestFreeTile, type PathGoal } from '../map/pathfinding';
import { removeNode } from '../map/mapgen';
import { getBuildingStats, getUnitStats } from './modifiers';
import { getRuntime, type Runtime } from './runtime';
import { acquireTarget, attackInterval, canTarget, performAttack } from './combat';
import { entityById, distanceTo, nearestDropoff, nearestFreeFarm, nearestNode, nearestNodeWithRoom, nodeGatherers, farmGatherers } from './queries';
import { NODE_CAPACITY } from '../constants';
import { onBuildingComplete } from './entities';

const ARRIVE = 0.2;
const LEASH = 11;

// ---------------- Ordens ----------------
export function giveOrder(state: GameState, u: Unit, order: Order, queue = false): void {
  if (queue && (u.order || u.state !== 'idle')) { u.queue.push(order); return; }
  u.queue.length = 0;
  startOrder(state, u, order);
}

export function startOrder(state: GameState, u: Unit, order: Order): void {
  u.order = order;
  u.path = null; u.pathI = 0; u.stuck = 0; u.orderTick = state.tick;
  const def = UNITS[u.type];
  switch (order.type) {
    case 'move':
      if (def.immobile) { u.state = 'idle'; u.order = null; return; }
      u.state = 'move'; u.tx = order.x!; u.ty = order.y!; break;
    case 'attackMove':
      if (def.immobile) { u.state = 'idle'; u.order = null; return; }
      u.state = 'attackMove'; u.tx = order.x!; u.ty = order.y!; break;
    case 'attack': {
      const t = entityById(state, order.targetId!);
      if (!t || t.dead || !canTarget(state, u, t)) { finishOrder(state, u); return; }
      u.state = 'attack'; u.targetId = t.id; break;
    }
    case 'gather': {
      if (!def.canGather) { finishOrder(state, u); return; }
      const id = order.targetId!;
      let node = state.map.nodes.get(id);
      if (node) {
        // nó lotado: escolhe outro do mesmo tipo no agrupamento
        if (nodeGatherers(state, node.id) >= NODE_CAPACITY[node.type]) node = nearestNodeWithRoom(state, node.x + 0.5, node.y + 0.5, node.type, 6, node.id) ?? node;
        u.nodeId = node.id; u.state = 'gather'; break;
      }
      const b = state.buildings.get(id);
      if (b && !b.dead && BUILDINGS[b.type].farm && b.owner === u.owner) { u.nodeId = -b.id; u.state = b.complete ? 'gather' : 'build'; if (!b.complete) u.targetId = b.id; break; }
      finishOrder(state, u); return;
    }
    case 'build': case 'repair': {
      if (!def.canBuild) { finishOrder(state, u); return; }
      const b = state.buildings.get(order.targetId!);
      if (!b || b.dead || b.owner !== u.owner) { finishOrder(state, u); return; }
      u.state = 'build'; u.targetId = b.id; break;
    }
    case 'pray': {
      if (!def.canGather) { finishOrder(state, u); return; }
      const b = state.buildings.get(order.targetId!);
      if (!b || b.dead || b.owner !== u.owner || !BUILDINGS[b.type].worship || !b.complete) { finishOrder(state, u); return; }
      u.state = 'move'; u.targetId = b.id; u.nodeId = 0; break;   // ao chegar adjacente vira 'pray'
    }
  }
}

function finishOrder(state: GameState, u: Unit): void {
  u.order = null; u.path = null; u.pathI = 0;
  u.state = 'idle';
  if (u.queue.length > 0) startOrder(state, u, u.queue.shift()!);
}

export function stopUnit(u: Unit): void {
  u.order = null; u.queue.length = 0; u.path = null; u.pathI = 0; u.state = 'idle'; u.targetId = -1; u.nodeId = -1;
}

// ---------------- Atualização por tick ----------------
export function updateUnit(state: GameState, rt: Runtime, u: Unit, dt: number): void {
  u.px = u.x; u.py = u.y;
  if (u.cooldown > 0) u.cooldown -= dt;
  const def = UNITS[u.type];
  const player = state.players[u.owner];
  const stats = getUnitStats(state, player, u.type);

  switch (u.state) {
    case 'idle': case 'hold': {
      if (u.queue.length > 0 && !u.order) { startOrder(state, u, u.queue.shift()!); return; }
      if (def.attack > 0 && u.stance !== 'passive' && (state.tick + u.id) % 6 === 0 && state.tick >= state.ceasefireUntil) {
        const range = u.state === 'hold' || u.stance === 'defensive' ? stats.range + 0.5 : stats.los;
        const t = acquireTarget(state, u, range, true, Math.min(range, stats.range + 4));
        if (t) { u.leashX = u.x; u.leashY = u.y; u.targetId = t.id; u.state = 'attack'; u.order = null; u.path = null; }
      }
      return;
    }
    case 'move': {
      const arrived = moveTowards(state, rt, u, stats.speed * dt, u.tx, u.ty, null);
      if (arrived) {
        if (u.order?.type === 'pray') {
          const b = state.buildings.get(u.targetId);
          if (b && !b.dead) { u.state = 'pray'; u.nodeId = -b.id; u.path = null; return; }
        }
        finishOrder(state, u);
      }
      return;
    }
    case 'attackMove': {
      if ((state.tick + u.id) % 5 === 0 && def.attack > 0 && state.tick >= state.ceasefireUntil) {
        const t = acquireTarget(state, u, stats.los, true, Math.min(stats.los, stats.range + 5));
        if (t) { u.targetId = t.id; u.state = 'attack'; u.path = null; return; }
      }
      const arrived = moveTowards(state, rt, u, stats.speed * dt, u.tx, u.ty, null);
      if (arrived) finishOrder(state, u);
      return;
    }
    case 'attack': {
      const t = entityById(state, u.targetId);
      if (!t || t.dead || !canTarget(state, u, t)) { u.targetId = -1; resumeAfterCombat(state, u); return; }
      const d = distanceTo(u, t);
      const reach = stats.range + def.radius + (t.kind === 'unit' ? UNITS[t.type].radius : 0);
      if (d <= reach) {
        u.path = null;
        if (state.tick < state.ceasefireUntil) return;
        if (u.cooldown <= 0) { performAttack(state, u, t); u.cooldown = attackInterval(u); }
        return;
      }
      if (def.immobile) { u.targetId = -1; u.state = 'idle'; return; }
      // Perseguição com coleira (quando o alvo foi adquirido automaticamente)
      if (!u.order && dist(u.x, u.y, u.leashX, u.leashY) > LEASH) { u.targetId = -1; u.state = 'move'; u.tx = u.leashX; u.ty = u.leashY; u.path = null; u.order = { type: 'move', x: u.leashX, y: u.leashY }; return; }
      const goal: PathGoal = t.kind === 'building' ? { tx: t.tx, ty: t.ty, w: t.w, h: t.h } : { tx: Math.floor(t.x), ty: Math.floor(t.y), w: 1, h: 1 };
      moveTowards(state, rt, u, stats.speed * dt, t.x, t.y, goal, reach - 0.1, t.kind === 'building');
      return;
    }
    case 'gather': updateGather(state, rt, u, dt, stats.speed); return;
    case 'return': updateReturn(state, rt, u, dt, stats.speed); return;
    case 'build': updateBuild(state, rt, u, dt, stats.speed); return;
    case 'pray': {
      const b = state.buildings.get(-u.nodeId);
      if (!b || b.dead || b.owner !== u.owner) { u.nodeId = -1; finishOrder(state, u); return; }
      if (distToRect(u.x, u.y, b.tx, b.ty, b.w, b.h) > 1.5) { u.state = 'move'; u.order = { type: 'pray', targetId: b.id }; u.targetId = b.id; u.tx = b.x; u.ty = b.y; u.path = null; }
      return;
    }
  }
}

function resumeAfterCombat(state: GameState, u: Unit): void {
  u.path = null;
  if (u.order && (u.order.type === 'attackMove')) { u.state = 'attackMove'; return; }
  if (u.order && u.order.type === 'move') { u.state = 'move'; return; }
  if (u.order && u.order.type === 'attack') { finishOrder(state, u); return; }
  u.state = 'idle';
  if (u.queue.length > 0) startOrder(state, u, u.queue.shift()!);
}

// ---------------- Movimento ----------------
/**
 * Move a unidade em direção a (tx,ty). Retorna true ao chegar. Se goal for dado, o A* mira o retângulo (adjacente).
 * stopDist: distância ao alvo em que consideramos "chegou" (para ataques à distância).
 */
function moveTowards(state: GameState, rt: Runtime, u: Unit, step: number, tx: number, ty: number, goal: PathGoal | null, stopDist = ARRIVE, rectTarget = false): boolean {
  const def = UNITS[u.type];
  const map = state.map;
  const dNow = rectTarget && goal ? distToRect(u.x, u.y, goal.tx, goal.ty, goal.w, goal.h) : dist(u.x, u.y, tx, ty);
  if (dNow <= stopDist) { u.path = null; return true; }
  if (def.flying) {
    stepTo(u, tx, ty, step, map, true);
    return dist(u.x, u.y, tx, ty) <= stopDist;
  }
  // (Re)calcula caminho se necessário
  if (!u.path || (goal && state.tick >= u.repathAt && u.pathI >= u.path.length - 2 && dist(u.path[u.path.length - 2], u.path[u.path.length - 1], tx, ty) > 1.5)) {
    if (state.tick < u.repathAt && u.path === null) return false;
    if (rt.pathBudget <= 0) { u.repathAt = state.tick + 1; return false; }
    rt.pathBudget--;
    const sx = Math.floor(u.x), sy = Math.floor(u.y);
    let g: PathGoal;
    let adjacent = false;
    if (goal) { g = goal; adjacent = true; }
    else {
      const t = nearestFreeTile(map, tx, ty, 10);
      if (!t) { u.path = null; return true; }
      g = { tx: t.x, ty: t.y, w: 1, h: 1 };
    }
    const p = findPath(map, sx, sy, g, adjacent);
    u.repathAt = state.tick + Math.floor(TICK_RATE * 1.5);
    if (!p) { u.path = null; u.stuck = 0; return true; }
    if (!goal && p.length >= 2) { p[p.length - 2] = tx; p[p.length - 1] = ty; }
    u.path = p; u.pathI = 0;
    if (p.length === 0) { u.path = null; return dist(u.x, u.y, tx, ty) <= Math.max(stopDist, 1.2); }
  }
  const path = u.path;
  let remaining = step;
  while (remaining > 0 && u.pathI < path.length) {
    const wx = path[u.pathI], wy = path[u.pathI + 1];
    const d = dist(u.x, u.y, wx, wy);
    if (d <= remaining) { moveExact(u, wx, wy, map); remaining -= d; u.pathI += 2; }
    else { stepTo(u, wx, wy, remaining, map, false); remaining = 0; }
  }
  if (u.pathI >= path.length) {
    u.path = null;
    const dEnd = rectTarget && goal ? distToRect(u.x, u.y, goal.tx, goal.ty, goal.w, goal.h) : dist(u.x, u.y, tx, ty);
    return dEnd <= Math.max(stopDist, 1.3);
  }
  return false;
}

function moveExact(u: Unit, x: number, y: number, map: GameState['map']) {
  if (isPassable(map, Math.floor(x), Math.floor(y))) { u.x = x; u.y = y; }
  else u.stuck++;
}

function stepTo(u: Unit, tx: number, ty: number, step: number, map: GameState['map'], fly: boolean) {
  const dx = tx - u.x, dy = ty - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) return;
  const k = Math.min(1, step / d);
  const nx = u.x + dx * k, ny = u.y + dy * k;
  if (fly) { u.x = Math.max(0.5, Math.min(map.w - 0.5, nx)); u.y = Math.max(0.5, Math.min(map.h - 0.5, ny)); return; }
  if (isPassable(map, Math.floor(nx), Math.floor(ny))) { u.x = nx; u.y = ny; u.stuck = 0; }
  else {
    // tenta deslizar em um eixo
    if (isPassable(map, Math.floor(nx), Math.floor(u.y))) u.x = nx;
    else if (isPassable(map, Math.floor(u.x), Math.floor(ny))) u.y = ny;
    else { u.stuck++; if (u.stuck > 6) { u.path = null; u.stuck = 0; } }
  }
}

/** Separação suave entre unidades próximas (evita empilhamento). Chamado após todos moverem. */
export function applySeparation(state: GameState, rt: Runtime): void {
  const map = state.map;
  for (const u of state.units.values()) {
    if (u.dead) continue;
    const def = UNITS[u.type];
    if (def.immobile || def.flying) continue;
    if (u.state === 'pray') continue;
    let px = 0, py = 0;
    const r = def.radius;
    rt.hash.each(u.x, u.y, 1.2, (o) => {
      if (o === u || o.dead || UNITS[o.type].flying) return;
      const minD = r + UNITS[o.type].radius;
      const dx = u.x - o.x, dy = u.y - o.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 < 1e-8) { if (d2 < 1e-8) { px += ((u.id & 1) ? 0.01 : -0.01); py += ((u.id & 2) ? 0.01 : -0.01); } return; }
      const d = Math.sqrt(d2);
      const overlap = (minD - d) / minD;
      // quem está parado cede menos; quem se move cede mais
      const w = (u.state === 'idle' || u.state === 'hold') ? 0.35 : 0.6;
      px += (dx / d) * overlap * 0.12 * w;
      py += (dy / d) * overlap * 0.12 * w;
    });
    if (px !== 0 || py !== 0) {
      const nx = u.x + px, ny = u.y + py;
      if (inBounds(map, Math.floor(nx), Math.floor(ny)) && isPassable(map, Math.floor(nx), Math.floor(ny))) { u.x = nx; u.y = ny; }
    }
  }
}

// ---------------- Coleta ----------------
function updateGather(state: GameState, rt: Runtime, u: Unit, dt: number, speed: number): void {
  const player = state.players[u.owner];
  if (u.carryAmt >= CARRY_CAPACITY) { u.state = 'return'; u.path = null; return; }
  if (u.nodeId < 0) {
    // Fazenda
    const farm = state.buildings.get(-u.nodeId);
    if (!farm || farm.dead || !farm.complete) { if (!findNewSource(state, u, 'food')) fallbackIdle(state, u); return; }
    const d = distToRect(u.x, u.y, farm.tx, farm.ty, farm.w, farm.h);
    if (d > 0.9) { moveTowards(state, rt, u, speed * dt, farm.x, farm.y, { tx: farm.tx, ty: farm.ty, w: farm.w, h: farm.h }, 0.9, true); return; }
    if (farmGatherers(state, farm.id) > 1) { // fazenda lotada: procura outra
      const other = nearestFreeFarm(state, u.owner, u.x, u.y, 20);
      if (other && other.id !== farm.id) { u.nodeId = -other.id; u.path = null; return; }
    }
    const rate = GATHER_RATES.farm * player.mods.gather.food * player.mods.gather.farm;
    gatherInto(u, 'food', rate * dt);
    return;
  }
  const node = state.map.nodes.get(u.nodeId);
  if (!node || node.amount <= 0) {
    const res = u.carry ?? 'food';
    if (!findNewSource(state, u, res)) fallbackIdle(state, u);
    return;
  }
  const d = distToRect(u.x, u.y, node.x, node.y, 1, 1);
  if (d > 1.0) {
    // lotado ou inalcançável há muito tempo: procura outro nó do agrupamento
    if ((state.tick + u.id) % 40 === 0) {
      const crowded = nodeGatherers(state, node.id) > NODE_CAPACITY[node.type];
      const stuckLong = state.tick - u.orderTick > 30 * TICK_RATE;
      if (crowded || stuckLong) {
        const alt = nearestNodeWithRoom(state, u.x, u.y, node.type, stuckLong ? 12 : 6, node.id);
        if (alt) { u.nodeId = alt.id; u.path = null; u.orderTick = state.tick; return; }
        if (stuckLong) { fallbackIdle(state, u); return; }
      }
    }
    moveTowards(state, rt, u, speed * dt, node.x + 0.5, node.y + 0.5, { tx: node.x, ty: node.y, w: 1, h: 1 }, 1.0, true); return;
  }
  u.orderTick = state.tick;
  const res = NODE_RESOURCE[node.type];
  if (u.carry && u.carry !== res && u.carryAmt > 0) { u.state = 'return'; u.path = null; return; }
  let rate = GATHER_RATES[node.type] * player.mods.gather[res];
  if (HUNT_TYPES.has(node.type)) rate *= player.mods.gather.hunt;
  const take = Math.min(rate * dt, node.amount, CARRY_CAPACITY - u.carryAmt);
  node.amount -= take;
  gatherInto(u, res, take);
  if (node.amount <= 0.001) { depleteNode(state, node); }
}

function gatherInto(u: Unit, res: ResourceType, amt: number) {
  if (u.carry !== res) { u.carry = res; u.carryAmt = 0; }
  u.carryAmt += amt;
}

export function depleteNode(state: GameState, node: ResourceNode): void {
  removeNode(state.map, node.id);
  state.effects.push({ type: 'nodeGone', x: node.x + 0.5, y: node.y + 0.5, ttl: 1, total: 1, data: node.type });
}

/** Procura nova fonte do mesmo recurso perto da unidade (nó ou fazenda). */
function findNewSource(state: GameState, u: Unit, res: ResourceType): boolean {
  const node = nearestNodeWithRoom(state, u.x, u.y, res, 14) ?? nearestNode(state, u.x, u.y, res, 14);
  const farm = res === 'food' ? nearestFreeFarm(state, u.owner, u.x, u.y, 14) : null;
  if (node && (!farm || distToRect(u.x, u.y, node.x, node.y, 1, 1) <= distToRect(u.x, u.y, farm.tx, farm.ty, farm.w, farm.h))) { u.nodeId = node.id; u.path = null; u.state = 'gather'; u.orderTick = state.tick; return true; }
  if (farm) { u.nodeId = -farm.id; u.path = null; u.state = 'gather'; u.orderTick = state.tick; return true; }
  return false;
}

function fallbackIdle(state: GameState, u: Unit) {
  u.nodeId = -1;
  if (u.carryAmt > 0) { u.state = 'return'; u.path = null; return; }
  const p = state.players[u.owner];
  if (!p.isAI) state.events.push({ tick: state.tick, type: 'idleVillager', player: u.owner, x: u.x, y: u.y, text: 'Cidadão ocioso: recurso esgotado.' });
  finishOrder(state, u);
}

function updateReturn(state: GameState, rt: Runtime, u: Unit, dt: number, speed: number): void {
  if (!u.carry || u.carryAmt <= 0) { u.carry = null; u.carryAmt = 0; u.state = u.nodeId !== -1 ? 'gather' : 'idle'; u.path = null; return; }
  const drop = nearestDropoff(state, u.owner, u.x, u.y, u.carry);
  if (!drop) { finishOrder(state, u); return; }
  const d = distToRect(u.x, u.y, drop.tx, drop.ty, drop.w, drop.h);
  if (d > 0.9) { moveTowards(state, rt, u, speed * dt, drop.x, drop.y, { tx: drop.tx, ty: drop.ty, w: drop.w, h: drop.h }, 0.9, true); return; }
  const p = state.players[u.owner];
  p.resources[u.carry] += u.carryAmt; p.stats.gathered[u.carry] += u.carryAmt;
  u.carry = null; u.carryAmt = 0; u.path = null;
  if (u.nodeId !== -1) {
    const node = u.nodeId > 0 ? state.map.nodes.get(u.nodeId) : null;
    const farm = u.nodeId < 0 ? state.buildings.get(-u.nodeId) : null;
    if ((node && node.amount > 0) || (farm && !farm.dead)) { u.state = 'gather'; return; }
    const res: ResourceType = node ? NODE_RESOURCE[node.type] : 'food';
    if (findNewSource(state, u, res)) return;
  }
  finishOrder(state, u);
}

// ---------------- Construção ----------------
function updateBuild(state: GameState, rt: Runtime, u: Unit, dt: number, speed: number): void {
  const b = state.buildings.get(u.targetId);
  if (!b || b.dead || b.owner !== u.owner) { u.targetId = -1; finishOrder(state, u); return; }
  const player = state.players[u.owner];
  const def = BUILDINGS[b.type];
  const bst = getBuildingStats(state, player, b.type);
  if (b.complete && b.hp >= b.maxHp) { afterBuild(state, u, b); return; }
  const d = distToRect(u.x, u.y, b.tx, b.ty, b.w, b.h);
  if (d > 0.95) {
    if (state.tick - u.orderTick > 40 * TICK_RATE) { // obra inalcançável: desiste
      if (!player.isAI) state.events.push({ tick: state.tick, type: 'idleVillager', player: u.owner, x: u.x, y: u.y, text: `Não consigo alcançar ${def.name}.` });
      u.targetId = -1; finishOrder(state, u); return;
    }
    moveTowards(state, rt, u, speed * dt, b.x, b.y, { tx: b.tx, ty: b.ty, w: b.w, h: b.h }, 0.95, true); return;
  }
  u.path = null; u.orderTick = state.tick;
  if (!b.complete) {
    b.progress += dt * player.mods.player.buildSpeed;
    const frac = Math.min(1, b.progress / bst.buildTime);
    b.hp = Math.max(b.hp, Math.round(bst.hp * (0.1 + 0.9 * frac)));
    if (b.progress >= bst.buildTime) { b.hp = bst.hp; onBuildingComplete(state, b); if (!player.isAI && !def.wall && !def.farm) state.events.push({ tick: state.tick, type: 'built', player: u.owner, x: b.x, y: b.y, text: `${def.name} concluído.` }); afterBuild(state, u, b); }
  } else {
    // reparo: grátis, mas lento
    b.hp = Math.min(b.maxHp, b.hp + (bst.hp / bst.buildTime) * dt * 1.5);
    if (b.hp >= b.maxHp) afterBuild(state, u, b);
  }
}

/** Após concluir: cidadão passa a coletar na fazenda/ponto de entrega construído, ou fica ocioso. */
function afterBuild(state: GameState, u: Unit, b: Building): void {
  const def = BUILDINGS[b.type];
  u.targetId = -1; u.order = null; u.path = null;
  if (u.queue.length > 0) { u.state = 'idle'; startOrder(state, u, u.queue.shift()!); return; }
  if (def.farm && farmGatherers(state, b.id) < 1) { u.nodeId = -b.id; u.state = 'gather'; return; }
  if (def.dropoff && def.dropoff.length === 1) {
    const node = nearestNodeWithRoom(state, b.x, b.y, def.dropoff[0], 10) ?? nearestNode(state, b.x, b.y, def.dropoff[0], 10);
    if (node) { u.nodeId = node.id; u.state = 'gather'; u.orderTick = state.tick; return; }
  }
  if (def.worship) { u.state = 'pray'; u.nodeId = -b.id; return; }
  u.state = 'idle';
  if (!state.players[u.owner].isAI) state.events.push({ tick: state.tick, type: 'idleVillager', player: u.owner, x: u.x, y: u.y });
}

// ---------------- Utilidades para comandos ----------------
export function unitTileFree(state: GameState, x: number, y: number): boolean {
  const tx = Math.floor(x), ty = Math.floor(y);
  return inBounds(state.map, tx, ty) && state.map.blocked[idx(state.map, tx, ty)] === 0;
}
