// Bloco de opções compartilhado entre o menu principal e o menu da partida:
// volume, tela cheia, rolagem na borda, tamanho da interface, qualidade de renderização, idioma e atalhos.
import { t, getLocale, setLocale, LOCALE_NAMES, type Locale } from '../i18n';
import type { Settings } from '../game/settings';
import { isFullscreen, UI_SCALES, RENDER_SCALES } from '../game/display';

export interface OptionsContext {
  settings: Settings;
  getVolume: () => number; setVolume: (v: number) => void;
  setEdgeScroll: (v: boolean) => void;
  setUiScale: (v: number) => void;
  setRenderScale: (v: number) => void;
  setFullscreen: (v: boolean) => void;
  onLocaleChanged: () => void;
  onHotkeys: () => void;
}

const LBL = 'font-size:12px;color:#9aa5b8';
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

export function optionsHTML(ctx: OptionsContext): string {
  const s = ctx.settings;
  return `<div class="options" style="display:flex;flex-direction:column;gap:6px">
    <label style="${LBL}">${t('menu.volume')} <input type="range" id="o-vol" min="0" max="1" step="0.05" value="${ctx.getVolume()}"></label>
    <label style="${LBL}"><input type="checkbox" id="o-fs" ${isFullscreen() ? 'checked' : ''}> ${t('menu.fullscreen')} (F11)</label>
    <label style="${LBL}"><input type="checkbox" id="o-edge" ${s.edgeScroll ? 'checked' : ''}> ${t('menu.edgeScroll')}</label>
    <label style="${LBL}">${t('menu.uiScale')} <select id="o-ui">${UI_SCALES.map((v) => `<option value="${v}" ${near(v, s.uiScale) ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('')}</select></label>
    <label style="${LBL}" title="${t('menu.renderTip')}">${t('menu.renderScale')} <select id="o-render">${RENDER_SCALES.map((v) => `<option value="${v}" ${near(v, s.renderScale) ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('')}</select></label>
    <label style="${LBL}">${t('menu.language')} <select id="o-lang">${(Object.keys(LOCALE_NAMES) as Locale[]).map((l) => `<option value="${l}" ${getLocale() === l ? 'selected' : ''}>${LOCALE_NAMES[l]}</option>`).join('')}</select></label>
    <button class="btn" id="o-hotkeys">${t('menu.hotkeys')}</button>
  </div>`;
}

export function bindOptions(root: ParentNode, ctx: OptionsContext, rerender: () => void): void {
  const q = (id: string) => root.querySelector(id) as HTMLElement | null;
  q('#o-vol')?.addEventListener('input', (e) => ctx.setVolume(Number((e.target as HTMLInputElement).value)));
  q('#o-fs')?.addEventListener('change', (e) => ctx.setFullscreen((e.target as HTMLInputElement).checked));
  q('#o-edge')?.addEventListener('change', (e) => ctx.setEdgeScroll((e.target as HTMLInputElement).checked));
  q('#o-ui')?.addEventListener('change', (e) => ctx.setUiScale(Number((e.target as HTMLSelectElement).value)));
  q('#o-render')?.addEventListener('change', (e) => ctx.setRenderScale(Number((e.target as HTMLSelectElement).value)));
  q('#o-lang')?.addEventListener('change', (e) => { setLocale((e.target as HTMLSelectElement).value as Locale); ctx.onLocaleChanged(); rerender(); });
  q('#o-hotkeys')?.addEventListener('click', () => ctx.onHotkeys());
}
