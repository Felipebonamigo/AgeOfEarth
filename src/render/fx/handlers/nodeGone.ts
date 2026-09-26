// Nó de recurso esgotado (docs/ART.md §1.9; antes caía no `default`): a árvore derrubada solta folhas que caem balançando
// e lascas de madeira (o toco é dos props, props.ts), o veio de ouro solta lascas de pedra e poeira, o arbusto de frutas
// folhas; caça (cervo, javali, isca) só um pouco de poeira. Um disparo só, à vista.
import type { FxHandler } from '../types';
import { chips, dust, leaves } from '../emitters';
import { FRESH, TILE, dustAt, seenNow } from './util';

export const nodeGone: FxHandler<null> = {
  create(e, fx, age) {
    if (age > FRESH || !seenNow(fx, e.x, e.y)) return null;
    const x = e.x * TILE, y = e.y * TILE, tint = dustAt(fx, e.x, e.y);
    switch (e.data) {
      case 'tree':
        leaves(fx.particles, fx.tex, x, y, 26, 10);
        chips(fx.particles, fx.tex, x, y, 6, 4, 'wood');
        dust(fx.particles, fx.tex, x, y, { n: 3, tint, spread: 6, speed: 16, scale: 0.45, alpha: 0.45, life: 1.1 });
        break;
      case 'gold':
        chips(fx.particles, fx.tex, x, y, 6, 6, 'stone', undefined, 1.1);
        dust(fx.particles, fx.tex, x, y, { n: 4, tint: 0xb4ada0, spread: 6, speed: 18, scale: 0.5, alpha: 0.5, life: 1.2 });
        break;
      case 'berry':
        leaves(fx.particles, fx.tex, x, y, 8, 5);
        break;
      default:
        dust(fx.particles, fx.tex, x, y, { n: 2, tint, spread: 4, speed: 12, scale: 0.35, alpha: 0.4, life: 0.8 });
    }
    return null;
  },
};
