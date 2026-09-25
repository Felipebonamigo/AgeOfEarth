// Regressões da revisão adversarial da infraestrutura da campanha (docs/STORY.md §6): 1) G2 não apaga o exército de quem
// perdeu a cidade (Horda cooperativa); 2) marionetes explícitas (puppet) e resultado do cenário por time; 3) lint de objetivo
// oculto revelado por gatilho sem guarda; 4) roteiros estritos por padrão (tests/missions.test.ts e scripts/missions.ts);
// 5) `alive` de marionete = tem entidade viva, e a ação { do: 'defeat' }.
import { describe, it, expect, afterEach } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { buildingsOf, spawnUnit, unitsOf } from '../src/core/sim/entities';
import { lintScenario, validateScenario, type Action, type Condition, type ScenarioFile } from '../src/core/scenario/schema';
import { clearScenarioCache, compileScenario, gameConfigFor } from '../src/core/scenario/compile';
import { HORDE, PROLOGUE, missionConfig } from '../src/core/scenario/campaign';
import { migrateLegacyPuppets, removeAllOf } from '../src/core/scenario/helpers';
import { isScenarioPuppet, scenarioWon } from '../src/core/scenario/runner';
import { serialize, deserialize } from '../src/core/serialize';
import type { GameState } from '../src/core/types';
import type { TriggerCtx } from '../src/core/scenario/types';

function mk(over: Partial<ScenarioFile> = {}): ScenarioFile {
  return {
    format: 'aoe-scenario', version: 1, id: 'revisao', title: { pt: 'Revisão', en: 'Review' }, intro: ['olá'],
    map: { gen: { mapSize: 'small', seed: 12345 } },
    config: { players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'B', god: 'hades', isAI: true, difficulty: 'normal', team: 1 }] },
    objectives: [], triggers: [], victory: { time: { gte: 99999 } },
    ...over,
  };
}
const game = (f: ScenarioFile) => createGame(gameConfigFor(f));
const run = (s: GameState, ticks: number) => { for (let i = 0; i < ticks; i++) tick(s); };
const ctx0: TriggerCtx = { seconds: 0, fired: () => false, say: () => {}, objective: () => {}, reveal: () => {} };
function cond(s: GameState, c: Condition): boolean { return compileScenario(mk({ triggers: [{ id: 'x', when: c, then: [] }] })).triggers[0].when(s, ctx0); }
function act(s: GameState, actions: Action[]): void { compileScenario(mk({ triggers: [{ id: 'x', when: { time: { gte: 0 } }, then: actions }] })).triggers[0].then(s, ctx0); }
const paths = (f: unknown) => validateScenario(f).map((i) => i.path);
const warnPaths = (f: unknown) => lintScenario(f).map((i) => i.path);

afterEach(() => clearScenarioCache());

describe('1) G2 não apaga o exército de quem perdeu a cidade (Horda cooperativa)', () => {
  const coop = () => createGame({ ...HORDE.config, seed: 4404, scenario: HORDE.id, players: [
    { name: 'A', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 },
    { name: 'B', god: 'poseidon', isAI: false, difficulty: 'normal', team: 0 },
    { name: 'Tártaro', god: 'hades', isAI: false, difficulty: 'normal', team: 9, puppet: true },
  ] });
  it('defensor sem Centro Cívico e sem cidadãos, mas com 10 hoplitas, segue vivo com o exército; o aliado segue jogando', () => {
    const s = coop();
    const tc = buildingsOf(s, 1).find((b) => b.type === 'town_center')!;
    removeAllOf(s, (o) => o === 1);
    for (let i = 0; i < 10; i++) spawnUnit(s, 1, 'hoplite', tc.x + (i % 5), tc.y + 3 + Math.floor(i / 5));
    run(s, 3 * TICK_RATE);
    expect(s.players[1].alive).toBe(true);
    expect(unitsOf(s, 1).length).toBe(10);
    expect(s.scenario!.outcome).toBe('playing'); expect(s.players[0].alive).toBe(true);
    // sem nenhuma unidade também, aí sim cai; com o aliado de pé, a Horda continua
    removeAllOf(s, (o) => o === 1);
    run(s, 2 * TICK_RATE);
    expect(s.players[1].alive).toBe(false); expect(s.scenario!.outcome).toBe('playing');
    // os dois defensores sem nada: derrota do cenário, sem vencedor
    removeAllOf(s, (o) => o === 0);
    run(s, 2 * TICK_RATE);
    expect(s.scenario!.outcome).toBe('defeat'); expect(s.scenario!.winnerTeam).toBe(-1);
    expect(scenarioWon(s.scenario!, 0)).toBe(false);
  });
  it('com um defensor só com exército, a onda nasce contra o outro e o Tártaro (marionete com unidades) fica vivo', () => {
    const s = coop();
    removeAllOf(s, (o) => o === 1);
    spawnUnit(s, 1, 'hoplite', s.map.starts[1].x + 0.5, s.map.starts[1].y + 0.5);
    run(s, 101 * TICK_RATE);
    expect(s.scenario!.fired).toContain('wave1');
    expect(s.players[1].alive).toBe(true);
    expect(unitsOf(s, 2).length).toBeGreaterThan(0);
    expect(s.players[2].alive).toBe(true);
  });
});

