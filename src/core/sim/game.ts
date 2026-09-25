// Criação da partida e laço principal da simulação (passo fixo, determinístico).
import { DT, MAP_SIZES, RESOURCES, TICK_RATE, MARKET_BASE_PRICE, PLAYER_COLORS, type ResourceType, DEATHMATCH_RESOURCES } from '../constants';
import { BUILDINGS, MAJOR_GODS, UNITS } from '../data';
import { RNG } from '../rng';
import type { Command, GameConfig, GameState, Player } from '../types';
import { generateMap, resetNodeSeq } from '../map/mapgen';
import { mapFromData } from '../map/fixed';
import { canPlaceBuilding, placeBuilding, recomputePop, removeBuildingNow, removeUnitNow, spawnUnit } from './entities';
import { defaultMods, recomputeMods } from './modifiers';
import { recomputeTerritory } from './territory';
import { updateFog } from './fog';
import { getRuntime } from './runtime';
import { applyCommand } from './commands';
import { updateUnit, applySeparation } from './units';
import { updateBuilding } from './buildings';
import { economySecond } from './economy';
import { updateTimedEffects } from './powers';
import { aiThink } from './ai';
import { checkVictory } from './victory';
import { spiralSearch, isPassable } from '../map/grid';
import { nearestFreeTile } from '../map/pathfinding';
import { getScenario, initScenarioState, runScenario } from '../scenario/runner';
import { updateKoth } from './modes';
import { placeRelics, updateRelics } from './relics';

const PATH_BUDGET_PER_TICK = 48;
const MAX_EVENTS = 200;

