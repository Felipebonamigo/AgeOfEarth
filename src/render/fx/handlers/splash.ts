// Dano em área de um golpe (`e.data` = raio em tiles): Quimera, os três titãs e o Golpe Titânico de Héracles. O núcleo
// não diz quem bateu; o atacante é a unidade com dano em área cujo golpe caiu no tick do efeito (rules.ts splashSource),
// e a aparência segue ele (splashStyle):
//  - fogo (Quimera, Prometeu): o jato de chamas da boca da Quimera até o alvo, o CHÃO EM CHAMAS no raio (fogo em
//    flipbook, brasas, fumaça escura subindo), clarão alaranjado e uma QUEIMADURA curta (10 s) no ponto;
//  - água (Oceano): a onda que desaba — respingos altos no raio, névoa clara, aro de espuma — e o chão escurecido molhado;
//  - pancada (Cronos) e Golpe Titânico (Héracles): onda de poeira rasteira até o raio, pedras voando, tremor e rachadura
//    no chão; o de Héracles com o clarão dourado da força divina;
//  - sem fonte conhecida: a onda de poeira e a marca de impacto da base.
// Todos leem a ÁREA atingida a zoom 1 (a onda/o fogo chega até o raio). Um disparo só, à vista.
import type { FxHandler } from '../types';
import { PRIO } from '../../particles';
import { chips, dust, glow, haze, ring } from '../emitters';
import { dustWave, fireGround, fireJet, waterSplash } from '../recipes';
import { splashSource, splashStyle } from '../rules';
import { FRESH, TILE, dustAt, seenNow } from './util';

export const splash: FxHandler<null> = {
  create(e, fx, age) {
    if (age > FRESH || !seenNow(fx, e.x, e.y, 3)) return null;
    const r = Math.max(0.8, Number(e.data) || 1.5), x = e.x * TILE, y = e.y * TILE, R = r * TILE, tint = dustAt(fx, e.x, e.y);
    const src = splashSource(fx.state, e);
    const rot = Math.random() * 6.28;
    switch (splashStyle(src?.type)) {
      case 'fire': {
        if (src && src.type === 'chimera') {
          // o sopro: da boca (à frente e acima do pé da Quimera) até o alvo
          const dx = e.x - src.x, dy = e.y - src.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
          fireJet(fx.particles, fx.tex, (src.x + dx / l * 0.45) * TILE, (src.y + dy / l * 0.45) * TILE, 16, x, y, 14);
        }
        fireGround(fx.particles, fx.tex, x, y, R * 0.75, Math.round(5 + r * 3.5), PRIO.combat, 1.25);
        glow(fx.particles, fx.tex, x, y, 6, R * 0.8, 0xff9a40, 0.55, PRIO.combat, 0.85);
        // golpe frequente (a Quimera sopra a cada ataque): marca menor e curta; no mesmo lugar renova em vez de empilhar
        fx.decal('decal/burn', e.x, e.y, { rot, size: R * 1.2, alpha: 0.65, life: 10 });
        break;
      }
      case 'water': {
        waterSplash(fx.particles, fx.tex, x, y, { n: 16 + Math.round(r * 6), power: 2.6, spread: R * 0.6, prio: PRIO.combat, ring: false });
        ring(fx.particles, fx.tex, x, y, R * 0.3, R, 0xe8f2f6, 0.8, 'normal', PRIO.combat, 0.55);
        haze(fx.particles, fx.tex, x, y, 3 + Math.round(r), R * 0.6, 0xdce8ee, { alpha: 0.35, life: 1.4, scale: 1, prio: PRIO.combat, rise: 10 });
        // chão molhado: a marca de impacto escurece o chão (multiplicada), azulada
        fx.decal('decal/impact', e.x, e.y, { rot, size: R * 1.5, alpha: 0.28, life: 12, tint: 0x9cbad8 });
        break;
      }
      case 'slam': case 'titanic': {
        const titanic = src?.type === 'heracles';
        dustWave(fx.particles, fx.tex, x, y, R * 0.2, R * 1.05, 12 + Math.round(r * 3), tint, { scale: 0.55, alpha: 0.55, life: 0.8 });
        dust(fx.particles, fx.tex, x, y, { n: 4, tint, spread: 5, speed: 16, scale: 0.6, grow: 2.4, alpha: 0.5, life: 1.2, rise: 14 });
        chips(fx.particles, fx.tex, x, y, 2, 6 + Math.round(r * 2), 'stone', PRIO.combat, 1.35);
        if (titanic) {
          // a força de um semideus: clarão dourado no ponto e centelhas subindo da onda
          glow(fx.particles, fx.tex, x, y, 8, R * 0.9, 0xffd27a, 0.4, PRIO.combat, 0.9);
          ring(fx.particles, fx.tex, x, y, R * 0.25, R, 0xffd98a, 0.5, 'add', PRIO.combat, 0.55);
        }
        fx.shake(titanic ? 4 : 6);
        fx.decal('decal/crack', e.x, e.y, { rot, size: R * 1.6, alpha: 0.85, life: 30 });
        fx.decal('decal/impact', e.x, e.y, { rot: rot + 1, size: R * 1.1, alpha: 0.7, life: 25 });
        break;
      }
      default:
        ring(fx.particles, fx.tex, x, y, R * 0.25, R, tint, 0.55, 'normal', PRIO.combat, 0.55);
        dustWave(fx.particles, fx.tex, x, y, R * 0.3, R, 10, tint, { scale: 0.45, alpha: 0.45 });
        chips(fx.particles, fx.tex, x, y, 2, 5, 'stone', PRIO.combat, 1.2);
        fx.decal(r >= 2 ? 'decal/crack' : 'decal/impact', e.x, e.y, { rot, size: R * 1.6, alpha: 0.8, life: 25 });
    }
    return null;
  },
};
