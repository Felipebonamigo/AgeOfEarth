// Editor de mapas (docs/EDITOR.md §4 e §5 Etapa 3), sem DOM: cria uma sessão pausada a partir de um FixedMapData,
// aplica EditOps com pilhas de desfazer/refazer (um traço = um passo), acumula o retângulo sujo por quadro para a
// vista (renderer + minimapa), implementa as ferramentas do §4.3 a partir de eventos de ponteiro/teclado já
// traduzidos para tiles, e produz o arquivo canônico (toFile) e a validação (validate). A camada DOM (painel,
// autosave, toasts) fica em src/editor/panel.ts e src/main.ts.
import { MAX_PLAYERS, TERRAIN } from '../core/constants';
import { BUILDINGS, MAJOR_GOD_LIST, UNITS } from '../core/data';
import type { GameConfig, GameMap, GameState } from '../core/types';
import { createGame } from '../core/sim/game';
import { canPlaceBuilding } from '../core/sim/entities';
import { recomputeTerritory } from '../core/sim/territory';
import { serialize } from '../core/serialize';
import { RNG, makeNoise } from '../core/rng';
import { idx, inBounds, isPassable } from '../core/map/grid';
import { articulationPoints, componentAt, invalidateComponents } from '../core/map/components';
import { nearestFreeTile } from '../core/map/pathfinding';
import { ensureConnectivity, placeStartResources as genStartResources, widenChokepoints as genWidenChokepoints } from '../core/map/mapgen';
import { migrateMap, resizeMapData, saveMap, startResourceTable, validateMap, START_RESOURCE_RADIUS, type FixedMapData, type MapIssue, type MapMeta, type ResizeAnchor, type ResizeReport, type StartResources } from '../core/map/fixed';
import { Session } from '../game/session';
import { defaultEditorUI, type EditOp, type EditorTool, type EditorUI, type EditorView } from './types';
import { applyEditOp, brushTiles, dirtyRectOf, EditError, floodRegion, lineTiles, unionRect, type Rect, type TagMap } from './ops';

export interface EditorOpts { now?: () => number }
export interface PointerMods { shift?: boolean; alt?: boolean; ctrl?: boolean }
export type EditorPick = { kind: 'unit' | 'building' | 'node' | 'start'; id: number };

type Drag =
  | { kind: 'paint'; last: { x: number; y: number }; warned: boolean }
  | { kind: 'trees'; last: { x: number; y: number } }
  | { kind: 'wall'; last: { x: number; y: number } }
  | { kind: 'erase'; last: { x: number; y: number } }
  | { kind: 'start'; index: number }
  | { kind: 'move'; target: EditorPick; from: { x: number; y: number }; moved: boolean }
  | { kind: 'none' };

const SOLID = new Set<number>([TERRAIN.WATER, TERRAIN.DEEP, TERRAIN.MOUNTAIN]);
/** Subpaleta de terreno: teclas 1..6 (grama, areia, terra, água, montanha, água profunda). */
export const TERRAIN_KEYS: Record<string, number> = { '1': TERRAIN.GRASS, '2': TERRAIN.SAND, '3': TERRAIN.DIRT, '4': TERRAIN.WATER, '5': TERRAIN.MOUNTAIN, '6': TERRAIN.DEEP };
const PLAYER_KEYS: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, '!': 0, '@': 1, '#': 2, '$': 3 };
/** Ferramentas por tecla. Como na partida, A, R e U ficam de fora (atacar-mover, ponto de encontro, liberar): unidades = M. */
export const TOOL_KEYS: Record<string, EditorTool> = { T: 'terrain', N: 'node', B: 'building', M: 'unit', I: 'start', V: 'select', E: 'erase' };
/** Demais atalhos de uma tecla do editor (docs/EDITOR.md §4.3); tests/data.test.ts confere que são únicos e sem A/R/U. */
export const EDITOR_KEYS: Record<string, string> = { F: 'fill', P: 'eyedrop', X: 'shape', C: 'complete', G: 'grid', L: 'regions', O: 'passable', K: 'kit', H: 'hotkeys' };
const CHOKE_RADIUS = 10;   // o mesmo raio do aviso chokepoint de validateMap
const TREE_DENSITY = 60;   // % dos tiles do pincel de árvores que recebem uma árvore (determinístico por posição)
const FLASH_MS = 1500;

/** Canto (tx, ty) de um edifício cujo centro está sobre o tile do cursor (mesma regra da colocação em partida). */
export function buildingCorner(type: string, tx: number, ty: number): { x: number; y: number } {
  const def = BUILDINGS[type];
  const w = def?.w ?? 1, h = def?.h ?? 1;
  return { x: Math.floor(tx + 1 - w / 2), y: Math.floor(ty + 1 - h / 2) };
}
/** Remove o nó do tile i de um mapa (cópia de trabalho das correções). */
function removeNodeOf(m: GameMap, i: number): void {
  const id = m.nodeAt[i];
  if (id === -1) return;
  m.nodes.delete(id); m.nodeAt[i] = -1; m.blocked[i] = 0;
}
/** Abre a colina (raio 1) sobre terreno sólido: água → areia, montanha → terra, sem nós (como carveCorridor). */
function carveHill(m: GameMap, x: number, y: number): void {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!inBounds(m, x + dx, y + dy)) continue;
    const i = idx(m, x + dx, y + dy), t = m.terrain[i];
    if (m.buildingAt[i] !== -1) continue;
    removeNodeOf(m, i);
    if (t === TERRAIN.WATER || t === TERRAIN.DEEP) m.terrain[i] = TERRAIN.SAND; else if (t === TERRAIN.MOUNTAIN) m.terrain[i] = TERRAIN.DIRT;
    m.blocked[i] = 0;
  }
  invalidateComponents(m);
}
/** Densidade determinística por posição do pincel de árvores (sem rng: a mesma pincelada dá o mesmo bosque). */
export function treeAt(x: number, y: number): boolean {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  return (h ^ (h >>> 15)) % 100 < TREE_DENSITY;
}

export class MapEditor {
  readonly session: Session;
  /** Metadados do arquivo (id, nome, autor, kit inicial, times, colina, relíquias); altere por setMeta. */
  readonly meta: MapMeta;
  /** Tags das entidades (id → tag); saem no arquivo por toFile. */
  readonly tags: TagMap = new Map();
  view: EditorView | null;
  /** Há alterações desde o último salvamento? A camada DOM zera após salvar. */
  dirty = false;
  /** Chamado após cada apply/undo/redo/setMeta (autosave com debounce na camada DOM). */
  onChange?: () => void;
  /** Op recusada por uma ferramenta (pintar sob edifício, sem espaço…): a camada DOM mostra um toast. */
  onError?: (e: EditError) => void;
  /** Troca de documento (desfazer/refazer um redimensionamento): a camada DOM passa a mostrar `to` (src/main.ts). */
  onSwitch?: (to: MapEditor) => void;
  /** Redimensionamento como passo de desfazer: a instância de antes (com a própria pilha intacta) e a de depois. */
  resizedFrom: MapEditor | null = null;
  resizedTo: MapEditor | null = null;

  private undoStack: EditOp[] = [];
  private redoStack: EditOp[] = [];
  private stroke: EditOp[] | null = null;
  private dirtyRect: Rect | null = null;
  private minimapDirty = false;
  private issues: MapIssue[] | null = null;
  private resources: StartResources[] | null = null;
  private now: () => number;
  private drag: Drag | null = null;

  constructor(file: FixedMapData, view: EditorView | null = null, opts: EditorOpts = {}) {
    const src = migrateMap(file);
    this.view = view;
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.meta = { id: src.id, name: src.name, nameEn: src.nameEn, author: src.author, description: src.description, startKit: src.startKit, startTeams: src.startTeams?.slice(), koth: src.koth ? [src.koth[0], src.koth[1]] : undefined, relics: src.relics, scenario: src.scenario && typeof src.scenario === 'object' ? src.scenario : undefined };   // cenário embutido (Etapa 5) viaja com o mapa
    for (const k of Object.keys(this.meta) as (keyof MapMeta)[]) if (this.meta[k] === undefined) delete this.meta[k];
    // A sessão nasce com MAX_PLAYERS jogadores fictícios (humanos, deuses em rodízio) para que qualquer início que o
    // autor acrescente já tenha um Player; createGame exige um início por jogador, então os inícios são preenchidos
    // temporariamente e substituídos pelos reais logo depois (sem kit inicial nada é criado neles).
    const starts = (src.starts ?? []).filter((s) => Array.isArray(s) && Number.isInteger(s[0]) && Number.isInteger(s[1])).map(([x, y]) => ({ x, y }));
    const padded: [number, number][] = starts.slice(0, MAX_PLAYERS).map((s) => [s.x, s.y]);
    const pads: [number, number][] = [[8, 8], [src.w - 9, src.h - 9], [src.w - 9, 8], [8, src.h - 9]];
    while (padded.length < MAX_PLAYERS) padded.push(pads[padded.length]);
    const players: GameConfig['players'] = [];
    for (let i = 0; i < MAX_PLAYERS; i++) players.push({ name: `Jogador ${i + 1}`, god: MAJOR_GOD_LIST[i % MAJOR_GOD_LIST.length], isAI: false, difficulty: 'normal' });
    const mapCfg: FixedMapData = { ...src, starts: padded, entities: [], startKit: false, relics: false };
    const state = createGame({ seed: 1, mapSize: 'medium', map: mapCfg, players, revealMap: true, mode: 'conquest' });
    state.map.starts = starts;
    state.config = { ...state.config, map: { ...src, startKit: false, relics: false } };
    this.session = new Session(state, 0);
    this.session.paused = true;
    this.session.ui.mode = 'editor';
    this.session.ui.editor = defaultEditorUI();
    this.syncKoth();
    // Entidades do arquivo na ordem do arquivo, com as mesmas regras de createGame (unidade cai no tile livre mais próximo;
    // inválidas são ignoradas — validateMap aponta). Tags ficam em this.tags.
    for (const e of src.entities ?? []) {
      if (!e || (e.kind !== 'building' && e.kind !== 'unit')) continue;
      try {
        if (e.kind === 'unit') {
          const t = nearestFreeTile(state.map, e.x, e.y, 6);
          if (!t) continue;
          applyEditOp(state, { kind: 'placeEntity', entity: { ...e, x: t.x, y: t.y } }, this.tags);
        } else applyEditOp(state, { kind: 'placeEntity', entity: e }, this.tags);
      } catch { /* entidade inválida no arquivo */ }
    }
    recomputeTerritory(state);
  }

  get state(): GameState { return this.session.state; }
  get map(): GameMap { return this.session.state.map; }
  get ui(): EditorUI { return this.session.ui.editor!; }
  get undoDepth(): number { return this.undoStack.length + (this.stroke && this.stroke.length > 0 ? 1 : 0) + (this.resizedFrom ? 1 : 0); }
  get redoDepth(): number { return this.redoStack.length + (this.resizedTo ? 1 : 0); }

  // ---------------------------------------------------------------------------------------------------------
  // Ops, desfazer/refazer, traços
  // ---------------------------------------------------------------------------------------------------------

