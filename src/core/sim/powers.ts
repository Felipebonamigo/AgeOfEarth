// Poderes divinos: uso único por partida, com efeitos instantâneos ou temporizados.
import { TICK_RATE } from '../constants';
import { BUILDINGS, POWERS, UNITS } from '../data';
import type { GameState, Player } from '../types';
import { addNode } from '../map/mapgen';
import { spiralSearchFrame, centerFrame, towardFrame, frameTile, frameRound, isPassable, inBounds, idx } from '../map/grid';
import { placeBuilding, spawnUnit, canPlaceBuilding, pushUnitsOutOfTile } from './entities';
import { getRuntime } from './runtime';
import { applyDamage, killUnit } from './combat';
import { entityById, isEnemy } from './queries';
import { t } from '../../i18n';
import { recordPowerUse } from '../scenario/log';

export interface PowerResult { ok: boolean; reason?: string }

export function usePower(state: GameState, player: Player, powerId: string, x?: number, y?: number, targetId?: number): PowerResult {
  const def = POWERS[powerId];
  const ps = player.powers.find((p) => p.id === powerId);
  if (!def || !ps) return { ok: false, reason: t('err.powerUnavailable') };
  if (ps.used) return { ok: false, reason: t('err.powerUsed') };
  const rt = getRuntime(state);
  const px = x ?? 0, py = y ?? 0;
  switch (powerId) {
    case 'bolt': {
      const tgt = targetId !== undefined ? entityById(state, targetId) : null;
      if (!tgt || tgt.kind !== 'unit' || tgt.dead || tgt.inside !== -1 || !isEnemy(state, player.id, tgt.owner)) return { ok: false, reason: t('err.chooseEnemyUnit') };
      state.effects.push({ type: 'bolt', x: tgt.x, y: tgt.y, ttl: 24, total: 24 });
      if (UNITS[tgt.type].tags.includes('titan')) applyDamage(state, tgt, tgt.maxHp * 0.5, player.id);
      else killUnit(state, tgt, player.id);
      break;
    }
    case 'lure': {
      // espiral no referencial do ponto voltado ao centro do mapa (antes: o norte primeiro): pontos espelhados dão iscas espelhadas
      const f = centerFrame(state.map, px, py);
      const spot = spiralSearchFrame(frameTile(px, f.sx), frameTile(py, f.sy), 6, (a, b) => isPassable(state.map, a, b) && state.map.buildingAt[idx(state.map, a, b)] === -1, f);
      if (!spot) return { ok: false, reason: t('err.invalidPlace') };
      addNode(state.map, 'lure', spot.x, spot.y, 800);
      pushUnitsOutOfTile(state, spot.x, spot.y);
      state.effects.push({ type: 'spawn', x: spot.x + 0.5, y: spot.y + 0.5, ttl: 20, total: 20 });
      break;
    }
    case 'sentinel': {
      const b = targetId !== undefined ? entityById(state, targetId) : null;
      if (!b || b.kind !== 'building' || b.dead || b.owner !== player.id) return { ok: false, reason: t('err.chooseOwnBuilding') };
      const spots = [[b.tx - 1, b.ty - 1], [b.tx + b.w, b.ty - 1], [b.tx - 1, b.ty + b.h], [b.tx + b.w, b.ty + b.h]];
      for (const [sx, sy] of spots) {
        // cada canto procura primeiro para fora do edifício (antes: o norte primeiro em todos)
        const s = spiralSearchFrame(sx, sy, 4, (a, c) => isPassable(state.map, a, c), towardFrame(sx + 0.5 - b.x, sy + 0.5 - b.y));
        if (s) { spawnUnit(state, player.id, 'sentinel', s.x + 0.5, s.y + 0.5); state.effects.push({ type: 'spawn', x: s.x + 0.5, y: s.y + 0.5, ttl: 20, total: 20 }); }
      }
      break;
    }
    case 'restoration': {
      const r = def.radius ?? 8;
      rt.hash.each(px, py, r, (u) => { if (u.owner === player.id && !u.dead && (u.x - px) ** 2 + (u.y - py) ** 2 <= r * r) u.hp = u.maxHp; });
      for (const b of state.buildings.values()) if (b.owner === player.id && !b.dead && b.complete && (b.x - px) ** 2 + (b.y - py) ** 2 <= r * r) b.hp = b.maxHp;
      state.effects.push({ type: 'heal', x: px, y: py, ttl: 40, total: 40, data: r });
      break;
    }
    case 'ceasefire': {
      state.ceasefireUntil = state.tick + 30 * TICK_RATE; state.ceasefireBy = player.id;
      state.events.push({ tick: state.tick, type: 'ceasefire', player: player.id, text: t('ev.ceasefire', { player: player.name }) });
      break;
    }
    case 'pestilence': {
      const r = def.radius ?? 10;
      let n = 0;
      for (const b of state.buildings.values()) {
        if (!isEnemy(state, player.id, b.owner) || b.dead || !BUILDINGS[b.type].military) continue;
        if ((b.x - px) ** 2 + (b.y - py) ** 2 <= r * r) { b.disabledUntil = state.tick + 60 * TICK_RATE; n++; }
      }
      if (n === 0) return { ok: false, reason: t('err.noMilitaryBuildings') };
      state.effects.push({ type: 'pestilence', x: px, y: py, ttl: 60, total: 60, data: r });
      break;
    }
    case 'oracle': player.revealUntil = state.tick + 60 * TICK_RATE; break;
    case 'bronze': player.bronzeUntil = state.tick + 45 * TICK_RATE; state.effects.push({ type: 'bronze', x: 0, y: 0, ttl: 10, total: 10, owner: player.id }); break;
    case 'curse': {
      const r = def.radius ?? 4;
      let n = 0;
      const victims = rt.hash.query(px, py, r).filter((u) => isEnemy(state, player.id, u.owner) && !u.dead && UNITS[u.type].tags.includes('human') && !UNITS[u.type].tags.includes('hero'));
      for (const u of victims) {
        if (n >= 8) break;
        killUnit(state, u, player.id);
        if (!u.dead) { n++; continue; }   // piso de vida (G9): a Maldição só o leva até o piso (sem javali)
        const f = centerFrame(state.map, u.x, u.y);
        const s = spiralSearchFrame(frameTile(u.x, f.sx), frameTile(u.y, f.sy), 3, (a, b) => isPassable(state.map, a, b) && state.map.buildingAt[idx(state.map, a, b)] === -1, f);
        if (s) { addNode(state.map, 'boar', s.x, s.y, 120); pushUnitsOutOfTile(state, s.x, s.y); }
        state.effects.push({ type: 'curse', x: u.x, y: u.y, ttl: 20, total: 20 });
        n++;
      }
      if (n === 0) return { ok: false, reason: t('err.noHumans') };
      break;
    }
    case 'lightning_storm': {
      state.timed.push({ type: 'lightning_storm', owner: player.id, until: state.tick + 8 * TICK_RATE, x: px, y: py, data: def.radius ?? 6 });
      break;
    }
    case 'plenty': {
      // a cornucópia (2×2) fica CENTRADA no ponto: a espiral anda pelos centros de pegada (inteiros), a partir do mais perto
      // do ponto, no referencial dele voltado ao centro do mapa. Antes a espiral achava o canto superior esquerdo a partir do
      // ponto e a pegada crescia para leste/sul: pontos espelhados davam cornucópias deslocadas de 1–2 tiles, não espelhadas.
      const f = centerFrame(state.map, px, py);
      const fits = (a: number, b: number) => canPlaceBuilding(state, player, 'cornucopia', a, b, true).ok || (inBounds(state.map, a, b) && canPlaceIgnoringBuildable(state, player, a, b));
      const c = spiralSearchFrame(frameRound(px, f.sx), frameRound(py, f.sy), 8, (X, Y) => fits(X - 1, Y - 1), f);
      if (!c) return { ok: false, reason: t('err.noSpace') };
      placeBuilding(state, player.id, 'cornucopia', c.x - 1, c.y - 1, true);
      state.effects.push({ type: 'spawn', x: c.x, y: c.y, ttl: 20, total: 20 });
      break;
    }
    case 'earthquake': {
      state.timed.push({ type: 'earthquake', owner: player.id, until: state.tick + 5 * TICK_RATE, x: px, y: py, data: def.radius ?? 7 });
      state.effects.push({ type: 'quake', x: px, y: py, ttl: 100, total: 100, data: def.radius ?? 7 });
      break;
    }
    default: return { ok: false, reason: t('err.unknownPower') };
  }
  ps.used = true;
  recordPowerUse(state, player.id, powerId);   // G11: { powerUsed } do cenário conta usos (reset/remove não zeram)
  state.events.push({ tick: state.tick, type: 'powerUsed', player: player.id, x: px, y: py, data: powerId, text: t('ev.powerUsed', { player: player.name, power: def.name }) });
  return { ok: true };
}

