// Evolução de linha (E3, docs/eras/E3-linhas-de-unidade.md): a unidade que trocou de degrau solta poeira no pé e um brilho
// dourado que sobe (o renderizador já recria a vista com o tipo novo). Só se o efeito for novo e estiver à vista.
import type { FxHandler } from '../types';
import { PRIO } from '../../particles';
import { dust, glow, motes } from '../emitters';
import { FRESH, TILE, dustAt, seenNow } from './util';

export const evolve: FxHandler<null> = {
  create(e, fx, age) {
    if (age > FRESH || !seenNow(fx, e.x, e.y)) return null;
    const x = e.x * TILE, y = e.y * TILE;
    dust(fx.particles, fx.tex, x, y, { n: 6, tint: dustAt(fx, e.x, e.y), spread: 6, speed: 10, scale: 0.4, grow: 2, alpha: 0.45, life: 0.9, rise: 4 });
    glow(fx.particles, fx.tex, x, y, 10, 18, 0xffe3a0, 0.7, PRIO.combat, 0.55);
    motes(fx.particles, fx.tex, x, y, 5, 0xffe9b0, 6, PRIO.combat, 28);
    return null;
  },
};
