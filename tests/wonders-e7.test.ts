// E7: as 20 maravilhas e a vitória por pontos (docs/eras/E5-E7-comercio-maravilhas.md, Fase N)
import { describe, it, expect } from 'vitest';
import { BUILDINGS, BUILD_MENU, UNITS } from '../src/core/data';
import { PLAYER_STATS, getBuildingStats, techCost, unitRank } from '../src/core/sim/modifiers';
import { TICK_RATE, WONDER_POINTS_HOLD_SECONDS, TERRAIN } from '../src/core/constants';
import { BUILDING_ART_ALIAS } from '../src/render/art/alias';
import { buildingLimitOk, canPlaceBuilding, onBuildingComplete, placeBuilding, spawnUnit, buildingsOf } from '../src/core/sim/entities';
import { allWondersOn, buildingAgeOf } from '../src/core/sim/restrictions';
import { aiWonderChoice } from '../src/core/sim/ai';
import { canTrain } from '../src/core/sim/commands';
import { killUnit, destroyBuilding } from '../src/core/sim/combat';
import { usePower } from '../src/core/sim/powers';
import { recomputeTerritory, enemyTerritorySpeed, territoryOwnerAt } from '../src/core/sim/territory';
import { wonderPointsTarget, wonderWinner, wonderPoints, wonderListed } from '../src/core/sim/wonders';
import { serialize, deserialize } from '../src/core/serialize';
import { idx, isPassable } from '../src/core/map/grid';
import { invalidateComponents, rectReachable } from '../src/core/map/components';
import { t } from '../src/i18n';
import type { GameState, Player } from '../src/core/types';
import { quickGame, run } from './helpers';

const WONDER_IDS = ['wonder_lion_gate', 'wonder_labyrinth', 'wonder_delphi', 'wonder_parthenon', 'wonder_zeus', 'wonder_artemis', 'wonder_epidaurus', 'wonder_colossus', 'wonder_mausoleum', 'wonder_pharos', 'wonder_great_library', 'wonder_hagia_sophia', 'wonder_theodosian_walls', 'wonder_meteora', 'wonder_candia_arsenal', 'wonder_knights_rhodes', 'wonder_palamidi', 'wonder_corinth_canal', 'wonder_panathenaic', 'wonder_olympus_throne'];

/** Lugar 4×4 (ou do tamanho do tipo) livre perto do Centro Cívico do jogador, a partir do anel `skip`. */
function findFree(s: GameState, owner: number, type: string, skip = 6): { x: number; y: number } {
  const tc = buildingsOf(s, owner).find((b) => b.type === 'town_center')!;
  for (let r = skip; r <= 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
    if (canPlaceBuilding(s, s.players[owner], type, tc.tx + dx, tc.ty + dy, true, true).ok) return { x: tc.tx + dx, y: tc.ty + dy };
  }
  throw new Error(`sem espaço para ${type}`);
}
const put = (s: GameState, owner: number, type: string, complete = true, skip = 6) => { const f = findFree(s, owner, type, skip); return placeBuilding(s, owner, type, f.x, f.y, complete); };
const finish = (s: GameState, b: ReturnType<typeof placeBuilding>) => { b.complete = true; b.hp = b.maxHp; onBuildingComplete(s, b); };

