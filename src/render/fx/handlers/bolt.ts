// Raio de Zeus e Tempestade de Raios (lote poderes-luz da Etapa 5, docs/ART.md §1.9 e Apêndice F).
//
// Raio (`bolt`: o do Raio de Zeus tem ttl 24 = 1,2 s; cada raio da Tempestade, 16 = 0,8 s): o canal desce do céu em
// ziguezague FRACTAL (deslocamento do ponto médio, 32 segmentos) com 2–4 RAMIFICAÇÕES que se abrem para baixo, desenhado
// com brilhos esticados aditivos em três camadas (halo azul, meio azul-claro, núcleo branco). Sequência de uma descarga
// real: o líder desce em ~0,06 s, o retorno acende o canal inteiro, 3–5 re-descargas cintilam até ~0,45 s e o canal
// apaga (os galhos antes). No chão: clarão branco-azulado e a poça de luz em volta (luz aditiva: o raio EMITE luz), onda
// de luz, faíscas, brasas, chamas curtas, poeira e lascas, fumaça escura subindo, QUEIMADURA e marca de impacto no chão
// (decalques; na Tempestade só o raio que acerta alguém queima, pequeno e por 10 s), tremor e, no Raio de Zeus, um clarão
// breve na tela inteira (fraco na Tempestade: os raios caem a cada 0,5 s).
//
// Tempestade (`lightning_storm`, TimedEffect de 8 s, raio `data`): a SOMBRA da nuvem escurecendo a área (disco macio
// que acende em 0,8 s e apaga nos últimos 0,8), nuvens baixas rolando com o vento, CHUVA em riscos inclinados caindo
// só na área visível e relâmpagos difusos dentro da nuvem; ao lançar, a nuvem se fecha da borda para o centro. Os raios
// em si são os efeitos `bolt` do núcleo.
import { Sprite, type Texture } from 'pixi.js';
import { TICK_RATE } from '../../../core/constants';
import type { GameState, TimedEffect } from '../../../core/types';
import type { FxContext, FxHandler, TimedHandler } from '../types';
import { PRIO } from '../../particles';
import { chips, dust, embers, flame, glow, haze, ring, sparks } from '../emitters';
import { FRESH, TILE, dustAt, seenNow } from './util';
import { every, inDisc } from './kit';

const R = Math.random;

/** Caminho de um raio: `main` = pontos do céu ao chão (px, pares x/y), `branches` = galhos (cada um pares x/y). */
export interface BoltPath { main: number[]; branches: number[][] }

/** Deslocamento do ponto médio: `levels` subdivisões de A→B, cada uma empurrando o meio para o lado em ±rough·comprimento. */
function midpoint(ax: number, ay: number, bx: number, by: number, levels: number, rough: number, rnd: () => number): number[] {
  let pts = [ax, ay, bx, by];
  let r = rough;
  for (let l = 0; l < levels; l++) {
    const out: number[] = [pts[0], pts[1]];
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
      const dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy) || 1;
      const off = (rnd() - 0.5) * 2 * r * len;
      out.push((x0 + x1) / 2 - (dy / len) * off, (y0 + y1) / 2 + (dx / len) * off, x1, y1);
    }
    pts = out;
    r *= 0.62;
  }
  return pts;
}

/**
 * Caminho do raio que cai em (x, y) (px de mundo) vindo de `height` px acima: canal principal com 2^levels segmentos e
 * `nb` galhos saindo da parte alta, abrindo para baixo e para o lado. Puro (o `rnd` decide), testável em Node.
 */
