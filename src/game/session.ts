// Sessão de jogo: estado, agendador de comandos, seleção, grupos de controle, velocidade e modo da interface.
import { DT, SIM_VERSION, type Formation } from '../core/constants';
import { t } from '../i18n';
import type { Building, Command, GameConfig, GameState, Unit } from '../core/types';
import { createGame } from '../core/sim/game';
import { LocalScheduler, ReplayScheduler, type CommandScheduler, type ReplayFrame } from '../core/net/lockstep';
import { serialize, deserialize } from '../core/serialize';
import type { EditorUI } from '../editor/types';
import { localHumanIndex, migrateLegacyPuppets } from '../core/scenario/helpers';
import { migrateScenarioLocks } from '../core/scenario/runner';

export type UIMode = 'normal' | 'place' | 'attackMove' | 'power' | 'rally' | 'editor';

export interface UIState {
  mode: UIMode;
  formation: Formation;
  placeType: string | null;
  powerId: string | null;
  wallStart: { x: number; y: number } | null;
  showRanges: boolean;
  editor?: EditorUI;                 // presente só no editor de mapas (ui.mode === 'editor')
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
  ui: UIState = { mode: 'normal', placeType: null, powerId: null, wallStart: null, showRanges: false, formation: 'line' };
  lastEvent: { x: number; y: number } | null = null;
  eventCursor = 0;
  onSelectionChanged: (() => void) | null = null;
  spectator = false;
  /** Save de origem quando a partida foi carregada: o replay parte dele, não do tick 0. */
  replayBase: string | null = null;

  constructor(state: GameState, local = 0) { this.state = state; this.local = local; }

  static newGame(config: GameConfig, local?: number): Session { return new Session(createGame(config), local ?? localHumanIndex(config)); }
  static load(json: string): Session {
    const st = deserialize(json);
    const s = new Session(st, localHumanIndex(st.config));
    try { const g = (JSON.parse(json) as { uiGroups?: [number, number[]][] }).uiGroups; if (g) s.groups = new Map(g); } catch { /* save antigo */ }
    s.replayBase = json;
    s.eventCursor = st.events.length;   // eventos antigos do save não são reexibidos como novos
    return s;
  }
  /** Estado + grupos de controle (só interface; ignorados pela simulação e pelo hash). */
  save(): string { const o = JSON.parse(serialize(this.state)) as Record<string, unknown>; o.uiGroups = [...this.groups.entries()]; return JSON.stringify(o); }

  issue(cmd: Command): void { if (this.spectator) return; this.scheduler.issue(cmd); }

  /** Replay gravado desta partida (partidas locais). */
  replayJSON(): string | null {
    const sch = this.scheduler;
    if (!(sch instanceof LocalScheduler)) return null;
    return JSON.stringify({ version: 2, sim: SIM_VERSION, config: this.state.config, frames: sch.frames, ticks: this.state.tick, base: this.replayBase ?? undefined });
  }
  static replay(json: string): Session {
    const o = JSON.parse(json) as { sim?: number; config: GameConfig; frames: ReplayFrame[]; base?: string };
    // replay = semente + comandos: numa simulação diferente mostraria outra partida (sem 'sim' = gravado antes da versão 2)
    const sim = o.sim ?? 1;
    if (sim !== SIM_VERSION) throw new Error(t('err.replayVersion', { v: sim, cur: SIM_VERSION }));
    o.config = migrateScenarioLocks(migrateLegacyPuppets(o.config));
    const st = o.base ? deserialize(o.base) : createGame(o.config);
    const s = new Session(st, Math.max(0, localHumanIndex(o.config)));
    if (o.base) s.eventCursor = st.events.length;
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

  /** additive: Ctrl. toggle=true alterna (clique numa entidade); toggle=false só acrescenta (caixa de seleção, duplo clique). */
  select(ids: number[], additive = false, toggle = true): void {
    if (!additive) this.selection.clear();
    for (const id of ids) { if (additive && toggle && this.selection.has(id)) this.selection.delete(id); else this.selection.add(id); }
    this.pruneSelection();
    this.onSelectionChanged?.();
  }
  pruneSelection(): void {
    for (const id of [...this.selection]) { const u = this.state.units.get(id); if ((!u && !this.state.buildings.has(id)) || (u && u.inside !== -1)) this.selection.delete(id); }
  }
  setGroup(n: number): void { this.groups.set(n, [...this.selection]); }
  recallGroup(n: number): void { const g = this.groups.get(n); if (g) this.select(g.filter((id) => this.state.units.has(id) || this.state.buildings.has(id))); }
}
