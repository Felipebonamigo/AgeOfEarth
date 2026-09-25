// Idiomas: PT-BR (canônico, nos dados) e EN (sobreposição por id). Troca em tempo de execução.
import { AGES, BUILDINGS, MAJOR_GODS, MINOR_GODS, POWERS, TECHS, UNITS, ABILITIES } from '../core/data';
import { EN_AGES, EN_BUILDINGS, EN_MAJOR_GODS, EN_MINOR_GODS, EN_POWERS, EN_TECHS, EN_UNITS, EN_ABILITIES, type TextOverlay } from './en-data';
import { STRINGS } from './strings';

export type Locale = 'pt' | 'en';
let current: Locale = 'pt';
const originals = new Map<object, TextOverlay>();

export function getLocale(): Locale { return current; }

/** Texto de interface por chave, com substituição de {variáveis}. Chaves ausentes caem para PT e depois para a própria chave. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const table = STRINGS[current] as Record<string, string>;
  let s = table[key] ?? (STRINGS.pt as Record<string, string>)[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

function apply<T extends Record<string, unknown>>(target: T, overlay?: TextOverlay): void {
  if (!originals.has(target)) originals.set(target, { name: target.name as string, plural: target.plural as string | undefined, desc: target.desc as string | undefined, title: target.title as string | undefined, short: target.short as string | undefined, perks: target.perks as string[] | undefined });
  const base = originals.get(target)!;
  const src = current === 'pt' || !overlay ? base : { ...base, ...overlay };
  for (const k of ['name', 'plural', 'desc', 'title', 'short', 'perks'] as const) if (src[k] !== undefined) (target as Record<string, unknown>)[k] = src[k];
}

/** Aplica o idioma atual a todos os objetos de conteúdo (mutação em lugar: toda a interface passa a exibir o idioma). */
export function setLocale(locale: Locale): void {
  current = locale;
  for (const [id, u] of Object.entries(UNITS)) apply(u as unknown as Record<string, unknown>, EN_UNITS[id]);
  for (const [id, b] of Object.entries(BUILDINGS)) apply(b as unknown as Record<string, unknown>, EN_BUILDINGS[id]);
  for (const [id, x] of Object.entries(TECHS)) apply(x as unknown as Record<string, unknown>, EN_TECHS[id]);
  for (const [id, p] of Object.entries(POWERS)) apply(p as unknown as Record<string, unknown>, EN_POWERS[id]);
  for (const [id, a] of Object.entries(ABILITIES)) apply(a as unknown as Record<string, unknown>, EN_ABILITIES[id]);
  for (const [id, g] of Object.entries(MINOR_GODS)) apply(g as unknown as Record<string, unknown>, EN_MINOR_GODS[id]);
  for (const [id, g] of Object.entries(MAJOR_GODS)) apply(g as unknown as Record<string, unknown>, EN_MAJOR_GODS[id]);
  AGES.forEach((a, i) => apply(a as unknown as Record<string, unknown>, EN_AGES[String(i)]));
  try { localStorage.setItem('aoe_locale', locale); } catch { /* ambiente sem localStorage */ }
}

export function detectLocale(): Locale {
  try { const saved = localStorage.getItem('aoe_locale'); if (saved === 'pt' || saved === 'en') return saved; } catch { /* ignore */ }
  try { return (navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en'; } catch { return 'pt'; }
}

export const LOCALE_NAMES: Record<Locale, string> = { pt: 'Português (Brasil)', en: 'English' };
