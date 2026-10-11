// E5: caravanas e rotas comerciais (docs/eras/E5-E7-comercio-maravilhas.md, Fase E)
import { describe, it, expect } from 'vitest';
import { AGES, BUILDINGS, UNITS } from '../src/core/data';
import { TERRAIN, CARAVAN_TARGET_AI, MERCHANT_SHIP_TARGET_AI, RESOURCES, TICK_RATE, TRADE_ALLY_BONUS } from '../src/core/constants';
import { applyCommand } from '../src/core/sim/commands';
import { buildingsOf, canPlaceBuilding, placeBuilding, spawnUnit } from '../src/core/sim/entities';
import { routeGold } from '../src/core/sim/trade';
import { destroyBuilding } from '../src/core/sim/combat';
import { serialize, deserialize } from '../src/core/serialize';
import { addNode } from '../src/core/map/mapgen';
import { idx, isPassable } from '../src/core/map/grid';
import { MIN_DOCK_WATER } from '../src/core/map/naval';
import { componentAt, componentSize, invalidateComponents } from '../src/core/map/components';
import type { GameState } from '../src/core/types';
import { t } from '../src/i18n';
import { quickGame, run } from './helpers';

function clearRect(s: GameState, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = idx(s.map, x, y);
    if (s.map.buildingAt[i] !== -1) continue;
    s.map.blocked[i] = 0; if (s.map.nodeAt[i] !== -1) s.map.nodes.delete(s.map.nodeAt[i]); s.map.nodeAt[i] = -1;
  }
}
/** Deixa uma área livre e sem nós, para montar cenários determinísticos. */
function arena(s: GameState, x0: number, y0: number, x1: number, y1: number) { clearRect(s, x0, y0, x1, y1); invalidateComponents(s.map); }

function setup(dx: number, over: Parameters<typeof quickGame>[0] = {}) {
  const s = quickGame(over); const p = s.players[0]; p.age = 1;
  const tc = buildingsOf(s, 0).find((b) => b.type === 'town_center')!;
  const sign = tc.x < s.map.w / 2 ? 1 : -1;
  arena(s, Math.min(tc.tx, tc.tx + sign * dx) - 2, tc.ty - 4, Math.max(tc.tx + 3, tc.tx + sign * dx + 3) + 2, tc.ty + 6);
  const market = placeBuilding(s, 0, 'market', tc.tx + sign * dx, tc.ty, true);
  const c = spawnUnit(s, 0, 'caravan', tc.x, tc.ty + 4.5);
  return { s, p, tc, market, c, sign };
}

