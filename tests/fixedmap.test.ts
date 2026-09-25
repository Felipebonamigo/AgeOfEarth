// Mapas fixos: ida e volta dos dados, partida idêntica a partir do mesmo mapa fixo, save com mapa fixo,
// regressão do gerador (após extrair deriveDeepWater/placeStartResources), forma canônica, hash, validação,
// mapa em branco, migração e saveMap (docs/EDITOR.md §2.1 e §5 Etapa 1).
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/core/sim/game';
import { generateMap, resetNodeSeq, deriveDeepWater, placeStartResources, ensureConnectivity, widenChokepoints, carveCorridor, NODE_AMOUNT, unitCircle } from '../src/core/map/mapgen';
import { mapToData, mapFromData, bytesToBase64, base64ToBytes, mapDataSize, canonicalize, mapHash, validateMap, blankMap, migrateMap, saveMap, MAP_LIMITS, type FixedMapData, type MapEntity } from '../src/core/map/fixed';
import { stateHash } from '../src/core/net/hash';
import { serialize, deserialize } from '../src/core/serialize';
import { TERRAIN } from '../src/core/constants';
import { RNG } from '../src/core/rng';
import type { GameConfig, GameMap } from '../src/core/types';

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

// ---------------------------------------------------------------------------------------------------------------
// Utilitários dos testes
// ---------------------------------------------------------------------------------------------------------------

/** FNV-1a de terreno + decor + nós (ordem y, x) + inícios de um GameMap gerado. */
function hashGenerated(m: GameMap): number {
  let h = 2166136261 >>> 0;
  const mix = (v: number) => { h ^= (v | 0) >>> 0; h = Math.imul(h, 16777619) >>> 0; };
  mix(m.w); mix(m.h);
  for (let i = 0; i < m.w * m.h; i++) mix(m.terrain[i]);
  for (let i = 0; i < m.w * m.h; i++) mix(m.decor[i]);
  const nodes = [...m.nodes.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  mix(nodes.length);
  for (const n of nodes) { mix(n.x); mix(n.y); mix(n.type.length); for (let i = 0; i < n.type.length; i++) mix(n.type.charCodeAt(i)); mix(Math.round(n.amount)); }
  mix(m.starts.length);
  for (const s of m.starts) { mix(s.x); mix(s.y); }
  return h >>> 0;
}

const decode = (d: FixedMapData) => base64ToBytes(d.terrain, d.w * d.h);
/** Cópia do mapa com o terreno alterado por uma função (x, y, atual) → novo. */
function withTerrain(d: FixedMapData, f: (x: number, y: number, t: number) => number): FixedMapData {
  const t = decode(d);
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) t[y * d.w + x] = f(x, y, t[y * d.w + x]);
  return { ...d, terrain: bytesToBase64(t) };
}
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);
const errors = (d: FixedMapData, opts?: Parameters<typeof validateMap>[1]) => validateMap(d, opts).filter((i) => i.level === 'error');
const warns = (d: FixedMapData, opts?: Parameters<typeof validateMap>[1]) => validateMap(d, opts).filter((i) => i.level === 'warn');
const generated = () => { resetNodeSeq(); return canonicalize(mapToData(generateMap(80, 80, 42, 2), 'gerado')); };
const BLANK = blankMap(48, 48, 2, 1);

