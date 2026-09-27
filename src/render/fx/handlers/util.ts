// Apoio dos handlers de efeito (docs/ART.md Apêndice F).
import { TILE } from '../../../core/constants';
import type { GameState } from '../../../core/types';
import type { FxContext } from '../types';
import { dustColor } from '../logic';

/** Efeitos de um disparo só (faíscas, poeira do impacto) só saem se o efeito for novo: quem volta à tela, sai da névoa
 *  ou é recriado por uma troca de arte não repete o golpe antigo. */
export const FRESH = 0.2;
export { TILE };
/** Tipo de terreno do tile de (x, y) em tiles (fora do mapa: grama). */
export function terrainAt(state: GameState, x: number, y: number): number {
  const m = state.map, tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return 0;
  return m.terrain[ty * m.w + tx];
}
/** Cor da poeira no tile de (x, y). */
export const dustAt = (fx: FxContext, x: number, y: number): number => dustColor(terrainAt(fx.state, x, y));
/** O efeito em (x, y) tiles está à vista (tile visível e na tela). */
export const seenNow = (fx: FxContext, x: number, y: number, margin = 2): boolean => fx.onScreen(x, y, margin) && fx.visibleAt(x, y);
/** O jogador local VÊ o que acontece com uma entidade de `owner` em (x, y) tiles: o tile está visível, ou ela é dele (a
 *  névoa recalculada no tick da morte/queda pode já ter apagado a visão que ela mesma dava). Morte, estátua e desabamento
 *  sob a névoa não mostram nada (docs/ART.md Apêndice F: "nada fora da vista"); os decalques têm a névoa própria. */
export const seenEntity = (fx: FxContext, x: number, y: number, owner: number | undefined): boolean => owner === fx.local || fx.visibleAt(x, y);
