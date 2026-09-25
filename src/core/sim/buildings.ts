// Atualização de edifícios: filas de produção (unidades, tecnologias, filósofos, avanço de idade),
// defesa automática (torres, fortalezas, centros cívicos) e Portal dos Titãs.
import { MAX_SCHOLARS, TICK_RATE } from '../constants';
import { AGES, BUILDINGS, MAJOR_GODS, MINOR_GODS, POWERS, TECHS, UNITS } from '../data';
import type { Building, GameState, Player, QueueItem } from '../types';
import { getBuildingStats, getUnitStats, recomputeMods, refreshMaxHp } from './modifiers';
import type { Runtime } from './runtime';
import { acquireTarget, attackInterval, performAttack } from './combat';
import { findSpawnTile, recomputePop, spawnUnit } from './entities';
import { giveOrder } from './units';
import { entityById } from './queries';
import { t } from '../../i18n';

export function updateBuilding(state: GameState, rt: Runtime, b: Building, dt: number): void {
  void rt;
  const def = BUILDINGS[b.type];
  const player = state.players[b.owner];
  if (!b.complete) return;
  if (b.cooldown > 0) b.cooldown -= dt;
  // Fila de produção
  if (b.queue.length > 0 && state.tick >= b.disabledUntil) {
    const item = b.queue[0];
    item.elapsed += dt;
    if (item.elapsed >= item.total) { b.queue.shift(); completeQueueItem(state, b, item); }
  }
  // Defesa
  if (def.attack && state.tick >= state.ceasefireUntil && b.cooldown <= 0 && (state.tick + b.id) % 4 === 0) {
    const st = getBuildingStats(state, player, b.type);
    const t = acquireTarget(state, b, st.range, false);
    if (t) {
      performAttack(state, b, t); b.cooldown = attackInterval(b);
      // flechas extras das unidades guarnecidas (1 a cada 3, máx. 4)
      const extra = Math.min(4, Math.floor(b.garrison.length / 3));
      for (let k = 0; k < extra; k++) { const t2 = acquireTarget(state, b, st.range, false); if (t2) performAttack(state, b, t2); }
    }
  }
  // Portal dos Titãs
  if (def.titanGate && !player.titanSpawned) {
    player.titanSpawned = true;
    const titan = MAJOR_GODS[player.god]?.titan ?? 'cronus';
    const spot = findSpawnTile(state, b);
    const titanUnit = spawnUnit(state, b.owner, titan, spot.x, spot.y);
    titanUnit.stance = 'aggressive';
    state.effects.push({ type: 'titanRise', x: b.x, y: b.y, ttl: 60, total: 60 });
    state.events.push({ tick: state.tick, type: 'titan', player: b.owner, x: b.x, y: b.y, text: t('ev.titan', { titan: UNITS[titan].name, player: player.name }) });
  }
}

function completeQueueItem(state: GameState, b: Building, item: QueueItem): void {
  const player = state.players[b.owner];
  switch (item.kind) {
    case 'unit': {
      const def = UNITS[item.id];
      const toward = b.rallyX >= 0 ? b.rallyX : undefined;
      const spot = findSpawnTile(state, b, toward, b.rallyY >= 0 ? b.rallyY : undefined);
      const u = spawnUnit(state, b.owner, item.id, spot.x, spot.y);
      player.stats.unitsTrained++;
      recomputePop(state, player);
      if (b.rallyX >= 0) {
        // Ponto de encontro: se for um recurso/edifício, cidadãos vão coletar; senão, mover
        const rallyTarget = rallyEntityAt(state, b.rallyX, b.rallyY);
        if (def.canGather && rallyTarget !== null) giveOrder(state, u, { type: 'gather', targetId: rallyTarget });
        else giveOrder(state, u, { type: def.tags.includes('military') ? 'attackMove' : 'move', x: b.rallyX, y: b.rallyY });
      }
      break;
    }
    case 'tech': {
      if (!player.techs.includes(item.id)) player.techs.push(item.id);
      recomputeMods(state, player);
      refreshMaxHp(state, player);
      if (!player.isAI) state.events.push({ tick: state.tick, type: 'research', player: b.owner, text: t('ev.research', { name: TECHS[item.id].name }) });
      if (TECHS[item.id].effects.some((e) => e.type === 'player' && (e.stat === 'territory' || e.stat === 'popCap'))) { state.territoryDirty = true; recomputePop(state, player); }
      break;
    }
    case 'scholar': b.scholars = Math.min(MAX_SCHOLARS, b.scholars + 1); break;
    case 'age': {
      const [, minor] = item.id.split(':');
      player.age = Math.min(AGES.length - 1, player.age + 1);
      // deus menor válido: opção do deus maior para a idade que acabou de passar, ainda não escolhido
      const options = MAJOR_GODS[player.god]?.minorGods[player.age - 1] ?? [];
      if (minor && MINOR_GODS[minor] && options.includes(minor) && !player.minorGods.includes(minor)) {
        player.minorGods.push(minor);
        const power = MINOR_GODS[minor].power;
        if (!player.powers.some((p) => p.id === power)) player.powers.push({ id: power, used: false });
      }
      recomputeMods(state, player);
      refreshMaxHp(state, player);
      state.territoryDirty = true;
      recomputePop(state, player);
      const godTxt = minor && MINOR_GODS[minor] ? t('ev.ageGod', { god: MINOR_GODS[minor].name }) : '';
      state.events.push({ tick: state.tick, type: 'age', player: b.owner, text: t('ev.age', { player: player.name, age: AGES[player.age].name, god: godTxt }) });
      if (minor && MINOR_GODS[minor] && !player.isAI) state.events.push({ tick: state.tick, type: 'power', player: b.owner, text: t('ev.newPower', { name: POWERS[MINOR_GODS[minor].power].name }) });
      break;
    }
  }
}

/** Retorna id de nó/fazenda no ponto de encontro (para cidadãos coletarem automaticamente), ou null. */
function rallyEntityAt(state: GameState, x: number, y: number): number | null {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= state.map.w || ty >= state.map.h) return null;
  const i = ty * state.map.w + tx;
  const nid = state.map.nodeAt[i];
  if (nid !== -1) return nid;
  const bid = state.map.buildingAt[i];
  if (bid !== -1) { const b = entityById(state, bid); if (b && b.kind === 'building' && BUILDINGS[b.type].farm) return bid; }
  return null;
}

export { refreshMaxHp } from './modifiers';

export function queueTotalFor(state: GameState, player: Player, kind: QueueItem['kind'], id: string): number {
  if (kind === 'unit') return getUnitStats(state, player, id).trainTime;
  if (kind === 'tech') return TECHS[id].time;
  if (kind === 'scholar') return 15;
  if (kind === 'age') return AGES[Math.min(AGES.length - 1, player.age + 1)].time;
  return 10;
}

export const TICKS = TICK_RATE;
