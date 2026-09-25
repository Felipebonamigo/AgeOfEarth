// Cenário declarativo em JSON (docs/EDITOR.md §2.3): semântica de cada operador, paridade da missão 1 (JSON × TS),
// validação, determinismo com scenarioData, tx() por idioma e cache de compilação.
import { describe, it, expect, afterEach } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { buildingsOf, placeBuilding, spawnUnit, unitsOf } from '../src/core/sim/entities';
import { serialize } from '../src/core/serialize';
import { SCENARIOS } from '../src/core/scenario/campaign';
import { validateScenario, RESERVED_SCENARIO_IDS, SCENARIO_LIMITS, type Action, type Condition, type ScenarioFile } from '../src/core/scenario/schema';
import { clearScenarioCache, compileScenario, compileScenarioCached, gameConfigFor } from '../src/core/scenario/compile';
import { getScenarioFor } from '../src/core/scenario/runner';
import { tx } from '../src/core/scenario/text';
import { nearCount, placeExact, placeNear, tagIds } from '../src/core/scenario/helpers';
import { setLocale } from '../src/i18n';
import { componentAt, invalidateComponents } from '../src/core/map/components';
import { idx } from '../src/core/map/grid';
import m1Json from '../src/core/scenario/missions/m1_despertar.scenario.json';
import type { GameState } from '../src/core/types';
import type { TriggerCtx } from '../src/core/scenario/types';

const M1 = m1Json as unknown as ScenarioFile;

