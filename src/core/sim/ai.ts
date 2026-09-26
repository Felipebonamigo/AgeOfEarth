// Inteligência artificial dos oponentes: economia, construção, pesquisa, avanço de idade,
// exército (defesa, ondas de ataque, recuo) e uso de poderes divinos. Pensa a cada N segundos.
import { DIFFICULTIES, TICK_RATE, NODE_RESOURCE, RESOURCES, MARKET_TRADE_LOT, type ResourceType } from '../constants';
import { rectReachable, wouldSeal } from '../map/components';
import { AGES, BUILDINGS, MAJOR_GODS, MINOR_GODS, POWERS, TECHS, UNITS } from '../data';
import type { Building, GameState, Player, ResourceNode, Unit } from '../types';
import { idx, inBounds, isPassable, dist, centerFrame, frameOffset, frameCompare, type Frame } from '../map/grid';
import { applyCommand, canAdvanceAge, canResearch, canTrain, academyTechCount } from './commands';
import { canPlaceBuilding, countBuildings, buildingsOf, unitsOf } from './entities';
import { getRuntime } from './runtime';
import { isMilitary, isEnemy, nearestEnemyBuilding, nearestNode, nearestNodeWithRoom, nearestFreeFarm, countUnits, nodeHasRoom, centerDist2 } from './queries';
import { getBuildingStats, getUnitStats, techCost } from './modifiers';
import { canAfford } from './economy';
import { t } from '../../i18n';
import { isForbidden, maxAgeOf } from './restrictions';

const VILLAGER_TARGET = [18, 26, 34, 40, 44];
const FARM_LIMIT = [4, 8, 12, 16, 18];
const ARMY_ATTACK = [7, 12, 16, 20, 24];
const RESEARCH_PRIORITY = [
  'harvest1', 'axes1', 'hunting_dogs', 'picks1', 'oracles', 'wheel', 'civic1', 'commerce1', 'science1', 'phalanx', 'military1',
  'harvest2', 'axes2', 'picks2', 'bronze_armor', 'horse_breeding', 'masonry', 'civic2', 'commerce2', 'science2', 'military2', 'census',
  'irrigation', 'fortified_towns', 'iron_weapons', 'composite_bows', 'harvest3', 'axes3', 'picks3', 'barding', 'civic3', 'commerce3', 'science3', 'military3',
  'mythic_blood', 'divine_arms', 'sacred_rites', 'ballista_towers', 'logistics', 'civic4', 'military4', 'science4', 'commerce4', 'ballistics', 'civic5', 'military5', 'science5', 'commerce5', 'coinage',
];

interface Snapshot {
  villagers: Unit[]; idleVillagers: Unit[]; military: Unit[]; scouts: Unit[]; heroes: Unit[];
  buildings: Building[]; byType: Map<string, Building[]>; tc: Building | null; underConstruction: Building[];
  gatherers: Record<string, number>; enemies: Player[];
}

export function aiThink(state: GameState, player: Player): void {
  const ai = player.ai!;
  if (state.tick < ai.nextThink) return;
  const diff = DIFFICULTIES[ai.difficulty];
  ai.nextThink = state.tick + Math.round(diff.thinkEvery * TICK_RATE);
  const snap = snapshot(state, player);
  if (!snap.tc && snap.villagers.length === 0) return;
  tryAdvanceAge(state, player, snap);
  manageKing(state, player, snap);
  for (const h of snap.heroes) if (UNITS[h.type].ability && h.state === 'attack' && state.tick >= h.abilityReadyAt && h.inside === -1) applyCommand(state, { type: 'ability', player: player.id, unitId: h.id });
  // Relíquias: herói ocioso vai buscar a mais próxima; herói com relíquia leva ao Templo
  for (const h of snap.heroes) {
    if (h.inside !== -1 || player.ai!.attackTarget !== -1) continue;
    const carried = state.relics.find((r) => r.carrier === h.id);
    if (carried) {
      if (h.state === 'move') continue;
      const temple = (snap.byType.get('temple') ?? []).find((b) => b.complete);
      if (temple) {
        // lado do Templo voltado ao herói (antes: sempre o sul, a volta inteira para quem vinha do norte)
        const dx = h.x - temple.x, dy = h.y - temple.y;
        const side = Math.abs(dx) > Math.abs(dy) ? { x: temple.x + (dx < 0 ? -1 : 1) * (temple.w / 2 + 1), y: temple.y } : { x: temple.x, y: temple.y + (dy < 0 ? -1 : 1) * (temple.h / 2 + 1) };
        applyCommand(state, { type: 'move', player: player.id, ids: [h.id], x: side.x, y: side.y });
      }
    } else if (h.state === 'idle' && !h.order) {
      const ground = state.relics.filter((r) => r.carrier === -1 && r.templeId === -1).sort((a, b) => dist(a.x, a.y, h.x, h.y) - dist(b.x, b.y, h.x, h.y))[0];
      if (ground && dist(ground.x, ground.y, h.x, h.y) < 45) applyCommand(state, { type: 'move', player: player.id, ids: [h.id], x: ground.x, y: ground.y });
    }
  }
  manageEconomy(state, player, snap);
  manageBuilding(state, player, snap);
  manageTraining(state, player, snap);
  manageResearch(state, player, snap);
  manageArmy(state, player, snap);
  manageTrade(state, player, snap);
  manageScouts(state, player, snap);
  managePowers(state, player, snap);
}

function snapshot(state: GameState, player: Player): Snapshot {
  const units = unitsOf(state, player.id);
  const buildings = buildingsOf(state, player.id);
  const byType = new Map<string, Building[]>();
  for (const b of buildings) { const arr = byType.get(b.type) ?? []; arr.push(b); byType.set(b.type, arr); }
  const villagers = units.filter((u) => u.type === 'villager' && u.inside === -1 && !(u.state === 'pray' && u.nodeId < 0 && BUILDINGS[state.buildings.get(-u.nodeId)?.type ?? '']?.titanGate));   // sacerdotes do ritual (cenários) não são realocados
  const gatherers: Record<string, number> = { food: 0, wood: 0, gold: 0, favor: 0 };
  for (const v of villagers) {
    if (v.state === 'pray') gatherers.favor++;
    else if (v.state === 'gather' || v.state === 'return') {
      if (v.nodeId < 0) gatherers.food++;
      else { const n = state.map.nodes.get(v.nodeId); if (n) gatherers[NODE_RESOURCE[n.type]]++; else if (v.carry) gatherers[v.carry]++; }
    }
  }
  const tcs = byType.get('town_center') ?? [];
  return {
    villagers, idleVillagers: villagers.filter((u) => u.state === 'idle' && !u.order),
    military: units.filter((u) => isMilitary(u) && !UNITS[u.type].immobile && u.inside === -1),
    scouts: units.filter((u) => UNITS[u.type].tags.includes('scout')),
    heroes: units.filter((u) => UNITS[u.type].tags.includes('hero')),
    buildings, byType, tc: tcs.find((b) => b.complete) ?? tcs[0] ?? null, underConstruction: buildings.filter((b) => !b.complete),
    gatherers, enemies: state.players.filter((p) => isEnemy(state, player.id, p.id) && p.alive),
  };
}

