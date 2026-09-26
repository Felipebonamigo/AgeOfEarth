// Contrato dos efeitos (docs/ART.md Apêndice F — Etapa 5). O núcleo emite `VisualEffect`s (state.effects, com ttl em
// ticks), `TimedEffect`s (state.timed: tempestade, terremoto) e marca flags nos jogadores (bronzeUntil, revealUntil) e
// no estado (ceasefireUntil); o renderizador NUNCA altera o estado — só lê. Cada tipo de VisualEffect tem um HANDLER
// registrado em fx/registry.ts (create/update/destroy, com um estado próprio por instância), cada TimedEffect um handler
// de "timed" e cada flag de poder um "watcher". Nenhum tipo cai num `default` silencioso: um tipo sem handler é avisado
// uma vez no console e contado (FxSystem.unknown), e tests/fx-registry.test.ts falha se o núcleo emitir algum tipo sem
// handler.
import type { Container } from 'pixi.js';
import type { GameState, TimedEffect, VisualEffect } from '../../core/types';
import type { Quality } from '../quality';
import type { ParticleSystem } from '../particles';
import type { DecalLayer } from '../decals';
import type { FxTextures } from './FxTextures';
import type { ArtLibrary } from '../art/ArtLibrary';
import type { TextureCache } from '../textures';
import type { UnitView } from '../views/UnitView';

/** Os 16 tipos de VisualEffect que o núcleo emite (e o marcador de ordem da interface, 'spawn' com data 'order'). */
export const EFFECT_TYPES = ['projectile', 'hit', 'splash', 'death', 'petrify', 'collapse', 'nodeGone', 'spawn', 'heal', 'ability', 'curse', 'pestilence', 'quake', 'titanRise', 'bolt', 'bronze'] as const;
export type EffectType = typeof EFFECT_TYPES[number];
/** Tipos de TimedEffect (poderes com duração). */
export const TIMED_TYPES = ['lightning_storm', 'earthquake'] as const;
export type TimedType = typeof TIMED_TYPES[number];

/**
 * Serviços do renderizador para os efeitos que mexem em arte de ENTIDADE (queda de unidade, estátua, desabamento): as
 * vistas assadas, as faixas ordenadas por y, os escombros e os cadáveres continuam sendo do renderizador.
 */
export interface FxHost {
  readonly art: ArtLibrary;
  readonly tex: TextureCache;
  /** Camada de sombras (multiply) — projéteis e vistas assadas põem a sombra aqui. */
  readonly shadows: Container;
  /** Container onde vive uma entidade no y do pé (modo assado: a faixa de props; senão a camada antiga). */
  entityParent(kind: 'unit' | 'building', y: number, flying: boolean): Container;
  /** Direção da vista assada que sumiu neste quadro no ponto (x, y) em tiles (a queda herda), ou 2 (S). */
  deathDir(type: string, x: number, y: number): number;
  /** Variante mostrada pelo edifício assado que sumiu neste quadro em (x, y) (o colapso usa a mesma), ou null. */
  goneVariant(type: string, x: number, y: number): string | null;
  /** Escombros assados de uma queda (ficam no chão RUBBLE_SECONDS). */
  addRubble(e: VisualEffect, type: string): void;
  /** Uma queda assada terminou: o corpo fica no chão (cadáver, docs/ART.md §1.9). */
  addCorpse(uv: UnitView): void;
}

/** O que um handler recebe a cada chamada (um objeto reaproveitado: não guarde referência a ele). */
export interface FxContext {
  state: GameState;
  local: number;
  /** Relógio de JOGO (s) e o passo deste quadro (0 na pausa). */
  clock: number;
  dt: number;
  zoom: number;
  /** Arte assada em vigor (vistas assadas de unidades/edifícios). */
  baked: boolean;
  quality: Quality;
  particles: ParticleSystem;
  decals: DecalLayer;
  tex: FxTextures;
  /** Camada de efeitos (acima das entidades): sprites e gráficos dos efeitos. */
  layer: Container;
  /** Sprites aditivos (brilho, raio, anéis de luz) — dentro de `layer`, acima das partículas. */
  glowLayer: Container;
  host: FxHost;
  /** O jogador local vê o tile de (x, y) (tiles) agora (ou tudo revelado). */
  visibleAt(x: number, y: number): boolean;
  /** (x, y) (tiles) dentro da área da câmera, com `margin` tiles de folga. */
  onScreen(x: number, y: number, margin?: number): boolean;
  /** Tremor da câmera (px de tela; o maior pedido vence e decai sozinho). */
  shake(amount: number): void;
  /** Põe um decalque (respeita a névoa e o teto do preset). */
  /** `size` = diâmetro no mundo (px; padrão: o tamanho do quadro a 1×), `life` em s de jogo. */
  decal(name: string, x: number, y: number, opts?: { rot?: number; size?: number; alpha?: number; life?: number; tint?: number }): void;
}

/**
 * Handler de um tipo de VisualEffect. `create` roda quando o efeito aparece (ou quando a arte é refeita: `age` > 0 —
 * efeitos de um disparo só, como faíscas, devem olhar `age` e não repetir); `update` a cada quadro enquanto o núcleo
 * mantém o efeito (`t` = s desde o começo, `p` = fração 0–1 da duração pelo relógio de jogo, contínua entre ticks);
 * `destroy` quando ele sai (`expired` = acabou de verdade; false = troca de partida/arte).
 */
export interface FxHandler<S = unknown> {
  create(e: VisualEffect, fx: FxContext, age: number): S;
  update?(e: VisualEffect, s: S, fx: FxContext, t: number, p: number): void;
  destroy?(e: VisualEffect, s: S, fx: FxContext, expired: boolean): void;
}

/** Handler de um TimedEffect (poder com duração: tempestade de raios, terremoto): chamado a cada quadro enquanto dura. */
export interface TimedHandler<S = unknown> {
  create(t: TimedEffect, fx: FxContext): S;
  update?(t: TimedEffect, s: S, fx: FxContext): void;
  destroy?(t: TimedEffect, s: S, fx: FxContext): void;
}

/** Observador de um estado de poder sem efeito próprio (trégua, oráculo, bronze): lê flags do estado a cada quadro. */
export interface FxWatcher { id: string; update(fx: FxContext): void; reset?(): void }
