// Alfa dos quadros assados lido do próprio atlas (docs/ART.md §1.8): o pick de um edifício só vence pela caixa do quadro
// quando o pixel sob o cursor é opaco (grama e unidades vistas atrás de um edifício alto não viram o edifício), e a
// opção "contorno de time" desenha a silhueta branca do quadro tingida atrás do corpo. A leitura é preguiçosa e fica em
// cache por textura: um canvas do tamanho do recorte + getImageData na primeira vez que o quadro é consultado (o
// ImageBitmap/imagem do atlas continua em `source.resource` depois do envio à GPU). Sem DOM (testes em Node) ou sem o
// recurso, devolve null e quem chamou cai no comportamento antigo (caixa).
import { CanvasSource, Texture } from 'pixi.js';

/** Alfa (0–255) do recorte de um quadro, na resolução do atlas (`res` px por px de mundo). */
export interface AlphaMask { w: number; h: number; res: number; data: Uint8Array }

/** Alfa mínimo para o pixel contar como "do edifício" no pick (bordas suavizadas e penumbra ficam de fora). */
export const ALPHA_HIT = 40;

/** O ponto (px de mundo, relativo ao canto superior esquerdo do recorte) cai num pixel opaco? Fora do recorte: não. */
export function maskHit(m: AlphaMask, x: number, y: number): boolean {
  const px = Math.floor(x * m.res), py = Math.floor(y * m.res);
  if (px < 0 || py < 0 || px >= m.w || py >= m.h) return false;
  return m.data[py * m.w + px] >= ALPHA_HIT;
}

const masks = new WeakMap<Texture, AlphaMask | null>();
const silhouettes = new WeakMap<Texture, Texture | null>();

/** Recorte do quadro num canvas (pixels do atlas). */
function readPixels(tex: Texture): { w: number; h: number; res: number; rgba: Uint8ClampedArray } | null {
  if (typeof document === 'undefined') return null;
  const src = tex.source;
  const res = src?.resource as CanvasImageSource | null | undefined;
  if (!src || !res) return null;
  const r = src.resolution || 1, f = tex.frame;
  const sx = Math.round(f.x * r), sy = Math.round(f.y * r);
  const w = Math.max(1, Math.round(f.width * r)), h = Math.max(1, Math.round(f.height * r));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(res, sx, sy, w, h, 0, 0, w, h);
  return { w, h, res: r, rgba: ctx.getImageData(0, 0, w, h).data };
}

/** Máscara de alfa de um quadro (cache por textura); null = indisponível (sem DOM, sem recurso, canvas recusado). */
export function textureAlpha(tex: Texture): AlphaMask | null {
  const hit = masks.get(tex);
  if (hit !== undefined) return hit;
  let m: AlphaMask | null = null;
  try {
    const p = readPixels(tex);
    if (p) {
      const data = new Uint8Array(p.w * p.h);
      for (let i = 0; i < data.length; i++) data[i] = p.rgba[i * 4 + 3];
      m = { w: p.w, h: p.h, res: p.res, data };
    }
  } catch { m = null; }
  masks.set(tex, m);
  return m;
}

/**
 * Silhueta branca do quadro (mesmo alfa, RGB = 255) para o contorno de time: tingida com a cor do jogador e desenhada
 * deslocada atrás do corpo. Mesmo tamanho e resolução do recorte (âncora no canto: quem desenha posiciona pela caixa).
 */
export function textureSilhouette(tex: Texture): Texture | null {
  const hit = silhouettes.get(tex);
  if (hit !== undefined) return hit;
  let out: Texture | null = null;
  try {
    const m = textureAlpha(tex);
    if (m) {
      const cv = document.createElement('canvas'); cv.width = m.w; cv.height = m.h;
      const ctx = cv.getContext('2d');
      if (ctx) {
        const img = ctx.createImageData(m.w, m.h);
        for (let i = 0; i < m.data.length; i++) { const o = i * 4; img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255; img.data[o + 3] = m.data[i]; }
        ctx.putImageData(img, 0, 0);
        out = new Texture({ source: new CanvasSource({ resource: cv, resolution: m.res }) });
      }
    }
  } catch { out = null; }
  silhouettes.set(tex, out);
  return out;
}
