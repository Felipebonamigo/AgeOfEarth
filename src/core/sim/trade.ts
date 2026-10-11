// Rotas comerciais (docs/ERAS.md §7; docs/eras/E5-E7-comercio-maravilhas.md): caravanas por terra entre Centros Cívicos
// e Mercados do time, navios mercantes por mar entre Estaleiros. Funções puras sobre o estado: o comando `route`
// (commands.ts), o movimento (units.ts, updateRoute), a IA e o HUD usam as mesmas.
import { TRADE_ALLY_BONUS, TRADE_GOLD_PER_TILE, TRADE_MIN_DISTANCE } from '../constants';
import { BUILDINGS, UNITS } from '../data';
import type { Building, GameState, Unit } from '../types';
import { centerFrame, distToRect, frameCompare } from '../map/grid';
import { rectReachable } from '../map/components';
import { centerDist2, isAlly } from './queries';
import { t } from '../../i18n';

export type TradeKind = 'land' | 'sea';
export const tradeKindOf = (type: string): TradeKind | null => UNITS[type]?.trader ?? null;

/** Ponto de comércio do tipo pedido: vivo, pronto e de um jogador ainda na partida. */
export function isTradePost(state: GameState, b: Building | undefined, kind: TradeKind): b is Building {
  return !!b && !b.dead && b.complete && BUILDINGS[b.type].tradeRoute === kind && state.players[b.owner]?.alive === true;
}
export function centerDist(a: Building, b: Building): number { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

/** Dá para chegar ao edifício a partir do tile (sx, sy)? Terra: regiões conexas. Mar: gancho da E4 (Fase F). */
export function reachableFor(state: GameState, kind: TradeKind, sx: number, sy: number, b: Building): boolean {
  if (kind === 'land') return rectReachable(state.map, sx, sy, b.tx, b.ty, b.w, b.h, true);
  return false;   // E4/Fase F: troque pela alcançabilidade da camada de água
}

/** Ponto de comércio PRÓPRIO mais perto de (x, y) pela borda, sem `exclude`. Empate: mais perto do centro do mapa,
 *  depois frameCompare no referencial de (x, y) (nunca a ordem do Map). */
export function nearestOwnPost(state: GameState, owner: number, kind: TradeKind, x: number, y: number, exclude = -1): Building | null {
  let best: Building | null = null, bestD = Infinity, bestC = Infinity;
  const f = centerFrame(state.map, x, y);
  for (const b of state.buildings.values()) {
    if (b.owner !== owner || b.id === exclude || !isTradePost(state, b, kind)) continue;
    const d = distToRect(x, y, b.tx, b.ty, b.w, b.h), c = centerDist2(state.map, b.x, b.y);
    const tie = Math.abs(d - bestD) <= 1e-9;
    if (d < bestD - 1e-9 || (tie && (c < bestC || (c === bestC && best !== null && frameCompare(f, b.x - x, b.y - y, best.x - x, best.y - y) < 0)))) { best = b; bestD = d; bestC = c; }
  }
  return best;
}

export interface RouteCheck { ok: boolean; reason?: string; home?: Building }
/** A unidade pode fazer rota até `dest`? Devolve a casa (D3). Mesma regra no comando, no início da ordem e no HUD. */
export function canRoute(state: GameState, u: Unit, dest: Building | undefined): RouteCheck {
  const kind = tradeKindOf(u.type);
  if (!kind) return { ok: false, reason: t('err.notTrader') };
  if (!isTradePost(state, dest, kind) || !isAlly(state, u.owner, dest.owner)) return { ok: false, reason: t(kind === 'sea' ? 'err.routeSeaTarget' : 'err.routeTarget') };
  const home = nearestOwnPost(state, u.owner, kind, u.x, u.y, dest.id);
  if (!home) return { ok: false, reason: t('err.routeNoHome') };
  if (centerDist(home, dest) < TRADE_MIN_DISTANCE) return { ok: false, reason: t('err.routeShort', { n: TRADE_MIN_DISTANCE }) };
  const sx = Math.floor(u.x), sy = Math.floor(u.y);
  if (!reachableFor(state, kind, sx, sy, home) || !reachableFor(state, kind, sx, sy, dest)) return { ok: false, reason: t('err.routeUnreachable') };
  return { ok: true, home };
}

/** Ouro de uma chegada (D4). `a` é a casa (sempre do dono), `b` o destino. */
export function routeGold(state: GameState, owner: number, a: Building, b: Building, kind: TradeKind): number {
  const p = state.players[owner];
  const ally = a.owner !== owner || b.owner !== owner ? TRADE_ALLY_BONUS : 1;
  const sea = kind === 'sea' ? p.mods.player.seaTradeIncome : 1;
  return Math.round(TRADE_GOLD_PER_TILE[kind] * centerDist(a, b) * p.mods.player.tradeIncome * sea * p.mods.gather.gold * ally);
}

/** Melhor rota a partir de (x, y): casa = nearestOwnPost; destino = o ponto do time mais LONGE (≥ mínimo, alcançável).
 *  Empate: mais perto do centro do mapa, depois frameCompare no referencial da casa. Usada pela IA. */
export function bestRoute(state: GameState, owner: number, kind: TradeKind, x: number, y: number): { home: Building; dest: Building } | null {
  const home = nearestOwnPost(state, owner, kind, x, y);
  if (!home) return null;
  const sx = Math.floor(x), sy = Math.floor(y);
  if (!reachableFor(state, kind, sx, sy, home)) return null;
  const f = centerFrame(state.map, home.x, home.y);
  let best: Building | null = null, bestD = -1, bestC = Infinity;
  for (const b of state.buildings.values()) {
    if (b.id === home.id || !isTradePost(state, b, kind) || !isAlly(state, owner, b.owner)) continue;
    const d = centerDist(home, b);
    if (d < TRADE_MIN_DISTANCE || !reachableFor(state, kind, sx, sy, b)) continue;
    const c = centerDist2(state.map, b.x, b.y), tie = Math.abs(d - bestD) <= 1e-9;
    if (d > bestD + 1e-9 || (tie && (c < bestC || (c === bestC && best !== null && frameCompare(f, b.x - home.x, b.y - home.y, best.x - home.x, best.y - home.y) < 0)))) { best = b; bestD = d; bestC = c; }
  }
  return best ? { home, dest: best } : null;
}
