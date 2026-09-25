// Contador de desempenho do renderizador (docs/ART.md §3.9/§6): fps, ms de renderer.render (média e p95 móveis),
// draw calls por quadro (contador instalado em gl.drawElements/drawArrays do contexto do Pixi), MB de texturas
// residentes (renderer.texture.managedTextures), sprites e chunks visíveis. Ligado por ?perf=1 ou pela opção
// "mostrar desempenho"; `snapshot()` devolve os números (window.aoe.perf.snapshot() nos scripts de medição).
import { Sprite, Container } from 'pixi.js';
import type { Renderer } from './renderer';

export interface PerfSnapshot {
  /** Quadros por segundo (janela de 1 s). */
  fps: number;
  /** Custo de renderer.render em ms sobre a janela de amostras (≤ 600 quadros ou desde o último reset). */
  render: { avg: number; p95: number; max: number; n: number };
  /** Draw calls por quadro (média e máximo na mesma janela). */
  drawCalls: number; drawCallsMax: number;
  /** Texturas residentes na GPU (estimativa: largura × altura × 4 bytes, ×4/3 com mipmaps). */
  textureMB: number; textures: number;
  /** Sprites visíveis na cena e chunks de terreno em cache. */
  sprites: number; chunks: number;
  /** Resolução do canvas e tamanho em pixels. */
  resolution: number; canvas: string;
}

/** Janela móvel: 600 quadros de custo de render (≈ 10 s a 60 fps, p95 pega picos) e 120 quadros de draw calls (o valor atual). */
const WINDOW = 600, WINDOW_DRAWS = 120;
const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);

export class PerfMonitor {
  private el: HTMLDivElement | null = null;
  private renderMs: number[] = [];
  private draws: number[] = [];
  private stamps: number[] = [];
  private drawCounter = 0;
  private drawStart = 0;
  private lastUi = 0;
  private glHooked = false;

  constructor(private renderer: Renderer) { this.hook(); }

  /** Instala o contador de draw calls no contexto WebGL e os ganchos prerender/postrender do Pixi. */
  private hook(): void {
    if (this.glHooked) return;
    const r = this.renderer.app?.renderer as unknown as { gl?: Record<string, unknown>; runners?: { prerender?: { add(i: unknown): void }; postrender?: { add(i: unknown): void } } } | undefined;
    const gl = r?.gl;
    if (!gl) return;
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const orig = gl[name] as ((...a: unknown[]) => unknown) | undefined;
      if (typeof orig !== 'function') continue;
      gl[name] = (...a: unknown[]) => { this.drawCounter++; return orig.apply(gl, a); };
    }
    // Só o quadro da stage conta como "quadro": generateTexture (chunks de terreno) também passa por prerender/postrender
    // e entra no mesmo quadro (somado ao contador, não como quadro à parte).
    const stage = this.renderer.app.stage;
    r?.runners?.prerender?.add({ prerender: (o: { container?: unknown }) => { if (o?.container === stage) this.drawStart = this.drawCounter; } });
    r?.runners?.postrender?.add({ postrender: (o: { container?: unknown }) => { if (o?.container !== stage) return; this.draws.push(this.drawCounter - this.drawStart); if (this.draws.length > WINDOW_DRAWS) this.draws.shift(); } });
    this.glHooked = true;
  }

  get visible(): boolean { return !!this.el; }
  setVisible(v: boolean): void {
    if (v && !this.el) {
      const el = document.createElement('div');
      el.id = 'perf';
      // Centrado logo abaixo da barra superior: não cobre os avisos (esquerda) nem o cartão do poder divino (direita)
      el.style.cssText = 'position:fixed;top:46px;left:50%;transform:translateX(-50%);z-index:60;padding:4px 8px;border-radius:4px;background:rgba(6,10,20,.62);color:#cfe3ff;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;white-space:pre;pointer-events:none;text-shadow:0 1px 1px #000';
      document.body.appendChild(el);
      this.el = el;
      this.lastUi = 0;
    } else if (!v && this.el) { this.el.remove(); this.el = null; }
  }

  /** Início de um quadro do laço (requestAnimationFrame): alimenta o fps. */
  frame(now: number): void {
    this.stamps.push(now);
    const cut = now - 1000;
    while (this.stamps.length && this.stamps[0] < cut) this.stamps.shift();
    if (this.el && now - this.lastUi > 250) { this.lastUi = now; this.el.textContent = this.text(); }
  }
  /** Custo (ms) de uma chamada a renderer.render. */
  sample(ms: number): void { this.renderMs.push(ms); if (this.renderMs.length > WINDOW) this.renderMs.shift(); }
  /** Limpa as janelas (os scripts de medição chamam antes de cada cenário). */
  reset(): void { this.renderMs = []; this.draws = []; }

  private textures(): { mb: number; n: number } {
    const sys = (this.renderer.app?.renderer as unknown as { texture?: { managedTextures?: readonly { pixelWidth: number; pixelHeight: number; autoGenerateMipmaps?: boolean }[] } })?.texture;
    const list = sys?.managedTextures ?? [];
    let bytes = 0;
    for (const t of list) bytes += t.pixelWidth * t.pixelHeight * 4 * (t.autoGenerateMipmaps ? 4 / 3 : 1);
    return { mb: bytes / 1048576, n: list.length };
  }
  private countSprites(): number {
    let n = 0;
    const walk = (c: Container) => { if (!c.visible || !c.renderable) return; if (c instanceof Sprite) n++; for (const ch of c.children) walk(ch as Container); };
    if (this.renderer.world) walk(this.renderer.world);
    return n;
  }

  snapshot(): PerfSnapshot {
    const sorted = [...this.renderMs].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
    const dAvg = this.draws.reduce((a, b) => a + b, 0) / Math.max(1, this.draws.length);
    const tex = this.textures();
    const app = this.renderer.app;
    const span = this.stamps.length > 1 ? this.stamps[this.stamps.length - 1] - this.stamps[0] : 0;
    return {
      fps: +(span > 0 ? ((this.stamps.length - 1) * 1000) / span : 0).toFixed(1),
      render: { avg: +avg.toFixed(2), p95: +percentile(sorted, 0.95).toFixed(2), max: +(sorted[sorted.length - 1] ?? 0).toFixed(2), n: sorted.length },
      drawCalls: Math.round(dAvg), drawCallsMax: Math.max(0, ...this.draws),
      textureMB: +tex.mb.toFixed(1), textures: tex.n,
      sprites: this.countSprites(), chunks: this.renderer.layers?.terrain?.children.length ?? 0,
      resolution: app?.renderer?.resolution ?? 1, canvas: app ? `${app.canvas.width}×${app.canvas.height}` : '',
    };
  }
  private text(): string {
    const s = this.snapshot();
    return `${String(s.fps).padStart(5)} fps  render ${s.render.avg.toFixed(2)} ms (p95 ${s.render.p95.toFixed(1)})\n` +
      `${String(s.drawCalls).padStart(5)} draw calls (máx ${s.drawCallsMax})  ${s.textureMB.toFixed(1)} MB tex (${s.textures})\n` +
      `${String(s.sprites).padStart(5)} sprites  ${s.chunks} chunks  ${s.canvas} @${s.resolution}x`;
  }
}
