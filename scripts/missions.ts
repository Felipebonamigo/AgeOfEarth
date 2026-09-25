// Testes por missão (docs/STORY.md §7.2): para cada missão do registro da campanha × dificuldade, roda a viabilidade passiva
// (sem jogador) e o roteiro do jogador (IA no jogador 0 + passos de MISSION_SCRIPTS) e imprime uma linha por combinação:
//   m1_despertar [hard] passiva=em jogo@14m00s roteiro=vitória@10m46s objetivos={...}
// Também valida TODAS as missões do registro (TS e JSON: erros, lint, config, roteiro) e confere a paridade rápida (2 min)
// entre o m1 JSON e o m1 TS.
// ESTRITO por padrão: sai com erro se uma checagem quebrar, se a passiva vencer, se o roteiro lançar exceção ou se o roteiro
// não vencer dentro da janela da §4 (±30 %). Só uma exceção declarada no roteiro (MissionScript.exceptions, com motivo)
// dispensa a janela numa dificuldade — e ela é listada no fim da saída.
// Uso: npx tsx scripts/missions.ts [minutos da passiva=14] [ids separados por vírgula] [dificuldades=easy,normal,hard]
import { createGame, tick } from '../src/core/sim/game';
import { TICK_RATE } from '../src/core/constants';
import { CAMPAIGN, PROLOGUE } from '../src/core/scenario/campaign';
import { lintScenario, validateScenario, type CampaignDifficulty, type ScenarioFile } from '../src/core/scenario/schema';
import { gameConfigFor } from '../src/core/scenario/compile';
import { MISSION_SCRIPTS, failedChecks, fmtMinSec, fmtOutcome, runMissionScript, runPassive, scriptVerdict, staticMissionIssues } from '../src/core/scenario/testing';
import m1Json from '../src/core/scenario/missions/m1_despertar.scenario.json';
import type { GameState } from '../src/core/types';

const passiveMinutes = Number(process.argv[2] ?? 14);
const only = process.argv[3] ? process.argv[3].split(',') : null;
const diffs = (process.argv[4] ?? 'easy,normal,hard').split(',') as CampaignDifficulty[];
let failed = false;
const fail = (msg: string) => { failed = true; console.error('  ✗ ' + msg); };
const exceptions: string[] = [];

// ---- Validação estática de TODAS as missões do registro (TS e JSON) ----
for (const e of CAMPAIGN) {
  const issues = staticMissionIssues(e);
  console.log(`📜 ${e.id} (${e.source}): ${issues.length ? `${issues.length} problema(s)` : 'válida'}`);
  for (const i of issues) fail(`${e.id} ${i}`);
}

// ---- Passiva + roteiro por missão × dificuldade ----
for (const e of CAMPAIGN) {
  if (only && !only.includes(e.id)) continue;
  const script = MISSION_SCRIPTS[e.id];
  for (const d of diffs) {
    const t0 = performance.now();
    const p = runPassive(e.id, { minutes: passiveMinutes, difficulty: d });
    const r = runMissionScript(e.id, d);
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    const v = scriptVerdict(r, script);
    const win = script?.expect;
    const tag = v.inWindow ? '' : v.exception ? ', EXCEÇÃO DECLARADA' : ', FORA';
    console.log(`${e.id} [${d}] passiva=${fmtOutcome(p)} roteiro=${fmtOutcome(r)}${win ? ` (esperado ${fmtMinSec(Math.round(win[0] * 60))}–${fmtMinSec(Math.round(win[1] * 60))}${tag})` : ''} objetivos=${JSON.stringify(r.objectives)} invasões=${p.raids.total}/${r.raids.total} (${secs}s)`);
    for (const k of failedChecks(p)) fail(`${e.id} [${d}] passiva: checagem ${k}${p.error ? `\n${p.error}` : ''}`);
    if (p.outcome === 'victory') fail(`${e.id} [${d}] passiva: vitória sem jogador`);
    for (const k of failedChecks(r).filter((k) => k !== 'deterministic')) fail(`${e.id} [${d}] roteiro: checagem ${k}${r.error ? `\n${r.error}` : ''}`);
    if (!v.ok) fail(`${e.id} [${d}] roteiro: ${v.reason}`);
    else if (v.exception) exceptions.push(`${e.id} [${d}] ${v.reason} — exceção: ${v.exception}`);
  }
}

// ---- Cenário JSON do m1 (fora do registro): validação + paridade rápida com a versão TS ----
const file = m1Json as unknown as ScenarioFile;
const issues = validateScenario(file, { allowReserved: true });
if (issues.length > 0) { console.error('m1_despertar.scenario.json INVÁLIDO:'); for (const i of issues) console.error(`  ${i.path}: ${i.message}`); process.exit(1); }
const m1Lint = lintScenario(file);
console.log(`📜 m1_despertar.scenario.json: válido (lint: ${m1Lint.length} aviso(s))`);
for (const i of m1Lint) fail(`m1_despertar.scenario.json (lint) ${i.path}: ${i.message}`);
function snapshot(s: GameState) {
  const sc = s.scenario!;
  return JSON.stringify({
    fired: sc.fired, objectives: sc.objectives, hidden: sc.hidden, outcome: sc.outcome,
    players: s.players.map((p) => ({ alive: p.alive, units: [...s.units.values()].filter((u) => u.owner === p.id && !u.dead).length, buildings: [...s.buildings.values()].filter((b) => b.owner === p.id && !b.dead).length, res: Object.fromEntries(Object.entries(p.resources).map(([k, v]) => [k, Math.round(v)])) })),
  });
}
const ts = createGame({ ...PROLOGUE[0].config, scenario: 'm1_despertar' });
const js = createGame(gameConfigFor(file));
for (let i = 0; i < 2 * 60 * TICK_RATE; i++) { tick(ts); tick(js); }
const same = snapshot(ts) === snapshot(js);
console.log(`📜 paridade m1 JSON × TS (2 min): ${same ? 'OK' : 'DIFERENTE'}`);
if (!same) { console.error('  TS  : ' + snapshot(ts)); console.error('  JSON: ' + snapshot(js)); process.exit(1); }

if (exceptions.length) { console.log(`⚠️  Exceções declaradas (${exceptions.length}):`); for (const x of exceptions) console.log('  - ' + x); }
if (failed) { console.error('Missões: FALHOU'); process.exit(1); }
console.log(exceptions.length ? `Missões: OK (com ${exceptions.length} exceção(ões) declarada(s) acima)` : 'Missões: OK');
