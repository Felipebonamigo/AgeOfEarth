// Regressões da caça a bugs (movimento, combate/IA, produção): frestas diagonais, alvos e entregas inalcançáveis,
// destino sobre obstáculo, bolsões, IA que não sela a base e usa o mercado, Portal dos Titãs único, deus menor
// inválido, bônus de maravilhas em entidades existentes, hash antes dos comandos e replay a partir de um save.
import { describe, it, expect } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { applyCommand } from '../src/core/sim/commands';
import { buildingsOf, canPlaceBuilding, placeBuilding, spawnUnit, unitsOf } from '../src/core/sim/entities';
import { aiThink } from '../src/core/sim/ai';
import { createGame, tick } from '../src/core/sim/game';
import { getUnitStats } from '../src/core/sim/modifiers';
import { canStep, idx } from '../src/core/map/grid';
import { articulationPoints, componentAt, invalidateComponents, rectReachable, wouldSeal } from '../src/core/map/components';
import { serialize } from '../src/core/serialize';
import { stateHash } from '../src/core/net/hash';
import { Session } from '../src/game/session';
import { MAJOR_GODS } from '../src/core/data';
import type { GameState } from '../src/core/types';
import { quickGame, run } from './helpers';

function block(s: GameState, x: number, y: number) { s.map.blocked[idx(s.map, x, y)] = 1; }
function clearRect(s: GameState, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = idx(s.map, x, y); s.map.blocked[i] = 0; if (s.map.nodeAt[i] !== -1) s.map.nodes.delete(s.map.nodeAt[i]); s.map.nodeAt[i] = -1; }
}
/** Deixa uma área livre e sem nós, para montar cenários determinísticos. */
function arena(s: GameState, x0: number, y0: number, x1: number, y1: number) { clearRect(s, x0, y0, x1, y1); invalidateComponents(s.map); }
function findFree(s: GameState, player: number, type: string, cx: number, cy: number, r = 8): { x: number; y: number } {
  for (let rr = 0; rr <= r; rr++) for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
    if (Math.abs(dx) !== rr && Math.abs(dy) !== rr) continue;
    if (canPlaceBuilding(s, s.players[player], type, cx + dx, cy + dy).ok) return { x: cx + dx, y: cy + dy };
  }
  throw new Error(`sem espaço para ${type}`);
}

describe('movimento', () => {
  it('canStep não atravessa a fresta diagonal entre dois tiles bloqueados', () => {
    const s = quickGame();
    arena(s, 40, 40, 50, 50);
    block(s, 45, 44); block(s, 44, 45);   // dois obstáculos em diagonal
    expect(canStep(s.map, 44.6, 44.6, 45.4, 45.4, 0)).toBe(false);   // (44,44) → (45,45) passa entre eles
    expect(canStep(s.map, 44.6, 44.6, 44.6, 44.2, 0)).toBe(true);
    expect(canStep(s.map, 44.6, 44.6, 45.5, 44.5, 0)).toBe(false);   // destino bloqueado
  });

  it('unidade não entra num bolsão acessível só pela diagonal e não fica presa', () => {
    const s = quickGame();
    arena(s, 30, 30, 50, 50);
    // bolsão de 1 tile em (40,40): vizinhos ortogonais bloqueados, diagonal (41,41) livre
    block(s, 39, 40); block(s, 41, 40); block(s, 40, 39); block(s, 40, 41); invalidateComponents(s.map);
    const u = spawnUnit(s, 0, 'hoplite', 42.5, 42.5); u.stance = 'passive';
    applyCommand(s, { type: 'move', player: 0, ids: [u.id], x: 40.5, y: 40.5 });
    run(s, 15 * TICK_RATE);
    expect(Math.floor(u.x) === 40 && Math.floor(u.y) === 40).toBe(false);
    expect(u.state).toBe('idle');   // desistiu: chegou o mais perto possível
  });

  it('destino coberto por um edifício: a unidade para no tile livre vizinho e conclui a ordem', () => {
    const s = quickGame();
    arena(s, 20, 20, 45, 45);
    const house = placeBuilding(s, 0, 'house', 30, 30, true);
    const u = spawnUnit(s, 0, 'hoplite', 24.5, 30.5); u.stance = 'passive';
    applyCommand(s, { type: 'move', player: 0, ids: [u.id], x: house.x, y: house.y });
    run(s, 20 * TICK_RATE);
    expect(u.state).toBe('idle');
    expect(Math.abs(u.x - house.x) + Math.abs(u.y - house.y)).toBeLessThan(4);
  });

  it('ordem de ataque a um alvo sem caminho é abandonada e o alvo fica evitado', () => {
    const s = quickGame();
    arena(s, 20, 20, 50, 50);
    // alvo inimigo dentro de um cercado fechado
    for (let x = 34; x <= 38; x++) { block(s, x, 34); block(s, x, 38); }
    for (let y = 34; y <= 38; y++) { block(s, 34, y); block(s, 38, y); }
    invalidateComponents(s.map);
    const victim = spawnUnit(s, 1, 'villager', 36.5, 36.5);
    const u = spawnUnit(s, 0, 'hoplite', 25.5, 36.5);
    expect(rectReachable(s.map, 25, 36, 36, 36, 1, 1, true)).toBe(false);
    applyCommand(s, { type: 'attack', player: 0, ids: [u.id], targetId: victim.id });
    run(s, 3 * TICK_RATE);
    expect(u.state).not.toBe('attack');
    expect(u.avoidIds).toContain(victim.id);
    expect(victim.dead).toBe(false);
  });

  it('cidadão em "return" ignora o ponto de entrega sem caminho e entrega em outro', () => {
    const s = quickGame();
    const p = s.players[0];
    arena(s, 20, 20, 60, 60);
    const tc = placeBuilding(s, 0, 'town_center', 50, 40, true);
    const mine = placeBuilding(s, 0, 'mine', 30, 40, true);
    // mina cercada
    for (let x = mine.tx - 2; x <= mine.tx + mine.w + 1; x++) { block(s, x, mine.ty - 2); block(s, x, mine.ty + mine.h + 1); }
    for (let y = mine.ty - 2; y <= mine.ty + mine.h + 1; y++) { block(s, mine.tx - 2, y); block(s, mine.tx + mine.w + 1, y); }
    invalidateComponents(s.map);
    const v = unitsOf(s, 0).find((u) => u.type === 'villager')!;
    v.x = mine.tx - 4.5; v.y = mine.y; v.carry = 'gold'; v.carryAmt = 12; v.state = 'return'; v.order = null; v.path = null; v.nodeId = -1;
    const g0 = p.resources.gold;
    run(s, 40 * TICK_RATE);
    expect(p.resources.gold - g0).toBeGreaterThanOrEqual(12);
    expect(v.avoidIds).toContain(mine.id);
    expect(tc.dead).toBe(false);
  });

  it('unidade voadora com destino fora do mapa para na borda e conclui a ordem', () => {
    const s = quickGame();
    const u = spawnUnit(s, 0, 'pegasus', 5.5, 5.5);
    applyCommand(s, { type: 'move', player: 0, ids: [u.id], x: -5, y: -5 });
    run(s, 10 * TICK_RATE);
    expect(u.state).toBe('idle');
    expect(u.x).toBeGreaterThanOrEqual(0.5); expect(u.y).toBeGreaterThanOrEqual(0.5);
  });
});

