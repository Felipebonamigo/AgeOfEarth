// Simulação sem interface: IA contra IA por N minutos, para validar estabilidade e balanceamento.
// Uso: npm run smoke [minutos] [semente] -- --map arquivo.map.json  (o "--" é necessário para o npm repassar a opção;
// com --map, o tamanho do mapa é ignorado). Direto: npx tsx scripts/headless.ts 3 42 --map arquivo.map.json
import fs from 'node:fs';
import { createGame, tick, summarize } from '../src/core/sim/game';
import { TICK_RATE } from '../src/core/constants';
import { migrateMap, validateMap, type FixedMapData } from '../src/core/map/fixed';
import { stateHash } from '../src/core/net/hash';

const argv = process.argv.slice(2);
let mapFile: string | undefined;
const positional: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--map') { mapFile = argv[++i]; if (mapFile === undefined || mapFile.startsWith('--')) { console.error('Uso: npx tsx scripts/headless.ts [minutos] [semente] --map arquivo.map.json'); process.exit(1); } continue; }
  if (argv[i].startsWith('--map=')) { mapFile = argv[i].slice('--map='.length); continue; }
  positional.push(argv[i]);
}
const minutes = Number(positional[0] ?? 12);
const seed = Number(positional[1] ?? 42);
let map: FixedMapData | undefined;
if (mapFile) {
  try { map = migrateMap(JSON.parse(fs.readFileSync(mapFile, 'utf8'))); } catch (e) { console.error(`Mapa fixo inválido (${mapFile}): ${(e as Error).message}`); process.exit(1); }
  const errors = validateMap(map, { players: Math.max(2, Math.min(3, map.starts.length)) }).filter((i) => i.level === 'error');
  if (errors.length) { for (const i of errors) console.error(`  erro ${i.code} ${i.x !== undefined ? `(${i.x}, ${i.y})` : ''} ${JSON.stringify(i.params ?? {})}`); process.exit(1); }
}
if (map) console.log(`Mapa fixo: ${mapFile} (${map.name ?? map.id ?? 'sem nome'}, ${map.w}x${map.h}, ${map.starts.length} inícios, ${map.entities?.length ?? 0} entidades)`);
const allPlayers = [
  { name: 'Zeus IA', god: 'zeus', isAI: true, difficulty: 'normal' as const },
  { name: 'Poseidon IA', god: 'poseidon', isAI: true, difficulty: 'normal' as const },
  { name: 'Hades IA', god: 'hades', isAI: true, difficulty: 'normal' as const },
];
// Num mapa fixo com menos inícios do que os 3 jogadores padrão, joga com o que couber (mínimo 2)
const players = map ? allPlayers.slice(0, Math.max(2, Math.min(allPlayers.length, map.starts.length))) : allPlayers;
const state = createGame({ seed, mapSize: 'medium', players, map });
const t0 = Date.now();
const total = minutes * 60 * TICK_RATE;
for (let i = 0; i < total; i++) {
  tick(state);
  if (state.tick % (TICK_RATE * 60) === 0) {
    console.log(`--- minuto ${state.tick / TICK_RATE / 60} (${((Date.now() - t0) / 1000).toFixed(1)}s reais) ---`);
    console.log(summarize(state));
  }
  if (state.gameOver) { console.log('FIM:', state.events.filter((e) => e.type === 'victory').map((e) => e.text)); break; }
}
const ms = Date.now() - t0;
console.log(`Ticks: ${state.tick}, tempo real: ${ms}ms, ${(ms / state.tick).toFixed(2)} ms/tick, unidades: ${state.units.size}, edifícios: ${state.buildings.size}`);
console.log('Eventos:', state.events.filter((e) => ['age', 'victory', 'defeated', 'wonder', 'titan', 'powerUsed', 'buildingLost'].includes(e.type)).map((e) => `${Math.floor(e.tick / TICK_RATE / 60)}m ${e.text}`).slice(-30).join('\n  '));
for (const p of state.players) console.log(p.name, 'ondas de ataque:', p.ai?.waves, 'abates:', p.stats.kills, 'perdas:', p.stats.losses, 'destruídos:', p.stats.razed, 'coletado:', JSON.stringify(Object.fromEntries(Object.entries(p.stats.gathered).map(([k, v]) => [k, Math.round(v as number)]))));
// determinismo: duas execuções com os mesmos argumentos têm de imprimir o mesmo hash
console.log(`hash final: ${stateHash(state).toString(16)} (tick ${state.tick})`);
