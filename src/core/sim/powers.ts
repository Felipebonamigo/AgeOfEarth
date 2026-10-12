// Poderes divinos: uso único por partida, com efeitos instantâneos ou temporizados.
import { TICK_RATE } from '../constants';
import { BUILDINGS, POWERS, UNITS } from '../data';
import type { Building, GameState, Player, Unit } from '../types';
import { addNode } from '../map/mapgen';
import { isUnbuildableTerrain } from '../map/naval';
import { spiralSearchFrame, centerFrame, towardFrame, frameTile, frameRound, isPassable, inBounds, idx } from '../map/grid';
import { placeBuilding, spawnUnit, canPlaceBuilding, pushUnitsOutOfTile } from './entities';
import { getRuntime } from './runtime';
import { applyDamage, killUnit } from './combat';
import { entityById, isEnemy } from './queries';
import { POWER_TUNING as P6, homeOf, inStrip, powerScale } from './divine';
import { giveOrder } from './units';
import { unitLayer } from './naval';
import { t } from '../../i18n';
import { recordPowerUse } from '../scenario/log';

export interface PowerResult { ok: boolean; reason?: string }
/** O poder pode ser usado agora? (uso normal ou um uso extra do Trono do Olimpo) */
export function powerReady(ps: { used: boolean; charges?: number }): boolean { return !ps.used || (ps.charges ?? 0) > 0; }

