// Textos de cenário ({ pt, en } ou string) resolvidos pelo idioma atual no momento de emitir (diálogo, objetivo, HUD).
// Nunca entram no estado nem no hash: só a string resolvida chega a state.events.
import { getLocale } from '../../i18n';
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
