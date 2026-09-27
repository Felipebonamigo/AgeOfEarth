// Maldição (Afrodite/Circe; lote poderes-luz da Etapa 5, docs/ART.md Apêndice F).
//
// Lançamento (observador `curse`, pelo evento `powerUsed` do núcleo): um aro púrpura de luz se abre até o raio da área
// (4 tiles) e uma névoa violeta rodopia nela — a ÁREA do feitiço, mesmo onde ninguém vira javali.
// Cada vítima (efeito `curse`, 1 s, no ponto onde ela estava): a TRANSFORMAÇÃO — o soldado fica magenta, encolhe e se
// desfaz dentro de uma baforada de fumaça púrpura com centelhas, e o javali (o nó `boar` que o núcleo pôs ao lado) aparece
// na mesma nuvem. A queda e o cadáver da morte (`death` no mesmo ponto) não acontecem: death.ts não desenha a queda de
// quem foi amaldiçoado. O tipo e o dono da vítima vêm desse efeito `death` do mesmo tick.
import { Container, Sprite } from 'pixi.js';
import { PLAYER_COLORS } from '../../../core/constants';
import { POWERS, UNITS } from '../../../core/data';
import type { GameEvent, GameState, VisualEffect } from '../../../core/types';
import type { FxContext, FxHandler, FxWatcher } from '../types';
import { UnitView } from '../../views/UnitView';
import { PRIO } from '../../particles';
import { glow, haze, motes, ring } from '../emitters';
import { lerpColor } from '../logic';
import { FRESH, TILE, seenNow } from './util';

const R = Math.random;

/** O efeito `death` da vítima amaldiçoada neste ponto (tipo e dono), ou undefined. */
export function curseVictim(state: GameState, e: VisualEffect): VisualEffect | undefined {
  return state.effects.find((o) => o.type === 'death' && Math.abs(o.x - e.x) < 0.01 && Math.abs(o.y - e.y) < 0.01);
}
/** O javali que nasceu da vítima: o nó `boar` mais perto do ponto (até 3 tiles). */
function boarNear(state: GameState, x: number, y: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null, bd = 9;
  for (const n of state.map.nodes.values()) {
    if (n.type !== 'boar') continue;
    const d = (n.x + 0.5 - x) ** 2 + (n.y + 0.5 - y) ** 2;
    if (d < bd) { bd = d; best = { x: n.x + 0.5, y: n.y + 0.5 }; }
  }
  return best;
}

interface S { uv: UnitView | null; proc: Container | null; color: number }

