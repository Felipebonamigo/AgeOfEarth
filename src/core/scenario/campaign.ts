// Campanha "Titanomaquia" (docs/STORY.md): registro das missões por ato (G0) e o prólogo "A Sombra dos Titãs" em TS (m1–m3).
// Missões novas (m4…m12) são arquivos JSON em missions/<id>.scenario.json importados estaticamente e listados em CAMPAIGN.
import { TICK_RATE, type Difficulty } from '../constants';
import type { GameConfig } from '../types';
import type { ScenarioDef } from './types';
import type { ScenarioFile } from './schema';
import { compileScenarioCached } from './compile';
import { CAMPAIGN_PLAN, PROLOGUE_IDS, type CampaignAct } from './official';
import { getLocale } from '../../i18n';
import m4 from './missions/m4_caucaso.scenario.json';
import { count, countBuildings, military, townCenter, raid, give, grantTech, placeNear, spawnGroup, localHumanIndex } from './helpers';
import { onBuildingComplete } from '../sim/entities';
import { rectReachable } from '../map/components';
import type { Unit } from '../types';
import m6 from './missions/m6_estatua.scenario.json';
import m7 from './missions/m7_aquiles.scenario.json';

const ME = 0;

/** Ondas do Modo Horda: cresce em número e qualidade a cada onda. */
function hordeWave(n: number): string[] {
  const pool: string[][] = [
    ['hoplite', 'toxotes'], ['hoplite', 'toxotes', 'hippeus'], ['hypaspist', 'cretan_archer', 'hetairoi', 'minotaur'],
    ['hypaspist', 'hetairoi', 'cyclops', 'centaur', 'petrobolos'], ['myrmidon', 'hydra', 'manticore', 'nemean_lion', 'helepolis'], ['myrmidon', 'medusa', 'chimera', 'colossus', 'cerberus'],
  ];
  const tier = Math.min(pool.length - 1, Math.floor((n - 1) / 3));
  const size = 4 + n * 2;
  const out: string[] = [];
  for (let i = 0; i < size; i++) out.push(pool[tier][(i * 7 + n) % pool[tier].length]);
  if (n % 5 === 0) out.push(n >= 15 ? 'cronus' : 'colossus');
  return out;
}
export const HORDE_WAVES = 20;

export const HORDE: ScenarioDef = {
  id: 'horde', title: 'Modo Horda', subtitle: 'Sobreviva a 20 ondas do Tártaro (solo ou cooperativo)', icon: '💀',
  intro: ['As portas do Tártaro se abriram. A cada 100 segundos uma onda maior e mais monstruosa marcha contra sua cidade. Fortifique-se, avance de Idade e sobreviva a 20 ondas. Em cooperativo, cada jogador defende sua própria cidade e pode socorrer o aliado.'],
  outro: ['Vinte ondas do Tártaro quebraram contra suas muralhas. Os deuses aplaudem.'],
  config: { seed: 4404, mapSize: 'medium', players: [{ name: 'Defensor', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'Tártaro', god: 'hades', isAI: false, difficulty: 'normal', team: 9, puppet: true }], startingResources: { food: 600, wood: 500, gold: 300, favor: 20 } },
  setup: (state) => {
    // O Tártaro não tem cidade: remove o que o gerador criou para ele
    const t = state.players.findIndex((p) => p.team === 9);
    if (t >= 0) { for (const b of state.buildings.values()) if (b.owner === t) b.dead = true; for (const u of state.units.values()) if (u.owner === t) u.dead = true; }
  },
  objectives: [
    // só contam monstros que ainda podem chegar a algum Centro Cívico defensor (nunca uma ilha ou bolsão)
    { id: 'waves', text: `Sobreviva a ${HORDE_WAVES} ondas`, check: (s) => { const tcs = [...s.buildings.values()].filter((b) => b.type === 'town_center' && !b.dead && s.players[b.owner].team !== 9); const canReach = (u: Unit) => tcs.some((b) => rectReachable(s.map, Math.floor(u.x), Math.floor(u.y), b.tx, b.ty, b.w, b.h, true)); return s.scenario!.fired.filter((f) => f.startsWith('wave')).length >= HORDE_WAVES && count(s, s.players.findIndex((p) => p.team === 9), (u) => military(u) && canReach(u)) === 0 ? 'done' : 'pending'; } },
  ],
  triggers: [
    { id: 'start', when: (_s, c) => c.seconds >= 1, then: (_s, c) => c.say('Hades', 'Meus filhos famintos vêm buscar o que é meu. A primeira onda chega em 100 segundos.', '💀') },
    ...Array.from({ length: HORDE_WAVES }, (_, i) => ({
      id: `wave${i + 1}`,
      when: (_s: import('../types').GameState, c: import('./types').TriggerCtx) => c.seconds >= 100 * (i + 1),
      then: (s: import('../types').GameState, c: import('./types').TriggerCtx) => {
        const t = s.players.findIndex((p) => p.team === 9);
        const defenders = s.players.filter((p) => p.team === 0 && p.alive);
        defenders.forEach((d, k) => { const tc = townCenter(s, d.id); if (tc) raid(s, t, hordeWave(i + 1), tc.x, tc.y, (i + k * 3) % 8, 24); });
        c.say('Hades', `Onda ${i + 1} de ${HORDE_WAVES}!${(i + 1) % 5 === 0 ? ' Algo enorme caminha entre eles...' : ''}`, '💀');
      },
    })),
  ],
  victory: (s) => s.scenario!.objectives.waves === 'done',
  defeat: (s) => s.players.filter((p) => p.team === 0).every((p) => countBuildings(s, p.id, 'town_center') === 0) && s.tick > 5 * TICK_RATE,
};

