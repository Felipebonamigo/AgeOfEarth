// Mapas fixos (Fase 3.3): serialização compacta e determinística de um GameMap para JSON (editor, arquivos, lobby)
// e carregamento de volta. Terreno e decoração vão em base64 de bytes (sem depender de btoa/Buffer); nós como listas.
import { TERRAIN, type NodeType } from '../constants';
import type { GameMap } from '../types';
import { addNode, rebuildBlocked } from './mapgen';

export interface FixedMapData {
  v: 1;
  name?: string;
  w: number; h: number;
  terrain: string;                              // base64 de w*h bytes (TERRAIN.*)
  decor: string;                                // base64 de w*h bytes
  nodes: [NodeType, number, number, number][];  // tipo, x, y, quantidade (em ordem y, x)
  starts: [number, number][];                   // posições iniciais (uma por jogador); o CC 3x3 fica em (x-1, y-1)
  // ---- opcionais (docs/EDITOR.md §2.1); todos com padrão no carregador ----
  id?: string;                                  // slug estável do mapa (biblioteca/seletor); não muda ao renomear
  nameEn?: string; author?: string; description?: string;
  startKit?: boolean;                           // padrão true: CC + cidadãos + batedor em cada início (createGame)
  entities?: MapEntity[];                       // edifícios e unidades pré-colocados (edifícios antes das unidades, ordem y, x)
  startTeams?: number[];                        // time sugerido por início (ex.: [0, 0, 1, 1]) para atribuição por time
  koth?: [number, number];                      // colina do Rei da Colina; padrão: centro do mapa
  relics?: boolean;                             // padrão true: placeRelics sorteia pela semente; false em cenários
}
export type MapEntity =
  | { kind: 'building'; type: string; owner: number; x: number; y: number; complete?: boolean; tag?: string }   // x, y = canto (tx, ty); complete padrão true
  | { kind: 'unit'; type: string; owner: number; x: number; y: number; tag?: string };                          // tile; nasce em (x+0.5, y+0.5) ou no tile livre mais próximo

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}
export function base64ToBytes(s: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  const val = (ch: string) => { const i = B64.indexOf(ch); return i < 0 ? 0 : i; };
  let o = 0;
  for (let i = 0; i + 3 < s.length && o < length; i += 4) {
    const n = (val(s[i]) << 18) | (val(s[i + 1]) << 12) | (val(s[i + 2]) << 6) | val(s[i + 3]);
    out[o++] = (n >> 16) & 255;
    if (o < length && s[i + 2] !== '=') out[o++] = (n >> 8) & 255;
    if (o < length && s[i + 3] !== '=') out[o++] = n & 255;
  }
  return out;
}

/** Converte o mapa atual em dados (só o que é "mapa": terreno, decoração, nós vivos e inícios — edifícios/unidades são do cenário). */
export function mapToData(map: GameMap, name?: string): FixedMapData {
  const nodes: FixedMapData['nodes'] = [...map.nodes.values()].sort((a, b) => a.y - b.y || a.x - b.x).map((n) => [n.type, n.x, n.y, Math.round(n.amount)]);
  return { v: 1, name, w: map.w, h: map.h, terrain: bytesToBase64(map.terrain), decor: bytesToBase64(map.decor), nodes, starts: map.starts.map((s) => [s.x, s.y]) };
}

/** Reconstrói um GameMap a partir dos dados. Ids de nós seguem a sequência atual (chame resetNodeSeq() antes, como createGame faz). */
export function mapFromData(data: FixedMapData): GameMap {
  if (data.v !== 1 || !(data.w > 0 && data.h > 0)) throw new Error('mapa fixo inválido');
  const w = data.w, h = data.h;
  const map: GameMap = { w, h, terrain: base64ToBytes(data.terrain, w * h), blocked: new Uint8Array(w * h), nodeAt: new Int32Array(w * h).fill(-1), buildingAt: new Int32Array(w * h).fill(-1), gateTeam: new Int8Array(w * h).fill(-1), nodes: new Map(), starts: data.starts.map(([x, y]) => ({ x, y })), decor: base64ToBytes(data.decor, w * h) };
  const maxT = Math.max(...Object.values(TERRAIN));
  for (let i = 0; i < w * h; i++) if (map.terrain[i] > maxT) map.terrain[i] = TERRAIN.GRASS;   // valor fora da tabela: grama
  for (const [type, x, y, amount] of data.nodes) addNode(map, type, x, y, amount);
  rebuildBlocked(map);
  return map;
}

/** Tamanho aproximado em bytes do JSON (para avisar no lobby). */
export function mapDataSize(data: FixedMapData): number { return JSON.stringify(data).length; }
