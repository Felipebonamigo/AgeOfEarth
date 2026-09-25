// Sessão de jogo: estado, agendador de comandos, seleção, grupos de controle, velocidade e modo da interface.
import { DT } from '../core/constants';
import type { Building, Command, GameConfig, GameState, Unit } from '../core/types';
import { createGame } from '../core/sim/game';
import { LocalScheduler, ReplayScheduler, type CommandScheduler, type ReplayFrame } from '../core/net/lockstep';
import { serialize, deserialize } from '../core/serialize';

export type UIMode = 'normal' | 'place' | 'attackMove' | 'power' | 'rally';

export interface UIState {
  mode: UIMode;
  placeType: string | null;
  powerId: string | null;
  wallStart: { x: number; y: number } | null;
  showRanges: boolean;
}

export class Session {
  state: GameState;
  scheduler: CommandScheduler = new LocalScheduler();
  local: number;
  selection = new Set<number>();
  groups = new Map<number, number[]>();
  speed = 1;
  paused = false;
  accumulator = 0;
  ui: UIState = { mode: 'normal', placeType: null, powerId: null, wallStart: null, showRanges: false };
  lastEvent: { x: number; y: number } | null = null;
  eventCursor = 0;
  onSelectionChanged: (() => void) | null = null;
  spectator = false;

  constructor(state: GameState, local = 0) { this.state = state; this.local = local; }

  static newGame(config: GameConfig, local?: number): Session { return new Session(createGame(config), local ?? config.players.findIndex((p) => !p.isAI)); }
  static load(json: string): Session { const st = deserialize(json); return new Session(st, st.config.players.findIndex((p) => !p.isAI)); }
  save(): string { return serialize(this.state); }

  issue(cmd: Command): void { if (this.spectator) return; this.scheduler.issue(cmd); }

  /** Replay gravado desta partida (partidas locais). */
  replayJSON(): string | null {
    const sch = this.scheduler;
    if (!(sch instanceof LocalScheduler)) return null;
    return JSON.stringify({ version: 1, config: this.state.config, frames: sch.frames, ticks: this.state.tick });
  }
  static replay(json: string): Session {
    const o = JSON.parse(json) as { config: GameConfig; frames: ReplayFrame[] };
    const s = new Session(createGame(o.config), Math.max(0, o.config.players.findIndex((p) => !p.isAI)));
    s.scheduler = new ReplayScheduler(o.frames);
    s.spectator = true;
    return s;
  }

  /** Avança a simulação conforme o tempo real decorrido; retorna a fração de interpolação. */
  step(dtReal: number): number {
    if (this.paused || this.state.gameOver) return 1;
    this.accumulator += Math.min(0.25, dtReal) * this.speed;
    let n = 0;
    while (this.accumulator >= DT && n < 12) { if (!this.scheduler.step(this.state)) { this.accumulator = Math.min(this.accumulator, DT * 2); break; } this.accumulator -= DT; n++; }
    if (n >= 12) this.accumulator = 0;
    return Math.min(1, this.accumulator / DT);
  }

  get player() { return this.state.players[this.local]; }

  selectedUnits(): Unit[] { const out: Unit[] = []; for (const id of this.selection) { const u = this.state.units.get(id); if (u && !u.dead) out.push(u); } return out; }
  selectedBuildings(): Building[] { const out: Building[] = []; for (const id of this.selection) { const b = this.state.buildings.get(id); if (b && !b.dead) out.push(b); } return out; }
  ownSelectedUnits(): Unit[] { return this.selectedUnits().filter((u) => u.owner === this.local); }
  ownSelectedBuilding(): Building | null { const b = this.selectedBuildings().find((x) => x.owner === this.local); return b ?? null; }

  select(ids: number[], additive = false): void {
    if (!additive) this.selection.clear();
    for (const id of ids) { if (additive && this.selection.has(id)) this.selection.delete(id); else this.selection.add(id); }
    this.pruneSelection();
    this.onSelectionChanged?.();
  }
  pruneSelection(): void {
    for (const id of [...this.selection]) { const u = this.state.units.get(id); if ((!u && !this.state.buildings.has(id)) || (u && u.inside !== -1)) this.selection.delete(id); }
  }
  setGroup(n: number): void { this.groups.set(n, [...this.selection]); }
  recallGroup(n: number): void { const g = this.groups.get(n); if (g) this.select(g.filter((id) => this.state.units.has(id) || this.state.buildings.has(id))); }
}
