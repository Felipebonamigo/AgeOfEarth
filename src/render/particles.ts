// Sistema de partículas do renderizador (docs/ART.md §1.9, §3.7 e Apêndice F — Etapa 5): emissores que lançam
// partículas com textura do atlas `fx` (ou do atlas procedural de reserva) em dois ParticleContainer — mistura normal e
// aditiva ("luz" só no que emite luz: faísca, brasa, fogo, brilho divino) —, cada um um lote só. Cada partícula tem
// posição no chão (x, y, px de mundo) e altura z (px de tela para cima: desenhada em y − z), velocidade, gravidade (em z:
// faíscas e lascas sobem e caem no mesmo lugar do chão, quicam e param), arrasto, vento, escala/alfa/cor no tempo,
// rotação (fixa, girando ou alinhada à velocidade na tela) e flipbook (fogo). O relógio é o tempo de JOGO (`update(dt)`
// com o passo do relógio de jogo: congela na pausa, acelera em 2×/3×).
// Orçamento: o TOTAL de vivas nunca passa de PARTICLE_BUDGET[quality.particles] (200 / 800 / 2 000), com prioridade:
// poderes > combate > ambiente — cada prioridade tem um teto (PRIO_CAP, fração do total) e, cheia, uma prioridade maior
// toma o lugar da partícula mais velha de uma menor; famílias com teto próprio (GROUP_CAP: fumaça dos edifícios,
// poeira, fogo) não passam dele. Math.random é permitido aqui: nada disto entra na simulação.
// Partículas RENTES AO CHÃO (`ground`: chão em chamas, poeira, onda de poeira, poça de luz do raio) não vão para os dois
// containers globais (acima de tudo): vão para um lote por LINHA DE TILES dentro das faixas ordenadas por y das entidades
// (`groundParent`, zIndex = meio da linha) — a árvore, o edifício ou a unidade na frente cobrem o fogo e a poeira de trás,
// e quem está atrás fica atrás. O orçamento é o mesmo.
import { Container, Particle, ParticleContainer, type Texture } from 'pixi.js';
import { TILE } from '../core/constants';
import { GROUP_CAP, PRIO_CAP, lerpColor } from './fx/logic';

/** Cor (0xRRGGBB) e alfa direto no `color` do Particle do Pixi (o que o lote lê), sem os setters `tint`/`alpha`: o de
 *  `tint` passa por `Color.shared` (normaliza e aloca um array) a cada partícula por quadro. Mantém `_tint`/`_alpha`
 *  como o Pixi os guarda, para os getters (`p.tint`, `p.alpha`) continuarem certos. */
export function setColor(p: Particle, rgb: number, alpha: number): void {
  const q = p as unknown as { _tint: number; _alpha: number; color: number };
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  const bgr = ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff);
  q._tint = bgr; q._alpha = a;
  q.color = bgr + ((a * 255 | 0) << 24);
}

/** Prioridade no orçamento: ambiente (fumaça dos edifícios, poeira dos pés) < combate < poderes. */
export const PRIO = { ambient: 0, combat: 1, power: 2 } as const;
export type Prio = 0 | 1 | 2;
export type ParticleBlend = 'normal' | 'add';

/** Uma emissão (px de mundo, px/s, s). Campos omitidos: sem movimento, escala/alfa constantes, cor branca. */
export interface EmitSpec {
  /** Quadros: 1 = textura fixa; vários = flipbook (em loop a `fps`, ou espalhados pela vida sem `fps`). */
  frames: readonly Texture[];
  fps?: number;
  blend: ParticleBlend;
  prio: Prio;
  /** Família com teto próprio (GROUP_CAP): 'smoke' | 'dust' | 'fire'. */
  group?: string;
  x: number; y: number; z?: number;
  vx?: number; vy?: number; vz?: number;
  /** Aceleração para baixo em z (px/s²); com `bounce` a partícula quica no chão (z = 0) e depois para. */
  gravity?: number; bounce?: number;
  /** Arrasto (1/s) em todas as componentes; `dragY` só na vertical da tela (vy e vz). */
  drag?: number; dragY?: number;
  /** Quanto o vento global empurra (0–1). */
  wind?: number;
  life: number;
  scale0: number; scale1?: number;
  /** Alfa: sobe de 0 a `alpha0` na fração `fadeIn` da vida e vai linearmente a `alpha1` (padrão 0) no fim. */
  alpha0: number; alpha1?: number; fadeIn?: number;
  tint?: number; tint1?: number;
  rot?: number; spin?: number;
  /** Rotação = direção da velocidade NA TELA (faíscas). */
  align?: boolean;
  /** Âncora da textura (padrão: a do quadro, ou o centro). */
  anchorX?: number; anchorY?: number;
  /** Rente ao chão: ordenada por y com as entidades (lote da linha de tiles de `y`), não por cima de tudo. */
  ground?: boolean;
}

