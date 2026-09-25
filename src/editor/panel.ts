// Camada DOM do editor de mapas (docs/EDITOR.md §4.2–4.6): barra #editor-top dentro de #top e painel #editor em
// #bottom (no lugar de #selection/#commands). Abas de ferramentas, subpaleta, pincel, jogador ativo, sobreposições,
// inspetor do selecionado, lista de validação (Ir até / Corrigir), modais (Testar, Propriedades, menu por Esc, atalhos),
// salvar/exportar e autosave. Nunca muta o estado diretamente: tudo passa pela MapEditor (apply/setMeta/fix*).
import { MAX_PLAYERS, PLAYER_COLORS, TERRAIN, type Difficulty, type GameMode, type NodeType } from '../core/constants';
import { BUILDINGS, BUILD_MENU, MAJOR_GODS, MAJOR_GOD_LIST, UNITS } from '../core/data';
import { GAME_MODES, DIFFICULTIES } from '../core/constants';
import type { UnitClass } from '../core/types';
import { NODE_AMOUNT } from '../core/map/mapgen';
import type { MapIssue } from '../core/map/fixed';
import { idx, inBounds } from '../core/map/grid';
import { exportMapFile, putMap, mapName, slugify } from '../game/maps';
import type { HUD } from '../ui/hud';
import type { Renderer } from '../render/renderer';
import { terrainHex } from '../render/palette';
import { issueText } from '../ui/menu';
import { esc } from '../ui/html';
import { t } from '../i18n';
import type { MapEditor } from './editor';
import type { EditError } from './ops';
import type { EditorTool } from './types';
import { lintScenario, validateScenario, type ScenarioFile, type ScenarioIssue, type ScenarioObjectiveDef, type ScenarioTriggerDef, type ScenarioHud, type Condition } from '../core/scenario/schema';

export const AUTOSAVE_KEY = 'aoe_editor_autosave';
const TEST_OPTS_KEY = 'aoe_editor_test';
const AUTOSAVE_MS = 5000;
const VALIDATE_MS = 300;

/** Opções do modal Testar (§4.6). scenario: testar com o cenário embutido (jogadores do cenário prevalecem). */
export interface TestOpts { as: number; slots: (Difficulty | 'empty')[]; god: string; mode: GameMode; reveal: boolean; scenario?: boolean }

/** Modelos do modal Gatilhos (docs/EDITOR.md §5 Etapa 5): cada um acrescenta objetivos/gatilhos/HUD ao cenário atual. */
type ScenarioTemplateId = 'dialogue' | 'raid' | 'count' | 'countdown' | 'wave';
const SCENARIO_TEMPLATES: ScenarioTemplateId[] = ['dialogue', 'raid', 'count', 'countdown', 'wave'];
interface ScenarioTemplate { objectives?: ScenarioObjectiveDef[]; triggers?: ScenarioTriggerDef[]; hud?: ScenarioHud[]; defeat?: Condition; victoryObjective?: string }
function scenarioTemplate(id: ScenarioTemplateId): ScenarioTemplate {
  switch (id) {
    case 'dialogue': return { triggers: [{ id: 'dialogo', when: { time: { gte: 2 } }, then: [{ do: 'say', speaker: { pt: 'Oráculo de Delfos', en: 'Oracle of Delphi' }, text: { pt: 'Arconte, os deuses observam. Comece pelos cidadãos.', en: 'Archon, the gods are watching. Start with villagers.' }, icon: '🔮' }] }] };
    case 'raid': return { triggers: [{ id: 'invasao', when: { time: { gte: 180 } }, then: [{ do: 'raid', player: 1, units: ['hoplite', 'hoplite', 'toxotes'], target: { tc: 0 }, angle: 3, distance: 20 }, { do: 'say', speaker: { pt: 'Batedor', en: 'Scout' }, text: { pt: 'Inimigos se aproximam! Reúna seus hoplitas.', en: 'Enemies approach! Rally your hoplites.' }, icon: '🐎' }] }] };
    case 'count': return { objectives: [{ id: 'cidadaos', text: { pt: 'Treine 10 Cidadãos', en: 'Train 10 Villagers' }, done: { units: { player: 0, type: 'villager' }, gte: 10 } }], victoryObjective: 'cidadaos' };
    case 'countdown': return {
      objectives: [{ id: 'prazo', text: { pt: 'Destrua o Centro Cívico inimigo em 10 minutos', en: 'Destroy the enemy Town Center within 10 minutes' }, done: { buildings: { player: 1, type: 'town_center' }, eq: 0 }, failed: { time: { gte: 600 } } }],
      hud: [{ type: 'countdown', seconds: 600, while: { objective: 'prazo', is: 'pending' }, label: { pt: 'Prazo', en: 'Deadline' } }],
      defeat: { objective: 'prazo', is: 'failed' }, victoryObjective: 'prazo',
    };
    case 'wave': return { triggers: [{ id: 'onda', repeat: true, when: { every: { seconds: 120, after: 60 } }, then: [
      { do: 'forEachPlayer', team: 0, alive: true, then: [{ do: 'raid', player: 1, units: ['hoplite', 'hoplite', 'toxotes', 'toxotes'], target: { tc: '$p' }, angle: { base: 2, perIndex: 3 }, distance: 22 }] },
      { do: 'say', speaker: { pt: 'Batedor', en: 'Scout' }, text: { pt: 'Mais uma onda inimiga!', en: 'Another enemy wave!' }, icon: '🐎' },
    ] }] };
  }
}
/** Id livre na lista (acrescenta 2, 3… se já existir). */
function uniqueId(base: string, used: Set<string>): string { let id = base, n = 2; while (used.has(id)) id = `${base}${n++}`; used.add(id); return id; }
export interface EditorPanelCallbacks { onTest: (opts: TestOpts) => void; onExit: () => void }

const TOOLS: { id: EditorTool; key: string; icon: string }[] = [
  { id: 'terrain', key: 'T', icon: '🖌' }, { id: 'node', key: 'N', icon: '🌲' }, { id: 'building', key: 'B', icon: '🏛' }, { id: 'unit', key: 'U', icon: '⚔' },
  { id: 'start', key: 'I', icon: '🚩' }, { id: 'select', key: 'V', icon: '🖱' }, { id: 'erase', key: 'E', icon: '🧽' },
];
/** Subpaleta de terreno na ordem das teclas 1..6 (grama, areia, terra, água, montanha, água profunda). */
const TERRAIN_ORDER: number[] = [TERRAIN.GRASS, TERRAIN.SAND, TERRAIN.DIRT, TERRAIN.WATER, TERRAIN.MOUNTAIN, TERRAIN.DEEP];
const NODE_TYPES: NodeType[] = ['tree', 'berry', 'deer', 'boar', 'gold', 'lure'];
const NODE_ICONS: Record<NodeType, string> = { tree: '🌲', berry: '🫐', deer: '🦌', boar: '🐗', gold: '⛏', lure: '🔱' };
const UNIT_CLASSES: UnitClass[] = ['villager', 'scout', 'infantry', 'archer', 'skirmisher', 'cavalry', 'siege', 'hero', 'myth', 'titan'];
const el = (tag: string, cls?: string, html?: string): HTMLElement => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

