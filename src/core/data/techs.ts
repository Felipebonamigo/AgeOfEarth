// Tecnologias. effects: lista de efeitos aplicados aos modificadores do jogador.
// Tipos de efeito:
//   { type:'unit', match:{tags:[..]}|{types:[..]}|'all', stat:'hp'|'attack'|'speed'|'range'|'los'|'armor.hack'..., mult?|add? }
//   { type:'building', match:{types:[..]}|'all', stat:'hp'|'attack'|'range'|'los', mult?|add? }
//   { type:'gather', resource:'food'|'wood'|'gold'|'hunt'|'farm'|'all', mult }
//   { type:'player', stat:'territory'|'cityLimit'|'attrition'|'favorRate'|'knowledgeRate'|'researchCost'|'buildSpeed'|'trainSpeed'|'popCap'|'los'|'tradeTax'|'regen', mult?|add? }
//   { type:'cost', match:{tags:[..]}|{types:[..]}|'buildings', mult }

import type { TechDef, Effect, Cost } from '../types';

type TechInput = Omit<TechDef, 'id' | 'prereq'> & { prereq?: string[] };
interface LineOpts { cost: (l: number) => Cost; time: (l: number) => number; effects: (l: number) => Effect[]; icon: string; desc: string }

const line = (key: string, name: string, count: number, opts: LineOpts): Record<string, TechInput> => {
  const out: Record<string, TechInput> = {};
  for (let lvl = 1; lvl <= count; lvl++) {
    out[`${key}${lvl}`] = {
      name: `${name} ${['I', 'II', 'III', 'IV', 'V'][lvl - 1]}`,
      building: 'academy', age: Math.max(0, lvl - 1), line: key, level: lvl,
      prereq: lvl > 1 ? [`${key}${lvl - 1}`] : [],
      cost: opts.cost(lvl), time: opts.time(lvl), effects: opts.effects(lvl), icon: opts.icon, desc: opts.desc,
    };
  }
  return out;
};

