// Pestilência (Ares; lote poderes-luz da Etapa 5, docs/ART.md Apêndice F).
//
// Lançamento (efeito `pestilence`, 3 s, `data` = raio): uma FRENTE de miasma roxo-acinzentado rola do centro até a borda
// da área (aro escuro se abrindo + névoa nascendo na frente), e quando ela passa por um edifício militar atingido ele é
// envolvido por uma baforada de miasma e moscas; o chão sob cada edifício atingido fica manchado (decalque escuro,
// arroxeado) enquanto dura.
// Duração (observador `pestilence`, pelo `disabledUntil` de cada edifício — 60 s): névoa ROXA E CINZA rasteira sobre a
// pegada de cada edifício parado pela peste e moscas zumbindo em volta; some nos últimos 3 s. O corpo do edifício já fica
// lilás pelo tint do renderizador. Só o que o jogador vê, na tela.
import { BUILDINGS } from '../../../core/data';
import { TICK_RATE } from '../../../core/constants';
import type { Building, GameState } from '../../../core/types';
import type { FxContext, FxHandler, FxWatcher } from '../types';
import { PRIO, type ParticleSystem } from '../../particles';
import type { FxTextures } from '../FxTextures';
import { haze, ring } from '../emitters';
import { FRESH, TILE } from './util';
import { easeOut, every } from './kit';

const R = Math.random;
const MIASMA = [0x4e3a60, 0x5f5a68, 0x5c4470, 0x6b6674, 0x433a4c] as const;

/** Uma baforada de miasma rasteira no retângulo (px) — roxa ou cinza, larga e lenta, subindo devagar pela fachada. */
function miasma(ps: ParticleSystem, tex: FxTextures, x0: number, x1: number, y0: number, y1: number, n: number, alpha = 0.44, life = 3): void {
  for (let i = 0; i < n; i++) {
    const s = 1.5 + R() * 1.1;
    if (!ps.emit({ frames: [tex.pick('smoke')], blend: 'normal', prio: PRIO.power, x: x0 + R() * (x1 - x0), y: y0 + R() * (y1 - y0), z: R() * 14,
      vx: (R() - 0.5) * 8, vy: (R() - 0.5) * 4, vz: 3 + R() * 6, drag: 0.4, wind: 0.5, life: life * (0.8 + R() * 0.4),
      scale0: s, scale1: s * 1.6, alpha0: alpha, alpha1: 0, fadeIn: 0.3, tint: MIASMA[Math.floor(R() * MIASMA.length)], rot: R() * 6.28, spin: (R() - 0.5) * 0.3 })) return;
  }
}
/** Moscas: pontinhos escuros voando em volta (textura `ember` em mistura normal, tinta quase preta), vida curta. */
function flies(ps: ParticleSystem, tex: FxTextures, cx: number, cy: number, rx: number, ry: number, n: number): void {
  const f = [tex.frame('ember')];
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, sp = 20 + R() * 34;
    if (!ps.emit({ frames: f, blend: 'normal', prio: PRIO.power, x: cx + (R() - 0.5) * 2 * rx, y: cy + (R() - 0.5) * 2 * ry, z: 10 + R() * 30,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: (R() - 0.5) * 28, life: 0.4 + R() * 0.5,
      scale0: 0.62, scale1: 0.55, alpha0: 1, alpha1: 0.8, fadeIn: 0.05, tint: 0x16110f })) return;
  }
}
/** Retângulo (px) em volta da pegada de um edifício (a névoa transborda um pouco e fica mais para a fachada sul). */
function footprint(b: Building): { x0: number; x1: number; y0: number; y1: number; w: number; h: number } {
  const d = BUILDINGS[b.type];
  return { x0: (b.x - d.w * 0.68) * TILE, x1: (b.x + d.w * 0.68) * TILE, y0: (b.y - d.h * 0.1) * TILE, y1: (b.y + d.h * 0.68) * TILE, w: d.w, h: d.h };
}
const inArea = (b: Building, x: number, y: number, r: number): boolean => (b.x - x) ** 2 + (b.y - y) ** 2 <= r * r;
/** Edifícios parados pela peste agora dentro de (x, y, r) tiles. */
function stricken(state: GameState, x: number, y: number, r: number): Building[] {
  const out: Building[] = [];
  for (const b of state.buildings.values()) if (b.disabledUntil > state.tick && inArea(b, x, y, r)) out.push(b);
  return out;
}

interface S { r: number; acc: { acc: number }; done: Set<number>; cast: boolean }

