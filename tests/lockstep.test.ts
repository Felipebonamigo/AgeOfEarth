import { describe, it, expect } from 'vitest';
import { NetworkScheduler } from '../src/core/net/lockstep';
import { stateHash } from '../src/core/net/hash';
import { createGame } from '../src/core/sim/game';
import { serialize, deserialize } from '../src/core/serialize';
import { generateMap } from '../src/core/map/mapgen';
import { mapToData, base64ToBytes, bytesToBase64 } from '../src/core/map/fixed';
import { TERRAIN } from '../src/core/constants';
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

  it('comandos que passam na frente do instantâneo (ticks >= T) não são perdidos por quem reconecta ou assiste', () => {
    const cfg: GameConfig = { seed: 4343, mapSize: 'small', players: [
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
    alive[2] = false; scheds[0].dropPlayer(2); scheds[1].dropPlayer(2);
    stepAll(60);
    const T = states[0].tick;
    const resume = NetworkScheduler.resumeTick(T, DELAY);
    const snapshot = JSON.stringify({ state: serialize(states[0]), pending: scheds[0].exportPending(T) });   // A exporta agora…
    scheds[0].addPlayer(2, resume); scheds[1].addPlayer(2, resume);
    alive[2] = true;
    // …mas antes de C aplicar o instantâneo, B manda uma ordem para um tick futuro: ela chega a C (e a A) pelo relay
    scheds[1].issue({ type: 'move', player: 1, ids: vill(states[1], 1), x: 25, y: 25 } as Command);
    scheds[1].step(states[1]); flush();
    const data = JSON.parse(snapshot) as { state: string; pending: [number, [number, Command[]][]][] };
    states[2] = deserialize(data.state);
    scheds[2].importPending(data.pending, resume, T);
    stepAll(120);
    for (let g = 0; g < 60 && !(states[0].tick === states[1].tick && states[1].tick === states[2].tick); g++) { const mx = Math.max(...states.map((s) => s.tick)); for (let i = 0; i < 3; i++) if (states[i].tick < mx) scheds[i].step(states[i]); flush(); }
    expect(states[2].tick).toBe(states[0].tick);
    expect(states[2].tick).toBeGreaterThan(T + 60);
    expect(stateHash(states[2])).toBe(stateHash(states[0]));
    expect(stateHash(states[1])).toBe(stateHash(states[0]));
    expect(scheds.every((s) => !s.desynced)).toBe(true);
  });
});

describe('lockstep em mapa fixo', () => {
  /** Dois pares em memória com entrega imediata; devolve os ticks em que cada um acusou dessincronização. */
  function runPair(cfgA: GameConfig, cfgB: GameConfig, ticks: number) {
    const a = createGame(cfgA), b = createGame(cfgB);
    const desyncA: number[] = [], desyncB: number[] = [];
    let sa!: NetworkScheduler, sb!: NetworkScheduler;
    sa = new NetworkScheduler(0, [0, 1], 3, { sendCmds: (t, c) => sb.receive(0, t, c), sendHash: (t, h) => sb.receiveHash(0, t, h) });
    sb = new NetworkScheduler(1, [0, 1], 3, { sendCmds: (t, c) => sa.receive(1, t, c), sendHash: (t, h) => sa.receiveHash(1, t, h) });
    sa.onDesync = (t) => desyncA.push(t); sb.onDesync = (t) => desyncB.push(t);
    for (let i = 0; i < ticks; i++) { sa.step(a); sb.step(b); }
    return { a, b, sa, sb, desyncA, desyncB };
  }
  const mapCfg = (): GameConfig => ({ seed: 99, mapSize: 'small', map: mapToData(generateMap(64, 64, 31, 2, 'mountains'), 'lockstep'), players: [
    { name: 'A', god: 'zeus', isAI: true, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: true, difficulty: 'normal' },
  ] });
  it('dois pares com o mesmo config.map mantêm hashes iguais por 400 ticks', () => {
    const cfg = mapCfg();
    const { a, b, sa, sb, desyncA, desyncB } = runPair(cfg, JSON.parse(JSON.stringify(cfg)), 400);
    expect(a.tick).toBe(b.tick); expect(a.tick).toBeGreaterThanOrEqual(400);
    expect(stateHash(a)).toBe(stateHash(b));
    expect(sa.desynced).toBe(false); expect(sb.desynced).toBe(false);
    expect(desyncA).toEqual([]); expect(desyncB).toEqual([]);
  });
  it('negativo: um tile de terreno diferente num dos pares acusa dessincronização no primeiro hash trocado (tick 100)', () => {
    const cfg = mapCfg();
    const other: GameConfig = JSON.parse(JSON.stringify(cfg));
    // troca um tile de grama por terra (passável: a simulação não muda, só o mapa) no canto do mapa
    const bytes = base64ToBytes(other.map!.terrain, other.map!.w * other.map!.h);
    let i = 0; while (bytes[i] !== TERRAIN.GRASS) i++;
    bytes[i] = TERRAIN.DIRT;
    other.map!.terrain = bytesToBase64(bytes);
    const { sa, sb, desyncA, desyncB } = runPair(cfg, other, 250);
    expect(sa.desynced).toBe(true); expect(sb.desynced).toBe(true);
    expect(desyncA).toEqual([100]); expect(desyncB).toEqual([100]);
  });
});

