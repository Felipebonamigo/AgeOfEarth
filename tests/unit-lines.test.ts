// E3 (docs/eras/E3-linhas-de-unidade.md): linhas de unidade — dados, treino pelo degrau atual, evolução que transforma as
// unidades existentes, elenco clássico nos cenários, Era inicial e IA.
import { describe, it, expect } from 'vitest';
import { AGES, BUILDINGS, LINES, LINE_ORDER, TECHS, UNITS, lineStart, evoTechId } from '../src/core/data';
import { GARRISON_TAGS, TICK_RATE, type ResourceType } from '../src/core/constants';
import type { Building, GameConfig, GameState } from '../src/core/types';
import { createGame, tick } from '../src/core/sim/game';
import { applyCommand, canResearch, canTrain } from '../src/core/sim/commands';
import { buildingsOf, canPlaceBuilding, enterGarrison, placeBuilding, spawnUnit, unitsOf } from '../src/core/sim/entities';
import { getUnitStats, recomputeMods, refreshMaxHp } from '../src/core/sim/modifiers';
import { trainChoices, unitLinesOn } from '../src/core/sim/lines';
import { deserialize, serialize } from '../src/core/serialize';
import { stateHash } from '../src/core/net/hash';
import { campaignMission, missionConfig } from '../src/core/scenario/campaign';
import { t } from '../src/i18n';
import { quickGame, run } from './helpers';

function findFree(s: GameState, type: string, cx: number, cy: number, r = 10): { x: number; y: number } {
  for (let rr = 0; rr <= r; rr++) for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
    if (Math.abs(dx) !== rr && Math.abs(dy) !== rr) continue;
    if (canPlaceBuilding(s, s.players[0], type, cx + dx, cy + dy, true).ok) return { x: cx + dx, y: cy + dy };
  }
  throw new Error(`sem espaço para ${type}`);
}
/** Jogador 0 na Era II com 5000 de tudo, Biblioteca e Quartel prontos perto do Centro Cívico. */
function setup(over: Partial<GameConfig> = {}) {
  const s = quickGame(over);
  const p = s.players[0];
  p.age = 1; recomputeMods(s, p);   // os modificadores já na Era II (o caso dos cidadãos compara antes × depois)
  for (const r of Object.keys(p.resources) as ResourceType[]) p.resources[r] = 5000;
  const tc = buildingsOf(s, 0).find((b) => b.type === 'town_center')!;
  const at = (type: string, dx: number, dy: number): Building => { const f = findFree(s, type, tc.tx + dx, tc.ty + dy); return placeBuilding(s, 0, type, f.x, f.y, true); };
  return { s, p, tc, at, lib: at('academy', -6, 0), bar: at('barracks', 6, 0) };
}
/** Estuda `tech` na Biblioteca (fila vazia) e termina no próximo tick. */
function studyNow(s: GameState, lib: Building, tech: string): void {
  expect(applyCommand(s, { type: 'research', player: lib.owner, buildingId: lib.id, tech }).ok, tech).toBe(true);
  const item = lib.queue[0]; item.elapsed = item.total - 0.01;
  tick(s);
}
const steps = (id: string) => LINES[id].steps.filter((x): x is string => !!x);

