// Configurações persistentes do jogador (localStorage; no Electron, o mesmo perfil de usuário).
import { QUALITY_PRESETS, type QualityPreset } from '../render/quality';

/** Esquemas de botões do controle (src/ui/gamepad.ts): padrão Xbox/Steam Deck ou alternativo (A↔B e analógicos trocados). */
export const PAD_SCHEMES = ['standard', 'alt'] as const;
export type PadScheme = (typeof PAD_SCHEMES)[number];
/** Sensibilidades oferecidas para o cursor virtual do controle. */
export const PAD_SENSITIVITIES = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
  /** Controle: multiplicador da velocidade do cursor virtual (0,5–2). */
  padSensitivity: number;
  /** Controle: inverte o eixo vertical do analógico da câmera. */
  padInvertY: boolean;
  /** Controle: esquema de botões. */
  padScheme: PadScheme;
  /** Controle: vibração curta ao sofrer ataque (quando o controle suporta). */
  padVibration: boolean;
}
const KEY = 'aoe_settings_v1';
// Tela cheia por padrão no Electron (Steam); no navegador só a pedido (exige gesto do usuário).
export const DEFAULT_SETTINGS: Settings = { volume: 0.5, muted: false, sfxVolume: 0.8, musicVolume: 0.5, ambienceVolume: 0.6, edgeScroll: true, showRanges: false, locale: 'pt', uiScale: 1, fullscreen: typeof window !== 'undefined' && !!(window as unknown as { desktop?: unknown }).desktop, renderScale: 1, quality: 'auto', showFps: false, teamOutline: false, padSensitivity: 1, padInvertY: false, padScheme: 'standard', padVibration: true };

/** Corrige campos ausentes ou inválidos (saves antigos e JSON editado à mão) para os padrões. */
export function sanitizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  const vol = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : d);
  s.volume = vol(s.volume, DEFAULT_SETTINGS.volume); s.sfxVolume = vol(s.sfxVolume, DEFAULT_SETTINGS.sfxVolume);
  s.musicVolume = vol(s.musicVolume, DEFAULT_SETTINGS.musicVolume); s.ambienceVolume = vol(s.ambienceVolume, DEFAULT_SETTINGS.ambienceVolume);
  s.muted = !!s.muted;
  if (!QUALITY_PRESETS.includes(s.quality)) s.quality = 'auto';
  s.showFps = !!s.showFps; s.teamOutline = !!s.teamOutline;
  if (typeof s.padSensitivity !== 'number' || !Number.isFinite(s.padSensitivity)) s.padSensitivity = 1;
  s.padSensitivity = Math.max(0.25, Math.min(3, s.padSensitivity));
  s.padInvertY = !!s.padInvertY;
  if (!(PAD_SCHEMES as readonly string[]).includes(s.padScheme)) s.padScheme = 'standard';
  s.padVibration = s.padVibration !== false;
  return s;
}

/** Lê as configurações; saves antigos (sem os campos novos) recebem os padrões e valores inválidos voltam ao padrão. */
export function loadSettings(): Settings {
  let raw: Partial<Settings> | null = null;
  try { const txt = localStorage.getItem(KEY); if (txt) raw = JSON.parse(txt); } catch { /* ignore */ }
  // Migração do áudio antigo (antes dos volumes separados): o volume e o mudo reais ficavam em aoe_volume/aoe_muted
  if (!raw || raw.sfxVolume === undefined) {
    try {
      raw = { ...(raw ?? {}) };
      const v = localStorage.getItem('aoe_volume'); if (v !== null && Number.isFinite(Number(v))) raw.volume = Number(v);
      const m = localStorage.getItem('aoe_muted'); if (m !== null) raw.muted = m === '1';
    } catch { /* ignore */ }
  }
  return sanitizeSettings(raw);
}
export function saveSettings(s: Settings): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }
