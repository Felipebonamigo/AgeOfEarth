// Cores dos jogadores (12): distintas entre si, também para daltônicos.
import { describe, it, expect } from 'vitest';
import { PLAYER_COLORS } from '../src/core/constants';

describe('cores', () => {
  it('são 12 e distintas entre si, também para daltônicos (deuteranopia)', () => {
    expect(PLAYER_COLORS.length).toBeGreaterThanOrEqual(12);
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    // simulação (Machado 2009, deuteranopia) em RGB linear → Lab simplificado por distância euclidiana em sRGB
    const deut = (c: number[]) => { const [r, g, b] = c.map(lin); return [0.367322 * r + 0.860646 * g - 0.227968 * b, 0.280085 * r + 0.672501 * g + 0.047413 * b, -0.01182 * r + 0.04294 * g + 0.968881 * b].map((v) => Math.min(1, Math.max(0, v))); };
    const cores = PLAYER_COLORS.slice(0, 12).map((c) => rgb(c.hex));
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) {
      const d = Math.hypot(...cores[i].map((v, k) => v - cores[j][k]));
      expect(d, `normal ${i}-${j}`).toBeGreaterThan(0.12);
      const dd = Math.hypot(...deut(cores[i]).map((v, k) => v - deut(cores[j])[k]));
      expect(dd, `deuteranopia ${i}-${j}`).toBeGreaterThan(0.04);
    }
  });
});

