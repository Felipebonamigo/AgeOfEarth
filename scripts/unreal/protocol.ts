// Ponte simulação ↔ Unreal (docs/UNREAL.md): monta as mensagens que o cliente Unreal recebe e valida as que ele manda.
// Funções puras sobre o GameState (nada de rede aqui; o servidor está em sim-server.ts). O cliente nunca altera o
// estado: ele só desenha o que recebe e devolve `Command`s, que passam por `sanitizeCommand` como os da rede.
//
// Unidades de medida: posições em TILES (como a simulação); 1 tile = 200 uu no Unreal (X = x·200, Y = y·200).
// Mensagens servidor → cliente (JSON, uma por frame de WebSocket):
//   hello  — uma vez ao conectar: versão, taxa de ticks, mapa, jogadores, nós de recurso, dados dos tipos usados.
//   state  — a cada `stateEvery` ticks: unidades, edifícios, nós alterados, recursos do jogador local, eventos e
//            efeitos visuais ocorridos desde a mensagem anterior.
//   fog    — quando a névoa do jogador local muda: base64 de w·h bytes (0 inexplorado, 1 explorado, 2 visível).
//   over   — fim de partida.
// Mensagens cliente → servidor: { type:'cmd', cmd } · { type:'pause', paused } · { type:'speed', speed } · { type:'ping', t }.
import { BUILDINGS, UNITS, MAJOR_GODS, AGES } from '../../src/core/data';
import { TICK_RATE, SIM_VERSION } from '../../src/core/constants';
import { sanitizeCommand } from '../../src/core/sim/validate';
import type { Command, GameEvent, GameState, Unit, VisualEffect } from '../../src/core/types';

export const PROTOCOL_VERSION = 1;
/** Tiles → unidades do Unreal (1 tile = 2 m). */
export const UU_PER_TILE = 200;

export interface BridgeOptions {
  /** Jogador que o cliente controla. */
  player: number;
  /** Ignora a névoa: manda tudo (desenvolvimento). */
  reveal: boolean;
  /** Um `state` a cada N ticks (a simulação roda a 20 Hz; 2 = 10 Hz). */
  stateEvery: number;
}
export const DEFAULT_OPTIONS: BridgeOptions = { player: 0, reveal: false, stateEvery: 2 };

