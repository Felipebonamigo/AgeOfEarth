// Projétil (P0, docs/ART.md §1.9): flecha, dardo, pedra, espinho, bola de fogo ou raio mítico, pelo tipo de quem atirou
// (`e.src`; sem ele, `e.data` do núcleo). Arco parabólico (altura pelo tipo e pela distância), sprite da direção assada
// mais próxima da VELOCIDADE NA TELA girado pelo resto (a luz do atlas continua certa: vem de noroeste em qualquer
// direção), a pedra rolando pelas 8 vistas, e a SOMBRA no chão — a mesma silhueta em preto, deslocada para sudeste pela
// altura (contrato de luz) —, que encosta no projétil ao aterrissar. Emissivos (bola de fogo, raio) são aditivos e sem
// sombra. Posição pelo relógio de JOGO, contínua entre os ticks. Impacto ao acabar: poeira (flecha/dardo/espinho), pedra
// com poeira, lascas e marca no chão, fogo com brasas e queimadura. Só à vista: origem ou alvo visíveis ao jogador.
import { Sprite } from 'pixi.js';
import type { VisualEffect } from '../../../core/types';
import type { FxContext, FxHandler } from '../types';
import { arcHeight, arcPoint, dirAndResidual, isEmissive, projectileKind, type ProjectileKind } from '../logic';
import { SHADOW_ALPHA } from '../../palette';
import { PRIO } from '../../particles';
import { chips, dust, embers, flame, glow, motes } from '../emitters';
import { TILE, dustAt } from './util';

// os sprites só nascem quando o projétil aparece (à vista e na tela): numa partida grande a maioria voa longe da câmera
interface S { kind: ProjectileKind; body: Sprite | null; shadow: Sprite | null; H: number; seen: boolean; trail: number }

function visibleShot(e: VisualEffect, fx: FxContext): boolean {
  return fx.visibleAt(e.x, e.y) || (e.tx !== undefined && e.ty !== undefined && fx.visibleAt(e.tx, e.ty));
}

export const projectile: FxHandler<S> = {
  create(e, fx) {
    const kind = projectileKind(e.src, e.data);
    const dist = e.tx !== undefined && e.ty !== undefined ? Math.sqrt((e.tx - e.x) ** 2 + (e.ty - e.y) ** 2) : 0;
    return { kind, body: null, shadow: null, H: arcHeight(kind, dist), seen: visibleShot(e, fx), trail: 0 };
  },
  update(e, s, fx, t, p) {
    const hide = () => { if (s.body) s.body.visible = false; if (s.shadow) s.shadow.visible = false; };
    if (e.tx === undefined || e.ty === undefined) { hide(); return; }
    s.seen = visibleShot(e, fx);
    if (!s.seen) { hide(); return; }
    const a = arcPoint(e.x, e.y, e.tx, e.ty, s.H, p);
    if (!fx.onScreen(a.sx, a.sy, 2)) { hide(); return; }
    if (!s.body) {
      const body = s.body = new Sprite(fx.tex.proj(s.kind, 0));
      body.anchor.set(0.5);
      if (isEmissive(s.kind)) { body.blendMode = 'add'; fx.glowLayer.addChild(body); }
      else {
        fx.layer.addChild(body);
        const sh = s.shadow = new Sprite(fx.tex.proj(s.kind, 0));
        sh.anchor.set(0.5); sh.tint = 0x000000; sh.blendMode = 'multiply';
        fx.host.shadows.addChild(sh);
      }
    }
    s.body.visible = true;
    if (s.shadow) s.shadow.visible = true;
    const { dir, residual } = dirAndResidual(a.angle);
    if (s.kind === 'stone') {
      // a pedra rola: as 8 vistas giradas em sequência (≈ 2,5 voltas/s) e sem girar o sprite (a luz fica de noroeste)
      s.body.texture = fx.tex.proj('stone', Math.floor(t * 20) & 7); s.body.rotation = 0;
    } else { s.body.texture = fx.tex.proj(s.kind, dir); s.body.rotation = residual; }
    s.body.position.set(a.sx * TILE, a.sy * TILE);
    if (s.shadow) {
      // sombra: orientada pela direção no CHÃO; mais fraca e macia quanto mais alto
      const g = dirAndResidual(Math.atan2(e.ty - e.y, e.tx - e.x));
      s.shadow.texture = s.kind === 'stone' ? s.body.texture : fx.tex.proj(s.kind, g.dir);
      s.shadow.rotation = s.kind === 'stone' ? 0 : g.residual;
      s.shadow.position.set(a.shx * TILE, a.shy * TILE);
      const k = s.H > 0 ? a.h / s.H : 0;
      s.shadow.alpha = SHADOW_ALPHA * (0.85 - 0.45 * k);
      s.shadow.scale.set(1 + 0.25 * k);
    }
    // rastro da bola de fogo: brasas e um clarão que acompanha
    if (s.kind === 'fireball' && fx.dt > 0) {
      s.trail += fx.dt * 40;
      const n = Math.floor(s.trail); s.trail -= n;
      if (n > 0) embers(fx.particles, fx.tex, a.sx * TILE, a.sy * TILE + 4, 4, n, PRIO.combat);
    }
  },
  destroy(e, s, fx, expired) {
    s.body?.destroy(); s.shadow?.destroy();
    if (!expired || e.tx === undefined || e.ty === undefined) return;
    if (!fx.visibleAt(e.tx, e.ty) || !fx.onScreen(e.tx, e.ty, 2)) return;
    const x = e.tx * TILE, y = e.ty * TILE, tint = dustAt(fx, e.tx, e.ty);
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
      default:
        dust(fx.particles, fx.tex, x, y, { n: s.kind === 'javelin' ? 3 : 2, tint, spread: 2, speed: 14, scale: 0.3, grow: 1.8, alpha: 0.4, life: 0.7 });
    }
  },
};
