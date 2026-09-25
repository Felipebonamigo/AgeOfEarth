// Roda cada missão da campanha sem jogador (só IA/gatilhos) para validar que não há erros de execução.
import { createGame, tick } from '../src/core/sim/game';
import { TICK_RATE } from '../src/core/constants';
import { SCENARIOS } from '../src/core/scenario/campaign';

const minutes = Number(process.argv[2] ?? 14);
for (const m of SCENARIOS) {
  const state = createGame({ ...m.config, scenario: m.id });
  const t0 = Date.now();
  for (let i = 0; i < minutes * 60 * TICK_RATE && !state.gameOver; i++) tick(state);
  const sc = state.scenario!;
  const me = state.players[0];
  console.log(`${m.icon} ${m.title}: ${Math.round(state.time / 60)} min, ${((Date.now() - t0) / 1000).toFixed(1)}s reais, resultado=${sc.outcome}, objetivos=${JSON.stringify(sc.objectives)}, gatilhos=[${sc.fired.join(',')}], jogador: vivo=${me.alive} edif=${[...state.buildings.values()].filter((b) => b.owner === 0).length} unid=${[...state.units.values()].filter((u) => u.owner === 0).length}`);
  const dl = state.events.filter((e) => e.type === 'dialogue').length;
  console.log(`   diálogos=${dl}, inimigos vivos=${[...state.units.values()].filter((u) => u.owner === 1).length}, edifícios inimigos=${[...state.buildings.values()].filter((b) => b.owner === 1).map((b) => b.type + (b.complete ? '' : '*')).join(',')}`);
}
