// Constantes globais compartilhadas entre a simulação (determinística) e a apresentação.
export const TILE = 32;              // pixels por tile no zoom 1
export const TICK_RATE = 20;         // ticks de simulação por segundo
export const DT = 1 / TICK_RATE;     // segundos por tick
export const MAX_PLAYERS = 4;
/**
 * Versão da simulação: sobe quando a mesma semente + os mesmos comandos passam a dar outra partida (replays gravados antes
 * dessincronizariam; saves não, porque guardam o estado inteiro). 2 = correção do viés de posição (IA e buscas relativas ao
 * centro do mapa / ao lado de quem chega, desempates no referencial local, IAs em rodízio por rodada, unidades em ordem
 * alternada, a IA não tira o último acesso de um recurso). 3 = anti-trapaça básico (4.5): comando inválido vira no-op em
 * applyCommand (sanitizeCommand; alvo de ataque/coleta/oração conferido no comando) — partidas de IA e roteiros não mudam (smoke
 * `8783483f` igual), mas um comando que ficou inválido no caminho (nó esgotado antes de a ordem chegar) ou de um cliente
 * modificado dá outro resultado, e todos os clientes da sala precisam validar igual. O relay recusa na sala quem tiver outra versão.
 * 4 = Eras (E1): 8 Eras, Biblioteca (avanço de Era e fila de 5, uma por cidade), linhas × 8, Era inicial/final; a IA
 * avança na Biblioteca. 5 = E2: pedra, petróleo e raros (recursos, nós, gerador, custos, IA).
 */
export const SIM_VERSION = 5;
export const DEFAULT_QUEUE_MAX = 10;   // itens na fila de um edifício sem queueMax

// E2: ordem = a da barra do topo e a de todo literal de recursos (a ida e volta do save mantém a ordem das chaves)
export const RESOURCES = ['food', 'wood', 'stone', 'gold', 'oil', 'knowledge', 'favor'] as const;
export type ResourceType = (typeof RESOURCES)[number];
export const RESOURCE_NAMES: Record<ResourceType, string> = {
  food: 'Comida', wood: 'Madeira', stone: 'Pedra', gold: 'Ouro', oil: 'Petróleo', knowledge: 'Conhecimento', favor: 'Favor',
};
export const RESOURCE_ICONS: Record<ResourceType, string> = { food: '🍖', wood: '🪵', stone: '🪨', gold: '🪙', oil: '🛢️', knowledge: '📜', favor: '⚡' };
/** Era IV (índice 3): a nafta passa a ser coletada, o petróleo aparece na barra do topo e entra no mercado. */
export const OIL_FROM_AGE = 3;
/** Ouro por segundo de um Mercador trabalhando num recurso raro (antes de mods.gather.gold). */
export const RARE_GOLD_RATE = 0.5;
/** A IA mantém no máximo este número de Mercadores. */
export const MERCHANT_MAX_AI = 3;

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

export type NodeType = 'berry' | 'deer' | 'boar' | 'lure' | 'tree' | 'gold'
  | 'limestone' | 'naphtha' | 'oil_field' | 'olive' | 'vineyard' | 'paros_marble' | 'salt' | 'wild_horses' | 'copper' | 'incense';
