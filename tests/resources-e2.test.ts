// E2 (docs/eras/E2-recursos.md): pedra, petróleo e recursos raros — coleta, regras de quem trabalha cada nó, Poço de Petróleo,
// Mercadores e raros, mercado, gerador de mapa e IA. Modelo: tests/economy-regressions.test.ts.
import { describe, it, expect } from 'vitest';
import { TICK_RATE, RESOURCES, OIL_FROM_AGE, RARE_NODES, NODE_RESOURCE, RARE_GOLD_RATE } from '../src/core/constants';
import { ERA } from '../src/core/data/ages';
import { RARES } from '../src/core/data/rares';
import { BUILDINGS } from '../src/core/data';
import { applyCommand } from '../src/core/sim/commands';
import { buildingsOf, canPlaceBuilding, placeBuilding, spawnUnit, unitsOf } from '../src/core/sim/entities';
import { economySecond } from '../src/core/sim/economy';
import { getUnitStats } from '../src/core/sim/modifiers';
import { canWorkNode } from '../src/core/sim/queries';
import { addNode } from '../src/core/map/mapgen';
import { generateMap } from '../src/core/map/mapgen';
import { isPassable } from '../src/core/map/grid';
import { serialize, deserialize } from '../src/core/serialize';
import type { GameState } from '../src/core/types';
import { quickGame, run } from './helpers';

/** Um quadrado livre (s×s, sem nó nem edifício) a ≥ minD do Centro Cívico do jogador 0. */
function openSpot(s: GameState, s2 = 5, minD = 9): { x: number; y: number } {
  const tc = buildingsOf(s, 0)[0], m = s.map;
  for (let r = minD; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x0 = Math.floor(tc.x) + dx, y0 = Math.floor(tc.y) + dy;
    let ok = true;
    for (let y = y0; y < y0 + s2 && ok; y++) for (let x = x0; x < x0 + s2; x++) {
      if (x < 1 || y < 1 || x >= m.w - 1 || y >= m.h - 1 || !isPassable(m, x, y) || m.nodeAt[y * m.w + x] !== -1 || m.buildingAt[y * m.w + x] !== -1) { ok = false; break; }
    }
    if (ok) return { x: x0, y: y0 };
  }
  throw new Error('sem espaço livre');
}
function idleAll(s: GameState, player = 0) {
  const vills = unitsOf(s, player).filter((u) => u.type === 'villager');
  applyCommand(s, { type: 'stop', player, ids: vills.map((u) => u.id) });
  return vills;
}

describe('E2 — recursos: estado e save', () => {
  it('todo jogador nasce com as 7 chaves finitas e um save sem stone/oil/rares volta com 0 e []', () => {
    const s = quickGame();
    for (const p of s.players) { for (const r of RESOURCES) expect(Number.isFinite(p.resources[r]), r).toBe(true); expect(p.rares).toEqual([]); }
    const json = JSON.parse(serialize(s));
    for (const p of json.players) { delete p.resources.stone; delete p.resources.oil; delete p.stats.gathered.stone; delete p.stats.gathered.oil; delete p.rares; }
    const back = deserialize(JSON.stringify(json));
    for (const p of back.players) { expect(p.resources.stone).toBe(0); expect(p.resources.oil).toBe(0); expect(p.stats.gathered.stone).toBe(0); expect(p.rares).toEqual([]); expect(Object.keys(p.resources)).toEqual([...RESOURCES]); }
  });
  it('todo raro tem efeito de bônus e conta como ouro; OIL_FROM_AGE é a Era Bizantina', () => {
    for (const id of RARE_NODES) { expect(RARES[id]?.effects.length, id).toBeGreaterThan(0); expect(NODE_RESOURCE[id], id).toBe('gold'); }
    expect(OIL_FROM_AGE).toBe(ERA.BYZANTINE);
  });
});

