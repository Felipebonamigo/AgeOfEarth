// Lote combate-ambiente da Etapa 5 (docs/ART.md Apêndice F): as regras puras (de onde veio o golpe em área, qual herói
// usou a Q, auras, cura, trabalho no posto, margem da água, chão árido, fumaça de trabalho) e os handlers/efeitos
// contínuos rodando em Node (sem DOM: o atlas de reserva vira textura branca e a estátua cai no cinza tingido).
import { describe, it, expect } from 'vitest';
import { Container, Texture } from 'pixi.js';
import { TERRAIN, TICK_RATE } from '../src/core/constants';
import { ABILITIES, UNITS } from '../src/core/data';
import type { GameState, Unit, VisualEffect } from '../src/core/types';
import { spawnUnit, placeBuilding } from '../src/core/sim/entities';
import { FxSystem, type FxAcc } from '../src/render/fx/FxSystem';
import type { FxHost } from '../src/render/fx/types';
import { resolveQuality } from '../src/render/quality';
import {
  AURA, ARID_MIN, SHORE_WET, WORK_STRIKE_PERIOD, abilityHero, aridFraction, auraOf, coastal, effectTick, hasHalo, healGain, nearWater, shoreDistance,
  splashSource, splashStyle, windDustRate, workOf, workSmokeOn,
} from '../src/render/fx/rules';
import { acquireStone, crop, cropTexture, releaseStone, type StoneSet } from '../src/render/fx/stone';
import { quickGame } from './helpers';

function fakeHost(): FxHost {
  const shadows = new Container(), parent = new Container();
  const tex = { unit: () => Texture.WHITE, building: () => Texture.WHITE };
  return {
    art: { unit: () => null, buildingArt: () => null, building: () => null } as unknown as FxHost['art'],
    tex: tex as unknown as FxHost['tex'], shadows,
    entityParent: () => parent, deathDir: () => 2, goneVariant: () => null, addRubble: () => undefined, addCorpse: () => undefined,
  };
}
/** FxSystem em Node com o mapa inteiro "na tela" e revelado; `step` avança um quadro de `dt` s no relógio de jogo. */
function rig(st: GameState, zoom = 1) {
  const fx = new FxSystem(() => null);
  fx.setHost(fakeHost());
  fx.setQuality(resolveQuality('high'));
  let clock = 0;
  const view = { x0: 0, y0: 0, x1: st.map.w, y1: st.map.h };
  const begin = (dt = 1 / 30) => { clock += dt; fx.beginFrame({ state: st, local: 0, clock, dt, zoom, baked: false, quality: resolveQuality('high'), view, revealAll: true }); };
  const step = (dt = 1 / 30) => { begin(dt); return fx.update(); };
  return { fx, step, begin, get clock() { return clock; } };
}
/** Efeito como o núcleo o deixa depois do tick em que nasceu (o cleanup já descontou 1 do ttl e avançou o tick). */
function fresh(st: GameState, e: Omit<VisualEffect, 'ttl'> & { ttl?: number }): VisualEffect {
  return { ...e, ttl: e.total - 1 } as VisualEffect;
}
/** Tile de grama livre perto do centro. */
function spot(st: GameState): { x: number; y: number } {
  const m = st.map;
  for (let r = 0; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = Math.floor(m.w / 2) + dx, y = Math.floor(m.h / 2) + dy, i = y * m.w + x;
    let ok = true;
    for (let yy = y - 3; yy <= y + 3 && ok; yy++) for (let xx = x - 3; xx <= x + 3 && ok; xx++) { const j = yy * m.w + xx; if (m.blocked[j] || m.terrain[j] !== TERRAIN.GRASS) ok = false; }
    if (ok && !m.blocked[i]) return { x: x + 0.5, y: y + 0.5 };
  }
  throw new Error('sem espaço');
}