// ---------------- Regicídio ----------------
/** Rei fora de um edifício vai para o Centro Cívico/Fortaleza mais próximo com vaga. */
function manageKing(state: GameState, player: Player, snap: Snapshot): void {
  if (state.config.mode !== 'regicide') return;
  const king = [...state.units.values()].find((u) => u.owner === player.id && !u.dead && UNITS[u.type].tags.includes('king'));
  if (!king || king.inside !== -1 || king.state === 'move') return;
  const shelter = snap.buildings.filter((b) => b.complete && (b.type === 'fortress' || b.type === 'town_center') && b.garrison.length < (BUILDINGS[b.type].garrison ?? 0)).sort((a, b) => dist(a.x, a.y, king.x, king.y) - dist(b.x, b.y, king.x, king.y))[0];
  if (shelter) applyCommand(state, { type: 'garrison', player: player.id, ids: [king.id], targetId: shelter.id });
}

// ---------------- Economia ----------------
function manageEconomy(state: GameState, player: Player, snap: Snapshot): void {
  const age = player.age;
  const target = VILLAGER_TARGET[age];
  const n = Math.max(snap.villagers.length, 1);
  let ratio: Record<string, number>;
  if (age === 0) ratio = { food: 0.42, wood: 0.38, gold: 0.2, favor: 0 };
  else if (age === 1) ratio = { food: 0.36, wood: 0.26, gold: 0.32, favor: 0.06 };
  else ratio = { food: 0.32, wood: 0.22, gold: 0.36, favor: 0.1 };
  const hasTemple = (snap.byType.get('temple') ?? []).some((b) => b.complete);
  if (!hasTemple) { ratio.food += ratio.favor; ratio.favor = 0; }
  // Pondera pela escassez em relação ao próximo objetivo (próxima idade + reserva para construções)
  const next = AGES[Math.min(AGES.length - 1, age + 1)];
  const need: Record<string, number> = { food: (next.cost.food ?? 0) + 200, wood: (next.cost.wood ?? 0) + 350, gold: (next.cost.gold ?? 0) + 150, favor: 0 };
  let sum = 0;
  for (const r of ['food', 'wood', 'gold', 'favor']) {
    const shortage = Math.max(0, need[r] - (player.resources[r as ResourceType] ?? 0));
    ratio[r] = ratio[r] * (1 + shortage / 350);
    sum += ratio[r];
  }
  const want: Record<string, number> = {};
  for (const r of ['food', 'wood', 'gold', 'favor']) want[r] = Math.round((ratio[r] / sum) * Math.min(n, target));
  const idle = snap.idleVillagers.slice();
  // Rebalanceamento suave: se um recurso está muito acima do desejado, libera um coletor
  if (idle.length === 0 && state.tick % (TICK_RATE * 8) < TICK_RATE * 2) {
    for (const r of ['food', 'wood', 'gold', 'favor']) {
      if (snap.gatherers[r] > want[r] + 2) {
        const v = snap.villagers.find((u) => gatherResourceOf(state, u) === r);
        if (v) { applyCommand(state, { type: 'stop', player: player.id, ids: [v.id] }); idle.push(v); break; }
      }
    }
  }
  const counts = { ...snap.gatherers };
  for (const v of idle) {
    let bestR = 'food', bestDef = -Infinity;
    for (const r of ['food', 'wood', 'gold', 'favor']) { const d = want[r] - counts[r]; if (d > bestDef) { bestDef = d; bestR = r; } }
    if (assignGatherer(state, player, v, bestR, snap)) counts[bestR]++;
    else if (bestR !== 'food' && assignGatherer(state, player, v, 'food', snap)) counts.food++;
    else if (assignGatherer(state, player, v, 'wood', snap)) counts.wood++;
  }
}

function gatherResourceOf(state: GameState, u: Unit): string | null {
  if (u.state === 'pray') return 'favor';
  if (u.state !== 'gather' && u.state !== 'return') return null;
  if (u.nodeId < 0) return 'food';
  const n = state.map.nodes.get(u.nodeId);
  return n ? NODE_RESOURCE[n.type] : (u.carry ?? null);
}

function assignGatherer(state: GameState, player: Player, v: Unit, r: string, snap: Snapshot): boolean {
  const anchor = snap.tc ?? { x: v.x, y: v.y };
  if (r === 'favor') {
    const temple = (snap.byType.get('temple') ?? []).find((b) => b.complete);
    if (!temple) return false;
    applyCommand(state, { type: 'pray', player: player.id, ids: [v.id], targetId: temple.id });
    return true;
  }
  const res = r as ResourceType;
  const drop = nearestDropoffFor(state, player, res, anchor.x, anchor.y);
  if (res === 'food') {
    const node = nearestNodeWithRoom(state, v.x, v.y, 'food', 22) ?? nearestNodeWithRoom(state, anchor.x, anchor.y, 'food', 30);
    const farm = nearestFreeFarm(state, player.id, v.x, v.y, 30);
    const nodeFar = node ? distToDrop(node.x + 0.5, node.y + 0.5, drop) : Infinity;
    if (node && nodeFar <= 11 && (!farm || dist(v.x, v.y, node.x + 0.5, node.y + 0.5) < dist(v.x, v.y, farm.x, farm.y) + 6)) { applyCommand(state, { type: 'gather', player: player.id, ids: [v.id], targetId: node.id }); return true; }
    if (farm) { applyCommand(state, { type: 'gather', player: player.id, ids: [v.id], targetId: farm.id }); return true; }
    // constrói fazenda perto do ponto de entrega
    const farms = countBuildings(state, player.id, (b) => b.type === 'farm');
    if (farms < FARM_LIMIT[player.age] && canAfford(player, BUILDINGS.farm.cost as Record<string, number>)) {
      const near = (snap.byType.get('granary') ?? []).find((b) => b.complete) ?? snap.tc;
      if (near) {
        const spot = findBuildSpot(state, player, 'farm', near.x, near.y, 2, 9);
        if (spot) { applyCommand(state, { type: 'build', player: player.id, ids: [v.id], building: 'farm', tx: spot.x, ty: spot.y }); return true; }
      }
    }
    if (node) { applyCommand(state, { type: 'gather', player: player.id, ids: [v.id], targetId: node.id }); return true; }
    return false;
  }
  // só nós com caminho por terra a partir do cidadão; se os veios perto acabaram, procura longe (a IA constrói um ponto de entrega lá depois)
  const fx = Math.floor(v.x), fy = Math.floor(v.y);
  const reach = (n: ResourceNode) => rectReachable(state.map, fx, fy, n.x, n.y, 1, 1, true);
  const node = nearestNode(state, v.x, v.y, res, 24, -1, (n) => nodeHasRoom(state, n) && reach(n))
    ?? nearestNode(state, anchor.x, anchor.y, res, 34, -1, (n) => nodeHasRoom(state, n) && reach(n))
    ?? nearestNode(state, anchor.x, anchor.y, res, 34, -1, reach)
    ?? nearestNode(state, anchor.x, anchor.y, res, 70, -1, (n) => nodeHasRoom(state, n) && reach(n));
  if (!node) return false;
  applyCommand(state, { type: 'gather', player: player.id, ids: [v.id], targetId: node.id });
  return true;
}

function nearestDropoffFor(state: GameState, player: Player, res: ResourceType, x: number, y: number): Building | null {
  let best: Building | null = null, bestD = Infinity;
  for (const b of state.buildings.values()) {
    if (b.owner !== player.id || b.dead || !b.complete) continue;
    const d = BUILDINGS[b.type].dropoff;
    if (!d || !d.includes(res)) continue;
    const dd = dist(b.x, b.y, x, y);
    if (dd < bestD) { bestD = dd; best = b; }
  }
  return best;
}
function distToDrop(x: number, y: number, drop: Building | null): number { return drop ? dist(x, y, drop.x, drop.y) : Infinity; }

/** Agrupamentos de recursos sendo coletados por ≥3 cidadãos e longe (>7) de qualquer ponto de entrega. */
function neededDropoffs(state: GameState, player: Player, snap: Snapshot): { type: string; x: number; y: number }[] {
  const out: { type: string; x: number; y: number }[] = [];
  const dropType: Record<string, string> = { food: 'granary', wood: 'lumber_camp', gold: 'mine' };
  for (const res of ['food', 'wood', 'gold'] as ResourceType[]) {
    const pts: { x: number; y: number }[] = [];
    for (const v of snap.villagers) {
      if (v.nodeId <= 0 || (v.state !== 'gather' && v.state !== 'return')) continue;
      const n = state.map.nodes.get(v.nodeId);
      if (!n || NODE_RESOURCE[n.type] !== res) continue;
      const nx = n.x + 0.5, ny = n.y + 0.5;   // centro do tile (o canto não é simétrico por espelho)
      const drop = nearestDropoffFor(state, player, res, nx, ny);
      if (distToDrop(nx, ny, drop) > 7) pts.push({ x: nx, y: ny });
    }
    if (pts.length >= 3) out.push({ type: dropType[res], x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length });
  }
  return out;
}

// ---------------- Construção ----------------
function manageBuilding(state: GameState, player: Player, snap: Snapshot): void {
  if (!snap.tc) {
    // Sem centro cívico: tenta reconstruir se houver cidadãos
    const v = snap.villagers[0];
    if (v && canAfford(player, BUILDINGS.town_center.cost as Record<string, number>)) {
      const spot = findBuildSpot(state, player, 'town_center', v.x, v.y, 1, 10, true);
      if (spot) applyCommand(state, { type: 'build', player: player.id, ids: snap.villagers.slice(0, 4).map((u) => u.id), building: 'town_center', tx: spot.x, ty: spot.y });
    }
    return;
  }
  // Garante que obras em andamento tenham construtores; cancela obras paradas há muito tempo
  let active = 0;
  for (const b of snap.underConstruction) {
    if (b.type === 'titan_gate' && state.scenario) continue;   // em cenários, o Portal segue o ritual do roteiro
    const builders = snap.villagers.filter((u) => u.state === 'build' && u.targetId === b.id).length;
    const stalled = state.tick - b.builtTick > 90 * TICK_RATE && b.progress < 5;
    if (stalled) { applyCommand(state, { type: 'cancel', player: player.id, buildingId: b.id, index: -1 }); continue; }
    if (builders === 0) {
      const v = pickBuilder(state, snap, b.x, b.y);
      if (v) applyCommand(state, { type: 'repair', player: player.id, ids: [v.id], targetId: b.id });
    }
    active++;
  }
  if (active >= 3 || snap.villagers.length < 3) return;
  const has = (t: string) => (snap.byType.get(t) ?? []).length;
  const age = player.age;
  const tc = snap.tc;
  const enemyDir = enemyDirection(state, player, tc);
  // casas: âncora num dos quatro "cantos" do CC escolhido pela personalidade, no referencial voltado ao centro do mapa (antes
  // era absoluto: "sul do CC" ficava à frente para quem começa ao norte e atrás para quem começa ao sul)
  const houseAnchor = frameOffset(centerFrame(state.map, tc.x, tc.y), tc.x, tc.y, player.ai!.personality % 2 ? 7 : -7, player.ai!.personality % 3 ? 5 : -5);
  const plan: { type: string; anchorX: number; anchorY: number; minR: number; maxR: number; cond: boolean }[] = [
    { type: 'house', anchorX: houseAnchor.x, anchorY: houseAnchor.y, minR: 0, maxR: 14, cond: player.popCap - player.pop <= 6 && has('house') < 25 },
    { type: 'temple', anchorX: tc.x, anchorY: tc.y, minR: 4, maxR: 12, cond: snap.villagers.length >= 8 && has('temple') === 0 },
    { type: 'barracks', anchorX: tc.x + enemyDir.x * 6, anchorY: tc.y + enemyDir.y * 6, minR: 1, maxR: 10, cond: snap.villagers.length >= 10 && has('barracks') === 0 },
    { type: 'academy', anchorX: tc.x, anchorY: tc.y, minR: 3, maxR: 16, cond: age >= 1 && has('academy') === 0 },
    { type: 'stable', anchorX: tc.x + enemyDir.x * 6, anchorY: tc.y + enemyDir.y * 6, minR: 1, maxR: 10, cond: age >= 1 && has('stable') === 0 && snap.villagers.length >= 16 },
    { type: 'market', anchorX: tc.x, anchorY: tc.y, minR: 3, maxR: 16, cond: age >= 1 && has('market') === 0 && snap.villagers.length >= 14 },
    { type: 'tower', anchorX: tc.x + enemyDir.x * 8, anchorY: tc.y + enemyDir.y * 8, minR: 0, maxR: 6, cond: has('tower') < 1 + age && snap.villagers.length >= 12 && player.resources.wood > 250 },
    { type: 'barracks', anchorX: tc.x + enemyDir.x * 7, anchorY: tc.y + enemyDir.y * 7, minR: 1, maxR: 10, cond: age >= 2 && has('barracks') < 2 },
    { type: 'siege_workshop', anchorX: tc.x + enemyDir.x * 5, anchorY: tc.y + enemyDir.y * 5, minR: 1, maxR: 10, cond: age >= 2 && has('siege_workshop') === 0 },
    { type: 'fortress', anchorX: tc.x + enemyDir.x * 9, anchorY: tc.y + enemyDir.y * 9, minR: 0, maxR: 8, cond: age >= 2 && has('fortress') === 0 && player.resources.wood > 500 },
    { type: 'academy', anchorX: tc.x, anchorY: tc.y, minR: 4, maxR: 12, cond: age >= 2 && has('academy') < 2 && player.resources.gold > 400 },
    { type: 'wonder_' + wonderChoice(player), anchorX: tc.x, anchorY: tc.y, minR: 4, maxR: 14, cond: age >= 3 && countBuildings(state, player.id, (b) => !!BUILDINGS[b.type].wonder) === 0 && player.resources.gold > 1500 && player.resources.wood > 1500 },
    { type: 'titan_gate', anchorX: tc.x, anchorY: tc.y, minR: 4, maxR: 14, cond: age >= 4 && has('titan_gate') === 0 },
  ];
  for (const d of neededDropoffs(state, player, snap)) {
    if (countBuildings(state, player.id, (b) => b.type === d.type) >= 4) continue;
    plan.splice(1, 0, { type: d.type, anchorX: d.x, anchorY: d.y, minR: 1, maxR: 5, cond: true });
  }
  for (const p of plan) {
    if (!p.cond) continue;
    const def = BUILDINGS[p.type];
    if (!def || def.age > age || isForbidden(state, player.id, 'buildings', p.type)) continue;   // G6: config.forbid
    const bcost = getBuildingStats(state, player, p.type).cost;
    if (!canAfford(player, bcost)) { if (p.type === 'house') return; continue; }
    // (o mercado é essencial: é a válvula de escape quando o ouro acaba e a comida sobra)
    const essential = ['house', 'temple', 'academy', 'granary', 'lumber_camp', 'mine', 'farm', 'barracks', 'fortress', 'market'].includes(p.type) || p.type.startsWith('wonder') || p.type === 'titan_gate';
    if (!essential && (bcost.gold ?? 0) > player.resources.gold - budgetOf(state, player).reserveGold) continue;
    let spot = findBuildSpot(state, player, p.type, p.anchorX, p.anchorY, p.minR, p.maxR);
    if (!spot) {
      // tenta ao redor de outros edifícios que projetam fronteira (outros centros, fortalezas, templos)
      for (const b of snap.buildings) {
        if (b === tc || !b.complete || !BUILDINGS[b.type].territory) continue;
        spot = findBuildSpot(state, player, p.type, b.x, b.y, 2, 12);
        if (spot) break;
      }
      if (!spot) spot = findBuildSpot(state, player, p.type, tc.x, tc.y, 1, 18);
    }
    if (!spot) continue;
    const v = pickBuilder(state, snap, spot.x + def.w / 2, spot.y + def.h / 2);   // centro da pegada, não o canto
    if (!v) return;
    const extra = def.buildTime > 60 ? snap.villagers.filter((u) => u !== v && (u.state === 'idle' || gatherResourceOf(state, u) === 'wood')).slice(0, 2) : [];
    const r = applyCommand(state, { type: 'build', player: player.id, ids: [v.id, ...extra.map((u) => u.id)], building: p.type, tx: spot.x, ty: spot.y });
    if (r.ok) return;
  }
  // Expansão: novo Centro Cívico quando permitido
  const tcs = has('town_center');
  if (tcs < player.mods.player.cityLimit && snap.villagers.length >= 15 && state.tick - player.ai!.lastExpand > 60 * TICK_RATE && canAfford(player, getBuildingStats(state, player, 'town_center').cost)) {
    player.ai!.lastExpand = state.tick;
    const gold = nearestUnclaimedNode(state, player, tc, 'gold');
    const anchor = gold ? { x: gold.x, y: gold.y } : { x: tc.x + enemyDir.x * -14, y: tc.y + enemyDir.y * -14 };
    const spot = findBuildSpot(state, player, 'town_center', anchor.x, anchor.y, 3, 10, true);
    if (spot) {
      const v = pickBuilder(state, snap, spot.x + BUILDINGS.town_center.w / 2, spot.y + BUILDINGS.town_center.h / 2);
      const others = snap.villagers.filter((u) => u !== v).slice(0, 2);
      if (v) applyCommand(state, { type: 'build', player: player.id, ids: [v.id, ...others.map((u) => u.id)], building: 'town_center', tx: spot.x, ty: spot.y });
    }
  }
}

