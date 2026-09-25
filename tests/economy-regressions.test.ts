// Regressões da caça a bugs (economia): travas de cidadãos adjacentes, ids de nós x entidades,
// atrito e população, esgotamento de nós, guarnição, carga na fazenda, limite por fazenda e reembolsos.
import { describe, it, expect } from 'vitest';
import { TICK_RATE, NODE_RESOURCE } from '../src/core/constants';
import { applyCommand, canTrain } from '../src/core/sim/commands';
import { buildingsOf, canPlaceBuilding, placeBuilding, spawnUnit, unitsOf } from '../src/core/sim/entities';
import { killUnit } from '../src/core/sim/combat';
import { nearestNode } from '../src/core/sim/queries';
import { distToRect, isPassable } from '../src/core/map/grid';
import { NODE_ID_BASE, removeNode } from '../src/core/map/mapgen';
import type { GameState } from '../src/core/types';
import { MAJOR_GODS } from '../src/core/data';
import { quickGame, run } from './helpers';

function findFree(s: GameState, player: number, type: string, cx: number, cy: number, r = 8): { x: number; y: number } {
  for (let rr = 0; rr <= r; rr++) for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
    if (Math.abs(dx) !== rr && Math.abs(dy) !== rr) continue;
    if (canPlaceBuilding(s, s.players[player], type, cx + dx, cy + dy).ok) return { x: cx + dx, y: cy + dy };
  }
  throw new Error(`sem espaço para ${type}`);
}
function clearTile(s: GameState, tx: number, ty: number) {
  if (!isPassable(s.map, tx, ty)) { const nid = s.map.nodeAt[ty * s.map.w + tx]; if (nid !== -1) removeNode(s.map, nid); }
}
function setup() {
  const s = quickGame();
  const p = s.players[0];
  const tc = buildingsOf(s, 0)[0];
  const vills = unitsOf(s, 0).filter((u) => u.type === 'villager');
  applyCommand(s, { type: 'stop', player: 0, ids: vills.map((u) => u.id) });
  vills.forEach((o, i) => { o.x = tc.x + 8 + i; o.y = tc.y + 8; });
  return { s, p, tc, vills };
}

