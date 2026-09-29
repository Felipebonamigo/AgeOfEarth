// Sombras de nuvens (Etapa 9, docs/ART.md Apêndice I): a textura é periódica (sem costura ao repetir), cobre uma parte do
// chão (manchas, não um véu) e nunca escurece além de MAX_SHADE (legibilidade).
import { describe, it, expect } from 'vitest';
import { cloudShadowPixels, CLOUD_SIZE, MAX_SHADE } from '../src/render/fx/clouds';

describe('sombras de nuvens', () => {
  const px = cloudShadowPixels();
  const g = (x: number, y: number) => px[(((y + CLOUD_SIZE) % CLOUD_SIZE) * CLOUD_SIZE + ((x + CLOUD_SIZE) % CLOUD_SIZE)) * 4];
  it('determinística, opaca e dentro do escurecimento máximo', () => {
    expect(Buffer.from(cloudShadowPixels()).equals(Buffer.from(px))).toBe(true);
    let min = 255;
    for (let i = 0; i < CLOUD_SIZE * CLOUD_SIZE; i++) { min = Math.min(min, px[i * 4]); expect(px[i * 4 + 3]).toBe(255); }
    expect(min).toBeGreaterThanOrEqual(Math.floor(255 * (1 - MAX_SHADE)) - 1);
    expect(min).toBeLessThan(235);   // há nuvens de verdade
  });
  it('cobre 15–50 % do chão e é periódica (a borda continua do outro lado)', () => {
    let shaded = 0, seam = 0, inner = 0;
    for (let y = 0; y < CLOUD_SIZE; y++) for (let x = 0; x < CLOUD_SIZE; x++) if (g(x, y) < 250) shaded++;
    const f = shaded / (CLOUD_SIZE * CLOUD_SIZE);
    expect(f).toBeGreaterThan(0.15); expect(f).toBeLessThan(0.5);
    for (let y = 0; y < CLOUD_SIZE; y++) { seam += Math.abs(g(CLOUD_SIZE - 1, y) - g(0, y)); inner += Math.abs(g(127, y) - g(128, y)); }
    expect(seam).toBeLessThan(inner * 2 + CLOUD_SIZE);
  });
});
