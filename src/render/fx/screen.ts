// Camada de TELA dos efeitos (lote poderes-luz da Etapa 5, docs/ART.md Apêndice F): o que um poder GLOBAL precisa
// mostrar fora do mundo — a vinheta branca da Trégua, a vinheta e o olho dourados do Oráculo, o clarão do Raio de Zeus
// e os EMBLEMAS dos poderes globais em curso (pomba da Trégua, olho do Oráculo) com o tempo que falta num aro, no alto da
// tela, abaixo da barra de recursos. Fica na `stage`, entre o mundo e o overlay da interface: não treme com a câmera,
// não passa pelo ciclo de luz (filtro do mundo) nem pela névoa. Relógio de JOGO (o clarão congela na pausa, como as
// partículas).
// As texturas (vinheta, olho, pomba) são desenhadas UMA vez em canvas (sem DOM — Node/testes — Texture.EMPTY): a vinheta
// é um gradiente suave esticado na tela inteira e os ícones são interface; não precisam do atlas `fx` (não são partículas).
import { Container, Graphics, Sprite, Texture } from 'pixi.js';

export type ScreenBlend = 'normal' | 'add';
export type EmblemKind = 'dove' | 'eye';
interface Vig { sp: Sprite; want: number; a: number; tint: number }
interface Emb { root: Container; icon: Sprite; arc: Graphics; want: boolean; a: number; frac: number; tint: number; order: number }

const TEX: Record<string, Texture | null> = {};
const canvas = (w: number, h: number): CanvasRenderingContext2D | null => {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  return cv.getContext('2d');
};
function cached(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): Texture {
  const hit = TEX[key];
  if (hit) return hit;
  const g = canvas(w, h);
  if (!g) return Texture.EMPTY;
  draw(g);
  return (TEX[key] = Texture.from(g.canvas));
}

/** Vinheta: transparente no meio, opaca só na faixa da borda (branca: a cor vem do tint), com a curva suave de uma lente. */
export function vignetteTexture(): Texture {
  return cached('vignette', 256, 256, (g) => {
    const img = g.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const u = (x + 0.5) / 128 - 1, v = (y + 0.5) / 128 - 1;
      // distância "arredondada ao retângulo" (a vinheta segue os cantos da tela esticada)
      const r = Math.pow(Math.pow(Math.abs(u), 3.2) + Math.pow(Math.abs(v), 3.2), 1 / 3.2);
      const t = Math.min(1, Math.max(0, (r - 0.66) / 0.5));
      const a = t * t * (3 - 2 * t);
      const k = (y * 256 + x) * 4;
      img.data[k] = 255; img.data[k + 1] = 255; img.data[k + 2] = 255; img.data[k + 3] = Math.round(255 * a);
    }
    g.putImageData(img, 0, 0);
  });
}

/** A amêndoa do olho (caminho no contexto), centrada em (cx, cy), meia-largura hw e meia-altura hh. */
function almond(g: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number): void {
  g.beginPath();
  g.moveTo(cx - hw, cy);
  g.bezierCurveTo(cx - hw * 0.45, cy - hh * 1.35, cx + hw * 0.45, cy - hh * 1.35, cx + hw, cy);
  g.bezierCurveTo(cx + hw * 0.45, cy + hh * 1.35, cx - hw * 0.45, cy + hh * 1.35, cx - hw, cy);
  g.closePath();
}
/** O olho (íris em anel, pupila vazada, reflexo) em (cx, cy): usado no olho grande e no emblema. */
function eye(g: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number, line: number, glow: number): void {
  almond(g, cx, cy, hw, hh);
  const inner = g.createRadialGradient(cx, cy, 2, cx, cy, hw);
  inner.addColorStop(0, 'rgba(255,255,255,0.28)'); inner.addColorStop(1, 'rgba(255,255,255,0.05)');
  g.fillStyle = inner; g.fill();
  g.shadowColor = 'rgba(255,255,255,0.9)'; g.shadowBlur = glow;
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = line; almond(g, cx, cy, hw, hh); g.stroke();
  g.shadowBlur = 0;
  const R = hh * 0.78;
  const iris = g.createRadialGradient(cx, cy, R * 0.38, cx, cy, R);
  iris.addColorStop(0, 'rgba(255,255,255,0)'); iris.addColorStop(0.08, 'rgba(255,255,255,0.95)');
  iris.addColorStop(0.55, 'rgba(255,255,255,0.6)'); iris.addColorStop(0.92, 'rgba(255,255,255,0.85)'); iris.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = iris; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  if (R > 12) {
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.42, cy + Math.sin(a) * R * 0.42); g.lineTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9); g.stroke(); }
  }
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(cx - R * 0.3, cy - R * 0.32, Math.max(1.5, R * 0.14), Math.max(1, R * 0.1), -0.5, 0, Math.PI * 2); g.fill();
}

