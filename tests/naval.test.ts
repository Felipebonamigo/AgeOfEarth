// Guerra no mar (E4; docs/eras/E4-naval.md): camadas, caminho, Estaleiro, pesca, transporte, combate entre meios,
// gerador dos mapas com mar, IA naval e justiça. Partidas reais (createGame + tick) sobre mapas gerados.
import { describe, it, expect } from 'vitest';
import { TERRAIN, TICK_RATE, MAP_TYPES, NAVAL_MAP_TYPES, RARE_SET, type MapType } from '../src/core/constants';
import { AGES, BUILDINGS, LINES, TECHS, UNITS } from '../src/core/data';
import { applyCommand, canTrain } from '../src/core/sim/commands';
import { applyEditOp } from '../src/editor/ops';
import { canPlaceBuilding, placeBuilding, spawnUnit, buildingsOf, unitsOf } from '../src/core/sim/entities';
import { canTarget, killUnit } from '../src/core/sim/combat';
import { canWorkNode } from '../src/core/sim/queries';
import { approachTile, boardShip, canBoard, cargoPop, shoreTileNear } from '../src/core/sim/naval';
import { tick } from '../src/core/sim/game';
import { navalOn } from '../src/core/sim/restrictions';
import { trainChoices } from '../src/core/sim/lines';
import { grantTech } from '../src/core/scenario/helpers';
import { generateMap, addNode, removeNode } from '../src/core/map/mapgen';
import { componentAt, componentSize, invalidateComponents, shoreOk } from '../src/core/map/components';
import { findPathEx } from '../src/core/map/pathfinding';
import { idx, isPassable } from '../src/core/map/grid';
import { isNavigableTerrain, layerOf, navalBlocked, MIN_DOCK_WATER } from '../src/core/map/naval';
import { hasShipyardSite, seaOfStart, FISH_RADIUS } from '../src/core/map/fixed';
import { serialize, deserialize } from '../src/core/serialize';
import { stateHash } from '../src/core/net/hash';
import { t } from '../src/i18n';
import type { GameState, Unit } from '../src/core/types';
import { quickGame, run } from './helpers';

const naval = (over: Parameters<typeof quickGame>[0] = {}, ai = false) => quickGame({ mapType: 'coastal', seed: 42, ...over }, ai);

/** Estaleiro 3×3 num lugar válido a até 24 tiles do Centro Cívico do jogador (como o playtest). */
function shipyardAt(s: GameState, player = 0, complete = true) {
  const tc = buildingsOf(s, player).find((b) => b.type === 'town_center')!;
  for (let r = 4; r <= 24; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
    const tx = tc.tx + dx, ty = tc.ty + dy;
    if (canPlaceBuilding(s, s.players[player], 'shipyard', tx, ty, true, true).ok) return placeBuilding(s, player, 'shipyard', tx, ty, complete);
  }
  throw new Error('sem lugar para Estaleiro');
}
/** Tile de água aberta do mar do Estaleiro, encostado nele. */
function waterBeside(s: GameState, y: { tx: number; ty: number; w: number; h: number }): { x: number; y: number } {
  const m = s.map;
  for (let yy = y.ty - 3; yy < y.ty + y.h + 3; yy++) for (let xx = y.tx - 3; xx < y.tx + y.w + 3; xx++) {
    if (!isPassable(m, xx, yy, 'naval') || m.terrain[idx(m, xx, yy)] === TERRAIN.SHALLOWS) continue;
    if (componentSize(m, componentAt(m, xx, yy, 'naval'), 'naval') >= MIN_DOCK_WATER) return { x: xx, y: yy };
  }
  throw new Error('sem água ao lado do Estaleiro');
}
const ship = (s: GameState, type: string, at: { x: number; y: number }, owner = 0): Unit => spawnUnit(s, owner, type, at.x + 0.5, at.y + 0.5);
const fishOf = (s: GameState) => [...s.map.nodes.values()].filter((n) => n.type === 'fish');

