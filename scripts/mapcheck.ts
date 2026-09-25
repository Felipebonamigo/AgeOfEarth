// Valida arquivos de mapa fixo (migrateMap + validateMap) e, sem erros, roda 2 minutos de IA x IA em cada um,
// reportando recursos por início, idades, unidades e IAs paradas (src/core/map/check.ts, o mesmo que
// tests/data.test.ts exige dos embutidos). Sai com código 1 se algum arquivo tiver erro ou a partida falhar.
// Uso: npx tsx scripts/mapcheck.ts [arquivo.map.json...]   (sem arquivos: os mapas embutidos)
import fs from 'node:fs';
import { AGES } from '../src/core/data';
import { BUILTIN_MAPS } from '../src/core/data/maps';
import { migrateMap, type FixedMapData, type MapIssue } from '../src/core/map/fixed';
import { checkMap } from '../src/core/map/check';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const inputs: { label: string; load: () => FixedMapData }[] = files.length
  ? files.map((f) => ({ label: f, load: () => migrateMap(JSON.parse(fs.readFileSync(f, 'utf8'))) }))
  : Object.entries(BUILTIN_MAPS).map(([id, m]) => ({ label: `embutido: ${id}`, load: () => m }));
let failed = false;

const fmt = (i: MapIssue) => `  ${i.level === 'error' ? 'ERRO ' : 'aviso'} ${i.code}${i.x !== undefined ? ` (${i.x}, ${i.y})` : ''}${i.params ? ' ' + JSON.stringify(i.params) : ''}`;

for (const input of inputs) {
  console.log(`=== ${input.label} ===`);
  let map: FixedMapData;
  try { map = input.load(); }
  catch (e) { console.log(`  ERRO parse: ${(e as Error).message}`); failed = true; continue; }
  const t0 = Date.now();
  const r = checkMap(map, { minutes: 2 });
  const ms = Date.now() - t0;
  for (const i of r.issues) console.log(fmt(i));
  console.log(`  ${map.name ?? map.id ?? '(sem nome)'} ${map.w}x${map.h} · ${map.starts.length} inícios · ${map.nodes.length} nós · hash ${r.hash !== null ? '#' + r.hash.toString(16) : '—'} · ${r.errors} erro(s), ${r.warnings} aviso(s)`);
  r.resources.forEach((row, i) => console.log(`  início ${i + 1} (raio 16): comida ${row.food} (${row.foodNodes} nós) · madeira ${row.wood} (${row.woodNodes}) · ouro ${row.gold} (${row.goldNodes})`));
  if (r.state) {
    console.log(`  ${r.minutes.toFixed(1)} min simulados em ${(ms / 1000).toFixed(1)}s reais (${(ms / Math.max(1, r.ticks)).toFixed(2)} ms/tick) · unidades ${r.units} · edifícios ${r.buildings}${r.gameOver ? ` · PARTIDA TERMINOU no tick ${r.ticks}` : ''}`);
    for (const p of r.players) console.log(`  ${p.name.padEnd(6)} ${p.alive ? 'vivo ' : 'morto'} idade=${AGES[p.age].short.padEnd(8)} cidadãos=${p.villagers} (ociosos ${p.idle}) militares=${p.military} treinados=${p.trained} construídos=${p.built} pop=${p.pop}/${p.popCap}${p.stalled ? '  <-- IA PARADA' : ''}`);
  }
  for (const f of r.failures) console.log(`  <-- FALHA: ${f}`);
  if (r.failures.length) failed = true;
}
process.exit(failed ? 1 : 0);
