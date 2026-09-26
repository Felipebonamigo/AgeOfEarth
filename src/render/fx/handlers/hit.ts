// Golpe corpo a corpo (P0, docs/ART.md §1.9; SEM sangue — pergunta 5 do dono e docs/LEGAL.md): o que salta depende de
// QUEM levou o golpe (`e.data` = tipo do alvo, campo visual do núcleo): faíscas aditivas no bronze (hoplitas, arqueiros,
// cavalaria, heróis), lascas de madeira (casas, quartéis, cerco), lascas de pedra (muralhas, torres, templos, o colosso)
// e só poeira no resto (cidadão, milícia, míticas). Um disparo só, à vista, na altura do tronco/fachada.
import { BUILDINGS } from '../../../core/data';
import type { FxHandler } from '../types';
import { hitMaterial } from '../logic';
import { PRIO } from '../../particles';
import { chips, dust, glow, sparks } from '../emitters';
import { FRESH, TILE, dustAt, seenNow } from './util';

export const hit: FxHandler<null> = {
  create(e, fx, age) {
    if (age > FRESH || !seenNow(fx, e.x, e.y)) return null;
    const x = e.x * TILE, y = e.y * TILE, tint = dustAt(fx, e.x, e.y);
    const building = typeof e.data === 'string' && !!BUILDINGS[e.data];
    const z = building ? 16 : 10;   // tronco de um humano (~0,35 tile × 0,84) ou meia fachada
    switch (hitMaterial(e.data)) {
      case 'metal':
        sparks(fx.particles, fx.tex, x, y, z, 4 + Math.floor(Math.random() * 4), PRIO.combat);
        glow(fx.particles, fx.tex, x, y, z, 6, 0xffd9a0, 0.12, PRIO.combat, 0.75);   // o lampejo do metal: lê a zoom 1
        dust(fx.particles, fx.tex, x, y, { n: 1, tint, spread: 3, speed: 10, scale: 0.3, alpha: 0.35, life: 0.6 });
        break;
      case 'wood':
        chips(fx.particles, fx.tex, x, y, z, 4, 'wood');
        dust(fx.particles, fx.tex, x, y, { n: 2, tint: 0xa89a80, spread: 5, speed: 12, scale: 0.35, alpha: 0.4, life: 0.8 });
        break;
      case 'stone':
        chips(fx.particles, fx.tex, x, y, z, 3, 'stone');
        dust(fx.particles, fx.tex, x, y, { n: 2, tint: 0xb4ada0, spread: 5, speed: 12, scale: 0.4, alpha: 0.45, life: 0.9 });
        break;
      default:
        dust(fx.particles, fx.tex, x, y, { n: 2, tint, spread: 4, speed: 16, scale: 0.35, alpha: 0.45, life: 0.8 });
    }
    return null;
  },
};