describe('regressões de economia', () => {
  it('cidadão num tile adjacente mas fora do centro encosta e entrega a carga', () => {
    const { s, p, tc, vills } = setup();
    const v = vills[0];
    const tree = nearestNode(s, tc.x, tc.y, 'wood', 20)!;
    const tx = tc.tx - 1, ty = tc.ty - 1;   // diagonal ao Centro Cívico
    clearTile(s, tx, ty);
    v.x = tx + 0.1; v.y = ty + 0.1;
    v.carry = 'wood'; v.carryAmt = 12; v.state = 'return'; v.nodeId = tree.id; v.order = null; v.path = null;
    expect(distToRect(v.x, v.y, tc.tx, tc.ty, tc.w, tc.h)).toBeGreaterThan(1.2);
    const w0 = p.resources.wood;
    run(s, 10 * TICK_RATE);
    expect(p.resources.wood - w0).toBeGreaterThanOrEqual(12);
  });

  it('cidadão adjacente ao templo começa a rezar mesmo partindo de um tile bloqueado', () => {
    const { s, p, tc, vills } = setup();
    const v = vills[0];
    const spot = findFree(s, 0, 'temple', tc.tx + 6, tc.ty + 4, 8);
    const temple = placeBuilding(s, 0, 'temple', spot.x, spot.y, true);
    v.x = temple.tx - 0.9; v.y = temple.ty - 0.9;
    applyCommand(s, { type: 'pray', player: 0, ids: [v.id], targetId: temple.id });
    run(s, 30 * TICK_RATE);
    expect(v.state).toBe('pray');
    expect(p.resources.favor).toBeGreaterThan(0);
  });

  it('ids de nós de recurso não colidem com ids de entidades; coletar numa fazenda usa a fazenda', () => {
    const { s, tc, vills } = setup();
    for (const id of s.map.nodes.keys()) expect(id).toBeGreaterThanOrEqual(NODE_ID_BASE);
    const spot = findFree(s, 0, 'farm', tc.tx + 4, tc.ty, 6);
    const farm = placeBuilding(s, 0, 'farm', spot.x, spot.y, true);
    expect(s.map.nodes.has(farm.id)).toBe(false);
    applyCommand(s, { type: 'gather', player: 0, ids: [vills[0].id], targetId: farm.id });
    expect(vills[0].nodeId).toBe(-farm.id);
    run(s, 30 * TICK_RATE);
    expect(vills[0].nodeId).toBe(-farm.id);
    expect(vills[0].carry).toBe('food');
  });

  it('morte por atrito recalcula a população e permite treinar de novo', () => {
    const s = quickGame();
    const p = s.players[0];
    const tc = buildingsOf(s, 0)[0];
    const tcB = buildingsOf(s, 1)[0];
    const hops = [];
    while (p.pop + 2 <= p.popCap) { const h = spawnUnit(s, 0, 'hoplite', tcB.x + 10, tcB.y + 1); h.stance = 'passive'; h.hp = 1; hops.push(h); }
    expect(hops.length).toBeGreaterThan(0);
    const pop0 = p.pop;
    run(s, 2 * TICK_RATE + 1);
    const dead = hops.filter((h) => h.dead).length;
    expect(dead).toBe(hops.length);
    expect(p.pop).toBe(pop0 - 2 * dead);
    expect(s.players[1].stats.kills).toBe(dead);
    expect(canTrain(s, p, tc, 'villager').ok).toBe(true);
  });

  it('nó esgotado: todos os coletores continuam no mesmo recurso', () => {
    const s = quickGame();
    const tc = buildingsOf(s, 0)[0];
    const vills = unitsOf(s, 0).filter((u) => u.type === 'villager');
    applyCommand(s, { type: 'stop', player: 0, ids: vills.map((u) => u.id) });
    const tree = nearestNode(s, tc.x, tc.y, 'wood', 20)!;
    tree.amount = 24;   // exatamente duas cargas
    const team = vills.slice(0, 2);
    applyCommand(s, { type: 'gather', player: 0, ids: team.map((u) => u.id), targetId: tree.id });
    run(s, 90 * TICK_RATE);
    expect(s.map.nodes.has(tree.id)).toBe(false);
    for (const v of team) {
      expect(v.state).toBe('gather');
      expect(v.nodeId).toBeGreaterThan(0);
      expect(NODE_RESOURCE[s.map.nodes.get(v.nodeId)!.type]).toBe('wood');
    }
  });

  it('unidade guarnecida não pode ser atacada; se morrer, sai da lista da guarnição', () => {
    const { s, tc, vills } = setup();
    const spot = findFree(s, 0, 'tower', tc.tx + 9, tc.ty + 9, 4);
    const tower = placeBuilding(s, 0, 'tower', spot.x, spot.y, true);
    const v = vills[0];
    v.x = tower.x + 1.5; v.y = tower.y + 1.5;
    const archer = spawnUnit(s, 1, 'cretan_archer', tower.x + 4, tower.y + 1);
    archer.stance = 'passive'; archer.hp = archer.maxHp = 100000;
    applyCommand(s, { type: 'garrison', player: 0, ids: [v.id], targetId: tower.id });
    run(s, 3 * TICK_RATE);
    expect(v.inside).toBe(tower.id);
    applyCommand(s, { type: 'attack', player: 1, ids: [archer.id], targetId: v.id });
    run(s, 20 * TICK_RATE);
    expect(v.dead).toBe(false);
    expect(v.hp).toBe(v.maxHp);
    killUnit(s, v, -1);
    expect(tower.garrison).not.toContain(v.id);
    const hops = Array.from({ length: 5 }, (_, i) => spawnUnit(s, 0, 'hoplite', tower.x + 2 + i * 0.3, tower.y - 2));
    applyCommand(s, { type: 'garrison', player: 0, ids: hops.map((u) => u.id), targetId: tower.id });
    run(s, 8 * TICK_RATE);
    expect(hops.filter((h) => h.inside === tower.id).length).toBe(5);
  });

  it('cidadão com madeira na mão entrega antes de colher na fazenda', () => {
    const { s, p, tc, vills } = setup();
    const v = vills[0];
    const spot = findFree(s, 0, 'farm', tc.tx + 6, tc.ty, 6);
    const farm = placeBuilding(s, 0, 'farm', spot.x, spot.y, true);
    clearTile(s, farm.tx - 1, farm.ty);
    v.x = farm.tx - 0.3; v.y = farm.ty + 0.5;
    v.carry = 'wood'; v.carryAmt = 8;
    applyCommand(s, { type: 'gather', player: 0, ids: [v.id], targetId: farm.id });
    const w0 = p.resources.wood;
    run(s, 60 * TICK_RATE);
    expect(p.resources.wood - w0).toBe(8);
    expect(v.carry).toBe('food');
  });

  it('cada fazenda comporta um cidadão; os excedentes procuram outra fonte de comida', () => {
    const { s, tc, vills } = setup();
    const spot = findFree(s, 0, 'farm', tc.tx + 5, tc.ty, 6);
    const farm = placeBuilding(s, 0, 'farm', spot.x, spot.y, true);
    applyCommand(s, { type: 'gather', player: 0, ids: vills.slice(0, 4).map((u) => u.id), targetId: farm.id });
    run(s, 20 * TICK_RATE);
    const onFarm = vills.filter((u) => u.nodeId === -farm.id);
    expect(onFarm.length).toBe(1);
    for (const v of vills.slice(0, 4)) expect(v.state === 'gather' || v.state === 'return').toBe(true);
  });

  it('demolir devolve o que foi pago pela fila; cancelar devolve o valor pago (não o custo atual)', () => {
    const s = quickGame();
    const p = s.players[0];
    const tc = buildingsOf(s, 0)[0];
    placeBuilding(s, 0, 'temple', tc.tx + 5, tc.ty, true);
    p.resources.food = 1500; p.resources.gold = 1700; p.resources.wood = 500; p.resources.knowledge = 500;
    applyCommand(s, { type: 'train', player: 0, buildingId: tc.id, unit: 'villager' });
    applyCommand(s, { type: 'train', player: 0, buildingId: tc.id, unit: 'villager' });
    const minor = MAJOR_GODS.zeus.minorGods[0][0];
    expect(applyCommand(s, { type: 'advanceAge', player: 0, buildingId: tc.id, minorGod: minor }).ok).toBe(true);
    expect(p.resources.food).toBeLessThan(1500);
    applyCommand(s, { type: 'delete', player: 0, ids: [tc.id] });
    expect(p.resources.food).toBe(1500);
    expect(p.resources.gold).toBe(1700);
    // cancelamento: tecnologia paga antes de um desconto é devolvida pelo valor pago
    const s2 = quickGame();
    const p2 = s2.players[0];
    const tc2 = buildingsOf(s2, 0)[0];
    p2.age = 1; p2.resources.knowledge = 1000; p2.resources.gold = 1000;
    const ac = placeBuilding(s2, 0, 'academy', tc2.tx - 5, tc2.ty, true);
    const before = { ...p2.resources };
    expect(applyCommand(s2, { type: 'research', player: 0, buildingId: ac.id, tech: 'civic1' }).ok).toBe(true);
    const paid = ac.queue[0].paid!;
    expect(Object.keys(paid).length).toBeGreaterThan(0);
    p2.mods.player.researchCost = 0.5;   // simula um desconto obtido depois de enfileirar
    applyCommand(s2, { type: 'cancel', player: 0, buildingId: ac.id, index: 0 });
    expect(p2.resources.knowledge).toBe(before.knowledge);
    expect(p2.resources.gold).toBe(before.gold);
  });

  it('sem ponto de entrega o cidadão avisa e retoma a entrega quando um novo Centro Cívico fica pronto', () => {
    const s = quickGame();
    const p = s.players[0];
    const tc = buildingsOf(s, 0)[0];
    const vills = unitsOf(s, 0).filter((u) => u.type === 'villager');
    run(s, 5 * TICK_RATE);
    for (const v of vills) { v.carry = 'wood'; v.carryAmt = 12; v.state = 'return'; v.path = null; }
    applyCommand(s, { type: 'delete', player: 0, ids: [tc.id] });
    run(s, 3 * TICK_RATE);
    expect(vills.every((v) => v.state === 'idle' && v.carryAmt === 12)).toBe(true);
    expect(s.events.some((e) => e.type === 'idleVillager' && e.data === 'noDropoff')).toBe(true);
    const w0 = p.resources.wood;
    const spot = findFree(s, 0, 'town_center', tc.tx, tc.ty, 4);
    placeBuilding(s, 0, 'town_center', spot.x, spot.y, true);
    run(s, 40 * TICK_RATE);
    expect(p.resources.wood - w0).toBeGreaterThanOrEqual(12 * vills.length);
  });
});
