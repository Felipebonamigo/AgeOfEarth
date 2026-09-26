// Tipos centrais da simulação. Tudo aqui é serializável (salvar/carregar e replays).
import type { ResourceType, NodeType, Stance, Difficulty, GameMode, MapType, Formation } from './constants';
import type { RNG } from './rng';

export type Cost = Partial<Record<ResourceType, number>>;
export type AttackType = 'hack' | 'pierce' | 'crush' | 'divine';
export interface Armor { hack: number; pierce: number; crush: number }

// ---------------- Definições de conteúdo ----------------
export type UnitClass = 'villager' | 'scout' | 'infantry' | 'archer' | 'skirmisher' | 'cavalry' | 'siege' | 'hero' | 'myth' | 'titan';

export interface UnitDef {
  id: string; name: string; plural: string; icon: string; cls: UnitClass;
  cost: Cost; hp: number; attack: number; attackType: AttackType; armor: Armor;
  range: number; speed: number; los: number; trainTime: number; pop: number; radius: number;
  tags: string[]; bonus: Record<string, number>; building: string | null; age: number;
  hotkey?: string; desc: string;
  ability?: string;                                     // habilidade ativa (heróis), ver data/abilities.ts
  flying?: boolean; immobile?: boolean; unique?: boolean; god?: string; special?: 'heads' | 'petrify';
  splash?: number; canGather?: boolean; canBuild?: boolean;
}

export interface BuildingDef {
  id: string; name: string; icon: string; cost: Cost; hp: number; w: number; h: number; buildTime: number; armor: Armor;
  territory?: number; popCap?: number; los?: number; attack?: number; attackType?: AttackType; range?: number;
  trains?: string[]; dropoff?: ResourceType[]; age: number; limit?: number | 'city' | 'wonder'; hotkey?: string; desc: string;
  passable?: boolean; farm?: boolean; trade?: boolean; worship?: boolean; military?: boolean; scholars?: boolean;
  wall?: boolean; wonder?: boolean; titanGate?: boolean; plenty?: boolean; notBuildable?: boolean;
  garrison?: number;          // capacidade de guarnição
  gate?: boolean;             // portão: bloqueia inimigos, deixa aliados passarem
}

export type EffectMatch = 'all' | 'buildings' | { tags?: string[]; types?: string[] };
export type Effect =
  | { type: 'unit'; match: EffectMatch; stat: string; mult?: number; add?: number }
  | { type: 'building'; match: EffectMatch; stat: string; mult?: number; add?: number }
  | { type: 'gather'; resource: ResourceType | 'hunt' | 'farm' | 'all'; mult: number }
  | { type: 'player'; stat: PlayerStat; mult?: number; add?: number }
  | { type: 'cost'; match: EffectMatch; mult: number };

export type PlayerStat = 'territory' | 'cityLimit' | 'attrition' | 'attritionResist' | 'favorRate' | 'knowledgeRate' | 'researchCost'
  | 'buildSpeed' | 'trainSpeed' | 'popCap' | 'los' | 'tradeTax' | 'regen';

export interface TechDef {
  id: string; name: string; icon: string; building: string; age: number; cost: Cost; time: number;
  prereq: string[]; effects: Effect[]; desc: string; line?: string; level?: number; god?: string;
}

export type PowerTargeting = 'unit' | 'area' | 'building' | 'global' | 'place';
export interface PowerDef { id: string; name: string; icon: string; targeting: PowerTargeting; radius?: number; desc: string }

export interface MinorGodDef { id: string; name: string; title: string; icon: string; age: number; power: string; mythUnit: string; techs: string[]; desc: string }
export interface MajorGodDef {
  id: string; name: string; title: string; icon: string; power: string; bonuses: Effect[]; minorGods: string[][];
  titan: string; mythUnit?: string; desc: string; perks: string[];
}

// ---------------- Estado de jogo ----------------
export type UnitState = 'idle' | 'move' | 'attackMove' | 'attack' | 'gather' | 'return' | 'build' | 'pray' | 'hold' | 'garrison';

export interface Order {
  type: 'move' | 'attackMove' | 'attack' | 'gather' | 'build' | 'pray' | 'repair' | 'garrison';
  x?: number; y?: number; targetId?: number;
}

