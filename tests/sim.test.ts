import { describe, it, expect } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { applyCommand, canAdvanceAge, canTrain } from '../src/core/sim/commands';
import { canPlaceBuilding, placeBuilding, spawnUnit, unitsOf, buildingsOf } from '../src/core/sim/entities';
import { computeDamage } from '../src/core/sim/combat';
import { territoryOwnerAt } from '../src/core/sim/territory';
import { serialize, deserialize } from '../src/core/serialize';
import { nearestNode } from '../src/core/sim/queries';
import { tick } from '../src/core/sim/game';
import { quickGame, run } from './helpers';

describe('economia', () => {
  it('cidadãos coletam e entregam comida e madeira', () => {
    const s = quickGame();
    const p = s.players[0];
    const f0 = p.resources.food, w0 = p.resources.wood;
    run(s, 60 * TICK_RATE);
    expect(p.resources.food).toBeGreaterThan(f0 + 20);
    expect(p.resources.wood).toBeGreaterThan(w0 + 10);
    expect(p.stats.gathered.food).toBeGreaterThan(0);
  });
  it('rezar no templo gera favor; filósofos geram conhecimento', () => {
    const s = quickGame();
    const p = s.players[0];
    const tc = buildingsOf(s, 0)[0];
    const temple = placeBuilding(s, 0, 'temple', tc.tx + 5, tc.ty, true);
    const v = unitsOf(s, 0).filter((u) => u.type === 'villager');
    applyCommand(s, { type: 'pray', player: 0, ids: v.map((u) => u.id), targetId: temple.id });
    p.age = 1;
    const ac = placeBuilding(s, 0, 'academy', tc.tx - 5, tc.ty, true);
    ac.scholars = 3;
    run(s, 40 * TICK_RATE);
    expect(p.resources.favor).toBeGreaterThan(5);
    expect(p.resources.knowledge).toBeGreaterThan(30);
  });
  it('mercado: vender e comprar altera ouro e preços', () => {
    const s = quickGame();
    const p = s.players[0]; p.age = 1;
    const tc = buildingsOf(s, 0)[0];
    placeBuilding(s, 0, 'market', tc.tx + 5, tc.ty + 1, true);
    p.resources.wood = 500;
    const g0 = p.resources.gold, price0 = p.prices.wood;
    expect(applyCommand(s, { type: 'trade', player: 0, action: 'sell', resource: 'wood' }).ok).toBe(true);
    expect(p.resources.wood).toBe(400);
    expect(p.resources.gold).toBeGreaterThan(g0);
    expect(p.prices.wood).toBeLessThan(price0);
  });
});

describe('território e construção', () => {
  it('centro cívico projeta fronteira; não se constrói fora dela', () => {
    const s = quickGame();
    const tc = buildingsOf(s, 0)[0];
    expect(territoryOwnerAt(s, tc.x + 3, tc.y + 3)).toBe(0);
    expect(territoryOwnerAt(s, tc.x + 30, tc.y + 30)).not.toBe(0);
    const okInside = canPlaceBuilding(s, s.players[0], 'house', tc.tx + 5, tc.ty + 5);
    const outside = canPlaceBuilding(s, s.players[0], 'house', tc.tx + 25, tc.ty + 25);
    expect(okInside.ok || okInside.reason === 'Espaço ocupado.' || okInside.reason === 'Terreno inadequado.').toBe(true);
    expect(outside.ok).toBe(false);
  });
  it('construir cobra recursos e cidadãos concluem a obra', () => {
    const s = quickGame();
    const p = s.players[0];
    const tc = buildingsOf(s, 0)[0];
    const v = unitsOf(s, 0).filter((u) => u.type === 'villager');
    let placed = false;
    for (let dy = -6; dy <= 6 && !placed; dy++) for (let dx = -6; dx <= 6 && !placed; dx++) {
      if (canPlaceBuilding(s, p, 'house', tc.tx + dx, tc.ty + dy).ok) {
        const w0 = p.resources.wood;
        const r = applyCommand(s, { type: 'build', player: 0, ids: v.map((u) => u.id), building: 'house', tx: tc.tx + dx, ty: tc.ty + dy });
        expect(r.ok).toBe(true);
        expect(p.resources.wood).toBe(w0 - 40);
        placed = true;
      }
    }
    expect(placed).toBe(true);
    run(s, 40 * TICK_RATE);
    const house = buildingsOf(s, 0).find((b) => b.type === 'house')!;
    expect(house.complete).toBe(true);
    expect(p.popCap).toBe(30);
  });
});

