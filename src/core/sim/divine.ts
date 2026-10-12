// Mitologia nas Eras (E6; docs/eras/E6-mitologia.md): números dos poderes novos, a escala dos poderes por Era e as leituras
// que o combate, o movimento e a coleta fazem a cada tick (Vendaval, Colheita Divina). Determinístico: só o estado, aritmética e
// raiz quadrada; nada de sorteio nem trigonometria. Valores iniciais para o balanceamento (E10).
import { MINOR_GODS, POWERS, UNITS } from '../data';
import type { GameState, Player, Unit } from '../types';
import { isEnemy } from './queries';
import { eraMythOn } from './restrictions';

/** Segundos de jogo, tiles e pontos de vida. */
export const POWER_TUNING = {
  eraScale: 0.15,                                    // +15% por Era acima da Era do poder (docs/ERAS.md §6)
  boltTitanBase: 0.5, boltTitanMax: 0.75,            // Raio num Titã: fração da vida
  panic: { seconds: 8, flee: 8 },
  crossroads: { pop: 20, spread: 6 },
  spring: { seconds: 20, maxShades: 12 },
  gale: { seconds: 12, push: 3, slow: 0.5, repair: 0.2 },
  tidal: { unit: 120, ship: 240, building: 300 },
  harvest: { seconds: 45, mult: 1.5 },
  sun: { half: 8, width: 1.5, seconds: 6, unit: 30, building: 80 },
  nike: { seconds: 30, mult: 1.3 },
  nemesis: { seconds: 20, reflect: 0.5 },
  drain: 0.3, rebirthHp: 0.5,                        // Empusa (cura) e Fênix (vida ao renascer)
} as const;

/** Era em que cada poder chega: a do deus menor que o traz (poder de deus maior = Era I). */
const POWER_ERA: Record<string, number> = {};
for (const g of Object.values(MINOR_GODS)) POWER_ERA[g.power] = g.age;
export function powerEraOf(id: string): number { return POWER_ERA[id] ?? 0; }

/** Força do poder agora: 1 + 0,15 por Era acima da Era do poder; 1 com eraMyth desligado (campanha, Horda, cenários). */
export function powerScale(state: GameState, player: Player, id: string): number {
  if (!eraMythOn(state)) return 1;
  return 1 + POWER_TUNING.eraScale * Math.max(0, player.age - powerEraOf(id));
}
/** Raio que a mira mostra (só a Restauração escala o raio). */
export function powerRadius(state: GameState, player: Player, id: string): number | undefined {
  const r = POWERS[id]?.radius;
  if (r === undefined) return undefined;
  return id === 'restoration' ? r * powerScale(state, player, id) : r;
}
/** Vendaval: fator de velocidade da unidade (0,5 dentro de um Vendaval inimigo; 0 para navio; titãs não sentem). */
export function galeFactor(state: GameState, u: Unit): number {
  if (state.timed.length === 0) return 1;
  let f = 1;
  for (const t of state.timed) {
    if (t.type !== 'gale' || state.tick >= t.until || t.x === undefined || t.y === undefined || !isEnemy(state, t.owner, u.owner)) continue;
    const r = t.data ?? 8, dx = u.x - t.x, dy = u.y - t.y;
    if (dx * dx + dy * dy > r * r) continue;
    const d = UNITS[u.type];
    if (d.tags.includes('titan')) continue;
    f = Math.min(f, d.naval ? 0 : POWER_TUNING.gale.slow);
  }
  return f;
}
/** Colheita Divina: multiplicador de coleta do jogador agora. */
export function harvestMult(state: GameState, player: Player): number { return state.tick < (player.harvestUntil ?? 0) ? POWER_TUNING.harvest.mult : 1; }
/** O ponto (rx, ry), relativo ao centro da faixa, está na faixa de direção unitária (dx, dy), meio-comprimento `half` e meia-largura `w`? */
export function inStrip(rx: number, ry: number, dx: number, dy: number, half: number, w: number): boolean {
  const a = rx * dx + ry * dy, b = ry * dx - rx * dy;
  return a >= -half && a <= half && b >= -w && b <= w;
}
/** Ponto da "casa" do jogador para os efeitos dos poderes globais: o Centro Cívico pronto de menor id (edifícios do próprio jogador:
 *  sem viés de posição); sem nenhum, o centro do mapa. Só visual. */
export function homeOf(state: GameState, player: Player): { x: number; y: number } {
  let best: { id: number; x: number; y: number } | null = null;
  for (const b of state.buildings.values()) if (b.owner === player.id && !b.dead && b.complete && b.type === 'town_center' && (!best || b.id < best.id)) best = b;
  return best ? { x: best.x, y: best.y } : { x: state.map.w / 2, y: state.map.h / 2 };
}
