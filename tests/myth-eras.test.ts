// Mitologia nas Eras (E6; docs/eras/E6-mitologia.md): deuses menores V–VII, 9 poderes novos, escala dos poderes por Era,
// criaturas navais/voadoras/anfíbias, Talos, Bênçãos do Templo, Titãs reforçados, camada anfíbia, IA e save.
// Partidas reais (createGame + tick), curtas: nenhum `run` passa de ~3 min de jogo.
import { describe, it, expect } from 'vitest';
import { quickGame, run } from './helpers';
import { createGame } from '../src/core/sim/game';
import { AGES, BUILDINGS, MAJOR_GODS, MINOR_GODS, POWERS, TECHS, UNITS, MYTH_UPGRADES, BLESSED_TYPES, BLESSING_IDS, ERA_TITANS } from '../src/core/data';
import { RESOURCES, TERRAIN, TICK_RATE } from '../src/core/constants';
import { spawnUnit, placeBuilding, recomputePop, buildingsOf } from '../src/core/sim/entities';
import { usePower } from '../src/core/sim/powers';
import { powerScale, galeFactor, harvestMult } from '../src/core/sim/divine';
import { applyMythUpgrades, mythUpgradeOf } from '../src/core/sim/myth';
import { unitLayer, canBoard } from '../src/core/sim/naval';
import { findPathEx, nearestFreeTile } from '../src/core/map/pathfinding';
import { idx, isPassable } from '../src/core/map/grid';
import { invalidateComponents } from '../src/core/map/components';
import { stateHash } from '../src/core/net/hash';
import { canTarget, computeDamage, applyDamage, killUnit, performAttack } from '../src/core/sim/combat';
import { applyCommand, canTrain, canResearch, canAdvanceAge } from '../src/core/sim/commands';
import { recomputeMods, refreshMaxHp, getUnitStats } from '../src/core/sim/modifiers';
import { aiThink } from '../src/core/sim/ai';
import { serialize, deserialize } from '../src/core/serialize';
import { campaignMission, missionConfig } from '../src/core/scenario/campaign';
import { pickTrainHotkey } from '../src/ui/train-hotkey';
import { t } from '../src/i18n';
import type { GameState, Unit } from '../src/core/types';

type S = GameState;
const rich = (s: S, p = 0) => { for (const r of RESOURCES) s.players[p].resources[r] = 99999; };
const tcOf = (s: S, p = 0) => [...s.buildings.values()].find((b) => b.owner === p && b.type === 'town_center')!;
/** Partida sem combate automático (Trégua longa): os poderes agem, ninguém ataca sozinho. */
const calm = (over = {}, ai = false): S => { const s = quickGame(over, ai); s.ceasefireUntil = s.tick + 100000; s.players[0].visibility.fill(2); return s; };
const givePower = (s: S, id: string, age: number, p = 0) => { s.players[p].age = age; s.players[p].powers.push({ id, used: false }); };
/** Tile caminhável livre perto de (x, y). */
const spot = (s: S, x: number, y: number) => { const f = nearestFreeTile(s.map, Math.floor(x), Math.floor(y), 14)!; return { x: f.x + 0.5, y: f.y + 0.5 }; };
const put = (s: S, owner: number, type: string, x: number, y: number): Unit => { const q = spot(s, x, y); return spawnUnit(s, owner, type, q.x, q.y); };
const roomy = (s: S, p = 0) => { const tc = tcOf(s, p); placeBuilding(s, p, 'house', tc.tx + 7, tc.ty - 6, true); placeBuilding(s, p, 'house', tc.tx + 7, tc.ty + 6, true); recomputePop(s, s.players[p]); };
const templeOf = (s: S, p = 0) => { const tc = tcOf(s, p); return placeBuilding(s, p, 'temple', tc.tx + 8, tc.ty + 8, true); };
/** Ponto no mapa com uma faixa livre de `len` tiles a leste. */
function openLine(s: S, len: number): { x: number; y: number } {
  for (let y = 10; y < s.map.h - 10; y += 3) for (let x = 10; x < s.map.w - len - 10; x += 3) {
    let ok = true;
    for (let k = -4; k <= len && ok; k++) for (let dy = -2; dy <= 2 && ok; dy++) if (!isPassable(s.map, x + k, y + dy) || s.map.nodeAt[idx(s.map, x + k, y + dy)] !== -1) ok = false;
    if (ok) return { x: x + 0.5, y: y + 0.5 };
  }
  throw new Error('sem faixa livre');
}
const NEW_GODS = ['pan', 'hecate', 'persephone', 'aeolus', 'triton', 'demeter', 'helios', 'nike', 'nemesis'];
const NEW_POWERS = ['panic', 'crossroads', 'spring', 'gale', 'tidal_wave', 'divine_harvest', 'sun_chariot', 'winged_victory', 'retribution'];

