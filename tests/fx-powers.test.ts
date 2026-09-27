// Arte dos poderes (lote poderes-luz da Etapa 5, docs/ART.md Apêndice F): o caminho do raio, o surgimento divino pelo
// que nasceu no ponto, a Maldição sem queda nem cadáver, os observadores de duração (peste, bronze, trégua, oráculo) e
// do lançamento (Maldição), a camada de tela (clarão, vinhetas), o orçamento com todos os poderes ao mesmo tempo e o
// ciclo de luz (amanhecer × entardecer, legível o dia inteiro).
import { describe, it, expect } from 'vitest';
import { Container, Texture } from 'pixi.js';
import type { GameState, VisualEffect } from '../src/core/types';
import { TICK_RATE } from '../src/core/constants';
import { FxSystem, type FxFrame } from '../src/render/fx/FxSystem';
import type { FxHost } from '../src/render/fx/types';
import { resolveQuality } from '../src/render/quality';
import { boltAlpha, boltPath } from '../src/render/fx/handlers/bolt';
import { summonKind } from '../src/render/fx/handlers/summon';
import { freshCasts } from '../src/render/fx/handlers/curse';
import { ScreenFx } from '../src/render/fx/screen';
import { DAY_SECONDS, DAY_START, dayLight, lightGrey, lightMatrix } from '../src/render/fx/light';
import { addNode } from '../src/core/map/mapgen';
import { placeBuilding, spawnUnit } from '../src/core/sim/entities';
import { quickGame } from './helpers';

function fakeHost(): FxHost {
  const shadows = new Container(), parent = new Container();
  const tex = { unit: () => Texture.WHITE, building: () => Texture.WHITE };
  return {
    art: { unit: () => null, buildingArt: () => null, building: () => null } as unknown as FxHost['art'],
    tex: tex as unknown as FxHost['tex'], shadows,
    entityParent: () => parent, deathDir: () => 2, goneVariant: () => null, goneSeen: () => false, addRubble: () => undefined, addCorpse: () => undefined,
  };
}
/** FxSystem em Node sobre `st` (tudo à vista), com um passo de quadro. */
function system(st: GameState, level: 'low' | 'medium' | 'high' = 'high') {
  st.config.revealMap = true;
  const fx = new FxSystem(() => null);
  fx.setHost(fakeHost());
  const q = resolveQuality(level);
  fx.setQuality(q);
  let clock = 0;
  const frame = (dt = 1 / 30, local = 0): number => {
    clock += dt;
    const f: FxFrame = { state: st, local, clock, dt, zoom: 1, baked: false, quality: q, view: { x0: 0, y0: 0, x1: st.map.w, y1: st.map.h }, revealAll: true, screenW: 1280, screenH: 720 };
    fx.beginFrame(f);
    return fx.update();
  };
  return { fx, frame };
}
const sprites = (fx: FxSystem) => (fx as unknown as { sprites: Container }).sprites.children.length;
const glowKids = (fx: FxSystem) => (fx as unknown as { glow: Container }).glow.children.length;

describe('raio', () => {
  it('o canal desce do céu ao ponto exato, em 2^5 segmentos, com galhos abrindo para baixo', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let k = 0; k < 20; k++) {
      const p = boltPath(500, 800, 400, rnd, 3);
      expect(p.main.length).toBe(66);
      expect(p.main[65]).toBe(800); expect(p.main[64]).toBe(500);
      expect(p.main[1]).toBeCloseTo(400, 6);
      expect(p.branches.length).toBeGreaterThanOrEqual(3);
      for (const b of [p.main, ...p.branches]) for (const v of b) expect(Number.isFinite(v)).toBe(true);
      for (const b of p.branches) expect(b[b.length - 1]).toBeGreaterThan(b[1]);   // o galho termina mais embaixo que começa
    }
  });
  it('a descarga: líder fraco, retorno aceso, re-descargas com vales e apaga até ~1,2 s', () => {
    const pat = [1, 0.2, 0.8, 0.15, 0.85];
    expect(boltAlpha(0.03, pat)).toBe(0.5);
    expect(boltAlpha(0.07, pat)).toBe(1);
    expect(boltAlpha(0.06 + 0.065 * 1.5, pat)).toBe(0.2);
    expect(boltAlpha(1.2, pat)).toBe(0);
  });
  it('Raio de Zeus: canal de sprites aditivos, clarão na tela, queimadura; tudo sai no fim', () => {
    const st = quickGame();
    const { fx, frame } = system(st);
    const e: VisualEffect = { type: 'bolt', x: 20, y: 20, ttl: 24, total: 24 };
    st.effects.push(e);
    frame();
    expect(glowKids(fx)).toBeGreaterThanOrEqual(3 * 32);
    expect(fx.screen.flashAlpha).toBeGreaterThan(0.1);
    expect(fx.decals.count).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 20; i++) frame();
    expect(fx.screen.flashAlpha).toBe(0);
    st.effects.length = 0; frame();
    expect(glowKids(fx)).toBe(0);
  });
});

describe('queimaduras (revisão da Etapa 5: nada de poça preta)', () => {
  it('Tempestade: só o raio que acerta alguém queima o chão (curto); a Quimera no mesmo lugar renova, não empilha; alfa ≤ 0,7', () => {
    const st = quickGame();
    const { fx, frame } = system(st);
    const u = spawnUnit(st, 1, 'hoplite', 30.5, 30.5);
    // erro (ponto sorteado longe de todos) e acerto (no ponto da unidade), raios da Tempestade (ttl 16)
    st.effects.push({ type: 'bolt', x: 12.3, y: 40.7, ttl: 16, total: 16 }, { type: 'bolt', x: u.x, y: u.y, ttl: 16, total: 16 });
    frame();
    const keys = (fx.decals as unknown as { list: { key: string; a: number; life: number }[] }).list;
    expect(keys.filter((k) => k.key === 'decal/burn').length).toBe(1);
    expect(keys.filter((k) => k.key === 'decal/impact').length).toBe(2);
    expect(Math.max(...keys.map((k) => k.life))).toBeLessThanOrEqual(12);
    st.effects.length = 0; frame();
    const n0 = fx.decals.count;
    // o Raio de Zeus no mesmo ponto: renova a queimadura que já está lá
    st.effects.push({ type: 'bolt', x: u.x, y: u.y, ttl: 24, total: 24 }); frame();
    expect(keys.filter((k) => k.key === 'decal/burn').length).toBe(1);
    expect(fx.decals.count).toBe(n0);
    for (const k of keys) if (k.key === 'decal/burn') expect(k.a).toBeLessThanOrEqual(0.7);
  });
});

describe('surgimentos divinos e Maldição', () => {
  it('o que nasceu no ponto decide a arte: isca, cornucópia, sentinela ou reforço', () => {
    const st = quickGame(), m = st.map;
    // um tile livre (sem nó nem edifício) com os 3×3 em volta também livres
    const free = (skip: number): { x: number; y: number } => {
      let k = 0;
      for (let y = 4; y < m.h - 4; y++) for (let x = 4; x < m.w - 4; x++) {
        let ok = true;
        for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) { const i = (y + dy) * m.w + x + dx; if (m.nodeAt[i] !== -1 || m.buildingAt[i] !== -1 || m.blocked[i]) { ok = false; break; } }
        if (ok && k++ >= skip) return { x, y };
      }
      throw new Error('sem tile livre');
    };
    const a = free(0);
    expect(addNode(m, 'lure', a.x, a.y, 800)).toBeTruthy();
    expect(summonKind(st, { x: a.x + 0.5, y: a.y + 0.5 })).toBe('lure');
    const b = free(40);
    placeBuilding(st, 0, 'cornucopia', b.x - 1, b.y - 1, true);
    expect(summonKind(st, { x: b.x, y: b.y })).toBe('plenty');
    const c = free(80);
    spawnUnit(st, 0, 'sentinel', c.x + 0.5, c.y + 0.5);
    expect(summonKind(st, { x: c.x + 0.5, y: c.y + 0.5 })).toBe('sentinel');
    const d = free(120);
    expect(summonKind(st, { x: d.x + 0.5, y: d.y + 0.5 })).toBe('divine');
  });
  it('amaldiçoado não cai nem vira cadáver: só a transformação (a queda de uma morte comum continua)', () => {
    const st = quickGame();
    const { fx, frame } = system(st);
    st.effects.push({ type: 'death', x: 12, y: 12, owner: 1, ttl: 24, total: 24, data: 'hoplite' }, { type: 'curse', x: 12, y: 12, ttl: 20, total: 20 });
    frame();
    expect(sprites(fx)).toBe(1);   // o hoplita encolhendo da Maldição, sem a queda da morte
    st.effects.push({ type: 'death', x: 18, y: 12, owner: 1, ttl: 24, total: 24, data: 'hoplite' });
    frame();
    expect(sprites(fx)).toBe(2);   // morte comum: a queda
  });
  it('o lançamento de um poder de área é visto uma vez só e só enquanto novo (≤ 1 s)', () => {
    const st = quickGame();
    const seen = new WeakSet<GameState['events'][number]>();
    st.events.push({ tick: st.tick, type: 'powerUsed', player: 0, x: 5, y: 5, data: 'curse' }, { tick: st.tick, type: 'powerUsed', player: 0, x: 5, y: 5, data: 'bolt' });
    expect(freshCasts(st, seen, 'curse').length).toBe(1);
    expect(freshCasts(st, seen, 'curse').length).toBe(0);
    const old = quickGame(); old.tick = 100;
    old.events.push({ tick: 50, type: 'powerUsed', player: 0, x: 5, y: 5, data: 'curse' });
    expect(freshCasts(old, new WeakSet(), 'curse').length).toBe(0);
  });
});

describe('duração dos poderes (observadores)', () => {
  it('peste: miasma e moscas só sobre o edifício parado por ela, e param quando ela acaba', () => {
    const st = quickGame();
    const { fx, frame } = system(st);
    const b = placeBuilding(st, 1, 'barracks', 20, 20, true);
    for (let i = 0; i < 30; i++) frame();
    expect(fx.particles.count).toBe(0);
    b.disabledUntil = st.tick + 60 * TICK_RATE;
    for (let i = 0; i < 30; i++) frame();
    expect(fx.particles.countOf(2)).toBeGreaterThan(10);
    b.disabledUntil = st.tick;
    fx.reset(); for (let i = 0; i < 30; i++) frame();
    expect(fx.particles.count).toBe(0);
  });
  it('bronze: reflexos (aditivos) só nas unidades de quem tem o bronze ativo', () => {
    const st = quickGame();
    const { fx, frame } = system(st);
    for (let i = 0; i < 6; i++) { spawnUnit(st, 0, 'hoplite', 20 + i, 20); spawnUnit(st, 1, 'hoplite', 20 + i, 24); }
    for (let i = 0; i < 30; i++) frame();
    expect(fx.particles.add.particleChildren.length).toBe(0);
    st.players[0].bronzeUntil = st.tick + 45 * TICK_RATE;
    for (let i = 0; i < 30; i++) frame();
    const n = fx.particles.add.particleChildren.length;
    expect(n).toBeGreaterThan(2);
    // cada reflexo nasce no corpo de uma unidade do dono (acima do pé dela), nunca nas do outro jogador
    const mine = [...st.units.values()].filter((u) => u.owner === 0);
    for (const p of fx.particles.add.particleChildren) {
      expect(mine.some((u) => Math.abs(p.x - u.x * 32) < 16 && p.y <= u.y * 32 + 4 && p.y > u.y * 32 - 60)).toBe(true);
    }
  });
  it('trégua: onda e vinheta na tela enquanto dura, e a vinheta apaga depois', () => {
    const st = quickGame();
    const { fx, frame } = system(st);
    for (let i = 0; i < 4; i++) spawnUnit(st, 0, 'hoplite', 20 + i, 20);
    st.ceasefireUntil = st.tick + 30 * TICK_RATE;
    for (let i = 0; i < 20; i++) frame();
    expect(fx.screen.vignetteAlpha('ceasefire')).toBeGreaterThan(0.1);
    expect(fx.screen.root.children.length).toBeGreaterThanOrEqual(2);   // onda + vinheta
    expect(fx.particles.countOf(2)).toBeGreaterThan(0);                  // halos e centelhas nas tropas
    st.ceasefireUntil = st.tick;
    for (let i = 0; i < 90; i++) frame();
    expect(fx.screen.vignetteAlpha('ceasefire')).toBe(0);
  });
  it('oráculo: o olho e a vinheta dourada só para o jogador LOCAL que revelou', () => {
    const st = quickGame();
    const { fx, frame } = system(st);
    st.players[1].revealUntil = st.tick + 60 * TICK_RATE;
    for (let i = 0; i < 10; i++) frame(1 / 30, 0);
    expect(fx.screen.vignetteAlpha('oracle')).toBe(0);
    st.players[0].revealUntil = st.tick + 60 * TICK_RATE;
    for (let i = 0; i < 10; i++) frame(1 / 30, 0);
    expect(fx.screen.vignetteAlpha('oracle')).toBeGreaterThan(0.1);
    expect(fx.screen.root.children.length).toBeGreaterThanOrEqual(2);   // olho + vinheta
    fx.reset();
    expect(fx.screen.root.children.length).toBe(0);
  });
});

describe('camada de tela', () => {
  it('clarão: o maior pedido vence, congela na pausa e decai sozinho; vinheta vai ao alvo e apaga sem pedido', () => {
    const s = new ScreenFx();
    s.flash(0.2); s.flash(0.1);
    expect(s.flashAlpha).toBe(0.2);
    s.update(0, 800, 600);
    expect(s.flashAlpha).toBe(0.2);
    for (let i = 0; i < 20; i++) s.update(1 / 30, 800, 600);
    expect(s.flashAlpha).toBe(0);
    for (let i = 0; i < 60; i++) { s.vignette('x', 0.3, 0xffffff); s.update(1 / 30, 800, 600); }
    expect(s.vignetteAlpha('x')).toBeGreaterThan(0.28);
    for (let i = 0; i < 90; i++) s.update(1 / 30, 800, 600);
    expect(s.vignetteAlpha('x')).toBe(0);
  });
});