function wonderChoice(player: Player): string { return ['zeus', 'artemis', 'colossus'][player.ai!.personality % 3]; }


function nearestUnclaimedNode(state: GameState, player: Player, from: Building, res: ResourceType) {
  let best: { x: number; y: number } | null = null, bestD = Infinity;
  for (const n of state.map.nodes.values()) {
    if (NODE_RESOURCE[n.type] !== res) continue;
    const owner = state.territory[idx(state.map, n.x, n.y)];
    if (owner !== -1 && owner !== player.id) continue;
    // centro do nó (o canto deixava o ouro do norte 1 tile "mais perto" que o do sul); empate → mais longe do centro do mapa,
    // depois b e a no referencial do CC voltado ao centro (a ordem dos ids seguia o norte→sul do arquivo)
    const nx = n.x + 0.5, ny = n.y + 0.5;
    const d = dist(nx, ny, from.x, from.y);
    if (d < 10 || d > 26 || d > bestD) continue;
    if (d === bestD && best) {
      const c = centerDist2(state.map, nx, ny), bc = centerDist2(state.map, best.x, best.y);
      if (c < bc || (c === bc && frameCompare(centerFrame(state.map, from.x, from.y), nx - from.x, ny - from.y, best.x - from.x, best.y - from.y) >= 0)) continue;
    }
    bestD = d; best = { x: nx, y: ny };
  }
  return best;
}

function enemyDirection(state: GameState, player: Player, tc: Building): { x: number; y: number } {
  let ex = 0, ey = 0, n = 0;
  for (const b of state.buildings.values()) {
    if (!isEnemy(state, player.id, b.owner) || b.dead || b.type !== 'town_center' || !state.players[b.owner].alive) continue;
    ex += b.x; ey += b.y; n++;
  }
  // sem CC inimigo à vista: rumo ao centro do mapa (antes: sempre o sul)
  const dx = n === 0 ? state.map.w / 2 - tc.x : ex / n - tc.x, dy = n === 0 ? state.map.h / 2 - tc.y : ey / n - tc.y;
  if (dx === 0 && dy === 0) return { x: 0, y: 1 };
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / d, y: dy / d };
}

function pickBuilder(state: GameState, snap: Snapshot, x: number, y: number): Unit | null {
  const cands = snap.villagers.filter((u) => u.state !== 'build');
  let best: Unit | null = null, bestScore = Infinity;
  for (const u of cands) {
    let s = dist(u.x, u.y, x, y);
    if (u.state === 'idle') s -= 8;
    else if (u.state === 'pray') s += 4;
    else if (gatherResourceOf(state, u) === 'wood') s -= 2;
    if (s < bestScore) { bestScore = s; best = u; }
  }
  return best;
}

/**
 * Ordem dos cantos candidatos de findBuildSpot, relativa a floor(âncora): depende só da pegada (w×h), do raio máximo e da
 * parte fracionária do âncora, então fica em cache (antes cada chamada ordenava ~1500 candidatos: +11 % no tick). Os
 * deslocamentos são calculados como (i + w/2) − frac, que em ponto flutuante é o mesmo número que (x + w/2) − âncora (a
 * subtração é exata ou arredondada uma vez do mesmo valor real): a ordem é bit a bit a da ordenação direta. O cache não faz
 * parte do estado: é função pura da chave, e qualquer conteúdo dele dá o mesmo resultado (determinismo preservado).
 */
interface SpotOrder { di: Int16Array; dj: Int16Array; s: Float64Array; ch: Float64Array }
const spotOrderCache = new Map<string, SpotOrder>();
const SPOT_ORDER_CACHE_MAX = 128;
function spotOrder(w: number, h: number, maxR: number, rx: number, ry: number): SpotOrder {
  const key = `${w},${h},${maxR},${rx},${ry}`;
  const hit = spotOrderCache.get(key);
  if (hit) return hit;
  const i0 = Math.floor(rx - w / 2 - maxR) - 1, i1 = Math.ceil(rx - w / 2 + maxR) + 1;
  const j0 = Math.floor(ry - h / 2 - maxR) - 1, j1 = Math.ceil(ry - h / 2 + maxR) + 1;
  const list: { i: number; j: number; s: number; ch: number }[] = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const dx = (i + w / 2) - rx, dy = (j + h / 2) - ry;
    const ch = Math.max(Math.abs(dx), Math.abs(dy));
    if (ch > maxR + 0.5) continue;
    list.push({ i, j, s: dx * dx + dy * dy, ch });
  }
  list.sort((p, q) => p.s - q.s || p.j - q.j || p.i - q.i);
  const o: SpotOrder = { di: Int16Array.from(list, (e) => e.i), dj: Int16Array.from(list, (e) => e.j), s: Float64Array.from(list, (e) => e.s), ch: Float64Array.from(list, (e) => e.ch) };
  if (spotOrderCache.size >= SPOT_ORDER_CACHE_MAX) spotOrderCache.delete(spotOrderCache.keys().next().value!);
  spotOrderCache.set(key, o);
  return o;
}

/**
 * Verdadeiro se uma pegada w×h não passável em (x, y) tiraria o último tile livre em volta de algum nó de recurso vizinho que
 * hoje tem acesso (nodeAccessTiles > 0). Árvores do miolo de um bosque (já sem acesso) não contam.
 */
