// Justiça de um mapa fixo entre inícios: roda partidas IA x IA com o MESMO deus em todos os inícios (espelho; deuses em
// rodízio só para curiosidade: o deus mais forte decide e esconde o viés de posição), várias sementes, e conta vitórias
// e minutos das idades por início. Nas partidas sem vencedor, conta quem está À FRENTE no fim (edifícios + unidades vivos
// do lado; empate exato não conta).
//
// Critério (docs/EDITOR.md): em ≥ 16 sementes em espelho, nenhum lado (time do arquivo ou início) com mais de 65 % das
// partidas decididas + à frente, nas duas ordens de inícios (--both). Com a ordem trocada, o jogador 0 começa no outro
// lado: separa o efeito de POSIÇÃO (o que o mapa e a IA fazem com o lugar) do efeito de ÍNDICE (ordem de atualização).
//
// Uso: npx tsx scripts/maps/fairness.ts <arquivo.map.json | id> [minutos=45] [sementes=1-16 (lista "1,2,5" ou
//      intervalo "1-16")] [deuses=zeus] [--swap | --both | --order 2,3,0,1] [--mirror-ai] [--jobs N] [--json saida.json]
//   --swap   ordem trocada: os jogadores de um time começam nos inícios do outro (1v1: [1,0]; sem times: ordem invertida)
//   --both   cada semente nas duas ordens (padrão e trocada) e totais por posição e por índice
//   --order  startOrder explícito (jogador i usa map.starts[order[i]])
//   --mirror-ai  a mesma personalidade de IA em todos (casas, Maravilha e deuses menores iguais: espelho exato); sem ela,
//            a personalidade vem do índice — (semente + 7·i) % 97 — e jogadores vizinhos pegam deuses menores opostos
//   --jobs   processos em paralelo (padrão 1); o resultado é o mesmo com qualquer N
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createGame, tick } from '../../src/core/sim/game';
import { TICK_RATE } from '../../src/core/constants';
import { migrateMap } from '../../src/core/map/fixed';

const USAGE = 'Uso: npx tsx scripts/maps/fairness.ts <arquivo.map.json | id> [minutos=45] [sementes=1-16] [deuses=zeus] [--swap | --both | --order 2,3,0,1] [--mirror-ai] [--jobs N] [--json saida.json]';
const argv = process.argv.slice(2);
const positional: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { positional.push(a); continue; }
  const [k, v] = a.slice(2).split('=', 2);
  if (v !== undefined) flags.set(k, v);
  else if (['order', 'jobs', 'json', 'worker'].includes(k)) flags.set(k, argv[++i] ?? '');
  else flags.set(k, '1');
}
const [fileArg, minArg, seedArg, godArg] = positional;
if (!fileArg) { console.error(USAGE); process.exit(1); }
const file = fs.existsSync(fileArg) ? fileArg : `src/core/data/maps/${fileArg}.map.json`;   // id de um mapa embutido
const map = migrateMap(JSON.parse(fs.readFileSync(file, 'utf8')));
const minutes = Number(minArg ?? 45);
const seeds = (seedArg ?? '1-16').split(',').flatMap((part) => { const m = /^(\d+)-(\d+)$/.exec(part); if (!m) return [Number(part)]; const out: number[] = []; for (let k = Number(m[1]); k <= Number(m[2]); k++) out.push(k); return out; });
const gods = (godArg ?? 'zeus').split(',');
const n = Math.min(4, map.starts.length);
const teams = map.startTeams && n === 4 ? map.startTeams : null;
/** Lado de um início: o time do arquivo ou o próprio início. */
const sideOfStart = (s: number) => (teams ? teams[s] : s);
const sides = teams ? [...new Set(teams)].sort((a, b) => a - b) : Array.from({ length: n }, (_, i) => i);
const sideName = (sd: number) => (teams ? `time ${sd + 1}` : `início ${sd + 1}`);
const identity = Array.from({ length: n }, (_, i) => i);

