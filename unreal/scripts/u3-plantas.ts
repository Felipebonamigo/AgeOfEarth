// U3: sorteio (determinístico) da vegetação rasteira e das rochas a partir do terreno da partida — a mesma regra de
// unreal/scripts/u1_plantas.mjs, mas em memória (sem PNG) para o servidor mandar as posições no início da partida.
// Retorna { grupo: { malhas: ['pasta/arquivo'...], pontos: [x,y,z,yaw,k,e,pitch ...] } } (pontos achatados, 7 números cada).
import type { TerrainExport } from '../../scripts/unreal/export-terrain';

export interface GrupoPlantas { malhas: string[]; pontos: number[] }

const MALHAS: Record<string, string[]> = {
  capim: ['grass_medium_02/grass_medium_02_a', 'grass_medium_02/grass_medium_02_b', 'grass_medium_02/grass_medium_02_c', 'grass_medium_02/grass_medium_02_d', 'grass_medium_02/grass_medium_02_e'],
  flores: ['flower_gazania/flower_gazania_a_LOD0', 'flower_gazania/flower_gazania_c_LOD0', 'flower_ursinia/flower_ursinia_a_LOD0', 'flower_ursinia/flower_ursinia_c_LOD0', 'flower_empodium/flower_empodium_b_LOD0', 'dandelion_01/dandelion_01_a_LOD0', 'dandelion_01/dandelion_01_c_LOD0'],
  samambaias: ['fern_02/fern_02_a', 'fern_02/fern_02_b', 'fern_02/fern_02_c', 'fern_02/fern_02_d'],
  rochas: ['namaqualand_boulder_04/namaqualand_boulder_04', 'namaqualand_boulder_05/namaqualand_boulder_05', 'boulder_01/boulder_01'],
};

export function sortearPlantas(t: TerrainExport, seed = 20261014): Record<string, GrupoPlantas> {
  const N = t.size, info = t.info as { landscape: { scaleXY: number }; uuPerTile: number; starts: { x: number; y: number }[]; nodes: { x: number; y: number }[] };
  const quad = info.landscape.scaleXY, mundo = t.w * info.uuPerTile;
  let s = seed;
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const cl = (v: number) => Math.min(N - 1, Math.max(0, v));
  const alt = (ix: number, iy: number) => (t.height[cl(iy) * N + cl(ix)] - 32768) / 128;   // metros
  const peso = (a: Uint8Array, ix: number, iy: number) => a[cl(Math.round(iy)) * N + cl(Math.round(ix))] / 255;
  const celula = 600, grade = new Map<string, { x: number; y: number }[]>();
  for (const n of info.nodes) { const k = `${Math.floor(n.x / celula)},${Math.floor(n.y / celula)}`; (grade.get(k) ?? grade.set(k, []).get(k)!).push(n); }
  const pertoDeNo = (x: number, y: number, r: number) => {
    const cx = Math.floor(x / celula), cy = Math.floor(y / celula);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const n of grade.get(`${cx + a},${cy + b}`) ?? []) if ((n.x - x) ** 2 + (n.y - y) ** 2 < r * r) return true;
    return false;
  };
  const pertoDeInicio = (x: number, y: number, r: number) => info.starts.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < r * r);
  const g: Record<string, GrupoPlantas> = {};
  for (const [k, m] of Object.entries(MALHAS)) g[k] = { malhas: m, pontos: [] };
  const add = (grupo: string, x: number, y: number, z: number, yaw: number, k: number, e: number, pitch = 0) => g[grupo].pontos.push(+x.toFixed(1), +y.toFixed(1), +z.toFixed(1), +yaw.toFixed(1), k, +e.toFixed(2), +pitch.toFixed(1));
  const passo = 68;
  for (let gy = 0; gy < mundo; gy += passo) for (let gx = 0; gx < mundo; gx += passo) {
    const x = gx + rnd() * passo, y = gy + rnd() * passo, ix = x / quad, iy = y / quad;
    const z = alt(Math.round(ix), Math.round(iy));
    if (z < 0.5) continue;
    const dzx = alt(Math.round(ix) + 1, Math.round(iy)) - alt(Math.round(ix) - 1, Math.round(iy));
    const dzy = alt(Math.round(ix), Math.round(iy) + 1) - alt(Math.round(ix), Math.round(iy) - 1);
    const inclin = Math.hypot(dzx, dzy) / (2 * quad / 100);
    const gr = peso(t.grass, ix, iy), d = peso(t.dirt, ix, iy), sa = peso(t.sand, ix, iy);
    const yaw = rnd() * 360;
    if (pertoDeNo(x, y, 140) || pertoDeInicio(x, y, 1300)) continue;
    if (gr > 0.35 && inclin < 0.55 && rnd() < 0.5 * Math.min(1, gr * 1.4)) add('capim', x, y, z * 100, yaw, Math.floor(rnd() * MALHAS.capim.length), 1.6 + rnd() * 1.3);
    else if ((d > 0.3 || sa > 0.4) && inclin < 0.4 && rnd() < 0.08) add('capim', x, y, z * 100, yaw, Math.floor(rnd() * MALHAS.capim.length), 1.0 + rnd() * 0.8);
    if (gr > 0.5 && inclin < 0.4 && rnd() < 0.03) add('flores', x, y, z * 100, rnd() * 360, Math.floor(rnd() * MALHAS.flores.length), 1.6 + rnd() * 1.2);
    if (gr > 0.6 && inclin < 0.45 && rnd() < 0.018) add('samambaias', x, y, z * 100, rnd() * 360, Math.floor(rnd() * MALHAS.samambaias.length), 1.5 + rnd() * 1.0);
  }
  for (let i = 0; i < 400000 && g.rochas.pontos.length < 260 * 7; i++) {
    const x = rnd() * mundo, y = rnd() * mundo, ix = x / quad, iy = y / quad;
    const z = alt(Math.round(ix), Math.round(iy));
    if (z < 0.2) continue;
    const dzx = alt(Math.round(ix) + 1, Math.round(iy)) - alt(Math.round(ix) - 1, Math.round(iy));
    const dzy = alt(Math.round(ix), Math.round(iy) + 1) - alt(Math.round(ix), Math.round(iy) - 1);
    const inclin = Math.hypot(dzx, dzy) / (2 * quad / 100);
    const r = peso(t.rock, ix, iy);
    if (!(r > 0.4 || inclin > 0.5 || rnd() < 0.002)) continue;
    if (pertoDeNo(x, y, 320) || pertoDeInicio(x, y, 1500)) continue;
    add('rochas', x, y, z * 100 - 12, rnd() * 360, Math.floor(rnd() * 3), 0.45 + rnd() * 0.8, (rnd() - 0.5) * 16);
  }
  return g;
}
