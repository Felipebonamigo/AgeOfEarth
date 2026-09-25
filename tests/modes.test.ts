// Modos de jogo (Fase 5.1): Deathmatch, Regicídio, Rei da Colina e tipos de mapa.
import { describe, it, expect } from 'vitest';
import { KOTH_RADIUS, KOTH_SECONDS, MAP_TYPES, TICK_RATE, DEATHMATCH_RESOURCES } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { applyCommand } from '../src/core/sim/commands';
import { buildingsOf, spawnUnit, unitsOf } from '../src/core/sim/entities';
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
