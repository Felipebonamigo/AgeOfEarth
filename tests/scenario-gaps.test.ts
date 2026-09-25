// Lacunas do motor de cenários (docs/STORY.md §6): G0 registro da campanha, G1 objetivos ocultos avaliados, G2 fim de
// partida em cenário (eliminação sem vencedor global, koth/wonderHeld/kingAlive/alive), G3 dificuldade, G5 tags de grupo
// em entidades do mapa e EntityRef.pick, G7 lint (avisos) — e as correções do prólogo (m3: aliados no time 0; m1: derrota).
import { describe, it, expect, afterEach } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { buildingsOf, placeBuilding, spawnUnit, unitsOf } from '../src/core/sim/entities';
import { lintScenario, RESERVED_SCENARIO_IDS, scenarioErrors, validateScenario, type Action, type Condition, type ScenarioFile } from '../src/core/scenario/schema';
import { clearScenarioCache, compileScenario, gameConfigFor } from '../src/core/scenario/compile';
import { CAMPAIGN, PROLOGUE, SCENARIOS, campaignMission, campaignMissions, isCampaignMission, missionConfig, nextCampaignMission } from '../src/core/scenario/campaign';
import { CAMPAIGN_PLAN } from '../src/core/scenario/official';
import { removeAllOf, tagIds } from '../src/core/scenario/helpers';
import { isScenarioPuppet } from '../src/core/scenario/runner';
import { isEnemy } from '../src/core/sim/queries';
import { generateMap } from '../src/core/map/mapgen';
import { mapToData } from '../src/core/map/fixed';
import { ACHIEVEMENTS } from '../src/game/achievements';
import type { GameState } from '../src/core/types';
import type { TriggerCtx } from '../src/core/scenario/types';