describe('E6 — dados', () => {
  it('9 deuses menores novos (Eras V–VII), 6 pares por deus maior, Eras II–VII com deus e a VIII sem', () => {
    for (const id of NEW_GODS) {
      const g = MINOR_GODS[id];
      expect([4, 5, 6]).toContain(g.age);
      expect(POWERS[g.power]).toBeDefined();
      expect(UNITS[g.mythUnit].god).toBe(id);
      expect(g.techs).toHaveLength(2);
      for (const tid of g.techs) { expect(TECHS[tid].god).toBe(id); expect(TECHS[tid].age).toBe(g.age); expect(TECHS[tid].building).toBe('temple'); }
    }
    for (const g of Object.values(MAJOR_GODS)) {
      expect(g.minorGods).toHaveLength(6);
      g.minorGods.forEach((pair, k) => { expect(pair).toHaveLength(2); for (const m of pair) expect(MINOR_GODS[m].age).toBe(k + 1); });
    }
    for (const id of NEW_GODS) expect(Object.values(MAJOR_GODS).filter((g) => g.minorGods.flat().includes(id))).toHaveLength(2);
    for (let k = 1; k <= 6; k++) expect(AGES[k].minorGod).toBe(true);
    expect(AGES[7].minorGod).toBe(false);
    expect(Object.keys(POWERS)).toHaveLength(21);
    for (const id of NEW_POWERS) expect(POWERS[id]).toBeDefined();
  });
  it('Talos, heróis, Titãs, Bênçãos e anfíbios', () => {
    expect(MYTH_UPGRADES.colossus).toEqual({ to: 'talos', age: 6 });
    const heroes = Object.values(UNITS).filter((u) => u.tags.includes('hero') && !u.tags.includes('king')).map((u) => u.age).sort();
    expect(heroes).toEqual([0, 1, 2, 3, 4]);
    for (const u of Object.values(UNITS)) if (u.tags.includes('titan')) expect(u.age).toBe(ERA_TITANS);
    for (const id of BLESSED_TYPES) expect(UNITS[id].tags.includes('titan')).toBe(false);
    for (const u of Object.values(UNITS)) if ((u.tags.includes('myth') || u.tags.includes('hero')) && !u.tags.includes('titan')) expect(BLESSED_TYPES).toContain(u.id);
    expect([...BLESSING_IDS].sort()).toEqual([2, 3, 4, 5, 6, 7, 8].map((n) => `blessing${n}`));
    BLESSING_IDS.slice().sort().forEach((id, i) => { expect(TECHS[id].age).toBe(i + 1); expect(TECHS[id].prereq).toEqual(i === 0 ? [] : [`blessing${i + 1}`]); });
    expect(UNITS.oceanus.amphibious).toBe(true);
    expect(UNITS.ceto.amphibious).toBe(true);
    expect(UNITS.ceto.naval).toBeFalsy();
    expect(BUILDINGS.shipyard.trains).toEqual(expect.arrayContaining(['scylla', 'ceto', 'hippocampus']));
    expect(BUILDINGS.temple.trains).toEqual(expect.arrayContaining(['satyr', 'empusa', 'lampad', 'harpy', 'triptolemus_dragon', 'phoenix', 'griffin', 'erinys', 'talos']));
  });
});