/**
 * Olho do Oráculo (Apolo): amêndoa de luz com a íris em anel e a pupila vazada, raios curtos em volta — branco sobre
 * transparente para ser tingido de dourado e somado (aditivo) à tela. 320×160.
 */
export function eyeTexture(): Texture {
  return cached('eye', 320, 160, (g) => {
    const cx = 160, cy = 80, hw = 118, hh = 50;
    g.save(); g.translate(cx, cy);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2, L = 18 + 14 * Math.abs(Math.sin(a));
      const x0 = Math.cos(a) * (hw * 0.62), y0 = Math.sin(a) * (hh * 0.95), x1 = Math.cos(a) * (hw * 0.62 + L), y1 = Math.sin(a) * (hh * 0.95 + L);
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = gr; g.lineWidth = i % 2 ? 2 : 3.2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    g.restore();
    eye(g, cx, cy, hw, hh, 4, 14);
  });
}

/** Sombra macia escura em volta de um ícone (lê sobre grama clara e sobre água escura). */
function shadowed(g: CanvasRenderingContext2D, draw: () => void): void {
  g.save(); g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 7; draw(); g.restore();
  draw();
}
/** Emblema: a pomba da paz com o ramo de oliveira no bico (Trégua) ou o olho (Oráculo), 64×64, branco com sombra. */
export function emblemTexture(kind: EmblemKind): Texture {
  return cached(`emblem-${kind}`, 64, 64, (g) => {
    if (kind === 'eye') { shadowed(g, () => eye(g, 32, 32, 25, 11, 2.4, 4)); return; }
    shadowed(g, () => {
      g.fillStyle = 'rgba(255,255,255,1)';
      // asa de trás (mais apagada), corpo, cabeça, cauda em leque, asa da frente
      g.globalAlpha = 0.7;
      g.beginPath(); g.moveTo(33, 35); g.bezierCurveTo(36, 23, 44, 13, 53, 9); g.bezierCurveTo(51, 19, 47, 29, 42, 37); g.closePath(); g.fill();
      g.globalAlpha = 1;
      g.beginPath(); g.ellipse(33, 39, 14, 6.5, -0.12, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(18, 35, 5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(45, 38); g.lineTo(58, 32); g.lineTo(60, 39); g.lineTo(58, 46); g.lineTo(45, 42); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(27, 37); g.bezierCurveTo(22, 26, 25, 13, 34, 5); g.bezierCurveTo(37, 15, 40, 26, 39, 37); g.closePath(); g.fill();
      // bico e o ramo de oliveira
      g.beginPath(); g.moveTo(13.5, 34); g.lineTo(8.5, 36); g.lineTo(13.5, 37); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(10, 36); g.quadraticCurveTo(6, 42, 4, 49); g.stroke();
      for (const [x, y, a] of [[7.5, 41, -0.6], [5.2, 45.5, 0.7], [5.5, 44, -0.9], [4, 49, 0.3]] as const) { g.beginPath(); g.ellipse(x, y, 3, 1.3, a, 0, Math.PI * 2); g.fill(); }
    });
  });
}

/**
 * Efeitos de tela: um clarão (o maior pedido vence; aparece inteiro no quadro do pedido e apaga em ~0,2 s de jogo),
 * vinhetas por nome e emblemas por nome — os dois pedidos a cada quadro pelo observador do poder; o que não é pedido apaga.
 * `root` vai para a stage (renderer), acima do mundo.
 */
export class ScreenFx {
  readonly root = new Container();
  w = 0; h = 0;
  private flashSp: Sprite | null = null;
  private flash0 = 0;
  private flashAge = 0;
  private flashA = 0;
  private vigs = new Map<string, Vig>();
  private embs = new Map<string, Emb>();
  private embOrder = 0;
  constructor() { this.root.eventMode = 'none'; }

  /** Clarão na tela inteira (aditivo, `alpha` 0–1). */
  flash(alpha: number, tint = 0xffffff): void {
    if (alpha <= this.flashA) return;
    this.flash0 = this.flashA = alpha; this.flashAge = 0;
    if (!this.flashSp) { this.flashSp = new Sprite(Texture.WHITE); this.flashSp.blendMode = 'add'; this.root.addChildAt(this.flashSp, 0); }
    this.flashSp.tint = tint;
  }
  /** Vinheta `id` neste quadro: alfa-alvo nas bordas, cor e mistura (a vinheta se aproxima do alvo em ~0,25 s). */
  vignette(id: string, alpha: number, tint: number, blend: ScreenBlend = 'normal'): void {
    let v = this.vigs.get(id);
    if (!v) {
      const sp = new Sprite(vignetteTexture()); sp.blendMode = blend; sp.alpha = 0;
      this.root.addChild(sp);
      v = { sp, want: 0, a: 0, tint };
      this.vigs.set(id, v);
    }
    v.want = Math.max(v.want, alpha); v.tint = tint;
  }
  /** Emblema `id` neste quadro: o ícone e o aro do tempo que falta (`frac` 0–1), na cor `tint`. */
  emblem(id: string, kind: EmblemKind, frac: number, tint: number): void {
    let e = this.embs.get(id);
    if (!e) {
      const root = new Container();
      const icon = new Sprite(emblemTexture(kind)); icon.anchor.set(0.5); icon.scale.set(0.72);
      const arc = new Graphics();
      root.addChild(arc, icon); root.alpha = 0;
      this.root.addChild(root);
      e = { root, icon, arc, want: false, a: 0, frac, tint, order: this.embOrder++ };
      this.embs.set(id, e);
    }
    e.want = true; e.frac = Math.max(0, Math.min(1, frac)); e.tint = tint;
  }
  /** Alfa atual da vinheta `id` / do emblema `id` (diagnóstico e testes). */
  vignetteAlpha(id: string): number { return this.vigs.get(id)?.a ?? 0; }
  emblemAlpha(id: string): number { return this.embs.get(id)?.a ?? 0; }
  get flashAlpha(): number { return this.flashA; }

  /** Fim do quadro: tamanho da tela, clarão, vinhetas e emblemas indo para o pedido neste quadro. */
  update(dt: number, w: number, h: number): void {
    this.w = w; this.h = h;
    if (this.flashSp) {
      // o quadro do pedido mostra o clarão inteiro; depois apaga em 0,2 s de jogo
      this.flashSp.visible = this.flashA > 0.004;
      this.flashSp.alpha = this.flashA;
      this.flashSp.width = w; this.flashSp.height = h;
      if (dt > 0) { this.flashAge += dt; this.flashA = this.flash0 * Math.max(0, 1 - this.flashAge / 0.2); }
    }
    const k = Math.min(1, dt * 4);
    for (const v of this.vigs.values()) {
      if (dt > 0) { v.a += (v.want - v.a) * k; if (v.want === 0 && v.a < 0.004) v.a = 0; }
      v.sp.visible = v.a > 0.003;
      v.sp.alpha = v.a; v.sp.tint = v.tint;
      v.sp.width = w; v.sp.height = h;
      v.want = 0;
    }
    // emblemas no alto, no meio, lado a lado (na ordem em que apareceram), abaixo da barra de recursos
    const shown = [...this.embs.values()].filter((e) => e.want || e.a > 0.01).sort((a, b) => a.order - b.order);
    const y = Math.max(92, h * 0.11), R = 27;
    shown.forEach((e, i) => {
      if (dt > 0) e.a += ((e.want ? 1 : 0) - e.a) * k;
      e.root.visible = e.a > 0.01;
      e.root.alpha = e.a;
      e.root.position.set(w / 2 + (i - (shown.length - 1) / 2) * 76, y);
      e.icon.tint = e.tint;
      const a0 = -Math.PI / 2, a1 = a0 + Math.PI * 2 * e.frac;
      e.arc.clear().circle(0, 0, R).stroke({ width: 5, color: 0x000000, alpha: 0.35 });
      if (e.frac > 0.002) e.arc.moveTo(Math.cos(a0) * R, Math.sin(a0) * R).arc(0, 0, R, a0, a1).stroke({ width: 3, color: e.tint, alpha: 0.95 });
      e.want = false;
    });
    for (const e of this.embs.values()) if (!shown.includes(e)) { e.root.visible = false; e.want = false; }
  }
  reset(): void {
    this.flashA = this.flash0 = 0;
    this.flashSp = null;
    this.vigs.clear();
    this.embs.clear();
    this.root.removeChildren().forEach((c) => c.destroy({ children: true }));
  }
}
