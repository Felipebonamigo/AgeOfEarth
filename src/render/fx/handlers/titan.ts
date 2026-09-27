// Titã saindo do portal (`titanRise`, 3 s, ao completar o Portal dos Titãs; lote poderes-luz da Etapa 5, docs/ART.md
// Apêndice F). O chão racha e queima em volta do portal (rachadura grande, escombros e queimadura em decalque); uma
// onda de poeira se abre até ~7 tiles e uma onda de fogo mais curta; uma COLUNA de fogo e luz sobe do portal (luz
// aditiva: é fogo), com a poça de luz de brasa no chão e um clarão alaranjado na tela; brasas em chafariz, pedras voando,
// e depois fumaça escura subindo e brasas até a metade do efeito. Tremor forte no começo. Etapa 6 (lote titãs): o titã
// nasce ao lado do portal SAINDO DO CHÃO (animação `rise` do atlas, 8 quadros, tocada pelo renderizador desde o tick do
// nascimento); aqui, no pé dele, o chão se abre — rachadura, terra revolvida e poeira subindo enquanto ele emerge.
import type { FxHandler } from '../types';
import { PRIO } from '../../particles';
import { chips, dust, embers, flame, glow, haze, ring } from '../emitters';
import { FRESH, TILE, dustAt } from './util';
import { UNITS } from '../../../core/data';
import { effectTick } from '../rules';
import { SpriteSet, every, shaft } from './kit';

const R = Math.random;
interface S { acc: { acc: number }; smoke: { acc: number }; set: SpriteSet; fresh: boolean; rise: { x: number; y: number; acc: number } | null }

/** O titã que nasceu com este efeito (mesmo tick, perto do portal): o chão se abre sob ele. */
function bornTitan(fx: Parameters<FxHandler<S>['create']>[1], e: Parameters<FxHandler<S>['create']>[0]): { x: number; y: number } | null {
  const tick = effectTick(fx.state, e);
  for (const u of fx.state.units.values()) {
    if (u.spawnTick !== tick || !UNITS[u.type]?.tags.includes('titan')) continue;
    const dx = u.x - e.x, dy = u.y - e.y;
    if (dx * dx + dy * dy < 100) return { x: u.x, y: u.y };
  }
  return null;
}

export const titanRise: FxHandler<S> = {
  create(e, fx, age) {
    const s: S = { acc: { acc: 0 }, smoke: { acc: 0 }, set: new SpriteSet(), fresh: age <= FRESH, rise: null };
    if (!s.fresh) return s;
    // o chão se abre no pé do titã que nasce (decalques têm a névoa própria; a poeira só à vista, no update)
    const born = bornTitan(fx, e);
    if (born) {
      s.rise = { ...born, acc: 0 };
      fx.decal('decal/crack', born.x, born.y, { rot: R() * 6.28, size: 3.2 * TILE, alpha: 0.9, life: 60 });
      fx.decal('decal/debris', born.x, born.y + 0.3, { rot: R() * 6.28, size: 2.6 * TILE, alpha: 0.9, life: 60 });
    }
    if (fx.onScreen(e.x, e.y, 12) && fx.visibleAt(e.x, e.y)) fx.shake(12);
    fx.decal('decal/crack', e.x, e.y, { rot: R() * 6.28, size: 6 * TILE, alpha: 0.95, life: 60 });
    fx.decal('decal/burn', e.x, e.y + 0.5, { rot: R() * 6.28, size: 4.2 * TILE, alpha: 0.65, life: 60 });
    fx.decal('decal/debris', e.x, e.y + 1, { rot: R() * 6.28, size: 4.5 * TILE, alpha: 1, life: 60 });
    if (!fx.onScreen(e.x, e.y, 7) || !fx.visibleAt(e.x, e.y)) return s;
    const x = e.x * TILE, y = e.y * TILE, tint = dustAt(fx, e.x, e.y);
    ring(fx.particles, fx.tex, x, y, 1.2 * TILE, 7.5 * TILE, tint, 1.9, 'normal', PRIO.power, 0.65);
    ring(fx.particles, fx.tex, x, y, TILE, 5 * TILE, 0xff9a50, 0.9, 'add', PRIO.power, 0.6);
    dust(fx.particles, fx.tex, x, y, { n: 26, tint, spread: 3 * TILE, speed: 70, scale: 1, grow: 3, alpha: 0.55, life: 2.6, prio: PRIO.power, rise: 12 });
    glow(fx.particles, fx.tex, x, y, 0, 6 * TILE, 0xff5a22, 2.6, PRIO.power, 0.75);
    glow(fx.particles, fx.tex, x, y, 0, 3 * TILE, 0xff9a50, 1.6, PRIO.power, 0.7);
    glow(fx.particles, fx.tex, x, y, 30, 2.4 * TILE, 0xffd2a0, 0.6, PRIO.power, 1);
    const g = fx.tex.frame('glow');
    shaft(s.set, fx.glowLayer, g, fx.clock, x, y, 6.5 * TILE, 2 * TILE, 0xff7a36, 2.3, 0.75);
    shaft(s.set, fx.glowLayer, g, fx.clock, x, y, 5 * TILE, 0.8 * TILE, 0xffe2b8, 1.4, 0.9);
    embers(fx.particles, fx.tex, x, y, 10, 30, PRIO.power);
    for (let i = 0; i < 5; i++) flame(fx.particles, fx.tex, x + (R() - 0.5) * 2 * TILE, y + (R() - 0.3) * TILE, 0, 0.8 + R() * 0.4, 1.2 + R() * 0.8, PRIO.power, undefined, true);
    chips(fx.particles, fx.tex, x, y, 10, 16, 'stone', PRIO.power, 1.8);
    fx.screen.flash(0.12, 0xffc090);
    return s;
  },
  update(e, s, fx, _t, p) {
    s.set.update(fx.clock);
    // poeira e torrões subindo no pé do titã enquanto ele sai da terra (a primeira metade do efeito ≈ a ascensão)
    if (s.rise && p < 0.55 && fx.onScreen(s.rise.x, s.rise.y, 4) && fx.visibleAt(s.rise.x, s.rise.y)) {
      const r = s.rise, x = r.x * TILE, y = r.y * TILE, n = every(r, 10, fx.dt);
      if (n) {
        const tint = dustAt(fx, r.x, r.y);
        dust(fx.particles, fx.tex, x, y, { n: 2 * n, tint, spread: 1.3 * TILE, speed: 40, scale: 0.9, grow: 2.2, alpha: 0.5, life: 1.8, prio: PRIO.power, rise: 16 });
        chips(fx.particles, fx.tex, x, y, 4, 2 * n, 'stone', PRIO.power, 1.2);
      }
    }
    if (p < 0.3 && fx.onScreen(e.x, e.y, 12) && fx.visibleAt(e.x, e.y)) fx.shake(8);
    if (!s.fresh || p > 0.7 || !fx.onScreen(e.x, e.y, 6) || !fx.visibleAt(e.x, e.y)) return;
    const x = e.x * TILE, y = e.y * TILE;
    const n = every(s.acc, 26 * (1 - p), fx.dt);
    if (n) embers(fx.particles, fx.tex, x + (R() - 0.5) * 50, y - 6, 12, n, PRIO.power);
    if (every(s.smoke, 7, fx.dt)) haze(fx.particles, fx.tex, x + (R() - 0.5) * 40, y - 10, 1, 12, 0x2c2622, { alpha: 0.55, life: 3, scale: 1.4, rise: 34, prio: PRIO.power });
  },
  destroy(_e, s) { s.set.destroy(); },
};