describe('E7: dados', () => {
  it('as 20 maravilhas: ids, Eras, atalho M, pegada 4×4, efeitos válidos, alias e menu', () => {
    const ws = Object.values(BUILDINGS).filter((b) => b.wonder);
    expect(ws.map((b) => b.id).sort()).toEqual([...WONDER_IDS].sort());
    const perAge = Array.from({ length: 8 }, (_, a) => ws.filter((b) => b.age === a).length);
    expect(perAge).toEqual([3, 4, 4, 3, 2, 1, 2, 1]);
    const ustats = new Set(['hp', 'attack', 'speed', 'range', 'los', 'trainTime', 'armor.hack', 'armor.pierce', 'armor.crush']);
    for (const b of ws) {
      expect(b.limit, b.id).toBe('wonder'); expect(b.hotkey).toBe('M'); expect([b.w, b.h]).toEqual([4, 4]); expect(b.wonderEffects, b.id).toBeDefined();
      for (const e of b.wonderEffects!) {
        if (e.type === 'unit') expect(ustats.has(e.stat), `${b.id} ${e.stat}`).toBe(true);
        if (e.type === 'building') expect(['hp', 'attack', 'range', 'los'].includes(e.stat), `${b.id} ${e.stat}`).toBe(true);
        if (e.type === 'player') expect(PLAYER_STATS.includes(e.stat), `${b.id} ${e.stat}`).toBe(true);
        const mt = (e as { match?: 'all' | { types?: string[] } }).match;
        if (mt && mt !== 'all' && mt.types) for (const ty of mt.types) expect(!!(UNITS[ty] || BUILDINGS[ty]), `${b.id} → ${ty}`).toBe(true);
      }
      expect(BUILD_MENU).toContain(b.id);
    }
    for (const id of WONDER_IDS.filter((x) => !['wonder_zeus', 'wonder_artemis', 'wonder_colossus'].includes(x))) {
      const a = BUILDING_ART_ALIAS[id]; expect(a, id).toBeTruthy(); expect(BUILDINGS[a].wonder).toBe(true);
    }
    expect(BUILDINGS.wonder_zeus.age).toBe(1); expect(BUILDINGS.wonder_artemis.age).toBe(1); expect(BUILDINGS.wonder_colossus.age).toBe(2);
    expect(BUILDINGS.wonder_zeus.cost).toEqual({ wood: 600, stone: 600, gold: 600, food: 600, favor: 100 });   // custo da E2 intacto
  });
  it('meta de pontos por Era final (e wonderPointsToWin)', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((maxAge) => wonderPointsTarget(quickGame({ maxAge })))).toEqual([2, 5, 10, 14, 18, 20, 20, 20]);
    expect(wonderPointsTarget(quickGame({ wonderPointsToWin: 7 }))).toBe(7);
  });
});

describe('E7: regras', () => {
  it('única no mapa: quem conclui primeiro fica; uma obra por jogador', () => {
    const s = quickGame(); s.players[0].age = 1; s.players[1].age = 1;
    put(s, 0, 'wonder_parthenon');
    expect(buildingLimitOk(s, s.players[1], 'wonder_parthenon').reason).toBe(t('err.wonderTaken', { name: BUILDINGS.wonder_parthenon.name, player: s.players[0].name }));
    expect(wonderListed(s, 1, 'wonder_parthenon')).toBe(false);
    put(s, 0, 'wonder_epidaurus', false, 14);
    expect(buildingLimitOk(s, s.players[0], 'wonder_epidaurus').reason).toBe(t('err.wonderBuilding', { name: BUILDINGS.wonder_epidaurus.name }));
  });
  it('corrida: as obras dos outros desabam e devolvem o custo', () => {
    const s = quickGame(); s.players[0].age = 1; s.players[1].age = 1;
    const mine = put(s, 0, 'wonder_parthenon', false);
    const theirs = put(s, 1, 'wonder_parthenon', false);
    const cost = getBuildingStats(s, s.players[1], 'wonder_parthenon').cost;
    const before = { ...s.players[1].resources };
    finish(s, mine);
    expect(theirs.dead).toBe(true);
    for (const [k, v] of Object.entries(cost)) expect(s.players[1].resources[k as keyof typeof before] - before[k as keyof typeof before], k).toBe(v);
  });
  it('várias por jogador: os efeitos somam', () => {
    const s = quickGame(); const p = s.players[0]; p.age = 1;
    put(s, 0, 'wonder_parthenon'); put(s, 0, 'wonder_epidaurus', true, 14);
    expect(p.mods.player.knowledgeRate).toBeCloseTo(1.25, 6); expect(p.mods.player.territoryRegen).toBe(1.5);
  });
  it('regras clássicas (cenário): só as 3, uma por jogador, Era de cenário', () => {
    const s = quickGame({ allWonders: false }); const p = s.players[0]; p.age = 3;
    expect(allWondersOn(s.config)).toBe(false);
    expect(buildingLimitOk(s, p, 'wonder_parthenon').reason).toBe(t('err.forbidden'));
    expect(buildingAgeOf(s.config, 'wonder_zeus')).toBe(3);
    p.age = 2;
    const f = findFree(s, 0, 'wonder_zeus');
    expect(canPlaceBuilding(s, p, 'wonder_zeus', f.x, f.y).reason).toContain(t('err.requiresAge', { age: '' }).split(' ')[0]);
    p.age = 3; put(s, 0, 'wonder_zeus');
    expect(buildingLimitOk(s, p, 'wonder_artemis').reason).toBe(t('err.oneWonder'));
    expect(allWondersOn(quickGame().config)).toBe(true);
  });
  it('efeitos simples: Porta dos Leões, Teodósio, Biblioteca de Alexandria, Hagia Sophia', () => {
    const s = quickGame(); const p = s.players[0]; p.age = 3;
    const c0 = techCost(p, 'civic1');
    put(s, 0, 'wonder_lion_gate'); put(s, 0, 'wonder_theodosian_walls', true, 14); put(s, 0, 'wonder_great_library', true, 22); put(s, 0, 'wonder_hagia_sophia', true, 30);
    expect(getBuildingStats(s, p, 'wall').hp).toBe(Math.round(BUILDINGS.wall.hp * 1.5 * 2));
    expect(p.mods.player.territory).toBe(2);
    expect(getBuildingStats(s, p, 'tower').range).toBe((BUILDINGS.tower.range ?? 0) + 1);
    const c1 = techCost(p, 'civic1');
    for (const k of Object.keys(c0)) expect(Math.abs(c1[k] - c0[k] * 0.75), k).toBeLessThanOrEqual(1);
    expect(p.mods.player.attrition).toBeCloseTo(0.4, 6);
  });
});