describe('linhas de unidade: dados', () => {
  it('cada linha: uma posição por Era, degraus coerentes, mesma classe, população e guarnição', () => {
    expect(Object.keys(LINES).sort()).toEqual([...LINE_ORDER].sort());
    const garrisonable = (id: string) => { const d = UNITS[id]; return d.tags.some((x) => GARRISON_TAGS.has(x)) && !['myth', 'siege', 'cavalry'].some((x) => d.tags.includes(x)); };
    for (const id of LINE_ORDER) {
      const l = LINES[id];
      expect(l.steps, id).toHaveLength(AGES.length);
      expect(lineStart(l), id).toBeGreaterThanOrEqual(0);
      for (const b of l.buildings) expect(BUILDINGS[b]?.trains, `${id}: ${b}`).toBeDefined();
      for (const u of steps(id)) expect(UNITS[u], `${id}: ${u}`).toBeDefined();
      expect(new Set(steps(id).map((u) => UNITS[u].cls)).size, `${id}: classe`).toBe(1);
      expect(new Set(steps(id).map((u) => UNITS[u].pop)).size, `${id}: pop`).toBe(1);
      expect(new Set(steps(id).map(garrisonable)).size, `${id}: guarnição`).toBe(1);
      if (id !== 'citizen') l.steps.forEach((x, k) => { if (x) { expect(UNITS[x].line, x).toBe(id); expect(UNITS[x].tier, x).toBe(k); } });
    }
    for (const u of Object.values(UNITS)) if (u.line) expect(LINES[u.line].steps, u.id).toContain(u.id);
  });
  it('50 estudos de evolução: Biblioteca, Era do degrau, em sequência, fora do techCount', () => {
    let n = 0;
    for (const id of LINE_ORDER) {
      const l = LINES[id];
      let prev: string | null = null;
      for (let k = lineStart(l) + 1; k < l.steps.length; k++) {
        if (!l.steps[k]) continue;
        const tid = evoTechId(id, k), x = TECHS[tid];
        expect(x, tid).toBeDefined();
        expect([x.building, x.age, x.evolve, x.prereq, x.line], tid).toEqual(['academy', k, { line: id, to: l.steps[k] }, prev ? [prev] : [], undefined]);
        prev = tid; n++;
      }
    }
    expect(n).toBe(50);
    expect(Object.values(TECHS).filter((x) => x.evolve)).toHaveLength(50);
  });
  it('as 41 novas: lineOnly, fora de todo trains, no edifício da linha, age = tier', () => {
    const fresh = Object.values(UNITS).filter((u) => u.lineOnly);
    expect(fresh).toHaveLength(41);
    for (const u of fresh) {
      expect(LINES[u.line!].buildings, u.id).toContain(u.building);
      expect(u.age, u.id).toBe(u.tier);
      for (const b of Object.values(BUILDINGS)) expect(b.trains ?? [], `${b.id} treina ${u.id}`).not.toContain(u.id);
    }
  });
  it('as 12 de hoje e os trains não mudaram (campanha intacta)', () => {
    const OLD: Record<string, [number, number, number, string, string]> = {
      villager: [60, 3, 0, 'town_center', 'Q'], kataskopos: [70, 4, 0, 'town_center', 'W'], hoplite: [110, 9, 0, 'barracks', 'Q'],
      toxotes: [75, 7, 0, 'barracks', 'W'], peltast: [85, 6, 1, 'barracks', 'E'], hippeus: [140, 10, 1, 'stable', 'Q'],
      hypaspist: [150, 13, 2, 'barracks', 'F'], cretan_archer: [90, 11, 2, 'barracks', 'T'], hetairoi: [190, 14, 2, 'stable', 'E'],
      petrobolos: [120, 30, 2, 'siege_workshop', 'Q'], myrmidon: [200, 17, 3, 'barracks', 'Y'], helepolis: [400, 45, 3, 'siege_workshop', 'W'],
    };
    for (const [id, [hp, atk, age, bld, hk]] of Object.entries(OLD)) { const u = UNITS[id]; expect([u.hp, u.attack, u.age, u.building, u.hotkey, !!u.lineOnly], id).toEqual([hp, atk, age, bld, hk, false]); }
    expect(BUILDINGS.barracks.trains).toEqual(['hoplite', 'toxotes', 'peltast', 'hypaspist', 'cretan_archer', 'myrmidon']);
    expect(BUILDINGS.stable.trains).toEqual(['kataskopos', 'hippeus', 'hetairoi']);
    expect(BUILDINGS.fortress.trains).toEqual(['hoplite', 'toxotes', 'hypaspist', 'hetairoi', 'myrmidon']);
    expect(BUILDINGS.siege_workshop.trains).toEqual(['petrobolos', 'helepolis']);
  });
  it('teclas de treino com as linhas: únicas por edifício, nunca A/R/U, sem Q onde há filósofos', () => {
    for (const [bid, b] of Object.entries(BUILDINGS)) {
      const lineKeys = LINE_ORDER.filter((id) => LINES[id].buildings.includes(bid)).map((id) => LINES[id].hotkey);
      for (const k of lineKeys) expect(['A', 'R', 'U'], `${bid}: ${k}`).not.toContain(k);
      if (b.scholars) expect(lineKeys, bid).not.toContain('Q');
      const keys = [...lineKeys, ...(b.trains ?? []).filter((u) => !UNITS[u].line && !UNITS[u].god).map((u) => UNITS[u].hotkey).filter((k): k is string => !!k)];
      expect(new Set(keys).size, `${bid}: ${keys.join(',')}`).toBe(keys.length);
    }
  });
  it('dentro de cada linha, vida e custo crescem com o degrau', () => {
    const total = (id: string) => Object.values(UNITS[id].cost).reduce((a: number, b) => a + (b ?? 0), 0);
    for (const id of LINE_ORDER) {
      if (id === 'citizen') continue;
      const u = steps(id);
      for (let i = 1; i < u.length; i++) { expect(UNITS[u[i]].hp, u[i]).toBeGreaterThan(UNITS[u[i - 1]].hp); expect(total(u[i]), u[i]).toBeGreaterThan(total(u[i - 1])); }
    }
  });
});