/** Categoria de um edifício para a paleta (economia, militar, cultura, especiais). */
function buildingCategory(id: string): 'economy' | 'military' | 'culture' | 'special' {
  const d = BUILDINGS[id];
  if (d.wonder || d.titanGate || d.notBuildable || d.plenty) return 'special';
  if (d.military || d.wall || d.gate || (d.attack ?? 0) > 0) return 'military';
  if (d.worship || d.scholars) return 'culture';
  return 'economy';
}

export class EditorPanel {
  readonly top: HTMLElement;
  readonly root: HTMLElement;
  private toolsEl!: HTMLElement; private paletteEl!: HTMLElement; private brushEl!: HTMLElement; private playerEl!: HTMLElement; private overlayEl!: HTMLElement; private inspEl!: HTMLElement; private issuesEl!: HTMLElement; private issuesHead!: HTMLElement;
  private keys = { top: '', tools: '', palette: '', brush: '', player: '', overlay: '', insp: '' };
  private issues: MapIssue[] = [];
  private validateTimer: ReturnType<typeof setTimeout> | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastErr = { code: '', at: 0 };
  private pendingPick: ((x: number, y: number) => void) | null = null;
  private destroyed = false;
  private touched = false;                // houve edição nesta instância: só então o autosave pode substituir o rascunho anterior
  private quotaWarned = false;
  private readonly onPageHide = () => { this.autosaveNow(); };
  // modal Gatilhos: rascunho do JSON entre aberturas (Pegar ponto fecha e reabre o modal) e posição do cursor
  private esDraft: string | null = null;
  private esCursor = 0;
  private esTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly editor: MapEditor, private hud: HUD, private renderer: Renderer, private cb: EditorPanelCallbacks) {
    this.top = el('div'); this.top.id = 'editor-top';
    this.root = el('div'); this.root.id = 'editor';
    this.build();
    hud.mountTop(this.top); hud.mountBottom(this.root);
    window.addEventListener('pagehide', this.onPageHide); window.addEventListener('beforeunload', this.onPageHide);   // fechar/recarregar grava o rascunho
    editor.onChange = () => this.onChange();
    editor.onError = (e) => this.onError(e);
    this.issues = editor.validate();
    this.renderAll();
  }

  // ---------------------------------------------------------------------------------------------------------
  // Montagem
  // ---------------------------------------------------------------------------------------------------------
  private build() {
    const q = (id: string) => this.root.querySelector(id) as HTMLElement;
    this.root.innerHTML = `<div class="col tools" id="ed-tools"></div>
      <div class="col mid"><div id="ed-palette" class="chips"></div><div id="ed-brush" class="row"></div><div class="row"><div id="ed-player" class="row"></div><span class="sep"></span><div id="ed-overlays" class="row"></div></div></div>
      <div class="col right"><div id="ed-insp"></div><div class="issues-head" id="ed-issues-head"></div><ul class="issues" id="ed-issues"></ul></div>`;
    this.toolsEl = q('#ed-tools'); this.paletteEl = q('#ed-palette'); this.brushEl = q('#ed-brush'); this.playerEl = q('#ed-player'); this.overlayEl = q('#ed-overlays'); this.inspEl = q('#ed-insp'); this.issuesEl = q('#ed-issues') as HTMLElement; this.issuesHead = q('#ed-issues-head');
    // ferramentas (fixas)
    for (const tool of TOOLS) {
      const b = el('button', 'tool', `<span class="ic">${tool.icon}</span><span class="lbl">${t(`editor.tool.${tool.id}`)}</span><kbd>${tool.key}</kbd>`);
      b.dataset.tool = tool.id;
      b.addEventListener('click', () => { this.cancelPick(); this.editor.ui.tool = tool.id; this.editor.ui.selected = tool.id === 'select' ? this.editor.ui.selected : null; this.renderAll(); });
      this.toolsEl.appendChild(b);
    }
    // pincel (construído uma vez; valores atualizados em renderBrush para não perder o arraste do controle)
    this.brushEl.innerHTML = `<span class="lbl">${t('editor.brushRadius')}</span><input type="range" id="ed-radius" min="1" max="8" step="1"><b id="ed-radius-v"></b><button class="btn" id="ed-shape"></button><span class="hint" id="ed-hint"></span>`;
    (this.brushEl.querySelector('#ed-radius') as HTMLInputElement).addEventListener('change', (e) => (e.target as HTMLElement).blur());   // devolve os atalhos ao canvas
    (this.brushEl.querySelector('#ed-radius') as HTMLInputElement).addEventListener('input', (e) => { this.editor.ui.brushRadius = Math.max(1, Math.min(8, Number((e.target as HTMLInputElement).value) || 1)); this.renderBrush(); });
    this.brushEl.querySelector('#ed-shape')!.addEventListener('click', () => { const ui = this.editor.ui; ui.brushShape = ui.brushShape === 'circle' ? 'square' : 'circle'; this.renderBrush(); });
    // jogador ativo + completo/em obra
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const b = el('button', 'pl', String(i + 1)); b.style.background = PLAYER_COLORS[i].hex; b.title = t('editor.playerN', { n: i + 1 }) + ` (Shift+${i + 1})`; b.dataset.player = String(i);
      b.addEventListener('click', () => { this.editor.ui.player = i; this.renderPlayer(); });
      this.playerEl.appendChild(b);
    }
    const comp = el('button', 'btn', ''); comp.id = 'ed-complete'; comp.title = 'C'; comp.addEventListener('click', () => { this.editor.ui.complete = !this.editor.ui.complete; this.renderPlayer(); }); this.playerEl.appendChild(comp);
    // sobreposições
    for (const [id, key, prop] of [['grid', 'G', 'showGrid'], ['regions', 'R', 'showRegions'], ['passable', 'O', 'showPassable'], ['kit', 'K', 'showKit']] as const) {
      const b = el('button', 'btn ov', `${t(`editor.${id}`)} <kbd>${key}</kbd>`); b.dataset.ov = prop;
      b.addEventListener('click', () => { const ui = this.editor.ui; ui[prop] = !ui[prop]; this.renderOverlays(); });
      this.overlayEl.appendChild(b);
    }
    // barra superior
    this.top.innerHTML = `<span class="name" id="ed-name" title="${t('editor.rename')}"></span><span class="counters" id="ed-counters"></span><span class="status" id="ed-status"></span><span class="spacer"></span>
      <button class="btn" id="ed-validate">${t('editor.validate')}</button><button class="btn primary" id="ed-test">${t('editor.test')}</button><button class="btn" id="ed-save">${t('editor.save')}</button><button class="btn" id="ed-export">${t('editor.exportBtn')}</button><button class="btn" id="ed-props">${t('editor.props')}</button><button class="btn" id="ed-triggers">${t('editor.triggers')}</button><button class="btn" id="ed-hotkeys" title="H">${t('editor.hkBtn')}</button><button class="btn danger" id="ed-exit">${t('editor.exit')}</button>`;
    const tq = (id: string) => this.top.querySelector(id) as HTMLElement;
    tq('#ed-name').addEventListener('click', () => this.rename());
    tq('#ed-triggers').addEventListener('click', () => this.showTriggers());
    tq('#ed-validate').addEventListener('click', () => { this.validateNow(); this.hud.toast(this.statusText(), this.issues.some((i) => i.level === 'error') ? 'warn' : this.issues.length ? 'gold' : 'good'); });
    tq('#ed-test').addEventListener('click', () => this.showTest());
    tq('#ed-save').addEventListener('click', () => this.save());
    tq('#ed-export').addEventListener('click', () => this.exportFile());
    tq('#ed-props').addEventListener('click', () => this.showProperties());
    tq('#ed-hotkeys').addEventListener('click', () => this.showHotkeys());
    tq('#ed-exit').addEventListener('click', () => this.cb.onExit());
  }

  // ---------------------------------------------------------------------------------------------------------
  // Atualização (uma vez por quadro: só as partes cuja chave mudou)
  // ---------------------------------------------------------------------------------------------------------
  update(): void {
    if (this.destroyed) return;
    this.renderTop(); this.renderTools(); this.renderPalette(); this.renderBrush(); this.renderPlayer(); this.renderOverlays(); this.renderInspector();
    const ui = this.editor.ui;
    const cur = ui.tool === 'erase' ? 'cur-erase' : ui.tool === 'terrain' || ui.tool === 'node' ? 'cur-brush' : ui.tool === 'select' ? '' : 'cur-place';
    if (document.body.className !== cur && !this.hud.modalOpen) document.body.className = cur;
  }
  private renderAll(): void { this.keys = { top: '', tools: '', palette: '', brush: '', player: '', overlay: '', insp: '' }; this.update(); this.renderIssues(); }

  private mapTitle(): string { return this.editor.meta.name?.trim() || t('editor.untitled'); }
  private statusText(): string {
    const errors = this.issues.filter((i) => i.level === 'error').length, warns = this.issues.length - errors;
    return errors ? t('editor.errors', { n: errors }) : warns ? t('editor.warnings', { n: warns }) : t('editor.valid');
  }
  private renderTop(): void {
    const ed = this.editor;
    const key = `${this.mapTitle()}|${ed.dirty}|${ed.undoDepth}|${ed.redoDepth}|${this.statusText()}|${ed.meta.scenario ? 's' : ''}`;
    if (key === this.keys.top) return; this.keys.top = key;
    const errors = this.issues.some((i) => i.level === 'error');
    (this.top.querySelector('#ed-name') as HTMLElement).innerHTML = `${esc(this.mapTitle())}${ed.meta.scenario ? ` <span title="${t('editor.hasScenario')}">📜</span>` : ''}${ed.dirty ? ' <span class="dirty">•</span>' : ''}`;
    (this.top.querySelector('#ed-counters') as HTMLElement).innerHTML = `<span title="${t('editor.undo')} (Ctrl+Z)">↶ ${ed.undoDepth}</span> <span title="${t('editor.redo')} (Ctrl+Y)">↷ ${ed.redoDepth}</span>`;
    const st = this.top.querySelector('#ed-status') as HTMLElement;
    st.textContent = this.statusText(); st.className = `status ${errors ? 'err' : this.issues.length ? 'warn' : 'ok'}`;
  }
  private renderTools(): void {
    const key = this.editor.ui.tool;
    if (key === this.keys.tools) return; this.keys.tools = key;
    this.toolsEl.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.tool === key));
  }
  private renderPalette(): void {
    const ui = this.editor.ui;
    const key = `${ui.tool}|${ui.terrain}|${ui.nodeType}|${ui.nodeAmount}|${ui.buildingType}|${ui.unitType}`;
    if (key === this.keys.palette) return; this.keys.palette = key;
    const p = this.paletteEl; p.innerHTML = '';
    const chip = (html: string, active: boolean, tip: string, onClick: () => void, data?: [string, string]) => {
      const c = el('button', `chip ${active ? 'active' : ''}`, html); c.title = tip; if (data) c.dataset[data[0]] = data[1];
      c.addEventListener('click', onClick); return c;
    };
    if (ui.tool === 'terrain') {
      TERRAIN_ORDER.forEach((tr, i) => p.appendChild(chip(`<span class="sw" style="background:${terrainHex(tr)}"></span>${t(`editor.terrain.${tr}`)} <kbd>${i + 1}</kbd>`, ui.terrain === tr || (ui.terrain === 6 && tr === TERRAIN.DEEP), t(`editor.terrain.${tr}`), () => { ui.terrain = tr; this.renderPalette(); }, ['terrain', String(tr)])));
    } else if (ui.tool === 'node') {
      for (const nt of NODE_TYPES) p.appendChild(chip(`${NODE_ICONS[nt]} ${t(`node.${nt}`)}`, ui.nodeType === nt, `${t(`node.${nt}`)} · ${t('editor.amountDefault')}: ${NODE_AMOUNT[nt]}`, () => { ui.nodeType = nt; ui.nodeAmount = null; this.renderPalette(); }, ['node', nt]));
      const amt = el('label', 'amt', `${t('editor.amount')} <input type="number" id="ed-amount" min="1" max="99999" placeholder="${NODE_AMOUNT[ui.nodeType]} (${t('editor.amountDefault')})" value="${ui.nodeAmount ?? ''}">`);
      amt.querySelector('input')!.addEventListener('change', (e) => { const v = Number((e.target as HTMLInputElement).value); ui.nodeAmount = v > 0 ? Math.round(v) : null; this.keys.palette = ''; });
      p.appendChild(amt);
      p.appendChild(el('span', 'hint', t('editor.treesHint')));
    } else if (ui.tool === 'building') {
      const ids = [...BUILD_MENU, ...Object.keys(BUILDINGS).filter((id) => !BUILD_MENU.includes(id))];
      for (const cat of ['economy', 'military', 'culture', 'special'] as const) {
        const list = ids.filter((id) => buildingCategory(id) === cat); if (!list.length) continue;
        p.appendChild(el('span', 'cat', t(`editor.cat.${cat}`)));
        for (const id of list) { const d = BUILDINGS[id]; p.appendChild(chip(`${d.icon} ${d.name}`, ui.buildingType === id, `${d.name} (${d.w}×${d.h})\n${d.desc}`, () => { ui.buildingType = id; this.renderPalette(); }, ['building', id])); }
      }
    } else if (ui.tool === 'unit') {
      for (const cls of UNIT_CLASSES) {
        const list = Object.values(UNITS).filter((u) => u.cls === cls); if (!list.length) continue;
        p.appendChild(el('span', 'cat', t(`editor.cls.${cls}`)));
        for (const u of list) p.appendChild(chip(`${u.icon} ${u.name}`, ui.unitType === u.id, `${u.name}\n${u.desc}`, () => { ui.unitType = u.id; this.renderPalette(); }, ['unit', u.id]));
      }
    } else if (ui.tool === 'start') p.appendChild(el('span', 'hint', t('editor.startsHint')));
    else if (ui.tool === 'select') p.appendChild(el('span', 'hint', t('editor.selectHint')));
    else p.appendChild(el('span', 'hint', t('editor.eraseHint')));
  }
  private renderBrush(): void {
    const ui = this.editor.ui;
    const key = `${ui.tool}|${ui.brushRadius}|${ui.brushShape}`;
    if (key === this.keys.brush) return; this.keys.brush = key;
    const show = ui.tool === 'terrain' || (ui.tool === 'node' && ui.nodeType === 'tree');
    this.brushEl.classList.toggle('hidden', !show);
    const r = this.brushEl.querySelector('#ed-radius') as HTMLInputElement; if (r.value !== String(ui.brushRadius)) r.value = String(ui.brushRadius);
    (this.brushEl.querySelector('#ed-radius-v') as HTMLElement).textContent = String(ui.brushRadius);
    (this.brushEl.querySelector('#ed-shape') as HTMLElement).textContent = t(`editor.shape.${ui.brushShape}`) + ' (X)';
    (this.brushEl.querySelector('#ed-hint') as HTMLElement).textContent = ui.tool === 'terrain' ? t('editor.fillHint') : '';
  }
  private renderPlayer(): void {
    const ui = this.editor.ui;
    const key = `${ui.player}|${ui.complete}|${ui.tool}`;
    if (key === this.keys.player) return; this.keys.player = key;
    this.playerEl.querySelectorAll('.pl').forEach((b) => b.classList.toggle('active', Number((b as HTMLElement).dataset.player) === ui.player));
    const c = this.playerEl.querySelector('#ed-complete') as HTMLElement;
    c.textContent = ui.complete ? t('editor.complete') : t('editor.inProgress'); c.classList.toggle('hidden', ui.tool !== 'building');
  }
  private renderOverlays(): void {
    const ui = this.editor.ui;
    const key = `${ui.showGrid}${ui.showRegions}${ui.showPassable}${ui.showKit}`;
    if (key === this.keys.overlay) return; this.keys.overlay = key;
    this.overlayEl.querySelectorAll('.ov').forEach((b) => b.classList.toggle('active', !!ui[(b as HTMLElement).dataset.ov as 'showGrid' | 'showRegions' | 'showPassable' | 'showKit']));
  }
  private renderInspector(): void {
    const ed = this.editor, ui = ed.ui, state = ed.state, map = ed.map;
    const sel = ui.selected;
    const hover = ui.hover && inBounds(map, ui.hover.x, ui.hover.y) ? ui.hover : null;
    const hoverText = hover ? `${hover.x}, ${hover.y} · ${t(`editor.terrain.${map.terrain[idx(map, hover.x, hover.y)]}`)}` : '';
    const selKey = sel ? `${sel.kind}:${sel.id}:${JSON.stringify(sel.kind === 'unit' ? state.units.get(sel.id) && [state.units.get(sel.id)!.owner, Math.floor(state.units.get(sel.id)!.x), Math.floor(state.units.get(sel.id)!.y)] : sel.kind === 'building' ? state.buildings.get(sel.id) && [state.buildings.get(sel.id)!.owner, state.buildings.get(sel.id)!.complete, state.buildings.get(sel.id)!.tx, state.buildings.get(sel.id)!.ty] : sel.kind === 'node' ? map.nodes.get(sel.id) && [map.nodes.get(sel.id)!.amount, map.nodes.get(sel.id)!.x, map.nodes.get(sel.id)!.y] : map.starts[sel.id] && [map.starts[sel.id].x, map.starts[sel.id].y])}:${ed.tags.get(sel.id) ?? ''}` : 'none';
    const key = `${selKey}|${hoverText}`;
    if (key === this.keys.insp) return;
    // não redesenha o formulário do inspetor enquanto um campo dele tem foco (só a linha do cursor)
    const focused = this.inspEl.contains(document.activeElement);
    if (focused && this.keys.insp.split('|')[0] === selKey) { const h = this.inspEl.querySelector('.hover'); if (h) h.textContent = hoverText; this.keys.insp = key; return; }
    this.keys.insp = key;
    const ownerSel = (owner: number) => `<label>${t('editor.owner')} <select id="ed-owner">${Array.from({ length: MAX_PLAYERS }, (_, i) => `<option value="${i}" ${owner === i ? 'selected' : ''} style="color:${PLAYER_COLORS[i].hex}">${t('editor.playerN', { n: i + 1 })}</option>`).join('')}</select></label>`;
    const tagIn = (id: number) => `<label>${t('editor.tag')} <input id="ed-tag" maxlength="32" value="${esc(ed.tags.get(id) ?? '')}"></label>`;
    let body = '';
    if (!sel) body = `<div class="hint">${t('editor.inspNone')}</div>`;
    else if (sel.kind === 'unit') { const u = state.units.get(sel.id); if (u) { const d = UNITS[u.type]; body = `<div class="ttl">${d.icon} ${d.name} <small>(${Math.floor(u.x)}, ${Math.floor(u.y)})</small></div>${ownerSel(u.owner)}${tagIn(u.id)}<button class="btn" id="ed-apply">${t('editor.apply')}</button><button class="btn danger" id="ed-remove">${t('editor.remove')}</button>`; } }
    else if (sel.kind === 'building') { const b = state.buildings.get(sel.id); if (b) { const d = BUILDINGS[b.type]; body = `<div class="ttl">${d.icon} ${d.name} <small>(${b.tx}, ${b.ty})</small></div>${ownerSel(b.owner)}<label><input type="checkbox" id="ed-bcomplete" ${b.complete ? 'checked' : ''}> ${t('editor.complete')}</label>${tagIn(b.id)}<button class="btn" id="ed-apply">${t('editor.apply')}</button><button class="btn danger" id="ed-remove">${t('editor.remove')}</button>`; } }
    else if (sel.kind === 'node') { const n = map.nodes.get(sel.id); if (n) body = `<div class="ttl">${NODE_ICONS[n.type]} ${t(`node.${n.type}`)} <small>(${n.x}, ${n.y})</small></div><label>${t('editor.amount')} <input type="number" id="ed-namount" min="1" max="99999" value="${Math.round(n.amount)}"></label><button class="btn" id="ed-apply">${t('editor.apply')}</button><button class="btn danger" id="ed-remove">${t('editor.remove')}</button>`; }
    else { const s = map.starts[sel.id]; if (s) body = `<div class="ttl" style="color:${PLAYER_COLORS[sel.id % PLAYER_COLORS.length].hex}">🚩 ${t('editor.inspStart', { n: sel.id + 1 })} <small>(${s.x}, ${s.y})</small></div><button class="btn danger" id="ed-remove">${t('editor.remove')}</button>`; }
    if (!body) { ui.selected = null; body = `<div class="hint">${t('editor.inspNone')}</div>`; }
    this.inspEl.innerHTML = `<div class="head">${t('editor.inspector')} <span class="hover">${hoverText}</span></div>${body}`;
    const q = (id: string) => this.inspEl.querySelector(id) as HTMLInputElement | null;
    q('#ed-apply')?.addEventListener('click', () => {
      const s2 = ui.selected; if (!s2) return;
      try {
        if (s2.kind === 'node') { const n = map.nodes.get(s2.id); const v = Number(q('#ed-namount')?.value); if (n && v > 0) ed.apply({ kind: 'setNodeAmount', x: n.x, y: n.y, amount: Math.round(v) }); }
        else if (s2.kind === 'unit' || s2.kind === 'building') { const tag = (q('#ed-tag')?.value ?? '').trim(); ed.apply({ kind: 'setEntity', id: s2.id, owner: Number(q('#ed-owner')?.value ?? 0), complete: s2.kind === 'building' ? !!q('#ed-bcomplete')?.checked : undefined, tag: tag || null }); }
      } catch (e) { this.onError(e as EditError); }
      this.keys.insp = '';
    });
    q('#ed-remove')?.addEventListener('click', () => { ed.deleteSelected(); this.keys.insp = ''; });
  }
  private renderIssues(): void {
    const ed = this.editor;
    const ul = this.issuesEl; ul.innerHTML = '';
    this.issuesHead.textContent = `${t('editor.issues')} · ${this.statusText()}`;
    if (this.issues.length === 0) { ul.appendChild(el('li', 'ok', t('editor.issuesNone'))); return; }
    for (const it of this.issues) {
      const li = el('li', it.level, `<span class="tx">${esc(issueText(it))}</span>`);
      if (it.x !== undefined && it.y !== undefined) { const b = el('button', 'btn', t('editor.goTo')); b.addEventListener('click', () => this.goTo(it.x!, it.y!)); li.appendChild(b); }
      const fix = this.fixFor(it);
      if (fix) { const b = el('button', 'btn gold', fix.label); b.addEventListener('click', () => { const ok = fix.run(); this.hud.toast(ok ? t('editor.fixed') : t('editor.fixNone'), ok ? 'good' : 'info'); this.validateNow(); }); li.appendChild(b); }
      ul.appendChild(li);
    }
  }
  /** "Corrigir" quando cabe: ligar inícios, alargar gargalos, recursos padrão do início N, limpar raio 8. */
  private fixFor(it: MapIssue): { label: string; run: () => boolean } | null {
    const ed = this.editor;
    const start = Number(it.params?.start ?? it.params?.player ?? 0) - 1;
    switch (it.code) {
      case 'startsDisconnected': return { label: t('editor.fix.connect'), run: () => ed.fixConnectivity() };
      case 'chokepoint': return { label: t('editor.fix.widen'), run: () => ed.widenChokepoints() };
      case 'lowStartFood': case 'lowStartWood': return start >= 0 ? { label: t('editor.fix.resources', { n: start + 1 }), run: () => ed.placeStartResources(start, (Math.floor(Math.random() * 1e9)) >>> 0) } : null;
      case 'startBlocked': { const i = ed.map.starts.findIndex((s) => s.x === it.x && s.y === it.y); return i >= 0 ? { label: t('editor.fix.clear'), run: () => ed.clearRadius(i) } : null; }
      default: return null;
    }
  }
  /** "Ir até": centra a câmera e pisca o tile. */
  goTo(x: number, y: number): void { this.editor.goTo(x, y); this.renderer.cam.centerOn(x + 0.5, y + 0.5); }

  // ---------------------------------------------------------------------------------------------------------
  // Eventos do editor: validação com atraso, autosave com atraso, erros de op como toast
  // ---------------------------------------------------------------------------------------------------------
  private onChange(): void {
    if (this.destroyed) return;
    this.touched = true;
    if (this.validateTimer) clearTimeout(this.validateTimer);
    this.validateTimer = setTimeout(() => { this.validateTimer = null; this.validateNow(); }, VALIDATE_MS);
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => { this.autosaveTimer = null; this.autosaveNow(); }, AUTOSAVE_MS);
  }
  private onError(e: EditError): void {
    const now = performance.now();
    if (e.code === this.lastErr.code && now - this.lastErr.at < 1500) return;
    this.lastErr = { code: e.code, at: now };
    this.hud.toast(t(`editor.err.${e.code}`), 'warn');
  }
  validateNow(): void { this.issues = this.editor.validate(); this.keys.top = ''; this.renderTop(); this.renderIssues(); }
  /** Rascunho em aoe_editor_autosave (também antes de Testar e ao sair). */
  autosaveNow(): boolean {
    if (this.autosaveTimer) { clearTimeout(this.autosaveTimer); this.autosaveTimer = null; }
    if (!this.touched && !this.editor.dirty) return true;   // abrir e fechar sem editar não substitui o rascunho anterior
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(this.editor.toFile())); return true; }
    catch { if (!this.quotaWarned) { this.quotaWarned = true; this.hud.toast(t('editor.autosaveFail'), 'warn'); } return false; }   // cota cheia: avisa uma vez
  }

  // ---------------------------------------------------------------------------------------------------------
  // Ações: renomear, salvar, exportar
  // ---------------------------------------------------------------------------------------------------------
  rename(): void {
    const name = (window.prompt(t('editor.renamePrompt'), this.editor.meta.name ?? '') ?? '').trim();
    if (name) this.editor.setMeta({ name });
  }
  save(): boolean {
    const ed = this.editor;
    try {
      const entry = putMap(ed.toFile());
      if (entry.id !== ed.meta.id) ed.setMeta({ id: entry.id });   // embutido → "-copia"
      ed.dirty = false; this.keys.top = ''; this.renderTop();
      this.hud.toast(t('editor.saved', { name: esc(mapName(entry)) }), 'good');
      this.autosaveNow();
      return true;
    } catch { this.hud.toast(t('msg.mapQuota'), 'warn'); return false; }
  }
  exportFile(): void { void exportMapFile(this.editor.toFile()).then((ok) => { if (ok) this.hud.toast(t('msg.mapExported'), 'good'); }); }

  // ---------------------------------------------------------------------------------------------------------
  // Modais: Testar, Propriedades, menu do editor (Esc), atalhos (H)
  // ---------------------------------------------------------------------------------------------------------
  showTest(): void {
    const ed = this.editor, starts = ed.map.starts;
    if (starts.length < 2) { this.hud.toast(t('editor.testNeedStarts'), 'warn'); return; }
    this.validateNow();
    const errors = this.issues.filter((i) => i.level === 'error');
    if (errors.length) { this.hud.showModal(`<h2>${t('editor.testTitle')}</h2><p>${t('editor.testErrors')}</p><ul>${errors.map((i) => `<li style="color:#ef4444">${esc(issueText(i))}</li>`).join('')}</ul><div class="actions"><button class="btn primary" id="m-close">${t('modal.close')}</button></div>`); this.hud.modal.querySelector('#m-close')!.addEventListener('click', () => this.hud.hideModal()); return; }
    let saved: Partial<TestOpts & { remember: boolean }> = {};
    try { saved = JSON.parse(localStorage.getItem(TEST_OPTS_KEY) ?? '{}'); } catch { /* ignore */ }
    const as = Math.min(starts.length - 1, saved.as ?? 0);
    const slotSel = (i: number) => `<label>${t('editor.testStartN', { n: i + 1 })} <select data-slot="${i}">${[['empty', t('editor.testEmpty')], ...Object.keys(DIFFICULTIES).map((d) => [d, t('editor.testAI', { diff: t(`diff.${d}`) })])].map(([v, l]) => `<option value="${v}" ${(saved.slots?.[i] ?? 'normal') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    this.hud.showModal(`<h2>${t('editor.testTitle')}</h2><p>${t('editor.testIntro')}</p>
      <div class="row" style="flex-direction:column;gap:6px">
        <label>${t('editor.testAs')} <select id="et-as">${starts.map((_, i) => `<option value="${i}" ${as === i ? 'selected' : ''}>${t('editor.testStartN', { n: i + 1 })}</option>`).join('')}</select></label>
        <div id="et-slots" style="display:flex;flex-direction:column;gap:4px">${starts.map((_, i) => slotSel(i)).join('')}</div>
        <label>${t('editor.testGod')} <select id="et-god">${MAJOR_GOD_LIST.map((g) => `<option value="${g}" ${(saved.god ?? 'zeus') === g ? 'selected' : ''}>${MAJOR_GODS[g].icon} ${MAJOR_GODS[g].name}</option>`).join('')}</select></label>
        <label>${t('editor.testMode')} <select id="et-mode">${GAME_MODES.map((m) => `<option value="${m}" ${(saved.mode ?? 'conquest') === m ? 'selected' : ''}>${t(`mode.${m}`)}</option>`).join('')}</select></label>
        <label><input type="checkbox" id="et-reveal" ${saved.reveal ? 'checked' : ''}> ${t('editor.testReveal')}</label>
        ${ed.meta.scenario ? `<label><input type="checkbox" id="et-scenario" ${saved.scenario === false ? '' : 'checked'}> ${t('editor.testScenario')}</label>` : ''}
        <label><input type="checkbox" id="et-remember" ${saved.remember !== false ? 'checked' : ''}> ${t('editor.testRemember')}</label>
      </div>
      <div class="actions"><button class="btn" id="m-cancel">${t('modal.cancel')}</button><button class="btn primary" id="et-go">${t('editor.testGo')}</button></div>`);
    const m = this.hud.modal; const q = (id: string) => m.querySelector(id) as HTMLInputElement;
    // com o cenário embutido, jogadores/times/modo vêm do cenário: os seletores de início, deus e modo ficam apagados
    const syncSlots = () => { const a = Number(q('#et-as').value); const sc = !!q('#et-scenario')?.checked; m.querySelectorAll('[data-slot]').forEach((s) => { const i = Number((s as HTMLElement).dataset.slot); (s as HTMLSelectElement).disabled = i === a || sc; (s.parentElement as HTMLElement).style.opacity = i === a || sc ? '0.45' : '1'; }); for (const id of ['#et-as', '#et-god', '#et-mode']) { q(id).disabled = sc; (q(id).parentElement as HTMLElement).style.opacity = sc ? '0.45' : '1'; } };
    q('#et-as').addEventListener('change', syncSlots); q('#et-scenario')?.addEventListener('change', syncSlots); syncSlots();
    q('#m-cancel').addEventListener('click', () => this.hud.hideModal());
    q('#et-go').addEventListener('click', () => {
      const opts: TestOpts = { as: Number(q('#et-as').value), slots: starts.map((_, i) => (m.querySelector(`[data-slot="${i}"]`) as HTMLSelectElement).value as Difficulty | 'empty'), god: q('#et-god').value, mode: q('#et-mode').value as GameMode, reveal: q('#et-reveal').checked, scenario: !!ed.meta.scenario && !!q('#et-scenario')?.checked };
      const remember = q('#et-remember').checked;
      try { if (remember) localStorage.setItem(TEST_OPTS_KEY, JSON.stringify({ ...opts, remember })); else localStorage.removeItem(TEST_OPTS_KEY); } catch { /* ignore */ }
      const warns = this.issues.filter((i) => i.level === 'warn').length;
      if (warns > 0 && !confirm(t('editor.testWarnConfirm', { n: warns }))) return;
      this.hud.hideModal();
      this.autosaveNow();
      this.cb.onTest(opts);
    });
  }

  showProperties(): void {
    const ed = this.editor, meta = ed.meta;
    this.hud.showModal(`<h2>${t('editor.propsTitle')}</h2>
      <div class="row" style="flex-direction:column;gap:6px">
        <label>${t('editor.propId')} <input id="ep-id" value="${esc(meta.id ?? '')}" readonly style="opacity:.6"></label>
        <label>${t('editor.propName')} <input id="ep-name" maxlength="60" value="${esc(meta.name ?? '')}"></label>
        <label>${t('editor.propNameEn')} <input id="ep-nameen" maxlength="60" value="${esc(meta.nameEn ?? '')}"></label>
        <label>${t('editor.propAuthor')} <input id="ep-author" maxlength="60" value="${esc(meta.author ?? '')}"></label>
        <label>${t('editor.propDesc')} <textarea id="ep-desc" rows="3" maxlength="500">${esc(meta.description ?? '')}</textarea></label>
        <label><input type="checkbox" id="ep-kit" ${meta.startKit === false ? '' : 'checked'}> ${t('editor.propKit')}</label>
        <label>${t('editor.propTeams')} <input id="ep-teams" value="${esc((meta.startTeams ?? []).map((x) => x + 1).join(','))}"></label>
        <div>${t('editor.propKoth')}: <b id="ep-koth">${meta.koth ? `(${meta.koth[0]}, ${meta.koth[1]})` : t('editor.propKothCenter')}</b> <button class="btn" id="ep-koth-pick">${t('editor.propKothPick')}</button> <button class="btn" id="ep-koth-clear">${t('main.fixedMapClear')}</button></div>
        <label><input type="checkbox" id="ep-relics" ${meta.relics === false ? '' : 'checked'}> ${t('editor.propRelics')}</label>
        <div><button class="btn" id="ep-vary">${t('editor.propVary')}</button></div>
      </div>
      <div class="actions"><button class="btn primary" id="ep-ok">${t('editor.propOk')}</button></div>`);
    const m = this.hud.modal; const q = (id: string) => m.querySelector(id) as HTMLInputElement;
    let koth = meta.koth ? [meta.koth[0], meta.koth[1]] as [number, number] : undefined;
    const apply = () => {
      const teamsRaw = q('#ep-teams').value.split(',').map((x) => x.trim()).filter(Boolean).map((x) => Number(x) - 1);
      const nStarts = ed.map.starts.length;
      if (teamsRaw.length && !(teamsRaw.length === nStarts && teamsRaw.every((x) => Number.isInteger(x) && x >= 0 && x < MAX_PLAYERS))) { alert(t('editor.propTeamsBad', { max: MAX_PLAYERS, n: nStarts })); return false; }
      const startTeams = teamsRaw.length ? teamsRaw : undefined;
      const val = (id: string) => q(id).value.trim() || undefined;
      ed.setMeta({ name: val('#ep-name'), nameEn: val('#ep-nameen'), author: val('#ep-author'), description: val('#ep-desc'), startKit: q('#ep-kit').checked ? undefined : false, startTeams, koth, relics: q('#ep-relics').checked ? undefined : false });
      return true;
    };
    q('#ep-koth-clear').addEventListener('click', () => { koth = undefined; q('#ep-koth').textContent = t('editor.propKothCenter'); });
    q('#ep-koth-pick').addEventListener('click', () => {
      if (apply() === false) return; this.hud.hideModal(); this.hud.toast(t('editor.propKothHint'), 'gold');
      this.setPick((x, y) => { ed.setMeta({ koth: [x, y] }); this.hud.toast(t('editor.propKothSet', { x, y }), 'good'); });
    });
    q('#ep-vary').addEventListener('click', () => { ed.varyDecor((Math.floor(Math.random() * 1e9)) >>> 0); this.hud.toast(t('editor.propVaried'), 'good'); });
    q('#ep-ok').addEventListener('click', () => { if (apply() === false) return; this.hud.hideModal(); });
  }
  // ---------------------------------------------------------------------------------------------------------
  // Modal Gatilhos: cenário JSON embutido (meta.scenario) com validação ao vivo, modelos e "pegar ponto" (§5 Etapa 5)
  // ---------------------------------------------------------------------------------------------------------
  /** Cenário mínimo para um mapa sem cenário: id do mapa, título, um jogador por início (o 1º humano), vitória por conquista. */
  private minimalScenario(): ScenarioFile {
    const ed = this.editor; const meta = ed.meta; const n = Math.max(1, ed.map.starts.length);
    const name = meta.name?.trim() || t('editor.untitled');
    const players: ScenarioFile['config']['players'] = [];
    for (let i = 0; i < n; i++) players.push(i === 0 ? { name: t('main.player'), god: 'zeus', isAI: false, difficulty: 'normal', team: 0 } : { name: `${t('editor.playerN', { n: i + 1 })} (IA)`, god: MAJOR_GOD_LIST[i % MAJOR_GOD_LIST.length], isAI: true, difficulty: 'normal', team: i });
    return { format: 'aoe-scenario', version: 1, id: meta.id ?? slugify(name), icon: '📜', title: { pt: name, en: meta.nameEn?.trim() || name }, intro: [{ pt: 'Descreva aqui a história e o que o jogador deve fazer.', en: 'Describe the story and what the player must do.' }], config: { players }, objectives: [], triggers: [], victory: { all: [{ buildings: { notTeam: 0 }, eq: 0 }] } };
  }
  /** Texto do modal → arquivo validado (validateScenario sem ids reservados); JSON malformado vira um único problema em ''. */
  private parseScenarioText(text: string): { file: ScenarioFile | null; issues: ScenarioIssue[] } {
    let obj: unknown;
    try { obj = JSON.parse(text); } catch (e) { return { file: null, issues: [{ path: '', message: t('editor.triggersJsonBad', { err: (e as Error).message }) }] }; }
    const issues = validateScenario(obj);
    return { file: issues.length ? null : (obj as ScenarioFile), issues };
  }
  showTriggers(): void {
    const ed = this.editor;
    const text = this.esDraft ?? JSON.stringify(ed.meta.scenario ?? this.minimalScenario(), null, 2);
    this.esDraft = null;
    this.hud.showModal(`<h2>${t('editor.triggersTitle')}</h2><p>${t('editor.triggersIntro')}</p>
      <div class="es-bar"><label>${t('editor.triggersTemplate')} <select id="es-template">${SCENARIO_TEMPLATES.map((id) => `<option value="${id}">${t(`editor.tpl.${id}`)}</option>`).join('')}</select></label><button class="btn" id="es-insert">${t('editor.triggersInsert')}</button><button class="btn" id="es-pick">${t('editor.triggersPick')}</button></div>
      <textarea id="es-json" class="es-json" rows="18" spellcheck="false"></textarea>
      <ul class="es-issues" id="es-issues"></ul>
      <div class="actions">${ed.meta.scenario ? `<button class="btn danger" id="es-remove">${t('editor.triggersRemove')}</button>` : ''}<button class="btn" id="m-cancel">${t('modal.cancel')}</button><button class="btn primary" id="es-save">${t('editor.triggersSave')}</button></div>`, false);
    const m = this.hud.modal; const q = (id: string) => m.querySelector(id) as HTMLInputElement;
    const ta = m.querySelector('#es-json') as HTMLTextAreaElement; ta.value = text;
    const issuesEl = q('#es-issues'); const saveBtn = m.querySelector('#es-save') as HTMLButtonElement;
    let current: { file: ScenarioFile | null; issues: ScenarioIssue[] } = { file: null, issues: [] };
    const validate = () => {
      current = this.parseScenarioText(ta.value);
      ta.classList.toggle('bad', current.issues.length > 0);
      saveBtn.disabled = current.issues.length > 0;
      if (current.file) {
        // lint (G7): avisos não bloqueiam salvar (tag futura sem { fired }, oculto que nunca aparece, fala longa ou sem en)
        const warns = lintScenario(current.file);
        issuesEl.innerHTML = `<li class="ok">${t('editor.triggersValid', { n: current.file.objectives.length, m: current.file.triggers.length })}</li>`
          + (warns.length ? `<li class="warn">${t('editor.triggersWarnings', { n: warns.length })}</li>` + warns.slice(0, 20).map((i) => `<li class="warn"><code>${esc(i.path || '$')}</code> — ${esc(i.message)}</li>`).join('') : '');
      }
      else issuesEl.innerHTML = `<li>${t('editor.triggersErrors', { n: current.issues.length })}</li>` + current.issues.slice(0, 20).map((i) => `<li><code>${esc(i.path || '$')}</code> — ${esc(i.message)}</li>`).join('');
    };
    const schedule = () => { if (this.esTimer) clearTimeout(this.esTimer); this.esTimer = setTimeout(() => { this.esTimer = null; validate(); }, VALIDATE_MS); };
    ta.addEventListener('input', schedule);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart, en = ta.selectionEnd; ta.value = `${ta.value.slice(0, s)}  ${ta.value.slice(en)}`; ta.selectionStart = ta.selectionEnd = s + 2; schedule(); } });
    validate();
    // Inserir modelo: mescla objetivos/gatilhos/HUD no JSON atual (ids únicos; referências renomeadas; vitória ganha o objetivo)
    q('#es-insert').addEventListener('click', () => {
      let obj: unknown; try { obj = JSON.parse(ta.value); } catch { this.hud.toast(t('editor.triggersFixFirst'), 'warn'); return; }
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) { this.hud.toast(t('editor.triggersFixFirst'), 'warn'); return; }
      const f = obj as Record<string, unknown>;
      const id = q('#es-template').value as ScenarioTemplateId; const tpl = scenarioTemplate(id);
      const list = (k: string) => { if (!Array.isArray(f[k])) f[k] = []; return f[k] as Record<string, unknown>[]; };
      const usedObj = new Set(list('objectives').map((o) => String(o?.id))), usedTrig = new Set(list('triggers').map((x) => String(x?.id)));
      const objIds = new Map<string, string>();
      for (const o of tpl.objectives ?? []) { const nid = uniqueId(o.id, usedObj); objIds.set(o.id, nid); list('objectives').push({ ...o, id: nid }); }
      const remap = (v: unknown): unknown => { if (Array.isArray(v)) return v.map(remap); if (typeof v === 'object' && v !== null) { const o: Record<string, unknown> = {}; for (const [k, x] of Object.entries(v)) o[k] = k === 'objective' && typeof x === 'string' && objIds.has(x) ? objIds.get(x) : remap(x); return o; } return v; };
      for (const tr of tpl.triggers ?? []) list('triggers').push(remap({ ...tr, id: uniqueId(tr.id, usedTrig) }) as Record<string, unknown>);
      for (const h of tpl.hud ?? []) list('hud').push(remap(h) as Record<string, unknown>);
      if (tpl.defeat && f.defeat === undefined) f.defeat = remap(tpl.defeat);
      if (tpl.victoryObjective) { const cond = { objective: objIds.get(tpl.victoryObjective) ?? tpl.victoryObjective, is: 'done' }; const v = f.victory as Record<string, unknown> | undefined; if (v && Array.isArray(v.all)) v.all.push(cond); else f.victory = { all: [...(v ? [v] : []), cond] }; }
      ta.value = JSON.stringify(f, null, 2);
      validate();
      this.hud.toast(t('editor.triggersInserted', { name: t(`editor.tpl.${id}`) }), 'good');
    });
    // Pegar ponto: fecha o modal, o próximo clique no mapa insere { "at": [x, y] } na posição do cursor e reabre o modal
    q('#es-pick').addEventListener('click', () => {
      this.esDraft = ta.value; this.esCursor = ta.selectionStart;
      this.hud.hideModal(); this.hud.toast(t('editor.triggersPickHint'), 'gold');
      this.setPick((x, y) => {
        const d = this.esDraft ?? ''; const c = Math.max(0, Math.min(d.length, this.esCursor));
        this.esDraft = `${d.slice(0, c)}{ "at": [${x}, ${y}] }${d.slice(c)}`;
        this.hud.toast(t('editor.triggersPickSet', { x, y }), 'good');
        this.showTriggers();
      });
    });
    q('#m-cancel').addEventListener('click', () => { this.esDraft = null; this.hud.hideModal(); });
    q('#es-remove')?.addEventListener('click', () => { if (!confirm(t('editor.triggersRemoveConfirm'))) return; ed.setMeta({ scenario: undefined }); this.esDraft = null; this.hud.hideModal(); this.hud.toast(t('editor.triggersRemoved'), 'good'); });
    saveBtn.addEventListener('click', () => {
      if (this.esTimer) { clearTimeout(this.esTimer); this.esTimer = null; }
      validate();
      if (!current.file) return;   // erros bloqueiam (o botão já fica desabilitado)
      ed.setMeta({ scenario: current.file });
      this.esDraft = null; this.hud.hideModal();
      this.hud.toast(t('editor.triggersSaved'), 'good');
    });
  }
  /** "Escolher no mapa": consome o próximo clique esquerdo no canvas (devolve true) — ligado por Input.editorHooks.pickTile. */
  pickTile(x: number, y: number): boolean {
    const p = this.pendingPick; if (!p) return false;
    if (!inBounds(this.editor.map, x, y)) { this.hud.toast(t('editor.pickOutside'), 'warn'); return true; }   // continua esperando
    this.cancelPick(); p(x, y); return true;
  }
  /** Liga a espera por um clique no mapa (indicador no corpo da página); Esc/menu/troca de ferramenta cancelam. */
  private setPick(fn: (x: number, y: number) => void): void { this.pendingPick = fn; document.body.classList.add('cur-pick'); this.hud.toast(t('editor.pickPending'), 'gold'); }
  cancelPick(): void { this.pendingPick = null; document.body.classList.remove('cur-pick'); }

  showMenu(): void {
    this.cancelPick();
    this.hud.showModal(`<h2>${t('editor.menuTitle')}</h2><p style="color:#f2c14e">${esc(this.mapTitle())}${this.editor.dirty ? ' •' : ''}</p>
      <div class="row" style="flex-direction:column">
        <button class="btn primary" id="em-continue">${t('editor.menuContinue')}</button>
        <button class="btn" id="em-save">${t('editor.save')}</button>
        <button class="btn" id="em-export">${t('editor.exportBtn')}</button>
        <button class="btn" id="em-test">${t('editor.test')}</button>
        <button class="btn" id="em-props">${t('editor.props')}</button>
        <button class="btn" id="em-triggers">${t('editor.triggers')}</button>
        <button class="btn" id="em-hotkeys">${t('editor.hkBtn')}</button>
        <button class="btn danger" id="em-back">${t('editor.menuBack')}</button>
      </div>`);
    const q = (id: string) => this.hud.modal.querySelector(id) as HTMLElement;
    q('#em-continue').addEventListener('click', () => this.hud.hideModal());
    q('#em-save').addEventListener('click', () => { this.hud.hideModal(); this.save(); });
    q('#em-export').addEventListener('click', () => { this.hud.hideModal(); this.exportFile(); });
    q('#em-test').addEventListener('click', () => { this.hud.hideModal(); this.showTest(); });
    q('#em-props').addEventListener('click', () => this.showProperties());
    q('#em-triggers').addEventListener('click', () => this.showTriggers());
    q('#em-hotkeys').addEventListener('click', () => this.showHotkeys());
    q('#em-back').addEventListener('click', () => { this.hud.hideModal(); this.cb.onExit(); });
  }

  showHotkeys(): void {
    const k = (...keys: string[]) => keys.map((x) => `<kbd>${x}</kbd>`).join(' ');
    const rows: [string, string][] = [
      [k('T', 'N', 'B', 'U', 'I', 'V', 'E'), t('editor.hk.tools')], [k('1', '2', '3', '4', '5', '6'), t('editor.hk.terrain')], [`${k('[', ']')} · ${k('X')}`, t('editor.hk.brush')], [k('F'), t('editor.hk.fill')],
      [`${k('Shift')}+${k(t('hk.k.click'))} · ${k('Alt')}+${k(t('hk.k.click'))}`, t('editor.hk.line')], [`${k('Shift')}+${k('1-4')}`, t('editor.hk.player')], [k('C'), t('editor.hk.complete')], [k('Tab'), t('editor.hk.startCycle')],
      [k('G', 'R', 'O', 'K'), t('editor.hk.overlays')], [`${k('Ctrl')}+${k('Z')} · ${k('Ctrl')}+${k('Y')}`, t('editor.hk.undo')], [`${k('Ctrl')}+${k('S')} · ${k('Ctrl')}+${k('Enter')}`, t('editor.hk.save')],
      [k(t('hk.k.right')), t('editor.hk.erase')], [k('Delete'), t('editor.hk.delete')], [`${k('W A S D')} · ${k(t('hk.k.arrows'))} · ${t('hk.k.edge')} · ${k(t('hk.k.middle'))} · ${k(t('hk.k.wheel'))}`, t('editor.hk.camera')], [`${k('Esc')} · ${k('H')}`, t('editor.hk.esc')],
    ];
    this.hud.showModal(`<h2>${t('editor.hkTitle')}</h2><table>${rows.map(([a, b]) => `<tr><td style="white-space:nowrap">${a}</td><td>${b}</td></tr>`).join('')}</table><div class="actions"><button class="btn primary" id="m-close">${t('modal.close')}</button></div>`);
    this.hud.modal.querySelector('#m-close')!.addEventListener('click', () => this.hud.hideModal());
  }

  /** Desmonta o painel (autosave final); a MapEditor continua viva para quem a guardou. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.validateTimer) clearTimeout(this.validateTimer);
    if (this.esTimer) clearTimeout(this.esTimer);
    this.autosaveNow();
    window.removeEventListener('pagehide', this.onPageHide); window.removeEventListener('beforeunload', this.onPageHide);
    this.cancelPick();
    this.editor.onChange = undefined; this.editor.onError = undefined;
    this.hud.unmountTop(this.top); this.hud.unmountBottom(this.root);
    if (document.body.className.startsWith('cur-')) document.body.className = '';
  }
}
