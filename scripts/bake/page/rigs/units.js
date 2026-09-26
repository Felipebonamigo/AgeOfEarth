// Registro dos rigs de UNIDADE do bake (Etapa 4): o manifesto escolhe o rig por `source.rig` e o kit por
// `source.params`; a página (bake.js) só conhece esta tabela. Um rig novo (Etapa 6: quadrúpede, bípede grande, voador,
// serpente, titã) entra aqui com o seu arquivo de poses, sem mexer em bake.js.
//   human — rigs/human.js (poses art/poses/human.json)
//   horse — rigs/horse.js (poses art/poses/horse.json + cavaleiro em art/poses/human.json)
//   siege — rigs/siege.js (poses art/poses/siege.json)
// Cada entrada: (THREE, M, params) → { group, pose(fr, poses) } com poses = { main, rider }.
import { humanUnit, KIT as HUMAN_KIT, JOINTS as HUMAN_JOINTS, SCALARS as HUMAN_SCALARS } from './human.js';
import { horseUnit, KIT as HORSE_KIT, JOINTS as HORSE_JOINTS, SCALARS as HORSE_SCALARS } from './horse.js';
import { siegeUnit, KIT as SIEGE_KIT, JOINTS as SIEGE_JOINTS, SCALARS as SIEGE_SCALARS } from './siege.js';

export const UNIT_RIGS = { human: humanUnit, horse: horseUnit, siege: siegeUnit };
/** Arquivos de poses padrão por rig (o manifesto pode trocar em `source.poses`; o cavaleiro em `source.riderPoses`). */
export const DEFAULT_POSES = { human: 'art/poses/human.json', horse: 'art/poses/horse.json', siege: 'art/poses/siege.json' };
/** Valores aceitos em `source.params` por rig (validação do manifesto; o cavaleiro usa o kit humano). */
export const UNIT_KITS = { human: HUMAN_KIT, horse: HORSE_KIT, siege: SIEGE_KIT };
/** Pivôs e escalares que as poses de cada rig podem usar (conferidos nos testes contra art/poses/*.json). */
export const UNIT_POSE_KEYS = {
  human: { joints: HUMAN_JOINTS, scalars: HUMAN_SCALARS },
  horse: { joints: HORSE_JOINTS, scalars: HORSE_SCALARS },
  siege: { joints: SIEGE_JOINTS, scalars: SIEGE_SCALARS },
};
/** Arquivos-fonte de cada rig (entram no hash de entrada do bake, com units.js). */
export const RIG_FILES = {
  human: ['scripts/bake/page/rigs/human.js'],
  horse: ['scripts/bake/page/rigs/horse.js', 'scripts/bake/page/rigs/human.js'],
  siege: ['scripts/bake/page/rigs/siege.js', 'scripts/bake/page/rigs/human.js'],
};
