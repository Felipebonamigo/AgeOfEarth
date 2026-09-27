// Surgimentos DIVINOS (efeito `spawn` de ttl 20; lote poderes-luz da Etapa 5, docs/ART.md Apêndice F): o núcleo usa o
// mesmo tipo para a Isca de Poseidon, as Sentinelas, a Cornucópia da Abundância e os reforços de cenário, então o que
// nasceu no ponto decide a arte (o nó `lure`, o edifício `cornucopia` ou uma unidade `sentinel` ali):
//  - Isca (Poseidon): a pedra sagrada ROMPE o chão com a força do mar — coluna de luz verde-água, esguicho de gotas
//    caindo em volta, anel d'água, lascas de pedra e rachadura pequena no chão;
//  - Sentinelas: cada estátua SURGE DA TERRA — rachadura, pedras e lascas saltando, coluna de poeira grossa (a estátua
//    aparece dentro dela) e um lampejo dourado discreto;
//  - Abundância: a cornucópia se enche — coluna e poça de luz dourada, chafariz de grãos dourados e folhas caindo,
//    centelhas subindo;
//  - outro (reforços de cenário): o anel dourado de luz da base.
// Todos com luz aditiva só no que é luz divina; só se o ponto estiver à vista e na tela, e de um disparo só (FRESH).
import { BUILDINGS } from '../../../core/data';
import type { GameState, VisualEffect } from '../../../core/types';
import type { FxContext } from '../types';
import { PRIO } from '../../particles';
import { chips, dust, glow, leaves, motes, ring } from '../emitters';
import { TILE, dustAt } from './util';
import { SpriteSet, shaft } from './kit';

const R = Math.random;
export type SummonKind = 'lure' | 'sentinel' | 'plenty' | 'divine';

/** O que nasceu no ponto de um surgimento divino. */
export function summonKind(state: GameState, e: Pick<VisualEffect, 'x' | 'y'>): SummonKind {
  const m = state.map, tx = Math.floor(e.x), ty = Math.floor(e.y);
  if (tx >= 0 && ty >= 0 && tx < m.w && ty < m.h) {
    const i = ty * m.w + tx;
    const node = m.nodeAt[i] !== -1 ? m.nodes.get(m.nodeAt[i]) : undefined;
    if (node?.type === 'lure') return 'lure';
    const b = m.buildingAt[i] !== -1 ? state.buildings.get(m.buildingAt[i]) : undefined;
    if (b?.type === 'cornucopia') return 'plenty';
  }
  for (const u of state.units.values()) if (u.type === 'sentinel' && Math.abs(u.x - e.x) < 0.3 && Math.abs(u.y - e.y) < 0.3) return 'sentinel';
  return 'divine';
}

export interface SummonS { set: SpriteSet }

