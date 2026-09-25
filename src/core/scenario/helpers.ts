// Utilidades para cenários: contagens, invocação de esquadrões inimigos, recursos.
import { UNITS } from '../data';
import { TICK_RATE } from '../constants';
import type { Building, GameConfig, GameState, Unit } from '../types';
import { spawnUnit, placeBuilding, canPlaceBuilding, onBuildingComplete, removeBuildingNow, removeUnitNow } from '../sim/entities';
import { getBuildingStats } from '../sim/modifiers';
import { giveOrder } from '../sim/units';
import { spiralSearch, isPassable, idx, inBounds } from '../map/grid';
import { componentAt, nearestLargeComponentTile, rectReachable } from '../map/components';

/** Há caminho de (a,b) até o ponto (x,y)? Se o ponto estiver sobre um edifício, basta alcançar o anel ao redor dele. */
function reachesPoint(state: GameState, a: number, b: number, x: number, y: number): boolean {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (!inBounds(state.map, tx, ty)) return false;
  const bid = state.map.buildingAt[idx(state.map, tx, ty)];
  const bld = bid !== -1 ? state.buildings.get(bid) : undefined;
  return bld ? rectReachable(state.map, a, b, bld.tx, bld.ty, bld.w, bld.h, true) : rectReachable(state.map, a, b, tx, ty, 1, 1, true);
}
import { recomputeMods, refreshMaxHp } from '../sim/modifiers';

export function count(state: GameState, owner: number, pred: (u: Unit) => boolean): number {
  let n = 0; for (const u of state.units.values()) if (u.owner === owner && !u.dead && pred(u)) n++; return n;
}
export function countBuildings(state: GameState, owner: number, type?: string): number {
  let n = 0; for (const b of state.buildings.values()) if (b.owner === owner && !b.dead && b.complete && (!type || b.type === type)) n++; return n;
}
export function military(u: Unit): boolean { return UNITS[u.type].tags.includes('military') && !UNITS[u.type].tags.includes('scout'); }
export function localPlayer(state: GameState): number { return localHumanIndex(state.config); }

/** Marionete roteirizada: jogador marcado com `puppet: true` na config (facção sem IA, movida só por gatilhos). */
export function isPuppetConfig(config: GameConfig, i: number): boolean { return !!config.players[i]?.puppet; }
/** Primeiro humano de verdade da config (sem IA e sem marionete): o 'local' dos cenários; -1 se não houver. */
export function localHumanIndex(config: GameConfig): number { return config.players.findIndex((p) => !p.isAI && !p.puppet); }
/**
 * Saves e replays de antes das marionetes explícitas: se nenhum jogador traz o campo `puppet`, vale a regra antiga (todo
 * jogador sem IA fora do time do primeiro humano era marionete). Configs novas não mudam; devolve a mesma config se nada mudar.
 */
export function migrateLegacyPuppets(config: GameConfig): GameConfig {
  if (!(config.scenario || config.scenarioData) || config.players.some((p) => p.puppet !== undefined)) return config;
  const first = config.players.findIndex((p) => !p.isAI); if (first < 0) return config;
  const team = config.players[first].team ?? first;
  if (!config.players.some((p, i) => !p.isAI && (p.team ?? i) !== team)) return config;
  return { ...config, players: config.players.map((p, i) => (!p.isAI && (p.team ?? i) !== team ? { ...p, puppet: true } : p)) };
}
/**
 * `alive` de um jogador em cenário. Marionete: tem alguma entidade viva (unidade ou edifício) — a eliminação comum não se
 * aplica a ela, que costuma não ter cidade; `kill`/`removeAll` do último vivo ou { do: 'defeat' } a derrubam, e um `spawn`
 * posterior a traz de volta. Os demais: o `alive` do estado (eliminateInScenario).
 */
export function scenarioAlive(state: GameState, id: number): boolean {
  const p = state.players[id]; if (!p) return false;
  return isPuppetConfig(state.config, id) ? hasAnyEntity(state, id) : p.alive;
}

/** O jogador tem alguma entidade viva (unidade, inclusive guarnecida, ou edifício de qualquer tipo, mesmo em obra)? */
export function hasAnyEntity(state: GameState, owner: number): boolean {
  for (const u of state.units.values()) if (u.owner === owner && !u.dead) return true;
  for (const b of state.buildings.values()) if (b.owner === owner && !b.dead) return true;
  return false;
}
export function townCenter(state: GameState, owner: number) { return [...state.buildings.values()].find((b) => b.owner === owner && b.type === 'town_center' && !b.dead) ?? null; }

