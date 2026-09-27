// Registro dos efeitos (docs/ART.md Apêndice F — Etapa 5): cada tipo de VisualEffect → um handler, cada TimedEffect →
// um handler de duração, e cada poder divino → de onde a arte dele sai (efeito, efeito com duração ou observador de flag).
// É a única lista: um tipo novo no núcleo exige uma linha aqui (tests/fx-registry.test.ts varre `effects.push`/
// `timed.push` em src/core e src/ui e falha se algum tipo não tiver handler, e confere que todo poder de POWERS tem arte).
import type { EffectType, FxHandler, FxWatcher, TimedHandler, TimedType } from './types';
import { projectile } from './handlers/projectile';
import { hit } from './handlers/hit';
import { spawn } from './handlers/spawn';
import { death, petrify } from './handlers/death';
import { collapse } from './handlers/collapse';
import { nodeGone } from './handlers/nodeGone';
import { splash } from './handlers/splash';
// Q dos heróis (lote combate-ambiente): arte própria por herói
import { ability } from './handlers/ability';
// poderes (lote poderes-luz): um arquivo por poder
import { bolt, lightningStorm } from './handlers/bolt';
import { heal } from './handlers/restoration';
import { pestilence, pestilenceWatcher } from './handlers/pestilence';
import { earthquake, quake } from './handlers/earthquake';
import { curse, curseWatcher } from './handlers/curse';
import { bronze, bronzeWatcher } from './handlers/bronze';
import { titanRise } from './handlers/titan';
import { ceasefireWatcher, oracleWatcher } from './handlers/global';

export const FX_HANDLERS: Record<EffectType, FxHandler<any>> = {
  projectile, hit, spawn, death, petrify, collapse, nodeGone, splash,
  heal, ability, curse, pestilence, quake, titanRise, bolt, bronze,
};

export const TIMED_HANDLERS: Record<TimedType, TimedHandler<any>> = {
  lightning_storm: lightningStorm, earthquake,
};

/** Observadores de estado (poderes sem efeito próprio, a duração de um poder, o lançamento de um poder de área); um por
 *  instância do FxSystem. */
export function makeWatchers(): FxWatcher[] { return [ceasefireWatcher(), oracleWatcher(), pestilenceWatcher(), bronzeWatcher(), curseWatcher()]; }

/**
 * De onde sai a arte de cada poder (POWERS em src/core/data/gods.ts): `effect:<tipo>` (VisualEffect), `timed:<tipo>`
 * (TimedEffect) ou `watch:<id>` (observador); vários separados por '+'. O lote de poderes refina o handler indicado.
 */
export const POWER_ART: Record<string, string> = {
  bolt: 'effect:bolt',
  lure: 'effect:spawn',
  sentinel: 'effect:spawn',
  restoration: 'effect:heal',
  ceasefire: 'watch:ceasefire',
  pestilence: 'effect:pestilence+watch:pestilence',
  oracle: 'watch:oracle',
  bronze: 'effect:bronze+watch:bronze',
  curse: 'effect:curse+watch:curse',
  lightning_storm: 'timed:lightning_storm+effect:bolt',
  plenty: 'effect:spawn',
  earthquake: 'effect:quake+timed:earthquake',
};

/** Handler de um tipo (undefined = tipo desconhecido: o FxSystem avisa uma vez e conta). */
export function handlerFor(type: string): FxHandler<any> | undefined {
  return (FX_HANDLERS as Record<string, FxHandler<any>>)[type];
}
export function timedHandlerFor(type: string): TimedHandler<any> | undefined {
  return (TIMED_HANDLERS as Record<string, TimedHandler<any>>)[type];
}
