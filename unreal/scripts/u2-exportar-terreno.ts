// Exporta o terreno de um mapa gerado para o Unreal com o MESMO número de jogadores que o servidor vai usar.
// O exportador da nuvem (scripts/unreal/export-terrain.ts) cria o jogo sempre com 2 jogadores; com 4 no servidor, os 2 inícios
// a mais limpam terreno que no Unreal continuava água ou mato (edifícios "dentro do mar", 15/10/2026). Este script reaproveita
// buildTerrain/writeTerrain sem mexer nele e grava o hash do terreno em Dados/mapas.json, que o cliente confere no hello.
// Uso: npx tsx unreal/scripts/u2-exportar-terreno.ts --seed 42 --size medium --players 4 --out unreal/exports/medio --mapa /Game/Maps/U1M
import fs from 'node:fs';
import path from 'node:path';
import { createGame } from '../../src/core/sim/game';
import { buildTerrain, writeTerrain } from '../../scripts/unreal/export-terrain';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const seed = Number(opt('seed', '42'));
const size = opt('size', 'medium') as 'small' | 'medium' | 'large';
const players = Math.max(2, Number(opt('players', '2')));
const out = path.resolve(opt('out', `unreal/exports/seed${seed}-${size}-${players}j`));
const mapa = opt('mapa', '');

// mesmos deuses e IA do u1-servidor.ts (o gerador não depende deles, mas fica igual por garantia)
const GODS = ['zeus', 'poseidon', 'hades'];
const state = createGame({ seed, mapSize: size, players: Array.from({ length: players }, (_, i) => ({ name: 'p' + i, god: GODS[i % GODS.length], isAI: true, difficulty: 'hard' as const })) });
const t = buildTerrain(state.map, { size: Number(opt('landscape', '1009')), name: path.basename(out) });
const files = writeTerrain(t, out);

// FNV-1a 32 dos códigos de terreno: o mesmo que o cliente calcula sobre o "terrain" do hello
let h = 0x811c9dc5;
for (const b of state.map.terrain) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
if (mapa) {
  const arq = path.resolve('unreal/AgeOfEarthUE/Dados/mapas.json');
  const j = fs.existsSync(arq) ? JSON.parse(fs.readFileSync(arq, 'utf8')) : { _comentario: 'Terreno de origem de cada mapa do Unreal (u2-exportar-terreno.ts). O cliente compara com o hello da ponte e avisa se a simulação usar outro terreno (outra semente, tamanho ou número de jogadores).' };
  j[mapa] = { semente: seed, tamanho: size, jogadores: players, w: state.map.w, h: state.map.h, hash: h.toString(16).padStart(8, '0') };
  fs.writeFileSync(arq, JSON.stringify(j, null, 2) + '\n');
}
console.log(`${state.map.w}×${state.map.h}, ${players} jogadores, hash ${h.toString(16).padStart(8, '0')} → ${out}: ${files.join(', ')}`);