/** Escala um grupo roteirizado pela dificuldade da campanha: Fácil ≈ 2/3 (mínimo 1), Difícil ≈ 1,5× (repete os primeiros). */
export function scaledGroup(state: GameState, types: string[]): string[] {
  const d = state.config.campaignDifficulty ?? 'normal';
  if (d === 'easy') return types.slice(0, Math.max(1, Math.ceil((types.length * 2) / 3)));
  if (d === 'hard') return types.concat(types.slice(0, Math.floor(types.length / 2)));
  return types;
}

/** Registro de uma invasão roteirizada (harness de testes §7.2 f): quantas unidades pedidas e quantas nasceram. */
export interface RaidRecord { owner: number; requested: number; spawned: number; noTarget?: boolean }
let raidObserver: ((r: RaidRecord) => void) | null = null;
/** Observa cada raid (só testes/harness; não muda o estado, então não afeta o determinismo). null desliga. */
export function setRaidObserver(fn: ((r: RaidRecord) => void) | null): void { raidObserver = fn; }
/** Avisa o observador (também usado pelo raid JSON quando o alvo não existe). */
export function notifyRaid(r: RaidRecord): void { raidObserver?.(r); }

/** Invoca um esquadrão a distância do alvo e o manda atacar-mover até ele (tamanho escalado pela dificuldade da campanha). Devolve quantas nasceram. */
export function raid(state: GameState, owner: number, group: string[], targetX: number, targetY: number, fromAngleIndex: number, distance = 22): number {
  const types = scaledGroup(state, group);
  const dirs: [number, number][] = [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]];
  const [dx, dy] = dirs[((fromAngleIndex % 8) + 8) % 8];
  // tile de origem: passável e na mesma região do alvo (nunca numa ilha ou bolsão); se não houver, aproxima-se do alvo
  const connected = (a: number, b: number) => isPassable(state.map, a, b) && reachesPoint(state, a, b, targetX, targetY);
  let ox = 0, oy = 0, origin: { x: number; y: number } | null = null;
  for (let d = distance; d >= 4 && !origin; d -= 3) {
    ox = Math.max(2, Math.min(state.map.w - 3, Math.round(targetX + dx * d)));
    oy = Math.max(2, Math.min(state.map.h - 3, Math.round(targetY + dy * d)));
    origin = spiralSearch(ox, oy, 8, connected);
  }
  let place = connected;
  if (!origin) {
    // alvo selado (ex.: Maravilha cercada de muralha sem portão): ninguém o alcança. O esquadrão nasce na região grande mais
    // próxima do ponto de origem e ataca-move assim mesmo; quem chega à muralha bate nela (e o cerco a derruba)
    ox = Math.max(2, Math.min(state.map.w - 3, Math.round(targetX + dx * distance)));
    oy = Math.max(2, Math.min(state.map.h - 3, Math.round(targetY + dy * distance)));
    origin = nearestLargeComponentTile(state.map, ox, oy, 64, 10);
    if (origin) { const region = componentAt(state.map, origin.x, origin.y); place = (a, b) => isPassable(state.map, a, b) && componentAt(state.map, a, b) === region; }
  }
  let spawned = 0;
  if (origin) types.forEach((t, i) => {
    const spot = spiralSearch(origin!.x + (i % 4), origin!.y + Math.floor(i / 4), 8, place);
    if (!spot) return;
    spawned++;
    const u = spawnUnit(state, owner, t, spot.x + 0.5, spot.y + 0.5);
    u.stance = 'aggressive';
    giveOrder(state, u, { type: 'attackMove', x: targetX, y: targetY });
    state.effects.push({ type: 'spawn', x: u.x, y: u.y, ttl: 20, total: 20 });
  });
  notifyRaid({ owner, requested: types.length, spawned });
  return spawned;
}

export function give(state: GameState, owner: number, res: Partial<Record<'food' | 'wood' | 'gold' | 'favor' | 'knowledge', number>>): void {
  const p = state.players[owner];
  for (const [k, v] of Object.entries(res)) p.resources[k as 'food'] += v ?? 0;
}

export function grantTech(state: GameState, owner: number, tech: string): void {
  const p = state.players[owner];
  if (!p.techs.includes(tech)) { p.techs.push(tech); recomputeMods(state, p); refreshMaxHp(state, p); }
}

