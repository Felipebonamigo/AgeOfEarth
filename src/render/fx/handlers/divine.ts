// Poderes e criaturas da E6 (docs/eras/E6-mitologia.md): arte PROVISÓRIA até a E8 — um anel de luz na cor do poder, um brilho
// e centelhas no ponto (`data` = raio em tiles, `src` = id do poder ou 'phoenix' no renascimento); os poderes com duração
// (Primavera, Vendaval, Carro do Sol) têm um handler de duração simples. Nada aparece fora da vista (névoa) nem fora da tela.
import type { FxHandler, TimedHandler } from '../types';
import { PRIO } from '../../particles';
import { flame, glow, haze, motes, ring } from '../emitters';
import { every, inDisc } from './kit';
import { FRESH, TILE } from './util';

const R = Math.random;
const pt = { x: 0, y: 0 };
/** Cor de cada poder novo (e do renascimento da Fênix). */
export const DIVINE_TINT: Record<string, number> = {
  panic: 0x9a7a3a, crossroads: 0x8a5ad8, spring: 0x8ce07a, gale: 0xcfe3f0, tidal_wave: 0x3a9ad8,
  divine_harvest: 0xf0c850, sun_chariot: 0xffb040, winged_victory: 0xfff0b0, retribution: 0xc0304a, phoenix: 0xff8a30,
};

export const divine: FxHandler<null> = {
  create(e, fx, age) {
    if (age > FRESH) return null;
    const r = Number(e.data) || 3;
    if (!fx.onScreen(e.x, e.y, r) || !fx.visibleAt(e.x, e.y)) return null;
    const tint = DIVINE_TINT[String(e.src)] ?? 0xffe3a0, x = e.x * TILE, y = e.y * TILE, R0 = r * TILE;
    ring(fx.particles, fx.tex, x, y, R0 * 0.15, R0, tint, 1.0, 'add', PRIO.power, 0.85);
    glow(fx.particles, fx.tex, x, y, 6, Math.max(24, R0 * 0.8), tint, 1.2, PRIO.power, 0.5);
    motes(fx.particles, fx.tex, x, y, 10 + Math.round(r * 2), tint, R0 * 0.8, PRIO.power, 30);
    return null;
  },
};

interface S { acc: { acc: number } }
function area(kind: 'spring' | 'gale'): TimedHandler<S> {
  return {
    create() { return { acc: { acc: 0 } }; },
    update(tm, s, fx) {
      if (tm.x === undefined || tm.y === undefined || fx.dt <= 0) return;
      const r = tm.data ?? 6;
      if (!fx.onScreen(tm.x, tm.y, r) || !fx.visibleAt(tm.x, tm.y)) return;
      for (let n = every(s.acc, 10 + r * 2, fx.dt); n > 0; n--) {
        inDisc(tm.x, tm.y, r, pt);
        if (!fx.visibleAt(pt.x, pt.y)) continue;
        if (kind === 'spring') motes(fx.particles, fx.tex, pt.x * TILE, pt.y * TILE, 1, DIVINE_TINT.spring, 4, PRIO.power, 18);
        else haze(fx.particles, fx.tex, pt.x * TILE, pt.y * TILE, 1, 6, DIVINE_TINT.gale, { alpha: 0.3, life: 1.2, scale: 1, rise: 4, prio: PRIO.power });
      }
    },
  };
}
export const springTimed = area('spring');
export const galeTimed = area('gale');
/** Carro do Sol: chamas no chão ao longo da faixa (centro tm.x/tm.y, direção tm.dx/tm.dy, meio-comprimento tm.data, meia-largura 1,5). */
export const sunChariotTimed: TimedHandler<S> = {
  create() { return { acc: { acc: 0 } }; },
  update(tm, s, fx) {
    if (tm.x === undefined || tm.y === undefined || fx.dt <= 0) return;
    const half = tm.data ?? 8, dx = tm.dx ?? 1, dy = tm.dy ?? 0;
    if (!fx.onScreen(tm.x, tm.y, half)) return;
    for (let n = every(s.acc, 30, fx.dt); n > 0; n--) {
      const a = (R() * 2 - 1) * half, b = (R() * 2 - 1) * 1.5;
      const x = tm.x + dx * a - dy * b, y = tm.y + dy * a + dx * b;
      if (!fx.visibleAt(x, y)) continue;
      flame(fx.particles, fx.tex, x * TILE, y * TILE, 0, 0.8, 0.7, PRIO.power, undefined, true);
    }
  },
};
