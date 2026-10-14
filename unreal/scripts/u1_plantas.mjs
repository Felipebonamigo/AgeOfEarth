// U1: sorteia as posições da vegetação rasteira e das rochas (determinístico) a partir do terreno exportado:
// altura (heightmap.r16), pesos de camada (layer-*.png), inícios e nós de recurso (terrain.json).
// Saída: unreal/exports/<pasta>/plantas.json  — lida por u1_plantar.py. Uso: node unreal/scripts/u1_plantas.mjs [pasta=teste]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const dir = path.resolve('unreal/exports', process.argv[2] ?? 'teste');
const t = JSON.parse(fs.readFileSync(path.join(dir, 'terrain.json'), 'utf8'));
const N = t.landscape.resolution;
const quad = t.landscape.scaleXY;
const h16 = new Uint16Array(fs.readFileSync(path.join(dir, 'heightmap.r16')).buffer.slice(0));
const camada = (n) => PNG.sync.read(fs.readFileSync(path.join(dir, `layer-${n}.png`)));
const L = { grass: camada('grass'), dirt: camada('dirt'), sand: camada('sand'), rock: camada('rock') };
const lado = N;

// PRNG determinístico (mulberry32)
let seed = 20261014;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };

const alt = (ix, iy) => (h16[Math.min(N - 1, Math.max(0, iy)) * N + Math.min(N - 1, Math.max(0, ix))] - 32768) / 128; // metros
const peso = (png, ix, iy) => png.data[(Math.min(png.height - 1, Math.max(0, Math.round(iy * png.height / lado))) * png.width + Math.min(png.width - 1, Math.max(0, Math.round(ix * png.width / lado)))) * 4] / 255;

const inicios = t.starts;
const nos = t.nodes;
// grade espacial dos nós (células de 600 uu) para o teste de distância
const celula = 600, grade = new Map();
for (const n of nos) { const k = `${Math.floor(n.x / celula)},${Math.floor(n.y / celula)}`; (grade.get(k) ?? grade.set(k, []).get(k)).push(n); }
const pertoDeNo = (x, y, r) => {
  const cx = Math.floor(x / celula), cy = Math.floor(y / celula);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const n of grade.get(`${cx + a},${cy + b}`) ?? []) if ((n.x - x) ** 2 + (n.y - y) ** 2 < r * r) return true;
  return false;
};
const pertoDeInicio = (x, y, r) => inicios.some((s) => (s.x - x) ** 2 + (s.y - y) ** 2 < r * r);

const grupos = {
  capim: { malhas: ['grass_medium_02/grass_medium_02_a', 'grass_medium_02/grass_medium_02_b', 'grass_medium_02/grass_medium_02_c', 'grass_medium_02/grass_medium_02_d', 'grass_medium_02/grass_medium_02_e', 'grass_bermuda_01/grass_bermuda_01_medium_a', 'grass_bermuda_01/grass_bermuda_01_medium_c', 'grass_bermuda_01/grass_bermuda_01_small_b'], pontos: [] },
  flores: { malhas: ['flower_gazania/flower_gazania_a_LOD0', 'flower_gazania/flower_gazania_c_LOD0', 'flower_ursinia/flower_ursinia_a_LOD0', 'flower_ursinia/flower_ursinia_c_LOD0', 'flower_empodium/flower_empodium_b_LOD0', 'dandelion_01/dandelion_01_a_LOD0', 'dandelion_01/dandelion_01_c_LOD0'], pontos: [] },
  samambaias: { malhas: ['fern_02/fern_02_a', 'fern_02/fern_02_b', 'fern_02/fern_02_c', 'fern_02/fern_02_d'], pontos: [] },
  rochas: { malhas: ['namaqualand_boulder_04/namaqualand_boulder_04', 'namaqualand_boulder_05/namaqualand_boulder_05', 'boulder_01/boulder_01'], pontos: [] },
};