export function createGame(config: GameConfig): GameState {
  resetNodeSeq();
  const mode = config.mode ?? 'conquest';
  // Mapa fixo (editor/arquivo) ou gerado pelo seed
  const map = config.map ? mapFromData(config.map) : generateMap(MAP_SIZES[config.mapSize].w, MAP_SIZES[config.mapSize].h, config.seed, config.players.length, config.mapType ?? 'continental', mode === 'koth');
  const size = { w: map.w, h: map.h };
  if (config.map && map.starts.length < config.players.length) throw new Error(`mapa fixo tem ${map.starts.length} posições iniciais para ${config.players.length} jogadores`);
  const state: GameState = {
    config, seed: config.seed, tick: 0, time: 0, map,
    players: [], units: new Map(), buildings: new Map(), nextId: 1,
    territory: new Int8Array(size.w * size.h).fill(-1), territoryDirty: true, territoryVersion: 0,
    events: [], effects: [], timed: [], winner: -1, gameOver: false, rng: new RNG(config.seed + 7),
    ceasefireUntil: 0, ceasefireBy: -1, fogVersion: 0, relics: [],
  };
  config.players.forEach((pc, i) => {
    const resources = { food: 300, wood: 250, gold: 120, knowledge: 0, favor: 0 } as Record<ResourceType, number>;
    if (mode === 'deathmatch') for (const r of RESOURCES) resources[r] = DEATHMATCH_RESOURCES[r];   // Deathmatch: cofres cheios
    for (const r of RESOURCES) if (config.startingResources?.[r] !== undefined) resources[r] = config.startingResources[r]!;
    const god = MAJOR_GODS[pc.god] ? pc.god : 'zeus';
    const p: Player = {
      id: i, name: pc.name, color: PLAYER_COLORS[i % PLAYER_COLORS.length].num, isAI: pc.isAI, difficulty: pc.difficulty, team: pc.team ?? i,
      god, minorGods: [], age: config.startingAge ?? (mode === 'deathmatch' ? 1 : 0), resources, techs: [], powers: [{ id: MAJOR_GODS[god].power, used: false }],
      pop: 0, popCap: 0, alive: true, defeatedTick: -1, mods: defaultMods(),
      stats: { kills: 0, losses: 0, unitsTrained: 0, buildingsBuilt: 0, buildingsLost: 0, razed: 0, gathered: { food: 0, wood: 0, gold: 0, knowledge: 0, favor: 0 } },
      prices: { food: MARKET_BASE_PRICE, wood: MARKET_BASE_PRICE, gold: MARKET_BASE_PRICE, knowledge: MARKET_BASE_PRICE, favor: MARKET_BASE_PRICE },
      territoryTiles: 0, visibility: new Uint8Array(size.w * size.h),
      ai: pc.isAI ? { difficulty: pc.difficulty, nextThink: TICK_RATE * (2 + i), lastAttack: 0, attackTarget: -1, waves: 0, rallyX: 0, rallyY: 0, defending: -1000, builderIds: [], lastExpand: 0, personality: (config.seed + i * 7) % 97 } : null,
      revealUntil: 0, bronzeUntil: 0, wonderVictoryAt: -1, titanSpawned: false,
    };
    state.players.push(p);
    recomputeMods(state, p);
  });
  // Mapa fixo: ordem dos inícios (config.startOrder só vale se for uma permutação válida de índices de map.starts) e kit inicial por jogador
  const order = validStartOrder(config.startOrder, map.starts.length, state.players.length);
  const startOf = (i: number) => map.starts[order ? order[i] : i];
  const kit = (i: number): boolean => Array.isArray(config.startKit) ? (config.startKit[i] ?? true) : (config.startKit ?? config.map?.startKit ?? true);
  // Posições iniciais: centro cívico + cidadãos + batedor
  state.players.forEach((p, i) => {
    const s = startOf(i);
    if (kit(i)) {
      const tc = placeBuilding(state, p.id, 'town_center', s.x - 1, s.y - 1, true);
      const spots: [number, number][] = [[-2, 2.5], [-1, 2.5], [0, 2.5], [1, 2.5], [2, 2.5], [3, 1]];
      spots.forEach(([dx, dy], k) => {
        const x = tc.x + dx, y = tc.y + dy;
        const t = spiralSearch(Math.floor(x), Math.floor(y), 6, (a, b) => isPassable(map, a, b));
        const px = t ? t.x + 0.5 : x, py = t ? t.y + 0.5 : y;
        spawnUnit(state, p.id, k < 5 ? 'villager' : 'kataskopos', px, py);
      });
      if (mode === 'regicide') { const t = spiralSearch(Math.floor(tc.x), Math.floor(tc.y) + 3, 6, (a, b) => isPassable(map, a, b)); spawnUnit(state, p.id, 'basileus', t ? t.x + 0.5 : tc.x, t ? t.y + 0.5 : tc.y + 3.5); }
    } else if (mode === 'regicide') {
      // Sem kit inicial o basileus nasce no tile passável mais próximo do início (validateMap avisa se não houver CC)
      const t = spiralSearch(s.x, s.y, 6, (a, b) => isPassable(map, a, b));
      spawnUnit(state, p.id, 'basileus', t ? t.x + 0.5 : s.x + 0.5, t ? t.y + 0.5 : s.y + 0.5);
    }
    recomputePop(state, p);
  });
  // Entidades pré-colocadas do mapa fixo, na ordem do arquivo. Dono fora do intervalo ou tipo inexistente são ignorados
  // (validateMap avisa antes; aqui é só robustez). Tags viram vars do cenário ('#tag' → id) depois de initScenarioState.
  const tags = new Map<string, number>();
  if (config.map) {
    for (const e of config.map.entities ?? []) {
      if (!Number.isInteger(e.owner) || e.owner < 0 || e.owner >= state.players.length) continue;
      const owner = state.players[e.owner];
      if (e.kind === 'building') {
        if (!BUILDINGS[e.type] || !canPlaceBuilding(state, owner, e.type, e.x, e.y, true, true).ok) continue;
        const b = placeBuilding(state, e.owner, e.type, e.x, e.y, e.complete ?? true);
        if (e.tag) tags.set(e.tag, b.id);
      } else if (e.kind === 'unit') {
        if (!UNITS[e.type]) continue;
        const t = nearestFreeTile(map, e.x, e.y, 6);
        if (!t) continue;
        const u = spawnUnit(state, e.owner, e.type, t.x + 0.5, t.y + 0.5);
        if (e.tag) tags.set(e.tag, u.id);
      }
    }
    // O setup não conta como construção/treino nem gera avisos na partida
    for (const p of state.players) { recomputePop(state, p); p.stats.buildingsBuilt = 0; p.stats.unitsTrained = 0; }
    state.events = [];
  }
  if (config.map?.relics !== false) placeRelics(state);
  if (mode === 'koth') {
    const hill = config.map?.koth;
    const hx = hill ? Math.floor(hill[0]) : Math.floor(size.w / 2), hy = hill ? Math.floor(hill[1]) : Math.floor(size.h / 2);
    const c = spiralSearch(hx, hy, 8, (a, b) => isPassable(map, a, b));
    state.koth = { x: (c ? c.x : hx) + 0.5, y: (c ? c.y : hy) + 0.5, team: -1, seconds: 0 };
  }
  // Cenário (campanha): posicionamento extra e estado de objetivos
  if (config.scenario) {
    const def = getScenario(config.scenario);
    if (def) {
      state.scenario = initScenarioState(def);
      for (const [tag, id] of tags) state.scenario.vars['#' + tag] = id;
      def.setup?.(state);
      for (const u of state.units.values()) if (u.dead) removeUnitNow(state, u);
      for (const b of state.buildings.values()) if (b.dead) removeBuildingNow(state, b);
      for (const p of state.players) { recomputeMods(state, p); recomputePop(state, p); }
    }
  }
  recomputeTerritory(state);
  for (const p of state.players) updateFog(state, p);
  // Cidadãos iniciais começam coletando (comida) para reduzir microgestão inicial
  for (const p of state.players) {
    const tc = [...state.buildings.values()].find((b) => b.owner === p.id && b.type === 'town_center');
    if (!tc) continue;
    const vills = [...state.units.values()].filter((u) => u.owner === p.id && u.type === 'villager');
    const { nearestNode } = queries;
    const food = nearestNode(state, tc.x, tc.y, 'food', 14);
    const wood = nearestNode(state, tc.x, tc.y, 'wood', 16);
    vills.forEach((v, k) => {
      const target = k < 3 ? food : wood;
      if (target) applyCommand(state, { type: 'gather', player: p.id, ids: [v.id], targetId: target.id });
    });
  }
  return state;
}
import * as queries from './queries';

