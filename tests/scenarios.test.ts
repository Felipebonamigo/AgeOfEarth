// Regressões de cenários: segundos inteiros nos gatilhos, invocações só em tiles ligados ao alvo,
// sacerdotes do ritual (missão 3), objetivo do Centro Cívico original (missão 2) e Horda que ignora monstros sem caminho.
import { describe, it, expect } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { buildingsOf, unitsOf, spawnUnit } from '../src/core/sim/entities';
import { raid } from '../src/core/scenario/helpers';
import { HORDE, SCENARIOS } from '../src/core/scenario/campaign';
import { componentAt, invalidateComponents } from '../src/core/map/components';
import { idx } from '../src/core/map/grid';
import { applyCommand } from '../src/core/sim/commands';
import type { GameState } from '../src/core/types';

function run(s: GameState, ticks: number) { for (let i = 0; i < ticks; i++) tick(s); }
function mission(id: string): GameState {
  const def = SCENARIOS.find((m) => m.id === id)!;
  return createGame({ ...def.config, scenario: id });
}

describe('cenários', () => {
  it('gatilhos periódicos (segundos inteiros) disparam: missão 3 recebe assédio e repõe sacerdotes', () => {
    const s = mission('m3_portal');
    // cidade do jogador invulnerável só para observar
    for (const b of buildingsOf(s, 0)) { b.hp = b.maxHp = 1e9; }
    const tc = buildingsOf(s, 0)[0];
    const near = () => unitsOf(s, 1).filter((u) => Math.abs(u.x - tc.x) < 32 && Math.abs(u.y - tc.y) < 32 && u.state === 'attackMove').length;
    run(s, 199 * TICK_RATE);
    const before = near();
    run(s, 3 * TICK_RATE);   // 'harass' dispara aos 200 s (c.seconds % 200 === 0)
    expect(near()).toBeGreaterThanOrEqual(before + 5);
  });

  it('ritual da missão 3: os sacerdotes ficam rezando no Portal e a obra avança ~0,3/s', () => {
    const s = mission('m3_portal');
    const gate = [...s.buildings.values()].find((b) => b.owner === 1 && b.type === 'titan_gate')!;
    run(s, 120 * TICK_RATE);
    const priests = unitsOf(s, 1).filter((u) => u.type === 'villager' && u.state === 'pray' && u.nodeId === -gate.id);
    expect(priests.length).toBeGreaterThanOrEqual(2);
    expect(gate.progress).toBeGreaterThan(25);
    expect(gate.progress).toBeLessThan(60);
  });

  it('missão 2: o objetivo é o Centro Cívico original, não os que a Legião fundar depois', () => {
    const s = mission('m2_cerco');
    const id = s.scenario!.vars.targetTc;
    expect(id).toBeDefined();
    const tc = s.buildings.get(id)!;
    expect(tc.type).toBe('town_center');
    expect(tc.owner).toBe(1);
    // outro CC inimigo vivo não impede a conclusão quando o original cai
    const def = SCENARIOS.find((m) => m.id === 'm2_cerco')!;
    applyCommand(s, { type: 'delete', player: 1, ids: [id] });
    expect(def.objectives.find((o) => o.id === 'counter')!.check!(s)).toBe('done');
  });

  it('raid() invoca só em tiles ligados ao alvo (nunca em ilha ou bolsão)', () => {
    const s = createGame({ seed: 4562, mapSize: 'small', players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'T', god: 'hades', isAI: true, difficulty: 'normal', team: 9 }] });
    const tc = buildingsOf(s, 0)[0];
    // região do alvo = a de um tile passável encostado ao Centro Cívico
    let target = -1;
    for (let y = tc.ty - 1; y <= tc.ty + tc.h && target < 0; y++) for (let x = tc.tx - 1; x <= tc.tx + tc.w && target < 0; x++) { const c = componentAt(s.map, x, y); if (c >= 0) target = c; }
    expect(target).toBeGreaterThanOrEqual(0);
    for (let k = 0; k < 8; k++) raid(s, 1, ['hoplite', 'hoplite', 'toxotes'], tc.x, tc.y, k, 24);
    const monsters = unitsOf(s, 1).filter((u) => u.type === 'hoplite' || u.type === 'toxotes');
    expect(monsters.length).toBe(24);
    for (const u of monsters) expect(componentAt(s.map, Math.floor(u.x), Math.floor(u.y))).toBe(target);
  });

  it('Horda: monstros sem caminho até um Centro Cívico não impedem a vitória', () => {
    const s = createGame({ ...HORDE.config, seed: 7, scenario: HORDE.id });
    const tartaro = s.players.findIndex((p) => p.team === 9);
    // simula todas as ondas disparadas e um monstro preso num pátio fechado
    for (let i = 1; i <= 20; i++) s.scenario!.fired.push(`wave${i}`);
    for (const u of unitsOf(s, tartaro)) applyCommand(s, { type: 'delete', player: tartaro, ids: [u.id] });
    const x0 = 5, y0 = 5;
    for (let x = x0; x <= x0 + 4; x++) for (let y = y0; y <= y0 + 4; y++) { const i = idx(s.map, x, y); s.map.blocked[i] = (x === x0 || x === x0 + 4 || y === y0 || y === y0 + 4) ? 1 : 0; }
    invalidateComponents(s.map);
    const m = spawnUnit(s, tartaro, 'hoplite', x0 + 2.5, y0 + 2.5);
    expect(componentAt(s.map, Math.floor(m.x), Math.floor(m.y))).toBeGreaterThanOrEqual(0);
    expect(HORDE.objectives.find((o) => o.id === 'waves')!.check!(s)).toBe('done');
    // um monstro numa região ligada ao Centro Cívico ainda conta
    const tc = buildingsOf(s, 0)[0];
    spawnUnit(s, tartaro, 'hoplite', tc.x, tc.y + tc.h + 2);
    expect(HORDE.objectives.find((o) => o.id === 'waves')!.check!(s)).toBe('pending');
  });
});
