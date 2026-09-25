// Agendadores de comandos. Local: comandos entram no próximo tick.
// Rede (lockstep): cada jogador envia seus comandos para o tick T+atraso; o tick T só executa quando
// os comandos de todos os jogadores humanos para T chegaram. A simulação é idêntica em todas as máquinas.
import type { Command, GameState } from '../types';
import { tick } from '../sim/game';
import { stateHash } from './hash';

export interface CommandScheduler {
  issue(cmd: Command): void;
  /** Tenta avançar um tick. Retorna false se está aguardando a rede. */
  step(state: GameState): boolean;
}

export class LocalScheduler implements CommandScheduler {
  private pending: Command[] = [];
  issue(cmd: Command): void { this.pending.push(cmd); }
  step(state: GameState): boolean {
    const cmds = this.pending; this.pending = [];
    tick(state, cmds);
    return true;
  }
}

export interface NetTransport {
  sendCmds(tick: number, cmds: Command[]): void;
  sendHash(tick: number, hash: number): void;
}

export class NetworkScheduler implements CommandScheduler {
  readonly local: number;
  private humans: Set<number>;
  private delay: number;
  private transport: NetTransport;
  private outgoing: Command[] = [];
  private inbox = new Map<number, Map<number, Command[]>>();
  private lastSent = -1;
  private hashes = new Map<number, Map<number, number>>();
  private localHashes = new Map<number, number>();
  onDesync: ((tick: number) => void) | null = null;
  desynced = false;
  waiting = 0;   // ticks consecutivos aguardando (para a interface mostrar "aguardando jogadores")

  constructor(local: number, humans: number[], delayTicks: number, transport: NetTransport) {
    this.local = local; this.humans = new Set(humans); this.delay = Math.max(1, delayTicks); this.transport = transport;
  }
  issue(cmd: Command): void { this.outgoing.push(cmd); }
  /** Jogador saiu: seus comandos passam a ser considerados vazios. */
  dropPlayer(slot: number): void { this.humans.delete(slot); }

  receive(slot: number, t: number, cmds: Command[]): void {
    let m = this.inbox.get(t); if (!m) { m = new Map(); this.inbox.set(t, m); }
    m.set(slot, cmds);
  }
  receiveHash(slot: number, t: number, hash: number): void {
    let m = this.hashes.get(t); if (!m) { m = new Map(); this.hashes.set(t, m); }
    m.set(slot, hash);
    this.checkHash(t);
  }
  private checkHash(t: number) {
    const mine = this.localHashes.get(t); const others = this.hashes.get(t);
    if (mine === undefined || !others) return;
    for (const [slot, h] of others) if (h !== mine && !this.desynced) { this.desynced = true; this.onDesync?.(t); void slot; }
    if (others.size >= this.humans.size - 1) { this.hashes.delete(t); this.localHashes.delete(t); }
  }

  step(state: GameState): boolean {
    const T = state.tick;
    // envia comandos locais para o tick futuro (uma vez por tick)
    const target = T + this.delay;
    if (this.lastSent < target) {
      for (let t = Math.max(this.lastSent + 1, 0); t <= target; t++) {
        const cmds = t === target ? this.outgoing : [];
        this.receive(this.local, t, cmds);
        this.transport.sendCmds(t, cmds);
      }
      this.outgoing = [];
      this.lastSent = target;
    }
    const m = this.inbox.get(T);
    if (T >= this.delay) {
      for (const p of this.humans) if (!m || !m.has(p)) { this.waiting++; return false; }
    }
    this.waiting = 0;
    const cmds: Command[] = [];
    if (m) for (const p of [...m.keys()].sort((a, b) => a - b)) cmds.push(...(m.get(p) ?? []));
    this.inbox.delete(T);
    tick(state, cmds);
    if (state.tick % 100 === 0) { const h = stateHash(state); this.localHashes.set(state.tick, h); this.transport.sendHash(state.tick, h); this.checkHash(state.tick); }
    return true;
  }
}