const passo = 68; // uu entre pontos da grade sorteada
const mundo = t.w * t.uuPerTile;
for (let gy = 0; gy < mundo; gy += passo) for (let gx = 0; gx < mundo; gx += passo) {
  const x = gx + rnd() * passo, y = gy + rnd() * passo;
  const ix = x / quad, iy = y / quad;
  const z = alt(Math.round(ix), Math.round(iy));
  if (z < 0.5) continue; // água e praia molhada
  const dzx = alt(Math.round(ix) + 1, Math.round(iy)) - alt(Math.round(ix) - 1, Math.round(iy));
  const dzy = alt(Math.round(ix), Math.round(iy) + 1) - alt(Math.round(ix), Math.round(iy) - 1);
  const inclin = Math.hypot(dzx, dzy) / (2 * quad / 100); // m/m
  const g = peso(L.grass, ix, iy), d = peso(L.dirt, ix, iy), r = peso(L.rock, ix, iy), s = peso(L.sand, ix, iy);
  const pt = { x: +x.toFixed(1), y: +y.toFixed(1), z: +(z * 100).toFixed(1), yaw: +(rnd() * 360).toFixed(1), k: 0, e: 1 };
  const nearNode = pertoDeNo(x, y, 140), nearStart = pertoDeInicio(x, y, 1300);
  if (nearNode || nearStart) continue;
  if (g > 0.35 && inclin < 0.55 && rnd() < 0.5 * Math.min(1, g * 1.4)) {
    pt.k = Math.floor(rnd() * grupos.capim.malhas.length); pt.e = 1.6 + rnd() * 1.3; grupos.capim.pontos.push(pt);
  } else if ((d > 0.3 || s > 0.4) && inclin < 0.4 && rnd() < 0.08) {
    pt.k = Math.floor(rnd() * grupos.capim.malhas.length); pt.e = 1.0 + rnd() * 0.8; grupos.capim.pontos.push(pt);
  }
  if (g > 0.5 && inclin < 0.4 && rnd() < 0.05) {
    grupos.flores.pontos.push({ ...pt, k: Math.floor(rnd() * grupos.flores.malhas.length), e: 1.6 + rnd() * 1.2, yaw: rnd() * 360 });
  }
  if (g > 0.6 && inclin < 0.45 && rnd() < 0.018) {
    grupos.samambaias.pontos.push({ ...pt, k: Math.floor(rnd() * grupos.samambaias.malhas.length), e: 1.5 + rnd() * 1.0, yaw: rnd() * 360 });
  }
}
// rochas: sobre a camada rocha / encostas, esparsas, longe de nós e inícios
for (let i = 0; i < 400000 && grupos.rochas.pontos.length < 260; i++) {
  const x = rnd() * mundo, y = rnd() * mundo, ix = x / quad, iy = y / quad;
  const z = alt(Math.round(ix), Math.round(iy));
  if (z < 0.2) continue;
  const dzx = alt(Math.round(ix) + 1, Math.round(iy)) - alt(Math.round(ix) - 1, Math.round(iy));
  const dzy = alt(Math.round(ix), Math.round(iy) + 1) - alt(Math.round(ix), Math.round(iy) - 1);
  const inclin = Math.hypot(dzx, dzy) / (2 * quad / 100);
  const r = peso(L.rock, ix, iy);
  if (!(r > 0.4 || inclin > 0.5 || rnd() < 0.002)) continue;
  if (pertoDeNo(x, y, 320) || pertoDeInicio(x, y, 1500)) continue;
  grupos.rochas.pontos.push({ x: +x.toFixed(1), y: +y.toFixed(1), z: +(z * 100 - 12).toFixed(1), yaw: +(rnd() * 360).toFixed(1), k: Math.floor(rnd() * 3), e: +(0.45 + rnd() * 0.8).toFixed(2), pitch: +((rnd() - 0.5) * 16).toFixed(1) });
}
const saida = path.join(dir, 'plantas.json');
fs.writeFileSync(saida, JSON.stringify(grupos));
console.log(Object.entries(grupos).map(([k, g]) => `${k}=${g.pontos.length}`).join(' '), '->', saida);