export function boltPath(x: number, y: number, height: number, rnd: () => number, nb = 3, levels = 5): BoltPath {
  const top = y - height, tx = x + (rnd() - 0.5) * height * 0.3;
  const main = midpoint(tx, top, x, y, levels, 0.27, rnd);
  main[main.length - 2] = x; main[main.length - 1] = y;
  const n = main.length / 2, branches: number[][] = [];
  for (let b = 0; b < nb; b++) {
    const i = Math.max(2, Math.min(n - 5, Math.floor(n * (0.12 + rnd() * 0.5))));
    const sx = main[i * 2], sy = main[i * 2 + 1];
    const rest = y - sy;
    const side = rnd() < 0.5 ? -1 : 1, ang = side * (0.45 + rnd() * 0.6);   // rad a partir da vertical
    const L = rest * (0.28 + rnd() * 0.32);
    const ex = sx + Math.sin(ang) * L, ey = sy + Math.cos(ang) * L;
    const br = midpoint(sx, sy, ex, ey, levels - 2, 0.34, rnd);
    branches.push(br);
    // um galhinho do galho, às vezes
    if (rnd() < 0.55 && br.length >= 8) {
      const j = 2 + Math.floor(rnd() * (br.length / 2 - 3));
      const qx = br[j * 2], qy = br[j * 2 + 1], a2 = side * Math.min(1.3, Math.abs(ang) + 0.3 + rnd() * 0.4), L2 = L * (0.3 + rnd() * 0.25);
      branches.push(midpoint(qx, qy, qx + Math.sin(a2) * L2, qy + Math.cos(a2) * L2, levels - 3, 0.3, rnd));
    }
  }
  return { main, branches };
}

interface Seg { sp: Sprite; a: number; halo: boolean; main: boolean; k: number }
interface BoltS { segs: Seg[]; pattern: number[] }

/** Três camadas de brilho esticado ao longo de cada segmento (halo, meio, núcleo). */
type Layer = { w: number; tint: number; a: number };
const LAYERS: readonly Layer[] = [
  { w: 18, tint: 0x6a8cff, a: 0.55 }, { w: 7, tint: 0xb4ccff, a: 0.85 }, { w: 2.8, tint: 0xf8faff, a: 1 },
];
/** Raios da Tempestade (um a cada 0,5 s): duas camadas e 16 segmentos — um terço dos sprites do Raio de Zeus. */
const LAYERS_STORM: readonly Layer[] = [{ w: 15, tint: 0x7896ff, a: 0.62 }, { w: 3.4, tint: 0xf4f8ff, a: 1 }];
function makeSeg(fx: FxContext, tex: Texture, x0: number, y0: number, x1: number, y1: number, len: number, width: number, L: Layer, halo: boolean, main: boolean, k: number): Seg {
  const tint = L.tint;
  const sp = new Sprite(tex);
  sp.anchor.set(0.5); sp.blendMode = 'add'; sp.tint = tint; sp.alpha = 0; sp.visible = false;
  sp.position.set((x0 + x1) / 2, (y0 + y1) / 2);
  sp.rotation = Math.atan2(y1 - y0, x1 - x0);
  // o `glow` cai a 25 % a um quarto da largura: esticado a 3× o segmento, os vizinhos se somam num traço contínuo
  sp.scale.set((len * 3) / 32, (width * 3) / 32);
  fx.glowLayer.addChild(sp);
  return { sp, a: L.a, halo, main, k };
}
/** Alfa do canal no instante `t` (s): líder, retorno, re-descargas do padrão e o apagar. */
export function boltAlpha(t: number, pattern: readonly number[], lead = 0.06): number {
  if (t < 0) return 0;
  if (t < lead) return 0.5;
  const k = Math.floor((t - lead) / 0.065);
  if (k < pattern.length) return pattern[k];
  const end = lead + pattern.length * 0.065;
  return Math.max(0, pattern[pattern.length - 1] * (1 - (t - end) / 0.45));
}

/** O raio da Tempestade acertou alguém: o núcleo o põe no ponto da unidade atingida (que pode ter andado um passo até o
 *  quadro, ou morrido — a morte fica no mesmo ponto); o que erra cai num ponto sorteado da área. */
