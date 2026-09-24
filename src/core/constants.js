// Constantes globais do jogo (compartilhadas entre simulação e interface).
export const TILE = 32;              // pixels por tile no zoom 1
export const TICK_RATE = 20;         // ticks de simulação por segundo
export const DT = 1 / TICK_RATE;     // segundos por tick
export const MAX_PLAYERS = 4;

export const RESOURCES = ['food', 'wood', 'gold', 'knowledge', 'favor'];
export const RESOURCE_NAMES = {
  food: 'Comida', wood: 'Madeira', gold: 'Ouro', knowledge: 'Conhecimento', favor: 'Favor',
};
export const RESOURCE_ICONS = { food: '🍖', wood: '🪵', gold: '🪙', knowledge: '📜', favor: '⚡' };

export const TERRAIN = { GRASS: 0, WATER: 1, MOUNTAIN: 2, SAND: 3, DIRT: 4, DEEP: 5 };

export const PLAYER_COLORS = [
  { name: 'Azul', hex: '#3b82f6', rgb: [59, 130, 246] },
  { name: 'Vermelho', hex: '#ef4444', rgb: [239, 68, 68] },
  { name: 'Verde', hex: '#22c55e', rgb: [34, 197, 94] },
  { name: 'Amarelo', hex: '#eab308', rgb: [234, 179, 8] },
];

export const POP_CAP_MAX = 250;
export const CARRY_CAPACITY = 10;
export const BASE_ATTRITION = 0.4;             // dano por segundo em território inimigo
export const WONDER_VICTORY_SECONDS = 360;     // manter uma maravilha por 6 minutos vence
export const FAVOR_PER_WORSHIPPER = 0.14;      // favor/s do primeiro devoto de um templo
export const FAVOR_DECAY = 0.9;                // cada devoto adicional rende 90% do anterior
export const KNOWLEDGE_PER_SCHOLAR = 0.5;      // conhecimento/s por filósofo
export const MAX_SCHOLARS = 5;
export const FARM_GATHERERS = 1;

export const GATHER_RATES = { berry: 0.95, deer: 1.05, boar: 1.15, lure: 1.3, tree: 0.85, gold: 0.75, farm: 0.8 };
export const NODE_RESOURCE = { berry: 'food', deer: 'food', boar: 'food', lure: 'food', tree: 'wood', gold: 'gold' };
export const NODE_NAMES = {
  berry: 'Arbustos de Frutas', deer: 'Rebanho de Cervos', boar: 'Javalis', lure: 'Pedra de Poseidon', tree: 'Árvore', gold: 'Veio de Ouro',
};

export const MAP_SIZES = {
  small: { w: 80, h: 80, label: 'Pequeno' },
  medium: { w: 112, h: 112, label: 'Médio' },
  large: { w: 144, h: 144, label: 'Grande' },
};

export const DIFFICULTIES = {
  easy: { label: 'Fácil', gather: 0.75, thinkEvery: 2.0, attackDelay: 1.4, armyMult: 0.7 },
  normal: { label: 'Normal', gather: 1.0, thinkEvery: 1.0, attackDelay: 1.0, armyMult: 1.0 },
  hard: { label: 'Difícil', gather: 1.3, thinkEvery: 0.75, attackDelay: 0.8, armyMult: 1.3 },
};

export const STANCES = { aggressive: 'Agressiva', defensive: 'Defensiva', passive: 'Passiva' };