describe('orçamento com todos os poderes ao mesmo tempo', () => {
  for (const [level, budget] of [['low', 800], ['high', 2000]] as const) {
    it(`preset ${level}: nunca passa de ${budget} partículas`, () => {
      const st = quickGame();
      const { fx, frame } = system(st, level);
      const cx = st.map.w / 2, cy = st.map.h / 2;
      for (let i = 0; i < 40; i++) { spawnUnit(st, 0, 'hoplite', cx - 6 + (i % 8), cy - 3 + Math.floor(i / 8)); spawnUnit(st, 1, 'hoplite', cx + 2 + (i % 8), cy - 3 + Math.floor(i / 8)); }
      const bar = placeBuilding(st, 1, 'barracks', Math.floor(cx) + 4, Math.floor(cy) + 4, true);
      bar.disabledUntil = st.tick + 60 * TICK_RATE;
      st.players[0].bronzeUntil = st.tick + 45 * TICK_RATE;
      st.players[0].revealUntil = st.tick + 60 * TICK_RATE;
      st.ceasefireUntil = st.tick + 30 * TICK_RATE;
      const mk = (type: string, extra: Partial<VisualEffect> = {}): VisualEffect => ({ type, x: cx, y: cy, ttl: 20, total: 20, ...extra });
      st.events.push({ tick: st.tick, type: 'powerUsed', player: 0, x: cx, y: cy, data: 'restoration' }, { tick: st.tick, type: 'powerUsed', player: 0, x: cx, y: cy, data: 'curse' });
      st.effects.push(mk('heal', { data: 8, ttl: 40, total: 40 }), mk('pestilence', { data: 10, ttl: 60, total: 60 }), mk('quake', { data: 7, ttl: 100, total: 100 }), mk('titanRise', { ttl: 60, total: 60 }),
        mk('bolt', { ttl: 24, total: 24 }), mk('bolt', { x: cx + 3, ttl: 16, total: 16 }), mk('bronze', { owner: 0, ttl: 10, total: 10 }), mk('spawn'), mk('curse'));
      st.timed.push({ type: 'lightning_storm', owner: 0, until: st.tick + 160, x: cx, y: cy, data: 6 }, { type: 'earthquake', owner: 0, until: st.tick + 100, x: cx, y: cy, data: 7 });
      let peak = 0;
      for (let f = 0; f < 150; f++) {
        if (f % 2 === 0) st.tick++;   // os pulsos do terremoto e os observadores andam com o tick
        frame();
        peak = Math.max(peak, fx.particles.count);
        expect(fx.particles.count).toBeLessThanOrEqual(budget);
      }
      expect(peak).toBeGreaterThan(budget * 0.3);
      expect(fx.stats().unknown).toBe(0);
    });
  }
});

describe('ciclo de luz: amanhecer × entardecer, legível o dia inteiro', () => {
  const at = (f: number) => dayLight((f - DAY_START) * DAY_SECONDS);
  it('amanhecer enevoado de sombras azuladas; entardecer quente de sombras violáceas; crepúsculo azul', () => {
    const dawn = at(0.02), dusk = at(0.8), blue = at(0.9);
    expect(dawn.lb).toBeGreaterThan(dawn.lr);          // sombra azulada
    expect(dawn.con).toBeLessThan(1);                   // névoa: menos contraste
    expect(dusk.r - dusk.b).toBeGreaterThan(0.3);       // luz alaranjada
    expect(dusk.con).toBeGreaterThan(1);
    expect(blue.b).toBeGreaterThan(blue.r);
    // distintos de verdade: a cor de um cinza médio muda de lado
    const g = (l: ReturnType<typeof at>) => { const m = lightMatrix(l); return [0, 1, 2].map((r) => (m[r * 5] + m[r * 5 + 1] + m[r * 5 + 2]) * 0.3 + m[r * 5 + 4]); };
    const [dr, , db] = g(dawn), [sr, , sb] = g(dusk);
    expect(sr - sb).toBeGreaterThan(dr - db + 0.05);
  });
  it('nenhuma hora escurece um cinza médio abaixo de 72 % do meio-dia nem estoura o branco', () => {
    for (let t = 0; t < DAY_SECONDS; t += 5) {
      const l = dayLight(t);
      expect(lightGrey(l, 0.5)).toBeGreaterThanOrEqual(0.5 * 0.72);
      expect(lightGrey(l, 0.9)).toBeLessThanOrEqual(1.02);
    }
  });
});