describe('gerador de mapas (regressão após as extrações)', () => {
  it('generateMap produz exatamente o mesmo terreno, decor, nós e inícios de antes do refactor', () => {
    // Hashes gravados com o código anterior à extração de deriveDeepWater/placeStartResources/circleStarts
    const expected: [number, number, number, number, 'continental' | 'lakes' | 'mountains' | 'desert', boolean, number, number][] = [
      [80, 80, 42, 2, 'continental', false, 1842007216, 959],
      [112, 112, 7, 4, 'lakes', false, 4023986883, 1337],
      [144, 144, 99, 3, 'mountains', false, 17240322, 3307],
      [80, 80, 5, 2, 'desert', true, 2984615489, 237],
    ];
    for (const [w, h, seed, p, type, clear, hash, nodes] of expected) {
      resetNodeSeq();
      const m = generateMap(w, h, seed, p, type, clear);
      expect(m.nodes.size, `${w}x${h} ${type} ${seed}`).toBe(nodes);
      expect(hashGenerated(m), `${w}x${h} ${type} ${seed}`).toBe(hash);
    }
  });
  it('funções extraídas são exportadas e utilizáveis fora do gerador', () => {
    expect(NODE_AMOUNT.tree).toBe(150);
    expect(unitCircle(32).length).toBe(32);
    expect(typeof ensureConnectivity).toBe('function'); expect(typeof widenChokepoints).toBe('function'); expect(typeof carveCorridor).toBe('function');
    // deriveDeepWater com retângulo: pintar grama no meio de um lago devolve a água profunda vizinha a WATER
    resetNodeSeq();
    const m = mapFromData(withTerrain(BLANK, (x, y) => (x >= 10 && x <= 20 && y >= 10 && y <= 20 ? TERRAIN.WATER : TERRAIN.GRASS)));
    expect(m.terrain[15 * 48 + 15]).toBe(TERRAIN.DEEP);
    m.terrain[15 * 48 + 15] = TERRAIN.GRASS;
    deriveDeepWater(m, { x0: 15, y0: 15, x1: 15, y1: 15 });
    expect(m.terrain[15 * 48 + 14]).toBe(TERRAIN.WATER);
    expect(m.terrain[15 * 48 + 12]).toBe(TERRAIN.DEEP);
    // placeStartResources coloca comida, madeira e ouro perto de um início
    resetNodeSeq();
    const b = mapFromData(BLANK);
    placeStartResources(b, new RNG(5), b.starts[0]);
    const types = new Set([...b.nodes.values()].map((n) => n.type));
    expect(types.has('tree')).toBe(true); expect(types.has('gold')).toBe(true); expect(types.has('berry')).toBe(true);
  });
});

