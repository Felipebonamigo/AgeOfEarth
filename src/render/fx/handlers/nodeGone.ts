// Nó de recurso esgotado (docs/ART.md §1.9 e Apêndice F; o núcleo o emite com ttl 6). O que fica no chão é o RESTO
// (decalque que some devagar) e o que salta é do material, sem sangue:
//  - árvore derrubada: a copa se desfaz em folhas caindo e balançando do alto (a altura da copa pela escala da árvore),
//    lascas de madeira, poeira e serragem/lascas espalhadas em volta do toco (o toco é dos props, props.ts);
//  - veio de ouro: lascas de pedra, pó e cintilas douradas (o último ouro), pedrisco no chão;
//  - arbusto de frutas: folhas e algumas frutinhas vermelhas quicando;
//  - caça (cervo, javali, isca): só um pouco de poeira (o animal foi todo carneado; nada de sangue).
// Um disparo só, à vista.
import type { FxHandler } from '../types';
import { PRIO } from '../../particles';
import { chips, dust, leaves, motes } from '../emitters';
import { treeOffset, treeScale } from '../../art/logic';
import { FRESH, TILE, dustAt, seenNow } from './util';

export const nodeGone: FxHandler<null> = {
  create(e, fx, age) {
    if (age > FRESH) return null;
    const rot = Math.random() * 6.28;
    // o resto fica mesmo sem ninguém olhando agora (o decalque só aparece quando o tile for visto)
    if (e.data === 'tree') fx.decal('decal/debris', e.x, e.y, { rot, size: 0.85 * TILE, alpha: 0.75, life: 40, tint: 0xc9a878 });
    else if (e.data === 'gold') fx.decal('decal/debris', e.x, e.y, { rot, size: 0.9 * TILE, alpha: 0.9, life: 40, tint: 0xcfc2a0 });
    if (!seenNow(fx, e.x, e.y)) return null;
    const x = e.x * TILE, y = e.y * TILE, tint = dustAt(fx, e.x, e.y);
    switch (e.data) {
      case 'tree': {
        // a copa: centro deslocado como o sprite da árvore e altura pela escala dela (≈ 1–1,3 tile acima do pé)
        const tx = Math.floor(e.x), ty = Math.floor(e.y), off = treeOffset(tx, ty), k = treeScale(tx, ty);
        const cx = (tx + 0.5 + off.dx) * TILE, cy = (ty + 0.5 + off.dy) * TILE;
        leaves(fx.particles, fx.tex, cx, cy, 30 * k, 16);
        leaves(fx.particles, fx.tex, cx + 6, cy + 2, 18 * k, 10);
        chips(fx.particles, fx.tex, cx, cy, 6, 6, 'wood');
        // galhos quebrados (lascas grandes) e a poeira do tronco batendo no chão
        for (let i = 0; i < 3; i++) fx.particles.emit({ frames: [fx.tex.pick('chip_wood')], blend: 'normal', prio: PRIO.combat, x: cx + (Math.random() - 0.5) * 14, y: cy + (Math.random() - 0.5) * 6, z: 20 * k,
          vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 16, vz: 20 + Math.random() * 30, gravity: 300, bounce: 0.25, life: 1.6, scale0: 2 + Math.random(), alpha0: 1, alpha1: 0, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 8 });
        dust(fx.particles, fx.tex, cx, cy, { n: 6, tint, spread: 10, speed: 20, scale: 0.55, grow: 2.4, alpha: 0.5, life: 1.3 });
        break;
      }
      case 'gold':
        chips(fx.particles, fx.tex, x, y, 6, 7, 'stone', undefined, 1.1);
        dust(fx.particles, fx.tex, x, y, { n: 4, tint: 0xb4ada0, spread: 6, speed: 18, scale: 0.5, alpha: 0.5, life: 1.2 });
        motes(fx.particles, fx.tex, x, y, 4, 0xffd870, 7, PRIO.combat, 14);
        break;
      case 'berry':
        leaves(fx.particles, fx.tex, x, y, 8, 6);
        for (let i = 0; i < 4; i++) fx.particles.emit({ frames: [fx.tex.pick('chip_stone')], blend: 'normal', prio: PRIO.combat, x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 4, z: 6,
          vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 12, vz: 30 + Math.random() * 30, gravity: 300, bounce: 0.35, life: 1.1, scale0: 0.7, alpha0: 1, alpha1: 0, tint: 0xa8243a });
        break;
      default:
        dust(fx.particles, fx.tex, x, y, { n: 2, tint, spread: 4, speed: 12, scale: 0.35, alpha: 0.4, life: 0.8 });
    }
    return null;
  },
};
