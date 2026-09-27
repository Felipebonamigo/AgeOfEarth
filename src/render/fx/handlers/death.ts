// Morte e petrificação (docs/ART.md §1.9; SEM sangue — pergunta 5 do dono e docs/LEGAL.md).
// Morte: com a arte assada, a animação `die` da unidade (direção herdada da vista que sumiu neste quadro —
// FxHost.deathDir), na faixa do y do pé, a partir do tick da morte no relógio de jogo; no fim do efeito vira CADÁVER
// (FxHost.addCorpse, até 8 s). Sem arte do tipo: o sprite procedural deitado, apagando. Quando o corpo bate no chão sai a
// POEIRA da queda, pelo porte (rules/logic: o passo, o cavalo que tomba ao comprido e levanta mais, o cerco que se parte
// em lascas de madeira com restos no chão, a criatura grande que faz o chão tremer e rachar); a sombra de Hades se
// desfaz em fumaça escura em vez de cair.
// Petrificação (olhar da Medusa, 1,5 s): o corpo vira ESTÁTUA — o quadro dele em pedra (fx/stone.ts: cinza de calcário
// com grão e manchas, o sombreado do bake mantido, sem cor de time) num lampejo pálido com pó de pedra —, racha em dois
// estágios (lascas caindo) e no fim ESFARELA de cima para baixo (o recorte da estátua desce; pedras e pó caem da linha
// que se desfaz), deixando um monte de pó e pedrinhas no chão (decalque de escombros tingido de pedra). Sem o quadro em
// pedra (procedural, ou sem DOM), o corpo tingido de cinza afunda e apaga com as mesmas pedras.
import { Container, Sprite, type Texture } from 'pixi.js';
import { UNITS } from '../../../core/data';
import { PLAYER_COLORS } from '../../../core/constants';
import type { VisualEffect } from '../../../core/types';
import type { FxContext, FxHandler } from '../types';
import { UnitView } from '../../views/UnitView';
import { SHADOW_ALPHA } from '../../palette';
import { PRIO } from '../../particles';
import { chips, dust, glow, haze } from '../emitters';
import { gaitOf } from '../logic';
import { unitLook } from '../../art/logic';
import { acquireStone, crop, cropTexture, releaseStone, type StoneSet } from '../stone';
import { FRESH, TILE, dustAt, seenEntity, seenNow } from './util';

/** Estátua (petrificação): conjunto de pedra, o sprite dela, a textura recortada ao esfarelar, estágio mostrado. */
interface Statue { set: StoneSet | null; sprite: Sprite | null; cut: Texture | null; stage: number; chipAcc: number; ended: boolean }
interface S { uv: UnitView | null; proc: Container | null; dusted: boolean; statue: Statue | null; type: string }

const colorOf = (e: VisualEffect): number => PLAYER_COLORS[(e.owner ?? 0) % PLAYER_COLORS.length].num;
/** Cor da pedra (tint do procedural e das pedrinhas). */
const STONE_TINT = 0xb8b2a6;
/** Frações da petrificação: rachaduras (1º e 2º estágio) e início do esfarelar. */
const CRACK1 = 0.3, CRACK2 = 0.52, CRUMBLE = 0.66;

/** Quando o corpo bate no chão (s desde a morte) pelo modo de andar/porte. */
function fallTime(type: string): number {
  const g = gaitOf(type), r = UNITS[type]?.radius ?? 0.3;
  if (type === 'shade') return 0.05;
  if (g === 'hoof') return 0.45;
  if (g === 'wheel') return 0.3;
  return r >= 0.6 ? 0.42 : 0.35;
}

function create(e: VisualEffect, fx: FxContext, age: number): S {
  const type = typeof e.data === 'string' ? e.data : '';
  const s: S = { uv: null, proc: null, dusted: age > FRESH + 0.4, statue: null, type };
  // amaldiçoado (efeito 'curse' no mesmo ponto): não cai nem vira cadáver — o handler da Maldição desenha a transformação
  if (e.type === 'death' && fx.state.effects.some((o) => o.type === 'curse' && Math.abs(o.x - e.x) < 0.01 && Math.abs(o.y - e.y) < 0.01)) { s.dusted = true; return s; }
  // sob a névoa: nem queda, nem estátua, nem cadáver (a petrificação não traz o dono: é o da morte no mesmo ponto)
  const owner = e.owner ?? fx.state.effects.find((o) => o.type === 'death' && o.data === e.data && Math.abs(o.x - e.x) < 0.01 && Math.abs(o.y - e.y) < 0.01)?.owner;
  if (!seenEntity(fx, e.x, e.y, owner)) { s.dusted = true; return s; }
  // (Etapa 6: a voadora cai do céu com a própria queda assada; a hidra, na variante das cabeças que tinha)
  const art = fx.baked && type && UNITS[type] ? fx.host.art.unit(fx.host.deathArt?.(type, e.x, e.y) ?? type) : null;
  const petrify = e.type === 'petrify';
  if (art) {
    // morte de quem foi petrificado: a estátua (efeito 'petrify' no mesmo ponto) substitui a queda
    if (!petrify && fx.state.effects.some((o) => o.type === 'petrify' && o.data === type && Math.abs(o.x - e.x) < 0.01 && Math.abs(o.y - e.y) < 0.01)) { s.dusted = true; return s; }
    const dir = fx.host.deathDir(type, e.x, e.y);
    const uv = new UnitView(art, fx.host.art, type, colorOf(e), fx.host.shadows, dir, unitLook(type, !!UNITS[type].flying));
    if (!petrify) uv.pose('die', dir, fx.clock - age, true);
    else { uv.pose('idle', dir, fx.clock); uv.tick(0, 0); }
    uv.place(e.x * TILE, e.y * TILE);
    uv.root.zIndex = e.y - 0.01;
    fx.host.entityParent('unit', e.y, false).addChild(uv.root);
    s.uv = uv;
    if (petrify) {
      const set = acquireStone(uv.body.texture);
      const st: Statue = { set, sprite: null, cut: null, stage: 0, chipAcc: 0, ended: false };
      if (set) {
        const sp = new Sprite(set.stages[0]);
        sp.anchor.set(uv.body.anchor.x, uv.body.anchor.y);
        sp.scale.x = uv.body.scale.x;
        sp.alpha = age > FRESH ? 1 : 0;
        uv.root.addChild(sp);
        if (uv.team) uv.team.visible = false;
        st.sprite = sp;
      } else uv.tint(0x9ca3af, 0x9ca3af);
      s.statue = st;
    }
  } else if (type && UNITS[type]) {
    const c = new Container();
    const sp = new Sprite(fx.host.tex.unit(type, colorOf(e))); sp.anchor.set(0.5); sp.rotation = petrify ? 0 : 1.2;
    if (petrify) { sp.tint = 0x9ca3af; s.statue = { set: null, sprite: null, cut: null, stage: 0, chipAcc: 0, ended: false }; }
    c.addChild(sp); c.position.set(e.x * TILE, e.y * TILE);
    fx.layer.addChild(c);
    s.proc = c;
  }
  // o olhar da Medusa: lampejo pálido e pó de pedra no instante em que o corpo vira estátua
  if (petrify && age <= FRESH && seenNow(fx, e.x, e.y)) {
    glow(fx.particles, fx.tex, e.x * TILE, e.y * TILE, 12, 14, 0xdfe6d4, 0.3, PRIO.combat, 0.55);
    dust(fx.particles, fx.tex, e.x * TILE, e.y * TILE, { n: 4, tint: 0xc4beb2, spread: 5, speed: 12, scale: 0.35, grow: 2, alpha: 0.5, life: 0.9, rise: 8 });
  }
  return s;
}

/** Poeira da queda (um disparo) pelo porte do tipo. */
function fallDust(fx: FxContext, e: VisualEffect, type: string): void {
  const x = e.x * TILE, y = e.y * TILE, tint = dustAt(fx, e.x, e.y);
  const d = UNITS[type], g = gaitOf(type), r = d?.radius ?? 0.3;
  if (type === 'shade') {   // a sombra de Hades se desfaz em fumaça escura
    haze(fx.particles, fx.tex, x, y, 3, 5, 0x2a2630, { alpha: 0.5, life: 1.2, scale: 0.55, prio: PRIO.combat, rise: 14 });
    return;
  }
  if (g === 'wheel') {   // o cerco se parte: lascas de madeira, poeira e restos no chão
    chips(fx.particles, fx.tex, x, y, 8, 7, 'wood', PRIO.combat, 1.3);
    dust(fx.particles, fx.tex, x, y, { n: 5, tint, spread: 10, speed: 18, scale: 0.55, grow: 2.4, alpha: 0.5, life: 1.3 });
    fx.decal('decal/debris', e.x, e.y, { rot: Math.random() * 6.28, size: 1.3 * TILE, alpha: 0.85, life: 30, tint: 0xc8a47c });
    return;
  }
  if (g === 'hoof') {   // o cavalo tomba ao comprido: poeira em faixa, mais alta
    dust(fx.particles, fx.tex, x, y, { n: 9, tint, spread: 13, speed: 20, scale: 0.6, grow: 2.6, alpha: 0.55, life: 1.4, rise: 8 });
    return;
  }
  if (r >= 0.6) {   // criatura grande (ciclope, colosso, titã): o chão treme
    dust(fx.particles, fx.tex, x, y, { n: Math.round(5 + r * 6), tint, spread: r * TILE, speed: 20 + r * 10, scale: 0.6 + 0.2 * r, grow: 2.6, alpha: 0.55, life: 1.6, rise: 10 });
    if (r >= 1) { fx.shake(5); fx.decal('decal/crack', e.x, e.y, { rot: Math.random() * 6.28, size: r * 2.2 * TILE, alpha: 0.75, life: 30 }); }
    return;
  }
  dust(fx.particles, fx.tex, x, y, { n: 4, tint, spread: 6, speed: 16, scale: 0.45, grow: 2.4, alpha: 0.5, life: 1.2, prio: PRIO.combat });
}