describe('E4 — camadas e caminho', () => {
  it('baixio passa nas duas camadas; água rasa e profunda só na naval; peixe bloqueia navio; peixe esgotado deixa blocked = 1', () => {
    const s = naval();
    const m = s.map;
    let shallow: number, water: number;
    // monta um trecho de teste: 3 tiles de baixio entre água, num canto
    const row = 20;
    for (let x = 10; x < 30; x++) { m.terrain[idx(m, x, row)] = TERRAIN.WATER; m.nodeAt[idx(m, x, row)] = -1; m.buildingAt[idx(m, x, row)] = -1; }
    for (const x of [18, 19, 20]) m.terrain[idx(m, x, row)] = TERRAIN.SHALLOWS;
    m.terrain[idx(m, 25, row)] = TERRAIN.DEEP;
    for (let x = 10; x < 30; x++) { const tt = m.terrain[idx(m, x, row)]; m.blocked[idx(m, x, row)] = tt === TERRAIN.WATER || tt === TERRAIN.DEEP ? 1 : 0; }
    s.map.nodeAt.fill(-1, idx(m, 10, row), idx(m, 30, row));
    shallow = idx(m, 19, row); water = idx(m, 12, row);
    // invalidar caches (regra única: invalidateComponents)
    invalidateComponents(m);
    expect(m.blocked[shallow]).toBe(0);                 // infantaria atravessa
    expect(navalBlocked(m)[shallow]).toBe(0);           // navio passa
    expect(m.blocked[water]).toBe(1);                   // infantaria não
    expect(navalBlocked(m)[water]).toBe(0);             // navio passa
    expect(isNavigableTerrain(TERRAIN.SHALLOWS)).toBe(true);
    const f = addNode(m, 'fish', 12, row);
    expect(f).not.toBeNull();
    expect(navalBlocked(m)[idx(m, 12, row)]).toBe(1);    // o cardume bloqueia o navio
    removeNode(m, f!.id);
    expect(m.blocked[idx(m, 12, row)]).toBe(1);          // peixe esgotado não abre a água para a infantaria
    expect(navalBlocked(m)[idx(m, 12, row)]).toBe(0);
    expect(addNode(m, 'tree', 12, row)).toBeNull();      // nó terrestre não cabe na água
    expect(addNode(m, 'fish', 19, row)).toBeNull();      // nem peixe no baixio
  });

  it('o caminho naval contorna a ilha; infantaria atravessa o baixio; navio nunca pisa em terra e hoplita nunca entra no mar', () => {
    const s = naval();
    const m = s.map;
    const yard = shipyardAt(s);
    const w = waterBeside(s, yard);
    const sea = componentAt(m, w.x, w.y, 'naval');
    // alvo: outro tile do mesmo mar, longe
    let far = w, best = 0;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (!isPassable(m, x, y, 'naval') || componentAt(m, x, y, 'naval') !== sea) continue;
      const d = (x - w.x) ** 2 + (y - w.y) ** 2;
      if (d > best) { best = d; far = { x, y }; }
    }
    const r = findPathEx(m, w.x, w.y, { tx: far.x, ty: far.y, w: 1, h: 1 }, false, 40000, -1, 'naval');
    expect(r.complete).toBe(true);
    const sh = ship(s, 'trireme', w);
    applyCommand(s, { type: 'move', player: 0, ids: [sh.id], x: far.x + 0.5, y: far.y + 0.5 });
    for (let i = 0; i < 600; i++) { tick(s); expect(isNavigableTerrain(m.terrain[idx(m, Math.floor(sh.x), Math.floor(sh.y))]), `tick ${i}`).toBe(true); }
    expect(Math.hypot(sh.x - far.x, sh.y - far.y)).toBeLessThan(Math.hypot(w.x - far.x, w.y - far.y));
    // hoplita mandado para o mar fica em terra
    const tc = buildingsOf(s, 0)[0];
    const h = spawnUnit(s, 0, 'hoplite', tc.x + 3, tc.y + 3);
    applyCommand(s, { type: 'move', player: 0, ids: [h.id], x: w.x + 0.5, y: w.y + 0.5 });
    for (let i = 0; i < 300; i++) { tick(s); const tt = m.terrain[idx(m, Math.floor(h.x), Math.floor(h.y))]; expect(tt === TERRAIN.WATER || tt === TERRAIN.DEEP).toBe(false); }
  });
});

