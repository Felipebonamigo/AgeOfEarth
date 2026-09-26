// Controle (gamepad: Steam Deck, Xbox e qualquer um no mapeamento "standard"), passo 6.5 do roteiro.
// Leitura por navigator.getGamepads() a cada quadro (sem eventos), zona morta radial e curva de resposta.
// Na partida, o analógico move um cursor virtual desenhado em DOM que alimenta os MESMOS métodos do Input que o mouse
// (pointerPress/pointerMoveTo/pointerRelease e as ações de teclado); nos menus e modais, o D-pad move um foco visível
// (anel dourado) entre os elementos na ordem visual. Mexer o mouse devolve o controle a ele (DeviceArbiter).
// A parte de lógica pura (zona morta, curva, tabela de ações, repetição, prioridade, navegação espacial) é testada
// em tests/gamepad.test.ts sem navegador; a classe GamepadController só toca o DOM dentro dos métodos.
import type { Input } from './input';
import type { HUD } from './hud';
import type { MainMenu } from './menu';
import type { Renderer } from '../render/renderer';
import type { Session } from '../game/session';
import type { Settings, PadScheme } from '../game/settings';
import { POWERS } from '../core/data';
import { t } from '../i18n';
import { esc } from './html';

// ---------------------------------------------------------------------------------------------
// Lógica pura
// ---------------------------------------------------------------------------------------------

/** Índices do mapeamento "standard" da Gamepad API (Xbox / Steam Deck). */
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, GUIDE: 16 } as const;
export const BUTTON_COUNT = 17;

/** Ações do jogo que um botão pode disparar (a mesma ação que o mouse/teclado faria). */
export type PadAction = 'primary' | 'context' | 'attackMove' | 'stop' | 'groups' | 'cycleType' | 'modifier' | 'idle' | 'army' | 'home' | 'power' | 'menu' | 'overview' | 'sameType' | 'none';
/** Ações com o modificador (LT) segurado: botões do painel de comandos, página do painel e salvar grupo. */
export type ComboAction = PadAction | 'grid0' | 'grid1' | 'grid2' | 'grid3' | 'gridPrev' | 'gridNext' | 'saveGroup';

export interface SchemeDef {
  /** Ação de cada botão (índice = BTN). */
  buttons: PadAction[];
  /** Analógico que move o cursor (o outro rola a câmera). */
  cursorStick: 'left' | 'right';
  /** Botões de confirmar e voltar nos menus. */
  confirm: number; back: number;
}

const STANDARD_BUTTONS: PadAction[] = [
  'primary', 'context', 'attackMove', 'stop',   // A B X Y
  'groups', 'cycleType', 'modifier', 'primary', // LB RB LT RT
  'overview', 'menu', 'sameType', 'none',       // View Start L3 R3
  'home', 'power', 'idle', 'army',              // ▲ ▼ ◀ ▶
  'none',                                       // Guide (do sistema)
];
/** Tabela de ações configurável: "padrão" (Xbox/Deck) e "alternativo" (A↔B e analógicos trocados, para canhotos). */
export const SCHEMES: Record<PadScheme, SchemeDef> = {
  standard: { buttons: STANDARD_BUTTONS, cursorStick: 'left', confirm: BTN.A, back: BTN.B },
  alt: {
    buttons: STANDARD_BUTTONS.map((a, i) => (i === BTN.A ? 'context' : i === BTN.B ? 'primary' : i === BTN.L3 ? 'none' : i === BTN.R3 ? 'sameType' : a)),
    cursorStick: 'right', confirm: BTN.B, back: BTN.A,
  },
};

/** Zona morta radial: abaixo de `inner` vale zero; entre inner e outer é reescalado para 0..1 (sem degrau na borda). */
export function radialDeadzone(x: number, y: number, inner = 0.15, outer = 0.95): { x: number; y: number; mag: number } {
  const m = Math.sqrt(x * x + y * y);
  if (!(m > inner)) return { x: 0, y: 0, mag: 0 };
  const n = Math.min(1, (m - inner) / Math.max(1e-6, outer - inner));
  return { x: (x / m) * n, y: (y / m) * n, mag: n };
}
/** Curva de resposta (expoente > 1: precisão perto do centro, velocidade na borda). */
export function responseCurve(m: number, expo = 1.7): number { const c = Math.max(0, Math.min(1, m)); return c === 0 ? 0 : Math.pow(c, expo); }
/** Analógico pronto para uso: zona morta radial + curva, preservando a direção. */
export function stick(x: number, y: number, inner = 0.15, expo = 1.7): { x: number; y: number; mag: number } {
  const d = radialDeadzone(x, y, inner);
  if (d.mag === 0) return d;
  const c = responseCurve(d.mag, expo);
  return { x: (d.x / d.mag) * c, y: (d.y / d.mag) * c, mag: c };
}

/** Velocidade base do cursor virtual (px/s na inclinação máxima, sensibilidade 1). */
export const CURSOR_SPEED = 640;
/** Velocidade do cursor: inclinação × sensibilidade, com aceleração após segurar o analógico no máximo (até 1,9×). */
export function cursorSpeed(mag: number, holdTime: number, sensitivity: number): number {
  const accel = 1 + 0.9 * Math.max(0, Math.min(1, (holdTime - 0.3) / 0.6));
  return CURSOR_SPEED * Math.max(0.1, sensitivity) * Math.max(0, Math.min(1, mag)) * accel;
}
/** Ímã leve: com o analógico parado, puxa o cursor para o centro de uma unidade próxima (raio em px). */
export function magnetStep(cx: number, cy: number, tx: number, ty: number, dt: number, radius = 26, rate = 9): { x: number; y: number } {
  const dx = tx - cx, dy = ty - cy; const d = Math.sqrt(dx * dx + dy * dy);
  if (d > radius || d < 0.5) return { x: cx, y: cy };
  const f = Math.min(1, rate * dt);
  return { x: cx + dx * f, y: cy + dy * f };
}

/** Gatilho analógico conta como pressionado a partir de 35 %. */
export function triggerDown(value: number, pressed: boolean): boolean { return pressed || value > 0.35; }

/**
 * Converte o estado dos botões em ações (bordas de descida e subida). Com o modificador segurado, A/B/X/Y viram os
 * botões do painel (grid0..3), LB/RB trocam a página e ▲ salva um grupo. A subida devolve a ação que a descida
 * disparou (soltar LT antes de A não "perde" o A).
 */
export class ButtonMapper {
  private prev: boolean[] = [];
  private held: (ComboAction | null)[] = [];
  update(scheme: SchemeDef, pressed: boolean[]): { down: ComboAction[]; up: ComboAction[] } {
    const down: ComboAction[] = [], up: ComboAction[] = [];
    const modIdx = scheme.buttons.indexOf('modifier');
    const mod = modIdx >= 0 && !!pressed[modIdx];
    for (let i = 0; i < Math.max(pressed.length, this.prev.length); i++) {
      const now = !!pressed[i], was = !!this.prev[i];
      if (now && !was) {
        let a: ComboAction = scheme.buttons[i] ?? 'none';
        if (mod && a !== 'modifier') {
          if (i <= BTN.Y) a = (['grid0', 'grid1', 'grid2', 'grid3'] as const)[i];
          else if (i === BTN.LB) a = 'gridPrev';
          else if (i === BTN.RB) a = 'gridNext';
          else if (i === BTN.UP) a = 'saveGroup';
        }
        this.held[i] = a;
        if (a !== 'none') down.push(a);
      } else if (!now && was) {
        const a = this.held[i]; this.held[i] = null;
        if (a && a !== 'none') up.push(a);
      }
    }
    this.prev = pressed.slice();
    return { down, up };
  }
  /** Acompanha os botões sem disparar nada (menus/modais): ao voltar para a partida, nada "vaza". */
  sync(pressed: boolean[]): void { this.prev = pressed.slice(); this.held = []; }
}

/** Repetição de direção: dispara ao pressionar, depois de `delay` s e então a cada `interval` s enquanto segurado. */
export class Repeater {
  private t = 0; private on = false;
  constructor(public delay = 0.38, public interval = 0.11) {}
  update(held: boolean, dt: number): boolean {
    if (!held) { this.on = false; return false; }
    if (!this.on) { this.on = true; this.t = this.delay; return true; }
    this.t -= dt;
    if (this.t <= 0) { this.t = Math.max(0, this.t) + this.interval; return true; }
    return false;
  }
  reset(): void { this.on = false; this.t = 0; }
}

/**
 * Prioridade mouse × controle: qualquer uso do controle o ativa; o mouse retoma ao andar `threshold` px (acumulados
 * em rajada de até 250 ms, para tremidas não roubarem o cursor) ou ao clicar.
 */
export class DeviceArbiter {
  active: 'mouse' | 'pad' = 'mouse';
  private acc = 0; private lastMove = -Infinity;
  constructor(public threshold = 8) {}
  /** Devolve true quando o mouse acabou de assumir. */
  mouseMoved(dx: number, dy: number, now: number): boolean {
    if (this.active === 'mouse') return false;
    if (now - this.lastMove > 250) this.acc = 0;
    this.lastMove = now;
    this.acc += Math.abs(dx) + Math.abs(dy);
    if (this.acc >= this.threshold) { this.active = 'mouse'; this.acc = 0; return true; }
    return false;
  }
  mouseClicked(): boolean { if (this.active === 'mouse') return false; this.active = 'mouse'; this.acc = 0; return true; }
  /** Devolve true quando o controle acabou de assumir. */
  padUsed(): boolean { this.acc = 0; if (this.active === 'pad') return false; this.active = 'pad'; return true; }
}

export type Dir = 'up' | 'down' | 'left' | 'right';
/** Direção de navegação: D-pad tem prioridade; senão o eixo dominante do analógico acima do limiar. */
export function dirFrom(up: boolean, down: boolean, left: boolean, right: boolean, sx: number, sy: number, threshold = 0.55): Dir | null {
  if (up !== down) return up ? 'up' : 'down';
  if (left !== right) return left ? 'left' : 'right';
  const ax = Math.abs(sx), ay = Math.abs(sy);
  if (Math.max(ax, ay) < threshold) return null;
  return ay >= ax ? (sy < 0 ? 'up' : 'down') : (sx < 0 ? 'left' : 'right');
}

export interface Rect { left: number; top: number; right: number; bottom: number }
/**
 * Navegação espacial (ordem visual): o próximo elemento na direção pedida, preferindo os alinhados (que se sobrepõem no
 * eixo perpendicular). Devolve -1 se não houver ninguém naquela direção; sem foco atual (from < 0), o primeiro.
 */
