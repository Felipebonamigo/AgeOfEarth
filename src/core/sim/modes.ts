// Modos de jogo: Rei da Colina (segurar a colina central sozinho) e Regicídio (proteger o rei). Roda uma vez por segundo.
import { KOTH_RADIUS, KOTH_SECONDS } from '../constants';
import { UNITS } from '../data';
import type { GameState } from '../types';
import { getRuntime } from './runtime';
import { t } from '../../i18n';

/** Nome(s) dos jogadores de um time, para mensagens. */
export function teamNames(state: GameState, team: number): string {
  return state.players.filter((p) => p.team === team && p.alive).map((p) => p.name).join(' & ') || '—';
}

export function updateKoth(state: GameState): void {
  const k = state.koth; if (!k) return;
  const rt = getRuntime(state);
  const teams = new Set<number>();
  const r2 = KOTH_RADIUS * KOTH_RADIUS;
  rt.hash.each(k.x, k.y, KOTH_RADIUS, (u) => {
    if (u.dead || u.inside !== -1) return;
    const d = UNITS[u.type];
    if (!d.tags.includes('military') || d.tags.includes('scout')) return;
    const dx = u.x - k.x, dy = u.y - k.y;
    if (dx * dx + dy * dy <= r2 && state.players[u.owner].alive) teams.add(state.players[u.owner].team);
  });
  if (teams.size === 1) {
    const tm = [...teams][0];
    if (k.team === tm) k.seconds++;
    else {
      k.team = tm; k.seconds = 1;
      state.events.push({ tick: state.tick, type: 'koth', player: -1, x: k.x, y: k.y, text: state.scenario ? t('ev.kothTakenScenario', { who: teamNames(state, tm) }) : t('ev.kothTaken', { who: teamNames(state, tm), min: Math.round(KOTH_SECONDS / 60) }) });   // em cenário a vitória nativa não roda: sem a promessa dos 4 min
    }
  } else if (k.team !== -1) {
    state.events.push({ tick: state.tick, type: 'koth', player: -1, x: k.x, y: k.y, text: teams.size === 0 ? t('ev.kothEmpty') : t('ev.kothContested') });
    k.team = -1; k.seconds = 0;
  }
}

export function kingAlive(state: GameState, player: number): boolean {
  for (const u of state.units.values()) if (u.owner === player && !u.dead && UNITS[u.type].tags.includes('king')) return true;
  return false;
}