/** startOrder válido = índices inteiros distintos dentro de [0, nStarts) cobrindo todos os jogadores; senão null (identidade). */
function validStartOrder(order: number[] | undefined, nStarts: number, nPlayers: number): number[] | null {
  if (!Array.isArray(order) || order.length < nPlayers) return null;
  const seen = new Set<number>();
  for (const v of order) { if (!Number.isInteger(v) || v < 0 || v >= nStarts || seen.has(v)) return null; seen.add(v); }
  return order;
}

/** Avança a simulação em um tick, aplicando primeiro os comandos deste tick (ordem determinística). */
export function tick(state: GameState, commands: Command[] = []): void {
  if (state.gameOver) { state.tick++; state.time += DT; return; }
  const rt = getRuntime(state);
  rt.pathBudget = PATH_BUDGET_PER_TICK;
  // Hash espacial (antes dos comandos: poderes usados logo após carregar/criar a partida já enxergam as unidades)
  rt.hash.clear();
  rt.nodeGatherers.clear();
  for (const u of state.units.values()) {
    if (u.dead || u.inside !== -1) continue;
    rt.hash.insert(u);
    if (u.nodeId > 0 && (u.state === 'gather' || u.state === 'return')) rt.nodeGatherers.set(u.nodeId, (rt.nodeGatherers.get(u.nodeId) ?? 0) + 1);
  }
  for (const c of commands) applyCommand(state, c);
  // Efeitos temporizados de poderes
  updateTimedEffects(state);
  // Unidades
  for (const u of state.units.values()) if (!u.dead && u.inside === -1) updateUnit(state, rt, u, DT);
  applySeparation(state, rt);
  // Edifícios
  for (const b of state.buildings.values()) if (!b.dead) updateBuilding(state, rt, b, DT);
  // Economia e IA a cada segundo (defasadas para distribuir custo)
  if (state.tick % TICK_RATE === 0) { economySecond(state); if (state.koth) updateKoth(state); updateRelics(state); }
  for (const p of state.players) if (p.isAI && p.alive) aiThink(state, p);
  if (state.scenario) { if (state.tick % TICK_RATE === TICK_RATE - 1) runScenario(state); }
  else if (state.tick % TICK_RATE === TICK_RATE - 1) checkVictory(state);
  // Território e névoa
  if (state.territoryDirty) recomputeTerritory(state);
  if (state.tick % 5 === 0) for (const p of state.players) if (!p.isAI || state.config.revealMap) updateFog(state, p);
  // Limpeza de mortos e efeitos
  cleanup(state);
  state.tick++;
  state.time += DT;
}

function cleanup(state: GameState): void {
  for (const [id, u] of state.units) if (u.dead) state.units.delete(id);
  for (const [id, b] of state.buildings) if (b.dead) state.buildings.delete(id);
  for (let i = state.effects.length - 1; i >= 0; i--) { const e = state.effects[i]; e.ttl--; if (e.ttl <= 0) state.effects.splice(i, 1); }
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
}

export function summarize(state: GameState): string {
  return state.players.map((p) => {
    let v = 0, m = 0, b = 0;
    for (const u of state.units.values()) if (u.owner === p.id) { if (u.type === 'villager') v++; else if (UNITS[u.type].tags.includes('military')) m++; }
    for (const x of state.buildings.values()) if (x.owner === p.id) b++;
    const r = RESOURCES.map((k) => `${k[0]}=${Math.floor(p.resources[k])}`).join(' ');
    return `${p.name}[${p.alive ? 'vivo' : 'morto'}] idade=${p.age} vill=${v} mil=${m} edif=${b} pop=${p.pop}/${p.popCap} techs=${p.techs.length} ${r}`;
  }).join('\n');
}