describe('linhas de unidade: núcleo', () => {
  it('a evolução transforma as unidades da linha (vida proporcional, patente, ordem, guarnição, população, efeito)', () => {
    const { s, p, tc, lib } = setup();
    const h = spawnUnit(s, 0, 'hoplite', tc.x + 3, tc.y + 4);
    h.kills = 3; refreshMaxHp(s, p); h.hp = Math.round(h.maxHp / 2);
    const g = spawnUnit(s, 0, 'hoplite', tc.x - 3, tc.y + 4);
    expect(enterGarrison(s, g, tc)).toBe(true);
    const arch = spawnUnit(s, 0, 'toxotes', tc.x + 4, tc.y + 5);
    applyCommand(s, { type: 'move', player: 0, ids: [h.id], x: h.x + 6, y: h.y });
    tick(s);
    const pop0 = p.pop;
    studyNow(s, lib, 'evo_heavy_infantry_2');
    expect([h.type, g.type, arch.type]).toEqual(['hypaspist', 'hypaspist', 'toxotes']);
    expect(h.kills).toBe(3);
    expect(h.maxHp).toBe(Math.round(getUnitStats(s, p, 'hypaspist').hp * 1.1));
    expect(Math.abs(h.hp / h.maxHp - 0.5)).toBeLessThan(0.02);
    expect(h.state).toBe('move');
    expect(g.inside).toBe(tc.id);
    expect(p.pop).toBe(pop0);
    expect(s.effects.some((e) => e.type === 'evolve' && e.src === 'hypaspist')).toBe(true);
  });
  it('o treino sai no degrau atual: um botão por linha, item da fila resolvido ao nascer, id antigo treina o novo', () => {
    const { s, p, lib, bar } = setup();
    expect(trainChoices(s, p, 'barracks').map((c) => [c.line?.id, c.show, c.hotkey])).toEqual([['heavy_infantry', 'hoplite', 'Q'], ['ranged', 'toxotes', 'W'], ['skirmisher', 'peltast', 'E']]);
    expect(applyCommand(s, { type: 'train', player: 0, buildingId: bar.id, unit: 'hoplite' }).ok).toBe(true);
    expect(bar.queue[0].id).toBe('hoplite');
    studyNow(s, lib, 'evo_heavy_infantry_2');
    bar.queue[0].elapsed = bar.queue[0].total - 0.01; tick(s);
    expect(unitsOf(s, 0).some((u) => u.type === 'hypaspist')).toBe(true);
    expect(applyCommand(s, { type: 'train', player: 0, buildingId: bar.id, unit: 'hoplite' }).ok).toBe(true);
    expect(bar.queue[bar.queue.length - 1].id).toBe('hypaspist');
    expect(trainChoices(s, p, 'barracks')[0].show).toBe('hypaspist');
  });
  it('Elite só na Fortaleza; Assalto e Fogo grego aposentam na Era V', () => {
    const { s, p, bar, at } = setup();
    p.age = 2;
    expect(canTrain(s, p, bar, 'myrmidon').ok).toBe(false);
    const fort = at('fortress', 0, 8);
    expect(canTrain(s, p, fort, 'myrmidon').ok).toBe(true);
    expect(trainChoices(s, p, 'fortress').map((c) => c.hotkey)).toEqual(['Q', 'W', 'E', 'Y']);
    const ws = at('siege_workshop', 0, -8);
    expect(canTrain(s, p, ws, 'helepolis').ok).toBe(true);
    p.age = 4;
    expect(canTrain(s, p, ws, 'helepolis')).toEqual({ ok: false, reason: t('err.lineRetired', { line: LINES.assault.name, age: AGES[4].name }) });
    expect(trainChoices(s, p, 'siege_workshop').map((c) => c.line?.id)).toEqual(['artillery']);
  });
  it('elenco clássico (cenário ou unitLines: false): sem evoluções nem degraus novos; trains como antes', () => {
    const { s, p, lib, bar } = setup({ unitLines: false });
    expect(unitLinesOn(s)).toBe(false);
    expect(canResearch(s, p, lib, 'evo_heavy_infantry_2')).toEqual({ ok: false, reason: t('err.legacyRoster') });
    expect(canTrain(s, p, bar, 'phalangite')).toEqual({ ok: false, reason: t('err.legacyRoster') });
    p.age = 2;
    expect(canTrain(s, p, bar, 'hypaspist').ok).toBe(true);
    expect(trainChoices(s, p, 'barracks').map((c) => c.send)).toEqual(BUILDINGS.barracks.trains);
    expect(unitLinesOn(quickGame())).toBe(true);
    expect(unitLinesOn(createGame(missionConfig(campaignMission('m1_despertar')!, 'normal')))).toBe(false);
  });
  it('Era inicial V (fora de cenário): começa com os degraus da Era', () => {
    const s = quickGame({ startingAge: 4 });
    const p = s.players[0];
    expect(p.techs).toContain('evo_heavy_infantry_5');
    expect(p.techs).not.toContain('evo_heavy_infantry_6');
    expect(unitsOf(s, 0).some((u) => u.type === 'stradiot')).toBe(true);
  });
  it('cidadãos evoluem por efeito, sem trocar de tipo', () => {
    const { s, p, lib } = setup();
    const v = unitsOf(s, 0).find((u) => u.type === 'villager')!;
    const food0 = p.mods.gather.food;
    studyNow(s, lib, 'evo_citizen_2');
    expect(v.type).toBe('villager');
    expect(v.maxHp).toBe(Math.round(60 * 1.1));
    expect(p.mods.gather.food).toBeCloseTo(food0 * 1.04, 6);
  });
  it('save: a transformação vai e volta igual', () => {
    const { s, tc, lib } = setup();
    spawnUnit(s, 0, 'hoplite', tc.x + 3, tc.y + 4);
    studyNow(s, lib, 'evo_heavy_infantry_2');
    const a = serialize(s);
    expect(serialize(deserialize(a))).toBe(a);
  });
});