/**
 * m3: números de dificuldade (sem mudar texto). O Culto começava na Mítica com 4000 de cada recurso e atacava em ~2 min: nem a
 * IA "difícil" jogando por Argos passava dos 5 min (o Culto arrasava os Aliados e depois Argos). Agora o estoque inicial e a
 * "calma" (segundos até a IA do Culto poder lançar a 1ª onda, além do intervalo normal; as invasões roteirizadas continuam)
 * dependem da dificuldade da campanha, e o ritual leva ~24 min (0,125 s de obra/s) em vez de ~10, casando com os 25–30 min da
 * §4 de docs/STORY.md (a corrida contra o Portal era impossível de perder por tempo e de vencer por força).
 */
const M3_BALANCE: Record<'easy' | 'normal' | 'hard', { stock: number; calm: number }> = { easy: { stock: 1500, calm: 600 }, normal: { stock: 2000, calm: 540 }, hard: { stock: 2500, calm: 480 } };
const M3_RITUAL_RATE = 0.125;

/** Prólogo em TS (m1–m3). Use campaignMissions()/campaignMission(id) para a campanha inteira. */
export const PROLOGUE: ScenarioDef[] = [
  {
    id: 'm1_despertar', title: 'O Despertar de Argos', subtitle: 'Missão 1 · Fundamentos', icon: '🏺',
    intro: [
      'Argos, antes das guerras dos deuses. Você é o jovem arconte de uma aldeia esquecida, e os oráculos falam de sombras que se agitam no Tártaro.',
      'Zeus exige provas de que sua cidade merece proteção: cresça, honre-o com um Templo e alcance a Idade Clássica. Bandos de saqueadores rondam as colinas.',
    ],
    outro: ['Argos prospera e o Olimpo tomou nota. Mas os batedores relatam um exército de Hades marchando do sul...'],
    config: { seed: 1101, mapSize: 'small', players: [{ name: 'Argos', god: 'zeus', isAI: false, difficulty: 'easy', team: 0 }, { name: 'Saqueadores', god: 'hades', isAI: false, difficulty: 'easy', team: 1, puppet: true }], startingResources: { food: 400, wood: 300, gold: 150 } },
    setup: (state) => {
      // Os saqueadores não têm cidade: só um acampamento distante com uma torre e alguns hoplitas
      const tc = townCenter(state, 1);
      if (tc) { for (const b of [...state.buildings.values()]) if (b.owner === 1) { b.dead = true; } for (const u of [...state.units.values()]) if (u.owner === 1) u.dead = true; }
      const s = state.map.starts[1];
      placeNear(state, 1, 'barracks', s.x, s.y, true);
      placeNear(state, 1, 'tower', s.x + 3, s.y - 3, true);
      spawnGroup(state, 1, ['hoplite', 'hoplite', 'toxotes', 'toxotes'], s.x, s.y + 3);
      state.players[1].resources.food = 0;
    },
    objectives: [
      { id: 'vill', text: 'Treine 10 Cidadãos', check: (s) => (count(s, ME, (u) => u.type === 'villager') >= 10 ? 'done' : 'pending') },
      { id: 'temple', text: 'Construa um Templo e ponha 3 cidadãos para rezar', check: (s) => (countBuildings(s, ME, 'temple') >= 1 && count(s, ME, (u) => u.state === 'pray') >= 3 ? 'done' : 'pending') },
      { id: 'army', text: 'Treine 6 unidades militares no Quartel', check: (s) => (count(s, ME, military) >= 6 ? 'done' : 'pending') },
      { id: 'age', text: 'Avance para a Idade Clássica', check: (s) => (s.players[ME].age >= 1 ? 'done' : 'pending') },
      // G1 avalia objetivos ocultos: a guarda pelo gatilho que o revela mantém o comportamento de antes (só conta depois da Idade Clássica)
      { id: 'camp', text: 'Destrua o acampamento dos saqueadores', hidden: true, check: (s) => (s.scenario!.fired.includes('reveal_camp') && countBuildings(s, 1) === 0 ? 'done' : 'pending') },
    ],
    triggers: [
      { id: 'start', when: (_s, c) => c.seconds >= 1, then: (_s, c) => { c.say('Oráculo de Delfos', 'Arconte, a terra é fértil e os deuses observam. Comece pelos cidadãos: selecione o Centro Cívico e treine-os (tecla Q). Mande-os às frutas e às árvores com o botão direito.', '🔮'); } },
      { id: 'tip_house', when: (s) => s.players[ME].pop >= s.players[ME].popCap - 3, then: (_s, c) => c.say('Oráculo de Delfos', 'Sua população está no limite. Selecione cidadãos e construa Casas (tecla Q). Cada casa abriga 10.', '🔮') },
      { id: 'tip_temple', when: (s, c) => c.fired('start') && s.scenario!.objectives.vill === 'done', then: (_s, c) => c.say('Oráculo de Delfos', 'Zeus quer um Templo (tecla S com cidadãos selecionados). Cidadãos que rezam nele geram Favor, a moeda dos deuses. Lembre-se: só se constrói dentro das suas fronteiras.', '🔮') },
      { id: 'raid1', when: (_s, c) => c.seconds >= 240, then: (s, c) => { const tc = townCenter(s, ME); if (tc) raid(s, 1, ['hoplite', 'hoplite', 'toxotes'], tc.x, tc.y, 3, 20); c.say('Batedor', 'Saqueadores se aproximam pelo sul! Reúna seus hoplitas.', '🐎'); } },
      { id: 'raid2', when: (_s, c) => c.seconds >= 480, then: (s, c) => { const tc = townCenter(s, ME); if (tc) raid(s, 1, ['hoplite', 'hoplite', 'hoplite', 'toxotes', 'toxotes'], tc.x, tc.y, 4, 22); c.say('Batedor', 'Outra onda de saqueadores! Lembre-se: dentro das nossas fronteiras eles sofrem atrito.', '🐎'); } },
      { id: 'reveal_camp', when: (s) => s.scenario!.objectives.age === 'done', then: (s, c) => { c.reveal('camp'); c.say('Zeus', 'Você provou seu valor, arconte. Agora leve a guerra até eles: destrua o acampamento dos saqueadores e Argos será minha.', '⚡'); give(s, ME, { gold: 200 }); } },
    ],
    victory: (s) => ['vill', 'temple', 'army', 'age', 'camp'].every((o) => s.scenario!.objectives[o] === 'done'),
    hints: ['Use o botão "Ociosos" para achar cidadãos parados.', 'Celeiro, Serraria e Mina perto dos recursos aceleram a coleta.'],
  },
  {
    id: 'm2_cerco', title: 'O Cerco de Argos', subtitle: 'Missão 2 · Defesa', icon: '🏰',
    intro: [
      'O exército de Hades chegou. Seus emissários exigem a rendição da cidade e a entrega do Templo de Zeus.',
      'Resista por 12 minutos até que os reforços de Esparta cheguem. Torres, muralhas e a Fortaleza serão suas melhores amigas. Depois, contra-ataque.',
    ],
    outro: ['Os espartanos chegaram, e Argos resistiu. Mas os sacerdotes de Hades falam de um Portal... e do que dorme atrás dele.'],
    config: { seed: 2202, mapSize: 'medium', players: [{ name: 'Argos', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'Legião de Hades', god: 'hades', isAI: true, difficulty: 'normal', team: 1 }], startingAge: 1, startingResources: { food: 900, wood: 800, gold: 500, favor: 40 } },
    setup: (state) => {
      const tc = townCenter(state, ME);
      if (tc) {
        placeNear(state, ME, 'temple', tc.x + 6, tc.y, true); placeNear(state, ME, 'barracks', tc.x - 6, tc.y, true); placeNear(state, ME, 'house', tc.x, tc.y + 5, true); placeNear(state, ME, 'house', tc.x + 3, tc.y + 5, true);
        spawnGroup(state, ME, ['hoplite', 'hoplite', 'hoplite', 'toxotes', 'toxotes', 'jason'], tc.x, tc.y + 4);
        for (let i = 0; i < 4; i++) spawnGroup(state, ME, ['villager'], tc.x - 3 + i, tc.y - 3);
      }
      const e = state.players[1]; e.age = 2; e.resources.food = 1500; e.resources.wood = 1500; e.resources.gold = 1200; e.minorGods.push('ares'); e.powers.push({ id: 'pestilence', used: false });
      grantTech(state, 1, 'phalanx'); grantTech(state, 1, 'bronze_armor');
      const et = townCenter(state, 1);
      if (et) { placeNear(state, 1, 'barracks', et.x + 6, et.y, true); placeNear(state, 1, 'stable', et.x - 6, et.y, true); placeNear(state, 1, 'temple', et.x, et.y + 6, true); spawnGroup(state, 1, ['hoplite', 'hoplite', 'hoplite', 'hoplite', 'toxotes', 'toxotes', 'hippeus', 'hippeus', 'cyclops'], et.x, et.y - 5); }
      const p = state.players[ME]; p.minorGods.push('athena'); p.powers.push({ id: 'restoration', used: false });
      if (et) state.scenario!.vars.targetTc = et.id;   // o objetivo é o Centro Cívico original, não os que a Legião fundar depois
    },
    objectives: [
      { id: 'survive', text: 'Resista por 12 minutos (o Centro Cívico não pode cair)', check: (s) => (s.tick >= 12 * 60 * TICK_RATE ? 'done' : 'pending') },
      { id: 'fortress', text: 'Construa uma Fortaleza', optional: true, check: (s) => (countBuildings(s, ME, 'fortress') >= 1 ? 'done' : 'pending') },
      // oculto até os reforços (G1: guarda por 'reinforce' para não vencer antes dos 12 minutos)
      { id: 'counter', text: 'Destrua o Centro Cívico original da Legião de Hades', hidden: true, check: (s) => { if (!s.scenario!.fired.includes('reinforce')) return 'pending'; const id = s.scenario!.vars.targetTc; const b = id !== undefined ? s.buildings.get(id) : undefined; return (id !== undefined ? !b || b.dead : countBuildings(s, 1, 'town_center') === 0) ? 'done' : 'pending'; } },
    ],
    triggers: [
      { id: 'start', when: (_s, c) => c.seconds >= 1, then: (_s, c) => c.say('Jasão', 'Eles virão em ondas, arconte. Torres nas entradas, hoplitas na frente, arqueiros atrás. Atena nos concedeu a Restauração: use-a quando a linha estiver por cair.', '🦁') },
      { id: 'w1', when: (_s, c) => c.seconds >= 90, then: (s, c) => { const tc = townCenter(s, ME); if (tc) raid(s, 1, ['hoplite', 'hoplite', 'hoplite', 'toxotes', 'toxotes'], tc.x, tc.y, 2, 24); c.say('Batedor', 'Primeira onda à vista!', '🐎'); } },
      { id: 'w2', when: (_s, c) => c.seconds >= 240, then: (s, c) => { const tc = townCenter(s, ME); if (tc) raid(s, 1, ['hoplite', 'hoplite', 'hippeus', 'hippeus', 'toxotes', 'toxotes', 'toxotes'], tc.x, tc.y, 1, 26); c.say('Batedor', 'Cavalaria! Hoplitas na frente!', '🐎'); } },
      { id: 'w3', when: (_s, c) => c.seconds >= 400, then: (s, c) => { const tc = townCenter(s, ME); if (tc) raid(s, 1, ['cyclops', 'hoplite', 'hoplite', 'hoplite', 'hypaspist', 'toxotes', 'toxotes'], tc.x, tc.y, 3, 26); c.say('Jasão', 'Um Ciclope! Deixe-o comigo: heróis causam dano triplo em criaturas míticas.', '🦁'); } },
      { id: 'w4', when: (_s, c) => c.seconds >= 560, then: (s, c) => { const tc = townCenter(s, ME); if (tc) raid(s, 1, ['petrobolos', 'petrobolos', 'hoplite', 'hoplite', 'hoplite', 'hoplite', 'hetairoi', 'hetairoi'], tc.x, tc.y, 2, 28); c.say('Batedor', 'Catapultas! Cavalaria contra as máquinas de cerco!', '🐎'); } },
      { id: 'reinforce', when: (s) => s.scenario!.objectives.survive === 'done', then: (s, c) => { const tc = townCenter(s, ME); if (tc) { spawnGroup(s, ME, ['hypaspist', 'hypaspist', 'hypaspist', 'hypaspist', 'hetairoi', 'hetairoi', 'cretan_archer', 'cretan_archer', 'petrobolos'], tc.x, tc.y + 6); give(s, ME, { food: 500, gold: 500 }); } c.reveal('counter'); c.say('Leônidas', 'Esparta responde ao chamado de Argos. Agora, avante: derrubem o Centro Cívico de Hades!', '🛡️'); } },
    ],
    victory: (s) => s.scenario!.objectives.counter === 'done',
    defeat: (s) => countBuildings(s, ME, 'town_center') === 0 && s.tick > 5 * TICK_RATE,
    // Cronômetro do painel de objetivos enquanto "Resista" estiver pendente (HUD genérico, docs/EDITOR.md §2.3 hud)
    hud: [{ type: 'countdown', seconds: 12 * 60, while: (s) => s.scenario!.objectives.survive === 'pending', label: '' }],
  },
  {
    id: 'm3_portal', title: 'O Portal dos Titãs', subtitle: 'Missão 3 · Corrida', icon: '🌋',
    intro: [
      'Os sacerdotes de Hades ergueram um Portal nas montanhas. Quando ele se abrir, Cronos, o devorador, voltará ao mundo.',
      'Você tem a liberdade de escolher o caminho: destrua o Portal antes que se conclua, ou alcance a Idade dos Titãs e liberte Prometeu para enfrentá-lo.',
    ],
    outro: ['O Portal caiu e o mundo respira. Por enquanto. As guerras dos deuses estão apenas começando... (Fim do prólogo)'],
    config: { seed: 3303, mapSize: 'medium', players: [{ name: 'Argos', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'Culto de Cronos', god: 'hades', isAI: true, difficulty: 'normal', team: 1 }, { name: 'Aliados de Poseidon', god: 'poseidon', isAI: true, difficulty: 'normal', team: 0 }], startingAge: 2, startingResources: { food: 1200, wood: 1000, gold: 800, favor: 80, knowledge: 200 } },
    setup: (state) => {
      const p = state.players[ME]; p.minorGods.push('athena', 'apollo'); p.powers.push({ id: 'restoration', used: false }, { id: 'oracle', used: false });
      grantTech(state, ME, 'civic1'); grantTech(state, ME, 'civic2'); grantTech(state, ME, 'science1');
      const tc = townCenter(state, ME);
      if (tc) { placeNear(state, ME, 'temple', tc.x + 6, tc.y, true); placeNear(state, ME, 'academy', tc.x - 6, tc.y, true); placeNear(state, ME, 'barracks', tc.x, tc.y + 6, true); spawnGroup(state, ME, ['heracles', 'hypaspist', 'hypaspist', 'cretan_archer', 'cretan_archer', 'minotaur'], tc.x, tc.y - 5); }
      const e = state.players[1]; e.age = 3; const bal = M3_BALANCE[state.config.campaignDifficulty ?? 'normal']; e.resources.food = bal.stock; e.resources.wood = bal.stock; e.resources.gold = bal.stock; e.resources.favor = 300; if (e.ai) e.ai.lastAttack = bal.calm * TICK_RATE; e.minorGods.push('ares', 'aphrodite', 'hera'); e.techs.push('civic1', 'civic2', 'civic3', 'military1', 'military2', 'masonry');
      const et = townCenter(state, 1);
      if (et) { placeNear(state, 1, 'fortress', et.x + 8, et.y, true); placeNear(state, 1, 'temple', et.x - 6, et.y, true); placeNear(state, 1, 'barracks', et.x, et.y + 6, true); placeNear(state, 1, 'tower', et.x + 4, et.y - 6, true); placeNear(state, 1, 'tower', et.x - 4, et.y - 6, true); placeNear(state, 1, 'titan_gate', et.x, et.y - 10, false); spawnGroup(state, 1, ['hoplite', 'hoplite', 'hoplite', 'hoplite', 'toxotes', 'toxotes', 'hetairoi', 'hetairoi', 'medusa', 'cerberus', 'villager', 'villager', 'villager'], et.x, et.y - 6); }
      const gate = [...state.buildings.values()].find((b) => b.owner === 1 && b.type === 'titan_gate');
      if (gate) { gate.progress = 0; for (const u of spawnGroup(state, 1, ['villager', 'villager', 'villager'], gate.x, gate.y + gate.h / 2 + 1)) { u.state = 'pray'; u.nodeId = -gate.id; } }
      const a = state.players[2]; a.age = 2;
    },
    objectives: [
      { id: 'gate', text: 'Destrua o Portal dos Titãs do Culto de Cronos antes que se conclua', check: (s) => { const g = [...s.buildings.values()].find((b) => b.owner === 1 && b.type === 'titan_gate'); if (!g) return 'done'; return 'pending'; } },
      { id: 'titan', text: 'Ou: alcance a Idade dos Titãs e liberte Prometeu', optional: true, check: (s) => (count(s, ME, (u) => u.type === 'prometheus') >= 1 ? 'done' : 'pending') },
      // oculto até Cronos surgir (G1: sem a guarda por 'cronus_rises' valeria no segundo 1, pois ainda não há Cronos)
      { id: 'cronus', text: 'Derrote Cronos', hidden: true, check: (s) => { if (!s.scenario!.fired.includes('cronus_rises')) return 'pending'; const c = [...s.units.values()].find((u) => u.owner === 1 && u.type === 'cronus'); return c ? 'pending' : 'done'; } },
    ],
    triggers: [
      { id: 'start', when: (_s, c) => c.seconds >= 1, then: (_s, c) => c.say('Héracles', 'O Portal está ao norte da cidade deles, guardado por torres e uma Fortaleza. Seus cidadãos o constroem lentamente; matá-los atrasa a obra.', '💪') },
      { id: 'gate_progress', repeat: false, when: (s) => { const g = [...s.buildings.values()].find((b) => b.owner === 1 && b.type === 'titan_gate'); return !!g && g.progress > 90; }, then: (_s, c) => c.say('Oráculo de Delfos', 'O Portal está pela metade! Os sacerdotes cantam sem parar. Apresse-se!', '🔮') },
      // O ritual avança M3_RITUAL_RATE (0,125) s de obra por segundo enquanto houver sacerdotes (cidadãos) a até 6 tiles do Portal: ~24 minutos.
      { id: 'ritual', repeat: true, when: (_s, c) => c.seconds > 0, then: (s) => { const g = [...s.buildings.values()].find((b) => b.owner === 1 && b.type === 'titan_gate'); if (!g || g.complete) return; const priests = count(s, 1, (u) => u.type === 'villager' && (u.x - g.x) ** 2 + (u.y - g.y) ** 2 < 36); if (priests > 0) g.progress += M3_RITUAL_RATE; if (g.progress >= 180) { g.hp = g.maxHp; onBuildingComplete(s, g); } } },
      { id: 'priests', repeat: true, when: (_s, c) => c.seconds % 40 === 0 && c.seconds > 0, then: (s) => { const g = [...s.buildings.values()].find((b) => b.owner === 1 && b.type === 'titan_gate'); if (!g || g.complete) return; const priests = count(s, 1, (u) => u.type === 'villager' && (u.x - g.x) ** 2 + (u.y - g.y) ** 2 < 36); if (priests < 3) { const v = spawnGroup(s, 1, ['villager', 'villager'], g.x, g.y + g.h / 2 + 1); for (const u of v) { u.state = 'pray'; u.nodeId = -g.id; } } } },
      { id: 'cronus_rises', when: (s) => count(s, 1, (u) => u.type === 'cronus') >= 1, then: (_s, c) => { c.objective('gate', 'failed'); c.reveal('cronus'); c.say('Zeus', 'Cronos caminha novamente sobre a terra! Só um Titã ou uma nação inteira poderá detê-lo. Perseu tem dano extra contra Titãs.', '⚡'); } },
      { id: 'harass', repeat: true, when: (_s, c) => c.seconds >= 180 && c.seconds % 200 === 0, then: (s) => { const tc = townCenter(s, ME); if (tc) raid(s, 1, ['hetairoi', 'hetairoi', 'medusa', 'hypaspist', 'hypaspist'], tc.x, tc.y, 5, 26); } },
    ],
    victory: (s) => (s.scenario!.objectives.gate === 'done') || (s.scenario!.objectives.cronus === 'done' && s.scenario!.fired.includes('cronus_rises')),
    defeat: (s) => countBuildings(s, ME, 'town_center') === 0 && s.tick > 5 * TICK_RATE,
    // Progresso do ritual (obra do Portal) no painel de objetivos, some quando o Portal se conclui ou cai
    hud: [{ type: 'progress', entity: (s) => { const g = [...s.buildings.values()].find((b) => b.owner === 1 && b.type === 'titan_gate'); return g && !g.complete ? g.progress : -1; }, max: 180, label: '🌋 Ritual do Portal' }],
  },
];

