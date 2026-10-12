// Maravilhas (docs/ERAS.md §9; docs/eras/E5-E7-comercio-maravilhas.md): unicidade no mapa, pontos e vitória, e os efeitos
// que um Effect não expressa (Delfos, Mausoléu, Trono). Determinístico: desempates por tick e pontos, nunca pelo índice
// do jogador.
import { DELPHI_ORACLE_EVERY, DELPHI_ORACLE_SECONDS, MAUSOLEUM_RESPAWN_SECONDS, TICK_RATE, WONDER_POINTS_HOLD_SECONDS, WONDER_POINTS_MAX_TARGET, WONDER_VICTORIES, WONDER_VICTORY_SECONDS, type WonderVictory } from '../constants';
import { BUILDINGS, CLASSIC_WONDERS, MAX_AGE, UNITS } from '../data';
import type { Building, GameConfig, GameState, Unit } from '../types';
import { findSpawnTile, recomputePop, spawnUnit } from './entities';
import { getBuildingStats } from './modifiers';
import { refund } from './economy';
import { allWondersOn, buildingAgeOf } from './restrictions';
import { teamNames } from './modes';
import { setNavalOpen } from '../map/naval';
import { invalidateComponents } from '../map/components';
import { t } from '../../i18n';
import * as combatNs from './combat';   // ciclo combat ↔ wonders: só usado dentro de funções

export function wonderVictoryMode(config: GameConfig): WonderVictory {
  if (!allWondersOn(config)) return 'hold';   // cenário: a regra de hoje (o roteiro decide a vitória)
  return (WONDER_VICTORIES as string[]).includes(config.wonderVictory as string) ? config.wonderVictory! : 'points';
}
export function wonderPoints(type: string): number { const d = BUILDINGS[type]; return d?.wonder ? d.age + 1 : 0; }
/** Pontos das maravilhas prontas dos jogadores vivos do time. */
export function teamWonderPoints(state: GameState, team: number): number {
  let n = 0;
  for (const b of state.buildings.values()) {
    if (b.dead || !b.complete || !BUILDINGS[b.type].wonder) continue;
    const o = state.players[b.owner];
    if (o && o.alive && o.team === team) n += wonderPoints(b.type);
  }
  return n;
}
/** Meta (D15): config.wonderPointsToWin ou min(20, ceil(40% dos pontos até a Era final)) — conta inteira (×2/5). */
export function wonderPointsTarget(state: GameState): number {
  const c = state.config.wonderPointsToWin;
  if (typeof c === 'number' && Number.isFinite(c) && c >= 1) return Math.floor(c);
  const maxEra = Math.max(0, Math.min(MAX_AGE, Math.floor(state.config.maxAge ?? MAX_AGE)));
  let sum = 0;
  for (const d of Object.values(BUILDINGS)) if (d.wonder && d.age <= maxEra) sum += d.age + 1;
  return Math.max(1, Math.min(WONDER_POINTS_MAX_TARGET, Math.ceil((sum * 2) / 5)));
}
/** Maravilha pronta e viva daquele tipo (de qualquer dono) ou null. */
export function wonderTakenBy(state: GameState, type: string): Building | null {
  for (const b of state.buildings.values()) if (!b.dead && b.complete && b.type === type) return b;
  return null;
}
export function hasWonder(state: GameState, owner: number, type: string): boolean {
  for (const b of state.buildings.values()) if (!b.dead && b.complete && b.owner === owner && b.type === type) return true;
  return false;
}
/** O painel de construção e a tecla M mostram esta maravilha? (D22) */
export function wonderListed(state: GameState, playerId: number, type: string): boolean {
  const d = BUILDINGS[type];
  if (!d?.wonder) return true;
  const p = state.players[playerId];
  if (!allWondersOn(state.config)) return CLASSIC_WONDERS.includes(type) && buildingAgeOf(state.config, type) <= p.age + 1;
  return d.age <= p.age && !wonderTakenBy(state, type);
}