describe('forma canônica e hash', () => {
  it('canonicalize ordena nós por (y, x), entidades (edifícios antes, depois y, x, tipo, dono) e remove padrões', () => {
    const ents: MapEntity[] = [
      { kind: 'unit', type: 'hoplite', owner: 1, x: 5, y: 5 },
      { kind: 'building', type: 'tower', owner: 0, x: 9, y: 3, complete: true },
      { kind: 'building', type: 'house', owner: 1, x: 2, y: 3, tag: '' },
      { kind: 'building', type: 'house', owner: 0, x: 2, y: 3, complete: false },
      { kind: 'unit', type: 'villager', owner: 0, x: 1, y: 1, tag: 'x' },
    ];
    const d: FixedMapData = { ...BLANK, nodes: [['gold', 5, 9, 900], ['tree', 3, 2, 150], ['tree', 1, 2, 150]], entities: ents, startKit: true, relics: true, startTeams: [], name: '', author: undefined };
    const c = canonicalize(d);
    expect(c.nodes).toEqual([['tree', 1, 2, 150], ['tree', 3, 2, 150], ['gold', 5, 9, 900]]);
    expect(c.entities).toEqual([
      { kind: 'building', type: 'house', owner: 0, x: 2, y: 3, complete: false },
      { kind: 'building', type: 'house', owner: 1, x: 2, y: 3 },
      { kind: 'building', type: 'tower', owner: 0, x: 9, y: 3 },
      { kind: 'unit', type: 'villager', owner: 0, x: 1, y: 1, tag: 'x' },
      { kind: 'unit', type: 'hoplite', owner: 1, x: 5, y: 5 },
    ]);
    expect('startKit' in c).toBe(false); expect('relics' in c).toBe(false); expect('startTeams' in c).toBe(false);
    expect('name' in c).toBe(false); expect('author' in c).toBe(false);
    expect('entities' in canonicalize({ ...BLANK, entities: [] })).toBe(false);
    expect(canonicalize({ ...BLANK, startKit: false, relics: false, startTeams: [0, 1] })).toMatchObject({ startKit: false, relics: false, startTeams: [0, 1] });
    expect(d.nodes[0][0]).toBe('gold');   // a entrada não foi alterada
    expect(canonicalize(c)).toEqual(c);    // idempotente
  });
  it('mapHash é estável, muda com 1 tile, 1 nó ou 1 início e não muda ao renomear, variar decor ou reordenar', () => {
    const g = generated();
    const h = mapHash(g);
    expect(mapHash(JSON.parse(JSON.stringify(g)))).toBe(h);
    expect(mapHash({ ...g, name: 'outro', nameEn: 'other', author: 'eu', description: 'd', decor: bytesToBase64(new Uint8Array(g.w * g.h)) })).toBe(h);
    expect(mapHash({ ...g, nodes: [...g.nodes].reverse() })).toBe(h);
    expect(mapHash(withTerrain(g, (x, y, t) => (x === 40 && y === 40 ? (t === TERRAIN.GRASS ? TERRAIN.DIRT : TERRAIN.GRASS) : t)))).not.toBe(h);
    expect(mapHash({ ...g, nodes: g.nodes.slice(1) })).not.toBe(h);
    expect(mapHash({ ...g, nodes: [[g.nodes[0][0], g.nodes[0][1], g.nodes[0][2], g.nodes[0][3] + 1], ...g.nodes.slice(1)] })).not.toBe(h);
    expect(mapHash({ ...g, starts: [[g.starts[0][0] + 1, g.starts[0][1]], g.starts[1]] })).not.toBe(h);
    expect(mapHash({ ...g, startKit: false })).not.toBe(h);
    expect(mapHash({ ...g, entities: [{ kind: 'unit', type: 'hoplite', owner: 0, x: 40, y: 40 }] })).not.toBe(h);
    expect(mapHash({ ...g, koth: [40, 40] })).not.toBe(h);
    expect(mapHash({ ...g, relics: false })).not.toBe(h);
    expect(mapHash({ ...g, startTeams: [0, 1] })).not.toBe(h);
  });
});

