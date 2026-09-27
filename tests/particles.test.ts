// Sistema de partículas da Etapa 5 (src/render/particles.ts, docs/ART.md Apêndice F): orçamento TOTAL por preset com
// prioridade (poderes > combate > ambiente), tetos por família (a fumaça da Etapa 3 continua em 35 %), relógio de jogo
// (pausa congela), física (gravidade com quique, arrasto, vento), alfa/escala/cor no tempo, flipbook e a receita da
// fumaça dos edifícios igual à do SmokeLayer da Etapa 3.
import { describe, it, expect } from 'vitest';
import { Container, Particle as PixiParticle, Texture, type Particle } from 'pixi.js';
import { ParticleSystem, PRIO, WIND, setColor, type EmitSpec } from '../src/render/particles';
import { PARTICLE_BUDGET } from '../src/render/quality';
import { GROUP_CAP, PRIO_CAP } from '../src/render/fx/logic';
import { smokePuffs } from '../src/render/fx/emitters';
import type { FxTextures } from '../src/render/fx/FxTextures';
import { DecalLayer } from '../src/render/decals';
import { TILE } from '../src/core/constants';

const T = [Texture.WHITE];
const spec = (o: Partial<EmitSpec> = {}): EmitSpec => ({ frames: T, blend: 'normal', prio: PRIO.ambient, x: 0, y: 0, life: 10, scale0: 1, alpha0: 1, alpha1: 1, ...o });
const fakeTex = { family: () => T, frame: () => T[0], pick: () => T[0] } as unknown as FxTextures;
/** Partícula `i` do lote normal/aditivo (os lotes são reescritos no update; `update(0)` depois de emitir). */
const nth = (ps: ParticleSystem, i = 0, add = false): Particle => (add ? ps.add : ps.normal).particleChildren[i] as Particle;
/** Avança `s` segundos em passos de ≤ 0,25 s (o teto por quadro do sistema). */
const advance = (ps: ParticleSystem, s: number) => { while (s > 1e-9) { const d = Math.min(0.25, s); ps.update(d); s -= d; } };

describe('orçamento e prioridade', () => {
  it('o total nunca passa do orçamento do preset; cada prioridade tem o seu teto', () => {
    for (const budget of PARTICLE_BUDGET) {
      const ps = new ParticleSystem(); ps.budget = budget;
      for (let i = 0; i < budget * 2; i++) ps.emit(spec({ prio: PRIO.ambient }));
      expect(ps.count).toBe(Math.floor(budget * PRIO_CAP[0]));
      for (let i = 0; i < budget * 2; i++) ps.emit(spec({ prio: PRIO.combat }));
      expect(ps.count).toBe(Math.floor(budget * PRIO_CAP[1]));
      for (let i = 0; i < budget * 2; i++) { ps.emit(spec({ prio: PRIO.power })); expect(ps.count).toBeLessThanOrEqual(budget); }
      expect(ps.count).toBe(budget);
      expect(ps.dropped).toBeGreaterThan(0);
    }
  });
  it('cheia, uma prioridade maior toma o lugar da mais VELHA de uma menor (ambiente primeiro), nunca o contrário', () => {
    const ps = new ParticleSystem(); ps.budget = 100;
    for (let i = 0; i < 45; i++) ps.emit(spec({ prio: PRIO.ambient }));
    for (let i = 0; i < 40; i++) ps.emit(spec({ prio: PRIO.combat }));
    expect(ps.count).toBe(85);
    // combate cheio (85 %): mais combate tira ambiente
    ps.emit(spec({ prio: PRIO.combat }));
    expect(ps.countOf(PRIO.ambient)).toBe(44);
    expect(ps.countOf(PRIO.combat)).toBe(41);
    // poderes enchem até 100 % e depois tiram ambiente, e só então combate
    for (let i = 0; i < 15; i++) ps.emit(spec({ prio: PRIO.power }));
    expect(ps.count).toBe(100);
    for (let i = 0; i < 44; i++) ps.emit(spec({ prio: PRIO.power }));
    expect(ps.countOf(PRIO.ambient)).toBe(0);
    expect(ps.countOf(PRIO.combat)).toBe(41);
    ps.emit(spec({ prio: PRIO.power }));
    expect(ps.countOf(PRIO.combat)).toBe(40);
    // ambiente nunca tira ninguém
    expect(ps.emit(spec({ prio: PRIO.ambient }))).toBe(false);
    ps.update(0.01);
    expect(ps.normal.particleChildren.length).toBe(100);
  });
  it('famílias com teto próprio: a fumaça dos edifícios fica em 35 % do total (como smokeBudget da Etapa 3)', () => {
    const ps = new ParticleSystem(); ps.budget = 800;
    let n = 0;
    for (let i = 0; i < 800; i++) if (ps.emit(spec({ group: 'smoke' }))) n++;
    expect(n).toBe(Math.floor(800 * GROUP_CAP.smoke));
    expect(ps.groupCount('smoke')).toBe(280);
    advance(ps, 11);   // morrem todas: o teto da família libera
    expect(ps.groupCount('smoke')).toBe(0);
    expect(ps.emit(spec({ group: 'smoke' }))).toBe(true);
  });
  it('orçamento 0 (efeitos desligados) não emite nada', () => {
    const ps = new ParticleSystem(); ps.budget = 0;
    expect(ps.emit(spec({ prio: PRIO.power }))).toBe(false);
  });
});

describe('relógio de jogo e física', () => {
  it('dt 0 (pausa) congela: nada envelhece nem se move', () => {
    const ps = new ParticleSystem();
    ps.emit(spec({ vx: 10, life: 1 }));
    ps.update(0); ps.update(0);
    expect(ps.count).toBe(1);
    expect(nth(ps).x).toBe(0);
    advance(ps, 0.5);
    expect(nth(ps).x).toBeCloseTo(5, 5);
  });
  it('vida: some ao fim; alfa sobe no fadeIn e vai ao alpha1; escala e cor interpolam', () => {
    const ps = new ParticleSystem();
    ps.emit(spec({ life: 1, alpha0: 0.8, alpha1: 0, fadeIn: 0.2, scale0: 1, scale1: 3, tint: 0x000000, tint1: 0xffffff }));
    ps.update(0);
    const p = nth(ps);
    ps.update(0.1);
    expect(p.alpha).toBeCloseTo(0.4, 5);                // metade do fadeIn
    advance(ps, 0.5);                                    // t = 0,6: (0,6 − 0,2)/0,8 = metade da descida
    expect(p.alpha).toBeCloseTo(0.4, 5);
    expect(p.scaleX).toBeCloseTo(2.2, 5);
    expect(p.tint).toBe(0x999999);
    advance(ps, 0.5);
    expect(ps.count).toBe(0);
  });
  it('gravidade em z: a lasca sobe, cai no mesmo ponto do chão, quica e para', () => {
    const ps = new ParticleSystem();
    ps.emit(spec({ vz: 100, gravity: 400, bounce: 0.3, life: 5 }));
    ps.update(0);
    const p = nth(ps);
    let minY = 0;
    for (let i = 0; i < 200; i++) { ps.update(1 / 60); minY = Math.min(minY, p.y); }
    expect(minY).toBeLessThan(-10);                      // subiu (y da tela = y − z)
    expect(p.y).toBe(0);                                 // voltou ao chão e parou
    expect(p.x).toBe(0);
  });
  it('arrasto reduz a velocidade; vento empurra para leste', () => {
    const a = new ParticleSystem();
    a.emit(spec({ vx: 100, drag: 2 }));
    a.update(0.25); a.update(0.25); a.update(0.25); a.update(0.25);
    expect(nth(a).x).toBeLessThan(100 * 1 * 0.8);
    const b = new ParticleSystem();
    b.emit(spec({ wind: 1 }));
    for (let i = 0; i < 10; i++) b.update(0.1);
    expect(nth(b).x).toBeGreaterThan(0);
    expect(WIND.x).toBeGreaterThan(0);
  });
  it('alinhada à velocidade na tela (faísca) e flipbook em loop pela idade', () => {
    const ps = new ParticleSystem();
    const frames = [Texture.WHITE, Texture.EMPTY, Texture.WHITE, Texture.EMPTY];
    ps.emit(spec({ vx: 10, vy: 10, align: true, blend: 'add' }));
    ps.emit(spec({ frames, fps: 10, life: 5 }));
    ps.update(0.05);
    expect(nth(ps, 0, true).rotation).toBeCloseTo(Math.PI / 4, 5);
    ps.update(0.1);
    expect(nth(ps).texture).toBe(Texture.EMPTY);   // quadro 1 em 0,15 s
  });
  it('rente ao chão: um lote por linha de tiles na faixa ordenada por y (zIndex = meio da linha), que sai quando esvazia', () => {
    const ps = new ParticleSystem();
    // sem faixas (Node, editor sem hospedeiro): vão para os lotes globais
    ps.emit(spec({ ground: true, y: 3 * TILE + 5 })); ps.update(0.01);
    expect(ps.normal.particleChildren.length).toBe(1); expect(ps.bandCount).toBe(0);
    ps.clear();
    const rows = new Map<number, Container>();
    ps.groundParent = (y) => { const r = Math.floor(y / 16); if (!rows.has(r)) rows.set(r, new Container()); return rows.get(r)!; };
    ps.emit(spec({ ground: true, y: 3 * TILE + 5, life: 1 })); ps.emit(spec({ ground: true, blend: 'add', y: 3 * TILE + 20, life: 1 }));
    ps.emit(spec({ ground: true, y: 7 * TILE + 1, life: 2 })); ps.emit(spec({ y: 7 * TILE + 1, life: 2 }));
    ps.update(0.01);
    expect(ps.bandCount).toBe(2);
    expect(ps.normal.particleChildren.length).toBe(1);   // só a que não é rente ao chão
    const row = rows.get(0)!;
    expect(row.children.map((c) => c.zIndex).sort()).toEqual([3.5, 7.5]);
    const band3 = row.children.find((c) => c.zIndex === 3.5)! as Container;
    expect(band3.children.length).toBe(2);   // normal + aditivo
    advance(ps, 1.2);   // a linha 3 apagou: o lote sai da faixa
    expect(ps.bandCount).toBe(1); expect(row.children.map((c) => c.zIndex)).toEqual([7.5]);
    ps.clear(true);
    expect(ps.bandCount).toBe(0); expect(row.children.length).toBe(0);
  });
  it('clear esvazia os dois lotes', () => {
    const ps = new ParticleSystem();
    ps.emit(spec()); ps.emit(spec({ blend: 'add' }));
    ps.update(0.01);
    ps.clear(true);
    expect(ps.count).toBe(0);
    expect(ps.normal.particleChildren.length + ps.add.particleChildren.length).toBe(0);
  });
});

