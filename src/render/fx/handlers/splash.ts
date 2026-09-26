// Dano em área de um golpe (Quimera, titãs, Golpe Titânico de Héracles; `e.data` = raio em tiles). Base da Etapa 5:
// onda de poeira rasteira se abrindo até o raio (lê a ÁREA atingida), poeira e pedrinhas no centro e a marca de impacto
// no chão (rachadura a partir de 2 tiles). O fogo da Quimera fica para o lote de poderes/míticas (docs/ART.md Apêndice F).
import type { FxHandler } from '../types';
import { PRIO } from '../../particles';
import { chips, dust, ring } from '../emitters';
import { FRESH, TILE, dustAt, seenNow } from './util';

export const splash: FxHandler<null> = {
  create(e, fx, age) {
    if (age > FRESH || !seenNow(fx, e.x, e.y, 3)) return null;
    const r = Math.max(0.8, Number(e.data) || 1.5), x = e.x * TILE, y = e.y * TILE, tint = dustAt(fx, e.x, e.y);
    ring(fx.particles, fx.tex, x, y, r * TILE * 0.25, r * TILE, tint, 0.55, 'normal', PRIO.combat, 0.55);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      dust(fx.particles, fx.tex, x + Math.cos(a) * r * TILE * 0.3, y + Math.sin(a) * r * TILE * 0.3, { n: 1, tint, spread: 2, speed: 6, vx: Math.cos(a) * r * 40, vy: Math.sin(a) * r * 28, scale: 0.45, grow: 2.4, alpha: 0.45, life: 0.9 });
    }
    chips(fx.particles, fx.tex, x, y, 2, 5, 'stone', PRIO.combat, 1.2);
    fx.decal(r >= 2 ? 'decal/crack' : 'decal/impact', e.x, e.y, { rot: Math.random() * 6.28, size: r * TILE * 1.6, alpha: 0.8, life: 25 });
    return null;
  },
};
