// Efeitos dos poderes divinos e da habilidade dos heróis — PRIMEIRA versão (base da Etapa 5): cada tipo tem arte própria
// com partículas e decalques do atlas `fx`, legível a zoom 1 (a ÁREA do poder, quem foi curado, onde caiu o raio), no
// lugar dos círculos chapados de Graphics. O lote de poderes da Etapa 5 refina cada um no próprio arquivo/handler
// (docs/ART.md Apêndice F, "Como adicionar/refinar um poder"). Um handler por tipo de VisualEffect: heal (Restauração),
// ability (Q do herói), curse (Maldição), pestilence (Peste), quake (Terremoto), titanRise (Portal dos Titãs), bolt (Raio
// e Tempestade de Raios), bronze (Bronze: brilho em todas as unidades do dono). Sem dono no efeito (Restauração, Peste),
// o jogador que usou o poder vem do evento `powerUsed` no mesmo ponto (casterOf).
import { Sprite } from 'pixi.js';
import type { GameState, VisualEffect } from '../../../core/types';
import type { FxContext, FxHandler } from '../types';
import { PRIO } from '../../particles';
import { chips, dust, embers, flame, glow, haze, motes, ring, sparks } from '../emitters';
import { FRESH, TILE, dustAt, seenNow } from './util';

const R = Math.random;
/** Quem usou o poder `power` no ponto (x, y): o evento `powerUsed` mais recente ali (−1 se não achar). */
export function casterOf(state: GameState, power: string, x: number, y: number): number {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const ev = state.events[i];
    if (ev.type === 'powerUsed' && ev.data === power && Math.abs((ev.x ?? -99) - x) < 0.01 && Math.abs((ev.y ?? -99) - y) < 0.01) return ev.player;
  }
  return -1;
}
/** Emissão contínua: acumula `rate`/s no relógio de jogo e devolve quantas saem neste quadro. */
function every(s: { acc: number }, rate: number, dt: number): number { s.acc += rate * dt; const n = Math.floor(s.acc); s.acc -= n; return n; }

// ---------------------------------------------------------------------------------------------------------------

/** Restauração (`data` = raio): anel verde-dourado de luz marcando a área, centelhas subindo de CADA unidade curada do
 *  dono dentro dela (quem foi curado) e um brilho leve espalhado pela área enquanto dura. */
export const heal: FxHandler<{ acc: number; r: number }> = {
  create(e, fx, age) {
    const r = Number(e.data) || 8, s = { acc: 0, r };
    if (age > FRESH || !fx.onScreen(e.x, e.y, r)) return s;
    const x = e.x * TILE, y = e.y * TILE;
    ring(fx.particles, fx.tex, x, y, r * TILE * 0.2, r * TILE, 0xb8f09a, 1.3, 'add', PRIO.power, 0.8);
    glow(fx.particles, fx.tex, x, y, 10, 40, 0xd8ffc0, 0.8, PRIO.power, 0.6);
    const who = casterOf(fx.state, 'restoration', e.x, e.y);
    let n = 0;
    for (const u of fx.state.units.values()) {
      if (n >= 36) break;
      if (u.owner !== who || u.inside !== -1 || (u.x - e.x) ** 2 + (u.y - e.y) ** 2 > r * r || !fx.visibleAt(u.x, u.y)) continue;
      motes(fx.particles, fx.tex, u.x * TILE, u.y * TILE, 3, 0xc8f5a8, 5, PRIO.power, 26); n++;
    }
    return s;
  },
  update(e, s, fx, _t, p) {
    if (p > 0.8 || !fx.onScreen(e.x, e.y, s.r)) return;
    const n = every(s, 10 + s.r * 2, fx.dt);
    if (n) motes(fx.particles, fx.tex, e.x * TILE, e.y * TILE, n, 0xd0f7b0, s.r * TILE, PRIO.power, 18);
  },
};

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

/** Maldição de Circe (em cada vítima, que vira javali): névoa púrpura e centelhas escuras no lugar. */
export const curse: FxHandler<null> = {
  create(e, fx, age) {
    if (age > FRESH || !seenNow(fx, e.x, e.y)) return null;
    const x = e.x * TILE, y = e.y * TILE;
    haze(fx.particles, fx.tex, x, y, 3, 6, 0x5a2e66, { alpha: 0.55, life: 1.3, scale: 0.7, rise: 12 });
    motes(fx.particles, fx.tex, x, y, 8, 0xe07ad0, 7, PRIO.power, 30);
    glow(fx.particles, fx.tex, x, y, 10, 14, 0xc050b0, 0.5, PRIO.power, 0.7);
    return null;
  },
};

