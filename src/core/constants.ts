// Constantes globais compartilhadas entre a simulação (determinística) e a apresentação.
export const TILE = 32;              // pixels por tile no zoom 1
export const TICK_RATE = 20;         // ticks de simulação por segundo
export const DT = 1 / TICK_RATE;     // segundos por tick
export const MAX_PLAYERS = 4;

export const RESOURCES = ['food', 'wood', 'gold', 'knowledge', 'favor'] as const;
export type ResourceType = (typeof RESOURCES)[number];
export const RESOURCE_NAMES: Record<ResourceType, string> = {
  food: 'Comida', wood: 'Madeira', gold: 'Ouro', knowledge: 'Conhecimento', favor: 'Favor',
};
export const RESOURCE_ICONS: Record<ResourceType, string> = { food: '🍖', wood: '🪵', gold: '🪙', knowledge: '📜', favor: '⚡' };

export const TERRAIN = { GRASS: 0, WATER: 1, MOUNTAIN: 2, SAND: 3, DIRT: 4, DEEP: 5 } as const;

export const PLAYER_COLORS = [
  { name: 'Azul', hex: '#3b82f6', num: 0x3b82f6 },
  { name: 'Vermelho', hex: '#ef4444', num: 0xef4444 },
  { name: 'Verde', hex: '#22c55e', num: 0x22c55e },
  { name: 'Amarelo', hex: '#eab308', num: 0xeab308 },
];

export const POP_CAP_MAX = 250;
export const CARRY_CAPACITY = 12;
export const BASE_ATTRITION = 0.4;             // dano/s a unidades em território inimigo
export const WONDER_VICTORY_SECONDS = 360;     // manter uma maravilha por 6 minutos vence
export const FAVOR_PER_WORSHIPPER = 0.14;      // favor/s do primeiro devoto de um templo
export const FAVOR_DECAY = 0.9;                // cada devoto adicional rende 90% do anterior
export const KNOWLEDGE_PER_SCHOLAR = 0.5;      // conhecimento/s por filósofo
export const MAX_SCHOLARS = 5;
export const SCHOLAR_COST = { gold: 100 } as const;
export const FARM_GATHERERS = 1;
export const BUILD_RATE = 1;                   // segundos de obra por segundo por construtor
export const REPAIR_RATE = 0.5;                // fração do buildTime por segundo... (usado como hp/s relativo)

export type NodeType = 'berry' | 'deer' | 'boar' | 'lure' | 'tree' | 'gold';
export const GATHER_RATES: Record<NodeType | 'farm', number> = { berry: 1.1, deer: 1.2, boar: 1.3, lure: 1.5, tree: 1.0, gold: 0.9, farm: 0.9 };
export const NODE_RESOURCE: Record<NodeType, ResourceType> = { berry: 'food', deer: 'food', boar: 'food', lure: 'food', tree: 'wood', gold: 'gold' };
export const NODE_NAMES: Record<NodeType, string> = {
  berry: 'Arbustos de Frutas', deer: 'Rebanho de Cervos', boar: 'Javalis', lure: 'Pedra de Poseidon', tree: 'Árvore', gold: 'Veio de Ouro',
};
export const NODE_CAPACITY: Record<NodeType, number> = { berry: 3, deer: 4, boar: 3, lure: 6, tree: 2, gold: 4 };
export const HUNT_TYPES: ReadonlySet<string> = new Set(['deer', 'boar', 'lure']);

export const MAP_SIZES = {
  small: { w: 80, h: 80, label: 'Pequeno' },
  medium: { w: 112, h: 112, label: 'Médio' },
  large: { w: 144, h: 144, label: 'Grande' },
} as const;
export type MapSize = keyof typeof MAP_SIZES;

export const DIFFICULTIES = {
  easy: { label: 'Fácil', gather: 0.75, thinkEvery: 2.0, attackDelay: 1.5, armyMult: 0.7 },
  normal: { label: 'Normal', gather: 1.0, thinkEvery: 1.0, attackDelay: 1.0, armyMult: 1.0 },
  hard: { label: 'Difícil', gather: 1.3, thinkEvery: 0.75, attackDelay: 0.75, armyMult: 1.3 },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;

export const STANCES = { aggressive: 'Agressiva', defensive: 'Defensiva', passive: 'Passiva' } as const;
export type Stance = keyof typeof STANCES;

export const MARKET_BASE_PRICE = 100;   // ouro por 100 unidades
export const MARKET_TRADE_LOT = 100;
export const MARKET_TAX = 0.3;
