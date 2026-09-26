// Lacunas do motor de cenários (docs/STORY.md §6): G0 registro da campanha, G1 objetivos ocultos avaliados, G2 fim de
// partida em cenário (eliminação sem vencedor global, koth/wonderHeld/kingAlive/alive), G3 dificuldade, G5 tags de grupo
// em entidades do mapa e EntityRef.pick, G7 lint (avisos) — e as correções do prólogo (m3: aliados no time 0; m1: derrota).
// Ato III: G4 HUD e tempo relativo (progress { var }, countdown { fromVar }, Value { time }), G6 remove / order garrison /
// maxAge / forbid (comandos, IA e HUD), G8 nomes por entidade e de facção, G9 vida de chefe (hp, hpFloor, damage, heal).
// E G10 relíquias fixas (map.relics, Value { stat: relics }), G11 poderes por roteiro (set powers, powerUsed), G12
// habilidade de herói (ability), G13 autoria de abate (kills) e G17 contador de repeat (repeat { max }, vars['@id']).
import { describe, it, expect, afterEach } from 'vitest';
import { MAX_FIXED_RELICS, RELIC_SNAP_RADIUS, TERRAIN, TICK_RATE } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { buildingLimitOk, buildingsOf, placeBuilding, spawnUnit, unitsOf } from '../src/core/sim/entities';
import { lintScenario, RESERVED_SCENARIO_IDS, scenarioErrors, validateScenario, type Action, type Cmp, type Condition, type EntityRef, type ScenarioFile, type Value } from '../src/core/scenario/schema';
import { applyCommand, canAdvanceAge, canResearch, canTrain } from '../src/core/sim/commands';
import { isForbidden, maxAgeOf } from '../src/core/sim/restrictions';
import { applyDamage, killUnit } from '../src/core/sim/combat';
import { usePower } from '../src/core/sim/powers';
import { deserialize, serialize } from '../src/core/serialize';
import { stateHash } from '../src/core/net/hash';
import { entityDisplayName, playerDisplayName } from '../src/core/scenario/text';
import { scenarioHudHtml } from '../src/ui/scenario-hud';
import { setLocale } from '../src/i18n';
import { ABILITIES, AGES, MAJOR_GODS, MAX_AGE, UNITS } from '../src/core/data';
import { clearScenarioCache, compileScenario, gameConfigFor } from '../src/core/scenario/compile';
import { CAMPAIGN, PROLOGUE, SCENARIOS, campaignMission, campaignMissions, isCampaignMission, missionConfig, nextCampaignMission } from '../src/core/scenario/campaign';
import { CAMPAIGN_PLAN } from '../src/core/scenario/official';
import { military, removeAllOf, tagIds, townCenter } from '../src/core/scenario/helpers';
import { isScenarioPuppet, migrateScenarioLocks } from '../src/core/scenario/runner';
import { isEnemy } from '../src/core/sim/queries';
import { generateMap } from '../src/core/map/mapgen';
import { base64ToBytes, blankMap, bytesToBase64, canonicalize, mapHash, mapToData, resizeMapData, validateMap, type FixedMapData } from '../src/core/map/fixed';
import { isPassable, spiralSearch } from '../src/core/map/grid';
import { componentAt } from '../src/core/map/components';
import { ACHIEVEMENTS } from '../src/game/achievements';
import type { Forbid, GameConfig, GameState, Unit } from '../src/core/types';
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
  it('CAMPAIGN começa por m1–m3 (TS, Ato I, selo Prólogo), segue com as missões JSON e campaignMissions devolve os ScenarioDef na ordem', () => {
    expect(CAMPAIGN.slice(0, 3).map((e) => e.id)).toEqual(['m1_despertar', 'm2_cerco', 'm3_portal']);
    for (const e of CAMPAIGN.slice(0, 3)) { expect(e.act).toBe(1); expect(e.source).toBe('ts'); expect(e.prologue).toBe(true); }
    for (const e of CAMPAIGN.slice(3)) { expect(e.source).toBe('json'); expect(e.file?.id).toBe(e.id); expect(e.prologue).toBeFalsy(); }
    expect(campaignMissions().map((d) => d.id)).toEqual(CAMPAIGN.map((e) => e.id));
    expect(campaignMission('m2_cerco')).toBe(PROLOGUE[1]);
    expect(SCENARIOS).toBe(PROLOGUE);   // alias compatível
    expect(isCampaignMission('m3_portal')).toBe(true); expect(isCampaignMission('m99_inexistente')).toBe(false); expect(isCampaignMission('horde')).toBe(false);
    // id oficial sem arquivo registrado não é missão da campanha (vale para qualquer estado do registro)
    for (const m of CAMPAIGN_PLAN) expect(isCampaignMission(m.id)).toBe(CAMPAIGN.some((e) => e.id === m.id));
    expect(nextCampaignMission('m1_despertar')?.id).toBe('m2_cerco'); expect(nextCampaignMission('m3_portal')?.id).toBe(CAMPAIGN[3]?.id);
    expect(nextCampaignMission(CAMPAIGN[CAMPAIGN.length - 1].id)).toBeUndefined();
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
  it('conquistas de Idade exigem avançar: missão que já começa na Heroica não concede "Alcance a Idade Heroica"', () => {
    const heroic = ACHIEVEMENTS.find((a) => a.id === 'heroic')!, classical = ACHIEVEMENTS.find((a) => a.id === 'classical')!;
    const c = { godsPlayed: [], hordeWaves: 0, missionsDone: [], missionsHard: [] };
    const s = createGame({ ...PROLOGUE[0].config, startingAge: 2 });
    expect(s.players[0].age).toBe(2);
    expect(heroic.check(s, 0, c)).toBe(false); expect(classical.check(s, 0, c)).toBe(false);
    s.players[0].age = 3; expect(ACHIEVEMENTS.find((a) => a.id === 'mythic')!.check(s, 0, c)).toBe(true);   // avançou da Heroica à Mítica
    const g = createGame({ ...PROLOGUE[0].config }); g.players[0].age = 2;
    expect(heroic.check(g, 0, c)).toBe(true);
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

// ---------------------------------------------------------------------------------------------------------------
// G4 · G6 · G8 · G9 (Ato III): HUD e tempo relativo; remove, guarnição por roteiro e travas; nomes; vida de chefe
// ---------------------------------------------------------------------------------------------------------------

const P2 = (over: Partial<ScenarioFile['config']['players'][number]>[] = [{}, {}]): ScenarioFile['config']['players'] =>
  mk().config.players.map((p, i) => ({ ...p, ...(over[i] ?? {}) }));

describe('G4: HUD e tempo relativo', () => {
  it('Value { time: true } marca um instante com setVar e { time: { gte: { add: [ { var }, n ] } } } conta a partir dele', () => {
    const s = game(mk({ triggers: [
      { id: 'marca', when: { time: { gte: 3 } }, then: [{ do: 'setVar', name: 't0', value: { time: true } }] },
      { id: 'depois', when: { all: [{ fired: 'marca' }, { time: { gte: { add: [{ var: 't0' }, 4] } } }] }, then: [{ do: 'setVar', name: 'ok', value: { add: [{ time: true }, 0] } }] },
    ] }));
    run(s, 10 * TICK_RATE);
    expect(s.scenario!.vars.t0).toBe(3); expect(s.scenario!.vars.ok).toBe(7);
    expect(cond(s, { value: { time: true }, eq: 0 })).toBe(true);   // no contexto do teste (ctx.seconds = 0)
  });
  it('progress { var, max } (fixo ou { var }), com format e while; countdown { fromVar } só aparece depois da marca; rótulos PT/EN', () => {
    const f = mk({
      vars: { limite: 20 },
      triggers: [
        { id: 'marca', when: { time: { gte: 2 } }, then: [{ do: 'setVar', name: 't0', value: { time: true } }] },
        { id: 'conta', repeat: true, when: { time: { gte: 1 } }, then: [{ do: 'addVar', name: 'guarda', delta: 1 }] },
      ],
      hud: [
        { type: 'countdown', seconds: 60, fromVar: 't0', while: { time: { gte: 0 } }, label: { pt: 'Naus zarpam', en: 'Ships sail' } },
        { type: 'progress', var: 'guarda', max: { var: 'limite' }, format: 'count', label: { pt: 'Embarcados', en: 'Boarded' } },
        { type: 'progress', var: 'guarda', max: 10, format: 'time', while: { var: 'guarda', gte: 3 }, label: 'Vigília' },
        { type: 'progress', var: 'guarda', max: 8, label: 'Pct' },
      ],
    });
    expect(validateScenario(f)).toEqual([]); expect(lintScenario(f)).toEqual([]);
    const s = game(f);
    const def = compileScenario(f);
    run(s, 1 * TICK_RATE);
    let html = scenarioHudHtml(def, s);
    expect(html).not.toContain('Naus zarpam');       // fromVar ainda sem marca
    expect(html).not.toContain('Vigília');           // while falso
    expect(html).toContain('Embarcados: 1/20');
    run(s, 4 * TICK_RATE);
    html = scenarioHudHtml(def, s);
    expect(html).toMatch(/Naus zarpam: 0:5[6-7]/);  // 60 − (5 − 2)
    expect(html).toContain('Embarcados: 5/20'); expect(html).toContain('width:25%');
    expect(html).toContain('Vigília: 0:05 / 0:10');
    expect(html).toContain('Pct: 63%');
    const bar = def.hud![1];
    expect(bar.type === 'progress' && bar.entity(s)).toBe(5);
    expect(bar.type === 'progress' && bar.maxOf!(s)).toBe(20);
    setLocale('en');
    try { const en = scenarioHudHtml(compileScenario(f), s); expect(en).toMatch(/Ships sail: 0:5[6-7]/); expect(en).toContain('Boarded: 5/20'); }
    finally { setLocale('pt'); }
    // rótulo vindo de arquivo (ou de outro par) é escapado
    const evil = scenarioHudHtml(compileScenario(mk({ vars: { v: 1 }, hud: [{ type: 'progress', var: 'v', max: 2, label: '<img src=x onerror=alert(1)>' }] })), s);
    expect(evil).toContain('&lt;img'); expect(evil).not.toContain('<img');
  });
  it('validação e lint dos campos novos do HUD', () => {
    const lbl = 'x';
    expect(paths(mk({ hud: [{ type: 'progress', var: 'v', entity: { tag: 'g' }, max: 5, label: lbl } as unknown as NonNullable<ScenarioFile['hud']>[number]] }))).toEqual(['hud[0]']);
    expect(paths(mk({ hud: [{ type: 'progress', max: 5, label: lbl } as unknown as NonNullable<ScenarioFile['hud']>[number]] }))).toEqual(['hud[0]']);
    expect(paths(mk({ hud: [{ type: 'progress', var: 'v', max: 0, label: lbl }] }))).toEqual(['hud[0].max']);
    expect(paths(mk({ hud: [{ type: 'progress', var: 'v', max: { stat: 'age' }, label: lbl } as unknown as NonNullable<ScenarioFile['hud']>[number]] }))).toEqual(['hud[0].max.player']);
    expect(paths(mk({ hud: [{ type: 'progress', var: 'v', max: 5, label: lbl, format: 'barra' } as unknown as NonNullable<ScenarioFile['hud']>[number]] }))).toEqual(['hud[0].format']);
    expect(paths(mk({ hud: [{ type: 'progress', var: 'v', max: 5, label: lbl, while: { magia: 1 } as unknown as Condition }] }))).toEqual(['hud[0].while']);
    expect(paths(mk({ hud: [{ type: 'countdown', seconds: 9, while: { time: { gte: 0 } }, label: lbl, fromVar: 3 } as unknown as NonNullable<ScenarioFile['hud']>[number]] }))).toEqual(['hud[0].fromVar']);
    expect(paths(mk({ triggers: [{ id: 't', when: { time: { gte: 1 } }, then: [{ do: 'setVar', name: 'a', value: { time: 'agora' } as unknown as Value }] }] }))).toEqual(['triggers[0].then[0].value.time']);
    // lint: variável do HUD que ninguém escreve
    expect(warnPaths(mk({ hud: [{ type: 'countdown', seconds: 9, while: { time: { gte: 0 } }, label: lbl, fromVar: 'nunca' }, { type: 'progress', var: 'nada', max: 5, label: lbl }] }))).toEqual(['hud[0].fromVar', 'hud[1].var']);
    expect(warnPaths(mk({ vars: { nada: 0 }, triggers: [{ id: 't', when: { time: { gte: 1 } }, then: [{ do: 'setVar', name: 'nunca', value: { time: true } }] }],
      hud: [{ type: 'countdown', seconds: 9, while: { time: { gte: 0 } }, label: lbl, fromVar: 'nunca' }, { type: 'progress', var: 'nada', max: 5, label: lbl }] }))).toEqual([]);
    // fromVar: só setVar com { time: true } marca; declarada em vars, o valor inicial já vale como marca (aparece desde o início)
    const cd = { type: 'countdown' as const, seconds: 9, while: { time: { gte: 0 } }, label: lbl, fromVar: 't0' };
    const marca = (value: Value) => [{ id: 't', when: { time: { gte: 5 } }, then: [{ do: 'setVar' as const, name: 't0', value }] }];
    expect(warnPaths(mk({ triggers: marca({ add: [{ time: true }, 2] }), hud: [cd] }))).toEqual([]);
    expect(warnPaths(mk({ triggers: marca(3), hud: [cd] }))).toEqual(['hud[0].fromVar']);
    expect(warnPaths(mk({ triggers: [{ id: 't', when: { time: { gte: 5 } }, then: [{ do: 'addVar', name: 't0', delta: 1 }] }], hud: [cd] }))).toEqual(['hud[0].fromVar']);
    const declared = mk({ vars: { t0: 0 }, triggers: marca({ time: true }), hud: [cd] });
    expect(lintScenario(declared).map((w) => w.message)).toEqual([expect.stringContaining('declarada em vars')]);
    const s = game(declared);
    run(s, 2 * TICK_RATE);
    expect(scenarioHudHtml(compileScenario(declared), s)).toMatch(/x: 0:0[67]/);   // antes da marca (5 s): o comportamento que o aviso descreve
  });
});

describe('G6: remove, guarnição por roteiro, maxAge e forbid', () => {
  it('remove: some na hora, sem morte, abate, escombros nem estatística (kill gera morte)', () => {
    const s = game(mk());
    act(s, [
      { do: 'spawn', player: 0, units: ['hoplite', 'hoplite'], at: { tc: 0, dy: 5 }, tag: 'h' },
      { do: 'place', player: 0, building: 'house', at: { tc: 0, dx: 6 }, tag: 'casa' },
    ]);
    const [a, b] = tagIds(s, 'h').map((id) => s.units.get(id)!);
    const casa = s.buildings.get(s.scenario!.vars['#casa'])!;
    const pop = s.players[0].pop, losses = s.players[0].stats.losses, lost = s.players[0].stats.buildingsLost, fx = s.effects.length;
    act(s, [{ do: 'remove', entity: { tag: 'h' } }, { do: 'remove', entity: { tag: 'casa' } }]);
    expect(s.units.has(a.id)).toBe(false); expect(s.buildings.has(casa.id)).toBe(false);
    expect(s.players[0].pop).toBe(unitsOf(s, 0).reduce((n, u) => n + UNITS[u.type].pop, 0)); expect(s.players[0].pop).toBeLessThan(pop); expect(s.players[0].stats.losses).toBe(losses); expect(s.players[0].stats.buildingsLost).toBe(lost);
    expect(s.effects.length).toBe(fx);   // sem 'death' nem 'collapse'
    expect(s.map.buildingAt[casa.ty * s.map.w + casa.tx]).toBe(-1);
    act(s, [{ do: 'kill', entity: { tag: 'h', pick: 'alive' } }]);
    expect(b.dead).toBe(true); expect(s.players[0].stats.losses).toBe(losses + 1);
    expect(s.effects.some((e) => e.type === 'death')).toBe(true);
    expect(paths(mk({ setup: [{ do: 'remove', entity: { bogus: 1 } as unknown as EntityRef }] }))).toEqual(['setup[0].entity']);
  });
  it('remove de edifício reembolsa a fila (unidades e avanço de Idade), como a destruição', () => {
    const s = game(mk());
    const p = s.players[0];
    p.resources = { food: 5000, wood: 5000, gold: 5000, favor: 100, knowledge: 5000 };
    const tc = townCenter(s, 0)!;
    const bar = placeBuilding(s, 0, 'barracks', tc.tx, tc.ty + 7, true);
    expect(applyCommand(s, { type: 'train', player: 0, buildingId: bar.id, unit: 'hoplite' }).ok).toBe(true);
    expect(applyCommand(s, { type: 'train', player: 0, buildingId: bar.id, unit: 'hoplite' }).ok).toBe(true);
    expect(p.resources.food).toBeLessThan(5000);
    s.scenario!.vars['#bar'] = bar.id;
    act(s, [{ do: 'remove', entity: { var: '#bar' } }]);
    expect(s.buildings.has(bar.id)).toBe(false);
    expect(p.resources.food).toBe(5000); expect(p.resources.gold).toBe(5000);
    // avanço de Idade em andamento no Centro Cívico
    const req = AGES[1].requires.building; if (req) placeBuilding(s, 0, req, tc.tx - 7, tc.ty + 7, true);
    const age = { food: p.resources.food, gold: p.resources.gold };
    expect(applyCommand(s, { type: 'advanceAge', player: 0, buildingId: tc.id, minorGod: MAJOR_GODS.zeus.minorGods[0][0] }).ok).toBe(true);
    expect(tc.queue.some((q) => q.kind === 'age')).toBe(true); expect(p.resources.food).toBeLessThan(age.food);
    act(s, [{ do: 'remove', entity: { tc: 0 } }]);
    expect(p.resources.food).toBe(age.food); expect(p.resources.gold).toBe(age.gold);
  });
  it('order garrison / ungarrison (com alvo ou de onde estiver); guarnição em edifício inimigo não entra', () => {
    const s = game(mk());
    const tc = townCenter(s, 0)!;
    act(s, [
      { do: 'spawn', player: 0, units: ['hoplite', 'hoplite', 'toxotes'], at: { tc: 0, dy: 6 }, tag: 'g' },
      { do: 'order', units: { tag: 'g' }, order: { type: 'garrison', target: { tc: 0 } } },
    ]);
    run(s, 12 * TICK_RATE);
    const g = () => tagIds(s, 'g').map((id) => s.units.get(id)!);
    expect(g().every((u) => u.inside === tc.id)).toBe(true); expect(tc.garrison.length).toBe(3);
    act(s, [{ do: 'order', units: { player: 0, type: 'toxotes' }, order: { type: 'ungarrison', target: { tc: 0 } } }]);
    expect(g().filter((u) => u.inside === -1).map((u) => u.type)).toEqual(['toxotes']);
    act(s, [{ do: 'order', units: { tag: 'g' }, order: { type: 'ungarrison' } }]);   // sem alvo: sai de onde estiver
    expect(g().every((u) => u.inside === -1)).toBe(true); expect(tc.garrison.length).toBe(0);
    act(s, [{ do: 'order', units: { tag: 'g' }, order: { type: 'attackMove', at: { tc: 1 } } }]);
    run(s, 2);
    act(s, [{ do: 'order', units: { tag: 'g' }, order: { type: 'garrison', target: { tc: 1 } } }]);   // edifício inimigo: a ordem atual segue (como o comando)
    expect(g().map((u) => u.order?.type)).toEqual(['attackMove', 'attackMove', 'attackMove']);
    run(s, 4 * TICK_RATE);
    expect(g().every((u) => u.inside === -1)).toBe(true);
    const vs = unitsOf(s, 0).filter((u) => u.type === 'villager');
    const busy = () => vs.filter((u) => u.state === 'gather' || u.state === 'return').length;
    const before = busy(); expect(before).toBeGreaterThan(0);
    act(s, [{ do: 'order', units: { player: 0, type: 'villager' }, order: { type: 'garrison', target: { tc: 1 } } }]);
    expect(busy()).toBe(before);
    expect(paths(mk({ setup: [{ do: 'order', units: { tag: 'g' }, order: { type: 'garrison' } as unknown as { type: 'garrison'; target: EntityRef } }] }))).toEqual(['setup[0].order.target']);
    // campo trocado: 'at' em ordem por alvo (ou ungarrison) e 'target' em ordem por ponto são recusados
    const bad = (o: unknown) => paths(mk({ setup: [{ do: 'order', units: { tag: 'g' }, order: o as { type: 'ungarrison' } }] }));
    expect(bad({ type: 'ungarrison', at: { tc: 1, dy: 4 } })).toEqual(['setup[0].order.at']);
    expect(bad({ type: 'garrison', target: { tc: 0 }, at: { tc: 0 } })).toEqual(['setup[0].order.at']);
    expect(bad({ type: 'move', at: { tc: 0 }, target: { tc: 0 } })).toEqual(['setup[0].order.target']);
    expect(paths(mk({ setup: [{ do: 'order', units: { tag: 'g' }, order: { type: 'ungarrison', target: { tc: 9 } } }] }))).toEqual(['setup[0].order.target.tc']);
    expect(paths(mk({ setup: [{ do: 'order', units: { tag: 'g' }, order: { type: 'ungarrison' } }] }))).toEqual([]);
  });
  it('maxAge e forbid (globais e por jogador) recusam os comandos com "Proibido nesta missão"; o roteiro ainda pode pôr', () => {
    const f = mk({ config: { ...mk().config, startingAge: 1, maxAge: 1, forbid: { buildings: ['temple'], units: ['hoplite'], techs: ['harvest1'] },
      players: P2([{ forbid: { units: ['toxotes'] } }, { maxAge: 3 }]) } });
    expect(validateScenario(f)).toEqual([]);
    const s = game(f);
    const [p0, p1] = s.players;
    expect(maxAgeOf(s, 0)).toBe(1); expect(maxAgeOf(s, 1)).toBe(3);
    expect(isForbidden(s, 0, 'units', 'toxotes')).toBe(true); expect(isForbidden(s, 1, 'units', 'toxotes')).toBe(false);   // por jogador
    expect(isForbidden(s, 1, 'units', 'hoplite')).toBe(true);                                                              // global vale para todos
    const rich = { food: 9000, wood: 9000, gold: 9000, favor: 900, knowledge: 9000 };
    p0.resources = { ...rich }; p1.resources = { ...rich };
    const tc = townCenter(s, 0)!;
    placeBuilding(s, 0, 'academy', tc.tx + 7, tc.ty, true); p0.techs.push('civic1', 'science1');   // requisitos da Heroica cumpridos
    const forbidden = { ok: false, reason: 'Proibido nesta missão' };
    expect(canAdvanceAge(s, p0, tc)).toEqual(forbidden);
    expect(applyCommand(s, { type: 'advanceAge', player: 0, buildingId: tc.id, minorGod: MAJOR_GODS.zeus.minorGods[1][0] })).toEqual(forbidden);
    expect(tc.queue.length).toBe(0);
    expect(buildingLimitOk(s, p0, 'temple')).toEqual(forbidden); expect(buildingLimitOk(s, p1, 'temple')).toEqual(forbidden);
    const v = unitsOf(s, 0).find((u) => u.type === 'villager')!;
    expect(applyCommand(s, { type: 'build', player: 0, ids: [v.id], building: 'temple', tx: tc.tx - 8, ty: tc.ty })).toEqual(forbidden);
    expect(p0.resources.wood).toBe(9000);
    const bar = placeBuilding(s, 0, 'barracks', tc.tx, tc.ty + 7, true);   // o roteiro/mapa ainda põe edifícios (trava só de comandos)
    expect(canTrain(s, p0, bar, 'hoplite')).toEqual(forbidden); expect(canTrain(s, p0, bar, 'toxotes')).toEqual(forbidden);
    expect(applyCommand(s, { type: 'train', player: 0, buildingId: bar.id, unit: 'hoplite' })).toEqual(forbidden);
    const gran = placeBuilding(s, 0, 'granary', tc.tx - 6, tc.ty + 6, true);
    expect(canResearch(s, p0, gran, 'harvest1')).toEqual(forbidden);
    expect(applyCommand(s, { type: 'research', player: 0, buildingId: gran.id, tech: 'harvest1' })).toEqual(forbidden);
    setLocale('en');
    try { expect(buildingLimitOk(s, p0, 'temple').reason).toBe('Forbidden in this mission'); } finally { setLocale('pt'); }
    // save/load: as travas viajam na config
    const s2 = deserialize(serialize(s));
    expect(buildingLimitOk(s2, s2.players[0], 'temple')).toEqual(forbidden); expect(maxAgeOf(s2, 0)).toBe(1); expect(maxAgeOf(s2, 1)).toBe(3);
    // config sem travas: nada muda
    const free = game(mk());
    expect(maxAgeOf(free, 0)).toBe(MAX_AGE); expect(buildingLimitOk(free, free.players[0], 'temple').ok).toBe(true);
  });
  it('a IA respeita maxAge e forbid: não avança, não constrói, não treina e não pesquisa o proibido (e segue jogando)', () => {
    const base = (players: ScenarioFile['config']['players']) => mk({ map: { gen: { mapSize: 'small', seed: 777 } }, config: { ...mk().config, startingAge: 1,
      startingResources: { food: 6000, wood: 6000, gold: 6000, favor: 400, knowledge: 3000 }, players } });
    const ai = { isAI: true, difficulty: 'hard' as const, team: 1 };
    const control = game(base(P2([{}, ai])));
    const locked = game(base(P2([{}, { ...ai, maxAge: 1, forbid: { buildings: ['stable', 'academy'], units: ['hoplite'], techs: ['phalanx', 'wheel'] } }])));
    let ageQueued = false;
    for (let i = 0; i < 6 * 60 * TICK_RATE; i++) {
      tick(control); tick(locked);
      if (i % TICK_RATE === 0 && buildingsOf(locked, 1).some((b) => b.queue.some((q) => q.kind === 'age'))) ageQueued = true;
    }
    const has = (s: GameState, type: string) => buildingsOf(s, 1).some((b) => b.type === type);
    const trained = (s: GameState, type: string) => unitsOf(s, 1).some((u) => u.type === type) || buildingsOf(s, 1).some((b) => b.queue.some((q) => q.kind === 'unit' && q.id === type));
    // sem travas, a mesma IA faz tudo isso em 6 min
    expect(control.players[1].age).toBeGreaterThanOrEqual(2);
    expect(has(control, 'stable')).toBe(true); expect(has(control, 'academy')).toBe(true);
    expect(trained(control, 'hoplite')).toBe(true);
    expect(control.players[1].techs).toEqual(expect.arrayContaining(['phalanx', 'wheel']));
    // com travas: nada do proibido, e a IA continua treinando e pesquisando o resto
    expect(locked.players[1].age).toBe(1); expect(ageQueued).toBe(false);
    expect(has(locked, 'stable')).toBe(false); expect(has(locked, 'academy')).toBe(false);
    expect(trained(locked, 'hoplite')).toBe(false);
    expect(locked.players[1].techs).not.toContain('phalanx'); expect(locked.players[1].techs).not.toContain('wheel');
    expect(unitsOf(locked, 1).filter((u) => military(u)).length).toBeGreaterThan(5);
    expect(locked.players[1].techs.length).toBeGreaterThan(0);
  }, 120_000);
  it('save ou replay de missão oficial gravado antes das travas recebe as da missão atual (Portal dos Titãs segue proibido)', () => {
    const forbidden = { ok: false, reason: 'Proibido nesta missão' };
    for (const id of ['m4_caucaso', 'm5_itaca', 'm6_estatua']) {
      const cfg = missionConfig(campaignMission(id)!, 'normal');
      const s = createGame(cfg);
      const o = JSON.parse(serialize(s)) as { config: GameConfig };
      delete o.config.forbid; delete o.config.maxAge; o.config.players.forEach((p) => { delete p.forbid; delete p.maxAge; });   // save de antes do G6
      const old = deserialize(JSON.stringify(o));
      expect(old.config.forbid).toEqual(cfg.forbid); expect(old.config.players.map((p) => p.forbid)).toEqual(cfg.players.map((p) => p.forbid));
      const gated = cfg.players.findIndex((_, i) => isForbidden(s, i, 'buildings', 'titan_gate'));
      expect(gated).toBeGreaterThanOrEqual(0);
      old.players[gated].age = 4;
      expect(buildingLimitOk(old, old.players[gated], 'titan_gate')).toEqual(forbidden);
      expect(migrateScenarioLocks(o.config).forbid).toEqual(cfg.forbid);   // o replay (Session.replay) usa a mesma migração
    }
    // config com trava, cenário em JSON e missão sem travas: a mesma config
    const m4 = missionConfig(campaignMission('m4_caucaso')!, 'normal');
    const custom = { ...m4, forbid: { units: ['hoplite'] } };
    expect(migrateScenarioLocks(custom)).toBe(custom);
    const json = gameConfigFor(mk()); expect(migrateScenarioLocks(json)).toBe(json);
    const m7 = missionConfig(campaignMission('m7_aquiles')!, 'normal'); expect(migrateScenarioLocks(m7)).toBe(m7);
  });
  it('validação de maxAge e forbid', () => {
    const cfg = mk().config;
    expect(paths(mk({ config: { ...cfg, maxAge: 7 } }))).toEqual(['config.maxAge']);
    expect(paths(mk({ config: { ...cfg, maxAge: 1.5 } }))).toEqual(['config.maxAge']);
    expect(paths(mk({ config: { ...cfg, startingAge: 3, maxAge: 2 } }))).toEqual(['config.maxAge']);
    expect(paths(mk({ config: { ...cfg, forbid: { buildings: ['castelo'], units: 'hoplite', magia: [] } as unknown as Forbid } }))).toEqual(['config.forbid.buildings[0]', 'config.forbid.units', 'config.forbid.magia']);
    expect(paths(mk({ config: { ...cfg, forbid: ['temple'] as unknown as Forbid } }))).toEqual(['config.forbid']);
    expect(paths(mk({ config: { ...cfg, players: P2([{ maxAge: -1 }, { forbid: { techs: ['nada'], units: ['hoplite'] } }]) } }))).toEqual(['config.players[0].maxAge', 'config.players[1].forbid.techs[0]']);
    expect(paths(mk({ config: { ...cfg, startingAge: 2, players: P2([{ maxAge: 1 }, {}]) } }))).toEqual(['config.players[0].maxAge']);
    expect(paths(mk({ config: { ...cfg, maxAge: 4, forbid: { buildings: ['titan_gate'], units: ['cronus'], techs: ['harvest1'] }, players: P2([{ maxAge: 0 }, {}]) } }))).toEqual([]);
  });
});

describe('G8: nomes por entidade e de facção', () => {
  it('spawn/place { name } grava { pt, en } na entidade; o HUD resolve no idioma atual; string vira { pt }', () => {
    const s = game(mk());
    act(s, [
      { do: 'spawn', player: 1, units: ['nemean_lion'], at: { tc: 1, dy: 5 }, tag: 'licaon', name: { pt: 'Lícaon, o Rei-Lobo', en: 'Lycaon, the Wolf-King' } },
      { do: 'place', player: 0, building: 'tower', at: { tc: 0, dx: 6 }, tag: 'corrente', name: 'Corrente' },
      { do: 'spawn', player: 0, units: ['hoplite'], at: { tc: 0, dy: 5 }, tag: 'anon' },
    ]);
    const lic = s.units.get(s.scenario!.vars['#licaon'])!, cor = s.buildings.get(s.scenario!.vars['#corrente'])!, anon = s.units.get(s.scenario!.vars['#anon'])!;
    expect(lic.displayName).toEqual({ pt: 'Lícaon, o Rei-Lobo', en: 'Lycaon, the Wolf-King' });
    expect(cor.displayName).toEqual({ pt: 'Corrente' }); expect(anon.displayName).toBeUndefined();
    expect(entityDisplayName(lic)).toBe('Lícaon, o Rei-Lobo'); expect(entityDisplayName(anon)).toBe(UNITS.hoplite.name);
    setLocale('en');
    try { expect(entityDisplayName(lic)).toBe('Lycaon, the Wolf-King'); expect(entityDisplayName(cor)).toBe('Corrente'); expect(entityDisplayName(anon)).toBe('Hoplite'); }
    finally { setLocale('pt'); }
    // save/load: o nome viaja com a entidade; valor malformado é descartado (padrão = sem nome)
    const s2 = deserialize(serialize(s));
    expect(s2.units.get(lic.id)!.displayName).toEqual(lic.displayName); expect(s2.buildings.get(cor.id)!.displayName).toEqual({ pt: 'Corrente' });
    const o = JSON.parse(serialize(s)); o.units.find((u: { id: number }) => u.id === lic.id).displayName = 5; o.units.find((u: { id: number }) => u.id === anon.id).hpFloor = 'x';
    const s3 = deserialize(JSON.stringify(o));
    expect(s3.units.get(lic.id)!.displayName).toBeUndefined(); expect('hpFloor' in s3.units.get(anon.id)!).toBe(false);
  });
  it('nome de facção { pt, en } em config.players[i].name: texto do idioma ao criar a config e nameText para o HUD', () => {
    const f = mk({ config: { ...mk().config, players: P2([{ name: { pt: 'Argos', en: 'Argos' } }, { name: { pt: 'Culto de Cronos', en: 'Cult of Cronus' } }]) } });
    expect(validateScenario(f)).toEqual([]);
    const s = game(f);
    expect(s.players[1].name).toBe('Culto de Cronos'); expect(s.config.players[1].nameText).toEqual({ pt: 'Culto de Cronos', en: 'Cult of Cronus' });
    expect(playerDisplayName(s, 1)).toBe('Culto de Cronos');
    setLocale('en');
    try {
      expect(playerDisplayName(s, 1)).toBe('Cult of Cronus');
      expect(createGame(gameConfigFor(f)).players[1].name).toBe('Cult of Cronus');
    } finally { setLocale('pt'); }
    expect(playerDisplayName(game(mk()), 1)).toBe('B');   // nome simples: como antes
  });
  it('validação e lint de name', () => {
    expect(paths(mk({ config: { ...mk().config, players: P2([{ name: 5 as unknown as string }, { name: { en: 'x' } as unknown as string }]) } }))).toEqual(['config.players[0].name', 'config.players[1].name']);
    expect(paths(mk({ setup: [{ do: 'spawn', player: 0, units: ['hoplite'], at: { tc: 0 }, name: 7 as unknown as string }, { do: 'place', player: 0, building: 'house', at: { tc: 0 }, name: { pt: 1 } as unknown as string }] }))).toEqual(['setup[0].name', 'setup[1].name']);
    expect(warnPaths(mk({ setup: [{ do: 'spawn', player: 0, units: ['hoplite'], at: { tc: 0 }, name: 'Sem inglês' }, { do: 'place', player: 0, building: 'house', at: { tc: 0 }, name: { pt: 'Só pt' } }, { do: 'spawn', player: 0, units: ['hoplite'], at: { tc: 0 }, name: { pt: 'a', en: 'b' } }] })))
      .toEqual(['setup[0].name', 'setup[1].name.en']);
  });
});

describe('G9: vida de chefe', () => {
  const boss = (s: GameState) => { act(s, [{ do: 'spawn', player: 1, units: ['minotaur'], at: { tc: 1, dy: 6 }, tag: 'chefe' }]); return s.units.get(s.scenario!.vars['#chefe'])!; };
  it('condição { entity, hp } compara a fração da vida (unidade e edifício); ausente = falso', () => {
    const s = game(mk());
    const b = boss(s);
    b.hp = b.maxHp * 0.4;
    expect(cond(s, { entity: { tag: 'chefe' }, hp: { lte: 0.5 } })).toBe(true);
    expect(cond(s, { entity: { tag: 'chefe' }, hp: { gt: 0.5 } })).toBe(false);
    expect(cond(s, { entity: { tag: 'chefe' }, exists: true, hp: { gte: 0.4, lt: 0.41 } })).toBe(true);
    expect(cond(s, { entity: { tag: 'nada' }, hp: { lte: 1 } })).toBe(false);
    expect(cond(s, { not: { entity: { tag: 'nada' }, hp: { lte: 1 } } })).toBe(true);
    const tc = townCenter(s, 0)!; tc.hp = tc.maxHp * 0.25;
    expect(cond(s, { entity: { tc: 0 }, hp: { lt: 0.3 } })).toBe(true);
    expect(cond(s, { entity: { tc: 0 }, hp: { lt: { var: 'limiar' } } })).toBe(false);   // valor dinâmico (var ausente = 0)
  });
  it('hpFloor: dano, morte instantânea de inimigo e atrito param no piso; abaixo do piso não cura; value 0 tira; kill do roteiro mata', () => {
    const s = game(mk());
    const b = boss(s);
    act(s, [{ do: 'hpFloor', entity: { tag: 'chefe' }, value: 0.3 }]);
    expect(b.hpFloor).toBe(0.3);
    applyDamage(s, b, 99999, 0);
    expect(b.dead).toBe(false); expect(b.hp).toBeCloseTo(b.maxHp * 0.3);
    killUnit(s, b, 0);   // morte instantânea de inimigo (Raio, Maldição, atrito): só até o piso
    expect(b.dead).toBe(false); expect(b.hp).toBeCloseTo(b.maxHp * 0.3);
    b.hp = b.maxHp;
    expect(usePower(s, s.players[0], 'bolt', undefined, undefined, b.id).ok).toBe(true);   // o Raio de Zeus mata qualquer não-Titã… menos com piso
    expect(b.dead).toBe(false); expect(b.hp).toBeCloseTo(b.maxHp * 0.3);
    b.hp = b.maxHp * 0.1;   // já abaixo do piso: o piso não cura, só impede descer
    applyDamage(s, b, 50, 0);
    expect(b.hp).toBeCloseTo(b.maxHp * 0.1);
    // no jogo de verdade (flechas do Centro Cívico, hoplitas e atrito do território inimigo): para no piso
    act(s, [{ do: 'hpFloor', entity: { tag: 'chefe' }, value: 0.9 }]);
    b.hp = b.maxHp * 0.9 + 5;
    const tc = townCenter(s, 0)!; b.x = b.px = tc.x + 3; b.y = b.py = tc.y + 3; b.path = null; b.stance = 'passive'; b.state = 'idle';
    act(s, [{ do: 'spawn', player: 0, units: ['hoplite', 'hoplite', 'hoplite', 'hoplite'], at: { tc: 0, dy: 4 }, tag: 'caca' }, { do: 'order', units: { tag: 'caca' }, order: { type: 'attack', target: { tag: 'chefe' } } }]);
    run(s, 8 * TICK_RATE);
    expect(b.dead).toBe(false); expect(b.hp).toBeGreaterThanOrEqual(b.maxHp * 0.9 - 1e-6); expect(b.hp).toBeLessThan(b.maxHp * 0.9 + 1);
    act(s, [{ do: 'hpFloor', entity: { tag: 'chefe' }, value: 0 }]);
    expect(b.hpFloor).toBeUndefined();
    applyDamage(s, b, 99999, 0);
    expect(b.dead).toBe(true);
    // kill do roteiro atravessa o piso; edifício também tem piso
    const c = boss(s); act(s, [{ do: 'hpFloor', entity: { tag: 'chefe' }, value: 0.5 }, { do: 'kill', entity: { tag: 'chefe' } }]);
    expect(c.dead).toBe(true);
    act(s, [{ do: 'hpFloor', entity: { tc: 1 }, value: 0.5 }]);
    const etc = townCenter(s, 1)!; applyDamage(s, etc, 1e6, 0);
    expect(etc.dead).toBe(false); expect(etc.hp).toBeCloseTo(etc.maxHp * 0.5);
  }, 60_000);
  it('hpFloor, damage, heal e remove valem para a entidade do EntityRef (como kill): numa tag de grupo, a primeira', () => {
    const s = game(mk());
    act(s, [{ do: 'spawn', player: 1, units: ['minotaur', 'minotaur'], at: { tc: 1, dy: 6 }, tag: 'par' }, { do: 'hpFloor', entity: { tag: 'par' }, value: 0.5 }]);
    const [a, b] = tagIds(s, 'par').map((id) => s.units.get(id)!);
    expect(a.hpFloor).toBe(0.5); expect(b.hpFloor).toBeUndefined();
    act(s, [{ do: 'hpFloor', entity: { tag: 'par', pick: 'nearest', near: { at: [b.x, b.y] } }, value: 0.2 }]);
    expect(b.hpFloor).toBe(0.2);
  });
  it('{ hp: { lte: f } } vale com o chefe no piso f mesmo quando maxHp·f/maxHp sai um ulp acima de f', () => {
    const s = game(mk());
    const b = boss(s);
    b.maxHp = 154; b.hp = 154;   // hipeu com Criação de Cavalos: 130.9/154 = 0.8500000000000001
    act(s, [{ do: 'hpFloor', entity: { tag: 'chefe' }, value: 0.85 }]);
    applyDamage(s, b, 1e6, 0);
    expect(b.dead).toBe(false); expect(b.hp / b.maxHp).toBeGreaterThan(0.85);
    expect(cond(s, { entity: { tag: 'chefe' }, hp: { lte: 0.85 } })).toBe(true);
    expect(cond(s, { entity: { tag: 'chefe' }, hp: { gte: 0.85 } })).toBe(true);
    expect(cond(s, { entity: { tag: 'chefe' }, hp: { lt: 0.85 } })).toBe(false);
  });
  it('damage/heal: amount ou fraction; dano sem autor (sem abate creditado), respeita o piso; cura até maxHp', () => {
    const s = game(mk());
    const b = boss(s); const max = b.maxHp;
    act(s, [{ do: 'damage', entity: { tag: 'chefe' }, amount: 30 }]);
    expect(b.hp).toBe(max - 30);
    act(s, [{ do: 'damage', entity: { tag: 'chefe' }, fraction: 0.5 }]);
    expect(b.hp).toBeCloseTo(max * 0.5 - 30);
    act(s, [{ do: 'heal', entity: { tag: 'chefe' }, amount: 10 }]);
    expect(b.hp).toBeCloseTo(max * 0.5 - 20);
    act(s, [{ do: 'heal', entity: { tag: 'chefe' }, fraction: 1 }]);
    expect(b.hp).toBe(max);
    act(s, [{ do: 'hpFloor', entity: { tag: 'chefe' }, value: 0.25 }, { do: 'damage', entity: { tag: 'chefe' }, fraction: 1 }]);
    expect(b.dead).toBe(false); expect(b.hp).toBeCloseTo(max * 0.25);
    const kills = s.players.map((p) => p.stats.kills);
    act(s, [{ do: 'hpFloor', entity: { tag: 'chefe' }, value: 0 }, { do: 'damage', entity: { tag: 'chefe' }, amount: 1e6 }]);
    expect(b.dead).toBe(true); expect(s.players.map((p) => p.stats.kills)).toEqual(kills);
    expect(s.effects.some((e) => e.type === 'death')).toBe(true);
    const tc = townCenter(s, 1)!; const h0 = tc.hp;
    act(s, [{ do: 'damage', entity: { tc: 1 }, amount: 100 }, { do: 'heal', entity: { tc: 1 }, amount: 40 }]);
    expect(tc.hp).toBe(h0 - 60);
  });
  it('validação: frações entre 0 e 1, hp exige a entidade, amount xor fraction', () => {
    const E = { tag: 'x' };
    expect(paths(mk({ victory: { entity: E, hp: { lte: 1.5 } } }))).toEqual(['victory.hp.lte']);
    expect(paths(mk({ victory: { entity: E, exists: false, hp: { lte: 0.5 } } }))).toEqual(['victory.hp']);
    expect(paths(mk({ victory: { entity: E } as unknown as Condition }))).toEqual(['victory.exists']);
    expect(paths(mk({ victory: { entity: E, hp: {} } }))).toEqual(['victory.hp']);
    expect(paths(mk({ victory: { entity: E, hp: 0.5 } as unknown as Condition }))).toEqual(['victory.hp']);
    expect(paths(mk({ victory: { all: [{ entity: E, hp: { lte: 0.5, gt: { var: 'v' } } }, { entity: E, exists: true, hp: { eq: 0 } }] } }))).toEqual([]);
    expect(paths(mk({ setup: [{ do: 'hpFloor', entity: E, value: 1.2 }, { do: 'hpFloor', entity: { var: 3 } as unknown as EntityRef, value: 0.3 }] }))).toEqual(['setup[0].value', 'setup[1].entity.var']);
    expect(paths(mk({ setup: [
      { do: 'damage', entity: E, amount: 5, fraction: 0.5 }, { do: 'heal', entity: E } as unknown as Action,
      { do: 'damage', entity: E, amount: -1 }, { do: 'heal', entity: E, fraction: 0 }, { do: 'damage', entity: E, fraction: 1 },
    ] }))).toEqual(['setup[0]', 'setup[1]', 'setup[2].amount', 'setup[3].fraction']);
    // lint: hp exige a entidade, então não vale com o grupo ausente; sob `not`, vale — e pede a guarda { fired }
    const later: ScenarioFile['triggers'][number] = { id: 'chega', when: { time: { gte: 60 } }, then: [{ do: 'spawn', player: 1, units: ['minotaur'], at: { tc: 1 }, tag: 'fera' }] };
    expect(warnPaths(mk({ triggers: [later], victory: { entity: { tag: 'fera' }, hp: { lte: 0.5 } } }))).toEqual([]);
    expect(warnPaths(mk({ triggers: [later], victory: { not: { entity: { tag: 'fera' }, hp: { gt: 0.5 } } } }))).toEqual(['victory.not.entity.tag']);
  });
  it('determinismo: piso, dano, cura, remove e guarnição roteirizados dão o mesmo estado em duas partidas; serialize guarda o piso', () => {
    const f = mk({
      setup: [
        { do: 'spawn', player: 1, units: ['minotaur'], at: { tc: 0, dy: 7 }, tag: 'chefe', name: { pt: 'Chefe', en: 'Boss' } }, { do: 'hpFloor', entity: { tag: 'chefe' }, value: 0.4 },
        { do: 'spawn', player: 1, units: ['minotaur'], at: { tc: 1, dy: 7 }, tag: 'extra' },
      ],
      triggers: [
        { id: 'fere', repeat: true, when: { every: { seconds: 3 } }, then: [{ do: 'damage', entity: { tag: 'chefe' }, fraction: 0.2 }, { do: 'heal', entity: { tc: 0 }, amount: 5 }] },
        { id: 'abriga', when: { time: { gte: 5 } }, then: [{ do: 'order', units: { player: 0, type: 'villager' }, order: { type: 'garrison', target: { tc: 0 } } }] },
        { id: 'solta', when: { time: { gte: 20 } }, then: [{ do: 'order', units: { player: 0, type: 'villager' }, order: { type: 'ungarrison' } }, { do: 'remove', entity: { tag: 'extra' } }] },
      ],
    });
    const a = game(f), b = game(f);
    run(a, 30 * TICK_RATE); run(b, 30 * TICK_RATE);
    expect(stateHash(a)).toBe(stateHash(b));
    expect(a.units.has(a.scenario!.vars['#extra'])).toBe(false);
    const boss = a.units.get(a.scenario!.vars['#chefe'])!;
    expect(boss.dead).toBe(false); expect(boss.hpFloor).toBe(0.4); expect(boss.hp).toBeGreaterThanOrEqual(boss.maxHp * 0.4 - 1e-6);
    const c = deserialize(serialize(a));
    expect(c.units.get(boss.id)!.hpFloor).toBe(0.4); expect(c.units.get(boss.id)!.displayName).toEqual({ pt: 'Chefe', en: 'Boss' });
    run(a, 5 * TICK_RATE); run(c, 5 * TICK_RATE);
    expect(stateHash(c)).toBe(stateHash(a));
  }, 60_000);
});

// ---------------------------------------------------------------------------------------------------------------
// G10 · G11 · G12 · G13 · G17: relíquias fixas, poderes por roteiro, habilidade de herói, autoria de abate, contador de repeat
// ---------------------------------------------------------------------------------------------------------------

describe('G10: relíquias em cenário', () => {
  /** Mapa do mk() (pequeno, semente 12345, 2 jogadores): terra livre a ~12 tiles do início 0 e a árvore mais próxima dele. */
  function spots(): { land: [number, number]; tree: [number, number] } {
    const s = game(mk()); const m = s.map; const s0 = m.starts[0];
    const home = spiralSearch(s0.x, s0.y + 3, 4, (a, b) => isPassable(m, a, b))!;
    const region = componentAt(m, home.x, home.y);
    const land = spiralSearch(s0.x + 12, s0.y + 6, 12, (a, b) => isPassable(m, a, b) && componentAt(m, a, b) === region)!;
    let tree: { x: number; y: number } | null = null; let bd = Infinity;
    for (const n of m.nodes.values()) { if (n.type !== 'tree') continue; const d = (n.x - s0.x) ** 2 + (n.y - s0.y) ** 2; if (d < bd) { bd = d; tree = n; } }
    return { land: [land.x, land.y], tree: [tree!.x, tree!.y] };
  }
  it('map.relics (lista) no mapa gerado: posição fixa em terra livre; sobre um recurso vai para a terra mais próxima; false = nenhuma', () => {
    const { land, tree } = spots();
    const f = mk({ map: { gen: { mapSize: 'small', seed: 12345 }, relics: [land, tree] } });
    expect(validateScenario(f)).toEqual([]);
    expect(gameConfigFor(f).relics).toEqual([land, tree]);
    const s = game(f);
    expect(s.relics.length).toBe(2);
    expect([s.relics[0].x, s.relics[0].y]).toEqual([land[0] + 0.5, land[1] + 0.5]);
    const r1 = s.relics[1];
    expect([r1.x, r1.y]).not.toEqual([tree[0] + 0.5, tree[1] + 0.5]);
    expect(isPassable(s.map, Math.floor(r1.x), Math.floor(r1.y))).toBe(true);
    expect((r1.x - tree[0] - 0.5) ** 2 + (r1.y - tree[1] - 0.5) ** 2).toBeLessThanOrEqual(RELIC_SNAP_RADIUS ** 2 * 2);
    // o lint avisa a posição que não é terra livre no mapa gerado (e diz para onde ela vai)
    const w = lintScenario(f);
    expect(w.map((i) => i.path)).toEqual(['map.relics[1]']); expect(w[0].message).toContain(`[${Math.floor(r1.x)}, ${Math.floor(r1.y)}]`);
    expect(game(mk({ map: { gen: { mapSize: 'small', seed: 12345 }, relics: false } })).relics.length).toBe(0);
    expect(game(mk()).relics.length).toBeGreaterThan(2);   // padrão: sorteio pela semente (como antes)
    // determinismo e save: mesmas posições em outra partida e depois de salvar/carregar
    const s2 = game(f);
    expect(s2.relics).toEqual(s.relics);
    const s3 = deserialize(serialize(s));
    expect(s3.relics).toEqual(s.relics); expect(s3.config.relics).toEqual([land, tree]);
  });
  it('Value { stat: relics }: relíquias guardadas nos Templos do jogador (o herói recolhe e guarda)', () => {
    const { land } = spots();
    const s = game(mk({ map: { gen: { mapSize: 'small', seed: 12345 }, relics: [land] } }));
    act(s, [
      { do: 'place', player: 0, building: 'temple', at: { tc: 0, dx: 6, dy: -4 }, tag: 'templo' },
      { do: 'spawn', player: 0, units: ['heracles'], at: { at: [land[0] + 0.5, land[1] + 0.5] }, tag: 'heroi' },
    ]);
    const h = s.units.get(s.scenario!.vars['#heroi'])!, temple = s.buildings.get(s.scenario!.vars['#templo'])!;
    h.x = h.px = land[0] + 0.5; h.y = h.py = land[1] + 0.5;
    expect(cond(s, { value: { stat: 'relics', player: 0 }, eq: 0 })).toBe(true);
    run(s, 2 * TICK_RATE);
    expect(s.relics[0].carrier).toBe(h.id);
    h.x = h.px = temple.x + temple.w / 2 + 0.5; h.y = h.py = temple.y; h.path = null; h.state = 'idle';
    run(s, 2 * TICK_RATE);
    expect(s.relics[0].templeId).toBe(temple.id);
    expect(cond(s, { value: { stat: 'relics', player: 0 }, eq: 1 })).toBe(true);
    expect(cond(s, { value: { stat: 'relics', player: 'local' }, gte: 1 })).toBe(true);
    expect(cond(s, { value: { stat: 'relics', player: 1 }, eq: 0 })).toBe(true);
  });
  it('validação de map.relics no cenário: formato, limites do mapa gerado, repetidas; no mapa fixo, só em data.relics', () => {
    const gen = (relics: unknown) => mk({ map: { gen: { mapSize: 'small', seed: 1 }, relics } as unknown as ScenarioFile['map'] });
    expect(paths(gen([[-1, 3], [80, 5], [1.5, 2], [4, 4], [4, 4], [3]]))).toEqual(['map.relics[0]', 'map.relics[1]', 'map.relics[2]', 'map.relics[4]', 'map.relics[5]']);
    expect(paths(gen('sim'))).toEqual(['map.relics']);
    expect(paths(gen(Array.from({ length: MAX_FIXED_RELICS + 1 }, (_, i) => [i, 1])))).toEqual(['map.relics']);
    expect(paths(gen(true))).toEqual([]); expect(paths(gen([[79, 79]]))).toEqual([]);
    const data = mapToData(generateMap(64, 64, 42, 2, 'continental'), 'x');
    expect(paths(mk({ map: { data, relics: [[1, 1]] } as unknown as ScenarioFile['map'] }))).toEqual(['map.relics']);
    expect(paths(mk({ victory: { value: { stat: 'relics' }, gte: 1 } as unknown as Condition }))).toEqual(['victory.value.player']);
  });
  it('mapa fixo: validateMap (relicOut, relicBlocked, relicUnreachable, relicsCount), createGame, canonicalize, mapHash e redimensionar', () => {
    const base = blankMap(64, 64, 2, 7);
    const t = base64ToBytes(base.terrain, 64 * 64);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) t[(30 + dy) * 64 + 30 + dx] = TERRAIN.MOUNTAIN;   // bolsão em (30, 30)
    t[40 * 64 + 12] = TERRAIN.WATER;
    const data: FixedMapData = { ...base, startKit: false, terrain: bytesToBase64(t), entities: [{ kind: 'building', type: 'tower', owner: 0, x: 20, y: 12 }] };
    const codes = (relics: FixedMapData['relics']) => validateMap({ ...data, relics }).filter((i) => i.code.startsWith('relic')).map((i) => [i.code, i.x, i.y]);
    expect(codes([[24, 24], [5, 58]])).toEqual([]);
    expect(codes([[12, 40], [20, 12], [30, 30], [64, 3], [-1, 0]])).toEqual([['relicBlocked', 12, 40], ['relicBlocked', 20, 12], ['relicUnreachable', 30, 30], ['relicOut', 64, 3], ['relicOut', -1, 0]]);
    expect(validateMap({ ...data, relics: Array.from({ length: MAX_FIXED_RELICS + 1 }, (_, i) => [i + 1, 50] as [number, number]) }).some((i) => i.code === 'relicsCount' && i.level === 'error')).toBe(true);
    const f2 = mk({ config: { ...mk().config, startKit: false }, map: { data: { ...data, relics: [[30, 30]] } } });
    expect(paths(f2)).toEqual(['map.data']);   // o cenário recusa o mapa com relíquia inalcançável
    expect(paths({ ...f2, map: { data: { ...data, relics: [[24, 24]] } } })).toEqual([]);
    // createGame: posições exatas, na ordem do arquivo
    const players: GameConfig['players'] = [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal' }];
    const s = createGame({ seed: 3, mapSize: 'small', players, map: { ...data, relics: [[24, 24], [5, 58]] } });
    expect(s.relics.map((r) => [r.x, r.y])).toEqual([[24.5, 24.5], [5.5, 58.5]]);
    // canonicalize: lista na ordem do arquivo; vazia = nenhuma; o hash muda com a lista e não muda para quem não a usa
    expect(canonicalize({ ...data, relics: [[5, 58], [24, 24]] }).relics).toEqual([[5, 58], [24, 24]]);
    expect(canonicalize({ ...data, relics: [] }).relics).toBe(false);
    const h = (relics?: FixedMapData['relics']) => mapHash({ ...data, relics });
    expect(h([[24, 24]])).not.toBe(h(true)); expect(h([[24, 24]])).not.toBe(h([[24, 25]])); expect(h([[24, 24]])).toBe(h([[24, 24]]));
    expect(h(undefined)).toBe(h(true)); expect(h([])).toBe(h(false));
    // redimensionar desloca as relíquias e corta as que saem do mapa
    const grow = resizeMapData({ ...data, relics: [[24, 24], [5, 58]] }, 64, 80, 's');   // cresce para o norte: tudo desce 16
    expect(grow.data.relics).toEqual([[24, 40], [5, 74]]); expect(grow.report.relics).toBe(0);
    const shrink = resizeMapData({ ...data, relics: [[24, 24], [5, 58]] }, 64, 56, 'n');   // encolhe pelo sul: [5, 58] sai
    expect(shrink.data.relics).toEqual([[24, 24]]); expect(shrink.report.relics).toBe(1);
    expect(resizeMapData({ ...data, relics: [[5, 58]] }, 64, 56, 'n').data.relics).toBe(false);
  });
});

describe('G11: poderes por roteiro', () => {
  const powerIds = (s: GameState, p = 0) => s.players[p].powers.map((x) => `${x.id}${x.used ? '*' : ''}`);
  const use = (s: GameState, power: string, p = 0) => applyCommand(s, { type: 'power', player: p, power }).ok;
  it('set powers: remove tira (até o do deus maior), add concede sem repetir, reset devolve o uso; o comando segue a lista', () => {
    const s = game(mk());
    expect(powerIds(s)).toEqual(['bolt']);
    act(s, [{ do: 'set', player: 0, powers: { remove: ['bolt'] } }]);
    expect(powerIds(s)).toEqual([]);
    const tgt = spawnUnit(s, 1, 'hoplite', townCenter(s, 0)!.x, townCenter(s, 0)!.y + 5);
    expect(usePower(s, s.players[0], 'bolt', undefined, undefined, tgt.id).ok).toBe(false);   // sem o Raio: "poder indisponível"
    act(s, [{ do: 'set', player: 0, powers: { add: ['bolt', 'oracle', 'oracle'] } }]);
    expect(powerIds(s)).toEqual(['bolt', 'oracle']);
    expect(use(s, 'oracle')).toBe(true); expect(use(s, 'oracle')).toBe(false);
    expect(powerIds(s)).toEqual(['bolt', 'oracle*']);
    act(s, [{ do: 'set', player: 0, powers: { reset: ['oracle', 'curse'] } }]);   // reset não concede quem não tem
    expect(powerIds(s)).toEqual(['bolt', 'oracle']);
    expect(use(s, 'oracle')).toBe(true);
    act(s, [{ do: 'set', player: 0, powers: { remove: ['oracle'], add: ['oracle'] } }]);   // tirar e dar de novo também repõe
    expect(powerIds(s)).toEqual(['bolt', 'oracle']);
    act(s, [{ do: 'set', player: 1, powers: { add: ['ceasefire'] } }]);
    expect(powerIds(s, 1)).toEqual([MAJOR_GODS.hades.power, 'ceasefire']);
  });
  it('powerUsed conta os usos desde o início (reset/remove não zeram); sem comparação, ao menos 1; o evento traz o id', () => {
    const s = game(mk());
    act(s, [{ do: 'set', player: 0, powers: { add: ['oracle'] } }]);
    const used = (c: Partial<Cmp> = {}) => cond(s, { powerUsed: { player: 0, id: 'oracle' }, ...c });
    expect(used()).toBe(false); expect(used({ eq: 0 })).toBe(true);
    expect(use(s, 'oracle')).toBe(true);
    expect(used()).toBe(true); expect(used({ gte: 2 })).toBe(false);
    expect(s.events.filter((e) => e.type === 'powerUsed').map((e) => e.data)).toEqual(['oracle']);
    act(s, [{ do: 'set', player: 0, powers: { reset: ['oracle'] } }]);
    expect(used()).toBe(true);   // reset devolve o uso, mas o uso já aconteceu
    expect(use(s, 'oracle')).toBe(true);
    expect(used({ gte: 2 })).toBe(true); expect(used({ eq: 2 })).toBe(true);
    act(s, [{ do: 'set', player: 0, powers: { remove: ['oracle'] } }]);
    expect(used({ eq: 2 })).toBe(true);
    expect(cond(s, { powerUsed: { player: 1, id: 'oracle' } })).toBe(false);
    expect(cond(s, { powerUsed: { player: 'local', id: 'oracle' }, gte: 2 })).toBe(true);
    // save: o registro viaja; save de antes de G11 (sem o campo) começa vazio
    expect(deserialize(serialize(s)).scenario!.powerUses).toEqual({ '0:oracle': 2 });
    const o = JSON.parse(serialize(s)); delete o.scenario.powerUses; delete o.scenario.kills;
    const old = deserialize(JSON.stringify(o));
    expect(old.scenario!.powerUses).toEqual({}); expect(old.scenario!.kills).toEqual({ byPlayer: {}, byEntity: {} });
    const bad = JSON.parse(serialize(s)); bad.scenario.powerUses = { '0:oracle': 'x', '0:bolt': 1.5, '1:lure': 3 }; bad.scenario.kills = 7;
    const b2 = deserialize(JSON.stringify(bad));
    expect(b2.scenario!.powerUses).toEqual({ '1:lure': 3 }); expect(b2.scenario!.kills).toEqual({ byPlayer: {}, byEntity: {} });
    // fora de cenário, usar poder não cria registro
    const plain = createGame({ seed: 5, mapSize: 'small', players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal' }] });
    plain.players[0].powers.push({ id: 'oracle', used: false });
    expect(applyCommand(plain, { type: 'power', player: 0, power: 'oracle' }).ok).toBe(true); expect(plain.scenario).toBeUndefined();
  });
  it('um gatilho repõe o Raio depois do 1º uso (o "2º Raio" da m11) e a IA usa o poder reposto', () => {
    const s = game(mk({
      config: { ...mk().config, players: P2([{}, { god: 'zeus' }]) },
      triggers: [{ id: 'repoe', when: { powerUsed: { player: 1, id: 'bolt' } }, then: [{ do: 'set', player: 1, powers: { reset: ['bolt'] } }] }],
    }));
    const hero = (n: number) => spawnUnit(s, 0, n % 2 ? 'odysseus' : 'jason', townCenter(s, 1)!.x + 4 + n, townCenter(s, 1)!.y + 4);
    hero(0);
    let t = 0;
    while (!cond(s, { powerUsed: { player: 1, id: 'bolt' } }) && t++ < 60 * TICK_RATE) tick(s);
    expect(cond(s, { powerUsed: { player: 1, id: 'bolt' } })).toBe(true);
    run(s, 2 * TICK_RATE);
    expect(s.scenario!.fired).toContain('repoe'); expect(s.players[1].powers.find((p) => p.id === 'bolt')!.used).toBe(false);
    hero(1);
    t = 0;
    while (!cond(s, { powerUsed: { player: 1, id: 'bolt' }, gte: 2 }) && t++ < 60 * TICK_RATE) tick(s);
    expect(cond(s, { powerUsed: { player: 1, id: 'bolt' }, eq: 2 })).toBe(true);
  }, 60_000);
  it('validação de set powers e powerUsed', () => {
    expect(paths(mk({ setup: [{ do: 'set', player: 0, powers: { add: ['bolt'], remove: ['raio'], reset: 'oracle', tirar: [] } as unknown as { add: string[] } }] })))
      .toEqual(['setup[0].powers.remove[0]', 'setup[0].powers.reset', 'setup[0].powers.tirar']);
    expect(paths(mk({ setup: [{ do: 'set', player: 0, powers: ['bolt'] as unknown as { add: string[] } }] }))).toEqual(['setup[0].powers']);
    expect(paths(mk({ victory: { powerUsed: { player: 0, id: 'raio' } } }))).toEqual(['victory.powerUsed.id']);
    expect(paths(mk({ victory: { powerUsed: { player: 9, id: 'bolt' }, gte: 1 } }))).toEqual(['victory.powerUsed.player']);
    expect(paths(mk({ victory: { powerUsed: 'bolt' } as unknown as Condition }))).toEqual(['victory.powerUsed']);
    expect(paths(mk({ victory: { any: [{ powerUsed: { player: 'local', id: 'bolt' } }, { powerUsed: { player: 0, id: 'oracle' }, gte: { var: 'n' } }] } }))).toEqual([]);
  });
});

describe('G12: habilidade de herói por roteiro', () => {
  const hero = (s: GameState, type: string, player = 0, tag = 'heroi') => {
    act(s, [{ do: 'spawn', player, units: [type], at: { tc: player, dy: 5 }, tag }]);
    return s.units.get(s.scenario!.vars['#' + tag])!;
  };
  it('ability: usa a habilidade pelo caminho do comando (efeito e recarga); na recarga, guarnecido ou sem habilidade, nada acontece', () => {
    const s = game(mk());
    const o = hero(s, 'odysseus');
    const ally = spawnUnit(s, 0, 'hoplite', o.x + 1, o.y);
    run(s, 1);   // o raio da Astúcia usa o hash espacial montado no início do tick (como o comando)
    act(s, [{ do: 'ability', unit: { tag: 'heroi' } }]);
    const cd = ABILITIES.cunning.cooldown * TICK_RATE;
    expect(o.abilityReadyAt).toBe(s.tick + cd); expect(o.buffSpeed).toBe(ABILITIES.cunning.power); expect(ally.buffSpeed).toBe(ABILITIES.cunning.power);
    expect(o.buffUntil).toBe(s.tick + ABILITIES.cunning.duration * TICK_RATE);
    run(s, 5);
    act(s, [{ do: 'ability', unit: { tag: 'heroi' } }]);   // em recarga: recusado como o comando
    expect(o.abilityReadyAt).toBe(s.tick - 5 + cd);
    o.abilityReadyAt = s.tick;   // recarga acabou
    act(s, [{ do: 'ability', unit: { tag: 'heroi' } }]);
    expect(o.abilityReadyAt).toBe(s.tick + cd);
    // sem habilidade (hoplita), edifício, entidade ausente: nada
    act(s, [{ do: 'ability', unit: { player: 0, type: 'hoplite' } }, { do: 'ability', unit: { tc: 0 } }, { do: 'ability', unit: { tag: 'nada' } }]);
    expect(ally.abilityReadyAt).toBe(0);
    // guarnecido: recusado
    const h = hero(s, 'heracles', 0, 'hera');
    act(s, [{ do: 'order', units: { tag: 'hera' }, order: { type: 'garrison', target: { tc: 0 } } }]);
    run(s, 5 * TICK_RATE);
    expect(h.inside).toBe(townCenter(s, 0)!.id);
    act(s, [{ do: 'ability', unit: { tag: 'hera' } }]);
    expect(h.chargeUntil).toBe(0); expect(h.abilityReadyAt).toBe(0);
  });
  it('marionete usa a habilidade (Fúria de Aquiles) e o alvo: inimigo = atacar, aliado = ir até ele, ponto = atacar-mover; só quando usa', () => {
    const f = mk({ config: { ...mk().config, players: [...mk().config.players, { name: 'M', god: 'poseidon', isAI: false, difficulty: 'normal', team: 1, puppet: true }] } });
    const s = game(f);
    act(s, [{ do: 'spawn', player: 2, units: ['achilles'], at: { tc: 1, dy: 6 }, tag: 'aquiles' }]);
    const a = s.units.get(s.scenario!.vars['#aquiles'])!;
    act(s, [{ do: 'ability', unit: { tag: 'aquiles' }, target: { tc: 0 } }]);   // { tc } sem deslocamento = o Centro Cívico (inimigo)
    expect(a.buffHaste).toBe(ABILITIES.fury.power); expect(a.buffUntil).toBeGreaterThan(s.tick);
    expect(a.state).toBe('attack'); expect(a.targetId).toBe(townCenter(s, 0)!.id);
    const pt = { tc: 0, dx: 3, dy: 3 } as const;
    act(s, [{ do: 'ability', unit: { tag: 'aquiles' }, target: pt }]);   // em recarga: a ordem também não muda
    expect(a.state).toBe('attack');
    a.abilityReadyAt = s.tick;
    act(s, [{ do: 'ability', unit: { tag: 'aquiles' }, target: pt }]);
    const tc0 = townCenter(s, 0)!;
    expect(a.state).toBe('attackMove'); expect([a.tx, a.ty]).toEqual([tc0.x + 3, tc0.y + 3]);
    a.abilityReadyAt = s.tick;
    act(s, [{ do: 'ability', unit: { tag: 'aquiles' }, target: { tc: 1 } }]);   // aliado (time 1): vai até ele
    expect(a.state).toBe('move'); expect([a.tx, a.ty]).toEqual([townCenter(s, 1)!.x, townCenter(s, 1)!.y]);
    expect(s.events.some((e) => e.type === 'ability' && e.player === 2)).toBe(true);
  });
  it('validação de ability', () => {
    expect(paths(mk({ setup: [{ do: 'ability' } as unknown as Action] }))).toEqual(['setup[0].unit']);
    expect(paths(mk({ setup: [{ do: 'ability', unit: { tag: 'h' }, target: { at: [1] } } as unknown as Action] }))).toEqual(['setup[0].target.at']);
    expect(paths(mk({ setup: [{ do: 'ability', unit: { tag: 'h' }, target: { algo: 1 } } as unknown as Action] }))).toEqual(['setup[0].target']);
    expect(paths(mk({ setup: [
      { do: 'ability', unit: { tag: 'h' } }, { do: 'ability', unit: { player: 0, type: 'achilles' }, target: { tag: 'x' } },
      { do: 'ability', unit: { tag: 'h' }, target: { tc: 1 } }, { do: 'ability', unit: { tag: 'h' }, target: { tc: 1, dy: 4 } },
      { do: 'ability', unit: { tag: 'h' }, target: { entity: { tag: 'x' }, dx: 2 } }, { do: 'ability', unit: { tag: 'h' }, target: { start: 1 } },
    ] }))).toEqual([]);
  });
});

describe('G13: autoria de abate', () => {
  function arena() {
    const s = game(mk());
    const tc1 = townCenter(s, 1)!;
    act(s, [
      { do: 'spawn', player: 0, units: ['perseus'], at: { tc: 1, dx: -8, dy: 8 }, tag: 'perseu' },
      { do: 'spawn', player: 1, units: ['minotaur'], at: { tc: 1, dx: -7, dy: 8 }, tag: 'alvo' },
    ]);
    const p = s.units.get(s.scenario!.vars['#perseu'])!, m = s.units.get(s.scenario!.vars['#alvo'])!;
    return { s, p, m, tc1 };
  }
  it('kills: abate em combate registra jogador, tipo da vítima e a entidade autora (by.tag), mesmo depois que ela morre', () => {
    const { s, p, m } = arena();
    m.hp = 1; m.stance = 'passive';
    act(s, [{ do: 'order', units: { tag: 'perseu' }, order: { type: 'attack', target: { tag: 'alvo' } } }]);
    for (let i = 0; i < 10 * TICK_RATE && !m.dead; i++) tick(s);
    expect(m.dead).toBe(true);
    expect(cond(s, { kills: { player: 0, type: 'minotaur', by: { tag: 'perseu' } }, gte: 1 })).toBe(true);
    expect(cond(s, { kills: { player: 0 }, eq: 1 })).toBe(true);
    expect(cond(s, { kills: { player: 0, type: 'hoplite' }, eq: 0 })).toBe(true);
    expect(cond(s, { kills: { player: 1 }, eq: 0 })).toBe(true);
    expect(s.scenario!.kills.byEntity[`0:${p.id}`]).toEqual({ minotaur: 1 });
    act(s, [{ do: 'kill', entity: { tag: 'perseu' } }]);   // o autor morto continua no grupo da tag
    expect(cond(s, { kills: { player: 0, by: { tag: 'perseu' } }, eq: 1 })).toBe(true);
    expect(cond(s, { kills: { player: 0, by: { tag: 'nada' } }, eq: 0 })).toBe(true);
  });
  it('poderes contam para o jogador e não para a tag; kill/damage do roteiro e dispensar não contam; edifício derrubado conta', () => {
    const { s, p, tc1 } = arena();
    const h = spawnUnit(s, 1, 'hoplite', tc1.x - 6, tc1.y + 10);
    expect(usePower(s, s.players[0], 'bolt', undefined, undefined, h.id).ok).toBe(true);
    expect(h.dead).toBe(true);
    expect(cond(s, { kills: { player: 0, type: 'hoplite' }, eq: 1 })).toBe(true);
    expect(cond(s, { kills: { player: 0, type: 'hoplite', by: { tag: 'perseu' } }, eq: 0 })).toBe(true);
    act(s, [{ do: 'kill', entity: { tag: 'alvo' } }]);
    const v = spawnUnit(s, 1, 'villager', tc1.x - 5, tc1.y + 10);
    act(s, [{ do: 'damage', entity: { player: 1, type: 'villager', pick: 'nearest', near: { at: [v.x, v.y] } }, amount: 1e6 }]);
    const own = spawnUnit(s, 0, 'villager', tc1.x - 4, tc1.y + 12);
    applyCommand(s, { type: 'delete', player: 0, ids: [own.id] });
    expect(cond(s, { kills: { player: 0 }, eq: 1 })).toBe(true);
    expect(cond(s, { kills: { player: 1 }, eq: 0 })).toBe(true);
    // edifício: dano de Perseu que derruba uma Casa inimiga
    act(s, [{ do: 'place', player: 1, building: 'house', at: { tc: 1, dx: -8, dy: 4 }, tag: 'casa' }]);
    const casa = s.buildings.get(s.scenario!.vars['#casa'])!;
    applyDamage(s, casa, 1e6, 0, p);
    expect(casa.dead).toBe(true);
    expect(cond(s, { kills: { player: 0, type: 'house', by: { tag: 'perseu' } }, eq: 1 })).toBe(true);
    expect(cond(s, { kills: { player: 0, type: ['house', 'hoplite'] }, eq: 2 })).toBe(true);
    // fora de cenário, nada é registrado
    const plain = createGame({ seed: 5, mapSize: 'small', players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal' }] });
    const x = spawnUnit(plain, 1, 'hoplite', 20, 20);
    applyDamage(plain, x, 1e6, 0);
    expect(x.dead).toBe(true); expect(plain.scenario).toBeUndefined();
  });
  it('validação e lint de kills', () => {
    expect(paths(mk({ victory: { kills: { player: 0 } } as unknown as Condition }))).toEqual(['victory']);
    expect(paths(mk({ victory: { kills: { player: 0, type: ['cronus', 'x'], by: { tag: 'p', extra: 1 } }, gte: 1 } as unknown as Condition }))).toEqual(['victory.kills.type[1]', 'victory.kills.by']);
    expect(paths(mk({ victory: { kills: { type: 'cronus' }, gte: 1 } as unknown as Condition }))).toEqual(['victory.kills.player']);
    expect(paths(mk({ victory: { kills: 'x', gte: 1 } as unknown as Condition }))).toEqual(['victory.kills']);
    expect(paths(mk({ victory: { all: [{ kills: { player: 0, type: 'cronus', by: { tag: 'perseu' } }, gte: 1 }, { kills: { player: 'local', type: 'town_center' }, gte: { var: 'n' } }] } }))).toEqual([]);
    // tag futura: { by: { tag } } com eq 0 vale com o grupo ausente
    const later: ScenarioFile['triggers'][number] = { id: 'chega', when: { time: { gte: 60 } }, then: [{ do: 'spawn', player: 0, units: ['perseus'], at: { tc: 0 }, tag: 'perseu' }] };
    expect(warnPaths(mk({ triggers: [later], victory: { kills: { player: 0, by: { tag: 'perseu' } }, eq: 0 } }))).toEqual(['victory.kills.by.tag']);
    expect(warnPaths(mk({ triggers: [later], victory: { kills: { player: 0, by: { tag: 'perseu' } }, gte: 1 } }))).toEqual([]);
  });
});

describe('G17: contador de repeat', () => {
  it("vars['@id'] conta os disparos (já vale no then); { max } para no teto; setVar '@id' 0 rearma; não-repeat não conta", () => {
    const s = game(mk({
      triggers: [
        { id: 'onda', repeat: { max: 3 }, when: { every: { seconds: 2 } }, then: [{ do: 'addVar', name: 'soma', delta: 1 }, { do: 'setVar', name: 'visto', value: { var: '@onda' } }] },
        { id: 'sempre', repeat: true, when: { every: { seconds: 5 } }, then: [] },
        { id: 'uma', when: { time: { gte: 1 } }, then: [] },
        { id: 'rearma', when: { time: { gte: 14 } }, then: [{ do: 'setVar', name: '@onda', value: 0 }] },
      ],
    }));
    run(s, 12 * TICK_RATE);
    const v = s.scenario!.vars;
    expect(v['@onda']).toBe(3); expect(v.soma).toBe(3); expect(v.visto).toBe(3);
    expect(v['@sempre']).toBe(2); expect('@uma' in v).toBe(false); expect(s.scenario!.fired).toEqual(['uma']);
    expect(cond(s, { var: '@onda', eq: 3 })).toBe(true);
    run(s, 10 * TICK_RATE);   // aos 14 s 'onda' (no teto) vem antes de 'rearma' na lista; rearmada, dispara aos 16, 18 e 20 e para de novo
    expect(v['@onda']).toBe(3); expect(v.soma).toBe(6);
    // gatilhos repeat em TS (m3: ritual a cada segundo) também contam
    const m3 = createGame({ ...PROLOGUE[2].config, scenario: 'm3_portal' });
    run(m3, 3 * TICK_RATE);
    expect(m3.scenario!.vars['@ritual']).toBeGreaterThanOrEqual(2);
    // save/load mantém o contador e o teto continua valendo
    const s2 = deserialize(serialize(s));
    run(s2, 10 * TICK_RATE);
    expect(s2.scenario!.vars['@onda']).toBe(3); expect(s2.scenario!.vars.soma).toBe(6);
  });
  it('validação e lint de repeat: { max } inteiro ≥ 1; { fired } de gatilho repeat e @var sem repeat avisam', () => {
    const tr = (repeat: unknown) => mk({ triggers: [{ id: 't', repeat, when: { time: { gte: 1 } }, then: [] } as unknown as ScenarioFile['triggers'][number]] });
    expect(paths(tr({ max: 2 }))).toEqual([]); expect(paths(tr(true))).toEqual([]);
    expect(paths(tr({ max: 0 }))).toEqual(['triggers[0].repeat']); expect(paths(tr({ max: 1.5 }))).toEqual(['triggers[0].repeat']);
    expect(paths(tr({ max: 2, cada: 3 }))).toEqual(['triggers[0].repeat']); expect(paths(tr('sim'))).toEqual(['triggers[0].repeat']);
    const onda: ScenarioFile['triggers'][number] = { id: 'onda', repeat: { max: 3 }, when: { every: { seconds: 60 } }, then: [] };
    expect(warnPaths(mk({ triggers: [onda], victory: { fired: 'onda' } }))).toEqual(['victory.fired']);
    expect(warnPaths(mk({ triggers: [onda], victory: { var: '@onda', gte: 3 } }))).toEqual([]);
    expect(warnPaths(mk({ triggers: [onda], victory: { var: '@ondas', gte: 3 } }))).toEqual(['victory.var']);
    expect(warnPaths(mk({ triggers: [onda, { id: 'x', when: { value: { add: [{ var: '@nada' }, 1] }, gte: 2 }, then: [{ do: 'setVar', name: '@outra', value: 1 }, { do: 'setVar', name: '@onda', value: 0 }] }] })))
      .toEqual(['triggers[1].when.value.add[0].var', 'triggers[1].then[0].name']);
    expect(warnPaths(mk({ triggers: [onda], hud: [{ type: 'progress', var: '@onda', max: 3, label: { pt: 'Ondas', en: 'Waves' }, format: 'count' }] }))).toEqual([]);
  });
});

describe('G10–G13, G17: determinismo', () => {
  it('relíquias fixas, poderes, habilidade, abates e repeat roteirizados dão o mesmo estado em duas partidas e depois de salvar/carregar', () => {
    const f = mk({
      map: { gen: { mapSize: 'small', seed: 12345 }, relics: [[20, 20], [60, 60], [40, 12]] },
      setup: [
        { do: 'spawn', player: 0, units: ['achilles'], at: { tc: 1, dx: -6, dy: 6 }, tag: 'aquiles' },
        { do: 'spawn', player: 1, units: ['hoplite', 'hoplite', 'hoplite', 'toxotes'], at: { tc: 1, dx: -4, dy: 6 }, tag: 'guarda' },
        { do: 'set', player: 0, powers: { add: ['oracle'] } },
      ],
      triggers: [
        { id: 'furia', repeat: { max: 4 }, when: { every: { seconds: 3 } }, then: [{ do: 'ability', unit: { tag: 'aquiles' }, target: { tag: 'guarda', pick: 'alive' } }] },
        { id: 'oraculo', when: { time: { gte: 4 } }, then: [{ do: 'setVar', name: 'ok', value: 1 }] },
        { id: 'repoe', when: { powerUsed: { player: 0, id: 'oracle' } }, then: [{ do: 'set', player: 0, powers: { reset: ['oracle'] } }] },
        { id: 'placar', repeat: true, when: { kills: { player: 0, by: { tag: 'aquiles' } }, gte: { add: [{ var: '@placar' }, 1] } }, then: [{ do: 'addVar', name: 'mortes', delta: 1 }] },
      ],
    });
    const a = game(f), b = game(f);
    for (const s of [a, b]) { run(s, 6 * TICK_RATE); applyCommand(s, { type: 'power', player: 0, power: 'oracle' }); run(s, 24 * TICK_RATE); }
    expect(stateHash(a)).toBe(stateHash(b));
    expect(a.scenario).toEqual(b.scenario); expect(a.relics).toEqual(b.relics);
    expect(a.scenario!.vars['@furia']).toBe(4);
    expect(a.scenario!.powerUses['0:oracle']).toBe(1); expect(a.scenario!.fired).toContain('repoe');
    expect(a.scenario!.vars.mortes).toBeGreaterThan(0); expect(a.scenario!.vars.mortes).toBe(a.scenario!.vars['@placar']);
    expect(a.relics.map((r) => [r.x, r.y])).toEqual(b.relics.map((r) => [r.x, r.y])); expect(a.relics.length).toBe(3);
    expect(a.scenario!.vars.mortes).toBe(Object.values(a.scenario!.kills.byEntity[`0:${a.scenario!.vars['#aquiles']}`] ?? {}).reduce((x, y) => x + y, 0));
    const c = deserialize(serialize(a));
    expect(c.scenario).toEqual(a.scenario);
    run(a, 8 * TICK_RATE); run(c, 8 * TICK_RATE);
    expect(stateHash(c)).toBe(stateHash(a)); expect(c.scenario).toEqual(a.scenario);
  }, 60_000);
});
