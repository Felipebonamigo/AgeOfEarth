// Camada naval (E4; docs/eras/E4-naval.md): onde um navio pode estar. Derivada do terreno, dos nós e dos edifícios —
// nunca salva nem no hash —, calculada sob demanda e descartada junto das regiões (components.invalidateComponents chama
// invalidateNaval). Navegável = água rasa, profunda e baixio sem nó; o baixio também é caminhável (camada terrestre).
import { TERRAIN, SHIP_NODES } from '../constants';
import type { GameMap } from '../types';

/** Camada de movimento: terrestre (map.blocked + portões) ou naval (navalBlocked). */
export type Layer = 'land' | 'naval';
export const layerOf = (def: { naval?: boolean }): Layer => (def.naval ? 'naval' : 'land');
/** Água em que navio navega (inclui o baixio). Também é "água" para o renderizador e o áudio. */
export const isNavigableTerrain = (t: number): boolean => t === TERRAIN.WATER || t === TERRAIN.DEEP || t === TERRAIN.SHALLOWS;
/** Água aberta: onde há peixe e o que conta para o Estaleiro (o baixio não). */
export const isOpenWater = (t: number): boolean => t === TERRAIN.WATER || t === TERRAIN.DEEP;
/** Bloqueia a camada terrestre (a regra de rebuildBlocked de sempre): água aberta e montanha. */
export const isLandBlockedTerrain = (t: number): boolean => t === TERRAIN.WATER || t === TERRAIN.DEEP || t === TERRAIN.MOUNTAIN;
/** Não se constrói nem se põe nó terrestre: toda água (com o baixio) e montanha. */
export const isUnbuildableTerrain = (t: number): boolean => isNavigableTerrain(t) || t === TERRAIN.MOUNTAIN;
/** O nó `type` cabe num tile de terreno `t`? Peixe só em água aberta; os demais só em terra construível. */
export const nodeFitsTerrain = (type: string, t: number): boolean => (SHIP_NODES.has(type) ? isOpenWater(t) : !isUnbuildableTerrain(t));
/** Mar mínimo (tiles da região naval) para Estaleiro e peixe: lagoas menores não têm frota. */
export const MIN_DOCK_WATER = 60;

const cache = new WeakMap<GameMap, Uint8Array>();
/** 1 = navio não passa (terra, montanha, nó, edifício). */
export function navalBlocked(map: GameMap): Uint8Array {
  let nb = cache.get(map);
  if (!nb) {
    nb = new Uint8Array(map.w * map.h);
    for (let i = 0; i < nb.length; i++) nb[i] = isNavigableTerrain(map.terrain[i]) && map.nodeAt[i] === -1 && map.buildingAt[i] === -1 ? 0 : 1;
    cache.set(map, nb);
  }
  return nb;
}
export function invalidateNaval(map: GameMap): void { cache.delete(map); }