export function sealsNode(map: GameState['map'], x: number, y: number, w: number, h: number): boolean {
  const inside = (xx: number, yy: number) => xx >= x && xx < x + w && yy >= y && yy < y + h;
  for (let ny = y - 1; ny <= y + h; ny++) for (let nx = x - 1; nx <= x + w; nx++) {
    if (inside(nx, ny) || !inBounds(map, nx, ny) || map.nodeAt[idx(map, nx, ny)] === -1) continue;
    let before = 0, after = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const tx = nx + dx, ty = ny + dy;
      if (!inBounds(map, tx, ty) || map.blocked[idx(map, tx, ty)] !== 0) continue;
      before++;
      if (!inside(tx, ty)) after++;
    }
    if (before > 0 && after === 0) return true;
  }
  return false;
}

/**
 * Procura um local válido para o edifício, com margem de 1 tile livre em volta. Candidatos: cantos cuja pegada tem o centro a
 * distância de Chebyshev ∈ [minR, maxR + 0,5] do âncora, em ordem de distância euclidiana âncora → centro da pegada (empate:
 * mais longe do centro do mapa, depois b e a no centerFrame do âncora — frameCompare). Antes era uma espiral pelo canto
 * superior esquerdo que testava o norte primeiro: a pegada crescia para o sul e minR contava do canto, então
 * templo/mercado/casas iam sempre ao sul do CC — à frente para quem começa ao norte, atrás para quem começa ao sul.
 */
export function findBuildSpot(state: GameState, player: Player, type: string, ax: number, ay: number, minR: number, maxR: number, ignoreLimits = false): { x: number; y: number } | null {
  const def = BUILDINGS[type];
  const map = state.map;
  const needsMargin = !!(def.trains || def.dropoff || def.worship || def.scholars || def.trade || def.wonder || def.titanGate);
  const ok = (x: number, y: number): boolean => {
    if (!canPlaceBuilding(state, player, type, x, y, ignoreLimits).ok) return false;
    // nunca fecha a passagem local (corredor de saída da base, gargalo do mapa)
    if (!def.passable && !def.wall && wouldSeal(map, x, y, def.w, def.h)) return false;
    // nem o último acesso de um recurso (ex.: uma mina encostada no único veio de ouro da base: sem tile livre em volta, o nó
    // some para nearestNode e os mineiros atravessavam o mapa atrás de outro)
    if (!def.passable && sealsNode(map, x, y, def.w, def.h)) return false;
    if (!needsMargin) return true;
    // margem: nenhum edifício não passável nos tiles ao redor (mantém corredores para as unidades saírem)
    for (let yy = y - 1; yy <= y + def.h; yy++) for (let xx = x - 1; xx <= x + def.w; xx++) {
      if (!inBounds(map, xx, yy)) return false;
      const i = idx(map, xx, yy);
      const bid = map.buildingAt[i];
      if (bid !== -1) { const ob = state.buildings.get(bid); if (ob && !BUILDINGS[ob.type].passable && !def.passable) return false; }
      if (def.farm && map.nodeAt[i] === -1 && !isPassable(map, xx, yy) && map.buildingAt[i] === -1) return false;
    }
    return true;
  };
  const bx = Math.floor(ax), by = Math.floor(ay);
  const o = spotOrder(def.w, def.h, maxR, ax - bx, ay - by);
  const n = o.s.length;
  const mcx = map.w / 2, mcy = map.h / 2;
  const centerD = (t: number) => { const fx = bx + o.di[t] + def.w / 2, fy = by + o.dj[t] + def.h / 2; return (fx - mcx) * (fx - mcx) + (fy - mcy) * (fy - mcy); };
  let frame: Frame | null = null;   // referencial do âncora, só se houver empate
  for (let k = 0; k < n;) {
    let e = k + 1;
    while (e < n && o.s[e] === o.s[k]) e++;
    if (e === k + 1) {
      if (o.ch[k] >= minR && ok(bx + o.di[k], by + o.dj[k])) return { x: bx + o.di[k], y: by + o.dj[k] };
    } else {
      // empate de distância ao âncora (espelhos em torno dele): o mais longe do centro do mapa, depois b e a no referencial do
      // âncora voltado ao centro (em (y, x) absolutos, um início na diagonal do mapa — o Estreito — escolhia o norte onde o
      // espelho pedia o leste: candidatos refletidos na diagonal empatam em distância ao âncora e ao centro)
      const run: number[] = [];
      for (let t = k; t < e; t++) if (o.ch[t] >= minR) run.push(t);
      if (run.length > 1) { const f = frame ??= centerFrame(map, ax, ay); run.sort((p, q) => centerD(q) - centerD(p) || frameCompare(f, o.di[p], o.dj[p], o.di[q], o.dj[q])); }
      for (const t of run) if (ok(bx + o.di[t], by + o.dj[t])) return { x: bx + o.di[t], y: by + o.dj[t] };
    }
    k = e;
  }
  return null;
}

// ---------------- Treinamento ----------------
function manageTraining(state: GameState, player: Player, snap: Snapshot): void {
  const saving = savingForAge(state, player);
  const budget = budgetOf(state, player);
  // Cidadãos
  const target = VILLAGER_TARGET[player.age];
  const queuedV = snap.buildings.reduce((n, b) => n + b.queue.filter((q) => q.kind === 'unit' && q.id === 'villager').length, 0);
  if (snap.villagers.length + queuedV < target) {
    for (const tc of snap.byType.get('town_center') ?? []) {
      if (!tc.complete || tc.queue.length >= 2) continue;
      if (canTrain(state, player, tc, 'villager').ok) applyCommand(state, { type: 'train', player: player.id, buildingId: tc.id, unit: 'villager' });
    }
  }
  // Filósofos
  for (const ac of snap.byType.get('academy') ?? []) {
    if (!ac.complete || ac.queue.length > 0) continue;
    if ((ac.scholars < 3 && player.resources.gold >= 100) || (ac.scholars < 5 && player.resources.gold > budget.reserveGold + 150)) applyCommand(state, { type: 'hireScholar', player: player.id, buildingId: ac.id });
  }
  const defending = state.tick - player.ai!.defending < 15 * TICK_RATE;
  const armyOk = snap.military.length >= budget.minArmy;
  const emergency = defending && snap.military.length < budget.minArmy * 0.6;
  // Só cresce o exército além do mínimo quando o fundo da próxima idade já está garantido (ou sob ataque)
  if (!defending && snap.military.length >= budget.minArmy * 1.6 && !budget.fundMet) { void saving; return; }
  const academies = (snap.byType.get('academy') ?? []).filter((b) => b.complete);
  const scholars = academies.reduce((n, b) => n + b.scholars, 0);
  const goldReserve = (emergency ? 0 : budget.reserveGold) + (player.age >= 1 && (academies.length === 0 || scholars < 3) ? 120 : 40);
  const foodReserve = (emergency ? 0 : budget.reserveFood) + 100;
  // Heróis e criaturas míticas
  for (const t of snap.byType.get('temple') ?? []) {
    if (!t.complete || t.queue.length > 0) continue;
    if (!emergency && player.resources.gold < budget.reserveGold + 100) continue;
    const heroes = ['perseus', 'achilles', 'heracles', 'odysseus', 'jason'];
    let trained = false;
    for (const h of heroes) { if (canTrain(state, player, t, h).ok) { applyCommand(state, { type: 'train', player: player.id, buildingId: t.id, unit: h }); trained = true; break; } }
    if (trained) continue;
    const myths = (BUILDINGS.temple.trains ?? []).filter((u) => UNITS[u].tags.includes('myth') && !UNITS[u].tags.includes('scout') && canTrain(state, player, t, u).ok);
    if (myths.length > 0 && player.resources.favor > 40) { const pick = myths[myths.length - 1]; applyCommand(state, { type: 'train', player: player.id, buildingId: t.id, unit: pick }); }
  }
  // Exército humano
  const mix = armyMix(state, player, snap);
  for (const b of snap.buildings) {
    const def = BUILDINGS[b.type];
    if (!b.complete || !def.military || !def.trains || b.queue.length >= 2) continue;
    if (player.pop + 3 > player.popCap) break;
    if (player.resources.gold < goldReserve || player.resources.food < foodReserve) break;
    const options = def.trains.filter((u) => canTrain(state, player, b, u).ok && !UNITS[u].tags.includes('hero') && !UNITS[u].tags.includes('scout'));
    if (options.length === 0) continue;
    // escolhe a opção com maior peso no mix, preferindo unidades da idade mais alta disponível
    let best = options[0], bestW = -1;
    for (const o of options) { const w = (mix[UNITS[o].cls] ?? 0.1) * (1 + UNITS[o].age * 0.5); if (w > bestW) { bestW = w; best = o; } }
    applyCommand(state, { type: 'train', player: player.id, buildingId: b.id, unit: best });
  }
}