/** Ordem trocada: com dois times do mesmo tamanho, o k-ésimo início de um time vai para o k-ésimo do outro; 1v1 → [1,0]; senão invertida. */
function swapOrder(): number[] {
  if (teams && sides.length === 2) {
    const byTeam = sides.map((sd) => identity.filter((s) => teams[s] === sd));
    if (byTeam[0].length === byTeam[1].length) return identity.map((s) => { const t = sides.indexOf(teams[s]); return byTeam[1 - t][byTeam[t].indexOf(s)]; });
  }
  return identity.slice().reverse();
}
const explicit = flags.get('order')?.split(',').map(Number);
if (explicit && (explicit.length !== n || new Set(explicit).size !== n || explicit.some((s) => !Number.isInteger(s) || s < 0 || s >= map.starts.length))) { console.error(`--order precisa de ${n} inícios distintos em [0, ${map.starts.length})`); process.exit(1); }
const orders: number[][] = explicit ? [explicit] : flags.has('both') ? [identity, swapOrder()] : flags.has('swap') ? [swapOrder()] : [identity];

interface PlayerResult { start: number; side: number; idxSide: number; alive: boolean; ages: number[]; score: number }
interface RunResult { seed: number; order: number[]; winner: number; winSide: number; winIdxSide: number; minutes: number; players: PlayerResult[]; ahead: number; aheadIdx: number }

/** Lado com a maior soma (única); -1 em empate. */
function leader(score: Map<number, number>): number {
  let best = -1, bestV = -Infinity, tie = false;
  for (const [sd, v] of score) { if (v > bestV) { bestV = v; best = sd; tie = false; } else if (v === bestV) tie = true; }
  return tie ? -1 : best;
}

function runOne(seed: number, order: number[]): RunResult {
  const mirrorAi = flags.has('mirror-ai');
  const players = Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, god: gods[(i + seed) % gods.length], isAI: true, difficulty: 'normal' as const, team: teams ? teams[order[i]] : i, ...(mirrorAi ? { personality: (seed * 7) % 97 } : {}) }));
  const same = order.every((s, i) => s === i);
  const state = createGame({ seed, mapSize: 'medium', map, players, startOrder: same ? undefined : order });
  const reached: number[][] = players.map(() => []);
  for (let t = 0; t < minutes * 60 * TICK_RATE && !state.gameOver; t++) {
    tick(state);
    if (t % TICK_RATE === 0) for (const p of state.players) while (reached[p.id].length < p.age) reached[p.id].push(Math.round(state.time / 6) / 10);
  }
  const winner = state.gameOver ? state.winner : -1;
  // força no fim: edifícios + unidades vivos (guarnecidas contam)
  const count = new Array(n).fill(0);
  for (const b of state.buildings.values()) if (!b.dead && b.owner >= 0 && b.owner < n) count[b.owner]++;
  for (const u of state.units.values()) if (!u.dead && u.owner >= 0 && u.owner < n) count[u.owner]++;
  const res: PlayerResult[] = state.players.map((p, i) => ({ start: order[i], side: sideOfStart(order[i]), idxSide: sideOfStart(i), alive: p.alive, ages: reached[i], score: count[i] }));
  const bySide = (key: 'side' | 'idxSide') => { const m = new Map<number, number>(); for (const q of res) m.set(q[key], (m.get(q[key]) ?? 0) + q.score); return m; };
  return {
    seed, order, winner, minutes: Math.round(state.time / 6) / 10, players: res,
    winSide: winner >= 0 ? res[winner].side : -1, winIdxSide: winner >= 0 ? res[winner].idxSide : -1,
    ahead: winner >= 0 ? -1 : leader(bySide('side')), aheadIdx: winner >= 0 ? -1 : leader(bySide('idxSide')),
  };
}

const runs: { seed: number; order: number[] }[] = seeds.flatMap((seed) => orders.map((order) => ({ seed, order })));

// ---- processo filho: roda a sua parte e devolve JSON por linha ----
if (flags.has('worker')) {
  const [k, of] = flags.get('worker')!.split('/').map(Number);
  runs.forEach((r, i) => { if (i % of === k) process.stdout.write('@@' + JSON.stringify({ i, r: runOne(r.seed, r.order) }) + '\n'); });
  process.exit(0);
}

async function runAll(): Promise<RunResult[]> {
  const jobs = Math.max(1, Math.min(runs.length, Number(flags.get('jobs') ?? 1) || 1));
  if (jobs === 1) return runs.map((r) => runOne(r.seed, r.order));
  const out: RunResult[] = new Array(runs.length);
  const passArgs = argv.filter((a, i) => !(a === '--jobs' || argv[i - 1] === '--jobs' || a.startsWith('--jobs=') || a === '--json' || argv[i - 1] === '--json' || a.startsWith('--json=')));
  await Promise.all(Array.from({ length: jobs }, (_, k) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, process.argv[1], ...passArgs, '--worker', `${k}/${jobs}`], { stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (line.startsWith('@@')) { const o = JSON.parse(line.slice(2)) as { i: number; r: RunResult }; out[o.i] = o.r; } }
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`processo ${k} saiu com ${code}`))));
  })));
  return out;
}