function update(e: VisualEffect, s: S, fx: FxContext, t: number, p: number): void {
  const st = s.statue;
  if (st) { updateStatue(e, s, st, fx, t, p); return; }
  if (s.uv) { s.uv.tick(fx.clock, 0); s.uv.alpha = 1; }
  if (s.proc) s.proc.alpha = 1 - p;
  if (!s.dusted && t >= fallTime(s.type)) {
    s.dusted = true;
    if (seenNow(fx, e.x, e.y)) fallDust(fx, e, s.type);
  }
}

function updateStatue(e: VisualEffect, s: S, st: Statue, fx: FxContext, t: number, p: number): void {
  const seen = seenNow(fx, e.x, e.y);
  const x = e.x * TILE, y = e.y * TILE, top = s.uv?.art.top ?? 20;
  // o corpo vira pedra num instante (0,15 s): a estátua aparece por cima e o corpo some
  if (st.sprite) {
    st.sprite.alpha = Math.min(1, t / 0.15);
    if (st.sprite.alpha >= 1 && s.uv) s.uv.body.visible = false;
    const want = p >= CRACK2 ? 2 : p >= CRACK1 ? 1 : 0;
    if (want !== st.stage && st.set && !st.cut) {
      st.stage = want; st.sprite.texture = st.set.stages[want];
      if (seen && fx.dt > 0) chips(fx.particles, fx.tex, x, y, top * 0.6, want + 1, 'stone', PRIO.combat, 0.5);
    }
  }
  if (p < CRUMBLE) return;
  // esfarela de cima para baixo: o recorte desce, pedras e pó caem da linha que se desfaz
  const k = Math.min(1, (p - CRUMBLE) / (0.97 - CRUMBLE)), cut = k * k * 0.3 + k * 0.7;
  if (st.sprite && st.set) {
    if (!st.cut) { st.cut = cropTexture(st.set); st.sprite.texture = st.cut; }
    crop(st.cut, st.set, cut);
  } else if (s.uv) { s.uv.root.scale.y = 1 - cut * 0.85; s.uv.alpha = 1 - cut * 0.9; }
  else if (s.proc) { s.proc.scale.set(1, 1 - cut * 0.7); s.proc.alpha = 1 - cut; }
  if (s.uv?.shadow) s.uv.shadow.alpha = SHADOW_ALPHA * (1 - cut);
  if (seen && fx.dt > 0) {
    st.chipAcc += fx.dt * 26;
    const n = Math.floor(st.chipAcc); st.chipAcc -= n;
    const z = top * (1 - cut);
    if (n > 0) chips(fx.particles, fx.tex, x, y, z, n, 'stone', PRIO.combat, 0.55);
    if (Math.random() < fx.dt * 9) dust(fx.particles, fx.tex, x, y, { n: 1, tint: 0xc4beb2, spread: 5, speed: 8, scale: 0.4, grow: 2.2, alpha: 0.45, life: 1.1, rise: 5 });
  }
  if (!st.ended && p >= 0.95) {
    st.ended = true;
    if (seen) dust(fx.particles, fx.tex, x, y, { n: 5, tint: 0xc4beb2, spread: 7, speed: 16, scale: 0.5, grow: 2.4, alpha: 0.5, life: 1.4, rise: 6 });
    // o que sobra: um monte de pó e pedrinhas (escombros tingidos de pedra) — some com o tempo
    fx.decal('decal/debris', e.x, e.y, { rot: Math.random() * 6.28, size: 0.95 * TILE, alpha: 0.95, life: 25, tint: STONE_TINT });
  }
}

function destroy(e: VisualEffect, s: S, fx: FxContext, expired: boolean): void {
  if (s.uv) {
    // a queda acabou: o corpo fica no chão (último quadro de 'die') e apaga até CORPSE_TTL; a estátua sai
    if (expired && e.type === 'death' && s.uv.anim === 'die') { s.uv.tick(fx.clock, 0); fx.host.addCorpse(s.uv); }
    else s.uv.destroy();
  }
  if (s.statue) { s.statue.cut?.destroy(false); releaseStone(s.statue.set); }
  s.proc?.destroy({ children: true });
}

export const death: FxHandler<S> = { create, update, destroy };
export const petrify: FxHandler<S> = { create, update, destroy };
/** A vista assada da queda (para o renderizador trocar a escala: FxSystem.recreate). */
export const deathView = (s: unknown): UnitView | null => (s as S | null)?.uv ?? null;
