// Habilidade Q dos heróis (`ability`) e o apoio comum dos poderes. Os poderes divinos saíram daqui no lote poderes-luz
// da Etapa 5 (docs/ART.md Apêndice F), um arquivo por poder: bolt.ts (Raio e Tempestade), restoration.ts, pestilence.ts,
// earthquake.ts, curse.ts, bronze.ts, titan.ts, summon.ts (Isca, Sentinelas, Abundância) e global.ts (Trégua, Oráculo).
// Sem dono no efeito (Restauração, Peste), o jogador que usou o poder vem do evento `powerUsed` no mesmo ponto (casterOf).
import type { GameState } from '../../../core/types';
import type { FxHandler } from '../types';
import { PRIO } from '../../particles';
import { glow, motes, ring } from '../emitters';
import { FRESH, TILE, seenNow } from './util';

/** Quem usou o poder `power` no ponto (x, y): o evento `powerUsed` mais recente ali (−1 se não achar). */
export function casterOf(state: GameState, power: string, x: number, y: number): number {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const ev = state.events[i];
    if (ev.type === 'powerUsed' && ev.data === power && Math.abs((ev.x ?? -99) - x) < 0.01 && Math.abs((ev.y ?? -99) - y) < 0.01) return ev.player;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------------------------

/** Habilidade Q do herói (`data` = raio, `owner`): onda dourada de luz até o raio e um clarão no herói. */
export const ability: FxHandler<null> = {
  create(e, fx, age) {
    if (age > FRESH || !seenNow(fx, e.x, e.y, 3)) return null;
    const x = e.x * TILE, y = e.y * TILE, r = Math.max(1, Number(e.data) || 1) * TILE;
    ring(fx.particles, fx.tex, x, y, 8, r, 0xffd070, 0.75, 'add', PRIO.power, 0.85);
    glow(fx.particles, fx.tex, x, y, 12, 20, 0xffe4a0, 0.5, PRIO.power, 0.8);
    motes(fx.particles, fx.tex, x, y, 10, 0xffe0a0, 8, PRIO.power, 40);
    return null;
  },
};