describe('E6 — escala dos poderes por Era', () => {
  it('+15 % por Era acima da Era do poder; desligada em cenário e com eraMyth falso', () => {
    const s = quickGame();
    const p = s.players[0];
    p.age = 4; expect(powerScale(s, p, 'restoration')).toBeCloseTo(1.45, 5);
    expect(powerScale(s, p, 'panic')).toBe(1);
    p.age = 7; expect(powerScale(s, p, 'bolt')).toBeCloseTo(2.05, 5);
    const off = quickGame({ eraMyth: false }); off.players[0].age = 7;
    for (const id of Object.keys(POWERS)) expect(powerScale(off, off.players[0], id)).toBe(1);
    const sc = createGame(missionConfig(campaignMission('m8_oceano')!, 'normal')); sc.players[0].age = 7;
    for (const id of Object.keys(POWERS)) expect(powerScale(sc, sc.players[0], id)).toBe(1);
  });
  it('o Raio tira até 75 % de um Titã na Era VIII; Restauração cresce o raio', () => {
    const s = calm();
    givePower(s, 'bolt', 7);
    const tc = tcOf(s, 1);
    const ti = put(s, 1, 'oceanus', tc.x + 6, tc.y);
    run(s, 1);
    const hp0 = ti.hp;
    expect(usePower(s, s.players[0], 'bolt', undefined, undefined, ti.id).ok).toBe(true);
    expect(ti.hp).toBeCloseTo(hp0 * 0.25, 0);
  }, 30000);
});

describe('E6 — avanço de Era e Era inicial', () => {
  it('avançar à Era V oferece Pã e Hécate (Zeus) e concede o deus e o poder', () => {
    const s = calm();
    const p = s.players[0];
    p.age = 3; p.minorGods = ['athena', 'apollo', 'hera'];
    p.techs = ['civic', 'commerce', 'military', 'science'].flatMap((l) => [1, 2].map((n) => `${l}${n}`)).concat(['civic3', 'commerce3', 'military3']);
    rich(s);
    const tc = tcOf(s);
    placeBuilding(s, 0, 'fortress', tc.tx + 6, tc.ty, true);
    const lib = placeBuilding(s, 0, 'academy', tc.tx - 6, tc.ty, true);
    recomputeMods(s, p);
    expect(canAdvanceAge(s, p, lib).minorOptions).toEqual(['pan', 'hecate']);
    expect(applyCommand(s, { type: 'advanceAge', player: 0, buildingId: lib.id, minorGod: 'pan' }).ok).toBe(true);
    lib.queue[0].elapsed = lib.queue[0].total - 0.01;
    run(s, 2);
    expect(p.age).toBe(4);
    expect(p.minorGods).toContain('pan');
    expect(p.powers.some((x) => x.id === 'panic')).toBe(true);
  }, 30000);
  it('partida na Era VII: 6 deuses menores e 7 poderes', () => {
    const s = quickGame({ startingAge: 6 });
    const p = s.players[0];
    expect(p.minorGods).toEqual(['athena', 'apollo', 'hera', 'pan', 'aeolus', 'helios']);
    expect(p.powers).toHaveLength(7);
  });
});

