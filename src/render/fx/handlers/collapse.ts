// Desabamento de edifício (docs/ART.md §1.9, Apêndices D e F). Com a arte assada: o quadro `damage2` (na variante que o
// edifício mostrava — FxHost.goneVariant) afunda e apaga na faixa do y dele, os escombros assados ficam no chão
// (FxHost.addRubble) e sobe a fumaça da Etapa 3. Por cima disso, o lote combate-ambiente dá o PESO da queda:
//  - no instante: tremor pelo porte, a nuvem de poeira grossa que rola pelo chão para fora da pegada (onda rasteira) e
//    sobe em rolos (névoa de poeira), o estouro de pedras/lascas (madeira nos de madeira, com tábuas maiores) e dois
//    decalques — a mancha de pó escurecendo o chão e os escombros espalhados em volta;
//  - enquanto afunda (primeiros 60 %): pedaços caindo da borda de cima do quadro que desce (lascas com gravidade e quique
//    na pegada) e baforadas de pó da base.
// Sem arte do tipo: o sprite procedural cinza encolhendo (o de sempre) com a mesma poeira.
import { Container, Sprite } from 'pixi.js';
import { BUILDINGS } from '../../../core/data';
import type { FxHandler } from '../types';
import { PRIO } from '../../particles';
import { chips, dust, haze, smokePuffs } from '../emitters';
import { dustWave } from '../recipes';
import { hitMaterial } from '../logic';
import { FRESH, TILE, seenNow } from './util';

interface S { c: Container; baked: boolean; top: number; acc: number; wood: boolean }
/** Cor da poeira de desabamento (reboco, pedra moída e terra). */
const RUBBLE_DUST = 0xa89a82;

export const collapse: FxHandler<S> = {
  create(e, fx, age) {
    const c = new Container();
    c.position.set(e.x * TILE, e.y * TILE);
    const type = typeof e.data === 'string' ? e.data : '';
    const d = BUILDINGS[type];
    let baked = false, top = d ? d.h * TILE * 0.6 : 20;
    if (fx.baked && d) {
      const art = fx.host.art.buildingArt(type);
      const variant = fx.host.goneVariant(type, e.x, e.y) ?? (art?.variants ? art.variants[0] : null);
      const f = fx.host.art.building(type, 'damage2', variant) ?? fx.host.art.building(type, 'complete', variant);
      fx.host.addRubble(e, type);
      if (f) {
        // o quadro que cai vai para a faixa do edifício, na ordem por y dele (o que estava na frente continua na frente)
        const s = new Sprite(f.color); s.anchor.set(f.anchor.x, f.anchor.y); s.tint = 0x8a847c; c.addChild(s);
        top = f.anchor.y * f.color.orig.height;
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
    const wood = hitMaterial(type) === 'wood';
    if (d && age <= FRESH) {
      const x0 = (e.x - d.w / 2) * TILE, x1 = (e.x + d.w / 2) * TILE, y0 = (e.y - d.h / 2) * TILE, y1 = (e.y + d.h / 3) * TILE;
      if (fx.baked) smokePuffs(fx.particles, fx.tex, 4 + d.w * d.h * 2, x0, x1, y0, y1, false, PRIO.combat, undefined);
      if (seenNow(fx, e.x, e.y, d.w)) {
        const R = Math.max(d.w, d.h) * TILE * 0.5, x = e.x * TILE, y = e.y * TILE, big = Math.sqrt(d.w * d.h);
        fx.shake(Math.min(7, 1.5 + big * 1.4));
        dust(fx.particles, fx.tex, x, y, { n: 8 + d.w * d.h * 2, tint: RUBBLE_DUST, spread: R, speed: 34 + R * 0.4, scale: 0.7, grow: 2.6, alpha: 0.5, life: 2.2, rise: 6 });
        // a nuvem rola pelo chão para fora da pegada e sobe em rolos
        dustWave(fx.particles, fx.tex, x, y, R * 0.8, R * 2, 10 + Math.round(big * 5), RUBBLE_DUST, { scale: 0.75, alpha: 0.5, life: 1.5 });
        haze(fx.particles, fx.tex, x, y - R * 0.2, 3 + Math.round(big * 2), R * 0.8, 0xb0a48e, { alpha: 0.42, life: 3.4, scale: 1 + big * 0.35, prio: PRIO.combat, rise: 12 });
        chips(fx.particles, fx.tex, x, y, top * 0.5, 4 + d.w * 2, wood ? 'wood' : 'stone', PRIO.combat, 1.1);
        if (wood) for (let i = 0; i < 2 + d.w; i++) fx.particles.emit({ frames: [fx.tex.pick('chip_wood')], blend: 'normal', prio: PRIO.combat, x: x + (Math.random() - 0.5) * R, y: y + (Math.random() - 0.5) * R * 0.6, z: top * 0.4,
          vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 24, vz: 40 + Math.random() * 50, gravity: 300, bounce: 0.25, life: 1.8 + Math.random() * 0.6, scale0: 1.8 + Math.random() * 0.8, alpha0: 1, alpha1: 0, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 10 });
      }
      fx.decal('decal/impact', e.x, e.y, { rot: Math.random() * 6.28, size: (Math.max(d.w, d.h) + 1.6) * TILE * 1.15, alpha: 0.45, life: 45 });
      fx.decal('decal/debris', e.x, e.y, { rot: Math.random() * 6.28, size: (Math.max(d.w, d.h) + 1.2) * TILE * 1.1, alpha: 1, life: 45 });
    }
    return { c, baked, top, acc: 0, wood };
  },
  update(e, s, fx, _t, p) {
    s.c.alpha = 1 - p;
    // assado: afunda (o monte de escombros fica por baixo); procedural: encolhe como antes
    if (s.baked) { s.c.scale.set(1, 1 - p * 0.55); s.c.position.y = e.y * TILE + p * 6; }
    else s.c.scale.set(1 - p * 0.2);
    // pedaços caindo da borda de cima enquanto afunda, e pó saindo da base
    const d = BUILDINGS[typeof e.data === 'string' ? e.data : ''];
    if (!d || p > 0.6 || fx.dt <= 0 || !seenNow(fx, e.x, e.y, d.w)) return;
    s.acc += fx.dt * (8 + d.w * 5);
    const n = Math.floor(s.acc); s.acc -= n;
    const z = s.top * (1 - p * 0.55) * 0.85;
    for (let i = 0; i < n; i++) {
      const x = (e.x + (Math.random() - 0.5) * d.w * 0.8) * TILE, y = (e.y + (Math.random() - 0.5) * d.h * 0.7) * TILE;
      chips(fx.particles, fx.tex, x, y, z, 1, s.wood && Math.random() < 0.6 ? 'wood' : 'stone', PRIO.combat, 0.6);
      if (Math.random() < 0.35) dust(fx.particles, fx.tex, x, (e.y + d.h * 0.45) * TILE, { n: 1, tint: RUBBLE_DUST, spread: 4, speed: 10, scale: 0.55, grow: 2.4, alpha: 0.4, life: 1.4, rise: 8 });
    }
  },
  destroy(_e, s) { s.c.destroy({ children: true }); },
};
