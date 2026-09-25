// Configurações persistentes do jogador (localStorage; no Electron, o mesmo perfil de usuário).
import { QUALITY_PRESETS, type QualityPreset } from '../render/quality';

export interface Settings {
  volume: number; muted: boolean; edgeScroll: boolean; showRanges: boolean; locale: 'pt' | 'en'; uiScale: number; fullscreen: boolean; renderScale: number;
  /** Preset de qualidade (docs/ART.md §3.9); 'auto' mede o início da partida e desce um nível se preciso. */
  quality: QualityPreset;
  /** Contador de desempenho na tela (o mesmo de ?perf=1). */
  showFps: boolean;
  /** Contorno na cor do time (daltonismo e zoom baixo; desenho na Etapa 7). */
  teamOutline: boolean;
}
const KEY = 'aoe_settings_v1';
// Tela cheia por padrão no Electron (Steam); no navegador só a pedido (exige gesto do usuário).
export const DEFAULT_SETTINGS: Settings = { volume: 0.5, muted: false, edgeScroll: true, showRanges: false, locale: 'pt', uiScale: 1, fullscreen: typeof window !== 'undefined' && !!(window as unknown as { desktop?: unknown }).desktop, renderScale: 1, quality: 'auto', showFps: false, teamOutline: false };

/** Lê as configurações; saves antigos (sem os campos novos) recebem os padrões e valores inválidos voltam ao padrão. */
export function loadSettings(): Settings {
  let s: Settings = { ...DEFAULT_SETTINGS };
  try { const raw = localStorage.getItem(KEY); if (raw) s = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }; } catch { /* ignore */ }
  if (!QUALITY_PRESETS.includes(s.quality)) s.quality = 'auto';
  s.showFps = !!s.showFps; s.teamOutline = !!s.teamOutline;
  return s;
}
export function saveSettings(s: Settings): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }
