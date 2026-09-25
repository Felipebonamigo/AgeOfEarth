// Editor de mapas (docs/EDITOR.md §5 Etapa 3), sem DOM: cada EditOp tem inversa exata (serialize idêntico após
// op + inversa, com ids e nextId preservados), regras de recusa, geometria do pincel, e a MapEditor (traços,
// desfazer/refazer, arquivo canônico, validação, tags, ferramentas por ponteiro e correções desfazíveis).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { generateMap } from '../src/core/map/mapgen';
import { blankMap, mapHash, mapToData, type FixedMapData } from '../src/core/map/fixed';
import { TERRAIN } from '../src/core/constants';
import { UNITS } from '../src/core/data';
import { idx } from '../src/core/map/grid';
import type { GameMap } from '../src/core/types';
import { applyEditOp, brushTiles, dirtyRectOf, EditError, floodRegion, lineTiles } from '../src/editor/ops';
import { MapEditor, buildingCorner } from '../src/editor/editor';
import type { EditOp } from '../src/editor/types';

const genFile = (seed = 5): FixedMapData => mapToData(generateMap(80, 80, seed, 2, 'continental'), 'gerado');
const editorOf = (file: FixedMapData) => new MapEditor(JSON.parse(JSON.stringify(file)), null, { now: () => 1000 });
const tile = (map: GameMap, x: number, y: number) => idx(map, x, y);

/** Aplica op, confere que algo mudou (quando esperado), aplica a inversa e exige serialize byte a byte igual. */
function roundTrip(ed: MapEditor, op: EditOp, expectChange = true): { inv: EditOp; mid: string } {
  const before = ed.snapshot();
  const tagsBefore = [...ed.tags];
  const inv = applyEditOp(ed.state, op, ed.tags);
  const mid = ed.snapshot();
  if (expectChange) expect(mid).not.toBe(before);
  applyEditOp(ed.state, inv, ed.tags);
  expect(ed.snapshot()).toBe(before);
  expect([...ed.tags].sort((a, b) => a[0] - b[0])).toEqual(tagsBefore.sort((a, b) => a[0] - b[0]));
  return { inv, mid };
}
/** Primeiro nó do tipo (ordem de inserção). */
function firstNode(map: GameMap, type = 'tree') { for (const n of map.nodes.values()) if (n.type === type) return n; throw new Error('sem nó'); }

describe('editor: ops com inversa exata', () => {
  it('pintar água sob nó e sob unidade remove o nó (blocked = 1), empurra a unidade e a inversa restaura tudo', () => {
    const ed = editorOf(genFile());
    const map = ed.map;
    const n = firstNode(map);
    const s = map.starts[0];
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'unit', type: 'hoplite', owner: 0, x: s.x, y: s.y } }, ed.tags);
    const u = [...ed.state.units.values()][0];
    const tiles = brushTiles(s.x, s.y, 1, 'circle', map.w, map.h).concat([tile(map, n.x, n.y)]).sort((a, b) => a - b);
    const nodeId = n.id, nodesBefore = map.nodes.size;
    const { inv, mid } = roundTrip(ed, { kind: 'paint', tiles, terrain: TERRAIN.WATER });
    // estado intermediário (reaplicando a op) — nó removido, tile bloqueado, unidade fora do tile
    applyEditOp(ed.state, { kind: 'paint', tiles, terrain: TERRAIN.WATER }, ed.tags);
    expect(ed.snapshot()).toBe(mid);
    expect(map.nodes.has(nodeId)).toBe(false);
    expect(map.nodes.size).toBe(nodesBefore - 1);
    expect(map.blocked[tile(map, n.x, n.y)]).toBe(1);
    expect(map.terrain[tile(map, n.x, n.y)]).toBe(TERRAIN.WATER);
    expect(Math.floor(u.x) === s.x && Math.floor(u.y) === s.y).toBe(false);
    expect(map.blocked[tile(map, Math.floor(u.x), Math.floor(u.y))]).toBe(0);
    expect(inv.kind).toBe('batch');
    // a inversa devolve o nó com o mesmo id e a mesma quantidade
    applyEditOp(ed.state, inv, ed.tags);
    expect(map.nodes.get(nodeId)?.amount).toBe(n.amount);
    expect(map.blocked[tile(map, n.x, n.y)]).toBe(1);   // nó de volta: bloqueado por nó, não por água
    expect(map.terrain[tile(map, n.x, n.y)]).toBe(TERRAIN.GRASS);
  });
  it('pintar sólido sob edifício é recusado (underBuilding) sem alterar o estado; pintar areia sob ele é aceito', () => {
    const ed = editorOf(genFile());
    const map = ed.map, s = map.starts[0];
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'building', type: 'tower', owner: 0, x: s.x, y: s.y } }, ed.tags);
    const before = ed.snapshot();
    let err: unknown = null;
    try { applyEditOp(ed.state, { kind: 'paint', tiles: [tile(map, s.x, s.y)], terrain: TERRAIN.MOUNTAIN }, ed.tags); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(EditError);
    expect((err as EditError).code).toBe('underBuilding');
    expect(ed.snapshot()).toBe(before);
    roundTrip(ed, { kind: 'paint', tiles: [tile(map, s.x, s.y)], terrain: TERRAIN.SAND });
  });
  it('pintar água cria água profunda no interior; pintar grama num lago converte DEEP→WATER nas bordas', () => {
    const ed = editorOf(blankMap(80, 80, 2, 1));
    const map = ed.map;
    const lake = brushTiles(40, 40, 3, 'square', map.w, map.h);
    applyEditOp(ed.state, { kind: 'paint', tiles: lake, terrain: TERRAIN.WATER }, ed.tags);
    expect(map.terrain[tile(map, 40, 40)]).toBe(TERRAIN.DEEP);
    expect(map.terrain[tile(map, 37, 40)]).toBe(TERRAIN.WATER);   // borda do lago
    expect(map.blocked[tile(map, 40, 40)]).toBe(1);
    // ilha de grama no centro: os 8 vizinhos deixam de ser profundos
    const { inv } = roundTrip(ed, { kind: 'paint', tiles: [tile(map, 40, 40)], terrain: TERRAIN.GRASS });
    applyEditOp(ed.state, { kind: 'paint', tiles: [tile(map, 40, 40)], terrain: TERRAIN.GRASS }, ed.tags);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) expect(map.terrain[tile(map, 40 + dx, 40 + dy)]).toBe(TERRAIN.WATER);
    expect(map.terrain[tile(map, 40, 38)]).toBe(TERRAIN.DEEP);   // a 2 tiles continua profundo
    expect(map.blocked[tile(map, 40, 40)]).toBe(0);
    expect(inv.kind).toBe('paint');
    if (inv.kind === 'paint') { expect(inv.tiles.length).toBe(9); expect(inv.terrains?.length).toBe(9); }
    // pintar DEEP diretamente (6 na interface) também é aceito e a derivação rebaixa a borda
    applyEditOp(ed.state, { kind: 'paint', tiles: brushTiles(20, 20, 2, 'circle', map.w, map.h), terrain: TERRAIN.DEEP }, ed.tags);
    expect(map.terrain[tile(map, 20, 20)]).toBe(TERRAIN.DEEP);
    expect(map.terrain[tile(map, 22, 20)]).toBe(TERRAIN.WATER);
  });
  it('addNode/removeNode/setNodeAmount têm inversa exata; addNode recusa sobre bloqueado, edifício e outro nó', () => {
    const ed = editorOf(genFile());
    const map = ed.map, s = map.starts[0];
    const { inv } = roundTrip(ed, { kind: 'addNode', type: 'gold', x: s.x, y: s.y, amount: 500 });
    expect(inv).toMatchObject({ kind: 'removeNode', x: s.x, y: s.y });
    const n = firstNode(map, 'tree');
    const { inv: inv2 } = roundTrip(ed, { kind: 'removeNode', x: n.x, y: n.y });
    expect(inv2).toEqual({ kind: 'addNode', type: 'tree', x: n.x, y: n.y, amount: n.amount, id: n.id });
    roundTrip(ed, { kind: 'setNodeAmount', x: n.x, y: n.y, amount: 42 });
    const water = (() => { for (let i = 0; i < map.w * map.h; i++) if (map.terrain[i] === TERRAIN.WATER) return i; return -1; })();
    expect(() => applyEditOp(ed.state, { kind: 'addNode', type: 'tree', x: water % map.w, y: Math.floor(water / map.w) }, ed.tags)).toThrow(/occupied/);
    expect(() => applyEditOp(ed.state, { kind: 'addNode', type: 'tree', x: n.x, y: n.y }, ed.tags)).toThrow(/occupied/);
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'building', type: 'tower', owner: 0, x: s.x + 2, y: s.y } }, ed.tags);
    expect(() => applyEditOp(ed.state, { kind: 'addNode', type: 'tree', x: s.x + 2, y: s.y }, ed.tags)).toThrow(/occupied/);
    // nó colocado sob uma unidade a empurra e a inversa (batch) a traz de volta
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'unit', type: 'hoplite', owner: 0, x: s.x - 1, y: s.y } }, ed.tags);
    const { inv: inv3 } = roundTrip(ed, { kind: 'addNode', type: 'berry', x: s.x - 1, y: s.y });
    expect(inv3.kind).toBe('batch');
  });
  it('setStart acrescenta/move e removeStart reinsere na mesma posição (ordem dos inícios preservada)', () => {
    const ed = editorOf(blankMap(80, 80, 2, 1));
    const map = ed.map;
    expect(map.starts.length).toBe(2);
    const { inv } = roundTrip(ed, { kind: 'setStart', index: 2, x: 40, y: 12 });
    expect(inv).toEqual({ kind: 'removeStart', index: 2 });
    const s0 = { ...map.starts[0] };
    const { inv: inv2 } = roundTrip(ed, { kind: 'setStart', index: 0, x: 20, y: 20 });
    expect(inv2).toEqual({ kind: 'setStart', index: 0, x: s0.x, y: s0.y });
    const { inv: inv3 } = roundTrip(ed, { kind: 'removeStart', index: 0 });
    expect(inv3).toEqual({ kind: 'setStart', index: 0, x: s0.x, y: s0.y, insert: true });
    expect(() => applyEditOp(ed.state, { kind: 'setStart', index: 5, x: 1, y: 1 }, ed.tags)).toThrow(/badIndex/);
    expect(() => applyEditOp(ed.state, { kind: 'removeStart', index: 2 }, ed.tags)).toThrow(/badIndex/);
    // no máximo MAX_PLAYERS inícios
    applyEditOp(ed.state, { kind: 'setStart', index: 2, x: 40, y: 12 }, ed.tags);
    applyEditOp(ed.state, { kind: 'setStart', index: 3, x: 40, y: 60 }, ed.tags);
    expect(() => applyEditOp(ed.state, { kind: 'setStart', index: 4, x: 10, y: 10 }, ed.tags)).toThrow(/badIndex/);
  });
  it('placeEntity: edifício completo, em obra e unidade; inversa restaura nextId, pop, popCap e estatísticas', () => {
    const ed = editorOf(genFile());
    const map = ed.map, s = map.starts[1];
    const nextId = ed.state.nextId;
    const { inv } = roundTrip(ed, { kind: 'placeEntity', entity: { kind: 'building', type: 'town_center', owner: 1, x: s.x - 1, y: s.y - 1 } });
    expect(inv).toEqual({ kind: 'removeEntity', id: nextId, nextId });
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'building', type: 'town_center', owner: 1, x: s.x - 1, y: s.y - 1 } }, ed.tags);
    const tc = ed.state.buildings.get(nextId)!;
    expect(tc.complete).toBe(true);
    expect(ed.state.players[1].popCap).toBe(20);
    expect(ed.state.players[1].stats.buildingsBuilt).toBe(0);   // o editor não conta como construção
    expect(map.buildingAt[tile(map, s.x, s.y)]).toBe(nextId);
    roundTrip(ed, { kind: 'placeEntity', entity: { kind: 'building', type: 'tower', owner: 1, x: s.x + 3, y: s.y, complete: false } });
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'building', type: 'tower', owner: 1, x: s.x + 3, y: s.y, complete: false } }, ed.tags);
    const tower = ed.state.buildings.get(nextId + 1)!;
    expect(tower.complete).toBe(false); expect(tower.progress).toBe(0); expect(tower.hp).toBeLessThan(tower.maxHp);
    roundTrip(ed, { kind: 'placeEntity', entity: { kind: 'unit', type: 'hoplite', owner: 1, x: s.x, y: s.y + 3 } });
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'unit', type: 'hoplite', owner: 1, x: s.x, y: s.y + 3 } }, ed.tags);
    const u = ed.state.units.get(nextId + 2)!;
    expect(u.x).toBe(s.x + 0.5); expect(u.y).toBe(s.y + 3.5);
    expect(ed.state.players[1].pop).toBe(UNITS.hoplite.pop);
  });
  it('placeEntity recusa sobre nó, sobre água e com dono inválido; aceita sem território e sem idade', () => {
    const ed = editorOf(genFile());
    const map = ed.map, s = map.starts[0];
    const n = firstNode(map, 'tree');
    const before = ed.snapshot();
    expect(() => applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'building', type: 'tower', owner: 0, x: n.x, y: n.y } }, ed.tags)).toThrow(/noRoom/);
    expect(() => applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'unit', type: 'hoplite', owner: 0, x: n.x, y: n.y } }, ed.tags)).toThrow(/noRoom/);
    expect(() => applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'unit', type: 'hoplite', owner: 9, x: s.x, y: s.y } }, ed.tags)).toThrow(/badOwner/);
    expect(() => applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'unit', type: 'nada', owner: 0, x: s.x, y: s.y } }, ed.tags)).toThrow(/badType/);
    expect(ed.snapshot()).toBe(before);
    // fortaleza (idade 2, 4x4) sem território nem idade: aceita com force
    expect(ed.state.players[0].age).toBe(0);
    expect(ed.state.territory[tile(map, s.x, s.y)]).toBe(-1);
    roundTrip(ed, { kind: 'placeEntity', entity: { kind: 'building', type: 'fortress', owner: 0, x: s.x - 2, y: s.y - 2 } });
    // titan_gate (notBuildable) também
    roundTrip(ed, { kind: 'placeEntity', entity: { kind: 'building', type: 'titan_gate', owner: 0, x: s.x - 2, y: s.y - 2 } });
  });
  it('removeEntity devolve placeEntity com os dados exatos (dono, tipo, canto/tile, completo, tag e id) e mantém a ordem dos Maps', () => {
    const ed = editorOf(genFile());
    const map = ed.map, s = map.starts[0];
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'building', type: 'tower', owner: 0, x: s.x, y: s.y, tag: 'torre' } }, ed.tags);
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'building', type: 'barracks', owner: 1, x: s.x + 2, y: s.y - 1, complete: false } }, ed.tags);
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'unit', type: 'hoplite', owner: 1, x: s.x - 2, y: s.y, tag: 'guarda' } }, ed.tags);
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'unit', type: 'toxotes', owner: 0, x: s.x - 3, y: s.y } }, ed.tags);
    const [b1, b2] = [...ed.state.buildings.values()], [u1] = [...ed.state.units.values()];
    // remover o PRIMEIRO edifício/unidade e desfazer mantém a ordem de inserção (serialize idêntico)
    const { inv } = roundTrip(ed, { kind: 'removeEntity', id: b1.id });
    expect(inv).toEqual({ kind: 'placeEntity', id: b1.id, entity: { kind: 'building', type: 'tower', owner: 0, x: s.x, y: s.y, complete: true, tag: 'torre' } });
    const { inv: inv2 } = roundTrip(ed, { kind: 'removeEntity', id: b2.id });
    expect(inv2).toEqual({ kind: 'placeEntity', id: b2.id, entity: { kind: 'building', type: 'barracks', owner: 1, x: s.x + 2, y: s.y - 1, complete: false } });
    const { inv: inv3 } = roundTrip(ed, { kind: 'removeEntity', id: u1.id });
    expect(inv3).toEqual({ kind: 'placeEntity', id: u1.id, entity: { kind: 'unit', type: 'hoplite', owner: 1, x: s.x - 2, y: s.y, tag: 'guarda' } });
    expect(ed.tags.get(u1.id)).toBe('guarda');
    expect(() => applyEditOp(ed.state, { kind: 'removeEntity', id: 9999 }, ed.tags)).toThrow(/notFound/);
  });
  it('setEntity dono/completo/tag com inversa exata (portão atualiza gateTeam; em obra zera progresso e popCap)', () => {
    const ed = editorOf(genFile());
    const map = ed.map, s = map.starts[0];
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'building', type: 'town_center', owner: 0, x: s.x - 1, y: s.y - 1 } }, ed.tags);
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'building', type: 'gate', owner: 0, x: s.x + 3, y: s.y } }, ed.tags);
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'unit', type: 'villager', owner: 0, x: s.x, y: s.y + 3 } }, ed.tags);
    const [tc, gate] = [...ed.state.buildings.values()], [u] = [...ed.state.units.values()];
    expect(map.gateTeam[tile(map, s.x + 3, s.y)]).toBe(0);
    const { inv } = roundTrip(ed, { kind: 'setEntity', id: gate.id, owner: 1 });
    expect(inv).toEqual({ kind: 'setEntity', id: gate.id, owner: 0 });
    applyEditOp(ed.state, { kind: 'setEntity', id: gate.id, owner: 1 }, ed.tags);
    expect(map.gateTeam[tile(map, s.x + 3, s.y)]).toBe(1);
    applyEditOp(ed.state, inv, ed.tags);
    // completo → em obra → completo
    expect(ed.state.players[0].popCap).toBe(20);
    const { inv: inv2 } = roundTrip(ed, { kind: 'setEntity', id: tc.id, complete: false });
    expect(inv2).toEqual({ kind: 'setEntity', id: tc.id, complete: true });
    applyEditOp(ed.state, { kind: 'setEntity', id: tc.id, complete: false }, ed.tags);
    expect(tc.complete).toBe(false); expect(tc.progress).toBe(0); expect(ed.state.players[0].popCap).toBe(0);
    applyEditOp(ed.state, inv2, ed.tags);
    expect(tc.complete).toBe(true); expect(tc.hp).toBe(tc.maxHp); expect(ed.state.players[0].popCap).toBe(20);
    // tag
    const { inv: inv3 } = roundTrip(ed, { kind: 'setEntity', id: u.id, tag: 'colono' }, false);
    expect(inv3).toEqual({ kind: 'setEntity', id: u.id, tag: null });
    applyEditOp(ed.state, { kind: 'setEntity', id: u.id, tag: 'colono' }, ed.tags);
    expect(ed.tags.get(u.id)).toBe('colono');
    const { inv: inv4 } = roundTrip(ed, { kind: 'setEntity', id: u.id, tag: null }, false);
    expect(inv4).toEqual({ kind: 'setEntity', id: u.id, tag: 'colono' });
    // dono de unidade: pop dos dois jogadores
    roundTrip(ed, { kind: 'setEntity', id: u.id, owner: 1 });
    expect(() => applyEditOp(ed.state, { kind: 'setEntity', id: u.id, owner: 7 }, ed.tags)).toThrow(/badOwner/);
  });
  it('moveEntity move unidade (mesmo id) e edifício (mesmo id, novo canto); recusa sem espaço', () => {
    const ed = editorOf(genFile());
    const map = ed.map, s = map.starts[0];
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'building', type: 'tower', owner: 0, x: s.x, y: s.y, tag: 't' } }, ed.tags);
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'building', type: 'tower', owner: 0, x: s.x + 2, y: s.y } }, ed.tags);
    applyEditOp(ed.state, { kind: 'placeEntity', entity: { kind: 'unit', type: 'hoplite', owner: 0, x: s.x - 2, y: s.y } }, ed.tags);
    const [tower] = [...ed.state.buildings.values()], [u] = [...ed.state.units.values()];
    const { inv } = roundTrip(ed, { kind: 'moveEntity', id: u.id, x: s.x - 2, y: s.y + 2 });
    expect(inv).toEqual({ kind: 'moveEntity', id: u.id, x: s.x - 2, y: s.y });
    const { inv: inv2 } = roundTrip(ed, { kind: 'moveEntity', id: tower.id, x: s.x + 1, y: s.y });
    expect(inv2).toEqual({ kind: 'moveEntity', id: tower.id, x: s.x, y: s.y });
    applyEditOp(ed.state, { kind: 'moveEntity', id: tower.id, x: s.x + 1, y: s.y }, ed.tags);
    expect(map.buildingAt[tile(map, s.x, s.y)]).toBe(-1);
    expect(map.buildingAt[tile(map, s.x + 1, s.y)]).toBe(tower.id);
    expect(ed.tags.get(tower.id)).toBe('t');
    expect([...ed.state.buildings.keys()]).toEqual([tower.id, tower.id + 1]);   // ordem do Map preservada
    const before = ed.snapshot();
    const n = firstNode(map, 'tree');
    expect(() => applyEditOp(ed.state, { kind: 'moveEntity', id: u.id, x: n.x, y: n.y }, ed.tags)).toThrow(/noRoom/);
    expect(() => applyEditOp(ed.state, { kind: 'moveEntity', id: tower.id, x: n.x, y: n.y }, ed.tags)).toThrow(/noRoom/);
    expect(ed.snapshot()).toBe(before);
  });
  it('batch aplica tudo e devolve as inversas em ordem reversa; um erro no meio desfaz o que já foi feito', () => {
    const ed = editorOf(genFile());
    const map = ed.map, s = map.starts[0];
    const ops: EditOp[] = [
      { kind: 'paint', tiles: brushTiles(s.x, s.y, 2, 'circle', map.w, map.h), terrain: TERRAIN.SAND },
      { kind: 'placeEntity', entity: { kind: 'building', type: 'tower', owner: 0, x: s.x, y: s.y } },
      { kind: 'addNode', type: 'gold', x: s.x - 2, y: s.y - 2 },
      { kind: 'setStart', index: 0, x: s.x + 1, y: s.y + 1 },
    ];
    const { inv } = roundTrip(ed, { kind: 'batch', ops });
    expect(inv.kind).toBe('batch');
    if (inv.kind === 'batch') expect(inv.ops.map((o) => o.kind)).toEqual(['setStart', 'removeNode', 'removeEntity', 'paint']);
    const before = ed.snapshot();
    expect(() => applyEditOp(ed.state, { kind: 'batch', ops: [ops[1], ops[2], { kind: 'removeEntity', id: 424242 }] }, ed.tags)).toThrow(/notFound/);
    expect(ed.snapshot()).toBe(before);
    expect(ed.state.buildings.size).toBe(0);
  });
});