interface Live {
  p: Particle; blend: 0 | 1; prio: Prio; group: string | null; dead: boolean;
  /** Linha de tiles do lote rente ao chão (−1 = containers globais). */
  band: number;
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  g: number; bounce: number; drag: number; dragY: number; wind: number;
  age: number; life: number; s0: number; s1: number; a0: number; a1: number; fin: number;
  c0: number; c1: number; rot: number; spin: number; align: boolean;
  frames: readonly Texture[]; fps: number;
}

/** Lote rente ao chão de uma linha de tiles: normal + aditivo num Container com zIndex = meio da linha. */
interface Band { root: Container; normal: ParticleContainer; add: ParticleContainer; n: Particle[]; a: Particle[]; serial: number }
const DYN = { position: true, vertex: true, rotation: true, uvs: true, color: true };

/** Vento global (px/s): leste com um pouco de sul, como a fumaça da Etapa 3 derivava. */
export const WIND = { x: 7, y: 1.5 } as const;

export class ParticleSystem {
  /** Mistura normal (poeira, fumaça, lascas, folhas) e aditiva (faíscas, brasas, fogo, brilho). */
  readonly normal: ParticleContainer;
  readonly add: ParticleContainer;
  /** Orçamento TOTAL de partículas vivas (PARTICLE_BUDGET do preset). */
  budget = 800;
  private live: Live[][] = [[], [], []];   // por prioridade, mais velhas primeiro
  private free: Particle[] = [];
  private counts = [0, 0, 0];
  private groups = new Map<string, number>();
  private dirty = false;
  /** Emissões recusadas desde o último `resetStats` (orçamento cheio): diagnóstico do ?perf=1 e dos testes. */
  dropped = 0;
  /** Maior número de vivas visto desde o último `resetStats`. */
  peak = 0;
  /** Container ordenado por y (zIndex em tiles) onde vive o lote rente ao chão da posição y (tiles); null = sem faixas
   *  (as partículas `ground` vão para os containers globais). */
  groundParent: ((y: number) => Container | null) | null = null;
  private bands = new Map<number, Band>();
  /** Lotes vazios guardados para reúso (sem recriar os buffers da GPU a cada fogo que apaga). */
  private bandPool: Band[] = [];
  private serial = 0;

  constructor() {
    this.normal = new ParticleContainer({ dynamicProperties: DYN });
    this.add = new ParticleContainer({ dynamicProperties: DYN });
    this.add.blendMode = 'add';
    this.normal.eventMode = 'none'; this.add.eventMode = 'none';
  }
  /** Partículas vivas (todas as prioridades). */
  get count(): number { return this.counts[0] + this.counts[1] + this.counts[2]; }
  /** Lotes rentes ao chão em uso (diagnóstico e testes). */
  get bandCount(): number { return this.bands.size; }
  /** Partículas desenhadas em mistura normal / aditiva, somando as dos lotes rentes ao chão (diagnóstico: artfx). */
  get normalCount(): number { let n = this.normal.particleChildren.length; for (const b of this.bands.values()) n += b.n.length; return n; }
  get addCount(): number { let n = this.add.particleChildren.length; for (const b of this.bands.values()) n += b.a.length; return n; }
  countOf(prio: Prio): number { return this.counts[prio]; }
  groupCount(group: string): number { return this.groups.get(group) ?? 0; }
  resetStats(): void { this.dropped = 0; this.peak = this.count; }

  /** Cabe mais uma desta prioridade/família? Se a prioridade estiver cheia, tira a mais velha de uma prioridade menor. */
  private admit(prio: Prio, group: string | null): boolean {
    if (this.budget <= 0) return false;
    if (group) { const cap = GROUP_CAP[group]; if (cap !== undefined && this.groupCount(group) >= Math.floor(this.budget * cap)) return false; }
    if (this.count < Math.floor(this.budget * PRIO_CAP[prio])) return true;
    for (let lower = 0; lower < prio; lower++) if (this.counts[lower] > 0 && this.evictOldest(lower as Prio)) return true;
    return false;
  }
  private evictOldest(prio: Prio): boolean {
    for (const l of this.live[prio]) if (!l.dead) { this.kill(l); return true; }
    return false;
  }
  private kill(l: Live): void {
    l.dead = true; this.counts[l.prio]--;
    if (l.group) this.groups.set(l.group, (this.groups.get(l.group) ?? 1) - 1);
    this.dirty = true;
  }

