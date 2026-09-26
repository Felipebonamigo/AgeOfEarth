// Partículas leves do renderizador (docs/ART.md §1.9, §3.7). Por enquanto só a fumaça dos edifícios danificados (Etapa
// 3): baforadas de uma textura macia gerada em canvas, num ParticleContainer (um lote, sem Sprite por baforada), que
// sobem, crescem, derivam com o vento para leste e somem. O número vivo nunca passa do orçamento do preset
// (quality.ts PARTICLE_BUDGET × smokeBudget); sem orçamento livre, a emissão espera. Relógio = tempo de jogo (congela na
// pausa, acelera em 2×/3×). Math.random é permitido aqui: nada disto entra na simulação.
import { Particle, ParticleContainer, Texture } from 'pixi.js';

interface Puff { p: Particle; vx: number; vy: number; age: number; life: number; s0: number; s1: number; a0: number }

/** Textura de baforada: disco com borda macia e um pouco de ruído (32 px). */
function puffTexture(): Texture {
  const N = 32;
  const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(N / 2, N / 2, 1, N / 2, N / 2, N / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, N, N);
  return Texture.from(cv);
}

export class SmokeLayer {
  readonly root: ParticleContainer;
  /** Máximo de baforadas vivas (0 = desligada). */
  budget = 280;
  private tex: Texture | null = null;
  private live: Puff[] = [];
  private free: Particle[] = [];

  constructor() {
    this.root = new ParticleContainer({ dynamicProperties: { position: true, vertex: true, rotation: false, uvs: false, color: true } });
    this.root.eventMode = 'none';
  }
  get count(): number { return this.live.length; }

  /**
   * Emite `n` baforadas (n pode ser fracionário: a parte que sobra fica no acumulador `acc` de quem chama) de pontos
   * aleatórios do retângulo [x0,x1]×[y0,y1] (px de mundo). `dark` = dano pesado (fumaça mais escura e mais densa).
   * Devolve quantas saíram.
   */
  emit(n: number, x0: number, x1: number, y0: number, y1: number, dark: boolean): number {
    let out = 0;
    for (let i = 0; i < n && this.live.length < this.budget; i++) {
      this.tex ??= puffTexture();
      const p = this.free.pop() ?? new Particle({ texture: this.tex, anchorX: 0.5, anchorY: 0.5 });
      p.x = x0 + Math.random() * (x1 - x0); p.y = y0 + Math.random() * (y1 - y0);
      const shade = dark ? 0x3a3632 + (Math.floor(Math.random() * 16) * 0x010101) : 0x8a8580 + (Math.floor(Math.random() * 24) * 0x010101);
      p.tint = shade;
      const s0 = (dark ? 0.4 : 0.32) + Math.random() * 0.15;
      const puff: Puff = { p, vx: 4 + Math.random() * 6, vy: -(18 + Math.random() * 10), age: 0, life: 3 + Math.random() * 1.8, s0, s1: s0 * (3.4 + Math.random() * 1.2), a0: dark ? 0.7 : 0.5 };
      p.scaleX = p.scaleY = s0; p.alpha = 0;
      this.root.addParticle(p);
      this.live.push(puff);
      out++;
    }
    return out;
  }

  /** Avança `dt` segundos de jogo: sobe, cresce, deriva e apaga; recicla as que acabaram. */
  update(dt: number): void {
    if (dt <= 0 || this.live.length === 0) return;
    let w = 0;
    for (let i = 0; i < this.live.length; i++) {
      const f = this.live[i];
      f.age += dt;
      if (f.age >= f.life) { this.root.removeParticle(f.p); this.free.push(f.p); continue; }
      const t = f.age / f.life;
      f.p.x += f.vx * dt; f.p.y += f.vy * dt;
      f.vy *= 1 - 0.18 * dt;
      const s = f.s0 + (f.s1 - f.s0) * t;
      f.p.scaleX = s; f.p.scaleY = s;
      f.p.alpha = f.a0 * (t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88);
      this.live[w++] = f;
    }
    this.live.length = w;
  }

  /** Remove todas (troca de partida, arte desligada). */
  clear(): void {
    for (const f of this.live) { this.root.removeParticle(f.p); this.free.push(f.p); }
    this.live.length = 0;
  }
}