/** Cenário mínimo de 2 jogadores humanos (sem IA) num mapa pequeno. */
function mk(over: Partial<ScenarioFile> = {}): ScenarioFile {
  return {
    format: 'aoe-scenario', version: 1, id: 'teste', title: { pt: 'Teste', en: 'Test' }, intro: ['olá'],
    map: { gen: { mapSize: 'small', seed: 12345 } },
    config: { players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal' }] },
    objectives: [], triggers: [], victory: { time: { gte: 99999 } },
    ...over,
  };
}
function game(file: ScenarioFile): GameState { return createGame(gameConfigFor(file)); }
function run(s: GameState, ticks: number) { for (let i = 0; i < ticks; i++) tick(s); }
function ctxAt(seconds: number, fired: string[] = []): TriggerCtx { return { seconds, fired: (id) => fired.includes(id), say: () => {}, objective: () => {}, reveal: () => {} }; }
/** Compila e avalia uma condição/ação isolada sobre o estado. */
function cond(s: GameState, c: Condition, seconds = 0, fired: string[] = []): boolean {
  return compileScenario(mk({ triggers: [{ id: 'x', when: c, then: [] }] })).triggers[0].when(s, ctxAt(seconds, fired));
}
function act(s: GameState, actions: Action[], ctx: TriggerCtx = ctxAt(0)): void {
  compileScenario(mk({ triggers: [{ id: 'x', when: { time: { gte: 0 } }, then: actions }] })).triggers[0].then(s, ctx);
}
function tc(s: GameState, owner: number) { return [...s.buildings.values()].find((b) => b.owner === owner && b.type === 'town_center')!; }

afterEach(() => { setLocale('pt'); clearScenarioCache(); });

describe('cenário JSON: operadores', () => {
  it('time e every usam segundos inteiros do runner', () => {
    const s = game(mk());
    expect(cond(s, { time: { gte: 240 } }, 239)).toBe(false);
    expect(cond(s, { time: { gte: 240 } }, 240)).toBe(true);
    expect(cond(s, { time: { gt: 10, lt: 20 } }, 15)).toBe(true);
    expect(cond(s, { time: { eq: 7 } }, 7)).toBe(true);
    expect(cond(s, { every: { seconds: 40, after: 1 } }, 0)).toBe(false);
    expect(cond(s, { every: { seconds: 40, after: 1 } }, 40)).toBe(true);
    expect(cond(s, { every: { seconds: 40, after: 1 } }, 41)).toBe(false);
    expect(cond(s, { every: { seconds: 200, after: 180 } }, 200)).toBe(true);
    expect(cond(s, { every: { seconds: 1 } }, 0)).toBe(true);
    // rodando de verdade: um gatilho every 3s repetido dispara 4 vezes em 12 s (3, 6, 9, 12)
    const s2 = game(mk({ triggers: [{ id: 'tick3', repeat: true, when: { every: { seconds: 3, after: 1 } }, then: [{ do: 'addVar', name: 'n', delta: 1 }] }] }));
    run(s2, 12 * TICK_RATE);
    expect(s2.scenario!.vars.n).toBe(4);
  });

  it('fired e firedCount contam gatilhos disparados por prefixo', () => {
    const s = game(mk());
    s.scenario!.fired.push('wave1', 'wave2', 'wave3', 'start');
    expect(cond(s, { firedCount: { prefix: 'wave' }, gte: 3 })).toBe(true);
    expect(cond(s, { firedCount: { prefix: 'wave' }, gte: 4 })).toBe(false);
    expect(cond(s, { firedCount: { prefix: 'start' }, eq: 1 })).toBe(true);
    expect(cond(s, { fired: 'start' }, 0, ['start'])).toBe(true);
    expect(cond(s, { not: { fired: 'start' } }, 0, [])).toBe(true);
  });

  it('units.near conta por dx²+dy² < r² (sem trigonometria) e filtra tipo/estado/tag', () => {
    const s = game(mk());
    const t = tc(s, 0);
    for (const u of unitsOf(s, 0)) u.dead = true; run(s, 1);
    const a = spawnUnit(s, 0, 'hoplite', t.x + 3, t.y);        // d = 3
    spawnUnit(s, 0, 'hoplite', t.x + 4, t.y + 3);              // d = 5 (exatamente no raio: fora, < r²)
    spawnUnit(s, 0, 'toxotes', t.x + 1, t.y + 1);              // d ≈ 1,41
    expect(cond(s, { units: { player: 0, near: { point: { tc: 0 }, radius: 5 } }, eq: 2 })).toBe(true);
    expect(cond(s, { units: { player: 0, near: { point: { tc: 0 }, radius: 5.01 } }, eq: 3 })).toBe(true);
    expect(cond(s, { units: { player: 0, type: 'hoplite', near: { point: { tc: 0 }, radius: 5 } }, eq: 1 })).toBe(true);
    expect(cond(s, { units: { player: 0, type: ['hoplite', 'toxotes'] }, eq: 3 })).toBe(true);
    expect(cond(s, { units: { player: 0, military: true }, eq: 3 })).toBe(true);
    expect(cond(s, { units: { player: 0, state: 'idle' }, eq: 3 })).toBe(true);
    s.scenario!.vars['#h'] = a.id;
    expect(cond(s, { units: { player: 0, tag: 'h' }, eq: 1 })).toBe(true);
    expect(cond(s, { units: { player: 0, excludeTag: 'h' }, eq: 2 })).toBe(true);
    expect(cond(s, { units: { player: 0, near: { point: { at: [a.x, a.y] }, radius: 0.5 } }, eq: 1 })).toBe(true);
  });

  it('units.reachable ignora unidades sem caminho até os edifícios (rectReachable)', () => {
    const s = game(mk());
    // pátio fechado com um hoplita inimigo dentro
    const x0 = 5, y0 = 5;
    for (let x = x0; x <= x0 + 4; x++) for (let y = y0; y <= y0 + 4; y++) { const i = idx(s.map, x, y); s.map.blocked[i] = (x === x0 || x === x0 + 4 || y === y0 || y === y0 + 4) ? 1 : 0; }
    invalidateComponents(s.map);
    const trapped = spawnUnit(s, 1, 'hoplite', x0 + 2.5, y0 + 2.5);
    expect(componentAt(s.map, Math.floor(trapped.x), Math.floor(trapped.y))).toBeGreaterThanOrEqual(0);
    const f = { player: 1, type: 'hoplite', reachable: { buildingsOf: { type: 'town_center', notTeam: 1 } } };
    expect(cond(s, { units: f, eq: 0 })).toBe(true);
    const t = tc(s, 0);
    spawnUnit(s, 1, 'hoplite', t.x, t.y + t.h + 2);
    expect(cond(s, { units: f, eq: 1 })).toBe(true);
    expect(cond(s, { units: { player: 1, type: 'hoplite' }, eq: 2 })).toBe(true);
  });

  it('value: stat, var, add e comparações; buildings por dono/time/tipo/conclusão', () => {
    const s = game(mk());
    const p = s.players[0]; p.resources.food = 400; p.age = 1;
    expect(cond(s, { value: { stat: 'food', player: 0 }, gte: 400, lte: 400 })).toBe(true);
    expect(cond(s, { value: { add: [{ stat: 'food', player: 0 }, -100] }, eq: 300 })).toBe(true);
    expect(cond(s, { value: { stat: 'age', player: 'local' }, gte: 1 })).toBe(true);
    expect(cond(s, { value: { stat: 'alive', player: { team: 1 } }, eq: 1 })).toBe(true);
    expect(cond(s, { value: { stat: 'pop', player: 0 }, gte: { add: [{ stat: 'popCap', player: 0 }, -3] } })).toBe(cond(s, { value: { stat: 'pop', player: 0 }, gte: p.popCap - 3 }));
    s.scenario!.vars.k = 7;
    expect(cond(s, { var: 'k', eq: 7 })).toBe(true);
    expect(cond(s, { value: { var: 'k' }, gt: 6 })).toBe(true);
    expect(cond(s, { value: { var: 'nao_existe' }, eq: 0 })).toBe(true);
    expect(cond(s, { buildings: { player: 0, type: 'town_center' }, eq: 1 })).toBe(true);
    expect(cond(s, { buildings: { notTeam: 0 }, eq: 1 })).toBe(true);
    expect(cond(s, { buildings: { team: 1, complete: false }, eq: 0 })).toBe(true);
    expect(cond(s, { any: [{ buildings: { player: 1 }, eq: 0 }, { all: [{ buildings: { player: 1 }, eq: 1 }] }] })).toBe(true);
  });

  it('entity{tag} das entidades do mapa e storeEntity/{var}: exists, complete e progress', () => {
    const s = game(mk());
    expect(cond(s, { entity: { tc: 1 }, exists: true, complete: true })).toBe(true);
    expect(cond(s, { entity: { tag: 'nada' }, exists: false })).toBe(true);
    act(s, [{ do: 'storeEntity', var: 'alvo', entity: { tc: 1 } }]);
    const t1 = tc(s, 1);
    expect(s.scenario!.vars.alvo).toBe(t1.id);
    expect(cond(s, { entity: { var: 'alvo' }, exists: true, progress: { gte: 1 } })).toBe(true);
    t1.dead = true; run(s, 1);
    expect(cond(s, { entity: { var: 'alvo' }, exists: false })).toBe(true);
    act(s, [{ do: 'storeEntity', var: 'alvo', entity: { tc: 1 } }]);
    expect(s.scenario!.vars.alvo).toBe(-1);
    // pick: first = menor id; nearest desempata por id
    for (const u of unitsOf(s, 0)) u.dead = true; run(s, 1);
    const t0 = tc(s, 0);
    const a = spawnUnit(s, 0, 'hoplite', t0.x + 6, t0.y), b = spawnUnit(s, 0, 'hoplite', t0.x + 2, t0.y);
    act(s, [{ do: 'storeEntity', var: 'f', entity: { player: 0, type: 'hoplite' } }, { do: 'storeEntity', var: 'n', entity: { player: 0, type: 'hoplite', pick: 'nearest', near: { tc: 0 } } }]);
    expect(s.scenario!.vars.f).toBe(a.id);
    expect(s.scenario!.vars.n).toBe(b.id);
  });

  it('place com tag + advanceBuild concluem a obra via onBuildingComplete (evento do Portal)', () => {
    const s = game(mk({ setup: [{ do: 'place', player: 1, building: 'titan_gate', at: { tc: 1, dy: -8 }, complete: false, tag: 'gate' }] }));
    const gate = s.buildings.get(s.scenario!.vars['#gate'])!;
    expect(gate.type).toBe('titan_gate'); expect(gate.complete).toBe(false); expect(gate.unpaid).toBe(true);
    expect(cond(s, { entity: { tag: 'gate' }, exists: true, complete: false, progress: { lt: 1 } })).toBe(true);
    act(s, [{ do: 'advanceBuild', entity: { tag: 'gate' }, seconds: 100 }]);
    expect(gate.progress).toBeCloseTo(100); expect(gate.complete).toBe(false);
    const before = s.events.filter((e) => e.type === 'titan').length;
    act(s, [{ do: 'advanceBuild', entity: { tag: 'gate' }, seconds: 100 }]);
    expect(gate.complete).toBe(true); expect(gate.hp).toBe(gate.maxHp);
    expect(s.events.filter((e) => e.type === 'titan').length).toBe(before + 1);
    act(s, [{ do: 'advanceBuild', entity: { tag: 'gate' }, seconds: 100 }]);   // concluído: não muda
    expect(gate.progress).toBe(180);
    // spawn com state pray + prayAt: sacerdotes rezam no Portal (sem Centro Cívico: createGame manda cidadãos de quem tem CC coletar)
    const s2 = game(mk({ setup: [
      { do: 'removeAll', player: 1 },
      { do: 'place', player: 1, building: 'titan_gate', at: { start: 1, dy: -8 }, complete: false, tag: 'gate' },
      { do: 'spawn', player: 1, units: ['villager', 'villager'], at: { entity: { tag: 'gate' }, dy: 3 }, tag: 'priests', state: 'pray', prayAt: { tag: 'gate' } },
    ] }));
    const g2 = s2.buildings.get(s2.scenario!.vars['#gate'])!;
    const priests = [s2.scenario!.vars['#priests[0]'], s2.scenario!.vars['#priests[1]']].map((id) => s2.units.get(id)!);
    expect(s2.scenario!.vars['#priests']).toBe(priests[0].id);
    for (const u of priests) { expect(u.state).toBe('pray'); expect(u.nodeId).toBe(-g2.id); }
    expect(cond(s2, { units: { player: 1, tag: 'priests', state: 'pray' }, eq: 2 })).toBe(true);
  });

  it('forEachPlayer com $p e perIndex: uma invasão por defensor, de lados diferentes', () => {
    const file = mk({
      config: { players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'B', god: 'poseidon', isAI: false, difficulty: 'normal', team: 0 }, { name: 'T', god: 'hades', isAI: false, difficulty: 'normal', team: 9 }] },
      setup: [{ do: 'removeAll', team: 9 }],
    });
    const s = game(file);
    expect(unitsOf(s, 2).length).toBe(0); expect(buildingsOf(s, 2).length).toBe(0);
    act(s, [{ do: 'forEachPlayer', team: 0, alive: true, then: [
      { do: 'raid', player: { team: 9 }, units: ['hoplite'], target: { tc: '$p' }, angle: { base: 0, perIndex: 4 }, distance: 12 },
      { do: 'spawn', player: '$p', units: ['toxotes'], at: { tc: '$p', dy: 4 }, tag: 'guard' },
    ] }]);
    const raiders = unitsOf(s, 2);
    expect(raiders.length).toBe(2);
    const t0 = tc(s, 0), t1 = tc(s, 1);
    const near = (x: number, y: number) => raiders.find((u) => (u.x - x) ** 2 + (u.y - y) ** 2 < 20 * 20)!;
    const r0 = near(t0.x, t0.y), r1 = near(t1.x, t1.y);
    expect(r0).toBeDefined(); expect(r1).toBeDefined(); expect(r0).not.toBe(r1);
    expect(r0.x).toBeGreaterThan(t0.x);   // ângulo 0 → leste
    expect(r1.x).toBeLessThan(t1.x);      // ângulo 4 → oeste
    expect(r0.state).toBe('attackMove');
    expect(unitsOf(s, 0).filter((u) => u.type === 'toxotes').length).toBe(1);
    expect(unitsOf(s, 1).filter((u) => u.type === 'toxotes').length).toBe(1);
  });

  it('removeAll remove na hora e limpa gateTeam; kill mata unidade e derruba edifício', () => {
    const s = game(mk());
    const t1 = tc(s, 1);
    const g = placeBuilding(s, 1, 'gate', t1.tx + 6, t1.ty, true);
    const i = idx(s.map, g.tx, g.ty);
    expect(s.map.gateTeam[i]).toBe(1);
    expect(s.map.buildingAt[i]).toBe(g.id);
    act(s, [{ do: 'removeAll', player: 1 }]);
    expect(buildingsOf(s, 1).length).toBe(0); expect(unitsOf(s, 1).length).toBe(0);
    expect(s.map.gateTeam[i]).toBe(-1); expect(s.map.buildingAt[i]).toBe(-1); expect(s.map.blocked[idx(s.map, t1.tx, t1.ty)]).toBe(0);
    expect(s.players[1].pop).toBe(0);
    const u = unitsOf(s, 0).reduce((a, b) => (a.id < b.id ? a : b));
    act(s, [{ do: 'kill', entity: { player: 0, type: u.type } }]);
    expect(u.dead).toBe(true); expect(s.players[0].stats.losses).toBe(1);
    act(s, [{ do: 'kill', entity: { tc: 0 } }]);
    expect(tc(s, 0).dead).toBe(true);
  });

  it('ceasefire, order (move/attackMove/attack), set (age/recursos/tecnologias/deuses) e give', () => {
    const s = game(mk());
    act(s, [{ do: 'ceasefire', seconds: 30 }]);
    expect(s.ceasefireUntil).toBe(s.tick + 30 * TICK_RATE);
    act(s, [{ do: 'spawn', player: 0, units: ['hoplite', 'hoplite'], at: { tc: 0, dy: 5 }, tag: 'sq' }]);
    const sq = [s.scenario!.vars['#sq[0]'], s.scenario!.vars['#sq[1]']].map((id) => s.units.get(id)!);
    act(s, [{ do: 'order', units: { tag: 'sq' }, order: { type: 'move', at: { at: [10, 10] } } }]);
    for (const u of sq) { expect(u.state).toBe('move'); expect(u.tx).toBe(10); expect(u.ty).toBe(10); }
    act(s, [{ do: 'order', units: { player: 0, type: 'hoplite' }, order: { type: 'attackMove', at: { tc: 1 } } }]);
    for (const u of sq) expect(u.state).toBe('attackMove');
    act(s, [{ do: 'order', units: { tag: 'sq' }, order: { type: 'attack', target: { tc: 1 } } }]);
    for (const u of sq) { expect(u.state).toBe('attack'); expect(u.targetId).toBe(tc(s, 1).id); }
    act(s, [{ do: 'set', player: 1, age: 2, resources: { food: 1500, gold: 7 }, techs: ['phalanx'], minorGods: ['ares'] }, { do: 'give', player: 1, resources: { gold: 3 } }]);
    const p = s.players[1];
    expect(p.age).toBe(2); expect(p.resources.food).toBe(1500); expect(p.resources.gold).toBe(10);
    expect(p.techs).toContain('phalanx'); expect(p.minorGods).toEqual(['ares']); expect(p.powers.some((x) => x.id === 'pestilence')).toBe(true);
    act(s, [{ do: 'setVar', name: 'v', value: { stat: 'gold', player: 1 } }, { do: 'addVar', name: 'v', delta: 5 }]);
    expect(s.scenario!.vars.v).toBe(15);
  });

  it('setup roda depois das entidades do mapa (tags do arquivo já em vars) e vars iniciais entram no estado', () => {
    const s = game(mk({ vars: { fase: 2 }, setup: [{ do: 'storeEntity', var: 'cc', entity: { tc: 0 } }, { do: 'say', speaker: 'X', text: { pt: 'oi', en: 'hi' } }] }));
    expect(s.scenario!.vars.fase).toBe(2);
    expect(s.scenario!.vars.cc).toBe(tc(s, 0).id);
    expect(s.events.some((e) => e.type === 'dialogue' && e.text === 'oi')).toBe(true);
  });

  it('objetivos done/failed, reveal, objective, victory/defeat e hud compilados', () => {
    const file = mk({
      objectives: [
        { id: 'a', text: { pt: 'A' }, done: { var: 'ok', gte: 1 }, failed: { var: 'ruim', gte: 1 } },
        { id: 'b', text: { pt: 'B' }, hidden: true, optional: true },
      ],
      triggers: [
        { id: 't1', when: { time: { gte: 2 } }, then: [{ do: 'setVar', name: 'ok', value: 1 }, { do: 'reveal', id: 'b' }] },
        { id: 't2', when: { objective: 'a', is: 'done' }, then: [{ do: 'objective', id: 'b', status: 'done' }] },
      ],
      victory: { all: [{ objective: 'a', is: 'done' }, { objective: 'b', is: 'done' }] },
      defeat: { var: 'perdeu', gte: 1 },
      hud: [{ type: 'countdown', seconds: 60, while: { objective: 'a', is: 'pending' }, label: { pt: 'Resista', en: 'Hold' } }, { type: 'progress', entity: { tc: 1 }, max: 100, label: 'Obra' }],
    });
    const def = compileScenario(file);
    expect(def.objectives[1].hidden).toBe(true); expect(def.objectives[1].optional).toBe(true); expect(def.objectives[1].check).toBeUndefined();
    expect(def.hud!.length).toBe(2);
    const s = game(file);
    expect(s.scenario!.hidden.b).toBe(true);
    run(s, 1 * TICK_RATE);
    expect(def.hud![0].type === 'countdown' && def.hud![0].while(s)).toBe(true);
    expect(def.hud![1].type === 'progress' && def.hud![1].entity(s)).toBe(-1);   // CC concluído → -1
    run(s, 3 * TICK_RATE);
    expect(s.scenario!.fired).toEqual(['t1', 't2']);
    expect(s.scenario!.objectives).toEqual({ a: 'done', b: 'done' });
    expect(s.scenario!.hidden.b).toBe(false);
    expect(s.scenario!.outcome).toBe('victory'); expect(s.gameOver).toBe(true);
    // failed vence done quando ambos valem; defeat encerra
    const s2 = game(file);
    s2.scenario!.vars.ok = 1; s2.scenario!.vars.ruim = 1;
    expect(def.objectives[0].check!(s2)).toBe('failed');
    s2.scenario!.vars.perdeu = 1;
    run(s2, TICK_RATE);
    expect(s2.scenario!.outcome).toBe('defeat');
  });
});

describe('cenário JSON: helpers novos', () => {
  it('placeExact só coloca no canto pedido; placeNear devolve o edifício; nearCount e tagIds', () => {
    const s = game(mk());
    const t = tc(s, 0);
    expect(placeExact(s, 0, 'house', t.tx, t.ty)).toBeNull();           // ocupado pelo CC
    let h = null, cx = 0, cy = 0;
    for (let d = 4; d < 14 && !h; d++) { cx = t.tx + d; cy = t.ty + d; h = placeExact(s, 0, 'house', cx, cy); }   // primeiro canto livre na diagonal
    expect(h && h.tx === cx && h.ty === cy && h.complete).toBe(true);
    const n = placeNear(s, 0, 'house', t.tx, t.ty, false);
    expect(n && !n.complete && (n.tx !== t.tx || n.ty !== t.ty)).toBe(true);
    for (const u of unitsOf(s, 0)) u.dead = true; run(s, 1);
    const a = spawnUnit(s, 0, 'hoplite', t.x + 3, t.y), b = spawnUnit(s, 0, 'toxotes', t.x, t.y + 4);
    expect(nearCount(s, 0, t.x, t.y, 4)).toBe(1);
    expect(nearCount(s, 0, t.x, t.y, 4.01)).toBe(2);
    expect(nearCount(s, 0, t.x, t.y, 10, (u) => u.type === 'toxotes')).toBe(1);
    expect(tagIds(s, 'x')).toEqual([]);
    s.scenario!.vars['#x'] = a.id; s.scenario!.vars['#x[0]'] = a.id; s.scenario!.vars['#x[1]'] = b.id;
    expect(tagIds(s, 'x')).toEqual([a.id, b.id]);
  });
});