describe('validateMap', () => {
  it('um mapa gerado e um mapa em branco passam sem erros', () => {
    expect(errors(generated(), { players: 2, mode: 'conquest' })).toEqual([]);
    expect(errors(BLANK, { players: 2 })).toEqual([]);
    expect(codes(warns(BLANK))).toEqual(expect.arrayContaining(['lowStartFood', 'lowStartWood']));
    expect(warns(generated()).map((i) => i.code)).not.toContain('startsDisconnected');
  });
  it('erros de tamanho, terreno e arquivo', () => {
    expect(codes(errors(blankMap(30, 30, 2, 1)))).toContain('size');
    expect(codes(errors({ ...BLANK, w: 161, h: 48 }))).toContain('size');
    expect(codes(errors({ ...BLANK, w: 160, h: 160 }))).not.toContain('size');   // 25 600 tiles é o limite
    expect(codes(errors({ ...BLANK, terrain: BLANK.terrain.slice(0, 40) }))).toContain('terrainLen');
    expect(codes(errors({ ...BLANK, decor: 'abc' }))).toContain('decorLen');
    const bad = errors(withTerrain(BLANK, (x, y, t) => (x === 3 && y === 4 ? 7 : t)));
    expect(bad[0]).toMatchObject({ code: 'badTerrain', x: 3, y: 4 });
    expect(codes(errors({ ...BLANK, description: 'x'.repeat(MAP_LIMITS.maxJsonBytes) }))).toContain('fileTooBig');
    expect(codes(errors(migrateMap({ v: 1 }) ))).toContain('size');
  });
  it('erros de inícios', () => {
    expect(codes(errors({ ...BLANK, starts: [BLANK.starts[0]] }))).toContain('startsCount');
    expect(codes(errors(BLANK, { players: 3 }))).toContain('startsCount');
    expect(codes(errors({ ...BLANK, starts: [[3, 20], [40, 20]] }))).toContain('startOut');
    const [sx, sy] = BLANK.starts[0];
    expect(errors(withTerrain(BLANK, (x, y, t) => (x === sx + 1 && y === sy - 1 ? TERRAIN.WATER : t)))[0]).toMatchObject({ code: 'startBlocked', x: sx, y: sy });
    expect(codes(errors({ ...BLANK, nodes: [['tree', sx, sy, 150]] }))).toContain('startBlocked');
    // sem kit inicial, água sob o início não é erro
    expect(codes(errors({ ...withTerrain(BLANK, (x, y, t) => (x === sx && y === sy ? TERRAIN.WATER : t)), startKit: false }))).not.toContain('startBlocked');
  });
  it('erros de nós', () => {
    expect(errors({ ...BLANK, nodes: [['gold', -1, 5, 900]] })[0]).toMatchObject({ code: 'nodeOut', x: -1, y: 5 });
    expect(codes(errors({ ...BLANK, nodes: [['gold', 48, 5, 900]] }))).toContain('nodeOut');
    const mtn = withTerrain(BLANK, (x, y, t) => (x === 20 && y === 20 ? TERRAIN.MOUNTAIN : t));
    expect(errors({ ...mtn, nodes: [['gold', 20, 20, 900]] })[0]).toMatchObject({ code: 'nodeOnBlocked', x: 20, y: 20 });
    expect(errors({ ...BLANK, nodes: [['gold', 20, 20, 900], ['tree', 20, 20, 150]] })[0]).toMatchObject({ code: 'nodeDup', x: 20, y: 20 });
    expect(errors({ ...BLANK, nodes: [['oil' as never, 20, 20, 900]] })[0]).toMatchObject({ code: 'unknownNode', params: { type: 'oil' } });
  });
  it('erros de entidades e de modo', () => {
    expect(errors({ ...BLANK, entities: [{ kind: 'unit', type: 'dragon', owner: 0, x: 20, y: 20 }] })[0]).toMatchObject({ code: 'unknownType', params: { type: 'dragon' } });
    expect(errors({ ...BLANK, entities: [{ kind: 'building', type: 'castle', owner: 0, x: 20, y: 20 }] })[0]).toMatchObject({ code: 'unknownType' });
    expect(errors({ ...BLANK, entities: [{ kind: 'unit', type: 'hoplite', owner: 2, x: 20, y: 20 }] })[0]).toMatchObject({ code: 'badOwner', params: { owner: 2 } });
    expect(errors({ ...BLANK, nodes: [['gold', 20, 20, 900]], entities: [{ kind: 'building', type: 'tower', owner: 0, x: 20, y: 20 }] })[0]).toMatchObject({ code: 'entityOverlap', x: 20, y: 20 });
    expect(codes(errors({ ...BLANK, entities: [{ kind: 'building', type: 'house', owner: 0, x: 20, y: 20 }, { kind: 'building', type: 'house', owner: 1, x: 21, y: 21 }] }))).toEqual(['entityOverlap']);
    expect(codes(errors(withTerrain({ ...BLANK, entities: [{ kind: 'unit', type: 'hoplite', owner: 0, x: 20, y: 20 }] }, (x, y, t) => (x === 20 && y === 20 ? TERRAIN.WATER : t))))).toContain('entityOverlap');
    expect(codes(errors({ ...BLANK, entities: [{ kind: 'building', type: 'house', owner: 0, x: 47, y: 47 }] }))).toContain('entityOverlap');
    // entidades válidas não geram erro
    expect(errors({ ...BLANK, entities: [{ kind: 'building', type: 'tower', owner: 0, x: 20, y: 20 }, { kind: 'unit', type: 'hoplite', owner: 1, x: 30, y: 30 }] })).toEqual([]);
    // regicídio sem CC nem kit
    const [sx, sy] = BLANK.starts[0];
    expect(codes(errors({ ...BLANK, startKit: false }, { mode: 'regicide', players: 2 }))).toEqual(['regicideNoTc', 'regicideNoTc']);
    expect(codes(errors({ ...BLANK, startKit: false, entities: [{ kind: 'building', type: 'town_center', owner: 0, x: sx - 1, y: sy - 1 }, { kind: 'building', type: 'town_center', owner: 1, x: BLANK.starts[1][0] - 1, y: BLANK.starts[1][1] - 1 }] }, { mode: 'regicide' }))).toEqual([]);
    expect(codes(errors(BLANK, { mode: 'regicide' }))).toEqual([]);
  });
  it('avisos: regiões, gargalos, bolsões, acesso a nós, recursos iniciais, colina, maravilha, IA sem CC', () => {
    // muro de montanha vertical separa os dois inícios (x = 24) → regiões diferentes e região principal < 60%
    const split = withTerrain(BLANK, (x, y, t) => (x === 24 ? TERRAIN.MOUNTAIN : t));
    expect(codes(warns(split))).toEqual(expect.arrayContaining(['startsDisconnected', 'mainComponentSmall']));
    // uma passagem de 1 tile no muro a ≤ 10 tiles de um início → gargalo
    const [sx, sy] = BLANK.starts[0];
    const gapY = Math.min(47, sy + 4);
    const gap = withTerrain(BLANK, (x, y, t) => (x === sx + 6 && y !== gapY ? TERRAIN.MOUNTAIN : t));
    const choke = warns(gap).find((i) => i.code === 'chokepoint')!;
    expect(choke.y).toBe(gapY); expect(Math.abs(choke.x! - (sx + 6))).toBeLessThanOrEqual(1);
    // bolsão fechado por montanha (2 tiles longe dos inícios)
    const pocket = withTerrain(BLANK, (x, y, t) => (x >= 1 && x <= 4 && y >= 1 && y <= 3 && !(y === 2 && (x === 2 || x === 3)) ? TERRAIN.MOUNTAIN : t));
    expect(warns(pocket).find((i) => i.code === 'pocket')).toMatchObject({ x: 2, y: 2, params: { tiles: 2 } });
    // clareira fechada só por árvores não é bolsão
    const grove = { ...BLANK, nodes: [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]].map(([x, y]) => ['tree', x, y, 150] as FixedMapData['nodes'][number]) };
    expect(codes(warns(grove))).not.toContain('pocket');
    // ouro cercado de montanha → sem acesso; árvore cercada de árvores é normal
    const ring = withTerrain(BLANK, (x, y, t) => (Math.max(Math.abs(x - 30), Math.abs(y - 30)) === 1 ? TERRAIN.MOUNTAIN : t));
    expect(warns({ ...ring, nodes: [['gold', 30, 30, 900]] }).find((i) => i.code === 'nodeNoAccess')).toMatchObject({ x: 30, y: 30 });
    expect(codes(warns({ ...grove, nodes: [...grove.nodes, ['tree', 2, 2, 150]] }))).not.toContain('nodeNoAccess');
    // comida/madeira perto do início (raios 14/16)
    const fed = { ...BLANK, nodes: [['berry', sx + 5, sy, 175], ['tree', sx, sy + 6, 150]] as FixedMapData['nodes'] };
    const fw = warns(fed);
    expect(fw.filter((i) => i.code === 'lowStartFood').length).toBe(1);
    expect(fw.filter((i) => i.code === 'lowStartWood').length).toBe(1);
    expect(fw.find((i) => i.code === 'lowStartFood')).toMatchObject({ x: BLANK.starts[1][0], y: BLANK.starts[1][1] });
    // colina do KotH dentro do bolsão → inalcançável; no centro → alcançável
    expect(codes(warns({ ...pocket, koth: [2, 2] }, { mode: 'koth' }))).toContain('kothUnreachable');
    expect(codes(warns(BLANK, { mode: 'koth' }))).not.toContain('kothUnreachable');
    expect(codes(warns(split, { mode: 'koth' }))).toContain('kothUnreachable');
    // maravilha completa pré-colocada
    expect(codes(warns({ ...BLANK, entities: [{ kind: 'building', type: 'wonder_zeus', owner: 0, x: 20, y: 20 }] }))).toContain('wonderComplete');
    expect(codes(warns({ ...BLANK, entities: [{ kind: 'building', type: 'wonder_zeus', owner: 0, x: 20, y: 20, complete: false }] }))).not.toContain('wonderComplete');
    // IA sem CC só quando informado quem é IA
    expect(codes(warns({ ...BLANK, startKit: false }))).not.toContain('aiNoTc');
    expect(warns({ ...BLANK, startKit: false }, { ai: [false, true] }).filter((i) => i.code === 'aiNoTc')).toEqual([{ level: 'warn', code: 'aiNoTc', x: BLANK.starts[1][0], y: BLANK.starts[1][1], params: { player: 2 } }]);
    expect(codes(warns(BLANK, { ai: [true, true] }))).not.toContain('aiNoTc');
  });
  it('nunca lança com dados malformados', () => {
    expect(codes(validateMap(migrateMap({})))).toContain('size');
    expect(codes(validateMap({ ...BLANK, nodes: [null as never, ['gold', 'a' as never, 2, 3]], entities: [null as never, { kind: 'x' as never, type: 1 as never, owner: 0, x: 0, y: 0 }], starts: [[1, 2], 'x' as never] }))).toEqual(expect.arrayContaining(['unknownNode', 'nodeOut', 'unknownType', 'startsCount']));
  });
});

