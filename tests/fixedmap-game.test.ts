// Partida em mapa fixo (docs/EDITOR.md §3.1): kit inicial, entidades pré-colocadas, startOrder, relíquias, KotH,
// regicídio sem kit e remoção imediata de entidades (removeBuildingNow/removeUnitNow).
import { describe, it, expect } from 'vitest';
import { createGame, tick } from '../src/core/sim/game';
import { applyCommand } from '../src/core/sim/commands';
import { validateMap } from '../src/core/map/fixed';
import { generateMap } from '../src/core/map/mapgen';
import { mapToData, mapFromData, type FixedMapData } from '../src/core/map/fixed';
import { enterGarrison, removeBuildingNow, removeUnitNow } from '../src/core/sim/entities';
import { idx, spiralSearch, isPassable } from '../src/core/map/grid';
import { TERRAIN, POP_CAP_MAX } from '../src/core/constants';
import { UNITS, BUILDINGS } from '../src/core/data';
import type { GameConfig, GameMap, GameState } from '../src/core/types';

const players: GameConfig['players'] = [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal' }];

/** Mapa base gerado (determinístico) e uma cópia "limpa" para consultar tiles livres antes da partida. */
function baseData(): { data: FixedMapData; map: GameMap } {
  const m = generateMap(64, 64, 42, 2, 'continental');
  return { data: mapToData(m, 'teste'), map: mapFromData(JSON.parse(JSON.stringify(mapToData(m)))) };
}
/** Retângulo w×h de grama sem nó, procurando em espiral a partir de (cx, cy). */
function freeRect(map: GameMap, cx: number, cy: number, w: number, h: number): { x: number; y: number } {
  const t = spiralSearch(cx, cy, 12, (x, y) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || yy < 0 || xx >= map.w || yy >= map.h) return false;
      const i = idx(map, xx, yy);
      if (map.terrain[i] !== TERRAIN.GRASS || map.nodeAt[i] !== -1) return false;
    }
    return true;
  });
  if (!t) throw new Error('sem tile livre perto de ' + cx + ',' + cy);
  return t;
}
function game(over: Partial<FixedMapData>, cfg: Partial<GameConfig> = {}): GameState {
  const { data } = baseData();
  return createGame({ seed: 5, mapSize: 'small', players, map: { ...data, ...over }, ...cfg });
}
const tcs = (s: GameState, owner: number) => [...s.buildings.values()].filter((b) => b.owner === owner && b.type === 'town_center');
const unitsOf = (s: GameState, owner: number, type?: string) => [...s.units.values()].filter((u) => u.owner === owner && (!type || u.type === type));

describe('mapa fixo: kit inicial e inícios', () => {
  it('startKit:false → nenhum CC, cidadão ou batedor; ordens iniciais não existem', () => {
    const s = game({ startKit: false });
    expect(s.buildings.size).toBe(0);
    expect(s.units.size).toBe(0);
    for (const p of s.players) { expect(p.pop).toBe(0); expect(p.popCap).toBe(p.mods.player.popCap); }
  });
  it('config.startKit:[true,false] → só o jogador 0 tem kit (e vence o startKit do arquivo)', () => {
    const s = game({ startKit: false }, { startKit: [true, false] });
    expect(tcs(s, 0).length).toBe(1); expect(unitsOf(s, 0, 'villager').length).toBe(5); expect(unitsOf(s, 0, 'kataskopos').length).toBe(1);
    expect(tcs(s, 1).length).toBe(0); expect(unitsOf(s, 1).length).toBe(0);
    // os cidadãos do jogador 0 receberam ordem de coleta
    expect(unitsOf(s, 0, 'villager').some((u) => u.state === 'gather' || u.order?.type === 'gather')).toBe(true);
  });
  it('startOrder [1,0] troca os inícios; ordem inválida cai na identidade', () => {
    const { data } = baseData();
    const a = createGame({ seed: 5, mapSize: 'small', players, map: data, startOrder: [1, 0] });
    expect(tcs(a, 0)[0].tx).toBe(data.starts[1][0] - 1); expect(tcs(a, 0)[0].ty).toBe(data.starts[1][1] - 1);
    expect(tcs(a, 1)[0].tx).toBe(data.starts[0][0] - 1);
    for (const bad of [[1, 1], [0, 5], [0], [-1, 0]]) {
      const b = createGame({ seed: 5, mapSize: 'small', players, map: data, startOrder: bad });
      expect(tcs(b, 0)[0].tx).toBe(data.starts[0][0] - 1); expect(tcs(b, 1)[0].tx).toBe(data.starts[1][0] - 1);
    }
  });
  it('sem config.map o comportamento continua o mesmo (kit por padrão, stats de construção do CC)', () => {
    const s = createGame({ seed: 5, mapSize: 'small', players });
    expect(tcs(s, 0).length).toBe(1); expect(tcs(s, 1).length).toBe(1);
    expect(s.players[0].stats.buildingsBuilt).toBe(1);
  });
});

