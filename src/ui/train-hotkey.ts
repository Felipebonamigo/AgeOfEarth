// E6: várias unidades dividem a mesma tecla de treino (as criaturas do Templo usam Z; o Estaleiro tem Z/X/C): a tecla
// escolhe, entre os candidatos, a de Era mais alta que o jogador pode treinar agora (deus certo, Era alcançada, sem versão
// nova como o Colosso na VII); sem nenhuma assim, a primeira (o comando devolve o motivo da recusa). Pura: os testes a usam sem DOM.
import { UNITS } from '../core/data';
import type { Player } from '../core/types';
import { godAllows } from '../core/sim/commands';
import { mythUpgradeOf } from '../core/sim/myth';

export function pickTrainHotkey(player: Player, candidates: string[]): string | null {
  if (candidates.length <= 1) return candidates[0] ?? null;
  let best: string | null = null;
  for (const id of candidates) {
    const d = UNITS[id];
    if (!d || d.age > player.age || !godAllows(player, id) || mythUpgradeOf(id, player.age) !== id) continue;
    if (best === null || d.age > UNITS[best].age) best = id;
  }
  return best ?? candidates[0];
}
