// Registro dos efeitos (docs/ART.md Apêndice F — Etapa 5): todo tipo de VisualEffect que o núcleo (e a interface)
// emite tem handler — nenhum `default` silencioso —, todo TimedEffect tem handler de duração, todo poder de POWERS tem
// de onde tirar a arte, e cada handler roda create/update/destroy numa partida real em Node sem erro.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Container, Texture } from 'pixi.js';
import { POWERS } from '../src/core/data';
import type { VisualEffect } from '../src/core/types';
import { EFFECT_TYPES, TIMED_TYPES, type FxHost } from '../src/render/fx/types';
import { FX_HANDLERS, TIMED_HANDLERS, POWER_ART, handlerFor, makeWatchers } from '../src/render/fx/registry';
import { FxSystem } from '../src/render/fx/FxSystem';
import { resolveQuality } from '../src/render/quality';
import { quickGame } from './helpers';
import { spawnUnit } from '../src/core/sim/entities';

const ROOT = path.resolve(__dirname, '..');
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) out.push(...sources(p)); else if (/\.ts$/.test(f.name)) out.push(p);
  }
  return out;
}
/** Tipos literais de `state.<alvo>.push({ type: '...'` nos fontes de `dirs` (o estado do jogo, não listas locais como
 *  os modificadores de tecnologia em modifiers.ts). */
function pushedTypes(target: 'effects' | 'timed', dirs: string[]): Map<string, string[]> {
  const re = new RegExp(`state\\.${target}\\.push\\(\\{\\s*type:\\s*'([A-Za-z_]+)'`, 'g');
  const out = new Map<string, string[]>();
  for (const d of dirs) for (const f of sources(path.join(ROOT, d))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(re)) { const l = out.get(m[1]) ?? []; l.push(path.relative(ROOT, f)); out.set(m[1], l); }
  }
  return out;
}

describe('registro dos efeitos', () => {
  it('todo tipo de VisualEffect emitido por src/core e src/ui tem handler (nenhum default)', () => {
    const found = pushedTypes('effects', ['src/core', 'src/ui']);
    expect(found.size).toBeGreaterThanOrEqual(16);
    for (const [type, files] of found) {
      expect(handlerFor(type), `${type} (${files.join(', ')}) sem handler em src/render/fx/registry.ts`).toBeDefined();
      expect(EFFECT_TYPES as readonly string[], `${type} fora de EFFECT_TYPES`).toContain(type);
    }
    // e a lista declarada é exatamente a emitida (um tipo novo no núcleo entra nos dois lugares)
    expect([...found.keys()].sort()).toEqual([...EFFECT_TYPES].sort());
    for (const t of EFFECT_TYPES) expect(typeof FX_HANDLERS[t].create).toBe('function');
  });

  it('todo TimedEffect tem handler de duração', () => {
    const found = pushedTypes('timed', ['src/core']);
    expect(found.size).toBeGreaterThan(0);
    for (const type of found.keys()) expect(TIMED_HANDLERS[type as keyof typeof TIMED_HANDLERS], `timed ${type}`).toBeDefined();
    expect([...found.keys()].sort()).toEqual([...TIMED_TYPES].sort());
  });

  it('todo poder de POWERS tem de onde tirar a arte (efeito, efeito com duração ou observador)', () => {
    const watchers = new Set(makeWatchers().map((w) => w.id));
    for (const id of Object.keys(POWERS)) {
      const spec = POWER_ART[id];
      expect(spec, `poder ${id} sem POWER_ART`).toBeTruthy();
      for (const part of spec.split('+')) {
        const [kind, name] = part.split(':');
        if (kind === 'effect') expect(handlerFor(name), `${id}: ${part}`).toBeDefined();
        else if (kind === 'timed') expect(TIMED_HANDLERS[name as keyof typeof TIMED_HANDLERS], `${id}: ${part}`).toBeDefined();
        else if (kind === 'watch') expect(watchers.has(name), `${id}: ${part}`).toBe(true);
        else throw new Error(`${id}: ${part}`);
      }
    }
    expect(Object.keys(POWER_ART).sort()).toEqual(Object.keys(POWERS).sort());
  });

  it('o renderizador não tem mais um switch de efeitos com default: tudo passa pelo registro', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/render/renderer.ts'), 'utf8');
    expect(src).not.toMatch(/case 'hit':|case 'bolt':|switch \(e\.type\)/);
    expect(src).toContain('this.fx.update()');
  });
});

/** Hospedeiro falso: sem arte assada (as quedas e colapsos usam o procedural, com a textura branca). */
function fakeHost(): FxHost {
  const shadows = new Container(), parent = new Container();
  const tex = { unit: () => Texture.WHITE, building: () => Texture.WHITE };
  return {
    art: { unit: () => null, buildingArt: () => null, building: () => null } as unknown as FxHost['art'],
    tex: tex as unknown as FxHost['tex'], shadows,
    entityParent: () => parent, deathDir: () => 2, goneVariant: () => null, addRubble: () => undefined, addCorpse: () => undefined,
  };
}

