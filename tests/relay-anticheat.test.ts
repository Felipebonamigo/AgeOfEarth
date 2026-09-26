// Relay (server/relay.mjs), anti-trapaça básico (ROADMAP 4.5): só repassa comandos em nome do jogador da própria vaga, tick
// estritamente crescente por conexão, JSON malformado recebe erro sem derrubar a sala, mensagens grandes demais são recusadas e
// uma enxurrada acima do ritmo do jogo derruba só quem a mandou — o ritmo normal (e rajadas de recuperação) passa com folga.
// Revisão: quadro WebSocket inválido não derruba o processo; reconexão só com a ficha da vaga; anfitrião também tem limites;
// configurações do lobby saneadas; deus do lobby sem nomes do protótipo; instantâneo só para quem o pediu.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import WebSocket from 'ws';
import { SIM_VERSION } from '../src/core/constants';
import { NetClient, loadSeat, seatKey } from '../src/net/client';
import type { GameConfig } from '../src/core/types';

const PORT = 18950 + (process.pid % 40);
let relay: ChildProcess;

beforeAll(async () => {
  relay = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'relay.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('relay não subiu')), 5000);
    relay.stdout!.on('data', (d) => { if (String(d).includes('ouvindo')) { clearTimeout(timer); resolve(); } });
  });
});
afterAll(() => { relay?.kill(); });

type Msg = Record<string, unknown>;
/** Cliente de teste: guarda tudo o que recebe e espera por uma mensagem que satisfaça um predicado. */
class Peer {
  ws: WebSocket; inbox: Msg[] = []; closed = false; slot = -1;
  private waiters: { pred: (m: Msg) => boolean; resolve: (m: Msg) => void }[] = [];
  constructor() {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    this.ws.on('message', (d) => { const m = JSON.parse(String(d)) as Msg; this.inbox.push(m); for (const w of [...this.waiters]) if (w.pred(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(m); } });
    this.ws.on('close', () => { this.closed = true; });
    this.ws.on('error', () => {});   // o relay fecha conexões com quadro inválido; o erro do lado do cliente não interessa aqui
    this.whenClosed = new Promise((resolve) => this.ws.on('close', (code) => resolve(code)));
  }
  whenClosed: Promise<number>;
  open() { return new Promise<void>((resolve, reject) => { this.ws.once('open', () => resolve()); this.ws.once('error', reject); }); }
  send(m: Msg) { this.ws.send(JSON.stringify(m)); }
  raw(s: string) { this.ws.send(s); }
  wait(pred: (m: Msg) => boolean, ms = 3000): Promise<Msg> {
    const seen = this.inbox.find(pred); if (seen) return Promise.resolve(seen);
    return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('mensagem não chegou')), ms); this.waiters.push({ pred, resolve: (m) => { clearTimeout(timer); resolve(m); } }); });
  }
  /** Mensagens `cmds` recebidas da vaga dada, na ordem. */
  cmdsFrom(slot: number) { return this.inbox.filter((m) => m.t === 'cmds' && m.slot === slot); }
  close() { this.ws.close(); }
}

/** Sala com dois jogadores e a partida começada: A é o anfitrião (jogador 0), B o jogador 1. */
async function startedRoom(code: string): Promise<{ a: Peer; b: Peer }> {
  const a = new Peer(), b = new Peer();
  await a.open(); await b.open();
  a.send({ t: 'join', room: code, name: 'Ana', god: 'zeus', sim: SIM_VERSION });
  a.slot = Number((await a.wait((m) => m.t === 'joined')).slot);
  b.send({ t: 'join', room: code, name: 'Beto', god: 'hades', sim: SIM_VERSION });
  b.slot = Number((await b.wait((m) => m.t === 'joined')).slot);
  a.send({ t: 'start', config: { seed: 1, mapSize: 'small', players: [] }, delay: 4 });
  const st = await b.wait((m) => m.t === 'start');
  expect(st.slots).toEqual([a.slot, b.slot]);
  return { a, b };
}
/** Resposta do relay a `list` pedida por uma conexão nova (o processo segue de pé). */
async function listRooms(): Promise<{ code: string; mapSize?: unknown; mode?: unknown }[]> {
  const c = new Peer(); await c.open(); c.send({ t: 'list' });
  const rooms = (await c.wait((m) => m.t === 'rooms')).rooms as { code: string }[];
  c.close();
  return rooms;
}
/** Barreira: B manda um tick marcado e espera A recebê-lo (tudo o que B mandou antes já chegou ou foi descartado). */
async function barrier(a: Peer, b: Peer, tick: number) {
  b.send({ t: 'cmds', tick, cmds: [] });
  await a.wait((m) => m.t === 'cmds' && m.slot === b.slot && m.tick === tick);
}

