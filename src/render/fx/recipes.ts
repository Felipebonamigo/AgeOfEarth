// Receitas de partículas do lote combate-ambiente da Etapa 5 (docs/ART.md Apêndice F), ao lado das de emitters.ts:
// respingo d'água, chão em chamas, jato de fogo, onda de poeira rasteira, centelhas subindo do corpo (halo, cura, auras),
// luz convergindo, risco de vento, rajada de poeira no vento e fumaça fina de trabalho. Mesmas regras: px de MUNDO, z =
// altura (px de tela para cima), prioridade no orçamento escolhida por quem chama, aditiva só no que emite luz.
import { PRIO, type Prio, type ParticleSystem } from '../particles';
import type { FxTextures } from './FxTextures';
import { embers, flame } from './emitters';

const R = Math.random;
const rr = (a: number, b: number) => a + R() * (b - a);

/** Respingo d'água: gotas pulando e caindo (e um aro de ondulação na água), `power` 1 = pé na margem. */
export function waterSplash(ps: ParticleSystem, tex: FxTextures, x: number, y: number, o: { n: number; power?: number; ring?: boolean; prio?: Prio; spread?: number }): void {
  const p = o.power ?? 1, prio = o.prio ?? PRIO.ambient, f = [tex.frame('drop')];
  for (let i = 0; i < o.n; i++) {
    const a = R() * Math.PI * 2, sp = rr(6, 22) * p;
    if (!ps.emit({ frames: f, blend: 'normal', prio, x: x + Math.cos(a) * rr(0, o.spread ?? 2), y: y + Math.sin(a) * rr(0, (o.spread ?? 2) * 0.6), z: 1,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: rr(28, 55) * Math.sqrt(p), gravity: 260,
      life: rr(0.35, 0.6) * Math.sqrt(p), scale0: rr(0.7, 1.05) * Math.min(1.6, 0.8 + 0.2 * p), scale1: 0.5, alpha0: 0.9, alpha1: 0.3, tint: R() < 0.5 ? 0xf2f8fc : 0xcfe2ee })) return;
  }
  if (o.ring !== false) {
    const k = 1 / (0.84 * 32), r0 = 2 * p, r1 = 9 * p;
    ps.emit({ frames: [tex.frame('ring')], blend: 'normal', prio, x, y, life: 0.8, scale0: r0 * k, scale1: r1 * k, alpha0: 0.45, alpha1: 0, fadeIn: 0.1, tint: 0xe4f0f6 });
  }
}

/** Chão em chamas numa área de raio `radius` px: `n` línguas de fogo em flipbook (aditivas, tamanho × `size`), brasas e,
 *  por cima, fumaça escura subindo — o fogo da Quimera e de Prometeu. */
export function fireGround(ps: ParticleSystem, tex: FxTextures, x: number, y: number, radius: number, n: number, prio: Prio = PRIO.combat, size = 1): void {
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * radius;
    const fx = x + Math.cos(a) * d, fy = y + Math.sin(a) * d * 0.7;
    if (!flame(ps, tex, fx, fy, 0, size * rr(0.45, 0.75) * (1 - 0.35 * d / Math.max(1, radius)), rr(0.7, 1.3), prio)) break;
  }
  embers(ps, tex, x, y, 4, Math.ceil(n * 1.2), prio);
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * radius * 0.8, s = rr(0.5, 0.8);
    if (!ps.emit({ frames: [tex.pick('smoke')], blend: 'normal', prio, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, z: rr(10, 20), vx: rr(-3, 3), vy: rr(-2, 2), vz: rr(14, 24), drag: 0.3, wind: 0.8,
      life: rr(1.6, 2.4), scale0: s, scale1: s * 2.6, alpha0: 0.45, alpha1: 0, fadeIn: 0.3, tint: 0x3c3834, rot: R() * 6.28, spin: rr(-0.4, 0.4) })) return;
  }
}