describe('regras do lote combate-ambiente', () => {
  it('tick de nascimento do efeito, golpe em área pelo atacante e aparência pelo tipo', () => {
    const st = quickGame(); const p = spot(st);
    st.tick = 500;
    const e = fresh(st, { type: 'splash', x: p.x + 1, y: p.y, total: 10, data: 1.6 });
    expect(effectTick(st, e)).toBe(499);
    const chim = spawnUnit(st, 0, 'chimera', p.x, p.y); chim.attackTick = 499;
    const far = spawnUnit(st, 1, 'cronus', p.x + 20, p.y); far.attackTick = 499;   // longe demais
    const old = spawnUnit(st, 1, 'oceanus', p.x + 1.5, p.y); old.attackTick = 480;  // golpe antigo
    expect(splashSource(st, e)?.type).toBe('chimera');
    chim.attackTick = 470;
    expect(splashSource(st, e)).toBeNull();
    const her = spawnUnit(st, 0, 'heracles', p.x + 0.2, p.y); her.attackTick = 499;   // Golpe Titânico (sem splash próprio)
    expect(splashSource(st, e)?.type).toBe('heracles');
    expect(['chimera', 'prometheus', 'oceanus', 'cronus', 'heracles', 'medusa', null].map(splashStyle)).toEqual(['fire', 'fire', 'water', 'slam', 'titanic', 'dust', 'dust']);
  });

  it('herói da Q pela recarga do núcleo, auras e halo', () => {
    const st = quickGame(); const p = spot(st);
    st.tick = 1000;
    const jason = spawnUnit(st, 0, 'jason', p.x, p.y), hera = spawnUnit(st, 0, 'heracles', p.x + 1, p.y);
    const cd = (u: Unit) => ABILITIES[UNITS[u.type].ability!].cooldown * TICK_RATE;
    hera.abilityReadyAt = 999 + cd(hera);           // Héracles usou no tick 999
    jason.abilityReadyAt = 900 + cd(jason);         // Jasão usou antes
    const e = fresh(st, { type: 'ability', x: p.x + 1, y: p.y, total: 20, data: 2, owner: 0 });
    expect(abilityHero(st, e)?.type).toBe('heracles');
    expect(abilityHero(st, { ...e, owner: 1 })).toBeNull();
    // auras pelos buffs
    expect(auraOf(jason, st.tick)).toBe(0);
    jason.buffUntil = st.tick + 100; jason.buffAttack = 1.3; jason.buffWard = true;
    hera.chargeUntil = st.tick + 50;
    expect(auraOf(jason, st.tick)).toBe(AURA.attack | AURA.ward);
    expect(auraOf(hera, st.tick) & AURA.charged).toBeTruthy();
    expect(auraOf(jason, st.tick + 200)).toBe(0);   // expirou
    expect(['jason', 'odysseus', 'heracles', 'achilles', 'perseus'].every(hasHalo)).toBe(true);
    expect(hasHalo('basileus') || hasHalo('hoplite')).toBe(false);
    expect(healGain(undefined, 50)).toBe(0); expect(healGain(50, 40)).toBe(0); expect(healGain(40, 46)).toBe(6);
  });

  it('trabalho no posto: árvore, ouro, fazenda e obra ao alcance; longe não', () => {
    const st = quickGame();
    const tree = [...st.map.nodes.values()].find((n) => n.type === 'tree')!;
    const u = spawnUnit(st, 0, 'villager', tree.x + 0.5, tree.y + 1.6);
    u.state = 'gather'; u.nodeId = tree.id;
    expect(workOf(st, u)).toMatchObject({ kind: 'tree', x: tree.x + 0.5, y: tree.y + 0.5 });
    u.y = tree.y + 4;
    expect(workOf(st, u)).toBeNull();
    const p = spot(st);
    const b = placeBuilding(st, 0, 'house', Math.floor(p.x), Math.floor(p.y), false);
    u.state = 'build'; u.targetId = b.id; u.x = b.tx - 0.4; u.y = b.ty + 0.5;
    const w = workOf(st, u)!;
    expect(w.kind).toBe('build');
    expect(w.x).toBe(b.tx);   // a borda da pegada do lado do cidadão
    b.complete = true;
    expect(workOf(st, u)).toBeNull();
    u.state = 'idle';
    expect(workOf(st, u)).toBeNull();
  });

  it('margem: distância à água pela borda do tile e direção; longe = infinito', () => {
    const st = quickGame(); const m = st.map;
    m.terrain.fill(TERRAIN.GRASS);
    m.terrain[10 * m.w + 11] = TERRAIN.WATER;   // água a leste do tile (10, 10)
    const dir = { x: 0, y: 0 };
    expect(shoreDistance(m, 10.8, 10.5, dir)).toBeCloseTo(0.2, 5);
    expect(dir).toEqual({ x: 1, y: 0 });
    expect(shoreDistance(m, 10.2, 10.5)).toBeCloseTo(0.8, 5);
    expect(shoreDistance(m, 11.5, 10.5)).toBe(0);
    expect(shoreDistance(m, 20.5, 20.5)).toBe(Infinity);
    expect(SHORE_WET).toBeLessThan(0.5);   // quem passa pelo meio do tile da praia não respinga
    // a vizinhança d'água por tile (integração: poeira dos pés e margem só olham os 9 tiles perto d'água) bate com a
    // distância: sem água nos 8 vizinhos, shoreDistance é infinita
    for (let y = 5; y < 16; y++) for (let x = 5; x < 16; x++) expect(nearWater(m, x, y)).toBe(shoreDistance(m, x + 0.5, y + 0.5) < Infinity);
    const c: { ct?: number; coast?: boolean } = {};
    expect(coastal(c, m, 10.8, 10.5)).toBe(true);
    expect(coastal(c, m, 20.5, 20.5)).toBe(false);
    m.terrain[20 * m.w + 21] = TERRAIN.WATER;   // o terreno mudou (editor): o cache vale até o pé trocar de tile
    expect(coastal(c, m, 20.6, 20.4)).toBe(false);
    expect(coastal(c, m, 21.6, 20.4)).toBe(true);
    expect(coastal(c, m, 20.6, 20.4)).toBe(true);
  });

  it('chão árido: fração só dos tiles vistos, vento acima do limiar e do zoom 0,5', () => {
    const st = quickGame(); const m = st.map;
    m.terrain.fill(TERRAIN.GRASS);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) m.terrain[y * m.w + x] = TERRAIN.SAND;
    expect(aridFraction(m, null, true, 0, 0, 19, 19)).toBe(1);
    expect(aridFraction(m, null, true, 20, 20, 39, 39)).toBe(0);
    const vis = new Uint8Array(m.w * m.h);   // nada visto: nada conta
    expect(aridFraction(m, vis, false, 0, 0, 19, 19)).toBe(0);
    expect(windDustRate(ARID_MIN - 0.01, 1200, 1)).toBe(0);
    expect(windDustRate(1, 1200, 0.4)).toBe(0);
    expect(windDustRate(1, 1200, 1)).toBeGreaterThan(5);
    expect(windDustRate(0.6, 1200, 1)).toBeLessThan(windDustRate(1, 1200, 1));
  });

  it('fumaça de trabalho: só com fila, só do time do jogador local (a fila inimiga não vaza), ou tudo revelado', () => {
    const st = quickGame(); const p = spot(st);
    const mine = placeBuilding(st, 0, 'barracks', Math.floor(p.x) - 1, Math.floor(p.y) - 1, true);
    expect(workSmokeOn(st, mine, 0, false)).toBe(false);
    mine.queue.push({ kind: 'unit', id: 'hoplite', elapsed: 0, total: 10 });
    expect(workSmokeOn(st, mine, 0, false)).toBe(true);
    expect(workSmokeOn(st, mine, 1, false)).toBe(false);   // visto pelo inimigo
    expect(workSmokeOn(st, mine, 1, true)).toBe(true);    // espectador/replay
    const house = placeBuilding(st, 0, 'house', Math.floor(p.x) + 4, Math.floor(p.y) + 4, true);
    house.queue.push({ kind: 'unit', id: 'villager', elapsed: 0, total: 10 });
    expect(workSmokeOn(st, house, 0, false)).toBe(false);   // casa não é oficina
  });
});

