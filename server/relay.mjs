// Servidor de retransmissão (relay) para multiplayer em lockstep: salas por código, lobby e repasse de comandos.
// Não simula o jogo: só entrega mensagens. Uso: node server/relay.mjs [porta]
import { WebSocketServer } from 'ws';

const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);
const wss = new WebSocketServer({ port, maxPayload: 8 * 1024 * 1024 });   // instantâneo de reconexão chega a ~1,5 MB no fim de partidas grandes; `start` continua limitado a 1 MB abaixo
const MAX_START_BYTES = 1_000_000;
const rooms = new Map(); // code -> { clients: Map<slot, {ws, name, god, team, ready}>, host, settings, started, nextSlot }

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const broadcast = (room, msg, except = null) => { for (const c of room.clients.values()) if (c.ws !== except) send(c.ws, msg); for (const c of room.spectators.values()) if (c.ws !== except) send(c.ws, msg); };
const lobbyState = (room) => ({ t: 'lobby', host: room.host, settings: room.settings, players: [...room.clients.entries()].map(([slot, c]) => ({ slot, name: c.name, god: c.god, team: c.team, ready: c.ready, ping: c.ping ?? -1 })), spectators: [...room.spectators.entries()].map(([slot, c]) => ({ slot, name: c.name })) });

