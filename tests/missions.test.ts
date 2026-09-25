// Testes por missão (docs/STORY.md §7.2, Fase 3.5) para TODAS as missões do registro da campanha, nas três dificuldades:
// validação estática (JSON: erros e lint), viabilidade passiva curta (≤ 6 min simulados: sem exceção, sem vitória, nenhum
// objetivo antes de 60 s, no máximo 1 de cada Titã, toda invasão gerou unidades, duas execuções com o mesmo stateHash) e o
// harness do jogador roteirizado. O roteiro longo (vitória dentro da janela) fica em scripts/missions.ts.
import { describe, it, expect } from 'vitest';
import { CAMPAIGN } from '../src/core/scenario/campaign';
import { lintScenario, scenarioErrors, validateScenario, type ScenarioFile } from '../src/core/scenario/schema';
import { MISSION_SCRIPTS, failedChecks, fmtOutcome, runPassive, runScripted } from '../src/core/scenario/testing';

const PASSIVE_MINUTES = 6;
const DIFFS = ['easy', 'normal', 'hard'] as const;

describe('missões do registro: validação estática', () => {
  for (const e of CAMPAIGN.filter((x) => x.source === 'json')) {
    it(`${e.id}: validateScenario sem erros e lint sem avisos (tags futuras, ocultos, falas pt/en ≤ 200)`, () => {
      expect(e.file).toBeDefined();
      expect(scenarioErrors(validateScenario(e.file, { allowReserved: true }))).toEqual([]);
      expect(lintScenario(e.file)).toEqual([]);
      expect((e.file as ScenarioFile).id).toBe(e.id);
    });
  }
  it('todo id do registro tem roteiro de jogador em MISSION_SCRIPTS', () => {
    for (const e of CAMPAIGN) expect(MISSION_SCRIPTS[e.id], e.id).toBeDefined();
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

  it('as checagens pegam os defeitos de autoria: objetivo no segundo 1 (tag futura), invasão sem alvo e dois Titãs iguais', () => {
    const file: ScenarioFile = {
      format: 'aoe-scenario', version: 1, id: 'defeitos', title: 'Defeitos', intro: ['x'],
      map: { gen: { mapSize: 'small', seed: 12345 } },
      config: { players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal', team: 1 }] },
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