describe('fumaça dos edifícios (Etapa 3 migrada sem mudar de aparência)', () => {
  it('mesma receita: sobe 18–28 px/s, deriva 4–10 px/s para leste, 3–4,8 s, alfa 0,5/0,7, cresce 3,4–4,6×, textura puff', () => {
    const ps = new ParticleSystem(); ps.budget = 800;
    const n = smokePuffs(ps, fakeTex, 50, 0, 100, 0, 20, false);
    expect(n).toBe(50);
    ps.update(0.3);
    for (const p of ps.normal.particleChildren as Particle[]) {
      expect(p.x).toBeGreaterThanOrEqual(0.3 * 4 - 1e-6); expect(p.x).toBeLessThanOrEqual(100 + 0.3 * 10 + 1e-6);
      expect(p.y).toBeLessThan(20);                     // subiu
      expect(p.tint).toBeGreaterThanOrEqual(0x8a8580); expect(p.tint).toBeLessThanOrEqual(0xa19c97);
    }
    // a fumaça escura (dano pesado) é mais escura e mais opaca; teto de 35 % do orçamento
    const d = new ParticleSystem(); d.budget = 100;
    expect(smokePuffs(d, fakeTex, 100, 0, 1, 0, 1, true)).toBe(35);
  });
});

describe('cor direta no lote (integração da Etapa 5)', () => {
  it('setColor grava no `color` do Particle o mesmo que os setters tint + alpha do Pixi (e os getters continuam certos)', () => {
    for (const [c, a] of [[0xffffff, 1], [0x999999, 0.4], [0x2f4fa8, 0.5], [0xa8322f, 0], [0x123456, 0.999], [0xd0a12e, 1.5], [0x5a8a2f, -0.2]] as const) {
      const ref = new PixiParticle({ texture: Texture.WHITE }); ref.tint = c; ref.alpha = a;
      const p = new PixiParticle({ texture: Texture.WHITE }); setColor(p, c, a);
      expect(p.color).toBe(ref.color);
      expect(p.tint).toBe(ref.tint);
      expect(p.alpha).toBe(ref.alpha);
    }
  });
});

describe('decalques sem empilhar (revisão da Etapa 5)', () => {
  it('a mesma família a menos do raio renova a marca que já está no chão (vida, tamanho e alfa maiores) em vez de empilhar', () => {
    const d = new DecalLayer();
    const burn = (x: number, y: number, clock: number, o: { scale?: number; alpha?: number; life?: number } = {}) =>
      d.add({ tex: Texture.WHITE, x, y, blend: 'multiply', key: 'decal/burn', merge: 0.7 * TILE, life: o.life ?? 10, scale: o.scale ?? 1, alpha: o.alpha ?? 0.6 }, clock, true);
    for (let i = 0; i < 12; i++) burn(100 + (i % 3) * 5, 100, i * 0.5);   // a Quimera batendo no mesmo lugar
    expect(d.count).toBe(1);
    burn(100, 100, 6, { scale: 2, alpha: 0.7, life: 10 });
    expect(d.count).toBe(1);
    d.update(15.9, null, 1, true);   // renovada em 6 s com vida 10: ainda viva aos 15,9 s
    expect(d.count).toBe(1);
    expect(d.multiply.particleChildren[0].scaleX).toBe(2);
    d.update(16.1, null, 1, true);
    expect(d.count).toBe(0);
    // longe (≥ 0,7 tile), outra família ou `merge` 0: marcas separadas
    burn(100, 100, 20); burn(100 + TILE, 100, 20);
    d.add({ tex: Texture.WHITE, x: 100, y: 100, blend: 'multiply', key: 'decal/impact', merge: 0.7 * TILE, life: 10 }, 20, true);
    d.add({ tex: Texture.WHITE, x: 100, y: 100, blend: 'multiply', key: 'decal/burn', merge: 0, life: 10 }, 20, true);
    expect(d.count).toBe(4);
  });
});
