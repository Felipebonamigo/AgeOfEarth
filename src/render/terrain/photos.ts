// Materiais fotográficos do terreno (docs/ART.md Apêndice I, "Terreno fotográfico"): texturas CC0 do Poly Haven
// preparadas por scripts/terrain-photos.ts em public/terrain/ (albedo RGB, normal RGB e altura/oclusão em R/G de um
// terceiro PNG, todos opacos). Carrega no navegador e monta os mesmos MaterialTex do gerador procedural (albedo com a
// altura no alfa, normal com a oclusão no alfa), em 512² e, reduzido 2×2, em 256² (preset baixo). Sem os arquivos ou
// fora do navegador, devolve null e o terreno fica no procedural (materials.ts). Só renderização: nada aqui toca o núcleo.
import type { MaterialSize, MaterialTex } from './materials';
import { SUN_DIR } from '../palette';

export const PHOTO_MATERIALS = ['grass', 'dirt', 'sand', 'rock'] as const;
export type PhotoMaterial = (typeof PHOTO_MATERIALS)[number];
export type PhotoSet = Record<PhotoMaterial, MaterialTex>;
/** Lado das texturas em public/terrain (o preset baixo reduz para 256² ao carregar). */
export const PHOTO_SIZE = 512;

/** Junta albedo (RGB) + altura (R do hao) e normal (RGB) + oclusão (G do hao) nos dois RGBA que o shader espera. */
export function packPhoto(albedo: Uint8ClampedArray | Uint8Array, normal: Uint8ClampedArray | Uint8Array, hao: Uint8ClampedArray | Uint8Array): MaterialTex {
  const n = albedo.length, a = new Uint8Array(n), nm = new Uint8Array(n);
  for (let i = 0; i < n; i += 4) {
    a[i] = albedo[i]; a[i + 1] = albedo[i + 1]; a[i + 2] = albedo[i + 2]; a[i + 3] = hao[i];
    nm[i] = normal[i]; nm[i + 1] = normal[i + 1]; nm[i + 2] = normal[i + 2]; nm[i + 3] = hao[i + 1];
  }
  return { albedo: a, normal: nm };
}

/** Média 2×2 de um RGBA size² (tileável continua tileável); a normal é renormalizada depois da média. */
export function halveRGBA(src: Uint8Array, size: number, isNormal = false): Uint8Array {
  const h = size >> 1, out = new Uint8Array(h * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) {
    const o = (y * h + x) * 4, i = (y * 2 * size + x * 2) * 4;
    for (let c = 0; c < 4; c++) out[o + c] = (src[i + c] + src[i + 4 + c] + src[i + size * 4 + c] + src[i + size * 4 + 4 + c] + 2) >> 2;
    if (isNormal) {
      const nx = out[o] / 127.5 - 1, ny = out[o + 1] / 127.5 - 1, nz = out[o + 2] / 127.5 - 1, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      out[o] = Math.round(127.5 + (nx / l) * 127.5); out[o + 1] = Math.round(127.5 + (ny / l) * 127.5); out[o + 2] = Math.round(127.5 + (nz / l) * 127.5);
    }
  }
  return out;
}
export function halveMaterial(m: MaterialTex, size: number): MaterialTex { return { albedo: halveRGBA(m.albedo, size), normal: halveRGBA(m.normal, size, true) }; }
/**
 * Luz assada no albedo para o shader simples (preset baixo, o único que usa 256²): o albedo do Poly Haven vem sem
 * sombra (PBR), e sem normais nem oclusão no shader ele ficava chapado e desbotado. Multiplica cada texel pela luz do
 * shader completo (ambiente 0,40 + sol 0,86 × n·sol, a mesma de shaders.ts) dividida pela de um chão plano — o tom médio
 * não muda — e pela oclusão a 60 %.
 */
