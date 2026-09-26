// Servidor de retransmissão (relay) para multiplayer em lockstep: salas por código, lobby e repasse de comandos.
// Não simula o jogo: só entrega mensagens. Uso: node server/relay.mjs [porta] [--no-rate-limit]
//   --no-rate-limit (ou RELAY_NO_RATE_LIMIT=1): sem limite de taxa por conexão — só para o teste de carga acelerado
//   (scripts/loadtest.ts sem --realtime), em que os bots mandam centenas de ticks por segundo.
// Anti-trapaça básico (ROADMAP 4.5): o relay conhece a vaga de cada conexão e só repassa comandos em nome do jogador dela;
// limita tamanho e taxa de mensagens por conexão; JSON malformado recebe um erro e a sala segue. A validação do conteúdo dos
// comandos é de cada cliente (sanitizeCommand/applyCommand, iguais em todos).
import { WebSocketServer } from 'ws';

const argv = process.argv.slice(2);
const port = Number(argv.find((a) => !a.startsWith('--')) ?? process.env.PORT ?? 8787);
const RATE_LIMIT = !(argv.includes('--no-rate-limit') || process.env.RELAY_NO_RATE_LIMIT === '1');
const wss = new WebSocketServer({ port, maxPayload: 8 * 1024 * 1024 });   // instantâneo de reconexão chega a ~1,5 MB no fim de partidas grandes; `start` continua limitado a 1 MB abaixo
const MAX_START_BYTES = 1_000_000;
// Limites por conexão (com folga para o jogo normal: 20 mensagens `cmds` por segundo de ~0,1 KB, um `hash` a cada 5 s, ping a cada 2 s)
const MAX_CLIENT_MSG_BYTES = 512 * 1024;   // quem não é anfitrião nunca manda mais que isso (uma muralha de 500 tiles com 50 construtores ~ 150 KB)
const MAX_CMDS_PER_TICK = 1024;            // = MAX_CMDS_PER_TICK em src/core/sim/validate.ts (muralha arrastada = 1 comando por tile no mesmo tick)
const MAX_HASH_PARTS = 64;                 // = MAX_HASH_PARTS em src/core/net/desync.ts
const MSG_BURST = 400, MSG_RATE = 100;     // mensagens: balde de 400, repõe 100/s (5× o ritmo do lockstep)
const BYTE_BURST = 4 * 1024 * 1024, BYTE_RATE = 1024 * 1024;   // bytes: balde de 4 MB, repõe 1 MB/s (o jogo normal manda ~1 KB/s)
const rooms = new Map(); // code -> { clients: Map<slot, {ws, name, god, team, ready}>, host, settings, started, nextSlot }

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const broadcast = (room, msg, except = null) => { for (const c of room.clients.values()) if (c.ws !== except) send(c.ws, msg); for (const c of room.spectators.values()) if (c.ws !== except) send(c.ws, msg); };
// Versão da simulação (SIM_VERSION em src/core/constants.ts) de quem entra: clientes de versões diferentes dessincronizariam na
// 1ª troca de hash, então a sala fica com a versão de quem a criou e recusa as outras com uma mensagem clara. Cliente sem o
// campo = anterior à v2 (conta como 1).
const simOf = (msg) => (Number.isInteger(msg.sim) && msg.sim > 0 ? msg.sim : 1);
const simMismatch = (r, sim) => ({ t: 'error', code: 'simVersion', room: r.sim, yours: sim, msg: `Versão do jogo diferente da sala: esta sala usa a simulação v${r.sim} e o seu jogo a v${sim}. Os dois precisam da mesma versão do jogo (atualize quem estiver na versão antiga).` });
/** Balde de fichas por conexão: devolve false quando o custo não cabe (mensagens ou bytes acima do ritmo permitido). */
const makeBucket = (burst, rate) => { let tokens = burst, last = Date.now(); return (cost) => { const now = Date.now(); tokens = Math.min(burst, tokens + (now - last) / 1000 * rate); last = now; if (tokens < cost) return false; tokens -= cost; return true; }; };
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTick = (v) => Number.isSafeInteger(v) && v >= 0;
const isU32 = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
const godOf = (msg) => (typeof msg.god === 'string' && msg.god ? msg.god.slice(0, 24) : 'zeus');
const lobbyState = (room) => ({ t: 'lobby', host: room.host, settings: room.settings, players: [...room.clients.entries()].map(([slot, c]) => ({ slot, name: c.name, god: c.god, team: c.team, ready: c.ready, ping: c.ping ?? -1 })), spectators: [...room.spectators.entries()].map(([slot, c]) => ({ slot, name: c.name })) });

