// m7 "A Cólera de Aquiles" (docs/STORY.md §5.4): setup da ficha no mapa gerado real (forest 7707), aldeias alcançáveis e na
// ordem "a mais perto das naus primeiro", marchas por dificuldade (G3), volta às naus, Tétis (o paliativo do Raio de Zeus: enquanto
// o acampamento está de pé, cada queda de Aquiles o devolve às naus), a isca do acampamento queimado, o segredo de Odisseu (G1) e
// os reforços das naus. Partidas curtas; a passiva de 6 min roda em tests/missions.test.ts e o roteiro longo em scripts/missions.ts.
import { describe, it, expect } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { applyCommand } from '../src/core/sim/commands';
import { destroyBuilding, killUnit } from '../src/core/sim/combat';
import { rectReachable } from '../src/core/map/components';
import { setRaidObserver, tagIds, townCenter, type RaidRecord } from '../src/core/scenario/helpers';
import { missionRunConfig } from '../src/core/scenario/testing';
import type { CampaignDifficulty } from '../src/core/scenario/schema';
import type { Building, GameState, Unit } from '../src/core/types';

const start = (d: CampaignDifficulty) => createGame(missionRunConfig('m7_aquiles', d).config);
const run = (s: GameState, seconds: number) => { for (let i = 0; i < seconds * TICK_RATE && !s.gameOver; i++) tick(s); };
/** Roda até o segundo inteiro `sec` do jogo (o runner avalia no último tick de cada segundo). */
const until = (s: GameState, sec: number) => { while (Math.floor((s.tick + 1) / TICK_RATE) < sec && !s.gameOver) tick(s); tick(s); };
const lines = (s: GameState) => s.events.filter((e) => e.type === 'dialogue').map((e) => e.text ?? '');
const alive = (s: GameState, owner: number, type?: string) => [...s.units.values()].filter((u) => u.owner === owner && !u.dead && (!type || u.type === type));
const tagged = (s: GameState, tag: string): Unit | Building | undefined => { const id = s.scenario!.vars['#' + tag]; return id === undefined ? undefined : s.units.get(id) ?? s.buildings.get(id); };
const achilles = (s: GameState) => { const a = tagged(s, 'aquiles'); return a && a.kind === 'unit' && !a.dead ? a : undefined; };
const camp = (s: GameState) => tagged(s, 'acampamento') as Building;
const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
const VILLAGES = ['aldeia1', 'aldeia2', 'aldeia3', 'aldeia4'] as const;

