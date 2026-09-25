// Nós do mapa como sprites (camada 'props', docs/ART.md §3.7): um Sprite por nó (árvore, arbusto, mina, animal, Pedra de
// Poseidon) e, com a arte assada, tocos das árvores esgotadas. Os sprites vivem num Container por FAIXA de chunks (16
// linhas de tiles), ordenado por zIndex = y: a ordem por y vale para o mapa inteiro (faixas em ordem crescente de y, e
// dentro da faixa o sort do Pixi), sem costura de ordenação nas colunas de chunk. Com a arte assada, as unidades e os
// edifícios (não voadores) também entram nessas faixas (rowFor), então árvore, casa e hoplita se ocluem pela posição do
// pé. O culling é por chunk (sprite.visible dos nós do chunk ao entrar/sair da tela) e um nó num tile nunca explorado
// fica oculto (senão a copa das árvores da borda do mapa escaparia da névoa, que cobre só o retângulo do mapa). A
// conferência é sempre por chunk (≤ 256 tiles, nunca O(nós do mapa)): os chunks visíveis quando map.nodes.size muda e a
// cada 30 quadros (estágio de frutas/ouro/árvore em corte); um chunk que volta à tela é conferido antes de aparecer;
// invalidateRect (editor) confere os chunks do retângulo. Nada de generateTexture.
//   Procedural (arte assada desligada ou atlas ainda carregando): o atlas único de nós de textures.ts, sombra no quadro.
//   Assado: quadro `<kind>/<variante>[/<tag>]` do atlas de props (logic.nodeFrameName) + sombra separada numa faixa
//   espelhada da camada 'shadows'; espécie/variante por hash do tile, estágio por amount/max, toco ao esgotar.
import { Container, Sprite, type Texture } from 'pixi.js';
import { TILE } from '../core/constants';
import type { GameState, ResourceNode } from '../core/types';
import type { TextureCache } from './textures';
import { NODE_ANCHOR } from './textures';
import type { ArtLibrary } from './art/ArtLibrary';
import { nodeFrameName, nodeStage, propFrameName, stumpVariant, treeOffset, treeScale } from './art/logic';
import { CHUNK } from './terrain/ChunkMesh';
import { SHADOW_ALPHA } from './palette';

/** `stage` = estágio visual do quadro assado (logic.nodeStage) ou −1 (procedural/toco: não muda de quadro). */
interface PropView { sprite: Sprite; shadow: Sprite | null; type: string; x: number; y: number; chunk: number; node: ResourceNode | null; stage: number }

const ZERO_OFF = { dx: 0, dy: 0 } as const;
/** O tile `i` tem uma árvore. */
function isTree(map: GameState['map'], i: number): boolean { const id = map.nodeAt[i]; return id !== -1 && map.nodes.get(id)?.type === 'tree'; }
/** Folga do culling (tiles) no modo assado: copas altas (cipreste ≈ 3 tiles) e sombras para SE entram pela borda. */
const BAKED_MARGIN = { left: 2, right: 1, top: 1, bottom: 4 } as const;
const LEGACY_MARGIN = { left: 1, right: 1, top: 1, bottom: 1 } as const;

export class PropLayer {
  /** Faixas de props (e, no modo assado, de unidades/edifícios); vai na camada 'props'. */
  readonly root = new Container();
  /** Faixas das sombras dos props assados; vai na camada 'shadows'. */
  readonly shadowRoot = new Container();
  private rows: Container[] = [];
  private shadowRows: Container[] = [];
  private props = new Map<number, PropView>();
  /** Ids dos props de cada chunk (índice cy · cw + cx); tocos usam a chave −(tile + 1). */
  private ids: Set<number>[] = [];
  /** Chunks na tela no último quadro (1), chave da névoa já aplicada e jogador local. */
  private vis = new Uint8Array(0);
  private fogKey = -1;
  private local = 0;
  private cw = 0;
  private frameN = 0;
  private lastNodeCount = -1;
  private revealed = false;
  /** Tiles com toco (sobrevive a reconstruções da arte; zera numa partida nova). */
  private stumps = new Set<number>();
  /** Modo assado (ordem global com entidades, folgas maiores) e props assados servidos. */
  private bakedMode = false;
  private bakedProps = false;