function armyMix(state: GameState, player: Player, snap: Snapshot): Record<string, number> {
  const mix: Record<string, number> = { infantry: 0.45, archer: 0.3, cavalry: 0.2, siege: 0.05, skirmisher: 0.0 };
  if (player.age >= 2) { mix.siege = 0.15; mix.infantry = 0.4; mix.archer = 0.25; }
  // contra-composição
  let eInf = 0, eArc = 0, eCav = 0, eTotal = 0;
  for (const e of snap.enemies) for (const u of state.units.values()) {
    if (u.owner !== e.id || u.dead || !isMilitary(u)) continue;
    const c = UNITS[u.type].cls; eTotal++;
    if (c === 'infantry' || c === 'hero') eInf++; else if (c === 'archer') eArc++; else if (c === 'cavalry') eCav++;
  }
  if (eTotal > 5) {
    if (eCav / eTotal > 0.4) { mix.infantry += 0.2; mix.archer -= 0.1; }
    if (eArc / eTotal > 0.4) { mix.cavalry += 0.2; mix.skirmisher += 0.15; mix.infantry -= 0.1; }
    if (eInf / eTotal > 0.5) { mix.archer += 0.2; mix.cavalry -= 0.1; }
  }
  // já temos muitos de uma classe? reduz
  const mine: Record<string, number> = {};
  for (const u of snap.military) mine[UNITS[u.type].cls] = (mine[UNITS[u.type].cls] ?? 0) + 1;
  const total = Math.max(1, snap.military.length);
  for (const k of Object.keys(mix)) mix[k] = Math.max(0.02, mix[k] - ((mine[k] ?? 0) / total) * 0.5);
  return mix;
}

// ---------------- Orçamento ----------------
const MIN_ARMY = [6, 10, 14, 18, 22];
interface Budget { surplus: Record<string, number>; fundMet: boolean; minArmy: number; reserveGold: number; reserveFood: number }
/** Fundo para a próxima idade: sobra de recursos além do custo do avanço (com pequena reserva). */
function budgetOf(state: GameState, player: Player): Budget {
  const diff = DIFFICULTIES[player.ai!.difficulty];
  const next = AGES[Math.min(AGES.length - 1, player.age + 1)];
  const done = player.age >= maxAgeOf(state, player.id);   // G6: na Idade máxima da missão não junta fundo para avançar
  const surplus: Record<string, number> = {};
  for (const r of ['food', 'wood', 'gold', 'knowledge', 'favor']) surplus[r] = player.resources[r as ResourceType] - (done ? 0 : ((next.cost as Record<string, number>)[r] ?? 0));
  const fundMet = done || (surplus.food >= 0 && surplus.gold >= 0 && surplus.knowledge >= 0 && surplus.favor >= 0);
  // Reserva intocável para o avanço de idade (a partir do momento em que o Templo existe)
  let hasTemple = false;
  for (const b of state.buildings.values()) if (b.owner === player.id && !b.dead && b.complete && b.type === 'temple') { hasTemple = true; break; }
  const reserveOn = !done && (player.age >= 1 || hasTemple);
  const reserveGold = reserveOn ? Math.min(player.resources.gold, ((next.cost as Record<string, number>).gold ?? 0)) : 0;
  const reserveFood = reserveOn ? Math.min(player.resources.food, ((next.cost as Record<string, number>).food ?? 0) * 0.6) : 0;
  return { surplus, fundMet, minArmy: Math.round(MIN_ARMY[player.age] * diff.armyMult), reserveGold, reserveFood };
}

// ---------------- Pesquisa e idades ----------------
function savingForAge(state: GameState, player: Player): boolean {
  if (player.age >= AGES.length - 1) return false;
  const c = canAdvanceAge(state, player);
  // Requisitos cumpridos mas sem recursos → economiza
  return !c.ok && c.reason === t('err.noResources');
}

function tryAdvanceAge(state: GameState, player: Player, snap: Snapshot): void {
  const tc = (snap.byType.get('town_center') ?? []).find((b) => b.complete && b.queue.length === 0);
  if (!tc) return;
  if (player.age === 0 && snap.villagers.length < 12) return;
  const c = canAdvanceAge(state, player, tc);
  if (!c.ok) return;
  let minor: string | undefined;
  if (c.minorOptions && c.minorOptions.length > 0) minor = c.minorOptions[(player.ai!.personality + player.age) % c.minorOptions.length];
  applyCommand(state, { type: 'advanceAge', player: player.id, buildingId: tc.id, minorGod: minor });
}

function manageResearch(state: GameState, player: Player, snap: Snapshot): void {
  const budget = budgetOf(state, player);
  const godTechs: string[] = [];
  for (const g of player.minorGods) godTechs.push(...(MINOR_GODS[g]?.techs ?? []));
  const list = [...RESEARCH_PRIORITY.slice(0, 12), ...godTechs, ...RESEARCH_PRIORITY.slice(12)];
  let researchedThisThink = 0;
  for (const t of list) {
    if (researchedThisThink >= 2) break;
    const def = TECHS[t];
    if (!def || player.techs.includes(t)) continue;
    const b = (snap.byType.get(def.building) ?? []).find((x) => x.complete && x.queue.length === 0);
    if (!b) continue;
    if (!canResearch(state, player, b, t).ok) continue;
    const cost = techCost(player, t);
    const isLine = !!def.line;
    const cheap = ((cost.gold ?? 0) + (cost.food ?? 0) * 0.5) < 160;
    // Linhas da Academia além do exigido pela próxima Idade só depois de juntar o fundo (senão o ouro nunca fecha)
    if (isLine && !budget.fundMet && (cost.gold ?? 0) > 0 && academyTechCount(player) >= (AGES[player.age + 1]?.requires.techCount ?? 0) + 1) continue;
    // Linhas da Academia (necessárias para avançar) sempre; o resto só com sobra sobre o fundo da idade
    if (!isLine && !(cheap && player.age === 0) && (budget.surplus.gold < (cost.gold ?? 0) + 50 || budget.surplus.food < (cost.food ?? 0))) continue;
    if ((cost.gold ?? 0) > player.resources.gold - 40) continue;
    applyCommand(state, { type: 'research', player: player.id, buildingId: b.id, tech: t });
    researchedThisThink++;
  }
}