describe('cenário JSON: missão 1', () => {
  function snapshot(s: GameState) {
    const sc = s.scenario!;
    return JSON.stringify({
      fired: sc.fired, objectives: sc.objectives, hidden: sc.hidden, outcome: sc.outcome, tick: s.tick,
      players: s.players.map((p) => ({
        alive: p.alive, age: p.age,
        units: [...s.units.values()].filter((u) => u.owner === p.id && !u.dead).map((u) => u.type).sort(),
        buildings: [...s.buildings.values()].filter((b) => b.owner === p.id && !b.dead).map((b) => b.type).sort(),
        res: Object.fromEntries(Object.entries(p.resources).map(([k, v]) => [k, Math.round(v)])),
      })),
    });
  }
  it('paridade: JSON (scenarioData) e TS (scenario) por 14 min sem jogador → mesmos gatilhos, objetivos, resultado e contagens', () => {
    const ts = createGame({ ...SCENARIOS[0].config, scenario: 'm1_despertar' });
    const js = createGame(gameConfigFor(M1));
    expect(js.scenario!.id).toBe('m1_despertar');
    expect(getScenarioFor(js)).toBe(compileScenarioCached(M1));
    expect(Object.keys(js.scenario!.objectives)).toEqual(Object.keys(ts.scenario!.objectives));
    expect(snapshot(js)).toBe(snapshot(ts));
    for (let i = 0; i < 14 * 60 * TICK_RATE; i++) { tick(ts); tick(js); }
    expect(js.scenario!.fired).toEqual(['start', 'raid1', 'raid2']);
    expect(snapshot(js)).toBe(snapshot(ts));
    const dial = (s: GameState) => s.events.filter((e) => e.type === 'dialogue').map((e) => `${e.data}|${e.text}`);
    expect(dial(js)).toEqual(dial(ts));
  });
  it('validateScenario aceita o m1 JSON (id reservado só com allowReserved) e compila os textos por idioma', () => {
    expect(validateScenario(M1, { allowReserved: true })).toEqual([]);
    expect(validateScenario(M1).map((i) => i.path)).toEqual(['id']);
    const pt = compileScenarioCached(M1);
    expect(pt.title).toBe('O Despertar de Argos'); expect(pt.objectives[0].text).toBe('Treine 10 Cidadãos'); expect(pt.hints!.length).toBe(2);
    setLocale('en');
    const en = compileScenarioCached(M1);
    expect(en).not.toBe(pt);
    expect(en.title).toBe('The Awakening of Argos'); expect(en.objectives[0].text).toBe('Train 10 Villagers'); expect(en.intro[0]).toMatch(/^Argos, before/);
  });
});