describe('mapa fixo: entidades pré-colocadas', () => {
  it('edifício completo ocupa buildingAt e conta no popCap; portão marca gateTeam; unidade conta pop', () => {
    const { data, map } = baseData();
    const [sx, sy] = data.starts[0];
    const house = freeRect(map, sx, sy + 8, BUILDINGS.house.w, BUILDINGS.house.h);
    const gate = freeRect(map, sx + 8, sy + 8, 1, 1);
    const unit = freeRect(map, sx - 8, sy + 8, 1, 1);
    const s = createGame({ seed: 5, mapSize: 'small', players: [players[0], { ...players[1], team: 3 }], startKit: false, map: { ...data, entities: [
      { kind: 'building', type: 'house', owner: 0, x: house.x, y: house.y },
      { kind: 'building', type: 'gate', owner: 1, x: gate.x, y: gate.y, complete: true },
      { kind: 'unit', type: 'hoplite', owner: 1, x: unit.x, y: unit.y },
    ] } });
    const h = [...s.buildings.values()].find((b) => b.type === 'house')!;
    expect(h.complete).toBe(true); expect(h.owner).toBe(0);
    for (let y = h.ty; y < h.ty + h.h; y++) for (let x = h.tx; x < h.tx + h.w; x++) { expect(s.map.buildingAt[idx(s.map, x, y)]).toBe(h.id); expect(s.map.blocked[idx(s.map, x, y)]).toBe(1); }
    expect(s.players[0].popCap).toBe(Math.min(s.players[0].mods.player.popCap + (BUILDINGS.house.popCap ?? 0), POP_CAP_MAX));
    const g = [...s.buildings.values()].find((b) => b.type === 'gate')!;
    expect(g.complete).toBe(true);
    expect(s.map.gateTeam[idx(s.map, g.tx, g.ty)]).toBe(3);
    const u = unitsOf(s, 1, 'hoplite');
    expect(u.length).toBe(1);
    expect(s.players[1].pop).toBe(UNITS.hoplite.pop);
    expect(Math.floor(u[0].x)).toBe(unit.x); expect(Math.floor(u[0].y)).toBe(unit.y);
    // stats zerados e sem eventos após o setup
    for (const p of s.players) { expect(p.stats.buildingsBuilt).toBe(0); expect(p.stats.unitsTrained).toBe(0); }
    expect(s.events).toEqual([]);
  });
  it('dono inválido, tipo inexistente e edifício sobre nó são ignorados em silêncio', () => {
    const { data, map } = baseData();
    const [sx, sy] = data.starts[0];
    const free = freeRect(map, sx, sy + 8, 1, 1);
    const node = [...map.nodes.values()][0];
    const s = createGame({ seed: 5, mapSize: 'small', players, startKit: false, map: { ...data, entities: [
      { kind: 'building', type: 'tower', owner: 2, x: free.x, y: free.y },
      { kind: 'building', type: 'tower', owner: -1, x: free.x, y: free.y },
      { kind: 'building', type: 'nao_existe', owner: 0, x: free.x, y: free.y },
      { kind: 'unit', type: 'dragao', owner: 0, x: free.x, y: free.y },
      { kind: 'unit', type: 'hoplite', owner: 7, x: free.x, y: free.y },
      { kind: 'building', type: 'tower', owner: 0, x: node.x, y: node.y },
    ] } });
    expect(s.buildings.size).toBe(0);
    expect(s.units.size).toBe(0);
    expect(s.map.nodeAt[idx(s.map, node.x, node.y)]).not.toBe(-1);   // o nó continua lá (ids seguem a sequência da partida)
  });
  it('unidade num tile bloqueado nasce no tile livre mais próximo', () => {
    const { data, map } = baseData();
    const node = [...map.nodes.values()].find((n) => n.type === 'tree')!;
    const s = createGame({ seed: 5, mapSize: 'small', players, startKit: false, map: { ...data, entities: [{ kind: 'unit', type: 'villager', owner: 0, x: node.x, y: node.y }] } });
    const u = unitsOf(s, 0)[0];
    expect(u).toBeDefined();
    expect(isPassable(s.map, Math.floor(u.x), Math.floor(u.y))).toBe(true);
    expect(Math.abs(u.x - node.x) + Math.abs(u.y - node.y)).toBeLessThan(8);
  });
});

