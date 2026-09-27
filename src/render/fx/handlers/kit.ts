// Apoio dos handlers dos PODERES (lote poderes-luz da Etapa 5, docs/ART.md Apêndice F): emissão contínua por taxa,
// pontos aleatórios num disco, e `SpriteSet` — sprites próprios de um efeito (colunas de luz, o canal do raio, a sombra
// da tempestade) com envelope de alfa e escala NÃO uniforme no relógio de JOGO. As partículas (particles.ts) têm escala
// uniforme; uma coluna de luz precisa ser alta e estreita, e é um punhado de sprites por poder, não milhares.
import { Sprite, type Container, type Texture } from 'pixi.js';

const R = Math.random;
/** Emissão contínua: acumula `rate`/s em `s.acc` e devolve quantas saem neste passo. */
export function every(s: { acc: number }, rate: number, dt: number): number {
  s.acc += rate * dt;
  const n = Math.floor(s.acc);
  s.acc -= n;
  return n;
}
/** Ponto uniforme num disco de raio `r` (mesma unidade de r) em volta de (x, y). */
export function inDisc(x: number, y: number, r: number, out: { x: number; y: number }): { x: number; y: number } {
  const a = R() * Math.PI * 2, d = Math.sqrt(R()) * r;
  out.x = x + Math.cos(a) * d; out.y = y + Math.sin(a) * d;
  return out;
}
/** Suavização (0–1 → 0–1). */
export const ease = (t: number): number => { const k = t < 0 ? 0 : t > 1 ? 1 : t; return k * k * (3 - 2 * k); };
export const easeOut = (t: number): number => { const k = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - (1 - k) * (1 - k); };

export interface SpriteSpec {
  x: number; y: number;
  /** Vida (s de jogo) e fração dela para acender (alfa 0 → `alpha`); depois apaga linearmente até o fim. */
  life: number; fadeIn?: number; alpha: number;
  /** Escala (x, y) no começo e no fim. */
  sx0: number; sy0: number; sx1?: number; sy1?: number;
  /** Deslocamento vertical (px) ao longo da vida (a coluna sobe). */
  rise?: number;
  tint?: number; blend?: 'normal' | 'add'; anchorX?: number; anchorY?: number; rot?: number;
  /** Atraso (s) antes de aparecer. */
  delay?: number;
  /** Cintila: multiplica o alfa por 1 − flicker·ruído (0 = firme). */
  flicker?: number;
}
interface Item { sp: Sprite; t0: number; o: SpriteSpec }

/** Sprites de um efeito, animados pelo relógio de jogo; `update` devolve se ainda há algum vivo. */
export class SpriteSet {
  private list: Item[] = [];
  add(parent: Container, tex: Texture, clock: number, o: SpriteSpec): Sprite {
    const sp = new Sprite(tex);
    sp.anchor.set(o.anchorX ?? 0.5, o.anchorY ?? 0.5);
    sp.blendMode = o.blend ?? 'add';
    sp.tint = o.tint ?? 0xffffff;
    sp.rotation = o.rot ?? 0;
    sp.position.set(o.x, o.y);
    sp.scale.set(o.sx0, o.sy0);
    sp.alpha = 0;
    sp.visible = false;
    parent.addChild(sp);
    this.list.push({ sp, t0: clock + (o.delay ?? 0), o });
    return sp;
  }
  get size(): number { return this.list.length; }
  update(clock: number): boolean {
    let alive = false;
    for (const it of this.list) {
      const o = it.o, t = (clock - it.t0) / o.life;
      if (t < 0 || t >= 1) { it.sp.visible = false; if (t < 0) alive = true; continue; }
      alive = true;
      const fin = o.fadeIn ?? 0.15;
      let a = t < fin ? o.alpha * (t / Math.max(1e-6, fin)) : o.alpha * (1 - (t - fin) / Math.max(1e-6, 1 - fin));
      if (o.flicker) a *= 1 - o.flicker * Math.random();
      it.sp.visible = a > 0.003;
      it.sp.alpha = a;
      it.sp.scale.set(o.sx0 + ((o.sx1 ?? o.sx0) - o.sx0) * t, o.sy0 + ((o.sy1 ?? o.sy0) - o.sy0) * t);
      if (o.rise) it.sp.y = o.y - o.rise * t;
    }
    return alive;
  }
  destroy(): void { for (const it of this.list) it.sp.destroy(); this.list.length = 0; }
}

/** Altura visual de uma unidade (px de mundo do pé ao topo): a régua `top` da arte assada, ou ~0,55 tile no procedural. */
export function unitTop(fx: { baked: boolean; host: { art: { unit(id: string): { top: number } | null } } }, type: string): number {
  const a = fx.baked ? fx.host.art.unit(type) : null;
  return a ? Math.max(10, Math.min(64, a.top)) : 18;
}

/** Coluna de luz (textura `glow` esticada na vertical, aditiva): base no pé (x, y), `h` px de altura, `w` de largura. */
export function shaft(set: SpriteSet, parent: Container, glow: Texture, clock: number, x: number, y: number, h: number, w: number, tint: number, life: number, alpha = 0.9, delay = 0): Sprite {
  // o brilho do `glow` cai a ~25 % na metade do raio: a coluna visível tem ≈ metade do quadro esticado
  return set.add(parent, glow, clock, { x, y: y - h * 0.5, life, fadeIn: 0.18, alpha, sx0: (w * 2) / 32, sy0: (h * 0.8) / 32, sx1: (w * 1.3) / 32, sy1: (h * 2.1) / 32, rise: h * 0.25, tint, blend: 'add', delay });
}
