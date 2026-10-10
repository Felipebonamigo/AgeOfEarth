// Era inicial e Era final da partida (E1): o mesmo seletor na partida rápida, no lobby e no Testar do editor.
import { AGES, MAX_AGE, clampEra } from '../core/data';
import type { GameMode } from '../core/constants';
import type { GameConfig } from '../core/types';
import { t } from '../i18n';

/** Era de início efetiva: 'auto' segue o modo (Deathmatch começa na II, como createGame). */
export function effectiveStartEra(start: string, mode?: GameMode): number { return start === 'auto' ? (mode === 'deathmatch' ? 1 : 0) : clampEra(Number(start)); }
export function eraChoiceValid(start: string, end: number, mode?: GameMode): boolean { return clampEra(end) >= effectiveStartEra(start, mode); }
/** Campos da GameConfig: 'auto' deixa startingAge de fora (vale o padrão do modo); a última Era deixa maxAge de fora. */
export function eraConfig(start: string, end: number): Pick<GameConfig, 'startingAge' | 'maxAge'> {
  const out: Pick<GameConfig, 'startingAge' | 'maxAge'> = {};
  if (start !== 'auto') out.startingAge = clampEra(Number(start));
  const e = clampEra(end); if (e < MAX_AGE) out.maxAge = e;
  return out;
}
/** <label> + <select> da Era inicial ('auto' | '0'…'7') e da final (índice). */
export function eraSelectsHtml(ids: { start: string; end: string }, cur: { start: string; end: number }, disabled = false): string {
  const dis = disabled ? ' disabled' : '';
  const starts = [`<option value="auto"${cur.start === 'auto' ? ' selected' : ''}>${t('main.startAgeAuto')}</option>`, ...AGES.map((a, n) => `<option value="${n}"${cur.start === String(n) ? ' selected' : ''}>${a.name}</option>`)].join('');
  const ends = AGES.map((a, n) => `<option value="${n}"${cur.end === n ? ' selected' : ''}>${a.name}</option>`).join('');
  return `<label>${t('main.startAge')}</label><select id="${ids.start}"${dis}>${starts}</select><label>${t('main.endAge')}</label><select id="${ids.end}"${dis}>${ends}</select>`;
}
