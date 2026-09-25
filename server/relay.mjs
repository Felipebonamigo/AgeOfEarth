// Servidor de retransmissão (relay) para multiplayer em lockstep: salas por código, lobby e repasse de comandos.
// Não simula o jogo: só entrega mensagens. Uso: node server/relay.mjs [porta]
import { WebSocketServer } from 'ws';

const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);
const wss = new WebSocketServer({ port });
const rooms = new Map(); // code -> { clients: Map<slot, {ws, name, god, team, ready}>, host, settings, started, nextSlot }

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const broadcast = (room, msg, except = null) => { for (const c of room.clients.values()) if (c.ws !== except) send(c.ws, msg); };
const lobbyState = (room) => ({ t: 'lobby', host: room.host, settings: room.settings, players: [...room.clients.entries()].map(([slot, c]) => ({ slot, name: c.name, god: c.god, team: c.team, ready: c.ready })) });

wss.on('connection', (ws) => {
  let room = null, slot = -1;
  ws.on('message', (data) => {
    let msg; try { msg = JSON.parse(String(data)); } catch { return; }
    if (msg.t === 'join') {
      const code = String(msg.room || 'sala').toUpperCase().slice(0, 12);
      let r = rooms.get(code);
      if (!r) { r = { clients: new Map(), host: -1, settings: { mapSize: 'medium', ais: 0, difficulty: 'normal', seed: Math.floor(Math.random() * 1e9) }, started: false, nextSlot: 0 }; rooms.set(code, r); }
      if (r.started) return send(ws, { t: 'error', msg: 'A partida nesta sala já começou.' });
      if (r.clients.size >= 4) return send(ws, { t: 'error', msg: 'Sala cheia (máximo 4 jogadores).' });
      room = r; slot = r.nextSlot++;
      r.clients.set(slot, { ws, name: String(msg.name || 'Jogador').slice(0, 18), god: msg.god || 'zeus', team: slot, ready: false });
      if (r.host === -1) r.host = slot;
      send(ws, { t: 'joined', slot, room: code, host: r.host === slot });
      broadcast(r, lobbyState(r));
      return;
    }
    if (!room) return;
    switch (msg.t) {
      case 'settings': if (slot === room.host && msg.settings) { room.settings = { ...room.settings, ...msg.settings }; broadcast(room, lobbyState(room)); } break;
      case 'player': { const c = room.clients.get(slot); if (c) { if (msg.god) c.god = msg.god; if (msg.ready !== undefined) c.ready = !!msg.ready; } if (slot === room.host && msg.team !== undefined && room.clients.has(msg.slot)) room.clients.get(msg.slot).team = msg.team; broadcast(room, lobbyState(room)); break; }
      case 'start': if (slot === room.host && msg.config) { room.started = true; broadcast(room, { t: 'start', config: msg.config, slots: [...room.clients.keys()] }); } break;
      case 'cmds': broadcast(room, { t: 'cmds', slot, tick: msg.tick, cmds: msg.cmds ?? [] }, ws); break;
      case 'hash': broadcast(room, { t: 'hash', slot, tick: msg.tick, hash: msg.hash }, ws); break;
      case 'chat': broadcast(room, { t: 'chat', slot, text: String(msg.text ?? '').slice(0, 200) }); break;
    }
  });
  ws.on('close', () => {
    if (!room) return;
    room.clients.delete(slot);
    if (room.clients.size === 0) { for (const [code, r] of rooms) if (r === room) rooms.delete(code); return; }
    if (room.host === slot) room.host = [...room.clients.keys()][0];
    broadcast(room, { t: 'left', slot });
    if (!room.started) broadcast(room, lobbyState(room));
  });
});
console.log(`Relay do Age of Earth ouvindo em ws://0.0.0.0:${port}`);