describe('regiões do mapa e gargalos', () => {
  it('wouldSeal detecta um edifício que fecharia um corredor de 1 tile', () => {
    const s = quickGame();
    arena(s, 10, 10, 40, 40);
    // corredor vertical de 1 tile em x=25 entre duas paredes (y 15..35), aberto nas pontas
    for (let y = 15; y <= 35; y++) { block(s, 24, y); block(s, 26, y); }
    invalidateComponents(s.map);
    expect(wouldSeal(s.map, 25, 24, 1, 1)).toBe(true);
    expect(wouldSeal(s.map, 30, 24, 2, 2)).toBe(false);
  });

  it('pontos de articulação: o tile de um corredor de 1 tile é um; mapas gerados não têm árvores em volta deles', () => {
    const s = quickGame();
    arena(s, 10, 10, 40, 40);
    // pátio fechado (20..30) cuja única entrada é o tile (25,20)
    for (let x = 20; x <= 30; x++) { if (x !== 25) block(s, x, 20); block(s, x, 30); }
    for (let y = 20; y <= 30; y++) { block(s, 20, y); block(s, 30, y); }
    invalidateComponents(s.map);
    const ap = articulationPoints(s.map);
    expect(ap[idx(s.map, 25, 20)]).toBe(1);
    expect(ap[idx(s.map, 12, 12)]).toBe(0);
    // mapa gerado: nenhum ponto de articulação com nó de recurso encostado
    const g = quickGame({ seed: 4, mapSize: 'medium' });
    const ap2 = articulationPoints(g.map);
    let bad = 0;
    for (let i = 0; i < ap2.length; i++) {
      if (!ap2[i]) continue;
      const x = i % g.map.w, y = (i - x) / g.map.w;
      let touching = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < g.map.w && yy < g.map.h && g.map.nodeAt[idx(g.map, xx, yy)] !== -1) touching = true; }
      if (touching) bad++;
    }
    expect(bad).toBeLessThan(30);   // restam quase só gargalos de terreno (montanha/água); sem alargamento seriam ~100
  });

  it('componentAt identifica regiões separadas e rectReachable respeita-as', () => {
    const s = quickGame();
    arena(s, 10, 10, 40, 40);
    // pátio totalmente fechado (20..30)
    for (let x = 20; x <= 30; x++) { block(s, x, 20); block(s, x, 30); }
    for (let y = 20; y <= 30; y++) { block(s, 20, y); block(s, 30, y); }
    invalidateComponents(s.map);
    expect(componentAt(s.map, 25, 25)).not.toBe(componentAt(s.map, 15, 15));
    expect(rectReachable(s.map, 15, 15, 25, 25, 1, 1, true)).toBe(false);
    expect(rectReachable(s.map, 15, 15, 35, 15, 1, 1, true)).toBe(true);
  });
});