/** Cria a arte do surgimento divino (chamado pelo handler `spawn` quando o efeito é novo e está à vista). */
export function summon(e: VisualEffect, fx: FxContext): SummonS {
  const s: SummonS = { set: new SpriteSet() };
  const x = e.x * TILE, y = e.y * TILE, g = fx.tex.frame('glow');
  const kind = summonKind(fx.state, e);
  if (kind === 'lure') {
    fx.decal('decal/crack', e.x, e.y + 0.1, { rot: R() * 6.28, size: 1.8 * TILE, alpha: 0.85, life: 30 });
    shaft(s.set, fx.glowLayer, g, fx.clock, x, y, 130, 26, 0x86e2ff, 0.95, 0.9);
    shaft(s.set, fx.glowLayer, g, fx.clock, x, y, 100, 9, 0xe6fbff, 0.7, 0.9);
    glow(fx.particles, fx.tex, x, y, 6, 46, 0x9fe4ff, 0.9, PRIO.power, 0.8);
    // o mar rompendo o chão: anel d'água se abrindo, névoa de respingo e o esguicho de gotas caindo em volta
    ring(fx.particles, fx.tex, x, y, 6, 50, 0xdaf1fb, 0.8, 'normal', PRIO.power, 0.85);
    ring(fx.particles, fx.tex, x, y, 4, 34, 0x9fe8ff, 0.6, 'add', PRIO.power, 0.8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + R() * 0.5;
      fx.particles.emit({ frames: [fx.tex.pick('smoke')], blend: 'normal', prio: PRIO.power, x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 4, z: 4, vx: Math.cos(a) * 34, vy: Math.sin(a) * 20, vz: 18, drag: 1.6,
        life: 1.1, scale0: 0.6, scale1: 1.6, alpha0: 0.55, alpha1: 0, fadeIn: 0.1, tint: 0xe4f3fb, rot: R() * 6.28 });
    }
    const drop = [fx.tex.frame('drop')];
    for (let i = 0; i < 40; i++) {
      const a = R() * Math.PI * 2, sp = 20 + R() * 44;
      if (!fx.particles.emit({ frames: drop, blend: 'normal', prio: PRIO.power, x: x + Math.cos(a) * 3, y: y + Math.sin(a) * 2, z: 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: 110 + R() * 90, gravity: 420,
        life: 0.8 + R() * 0.3, scale0: 1.3 + R() * 0.5, scale1: 1, alpha0: 0.95, alpha1: 0.55, fadeIn: 0, tint: 0xd8efff })) break;
    }
    chips(fx.particles, fx.tex, x, y, 4, 8, 'stone', PRIO.power, 1.3);
    motes(fx.particles, fx.tex, x, y, 14, 0xcff6ff, 12, PRIO.power, 44);
  } else if (kind === 'sentinel') {
    // a estátua rompe a terra: a rachadura, pedras e lascas saltando e uma coluna de poeira grossa em volta dela
    fx.decal('decal/crack', e.x, e.y, { rot: R() * 6.28, size: 2 * TILE, alpha: 0.9, life: 30 });
    fx.decal('decal/debris', e.x, e.y + 0.1, { rot: R() * 6.28, size: 1.4 * TILE, alpha: 1, life: 30 });
    const tint = dustAt(fx, e.x, e.y);
    dust(fx.particles, fx.tex, x, y, { n: 16, tint, spread: 9, speed: 18, scale: 0.9, grow: 2.8, alpha: 0.72, life: 1.7, prio: PRIO.power, rise: 46 });
    dust(fx.particles, fx.tex, x, y, { n: 10, tint, spread: 5, speed: 52, scale: 0.6, grow: 2.4, alpha: 0.6, life: 1.1, prio: PRIO.power, rise: 8 });
    ring(fx.particles, fx.tex, x, y, 5, 40, 0x8f7d5e, 0.8, 'normal', PRIO.power, 0.6);
    chips(fx.particles, fx.tex, x, y, 8, 16, 'stone', PRIO.power, 1.6);
    glow(fx.particles, fx.tex, x, y, 12, 26, 0xffe0a0, 0.6, PRIO.power, 0.45);
    motes(fx.particles, fx.tex, x, y, 6, 0xffe2a0, 8, PRIO.power, 32);
    fx.shake(2.5);
  } else if (kind === 'plenty') {
    const d = BUILDINGS.cornucopia, half = Math.max(d.w, d.h) * TILE * 0.5;
    shaft(s.set, fx.glowLayer, g, fx.clock, x, y + half * 0.4, 150, 40, 0xffd476, 0.95, 0.85);
    shaft(s.set, fx.glowLayer, g, fx.clock, x, y + half * 0.4, 120, 14, 0xfff2c8, 0.75, 0.9);
    glow(fx.particles, fx.tex, x, y, 0, half * 4, 0xffcc66, 1.5, PRIO.power, 0.6);
    ring(fx.particles, fx.tex, x, y, 10, half * 2.8, 0xffd27a, 1.0, 'add', PRIO.power, 0.95);
    ring(fx.particles, fx.tex, x, y, 8, half * 2, 0xfff0c0, 0.7, 'add', PRIO.power, 0.6);
    // chafariz de grãos dourados (a `ember` em mistura normal, tinta de trigo) e folhas caindo
    const grain = [fx.tex.frame('ember')];
    for (let i = 0; i < 40; i++) {
      const a = R() * Math.PI * 2, sp = 24 + R() * 40;
      if (!fx.particles.emit({ frames: grain, blend: 'normal', prio: PRIO.power, x: x + (R() - 0.5) * 10, y: y - 4, z: 18, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: 80 + R() * 80, gravity: 300, bounce: 0.25,
        life: 1.1 + R() * 0.5, scale0: 0.85, scale1: 0.7, alpha0: 1, alpha1: 0, fadeIn: 0, tint: R() < 0.5 ? 0xe9c15a : 0xd8a23e })) break;
    }
    leaves(fx.particles, fx.tex, x, y - 10, 30, 12, PRIO.power);
    motes(fx.particles, fx.tex, x, y, 22, 0xffe6a0, half, PRIO.power, 46);
  } else {
    ring(fx.particles, fx.tex, x, y, 6, 30, 0xffd27a, 0.9, 'add', PRIO.power, 0.85);
    motes(fx.particles, fx.tex, x, y, 14, 0xffe2a0, 14, PRIO.power, 34);
    glow(fx.particles, fx.tex, x, y, 10, 26, 0xffe0a0, 0.6, PRIO.power, 0.8);
  }
  return s;
}