describe('m7_aquiles', () => {
  it('setup da ficha: Argos na Heroica com Atena e Apolo (Raio, Restauração e Oráculo), escolta e Odisseu; Liga com Quartel; mirmidões sem cidade, com a Fortaleza nas naus', () => {
    const s = start('normal');
    const p0 = s.players[0];
    expect(p0.age).toBe(2);
    expect(p0.minorGods).toEqual(expect.arrayContaining(['athena', 'apollo']));
    expect(p0.powers.map((p) => p.id).sort()).toEqual(['bolt', 'oracle', 'restoration']);
    expect(p0.resources).toMatchObject({ food: 1000, wood: 800, gold: 800, favor: 120, knowledge: 300 });
    expect(alive(s, 0, 'hypaspist')).toHaveLength(3);
    expect(alive(s, 0, 'cretan_archer')).toHaveLength(3);
    expect(tagged(s, 'odisseu')?.type).toBe('odysseus');
    expect(s.players.map((p) => p.team)).toEqual([0, 1, 1]);
    expect([...s.buildings.values()].some((b) => b.owner === 1 && b.type === 'barracks' && b.complete)).toBe(true);
    // marionete sem kit: só a Fortaleza (acampamento), Aquiles e os 8 mirmidões, no início sul do mapa
    expect([...s.buildings.values()].filter((b) => b.owner === 2 && !b.dead).map((b) => b.type)).toEqual(['fortress']);
    expect(camp(s).type).toBe('fortress');
    expect(d2(camp(s), s.map.starts[2])).toBeLessThanOrEqual(9);
    expect(achilles(s)?.type).toBe('achilles');
    expect(tagIds(s, 'mirmidoes')).toHaveLength(8);
    expect(alive(s, 2, 'myrmidon')).toHaveLength(8);
    for (const t of ['phalanx', 'bronze_armor', 'iron_weapons', 'divine_arms']) expect(s.players[2].techs).toContain(t);
  }, 60_000);

  it('as quatro aldeias (Celeiros de Argos) existem, Aquiles alcança todas por terra e a ordem das marchas é a da mais perto das naus', () => {
    const s = start('normal');
    const c = camp(s);
    const a = achilles(s)!;
    let last = -1;
    for (const t of VILLAGES) {
      const b = tagged(s, t) as Building;
      expect(b?.type, t).toBe('granary');
      expect(b.owner, t).toBe(0);
      expect(rectReachable(s.map, Math.floor(a.x), Math.floor(a.y), b.tx, b.ty, b.w, b.h, true), t).toBe(true);
      expect(d2(b, c), t).toBeGreaterThan(last);   // "ele escolhe sempre a aldeia mais próxima" (das naus, de onde parte)
      last = d2(b, c);
      expect(d2(b, townCenter(s, 0)!), t).toBeGreaterThan(18 * 18);   // aldeias de fora, longe do Centro Cívico
    }
  }, 60_000);

  it('G3: marchas a cada 240/180/120 s e teto dos reforços 20/26/24 (Fácil/Normal/Difícil); Aquiles mais forte no Difícil', () => {
    const want = { easy: [390, 630, 870, 20], normal: [330, 510, 690, 26], hard: [270, 390, 510, 24] } as const;
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const s = start(d);
      run(s, 2);
      const v = s.scenario!.vars;
      expect([v.rota2_t, v.rota3_t, v.rota4_t, v.teto], d).toEqual([...want[d]]);
      expect(s.players[2].techs.includes('anthropomorphic'), d).toBe(d === 'hard');
    }
  }, 60_000);

  it('rota1 aos 150 s: Aquiles e os mirmidões vão queimar a aldeia1 (com a escolta da invasão) e, queimada, voltam às naus', () => {
    const s = start('normal');
    const raids: RaidRecord[] = [];
    setRaidObserver((r) => raids.push(r));
    try {
      until(s, 149);
      expect(s.scenario!.fired).not.toContain('rota1');
      until(s, 150);
      expect(s.scenario!.fired).toContain('rota1');
      const a1 = tagged(s, 'aldeia1')!;
      for (const u of alive(s, 2).filter((u) => u.type !== 'peltast' && d2(u, camp(s)) < 15 * 15)) expect(u.targetId, u.type).toBe(a1.id);
      expect(raids).toHaveLength(1);
      expect(raids[0].spawned).toBeGreaterThan(0);
      expect(lines(s).some((t) => t.includes('Adivinhe qual escolhi'))).toBe(true);
      // Aquiles chega à aldeia1 (a Argos passiva não a defende) e ela cai: a queda manda todos de volta às naus
      for (let i = 0; i < 90 && !s.scenario!.fired.includes('volta1'); i++) run(s, 1);
      expect(d2(achilles(s)!, a1)).toBeLessThanOrEqual(6 * 6);
      run(s, 1);
      expect(s.scenario!.fired).toEqual(expect.arrayContaining(['volta1', 'perda1']));
      expect(s.scenario!.vars.aldeias_perdidas).toBe(1);
      const home = { x: s.map.starts[2].x, y: s.map.starts[2].y + 5 };
      for (const u of alive(s, 2).filter((u) => u.order)) expect(u.order!.type).toBe('move');
      expect(achilles(s)!.order).toMatchObject({ type: 'move', x: home.x, y: home.y });
    } finally { setRaidObserver(null); }
  }, 60_000);

  it('paliativo do Raio (sem G11): enquanto as naus estão na praia, Tétis devolve Aquiles a cada queda — nem o Raio de Zeus vence a missão', () => {
    const s = start('normal');
    run(s, 2);
    const first = achilles(s)!;
    expect(applyCommand(s, { type: 'power', player: 0, power: 'bolt', targetId: first.id }).ok).toBe(true);
    run(s, 2);
    expect(first.dead).toBe(true);
    const second = achilles(s)!;
    expect(second.id).not.toBe(first.id);
    expect(d2(second, camp(s))).toBeLessThanOrEqual(8 * 8);
    expect(s.scenario!.objectives.aquiles).toBe('pending');
    expect(s.scenario!.outcome).toBe('playing');
    expect(s.scenario!.vars.resgates).toBe(1);
    expect(lines(s).some((t) => t.includes('a mãe o devolverá à guerra'))).toBe(true);
    expect(lines(s).some((t) => t.includes('Ainda não, meu filho'))).toBe(true);
    // de novo: Tétis volta a salvá-lo (repetível); Tétis e a Pítia falam só na 1ª vez, depois o Batedor avisa a cada resgate
    killUnit(s, second, 0);
    run(s, 2);
    expect(achilles(s)).toBeDefined();
    expect(s.scenario!.vars.resgates).toBe(2);
    expect(lines(s).filter((t) => t.includes('a mãe o devolverá à guerra'))).toHaveLength(1);
    expect(lines(s).filter((t) => t.includes('Ainda não, meu filho'))).toHaveLength(1);
    expect(lines(s).filter((t) => t.includes('As ondas levaram Aquiles'))).toHaveLength(1);
    killUnit(s, achilles(s)!, 0);
    run(s, 2);
    expect(s.scenario!.vars.resgates).toBe(3);
    expect(lines(s).filter((t) => t.includes('As ondas levaram Aquiles'))).toHaveLength(2);
    expect(alive(s, 2, 'achilles')).toHaveLength(1);
  }, 60_000);

  it('acampamento queimado: Aquiles marcha contra o Centro Cívico (isca); a queda dele então é a última — vitória, fala do mirmidão e o segredo de Odisseu', () => {
    const s = start('normal');
    run(s, 2);
    destroyBuilding(s, camp(s), 0);
    run(s, 2);
    expect(s.scenario!.objectives.acampamento).toBe('done');
    expect(s.scenario!.fired).toContain('isca');
    const tc = townCenter(s, 0)!;
    const a = achilles(s)!;
    expect(a.order).toMatchObject({ type: 'attackMove', x: tc.x, y: tc.y });
    expect(lines(s).some((t) => t.includes('Queimaram minhas naus'))).toBe(true);
    expect(s.scenario!.hidden.odisseu_vivo).toBe(true);
    killUnit(s, a, 0);
    run(s, 2);
    expect(achilles(s)).toBeUndefined();
    expect(s.scenario!.objectives.aquiles).toBe('done');
    expect(s.scenario!.objectives.odisseu_vivo).toBe('done');
    expect(s.scenario!.hidden.odisseu_vivo).toBe(false);
    expect(s.scenario!.outcome).toBe('victory');
    expect(lines(s).some((t) => t.includes('Nosso senhor caiu cantado'))).toBe(true);
  }, 60_000);

  it('segredo de Odisseu: sem Odisseu vivo, a vitória não o cumpre (e ele segue oculto)', () => {
    const s = start('easy');
    run(s, 2);
    killUnit(s, tagged(s, 'odisseu') as Unit, 2);
    destroyBuilding(s, camp(s), 0);
    run(s, 2);
    killUnit(s, achilles(s)!, 0);
    run(s, 2);
    expect(s.scenario!.outcome).toBe('victory');
    expect(s.scenario!.objectives.odisseu_vivo).toBe('pending');
    expect(s.scenario!.hidden.odisseu_vivo).toBe(true);
  }, 60_000);

  it('aldeias: três perdidas falham o objetivo (com a fala da Pítia); com duas de pé, a vitória o cumpre', () => {
    const s = start('normal');
    run(s, 2);
    for (const t of ['aldeia1', 'aldeia2', 'aldeia3']) destroyBuilding(s, tagged(s, t) as Building, 2);
    run(s, 2);
    expect(s.scenario!.vars.aldeias_perdidas).toBe(3);
    expect(s.scenario!.objectives.aldeias).toBe('failed');
    expect(lines(s).some((t) => t.includes('Três aldeias em cinzas'))).toBe(true);
    const s2 = start('normal');
    run(s2, 2);
    destroyBuilding(s2, tagged(s2, 'aldeia1') as Building, 2);
    destroyBuilding(s2, tagged(s2, 'aldeia2') as Building, 2);
    destroyBuilding(s2, camp(s2), 0);
    run(s2, 2);
    killUnit(s2, achilles(s2)!, 0);
    run(s2, 2);
    expect(s2.scenario!.objectives.aldeias).toBe('done');
  }, 60_000);

  it('reforços das naus a cada 120 s a partir dos 240 s, até o teto; sem o acampamento, param', () => {
    const s = start('normal');
    run(s, 2);
    s.scenario!.vars.rota2_t = 9999;   // sem a invasão da rota2 no meio da conta
    until(s, 239);
    const ships = () => alive(s, 2).filter((u) => u.type === 'myrmidon' || u.type === 'peltast').length;   // a milícia de Poseidon (edifício caído) não conta
    const before = ships();
    until(s, 240);
    expect(ships() - before).toBe(3);
    // acima do teto não vem ninguém
    s.scenario!.vars.teto = 0;
    until(s, 360);
    expect(ships() - before).toBe(3);
    s.scenario!.vars.teto = 99;
    destroyBuilding(s, camp(s), 0);
    until(s, 480);
    expect(s.scenario!.fired).toContain('isca');
    expect(ships() - before).toBe(3);
  }, 60_000);

  it('recolher: mirmidão ocioso longe das naus volta a elas (não fica rondando a cidade entre as marchas)', () => {
    const s = start('normal');
    run(s, 2);
    const m = alive(s, 2, 'myrmidon')[0];
    m.x = m.px = m.tx = 20.5; m.y = m.py = m.ty = 60.5; m.state = 'idle'; m.order = null; m.path = null;
    until(s, 10);
    const order = (u: Unit) => u.order;   // lida depois do tick (o TS estreitaria m.order para null)
    expect(order(m)?.type).toBe('move');
    expect(order(m)).toMatchObject({ x: s.map.starts[2].x, y: s.map.starts[2].y + 5 });
  }, 60_000);
});
