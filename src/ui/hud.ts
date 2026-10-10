// Interface em DOM: barra de recursos, painel de seleção, grade de comandos, poderes divinos,
// minimapa, mensagens, tooltips e modais (deuses menores, menu, ajuda, enciclopédia, fim de jogo).
import { RESOURCES, RESOURCE_ICONS, STANCES, TICK_RATE, MAX_SCHOLARS, SCHOLAR_COST, WONDER_VICTORY_SECONDS, KOTH_SECONDS, FORMATIONS, PLAYER_COLORS, rankOf, type ResourceType, type Stance, type Formation } from '../core/constants';
const FORMATION_GLYPHS: Record<Formation, string> = { line: 'fLine', box: 'fBox', column: 'fColumn', wedge: 'fWedge' };
import { teamNames } from '../core/sim/modes';
import { relicsOf } from '../core/sim/relics';
import { AGES, BUILDINGS, BUILD_MENU, MAJOR_GODS, MINOR_GODS, POWERS, TECHS, UNITS, ACADEMY_LINES, ABILITIES } from '../core/data';
import type { Building, GameEvent, Unit } from '../core/types';
import { getUnitStats, getBuildingStats, techCost } from '../core/sim/modifiers';
import { canTrain, canResearch, canAdvanceAge, canHireScholar, academyTechCount } from '../core/sim/commands';
import { studyTreeModel, studyTreeHtml, studyTreeKey, studyNodeDetail, pickLibrary, librariesOf, type StudyNode } from './studytree';
import { canPlaceBuilding, buildingLimitOk } from '../core/sim/entities';
import { farmGatherers, isMilitary } from '../core/sim/queries';
import { canAfford, missingResources } from '../core/sim/economy';
import type { Session } from '../game/session';
import type { Renderer } from '../render/renderer';
import { Minimap } from '../render/minimap';
import type { Audio } from '../audio/audio';
import { getScenarioFor } from '../core/scenario/runner';
import { CAMPAIGN_PLAN, HORDE, isCampaignMission, nextCampaignMission } from '../core/scenario/campaign';
import { scenarioWon } from '../core/scenario/runner';
import type { GameState } from '../core/types';
import type { ScenarioDef } from '../core/scenario/types';
import { entityDisplayName, playerDisplayName } from '../core/scenario/text';
import { maxAgeOf } from '../core/sim/restrictions';
import { scenarioHudHtml } from './scenario-hud';

/** Ids oficiais (registro da campanha, TS ou JSON, e Horda): só eles marcam progresso em aoe_campaign e destravam conquistas de missão. */
const isOfficialScenario = (id: string) => id === HORDE.id || isCampaignMission(id);
/** Cenário da partida (embutido ou JSON compilado no idioma atual); um JSON inválido vira "sem cenário" em vez de derrubar o HUD. */
const scenarioOf = (state: GameState): ScenarioDef | undefined => { try { return getScenarioFor(state); } catch { return undefined; } };
import { t } from '../i18n';
import { esc, noEmoji } from './html';
import { optionsHTML, bindOptions, type OptionsContext } from './options';
import { padHelpRows } from './gamepad';
import { DialogueQueue } from './dialogue';
import { creditsHTML } from './credits';
import { storeSet } from '../game/cloud';
import { emojiIcon, ic, iconHtml, iconsGeneration, loadIcons, missionIcon, onIconsReady } from './icons';
import { missionArtUrl } from './loading';
import { glyph, laurelSvg } from './glyphs';
import { watchEmoji } from './emoji';

/** Ícone de quem fala (o emoji do roteiro vira o retrato ou o ícone do atlas; sem correspondência, o glifo de fala). */
const speakerIcon = (emoji: string, cls = ''): string => emojiIcon(emoji, cls);

export interface HUDCallbacks { onSave: () => void; onLoad: () => void; onQuit: () => void; hasSave: () => boolean; onNextMission?: (currentId: string) => void; onExport?: () => void; onImport?: () => void; onLocaleChanged?: () => void; getOptions?: () => OptionsContext; onDiagnostic?: () => void; onExportMap?: () => void; onSaveMapLocal?: () => void }

const el = (tag: string, cls?: string, html?: string): HTMLElement => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const fmtCost = (cost: Record<string, number>, player?: { resources: Record<string, number> }) => Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) => `<span class="${player && player.resources[k] < v ? 'miss' : ''}">${ic.res(k)} ${v}</span>`).join('');
/**
 * Escala da interface (CSS zoom em #menu/#modal-back) também multiplica `vh`: publica o zoom em --uiz para o CSS
 * limitar a altura (`calc(94vh / var(--uiz))`) e a caixa caber na tela (Steam Deck 1280×800 a 130 %).
 */
