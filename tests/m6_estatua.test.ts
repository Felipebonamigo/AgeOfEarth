// Missão 6, A Estátua de Zeus (docs/STORY.md §5.3): setup da ficha, variações por dificuldade (G3), contador da guarda,
// quedas da Estátua, limiar de vitória, Colossos e segredo, Micenas, povo, Estátua murada e o paliativo do Portal dos Titãs
// (sem G6). Partidas curtas no mapa real (6606). A passiva de 6 min roda em tests/missions.test.ts; o roteiro longo (vitória
// dentro da janela) só em scripts/missions.ts.
import { describe, it, expect } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { destroyBuilding, killUnit } from '../src/core/sim/combat';
import { missionRunConfig } from '../src/core/scenario/testing';
import { advanceBuild, placeExact, placeNear, setRaidObserver, tagIds, townCenter, type RaidRecord } from '../src/core/scenario/helpers';
import { spawnUnit } from '../src/core/sim/entities';
import { isPassable } from '../src/core/map/grid';
import type { CampaignDifficulty } from '../src/core/scenario/schema';
import type { Building, GameState } from '../src/core/types';

const start = (d: CampaignDifficulty) => createGame(missionRunConfig('m6_estatua', d).config);
const run = (s: GameState, seconds: number) => { for (let i = 0; i < seconds * TICK_RATE && !s.gameOver; i++) tick(s); };
const lines = (s: GameState) => s.events.filter((e) => e.type === 'dialogue').map((e) => e.text ?? '');
const alive = (s: GameState, owner: number, type: string) => [...s.units.values()].filter((u) => u.owner === owner && !u.dead && u.type === type);
const gates = (s: GameState) => [...s.buildings.values()].filter((b) => !b.dead && b.type === 'titan_gate');
/** Estátua de Argos ao lado do Centro Cívico (pronta ou em obra). */
function statue(s: GameState, complete: boolean): Building {
  const tc = townCenter(s, 0)!;
  const w = placeNear(s, 0, 'wonder_zeus', tc.x + 9, tc.y - 9, complete);
  expect(w).not.toBeNull();
  return w!;
}