  /** Lança uma partícula; false se o orçamento (ou o teto da família) recusou. */
  emit(s: EmitSpec): boolean {
    const group = s.group ?? null;
    if (!this.admit(s.prio, group)) { this.dropped++; return false; }
    const tex = s.frames[0];
    const p = this.free.pop() ?? new Particle({ texture: tex });
    p.texture = tex;
    p.anchorX = s.anchorX ?? tex.defaultAnchor?.x ?? 0.5;
    p.anchorY = s.anchorY ?? tex.defaultAnchor?.y ?? 0.5;
    const l: Live = {
      p, blend: s.blend === 'add' ? 1 : 0, prio: s.prio, group, dead: false, band: s.ground && this.groundParent ? Math.floor(s.y / TILE) : -1,
      x: s.x, y: s.y, z: s.z ?? 0, vx: s.vx ?? 0, vy: s.vy ?? 0, vz: s.vz ?? 0,
      g: s.gravity ?? 0, bounce: s.bounce ?? -1, drag: s.drag ?? 0, dragY: s.dragY ?? 0, wind: s.wind ?? 0,
      age: 0, life: Math.max(0.01, s.life), s0: s.scale0, s1: s.scale1 ?? s.scale0, a0: s.alpha0, a1: s.alpha1 ?? 0, fin: s.fadeIn ?? 0,
      c0: s.tint ?? 0xffffff, c1: s.tint1 ?? (s.tint ?? 0xffffff), rot: s.rot ?? 0, spin: s.spin ?? 0, align: !!s.align,
      frames: s.frames, fps: s.fps ?? 0,
    };
    this.place(l);
    this.live[s.prio].push(l);
    this.counts[s.prio]++;
    if (group) this.groups.set(group, this.groupCount(group) + 1);
    this.dirty = true;
    if (this.count > this.peak) this.peak = this.count;
    return true;
  }

  /** Escreve na partícula do Pixi o estado de `l` na idade atual. */
  private place(l: Live): void {
    const p = l.p, t = l.age / l.life;
    p.x = l.x; p.y = l.y - l.z;
    const s = l.s0 + (l.s1 - l.s0) * t;
    p.scaleX = s; p.scaleY = s;
    const a = l.fin > 0 && t < l.fin ? l.a0 * (t / l.fin) : l.a0 + (l.a1 - l.a0) * (l.fin >= 1 ? 0 : (t - l.fin) / (1 - l.fin));
    setColor(p, l.c0 === l.c1 ? l.c0 : lerpColor(l.c0, l.c1, t), a);
    p.rotation = l.align ? Math.atan2(l.vy - l.vz, l.vx) : l.rot + l.spin * l.age;
    const n = l.frames.length;
    if (n > 1) {
      const i = l.fps > 0 ? Math.floor(l.age * l.fps) % n : Math.min(n - 1, Math.floor(t * n));
      if (p.texture !== l.frames[i]) p.texture = l.frames[i];
    }
  }

  /** Avança `dt` segundos de jogo: move, envelhece e recicla (dt 0 = pausa: nada muda). */
  update(dt: number): void {
    if (dt > 0) {
      const dts = Math.min(dt, 0.25);
      for (const list of this.live) for (const l of list) {
        if (l.dead) continue;
        l.age += dts;
        if (l.age >= l.life) { this.kill(l); continue; }
        if (l.drag > 0) { const k = Math.max(0, 1 - l.drag * dts); l.vx *= k; l.vy *= k; l.vz *= k; }
        if (l.dragY > 0) { const k = Math.max(0, 1 - l.dragY * dts); l.vy *= k; l.vz *= k; }
        if (l.wind > 0) { l.vx += WIND.x * l.wind * dts; l.vy += WIND.y * l.wind * dts; }
        if (l.g !== 0) l.vz -= l.g * dts;
        l.x += l.vx * dts; l.y += l.vy * dts; l.z += l.vz * dts;
        if (l.g > 0 && l.z < 0) {
          // no chão: quica (bounce ≥ 0) com atrito, ou para
          l.z = 0;
          if (l.bounce > 0 && -l.vz > 40) { l.vz = -l.vz * l.bounce; l.vx *= 0.55; l.vy *= 0.55; l.spin *= 0.5; }
          else { l.vz = 0; l.vx = 0; l.vy = 0; l.g = 0; l.spin = 0; }
        }
        this.place(l);
      }
    }
    if (this.dirty) this.compact();
  }

