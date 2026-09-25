// Configurações persistentes do jogador (localStorage; no Electron, o mesmo perfil de usuário).
import { QUALITY_PRESETS, type QualityPreset } from '../render/quality';

export interface Settings {
  /** Volume geral (mestre); `muted` silencia tudo. */
  volume: number; muted: boolean;
  /** Volumes por barramento (docs/DESIGN.md, "Áudio"): efeitos + interface, música, ambiente. */
  sfxVolume: number; musicVolume: number; ambienceVolume: number;
  edgeScroll: boolean; showRanges: boolean; locale: 'pt' | 'en'; uiScale: number; fullscreen: boolean; renderScale: number;
  /** Preset de qualidade (docs/ART.md §3.9); 'auto' mede o início da partida e desce um nível se preciso. */
  quality: QualityPreset;
  /** Contador de desempenho na tela (o mesmo de ?perf=1). */
  showFps: boolean;
  /** Contorno na cor do time (daltonismo e zoom baixo; desenho na Etapa 7). */
  teamOutline: boolean;
}
const KEY = 'aoe_settings_v1';
// Tela cheia por padrão no Electron (Steam); no navegador só a pedido (exige gesto do usuário).
export const DEFAULT_SETTINGS: Settings = { volume: 0.5, muted: false, sfxVolume: 0.8, musicVolume: 0.5, ambienceVolume: 0.6, edgeScroll: true, showRanges: false, locale: 'pt', uiScale: 1, fullscreen: typeof window !== 'undefined' && !!(window as unknown as { desktop?: unknown }).desktop, renderScale: 1, quality: 'auto', showFps: false, teamOutline: false };

/** Lê as configurações; saves antigos (sem os campos novos) recebem os padrões e valores inválidos voltam ao padrão. */
export function loadSettings(): Settings {
  let s: Settings = { ...DEFAULT_SETTINGS };
  let saved: Partial<Settings> = {};
  try { const raw = localStorage.getItem(KEY); if (raw) { saved = JSON.parse(raw) as Partial<Settings>; s = { ...DEFAULT_SETTINGS, ...saved }; } } catch { /* ignore */ }
  // Migração do áudio antigo (antes dos volumes separados): o volume e o mudo reais ficavam em aoe_volume/aoe_muted
  if (saved.sfxVolume === undefined) {
    try {
      const v = localStorage.getItem('aoe_volume'); if (v !== null && Number.isFinite(Number(v))) s.volume = Number(v);
      const m = localStorage.getItem('aoe_muted'); if (m !== null) s.muted = m === '1';
    } catch { /* ignore */ }
  }
  const vol = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : d);
  s.volume = vol(s.volume, DEFAULT_SETTINGS.volume); s.sfxVolume = vol(s.sfxVolume, DEFAULT_SETTINGS.sfxVolume);
  s.musicVolume = vol(s.musicVolume, DEFAULT_SETTINGS.musicVolume); s.ambienceVolume = vol(s.ambienceVolume, DEFAULT_SETTINGS.ambienceVolume);
  s.muted = !!s.muted;
  if (!QUALITY_PRESETS.includes(s.quality)) s.quality = 'auto';
  s.showFps = !!s.showFps; s.teamOutline = !!s.teamOutline;
  return s;
}
export function saveSettings(s: Settings): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }
