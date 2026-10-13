// Tecnologias. effects: lista de efeitos aplicados aos modificadores do jogador.
// Tipos de efeito:
//   { type:'unit', match:{tags:[..]}|{types:[..]}|'all', stat:'hp'|'attack'|'speed'|'range'|'los'|'armor.hack'..., mult?|add? }
//   { type:'building', match:{types:[..]}|'all', stat:'hp'|'attack'|'range'|'los', mult?|add? }
//   { type:'gather', resource:'food'|'wood'|'gold'|'hunt'|'farm'|'all', mult }
//   { type:'player', stat:'territory'|'cityLimit'|'attrition'|'favorRate'|'knowledgeRate'|'researchCost'|'buildSpeed'|'trainSpeed'|'popCap'|'los'|'tradeTax'|'regen', mult?|add? }
//   { type:'cost', match:{tags:[..]}|{types:[..]}|'buildings', mult }

import type { TechDef, Effect, Cost } from '../types';
import { LINES, LINE_ORDER, lineStart, evoTechId } from './lines';
import { UNITS } from './units';

type TechInput = Omit<TechDef, 'id' | 'prereq'> & { prereq?: string[] };
interface LineOpts { cost: (l: number) => Cost; time: (l: number) => number; effects: (l: number) => Effect[]; icon: string; desc: string }

/** Numerais dos níveis das linhas (I–VIII: um nível por Era). */
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] as const;
/** Níveis de cada linha da Biblioteca (= número de Eras; tests/eras.test.ts confere). */
export const LINE_LEVELS = 8;

/** E10: multiplicador do custo de cada nível das linhas da Biblioteca (índice = nível − 1). Os níveis 1–4 são da
 *  campanha e ficam 1 (tests/ai-pace.test.ts confere); o balanceamento das Eras V–VIII mexe nos níveis 5–8. */
export const LINE_LEVEL_COST_MULT: readonly number[] = [1, 1, 1, 1, 1, 1, 1, 1];
const scaleCost = (c: Cost, m: number): Cost => (m === 1 ? c : (Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(((v ?? 0) * m) / 5) * 5])) as Cost));
const line = (key: string, name: string, count: number, opts: LineOpts): Record<string, TechInput> => {
  const out: Record<string, TechInput> = {};
  for (let lvl = 1; lvl <= count; lvl++) {
    out[`${key}${lvl}`] = {
      name: `${name} ${ROMAN[lvl - 1]}`,
      building: 'academy', age: Math.max(0, lvl - 1), line: key, level: lvl,
      prereq: lvl > 1 ? [`${key}${lvl - 1}`] : [],
      cost: scaleCost(opts.cost(lvl), LINE_LEVEL_COST_MULT[lvl - 1] ?? 1), time: opts.time(lvl), effects: opts.effects(lvl), icon: opts.icon, desc: opts.desc,
    };
  }
  return out;
};

/** Efeitos de cada estudo da linha dos cidadãos (E3): o tipo não muda — dezenas de comparações com 'villager' no núcleo. */
const CITIZEN_EVO_EFFECTS: Effect[] = [
  { type: 'unit', match: { types: ['villager'] }, stat: 'hp', mult: 1.1 },
  { type: 'gather', resource: 'food', mult: 1.04 }, { type: 'gather', resource: 'wood', mult: 1.04 },
  { type: 'gather', resource: 'stone', mult: 1.04 }, { type: 'gather', resource: 'gold', mult: 1.04 },
  { type: 'player', stat: 'buildSpeed', mult: 1.05 },
];
/** Estudos de evolução (E3): um por degrau novo de cada linha, na Biblioteca, na Era do degrau, em sequência (prereq = o
 *  estudo anterior da mesma linha). Sem `line` de propósito: não contam no requires.techCount das Eras. */
function evolutions(): Record<string, TechInput> {
  const out: Record<string, TechInput> = {};
  for (const id of LINE_ORDER) {
    const l = LINES[id];
    let prev: string | null = null;
    for (let k = lineStart(l) + 1; k < l.steps.length; k++) {
      const to = l.steps[k];
      if (!to) continue;
      const tid = evoTechId(id, k);
      const citizen = id === 'citizen';
      const keep = !!l.studyNames;   // linha que não troca de tipo (cidadãos, barcos)
      out[tid] = {
        name: keep ? `${l.name}: ${l.studyNames![k] ?? ''}` : `${l.name}: ${UNITS[to].name}`,
        icon: UNITS[to].icon, building: 'academy', age: k,
        cost: citizen ? { knowledge: 40 + 60 * k, food: 40 + 50 * k } : { knowledge: 40 + 60 * k, gold: 40 + 50 * k },
        time: 25 + 8 * k, prereq: prev ? [prev] : [], effects: citizen ? CITIZEN_EVO_EFFECTS : keep ? (l.studyEffects ?? []) : [],
        evolve: { line: id, to },
        desc: citizen
          ? 'Cidadãos +10% de vida; coleta de comida, madeira, pedra e ouro +4%; construção 5% mais rápida.'
          : keep ? (l.studyDesc ?? '')
          : `Treina ${UNITS[to].plural} no lugar do degrau anterior; as unidades da linha que você já tem se transformam (vida proporcional, patente e ordens mantidas).`,
      };
      prev = tid;
    }
  }
  return out;
}

/** E6: tipos que as Bênçãos do Templo fortalecem — criaturas míticas e heróis, nunca os Titãs (docs/eras/E6, D13). */
export const BLESSED_TYPES: string[] = Object.values(UNITS).filter((u) => (u.tags.includes('myth') || u.tags.includes('hero')) && !u.tags.includes('titan')).map((u) => u.id);
/** E6: Bênçãos do Olimpo II–VIII (uma por Era, em sequência; Templo). Só valem com eraMythOn (src/core/sim/restrictions.ts). */
const blessings = (): Record<string, TechInput> => {
  const out: Record<string, TechInput> = {};
  const m = { types: BLESSED_TYPES };
  for (let n = 2; n <= 8; n++) {
    const k = n - 1;
    out[`blessing${n}`] = {
      name: `Bênção do Olimpo ${ROMAN[n - 1]}`, icon: '🕯️', building: 'temple', age: k, blessing: true,
      cost: { gold: 80 + 60 * k, favor: 20 + 10 * k }, time: 30 + 6 * k, prereq: n > 2 ? [`blessing${n - 1}`] : [],
      effects: [
        { type: 'unit', match: m, stat: 'hp', mult: 1.2 }, { type: 'unit', match: m, stat: 'attack', mult: 1.2 },
        { type: 'unit', match: m, stat: 'armor.hack', add: 0.02 }, { type: 'unit', match: m, stat: 'armor.pierce', add: 0.02 }, { type: 'unit', match: m, stat: 'armor.crush', add: 0.02 },
      ],
      desc: 'Criaturas míticas e heróis +20% de vida e de ataque e +0,02 de armadura (os Titãs não recebem).',
    };
  }
  return out;
};