/** Índices dos tiles da pegada do edifício. */
export function footprint(state: GameState, b: Building): number[] {
  const out: number[] = [];
  for (let y = b.ty; y < b.ty + b.h; y++) for (let x = b.tx; x < b.tx + b.w; x++) out.push(y * state.map.w + x);
  return out;
}

/** Chamado por onBuildingComplete quando uma maravilha fica pronta (antes do recomputeMods). */
export function onWonderComplete(state: GameState, b: Building): void {
  const def = BUILDINGS[b.type];
  const owner = state.players[b.owner];
  state.territoryDirty = true;   // fronteiras +N (Porta dos Leões, Colosso)
  if (def.navalPassable) { setNavalOpen(state.map, footprint(state, b), true); invalidateComponents(state.map); }   // Canal de Corinto: abre a passagem naval (também em cenário)
  if (!allWondersOn(state.config)) return;
  // D18: as obras dos outros desabam e devolvem o custo
  for (const x of [...state.buildings.values()]) {
    if (x === b || x.dead || x.complete || x.type !== b.type) continue;
    const loser = state.players[x.owner];
    if (!x.unpaid) refund(loser, getBuildingStats(state, loser, x.type).cost, 1);
    combatNs.destroyBuilding(state, x, -1);
    if (!loser.isAI) state.events.push({ tick: state.tick, type: 'wonderRaceLost', player: x.owner, x: x.x, y: x.y, text: t('ev.wonderRaceLost', { player: owner.name, name: def.name }) });
  }
  if (b.type === 'wonder_olympus_throne') {   // D19: Trono do Olimpo
    for (const ps of owner.powers) { ps.used = false; ps.charges = (ps.charges ?? 0) + 1; }
    state.events.push({ tick: state.tick, type: 'throne', player: b.owner, x: b.x, y: b.y, text: t('ev.throne', { player: owner.name }) });
  }
}

/** killUnit: herói morto em combate com um Mausoléu pronto do dono entra na fila de renascimento. */
export function queueHeroRespawn(state: GameState, u: Unit, killerOwner: number): void {
  const def = UNITS[u.type];
  if (!def.tags.includes('hero') || def.tags.includes('king') || killerOwner < 0 || killerOwner === u.owner) return;
  const p = state.players[u.owner];
  if (!p.alive || !hasWonder(state, u.owner, 'wonder_mausoleum') || p.respawns.some((r) => r.type === u.type)) return;
  p.respawns.push({ type: u.type, at: state.tick + MAUSOLEUM_RESPAWN_SECONDS * TICK_RATE });
}

function ownTemple(state: GameState, owner: number): Building | null {
  let best: Building | null = null;
  for (const b of state.buildings.values()) if (b.owner === owner && !b.dead && b.complete && BUILDINGS[b.type].worship && (!best || b.id < best.id)) best = b;
  return best;   // menor id: só os edifícios do próprio jogador, sem viés de posição
}