export function usePower(state: GameState, player: Player, powerId: string, x?: number, y?: number, targetId?: number, ids?: number[]): PowerResult {
  const def = POWERS[powerId];
  const ps = player.powers.find((p) => p.id === powerId);
  if (!def || !ps) return { ok: false, reason: t('err.powerUnavailable') };
  if (!powerReady(ps)) return { ok: false, reason: t('err.powerUsed') };
  const rt = getRuntime(state);
  const px = x ?? 0, py = y ?? 0;
  const s = powerScale(state, player, powerId);   // E6: força da Era
  switch (powerId) {
    case 'bolt': {
      const tgt = targetId !== undefined ? entityById(state, targetId) : null;
      if (!tgt || tgt.kind !== 'unit' || tgt.dead || tgt.inside !== -1 || !isEnemy(state, player.id, tgt.owner)) return { ok: false, reason: t('err.chooseEnemyUnit') };
      state.effects.push({ type: 'bolt', x: tgt.x, y: tgt.y, ttl: 24, total: 24 });
      if (UNITS[tgt.type].tags.includes('titan')) applyDamage(state, tgt, tgt.maxHp * Math.min(P6.boltTitanMax, P6.boltTitanBase * s), player.id);
      else killUnit(state, tgt, player.id);
      break;
    }
    case 'lure': {
      // espiral no referencial do ponto voltado ao centro do mapa (antes: o norte primeiro): pontos espelhados dão iscas espelhadas
      const f = centerFrame(state.map, px, py);
      const spot = spiralSearchFrame(frameTile(px, f.sx), frameTile(py, f.sy), 6, (a, b) => isPassable(state.map, a, b) && !isUnbuildableTerrain(state.map.terrain[idx(state.map, a, b)]) && state.map.buildingAt[idx(state.map, a, b)] === -1, f);
      if (!spot) return { ok: false, reason: t('err.invalidPlace') };
      addNode(state.map, 'lure', spot.x, spot.y, Math.round(800 * s));
      pushUnitsOutOfTile(state, spot.x, spot.y);
      state.effects.push({ type: 'spawn', x: spot.x + 0.5, y: spot.y + 0.5, ttl: 20, total: 20 });
      break;
    }
    case 'sentinel': {
      const b = targetId !== undefined ? entityById(state, targetId) : null;
      if (!b || b.kind !== 'building' || b.dead || b.owner !== player.id) return { ok: false, reason: t('err.chooseOwnBuilding') };
      const spots = [[b.tx - 1, b.ty - 1], [b.tx + b.w, b.ty - 1], [b.tx - 1, b.ty + b.h], [b.tx + b.w, b.ty + b.h]];
      const n = Math.min(8, Math.round(4 * s)), used = new Set<number>();
      for (let k = 0; k < n; k++) {
        const [sx, sy] = spots[k % 4];
        // cada canto procura primeiro para fora do edifício; as estátuas extras (E6) não repetem tile
        const sp = spiralSearchFrame(sx, sy, 4, (a, c) => isPassable(state.map, a, c) && (k < 4 || !used.has(idx(state.map, a, c))), towardFrame(sx + 0.5 - b.x, sy + 0.5 - b.y));
        if (sp) { used.add(idx(state.map, sp.x, sp.y)); spawnUnit(state, player.id, 'sentinel', sp.x + 0.5, sp.y + 0.5); state.effects.push({ type: 'spawn', x: sp.x + 0.5, y: sp.y + 0.5, ttl: 20, total: 20 }); }
      }
      break;
    }
    case 'restoration': {
      const r = (def.radius ?? 8) * s;
      rt.hash.each(px, py, r, (u) => { if (u.owner === player.id && !u.dead && (u.x - px) ** 2 + (u.y - py) ** 2 <= r * r) u.hp = u.maxHp; });
      for (const b of state.buildings.values()) if (b.owner === player.id && !b.dead && b.complete && (b.x - px) ** 2 + (b.y - py) ** 2 <= r * r) b.hp = b.maxHp;
      state.effects.push({ type: 'heal', x: px, y: py, ttl: 40, total: 40, data: r });
      break;
    }
    case 'ceasefire': {
      state.ceasefireUntil = state.tick + Math.round(30 * TICK_RATE * s); state.ceasefireBy = player.id;
      state.events.push({ tick: state.tick, type: 'ceasefire', player: player.id, text: t('ev.ceasefire', { player: player.name }) });
      break;
    }
    case 'pestilence': {
      const r = def.radius ?? 10;
      let n = 0;
      for (const b of state.buildings.values()) {
        if (!isEnemy(state, player.id, b.owner) || b.dead || !BUILDINGS[b.type].military) continue;
        if ((b.x - px) ** 2 + (b.y - py) ** 2 <= r * r) { b.disabledUntil = state.tick + Math.round(60 * TICK_RATE * s); n++; }
      }
      if (n === 0) return { ok: false, reason: t('err.noMilitaryBuildings') };
      state.effects.push({ type: 'pestilence', x: px, y: py, ttl: 60, total: 60, data: r });
      break;
    }
    case 'oracle': player.revealUntil = state.tick + Math.round(60 * TICK_RATE * s); break;
    case 'bronze': player.bronzeUntil = state.tick + Math.round(45 * TICK_RATE * s); state.effects.push({ type: 'bronze', x: 0, y: 0, ttl: 10, total: 10, owner: player.id }); break;
    case 'curse': {
      const r = def.radius ?? 4;
      let n = 0;
      const maxVictims = Math.round(8 * s);
      const victims = rt.hash.query(px, py, r).filter((u) => isEnemy(state, player.id, u.owner) && !u.dead && UNITS[u.type].tags.includes('human') && !UNITS[u.type].tags.includes('hero'));
      for (const u of victims) {
        if (n >= maxVictims) break;
        killUnit(state, u, player.id);
        if (!u.dead) { n++; continue; }   // piso de vida (G9): a Maldição só o leva até o piso (sem javali)
        const f = centerFrame(state.map, u.x, u.y);
        const s = spiralSearchFrame(frameTile(u.x, f.sx), frameTile(u.y, f.sy), 3, (a, b) => isPassable(state.map, a, b) && !isUnbuildableTerrain(state.map.terrain[idx(state.map, a, b)]) && state.map.buildingAt[idx(state.map, a, b)] === -1, f);
        if (s) { addNode(state.map, 'boar', s.x, s.y, 120); pushUnitsOutOfTile(state, s.x, s.y); }
        state.effects.push({ type: 'curse', x: u.x, y: u.y, ttl: 20, total: 20 });
        n++;
      }
      if (n === 0) return { ok: false, reason: t('err.noHumans') };
      break;
    }
    case 'lightning_storm': {
      state.timed.push({ type: 'lightning_storm', owner: player.id, until: state.tick + 8 * TICK_RATE, x: px, y: py, data: def.radius ?? 6, mult: s });
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
      state.timed.push({ type: 'earthquake', owner: player.id, until: state.tick + 5 * TICK_RATE, x: px, y: py, data: def.radius ?? 7, mult: s });
      state.effects.push({ type: 'quake', x: px, y: py, ttl: 100, total: 100, data: def.radius ?? 7 });
      break;
    }
    // ---------------- E6: deuses menores das Eras V–VII (docs/eras/E6-mitologia.md) ----------------
    case 'panic': {
      const r = def.radius ?? 7, until = state.tick + Math.round(P6.panic.seconds * s * TICK_RATE);
      let n = 0;
      for (const u of rt.hash.query(px, py, r)) {
        if (u.dead || u.inside !== -1 || !isEnemy(state, player.id, u.owner)) continue;
        const d = UNITS[u.type];
        if (d.immobile || d.naval || d.tags.includes('titan') || d.tags.includes('hero')) continue;
        let dx = u.x - px, dy = u.y - py, l = Math.sqrt(dx * dx + dy * dy);
        if (l < 0.01) { dx = state.map.w / 2 - px; dy = state.map.h / 2 - py; l = Math.sqrt(dx * dx + dy * dy); if (l < 0.01) { dx = 1; dy = 0; l = 1; } }
        const tx = Math.max(1, Math.min(state.map.w - 2, u.x + (dx / l) * P6.panic.flee)), ty = Math.max(1, Math.min(state.map.h - 2, u.y + (dy / l) * P6.panic.flee));
        giveOrder(state, u, { type: 'move', x: tx, y: ty });
        u.fearUntil = until;
        n++;
      }
      if (n === 0) return { ok: false, reason: t('err.noEnemiesHere') };
      state.effects.push({ type: 'divine', x: px, y: py, ttl: 30, total: 30, data: r, src: powerId, owner: player.id });
      break;
    }
    case 'crossroads': {
      const tx0 = Math.floor(px), ty0 = Math.floor(py);
      if (!inBounds(state.map, tx0, ty0) || player.visibility[idx(state.map, tx0, ty0)] === 0 || !isPassable(state.map, tx0, ty0)) return { ok: false, reason: t('err.crossroadsDest') };
      const cap = Math.round(P6.crossroads.pop * s);
      const group: Unit[] = [];
      let pop = 0;
      for (const id of ids ?? []) {
        const u = state.units.get(id);
        if (!u || u.dead || u.owner !== player.id || u.inside !== -1 || group.includes(u)) continue;
        const d = UNITS[u.type];
        if (d.immobile || d.naval || d.tags.includes('titan') || (d.capacity ?? 0) > 0) continue;
        const need = Math.max(1, d.pop);
        if (pop + need > cap) continue;
        group.push(u); pop += need;
      }
      if (group.length === 0) return { ok: false, reason: t('err.crossroadsNoUnits') };
      const ox = group.reduce((a, u) => a + u.x, 0) / group.length, oy = group.reduce((a, u) => a + u.y, 0) / group.length;
      const f = centerFrame(state.map, px, py), taken = new Set<number>();
      for (const u of group) {
        const lay = unitLayer(state, UNITS[u.type]);
        const sp = spiralSearchFrame(tx0, ty0, P6.crossroads.spread, (a, b) => inBounds(state.map, a, b) && !taken.has(idx(state.map, a, b)) && isPassable(state.map, a, b, lay), f);
        if (!sp) continue;   // sem lugar perto do destino: fica onde está
        taken.add(idx(state.map, sp.x, sp.y));
        u.x = sp.x + 0.5; u.y = sp.y + 0.5; u.px = u.x; u.py = u.y; u.tx = u.x; u.ty = u.y;
        u.path = null; u.state = 'idle'; u.order = null; u.queue = []; u.targetId = -1;
      }
      state.effects.push({ type: 'divine', x: ox, y: oy, ttl: 30, total: 30, data: 3, src: powerId, owner: player.id });
      state.effects.push({ type: 'divine', x: px, y: py, ttl: 30, total: 30, data: 3, src: powerId, owner: player.id });
      break;
    }
    case 'spring': {
      const r = def.radius ?? 6;
      state.timed.push({ type: 'spring', owner: player.id, until: state.tick + Math.round(P6.spring.seconds * s * TICK_RATE), x: px, y: py, data: r, count: 0 });
      state.effects.push({ type: 'divine', x: px, y: py, ttl: 30, total: 30, data: r, src: powerId, owner: player.id });
      break;
    }
    case 'gale': {
      const r = def.radius ?? 8;
      for (const u of rt.hash.query(px, py, r)) {
        if (u.dead || u.inside !== -1 || !isEnemy(state, player.id, u.owner)) continue;
        const d = UNITS[u.type];
        if (d.immobile || d.naval || d.tags.includes('titan')) continue;
        const dx = u.x - px, dy = u.y - py, l = Math.sqrt(dx * dx + dy * dy);
        if (l < 0.01) continue;
        const lay = unitLayer(state, d);
        let bx = u.x, by = u.y;
        for (let k = 1; k <= P6.gale.push; k++) {
          const nx = u.x + (dx / l) * k, ny = u.y + (dy / l) * k;
          if (!isPassable(state.map, Math.floor(nx), Math.floor(ny), lay)) break;
          bx = nx; by = ny;
        }
        if (bx !== u.x || by !== u.y) { u.x = bx; u.y = by; u.px = bx; u.py = by; u.path = null; }
      }
      for (const b of state.buildings.values()) {
        if (b.owner !== player.id || b.dead || !b.complete || (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py) > r * r) continue;
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * P6.gale.repair);
      }
      for (let i = state.timed.length - 1; i >= 0; i--) {   // apaga o Carro do Sol inimigo na área
        const o = state.timed[i];
        if (o.type === 'sun_chariot' && isEnemy(state, player.id, o.owner) && o.x !== undefined && o.y !== undefined && (o.x - px) * (o.x - px) + (o.y - py) * (o.y - py) <= r * r) state.timed.splice(i, 1);
      }
      state.timed.push({ type: 'gale', owner: player.id, until: state.tick + Math.round(P6.gale.seconds * s * TICK_RATE), x: px, y: py, data: r });
      state.effects.push({ type: 'divine', x: px, y: py, ttl: 30, total: 30, data: r, src: powerId, owner: player.id });
      break;
    }
    case 'tidal_wave': {
      const r = def.radius ?? 7;
      let n = 0;
      for (const u of rt.hash.query(px, py, r)) {
        if (u.dead || u.inside !== -1 || !isEnemy(state, player.id, u.owner)) continue;
        applyDamage(state, u, (UNITS[u.type].tags.includes('ship') ? P6.tidal.ship : P6.tidal.unit) * s, player.id); n++;
      }
      for (const b of state.buildings.values()) {
        if (b.dead || !isEnemy(state, player.id, b.owner) || (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py) > r * r) continue;
        applyDamage(state, b, P6.tidal.building * s, player.id); n++;
      }
      if (n === 0) return { ok: false, reason: t('err.noEnemiesHere') };
      state.effects.push({ type: 'divine', x: px, y: py, ttl: 30, total: 30, data: r, src: powerId, owner: player.id });
      break;
    }
    case 'divine_harvest': {
      player.harvestUntil = state.tick + Math.round(P6.harvest.seconds * s * TICK_RATE);
      const h = homeOf(state, player);
      state.effects.push({ type: 'divine', x: h.x, y: h.y, ttl: 30, total: 30, data: 6, src: powerId, owner: player.id });
      break;
    }
    case 'sun_chariot': {
      let tc: Building | null = null, bd = Infinity;
      for (const b of state.buildings.values()) {
        if (b.owner !== player.id || b.dead || b.type !== 'town_center') continue;
        const d = (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py);
        if (d < bd || (d === bd && tc !== null && b.id < tc.id)) { bd = d; tc = b; }
      }
      let dx = tc ? px - tc.x : state.map.w / 2 - px, dy = tc ? py - tc.y : state.map.h / 2 - py;
      if (dx * dx + dy * dy < 1) { dx = state.map.w / 2 - px; dy = state.map.h / 2 - py; }
      const l = Math.sqrt(dx * dx + dy * dy);
      if (l < 1e-6) { dx = 1; dy = 0; } else { dx /= l; dy /= l; }
      state.timed.push({ type: 'sun_chariot', owner: player.id, until: state.tick + P6.sun.seconds * TICK_RATE, x: px, y: py, data: P6.sun.half, dx, dy, mult: s });
      state.effects.push({ type: 'divine', x: px, y: py, ttl: 30, total: 30, data: P6.sun.half, src: powerId, owner: player.id });
      break;
    }
    case 'winged_victory': {
      player.nikeUntil = state.tick + Math.round(P6.nike.seconds * s * TICK_RATE);
      const h = homeOf(state, player);
      state.effects.push({ type: 'divine', x: h.x, y: h.y, ttl: 30, total: 30, data: 6, src: powerId, owner: player.id });
      break;
    }
    case 'retribution': {
      player.nemesisUntil = state.tick + Math.round(P6.nemesis.seconds * s * TICK_RATE);
      const h = homeOf(state, player);
      state.effects.push({ type: 'divine', x: h.x, y: h.y, ttl: 30, total: 30, data: 6, src: powerId, owner: player.id });
      break;
    }
    default: return { ok: false, reason: t('err.unknownPower') };
  }
  if (ps.used) ps.charges = Math.max(0, (ps.charges ?? 0) - 1); else ps.used = true;
  recordPowerUse(state, player.id, powerId);   // G11: { powerUsed } do cenário conta usos (reset/remove não zeram)
  state.events.push({ tick: state.tick, type: 'powerUsed', player: player.id, x: px, y: py, data: powerId, text: t('ev.powerUsed', { player: player.name, power: def.name }) });
  return { ok: true };
}

