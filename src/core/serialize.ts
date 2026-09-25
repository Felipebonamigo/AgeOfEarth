// Serialização do estado (salvar/carregar). Mapas e arrays tipados viram arrays simples.
import { RNG } from './rng';
import type { GameState, Unit, Building, ResourceNode, Player } from './types';
import { NODE_ID_BASE, resetNodeSeq } from './map/mapgen';

export interface SavedGame { version: number; state: unknown }
const VERSION = 1;

export function serialize(state: GameState): string {
  const s = state;
  const out = {
    version: VERSION,
    config: s.config, seed: s.seed, tick: s.tick, time: s.time, nextId: s.nextId,
    map: { w: s.map.w, h: s.map.h, terrain: Array.from(s.map.terrain), decor: Array.from(s.map.decor), starts: s.map.starts, nodes: [...s.map.nodes.values()] },
    players: s.players.map((p) => ({ ...p, visibility: Array.from(p.visibility), mods: undefined })),
    units: [...s.units.values()], buildings: [...s.buildings.values()],
    territory: Array.from(s.territory), events: s.events.slice(-200), timed: s.timed,
    winner: s.winner, gameOver: s.gameOver, rng: s.rng.s, ceasefireUntil: s.ceasefireUntil, ceasefireBy: s.ceasefireBy, scenario: s.scenario ?? null,
  };
  return JSON.stringify(out);
}

export function deserialize(json: string): GameState {
  const o = JSON.parse(json);
  if (o.version !== VERSION) throw new Error('Versão de save incompatível.');
  const w: number = o.map.w, h: number = o.map.h;
  const nodes = new Map<number, ResourceNode>();
  const nodeAt = new Int32Array(w * h).fill(-1);
  const buildingAt = new Int32Array(w * h).fill(-1);
  const gateTeam = new Int8Array(w * h).fill(-1);
  const terrain = Uint8Array.from(o.map.terrain as number[]);
  const blocked = new Uint8Array(w * h);
  let maxNode = 0;
  for (const n of o.map.nodes as ResourceNode[]) { nodes.set(n.id, n); nodeAt[n.y * w + n.x] = n.id; if (n.id > maxNode) maxNode = n.id; }
  resetNodeSeq(Math.max(maxNode + 1, NODE_ID_BASE));
  const state: GameState = {
    config: o.config, seed: o.seed, tick: o.tick, time: o.time, nextId: o.nextId,
    map: { w, h, terrain, blocked, nodeAt, buildingAt, gateTeam, nodes, starts: o.map.starts, decor: Uint8Array.from(o.map.decor as number[]) },
    players: (o.players as (Player & { visibility: number[] })[]).map((p) => ({ ...p, team: p.team ?? p.id, visibility: Uint8Array.from(p.visibility), mods: { gather: { food: 1, wood: 1, gold: 1, knowledge: 1, favor: 1, hunt: 1, farm: 1 }, player: { territory: 0, cityLimit: 1, attrition: 0, attritionResist: 0, favorRate: 1, knowledgeRate: 1, researchCost: 1, buildSpeed: 1, trainSpeed: 1, popCap: 0, los: 0, tradeTax: 1, regen: 0 }, unitEffects: [], buildingEffects: [], version: 0 } })),
    units: new Map((o.units as Unit[]).map((u) => [u.id, { ...u, inside: u.inside ?? -1, resumeNodeId: u.resumeNodeId ?? -1, avoidIds: u.avoidIds ?? [], avoidUntil: u.avoidUntil ?? 0, blockedTicks: u.blockedTicks ?? 0 }])), buildings: new Map((o.buildings as Building[]).map((b) => [b.id, { ...b, garrison: b.garrison ?? [] }])),
    territory: Int8Array.from(o.territory as number[]), territoryDirty: true, territoryVersion: 0,
    events: o.events ?? [], effects: [], timed: o.timed ?? [], winner: o.winner, gameOver: o.gameOver, rng: new RNG(1),
    ceasefireUntil: o.ceasefireUntil ?? 0, ceasefireBy: o.ceasefireBy ?? -1, fogVersion: 0, scenario: o.scenario ? { ...o.scenario, vars: o.scenario.vars ?? {} } : undefined,
  };
  state.rng.s = o.rng >>> 0;
  // Reconstrói bloqueios: terreno, nós e edifícios
  const { TERRAIN } = constants;
  for (let i = 0; i < w * h; i++) { const t = terrain[i]; blocked[i] = (t === TERRAIN.WATER || t === TERRAIN.DEEP || t === TERRAIN.MOUNTAIN || nodeAt[i] !== -1) ? 1 : 0; }
  for (const b of state.buildings.values()) {
    const def = data.BUILDINGS[b.type];
    for (let y = b.ty; y < b.ty + b.h; y++) for (let x = b.tx; x < b.tx + b.w; x++) { const i = y * w + x; buildingAt[i] = b.id; if (!def.passable) blocked[i] = 1; if (def.gate && b.complete) gateTeam[i] = state.players[b.owner].team; }
  }
  for (const p of state.players) mods.recomputeMods(state, p);
  return state;
}
import * as constants from './constants';
import * as data from './data';
import * as mods from './sim/modifiers';
