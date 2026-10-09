// Exportador de terreno para o Unreal (scripts/unreal/export-terrain.ts).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGame } from '../src/core/sim/game';
import { TERRAIN } from '../src/core/constants';
import { buildTerrain, writeTerrain, LANDSCAPE_SIZES } from '../scripts/unreal/export-terrain';

const players = [{ name: 'a', god: 'zeus', isAI: false, difficulty: 'normal' as const }, { name: 'b', god: 'zeus', isAI: false, difficulty: 'normal' as const }];
const map = createGame({ seed: 42, mapSize: 'small', players }).map;
const t = buildTerrain(map, { size: 253, name: 't' });
const meters = (i: number, j: number) => (t.height[j * t.size + i] - 32768) / 128;

describe('exportador de terreno do Unreal', () => {
  it('relevo coerente: mar abaixo de 0, terra acima, montanha mais alta que a terra', () => {
    const at = (cls: number) => { for (let y = 3; y < map.h - 3; y++) for (let x = 3; x < map.w - 3; x++) { if (map.terrain[y * map.w + x] !== cls) continue; let all = true; for (let dy = -2; dy <= 2 && all; dy++) for (let dx = -2; dx <= 2; dx++) if (map.terrain[(y + dy) * map.w + x + dx] !== cls) { all = false; break; } if (all) return meters(Math.floor(((x + 0.5) / map.w) * t.size), Math.floor(((y + 0.5) / map.h) * t.size)); } return null; };
    const grass = at(TERRAIN.GRASS), deep = at(TERRAIN.DEEP), mountain = at(TERRAIN.MOUNTAIN);
    expect(grass).not.toBeNull(); expect(deep).not.toBeNull();
    expect(grass!).toBeGreaterThan(0); expect(deep!).toBeLessThan(-3);
    if (mountain !== null) expect(mountain).toBeGreaterThan(grass! + 5);
  });
  it('as camadas somam ~255 (menos a água) e o resultado é determinístico', () => {
    for (let k = 0; k < t.height.length; k += 997) { const s = t.grass[k] + t.dirt[k] + t.sand[k] + t.rock[k]; expect(Math.abs(s - 255)).toBeLessThanOrEqual(3); }
    const again = buildTerrain(map, { size: 253, name: 't' });
    expect(Buffer.from(again.height.buffer).equals(Buffer.from(t.height.buffer))).toBe(true);
  });
  it('nós e inícios saem em unidades do Unreal (tile × 200) com a altura do chão', () => {
    const info = t.info as { uuPerTile: number; starts: { tx: number; x: number; zM: number }[]; nodes: unknown[]; landscape: { scaleXY: number } };
    expect(info.nodes.length).toBe(map.nodes.size);
    expect(info.starts[0].x).toBe(Math.round((map.starts[0].x + 0.5) * 200));
    expect(info.starts[0].zM).toBeGreaterThan(0);   // o início fica em terra firme
    expect(info.landscape.scaleXY).toBeCloseTo((map.w * 200) / 252, 3);
  });
  it('grava os arquivos: .r16 do tamanho certo e PNG de 16 bits (IHDR)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terr-'));
    const files = writeTerrain(t, dir);
    expect(files).toContain('terrain.json');
    expect(fs.statSync(path.join(dir, 'heightmap.r16')).size).toBe(253 * 253 * 2);
    const png = fs.readFileSync(path.join(dir, 'heightmap.png'));
    expect(png.readUInt32BE(16)).toBe(253);          // largura (IHDR)
    expect(png[24]).toBe(16);                        // profundidade de bits
    expect(png[25]).toBe(0);                         // tons de cinza
    expect(fs.readFileSync(path.join(dir, 'layer-grass.png'))[24]).toBe(8);
    expect(() => buildTerrain(map, { size: 300 })).toThrow();
    expect(LANDSCAPE_SIZES).toContain(1009);
    fs.rmSync(dir, { recursive: true });
  });
});
