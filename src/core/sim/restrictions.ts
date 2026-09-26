// G6: travas de cenário — Idade máxima e itens proibidos (config.maxAge / config.forbid, globais ou por jogador).
// Conferidas em commands.ts (canTrain, canResearch, canAdvanceAge) e em entities.ts (buildingLimitOk); a IA e o HUD usam
// as mesmas funções, então o que o comando recusa a IA não tenta e o botão aparece desabilitado com o motivo.
import { MAX_AGE } from '../data';
import type { Forbid, GameState } from '../types';
import { t } from '../../i18n';

export type ForbidKind = keyof Forbid;   // 'buildings' | 'units' | 'techs'

/** Idade máxima do jogador: config.players[i].maxAge, senão config.maxAge, senão a última Idade (MAX_AGE). */
export function maxAgeOf(state: GameState, player: number): number {
  const c = state.config;
  const v = c.players[player]?.maxAge ?? c.maxAge;
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(MAX_AGE, Math.floor(v))) : MAX_AGE;
}

/** O item está proibido para o jogador? Vale a lista global (config.forbid) somada à do próprio jogador. */
export function isForbidden(state: GameState, player: number, kind: ForbidKind, id: string): boolean {
  const c = state.config;
  return !!(c.forbid?.[kind]?.includes(id) || c.players[player]?.forbid?.[kind]?.includes(id));
}

/** Motivo de recusa por trava de cenário ("Proibido nesta missão") ou null. */
export function forbiddenReason(state: GameState, player: number, kind: ForbidKind, id: string): string | null {
  return isForbidden(state, player, kind, id) ? t('err.forbidden') : null;
}