describe('E7: efeitos com código', () => {
  it('Labirinto: inimigos no território andam a 75 %; Titãs ignoram', () => {
    const s = quickGame(); const p = s.players[0]; p.age = 0;
    put(s, 0, 'wonder_labyrinth'); recomputeTerritory(s);
    const tc = buildingsOf(s, 0).find((b) => b.type === 'town_center')!;
    const foe = spawnUnit(s, 1, 'hoplite', tc.x + 2, tc.y + 2);
    expect(territoryOwnerAt(s, foe.x, foe.y)).toBe(0);
    expect(enemyTerritorySpeed(s, foe)).toBe(0.75);
    expect(enemyTerritorySpeed(s, spawnUnit(s, 1, 'cronus', tc.x + 2, tc.y + 2))).toBe(1);
    const own = buildingsOf(s, 1).find((b) => b.type === 'town_center')!;
    expect(enemyTerritorySpeed(s, spawnUnit(s, 1, 'hoplite', own.x + 2, own.y + 2))).toBe(1);
  });
  it('Epidauro: cura 1,5 de vida por segundo no território, 5 s depois do último golpe', () => {
    const s = quickGame(); const p = s.players[0]; p.age = 1;
    put(s, 0, 'wonder_epidaurus'); recomputeTerritory(s);
    const tc = buildingsOf(s, 0).find((b) => b.type === 'town_center')!;
    const u = spawnUnit(s, 0, 'hoplite', tc.x + 3, tc.y + 3);
    u.hp = u.maxHp - 20; u.lastDamageTick = -1000;
    run(s, 5 * TICK_RATE);
    expect(u.maxHp - 20 + 7.5 - u.hp).toBeGreaterThanOrEqual(-1.5); expect(u.hp - (u.maxHp - 20)).toBeLessThanOrEqual(9.1); expect(u.hp).toBeGreaterThan(u.maxHp - 20);
  });
  it('Delfos: Oráculo grátis a cada 180 s', () => {
    const s = quickGame(); const p = s.players[0]; p.age = 0;
    put(s, 0, 'wonder_delphi');
    run(s, 179 * TICK_RATE); expect(p.revealUntil).toBeLessThanOrEqual(s.tick);
    run(s, 2 * TICK_RATE); expect(p.revealUntil).toBeGreaterThan(s.tick);
  }, 30000);
  it('Mausoléu: o herói morto em combate renasce no Templo em 30 s; delete não conta', { timeout: 30000 }, () => {
    const s = quickGame(); const p = s.players[0]; p.age = 3;
    const temple = put(s, 0, 'temple'); put(s, 0, 'wonder_mausoleum', true, 14);
    const h = spawnUnit(s, 0, 'heracles', temple.x + 3, temple.y + 3);
    killUnit(s, h, 1);
    expect(p.respawns.length).toBe(1);
    expect(canTrain(s, p, temple, 'heracles').reason).toBe(t('err.alreadyRespawning', { name: UNITS.heracles.name }));
    run(s, 31 * TICK_RATE);
    expect([...s.units.values()].filter((u) => u.owner === 0 && !u.dead && u.type === 'heracles').length).toBe(1);
    expect(p.respawns.length).toBe(0);
    const h2 = [...s.units.values()].find((u) => u.owner === 0 && u.type === 'heracles')!;
    killUnit(s, h2, -1);
    expect(p.respawns.length).toBe(0);
  });
  it('Biblioteca de Alexandria: dois estudos andam juntos; sem ela, um por vez', () => {
    const mk = (withWonder: boolean) => {
      const s = quickGame(); const p = s.players[0]; p.age = 2;
      const lib = put(s, 0, 'academy');
      if (withWonder) put(s, 0, 'wonder_great_library', true, 14);
      lib.queue.push({ kind: 'tech', id: 'civic1', elapsed: 0, total: 42 }, { kind: 'tech', id: 'science1', elapsed: 0, total: 35 });
      run(s, 2 * TICK_RATE);
      return lib;
    };
    const a = mk(true); expect(a.queue[0].elapsed).toBeGreaterThan(0); expect(a.queue[1].elapsed).toBeGreaterThan(0);
    const b = mk(false); expect(b.queue[0].elapsed).toBeGreaterThan(0); expect(b.queue[1].elapsed).toBe(0);
  });
  it('Estádio: a patente vem duas vezes mais rápido', () => {
    const s = quickGame(); const p = s.players[0]; p.age = 3;
    const tc = buildingsOf(s, 0)[0];
    const u = spawnUnit(s, 0, 'hoplite', tc.x + 3, tc.y + 3); u.kills = 2;
    expect(unitRank(s, u)).toBe(0);
    put(s, 0, 'wonder_panathenaic', true, 14);
    p.age = 6;
    expect(unitRank(s, u)).toBe(1);
  });
  it('Trono: recarrega os poderes e dá +1 uso de cada', () => {
    const s = quickGame(); const p = s.players[0]; p.age = 4;
    p.powers = [{ id: 'bolt', used: true }];
    put(s, 0, 'wonder_olympus_throne');
    expect(p.powers[0].used).toBe(false); expect(p.powers[0].charges).toBe(1);
    const tc = buildingsOf(s, 0).find((b) => b.type === 'town_center')!;
    const foes = [0, 1, 2].map((k) => spawnUnit(s, 1, 'hoplite', tc.x + 3 + k, tc.y + 3));
    expect(usePower(s, p, 'bolt', undefined, undefined, foes[0].id).ok).toBe(true);
    expect(usePower(s, p, 'bolt', undefined, undefined, foes[1].id).ok).toBe(true);
    expect(usePower(s, p, 'bolt', undefined, undefined, foes[2].id).reason).toBe(t('err.powerUsed'));
  });
  it('Farol: litoral revelado', () => {
    const s = quickGame({ mapType: 'coastal', seed: 42 }); const p = s.players[0]; p.age = 2;
    put(s, 0, 'wonder_pharos', true, 6);
    expect(p.mods.player.coastSight).toBe(1);
  });
});