describe('E4 — Estaleiro', () => {
  it('só na margem de um mar grande, em território próprio ou neutro; navios desligados em cenário', () => {
    const s = naval();
    const p = s.players[0];
    const tc = buildingsOf(s, 0)[0];
    // interior: 12 tiles atrás do CC (terra, território próprio) — sem água encostada
    let interior = false;
    for (let dy = -6; dy <= 6 && !interior; dy++) for (let dx = -6; dx <= 6 && !interior; dx++) {
      const tx = tc.tx + dx, ty = tc.ty + dy;
      const c = canPlaceBuilding(s, p, 'shipyard', tx, ty, true, false);
      if (!c.ok && c.reason === t('err.needsShore')) interior = true;
    }
    expect(interior).toBe(true);
    const y = shipyardAt(s);
    expect(shoreOk(s.map, y.tx, y.ty, 3, 3)).toBe(true);
    expect(BUILDINGS.shipyard.shore).toBe(true);
    // cenário (Horda): recusa com err.navalOff; com config.naval = true aceita
    const s2 = naval();
    const spot = (() => { const yy = shipyardAt(s2); const r = { tx: yy.tx, ty: yy.ty }; return r; })();
    const s3 = naval();
    s3.config.scenario = 'horde';
    expect(navalOn(s3)).toBe(false);
    const c = canPlaceBuilding(s3, s3.players[0], 'shipyard', spot.tx, spot.ty);
    expect(c.ok).toBe(false);
    expect(c.reason).toBe(t('err.navalOff'));
    s3.config.naval = true;
    expect(navalOn(s3)).toBe(true);
    expect(canPlaceBuilding(s3, s3.players[0], 'shipyard', spot.tx, spot.ty, true).reason).not.toBe(t('err.navalOff'));
  });
  it('treina pesca, transporte e navio de guerra pelas linhas (Q, W, E); no elenco clássico, os 3 do trains', () => {
    const s = naval();
    const y = shipyardAt(s);
    const ch = trainChoices(s, s.players[0], 'shipyard');
    expect(ch.map((c) => [c.line?.id, c.show, c.hotkey])).toEqual([['fishing', 'fishing_boat', 'Q'], ['transport', 'transport_ship', 'W'], ['warship', 'penteconter', 'E']]);
    s.players[0].resources.wood = 5000; s.players[0].resources.gold = 5000;
    expect(canTrain(s, s.players[0], y, 'fishing_boat').ok).toBe(true);
    const s2 = naval({ unitLines: false });
    const y2 = shipyardAt(s2);
    expect(trainChoices(s2, s2.players[0], 'shipyard').map((c) => c.send)).toEqual(BUILDINGS.shipyard.trains);
    expect(y2.type).toBe('shipyard');
  });
});

describe('E4 — pesca', () => {
  it('o barco colhe cardume e entrega comida no Estaleiro; cidadão e raro; atum rende ouro', () => {
    const s = naval();
    const p = s.players[0];
    const y = shipyardAt(s);
    const fish = fishOf(s).filter((n) => Math.hypot(n.x - y.x, n.y - y.y) < 30).sort((a, b) => Math.hypot(a.x - y.x, a.y - y.y) - Math.hypot(b.x - y.x, b.y - y.y))[0];
    expect(fish).toBeDefined();
    const w = waterBeside(s, y);
    const boat = ship(s, 'fishing_boat', w);
    expect(canWorkNode(p, 'villager', fish).ok).toBe(false);
    expect(canWorkNode(p, 'villager', fish).reason).toBe(t('err.boatOnly'));
    const berry = [...s.map.nodes.values()].find((n) => n.type === 'berry')!;
    expect(canWorkNode(p, 'fishing_boat', berry).reason).toBe(t('err.fishOnly'));
    const food0 = p.resources.food;
    applyCommand(s, { type: 'gather', player: 0, ids: [boat.id], targetId: fish.id });
    run(s, 120 * TICK_RATE);
    expect(p.resources.food).toBeGreaterThan(food0);
    expect(fish.amount).toBeLessThan(450);
  });
  it('o atum é raro do mar: fora de RARE_NODES, dentro de RARE_SET, rende ouro ao barco e conta em p.rares', () => {
    const s = naval();
    const p = s.players[0];
    expect(RARE_SET.has('rare_fish')).toBe(true);
    const y = shipyardAt(s);
    const tuna = [...s.map.nodes.values()].filter((n) => n.type === 'rare_fish').sort((a, b) => Math.hypot(a.x - y.x, a.y - y.y) - Math.hypot(b.x - y.x, b.y - y.y))[0];
    expect(tuna).toBeDefined();
    const w = waterBeside(s, y);
    const boat = ship(s, 'fishing_boat', w);
    boat.x = tuna.x + 1.5; boat.y = tuna.y + 0.5;
    applyCommand(s, { type: 'gather', player: 0, ids: [boat.id], targetId: tuna.id });
    const g0 = p.resources.gold;
    run(s, 20 * TICK_RATE);
    expect(p.resources.gold - g0).toBeGreaterThan(4);
    expect(p.rares).toContain('rare_fish');
  });
});

