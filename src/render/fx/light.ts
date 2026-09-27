// Ciclo de luz OPCIONAL (docs/ART.md §1.5 e pergunta 10 do dono; desligado por padrão = meio-dia fixo): as sombras são
// assadas, então só a COR muda — amanhecer rosado e enevoado (sombras azuladas, contraste baixo), meio-dia neutro, tarde
// dourada, entardecer alaranjado com sombras violáceas e o crepúsculo ("hora azul"), sem noite fechada (a legibilidade
// vem antes: brilho ≥ 0,8 e o cinza médio nunca abaixo de ~75 % do meio-dia). Um ColorMatrixFilter na camada do mundo
// (não na interface), atualizado a cada 0,25 s de jogo; relógio = tempo de JOGO (a partida começa de manhã; pausa
// congela). Por canal: saturação (luminância Rec. 709) → cor × brilho → contraste em torno do cinza médio → "lift"
// (cor somada às sombras: o azul do céu no amanhecer, o violeta no entardecer).
import { ColorMatrixFilter, Rectangle, type Container } from 'pixi.js';

/** Duração de um dia (s de jogo). */
export const DAY_SECONDS = 14 * 60;
/** Fração do dia em que a partida começa (manhã). */
export const DAY_START = 0.18;

/** Quadro-chave do dia: fração 0–1, multiplicadores de cor por canal, saturação, brilho, contraste (1 = igual) e a cor
 *  somada às sombras (lift, 0–1 por canal). */
export interface LightKey { f: number; r: number; g: number; b: number; sat: number; bright: number; con: number; lr: number; lg: number; lb: number }
const K = (f: number, r: number, g: number, b: number, sat: number, bright: number, con = 1, lr = 0, lg = 0, lb = 0): LightKey => ({ f, r, g, b, sat, bright, con, lr, lg, lb });
/** Quadros-chave do dia (o 1º e o último são o mesmo amanhecer: o dia emenda). */
export const DAY_KEYS: readonly LightKey[] = [
  K(0.0, 1.05, 0.93, 0.92, 0.84, 0.93, 0.9, 0.012, 0.02, 0.055),    // amanhecer: rosado, enevoado, sombras azuladas
  K(0.13, 1.02, 0.99, 0.96, 0.95, 0.98, 0.97, 0.004, 0.006, 0.018), // manhã
  K(0.25, 1, 1, 1, 1, 1),                                           // meio-dia (o visual de sempre: identidade)
  K(0.55, 1, 1, 1, 1, 1),
  K(0.68, 1.06, 1.0, 0.86, 1.07, 1.0, 1.03),                        // tarde dourada
  K(0.8, 1.12, 0.86, 0.7, 1.04, 0.93, 1.04, 0.03, 0, 0.038),        // entardecer: laranja, sombras violáceas
  K(0.9, 0.82, 0.86, 1.04, 0.8, 0.82, 0.95, 0, 0.012, 0.05),        // crepúsculo (hora azul, o mais escuro)
  K(1.0, 1.05, 0.93, 0.92, 0.84, 0.93, 0.9, 0.012, 0.02, 0.055),    // amanhecer de novo
];
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Luz no instante `t` (s de jogo desde o começo da partida). */
export function dayLight(t: number): LightKey {
  const f = (((t / DAY_SECONDS + DAY_START) % 1) + 1) % 1;
  let i = 1;
  while (i < DAY_KEYS.length - 1 && DAY_KEYS[i].f < f) i++;
  const a = DAY_KEYS[i - 1], b = DAY_KEYS[i];
  const k = smooth(Math.max(0, Math.min(1, (f - a.f) / Math.max(1e-6, b.f - a.f))));
  const m = (x: number, y: number) => x + (y - x) * k;
  return { f, r: m(a.r, b.r), g: m(a.g, b.g), b: m(a.b, b.b), sat: m(a.sat, b.sat), bright: m(a.bright, b.bright), con: m(a.con, b.con), lr: m(a.lr, b.lr), lg: m(a.lg, b.lg), lb: m(a.lb, b.lb) };
}
/** Matriz 4×5 do ColorMatrixFilter (deslocamentos em 0–1): saturação → cor/brilho → contraste no cinza médio → lift. */
export function lightMatrix(l: LightKey): number[] {
  const s = l.sat, lr = 0.2126 * (1 - s), lg = 0.7152 * (1 - s), lb = 0.0722 * (1 - s);
  const c = l.con ?? 1;
  const R = l.r * l.bright * c, G = l.g * l.bright * c, B = l.b * l.bright * c;
  const off = (ch: number, lift: number) => 0.5 * (1 - c) * ch * l.bright + lift;
  return [
    (lr + s) * R, lg * R, lb * R, 0, off(l.r, l.lr ?? 0),
    lr * G, (lg + s) * G, lb * G, 0, off(l.g, l.lg ?? 0),
    lr * B, lg * B, (lb + s) * B, 0, off(l.b, l.lb ?? 0),
    0, 0, 0, 1, 0,
  ];
}
/** Um cinza `v` (0–1) passado pela luz `l` (média dos canais): a régua de legibilidade dos testes. */
export function lightGrey(l: LightKey, v: number): number {
  const m = lightMatrix(l);
  const ch = (row: number) => (m[row * 5] + m[row * 5 + 1] + m[row * 5 + 2]) * v + m[row * 5 + 4];
  return (ch(0) + ch(1) + ch(2)) / 3;
}

export class DayCycle {
  private filter: ColorMatrixFilter | null = null;
  private target: Container | null = null;
  private last = -1;
  /** Área do filtro (coordenadas locais do mundo = a tela): sem ela o Pixi mede os limites de TODOS os filhos a cada quadro. */
  private area = new Rectangle();
  enabled = false;
  /** Deslocamento (s) somado ao relógio — só para capturas (scripts/artfx.mjs mostra o entardecer sem esperar 10 min). */
  offset = 0;
  /** `makeFilter`: os testes em Node passam um filtro falso (o ColorMatrixFilter real pede um canvas). */
  constructor(private readonly makeFilter: () => ColorMatrixFilter = () => new ColorMatrixFilter()) {}
  /** Liga/desliga na camada `world` (desligado: nenhum filtro — custo zero). */
  set(world: Container, on: boolean): void {
    this.enabled = on;
    if (!on) {
      if (this.target && this.filter) { this.target.filters = (this.target.filters ?? []).filter((x) => x !== this.filter); if (this.target.filterArea === this.area) this.target.filterArea = undefined as unknown as Rectangle; }
      this.target = null; return;
    }
    this.filter ??= this.makeFilter();
    if (this.target !== world) { this.target = world; world.filters = [...(world.filters ?? []), this.filter]; world.filterArea = this.area; }
    this.last = -1;
  }
  /** Atualiza a cor (s de jogo) a cada 0,25 s; `view` = a tela em coordenadas locais do mundo (px de mundo). */
  update(t: number, view?: { x: number; y: number; w: number; h: number }): void {
    if (!this.enabled || !this.filter) return;
    if (view) { const r = this.area; r.x = view.x; r.y = view.y; r.width = view.w; r.height = view.h; }
    t += this.offset;
    const q = Math.floor(t * 4);
    if (q === this.last) return;
    this.last = q;
    this.filter.matrix = lightMatrix(dayLight(t)) as ColorMatrixFilter['matrix'];
  }
}
