// Registro do cenário: poderes usados (G11) e autoria dos abates (G13). O núcleo (powers.ts, combat.ts) chama estas funções
// depois que o fato já aconteceu; elas só somam contadores em state.scenario (objetos simples, serializáveis) e nunca
// consomem state.rng nem mexem em entidades — a simulação é a mesma com ou sem cenário. Fora de cenário, não fazem nada.
import type { Building, GameState, Unit } from '../types';
import type { KillLog, ScenarioState } from './types';

/** Registro vazio (initScenarioState e saves antigos no deserialize). */
export function emptyKillLog(): KillLog { return { byPlayer: {}, byEntity: {} }; }

/** G11: o jogador usou o poder (usePower, depois de marcar `used`). */
export function recordPowerUse(state: GameState, player: number, power: string): void {
  const sc = state.scenario; if (!sc) return;
  const uses = sc.powerUses ?? (sc.powerUses = {});
  const k = `${player}:${power}`;
  uses[k] = (uses[k] ?? 0) + 1;
}

/**
 * G13: a vítima (unidade ou edifício do tipo `victimType`) morreu por ação do jogador `killerOwner` (inimigo dela; quem
 * chama já filtra dono -1 e o próprio dono), com a entidade autora `killer` quando houver (golpe, flecha, dano em área).
 */
export function recordKill(state: GameState, victimType: string, killerOwner: number, killer?: Unit | Building): void {
  const sc = state.scenario; if (!sc) return;
  const log = sc.kills ?? (sc.kills = emptyKillLog());
  const kp = `${killerOwner}:${victimType}`;
  log.byPlayer[kp] = (log.byPlayer[kp] ?? 0) + 1;
  if (!killer) return;
  const ke = `${killerOwner}:${killer.id}`;
  const row = log.byEntity[ke] ?? (log.byEntity[ke] = {});
  row[victimType] = (row[victimType] ?? 0) + 1;
  const byType = log.byType ?? (log.byType = {});
  const kt = `${killerOwner}:${killer.type}`;
  const trow = byType[kt] ?? (byType[kt] = {});
  trow[victimType] = (trow[victimType] ?? 0) + 1;
}

/** G11: quantas vezes o jogador usou o poder desde o início da partida. */
export function powerUseCount(sc: ScenarioState | undefined, player: number, power: string): number {
  return sc?.powerUses?.[`${player}:${power}`] ?? 0;
}

/**
 * G13: abates do jogador `player` (autor), só das vítimas de `types` (ausente = todas) e, com `byIds`, só os feitos por
 * essas entidades (o grupo de uma tag: ids de unidades/edifícios do próprio jogador, vivos ou não); com `byType`, só os
 * feitos por entidades desse tipo (qualquer uma do jogador: o herói único retreinado conta como o original).
 */
export function killCount(sc: ScenarioState | undefined, player: number, types?: readonly string[], byIds?: readonly number[], byType?: string): number {
  const log = sc?.kills; if (!log || player < 0) return 0;
  const sum = (row: Record<string, number> | undefined, prefix = ''): number => {
    if (!row) return 0;
    if (types) { let n = 0; for (const t of types) n += row[prefix + t] ?? 0; return n; }
    let n = 0; for (const [k, v] of Object.entries(row)) if (k.startsWith(prefix)) n += v;
    return n;
  };
  if (byType !== undefined) return sum(log.byType?.[`${player}:${byType}`]);
  if (!byIds) return sum(log.byPlayer, `${player}:`);
  let n = 0;
  for (const id of new Set(byIds)) n += sum(log.byEntity[`${player}:${id}`]);
  return n;
}

/**
 * Save de antes de G11/G13 ou valor malformado: registros vazios. Contadores válidos são inteiros ≥ 0; o resto é descartado
 * (o registro só é lido pelas condições do cenário, então descartar nunca muda a simulação).
 */
export function sanitizeScenarioLog(sc: { powerUses?: unknown; kills?: unknown }): { powerUses: Record<string, number>; kills: KillLog } {
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const counts = (v: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (isObj(v)) for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isInteger(n) && n >= 0) out[k] = n;
    return out;
  };
  const kills = emptyKillLog();
  if (isObj(sc.kills)) {
    kills.byPlayer = counts(sc.kills.byPlayer);
    if (isObj(sc.kills.byEntity)) for (const [k, row] of Object.entries(sc.kills.byEntity)) { const r = counts(row); if (Object.keys(r).length) kills.byEntity[k] = r; }
    if (isObj(sc.kills.byType)) for (const [k, row] of Object.entries(sc.kills.byType)) { const r = counts(row); if (Object.keys(r).length) (kills.byType ??= {})[k] = r; }
  }
  return { powerUses: counts(sc.powerUses), kills };
}