export const pestilence: FxHandler<S> = {
  create(e, fx, age) {
    const r = Number(e.data) || 10, s: S = { r, acc: { acc: 0 }, done: new Set(), cast: age <= FRESH };
    if (!s.cast) return s;
    // chão manchado sob cada edifício atingido (fica o minuto da peste; aparece quando o jogador vir o tile)
    for (const b of stricken(fx.state, e.x, e.y, r)) {
      const d = BUILDINGS[b.type];
      fx.decal('glow', b.x, b.y + d.h * 0.2, { size: (Math.max(d.w, d.h) + 3) * TILE * 2, alpha: 0.95, life: (b.disabledUntil - fx.state.tick) / TICK_RATE, tint: 0x5f5268 });
    }
    if (fx.onScreen(e.x, e.y, r) && fx.visibleAt(e.x, e.y)) {
      const x = e.x * TILE, y = e.y * TILE, R0 = r * TILE;
      ring(fx.particles, fx.tex, x, y, R0 * 0.15, R0 * 1.02, 0x2f2438, 1.9, 'normal', PRIO.power, 0.7);
      ring(fx.particles, fx.tex, x, y, R0 * 0.1, R0 * 0.9, 0x5d5368, 2.4, 'normal', PRIO.power, 0.45);
      miasma(fx.particles, fx.tex, x - 16, x + 16, y - 10, y + 10, 8, 0.5, 2.4);
    }
    return s;
  },
  update(e, s, fx, t) {
    if (!fx.onScreen(e.x, e.y, s.r) || !fx.visibleAt(e.x, e.y) || !s.cast) return;
    const R0 = s.r * TILE, front = R0 * easeOut(Math.min(1, t / 1.8)), fr = front / TILE;
    // névoa nascendo na frente (só onde o jogador vê), mais fraca depois que ela chega à borda
    // muitas baforadas largas e translúcidas que se sobrepõem: uma frente de névoa contínua, não bolas
    const n = every(s.acc, (t < 1.8 ? 95 : 10) * (1 - Math.min(0.8, t / 3)), fx.dt);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = front + (R() - 0.5) * 22;
      const px = e.x * TILE + Math.cos(a) * d, py = e.y * TILE + Math.sin(a) * d;
      if (!fx.visibleAt(px / TILE, py / TILE)) continue;
      if (!fx.particles.emit({ frames: [fx.tex.pick('smoke')], blend: 'normal', prio: PRIO.power, x: px, y: py, z: 2 + R() * 6, vx: Math.cos(a) * 14, vy: Math.sin(a) * 9, vz: 3, drag: 0.8, wind: 0.4,
        life: 2.3 + R() * 0.8, scale0: 1.9 + R() * 0.7, scale1: 3 + R() * 0.8, alpha0: 0.34, alpha1: 0, fadeIn: 0.25, tint: MIASMA[Math.floor(R() * MIASMA.length)], rot: R() * 6.28, spin: (R() - 0.5) * 0.3 })) break;
    }
    // a frente chegou a um edifício atingido: miasma e moscas o envolvem
    for (const b of stricken(fx.state, e.x, e.y, fr)) {
      if (s.done.has(b.id) || !fx.visibleAt(b.x, b.y)) continue;
      s.done.add(b.id);
      const f = footprint(b);
      miasma(fx.particles, fx.tex, f.x0, f.x1, f.y0, f.y1, 8 + f.w * f.h, 0.52, 2.8);
      flies(fx.particles, fx.tex, (f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, (f.x1 - f.x0) / 2, (f.y1 - f.y0) / 2, 10 + f.w * 4);
    }
  },
};

/** Duração da peste: miasma e moscas sobre cada edifício parado por ela, à vista, enquanto `disabledUntil` não passa. */
export function pestilenceWatcher(): FxWatcher {
  const acc = new Map<number, { m: number; f: number; seen: number }>();
  let frame = 0;
  return {
    id: 'pestilence',
    update(fx: FxContext) {
      if (fx.dt <= 0) return;
      frame++;
      const tick = fx.state.tick;
      for (const b of fx.state.buildings.values()) {
        if (b.disabledUntil <= tick) continue;
        const d = BUILDINGS[b.type];
        if (!fx.onScreen(b.x, b.y, Math.max(d.w, d.h)) || !fx.visibleAt(b.x, b.y)) continue;
        let a = acc.get(b.id);
        if (!a) { a = { m: R(), f: R(), seen: frame }; acc.set(b.id, a); }
        a.seen = frame;
        const left = (b.disabledUntil - tick) / TICK_RATE, k = Math.min(1, left / 3);
        const f = footprint(b), area = d.w * d.h;
        // ≈ 10 baforadas/s num edifício 3×3 (vida ~3,4 s: ~35 no ar), moscas ≈ 12/s
        a.m += (3 + area * 0.8) * k * fx.dt;
        if (a.m >= 1) { const n = Math.floor(a.m); a.m -= n; miasma(fx.particles, fx.tex, f.x0, f.x1, f.y0, f.y1, n, 0.5, 3.4); }
        a.f += (5 + area * 0.8) * k * fx.dt;
        if (a.f >= 1) { const n = Math.floor(a.f); a.f -= n; flies(fx.particles, fx.tex, (f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2 - 10, (f.x1 - f.x0) * 0.4, (f.y1 - f.y0) * 0.45, n); }
      }
      if (frame % 120 === 0) for (const [id, a] of acc) if (frame - a.seen > 60) acc.delete(id);
    },
    reset() { acc.clear(); frame = 0; },
  };
}
