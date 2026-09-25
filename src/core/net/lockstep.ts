// Agendador de comandos em lockstep. No modo local, comandos entram no próximo tick.
// No modo em rede, comandos são atrasados por N ticks e mesclados com os dos outros jogadores
// (mesma simulação determinística em todas as máquinas; só comandos trafegam).
import type { Command, GameState } from '../types';
import { tick } from '../sim/game';

export interface CommandScheduler {
  issue(cmd: Command): void;
  step(state: GameState): void;
}

export class LocalScheduler implements CommandScheduler {
  private pending: Command[] = [];
  issue(cmd: Command): void { this.pending.push(cmd); }
  step(state: GameState): void {
    const cmds = this.pending; this.pending = [];
    tick(state, cmds);
  }
}

/** Esqueleto para multiplayer: comandos de cada tick só executam quando todos os jogadores enviaram os seus. */
export class LockstepScheduler implements CommandScheduler {
  private delay: number;
  private local: number;
  private buffers = new Map<number, Map<number, Command[]>>(); // tick -> player -> comandos
  private players: number[];
  private send: (tick: number, cmds: Command[]) => void;
  constructor(localPlayer: number, players: number[], delayTicks: number, send: (tick: number, cmds: Command[]) => void) {
    this.local = localPlayer; this.players = players; this.delay = delayTicks; this.send = send;
  }
  private outgoing: Command[] = [];
  issue(cmd: Command): void { this.outgoing.push(cmd); }
  receive(tick: number, player: number, cmds: Command[]): void {
    let m = this.buffers.get(tick); if (!m) { m = new Map(); this.buffers.set(tick, m); }
    m.set(player, cmds);
  }
  /** Retorna false se está aguardando comandos remotos (a simulação não avança). */
  step(state: GameState): void {
    const target = state.tick + this.delay;
    // envia os comandos locais para o tick futuro
    const mine = this.outgoing; this.outgoing = [];
    this.receive(target, this.local, mine); this.send(target, mine);
    const m = this.buffers.get(state.tick);
    if (state.tick >= this.delay) {
      for (const p of this.players) if (!m || !m.has(p)) return; // aguarda
    }
    const cmds: Command[] = [];
    if (m) for (const p of [...this.players].sort((a, b) => a - b)) cmds.push(...(m.get(p) ?? []));
    this.buffers.delete(state.tick);
    tick(state, cmds);
  }
}