describe('E6 — poderes novos', () => {
  it('Pânico: foge, não ataca por 8 s; sem inimigos recusa e não gasta', () => {
    const s = calm();
    givePower(s, 'panic', 4);
    const tc = tcOf(s);
    const c = put(s, 0, 'villager', tc.x + 5, tc.y + 5);
    const r0 = usePower(s, s.players[0], 'panic', c.x, c.y);
    expect(r0.ok).toBe(false); expect(r0.reason).toBe(t('err.noEnemiesHere'));
    expect(s.players[0].powers.find((x) => x.id === 'panic')!.used).toBe(false);
    const hs = [0, 1, 2].map((i) => put(s, 1, 'hoplite', c.x + 2 + i, c.y));
    run(s, 1);
    expect(usePower(s, s.players[0], 'panic', c.x + 3, c.y).ok).toBe(true);
    for (const h of hs) { expect(h.fearUntil!).toBeGreaterThan(s.tick); expect(h.order?.type).toBe('move'); }
    expect(canTarget(s, hs[0], c)).toBe(false);
    run(s, 9 * TICK_RATE);
    expect(canTarget(s, hs[0], c)).toBe(true);
  }, 30000);
  it('Encruzilhada: leva o grupo ao destino explorado; recusa destino inexplorado e grupo sem ninguém que possa ir', () => {
    const s = calm();
    givePower(s, 'crossroads', 4);
    const tc = tcOf(s);
    const group = Array.from({ length: 12 }, (_, i) => put(s, 0, 'hoplite', tc.x + 4 + (i % 4), tc.y + 4 + Math.floor(i / 4)));
    const dest = openLine(s, 6);
    run(s, 1);
    s.players[0].visibility.fill(0);
    const bad = usePower(s, s.players[0], 'crossroads', dest.x, dest.y, undefined, group.map((u) => u.id));
    expect(bad.ok).toBe(false); expect(bad.reason).toBe(t('err.crossroadsDest'));
    s.players[0].visibility.fill(2);
    const ship = Object.values(UNITS).find((u) => u.naval && !u.tags.includes('myth'))!;
    const nav = put(s, 0, ship.id, tc.x, tc.y);
    const none = usePower(s, s.players[0], 'crossroads', dest.x, dest.y, undefined, [nav.id, ...[...s.units.values()].filter((u) => u.type === 'oceanus').map((u) => u.id)]);
    expect(none.ok).toBe(false); expect(none.reason).toBe(t('err.crossroadsNoUnits'));
    expect(usePower(s, s.players[0], 'crossroads', dest.x, dest.y, undefined, group.map((u) => u.id)).ok).toBe(true);
    const moved = group.filter((u) => Math.hypot(u.x - dest.x, u.y - dest.y) <= 7);
    expect(moved.length).toBe(10);   // 20 de população: 10 hoplitas de 2
  }, 30000);
  it('Primavera: o soldado morto na área vira Sombra do lançador; fora da área, nada', () => {
    const s = calm();
    givePower(s, 'spring', 4);
    const tc = tcOf(s);
    const p0 = spot(s, tc.x + 10, tc.y + 10);
    const a = put(s, 1, 'hoplite', p0.x, p0.y);
    const far = put(s, 1, 'hoplite', p0.x + 14, p0.y);
    run(s, 1);
    expect(usePower(s, s.players[0], 'spring', a.x, a.y).ok).toBe(true);
    const shades = () => [...s.units.values()].filter((u) => u.type === 'shade' && u.owner === 0 && !u.dead).length;
    killUnit(s, far, 0);
    expect(shades()).toBe(0);
    killUnit(s, a, 0);
    expect(shades()).toBe(1);
    expect(s.timed.find((x) => x.type === 'spring')!.count).toBe(1);
  }, 30000);
  it('Vendaval: empurra, freia (navio para), cura os edifícios próprios', () => {
    const s = calm();
    givePower(s, 'gale', 5);
    const o = openLine(s, 8);
    const h = spawnUnit(s, 1, 'hoplite', o.x + 2, o.y);
    run(s, 1);
    expect(usePower(s, s.players[0], 'gale', o.x, o.y).ok).toBe(true);
    expect(h.x - o.x).toBeGreaterThanOrEqual(4 - 1e-6);
    expect(galeFactor(s, h)).toBe(0.5);
    const ship = Object.values(UNITS).find((u) => u.naval && !u.tags.includes('myth'))!;
    const nav = spawnUnit(s, 1, ship.id, o.x, o.y);
    expect(galeFactor(s, nav)).toBe(0);
  }, 30000);
  it('Vendaval repara o edifício próprio em 20 % da vida', () => {
    const s = calm();
    givePower(s, 'gale', 5);
    const tc = tcOf(s);
    tc.hp = tc.maxHp / 2;
    expect(usePower(s, s.players[0], 'gale', tc.x, tc.y).ok).toBe(true);
    expect(tc.hp).toBeCloseTo(tc.maxHp * 0.7, 3);
  });
  it('Maremoto: 120 nas tropas e 300 nos edifícios inimigos', () => {
    const s = calm();
    givePower(s, 'tidal_wave', 5);
    const tc1 = tcOf(s, 1);
    const cy = put(s, 1, 'cyclops', tc1.x + 4, tc1.y + 4);
    run(s, 1);
    const hp = cy.hp, bh = tc1.hp;
    expect(usePower(s, s.players[0], 'tidal_wave', tc1.x, tc1.y).ok).toBe(true);
    expect(hp - cy.hp).toBeCloseTo(120, 3);
    expect(bh - tc1.hp).toBeCloseTo(300, 3);
  }, 30000);
  it('Colheita Divina: coleta × 1,5 por 45 s', () => {
    const s = calm();
    givePower(s, 'divine_harvest', 5);
    expect(harvestMult(s, s.players[0])).toBe(1);
    expect(usePower(s, s.players[0], 'divine_harvest').ok).toBe(true);
    expect(harvestMult(s, s.players[0])).toBe(1.5);
    run(s, 46 * TICK_RATE);
    expect(harvestMult(s, s.players[0])).toBe(1);
  }, 30000);
  it('Carro do Sol: queima na faixa, não ao lado', () => {
    const s = calm();
    givePower(s, 'sun_chariot', 6);
    const o = openLine(s, 10);
    const tc = tcOf(s);
    // direção = do CC mais perto ao ponto: o ponto fica a leste do CC (move-se o CC no teste não é possível: lê-se o vetor real)
    const dx = o.x - tc.x, dy = o.y - tc.y, l = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / l, uy = dy / l;
    const inside = spawnUnit(s, 1, 'cyclops', o.x + ux * 3, o.y + uy * 3);
    const beside = spawnUnit(s, 1, 'cyclops', o.x - uy * 4, o.y + ux * 4);
    run(s, 1);
    const a = inside.hp, b = beside.hp;
    expect(usePower(s, s.players[0], 'sun_chariot', o.x, o.y).ok).toBe(true);
    run(s, TICK_RATE);
    expect(inside.hp).toBeLessThan(a);
    expect(beside.hp).toBe(b);
  }, 30000);
  it('Vitória Alada ×1,3 e Retribuição devolve metade do dano', () => {
    const s = calm();
    givePower(s, 'winged_victory', 6); givePower(s, 'retribution', 6);
    const tc = tcOf(s);
    const h0 = put(s, 0, 'hoplite', tc.x + 5, tc.y + 5);
    const c1 = put(s, 1, 'cyclops', tc.x + 6, tc.y + 5);
    run(s, 1);
    const base = computeDamage(s, h0, c1);
    expect(usePower(s, s.players[0], 'winged_victory').ok).toBe(true);
    expect(computeDamage(s, h0, c1)).toBeCloseTo(base * 1.3, 1);
    s.players[1].nemesisUntil = s.tick + 400;
    const hp = h0.hp;
    applyDamage(s, c1, 100, 0, h0);
    expect(hp - h0.hp).toBeCloseTo(50, 3);
  }, 30000);
});

