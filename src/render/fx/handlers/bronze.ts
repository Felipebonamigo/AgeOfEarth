// Pele de Bronze (Dionísio; lote poderes-luz da Etapa 5, docs/ART.md Apêndice F).
//
// Lançamento (efeito `bronze`, global, `owner`): em cada unidade do dono à vista, o bronze "escorre" do pé à cabeça —
// um brilho dourado sobe pelo corpo, um anel de luz no pé e centelhas.
// Duração (observador `bronze`, `player.bronzeUntil` — 45 s): BRILHO METÁLICO — o corpo fica cor de bronze e um reflexo
// passa por ele de tempos em tempos (bronzeTint, o tint que o renderizador aplica), e reflexos especulares (estrelinhas
// de luz quente, aditivas, rápidas) piscam em pontos do corpo de cada unidade afetada, acompanhando o movimento.
// Rarefaz nos últimos 3 s. Só unidades à vista e na tela.
import { DT, TICK_RATE } from '../../../core/constants';
import type { Unit } from '../../../core/types';
import type { FxContext, FxHandler, FxWatcher } from '../types';
import { PRIO } from '../../particles';
import { motes, ring } from '../emitters';
import { FRESH, TILE, seenNow } from './util';
import { every, unitTop } from './kit';
import { lerpColor } from '../logic';

const R = Math.random;

/**
 * Tint do corpo de uma unidade com Pele de Bronze no instante `t` (s de jogo): bronze polido (mais quente e escuro que o
 * dourado de antes: o time continua lendo) com um REFLEXO que passa pelo corpo a cada ~1,6 s, fora de fase entre as
 * unidades (`id`). Puro: o renderizador chama por unidade.
 */
export function bronzeTint(t: number, id: number): number {
  const ph = (t * 0.62 + (id % 17) * 0.137) % 1;
  const k = ph < 0.18 ? Math.sin((ph / 0.18) * Math.PI) : 0;
  return lerpColor(0xf0bc72, 0xfff3d6, k);
}

export const bronze: FxHandler<null> = {
  create(e, fx, age) {
    if (age > FRESH) return null;
    const g = [fx.tex.frame('glow')];
    let n = 0;
    for (const u of fx.state.units.values()) {
      if (n >= 60) break;
      if (u.owner !== e.owner || u.inside !== -1 || !seenNow(fx, u.x, u.y, 0)) continue;
      const x = u.x * TILE, y = u.y * TILE, top = unitTop(fx, u.type);
      ring(fx.particles, fx.tex, x, y, 4, 20, 0xffc46a, 0.7, 'add', PRIO.power, 0.95);
      // o brilho sobe do pé à cabeça (o metal "escorrendo" pelo corpo) e fica um instante sobre ele
      fx.particles.emit({ frames: g, blend: 'add', prio: PRIO.power, x, y: y + 1, z: 0, vz: top / 0.45, life: 0.6, scale0: 1.1, scale1: 0.8, alpha0: 0.95, alpha1: 0.15, fadeIn: 0.12, tint: 0xffbf55 });
      fx.particles.emit({ frames: g, blend: 'add', prio: PRIO.power, x, y: y + 1, z: top * 0.45, life: 0.7, scale0: 0.9, scale1: 1.4, alpha0: 0.55, alpha1: 0, fadeIn: 0.3, tint: 0xffd27a });
      motes(fx.particles, fx.tex, x, y, 3, 0xffe2a0, 6, PRIO.power, 34);
      n++;
    }
    return null;
  },
};

/** Duração do bronze: reflexos especulares nas unidades dos jogadores com `bronzeUntil` ativo. */
export function bronzeWatcher(): FxWatcher {
  const acc = { acc: 0 };
  const cand: Unit[] = [];
  return {
    id: 'bronze',
    update(fx: FxContext) {
      const st = fx.state, tick = st.tick;
      if (fx.dt <= 0 || !st.players.some((p) => p.bronzeUntil > tick)) return;
      cand.length = 0;
      let left = 0;
      for (const u of st.units.values()) {
        const until = st.players[u.owner]?.bronzeUntil ?? 0;
        if (until <= tick || u.inside !== -1 || !fx.onScreen(u.x, u.y, 0) || !fx.visibleAt(u.x, u.y)) continue;
        cand.push(u);
        left = Math.max(left, (until - tick) / TICK_RATE);
      }
      if (!cand.length) return;
      const n = every(acc, Math.min(110, cand.length * 3) * Math.min(1, left / 3), fx.dt);
      const f = [fx.tex.frame('mote')];
      for (let i = 0; i < n; i++) {
        const u = cand[Math.floor(R() * cand.length)], top = unitTop(fx, u.type);
        // acompanha a unidade (a velocidade do tick), num ponto do corpo entre o joelho e o elmo
        if (!fx.particles.emit({ frames: f, blend: 'add', prio: PRIO.power, x: u.x * TILE + (R() - 0.5) * 9, y: u.y * TILE + 1, z: 4 + R() * top * 0.8,
          vx: ((u.x - u.px) / DT) * TILE, vy: ((u.y - u.py) / DT) * TILE, life: 0.3 + R() * 0.16,
          scale0: 0.4, scale1: 2.3, alpha0: 1, alpha1: 0, fadeIn: 0.35, tint: R() < 0.6 ? 0xfff8e4 : 0xffdf9a, rot: R() * 0.8, spin: 2.5 })) break;
      }
    },
    reset() { acc.acc = 0; cand.length = 0; },
  };
}