function canPlaceIgnoringBuildable(state: GameState, player: Player, tx: number, ty: number): boolean {
  for (let y = ty; y < ty + 2; y++) for (let x = tx; x < tx + 2; x++) {
    if (!inBounds(state.map, x, y)) return false;
    const i = idx(state.map, x, y);
    if (state.map.blocked[i] || state.map.buildingAt[i] !== -1 || state.territory[i] !== player.id) return false;
  }
  return true;
}

/** Efeitos temporizados dos poderes (tempestade de raios, terremoto). Chamado a cada tick. */
export function updateTimedEffects(state: GameState): void {
  if (state.timed.length === 0) return;
  const rt = getRuntime(state);
  for (let i = state.timed.length - 1; i >= 0; i--) {
    const t = state.timed[i];
    if (state.tick >= t.until) { state.timed.splice(i, 1); continue; }
    if (t.type === 'lightning_storm' && state.tick % 10 === 0) {
      const r = t.data ?? 6;
      const targets = rt.hash.query(t.x!, t.y!, r).filter((u) => isEnemy(state, t.owner, u.owner) && !u.dead);
      if (targets.length > 0) {
        const v = targets[Math.floor(state.rng.float() * targets.length)];
        state.effects.push({ type: 'bolt', x: v.x, y: v.y, ttl: 16, total: 16 });
        applyDamage(state, v, 200, t.owner);
      } else {
        state.effects.push({ type: 'bolt', x: t.x! + state.rng.range(-r, r), y: t.y! + state.rng.range(-r, r), ttl: 16, total: 16 });
      }
    } else if (t.type === 'earthquake' && state.tick % 5 === 0) {
      const r = t.data ?? 7;
      for (const b of state.buildings.values()) {
        if (b.dead || !isEnemy(state, t.owner, b.owner)) continue;
        if ((b.x - t.x!) ** 2 + (b.y - t.y!) ** 2 <= r * r) applyDamage(state, b, 75, t.owner);
      }
      rt.hash.each(t.x!, t.y!, r, (u) => { if (isEnemy(state, t.owner, u.owner) && !u.dead && (u.x - t.x!) ** 2 + (u.y - t.y!) ** 2 <= r * r) applyDamage(state, u, 3, t.owner); });
    }
  }
}
