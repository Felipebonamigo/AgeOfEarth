// Ciclo de luz OPCIONAL (docs/ART.md §1.5 e pergunta 10 do dono; desligado por padrão = meio-dia fixo): as sombras são
// assadas, então só a COR muda — amanhecer rosado, meio-dia neutro, tarde dourada, entardecer alaranjado e a "hora azul",
// sem noite fechada (a legibilidade vem antes). Um ColorMatrixFilter na camada do mundo (não na interface), atualizado a
// cada 0,25 s de jogo; relógio = tempo de JOGO (a partida começa de manhã; pausa congela).
import { ColorMatrixFilter, Rectangle, type Container } from 'pixi.js';

/** Duração de um dia (s de jogo). */
export const DAY_SECONDS = 14 * 60;
/** Fração do dia em que a partida começa (manhã). */
export const DAY_START = 0.18;

export interface LightKey { f: number; r: number; g: number; b: number; sat: number; bright: number }
/** Quadros-chave do dia (fração 0–1): multiplicadores de cor por canal, saturação e brilho. */
export const DAY_KEYS: readonly LightKey[] = [
  { f: 0.0, r: 1.04, g: 0.9, b: 0.86, sat: 0.9, bright: 0.9 },     // amanhecer
  { f: 0.14, r: 1.02, g: 0.98, b: 0.94, sat: 0.97, bright: 0.97 }, // manhã
  { f: 0.25, r: 1, g: 1, b: 1, sat: 1, bright: 1 },                // meio-dia (o visual de sempre)
  { f: 0.55, r: 1, g: 1, b: 1, sat: 1, bright: 1 },
  { f: 0.68, r: 1.06, g: 1.0, b: 0.88, sat: 1.04, bright: 1 },     // tarde dourada
  { f: 0.8, r: 1.08, g: 0.86, b: 0.72, sat: 0.95, bright: 0.9 },   // entardecer
  { f: 0.9, r: 0.8, g: 0.84, b: 1.02, sat: 0.8, bright: 0.76 },    // hora azul (o mais escuro)
  { f: 1.0, r: 1.04, g: 0.9, b: 0.86, sat: 0.9, bright: 0.9 },     // amanhecer de novo
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
  return { f, r: m(a.r, b.r), g: m(a.g, b.g), b: m(a.b, b.b), sat: m(a.sat, b.sat), bright: m(a.bright, b.bright) };
}
/** Matriz 4×5 do ColorMatrixFilter: saturação (luminância Rec. 709) seguida da cor/brilho por canal. */
export function lightMatrix(l: LightKey): number[] {
  const s = l.sat, lr = 0.2126 * (1 - s), lg = 0.7152 * (1 - s), lb = 0.0722 * (1 - s);
  const R = l.r * l.bright, G = l.g * l.bright, B = l.b * l.bright;
  return [
    (lr + s) * R, lg * R, lb * R, 0, 0,
    lr * G, (lg + s) * G, lb * G, 0, 0,
    lr * B, lg * B, (lb + s) * B, 0, 0,
    0, 0, 0, 1, 0,
  ];
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