/** Peste (`data` = raio): aro doentio marcando a área e uma névoa verde-acinzentada rasteira enquanto dura (os edifícios
 *  militares atingidos já ficam lilás pelo `disabledUntil`). */
export const pestilence: FxHandler<{ acc: number; r: number }> = {
  create(e, fx, age) {
    const r = Number(e.data) || 10, s = { acc: 0, r };
    if (age <= FRESH && fx.onScreen(e.x, e.y, r)) ring(fx.particles, fx.tex, e.x * TILE, e.y * TILE, r * TILE * 0.6, r * TILE, 0x6f7a3a, 1.8, 'normal', PRIO.power, 0.55);
    return s;
  },
  update(e, s, fx, _t, p) {
    if (p > 0.85 || !fx.onScreen(e.x, e.y, s.r)) return;
    const n = every(s, 6 + s.r, fx.dt);
    if (n) haze(fx.particles, fx.tex, e.x * TILE, e.y * TILE, n, s.r * TILE, 0x6a7448, { alpha: 0.32, life: 2.6, scale: 1.4 });
  },
};

/** Terremoto (`data` = raio, 5 s): tremor da câmera, rachaduras no chão pela área e poeira subindo de pontos
 *  aleatórios dela enquanto dura. */
export const quake: FxHandler<{ acc: number; r: number }> = {
  create(e, fx, age) {
    const r = Number(e.data) || 7, s = { acc: 0, r };
    if (age <= FRESH) {
      fx.shake(10);
      fx.decal('decal/crack', e.x, e.y, { rot: R() * 6.28, size: 3.2 * TILE, alpha: 0.9, life: 40 });
      for (let i = 0; i < 3 + Math.floor(r / 2); i++) {
        const a = R() * Math.PI * 2, d = (0.3 + R() * 0.7) * r;
        fx.decal('decal/crack', e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, { rot: R() * 6.28, size: (1.6 + R()) * TILE, alpha: 0.8, life: 35 });
      }
    }
    return s;
  },
  update(e, s, fx, _t, p) {
    fx.shake(4 * (1 - p));
    if (!fx.onScreen(e.x, e.y, s.r)) return;
    const n = every(s, 14 + s.r * 2, fx.dt);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * s.r, x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d;
      if (!fx.visibleAt(x, y)) continue;
      dust(fx.particles, fx.tex, x * TILE, y * TILE, { n: 2, tint: dustAt(fx, x, y), spread: 8, speed: 14, scale: 0.8, grow: 2.4, alpha: 0.55, life: 1.6, prio: PRIO.power, rise: 16 });
      if (R() < 0.25) chips(fx.particles, fx.tex, x * TILE, y * TILE, 2, 2, 'stone', PRIO.power, 0.8);
    }
  },
};

/** Titã saindo do portal: tremor, onda de poeira se abrindo, brilho de brasa e escombros/rachaduras em volta. */
export const titanRise: FxHandler<{ acc: number }> = {
  create(e, fx, age) {
    const s = { acc: 0 };
    if (age > FRESH) return s;
    fx.shake(8);
    const x = e.x * TILE, y = e.y * TILE;
    if (fx.onScreen(e.x, e.y, 6)) {
      ring(fx.particles, fx.tex, x, y, TILE, 5.5 * TILE, 0xa89a82, 1.6, 'normal', PRIO.power, 0.6);
      dust(fx.particles, fx.tex, x, y, { n: 18, tint: 0xa89a82, spread: 3 * TILE, speed: 60, scale: 0.9, grow: 2.8, alpha: 0.5, life: 2.4, prio: PRIO.power, rise: 10 });
      glow(fx.particles, fx.tex, x, y, 30, 70, 0xff7040, 1.2, PRIO.power, 0.7);
    }
    fx.decal('decal/crack', e.x, e.y, { rot: R() * 6.28, size: 5 * TILE, alpha: 0.9, life: 60 });
    fx.decal('decal/debris', e.x, e.y + 1, { rot: R() * 6.28, size: 4 * TILE, alpha: 1, life: 60 });
    return s;
  },
  update(e, s, fx, _t, p) {
    if (p < 0.3) fx.shake(8);
    if (p > 0.6 || !fx.onScreen(e.x, e.y, 6)) return;
    const n = every(s, 16, fx.dt);
    if (n) embers(fx.particles, fx.tex, e.x * TILE + (R() - 0.5) * 60, e.y * TILE, 10, n, PRIO.power);
  },
};