export const GATHER_RATES: Record<NodeType | 'farm', number> = {
  berry: 1.1, deer: 1.2, boar: 1.3, lure: 1.5, tree: 1.0, gold: 0.9, farm: 0.9,
  limestone: 0.85, naphtha: 0.6, oil_field: 0, olive: 0.5, vineyard: 0.5, paros_marble: 0.5, salt: 0.5, wild_horses: 0.5, copper: 0.5, incense: 0.5,
};
export const NODE_RESOURCE: Record<NodeType, ResourceType> = {
  berry: 'food', deer: 'food', boar: 'food', lure: 'food', tree: 'wood', gold: 'gold',
  limestone: 'stone', naphtha: 'oil', oil_field: 'oil',
  olive: 'gold', vineyard: 'gold', paros_marble: 'gold', salt: 'gold', wild_horses: 'gold', copper: 'gold', incense: 'gold',
};
export const NODE_NAMES: Record<NodeType, string> = {
  berry: 'Arbustos de Frutas', deer: 'Rebanho de Cervos', boar: 'Javalis', lure: 'Pedra de Poseidon', tree: 'Árvore', gold: 'Veio de Ouro',
  limestone: 'Afloramento de Calcário', naphtha: 'Fonte de Nafta', oil_field: 'Jazida de Petróleo', olive: 'Olival', vineyard: 'Vinhedo',
  paros_marble: 'Mármore de Paros', salt: 'Salinas', wild_horses: 'Cavalos Selvagens', copper: 'Minas de Cobre', incense: 'Árvores de Incenso',
};
export const NODE_CAPACITY: Record<NodeType, number> = {
  berry: 3, deer: 4, boar: 3, lure: 6, tree: 2, gold: 4,
  limestone: 4, naphtha: 3, oil_field: 0, olive: 1, vineyard: 1, paros_marble: 1, salt: 1, wild_horses: 1, copper: 1, incense: 1,
};
export const HUNT_TYPES: ReadonlySet<string> = new Set(['deer', 'boar', 'lure']);
// Recursos raros (E2): um Mercador parado no nó rende ouro e dá o bônus do raro (src/core/data/rares.ts). A ordem é a do gerador.
export const RARE_NODES: readonly NodeType[] = ['olive', 'vineyard', 'paros_marble', 'salt', 'wild_horses', 'copper', 'incense'];
export const RARE_SET: ReadonlySet<string> = new Set<string>(RARE_NODES);
/** Nós que só um extrator (BuildingDef.extract) explora. */
export const WELL_NODES: ReadonlySet<string> = new Set<string>(['oil_field']);
/** Nós que nenhum cidadão coleta: fora das buscas por recurso (nearestNode com 'gold', 'oil'…). */
export const NOT_GATHERED: ReadonlySet<string> = new Set<string>([...RARE_NODES, 'oil_field']);

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
  brutal: { label: 'Muito difícil', gather: 1.6, thinkEvery: 0.6, attackDelay: 0.6, armyMult: 1.6 },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;

export const STANCES = { aggressive: 'Agressiva', defensive: 'Defensiva', passive: 'Passiva' } as const;
export type Stance = keyof typeof STANCES;

export const GARRISON_TAGS: ReadonlySet<string> = new Set(['civilian', 'infantry', 'archer', 'skirmisher', 'hero']);
export const GARRISON_HEAL = 1;          // vida/s recuperada dentro de um edifício
// Modos de jogo e tipos de mapa (Fase 5.1)
export type GameMode = 'conquest' | 'deathmatch' | 'regicide' | 'koth';
export const GAME_MODES: GameMode[] = ['conquest', 'deathmatch', 'regicide', 'koth'];
export type MapType = 'continental' | 'mountains' | 'forest' | 'desert' | 'lakes';
export const MAP_TYPES: MapType[] = ['continental', 'mountains', 'forest', 'desert', 'lakes'];
// Veterania: patentes por abates (unidades militares, exceto Titãs); cada patente dá +10% de ataque e de vida
export const VETERAN_KILLS = [3, 8, 15];
export const VETERAN_BONUS = 0.1;
export function rankOf(kills: number): number { let r = 0; for (const k of VETERAN_KILLS) if (kills >= k) r++; return r; }
// Formações de exército (ordens de mover/atacar-mover com 4+ unidades)
export type Formation = 'line' | 'box' | 'column' | 'wedge';
export const FORMATIONS: Formation[] = ['line', 'box', 'column', 'wedge'];
// Relíquias: heróis as recolhem e guardam num Templo; cada uma rende favor por segundo ao dono
export const RELIC_COUNT_BASE = 2;         // + 1 por jogador
export const RELIC_FAVOR_PER_SECOND = 0.35;
export const MAX_FIXED_RELICS = 32;         // G10: posições fixas de relíquias (map.relics) num mapa ou cenário
export const RELIC_SNAP_RADIUS = 6;         // G10: posição fixa sobre tile bloqueado/fora da região dos inícios procura terra alcançável até este raio
export const KOTH_RADIUS = 6;          // raio da colina (tiles)
export const KOTH_SECONDS = 240;       // segundos seguidos segurando a colina sozinho para vencer
export const DEATHMATCH_RESOURCES = { food: 4000, wood: 4000, stone: 2000, gold: 3000, oil: 500, knowledge: 300, favor: 150 } as const;
export const MARKET_BASE_PRICE = 100;   // ouro por 100 unidades
export const MARKET_TRADE_LOT = 100;
export const MARKET_TAX = 0.3;
