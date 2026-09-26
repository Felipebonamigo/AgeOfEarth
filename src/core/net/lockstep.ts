// Agendadores de comandos. Local: comandos entram no próximo tick.
// Rede (lockstep): cada jogador envia seus comandos para o tick T+atraso; o tick T só executa quando
// os comandos de todos os jogadores humanos para T chegaram. A simulação é idêntica em todas as máquinas.
import type { Command, GameState } from '../types';
import { tick } from '../sim/game';
import { stateHash } from './hash';
import { diffHashParts, stateHashParts, summarizeState, validHashParts, type DesyncReport, type StateSummary } from './desync';
import { MAX_CMDS_PER_TICK } from '../sim/validate';

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
  /** parts: detalhamento do hash por categoria/jogador (desync.ts), para o relatório de dessincronização dos outros pares. */
  sendHash(tick: number, hash: number, parts?: number[]): void;
}

export class NetworkScheduler implements CommandScheduler {
  readonly local: number;
  private humans: Set<number>;
  private delay: number;
  private transport: NetTransport;
  private outgoing: Command[] = [];
  private inbox = new Map<number, Map<number, Command[]>>();
  private lastSent = -1;
  private hashes = new Map<number, Map<number, { hash: number; parts?: number[] }>>();
  /** Hash local de cada tick múltiplo de 100 ainda não conferido com todos, com o detalhamento e o resumo do estado nesse tick. */
  private localHashes = new Map<number, { hash: number; parts: number[]; summary: StateSummary }>();
  /** Último tick executado (mensagens para ticks já executados nunca serão usadas: descartadas). */
  private executed = -1;
  onDesync: ((tick: number) => void) | null = null;
  desynced = false;
  /**
   * Relatório da primeira dessincronização: tick, hash local e dos outros pares, categorias divergentes por par (mundo,
   * jogador, recursos, unidades, edifícios de cada jogador) e o resumo do estado local nesse tick (desync.ts).
   */
  lastDesync: DesyncReport | null = null;
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

  /**
   * Comandos de um par para o tick t. Anti-trapaça básico (4.5): tick inteiro ainda não executado; lista que não é array vira
   * vazia; de outro par, só comandos (objetos) em nome do próprio jogador, no máximo MAX_CMDS_PER_TICK, e só a PRIMEIRA
   * mensagem de cada (par, tick) vale — uma segunda, diferente, chegaria a um par antes e a outro depois de executar o tick.
   * O resto da validação (forma, dono, alvo, custo…) é de applyCommand, igual em todos os clientes.
   */
  receive(slot: number, t: number, cmds: Command[]): void {
    if (!Number.isSafeInteger(t) || t < 0 || t <= this.executed) return;
    const list: unknown[] = Array.isArray(cmds) ? cmds : [];
    let m = this.inbox.get(t); if (!m) { m = new Map(); this.inbox.set(t, m); }
    if (slot === this.local) { m.set(slot, list as Command[]); return; }
    if (m.has(slot)) return;
    const mine: Command[] = [];
    for (const c of list) {
      if (mine.length >= MAX_CMDS_PER_TICK) break;
      if (typeof c === 'object' && c !== null && (c as { player?: unknown }).player === slot) mine.push(c as Command);
    }
    m.set(slot, mine);
  }
  receiveHash(slot: number, t: number, hash: number, parts?: unknown): void {
    if (!Number.isSafeInteger(t) || t < 0 || !Number.isInteger(hash) || hash < 0 || hash > 0xffffffff) return;
    let m = this.hashes.get(t); if (!m) { m = new Map(); this.hashes.set(t, m); }
    if (m.has(slot)) return;   // primeiro hash de cada par por tick
    m.set(slot, validHashParts(parts) ? { hash, parts } : { hash });
    this.checkHash(t);
  }
  private checkHash(t: number) {
    const mine = this.localHashes.get(t); const others = this.hashes.get(t);
    if (mine === undefined || !others) return;
    if (!this.desynced) {
      const bad = [...others.entries()].filter(([, o]) => o.hash !== mine.hash);
      if (bad.length > 0) {
        this.desynced = true;
        this.lastDesync = {
          tick: t, local: this.local, mine: mine.hash, theirs: [...others.entries()].map(([p, o]) => [p, o.hash] as [number, number]),
          diverged: bad.map(([p, o]) => ({ player: p, categories: diffHashParts(mine.parts, o.parts) })),
          parts: mine.parts, summary: mine.summary,
        };
        this.onDesync?.(t);
      }
    }
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
    this.executed = T;
    if (state.tick % 100 === 0) {
      const h = stateHash(state), parts = stateHashParts(state);
      this.localHashes.set(state.tick, { hash: h, parts, summary: summarizeState(state) });
      // hashes que um par que caiu nunca vai mandar: não guarda mais que ~5 min de conferências pendentes
      for (const k of this.localHashes.keys()) if (k < state.tick - 6000) this.localHashes.delete(k);
      for (const k of this.hashes.keys()) if (k < state.tick - 6000) this.hashes.delete(k);
      if (this.local >= 0) this.transport.sendHash(state.tick, h, parts);
      this.checkHash(state.tick);
    }
    return true;
  }
}