describe('handlers do lote em Node', () => {
  it('golpe em área: fogo da Quimera (chamas aditivas + queimadura), onda de Oceano, rachadura de Héracles', () => {
    for (const [type, decal] of [['chimera', 'burn'], ['oceanus', 'impact'], ['heracles', 'crack']] as const) {
      const st = quickGame(); const p = spot(st); st.tick = 300;
      const r = rig(st);
      const u = spawnUnit(st, 0, type, p.x - 1, p.y); u.attackTick = 299;
      st.effects.push(fresh(st, { type: 'splash', x: p.x, y: p.y, total: 10, data: type === 'heracles' ? 2 : 1.6 }));
      const shake = r.step();
      expect(r.fx.particles.count, type).toBeGreaterThan(8);
      if (type === 'chimera') expect(r.fx.particles.add.particleChildren.length).toBeGreaterThan(5);   // o fogo emite luz
      if (type === 'heracles') expect(shake).toBeGreaterThan(0);
      expect(r.fx.decals.count, `${type}: ${decal}`).toBeGreaterThan(0);
    }
  });

  it('Q dos heróis: onda no tempo da animação, aliados alcançados brilham; efeito velho não repete', () => {
    const st = quickGame(); const p = spot(st); st.tick = 200;
    const r = rig(st);
    const jason = spawnUnit(st, 0, 'jason', p.x, p.y);
    jason.abilityReadyAt = 199 + ABILITIES.war_cry.cooldown * TICK_RATE;
    for (let i = 0; i < 4; i++) spawnUnit(st, 0, 'hoplite', p.x + 1.5 + i * 0.5, p.y);
    const e = fresh(st, { type: 'ability', x: p.x, y: p.y, total: 20, data: 6, owner: 0 });
    st.effects.push(e);
    r.step(1 / 30);
    const inst = () => [...(r.fx as unknown as { live: Map<VisualEffect, { s: { kind: string; wave: number; reached: Set<number> } }> }).live.values()][0].s;
    expect(inst().kind).toBe('jason');
    expect(inst().wave).toBe(-1);                  // antes do braço no alto (0,2 s)
    for (let f = 0; f < 20; f++) r.step(1 / 30);
    expect(inst().wave).toBeGreaterThanOrEqual(0.2);
    expect(inst().reached.size).toBeGreaterThanOrEqual(4);
    expect(r.fx.particles.countOf(2)).toBeGreaterThan(10);
    // o mesmo efeito visto tarde (troca de arte, volta à tela): nada de onda
    const st2 = quickGame(); st2.tick = 200;
    const r2 = rig(st2);
    const late = { ...e, ttl: 5 };
    st2.effects.push(late);
    for (let f = 0; f < 10; f++) r2.step();
    expect(r2.fx.particles.countOf(2)).toBe(0);
  });

  it('queda: a poeira sai quando o corpo bate no chão (cavalo mais tarde e maior); o cerco se parte em lascas com restos', () => {
    const st = quickGame(); const p = spot(st);
    const r = rig(st);
    st.effects.push(fresh(st, { type: 'death', x: p.x, y: p.y, total: 24, data: 'hippeus', owner: 1 }));
    for (let f = 0; f < 10; f++) r.step(1 / 30);    // ≈ 0,38 s: ainda caindo
    expect(r.fx.particles.count).toBe(0);
    for (let f = 0; f < 4; f++) r.step(1 / 30);     // passou de 0,45 s
    expect(r.fx.particles.count).toBeGreaterThanOrEqual(8);
    const st2 = quickGame(); const p2 = spot(st2);
    const r2 = rig(st2);
    st2.effects.push(fresh(st2, { type: 'death', x: p2.x, y: p2.y, total: 24, data: 'petrobolos', owner: 1 }));
    for (let f = 0; f < 12; f++) r2.step(1 / 30);
    expect(r2.fx.decals.count).toBe(1);             // restos de madeira no chão
    expect(r2.fx.particles.count).toBeGreaterThan(8);
  });

  it('estátua: sem DOM o corpo fica cinza, esfarela afundando com pedras e deixa pó e pedrinhas no chão', () => {
    const st = quickGame(); const p = spot(st);
    const r = rig(st);
    const e = fresh(st, { type: 'petrify', x: p.x, y: p.y, total: 30, data: 'hoplite' });
    st.effects.push(e);
    r.step();
    expect(r.fx.particles.count).toBeGreaterThan(0);   // lampejo e pó de pedra
    let crumbling = false;
    for (let f = 0; f < 44; f++) {
      e.ttl = Math.max(1, 29 - Math.floor((f + 1) * 30 / 45));
      r.step(1 / 30);
      const s = [...(r.fx as unknown as { live: Map<VisualEffect, { s: { proc: Container | null } }> }).live.values()][0]?.s;
      if (s?.proc && s.proc.scale.y < 0.95) crumbling = true;
    }
    expect(crumbling).toBe(true);
    expect(r.fx.decals.count).toBe(1);
    st.effects.length = 0; r.step();
    expect(r.fx.stats().effects).toBe(0);
  });

  it('pedra: sem DOM não há conjunto (null) e o recorte da estátua desce de cima para baixo', () => {
    expect(acquireStone(Texture.WHITE)).toBeNull();
    releaseStone(null);
    const set: StoneSet = { stages: [Texture.WHITE, Texture.WHITE, Texture.WHITE], orig: Texture.WHITE.orig.clone(), trim: Texture.WHITE.orig.clone(), fw: 1, fh: 1, users: 0 };
    set.orig.width = set.orig.height = set.trim.width = set.trim.height = 40;
    set.fw = set.fh = 1;
    const t = cropTexture(set);
    crop(t, set, 0.5);
    expect(t.frame.y).toBeCloseTo(0.5, 5); expect(t.frame.height).toBeCloseTo(0.5, 5);
    expect(t.trim!.y).toBeCloseTo(0.5, 5); expect(t.trim!.height).toBeCloseTo(39.5, 5);
    t.destroy(false);
  });

  it('desabamento e nó esgotado deixam restos no chão; árvore solta folhas da copa', () => {
    const st = quickGame(); const p = spot(st);
    const r = rig(st);
    st.effects.push(fresh(st, { type: 'collapse', x: p.x, y: p.y, total: 30, data: 'barracks' }));
    r.step();
    expect(r.fx.decals.count).toBe(2);   // mancha de pó + escombros
    const n0 = r.fx.particles.count;
    for (let f = 0; f < 10; f++) r.step(1 / 30);
    expect(r.fx.particles.count).toBeGreaterThan(n0 * 0.5);   // pedaços caindo enquanto afunda
    const st2 = quickGame(); const p2 = spot(st2);
    const r2 = rig(st2);
    st2.effects.push(fresh(st2, { type: 'nodeGone', x: p2.x, y: p2.y, total: 6, data: 'tree' }));
    r2.step();
    expect(r2.fx.decals.count).toBe(1);
    expect(r2.fx.particles.count).toBeGreaterThan(20);
  });

  it('projéteis P1: rajada de três espinhos da mantícora; na água, respingo em vez de poeira', () => {
    const st = quickGame(); const p = spot(st);
    const r = rig(st);
    const e = fresh(st, { type: 'projectile', x: p.x - 3, y: p.y, tx: p.x + 2, ty: p.y, total: 8, data: 'arrow', src: 'manticore' });
    st.effects.push(e);
    r.step();
    const s = [...(r.fx as unknown as { live: Map<VisualEffect, { s: { kind: string; parts: unknown[] | null } }> }).live.values()][0].s;
    expect(s.kind).toBe('spike');
    expect(s.parts?.length).toBe(3);
    // cai na água: nenhuma marca no chão, gotas
    st.map.terrain[Math.floor(p.y) * st.map.w + Math.floor(p.x + 2)] = TERRAIN.WATER;
    st.effects.length = 0; r.step();
    expect(r.fx.decals.count).toBe(0);
    expect(r.fx.particles.count).toBeGreaterThan(0);
  });
});