describe('E2 — pedra e petróleo', () => {
  it('cidadão colhe calcário e entrega no Centro Cívico: a pedra sobe', () => {
    const s = quickGame(); const tc = buildingsOf(s, 0)[0];
    const vills = idleAll(s);
    const spot = openSpot(s, 3, 5);
    const n = addNode(s.map, 'limestone', spot.x + 1, spot.y + 1)!;
    const v = vills[0]; v.x = spot.x + 0.5; v.y = spot.y + 0.5;
    const before = s.players[0].resources.stone;
    expect(applyCommand(s, { type: 'gather', player: 0, ids: [v.id], targetId: n.id }).ok).toBe(true);
    run(s, 90 * TICK_RATE);
    expect(s.players[0].resources.stone).toBeGreaterThan(before);
    expect(s.players[0].stats.gathered.stone).toBeGreaterThan(0);
    void tc;
  });
  it('nafta: antes da Era IV o gather é recusado (err.oilEra); da IV, com Poço de Nafta, o petróleo sobe', () => {
    const s = quickGame(); const p = s.players[0];
    const vills = idleAll(s);
    const spot = openSpot(s, 6, 6);
    const seep = addNode(s.map, 'naphtha', spot.x + 3, spot.y + 3)!;
    p.age = 2;
    const r = applyCommand(s, { type: 'gather', player: 0, ids: [vills[0].id], targetId: seep.id });
    expect(r.ok).toBe(false);
    expect(canWorkNode(p, 'villager', seep).ok).toBe(false);
    p.age = OIL_FROM_AGE;
    placeBuilding(s, 0, 'naphtha_well', spot.x, spot.y, true);
    const v = vills[0]; v.x = spot.x + 2.5; v.y = spot.y + 2.5;
    expect(applyCommand(s, { type: 'gather', player: 0, ids: [v.id], targetId: seep.id }).ok).toBe(true);
    run(s, 90 * TICK_RATE);
    expect(p.resources.oil).toBeGreaterThan(0);
  });
  it('jazida e raros: cidadão recusado; Mercador em ouro é recusado; Mercador não reza', () => {
    const s = quickGame(); const p = s.players[0];
    const vills = idleAll(s);
    const spot = openSpot(s, 6, 6);
    const field = addNode(s.map, 'oil_field', spot.x, spot.y)!;
    const rare = addNode(s.map, 'olive', spot.x + 3, spot.y)!;
    const gold = [...s.map.nodes.values()].find((n) => n.type === 'gold')!;
    const m = spawnUnit(s, 0, 'merchant', spot.x + 2, spot.y + 4);
    expect(applyCommand(s, { type: 'gather', player: 0, ids: [vills[0].id], targetId: field.id }).ok).toBe(false);
    expect(applyCommand(s, { type: 'gather', player: 0, ids: [vills[0].id], targetId: rare.id }).ok).toBe(false);
    expect(applyCommand(s, { type: 'gather', player: 0, ids: [m.id], targetId: gold.id }).ok).toBe(false);
    expect(applyCommand(s, { type: 'gather', player: 0, ids: [m.id], targetId: rare.id }).ok).toBe(true);
    const temple = placeBuilding(s, 0, 'temple', spot.x + 6 > s.map.w - 4 ? spot.x - 6 : spot.x + 6, spot.y, true);
    applyCommand(s, { type: 'pray', player: 0, ids: [m.id], targetId: temple.id });
    expect(m.state).not.toBe('pray');
  });
  it('Poço de Petróleo: só encostado numa jazida; extrai 1/s e a jazida de 3 some', () => {
    const s = quickGame(); const p = s.players[0];
    p.age = 6;
    const spot = openSpot(s, 5, 3);
    const field = addNode(s.map, 'oil_field', spot.x + 1, spot.y + 1, 3)!;
    const far = canPlaceBuilding(s, p, 'oil_well', spot.x + 3, spot.y + 3, true);
    expect(far.ok).toBe(false);
    const near = canPlaceBuilding(s, p, 'oil_well', spot.x + 2, spot.y + 1, true);
    expect(near.ok, near.reason).toBe(true);
    placeBuilding(s, 0, 'oil_well', spot.x + 2, spot.y + 1, true);
    const oil0 = p.resources.oil;
    economySecond(s); economySecond(s);
    expect(p.resources.oil - oil0).toBeCloseTo(2 * BUILDINGS.oil_well.extract!.rate * p.mods.gather.oil, 5);
    economySecond(s); economySecond(s);
    expect(s.map.nodes.has(field.id)).toBe(false);
    expect(p.resources.oil - oil0).toBeCloseTo(3, 5);
  });
  it('mercado: pedra negocia; petróleo só da Era IV', () => {
    const s = quickGame(); const p = s.players[0];
    const spot = openSpot(s, 5, 6);
    const mk = placeBuilding(s, 0, 'market', spot.x, spot.y, true);
    p.resources.stone = 500; p.resources.oil = 500;
    const g0 = p.resources.gold;
    expect(applyCommand(s, { type: 'trade', player: 0, action: 'sell', resource: 'stone' }).ok).toBe(true);
    expect(p.resources.gold).toBeGreaterThan(g0);
    expect(applyCommand(s, { type: 'trade', player: 0, action: 'sell', resource: 'oil' }).ok).toBe(false);
    p.age = OIL_FROM_AGE;
    expect(applyCommand(s, { type: 'trade', player: 0, action: 'sell', resource: 'oil' }).ok).toBe(true);
    void mk;
  });
});

