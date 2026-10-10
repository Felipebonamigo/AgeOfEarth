// Recursos raros (docs/ERAS.md §3; docs/eras/E2-recursos.md): um Mercador trabalhando num nó deste tipo rende ouro
// (RARE_GOLD_RATE/s) e o bônus abaixo vale para o império inteiro enquanto ele estiver lá (Player.rares, recomputeMods).
import type { Effect } from '../types';
export interface RareDef { id: string; effects: Effect[] }
export const RARES: Record<string, RareDef> = {
  olive: { id: 'olive', effects: [{ type: 'gather', resource: 'farm', mult: 1.1 }] },
  vineyard: { id: 'vineyard', effects: [{ type: 'player', stat: 'tradeTax', mult: 0.8 }] },
  paros_marble: { id: 'paros_marble', effects: [{ type: 'building', match: 'all', stat: 'hp', mult: 1.1 }] },
  salt: { id: 'salt', effects: [{ type: 'player', stat: 'attritionResist', add: 0.25 }] },
  wild_horses: { id: 'wild_horses', effects: [{ type: 'cost', match: { tags: ['cavalry'] }, mult: 0.85 }] },
  copper: { id: 'copper', effects: [{ type: 'unit', match: { tags: ['military'] }, stat: 'attack', mult: 1.05 }] },
  incense: { id: 'incense', effects: [{ type: 'player', stat: 'favorRate', mult: 1.15 }] },
};
