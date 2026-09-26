// Anti-trapaça básico (ROADMAP 4.5): saneamento estrutural de todo Command antes de applyCommand.
// Em rede cada cliente simula tudo e só comandos trafegam; um cliente modificado (ou um bug) pode mandar qualquer JSON.
// sanitizeCommand devolve uma CÓPIA limpa — só os campos conhecidos do tipo, com os tipos certos, ids inteiros,
// coordenadas finitas — ou null, e aí o comando é um no-op determinístico em todos os clientes. As regras de jogo (dono das
// entidades, alvo aliado/inimigo, custo, fila, poder disponível, tecnologia liberada…) continuam em applyCommand e no que ele
// chama. Nada aqui lança exceção: qualquer valor de entrada (null, número, array, objeto com campos estranhos) é aceitável.
import { FORMATIONS, RESOURCES, STANCES, type Formation, type ResourceType, type Stance } from '../constants';
import { BUILDINGS, MINOR_GODS, POWERS, TECHS, UNITS } from '../data';
import type { Command, GameState } from '../types';

/** Máximo de ids num comando: a população máxima (250) mais os edifícios, com folga. Acima disso o comando é descartado. */
export const MAX_CMD_IDS = 600;
/**
 * Margem (em tiles) além da borda em que uma coordenada ainda é aceita: a câmera mostra 3 tiles fora do mapa e, afastada,
 * centraliza mapas pequenos, então um clique legítimo pode cair fora dele (a ordem vai para a borda, como sempre foi).
 * Mais longe que isso, NaN ou ±Infinity: comando descartado.
 */
export const COORD_MARGIN = 512;
/** Ordens na fila (Shift) por unidade; uma muralha arrastada enfileira uma ordem por tile (a linha da interface tem ≤ 502). */
export const MAX_ORDER_QUEUE = 600;
/** Comandos `build` de um jogador num mesmo tick aceitos da rede (NetworkScheduler; o relay usa o mesmo número). Uma muralha
 *  longa arrastada numa só vez vira um comando `build` por tile no mesmo tick. */
export const MAX_CMDS_PER_TICK = 1024;
/** Demais comandos (não `build`) de um jogador num mesmo tick aceitos da rede (o relay usa o mesmo número): a interface manda
 *  um por ação; a folga cobre as ações acumuladas enquanto a partida espera a rede. */
export const MAX_OTHER_CMDS_PER_TICK = 64;
/**
 * Soma dos ids (já sem repetição) dos comandos que não são `build` de um jogador num mesmo tick, vindos da rede: cada id vira
 * uma ordem de unidade; 1200 ids cobrem várias ordens ao exército inteiro no mesmo tick. Sem isso, 1024 comandos × 600 ids
 * repetidos (dentro dos limites do relay) davam 600 mil ordens por tick e travavam todos os clientes (~115 ms por tick).
 */
export const MAX_ORDER_IDS_PER_TICK = 2 * MAX_CMD_IDS;
/** Soma dos ids (sem repetição) dos comandos `build` de um jogador num mesmo tick: uma muralha de 500 tiles com 60 construtores. */
export const MAX_BUILD_IDS_PER_TICK = 32 * 1024;
/** Maior índice de item de fila aceito em `cancel` (as filas têm no máximo 10 itens, mais sábios e Idade). */
const MAX_QUEUE_INDEX = 64;

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Chave própria de uma tabela de dados (evita `__proto__`, `constructor`, `toString`… que existem em qualquer objeto). */
export const ownKey = (table: object, v: unknown): v is string => typeof v === 'string' && Object.prototype.hasOwnProperty.call(table, v);
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const absent = (v: unknown) => v === undefined || v === null;

/**
 * Lista de ids: array de inteiros com no máximo MAX_CMD_IDS itens (cópia). Repetições são mantidas: a própria IA manda ids
 * repetidos (o `snap.military` de `manageArmy` em ai.ts) e tirá-los mudaria a formação — e a partida — de uma mesma
 * semente; repetido só recebe a mesma ordem duas vezes, e o tamanho da lista já é limitado.
 */
function idList(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length > MAX_CMD_IDS) return null;
  for (const id of v) if (!isId(id)) return null;
  return v.slice() as number[];
}
/**
 * Comandos de um jogador para um tick como TODOS os clientes os aplicam (NetworkScheduler: para os outros pares e também para
 * o próprio jogador local, que envia exatamente esta lista): só objetos em nome do próprio jogador, ids sem repetição dentro de
 * cada comando, no máximo MAX_CMDS_PER_TICK `build` e MAX_OTHER_CMDS_PER_TICK outros, e a soma dos ids limitada por tipo
 * (MAX_BUILD_IDS_PER_TICK, MAX_ORDER_IDS_PER_TICK). O que passa de um limite sai inteiro, nunca cortado ao meio. Pura e
 * idempotente (aplicada de novo, devolve a mesma lista): o relay pode repassá-la e o outro par filtrar de novo sem divergir.
 * Só vale na entrada da rede — a IA e o jogo local não passam por aqui (repetições da IA seguem como sempre foram).
 */
