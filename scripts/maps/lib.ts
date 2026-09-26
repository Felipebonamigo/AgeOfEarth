// Construção reprodutível dos mapas oficiais (docs/EDITOR.md §5 Etapa 4): cada scripts/maps/<id>.ts desenha o mapa
// com as operações desfazíveis do editor (MapEditor.apply: paint/addNode/setStart, as mesmas do mouse) a partir de um
// mapa em branco, sob um grupo de simetria (rotação de 180° no 1v1, espelho duplo no 2v2), e grava o .map.json
// canônico (saveMap via MapEditor.toFile). Justiça entre inícios por construção: terreno e nós são decididos só no
// representante canônico de cada órbita e replicados nas imagens; o build confere simetria, recursos por início,
// validação e a largura de cada rota entre os lados (nenhuma selável por um único edifício) antes de gravar.
// Sem Math.random/trigonometria: ruído e hash determinísticos do núcleo.
import fs from 'node:fs';
import { TERRAIN, type NodeType } from '../../src/core/constants';
import { makeNoise, type Noise2D } from '../../src/core/rng';
import { base64ToBytes, blankMap, mapHash, startResourcesOf, validateMap, type FixedMapData, type MapIssue, type MapMeta } from '../../src/core/map/fixed';
import { MapEditor } from '../../src/editor/editor';
import type { EditOp } from '../../src/editor/types';

export type Pt = [number, number];
/** Grupo de simetria: as imagens de um tile (incluindo ele mesmo). */
export type Symmetry = (x: number, y: number) => Pt[];
/** Rotação de 180° em torno do centro (1v1: cada início é a imagem do outro). */
export const rot180 = (w: number, h: number): Symmetry => (x, y) => [[x, y], [w - 1 - x, h - 1 - y]];
/** Espelho horizontal e vertical (2v2 com times norte/sul: os quatro inícios são equivalentes). */
export const mirrorXY = (w: number, h: number): Symmetry => (x, y) => [[x, y], [w - 1 - x, y], [x, h - 1 - y], [w - 1 - x, h - 1 - y]];

/** Hash determinístico de um tile em [0, 1) (densidade de bosques, variação de margens). */
export function hash01(x: number, y: number, salt = 0): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(salt + 1, 83492791) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
export const d2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
/** Raio da vizinhança de cada início que tem de ser idêntica também na orientação absoluta (placeStartLayout). */
export const LOCAL_RADIUS = 12;
/** Pontos (dx, dy) e as imagens pelos espelhos locais dx → −dx e dy → −dy (sem repetir). */
function quad(pts: Pt[]): Pt[] {
  const out = new Map<string, Pt>();
  for (const [dx, dy] of pts) for (const [mx, my] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) out.set(`${dx * mx},${dy * my}`, [dx * mx, dy * my]);
  return [...out.values()];
}
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt(d2(ax, ay, bx, by));

