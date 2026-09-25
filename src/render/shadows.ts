// Geometria das sombras separadas (docs/ART.md §1.5): um sol fixo a noroeste-alto projeta todas as sombras para
// sudeste (direita-baixo na tela) com o mesmo comprimento relativo. Este módulo só calcula elipses/retângulos e
// deslocamentos; os sprites vivem na camada 'shadows' do renderizador (unidades/edifícios) ou são assados no chunk
// (nós: árvores, arbustos, minas, animais) com exatamente a mesma regra, para que tudo caia na mesma direção.
import { TILE } from '../core/constants';
import { BUILDINGS, UNITS } from '../core/data';
import { shadowOffset } from './palette';

export interface EllipseShadow { rx: number; ry: number; dx: number; dy: number }
export interface RectShadow { w: number; h: number; dx: number; dy: number }

/** Sombra de uma unidade: elipse achatada do tamanho do corpo, deslocada pela altura visual (≈ 1,8 × raio). */
export function unitShadow(type: string): EllipseShadow {
  const def = UNITS[type];
  const r = (def?.radius ?? 0.4) * TILE;
  const height = def?.flying ? r * 4.5 : r * 1.8;
  const o = shadowOffset(height);
  return { rx: r * 1.05, ry: r * 0.62, dx: o.x, dy: o.y };
}

/** Altura visual (em tiles) dos edifícios do placeholder; nada acima de ~2,2 tiles (§1.3, regra 3). */
function buildingHeight(type: string): number {
  const def = BUILDINGS[type];
  if (!def) return 0.8;
  // valores baixos de propósito: o placeholder é visto de cima e a sombra só aparece como faixa a sudeste do footprint
  switch (type) {
    case 'farm': return 0;
    case 'wall': return 0.3;
    case 'gate': return 0.4;
    case 'tower': return 0.9;
    case 'house': return 0.6;
    case 'fortress': return 1.2;
    case 'titan_gate': return 0.35;
    default: return Math.min(1.3, 0.4 + 0.15 * Math.min(def.w, def.h));
  }
}

/** Sombra de um edifício: o próprio footprint deslocado para sudeste proporcionalmente à altura visual (null = sem sombra). */
export function buildingShadow(type: string): RectShadow | null {
  const def = BUILDINGS[type];
  const h = buildingHeight(type);
  if (!def || h <= 0) return null;
  const o = shadowOffset(h * TILE);
  return { w: def.w * TILE, h: def.h * TILE, dx: o.x, dy: o.y };
}

/** Sombra de um nó do mapa (assada no chunk), em px relativos ao centro do tile; `scale` = escala do sprite da árvore. */
export function nodeShadow(type: string, scale = 1): EllipseShadow | null {
  switch (type) {
    case 'tree': { const o = shadowOffset(24 * scale); return { rx: 12 * scale, ry: 7 * scale, dx: o.x, dy: o.y + 2 }; }
    case 'berry': { const o = shadowOffset(14); return { rx: 10, ry: 5.5, dx: o.x, dy: o.y + 1 }; }
    case 'gold': { const o = shadowOffset(12); return { rx: 12, ry: 5, dx: o.x, dy: o.y + 3 }; }
    case 'deer': { const o = shadowOffset(8); return { rx: 9, ry: 4, dx: o.x, dy: o.y + 3 }; }
    case 'boar': { const o = shadowOffset(7); return { rx: 8, ry: 3.5, dx: o.x, dy: o.y + 2 }; }
    case 'lure': { const o = shadowOffset(16); return { rx: 10, ry: 4.5, dx: o.x, dy: o.y + 4 }; }
    default: return null;
  }
}