  constructor(private tex: TextureCache, private art: ArtLibrary) {}

  get count(): number { return this.props.size; }

  /**
   * Recria tudo para o estado. `bakedMode` = arte assada ligada (faixas recebem entidades); `bakedProps` = atlas de
   * props pronto. `keepStumps` preserva os tocos (reconstrução por mudança de arte, mesma partida).
   */
  reset(state: GameState, bakedMode: boolean, bakedProps: boolean, keepStumps = false): void {
    for (const c of this.rows) c.destroy({ children: true });
    for (const c of this.shadowRows) c.destroy({ children: true });
    this.props.clear();
    this.root.removeChildren(); this.shadowRoot.removeChildren();
    if (!keepStumps) this.stumps.clear();
    this.bakedMode = bakedMode; this.bakedProps = bakedMode && bakedProps;
    const cw = Math.ceil(state.map.w / CHUNK), ch = Math.ceil(state.map.h / CHUNK);
    this.cw = cw;
    this.rows = []; this.shadowRows = []; this.ids = []; this.vis = new Uint8Array(cw * ch); this.fogKey = -1;
    for (let r = 0; r < ch; r++) {
      const c = new Container(); c.sortableChildren = true; c.visible = false; if (bakedMode) c.isRenderGroup = true; this.rows.push(c); this.root.addChild(c);
      const s = new Container(); s.visible = false; this.shadowRows.push(s); this.shadowRoot.addChild(s);
    }
    for (let i = 0; i < cw * ch; i++) this.ids.push(new Set());
    for (const n of state.map.nodes.values()) this.add(state, n.id);
    if (this.bakedProps) for (const t of this.stumps) this.addStump(state, t);
    this.lastNodeCount = state.map.nodes.size;
  }

  /** Faixa (Container ordenado por y) de uma posição y em tiles, para as entidades do modo assado. */
  rowFor(y: number): Container | null {
    const n = this.rows.length; if (n === 0) return null;
    const r = Math.floor(y / CHUNK);
    return this.rows[r < 0 ? 0 : r >= n ? n - 1 : r];
  }

  private chunkOf(x: number, y: number): number { return Math.floor(y / CHUNK) * this.cw + Math.floor(x / CHUNK); }