describe('anti-trapaça básico', () => {
  it('comando recebido em nome de outro jogador é descartado', () => {
    const a = createGame(config);
    const sa = new NetworkScheduler(0, [0, 1], 2, { sendCmds: () => {}, sendHash: () => {} });
    const villA = [...a.units.values()].filter((u) => u.owner === 0 && u.type === 'villager').map((u) => u.id);
    const x0 = a.units.get(villA[0])!.x;
    // o par 1 tenta mandar os cidadãos do jogador 0 para longe
    for (let t = 0; t < 40; t++) sa.receive(1, t, t === 5 ? [{ type: 'move', player: 0, ids: villA, x: x0 + 20, y: 10 } as Command] : []);
    for (let i = 0; i < 30; i++) sa.step(a);
    expect(a.units.get(villA[0])!.order?.type).not.toBe('move');
  });
  it('espectador (local -1) acompanha dois jogadores sem enviar comandos nem hashes e termina com o mesmo estado', () => {
    const a = createGame(config), b = createGame(config), w = createGame(config);
    const qA: (() => void)[] = [], qB: (() => void)[] = [], qW: (() => void)[] = [];
    let sa!: NetworkScheduler, sb!: NetworkScheduler, sw!: NetworkScheduler;
    let sentByWatcher = 0;
    sa = new NetworkScheduler(0, [0, 1], 3, { sendCmds: (t, c) => { qB.push(() => sb.receive(0, t, c)); qW.push(() => sw.receive(0, t, c)); }, sendHash: (t, h) => { qB.push(() => sb.receiveHash(0, t, h)); qW.push(() => sw.receiveHash(0, t, h)); } });
    sb = new NetworkScheduler(1, [0, 1], 3, { sendCmds: (t, c) => { qA.push(() => sa.receive(1, t, c)); qW.push(() => sw.receive(1, t, c)); }, sendHash: (t, h) => { qA.push(() => sa.receiveHash(1, t, h)); qW.push(() => sw.receiveHash(1, t, h)); } });
    sw = new NetworkScheduler(-1, [0, 1], 3, { sendCmds: () => { sentByWatcher++; }, sendHash: () => { sentByWatcher++; } });
    expect(sw.spectator).toBe(true);
    const villA = [...a.units.values()].filter((u) => u.owner === 0 && u.type === 'villager').map((u) => u.id);
    const tcA = [...a.buildings.values()].find((x) => x.owner === 0)!;
    for (let i = 0; i < 300; i++) {
      if (i === 10) sa.issue({ type: 'move', player: 0, ids: villA, x: tcA.x + 5, y: tcA.y + 5 } as Command);
      if (i === 12) sw.issue({ type: 'move', player: 0, ids: villA, x: tcA.x - 9, y: tcA.y } as Command);   // ignorado: espectador não comanda
      sa.step(a);
      if (i % 2 === 0) { while (qB.length) qB.shift()!(); while (qA.length) qA.shift()!(); while (qW.length) qW.shift()!(); }
      sb.step(b); sw.step(w);
    }
    while (qB.length) qB.shift()!(); while (qA.length) qA.shift()!(); while (qW.length) qW.shift()!();
    for (let g = 0; g < 60 && !(a.tick === b.tick && b.tick === w.tick); g++) { const m = Math.max(a.tick, b.tick, w.tick); if (a.tick < m) sa.step(a); if (b.tick < m) sb.step(b); if (w.tick < m) sw.step(w); }
    expect(w.tick).toBe(a.tick); expect(w.tick).toBeGreaterThan(200);
    expect(stateHash(w)).toBe(stateHash(a)); expect(stateHash(b)).toBe(stateHash(a));
    expect(sentByWatcher).toBe(0);
    expect(sw.desynced).toBe(false);
    const u = w.units.get(villA[0])!;
    expect(Math.abs(u.x - (tcA.x + 5)) < 3 || u.state !== 'idle').toBe(true);   // a ordem do jogador A foi aplicada no espectador
  });
});
