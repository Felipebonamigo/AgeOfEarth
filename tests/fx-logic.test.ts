// Funções puras dos efeitos (src/render/fx/logic.ts e light.ts, docs/ART.md Apêndice F): arco e sombra dos projéteis
// pelo contrato de câmera e luz, direção assada + resto, projétil pelo atirador, material do golpe, poeira dos pés pela
// velocidade e pela multidão, e o ciclo de luz (opção desligada por padrão, sem noite fechada).
import { describe, it, expect } from 'vitest';
import { arcHeight, arcPoint, dirAndResidual, dustColor, effectAge, footDustRate, gaitOf, hitMaterial, projectileKind, isEmissive, lerpColor, PROJECTILE_KINDS, SHADOW_PER_HEIGHT, VERTICAL } from '../src/render/fx/logic';
import { DAY_KEYS, DAY_SECONDS, DAY_START, DayCycle, dayLight, lightMatrix } from '../src/render/fx/light';
import { ColorMatrixFilter, Container } from 'pixi.js';
import { TERRAIN } from '../src/core/constants';
import { resolveQuality } from '../src/render/quality';
import { sanitizeSettings, DEFAULT_SETTINGS } from '../src/game/settings';
import { SUN_DIR, VERTICAL_FACTOR } from '../scripts/bake/page/camera.js';

describe('projéteis: arco, sombra e direção', () => {
  it('as constantes batem com o contrato do bake (verticais × cot 50°, sombra pelo SUN_DIR)', () => {
    expect(VERTICAL).toBeCloseTo(VERTICAL_FACTOR, 3);
    expect(SHADOW_PER_HEIGHT.x).toBeCloseTo(-SUN_DIR[0] / SUN_DIR[1], 6);
    expect(SHADOW_PER_HEIGHT.y).toBeCloseTo(-SUN_DIR[2] / SUN_DIR[1], 6);
  });
  it('arco parabólico: sai da origem, cai no alvo, sobe H no meio; sombra no chão para SE, encostando nas pontas', () => {
    const H = arcHeight('arrow', 6);
    expect(H).toBeGreaterThan(0.5);
    const a = arcPoint(10, 10, 16, 10, H, 0), m = arcPoint(10, 10, 16, 10, H, 0.5), b = arcPoint(10, 10, 16, 10, H, 1);
    expect([a.sx, a.sy, a.h]).toEqual([10, 10, 0]);
    expect(b.sx).toBeCloseTo(16, 9); expect(b.sy).toBeCloseTo(10, 9); expect(b.h).toBeCloseTo(0, 9);
    expect(m.h).toBeCloseTo(H, 9);
    expect(m.sy).toBeCloseTo(10 - H * VERTICAL, 9);        // na tela, acima do chão
    expect(m.shx).toBeGreaterThan(m.gx); expect(m.shy).toBeGreaterThan(m.gy);   // sombra a sudeste
    expect([a.shx, a.shy]).toEqual([a.gx, a.gy]);
    // subindo no começo (ângulo acima do horizontal na tela, y para baixo) e descendo no fim
    expect(a.angle).toBeLessThan(0); expect(b.angle).toBeGreaterThan(0);
    expect(Math.abs(m.angle)).toBeLessThan(1e-9);
  });
  it('a pedra sobe mais que a flecha; o teto de altura vale', () => {
    expect(arcHeight('stone', 6)).toBeGreaterThan(arcHeight('arrow', 6));
    expect(arcHeight('arrow', 100)).toBe(1.8);
    expect(arcHeight('stone', 100)).toBe(3.2);
  });
  it('direção assada mais próxima (0 = E, horário) e resto dentro de ±22,5°', () => {
    for (let k = -16; k <= 16; k++) {
      const ang = k * 0.37;
      const { dir, residual } = dirAndResidual(ang);
      expect(dir).toBeGreaterThanOrEqual(0); expect(dir).toBeLessThan(8);
      expect(Math.abs(residual)).toBeLessThanOrEqual(Math.PI / 8 + 1e-9);
      expect(Math.cos(dir * Math.PI / 4 + residual)).toBeCloseTo(Math.cos(ang), 9);
      expect(Math.sin(dir * Math.PI / 4 + residual)).toBeCloseTo(Math.sin(ang), 9);
    }
    expect(dirAndResidual(Math.PI / 2).dir).toBe(2);   // sul
  });
  it('projétil pelo atirador: dardo do peltasta, pedra do cerco, espinho da mantícora, flecha do resto', () => {
    expect(projectileKind('peltast', 'arrow')).toBe('javelin');
    expect(projectileKind('toxotes', 'arrow')).toBe('arrow');
    expect(projectileKind('cretan_archer', 'arrow')).toBe('arrow');
    expect(projectileKind('odysseus', 'arrow')).toBe('arrow');
    expect(projectileKind('petrobolos', 'rock')).toBe('stone');
    expect(projectileKind('helepolis', 'rock')).toBe('stone');
    expect(projectileKind('tower', 'arrow')).toBe('arrow');
    expect(projectileKind('town_center', 'arrow')).toBe('arrow');
    expect(projectileKind('manticore', 'bolt')).toBe('spike');
    expect(projectileKind('centaur', 'bolt')).toBe('arrow');
    expect(projectileKind('medusa', 'bolt')).toBe('bolt');
    expect(projectileKind(undefined, 'rock')).toBe('stone');
    expect(projectileKind(undefined, 'bolt')).toBe('bolt');
    expect(projectileKind(undefined, undefined)).toBe('arrow');
    expect(PROJECTILE_KINDS.filter(isEmissive)).toEqual(['fireball', 'bolt']);
  });
  it('idade do efeito pelo ttl que o núcleo já descontou', () => {
    expect(effectAge({ ttl: 8, total: 8 }, 20)).toBe(0);
    expect(effectAge({ ttl: 5, total: 8 }, 20)).toBeCloseTo(0.15, 9);
  });
});

