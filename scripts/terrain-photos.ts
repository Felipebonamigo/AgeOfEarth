// Texturas fotográficas CC0 do terreno (docs/ART.md Apêndice I, "Terreno fotográfico"): baixa do Poly Haven (todas as
// texturas do site são CC0) o albedo, a normal (DirectX: y para baixo, a mesma convenção de materials.ts), o
// deslocamento e a oclusão de cada material em 1k, reduz para 512² (média 2×2), puxa a cor média e a altura para as dos
// materiais procedurais (o tom mediterrâneo do jogo e o equilíbrio do "height blend" do shader continuam os mesmos) e
// grava em public/terrain/: <material>-albedo.png (RGB), <material>-normal.png (RGB) e <material>-hao.png (R = altura,
// G = oclusão), todos com alfa 255 — o navegador decodifica PNG pelo canvas, que pré-multiplica o alfa, por isso a altura
// não vai no alfa do albedo. src/render/terrain/photos.ts carrega em runtime; sem os arquivos, fica o procedural.
// Uso: npm run art:terrain [-- --check]  (= npx tsx scripts/terrain-photos.ts)
//   baixa (cache em art/src/terrain-photos, fora do git), processa e grava public/terrain/ + public/terrain/fotos.json;
//   --check: não grava; falha se a saída não for a que o script gera hoje.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { generateMaterials, type MaterialTex } from '../src/render/terrain/materials';
import { PHOTO_MATERIALS, PHOTO_SIZE, type PhotoMaterial } from '../src/render/terrain/photos';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'art', 'src', 'terrain-photos');
const OUT = path.join(ROOT, 'public', 'terrain');

/**
 * De onde vem cada material e como ajustar. `world` = metros que a foto cobre (o material cobre 4 tiles = 8 m: fotos
 * menores ficam ampliadas, o que esconde a repetição — o bombing do shader gira e desloca as cópias); `tone` = quanto a
 * cor média vai para a do procedural (0 = foto pura, 1 = média igual); `contrast` = escala do desvio da cor em torno da
 * média; `normal` = força da normal da foto; `ao` = quanto da oclusão da foto entra; `shift` = ajuste somado à cor
 * média alvo (a foto tem menos variação que o procedural, e a mesma média sem as pontas de palha lia verde de gramado);
 * `sat` = saturação do desvio em torno da média (1 = a da foto).
 */
interface Source { id: string; name: string; authors: string[]; world: number; tone: number; contrast: number; normal: number; ao: number; shift?: [number, number, number]; sat?: number }
export const SOURCES: Record<PhotoMaterial, Source> = {
  grass: { id: 'forrest_ground_01', name: 'Forest Ground 01', authors: ['Rob Tuytel'], world: 2, tone: 0.9, contrast: 1.15, normal: 0.8, ao: 0.6, shift: [5, 0, -2], sat: 0.9 },
  dirt: { id: 'dry_ground_rocks', name: 'Dry Ground Rocks', authors: ['Rob Tuytel'], world: 4, tone: 0.7, contrast: 1.0, normal: 1.0, ao: 0.7 },
  sand: { id: 'dense_sand', name: 'Dense Sand', authors: ['Dimitrios Savva'], world: 1.8, tone: 0.75, contrast: 1.0, normal: 0.8, ao: 0.6 },
  rock: { id: 'marble_cliff_06', name: 'Marble Cliff 06', authors: ['Amal Kumar'], world: 8.14, tone: 0.85, contrast: 0.85, normal: 1.0, ao: 0.8 },
};
const MAPS = { diff: 'Diffuse', nor: 'nor_dx', disp: 'Displacement', ao: 'AO' } as const;
const fileUrl = (id: string, map: string) => `https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/${id}/${id}_${map}_1k.png`;
const MAP_SUFFIX: Record<keyof typeof MAPS, string> = { diff: 'diff', nor: 'nor_dx', disp: 'disp', ao: 'ao' };

function fetchMap(id: string, key: keyof typeof MAPS): PNG {
  const dir = path.join(CACHE, id);
  const file = path.join(dir, `${id}_${MAP_SUFFIX[key]}_1k.png`);
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    // curl respeita o proxy do ambiente (HTTPS_PROXY); o fetch do Node não
    execFileSync('curl', ['-sSf', '--max-time', '120', '-o', file, fileUrl(id, MAP_SUFFIX[key])], { stdio: 'inherit' });
  }
  return PNG.sync.read(readFileSync(file));
}

/** Média 2×2 sucessiva até `size` (a foto é tileável: as bordas continuam tileáveis). */
function downTo(png: PNG, size: number): Float32Array {
  let w = png.width, data = Float32Array.from(png.data);
  while (w > size) {
    const h = w >> 1, out = new Float32Array(h * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) for (let c = 0; c < 4; c++) {
      const i = (y * 2 * w + x * 2) * 4 + c;
      out[(y * h + x) * 4 + c] = (data[i] + data[i + 4] + data[i + w * 4] + data[i + w * 4 + 4]) / 4;
    }
    data = out; w = h;
  }
  if (w !== size) throw new Error(`textura de ${png.width}² não reduz para ${size}²`);
  return data;
}

const mean = (a: ArrayLike<number>, c: number, stride = 4) => { let s = 0, n = 0; for (let i = c; i < a.length; i += stride) { s += a[i]; n++; } return s / n; };
const u8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
/** Altura por quantis: o texel de posto r na foto (canal R) recebe o valor de posto r da altura procedural (alfa). */
function quantileMap(photo: Float32Array, proc: Uint8Array, n: number): Uint8Array {
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => photo[a * 4] - photo[b * 4] || a - b);
  const target = new Uint8Array(n);
  for (let i = 0; i < n; i++) target[i] = proc[i * 4 + 3];
  target.sort();
  const out = new Uint8Array(n);
  for (let r = 0; r < n; r++) out[order[r]] = target[r];
  return out;
}

