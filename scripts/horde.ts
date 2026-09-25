// Valida o Modo Horda sem interface: sem jogador, a cidade deve cair em algumas ondas (derrota), sem erros.
import { createGame, tick } from '../src/core/sim/game';
import { TICK_RATE } from '../src/core/constants';
import { HORDE } from '../src/core/scenario/campaign';
const state = createGame({ ...HORDE.config, scenario: 'horde' });
for (let i = 0; i < 30 * 60 * TICK_RATE && !state.gameOver; i++) tick(state);
const sc = state.scenario!;
console.log(`Horda: ${Math.round(state.time / 60)} min, resultado=${sc.outcome}, ondas disparadas=${sc.fired.filter((f) => f.startsWith('wave')).length}, inimigos vivos=${[...state.units.values()].filter((u) => u.owner === 1).length}, diálogos=${state.events.filter((e) => e.type === 'dialogue').length}`);
