// Apoio comum dos poderes (docs/ART.md Apêndice F). Os poderes divinos saíram daqui no lote poderes-luz da Etapa 5, um
// arquivo por poder: bolt.ts (Raio e Tempestade), restoration.ts, pestilence.ts, earthquake.ts, curse.ts, bronze.ts,
// titan.ts, summon.ts (Isca, Sentinelas, Abundância) e global.ts (Trégua, Oráculo); a Q dos heróis foi para ability.ts
// (lote combate-ambiente). Sem dono no efeito (Restauração, Peste), o jogador que usou o poder vem do evento `powerUsed`
// no mesmo ponto (casterOf).
import type { GameState } from '../../../core/types';

/** Quem usou o poder `power` no ponto (x, y): o evento `powerUsed` mais recente ali (−1 se não achar). */
export function casterOf(state: GameState, power: string, x: number, y: number): number {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const ev = state.events[i];
    if (ev.type === 'powerUsed' && ev.data === power && Math.abs((ev.x ?? -99) - x) < 0.01 && Math.abs((ev.y ?? -99) - y) < 0.01) return ev.player;
  }
  return -1;
}
