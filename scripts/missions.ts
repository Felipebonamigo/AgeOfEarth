// Roda cada missão da campanha sem jogador (só IA/gatilhos) para validar que não há erros de execução.
// Também valida o cenário JSON embutido (missão 1) e confere a paridade rápida (2 min) entre a versão JSON e a versão TS.
import { createGame, tick } from '../src/core/sim/game';
import { TICK_RATE } from '../src/core/constants';
import { SCENARIOS } from '../src/core/scenario/campaign';
import { validateScenario, type ScenarioFile } from '../src/core/scenario/schema';
import { gameConfigFor } from '../src/core/scenario/compile';
import m1Json from '../src/core/scenario/missions/m1_despertar.scenario.json';
import type { GameState } from '../src/core/types';

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

// ---- Cenário JSON: validação + paridade rápida com a versão TS ----
const file = m1Json as unknown as ScenarioFile;
const issues = validateScenario(file, { allowReserved: true });
if (issues.length > 0) { console.error('m1_despertar.scenario.json INVÁLIDO:'); for (const i of issues) console.error(`  ${i.path}: ${i.message}`); process.exit(1); }
console.log('📜 m1_despertar.scenario.json: válido');
function snapshot(s: GameState) {
  const sc = s.scenario!;
  return JSON.stringify({
    fired: sc.fired, objectives: sc.objectives, hidden: sc.hidden, outcome: sc.outcome,
    players: s.players.map((p) => ({ units: [...s.units.values()].filter((u) => u.owner === p.id && !u.dead).length, buildings: [...s.buildings.values()].filter((b) => b.owner === p.id && !b.dead).length, res: Object.fromEntries(Object.entries(p.resources).map(([k, v]) => [k, Math.round(v)])) })),
  });
}
const ts = createGame({ ...SCENARIOS[0].config, scenario: 'm1_despertar' });
const js = createGame(gameConfigFor(file));
for (let i = 0; i < 2 * 60 * TICK_RATE; i++) { tick(ts); tick(js); }
const same = snapshot(ts) === snapshot(js);
console.log(`📜 paridade m1 JSON × TS (2 min): ${same ? 'OK' : 'DIFERENTE'}`);
if (!same) { console.error('  TS  : ' + snapshot(ts)); console.error('  JSON: ' + snapshot(js)); process.exit(1); }
