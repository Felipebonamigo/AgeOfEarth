// Ponte simulação ↔ Unreal (scripts/unreal): protocolo e servidor com um cliente de mentira.
import { describe, it, expect } from 'vitest';
import WebSocket from 'ws';
import { createBridgeServer, parseArgs } from '../scripts/unreal/sim-server';
import { BridgeSession, buildHello, parseClientMessage, DEFAULT_OPTIONS, PROTOCOL_VERSION } from '../scripts/unreal/protocol';
import { createGame, tick } from '../src/core/sim/game';

const cfg = { seed: 5, mapSize: 'small' as const, players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' as const }, { name: 'B', god: 'hades', isAI: true, difficulty: 'normal' as const }] };

describe('protocolo da ponte', () => {
  it('hello traz mapa, jogadores, nós e dados dos tipos', () => {
    const s = createGame(cfg);
    const h = buildHello(s, DEFAULT_OPTIONS) as Record<string, any>;
    expect(h.protocol).toBe(PROTOCOL_VERSION);
    expect(h.map.w).toBe(s.map.w);
    expect(Buffer.from(h.map.terrain, 'base64').length).toBe(s.map.w * s.map.h);
    expect(h.players).toHaveLength(2);
    expect(h.nodes.length).toBe(s.map.nodes.size);
    expect(h.unitTypes.hoplite.cls).toBe('infantry');
    expect(h.buildingTypes.town_center.w).toBe(3);
  });

  it('state: o jogador vê as próprias unidades e edifícios; o inimigo longe fica de fora (sem reveal)', () => {
    const s = createGame(cfg);
    for (let i = 0; i < 10; i++) tick(s);
    const sess = new BridgeSession({ ...DEFAULT_OPTIONS, stateEvery: 1 });
    sess.afterTick(s);
    const msgs = sess.flush(s) as Record<string, any>[];
    const st = msgs.find((m) => m.type === 'state')!;
    expect(msgs.some((m) => m.type === 'fog')).toBe(true);
    expect(st.units.length).toBeGreaterThan(0);
    expect(st.units.every((u: any) => u.o === 0)).toBe(true);          // só os do jogador 0 estão à vista no começo
    expect(st.buildings.every((b: any) => b.o === 0)).toBe(true);
    expect(st.me.resources.food).toBeGreaterThan(0);
    // com reveal, vem tudo
    const all = new BridgeSession({ ...DEFAULT_OPTIONS, reveal: true, stateEvery: 1 });
    const st2 = (all.flush(s) as Record<string, any>[]).find((m) => m.type === 'state')!;
    expect(st2.units.some((u: any) => u.o === 1)).toBe(true);
  });

  it('nós: só as diferenças; a quantidade que mudou volta uma vez', () => {
    const s = createGame(cfg);
    const sess = new BridgeSession({ ...DEFAULT_OPTIONS, reveal: true, stateEvery: 1 });
    const first = (sess.flush(s) as Record<string, any>[]).find((m) => m.type === 'state')!;
    expect(first.nodes.length).toBe(s.map.nodes.size);
    const again = (sess.flush(s) as Record<string, any>[]).find((m) => m.type === 'state')!;
    expect(again.nodes).toHaveLength(0);
    const n = [...s.map.nodes.values()][0];
    n.amount -= 10;
    const diff = (sess.flush(s) as Record<string, any>[]).find((m) => m.type === 'state')!;
    expect(diff.nodes).toEqual([[n.id, Math.round(n.amount)]]);
  });

  it('comandos: o jogador é sempre o do cliente; lixo e tipos desconhecidos são recusados', () => {
    const s = createGame(cfg);
    const mine = [...s.units.values()].find((u) => u.owner === 0)!;
    const ok = parseClientMessage(s, DEFAULT_OPTIONS, { type: 'cmd', cmd: { type: 'move', player: 1, ids: [mine.id], x: 10, y: 10 } });
    expect(ok).toMatchObject({ kind: 'cmd', cmd: { type: 'move', player: 0 } });   // tentou ser o jogador 1: vira o 0
    expect(parseClientMessage(s, DEFAULT_OPTIONS, { type: 'cmd', cmd: { type: 'hack', ids: [1] } })).toBeNull();
    expect(parseClientMessage(s, DEFAULT_OPTIONS, { type: 'cmd', cmd: { type: 'move', ids: [mine.id], x: 'a', y: 1 } })).toBeNull();
    expect(parseClientMessage(s, DEFAULT_OPTIONS, null)).toBeNull();
    expect(parseClientMessage(s, DEFAULT_OPTIONS, { type: 'speed', speed: 99 })).toEqual({ kind: 'speed', speed: 8 });
  });
});

describe('servidor da ponte (cliente de mentira)', () => {
  it('conecta, recebe hello + state, move uma unidade e vê o resultado', async () => {
    const o = parseArgs(['--port', '0', '--seed', '5', '--size', 'small', '--every', '1', '--reveal']);
    const srv = createBridgeServer(o);
    await srv.listening;
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    const msgs: Record<string, any>[] = [];
    ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
    await new Promise<void>((res, rej) => { ws.on('open', () => res()); ws.on('error', rej); });
    await new Promise((r) => setTimeout(r, 100));
    expect(msgs[0].type).toBe('hello');
    expect(msgs.some((m) => m.type === 'state')).toBe(true);
    const state0 = msgs.filter((m) => m.type === 'state').pop()!;
    const u = state0.units.find((x: any) => x.o === 0 && x.t === 'villager')!;
    const target = { x: u.x + 6, y: u.y };
    ws.send(JSON.stringify({ type: 'cmd', cmd: { type: 'move', ids: [u.id], x: target.x, y: target.y } }));
    await new Promise((r) => setTimeout(r, 30));
    for (let i = 0; i < 60; i++) srv.step();
    await new Promise((r) => setTimeout(r, 150));
    const last = msgs.filter((m) => m.type === 'state').pop()!;
    const moved = last.units.find((x: any) => x.id === u.id)!;
    expect(last.tick).toBeGreaterThan(state0.tick);
    expect(Math.abs(moved.x - u.x)).toBeGreaterThan(2);
    // ping/pong
    ws.send(JSON.stringify({ type: 'ping', t: 123 }));
    await new Promise((r) => setTimeout(r, 80));
    expect(msgs.some((m) => m.type === 'pong' && m.t === 123)).toBe(true);
    ws.close();
    await srv.close();
  });
});
