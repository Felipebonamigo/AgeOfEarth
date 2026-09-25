// Checagem de um mapa fixo (docs/EDITOR.md §5 Etapa 4): validação + alguns minutos de IA x IA, com o relatório que
// scripts/mapcheck.ts imprime e tests/data.test.ts exige para os mapas embutidos (sem erros, nenhuma IA parada, a
// partida não termina no primeiro minuto). Determinístico (semente fixa); a medição de tempo real fica no script.
import { TICK_RATE } from '../constants';
import { createGame, tick } from '../sim/game';
import type { GameConfig, GameState } from '../types';
import { mapHash, migrateMap, startResourcesOf, validateMap, type FixedMapData, type MapIssue, type StartResources } from './fixed';

export interface MapCheckPlayer { name: string; alive: boolean; age: number; villagers: number; idle: number; military: number; trained: number; built: number; pop: number; popCap: number; stalled: boolean }
export interface MapCheckReport {
  issues: MapIssue[]; errors: number; warnings: number; hash: number | null;
  resources: StartResources[];                 // tabela de recursos por início (raio 16)
  ticks: number; minutes: number; gameOver: boolean; units: number; buildings: number;
  players: MapCheckPlayer[];
  failures: string[];                          // motivos de reprovação (vazio = passou)
  state: GameState | null;
}
export interface MapCheckOpts { minutes?: number; seed?: number; difficulty?: 'easy' | 'normal' | 'hard' }

const GODS = ['zeus', 'poseidon', 'hades', 'zeus'];

/**
 * Valida o arquivo (tantos jogadores quantos inícios, máx. 4, todos IA) e, sem erros, roda `minutes` minutos de IA x IA.
 * Reprova: erro de validação, exceção no createGame/tick, partida encerrada no primeiro minuto ou IA parada (nada
 * treinado nem construído).
 */
export function checkMap(input: FixedMapData, opts: MapCheckOpts = {}): MapCheckReport {
  const minutes = opts.minutes ?? 2;
  const map = migrateMap(input);
  const nPlayers = Math.min(4, Math.max(2, map.starts?.length ?? 0));
  const issues = validateMap(map, { players: nPlayers, mode: 'conquest', ai: new Array(nPlayers).fill(true) });
  const errors = issues.filter((i) => i.level === 'error').length;
  const report: MapCheckReport = { issues, errors, warnings: issues.length - errors, hash: errors === 0 ? mapHash(map) : null, resources: startResourcesOf(map), ticks: 0, minutes: 0, gameOver: false, units: 0, buildings: 0, players: [], failures: [], state: null };
  if (errors > 0) { report.failures.push(`${errors} erro(s) de validação`); return report; }
  const players: GameConfig['players'] = [];
  for (let i = 0; i < nPlayers; i++) players.push({ name: `IA ${i + 1}`, god: GODS[i], isAI: true, difficulty: opts.difficulty ?? 'hard' });
  let state: GameState;
  try { state = createGame({ seed: opts.seed ?? 1, mapSize: 'medium', map, players, mode: 'conquest' }); }
  catch (e) { report.failures.push(`createGame: ${(e as Error).message}`); return report; }
  report.state = state;
  const total = minutes * 60 * TICK_RATE;
  try { for (let i = 0; i < total && !state.gameOver; i++) tick(state); }
  catch (e) { report.failures.push(`tick ${state.tick}: ${(e as Error).message}`); }
  report.ticks = state.tick; report.minutes = state.tick / TICK_RATE / 60; report.gameOver = state.gameOver;
  report.units = state.units.size; report.buildings = state.buildings.size;
  if (state.gameOver && state.tick < TICK_RATE * 60) report.failures.push('a partida acabou no primeiro minuto (jogadores sem base?)');
  for (const p of state.players) {
    let villagers = 0, military = 0, idle = 0;
    for (const u of state.units.values()) { if (u.owner !== p.id || u.dead) continue; if (u.type === 'villager') { villagers++; if (u.state === 'idle') idle++; } else military++; }
    const stalled = p.stats.unitsTrained === 0 && p.stats.buildingsBuilt === 0;
    if (stalled) report.failures.push(`${p.name} parada (nada treinado nem construído)`);
    report.players.push({ name: p.name, alive: p.alive, age: p.age, villagers, idle, military, trained: p.stats.unitsTrained, built: p.stats.buildingsBuilt, pop: p.pop, popCap: p.popCap, stalled });
  }
  return report;
}