describe('2) marionetes explícitas e resultado do cenário por time', () => {
  const versus = (over: Partial<ScenarioFile> = {}) => mk({ config: { players: [
    { name: 'Ana', god: 'zeus', isAI: false, difficulty: 'normal', team: 0, puppet: false },
    { name: 'Beto', god: 'hades', isAI: false, difficulty: 'normal', team: 1, puppet: false },
  ] }, ...over });
  it('dois humanos em times diferentes: o oponente é eliminado e o time que resta vence (cada cliente vê o seu resultado)', () => {
    const s = game(versus());
    expect(isScenarioPuppet(s, 1)).toBe(false);
    removeAllOf(s, (o) => o === 1);
    run(s, 2 * TICK_RATE);
    expect(s.players[1].alive).toBe(false);
    expect(s.gameOver).toBe(true); expect(s.scenario!.winnerTeam).toBe(0); expect(s.winner).toBe(0);
    expect(s.scenario!.outcome).toBe('victory');
    expect(scenarioWon(s.scenario!, 0)).toBe(true); expect(scenarioWon(s.scenario!, 1)).toBe(false);
    expect(s.events.some((e) => e.type === 'victory' && (e.text ?? '').includes('Ana'))).toBe(true);
  });
  it('a queda do primeiro humano dá a vitória ao outro time (não é derrota global)', () => {
    const s = game(versus());
    removeAllOf(s, (o) => o === 0);
    run(s, 2 * TICK_RATE);
    expect(s.gameOver).toBe(true);
    expect(s.scenario!.winnerTeam).toBe(1); expect(s.winner).toBe(1);
    expect(s.scenario!.outcome).toBe('defeat');   // do ponto de vista do primeiro humano (igual em todos os clientes)
    expect(scenarioWon(s.scenario!, 1)).toBe(true); expect(scenarioWon(s.scenario!, 0)).toBe(false);
    // a derrota do arquivo (escrita para o time do primeiro humano) passa a vitória ao outro time humano
    const d = game(versus({ defeat: { time: { gte: 2 } } }));
    run(d, 3 * TICK_RATE);
    expect(d.scenario!.winnerTeam).toBe(1); expect(scenarioWon(d.scenario!, 1)).toBe(true); expect(scenarioWon(d.scenario!, 0)).toBe(false);
    // e a vitória do arquivo vale para o time do primeiro humano
    const v = game(versus({ victory: { time: { gte: 2 } } }));
    run(v, 3 * TICK_RATE);
    expect(v.scenario!.winnerTeam).toBe(0); expect(scenarioWon(v.scenario!, 0)).toBe(true); expect(scenarioWon(v.scenario!, 1)).toBe(false);
  });
  it('missão de um jogador: vitória e derrota como antes (winnerTeam = time do jogador ou -1)', () => {
    const v = game(mk({ victory: { time: { gte: 2 } } }));
    run(v, 3 * TICK_RATE);
    expect(v.scenario!.outcome).toBe('victory'); expect(v.scenario!.winnerTeam).toBe(0); expect(v.winner).toBe(0);
    const d = game(mk({ defeat: { time: { gte: 2 } } }));
    run(d, 3 * TICK_RATE);
    expect(d.scenario!.outcome).toBe('defeat'); expect(d.scenario!.winnerTeam).toBe(-1); expect(d.winner).toBe(-2);
  });
  it('winnerTeam sobrevive ao save; saves antigos ganham padrão', () => {
    const s = game(versus());
    removeAllOf(s, (o) => o === 1); run(s, 2 * TICK_RATE);
    expect(deserialize(serialize(s)).scenario!.winnerTeam).toBe(0);
    const o = JSON.parse(serialize(s)); delete o.scenario.winnerTeam;
    expect(deserialize(JSON.stringify(o)).scenario!.winnerTeam).toBe(0);   // outcome 'victory' → time do primeiro humano
    const q = JSON.parse(serialize(game(mk()))); delete q.scenario.winnerTeam;
    expect(deserialize(JSON.stringify(q)).scenario!.winnerTeam).toBe(-1);
  });
  it('puppet: validação, missões marcadas, lint de humano de outro time sem o campo e migração de saves/replays antigos', () => {
    const [a, b] = mk().config.players;
    expect(paths(mk({ config: { players: [a, { ...b, isAI: false, puppet: 'sim' as unknown as boolean }] } }))).toEqual(['config.players[1].puppet']);
    expect(paths(mk({ config: { players: [a, { ...b, isAI: true, puppet: true }] } }))).toEqual(['config.players[1].puppet']);
    expect(HORDE.config.players.find((p) => p.team === 9)!.puppet).toBe(true);
    expect(PROLOGUE[0].config.players[1].puppet).toBe(true);
    const unflagged = mk({ config: { players: [a, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal', team: 1 }] } });
    expect(warnPaths(unflagged)).toEqual(['config.players[1]']);
    expect(warnPaths(versus())).toEqual([]);   // puppet: false explícito = adversário humano
    // config sem nenhum `puppet` (save/replay de antes ou arquivo antigo jogado localmente): regra antiga; com o campo, nada muda
    expect(migrateLegacyPuppets(gameConfigFor(unflagged)).players.map((p) => !!p.puppet)).toEqual([false, true]);
    const explicit = gameConfigFor(versus());
    expect(migrateLegacyPuppets(explicit)).toBe(explicit);
    const skirmish = { seed: 1, mapSize: 'small' as const, players: gameConfigFor(unflagged).players };
    expect(migrateLegacyPuppets(skirmish)).toBe(skirmish);   // sem cenário: nunca
    const old = createGame({ ...HORDE.config, scenario: HORDE.id, players: HORDE.config.players.map((p) => ({ name: p.name, god: p.god, isAI: p.isAI, difficulty: p.difficulty, team: p.team })) });
    expect(deserialize(serialize(old)).config.players[1].puppet).toBe(true);
  });
  it("'local' e a dificuldade da campanha ignoram marionetes", () => {
    const f = mk({ config: { players: [{ name: 'Guardas', god: 'hades', isAI: false, difficulty: 'normal', team: 1, puppet: true }, { name: 'Argos', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'Culto', god: 'hades', isAI: true, difficulty: 'normal', team: 1 }] } });
    const s = game(f);
    act(s, [{ do: 'storeEntity', var: 'tc', entity: { tc: 'local' } }]);
    expect(s.buildings.get(s.scenario!.vars.tc)!.owner).toBe(1);
    expect(missionConfig({ ...compileScenario(f), id: 'm1_despertar' }, 'hard').players[2].difficulty).toBe('hard');
  });
});

describe('5) alive de marionete e ação defeat', () => {
  it('{ alive: P } da marionete = tem entidade viva; removeAll e kill do último derrubam; spawn traz de volta', () => {
    const s = createGame({ ...PROLOGUE[0].config, scenario: 'm1_despertar' });
    expect(cond(s, { alive: 1 })).toBe(true);
    act(s, [{ do: 'removeAll', player: 1 }]);
    expect(cond(s, { alive: 1 })).toBe(false); expect(cond(s, { value: { stat: 'alive', player: 1 }, eq: 0 })).toBe(true);
    run(s, TICK_RATE);
    expect(s.players[1].alive).toBe(false);
    act(s, [{ do: 'spawn', player: 1, units: ['hoplite'], at: { start: 1 } }]);
    expect(cond(s, { alive: 1 })).toBe(true);
    run(s, TICK_RATE);
    expect(s.players[1].alive).toBe(true);
    act(s, [{ do: 'kill', entity: { player: 1, type: 'hoplite' } }]);
    expect(cond(s, { alive: 1 })).toBe(false);
  });
  it('{ do: defeat }: marionete perde tudo; IA é eliminada com evento; o humano local perde a missão', () => {
    const m1 = createGame({ ...PROLOGUE[0].config, scenario: 'm1_despertar' });
    act(m1, [{ do: 'defeat', player: 1 }]);
    expect(unitsOf(m1, 1).filter((u) => !u.dead).length + buildingsOf(m1, 1).length).toBe(0);
    expect(cond(m1, { alive: 1 })).toBe(false);
    expect(m1.events.some((e) => e.type === 'defeated' && e.player === 1)).toBe(true);
    const s = game(mk());
    act(s, [{ do: 'defeat', player: 1 }]);
    expect(s.players[1].alive).toBe(false);
    run(s, 2 * TICK_RATE);
    expect(s.players[1].alive).toBe(false); expect(s.scenario!.outcome).toBe('playing');
    act(s, [{ do: 'defeat', player: 'local' }]);
    run(s, TICK_RATE);
    expect(s.scenario!.outcome).toBe('defeat');
    expect(paths(mk({ triggers: [{ id: 't', when: { time: { gte: 1 } }, then: [{ do: 'defeat', player: 9 }] }] }))).toEqual(['triggers[0].then[0].player']);
  });
});

describe('4) m3: números de dificuldade (o roteiro estrito vence nas três)', () => {
  it('estoque e calma do Culto por dificuldade; ritual de ~24 min', () => {
    const got = (['easy', 'normal', 'hard'] as const).map((d) => { const s = createGame(missionConfig(PROLOGUE[2], d)); const e = s.players[1]; return [e.resources.food, e.resources.gold, Math.round((e.ai?.lastAttack ?? 0) / TICK_RATE)]; });
    expect(got).toEqual([[1500, 1500, 600], [2000, 2000, 540], [2500, 2500, 480]]);
    const s = createGame(missionConfig(PROLOGUE[2], 'normal'));
    const gate = [...s.buildings.values()].find((b) => b.owner === 1 && b.type === 'titan_gate')!;
    run(s, 60 * TICK_RATE);
    expect(gate.progress).toBeGreaterThan(5); expect(gate.progress).toBeLessThan(9);   // 0,125/s × ~60 s
  });
});

describe('3) lint de objetivo oculto revelado por gatilho sem guarda (G1)', () => {
  const revealAt60: ScenarioFile['triggers'][number] = { id: 'revela', when: { time: { gte: 60 } }, then: [{ do: 'reveal', id: 'o' }] };
  it('avisa done/failed sem { fired } do gatilho que revela; aceita com a guarda (inclusive aninhada em all) e segredo sem reveal', () => {
    const obj = (o: Partial<ScenarioFile['objectives'][number]>) => mk({ objectives: [{ id: 'o', text: 'x', hidden: true, ...o }], triggers: [revealAt60] });
    expect(warnPaths(obj({ done: { buildings: { player: 1 }, eq: 0 } }))).toEqual(['objectives[0].done']);
    expect(warnPaths(obj({ failed: { time: { gte: 5 } } }))).toEqual(['objectives[0].failed']);
    expect(warnPaths(obj({ done: { all: [{ fired: 'revela' }, { buildings: { player: 1 }, eq: 0 }] } }))).toEqual([]);
    expect(warnPaths(obj({ done: { all: [{ time: { gte: 1 } }, { all: [{ fired: 'revela' }] }] } }))).toEqual([]);
    expect(warnPaths(obj({ done: { any: [{ fired: 'revela' }, { time: { gte: 5 } }] } }))).toEqual(['objectives[0].done']);
    expect(warnPaths(mk({ objectives: [{ id: 'o', text: 'x', hidden: true, done: { time: { gte: 5 } } }] }))).toEqual([]);   // segredo: revela-se ao cumprir
    expect(warnPaths(mk({ objectives: [{ id: 'o', text: 'x', done: { time: { gte: 5 } } }], triggers: [revealAt60] }))).toEqual([]);   // não oculto
  });
  it('a ficha antiga da m4 (culto oculto com done direto) avisa; a corrigida não', () => {
    const base = { id: 'culto', text: 'Destrua a Fortaleza do Passo', hidden: true } as const;
    const trig: ScenarioFile['triggers'] = [{ id: 'libertado', when: { time: { gte: 600 } }, then: [{ do: 'place', player: 1, building: 'fortress', at: { tc: 1, dx: 8 }, tag: 'x' }, { do: 'reveal', id: 'culto' }] }];
    expect(warnPaths(mk({ objectives: [{ ...base, done: { entity: { tag: 'fortaleza_culto' }, exists: false } }], triggers: trig }))).toEqual(['objectives[0].done']);
    expect(warnPaths(mk({ objectives: [{ ...base, done: { all: [{ fired: 'libertado' }, { entity: { tag: 'fortaleza_culto' }, exists: false }] } }], triggers: trig }))).toEqual([]);
  });
});
