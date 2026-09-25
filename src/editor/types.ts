// Contrato do editor de mapas (docs/EDITOR.md §3.2 e §4): estado de interface lido pelo renderizador,
// operações desfazíveis aplicadas à sessão pausada e a "vista" que o editor invalida ao pintar.
import type { NodeType } from '../core/constants';
import type { MapEntity } from '../core/map/fixed';

export type EditorTool = 'terrain' | 'node' | 'building' | 'unit' | 'start' | 'select' | 'erase';

/** Estado da interface do editor (vive em Session.ui.editor); o renderizador desenha as sobreposições a partir dele. */
export interface EditorUI {
  tool: EditorTool;
  terrain: number;                                   // TERRAIN.* do pincel (6 = DEEP forçado)
  brushRadius: number;                               // 1..8
  brushShape: 'circle' | 'square';
  nodeType: NodeType;
  nodeAmount: number | null;                         // null = padrão (NODE_AMOUNT)
  buildingType: string;
  unitType: string;
  player: number;                                    // jogador ativo (dono das entidades novas)
  complete: boolean;                                 // edifícios novos completos ou em obra
  hover: { x: number; y: number } | null;            // tile sob o cursor
  ghostOk: boolean;                                  // o fantasma de edifício/unidade cabe no tile sob o cursor?
  lineFrom: { x: number; y: number } | null;         // Shift+clique: linha desde este tile
  showGrid: boolean; showRegions: boolean; showPassable: boolean; showKit: boolean;
  selected: { kind: 'unit' | 'building' | 'node' | 'start'; id: number } | null;   // inspetor (start: id = índice do início)
  flash: { x: number; y: number; until: number } | null;   // "ir até": tile a piscar (until = performance.now() alvo)
}

export function defaultEditorUI(): EditorUI {
  return { tool: 'terrain', terrain: 0, brushRadius: 2, brushShape: 'circle', nodeType: 'tree', nodeAmount: null, buildingType: 'tower', unitType: 'hoplite', player: 0, complete: true, hover: null, ghostOk: false, lineFrom: null, showGrid: false, showRegions: false, showPassable: false, showKit: true, selected: null, flash: null };
}

/** Operações do editor. Cada uma tem inversa exata (applyEditOp devolve-a). Tiles são índices y*w+x.
 *  Os campos opcionais (terrains, id, nextId, insert) são preenchidos pelas inversas para restaurar o estado byte a byte;
 *  a interface normalmente não os usa. */
export type EditOp =
  | { kind: 'paint'; tiles: number[]; terrain: number; nodeSeq?: number; terrains?: number[] }   // terrains: terreno por tile (inversa); senão terrain para todos
  | { kind: 'addNode'; type: NodeType; x: number; y: number; amount?: number; id?: number; nodeSeq?: number }   // id: força o id do nó (inversa de removeNode)
  | { kind: 'removeNode'; x: number; y: number; nodeSeq?: number }
  | { kind: 'setNodeAmount'; x: number; y: number; amount: number }
  | { kind: 'setStart'; index: number; x: number; y: number; insert?: boolean }   // index === starts.length acrescenta um início; insert desloca os seguintes
  | { kind: 'removeStart'; index: number }
  | { kind: 'placeEntity'; entity: MapEntity; id?: number }         // id: força o id (inversa de removeEntity)
  | { kind: 'removeEntity'; id: number; nextId?: number }            // id de unidade ou edifício vivo; nextId: restaura state.nextId (inversa de placeEntity)
  | { kind: 'setEntity'; id: number; owner?: number; complete?: boolean; tag?: string | null }
  | { kind: 'moveEntity'; id: number; x: number; y: number }        // edifício: canto; unidade: tile
  | { kind: 'batch'; ops: EditOp[]; nodeSeq?: number };   // nodeSeq: valor do contador de ids de nós a restaurar depois de aplicar (inversas exatas: o contador está no save)

/** Quem desenha: o editor acumula um retângulo sujo por quadro e chama isto uma vez (renderer + minimapa). */
export interface EditorView {
  invalidateRect(x0: number, y0: number, x1: number, y1: number): void;
  invalidateMinimap(): void;
}