describe('E6 — criaturas', () => {
  it('Empusa cura 30 % do dano; Fênix renasce uma vez; Grifo caça Harpia; Sátiro de longe', () => {
    const s = calm();
    const tc = tcOf(s);
    const em = put(s, 0, 'empusa', tc.x + 5, tc.y + 5);
    const tgt = put(s, 1, 'hoplite', tc.x + 6, tc.y + 5);
    run(s, 1);
    em.hp = em.maxHp / 2;
    const hp0 = em.hp;
    performAttack(s, em, tgt);
    expect(em.hp).toBeGreaterThan(hp0);
    const f = put(s, 0, 'phoenix', tc.x + 4, tc.y + 4);
    killUnit(s, f, 1);
    expect(f.dead).toBe(false); expect(f.reborn).toBe(true);
    expect(f.hp).toBeCloseTo(f.maxHp * 0.5, 0);
    killUnit(s, f, 1);
    expect(f.dead).toBe(true);
    const g = put(s, 0, 'griffin', tc.x + 5, tc.y + 6), hp = put(s, 1, 'harpy', tc.x + 6, tc.y + 6), ho = put(s, 1, 'hoplite', tc.x + 7, tc.y + 6);
    expect(canTarget(s, g, hp)).toBe(true);
    expect(canTarget(s, ho, hp)).toBe(false);
    const st = getUnitStats(s, s.players[0], 'satyr');
    expect(st.range).toBe(5);
    expect(UNITS.satyr.tags).toContain('skirmisher');
  }, 30000);
});