describe('cenário JSON: validação', () => {
  const paths = (f: unknown, opts?: { allowReserved?: boolean }) => validateScenario(f, opts).map((i) => i.path);
  it('aceita o cenário mínimo e nunca lança para entradas de tipo errado', () => {
    expect(validateScenario(mk())).toEqual([]);
    for (const bad of [null, 42, 'x', [], undefined, { format: 5 }]) expect(() => validateScenario(bad)).not.toThrow();
    expect(validateScenario(null).length).toBe(1);
    expect(validateScenario({}).length).toBeGreaterThan(3);
  });
  it('rejeita format/version, ids reservados e prefixo wave', () => {
    expect(paths({ ...mk(), format: 'x' })).toContain('format');
    expect(paths({ ...mk(), version: 2 })).toContain('version');
    for (const id of RESERVED_SCENARIO_IDS) { expect(paths(mk({ id }))).toEqual(['id']); expect(paths(mk({ id }), { allowReserved: true })).toEqual([]); }
    expect(paths(mk({ triggers: [{ id: 'wave1', when: { time: { gte: 1 } }, then: [] }] }))).toEqual(['triggers[0].id']);
  });
  it('rejeita unidade/edifício/tecnologia/deus menor inexistentes', () => {
    expect(paths(mk({ setup: [{ do: 'spawn', player: 0, units: ['dragao'], at: { tc: 0 } }] }))).toEqual(['setup[0].units[0]']);
    expect(paths(mk({ setup: [{ do: 'place', player: 0, building: 'castelo', at: { tc: 0 } }] }))).toEqual(['setup[0].building']);
    expect(paths(mk({ setup: [{ do: 'set', player: 0, techs: ['magia'], minorGods: ['loki'] }] }))).toEqual(['setup[0].techs[0]', 'setup[0].minorGods[0]']);
    expect(paths(mk({ objectives: [{ id: 'o', text: 'x', done: { units: { player: 0, type: ['hoplite', 'orc'] }, gte: 1 } }] }))).toEqual(['objectives[0].done.units.type[1]']);
    expect(paths(mk({ victory: { buildings: { type: 'muralhao' }, eq: 0 } }))).toEqual(['victory.buildings.type']);
    expect(paths(mk({ victory: { entity: { player: 0, type: 'nada' }, exists: false } }))).toEqual(['victory.entity.type']);
    expect(paths({ ...mk(), config: { players: [{ name: 'A', god: 'odin', isAI: false, difficulty: 'normal' }] } })).toEqual(['config.players[0].god']);
  });
  it('rejeita jogador fora do intervalo e $p fora de forEachPlayer; aceita local, { team } e $p dentro', () => {
    expect(paths(mk({ setup: [{ do: 'give', player: 2, resources: { gold: 1 } }] }))).toEqual(['setup[0].player']);
    expect(paths(mk({ setup: [{ do: 'give', player: -1, resources: { gold: 1 } }] }))).toEqual(['setup[0].player']);
    expect(paths(mk({ setup: [{ do: 'give', player: '$p', resources: { gold: 1 } }] }))).toEqual(['setup[0].player']);
    expect(paths(mk({ victory: { value: { stat: 'age', player: '$p' }, gte: 1 } }))).toEqual(['victory.value.player']);
    expect(paths(mk({ setup: [{ do: 'give', player: 'local', resources: { gold: 1 } }, { do: 'give', player: { team: 3 }, resources: { gold: 1 } }, { do: 'forEachPlayer', then: [{ do: 'give', player: '$p', resources: { gold: 1 } }] }] }))).toEqual([]);
  });
  it('rejeita objetivo referenciado sem definição e ids duplicados', () => {
    expect(paths(mk({ victory: { objective: 'x', is: 'done' } }))).toEqual(['victory.objective']);
    expect(paths(mk({ triggers: [{ id: 't', when: { time: { gte: 1 } }, then: [{ do: 'reveal', id: 'x' }, { do: 'objective', id: 'y', status: 'done' }] }] }))).toEqual(['triggers[0].then[0].id', 'triggers[0].then[1].id']);
    expect(paths(mk({ objectives: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] }))).toEqual(['objectives[1].id']);
    expect(paths(mk({ triggers: [{ id: 't', when: { time: { gte: 1 } }, then: [] }, { id: 't', when: { time: { gte: 1 } }, then: [] }] }))).toEqual(['triggers[1].id']);
    expect(paths(mk({ victory: { fired: 'fantasma' } }))).toEqual(['victory.fired']);
  });
  it('rejeita do/operador desconhecido, comparação vazia e ordem inválida', () => {
    expect(paths(mk({ setup: [{ do: 'teleport' } as unknown as Action] }))).toEqual(['setup[0].do']);
    expect(paths(mk({ victory: { magic: true } as unknown as Condition }))).toEqual(['victory']);
    expect(paths(mk({ victory: { time: {} } }))).toEqual(['victory.time']);
    expect(paths(mk({ victory: { units: { player: 0 } } as unknown as Condition }))).toEqual(['victory']);
    expect(paths(mk({ setup: [{ do: 'order', units: { tag: 'x' }, order: { type: 'dance' } } as unknown as Action] }))).toEqual(['setup[0].order.type']);
    expect(paths(mk({ setup: [{ do: 'spawn', player: 0, units: ['hoplite'], at: { tc: 0 }, state: 'pray' }] }))).toEqual(['setup[0].prayAt']);
  });
  it('rejeita profundidade > 8 e JSON > 256 KB', () => {
    let c: Condition = { time: { gte: 1 } };
    for (let i = 0; i < 7; i++) c = { not: c };          // profundidade 8: ok
    expect(paths(mk({ victory: c }))).toEqual([]);
    c = { all: [c] };                                    // 9: recusado
    expect(paths(mk({ victory: c }))).toEqual(['victory.all[0].not.not.not.not.not.not.not']);
    let a: Action = { do: 'forEachPlayer', then: [{ do: 'ceasefire', seconds: 1 }] };
    for (let i = 0; i < 8; i++) a = { do: 'forEachPlayer', then: [a] };
    expect(paths(mk({ setup: [a] })).length).toBe(1);
    expect(paths(mk({ intro: ['x'.repeat(SCENARIO_LIMITS.maxJsonBytes)] }))).toEqual(['']);
  });
  it('rejeita map.gen inválido e map.data que não passa em validateMap', () => {
    expect(paths(mk({ map: { gen: { mapSize: 'huge' as 'small', seed: 1 } } }))).toEqual(['map.gen.mapSize']);
    expect(paths(mk({ map: { gen: { mapSize: 'small', mapType: 'lava' as 'lakes', seed: 1 } } }))).toEqual(['map.gen.mapType']);
    expect(paths(mk({ map: { gen: { mapSize: 'small', seed: 1.5 } } }))).toEqual(['map.gen.seed']);
    expect(paths(mk({ map: { data: { v: 1, w: 10, h: 10, terrain: '', decor: '', nodes: [], starts: [] } } }))).toContain('map.data');
    expect(paths(mk({ map: {} as ScenarioFile['map'] }))).toEqual(['map']);
    expect(paths(mk({ map: undefined }))).toEqual([]);
  });
  it('rejeita config inválida (modo, idade inicial, recursos) e hud malformado', () => {
    expect(paths({ ...mk(), config: { ...mk().config, mode: 'chaos', startingAge: 9, startingResources: { mana: 1 } } })).toEqual(['config.startingAge', 'config.startingResources.mana', 'config.mode']);
    expect(paths({ ...mk(), config: { players: [] } })).toEqual(['config.players']);
    expect(paths(mk({ hud: [{ type: 'progress', entity: { tag: 'g' }, max: 0, label: 'x' }, { type: 'radar' } as unknown as NonNullable<ScenarioFile['hud']>[number]] }))).toEqual(['hud[0].max', 'hud[1].label', 'hud[1].type']);
  });
});