export function boltStruck(st: GameState, x: number, y: number): boolean {
  for (const u of st.units.values()) if (Math.abs(u.x - x) < 0.35 && Math.abs(u.y - y) < 0.35) return true;
  return st.effects.some((o) => o.type === 'death' && Math.abs(o.x - x) < 0.05 && Math.abs(o.y - y) < 0.05);
}

export const bolt: FxHandler<BoltS | null> = {
  create(e, fx, age) {
    const zeus = e.total >= 24;
    // as marcas ficam mesmo fora da tela (o decalque só aparece quando o jogador vir o tile — decals.ts). A Tempestade
    // solta ~16 raios: só o que ACERTA alguém queima o chão (pequeno e curto); o que erra deixa só a marca de impacto
    if (age <= FRESH) {
      const struck = zeus || boltStruck(fx.state, e.x, e.y);
      if (struck) fx.decal('decal/burn', e.x, e.y, { rot: R() * 6.28, size: (zeus ? 1.6 : 1) * TILE, alpha: zeus ? 0.7 : 0.6, life: zeus ? 30 : 10 });
      fx.decal('decal/impact', e.x, e.y, { rot: R() * 6.28, size: (zeus ? 0.9 : 0.6) * TILE, alpha: zeus ? 0.75 : 0.55, life: zeus ? 30 : 10 });
    }
    if (!seenNow(fx, e.x, e.y, 4)) return null;
    const x = e.x * TILE, y = e.y * TILE;
    const path = boltPath(x, y, (zeus ? 13 : 10) * TILE, R, zeus ? 3 + Math.floor(R() * 2) : 2 + Math.floor(R() * 2), zeus ? 5 : 4);
    const layers = zeus ? LAYERS : LAYERS_STORM;
    const tex = fx.tex.frame('glow');
    const s: BoltS = { segs: [], pattern: [] };
    const scale = zeus ? 1.3 : 1;
    const addPts = (pts: number[], main: boolean) => {
      const n = pts.length / 2 - 1;
      for (let i = 0; i < n; i++) {
        const x0 = pts[i * 2], y0 = pts[i * 2 + 1], x1 = pts[i * 2 + 2], y1 = pts[i * 2 + 3];
        const dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy);
        const taper = main ? 1 : Math.max(0.25, 0.9 - 0.65 * (i / Math.max(1, n)));
        for (let l = 0; l < layers.length; l++) {
          const L = layers[l];
          // k: posição ao longo do caminho (0 = céu) — o líder desce acendendo nesta ordem
          const k = main ? i / n : Math.min(1, (pts[1] - path.main[1]) / Math.max(1, y - path.main[1]) + (i / n) * 0.3);
          s.segs.push(makeSeg(fx, tex, x0, y0, x1, y1, len, L.w * scale * taper * (main ? 1 : 0.6), L, l === 0, main, k));
        }
      }
    };
    addPts(path.main, true);
    for (const b of path.branches) addPts(b, false);
    // re-descargas: 3–5 pulsos com vales fundos entre eles
    const pulses = 3 + Math.floor(R() * 3);
    for (let i = 0; i < pulses; i++) s.pattern.push(i === 0 ? 1 : 0.7 + R() * 0.3, 0.3 + R() * 0.2);
    s.pattern.push(0.85);
    if (age <= FRESH) {
      const tint = dustAt(fx, e.x, e.y);
      glow(fx.particles, fx.tex, x, y, 6, zeus ? 34 : 24, 0xffffff, 0.3, PRIO.power, 1);
      glow(fx.particles, fx.tex, x, y, 3, zeus ? 96 : 64, 0xdce8ff, 0.5, PRIO.power, 1);
      glow(fx.particles, fx.tex, x, y, 0, zeus ? 190 : 125, 0x8fb2ff, 0.85, PRIO.power, zeus ? 0.55 : 0.36, true);   // a poça de luz no chão
      ring(fx.particles, fx.tex, x, y, 6, zeus ? 56 : 40, 0xd4e4ff, 0.42, 'add', PRIO.power, 0.75);
      ring(fx.particles, fx.tex, x, y, 8, zeus ? 50 : 36, tint, 0.8, 'normal', PRIO.power, 0.45);
      sparks(fx.particles, fx.tex, x, y, 2, zeus ? 18 : 10, PRIO.power);
      embers(fx.particles, fx.tex, x, y, 4, zeus ? 12 : 6, PRIO.power);
      for (let i = 0; i < (zeus ? 3 : 2); i++) flame(fx.particles, fx.tex, x + (R() - 0.5) * 12, y + (R() - 0.5) * 6, 0, 0.5 + R() * 0.2, 0.7 + R() * 0.6, PRIO.power, undefined, true);
      dust(fx.particles, fx.tex, x, y, { n: zeus ? 10 : 6, tint, spread: 6, speed: 40, scale: 0.5, grow: 2.4, alpha: 0.5, life: 1.1, prio: PRIO.power, rise: 12 });
      chips(fx.particles, fx.tex, x, y, 4, zeus ? 6 : 3, 'stone', PRIO.power, 1.1);
      haze(fx.particles, fx.tex, x, y - 4, zeus ? 4 : 2, 6, 0x3b3733, { alpha: 0.5, life: 2.2, scale: 0.75, rise: 24, prio: PRIO.power });
      fx.shake(zeus ? 5 : 2);
      fx.screen.flash(zeus ? 0.22 : 0.06, 0xe8f0ff);
    }
    return s;
  },
  update(_e, s, _fx, t) {
    if (!s) return;
    const lead = 0.06;
    const a = boltAlpha(t, s.pattern, lead);
    for (const g of s.segs) {
      // líder: acende de cima para baixo; galhos apagam antes do canal principal
      let k = a;
      if (t < lead && g.k > t / lead) k = 0;
      if (!g.main) k *= t < 0.3 ? 1 : Math.max(0, 1 - (t - 0.3) / 0.25);
      // o halo apaga mais devagar que o núcleo (o canal "esfria" azulado)
      const la = g.a * (g.halo ? Math.min(1, k * 1.25) : k);
      g.sp.visible = la > 0.01;
      g.sp.alpha = la;
    }
  },
  destroy(_e, s) { if (s) for (const g of s.segs) g.sp.destroy(); },
};