describe('E2 — Mercadores e raros', () => {
  function rareSetup(type: 'wild_horses' | 'olive' = 'wild_horses') {
    const s = quickGame(); const p = s.players[0];
    const spot = openSpot(s, 5, 7);
    const node = addNode(s.map, type, spot.x + 2, spot.y + 2)!;
    const place = (i: number) => spawnUnit(s, 0, 'merchant', spot.x + 1 + i, spot.y + 3);
    return { s, p, node, spot, place };
  }
  it('Mercador num raro rende ~0,5 de ouro/s, registra o raro e baixa o custo da cavalaria; sair devolve o custo', () => {
    const { s, p, node, place } = rareSetup();
    const m = place(0);
    const cost0 = { ...getUnitStats(s, p, 'hippeus').cost };
    expect(applyCommand(s, { type: 'gather', player: 0, ids: [m.id], targetId: node.id }).ok).toBe(true);
    run(s, 5 * TICK_RATE);
    expect(p.rares).toEqual(['wild_horses']);
    const g0 = p.resources.gold;
    run(s, 10 * TICK_RATE);
    const gain = p.resources.gold - g0;
    expect(gain).toBeGreaterThan(10 * RARE_GOLD_RATE * 0.8);
    expect(gain).toBeLessThan(10 * RARE_GOLD_RATE * 1.3 + 1);
    const cost1 = getUnitStats(s, p, 'hippeus').cost;
    expect(cost1.food!).toBeLessThan(cost0.food!);
    applyCommand(s, { type: 'move', player: 0, ids: [m.id], x: m.x + 6, y: m.y + 3 });
    run(s, 3 * TICK_RATE);
    expect(p.rares).toEqual([]);
    expect(getUnitStats(s, p, 'hippeus').cost).toEqual(cost0);
  });
  it('dois Mercadores no mesmo raro rendem como um só', () => {
    const { s, p, node, place } = rareSetup('olive');
    const a = place(0), b = place(1);
    applyCommand(s, { type: 'gather', player: 0, ids: [a.id, b.id], targetId: node.id });
    run(s, 4 * TICK_RATE);
    const g0 = p.resources.gold;
    run(s, 10 * TICK_RATE);
    expect(p.resources.gold - g0).toBeLessThan(10 * RARE_GOLD_RATE * 1.3 + 1);
  });
  it('Mercador com o raro cercado não vira mineiro de ouro', () => {
    const { s, node, spot, place } = rareSetup('olive');
    const m = place(0);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = node.x + dx, y = node.y + dy;
      if (canPlaceBuilding(s, s.players[0], 'wall', x, y, true).ok) placeBuilding(s, 0, 'wall', x, y, true);
    }
    applyCommand(s, { type: 'gather', player: 0, ids: [m.id], targetId: node.id });
    run(s, 5 * TICK_RATE);
    const cur = s.map.nodes.get(m.nodeId);
    expect(!cur || cur.type !== 'gold').toBe(true);
    void spot;
  });
});

describe('E2 — gerador de mapa e IA', () => {
  it('generateMap põe calcário ao redor de cada início, é determinístico e o mesmo mapa sai duas vezes', () => {
    for (const seed of [42, 7, 12345]) {
      const a = generateMap(112, 112, seed, 2), b = generateMap(112, 112, seed, 2);
      expect([...a.nodes.values()].map((n) => `${n.type}${n.x},${n.y}`)).toEqual([...b.nodes.values()].map((n) => `${n.type}${n.x},${n.y}`));
      expect([...a.nodes.values()].filter((n) => n.type === 'limestone').length, String(seed)).toBeGreaterThanOrEqual(5);
    }
  });
  it('partida de 2 IAs, 8 min: as duas coletam pedra', () => {
    const s = quickGame({}, true);
    run(s, 8 * 60 * TICK_RATE);
    for (const p of s.players) expect(p.stats.gathered.stone, p.name).toBeGreaterThan(0);
  }, 60_000);
  it('IA sem poder ter ponto de entrega de petróleo não manda ninguém à nafta', () => {
    const s = quickGame({ startingAge: OIL_FROM_AGE, startingResources: { food: 5000, wood: 5000, stone: 5000, gold: 5000 }, forbid: { buildings: ['naphtha_well', 'refinery'] } } as never, true);
    run(s, 90 * TICK_RATE);
    for (const u of unitsOf(s, 0).concat(unitsOf(s, 1))) expect(u.carry, `${u.type}#${u.id}`).not.toBe('oil');
  }, 60_000);
});
