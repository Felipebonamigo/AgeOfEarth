// Tela de carregamento (Etapa 8; docs/ART.md Apêndice H) e o fundo pintado do menu (public/ui/fundo-*.jpg, gerado por
// `npm run art:backdrop` com os modelos do jogo). Numa partida local a tela fica até a arte da partida estar na GPU (a
// sessão fica em espera — `Session.hold`, que não é a pausa do jogador nem a do briefing), com teto de tempo: sem ela, o
// jogo começava com as vistas procedurais e trocava para as assadas diante do jogador. Título e subtítulo da partida (a
// missão com o ícone dela, ou o modo, o mapa e os deuses), barra de progresso dos atlas e uma dica que troca sozinha. Numa
// missão da campanha o fundo é a ilustração dela (public/ui/missao-<id>.jpg).
import { t } from '../i18n';
import { esc } from './html';
import { WONDER_VICTORY_SECONDS } from '../core/constants';
import { CAMPAIGN_PLAN } from '../core/scenario/official';

/** URL de um fundo pintado (public/ui/fundo-<nome>.jpg), relativa à base do app (vale no app:// do Electron). */
export function backdropUrl(name = 'menu'): string {
  const rel = `${import.meta.env?.BASE_URL ?? './'}ui/fundo-${name}.jpg`;
  // absoluta: dentro de uma variável CSS a URL relativa seria resolvida a partir do CSS empacotado (assets/), não da página
  try { return typeof document !== 'undefined' ? new URL(rel, document.baseURI).href : rel; } catch { return rel; }
}

/**
 * Ilustração de uma missão oficial da campanha (public/ui/missao-<id>.jpg, gerada por `npm run art:missions` com os
 * modelos do jogo; ROADMAP 2.7), ou null para cenários de fora da campanha.
 */
export function missionArtUrl(id: string | undefined): string | null {
  if (!id || !CAMPAIGN_PLAN.some((m) => m.id === id)) return null;
  const rel = `${import.meta.env?.BASE_URL ?? './'}ui/missao-${id}.jpg`;
  try { return typeof document !== 'undefined' ? new URL(rel, document.baseURI).href : rel; } catch { return rel; }
}

export interface LoadingInfo { title: string; subtitle?: string; iconHtml?: string; /** fundo (padrão: o do menu) */ backdrop?: string | null }
/** Quantidade de dicas `load.tip<n>` nos textos. */
export const LOADING_TIPS = 12;
const TIP_MS = 6500;

export class LoadingScreen {
  readonly el: HTMLElement;
  private bar: HTMLElement;
  private tipEl: HTMLElement;
  private tipTimer: ReturnType<typeof setInterval> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private tip = 0;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'loading';
    this.el.className = 'hidden';
    this.el.innerHTML = `<div class="bg" style="background-image:url('${backdropUrl('menu')}')"></div><div class="shade"></div>
      <div class="content"><div class="head"><span class="ic"></span><div><h1></h1><div class="sub"></div></div></div>
      <div class="bar"><span></span></div><div class="status"></div><div class="tip"></div></div>`;
    this.bar = this.el.querySelector('.bar span') as HTMLElement;
    this.tipEl = this.el.querySelector('.tip') as HTMLElement;
    root.appendChild(this.el);
  }
  get visible(): boolean { return !this.el.classList.contains('hidden'); }

  show(info: LoadingInfo): void {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    (this.el.querySelector('.bg') as HTMLElement).style.backgroundImage = `url('${info.backdrop ?? backdropUrl('menu')}')`;
    (this.el.querySelector('h1') as HTMLElement).textContent = info.title;
    (this.el.querySelector('.sub') as HTMLElement).textContent = info.subtitle ?? '';
    (this.el.querySelector('.ic') as HTMLElement).innerHTML = info.iconHtml ?? '';
    (this.el.querySelector('.status') as HTMLElement).textContent = t('load.loading');
    this.tip = Math.floor(Math.random() * LOADING_TIPS);   // interface: fora da simulação
    this.showTip();
    if (this.tipTimer) clearInterval(this.tipTimer);
    this.tipTimer = setInterval(() => { this.tip = (this.tip + 1) % LOADING_TIPS; this.showTip(); }, TIP_MS);
    this.progress(null);
    this.el.classList.remove('hidden', 'out');
  }
  private showTip(): void {
    this.tipEl.innerHTML = `<b>${esc(t('load.tipLabel'))}</b> ${esc(t(`load.tip${this.tip + 1}`, { min: WONDER_VICTORY_SECONDS / 60 }))}`;
  }
  /** Fração carregada (0–1), ou null = indeterminado (ainda não se sabe quantos atlas a partida pede). */
  progress(frac: number | null): void {
    this.el.classList.toggle('indeterminate', frac === null);
    if (frac !== null) this.bar.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
  }
  hide(): void {
    if (this.tipTimer) { clearInterval(this.tipTimer); this.tipTimer = null; }
    if (!this.visible) return;
    this.el.classList.add('out');
    this.hideTimer = setTimeout(() => { this.el.classList.add('hidden'); this.el.classList.remove('out'); this.hideTimer = null; }, 450);
  }
}
