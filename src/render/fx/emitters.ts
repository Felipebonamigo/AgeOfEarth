// Emissores prontos (docs/ART.md Apêndice F — Etapa 5): receitas de partículas reutilizadas pelos handlers — fumaça dos
// edifícios (a da Etapa 3, idêntica), poeira, faíscas, lascas, folhas, brasas, chamas em flipbook, brilhos e ondas.
// Coordenadas em px de MUNDO; z = altura (px de tela para cima). Cada receita escolhe a prioridade no orçamento
// (particles.ts: ambiente < combate < poderes) e a mistura (aditiva só no que emite luz).
import { TILE } from '../../core/constants';
import { PRIO, type Prio, type ParticleSystem } from '../particles';
import type { FxTextures } from './FxTextures';

const R = Math.random;
const rr = (a: number, b: number) => a + R() * (b - a);

/** Fumaça de edifício danificado/colapso (Etapa 3): `n` baforadas no retângulo [x0,x1]×[y0,y1], sobem, crescem, derivam
 *  para leste e somem — a MESMA receita e a mesma textura (`puff`) do SmokeLayer de antes. Devolve quantas saíram. */
export function smokePuffs(ps: ParticleSystem, tex: FxTextures, n: number, x0: number, x1: number, y0: number, y1: number, dark: boolean, prio: Prio = PRIO.ambient, group: string | undefined = 'smoke'): number {
  let out = 0;
  const frames = tex.family('puff');
  for (let i = 0; i < n; i++) {
    const shade = dark ? 0x3a3632 + (Math.floor(R() * 16) * 0x010101) : 0x8a8580 + (Math.floor(R() * 24) * 0x010101);
    const s0 = (dark ? 0.4 : 0.32) + R() * 0.15;
    const ok = ps.emit({
      frames, blend: 'normal', prio, group, x: x0 + R() * (x1 - x0), y: y0 + R() * (y1 - y0),
      vx: 4 + R() * 6, vy: -(18 + R() * 10), dragY: 0.18, life: 3 + R() * 1.8,
      scale0: s0, scale1: s0 * (3.4 + R() * 1.2), alpha0: dark ? 0.7 : 0.5, alpha1: 0, fadeIn: 0.12, tint: shade,
    });
    if (!ok) break;
    out++;
  }
  return out;
}

/** Poeira no chão: `n` baforadas em volta de (x, y) com raio `spread` px, espalhando a `speed` px/s para fora. */
export function dust(ps: ParticleSystem, tex: FxTextures, x: number, y: number, o: { n: number; tint: number; spread?: number; speed?: number; scale?: number; grow?: number; alpha?: number; life?: number; prio?: Prio; group?: string; rise?: number; vx?: number; vy?: number }): void {
  for (let i = 0; i < o.n; i++) {
    const a = R() * Math.PI * 2, d = R() * (o.spread ?? 3), sp = (o.speed ?? 10) * rr(0.5, 1.2);
    const s = (o.scale ?? 0.4) * rr(0.8, 1.2);
    if (!ps.emit({
      frames: [tex.pick('dust')], blend: 'normal', prio: o.prio ?? PRIO.combat, group: o.group,
      x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, z: rr(0, 2),
      vx: Math.cos(a) * sp + (o.vx ?? 0), vy: Math.sin(a) * sp * 0.6 + (o.vy ?? 0), vz: o.rise ?? rr(4, 10), drag: 2.2, wind: 0.4,
      life: (o.life ?? 0.9) * rr(0.75, 1.25), scale0: s, scale1: s * (o.grow ?? 2.2), alpha0: o.alpha ?? 0.45, fadeIn: 0.12, tint: o.tint, rot: R() * 6.28, spin: rr(-0.6, 0.6),
    })) return;
  }
}

/** Faíscas (metal): riscos aditivos alinhados à velocidade, sobem e caem com gravidade; vida curta. */
export function sparks(ps: ParticleSystem, tex: FxTextures, x: number, y: number, z: number, n: number, prio: Prio = PRIO.combat, dirX = 0): void {
  const f = [tex.frame('spark')];
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, sp = rr(40, 110);
    if (!ps.emit({ frames: f, blend: 'add', prio, x: x + rr(-2, 2), y, z, vx: Math.cos(a) * sp + dirX * 30, vy: Math.sin(a) * sp * 0.5, vz: rr(30, 110), gravity: 380,
      life: rr(0.18, 0.38), scale0: rr(0.9, 1.3), scale1: 0.55, alpha0: 1, alpha1: 0.2, tint: R() < 0.5 ? 0xffe7b0 : 0xffc070, align: true })) return;
  }
}

/** Lascas de madeira ou pedra (e pedrinhas): voam, quicam no chão, param e somem. */
export function chips(ps: ParticleSystem, tex: FxTextures, x: number, y: number, z: number, n: number, kind: 'wood' | 'stone', prio: Prio = PRIO.combat, power = 1): void {
  const fam = kind === 'wood' ? 'chip_wood' : 'chip_stone';
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, sp = rr(18, 55) * power;
    if (!ps.emit({ frames: [tex.pick(fam)], blend: 'normal', prio, x: x + rr(-3, 3), y: y + rr(-2, 2), z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rr(40, 95) * power, gravity: 300, bounce: 0.3,
      life: rr(0.9, 1.6), scale0: rr(0.8, 1.2) * Math.min(1.6, power), alpha0: 1, alpha1: 0, fadeIn: 0, rot: R() * 6.28, spin: rr(-14, 14) })) return;
  }
}

