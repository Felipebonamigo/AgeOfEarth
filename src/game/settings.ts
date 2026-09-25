// Configurações persistentes do jogador (localStorage; no Electron, o mesmo perfil de usuário).
export interface Settings { volume: number; muted: boolean; edgeScroll: boolean; showRanges: boolean; locale: 'pt' | 'en'; uiScale: number; fullscreen: boolean; renderScale: number }
const KEY = 'aoe_settings_v1';
// Tela cheia por padrão no Electron (Steam); no navegador só a pedido (exige gesto do usuário).
const DEFAULTS: Settings = { volume: 0.5, muted: false, edgeScroll: true, showRanges: false, locale: 'pt', uiScale: 1, fullscreen: typeof window !== 'undefined' && !!(window as unknown as { desktop?: unknown }).desktop, renderScale: 1 };

export function loadSettings(): Settings {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }; } catch { /* ignore */ }
  return { ...DEFAULTS };
}
export function saveSettings(s: Settings): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }
