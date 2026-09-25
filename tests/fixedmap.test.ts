// Mapas fixos: ida e volta dos dados, partida idêntica a partir do mesmo mapa fixo, save com mapa fixo.
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/sim/game';
import { generateMap } from '../src/core/map/mapgen';
import { mapToData, mapFromData, bytesToBase64, base64ToBytes, mapDataSize } from '../src/core/map/fixed';
import { stateHash } from '../src/core/net/hash';
import { serialize, deserialize } from '../src/core/serialize';
import type { GameConfig } from '../src/core/types';

const players: GameConfig['players'] = [{ name: 'A', god: 'zeus', isAI: true, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: true, difficulty: 'normal' }];

describe('mapas fixos', () => {
  it('base64 próprio faz ida e volta de qualquer sequência de bytes', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 100]) {
      const b = new Uint8Array(len); for (let i = 0; i < len; i++) b[i] = (i * 37 + 11) & 255;
      expect(Array.from(base64ToBytes(bytesToBase64(b), len))).toEqual(Array.from(b));
    }
  });
  it('mapToData/mapFromData preservam terreno, decoração, nós e inícios', () => {
    const m = generateMap(64, 64, 42, 2, 'mountains');
    const data = mapToData(m, 'teste');
    expect(data.w).toBe(64); expect(data.nodes.length).toBe(m.nodes.size); expect(data.starts.length).toBe(2);
    const back = mapFromData(JSON.parse(JSON.stringify(data)));
    expect(Array.from(back.terrain)).toEqual(Array.from(m.terrain));
    expect(Array.from(back.decor)).toEqual(Array.from(m.decor));
    expect(Array.from(back.blocked)).toEqual(Array.from(m.blocked));
    expect(back.nodes.size).toBe(m.nodes.size);
    expect(back.starts).toEqual(m.starts);
    expect(mapDataSize(data)).toBeLessThan(120000);
  });
  it('duas partidas com o mesmo mapa fixo são idênticas; save/load mantém o mapa fixo na configuração', () => {
    const data = mapToData(generateMap(64, 64, 7, 2));
    const cfg: GameConfig = { seed: 123, mapSize: 'small', players, map: data };
    const a = createGame(cfg), b = createGame(JSON.parse(JSON.stringify(cfg)));
    expect(stateHash(a)).toBe(stateHash(b));
    expect(a.map.w).toBe(64);
    const loaded = deserialize(serialize(a));
    expect(loaded.config.map?.terrain).toBe(data.terrain);
    expect(stateHash(loaded)).toBe(stateHash(a));
    // mapa com inícios de menos para os jogadores é recusado
    expect(() => createGame({ ...cfg, players: [...players, { name: 'C', god: 'poseidon', isAI: true, difficulty: 'normal' }] })).toThrow();
  });
});
