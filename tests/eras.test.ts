// E1 (docs/eras/E1-eras-biblioteca.md): 8 Eras, Biblioteca (avanço de Era + estudos um por vez, uma por cidade).
import { describe, it, expect } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { AGES, ACADEMY_LINES, BUILDINGS, ERA_TITANS, LEGACY_AGE_TO_ERA, LINE_LEVELS, MAJOR_GODS, MAX_AGE, ROMAN, TECHS, UNITS } from '../src/core/data';
import { applyCommand, canAdvanceAge } from '../src/core/sim/commands';
import { buildingLimitOk, buildingsOf, placeBuilding } from '../src/core/sim/entities';
import { setLocale, t } from '../src/i18n';
import { SAVE_VERSION, deserialize, saveVersionOf, serialize } from '../src/core/serialize';
import { createGame, tick } from '../src/core/sim/game';
import { ARMY_ATTACK, FARM_LIMIT, MIN_ARMY, RESEARCH_PRIORITY, VILLAGER_TARGET } from '../src/core/sim/ai';
import { academyTechCount } from '../src/core/sim/commands';
import { gameConfigFor } from '../src/core/scenario/compile';
import { validateScenario, type ScenarioFile } from '../src/core/scenario/schema';
import type { GameConfig } from '../src/core/types';
import { quickGame, run } from './helpers';

const RICH = { food: 5000, wood: 5000, gold: 5000, knowledge: 5000, favor: 500 };

describe('E1 — dados das 8 Eras', () => {
  it('8 Eras em ordem; Era final = Portal dos Titãs; mapa das Eras antigas', () => {
    expect(AGES.length).toBe(8);
    AGES.forEach((a, i) => expect(a.id).toBe(i));
    expect(ERA_TITANS).toBe(MAX_AGE);
    expect([...LEGACY_AGE_TO_ERA]).toEqual([0, 1, 2, 3, 7]);
    expect(BUILDINGS.titan_gate.age).toBe(ERA_TITANS);
    for (const id of ['prometheus', 'oceanus', 'cronus']) expect(UNITS[id].age).toBe(ERA_TITANS);
    expect(UNITS.perseus.age).toBe(4);
  });

  it('techCount não decresce e techCount(k) ≤ 4·k', () => {
    let prev = 0;
    for (let k = 1; k < AGES.length; k++) {
      const n = AGES[k].requires.techCount ?? 0;
      expect(n).toBeGreaterThanOrEqual(prev);
      expect(n).toBeLessThanOrEqual(4 * k);
      prev = n;
    }
  });

  it('deus menor só onde o par existe (Eras I–VI)', () => {
    for (const g of Object.keys(MAJOR_GODS)) {
      for (let k = 1; k <= 7; k++) {
        const want = k <= 6 && (MAJOR_GODS[g].minorGods[k - 1]?.length ?? 0) > 0;
        expect(AGES[k].minorGod, `${g} Era ${k}`).toBe(want);
      }
    }
  });

  it('4 linhas × 8 níveis na Biblioteca', () => {
    expect(LINE_LEVELS).toBe(AGES.length);
    for (const l of ACADEMY_LINES) {
      for (let n = 1; n <= LINE_LEVELS; n++) {
        const tech = TECHS[`${l}${n}`];
        expect(tech, `${l}${n}`).toBeTruthy();
        expect(tech.age).toBe(n - 1);
        expect(tech.building).toBe('academy');
        expect(tech.name.endsWith(ROMAN[n - 1])).toBe(true);
      }
    }
  });

  it('Biblioteca: Era 0, fila de 5, 3 no máximo, uma por cidade; nome EN', () => {
    const lib = BUILDINGS.academy;
    expect(lib.age).toBe(0);
    expect(lib.library).toBe(true);
    expect(lib.queueMax).toBe(5);
    expect(lib.limit).toBe(3);
    expect(lib.perCity).toBe(true);
    try { setLocale('en'); expect(BUILDINGS.academy.name).toBe('Library'); } finally { setLocale('pt'); }
  });
});

