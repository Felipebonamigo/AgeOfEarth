// G6: travas de cenário — Idade máxima e itens proibidos (config.maxAge / config.forbid, globais ou por jogador).
// Conferidas em commands.ts (canTrain, canResearch, canAdvanceAge) e em entities.ts (buildingLimitOk); a IA e o HUD usam
// as mesmas funções, então o que o comando recusa a IA não tenta e o botão aparece desabilitado com o motivo.
import { AGES, BUILDINGS, MAX_AGE, UNITS } from '../data';
import type { Forbid, GameConfig, GameState } from '../types';
import { t } from '../../i18n';

export type ForbidKind = keyof Forbid;   // 'buildings' | 'units' | 'techs'

/** Idade máxima do jogador: config.players[i].maxAge, senão config.maxAge, senão a última Idade (MAX_AGE). */
export function maxAgeOf(state: GameState, player: number): number {
  const c = state.config;
  const v = c.players[player]?.maxAge ?? c.maxAge;
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(MAX_AGE, Math.floor(v))) : MAX_AGE;
}

/** Partida de cenário (campanha, Horda, cenário JSON): as travas falam "Proibido nesta missão". */
export function isScenarioConfig(c: GameConfig): boolean { return !!(c.scenario || c.scenarioData); }
/** E4: navios ligados? Fora de cenário sempre; em cenário (campanha, Horda, JSON) só com config.naval === true. */
export function navalOn(state: GameState): boolean { return state.config.naval ?? !isScenarioConfig(state.config); }
/** E6: mitologia por Era (escala dos poderes, Bênçãos, Titãs reforçados). Fora de cenário, sempre; em cenário, só com config.eraMyth === true. */
export function eraMythOn(state: GameState): boolean { return state.config.eraMyth ?? !isScenarioConfig(state.config); }
/** Motivo de recusa do avanço além da Era final: em cenário "Proibido nesta missão"; na partida rápida "Era final desta partida: X". */
export function endAgeReason(state: GameState, player: number): string {
  return isScenarioConfig(state.config) ? t('err.forbidden') : t('err.endAge', { age: AGES[maxAgeOf(state, player)].name });
}

/** O item está proibido para o jogador? Vale a lista global (config.forbid) somada à do próprio jogador. */
export function isForbidden(state: GameState, player: number, kind: ForbidKind, id: string): boolean {
  if (!navalOn(state) && ((kind === 'buildings' && BUILDINGS[id]?.shore) || (kind === 'units' && UNITS[id]?.naval))) return true;
  const c = state.config;
  return !!(c.forbid?.[kind]?.includes(id) || c.players[player]?.forbid?.[kind]?.includes(id));
}

/** Motivo de recusa por trava de cenário ("Proibido nesta missão") ou null. */
export function forbiddenReason(state: GameState, player: number, kind: ForbidKind, id: string): string | null {
  if (!navalOn(state) && ((kind === 'buildings' && BUILDINGS[id]?.shore) || (kind === 'units' && UNITS[id]?.naval))) return t('err.navalOff');
  return isForbidden(state, player, kind, id) ? t('err.forbidden') : null;
}

/** E7 (D14): as 20 maravilhas com as regras novas (únicas no mapa, várias por jogador, pontos)? Padrão: fora de cenário. */
export function allWondersOn(config: GameConfig): boolean { return config.allWonders ?? !isScenarioConfig(config); }
/** Era exigida para construir: em cenário, `scenarioAge` (as 3 maravilhas clássicas continuam na Era IV da campanha). */
export function buildingAgeOf(config: GameConfig, type: string): number {
  const d = BUILDINGS[type];
  return !allWondersOn(config) && d.scenarioAge !== undefined ? d.scenarioAge : d.age;
}