function canPlaceIgnoringBuildable(state: GameState, player: Player, tx: number, ty: number): boolean {
  for (let y = ty; y < ty + 2; y++) for (let x = tx; x < tx + 2; x++) {
    if (!inBounds(state.map, x, y)) return false;
    const i = idx(state.map, x, y);
    if (state.map.blocked[i] || isUnbuildableTerrain(state.map.terrain[i]) || state.map.buildingAt[i] !== -1 || state.territory[i] !== player.id) return false;
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
        applyDamage(state, v, 200 * (t.mult ?? 1), t.owner);
      } else {
        state.effects.push({ type: 'bolt', x: t.x! + state.rng.range(-r, r), y: t.y! + state.rng.range(-r, r), ttl: 16, total: 16 });
      }
    } else if (t.type === 'earthquake' && state.tick % 5 === 0) {
      const r = t.data ?? 7;
      for (const b of state.buildings.values()) {
        if (b.dead || !isEnemy(state, t.owner, b.owner)) continue;
        if ((b.x - t.x!) ** 2 + (b.y - t.y!) ** 2 <= r * r) applyDamage(state, b, 75 * (t.mult ?? 1), t.owner);
      }
      rt.hash.each(t.x!, t.y!, r, (u) => { if (isEnemy(state, t.owner, u.owner) && !u.dead && (u.x - t.x!) ** 2 + (u.y - t.y!) ** 2 <= r * r) applyDamage(state, u, 3 * (t.mult ?? 1), t.owner); });
    } else if (t.type === 'sun_chariot' && state.tick % 5 === 0 && t.x !== undefined && t.y !== undefined) {   // E6
      const half = t.data ?? P6.sun.half, w = P6.sun.width, m = t.mult ?? 1, dx = t.dx ?? 1, dy = t.dy ?? 0;
      for (const u of rt.hash.query(t.x, t.y, half + w)) {
        if (u.dead || u.inside !== -1 || !isEnemy(state, t.owner, u.owner)) continue;
        if (inStrip(u.x - t.x, u.y - t.y, dx, dy, half, w)) applyDamage(state, u, P6.sun.unit * m, t.owner);
      }
      for (const b of state.buildings.values()) {
        if (b.dead || !isEnemy(state, t.owner, b.owner)) continue;
        if (inStrip(b.x - t.x, b.y - t.y, dx, dy, half, w + Math.max(b.w, b.h) / 2)) applyDamage(state, b, P6.sun.building * m, t.owner);
      }
    }
  }
}
