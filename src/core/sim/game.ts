// Criação da partida e laço principal da simulação (passo fixo, determinístico).
import { DT, MAP_SIZES, RESOURCES, TICK_RATE, MARKET_BASE_PRICE, PLAYER_COLORS, type ResourceType, DEATHMATCH_RESOURCES } from '../constants';
import { BUILDINGS, MAJOR_GODS, UNITS } from '../data';
import { RNG } from '../rng';
import type { Command, GameConfig, GameState, Player } from '../types';
import { generateMap, resetNodeSeq } from '../map/mapgen';
import { mapFromData } from '../map/fixed';
import { canPlaceBuilding, openTile, placeBuilding, recomputePop, removeBuildingNow, removeUnitNow, spawnUnit } from './entities';
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
import { spiralSearch, spiralSearchFrame, centerFrame, frameOffset, frameTile, isPassable } from '../map/grid';
import { nearestFreeTile } from '../map/pathfinding';
import { eliminateInScenario, getScenarioFor, initScenarioState, refreshPuppets, runScenario } from '../scenario/runner';
import { updateKoth } from './modes';
import { placeRelics, updateRelics } from './relics';

const PATH_BUDGET_PER_TICK = 48;
const MAX_EVENTS = 200;

/** Jogador que abre a vez das IAs neste tick: gira a cada segundo (antes era sempre o 0 — com todas pensando no mesmo tick,
 * o jogador 0 pegava primeiro recursos, alvos e vagas). */