describe('editor: geometria', () => {
  it('brushTiles/lineTiles/floodRegion ficam dentro do mapa, sem trigonometria', () => {
    const src = fs.readFileSync('src/editor/ops.ts', 'utf8');
    expect(src.match(/Math\.(random|sin|cos|tan|atan2?|asin|acos|pow|exp|log|hypot)\b|Date\.now|performance\.now/)).toBeNull();
    const c = brushTiles(0, 0, 2, 'circle', 80, 80);
    expect(c).toEqual([0, 1, 2, 80, 81, 160]);   // quarto de círculo r=2 no canto
    expect(brushTiles(40, 40, 1, 'circle', 80, 80).length).toBe(5);
    expect(brushTiles(40, 40, 2, 'square', 80, 80).length).toBe(25);
    expect(brushTiles(40, 40, 3, 'circle', 80, 80).length).toBe(29);
    const q = brushTiles(79, 79, 3, 'square', 80, 80);
    expect(q.length).toBe(16);
    for (const i of q) expect(i).toBeLessThan(6400);
    expect(brushTiles(5, 5, 0, 'circle', 80, 80)).toEqual([5 * 80 + 5]);
    const sorted = brushTiles(10, 10, 4, 'circle', 80, 80);
    for (let k = 1; k < sorted.length; k++) expect(sorted[k]).toBeGreaterThan(sorted[k - 1]);
    const l = lineTiles(0, 0, 5, 2);
    expect(l[0]).toEqual({ x: 0, y: 0 }); expect(l[l.length - 1]).toEqual({ x: 5, y: 2 }); expect(l.length).toBe(6);
    expect(lineTiles(3, 3, 3, 3)).toEqual([{ x: 3, y: 3 }]);
    expect(lineTiles(4, 0, 0, 4).length).toBe(5);
    const m = generateMap(64, 64, 3, 2, 'lakes');
    const g = (() => { for (let i = 0; i < 64 * 64; i++) if (m.terrain[i] === TERRAIN.WATER) return i; return -1; })();
    const region = floodRegion(m, g % 64, Math.floor(g / 64));
    expect(region.length).toBeGreaterThan(0);
    for (const i of region) { expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(64 * 64); expect([TERRAIN.WATER, TERRAIN.DEEP]).toContain(m.terrain[i]); }
    expect(region).toContain(g);
    for (let k = 1; k < region.length; k++) expect(region[k]).toBeGreaterThan(region[k - 1]);
    expect(floodRegion(m, -1, 0)).toEqual([]);
    expect(floodRegion(m, 0, 0, 10).length).toBeLessThanOrEqual(10);
    // mapa em branco: a região é o mapa inteiro, limitada a 25 600
    const b = generateMap(80, 80, 1, 2); b.terrain.fill(TERRAIN.GRASS);
    expect(floodRegion(b, 0, 0).length).toBe(6400);
  });
  it('dirtyRectOf cobre os tiles pintados ±1 e os footprints', () => {
    expect(dirtyRectOf({ kind: 'paint', tiles: [80 * 10 + 5, 80 * 12 + 7], terrain: 0 }, 80)).toEqual({ x0: 4, y0: 9, x1: 8, y1: 13 });
    expect(dirtyRectOf({ kind: 'placeEntity', entity: { kind: 'building', type: 'town_center', owner: 0, x: 10, y: 10 } }, 80)).toEqual({ x0: 10, y0: 10, x1: 12, y1: 12 });
    expect(dirtyRectOf({ kind: 'removeEntity', id: 1 }, 80)).toBeNull();
    expect(dirtyRectOf({ kind: 'batch', ops: [{ kind: 'addNode', type: 'tree', x: 3, y: 3 }, { kind: 'removeStart', index: 0 }] }, 80)).toEqual({ x0: 3, y0: 3, x1: 3, y1: 3 });
    expect(buildingCorner('town_center', 10, 10)).toEqual({ x: 9, y: 9 });
    expect(buildingCorner('tower', 10, 10)).toEqual({ x: 10, y: 10 });
    expect(buildingCorner('fortress', 10, 10)).toEqual({ x: 9, y: 9 });
  });
});