export function netCommands(player: number, raw: unknown): Command[] {
  const out: Command[] = [];
  if (!Array.isArray(raw)) return out;
  let builds = 0, others = 0, buildIds = 0, orderIds = 0;
  for (const c of raw) {
    if (!isRecord(c) || c.player !== player) continue;
    const build = c.type === 'build';
    if (build ? builds >= MAX_CMDS_PER_TICK : others >= MAX_OTHER_CMDS_PER_TICK) continue;
    let cmd: Rec = c, n = 0;
    if (Array.isArray(c.ids)) {
      const uniq = [...new Set(c.ids as unknown[])];
      if (uniq.length !== c.ids.length) cmd = { ...c, ids: uniq };
      n = uniq.length;
    }
    if (build ? buildIds + n > MAX_BUILD_IDS_PER_TICK : orderIds + n > MAX_ORDER_IDS_PER_TICK) continue;
    if (build) { builds++; buildIds += n; } else { others++; orderIds += n; }
    out.push(cmd as unknown as Command);
  }
  return out;
}
/** Coordenada contínua (tiles): número finito dentro do mapa estendido por COORD_MARGIN. */
function coord(v: unknown, size: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= -COORD_MARGIN && v <= size + COORD_MARGIN ? v : null;
}
/** Tile (canto de uma obra): inteiro dentro do mapa. */
function tile(v: unknown, size: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < size ? v : null;
}

/**
 * Valida a forma de um comando e devolve uma cópia limpa, ou null se ele for inválido: tipo desconhecido, jogador inexistente
 * ou fora da partida (eliminado; espectador = -1), campo obrigatório ausente ou do tipo errado, id que não é inteiro, lista
 * grande demais, coordenada não finita ou longe do mapa, id de dado (unidade, edifício, tecnologia, poder, deus, postura,
 * formação, recurso) que não existe. Campos a mais são descartados.
 */
export function sanitizeCommand(state: GameState, raw: unknown): Command | null {
  if (!isRecord(raw)) return null;
  const player = raw.player;
  if (!isId(player) || player < 0 || player >= state.players.length || !state.players[player].alive) return null;
  const { w, h } = state.map;
  const queue = raw.queue === true;
  switch (raw.type) {
    case 'move': case 'attackMove': {
      const ids = idList(raw.ids), x = coord(raw.x, w), y = coord(raw.y, h);
      if (!ids || x === null || y === null) return null;
      let formation: Formation | undefined;
      if (!absent(raw.formation)) { if (!(FORMATIONS as unknown[]).includes(raw.formation)) return null; formation = raw.formation as Formation; }
      return formation ? { type: raw.type, player, ids, x, y, queue, formation } : { type: raw.type, player, ids, x, y, queue };
    }
    case 'attack': case 'gather': case 'pray': case 'repair': case 'garrison': {
      const ids = idList(raw.ids);
      if (!ids || !isId(raw.targetId)) return null;
      return { type: raw.type, player, ids, targetId: raw.targetId, queue };
    }
    case 'build': {
      const ids = idList(raw.ids), tx = tile(raw.tx, w), ty = tile(raw.ty, h);
      if (!ids || tx === null || ty === null || !ownKey(BUILDINGS, raw.building)) return null;
      return { type: 'build', player, ids, building: raw.building, tx, ty, queue };
    }
    case 'stop': case 'delete': {
      const ids = idList(raw.ids);
      return ids ? { type: raw.type, player, ids } : null;
    }
    case 'stance': {
      const ids = idList(raw.ids);
      if (!ids || !ownKey(STANCES, raw.stance)) return null;
      return { type: 'stance', player, ids, stance: raw.stance as Stance };
    }
    case 'train': return isId(raw.buildingId) && ownKey(UNITS, raw.unit) ? { type: 'train', player, buildingId: raw.buildingId, unit: raw.unit } : null;
    case 'research': return isId(raw.buildingId) && ownKey(TECHS, raw.tech) ? { type: 'research', player, buildingId: raw.buildingId, tech: raw.tech } : null;
    case 'hireScholar': case 'ungarrison': return isId(raw.buildingId) ? { type: raw.type, player, buildingId: raw.buildingId } : null;
    case 'cancel': {
      const index = raw.index;
      if (!isId(raw.buildingId) || !isId(index) || index < -1 || index > MAX_QUEUE_INDEX) return null;
      if (!absent(raw.itemId) && !isId(raw.itemId)) return null;
      return isId(raw.itemId) ? { type: 'cancel', player, buildingId: raw.buildingId, index, itemId: raw.itemId } : { type: 'cancel', player, buildingId: raw.buildingId, index };
    }
    case 'rally': {
      const x = coord(raw.x, w), y = coord(raw.y, h);
      return isId(raw.buildingId) && x !== null && y !== null ? { type: 'rally', player, buildingId: raw.buildingId, x, y } : null;
    }
    case 'advanceAge': {
      if (!isId(raw.buildingId)) return null;
      if (!absent(raw.minorGod) && !ownKey(MINOR_GODS, raw.minorGod)) return null;
      return absent(raw.minorGod) ? { type: 'advanceAge', player, buildingId: raw.buildingId } : { type: 'advanceAge', player, buildingId: raw.buildingId, minorGod: raw.minorGod as string };
    }
    case 'power': {
      if (!ownKey(POWERS, raw.power)) return null;
      const cmd: Extract<Command, { type: 'power' }> = { type: 'power', player, power: raw.power };
      // ponto opcional (poderes globais e de alvo não mandam), mas, se vier, precisa ser um ponto válido (os dois eixos)
      if (!absent(raw.x) || !absent(raw.y)) {
        const x = coord(raw.x, w), y = coord(raw.y, h);
        if (x === null || y === null) return null;
        cmd.x = x; cmd.y = y;
      }
      if (!absent(raw.targetId)) { if (!isId(raw.targetId)) return null; cmd.targetId = raw.targetId; }
      return cmd;
    }
    case 'trade': {
      if ((raw.action !== 'buy' && raw.action !== 'sell') || !(RESOURCES as readonly unknown[]).includes(raw.resource)) return null;
      return { type: 'trade', player, action: raw.action, resource: raw.resource as ResourceType };
    }
    case 'ability': return isId(raw.unitId) ? { type: 'ability', player, unitId: raw.unitId } : null;
  }
  return null;
}
