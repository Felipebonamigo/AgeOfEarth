// Terremoto (Ártemis; lote poderes-luz da Etapa 5, docs/ART.md Apêndice F).
//
// Efeito `quake` (5 s, `data` = raio): tremor forte da câmera que vai amansando; uma rachadura grande no epicentro e
// RACHADURAS SE ABRINDO em 5–7 raios do centro até a borda da área em ~1,5 s (decalques postos um a um ao longo de cada
// raio, com poeira e pedrinhas saltando onde abrem); ondas de poeira rasteira em anel a cada ~1,25 s marcando a ÁREA;
// poeira subindo das rachaduras e de pontos da área e pedrinhas pulando enquanto dura.
// Tempo do núcleo (`earthquake`, TimedEffect de 5 s): a cada pulso de dano (5 ticks) os edifícios da área sacodem —
// poeira na base e lascas (madeira ou pedra, pelo material) caindo das paredes.
// Os decalques ficam mesmo fora da tela (aparecem quando o jogador vir o tile, decals.ts); as partículas, só à vista.
import { BUILDINGS } from '../../../core/data';
import type { FxHandler, TimedHandler } from '../types';
import { PRIO } from '../../particles';
import { chips, dust, ring } from '../emitters';
import { hitMaterial } from '../logic';
import { FRESH, TILE, dustAt } from './util';
import { every, inDisc } from './kit';

const R = Math.random;
interface Ray { a: number; d: number; next: number }
interface S { r: number; acc: { acc: number }; rays: Ray[]; pts: number[]; wave: number; cast: boolean }
const pt = { x: 0, y: 0 };

export const quake: FxHandler<S> = {
  create(e, fx, age) {
    const r = Number(e.data) || 7;
    const s: S = { r, acc: { acc: 0 }, rays: [], pts: [], wave: 1.25, cast: age <= FRESH };
    if (!s.cast) return s;
    // o tremor da câmera só para quem está olhando para a área e a VÊ (um terremoto do outro lado do mapa ou sob a névoa
    // não sacode a tela)
    if (fx.onScreen(e.x, e.y, r + 6) && fx.visibleAt(e.x, e.y)) fx.shake(11);
    fx.decal('decal/crack', e.x, e.y, { rot: R() * 6.28, size: 3.8 * TILE, alpha: 0.95, life: 45 });
    fx.decal('decal/impact', e.x, e.y, { rot: R() * 6.28, size: 1.6 * TILE, alpha: 0.7, life: 45 });
    const nr = fx.quality.particles === 0 ? 4 : 5 + Math.floor(R() * 3);
    for (let i = 0; i < nr; i++) s.rays.push({ a: (i / nr) * Math.PI * 2 + (R() - 0.5) * 0.7, d: 0.9, next: 1.7 + R() * 0.4 });
    if (fx.onScreen(e.x, e.y, r) && fx.visibleAt(e.x, e.y)) {
      const x = e.x * TILE, y = e.y * TILE, tint = dustAt(fx, e.x, e.y);
      ring(fx.particles, fx.tex, x, y, r * TILE * 0.2, r * TILE * 1.1, 0x8f7d5e, 1.3, 'normal', PRIO.power, 0.7);
      dust(fx.particles, fx.tex, x, y, { n: 14, tint, spread: 16, speed: 46, scale: 0.8, grow: 2.8, alpha: 0.6, life: 1.8, prio: PRIO.power, rise: 14 });
      chips(fx.particles, fx.tex, x, y, 2, 8, 'stone', PRIO.power, 1.4);
    }
    return s;
  },
  update(e, s, fx, _t, p) {
    const on = fx.onScreen(e.x, e.y, s.r), seen = fx.visibleAt(e.x, e.y);
    if (seen && fx.onScreen(e.x, e.y, s.r + 6)) fx.shake(4.5 * (1 - p));
    if (!s.cast || fx.dt <= 0) return;
    // rachaduras se abrindo do centro para fora (decalques mesmo fora da tela)
    const speed = s.r / 1.5;
    for (const ray of s.rays) {
      if (ray.d >= s.r) continue;
      ray.d += speed * fx.dt * (0.8 + R() * 0.4);
      while (ray.d >= ray.next && ray.next <= s.r) {
        // uma fenda alongada AO LONGO do raio (o decalque de rachadura achatado e girado), emendando com a anterior
        const x = e.x + Math.cos(ray.a) * (ray.next - 0.6), y = e.y + Math.sin(ray.a) * (ray.next - 0.6);
        fx.decal('decal/crack', x, y, { rot: ray.a + (R() - 0.5) * 0.25, size: (2.1 + R() * 0.5) * TILE, aspect: 0.42, alpha: 0.95, life: 40, stack: true });
        if (R() < 0.35) fx.decal('decal/crack', x, y, { rot: R() * 6.28, size: (1 + R() * 0.4) * TILE, alpha: 0.7, life: 40, stack: true });
        if (s.pts.length < 80) s.pts.push(x, y);
        if (on && fx.visibleAt(x, y)) {
          dust(fx.particles, fx.tex, x * TILE, y * TILE, { n: 4, tint: dustAt(fx, x, y), spread: 10, speed: 22, scale: 0.85, grow: 2.8, alpha: 0.66, life: 1.8, prio: PRIO.power, rise: 22 });
          chips(fx.particles, fx.tex, x * TILE, y * TILE, 1, 3, 'stone', PRIO.power, 1.1);
        }
        ray.next += 1.2 + R() * 0.3;
        ray.a += (R() - 0.5) * 0.3;
      }
    }
    if (!on) return;
    // ondas de poeira rasteira: a ÁREA do tremor
    s.wave -= fx.dt;
    if (s.wave <= 0 && p < 0.8 && seen) {
      s.wave = 1.25;
      ring(fx.particles, fx.tex, e.x * TILE, e.y * TILE, s.r * TILE * 0.3, s.r * TILE * 1.05, 0x8f7d5e, 1.1, 'normal', PRIO.power, 0.5);
    }
    // poeira das rachaduras e da área, pedrinhas pulando
    const n = every(s.acc, (12 + s.r * 2) * (1 - p * 0.55), fx.dt);
    for (let i = 0; i < n; i++) {
      if (s.pts.length && R() < 0.6) { const k = Math.floor(R() * (s.pts.length / 2)) * 2; pt.x = s.pts[k] + (R() - 0.5) * 0.6; pt.y = s.pts[k + 1] + (R() - 0.5) * 0.6; }
      else inDisc(e.x, e.y, s.r, pt);
      if (!fx.visibleAt(pt.x, pt.y)) continue;
      dust(fx.particles, fx.tex, pt.x * TILE, pt.y * TILE, { n: 2, tint: dustAt(fx, pt.x, pt.y), spread: 8, speed: 14, scale: 0.95, grow: 2.6, alpha: 0.58, life: 1.8, prio: PRIO.power, rise: 18 });
      if (R() < 0.3) chips(fx.particles, fx.tex, pt.x * TILE, pt.y * TILE, 2, 2, 'stone', PRIO.power, 0.9);
    }
  },
};