export interface Unit {
  id: number; kind: 'unit'; type: string; owner: number;
  x: number; y: number; px: number; py: number;      // posição atual e anterior (interpolação visual)
  hp: number; maxHp: number;
  state: UnitState;
  tx: number; ty: number;                              // destino do movimento atual
  path: number[] | null; pathI: number;                // caminho em pares (x,y) de centros de tile
  targetId: number; nodeId: number;                    // alvo de ataque / nó de recurso
  carry: ResourceType | null; carryAmt: number;
  cooldown: number; stance: Stance;
  leashX: number; leashY: number;                      // ponto de retorno ao perseguir
  kills: number; heads: number;
  dead: boolean; spawnTick: number; repathAt: number; stuck: number;
  order: Order | null; queue: Order[];
  attackTick: number;                                  // último tick em que atacou (animação)
  avoidIds: number[]; avoidUntil: number; blockedTicks: number;   // ticks seguidos sem conseguir se aproximar do alvo
  abilityReadyAt: number; buffUntil: number; buffAttack: number; buffSpeed: number; buffHaste: number; buffWard: boolean; chargeUntil: number;   // habilidades/buffs (heróis)               // alvos/nós/entregas inalcançáveis a evitar até o tick
  inside: number;                                      // id do edifício em que está guarnecida (-1 fora)
  resumeNodeId: number;                                // nó/fazenda para retomar a coleta ao sair da guarnição
  orderTick: number;                                   // tick em que o alvo/ordem atual começou (detecção de travamento)
  lastDamageTick: number;
  displayName?: LocalText;                             // G8: nome próprio dado pelo cenário (spawn/place name); o HUD o mostra no idioma atual
  hpFloor?: number;                                    // G9: piso de vida (fração de maxHp) enquanto o cenário o mantiver (hpFloor)
}

export interface QueueItem { kind: 'unit' | 'tech' | 'age' | 'scholar'; id: string; elapsed: number; total: number; paid?: Record<string, number>; uid?: number }  // paid: custo pago ao enfileirar (reembolso exato)

export interface Building {
  id: number; kind: 'building'; type: string; owner: number;
  tx: number; ty: number; w: number; h: number; x: number; y: number;  // tiles e centro em coordenadas de tile
  hp: number; maxHp: number;
  complete: boolean; progress: number;                 // segundos de obra acumulados
  unpaid?: boolean;                                    // obra pré-colocada pelo mapa/cenário: cancelar ou excluir não reembolsa
  queue: QueueItem[]; rallyX: number; rallyY: number;
  scholars: number; disabledUntil: number; wonderStart: number; cooldown: number;
  dead: boolean; builtTick: number; lastDamageTick: number;
  garrison: number[];                                  // ids das unidades guarnecidas
  displayName?: LocalText;                             // G8: nome próprio dado pelo cenário (place name)
  hpFloor?: number;                                    // G9: piso de vida (fração de maxHp)
}

export type Entity = Unit | Building;

export interface ResourceNode { id: number; type: NodeType; x: number; y: number; amount: number; max: number }

export interface GameMap {
  w: number; h: number;
  terrain: Uint8Array;        // TERRAIN.*
  blocked: Uint8Array;        // 1 = intransitável (água, montanha, nó, edifício)
  nodeAt: Int32Array;         // id do nó por tile (-1 nenhum)
  buildingAt: Int32Array;     // id do edifício por tile (-1 nenhum)
  gateTeam: Int8Array;        // time dono de um portão no tile (-1 nenhum): passável só para esse time
  nodes: Map<number, ResourceNode>;
  starts: { x: number; y: number }[];
  decor: Uint8Array;          // variação visual por tile
}

export interface PowerState { id: string; used: boolean }

export interface PlayerMods {
  gather: Record<ResourceType | 'hunt' | 'farm', number>;
  player: Record<PlayerStat, number>;
  unitEffects: Effect[];       // efeitos de tipo 'unit' e 'cost'
  buildingEffects: Effect[];   // efeitos de tipo 'building'
  version: number;
}

export interface PlayerStats { kills: number; losses: number; unitsTrained: number; buildingsBuilt: number; buildingsLost: number; razed: number; gathered: Record<ResourceType, number> }

export interface AIState {
  difficulty: Difficulty; nextThink: number; lastAttack: number; attackTarget: number; waves: number;
  rallyX: number; rallyY: number; defending: number; builderIds: number[]; lastExpand: number; personality: number;
}

export interface Player {
  id: number; name: string; color: number; isAI: boolean; difficulty: Difficulty; team: number;
  god: string; minorGods: string[]; age: number;
  resources: Record<ResourceType, number>;
  techs: string[]; powers: PowerState[];
  pop: number; popCap: number; alive: boolean; defeatedTick: number;
  mods: PlayerMods; stats: PlayerStats;
  prices: Record<ResourceType, number>;           // preço de mercado de 100 unidades em ouro
  territoryTiles: number;
  visibility: Uint8Array;                         // 0 inexplorado, 1 explorado, 2 visível
  ai: AIState | null;
  revealUntil: number; bronzeUntil: number;
  wonderVictoryAt: number;
  titanSpawned: boolean;
}

export interface TimedEffect { type: string; owner: number; until: number; x?: number; y?: number; data?: number }

export interface GameEvent { tick: number; type: string; player: number; text?: string; x?: number; y?: number; data?: string }

export interface VisualEffect { type: string; x: number; y: number; tx?: number; ty?: number; owner?: number; ttl: number; total: number; data?: string | number }

/** Texto por idioma guardado no estado ou na config (nome de entidade ou de facção, G8): resolvido por tx() ao exibir. */
export interface LocalText { pt: string; en?: string }
/** Itens proibidos (G6): ids de edifícios, unidades e tecnologias que o jogador não pode construir, treinar ou pesquisar. */
export interface Forbid { buildings?: string[]; units?: string[]; techs?: string[] }

export interface GameConfig {
  seed: number; mapSize: 'small' | 'medium' | 'large';
  scenario?: string;
  // puppet: facção roteirizada de cenário (sem IA, só gatilhos); nameText (G8); maxAge/forbid (G6); personality: personalidade da IA
  players: { name: string; god: string; isAI: boolean; difficulty: Difficulty; team?: number; puppet?: boolean; nameText?: LocalText; maxAge?: number; forbid?: Forbid; personality?: number }[];
  maxAge?: number;                                      // G6: Idade máxima de todos (0–4; padrão a última); config.players[i].maxAge a substitui
  forbid?: Forbid;                                      // G6: proibidos para todos; somam-se aos de config.players[i].forbid
  revealMap?: boolean; startingAge?: number; startingResources?: Partial<Record<ResourceType, number>>;
  mode?: GameMode; mapType?: MapType;
  map?: FixedMapData;                                   // mapa fixo (editor/arquivo); se ausente, gera pelo seed
  mapHash?: number;                                     // mapHash(map): identificação no lobby/replay/biblioteca (não é segurança)
  startOrder?: number[];                                // jogador i usa map.starts[startOrder[i]]; padrão identidade
  campaignDifficulty?: 'easy' | 'normal' | 'hard';      // campanha/Horda: escala das invasões roteirizadas e das IAs inimigas
  startKit?: boolean | boolean[];                       // kit inicial (CC + cidadãos + batedor) por partida ou por jogador; padrão map?.startKit ?? true
  scenarioData?: ScenarioFile;                          // cenário declarativo (JSON, docs/EDITOR.md §2.3): compilado por getScenarioFor no lugar de scenario
}

export interface GameState {
  config: GameConfig;
  seed: number; tick: number; time: number;
  map: GameMap;
  players: Player[];
  units: Map<number, Unit>;
  buildings: Map<number, Building>;
  nextId: number;
  territory: Int8Array; territoryDirty: boolean; territoryVersion: number;
  events: GameEvent[]; effects: VisualEffect[]; timed: TimedEffect[];
  winner: number; gameOver: boolean;
  rng: RNG;
  ceasefireUntil: number;
  fogVersion: number;
  ceasefireBy: number;
  scenario?: ScenarioState;
  /** Rei da Colina: posição da colina, time que a segura sozinho e há quantos segundos. */
  koth?: { x: number; y: number; team: number; seconds: number };
  /** Relíquias: no chão (carrier=-1, templeId=-1), carregada por um herói (carrier) ou guardada num Templo (templeId). */
  relics: { x: number; y: number; carrier: number; templeId: number }[];
  /**
   * Rodadas de IA com 2+ IAs pensando no mesmo tick (as únicas em que a ordem importa): define quem abre a vez e em que
   * sentido (aiThinkOrder). Contar rodadas, e não segundos, faz o rodízio girar com qualquer período de pensamento.
   */
  aiRound: number;
}
import type { ScenarioState } from './scenario/types';
import type { FixedMapData } from './map/fixed';
import type { ScenarioFile } from './scenario/schema';

// ---------------- Comandos (a única forma de alterar o estado a partir de fora) ----------------
export type Command =
  | { type: 'move'; player: number; ids: number[]; x: number; y: number; queue?: boolean; formation?: Formation }
  | { type: 'attackMove'; player: number; ids: number[]; x: number; y: number; queue?: boolean; formation?: Formation }
  | { type: 'attack'; player: number; ids: number[]; targetId: number; queue?: boolean }
  | { type: 'gather'; player: number; ids: number[]; targetId: number; queue?: boolean }
  | { type: 'build'; player: number; ids: number[]; building: string; tx: number; ty: number; queue?: boolean }
  | { type: 'pray'; player: number; ids: number[]; targetId: number; queue?: boolean }
  | { type: 'repair'; player: number; ids: number[]; targetId: number; queue?: boolean }
  | { type: 'stop'; player: number; ids: number[] }
  | { type: 'stance'; player: number; ids: number[]; stance: Stance }
  | { type: 'train'; player: number; buildingId: number; unit: string }
  | { type: 'research'; player: number; buildingId: number; tech: string }
  | { type: 'hireScholar'; player: number; buildingId: number }
  | { type: 'cancel'; player: number; buildingId: number; index: number; itemId?: number }   // itemId = uid do item (preferido)
  | { type: 'rally'; player: number; buildingId: number; x: number; y: number }
  | { type: 'advanceAge'; player: number; buildingId: number; minorGod?: string }
  | { type: 'power'; player: number; power: string; x?: number; y?: number; targetId?: number }
  | { type: 'trade'; player: number; action: 'buy' | 'sell'; resource: ResourceType }
  | { type: 'delete'; player: number; ids: number[] }
  | { type: 'ungarrison'; player: number; buildingId: number }
  | { type: 'garrison'; player: number; ids: number[]; targetId: number; queue?: boolean }
  | { type: 'ability'; player: number; unitId: number };
