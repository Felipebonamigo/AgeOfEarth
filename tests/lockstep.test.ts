import { describe, it, expect } from 'vitest';
import { NetworkScheduler } from '../src/core/net/lockstep';
import { stateHash } from '../src/core/net/hash';
import { createGame } from '../src/core/sim/game';
import type { Command, GameConfig } from '../src/core/types';

const config: GameConfig = { seed: 777, mapSize: 'small', players: [
  { name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal' }, { name: 'IA', god: 'poseidon', isAI: true, difficulty: 'normal' },
] };

describe('lockstep em rede (transporte em memória)', () => {
  it('dois pares avançam juntos, executam os comandos um do outro e mantêm o mesmo hash', () => {
    const a = createGame(config), b = createGame(config);
    // transporte em memória com fila (entrega assíncrona simulada)
    const queueA: (() => void)[] = [], queueB: (() => void)[] = [];
    let sa!: NetworkScheduler, sb!: NetworkScheduler;
    sa = new NetworkScheduler(0, [0, 1], 4, { sendCmds: (t, c) => queueB.push(() => sb.receive(0, t, c)), sendHash: (t, h) => queueB.push(() => sb.receiveHash(0, t, h)) });
    sb = new NetworkScheduler(1, [0, 1], 4, { sendCmds: (t, c) => queueA.push(() => sa.receive(1, t, c)), sendHash: (t, h) => queueA.push(() => sa.receiveHash(1, t, h)) });
    const villA = [...a.units.values()].filter((u) => u.owner === 0 && u.type === 'villager').map((u) => u.id);
    const villB = [...a.units.values()].filter((u) => u.owner === 1 && u.type === 'villager').map((u) => u.id);
    const tcA = [...a.buildings.values()].find((x) => x.owner === 0)!, tcB = [...a.buildings.values()].find((x) => x.owner === 1)!;
    let stalls = 0; void stalls;
    for (let i = 0; i < 400; i++) {
      if (i === 10) sa.issue({ type: 'move', player: 0, ids: villA, x: tcA.x + 5, y: tcA.y + 5 } as Command);
      if (i === 30) sb.issue({ type: 'move', player: 1, ids: villB, x: tcB.x - 5, y: tcB.y + 5 } as Command);
      // A avança; B só recebe as mensagens com atraso (entrega a cada 3 iterações)
      if (!sa.step(a)) stalls++;
      if (i % 3 === 0) { while (queueB.length) queueB.shift()!(); while (queueA.length) queueA.shift()!(); }
      if (!sb.step(b)) stalls++;
    }
    while (queueB.length) queueB.shift()!(); while (queueA.length) queueA.shift()!();
    // nivela os dois no mesmo tick
    for (let g = 0; g < 50 && a.tick !== b.tick; g++) { if (a.tick < b.tick) sa.step(a); else sb.step(b); }
    expect(a.tick).toBe(b.tick);
    expect(a.tick).toBeGreaterThan(300);
    expect(stateHash(a)).toBe(stateHash(b));
    expect(sa.desynced).toBe(false); expect(sb.desynced).toBe(false);
    // os comandos de ambos foram aplicados nos dois estados
    const uA = a.units.get(villA[0])!, uB = b.units.get(villB[0])!;
    expect(Math.abs(uA.x - (tcA.x + 5)) < 3 || uA.state !== 'idle').toBe(true);
    expect(Math.abs(uB.x - (tcB.x - 5)) < 3 || uB.state !== 'idle').toBe(true);
  });
  it('sem comandos do outro par, a simulação aguarda em vez de divergir', () => {
    const a = createGame(config);
    const sa = new NetworkScheduler(0, [0, 1], 2, { sendCmds: () => {}, sendHash: () => {} });
    let advanced = 0;
    for (let i = 0; i < 20; i++) if (sa.step(a)) advanced++;
    expect(advanced).toBe(2);   // só os ticks anteriores ao atraso avançam sem o outro jogador
    expect(sa.waiting).toBeGreaterThan(0);
  });
});
