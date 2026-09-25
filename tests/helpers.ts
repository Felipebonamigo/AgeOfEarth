import { createGame, tick } from '../src/core/sim/game';
import type { GameConfig, GameState } from '../src/core/types';

export function quickGame(over: Partial<GameConfig> = {}, ai = false): GameState {
  return createGame({
    seed: 12345, mapSize: 'small',
    players: [
      { name: 'A', god: 'zeus', isAI: ai, difficulty: 'normal' },
      { name: 'B', god: 'hades', isAI: ai, difficulty: 'normal' },
    ],
    ...over,
  });
}
export function run(state: GameState, ticks: number) { for (let i = 0; i < ticks; i++) tick(state); }