/** Jato de fogo de (x0, y0, z0) até (x1, y1) (px de mundo): chamas voando pela linha e crescendo (o sopro da Quimera). */
export function fireJet(ps: ParticleSystem, tex: FxTextures, x0: number, y0: number, z0: number, x1: number, y1: number, n: number, prio: Prio = PRIO.combat): void {
  const dx = x1 - x0, dy = y1 - y0, T = 0.22;
  for (let i = 0; i < n; i++) {
    const k = i / Math.max(1, n - 1), life = rr(0.25, 0.4);
    if (!ps.emit({ frames: tex.family('fire'), fps: 14, blend: 'add', prio, x: x0 + dx * k * 0.3, y: y0 + dy * k * 0.3, z: z0 * (1 - k * 0.5),
      vx: dx / T * rr(0.8, 1.1), vy: dy / T * rr(0.8, 1.1), vz: -z0 / T * 0.6, drag: 1.5,
      life, scale0: rr(0.25, 0.35), scale1: rr(0.6, 0.8), alpha0: 1, alpha1: 0, fadeIn: 0.05, rot: Math.atan2(dy, dx) + Math.PI / 2 })) return;
  }
}

/** Onda de poeira rasteira: `n` baforadas num anel de raio `r0` px correndo para fora até ≈ `r1` — lê a ÁREA de um impacto
 *  sem aro desenhado (o chão levanta). */
export function dustWave(ps: ParticleSystem, tex: FxTextures, x: number, y: number, r0: number, r1: number, n: number, tint: number, o: { prio?: Prio; life?: number; scale?: number; alpha?: number } = {}): void {
  const life = o.life ?? 0.9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rr(-0.15, 0.15), sp = (r1 - r0) / life * rr(1.2, 1.6), s = (o.scale ?? 0.5) * rr(0.8, 1.2);
    if (!ps.emit({ frames: [tex.pick('dust')], blend: 'normal', prio: o.prio ?? PRIO.combat, x: x + Math.cos(a) * r0, y: y + Math.sin(a) * r0 * 0.7, z: rr(0, 2),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: rr(3, 8), drag: 1.6, wind: 0.3,
      life: life * rr(0.85, 1.2), scale0: s, scale1: s * 2.6, alpha0: o.alpha ?? 0.5, alpha1: 0, fadeIn: 0.08, tint, rot: R() * 6.28, spin: rr(-0.5, 0.5) })) return;
  }
}

/** Centelhas subindo devagar de pontos do CORPO de uma unidade (altura `z0`–`z1` px, meia largura `w` px): halo dos
 *  heróis, brilho da cura, auras das habilidades. `blend` aditivo (luz) ou normal (vento, folhas). */
export function bodyMotes(ps: ParticleSystem, tex: FxTextures, x: number, y: number, n: number, o: { tint: number; z0: number; z1: number; w?: number; rise?: number; life?: number; scale?: number; alpha?: number; prio?: Prio; frame?: string; blend?: 'add' | 'normal' }): void {
  const f = [tex.frame(o.frame ?? 'mote')], w = o.w ?? 5;
  for (let i = 0; i < n; i++) {
    const s = (o.scale ?? 0.6) * rr(0.8, 1.2);
    if (!ps.emit({ frames: f, blend: o.blend ?? 'add', prio: o.prio ?? PRIO.ambient, x: x + rr(-w, w), y: y + rr(-1.5, 1.5), z: rr(o.z0, o.z1), vx: rr(-3, 3), vy: rr(-1, 1), vz: (o.rise ?? 12) * rr(0.7, 1.3), drag: 0.5,
      life: (o.life ?? 1.3) * rr(0.8, 1.2), scale0: s, scale1: s * 0.45, alpha0: o.alpha ?? 0.8, alpha1: 0, fadeIn: 0.25, tint: o.tint, spin: rr(-1.5, 1.5) })) return;
  }
}

/** Luz convergindo: `n` centelhas num anel de raio `r` px em volta de (x, y, z) indo para o centro e chegando juntas. */
export function converge(ps: ParticleSystem, tex: FxTextures, x: number, y: number, z: number, r: number, n: number, tint: number, prio: Prio = PRIO.power, life = 0.35): void {
  const f = [tex.frame('mote')];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rr(-0.2, 0.2), d = r * rr(0.85, 1.15), cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    if (!ps.emit({ frames: f, blend: 'add', prio, x: x + cx, y, z: z + cz, vx: -cx / life, vz: -cz / life, life, scale0: rr(0.6, 0.9), scale1: 1.1, alpha0: 0.9, alpha1: 0.6, fadeIn: 0.2, tint })) return;
  }
}