describe('m6_estatua', () => {
  it('setup da ficha: Argos na Heroica com 3 das 4 pesquisas, Templo e Academia prontos, Jasão; Frota sem nada; Liga e Micenas com a vantagem inicial', () => {
    const s = start('normal');
    const p0 = s.players[0];
    expect(p0.age).toBe(2);
    for (const t of ['civic1', 'science1', 'commerce1']) expect(p0.techs).toContain(t);
    const mine = [...s.buildings.values()].filter((b) => b.owner === 0 && !b.dead);
    for (const t of ['temple', 'academy', 'town_center']) expect(mine.some((b) => b.type === t && b.complete), t).toBe(true);
    expect(alive(s, 0, 'jason')).toHaveLength(1);
    expect(alive(s, 0, 'villager').length).toBeGreaterThanOrEqual(17);
    expect([...s.units.values()].some((u) => u.owner === 3 && !u.dead)).toBe(false);
    expect([...s.buildings.values()].some((b) => b.owner === 3 && !b.dead)).toBe(false);
    expect(s.players.map((p) => p.team)).toEqual([0, 1, 0, 1]);
    expect([...s.buildings.values()].some((b) => b.owner === 1 && b.type === 'stable' && b.complete)).toBe(true);
    expect([...s.buildings.values()].some((b) => b.owner === 2 && b.type === 'tower' && b.complete)).toBe(true);
  }, 60_000);

  it('G3: guarda de 5 min no Fácil (com a Pítia avisando), 6 no Normal e no Difícil', () => {
    const want: Record<CampaignDifficulty, number> = { easy: 300, normal: 360, hard: 360 };
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const s = start(d);
      run(s, 12);
      expect(s.scenario!.vars.guarda, d).toBe(want[d]);
      expect(lines(s).some((t) => t.includes('cinco minutos')), d).toBe(d === 'easy');
    }
  }, 60_000);

  it('a guarda só conta com a Estátua pronta; a 1ª queda zera o contador e é perdoada no Normal, a 2ª derrota', () => {
    const s = start('normal');
    run(s, 2);
    let w = statue(s, true);
    run(s, 10);
    expect(s.scenario!.vars.estatua_s).toBeGreaterThanOrEqual(9);
    expect(s.scenario!.objectives.estatua).toBe('done');
    destroyBuilding(s, w, 3);
    run(s, 2);
    expect(s.scenario!.vars.estatua_s).toBe(0);
    expect(s.scenario!.vars.quedas).toBe(1);
    expect(s.scenario!.outcome).toBe('playing');
    expect(lines(s).some((t) => t.includes('não haverá terceira vez'))).toBe(true);
    w = statue(s, true);
    run(s, 3);
    destroyBuilding(s, w, 3);
    run(s, 2);
    expect(s.scenario!.vars.quedas).toBe(2);
    expect(s.scenario!.outcome).toBe('defeat');
  }, 60_000);

  it('G3: no Difícil a 1ª queda da Estátua já é derrota', () => {
    const s = start('hard');
    run(s, 2);
    const w = statue(s, true);
    run(s, 5);
    destroyBuilding(s, w, 3);
    run(s, 2);
    expect(s.scenario!.vars.quedas).toBe(1);
    expect(s.scenario!.outcome).toBe('defeat');
  }, 60_000);

  it('limiar da guarda: vitória com a var guarda (300 s no Fácil, 360 no Normal e no Difícil); a obra não conta', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const s = start(d);
      run(s, 2);
      statue(s, false);
      run(s, 10);
      expect(s.scenario!.vars.estatua_s ?? 0, d).toBe(0);   // Estátua em obra: a guarda não conta nem há queda
      expect(s.scenario!.vars.quedas ?? 0, d).toBe(0);
      statue(s, true);
      s.players[0].age = 3;
      s.scenario!.vars.estatua_s = 296;
      run(s, 6);
      expect(s.scenario!.outcome, d).toBe(d === 'easy' ? 'victory' : 'playing');
      if (d === 'easy') continue;
      s.scenario!.vars.estatua_s = 356;
      run(s, 6);
      expect(s.scenario!.outcome, d).toBe('victory');
    }
  }, 120_000);

  it('povo: cumprido com 20 cidadãos ao fim da guarda, falhado com menos', () => {
    for (const want of ['done', 'failed'] as const) {
      const s = start('easy');
      run(s, 2);
      const tc = townCenter(s, 0)!;
      const vills = alive(s, 0, 'villager');
      if (want === 'done') for (let i = vills.length; i < 22; i++) spawnUnit(s, 0, 'villager', tc.x, tc.y + 4);
      else for (const u of vills.slice(15)) killUnit(s, u, 3);
      statue(s, true);
      s.scenario!.vars.estatua_s = 297;
      run(s, 5);
      expect(s.scenario!.objectives.povo, want).toBe(want);
    }
  }, 60_000);

  it('Micenas cai com o Centro Cívico (fundação nova não conta) e o reforço de Micenas vira um punhado de sobreviventes', () => {
    const s = start('normal');
    run(s, 6);
    destroyBuilding(s, townCenter(s, 2)!, 1);
    run(s, 2);
    expect(s.scenario!.objectives.micenas).toBe('failed');
    const before = [...s.units.values()].filter((u) => u.owner === 0 && !u.dead).length;
    statue(s, true);
    run(s, 2);
    expect(s.scenario!.fired).toContain('estatua_pronta_sem_micenas');
    expect(s.scenario!.fired).not.toContain('estatua_pronta');
    expect([...s.units.values()].filter((u) => u.owner === 0 && !u.dead).length - before).toBe(3);
    expect(lines(s).some((t) => t.includes('Micenas lembra'))).toBe(false);
    // com Micenas de pé, as lanças de Micenas chegam com a fala do Rei Atreu
    const s2 = start('normal');
    run(s2, 6);
    statue(s2, true);
    run(s2, 2);
    expect(s2.scenario!.fired).toContain('estatua_pronta');
    expect(lines(s2).some((t) => t.includes('Micenas lembra'))).toBe(true);
  }, 60_000);

  it('Maravilha da Liga: a Pítia desfaz o engano e o evento não anuncia contagem de vitória em cenário', () => {
    const s = start('normal');
    run(s, 2);
    const tc = townCenter(s, 1)!;
    expect(placeNear(s, 1, 'wonder_colossus', tc.x + 8, tc.y - 8, true)).not.toBeNull();
    run(s, 2);
    expect(lines(s).some((t) => t.includes('Zeus não conta bronze alheio'))).toBe(true);
    const ev = s.events.filter((e) => e.type === 'wonder');
    expect(ev.length).toBeGreaterThan(0);
    for (const e of ev) expect(e.text).not.toContain('Contagem');
  }, 60_000);

  it('G3: no Difícil, Zeus avisa na metade da obra que uma queda basta; no Normal, não', () => {
    for (const d of ['normal', 'hard'] as const) {
      const s = start(d);
      run(s, 2);
      const w = statue(s, false);
      run(s, 2);
      advanceBuild(s, w, 125);
      run(s, 2);
      expect(lines(s).some((t) => t.includes('não haverá segunda')), d).toBe(d === 'hard');
      expect(s.scenario!.outcome, d).toBe('playing');
    }
  }, 60_000);

  it('as falas da guarda voltam depois de uma queda (Normal)', () => {
    const s = start('normal');
    run(s, 2);
    let w = statue(s, true);
    s.scenario!.vars.estatua_s = 118;
    run(s, 3);
    const n = () => lines(s).filter((t) => t.includes('Faltam quatro minutos')).length;
    expect(n()).toBe(1);
    destroyBuilding(s, w, 3);
    run(s, 2);
    expect(s.scenario!.vars.quedas).toBe(1);
    w = statue(s, true);
    run(s, 1);
    s.scenario!.vars.estatua_s = 118;
    run(s, 3);
    expect(n()).toBe(2);
  }, 60_000);

  it('Estátua cercada de muralha sem portão: o cerco da Frota nasce assim mesmo e bate na muralha', () => {
    const s = start('normal');
    const raids: RaidRecord[] = [];
    setRaidObserver((r) => raids.push(r));
    try {
      run(s, 2);
      const w = statue(s, true);
      let walls = 0;
      for (let y = w.ty - 1; y <= w.ty + w.h; y++) for (let x = w.tx - 1; x <= w.tx + w.w; x++) {
        if (x >= w.tx && x < w.tx + w.w && y >= w.ty && y < w.ty + w.h) continue;
        if (isPassable(s.map, x, y) && placeExact(s, 0, 'wall', x, y, true)) walls++;
      }
      expect(walls).toBeGreaterThan(0);
      run(s, 120);
      const cerco = raids.filter((r) => r.owner === 3);
      expect(cerco.length).toBeGreaterThan(0);
      expect(cerco.every((r) => r.spawned > 0)).toBe(true);
      expect(w.hp < w.maxHp || [...s.buildings.values()].some((b) => b.owner === 0 && b.type === 'wall' && (b.dead || b.hp < b.maxHp))).toBe(true);
    } finally { setRaidObserver(null); }
  }, 60_000);

  it('a obra chama o 1º Colosso da Frota; aos 180 s de guarda vem o 2º (não no Fácil); os dois caídos revelam e cumprem o segredo', () => {
    for (const d of ['easy', 'normal'] as const) {
      const s = start(d);
      run(s, 2);
      statue(s, false);
      run(s, 2);
      expect(s.scenario!.fired, d).toContain('obra');
      expect(alive(s, 3, 'colossus'), d).toHaveLength(1);
      expect(s.scenario!.hidden.colossos, d).toBe(true);
      // a guarda chega aos 180 s (uma segunda Estátua pronta no lugar da obra, sem esperar 4 min de construção)
      statue(s, true);
      s.scenario!.vars.estatua_s = 178;
      run(s, 3);
      expect(s.scenario!.fired.includes('colosso2'), d).toBe(d !== 'easy');
      expect(alive(s, 3, 'colossus'), d).toHaveLength(d === 'easy' ? 1 : 2);
      const favor = s.players[0].resources.favor;
      for (const u of alive(s, 3, 'colossus')) killUnit(s, u, 0);
      run(s, 2);
      expect(s.scenario!.objectives.colossos, d).toBe(d === 'easy' ? 'pending' : 'done');
      expect(s.scenario!.hidden.colossos, d).toBe(d === 'easy');
      if (d !== 'easy') { expect(s.players[0].resources.favor).toBeGreaterThanOrEqual(favor + 100); expect(tagIds(s, 'escolta2').length).toBeGreaterThan(0); }
    }
  }, 60_000);

  it('paliativo sem G6: Portais dos Titãs caem no mesmo segundo (o de Argos com o custo devolvido e a fala da Pítia)', () => {
    const s = start('normal');
    run(s, 2);
    const before = { ...s.players[0].resources };
    for (const p of [0, 1, 2]) { const tc = townCenter(s, p)!; expect(placeNear(s, p, 'titan_gate', tc.x + 8, tc.y + 8, false), `portal ${p}`).not.toBeNull(); }
    run(s, 2);
    expect(gates(s)).toEqual([]);
    const after = s.players[0].resources;
    expect(after.food - before.food).toBeGreaterThanOrEqual(600 - 1);
    expect(after.favor - before.favor).toBeGreaterThanOrEqual(200 - 1);
    expect(s.scenario!.fired).toEqual(expect.arrayContaining(['portal_argos_fala', 'portal_liga_fala', 'portal_micenas_fala']));
    expect(lines(s).some((t) => t.includes('Prometeu ainda sangra'))).toBe(true);
    expect([...s.units.values()].some((u) => !u.dead && ['prometheus', 'oceanus', 'cronus'].includes(u.type))).toBe(false);
  }, 60_000);
});