export class MapBuilder {
  readonly ed: MapEditor;
  readonly w: number; readonly h: number;
  readonly noise: Noise2D;
  private skipped = 0;
  constructor(w: number, h: number, readonly sym: Symmetry, seed: number, starts: Pt[]) {
    this.w = w; this.h = h;
    this.noise = makeNoise(seed);
    // mapa em branco (grama; decoração pelo ruído da semente) e os inícios movidos para as posições do desenho
    const blank = blankMap(w, h, starts.length, seed);
    this.ed = new MapEditor(blank, null, { now: () => 0 });
    starts.forEach(([x, y], i) => this.ed.apply({ kind: 'setStart', index: i, x, y }));
  }
  /** Representante canônico da órbita do tile (a imagem de menor índice y*w+x). */
  rep(x: number, y: number): Pt {
    let best: Pt = [x, y], bi = y * this.w + x;
    for (const [a, b] of this.sym(x, y)) { const i = b * this.w + a; if (i < bi) { bi = i; best = [a, b]; } }
    return best;
  }
  images(x: number, y: number): Pt[] {
    const seen = new Set<number>(); const out: Pt[] = [];
    for (const [a, b] of this.sym(x, y)) { const i = b * this.w + a; if (!seen.has(i)) { seen.add(i); out.push([a, b]); } }
    return out;
  }
  /** Pinta o mapa inteiro: fn decide o terreno só no representante canônico (null = mantém); uma op por terreno. */
  terrain(fn: (x: number, y: number) => number | null): void {
    const map = this.ed.map;
    const byT = new Map<number, number[]>();
    const memo = new Map<number, number | null>();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const [rx, ry] = this.rep(x, y), ri = ry * this.w + rx;
      let t = memo.get(ri);
      if (t === undefined) { t = fn(rx, ry); memo.set(ri, t); }
      if (t === null || t === map.terrain[y * this.w + x]) continue;
      let list = byT.get(t); if (!list) { list = []; byT.set(t, list); }
      list.push(y * this.w + x);
    }
    for (const [t, tiles] of [...byT].sort((a, b) => a[0] - b[0])) this.ed.apply({ kind: 'paint', tiles, terrain: t });
  }
  /** Um nó em (x, y) e em todas as imagens, ou em nenhuma (op composta atômica). */
  node(type: NodeType, x: number, y: number, amount?: number): boolean {
    const ops: EditOp[] = this.images(x, y).map(([a, b]) => ({ kind: 'addNode', type, x: a, y: b, ...(amount ? { amount } : {}) }));
    try { this.ed.apply({ kind: 'batch', ops }); return true; } catch { this.skipped++; return false; }
  }
  /** Vários nós do mesmo tipo (pontos no referencial do representante; as imagens vêm da simetria). */
  nodes(type: NodeType, pts: Pt[], amount?: number): number { let n = 0; for (const [x, y] of pts) if (this.node(type, x, y, amount)) n++; return n; }
  /** Bosque: árvores nos tiles do disco (cx, cy, r) em que pred vale (no representante), com densidade por hash. */
  forest(cx: number, cy: number, r: number, density = 0.8, pred: (x: number, y: number) => boolean = () => true, salt = 1): number {
    let n = 0;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 1 || y < 1 || x > this.w - 2 || y > this.h - 2) continue;
      const wob = (this.noise.noise(x * 0.35 + salt * 7, y * 0.35) - 0.5) * r * 0.5;
      if (d2(x, y, cx, cy) > (r + wob) * (r + wob)) continue;
      const [rx, ry] = this.rep(x, y);
      if (!pred(rx, ry) || hash01(rx, ry, salt) >= density || this.nearResource(rx, ry)) continue;
      if (this.node('tree', x, y)) n++;
    }
    return n;
  }
  /** Há um nó que não é árvore (frutas, caça, ouro) a 1 tile? O bosque não o cerca (o recurso continua coletável). */
  private nearResource(x: number, y: number): boolean {
    const map = this.ed.map;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h) continue;
      const n = map.nodes.get(map.nodeAt[yy * this.w + xx]);
      if (n && n.type !== 'tree') return true;
    }
    return false;
  }
  /** Tiles de um retângulo [x0..x1]×[y0..y1] (para montar listas de pontos). */
  static rect(x0: number, y0: number, x1: number, y1: number): Pt[] { const out: Pt[] = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]); return out; }
  get skippedNodes(): number { return this.skipped; }
  /** Fecha os bolsões que a validação aponta com a correção do editor ("Fechar bolsão"), até não sobrar nenhum. */
  fillPockets(): number {
    let n = 0;
    for (let pass = 0; pass < 6; pass++) {
      const file = this.ed.toFile();
      const pockets = validateMap(file, { players: file.starts.length }).filter((i) => i.code === 'pocket' && i.x !== undefined);
      if (pockets.length === 0) break;
      for (const p of pockets) if (this.ed.fillPocket(p.x!, p.y!)) n++;
    }
    return n;
  }

  /**
   * Arquivo canônico com os metadados, conferido: validação sem erros, terreno e nós simétricos, recursos por início
   * idênticos, vizinhança dos inícios igual e, para cada rota declarada, corte ≥ MIN_ROUTE_CUT sem edifício que a sele
   * (routeReport). Lança se algo falhar (o build nunca grava um mapa injusto).
   */
  finish(meta: MapMeta, routes: Route[] = []): { file: FixedMapData; warnings: MapIssue[]; routes: RouteReport[] } {
    this.ed.setMeta(meta);
    const file = this.ed.toFile();
    const n = file.starts.length;
    const issues = validateMap(file, { players: n, mode: 'conquest', ai: new Array(n).fill(true) });
    const errors = issues.filter((i) => i.level === 'error');
    if (errors.length) throw new Error(`${meta.id}: ${errors.length} erro(s) de validação: ${JSON.stringify(errors.slice(0, 5))}`);
    // simetria: terreno e nós iguais nas imagens
    const terr = base64ToBytes(file.terrain, file.w * file.h);
    for (let y = 0; y < file.h; y++) for (let x = 0; x < file.w; x++) for (const [a, b] of this.sym(x, y)) if (terr[b * file.w + a] !== terr[y * file.w + x]) throw new Error(`${meta.id}: terreno assimétrico em (${x}, ${y}) × (${a}, ${b})`);
    const nodeKey = new Map<number, string>(file.nodes.map(([t, x, y, a]) => [y * file.w + x, `${t}:${a}`]));
    for (const [t, x, y, a] of file.nodes) for (const [p, q] of this.sym(x, y)) if (nodeKey.get(q * file.w + p) !== `${t}:${a}`) throw new Error(`${meta.id}: nó ${t} em (${x}, ${y}) sem imagem em (${p}, ${q})`);
    const res = startResourcesOf(file);
    for (const r of res) for (const k of ['food', 'wood', 'gold'] as const) if (r[k] !== res[0][k]) throw new Error(`${meta.id}: recursos desiguais entre inícios: ${JSON.stringify(res)}`);
    // vizinhança de cada início idêntica também na orientação absoluta (terreno e nós a até LOCAL_RADIUS)
    const local = (sx: number, sy: number) => {
      const parts: string[] = [];
      for (let dy = -LOCAL_RADIUS; dy <= LOCAL_RADIUS; dy++) for (let dx = -LOCAL_RADIUS; dx <= LOCAL_RADIUS; dx++) {
        if (dx * dx + dy * dy > LOCAL_RADIUS * LOCAL_RADIUS) continue;
        const x = sx + dx, y = sy + dy;
        parts.push(x < 0 || y < 0 || x >= file.w || y >= file.h ? 'x' : `${terr[y * file.w + x]}${nodeKey.get(y * file.w + x) ?? ''}`);
      }
      return parts.join('|');
    };
    const ref = local(file.starts[0][0], file.starts[0][1]);
    file.starts.forEach(([x, y], i) => { if (local(x, y) !== ref) throw new Error(`${meta.id}: a vizinhança do início ${i + 1} difere da do início 1 na orientação absoluta`); });
    // rotas: seção mínima de MIN_ROUTE_CUT tiles e nenhuma selável por um único edifício (um humano fecharia o mapa)
    const report = routeReport(file, routes);
    for (const r of report) {
      const at = `rota ${r.route} (início 1 → ${r.to + 1}) com seção em ${JSON.stringify(r.cut.slice(0, 3))}`;
      if (r.cut.length < MIN_ROUTE_CUT) throw new Error(`${meta.id}: ${at}: só ${r.cut.length} tile(s) de largura (mínimo ${MIN_ROUTE_CUT})`);
      if (r.seals.length) throw new Error(`${meta.id}: ${at}: um edifício ${r.seals[0].side}×${r.seals[0].side} em (${r.seals[0].x}, ${r.seals[0].y}) a sela`);
    }
    return { file, warnings: issues.filter((i) => i.level === 'warn'), routes: report };
  }
}