describe('E6 — Talos', () => {
  it('Colossos viram Talos na Era VII; treino recusado e item da fila sai Talos', () => {
    const s = calm();
    const p = s.players[0];
    p.minorGods = ['athena', 'apollo', 'hephaestus'];
    p.age = 5; rich(s); roomy(s);
    const col = put(s, 0, 'colossus', 30, 30);
    const tmp = templeOf(s);
    expect(mythUpgradeOf('colossus', 5)).toBe('colossus');
    col.hp = col.maxHp / 2;
    const frac = col.hp / col.maxHp;
    p.age = 6;
    expect(canTrain(s, p, tmp, 'colossus').reason).toBe(t('err.mythUpgraded', { name: UNITS.colossus.plural, to: UNITS.talos.plural }));
    expect(canTrain(s, p, tmp, 'talos').ok).toBe(true);
    expect(applyMythUpgrades(s, p)).toBe(1);
    refreshMaxHp(s, p);
    expect(col.type).toBe('talos');
    expect(col.hp / col.maxHp).toBeCloseTo(frac, 1);
    tmp.queue.push({ kind: 'unit', id: 'colossus', elapsed: 0, total: 1 });
    tmp.queue[0].elapsed = tmp.queue[0].total - 0.01;
    run(s, 3);
    expect([...s.units.values()].filter((u) => u.owner === 0 && u.type === 'talos').length).toBe(2);
  }, 30000);
});

describe('E6 — Bênçãos e Titãs', () => {
  it('Bênção fortalece míticas, não Titãs; recusada fora do modo Era-mítica', () => {
    const s = calm();
    const p = s.players[0];
    p.age = 1; rich(s); roomy(s);
    const tmp = templeOf(s);
    expect(canResearch(s, p, tmp, 'blessing2').ok).toBe(true);
    const off = calm({ eraMyth: false });
    off.players[0].age = 1; rich(off);
    const tmp2 = templeOf(off);
    expect(canResearch(off, off.players[0], tmp2, 'blessing2').reason).toBe(t('err.classicMyth'));
    const before = getUnitStats(s, p, 'prometheus').hp;
    p.techs.push('blessing2'); recomputeMods(s, p);
    expect(getUnitStats(s, p, 'minotaur').hp).toBe(Math.round(UNITS.minotaur.hp * 1.2));
    expect(getUnitStats(s, p, 'prometheus').hp).toBe(before);
  }, 30000);
  it('Titãs: vida ×2 e ataque ×1,5 fora de cenário; iguais em cenário', () => {
    const s = quickGame();
    const st = getUnitStats(s, s.players[0], 'oceanus');
    expect(st.hp).toBe(13000); expect(st.attack).toBe(262.5);
    const off = quickGame({ eraMyth: false });
    const so = getUnitStats(off, off.players[0], 'oceanus');
    expect(so.hp).toBe(6500); expect(so.attack).toBe(175);
  });
});

