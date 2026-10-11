// Linhas de unidade no núcleo (E3, docs/eras/E3-linhas-de-unidade.md): o degrau que cada linha treina (de player.techs,
// sem estado novo), os botões de treino de um edifício (o HUD, os atalhos e a IA usam esta MESMA função) e a
// transformação das unidades quando um estudo de evolução termina. Determinístico: só player.techs e a config.
import { BUILDINGS, LINES, LINE_ORDER, TECHS, UNITS, lineStart, evoTechId, type LineDef } from '../data';
import type { GameState, Player } from '../types';
import { isScenarioConfig } from './restrictions';
import { recomputePop } from './entities';

/** Linhas ligadas: fora de cenário, sempre; em cenário, só com config.unitLines === true (campanha e Horda: elenco clássico). */
export function unitLinesOn(state: GameState): boolean { return state.config.unitLines ?? !isScenarioConfig(state.config); }

/** Degrau que a linha treina hoje para o jogador: o da maior Era cujo estudo ele já tem (sem estudo, a base). */
export function lineUnitOf(player: Player, lineId: string): string {
  const l = LINES[lineId];
  const from = lineStart(l);
  let cur = l.steps[from]!;
  for (let k = from + 1; k < l.steps.length; k++) { const s = l.steps[k]; if (s && player.techs.includes(evoTechId(lineId, k))) cur = s; }
  return cur;
}

/** Próximo estudo de evolução da linha que o jogador ainda não tem (null: linha completa). */
export function nextEvolution(player: Player, lineId: string): string | null {
  const l = LINES[lineId];
  for (let k = lineStart(l) + 1; k < l.steps.length; k++) {
    if (!l.steps[k]) continue;
    const t = evoTechId(lineId, k);
    if (!player.techs.includes(t)) return t;
  }
  return null;
}

/** Tipo que sai do treino de `unit`: com as linhas ligadas, o degrau atual da linha dela; senão, o próprio. */
export function trainTypeOf(state: GameState, player: Player, unit: string): string {
  const d = UNITS[unit];
  return d?.line && unitLinesOn(state) ? lineUnitOf(player, d.line) : unit;
}

/** Um botão de treino: `send` vai no comando, `show` é o que sai (ícone, nome, custo); `era` = desde quando treina. */
export interface TrainChoice { send: string; show: string; hotkey: string | null; era: number; line: LineDef | null }

/**
 * Botões de treino de um edifício, na ordem de exibição. Com as linhas: um por linha (LINE_ORDER) que treina ali e ainda
 * não se aposentou, e depois as unidades sem linha do `trains` (heróis, míticas, Mercador). Sem as linhas: exatamente
 * o `trains`, na ordem dele (o elenco clássico de antes da E3).
 */
export function trainChoices(state: GameState, player: Player, buildingType: string): TrainChoice[] {
  const trains = BUILDINGS[buildingType]?.trains ?? [];
  if (!unitLinesOn(state)) return trains.map((id) => ({ send: id, show: id, hotkey: UNITS[id].hotkey ?? null, era: UNITS[id].age, line: null }));
  const out: TrainChoice[] = [];
  for (const id of LINE_ORDER) {
    const l = LINES[id];
    if (!l.buildings.includes(buildingType)) continue;
    if (l.retireAt !== undefined && player.age >= l.retireAt) continue;
    out.push({ send: l.steps[lineStart(l)]!, show: lineUnitOf(player, id), hotkey: l.hotkey, era: lineStart(l), line: l });
  }
  for (const id of trains) if (!UNITS[id].line) out.push({ send: id, show: id, hotkey: UNITS[id].hotkey ?? null, era: UNITS[id].age, line: null });
  return out;
}

/**
 * Fim de um estudo de evolução (chamar ANTES de recomputeMods/refreshMaxHp, que mantêm a fração de vida pelo tipo
 * novo): as unidades vivas do dono naquela linha e de degrau menor viram o degrau novo. Patente (kills), ordem, alvo,
 * postura e guarnição continuam (tests/unit-lines.test.ts garante que a guarnição não muda dentro de uma linha).
 * Devolve quantas mudaram. Os cidadãos (to = villager) não mudam de tipo: só os efeitos do estudo valem.
 */
export function applyEvolution(state: GameState, player: Player, techId: string): number {
  const evo = TECHS[techId]?.evolve;
  if (!evo || !unitLinesOn(state)) return 0;
  const tier = UNITS[evo.to].tier ?? 0;
  let n = 0;
  for (const u of state.units.values()) {
    if (u.owner !== player.id || u.dead || u.type === evo.to) continue;
    const d = UNITS[u.type];
    if (d.line !== evo.line || (d.tier ?? 0) >= tier) continue;
    u.type = evo.to;
    u.path = null;   // recalcula o caminho com a velocidade nova; ordem e estado ficam
    n++;
    if (u.inside === -1) state.effects.push({ type: 'evolve', x: u.x, y: u.y, owner: u.owner, ttl: 20, total: 20, src: evo.to });
  }
  if (n > 0) recomputePop(state, player);
  return n;
}