// ---------------- Mercado ----------------
function manageTrade(state: GameState, player: Player, snap: Snapshot): void {
  if (!(snap.byType.get('market') ?? []).some((b) => b.complete)) return;
  const r = player.resources;
  const tradeable: ResourceType[] = ['food', 'wood'];
  const scarce = tradeable.find((k) => r[k] < 80);
  const abundant = ([...tradeable].sort((a, b) => r[b] - r[a]))[0];
  if (scarce) {
    const price = player.prices[scarce] * (1 + 0.3 * player.mods.player.tradeTax);
    if (r.gold >= price + 30) { applyCommand(state, { type: 'trade', player: player.id, action: 'buy', resource: scarce }); return; }
    if (abundant !== scarce && r[abundant] > 250) { applyCommand(state, { type: 'trade', player: player.id, action: 'sell', resource: abundant }); return; }
  }
  // Fundo da próxima Idade: converte o excedente grande de comida/madeira no ouro que falta (até 4 lotes por pensamento)
  const budget = budgetOf(state, player);
  const nextCost = (AGES[player.age + 1]?.cost ?? {}) as Record<string, number>;
  let goldShort = !budget.fundMet && budget.surplus.gold < 0 ? -budget.surplus.gold : (r.gold < 100 ? 100 - r.gold : 0);
  let sold = 0;
  for (const k of [...tradeable].sort((a, b) => r[b] - r[a])) {
    const keep = Math.max(500, (nextCost[k] ?? 0) + 150);
    while (goldShort > 0 && sold < 4 && r[k] - MARKET_TRADE_LOT >= keep) {
      const g0 = r.gold;
      if (!applyCommand(state, { type: 'trade', player: player.id, action: 'sell', resource: k }).ok) break;
      goldShort -= r.gold - g0; sold++;
    }
  }
  // Recurso que trava a Idade com ouro sobrando: compra
  if (!budget.fundMet) for (const k of tradeable) {
    if (budget.surplus[k] < 0 && r.gold > budget.reserveGold + player.prices[k] * 1.5 + 100) { applyCommand(state, { type: 'trade', player: player.id, action: 'buy', resource: k }); break; }
  }
}

// ---------------- Exército ----------------
function manageArmy(state: GameState, player: Player, snap: Snapshot): void {
  const ai = player.ai!;
  const diff = DIFFICULTIES[ai.difficulty];
  const rt = getRuntime(state);
  const army = snap.military;
  if (!snap.tc) return;
  const tc = snap.tc;
  const dir = enemyDirection(state, player, tc);
  ai.rallyX = tc.x + dir.x * 7; ai.rallyY = tc.y + dir.y * 7;
  if (state.koth) { ai.rallyX = state.koth.x; ai.rallyY = state.koth.y; }   // Rei da Colina: o exército se reúne na colina e a disputa
  // 1) Ameaças perto dos meus edifícios e dos edifícios de aliados
  let threat: Unit | null = null, threatD = Infinity;
  const guarded: Building[] = [...snap.buildings];
  for (const b of state.buildings.values()) if (b.owner !== player.id && !b.dead && state.players[b.owner].team === player.team && (b.type === 'town_center' || b.type === 'fortress' || b.type === 'temple')) guarded.push(b);
  for (const b of guarded) {
    rt.hash.each(b.x, b.y, 12, (u) => {
      if (!isEnemy(state, player.id, u.owner) || u.dead || !state.players[u.owner].alive) return;
      const ud = UNITS[u.type];
      if (ud.tags.includes('scout') || ud.attack <= 0) return;
      const d = dist(u.x, u.y, b.x, b.y);
      if (ud.tags.includes('civilian') && u.state !== 'attack' && d >= 5) return;   // cidadão só coletando perto da fronteira não é ameaça
      if (d < 12 && d < threatD) { threatD = d; threat = u; }
    });
  }
  const waveInProgress = ai.attackTarget !== -1;
  if (threat) {
    const t = threat as Unit;
    ai.defending = state.tick;
    // com uma onda em curso, só quem está perto de casa responde; a onda continua
    const defenders = army.filter((u) => (u.state !== 'attack' || dist(u.x, u.y, t.x, t.y) > 10) && (!waveInProgress || dist(u.x, u.y, t.x, t.y) < 30));
    if (defenders.length > 0) applyCommand(state, { type: 'attackMove', player: player.id, ids: defenders.map((u) => u.id), x: t.x, y: t.y });
    // cidadãos ameaçados se guarnecem no centro cívico/fortaleza mais próximo quando o exército é fraco
    const scared = snap.villagers.filter((v) => v.inside === -1 && dist(v.x, v.y, t.x, t.y) < 7);
    const threatCount = rt.hash.query(t.x, t.y, 8).filter((u) => isEnemy(state, player.id, u.owner) && UNITS[u.type].attack > 0).length;
    if (scared.length > 0 && army.length < threatCount + 2) {
      const shelter = snap.buildings.filter((b) => b.complete && BUILDINGS[b.type].garrison && b.garrison.length < (BUILDINGS[b.type].garrison ?? 0)).sort((a, b) => dist(a.x, a.y, t.x, t.y) - dist(b.x, b.y, t.x, t.y))[0];
      if (shelter) applyCommand(state, { type: 'garrison', player: player.id, ids: scared.map((u) => u.id), targetId: shelter.id });
      else {
        // sem abrigo: recuam para o lado do CC oposto à ameaça (antes: sempre 3 tiles ao sul, rumo ao inimigo para quem está ao norte)
        const ex = tc.x - t.x, ey = tc.y - t.y, el = Math.sqrt(ex * ex + ey * ey) || 1;
        applyCommand(state, { type: 'move', player: player.id, ids: scared.map((u) => u.id), x: tc.x + ex / el * 3, y: tc.y + ey / el * 3 });
      }
    }
    if (!waveInProgress) return;
  }
  // Sem ameaças há 20 s: libera guarnições para voltarem ao trabalho
  if (state.tick - ai.defending > 20 * TICK_RATE) {
    for (const b of snap.buildings) if (b.garrison.length > 0 && b.complete) applyCommand(state, { type: 'ungarrison', player: player.id, buildingId: b.id });
  }
  // 2) Ataque em ondas
  const threshold = Math.round(ARMY_ATTACK[player.age] * diff.armyMult);
  const attackCooldown = Math.round(75 * diff.attackDelay * TICK_RATE);
  const attacking = ai.attackTarget !== -1;
  if (attacking) {
    const target = state.buildings.get(ai.attackTarget);
    if (!target || target.dead) { ai.attackTarget = -1; }
    else {
      const near = army.filter((u) => dist(u.x, u.y, target.x, target.y) < 18).length;
      // recuo se a força dispersou
      if (army.length < 3 || (near < 3 && state.tick - ai.lastAttack > 60 * TICK_RATE)) {
        ai.attackTarget = -1;
        applyCommand(state, { type: 'move', player: player.id, ids: army.map((u) => u.id), x: ai.rallyX, y: ai.rallyY });
      } else if (state.tick % (TICK_RATE * 10) < TICK_RATE * 2) {
        // reforços seguem para o alvo
        const idle = army.filter((u) => u.state === 'idle' && dist(u.x, u.y, target.x, target.y) > 14);
        if (idle.length > 0) applyCommand(state, { type: 'attackMove', player: player.id, ids: idle.map((u) => u.id), x: target.x, y: target.y });
      }
      return;
    }
  }
  // Ataque coordenado: se uma IA aliada já está atacando, junta-se a ela com o mesmo alvo (com metade do exército mínimo e sem esperar o intervalo)
  const allyTarget = alliedAttackTarget(state, player);
  if (allyTarget && army.length >= Math.max(4, Math.round(threshold * 0.5)) && state.tick - ai.lastAttack > attackCooldown * 0.25 && rectReachable(state.map, Math.floor(army[0].x), Math.floor(army[0].y), allyTarget.tx, allyTarget.ty, allyTarget.w, allyTarget.h, true)) {
    ai.attackTarget = allyTarget.id; ai.lastAttack = state.tick; ai.waves++;
    applyCommand(state, { type: 'attackMove', player: player.id, ids: [...army.map((u) => u.id), ...snap.heroes.map((u) => u.id)], x: allyTarget.x, y: allyTarget.y });
    return;
  }
  if (army.length >= threshold && state.tick - ai.lastAttack > attackCooldown) {
    const target = chooseAttackTarget(state, player, tc, army[0]);
    if (target) {
      ai.attackTarget = target.id; ai.lastAttack = state.tick; ai.waves++;
      const ids = [...army.map((u) => u.id), ...snap.heroes.map((u) => u.id)];
      applyCommand(state, { type: 'attackMove', player: player.id, ids, x: target.x, y: target.y });
      return;
    }
  }
  // 3) Reunião no ponto de encontro
  const idle = army.filter((u) => u.state === 'idle' && dist(u.x, u.y, ai.rallyX, ai.rallyY) > 5);
  if (idle.length > 0) applyCommand(state, { type: 'move', player: player.id, ids: idle.map((u) => u.id), x: ai.rallyX, y: ai.rallyY });
}

