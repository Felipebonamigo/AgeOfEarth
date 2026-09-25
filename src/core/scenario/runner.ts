// Executa objetivos e gatilhos do cenário ativo; roda uma vez por segundo dentro do tick.
import { TICK_RATE } from '../constants';
import type { GameState } from '../types';
import type { ScenarioDef, ScenarioState, TriggerCtx } from './types';
import { SCENARIOS, HORDE } from './campaign';
import { t } from '../../i18n';

export function getScenario(id: string): ScenarioDef | undefined { return id === HORDE.id ? HORDE : SCENARIOS.find((s) => s.id === id); }

export function initScenarioState(def: ScenarioDef): ScenarioState {
  const objectives: Record<string, 'pending'> = {}; const hidden: Record<string, boolean> = {};
  for (const o of def.objectives) { objectives[o.id] = 'pending'; hidden[o.id] = !!o.hidden; }
  return { id: def.id, objectives, hidden, fired: [], outcome: 'playing', vars: {} };
}

export function runScenario(state: GameState): void {
  const sc = state.scenario; if (!sc || sc.outcome !== 'playing') return;
  const def = getScenario(sc.id); if (!def) return;
  const ctx: TriggerCtx = {
    say: (speaker, text, icon) => state.events.push({ tick: state.tick, type: 'dialogue', player: -1, text, data: `${icon ?? '🗣️'}|${speaker}` }),
    objective: (id, status) => { if (sc.objectives[id] !== status) { sc.objectives[id] = status; sc.hidden[id] = false; state.events.push({ tick: state.tick, type: 'objective', player: -1, text: `${status === 'done' ? '✅' : status === 'failed' ? '❌' : '📌'} ${def.objectives.find((o) => o.id === id)?.text ?? id}`, data: status }); } },
    reveal: (id) => { if (sc.hidden[id]) { sc.hidden[id] = false; state.events.push({ tick: state.tick, type: 'objective', player: -1, text: `📌 ${t('mission.newObjective')}: ${def.objectives.find((o) => o.id === id)?.text ?? id}`, data: 'pending' }); } },
    seconds: Math.floor((state.tick + 1) / TICK_RATE),   // inteiro: o runner roda no último tick de cada segundo
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
  if (def.victory(state)) { sc.outcome = 'victory'; state.gameOver = true; state.winner = state.config.players.findIndex((p) => !p.isAI); state.events.push({ tick: state.tick, type: 'victory', player: state.winner, text: t('ev.missionDone', { title: def.title }) }); }
  else if (def.defeat?.(state) || state.players.filter((p) => !p.isAI && p.team === state.players[state.config.players.findIndex((q) => !q.isAI)].team).every((p) => !p.alive)) { sc.outcome = 'defeat'; state.gameOver = true; state.winner = -2; state.events.push({ tick: state.tick, type: 'defeated', player: -1, text: t('ev.missionFailed', { title: def.title }) }); }
}