function mk(over: Partial<ScenarioFile> = {}): ScenarioFile {
  return {
    format: 'aoe-scenario', version: 1, id: 'teste', title: { pt: 'Teste', en: 'Test' }, intro: ['olá'],
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

describe('G0: registro da campanha', () => {
  it('CAMPAIGN tem m1–m3 (TS, Ato I, selo Prólogo) e campaignMissions devolve os ScenarioDef na ordem', () => {
    expect(CAMPAIGN.map((e) => e.id)).toEqual(['m1_despertar', 'm2_cerco', 'm3_portal']);
    for (const e of CAMPAIGN.slice(0, 3)) { expect(e.act).toBe(1); expect(e.source).toBe('ts'); expect(e.prologue).toBe(true); }
    expect(campaignMissions().map((d) => d.id)).toEqual(CAMPAIGN.map((e) => e.id));
    expect(campaignMission('m2_cerco')).toBe(PROLOGUE[1]);
    expect(SCENARIOS).toBe(PROLOGUE);   // alias compatível
    expect(isCampaignMission('m3_portal')).toBe(true); expect(isCampaignMission('m4_caucaso')).toBe(false); expect(isCampaignMission('horde')).toBe(false);
    expect(nextCampaignMission('m1_despertar')?.id).toBe('m2_cerco'); expect(nextCampaignMission('m3_portal')).toBeUndefined();
    // todo id registrado está no plano oficial, na mesma ordem relativa
    const plan = CAMPAIGN_PLAN.map((m) => m.id);
    const idx = CAMPAIGN.map((e) => plan.indexOf(e.id));
    expect(idx.every((i) => i >= 0)).toBe(true); expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    for (const e of CAMPAIGN) expect(e.act).toBe(CAMPAIGN_PLAN.find((m) => m.id === e.id)!.act);
  });
  it('ids oficiais m1…m12 e horde são reservados para arquivos externos', () => {
    expect(RESERVED_SCENARIO_IDS).toContain('horde');
    for (const m of CAMPAIGN_PLAN) { expect(RESERVED_SCENARIO_IDS).toContain(m.id); expect(paths(mk({ id: m.id }))).toEqual(['id']); }
    expect(CAMPAIGN_PLAN.length).toBe(12);
    expect(CAMPAIGN_PLAN.filter((m) => m.act === 2).map((m) => m.id)).toEqual(['m5_itaca', 'm6_estatua', 'm7_aquiles', 'm8_oceano']);
  });
  it('missionConfig: IAs inimigas pela dificuldade e campaignDifficulty na config (mesma regra da aba Campanha)', () => {
    const hard = missionConfig(PROLOGUE[1], 'hard');
    expect(hard.scenario).toBe('m2_cerco'); expect(hard.campaignDifficulty).toBe('hard');
    expect(hard.players[1].difficulty).toBe('hard'); expect(hard.players[0].difficulty).toBe('normal');
    expect(missionConfig(PROLOGUE[1], 'easy').players[1].difficulty).toBe('easy');
    // m3: só o Culto (inimigo) muda; os Aliados de Poseidon (team 0, como Argos) ficam no Normal
    for (const d of ['easy', 'hard'] as const) { const c = missionConfig(PROLOGUE[2], d); expect(c.players[1].difficulty).toBe(d); expect(c.players[2].difficulty).toBe('normal'); }
  });
  it('conquistas: prólogo mantido, "Ato I/II/III completo" e "Campanha no Difícil" gerados do plano', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    for (const id of ['m1_despertar', 'm2_cerco', 'm3_portal', 'campaign_prologue', 'campaign_hard', 'campaign_act1', 'campaign_act2', 'campaign_act3', 'campaign_all_hard']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    const a1 = ACHIEVEMENTS.find((a) => a.id === 'campaign_act1')!;
    const s = createGame({ ...PROLOGUE[0].config, scenario: 'm1_despertar' });
    const c = (done: string[], hard: string[] = []) => ({ godsPlayed: [], hordeWaves: 0, missionsDone: done, missionsHard: hard });
    expect(a1.check(s, 0, c(['m1_despertar', 'm2_cerco', 'm3_portal']))).toBe(false);                 // Ato I = m1–m4
    expect(a1.check(s, 0, c(['m1_despertar', 'm2_cerco', 'm3_portal', 'm4_caucaso']))).toBe(true);
    const all = CAMPAIGN_PLAN.map((m) => m.id);
    expect(ACHIEVEMENTS.find((a) => a.id === 'campaign_all_hard')!.check(s, 0, c(all, all.slice(0, 11)))).toBe(false);
    expect(ACHIEVEMENTS.find((a) => a.id === 'campaign_all_hard')!.check(s, 0, c(all, all))).toBe(true);
  });
});

describe('G1: objetivos ocultos são avaliados', () => {
  it('um oculto com done é cumprido e revelado sem gatilho espelho', () => {
    const s = game(mk({
      objectives: [{ id: 'segredo', text: { pt: 'S', en: 'S' }, hidden: true, optional: true, done: { var: 'achou', gte: 1 } }],
      triggers: [{ id: 't', when: { time: { gte: 2 } }, then: [{ do: 'setVar', name: 'achou', value: 1 }] }],
    }));
    run(s, 2 * TICK_RATE);
    expect(s.scenario!.objectives.segredo).toBe('pending'); expect(s.scenario!.hidden.segredo).toBe(true);
    run(s, 2 * TICK_RATE);
    expect(s.scenario!.objectives.segredo).toBe('done'); expect(s.scenario!.hidden.segredo).toBe(false);
    expect(s.events.some((e) => e.type === 'objective' && e.data === 'done')).toBe(true);
  });
  it('prólogo inalterado: m3 não cumpre "Derrote Cronos" antes de Cronos surgir; m2 não vence antes dos reforços; m1 só conta o acampamento depois da Idade Clássica', () => {
    const m3 = createGame({ ...PROLOGUE[2].config, scenario: 'm3_portal' });
    run(m3, 5 * TICK_RATE);
    expect(m3.scenario!.objectives.cronus).toBe('pending'); expect(m3.scenario!.hidden.cronus).toBe(true);
    const m2 = createGame({ ...PROLOGUE[1].config, scenario: 'm2_cerco' });
    removeAllOf(m2, (o) => o === 1);   // Legião sem nada: o Centro Cívico original "caiu"
    run(m2, 3 * TICK_RATE);
    expect(m2.scenario!.objectives.counter).toBe('pending'); expect(m2.scenario!.outcome).toBe('playing');
    const m1 = createGame({ ...PROLOGUE[0].config, scenario: 'm1_despertar' });
    removeAllOf(m1, (o) => o === 1);   // acampamento destruído cedo
    run(m1, 3 * TICK_RATE);
    expect(m1.scenario!.objectives.camp).toBe('pending'); expect(m1.scenario!.hidden.camp).toBe(true);
    m1.players[0].age = 1; run(m1, 2 * TICK_RATE);   // Idade Clássica → reveal_camp → no segundo seguinte, cumprido
    expect(m1.scenario!.fired).toContain('reveal_camp'); expect(m1.scenario!.objectives.camp).toBe('done');
  });
});

describe('G2: fim de partida em cenário', () => {
  it('m1: quem perde tudo perde a missão (alive=false, evento de derrota, sem vencedor global)', () => {
    const s = createGame({ ...PROLOGUE[0].config, scenario: 'm1_despertar' });
    run(s, TICK_RATE);
    removeAllOf(s, (o) => o === 0);
    run(s, TICK_RATE);
    expect(s.players[0].alive).toBe(false);
    expect(s.events.some((e) => e.type === 'defeated' && e.player === 0)).toBe(true);
    expect(s.scenario!.outcome).toBe('defeat'); expect(s.gameOver).toBe(true); expect(s.winner).toBe(-2);
  });
  it('marionetes (puppet: true) não passam pela eliminação comum; IA inimiga é eliminada sem encerrar a partida', () => {
    const m1 = createGame({ ...PROLOGUE[0].config, scenario: 'm1_despertar' });
    expect(isScenarioPuppet(m1, 1)).toBe(true); expect(isScenarioPuppet(m1, 0)).toBe(false);
    removeAllOf(m1, (o) => o === 1);
    run(m1, 2 * TICK_RATE);
    // marionete sem nenhuma entidade: alive=false sem evento de derrota e sem encerrar a missão (quem decide é o roteiro)
    expect(m1.players[1].alive).toBe(false); expect(m1.scenario!.outcome).toBe('playing');
    expect(m1.events.some((e) => e.type === 'defeated' && e.player === 1)).toBe(false);
    const s = game(mk());
    act(s, [{ do: 'removeAll', player: 1 }]);
    run(s, 2 * TICK_RATE);
    expect(s.players[1].alive).toBe(false); expect(s.gameOver).toBe(false); expect(s.scenario!.outcome).toBe('playing');
    expect(cond(s, { alive: 1 })).toBe(false); expect(cond(s, { alive: 0 })).toBe(true); expect(cond(s, { alive: 'local' })).toBe(true);
    expect(cond(s, { value: { stat: 'alive', player: 1 }, eq: 0 })).toBe(true);
  });
  it('sem kit inicial, qualquer unidade mantém o jogador (hasStartKit)', () => {
    const s = game(mk({ config: { ...mk().config, startKit: [false, true] }, setup: [{ do: 'spawn', player: 0, units: ['hoplite'], at: { start: 0 } }] }));
    run(s, 3 * TICK_RATE);
    expect(buildingsOf(s, 0).length).toBe(0); expect(s.players[0].alive).toBe(true);
    act(s, [{ do: 'kill', entity: { player: 0, type: 'hoplite' } }]);
    run(s, 2 * TICK_RATE);
    expect(s.players[0].alive).toBe(false); expect(s.scenario!.outcome).toBe('defeat');
  });
  it('koth, wonderHeld e kingAlive', () => {
    const s = game(mk());
    expect(cond(s, { koth: { team: 0 }, eq: 0 })).toBe(true);                 // sem colina: 0
    s.koth = { x: 10, y: 10, team: 0, seconds: 130 };
    expect(cond(s, { koth: { team: 0 }, gte: 120 })).toBe(true);
    expect(cond(s, { koth: { team: 1 }, gte: 1 })).toBe(false);
    expect(cond(s, { wonderHeld: { player: 0 }, eq: 0 })).toBe(true);
    const t = buildingsOf(s, 0)[0];
    const w = placeBuilding(s, 0, 'wonder_zeus', t.tx + 8, t.ty + 8, true);
    s.tick += 200 * TICK_RATE; w.wonderStart = s.tick - 200 * TICK_RATE;
    expect(cond(s, { wonderHeld: { player: 0 }, gte: 200, lt: 201 })).toBe(true);
    expect(cond(s, { wonderHeld: { player: 'local' }, gte: 360 })).toBe(false);
    w.complete = false;
    expect(cond(s, { wonderHeld: { player: 0 }, eq: 0 })).toBe(true);          // obra não conta
    expect(cond(s, { kingAlive: 0 })).toBe(false);
    const k = spawnUnit(s, 0, 'basileus', t.x, t.y + 4);
    expect(cond(s, { kingAlive: 0 })).toBe(true);
    k.dead = true;
    expect(cond(s, { kingAlive: 0 })).toBe(false);
  });
  it('validação: koth/wonderHeld exigem comparação; kingAlive/alive exigem jogador', () => {
    expect(paths(mk({ victory: { koth: { team: 0 } } as unknown as Condition }))).toEqual(['victory']);
    expect(paths(mk({ victory: { koth: { team: 'a' }, gte: 1 } as unknown as Condition }))).toEqual(['victory.koth']);
    expect(paths(mk({ victory: { wonderHeld: { player: 7 }, gte: 360 } }))).toEqual(['victory.wonderHeld.player']);
    expect(paths(mk({ victory: { any: [{ kingAlive: 0 }, { alive: { team: 1 } }, { koth: { team: 0 }, gte: 120 }, { wonderHeld: { player: 'local' }, gte: 360 }] } }))).toEqual([]);
    expect(paths(mk({ victory: { kingAlive: 'x' } as unknown as Condition }))).toEqual(['victory.kingAlive']);
  });
});

describe('G3: dificuldade', () => {
  it('condição difficulty, Value { stat: difficulty } e spawn scaled', () => {
    const s = game(mk());
    expect(cond(s, { difficulty: 'normal' })).toBe(true);                     // ausente = normal
    expect(cond(s, { value: { stat: 'difficulty' }, eq: 1 })).toBe(true);
    const sizes: number[] = [];
    for (const d of ['easy', 'normal', 'hard'] as const) {
      s.config = { ...s.config, campaignDifficulty: d };
      expect(cond(s, { difficulty: d })).toBe(true);
      expect(cond(s, { difficulty: ['easy', 'hard'] })).toBe(d !== 'normal');
      expect(cond(s, { value: { stat: 'difficulty' }, eq: d === 'easy' ? 0 : d === 'hard' ? 2 : 1 })).toBe(true);
      const before = unitsOf(s, 1).length;
      act(s, [{ do: 'spawn', player: 1, units: ['hoplite', 'hoplite', 'hoplite', 'hoplite', 'hoplite', 'hoplite'], at: { tc: 1, dy: 5 }, scaled: true, tag: `g_${d}` }]);
      sizes.push(unitsOf(s, 1).length - before);
      expect(tagIds(s, `g_${d}`).length).toBe(sizes[sizes.length - 1]);
    }
    expect(sizes).toEqual([4, 6, 9]);
    const before = unitsOf(s, 1).length;
    act(s, [{ do: 'spawn', player: 1, units: ['hoplite', 'hoplite'], at: { tc: 1, dy: 5 } }]);   // sem scaled: não escala
    expect(unitsOf(s, 1).length - before).toBe(2);
  });
  it('validação de difficulty e scaled', () => {
    expect(paths(mk({ victory: { difficulty: 'brutal' } as unknown as Condition }))).toEqual(['victory.difficulty']);
    expect(paths(mk({ victory: { difficulty: [] } as unknown as Condition }))).toEqual(['victory.difficulty']);
    expect(paths(mk({ victory: { all: [{ difficulty: ['easy', 'hard'] }, { value: { stat: 'difficulty' }, gte: 1 }] } }))).toEqual([]);
    expect(paths(mk({ victory: { value: { stat: 'age' }, gte: 1 } as unknown as Condition }))).toEqual(['victory.value.player']);   // só difficulty dispensa player
    expect(paths(mk({ setup: [{ do: 'spawn', player: 0, units: ['hoplite'], at: { tc: 0 }, scaled: 'sim' } as unknown as Action] }))).toEqual(['setup[0].scaled']);
  });
});

describe('G5: tags de grupo', () => {
  function withMapGroup(): GameState {
    const m = generateMap(64, 64, 42, 2, 'continental');
    const data = mapToData(m, 'grupo');
    const s0 = m.starts[0];
    data.entities = [0, 1, 2].map((k) => ({ kind: 'unit' as const, type: 'hoplite', owner: 0, x: s0.x + 4 + k, y: s0.y + 4, tag: 'guarda' }));
    const f = mk({ map: { data } });
    expect(scenarioErrors(validateScenario(f))).toEqual([]);
    return game(f);
  }
  it('entidades do mapa com a mesma tag viram um grupo (#tag = primeiro, #tag[k]) e units/buildings { tag } contam o grupo', () => {
    const s = withMapGroup();
    const ids = tagIds(s, 'guarda');
    expect(ids.length).toBe(3);
    expect(s.scenario!.vars['#guarda']).toBe(ids[0]); expect(s.scenario!.vars['#guarda[2]']).toBe(ids[2]);
    expect(cond(s, { units: { player: 0, tag: 'guarda' }, eq: 3 })).toBe(true);
    act(s, [{ do: 'place', player: 0, building: 'house', at: { tc: 0, dx: 6 }, tag: 'casas' }, { do: 'place', player: 0, building: 'house', at: { tc: 0, dx: -6 }, tag: 'casas2' }]);
    expect(cond(s, { buildings: { tag: 'casas' }, eq: 1 })).toBe(true);
    expect(cond(s, { buildings: { player: 0, tag: 'casas2', type: 'house' }, eq: 1 })).toBe(true);
    expect(cond(s, { buildings: { tag: 'nada' }, eq: 0 })).toBe(true);
    // spawn com a mesma tag substitui o grupo (sem sobras do grupo antigo)
    act(s, [{ do: 'spawn', player: 0, units: ['toxotes'], at: { tc: 0, dy: 5 }, tag: 'guarda' }]);
    expect(tagIds(s, 'guarda').length).toBe(1);
    expect(cond(s, { units: { player: 0, tag: 'guarda', type: 'toxotes' }, eq: 1 })).toBe(true);
  });
  it("EntityRef { tag, pick: 'alive' } segue vivo com o primeiro morto; 'nearest' escolhe o mais perto", () => {
    const s = withMapGroup();
    const [a, b, c] = tagIds(s, 'guarda').map((id) => s.units.get(id)!);
    expect(cond(s, { entity: { tag: 'guarda' }, exists: true })).toBe(true);
    a.dead = true; run(s, 1);
    expect(cond(s, { entity: { tag: 'guarda' }, exists: false })).toBe(true);              // first = #tag (compatível)
    expect(cond(s, { entity: { tag: 'guarda', pick: 'alive' }, exists: true })).toBe(true);
    expect(cond(s, { units: { player: 0, tag: 'guarda' }, eq: 2 })).toBe(true);
    act(s, [{ do: 'storeEntity', var: 'v', entity: { tag: 'guarda', pick: 'alive' } }, { do: 'storeEntity', var: 'n', entity: { tag: 'guarda', pick: 'nearest', near: { at: [c.x + 0.1, c.y] } } }]);
    expect(s.scenario!.vars.v).toBe(b.id); expect(s.scenario!.vars.n).toBe(c.id);
    b.dead = true; c.dead = true; run(s, 1);
    expect(cond(s, { entity: { tag: 'guarda', pick: 'alive' }, exists: false })).toBe(true);
    expect(paths(mk({ victory: { entity: { tag: 'x', pick: 'nearest' }, exists: true } }))).toEqual(['victory.entity.near']);
    expect(paths(mk({ victory: { entity: { tag: 'x', pick: 'todos' } as unknown as { tag: string }, exists: true } }))).toEqual(['victory.entity.pick']);
  });
});

describe('G7: lint (avisos)', () => {
  const spawnLater: ScenarioFile['triggers'][number] = { id: 'chega', when: { time: { gte: 60 } }, then: [{ do: 'spawn', player: 1, units: ['minotaur'], at: { tc: 1 }, tag: 'fera' }] };
  it('avisos só aparecem com warnings: true (ou lintScenario) e têm level warn; erros continuam sem level', () => {
    const f = mk({ triggers: [spawnLater], victory: { entity: { tag: 'fera' }, exists: false } });
    expect(validateScenario(f)).toEqual([]);
    const all = validateScenario(f, { warnings: true });
    expect(all.length).toBe(1); expect(all[0].level).toBe('warn'); expect(all[0].path).toBe('victory.entity.tag');
    expect(scenarioErrors(all)).toEqual([]);
    const bad = validateScenario({ ...f, version: 2 }, { warnings: true });
    expect(bad.find((i) => i.path === 'version')!.level).toBeUndefined();
  });
  it('tag futura: avisa sem { fired } no mesmo all; aceita com a guarda, com tag do setup e em condições que não valem com o grupo ausente', () => {
    expect(warnPaths(mk({ triggers: [spawnLater], victory: { entity: { tag: 'fera' }, exists: false } }))).toEqual(['victory.entity.tag']);
    expect(warnPaths(mk({ triggers: [spawnLater], victory: { all: [{ fired: 'chega' }, { entity: { tag: 'fera' }, exists: false }] } }))).toEqual([]);
    expect(warnPaths(mk({ triggers: [spawnLater], victory: { any: [{ fired: 'chega' }, { entity: { tag: 'fera' }, exists: false }] } }))).toEqual(['victory.any[1].entity.tag']);
    expect(warnPaths(mk({ triggers: [spawnLater], victory: { units: { player: 1, tag: 'fera' }, eq: 0 } }))).toEqual(['victory.units.tag']);
    expect(warnPaths(mk({ triggers: [spawnLater], victory: { units: { player: 1, tag: 'fera' }, lt: 1 } }))).toEqual(['victory.units.tag']);
    expect(warnPaths(mk({ triggers: [spawnLater], victory: { units: { player: 1, tag: 'fera' }, gte: 1 } }))).toEqual([]);
    expect(warnPaths(mk({ triggers: [spawnLater], victory: { not: { entity: { tag: 'fera' }, exists: true } } }))).toEqual(['victory.not.entity.tag']);
    expect(warnPaths(mk({ triggers: [spawnLater], victory: { entity: { tag: 'fera' }, exists: true } }))).toEqual([]);
    expect(warnPaths(mk({ triggers: [spawnLater], objectives: [{ id: 'o', text: 'x', done: { all: [{ fired: 'chega' }, { all: [{ buildings: { tag: 'fera' }, eq: 0 }] }] } }], victory: { objective: 'o', is: 'done' } }))).toEqual([]);
    expect(warnPaths(mk({ setup: [{ do: 'spawn', player: 1, units: ['minotaur'], at: { tc: 1 }, tag: 'fera' }], victory: { entity: { tag: 'fera' }, exists: false } }))).toEqual([]);
    expect(warnPaths(mk({ triggers: [spawnLater, { id: 'perto', when: { units: { player: 0, near: { point: { entity: { tag: 'fera' } }, radius: 5 } }, eq: 0 }, then: [] }] }))).toEqual(['triggers[1].when.units.near.point']);
  });
  it('objetivo oculto que nunca aparece e falas longas ou sem en', () => {
    expect(warnPaths(mk({ objectives: [{ id: 'o', text: 'x', hidden: true }] }))).toEqual(['objectives[0]']);
    expect(warnPaths(mk({ objectives: [{ id: 'o', text: 'x', hidden: true }], triggers: [{ id: 't', when: { time: { gte: 5 } }, then: [{ do: 'reveal', id: 'o' }] }] }))).toEqual([]);
    expect(warnPaths(mk({ objectives: [{ id: 'o', text: 'x', hidden: true, done: { time: { gte: 5 } } }] }))).toEqual([]);
    const say = (text: Extract<Action, { do: 'say' }>['text']) => mk({ triggers: [{ id: 't', when: { time: { gte: 1 } }, then: [{ do: 'forEachPlayer', then: [{ do: 'say', speaker: 'X', text }] }] }] });
    expect(warnPaths(say({ pt: 'oi', en: 'hi' }))).toEqual([]);
    expect(warnPaths(say('oi'))).toEqual(['triggers[0].then[0].then[0].text']);
    expect(warnPaths(say({ pt: 'oi' }))).toEqual(['triggers[0].then[0].then[0].text.en']);
    expect(warnPaths(say({ pt: 'x'.repeat(201), en: 'y'.repeat(200) }))).toEqual(['triggers[0].then[0].then[0].text.pt']);
  });
});

describe('correções do prólogo', () => {
  it('m3: Aliados de Poseidon no time de Argos (team 0) e inimigos do Culto; a IA aliada nunca ataca Argos e combate o Culto', () => {
    const s = createGame({ ...PROLOGUE[2].config, scenario: 'm3_portal' });
    expect(s.players.map((p) => p.team)).toEqual([0, 1, 0]);
    expect(isEnemy(s, 0, 2)).toBe(false); expect(isEnemy(s, 2, 1)).toBe(true); expect(isEnemy(s, 0, 1)).toBe(true);
    let hitArgos = 0, hitCult = 0;
    for (let i = 0; i < 600 * TICK_RATE && !s.gameOver && hitCult === 0; i++) {   // o Culto fica na defesa nos primeiros minutos (M3_BALANCE)
      tick(s);
      for (const u of unitsOf(s, 2)) { if (u.targetId < 0) continue; const t = s.units.get(u.targetId) ?? s.buildings.get(u.targetId); if (t?.owner === 0) hitArgos++; if (t?.owner === 1) hitCult++; }
    }
    expect(hitArgos).toBe(0);
    expect(hitCult).toBeGreaterThan(0);
  });
});
