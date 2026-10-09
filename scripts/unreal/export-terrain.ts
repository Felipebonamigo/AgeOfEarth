// Exporta o terreno de um mapa do jogo para o Unreal (docs/UNREAL.md): heightmap 16 bits para o Landscape, máscaras de
// camada (grama, terra, areia, rocha, água) e um JSON com as posições (nós de recurso, inícios) já em unidades do Unreal.
// O jogo não tem altura (só classes de terreno): o relevo é sintetizado — montanha alta, praia suave, mar fundo —, com
// detalhe determinístico (hash inteiro, sem Math.random) por cima. A água fica em Z = 0 (nível do mar).
// Uso: npx tsx scripts/unreal/export-terrain.ts [--seed 42] [--size small|medium|large] [--map arquivo.map.json]
//        [--out unreal/exports/<nome>] [--landscape 1009]   (npm run unreal:terrain -- --seed 7)
// Saída em <out>/: heightmap.r16 (uint16 little-endian, N×N, linha 0 = Y mínimo), heightmap.png (16 bits),
//   layer-{grass,dirt,sand,rock}.png e water.png (8 bits, N×N), terrain.json.
// Importar no Unreal: Landscape → Import from File, heightmap.r16 (ou .png), Resolução N×N, Escala = scaleXY/scaleXY/scaleZ
// de terrain.json, Localização (0,0,0); camadas com os layer-*.png. Mapeamento: tile (x, y) → UU (x·200, y·200).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createGame } from '../../src/core/sim/game';
import { TERRAIN } from '../../src/core/constants';
import { migrateMap, type FixedMapData } from '../../src/core/map/fixed';
import type { GameMap } from '../../src/core/types';

export const UU_PER_TILE = 200;
/** Tamanhos válidos de Landscape (quads + 1) com 1 seção por componente. */
export const LANDSCAPE_SIZES = [253, 505, 1009, 2017, 4033];
/** Nível do mar: a água do Unreal fica em Z = 0; alturas em metros em relação a ele. */
const CLASS_HEIGHT_M: Record<number, number> = {
  [TERRAIN.GRASS]: 1.1, [TERRAIN.DIRT]: 1.0, [TERRAIN.SAND]: 0.25, [TERRAIN.WATER]: -1.3, [TERRAIN.DEEP]: -7, [TERRAIN.MOUNTAIN]: 16,
};
const CLASS_NOISE_M: Record<number, number> = {
  [TERRAIN.GRASS]: 0.45, [TERRAIN.DIRT]: 0.4, [TERRAIN.SAND]: 0.2, [TERRAIN.WATER]: 0.1, [TERRAIN.DEEP]: 0.3, [TERRAIN.MOUNTAIN]: 7,
};
const CLASSES = [TERRAIN.GRASS, TERRAIN.DIRT, TERRAIN.SAND, TERRAIN.WATER, TERRAIN.DEEP, TERRAIN.MOUNTAIN];

export interface TerrainExport {
  size: number; w: number; h: number;
  height: Uint16Array; grass: Uint8Array; dirt: Uint8Array; sand: Uint8Array; rock: Uint8Array; water: Uint8Array;
  info: Record<string, unknown>;
}

/** Hash inteiro 32 bits → [0, 1): ruído de valor determinístico (nada de Math.random/seno). */
function hash01(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function valueNoise(x: number, y: number, s: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash01(x0, y0, s), b = hash01(x0 + 1, y0, s), c = hash01(x0, y0 + 1, s), d = hash01(x0 + 1, y0 + 1, s);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;   // [0,1]
}

/** Borra um campo w×h com `passes` passadas de caixa 3×3 (borda repetida). */
function blur(src: Float32Array, w: number, h: number, passes: number): Float32Array {
  let a: Float32Array = src, b: Float32Array = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += a[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))];
      b[y * w + x] = s / 9;
    }
    [a, b] = [b, a];
  }
  return a;
}