/** Pulsos do terremoto (TimedEffect): a cada 5 ticks — o dano do núcleo — os edifícios da área sacodem. */
export const earthquake: TimedHandler<{ last: number }> = {
  create(_t, fx) { return { last: fx.state.tick }; },
  update(t, s, fx) {
    if (t.x === undefined || t.y === undefined) return;
    const tick = fx.state.tick;
    if (tick === s.last) return;
    s.last = tick;
    if (tick % 5 !== 0 || !fx.onScreen(t.x, t.y, t.data ?? 7)) return;
    const r = t.data ?? 7;
    for (const b of fx.state.buildings.values()) {
      if ((b.x - t.x) ** 2 + (b.y - t.y) ** 2 > r * r || !fx.visibleAt(b.x, b.y)) continue;
      const d = BUILDINGS[b.type], x = b.x * TILE, base = (b.y + d.h / 2) * TILE;
      // poeira na base (a fachada sul, a que a câmera vê) e lascas caindo das paredes
      dust(fx.particles, fx.tex, x, base - 2, { n: 1 + Math.ceil(d.w / 2), tint: dustAt(fx, b.x, b.y + d.h / 2), spread: d.w * TILE * 0.45, speed: 18, scale: 0.7, grow: 2.4, alpha: 0.5, life: 1.3, prio: PRIO.power, rise: 8 });
      if (R() < 0.7) chips(fx.particles, fx.tex, x + (R() - 0.5) * d.w * TILE * 0.7, base - 4, 14 + R() * 16, 2, hitMaterial(b.type) === 'wood' ? 'wood' : 'stone', PRIO.power, 0.7);
    }
  },
};
