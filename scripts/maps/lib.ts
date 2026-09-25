// Construção reprodutível dos mapas oficiais (docs/EDITOR.md §5 Etapa 4): cada scripts/maps/<id>.ts desenha o mapa
// com as operações desfazíveis do editor (MapEditor.apply: paint/addNode/setStart, as mesmas do mouse) a partir de um
// mapa em branco, sob um grupo de simetria (rotação de 180° no 1v1, espelho duplo no 2v2), e grava o .map.json
// canônico (saveMap via MapEditor.toFile). Justiça entre inícios por construção: terreno e nós são decididos só no
// representante canônico de cada órbita e replicados nas imagens; o build confere simetria, recursos por início e
// validação antes de gravar. Sem Math.random/trigonometria: ruído e hash determinísticos do núcleo.
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
   * idênticos. Lança se algo falhar (o build nunca grava um mapa injusto).
   */
  finish(meta: MapMeta): { file: FixedMapData; warnings: MapIssue[] } {
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
    return { file, warnings: issues.filter((i) => i.level === 'warn') };
  }
}

/**
 * Recursos a até 12 tiles de um início, invariantes pelos espelhos locais (dx → −dx e dy → −dy). Com a simetria global
 * do mapa, todos os inícios ficam com a mesma vizinhança também na orientação absoluta — importa porque o kit inicial
 * nasce sempre ao sul do Centro Cívico. 12 frutas (leste/oeste, ~6), 6 veios de ouro (norte/sul, ~8), 4 cervos (~7),
 * 2 javalis (~11) e 4 bosquetes de 6 árvores nas diagonais (~10). O Centro Cívico (3×3), a fila dos cidadãos (dy = 3) e
 * o batedor (3, 1) ficam livres.
 */
export function placeStartLayout(b: MapBuilder, sx: number, sy: number): void {
  const at = (pts: Pt[]): Pt[] => quad(pts).map(([dx, dy]) => [sx + dx, sy + dy]);
  b.nodes('berry', at([[6, 0], [7, 0], [6, 1], [7, 1]]));
  b.nodes('gold', at([[0, 8], [1, 8]]));
  b.nodes('deer', at([[4, 6]]));
  b.nodes('boar', at([[11, 0]]));
  b.nodes('tree', at([[7, 7], [8, 7], [7, 8], [8, 8], [9, 6], [6, 9]]));
}

/** Grava o arquivo (JSON compacto) e imprime o resumo; usado quando o script do mapa roda direto. */
export function writeMap(file: FixedMapData, warnings: MapIssue[], out: string): void {
  const json = JSON.stringify(file);
  fs.writeFileSync(out, json);
  const res = startResourcesOf(file);
  console.log(`${out}: ${file.w}x${file.h} · ${file.starts.length} inícios · ${file.nodes.length} nós · ${json.length} bytes · hash #${mapHash(file).toString(16)} · ${warnings.length} aviso(s)`);
  for (const w of warnings) console.log(`  aviso ${w.code}${w.x !== undefined ? ` (${w.x}, ${w.y})` : ''}${w.params ? ' ' + JSON.stringify(w.params) : ''}`);
  console.log(`  por início (raio 16): comida ${res[0].food} · madeira ${res[0].wood} · ouro ${res[0].gold} (iguais em todos)`);
}

/** Terrenos, para os scripts dos mapas. */
export const T = TERRAIN;
