// Servidor de demonstração do U1: a mesma ponte de scripts/unreal/sim-server.ts (reaproveita protocol.ts sem mexer nele),
// mas com TODOS os jogadores sob IA e uma pré-corrida: a simulação avança `--avancar` minutos antes do primeiro cliente
// conectar, então o Unreal já abre numa cidade construída e com exércitos, sem depender de jogar a mão.
// Uso: npx tsx unreal/scripts/u1-servidor.ts [--port 8790] [--seed 42] [--size small] [--avancar 8] [--ais 1] [--age 0]
//        [--speed 1] [--every 2] [--difficulty hard]      (o jogador 0 também é IA; o cliente só assiste e comanda se quiser)
import { WebSocketServer, type WebSocket } from 'ws';
import { createGame, tick } from '../../src/core/sim/game';
import { TICK_RATE } from '../../src/core/constants';
import type { Command, GameConfig, GameState } from '../../src/core/types';
import { BridgeSession, buildHello, parseClientMessage, type BridgeOptions } from '../../scripts/unreal/protocol';

const GODS = ['zeus', 'poseidon', 'hades'];
const arg = (n: string, d: string) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const o = {
  port: Number(arg('port', '8790')), seed: Number(arg('seed', '42')), size: arg('size', 'small') as GameConfig['mapSize'],
  avancar: Number(arg('avancar', '8')), ais: Math.max(1, Math.min(3, Number(arg('ais', '1')))), age: Number(arg('age', '0')),
  speed: Number(arg('speed', '1')), every: Math.max(1, Number(arg('every', '2'))), difficulty: arg('difficulty', 'hard') as 'easy' | 'normal' | 'hard' | 'expert', humano: process.argv.includes('--humano'),
};

const players = Array.from({ length: o.ais + 1 }, (_, i) => ({ name: i === 0 ? 'Atenas' : `Rival ${i}`, god: GODS[i % GODS.length], isAI: !(o.humano && i === 0), difficulty: o.difficulty }));
const state: GameState = createGame({ seed: o.seed, mapSize: o.size, players, startingAge: o.age || undefined });
const opts: BridgeOptions = { player: 0, reveal: true, stateEvery: o.every };

const t0 = Date.now();
for (let i = 0; i < o.avancar * 60 * TICK_RATE && !state.gameOver; i++) tick(state, []);
console.log(`pré-corrida: ${o.avancar} min em ${((Date.now() - t0) / 1000).toFixed(1)} s · tick ${state.tick} · ${state.units.size} unidades · ${state.buildings.size} edifícios`);

const wss = new WebSocketServer({ port: o.port, host: '127.0.0.1', maxPayload: 256 * 1024 });
const clients = new Map<WebSocket, BridgeSession>();
let queue: Command[] = [];
let paused = false, speed = o.speed;
const send = (ws: WebSocket, msg: object) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
wss.on('connection', (ws) => {
  const session = new BridgeSession(opts);
  clients.set(ws, session);
  send(ws, buildHello(state, opts));
  for (const m of session.flush(state)) send(ws, m);
  ws.on('message', (data) => {
    let raw: unknown;
    try { raw = JSON.parse(String(data)); } catch { return; }
    const msg = parseClientMessage(state, opts, raw);
    if (!msg) return;
    if (msg.kind === 'cmd') queue.push(msg.cmd);
    else if (msg.kind === 'pause') paused = msg.paused;
    else if (msg.kind === 'speed') speed = msg.speed;
    else if (msg.kind === 'ping') send(ws, { type: 'pong', t: msg.t, tick: state.tick });
  });
  ws.on('close', () => clients.delete(ws));
});
let acc = 0, last = Date.now();
setInterval(() => {
  const now = Date.now(); acc += (now - last) * speed; last = now;
  if (paused) { acc = 0; return; }
  const dtMs = 1000 / TICK_RATE;
  let n = 0;
  while (acc >= dtMs && n < 8) {
    const cmds = queue; queue = [];
    tick(state, cmds);
    for (const [ws, s] of clients) { s.afterTick(state); if (s.due(state) || state.gameOver) for (const m of s.flush(state)) send(ws, m); }
    acc -= dtMs; n++;
  }
  if (acc > dtMs * 8) acc = 0;
}, 10);
console.log(`Ponte U1: ws://127.0.0.1:${o.port} · semente ${o.seed} · ${players.length} jogadores (todos IA) · ${state.map.w}×${state.map.h} tiles`);