/** Amostra bilinear de um campo w×h em coordenadas de tile contínuas (centro do tile = +0,5). */
function sample(f: Float32Array, w: number, h: number, x: number, y: number): number {
  const fx = Math.min(w - 1, Math.max(0, x - 0.5)), fy = Math.min(h - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
  const a = f[y0 * w + x0], b = f[y0 * w + x1], c = f[y1 * w + x0], d = f[y1 * w + x1];
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
}

export function buildTerrain(map: GameMap, opts: { size?: number; name?: string } = {}): TerrainExport {
  const { w, h } = map;
  const size = opts.size ?? 1009;
  if (!LANDSCAPE_SIZES.includes(size)) throw new Error(`landscape ${size} inválido; use ${LANDSCAPE_SIZES.join(', ')}`);
  // pesos por classe (um campo por classe), borrados para as bordas virarem rampas/praias
  const weights = new Map<number, Float32Array>();
  for (const c of CLASSES) {
    const f = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) f[i] = map.terrain[i] === c ? 1 : 0;
    weights.set(c, blur(f, w, h, c === TERRAIN.MOUNTAIN ? 3 : 2));
  }
  const decor = Float32Array.from(map.decor, (v) => v / 255);
  const N = size, step = w / N, stepY = h / N;
  const height = new Uint16Array(N * N), grass = new Uint8Array(N * N), dirt = new Uint8Array(N * N), sand = new Uint8Array(N * N), rock = new Uint8Array(N * N), water = new Uint8Array(N * N);
  const sig = Math.imul(map.w, 73856093) ^ Math.imul(map.h, 19349663);
  let minM = Infinity, maxM = -Infinity;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const tx = (i + 0.5) * step, ty = (j + 0.5) * stepY;   // posição em tiles
      let hm = 0, wsum = 0;
      const wc: Record<number, number> = {};
      for (const c of CLASSES) { const v = Math.max(0, sample(weights.get(c)!, w, h, tx, ty)); wc[c] = v; wsum += v; }
      if (wsum <= 0) { wc[TERRAIN.GRASS] = 1; wsum = 1; }
      const dc = sample(decor, w, h, tx, ty) - 0.5;
      // detalhe: 2 oitavas de ruído de valor (≈ 12 m e 3 m) + o `decor` do mapa, mais forte na montanha
      const n = (valueNoise(tx * 0.30, ty * 0.30, sig) - 0.5) * 2 + (valueNoise(tx * 1.3, ty * 1.3, sig + 1) - 0.5) * 0.7 + dc * 0.8;
      for (const c of CLASSES) { const wn = wc[c] / wsum; wc[c] = wn; hm += wn * (CLASS_HEIGHT_M[c] + n * CLASS_NOISE_M[c]); }
      minM = Math.min(minM, hm); maxM = Math.max(maxM, hm);
      const k = j * N + i;
      height[k] = Math.max(0, Math.min(65535, 32768 + Math.round(hm * 128)));   // z_uu = (v - 32768) / 128 · ZScale(100) → 1 m = 128 unidades de v
      const wr = wc[TERRAIN.MOUNTAIN];
      const lay = [wc[TERRAIN.GRASS], wc[TERRAIN.DIRT], wc[TERRAIN.SAND] + wc[TERRAIN.WATER] * 0.7 + wc[TERRAIN.DEEP], wr];
      const tot = lay[0] + lay[1] + lay[2] + lay[3] || 1;
      grass[k] = Math.round((lay[0] / tot) * 255); dirt[k] = Math.round((lay[1] / tot) * 255); sand[k] = Math.round((lay[2] / tot) * 255); rock[k] = Math.round((lay[3] / tot) * 255);
      water[k] = Math.round(Math.min(1, wc[TERRAIN.WATER] + wc[TERRAIN.DEEP]) * 255);
    }
  }
  // terreno em metros no ponto de um tile (para pôr nós e inícios no chão)
  const groundM = (x: number, y: number) => {
    const i = Math.min(N - 1, Math.max(0, Math.floor((x / w) * N))), j = Math.min(N - 1, Math.max(0, Math.floor((y / h) * N)));
    return Math.round(((height[j * N + i] - 32768) / 128) * 100) / 100;
  };
  const toUU = (x: number, y: number) => ({ x: Math.round(x * UU_PER_TILE), y: Math.round(y * UU_PER_TILE), zM: groundM(x, y) });
  const info = {
    name: opts.name ?? 'mapa', w, h, uuPerTile: UU_PER_TILE, heightmap: { size: N, format: 'uint16-le', zeroValue: 32768, valuePerMeter: 128, minM: Math.round(minM * 100) / 100, maxM: Math.round(maxM * 100) / 100 },
    landscape: { resolution: N, scaleXY: Math.round(((w * UU_PER_TILE) / (N - 1)) * 10000) / 10000, scaleZ: 100, location: [0, 0, 0] },
    waterLevelM: 0,
    starts: map.starts.map((s) => ({ tx: s.x, ty: s.y, ...toUU(s.x + 0.5, s.y + 0.5) })),
    nodes: [...map.nodes.values()].map((n) => ({ id: n.id, type: n.type, tx: n.x, ty: n.y, amount: n.amount, ...toUU(n.x + 0.5, n.y + 0.5) })),
  };
  return { size: N, w, h, height, grass, dirt, sand, rock, water, info };
}