export function navPick(rects: Rect[], from: number, dir: Dir): number {
  if (rects.length === 0) return -1;
  if (from < 0 || from >= rects.length) return 0;
  const a = rects[from];
  const acx = (a.left + a.right) / 2, acy = (a.top + a.bottom) / 2;
  const vertical = dir === 'up' || dir === 'down';
  let best = -1, bestScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === from) continue;
    const b = rects[i];
    const bcx = (b.left + b.right) / 2, bcy = (b.top + b.bottom) / 2;
    // distância primária pela borda (elementos grandes lado a lado) e secundária pelo centro
    const primary = dir === 'down' ? b.top - a.bottom : dir === 'up' ? a.top - b.bottom : dir === 'right' ? b.left - a.right : a.left - b.right;
    const centerAhead = dir === 'down' ? bcy - acy : dir === 'up' ? acy - bcy : dir === 'right' ? bcx - acx : acx - bcx;
    if (centerAhead <= 2 || primary < -Math.min(vertical ? a.bottom - a.top : a.right - a.left, vertical ? b.bottom - b.top : b.right - b.left) / 2) continue;
    const overlap = vertical ? Math.min(a.right, b.right) - Math.max(a.left, b.left) : Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    // alinhados: o centro do candidato dentro do vão do atual não pesa (empate → o primeiro na ordem do documento, a leitura)
    const span = (v: number, lo: number, hi: number) => (v < lo ? lo - v : v > hi ? v - hi : 0);
    const align = vertical ? Math.min(span(bcx, a.left, a.right), span(acx, b.left, b.right)) : Math.min(span(bcy, a.top, a.bottom), span(acy, b.top, b.bottom));
    const score = Math.max(0, primary) + (overlap > 0 ? align * 0.5 : 40 + (vertical ? Math.abs(bcx - acx) : Math.abs(bcy - acy)) * 2);
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** Nome curto do controle para os avisos ("Xbox Wireless Controller (STANDARD GAMEPAD Vendor…)" → "Xbox Wireless Controller"). */
export function padDisplayName(id: string): string { const s = id.replace(/\s*\(.*$/, '').trim() || id.trim(); return s.length > 40 ? s.slice(0, 39) + '…' : s; }

/** Texto de um botão físico (A/B/X/Y coloridos, LB/RB/LT/RT, ☰, ⧉, D-pad). */
export function padGlyph(i: number | string): string {
  const LABELS: Record<number, [string, string]> = { 0: ['A', 'pb-a'], 1: ['B', 'pb-b'], 2: ['X', 'pb-x'], 3: ['Y', 'pb-y'], 4: ['LB', 'pb-sh'], 5: ['RB', 'pb-sh'], 6: ['LT', 'pb-sh'], 7: ['RT', 'pb-sh'], 8: ['⧉', 'pb-sys'], 9: ['☰', 'pb-sys'], 10: ['L3', 'pb-sh'], 11: ['R3', 'pb-sh'], 12: ['✚▲', 'pb-dp'], 13: ['✚▼', 'pb-dp'], 14: ['✚◀', 'pb-dp'], 15: ['✚▶', 'pb-dp'] };
  if (typeof i === 'string') return `<span class="pb pb-sh">${i}</span>`;
  const [lbl, cls] = LABELS[i] ?? ['?', ''];
  return `<span class="pb ${cls}">${lbl}</span>`;
}
/** Botões (índices) ligados a uma ação num esquema. */
export function buttonsFor(scheme: SchemeDef, action: PadAction): number[] { const out: number[] = []; scheme.buttons.forEach((a, i) => { if (a === action) out.push(i); }); return out; }

/** Linhas da tela de atalhos (Controle): [botões, descrição] na ordem do jogo. */
export function padHelpRows(schemeId: PadScheme): [string, string][] {
  const sc = SCHEMES[schemeId] ?? SCHEMES.standard;
  const rows: [string, string][] = [];
  rows.push([padGlyph(sc.cursorStick === 'left' ? 'LS' : 'RS'), t('pad.act.cursor')]);
  rows.push([padGlyph(sc.cursorStick === 'left' ? 'RS' : 'LS'), t('pad.act.camera')]);
  const order: PadAction[] = ['primary', 'context', 'attackMove', 'stop', 'modifier', 'groups', 'cycleType', 'idle', 'army', 'home', 'power', 'menu', 'overview', 'sameType'];
  for (const a of order) { const b = buttonsFor(sc, a); if (b.length) rows.push([b.map((i) => padGlyph(i)).join(' '), t(`pad.act.${a}`)]); }
  rows.push([`${padGlyph(sc.confirm)} ${padGlyph(sc.back)} ${padGlyph(BTN.LB)}${padGlyph(BTN.RB)}`, t('pad.act.menus')]);
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Controlador (DOM)
// ---------------------------------------------------------------------------------------------

export interface PadDeps {
  input: Input; hud: HUD; renderer: Renderer; menu: MainMenu; settings: Settings;
  getSession: () => Session | null;
  /** Editor de mapas aberto (nesta etapa ele fica só com mouse/teclado). */
  inEditor: () => boolean;
}

type Mode = 'none' | 'nav' | 'game' | 'dialog';
const CAM_SPEED = 1000;
const FOCUSABLE = 'button, select, input:not([type=hidden]), textarea, summary, .god, .mission, #modal .card, [data-nav]';
const TEXT_TYPES = ['text', 'number', 'search', 'url', 'email', 'password', ''];
const el = (tag: string, id: string, cls = ''): HTMLElement => { const e = document.createElement(tag); e.id = id; if (cls) e.className = cls; return e; };

export class GamepadController {
  /** Quadros processados (os playtests esperam por ele). */
  frames = 0;
  /** Vibrações pedidas (playtest). */
  rumbles = 0;
  readonly arbiter = new DeviceArbiter();
  /** Cursor virtual em pixels de tela (mesmas coordenadas do mouse). */
  cursor = { x: -1, y: -1 };
  padId: string | null = null;
  private gp: Gamepad | null = null;
  private mode: Mode = 'none';
  private mapper = new ButtonMapper();
  private prevRaw: boolean[] = [];
  private navDir: Dir | null = null;
  private navRep = new Repeater();
  private focusEl: HTMLElement | null = null;
  private focusRoot: HTMLElement | null = null;
  private focusKeys = new WeakMap<HTMLElement, string>();
  private editingSelect: { el: HTMLSelectElement; orig: number } | null = null;
  private holdTime = 0;
  private gridPage = 0; private gridSel = '';
  private overview: { x: number; y: number; zoom: number; cx: number; cy: number } | null = null;
  private primaryHeld: 'map' | 'hud' | null = null;
  private pendingGlobal: string | null = null;
  private lastRumble = -Infinity;
  private tipEl: Element | null = null;
  private dialog: { onYes: (() => void) | null } | null = null;
  private lastMouse = { x: NaN, y: NaN };
  private cursorEl: HTMLElement; private navHintsEl: HTMLElement; private bannerEl: HTMLElement; private dialogEl: HTMLElement;
  private bannerTimer = 0; private hintKey = ''; private cursorCls = '';

  constructor(private d: PadDeps) {
    this.cursorEl = el('div', 'pad-cursor', 'hidden');
    this.cursorEl.innerHTML = '<svg width="28" height="32" viewBox="0 0 28 32" aria-hidden="true"><path d="M3 2 L3 25 L9 19.5 L13.5 29.5 L17.8 27.6 L13.4 18 L21.5 18 Z" stroke="#140d02" stroke-width="2" stroke-linejoin="round"/></svg>';
    this.navHintsEl = el('div', 'pad-nav-hints', 'pad-hints hidden');
    this.bannerEl = el('div', 'pad-banner', 'hidden');
    this.dialogEl = el('div', 'pad-dialog', 'hidden');
    for (const e of [this.cursorEl, this.navHintsEl, this.bannerEl, this.dialogEl]) document.body.appendChild(e);
    d.hud.onAlert = () => this.rumble();
    // Mexer ou clicar o mouse devolve o controle a ele (só eventos reais; os sintéticos do próprio controle não contam)
    window.addEventListener('pointermove', (e) => {
      if (!e.isTrusted) return;
      const dx = Number.isNaN(this.lastMouse.x) ? 0 : e.clientX - this.lastMouse.x, dy = Number.isNaN(this.lastMouse.y) ? 0 : e.clientY - this.lastMouse.y;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      if (this.arbiter.mouseMoved(dx, dy, performance.now())) this.deactivate();
    }, true);
    window.addEventListener('pointerdown', (e) => { if (e.isTrusted && this.arbiter.mouseClicked()) this.deactivate(); }, true);
  }

  get active(): boolean { return this.arbiter.active === 'pad'; }
  private get scheme(): SchemeDef { return SCHEMES[this.d.settings.padScheme] ?? SCHEMES.standard; }
  private session(): Session | null { return this.d.getSession(); }
  private menuVisible(): boolean { return !this.d.menu.el.classList.contains('hidden'); }

  /** Chamado uma vez por quadro pelo laço principal (com ou sem partida). */
  update(dt: number): void {
    this.frames++;
    const gp = this.readPad();
    if (!gp) { if (this.active) { this.arbiter.mouseClicked(); this.deactivate(); } this.prevRaw = []; this.mapper.sync([]); return; }
    const pressed: boolean[] = [];
    for (let i = 0; i < BUTTON_COUNT; i++) { const b = gp.buttons[i]; pressed.push(!!b && (i === BTN.LT || i === BTN.RT ? triggerDown(b.value, b.pressed) : b.pressed)); }
    const L = stick(gp.axes[0] ?? 0, gp.axes[1] ?? 0), R = stick(gp.axes[2] ?? 0, gp.axes[3] ?? 0);
    const s = this.session();
    const mode: Mode = this.dialog ? 'dialog' : this.d.hud.modalOpen || this.menuVisible() ? 'nav' : s && !this.d.inEditor() ? 'game' : 'none';
    if (mode !== this.mode) { this.leave(this.mode); this.mode = mode; }
    // sem uso para o controle (editor de mapas fora dos modais): não esconde o cursor do sistema
    if (mode === 'none') { if (this.active) { this.arbiter.mouseClicked(); this.deactivate(); } this.mapper.sync(pressed); this.prevRaw = pressed; return; }
    const used = pressed.some(Boolean) || L.mag > 0 || R.mag > 0;
    if (used && this.arbiter.padUsed()) this.activate();
    if (!this.active) { this.mapper.sync(pressed); this.prevRaw = pressed; return; }
    this.zoomOverlays();
    if (mode === 'game') this.game(dt, pressed, L, R);
    else {
      this.mapper.sync(pressed);
      if (mode === 'nav') this.nav(dt, pressed, L, R);
      else if (mode === 'dialog') this.dialogInput(pressed);
    }
    this.cursorEl.classList.toggle('hidden', mode !== 'game');
    this.prevRaw = pressed;
  }

  // ---------------- conexão, ativação ----------------
  private readPad(): Gamepad | null {
    let gp: Gamepad | null = null;
    try { const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []; for (const g of list) if (g && g.connected) { gp = g; break; } } catch { gp = null; }
    const id = gp ? gp.id : null;
    if (id !== this.padId) {
      if (id) this.notify(t('pad.connected', { name: padDisplayName(id) }));
      else if (this.padId) this.notify(t('pad.disconnected'));
      this.padId = id;
    }
    this.gp = gp;
    return gp;
  }
  private notify(text: string): void {
    if (this.session() && this.d.hud.hudVisible && !this.menuVisible()) { this.d.hud.toast(text, 'info'); return; }
    this.bannerEl.textContent = text; this.bannerEl.classList.remove('hidden');   // texto puro, como o toast (o nome do controle vem do navegador)
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.add('hidden'), 3500);
  }
  private activate(): void {
    document.documentElement.classList.add('pad-active');
    const p = this.d.input.pointer;
    if (this.cursor.x < 0 || this.cursor.y < 0) this.cursor = p.x > 0 || p.y > 0 ? { x: p.x, y: p.y } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }
  /** O mouse assumiu (ou o controle saiu): some com cursor, foco e dicas; solta o que estiver segurado. */
  private deactivate(): void {
    document.documentElement.classList.remove('pad-active');
    this.leave(this.mode); this.mode = 'none';
    this.cursorEl.classList.add('hidden');
  }
  private leave(mode: Mode): void {
    if (mode === 'game') {
      if (this.primaryHeld === 'map') this.d.input.pointerRelease(this.cursor.x, this.cursor.y, 0, undefined, this.d.input.hudAt(this.cursor.x, this.cursor.y));
      this.primaryHeld = null;
      if (this.overview) this.endOverview();
      this.pendingGlobal = null;
      this.d.hud.setPadHints(null); this.d.hud.setPadGrid(null, []);
      if (this.tipEl) { this.d.hud.hideTooltip(); this.tipEl = null; }
    }
    if (mode === 'nav') { this.setFocus(null); this.editingSelect = null; this.navHintsEl.classList.add('hidden'); this.hintKey = ''; }
    if (mode === 'dialog') this.dialogEl.classList.add('hidden');
  }
  /** Elementos do controle fora do #hud acompanham a escala da interface. */
  private zoomOverlays(): void {
    const z = String(Math.max(0.5, Math.min(2, this.d.settings.uiScale || 1)));
    for (const e of [this.navHintsEl, this.bannerEl, this.dialogEl]) if ((e.style as unknown as { zoom: string }).zoom !== z) (e.style as unknown as { zoom: string }).zoom = z;
  }

  /** Vibração curta ao sofrer ataque (no máximo a cada 1,5 s; só com a opção ligada e controle ativo). */
  rumble(): void {
    if (!this.d.settings.padVibration || !this.active || !this.gp) return;
    const now = performance.now(); if (now - this.lastRumble < 1500) return;
    this.lastRumble = now;
    const act = (this.gp as unknown as { vibrationActuator?: { playEffect?: (type: string, p: object) => Promise<unknown> } }).vibrationActuator;
    if (!act?.playEffect) return;
    this.rumbles++;
    try { void act.playEffect('dual-rumble', { startDelay: 0, duration: 160, weakMagnitude: 0.35, strongMagnitude: 0.6 }).catch(() => { /* sem suporte */ }); } catch { /* sem suporte */ }
  }

  // ---------------- partida: cursor virtual ----------------
  private game(dt: number, pressed: boolean[], L: { x: number; y: number; mag: number }, R: { x: number; y: number; mag: number }): void {
    const s = this.session()!; const { input, hud, renderer, settings } = this.d; const cam = renderer.cam;
    const sc = this.scheme;
    const cur = sc.cursorStick === 'left' ? L : R, camS = sc.cursorStick === 'left' ? R : L;
    const modIdx = sc.buttons.indexOf('modifier');
    const mod = modIdx >= 0 && pressed[modIdx];
    // câmera (LT + vertical: zoom no cursor)
    if (camS.mag > 0) {
      if (mod) { if (Math.abs(camS.y) > 0.05) cam.zoomAt(this.cursor.x, this.cursor.y, Math.max(0.5, 1 - camS.y * 1.8 * dt)); }
      else cam.pan(camS.x * CAM_SPEED * dt, camS.y * (settings.padInvertY ? -1 : 1) * CAM_SPEED * dt);
    }
    // cursor: aceleração, freio sobre entidades e ímã leve quando parado
    const w = cam.screenToWorld(this.cursor.x, this.cursor.y);
    const overHud = input.hudAt(this.cursor.x, this.cursor.y);
    const ent = overHud ? null : renderer.pick(s.state, w.x, w.y, s.local);
    if (cur.mag > 0) {
      this.holdTime = cur.mag > 0.85 ? this.holdTime + dt : 0;
      const v = cursorSpeed(cur.mag, this.holdTime, settings.padSensitivity) * (ent ? 0.55 : 1);
      this.cursor.x += (cur.x / cur.mag) * v * dt; this.cursor.y += (cur.y / cur.mag) * v * dt;
    } else {
      this.holdTime = 0;
      if (ent && ent.kind === 'unit') { const p = cam.worldToScreen(ent.x, ent.y); const m = magnetStep(this.cursor.x, this.cursor.y, p.x, p.y, dt); this.cursor.x = m.x; this.cursor.y = m.y; }
    }
    this.cursor.x = Math.max(0, Math.min(window.innerWidth - 1, this.cursor.x));
    this.cursor.y = Math.max(0, Math.min(window.innerHeight - 1, this.cursor.y));
    input.pointerMoveTo(this.cursor.x, this.cursor.y);
    this.hudTooltip();
    // botões
    const ev = this.mapper.update(sc, pressed);
    for (const a of ev.down) this.gameDown(a);
    for (const a of ev.up) this.gameUp(a);
    // grade do painel (LT) e dicas
    const selKey = [...s.selection].join(',');
    if (selKey !== this.gridSel) { this.gridSel = selKey; this.gridPage = 0; }
    const pages = Math.max(1, Math.ceil(hud.commandButtons().length / 4));
    if (this.gridPage >= pages) this.gridPage = 0;
    hud.setPadGrid(mod ? this.gridPage : null, ['A', 'B', 'X', 'Y']);
    hud.setPadHints(this.gameHints(s, !!mod, pages));
    this.drawCursor(s, overHud);
  }

  private drawCursor(s: Session, overHud: boolean): void {
    const m = s.ui.mode;
    const cls = overHud ? 'hud' : m === 'place' ? 'place' : m === 'attackMove' || m === 'power' || m === 'rally' ? 'attack' : '';
    if (cls !== this.cursorCls) { this.cursorEl.classList.remove('hud', 'place', 'attack'); if (cls) this.cursorEl.classList.add(cls); this.cursorCls = cls; }
    this.cursorEl.style.transform = `translate(${Math.round(this.cursor.x - 3)}px, ${Math.round(this.cursor.y - 2)}px)`;
  }

  /** Dica do elemento do HUD sob o cursor virtual (o mouse a recebe por mouseover). */
  private hudTooltip(): void {
    const { input, hud } = this.d;
    if (!input.hudAt(this.cursor.x, this.cursor.y)) { this.tipEl = null; return; }
    const target = document.elementFromPoint(this.cursor.x, this.cursor.y);
    const tip = target ? (target.closest('[data-tip]') as HTMLElement | null) : null;
    if (tip && tip.dataset.tip) { if (tip !== this.tipEl) hud.showTooltip(tip.dataset.tip, this.cursor.x, this.cursor.y); this.tipEl = tip; }
    else if (this.tipEl) { hud.hideTooltip(); this.tipEl = null; }
  }

  private gameDown(a: ComboAction): void {
    const s = this.session(); if (!s) return;
    const { input, hud } = this.d; const { x, y } = this.cursor;
    switch (a) {
      case 'primary':
        if (this.pendingGlobal) { hud.activatePower(this.pendingGlobal); this.pendingGlobal = null; return; }
        if (input.hudAt(x, y)) { this.clickHudAt(x, y, 0); this.primaryHeld = 'hud'; }
        else { input.pointerPress(x, y, 0); this.primaryHeld = 'map'; }
        return;
      case 'context':
        if (this.pendingGlobal) { this.pendingGlobal = null; return; }
        if (input.hudAt(x, y)) { this.clickHudAt(x, y, 2); return; }
        input.pointerPress(x, y, 2); input.pointerRelease(x, y, 2);
        return;
      case 'attackMove': input.attackMoveAtPointer(); return;
      case 'stop': if (s.ui.mode !== 'normal') hud.cancelMode(); else input.stopSelected(); return;
      case 'groups': if (!input.cycleGroups(1)) hud.toast(t('pad.noGroups'), 'info'); return;
      case 'cycleType': input.cycleSelectionType(); return;
      case 'idle': hud.selectIdleVillager(); return;
      case 'army': if (!input.selectArmy()) hud.toast(t('pad.noArmy'), 'info'); return;
      case 'home': input.goHome(true); return;
      case 'power': this.power(s); return;
      case 'menu': hud.showMenu(); return;
      case 'overview': this.startOverview(); return;
      case 'sameType': input.selectSameTypeAtPointer(); return;
      case 'grid0': case 'grid1': case 'grid2': case 'grid3': {
        const b = hud.commandButtons()[this.gridPage * 4 + Number(a.slice(4))];
        if (b && !b.disabled) this.activate_(b);
        return;
      }
      case 'gridPrev': case 'gridNext': {
        const pages = Math.max(1, Math.ceil(hud.commandButtons().length / 4));
        this.gridPage = (this.gridPage + (a === 'gridNext' ? 1 : -1) + pages) % pages;
        return;
      }
      case 'saveGroup': { const n = input.saveNewGroup(); hud.toast(n ? t('pad.groupSaved', { n, count: s.selection.size }) : t('pad.noSelection'), n ? 'good' : 'info'); return; }
      default: return;
    }
  }
  private gameUp(a: ComboAction): void {
    if (a === 'primary') {
      if (this.primaryHeld === 'map') this.d.input.pointerRelease(this.cursor.x, this.cursor.y, 0, undefined, this.d.input.hudAt(this.cursor.x, this.cursor.y));
      this.primaryHeld = null;
    } else if (a === 'overview') this.endOverview();
  }

  /** Clique no HUD sob o cursor: minimapa recebe o mesmo pointerdown do mouse; botões e cartões recebem click(). */
  private clickHudAt(x: number, y: number, button: number): void {
    const target = document.elementFromPoint(x, y) as HTMLElement | null; if (!target) return;
    if (target === this.d.hud.minimap.canvas) {
      target.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, button, buttons: button === 2 ? 2 : 1, bubbles: true }));
      return;
    }
    if (button !== 0) return;
    const hit = target.closest('button, .pw, .mi, .qi, .toast, #dialogue, .card, summary, input, select, [data-tip]') as HTMLElement | null;
    if (hit) this.activate_(hit);
  }

  /** ▼: habilidade do herói selecionado; senão alterna entre os poderes divinos disponíveis (global pede confirmação). */
  private power(s: Session): void {
    const { input, hud } = this.d;
    if (s.ownSelectedUnits().length && input.useAbility()) return;
    const avail = s.player.powers.filter((p) => !p.used).map((p) => p.id);
    if (!avail.length) { hud.toast(t('pad.noPower'), 'info'); return; }
    const cur = this.pendingGlobal ?? (s.ui.mode === 'power' ? s.ui.powerId : null);
    const next = avail[(avail.indexOf(cur ?? '') + 1) % avail.length];
    if (POWERS[next].targeting === 'global') {
      if (s.ui.mode !== 'normal') hud.cancelMode();
      this.pendingGlobal = next;
      hud.toast(t('pad.powerGlobal', { power: POWERS[next].name, confirm: padGlyph(buttonsFor(this.scheme, 'primary')[0]), cancel: padGlyph(buttonsFor(this.scheme, 'context')[0]) }), 'gold');
    } else { this.pendingGlobal = null; hud.activatePower(next); }
  }

  /** ⧉ segurado: enquadra o mapa inteiro; ao soltar volta ao zoom anterior, centrado onde o cursor estiver (se ele andou). */
  private startOverview(): void {
    if (this.overview) return;
    const cam = this.d.renderer.cam;
    this.overview = { x: cam.x, y: cam.y, zoom: cam.zoom, cx: this.cursor.x, cy: this.cursor.y };
    this.d.renderer.fitMap();
  }
  private endOverview(): void {
    const o = this.overview; if (!o) return; this.overview = null;
    const cam = this.d.renderer.cam;
    const moved = Math.abs(this.cursor.x - o.cx) + Math.abs(this.cursor.y - o.cy) > 12 && !this.d.input.hudAt(this.cursor.x, this.cursor.y);
    const w = cam.screenToWorld(this.cursor.x, this.cursor.y);
    cam.zoom = o.zoom;
    if (moved) { cam.centerOn(w.x, w.y); this.cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }; }
    else { cam.x = o.x; cam.y = o.y; cam.clamp(); }
  }

  private gameHints(s: Session, mod: boolean, pages: number): string {
    const sc = this.scheme; const g = (a: PadAction) => buttonsFor(sc, a).filter((i) => i !== BTN.RT).map((i) => padGlyph(i)).join('');
    const it = (glyph: string, label: string) => `<span class="ph">${glyph}${label}</span>`;
    const camStick = padGlyph(sc.cursorStick === 'left' ? 'RS' : 'LS');
    let items: string[];
    if (mod) items = [it(`${padGlyph(0)}${padGlyph(1)}${padGlyph(2)}${padGlyph(3)}`, t('pad.hint.panel')), it(`${padGlyph(BTN.LB)}${padGlyph(BTN.RB)}`, t('pad.hint.page', { n: this.gridPage + 1, m: pages })), it(padGlyph(BTN.UP), t('pad.hint.saveGroup')), it(`${camStick}↕`, t('pad.hint.zoom'))];
    else if (this.pendingGlobal) items = [it(g('primary'), t('pad.hint.cast', { power: POWERS[this.pendingGlobal].name })), it(g('power'), t('pad.hint.next')), it(g('context'), t('pad.hint.cancel'))];
    else if (s.ui.mode === 'place') items = [it(g('primary'), t('pad.hint.build')), it(g('context'), t('pad.hint.cancel'))];
    else if (s.ui.mode !== 'normal') items = [it(g('primary'), t('pad.hint.target')), it(g('context'), t('pad.hint.cancel'))];
    else items = [it(`${g('primary')}${padGlyph(BTN.RT)}`, t('pad.hint.select')), it(g('context'), t('pad.hint.order')), it(g('attackMove'), t('pad.hint.attackMove')), it(g('stop'), t('pad.hint.stop')), it(g('modifier'), t('pad.hint.commands')), it(`${padGlyph(BTN.LB)}${padGlyph(BTN.RB)}`, t('pad.hint.groups')), it('<span class="pb pb-dp">✚</span>', t('pad.hint.dpad')), it(g('menu'), t('pad.hint.menu'))];
    return items.join('');
  }

  // ---------------- menus e modais: foco navegável ----------------
  private navRoot(): HTMLElement { return this.d.hud.modalOpen ? this.d.hud.modal : this.d.menu.el; }

  private nav(dt: number, pressed: boolean[], L: { x: number; y: number }, R: { x: number; y: number; mag: number }): void {
    const root = this.navRoot();
    const sc = this.scheme;
    const edge = (i: number) => !!pressed[i] && !this.prevRaw[i];
    const navStick = sc.cursorStick === 'left' ? L : R;
    const dir = dirFrom(!!pressed[BTN.UP], !!pressed[BTN.DOWN], !!pressed[BTN.LEFT], !!pressed[BTN.RIGHT], navStick.x, navStick.y);
    if (dir !== this.navDir) { this.navDir = dir; this.navRep.reset(); }
    const fire = this.navRep.update(dir !== null, dt);
    this.ensureFocus(root);
    if (fire && dir) this.moveFocus(root, dir);
    if (edge(sc.confirm)) this.navConfirm();
    else if (edge(sc.back)) this.navBack();
    if (edge(BTN.LB)) this.navTab(root, -1);
    if (edge(BTN.RB)) this.navTab(root, 1);
    if (edge(BTN.START) && this.d.hud.modalOpen && this.d.hud.menuIsOpen) this.navBack();
    // o outro analógico rola a caixa (listas longas, enciclopédia)
    const scroll = sc.cursorStick === 'left' ? R : L;
    if (Math.abs(scroll.y) > 0.05) { const box = this.scrollBox(root); if (box) box.scrollTop += scroll.y * 900 * dt; }
    this.navHints(root);
  }

  private focusables(root: HTMLElement): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => !(e as HTMLButtonElement).disabled && !e.classList.contains('locked') && !e.closest('.hidden') && e.getClientRects().length > 0);
  }
  private keyOf(e: HTMLElement, list: HTMLElement[]): string {
    if (e.id) return `#${e.id}`;
    const ds = e.dataset;
    if (ds.tab) return `tab:${ds.tab}`;
    if (ds.god) return `god:${ds.god}`;
    if (e.classList.contains('mission') && ds.id) return `mission:${ds.id}`;
    const card = e.closest('[data-id], [data-scn]') as HTMLElement | null;
    if (card && ds.act) return `act:${card.dataset.id ?? card.dataset.scn}:${ds.act}`;
    return `idx:${list.indexOf(e)}`;
  }
  private ensureFocus(root: HTMLElement): void {
    if (this.focusEl && this.focusEl.isConnected && this.focusRoot === root && root.contains(this.focusEl) && this.focusEl.getClientRects().length > 0 && !(this.focusEl as HTMLButtonElement).disabled) return;
    const list = this.focusables(root);
    if (!list.length) { this.setFocus(null); return; }
    // alvo inicial pedido pelo conteúdo novo (ex.: título dos Créditos, para o modal longo não abrir rolado até o Fechar);
    // vale uma vez, antes da memória do último foco nesta raiz (o #modal é reaproveitado entre modais)
    const auto = list.find((e) => e.hasAttribute('data-autofocus'));
    if (auto) auto.removeAttribute('data-autofocus');
    const key = this.focusKeys.get(root);
    let next = auto ?? (key ? list.find((e) => this.keyOf(e, list) === key) : undefined);
    if (!next && key?.startsWith('idx:')) next = list[Math.min(list.length - 1, Number(key.slice(4)))];
    if (!next) next = root === this.d.menu.el ? list.find((e) => e.matches('.tabs .btn.active')) : list.find((e) => e.matches('.btn.primary'));
    this.focusRoot = root;
    this.setFocus(next ?? list[0]);
  }
  private setFocus(e: HTMLElement | null): void {
    const prev = this.focusEl;
    if (prev) { (prev.closest('label') ?? prev).classList.remove('pad-focus', 'pad-editing'); if (document.activeElement === prev && prev !== e) prev.blur(); }
    this.focusEl = e;
    if (!e) return;
    const ring = e.closest('label') ?? e;
    ring.classList.add('pad-focus');
    ring.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const root = this.focusRoot;
    if (root) this.focusKeys.set(root, this.keyOf(e, this.focusables(root)));
  }
  private moveFocus(root: HTMLElement, dir: Dir): void {
    const f = this.focusEl;
    if (this.editingSelect) {
      const sel = this.editingSelect.el; const step = dir === 'up' || dir === 'left' ? -1 : 1;
      let i = sel.selectedIndex;
      do { i += step; } while (i >= 0 && i < sel.options.length && sel.options[i].disabled);
      if (i >= 0 && i < sel.options.length) sel.selectedIndex = i;
      return;
    }
    if (f instanceof HTMLInputElement && f.type === 'range' && (dir === 'left' || dir === 'right')) {
      const step = Number(f.step) || 1;
      const v = Math.max(Number(f.min || 0), Math.min(Number(f.max || 100), Number(f.value) + (dir === 'left' ? -step : step)));
      f.value = String(v);
      f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const list = this.focusables(root);
    const idx = f ? list.indexOf(f) : -1;
    const next = navPick(list.map((e) => e.getBoundingClientRect()), idx, dir);
    if (next >= 0) { this.focusRoot = root; this.setFocus(list[next]); }
  }
  private navConfirm(): void {
    const f = this.focusEl; if (!f) return;
    if (this.editingSelect) {
      const { el: sel, orig } = this.editingSelect; this.editingSelect = null;
      (sel.closest('label') ?? sel).classList.remove('pad-editing');
      if (sel.selectedIndex !== orig) this.withDialogs(() => { sel.dispatchEvent(new Event('change', { bubbles: true })); });
      return;
    }
    if (f instanceof HTMLSelectElement) { this.editingSelect = { el: f, orig: f.selectedIndex }; (f.closest('label') ?? f).classList.add('pad-editing'); return; }
    if ((f instanceof HTMLInputElement && TEXT_TYPES.includes(f.type)) || f instanceof HTMLTextAreaElement) { if (document.activeElement === f) f.blur(); else f.focus(); return; }
    this.activate_(f);
  }
  private navBack(): void {
    if (this.editingSelect) { const { el: sel, orig } = this.editingSelect; sel.selectedIndex = orig; (sel.closest('label') ?? sel).classList.remove('pad-editing'); this.editingSelect = null; return; }
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement) && ae === this.focusEl) { ae.blur(); return; }
    const hud = this.d.hud;
    if (hud.modalOpen) {
      const m = hud.modal;
      const btn = (hud.menuIsOpen ? m.querySelector('#m-continue') : null) ?? ['#m-close', '#m-cancel', '#m-continue', '#m-go'].map((q) => m.querySelector(q)).find((x) => !!x);
      if (btn) this.activate_(btn as HTMLElement);
      else if (hud.canDismissModal) hud.hideModal();
      return;
    }
    this.d.menu.navBack();
  }
  /** LB/RB: abas do menu principal ou da enciclopédia. */
  private navTab(root: HTMLElement, dir: number): void {
    const tabs = [...root.querySelectorAll<HTMLElement>('.tabs [data-tab]')].filter((e) => e.getClientRects().length > 0);
    if (tabs.length < 2) return;
    const i = Math.max(0, tabs.findIndex((e) => e.classList.contains('active')));
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    this.focusKeys.set(root, `tab:${next.dataset.tab}`);
    this.setFocus(null); this.focusRoot = root;
    this.activate_(next);
  }
  private scrollBox(root: HTMLElement): HTMLElement | null {
    if (root === this.d.hud.modal) { const inner = root.querySelector('[style*="overflow:auto"]') as HTMLElement | null; return inner && inner.scrollHeight > inner.clientHeight ? inner : root; }
    return root.querySelector('.box') as HTMLElement | null;
  }
  private navHints(root: HTMLElement): void {
    const sc = this.scheme;
    const it = (glyph: string, label: string) => `<span class="ph">${glyph}${label}</span>`;
    const tabs = root.querySelectorAll('.tabs [data-tab]').length > 1;
    const html = this.editingSelect
      ? [it('<span class="pb pb-dp">✚</span>', t('pad.hint.change')), it(padGlyph(sc.confirm), t('pad.hint.ok')), it(padGlyph(sc.back), t('pad.hint.cancel'))].join('')
      : [it('<span class="pb pb-dp">✚</span>', t('pad.hint.move')), it(padGlyph(sc.confirm), t('pad.hint.confirm')), it(padGlyph(sc.back), t('pad.hint.back')), tabs ? it(`${padGlyph(BTN.LB)}${padGlyph(BTN.RB)}`, t('pad.hint.tabs')) : ''].join('');
    if (html !== this.hintKey) { this.navHintsEl.innerHTML = html; this.hintKey = html; }
    this.navHintsEl.classList.remove('hidden');
  }

  // ---------------- ativação com diálogos do navegador ----------------
  /** click() com confirm/alert/prompt trocados por versões navegáveis pelo controle (os nativos travariam o laço). */
  private activate_(e: HTMLElement): void { this.withDialogs(() => e.click()); }
  private withDialogs(fn: () => void): void {
    const w = window as unknown as { confirm: (m?: string) => boolean; alert: (m?: string) => void; prompt: (m?: string, d?: string) => string | null };
    const orig = { confirm: w.confirm, alert: w.alert, prompt: w.prompt };
    let asked: string | null = null; const alerts: string[] = [];
    w.confirm = (m?: string) => { asked = String(m ?? ''); return false; };
    w.alert = (m?: string) => { alerts.push(String(m ?? '')); };
    w.prompt = (_m?: string, d?: string) => d ?? '';   // controle: aceita o valor sugerido (ex.: nome do mapa)
    try { fn(); } finally { w.confirm = orig.confirm; w.alert = orig.alert; w.prompt = orig.prompt; }
    if (asked !== null) {
      const msg: string = asked;
      this.openDialog(msg, () => { w.confirm = () => true; try { fn(); } finally { w.confirm = orig.confirm; } });
    } else if (alerts.length) this.openDialog(alerts.join('\n'), null);
  }
  private openDialog(msg: string, onYes: (() => void) | null): void {
    const sc = this.scheme;
    this.dialog = { onYes };
    this.dialogEl.innerHTML = `<div class="box"><p>${esc(msg).replace(/\n/g, '<br>')}</p><div class="acts"><span class="ph">${padGlyph(sc.confirm)}${t(onYes ? 'pad.hint.confirm' : 'pad.hint.ok')}</span>${onYes ? `<span class="ph">${padGlyph(sc.back)}${t('pad.hint.cancel')}</span>` : ''}</div></div>`;
    this.dialogEl.classList.remove('hidden');
  }
  private dialogInput(pressed: boolean[]): void {
    const sc = this.scheme; const edge = (i: number) => !!pressed[i] && !this.prevRaw[i];
    const dlg = this.dialog; if (!dlg) return;
    const yes = edge(sc.confirm), no = edge(sc.back);
    if (!yes && !no) return;
    this.dialog = null; this.dialogEl.classList.add('hidden');
    if (yes && dlg.onYes) dlg.onYes();
  }
}