describe('FxSystem em Node (sem DOM: atlas de reserva vazio → textura branca)', () => {
  it('cada um dos 16 tipos: create → update → destroy sem erro, partículas dentro do orçamento, decalques nascem', () => {
    const st = quickGame();
    st.config.revealMap = true;
    const fx = new FxSystem(() => null);
    fx.setHost(fakeHost());
    fx.setQuality(resolveQuality('high'));
    const cx = st.map.w / 2, cy = st.map.h / 2;
    const u = spawnUnit(st, 0, 'hoplite', cx, cy);
    const mk = (type: string, extra: Partial<VisualEffect> = {}): VisualEffect => ({ type, x: cx, y: cy, ttl: 20, total: 20, ...extra });
    st.effects.push(
      mk('projectile', { tx: cx + 5, ty: cy, data: 'arrow', src: 'toxotes', ttl: 8, total: 8 }), mk('projectile', { tx: cx + 6, ty: cy + 2, data: 'rock', src: 'petrobolos', ttl: 8, total: 8 }),
      mk('hit', { data: 'hoplite', ttl: 6, total: 6 }), mk('hit', { data: 'house', ttl: 6, total: 6 }), mk('splash', { data: 2 }), mk('death', { data: 'hoplite', owner: 1 }),
      mk('petrify', { data: 'villager', ttl: 30, total: 30 }), mk('collapse', { data: 'house', ttl: 30, total: 30 }), mk('nodeGone', { data: 'tree', ttl: 6, total: 6 }),
      mk('spawn', { ttl: 12, total: 12 }), mk('spawn', { ttl: 8, total: 8, data: 'order' }), mk('heal', { data: 8, ttl: 40, total: 40 }), mk('ability', { data: 2, owner: 0 }),
      mk('curse'), mk('pestilence', { data: 10, ttl: 60, total: 60 }), mk('quake', { data: 7, ttl: 100, total: 100 }), mk('titanRise', { ttl: 60, total: 60 }),
      mk('bolt', { ttl: 24, total: 24 }), mk('bronze', { owner: 0, ttl: 10, total: 10 }),
    );
    st.timed.push({ type: 'lightning_storm', owner: 0, until: st.tick + 160, x: cx, y: cy, data: 6 }, { type: 'earthquake', owner: 0, until: st.tick + 100, x: cx, y: cy, data: 7 });
    st.ceasefireUntil = st.tick + 600;
    const view = { x0: 0, y0: 0, x1: st.map.w, y1: st.map.h };
    let shake = 0;
    for (let f = 0; f < 30; f++) {
      fx.beginFrame({ state: st, local: 0, clock: f / 30, dt: 1 / 30, zoom: 1, baked: false, quality: resolveQuality('high'), view, revealAll: true });
      if (f % 3 === 0) fx.footstep({ dust: 0.9 }, 'hippeus', u.x, u.y, 4, 1, 0);
      shake = Math.max(shake, fx.update());
      expect(fx.particles.count).toBeLessThanOrEqual(2000);
    }
    const s = fx.stats();
    expect(s.unknown).toBe(0);
    expect(s.effects).toBe(st.effects.length);
    expect(s.particles).toBeGreaterThan(50);
    expect(s.decals).toBeGreaterThan(0);          // impacto, escombros, rachaduras, queimadura
    expect(shake).toBeGreaterThan(0);             // terremoto/titã/raio
    // o núcleo tira os efeitos: todos saem (destroy) sem erro
    st.effects.length = 0; st.timed.length = 0;
    fx.beginFrame({ state: st, local: 0, clock: 1.1, dt: 1 / 30, zoom: 1, baked: false, quality: resolveQuality('high'), view, revealAll: true });
    fx.update();
    expect(fx.stats().effects).toBe(0);
    fx.reset();
    expect(fx.particles.count).toBe(0);
    expect(fx.decals.count).toBe(0);
    // poeira dos pés: a zoom 1 o galope levanta poeira; com o mapa inteiro na tela (zoom < 0,5) não sai nada
    for (const [zoom, want] of [[0.4, 0], [1, 1]] as const) {
      fx.reset();
      fx.beginFrame({ state: st, local: 0, clock: 2, dt: 1 / 30, zoom, baked: false, quality: resolveQuality('high'), view, revealAll: true });
      fx.footstep({ dust: 0.99 }, 'hippeus', u.x, u.y, 4, 1, 0);
      expect(Math.min(1, fx.particles.groupCount('dust'))).toBe(want);
    }
  });

  it('tipo desconhecido: avisa UMA vez no console e conta (nada de default silencioso)', () => {
    const st = quickGame();
    const fx = new FxSystem(() => null);
    fx.setHost(fakeHost());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    st.effects.push({ type: 'fogos_de_artificio', x: 5, y: 5, ttl: 10, total: 10 });
    for (let f = 0; f < 3; f++) {
      fx.beginFrame({ state: st, local: 0, clock: f / 30, dt: 1 / 30, zoom: 1, baked: false, quality: resolveQuality('medium'), view: { x0: 0, y0: 0, x1: 99, y1: 99 }, revealAll: true });
      fx.update();
    }
    expect(fx.unknown).toBe(3);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('fogos_de_artificio');
    warn.mockRestore();
  });

  it('efeitos fora da vista não emitem partículas (névoa) e golpes antigos não se repetem', () => {
    const st = quickGame();
    const fx = new FxSystem(() => null);
    fx.setHost(fakeHost());
    fx.setQuality(resolveQuality('medium'));
    st.players[0].visibility.fill(0);
    st.effects.push({ type: 'hit', x: 10, y: 10, ttl: 6, total: 6, data: 'hoplite' });
    // golpe velho (ttl já descontado além de FRESH) visível: nada
    st.effects.push({ type: 'hit', x: 12, y: 12, ttl: 1, total: 6, data: 'hoplite' });
    st.players[0].visibility[12 * st.map.w + 12] = 2;
    fx.beginFrame({ state: st, local: 0, clock: 0, dt: 1 / 30, zoom: 1, baked: false, quality: resolveQuality('medium'), view: { x0: 0, y0: 0, x1: 99, y1: 99 }, revealAll: false });
    fx.update();
    expect(fx.particles.count).toBe(0);
  });
});
