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
  /** G17: teto de disparos de um gatilho repeat (vars['@id'] conta os disparos; zerá-lo rearma o gatilho). */
  maxFires?: number;
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
  // start (G4, fromVar): instante (s) a partir do qual a contagem corre; null = ainda não marcado (não aparece)
  | { type: 'countdown'; seconds: number; while: (state: GameState) => boolean; label: string; start?: (state: GameState) => number | null }
  // entity: valor atual (s de obra do edifício ou a variável, G4) ou -1 para esconder; maxOf (G4): máximo dinâmico; format: como escrever
  | { type: 'progress'; entity: (state: GameState) => number | -1; max: number; label: string; maxOf?: (state: GameState) => number; format?: 'percent' | 'count' | 'time' };

export interface ScenarioState {
  id: string;
  objectives: Record<string, ObjectiveStatus>;
  hidden: Record<string, boolean>;
  fired: string[];
  /** Resultado do ponto de vista do time do primeiro humano da config (igual em todos os clientes). */
  outcome: 'playing' | 'victory' | 'defeat';
  /** Time vencedor ao terminar (-1 = ninguém/em jogo). A tela de fim decide vitória/derrota pelo time do jogador local. */
  winnerTeam: number;
  vars: Record<string, number>;          // valores guardados pelo cenário (ex.: id do Centro Cívico alvo); '#tag' = ids das tags, '@id' = disparos do gatilho repeat (G17)
  /** G11: usos de cada poder por jogador desde o início (`${jogador}:${poder}` → n); reset/remove do roteiro não zeram. */
  powerUses: Record<string, number>;
  /** G13: autoria dos abates (registro; não muda a simulação). */
  kills: KillLog;
}

/**
 * G13: abates com autor (jogador inimigo da vítima), gravados por killUnit/destroyBuilding (src/core/scenario/log.ts).
 * byPlayer: `${jogador autor}:${tipo da vítima}` → n (inclui Raio, Maldição, atrito); byEntity: `${jogador autor}:${id da
 * unidade ou edifício autor}` → { tipo da vítima: n } (só quando há entidade autora: golpe, flecha, dano em área).
 */
export interface KillLog {
  byPlayer: Record<string, number>;
  byEntity: Record<string, Record<string, number>>;
}