const fmt = (v: number) => v.toFixed(1).replace('.', ',');
const results = await runAll();
const swapped = (o: number[]) => o.some((s, i) => s !== i);
for (const r of results) {
  const head = `semente ${r.seed}${swapped(r.order) ? ` [ordem ${r.order.join(',')}]` : ''}`;
  const verdict = r.winner >= 0 ? `vence ${sideName(r.winSide)} aos ${fmt(r.minutes)} min` : `sem vencedor aos ${minutes} min, à frente ${r.ahead >= 0 ? sideName(r.ahead) : 'ninguém (empate)'} (${sides.map((sd) => r.players.filter((q) => q.side === sd).reduce((a, q) => a + q.score, 0)).join(' × ')})`;
  console.log(`${head}: ${verdict} · ` + r.players.map((q, i) => `P${i + 1}@início ${q.start + 1} idades [${q.ages.map(fmt).join(';')}] ${q.alive ? 'vivo' : 'morto'}`).join(' · '));
}
// idades e vitórias por INÍCIO (posição), somando as ordens
const avg = (a: number[]) => (a.length ? fmt(a.reduce((x, y) => x + y, 0) / a.length) : '—');
for (let s = 0; s < n; s++) {
  const ages: number[][] = [[], [], [], []];
  let wins = 0, ahead = 0;
  for (const r of results) {
    const q = r.players.find((p) => p.start === s)!;
    q.ages.forEach((m, k) => ages[k].push(m));
    if (r.winSide === q.side) wins++;
    if (r.ahead === q.side) ahead++;
  }
  console.log(`início ${s + 1}: vitórias ${wins}/${results.length} · à frente ${ahead} · Clássica ${avg(ages[0])} · Heroica ${avg(ages[1])} · Mítica ${avg(ages[2])} · Titãs ${avg(ages[3])}`);
}

/** Aplica o critério a um eixo (posição ou índice): vitórias + à frente, nenhum lado com > 65 %. */
function tally(label: string, win: (r: RunResult) => number, lead: (r: RunResult) => number): boolean {
  const w = sides.map((sd) => results.filter((r) => win(r) === sd).length);
  const a = sides.map((sd) => results.filter((r) => lead(r) === sd).length);
  const decided = w.reduce((x, y) => x + y, 0), led = a.reduce((x, y) => x + y, 0);
  const c = w.map((x, k) => x + a[k]), total = decided + led;
  const worst = total ? Math.max(...c) / total : 0;
  const worstDecided = decided ? Math.max(...w) / decided : 0;
  const ok = total >= 8 && worst <= 0.65;
  console.log(`${label}: decididas ${decided}/${results.length} (${sides.map((sd, k) => `${sideName(sd)} ${w[k]}`).join(' × ')}${decided ? `, máx. ${Math.round(worstDecided * 100)} %` : ''}) · sem vencedor ${results.length - decided}, à frente ${sides.map((sd, k) => `${sideName(sd)} ${a[k]}`).join(' × ')} · decididas + à frente ${c.join(' × ')} → ${total < 8 ? 'amostra pequena' : worst > 0.65 ? `VIÉS (${Math.round(worst * 100)} % para um lado)` : `equilibrado (máx. ${Math.round(worst * 100)} %)`}`);
  return ok;
}
const posOk = tally('POSIÇÃO (lado do início)', (r) => r.winSide, (r) => r.ahead);
const anySwap = results.some((r) => swapped(r.order));
const idxOk = anySwap ? tally('ÍNDICE (lado dos jogadores na ordem padrão)', (r) => r.winIdxSide, (r) => r.aheadIdx) : true;
console.log(`critério (${minutes} min, ${seeds.length} sementes${orders.length > 1 ? ' × 2 ordens' : ''}${flags.has('mirror-ai') ? ', mesma personalidade de IA' : ''}): ${posOk && idxOk ? 'DENTRO' : 'FORA'}`);
if (flags.get('json')) fs.writeFileSync(flags.get('json')!, JSON.stringify({ map: file, minutes, seeds, gods, results }, null, 1));