/** @deprecated alias compatível do prólogo em TS; a campanha inteira vem de campaignMissions(). */
export const SCENARIOS = PROLOGUE;

// ---------------------------------------------------------------------------------------------------------------
// Registro da campanha (G0)
// ---------------------------------------------------------------------------------------------------------------

/** Uma missão registrada: ato, id, origem (TS do prólogo ou JSON em missions/) e selo "Prólogo". */
export interface CampaignEntry { act: CampaignAct; id: string; source: 'ts' | 'json'; file?: ScenarioFile; prologue?: boolean }

/**
 * Missões jogáveis, na ordem de desbloqueio. Para registrar uma missão nova: crie missions/<id>.scenario.json (id da §4 de
 * docs/STORY.md, já reservado em RESERVED_SCENARIO_IDS), importe-o aqui e acrescente
 * `{ act, id, source: 'json', file: arquivo as unknown as ScenarioFile }` na posição dela. A conquista da missão nasce do
 * registro (achievements.ts) e tests/missions.test.ts passa a testá-la nas três dificuldades.
 * O m1 em JSON (missions/m1_despertar.scenario.json) fica fora: a versão TS é a oficial (teste de paridade).
 */
export const CAMPAIGN: readonly CampaignEntry[] = [
  { act: 1, id: 'm1_despertar', source: 'ts', prologue: true },
  { act: 1, id: 'm2_cerco', source: 'ts', prologue: true },
  { act: 1, id: 'm3_portal', source: 'ts', prologue: true },
  { act: 1, id: 'm4_caucaso', source: 'json', file: m4 as unknown as ScenarioFile },   // fecha o Ato I (1º mapa fixo)
  { act: 2, id: 'm6_estatua', source: 'json', file: m6 as unknown as ScenarioFile },
  { act: 2, id: 'm7_aquiles', source: 'json', file: m7 as unknown as ScenarioFile },   // caça ao herói (mapa gerado forest 7707)
];