  /** Aplica a op (lança EditError sem alterar nada se recusada), empilha a inversa, limpa refazer, marca sujo. */
  apply(op: EditOp): EditOp {
    const state = this.state;
    const before = dirtyRectOf(op, state.map.w, state);
    const inv = applyEditOp(state, op, this.tags);
    this.redoStack.length = 0;
    this.resizedTo = null;   // refazer o redimensionamento deixa de valer (como a pilha de refazer)
    if (this.stroke) this.stroke.push(inv); else this.undoStack.push(inv);
    this.changed(before, dirtyRectOf(inv, state.map.w, state));
    return inv;
  }
  undo(): boolean {
    if (this.stroke) this.endStroke();
    const inv = this.undoStack.pop();
    if (!inv) {
      // no início da pilha de um mapa redimensionado: volta à instância de antes (pilha dela intacta)
      const prev = this.resizedFrom;
      if (!prev) return false;
      prev.resizedTo = this;
      this.onSwitch?.(prev);
      return true;
    }
    const state = this.state;
    const before = dirtyRectOf(inv, state.map.w, state);
    const redo = applyEditOp(state, inv, this.tags);
    this.redoStack.push(redo);
    this.changed(before, dirtyRectOf(redo, state.map.w, state));
    return true;
  }
  redo(): boolean {
    if (this.stroke) this.endStroke();
    const op = this.redoStack.pop();
    if (!op) {
      const next = this.resizedTo;
      if (!next) return false;
      this.onSwitch?.(next);
      return true;
    }
    const state = this.state;
    const before = dirtyRectOf(op, state.map.w, state);
    const inv = applyEditOp(state, op, this.tags);
    this.undoStack.push(inv);
    this.changed(before, dirtyRectOf(inv, state.map.w, state));
    return true;
  }
  /** Ops aplicadas até endStroke viram um único passo de desfazer. */
  beginStroke(): void { if (this.stroke) this.endStroke(); this.stroke = []; }
  endStroke(): void {
    const s = this.stroke;
    this.stroke = null;
    if (!s || s.length === 0) return;
    this.undoStack.push(s.length === 1 ? s[0] : { kind: 'batch', ops: s.reverse() });
  }
  /** Uma vez por quadro: recalcula o território pendente e invalida na vista o retângulo sujo e o minimapa. */
  flush(): void {
    const state = this.state;
    if (state.territoryDirty) recomputeTerritory(state);
    if (this.view) {
      const r = this.dirtyRect;
      if (r) this.view.invalidateRect(Math.max(0, r.x0), Math.max(0, r.y0), Math.min(state.map.w - 1, r.x1), Math.min(state.map.h - 1, r.y1));
      if (this.minimapDirty) this.view.invalidateMinimap();
    }
    this.dirtyRect = null;
    this.minimapDirty = false;
  }
  private changed(...rects: (Rect | null)[]): void {
    for (const r of rects) if (r) this.dirtyRect = this.dirtyRect ? unionRect(this.dirtyRect, r) : r;
    this.minimapDirty = true;
    this.dirty = true;
    this.issues = null; this.resources = null;
    const h = this.ui.hover;
    if (h) this.ui.ghostOk = this.canPlaceAt(h.x, h.y);
    this.onChange?.();
  }
  /** Tenta uma op de ferramenta; recusas viram onError (não lançam). */
  private tryApply(op: EditOp): boolean {
    try { this.apply(op); return true; } catch (e) { if (e instanceof EditError) { this.onError?.(e); return false; } throw e; }
  }

  // ---------------------------------------------------------------------------------------------------------
  // Arquivo, validação, metadados
  // ---------------------------------------------------------------------------------------------------------

  /** Arquivo canônico (saveMap) com entidades vivas, tags e metadados. */
  toFile(): FixedMapData { return saveMap(this.state, this.meta, (id) => this.tags.get(id)); }
  /** validateMap do arquivo atual (players = nº de inícios, modo conquest), com cache até a próxima op. */
  validate(): MapIssue[] {
    if (!this.issues) this.issues = validateMap(this.toFile(), { players: this.map.starts.length, mode: 'conquest' });
    return this.issues;
  }
  /** Tabela de comida/madeira/ouro a até 16 tiles de cada início (startResourceTable), com cache até a próxima op. */
  startResources(): StartResources[] {
    if (!this.resources) this.resources = startResourceTable(this.map.starts, this.map.nodes.values(), START_RESOURCE_RADIUS);
    return this.resources;
  }
  setMeta(partial: Partial<MapMeta>): void {
    for (const k of Object.keys(partial) as (keyof MapMeta)[]) {
      const v = partial[k];
      if (v === undefined) delete this.meta[k]; else (this.meta as Record<string, unknown>)[k] = v;
    }
    this.dirty = true;
    this.issues = null;
    this.resizedTo = null;
    this.syncKoth();
    this.onChange?.();
  }
  /** Copia a colina dos metadados para a interface (o renderizador marca o ponto; null = centro do mapa). */
  private syncKoth(): void { const k = this.meta.koth; this.ui.koth = k ? { x: k[0], y: k[1] } : null; }