/** Raio de Zeus (e cada raio da Tempestade): o raio em ziguezague do céu ao chão feito de brilhos esticados (aditivos,
 *  núcleo branco e halo azulado, piscando), o clarão no chão, faíscas, chamas curtas, brasas e a QUEIMADURA no chão. */
interface BoltS { sprites: Sprite[] }
function boltPath(x: number, y: number): [number, number][] {
  const pts: [number, number][] = [];
  const top = y - 12 * TILE, n = 12;
  let px = x + (R() - 0.5) * 0.8 * TILE;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([i === n ? x : px, top + (y - top) * t]);
    px += (R() - 0.5) * 0.7 * TILE * (1 - t) + (x - px) * 0.25;
  }
  return pts;
}
function beam(fx: FxContext, list: Sprite[], x0: number, y0: number, x1: number, y1: number, width: number, tint: number, alpha: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const s = new Sprite(fx.tex.frame('glow'));
  s.anchor.set(0.5); s.blendMode = 'add'; s.tint = tint; s.alpha = alpha;
  s.position.set((x0 + x1) / 2, (y0 + y1) / 2);
  s.rotation = Math.atan2(y1 - y0, x1 - x0);
  s.scale.set((len * 1.9) / 32, width / 32 * 3);
  fx.glowLayer.addChild(s); list.push(s);
}
export const bolt: FxHandler<BoltS | null> = {
  create(e, fx, age) {
    if (!seenNow(fx, e.x, e.y, 4)) return null;
    const x = e.x * TILE, y = e.y * TILE, s: BoltS = { sprites: [] };
    const path = boltPath(x, y);
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1], [bx, by] = path[i];
      beam(fx, s.sprites, ax, ay, bx, by, 9, 0x7fb8ff, 0.5);   // halo
      beam(fx, s.sprites, ax, ay, bx, by, 2.2, 0xffffff, 1);   // núcleo
    }
    // um galho curto a partir do meio
    const k = 4 + Math.floor(R() * 4), [bx0, by0] = path[k];
    let gx = bx0, gy = by0;
    for (let i = 0; i < 3; i++) { const nx = gx + (R() < 0.5 ? -1 : 1) * (8 + R() * 10), ny = gy + 12 + R() * 10; beam(fx, s.sprites, gx, gy, nx, ny, 1.5, 0xd8ecff, 0.8); gx = nx; gy = ny; }
    if (age <= FRESH) {
      glow(fx.particles, fx.tex, x, y, 4, 46, 0xcfe6ff, 0.7, PRIO.power, 1);
      sparks(fx.particles, fx.tex, x, y, 2, 12, PRIO.power);
      for (let i = 0; i < 2; i++) flame(fx.particles, fx.tex, x + (R() - 0.5) * 10, y + (R() - 0.5) * 5, 0, 0.55, 0.7 + R() * 0.5, PRIO.power);
      embers(fx.particles, fx.tex, x, y, 4, 8, PRIO.power);
      fx.shake(3);
    }
    fx.decal('decal/burn', e.x, e.y, { rot: R() * 6.28, size: 1.3 * TILE, alpha: 0.9, life: 40 });
    return s;
  },
  update(_e, s, _fx, t, p) {
    if (!s) return;
    // pisca nas primeiras dezenas de ms (a descarga) e apaga
    const a = t < 0.25 ? (R() < 0.7 ? 1 : 0.25) : Math.max(0, 1 - (p - 0.25) / 0.6);
    for (let i = 0; i < s.sprites.length; i++) {
      const sp = s.sprites[i];
      sp.visible = a > 0.01;
      sp.alpha = a * (i % 2 === 0 ? 0.5 : 1);
    }
  },
  destroy(_e, s) { if (s) for (const sp of s.sprites) sp.destroy(); },
};

/** Bronze (global, `owner`): um brilho dourado sobe de cada unidade à vista do dono (o corpo delas já fica dourado pelo
 *  tint do renderizador enquanto dura). */
export const bronze: FxHandler<null> = {
  create(e, fx, age) {
    if (age > FRESH) return null;
    let n = 0;
    for (const u of fx.state.units.values()) {
      if (n >= 40) break;
      if (u.owner !== e.owner || u.inside !== -1 || !seenNow(fx, u.x, u.y, 0)) continue;
      motes(fx.particles, fx.tex, u.x * TILE, u.y * TILE, 2, 0xffc860, 5, PRIO.power, 30);
      glow(fx.particles, fx.tex, u.x * TILE, u.y * TILE, 12, 10, 0xffb040, 0.5, PRIO.power, 0.6);
      n++;
    }
    return null;
  },
};

/** Tipo auxiliar para testes: qualquer handler desta lista. */
export type PowerEffect = VisualEffect;