describe('mapa fixo: relíquias, KotH e regicídio', () => {
  it('relics:false → sem relíquias; padrão sorteia', () => {
    expect(game({ relics: false }).relics.length).toBe(0);
    expect(game({}).relics.length).toBeGreaterThan(0);
  });
  it('koth do arquivo é respeitado no modo Rei da Colina', () => {
    const { data, map } = baseData();
    const [sx, sy] = data.starts[0];
    const hill = freeRect(map, sx + 10, sy, 1, 1);
    const s = createGame({ seed: 5, mapSize: 'small', players, mode: 'koth', map: { ...data, koth: [hill.x, hill.y] } });
    expect(s.koth).toBeDefined();
    expect(s.koth!.x).toBe(hill.x + 0.5); expect(s.koth!.y).toBe(hill.y + 0.5);
    const c = createGame({ seed: 5, mapSize: 'small', players, mode: 'koth', map: data });
    expect(Math.abs(c.koth!.x - 32) + Math.abs(c.koth!.y - 32)).toBeLessThan(10);
  });
  it('regicídio sem kit não lança e cria o basileus de cada jogador perto do início', () => {
    const s = game({ startKit: false }, { mode: 'regicide' });
    for (const p of s.players) {
      const k = unitsOf(s, p.id, 'basileus');
      expect(k.length).toBe(1);
      const [sx, sy] = (s.config.map as FixedMapData).starts[p.id];
      expect(Math.abs(k[0].x - sx) + Math.abs(k[0].y - sy)).toBeLessThan(10);
    }
  });
});

