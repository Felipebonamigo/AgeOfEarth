// Restauração (Atena; lote poderes-luz da Etapa 5, docs/ART.md Apêndice F). Efeito `heal` (2 s, `data` = raio): a ÁREA
// se lê por dois anéis de luz se abrindo (verde-claro e dourado) e uma poça de luz macia no chão; QUEM foi curado, por
// uma coluna de luz que sobe de cada unidade do dono dentro da área — acendendo quando a onda chega nela —, um anel no
// pé e centelhas subindo; os edifícios curados soltam centelhas pela pegada. Luz aditiva: é luz divina. O dono vem do
// evento `powerUsed` no ponto (casterOf).
import { BUILDINGS } from '../../../core/data';
import type { FxHandler } from '../types';
import { PRIO } from '../../particles';
import { glow, motes, ring } from '../emitters';
import { FRESH, TILE } from './util';
import { SpriteSet, every, shaft, unitTop } from './kit';
import { casterOf } from './powers';

interface S { acc: { acc: number }; r: number; set: SpriteSet }

export const heal: FxHandler<S> = {
  create(e, fx, age) {
    const r = Number(e.data) || 8, s: S = { acc: { acc: 0 }, r, set: new SpriteSet() };
    if (age > FRESH || !fx.onScreen(e.x, e.y, r) || !fx.visibleAt(e.x, e.y)) return s;
    const x = e.x * TILE, y = e.y * TILE, R0 = r * TILE;
    ring(fx.particles, fx.tex, x, y, R0 * 0.12, R0, 0xc4f5a0, 0.95, 'add', PRIO.power, 0.95);
    ring(fx.particles, fx.tex, x, y, R0 * 0.08, R0 * 0.84, 0xffe3a0, 1.5, 'add', PRIO.power, 0.45);
    glow(fx.particles, fx.tex, x, y, 0, R0 * 1.9, 0xcff7b4, 1.9, PRIO.power, 0.32);
    glow(fx.particles, fx.tex, x, y, 8, 34, 0xf4ffe0, 0.6, PRIO.power, 0.8);
    const who = casterOf(fx.state, 'restoration', e.x, e.y);
    const g = fx.tex.frame('glow');
    let n = 0;
    for (const u of fx.state.units.values()) {
      if (n >= 40) break;
      if (u.owner !== who || u.inside !== -1 || (u.x - e.x) ** 2 + (u.y - e.y) ** 2 > r * r || !fx.visibleAt(u.x, u.y)) continue;
      const ux = u.x * TILE, uy = u.y * TILE, top = unitTop(fx, u.type);
      // a onda chega na unidade: a coluna acende com o atraso da distância
      const delay = (Math.sqrt((u.x - e.x) ** 2 + (u.y - e.y) ** 2) / r) * 0.45;
      shaft(s.set, fx.glowLayer, g, fx.clock, ux, uy + 2, top * 2.1 + 14, 9, 0xd6ffb0, 1.1, 0.8, delay);
      ring(fx.particles, fx.tex, ux, uy, 3, 13, 0xc8f5a0, 0.8, 'add', PRIO.power, 0.75);
      motes(fx.particles, fx.tex, ux, uy, 4, 0xd4f8ac, 5, PRIO.power, 34);
      n++;
    }
    for (const b of fx.state.buildings.values()) {
      if (b.owner !== who || !b.complete || (b.x - e.x) ** 2 + (b.y - e.y) ** 2 > r * r || !fx.visibleAt(b.x, b.y)) continue;
      const d = BUILDINGS[b.type];
      motes(fx.particles, fx.tex, b.x * TILE, b.y * TILE, 4 + d.w * d.h, 0xe6ffc0, Math.max(d.w, d.h) * TILE * 0.5, PRIO.power, 30);
      ring(fx.particles, fx.tex, b.x * TILE, b.y * TILE, 6, Math.max(d.w, d.h) * TILE * 0.75, 0xc8f5a0, 0.9, 'add', PRIO.power, 0.55);
    }
    return s;
  },
  update(e, s, fx, _t, p) {
    s.set.update(fx.clock);
    if (p > 0.8 || !fx.onScreen(e.x, e.y, s.r) || !fx.visibleAt(e.x, e.y)) return;
    const n = every(s.acc, 12 + s.r * 2, fx.dt);
    if (n) motes(fx.particles, fx.tex, e.x * TILE, e.y * TILE, n, 0xd0f7b0, s.r * TILE, PRIO.power, 20);
  },
  destroy(_e, s) { s.set.destroy(); },
};
