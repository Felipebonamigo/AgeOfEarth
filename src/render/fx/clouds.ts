// Sombras de nuvens (Etapa 9 do visual, docs/ART.md Apêndice I): manchas de sombra suaves e grandes (~8–20 tiles) que
// atravessam o mapa devagar com o vento, escurecendo terreno, edifícios, unidades e props juntos (a camada fica acima deles
// e abaixo das barras de vida e da névoa) — um dos truques mais baratos de "mundo vivo" de um RTS. Um TilingSprite com uma
// textura periódica 256² em cinza (branco = sem sombra, a mancha escurece até 1 − MAX_SHADE) em blend multiply, ancorado
// no MUNDO (não na tela): a sombra fica presa ao chão ao rolar a câmera e só se move com o vento. Relógio = tempo de jogo
// (pausa congela). Só nos presets Médio e Alto (o shader completo do terreno); no editor fica desligada.
import { BufferImageSource, Texture, TilingSprite, type Container } from 'pixi.js';
import { hash01 } from '../palette';
import { TILE } from '../../core/constants';

/** Lado da textura periódica (px). */
export const CLOUD_SIZE = 256;
/** Tiles cobertos por uma repetição da textura. */
export const CLOUD_TILES = 56;
/** Escurecimento máximo no miolo de uma nuvem (multiplica a cor por 1 − isto). */
export const MAX_SHADE = 0.2;
/** Vento (tiles/s de jogo): a sombra anda para sudeste devagar. */
export const WIND = { x: 0.55, y: 0.32 } as const;

/**
 * Pixels RGBA da textura: fBm periódico de ruído de valor (4 oitavas a partir de 4 células) recortado em manchas de borda
 * suave (cobertura ~35 %). Determinístico; função pura (testada em Node).
 */
export function cloudShadowPixels(size = CLOUD_SIZE, seed = 931): Uint8Array {
  const n = new Float32Array(size * size);
  let amp = 1, tot = 0;
  for (let o = 0; o < 4; o++, amp *= 0.5) {
    const c = 4 << o, per = size / c;
    for (let y = 0; y < size; y++) {
      const fy = y / per, j = Math.floor(fy), ty = fy - j, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = x / per, i = Math.floor(fx), tx = fx - i, sx = tx * tx * (3 - 2 * tx);
        const a = hash01(i % c, j % c, seed + o), b = hash01((i + 1) % c, j % c, seed + o), cc = hash01(i % c, (j + 1) % c, seed + o), d = hash01((i + 1) % c, (j + 1) % c, seed + o);
        const top = a + (b - a) * sx, bot = cc + (d - cc) * sx;
        n[y * size + x] += amp * (top + (bot - top) * sy);
      }
    }
    tot += amp;
  }
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = n[i] / tot;
    const k = Math.max(0, Math.min(1, (v - 0.52) / 0.16)), cloud = k * k * (3 - 2 * k);
    const g = Math.round(255 * (1 - MAX_SHADE * cloud));
    out[i * 4] = g; out[i * 4 + 1] = g; out[i * 4 + 2] = Math.min(255, g + Math.round(6 * cloud));   // sombra um tico azulada (céu)
    out[i * 4 + 3] = 255;
  }
  return out;
}

export class CloudShadows {
  private sprite: TilingSprite | null = null;
  enabled = false;

  /** Liga/desliga dentro de `layer` (desligado: o sprite some — custo zero). */
  set(layer: Container, on: boolean): void {
    this.enabled = on;
    if (on && !this.sprite) {
      const tex = new Texture({ source: new BufferImageSource({ resource: cloudShadowPixels(), width: CLOUD_SIZE, height: CLOUD_SIZE, format: 'rgba8unorm', scaleMode: 'linear', addressMode: 'repeat', alphaMode: 'no-premultiply-alpha' }) });
      const s = new TilingSprite({ texture: tex, width: 1, height: 1 });
      s.blendMode = 'multiply'; s.eventMode = 'none';
      const k = (CLOUD_TILES * TILE) / CLOUD_SIZE;
      s.tileScale.set(k, k);
      this.sprite = s;
    }
    if (this.sprite) { if (on && this.sprite.parent !== layer) layer.addChild(this.sprite); this.sprite.visible = on; }
  }
  /** Cobre a vista `view` (px de mundo) com a sombra ancorada no mundo e deslocada pelo vento no tempo `t` (s de jogo). */
  update(t: number, view: { x: number; y: number; w: number; h: number }, hidden = false): void {
    const s = this.sprite;
    if (!this.enabled || !s) return;
    s.visible = !hidden;
    if (hidden) return;
    s.position.set(view.x, view.y); s.width = view.w; s.height = view.h;
    // tilePosition em px do sprite: −view mantém a textura presa ao mundo; o vento a desloca
    s.tilePosition.set(-view.x + WIND.x * t * TILE, -view.y + WIND.y * t * TILE);
  }
}
