// Projétil (P0 + P1, docs/ART.md §1.9): flecha, dardo, pedra, espinho, bola de fogo ou raio mítico, pelo tipo de quem
// atirou (`e.src`; sem ele, `e.data` do núcleo). Quem usa cada um (UNITS/BUILDINGS com alcance ≥ 1,6, combat.ts):
// flecha — toxota, arqueiro cretense, Odisseu, centauro, Centro Cívico, torre e fortaleza; dardo — peltasta; pedra —
// petróbolo e helépole; espinho — mantícora (uma RAJADA: três espinhos em leque, o do meio no alvo); raio mítico —
// Medusa e sentinela; bola de fogo — nenhuma unidade hoje (a Quimera tem alcance 1,2 e cospe fogo de perto: o fogo
// dela sai no golpe em área, splash.ts), o quadro existe para quando alguém atirar.
// Arco parabólico (altura pelo tipo e pela distância), sprite da direção assada mais próxima da VELOCIDADE NA TELA girado
// pelo resto (a luz do atlas continua certa: vem de noroeste em qualquer direção), a pedra rolando pelas 8 vistas, e a
// SOMBRA no chão — a mesma silhueta em preto, deslocada para sudeste pela altura (contrato de luz) —, que encosta no
// projétil ao aterrissar. Emissivos (bola de fogo, raio) são aditivos e sem sombra; a bola de fogo leva um clarão
// próprio, brasas e um rastro de fumaça. Posição pelo relógio de JOGO, contínua entre os ticks. Impacto ao acabar:
// poeira (flecha/dardo/espinho — os espinhos também em leque), pedra com poeira, lascas e marca no chão, fogo com
// brasas, fumaça e queimadura; na ÁGUA, respingo e ondulação em vez de poeira. Só à vista: origem ou alvo visíveis.
import { Sprite } from 'pixi.js';
import { TERRAIN } from '../../../core/constants';
import type { VisualEffect } from '../../../core/types';
import type { FxContext, FxHandler } from '../types';
import { arcHeight, arcPoint, dirAndResidual, isEmissive, projectileKind, type ProjectileKind } from '../logic';
import { SHADOW_ALPHA } from '../../palette';
import { PRIO } from '../../particles';
import { chips, dust, embers, flame, glow, motes } from '../emitters';
import { waterSplash } from '../recipes';
import { TILE, dustAt, terrainAt } from './util';

/** Uma peça do voo: o sprite (e a sombra) de um projétil da rajada, deslocado de `off` tiles para o lado e atrasado de
 *  `lag` (fração do voo). */
interface Part { body: Sprite; shadow: Sprite | null; off: number; lag: number }
// os sprites só nascem quando o projétil aparece (à vista e na tela): numa partida grande a maioria voa longe da câmera
// `body`/`shadow` = a peça principal (a que vai ao alvo; scripts/artfx.mjs confere o arco por elas)
interface S { kind: ProjectileKind; parts: Part[] | null; body: Sprite | null; shadow: Sprite | null; halo: Sprite | null; H: number; seen: boolean; trail: number; smoke: number }

/** Leque da rajada da mantícora: deslocamento lateral (tiles) e atraso de cada espinho. */
const SPIKE_VOLLEY: readonly (readonly [number, number])[] = [[0, 0], [-0.32, 0.07], [0.3, 0.13]];

function visibleShot(e: VisualEffect, fx: FxContext): boolean {
  return fx.visibleAt(e.x, e.y) || (e.tx !== undefined && e.ty !== undefined && fx.visibleAt(e.tx, e.ty));
}
const isWater = (t: number): boolean => t === TERRAIN.WATER || t === TERRAIN.DEEP;