/** Risco de vento (textura `spark` em mistura NORMAL, clara): alinhado à velocidade, curto — o rastro da Astúcia. */
export function windStreak(ps: ParticleSystem, tex: FxTextures, x: number, y: number, z: number, vx: number, vy: number, tint = 0xe9eef0, prio: Prio = PRIO.ambient, alpha = 0.5): boolean {
  return ps.emit({ frames: [tex.frame('spark')], blend: 'normal', prio, x, y, z, vx, vy, drag: 2.5, life: rr(0.25, 0.4), scale0: rr(1.2, 1.7), scale1: 0.6, alpha0: alpha, alpha1: 0, fadeIn: 0.15, tint, align: true });
}

/** Rajada de poeira no vento (bioma árido): nuvem rasteira larga e fraca correndo com o vento (leste-sudeste, o mesmo da
 *  fumaça) por alguns segundos. */
export function windDust(ps: ParticleSystem, tex: FxTextures, x: number, y: number, tint: number): boolean {
  // mais clara que o chão (a areia no ar pega luz): lê como véu passando, e escurece nada
  const s = rr(1.3, 2.3), light = lighten(tint);
  const ok = ps.emit({ frames: [tex.pick('smoke')], blend: 'normal', prio: PRIO.ambient, group: 'dust', x, y, z: rr(0, 3), vx: rr(26, 40), vy: rr(3, 8), vz: rr(0.5, 2.5), wind: 1,
    life: rr(3, 4.5), scale0: s, scale1: s * rr(1.5, 2), alpha0: rr(0.26, 0.36), alpha1: 0, fadeIn: 0.3, tint: light, rot: R() * 6.28, spin: rr(-0.25, 0.25) });
  // e fios de areia rentes ao chão, esticados na direção do vento (o que o olho pega como "está ventando")
  for (let i = 0; ok && i < 2; i++) if (R() < 0.75) ps.emit({ frames: [tex.frame('spark')], blend: 'normal', prio: PRIO.ambient, group: 'dust', x: x + rr(-16, 16), y: y + rr(-10, 10), z: rr(0, 2), vx: rr(48, 70), vy: rr(6, 12), wind: 1,
    life: rr(1.2, 2), scale0: rr(4, 6), scale1: rr(6, 8), alpha0: rr(0.4, 0.55), alpha1: 0, fadeIn: 0.25, tint: 0xfff8ea, align: true });
  return ok;
}
/** Metade do caminho até o branco (a poeira no ar, iluminada, mais clara que o chão de onde saiu). */
function lighten(c: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return ((r + ((255 - r) >> 1)) << 16) | ((g + ((255 - g) >> 1)) << 8) | (b + ((255 - b) >> 1));
}

/** Fumaça fina de trabalho (lareira, forja): um fio claro subindo e derivando com o vento, mais tênue que a de dano. */
export function workSmoke(ps: ParticleSystem, tex: FxTextures, x: number, y: number, forge: boolean): boolean {
  const s0 = rr(0.26, 0.34);
  const shade = forge ? 0x847e78 + Math.floor(R() * 20) * 0x010101 : 0xa09a92 + Math.floor(R() * 20) * 0x010101;
  return ps.emit({ frames: [tex.frame('puff')], blend: 'normal', prio: PRIO.ambient, group: 'smoke', x: x + rr(-1.5, 1.5), y: y + rr(-1, 1),
    vx: rr(2, 5), vy: -rr(14, 20), dragY: 0.2, wind: 0.6, life: rr(2.8, 3.8), scale0: s0, scale1: s0 * rr(3.6, 4.6), alpha0: forge ? 0.5 : 0.42, alpha1: 0, fadeIn: 0.12, tint: shade });
}
