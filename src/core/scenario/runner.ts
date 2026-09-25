// Executa objetivos e gatilhos do cenário ativo; roda uma vez por segundo dentro do tick.
import { TICK_RATE } from '../constants';
import type { GameState } from '../types';
import type { ScenarioDef, ScenarioState, TriggerCtx } from './types';
import { SCENARIOS } from './campaign';

export function getScenario(id: string): ScenarioDef | undefined { return SCENARIOS.find((s) => s.id === id); }

export function initScenarioState(def: ScenarioDef): ScenarioState {
  const objectives: Record<string, 'pending'> = {}; const hidden: Record<string, boolean> = {};
  for (const o of def.objectives) { objectives[o.id] = 'pending'; hidden[o.id] = !!o.hidden; }
  return { id: def.id, objectives, hidden, fired: [], outcome: 'playing' };
}

export function runScenario(state: GameState): void {
  const sc = state.scenario; if (!sc || sc.outcome !== 'playing') return;
  const def = getScenario(sc.id); if (!def) return;
  const ctx: TriggerCtx = {
    say: (speaker, text, icon) => state.events.push({ tick: state.tick, type: 'dialogue', player: -1, text, data: `${icon ?? '🗣️'}|${speaker}` }),
    objective: (id, status) => { if (sc.objectives[id] !== status) { sc.objectives[id] = status; sc.hidden[id] = false; state.events.push({ tick: state.tick, type: 'objective', player: -1, text: `${status === 'done' ? '✅' : status === 'failed' ? '❌' : '📌'} ${def.objectives.find((o) => o.id === id)?.text ?? id}`, data: status }); } },
    reveal: (id) => { if (sc.hidden[id]) { sc.hidden[id] = false; state.events.push({ tick: state.tick, type: 'objective', player: -1, text: `📌 Novo objetivo: ${def.objectives.find((o) => o.id === id)?.text ?? id}`, data: 'pending' }); } },
    seconds: state.tick / TICK_RATE,
    fired: (id) => sc.fired.includes(id),
  };
  for (const o of def.objectives) {
    if (!o.check || sc.objectives[o.id] !== 'pending' || sc.hidden[o.id]) continue;
    const st = o.check(state);
    if (st !== 'pending') ctx.objective(o.id, st);
  }
  for (const t of def.triggers) {
    if (!t.repeat && sc.fired.includes(t.id)) continue;
    if (!t.when(state, ctx)) continue;
    if (!t.repeat) sc.fired.push(t.id);
    t.then(state, ctx);
  }
  if (def.victory(state)) { sc.outcome = 'victory'; state.gameOver = true; state.winner = state.config.players.findIndex((p) => !p.isAI); state.events.push({ tick: state.tick, type: 'victory', player: state.winner, text: `Missão cumprida: ${def.title}!` }); }
  else if (def.defeat?.(state) || !state.players[state.config.players.findIndex((p) => !p.isAI)].alive) { sc.outcome = 'defeat'; state.gameOver = true; state.winner = -2; state.events.push({ tick: state.tick, type: 'defeated', player: -1, text: `Missão falhou: ${def.title}.` }); }
}
