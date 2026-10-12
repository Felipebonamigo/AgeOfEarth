// Criaturas da E6 (docs/eras/E6-mitologia.md): o Colosso que vira Talos na Era VII e a Primavera de Perséfone. Determinístico.
import { MYTH_UPGRADES, UNITS } from '../data';
import type { GameState, Player, Unit } from '../types';
import { isPassable } from '../map/grid';
import { POWER_TUNING } from './divine';
import { spawnUnit } from './entities';
import { t } from '../../i18n';

/** Tipo que um treino de `unit` dá na Era `age` (o Colosso vira Talos a partir da Era VII). */
export function mythUpgradeOf(unit: string, age: number): string {
  const up = MYTH_UPGRADES[unit];
  return up && age >= up.age ? up.to : unit;
}

/** Ao subir de Era: as criaturas do jogador que ganham versão nova nesta Era se transformam (a vida proporcional vem do
 *  refreshMaxHp que quem chama roda depois). Devolve quantas mudaram. */
export function applyMythUpgrades(state: GameState, player: Player): number {
  let n = 0;
  const changed = new Set<string>();
  for (const u of state.units.values()) {
    if (u.owner !== player.id || u.dead) continue;
    const to = mythUpgradeOf(u.type, player.age);
    if (to === u.type) continue;
    changed.add(u.type);
    u.type = to; u.path = null; u.cooldown = 0; n++;
    if (u.inside === -1) state.effects.push({ type: 'evolve', x: u.x, y: u.y, owner: u.owner, ttl: 20, total: 20, src: to });
  }
  if (!player.isAI) for (const from of changed) state.events.push({ tick: state.tick, type: 'research', player: player.id, text: t('ev.mythUpgrade', { from: UNITS[from].plural, to: UNITS[MYTH_UPGRADES[from].to].plural }) });
  return n;
}

/** Primavera (Perséfone): um soldado humano morto dentro de uma Primavera ativa volta como Sombra de quem a lançou. */
export function springRaise(state: GameState, u: Unit, killerOwner: number): void {
  if (killerOwner === -1 || state.timed.length === 0) return;
  const d = UNITS[u.type];
  if (!d.tags.includes('human') || !d.tags.includes('military') || d.tags.includes('hero')) return;
  if (!isPassable(state.map, Math.floor(u.x), Math.floor(u.y))) return;
  for (const tm of state.timed) {
    if (tm.type !== 'spring' || state.tick >= tm.until || tm.x === undefined || tm.y === undefined || (tm.count ?? 0) >= POWER_TUNING.spring.maxShades) continue;
    if (!state.players[tm.owner]?.alive) continue;
    const r = tm.data ?? 6, dx = u.x - tm.x, dy = u.y - tm.y;
    if (dx * dx + dy * dy > r * r) continue;
    tm.count = (tm.count ?? 0) + 1;
    const sh = spawnUnit(state, tm.owner, 'shade', u.x, u.y);
    sh.stance = 'aggressive';
    state.effects.push({ type: 'spawn', x: u.x, y: u.y, ttl: 12, total: 12 });
    return;   // um morto vira uma Sombra só (a Primavera mais antiga da lista)
  }
}
