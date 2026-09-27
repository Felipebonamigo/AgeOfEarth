// Decalques do chão (docs/ART.md §1.9, §3.7 e Apêndice F — Etapa 5): queimadura, rachadura, marca de impacto e
// escombros espalhados, numa camada logo ACIMA do terreno e ABAIXO das sombras e das unidades (renderer.layers.decals).
// Dois ParticleContainer (um lote cada): `multiply` (queimadura/rachadura/impacto escurecem o chão sem apagar a textura da
// grama) e `normal` (escombros, que têm cor própria). Cada decalque tem vida e desvanece no fim (relógio de JOGO); o
// número vivo tem teto por preset (DECAL_CAP: sai o mais velho). Névoa: um decalque só aparece depois que o tile dele foi
// VISTO (visível agora, vis = 2) desde que ele nasceu — nunca em área nunca vista, nem revelando o que aconteceu fora da
// vista (a marca de uma batalha que o jogador não viu aparece quando ele olhar para lá). `clearRect` (editor) limpa um
// retângulo de tiles.
import { Container, Particle, ParticleContainer, type Texture } from 'pixi.js';
import { TILE } from '../core/constants';

export type DecalBlend = 'multiply' | 'normal';
export interface DecalSpec {
  tex: Texture;
  /** Centro (px de mundo). */
  x: number; y: number;
  rot?: number; scale?: number; scaleY?: number;
  alpha?: number;
  /** Vida (s de jogo) e fração final dela em que apaga. */
  life: number; fade?: number;
  blend: DecalBlend;
  tint?: number;
  /** Família (ex.: 'decal/burn') e raio (px de mundo): um decalque vivo da mesma família a menos de `merge` do centro é
   *  RENOVADO (vida, maior tamanho e alfa) em vez de empilhar outro — multiply sobre multiply escurece até o preto. */
  key?: string; merge?: number;
}
interface Decal { p: Particle; blend: 0 | 1; born: number; life: number; fade: number; a: number; tx: number; ty: number; revealed: boolean; key: string }

export class DecalLayer {
  readonly root = new Container();
  readonly multiply: ParticleContainer;
  readonly normal: ParticleContainer;
  /** Teto de decalques vivos (DECAL_CAP do preset). */
  cap = 128;
  private list: Decal[] = [];
  private free: Particle[] = [];
  private dirty = false;

  constructor() {
    const dyn = { position: false, vertex: false, rotation: false, uvs: false, color: true };
    this.multiply = new ParticleContainer({ dynamicProperties: dyn });
    this.normal = new ParticleContainer({ dynamicProperties: dyn });
    this.multiply.blendMode = 'multiply';
    this.root.addChild(this.multiply, this.normal);
    this.root.eventMode = 'none';
  }
  get count(): number { return this.list.length; }

  /** Põe um decalque (nasce no instante `clock`, s de jogo). `seen` = o tile está visível agora ao jogador local. */
  add(s: DecalSpec, clock: number, seen: boolean): void {
    if (this.cap <= 0) return;
    if (s.key && s.merge && this.renew(s, clock, seen, s.merge)) return;
    while (this.list.length >= this.cap) this.remove(0);
    const p = this.free.pop() ?? new Particle({ texture: s.tex });
    p.texture = s.tex; p.anchorX = 0.5; p.anchorY = 0.5;
    p.x = s.x; p.y = s.y; p.rotation = s.rot ?? 0;
    p.scaleX = s.scale ?? 1; p.scaleY = s.scaleY ?? s.scale ?? 1;
    p.tint = s.tint ?? 0xffffff;
    const d: Decal = { p, blend: s.blend === 'multiply' ? 0 : 1, born: clock, life: Math.max(0.1, s.life), fade: s.fade ?? 0.25, a: s.alpha ?? 1, tx: Math.floor(s.x / TILE), ty: Math.floor(s.y / TILE), revealed: seen, key: s.key ?? '' };
    p.alpha = seen ? d.a : 0;
    this.list.push(d);
    this.dirty = true;
  }
  /** Renova o decalque vivo mais próximo da família `s.key` a menos de `r` px (true) ou nada (false). */
  private renew(s: DecalSpec, clock: number, seen: boolean, r: number): boolean {
    let best: Decal | null = null, bd = r * r;
    for (const d of this.list) {
      if (d.key !== s.key) continue;
      const age = clock - d.born;
      if (!(age >= 0 && age < d.life)) continue;
      const dx = d.p.x - s.x, dy = d.p.y - s.y, q = dx * dx + dy * dy;
      if (q < bd) { bd = q; best = d; }
    }
    if (!best) return false;
    const end = Math.max(best.born + best.life, clock + Math.max(0.1, s.life));
    best.born = clock; best.life = end - clock;
    best.a = Math.max(best.a, s.alpha ?? 1);
    best.revealed ||= seen;
    // o maior dos dois (mantendo o achatamento do que já estava no chão)
    const sx = s.scale ?? 1;
    if (sx > best.p.scaleX) { best.p.scaleY *= sx / best.p.scaleX; best.p.scaleX = sx; this.dirty = true; }
    return true;
  }
  private remove(i: number): void {
    const d = this.list[i];
    this.list.splice(i, 1);
    this.free.push(d.p);
    this.dirty = true;
  }

  /**
   * Envelhece e aplica a névoa: `vis` = visibilidade do jogador local (0 nunca, 1 já visto, 2 visível), `w` = largura
   * do mapa; `reveal` = tudo visível (espectador, mapa revelado). Relógio que voltou (replay) remove o decalque.
   */
  update(clock: number, vis: Uint8Array | null, w: number, reveal: boolean): void {
    let removed = false;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      const age = clock - d.born;
      if (!(age >= 0 && age < d.life)) { this.list.splice(i, 1); this.free.push(d.p); removed = true; continue; }
      if (!d.revealed) {
        const k = d.ty * w + d.tx;
        d.revealed = reveal || (!!vis && k >= 0 && k < vis.length && vis[k] === 2);
      }
      const t = age / d.life, f = d.fade > 0 && t > 1 - d.fade ? (1 - t) / d.fade : 1;
      const a = d.revealed ? d.a * f : 0;
      if (d.p.alpha !== a) d.p.alpha = a;
    }
    if (removed) this.dirty = true;
    if (this.dirty) this.rebuild();
  }
  private rebuild(): void {
    this.dirty = false;
    const m: Particle[] = [], n: Particle[] = [];
    for (const d of this.list) (d.blend ? n : m).push(d.p);
    this.multiply.particleChildren = m; this.multiply.update();
    this.normal.particleChildren = n; this.normal.update();
  }

  /** Remove os decalques cujo centro cai no retângulo de tiles [x0,x1]×[y0,y1] (editor: o chão mudou ali). */
  clearRect(x0: number, y0: number, x1: number, y1: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) { const d = this.list[i]; if (d.tx >= x0 && d.tx <= x1 && d.ty >= y0 && d.ty <= y1) this.remove(i); }
    if (this.dirty) this.rebuild();
  }
  /** Remove todos (troca de partida/arte); `sourceChanged` como em ParticleSystem.clear. */
  clear(sourceChanged = false): void {
    for (const d of this.list) this.free.push(d.p);
    this.list = [];
    this.rebuild();
    if (sourceChanged) { this.multiply.texture = null as unknown as Texture; this.normal.texture = null as unknown as Texture; this.free.length = 0; }
  }
}