describe('golpe e poeira', () => {
  it('material do alvo: bronze solta faíscas, madeira e pedra lascas, o resto só poeira (sem sangue)', () => {
    for (const t of ['hoplite', 'hypaspist', 'toxotes', 'hippeus', 'achilles', 'basileus']) expect(hitMaterial(t), t).toBe('metal');
    for (const t of ['house', 'barracks', 'farm', 'petrobolos', 'helepolis']) expect(hitMaterial(t), t).toBe('wood');
    for (const t of ['wall', 'tower', 'temple', 'town_center', 'colossus']) expect(hitMaterial(t), t).toBe('stone');
    for (const t of ['villager', 'militia', 'minotaur', 'cronus', undefined, 'xyz']) expect(hitMaterial(t), String(t)).toBe('flesh');
  });
  it('marcha: passos, cascos e rodas; nada para voadoras, sombras e imóveis', () => {
    expect(gaitOf('hoplite')).toBe('foot'); expect(gaitOf('villager')).toBe('foot');
    expect(gaitOf('hippeus')).toBe('hoof'); expect(gaitOf('kataskopos')).toBe('hoof'); expect(gaitOf('centaur')).toBe('hoof');
    expect(gaitOf('petrobolos')).toBe('wheel');
    expect(gaitOf('pegasus')).toBe('none'); expect(gaitOf('shade')).toBe('none'); expect(gaitOf('sentinel')).toBe('none');
  });
  it('densidade da poeira: cresce com a velocidade (galope ≫ passo), cai com a multidão na tela, zero na água e parado', () => {
    const g = TERRAIN.DIRT;
    expect(footDustRate('foot', 2.4, 1, g)).toBeGreaterThan(0);
    expect(footDustRate('hoof', 4.3, 1, g)).toBeGreaterThan(3 * footDustRate('foot', 2.4, 1, g));
    expect(footDustRate('hoof', 4.3, 1, g)).toBeGreaterThan(footDustRate('hoof', 2.5, 1, g));
    expect(footDustRate('foot', 2.4, 280, g)).toBeCloseTo(footDustRate('foot', 2.4, 1, g) / 10, 9);
    expect(footDustRate('foot', 2.4, 1, TERRAIN.WATER)).toBe(0);
    expect(footDustRate('foot', 0.1, 1, g)).toBe(0);
    expect(footDustRate('none', 5, 1, g)).toBe(0);
    expect(footDustRate('foot', 2.4, 1, TERRAIN.SAND)).toBeGreaterThan(footDustRate('foot', 2.4, 1, TERRAIN.GRASS));
    expect(dustColor(TERRAIN.SAND)).not.toBe(dustColor(TERRAIN.GRASS));
  });
  it('cor interpolada', () => {
    expect(lerpColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(lerpColor(0x102030, 0x102030, 0.3)).toBe(0x102030);
    expect(lerpColor(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });
});

describe('ciclo de luz (opção)', () => {
  it('desligado por padrão (preset e opções salvas); saves antigos sem o campo ficam desligados', () => {
    for (const p of ['auto', 'low', 'medium', 'high'] as const) expect(resolveQuality(p).dayCycle).toBe(false);
    expect(resolveQuality('auto', { dayCycle: true }).dayCycle).toBe(true);
    expect(DEFAULT_SETTINGS.dayCycle).toBe(false);
    expect(sanitizeSettings({}).dayCycle).toBe(false);
    expect(sanitizeSettings({ dayCycle: true }).dayCycle).toBe(true);
  });
  it('meio-dia = matriz identidade (o visual de sempre); a partida começa de manhã; sem noite fechada; contínuo na virada', () => {
    const noon = dayLight((0.4 - DAY_START) * DAY_SECONDS);
    expect(lightMatrix(noon).map((v) => +v.toFixed(6))).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
    expect(dayLight(0).f).toBeCloseTo(DAY_START, 9);
    for (let t = 0; t < DAY_SECONDS; t += 7) { const l = dayLight(t); expect(l.bright).toBeGreaterThanOrEqual(0.75); expect(l.sat).toBeGreaterThanOrEqual(0.79); }
    const dusk = dayLight((0.8 - DAY_START) * DAY_SECONDS);
    expect(dusk.r).toBeGreaterThan(dusk.b);            // entardecer quente
    const blue = dayLight((0.9 - DAY_START) * DAY_SECONDS);
    expect(blue.b).toBeGreaterThan(blue.r);            // hora azul
    const a = dayLight((1 - DAY_START) * DAY_SECONDS - 0.01), b = dayLight((1 - DAY_START) * DAY_SECONDS + 0.01);
    expect(Math.abs(a.r - b.r)).toBeLessThan(1e-3);
    expect(DAY_KEYS[0]).toMatchObject({ r: DAY_KEYS[DAY_KEYS.length - 1].r, g: DAY_KEYS[DAY_KEYS.length - 1].g, b: DAY_KEYS[DAY_KEYS.length - 1].b });
  });
  it('o filtro usa a área da tela (sem medir os limites de todos os filhos: o custo ≤ 0,5 ms) e sai inteiro ao desligar', () => {
    const world = new Container(), dc = new DayCycle(() => ({ matrix: [] }) as unknown as ColorMatrixFilter);
    dc.set(world, true);
    expect(world.filters?.length).toBe(1);
    dc.update(100, { x: 10, y: 20, w: 640, h: 360 });
    expect(world.filterArea).toMatchObject({ x: 10, y: 20, width: 640, height: 360 });
    const m = (world.filters![0] as ColorMatrixFilter).matrix.slice();
    dc.update(100.1, { x: 12, y: 20, w: 640, h: 360 });   // mesma janela de 0,25 s: a cor não muda, a área sim
    expect(world.filterArea!.x).toBe(12);
    expect((world.filters![0] as ColorMatrixFilter).matrix).toEqual(m);
    dc.set(world, false);
    expect(world.filters?.length ?? 0).toBe(0);
    expect(world.filterArea).toBeFalsy();
  });
});

describe('correção de cor do preset Alto (Etapa 9)', () => {
  it('compõe com o ciclo numa matriz só; sem ciclo, a grade é fixa e não muda o cinza médio', async () => {
    const { GRADE, composeMatrix, lightMatrix: lm, lightGrey } = await import('../src/render/fx/light');
    const id = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    expect(composeMatrix(id, lm(GRADE)).map((v) => +v.toFixed(6))).toEqual(lm(GRADE).map((v) => +v.toFixed(6)));
    expect(Math.abs(lightGrey(GRADE, 0.5) - 0.5)).toBeLessThan(0.02);   // brilho médio igual
    const { Container } = await import('pixi.js');
    const world = new Container(), dc = new DayCycle(() => ({ matrix: [] }) as unknown as ColorMatrixFilter);
    dc.set(world, false, true);
    expect(world.filters?.length).toBe(1);
    dc.update(10, { x: 0, y: 0, w: 100, h: 100 });
    const m = (world.filters![0] as ColorMatrixFilter).matrix.slice();
    dc.update(500, { x: 0, y: 0, w: 100, h: 100 });   // sem ciclo: a matriz não anda com o tempo
    expect((world.filters![0] as ColorMatrixFilter).matrix).toEqual(m);
    dc.set(world, true, true);
    expect(world.filters?.length).toBe(1);             // ciclo + grade: ainda um filtro
    dc.set(world, false, false);
    expect(world.filters?.length ?? 0).toBe(0);
  });
});
