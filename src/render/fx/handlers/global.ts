// Poderes GLOBAIS sem efeito próprio no núcleo (lote poderes-luz da Etapa 5, docs/ART.md Apêndice F): observadores de
// flags do estado, com a arte na tela (camada `fx.screen`, fora do mundo) e no mundo.
//
// Trégua (Hermes; `state.ceasefireUntil`, 30 s): AVISO GLOBAL DISCRETO — uma onda de luz branca atravessa a tela ao
// lançar e fica uma vinheta branco-prateada nas bordas enquanto dura, com o EMBLEMA da pomba com o ramo de oliveira no
// alto da tela e o aro do tempo que falta; a vinheta pulsa nos últimos 5 s (a trégua vai acabar). No mundo, cada
// tropa à vista ganha um halo branco macio no pé e centelhas brancas subindo devagar, e quem está no posto relaxa a
// guarda (armas baixadas — renderer.ts troca a pose de mira pela parada enquanto dura).
// Oráculo (Apolo; `player.revealUntil` do jogador LOCAL, 60 s — só ele vê o mapa aberto): ao revelar, um OLHO dourado se
// abre no alto da tela e apaga em ~1,8 s, a vinheta dourada acende e fica fraca enquanto dura, com o emblema do olho e o
// aro do tempo (pulsando nos últimos 5 s); em cada Centro Cívico dele, uma coluna de luz e um anel dourado que corre pelo
// chão até longe (a visão se espalhando). O mapa revelado é o resto do efeito.
import { Sprite } from 'pixi.js';
import { TICK_RATE } from '../../../core/constants';
import { UNITS } from '../../../core/data';
import type { FxContext, FxWatcher } from '../types';
import { PRIO } from '../../particles';
import { glow, motes, ring } from '../emitters';
import { eyeTexture } from '../screen';
import { TILE } from './util';
import { SpriteSet, easeOut, every, shaft } from './kit';

const R = Math.random;
/** Pulso do fim (últimos 5 s): 0–1, mais rápido perto do fim. */
const endPulse = (left: number, clock: number): number => (left > 5 ? 0 : 0.5 + 0.5 * Math.sin(clock * Math.PI * 2 * (1.1 + (5 - left) * 0.12)));

/** Trégua: vinheta branca, onda na tela ao lançar, halos e centelhas brancas nas tropas. */
export function ceasefireWatcher(): FxWatcher {
  const s = { motes: { acc: 0 }, halo: { acc: 0 }, until: 0, total: 30, castAt: -99, wave: null as Sprite | null };
  const mil: { x: number; y: number }[] = [];
  const clear = () => { s.wave?.destroy(); s.wave = null; };
  return {
    id: 'ceasefire',
    update(fx: FxContext) {
      const st = fx.state, until = st.ceasefireUntil, tick = st.tick;
      // onda de luz branca pela tela (do meio para fora), 1,2 s
      if (s.wave) {
        const t = (fx.clock - s.castAt) / 1.2;
        if (t >= 1) clear();
        else {
          const d = Math.sqrt(fx.screen.w ** 2 + fx.screen.h ** 2) * 0.62 * easeOut(t);
          s.wave.position.set(fx.screen.w / 2, fx.screen.h / 2);
          s.wave.scale.set(Math.max(0.01, d / (0.84 * 32)));
          s.wave.alpha = 0.8 * (1 - t);
        }
      }
      if (until <= tick) return;
      const left = (until - tick) / TICK_RATE;
      mil.length = 0;
      for (const u of st.units.values()) {
        if (u.inside !== -1 || !UNITS[u.type]?.tags.includes('military') || !fx.onScreen(u.x, u.y, 0) || !fx.visibleAt(u.x, u.y)) continue;
        mil.push(u);
      }
      if (until !== s.until) {
        s.until = until;
        // lançamento (ou trégua estendida pelo cenário): a onda, o halo e as centelhas em cada tropa
        if (left > 2) {
          s.castAt = fx.clock; s.total = left;
          clear();
          s.wave = new Sprite(fx.tex.frame('ring')); s.wave.anchor.set(0.5); s.wave.blendMode = 'add'; s.wave.tint = 0xf2f6ff; s.wave.alpha = 0;
          fx.screen.root.addChild(s.wave);
          for (let i = 0; i < Math.min(mil.length, 50); i++) {
            const u = mil[i];
            ring(fx.particles, fx.tex, u.x * TILE, u.y * TILE, 3, 14, 0xf4f7ff, 0.8, 'add', PRIO.power, 0.7);
            motes(fx.particles, fx.tex, u.x * TILE, u.y * TILE, 3, 0xf4f1e6, 5, PRIO.power, 22);
          }
        }
      }
      const since = fx.clock - s.castAt, pulse = endPulse(left, fx.clock);
      const base = since < 1.5 ? 0.42 - 0.2 * (since / 1.5) : 0.22;
      fx.screen.vignette('ceasefire', base + 0.14 * pulse, 0xf1f5ff, 'normal');
      fx.screen.emblem('ceasefire', 'dove', left / Math.max(left, s.total), 0xf4f7ff);
      if (fx.dt <= 0 || !mil.length) return;
      // halo branco macio no pé e centelhas subindo devagar (≈ 0,8 halo/s por tropa, até 40 tropas)
      let n = every(s.halo, Math.min(40, mil.length) * 0.8, fx.dt);
      while (n-- > 0) {
        const u = mil[Math.floor(R() * mil.length)];
        glow(fx.particles, fx.tex, u.x * TILE, u.y * TILE + 1, 0, 17, 0xf2f5ff, 1.4, PRIO.power, 0.42);
      }
      n = every(s.motes, Math.min(10, 2 + mil.length * 0.15), fx.dt);
      while (n-- > 0) {
        const u = mil[Math.floor(R() * mil.length)];
        motes(fx.particles, fx.tex, u.x * TILE, u.y * TILE, 1, 0xf4f1e6, 4, PRIO.power, 14);
      }
    },
    reset() { clear(); s.until = 0; s.total = 30; s.castAt = -99; s.motes.acc = 0; s.halo.acc = 0; },
  };
}

/** Oráculo do jogador local: o olho dourado, a vinheta e a visão se espalhando dos Centros Cívicos. */
export function oracleWatcher(): FxWatcher {
  let seen = -1, eye: Sprite | null = null, t0 = -99, total = 60;
  const set = new SpriteSet();
  const drop = () => { eye?.destroy(); eye = null; set.destroy(); };
  return {
    id: 'oracle',
    update(fx: FxContext) {
      const p = fx.state.players[fx.local], tick = fx.state.tick;
      const until = p?.revealUntil ?? 0;
      if (until > tick && until !== seen) {
        seen = until;
        if ((until - tick) / TICK_RATE > 55) {
          drop();
          t0 = fx.clock; total = (until - tick) / TICK_RATE;
          eye = new Sprite(eyeTexture()); eye.anchor.set(0.5); eye.blendMode = 'add'; eye.tint = 0xffd27a; eye.alpha = 0;
          fx.screen.root.addChild(eye);
          const g = fx.tex.frame('glow');
          for (const b of fx.state.buildings.values()) {
            if (b.owner !== fx.local || b.type !== 'town_center' || !fx.onScreen(b.x, b.y, 18)) continue;
            const x = b.x * TILE, y = b.y * TILE;
            ring(fx.particles, fx.tex, x, y, TILE, 6 * TILE, 0xfff0c0, 1.4, 'add', PRIO.power, 0.7);
            ring(fx.particles, fx.tex, x, y, 2 * TILE, 18 * TILE, 0xffd88a, 2.2, 'add', PRIO.power, 0.45);
            shaft(set, fx.glowLayer, g, fx.clock, x, y + TILE, 5 * TILE, 1.2 * TILE, 0xffdc90, 2.0, 0.7);
            motes(fx.particles, fx.tex, x, y, 18, 0xffe6a8, 2 * TILE, PRIO.power, 40);
          }
        }
      }
      set.update(fx.clock);
      if (eye) {
        const t = fx.clock - t0;
        if (t >= 1.8) { eye.destroy(); eye = null; }
        else {
          // abre (a pálpebra: altura 0 → 1 em 0,3 s), fica e apaga subindo para o emblema
          const open = easeOut(t / 0.3), fade = t < 0.9 ? 1 : 1 - (t - 0.9) / 0.9;
          const w = Math.min(300, Math.max(180, fx.screen.w * 0.2)) / 320;
          const y0 = fx.screen.h * 0.3, y1 = Math.max(92, fx.screen.h * 0.11), k = easeOut(Math.max(0, (t - 0.9) / 0.9));
          eye.position.set(fx.screen.w / 2, y0 + (y1 - y0) * k);
          eye.scale.set(w * (1 - 0.6 * k), w * open * (1 - 0.6 * k));
          eye.alpha = 0.66 * fade;
          eye.visible = fade > 0.01;
        }
      }
      if (until <= tick) return;
      const left = (until - tick) / TICK_RATE, since = fx.clock - t0;
      const a = since < 1.6 ? 0.3 - 0.2 * (since / 1.6) : 0.1;
      fx.screen.vignette('oracle', a + 0.1 * endPulse(left, fx.clock), 0xffc24a, 'add');
      fx.screen.emblem('oracle', 'eye', left / Math.max(left, total), 0xffd27a);
    },
    reset() { drop(); seen = -1; t0 = -99; total = 60; },
  };
}