describe('cenário JSON: determinismo, tx e cache', () => {
  it('duas partidas com o mesmo scenarioData (IA ativa) produzem o mesmo estado após 1500 ticks', () => {
    const file = mk({
      config: { players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: true, difficulty: 'normal' }] },
      setup: [{ do: 'spawn', player: 1, units: ['hoplite', 'toxotes'], at: { tc: 1, dy: 4 }, tag: 'g' }],
      triggers: [
        { id: 'r', repeat: true, when: { every: { seconds: 30, after: 30 } }, then: [{ do: 'raid', player: 1, units: ['hoplite'], target: { tc: 0 }, angle: 2, distance: 16 }, { do: 'addVar', name: 'raids', delta: 1 }] },
        { id: 'once', when: { var: 'raids', gte: 2 }, then: [{ do: 'ceasefire', seconds: 5 }] },
      ],
    });
    const a = createGame(gameConfigFor(JSON.parse(JSON.stringify(file)))), b = createGame(gameConfigFor(JSON.parse(JSON.stringify(file))));
    run(a, 1500); run(b, 1500);
    expect(a.scenario!.vars.raids).toBe(2);              // gatilhos repetidos não entram em fired
    expect(a.scenario!.fired).toEqual(['once']);
    expect(unitsOf(a, 1).length).toBeGreaterThan(0);
    const sa = serialize(a), sb = serialize(b);
    expect(sa.length).toBe(sb.length);
    expect(sa).toBe(sb);
  });
  it('tx() cai para pt, muda com setLocale(en) e devolve strings simples como estão', () => {
    expect(tx('simples')).toBe('simples');
    expect(tx({ pt: 'oi', en: 'hi' })).toBe('oi');
    expect(tx({ pt: 'só pt' })).toBe('só pt');
    expect(tx(undefined)).toBe('');
    setLocale('en');
    expect(tx({ pt: 'oi', en: 'hi' })).toBe('hi');
    expect(tx({ pt: 'só pt' })).toBe('só pt');
    expect(tx('simples')).toBe('simples');
    setLocale('pt');
    expect(tx({ pt: 'oi', en: 'hi' })).toBe('oi');
  });
  it('cache de compilação: mesmo JSON → mesmo objeto; outro idioma → objeto novo; JSON inválido lança', () => {
    const file = mk();
    const a = compileScenarioCached(file);
    expect(compileScenarioCached(JSON.parse(JSON.stringify(file)))).toBe(a);
    expect(compileScenarioCached(mk({ id: 'outro' }))).not.toBe(a);
    setLocale('en');
    const en = compileScenarioCached(file);
    expect(en).not.toBe(a); expect(en.title).toBe('Test'); expect(a.title).toBe('Teste');
    setLocale('pt');
    expect(compileScenarioCached(file)).toBe(a);
    expect(() => compileScenarioCached(mk({ id: 'horde' }))).not.toThrow();   // ids reservados passam no cache (arquivo já carregado)
    expect(() => compileScenarioCached({ ...mk(), format: 'x' } as unknown as ScenarioFile)).toThrow(/cenário inválido/);
    expect(() => createGame(gameConfigFor({ ...mk(), victory: { magic: 1 } as unknown as Condition }))).toThrow(/cenário inválido/);
  });
});