/**
 * Recursos a até 12 tiles de um início, invariantes pelos espelhos locais (dx → −dx e dy → −dy). Com a simetria global
 * do mapa, todos os inícios ficam com a mesma vizinhança também na orientação absoluta. Antes isso era obrigatório (o kit
 * nascia sempre ao sul do Centro Cívico); hoje o kit, as casas e as buscas da IA usam o referencial voltado ao centro do
 * mapa (centerFrame) e a simetria global já basta — a vizinhança invariante continua como folga para o que ainda é
 * absoluto (ordem de vizinhos do A*). 12 frutas (leste/oeste, ~6), 6 veios de ouro (norte/sul, ~8), 4 cervos (~7),
 * 2 javalis (~11) e 4 bosquetes de 6 árvores nas diagonais (~10). O Centro Cívico (3×3), a fila dos cidadãos (dy = ±3) e
 * o batedor (±3, ±1) ficam livres.
 */
export function placeStartLayout(b: MapBuilder, sx: number, sy: number): void {
  const at = (pts: Pt[]): Pt[] => quad(pts).map(([dx, dy]) => [sx + dx, sy + dy]);
  b.nodes('berry', at([[6, 0], [7, 0], [6, 1], [7, 1]]));
  b.nodes('gold', at([[0, 8], [1, 8]]));
  b.nodes('deer', at([[4, 6]]));
  b.nodes('boar', at([[11, 0]]));
  b.nodes('tree', at([[7, 7], [8, 7], [7, 8], [8, 8], [9, 6], [6, 9]]));
}

// ---------------------------------------------------------------------------------------------------------------
// Rotas entre inícios: nenhuma pode ser selada por um único edifício
// ---------------------------------------------------------------------------------------------------------------