describe('E4 — transporte', () => {
  function transportSetup() {
    const s = naval();
    const p = s.players[0];
    const y = shipyardAt(s);
    const w = waterBeside(s, y);
    const tr = ship(s, 'transport_ship', w);
    const tc = buildingsOf(s, 0)[0];
    return { s, p, y, tr, w, tc };
  }
  it('embarca até 20 de população, não leva titã nem navio; navio morto afunda a carga', () => {
    const { s, tr, y } = transportSetup();
    const spot = (i: number) => ({ x: y.x + (i % 6) - 2.5, y: y.y + 4 + Math.floor(i / 6) });
    const pop = UNITS.hoplite.pop;
    const n = Math.floor(20 / pop);
    const hops = Array.from({ length: n + 1 }, (_, i) => { const q = spot(i); return spawnUnit(s, 0, 'hoplite', q.x, q.y); });
    for (const h of hops.slice(0, n)) expect(canBoard(s, h, tr)).toBe(true);
    for (const h of hops.slice(0, n)) expect(boardShip(s, h, tr)).toBe(true);
    expect(cargoPop(s, tr)).toBe(n * pop);
    expect(tr.cargo).toHaveLength(n);
    expect(hops[0].inside).toBe(tr.id);
    const extra = hops[n];
    expect(canBoard(s, extra, tr)).toBe(false);   // capacidade 20 de população esgotada
    const titan = spawnUnit(s, 0, 'oceanus', y.x, y.y + 6);
    expect(canBoard(s, titan, tr)).toBe(false);
    const boat = spawnUnit(s, 0, 'fishing_boat', tr.x, tr.y);
    expect(canBoard(s, boat, tr)).toBe(false);
    const losses0 = s.players[0].stats.losses;
    killUnit(s, tr, 1);
    expect(tr.cargo).toHaveLength(0);
    expect(s.players[0].stats.losses - losses0).toBe(n + 1);   // o navio e a tropa
    for (const id of hops.slice(0, n).map((h) => h.id)) expect(s.units.get(id)?.dead ?? true).toBe(true);
  });
  it('embarque e desembarque por comando; save no meio da travessia dá o mesmo estado', () => {
    const { s, tr, y } = transportSetup();
    const hops = Array.from({ length: 4 }, (_, i) => spawnUnit(s, 0, 'hoplite', y.x - 1 + i, y.y + 4));
    for (const h of hops) h.state = 'idle';
    applyCommand(s, { type: 'embark', player: 0, ids: hops.map((h) => h.id), targetId: tr.id });
    run(s, 25 * TICK_RATE);
    expect(tr.cargo).toHaveLength(4);
    // desembarca onde o jogador manda: a praia mais perto do Estaleiro
    const land = shoreTileNear(s.map, tr.x, tr.y, y.x, y.y + 5, 20);
    expect(land).not.toBeNull();
    applyCommand(s, { type: 'unload', player: 0, ids: [tr.id], x: y.x, y: y.y + 5 });
    run(s, 4 * TICK_RATE);
    // metade do caminho: salva, restaura e compara com a partida contínua
    const copy = deserialize(serialize(s));
    run(s, 200); run(copy, 200);
    expect(stateHash(copy)).toBe(stateHash(s));
    run(s, 30 * TICK_RATE);
    expect(tr.cargo).toHaveLength(0);
    for (const h of hops) {
      const u = s.units.get(h.id)!;
      expect(u.inside).toBe(-1);
      expect(isNavigableTerrain(s.map.terrain[idx(s.map, Math.floor(u.x), Math.floor(u.y))]) && s.map.terrain[idx(s.map, Math.floor(u.x), Math.floor(u.y))] !== TERRAIN.SHALLOWS).toBe(false);
    }
  });
});

