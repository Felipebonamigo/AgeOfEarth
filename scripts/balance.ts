// Balanceamento: roda várias partidas IA x IA e imprime quando cada IA avança de Idade, ondas e vencedor.
// Uso: npm run balance [minutos=30] [sementes=1,2,3 | 1-18] -- [--map arquivo.map.json] [--jobs N] [--json saída] [--targets] [--stalls-only]
//        [--diff easy|normal|hard|brutal] [--map-type <tipo>] [--size small|medium|large]
// (o npm come as opções antes de um `--`: use sempre `-- --jobs 3 …`). O resultado não depende de --jobs.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createGame, tick } from '../src/core/sim/game';
import { MAP_SIZES, MAP_TYPES, TICK_RATE, type MapSize, type MapType } from '../src/core/constants';
import { AGES, BUILDINGS, UNITS } from '../src/core/data';
import { canAdvanceAge } from '../src/core/sim/commands';
import { maxAgeOf } from '../src/core/sim/restrictions';
import { t } from '../src/i18n';
import { migrateMap, validateMap, type FixedMapData } from '../src/core/map/fixed';

const ERA_TARGET_MIN = [0, 4, 9, 14, 20, 26, 33, 40];
const ERA_TOLERANCE_MIN = [0, 1, 1.5, 1.5, 2, 2, 2.5, 3];
const ERA_MIN_REACH = [0, 0.8, 0.8, 0.8, 0.8, 0.7, 0.7, 0.6];

interface PlayerRun { name: string; alive: boolean; died: number | null; arrivals: number[]; age: number; waves: number; kills: number; losses: number; razed: number; territory: number; techs: number; evo: number; bless: number; wonders: number; titan: boolean; ships: number; caravans: number }
interface Flag { min: number; player: string; kind: 'PARADA' | 'TRAVADA' | 'TRAVADA-RECURSO' | 'ACUMULANDO' | 'SEM-ONDAS'; detail: string }
interface SeedRun { seed: number; minutes: number; ms: number; msPerTick: number; winner: string | null; endMin: number | null; at5: string; flags: Flag[]; players: PlayerRun[] }

const USAGE = 'Uso: npm run balance [minutos] [sementes|1-18] -- [--map arquivo.map.json] [--jobs N] [--json saída] [--targets] [--stalls-only] [--diff easy|normal|hard|brutal] [--map-type tipo] [--size small|medium|large]';
const fail = (m: string): never => { console.error(m + '\n' + USAGE); process.exit(1); };
const argv = process.argv.slice(2);
const flags = new Map<string, string>(); const positional: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const [k0, v0] = a.slice(2).split('=', 2);
    if (['map', 'jobs', 'json', 'diff', 'map-type', 'size', 'worker'].includes(k0)) flags.set(k0, v0 ?? argv[++i] ?? '');
    else if (['targets', 'stalls-only'].includes(k0)) flags.set(k0, '1');
    else fail(`Opção desconhecida: ${a}`);
  } else positional.push(a);
}
const minutes = Number(positional[0] ?? 30);
if (!Number.isFinite(minutes) || minutes <= 0) fail('Minutos inválidos.');
function parseSeeds(s: string): number[] {
  const out: number[] = [];
  for (const part of s.split(',')) {
    const m = /^(\d+)-(\d+)$/.exec(part.trim());
    if (m) { for (let v = Number(m[1]); v <= Number(m[2]); v++) out.push(v); } else out.push(Number(part));
  }
  if (!out.length || out.some((v) => !Number.isFinite(v))) fail('Sementes inválidas.');
  return out;
}
const seeds = parseSeeds(positional[1] ?? '1,2,3');
const diff = (flags.get('diff') ?? 'normal') as 'easy' | 'normal' | 'hard' | 'brutal';
if (!['easy', 'normal', 'hard', 'brutal'].includes(diff)) fail(`--diff inválido: ${diff}`);
const mapType = (flags.get('map-type') ?? 'continental') as MapType;
if (!MAP_TYPES.includes(mapType)) fail(`--map-type inválido: ${mapType} (use ${MAP_TYPES.join(', ')})`);
const size = (flags.get('size') ?? 'medium') as MapSize;
if (!(size in MAP_SIZES)) fail(`--size inválido: ${size}`);
const mapFile = flags.get('map');
const isWorker = flags.has('worker');
let map: FixedMapData | undefined;
if (mapFile) {
  try { map = migrateMap(JSON.parse(fs.readFileSync(mapFile, 'utf8'))); } catch (e) { fail(`Mapa fixo inválido (${mapFile}): ${(e as Error).message}`); }
  const errors = validateMap(map!, { players: Math.min(4, map!.starts.length) }).filter((i) => i.level === 'error');
  if (errors.length) { for (const i of errors) console.error(`  erro ${i.code}`); process.exit(1); }
  if (!isWorker) console.log(`Mapa fixo: ${map!.name ?? map!.id} ${map!.w}x${map!.h}, ${map!.starts.length} inícios`);
}
const gods = ['zeus', 'poseidon', 'hades', 'zeus'];
const nPlayers = map ? Math.min(4, Math.max(2, map.starts.length)) : 3;

function runOne(seed: number): SeedRun {
  const state = createGame({ seed, mapSize: size, mapType, map, players: gods.slice(0, nPlayers).map((g, i) => ({ name: `${g}${i}`, god: g, isAI: true, difficulty: diff })) });
  const arrivals: Record<number, number[]> = {}; for (const p of state.players) arrivals[p.id] = [0];
  const died: Record<number, number | null> = {}; for (const p of state.players) died[p.id] = null;
  const lastCheck: Record<number, { acc: boolean; trained: number; built: number }> = {};
  const flagsOut: Flag[] = [];
  const t0 = Date.now();
  let at5 = '';
  const maxTick = minutes * 60 * TICK_RATE;
  for (let i = 0; i < maxTick && !state.gameOver; i++) {
    tick(state);
    for (const p of state.players) {
      while (arrivals[p.id].length <= p.age) arrivals[p.id].push(Math.round(state.time / 6) / 10);
      if (!p.alive && died[p.id] === null) died[p.id] = p.defeatedTick / TICK_RATE / 60;
    }
    // aos 5 min: nenhuma IA pode estar parada (nada treinado/construído desde o início ou todos os cidadãos ociosos)
    if (state.tick === 5 * 60 * TICK_RATE) at5 = state.players.map((p) => {
      let vill = 0, idle = 0;
      for (const u of state.units.values()) if (u.owner === p.id && !u.dead && u.type === 'villager') { vill++; if (u.state === 'idle') idle++; }
      const stalled = (p.stats.unitsTrained === 0 && p.stats.buildingsBuilt === 0) || (vill > 0 && idle === vill);
      return `${p.name} cidadãos=${vill} (ociosos ${idle}) treinados=${p.stats.unitsTrained} construídos=${p.stats.buildingsBuilt}${stalled ? ' <-- PARADA' : ''}`;
    }).join(' · ');
    // detectores de partida longa, a cada 10 min de jogo (E10-5)
    if (state.tick % (600 * TICK_RATE) === 0) {
      const min = state.tick / TICK_RATE / 60;
      for (const p of state.players) {
        if (!p.alive) continue;
        let vill = 0, idle = 0;
        for (const u of state.units.values()) if (u.owner === p.id && !u.dead && u.type === 'villager') { vill++; if (u.state === 'idle') idle++; }
        const prev = lastCheck[p.id];
        const noWork = prev && p.stats.unitsTrained === prev.trained && p.stats.buildingsBuilt === prev.built && p.pop < p.popCap - 5;
        if (vill > 0 && idle === vill) flagsOut.push({ min, player: p.name, kind: 'PARADA', detail: `${vill} cidadãos, todos ociosos` });
        else if (noWork) flagsOut.push({ min, player: p.name, kind: 'PARADA', detail: `nada treinado nem construído em 10 min (pop ${p.pop}/${p.popCap})` });
        // TRAVADA: mesma Era há ≥ 12 min
        const ageStart = arrivals[p.id][p.age] ?? 0;
        if (p.age < maxAgeOf(state, p.id) && min - ageStart >= 12) {
          const r = canAdvanceAge(state, p);
          if (r.ok) flagsOut.push({ min, player: p.name, kind: 'TRAVADA', detail: `na Era ${p.age + 1} desde ${ageStart.toFixed(1)} min, pode avançar e não avança` });
          else if (r.reason === t('err.advancing')) { /* avanço já na fila: não é trava */ }
          else if (r.reason === t('err.noResources')) flagsOut.push({ min, player: p.name, kind: 'TRAVADA-RECURSO', detail: `na Era ${p.age + 1} desde ${ageStart.toFixed(1)} min: ${r.reason}` });
          else flagsOut.push({ min, player: p.name, kind: 'TRAVADA', detail: `na Era ${p.age + 1} desde ${ageStart.toFixed(1)} min: ${r.reason}` });
        }
        const acc = (['food', 'wood', 'stone', 'gold'] as const).some((r) => p.resources[r] > 6000);
        if (acc && prev?.acc) flagsOut.push({ min, player: p.name, kind: 'ACUMULANDO', detail: `food=${Math.round(p.resources.food)} wood=${Math.round(p.resources.wood)} stone=${Math.round(p.resources.stone)} gold=${Math.round(p.resources.gold)}` });
        if (min === 30 && (p.ai?.waves ?? 0) === 0) flagsOut.push({ min, player: p.name, kind: 'SEM-ONDAS', detail: 'nenhuma onda de ataque aos 30 min' });
        lastCheck[p.id] = { acc, trained: p.stats.unitsTrained, built: p.stats.buildingsBuilt };
      }
    }
  }
  const ms = Date.now() - t0;
  const players: PlayerRun[] = state.players.map((p) => {
    let ships = 0, caravans = 0;
    for (const u of state.units.values()) if (u.owner === p.id && !u.dead) { if (UNITS[u.type].cls === 'ship') ships++; if (u.type === 'caravan') caravans++; }
    let wonders = 0;
    for (const b of state.buildings.values()) if (b.owner === p.id && !b.dead && b.complete && BUILDINGS[b.type].wonder) wonders++;
    return {
      name: p.name, alive: p.alive, died: died[p.id], arrivals: arrivals[p.id], age: p.age, waves: p.ai?.waves ?? 0, kills: p.stats.kills, losses: p.stats.losses, razed: p.stats.razed,
      territory: p.territoryTiles, techs: p.techs.length, evo: p.techs.filter((x) => x.startsWith('evo_')).length, bless: p.techs.filter((x) => x.startsWith('blessing')).length,
      wonders, titan: !!p.titanSpawned, ships, caravans,
    };
  });
  return { seed, minutes: Math.round(state.time / 60), ms, msPerTick: ms / Math.max(1, state.tick), winner: state.gameOver && state.winner >= 0 ? state.players[state.winner].name : null, endMin: state.gameOver ? state.time / 60 : null, at5, flags: flagsOut, players };
}

// ---- processo filho: roda a sua parte e devolve JSON por linha ----
if (isWorker) {
  const [k, of] = flags.get('worker')!.split('/').map(Number);
  seeds.forEach((s, i) => { if (i % of === k) process.stdout.write('@@' + JSON.stringify({ i, r: runOne(s) }) + '\n'); });
  process.exit(0);
}

async function runAll(): Promise<SeedRun[]> {
  const jobs = Math.max(1, Math.min(seeds.length, Number(flags.get('jobs') ?? 1) || 1));
  if (jobs === 1) return seeds.map(runOne);
  const out: SeedRun[] = new Array(seeds.length);
  const passArgs = argv.filter((a, i) => !(a === '--jobs' || argv[i - 1] === '--jobs' || a.startsWith('--jobs=') || a === '--json' || argv[i - 1] === '--json' || a.startsWith('--json=')));
  await Promise.all(Array.from({ length: jobs }, (_, k) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, process.argv[1], ...passArgs, '--worker', `${k}/${jobs}`], { stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (line.startsWith('@@')) { const o = JSON.parse(line.slice(2)) as { i: number; r: SeedRun }; out[o.i] = o.r; } }
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`processo ${k} saiu com ${code}`))));
  })));
  return out;
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))] : NaN; };
const f1 = (v: number) => v.toFixed(1);

const results = await runAll();
const stallsOnly = flags.has('stalls-only');
if (!stallsOnly) {
  for (const r of results) {
    console.log(`\n=== semente ${r.seed} · ${r.minutes} min de jogo em ${(r.ms / 1000).toFixed(1)}s reais · ${r.msPerTick.toFixed(2)} ms/tick ===`);
    if (r.at5) console.log(`aos 5 min: ${r.at5}`);
    for (const p of r.players) {
      console.log(`${p.name.padEnd(10)} ${p.alive ? 'vivo ' : 'morto'} idade=${AGES[p.age].short.padEnd(8)} idades aos minutos [${p.arrivals.map((m) => Math.round(m)).join(', ')}] ondas=${p.waves} abates=${p.kills} perdas=${p.losses} destruídos=${p.razed} território=${p.territory} techs=${p.techs} caravanas=${p.caravans} maravilhas=${p.wonders}`);
    }
    for (const p of r.players) console.log(`marcos: ${p.name} evo=${p.evo} bless=${p.bless} mar=${p.wonders} tita=${p.titan ? 'sim' : 'não'} nav=${p.ships} car=${p.caravans}`);
    if (r.flags.length) console.log('alertas: ' + r.flags.map((x) => `${x.kind}@${x.min}min ${x.player} (${x.detail})`).join(' · '));
    if (r.winner) console.log('Vencedor:', r.winner);
  }
}
const count = (k: Flag['kind']) => results.reduce((n, r) => n + r.flags.filter((x) => x.kind === k).length, 0);
const stalls = count('PARADA') + count('TRAVADA');
if (stallsOnly) {
  for (const r of results) for (const x of r.flags) console.log(`semente ${r.seed}: ${x.kind} aos ${x.min} min — ${x.player}: ${x.detail}`);
  console.log(`alertas: PARADA ${count('PARADA')} · TRAVADA ${count('TRAVADA')} · TRAVADA-RECURSO ${count('TRAVADA-RECURSO')} · ACUMULANDO ${count('ACUMULANDO')} · SEM-ONDAS ${count('SEM-ONDAS')}`);
}
let outOfPace = false;
if (flags.has('targets')) {
  console.log('\n=== ritmo por Era (alvo ± tolerância; mediana das IAs que chegaram) ===');
  const allP = results.flatMap((r) => r.players);
  for (let k = 1; k <= 7; k++) {
    const target = ERA_TARGET_MIN[k], tol = ERA_TOLERANCE_MIN[k];
    if (target + tol > minutes) { console.log(`Era ${AGES[k].short.padEnd(8)} alvo ${target} ±${tol}: fora do tempo medido (${minutes} min)`); continue; }
    const reached = allP.filter((p) => p.age >= k).map((p) => p.arrivals[k]);
    const eligible = allP.filter((p) => p.age >= k || p.died === null || p.died > target + tol);
    const rate = eligible.length ? reached.length / eligible.length : 0;
    const med = median(reached);
    let status = 'OK';
    if (reached.length < 5 || rate < ERA_MIN_REACH[k]) status = 'POUCOS';
    else if (med > target + tol) status = `LENTA (+${f1(med - target)})`;
    else if (med < target - tol) status = `RÁPIDA (${f1(med - target)})`;
    if (status !== 'OK') outOfPace = true;
    console.log(`Era ${AGES[k].short.padEnd(8)} alvo ${target} ±${tol}: mediana ${f1(med)} (p25 ${f1(pct(reached, 0.25))}, p75 ${f1(pct(reached, 0.75))}) · chegaram ${reached.length}/${eligible.length} (${Math.round(rate * 100)} %) · ${status}`);
  }
  const ended = results.filter((r) => r.endMin !== null);
  const early = ended.filter((r) => (r.endMin ?? 0) < 30).length;
  console.log(`fim de partida: ${ended.length}/${results.length} com vencedor; antes de 30 min: ${early}; mediana ${ended.length ? f1(median(ended.map((r) => r.endMin as number))) : '—'} min`);
  console.log(`alertas: PARADA ${count('PARADA')} · TRAVADA ${count('TRAVADA')} · TRAVADA-RECURSO ${count('TRAVADA-RECURSO')} · ACUMULANDO ${count('ACUMULANDO')} · SEM-ONDAS ${count('SEM-ONDAS')}`);
  const fora = outOfPace || stalls > 0;
  console.log(`ritmo: ${fora ? 'FORA' : 'DENTRO'}`);
  if (fora) process.exitCode = 1;
}
if (stallsOnly && stalls > 0) process.exitCode = 1;
const jsonOut = flags.get('json');
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ minutes, seeds, diff, mapType, size, map: mapFile ?? null, runs: results }, null, 1));