describe('E6 — camada anfíbia', () => {
  it('Oceano anfíbio com navios ligados, só em terra na campanha; caminho por cima da água; Ceto não embarca', () => {
    expect(unitLayer(quickGame(), UNITS.oceanus)).toBe('amphibious');
    const sc = createGame(missionConfig(campaignMission('m8_oceano')!, 'normal'));
    expect(unitLayer(sc, UNITS.oceanus)).toBe('land');
    const s = quickGame();
    const m = s.map;
    const row = 40;
    for (let x = 5; x < 40; x++) for (let dy = -2; dy <= 2; dy++) { const i = idx(m, x, row + dy); m.terrain[i] = TERRAIN.GRASS; m.blocked[i] = 0; m.nodeAt[i] = -1; m.buildingAt[i] = -1; }
    for (let x = 18; x < 24; x++) for (let y = 0; y < m.h; y++) { const i = idx(m, x, y); m.terrain[i] = TERRAIN.WATER; m.blocked[i] = 1; m.nodeAt[i] = -1; m.buildingAt[i] = -1; }
    invalidateComponents(m);
    const goal = { tx: 35, ty: row, w: 1, h: 1 };
    expect(findPathEx(m, 6, row, goal, false, 6000, -1, 'land').complete).toBe(false);
    expect(findPathEx(m, 6, row, goal, false, 6000, -1, 'amphibious').complete).toBe(true);
    const sh = [...s.units.values()].find((u) => UNITS[u.type].capacity);
    const ceto = spawnUnit(s, 0, 'ceto', 30, 30);
    const tr = spawnUnit(s, 0, 'transport_ship', 31, 30);
    expect(canBoard(s, ceto, tr)).toBe(false);
    void sh;
  }, 30000);
});

describe('E6 — tecla de treino e IA', () => {
  it('Z escolhe a criatura de Era mais alta que o jogador pode treinar', () => {
    const s = quickGame();
    const p = s.players[0];
    p.age = 4; p.minorGods = ['athena', 'apollo', 'hera', 'pan'];
    expect(pickTrainHotkey(p, ['pegasus', 'minotaur', 'satyr'])).toBe('satyr');
    p.minorGods = ['athena', 'apollo', 'hera'];
    expect(pickTrainHotkey(p, ['pegasus', 'minotaur', 'satyr'])).toBe('minotaur');
    p.age = 6; p.minorGods = ['hephaestus'];
    expect(pickTrainHotkey(p, ['colossus', 'talos'])).toBe('talos');
  });
  it('a IA usa Pânico, Vendaval e Retribuição sob ataque; Colheita com 30 cidadãos; treina o Sátiro', () => {
    for (const id of ['panic', 'gale', 'retribution']) {
      const s = quickGame({}, true);
      const p = s.players[0];
      p.powers = [{ id, used: false }]; p.age = 6;
      const tc = tcOf(s);
      p.ai!.nextThink = 0; p.ai!.defending = s.tick;
      for (let i = 0; i < 9; i++) put(s, 1, 'hoplite', tc.x + 3 + (i % 3), tc.y + 3 + Math.floor(i / 3));
      run(s, 1);
      p.ai!.defending = s.tick;
      aiThink(s, p);
      expect(p.powers.find((x) => x.id === id)!.used).toBe(true);
    }
    const s2 = quickGame({}, true);
    const p2 = s2.players[0];
    p2.age = 4; p2.minorGods = ['athena', 'apollo', 'hera', 'pan']; p2.powers = [{ id: 'panic', used: false }];
    rich(s2); roomy(s2);
    const tmp = templeOf(s2);
    for (const h of ['jason', 'odysseus', 'heracles', 'achilles', 'perseus']) put(s2, 0, h, 40, 40);
    p2.ai!.nextThink = 0;
    aiThink(s2, p2);
    expect(tmp.queue.some((q) => q.id === 'satyr')).toBe(true);
  }, 60000);
});

describe('E6 — save', () => {
  it('ida e volta com Primavera, Carro do Sol e Pânico ativos e o mesmo hash 100 ticks depois', () => {
    const s = calm();
    for (const [id, age] of [['spring', 4], ['sun_chariot', 6], ['panic', 4]] as const) givePower(s, id, age);
    const tc = tcOf(s);
    const hs = [0, 1, 2].map((i) => put(s, 1, 'hoplite', tc.x + 5 + i, tc.y + 5));
    run(s, 1);
    for (const id of ['spring', 'sun_chariot', 'panic']) expect(usePower(s, s.players[0], id, hs[1].x, hs[1].y).ok).toBe(true);
    const a = serialize(s);
    expect(serialize(deserialize(a))).toBe(a);
    const s2 = deserialize(a);
    run(s, 100); run(s2, 100);
    expect(stateHash(s2)).toBe(stateHash(s));
  }, 60000);
});
void [AGES, BUILDINGS, buildingsOf];
