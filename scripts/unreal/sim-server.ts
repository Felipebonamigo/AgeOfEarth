// Servidor da ponte simulação ↔ Unreal (docs/UNREAL.md): roda a partida (jogador 0 = o cliente, o resto IA) e fala com o
// cliente Unreal por WebSocket em localhost. O protocolo está em scripts/unreal/protocol.ts.
// Uso: npx tsx scripts/unreal/sim-server.ts [--port 8790] [--seed 42] [--size small|medium|large] [--map arquivo.map.json]
//        [--ais 1] [--god zeus] [--difficulty normal] [--reveal] [--speed 1] [--every 2] [--age 0] [--paused]
// (npm run unreal:sim -- --seed 7). Vários clientes se conectam e veem/comandam o mesmo jogador 0.
import fs from 'node:fs';
import { WebSocketServer, type WebSocket } from 'ws';
import { createGame, tick } from '../../src/core/sim/game';
import { TICK_RATE } from '../../src/core/constants';
import { migrateMap, validateMap, type FixedMapData } from '../../src/core/map/fixed';
import type { Command, GameConfig, GameState } from '../../src/core/types';
import { BridgeSession, buildHello, parseClientMessage, type BridgeOptions } from './protocol';

export interface ServerOptions {
  port: number; seed: number; mapSize: 'small' | 'medium' | 'large'; mapFile?: string; ais: number; god: string; difficulty: 'easy' | 'normal' | 'hard' | 'expert';
  reveal: boolean; speed: number; every: number; age: number; paused: boolean;
}

export function parseArgs(argv: string[]): ServerOptions {
  const o: ServerOptions = { port: 8790, seed: 42, mapSize: 'medium', ais: 1, god: 'zeus', difficulty: 'normal', reveal: false, speed: 1, every: 2, age: 0, paused: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--port') o.port = Number(next());
    else if (a === '--seed') o.seed = Number(next());
    else if (a === '--size') o.mapSize = next() as ServerOptions['mapSize'];
    else if (a === '--map') o.mapFile = next();
    else if (a === '--ais') o.ais = Math.max(1, Math.min(3, Number(next())));
    else if (a === '--god') o.god = next();
    else if (a === '--difficulty') o.difficulty = next() as ServerOptions['difficulty'];
    else if (a === '--reveal') o.reveal = true;
    else if (a === '--speed') o.speed = Number(next());
    else if (a === '--every') o.every = Math.max(1, Number(next()));
    else if (a === '--age') o.age = Math.max(0, Number(next()));
    else if (a === '--paused') o.paused = true;
    else { console.error(`opção desconhecida: ${a}`); process.exit(2); }
  }
  return o;
}

const GODS = ['zeus', 'poseidon', 'hades'];

export function makeConfig(o: ServerOptions): GameConfig {
  let map: FixedMapData | undefined;
  if (o.mapFile) {
    map = migrateMap(JSON.parse(fs.readFileSync(o.mapFile, 'utf8')));
    const errors = validateMap(map, { players: Math.min(map.starts.length, o.ais + 1) }).filter((i) => i.level === 'error');
    if (errors.length) throw new Error(`mapa inválido: ${errors.map((e) => e.code).join(', ')}`);
  }
  const n = map ? Math.min(map.starts.length, o.ais + 1) : o.ais + 1;
  const players = Array.from({ length: n }, (_, i) => i === 0
    ? { name: 'Jogador', god: o.god, isAI: false, difficulty: o.difficulty as GameConfig['players'][number]['difficulty'] }
    : { name: `IA ${i}`, god: GODS[(GODS.indexOf(o.god) + i) % GODS.length], isAI: true, difficulty: o.difficulty as GameConfig['players'][number]['difficulty'] });
  return { seed: o.seed, mapSize: o.mapSize, players, map, startingAge: o.age || undefined };
}

/** Servidor reutilizável (os testes sobem um em porta 0). `step()` avança um tick; `start()` liga o relógio. */
export function createBridgeServer(o: ServerOptions) {
  const state: GameState = createGame(makeConfig(o));
  const wss = new WebSocketServer({ port: o.port, host: '127.0.0.1', maxPayload: 256 * 1024 });
  const opts: BridgeOptions = { player: 0, reveal: o.reveal, stateEvery: o.every };
  const clients = new Map<WebSocket, BridgeSession>();
  let queue: Command[] = [];
  let paused = o.paused, speed = o.speed;
  let timer: ReturnType<typeof setInterval> | null = null;

  const send = (ws: WebSocket, msg: object) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };

  wss.on('connection', (ws) => {
    const session = new BridgeSession(opts);
    clients.set(ws, session);
    send(ws, buildHello(state, opts));
    for (const m of session.flush(state)) send(ws, m);   // primeiro state (e névoa) já com o estado atual
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

  /** Um tick da simulação com os comandos que chegaram; envia o que for devido a cada cliente. */
  function step(): void {
    const cmds = queue; queue = [];
    tick(state, cmds);
    for (const [ws, s] of clients) { s.afterTick(state); if (s.due(state) || state.gameOver) for (const m of s.flush(state)) send(ws, m); }
  }

  function start(): void {
    let acc = 0, last = Date.now();
    timer = setInterval(() => {
      const now = Date.now(); acc += (now - last) * speed; last = now;
      if (paused) { acc = 0; return; }
      const dtMs = 1000 / TICK_RATE;
      let n = 0;
      while (acc >= dtMs && n < 8) { step(); acc -= dtMs; n++; }   // no máximo 8 ticks por volta: não corre atrás de atraso
      if (acc > dtMs * 8) acc = 0;
    }, 10);
  }
  function close(): Promise<void> {
    if (timer) clearInterval(timer);
    for (const ws of clients.keys()) ws.terminate();
    return new Promise((res) => wss.close(() => res()));
  }
  const listening = new Promise<void>((res) => { if (wss.address()) res(); else wss.once('listening', () => res()); });
  return { state, wss, step, start, close, listening, get port() { return (wss.address() as { port: number }).port; }, setPaused: (p: boolean) => { paused = p; } };
}

// execução direta: `npx tsx scripts/unreal/sim-server.ts`
if (process.argv[1] && /sim-server\.ts$/.test(process.argv[1])) {
  const o = parseArgs(process.argv.slice(2));
  const srv = createBridgeServer(o);
  await srv.listening;
  srv.start();
  console.log(`Ponte Unreal: ws://127.0.0.1:${srv.port} · semente ${o.seed} · ${srv.state.players.length} jogadores · ${srv.state.map.w}×${srv.state.map.h} tiles${o.reveal ? ' · mapa revelado' : ''}${o.paused ? ' · pausado' : ''}`);
  process.on('SIGINT', () => { srv.close().then(() => process.exit(0)); });
}
