// Camada naval (E4; docs/eras/E4-naval.md): onde um navio pode estar. Derivada do terreno, dos nós e dos edifícios —
// nunca salva nem no hash —, calculada sob demanda e descartada junto das regiões (components.invalidateComponents chama
// invalidateNaval). Navegável = água rasa, profunda e baixio sem nó; o baixio também é caminhável (camada terrestre).
import { TERRAIN, SHIP_NODES } from '../constants';
import type { GameMap } from '../types';

/** Camada de movimento: terrestre, naval ou anfíbia (E6: Ceto e Oceano; terra caminhável OU água navegável). */
export type Layer = 'land' | 'naval' | 'amphibious';
export const layerOf = (def: { naval?: boolean; amphibious?: boolean }): Layer => (def.amphibious ? 'amphibious' : def.naval ? 'naval' : 'land');
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
/** E7 (Canal de Corinto): tiles de terra abertos à navegação — derivados dos edifícios `navalPassable` prontos, fora do GameMap,
 *  do save e do hash (o `deserialize` os reabre). Nunca escreva em map.terrain: o terreno não muda em partida. */
const navalOpen = new WeakMap<GameMap, Set<number>>();
export function setNavalOpen(map: GameMap, tiles: number[], open: boolean): void {
  let set = navalOpen.get(map);
  if (!set) { set = new Set(); navalOpen.set(map, set); }
  for (const i of tiles) { if (open) set.add(i); else set.delete(i); }
  invalidateNaval(map);
}
/** 1 = navio não passa (terra, montanha, nó, edifício). */
export function navalBlocked(map: GameMap): Uint8Array {
  let nb = cache.get(map);
  if (!nb) {
    nb = new Uint8Array(map.w * map.h);
    const opened = navalOpen.get(map);
    for (let i = 0; i < nb.length; i++) { const open = opened?.has(i) ?? false; nb[i] = (isNavigableTerrain(map.terrain[i]) || open) && map.nodeAt[i] === -1 && (map.buildingAt[i] === -1 || open) ? 0 : 1; }
    cache.set(map, nb);
  }
  return nb;
}
const amphCache = new WeakMap<GameMap, Uint8Array>();
/** E6: 1 = nem a pé nem a nado (montanha, nó, edifício). Portão do próprio time: canPass. Derivada; descartada com a naval. */
export function amphibBlocked(map: GameMap): Uint8Array {
  let ab = amphCache.get(map);
  if (!ab) {
    const nb = navalBlocked(map);
    ab = new Uint8Array(map.w * map.h);
    for (let i = 0; i < ab.length; i++) ab[i] = map.blocked[i] === 0 || nb[i] === 0 ? 0 : 1;
    amphCache.set(map, ab);
  }
  return ab;
}
/** Bloqueio por camada (land = map.blocked). */
export function layerBlocked(map: GameMap, layer: Layer): Uint8Array { return layer === 'naval' ? navalBlocked(map) : layer === 'amphibious' ? amphibBlocked(map) : map.blocked; }
export function invalidateNaval(map: GameMap): void { cache.delete(map); amphCache.delete(map); }
