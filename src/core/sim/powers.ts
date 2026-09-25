// Poderes divinos: uso único por partida, com efeitos instantâneos ou temporizados.
import { TICK_RATE } from '../constants';
import { BUILDINGS, POWERS, UNITS } from '../data';
import type { GameState, Player } from '../types';
import { addNode } from '../map/mapgen';
import { spiralSearch, isPassable, inBounds, idx } from '../map/grid';
import { placeBuilding, spawnUnit, canPlaceBuilding } from './entities';
import { getRuntime } from './runtime';
import { applyDamage, killUnit } from './combat';
import { entityById, isEnemy } from './queries';

export interface PowerResult { ok: boolean; reason?: string }

export function usePower(state: GameState, player: Player, powerId: string, x?: number, y?: number, targetId?: number): PowerResult {
  const def = POWERS[powerId];
  const ps = player.powers.find((p) => p.id === powerId);
  if (!def || !ps) return { ok: false, reason: 'Poder indisponível.' };
  if (ps.used) return { ok: false, reason: 'Este poder já foi usado.' };
  const rt = getRuntime(state);
  const px = x ?? 0, py = y ?? 0;
  switch (powerId) {
    case 'bolt': {
      const t = targetId !== undefined ? entityById(state, targetId) : null;
      if (!t || t.kind !== 'unit' || t.dead || !isEnemy(state, player.id, t.owner)) return { ok: false, reason: 'Escolha uma unidade inimiga.' };
      state.effects.push({ type: 'bolt', x: t.x, y: t.y, ttl: 24, total: 24 });
      if (UNITS[t.type].tags.includes('titan')) applyDamage(state, t, t.maxHp * 0.5, player.id);
      else killUnit(state, t, player.id);
      break;
    }
    case 'lure': {
      const spot = spiralSearch(Math.floor(px), Math.floor(py), 6, (a, b) => isPassable(state.map, a, b) && state.map.buildingAt[idx(state.map, a, b)] === -1);
      if (!spot) return { ok: false, reason: 'Local inválido.' };
      addNode(state.map, 'lure', spot.x, spot.y, 800);
      state.effects.push({ type: 'spawn', x: spot.x + 0.5, y: spot.y + 0.5, ttl: 20, total: 20 });
      break;
    }
    case 'sentinel': {
      const b = targetId !== undefined ? entityById(state, targetId) : null;
      if (!b || b.kind !== 'building' || b.dead || b.owner !== player.id) return { ok: false, reason: 'Escolha um edifício seu.' };
      const spots = [[b.tx - 1, b.ty - 1], [b.tx + b.w, b.ty - 1], [b.tx - 1, b.ty + b.h], [b.tx + b.w, b.ty + b.h]];
      for (const [sx, sy] of spots) {
        const s = spiralSearch(sx, sy, 4, (a, c) => isPassable(state.map, a, c));
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
      state.events.push({ tick: state.tick, type: 'ceasefire', player: player.id, text: `${player.name} invocou uma Trégua de 30 segundos!` });
      break;
    }
    case 'pestilence': {
      const r = def.radius ?? 10;
      let n = 0;
      for (const b of state.buildings.values()) {
        if (!isEnemy(state, player.id, b.owner) || b.dead || !BUILDINGS[b.type].military) continue;
        if ((b.x - px) ** 2 + (b.y - py) ** 2 <= r * r) { b.disabledUntil = state.tick + 60 * TICK_RATE; n++; }
      }
      state.effects.push({ type: 'pestilence', x: px, y: py, ttl: 60, total: 60, data: r });
      if (n === 0) return { ok: false, reason: 'Nenhum edifício militar inimigo na área.' };
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
        const s = spiralSearch(Math.floor(u.x), Math.floor(u.y), 3, (a, b) => isPassable(state.map, a, b) && state.map.buildingAt[idx(state.map, a, b)] === -1);
        if (s) addNode(state.map, 'boar', s.x, s.y, 120);
        state.effects.push({ type: 'curse', x: u.x, y: u.y, ttl: 20, total: 20 });
        n++;
      }
      if (n === 0) return { ok: false, reason: 'Nenhum humano inimigo na área.' };
      break;
    }
    case 'lightning_storm': {
      state.timed.push({ type: 'lightning_storm', owner: player.id, until: state.tick + 8 * TICK_RATE, x: px, y: py, data: def.radius ?? 6 });
      break;
    }
    case 'plenty': {
      const spot = spiralSearch(Math.floor(px), Math.floor(py), 8, (a, b) => canPlaceBuilding(state, player, 'cornucopia', a, b, true).ok || (inBounds(state.map, a, b) && canPlaceIgnoringBuildable(state, player, a, b)));
      if (!spot) return { ok: false, reason: 'Sem espaço no seu território.' };
      placeBuilding(state, player.id, 'cornucopia', spot.x, spot.y, true);
      state.effects.push({ type: 'spawn', x: spot.x + 1, y: spot.y + 1, ttl: 20, total: 20 });
      break;
    }
    case 'earthquake': {
      state.timed.push({ type: 'earthquake', owner: player.id, until: state.tick + 5 * TICK_RATE, x: px, y: py, data: def.radius ?? 7 });
      state.effects.push({ type: 'quake', x: px, y: py, ttl: 100, total: 100, data: def.radius ?? 7 });
      break;
    }
    default: return { ok: false, reason: 'Poder desconhecido.' };
  }
  ps.used = true;
  state.events.push({ tick: state.tick, type: 'powerUsed', player: player.id, x: px, y: py, text: `${player.name} usou ${def.name}!` });
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
