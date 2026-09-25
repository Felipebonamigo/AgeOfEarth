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

export type ReplayFrame = [number, Command[]];

export class LocalScheduler implements CommandScheduler {
  private pending: Command[] = [];
  /** Gravação de replay: só os ticks com comandos. */
  frames: ReplayFrame[] = [];
  issue(cmd: Command): void { this.pending.push(cmd); }
  step(state: GameState): boolean {
    const cmds = this.pending; this.pending = [];
    if (cmds.length > 0) this.frames.push([state.tick, cmds]);
    tick(state, cmds);
    return true;
  }
}

/** Reproduz comandos gravados; ignora comandos novos (modo espectador). */
export class ReplayScheduler implements CommandScheduler {
  private i = 0;
  constructor(private frames: ReplayFrame[]) {}
  issue(): void { /* espectador */ }
  get finished() { return this.i >= this.frames.length; }
  step(state: GameState): boolean {
    const cmds: Command[] = [];
    while (this.i < this.frames.length && this.frames[this.i][0] === state.tick) { cmds.push(...this.frames[this.i][1]); this.i++; }
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
  /** Detalhes da primeira dessincronização (para o relatório): tick, hash local e hashes dos outros pares. */
  lastDesync: { tick: number; mine: number; theirs: [number, number][] } | null = null;
  waiting = 0;   // ticks consecutivos aguardando (para a interface mostrar "aguardando jogadores")
  /** Jogador reconectado: seus comandos só são exigidos a partir do tick guardado (todos os pares usam o mesmo valor). */
  private rejoinAt = new Map<number, number>();
  get delayTicks() { return this.delay; }
  /** Espectador (local < 0): recebe comandos e hashes de todos, nunca envia nem é aguardado. */
  get spectator() { return this.local < 0; }

  constructor(local: number, humans: number[], delayTicks: number, transport: NetTransport) {
    this.local = local; this.humans = new Set(humans); this.delay = Math.max(1, delayTicks); this.transport = transport;
  }
  issue(cmd: Command): void { if (this.local < 0) return; this.outgoing.push(cmd); }
  /** Jogador saiu: seus comandos passam a ser considerados vazios. */
  dropPlayer(slot: number): void { this.humans.delete(slot); this.rejoinAt.delete(slot); }
  /** Jogador voltou: volta a ser exigido a partir de fromTick (exclusivo). Folga para a mensagem chegar a todos antes desse tick. */
  addPlayer(slot: number, fromTick: number): void { this.humans.add(slot); this.rejoinAt.set(slot, fromTick); }
  /** Tick a partir do qual um jogador reconectado no instante snapshotTick volta a mandar comandos. */
  static resumeTick(snapshotTick: number, delay: number): number { return snapshotTick + delay + 20; }
  /** Instantâneo para quem reconecta: comandos já recebidos para o tick atual e os futuros (>= afterTick). */
  exportPending(afterTick: number): [number, [number, Command[]][]][] {
    const out: [number, [number, Command[]][]][] = [];
    for (const [t, m] of this.inbox) if (t >= afterTick) out.push([t, [...m.entries()]]);   // inclui o tick atual (ainda não executado)
    return out.sort((a, b) => a[0] - b[0]);
  }
  /** Quem reconecta: adota o inbox do anfitrião e passa a enviar comandos a partir de resumeTick + 1.
   *  Comandos que já chegaram pelo relay para ticks >= snapshotTick são mantidos (podem ter passado na frente do instantâneo). */
  importPending(pending: [number, [number, Command[]][]][], resumeTick: number, snapshotTick = -1): void {
    for (const t of [...this.inbox.keys()]) if (t < snapshotTick) this.inbox.delete(t);
    for (const [t, entries] of pending) { let m = this.inbox.get(t); if (!m) { m = new Map(); this.inbox.set(t, m); } for (const [slot, cmds] of entries) m.set(slot, cmds); }
    this.lastSent = resumeTick;
    this.outgoing = [];
    this.rejoinAt.set(this.local, resumeTick);
  }

  receive(slot: number, t: number, cmds: Command[]): void {
    let m = this.inbox.get(t); if (!m) { m = new Map(); this.inbox.set(t, m); }
    // Anti-trapaça básico: um par só pode emitir comandos em nome do próprio jogador
    m.set(slot, slot === this.local ? cmds : cmds.filter((c) => c.player === slot));
  }
  receiveHash(slot: number, t: number, hash: number): void {
    let m = this.hashes.get(t); if (!m) { m = new Map(); this.hashes.set(t, m); }
    m.set(slot, hash);
    this.checkHash(t);
  }
  private checkHash(t: number) {
    const mine = this.localHashes.get(t); const others = this.hashes.get(t);
    if (mine === undefined || !others) return;
    for (const [, h] of others) if (h !== mine && !this.desynced) { this.desynced = true; this.lastDesync = { tick: t, mine, theirs: [...others.entries()] }; this.onDesync?.(t); }
    if (others.size >= this.humans.size - (this.local >= 0 ? 1 : 0)) { this.hashes.delete(t); this.localHashes.delete(t); }
  }

  step(state: GameState): boolean {
    const T = state.tick;
    // envia comandos locais para o tick futuro (uma vez por tick)
    const target = T + this.delay;
    if (this.local >= 0 && this.lastSent < target) {
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
      for (const p of this.humans) { if (T <= (this.rejoinAt.get(p) ?? -1)) continue; if (!m || !m.has(p)) { this.waiting++; return false; } }
    }
    this.waiting = 0;
    const cmds: Command[] = [];
    if (m) for (const p of [...m.keys()].sort((a, b) => a - b)) cmds.push(...(m.get(p) ?? []));
    this.inbox.delete(T);
    tick(state, cmds);
    if (state.tick % 100 === 0) { const h = stateHash(state); this.localHashes.set(state.tick, h); if (this.local >= 0) this.transport.sendHash(state.tick, h); this.checkHash(state.tick); }
    return true;
  }
}
