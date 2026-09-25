import { describe, it, expect } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { applyCommand } from '../src/core/sim/commands';
import { placeBuilding, spawnUnit, unitsOf, buildingsOf, canPlaceBuilding } from '../src/core/sim/entities';
import { destroyBuilding } from '../src/core/sim/combat';
import { findPath } from '../src/core/map/pathfinding';
import { getRuntime } from '../src/core/sim/runtime';
import { serialize, deserialize } from '../src/core/serialize';
import { tick, createGame } from '../src/core/sim/game';
import { quickGame, run } from './helpers';
import { removeNode } from '../src/core/map/mapgen';

describe('guarnição', () => {
  it('cidadãos entram no centro cívico, somem do hash espacial, curam e saem retomando a coleta', () => {
    const s = quickGame();
    const tc = buildingsOf(s, 0)[0];
    const vills = unitsOf(s, 0).filter((u) => u.type === 'villager');
    const v = vills[0];
    v.hp = 20;
    const nodeBefore = v.nodeId;
    expect(nodeBefore).toBeGreaterThan(0);
    expect(applyCommand(s, { type: 'garrison', player: 0, ids: vills.map((u) => u.id), targetId: tc.id }).ok).toBe(true);
    run(s, 12 * TICK_RATE);
    expect(tc.garrison.length).toBe(vills.length);
    expect(v.inside).toBe(tc.id);
    expect(v.state).toBe('garrison');
    // fora do hash espacial (não pode ser alvo)
    expect(getRuntime(s).hash.query(tc.x, tc.y, 5).some((u) => u.id === v.id)).toBe(false);
    run(s, 10 * TICK_RATE);
    expect(v.hp).toBeGreaterThan(20);
    // libera: retoma a coleta no mesmo nó
    expect(applyCommand(s, { type: 'ungarrison', player: 0, buildingId: tc.id }).ok).toBe(true);
    run(s, 1);
    expect(tc.garrison.length).toBe(0);
    expect(v.inside).toBe(-1);
    expect(v.state).toBe('gather');
    expect(v.nodeId).toBe(nodeBefore);
  });
  it('respeita a capacidade e rejeita cavalaria; edifício destruído ejeta as unidades', () => {
    const s = quickGame();
    const tc = buildingsOf(s, 0)[0];
    const tower = placeBuilding(s, 0, 'tower', tc.tx + 5, tc.ty, true);
    const hops = Array.from({ length: 7 }, (_, i) => spawnUnit(s, 0, 'hoplite', tower.x + 2 + i * 0.3, tower.y + 2));
    const cav = spawnUnit(s, 0, 'hippeus', tower.x + 2, tower.y - 2);
    applyCommand(s, { type: 'garrison', player: 0, ids: [...hops.map((u) => u.id), cav.id], targetId: tower.id });
    run(s, 8 * TICK_RATE);
    expect(tower.garrison.length).toBe(5);
    expect(cav.inside).toBe(-1);
    destroyBuilding(s, tower, -1);
    expect(hops.filter((u) => u.inside === -1).length).toBe(7);
    expect(hops.every((u) => !u.dead)).toBe(true);
  });
  it('sobrevive a salvar e carregar', () => {
    const s = quickGame();
    const tc = buildingsOf(s, 0)[0];
    const vills = unitsOf(s, 0).filter((u) => u.type === 'villager');
    applyCommand(s, { type: 'garrison', player: 0, ids: vills.map((u) => u.id), targetId: tc.id });
    run(s, 12 * TICK_RATE);
    const b = deserialize(serialize(s));
    run(s, 40); run(b, 40);
    expect(serialize(b)).toBe(serialize(s));
    expect([...b.buildings.values()][0].garrison.length).toBe(vills.length);
  });
});

describe('portões', () => {
  it('bloqueiam inimigos e deixam o dono passar', () => {
    const s = quickGame();
    const map = s.map;
    // corredor: paredes em x=20..40 exceto uma abertura em y=30, que recebe um portão do jogador 0
    for (let y = 20; y <= 40; y++) if (y !== 30) { map.blocked[y * map.w + 30] = 1; }
    const p0 = s.players[0];
    p0.age = 0;
    const gate = placeBuilding(s, 0, 'gate', 30, 30, true);
    expect(map.gateTeam[30 * map.w + 30]).toBe(p0.team);
    const own = findPath(map, 25, 30, { tx: 35, ty: 30, w: 1, h: 1 }, false, 6000, p0.team);
    const enemy = findPath(map, 25, 30, { tx: 35, ty: 30, w: 1, h: 1 }, false, 6000, s.players[1].team);
    expect(own).not.toBeNull();
    expect(own!.length).toBeGreaterThan(0);
    const ownEnd = [Math.floor(own![own!.length - 2]), Math.floor(own![own!.length - 1])];
    expect(ownEnd).toEqual([35, 30]);
    // o inimigo não consegue chegar (caminho parcial fica do lado esquerdo) ou dá a volta pelas bordas
    if (enemy && enemy.length) {
      const passesGate = (() => { for (let i = 0; i < enemy.length; i += 2) if (Math.floor(enemy[i]) === 30 && Math.floor(enemy[i + 1]) === 30) return true; return false; })();
      expect(passesGate).toBe(false);
    }
    destroyBuilding(s, gate, -1);
    expect(map.gateTeam[30 * map.w + 30]).toBe(-1);
  });
  it('portão pode ser colocado pelo menu de construção', () => {
    const s = quickGame();
    const tc = buildingsOf(s, 0)[0];
    let ok = false;
    for (let dx = -6; dx <= 6 && !ok; dx++) if (canPlaceBuilding(s, s.players[0], 'gate', tc.tx + dx, tc.ty + 5).ok) ok = true;
    expect(ok).toBe(true);
  });
});

describe('formações', () => {
  it('grupos grandes recebem destinos distintos, com corpo a corpo à frente e cerco atrás', () => {
    const s = quickGame();
    const tc = buildingsOf(s, 0)[0];
    const units = [
      ...Array.from({ length: 4 }, (_, i) => spawnUnit(s, 0, 'hoplite', tc.x - 4 + i, tc.y + 4)),
      ...Array.from({ length: 3 }, (_, i) => spawnUnit(s, 0, 'toxotes', tc.x - 4 + i, tc.y + 5)),
      spawnUnit(s, 0, 'petrobolos', tc.x, tc.y + 6),
    ];
    const tx = tc.x, ty = tc.y + 7;
    // garante área livre ao redor do destino (o teste é sobre a geometria da formação)
    for (let y = Math.floor(ty) - 3; y <= Math.floor(ty) + 3; y++) for (let x = Math.floor(tx) - 4; x <= Math.floor(tx) + 4; x++) {
      const i = y * s.map.w + x; const nid = s.map.nodeAt[i]; if (nid !== -1) removeNode(s.map, nid); s.map.terrain[i] = 0; s.map.blocked[i] = s.map.buildingAt[i] !== -1 ? 1 : 0;
    }
    applyCommand(s, { type: 'move', player: 0, ids: units.map((u) => u.id), x: tx, y: ty });
    const dests = units.map((u) => [u.tx, u.ty]);
    const uniq = new Set(dests.map((d) => `${d[0].toFixed(2)},${d[1].toFixed(2)}`));
    expect(uniq.size).toBe(units.length);
    // projeção dos destinos na direção de deslocamento (centro do grupo → alvo): fileiras da frente têm projeção maior
    const cx = units.reduce((a, u) => a + u.x, 0) / units.length, cy = units.reduce((a, u) => a + u.y, 0) / units.length;
    const len = Math.hypot(tx - cx, ty - cy), dx = (tx - cx) / len, dy = (ty - cy) / len;
    const proj = (u: { tx: number; ty: number }) => u.tx * dx + u.ty * dy;
    const meanOf = (t: string) => { const list = units.filter((u) => u.type === t); return list.reduce((a, u) => a + proj(u), 0) / list.length; };
    expect(meanOf('hoplite')).toBeGreaterThan(meanOf('toxotes') + 0.5);
    expect(proj(units.find((u) => u.type === 'petrobolos')!)).toBeLessThan(meanOf('hoplite') - 0.5);
  });
});

describe('dificuldade', () => {
  it('Muito difícil existe e dá mais coleta à IA', () => {
    const s = createGame({ seed: 5, mapSize: 'small', players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: true, difficulty: 'brutal' }] });
    expect(s.players[1].mods.gather.food).toBeGreaterThan(1.5);
    run(s, 10);
    expect(s.tick).toBe(10);
    void tick;
  });
});
