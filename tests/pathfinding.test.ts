import { describe, it, expect } from 'vitest';
import { findPath, nearestFreeTile } from '../src/core/map/pathfinding';
import type { GameMap } from '../src/core/types';

function emptyMap(w: number, h: number): GameMap {
  return { w, h, terrain: new Uint8Array(w * h), blocked: new Uint8Array(w * h), nodeAt: new Int32Array(w * h).fill(-1), buildingAt: new Int32Array(w * h).fill(-1), nodes: new Map(), starts: [], decor: new Uint8Array(w * h) };
}

describe('pathfinding', () => {
  it('encontra caminho reto em mapa vazio (suavizado para um único waypoint)', () => {
    const m = emptyMap(20, 20);
    const p = findPath(m, 1, 1, { tx: 15, ty: 15, w: 1, h: 1 });
    expect(p).not.toBeNull();
    expect(p!.length).toBe(2);
    expect(p![0]).toBeCloseTo(15.5); expect(p![1]).toBeCloseTo(15.5);
  });
  it('contorna uma parede sem cortar cantos', () => {
    const m = emptyMap(20, 20);
    for (let y = 0; y < 19; y++) m.blocked[y * 20 + 10] = 1; // parede vertical com passagem em y=19
    const p = findPath(m, 2, 2, { tx: 17, ty: 2, w: 1, h: 1 });
    expect(p).not.toBeNull();
    // todo waypoint deve estar em tile livre
    for (let i = 0; i < p!.length; i += 2) expect(m.blocked[Math.floor(p![i + 1]) * 20 + Math.floor(p![i])]).toBe(0);
    // passa pela abertura
    expect(p!.some((_, i) => i % 2 === 1 && Math.floor(p![i]) === 19)).toBe(true);
  });
  it('alvo adjacente a um retângulo bloqueado', () => {
    const m = emptyMap(20, 20);
    for (let y = 8; y < 11; y++) for (let x = 8; x < 11; x++) m.blocked[y * 20 + x] = 1;
    const p = findPath(m, 1, 1, { tx: 8, ty: 8, w: 3, h: 3 }, true);
    expect(p).not.toBeNull();
    const ex = Math.floor(p![p!.length - 2]), ey = Math.floor(p![p!.length - 1]);
    expect(ex >= 7 && ex <= 11 && ey >= 7 && ey <= 11).toBe(true);
    expect(m.blocked[ey * 20 + ex]).toBe(0);
  });
  it('devolve caminho parcial quando o alvo é inalcançável', () => {
    const m = emptyMap(20, 20);
    for (let y = 0; y < 20; y++) m.blocked[y * 20 + 10] = 1;
    const p = findPath(m, 2, 2, { tx: 17, ty: 2, w: 1, h: 1 });
    expect(p).not.toBeNull();
    expect(Math.floor(p![p!.length - 2])).toBeLessThan(10);
  });
  it('tile livre mais próximo', () => {
    const m = emptyMap(10, 10);
    m.blocked[5 * 10 + 5] = 1;
    const t = nearestFreeTile(m, 5.5, 5.5)!;
    expect(Math.abs(t.x - 5) + Math.abs(t.y - 5)).toBeLessThanOrEqual(2);
  });
});