const RAW: Record<string, TechInput> = {
  // ---------- Linhas da Academia (estilo Biblioteca do Rise of Nations) ----------
  ...line('civic', 'Civismo', 5, {
    icon: '🏛️', cost: (l) => ({ knowledge: 60 + 90 * l, gold: 40 + 60 * l }), time: (l) => 30 + 12 * l,
    effects: () => [
      { type: 'player', stat: 'territory', add: 2 }, { type: 'player', stat: 'cityLimit', add: 1 },
      { type: 'player', stat: 'attrition', add: 0.25 }, { type: 'player', stat: 'popCap', add: 10 },
    ],
    desc: 'Fronteiras +2, +1 Centro Cívico permitido, atrito +0.25/s, população +10.',
  }),
  ...line('commerce', 'Comércio', 5, {
    icon: '⚖️', cost: (l) => ({ knowledge: 50 + 70 * l, gold: 30 + 50 * l }), time: (l) => 30 + 10 * l,
    effects: () => [{ type: 'gather', resource: 'all', mult: 1.08 }, { type: 'player', stat: 'tradeTax', mult: 0.85 }],
    desc: 'Coleta de todos os recursos +8% e taxas do Mercado menores.',
  }),
  ...line('military', 'Militar', 5, {
    icon: '⚔️', cost: (l) => ({ knowledge: 60 + 80 * l, gold: 60 + 70 * l }), time: (l) => 30 + 12 * l,
    effects: () => [
      { type: 'unit', match: { tags: ['military'] }, stat: 'hp', mult: 1.06 },
      { type: 'unit', match: { tags: ['military'] }, stat: 'attack', mult: 1.06 },
    ],
    desc: 'Todas as unidades militares +6% de vida e ataque.',
  }),
  ...line('science', 'Ciência', 5, {
    icon: '🔬', cost: (l) => ({ knowledge: 40 + 60 * l, gold: 40 + 60 * l }), time: (l) => 25 + 10 * l,
    effects: () => [
      { type: 'player', stat: 'knowledgeRate', mult: 1.15 }, { type: 'player', stat: 'researchCost', mult: 0.92 },
      { type: 'player', stat: 'los', add: 1 },
    ],
    desc: 'Conhecimento +15%, pesquisas 8% mais baratas e visão +1.',
  }),
  masonry: {
    name: 'Alvenaria', icon: '🧱', building: 'academy', age: 1, cost: { wood: 200, knowledge: 100 }, time: 40,
    effects: [{ type: 'building', match: 'all', stat: 'hp', mult: 1.2 }], desc: 'Todos os edifícios +20% de vida.',
  },
  ballista_towers: {
    name: 'Torres de Balista', icon: '🗼', building: 'academy', age: 2, cost: { wood: 250, gold: 150, knowledge: 150 }, time: 50, prereq: ['masonry'],
    effects: [{ type: 'building', match: { types: ['tower', 'fortress', 'town_center'] }, stat: 'attack', mult: 1.5 }, { type: 'building', match: { types: ['tower', 'fortress'] }, stat: 'range', add: 1 }],
    desc: 'Torres, fortalezas e centros cívicos +50% de ataque; torres e fortalezas +1 alcance.',
  },
  logistics: {
    name: 'Logística', icon: '🎒', building: 'academy', age: 2, cost: { food: 200, knowledge: 150 }, time: 45,
    effects: [{ type: 'player', stat: 'attritionResist', add: 0.5 }, { type: 'player', stat: 'trainSpeed', mult: 1.15 }],
    desc: 'Suas tropas sofrem 50% menos atrito em território inimigo e treinam 15% mais rápido.',
  },

  // ---------- Centro Cívico ----------
  wheel: {
    name: 'Roda', icon: '☸️', building: 'town_center', age: 0, cost: { wood: 80, food: 60 }, time: 30,
    effects: [{ type: 'unit', match: { types: ['villager'] }, stat: 'speed', mult: 1.15 }], desc: 'Cidadãos 15% mais rápidos.',
  },
  hunting_dogs: {
    name: 'Cães de Caça', icon: '🐕', building: 'town_center', age: 0, cost: { food: 90 }, time: 25,
    effects: [{ type: 'gather', resource: 'hunt', mult: 1.25 }], desc: 'Caça 25% mais rápida.',
  },
  fortified_towns: {
    name: 'Cidades Fortificadas', icon: '🏯', building: 'town_center', age: 1, cost: { wood: 200, gold: 100 }, time: 45,
    effects: [{ type: 'building', match: { types: ['town_center'] }, stat: 'hp', mult: 1.3 }, { type: 'building', match: { types: ['town_center'] }, stat: 'attack', mult: 1.5 }],
    desc: 'Centros Cívicos +30% de vida e +50% de ataque.',
  },
  census: {
    name: 'Censo', icon: '📋', building: 'town_center', age: 1, cost: { food: 150, gold: 100 }, time: 40,
    effects: [{ type: 'player', stat: 'popCap', add: 20 }], desc: 'População máxima +20.',
  },

  // ---------- Economia ----------
  harvest1: { name: 'Colheita I', icon: '🌾', building: 'granary', age: 0, cost: { wood: 80, food: 60 }, time: 30, effects: [{ type: 'gather', resource: 'food', mult: 1.15 }], desc: 'Coleta de comida +15%.' },
  harvest2: { name: 'Colheita II', icon: '🌾', building: 'granary', age: 1, cost: { wood: 160, food: 120 }, time: 40, prereq: ['harvest1'], effects: [{ type: 'gather', resource: 'food', mult: 1.15 }], desc: 'Coleta de comida +15%.' },
  harvest3: { name: 'Colheita III', icon: '🌾', building: 'granary', age: 2, cost: { wood: 300, food: 250, gold: 100 }, time: 50, prereq: ['harvest2'], effects: [{ type: 'gather', resource: 'food', mult: 1.15 }], desc: 'Coleta de comida +15%.' },
  irrigation: { name: 'Irrigação', icon: '💧', building: 'granary', age: 1, cost: { wood: 150, gold: 80 }, time: 40, effects: [{ type: 'gather', resource: 'farm', mult: 1.3 }], desc: 'Fazendas rendem 30% mais.' },
  axes1: { name: 'Machados de Bronze', icon: '🪓', building: 'lumber_camp', age: 0, cost: { food: 80, wood: 40 }, time: 30, effects: [{ type: 'gather', resource: 'wood', mult: 1.15 }], desc: 'Corte de madeira +15%.' },
  axes2: { name: 'Machados de Ferro', icon: '🪓', building: 'lumber_camp', age: 1, cost: { food: 160, gold: 80 }, time: 40, prereq: ['axes1'], effects: [{ type: 'gather', resource: 'wood', mult: 1.15 }], desc: 'Corte de madeira +15%.' },
  axes3: { name: 'Serras', icon: '🪚', building: 'lumber_camp', age: 2, cost: { food: 300, gold: 150 }, time: 50, prereq: ['axes2'], effects: [{ type: 'gather', resource: 'wood', mult: 1.15 }], desc: 'Corte de madeira +15%.' },
  picks1: { name: 'Picaretas', icon: '⛏️', building: 'mine', age: 0, cost: { food: 80, wood: 60 }, time: 30, effects: [{ type: 'gather', resource: 'gold', mult: 1.15 }], desc: 'Mineração +15%.' },
  picks2: { name: 'Galerias', icon: '⛏️', building: 'mine', age: 1, cost: { food: 160, wood: 120 }, time: 40, prereq: ['picks1'], effects: [{ type: 'gather', resource: 'gold', mult: 1.15 }], desc: 'Mineração +15%.' },
  picks3: { name: 'Fundição', icon: '🔥', building: 'mine', age: 2, cost: { food: 300, wood: 200 }, time: 50, prereq: ['picks2'], effects: [{ type: 'gather', resource: 'gold', mult: 1.15 }], desc: 'Mineração +15%.' },
  coinage: { name: 'Cunhagem', icon: '🪙', building: 'market', age: 1, cost: { gold: 150, wood: 100 }, time: 40, effects: [{ type: 'player', stat: 'tradeTax', mult: 0.7 }], desc: 'Taxas do Mercado 30% menores.' },

  // ---------- Templo ----------
  oracles: { name: 'Oráculos', icon: '🔮', building: 'temple', age: 0, cost: { gold: 100, food: 100 }, time: 35, effects: [{ type: 'player', stat: 'favorRate', mult: 1.2 }], desc: 'Geração de Favor +20%.' },
  sacred_rites: { name: 'Ritos Sagrados', icon: '🕯️', building: 'temple', age: 2, cost: { gold: 250, favor: 30 }, time: 50, prereq: ['oracles'], effects: [{ type: 'player', stat: 'favorRate', mult: 1.25 }], desc: 'Geração de Favor +25%.' },
  mythic_blood: { name: 'Sangue Mítico', icon: '🩸', building: 'temple', age: 2, cost: { food: 250, favor: 30 }, time: 45, effects: [{ type: 'unit', match: { tags: ['myth'] }, stat: 'hp', mult: 1.15 }], desc: 'Criaturas míticas +15% de vida.' },
  divine_arms: { name: 'Armas Divinas', icon: '🗡️', building: 'temple', age: 2, cost: { gold: 250, favor: 30 }, time: 45, effects: [{ type: 'unit', match: { tags: ['hero'] }, stat: 'attack', mult: 1.25 }, { type: 'unit', match: { tags: ['hero'] }, stat: 'hp', mult: 1.15 }], desc: 'Heróis +25% de ataque e +15% de vida.' },

  // ---------- Quartel / Estábulo / Cerco ----------
  phalanx: { name: 'Falange', icon: '🛡️', building: 'barracks', age: 1, cost: { food: 150, gold: 80 }, time: 40, effects: [{ type: 'unit', match: { tags: ['infantry'] }, stat: 'hp', mult: 1.15 }], desc: 'Infantaria +15% de vida.' },
  bronze_armor: { name: 'Armadura de Bronze', icon: '🥉', building: 'barracks', age: 1, cost: { food: 120, gold: 120 }, time: 40, effects: [{ type: 'unit', match: { tags: ['infantry', 'archer', 'skirmisher'] }, stat: 'armor.hack', add: 0.1 }, { type: 'unit', match: { tags: ['infantry', 'archer', 'skirmisher'] }, stat: 'armor.pierce', add: 0.1 }], desc: 'Infantaria e arqueiros +10% de armadura.' },
  iron_weapons: { name: 'Armas de Ferro', icon: '⚔️', building: 'barracks', age: 2, cost: { food: 200, gold: 200 }, time: 50, prereq: ['bronze_armor'], effects: [{ type: 'unit', match: { tags: ['infantry'] }, stat: 'attack', mult: 1.15 }], desc: 'Infantaria +15% de ataque.' },
  composite_bows: { name: 'Arcos Compostos', icon: '🏹', building: 'barracks', age: 2, cost: { wood: 200, gold: 150 }, time: 50, effects: [{ type: 'unit', match: { tags: ['archer'] }, stat: 'range', add: 1 }, { type: 'unit', match: { tags: ['archer'] }, stat: 'attack', mult: 1.1 }], desc: 'Arqueiros +1 alcance e +10% de ataque.' },
  horse_breeding: { name: 'Criação de Cavalos', icon: '🐎', building: 'stable', age: 1, cost: { food: 150, gold: 100 }, time: 40, effects: [{ type: 'unit', match: { tags: ['cavalry'] }, stat: 'speed', mult: 1.1 }, { type: 'unit', match: { tags: ['cavalry'] }, stat: 'hp', mult: 1.1 }], desc: 'Cavalaria +10% de velocidade e vida.' },
  barding: { name: 'Barda', icon: '🛡️', building: 'stable', age: 2, cost: { food: 200, gold: 200 }, time: 50, effects: [{ type: 'unit', match: { tags: ['cavalry'] }, stat: 'armor.hack', add: 0.1 }, { type: 'unit', match: { tags: ['cavalry'] }, stat: 'armor.pierce', add: 0.1 }], desc: 'Cavalaria +10% de armadura.' },
  ballistics: { name: 'Balística', icon: '📐', building: 'siege_workshop', age: 3, cost: { wood: 300, gold: 300, knowledge: 100 }, time: 60, effects: [{ type: 'unit', match: { tags: ['siege'] }, stat: 'range', add: 1 }, { type: 'unit', match: { tags: ['siege'] }, stat: 'attack', mult: 1.15 }], desc: 'Cerco +1 alcance e +15% de ataque.' },

  // ---------- Tecnologias dos deuses menores (liberadas ao escolher o deus; pesquisadas no Templo) ----------
  aegis: { name: 'Égide', icon: '🛡️', building: 'temple', age: 1, god: 'athena', cost: { gold: 150, favor: 20 }, time: 40, effects: [{ type: 'unit', match: { tags: ['infantry'] }, stat: 'armor.pierce', add: 0.15 }], desc: 'O escudo de Atena: infantaria +15% de armadura contra perfuração.' },
  wisdom: { name: 'Sabedoria de Atena', icon: '🦉', building: 'temple', age: 1, god: 'athena', cost: { gold: 200, favor: 25 }, time: 45, effects: [{ type: 'player', stat: 'knowledgeRate', mult: 1.3 }], desc: 'Conhecimento +30%.' },
  winged_sandals: { name: 'Sandálias Aladas', icon: '👟', building: 'temple', age: 1, god: 'hermes', cost: { gold: 150, favor: 20 }, time: 40, effects: [{ type: 'unit', match: { tags: ['cavalry'] }, stat: 'speed', mult: 1.15 }, { type: 'unit', match: { types: ['villager'] }, stat: 'speed', mult: 1.1 }], desc: 'Cavalaria +15% e cidadãos +10% de velocidade.' },
  caduceus: { name: 'Caduceu', icon: '⚕️', building: 'temple', age: 1, god: 'hermes', cost: { gold: 150, favor: 20 }, time: 40, effects: [{ type: 'player', stat: 'tradeTax', mult: 0.6 }, { type: 'player', stat: 'regen', add: 0.5 }], desc: 'Mercado muito mais lucrativo e unidades regeneram 0,5 de vida/s.' },
  fury: { name: 'Fúria de Ares', icon: '😡', building: 'temple', age: 1, god: 'ares', cost: { food: 200, favor: 25 }, time: 40, effects: [{ type: 'unit', match: { tags: ['infantry'] }, stat: 'attack', mult: 1.2 }], desc: 'Infantaria +20% de ataque.' },
  war_drums: { name: 'Tambores de Guerra', icon: '🥁', building: 'temple', age: 1, god: 'ares', cost: { gold: 200, favor: 25 }, time: 40, effects: [{ type: 'player', stat: 'trainSpeed', mult: 1.25 }], desc: 'Unidades treinam 25% mais rápido.' },
  delphi: { name: 'Oráculo de Delfos', icon: '🔮', building: 'temple', age: 2, god: 'apollo', cost: { gold: 250, favor: 30 }, time: 45, effects: [{ type: 'player', stat: 'favorRate', mult: 1.3 }, { type: 'player', stat: 'los', add: 2 }], desc: 'Favor +30% e visão +2 para tudo.' },
  golden_bow: { name: 'Arco de Ouro', icon: '🏹', building: 'temple', age: 2, god: 'apollo', cost: { gold: 250, favor: 30 }, time: 45, effects: [{ type: 'unit', match: { tags: ['archer'] }, stat: 'range', add: 1 }, { type: 'unit', match: { tags: ['archer'] }, stat: 'attack', mult: 1.15 }], desc: 'Arqueiros +1 alcance e +15% de ataque.' },
  bacchanal: { name: 'Bacanal', icon: '🍇', building: 'temple', age: 2, god: 'dionysus', cost: { food: 250, favor: 30 }, time: 45, effects: [{ type: 'unit', match: { tags: ['military'] }, stat: 'hp', mult: 1.1 }, { type: 'gather', resource: 'farm', mult: 1.2 }], desc: 'Militares +10% de vida e fazendas +20%.' },
  anthropomorphic: { name: 'Sangue de Titã', icon: '🍷', building: 'temple', age: 2, god: 'dionysus', cost: { gold: 250, favor: 35 }, time: 50, effects: [{ type: 'unit', match: { tags: ['hero'] }, stat: 'hp', mult: 1.3 }], desc: 'Heróis +30% de vida.' },
  charm: { name: 'Charme', icon: '💘', building: 'temple', age: 2, god: 'aphrodite', cost: { gold: 200, favor: 25 }, time: 40, effects: [{ type: 'cost', match: { types: ['villager'] }, mult: 0.75 }, { type: 'player', stat: 'buildSpeed', mult: 1.2 }], desc: 'Cidadãos 25% mais baratos e constroem 20% mais rápido.' },
  ambrosia: { name: 'Ambrosia', icon: '🍯', building: 'temple', age: 2, god: 'aphrodite', cost: { food: 300, favor: 35 }, time: 50, effects: [{ type: 'player', stat: 'regen', add: 1 }], desc: 'Todas as unidades regeneram 1 de vida por segundo.' },
  royalty: { name: 'Realeza de Hera', icon: '👑', building: 'temple', age: 3, god: 'hera', cost: { gold: 350, favor: 40 }, time: 55, effects: [{ type: 'player', stat: 'territory', add: 3 }, { type: 'building', match: { types: ['town_center', 'fortress'] }, stat: 'hp', mult: 1.25 }], desc: 'Fronteiras +3; Centros Cívicos e Fortalezas +25% de vida.' },
  crown: { name: 'Coroa Divina', icon: '👑', building: 'temple', age: 3, god: 'hera', cost: { favor: 60, gold: 300 }, time: 55, effects: [{ type: 'unit', match: { tags: ['myth'] }, stat: 'hp', mult: 1.2 }, { type: 'unit', match: { tags: ['myth'] }, stat: 'attack', mult: 1.15 }], desc: 'Criaturas míticas +20% de vida e +15% de ataque.' },
  divine_forge: { name: 'Forja Divina', icon: '⚒️', building: 'temple', age: 3, god: 'hephaestus', cost: { gold: 400, favor: 40 }, time: 55, effects: [{ type: 'unit', match: { tags: ['military'] }, stat: 'armor.hack', add: 0.1 }, { type: 'unit', match: { tags: ['military'] }, stat: 'armor.pierce', add: 0.1 }, { type: 'unit', match: { tags: ['military'] }, stat: 'armor.crush', add: 0.1 }], desc: 'Todas as unidades militares +10% de armadura.' },
  automatons: { name: 'Autômatos', icon: '🤖', building: 'temple', age: 3, god: 'hephaestus', cost: { gold: 350, wood: 300, favor: 30 }, time: 55, effects: [{ type: 'unit', match: { tags: ['siege'] }, stat: 'hp', mult: 1.4 }, { type: 'unit', match: { tags: ['siege'] }, stat: 'attack', mult: 1.2 }], desc: 'Máquinas de cerco +40% de vida e +20% de ataque.' },
  moon_arrows: { name: 'Flechas Lunares', icon: '🌙', building: 'temple', age: 3, god: 'artemis', cost: { wood: 300, favor: 40 }, time: 50, effects: [{ type: 'unit', match: { tags: ['ranged'] }, stat: 'attack', mult: 1.2 }], desc: 'Todas as unidades à distância +20% de ataque.' },
  great_hunt: { name: 'Grande Caçada', icon: '🦌', building: 'temple', age: 3, god: 'artemis', cost: { food: 300, favor: 30 }, time: 45, effects: [{ type: 'gather', resource: 'hunt', mult: 1.5 }, { type: 'gather', resource: 'food', mult: 1.1 }], desc: 'Caça +50% e toda comida +10%.' },
};
export const TECHS: Record<string, TechDef> = {};
for (const [id, t] of Object.entries(RAW)) TECHS[id] = { ...t, id, prereq: t.prereq ?? [] };

export const ACADEMY_LINES: string[] = ['civic', 'commerce', 'military', 'science'];
