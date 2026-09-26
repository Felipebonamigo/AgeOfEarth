// Decalques do chão (src/render/decals.ts, docs/ART.md Apêndice F): teto por preset (sai o mais velho), vida com
// desvanecimento no relógio de JOGO, névoa (não aparece em área nunca vista nem revela o que aconteceu fora da vista:
// só depois que o tile é VISTO) e limpeza por retângulo (editor).
import { describe, it, expect } from 'vitest';
import { Texture, type Particle } from 'pixi.js';
import { DecalLayer } from '../src/render/decals';
import { DECAL_CAP } from '../src/render/fx/logic';
import { TILE } from '../src/core/constants';

const W = 10, H = 10;
const vis = (v = 0) => new Uint8Array(W * H).fill(v);
const add = (d: DecalLayer, tx: number, ty: number, clock = 0, seen = true, life = 10, blend: 'multiply' | 'normal' = 'multiply') =>
  d.add({ tex: Texture.WHITE, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, life, fade: 0.2, alpha: 0.8, blend }, clock, seen);
const all = (d: DecalLayer): Particle[] => [...d.multiply.particleChildren, ...d.normal.particleChildren] as Particle[];

describe('decalques', () => {
  it('teto por preset: com o teto cheio sai o mais velho', () => {
    expect([...DECAL_CAP]).toEqual([48, 128, 256]);
    const d = new DecalLayer(); d.cap = 3;
    for (let i = 0; i < 5; i++) add(d, i, 0, i * 0.1);
    d.update(0.5, vis(2), W, false);
    expect(d.count).toBe(3);
    expect(all(d).map((p) => Math.floor(p.x / TILE)).sort()).toEqual([2, 3, 4]);
    d.cap = 0; add(d, 1, 1);
    expect(d.count).toBe(3);
  });
  it('vida e desvanecimento no relógio de jogo; relógio que volta (replay) remove', () => {
    const d = new DecalLayer();
    add(d, 1, 1, 0, true, 10);
    d.update(5, vis(2), W, false);
    expect(all(d)[0].alpha).toBeCloseTo(0.8, 5);
    d.update(9, vis(2), W, false);                 // t = 0,9: metade do fade final (20 %)
    expect(all(d)[0].alpha).toBeCloseTo(0.4, 5);
    d.update(10.01, vis(2), W, false);
    expect(d.count).toBe(0);
    add(d, 1, 1, 5);
    d.update(4, vis(2), W, false);
    expect(d.count).toBe(0);
  });
  it('névoa: nunca visto = invisível; aparece quando o tile é VISTO depois e fica (mesmo sob a névoa explorada)', () => {
    const d = new DecalLayer();
    add(d, 3, 3, 0, false);
    const v = vis(0);
    d.update(1, v, W, false);
    expect(all(d)[0].alpha).toBe(0);
    v[3 * W + 3] = 1;                               // explorado mas fora de vista: ainda não
    d.update(2, v, W, false);
    expect(all(d)[0].alpha).toBe(0);
    v[3 * W + 3] = 2;                               // à vista: aparece
    d.update(3, v, W, false);
    expect(all(d)[0].alpha).toBeCloseTo(0.8, 5);
    v[3 * W + 3] = 1;                               // saiu da vista: continua (o jogador já viu)
    d.update(4, v, W, false);
    expect(all(d)[0].alpha).toBeCloseTo(0.8, 5);
    // espectador/mapa revelado: aparece já
    const e = new DecalLayer(); add(e, 5, 5, 0, false); e.update(1, vis(0), W, true);
    expect(all(e)[0].alpha).toBeCloseTo(0.8, 5);
  });
  it('multiply (queimadura, rachadura, impacto) e normal (escombros) em lotes separados; clearRect limpa o retângulo', () => {
    const d = new DecalLayer();
    add(d, 1, 1, 0, true, 10, 'multiply'); add(d, 2, 2, 0, true, 10, 'normal'); add(d, 8, 8, 0, true, 10, 'multiply');
    d.update(0.1, vis(2), W, false);
    expect(d.multiply.particleChildren.length).toBe(2);
    expect(d.normal.particleChildren.length).toBe(1);
    expect(d.multiply.blendMode).toBe('multiply');
    d.clearRect(0, 0, 3, 3);
    expect(d.count).toBe(1);
    d.clear();
    expect(d.count).toBe(0);
  });
});
