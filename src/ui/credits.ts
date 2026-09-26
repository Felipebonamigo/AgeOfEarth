// Tela "Créditos" (ROADMAP 6.7): equipe, arte/áudio, tecnologias e licenças de terceiros.
// A lista de licenças é src/ui/third-party.json, gerada por scripts/licenses.ts a partir dos package-lock.json e do
// node_modules (não edite à mão; tests/steam.test.ts acusa se ficar desatualizada).
import licenses from './third-party.json';
import { getLocale, t } from '../i18n';
import { esc } from './html';

type Scope = 'game' | 'desktop' | 'relay';
interface Pkg { n: string; v: string; l: string; s: string; c?: string[]; u?: string; x?: string; xe?: string }

/** Pacotes distribuídos (para testes e para a tela). */
export const THIRD_PARTY: readonly Pkg[] = licenses.packages as Pkg[];

export function creditsHTML(): string {
  const en = getLocale() === 'en';
  const scopes: Scope[] = ['game', 'desktop', 'relay'];
  const rows = (scope: Scope) => THIRD_PARTY.filter((p) => p.s === scope).map((p) => {
    const note = en ? p.xe ?? p.x : p.x;
    return `<tr><td>${esc(p.n)}${note ? `<br><small style="color:#9aa5b8">${esc(note)}</small>` : ''}</td><td>${esc(p.v)}</td><td>${esc(p.l)}</td><td><small>${esc((p.c ?? []).join('; ') || '—')}</small></td></tr>`;
  }).join('');
  const tables = scopes.filter((s) => THIRD_PARTY.some((p) => p.s === s)).map((s) => `<h4 style="margin:10px 0 4px;color:#f2c14e">${t(`credits.scope.${s}`)}</h4>
    <table class="credits-table"><tr><th>${t('credits.col.component')}</th><th>${t('credits.col.version')}</th><th>${t('credits.col.license')}</th><th>${t('credits.col.copyright')}</th></tr>${rows(s)}</table>`).join('');
  const texts = Object.entries(licenses.texts as Record<string, string>).map(([id, text]) => `<details style="margin:4px 0"><summary style="cursor:pointer;color:#cbd5e1">${t('credits.licenseText', { l: esc(id) })}</summary><pre style="white-space:pre-wrap;font-size:11px;color:#9aa5b8;max-width:820px">${esc(text)}</pre></details>`).join('');
  return `<h2>${t('credits.title')}</h2>
    <h3>${t('credits.team')}</h3>
    <ul class="credits-team"><li>${t('credits.owner')}</li><li>${t('credits.ai')}</li></ul>
    <h3>${t('credits.artTitle')}</h3><p>${t('credits.art')}</p>
    <h3>${t('credits.techTitle')}</h3><p>${t('credits.tech')}</p>
    <h3>${t('credits.licensesTitle')}</h3><p>${t('credits.licensesDesc')}</p>
    <div id="credits-licenses">${tables}</div>
    ${texts}
    <p style="font-size:12px">${t('credits.fullTexts')}</p>
    <p style="font-size:12px">${t('credits.trademarks')}</p>
    <div class="actions"><button class="btn primary" id="m-close">${t('modal.close')}</button></div>`;
}