export function syncUiZoom(el: HTMLElement): void {
  const sync = () => { const v = String(parseFloat(el.style.zoom) || 1); if (el.style.getPropertyValue('--uiz') !== v) el.style.setProperty('--uiz', v); };
  if (typeof MutationObserver !== 'undefined') new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['style'] });
  sync();
}
/** Texto de dica (i18n): os símbolos de tempo e população viram glifos; o resto dos emoji sai (Etapa 7). */
const tipHtml = (html: string): string => noEmoji(html.replace(/⏱\uFE0F?/g, glyph('clock')).replace(/👥/g, glyph('people')));
/** Cabeçalho das telas de fim (partida e missão): o título entre dois ramos de louro e a linha de baixo (HTML já escapado). */
const overBanner = (kind: 'won' | 'lost' | 'draw', title: string, sub: string): string =>
  `<div class="over-banner ${kind}">${laurelSvg()}<div class="t"><h2>${esc(noEmoji(title))}</h2><p>${sub}</p></div>${laurelSvg(true)}</div>`;
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class HUD {
  root: HTMLElement;
  objPanel!: HTMLElement; dlgPanel!: HTMLElement;
  top!: HTMLElement; bottom!: HTMLElement; selPanel!: HTMLElement; cmdPanel!: HTMLElement; godsPanel!: HTMLElement; msgPanel!: HTMLElement; tooltip!: HTMLElement; modalBack!: HTMLElement; modal!: HTMLElement; idleBtn!: HTMLElement;
  minimap!: Minimap;
  chatEl!: HTMLInputElement;
  /** Definido pelo boot em partidas online: envia a mensagem para a sala. */
  onChat: ((text: string) => void) | null = null;
  /** Alerta de ataque ao jogador local (o controle vibra; src/ui/gamepad.ts). */
  onAlert: (() => void) | null = null;
  /** Dicas de botões do controle (visíveis só com o controle ativo). */
  padHintsEl!: HTMLElement;
  private session: Session | null = null;
  private acc = 0; private mmAcc = 0;
  private lastSelKey = '';
  private lastCmdKey = '';
  private padPage: number | null = null;   // página da grade marcada pelo controle (setPadGrid)
  private lastCmdSel = '';   // seleção/modo do último redesenho da grade (mantém a rolagem)
  private gameOverShown = false;
  private muteBtn: HTMLElement | null = null;
  /** Último evento consumido (o cursor por índice se perde quando o núcleo descarta eventos antigos). */
  private lastEv: GameEvent | null = null;
  private renderer: Renderer;
  private audio: Audio;
  private cb: HUDCallbacks;
  private resEls: Record<string, HTMLElement> = {};
  private popEl!: HTMLElement; private ageEl!: HTMLElement; private clockEl!: HTMLElement; private modeEl!: HTMLElement; private speedEl!: HTMLElement; private ageBtn!: HTMLElement; private testEl!: HTMLElement;
  /** Editor de mapas: a classe `editor` em #hud esconde recursos/idade/comandos e o minimapa mostra os inícios. */
  private editorMode = false;
  /** Partida de teste do editor: o selo no topo e o botão de sair voltam ao editor. */
  onBackToEditor: (() => void) | null = null;
  get testMode() { return this.onBackToEditor !== null; }

  constructor(root: HTMLElement, renderer: Renderer, audio: Audio, cb: HUDCallbacks) {
    this.root = root; this.renderer = renderer; this.audio = audio; this.cb = cb;
    this.mount();
    // ícones do HUD (atlas `hud`, independe da arte assada): ao chegar, redesenha o que tem ícone
    onIconsReady(() => { this.redrawIcons(); });
    void loadIcons();
  }

  /** Redesenha o que mostra ícones (recursos no topo, seleção, comandos, poderes, objetivos) quando o atlas chega. */
  private redrawIcons() {
    for (const r of RESOURCES) { const sp = this.resEls[r]?.querySelector('span'); if (sp) sp.innerHTML = ic.res(r); }
    this.lastSelKey = ''; this.lastCmdKey = ''; this.lastObjKey = ''; this.lastAgeKey = ''; this.godsPanel.dataset.key = '';
    if (this.session) { this.refreshTop(); this.refreshSelection(true); this.refreshGods(); this.refreshObjectives(true); this.renderDialogue(); }
  }
  private lastAgeKey = '';

  setSession(s: Session | null) {
    this.session = s; this.lastEv = null; this.lastSelKey = ''; this.lastCmdKey = ''; this.lastCmdSel = ''; this.lastObjKey = ''; this.gameOverShown = false;   // lastObjKey: outra partida do mesmo cenário precisa redesenhar (e reexibir) o painel de objetivos
    this.dlg.clear(); this.renderDialogue();   // falas da partida anterior não passam para a próxima
    this.msgPanel.innerHTML = '';
    if (s) { s.onSelectionChanged = () => { this.refreshSelection(true); }; this.refreshGods(); this.refreshTop(); }
  }

  // ---------------- Montagem ----------------
  private mount() {
    const hud = el('div'); hud.id = 'hud';
    this.top = el('div'); this.top.id = 'top';
    for (const r of RESOURCES) { const e = el('div', 'res', `<span>${ic.res(r)}</span><b>0</b>`); e.title = t(`res.${r}`); this.resEls[r] = e; this.top.appendChild(e); }
    this.popEl = el('div', 'res', `<span class="gly-wrap">${glyph('people')}</span><b>0/0</b>`); this.popEl.title = t('pop'); this.top.appendChild(this.popEl);
    this.top.appendChild(el('div', 'spacer'));
    this.ageEl = el('div', 'age', ''); this.top.appendChild(this.ageEl);
    this.ageBtn = el('button', 'btn gold', t('top.advance')); this.ageBtn.id = 'age-btn'; this.ageBtn.addEventListener('click', () => this.tryAdvanceAge()); this.top.appendChild(this.ageBtn);
    this.clockEl = el('div', 'clock', '0:00'); this.top.appendChild(this.clockEl);
    this.modeEl = el('div', 'clock', ''); this.modeEl.style.color = '#f2c14e'; this.top.appendChild(this.modeEl);
    // Selo do modo de teste do editor (partida criada a partir do arquivo): clique volta ao editor
    this.testEl = el('button', 'btn gold hidden', t('editor.testBadge')); this.testEl.id = 'test-badge'; this.testEl.addEventListener('click', () => this.onBackToEditor?.()); this.top.appendChild(this.testEl);
    this.speedEl = el('div', '', ''); this.speedEl.id = 'speed'; this.top.appendChild(this.speedEl);
    const speedBtns = [[glyph('pause'), 0], ['1×', 1], ['2×', 2], ['3×', 3]] as const;
    for (const [lbl, sp] of speedBtns) { const b = el('button', 'btn', lbl); if (sp === 0) b.title = t('top.pauseTip'); b.addEventListener('click', () => { if (!this.session) return; if (sp === 0) this.session.paused = !this.session.paused; else { this.session.speed = sp; this.session.paused = false; } this.refreshTop(); }); this.speedEl.appendChild(b); }
    const mute = el('button', 'btn', glyph(this.audio.muted ? 'mute' : 'sound')); mute.dataset.muted = String(this.audio.muted); mute.title = t('top.muteTip');
    mute.addEventListener('click', () => { const m = this.audio.toggleMute(); mute.innerHTML = glyph(m ? 'mute' : 'sound'); mute.dataset.muted = String(m); }); this.top.appendChild(mute); this.muteBtn = mute;
    const menuBtn = el('button', 'btn', `${glyph('menu')} ${esc(noEmoji(t('top.menu')))}`); menuBtn.id = 'top-menu'; menuBtn.addEventListener('click', () => this.showMenu()); this.top.appendChild(menuBtn);
    hud.appendChild(this.top);

    this.bottom = el('div'); this.bottom.id = 'bottom';
    const mmWrap = el('div'); mmWrap.id = 'minimap-wrap';
    const mm = document.createElement('canvas'); mm.id = 'minimap'; mmWrap.appendChild(mm);
    this.idleBtn = el('button', 'btn'); this.idleBtn.id = 'idle'; this.idleBtn.textContent = noEmoji(t('top.idle', { n: 0 })); this.idleBtn.title = t('top.idleTip'); this.idleBtn.addEventListener('click', () => this.selectIdleVillager()); mmWrap.appendChild(this.idleBtn);
    this.bottom.appendChild(mmWrap);
    this.minimap = new Minimap(mm);
    mm.addEventListener('contextmenu', (e) => e.preventDefault());   // botão direito no minimapa não abre o menu do navegador
    this.selPanel = el('div'); this.selPanel.id = 'selection'; this.bottom.appendChild(this.selPanel);
    this.cmdPanel = el('div'); this.cmdPanel.id = 'commands'; this.bottom.appendChild(this.cmdPanel);
    hud.appendChild(this.bottom);

    // coluna da direita: poderes e, abaixo deles, os objetivos da missão (empilhados: 3+ poderes não cobrem mais os objetivos)
    const rightCol = el('div'); rightCol.id = 'rightcol'; hud.appendChild(rightCol);
    this.godsPanel = el('div'); this.godsPanel.id = 'gods'; rightCol.appendChild(this.godsPanel);
    this.padHintsEl = el('div', 'pad-hints hidden'); this.padHintsEl.id = 'pad-hints'; hud.appendChild(this.padHintsEl);
    this.msgPanel = el('div'); this.msgPanel.id = 'messages'; hud.appendChild(this.msgPanel);
    this.objPanel = el('div'); this.objPanel.id = 'objectives'; this.objPanel.classList.add('hidden'); rightCol.appendChild(this.objPanel);
    this.dlgPanel = el('div'); this.dlgPanel.id = 'dialogue'; this.dlgPanel.classList.add('hidden'); this.dlgPanel.addEventListener('click', () => { this.dlg.next(performance.now()); this.renderDialogue(); }); hud.appendChild(this.dlgPanel);
    this.tooltip = el('div'); this.tooltip.id = 'tooltip'; this.tooltip.classList.add('hidden'); hud.appendChild(this.tooltip);
    this.modalBack = el('div'); this.modalBack.id = 'modal-back'; this.modalBack.classList.add('hidden');
    this.modal = el('div'); this.modal.id = 'modal'; this.modalBack.appendChild(this.modal);
    watchEmoji(this.modal);   // menu do jogo, ajuda, enciclopédia, créditos, briefing: emoji dos textos → glifos (src/ui/emoji.ts)
    this.chatEl = el('input', 'hidden') as HTMLInputElement; this.chatEl.id = 'chat'; this.chatEl.maxLength = 200; this.chatEl.placeholder = t('mp.chatPlaceholder');
    this.chatEl.style.cssText = 'position:fixed;left:50%;bottom:190px;transform:translateX(-50%);width:420px;background:#0f1628;color:#e5e7eb;border:1px solid #f2c14e;border-radius:6px;padding:6px 10px;font-size:14px;z-index:35';
    this.chatEl.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { const v = this.chatEl.value.trim(); if (v && this.onChat) this.onChat(v); this.closeChat(); } else if (e.key === 'Escape') this.closeChat(); });
    hud.appendChild(this.chatEl);
    this.modalBack.addEventListener('mousedown', (e) => { if (e.target === this.modalBack && this.modalDismissable) this.hideModal(); });
    this.root.appendChild(hud);
    this.root.appendChild(this.modalBack);   // fora do #hud: os modais (ajuda, atalhos) também servem ao menu principal
    syncUiZoom(this.modalBack);
    // tooltips genéricos
    hud.addEventListener('mouseover', (e) => { const t = (e.target as HTMLElement).closest('[data-tip]') as HTMLElement | null; if (t) this.showTooltip(t.dataset.tip!, e.clientX, e.clientY); });
    hud.addEventListener('mousemove', (e) => { const t = (e.target as HTMLElement).closest('[data-tip]') as HTMLElement | null; if (t) this.positionTooltip(e.clientX, e.clientY); else this.tooltip.classList.add('hidden'); });
    hud.addEventListener('mouseout', () => this.tooltip.classList.add('hidden'));
  }
  private modalDismissable = true;
  private menuOpen = false; private pausedBeforeMenu = false;

  get hudVisible() { return !this.root.querySelector('#hud')!.classList.contains('hidden'); }
  setVisible(v: boolean) { (this.root.querySelector('#hud') as HTMLElement).classList.toggle('hidden', !v); }

  showTooltip(html: string, x: number, y: number) { this.tooltip.innerHTML = tipHtml(html); this.tooltip.classList.remove('hidden'); this.positionTooltip(x, y); }
  hideTooltip() { this.tooltip.classList.add('hidden'); }
  private positionTooltip(x: number, y: number) {
    const r = this.tooltip.getBoundingClientRect();
    let tx = x + 14, ty = y - r.height - 10;
    if (tx + r.width > window.innerWidth - 8) tx = x - r.width - 14;
    if (ty < 50) ty = y + 18;
    this.tooltip.style.left = `${tx}px`; this.tooltip.style.top = `${ty}px`;
  }

  /** Visão de espectador: névoa desligada e todos visíveis no mapa e no minimapa (só renderização). */
  setRevealAll(v: boolean) { this.renderer.revealAll = v; this.minimap.revealAll = v; }

  // ---------------- Editor de mapas ----------------
  /** Liga/desliga o modo editor: CSS esconde .res, .age, botão de idade, #gods, #objectives, #idle, #selection, #commands; o minimapa é desenhado com { editor: true }. */
  setEditorMode(on: boolean) {
    this.editorMode = on;
    (this.root.querySelector('#hud') as HTMLElement).classList.toggle('editor', on);
    if (on) { this.objPanel.classList.add('hidden'); this.dlg.clear(); this.renderDialogue(); this.hideTooltip(); }
  }
  get editorModeOn() { return this.editorMode; }
  /** Painel do editor no lugar de #selection/#commands (escondidos por CSS). */
  mountBottom(e: HTMLElement) { this.bottom.appendChild(e); }
  unmountBottom(e: HTMLElement) { if (e.parentElement === this.bottom) this.bottom.removeChild(e); }
  /** Barra do editor dentro de #top (antes do botão de som, que continua visível). */
  mountTop(e: HTMLElement) { this.top.insertBefore(e, this.testEl); }
  unmountTop(e: HTMLElement) { if (e.parentElement === this.top) this.top.removeChild(e); }
  /** Selo "Modo de teste · Voltar ao editor" (cb = null esconde). */
  setTestMode(cb: (() => void) | null) { this.onBackToEditor = cb; this.testEl.classList.toggle('hidden', !cb); }
  /** Aviso na coluna de mensagens. Texto puro (textContent): chat, nomes de jogadores e textos de cenário vêm de outros pares. */
  toast(text: string, kind: 'info' | 'warn' | 'good' | 'gold' = 'info', pos?: { x: number; y: number }) {
    const t = el('div', `toast ${kind}`); t.textContent = noEmoji(text);   // textos de roteiro e mensagens do núcleo podem trazer emoji
    if (pos) t.addEventListener('click', () => { this.renderer.cam.centerOn(pos.x, pos.y); });
    this.msgPanel.appendChild(t);
    while (this.msgPanel.children.length > 6) this.msgPanel.removeChild(this.msgPanel.firstChild!);
    setTimeout(() => { t.style.transition = 'opacity 0.6s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 600); }, 7000);
  }

  // ---------------- Atualização ----------------
  update(dtReal: number) {
    const s = this.session; if (!s) return;
    this.acc += dtReal; this.mmAcc += dtReal;
    this.fitLayout();
    this.drainEvents();
    if (this.dlg.update(performance.now())) this.renderDialogue();   // fila de falas: a próxima entra quando a atual vence
    if (this.mmAcc > 0.15) { this.mmAcc = 0; this.minimap.draw(s.state, this.renderer.cam, s.local, { editor: this.editorMode }); }
    if (this.editorMode) return;   // editor: nada de recursos, seleção, poderes, objetivos ou fim de jogo
    if (this.acc > 0.12) { this.acc = 0; this.refreshTop(); this.refreshSelection(false); this.refreshGods(); this.refreshObjectives(false); this.refreshStudyTree(); }
    if (s.state.gameOver && !this.gameOverShown) { this.gameOverShown = true; this.showGameOver(); }
  }

  /** Largura útil do HUD (janela ÷ escala da interface) abaixo de 1180 px: barra superior compacta (Steam Deck a 130 %). */
  private fitLayout() {
    const hud = this.root.querySelector('#hud') as HTMLElement;
    const narrow = window.innerWidth / (parseFloat(hud.style.zoom) || 1) < 1180;
    if (hud.classList.contains('narrow') !== narrow) hud.classList.toggle('narrow', narrow);
  }

  private drainEvents() {
    const s = this.session!; const st = s.state;
    // O núcleo descarta eventos acima de 200 (MAX_EVENTS) e os índices andam: reposiciona o cursor pelo último evento visto
    if (this.lastEv) { const i = st.events.lastIndexOf(this.lastEv); s.eventCursor = i >= 0 ? i + 1 : 0; }
    while (s.eventCursor < st.events.length) {
      const e: GameEvent = st.events[s.eventCursor++];
      const mine = e.player === s.local;
      const global = ['age', 'victory', 'defeated', 'wonder', 'wonderLost', 'titan', 'titanDied', 'ceasefire', 'powerUsed', 'dialogue', 'objective'].includes(e.type);
      if (!mine && !global) continue;
      if (e.type === 'dialogue') { this.showDialogue(e.data ?? '', e.text ?? ''); continue; }
      if (e.type === 'objective') { this.toast(e.text ?? '', e.data === 'done' ? 'good' : e.data === 'failed' ? 'warn' : 'gold'); this.audio.play(e.data === 'done' ? 'complete' : 'alert'); this.refreshObjectives(true); continue; }
      if (e.type === 'idleVillager' && !e.text) continue;
      let kind: 'info' | 'warn' | 'good' | 'gold' = 'info';
      if (e.type === 'underAttack' || e.type === 'buildingLost' || e.type === 'heroDied' || e.type === 'wonderLost') kind = 'warn';
      if (e.type === 'built' || e.type === 'research' || e.type === 'victory') kind = 'good';
      if (e.type === 'age' || e.type === 'wonder' || e.type === 'titan' || e.type === 'power' || e.type === 'powerUsed') kind = 'gold';
      if (e.x !== undefined && e.y !== undefined) s.lastEvent = { x: e.x, y: e.y };
      if (e.text) this.toast(e.text, kind, e.x !== undefined && e.y !== undefined ? { x: e.x, y: e.y } : undefined);
      if (e.type === 'underAttack' && mine) { this.onAlert?.(); if (e.x !== undefined && e.y !== undefined) this.minimap.ping(e.x, e.y); }   // sons vêm de src/audio/events.ts
      if (e.type === 'age' && mine) { this.refreshGods(); this.lastCmdKey = ''; }
    }
    // Sons do mundo e dos eventos (posicionais, com névoa e agregação): src/audio/events.ts, chamado pelo laço em main.ts
    this.lastEv = s.eventCursor > 0 ? st.events[s.eventCursor - 1] ?? null : null;
  }

  refreshTop() {
    const s = this.session; if (!s) return;
    if (this.muteBtn && this.muteBtn.dataset.muted !== String(this.audio.muted)) { this.muteBtn.innerHTML = glyph(this.audio.muted ? 'mute' : 'sound'); this.muteBtn.dataset.muted = String(this.audio.muted); }   // mudo pelas opções ou Ctrl+M
    const p = s.player;
    for (const r of RESOURCES) { const e = this.resEls[r]; e.querySelector('b')!.textContent = String(Math.floor(p.resources[r])); e.classList.toggle('low', p.resources[r] < 50 && r !== 'knowledge' && r !== 'favor'); }
    this.popEl.querySelector('b')!.textContent = `${p.pop}/${p.popCap}`; this.popEl.classList.toggle('low', p.pop >= p.popCap);
    const age = AGES[p.age];
    // (só redesenha quando muda: o innerHTML com <img> a cada 0,12 s faria os retratos piscarem)
    const ageKey = `${p.age}|${p.god}|${p.minorGods.join(',')}|${iconsGeneration()}`;
    if (ageKey !== this.lastAgeKey) {
      this.lastAgeKey = ageKey;
      this.ageEl.innerHTML = `${ic.age(p.age, 'sm')} ${age.name} · ${ic.god(p.god, 'sm')} ${MAJOR_GODS[p.god].name}${p.minorGods.length ? ' · ' + p.minorGods.map((g) => ic.god(g, 'sm')).join('') : ''}`;
      this.ageEl.title = `${age.name} · ${MAJOR_GODS[p.god].name}${p.minorGods.length ? ' · ' + p.minorGods.map((g) => MINOR_GODS[g].name).join(', ') : ''}`;   // texto completo quando a barra compacta corta com reticências
    }
    const adv = canAdvanceAge(s.state, p);
    const inProgress = [...s.state.buildings.values()].some((b) => b.owner === p.id && b.queue.some((q) => q.kind === 'age'));
    const capped = p.age < AGES.length - 1 && p.age >= maxAgeOf(s.state, p.id);   // G6: Idade máxima da missão (o tooltip diz o motivo)
    const ageLbl = inProgress ? t('top.advancing') : p.age >= AGES.length - 1 ? t('top.maxAge') : `${glyph('up')} ${AGES[p.age + 1].name}`;
    if (this.ageBtn.dataset.lbl !== ageLbl) { this.ageBtn.dataset.lbl = ageLbl; this.ageBtn.innerHTML = ageLbl; }
    (this.ageBtn as HTMLButtonElement).disabled = inProgress || p.age >= AGES.length - 1 || capped;
    this.ageBtn.dataset.tip = p.age >= AGES.length - 1 ? t('top.maxAgeTip') : `<b>${AGES[p.age + 1].name}</b><div class="cost">${fmtCost(AGES[p.age + 1].cost as Record<string, number>, p)}</div><div class="desc">${AGES[p.age + 1].desc}</div>${adv.ok ? '' : `<div style="color:#ef4444;margin-top:4px">${adv.reason ?? ''}</div>`}`;
    this.ageBtn.classList.toggle('primary', adv.ok);
    const k = s.state.koth;
    const relics = relicsOf(s.state, p.id);
    // em cenário (m10) a vitória nativa do Rei da Colina não roda e a conta que vale é a do roteiro (barra do painel, G4): a barra
    // do topo não mostra a posse do modo, que conta o time inteiro (na m10, Hades sozinho não conta)
    this.modeEl.textContent = (s.spectator ? t('top.spectator') + ' ' : '') + (k && !s.state.scenario ? (k.team === -1 ? t('top.kothNone') : t('top.koth', { who: teamNames(s.state, k.team), s: k.seconds, total: KOTH_SECONDS })) : '') + (relics > 0 ? ' ' + t('top.relics', { n: relics }) : '');
    this.modeEl.dataset.tip = relics > 0 ? t('top.relicsTip') : '';
    const waiting = (s.scheduler as { waiting?: number }).waiting ?? 0;
    this.clockEl.textContent = fmtTime(s.state.time) + (s.paused ? ' ‖' : s.speed !== 1 ? ` ${s.speed}×` : '') + (waiting > 10 ? ' ' + noEmoji(t('top.waiting')) : '');
    let idle = 0;
    for (const u of s.state.units.values()) if (u.owner === p.id && u.type === 'villager' && u.state === 'idle' && !u.order) idle++;
    this.idleBtn.textContent = noEmoji(t('top.idle', { n: idle }));
    this.idleBtn.classList.toggle('gold', idle > 0);
  }

  selectIdleVillager() {
    const s = this.session; if (!s) return;
    const idle = [...s.state.units.values()].filter((u) => u.owner === s.local && u.type === 'villager' && u.state === 'idle' && !u.order);
    if (idle.length === 0) { this.toast(t('msg.noIdle'), 'info'); return; }
    const cur = [...s.selection][0];
    const i = idle.findIndex((u) => u.id === cur);
    const next = idle[(i + 1) % idle.length];
    s.select([next.id]); this.renderer.cam.centerOn(next.x, next.y);
  }

  /** Falas do cenário em fila (src/ui/dialogue.ts): as do mesmo segundo aparecem uma depois da outra, sem se sobrescrever. */
  private dlg = new DialogueQueue();
  showDialogue(meta: string, text: string) {
    this.dlg.push({ meta, text }, performance.now());
    this.renderDialogue();
  }

  /** Desenha a fala atual da fila (com quantas esperam) ou esconde o painel; clicar passa à próxima. */
  private renderDialogue() {
    const d = this.dlg.current;
    if (!d) { this.dlgPanel.classList.add('hidden'); return; }
    const [icon, speaker] = d.meta.split('|');
    const more = this.dlg.waiting > 0 ? ` · +${this.dlg.waiting}` : '';
    this.dlgPanel.innerHTML = `<span class="ic">${speakerIcon(icon ?? '', 'hic-portrait')}</span><div><b>${esc(noEmoji(speaker ?? ''))}</b><div>${esc(noEmoji(d.text))}</div></div><small>${t('modal.close').toLowerCase()}${more}</small>`;
    this.dlgPanel.classList.remove('hidden');
  }

  private lastObjKey = '';
  refreshObjectives(force: boolean) {
    const s = this.session; if (!s || !s.state.scenario) { this.objPanel.classList.add('hidden'); return; }
    const def = scenarioOf(s.state); if (!def) return;
    const sc = s.state.scenario;
    // Indicadores genéricos de def.hud (campanha em TS ou cenário JSON): cronômetros (absolutos ou relativos, G4) e barras (obra ou variável, G4)
    const extra = scenarioHudHtml(def, s.state);
    const key = Object.entries(sc.objectives).map(([k, v]) => `${k}${v}${sc.hidden[k] ? 'h' : ''}`).join(',') + Math.floor(s.state.time / 5) + '|' + extra;
    if (!force && key === this.lastObjKey) return;
    this.lastObjKey = key;
    const rows = def.objectives.filter((o) => !sc.hidden[o.id]).map((o) => { const st = sc.objectives[o.id]; return `<li class="${st}">${glyph(st === 'done' ? 'check' : st === 'failed' ? 'cross' : 'box', `obj-${st}`)} ${esc(noEmoji(o.text))}${o.optional ? ` <small>${t('mission.optional')}</small>` : ''}</li>`; }).join('');
    this.objPanel.innerHTML = `<h4>${missionIcon(def.id, def.icon, 'sm')} ${esc(noEmoji(def.title))}</h4><ul>${rows}</ul>${extra}`;   // textos do cenário escapados: o JSON pode vir do anfitrião
    this.objPanel.classList.remove('hidden');
  }

  refreshGods() {
    const s = this.session; if (!s) return;
    const p = s.player;
    // G11: o roteiro tirou (ou gastou) o poder que estava sendo mirado: sai do modo de mira
    if (s.ui.mode === 'power' && s.ui.powerId && !p.powers.some((x) => x.id === s.ui.powerId && !x.used)) { this.cancelMode(); return; }
    const key = p.powers.map((x) => `${x.id}${x.used ? 1 : 0}`).join(',') + s.ui.powerId + '|' + p.god + p.minorGods.join(',') + '|' + iconsGeneration();
    if (this.godsPanel.dataset.key === key) return;
    this.godsPanel.dataset.key = key;
    this.godsPanel.innerHTML = '';
    // panteão do jogador: o deus maior e os menores escolhidos, em medalhões (Etapa 7: retratos no painel de deuses)
    const pan = el('div', 'pantheon', `${ic.god(p.god, 'md')}${p.minorGods.map((g) => ic.god(g, 'md')).join('')}`);
    pan.dataset.tip = `<b>${MAJOR_GODS[p.god].name}</b> — ${MAJOR_GODS[p.god].title}${p.minorGods.map((g) => `<div class="desc">${MINOR_GODS[g].name} — ${MINOR_GODS[g].title}</div>`).join('')}`;
    this.godsPanel.appendChild(pan);
    for (const ps of p.powers) {
      const def = POWERS[ps.id];
      const e = el('div', `pw ${ps.used ? 'used' : ''} ${s.ui.powerId === ps.id ? 'active' : ''}`, `<span class="ic">${ic.power(ps.id)}</span><span>${def.name}<br><small style="color:#9aa5b8">${ps.used ? t('power.used') : def.targeting === 'global' ? t('power.clickInvoke') : t('power.clickTarget')}</small></span>`);
      e.dataset.tip = `<b>${def.name}</b><div class="desc">${def.desc}</div>`;
      if (!ps.used) e.addEventListener('click', () => this.activatePower(ps.id));
      this.godsPanel.appendChild(e);
    }
  }

  activatePower(id: string) {
    const s = this.session!; const def = POWERS[id];
    if (def.targeting === 'global') { s.issue({ type: 'power', player: s.local, power: id }); this.audio.play('power'); return; }
    s.ui.mode = 'power'; s.ui.powerId = id; s.ui.placeType = null;
    document.body.className = 'cur-power';
    this.toast(t('msg.powerHint', { power: def.name, target: t(def.targeting === 'unit' ? 'msg.powerTarget.unit' : def.targeting === 'building' ? 'msg.powerTarget.building' : 'msg.powerTarget.place') }), 'gold');
    this.refreshGods();
  }

  cancelMode() {
    const s = this.session; if (!s) return;
    s.ui.mode = 'normal'; s.ui.placeType = null; s.ui.powerId = null; s.ui.wallStart = null;
    document.body.className = '';
    this.lastCmdKey = ''; this.refreshGods(); this.refreshSelection(true);
  }

  // ---------------- Seleção ----------------
  refreshSelection(force: boolean) {
    const s = this.session; if (!s) return;
    s.pruneSelection();
    const units = s.selectedUnits(), blds = s.selectedBuildings();
    const key = [...s.selection].join(',') + '|' + units.map((u) => `${u.hp}`).join(',') + '|' + blds.map((b) => `${b.hp}${b.complete}${b.queue.map((q) => q.id + Math.floor(q.elapsed)).join('.')}${b.scholars}g${b.garrison.length}`).join(',') + '|' + s.ui.mode + s.ui.placeType + '|' + s.player.age + s.player.techs.length + Math.floor(s.state.tick / 10) + '|' + (this.renderer.art?.generation ?? 0) + '|' + iconsGeneration();
    if (!force && key === this.lastSelKey) return;
    this.lastSelKey = key;
    this.selPanel.innerHTML = '';
    if (units.length + blds.length === 0) { this.selPanel.innerHTML = `<div class="desc">${t('sel.hint')}</div>`; this.refreshCommands(force); return; }
    if (units.length + blds.length === 1) {
      if (units.length === 1) this.selPanel.appendChild(this.unitCard(units[0]));
      else this.selPanel.appendChild(this.buildingCard(blds[0]));
    } else {
      const title = el('div', 'title', t('sel.count', { n: units.length + blds.length }));
      this.selPanel.appendChild(title);
      const multi = el('div', 'multi');
      for (const e of [...units, ...blds].slice(0, 40)) {
        const def = e.kind === 'unit' ? UNITS[e.type] : BUILDINGS[e.type];
        const mi = el('div', 'mi', `${e.kind === 'building' ? this.bIcon(e.type, e.owner) : ic.unit(e.type, s.state.players[e.owner].color)}<div class="hp"><div style="width:${Math.round((e.hp / e.maxHp) * 100)}%"></div></div>`);
        mi.dataset.tip = `<b>${esc(entityDisplayName(e))}</b> ${Math.round(e.hp)}/${e.maxHp}`;
        mi.addEventListener('click', (ev) => { if (ev.ctrlKey) s.select([e.id], true); else s.select([e.id]); });
        multi.appendChild(mi);
      }
      this.selPanel.appendChild(multi);
    }
    this.refreshCommands(force);
  }

  private unitCard(u: Unit): HTMLElement {
    const s = this.session!; const def = UNITS[u.type]; const owner = s.state.players[u.owner];
    const st = getUnitStats(s.state, owner, u.type);
    const c = el('div');
    // G8: nome próprio do cenário no idioma atual (o tipo vai na descrição) e nome da facção por idioma
    c.appendChild(el('div', 'title', `<span class="icon">${ic.unit(u.type, owner.color, 'big')}</span>${esc(entityDisplayName(u))} <small style="color:${'#' + owner.color.toString(16).padStart(6, '0')}">${esc(playerDisplayName(s.state, u.owner))}</small>`));
    c.appendChild(el('div', 'hpbar', `<div style="width:${Math.round((u.hp / u.maxHp) * 100)}%"></div>`));
    const stats: string[] = [`${t('sel.hp')} <b>${Math.round(u.hp)}/${u.maxHp}</b>`];
    if (st.attack > 0) stats.push(`${t('sel.attack')} <b>${st.attack}</b> (${t(`dmg.${def.attackType}`)})`);
    stats.push(`${t('sel.armor')} <b>${Math.round(st.armor.hack * 100)}/${Math.round(st.armor.pierce * 100)}/${Math.round(st.armor.crush * 100)}%</b>`);
    if (st.range >= 1.6) stats.push(`${t('sel.range')} <b>${st.range}</b>`);
    stats.push(`${t('sel.speed')} <b>${st.speed.toFixed(1)}</b>`);
    if (def.special === 'heads') stats.push(`${t('sel.heads')} <b>${u.heads}</b>`);
    if (u.kills > 0) stats.push(`${t('sel.kills')} <b>${u.kills}</b>`);
    if (rankOf(u.kills) > 0 && UNITS[u.type].tags.includes('military') && !UNITS[u.type].tags.includes('titan')) stats.push(`${t('sel.rank')} <b class="rank">${glyph('star').repeat(rankOf(u.kills))}</b>`);
    if (u.owner === s.local) stats.push(`${t('sel.stance')} <b>${t(`stance.${u.stance}`)}</b>`);
    if (u.carry && u.carryAmt > 0) stats.push(`${t('sel.carry')} <b>${ic.res(u.carry)} ${Math.floor(u.carryAmt)}</b>`);
    if (u.owner === s.local) stats.push(`${t('sel.state')} <b>${t(`state.${u.state}`)}</b>`);
    c.appendChild(el('div', 'stats', stats.map((x) => `<span>${x}</span>`).join('')));
    const bonuses = Object.entries(def.bonus).map(([k, v]) => `×${v} vs ${t(`vs.${k}`)}`).join(', ');
    c.appendChild(el('div', 'desc', (u.displayName ? `<b>${def.name}</b> · ` : '') + def.desc + (bonuses ? ` <i>(${bonuses})</i>` : '')));
    return c;
  }

  private buildingCard(b: Building): HTMLElement {
    const s = this.session!; const def = BUILDINGS[b.type]; const owner = s.state.players[b.owner];
    const st = getBuildingStats(s.state, owner, b.type);
    const c = el('div');
    c.appendChild(el('div', 'title', `<span class="icon">${this.bIcon(b.type, b.owner, 'big')}</span>${esc(entityDisplayName(b))} <small style="color:${'#' + owner.color.toString(16).padStart(6, '0')}">${esc(playerDisplayName(s.state, b.owner))}</small>`));
    if (!b.complete) c.appendChild(el('div', 'hpbar', `<div style="width:${Math.round((b.progress / st.buildTime) * 100)}%;background:#60a5fa"></div>`));
    else c.appendChild(el('div', 'hpbar', `<div style="width:${Math.round((b.hp / b.maxHp) * 100)}%"></div>`));
    const stats: string[] = [`${t('sel.hp')} <b>${Math.round(b.hp)}/${b.maxHp}</b>`];
    if (!b.complete) stats.push(`${t('sel.construction')} <b>${Math.round((b.progress / st.buildTime) * 100)}%</b>`);
    if (st.attack > 0) stats.push(`${t('sel.attack')} <b>${st.attack}</b> · ${t('sel.range')} <b>${st.range}</b>`);
    if (def.territory) stats.push(`${t('sel.border')} <b>${st.territory}</b>`);
    if (def.popCap) stats.push(`${t('sel.popCap')} <b>+${def.popCap}</b>`);
    if (def.worship) { let n = 0; for (const u of s.state.units.values()) if (u.state === 'pray' && u.nodeId === -b.id) n++; stats.push(`${t('sel.worshippers')} <b>${n}</b>`); }
    if (def.scholars) stats.push(`${t('sel.scholars')} <b>${b.scholars}/${MAX_SCHOLARS}</b>`);
    if (def.queueMax) stats.push(`${t('sel.queue')} <b>${b.queue.length}/${def.queueMax}</b>`);
    if (def.farm) stats.push(`${t('sel.farmers')} <b>${farmGatherers(s.state, b.id)}/1</b>`);
    if (def.garrison) stats.push(`${t('sel.garrison')} <b>${b.garrison.length}/${def.garrison}</b>${b.garrison.length >= 3 ? ` (${t('sel.extraArrows', { n: Math.min(4, Math.floor(b.garrison.length / 3)) })})` : ''}`);
    // em cenário a vitória nativa por Maravilha não roda (G2): a guarda, se houver, é do roteiro, e este cronômetro enganaria
    if (def.wonder && b.complete && b.wonderStart >= 0 && !s.state.scenario) stats.push(`${t('sel.victoryIn')} <b>${fmtTime(Math.max(0, WONDER_VICTORY_SECONDS - (s.state.tick - b.wonderStart) / TICK_RATE))}</b>`);
    if (b.disabledUntil > s.state.tick) stats.push(`<span style="color:#c084fc">${t('sel.pestilence', { n: Math.ceil((b.disabledUntil - s.state.tick) / TICK_RATE) })}</span>`);
    c.appendChild(el('div', 'stats', stats.map((x) => `<span>${x}</span>`).join('')));
    if (b.owner === s.local && b.queue.length > 0) {
      const q = el('div', 'queue');
      b.queue.forEach((item, i) => {
        const icon = item.kind === 'unit' ? ic.unit(item.id, owner.color) : item.kind === 'tech' ? ic.tech(item.id) : item.kind === 'scholar' ? `<span class="hic hic-gly">${glyph('scholar')}</span>` : ic.age(owner.age + 1);
        const name = item.kind === 'unit' ? UNITS[item.id].name : item.kind === 'tech' ? TECHS[item.id].name : item.kind === 'scholar' ? t('cmd.scholar') : `${AGES[owner.age + 1]?.name ?? ''}`;
        const qi = el('div', 'qi', `${icon}<div class="prog" style="width:${i === 0 ? Math.round((item.elapsed / item.total) * 100) : 0}%"></div>`);
        qi.dataset.tip = `<b>${name}</b><div class="desc">${i === 0 ? t('sel.remaining', { n: Math.ceil(item.total - item.elapsed) }) : t('sel.queued')} · ${t('sel.clickCancel')}</div>`;
        qi.addEventListener('click', () => { s.issue({ type: 'cancel', player: s.local, buildingId: b.id, index: i, itemId: item.uid }); });
        q.appendChild(qi);
      });
      c.appendChild(q);
    } else c.appendChild(el('div', 'desc', (b.displayName ? `<b>${def.name}</b> · ` : '') + def.desc));
    return c;
  }

  /** Ícone de um edifício para o HUD (atlas `hud`, com os estandartes na cor do dono). */
  private bIcon(type: string, owner: number, cls?: string): string {
    return ic.bld(type, PLAYER_COLORS[owner % PLAYER_COLORS.length].num, cls);
  }

  // ---------------- Comandos ----------------
  refreshCommands(force: boolean) {
    const s = this.session; if (!s) return;
    const p = s.player;
    const units = s.ownSelectedUnits(); const b = s.ownSelectedBuilding();
    const key = `${[...s.selection].join(',')}|${s.ui.mode}|${s.ui.placeType}|${this.renderer.art?.generation ?? 0}|${iconsGeneration()}|${p.age}|${p.techs.length}|${p.minorGods.length}|${b?.garrison.length ?? 0}|${Object.values(p.resources).map((v) => Math.floor(v / 25)).join(',')}|${p.pop}/${p.popCap}|${b?.queue.length}|${b?.scholars}`;
    if (!force && key === this.lastCmdKey) return;
    this.lastCmdKey = key;
    // a grade rola (styles.css): com a mesma seleção, o redesenho (recursos, fila…) mantém a rolagem; seleção nova volta ao topo
    const sel = `${[...s.selection].join(',')}|${s.ui.mode}|${s.ui.placeType}`;
    const top = sel === this.lastCmdSel ? this.cmdPanel.scrollTop : 0;
    this.lastCmdSel = sel;
    if (top > 0) queueMicrotask(() => { this.cmdPanel.scrollTop = top; });   // depois de repovoar (o corpo tem vários return)
    this.cmdPanel.innerHTML = '';
    const add = (icon: string, label: string, tip: string, hk: string | null, onClick: (() => void) | null, opts: { disabled?: boolean; active?: boolean; used?: boolean } = {}) => {
      const btn = el('button', `cmd ${opts.active ? 'active' : ''} ${opts.used ? 'used' : ''}`, `<span class="ic">${icon}</span><span class="lbl">${label}</span>${hk ? `<span class="hk">${hk}</span>` : ''}`) as HTMLButtonElement;
      btn.dataset.tip = tipHtml(tip); btn.disabled = !!opts.disabled;
      if (onClick) btn.addEventListener('click', () => { if (btn.disabled) return; onClick(); });
      this.cmdPanel.appendChild(btn);
      return btn;
    };
    if (units.length > 0) {
      const villagers = units.filter((u) => UNITS[u.type].canBuild);
      const military = units.filter((u) => !UNITS[u.type].canBuild && UNITS[u.type].attack > 0);
      if (villagers.length > 0 && military.length === 0) {
        for (const type of BUILD_MENU) {
          const def = BUILDINGS[type];
          if (def.age > p.age && def.age > p.age + 1) continue;
          const cost = getBuildingStats(s.state, p, type).cost;
          const lim = buildingLimitOk(s.state, p, type);
          const reasons: string[] = [];
          if (def.age > p.age) reasons.push(t('cmd.requiresAge', { age: AGES[def.age].name }));
          if (!lim.ok) reasons.push(lim.reason ?? '');
          if (!canAfford(p, cost)) reasons.push(t('cmd.noResources'));
          const tip = `${t('cmd.buildTipB', { name: def.name, cost: fmtCost(cost, p), desc: def.desc })}${reasons.length ? `<div style="color:#ef4444;margin-top:4px">${reasons.join(' · ')}</div>` : ''}`;
          add(this.bIcon(type, s.local), def.name, tip, def.hotkey ?? null, () => this.startPlacement(type), { disabled: reasons.length > 0, active: s.ui.mode === 'place' && s.ui.placeType === type });
        }
        add(glyph('stop'), t('cmd.stop'), t('cmd.stopTipV'), '⇧S', () => { s.issue({ type: 'stop', player: s.local, ids: units.map((u) => u.id) }); });
      } else {
        const ids = units.map((u) => u.id);
        add(glyph('attack'), t('cmd.attackMove'), t('cmd.attackMoveTip'), 'A', () => { s.ui.mode = 'attackMove'; document.body.className = 'cur-attack'; this.lastCmdKey = ''; this.refreshCommands(true); }, { active: s.ui.mode === 'attackMove' });
        const seenAb = new Set<string>();
        for (const h of units) {
          const abId = UNITS[h.type].ability; if (!abId || seenAb.has(h.type)) continue; seenAb.add(h.type);
          const ab = ABILITIES[abId]; const left = Math.ceil((h.abilityReadyAt - s.state.tick) / TICK_RATE);
          add(ic.ability(abId), ab.name, `<b>${ab.name}</b> · ${UNITS[h.type].name}<div class="desc">${ab.desc}</div><div>${left > 0 ? t('cmd.abilityCooldown', { s: left }) : t('cmd.abilityReady')}</div>`, 'Q', () => { this.issueChecked({ type: 'ability', player: s.local, unitId: h.id }); this.lastCmdKey = ''; }, { disabled: left > 0 });
        }
        add(glyph('stop'), t('cmd.stop'), t('cmd.stopTip'), 'S', () => { s.issue({ type: 'stop', player: s.local, ids }); });
        if (units.length >= 4) for (const f of FORMATIONS) add(glyph(FORMATION_GLYPHS[f]), t(`formation.${f}`), `<b>${t(`formation.${f}`)}</b><div class="desc">${t(`formation.${f}Tip`)}</div>`, null, () => { s.ui.formation = f; this.lastCmdKey = ''; this.refreshCommands(true); }, { active: s.ui.formation === f });
        const stance = units[0].stance;
        for (const k of Object.keys(STANCES)) add(glyph(k === 'aggressive' ? 'aggressive' : k === 'defensive' ? 'defensive' : 'passive'), t(`stance.${k}`), `<b>${t('cmd.stance', { name: t(`stance.${k}`) })}</b><div class="desc">${t(`cmd.stanceTip.${k}`)}</div>`, null, () => { s.issue({ type: 'stance', player: s.local, ids, stance: k as Stance }); this.lastCmdKey = ''; }, { active: stance === k });
        if (villagers.length > 0) add(glyph('build'), t('cmd.build'), t('cmd.buildTip'), null, () => { s.select(villagers.map((u) => u.id)); });
      }
      if (units.some((u) => ['civilian', 'infantry', 'archer', 'skirmisher', 'hero'].some((t) => UNITS[u.type].tags.includes(t)))) add(glyph('garrison'), t('cmd.garrison'), t('cmd.garrisonTip'), null, () => this.garrisonNearest(units));
      add(glyph('trash'), t('cmd.dismiss'), t('cmd.dismissTip'), 'Del', () => { s.issue({ type: 'delete', player: s.local, ids: units.map((u) => u.id) }); });
      return;
    }
    if (b) {
      const def = BUILDINGS[b.type];
      if (!b.complete) { add(glyph('cancel'), t('cmd.cancelBuild'), t('cmd.cancelBuildTip'), null, () => { s.issue({ type: 'cancel', player: s.local, buildingId: b.id, index: -1 }); s.select([]); }); return; }
      if (def.library) {
        const adv = canAdvanceAge(s.state, p, b);
        add(ic.age(Math.min(p.age + 1, AGES.length - 1)), p.age < AGES.length - 1 ? AGES[p.age + 1].short : t('cmd.ageMax'), this.ageBtn.dataset.tip ?? '', 'E', () => this.tryAdvanceAge(b), { disabled: !adv.ok });
        add(glyph('scroll'), t('cmd.studyTree'), t('cmd.studyTreeTip'), 'F3', () => this.showStudyTree());
      }
      if (def.trains) for (const ut of def.trains) {
        const ud = UNITS[ut];
        if (ud.age > p.age + 1) continue;
        if (ud.god) { const major = MAJOR_GODS[p.god]; const ok = major.mythUnit === ut || p.minorGods.some((g) => MINOR_GODS[g].mythUnit === ut) || ud.god === p.god; if (!ok) continue; }
        const st = getUnitStats(s.state, p, ut);
        const c = canTrain(s.state, p, b, ut);
        const tip = `${t('cmd.trainTip', { name: ud.name, cost: fmtCost(st.cost, p), time: Math.round(st.trainTime), pop: ud.pop, desc: ud.desc, hp: st.hp, attack: st.attack, range: st.range >= 1.6 ? st.range : t('sel.melee') })}${c.ok ? '' : `<div style="color:#ef4444;margin-top:4px">${c.reason ?? (ud.age > p.age ? t('cmd.requiresAge', { age: AGES[ud.age].name }) : '')}</div>`}`;
        add(ic.unit(ut, p.color), ud.name, tip, ud.hotkey ?? null, () => { const r = this.issueChecked({ type: 'train', player: s.local, buildingId: b.id, unit: ut }); if (r) this.audio.play('command'); }, { disabled: !c.ok });
      }
      if (def.scholars) {
        const ch = canHireScholar(s.state, p, b); const c = ch.ok ? '' : (ch.reason ?? t('cmd.noResources'));
        add(glyph('scholar'), t('cmd.scholar'), `${t('cmd.scholarTip', { cost: fmtCost(SCHOLAR_COST, p), max: MAX_SCHOLARS })}${c ? `<div style="color:#ef4444">${c}</div>` : ''}`, 'Q', () => this.issueChecked({ type: 'hireScholar', player: s.local, buildingId: b.id }), { disabled: !!c });
      }
      for (const tech of Object.values(TECHS)) {
        if (tech.building !== b.type || p.techs.includes(tech.id)) continue;
        if (tech.age > p.age + 1) continue;
        if (tech.god && !p.minorGods.includes(tech.god) && p.god !== tech.god) continue;
        if (tech.prereq.some((pr) => !p.techs.includes(pr))) continue;   // mostra só o próximo nível de cada linha
        const cost = techCost(p, tech.id);
        const c = canResearch(s.state, p, b, tech.id);
        const tip = `${t('cmd.techTip', { name: tech.name, cost: fmtCost(cost, p), time: tech.time, desc: tech.desc })}${c.ok ? '' : `<div style="color:#ef4444;margin-top:4px">${c.reason ?? (tech.age > p.age ? t('cmd.requiresAge', { age: AGES[tech.age].name }) : '')}</div>`}`;
        add(ic.tech(tech.id), tech.name, tip, null, () => { if (this.issueChecked({ type: 'research', player: s.local, buildingId: b.id, tech: tech.id })) this.audio.play('command'); }, { disabled: !c.ok });
      }
      if (def.trade) {
        for (const r of ['food', 'wood'] as ResourceType[]) {
          const tax = 0.3 * p.mods.player.tradeTax;
          const buy = Math.round(p.prices[r] * (1 + tax)), sell = Math.round(p.prices[r] * (1 - tax));
          add(glyph('buy'), t('cmd.buy', { res: t(`res.${r}`) }), t('cmd.buyTip', { res: t(`res.${r}`), price: buy }), null, () => { if (this.issueChecked({ type: 'trade', player: s.local, action: 'buy', resource: r })) this.audio.play('coin'); }, { disabled: p.resources.gold < buy });
          add(glyph('sell'), t('cmd.sell', { res: t(`res.${r}`) }), t('cmd.sellTip', { res: t(`res.${r}`), price: sell }), null, () => { if (this.issueChecked({ type: 'trade', player: s.local, action: 'sell', resource: r })) this.audio.play('coin'); }, { disabled: p.resources[r] < 100 });
        }
      }
      if (def.worship) add(glyph('release'), t('cmd.releaseWorship'), t('cmd.releaseWorshipTip'), null, () => s.issue({ type: 'ungarrison', player: s.local, buildingId: b.id }));
      if (def.garrison) add(glyph('release'), t('cmd.release', { n: b.garrison.length }), t('cmd.releaseTip'), 'U', () => s.issue({ type: 'ungarrison', player: s.local, buildingId: b.id }), { disabled: b.garrison.length === 0 });
      if (def.trains || def.scholars) add(glyph('rally'), t('cmd.rally'), t('cmd.rallyTip'), 'R', () => { s.ui.mode = 'rally'; document.body.className = 'cur-rally'; }, { active: s.ui.mode === 'rally' });
      add(glyph('trash'), t('cmd.demolish'), t('cmd.demolishTip'), 'Del', () => { s.issue({ type: 'delete', player: s.local, ids: [b.id] }); s.select([]); });
    }
  }

  garrisonNearest(units: Unit[]) {
    const s = this.session!;
    const cx = units.reduce((a, u) => a + u.x, 0) / units.length, cy = units.reduce((a, u) => a + u.y, 0) / units.length;
    let best: Building | null = null, bestD = Infinity;
    for (const b of s.state.buildings.values()) {
      if (b.dead || !b.complete || s.state.players[b.owner].team !== s.player.team) continue;
      const cap = BUILDINGS[b.type].garrison ?? 0; if (!cap || b.garrison.length >= cap) continue;
      const d = (b.x - cx) ** 2 + (b.y - cy) ** 2; if (d < bestD) { bestD = d; best = b; }
    }
    if (!best) { this.toast(t('msg.noShelter'), 'warn'); return; }
    s.issue({ type: 'garrison', player: s.local, ids: units.map((u) => u.id), targetId: best.id });
    this.audio.play('command');
  }

  issueChecked(cmd: Parameters<Session['issue']>[0]): boolean {
    const s = this.session!;
    // Validação imediata para dar feedback (o comando real roda no próximo tick)
    const p = s.player;
    let check: { ok: boolean; reason?: string } = { ok: true };
    if (cmd.type === 'train') { const b = s.state.buildings.get(cmd.buildingId); if (b) check = canTrain(s.state, p, b, cmd.unit); }
    else if (cmd.type === 'research') { const b = s.state.buildings.get(cmd.buildingId); if (b) check = canResearch(s.state, p, b, cmd.tech); }
    else if (cmd.type === 'hireScholar') { const b = s.state.buildings.get(cmd.buildingId); if (b) check = canHireScholar(s.state, p, b); }
    if (!check.ok) { this.toast(check.reason ?? t('msg.cannot'), 'warn'); this.audio.play('error'); return false; }
    s.issue(cmd);
    return true;
  }

  startPlacement(type: string) {
    const s = this.session!;
    const def = BUILDINGS[type];
    if (def.age > s.player.age) { this.toast(t('err.requiresAge', { age: AGES[def.age].name }), 'warn'); return; }
    const lim = buildingLimitOk(s.state, s.player, type);
    if (!lim.ok) { this.toast(lim.reason ?? '', 'warn'); return; }
    const cost = getBuildingStats(s.state, s.player, type).cost;
    if (!canAfford(s.player, cost)) { this.toast(t('msg.missing', { list: missingResources(s.player, cost).map((r) => t(`res.${r}`)).join(', ') }), 'warn'); this.audio.play('error'); return; }
    s.ui.mode = 'place'; s.ui.placeType = type; s.ui.powerId = null; s.ui.wallStart = null;
    document.body.className = 'cur-place';
    this.lastCmdKey = ''; this.refreshCommands(true);
  }

  canPlaceHere(type: string, tx: number, ty: number): boolean { const s = this.session!; return canPlaceBuilding(s.state, s.player, type, tx, ty).ok; }

  private treeKey = '';
  showStudyTree() { if (!this.session) return; this.renderStudyTree(true); }
  private renderStudyTree(first: boolean) {
    const s = this.session!;
    const m = studyTreeModel(s.state, s.local, !!s.spectator);
    const fc = (c: Record<string, number>) => fmtCost(c, s.player);
    const old = this.modal.querySelector('.tree-body') as HTMLElement | null;
    const scroll = !first && old ? [old.scrollLeft, old.scrollTop] : null;
    const focus = !first ? ((document.activeElement as HTMLElement | null)?.dataset?.study ?? null) : null;
    const html = studyTreeHtml(m, fc);
    if (first) this.showModal(html); else this.modal.innerHTML = html;
    this.modal.classList.add('tree');   // depois do showModal, que zera className
    this.treeKey = studyTreeKey(s.state, s.local);
    const body = this.modal.querySelector('.tree-body') as HTMLElement;
    if (scroll) { body.scrollLeft = scroll[0]; body.scrollTop = scroll[1]; }
    const nodes = new Map<string, StudyNode>(m.rows.flatMap((r) => r.cells.flat()).map((x) => [x.id, x]));
    const detail = this.modal.querySelector('#tree-detail') as HTMLElement;
    this.modal.querySelectorAll<HTMLElement>('[data-study]').forEach((el) => {
      const x = nodes.get(el.dataset.study!); if (!x) return;
      const show = () => { detail.innerHTML = studyNodeDetail(x, fc); };
      el.addEventListener('mouseenter', show); el.addEventListener('focus', show);
      el.addEventListener('click', () => this.studyClick(x, m.readOnly));
      if (focus && el.dataset.study === focus) el.focus();
    });
    this.modal.querySelector('#m-close')!.addEventListener('click', () => this.hideModal());
  }
  private studyClick(x: StudyNode, readOnly: boolean) {
    if (readOnly || x.status !== 'available') { this.audio.play('error'); return; }
    const s = this.session!;
    const lib = pickLibrary(s.state, s.local);
    if (!lib) { this.toast(t('tree.noLibrary'), 'warn'); return; }
    if (x.kind === 'age') { this.tryAdvanceAge(lib); return; }
    if (this.issueChecked({ type: 'research', player: s.local, buildingId: lib.id, tech: x.id })) { this.audio.play('command'); this.treeKey = ''; }
  }
  private refreshStudyTree() {
    const s = this.session;
    if (!s || !this.modalOpen || !this.modal.classList.contains('tree')) return;
    if (studyTreeKey(s.state, s.local) !== this.treeKey) this.renderStudyTree(false);
  }

  tryAdvanceAge(libArg?: Building) {
    const s = this.session!; const p = s.player;
    const lib = libArg ?? pickLibrary(s.state, s.local);
    if (!lib) { this.toast(librariesOf(s.state, s.local).length ? t('err.queueFull') : t('msg.needLibrary'), 'warn'); this.audio.play('error'); return; }
    const adv = canAdvanceAge(s.state, p, lib);
    if (!adv.ok) { this.toast(adv.reason ?? t('msg.cantAdvance'), 'warn'); this.audio.play('error'); return; }
    if (!adv.minorOptions || adv.minorOptions.length === 0) { s.issue({ type: 'advanceAge', player: s.local, buildingId: lib.id }); this.toast(t('msg.advanceStarted', { age: AGES[p.age + 1].name }), 'gold'); return; }
    this.showMinorGodChoice(adv.minorOptions, (god) => { s.issue({ type: 'advanceAge', player: s.local, buildingId: lib.id, minorGod: god }); this.toast(t('msg.advanceStartedGod', { age: AGES[p.age + 1].name, god: MINOR_GODS[god].name }), 'gold'); });
  }

  // ---------------- Controle (src/ui/gamepad.ts) ----------------
  /** Botões do painel de comandos na ordem da grade (LT + A/B/X/Y aciona a página atual de 4). */
  commandButtons(): HTMLButtonElement[] { return [...this.cmdPanel.querySelectorAll<HTMLButtonElement>('button.cmd')]; }
  /** Marca a página `page` da grade com as letras dos botões do controle (null: tira as marcas). */
  setPadGrid(page: number | null, labels: string[]) {
    this.cmdPanel.classList.toggle('pad-grid', page !== null);
    const btns = this.commandButtons();
    btns.forEach((b, i) => {
      const slot = page === null ? -1 : i - page * 4;
      const want = slot >= 0 && slot < labels.length ? labels[slot] : '';
      if ((b.dataset.pad ?? '') !== want) { if (want) b.dataset.pad = want; else delete b.dataset.pad; }
    });
    // página nova: rola a grade até ela (as linhas de baixo ficam fora da área visível)
    if (page !== null && page !== this.padPage) btns[page * 4]?.scrollIntoView?.({ block: 'nearest' });   // ?.: jsdom não tem scrollIntoView
    this.padPage = page;
  }
  /** Dicas de botões no HUD (html pronto; null esconde). */
  setPadHints(html: string | null) {
    if (html === null || this.editorMode) { this.padHintsEl.classList.add('hidden'); return; }
    if (this.padHintsEl.dataset.key !== html) { this.padHintsEl.innerHTML = html; this.padHintsEl.dataset.key = html; }
    this.padHintsEl.classList.remove('hidden');
  }
  /** O modal aberto é o menu da partida (Start/B o fecham despausando como "Continuar"). */
  get menuIsOpen() { return this.menuOpen && this.modalOpen; }
  /** O modal aberto pode ser fechado sem escolher nada (Esc/clique fora). */
  get canDismissModal() { return this.modalDismissable; }

  // ---------------- Modais ----------------
  get chatOpen() { return !this.chatEl.classList.contains('hidden'); }
  openChat() { if (!this.onChat) return; this.chatEl.classList.remove('hidden'); this.chatEl.value = ''; this.chatEl.focus(); }
  closeChat() { this.chatEl.classList.add('hidden'); this.chatEl.blur(); }

  showModal(html: string, dismissable = true) { this.modal.className = ''; this.modal.innerHTML = html; this.modalBack.classList.remove('hidden'); this.modalDismissable = dismissable; }
  hideModal() {
    this.modalBack.classList.add('hidden');
    if (this.menuOpen) { this.menuOpen = false; if (this.session) this.session.paused = this.pausedBeforeMenu; }   // Esc ou clique fora do menu: volta ao estado anterior
  }
  get modalOpen() { return !this.modalBack.classList.contains('hidden'); }

  showMinorGodChoice(options: string[], cb: (god: string) => void) {
    const s = this.session!;
    const cards = options.map((g) => {
      const d = MINOR_GODS[g]; const pw = POWERS[d.power]; const mu = UNITS[d.mythUnit];
      return `<div class="card" data-god="${g}"><div class="card-head">${ic.god(g, 'lg')}<div><h3>${d.name}</h3><small>${d.title}</small></div></div><ul><li>${ic.power(d.power, 'sm')} <b>${t('modal.power')}:</b> ${pw.name} — ${pw.desc}</li><li>${ic.unit(d.mythUnit, s.player.color, 'sm')} <b>${t('modal.creature')}:</b> ${mu.name} — ${mu.desc}</li>${d.techs.map((x) => `<li>${ic.tech(x, 'sm')} <b>${t('modal.tech')}:</b> ${TECHS[x].name} — ${TECHS[x].desc}</li>`).join('')}</ul></div>`;
    }).join('');
    this.showModal(`<h2>${ic.age(s.player.age + 1, 'md')} ${t('modal.advanceTo', { age: AGES[s.player.age + 1].name })}</h2><p>${t('modal.chooseMinor')}</p><div class="row">${cards}</div><div class="actions"><button class="btn" id="m-cancel">${t('modal.cancel')}</button></div>`);
    this.modal.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => { const g = (c as HTMLElement).dataset.god!; this.hideModal(); cb(g); }));
    this.modal.querySelector('#m-cancel')!.addEventListener('click', () => this.hideModal());
  }

  showMenu() {
    const s = this.session; if (!s) return;
    if (!this.menuOpen) this.pausedBeforeMenu = s.paused;
    this.menuOpen = true;
    s.paused = true;
    const opts = this.cb.getOptions?.();
    this.showModal(`<h2>${t('menu.title')}</h2>
      <div class="row" style="flex-direction:column">
        <button class="btn primary" id="m-continue">${t('menu.continue')}</button>
        ${this.testMode ? '' : `<button class="btn" id="m-save">${t('menu.save')}</button>
        <button class="btn" id="m-load" ${this.cb.hasSave() ? '' : 'disabled'}>${t('menu.load')}</button>`}
        <div style="display:flex;gap:8px"><button class="btn" id="m-export" style="flex:1">${glyph('export')} arquivo / file</button><button class="btn" id="m-import" style="flex:1">${glyph('import')} arquivo / file</button></div>
        <button class="btn" id="m-help">${t('menu.help')}</button>
        <button class="btn" id="m-enc">${t('menu.enc')}</button>
        <button class="btn" id="m-tree">${t('menu.tree')}</button>
        <div style="margin-top:8px">${opts ? optionsHTML(opts) : ''}</div>
        <label style="font-size:12px;color:#9aa5b8"><input type="checkbox" id="m-ranges" ${s.ui.showRanges ? 'checked' : ''}> ${t('menu.ranges')}</label>
        <button class="btn" id="m-exportmap">${t('menu.exportMap')}</button>
        ${this.testMode ? '' : `<button class="btn" id="m-savemap">${t('menu.saveMapLocal')}</button>`}
        <button class="btn" id="m-diag">${t('menu.diagnostic')}</button>
        <button class="btn danger" id="m-quit">${this.testMode ? t('editor.backToEditor') : t('menu.quit')}</button>
      </div>`);
    const q = (id: string) => this.modal.querySelector(id) as HTMLElement;
    q('#m-continue').addEventListener('click', () => { this.menuOpen = false; this.hideModal(); s.paused = false; });
    q('#m-save')?.addEventListener('click', () => { this.cb.onSave(); this.menuOpen = false; this.hideModal(); s.paused = false; });
    q('#m-load')?.addEventListener('click', () => { this.hideModal(); this.cb.onLoad(); });
    q('#m-help').addEventListener('click', () => this.showHelp());
    q('#m-enc').addEventListener('click', () => this.showEncyclopedia());
    q('#m-tree').addEventListener('click', () => this.showStudyTree());
    if (opts) bindOptions(this.modal, opts, () => this.showMenu());
    q('#m-ranges').addEventListener('change', (e) => { s.ui.showRanges = (e.target as HTMLInputElement).checked; });
    q('#m-diag').addEventListener('click', () => { this.cb.onDiagnostic?.(); });
    q('#m-exportmap').addEventListener('click', () => { this.cb.onExportMap?.(); });
    q('#m-savemap')?.addEventListener('click', () => { this.cb.onSaveMapLocal?.(); });
    q('#m-export').addEventListener('click', () => { this.cb.onExport?.(); });
    q('#m-import').addEventListener('click', () => { this.hideModal(); this.cb.onImport?.(); });
    q('#m-quit').addEventListener('click', () => { if (confirm(t('menu.quitConfirm'))) { this.hideModal(); this.cb.onQuit(); } });
    this.modalDismissable = true;
  }

  showHelp() {
    this.showModal(`<h2>${t('help.title')}</h2>
      <h3>${t('help.goalTitle')}</h3><p>${t('help.goal', { min: WONDER_VICTORY_SECONDS / 60 })}</p>
      <h3>${t('help.econTitle')}</h3><p>${t('help.econ')}</p>
      <h3>${t('help.bordersTitle')}</h3><p>${t('help.borders')}</p>
      <h3>${t('help.combatTitle')}</h3><p>${t('help.combat')}</p>
      <h3>${t('help.controlsTitle')}</h3><p>${t('help.controls')} <button class="btn" id="m-hotkeys">${t('menu.hotkeys')}</button></p>
      <div class="actions"><button class="btn primary" id="m-close">${t('modal.close')}</button></div>`);
    this.modal.querySelector('#m-close')!.addEventListener('click', () => this.hideModal());
    this.modal.querySelector('#m-hotkeys')!.addEventListener('click', () => this.showHotkeys());
  }

  /** Créditos: equipe, arte/áudio, tecnologias e licenças de terceiros (src/ui/credits.ts). */
  showCredits() {
    this.showModal(creditsHTML());
    this.modal.scrollTop = 0;   // o #modal é reaproveitado: sem isso abriria rolado onde o último modal longo parou
    this.modal.querySelector('#m-close')!.addEventListener('click', () => this.hideModal());
  }

  /** Tela de atalhos: controles gerais (traduzidos) e teclas de construção/treino geradas a partir dos dados. */
  showHotkeys() {
    const k = (...keys: string[]) => keys.map((x) => `<kbd>${x}</kbd>`).join(' ');
    const general: [string, string][] = [
      [`${k(t('hk.k.click'))} · ${k(t('hk.k.drag'))} · ${k(t('hk.k.dbl'))} · ${k('Ctrl')}+${k(t('hk.k.click'))}`, t('hk.select')],
      [`${k(t('hk.k.right'))} · ${k('Shift')}+${k(t('hk.k.right'))}`, t('hk.right')],
      [k('A'), t('hk.attackMove')], [k('S'), t('hk.stop')], [k('G'), t('hk.garrison')], [k('Delete'), t('hk.delete')],
      [k('Tab'), t('hk.tab')], [`${k('Ctrl')}+${k('A')}`, t('hk.selectMilitary')],
      [`${k('Ctrl')}+${k('1-9')} · ${k('1-9')} · ${k('Alt')}+${k('1-9')}`, t('hk.groups')],
      [`${k('W A S D')} · ${k(t('hk.k.arrows'))} · ${t('hk.k.edge')} · ${k(t('hk.k.middle'))}`, t('hk.camera')], [k(t('hk.k.wheel')), t('hk.zoom')],
      [k('H'), t('hk.home')], [k(t('hk.k.space')), t('hk.lastEvent')], [k('.'), t('hk.idle')],
      [`${k('P')} · ${k('+')} ${k('-')}`, t('hk.speed')], [`${k('Ctrl')}+${k('M')}`, t('hk.mute')],
      [`${k('F1')} ${k('F2')} ${k('F3')} ${k('F5')} ${k('F9')} ${k('F11')}`, t('hk.fkeys')], [k('Esc'), t('hk.esc')],
    ];
    const buildingSel: [string, string][] = [[k('R'), t('hk.rally')], [k('U'), t('hk.release')], [k('Q'), t('hk.scholar')], [k('E'), t('hk.advance')]];
    const builds = Object.entries(BUILDINGS).filter(([, b]) => b.hotkey && !b.notBuildable).sort((a, b) => a[1].age - b[1].age || a[1].hotkey!.localeCompare(b[1].hotkey!));
    const byKey = new Map<string, string[]>();
    for (const [id, b] of builds) byKey.set(b.hotkey!, [...(byKey.get(b.hotkey!) ?? []), id]);
    const buildRows = [...byKey.entries()].map(([key, ids]) => `<tr><td>${k(key)}</td><td>${ids.map((id) => `${ic.bld(id, undefined, 'sm')} ${BUILDINGS[id].name} <small style="color:#9aa5b8">(${AGES[BUILDINGS[id].age].short})</small>`).join(' · ')}${ids.length > 1 ? ` <small style="color:#9aa5b8">— ${t('hk.wonderCycle')}</small>` : ''}</td></tr>`).join('');
    const trainRows = Object.entries(BUILDINGS).filter(([, b]) => b.trains && b.trains.length > 0).map(([id, b]) => `<tr><td>${ic.bld(id, undefined, 'sm')} ${b.name}</td><td>${b.trains!.filter((u) => UNITS[u].hotkey).map((u) => `${k(UNITS[u].hotkey!)} ${ic.unit(u, undefined, 'sm')} ${UNITS[u].name}`).join(' · ')}</td></tr>`).join('');
    const rows = (list: [string, string][]) => list.map(([a, b]) => `<tr><td style="white-space:nowrap">${a}</td><td>${b}</td></tr>`).join('');
    this.showModal(`<h2>${t('hk.title')}</h2>
      <h3>${t('hk.general')}</h3><table>${rows(general)}</table>
      <h3>${t('hk.buildingSel')}</h3><table>${rows(buildingSel)}</table>
      <h3>${t('hk.build')}</h3><table>${buildRows}</table>
      <h3>${t('hk.train')}</h3><table>${trainRows}</table>
      <h3>${t('hk.pad')}</h3><table class="pad-table">${rows(padHelpRows(this.cb.getOptions?.()?.settings.padScheme ?? 'standard'))}</table>
      <div class="actions"><button class="btn primary" id="m-close">${t('modal.close')}</button></div>`);
    this.modal.querySelector('#m-close')!.addEventListener('click', () => this.hideModal());
  }

  showEncyclopedia(tab = 'units') {
    const tabs = [['units', t('enc.units')], ['buildings', t('enc.buildings')], ['techs', t('enc.techs')], ['gods', t('enc.gods')], ['ages', t('enc.ages')]];
    let body = '';
    if (tab === 'units') body = `<table><tr><th>${t('enc.units')}</th><th>${t('enc.cost')}</th><th>${t('sel.hp')}</th><th>${t('sel.attack')}</th><th>${t('sel.armor')}</th><th>${t('sel.range')}</th><th>${t('sel.speed')}</th><th>${t('over.age')}</th><th>${t('enc.where')}</th><th>${t('enc.description')}</th></tr>${Object.values(UNITS).filter((u) => u.building || u.tags.includes('titan')).map((u) => `<tr><td>${ic.unit(u.id, undefined, 'sm')} ${u.name}</td><td>${fmtCost(u.cost as Record<string, number>) || '—'}</td><td>${u.hp}</td><td>${u.attack} ${u.attackType}</td><td>${Math.round(u.armor.hack * 100)}/${Math.round(u.armor.pierce * 100)}/${Math.round(u.armor.crush * 100)}</td><td>${u.range >= 1.6 ? u.range : t('sel.melee')}</td><td>${u.speed}</td><td>${AGES[u.age].short}</td><td>${u.building ? BUILDINGS[u.building].name : t('enc.gate')}${u.god ? ` (${(MINOR_GODS[u.god] ?? MAJOR_GODS[u.god]).name})` : ''}</td><td>${u.desc}</td></tr>`).join('')}</table>`;
    else if (tab === 'buildings') body = `<table><tr><th>${t('enc.buildings')}</th><th>${t('enc.cost')}</th><th>${t('sel.hp')}</th><th>${t('enc.size')}</th><th>${t('over.age')}</th><th>${t('enc.description')}</th></tr>${Object.values(BUILDINGS).filter((b) => !b.notBuildable).map((b) => `<tr><td>${ic.bld(b.id, undefined, 'sm')} ${b.name}</td><td>${fmtCost(b.cost as Record<string, number>)}</td><td>${b.hp}</td><td>${b.w}×${b.h}</td><td>${AGES[b.age].short}</td><td>${b.desc}</td></tr>`).join('')}</table>`;
    else if (tab === 'techs') body = `<table><tr><th>${t('modal.tech')}</th><th>${t('enc.buildings')}</th><th>${t('enc.cost')}</th><th>${t('over.age')}</th><th>${t('enc.effect')}</th></tr>${Object.values(TECHS).map((x) => `<tr><td>${ic.tech(x.id, 'sm')} ${x.name}${x.god ? ` <small>(${MINOR_GODS[x.god].name})</small>` : ''}</td><td>${BUILDINGS[x.building].name}</td><td>${fmtCost(x.cost as Record<string, number>)}</td><td>${AGES[x.age].short}</td><td>${x.desc}</td></tr>`).join('')}</table>`;
    else if (tab === 'gods') body = Object.values(MAJOR_GODS).map((g) => `<h3>${ic.god(g.id, 'md')} ${g.name} — ${g.title}</h3><p>${g.desc}</p><ul>${g.perks.map((x) => `<li>${x}</li>`).join('')}</ul><p><b>${t('enc.minorGods')}:</b> ${g.minorGods.map((pair, i) => `${AGES[i + 1].short}: ${pair.map((m) => `${ic.god(m, 'sm')} ${MINOR_GODS[m].name}`).join(` ${t('enc.or')} `)}`).join(' · ')}</p>`).join('') + `<h3>${t('enc.minorGods')}</h3><table><tr><th>${t('enc.god')}</th><th>${t('over.age')}</th><th>${t('modal.power')}</th><th>${t('modal.creature')}</th><th>${t('enc.techs')}</th></tr>${Object.values(MINOR_GODS).map((m) => `<tr><td>${m.icon} ${m.name}<br><small>${m.title}</small></td><td>${AGES[m.age].short}</td><td>${POWERS[m.power].icon} ${POWERS[m.power].name}<br><small>${POWERS[m.power].desc}</small></td><td>${UNITS[m.mythUnit].icon} ${UNITS[m.mythUnit].name}</td><td>${m.techs.map((x) => `${TECHS[x].icon} ${TECHS[x].name}`).join('<br>')}</td></tr>`).join('')}</table>`;
    else body = `<table><tr><th>${t('over.age')}</th><th>${t('enc.cost')}</th><th>${t('enc.requirements')}</th><th>${t('enc.description')}</th></tr>${AGES.map((a, n) => `<tr><td>${ic.age(n, 'sm')} ${a.name}</td><td>${fmtCost(a.cost as Record<string, number>) || '—'}</td><td>${a.requires.building ? BUILDINGS[a.requires.building].name : ''} ${a.requires.techCount ? t('enc.academyLines', { n: a.requires.techCount, lines: ACADEMY_LINES.map((l) => t(`line.${l}`)).join(', ') }) : ''}</td><td>${a.desc}</td></tr>`).join('')}</table>`;
    this.showModal(`<h2>${t('enc.title')}</h2><div class="tabs">${tabs.map(([k, l]) => `<button class="btn ${k === tab ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div style="max-height:60vh;overflow:auto">${body}</div><div class="actions"><button class="btn primary" id="m-close">${t('modal.close')}</button></div>`);
    this.modal.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => this.showEncyclopedia((b as HTMLElement).dataset.tab!)));
    this.modal.querySelector('#m-close')!.addEventListener('click', () => this.hideModal());
  }

  showGameOver() {
    const s = this.session!; const st = s.state;
    if (st.scenario) { this.showScenarioEnd(); return; }
    const won = st.winner >= 0 && st.players[st.winner].team === s.player.team;
    this.audio.play(won ? 'victory' : 'defeat');
    const rows = st.players.map((p) => `<tr><td style="color:#${p.color.toString(16).padStart(6, '0')}">${MAJOR_GODS[p.god] ? ic.god(p.god, 'sm') + ' ' : ''}${esc(playerDisplayName(st, p.id))}${st.winner >= 0 && st.players[st.winner].team === p.team ? ` ${glyph('trophy')}` : ''}</td><td>${p.team + 1}</td><td>${AGES[p.age].short}</td><td>${p.stats.kills}</td><td>${p.stats.losses}</td><td>${p.stats.razed}</td><td>${p.stats.buildingsBuilt}</td><td>${p.stats.unitsTrained}</td><td>${Math.round(p.stats.gathered.food + p.stats.gathered.wood + p.stats.gathered.gold)}</td><td>${p.techs.length}</td><td>${p.territoryTiles}</td></tr>`).join('');
    const kind = won ? 'won' : st.winner === -1 ? 'draw' : 'lost';
    this.showModal(`${overBanner(kind, won ? t('over.victory') : st.winner === -1 ? t('over.draw') : t('over.defeat'), `${st.events.filter((e) => e.type === 'victory').map((e) => esc(e.text ?? '')).join(' ')} ${t('over.time', { time: fmtTime(st.time) })}`)}
      <table><tr><th>${t('over.player')}</th><th>${t('over.team')}</th><th>${t('over.age')}</th><th>${t('over.kills')}</th><th>${t('over.losses')}</th><th>${t('over.razed')}</th><th>${t('over.built')}</th><th>${t('over.trained')}</th><th>${t('over.gathered')}</th><th>${t('over.techs')}</th><th>${t('over.territory')}</th></tr>${rows}</table>
      <div class="actions"><button class="btn" id="m-continue">${t('over.watch')}</button><button class="btn primary" id="m-quit">${this.testMode ? t('editor.backToEditor') : t('over.menu')}</button></div>`, false);
    this.modal.classList.add('over', kind);
    this.modal.querySelector('#m-continue')!.addEventListener('click', () => this.hideModal());
    this.modal.querySelector('#m-quit')!.addEventListener('click', () => { this.hideModal(); this.cb.onQuit(); });
  }

  showScenarioEnd() {
    const s = this.session!; const st = s.state; const sc = st.scenario!; const def = scenarioOf(st);
    if (!def) { this.cb.onQuit(); return; }
    // O estado é o mesmo em todos os clientes: com humanos em times diferentes, vitória/derrota vem do time vencedor (winnerTeam)
    const won = scenarioWon(sc, s.player.team);
    this.audio.play(won ? 'victory' : 'defeat');
    // Progresso da campanha só para ids oficiais: cenários JSON personalizados nunca marcam aoe_campaign (nem conquistas de missão)
    if (won && isOfficialScenario(sc.id) && !this.testMode) { try { const prog = JSON.parse(localStorage.getItem('aoe_campaign') ?? '{"completed":[]}'); if (!prog.completed.includes(sc.id)) prog.completed.push(sc.id); if (st.config.campaignDifficulty === 'hard') { prog.hard = prog.hard ?? []; if (!prog.hard.includes(sc.id)) prog.hard.push(sc.id); } storeSet('aoe_campaign', JSON.stringify(prog)); } catch { /* ignore */ } }
    const text = won ? (def.outro ? def.outro.map((x) => `<p>${esc(x)}</p>`).join('') : `<p>${t('mission.done')}</p>`) : `<p>${t('mission.failedText')}</p>`;
    // a última missão do plano (m12) fecha a campanha: sem "Próxima missão" (voltaria ao menu) e com o selo de fim; a Horda também não tem próxima
    const finale = won && sc.id === CAMPAIGN_PLAN[CAMPAIGN_PLAN.length - 1].id;
    const hasNext = won && this.cb.onNextMission && isOfficialScenario(sc.id) && !this.testMode && !!nextCampaignMission(sc.id);
    this.showModal(`${overBanner(won ? 'won' : 'lost', won ? t('mission.done') : t('mission.failed'), esc(noEmoji(def.title)))}${text}${finale ? `<p><strong>${t('mission.campaignEnd')}</strong></p>` : ''}<p><small>${t('mission.stats', { time: fmtTime(st.time), kills: s.player.stats.kills, losses: s.player.stats.losses })}</small></p>
      <div class="actions"><button class="btn" id="m-continue">${t('mission.continue')}</button>${hasNext ? `<button class="btn primary" id="m-next">${t('mission.next')}</button>` : ''}<button class="btn ${won && hasNext ? '' : 'primary'}" id="m-quit">${this.testMode ? t('editor.backToEditor') : t('over.menu')}</button></div>`, false);
    this.modal.classList.add('over', won ? 'won' : 'lost');
    this.modal.querySelector('#m-continue')!.addEventListener('click', () => this.hideModal());
    this.modal.querySelector('#m-next')?.addEventListener('click', () => { this.hideModal(); this.cb.onNextMission?.(sc.id); });
    this.modal.querySelector('#m-quit')!.addEventListener('click', () => { this.hideModal(); this.cb.onQuit(); });
  }

  /** Tela de abertura do cenário da sessão atual (campanha, Horda ou JSON): título, intro, objetivos visíveis e dicas no idioma atual.
   *  Textos escapados: o cenário JSON pode vir do anfitrião da sala (docs/EDITOR.md §4.7). */
  showIntro(onStart: () => void) {
    const def = this.session ? scenarioOf(this.session.state) : undefined; if (!def) { onStart(); return; }
    const art = missionArtUrl(def.id);   // ilustração da missão (ROADMAP 2.7) no alto do briefing
    this.showModal(`${art ? `<div class="mission-art" style="background-image:url('${esc(art)}')"></div>` : ''}<h2>${missionIcon(def.id, def.icon, 'md')} ${esc(noEmoji(def.title))}</h2><p style="color:#f2c14e">${esc(def.subtitle)}</p>${def.intro.map((x) => `<p>${esc(x)}</p>`).join('')}<h3>${t('mission.objectives')}</h3><ul>${def.objectives.filter((o) => !o.hidden).map((o) => `<li>${esc(o.text)}${o.optional ? ` <small>${t('mission.optional')}</small>` : ''}</li>`).join('')}</ul>${def.hints ? `<h3>${t('mission.hints')}</h3><ul>${def.hints.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}<div class="actions"><button class="btn primary" id="m-go">${t('mission.start')}</button></div>`, false);
    this.modal.querySelector('#m-go')!.addEventListener('click', () => { this.hideModal(); onStart(); });
  }

  describeEntityTip(e: Unit | Building): string {
    const def = e.kind === 'unit' ? UNITS[e.type] : BUILDINGS[e.type];
    const state = this.session!.state;
    // G8: nome próprio (e o tipo entre parênteses) e nome da facção no idioma atual
    return `<b>${e.kind === 'building' ? this.bIcon(e.type, e.owner) : def.icon} ${esc(entityDisplayName(e))}</b> <small>${esc(playerDisplayName(state, e.owner))}</small><div class="desc">${e.displayName ? `${def.name} · ` : ''}${Math.round(e.hp)}/${e.maxHp} ${t('sel.hp').toLowerCase()}</div>`;
  }

  isMilitarySelection(): boolean { const s = this.session; if (!s) return false; return s.ownSelectedUnits().some(isMilitary); }
}