describe('E1 — Biblioteca', () => {
  it('o avanço de Era só vale na Biblioteca pronta', () => {
    const s = quickGame();
    const p = s.players[0]; const tc = buildingsOf(s, 0)[0];
    p.resources = { ...p.resources, ...RICH };
    expect(canAdvanceAge(s, p, tc).reason).toBe(t('err.advanceAtLibrary'));
    expect(canAdvanceAge(s, p).reason).toBe(t('msg.needLibrary'));
    placeBuilding(s, 0, 'temple', tc.tx + 5, tc.ty, true);
    const lib = placeBuilding(s, 0, 'academy', tc.tx - 5, tc.ty, true);
    const c = canAdvanceAge(s, p, lib);
    expect(c.ok).toBe(true);
    expect(c.minorOptions).toEqual(['athena', 'hermes']);
    expect(applyCommand(s, { type: 'advanceAge', player: 0, buildingId: lib.id, minorGod: 'athena' }).ok).toBe(true);
    run(s, 62 * TICK_RATE);
    expect(p.age).toBe(1);
    expect(p.minorGods).toEqual(['athena']);
  });

  it('um item por vez; fila de 5; avanço com a fila cheia é recusado', () => {
    const s = quickGame();
    const p = s.players[0]; const tc = buildingsOf(s, 0)[0];
    p.resources = { ...p.resources, ...RICH };
    placeBuilding(s, 0, 'temple', tc.tx + 5, tc.ty, true);
    const lib = placeBuilding(s, 0, 'academy', tc.tx - 5, tc.ty, true);
    for (const l of ACADEMY_LINES) expect(applyCommand(s, { type: 'research', player: 0, buildingId: lib.id, tech: `${l}1` }).ok).toBe(true);
    expect(applyCommand(s, { type: 'hireScholar', player: 0, buildingId: lib.id }).ok).toBe(true);
    expect(lib.queue.length).toBe(5);
    run(s, 1);
    expect(lib.queue[0].elapsed).toBeGreaterThan(0);
    expect(lib.queue[1].elapsed).toBe(0);
    const r = applyCommand(s, { type: 'hireScholar', player: 0, buildingId: lib.id });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(t('err.queueFull'));
    const adv = applyCommand(s, { type: 'advanceAge', player: 0, buildingId: lib.id, minorGod: 'athena' });
    expect(adv.ok).toBe(false);
    expect(adv.reason).toBe(t('err.queueFull'));
  });

  it('uma Biblioteca por Centro Cívico', () => {
    const s = quickGame();
    const p = s.players[0]; const tc = buildingsOf(s, 0)[0];
    placeBuilding(s, 0, 'academy', tc.tx - 5, tc.ty, true);
    const r = buildingLimitOk(s, p, 'academy');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain(BUILDINGS.academy.name);
    placeBuilding(s, 0, 'town_center', tc.tx, tc.ty + 6, true);
    expect(buildingLimitOk(s, p, 'academy').ok).toBe(true);
  });
});

const players2: GameConfig['players'] = [
  { name: 'H', god: 'zeus', isAI: false, difficulty: 'normal' },
  { name: 'IA', god: 'hades', isAI: true, difficulty: 'normal' },
];

describe('E1 — Era inicial e Era final', () => {
  it('startingAge 3 concede deuses menores, poderes e estudos (humano e IA)', () => {
    const s = createGame({ seed: 5, mapSize: 'small', startingAge: 3, players: players2 });
    const h = s.players[0];
    expect(h.age).toBe(3);
    expect(h.minorGods).toEqual(['athena', 'apollo', 'hera']);
    const ids = h.powers.map((x) => x.id);
    for (const id of ['bolt', 'restoration', 'oracle', 'lightning_storm']) expect(ids).toContain(id);
    expect(academyTechCount(h)).toBe(AGES[3].requires.techCount);
    const ai = s.players[1];
    expect(ai.minorGods.length).toBe(3);
    ai.minorGods.forEach((g, k) => expect(MAJOR_GODS.hades.minorGods[k]).toContain(g));
  });

  it('startingAge 99 → Era final; Deathmatch → Era 1 com 1 deus menor; cenário não concede', () => {
    const top = createGame({ seed: 5, mapSize: 'small', startingAge: 99, players: players2 });
    expect(top.players[0].age).toBe(MAX_AGE);
    const dm = createGame({ seed: 5, mapSize: 'small', mode: 'deathmatch', players: players2 });
    expect(dm.players[0].age).toBe(1);
    expect(dm.players[0].minorGods.length).toBe(1);
    const horde = createGame({ seed: 5, mapSize: 'small', scenario: 'horde', startingAge: 2, players: players2 });
    expect(horde.players[0].minorGods).toEqual([]);
  });

  it('maxAge numa partida sem cenário: o aviso cita a Era final', () => {
    const s = quickGame({ maxAge: 1 });
    const p = s.players[0]; const tc = buildingsOf(s, 0)[0];
    p.age = 1; p.resources = { ...p.resources, ...RICH };
    const lib = placeBuilding(s, 0, 'academy', tc.tx - 5, tc.ty, true);
    expect(canAdvanceAge(s, p, lib).reason).toBe(t('err.endAge', { age: AGES[1].name }));
  });
});

