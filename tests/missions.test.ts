// Testes por missão (docs/STORY.md §7.2, Fase 3.5) para TODAS as missões do registro da campanha, nas três dificuldades:
// validação estática (JSON: erros e lint), viabilidade passiva curta (≤ 6 min simulados: sem exceção, sem vitória, nenhum
// objetivo antes de 60 s, no máximo 1 de cada Titã, toda invasão gerou unidades, duas execuções com o mesmo stateHash) e o
// harness do jogador roteirizado. O roteiro longo (vitória dentro da janela) fica em scripts/missions.ts.
import { afterEach, describe, it, expect } from 'vitest';
import { CAMPAIGN } from '../src/core/scenario/campaign';
import { lintScenario, scenarioErrors, validateScenario, type ScenarioFile } from '../src/core/scenario/schema';
import { MISSION_SCRIPTS, failedChecks, fmtOutcome, runPassive, runScripted, scriptVerdict, staticMissionIssues, type MissionRunResult } from '../src/core/scenario/testing';
import { campaignMission } from '../src/core/scenario/campaign';
import m1Json from '../src/core/scenario/missions/m1_despertar.scenario.json';

const PASSIVE_MINUTES = 6;
const DIFFS = ['easy', 'normal', 'hard'] as const;

// Os casos deste arquivo são síncronos e longos (partidas simuladas): sem ceder o laço de eventos entre eles, a resposta do
// "onTaskUpdate" do vitest só é lida no fim do arquivo e, com a máquina carregada (> 60 s no total), o worker acusa
// "Timeout calling onTaskUpdate" mesmo com todos os testes verdes. Um setTimeout(0) depois de cada caso deixa a RPC andar.
afterEach(() => new Promise<void>((r) => { setTimeout(r, 0); }));

describe('missões do registro: validação estática', () => {
  // TODAS as missões do registro (TS compiladas e JSON); antes só as JSON geravam casos (e o registro ainda não tem nenhuma)
  for (const e of CAMPAIGN) {
    it(`${e.id} (${e.source}): compila, ids únicos, config válida (times, puppet), ${e.source === 'json' ? 'validateScenario e lint limpos, ' : ''}roteiro de teste`, () => {
      expect(staticMissionIssues(e)).toEqual([]);
      if (e.source === 'json') {
        expect(scenarioErrors(validateScenario(e.file, { allowReserved: true }))).toEqual([]);
        expect(lintScenario(e.file)).toEqual([]);
        expect((e.file as ScenarioFile).id).toBe(e.id);
      }
    });
  }
  it('o bloco estático cobre todo o registro', () => {
    expect(CAMPAIGN.length).toBeGreaterThan(0);
    for (const e of CAMPAIGN) expect(MISSION_SCRIPTS[e.id], e.id).toBeDefined();
  });
  it('staticMissionIssues pega defeitos de config nas missões TS e JSON', () => {
    const m1 = CAMPAIGN.find((e) => e.id === 'm1_despertar')!;
    const def = campaignMission('m1_despertar')!;
    const saved = def.config.players;
    try {
      def.config.players = saved.map((p, i) => (i === 1 ? { ...p, puppet: undefined, team: undefined } : p));
      const issues = staticMissionIssues(m1);
      expect(issues.some((i) => i.includes('sem team explícito'))).toBe(true);
      expect(issues.some((i) => i.startsWith('(lint) config config.players[1]'))).toBe(true);
    } finally { def.config.players = saved; }
    const bad = { ...(m1Json as unknown as ScenarioFile), victory: { objective: 'nada', is: 'done' } } as ScenarioFile;
    expect(staticMissionIssues({ act: 1, id: 'm1_despertar', source: 'json', file: bad }).some((i) => i.startsWith('victory.objective'))).toBe(true);
  });
  it('roteiros estritos por padrão: sem vitória, ou vitória fora da janela, falha — só exceção declarada (com motivo) dispensa', () => {
    const script = { minutes: 30, steps: [], expect: [10, 20] as [number, number] };
    const res = (outcome: 'victory' | 'defeat' | 'playing', atSeconds: number, difficulty: 'easy' | 'normal' | 'hard' = 'normal') => ({ outcome, atSeconds, difficulty }) as unknown as MissionRunResult;
    expect(scriptVerdict(res('victory', 15 * 60), script)).toMatchObject({ ok: true, inWindow: true });
    expect(scriptVerdict(res('defeat', 8 * 60), script)).toMatchObject({ ok: false, inWindow: false });
    expect(scriptVerdict(res('playing', 30 * 60), script).ok).toBe(false);
    expect(scriptVerdict(res('victory', 5 * 60), script).ok).toBe(false);
    expect(scriptVerdict(res('victory', 25 * 60), script).ok).toBe(false);
    expect(scriptVerdict(res('defeat', 8 * 60), undefined).ok).toBe(false);
    const withEx = { ...script, exceptions: { hard: 'motivo' } };
    expect(scriptVerdict(res('defeat', 8 * 60, 'hard'), withEx)).toMatchObject({ ok: true, exception: 'motivo' });
    expect(scriptVerdict(res('defeat', 8 * 60, 'easy'), withEx).ok).toBe(false);
    for (const [id, sc] of Object.entries(MISSION_SCRIPTS)) for (const [d, why] of Object.entries(sc.exceptions ?? {})) expect(why.length, `${id} [${d}]: exceção sem motivo`).toBeGreaterThan(20);
    // atEnd: vitória dentro da janela com uma condição de fim que não vale também falha, com o rótulo no motivo
    const missing = { ...res('victory', 15 * 60), endIssues: ['o chefe lutou'] } as MissionRunResult;
    expect(scriptVerdict(missing, script)).toMatchObject({ ok: false, inWindow: true });
    expect(scriptVerdict(missing, script).reason).toContain('o chefe lutou');
  });
});

describe('missões do registro: viabilidade passiva', () => {
  for (const e of CAMPAIGN) for (const d of DIFFS) {
    it(`${e.id} [${d}]: ${PASSIVE_MINUTES} min sem jogador`, () => {
      const r = runPassive(e.id, { minutes: PASSIVE_MINUTES, difficulty: d });
      expect(r.error).toBeUndefined();
      expect(failedChecks(r), `${fmtOutcome(r)} ${JSON.stringify(r.raids)}`).toEqual([]);
      expect(r.outcome).not.toBe('victory');
      expect(r.difficulty).toBe(d);
    }, 180_000);
  }
});

describe('harness do jogador roteirizado', () => {
  it('runScripted: a IA joga pelo jogador 0 e os passos disparam; mesmo roteiro → mesmo stateHash', () => {
    const script = MISSION_SCRIPTS.m1_despertar;
    const steps = [...script.steps, { label: 'batedor', when: { time: { gte: 30 } }, command: (st: import('../src/core/types').GameState) => { const k = [...st.units.values()].find((u) => u.owner === 0 && u.type === 'kataskopos'); return k ? { type: 'move' as const, player: 0, ids: [k.id], x: st.map.starts[1].x, y: st.map.starts[1].y } : null; } }];
    const r = runScripted('m1_despertar', { minutes: 4, difficulty: 'normal', steps });
    const p = runPassive('m1_despertar', { minutes: 4, difficulty: 'normal', deterministic: false });
    expect(r.mode).toBe('scripted'); expect(p.mode).toBe('passive');
    expect(r.checks).toEqual({ noException: true, noEarlyObjective: true, oneTitanEach: true, raidsSpawned: true, deterministic: true });
    expect(r.stepsFired).toContain('batedor');
    expect(r.me.units).toBeGreaterThan(p.me.units);   // a IA treinou (a passiva fica com o kit inicial)
    expect(r.hash).not.toBe(p.hash);
  }, 180_000);

  it('cofre (reserve): a IA do jogador não gasta a parte guardada enquanto a condição vale; cofre que nunca vale não muda nada', () => {
    const steps = MISSION_SCRIPTS.m1_despertar.steps;
    const free = runScripted('m1_despertar', { minutes: 3, difficulty: 'normal', steps, deterministic: false });
    // toda a madeira no cofre desde o início: a IA não constrói nada (casas, celeiro, quartel custam madeira)
    const saved = runScripted('m1_despertar', { minutes: 3, difficulty: 'normal', steps, reserve: { when: { time: { gte: 0 } }, resources: { wood: 100000 } } });
    expect(saved.checks.deterministic).toBe(true);
    expect(free.me.buildings).toBeGreaterThan(1);
    expect(saved.me.buildings).toBe(1);
    // cofre que nunca vale: igual a não ter cofre (mesmo stateHash)
    const never = runScripted('m1_despertar', { minutes: 3, difficulty: 'normal', steps, deterministic: false, reserve: { when: { time: { lt: 0 } }, resources: { wood: 100000 } } });
    expect(never.hash).toBe(free.hash);
    // lista de cofres (m8, variante dos Titãs): uma lista com o cofre avulso é o mesmo cofre (mesmo stateHash); os que valem somam
    const listed = runScripted('m1_despertar', { minutes: 3, difficulty: 'normal', steps, deterministic: false, reserve: [{ when: { time: { gte: 0 } }, resources: { wood: 100000 } }] });
    expect(listed.hash).toBe(saved.hash);
    const split = runScripted('m1_despertar', { minutes: 3, difficulty: 'normal', steps, deterministic: false, reserve: [{ when: { time: { lt: 0 } }, resources: { wood: 100000 } }, { when: { time: { gte: 0 } }, resources: { wood: 60000 } }, { when: { time: { gte: 0 } }, resources: { wood: 40000 } }] });
    expect(split.hash).toBe(saved.hash);
  }, 180_000);

  it('destacamento (detach): a IA do jogador não comanda as unidades destacadas; destacamento vazio não muda nada', () => {
    const steps = MISSION_SCRIPTS.m1_despertar.steps;
    const free = runScripted('m1_despertar', { minutes: 2, difficulty: 'normal', steps, deterministic: false });
    const empty = runScripted('m1_despertar', { minutes: 2, difficulty: 'normal', steps, deterministic: false, detach: () => [] });
    expect(empty.hash).toBe(free.hash);
    // o batedor: a IA o manda explorar; destacado, ele fica onde nasceu (os passos veem e observam tudo)
    const scoutTrail = (detached: boolean) => {
      const at: { x: number; y: number }[] = [];
      const scout = (st: import('../src/core/types').GameState) => [...st.units.values()].find((u) => u.owner === 0 && !u.dead && u.type === 'kataskopos');
      const obs = { label: 'obs', when: { time: { gte: 1 } }, every: 10, command: (st: import('../src/core/types').GameState) => { const k = scout(st); if (k) at.push({ x: k.x, y: k.y }); return null; } };
      const r = runScripted('m1_despertar', { minutes: 2, difficulty: 'normal', steps: [...steps, obs], deterministic: false, ...(detached ? { detach: (st: import('../src/core/types').GameState) => { const k = scout(st); return k ? [k.id] : []; } } : {}) });
      expect(r.checks.noException).toBe(true);
      const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
      return Math.max(...at.map((p) => d(p, at[0])));
    };
    expect(scoutTrail(false)).toBeGreaterThan(10);
    expect(scoutTrail(true)).toBeLessThan(0.5);
  }, 180_000);

  it('atEnd: condição no estado final ou por N segundos da partida; os rótulos das que não valem vão para endIssues', () => {
    const r = runScripted('m1_despertar', { minutes: 1, difficulty: 'normal', steps: [], deterministic: false, atEnd: [
      { label: 'nunca', when: { time: { gte: 9999 } } },
      { label: 'no fim', when: { time: { gte: 50 } } },
      { label: '30 s', when: { time: { gte: 0 } }, seconds: 30 },
      { label: '61 s', when: { time: { gte: 0 } }, seconds: 61 },
    ] });
    expect(r.endIssues).toEqual(['nunca', '61 s']);
    expect(runScripted('m1_despertar', { minutes: 1, difficulty: 'normal', steps: [], deterministic: false }).endIssues).toBeUndefined();
  }, 60_000);

  it('poderes guardados (keepPowers): a IA do jogador não gasta o poder guardado (os passos, sim); lista vazia não muda nada', () => {
    // m7: Argos começa na Heroica com o Oráculo, que a IA do jogador usa no 2º segundo
    let oracleUsed: boolean | undefined;
    const watch = { label: 'olho', when: { time: { gte: 0 } }, every: 1, command: (st: import('../src/core/types').GameState) => { oracleUsed = st.players[0].powers.find((p) => p.id === 'oracle')?.used; return null; } };
    const free = runScripted('m7_aquiles', { minutes: 1, difficulty: 'normal', steps: [watch], deterministic: false });
    expect(oracleUsed).toBe(true);
    runScripted('m7_aquiles', { minutes: 1, difficulty: 'normal', steps: [watch], deterministic: false, keepPowers: ['oracle'] });
    expect(oracleUsed).toBe(false);
    // o passo usa o poder guardado quando quer
    const use = { label: 'oráculo', when: { time: { gte: 30 } }, command: () => ({ type: 'power' as const, player: 0, power: 'oracle' }) };
    const kept = runScripted('m7_aquiles', { minutes: 1, difficulty: 'normal', steps: [watch, use], keepPowers: ['oracle'] });
    expect(oracleUsed).toBe(true);
    expect(kept.checks.deterministic).toBe(true);
    const empty = runScripted('m7_aquiles', { minutes: 1, difficulty: 'normal', steps: [watch], deterministic: false, keepPowers: [] });
    expect(empty.hash).toBe(free.hash);
  }, 180_000);

  it('as checagens pegam os defeitos de autoria: objetivo no segundo 1 (tag futura), invasão sem alvo e dois Titãs iguais', () => {
    const file: ScenarioFile = {
      format: 'aoe-scenario', version: 1, id: 'defeitos', title: 'Defeitos', intro: ['x'],
      map: { gen: { mapSize: 'small', seed: 12345 } },
      config: { players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal', team: 1, puppet: true }] },
      objectives: [{ id: 'fera', text: 'Mate a fera', done: { entity: { tag: 'fera' }, exists: false } }],
      triggers: [
        { id: 'chega', when: { time: { gte: 90 } }, then: [{ do: 'spawn', player: 1, units: ['minotaur'], at: { tc: 1 }, tag: 'fera' }] },
        { id: 'sem_alvo', when: { time: { gte: 5 } }, then: [{ do: 'raid', player: 1, units: ['hoplite'], target: { entity: { tag: 'nada' } }, angle: 0 }] },
        { id: 'titas', when: { time: { gte: 10 } }, then: [{ do: 'spawn', player: 1, units: ['cronus', 'cronus'], at: { tc: 1, dy: 6 } }] },
      ],
      victory: { time: { gte: 99999 } },
    };
    expect(lintScenario(file).map((i) => i.path)).toEqual(['objectives[0].done.entity.tag']);
    const r = runPassive(file, { minutes: 1, difficulty: 'normal' });
    expect(r.id).toBe('defeitos');
    expect(r.checks).toEqual({ noException: true, noEarlyObjective: false, oneTitanEach: false, raidsSpawned: false, deterministic: true });
    expect(r.raids).toEqual({ total: 1, empty: 0, noTarget: 1 });
    // corrigido (guarda por fired, alvo existente, um Titã): tudo passa
    const ok: ScenarioFile = { ...file,
      objectives: [{ id: 'fera', text: 'Mate a fera', done: { all: [{ fired: 'chega' }, { entity: { tag: 'fera' }, exists: false }] } }],
      triggers: [file.triggers[0], { id: 'com_alvo', when: { time: { gte: 5 } }, then: [{ do: 'raid', player: 1, units: ['hoplite'], target: { tc: 0 }, angle: 0 }] }, { id: 'tita', when: { time: { gte: 10 } }, then: [{ do: 'spawn', player: 1, units: ['cronus'], at: { tc: 1, dy: 6 } }] }],
    };
    expect(lintScenario(ok)).toEqual([]);
    expect(failedChecks(runPassive(ok, { minutes: 1, difficulty: 'normal' }))).toEqual([]);
  }, 180_000);
});
