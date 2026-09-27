// Registro dos rigs de UNIDADE do bake (Etapa 4): o manifesto escolhe o rig por `source.rig` e o kit por
// `source.params`; a página (bake.js) só conhece esta tabela. Um rig novo entra aqui com o seu arquivo de poses, sem
// mexer em bake.js.
//   human   — rigs/human.js (poses art/poses/human.json)
//   horse   — rigs/horse.js (poses art/poses/horse.json + cavaleiro em art/poses/human.json); asas do Pégaso em
//             rigs/wings.js (Etapa 6)
//   siege   — rigs/siege.js (poses art/poses/siege.json)
//   beast   — rigs/beast.js (Etapa 6: quadrúpede grande — leão, cão, mantícora, quimera; poses art/poses/beast.json)
//   giant   — rigs/giant.js (Etapa 6: bípede grande sobre o esqueleto humano — minotauro, ciclope, colosso; poses
//             art/poses/giant.json com os pivôs do humano)
//   serpent — rigs/serpent.js (Etapa 6: corpo em segmentos — hidra por cabeças, Medusa; poses art/poses/serpent.json)
// O titã entra no lote dos titãs (sobre `giant`, com a classe de tamanho `titan`: docs/ART.md Apêndice G).
// Cada entrada: (THREE, M, params) → { group, pose(fr, poses), feet, thin[, wheels, wheelRadius, glide] } com
// poses = { main, rider }.
import { humanUnit, KIT as HUMAN_KIT, JOINTS as HUMAN_JOINTS, SCALARS as HUMAN_SCALARS } from './human.js';
import { horseUnit, KIT as HORSE_KIT, JOINTS as HORSE_JOINTS, SCALARS as HORSE_SCALARS } from './horse.js';
import { siegeUnit, KIT as SIEGE_KIT, JOINTS as SIEGE_JOINTS, SCALARS as SIEGE_SCALARS } from './siege.js';
import { beastUnit, KIT as BEAST_KIT, JOINTS as BEAST_JOINTS, SCALARS as BEAST_SCALARS } from './beast.js';
import { giantUnit, KIT as GIANT_KIT, JOINTS as GIANT_JOINTS, SCALARS as GIANT_SCALARS } from './giant.js';
import { serpentUnit, KIT as SERPENT_KIT, JOINTS as SERPENT_JOINTS, SCALARS as SERPENT_SCALARS } from './serpent.js';

export const UNIT_RIGS = { human: humanUnit, horse: horseUnit, siege: siegeUnit, beast: beastUnit, giant: giantUnit, serpent: serpentUnit };
/** Arquivos de poses padrão por rig (o manifesto pode trocar em `source.poses`; o cavaleiro em `source.riderPoses`). */
export const DEFAULT_POSES = {
  human: 'art/poses/human.json', horse: 'art/poses/horse.json', siege: 'art/poses/siege.json',
  beast: 'art/poses/beast.json', giant: 'art/poses/giant.json', serpent: 'art/poses/serpent.json',
};
/** Valores aceitos em `source.params` por rig (validação do manifesto; o cavaleiro usa o kit humano). */
export const UNIT_KITS = { human: HUMAN_KIT, horse: HORSE_KIT, siege: SIEGE_KIT, beast: BEAST_KIT, giant: GIANT_KIT, serpent: SERPENT_KIT };
/** Kits humanos aninhados nos parâmetros de outro rig (validados com o kit do humano): o cavaleiro, o corpo do bípede
 *  grande e o torso da Medusa. */
export const NESTED_HUMAN = { horse: 'rider', giant: 'human', serpent: 'torso' };
/** Pivôs e escalares que as poses de cada rig podem usar (conferidos nos testes contra art/poses/*.json). */
export const UNIT_POSE_KEYS = {
  human: { joints: HUMAN_JOINTS, scalars: HUMAN_SCALARS },
  horse: { joints: HORSE_JOINTS, scalars: HORSE_SCALARS },
  siege: { joints: SIEGE_JOINTS, scalars: SIEGE_SCALARS },
  beast: { joints: BEAST_JOINTS, scalars: BEAST_SCALARS },
  giant: { joints: GIANT_JOINTS, scalars: GIANT_SCALARS },
  serpent: { joints: SERPENT_JOINTS, scalars: SERPENT_SCALARS },
};
/** Arquivos-fonte de cada rig (entram no hash de entrada do bake, com units.js). */
export const RIG_FILES = {
  human: ['scripts/bake/page/rigs/human.js'],
  horse: ['scripts/bake/page/rigs/horse.js', 'scripts/bake/page/rigs/human.js', 'scripts/bake/page/rigs/wings.js'],
  siege: ['scripts/bake/page/rigs/siege.js', 'scripts/bake/page/rigs/human.js'],
  beast: ['scripts/bake/page/rigs/beast.js', 'scripts/bake/page/rigs/human.js', 'scripts/bake/page/rigs/wings.js', 'scripts/bake/page/rigs/organic.js'],
  giant: ['scripts/bake/page/rigs/giant.js', 'scripts/bake/page/rigs/human.js', 'scripts/bake/page/rigs/organic.js'],
  serpent: ['scripts/bake/page/rigs/serpent.js', 'scripts/bake/page/rigs/human.js', 'scripts/bake/page/rigs/organic.js'],
};