const b64 = (a: Uint8Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Mensagem de abertura: tudo o que o cliente precisa saber uma vez. */
export function buildHello(state: GameState, opts: BridgeOptions) {
  const m = state.map;
  const nodes = [...m.nodes.values()].map((n) => ({ id: n.id, t: n.type, x: n.x, y: n.y, amt: n.amount, max: n.max }));
  return {
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    simVersion: SIM_VERSION,
    tickRate: TICK_RATE,
    stateEvery: opts.stateEvery,
    uuPerTile: UU_PER_TILE,
    player: opts.player,
    reveal: opts.reveal,
    map: { w: m.w, h: m.h, terrain: b64(m.terrain), decor: b64(m.decor), starts: m.starts },
    nodes,
    players: state.players.map((p) => ({ id: p.id, name: p.name, color: p.color, team: p.team, god: p.god, isAI: p.isAI })),
    ages: AGES.map((a) => ({ id: a.id, name: a.name })),
    // dados mínimos dos tipos para o cliente escolher modelos e escalas sem importar o jogo inteiro
    unitTypes: Object.fromEntries(Object.values(UNITS).map((u) => [u.id, { name: u.name, cls: u.cls, radius: u.radius, tags: u.tags, speed: u.speed, range: u.range, pop: u.pop }])),
    buildingTypes: Object.fromEntries(Object.values(BUILDINGS).map((b) => [b.id, { name: b.name, w: b.w, h: b.h, trains: b.trains ?? [], wonder: !!b.wonder }])),
    gods: Object.fromEntries(Object.values(MAJOR_GODS).map((g) => [g.id, { name: g.name, power: g.power }])),
  };
}

/** Memória por cliente: o que já foi enviado (diferenças de nós e de névoa) e o que se acumulou desde o último `state`. */
export class BridgeSession {
  private nodeSent = new Map<number, number>();
  private fogSent = -1;
  private effects: VisualEffect[] = [];
  private eventsFrom = 0;
  private lastTick = -1;
  private overSent = false;

  constructor(public opts: BridgeOptions = DEFAULT_OPTIONS) {}

  /** Chame depois de CADA tick: guarda os efeitos nascidos nele (vivem vários ticks; só os novos interessam). */
  afterTick(state: GameState): void {
    for (const e of state.effects) if (e.ttl === e.total - 1) this.effects.push(e);
    if (this.effects.length > 400) this.effects.splice(0, this.effects.length - 400);
  }

  /** A simulação chegou a um tick em que se envia `state`? */
  due(state: GameState): boolean { return state.tick % this.opts.stateEvery === 0 && state.tick !== this.lastTick; }

  /** Mensagens a enviar agora (state, fog quando mudou, over uma vez). */
  flush(state: GameState): object[] {
    const out: object[] = [];
    this.lastTick = state.tick;
    const me = state.players[this.opts.player];
    if (me && (this.fogSent !== state.fogVersion) && !this.opts.reveal) { out.push({ type: 'fog', tick: state.tick, v: me.visibility.length ? b64(me.visibility) : '' }); this.fogSent = state.fogVersion; }
    out.push(this.buildState(state));
    if (state.gameOver && !this.overSent) { this.overSent = true; out.push({ type: 'over', tick: state.tick, winner: state.winner, events: state.events.filter((e) => e.type === 'victory').map((e) => e.text ?? '') }); }
    return out;
  }

  private visibleTile(state: GameState, x: number, y: number): number {
    const me = state.players[this.opts.player];
    if (this.opts.reveal || !me) return 2;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= state.map.w || ty >= state.map.h) return 0;
    return me.visibility[ty * state.map.w + tx];
  }

  private buildState(state: GameState) {
    const me = state.players[this.opts.player];
    const myTeam = me?.team ?? -1;
    const units: object[] = [];
    for (const u of state.units.values()) {
      if (u.dead || u.inside !== -1) continue;
      const mine = state.players[u.owner].team === myTeam;
      if (!mine && this.visibleTile(state, u.x, u.y) !== 2) continue;
      units.push(unitMsg(u));
    }
    const buildings: object[] = [];
    for (const b of state.buildings.values()) {
      if (b.dead) continue;
      const mine = state.players[b.owner].team === myTeam;
      const vis = mine ? 2 : this.visibleTile(state, b.x, b.y);
      if (vis === 0) continue;
      const def = BUILDINGS[b.type];
      buildings.push({
        id: b.id, t: b.type, o: b.owner, tx: b.tx, ty: b.ty, w: b.w, h: b.h, hp: Math.round(b.hp), mhp: Math.round(b.maxHp),
        c: b.complete ? 1 : 0, p: b.complete ? 1 : r2(def.buildTime > 0 ? Math.min(1, b.progress / def.buildTime) : 1), q: b.queue.length, v: vis, age: state.players[b.owner].age,
      });
    }
    // nós: só o que mudou desde a última vez (quantidade) e os que sumiram (-1)
    const nodes: [number, number][] = [];
    for (const n of state.map.nodes.values()) { if (this.nodeSent.get(n.id) !== n.amount) { nodes.push([n.id, Math.round(n.amount)]); this.nodeSent.set(n.id, n.amount); } }
    for (const id of [...this.nodeSent.keys()]) if (!state.map.nodes.has(id)) { nodes.push([id, -1]); this.nodeSent.delete(id); }
    const events: GameEvent[] = state.events.filter((e) => e.tick >= this.eventsFrom);
    this.eventsFrom = state.tick + 1;
    const effects = this.effects.map((e) => ({ type: e.type, x: r2(e.x), y: r2(e.y), tx: e.tx, ty: e.ty, owner: e.owner, total: e.total, data: e.data, src: e.src }));
    this.effects = [];
    return {
      type: 'state', tick: state.tick, time: r2(state.time), units, buildings, nodes, events, effects,
      me: me ? {
        resources: Object.fromEntries(Object.entries(me.resources).map(([k, v]) => [k, Math.floor(v)])),
        pop: me.pop, popCap: me.popCap, age: me.age, minorGods: me.minorGods, techs: me.techs, powers: me.powers, alive: me.alive,
      } : null,
      players: state.players.map((p) => ({ id: p.id, age: p.age, pop: p.pop, alive: p.alive })),
    };
  }
}

function unitMsg(u: Unit) {
  return { id: u.id, t: u.type, o: u.owner, x: r2(u.x), y: r2(u.y), px: r2(u.px), py: r2(u.py), hp: Math.round(u.hp), mhp: Math.round(u.maxHp), s: u.state, atk: u.attackTick, tid: u.targetId, nid: u.nodeId, carry: u.carry, kills: u.kills, heads: u.heads };
}

export type ClientMessage =
  | { kind: 'cmd'; cmd: Command }
  | { kind: 'pause'; paused: boolean }
  | { kind: 'speed'; speed: number }
  | { kind: 'ping'; t: number };

/** Valida uma mensagem do cliente. O jogador do comando é SEMPRE o do cliente (ele não manda em outro). */
export function parseClientMessage(state: GameState, opts: BridgeOptions, raw: unknown): ClientMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  switch (m.type) {
    case 'cmd': {
      if (typeof m.cmd !== 'object' || m.cmd === null) return null;
      const cmd = sanitizeCommand(state, { ...(m.cmd as object), player: opts.player });
      return cmd ? { kind: 'cmd', cmd } : null;
    }
    case 'pause': return typeof m.paused === 'boolean' ? { kind: 'pause', paused: m.paused } : null;
    case 'speed': return typeof m.speed === 'number' && Number.isFinite(m.speed) ? { kind: 'speed', speed: Math.min(8, Math.max(0.25, m.speed)) } : null;
    case 'ping': return typeof m.t === 'number' ? { kind: 'ping', t: m.t } : null;
    default: return null;
  }
}
