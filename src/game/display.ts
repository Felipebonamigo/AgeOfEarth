// Tela cheia, escala da interface e qualidade de renderização — no navegador e no Electron (Steam).
export interface DesktopBridge {
  steamName?: () => Promise<string | null>;
  achievement?: (id: string) => Promise<boolean>;
  presence?: (status: string) => Promise<boolean>;
  toggleFullscreen?: () => Promise<void>;
  setFullscreen?: (v: boolean) => Promise<void>;
  isFullscreen?: () => Promise<boolean>;
  onFullscreen?: (cb: (v: boolean) => void) => void;
  saveFile?: (name: string, content: string) => Promise<boolean>;
  openFile?: () => Promise<string | null>;
  quit?: () => Promise<void>;
  /** Espelho dos saves em arquivos (Steam Cloud; src/game/cloud.ts ↔ desktop/cloud.cjs). */
  cloudReadAll?: () => Promise<Record<string, string | null> | null>;
  cloudWrite?: (key: string, value: string) => Promise<boolean>;
  cloudRemove?: (key: string) => Promise<boolean>;
}

export const UI_SCALES = [0.8, 0.9, 1, 1.15, 1.3, 1.5];
export const RENDER_SCALES = [1, 0.75, 0.5];

export function desktop(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { desktop?: DesktopBridge }).desktop;
}

let electronFullscreen = false;
let listeners: ((v: boolean) => void)[] = [];

/** Liga os avisos de tela cheia (Electron e navegador). Chamar uma vez na inicialização. */
export function initDisplay(onChange?: (v: boolean) => void): void {
  if (onChange) listeners.push(onChange);
  const d = desktop();
  if (d?.onFullscreen) d.onFullscreen((v) => { electronFullscreen = v; for (const l of listeners) l(v); });
  if (d?.isFullscreen) void d.isFullscreen().then((v) => { electronFullscreen = v; });
  document.addEventListener('fullscreenchange', () => { if (!d?.setFullscreen) for (const l of listeners) l(!!document.fullscreenElement); });
}

export function isFullscreen(): boolean {
  return desktop()?.setFullscreen ? electronFullscreen : !!document.fullscreenElement;
}

/** No navegador só funciona a partir de um gesto do usuário (clique/tecla). */
export function setFullscreen(v: boolean): void {
  const d = desktop();
  if (d?.setFullscreen) { electronFullscreen = v; void d.setFullscreen(v); return; }
  if (v) { if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => { /* sem gesto */ }); }
  else if (document.fullscreenElement) void document.exitFullscreen();
}

export function toggleFullscreen(): void { setFullscreen(!isFullscreen()); }

let lastPresence = '';
/** Steam Rich Presence (só no Electron com Steam); ignora repetições. */
export function setPresence(status: string): void { if (status === lastPresence) return; lastPresence = status; const d = desktop(); if (d?.presence) void d.presence(status); }

/** Escala da interface (HUD, menus e modais) sem mexer na renderização do mapa. */
export function applyUiScale(scale: number): void {
  const s = Math.max(0.5, Math.min(2, scale));
  for (const id of ['hud', 'menu', 'modal-back']) {
    const e = document.getElementById(id);
    if (e) (e.style as unknown as { zoom: string }).zoom = String(s);
  }
}
