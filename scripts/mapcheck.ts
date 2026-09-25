// Valida arquivos de mapa fixo (migrateMap + validateMap) e, sem erros, roda 2 minutos de IA x IA em cada um,
// reportando idades, unidades e IAs paradas. Sai com código 1 se algum arquivo tiver erro ou a partida falhar.
// Uso: npx tsx scripts/mapcheck.ts <arquivo.map.json>...
import fs from 'node:fs';
import { createGame, tick } from '../src/core/sim/game';
import { TICK_RATE } from '../src/core/constants';
import { AGES } from '../src/core/data';
import { mapHash, migrateMap, validateMap, type MapIssue } from '../src/core/map/fixed';
import type { GameConfig } from '../src/core/types';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (files.length === 0) { console.error('Uso: npx tsx scripts/mapcheck.ts <arquivo.map.json>...'); process.exit(1); }
const GODS = ['zeus', 'poseidon', 'hades', 'zeus'];
const MINUTES = 2;
let failed = false;

const fmt = (i: MapIssue) => `  ${i.level === 'error' ? 'ERRO ' : 'aviso'} ${i.code}${i.x !== undefined ? ` (${i.x}, ${i.y})` : ''}${i.params ? ' ' + JSON.stringify(i.params) : ''}`;

for (const file of files) {
  console.log(`=== ${file} ===`);
  let map;
  try { map = migrateMap(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch (e) { console.log(`  ERRO parse: ${(e as Error).message}`); failed = true; continue; }
  const nPlayers = Math.min(4, Math.max(2, map.starts?.length ?? 0));
  const issues = validateMap(map, { players: nPlayers, mode: 'conquest', ai: new Array(nPlayers).fill(true) });
  for (const i of issues) console.log(fmt(i));
  const errors = issues.filter((i) => i.level === 'error').length;
  console.log(`  ${map.name ?? map.id ?? '(sem nome)'} ${map.w}x${map.h} · ${map.starts.length} inícios · ${map.nodes.length} nós · hash ${errors === 0 ? '#' + mapHash(map).toString(16) : '—'} · ${errors} erro(s), ${issues.length - errors} aviso(s)`);
  if (errors > 0) { failed = true; continue; }

  const players: GameConfig['players'] = [];
  for (let i = 0; i < nPlayers; i++) players.push({ name: `IA ${i + 1}`, god: GODS[i], isAI: true, difficulty: 'hard' });
  let state;
  try { state = createGame({ seed: 1, mapSize: 'medium', map, players, mode: 'conquest' }); }
  catch (e) { console.log(`  ERRO createGame: ${(e as Error).message}`); failed = true; continue; }
  const t0 = Date.now();
  const total = MINUTES * 60 * TICK_RATE;
  try { for (let i = 0; i < total && !state.gameOver; i++) tick(state); }
  catch (e) { console.log(`  ERRO no tick ${state.tick}: ${(e as Error).stack ?? e}`); failed = true; continue; }
  const ms = Date.now() - t0;
  console.log(`  ${MINUTES} min de jogo em ${(ms / 1000).toFixed(1)}s reais (${(ms / state.tick).toFixed(2)} ms/tick) · unidades ${state.units.size} · edifícios ${state.buildings.size}${state.gameOver ? ' · partida terminou' : ''}`);
  for (const p of state.players) {
    let vill = 0, mil = 0, idle = 0;
    for (const u of state.units.values()) { if (u.owner !== p.id || u.dead) continue; if (u.type === 'villager') { vill++; if (u.state === 'idle') idle++; } else mil++; }
    const stalled = p.stats.unitsTrained === 0 && p.stats.buildingsBuilt === 0;
    if (stalled) failed = true;
    console.log(`  ${p.name.padEnd(6)} ${p.alive ? 'vivo ' : 'morto'} idade=${AGES[p.age].short.padEnd(8)} cidadãos=${vill} (ociosos ${idle}) militares=${mil} treinados=${p.stats.unitsTrained} construídos=${p.stats.buildingsBuilt} pop=${p.pop}/${p.popCap}${stalled ? '  <-- IA PARADA' : ''}`);
  }
}
process.exit(failed ? 1 : 0);