const RAW: Record<string, TechInput> = {
  // ---------- Linhas da Academia (estilo Biblioteca do Rise of Nations) ----------
  ...line('civic', 'Civismo', LINE_LEVELS, {
    icon: '🏛️', cost: (l) => ({ knowledge: 60 + 90 * l, gold: 40 + 60 * l }), time: (l) => 30 + 12 * l,
    effects: () => [
      { type: 'player', stat: 'territory', add: 2 }, { type: 'player', stat: 'cityLimit', add: 1 },
      { type: 'player', stat: 'attrition', add: 0.25 }, { type: 'player', stat: 'popCap', add: 10 },
    ],
    desc: 'Fronteiras +2, +1 Centro Cívico permitido, atrito +0.25/s, população +10.',
  }),
  ...line('commerce', 'Comércio', LINE_LEVELS, {
    icon: '⚖️', cost: (l) => ({ knowledge: 50 + 70 * l, gold: 30 + 50 * l }), time: (l) => 30 + 10 * l,
    effects: () => [{ type: 'gather', resource: 'all', mult: 1.08 }, { type: 'player', stat: 'tradeTax', mult: 0.85 }],
    desc: 'Coleta de todos os recursos +8% e taxas do Mercado menores.',
  }),
  ...line('military', 'Militar', LINE_LEVELS, {
    icon: '⚔️', cost: (l) => ({ knowledge: 60 + 80 * l, gold: 60 + 70 * l }), time: (l) => 30 + 12 * l,
    effects: () => [
      { type: 'unit', match: { tags: ['military'] }, stat: 'hp', mult: 1.06 },
      { type: 'unit', match: { tags: ['military'] }, stat: 'attack', mult: 1.06 },
    ],
    desc: 'Todas as unidades militares +6% de vida e ataque.',
  }),
  ...line('science', 'Ciência', LINE_LEVELS, {
    icon: '🔬', cost: (l) => ({ knowledge: 40 + 60 * l, gold: 40 + 60 * l }), time: (l) => 25 + 10 * l,
    effects: () => [
      { type: 'player', stat: 'knowledgeRate', mult: 1.15 }, { type: 'player', stat: 'researchCost', mult: 0.92 },
      { type: 'player', stat: 'los', add: 1 },
    ],
    desc: 'Conhecimento +15%, pesquisas 8% mais baratas e visão +1.',
  }),
  masonry: {
    name: 'Alvenaria', icon: '🧱', building: 'academy', age: 1, cost: { wood: 100, stone: 150, knowledge: 100 }, time: 40,
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
    name: 'Cidades Fortificadas', icon: '🏯', building: 'town_center', age: 1, cost: { wood: 100, stone: 150, gold: 100 }, time: 45,
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
  stone_wedges: { name: 'Cunhas de Bronze', icon: '🪨', building: 'quarry', age: 0, cost: { food: 80, wood: 60 }, time: 30, effects: [{ type: 'gather', resource: 'stone', mult: 1.15 }], desc: 'Coleta de pedra +15%.' },
  stone_saws: { name: 'Serra de Areia', icon: '🪚', building: 'quarry', age: 1, cost: { food: 160, wood: 120 }, time: 40, prereq: ['stone_wedges'], effects: [{ type: 'gather', resource: 'stone', mult: 1.15 }], desc: 'Coleta de pedra +15%.' },
  stone_cranes: { name: 'Guindaste Trispastos', icon: '🏗️', building: 'quarry', age: 2, cost: { food: 300, wood: 200, gold: 100 }, time: 50, prereq: ['stone_saws'], effects: [{ type: 'gather', resource: 'stone', mult: 1.15 }, { type: 'player', stat: 'buildSpeed', mult: 1.1 }], desc: 'Coleta de pedra +15% e construção 10% mais rápida.' },
  bitumen_jars: { name: 'Jarros de Betume', icon: '🏺', building: 'naphtha_well', age: 3, cost: { food: 200, wood: 150 }, time: 40, effects: [{ type: 'gather', resource: 'oil', mult: 1.15 }], desc: 'Coleta de petróleo +15%.' },
  distillation: { name: 'Destilação', icon: '⚗️', building: 'refinery', age: 6, cost: { wood: 300, gold: 300, knowledge: 100 }, time: 50, effects: [{ type: 'gather', resource: 'oil', mult: 1.2 }], desc: 'Coleta e extração de petróleo +20%.' },
  cracking: { name: 'Craqueamento', icon: '⚗️', building: 'refinery', age: 7, cost: { gold: 500, knowledge: 200 }, time: 60, prereq: ['distillation'], effects: [{ type: 'gather', resource: 'oil', mult: 1.25 }], desc: 'Coleta e extração de petróleo +25%.' },
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
  // ---------- Estaleiro (E4): fora da Biblioteca (§2: as de economia ficam fora) ----------
  fishing_nets: { name: 'Redes de Pesca', icon: '🌊', building: 'shipyard', age: 0, cost: { wood: 100, gold: 50 }, time: 30, effects: [{ type: 'gather', resource: 'fish', mult: 1.2 }], desc: 'Barcos de pesca coletam 20% mais rápido.' },
  caulking: { name: 'Calafeto com Piche', icon: '🌊', building: 'shipyard', age: 1, cost: { wood: 150, gold: 100 }, time: 40, effects: [{ type: 'unit', match: { tags: ['ship'] }, stat: 'hp', mult: 1.15 }], desc: 'Navios +15% de vida.' },
  bronze_rams: { name: 'Esporões de Bronze', icon: '🌊', building: 'shipyard', age: 2, cost: { wood: 200, gold: 150 }, time: 50, prereq: ['caulking'], effects: [{ type: 'unit', match: { tags: ['ship'] }, stat: 'attack', mult: 1.15 }], desc: 'Navios de guerra +15% de ataque.' },
  navigation: { name: 'Navegação Astronômica', icon: '🌊', building: 'shipyard', age: 4, cost: { wood: 250, gold: 200 }, time: 60, prereq: ['bronze_rams'], effects: [{ type: 'unit', match: { tags: ['ship'] }, stat: 'speed', mult: 1.1 }, { type: 'unit', match: { tags: ['ship'] }, stat: 'los', add: 2 }], desc: 'Navios 10% mais rápidos e +2 de visão.' },
  // ---------- Evolução das linhas de unidade (E3) ----------
  ...evolutions(),
  // ---------- Deuses menores das Eras V–VII (E6) ----------
  rustic_flute: { name: 'Flauta Silvestre', icon: '🦌', building: 'temple', age: 4, god: 'pan', cost: { food: 400, favor: 45 }, time: 55, effects: [{ type: 'gather', resource: 'hunt', mult: 1.3 }, { type: 'gather', resource: 'farm', mult: 1.15 }], desc: 'Caça +30% e fazendas +15%.' },
  wild_hooves: { name: 'Cascos Selvagens', icon: '🦌', building: 'temple', age: 4, god: 'pan', cost: { gold: 400, favor: 45 }, time: 55, effects: [{ type: 'unit', match: { tags: ['myth'] }, stat: 'speed', mult: 1.15 }, { type: 'unit', match: { types: ['satyr'] }, stat: 'attack', mult: 1.2 }], desc: 'Criaturas míticas +15% de velocidade e Sátiros +20% de ataque.' },
  torch_of_hecate: { name: 'Tocha de Hécate', icon: '🌙', building: 'temple', age: 4, god: 'hecate', cost: { gold: 400, favor: 45 }, time: 55, effects: [{ type: 'player', stat: 'los', add: 3 }, { type: 'unit', match: { tags: ['myth'] }, stat: 'attack', mult: 1.1 }], desc: 'Visão +3 para tudo e criaturas míticas +10% de ataque.' },
  crossroads_rites: { name: 'Ritos da Encruzilhada', icon: '🌙', building: 'temple', age: 4, god: 'hecate', cost: { gold: 450, favor: 50 }, time: 60, effects: [{ type: 'player', stat: 'favorRate', mult: 1.25 }, { type: 'unit', match: { types: ['empusa'] }, stat: 'hp', mult: 1.2 }], desc: 'Favor +25% e Empusas +20% de vida.' },
  pomegranate: { name: 'Romã do Submundo', icon: '💚', building: 'temple', age: 4, god: 'persephone', cost: { food: 400, favor: 45 }, time: 55, effects: [{ type: 'unit', match: { types: ['shade'] }, stat: 'hp', mult: 2 }, { type: 'unit', match: { types: ['shade'] }, stat: 'attack', mult: 2 }, { type: 'player', stat: 'favorRate', mult: 1.15 }], desc: 'Sombras com o dobro de vida e de ataque; Favor +15%.' },
  eternal_spring: { name: 'Primavera Eterna', icon: '💚', building: 'temple', age: 4, god: 'persephone', cost: { food: 450, favor: 50 }, time: 60, effects: [{ type: 'gather', resource: 'farm', mult: 1.25 }, { type: 'player', stat: 'regen', add: 0.5 }], desc: 'Fazendas +25% e unidades regeneram 0,5 de vida/s.' },
  bag_of_winds: { name: 'Odre dos Ventos', icon: '🌬️', building: 'temple', age: 5, god: 'aeolus', cost: { wood: 450, favor: 50 }, time: 60, effects: [{ type: 'unit', match: { tags: ['ship'] }, stat: 'speed', mult: 1.2 }, { type: 'unit', match: { tags: ['flying'] }, stat: 'speed', mult: 1.15 }], desc: 'Navios +20% e voadoras +15% de velocidade.' },
  storm_lord: { name: 'Senhor das Tempestades', icon: '🌬️', building: 'temple', age: 5, god: 'aeolus', cost: { gold: 450, favor: 50 }, time: 60, effects: [{ type: 'unit', match: { tags: ['flying'] }, stat: 'hp', mult: 1.2 }, { type: 'unit', match: { tags: ['flying'] }, stat: 'attack', mult: 1.2 }], desc: 'Criaturas voadoras +20% de vida e de ataque.' },
  conch_horn: { name: 'Concha de Tritão', icon: '🔱', building: 'temple', age: 5, god: 'triton', cost: { gold: 450, favor: 50 }, time: 60, effects: [{ type: 'unit', match: { tags: ['ship'] }, stat: 'attack', mult: 1.15 }, { type: 'unit', match: { types: ['hippocampus'] }, stat: 'hp', mult: 1.2 }], desc: 'Navios +15% de ataque e Hipocampos +20% de vida.' },
  tidal_lore: { name: 'Saber das Marés', icon: '🔱', building: 'temple', age: 5, god: 'triton', cost: { wood: 450, favor: 50 }, time: 60, effects: [{ type: 'gather', resource: 'fish', mult: 1.25 }, { type: 'cost', match: { tags: ['ship'] }, mult: 0.9 }], desc: 'Pesca +25% e navios 10% mais baratos.' },
  golden_harvest: { name: 'Colheita Dourada', icon: '🌾', building: 'temple', age: 5, god: 'demeter', cost: { food: 450, favor: 50 }, time: 60, effects: [{ type: 'gather', resource: 'food', mult: 1.15 }, { type: 'gather', resource: 'farm', mult: 1.2 }], desc: 'Comida +15% e fazendas +20%.' },
  eleusinian_mysteries: { name: 'Mistérios de Elêusis', icon: '🌾', building: 'temple', age: 5, god: 'demeter', cost: { gold: 450, favor: 50 }, time: 60, effects: [{ type: 'player', stat: 'popCap', add: 20 }, { type: 'unit', match: { types: ['villager'] }, stat: 'hp', mult: 1.2 }], desc: 'População +20 e cidadãos +20% de vida.' },
  solar_fire: { name: 'Fogo Solar', icon: '☀️', building: 'temple', age: 6, god: 'helios', cost: { gold: 500, favor: 55 }, time: 65, effects: [{ type: 'unit', match: { tags: ['fire'] }, stat: 'attack', mult: 1.2 }, { type: 'unit', match: { types: ['phoenix'] }, stat: 'hp', mult: 1.2 }], desc: 'Unidades de fogo +20% de ataque e Fênix +20% de vida.' },
  all_seeing_sun: { name: 'Sol que Tudo Vê', icon: '☀️', building: 'temple', age: 6, god: 'helios', cost: { gold: 500, favor: 55 }, time: 65, effects: [{ type: 'player', stat: 'los', add: 3 }, { type: 'building', match: { types: ['tower', 'fortress'] }, stat: 'range', add: 1 }], desc: 'Visão +3; torres e fortalezas +1 de alcance.' },
  laurels_of_victory: { name: 'Louros da Vitória', icon: '👑', building: 'temple', age: 6, god: 'nike', cost: { food: 500, favor: 55 }, time: 65, effects: [{ type: 'unit', match: { tags: ['military'] }, stat: 'attack', mult: 1.1 }], desc: 'Militares +10% de ataque.' },
  golden_wings: { name: 'Asas Douradas', icon: '👑', building: 'temple', age: 6, god: 'nike', cost: { gold: 500, favor: 55 }, time: 65, effects: [{ type: 'unit', match: { types: ['griffin'] }, stat: 'hp', mult: 1.2 }, { type: 'unit', match: { tags: ['cavalry'] }, stat: 'speed', mult: 1.1 }], desc: 'Grifos +20% de vida e cavalaria +10% de velocidade.' },
  balance_of_fate: { name: 'Balança do Destino', icon: '🗡️', building: 'temple', age: 6, god: 'nemesis', cost: { gold: 500, favor: 55 }, time: 65, effects: [{ type: 'unit', match: { tags: ['military'] }, stat: 'hp', mult: 1.1 }], desc: 'Militares +10% de vida.' },
  wrath_of_nemesis: { name: 'Ira de Nêmesis', icon: '🗡️', building: 'temple', age: 6, god: 'nemesis', cost: { gold: 500, favor: 55 }, time: 65, effects: [{ type: 'unit', match: { types: ['erinys'] }, stat: 'attack', mult: 1.25 }, { type: 'unit', match: { tags: ['hero'] }, stat: 'attack', mult: 1.15 }], desc: 'Erínias +25% de ataque e heróis +15% de ataque.' },
  ...blessings(),
};
export const TECHS: Record<string, TechDef> = {};
for (const [id, t] of Object.entries(RAW)) TECHS[id] = { ...t, id, prereq: t.prereq ?? [] };
/** E6: ids das Bênçãos do Templo. */
export const BLESSING_IDS: string[] = Object.keys(TECHS).filter((id) => TECHS[id].blessing);

export const ACADEMY_LINES: string[] = ['civic', 'commerce', 'military', 'science'];
