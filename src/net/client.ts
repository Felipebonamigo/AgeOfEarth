// Cliente WebSocket do lobby/relay (lado do navegador).
import type { Command, GameConfig } from '../core/types';

export interface LobbyPlayer { slot: number; name: string; god: string; team: number; ready: boolean }
export interface LobbyState { host: number; settings: { mapSize: string; ais: number; difficulty: string; seed: number; teams?: string }; players: LobbyPlayer[] }
type Handler = (msg: Record<string, unknown>) => void;

export class NetClient {
  ws: WebSocket | null = null;
  slot = -1; room = ''; isHost = false;
  lobby: LobbyState | null = null;
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
        if (t === 'joined') { this.slot = Number(msg.slot); this.room = String(msg.room); this.isHost = !!msg.host; }
        if (t === 'lobby') { this.lobby = msg as unknown as LobbyState; this.isHost = this.lobby.host === this.slot; }
        this.emit(t, msg);
      };
    });
  }
  send(msg: Record<string, unknown>) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  join(room: string, name: string, god: string) { this.send({ t: 'join', room, name, god }); }
  settings(s: Record<string, unknown>) { this.send({ t: 'settings', settings: s }); }
  player(p: Record<string, unknown>) { this.send({ t: 'player', ...p }); }
  start(config: GameConfig) { this.send({ t: 'start', config }); }
  sendCmds(tick: number, cmds: Command[]) { this.send({ t: 'cmds', tick, cmds }); }
  sendHash(tick: number, hash: number) { this.send({ t: 'hash', tick, hash }); }
  close() { this.ws?.close(); this.ws = null; }
}