describe('blankMap, migrateMap, mapFromData', () => {
  it('blankMap é grama com decor por ruído, inícios em círculo e sem nós; determinístico', () => {
    const b = blankMap(80, 80, 4, 3);
    expect(b).toEqual(blankMap(80, 80, 4, 3));
    expect(b.starts.length).toBe(4); expect(b.nodes).toEqual([]); expect('entities' in b).toBe(false);
    const t = decode(b); expect(t.every((v) => v === TERRAIN.GRASS)).toBe(true);
    const d = base64ToBytes(b.decor, 80 * 80); expect(new Set(Array.from(d)).size).toBeGreaterThan(10);
    for (const [x, y] of b.starts) { expect(x).toBeGreaterThanOrEqual(8); expect(x).toBeLessThanOrEqual(71); expect(y).toBeGreaterThanOrEqual(8); expect(y).toBeLessThanOrEqual(71); }
    expect(errors(b, { players: 4 })).toEqual([]);
    // decor idêntico ao de generateMap com a mesma semente (mesma fórmula makeNoise(seed + 202))
    expect(b.decor).toBe(mapToData(generateMap(80, 80, 3, 4)).decor);
  });
  it('migrateMap aceita objeto sem v (ou de outra versão) e só lança se não for objeto', () => {
    const { v: _v, ...noV } = BLANK; void _v;
    const m = migrateMap(noV);
    expect(m.v).toBe(1); expect(m.terrain).toBe(BLANK.terrain); expect(m).not.toBe(noV);
    expect(migrateMap({ ...BLANK, v: 7 }).v).toBe(1);
    expect(migrateMap({}).nodes).toEqual([]);
    expect(() => migrateMap(null)).toThrow(); expect(() => migrateMap('x')).toThrow(); expect(() => migrateMap([1])).toThrow();
    resetNodeSeq();
    expect(mapFromData(noV as FixedMapData).w).toBe(48);
  });
  it('mapFromData rejeita tamanho fora dos limites e deriva água profunda quando o arquivo não tem DEEP', () => {
    expect(() => mapFromData(blankMap(30, 30, 2, 1))).toThrow();
    expect(() => mapFromData({ ...BLANK, w: 200, h: 200 })).toThrow();
    const lake = withTerrain(BLANK, (x, y) => (x >= 10 && x <= 20 && y >= 10 && y <= 20 ? TERRAIN.WATER : TERRAIN.GRASS));
    expect(decode(lake).includes(TERRAIN.DEEP)).toBe(false);
    resetNodeSeq();
    const m = mapFromData(lake);
    expect(m.terrain[15 * 48 + 15]).toBe(TERRAIN.DEEP);
    expect(m.terrain[10 * 48 + 10]).toBe(TERRAIN.WATER);
    expect(m.blocked[15 * 48 + 15]).toBe(1);
    // arquivo com DEEP explícito é respeitado tal qual
    const forced = withTerrain(lake, (x, y, t) => (x === 10 && y === 10 ? TERRAIN.DEEP : t));
    resetNodeSeq();
    const f = mapFromData(forced);
    expect(f.terrain[10 * 48 + 10]).toBe(TERRAIN.DEEP); expect(f.terrain[15 * 48 + 15]).toBe(TERRAIN.WATER);
  });
  it('determinismo: mapFromData duas vezes dá as mesmas chaves de nós na mesma ordem', () => {
    const g = generated();
    resetNodeSeq(); const a = [...mapFromData(g).nodes.keys()];
    resetNodeSeq(); const b = [...mapFromData(g).nodes.keys()];
    expect(a).toEqual(b);
    expect(a.length).toBe(g.nodes.length);
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThan(a[i - 1]);
  });
});

