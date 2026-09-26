// Relay (server/relay.mjs): a sala fica com a versão da simulação (SIM_VERSION) de quem a criou e recusa, com uma mensagem
// clara, jogadores, espectadores e reconexões de outra versão — que dessincronizariam na primeira troca de hash.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import WebSocket from 'ws';
import { SIM_VERSION } from '../src/core/constants';

const PORT = 18700 + (process.pid % 200);
let relay: ChildProcess;

beforeAll(async () => {
  relay = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'relay.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('relay não subiu')), 5000);
    relay.stdout!.on('data', (d) => { if (String(d).includes('ouvindo')) { clearTimeout(timer); resolve(); } });
  });
});
afterAll(() => { relay?.kill(); });

/** Conecta, manda `join` e devolve a primeira resposta (joined ou error), com o socket para fechar depois. */
async function join(room: string, extra: Record<string, unknown>): Promise<{ msg: Record<string, unknown>; ws: WebSocket }> {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  await new Promise<void>((resolve, reject) => { ws.once('open', () => resolve()); ws.once('error', reject); });
  const msg = await new Promise<Record<string, unknown>>((resolve) => {
    ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.t === 'joined' || m.t === 'error') resolve(m); });
    ws.send(JSON.stringify({ t: 'join', room, name: `J${Math.random()}`.slice(0, 8), god: 'zeus', ...extra }));
  });
  return { msg, ws };
}

describe('relay: versão da simulação no handshake', () => {
  it('quem cria a sala define a versão; outra versão (ou cliente antigo, sem o campo) recebe erro simVersion com as duas', async () => {
    const a = await join('VERS', { sim: SIM_VERSION });
    expect(a.msg.t).toBe('joined');
    const old = await join('VERS', {});   // cliente anterior à v2: não manda `sim`
    expect(old.msg).toMatchObject({ t: 'error', code: 'simVersion', room: SIM_VERSION, yours: 1 });
    expect(String(old.msg.msg)).toMatch(/versão/i);
    const spec = await join('VERS', { sim: SIM_VERSION + 1, spectate: true });
    expect(spec.msg).toMatchObject({ t: 'error', code: 'simVersion', room: SIM_VERSION, yours: SIM_VERSION + 1 });
    const b = await join('VERS', { sim: SIM_VERSION });
    expect(b.msg.t).toBe('joined');
    for (const c of [a, old, spec, b]) c.ws.close();
  });
  it('sala criada por um cliente antigo recusa o cliente novo', async () => {
    const a = await join('ANTIGA', {});
    expect(a.msg.t).toBe('joined');
    const b = await join('ANTIGA', { sim: SIM_VERSION });
    expect(b.msg).toMatchObject({ t: 'error', code: 'simVersion', room: 1, yours: SIM_VERSION });
    a.ws.close(); b.ws.close();
  });
});