/** Corte mínimo exigido em cada rota (tiles de largura na seção mais estreita, 4-conexa). */
export const MIN_ROUTE_CUT = 5;
/** Maior lado de edifício testado na varredura de selagem (casas 2×2, quartel/templo/Centro Cívico 3×3, fortaleza e maravilhas 4×4). */
export const SEAL_MAX_SIDE = 4;
/** Rota entre os lados do mapa: nome e a zona (retângulo ou faixa) que a contém; fechar a zona fecha a rota. */
export interface Route { name: string; zone: (x: number, y: number) => boolean }
export interface RouteReport { from: number; to: number; route: string; cut: Pt[]; seals: { x: number; y: number; side: number }[] }

/**
 * Para cada rota e cada par (início 1, início k): com as zonas das OUTRAS rotas fechadas, o corte mínimo de vértices
 * entre os dois inícios (fluxo máximo, 4-conexo como canStep; terreno sólido, nós e o 3×3 do Centro Cívico do kit
 * bloqueiam) e os edifícios quadrados de lado 1 a SEAL_MAX_SIDE, em terreno onde podem ser construídos (sem água,
 * montanha, nó ou Centro Cívico), perto da zona ou do corte, que sozinhos desligam os inícios. Pares que não dependem
 * das rotas (aliados na mesma costa) dão o corte da própria base e nenhuma selagem.
 */
export function routeReport(file: FixedMapData, routes: Route[]): RouteReport[] {
  const { w, h } = file, n = w * h;
  const terr = base64ToBytes(file.terrain, n);
  const blocked = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const t = terr[i]; if (t === T.WATER || t === T.DEEP || t === T.MOUNTAIN) blocked[i] = 1; }
  for (const [, x, y] of file.nodes) blocked[y * w + x] = 1;
  const ccOf = file.starts.map(([sx, sy]) => { const l: number[] = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) l.push((sy + dy) * w + sx + dx); return l; });
  const cc = new Uint8Array(n);
  if (file.startKit !== false) for (const l of ccOf) for (const i of l) cc[i] = 1;
  const zones = routes.map((r) => { const z = new Uint8Array(n); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (r.zone(x, y)) z[y * w + x] = 1; return z; });
  const nb = (i: number, d: number): number => {
    const x = i % w, y = (i - x) / w;
    if (d === 0) return x + 1 < w ? i + 1 : -1;
    if (d === 1) return x > 0 ? i - 1 : -1;
    if (d === 2) return y + 1 < h ? i + w : -1;
    return y > 0 ? i - w : -1;
  };
  const out: RouteReport[] = [];
  for (let k = 1; k < file.starts.length; k++) for (let r = 0; r < routes.length; r++) {
    const src = new Uint8Array(n), snk = new Uint8Array(n), closed = new Uint8Array(n);
    for (const i of ccOf[0]) src[i] = 1;
    for (const i of ccOf[k]) snk[i] = 1;
    zones.forEach((z, q) => { if (q !== r) for (let i = 0; i < n; i++) if (z[i]) closed[i] = 1; });
    const open = (i: number) => i >= 0 && (src[i] === 1 || snk[i] === 1 || (!blocked[i] && !cc[i] && !closed[i]));
    // fluxo máximo com capacidade 1 por tile (infinita na origem e no destino); estados: 2i = entrada, 2i + 1 = saída
    const inner = new Int32Array(n), cross = new Int32Array(n * 4);
    const dirTo = (j: number, i: number) => { for (let d = 0; d < 4; d++) if (nb(j, d) === i) return d; return -1; };
    const bfs = (): { prev: Int32Array; seen: Uint8Array; end: number } => {
      const prev = new Int32Array(2 * n).fill(-1), seen = new Uint8Array(2 * n);
      const queue: number[] = [];
      for (let i = 0; i < n; i++) if (src[i]) { seen[2 * i + 1] = 1; queue.push(2 * i + 1); }
      for (let q = 0; q < queue.length; q++) {
        const st = queue[q], i = st >> 1;
        const push = (to: number) => { if (!seen[to]) { seen[to] = 1; prev[to] = st; queue.push(to); } };
        if ((st & 1) === 0) {   // entrada de i: atravessa o tile (se ainda há capacidade) ou volta por uma aresta com fluxo
          if (snk[i]) return { prev, seen, end: st };
          if (src[i] || inner[i] < 1) push(2 * i + 1);
          for (let d = 0; d < 4; d++) { const j = nb(i, d); if (j >= 0 && open(j) && cross[j * 4 + (d ^ 1)] > 0) push(2 * j + 1); }
        } else {                // saída de i: segue para a entrada dos vizinhos ou desfaz a travessia
          for (let d = 0; d < 4; d++) { const j = nb(i, d); if (j >= 0 && open(j)) push(2 * j); }
          if (!src[i] && inner[i] > 0) push(2 * i);
        }
      }
      return { prev, seen, end: -1 };
    };
    for (let guard = 0; guard < 512; guard++) {
      const { prev, end } = bfs();
      if (end < 0) break;
      for (let st = end; prev[st] !== -1; st = prev[st]) {
        const p = prev[st], i = st >> 1, j = p >> 1;
        if (i === j) inner[i] += (p & 1) === 0 ? 1 : -1;
        else if ((p & 1) === 1) { const d = dirTo(j, i); cross[j * 4 + d]++; }   // saída de j → entrada de i
        else { const d = dirTo(i, j); cross[i * 4 + d]--; }                      // entrada de j → saída de i (desfaz i → j)
      }
    }
    const { seen } = bfs();
    const cut: number[] = [];
    for (let i = 0; i < n; i++) if (!src[i] && !snk[i] && seen[2 * i] && !seen[2 * i + 1]) cut.push(i);
    // varredura de selagem perto da zona da rota e do corte
    const focus = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (zones[r][i]) focus[i] = 1;
    for (const i of cut) focus[i] = 1;
    const connected = (fp: Uint8Array): boolean => {
      const seenT = new Uint8Array(n), q: number[] = [];
      for (let i = 0; i < n; i++) if (src[i]) { seenT[i] = 1; q.push(i); }
      for (let a = 0; a < q.length; a++) {
        const i = q[a]; if (snk[i]) return true;
        for (let d = 0; d < 4; d++) { const j = nb(i, d); if (j >= 0 && !seenT[j] && open(j) && !fp[j]) { seenT[j] = 1; q.push(j); } }
      }
      return false;
    };
    const near = (x0: number, y0: number, side: number) => {
      for (let y = Math.max(0, y0 - 1); y <= Math.min(h - 1, y0 + side); y++) for (let x = Math.max(0, x0 - 1); x <= Math.min(w - 1, x0 + side); x++) if (focus[y * w + x]) return true;
      return false;
    };
    const seals: RouteReport['seals'] = [];
    const fp = new Uint8Array(n);
    if (connected(fp)) for (let side = 1; side <= SEAL_MAX_SIDE; side++) for (let y = 0; y + side <= h; y++) for (let x = 0; x + side <= w; x++) {
      if (!near(x, y, side)) continue;
      let ok = true;
      for (let yy = y; yy < y + side && ok; yy++) for (let xx = x; xx < x + side; xx++) { const i = yy * w + xx; if (blocked[i] || cc[i] || closed[i]) { ok = false; break; } }
      if (!ok) continue;
      for (let yy = y; yy < y + side; yy++) for (let xx = x; xx < x + side; xx++) fp[yy * w + xx] = 1;
      if (!connected(fp)) seals.push({ x, y, side });
      for (let yy = y; yy < y + side; yy++) for (let xx = x; xx < x + side; xx++) fp[yy * w + xx] = 0;
    }
    out.push({ from: 0, to: k, route: routes[r].name, cut: cut.map((i) => [i % w, Math.floor(i / w)] as Pt), seals });
  }
  return out;
}