describe('efeitos por unidade e ambiente', () => {
  it('halo dos heróis: um brilho por herói na camada das sombras, some com o herói; nada disso abaixo do zoom 0,5 além do halo', () => {
    const st = quickGame(); const p = spot(st);
    const r = rig(st);
    const hero = spawnUnit(st, 0, 'achilles', p.x, p.y);
    const acc: FxAcc = { dust: 0 };
    for (let f = 0; f < 30; f++) { r.begin(); r.fx.unit(acc, hero, hero.x, hero.y, null); r.fx.update(); }
    const ufx = (r.fx as unknown as { unitFx: { haloCount: number } }).unitFx;
    expect(ufx.haloCount).toBe(1);
    expect(r.fx.particles.count).toBeGreaterThan(0);   // centelhas douradas subindo
    st.units.delete(hero.id);
    r.step();
    expect(ufx.haloCount).toBe(0);
  });

  it('cura: brilho verde quando a vida sobe; a Restauração recente (cura grande) fica com a arte dela', () => {
    const st = quickGame(); const p = spot(st);
    const r = rig(st);
    const u = spawnUnit(st, 0, 'hoplite', p.x, p.y);
    u.hp = 40;
    const acc: FxAcc = { dust: 0 };
    const frame = () => { r.begin(); r.fx.unit(acc, u, u.x, u.y, null); r.fx.update(); };
    frame();
    const counts = (r.fx as unknown as { unitFx: { counts: { heal: number } } }).unitFx.counts;
    expect(counts.heal).toBe(0);
    u.hp = 41; frame();
    expect(counts.heal).toBe(1);
    st.effects.push(fresh(st, { type: 'heal', x: p.x, y: p.y, total: 40, data: 8 }));
    u.hp = u.maxHp; frame();
    expect(counts.heal).toBe(1);   // a Restauração mostra quem curou
  });

  it('coleta sem arte assada: golpe a cada WORK_STRIKE_PERIOD com lascas; na margem, respingo e nenhuma poeira dos pés', () => {
    const st = quickGame();
    const tree = [...st.map.nodes.values()].find((n) => n.type === 'tree')!;
    const r = rig(st);
    const v = spawnUnit(st, 0, 'villager', tree.x + 0.5, tree.y + 1.6);
    v.state = 'gather'; v.nodeId = tree.id;
    const acc: FxAcc = { dust: 0 };
    const counts = (r.fx as unknown as { unitFx: { counts: { strike: number; shore: number } } }).unitFx.counts;
    // 12 golpes: cada um solta lascas com chance WORK_CHIP_CHANCE (0,6; Math.random no renderizador) — com 2 golpes o
    // teste falhava 16 % das vezes (0,4²); com 12, ~2·10⁻⁵
    for (let f = 0; f < Math.ceil(WORK_STRIKE_PERIOD * 30 * 12); f++) { r.begin(); r.fx.unit(acc, v, v.x, v.y, null); r.fx.update(); }
    expect(counts.strike).toBeGreaterThanOrEqual(1);
    // margem: um tile de água logo ao norte, a unidade andando rente a ele
    const st2 = quickGame(); const p = spot(st2); const m = st2.map;
    const ty = Math.floor(p.y);
    for (let x = Math.floor(p.x) - 3; x <= Math.floor(p.x) + 3; x++) m.terrain[(ty - 1) * m.w + x] = TERRAIN.WATER;
    const r2 = rig(st2);
    const h = spawnUnit(st2, 0, 'hoplite', p.x, ty + 0.2);
    const acc2: FxAcc = { dust: 0.99 };
    const c2 = (r2.fx as unknown as { unitFx: { counts: { shore: number } } }).unitFx.counts;
    for (let f = 0; f < 30; f++) {
      h.px = h.x; h.x += 0.12; h.py = h.y;
      r2.begin(); r2.fx.footstep(acc2, 'hoplite', h.x, h.y, 2.4, 1, 0); r2.fx.unit(acc2, h, h.x, h.y, null); r2.fx.update();
    }
    expect(c2.shore).toBeGreaterThan(0);
    expect(r2.fx.particles.groupCount('dust')).toBe(0);
  });

  it('vento: rajadas de poeira só em chão árido à vista; fumaça de trabalho só de quem produz', () => {
    const st = quickGame(); const m = st.map;
    m.terrain.fill(TERRAIN.SAND);
    const r = rig(st);
    for (let f = 0; f < 60; f++) r.step(1 / 30);
    const amb = (r.fx as unknown as { ambient: { counts: { wind: number; smoke: number } } }).ambient.counts;
    expect(amb.wind).toBeGreaterThan(0);
    const st2 = quickGame(); st2.map.terrain.fill(TERRAIN.GRASS);
    const r2 = rig(st2);
    for (let f = 0; f < 60; f++) r2.step(1 / 30);
    const amb2 = (r2.fx as unknown as { ambient: { counts: { wind: number; smoke: number } } }).ambient.counts;
    expect(amb2.wind).toBe(0);
    const p = spot(st2);
    const b = placeBuilding(st2, 0, 'barracks', Math.floor(p.x) - 1, Math.floor(p.y) - 1, true);
    const acc: FxAcc = { dust: 0 };
    for (let f = 0; f < 30; f++) { r2.begin(); r2.fx.building(acc, b, null); r2.fx.update(); }
    expect(amb2.smoke).toBe(0);
    b.queue.push({ kind: 'unit', id: 'hoplite', elapsed: 0, total: 10 });
    for (let f = 0; f < 30; f++) { r2.begin(); r2.fx.building(acc, b, null); r2.fx.update(); }
    expect(amb2.smoke).toBeGreaterThan(0);
    expect(r2.fx.particles.groupCount('smoke')).toBeGreaterThan(0);
  });
});