describe('linhas de unidade: IA', () => {
  // Começa na Era II com a III como Era final (maxAge 2): na Era final a IA não junta fundo para avançar e a Biblioteca
  // fica livre para as evoluções (D19). Sem Era final e com recursos de sobra, a IA avança assim que cumpre os estudos e
  // quase não sobra Biblioteca para evoluir — o teste dependeria do ritmo das Eras.
  const cfg: Partial<GameConfig> = { seed: 21, startingAge: 1, maxAge: 2, startingResources: { food: 20000, wood: 20000, stone: 20000, gold: 20000, knowledge: 5000, favor: 300 } };
  it('na Era final a IA estuda evoluções da Era e o exército passa ao degrau novo', () => {
    const s = quickGame(cfg, true);
    run(s, 12 * 60 * TICK_RATE);   // Era III (~4 min) + filósofos e estudos de nível 1 que vêm antes na lista da IA + 2 evoluções
    const final = s.players.filter((p) => p.alive && p.age === 2);
    expect(final.map((p) => p.name), 'alguma IA viva chegou à Era III (a final)').not.toEqual([]);
    for (const p of final) {
      expect(p.techs.some((x) => TECHS[x]?.evolve && TECHS[x].age === 2 && TECHS[x].evolve!.line !== 'citizen'), `${p.name}: ${p.techs.join(',')}`).toBe(true);
      expect(unitsOf(s, p.id).some((u) => UNITS[u.type].lineOnly || u.type === 'hetairoi'), p.name).toBe(true);
    }
  }, 150_000);
  it('a mesma config dá o mesmo estado (determinismo com as linhas)', () => {
    const a = quickGame(cfg, true), b = quickGame(cfg, true);
    run(a, 4 * 60 * TICK_RATE); run(b, 4 * 60 * TICK_RATE);
    expect(stateHash(a)).toBe(stateHash(b));
  }, 60_000);
});

