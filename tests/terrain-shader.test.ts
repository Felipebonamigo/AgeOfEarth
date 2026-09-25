import { describe, it, expect } from 'vitest';
import { TERRAIN, PLAYER_COLORS } from '../src/core/constants';
import { generateMap } from '../src/core/map/mapgen';
import { TERRAIN_FRAG_FULL, TERRAIN_FRAG_SIMPLE, TERRAIN_VERT, TERRAIN_UNIFORMS, TERRAIN_DATA_SAMPLERS, TERRAIN_MATERIAL_SAMPLERS, TERRAIN_SIMPLE_SAMPLERS } from '../src/render/terrain/shaders';
import { generateMaterials, writeOwner, writeTerrainRect, TERRAIN_INFLUENCE, KIND_CHANNEL, WEIGHT_CHANNEL, type TerrainSource } from '../src/render/terrain/materials';

/** Mapa pequeno e determinístico (só terreno) para os testes de bytes. */
function smallMap(): TerrainSource {
  const w = 40, h = 30, terrain = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    terrain[i] = x < 8 ? TERRAIN.DEEP : x < 11 ? TERRAIN.WATER : x < 13 ? TERRAIN.SAND : (x > 25 && y > 10 && y < 22) ? TERRAIN.MOUNTAIN : (x + y) % 7 === 0 ? TERRAIN.DIRT : TERRAIN.GRASS;
  }
  return { w, h, terrain };
}
const full = (m: TerrainSource) => { const wt = new Uint8Array(m.w * m.h * 4), kd = new Uint8Array(m.w * m.h * 4); writeTerrainRect(m, wt, kd, 0, 0, m.w - 1, m.h - 1); return { wt, kd }; };
/** Corpo de main() sem comentários, para contar leituras de textura. */
const mainBody = (src: string) => src.slice(src.indexOf('void main()')).replace(/\/\/[^\n]*/g, '');