describe('E4 — combate entre meios', () => {
  it('corpo a corpo não alcança navio; arqueiro na praia fere; navio fere torre e hoplita na margem; titã alcança', () => {
    const s = naval();
    const y = shipyardAt(s);
    const w = waterBeside(s, y);
    const enemy = ship(s, 'penteconter', w, 1);
    const hop = spawnUnit(s, 0, 'hoplite', y.x, y.y + 5);
    expect(canTarget(s, hop, enemy)).toBe(false);
    expect(canTarget(s, enemy, hop)).toBe(true);   // o navio de guerra atira em terra
    const archer = spawnUnit(s, 0, 'toxotes', y.x, y.y + 5);
    expect(canTarget(s, archer, enemy)).toBe(true);
    const titan = spawnUnit(s, 0, 'oceanus', y.x, y.y + 5);
    expect(canTarget(s, titan, enemy)).toBe(true);
    expect(UNITS.oceanus.bonus.ship).toBe(3);
    // navio × navio
    const mine = ship(s, 'penteconter', { x: w.x + 1, y: w.y }, 0);
    expect(canTarget(s, mine, enemy)).toBe(true);
    expect(approachTile(s.map, 'naval', mine.x, mine.y, enemy, 5)).not.toBeNull();
  });
});

describe('E4 — gerador dos mapas com mar', () => {
  const types: MapType[] = ['coastal', 'islands', 'mediterranean'];
  it('3 tipos × 3 tamanhos × 5 sementes: lugar de Estaleiro e o mesmo mar em todo início, peixe perto, regiões coerentes', () => {
    const sizes = [80, 112, 144];
    for (const type of types) for (const sz of sizes) for (const seed of [1, 2, 3, 4, 5]) for (const players of [2, 4]) {
      const m = generateMap(sz, sz, seed, players, type);
      const lbl = `${type} ${sz} semente ${seed} ${players}j`;
      const seas = m.starts.map((st) => seaOfStart(m, st.x, st.y));
      expect(seas.every((c) => c >= 0 && c === seas[0]), `${lbl}: mar único ${seas.join(',')}`).toBe(true);
      for (const st of m.starts) {
        expect(hasShipyardSite(m, st.x, st.y), `${lbl}: Estaleiro`).toBe(true);
        const fish = [...m.nodes.values()].filter((n) => n.type === 'fish' && Math.hypot(n.x - st.x, n.y - st.y) <= FISH_RADIUS).length;
        expect(fish, `${lbl}: peixe`).toBeGreaterThanOrEqual(6);
      }
      const lands = m.starts.map((st) => componentAt(m, st.x, st.y));
      if (type === 'islands') expect(new Set(lands).size, `${lbl}: ilhas separadas`).toBe(players);
      else expect(new Set(lands).size, `${lbl}: terra ligada`).toBe(1);
    }
  });
  it('duas gerações iguais; os 5 tipos de hoje não ganham peixe', () => {
    for (const type of types) {
      const a = generateMap(80, 80, 7, 2, type), b = generateMap(80, 80, 7, 2, type);
      expect([...a.nodes.values()].map((n) => `${n.type}${n.x},${n.y}`).join('|')).toBe([...b.nodes.values()].map((n) => `${n.type}${n.x},${n.y}`).join('|'));
      expect(Buffer.from(a.terrain).equals(Buffer.from(b.terrain))).toBe(true);
    }
    for (const type of MAP_TYPES.filter((x) => !NAVAL_MAP_TYPES.has(x))) {
      const m = generateMap(112, 112, 3, 2, type);
      expect([...m.nodes.values()].some((n) => n.type === 'fish' || n.type === 'rare_fish')).toBe(false);
    }
  });
});