describe('relay: anti-trapaça básico', () => {
  it('não repassa comando declarado em nome de outro jogador (nem lixo na lista); o tick chega mesmo vazio', async () => {
    const { a, b } = await startedRoom('VAGA');
    b.send({ t: 'cmds', tick: 1, cmds: [
      { type: 'stop', player: 0, ids: [1] },          // B (jogador 1) tentando mandar no jogador 0
      { type: 'stop', player: 1, ids: [2] },          // legítimo
      'lixo', null, 7, [1, 2], { type: 'stop', ids: [3] },
      { type: 'move', player: '1', ids: [4], x: 1, y: 1 },
    ] });
    const m = await a.wait((x) => x.t === 'cmds' && x.slot === b.slot && x.tick === 1);
    expect(m.cmds).toEqual([{ type: 'stop', player: 1, ids: [2] }]);
    b.send({ t: 'cmds', tick: 2, cmds: [{ type: 'stop', player: 0, ids: [1] }] });
    expect((await a.wait((x) => x.t === 'cmds' && x.slot === b.slot && x.tick === 2)).cmds).toEqual([]);
    b.send({ t: 'cmds', tick: 3, cmds: 'não é lista' });
    expect((await a.wait((x) => x.t === 'cmds' && x.slot === b.slot && x.tick === 3)).cmds).toEqual([]);
    // e o anfitrião (jogador 0) também não manda pelo jogador 1
    a.send({ t: 'cmds', tick: 1, cmds: [{ type: 'stop', player: 1, ids: [9] }, { type: 'stop', player: 0, ids: [8] }] });
    expect((await b.wait((x) => x.t === 'cmds' && x.slot === a.slot && x.tick === 1)).cmds).toEqual([{ type: 'stop', player: 0, ids: [8] }]);
    a.close(); b.close();
  });

  it('tick repetido, fora de ordem ou inválido não é repassado; antes do start, comandos não circulam', async () => {
    const a = new Peer(), b = new Peer();
    await a.open(); await b.open();
    a.send({ t: 'join', room: 'ORDEM', name: 'Ana', sim: SIM_VERSION }); a.slot = Number((await a.wait((m) => m.t === 'joined')).slot);
    b.send({ t: 'join', room: 'ORDEM', name: 'Beto', sim: SIM_VERSION }); b.slot = Number((await b.wait((m) => m.t === 'joined')).slot);
    b.send({ t: 'cmds', tick: 0, cmds: [] });   // ainda no lobby
    a.send({ t: 'start', config: { seed: 1, mapSize: 'small', players: [] }, delay: 4 });
    await b.wait((m) => m.t === 'start');
    b.send({ t: 'cmds', tick: 5, cmds: [{ type: 'stop', player: 1, ids: [1] }] });
    b.send({ t: 'cmds', tick: 5, cmds: [{ type: 'stop', player: 1, ids: [2] }] });   // mesmo tick com outro conteúdo
    b.send({ t: 'cmds', tick: 3, cmds: [] });                                         // para trás
    b.send({ t: 'cmds', tick: 5.5, cmds: [] });
    b.send({ t: 'cmds', tick: -1, cmds: [] });
    b.send({ t: 'cmds', tick: '6', cmds: [] });
    await barrier(a, b, 6);
    expect(a.cmdsFrom(b.slot).map((m) => [m.tick, m.cmds])).toEqual([[5, [{ type: 'stop', player: 1, ids: [1] }]], [6, []]]);
    a.close(); b.close();
  });

  it('JSON malformado recebe erro e a sala continua; hash inválido não passa e o detalhamento é saneado', async () => {
    const { a, b } = await startedRoom('JSON');
    for (const junk of ['{oops', 'null', '[1,2,3]', '42', '"texto"', '{"t":7}', '{"sem":"t"}']) b.raw(junk);
    b.send({ t: 'join', room: 'OUTRA', name: 'x', sim: SIM_VERSION });   // uma vaga por conexão
    b.send({ t: 'settings', settings: 'x' }); b.send({ t: 'player', god: { obj: 1 }, team: 'x' }); b.send({ t: 'kick', slot: { x: 1 } });
    await barrier(a, b, 1);
    const errors = b.inbox.filter((m) => m.t === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(8);
    expect(errors.every((m) => m.code === 'badMessage')).toBe(true);
    expect(b.closed).toBe(false); expect(a.closed).toBe(false);
    // hash: NaN/negativo/texto não passam; detalhamento só como lista curta de uint32
    b.send({ t: 'hash', tick: 100, hash: -5 });
    b.send({ t: 'hash', tick: 100, hash: 'abc' });
    b.send({ t: 'hash', tick: 100, hash: 123, parts: [1, 2, 3] });
    b.send({ t: 'hash', tick: 200, hash: 456, parts: [1, 'x'] });
    b.send({ t: 'hash', tick: 300, hash: 789, parts: new Array(500).fill(1) });
    await a.wait((m) => m.t === 'hash' && m.tick === 300);
    const hashes = a.inbox.filter((m) => m.t === 'hash');
    expect(hashes.map((m) => [m.tick, m.hash, m.parts])).toEqual([[100, 123, [1, 2, 3]], [200, 456, undefined], [300, 789, undefined]]);
    // um terceiro ainda consegue listar e o relay responde
    const c = new Peer(); await c.open(); c.send({ t: 'list' });
    const rooms = await c.wait((m) => m.t === 'rooms');
    expect((rooms.rooms as { code: string }[]).some((r) => r.code === 'JSON')).toBe(true);
    a.close(); b.close(); c.close();
  });

  it('mensagem grande demais de quem não é anfitrião é recusada sem derrubar ninguém', async () => {
    const { a, b } = await startedRoom('GRANDE');
    const big = { type: 'stop', player: 1, ids: Array.from({ length: 150_000 }, (_, i) => i) };   // ~1 MB
    b.send({ t: 'cmds', tick: 1, cmds: [big] });
    await b.wait((m) => m.t === 'error' && m.code === 'tooBig');
    await barrier(a, b, 2);
    expect(a.cmdsFrom(b.slot).map((m) => m.tick)).toEqual([2]);
    expect(b.closed).toBe(false);
    a.close(); b.close();
  });

  it('ritmo normal e rajadas de recuperação passam; enxurrada derruba só o abusador e os outros veem "left"', async () => {
    const { a, b } = await startedRoom('TAXA');
    // rajada de recuperação (ex.: ao voltar de uma aba em segundo plano) + 1 s a 100 mensagens/s (5× o lockstep)
    let tick = 1;
    for (let i = 0; i < 150; i++) b.send({ t: 'cmds', tick: tick++, cmds: [{ type: 'stop', player: 1, ids: [i] }] });
    for (let k = 0; k < 10; k++) { for (let i = 0; i < 10; i++) b.send({ t: 'cmds', tick: tick++, cmds: [] }); await new Promise((r) => setTimeout(r, 100)); }
    await a.wait((m) => m.t === 'cmds' && m.slot === b.slot && m.tick === tick - 1);
    expect(a.cmdsFrom(b.slot).length).toBe(tick - 1);
    expect(b.closed).toBe(false);
    // enxurrada: milhares de mensagens de uma vez
    for (let i = 0; i < 3000 && b.ws.readyState === WebSocket.OPEN; i++) b.send({ t: 'cmds', tick: tick++, cmds: [] });
    const err = await b.wait((m) => m.t === 'error' && m.code === 'rateLimit');
    expect(String(err.msg)).toMatch(/demais/);
    await a.wait((m) => m.t === 'left' && m.slot === b.slot);
    await new Promise((r) => setTimeout(r, 100));
    expect(b.closed).toBe(true);
    // A segue conectado e atendido
    a.send({ t: 'ping', ts: 42 });
    expect((await a.wait((m) => m.t === 'pong')).ts).toBe(42);
    expect(a.closed).toBe(false);
    a.close();
  });

  it('quadro WebSocket inválido (UTF-8 ruim, acima de maxPayload) fecha só essa conexão: o processo e as salas seguem', async () => {
    const { a, b } = await startedRoom('QUADRO');
    const x = new Peer(); await x.open();
    x.ws.send(Buffer.from([0x7b, 0xff, 0xfe, 0x7d]), { binary: false });   // texto com UTF-8 inválido (antes: o relay morria)
    expect(await x.whenClosed).toBe(1007);
    const y = new Peer(); await y.open();
    y.ws.send(Buffer.alloc(9 * 1024 * 1024, 0x20));                         // acima de maxPayload (8 MB)
    expect(await y.whenClosed).toBe(1009);
    expect((await listRooms()).some((r) => r.code === 'QUADRO')).toBe(true);
    await barrier(a, b, 1);
    // de dentro da sala: quem manda o quadro ruim sai (os outros veem 'left'), o resto continua
    b.ws.send(Buffer.from([0x22, 0xc3, 0x28, 0x22]), { binary: false });
    await a.wait((m) => m.t === 'left' && m.slot === b.slot);
    a.send({ t: 'ping', ts: 7 });
    expect((await a.wait((m) => m.t === 'pong')).ts).toBe(7);
    expect(a.closed).toBe(false);
    a.close();
  });

  it('reconexão exige a ficha da vaga: entrar com o nome de quem caiu não herda a vaga nem o instantâneo', async () => {
    const { a, b } = await startedRoom('FICHA');
    const token = String(b.inbox.find((m) => m.t === 'joined')!.token);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(a.inbox.find((m) => m.t === 'joined')!.token).not.toBe(token);
    expect(JSON.stringify(a.inbox)).not.toContain(token);   // a ficha vai só para a própria conexão
    b.close();
    await a.wait((m) => m.t === 'left' && m.slot === b.slot);
    for (const extra of [{}, { token: 'f'.repeat(32) }, { token: 123 }]) {
      const evil = new Peer(); await evil.open();
      evil.send({ t: 'join', room: 'FICHA', name: 'Beto', sim: SIM_VERSION, ...extra });   // nome de quem caiu, sem a ficha certa
      expect(String((await evil.wait((m) => m.t === 'error')).msg)).toMatch(/já começou/);
      evil.send({ t: 'cmds', tick: 50, cmds: [{ type: 'delete', player: 1, ids: [3, 4, 5] }] });
      evil.close();
    }
    const back = new Peer(); await back.open();
    back.send({ t: 'join', room: 'FICHA', name: 'Outro nome', sim: SIM_VERSION, token });
    expect(await back.wait((m) => m.t === 'joined')).toMatchObject({ slot: b.slot, rejoin: true, token });
    expect((await a.wait((m) => m.t === 'snapshotRequest')).slot).toBe(b.slot);
    expect(a.inbox.filter((m) => m.t === 'snapshotRequest')).toHaveLength(1);   // só o dono da ficha pediu
    expect(a.cmdsFrom(b.slot)).toEqual([]);                                      // nenhum comando do intruso
    a.close(); back.close();
  });

  it('instantâneo só vai a quem o relay o pediu, uma vez; o pedido passa do limite de tamanho e fora do balde de bytes', async () => {
    const { a, b } = await startedRoom('INSTA');
    const token = String(b.inbox.find((m) => m.t === 'joined')!.token);
    a.send({ t: 'snapshot', slot: b.slot, data: 'sem pedido', tick: 1 });   // ninguém pediu: descartado
    b.close();
    await a.wait((m) => m.t === 'left' && m.slot === b.slot);
    const back = new Peer(); await back.open();
    back.send({ t: 'join', room: 'INSTA', name: 'Beto', sim: SIM_VERSION, token });
    await a.wait((m) => m.t === 'snapshotRequest');
    const data = 'x'.repeat(5 * 1024 * 1024);   // fim de partida grande: acima dos 512 KB e do balde de 4 MB
    a.send({ t: 'snapshot', slot: b.slot, data, tick: 10 });
    const snap = await back.wait((m) => m.t === 'snapshot', 10000);
    expect(String(snap.data).length).toBe(data.length);
    a.send({ t: 'snapshot', slot: b.slot, data: 'de novo', tick: 11 });      // o pedido já foi atendido
    a.send({ t: 'ping', ts: 9 });
    expect((await a.wait((m) => m.t === 'pong')).ts).toBe(9);                 // anfitrião segue (instantâneo fora do balde)
    back.send({ t: 'ping', ts: 10 }); await back.wait((m) => m.t === 'pong');
    expect(back.inbox.filter((m) => m.t === 'snapshot').map((m) => m.tick)).toEqual([10]);
    a.close(); back.close();
  });

  it('anfitrião também tem limites (tamanho e balde de bytes); configurações do lobby saneadas; `list` não amplifica', async () => {
    const a = new Peer(), b = new Peer();
    await a.open(); await b.open();
    a.send({ t: 'join', room: 'CHEFE', name: 'Ana', god: 'constructor', sim: SIM_VERSION }); a.slot = Number((await a.wait((m) => m.t === 'joined')).slot);
    b.send({ t: 'join', room: 'CHEFE', name: 'Beto', god: '<b>x</b>', sim: SIM_VERSION }); b.slot = Number((await b.wait((m) => m.t === 'joined')).slot);
    b.send({ t: 'player', god: '__proto__' });
    a.send({ t: 'settings', settings: {
      mapSize: 'm'.repeat(100_000), mode: '<img src=x>', ais: 99, public: 'sim', horde: false, extra: 'x'.repeat(1000), difficulty: 'hard', seed: -5,
      fixedMap: { name: 'n'.repeat(500), w: 64, h: 64, starts: 2, hash: 5, blob: 'x'.repeat(1000) },
    } });
    const lobby = await b.wait((m) => m.t === 'lobby' && (m.settings as { difficulty?: string }).difficulty === 'hard');
    expect(lobby.settings).toEqual({ mapSize: 'medium', ais: 0, difficulty: 'hard', seed: expect.any(Number), horde: false, fixedMap: { name: 'n'.repeat(40), w: 64, h: 64, starts: 2, hash: 5 } });
    // deus fora do padrão (nome do protótipo, HTML) vira zeus: `constructor` quebrava createGame em todos os clientes
    expect((lobby.players as { god: string }[]).map((p) => p.god)).toEqual(['zeus', 'zeus']);
    const room = (await listRooms()).find((r) => r.code === 'CHEFE')!;
    expect(room).toMatchObject({ mapSize: 'medium', mode: 'conquest' });
    expect(JSON.stringify(room).length).toBeLessThan(400);
    // mensagem grande que não é `start` nem instantâneo pedido: recusada também para o anfitrião
    a.send({ t: 'settings', settings: { difficulty: 'easy', pad: 'x'.repeat(600 * 1024) } });
    await a.wait((m) => m.t === 'error' && m.code === 'tooBig');
    // `start` com mapa fixo grande continua passando
    a.send({ t: 'start', config: { seed: 1, mapSize: 'small', players: [], map: { blob: 'x'.repeat(700 * 1024) } }, delay: 4 });
    await b.wait((m) => m.t === 'start', 5000);
    // enxurrada de bytes do anfitrião (antes isento: 450 MB em 4 s sem corte): derrubado como qualquer um
    for (let i = 0; i < 40 && a.ws.readyState === WebSocket.OPEN; i++) a.send({ t: 'player', pad: 'x'.repeat(450 * 1024) });
    await a.wait((m) => m.t === 'error' && m.code === 'rateLimit', 5000);
    await b.wait((m) => m.t === 'host' && m.slot === b.slot);
    await b.wait((m) => m.t === 'left' && m.slot === a.slot);
    expect(b.closed).toBe(false);
    b.close();
  });

  it('limites de comandos por tick por tipo iguais aos do cliente (netCommands): `build` até 1024, os demais até 64', async () => {
    const { a, b } = await startedRoom('TIPOS');
    const stops = Array.from({ length: 100 }, (_, i) => ({ type: 'stop', player: 1, ids: [i] }));
    const builds = Array.from({ length: 1100 }, (_, i) => ({ type: 'build', player: 1, ids: [1], building: 'wall', tx: i % 60, ty: 1 }));
    b.send({ t: 'cmds', tick: 1, cmds: [...stops, ...builds] });
    const m = await a.wait((x) => x.t === 'cmds' && x.slot === b.slot && x.tick === 1);
    const got = m.cmds as { type: string }[];
    expect(got.filter((c) => c.type === 'stop')).toHaveLength(64);
    expect(got.filter((c) => c.type === 'build')).toHaveLength(1024);
    a.close(); b.close();
  });

  it('NetClient guarda a ficha por sala e nome e reconecta com ela (página recarregada, bot do teste de carga)', async () => {
    const url = `ws://127.0.0.1:${PORT}`;
    const joined = (c: NetClient) => new Promise<Record<string, unknown>>((resolve) => c.on('joined', resolve));
    const host = new NetClient(); await host.connect(url);
    let j = joined(host); host.join('cliente', 'Ana', 'zeus'); await j;
    const guest = new NetClient(); await guest.connect(url);
    j = joined(guest); guest.join('cliente', 'Beto', 'hades'); await j;
    const token = loadSeat(seatKey('cliente', 'Beto'));
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    const started = new Promise((resolve) => guest.on('start', resolve));
    host.start({ seed: 1, mapSize: 'small', players: [] } as unknown as GameConfig, 4); await started;
    const left = new Promise((resolve) => host.on('left', resolve));
    guest.close(); await left;
    const back = new NetClient(); await back.connect(url);   // cliente novo (como depois de recarregar): a ficha vem do armazenamento
    j = joined(back); back.join('CLIENTE', 'Beto', 'hades');
    expect(await j).toMatchObject({ rejoin: true, slot: guest.slot, token });
    host.close(); back.close();
  });
});