export function bakeShade(m: MaterialTex): MaterialTex {
  const l = Math.sqrt(SUN_DIR.x * SUN_DIR.x + SUN_DIR.y * SUN_DIR.y + SUN_DIR.z * SUN_DIR.z);
  const sx = SUN_DIR.x / l, sy = SUN_DIR.y / l, sz = SUN_DIR.z / l, flat = 0.4 + 0.86 * sz;
  const a = m.albedo.slice();
  for (let i = 0; i < a.length; i += 4) {
    const nx = m.normal[i] / 127.5 - 1, ny = m.normal[i + 1] / 127.5 - 1, nz = m.normal[i + 2] / 127.5 - 1;
    const f = ((0.4 + 0.86 * Math.max(0, nx * sx + ny * sy + nz * sz)) / flat) * (1 - 0.6 * (1 - m.normal[i + 3] / 255));
    for (let c = 0; c < 3; c++) a[i + c] = Math.min(255, Math.round(a[i + c] * f));
  }
  return { albedo: a, normal: m.normal };
}

/** Pixels RGBA de um PNG opaco (sem conversão de cor nem pré-multiplicação: as normais e a altura vão cruas). */
async function decode(url: string): Promise<Uint8ClampedArray> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = new OffscreenCanvas(bmp.width, bmp.height);
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('sem contexto 2d');
  g.drawImage(bmp, 0, 0);
  const data = g.getImageData(0, 0, bmp.width, bmp.height).data;
  if (bmp.width !== PHOTO_SIZE || bmp.height !== PHOTO_SIZE) throw new Error(`${url}: ${bmp.width}×${bmp.height}, esperado ${PHOTO_SIZE}²`);
  bmp.close();
  return data;
}

let loading: Promise<PhotoSet | null> | null = null;
let settled = false;
const bySize = new Map<number, PhotoSet>();
/** O carregamento terminou (com ou sem fotos)? A tela de carregamento espera por isto (main.ts), com o teto dela. */
export function photosSettled(): boolean { return settled; }
/** Começa a carregar as fotos (uma vez); resolve null se não houver navegador ou se algum arquivo faltar. */
export function loadPhotos(base = `${import.meta.env?.BASE_URL ?? './'}terrain/`): Promise<PhotoSet | null> {
  if (loading) return loading;
  if (typeof fetch !== 'function' || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') { settled = true; return (loading = Promise.resolve(null)); }
  loading = (async () => {
    try {
      const entries = await Promise.all(PHOTO_MATERIALS.map(async (m) => {
        const [a, n, h] = await Promise.all(['albedo', 'normal', 'hao'].map((k) => decode(`${base}${m}-${k}.png`)));
        return [m, packPhoto(a, n, h)] as const;
      }));
      const set = Object.fromEntries(entries) as PhotoSet;
      bySize.set(PHOTO_SIZE, set);
      return set;
    } catch (e) {
      console.warn('terreno: texturas fotográficas indisponíveis, fica o procedural —', (e as Error).message);
      return null;
    } finally { settled = true; }
  })();
  return loading;
}
/** Fotos já carregadas no tamanho pedido (reduz 512² → 256² na primeira vez); null se ainda não chegaram. */
export function photosFor(size: MaterialSize): PhotoSet | null {
  const hit = bySize.get(size);
  if (hit) return hit;
  const full = bySize.get(PHOTO_SIZE);
  if (!full || size > PHOTO_SIZE) return null;
  let set = full, s: number = PHOTO_SIZE;
  while (s > size) { const prev = s; set = Object.fromEntries(PHOTO_MATERIALS.map((m) => [m, halveMaterial(set[m], prev)])) as PhotoSet; s >>= 1; }
  // 256² = preset baixo = shader simples (sem luz): a luz vai assada no albedo
  if (size < PHOTO_SIZE) set = Object.fromEntries(PHOTO_MATERIALS.map((m) => [m, bakeShade(set[m])])) as PhotoSet;
  bySize.set(size, set);
  return set;
}