describe('remoção imediata', () => {
  it('removeBuildingNow limpa buildingAt/blocked/gateTeam e removeUnitNow tira a unidade da guarnição', () => {
    const { data, map } = baseData();
    const [sx, sy] = data.starts[0];
    const gate = freeRect(map, sx + 8, sy + 8, 1, 1);
    const tower = freeRect(map, sx - 8, sy + 8, 1, 1);
    const s = createGame({ seed: 5, mapSize: 'small', players, startKit: false, map: { ...data, entities: [
      { kind: 'building', type: 'gate', owner: 0, x: gate.x, y: gate.y },
      { kind: 'building', type: 'tower', owner: 0, x: tower.x, y: tower.y },
      { kind: 'unit', type: 'hoplite', owner: 0, x: tower.x + 1, y: tower.y },
    ] } });
    const g = [...s.buildings.values()].find((b) => b.type === 'gate')!;
    const t = [...s.buildings.values()].find((b) => b.type === 'tower')!;
    const u = unitsOf(s, 0, 'hoplite')[0];
    const gi = idx(s.map, g.tx, g.ty);
    expect(s.map.blocked[gi]).toBe(1); expect(s.map.gateTeam[gi]).toBe(0);
    removeBuildingNow(s, g);
    expect(s.buildings.has(g.id)).toBe(false);
    expect(s.map.buildingAt[gi]).toBe(-1); expect(s.map.blocked[gi]).toBe(0); expect(s.map.gateTeam[gi]).toBe(-1);
    expect(s.events.length).toBe(0); expect(s.effects.length).toBe(0);
    // guarnição
    expect(enterGarrison(s, u, t)).toBe(true);
    expect(t.garrison).toEqual([u.id]);
    removeUnitNow(s, u);
    expect(t.garrison).toEqual([]);
    expect(s.units.has(u.id)).toBe(false);
    expect(s.players[0].pop).toBe(0);
    // torre com guarnição removida ejeta a unidade sem matá-la
    const v = unitsOf(s, 0).length;
    expect(v).toBe(0);
    const w = createGame({ seed: 5, mapSize: 'small', players, startKit: false, map: { ...data, entities: [
      { kind: 'building', type: 'tower', owner: 0, x: tower.x, y: tower.y },
      { kind: 'unit', type: 'hoplite', owner: 0, x: tower.x + 1, y: tower.y },
    ] } });
    const t2 = [...w.buildings.values()][0]; const u2 = [...w.units.values()][0];
    enterGarrison(w, u2, t2);
    removeBuildingNow(w, t2);
    expect(u2.inside).toBe(-1); expect(w.units.has(u2.id)).toBe(true); expect(w.buildings.size).toBe(0);
    expect(w.map.blocked[idx(w.map, t2.tx, t2.ty)]).toBe(0);
  });
  it('startOrder: o dono de uma entidade é o jogador que começa naquele início (owner = índice do início)', () => {
    const { data, map } = baseData();
    const s0 = map.starts[0];
    const spot = freeRect(map, s0.x + 6, s0.y, 2, 2);
    data.entities = [{ kind: 'building', type: 'tower', owner: 0, x: spot.x, y: spot.y }];
    const s = createGame({ seed: 1, mapSize: 'small', players, map: data, startOrder: [1, 0] });
    const tower = [...s.buildings.values()].find((b) => b.type === 'tower')!;
    expect(tower).toBeTruthy();
    expect(tower.owner).toBe(1);   // o jogador 1 começa em starts[0]
    const tc1 = [...s.buildings.values()].find((b) => b.type === 'town_center' && b.owner === 1)!;
    expect(Math.abs(tc1.x - s0.x) < 3 && Math.abs(tc1.y - s0.y) < 3).toBe(true);
  });
  it('obra pré-colocada não reembolsa ao cancelar; mapa de batalha sem kit sobrevive pelas unidades; rei pré-colocado não é duplicado', () => {
    const { data, map } = baseData();
    const s0 = map.starts[0], s1 = map.starts[1];
    const spot = freeRect(map, s0.x + 6, s0.y, BUILDINGS.fortress.w, BUILDINGS.fortress.h), spotU = freeRect(map, s1.x, s1.y + 4, 2, 1);
    data.startKit = false;
    data.entities = [
      { kind: 'building', type: 'fortress', owner: 0, x: spot.x, y: spot.y, complete: false },
      { kind: 'unit', type: 'hoplite', owner: 1, x: spotU.x, y: spotU.y },
      { kind: 'unit', type: 'basileus', owner: 1, x: spotU.x + 1, y: spotU.y },
    ];
    const issues = validateMap(data, { players: 2 });
    expect(issues.some((i) => i.code === 'noBase' && i.params?.player === 2)).toBe(true);
    const s = createGame({ seed: 1, mapSize: 'small', players, map: data, mode: 'regicide' });
    const fort = [...s.buildings.values()].find((b) => b.type === 'fortress')!;
    expect(fort.complete).toBe(false); expect(fort.unpaid).toBe(true);
    const before = { ...s.players[0].resources };
    applyCommand(s, { type: 'cancel', player: 0, buildingId: fort.id, index: -1 } as never);
    expect(s.players[0].resources.wood).toBe(before.wood); expect(s.players[0].resources.gold).toBe(before.gold);
    expect([...s.units.values()].filter((u) => u.owner === 1 && u.type === 'basileus').length).toBe(1);   // o rei do mapa, sem segundo
    for (let i = 0; i < 40; i++) tick(s);
    expect(s.players[1].alive).toBe(true);   // só tem exército, mas sem kit isso basta
  });
});
