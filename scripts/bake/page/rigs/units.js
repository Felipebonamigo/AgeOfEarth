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
//   titan   — rigs/titan.js (Etapa 6, lote titãs: Prometeu, Cronos e Oceano — corpo esculpido sobre os pivôs do humano,
//             cauda de serpente marinha no Oceano, ascensão saindo do chão; poses art/poses/titan.json)
// Cada entrada: (THREE, M, params) → { group, pose(fr, poses), feet, thin[, wheels, wheelRadius, glide] } com
// poses = { main, rider }.
import { humanUnit, KIT as HUMAN_KIT, JOINTS as HUMAN_JOINTS, SCALARS as HUMAN_SCALARS } from './human.js';
import { horseUnit, KIT as HORSE_KIT, JOINTS as HORSE_JOINTS, SCALARS as HORSE_SCALARS } from './horse.js';
import { siegeUnit, KIT as SIEGE_KIT, JOINTS as SIEGE_JOINTS, SCALARS as SIEGE_SCALARS } from './siege.js';
import { beastUnit, KIT as BEAST_KIT, JOINTS as BEAST_JOINTS, SCALARS as BEAST_SCALARS } from './beast.js';
import { giantUnit, KIT as GIANT_KIT, JOINTS as GIANT_JOINTS, SCALARS as GIANT_SCALARS } from './giant.js';
import { serpentUnit, KIT as SERPENT_KIT, JOINTS as SERPENT_JOINTS, SCALARS as SERPENT_SCALARS } from './serpent.js';
import { titanUnit, KIT as TITAN_KIT, JOINTS as TITAN_JOINTS, SCALARS as TITAN_SCALARS } from './titan.js';

export const UNIT_RIGS = { human: humanUnit, horse: horseUnit, siege: siegeUnit, beast: beastUnit, giant: giantUnit, serpent: serpentUnit, titan: titanUnit };
/** Arquivos de poses padrão por rig (o manifesto pode trocar em `source.poses`; o cavaleiro em `source.riderPoses`). */
export const DEFAULT_POSES = {
  human: 'art/poses/human.json', horse: 'art/poses/horse.json', siege: 'art/poses/siege.json',
  beast: 'art/poses/beast.json', giant: 'art/poses/giant.json', serpent: 'art/poses/serpent.json',
  titan: 'art/poses/titan.json',
};
/** Valores aceitos em `source.params` por rig (validação do manifesto; o cavaleiro usa o kit humano). */
export const UNIT_KITS = { human: HUMAN_KIT, horse: HORSE_KIT, siege: SIEGE_KIT, beast: BEAST_KIT, giant: GIANT_KIT, serpent: SERPENT_KIT, titan: TITAN_KIT };
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
  titan: { joints: TITAN_JOINTS, scalars: TITAN_SCALARS },
};
/** Arquivos-fonte de cada rig (entram no hash de entrada do bake, com units.js). */
export const RIG_FILES = {
  human: ['scripts/bake/page/rigs/human.js'],
  horse: ['scripts/bake/page/rigs/horse.js', 'scripts/bake/page/rigs/human.js', 'scripts/bake/page/rigs/wings.js'],
  siege: ['scripts/bake/page/rigs/siege.js', 'scripts/bake/page/rigs/human.js'],
  beast: ['scripts/bake/page/rigs/beast.js', 'scripts/bake/page/rigs/human.js', 'scripts/bake/page/rigs/wings.js', 'scripts/bake/page/rigs/organic.js'],
  giant: ['scripts/bake/page/rigs/giant.js', 'scripts/bake/page/rigs/human.js', 'scripts/bake/page/rigs/organic.js'],
  serpent: ['scripts/bake/page/rigs/serpent.js', 'scripts/bake/page/rigs/human.js', 'scripts/bake/page/rigs/organic.js'],
  titan: ['scripts/bake/page/rigs/titan.js', 'scripts/bake/page/rigs/human.js', 'scripts/bake/page/rigs/organic.js'],
};

// Lote bípedes-espíritos (Etapa 6, docs/ART.md Apêndice G): o rig `biped` — o esqueleto humano com o CORPO ESCULPIDO de
// rigs/anatomy.js e um acabamento (carne, bronze com pátina, mármore pintado, espectro): ciclope, colosso, sentinela e a
// Sombra (poses art/poses/biped.json, pivôs do humano). O corpo esculpido também veste o centauro (cavalo com
// `centaur: true`, rigs/centaur.js) e a Medusa (serpente, `form: 'medusa'`, rigs/medusa.js): os arquivos entram no hash
// dos dois rigs.
import { bipedUnit, KIT as BIPED_KIT, JOINTS as BIPED_JOINTS, SCALARS as BIPED_SCALARS } from './biped.js';
Object.assign(UNIT_RIGS, { biped: bipedUnit });
Object.assign(DEFAULT_POSES, { biped: 'art/poses/biped.json' });
Object.assign(UNIT_KITS, { biped: BIPED_KIT });
Object.assign(NESTED_HUMAN, { biped: 'human' });
Object.assign(UNIT_POSE_KEYS, { biped: { joints: BIPED_JOINTS, scalars: BIPED_SCALARS } });
Object.assign(RIG_FILES, { biped: ['scripts/bake/page/rigs/biped.js', 'scripts/bake/page/rigs/anatomy.js', 'scripts/bake/page/rigs/human.js', 'scripts/bake/page/rigs/organic.js'] });
RIG_FILES.horse.push('scripts/bake/page/rigs/centaur.js', 'scripts/bake/page/rigs/anatomy.js', 'scripts/bake/page/rigs/organic.js');
RIG_FILES.serpent.push('scripts/bake/page/rigs/medusa.js', 'scripts/bake/page/rigs/anatomy.js');