describe('E7: vitória', () => {
  it('por pontos: meta mantida por 120 s vence; perder pontos cancela', { timeout: 30000 }, () => {
    const s = quickGame({ wonderVictory: 'points', wonderPointsToWin: 5 }); const p = s.players[0]; p.age = 2;
    put(s, 0, 'wonder_parthenon'); put(s, 0, 'wonder_great_library', true, 14);
    run(s, 2 * TICK_RATE);
    expect(p.wonderHoldStart).toBeGreaterThanOrEqual(0);
    run(s, (WONDER_POINTS_HOLD_SECONDS + 1) * TICK_RATE);
    expect(s.gameOver).toBe(true); expect(s.winner).toBe(0);
    const s2 = quickGame({ wonderVictory: 'points', wonderPointsToWin: 5 }); s2.players[0].age = 2;
    put(s2, 0, 'wonder_parthenon'); const lib = put(s2, 0, 'wonder_great_library', true, 14);
    run(s2, 60 * TICK_RATE); destroyBuilding(s2, lib, 1); run(s2, 61 * TICK_RATE);
    expect(s2.gameOver).toBe(false); expect(s2.players[0].wonderHoldStart).toBe(-1);
  });
  it('hold (6 min) e off', { timeout: 40000 }, () => {
    const s = quickGame({ wonderVictory: 'hold' }); s.players[0].age = 1; put(s, 0, 'wonder_parthenon');
    run(s, 361 * TICK_RATE);
    expect(s.gameOver).toBe(true); expect(s.winner).toBe(0);
    const o = quickGame({ wonderVictory: 'off' }); o.players[0].age = 1; put(o, 0, 'wonder_parthenon');
    run(o, 361 * TICK_RATE);
    expect(o.gameOver).toBe(false);
  });
  it('desempate sem o índice do jogador', () => {
    const s = quickGame({ wonderPointsToWin: 2 }); s.players[0].age = 1; s.players[1].age = 1;
    put(s, 0, 'wonder_parthenon'); const e = put(s, 1, 'wonder_epidaurus');
    s.players[0].wonderHoldStart = 0; s.players[1].wonderHoldStart = 0; s.tick = 121 * TICK_RATE;
    expect(wonderWinner(s)).toBeNull();
    destroyBuilding(s, e, -1); s.players[1].age = 2; put(s, 1, 'wonder_colossus', true, 14);
    expect(wonderPoints('wonder_colossus')).toBe(3);
    expect(wonderWinner(s)).toBe(1);
  });
});