describe('editor: MapEditor', () => {
  it('abre um mapa em branco e um gerado com sessão pausada em modo editor; toFile sem edições é canônico e igual ao arquivo', () => {
    for (const file of [blankMap(80, 80, 2, 1), genFile()]) {
      const ed = editorOf(file);
      expect(ed.session.paused).toBe(true);
      expect(ed.session.ui.mode).toBe('editor');
      expect(ed.ui.tool).toBe('terrain');
      expect(ed.state.players.length).toBe(4);
      expect(ed.state.units.size).toBe(0); expect(ed.state.buildings.size).toBe(0);
      expect(ed.map.starts.length).toBe(2);
      expect(ed.dirty).toBe(false);
      expect(mapHash(ed.toFile())).toBe(mapHash(file));
      expect(ed.toFile().starts).toEqual(file.starts);
      expect(ed.validate().filter((i) => i.level === 'error')).toEqual([]);
    }
  });
  it('entidades e tags do arquivo entram na sessão em ordem; tags sobrevivem a toFile; metadados preservados', () => {
    const base = genFile();
    const [sx, sy] = base.starts[0], [tx, ty] = base.starts[1];
    const file: FixedMapData = { ...base, id: 'teste', nameEn: 'Test', author: 'A', startKit: false, startTeams: [0, 1], relics: false, koth: [40, 40], entities: [
      { kind: 'unit', type: 'hoplite', owner: 1, x: tx, y: ty, tag: 'guarda' },
      { kind: 'building', type: 'tower', owner: 0, x: sx + 3, y: sy, tag: 'torre' },
      { kind: 'building', type: 'tower', owner: 0, x: sx + 3, y: sy },   // sobreposta: ignorada
      { kind: 'unit', type: 'villager', owner: 0, x: sx, y: sy },
    ] };
    const ed = editorOf(file);
    expect(ed.state.units.size).toBe(2); expect(ed.state.buildings.size).toBe(1);
    const [u1, u2] = [...ed.state.units.values()], [b] = [...ed.state.buildings.values()];
    expect(u1.id).toBe(1); expect(b.id).toBe(2); expect(u2.id).toBe(3);   // ordem do arquivo, como createGame
    expect(ed.tags.get(u1.id)).toBe('guarda'); expect(ed.tags.get(b.id)).toBe('torre');
    expect(ed.meta).toEqual({ id: 'teste', name: 'gerado', nameEn: 'Test', author: 'A', startKit: false, startTeams: [0, 1], koth: [40, 40], relics: false });
    const out = ed.toFile();
    expect(out.entities?.find((e) => e.kind === 'unit' && e.type === 'hoplite')?.tag).toBe('guarda');
    expect(out.entities?.find((e) => e.kind === 'building')?.tag).toBe('torre');
    expect(out.entities?.length).toBe(3);
    expect(out.id).toBe('teste'); expect(out.startTeams).toEqual([0, 1]); expect(out.koth).toEqual([40, 40]); expect(out.startKit).toBe(false);
    // renomear a tag pela op e mudar metadados
    ed.apply({ kind: 'setEntity', id: b.id, tag: 'vigia' });
    ed.setMeta({ name: 'Novo', author: undefined });
    const out2 = ed.toFile();
    expect(out2.entities?.find((e) => e.kind === 'building')?.tag).toBe('vigia');
    expect(out2.name).toBe('Novo'); expect(out2.author).toBeUndefined();
    expect(ed.dirty).toBe(true);
  });
  it('apply/undo/redo: um traço é um passo, o retângulo sujo chega à vista uma vez por flush, onChange dispara', () => {
    const calls: string[] = [];
    const view = { invalidateRect: (x0: number, y0: number, x1: number, y1: number) => calls.push(`rect ${x0},${y0}-${x1},${y1}`), invalidateMinimap: () => calls.push('mini') };
    const ed = new MapEditor(blankMap(80, 80, 2, 1), view, { now: () => 0 });
    let changes = 0;
    ed.onChange = () => changes++;
    const map = ed.map;
    const h0 = mapHash(ed.toFile());
    ed.beginStroke();
    ed.apply({ kind: 'paint', tiles: brushTiles(20, 20, 2, 'circle', 80, 80), terrain: TERRAIN.WATER });
    ed.apply({ kind: 'paint', tiles: brushTiles(24, 20, 2, 'circle', 80, 80), terrain: TERRAIN.WATER });
    ed.apply({ kind: 'addNode', type: 'gold', x: 30, y: 30 });
    ed.endStroke();
    expect(changes).toBe(3);
    expect(ed.undoDepth).toBe(1); expect(ed.redoDepth).toBe(0);
    expect(ed.dirty).toBe(true);
    ed.flush();
    expect(calls).toEqual(['rect 17,17-30,30', 'mini']);   // pincéis (18..26, 18..22) ±1 ∪ nó (30,30)
    ed.flush();
    expect(calls.length).toBe(2);   // sem novas edições, nada é invalidado
    const h1 = mapHash(ed.toFile());
    expect(h1).not.toBe(h0);
    expect(ed.undo()).toBe(true);
    expect(mapHash(ed.toFile())).toBe(h0);
    expect(map.terrain[tile(map, 20, 20)]).toBe(TERRAIN.GRASS);
    expect(map.nodes.size).toBe(0);
    expect(ed.undoDepth).toBe(0); expect(ed.redoDepth).toBe(1);
    expect(ed.redo()).toBe(true);
    expect(mapHash(ed.toFile())).toBe(h1);
    expect(map.nodes.size).toBe(1);
    expect(ed.undo()).toBe(true); expect(ed.undo()).toBe(false);
    // uma edição nova limpa o refazer
    ed.apply({ kind: 'setStart', index: 0, x: 15, y: 15 });
    expect(ed.redoDepth).toBe(0);
    expect(changes).toBeGreaterThan(3);
  });
  it('toFile é canônico: duas sequências de edição que chegam ao mesmo mapa dão o mesmo mapHash e o mesmo JSON', () => {
    const file = genFile(9);
    const a = editorOf(file), b = editorOf(file);
    const s = a.map.starts[0];
    const lake = brushTiles(30, 30, 3, 'circle', 80, 80);
    // A: lago, nó, unidade, edifício; B: edifício, unidade, nó (em outra ordem), lago pintado em duas partes e um desvio desfeito
    a.apply({ kind: 'paint', tiles: lake, terrain: TERRAIN.WATER });
    a.apply({ kind: 'addNode', type: 'gold', x: s.x - 2, y: s.y - 2, amount: 300 });
    a.apply({ kind: 'placeEntity', entity: { kind: 'unit', type: 'hoplite', owner: 1, x: s.x, y: s.y + 2 } });
    a.apply({ kind: 'placeEntity', entity: { kind: 'building', type: 'tower', owner: 0, x: s.x + 2, y: s.y } });
    b.apply({ kind: 'placeEntity', entity: { kind: 'building', type: 'tower', owner: 0, x: s.x + 2, y: s.y } });
    b.apply({ kind: 'placeEntity', entity: { kind: 'unit', type: 'hoplite', owner: 1, x: s.x, y: s.y + 2 } });
    b.apply({ kind: 'addNode', type: 'gold', x: s.x - 2, y: s.y - 2, amount: 100 });
    b.apply({ kind: 'setNodeAmount', x: s.x - 2, y: s.y - 2, amount: 300 });
    b.apply({ kind: 'paint', tiles: lake.filter((i) => i % 80 <= 30), terrain: TERRAIN.WATER });
    b.apply({ kind: 'paint', tiles: lake.filter((i) => i % 80 > 30), terrain: TERRAIN.WATER });
    b.apply({ kind: 'paint', tiles: brushTiles(50, 50, 2, 'square', 80, 80), terrain: TERRAIN.MOUNTAIN });
    b.undo();
    expect(JSON.stringify(b.toFile())).toBe(JSON.stringify(a.toFile()));
    expect(mapHash(b.toFile())).toBe(mapHash(a.toFile()));
  });
  it('validate() reflete o estado após as ops (com cache até a próxima op)', () => {
    const ed = editorOf(genFile());
    const s = ed.map.starts[1];
    const codes = () => ed.validate().map((i) => i.code);
    expect(codes()).not.toContain('startBlocked');
    const first = ed.validate();
    expect(ed.validate()).toBe(first);   // cache
    ed.apply({ kind: 'addNode', type: 'gold', x: s.x, y: s.y });
    expect(ed.validate()).not.toBe(first);
    expect(codes()).toContain('startBlocked');
    ed.undo();
    expect(codes()).not.toContain('startBlocked');
    ed.apply({ kind: 'removeStart', index: 1 });
    expect(codes()).toContain('startsCount');
    ed.apply({ kind: 'placeEntity', entity: { kind: 'building', type: 'wonder_zeus', owner: 0, x: s.x - 2, y: s.y - 2 } });
    expect(codes()).toContain('wonderComplete');
    ed.setMeta({ startKit: false });
    expect(codes()).not.toContain('lowStartFood');
  });
  it('ponteiro: a ferramenta de terreno pinta uma linha contínua ao arrastar, Shift+clique traça desde lineFrom e o balde preenche', () => {
    const ed = editorOf(blankMap(80, 80, 2, 1));
    const map = ed.map;
    ed.ui.tool = 'terrain'; ed.ui.terrain = TERRAIN.WATER; ed.ui.brushRadius = 1;
    ed.pointerDown(10, 10, 0);
    ed.pointerMove(20, 14, 0);   // salto grande: a linha de Bresenham liga os dois pontos
    ed.pointerMove(30, 10, 0);
    ed.pointerUp(30, 10, 0);
    for (const t of lineTiles(10, 10, 20, 14).concat(lineTiles(20, 14, 30, 10))) expect([TERRAIN.WATER, TERRAIN.DEEP]).toContain(map.terrain[tile(map, t.x, t.y)]);
    expect(map.terrain[tile(map, 40, 40)]).toBe(TERRAIN.GRASS);
    expect(ed.undoDepth).toBe(1);   // o traço inteiro é um passo
    expect(ed.ui.lineFrom).toEqual({ x: 30, y: 10 });
    ed.pointerDown(30, 30, 0, { shift: true });   // linha de (30,10) a (30,30)
    ed.pointerUp(30, 30, 0, { shift: true });
    for (let y = 10; y <= 30; y++) expect([TERRAIN.WATER, TERRAIN.DEEP]).toContain(map.terrain[tile(map, 30, y)]);
    expect(ed.undoDepth).toBe(2);
    ed.undo();
    expect(map.terrain[tile(map, 30, 25)]).toBe(TERRAIN.GRASS);
    expect(map.terrain[tile(map, 30, 10)]).toBe(TERRAIN.WATER);
    // balde: grama → montanha na região contígua (o mapa inteiro menos a água)
    ed.ui.terrain = TERRAIN.MOUNTAIN;
    expect(ed.fill(60, 60)).toBe(true);
    expect(map.terrain[tile(map, 70, 70)]).toBe(TERRAIN.MOUNTAIN);
    expect(map.terrain[tile(map, 30, 10)]).toBe(TERRAIN.WATER);
    ed.undo();
    expect(map.terrain[tile(map, 70, 70)]).toBe(TERRAIN.GRASS);
    // tecla F preenche no hover
    ed.setHover(60, 60);
    expect(ed.key('F')).toBe(true);
    expect(map.terrain[tile(map, 70, 70)]).toBe(TERRAIN.MOUNTAIN);
    ed.undo();
  });
  it('ponteiro: recursos (pincel de árvores determinístico), edifícios, unidades, inícios, seleção/arraste e borracha por botão direito', () => {
    const errors: string[] = [];
    const ed = editorOf(blankMap(80, 80, 2, 1));
    ed.onError = (e) => errors.push(e.code);
    const map = ed.map, state = ed.state;
    // árvores
    ed.ui.tool = 'node'; ed.ui.nodeType = 'tree'; ed.ui.brushRadius = 3;
    ed.pointerDown(20, 20, 0); ed.pointerUp(20, 20, 0);
    const trees = map.nodes.size;
    expect(trees).toBeGreaterThan(8); expect(trees).toBeLessThan(29);
    ed.undo(); expect(map.nodes.size).toBe(0);
    ed.redo(); expect(map.nodes.size).toBe(trees);   // mesma pincelada, mesmo bosque
    // ouro (clique único, quantidade da interface)
    ed.ui.nodeType = 'gold'; ed.ui.nodeAmount = 777;
    ed.pointerDown(50, 50, 0); ed.pointerUp(50, 50, 0);
    expect(map.nodes.get(map.nodeAt[tile(map, 50, 50)])?.amount).toBe(777);
    // edifício com dono e "em obra"
    ed.ui.tool = 'building'; ed.ui.buildingType = 'town_center'; ed.ui.player = 1; ed.ui.complete = false;
    ed.setHover(60, 60); expect(ed.ui.ghostOk).toBe(true);
    ed.setHover(50, 50); expect(ed.ui.ghostOk).toBe(false);   // sobre o veio de ouro
    ed.pointerDown(60, 60, 0); ed.pointerUp(60, 60, 0);
    const tc = [...state.buildings.values()][0];
    expect(tc.type).toBe('town_center'); expect(tc.owner).toBe(1); expect(tc.complete).toBe(false); expect(tc.tx).toBe(59); expect(tc.ty).toBe(59);
    ed.setHover(60, 60); expect(ed.ui.ghostOk).toBe(false);   // agora ocupado
    // muralha por arraste
    ed.ui.buildingType = 'wall'; ed.ui.complete = true;
    ed.pointerDown(10, 40, 0); ed.pointerMove(15, 40, 0); ed.pointerUp(15, 40, 0);
    expect([...state.buildings.values()].filter((b) => b.type === 'wall').length).toBe(6);
    expect(ed.undoDepth).toBe(4);
    // unidade
    ed.ui.tool = 'unit'; ed.ui.unitType = 'toxotes'; ed.ui.player = 0;
    ed.pointerDown(30, 30, 0); ed.pointerUp(30, 30, 0);
    const u = [...state.units.values()][0];
    expect(u.type).toBe('toxotes'); expect(u.owner).toBe(0); expect(Math.floor(u.x)).toBe(30);
    ed.pointerDown(50, 50, 0); ed.pointerUp(50, 50, 0);   // sobre o ouro: recusado
    expect(errors).toContain('noRoom');
    expect(state.units.size).toBe(1);
    // inícios: clique acrescenta o 3º, Tab cicla, arrastar move
    ed.ui.tool = 'start'; ed.ui.selected = null;
    ed.pointerDown(40, 12, 0); ed.pointerMove(41, 12, 0); ed.pointerUp(41, 12, 0);
    expect(map.starts.length).toBe(3); expect(map.starts[2]).toEqual({ x: 41, y: 12 });
    expect(ed.ui.selected).toEqual({ kind: 'start', id: 2 });
    expect(ed.key('Tab')).toBe(true); expect(ed.ui.selected).toEqual({ kind: 'start', id: 0 });
    ed.pointerDown(12, 40, 0); ed.pointerUp(12, 40, 0);   // move o início selecionado (0)
    expect(map.starts[0]).toEqual({ x: 12, y: 40 });
    expect(map.starts.length).toBe(3);
    // seleção + arraste move a unidade; Delete apaga
    ed.ui.tool = 'select';
    ed.pointerDown(30, 30, 0); ed.pointerMove(33, 31, 0); ed.pointerUp(33, 31, 0);
    expect(ed.ui.selected).toEqual({ kind: 'unit', id: u.id });
    expect(Math.floor(u.x)).toBe(33); expect(Math.floor(u.y)).toBe(31);
    ed.pointerDown(60, 60, 0); ed.pointerMove(62, 60, 0); ed.pointerUp(62, 60, 0);
    expect(tc.dead).toBe(true);   // o objeto antigo foi substituído por um com o mesmo id
    expect(state.buildings.get(tc.id)?.tx).toBe(61);
    expect(ed.key('Delete')).toBe(true);
    expect(state.buildings.has(tc.id)).toBe(false);
    expect(ed.ui.selected).toBeNull();
    // borracha pelo botão direito com qualquer ferramenta: unidade > edifício > nó > início
    ed.ui.tool = 'terrain';
    ed.pointerDown(33, 31, 2); ed.pointerUp(33, 31, 2);
    expect(state.units.size).toBe(0);
    ed.pointerDown(50, 50, 2); ed.pointerUp(50, 50, 2);
    expect(map.nodeAt[tile(map, 50, 50)]).toBe(-1);
    ed.pointerDown(41, 12, 2); ed.pointerUp(41, 12, 2);
    expect(map.starts.length).toBe(2);
    ed.pointerDown(10, 40, 2); ed.pointerMove(15, 40, 2); ed.pointerUp(15, 40, 2);   // arrastar apaga a muralha
    expect([...state.buildings.values()].filter((b) => b.type === 'wall').length).toBe(0);
    // conta-gotas
    ed.ui.tool = 'terrain';
    ed.pointerDown(20, 20, 0, { alt: true }); ed.pointerUp(20, 20, 0, { alt: true });
    expect(ed.ui.terrain).toBe(TERRAIN.GRASS);
    ed.apply({ kind: 'placeEntity', entity: { kind: 'unit', type: 'hoplite', owner: 1, x: 70, y: 70 } });
    ed.pointerDown(70, 70, 0, { alt: true }); ed.pointerUp(70, 70, 0, { alt: true });
    expect(ed.ui.tool).toBe('unit'); expect(ed.ui.unitType).toBe('hoplite'); expect(ed.ui.player).toBe(1);
  });
  it('teclado: ferramentas, subpaleta, raio, forma, jogador ativo, overlays e desfazer/refazer', () => {
    const ed = editorOf(blankMap(80, 80, 2, 1));
    const ui = ed.ui;
    expect(ed.key('b')).toBe(true); expect(ui.tool).toBe('building');
    expect(ed.key('4')).toBe(false);   // subpaleta só com a ferramenta de terreno
    expect(ed.key('T')).toBe(true); expect(ui.tool).toBe('terrain');
    expect(ed.key('4')).toBe(true); expect(ui.terrain).toBe(TERRAIN.WATER);
    expect(ed.key('6')).toBe(true); expect(ui.terrain).toBe(TERRAIN.DEEP);
    expect(ed.key(']')).toBe(true); expect(ui.brushRadius).toBe(3);
    for (let k = 0; k < 10; k++) ed.key(']');
    expect(ui.brushRadius).toBe(8);
    for (let k = 0; k < 10; k++) ed.key('[');
    expect(ui.brushRadius).toBe(1);
    expect(ed.key('x')).toBe(true); expect(ui.brushShape).toBe('square');
    expect(ed.key('2', { shift: true })).toBe(true); expect(ui.player).toBe(1);
    expect(ed.key('$', { shift: true })).toBe(true); expect(ui.player).toBe(3);
    expect(ed.key('G')).toBe(true); expect(ui.showGrid).toBe(true);
    expect(ed.key('R')).toBe(true); expect(ui.showRegions).toBe(true);
    expect(ed.key('O')).toBe(true); expect(ui.showPassable).toBe(true);
    expect(ed.key('K')).toBe(true); expect(ui.showKit).toBe(false);
    expect(ed.key('C')).toBe(true); expect(ui.complete).toBe(false);
    expect(ed.key('P')).toBe(false);
    ed.apply({ kind: 'addNode', type: 'tree', x: 5, y: 5 });
    expect(ed.key('z', { ctrl: true })).toBe(true); expect(ed.map.nodes.size).toBe(0);
    expect(ed.key('y', { ctrl: true })).toBe(true); expect(ed.map.nodes.size).toBe(1);
    expect(ed.key('z', { ctrl: true })).toBe(true);
    expect(ed.key('Z', { ctrl: true, shift: true })).toBe(true); expect(ed.map.nodes.size).toBe(1);
    ed.goTo(5, 5);
    expect(ui.flash).toEqual({ x: 5, y: 5, until: 2500 });
  });
  it('fixConnectivity liga dois inícios em ilhas separadas (some o aviso startsDisconnected) e é desfazível; clearRadius e placeStartResources idem', () => {
    const file = blankMap(80, 80, 2, 1);
    file.starts = [[15, 40], [65, 40]];
    const ed = editorOf(file);
    const map = ed.map;
    const stripe: number[] = [];
    for (let y = 0; y < 80; y++) for (let x = 38; x <= 42; x++) stripe.push(y * 80 + x);
    ed.apply({ kind: 'paint', tiles: stripe, terrain: TERRAIN.WATER });
    expect(map.terrain[tile(map, 40, 40)]).toBe(TERRAIN.DEEP);
    const codes = () => ed.validate().map((i) => i.code);
    expect(codes()).toContain('startsDisconnected');
    const h1 = mapHash(ed.toFile());
    expect(ed.fixConnectivity()).toBe(true);
    expect(codes()).not.toContain('startsDisconnected');
    expect(ed.fixConnectivity()).toBe(false);   // nada a fazer
    expect(ed.undo()).toBe(true);
    expect(codes()).toContain('startsDisconnected');
    expect(mapHash(ed.toFile())).toBe(h1);
    ed.redo();
    expect(codes()).not.toContain('startsDisconnected');
    // recursos padrão do início 1 com semente: determinístico e desfazível
    const h2 = mapHash(ed.toFile());
    expect(ed.placeStartResources(0, 42)).toBe(true);
    const nodes = map.nodes.size;
    expect(nodes).toBeGreaterThan(20);
    const h3 = mapHash(ed.toFile());
    ed.undo(); expect(map.nodes.size).toBe(0); expect(mapHash(ed.toFile())).toBe(h2);
    ed.placeStartResources(0, 42); expect(mapHash(ed.toFile())).toBe(h3);
    // limpar raio 8 do início 0: remove os nós perto e devolve grama
    ed.apply({ kind: 'paint', tiles: brushTiles(15, 40, 3, 'circle', 80, 80), terrain: TERRAIN.SAND });
    expect(ed.clearRadius(0)).toBe(true);
    expect(map.terrain[tile(map, 15, 40)]).toBe(TERRAIN.GRASS);
    for (const n of map.nodes.values()) expect((n.x - 15) ** 2 + (n.y - 40) ** 2).toBeGreaterThan(81);
    ed.undo();
    expect(map.terrain[tile(map, 15, 40)]).toBe(TERRAIN.SAND);
    expect(map.nodes.size).toBe(nodes);
  });
  it('widenChokepoints remove nós ao redor de um gargalo de 1 tile e é desfazível; sem gargalos não faz nada', () => {
    const ed = editorOf(blankMap(80, 80, 2, 1));
    const map = ed.map;
    expect(ed.widenChokepoints()).toBe(false);
    const wall: number[] = [];
    for (let y = 0; y < 80; y++) if (y !== 40) wall.push(y * 80 + 40);
    ed.apply({ kind: 'paint', tiles: wall, terrain: TERRAIN.MOUNTAIN });
    ed.apply({ kind: 'addNode', type: 'tree', x: 41, y: 41 });
    ed.apply({ kind: 'addNode', type: 'tree', x: 10, y: 10 });
    expect(ed.validate().map((i) => i.code)).not.toContain('startsDisconnected');
    expect(ed.widenChokepoints()).toBe(true);
    expect(map.nodeAt[tile(map, 41, 41)]).toBe(-1);
    expect(map.nodeAt[tile(map, 10, 10)]).not.toBe(-1);
    ed.undo();
    expect(map.nodeAt[tile(map, 41, 41)]).not.toBe(-1);
  });
  it('snapshot após op + undo é byte a byte igual ao inicial também pela MapEditor (traços, entidades, inícios)', () => {
    const ed = editorOf(genFile(11));
    const s = ed.map.starts[0];
    const before = ed.snapshot();
    ed.beginStroke();
    ed.apply({ kind: 'paint', tiles: brushTiles(s.x + 8, s.y, 3, 'circle', 80, 80), terrain: TERRAIN.WATER });
    ed.apply({ kind: 'placeEntity', entity: { kind: 'building', type: 'town_center', owner: 0, x: s.x - 1, y: s.y - 1 } });
    ed.apply({ kind: 'placeEntity', entity: { kind: 'unit', type: 'villager', owner: 0, x: s.x, y: s.y + 2, tag: 'v' } });
    ed.apply({ kind: 'setStart', index: 2, x: 40, y: 40 });
    ed.apply({ kind: 'moveEntity', id: 1, x: s.x, y: s.y - 1 });
    ed.endStroke();
    expect(ed.snapshot()).not.toBe(before);
    ed.undo();
    expect(ed.snapshot()).toBe(before);
    expect(ed.tags.size).toBe(0);
    ed.redo(); ed.undo();
    expect(ed.snapshot()).toBe(before);
  });
});
