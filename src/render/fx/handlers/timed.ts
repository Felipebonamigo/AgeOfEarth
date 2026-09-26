// Poderes com duração (state.timed) e poderes sem efeito próprio (flags do estado) — base da Etapa 5 (docs/ART.md
// Apêndice F). Tempestade de raios: sombras de nuvem escura rolando sobre a área enquanto dura (os raios em si são
// efeitos `bolt`); terremoto: pedrinhas pulando pela área (a poeira, o tremor e as rachaduras vêm do efeito `quake`).
// Observadores: Trégua (state.ceasefireUntil: centelhas brancas sobre as tropas à vista enquanto dura) e Oráculo
// (player.revealUntil do jogador local: o mapa revelado é o próprio efeito; ao ativar, um anel de luz em cada Centro
// Cívico dele).
import type { TimedEffect } from '../../../core/types';
import type { FxContext, FxWatcher, TimedHandler } from '../types';
import { UNITS } from '../../../core/data';
import { PRIO } from '../../particles';
import { chips, haze, motes, ring } from '../emitters';
import { TILE } from './util';

const R = Math.random;
interface Acc { acc: number }
const every = (s: Acc, rate: number, dt: number): number => { s.acc += rate * dt; const n = Math.floor(s.acc); s.acc -= n; return n; };
const onArea = (t: TimedEffect, fx: FxContext): boolean => t.x !== undefined && t.y !== undefined && fx.onScreen(t.x, t.y, t.data ?? 6);

export const lightningStorm: TimedHandler<Acc> = {
  create() { return { acc: 0 }; },
  update(t, s, fx) {
    if (!onArea(t, fx)) return;
    const r = (t.data ?? 6) * TILE, n = every(s, 3, fx.dt);
    if (n) haze(fx.particles, fx.tex, t.x! * TILE, t.y! * TILE, n, r, 0x23262e, { alpha: 0.22, life: 3.2, scale: 3.2, rise: 0 });
  },
};

export const earthquake: TimedHandler<Acc> = {
  create() { return { acc: 0 }; },
  update(t, s, fx) {
    if (!onArea(t, fx)) return;
    const r = t.data ?? 7, n = every(s, 5, fx.dt);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * r, x = t.x! + Math.cos(a) * d, y = t.y! + Math.sin(a) * d;
      if (fx.visibleAt(x, y)) chips(fx.particles, fx.tex, x * TILE, y * TILE, 1, 3, 'stone', PRIO.power, 0.9);
    }
  },
};

/** Trégua: enquanto dura, centelhas brancas sobem devagar das unidades militares à vista (ninguém luta). */
export function ceasefireWatcher(): FxWatcher {
  const s = { acc: 0 };
  return {
    id: 'ceasefire',
    update(fx) {
      if (fx.state.ceasefireUntil <= fx.state.tick) return;
      let n = every(s, 6, fx.dt);
      if (!n) return;
      for (const u of fx.state.units.values()) {
        if (n <= 0) break;
        if (u.inside !== -1 || !UNITS[u.type]?.tags.includes('military') || R() > 0.15 || !fx.onScreen(u.x, u.y, 0) || !fx.visibleAt(u.x, u.y)) continue;
        motes(fx.particles, fx.tex, u.x * TILE, u.y * TILE, 1, 0xf4f1e6, 4, PRIO.ambient, 14); n--;
      }
    },
    reset() { s.acc = 0; },
  };
}

/** Oráculo do jogador local: ao ativar, um anel de luz em cada Centro Cívico dele (o mapa revelado é o efeito). */
export function oracleWatcher(): FxWatcher {
  let seen = -1;
  return {
    id: 'oracle',
    update(fx) {
      const until = fx.state.players[fx.local]?.revealUntil ?? 0;
      if (until <= fx.state.tick || until === seen) return;
      seen = until;
      for (const b of fx.state.buildings.values()) if (b.owner === fx.local && b.type === 'town_center' && fx.onScreen(b.x, b.y, 4)) ring(fx.particles, fx.tex, b.x * TILE, b.y * TILE, TILE, 6 * TILE, 0xfff0c0, 1.4, 'add', PRIO.power, 0.7);
    },
    reset() { seen = -1; },
  };
}