// ---------------------------------------------------------------------------------------------------------------
// Tempestade de Raios

interface StormS { rain: { acc: number }; cloud: { acc: number }; sheet: number; dark: Sprite | null; cast: boolean }
const STORM_SECONDS = 8;
const pt = { x: 0, y: 0 };

/** Idade (s) de um TimedEffect de `seconds` de duração, pelo `until` do núcleo. */
export function timedAge(t: TimedEffect, tick: number, seconds: number): number { return seconds - (t.until - tick) / TICK_RATE; }

export const lightningStorm: TimedHandler<StormS> = {
  create(t, fx) {
    return { rain: { acc: 0 }, cloud: { acc: 0 }, sheet: 0.6, dark: null, cast: timedAge(t, fx.state.tick, STORM_SECONDS) > FRESH + 0.3 };
  },
  update(t, s, fx) {
    if (t.x === undefined || t.y === undefined) return;
    const r = t.data ?? 6, cx = t.x * TILE, cy = t.y * TILE, R0 = r * TILE;
    const age = timedAge(t, fx.state.tick, STORM_SECONDS), left = (t.until - fx.state.tick) / TICK_RATE;
    const fade = Math.min(1, Math.max(0, age / 0.8)) * Math.min(1, Math.max(0, left / 0.8));
    const on = fx.onScreen(t.x, t.y, r) && fx.visibleAt(t.x, t.y);
    // sombra da nuvem: disco macio escuro (o `glow` em mistura normal, tinto de ardósia), raio de textura 2r → ≈ 25 % na borda
    if (!s.dark && on) {
      s.dark = new Sprite(fx.tex.frame('glow'));
      s.dark.anchor.set(0.5); s.dark.tint = 0x0a0d13; s.dark.blendMode = 'normal';
      s.dark.scale.set((2.1 * R0) / 16);
      fx.layer.addChild(s.dark);
    }
    if (s.dark) { s.dark.position.set(cx, cy); s.dark.visible = on; s.dark.alpha = 0.64 * fade; }
    if (!on || fx.dt <= 0) return;
    // ao lançar: a nuvem se fecha da borda para o centro
    if (!s.cast) {
      s.cast = true;
      ring(fx.particles, fx.tex, cx, cy, R0 * 1.45, R0 * 0.9, 0x151922, 1.1, 'normal', PRIO.power, 0.55);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + R() * 0.4, px = cx + Math.cos(a) * R0 * 1.15, py = cy + Math.sin(a) * R0 * 1.15;
        fx.particles.emit({ frames: [fx.tex.pick('smoke')], blend: 'normal', prio: PRIO.power, x: px, y: py, z: 10, vx: -Math.cos(a) * R0 * 0.5, vy: -Math.sin(a) * R0 * 0.5, drag: 1.2, wind: 0.4,
          life: 2.2, scale0: 2.6, scale1: 3.6, alpha0: 0.34, alpha1: 0, fadeIn: 0.2, tint: 0x20242c, rot: R() * 6.28, spin: (R() - 0.5) * 0.4 });
      }
    }
    // nuvens baixas rolando (sombras escuras e largas)
    for (let i = every(s.cloud, 3.6 * fade, fx.dt); i > 0; i--) {
      inDisc(cx, cy, R0 * 0.95, pt);
      fx.particles.emit({ frames: [fx.tex.pick('smoke')], blend: 'normal', prio: PRIO.power, x: pt.x, y: pt.y, z: 14, vx: 6 + R() * 6, vy: (R() - 0.5) * 4, wind: 0.6,
        life: 3.4, scale0: 3.2 + R(), scale1: 4.4 + R(), alpha0: 0.34, alpha1: 0, fadeIn: 0.3, tint: R() < 0.5 ? 0x1f242d : 0x2c313a, rot: R() * 6.28, spin: (R() - 0.5) * 0.2 });
    }
    // chuva: riscos inclinados caindo até o chão (só onde o jogador vê)
    let n = every(s.rain, 150 * fade * (fx.quality.particles >= 2 ? 1 : 0.6), fx.dt);
    const drop = [fx.tex.frame('spark')], splash = [fx.tex.frame('ring')];
    while (n-- > 0) {
      inDisc(t.x, t.y, r, pt);
      if (!fx.visibleAt(pt.x, pt.y)) continue;
      const z = 60 + R() * 60, vz = 520, life = z / vz;
      fx.particles.emit({ frames: drop, blend: 'normal', prio: PRIO.power, x: pt.x * TILE, y: pt.y * TILE, z, vx: 40, vz: -vz, life,
        scale0: 1.8, alpha0: 0.62, alpha1: 0.5, fadeIn: 0.12, tint: 0xd4dde8, align: true });
      // respingo: um aro miúdo no chão onde a gota cai (uma em quatro)
      if (R() < 0.25) fx.particles.emit({ frames: splash, blend: 'normal', prio: PRIO.power, x: pt.x * TILE + 40 * life, y: pt.y * TILE, life: 0.25, scale0: 0.05, scale1: 0.16, alpha0: 0.5, alpha1: 0, fadeIn: 0.05, tint: 0xdfe8f2 });
    }
    // relâmpagos difusos dentro da nuvem
    s.sheet -= fx.dt;
    if (s.sheet <= 0) {
      s.sheet = 0.9 + R() * 1.4;
      inDisc(cx, cy, R0 * 0.7, pt);
      glow(fx.particles, fx.tex, pt.x, pt.y, 40, 110, 0x9fb2dc, 0.28, PRIO.power, 0.22 * fade);
    }
  },
  destroy(_t, s) { s.dark?.destroy(); },
};
