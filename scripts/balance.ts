// Balanceamento: roda várias partidas IA x IA e imprime quando cada IA avança de Idade, ondas e vencedor.
import { createGame, tick } from '../src/core/sim/game';
import { TICK_RATE } from '../src/core/constants';
import { AGES } from '../src/core/data';
import fs from 'node:fs';
import { migrateMap, validateMap, type FixedMapData } from '../src/core/map/fixed';

// Uso: npm run balance [minutos] [sementes] -- --map arquivo.map.json   (mapa fixo: tantas IAs quantos inícios, máx. 4)
const argv = process.argv.slice(2);
let mapFile: string | undefined; const positional: string[] = [];
for (let i = 0; i < argv.length; i++) { if (argv[i] === '--map') { mapFile = argv[++i]; if (!mapFile || mapFile.startsWith('--')) { console.error('Uso: npm run balance [minutos] [sementes] -- --map arquivo.map.json'); process.exit(1); } } else if (argv[i].startsWith('--map=')) mapFile = argv[i].slice(6); else positional.push(argv[i]); }
const minutes = Number(positional[0] ?? 30);
const seeds = (positional[1] ?? '1,2,3').split(',').map(Number);
let map: FixedMapData | undefined;
if (mapFile) {
  try { map = migrateMap(JSON.parse(fs.readFileSync(mapFile, 'utf8'))); } catch (e) { console.error(`Mapa fixo inválido (${mapFile}): ${(e as Error).message}`); process.exit(1); }
  const errors = validateMap(map, { players: Math.min(4, map.starts.length) }).filter((i) => i.level === 'error');
  if (errors.length) { for (const i of errors) console.error(`  erro ${i.code}`); process.exit(1); }
  console.log(`Mapa fixo: ${map.name ?? map.id} ${map.w}x${map.h}, ${map.starts.length} inícios`);
}
const gods = ['zeus', 'poseidon', 'hades', 'zeus'];
const nPlayers = map ? Math.min(4, Math.max(2, map.starts.length)) : 3;
for (const seed of seeds) {
  const state = createGame({ seed, mapSize: 'medium', map, players: gods.slice(0, nPlayers).map((g, i) => ({ name: `${g}${i}`, god: g, isAI: true, difficulty: 'normal' as const })) });
  const ageAt: Record<string, number[]> = {}; for (const p of state.players) ageAt[p.name] = [0];
  const t0 = Date.now();
  for (let i = 0; i < minutes * 60 * TICK_RATE && !state.gameOver; i++) {
    tick(state);
    for (const p of state.players) if (ageAt[p.name].length <= p.age) ageAt[p.name].push(Math.round(state.time / 60));
  }
  const ms = Date.now() - t0;
  console.log(`\n=== semente ${seed} · ${Math.round(state.time / 60)} min de jogo em ${(ms / 1000).toFixed(1)}s reais · ${(ms / state.tick).toFixed(2)} ms/tick ===`);
  for (const p of state.players) {
    console.log(`${p.name.padEnd(10)} ${p.alive ? 'vivo ' : 'morto'} idade=${AGES[p.age].short.padEnd(8)} idades aos minutos [${ageAt[p.name].join(', ')}] ondas=${p.ai?.waves} abates=${p.stats.kills} perdas=${p.stats.losses} destruídos=${p.stats.razed} território=${p.territoryTiles} techs=${p.techs.length}`);
  }
  if (state.gameOver) console.log('Vencedor:', state.winner >= 0 ? state.players[state.winner].name : 'nenhum');
}
