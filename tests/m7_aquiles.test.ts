// m7 "A Cólera de Aquiles" (docs/STORY.md §5.4): setup da ficha no mapa gerado real (forest 7707), aldeias alcançáveis e na
// ordem "a mais perto das naus primeiro", marchas por dificuldade (G3) com a escolta saindo do acampamento junto com Aquiles,
// volta às naus, marcha adiada enquanto há luta no acampamento, Tétis (o paliativo do Raio de Zeus: enquanto o acampamento está de
// pé, cada queda de Aquiles o devolve às naus), interceptar salva a aldeia, a Liga pelo leste, a isca do acampamento queimado, o
// segredo de Odisseu (G1) e os reforços das naus (que ficam de guarda). Partidas curtas (a mais longa, a passiva até a 4ª aldeia,
// ~12 min de jogo); a passiva de 6 min roda em tests/missions.test.ts e o roteiro longo em scripts/missions.ts.
import { describe, it, expect } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { applyCommand } from '../src/core/sim/commands';
import { destroyBuilding, killUnit } from '../src/core/sim/combat';
import { spawnUnit } from '../src/core/sim/entities';
import { giveOrder } from '../src/core/sim/units';
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

  it('G3: marchas a cada 240/180/120 s, teto dos reforços 20/26/30 e a Liga aos 750/600/450 s (Fácil/Normal/Difícil); Aquiles mais forte no Difícil', () => {
    const want = { easy: [390, 630, 870, 20, 750], normal: [330, 510, 690, 26, 600], hard: [270, 390, 510, 30, 450] } as const;
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const s = start(d);
      run(s, 2);
      const v = s.scenario!.vars;
      expect([v.rota2_t, v.rota3_t, v.rota4_t, v.teto, v.liga_t], d).toEqual([...want[d]]);
      expect(s.players[2].techs.includes('anthropomorphic'), d).toBe(d === 'hard');
    }
  }, 60_000);

  it('rota1 aos 150 s: Aquiles, os mirmidões e a escolta saem juntos do acampamento para queimar a aldeia1 e, queimada, voltam às naus', () => {
    const s = start('normal');
    const raids: RaidRecord[] = [];
    setRaidObserver((r) => raids.push(r));
    try {
      until(s, 149);
      expect(s.scenario!.fired).not.toContain('rota1');
      until(s, 150);
      expect(s.scenario!.fired).toContain('rota1');
      const a1 = tagged(s, 'aldeia1')!;
      // a escolta nasce no acampamento (não perto da aldeia: sem invasão) e marcha com Aquiles
      expect(raids).toHaveLength(0);
      const escort = tagIds(s, 'escolta1').map((id) => s.units.get(id)!);
      expect(escort.map((u) => u.type)).toEqual(['myrmidon', 'peltast', 'peltast']);
      for (const u of escort) expect(d2(u, camp(s)), u.type).toBeLessThanOrEqual(12 * 12);
      for (const u of alive(s, 2).filter((u) => d2(u, camp(s)) < 15 * 15)) expect(u.targetId, u.type).toBe(a1.id);
      expect(lines(s).some((t) => t.includes('Adivinhe qual escolhi'))).toBe(true);
      expect(lines(s).some((t) => t.includes('Fumaça a sudeste'))).toBe(true);
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

  it('escolta junto de Aquiles: na passiva, cada aldeia cai com ele a até 6 tiles (ninguém nasce perto dela e a queima sozinho)', () => {
    for (const d of ['normal', 'hard'] as const) {
      const s = start(d);
      const pos = Object.fromEntries(VILLAGES.map((t) => [t, { x: tagged(s, t)!.x, y: tagged(s, t)!.y }]));
      const fell: Record<string, number> = {};
      while (Object.keys(fell).length < 4 && s.tick < 900 * TICK_RATE && !s.gameOver) {
        tick(s);
        for (const t of VILLAGES) {
          if (fell[t] !== undefined || tagged(s, t)) continue;
          const a = achilles(s);
          fell[t] = a ? Math.sqrt(d2(a, pos[t])) : Infinity;
        }
      }
      expect(Object.keys(fell).sort(), d).toEqual([...VILLAGES]);
      for (const t of VILLAGES) expect(fell[t], `${d} ${t}`).toBeLessThanOrEqual(6);
    }
  }, 60_000);

  it('os reforços guardam o acampamento: a marcha é Aquiles, os mirmidões do desembarque e a escolta dela', () => {
    const s = start('normal');
    until(s, 241);
    const guard = alive(s, 2).filter((u) => u.type !== 'achilles' && !tagIds(s, 'mirmidoes').includes(u.id) && !tagIds(s, 'escolta1').includes(u.id));
    expect(guard.length).toBe(3);   // os reforços dos 240 s
    until(s, 330);
    expect(s.scenario!.fired).toContain('rota2');
    const a2 = tagged(s, 'aldeia2')!;
    expect(achilles(s)!.targetId).toBe(a2.id);
    for (const id of tagIds(s, 'escolta2')) expect(s.units.get(id)!.targetId).toBe(a2.id);
    for (const u of guard.filter((u) => !u.dead)) expect(u.targetId, u.type).not.toBe(a2.id);
  }, 60_000);

  it('interceptar salva a aldeia: derrubados Aquiles, os mirmidões e a escolta no caminho, a aldeia2 fica de pé e Tétis o prende no acampamento até a próxima marcha', () => {
    const s = start('normal');
    until(s, 331);
    expect(s.scenario!.fired).toContain('rota2');
    const a2 = tagged(s, 'aldeia2') as Building;
    const hp = a2.hp;
    for (const tag of ['aquiles', 'mirmidoes', 'escolta2']) for (const id of tagIds(s, tag)) { const u = s.units.get(id); if (u && !u.dead) killUnit(s, u, 0); }
    run(s, 60);
    expect(tagged(s, 'aldeia2')).toBe(a2);
    expect(a2.dead).toBe(false);
    expect(a2.hp).toBe(hp);
    expect(s.scenario!.fired).not.toContain('volta2');
    expect(s.scenario!.vars.resgates).toBe(1);
    expect(d2(achilles(s)!, camp(s))).toBeLessThanOrEqual(8 * 8);
    expect(s.scenario!.vars.aldeias_perdidas).toBe(1);
  }, 60_000);

  it('marcha adiada: com luta no acampamento a guarnição não larga a briga; a marcha sai quando a luta acaba', () => {
    const s = start('normal');
    until(s, 146);
    const c = camp(s);
    const raiders = Array.from({ length: 6 }, (_, k) => spawnUnit(s, 0, 'hypaspist', c.x - 3.5 + k, c.y - 6.5));
    for (const u of raiders) giveOrder(s, u, { type: 'attack', targetId: c.id });
    until(s, 152);
    expect(s.scenario!.fired).not.toContain('rota1');
    expect(alive(s, 2).some((u) => u.state === 'attack' && d2(u, c) < 15 * 15)).toBe(true);
    for (let i = 0; i < 120 && !s.scenario!.fired.includes('rota1'); i++) run(s, 1);
    expect(s.scenario!.fired).toContain('rota1');
    expect(raiders.every((u) => u.dead)).toBe(true);
    expect(c.dead).toBe(false);
  }, 60_000);

  it('a Liga do Istmo invade pelo leste aos 600 s (Normal), com o aviso do Batedor', () => {
    const s = start('normal');
    const raids: RaidRecord[] = [];
    setRaidObserver((r) => raids.push(r));
    try {
      until(s, 599);
      expect(s.scenario!.fired).not.toContain('liga');
      until(s, 600);
      expect(s.scenario!.fired).toContain('liga');
      expect(raids).toEqual([expect.objectContaining({ owner: 1, requested: 6, spawned: 6 })]);
      const tc = townCenter(s, 0)!;
      const league = alive(s, 1).filter((u) => u.order?.type === 'attackMove');
      expect(league).toHaveLength(6);
      for (const u of league) expect(u.x, u.type).toBeGreaterThan(tc.x + 8);   // do leste
      expect(lines(s).some((t) => t.includes('A Liga do Istmo aproveita a fumaça'))).toBe(true);
    } finally { setRaidObserver(null); }
  }, 60_000);

  it('paliativo do Raio (sem G11): enquanto o acampamento das naus está de pé, Tétis devolve Aquiles a cada queda — nem o Raio de Zeus vence a missão', () => {
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
    expect(lines(s).some((t) => t.includes('Tétis o trará de volta, arconte: queime-o'))).toBe(true);
    expect(lines(s).some((t) => t.includes('Ainda não, meu filho'))).toBe(true);
    // de novo: Tétis volta a salvá-lo (repetível); Tétis e a Pítia falam só na 1ª vez, depois o Batedor avisa a cada resgate
    killUnit(s, second, 0);
    run(s, 2);
    expect(achilles(s)).toBeDefined();
    expect(s.scenario!.vars.resgates).toBe(2);
    const scout = () => lines(s).filter((t) => t.includes('Tétis levou Aquiles de volta')).length;
    expect(lines(s).filter((t) => t.includes('Tétis o trará de volta'))).toHaveLength(1);
    expect(lines(s).filter((t) => t.includes('Ainda não, meu filho'))).toHaveLength(1);
    expect(scout()).toBe(1);
    killUnit(s, achilles(s)!, 0);
    run(s, 2);
    expect(s.scenario!.vars.resgates).toBe(3);
    expect(scout()).toBe(2);
    expect(alive(s, 2, 'achilles')).toHaveLength(1);
    // no cerco (tropas de Argos a até 15 tiles do acampamento) o jogador vê Aquiles voltar: o Batedor não repete o aviso
    const watcher = spawnUnit(s, 0, 'hypaspist', camp(s).x + 0.5, camp(s).y - 13.5);
    watcher.hp = watcher.maxHp = 1e6;   // só um par de olhos (não pode morrer no meio da conta)
    for (let k = 0; k < 3; k++) { killUnit(s, achilles(s)!, 0); run(s, 2); }
    expect(s.scenario!.vars.resgates).toBe(6);
    expect(scout()).toBe(2);
    killUnit(s, watcher, 2);
    run(s, 1);
    killUnit(s, achilles(s)!, 0);
    run(s, 2);
    expect(s.scenario!.vars.resgates).toBe(7);
    expect(scout()).toBe(3);
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
