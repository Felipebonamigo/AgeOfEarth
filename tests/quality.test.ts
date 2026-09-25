import { describe, it, expect } from 'vitest';
import { AutoQuality, isSoftwareRenderer, AUTO_P95_MS, AUTO_SAMPLE_FRAMES, QUALITY_PRESETS, effectiveResolution, levelOf, lowerLevel, p95, resolveQuality } from '../src/render/quality';
import { loadSettings, DEFAULT_SETTINGS } from '../src/game/settings';

describe('qualidade (docs/ART.md §3.9)', () => {
  it('presets low/medium/high e auto = medium', () => {
    const low = resolveQuality('low'), med = resolveQuality('medium'), high = resolveQuality('high'), auto = resolveQuality('auto');
    expect(QUALITY_PRESETS).toEqual(['auto', 'low', 'medium', 'high']);
    expect(low).toMatchObject({ preset: 'low', atlasScale: 1, shadows: true, particles: 1, water: 'static', terrainShader: 'simple', normalMaps: false, post: false, resolutionCap: 1, antialias: false });
    expect(med).toMatchObject({ preset: 'medium', atlasScale: 1, water: 'animated', terrainShader: 'full', normalMaps: true, resolutionCap: 1, antialias: false });
    expect(high).toMatchObject({ preset: 'high', atlasScale: 2, post: true, resolutionCap: 2, antialias: false });
    expect({ ...auto, preset: 'medium' }).toEqual(med);
    expect(levelOf('auto')).toBe('medium');
    expect(auto.showFps).toBe(false); expect(auto.teamOutline).toBe(false);
    expect(resolveQuality('auto', { showFps: true, teamOutline: true })).toMatchObject({ showFps: true, teamOutline: true });
    expect(resolveQuality('auto', { level: 'low' })).toMatchObject({ preset: 'auto', terrainShader: 'simple' });
  });
  it('resolução efetiva = min(teto, dpr) · renderScale', () => {
    expect(effectiveResolution(resolveQuality('high'), 2)).toBe(2);
    expect(effectiveResolution(resolveQuality('high'), 3)).toBe(2);
    expect(effectiveResolution(resolveQuality('medium'), 2)).toBe(1);
    expect(effectiveResolution(resolveQuality('high'), 2, 0.5)).toBe(1);
    expect(effectiveResolution(resolveQuality('low'), 1, 0.75)).toBe(0.75);
    expect(effectiveResolution(resolveQuality('low'), 1, 0)).toBe(0.25);   // renderScale limitado a 0,25–1
  });
  it('auto desce um nível com p95 > 12 ms depois de 120 quadros e nunca sobe', () => {
    expect(AUTO_SAMPLE_FRAMES).toBe(120); expect(AUTO_P95_MS).toBe(12);
    expect(p95([1, 2, 3, 4, 5, 6, 7, 8, 9, 20])).toBe(20);
    expect(p95([])).toBe(0);
    const a = new AutoQuality();
    expect(a.level).toBe('medium');
    for (let i = 0; i < 119; i++) expect(a.sample(30)).toBeNull();   // ainda medindo
    expect(a.sample(30)).toBe('low');
    expect(a.level).toBe('low'); expect(a.decided).toBe(true);
    for (let i = 0; i < 300; i++) expect(a.sample(1)).toBeNull();    // rápido depois: não sobe
    expect(a.level).toBe('low');
    // nova partida rápida: mantém o nível
    a.reset();
    for (let i = 0; i < 120; i++) a.sample(2);
    expect(a.level).toBe('low');
    // p95 no limite não rebaixa; um único pico (< 5 % dos quadros) também não
    const b = new AutoQuality();
    for (let i = 0; i < 120; i++) b.sample(i === 50 ? 80 : 12);
    expect(b.level).toBe('medium'); expect(b.decided).toBe(true);
    // 6 % dos quadros lentos → p95 acima do limite → rebaixa
    const c = new AutoQuality();
    for (let i = 0; i < 120; i++) c.sample(i < 8 ? 40 : 5);
    expect(c.level).toBe('low');
    // já em 'low' não há para onde descer
    const d = new AutoQuality('low');
    for (let i = 0; i < 120; i++) d.sample(50);
    expect(d.level).toBe('low');
    expect(lowerLevel('high')).toBe('medium'); expect(lowerLevel('low')).toBe('low');
  });
  it('loadSettings: padrões novos e save antigo sem os campos', () => {
    expect(DEFAULT_SETTINGS.quality).toBe('auto'); expect(DEFAULT_SETTINGS.showFps).toBe(false); expect(DEFAULT_SETTINGS.teamOutline).toBe(false);
    const store: Record<string, string> = { aoe_settings_v1: JSON.stringify({ volume: 0.3, muted: true, edgeScroll: false, showRanges: true, locale: 'en', uiScale: 1.3, fullscreen: false, renderScale: 0.75 }) };
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    try {
      const s = loadSettings();
      expect(s).toMatchObject({ volume: 0.3, muted: true, locale: 'en', uiScale: 1.3, renderScale: 0.75, quality: 'auto', showFps: false, teamOutline: false });
      store.aoe_settings_v1 = JSON.stringify({ quality: 'high', showFps: true });
      expect(loadSettings()).toMatchObject({ quality: 'high', showFps: true, teamOutline: false, renderScale: 1 });
      store.aoe_settings_v1 = JSON.stringify({ quality: 'ultra' });   // valor desconhecido → auto
      expect(loadSettings().quality).toBe('auto');
      store.aoe_settings_v1 = '{corrompido';
      expect(loadSettings().quality).toBe('auto');
    } finally { delete (globalThis as { localStorage?: unknown }).localStorage; }
  });

  it('automático detecta renderização por software e decide cedo com quadros lentos (intervalo real entre quadros)', () => {
    expect(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer('ANGLE (Intel, Intel(R) UHD Graphics 620, OpenGL 4.6)')).toBe(false);
    expect(isSoftwareRenderer(null)).toBe(false);
    // render barato em JS mas quadros a 1,5 fps: desce antes de 120 quadros
    const a = new AutoQuality('medium');
    let lowered: string | null = null, n = 0;
    while (!a.decided && n < 200) { lowered = a.sample(2, 660); n++; }
    expect(a.decided).toBe(true); expect(n).toBeLessThan(20); expect(lowered).toBe('low');
    // quadros rápidos: não desce e segue o limite de 120 quadros
    const b = new AutoQuality('medium'); let m = 0;
    while (!b.decided && m < 500) { b.sample(2, 16.7); m++; }
    expect(m).toBe(AUTO_SAMPLE_FRAMES); expect(b.level).toBe('medium');
  });
});