export const curse: FxHandler<S | null> = {
  create(e, fx, age) {
    if (age > FRESH || !seenNow(fx, e.x, e.y)) return null;
    const x = e.x * TILE, y = e.y * TILE;
    const d = curseVictim(fx.state, e);
    const type = typeof d?.data === 'string' && UNITS[d.data] ? d.data : '';
    const color = PLAYER_COLORS[(d?.owner ?? 0) % PLAYER_COLORS.length].num;
    const s: S = { uv: null, proc: null, color };
    const art = fx.baked && type ? fx.host.art.unit(type) : null;
    if (art && type) {
      const dir = fx.host.deathDir(type, e.x, e.y);
      const uv = new UnitView(art, fx.host.art, type, color, fx.host.shadows, dir);
      uv.pose('idle', dir, fx.clock); uv.tick(fx.clock, 0);
      uv.place(x, y);
      uv.root.zIndex = e.y;
      fx.host.entityParent('unit', e.y, false).addChild(uv.root);
      s.uv = uv;
    } else if (type) {
      const c = new Container();
      const sp = new Sprite(fx.host.tex.unit(type, color)); sp.anchor.set(0.5);
      c.addChild(sp); c.position.set(x, y);
      fx.layer.addChild(c);
      s.proc = c;
    }
    // a nuvem da transformação: fumaça púrpura, clarão magenta, anel e centelhas rodopiando
    // fumaça larga e esbatida (mauve acinzentado, não bolas de cor), subindo e se abrindo
    haze(fx.particles, fx.tex, x, y - 6, 6, 10, 0x684a76, { alpha: 0.5, life: 1.5, scale: 1.15, rise: 22, prio: PRIO.power });
    haze(fx.particles, fx.tex, x, y - 4, 3, 8, 0x8a7092, { alpha: 0.4, life: 1.3, scale: 0.95, rise: 30, prio: PRIO.power });
    glow(fx.particles, fx.tex, x, y, 12, 26, 0xd45ac8, 0.55, PRIO.power, 0.8);
    ring(fx.particles, fx.tex, x, y, 3, 20, 0xe07ae0, 0.5, 'add', PRIO.power, 0.75);
    motes(fx.particles, fx.tex, x, y, 12, 0xf2a4ff, 9, PRIO.power, 34);
    // o javali aparece na mesma nuvem (se nasceu ao lado, a nuvem se estende até ele)
    const boar = boarNear(fx.state, e.x, e.y);
    if (boar && (boar.x - e.x) ** 2 + (boar.y - e.y) ** 2 > 0.25) {
      haze(fx.particles, fx.tex, boar.x * TILE, boar.y * TILE - 4, 3, 8, 0x684a76, { alpha: 0.45, life: 1.3, scale: 1, rise: 18, prio: PRIO.power });
      motes(fx.particles, fx.tex, boar.x * TILE, boar.y * TILE, 5, 0xf2a4ff, 7, PRIO.power, 26);
    }
    return s;
  },
  update(_e, s, fx, t) {
    if (!s) return;
    // em 0,5 s: magenta, encolhe (mais na altura) e se desfaz
    const k = Math.min(1, t / 0.5), tint = lerpColor(0xffffff, 0xb46ad4, Math.min(1, k * 1.6));
    const sy = 1 - 0.6 * Math.pow(k, 1.4), sx = 1 - 0.3 * k, a = 1 - k * k;
    if (s.uv) {
      s.uv.tick(fx.clock, 0);
      s.uv.tint(tint, lerpColor(s.color, 0xb46ad4, k));
      s.uv.root.scale.set(sx, sy);
      s.uv.alpha = a;
      s.uv.visible = a > 0.01;
    }
    if (s.proc) { s.proc.scale.set(sx, sy); s.proc.alpha = a; (s.proc.children[0] as Sprite).tint = tint; }
  },
  destroy(_e, s) { s?.uv?.destroy(); s?.proc?.destroy({ children: true }); },
};

/** Eventos `powerUsed` ainda não vistos (novos: até 1 s de idade) — o momento do lançamento de um poder de área. */
export function freshCasts(state: GameState, seen: WeakSet<GameEvent>, power: string): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = state.events.length - 1; i >= 0; i--) {
    const ev = state.events[i];
    if (state.tick - ev.tick > 20) break;
    if (ev.type !== 'powerUsed' || ev.data !== power || seen.has(ev)) continue;
    seen.add(ev);
    out.push(ev);
  }
  return out;
}

/** Lançamento da Maldição: a área (aro púrpura e névoa violeta rodopiando). */
export function curseWatcher(): FxWatcher {
  let seen = new WeakSet<GameEvent>();
  return {
    id: 'curse',
    update(fx: FxContext) {
      for (const ev of freshCasts(fx.state, seen, 'curse')) {
        const x = ev.x ?? 0, y = ev.y ?? 0, r = POWERS.curse.radius ?? 4;
        if (!fx.onScreen(x, y, r) || !fx.visibleAt(x, y)) continue;
        const px = x * TILE, py = y * TILE, R0 = r * TILE;
        ring(fx.particles, fx.tex, px, py, R0 * 0.2, R0, 0xc860d8, 0.8, 'add', PRIO.power, 0.8);
        ring(fx.particles, fx.tex, px, py, R0 * 0.9, R0 * 0.5, 0x3a1c46, 1.1, 'normal', PRIO.power, 0.4);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2, d = R0 * (0.5 + R() * 0.4);
          // névoa girando para dentro
          fx.particles.emit({ frames: [fx.tex.pick('smoke')], blend: 'normal', prio: PRIO.power, x: px + Math.cos(a) * d, y: py + Math.sin(a) * d, z: 4,
            vx: -Math.sin(a) * 40 - Math.cos(a) * 14, vy: Math.cos(a) * 40 - Math.sin(a) * 14, drag: 1.2, life: 1.4, scale0: 1.1, scale1: 1.8, alpha0: 0.4, alpha1: 0, fadeIn: 0.2, tint: i % 2 ? 0x4c2458 : 0x6a3a7a, rot: R() * 6.28, spin: 1.2 });
        }
        motes(fx.particles, fx.tex, px, py, 14, 0xe79cff, R0 * 0.8, PRIO.power, 26);
      }
    },
    reset() { seen = new WeakSet(); },
  };
}