/** Grava o arquivo (JSON compacto) e imprime o resumo; usado quando o script do mapa roda direto. */
export function writeMap(file: FixedMapData, warnings: MapIssue[], out: string, routes: RouteReport[] = []): void {
  const json = JSON.stringify(file);
  fs.writeFileSync(out, json);
  const res = startResourcesOf(file);
  console.log(`${out}: ${file.w}x${file.h} · ${file.starts.length} inícios · ${file.nodes.length} nós · ${json.length} bytes · hash #${mapHash(file).toString(16)} · ${warnings.length} aviso(s)`);
  for (const w of warnings) console.log(`  aviso ${w.code}${w.x !== undefined ? ` (${w.x}, ${w.y})` : ''}${w.params ? ' ' + JSON.stringify(w.params) : ''}`);
  console.log(`  por início (raio 16): comida ${res[0].food} · madeira ${res[0].wood} · ouro ${res[0].gold} (iguais em todos)`);
  for (const r of routes) console.log(`  rota ${r.route} (início 1 → ${r.to + 1}, as outras fechadas): corte mínimo ${r.cut.length} tiles; nenhum edifício de até ${SEAL_MAX_SIDE}×${SEAL_MAX_SIDE} a sela`);
}

/** Terrenos, para os scripts dos mapas. */
export const T = TERRAIN;