/** Entrada do registro por id (undefined = não é missão oficial registrada). */
export function campaignEntry(id: string): CampaignEntry | undefined { return CAMPAIGN.find((e) => e.id === id); }
export function isCampaignMission(id: string): boolean { return CAMPAIGN.some((e) => e.id === id); }

const compiled = new Map<string, ScenarioDef>();   // `${id}:${idioma}` → ScenarioDef (JSON compilado no idioma atual)

/** Missão do registro por id: TS do prólogo ou JSON compilado (cache por idioma). Lança se o JSON oficial for inválido. */
export function campaignMission(id: string): ScenarioDef | undefined {
  const e = campaignEntry(id); if (!e) return undefined;
  if (e.source === 'ts') return PROLOGUE.find((m) => m.id === id);
  if (!e.file) return undefined;
  const key = `${id}:${getLocale()}`;
  let def = compiled.get(key);
  if (!def) { def = compileScenarioCached(e.file); compiled.set(key, def); }
  return def;
}

/** Todas as missões do registro, na ordem (menu, HUD, "Próxima missão", harness de testes). */
export function campaignMissions(): ScenarioDef[] {
  return CAMPAIGN.map((e) => campaignMission(e.id)).filter((d): d is ScenarioDef => !!d);
}

/** Próxima missão do registro depois de `id` (undefined na última ou fora do registro). */
export function nextCampaignMission(id: string): ScenarioDef | undefined {
  const i = CAMPAIGN.findIndex((e) => e.id === id);
  return i >= 0 && i + 1 < CAMPAIGN.length ? campaignMission(CAMPAIGN[i + 1].id) : undefined;
}