describe('produção, tecnologias e idades', () => {
  it('treinar exige recursos e população; fila produz a unidade', () => {
    const s = quickGame();
    const p = s.players[0]; const tc = buildingsOf(s, 0)[0];
    p.resources.food = 0;
    expect(canTrain(s, p, tc, 'villager').ok).toBe(false);
    p.resources.food = 500;
    const n0 = unitsOf(s, 0).length;
    expect(applyCommand(s, { type: 'train', player: 0, buildingId: tc.id, unit: 'villager' }).ok).toBe(true);
    run(s, 14 * TICK_RATE);
    expect(unitsOf(s, 0).length).toBe(n0 + 1);
  });
  it('avanço de idade exige templo e recursos, e concede deus menor e poder', () => {
    const s = quickGame();
    const p = s.players[0]; const tc = buildingsOf(s, 0)[0];
    expect(canAdvanceAge(s, p, tc).ok).toBe(false);
    placeBuilding(s, 0, 'temple', tc.tx + 5, tc.ty, true);
    p.resources.food = 1000; p.resources.gold = 1000;
    const c = canAdvanceAge(s, p, tc);
    expect(c.ok).toBe(true);
    expect(c.minorOptions).toEqual(['athena', 'hermes']);
    expect(applyCommand(s, { type: 'advanceAge', player: 0, buildingId: tc.id, minorGod: 'athena' }).ok).toBe(true);
    run(s, 62 * TICK_RATE);
    expect(p.age).toBe(1);
    expect(p.minorGods).toEqual(['athena']);
    expect(p.powers.map((x) => x.id)).toContain('restoration');
  });
  it('pesquisa aplica modificadores às unidades existentes', () => {
    const s = quickGame();
    const p = s.players[0]; const tc = buildingsOf(s, 0)[0];
    const b = placeBuilding(s, 0, 'barracks', tc.tx + 5, tc.ty, true);
    p.age = 1; p.resources.food = 1000; p.resources.gold = 1000;
    const h = spawnUnit(s, 0, 'hoplite', tc.x, tc.y + 3);
    const hp0 = h.maxHp;
    expect(applyCommand(s, { type: 'research', player: 0, buildingId: b.id, tech: 'phalanx' }).ok).toBe(true);
    run(s, 42 * TICK_RATE);
    expect(p.techs).toContain('phalanx');
    expect(h.maxHp).toBeGreaterThan(hp0);
  });
});

describe('combate', () => {
  it('bônus de infantaria contra cavalaria e de herói contra míticos', () => {
    const s = quickGame();
    const hop = spawnUnit(s, 0, 'hoplite', 10, 10);
    const cav = spawnUnit(s, 1, 'hippeus', 12, 10);
    const arc = spawnUnit(s, 1, 'toxotes', 12, 12);
    expect(computeDamage(s, hop, cav)).toBeGreaterThan(computeDamage(s, hop, arc));
    const hero = spawnUnit(s, 0, 'jason', 14, 10);
    const myth = spawnUnit(s, 1, 'minotaur', 16, 10);
    const hopVsMyth = computeDamage(s, hop, myth), heroVsMyth = computeDamage(s, hero, myth);
    expect(heroVsMyth).toBeGreaterThan(hopVsMyth * 2);
  });
  it('unidades atacam e matam; estatísticas registram abates', () => {
    const s = quickGame();
    const tc = buildingsOf(s, 0)[0];
    for (let i = 0; i < 4; i++) spawnUnit(s, 0, 'hoplite', tc.x - 3 + i, tc.y + 3);
    const target = spawnUnit(s, 1, 'villager', tc.x + 1, tc.y + 5);
    applyCommand(s, { type: 'attack', player: 0, ids: unitsOf(s, 0).filter((u) => u.type === 'hoplite').map((u) => u.id), targetId: target.id });
    run(s, 15 * TICK_RATE);
    expect(s.units.has(target.id)).toBe(false);
    expect(s.players[0].stats.kills).toBe(1);
  });
  it('atrito fere tropas em território inimigo', () => {
    const s = quickGame();
    const tcB = buildingsOf(s, 1)[0];
    const u = spawnUnit(s, 0, 'hoplite', tcB.x + 4, tcB.y + 4);
    u.stance = 'passive';
    const hp0 = u.hp;
    run(s, 5 * TICK_RATE);
    expect(u.hp).toBeLessThan(hp0);
  });
});

describe('salvar e carregar', () => {
  it('a partida continua idêntica após serializar e desserializar', () => {
    const a = quickGame({}, true);
    run(a, 600);
    const json = serialize(a);
    const b = deserialize(json);
    run(a, 300); run(b, 300);
    expect(serialize(b)).toBe(serialize(a));
  });
});

describe('consultas', () => {
  it('nó mais próximo por recurso', () => {
    const s = quickGame();
    const tc = buildingsOf(s, 0)[0];
    const n = nearestNode(s, tc.x, tc.y, 'wood', 20);
    expect(n).not.toBeNull();
    expect(n!.type).toBe('tree');
  });
  it('vitória por conquista quando um jogador perde tudo', () => {
    const s = quickGame();
    for (const b of buildingsOf(s, 1)) b.hp = 1;
    for (const u of unitsOf(s, 1)) u.hp = 1;
    for (let i = 0; i < 10; i++) spawnUnit(s, 0, 'hetairoi', buildingsOf(s, 1)[0].x + 3 + i * 0.5, buildingsOf(s, 1)[0].y + 4);
    applyCommand(s, { type: 'attackMove', player: 0, ids: unitsOf(s, 0).filter((u) => u.type === 'hetairoi').map((u) => u.id), x: buildingsOf(s, 1)[0].x, y: buildingsOf(s, 1)[0].y });
    for (let i = 0; i < 120 * TICK_RATE && !s.gameOver; i++) tick(s);
    expect(s.gameOver).toBe(true);
    expect(s.winner).toBe(0);
  });
});
