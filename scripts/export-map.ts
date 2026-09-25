// Exporta um mapa gerado por semente como arquivo fixo canônico (.map.json), para embutidos, fixtures e testes.
// Uso: npx tsx scripts/export-map.ts <saida.map.json> [--size small|medium|large] [--seed N] [--type continental|mountains|forest|desert|lakes] [--players N] [--name "..."]
import fs from 'node:fs';
import { MAP_SIZES, MAP_TYPES, type MapSize, type MapType } from '../src/core/constants';
import { generateMap, resetNodeSeq } from '../src/core/map/mapgen';
import { canonicalize, mapHash, mapToData, validateMap } from '../src/core/map/fixed';

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--'));
const opt = (name: string, def: string): string => { const i = args.indexOf('--' + name); return i >= 0 && i + 1 < args.length ? args[i + 1] : def; };
if (!out) {
  console.error('Uso: npx tsx scripts/export-map.ts <saida.map.json> [--size small|medium|large] [--seed N] [--type continental|mountains|forest|desert|lakes] [--players N] [--name "..."]');
  process.exit(1);
}
const size = opt('size', 'small') as MapSize;
const seed = Number(opt('seed', '1'));
const type = opt('type', 'continental') as MapType;
const players = Number(opt('players', '2'));
const name = opt('name', '');
if (!MAP_SIZES[size]) { console.error(`Tamanho inválido: ${size}`); process.exit(1); }
if (!MAP_TYPES.includes(type)) { console.error(`Tipo inválido: ${type}`); process.exit(1); }
if (!Number.isInteger(seed) || !Number.isInteger(players) || players < 2 || players > 4) { console.error('Semente inteira e 2..4 jogadores'); process.exit(1); }

resetNodeSeq();
const map = generateMap(MAP_SIZES[size].w, MAP_SIZES[size].h, seed, players, type);
const slug = (name || `${type}-${size}-${seed}`).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const data = canonicalize({ ...mapToData(map, name || undefined), id: slug });
const json = JSON.stringify(data);
fs.writeFileSync(out, json);
const issues = validateMap(data, { players });
const errors = issues.filter((i) => i.level === 'error').length;
console.log(`${out}: ${data.w}x${data.h} ${type} semente ${seed} · ${data.starts.length} inícios · ${data.nodes.length} nós · ${json.length} bytes · hash #${mapHash(data).toString(16)} · ${errors} erro(s), ${issues.length - errors} aviso(s)`);
process.exit(errors > 0 ? 1 : 0);