/** Alvo que uma IA aliada (mesmo time) está atacando neste momento, se houver. */
function alliedAttackTarget(state: GameState, player: Player): Building | null {
  for (const p of state.players) {
    if (p.id === player.id || !p.isAI || !p.alive || p.team !== player.team || !p.ai || p.ai.attackTarget === -1) continue;
    const b = state.buildings.get(p.ai.attackTarget);
    if (b && !b.dead && isEnemy(state, player.id, b.owner)) return b;
  }
  return null;
}

function chooseAttackTarget(state: GameState, player: Player, tc: Building, from: Unit): Building | null {
  // Prefere o inimigo mais fraco (menos militares) e, dentro dele, o edifício mais próximo — desde que haja caminho por terra
  let weakest: Player | null = null, weakestArmy = Infinity, weakestD = Infinity;
  for (const e of state.players) {
    if (!isEnemy(state, player.id, e.id) || !e.alive) continue;
    const n = countUnits(state, e.id, isMilitary);
    if (n > weakestArmy) continue;
    // empate de força: o inimigo com o edifício mais perto do meu CC (antes: o de menor índice, o mesmo jogador como alvo
    // dos dois lados de um mapa espelhado)
    let d = Infinity;
    for (const b of state.buildings.values()) if (b.owner === e.id && !b.dead) { const bd = (b.x - tc.x) * (b.x - tc.x) + (b.y - tc.y) * (b.y - tc.y); if (bd < d) d = bd; }
    if (n < weakestArmy || d < weakestD) { weakestArmy = n; weakest = e; weakestD = d; }
  }
  if (!weakest) return null;
  const w = weakest;
  const fx = Math.floor(from.x), fy = Math.floor(from.y);
  const reachable = (b: Building) => rectReachable(state.map, fx, fy, b.tx, b.ty, b.w, b.h, true);
  return nearestEnemyBuilding(state, player.id, tc.x, tc.y, (b) => b.owner === w.id && !BUILDINGS[b.type].wall && reachable(b))
    ?? nearestEnemyBuilding(state, player.id, tc.x, tc.y, (b) => !BUILDINGS[b.type].wall && reachable(b))
    ?? nearestEnemyBuilding(state, player.id, tc.x, tc.y, reachable);
}

function manageScouts(state: GameState, player: Player, snap: Snapshot): void {
  for (const s of snap.scouts) {
    if (s.state !== 'idle') continue;
    const x = state.rng.range(4, state.map.w - 4), y = state.rng.range(4, state.map.h - 4);
    applyCommand(state, { type: 'move', player: player.id, ids: [s.id], x, y });
  }
}

// ---------------- Poderes divinos ----------------
function managePowers(state: GameState, player: Player, snap: Snapshot): void {
  const rt = getRuntime(state);
  const avail = player.powers.filter((p) => !p.used).map((p) => p.id);
  if (avail.length === 0 || !snap.tc) return;
  const tc = snap.tc;
  const defending = state.tick - player.ai!.defending < 10 * TICK_RATE;
  // Grupo inimigo mais denso perto de mim
  let clumpX = 0, clumpY = 0, clumpN = 0;
  for (const b of snap.buildings) {
    const near = rt.hash.query(b.x, b.y, 10).filter((u) => isEnemy(state, player.id, u.owner) && !u.dead && UNITS[u.type].attack > 0);
    if (near.length > clumpN) { clumpN = near.length; clumpX = near.reduce((s, u) => s + u.x, 0) / near.length; clumpY = near.reduce((s, u) => s + u.y, 0) / near.length; }
  }
  const use = (power: string, x?: number, y?: number, targetId?: number) => applyCommand(state, { type: 'power', player: player.id, power, x, y, targetId }).ok;
  // pontos ao redor do CC no referencial voltado ao centro do mapa (antes: sudeste/sudoeste absolutos)
  const frame = centerFrame(state.map, tc.x, tc.y);
  const aroundTc = (a: number, b: number) => frameOffset(frame, tc.x, tc.y, a, b);
  for (const p of avail) {
    switch (p) {
      case 'plenty': { const q = aroundTc(4, 4); use(p, q.x, q.y); return; }
      case 'lure': if (player.age === 0 && state.tick > 60 * TICK_RATE) { const q = aroundTc(-4, 3); use(p, q.x, q.y); return; } break;
      case 'oracle': if (player.age >= 2) { use(p); return; } break;
      case 'sentinel': if (defending) { use(p, undefined, undefined, tc.id); return; } break;
      case 'bolt': {
        let best: Unit | null = null, bestV = 0;
        rt.hash.each(tc.x, tc.y, 40, (u) => { if (!isEnemy(state, player.id, u.owner) || u.dead) return; const v = u.maxHp * (UNITS[u.type].tags.includes('hero') ? 1.5 : 1); if (v > bestV && (UNITS[u.type].tags.includes('myth') || UNITS[u.type].tags.includes('hero') || (defending && v > 150))) { bestV = v; best = u; } });
        if (best) { use(p, undefined, undefined, (best as Unit).id); return; }
        break;
      }
      case 'restoration': {
        const hurt = snap.military.filter((u) => u.hp < u.maxHp * 0.5);
        if (hurt.length >= 5) { use(p, hurt[0].x, hurt[0].y); return; }
        break;
      }
      case 'ceasefire': if (defending && snap.military.length < clumpN * 0.6 && clumpN >= 6) { use(p); return; } break;
      case 'bronze': if (player.ai!.attackTarget !== -1 || (defending && clumpN >= 5)) { use(p); return; } break;
      case 'curse': case 'lightning_storm': if (clumpN >= 6) { use(p, clumpX, clumpY); return; } break;
      case 'pestilence': case 'earthquake': {
        if (player.ai!.attackTarget !== -1) { const t = state.buildings.get(player.ai!.attackTarget); if (t) { use(p, t.x, t.y); return; } }
        break;
      }
    }
  }
}

export function aiDescribe(player: Player): string { return `${MAJOR_GODS[player.god]?.name ?? ''} (${POWERS[MAJOR_GODS[player.god]?.power ?? 'bolt']?.name ?? ''})`; }
export const _internal = { RESOURCES };