wss.on('connection', (ws) => {
  let room = null, slot = -1;
  ws.on('message', (data) => {
    let msg; try { msg = JSON.parse(String(data)); } catch { return; }
    if (msg.t === 'join') {
      const code = String(msg.room || 'sala').toUpperCase().slice(0, 12);
      let r = rooms.get(code);
      if (!r) { r = { clients: new Map(), host: -1, settings: { mapSize: 'medium', ais: 0, difficulty: 'normal', seed: Math.floor(Math.random() * 1e9) }, started: false, nextSlot: 0, gone: new Map(), config: null, slots: [], delay: 4, spectators: new Map(), nextSpec: 100 }; rooms.set(code, r); }
      const name = String(msg.name || 'Jogador').slice(0, 18);
      if (msg.spectate) {   // espectador: sem vaga de jogador; recebe lobby/start/comandos/hashes e nunca é aguardado
        if (r.clients.size === 0) { rooms.delete(code); return send(ws, { t: 'error', msg: 'Sala não encontrada.' }); }
        room = r; slot = r.nextSpec++;
        r.spectators.set(slot, { ws, name, ping: -1 });
        if (r.started) {
          send(ws, { t: 'joined', slot, room: code, host: false, spectator: true, rejoin: true, config: r.config, slots: r.slots, delay: r.delay, dropped: [...r.gone.keys()] });
          const h = r.clients.get(r.host);
          if (h) send(h.ws, { t: 'snapshotRequest', slot, spectator: true, name });
        } else { send(ws, { t: 'joined', slot, room: code, host: false, spectator: true }); broadcast(r, lobbyState(r)); }
        return;
      }
      if (r.started) {
        // reconexão: jogador com o mesmo nome que caiu durante a partida retoma o próprio lugar
        const goneSlot = [...r.gone.entries()].find(([, n]) => n === name)?.[0];
        if (goneSlot === undefined) return send(ws, { t: 'error', msg: 'A partida nesta sala já começou.' });
        r.gone.delete(goneSlot);
        room = r; slot = goneSlot;
        r.clients.set(slot, { ws, name, god: msg.god || 'zeus', team: slot, ready: true, ping: -1 });
        send(ws, { t: 'joined', slot, room: code, host: false, rejoin: true, config: r.config, slots: r.slots, delay: r.delay, dropped: [...r.gone.keys()] });
        const h = r.clients.get(r.host);
        if (h) send(h.ws, { t: 'snapshotRequest', slot });
        return;
      }
      if (r.clients.size >= 4) return send(ws, { t: 'error', msg: 'Sala cheia (máximo 4 jogadores).' });
      room = r; slot = r.nextSlot++;
      r.clients.set(slot, { ws, name, god: msg.god || 'zeus', team: slot, ready: false, ping: -1 });
      if (r.host === -1) r.host = slot;
      send(ws, { t: 'joined', slot, room: code, host: r.host === slot });
      broadcast(r, lobbyState(r));
      return;
    }
    if (msg.t === 'list') {   // salas públicas abertas (antes de entrar em alguma)
      const open = [...rooms.entries()].filter(([, r]) => r.settings.public !== false && r.clients.size > 0);   // abertas (entrar) e em andamento (assistir)
      return send(ws, { t: 'rooms', rooms: open.map(([code, r]) => ({ code, players: r.clients.size, host: r.clients.get(r.host)?.name ?? '?', mode: r.settings.horde ? 'horde' : (r.settings.mode ?? 'conquest'), mapSize: r.settings.mapSize, fixedMap: r.settings.fixedMap?.name ?? null, started: r.started, spectators: r.spectators.size })) });
    }
    if (!room) return;
    switch (msg.t) {
      case 'settings': if (slot === room.host && msg.settings) {
        const st = { ...msg.settings };
        if (st.fixedMap && typeof st.fixedMap === 'object') st.fixedMap = { name: String(st.fixedMap.name ?? '').slice(0, 40), w: Number(st.fixedMap.w) | 0, h: Number(st.fixedMap.h) | 0, starts: Number(st.fixedMap.starts) | 0, hash: Number(st.fixedMap.hash) >>> 0, ...(st.fixedMap.scenario ? { scenario: String(st.fixedMap.scenario).slice(0, 60) } : {}) };   // só metadados no lobby (scenario = título do cenário embutido); o mapa inteiro vai em `start`
        room.settings = { ...room.settings, ...st }; broadcast(room, lobbyState(room));
      } break;
      case 'player': { const c = room.clients.get(slot) ?? room.spectators.get(slot); if (c) { if (msg.god) c.god = msg.god; if (msg.ready !== undefined) c.ready = !!msg.ready; if (typeof msg.ping === 'number') c.ping = Math.max(0, Math.min(9999, Math.round(msg.ping))); } if (slot === room.host && msg.team !== undefined && room.clients.has(msg.slot)) room.clients.get(msg.slot).team = msg.team; if (!room.started) broadcast(room, lobbyState(room)); break; }
      case 'ping': send(ws, { t: 'pong', ts: msg.ts }); break;
      case 'resume': if (slot === room.host) broadcast(room, { t: 'resume' }); break;   // anfitrião decide seguir sem quem caiu   // medição de latência (ida e volta pelo relay)
      case 'kick': { if (slot !== room.host) break; const c = room.clients.get(msg.slot) ?? room.spectators.get(msg.slot); if (c && msg.slot !== slot) { send(c.ws, { t: 'error', msg: 'Você foi removido da sala pelo anfitrião.' }); c.ws.close(); } break; }
      case 'start': if (slot === room.host && msg.config) { if (JSON.stringify(msg.config).length > MAX_START_BYTES) { send(ws, { t: 'error', msg: 'Configuração da partida grande demais (mapa fixo acima do limite).' }); break; } room.started = true; room.config = msg.config; room.slots = [...room.clients.keys()]; room.delay = Number(msg.delay) || 4; broadcast(room, { t: 'start', config: msg.config, slots: room.slots, delay: room.delay }); } break;
      case 'snapshot': { if (slot !== room.host) break; const c = room.clients.get(msg.slot) ?? room.spectators.get(msg.slot); if (c) send(c.ws, { t: 'snapshot', data: msg.data, tick: msg.tick }); if (room.clients.has(msg.slot)) broadcast(room, { t: 'rejoined', slot: msg.slot, tick: msg.tick }, c ? c.ws : null); break; }
      case 'cmds': if (room.clients.has(slot)) broadcast(room, { t: 'cmds', slot, tick: msg.tick, cmds: msg.cmds ?? [] }, ws); break;   // espectadores não emitem comandos
      case 'hash': if (room.clients.has(slot)) broadcast(room, { t: 'hash', slot, tick: msg.tick, hash: msg.hash }, ws); break;
      case 'chat': { const c = room.clients.get(slot) ?? room.spectators.get(slot); broadcast(room, { t: 'chat', slot, name: c ? c.name : '?', text: String(msg.text ?? '').slice(0, 200) }); break; }
    }
  });
  ws.on('close', () => {
    if (!room) return;
    if (room.spectators.has(slot)) { room.spectators.delete(slot); if (!room.started) broadcast(room, lobbyState(room)); return; }
    const gone = room.clients.get(slot);
    room.clients.delete(slot);
    if (room.started && gone) room.gone.set(slot, gone.name);   // pode reconectar com o mesmo nome
    if (room.clients.size === 0) { for (const s of room.spectators.values()) { send(s.ws, { t: 'error', msg: 'A sala foi encerrada.' }); s.ws.close(); } for (const [code, r] of rooms) if (r === room) rooms.delete(code); return; }
    if (room.host === slot) { room.host = [...room.clients.keys()][0]; broadcast(room, { t: 'host', slot: room.host }); }   // novo anfitrião avisado antes do 'left' (pode seguir sem quem caiu)
    broadcast(room, { t: 'left', slot });
    if (!room.started) broadcast(room, lobbyState(room));
  });
});
console.log(`Relay do Age of Earth ouvindo em ws://0.0.0.0:${port}`);