let crcTable: Uint32Array | null = null;
function crc32(buf: Buffer): number {
  if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** PNG em tons de cinza (8 ou 16 bits), escrito à mão: o pngjs reduz tudo a 8 bits por canal ao gravar. */
function grayPng(n: number, depth: 8 | 16, sample: (i: number) => number): Buffer {
  const bpp = depth / 8, row = n * bpp, raw = Buffer.alloc((row + 1) * n);
  for (let y = 0; y < n; y++) {
    raw[y * (row + 1)] = 0;   // filtro "nenhum"
    for (let x = 0; x < n; x++) { const v = sample(y * n + x), o = y * (row + 1) + 1 + x * bpp; if (depth === 16) raw.writeUInt16BE(v, o); else raw[o] = v; }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = depth; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

export function writeTerrain(t: TerrainExport, dir: string): string[] {
  fs.mkdirSync(dir, { recursive: true });
  const r16 = Buffer.alloc(t.size * t.size * 2);
  for (let i = 0; i < t.height.length; i++) r16.writeUInt16LE(t.height[i], i * 2);
  fs.writeFileSync(path.join(dir, 'heightmap.r16'), r16);
  fs.writeFileSync(path.join(dir, 'terrain.json'), JSON.stringify(t.info, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'heightmap.png'), grayPng(t.size, 16, (i) => t.height[i]));
  for (const [file, data] of [['layer-grass.png', t.grass], ['layer-dirt.png', t.dirt], ['layer-sand.png', t.sand], ['layer-rock.png', t.rock], ['water.png', t.water]] as const) fs.writeFileSync(path.join(dir, file), grayPng(t.size, 8, (i) => data[i]));
  return ['heightmap.r16', 'heightmap.png', 'layer-grass.png', 'layer-dirt.png', 'layer-sand.png', 'layer-rock.png', 'water.png', 'terrain.json'];
}

if (process.argv[1] && /export-terrain\.ts$/.test(process.argv[1])) {
  const args = process.argv.slice(2);
  const opt = (n: string, d?: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const mapFile = opt('--map');
  const seed = Number(opt('--seed', '42')), mapSize = (opt('--size', 'medium') as 'small' | 'medium' | 'large');
  let name = `seed${seed}-${mapSize}`;
  let map: GameMap;
  if (mapFile) {
    const data: FixedMapData = migrateMap(JSON.parse(fs.readFileSync(mapFile, 'utf8')));
    name = data.id ?? path.basename(mapFile).replace(/\.map\.json$/, '');
    map = createGame({ seed, mapSize, players: [{ name: 'a', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'b', god: 'zeus', isAI: false, difficulty: 'normal' }], map: data }).map;
  } else {
    map = createGame({ seed, mapSize, players: [{ name: 'a', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'b', god: 'zeus', isAI: false, difficulty: 'normal' }] }).map;
  }
  const out = path.resolve(opt('--out', `unreal/exports/${name}`)!);
  const t = buildTerrain(map, { size: Number(opt('--landscape', '1009')), name });
  const files = writeTerrain(t, out);
  const hm = t.info.heightmap as { minM: number; maxM: number };
  console.log(`${name}: ${t.w}×${t.h} tiles → Landscape ${t.size}² (${(t.info.landscape as { scaleXY: number }).scaleXY} uu por quad), relevo ${hm.minM} m … ${hm.maxM} m`);
  console.log(`  ${out}: ${files.join(', ')}`);
}