/** Folhas caindo balançando (árvore derrubada). */
export function leaves(ps: ParticleSystem, tex: FxTextures, x: number, y: number, z: number, n: number, prio: Prio = PRIO.combat): void {
  for (let i = 0; i < n; i++) {
    if (!ps.emit({ frames: [tex.pick('leaf')], blend: 'normal', prio, x: x + rr(-10, 10), y: y + rr(-4, 4), z: z + rr(0, 14), vx: rr(-14, 14), vy: rr(-4, 4), vz: rr(0, 25), gravity: 55, drag: 1.4, wind: 1,
      life: rr(1.4, 2.4), scale0: rr(0.9, 1.3), alpha0: 1, alpha1: 0, rot: R() * 6.28, spin: rr(-5, 5) })) return;
  }
}

/** Brasas subindo (fogo, raio). */
export function embers(ps: ParticleSystem, tex: FxTextures, x: number, y: number, z: number, n: number, prio: Prio = PRIO.combat, group?: string): void {
  const f = [tex.frame('ember')];
  for (let i = 0; i < n; i++) {
    if (!ps.emit({ frames: f, blend: 'add', prio, group, x: x + rr(-5, 5), y: y + rr(-2, 2), z, vx: rr(-8, 8), vy: rr(-3, 3), vz: rr(18, 45), drag: 0.8, wind: 1,
      life: rr(0.7, 1.4), scale0: rr(0.6, 1), scale1: 0.3, alpha0: 1, alpha1: 0, fadeIn: 0.1, tint: R() < 0.5 ? 0xffb050 : 0xff7a30 })) return;
  }
}

/** Uma chama do flipbook `fire` (aditiva), com fumaça escura por cima opcional. `scale` 1 ≈ 24×40 px a zoom 1. */
export function flame(ps: ParticleSystem, tex: FxTextures, x: number, y: number, z: number, scale: number, life: number, prio: Prio = PRIO.combat, group?: string): boolean {
  return ps.emit({ frames: tex.family('fire'), fps: rr(11, 14), blend: 'add', prio, group, x, y, z, vz: rr(2, 6), life,
    scale0: scale * rr(0.75, 0.9), scale1: scale * rr(1, 1.15), alpha0: 1, alpha1: 0, fadeIn: 0.15 });
}

/** Clarão de luz (textura `glow`, aditiva): cresce e apaga. `r` = raio em px. */
export function glow(ps: ParticleSystem, tex: FxTextures, x: number, y: number, z: number, r: number, tint: number, life: number, prio: Prio = PRIO.combat, alpha = 1): boolean {
  const s = r / 16;
  return ps.emit({ frames: [tex.frame('glow')], blend: 'add', prio, x, y, z, life, scale0: s * 0.7, scale1: s * 1.15, alpha0: alpha, alpha1: 0, fadeIn: 0.08, tint });
}

/** Onda/anel no chão (textura `ring`, aro a 84 % do raio): de `r0` a `r1` px de raio. Aditiva (luz divina) ou normal
 *  tingida (onda de poeira) — lê a ÁREA de um poder. */
export function ring(ps: ParticleSystem, tex: FxTextures, x: number, y: number, r0: number, r1: number, tint: number, life: number, blend: 'add' | 'normal', prio: Prio = PRIO.power, alpha = 0.9): boolean {
  const k = 1 / (0.84 * 32);
  return ps.emit({ frames: [tex.frame('ring')], blend, prio, x, y, life, scale0: r0 * k, scale1: r1 * k, alpha0: alpha, alpha1: 0, fadeIn: 0.1, tint });
}

/** Centelhas divinas (textura `mote`, aditiva) subindo de pontos aleatórios num disco de raio `radius` px. */
export function motes(ps: ParticleSystem, tex: FxTextures, x: number, y: number, n: number, tint: number, radius: number, prio: Prio = PRIO.power, rise = 30): void {
  const f = [tex.frame('mote')];
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * radius;
    if (!ps.emit({ frames: f, blend: 'add', prio, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, z: rr(0, 8), vx: rr(-4, 4), vy: rr(-2, 2), vz: rr(rise * 0.6, rise * 1.3), drag: 0.6,
      life: rr(0.7, 1.4), scale0: rr(0.6, 1), scale1: 0.35, alpha0: 1, alpha1: 0, fadeIn: 0.2, tint, spin: rr(-2, 2) })) return;
  }
}

/** Nuvem baixa e larga (textura `smoke`) — névoa de peste, poeira grossa de desabamento. */
export function haze(ps: ParticleSystem, tex: FxTextures, x: number, y: number, n: number, radius: number, tint: number, o: { alpha?: number; life?: number; scale?: number; prio?: Prio; rise?: number } = {}): void {
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * radius, s = (o.scale ?? 1.2) * rr(0.8, 1.2);
    if (!ps.emit({ frames: [tex.pick('smoke')], blend: 'normal', prio: o.prio ?? PRIO.power, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, z: rr(0, 6), vx: rr(-5, 5), vy: rr(-3, 3), vz: o.rise ?? rr(2, 8), drag: 0.5, wind: 0.6,
      life: (o.life ?? 2.2) * rr(0.8, 1.2), scale0: s, scale1: s * 1.6, alpha0: o.alpha ?? 0.35, alpha1: 0, fadeIn: 0.25, tint, rot: R() * 6.28, spin: rr(-0.3, 0.3) })) return;
  }
}

/** px por tile (atalho para quem converte raios de tiles). */
export const PX = TILE;