/** Ids oficiais do plano (§4), registrados ou não; e os do prólogo. */
export { CAMPAIGN_PLAN, PROLOGUE_IDS };

/** Dificuldade da campanha nas IAs inimigas: Fácil → fácil; Difícil sobe um degrau (normal→difícil, difícil→muito difícil). */
export function enemyDifficulty(d: Difficulty, c: 'easy' | 'normal' | 'hard'): Difficulty {
  return c === 'easy' ? 'easy' : c === 'hard' ? ({ easy: 'normal', normal: 'hard', hard: 'brutal', brutal: 'brutal' } as Record<Difficulty, Difficulty>)[d] : d;
}

/**
 * Aplica a dificuldade da campanha a uma config: config.campaignDifficulty (raids, spawn scaled, condição difficulty — G3) e
 * as IAs INIMIGAS ajustadas por enemyDifficulty. IAs aliadas do primeiro humano (ex.: Aliados de Poseidon na m3) ficam como
 * estão — deixá-las fáceis no Fácil puniria o jogador.
 */
export function withCampaignDifficulty(config: GameConfig, diff: 'easy' | 'normal' | 'hard'): GameConfig {
  const human = localHumanIndex(config);
  const humanTeam = human >= 0 ? (config.players[human].team ?? human) : -1;
  return { ...config, campaignDifficulty: diff, players: config.players.map((p, i) => (p.isAI && (p.team ?? i) !== humanTeam ? { ...p, difficulty: enemyDifficulty(p.difficulty, diff) } : p)) };
}

/** GameConfig de uma missão oficial (ou da Horda) na dificuldade da campanha (withCampaignDifficulty). */
export function missionConfig(def: ScenarioDef, diff: 'easy' | 'normal' | 'hard'): GameConfig {
  return withCampaignDifficulty({ ...def.config, scenario: def.id }, diff);
}
