// Titã saindo do portal (`titanRise`, 3 s, ao completar o Portal dos Titãs; lote poderes-luz da Etapa 5, docs/ART.md
// Apêndice F). O chão racha e queima em volta do portal (rachadura grande, escombros e queimadura em decalque); uma
// onda de poeira se abre até ~7 tiles e uma onda de fogo mais curta; uma COLUNA de fogo e luz sobe do portal (luz
// aditiva: é fogo), com a poça de luz de brasa no chão e um clarão alaranjado na tela; brasas em chafariz, pedras voando,
// e depois fumaça escura subindo e brasas até a metade do efeito. Tremor forte no começo. (A ascensão do titã em si, 8
// quadros, é da Etapa 6.)
import type { FxHandler } from '../types';
import { PRIO } from '../../particles';
import { chips, dust, embers, flame, glow, haze, ring } from '../emitters';
import { FRESH, TILE, dustAt } from './util';
import { SpriteSet, every, shaft } from './kit';

const R = Math.random;
interface S { acc: { acc: number }; smoke: { acc: number }; set: SpriteSet; fresh: boolean }

export const titanRise: FxHandler<S> = {
  create(e, fx, age) {
    const s: S = { acc: { acc: 0 }, smoke: { acc: 0 }, set: new SpriteSet(), fresh: age <= FRESH };
    if (!s.fresh) return s;
    if (fx.onScreen(e.x, e.y, 12)) fx.shake(12);
    fx.decal('decal/crack', e.x, e.y, { rot: R() * 6.28, size: 6 * TILE, alpha: 0.95, life: 60 });
    fx.decal('decal/burn', e.x, e.y + 0.5, { rot: R() * 6.28, size: 4.2 * TILE, alpha: 0.7, life: 60 });
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
    for (let i = 0; i < 5; i++) flame(fx.particles, fx.tex, x + (R() - 0.5) * 2 * TILE, y + (R() - 0.3) * TILE, 0, 0.8 + R() * 0.4, 1.2 + R() * 0.8, PRIO.power);
    chips(fx.particles, fx.tex, x, y, 10, 16, 'stone', PRIO.power, 1.8);
    fx.screen.flash(0.12, 0xffc090);
    return s;
  },
  update(e, s, fx, _t, p) {
    s.set.update(fx.clock);
    if (p < 0.3 && fx.onScreen(e.x, e.y, 12)) fx.shake(8);
    if (!s.fresh || p > 0.7 || !fx.onScreen(e.x, e.y, 6) || !fx.visibleAt(e.x, e.y)) return;
    const x = e.x * TILE, y = e.y * TILE;
    const n = every(s.acc, 26 * (1 - p), fx.dt);
    if (n) embers(fx.particles, fx.tex, x + (R() - 0.5) * 50, y - 6, 12, n, PRIO.power);
    if (every(s.smoke, 7, fx.dt)) haze(fx.particles, fx.tex, x + (R() - 0.5) * 40, y - 10, 1, 12, 0x2c2622, { alpha: 0.55, life: 3, scale: 1.4, rise: 34, prio: PRIO.power });
  },
  destroy(_e, s) { s.set.destroy(); },
};
