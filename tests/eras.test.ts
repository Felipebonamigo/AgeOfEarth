// E1 (docs/eras/E1-eras-biblioteca.md): 8 Eras, Biblioteca (avanço de Era + estudos um por vez, uma por cidade).
import { describe, it, expect } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { AGES, ACADEMY_LINES, BUILDINGS, ERA_TITANS, LEGACY_AGE_TO_ERA, LINE_LEVELS, MAJOR_GODS, MAX_AGE, ROMAN, TECHS, UNITS } from '../src/core/data';
import { applyCommand, canAdvanceAge } from '../src/core/sim/commands';
import { buildingLimitOk, buildingsOf, placeBuilding } from '../src/core/sim/entities';
import { setLocale, t } from '../src/i18n';
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
