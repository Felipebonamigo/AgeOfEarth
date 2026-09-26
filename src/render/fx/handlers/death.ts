// Morte e petrificação (docs/ART.md §1.9). Com a arte assada: a animação `die` da unidade (direção herdada da vista que
// sumiu neste quadro — FxHost.deathDir), na faixa do y do pé, a partir do tick da morte no relógio de jogo; no fim do
// efeito vira CADÁVER (FxHost.addCorpse, até 8 s). Petrificada: a estátua (quadro parado em cinza) no lugar da queda,
// apagando. Sem arte do tipo: o sprite procedural deitado, apagando (o de sempre). Nos dois, um pouco de poeira quando o
// corpo bate no chão (≈ 0,35 s) — cinza de pedra na estátua. Sem sangue (pergunta 5).
import { Container, Sprite } from 'pixi.js';
import { UNITS } from '../../../core/data';
import { PLAYER_COLORS } from '../../../core/constants';
import type { VisualEffect } from '../../../core/types';
import type { FxContext, FxHandler } from '../types';
import { UnitView } from '../../views/UnitView';
import { PRIO } from '../../particles';
import { dust } from '../emitters';
import { FRESH, TILE, dustAt, seenNow } from './util';

interface S { uv: UnitView | null; proc: Container | null; dusted: boolean; statue: boolean }

const colorOf = (e: VisualEffect): number => PLAYER_COLORS[(e.owner ?? 0) % PLAYER_COLORS.length].num;

function create(e: VisualEffect, fx: FxContext, age: number): S {
  const type = typeof e.data === 'string' ? e.data : '';
  const s: S = { uv: null, proc: null, dusted: age > FRESH + 0.4, statue: e.type === 'petrify' };
  const art = fx.baked && type && UNITS[type] && !UNITS[type].flying ? fx.host.art.unit(type) : null;
  if (art) {
    // morte de quem foi petrificado: a estátua (efeito 'petrify' no mesmo ponto) substitui a queda
    if (e.type === 'death' && fx.state.effects.some((o) => o.type === 'petrify' && o.data === type && Math.abs(o.x - e.x) < 0.01 && Math.abs(o.y - e.y) < 0.01)) { s.dusted = true; return s; }
    const dir = fx.host.deathDir(type, e.x, e.y);
    const uv = new UnitView(art, fx.host.art, type, colorOf(e), fx.host.shadows, dir);
    if (e.type === 'death') uv.pose('die', dir, fx.clock - age, true);
    else { uv.pose('idle', dir, fx.clock); uv.tick(0, 0); uv.tint(0x9ca3af, 0x9ca3af); }
    uv.place(e.x * TILE, e.y * TILE);
    uv.root.zIndex = e.y - 0.01;
    fx.host.entityParent('unit', e.y, false).addChild(uv.root);
    s.uv = uv;
    return s;
  }
  if (type && UNITS[type]) {
    const c = new Container();
    const sp = new Sprite(fx.host.tex.unit(type, colorOf(e))); sp.anchor.set(0.5); sp.rotation = 1.2;
    if (e.type === 'petrify') sp.tint = 0x9ca3af;
    c.addChild(sp); c.position.set(e.x * TILE, e.y * TILE);
    fx.layer.addChild(c);
    s.proc = c;
  }
  return s;
}

function update(e: VisualEffect, s: S, fx: FxContext, t: number, p: number): void {
  if (s.uv) { if (e.type === 'death') { s.uv.tick(fx.clock, 0); s.uv.alpha = 1; } else s.uv.alpha = 1 - p; }
  if (s.proc) s.proc.alpha = 1 - p;
  if (!s.dusted && t >= (s.statue ? 0.05 : 0.35)) {
    s.dusted = true;
    if (seenNow(fx, e.x, e.y)) dust(fx.particles, fx.tex, e.x * TILE, e.y * TILE, { n: s.statue ? 4 : 3, tint: s.statue ? 0xb8b4ac : dustAt(fx, e.x, e.y), spread: 5, speed: 14, scale: 0.4, grow: 2.2, alpha: 0.45, life: 1, prio: PRIO.combat });
  }
}

function destroy(e: VisualEffect, s: S, fx: FxContext, expired: boolean): void {
  if (s.uv) {
    // a queda acabou: o corpo fica no chão (último quadro de 'die') e apaga até CORPSE_TTL; a estátua sai
    if (expired && e.type === 'death' && s.uv.anim === 'die') { s.uv.tick(fx.clock, 0); fx.host.addCorpse(s.uv); }
    else s.uv.destroy();
  }
  s.proc?.destroy({ children: true });
}

export const death: FxHandler<S> = { create, update, destroy };
export const petrify: FxHandler<S> = { create, update, destroy };
/** A vista assada da queda (para o renderizador trocar a escala: FxSystem.recreate). */
export const deathView = (s: unknown): UnitView | null => (s as S | null)?.uv ?? null;