describe('E5: caravanas', () => {
  it('dados da caravana e dos pontos de comércio', () => {
    expect(UNITS.caravan.trader).toBe('land');
    expect(UNITS.caravan.building).toBe('market');
    expect(UNITS.caravan.age).toBe(1);
    expect(BUILDINGS.market.trains).toEqual(expect.arrayContaining(['merchant', 'caravan']));
    expect(BUILDINGS.town_center.tradeRoute).toBe('land');
    expect(BUILDINGS.market.tradeRoute).toBe('land');
    expect(CARAVAN_TARGET_AI.length).toBe(AGES.length);
    expect(MERCHANT_SHIP_TARGET_AI.length).toBe(AGES.length);
  });

  it('a rota rende ouro pela distância, em múltiplos da viagem', () => {
    const { s, p, tc, market, c } = setup(24);
    expect(applyCommand(s, { type: 'route', player: 0, ids: [c.id], targetId: market.id }).ok).toBe(true);
    expect(c.state).toBe('route'); expect(c.routeA).toBe(tc.id); expect(c.routeB).toBe(market.id); expect(c.routeLeg).toBe(0);
    const g = routeGold(s, 0, tc, market, 'land');
    expect(g).toBeGreaterThan(0);
    const before = p.resources.gold;
    run(s, 70 * TICK_RATE);
    const gain = p.resources.gold - before;
    expect(gain).toBeGreaterThanOrEqual(g);
    expect(gain % g).toBe(0);
  });

  it('recusas: rota curta, não-comerciante, inimigo e edifício sem comércio', () => {
    const near = setup(10);
    const r = applyCommand(near.s, { type: 'route', player: 0, ids: [near.c.id], targetId: near.market.id });
    expect(r.ok).toBe(false); expect(r.reason).toBe(t('err.routeShort', { n: 16 }));
    const { s, c, tc, market } = setup(24);
    const v = spawnUnit(s, 0, 'villager', tc.x, tc.ty + 5.5);
    expect(applyCommand(s, { type: 'route', player: 0, ids: [v.id], targetId: market.id }).reason).toBe(t('err.notTrader'));
    const enemyTc = buildingsOf(s, 1).find((b) => b.type === 'town_center')!;
    expect(applyCommand(s, { type: 'route', player: 0, ids: [c.id], targetId: enemyTc.id }).ok).toBe(false);
    const farm = placeBuilding(s, 0, 'farm', tc.tx, tc.ty + 8, true);
    expect(applyCommand(s, { type: 'route', player: 0, ids: [c.id], targetId: farm.id }).ok).toBe(false);
  });

  it('a rota quebra quando o destino cai, com aviso', () => {
    const { s, c, market } = setup(24);
    applyCommand(s, { type: 'route', player: 0, ids: [c.id], targetId: market.id });
    run(s, 5 * TICK_RATE);
    destroyBuilding(s, market, -1);
    run(s, 2 * TICK_RATE);
    expect(c.state).toBe('idle'); expect(c.routeA).toBe(-1);
    expect(s.events.some((e) => e.type === 'routeStopped' && e.player === 0)).toBe(true);
  });

  it('destino de aliado paga 25% a mais', () => {
    const own = setup(24);
    const baseGold = routeGold(own.s, 0, own.tc, own.market, 'land');
    const { s, tc } = setup(24, { players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal', team: 0 }] });
    const sign = tc.x < s.map.w / 2 ? 1 : -1;
    const allyMarket = placeBuilding(s, 1, 'market', tc.tx + sign * 24, tc.ty + 8, true);
    const d = Math.sqrt((tc.x - allyMarket.x) ** 2 + (tc.y - allyMarket.y) ** 2);
    expect(routeGold(s, 0, tc, allyMarket, 'land')).toBe(Math.round(0.5 * d * TRADE_ALLY_BONUS * s.players[0].mods.gather.gold));
    expect(baseGold).toBeGreaterThan(0);
  });

  it('o save guarda a rota em andamento e tem padrão para saves antigos', () => {
    const { s, c, market } = setup(24);
    applyCommand(s, { type: 'route', player: 0, ids: [c.id], targetId: market.id });
    run(s, 8 * TICK_RATE);
    const js = serialize(s);
    expect(serialize(deserialize(js))).toBe(js);
    const o = JSON.parse(js);
    const u = o.units.find((x: { id: number }) => x.id === c.id);
    delete u.routeA; delete u.routeB; delete u.routeLeg;
    const old = deserialize(JSON.stringify(o)).units.get(c.id)!;
    expect([old.routeA, old.routeB, old.routeLeg]).toEqual([-1, -1, 0]);
  });

  it('Mercador × caravana: cada um no seu papel', () => {
    const { s, c, tc, market } = setup(24);
    const x = tc.tx + 4, y = tc.ty - 3;
    addNode(s.map, 'wild_horses', x, y);
    applyCommand(s, { type: 'gather', player: 0, ids: [c.id], targetId: s.map.nodeAt[y * s.map.w + x] });
    run(s, TICK_RATE);
    expect(c.state).not.toBe('gather');
    const m = spawnUnit(s, 0, 'merchant', tc.x, tc.ty + 5.5);
    expect(applyCommand(s, { type: 'route', player: 0, ids: [m.id], targetId: market.id }).reason).toBe(t('err.notTrader'));
  });

  it('a IA treina caravanas e as põe em rota', { timeout: 60000 }, () => {
    const s = quickGame({}, true);
    for (const p of s.players) { p.age = 1; for (const r of RESOURCES) p.resources[r] = 5000; }
    const tc = buildingsOf(s, 0).find((b) => b.type === 'town_center')!;
    const sign = tc.x < s.map.w / 2 ? 1 : -1;
    arena(s, Math.min(tc.tx, tc.tx + sign * 24) - 2, tc.ty - 4, Math.max(tc.tx + 3, tc.tx + sign * 24 + 3) + 2, tc.ty + 6);
    placeBuilding(s, 0, 'market', tc.tx + sign * 24, tc.ty, true);
    run(s, 90 * TICK_RATE);
    const cs = [...s.units.values()].filter((u) => u.owner === 0 && !u.dead && u.type === 'caravan');
    expect(cs.length).toBeGreaterThanOrEqual(1);
    expect(cs.some((u) => u.state === 'route')).toBe(true);
  });
});

describe('E5: navio mercante (rota marítima, com a E4)', () => {
  function shipyardAt(s: GameState, player: number) {
    const tc = buildingsOf(s, player).find((b) => b.type === 'town_center')!;
    for (let r = 4; r <= 24; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      if (canPlaceBuilding(s, s.players[player], 'shipyard', tc.tx + dx, tc.ty + dy, true, true).ok) return placeBuilding(s, player, 'shipyard', tc.tx + dx, tc.ty + dy, true);
    }
    throw new Error('sem lugar para Estaleiro');
  }
  function waterBeside(s: GameState, y: { tx: number; ty: number; w: number; h: number }) {
    const m = s.map;
    for (let yy = y.ty - 3; yy < y.ty + y.h + 3; yy++) for (let xx = y.tx - 3; xx < y.tx + y.w + 3; xx++) {
      if (!isPassable(m, xx, yy, 'naval') || m.terrain[idx(m, xx, yy)] === TERRAIN.SHALLOWS) continue;
      if (componentSize(m, componentAt(m, xx, yy, 'naval'), 'naval') >= MIN_DOCK_WATER) return { x: xx, y: yy };
    }
    throw new Error('sem água ao lado do Estaleiro');
  }
  const team0 = [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' as const, team: 0 }, { name: 'B', god: 'poseidon', isAI: false, difficulty: 'normal' as const, team: 0 }, { name: 'C', god: 'hades', isAI: false, difficulty: 'normal' as const, team: 1 }];   // o inimigo evita a vitória imediata do time 0
  it('rota entre dois Estaleiros do time rende ouro; seaTradeIncome multiplica', () => {
    const s = quickGame({ mapType: 'mediterranean', seed: 42, players: team0 });
    s.players[0].age = 2;
    const ya = shipyardAt(s, 0), yb = shipyardAt(s, 1);
    const w = waterBeside(s, ya);
    const ship = spawnUnit(s, 0, 'merchant_ship', w.x + 0.5, w.y + 0.5);
    const r = applyCommand(s, { type: 'route', player: 0, ids: [ship.id], targetId: yb.id });
    expect(r.ok, r.reason).toBe(true);
    expect(ship.state).toBe('route');
    const g = routeGold(s, 0, ya, yb, 'sea');
    expect(g).toBeGreaterThan(0);
    s.players[0].mods.player.seaTradeIncome = 1.25;
    const g2 = routeGold(s, 0, ya, yb, 'sea');
    expect(g2).toBeGreaterThan(g); expect(g2).toBe(Math.round(0.7 * Math.sqrt((ya.x - yb.x) ** 2 + (ya.y - yb.y) ** 2) * 1.25 * 1.25 * s.players[0].mods.gather.gold));
    s.players[0].mods.player.seaTradeIncome = 1;
    const before = s.players[0].resources.gold;
    run(s, 240 * TICK_RATE);
    expect(s.players[0].resources.gold - before).toBeGreaterThanOrEqual(g);
  }, 60000);
  it('caravana não faz rota entre Estaleiros e o navio não entra em edifícios', () => {
    const s = quickGame({ mapType: 'mediterranean', seed: 42, players: team0 });
    const ya = shipyardAt(s, 0), yb = shipyardAt(s, 1);
    const c = spawnUnit(s, 0, 'caravan', ya.x, ya.y + 4);
    expect(applyCommand(s, { type: 'route', player: 0, ids: [c.id], targetId: yb.id }).ok).toBe(false);
    expect(UNITS.merchant_ship.trader).toBe('sea');
  });
});