describe('E4 — dados', () => {
  it('10 navios, 3 linhas, 4 pesquisas do Estaleiro e as linhas "a vapor"', () => {
    const ships = Object.values(UNITS).filter((u) => u.naval);
    expect(ships).toHaveLength(10);
    expect(LINES.warship.steps.filter(Boolean)).toHaveLength(8);
    for (const id of ['fishing_nets', 'caulking', 'bronze_rams', 'navigation']) { expect(TECHS[id].building).toBe('shipyard'); expect(TECHS[id].line).toBeUndefined(); }
    expect(TECHS.evo_fishing_7.evolve).toEqual({ line: 'fishing', to: 'fishing_boat' });
    expect(AGES.length).toBe(8);
  });
  it('evoluir a linha warship transforma as trirremes (vida proporcional)', () => {
    const s = naval();
    const y = shipyardAt(s);
    const w = waterBeside(s, y);
    const tri = ship(s, 'trireme', w);
    tri.hp = tri.maxHp / 2;
    const maxBefore = tri.maxHp;
    grantTech(s, 0, 'evo_warship_3');
    const u = s.units.get(tri.id)!;
    expect(u.type).toBe('quinquereme');
    expect(u.maxHp).toBeGreaterThan(maxBefore);
    expect(u.hp / u.maxHp).toBeGreaterThan(0.45); expect(u.hp / u.maxHp).toBeLessThan(0.55);
    expect(layerOf(UNITS[u.type])).toBe('naval');
  });
});

describe('E4 — IA naval', () => {
  it('2 IAs no Costeiro: as duas constroem o Estaleiro e pescam; determinístico', () => {
    const mk = () => naval({ seed: 42, mapSize: 'small', startingResources: { food: 3000, wood: 3000, stone: 500, gold: 1500, knowledge: 0, favor: 0 } }, true);
    const s = mk();
    run(s, 10 * 60 * TICK_RATE);
    for (const p of [0, 1]) {
      expect(buildingsOf(s, p).some((b) => b.type === 'shipyard' && b.complete), `Estaleiro do jogador ${p}`).toBe(true);
      expect(unitsOf(s, p).some((u) => u.type === 'fishing_boat'), `barco do jogador ${p}`).toBe(true);
    }
    const s2 = mk();
    run(s2, 10 * 60 * TICK_RATE);
    expect(stateHash(s2)).toBe(stateHash(s));
  }, 240_000);
});

describe('E4 — justiça', () => {
  it('num mapa espelhado em x, approachTile e shoreTileNear são espelhados', () => {
    // mapa sintético 40×20: mar no meio (colunas 18–21), terra dos dois lados; alvo espelhado
    const s = naval();
    const m = s.map;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { m.terrain[idx(m, x, y)] = TERRAIN.GRASS; m.blocked[idx(m, x, y)] = 0; m.nodeAt[idx(m, x, y)] = -1; m.buildingAt[idx(m, x, y)] = -1; }
    m.nodes.clear();
    const W = m.w;
    for (let y = 10; y < 70 && y < m.h; y++) for (let x = 30; x < W - 30; x++) { m.terrain[idx(m, x, y)] = TERRAIN.WATER; m.blocked[idx(m, x, y)] = 1; }
    invalidateComponents(m);
    const L = shoreTileNear(m, W / 2, 40.5, 28, 40.5, 12), R = shoreTileNear(m, W / 2, 40.5, W - 28, 40.5, 12);
    expect(L).not.toBeNull(); expect(R).not.toBeNull();
    expect(L!.y).toBe(R!.y);
    expect(L!.x + R!.x).toBe(W - 1);
  });
});

// o editor também invalida: pintar terra no mar muda a região naval na hora
describe('E4 — editor e cache', () => {
  it('pintar terra no mar muda componentAt(naval) na hora', () => {
    const s = naval();
    const y = shipyardAt(s);
    const w = waterBeside(s, y);
    const before = componentSize(s.map, componentAt(s.map, w.x, w.y, 'naval'), 'naval');
    const tiles: number[] = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = w.x + dx, yy = w.y + dy; if (x >= 0 && yy >= 0 && x < s.map.w && yy < s.map.h) tiles.push(yy * s.map.w + x); }
    applyEditOp(s, { kind: 'paint', tiles, terrain: TERRAIN.GRASS });
    const after = componentAt(s.map, w.x, w.y, 'naval');
    expect(after).toBe(-1);
    expect(before).toBeGreaterThan(MIN_DOCK_WATER);
  });
});