  private add(state: GameState, id: number): void {
    const map = state.map, n = map.nodes.get(id);
    if (!n) return;
    const chunk = this.chunkOf(n.x, n.y), cy = Math.floor(n.y / CHUNK);
    const name = this.bakedProps ? nodeFrameName(n.type, n.id, n.x, n.y, n.amount, n.max) : null;
    const f = name ? this.art.prop(name) : null;
    let s: Sprite, sh: Sprite | null = null;
    if (f) {
      s = new Sprite(f.color);
      s.anchor.set(f.anchor.x, f.anchor.y);
      const off = n.type === 'tree' ? treeOffset(n.x, n.y) : ZERO_OFF;
      s.position.set((n.x + 0.5 + off.dx) * TILE, (n.y + 0.5 + off.dy) * TILE);
      const k = n.type === 'tree' ? treeScale(n.x, n.y) : 1;
      s.scale.set(k);
      s.zIndex = n.y + 0.5 + off.dy;   // base do prop (mesma régua do pé das unidades)
      if (f.shadow && !(n.type === 'tree' && this.shadowCovered(map, n.x, n.y))) sh = this.makeShadow(f.shadow, f.anchor, s, cy);
    } else {
      const decor = map.decor[n.y * map.w + n.x] % 256;
      s = new Sprite(this.tex.node(n.type, decor));
      s.anchor.set(NODE_ANCHOR.x, NODE_ANCHOR.y);
      s.position.set((n.x + 0.5) * TILE, (n.y + 0.5) * TILE);
      s.scale.set(n.type === 'tree' ? 0.85 + (decor % 40) / 100 : 1);
      s.zIndex = this.bakedMode ? n.y + 0.5 : n.y;
    }
    const on = this.vis[chunk] === 1 && this.explored(state, n.x, n.y);
    s.visible = on; if (sh) sh.visible = on;
    this.rows[cy]?.addChild(s);
    this.ids[chunk]?.add(id);
    this.props.set(id, { sprite: s, shadow: sh, type: n.type, x: n.x, y: n.y, chunk, node: n, stage: f ? nodeStage(n.type, n.amount, n.max) : -1 });
  }
  /** Toco (só arte assada) no tile `t`: decoração sem bloqueio, abaixo das unidades que pisam o mesmo tile. */
  private addStump(state: GameState, t: number): void {
    const map = state.map, x = t % map.w, y = (t - x) / map.w;
    const key = -(t + 1);
    if (this.props.has(key)) return;
    const name = propFrameName('stump', stumpVariant(x, y));
    const f = this.art.prop(name);
    if (!f) return;
    const chunk = this.chunkOf(x, y), cy = Math.floor(y / CHUNK);
    const off = treeOffset(x, y);   // o toco fica onde estava o tronco
    const s = new Sprite(f.color); s.anchor.set(f.anchor.x, f.anchor.y); s.position.set((x + 0.5 + off.dx) * TILE, (y + 0.5 + off.dy) * TILE);
    s.zIndex = y - 0.5;
    let sh: Sprite | null = null;
    if (f.shadow) sh = this.makeShadow(f.shadow, f.anchor, s, cy);
    const on = this.vis[chunk] === 1 && this.explored(state, x, y);
    s.visible = on; if (sh) sh.visible = on;
    this.rows[cy]?.addChild(s);
    this.ids[chunk]?.add(key);
    this.props.set(key, { sprite: s, shadow: sh, type: 'stump', x, y, chunk, node: null, stage: -1 });
  }
  /** Sombra de um prop assado na faixa de sombras `cy`, no mesmo ponto/escala do sprite. */
  private makeShadow(tex: Texture, anchor: { x: number; y: number }, s: Sprite, cy: number): Sprite {
    const sh = new Sprite(tex); sh.anchor.set(anchor.x, anchor.y); sh.position.copyFrom(s.position); sh.scale.copyFrom(s.scale);
    sh.alpha = SHADOW_ALPHA; sh.blendMode = 'multiply'; sh.visible = s.visible;
    this.shadowRows[cy]?.addChild(sh);
    return sh;
  }
  /**
   * Árvore no miolo do bosque: E, S e SE também são árvores, então a sombra (para SE, sob todos os props) cairia sob as
   * copas vizinhas e quase não apareceria — não é desenhada (metade das sombras de um bosque denso: menos sprites e
   * menos pixels). Conferido de novo a cada sincronização do chunk: cortar a vizinha faz a sombra voltar.
   */
  private shadowCovered(map: GameState['map'], x: number, y: number): boolean {
    if (x + 1 >= map.w || y + 1 >= map.h) return false;
    const w = map.w;
    return isTree(map, y * w + x + 1) && isTree(map, (y + 1) * w + x) && isTree(map, (y + 1) * w + x + 1);
  }
  private drop(id: number, v: PropView): void { v.sprite.destroy(); v.shadow?.destroy(); this.props.delete(id); this.ids[v.chunk]?.delete(id); }

  /** O jogador local já viu o tile (ou o mapa está revelado): só então o nó aparece. */
  private explored(state: GameState, x: number, y: number): boolean {
    if (this.revealed || state.config.revealMap) return true;
    const vis = state.players[this.local]?.visibility;
    return !vis || vis[y * state.map.w + x] > 0;
  }