wss.on('connection', (ws) => {
  let room = null, slot = -1;
  let lastCmdTick = -1;   // ticks de `cmds` desta conexão são estritamente crescentes (o cliente manda cada tick uma vez, em ordem)
  const msgBucket = makeBucket(MSG_BURST, MSG_RATE), byteBucket = makeBucket(BYTE_BURST, BYTE_RATE);
  const isHost = () => !!room && slot === room.host && room.clients.has(slot);
  let kicked = false;
  ws.on('message', (data) => {
    if (kicked) return;
    const bytes = data.length ?? Buffer.byteLength(String(data));
    if (RATE_LIMIT && (!msgBucket(1) || (!isHost() && !byteBucket(bytes)))) {
      // ritmo muito acima do jogo normal: derruba só esta conexão (os outros veem 'left' e seguem ou aguardam a reconexão)
      kicked = true;
      send(ws, { t: 'error', code: 'rateLimit', msg: 'Mensagens demais: conexão encerrada pelo servidor.' });
      ws.close(4008, 'rateLimit');
      return;
    }
    // Tamanho antes de interpretar: só o anfitrião manda mensagens grandes (`start` com mapa fixo, instantâneo de reconexão)
    if (bytes > MAX_CLIENT_MSG_BYTES && !isHost()) return send(ws, { t: 'error', code: 'tooBig', msg: 'Mensagem grande demais.' });
    let msg; try { msg = JSON.parse(String(data)); } catch { return send(ws, { t: 'error', code: 'badMessage', msg: 'Mensagem malformada.' }); }
    if (!isObj(msg) || typeof msg.t !== 'string') return send(ws, { t: 'error', code: 'badMessage', msg: 'Mensagem malformada.' });
    try { handle(msg); } catch (e) { console.error('relay: erro ao tratar', msg.t, e); send(ws, { t: 'error', code: 'badMessage', msg: 'Mensagem inválida.' }); }
  });
  const handle = (msg) => {
    if (msg.t === 'join') {
      if (room) return send(ws, { t: 'error', code: 'badMessage', msg: 'Esta conexão já está numa sala.' });   // uma vaga por conexão
      const code = String(msg.room || 'sala').toUpperCase().slice(0, 12);
      let r = rooms.get(code);
      const sim = simOf(msg);
      if (!r) {
        if (msg.spectate) return send(ws, { t: 'error', msg: 'Sala não encontrada.' });
        r = { clients: new Map(), host: -1, settings: { mapSize: 'medium', ais: 0, difficulty: 'normal', seed: Math.floor(Math.random() * 1e9) }, started: false, nextSlot: 0, gone: new Map(), config: null, slots: [], delay: 4, spectators: new Map(), nextSpec: 100, sim };
        rooms.set(code, r);
      }
      if (r.sim !== sim) return send(ws, simMismatch(r, sim));   // jogador, espectador ou reconexão: a mesma regra
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
        r.clients.set(slot, { ws, name, god: godOf(msg), team: slot, ready: true, ping: -1 });
        send(ws, { t: 'joined', slot, room: code, host: false, rejoin: true, config: r.config, slots: r.slots, delay: r.delay, dropped: [...r.gone.keys()] });
        const h = r.clients.get(r.host);
        if (h) send(h.ws, { t: 'snapshotRequest', slot });
        return;
      }
      if (r.clients.size >= 4) return send(ws, { t: 'error', msg: 'Sala cheia (máximo 4 jogadores).' });
      room = r; slot = r.nextSlot++;
      r.clients.set(slot, { ws, name, god: godOf(msg), team: slot, ready: false, ping: -1 });
      if (r.host === -1) r.host = slot;
      send(ws, { t: 'joined', slot, room: code, host: r.host === slot });
      broadcast(r, lobbyState(r));
      return;
    }
    if (msg.t === 'list') {   // salas públicas abertas (antes de entrar em alguma)
      const open = [...rooms.entries()].filter(([, r]) => r.settings.public !== false && r.clients.size > 0);   // abertas (entrar) e em andamento (assistir)
      return send(ws, { t: 'rooms', rooms: open.map(([code, r]) => ({ code, players: r.clients.size, host: r.clients.get(r.host)?.name ?? '?', mode: r.settings.horde ? 'horde' : (r.settings.mode ?? 'conquest'), mapSize: r.settings.mapSize, fixedMap: r.settings.fixedMap?.name ?? null, started: r.started, spectators: r.spectators.size, sim: r.sim })) });
    }
    if (!room) return;
    switch (msg.t) {
      case 'settings': if (slot === room.host && isObj(msg.settings)) {
        const st = { ...msg.settings };
        if (st.fixedMap && typeof st.fixedMap === 'object') st.fixedMap = { name: String(st.fixedMap.name ?? '').slice(0, 40), w: Number(st.fixedMap.w) | 0, h: Number(st.fixedMap.h) | 0, starts: Number(st.fixedMap.starts) | 0, hash: Number(st.fixedMap.hash) >>> 0, ...(st.fixedMap.scenario ? { scenario: String(st.fixedMap.scenario).slice(0, 60) } : {}) };   // só metadados no lobby (scenario = título do cenário embutido); o mapa inteiro vai em `start`
        room.settings = { ...room.settings, ...st }; broadcast(room, lobbyState(room));
      } break;
      case 'player': { const c = room.clients.get(slot) ?? room.spectators.get(slot); if (c) { if (typeof msg.god === 'string') c.god = godOf(msg); if (msg.ready !== undefined) c.ready = !!msg.ready; if (typeof msg.ping === 'number' && Number.isFinite(msg.ping)) c.ping = Math.max(0, Math.min(9999, Math.round(msg.ping))); } if (slot === room.host && Number.isInteger(msg.team) && msg.team >= 0 && msg.team < 16 && room.clients.has(msg.slot)) room.clients.get(msg.slot).team = msg.team; if (!room.started) broadcast(room, lobbyState(room)); break; }
      case 'ping': send(ws, { t: 'pong', ts: msg.ts }); break;
      case 'resume': if (slot === room.host) broadcast(room, { t: 'resume' }); break;   // anfitrião decide seguir sem quem caiu   // medição de latência (ida e volta pelo relay)
      case 'kick': { if (slot !== room.host) break; const c = room.clients.get(msg.slot) ?? room.spectators.get(msg.slot); if (c && msg.slot !== slot) { send(c.ws, { t: 'error', msg: 'Você foi removido da sala pelo anfitrião.' }); c.ws.close(); } break; }
      case 'start': if (slot === room.host && msg.config) { if (JSON.stringify(msg.config).length > MAX_START_BYTES) { send(ws, { t: 'error', msg: 'Configuração da partida grande demais (mapa fixo acima do limite).' }); break; } room.started = true; room.config = msg.config; room.slots = [...room.clients.keys()]; room.delay = Number(msg.delay) || 4; broadcast(room, { t: 'start', config: msg.config, slots: room.slots, delay: room.delay }); } break;
      case 'snapshot': { if (slot !== room.host) break; const c = room.clients.get(msg.slot) ?? room.spectators.get(msg.slot); if (c) send(c.ws, { t: 'snapshot', data: msg.data, tick: msg.tick }); if (room.clients.has(msg.slot)) broadcast(room, { t: 'rejoined', slot: msg.slot, tick: msg.tick }, c ? c.ws : null); break; }
      case 'cmds': {
        // só jogadores (não espectadores), com a partida começada; tick inteiro e maior que o último desta conexão
        if (!room.started || !room.clients.has(slot) || !isTick(msg.tick) || msg.tick <= lastCmdTick) break;
        lastCmdTick = msg.tick;
        // o jogador desta vaga (índice em room.slots) é o único em nome de quem ela comanda: o resto sai da lista, que é
        // repassada mesmo vazia (o tick precisa chegar a todos, senão o lockstep espera para sempre)
        const me = room.slots.indexOf(slot);
        const list = Array.isArray(msg.cmds) ? msg.cmds : [];
        const cmds = [];
        for (const c of list) { if (cmds.length >= MAX_CMDS_PER_TICK) break; if (isObj(c) && c.player === me) cmds.push(c); }
        broadcast(room, { t: 'cmds', slot, tick: msg.tick, cmds }, ws);
        break;
      }
      case 'hash': {
        if (!room.started || !room.clients.has(slot) || !isTick(msg.tick) || !isU32(msg.hash)) break;
        const out = { t: 'hash', slot, tick: msg.tick, hash: msg.hash };
        if (Array.isArray(msg.parts) && msg.parts.length <= MAX_HASH_PARTS && msg.parts.every(isU32)) out.parts = msg.parts;   // detalhamento para o relatório de dessincronização
        broadcast(room, out, ws);
        break;
      }
      case 'chat': { const c = room.clients.get(slot) ?? room.spectators.get(slot); broadcast(room, { t: 'chat', slot, name: c ? c.name : '?', text: String(msg.text ?? '').slice(0, 200) }); break; }
    }
  };
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
