// Condições de vitória: conquista (eliminar todos) ou maravilha mantida por 6 minutos.
import { BUILDINGS } from '../data';
import { KOTH_SECONDS } from '../constants';
import type { GameState } from '../types';
import { t } from '../../i18n';
import { kingAlive, teamNames } from './modes';
import { hasStartKit } from './game';

export function checkVictory(state: GameState): void {
  if (state.gameOver) return;
  for (const p of state.players) {
    if (!p.alive) continue;
    let hasBuilding = false, hasVillager = false;
    for (const b of state.buildings.values()) if (b.owner === p.id && !b.dead && !BUILDINGS[b.type].wall && !BUILDINGS[b.type].farm) { hasBuilding = true; break; }
    if (!hasBuilding) for (const u of state.units.values()) if (u.owner === p.id && !u.dead && (u.type === 'villager' || !hasStartKit(state.config, p.id))) { hasVillager = true; break; }   // sem kit inicial (mapa de batalha), qualquer unidade viva mantém o jogador
    const kingDead = state.config.mode === 'regicide' && !kingAlive(state, p.id);   // Regicídio: sem rei, o reino cai
    if (kingDead) state.events.push({ tick: state.tick, type: 'kingDied', player: p.id, text: t('ev.kingDied', { player: p.name }) });
    if ((!hasBuilding && !hasVillager) || kingDead) {
      p.alive = false; p.defeatedTick = state.tick;
      state.events.push({ tick: state.tick, type: 'defeated', player: p.id, text: t('ev.defeated', { player: p.name }) });
      // unidades restantes do derrotado desaparecem
      for (const u of state.units.values()) if (u.owner === p.id && !u.dead) { u.dead = true; state.effects.push({ type: 'death', x: u.x, y: u.y, owner: p.id, ttl: 20, total: 20, data: u.type }); }
    }
  }
  const alive = state.players.filter((p) => p.alive);
  const teams = new Set(alive.map((p) => p.team));
  if (alive.length === 0) { state.gameOver = true; state.winner = -1; return; }
  if (teams.size === 1 && state.players.length > 1) {
    const w = alive.find((p) => !p.isAI) ?? alive[0];
    state.gameOver = true; state.winner = w.id;
    state.events.push({ tick: state.tick, type: 'victory', player: w.id, text: alive.length > 1 ? t('ev.victoryAlliance', { players: alive.map((p) => p.name).join(' & ') }) : t('ev.victoryConquest', { player: w.name }) });
    return;
  }
  if (state.koth && state.koth.team !== -1 && state.koth.seconds >= KOTH_SECONDS) {
    const tm = state.koth.team;
    const w = alive.find((p) => p.team === tm && !p.isAI) ?? alive.find((p) => p.team === tm);
    if (w) { state.gameOver = true; state.winner = w.id; state.events.push({ tick: state.tick, type: 'victory', player: w.id, text: t('ev.victoryKoth', { players: teamNames(state, tm) }) }); return; }
  }
  for (const p of alive) if (p.wonderVictoryAt >= 0) {
    state.gameOver = true; state.winner = p.id;
    state.events.push({ tick: state.tick, type: 'victory', player: p.id, text: t('ev.victoryWonder', { player: p.name }) });
    return;
  }
}