export function firstThinker(tick: number, nPlayers: number): number { return nPlayers > 0 ? Math.floor(tick / TICK_RATE) % nPlayers : 0; }

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
      // todas as IAs começam a pensar no mesmo instante (antes 2 + i s: o jogador 0 ganhava 1 s por índice de vantagem)
      ai: pc.isAI ? { difficulty: pc.difficulty, nextThink: TICK_RATE * 2, lastAttack: 0, attackTarget: -1, waves: 0, rallyX: 0, rallyY: 0, defending: -1000, builderIds: [], lastExpand: 0, personality: Number.isInteger(pc.personality) && pc.personality! >= 0 ? pc.personality! % 97 : (config.seed + i * 7) % 97 } : null,
      revealUntil: 0, bronzeUntil: 0, wonderVictoryAt: -1, titanSpawned: false,
    };
    state.players.push(p);
    recomputeMods(state, p);
  });
  // Mapa fixo: ordem dos inícios (config.startOrder só vale se for uma permutação válida de índices de map.starts) e kit inicial por jogador
  const order = validStartOrder(config.startOrder, map.starts.length, state.players.length);
  const startOf = (i: number) => map.starts[order ? order[i] : i];
  const kit = (i: number): boolean => hasStartKit(config, i);
  // Posições iniciais: centro cívico + cidadãos + batedor
  state.players.forEach((p, i) => {
    const s = startOf(i);
    if (kit(i)) {
      const tc = placeBuilding(state, p.id, 'town_center', s.x - 1, s.y - 1, true);
      const spots: [number, number][] = [[-2, 2.5], [-1, 2.5], [0, 2.5], [1, 2.5], [2, 2.5], [3, 1]];
      // Cidadãos e batedor do lado do CC voltado ao centro do mapa (antes: sempre ao sul — à frente para quem começa ao norte,
      // atrás para quem começa ao sul). O referencial vem do vetor CC→centro (sinais e eixo dominante): num mapa leste×oeste
      // a fileira vira coluna; espelho/rotação de 180°/transposição do início dão o kit espelhado, tile a tile.
      const f = centerFrame(map, tc.x, tc.y);
      spots.forEach(([a, b], k) => {
        const q = frameOffset(f, tc.x, tc.y, a, b);
        const t = spiralSearchFrame(frameTile(q.x, f.sx), frameTile(q.y, f.sy), 6, (x, y) => isPassable(map, x, y), f);
        const px = t ? t.x + 0.5 : q.x, py = t ? t.y + 0.5 : q.y;
        spawnUnit(state, p.id, k < 5 ? 'villager' : 'kataskopos', px, py);
      });
      if (mode === 'regicide') {
        const q = frameOffset(f, tc.x, tc.y, 0, 3);
        const t = spiralSearchFrame(frameTile(q.x, f.sx), frameTile(q.y, f.sy), 6, (x, y) => isPassable(map, x, y), f);
        const e = frameOffset(f, tc.x, tc.y, 0, 3.5);
        spawnUnit(state, p.id, 'basileus', t ? t.x + 0.5 : e.x, t ? t.y + 0.5 : e.y);
      }
    }
    recomputePop(state, p);
  });
  // Entidades pré-colocadas do mapa fixo, na ordem do arquivo. Dono fora do intervalo ou tipo inexistente são ignorados
  // (validateMap avisa antes; aqui é só robustez). Tags viram vars do cenário depois de initScenarioState: entidades com a
  // mesma tag formam um grupo, como spawn/place (G5): '#tag' = primeiro id (ordem do arquivo) e '#tag[k]' = k-ésimo.
  const tags = new Map<string, number[]>();
  const addTag = (tag: string, id: number) => { const list = tags.get(tag); if (list) list.push(id); else tags.set(tag, [id]); };
  if (config.map) {
    // 'owner' no arquivo é o índice do INÍCIO (o autor coloca a torre ao lado de starts[k] para quem começar ali); com startOrder o jogador desse início muda
    const playerAtStart = new Map<number, number>();
    for (let i = 0; i < state.players.length; i++) playerAtStart.set(order ? order[i] : i, i);
    for (let e of Array.isArray(config.map.entities) ? config.map.entities : []) {
      if (!e || typeof e !== 'object') continue;
      const pi = Number.isInteger(e.owner) ? playerAtStart.get(e.owner) : undefined;
      if (pi === undefined) continue;
      e = { ...e, owner: pi };
      const owner = state.players[pi];
      if (e.kind === 'building') {
        if (typeof e.type !== 'string' || !Object.prototype.hasOwnProperty.call(BUILDINGS, e.type) || !canPlaceBuilding(state, owner, e.type, e.x, e.y, true, true).ok) continue;
        const b = placeBuilding(state, e.owner, e.type, e.x, e.y, e.complete !== false);
        if (!b.complete) b.unpaid = true;   // obra do mapa: cancelar/excluir não devolve recursos
        if (e.tag) addTag(e.tag, b.id);
      } else if (e.kind === 'unit') {
        if (typeof e.type !== 'string' || !Object.prototype.hasOwnProperty.call(UNITS, e.type)) continue;
        const t = spiralSearch(e.x, e.y, 6, (a, b) => openTile(state, a, b)) ?? nearestFreeTile(map, e.x, e.y, 6);   // prefere região com ≥ 8 tiles (não nasce presa)
        if (!t) continue;
        const u = spawnUnit(state, e.owner, e.type, t.x + 0.5, t.y + 0.5);
        if (e.tag) addTag(e.tag, u.id);
      }
    }
    // Regicídio sem kit: o basileus nasce perto do início só se o mapa não o pré-colocou
    if (mode === 'regicide') state.players.forEach((p, i) => {
      if (kit(i) || [...state.units.values()].some((u) => u.owner === p.id && u.type === 'basileus')) return;
      const s = startOf(i); const t = spiralSearchFrame(s.x, s.y, 6, (a, b) => isPassable(map, a, b), centerFrame(map, s.x + 0.5, s.y + 0.5));
      spawnUnit(state, p.id, 'basileus', t ? t.x + 0.5 : s.x + 0.5, t ? t.y + 0.5 : s.y + 0.5);
    });
    // O setup não conta como construção/treino nem gera avisos na partida
    for (const p of state.players) { recomputePop(state, p); p.stats.buildingsBuilt = 0; p.stats.unitsTrained = 0; }
    state.events = [];
  }
  if (config.map?.relics !== false) placeRelics(state);
  if (mode === 'koth') {
    const raw = config.map?.koth;
    const hill = raw && Number.isInteger(raw[0]) && Number.isInteger(raw[1]) && raw[0] >= 0 && raw[1] >= 0 && raw[0] < size.w && raw[1] < size.h ? raw : null;   // colina inválida: centro
    const hx = hill ? hill[0] : Math.floor(size.w / 2), hy = hill ? hill[1] : Math.floor(size.h / 2);
    const c = spiralSearch(hx, hy, 8, (a, b) => isPassable(map, a, b));
    state.koth = { x: (c ? c.x : hx) + 0.5, y: (c ? c.y : hy) + 0.5, team: -1, seconds: 0 };
  }
  // Cenário (campanha ou JSON em config.scenarioData): posicionamento extra e estado de objetivos
  if (config.scenario || config.scenarioData) {
    const def = getScenarioFor(state);
    if (def) {
      state.scenario = initScenarioState(def);
      for (const [tag, ids] of tags) { state.scenario.vars['#' + tag] = ids[0]; ids.forEach((id, k) => { state.scenario!.vars[`#${tag}[${k}]`] = id; }); }
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
    const vills = [...state.units.values()].filter((u) => u.owner === p.id && u.type === 'villager' && u.state === 'idle');
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
  // Unidades e edifícios: nos ticks ímpares a ordem é invertida. Quem é atualizado primeiro golpeia primeiro (o dano é
  // imediato) e quem vem depois enxerga posições mais novas; com ordem fixa por id, a unidade mais antiga levava vantagem
  // (duelo simétrico 12×12: 64 % para quem nasceu antes; alternando, 45–48 %)
  const reverse = (state.tick & 1) === 1;
  if (reverse) { const arr = [...state.units.values()]; for (let i = arr.length - 1; i >= 0; i--) { const u = arr[i]; if (!u.dead && u.inside === -1) updateUnit(state, rt, u, DT); } }
  else for (const u of state.units.values()) if (!u.dead && u.inside === -1) updateUnit(state, rt, u, DT);
  applySeparation(state, rt);
  if (reverse) { const arr = [...state.buildings.values()]; for (let i = arr.length - 1; i >= 0; i--) { const b = arr[i]; if (!b.dead) updateBuilding(state, rt, b, DT); } }
  else for (const b of state.buildings.values()) if (!b.dead) updateBuilding(state, rt, b, DT);
  // Economia e IA a cada segundo (defasadas para distribuir custo)
  if (state.tick % TICK_RATE === 0) { economySecond(state); if (state.koth) updateKoth(state); updateRelics(state); }
  // IAs: a primeira a pensar gira a cada segundo (quem pensa antes pega primeiro recursos, alvos e vagas no mesmo tick)
  const np = state.players.length, first = firstThinker(state.tick, np);
  for (let k = 0; k < np; k++) { const p = state.players[(k + first) % np]; if (p.isAI && p.alive) aiThink(state, p); }
  // Cenário: eliminação sem vencedor global (G2) e depois objetivos/gatilhos; fora dele, a vitória padrão. As marionetes
  // voltam a ser sincronizadas após os gatilhos: uma onda recém-invocada já pode ser atacada neste mesmo tick.
  if (state.scenario) { if (state.tick % TICK_RATE === TICK_RATE - 1) { eliminateInScenario(state); runScenario(state); refreshPuppets(state); } }
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

/** O jogador i começa com o kit inicial (CC + cidadãos + batedor)? Sem kit, ele só é derrotado quando perde também as unidades. */
export function hasStartKit(config: GameConfig, i: number): boolean {
  return Array.isArray(config.startKit) ? (config.startKit[i] ?? true) : (config.startKit ?? config.map?.startKit ?? true);
}
