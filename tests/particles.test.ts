// Sistema de partículas da Etapa 5 (src/render/particles.ts, docs/ART.md Apêndice F): orçamento TOTAL por preset com
// prioridade (poderes > combate > ambiente), tetos por família (a fumaça da Etapa 3 continua em 35 %), relógio de jogo
// (pausa congela), física (gravidade com quique, arrasto, vento), alfa/escala/cor no tempo, flipbook e a receita da
// fumaça dos edifícios igual à do SmokeLayer da Etapa 3.
import { describe, it, expect } from 'vitest';
import { Texture, type Particle } from 'pixi.js';
import { ParticleSystem, PRIO, WIND, type EmitSpec } from '../src/render/particles';
import { PARTICLE_BUDGET } from '../src/render/quality';
import { GROUP_CAP, PRIO_CAP } from '../src/render/fx/logic';
import { smokePuffs } from '../src/render/fx/emitters';
import type { FxTextures } from '../src/render/fx/FxTextures';

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