  /** Tira as mortas das listas e reescreve os filhos dos dois containers (uma vez por quadro, se algo mudou). */
  private compact(): void {
    this.dirty = false; this.serial++;
    const normal: Particle[] = [], add: Particle[] = [];
    for (let k = 0; k < 3; k++) {
      const list = this.live[k];
      let w = 0;
      for (const l of list) {
        if (l.dead) { this.free.push(l.p); continue; }
        list[w++] = l;
      }
      list.length = w;
    }
    // ordem de desenho: mais velhas atrás (ambiente, combate, poderes; dentro de cada uma, pela idade)
    for (const b of this.bands.values()) { b.n.length = 0; b.a.length = 0; }
    for (const list of this.live) for (const l of list) {
      const b = l.band >= 0 ? this.band(l.band) : null;
      if (b) (l.blend ? b.a : b.n).push(l.p); else (l.blend ? add : normal).push(l.p);
    }
    this.normal.particleChildren = normal; this.normal.update();
    this.add.particleChildren = add; this.add.update();
    for (const [k, b] of this.bands) {
      if (b.n.length + b.a.length === 0) { this.dropBand(k, b); continue; }
      b.normal.particleChildren = b.n; b.normal.update();
      b.add.particleChildren = b.a; b.add.update();
      // lote vazio fica fora da lista de desenho (senão parte à toa o lote de sprites da faixa)
      const vn = b.n.length > 0, va = b.a.length > 0;
      if (b.normal.visible !== vn) b.normal.visible = vn;
      if (b.add.visible !== va) b.add.visible = va;
    }
  }
  /** Lote da linha `k` (criado sob demanda; refeito se a faixa que o guardava mudou ou foi destruída). */
  private band(k: number): Band | null {
    let b = this.bands.get(k);
    if (b && b.serial === this.serial) return b;   // já conferido neste compact
    const parent = this.groundParent?.(k + 0.5) ?? null;
    if (!parent) return null;
    if (b && (b.root.destroyed || b.normal.destroyed)) { this.bands.delete(k); b = undefined; }
    if (!b) {
      while (!b && this.bandPool.length) { const q = this.bandPool.pop()!; if (!q.root.destroyed && !q.normal.destroyed) b = q; }
      if (!b) {
        const root = new Container(), normal = new ParticleContainer({ dynamicProperties: DYN }), add = new ParticleContainer({ dynamicProperties: DYN });
        add.blendMode = 'add'; root.eventMode = 'none'; normal.eventMode = 'none'; add.eventMode = 'none';
        root.addChild(normal, add);
        b = { root, normal, add, n: [], a: [], serial: 0 };
      }
      b.root.zIndex = k + 0.5;
      this.bands.set(k, b);
    }
    if (b.root.parent !== parent) parent.addChild(b.root);
    b.serial = this.serial;
    return b;
  }
  /** Lote vazio: sai da faixa e volta ao estoque (`destroy` = libera de vez: troca de fonte das texturas). */
  private dropBand(k: number, b: Band, destroy = false): void {
    this.bands.delete(k);
    if (b.root.destroyed || b.normal.destroyed) return;
    b.n.length = 0; b.a.length = 0;
    b.normal.particleChildren = []; b.normal.update(); b.add.particleChildren = []; b.add.update();
    b.root.removeFromParent();
    if (destroy || this.bandPool.length >= 64) b.root.destroy({ children: true }); else this.bandPool.push(b);
  }

  /** Remove todas (troca de partida, troca da arte). `sourceChanged`: a próxima textura vem de outra fonte (atlas
   *  assado ↔ procedural) — o container guarda a fonte da primeira partícula e precisa esquecê-la. */
  clear(sourceChanged = false): void {
    for (const list of this.live) { for (const l of list) this.free.push(l.p); list.length = 0; }
    this.counts = [0, 0, 0]; this.groups.clear();
    this.normal.particleChildren = []; this.normal.update();
    this.add.particleChildren = []; this.add.update();
    for (const [k, b] of this.bands) this.dropBand(k, b, sourceChanged);
    if (sourceChanged) {
      for (const b of this.bandPool) if (!b.root.destroyed) b.root.destroy({ children: true });
      this.bandPool.length = 0;
      this.normal.texture = null as unknown as Texture; this.add.texture = null as unknown as Texture; this.free.length = 0;
    }
    this.dirty = false;
  }
}
