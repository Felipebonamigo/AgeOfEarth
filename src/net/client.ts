// Cliente WebSocket do lobby/relay (lado do navegador).
import type { Command, GameConfig } from '../core/types';

export interface RoomSummary { code: string; players: number; host: string; mode: string; mapSize: string; fixedMap: string | null; started?: boolean; spectators?: number }
export interface LobbyPlayer { slot: number; name: string; god: string; team: number; ready: boolean; ping?: number }
export interface LobbyState { host: number; settings: { mapSize: string; ais: number; difficulty: string; seed: number; teams?: string; horde?: boolean; mode?: string; mapType?: string; public?: boolean; fixedMap?: { name?: string; w: number; h: number; starts: number } | null }; players: LobbyPlayer[]; spectators?: { slot: number; name: string }[] }
type Handler = (msg: Record<string, unknown>) => void;

export class NetClient {
  ws: WebSocket | null = null;
  slot = -1; room = ''; isHost = false;
  /** Entrou como espectador (sem vaga de jogador): só assiste. */
  isSpectator = false;
  lobby: LobbyState | null = null;
  /** Latência ida e volta medida pelo relay (ms), -1 até a primeira medição. */
  rtt = -1;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private handlers = new Map<string, Handler[]>();
  on(type: string, h: Handler) { const arr = this.handlers.get(type) ?? []; arr.push(h); this.handlers.set(type, arr); }
  private emit(type: string, msg: Record<string, unknown>) { for (const h of this.handlers.get(type) ?? []) h(msg); }

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try { this.ws = new WebSocket(url); } catch (e) { reject(e); return; }
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('Não foi possível conectar ao servidor.'));
      this.ws.onclose = () => this.emit('close', {});
      this.ws.onmessage = (ev) => {
        let msg: Record<string, unknown>; try { msg = JSON.parse(String(ev.data)); } catch { return; }
        const t = String(msg.t);
        if (t === 'joined') { this.slot = Number(msg.slot); this.room = String(msg.room); this.isHost = !!msg.host; this.isSpectator = !!msg.spectator; }
        if (t === 'lobby') { this.lobby = msg as unknown as LobbyState; this.isHost = this.lobby.host === this.slot; }
        if (t === 'pong') { this.rtt = Math.max(0, Math.round(performance.now() - Number(msg.ts))); this.send({ t: 'player', ping: this.rtt }); }
        this.emit(t, msg);
      };
    });
  }
  send(msg: Record<string, unknown>) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  join(room: string, name: string, god: string, spectate = false) { this.send({ t: 'join', room, name, god, spectate }); this.startPing(); }
  private startPing() { if (this.pingTimer) return; const ping = () => this.send({ t: 'ping', ts: performance.now() }); ping(); this.pingTimer = setInterval(ping, 2000); }
  snapshot(slot: number, data: string, tick: number) { this.send({ t: 'snapshot', slot, data, tick }); }
  chat(text: string) { const s = text.trim().slice(0, 200); if (s) this.send({ t: 'chat', text: s }); }
  kick(slot: number) { this.send({ t: 'kick', slot }); }
  resume() { this.send({ t: 'resume' }); }
  /** Atraso do lockstep (em ticks de 50 ms) a partir da pior latência da sala: metade da ida e volta + folga, entre 2 e 12. */
  static delayFor(pings: number[]): number { const worst = Math.max(0, ...pings.filter((p) => p >= 0)); return Math.max(2, Math.min(12, Math.ceil((worst / 2 + 60) / 50))); }
  /** Pede a lista de salas públicas abertas; a resposta chega no evento 'rooms'. */
  list() { this.send({ t: 'list' }); }
  settings(s: Record<string, unknown>) { this.send({ t: 'settings', settings: s }); }
  player(p: Record<string, unknown>) { this.send({ t: 'player', ...p }); }
  start(config: GameConfig, delay = 4) { this.send({ t: 'start', config, delay }); }
  sendCmds(tick: number, cmds: Command[]) { this.send({ t: 'cmds', tick, cmds }); }
  sendHash(tick: number, hash: number) { this.send({ t: 'hash', tick, hash }); }
  close() { if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; } this.ws?.close(); this.ws = null; }
}