describe('shader do terreno (docs/ART.md §3.6)', () => {
  it('GLSL ES 3.00 com os uniforms e texturas esperados', () => {
    for (const src of [TERRAIN_VERT, TERRAIN_FRAG_FULL, TERRAIN_FRAG_SIMPLE]) expect(src.startsWith('#version 300 es')).toBe(true);
    expect(TERRAIN_VERT).toMatch(/in vec2 aPosition;/); expect(TERRAIN_VERT).toMatch(/in vec2 aUV;/); expect(TERRAIN_VERT).toMatch(/uniform mat3 uProjectionMatrix;/);
    for (const u of TERRAIN_UNIFORMS) expect(TERRAIN_FRAG_FULL, u).toMatch(new RegExp(`uniform (float|vec2|vec3) ${u};`));
    for (const s of [...TERRAIN_DATA_SAMPLERS, ...TERRAIN_MATERIAL_SAMPLERS]) expect(TERRAIN_FRAG_FULL, s).toMatch(new RegExp(`uniform sampler2D ${s};`));
    for (const s of TERRAIN_SIMPLE_SAMPLERS) expect(TERRAIN_FRAG_SIMPLE, s).toMatch(new RegExp(`uniform sampler2D ${s};`));
    // sol a noroeste, água animada, espuma, fronteira, bombing e normais só no completo
    for (const k of ['uSun', 'uTime * uWaterAnim', 'uFoam', 'border(col, t)', 'bombUV', 'gridWeights', 'unrot(', 'bspline(uKind', 'textureGrad(']) expect(TERRAIN_FRAG_FULL, k).toContain(k);
  });
  it('fronteira: suave (curva de nível do campo bilinear por dono) no completo, por aresta de tile no simples', () => {
    const fn = (src: string) => src.slice(src.indexOf('vec3 border('), src.indexOf('\n}\n', src.indexOf('vec3 border(')));
    const full = fn(TERRAIN_FRAG_FULL), simple = fn(TERRAIN_FRAG_SIMPLE);
    // completo: 4 leituras fixas de uOwner em volta do ponto, gradiente analítico e distância à linha F(A) = F(B)
    expect(full.match(/texture\(uOwner/g)?.length).toBe(4);
    expect(full).toContain('length(ga - gb)');
    expect(full).not.toContain('nearL');
    // simples: 1 leitura no interior do tile; vizinhos só perto da aresta
    expect(simple).toContain('if (nearL || nearR || nearU || nearD)');
    expect(simple).not.toContain('length(ga - gb)');
    // um border() só por shader
    for (const src of [TERRAIN_FRAG_FULL, TERRAIN_FRAG_SIMPLE]) expect(src.match(/vec3 border\(/g)?.length).toBe(1);
  });
  it('shader simples: água estática, sem normais/macro, no máximo 5 leituras no interior', () => {
    for (const s of ['uWaterN', 'uMacro', 'uGrassN', 'uRockN']) expect(TERRAIN_FRAG_SIMPLE).not.toContain(s);
    const body = mainBody(TERRAIN_FRAG_SIMPLE);
    expect(body).not.toContain('uTime');
    // leituras fora da fronteira: pesos + tipo + 4 albedos condicionais por peso (num tile de um material só lê 1)
    const reads = (body.match(/texture(Grad)?\(/g) ?? []).length;
    expect(reads).toBe(6);
    expect(body.match(/if \(w\.[rgba] > 0\.004\)/g)?.length).toBe(4);
    // a fronteira no interior de um tile lê 1 texel (vizinhos só perto da aresta)
    expect(TERRAIN_FRAG_SIMPLE).toMatch(/if \(nearL \|\| nearR \|\| nearU \|\| nearD\)/);
  });
});

describe('texturas de dados do terreno', () => {
  it('writeTerrainRect é pura e determinística (mesmos bytes, mapa intacto)', () => {
    const m = smallMap(), before = m.terrain.slice();
    const a = full(m), b = full(m);
    expect(Buffer.from(a.wt).equals(Buffer.from(b.wt))).toBe(true);
    expect(Buffer.from(a.kd).equals(Buffer.from(b.kd))).toBe(true);
    expect(Buffer.from(m.terrain).equals(Buffer.from(before))).toBe(true);
    // canais: grama → R de uWeights; água → R de uKind, areia por baixo; montanha → A de uWeights e altura em uKind.A
    const at = (x: number, y: number) => (y * m.w + x) * 4;
    expect(a.wt[at(20, 5) + WEIGHT_CHANNEL.grass]).toBe(255);
    expect(a.kd[at(2, 5) + KIND_CHANNEL.water]).toBe(255);
    expect(a.wt[at(2, 5) + WEIGHT_CHANNEL.sand]).toBe(255);
    expect(a.kd[at(2, 5) + KIND_CHANNEL.depth]).toBeGreaterThan(a.kd[at(10, 5) + KIND_CHANNEL.depth]);   // ao largo > beira
    expect(a.wt[at(30, 15) + WEIGHT_CHANNEL.rock]).toBe(255);
    expect(a.kd[at(30, 15) + KIND_CHANNEL.mountain]).toBeGreaterThan(a.kd[at(26, 15) + KIND_CHANNEL.mountain]);   // topo > encosta
    expect(a.kd[at(20, 5) + KIND_CHANNEL.mountain]).toBe(0);
  });
  it('invalidateRect: só os bytes do retângulo mudam', () => {
    const m = smallMap();
    const wt = new Uint8Array(m.w * m.h * 4).fill(0x77), kd = new Uint8Array(m.w * m.h * 4).fill(0x77);
    const r = writeTerrainRect(m, wt, kd, 22, 4, 17, 9);   // cantos invertidos também valem
    expect(r).toEqual({ x0: 17, y0: 4, x1: 22, y1: 9 });
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const inside = x >= 17 && x <= 22 && y >= 4 && y <= 9, o = (y * m.w + x) * 4;
      for (let c = 0; c < 4; c++) {
        if (inside) continue;
        expect(wt[o + c]).toBe(0x77); expect(kd[o + c]).toBe(0x77);
      }
    }
    expect(writeTerrainRect(m, wt, kd, -5, -5, -1, -1)).toBeNull();
  });
  it('reescrever o retângulo editado + TERRAIN_INFLUENCE equivale a reescrever tudo', () => {
    const m = smallMap();
    const cur = full(m);
    // "pincel" do editor: lago no meio da grama e montanha nova encostada
    const x0 = 16, y0 = 12, x1 = 19, y1 = 15;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.terrain[y * m.w + x] = TERRAIN.WATER;
    m.terrain[13 * m.w + 24] = TERRAIN.MOUNTAIN;
    const R = TERRAIN_INFLUENCE;
    writeTerrainRect(m, cur.wt, cur.kd, x0 - R, y0 - R, x1 + R, y1 + R);
    writeTerrainRect(m, cur.wt, cur.kd, 24 - R, 13 - R, 24 + R, 13 + R);
    const ref = full(m);
    expect(Buffer.from(cur.wt).equals(Buffer.from(ref.wt))).toBe(true);
    expect(Buffer.from(cur.kd).equals(Buffer.from(ref.kd))).toBe(true);
  });
  it('writeOwner: cor do dono e A = dono + 1 (0 = ninguém)', () => {
    const colors = PLAYER_COLORS.map((c) => c.num);
    const out = new Uint8Array(3 * 4);
    writeOwner(3, 1, [-1, 0, 1], colors, out);
    expect([...out.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect(out[7]).toBe(1); expect(out[11]).toBe(2);
    expect((out[4] << 16) | (out[5] << 8) | out[6]).toBe(colors[0]);
  });
  it('mapa gerado: bytes idênticos para a mesma semente', () => {
    const a = generateMap(64, 64, 42, 2, 'lakes'), b = generateMap(64, 64, 42, 2, 'lakes');
    const fa = full(a), fb = full(b);
    expect(Buffer.from(fa.kd).equals(Buffer.from(fb.kd))).toBe(true);
    expect(Buffer.from(fa.wt).equals(Buffer.from(fb.wt))).toBe(true);
  });
});

describe('materiais gerados', () => {
  it('256²: tileáveis, não constantes, determinísticos', () => {
    const m = generateMaterials(256);
    expect(m.size).toBe(256);
    for (const mat of [m.grass, m.dirt, m.sand, m.rock]) {
      expect(mat.albedo.length).toBe(256 * 256 * 4); expect(mat.normal.length).toBe(256 * 256 * 4);
      // variação real no albedo e na altura
      let min = 255, max = 0;
      for (let i = 3; i < mat.albedo.length; i += 4) { min = Math.min(min, mat.albedo[i]); max = Math.max(max, mat.albedo[i]); }
      expect(max - min).toBeGreaterThan(40);
      // tileável: o salto da última coluna para a primeira é da ordem do salto entre colunas vizinhas
      let wrap = 0, inner = 0;
      for (let y = 0; y < 256; y++) { const r = y * 256 * 4; wrap += Math.abs(mat.albedo[r + 3] - mat.albedo[r + 255 * 4 + 3]); inner += Math.abs(mat.albedo[r + 128 * 4 + 3] - mat.albedo[r + 127 * 4 + 3]); }
      expect(wrap).toBeLessThan(inner * 3 + 256 * 4);
    }
    expect(generateMaterials(256)).toBe(m);   // cache em memória
  });
});