/** Coloca um edifício no tile livre mais próximo (raio 14, ignorando limites e fronteiras). Devolve o edifício ou null. */
export function placeNear(state: GameState, owner: number, type: string, x: number, y: number, complete = true): Building | null {
  const spot = spiralSearch(Math.floor(x), Math.floor(y), 14, (a, b) => canPlaceBuilding(state, state.players[owner], type, a, b, true, true).ok);
  return spot ? placeBuilding(state, owner, type, spot.x, spot.y, complete) : null;
}

/** Coloca um edifício exatamente no canto (tx, ty) se couber (sem procurar ao redor); senão devolve null. */
export function placeExact(state: GameState, owner: number, type: string, tx: number, ty: number, complete = true): Building | null {
  const a = Math.floor(tx), b = Math.floor(ty);
  return canPlaceBuilding(state, state.players[owner], type, a, b, true, true).ok ? placeBuilding(state, owner, type, a, b, complete) : null;
}

/** Põe unidades a rezar num edifício (Templo ou Portal em obra), como os sacerdotes do ritual da missão 3. */
export function prayAt(units: Unit[], b: Building): void {
  for (const u of units) { u.state = 'pray'; u.nodeId = -b.id; u.order = null; u.path = null; u.targetId = -1; }
}

/** Remove na hora todos os edifícios e unidades cujo dono satisfaz o predicado (removeBuildingNow/removeUnitNow: sem escombros nem estatísticas). */
export function removeAllOf(state: GameState, ownerPred: (owner: number) => boolean): void {
  for (const b of [...state.buildings.values()]) if (ownerPred(b.owner)) removeBuildingNow(state, b);
  for (const u of [...state.units.values()]) if (ownerPred(u.owner)) removeUnitNow(state, u);
}

/** Avança a obra de um edifício em `seconds` de trabalho; ao atingir o tempo de obra, conclui via onBuildingComplete (vida cheia). */
export function advanceBuild(state: GameState, b: Building, seconds: number): void {
  if (b.dead || b.complete) return;
  b.progress += seconds;
  const total = getBuildingStats(state, state.players[b.owner], b.type).buildTime;
  if (b.progress >= total) { b.hp = b.maxHp; onBuildingComplete(state, b); }
}

/** Unidades do dono a menos de `radius` do ponto (dx²+dy² < r², sem trigonometria). */
export function nearCount(state: GameState, owner: number, x: number, y: number, radius: number, pred?: (u: Unit) => boolean): number {
  const r2 = radius * radius;
  return count(state, owner, (u) => (u.x - x) * (u.x - x) + (u.y - y) * (u.y - y) < r2 && (!pred || pred(u)));
}

/** Ids guardados numa tag do cenário: vars['#tag'] (primeira entidade) e vars['#tag[k]'] (grupos invocados com tag). */
export function tagIds(state: GameState, tag: string): number[] {
  const vars = state.scenario?.vars; if (!vars) return [];
  const out: number[] = [];
  const first = vars['#' + tag]; if (first !== undefined) out.push(first);
  for (let k = 0; ; k++) { const v = vars[`#${tag}[${k}]`]; if (v === undefined) break; if (!out.includes(v)) out.push(v); }
  return out;
}

/** Trégua global por `seconds` (ninguém ataca; sem atrito), como o poder de Hermes. */
export function ceasefire(state: GameState, seconds: number): void {
  state.ceasefireUntil = Math.max(state.ceasefireUntil, state.tick + Math.round(seconds * TICK_RATE)); state.ceasefireBy = -1;
}

export function spawnGroup(state: GameState, owner: number, types: string[], x: number, y: number): Unit[] {
  const out: Unit[] = [];
  // prefere tiles na mesma região do ponto pedido (o ponto pode ser um edifício: basta ser adjacente a ele)
  const ax = Math.floor(x), ay = Math.floor(y);
  const ok = (a: number, b: number) => isPassable(state.map, a, b) && reachesPoint(state, a, b, x, y);
  types.forEach((t, i) => {
    const spot = spiralSearch(ax + (i % 3), ay + Math.floor(i / 3), 8, ok) ?? spiralSearch(ax + (i % 3), ay + Math.floor(i / 3), 8, (a, b) => isPassable(state.map, a, b));
    if (spot) out.push(spawnUnit(state, owner, t, spot.x + 0.5, spot.y + 0.5));
  });
  return out;
}
