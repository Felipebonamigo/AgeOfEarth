// Ritmo da IA (E10; docs/eras/E9-E10-interface-balanceamento.md, tabela E10-3): AI_PACE só vale fora de cenário, os limites
// dos botões, e o congelamento dos dados da campanha (Eras II–IV, níveis 1–4 das linhas, 35 unidades clássicas).
import { describe, it, expect } from 'vitest';
import { quickGame } from './helpers';
import { AGES, UNITS, TECHS, ACADEMY_LINES, LINE_LEVEL_COST_MULT } from '../src/core/data';
import { AI_PACE, AI_PACE_CLASSIC, AI_PACE_LIMITS, ARMY_ATTACK, FARM_LIMIT, MIN_ARMY, VILLAGER_TARGET, aiPace } from '../src/core/sim/ai';
import FROZEN from './fixtures/e10-frozen.json';

const TABLES = ['villagerTarget', 'farmLimit', 'armyAttack', 'minArmy'] as const;
const RAW = { villagerTarget: VILLAGER_TARGET, farmLimit: FARM_LIMIT, armyAttack: ARMY_ATTACK, minArmy: MIN_ARMY };
const MAX_DELTA = { villagerTarget: 12, farmLimit: 6, armyAttack: 8, minArmy: 6 };

describe('AI_PACE (E10)', () => {
  it('as 4 tabelas têm uma posição por Era; o clássico usa as tabelas da campanha e o AI_PACE as copia', () => {
    for (const k of TABLES) {
      expect(AI_PACE[k]).toHaveLength(AGES.length);
      expect(AI_PACE_CLASSIC[k]).toHaveLength(AGES.length);
      expect(AI_PACE_CLASSIC[k]).toBe(RAW[k]);
      expect(AI_PACE[k]).not.toBe(RAW[k]);
    }
  });
  it('o clássico é exatamente o que estava no código no início da E10 (ajustar VILLAGER_TARGET & cia. mudaria a campanha)', () => {
    expect(AI_PACE_CLASSIC).toEqual({
      villagerTarget: [18, 26, 34, 40, 44, 48, 52, 56], farmLimit: [4, 8, 12, 16, 18, 20, 22, 24], armyAttack: [7, 12, 16, 20, 24, 28, 32, 36], minArmy: [6, 10, 14, 18, 22, 26, 30, 34],
      advanceMinVillagers: 12, templeVillagers: 8, barracksVillagers: 10, libraryVillagers: 9, fortressWood: 300, scholarsEarly: 3, armyFundCap: 1.6, evoUsers: 4, farSearch: 70, sellLots: 4,
    });
  });
  it('cada botão do AI_PACE fica dentro dos limites', () => {
    for (const [k, [lo, hi]] of Object.entries(AI_PACE_LIMITS)) {
      const v = (AI_PACE as unknown as Record<string, number>)[k];
      expect(v, k).toBeGreaterThanOrEqual(lo); expect(v, k).toBeLessThanOrEqual(hi);
    }
    for (const k of TABLES) AI_PACE[k].forEach((v, i) => expect(Math.abs(v - RAW[k][i]), `${k}[${i}]`).toBeLessThanOrEqual(MAX_DELTA[k]));
  });
  it('fora de cenário vale o AI_PACE; em cenário, o clássico', () => {
    const s = quickGame();
    expect(aiPace(s)).toBe(AI_PACE);
    s.config = { ...s.config, scenario: 'm1_despertar' };
    expect(aiPace(s)).toBe(AI_PACE_CLASSIC);
  });
  it('LINE_LEVEL_COST_MULT: níveis 1–4 (campanha) em 1 e o resto em [0,7; 1,3]', () => {
    expect(LINE_LEVEL_COST_MULT).toHaveLength(8);
    expect(LINE_LEVEL_COST_MULT.slice(0, 4)).toEqual([1, 1, 1, 1]);
    for (const m of LINE_LEVEL_COST_MULT) { expect(m).toBeGreaterThanOrEqual(0.7); expect(m).toBeLessThanOrEqual(1.3); }
  });
  it('dados congelados da campanha: Eras II–IV, níveis 1–4 das linhas e as 35 unidades clássicas', () => {
    const ids = Object.keys(FROZEN.units);
    const now = {
      ages: AGES.slice(0, 4).map((a) => ({ cost: a.cost, time: a.time, requires: a.requires })),
      units: Object.fromEntries(ids.map((id) => { const u = UNITS[id]; return [id, [u.cost, u.hp, u.attack, u.armor, u.range, u.speed, u.trainTime, u.bonus, u.age]]; })),
      lines: Object.fromEntries(ACADEMY_LINES.flatMap((l) => [1, 2, 3, 4].map((n) => [l + n, [TECHS[l + n].cost, TECHS[l + n].time]]))),
    };
    expect(JSON.parse(JSON.stringify(now))).toEqual(FROZEN);
    expect(ids).toHaveLength(35);
  });
  it('techCount das Eras não decresce e é ≤ 4·k', () => {
    let prev = 0;
    for (let k = 1; k < AGES.length; k++) {
      const n = AGES[k].requires.techCount ?? 0;
      if (n) { expect(n).toBeGreaterThanOrEqual(prev); expect(n).toBeLessThanOrEqual(4 * k); prev = n; }
    }
  });
});