/** Processa um material: devolve os três PNGs (RGBA, alfa 255) e as estatísticas antes/depois. */
function processMaterial(mat: PhotoMaterial, src: Source, proc: MaterialTex) {
  const N = PHOTO_SIZE, n = N * N;
  const diff = downTo(fetchMap(src.id, 'diff'), N), nor = downTo(fetchMap(src.id, 'nor'), N);
  const disp = downTo(fetchMap(src.id, 'disp'), N), ao = downTo(fetchMap(src.id, 'ao'), N);
  const albedo = Buffer.alloc(n * 4), normal = Buffer.alloc(n * 4), hao = Buffer.alloc(n * 4);
  // cor: desvio da foto em torno da sua média × contraste, sobre a média puxada para a do procedural
  const target = [0, 1, 2].map((c) => mean(proc.albedo, c)), photo = [0, 1, 2].map((c) => mean(diff, c));
  const base = photo.map((m, c) => m + (target[c] + (src.shift?.[c] ?? 0) - m) * src.tone);
  const sat = src.sat ?? 1;
  // altura: a distribuição da foto vira a do procedural, por quantis (o shader mistura os materiais por altura, com
  // peso (h + 0,2)⁶ — uma foto com muitos texels em 0 escurecia manchas inteiras; os quantis mantêm o mínimo, a média e
  // o equilíbrio entre materiais do procedural, e a FORMA vem da foto)
  const height = quantileMap(disp, proc.albedo, n);
  const pm = mean(proc.albedo, 3);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    // desvio em torno da média: o cinza (luminância) inteiro e o resto (matiz) × sat
    const d = [0, 1, 2].map((c) => (diff[o + c] - photo[c]) * src.contrast), dl = (d[0] + d[1] + d[2]) / 3;
    for (let c = 0; c < 3; c++) albedo[o + c] = u8(base[c] + dl + (d[c] - dl) * sat);
    // normal DirectX (y para baixo, como materials.ts): xy × força, renormaliza
    let nx = (nor[o] / 255) * 2 - 1, ny = (nor[o + 1] / 255) * 2 - 1;
    nx *= src.normal; ny *= src.normal;
    const nz = Math.sqrt(Math.max(0.05, 1 - Math.min(0.95, nx * nx + ny * ny)));
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    normal[o] = u8(127.5 + (nx / l) * 127.5); normal[o + 1] = u8(127.5 + (ny / l) * 127.5); normal[o + 2] = u8(127.5 + (nz / l) * 127.5);
    hao[o] = height[i];
    hao[o + 1] = u8(255 - (255 - ao[o]) * src.ao);
    albedo[o + 3] = normal[o + 3] = hao[o + 3] = 255;
  }
  const png = (data: Buffer) => { const p = new PNG({ width: N, height: N }); data.copy(p.data); return PNG.sync.write(p, { colorType: 2 }); };
  return {
    files: { [`${mat}-albedo.png`]: png(albedo), [`${mat}-normal.png`]: png(normal), [`${mat}-hao.png`]: png(hao) },
    stats: { photo: photo.map(Math.round), target: target.map(Math.round), out: [0, 1, 2].map((c) => Math.round(mean(albedo, c))), height: [Math.round(mean(hao, 0)), Math.round(pm), height.reduce((a, b) => Math.min(a, b), 255), height.reduce((a, b) => Math.max(a, b), 0)] },
  };
}

function main(): void {
  const check = process.argv.includes('--check');
  const proc = generateMaterials(PHOTO_SIZE);
  const out: Record<string, Buffer> = {};
  const index = { version: 1, size: PHOTO_SIZE, site: 'https://polyhaven.com', license: 'CC0-1.0', materials: {} as Record<string, unknown> };
  for (const mat of PHOTO_MATERIALS) {
    const src = SOURCES[mat];
    const r = processMaterial(mat, src, proc[mat]);
    Object.assign(out, r.files);
    index.materials[mat] = { id: src.id, name: src.name, url: `https://polyhaven.com/a/${src.id}`, authors: src.authors, license: 'CC0-1.0', worldMeters: src.world };
    console.log(`  ${mat.padEnd(5)} ${src.id.padEnd(20)} cor foto ${r.stats.photo} → ${r.stats.out} (procedural ${r.stats.target}); altura média ${r.stats.height[0]} (procedural ${r.stats.height[1]}), ${r.stats.height[2]}–${r.stats.height[3]}`);
  }
  out['fotos.json'] = Buffer.from(JSON.stringify(index, null, 2) + '\n');
  if (check) {
    const bad = Object.entries(out).filter(([f, b]) => !existsSync(path.join(OUT, f)) || !readFileSync(path.join(OUT, f)).equals(b)).map(([f]) => f);
    if (bad.length) { console.error(`public/terrain desatualizado: ${bad.join(', ')} (rode npx tsx scripts/terrain-photos.ts)`); process.exit(1); }
    console.log('public/terrain em dia');
    return;
  }
  mkdirSync(OUT, { recursive: true });
  for (const [f, b] of Object.entries(out)) writeFileSync(path.join(OUT, f), b);
  const kb = Object.values(out).reduce((s, b) => s + b.length, 0) / 1024;
  console.log(`public/terrain: ${Object.keys(out).length} arquivos, ${kb.toFixed(0)} KB`);
}

main();