export const projectile: FxHandler<S> = {
  create(e, fx) {
    const kind = projectileKind(e.src, e.data);
    const dist = e.tx !== undefined && e.ty !== undefined ? Math.sqrt((e.tx - e.x) ** 2 + (e.ty - e.y) ** 2) : 0;
    return { kind, parts: null, body: null, shadow: null, halo: null, H: arcHeight(kind, dist), seen: visibleShot(e, fx), trail: 0, smoke: 0 };
  },
  update(e, s, fx, t, p) {
    const hide = () => { if (s.parts) for (const q of s.parts) { q.body.visible = false; if (q.shadow) q.shadow.visible = false; } if (s.halo) s.halo.visible = false; };
    if (e.tx === undefined || e.ty === undefined) { hide(); return; }
    s.seen = visibleShot(e, fx);
    if (!s.seen) { hide(); return; }
    const a0 = arcPoint(e.x, e.y, e.tx, e.ty, s.H, p);
    if (!fx.onScreen(a0.sx, a0.sy, 2)) { hide(); return; }
    if (!s.parts) {
      const volley = s.kind === 'spike' ? SPIKE_VOLLEY : [[0, 0] as const];
      s.parts = volley.map(([off, lag]) => {
        const body = new Sprite(fx.tex.proj(s.kind, 0));
        body.anchor.set(0.5);
        let shadow: Sprite | null = null;
        if (isEmissive(s.kind)) { body.blendMode = 'add'; fx.glowLayer.addChild(body); }
        else {
          fx.layer.addChild(body);
          shadow = new Sprite(fx.tex.proj(s.kind, 0));
          shadow.anchor.set(0.5); shadow.tint = 0x000000; shadow.blendMode = 'multiply';
          fx.host.shadows.addChild(shadow);
        }
        return { body, shadow, off, lag };
      });
      s.body = s.parts[0].body; s.shadow = s.parts[0].shadow;
      if (s.kind === 'fireball') {
        // a bola de fogo ilumina em volta: um clarão alaranjado que a acompanha (luz aditiva: ela emite luz)
        const h = s.halo = new Sprite(fx.tex.frame('glow'));
        h.anchor.set(0.5); h.blendMode = 'add'; h.tint = 0xff8a30; h.scale.set(1.3); h.alpha = 0.55;
        fx.glowLayer.addChild(h);
      }
    }
    // perpendicular do voo no chão (para o leque)
    const gdx = e.tx - e.x, gdy = e.ty - e.y, gl = Math.sqrt(gdx * gdx + gdy * gdy) || 1, nx = -gdy / gl, ny = gdx / gl;
    const g = dirAndResidual(Math.atan2(gdy, gdx));
    for (const q of s.parts) {
      const pp = p - q.lag;
      if (pp < 0 || pp > 1) { q.body.visible = false; if (q.shadow) q.shadow.visible = false; continue; }
      // o leque abre ao longo do voo: os espinhos saem juntos do rabo da mantícora e se espalham até o alvo
      const a = q.off === 0 && q.lag === 0 ? a0 : arcPoint(e.x, e.y, e.tx + nx * q.off, e.ty + ny * q.off, s.H, pp);
      q.body.visible = true;
      if (q.shadow) q.shadow.visible = true;
      const { dir, residual } = dirAndResidual(a.angle);
      if (s.kind === 'stone') {
        // a pedra rola: as 8 vistas giradas em sequência (≈ 2,5 voltas/s) e sem girar o sprite (a luz fica de noroeste)
        q.body.texture = fx.tex.proj('stone', Math.floor(t * 20) & 7); q.body.rotation = 0;
      } else { q.body.texture = fx.tex.proj(s.kind, dir); q.body.rotation = residual; }
      q.body.position.set(a.sx * TILE, a.sy * TILE);
      if (q.shadow) {
        // sombra: orientada pela direção no CHÃO; mais fraca e macia quanto mais alto
        q.shadow.texture = s.kind === 'stone' ? q.body.texture : fx.tex.proj(s.kind, g.dir);
        q.shadow.rotation = s.kind === 'stone' ? 0 : g.residual;
        q.shadow.position.set(a.shx * TILE, a.shy * TILE);
        const k = s.H > 0 ? a.h / s.H : 0;
        q.shadow.alpha = SHADOW_ALPHA * (0.85 - 0.45 * k);
        q.shadow.scale.set(1 + 0.25 * k);
      }
    }
    if (s.kind === 'fireball') {
      const x = a0.sx * TILE, y = a0.sy * TILE;
      if (s.halo) { s.halo.visible = true; s.halo.position.set(x, y); s.halo.alpha = 0.45 + Math.random() * 0.2; }
      if (fx.dt > 0) {
        // rastro: brasas e baforadas de fumaça escura que ficam para trás e sobem
        s.trail += fx.dt * 40; s.smoke += fx.dt * 14;
        const n = Math.floor(s.trail); s.trail -= n;
        if (n > 0) embers(fx.particles, fx.tex, x, y + 4, 4, n, PRIO.combat);
        const m = Math.floor(s.smoke); s.smoke -= m;
        for (let i = 0; i < m; i++) {
          const sc = 0.22 + Math.random() * 0.1;
          fx.particles.emit({ frames: [fx.tex.pick('smoke')], blend: 'normal', prio: PRIO.combat, x: x + (Math.random() - 0.5) * 4, y: y + 4, z: 4, vz: 6, wind: 0.5, drag: 0.4,
            life: 0.8 + Math.random() * 0.4, scale0: sc, scale1: sc * 3, alpha0: 0.4, alpha1: 0, fadeIn: 0.2, tint: 0x3a3430, rot: Math.random() * 6.28 });
        }
      }
    }
  },
  destroy(e, s, fx, expired) {
    if (s.parts) for (const q of s.parts) { q.body.destroy(); q.shadow?.destroy(); }
    s.halo?.destroy();
    if (!expired || e.tx === undefined || e.ty === undefined) return;
    if (!fx.visibleAt(e.tx, e.ty) || !fx.onScreen(e.tx, e.ty, 2)) return;
    const x = e.tx * TILE, y = e.ty * TILE, tint = dustAt(fx, e.tx, e.ty);
    if (isWater(terrainAt(fx.state, e.tx, e.ty))) {
      // caiu na água: respingo e ondulação (a pedra e a bola de fogo levantam mais)
      const big = s.kind === 'stone' || s.kind === 'fireball';
      waterSplash(fx.particles, fx.tex, x, y, { n: big ? 10 : 4, power: big ? 2.2 : 1, prio: PRIO.combat });
      return;
    }
    switch (s.kind) {
      case 'stone':
        dust(fx.particles, fx.tex, x, y, { n: 7, tint, spread: 5, speed: 34, scale: 0.55, grow: 2.6, alpha: 0.55, life: 1.3 });
        chips(fx.particles, fx.tex, x, y, 3, 6, 'stone', PRIO.combat, 1.3);
        fx.decal('decal/impact', e.tx, e.ty, { rot: Math.random() * 6.28, size: 24 + Math.random() * 10, alpha: 0.85, life: 25 });
        break;
      case 'fireball':
        for (let i = 0; i < 3; i++) flame(fx.particles, fx.tex, x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 6, 0, 0.6, 0.9 + Math.random() * 0.5);
        embers(fx.particles, fx.tex, x, y, 4, 8);
        glow(fx.particles, fx.tex, x, y, 6, 22, 0xffa040, 0.45);
        fx.decal('decal/burn', e.tx, e.ty, { rot: Math.random() * 6.28, size: 30, alpha: 0.8, life: 30 });
        break;
      case 'bolt':
        glow(fx.particles, fx.tex, x, y, 8, 16, 0xa8d8ff, 0.3);
        motes(fx.particles, fx.tex, x, y, 5, 0xc8e8ff, 6, PRIO.combat, 22);
        break;
      case 'spike': {
        // a rajada cai em leque: um tufo de poeira por espinho e lascas escuras (espinho partido)
        const gdx = e.tx - e.x, gdy = e.ty - e.y, gl = Math.sqrt(gdx * gdx + gdy * gdy) || 1, nx = -gdy / gl, ny = gdx / gl;
        for (const [off] of SPIKE_VOLLEY) dust(fx.particles, fx.tex, x + nx * off * TILE, y + ny * off * TILE, { n: 1, tint, spread: 1.5, speed: 12, scale: 0.3, grow: 1.8, alpha: 0.45, life: 0.6 });
        chips(fx.particles, fx.tex, x, y, 4, 2, 'wood', PRIO.combat, 0.7);
        break;
      }
      default:
        dust(fx.particles, fx.tex, x, y, { n: s.kind === 'javelin' ? 3 : 2, tint, spread: 2, speed: 14, scale: 0.3, grow: 1.8, alpha: 0.4, life: 0.7 });
    }
  },
};
