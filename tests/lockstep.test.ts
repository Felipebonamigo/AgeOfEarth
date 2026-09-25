import { describe, it, expect } from 'vitest';
import { NetworkScheduler } from '../src/core/net/lockstep';
import { stateHash } from '../src/core/net/hash';
import { createGame } from '../src/core/sim/game';
import { serialize, deserialize } from '../src/core/serialize';
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

describe('reconexão por instantâneo', () => {
  it('par que caiu volta com o instantâneo do anfitrião e os três terminam com o mesmo hash', () => {
    const cfg: GameConfig = { seed: 4242, mapSize: 'small', players: [
      { name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal' }, { name: 'C', god: 'poseidon', isAI: false, difficulty: 'normal' },
    ] };
    const states = [createGame(cfg), createGame(cfg), createGame(cfg)];
    const queues: (() => void)[][] = [[], [], []];
    const scheds: NetworkScheduler[] = [];
    const alive = [true, true, true];
    const DELAY = 3;
    for (let i = 0; i < 3; i++) {
      scheds.push(new NetworkScheduler(i, [0, 1, 2], DELAY, {
        sendCmds: (t, c) => { for (let j = 0; j < 3; j++) if (j !== i) queues[j].push(() => { if (alive[j]) scheds[j].receive(i, t, c); }); },
        sendHash: (t, h) => { for (let j = 0; j < 3; j++) if (j !== i) queues[j].push(() => { if (alive[j]) scheds[j].receiveHash(i, t, h); }); },
      }));
    }
    const flush = () => { for (const q of queues) while (q.length) q.shift()!(); };
    const stepAll = (n: number) => { for (let k = 0; k < n; k++) { for (let i = 0; i < 3; i++) if (alive[i]) scheds[i].step(states[i]); flush(); } };
    const vill = (st: typeof states[0], owner: number) => [...st.units.values()].filter((u) => u.owner === owner && u.type === 'villager').map((u) => u.id);
    stepAll(40);
    // C cai: os outros o descartam e seguem
    alive[2] = false; scheds[0].dropPlayer(2); scheds[1].dropPlayer(2);
    scheds[0].issue({ type: 'move', player: 0, ids: vill(states[0], 0), x: 20, y: 20 } as Command);
    stepAll(60);
    expect(states[0].tick).toBe(states[1].tick);
    // C reconecta: recebe o instantâneo de A (estado + comandos futuros) e todos voltam a exigi-lo a partir do mesmo tick
    const T = states[0].tick;
    const resume = NetworkScheduler.resumeTick(T, DELAY);
    const snapshot = JSON.stringify({ state: serialize(states[0]), pending: scheds[0].exportPending(T) });
    scheds[0].addPlayer(2, resume); scheds[1].addPlayer(2, resume);
    const data = JSON.parse(snapshot) as { state: string; pending: [number, [number, Command[]][]][] };
    states[2] = deserialize(data.state);
    scheds[2].importPending(data.pending, resume);
    alive[2] = true;
    scheds[2].issue({ type: 'move', player: 2, ids: vill(states[2], 2), x: 30, y: 30 } as Command);
    stepAll(120);
    for (let g = 0; g < 60 && !(states[0].tick === states[1].tick && states[1].tick === states[2].tick); g++) { const mx = Math.max(...states.map((s) => s.tick)); for (let i = 0; i < 3; i++) if (states[i].tick < mx) scheds[i].step(states[i]); flush(); }
    expect(states[0].tick).toBe(states[2].tick);
    expect(states[0].tick).toBeGreaterThan(T + 60);
    expect(stateHash(states[0])).toBe(stateHash(states[1]));
    expect(stateHash(states[0])).toBe(stateHash(states[2]));
    expect(scheds.every((s) => !s.desynced)).toBe(true);
  });
});