  /**
   * Confere um chunk contra o mapa: some o prop cujo tile não aponta mais para ele (ou mudou de tipo) — uma árvore
   * esgotada vira toco —, troca o quadro de quem mudou de estágio e nasce o que falta.
   */
  private syncChunk(state: GameState, chunk: number): void {
    const map = state.map, cw = this.cw;
    const ids = this.ids[chunk]; if (!ids) return;
    for (const id of ids) {
      const v = this.props.get(id)!;
      const t = v.y * map.w + v.x;
      if (id < 0) { if (map.nodeAt[t] !== -1 || map.buildingAt[t] !== -1) { this.drop(id, v); this.stumps.delete(t); } continue; }
      const n = map.nodes.get(id);
      if (!n || n.type !== v.type || map.nodeAt[t] !== id) {
        const depleted = !n && v.type === 'tree' && !!v.node && v.node.amount <= 0.001;
        this.drop(id, v);
        if (depleted && this.bakedProps && map.nodeAt[t] === -1) { this.stumps.add(t); this.addStump(state, t); }
      } else if (v.stage >= 0) {
        // estágio (frutas/ouro pelo que resta, árvore em corte): compara o número e só então troca a textura
        const st = nodeStage(n.type, n.amount, n.max);
        const covered = n.type === 'tree' && this.shadowCovered(map, n.x, n.y);
        const name = st !== v.stage || covered === !!v.shadow ? nodeFrameName(n.type, n.id, n.x, n.y, n.amount, n.max) : null;
        const f = name ? this.art.prop(name) : null;
        if (f) {
          if (st !== v.stage) { v.stage = st; v.sprite.texture = f.color; v.sprite.anchor.set(f.anchor.x, f.anchor.y); if (v.shadow && f.shadow) { v.shadow.texture = f.shadow; v.shadow.anchor.set(f.anchor.x, f.anchor.y); } }
          // bosque aberto (vizinha cortada) → a sombra volta; fechado → some
          if (covered && v.shadow) { v.shadow.destroy(); v.shadow = null; }
          else if (!covered && !v.shadow && f.shadow) v.shadow = this.makeShadow(f.shadow, f.anchor, v.sprite, Math.floor(v.y / CHUNK));
        }
      }
    }
    const cx = chunk % cw, cy = (chunk - cx) / cw;
    const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = Math.min(map.w, x0 + CHUNK), y1 = Math.min(map.h, y0 + CHUNK);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const id = map.nodeAt[y * map.w + x]; if (id !== -1 && !this.props.has(id)) this.add(state, id); }
  }
  /** Visibilidade dos sprites de um chunk: na tela e em tile explorado. */
  private showChunk(state: GameState, chunk: number, on: boolean): void {
    const ids = this.ids[chunk]; if (!ids) return;
    for (const id of ids) { const v = this.props.get(id); if (!v) continue; const s = on && this.explored(state, v.x, v.y); v.sprite.visible = s; if (v.shadow) v.shadow.visible = s; }
  }
  /** Editor: confere os chunks que tocam o retângulo. */
  syncRect(state: GameState, x0: number, y0: number, x1: number, y1: number): void {
    const cw = this.cw;
    for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) this.syncChunk(state, cy * cw + cx);
  }

  /** Culling por chunk, névoa e conferência periódica; `v` = tiles visíveis da câmera. */
  update(state: GameState, local: number, revealed: boolean, v: { x0: number; y0: number; x1: number; y1: number }): void {
    const changed = state.map.nodes.size !== this.lastNodeCount || ++this.frameN % 30 === 0;
    this.lastNodeCount = state.map.nodes.size;
    this.revealed = revealed;
    // névoa: um tile recém-explorado revela os nós dele (só nos chunks na tela; os outros são conferidos ao voltar)
    const fogKey = revealed || state.config.revealMap ? -2 : state.fogVersion * 8 + local;
    const fogChanged = fogKey !== this.fogKey;
    this.fogKey = fogKey; this.local = local;
    const m = this.bakedMode ? BAKED_MARGIN : LEGACY_MARGIN, cw = this.cw;
    const cx0 = Math.floor((v.x0 - m.left) / CHUNK), cy0 = Math.floor((v.y0 - m.top) / CHUNK), cx1 = Math.floor((v.x1 + m.right) / CHUNK), cy1 = Math.floor((v.y1 + m.bottom) / CHUNK);
    for (let i = 0; i < this.vis.length; i++) {
      const cx = i % cw, cy = (i - cx) / cw;
      const vis = cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1;
      const was = this.vis[i] === 1;
      this.vis[i] = vis ? 1 : 0;
      if (vis && (changed || !was)) this.syncChunk(state, i);
      if (vis !== was || (vis && fogChanged)) this.showChunk(state, i, vis);
    }
    for (let r = 0; r < this.rows.length; r++) { const on = r >= cy0 && r <= cy1; this.rows[r].visible = on; this.shadowRows[r].visible = on; }
  }
}
