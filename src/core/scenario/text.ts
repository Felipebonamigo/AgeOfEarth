// Textos de cenário ({ pt, en } ou string) resolvidos pelo idioma atual no momento de emitir (diálogo, objetivo, HUD).
// Nunca entram no hash: só a string resolvida chega a state.events. Nomes próprios (G8) ficam no estado como { pt, en? }
// (iguais em todos os clientes) e são resolvidos aqui ao exibir.
import { getLocale } from '../../i18n';
import { BUILDINGS, UNITS } from '../data';
import type { Building, GameState, LocalText, Unit } from '../types';
import type { Text } from './schema';

/** Resolve um texto de cenário pelo idioma atual; cai para pt; string simples volta como está. */
export function tx(t: Text | undefined | null): string {
  if (t === undefined || t === null) return '';
  if (typeof t === 'string') return t;
  if (typeof t !== 'object') return String(t);
  const loc = getLocale();
  const v = loc !== 'pt' ? (t as Record<string, unknown>)[loc] : undefined;
  if (typeof v === 'string' && v.length > 0) return v;
  return typeof t.pt === 'string' ? t.pt : '';
}

/** Texto de cenário na forma guardada no estado/config (G8): string vira { pt }; { pt, en } é copiado sem campos extras. */
export function localText(t: Text): LocalText {
  if (typeof t === 'string') return { pt: t };
  return typeof t.en === 'string' && t.en.length > 0 ? { pt: t.pt, en: t.en } : { pt: t.pt };
}

/** Nome exibido de uma entidade (G8): o nome próprio dado pelo cenário, no idioma atual, ou o nome do tipo. */
export function entityDisplayName(e: Pick<Unit, 'kind' | 'type' | 'displayName'> | Pick<Building, 'kind' | 'type' | 'displayName'>): string {
  if (e.displayName) { const n = tx(e.displayName); if (n) return n; }
  return (e.kind === 'unit' ? UNITS[e.type]?.name : BUILDINGS[e.type]?.name) ?? e.type;
}

/** Nome exibido de um jogador (G8): o nome da facção por idioma (config.players[i].nameText) ou o nome do estado. */
export function playerDisplayName(state: GameState, id: number): string {
  const nt = state.config.players[id]?.nameText;
  if (nt) { const n = tx(nt); if (n) return n; }
  return state.players[id]?.name ?? '';
}
