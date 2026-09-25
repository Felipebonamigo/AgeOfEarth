// Bloco de opções compartilhado entre o menu principal e o menu da partida:
// áudio (geral, efeitos, música, ambiente, sem som), tela cheia, rolagem na borda, tamanho da interface, preset de qualidade, resolução de renderização,
// avançado (contador de desempenho, contorno de time), idioma e atalhos.
import { t, getLocale, setLocale, LOCALE_NAMES, type Locale } from '../i18n';
import type { Settings } from '../game/settings';
import type { AudioVolumes } from '../audio/audio';
import { isFullscreen, UI_SCALES, RENDER_SCALES } from '../game/display';
import { QUALITY_PRESETS, type QualityPreset } from '../render/quality';

export interface OptionsContext {
  settings: Settings;
  getVolume: () => number; setVolume: (v: number) => void;
  /** Volumes por barramento e mudo, aplicados ao vivo e persistidos. */
  getAudio: () => AudioVolumes; setAudio: (v: Partial<AudioVolumes>) => void;
  setEdgeScroll: (v: boolean) => void;
  setUiScale: (v: number) => void;
  setRenderScale: (v: number) => void;
  setQuality: (v: QualityPreset) => void;
  setShowFps: (v: boolean) => void;
  setTeamOutline: (v: boolean) => void;
  setFullscreen: (v: boolean) => void;
  onLocaleChanged: () => void;
  onHotkeys: () => void;
}

const LBL = 'font-size:12px;color:#9aa5b8';
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

export function optionsHTML(ctx: OptionsContext): string {
  const s = ctx.settings; const a = ctx.getAudio();
  return `<div class="options" style="display:flex;flex-direction:column;gap:6px">
    <fieldset style="${LBL};border:1px solid var(--border,#334);border-radius:8px;padding:4px 8px;display:flex;flex-direction:column;gap:3px"><legend>${t('menu.audio')}</legend>
      <label style="${LBL}">${t('menu.volume')} <input type="range" id="o-vol" min="0" max="1" step="0.05" value="${ctx.getVolume()}"></label>
      <label style="${LBL}">${t('menu.sfxVolume')} <input type="range" id="o-sfx" min="0" max="1" step="0.05" value="${a.sfx}"></label>
      <label style="${LBL}">${t('menu.musicVolume')} <input type="range" id="o-music" min="0" max="1" step="0.05" value="${a.music}"></label>
      <label style="${LBL}">${t('menu.ambienceVolume')} <input type="range" id="o-amb" min="0" max="1" step="0.05" value="${a.ambience}"></label>
      <label style="${LBL}"><input type="checkbox" id="o-mute" ${a.muted ? 'checked' : ''}> ${t('menu.mute')}</label>
    </fieldset>
    <label style="${LBL}"><input type="checkbox" id="o-fs" ${isFullscreen() ? 'checked' : ''}> ${t('menu.fullscreen')} (F11)</label>
    <label style="${LBL}"><input type="checkbox" id="o-edge" ${s.edgeScroll ? 'checked' : ''}> ${t('menu.edgeScroll')}</label>
    <label style="${LBL}">${t('menu.uiScale')} <select id="o-ui">${UI_SCALES.map((v) => `<option value="${v}" ${near(v, s.uiScale) ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('')}</select></label>
    <label style="${LBL}" title="${t('menu.qualityTip')}">${t('menu.quality')} <select id="o-quality">${QUALITY_PRESETS.map((v) => `<option value="${v}" ${s.quality === v ? 'selected' : ''}>${t(`quality.${v}`)}</option>`).join('')}</select></label>
    <label style="${LBL}" title="${t('menu.renderTip')}">${t('menu.renderScale')} <select id="o-render">${RENDER_SCALES.map((v) => `<option value="${v}" ${near(v, s.renderScale) ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('')}</select></label>
    <details style="${LBL}"><summary style="cursor:pointer">${t('menu.advanced')}</summary>
      <label style="${LBL};display:block;margin-top:4px"><input type="checkbox" id="o-fps" ${s.showFps ? 'checked' : ''}> ${t('menu.showFps')}</label>
      <label style="${LBL};display:block" title="${t('menu.teamOutlineTip')}"><input type="checkbox" id="o-outline" ${s.teamOutline ? 'checked' : ''}> ${t('menu.teamOutline')}</label>
    </details>
    <label style="${LBL}">${t('menu.language')} <select id="o-lang">${(Object.keys(LOCALE_NAMES) as Locale[]).map((l) => `<option value="${l}" ${getLocale() === l ? 'selected' : ''}>${LOCALE_NAMES[l]}</option>`).join('')}</select></label>
    <button class="btn" id="o-hotkeys">${t('menu.hotkeys')}</button>
  </div>`;
}

export function bindOptions(root: ParentNode, ctx: OptionsContext, rerender: () => void): void {
  const q = (id: string) => root.querySelector(id) as HTMLElement | null;
  q('#o-vol')?.addEventListener('input', (e) => ctx.setVolume(Number((e.target as HTMLInputElement).value)));
  const vol = (id: string, key: 'sfx' | 'music' | 'ambience') => q(id)?.addEventListener('input', (e) => ctx.setAudio({ [key]: Number((e.target as HTMLInputElement).value) }));
  vol('#o-sfx', 'sfx'); vol('#o-music', 'music'); vol('#o-amb', 'ambience');
  q('#o-mute')?.addEventListener('change', (e) => ctx.setAudio({ muted: (e.target as HTMLInputElement).checked }));
  q('#o-fs')?.addEventListener('change', (e) => ctx.setFullscreen((e.target as HTMLInputElement).checked));
  q('#o-edge')?.addEventListener('change', (e) => ctx.setEdgeScroll((e.target as HTMLInputElement).checked));
  q('#o-ui')?.addEventListener('change', (e) => ctx.setUiScale(Number((e.target as HTMLSelectElement).value)));
  q('#o-render')?.addEventListener('change', (e) => ctx.setRenderScale(Number((e.target as HTMLSelectElement).value)));
  q('#o-quality')?.addEventListener('change', (e) => ctx.setQuality((e.target as HTMLSelectElement).value as QualityPreset));
  q('#o-fps')?.addEventListener('change', (e) => ctx.setShowFps((e.target as HTMLInputElement).checked));
  q('#o-outline')?.addEventListener('change', (e) => ctx.setTeamOutline((e.target as HTMLInputElement).checked));
  q('#o-lang')?.addEventListener('change', (e) => { setLocale((e.target as HTMLSelectElement).value as Locale); ctx.onLocaleChanged(); rerender(); });
  q('#o-hotkeys')?.addEventListener('click', () => ctx.onHotkeys());
}