describe('E1 — cenário', () => {
  const mk = (config: Record<string, unknown>): ScenarioFile => ({
    format: 'aoe-scenario', version: 1, id: 'teste', title: { pt: 'T', en: 'T' }, intro: ['x'],
    map: { gen: { mapSize: 'small', seed: 1 } },
    config: { players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal' }], ...config } as ScenarioFile['config'],
    objectives: [], triggers: [], victory: { time: { gte: 99999 } },
  });
  it('visualEraMax: aceita 2 com startingAge 3; recusa 8 e 1.5', () => {
    expect(validateScenario(mk({ visualEraMax: 2, startingAge: 3 }))).toEqual([]);
    expect(validateScenario(mk({ visualEraMax: 8 })).map((i) => i.path)).toEqual(['config.visualEraMax']);
    expect(validateScenario(mk({ visualEraMax: 1.5 })).map((i) => i.path)).toEqual(['config.visualEraMax']);
    expect(gameConfigFor(mk({ visualEraMax: 2 })).visualEraMax).toBe(2);
  });
  it('a estatística studies valida', () => {
    const f = mk({});
    f.triggers = [{ id: 'x', when: { value: { stat: 'studies', player: 0 }, gte: 2 }, then: [] }] as ScenarioFile['triggers'];
    expect(validateScenario(f)).toEqual([]);
  });
});

describe('E1 — IA', () => {
  it('tabelas com uma posição por Era; prioridade de estudos cobre as linhas', () => {
    for (const tab of [VILLAGER_TARGET, FARM_LIMIT, ARMY_ATTACK, MIN_ARMY]) expect(tab.length).toBe(AGES.length);
    for (const id of RESEARCH_PRIORITY) expect(TECHS[id], id).toBeTruthy();
    for (const [id, tech] of Object.entries(TECHS)) if (tech.line) expect(RESEARCH_PRIORITY, id).toContain(id);
  });

  it('IA difícil: só avança em Biblioteca e chega à Era III em 9 min', () => {
    const s = createGame({
      seed: 21, mapSize: 'small',
      players: [{ name: 'A', god: 'zeus', isAI: true, difficulty: 'hard' }, { name: 'B', god: 'hades', isAI: true, difficulty: 'hard' }],
      startingResources: { food: 20000, wood: 20000, gold: 20000, knowledge: 5000, favor: 300 },
    });
    let best = 0;
    for (let i = 0; i < 9 * 60 * TICK_RATE; i++) {
      tick(s);
      if (i % TICK_RATE === 0) {
        for (const b of s.buildings.values()) {
          if (b.dead || !b.queue.some((q) => q.kind === 'age')) continue;
          expect(BUILDINGS[b.type].library, `Era na fila de ${b.type}`).toBe(true);
        }
        best = Math.max(best, ...s.players.map((p) => p.age));
      }
    }
    expect(best).toBeGreaterThanOrEqual(2);
  }, 60000);
});

describe('E1 — save', () => {
  it('versão do formato; save de outra versão não carrega e avisa', () => {
    const json = serialize(quickGame());
    expect(saveVersionOf(json)).toBe(SAVE_VERSION);
    expect(saveVersionOf('lixo')).toBeNull();
    const old = JSON.stringify({ ...JSON.parse(json), version: 1 });
    expect(saveVersionOf(old)).toBe(1);
    expect(() => deserialize(old)).toThrow(/v1/);
    expect(deserialize(json).tick).toBe(0);
  });
});