describe('saveMap', () => {
  it('saveMap(createGame({ map: f })) é canonicalize(f) (terreno, nós, inícios, metadados) e exporta entidades em ordem canônica', () => {
    const f: FixedMapData = { ...generated(), nodes: [...generated().nodes].reverse(), id: 'gerado', nameEn: 'Generated', author: 'teste', description: 'd', startTeams: [0, 1], koth: [40, 40] };
    const meta = { id: f.id, name: f.name, nameEn: f.nameEn, author: f.author, description: f.description, startKit: false, startTeams: f.startTeams, koth: f.koth, relics: false };
    const state = createGame({ seed: 9, mapSize: 'small', players, map: { ...f, startKit: false, relics: false } });
    const saved = saveMap(state, meta);
    const expected = canonicalize({ ...f, startKit: false, relics: false });
    // Enquanto createGame não honrar startKit:false (trabalho paralelo), o kit inicial aparece como entidades: compara sem elas
    const kitStillPlaced = [...state.buildings.values()].some((b) => b.type === 'town_center');
    const { entities: savedEnts, ...savedRest } = saved;
    if (kitStillPlaced) { expect(savedRest).toEqual(expected); expect(savedEnts?.length).toBeGreaterThan(0); }
    else expect(saved).toEqual(expected);
    expect(saved).toEqual(canonicalize(saved));
    // com kit: 2 CCs (edifícios antes das unidades), unidades em tiles inteiros, dono válido, resultado canônico
    const s2 = saveMap(createGame({ seed: 9, mapSize: 'small', players, map: f }), { name: 'n' });
    const ents = s2.entities!;
    expect(ents.filter((e) => e.kind === 'building' && e.type === 'town_center').length).toBe(2);
    const firstUnit = ents.findIndex((e) => e.kind === 'unit');
    expect(ents.slice(0, firstUnit).every((e) => e.kind === 'building')).toBe(true);
    expect(ents.slice(firstUnit).every((e) => e.kind === 'unit' && Number.isInteger(e.x) && Number.isInteger(e.y) && e.owner < 2)).toBe(true);
    expect(ents.some((e) => 'complete' in e)).toBe(false);   // CCs completos: campo padrão omitido
    expect(s2.name).toBe('n'); expect(s2.nodes).toEqual(expected.nodes);
    expect(mapHash(s2)).not.toBe(mapHash(f));   // entidades entram no hash
  });
});