describe('IA', () => {
  function aiGame() {
    const s = createGame({ seed: 12345, mapSize: 'small', players: [{ name: 'IA', god: 'zeus', isAI: true, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal' }] });
    return s;
  }
  it('vende o excedente de comida no mercado para juntar o ouro da próxima Idade', () => {
    const s = aiGame();
    const p = s.players[0];
    const tc = buildingsOf(s, 0)[0];
    p.age = 2;
    placeBuilding(s, 0, 'temple', tc.tx + 5, tc.ty, true);
    const spot = findFree(s, 0, 'market', tc.tx + 5, tc.ty + 5, 8);
    placeBuilding(s, 0, 'market', spot.x, spot.y, true);
    p.resources.food = 6000; p.resources.wood = 6000; p.resources.gold = 50;
    p.ai!.nextThink = 0;
    aiThink(s, p);
    expect(p.resources.gold).toBeGreaterThan(200);
    expect(p.resources.food + p.resources.wood).toBeLessThan(12000);
  });

  it('não constrói onde selaria a passagem local', () => {
    const s = aiGame();
    const p = s.players[0];
    arena(s, 10, 10, 40, 40);
    for (let y = 15; y <= 35; y++) { block(s, 24, y); block(s, 26, y); }
    invalidateComponents(s.map);
    for (let y = 16; y <= 34; y++) expect(canPlaceBuilding(s, p, 'house', 25, y, true, true).ok).toBe(true);
    // findBuildSpot é interno; testamos a regra pública wouldSeal usada por ele
    expect(wouldSeal(s.map, 25, 24, 1, 1)).toBe(true);
  });

  it('cidadão inimigo apenas coletando perto da fronteira não mobiliza o exército', () => {
    const s = aiGame();
    const p = s.players[0];
    const tc = buildingsOf(s, 0)[0];
    const house = placeBuilding(s, 0, 'house', tc.tx + 8, tc.ty + 8, true);
    const army = Array.from({ length: 6 }, (_, i) => spawnUnit(s, 0, 'hoplite', tc.x - 3 + i * 0.5, tc.y - 5));
    const villager = spawnUnit(s, 1, 'villager', house.x + 8, house.y);
    villager.state = 'gather';
    p.ai!.nextThink = 0; p.ai!.defending = -1000;
    aiThink(s, p);
    expect(p.ai!.defending).toBe(-1000);
    expect(army.every((u) => u.state !== 'attackMove')).toBe(true);
  });
});

describe('produção, poderes e estado', () => {
  it('o Portal dos Titãs não pode ser reconstruído depois que o Titã surgiu', () => {
    const s = quickGame();
    const p = s.players[0];
    p.age = 4; p.titanSpawned = true;
    const tc = buildingsOf(s, 0)[0];
    const r = canPlaceBuilding(s, p, 'titan_gate', tc.tx + 6, tc.ty + 6);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('uma vez');
  });

  it('avançar para a Idade dos Titãs ignora um deus menor enviado; deus inválido não é concedido', () => {
    const s = quickGame();
    const p = s.players[0];
    const tc = buildingsOf(s, 0)[0];
    p.age = 3; p.minorGods = ['athena', 'apollo', 'hera']; p.techs = ['science1', 'commerce1', 'military1', 'civic1', 'science2', 'commerce2'];
    placeBuilding(s, 0, 'fortress', tc.tx + 6, tc.ty, true);
    p.resources.food = 9999; p.resources.gold = 9999; p.resources.knowledge = 9999; p.resources.favor = 9999;
    const r = applyCommand(s, { type: 'advanceAge', player: 0, buildingId: tc.id, minorGod: 'artemis' });
    expect(r.ok).toBe(true);
    expect(tc.queue[0].id).toBe('age:');
    tc.queue[0].elapsed = tc.queue[0].total - 0.01;
    run(s, 2);
    expect(p.age).toBe(4);
    expect(p.minorGods).toEqual(['athena', 'apollo', 'hera']);
  });

  it('bônus de vida da maravilha vale para unidades existentes e some quando ela cai', () => {
    const s = quickGame();
    const p = s.players[0];
    const tc = buildingsOf(s, 0)[0];
    p.age = 3;
    const mino = spawnUnit(s, 0, 'minotaur', tc.x + 6, tc.y + 6);
    const hp0 = mino.maxHp;
    const w = placeBuilding(s, 0, 'wonder_artemis', tc.tx + 8, tc.ty + 8, true);
    expect(mino.maxHp).toBe(getUnitStats(s, p, 'minotaur').hp);
    expect(mino.maxHp).toBeGreaterThan(hp0);
    applyCommand(s, { type: 'delete', player: 0, ids: [w.id] });
    expect(mino.maxHp).toBe(hp0);
  });

  it('raio não atinge unidade guarnecida; pestilência sem alvo não cria efeito visual', () => {
    const s = quickGame();
    const p = s.players[1];
    p.powers = [{ id: 'bolt', used: false }, { id: 'pestilence', used: false }];
    const tc = buildingsOf(s, 0)[0];
    const v = unitsOf(s, 0).find((u) => u.type === 'villager')!;
    applyCommand(s, { type: 'garrison', player: 0, ids: [v.id], targetId: tc.id });
    run(s, 8 * TICK_RATE);
    expect(v.inside).toBe(tc.id);
    expect(applyCommand(s, { type: 'power', player: 1, power: 'bolt', targetId: v.id }).ok).toBe(false);
    expect(v.dead).toBe(false);
    const n0 = s.effects.filter((e) => e.type === 'pestilence').length;
    expect(applyCommand(s, { type: 'power', player: 1, power: 'pestilence', x: 5, y: 5 }).ok).toBe(false);
    expect(s.effects.filter((e) => e.type === 'pestilence').length).toBe(n0);
  });

  it('poder usado no primeiro tick após carregar enxerga as unidades (hash antes dos comandos)', () => {
    const s = quickGame();
    const p = s.players[0];
    p.powers = [{ id: 'restoration', used: false }];
    const h = spawnUnit(s, 0, 'hoplite', buildingsOf(s, 0)[0].x + 4, buildingsOf(s, 0)[0].y + 4); h.hp = 10;
    const loaded = Session.load(serialize(s));
    const hl = loaded.state.units.get(h.id)!;
    tick(loaded.state, [{ type: 'power', player: 0, power: 'restoration', x: hl.x, y: hl.y }]);
    expect(hl.hp).toBe(hl.maxHp);
  });

  it('replay gravado após carregar um save parte do save (mesmo estado ao final)', () => {
    const s = quickGame();
    run(s, 5 * TICK_RATE);
    s.players[0].resources.food = 1000;
    const json = serialize(s);
    const sess = Session.load(json);
    expect(sess.eventCursor).toBe(sess.state.events.length);
    const tc = buildingsOf(sess.state, 0)[0];
    sess.issue({ type: 'train', player: 0, buildingId: tc.id, unit: 'villager' });
    for (let i = 0; i < 3 * TICK_RATE; i++) sess.scheduler.step(sess.state);
    const rep = Session.replay(sess.replayJSON()!);
    expect(rep.state.tick).toBe(5 * TICK_RATE);
    for (let i = 0; i < 3 * TICK_RATE; i++) rep.scheduler.step(rep.state);
    expect(buildingsOf(rep.state, 0)[0].queue.length).toBe(buildingsOf(sess.state, 0)[0].queue.length);
    expect(rep.state.players[0].pop).toBe(sess.state.players[0].pop);
    expect(stateHash(rep.state)).toBe(stateHash(sess.state));
  });

  it('deus maior tem opções de deus menor por idade (dados coerentes com a validação do avanço)', () => {
    for (const g of Object.keys(MAJOR_GODS)) expect(MAJOR_GODS[g].minorGods.length).toBeGreaterThanOrEqual(3);
  });
});

describe('IA aliada', () => {
  it('IAs do mesmo time atacam o mesmo alvo quando uma delas lança uma onda', () => {
    const s = createGame({ seed: 77, mapSize: 'medium', players: [
      { name: 'A', god: 'zeus', isAI: true, difficulty: 'normal', team: 1 },
      { name: 'B', god: 'poseidon', isAI: true, difficulty: 'normal', team: 1 },
      { name: 'C', god: 'hades', isAI: false, difficulty: 'normal', team: 2 },
    ] });
    // exércitos prontos para as duas IAs e cidade inimiga como alvo
    for (const pid of [0, 1]) { const tc = buildingsOf(s, pid)[0]; for (let i = 0; i < 12; i++) spawnUnit(s, pid, 'hoplite', tc.x + 4 + (i % 4), tc.y + 4 + Math.floor(i / 4)); s.players[pid].ai!.lastAttack = -100000; }
    let joint = false;
    for (let i = 0; i < 90 * TICK_RATE && !joint; i++) {
      tick(s);
      const a = s.players[0].ai!.attackTarget, b = s.players[1].ai!.attackTarget;
      if (a !== -1 && a === b) joint = true;
    }
    expect(joint).toBe(true);
  });
});
