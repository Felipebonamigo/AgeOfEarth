// Surgimento (P0): três origens com o mesmo tipo `spawn` —
//  - unidade treinada (núcleo, ttl 12): um anel de poeira baixa se abrindo em volta do pé e um clarão morno leve;
//  - poder divino (núcleo, ttl 20: isca, sentinelas, cornucópia, reforços de cenário): a arte de cada poder, pelo que
//    nasceu no ponto (summon.ts — lote poderes-luz);
//  - ordem do jogador (interface, `data: 'order'`, ttl 8): o marcador de clique, um aro fino na tela (interface, não arte).
import { Graphics } from 'pixi.js';
import type { FxHandler } from '../types';
import { PRIO } from '../../particles';
import { dust, glow } from '../emitters';
import { FRESH, TILE, dustAt, seenNow } from './util';
import { summon, type SummonS } from './summon';

type S = { marker: Graphics } | { divine: SummonS } | null;

export const spawn: FxHandler<S> = {
  create(e, fx, age) {
    if (e.data === 'order') {
      const g = new Graphics(); g.position.set(e.x * TILE, e.y * TILE); fx.glowLayer.addChild(g);
      return { marker: g };
    }
    if (age > FRESH || !seenNow(fx, e.x, e.y)) return null;
    if (e.total >= 20) return { divine: summon(e, fx) };
    const x = e.x * TILE, y = e.y * TILE;
    const tint = dustAt(fx, e.x, e.y);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
      dust(fx.particles, fx.tex, x + Math.cos(a) * 5, y + Math.sin(a) * 3.5, { n: 1, tint, spread: 1, speed: 4, vx: Math.cos(a) * 26, vy: Math.sin(a) * 16, scale: 0.35, grow: 2, alpha: 0.4, life: 0.8, rise: 3 });
    }
    glow(fx.particles, fx.tex, x, y, 8, 14, 0xfff0d0, 0.35, PRIO.combat, 0.5);
    return null;
  },
  update(_e, s, fx, _t, p) {
    if (!s) return;
    if ('divine' in s) { s.divine.set.update(fx.clock); return; }
    // marcador de ordem: aro que fecha e apaga (o mesmo da interface de antes: 6 → 20 px)
    s.marker.clear().circle(0, 0, 6 + p * 14).stroke({ width: 2, color: 0xffffff, alpha: 1 - p });
  },
  destroy(_e, s) {
    if (!s) return;
    if ('divine' in s) s.divine.set.destroy(); else s.marker.destroy();
  },
};