/** Uma vez por segundo (game.ts, logo depois de economySecond): contagens de vitória, Delfos e Mausoléu. */
export function wonderSecond(state: GameState): void {
  const mode = wonderVictoryMode(state.config);
  if (mode === 'hold') {   // a regra de hoje: uma maravilha pronta há 6 min
    for (const b of state.buildings.values()) {
      if (b.dead || !b.complete || !BUILDINGS[b.type].wonder || b.wonderStart < 0) continue;
      const p = state.players[b.owner];
      if (p.wonderVictoryAt < 0 && state.tick - b.wonderStart >= WONDER_VICTORY_SECONDS * TICK_RATE) p.wonderVictoryAt = state.tick;
    }
  } else if (mode === 'points' && !state.scenario) {
    const target = wonderPointsTarget(state);
    const teams = [...new Set(state.players.map((p) => p.team))].sort((a, b) => a - b);
    for (const team of teams) {
      const members = state.players.filter((p) => p.team === team);
      const pts = teamWonderPoints(state, team);
      const holding = members.some((p) => p.wonderHoldStart >= 0);
      if (pts >= target && !holding) {
        for (const p of members) p.wonderHoldStart = state.tick;
        state.events.push({ tick: state.tick, type: 'wonderRace', player: members[0].id, text: t('ev.wonderRace', { players: teamNames(state, team), n: pts, s: WONDER_POINTS_HOLD_SECONDS }) });
      } else if (pts < target && holding) {
        for (const p of members) p.wonderHoldStart = -1;
        state.events.push({ tick: state.tick, type: 'wonderRaceStop', player: members[0].id, text: t('ev.wonderRaceStop', { players: teamNames(state, team) }) });
      }
    }
  }
  // Delfos: Oráculo grátis a cada DELPHI_ORACLE_EVERY s (exatamente uma chamada por período cai na janela de 1 s)
  const P = DELPHI_ORACLE_EVERY * TICK_RATE;
  for (const b of state.buildings.values()) {
    if (b.dead || !b.complete || b.type !== 'wonder_delphi' || b.wonderStart < 0) continue;
    const e = state.tick - b.wonderStart;
    if (e < P || e % P >= TICK_RATE) continue;
    const p = state.players[b.owner];
    p.revealUntil = Math.max(p.revealUntil, state.tick + DELPHI_ORACLE_SECONDS * TICK_RATE);
    if (!p.isAI) state.events.push({ tick: state.tick, type: 'oracleFree', player: p.id, text: t('ev.oracleFree', { s: DELPHI_ORACLE_SECONDS }) });
  }
  // Mausoléu: heróis que renascem (sem Templo, esperam; se já existe um vivo do tipo, a entrada sai)
  for (const p of state.players) {
    if (!p.alive || p.respawns.length === 0) continue;
    const keep: { type: string; at: number }[] = [];
    for (const r of p.respawns) {
      if (r.at > state.tick) { keep.push(r); continue; }
      const temple = ownTemple(state, p.id);
      if (!temple) { keep.push(r); continue; }
      let alive = false;
      for (const u of state.units.values()) if (u.owner === p.id && !u.dead && u.type === r.type) { alive = true; break; }
      if (alive) continue;
      const spot = findSpawnTile(state, temple);
      const h = spawnUnit(state, p.id, r.type, spot.x, spot.y);
      h.stance = 'aggressive';
      state.effects.push({ type: 'spawn', x: spot.x, y: spot.y, ttl: 12, total: 12 });
      if (!p.isAI) state.events.push({ tick: state.tick, type: 'heroReborn', player: p.id, x: spot.x, y: spot.y, text: t('ev.heroReborn', { name: UNITS[r.type].name }) });
    }
    p.respawns = keep;
    recomputePop(state, p);
  }
}

/** Time vencedor por maravilha agora, ou null (D17). Só fora de cenário (declareWinner). */
export function wonderWinner(state: GameState): number | null {
  const mode = wonderVictoryMode(state.config);
  if (mode === 'off') return null;
  let bestTick = Infinity; let teams: number[] = [];
  if (mode === 'hold') {
    for (const p of state.players) {
      if (!p.alive || p.wonderVictoryAt < 0) continue;
      if (p.wonderVictoryAt < bestTick) { bestTick = p.wonderVictoryAt; teams = [p.team]; }
      else if (p.wonderVictoryAt === bestTick && !teams.includes(p.team)) teams.push(p.team);
    }
  } else {
    const target = wonderPointsTarget(state);
    for (const p of state.players) {
      if (!p.alive || p.wonderHoldStart < 0 || state.tick - p.wonderHoldStart < WONDER_POINTS_HOLD_SECONDS * TICK_RATE) continue;
      if (teamWonderPoints(state, p.team) < target) continue;
      if (p.wonderHoldStart < bestTick) { bestTick = p.wonderHoldStart; teams = [p.team]; }
      else if (p.wonderHoldStart === bestTick && !teams.includes(p.team)) teams.push(p.team);
    }
  }
  if (teams.length === 0) return null;
  if (teams.length === 1) return teams[0];
  const pts = teams.map((tm) => teamWonderPoints(state, tm));
  const max = Math.max(...pts);
  const top = teams.filter((_tm, i) => pts[i] === max);
  return top.length === 1 ? top[0] : null;   // empate total: ninguém vence neste segundo
}