describe('E7: IA e save', () => {
  it('a IA ergue maravilha fora de cenário; a escolha varia com a personalidade', { timeout: 60000 }, () => {
    const s = quickGame({}, true); const p = s.players[0]; p.age = 3;
    for (const k of Object.keys(p.resources)) (p.resources as Record<string, number>)[k] = 30000;
    const has = () => [...s.buildings.values()].some((b) => b.owner === 0 && !b.dead && BUILDINGS[b.type].wonder && BUILDINGS[b.type].age <= 3);
    for (let i = 0; i < 16 && !has(); i++) run(s, 30 * TICK_RATE);   // a IA constrói uma coisa por pensamento: a maravilha vem depois do resto (~5–7 min)
    expect(has()).toBe(true);
    const q = quickGame({}, true); q.players[0].age = 3;
    q.players[0].ai!.personality = 0; const a = aiWonderChoice(q, q.players[0]);
    q.players[0].ai!.personality = 1; const b = aiWonderChoice(q, q.players[0]);
    expect(a).not.toBeNull(); expect(a).not.toBe(b);
  });
  it('save: respawns, wonderHoldStart e charges vão e voltam; padrões em saves antigos', () => {
    const s = quickGame(); const p = s.players[0];
    p.respawns = [{ type: 'heracles', at: 999 }]; p.wonderHoldStart = 77; p.powers = [{ id: 'bolt', used: true, charges: 2 }];
    const js = serialize(s);
    expect(serialize(deserialize(js))).toBe(js);
    const o = JSON.parse(js); delete o.players[0].respawns; delete o.players[0].wonderHoldStart;
    const old = deserialize(JSON.stringify(o)).players[0];
    expect(old.wonderHoldStart).toBe(-1); expect(old.respawns).toEqual([]);
  });
});

describe('E7: Canal de Corinto (passagem naval)', () => {
  it('o Canal pronto abre o istmo aos navios, sobrevive ao save e fecha ao cair; tropas continuam passando', () => {
    const s = quickGame(); const p = s.players[0]; p.age = 6;
    const m = s.map;
    // dois lagos fechados (y 0–13) ligados só por um istmo de 4 tiles
    for (let y = 0; y < 14; y++) for (let x = 10; x < 70; x++) {
      const i = idx(m, x, y);
      if (m.nodeAt[i] !== -1) { m.nodes.delete(m.nodeAt[i]); m.nodeAt[i] = -1; }
      const land = y === 0 || y === 13 || x === 10 || x === 69 || (x >= 38 && x <= 41);
      m.terrain[i] = land ? TERRAIN.GRASS : TERRAIN.WATER; m.blocked[i] = land ? 0 : 1;
    }
    invalidateComponents(m);
    expect(rectReachable(m, 20, 6, 60, 6, 1, 1, false, 'naval')).toBe(false);
    const canal = placeBuilding(s, 0, 'wonder_corinth_canal', 38, 5, true);
    expect(rectReachable(m, 20, 6, 60, 6, 1, 1, false, 'naval')).toBe(true);
    expect(isPassable(m, 39, 6)).toBe(true);   // tropas por cima (passable)
    const s2 = deserialize(serialize(s));
    expect(rectReachable(s2.map, 20, 6, 60, 6, 1, 1, false, 'naval')).toBe(true);
    destroyBuilding(s, canal, -1);
    expect(rectReachable(m, 20, 6, 60, 6, 1, 1, false, 'naval')).toBe(false);
    const _p: Player = p; void _p;
  });
});
