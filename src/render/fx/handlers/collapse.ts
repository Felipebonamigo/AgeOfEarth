// Desabamento de edifício (docs/ART.md §1.9, Apêndice D). Com a arte assada: o quadro `damage2` (na variante que o
// edifício mostrava — FxHost.goneVariant) afunda e apaga na faixa do y dele, os escombros assados ficam no chão
// (FxHost.addRubble) e sobe a fumaça da Etapa 3; a base desta etapa acrescenta a nuvem de POEIRA baixa se abrindo pelo
// chão, pedras/lascas voando e o decalque de escombros espalhados em volta da pegada. Sem arte do tipo: o sprite
// procedural cinza encolhendo (o de sempre) com a mesma poeira.
import { Container, Sprite } from 'pixi.js';
import { BUILDINGS } from '../../../core/data';
import type { FxHandler } from '../types';
import { PRIO } from '../../particles';
import { chips, dust, smokePuffs } from '../emitters';
import { hitMaterial } from '../logic';
import { FRESH, TILE, seenNow } from './util';

interface S { c: Container; baked: boolean }

export const collapse: FxHandler<S> = {
  create(e, fx, age) {
    const c = new Container();
    c.position.set(e.x * TILE, e.y * TILE);
    const type = typeof e.data === 'string' ? e.data : '';
    const d = BUILDINGS[type];
    let baked = false;
    if (fx.baked && d) {
      const art = fx.host.art.buildingArt(type);
      const variant = fx.host.goneVariant(type, e.x, e.y) ?? (art?.variants ? art.variants[0] : null);
      const f = fx.host.art.building(type, 'damage2', variant) ?? fx.host.art.building(type, 'complete', variant);
      fx.host.addRubble(e, type);
      if (f) {
        // o quadro que cai vai para a faixa do edifício, na ordem por y dele (o que estava na frente continua na frente)
        const s = new Sprite(f.color); s.anchor.set(f.anchor.x, f.anchor.y); s.tint = 0x8a847c; c.addChild(s);
        const zy = d.passable ? e.y - d.h / 2 - 0.01 : e.y;
        c.zIndex = zy;
        fx.host.entityParent('building', zy, false).addChild(c);
        baked = true;
      }
    }
    if (!baked) {
      if (d) { const s = new Sprite(fx.host.tex.building(type, 0x888888, true)); s.anchor.set(0.5); s.tint = 0x777777; c.addChild(s); }
      fx.layer.addChild(c);
    }
    if (d && age <= FRESH) {
      const x0 = (e.x - d.w / 2) * TILE, x1 = (e.x + d.w / 2) * TILE, y0 = (e.y - d.h / 2) * TILE, y1 = (e.y + d.h / 3) * TILE;
      if (fx.baked) smokePuffs(fx.particles, fx.tex, 4 + d.w * d.h * 2, x0, x1, y0, y1, false, PRIO.combat, undefined);
      if (seenNow(fx, e.x, e.y, d.w)) {
        const R = Math.max(d.w, d.h) * TILE * 0.5;
        dust(fx.particles, fx.tex, e.x * TILE, e.y * TILE, { n: 8 + d.w * d.h * 2, tint: 0xa89a82, spread: R, speed: 34 + R * 0.4, scale: 0.7, grow: 2.6, alpha: 0.5, life: 2.2, rise: 6 });
        chips(fx.particles, fx.tex, e.x * TILE, e.y * TILE, 12, 4 + d.w * 2, hitMaterial(type) === 'wood' ? 'wood' : 'stone', PRIO.combat, 1.4);
      }
      fx.decal('decal/debris', e.x, e.y, { rot: Math.random() * 6.28, size: (Math.max(d.w, d.h) + 1.2) * TILE * 1.1, alpha: 1, life: 45 });
    }
    return { c, baked };
  },
  update(e, s, _fx, _t, p) {
    s.c.alpha = 1 - p;
    // assado: afunda (o monte de escombros fica por baixo); procedural: encolhe como antes
    if (s.baked) { s.c.scale.set(1, 1 - p * 0.55); s.c.position.y = e.y * TILE + p * 6; }
    else s.c.scale.set(1 - p * 0.2);
  },
  destroy(_e, s) { s.c.destroy({ children: true }); },
};
