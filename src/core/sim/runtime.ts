// Dados de execução não serializados (reconstruídos a partir do estado): hash espacial, caches.
import type { GameState } from '../types';
import { SpatialHash } from './spatial';

export interface Runtime {
  hash: SpatialHash;
  pathBudget: number;
  nodeGatherers: Map<number, number>;   // nó -> nº de coletores designados (reconstruído por tick)
  statsCache: Map<number, { version: number; units: Map<string, UnitStats>; buildings: Map<string, BuildingStats> }>;
  /** Exceções engolidas ao aplicar comandos de fora no tick (rede de segurança; o esperado é 0 — ver tests/command-fuzz). */
  commandErrors: number;
  lastCommandError: string;
}

export interface UnitStats {
  hp: number; attack: number; armor: { hack: number; pierce: number; crush: number }; range: number; speed: number; los: number;
  cost: Record<string, number>; trainTime: number; splash: number;
}
export interface BuildingStats {
  hp: number; attack: number; range: number; los: number; cost: Record<string, number>; buildTime: number; territory: number;
}

const runtimes = new WeakMap<GameState, Runtime>();

export function getRuntime(state: GameState): Runtime {
  let r = runtimes.get(state);
  if (!r) {
    r = { hash: new SpatialHash(state.map.w, state.map.h, 4), pathBudget: 0, nodeGatherers: new Map(), statsCache: new Map(), commandErrors: 0, lastCommandError: '' };
    runtimes.set(state, r);
  }
  return r;
}
