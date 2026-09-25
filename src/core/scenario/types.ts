// Cenários (campanha): objetivos, gatilhos e diálogos executados dentro da simulação (determinísticos).
import type { GameConfig, GameState } from '../types';

export type ObjectiveStatus = 'pending' | 'done' | 'failed';

export interface ObjectiveDef {
  id: string; text: string; optional?: boolean; hidden?: boolean;
  /** Avaliado a cada segundo. */
  check?: (state: GameState) => ObjectiveStatus;
}

export interface TriggerCtx {
  say: (speaker: string, text: string, icon?: string) => void;
  objective: (id: string, status: ObjectiveStatus) => void;
  reveal: (id: string) => void;          // torna visível um objetivo oculto
  seconds: number;                       // tempo de jogo em segundos
  fired: (id: string) => boolean;
}

export interface TriggerDef {
  id: string;
  when: (state: GameState, ctx: TriggerCtx) => boolean;
  then: (state: GameState, ctx: TriggerCtx) => void;
  repeat?: boolean;
}

export interface ScenarioDef {
  id: string; title: string; subtitle: string; icon: string;
  intro: string[];
  outro?: string[];
  config: Omit<GameConfig, 'seed' | 'scenario'> & { seed: number };
  setup?: (state: GameState) => void;
  objectives: ObjectiveDef[];
  triggers: TriggerDef[];
  victory: (state: GameState) => boolean;
  defeat?: (state: GameState) => boolean;
  hints?: string[];
  /** Indicadores extras do painel de objetivos (cenários JSON): cronômetro enquanto a condição valer ou progresso de uma obra. */
  hud?: ScenarioHudDef[];
}

export type ScenarioHudDef =
  | { type: 'countdown'; seconds: number; while: (state: GameState) => boolean; label: string }
  | { type: 'progress'; entity: (state: GameState) => number | -1; max: number; label: string };   // entity: progresso (s) da obra ou -1 se não existe/já concluída

export interface ScenarioState {
  id: string;
  objectives: Record<string, ObjectiveStatus>;
  hidden: Record<string, boolean>;
  fired: string[];
  /** Resultado do ponto de vista do time do primeiro humano da config (igual em todos os clientes). */
  outcome: 'playing' | 'victory' | 'defeat';
  /** Time vencedor ao terminar (-1 = ninguém/em jogo). A tela de fim decide vitória/derrota pelo time do jogador local. */
  winnerTeam: number;
  vars: Record<string, number>;          // valores guardados pelo cenário (ex.: id do Centro Cívico alvo)
}