  /**
   * Redimensiona (Propriedades): cria uma instância nova a partir do arquivo redimensionado (resizeMapData) e liga as
   * duas como um passo de desfazer — Ctrl+Z no início da pilha da nova volta a esta, com a pilha intacta; Ctrl+Y refaz.
   * As preferências da interface (ferramenta, pincel, sobreposições) seguem para a nova. Lança se o tamanho for inválido.
   */
  resized(w: number, h: number, anchor: ResizeAnchor, seed = 1): { editor: MapEditor; report: ResizeReport } {
    if (this.stroke) this.endStroke();
    const { data, report } = resizeMapData(this.toFile(), w, h, anchor, seed);
    const next = new MapEditor(data, this.view, { now: this.now });
    this.redoStack.length = 0;   // redimensionar é uma ação nova: o refazer antigo deixa de valer (como em apply)
    const keep = this.ui, ui = next.ui;
    for (const k of ['tool', 'terrain', 'brushRadius', 'brushShape', 'nodeType', 'nodeAmount', 'buildingType', 'unitType', 'player', 'complete', 'showGrid', 'showRegions', 'showPassable', 'showKit', 'bucket'] as const) (ui as unknown as Record<string, unknown>)[k] = keep[k];
    next.onSwitch = this.onSwitch;
    next.resizedFrom = this;
    this.resizedTo = next;
    next.dirty = true;
    return { editor: next, report };
  }
  /** "Ir até": pisca o tile (a câmera é da camada DOM). */
  goTo(x: number, y: number): void { this.ui.flash = { x, y, until: this.now() + FLASH_MS }; }
  /** "Variar visual": nova decoração (mesmo ruído de generateMap/blankMap com outra semente). Não é desfazível; só muda o visual. */
  varyDecor(seed: number): void {
    const map = this.map;
    const n = makeNoise(seed >>> 0);
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) map.decor[y * map.w + x] = Math.floor(n.noise(x * 0.9, y * 0.9) * 255);
    this.changed({ x0: 0, y0: 0, x1: map.w - 1, y1: map.h - 1 });
  }
  /** Só para testes: serialize(state). */
  snapshot(): string { return serialize(this.state); }

  // ---------------------------------------------------------------------------------------------------------
  // Consultas para ferramentas e inspetor
  // ---------------------------------------------------------------------------------------------------------

  /** O que está sob o tile, por prioridade unidade > edifício > nó > início. */
  pickAt(tx: number, ty: number): EditorPick | null {
    const state = this.state, map = state.map;
    if (!inBounds(map, tx, ty)) return null;
    for (const u of state.units.values()) if (!u.dead && Math.floor(u.x) === tx && Math.floor(u.y) === ty) return { kind: 'unit', id: u.id };
    const i = idx(map, tx, ty);
    if (map.buildingAt[i] !== -1) return { kind: 'building', id: map.buildingAt[i] };
    if (map.nodeAt[i] !== -1) return { kind: 'node', id: map.nodeAt[i] };
    const s = map.starts.findIndex((p) => p.x === tx && p.y === ty);
    if (s >= 0) return { kind: 'start', id: s };
    return null;
  }
  /** Um nó cabe no tile? (terreno passável, sem nó nem edifício) */
  nodeFits(tx: number, ty: number): boolean {
    const map = this.map;
    if (!inBounds(map, tx, ty)) return false;
    const i = idx(map, tx, ty);
    return !SOLID.has(map.terrain[i]) && map.nodeAt[i] === -1 && map.buildingAt[i] === -1;
  }
  /** A ferramenta atual pode colocar algo com o cursor neste tile? (alimenta ui.ghostOk) */
  canPlaceAt(tx: number, ty: number): boolean {
    const ui = this.ui, state = this.state, map = state.map;
    if (!inBounds(map, tx, ty)) return false;
    switch (ui.tool) {
      case 'building': {
        const player = state.players[ui.player];
        if (!player || !BUILDINGS[ui.buildingType]) return false;
        const c = buildingCorner(ui.buildingType, tx, ty);
        return canPlaceBuilding(state, player, ui.buildingType, c.x, c.y, true, true).ok;
      }
      case 'unit': return !!UNITS[ui.unitType] && !!state.players[ui.player] && isPassable(map, tx, ty);
      case 'node': return this.nodeFits(tx, ty);
      case 'start': return this.startTarget() >= 0;
      case 'terrain': return true;
      default: return false;
    }
  }
  /** Índice do início que a ferramenta de inícios vai colocar/mover (-1 se não há vaga). */
  private startTarget(): number {
    const sel = this.ui.selected, n = this.map.starts.length;
    if (sel && sel.kind === 'start' && sel.id < n) return sel.id;
    return n < MAX_PLAYERS ? n : -1;
  }

  // ---------------------------------------------------------------------------------------------------------
  // Ponteiro (tiles já resolvidos pela camada DOM; a câmera continua na Input)
  // ---------------------------------------------------------------------------------------------------------

  setHover(tx: number | null, ty?: number | null): void {
    const ui = this.ui;
    if (tx === null || ty === null || ty === undefined || !inBounds(this.map, tx, ty)) { ui.hover = null; ui.ghostOk = false; return; }
    ui.hover = { x: tx, y: ty };
    ui.ghostOk = this.canPlaceAt(tx, ty);
  }

  pointerDown(tx: number, ty: number, button: 0 | 2, mods: PointerMods = {}): void {
    const ui = this.ui, map = this.map;
    this.setHover(tx, ty);
    if (!inBounds(map, tx, ty)) return;
    // conta-gotas (Alt+clique ou armado por P / botão): copia e não edita; o botão direito só o desarma
    if (button === 0 && (mods.alt || ui.eyedrop)) { ui.eyedrop = false; this.eyedrop(tx, ty); this.drag = { kind: 'none' }; return; }
    if (button === 2 && ui.eyedrop) { ui.eyedrop = false; this.drag = { kind: 'none' }; return; }
    if (button === 2 || ui.tool === 'erase') {
      this.beginStroke();
      this.eraseAt(tx, ty);
      this.drag = { kind: 'erase', last: { x: tx, y: ty } };
      return;
    }
    switch (ui.tool) {
      case 'terrain': {
        if (ui.bucket && !mods.shift) { this.fill(tx, ty); this.drag = { kind: 'none' }; return; }
        this.beginStroke();
        const from = mods.shift && ui.lineFrom ? ui.lineFrom : { x: tx, y: ty };
        const d: Drag = { kind: 'paint', last: { x: tx, y: ty }, warned: false };
        this.paintPath(from, { x: tx, y: ty }, d);
        ui.lineFrom = { x: tx, y: ty };
        this.drag = mods.shift ? { kind: 'none' } : d;
        if (mods.shift) this.endStroke();
        return;
      }
      case 'node': {
        if (ui.nodeType === 'tree' && ui.brushRadius > 0) {
          this.beginStroke();
          const d: Drag = { kind: 'trees', last: { x: tx, y: ty } };
          this.treesPath({ x: tx, y: ty }, { x: tx, y: ty });
          this.drag = d;
        } else {
          if (!this.nodeFits(tx, ty)) { this.onError?.(new EditError('occupied', tx, ty)); return; }
          this.tryApply({ kind: 'addNode', type: ui.nodeType, x: tx, y: ty, amount: ui.nodeAmount ?? undefined });
        }
        return;
      }
      case 'building': {
        const def = BUILDINGS[ui.buildingType];
        if (!def) return;
        const c = buildingCorner(ui.buildingType, tx, ty);
        const op: EditOp = { kind: 'placeEntity', entity: { kind: 'building', type: ui.buildingType, owner: ui.player, x: c.x, y: c.y, complete: ui.complete } };
        if (def.wall) { this.beginStroke(); this.tryApply(op); this.drag = { kind: 'wall', last: { x: tx, y: ty } }; }
        else this.tryApply(op);
        return;
      }
      case 'unit': {
        if (!UNITS[ui.unitType]) return;
        this.tryApply({ kind: 'placeEntity', entity: { kind: 'unit', type: ui.unitType, owner: ui.player, x: tx, y: ty } });
        return;
      }
      case 'start': {
        const index = this.startTarget();
        if (index < 0) { this.onError?.(new EditError('badIndex', tx, ty)); return; }
        this.beginStroke();
        if (this.tryApply({ kind: 'setStart', index, x: tx, y: ty })) { ui.selected = { kind: 'start', id: index }; this.drag = { kind: 'start', index }; }
        else this.endStroke();
        return;
      }
      case 'select': {
        const p = this.pickAt(tx, ty);
        ui.selected = p;
        this.drag = p ? { kind: 'move', target: p, from: { x: tx, y: ty }, moved: false } : { kind: 'none' };
        return;
      }
    }
  }

  pointerMove(tx: number, ty: number, _button: 0 | 2 = 0, _mods: PointerMods = {}): void {
    this.setHover(tx, ty);
    const d = this.drag;
    if (!d || !inBounds(this.map, tx, ty)) return;
    switch (d.kind) {
      case 'paint':
        if (d.last.x === tx && d.last.y === ty) return;
        this.paintPath(d.last, { x: tx, y: ty }, d);
        d.last = { x: tx, y: ty };
        this.ui.lineFrom = { x: tx, y: ty };
        return;
      case 'trees':
        if (d.last.x === tx && d.last.y === ty) return;
        this.treesPath(d.last, { x: tx, y: ty });
        d.last = { x: tx, y: ty };
        return;
      case 'wall': {
        if (d.last.x === tx && d.last.y === ty) return;
        const line = lineTiles(d.last.x, d.last.y, tx, ty);
        for (let k = 1; k < line.length; k++) {
          const t = line[k];
          try { this.apply({ kind: 'placeEntity', entity: { kind: 'building', type: this.ui.buildingType, owner: this.ui.player, x: t.x, y: t.y, complete: this.ui.complete } }); } catch (e) { if (!(e instanceof EditError)) throw e; }
        }
        d.last = { x: tx, y: ty };
        return;
      }
      case 'erase': {
        if (d.last.x === tx && d.last.y === ty) return;
        const line = lineTiles(d.last.x, d.last.y, tx, ty);
        for (let k = 1; k < line.length; k++) this.eraseAt(line[k].x, line[k].y);
        d.last = { x: tx, y: ty };
        return;
      }
      case 'start': {
        const s = this.map.starts[d.index];
        if (s && (s.x !== tx || s.y !== ty)) this.tryApply({ kind: 'setStart', index: d.index, x: tx, y: ty });
        return;
      }
      case 'move':
        if (d.from.x !== tx || d.from.y !== ty) d.moved = true;
        return;
      case 'none': return;
    }
  }

  pointerUp(tx: number, ty: number, _button: 0 | 2 = 0, _mods: PointerMods = {}): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.kind === 'move' && d.moved && inBounds(this.map, tx, ty)) this.moveSelected(d.target, tx - d.from.x, ty - d.from.y);
    if (this.stroke) this.endStroke();
  }

  /** Balde: pinta a região contígua do mesmo terreno com o terreno do pincel (um passo de desfazer). */
  fill(tx: number, ty: number): boolean {
    const map = this.map;
    if (!inBounds(map, tx, ty)) return false;
    const terrain = this.brushTerrain();
    const tiles = this.filterPaint(floodRegion(map, tx, ty), terrain, null);
    if (tiles.length === 0) return false;
    this.beginStroke();
    const ok = this.tryApply({ kind: 'paint', tiles, terrain });
    this.endStroke();
    return ok;
  }

  /** Borracha: unidade > edifício > nó > início sob o tile. */
  eraseAt(tx: number, ty: number): boolean {
    const p = this.pickAt(tx, ty);
    if (!p) return false;
    const ok = this.removePick(p);
    if (ok && this.ui.selected && this.ui.selected.kind === p.kind && this.ui.selected.id === p.id) this.ui.selected = null;
    return ok;
  }
  /** Apaga o item selecionado no inspetor (Delete). */
  deleteSelected(): boolean {
    const sel = this.ui.selected;
    if (!sel) return false;
    const ok = this.removePick(sel);
    if (ok) this.ui.selected = null;
    return ok;
  }
  private removePick(p: EditorPick): boolean {
    const map = this.map;
    switch (p.kind) {
      case 'unit': case 'building': return this.tryApply({ kind: 'removeEntity', id: p.id });
      case 'node': { const n = map.nodes.get(p.id); return !!n && this.tryApply({ kind: 'removeNode', x: n.x, y: n.y }); }
      case 'start': return p.id < map.starts.length && this.tryApply({ kind: 'removeStart', index: p.id });
    }
  }
  /** Conta-gotas: copia o que está sob o cursor (unidade > edifício > nó > terreno) para a ferramenta correspondente. */
  eyedrop(tx: number, ty: number): void {
    const ui = this.ui, state = this.state, map = state.map;
    if (!inBounds(map, tx, ty)) return;
    const p = this.pickAt(tx, ty);
    if (p && p.kind === 'unit') { const u = state.units.get(p.id)!; ui.tool = 'unit'; ui.unitType = u.type; ui.player = u.owner; }
    else if (p && p.kind === 'building') { const b = state.buildings.get(p.id)!; ui.tool = 'building'; ui.buildingType = b.type; ui.player = b.owner; ui.complete = b.complete; }
    else if (p && p.kind === 'node') { const n = map.nodes.get(p.id)!; ui.tool = 'node'; ui.nodeType = n.type; ui.nodeAmount = n.amount; }
    else { ui.tool = 'terrain'; ui.terrain = map.terrain[idx(map, tx, ty)]; }
    this.refreshGhost();
  }
  /** Tab: seleciona o próximo início. */
  cycleStart(): boolean {
    const n = this.map.starts.length;
    if (n === 0) return false;
    const sel = this.ui.selected;
    const next = sel && sel.kind === 'start' ? (sel.id + 1) % n : 0;
    this.ui.selected = { kind: 'start', id: next };
    const s = this.map.starts[next];
    this.goTo(s.x, s.y);
    return true;
  }

  private moveSelected(p: EditorPick, dx: number, dy: number): void {
    const state = this.state, map = state.map;
    switch (p.kind) {
      case 'unit': { const u = state.units.get(p.id); if (u) this.tryApply({ kind: 'moveEntity', id: p.id, x: Math.floor(u.x) + dx, y: Math.floor(u.y) + dy }); return; }
      case 'building': { const b = state.buildings.get(p.id); if (b) this.tryApply({ kind: 'moveEntity', id: p.id, x: b.tx + dx, y: b.ty + dy }); return; }
      case 'node': {
        const n = map.nodes.get(p.id);
        if (!n || !this.nodeFits(n.x + dx, n.y + dy)) { this.onError?.(new EditError('occupied')); return; }
        if (this.tryApply({ kind: 'batch', ops: [{ kind: 'removeNode', x: n.x, y: n.y }, { kind: 'addNode', type: n.type, x: n.x + dx, y: n.y + dy, amount: n.amount }] })) this.ui.selected = { kind: 'node', id: map.nodeAt[idx(map, n.x + dx, n.y + dy)] };
        return;
      }
      case 'start': { const s = map.starts[p.id]; if (s) this.tryApply({ kind: 'setStart', index: p.id, x: s.x + dx, y: s.y + dy }); return; }
    }
  }

  /** Terreno efetivo do pincel (6 = DEEP forçado na interface → TERRAIN.DEEP; a derivação ainda rebaixa as bordas para WATER). */
  private brushTerrain(): number { const t = this.ui.terrain; return t === 6 ? TERRAIN.DEEP : Math.max(0, Math.min(TERRAIN.DEEP, t | 0)); }
  /** Remove tiles que já têm o terreno (água e água profunda contam como iguais) e, ao pintar sólido, os que têm edifício (avisa uma vez). */
  private filterPaint(tiles: number[], terrain: number, d: { warned: boolean } | null): number[] {
    const map = this.map;
    const water = terrain === TERRAIN.WATER || terrain === TERRAIN.DEEP;
    const solid = SOLID.has(terrain);
    const out: number[] = [];
    let blocked = -1;
    for (const i of tiles) {
      const t = map.terrain[i];
      if (t === terrain || (water && (t === TERRAIN.WATER || t === TERRAIN.DEEP))) continue;
      if (solid && map.buildingAt[i] !== -1) { blocked = i; continue; }
      out.push(i);
    }
    if (blocked >= 0 && (!d || !d.warned)) { if (d) d.warned = true; this.onError?.(new EditError('underBuilding', blocked % map.w, Math.floor(blocked / map.w))); }
    return out;
  }
  /** Pinta com o pincel ao longo da linha entre dois tiles (uma op por chamada). */
  private paintPath(from: { x: number; y: number }, to: { x: number; y: number }, d: { warned: boolean }): void {
    const ui = this.ui, map = this.map;
    const set = new Set<number>();
    for (const t of lineTiles(from.x, from.y, to.x, to.y)) for (const i of brushTiles(t.x, t.y, ui.brushRadius, ui.brushShape, map.w, map.h)) set.add(i);
    const terrain = this.brushTerrain();
    const tiles = this.filterPaint([...set].sort((a, b) => a - b), terrain, d);
    if (tiles.length > 0) this.tryApply({ kind: 'paint', tiles, terrain });
  }
  /** Pincel de árvores ao longo da linha: ~60 % dos tiles livres do pincel, determinístico por posição. */
  private treesPath(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const ui = this.ui, map = this.map;
    const set = new Set<number>();
    for (const t of lineTiles(from.x, from.y, to.x, to.y)) for (const i of brushTiles(t.x, t.y, ui.brushRadius, ui.brushShape, map.w, map.h)) set.add(i);
    const ops: EditOp[] = [];
    for (const i of [...set].sort((a, b) => a - b)) {
      const x = i % map.w, y = (i - x) / map.w;
      if (!treeAt(x, y) || !this.nodeFits(x, y)) continue;
      ops.push({ kind: 'addNode', type: 'tree', x, y, amount: ui.nodeAmount ?? undefined });
    }
    if (ops.length === 1) this.tryApply(ops[0]); else if (ops.length > 1) this.tryApply({ kind: 'batch', ops });
  }

  // ---------------------------------------------------------------------------------------------------------
  // Teclado (a camada DOM já filtrou campos de texto e atalhos globais)
  // ---------------------------------------------------------------------------------------------------------

  /** Atalhos do §4.3; devolve true se consumiu a tecla. */
  key(key: string, mods: PointerMods = {}): boolean {
    const ui = this.ui;
    const k = key.length === 1 ? key.toUpperCase() : key;
    if (mods.ctrl) {
      if (k === 'Z') { if (mods.shift) this.redo(); else this.undo(); return true; }
      if (k === 'Y') { this.redo(); return true; }
      return false;
    }
    if (mods.shift && k in PLAYER_KEYS) { ui.player = PLAYER_KEYS[k]; this.refreshGhost(); return true; }
    if (k in TOOL_KEYS) { ui.tool = TOOL_KEYS[k]; ui.eyedrop = false; this.refreshGhost(); return true; }
    if (ui.tool === 'terrain' && k in TERRAIN_KEYS) { ui.terrain = TERRAIN_KEYS[k]; return true; }
    switch (k) {
      case '[': ui.brushRadius = Math.max(1, ui.brushRadius - 1); return true;
      case ']': ui.brushRadius = Math.min(8, ui.brushRadius + 1); return true;
      case 'X': ui.brushShape = ui.brushShape === 'circle' ? 'square' : 'circle'; return true;
      case 'F': { const h = ui.hover; if (h) this.fill(h.x, h.y); return true; }
      case 'P': ui.eyedrop = !ui.eyedrop; return true;
      case 'C': ui.complete = !ui.complete; return true;
      case 'Tab': return this.cycleStart();
      case 'Delete': case 'Backspace': this.deleteSelected(); return true;
      case 'G': ui.showGrid = !ui.showGrid; return true;
      case 'L': ui.showRegions = !ui.showRegions; return true;
      case 'O': ui.showPassable = !ui.showPassable; return true;
      case 'K': ui.showKit = !ui.showKit; return true;
    }
    return false;
  }
  private refreshGhost(): void { const h = this.ui.hover; if (h) this.ui.ghostOk = this.canPlaceAt(h.x, h.y); }

  // ---------------------------------------------------------------------------------------------------------
  // Correções automáticas (batches desfazíveis, calculadas numa cópia do mapa e reaplicadas como ops)
  // ---------------------------------------------------------------------------------------------------------

  /** "Ligar inícios": ensureConnectivity do gerador (corredores de areia/terra, nós removidos). */
  fixConnectivity(): boolean { return this.runMapFix((m) => ensureConnectivity(m)); }
  /**
   * "Alargar gargalos": widenChokepoints do gerador (nós ao redor de todos os pontos de articulação) e, para os gargalos
   * a até 10 tiles de um início (os que validateMap aponta, com o Centro Cívico do kit bloqueando), abre também o
   * terreno em volta (água → areia, montanha → terra, como os corredores do gerador), sem mexer sob edifícios nem no
   * 3×3 do Centro Cívico. Repete até não sobrar gargalo perto de início ou não haver mais o que abrir.
   */
  widenChokepoints(): boolean {
    const kit = this.meta.startKit !== false;
    const buildingAt = this.map.buildingAt;
    return this.runMapFix((m) => {
      genWidenChokepoints(m);
      const cc = new Uint8Array(m.w * m.h);
      if (kit) for (const s of m.starts) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBounds(m, s.x + dx, s.y + dy)) cc[idx(m, s.x + dx, s.y + dy)] = 1;
      for (let pass = 0; pass < 6; pass++) {
        // mapa de sondagem: bloqueio real (terreno, nós, edifícios) + o 3×3 do Centro Cívico do kit, como validateMap
        const probe: GameMap = { ...m, blocked: m.blocked.slice() };
        for (let i = 0; i < cc.length; i++) if (cc[i]) probe.blocked[i] = 1;
        const ap = articulationPoints(probe);
        let opened = 0;
        for (let i = 0; i < ap.length; i++) {
          if (!ap[i]) continue;
          const x = i % m.w, y = (i - x) / m.w;
          if (!m.starts.some((s) => (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y) <= CHOKE_RADIUS * CHOKE_RADIUS)) continue;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (!inBounds(m, xx, yy)) continue;
            const j = idx(m, xx, yy);
            if (buildingAt[j] !== -1 || cc[j]) continue;
            const t = m.terrain[j];
            if (m.nodeAt[j] !== -1) { removeNodeOf(m, j); opened++; }
            if (t === TERRAIN.WATER || t === TERRAIN.DEEP) { m.terrain[j] = TERRAIN.SAND; opened++; }
            else if (t === TERRAIN.MOUNTAIN) { m.terrain[j] = TERRAIN.DIRT; opened++; }
            else continue;
            m.blocked[j] = 0;
          }
        }
        invalidateComponents(m);
        if (opened === 0) break;
      }
    });
  }
  /** "Fechar bolsão": preenche a região pequena que contém (x, y) com o terreno sólido que mais a cerca (água ou montanha). */
  fillPocket(x: number, y: number): boolean {
    const map = this.map;
    if (!inBounds(map, x, y) || map.blocked[idx(map, x, y)]) return false;
    const label = componentAt(map, x, y);
    const tiles: number[] = [];
    let water = 0, mountain = 0;
    const seen = new Set<number>([idx(map, x, y)]);
    const stack = [idx(map, x, y)];
    while (stack.length && tiles.length < 64) {
      const c = stack.pop()!;
      tiles.push(c);
      const cx = c % map.w, cy = (c - cx) / map.w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!inBounds(map, nx, ny)) continue;
        const ni = idx(map, nx, ny);
        const t = map.terrain[ni];
        if (map.blocked[ni]) { if (t === TERRAIN.WATER || t === TERRAIN.DEEP) water++; else if (t === TERRAIN.MOUNTAIN) mountain++; continue; }
        if (seen.has(ni) || componentAt(map, nx, ny) !== label) continue;
        seen.add(ni); stack.push(ni);
      }
    }
    if (tiles.length >= 64) return false;   // não é bolsão
    const free = tiles.filter((i) => map.buildingAt[i] === -1).sort((a, b) => a - b);
    if (free.length === 0) return false;
    return this.tryApply({ kind: 'paint', tiles: free, terrain: water > mountain ? TERRAIN.WATER : TERRAIN.MOUNTAIN });
  }
  /** "Ligar a colina": corredores até a colina do Rei da Colina (ou o centro) a partir do início 1, como generateMap faz. */
  connectKoth(): boolean {
    const k = this.meta.koth, map = this.map;
    const hill = { x: k ? k[0] : Math.floor(map.w / 2), y: k ? k[1] : Math.floor(map.h / 2) };
    if (!inBounds(map, hill.x, hill.y) || map.starts.length === 0) return false;
    return this.runMapFix((m) => {
      // a colina entra como um início a mais para ensureConnectivity; se ela estiver sobre terreno sólido, um corredor chega até ela
      m.starts.push(hill);
      if (m.blocked[idx(m, hill.x, hill.y)] && this.map.buildingAt[idx(m, hill.x, hill.y)] === -1) carveHill(m, hill.x, hill.y);
      ensureConnectivity(m);
      m.starts.pop();
    });
  }
  /** "Trazer para dentro": move o início para a margem mínima de 8 tiles da borda. */
  moveStartInside(index: number): boolean {
    const map = this.map, s = map.starts[index];
    if (!s) return false;
    const x = Math.min(map.w - 9, Math.max(8, s.x)), y = Math.min(map.h - 9, Math.max(8, s.y));
    if (x === s.x && y === s.y) return false;
    return this.tryApply({ kind: 'setStart', index, x, y });
  }
  /** "Remover recurso": apaga o nó em (x, y) (recurso sem tile livre ao redor). */
  removeNodeAt(x: number, y: number): boolean {
    const map = this.map;
    return inBounds(map, x, y) && map.nodeAt[idx(map, x, y)] !== -1 && this.tryApply({ kind: 'removeNode', x, y });
  }
  /** "Marcar em obra": o edifício em (x, y) (maravilha completa) volta a "em obra". */
  setInProgressAt(x: number, y: number): boolean {
    const map = this.map;
    if (!inBounds(map, x, y)) return false;
    const b = this.state.buildings.get(map.buildingAt[idx(map, x, y)]);
    return !!b && b.complete && this.tryApply({ kind: 'setEntity', id: b.id, complete: false });
  }
  /** "Pôr Centro Cívico": Centro Cívico completo do jogador no início dele (mapas sem kit inicial). */
  placeTownCenter(index: number): boolean {
    const s = this.map.starts[index];
    if (!s || !this.state.players[index]) return false;
    return this.tryApply({ kind: 'placeEntity', entity: { kind: 'building', type: 'town_center', owner: index, x: s.x - 1, y: s.y - 1 } });
  }
  /** "Recursos padrão do início N": bosque, frutas, ouro e caça como o gerador, com a semente dada. */
  placeStartResources(startIndex: number, seed: number): boolean {
    const s = this.map.starts[startIndex];
    if (!s) return false;
    return this.runMapFix((m) => genStartResources(m, new RNG(seed), s));
  }
  /** "Limpar raio 8": grama e sem nós num círculo de raio 9 ao redor do início (como generateMap). */
  clearRadius(startIndex: number): boolean {
    const map = this.map, s = map.starts[startIndex];
    if (!s) return false;
    const ops: EditOp[] = [];
    const tiles: number[] = [];
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) {
      const x = s.x + dx, y = s.y + dy;
      if (!inBounds(map, x, y) || dx * dx + dy * dy > 81) continue;
      const i = idx(map, x, y);
      if (map.nodeAt[i] !== -1) ops.push({ kind: 'removeNode', x, y });
      if (map.terrain[i] !== TERRAIN.GRASS) tiles.push(i);
    }
    if (tiles.length > 0) ops.push({ kind: 'paint', tiles, terrain: TERRAIN.GRASS });
    if (ops.length === 0) return false;
    return this.tryApply({ kind: 'batch', ops });
  }
  /** Roda fn numa cópia do mapa e converte a diferença (terreno, nós removidos/acrescentados) num batch desfazível. */
  private runMapFix(fn: (m: GameMap) => void): boolean {
    const map = this.map;
    const copy: GameMap = { ...map, terrain: map.terrain.slice(), blocked: map.blocked.slice(), nodeAt: map.nodeAt.slice(), nodes: new Map([...map.nodes].map(([k, v]) => [k, { ...v }])), starts: map.starts.map((s) => ({ ...s })) };
    fn(copy);
    invalidateComponents(copy);
    const ops: EditOp[] = [];
    for (const n of map.nodes.values()) if (!copy.nodes.has(n.id)) ops.push({ kind: 'removeNode', x: n.x, y: n.y });
    const byTerrain = new Map<number, number[]>();
    for (let i = 0; i < map.w * map.h; i++) {
      const t = copy.terrain[i];
      if (t === map.terrain[i]) continue;
      if (SOLID.has(t) && map.buildingAt[i] !== -1) continue;   // nunca põe sólido sob edifício
      let list = byTerrain.get(t);
      if (!list) { list = []; byTerrain.set(t, list); }
      list.push(i);
    }
    for (const [terrain, tiles] of [...byTerrain].sort((a, b) => a[0] - b[0])) ops.push({ kind: 'paint', tiles, terrain });
    const added = [...copy.nodes.values()].filter((n) => !map.nodes.has(n.id)).sort((a, b) => a.y - b.y || a.x - b.x);
    for (const n of added) ops.push({ kind: 'addNode', type: n.type, x: n.x, y: n.y, amount: n.amount });
    if (ops.length === 0) return false;
    return this.tryApply({ kind: 'batch', ops });
  }
}

export { EditError, applyEditOp, brushTiles, lineTiles, floodRegion, dirtyRectOf } from './ops';
