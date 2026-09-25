// Modos de jogo (Fase 5.1): Deathmatch, Regicídio, Rei da Colina e tipos de mapa.
import { describe, it, expect } from 'vitest';
import { KOTH_RADIUS, KOTH_SECONDS, MAP_TYPES, TICK_RATE, DEATHMATCH_RESOURCES } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { applyCommand } from '../src/core/sim/commands';
import { buildingsOf, spawnUnit, unitsOf, placeBuilding } from '../src/core/sim/entities';
import { killUnit } from '../src/core/sim/combat';
import { componentAt } from '../src/core/map/components';
import { stateHash } from '../src/core/net/hash';
import type { GameConfig, GameState } from '../src/core/types';

const base = (over: Partial<GameConfig> = {}): GameConfig => ({ seed: 99, mapSize: 'small', players: [
  { name: 'A', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'B', god: 'poseidon', isAI: false, difficulty: 'normal', team: 1 },
], ...over });
const run = (s: GameState, n: number) => { for (let i = 0; i < n; i++) tick(s); };

describe('modos de jogo', () => {
  it('Deathmatch: cofres cheios e Idade Clássica desde o início', () => {
    const s = createGame(base({ mode: 'deathmatch' }));
    expect(s.players[0].age).toBe(1);
    expect(s.players[0].resources.food).toBe(DEATHMATCH_RESOURCES.food);
    expect(s.players[1].resources.gold).toBe(DEATHMATCH_RESOURCES.gold);
  });

  it('Regicídio: cada jogador tem um rei; quando o rei morre o reino cai e o outro vence', () => {
    const s = createGame(base({ mode: 'regicide' }));
    const kings = [0, 1].map((p) => unitsOf(s, p).find((u) => u.type === 'basileus')!);
    expect(kings.every((k) => !!k)).toBe(true);
    killUnit(s, kings[1], 0);
    run(s, TICK_RATE + 1);
    expect(s.players[1].alive).toBe(false);
    expect(s.gameOver).toBe(true);
    expect(s.winner).toBe(0);
    expect(s.events.some((e) => e.type === 'kingDied')).toBe(true);
  });

  it('Regicídio: a IA guarnece o rei no Centro Cívico', () => {
    const s = createGame(base({ mode: 'regicide', players: [{ name: 'IA', god: 'zeus', isAI: true, difficulty: 'normal', team: 0 }, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal', team: 1 }] }));
    run(s, 25 * TICK_RATE);
    const king = unitsOf(s, 0).find((u) => u.type === 'basileus')!;
    expect(king.inside).toBe(buildingsOf(s, 0).find((b) => b.type === 'town_center')!.id);
  });

  it('Rei da Colina: colina no centro ligada aos inícios; segurar sozinho por KOTH_SECONDS vence', () => {
    const s = createGame(base({ mode: 'koth' }));
    expect(s.koth).toBeDefined();
    const k = s.koth!;
    const tc = buildingsOf(s, 0)[0];
    // a colina fica na mesma região do Centro Cívico
    let comp = -1;
    for (let y = tc.ty - 1; y <= tc.ty + tc.h && comp < 0; y++) for (let x = tc.tx - 1; x <= tc.tx + tc.w && comp < 0; x++) { const c = componentAt(s.map, x, y); if (c >= 0) comp = c; }
    expect(componentAt(s.map, Math.floor(k.x), Math.floor(k.y))).toBe(comp);
    // tropas do time 0 sozinhas na colina
    for (let i = 0; i < 3; i++) { const h = spawnUnit(s, 0, 'hoplite', k.x + i * 0.4, k.y); h.stance = 'passive'; }
    run(s, 5 * TICK_RATE);
    expect(k.team).toBe(0);
    expect(k.seconds).toBeGreaterThanOrEqual(4);
    // inimigo entra: disputa zera o contador
    const enemy = spawnUnit(s, 1, 'hoplite', k.x, k.y + 1); enemy.stance = 'passive';
    run(s, 2 * TICK_RATE);
    expect(k.team).toBe(-1);
    expect(k.seconds).toBe(0);
    applyCommand(s, { type: 'delete', player: 1, ids: [enemy.id] });
    run(s, (KOTH_SECONDS + 3) * TICK_RATE);
    expect(s.gameOver).toBe(true);
    expect(s.winner).toBe(0);
    expect(KOTH_RADIUS).toBeGreaterThan(0);
  });

  it('tipos de mapa geram mapas jogáveis (inícios ligados por terra) e determinísticos', () => {
    for (const mapType of MAP_TYPES) {
      const a = createGame(base({ mapType, seed: 5 }));
      const b = createGame(base({ mapType, seed: 5 }));
      expect(stateHash(a)).toBe(stateHash(b));
      const comps = a.map.starts.map((st) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const c = componentAt(a.map, st.x + dx, st.y + dy); if (c >= 0) return c; } return -1; });
      expect(comps.every((c) => c >= 0 && c === comps[0]), `inícios desconexos em ${mapType}`).toBe(true);
      expect(a.map.nodes.size).toBeGreaterThan(50);
    }
  });
});

describe('veterania', () => {
  it('abates dão patentes: +10% de ataque e de vida por patente; tecnologias não apagam o bônus', async () => {
    const { computeDamage } = await import('../src/core/sim/combat');
    const { refreshMaxHp } = await import('../src/core/sim/modifiers');
    const { rankOf } = await import('../src/core/constants');
    const s = createGame(base());
    const a = spawnUnit(s, 0, 'hoplite', 20.5, 20.5);
    const target = spawnUnit(s, 1, 'hoplite', 21.5, 20.5);
    const d0 = computeDamage(s, a, target);
    const hp0 = a.maxHp;
    for (let i = 0; i < 3; i++) { const v = spawnUnit(s, 1, 'villager', 30, 30); killUnit(s, v, 0, a); }
    expect(rankOf(a.kills)).toBe(1);
    expect(computeDamage(s, a, target)).toBeCloseTo(d0 * 1.1, 5);
    expect(a.maxHp).toBe(Math.round(hp0 * 1.1));
    refreshMaxHp(s, s.players[0]);
    expect(a.maxHp).toBe(Math.round(hp0 * 1.1));
    for (let i = 0; i < 12; i++) { const v = spawnUnit(s, 1, 'villager', 30, 30); killUnit(s, v, 0, a); }
    expect(rankOf(a.kills)).toBe(3);
    expect(s.events.filter((e) => e.type === 'rank').length).toBe(3);
  });
});

describe('habilidades dos heróis', () => {
  it('Grito dos Argonautas: +30% de ataque para aliados no raio, recarga e expiração', async () => {
    const { computeDamage } = await import('../src/core/sim/combat');
    const { ABILITIES } = await import('../src/core/data');
    const s = createGame(base());
    const jason = spawnUnit(s, 0, 'jason', 30.5, 30.5);
    const ally = spawnUnit(s, 0, 'hoplite', 32.5, 30.5);
    const far = spawnUnit(s, 0, 'hoplite', 45.5, 30.5);
    const enemy = spawnUnit(s, 1, 'hoplite', 31.5, 31.5);
    run(s, 1);
    const d0 = computeDamage(s, ally, enemy);
    expect(applyCommand(s, { type: 'ability', player: 0, unitId: jason.id }).ok).toBe(true);
    expect(computeDamage(s, ally, enemy)).toBeCloseTo(d0 * 1.3, 5);
    expect(computeDamage(s, far, enemy)).toBeCloseTo(d0, 5);
    expect(applyCommand(s, { type: 'ability', player: 0, unitId: jason.id }).ok).toBe(false);   // recarregando
    run(s, (ABILITIES.war_cry.duration + 1) * TICK_RATE);
    expect(computeDamage(s, ally, enemy)).toBeCloseTo(d0, 5);
    expect(s.effects.length + s.events.filter((e) => e.type === 'ability').length).toBeGreaterThan(0);
  });

  it('Golpe Titânico triplica o próximo golpe e é consumido; Escudo Espelhado bloqueia a petrificação', async () => {
    const { computeDamage, performAttack } = await import('../src/core/sim/combat');
    const s = createGame(base());
    const her = spawnUnit(s, 0, 'heracles', 30.5, 30.5);
    const enemy = spawnUnit(s, 1, 'hoplite', 31.2, 30.5); enemy.hp = enemy.maxHp = 100000;
    run(s, 1);
    const d0 = computeDamage(s, her, enemy);
    applyCommand(s, { type: 'ability', player: 0, unitId: her.id });
    expect(computeDamage(s, her, enemy)).toBeCloseTo(d0 * 3, 5);
    performAttack(s, her, enemy);
    expect(her.chargeUntil).toBe(0);
    expect(computeDamage(s, her, enemy)).toBeCloseTo(d0, 5);
    // Perseu protege contra a Medusa
    const perseus = spawnUnit(s, 0, 'perseus', 40.5, 40.5);
    const hop = spawnUnit(s, 0, 'hoplite', 41.5, 40.5);
    const medusa = spawnUnit(s, 1, 'medusa', 42.5, 40.5);
    run(s, 1);
    applyCommand(s, { type: 'ability', player: 0, unitId: perseus.id });
    let petrified = 0;
    for (let i = 0; i < 200; i++) { hop.hp = hop.maxHp; performAttack(s, medusa, hop); if (hop.dead) { petrified++; hop.dead = false; hop.hp = hop.maxHp; } }
    expect(petrified).toBe(0);
  });

  it('Fúria dobra a cadência; Astúcia acelera o movimento; a IA usa a habilidade em combate', async () => {
    const { attackInterval } = await import('../src/core/sim/combat');
    const s = createGame(base());
    const ach = spawnUnit(s, 0, 'achilles', 30.5, 30.5);
    run(s, 1);
    const i0 = attackInterval(ach, s.tick);
    applyCommand(s, { type: 'ability', player: 0, unitId: ach.id });
    expect(attackInterval(ach, s.tick)).toBeCloseTo(i0 / 2, 5);
    const ody = spawnUnit(s, 0, 'odysseus', 20.5, 20.5);
    applyCommand(s, { type: 'move', player: 0, ids: [ody.id], x: 20.5, y: 40.5 });
    run(s, 20); const yA = ody.y;
    applyCommand(s, { type: 'ability', player: 0, unitId: ody.id });
    const y1 = ody.y; run(s, 20); const yB = ody.y;
    expect(yB - y1).toBeGreaterThan((yA - 20.5) * 1.25);
    // IA: herói em combate com habilidade pronta a usa
    const ai = createGame(base({ players: [{ name: 'IA', god: 'zeus', isAI: true, difficulty: 'normal', team: 0 }, { name: 'B', god: 'poseidon', isAI: false, difficulty: 'normal', team: 1 }] }));
    const tc = buildingsOf(ai, 0)[0];
    const j = spawnUnit(ai, 0, 'jason', tc.x + 5, tc.y + 5);
    spawnUnit(ai, 1, 'hoplite', tc.x + 6, tc.y + 5);
    run(ai, 6 * TICK_RATE);
    expect(j.abilityReadyAt).toBeGreaterThan(0);
  });
});

describe('formações de exército', () => {
  it('linha, quadrado, coluna e cunha produzem formas distintas e válidas', async () => {
    const { formationOffsets } = await import('../src/core/sim/commands');
    const s = createGame(base());
    const units = Array.from({ length: 9 }, (_, i) => spawnUnit(s, 0, 'hoplite', 20 + i, 20));
    const shape = (f: 'line' | 'box' | 'column' | 'wedge') => formationOffsets(units, 20, 20, 20, 40, f);   // indo para +y
    const widthOf = (o: [number, number][]) => new Set(o.map(([x]) => Math.round(x * 100))).size;
    const depthOf = (o: [number, number][]) => new Set(o.map(([, y]) => Math.round(y * 100))).size;
    expect(shape('column').length).toBe(9);
    expect(widthOf(shape('column'))).toBeLessThanOrEqual(3);   // 2 por fileira (+ o centro da última fileira ímpar)
    expect(depthOf(shape('column'))).toBe(5);
    expect(widthOf(shape('box'))).toBe(3);
    expect(depthOf(shape('box'))).toBe(3);
    expect(widthOf(shape('line'))).toBeGreaterThanOrEqual(4);
    const w = shape('wedge');
    expect(Math.abs(w[0][0]) + Math.abs(w[0][1])).toBe(0);   // ponta
    expect(depthOf(w)).toBe(4);                       // fileiras 1+2+3+3
    // a ordem de mover com formação leva as unidades a posições diferentes por formação
    applyCommand(s, { type: 'move', player: 0, ids: units.map((u) => u.id), x: 30, y: 30, formation: 'column' });
    const targetsCol = units.map((u) => `${u.tx.toFixed(1)},${u.ty.toFixed(1)}`).join('|');
    applyCommand(s, { type: 'move', player: 0, ids: units.map((u) => u.id), x: 30, y: 30, formation: 'wedge' });
    const targetsWedge = units.map((u) => `${u.tx.toFixed(1)},${u.ty.toFixed(1)}`).join('|');
    expect(targetsCol).not.toBe(targetsWedge);
  });
});

describe('relíquias', () => {
  it('herói recolhe a relíquia do chão, guarda no Templo e o dono ganha favor; a IA busca relíquias', async () => {
    const { RELIC_FAVOR_PER_SECOND } = await import('../src/core/constants');
    const { relicsOf } = await import('../src/core/sim/relics');
    const s = createGame(base());
    expect(s.relics.length).toBe(4);
    for (const r of s.relics) expect(componentAt(s.map, Math.floor(r.x), Math.floor(r.y))).toBeGreaterThanOrEqual(0);
    const r = s.relics[0];
    const hero = spawnUnit(s, 0, 'jason', r.x + 0.3, r.y);
    run(s, TICK_RATE + 1);
    expect(r.carrier).toBe(hero.id);
    const tc = buildingsOf(s, 0)[0];
    const temple = placeBuilding(s, 0, 'temple', tc.tx + 5, tc.ty, true);
    hero.x = temple.x; hero.y = temple.y + temple.h / 2 + 1; hero.px = hero.x; hero.py = hero.y;
    const f0 = s.players[0].resources.favor;
    run(s, 4 * TICK_RATE + 1);
    expect(r.templeId).toBe(temple.id);
    expect(relicsOf(s, 0)).toBe(1);
    expect(s.players[0].resources.favor - f0).toBeGreaterThanOrEqual(RELIC_FAVOR_PER_SECOND * 3 - 1e-6);
    // Templo destruído: a relíquia volta ao chão
    applyCommand(s, { type: 'delete', player: 0, ids: [temple.id] });
    run(s, TICK_RATE + 1);
    expect(r.templeId).toBe(-1);
    // IA: herói ocioso parte para a relíquia mais próxima
    const ai = createGame(base({ players: [{ name: 'IA', god: 'zeus', isAI: true, difficulty: 'normal', team: 0 }, { name: 'B', god: 'poseidon', isAI: false, difficulty: 'normal', team: 1 }] }));
    const near = ai.relics[0];
    const j = spawnUnit(ai, 0, 'jason', near.x + 6, near.y);
    run(ai, 8 * TICK_RATE);
    expect(j.state !== 'idle' || near.carrier === j.id).toBe(true);
  });
});
