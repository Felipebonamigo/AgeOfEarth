// Justiça de posição (docs/EDITOR.md, "Justiça de posição"): as regras da IA e do motor que dependiam da orientação
// absoluta (norte primeiro, kit ao sul, casas com y fixo) agora usam o vetor ponto→centro do mapa ou o lado de quem chega;
// num mapa simétrico os dois lados tomam decisões espelhadas. A ordem das IAs gira e todas começam no mesmo instante.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { createGame, tick, aiThinkOrder } from '../src/core/sim/game';
import { applyCommand } from '../src/core/sim/commands';
import { blankMap, type FixedMapData } from '../src/core/map/fixed';
import { centerFrame, towardFrame, frameTile, frameRound, frameCompare, frameOffset, spiralSearch, spiralSearchFrame, IDENTITY_FRAME, idx, inBounds, isPassable, type Frame } from '../src/core/map/grid';
import { nearestFreeTile } from '../src/core/map/pathfinding';
import { nearestNode } from '../src/core/sim/queries';
import { findBuildSpot, sealsNode } from '../src/core/sim/ai';
import { canPlaceBuilding, findSpawnTile, placeBuilding, pushUnitsOutOfTile, spawnUnit } from '../src/core/sim/entities';
import { usePower } from '../src/core/sim/powers';
import { migrateMap } from '../src/core/map/fixed';
import { serialize, deserialize } from '../src/core/serialize';
import { wouldSeal } from '../src/core/map/components';
import { BUILDINGS } from '../src/core/data';
import { RNG } from '../src/core/rng';
import { SIM_VERSION, TICK_RATE, type Difficulty, type NodeType } from '../src/core/constants';
import { Session } from '../src/game/session';
import type { GameState, Player } from '../src/core/types';

// Quem pensa (e em que ordem) em cada tick: a IA real é usada, só com um registro em volta de aiThink.
const thinkLog = vi.hoisted(() => ({ on: false, calls: [] as { tick: number; id: number }[] }));
vi.mock('../src/core/sim/ai', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/core/sim/ai')>();
  return { ...mod, aiThink: (s: GameState, p: Player) => { if (thinkLog.on && p.ai && s.tick >= p.ai.nextThink) thinkLog.calls.push({ tick: s.tick, id: p.id }); mod.aiThink(s, p); } };
});

const W = 64, H = 64;
/** Mapa de grama W×H com os inícios e nós dados (sem relíquias). */
function mapWith(starts: [number, number][], nodes: [NodeType, number, number][] = []): FixedMapData {
  const base = blankMap(W, H, starts.length, 7);
  const sorted = nodes.map(([t, x, y]) => [t, x, y, t === 'gold' ? 2000 : 150] as [NodeType, number, number, number]).sort((a, b) => a[2] - b[2] || a[1] - b[1]);
  return { ...base, starts, nodes: sorted, relics: false };
}
function game(map: FixedMapData, ai = false): GameState {
  return createGame({ seed: 3, mapSize: 'small', map, players: map.starts.map((_, i) => ({ name: `P${i}`, god: 'zeus', isAI: ai, difficulty: 'normal' as const })) });
}
const tcOf = (s: GameState, owner: number) => [...s.buildings.values()].find((b) => b.owner === owner && b.type === 'town_center')!;
const kitOf = (s: GameState, owner: number) => [...s.units.values()].filter((u) => u.owner === owner).map((u) => ({ type: u.type, x: u.x, y: u.y }));
const key = (u: { type: string; x: number; y: number }) => `${u.type}@${u.x},${u.y}`;

describe('referenciais de orientação (grid)', () => {
  it('centerFrame: espelho em x/y nega o sinal do eixo, rotação de 180° nega os dois, transposição troca os eixos', () => {
    const rng = new RNG(11);
    for (let k = 0; k < 400; k++) {
      const x = rng.range(0, W), y = rng.range(0, H);
      const f = centerFrame({ w: W, h: H }, x, y);
      if (x !== W / 2) expect(centerFrame({ w: W, h: H }, W - x, y)).toEqual({ ...f, sx: -f.sx });
      if (y !== H / 2) expect(centerFrame({ w: W, h: H }, x, H - y)).toEqual({ ...f, sy: -f.sy });
      if (x !== W / 2 && y !== H / 2) expect(centerFrame({ w: W, h: H }, W - x, H - y)).toEqual({ sx: -f.sx, sy: -f.sy, swap: f.swap });
      if (Math.abs(x - W / 2) !== Math.abs(y - H / 2)) expect(centerFrame({ w: W, h: H }, y, x)).toEqual({ sx: f.sy, sy: f.sx, swap: !f.swap });
    }
    // noroeste = identidade (a orientação antiga do código); sobre um eixo, o sinal segue o do outro eixo
    expect(centerFrame({ w: W, h: H }, 12, 10)).toEqual(IDENTITY_FRAME);
    expect(centerFrame({ w: W, h: H }, W / 2, 50)).toEqual({ sx: -1, sy: -1, swap: false });
  });
  it('spiralSearchFrame: identidade = spiralSearch; espelho/rotação/transposição visitam os tiles espelhados na mesma ordem', () => {
    const visit = (f: Frame | null, cx: number, cy: number) => { const out: string[] = []; const p = (x: number, y: number) => { out.push(`${x},${y}`); return false; }; if (f) spiralSearchFrame(cx, cy, 5, p, f); else spiralSearch(cx, cy, 5, p); return out; };
    expect(visit(IDENTITY_FRAME, 20, 20)).toEqual(visit(null, 20, 20));
    const base = visit(IDENTITY_FRAME, 20, 21).map((s) => s.split(',').map(Number));
    const mirrorY = visit({ sx: 1, sy: -1, swap: false }, 20, H - 1 - 21).map((s) => s.split(',').map(Number));
    expect(mirrorY).toEqual(base.map(([x, y]) => [x, H - 1 - y]));
    const rot = visit({ sx: -1, sy: -1, swap: false }, W - 1 - 20, H - 1 - 21).map((s) => s.split(',').map(Number));
    expect(rot).toEqual(base.map(([x, y]) => [W - 1 - x, H - 1 - y]));
    const tr = visit({ sx: 1, sy: 1, swap: true }, 21, 20).map((s) => s.split(',').map(Number));
    expect(tr).toEqual(base.map(([x, y]) => [y, x]));
  });
  it('frameTile: no eixo espelhado um valor inteiro cai no tile espelhado exato', () => {
    expect(frameTile(28, 1)).toBe(28);
    expect(frameTile(113 - 28, -1)).toBe(112 - 28);
    expect(frameTile(20.5, -1)).toBe(20);
  });
  it('nearestFreeTile com towardFrame começa pelo lado de quem chega (antes: sempre o norte)', () => {
    const s = game(mapWith([[8, 8], [55, 55]]));
    const map = s.map;
    for (let y = 30; y < 33; y++) for (let x = 30; x < 33; x++) map.blocked[idx(map, x, y)] = 1;
    expect(nearestFreeTile(map, 31.5, 31.5, 4)).toEqual({ x: 29, y: 29 });                         // padrão: canto noroeste
    expect(nearestFreeTile(map, 31.5, 31.5, 4, towardFrame(0, 10))!.y).toBe(33);                    // vindo do sul
    expect(nearestFreeTile(map, 31.5, 31.5, 4, towardFrame(0, -10))!.y).toBe(29);                   // vindo do norte
    expect(nearestFreeTile(map, 31.5, 31.5, 4, towardFrame(10, 1))!.x).toBe(33);                    // vindo do leste
    expect(nearestFreeTile(map, 31.5, 31.5, 4, towardFrame(-10, 1))!.x).toBe(29);                   // vindo do oeste
  });
});

describe('desempates sem orientação absoluta', () => {
  it('nearestNode: com dois nós à mesma distância, fica com o mais longe do centro do mapa (e o espelho escolhe o espelho)', () => {
    // norte: nós a 5 tiles acima e abaixo do ponto; o de cima (y=5) é o mais longe do centro
    const nodesN: [NodeType, number, number][] = [['gold', 20, 5], ['gold', 20, 15]];
    const nodesS: [NodeType, number, number][] = nodesN.map(([t, x, y]) => [t, x, H - 1 - y]);
    const s = game(mapWith([[8, 30], [55, 30]], [...nodesN, ...nodesS]));
    const n = nearestNode(s, 20.5, 10.5, 'gold', 10)!;
    expect([n.x, n.y]).toEqual([20, 5]);
    const m = nearestNode(s, 20.5, H - 10.5, 'gold', 10)!;
    expect([m.x, m.y]).toEqual([20, H - 1 - 5]);   // a varredura antiga (norte primeiro) daria (20, 48), o mais perto do centro
  });
  it('findSpawnTile: sem ponto de encontro, a unidade nasce do lado do CC voltado ao centro, espelhada entre os inícios', () => {
    const s = game(mapWith([[16, 12], [16, H - 1 - 12]]));
    const a = findSpawnTile(s, tcOf(s, 0)), b = findSpawnTile(s, tcOf(s, 1));
    expect(a.y).toBeGreaterThan(tcOf(s, 0).y);               // norte: ao sul do CC (rumo ao centro)
    expect(b).toEqual({ x: a.x, y: H - a.y });               // sul: o espelho exato
  });
});

describe('kit inicial voltado ao centro do mapa', () => {
  // inícios nos quatro quadrantes, espelhados em x e em y (W - 1 - x é o tile espelho)
  const NW: [number, number] = [14, 12];
  const quad: [number, number][] = [NW, [W - 1 - NW[0], NW[1]], [W - 1 - NW[0], H - 1 - NW[1]], [NW[0], H - 1 - NW[1]]];
  it('nos 4 quadrantes: cidadãos do lado do CC voltado ao centro, batedor rumo ao centro no outro eixo; kits espelhados tile a tile', () => {
    const s = game(mapWith(quad));
    const nw = kitOf(s, 0);
    expect(nw.filter((u) => u.type === 'villager')).toHaveLength(5);
    for (let i = 0; i < 4; i++) {
      const tc = tcOf(s, i), f = centerFrame(s.map, tc.x, tc.y);
      expect(f.swap).toBe(false);                            // |dy| > |dx|: fileira em y
      for (const u of kitOf(s, i)) {
        if (u.type === 'villager') expect((u.y - tc.y) * f.sy).toBeGreaterThan(2);
        else expect((u.x - tc.x) * f.sx).toBeGreaterThan(2);
      }
      // espelho do noroeste: x → W − x no leste, y → H − y no sul
      const mx = i === 1 || i === 2, my = i === 2 || i === 3;
      const expected = nw.map((u) => key({ type: u.type, x: mx ? W - u.x : u.x, y: my ? H - u.y : u.y })).sort();
      expect(kitOf(s, i).map(key).sort()).toEqual(expected);
    }
  });
  it('início com o centro mais longe em x (mapa leste×oeste): a fileira vira coluna — o kit é o transposto', () => {
    const s = game(mapWith(quad));
    const t = game(mapWith(quad.map(([x, y]) => [y, x] as [number, number])));
    for (let i = 0; i < 4; i++) {
      const tc = tcOf(t, i), f = centerFrame(t.map, tc.x, tc.y);
      expect(f.swap).toBe(true);
      for (const u of kitOf(t, i)) if (u.type === 'villager') expect((u.x - tc.x) * f.sx).toBeGreaterThan(2);
      expect(kitOf(t, i).map(key).sort()).toEqual(kitOf(s, i).map((u) => key({ type: u.type, x: u.y, y: u.x })).sort());
    }
  });
});

describe('findBuildSpot', () => {
  /** Mapa simétrico em y com obstáculos (árvores e ouro) e dois inícios espelhados. */
  function symmetric(): GameState {
    const nodes: [NodeType, number, number][] = [];
    for (let x = 8; x < 40; x += 3) nodes.push(['tree', x, 20]);
    nodes.push(['gold', 24, 8], ['gold', 25, 8], ['tree', 30, 14], ['tree', 31, 14], ['tree', 12, 16], ['berry', 22, 17]);
    const all = [...nodes, ...nodes.map(([t, x, y]) => [t, x, H - 1 - y] as [NodeType, number, number])];
    const s = game(mapWith([[20, 12], [20, H - 1 - 12]], all));
    // um edifício de cada lado, espelhado (a pegada 2×2 em (27, 10) vira (27, H − 10 − 2))
    placeBuilding(s, 0, 'house', 27, 10, true); placeBuilding(s, 1, 'house', 27, H - 10 - 2, true);
    return s;
  }
  const TYPES = ['house', 'temple', 'barracks', 'market', 'farm', 'tower', 'granary', 'academy'];
  it('invariante a espelho num mapa simétrico: o lado sul acha o espelho exato do local do norte', () => {
    const s = symmetric();
    const tc0 = tcOf(s, 0);
    const rng = new RNG(5);
    let checked = 0;
    for (let k = 0; k < 120; k++) {
      const type = TYPES[k % TYPES.length], def = BUILDINGS[type];
      const ax = tc0.x + rng.range(-9, 9), ay = tc0.y + rng.range(-7, 9);
      const minR = k % 3, maxR = 6 + (k % 9);
      const a = findBuildSpot(s, s.players[0], type, ax, ay, minR, maxR);
      const b = findBuildSpot(s, s.players[1], type, ax, H - ay, minR, maxR);
      if (!a) { expect(b).toBeNull(); continue; }
      expect(b).toEqual({ x: a.x, y: H - a.y - def.h });
      checked++;
    }
    expect(checked).toBeGreaterThan(80);
  });
  it('templo com âncora no CC: fica à mesma distância dos dois lados e do lado do centro do mapa nos dois inícios', () => {
    const s = symmetric();
    const n = findBuildSpot(s, s.players[0], 'temple', tcOf(s, 0).x, tcOf(s, 0).y, 4, 12)!;
    const m = findBuildSpot(s, s.players[1], 'temple', tcOf(s, 1).x, tcOf(s, 1).y, 4, 12)!;
    const def = BUILDINGS.temple;
    expect(m).toEqual({ x: n.x, y: H - n.y - def.h });
  });
  it('a ordem em cache é a mesma da ordenação direta de todos os candidatos (referência)', () => {
    const s = symmetric();
    const ref = (p: Player, type: string, ax: number, ay: number, minR: number, maxR: number) => {
      const def = BUILDINGS[type], map = s.map;
      const needsMargin = !!(def.trains || def.dropoff || def.worship || def.scholars || def.trade || def.wonder || def.titanGate);
      const ok = (x: number, y: number) => {
        if (!canPlaceBuilding(s, p, type, x, y, false).ok) return false;
        if (!def.passable && !def.wall && wouldSeal(map, x, y, def.w, def.h)) return false;
        if (!def.passable && sealsNode(map, x, y, def.w, def.h)) return false;
        if (!needsMargin) return true;
        for (let yy = y - 1; yy <= y + def.h; yy++) for (let xx = x - 1; xx <= x + def.w; xx++) {
          if (!inBounds(map, xx, yy)) return false;
          const i = idx(map, xx, yy), bid = map.buildingAt[i];
          if (bid !== -1) { const ob = s.buildings.get(bid); if (ob && !BUILDINGS[ob.type].passable && !def.passable) return false; }
          if (def.farm && map.nodeAt[i] === -1 && !isPassable(map, xx, yy) && map.buildingAt[i] === -1) return false;
        }
        return true;
      };
      const cands: { x: number; y: number; s: number; c: number }[] = [];
      for (let y = Math.floor(ay - def.h / 2 - maxR); y <= Math.ceil(ay - def.h / 2 + maxR); y++) for (let x = Math.floor(ax - def.w / 2 - maxR); x <= Math.ceil(ax - def.w / 2 + maxR); x++) {
        const fx = x + def.w / 2, fy = y + def.h / 2, ch = Math.max(Math.abs(fx - ax), Math.abs(fy - ay));
        if (ch < minR || ch > maxR + 0.5) continue;
        cands.push({ x, y, s: (fx - ax) * (fx - ax) + (fy - ay) * (fy - ay), c: (fx - map.w / 2) * (fx - map.w / 2) + (fy - map.h / 2) * (fy - map.h / 2) });
      }
      const f = centerFrame(map, ax, ay);
      cands.sort((p1, q) => p1.s - q.s || q.c - p1.c || frameCompare(f, p1.x, p1.y, q.x, q.y));
      for (const c of cands) if (ok(c.x, c.y)) return { x: c.x, y: c.y };
      return null;
    };
    const rng = new RNG(9);
    for (let k = 0; k < 150; k++) {
      const type = TYPES[k % TYPES.length], p = s.players[k % 2];
      const tc = tcOf(s, p.id);
      // âncoras com frações "redondas" (.0/.5, como tc.x ± 7) e arbitrárias (enemyDir × 6), repetidas para usar o cache
      const ax = k % 4 === 0 ? tc.x + 7 : tc.x + rng.range(-10, 10), ay = k % 4 === 0 ? tc.y - 5 : tc.y + rng.range(-10, 10);
      const minR = k % 4, maxR = 4 + (k % 15);
      expect(findBuildSpot(s, p, type, ax, ay, minR, maxR)).toEqual(ref(p, type, ax, ay, minR, maxR));
    }
  });
});

describe('findBuildSpot não tira o último acesso de um recurso', () => {
  it('uma mina não encosta no único veio de ouro ocupando os tiles livres dele (antes: o nó sumia e os mineiros cruzavam o mapa)', () => {
    // veio de ouro num bolsão: só os 2 tiles ao norte dele são livres (rochas em volta)
    const s = game(mapWith([[14, 12], [49, 51]], [['gold', 30, 20], ['tree', 29, 20], ['tree', 31, 20], ['tree', 29, 21], ['tree', 30, 21], ['tree', 31, 21], ['tree', 28, 19], ['tree', 31, 19]]));
    const gold = [...s.map.nodes.values()].find((n) => n.type === 'gold')!;
    expect(sealsNode(s.map, 29, 18, 2, 2)).toBe(true);    // cobre (29..30, 18..19): os dois acessos
    expect(sealsNode(s.map, 26, 16, 2, 2)).toBe(false);
    for (let k = 0; k < 20; k++) {
      const spot = findBuildSpot(s, s.players[0], 'mine', gold.x + 0.5 + (k % 5) - 2, gold.y - 1 + Math.floor(k / 5) - 2, 0, 8);
      expect(spot).not.toBeNull();
      placeBuilding(s, 0, 'mine', spot!.x, spot!.y, true);
      let free = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && s.map.blocked[idx(s.map, gold.x + dx, gold.y + dy)] === 0) free++;
      expect(free).toBeGreaterThan(0);
      s.buildings.get([...s.buildings.keys()].pop()!)!.dead = true;
      // desfaz a mina (bloqueios) para a próxima âncora
      for (let y = spot!.y; y < spot!.y + 2; y++) for (let x = spot!.x; x < spot!.x + 2; x++) { s.map.blocked[idx(s.map, x, y)] = 0; s.map.buildingAt[idx(s.map, x, y)] = -1; }
    }
  });
});

describe('ordem e início das IAs', () => {
  it('todas as IAs começam a pensar no mesmo tick (antes: 2 + índice segundos)', () => {
    const s = game(mapWith([[14, 12], [49, 12], [49, 51], [14, 51]]), true);
    expect(new Set(s.players.map((p) => p.ai!.nextThink)).size).toBe(1);
  });
  it('aiThinkOrder: em 2n rodadas cada jogador abre a vez 2 vezes e cada par se alterna exatamente (sentido alterna a cada n)', () => {
    for (const n of [2, 3, 4]) {
      const first = new Array(n).fill(0), before = Array.from({ length: n }, () => new Array(n).fill(0));
      for (let r = 0; r < 2 * n; r++) {
        const o = aiThinkOrder(r, n);
        expect([...o].sort()).toEqual(Array.from({ length: n }, (_, k) => k));   // permutação
        first[o[0]]++;
        for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) before[o[a]][o[b]]++;
      }
      expect(first).toEqual(new Array(n).fill(2));
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) expect(before[i][j]).toBe(n);
    }
  });
  /** Partida só de IAs (mapa pequeno gerado) por `minutes`; conta quem abre a vez nos ticks em que 2+ IAs pensam juntas. */
  function countFirsts(n: number, difficulty: Difficulty, minutes: number) {
    const s = createGame({ seed: 5, mapSize: 'small', players: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, god: 'zeus', isAI: true, difficulty })) });
    thinkLog.calls = []; thinkLog.on = true;
    try { for (let i = 0; i < minutes * 60 * TICK_RATE; i++) tick(s); } finally { thinkLog.on = false; }
    const byTick = new Map<number, number[]>();
    for (const c of thinkLog.calls) { const l = byTick.get(c.tick) ?? []; l.push(c.id); byTick.set(c.tick, l); }
    const first = new Array(n).fill(0), before = Array.from({ length: n }, () => new Array(n).fill(0));
    let rounds = 0;
    for (const ids of byTick.values()) {
      if (ids.length < 2) continue;
      rounds++; first[ids[0]]++;
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) before[ids[a]][ids[b]]++;
    }
    return { s, first, before, rounds };
  }
  // Na 1ª correção o rodízio seguia floor(tick / 20): com a IA Fácil (a cada 40 ticks) o jogador 0 abria todas as vezes
  // (1v1: 1349 × 0 em 45 min; 4 IAs: 674/0/675/0) e com a Difícil (15 ticks) em 3 IAs o jogador 2 abria o dobro.
  it.each([[2, 'easy'], [4, 'easy'], [3, 'hard'], [3, 'brutal']] as [number, Difficulty][])('%i IAs no %s: cada uma abre a vez 1/n das rodadas e cada par se alterna', (n, difficulty) => {
    const { s, first, before, rounds } = countFirsts(n, difficulty, 3);
    expect(s.aiRound).toBe(rounds);
    expect(rounds).toBeGreaterThan(80);
    expect(Math.max(...first) - Math.min(...first)).toBeLessThanOrEqual(1);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(Math.abs(before[i][j] - before[j][i])).toBeLessThanOrEqual(n);
  });
  it('aiRound é salvo e um save antigo (sem o campo) começa da rodada 0', () => {
    const s = createGame({ seed: 5, mapSize: 'small', players: [0, 1].map((i) => ({ name: `P${i}`, god: 'zeus', isAI: true, difficulty: 'normal' as const })) });
    for (let i = 0; i < 10 * TICK_RATE; i++) tick(s);
    expect(s.aiRound).toBeGreaterThan(5);
    expect(deserialize(serialize(s)).aiRound).toBe(s.aiRound);
    const old = JSON.parse(serialize(s)); delete old.aiRound;
    expect(deserialize(JSON.stringify(old)).aiRound).toBe(0);
  });
});

describe('ataque a um edifício: destino bloqueado pelo lado de quem chega', () => {
  it('grupos espelhados (do sul e do norte) rumo ao centro de um CC recebem destinos espelhados', () => {
    const s = game(mapWith([[14, 30], [49, 30]]));
    const tc = tcOf(s, 1);
    const send = (dy: number) => {
      const ids = [0, 1, 2, 3, 4, 5].map((k) => spawnUnit(s, 0, 'hoplite', tc.x - 2.5 + k, tc.y + dy).id);
      applyCommand(s, { type: 'attackMove', player: 0, ids, x: tc.x, y: tc.y });
      return ids.map((id) => s.units.get(id)!.order as { x: number; y: number });
    };
    const south = send(12), north = send(-12);
    // espelho pela linha do centro do CC: y → 2·tc.y − y (antes a espiral testava o norte primeiro para os dois grupos)
    expect(north.map((o) => `${o.x},${2 * tc.y - o.y}`).sort()).toEqual(south.map((o) => `${o.x},${o.y}`).sort());
    // e quem chega pelo sul não para na fileira de cima (a primeira que a espiral antiga testava)
    expect(south.filter((o) => o.y < tc.ty).length).toBeLessThan(south.length / 2);
  });
});

describe('replay de outra versão da simulação', () => {
  it('replay sem versão da simulação (gravado antes da v2) é recusado com mensagem clara', () => {
    const config = { seed: 1, mapSize: 'small' as const, players: [{ name: 'A', god: 'zeus', isAI: true, difficulty: 'normal' as const }, { name: 'B', god: 'zeus', isAI: true, difficulty: 'normal' as const }] };
    expect(() => Session.replay(JSON.stringify({ version: 1, config, frames: [], ticks: 0 }))).toThrow(/v1.*v2|versão/);
    const s = Session.newGame(config);
    const json = s.replayJSON()!;
    expect(JSON.parse(json).sim).toBe(SIM_VERSION);
    expect(() => Session.replay(json)).not.toThrow();
  });
});

describe('sondagem de simetria nos mapas oficiais (estado inicial)', () => {
  // Para cada parceiro de simetria do jogador 0: kit inicial, findBuildSpot com âncora no CC (templo, academia, mercado, casa,
  // quartel, torre, fazenda), nearestNode de comida/madeira/ouro a partir do CC e findSpawnTile do CC — o resultado do parceiro
  // tem de ser o transformado do do jogador 0 (a sondagem da revisão: "nenhum local" dos dois lados não conta). Antes da
  // correção: Egeu 3/30 e Estreito 0/10; na 1ª correção, Egeu 30/30 e Estreito 4/10 (desempates em (y, x) absolutos com os
  // inícios na diagonal do mapa). `extra` acrescenta os outros edifícios (celeiro, serraria, mina, estábulo, oficina, fortaleza).
  const PROBE_TYPES: [string, number, number][] = [['temple', 4, 12], ['academy', 3, 16], ['market', 3, 16], ['house', 0, 14], ['barracks', 1, 10], ['tower', 0, 6], ['farm', 1, 18]];
  const EXTRA_TYPES: [string, number, number][] = [['granary', 2, 12], ['lumber_camp', 2, 14], ['mine', 2, 14], ['stable', 1, 10], ['siege_workshop', 2, 12], ['fortress', 3, 14]];
  function probe(id: string, tf: Record<number, (x: number, y: number) => [number, number]>, types = PROBE_TYPES) {
    const map = migrateMap(JSON.parse(fs.readFileSync(`src/core/data/maps/${id}.map.json`, 'utf8')));
    const s = createGame({ seed: 7, mapSize: 'medium', map, players: map.starts.map((_, i) => ({ name: `P${i}`, god: 'zeus', isAI: true, difficulty: 'normal' as const, team: map.startTeams ? map.startTeams[i] : i })) });
    let ok = 0; const bad: string[] = [];
    const cmp = (label: string, a: [number, number] | null, b: [number, number] | null, k: number) => {
      if (!a || !b) { if (a !== b) bad.push(`${label} p${k}: ${a} × ${b}`); return; }
      const [ex, ey] = tf[k](a[0], a[1]);
      if (ex === b[0] && ey === b[1]) ok++; else bad.push(`${label} p${k}: esperado ${ex},${ey}, veio ${b[0]},${b[1]}`);
    };
    const partners = Object.keys(tf).map(Number);
    for (const k of partners) {
      const set = new Set(kitOf(s, k).map(key));
      const m = kitOf(s, 0).filter((u) => { const [x, y] = tf[k](u.x, u.y); return set.has(key({ type: u.type, x, y })); }).length;
      if (m === kitOf(s, 0).length) ok++; else bad.push(`kit p${k}: ${m}/${kitOf(s, 0).length}`);
    }
    for (const [type, minR, maxR] of types) {
      const def = BUILDINGS[type];
      const spot = (p: number): [number, number] | null => { const tc = tcOf(s, p); const r = findBuildSpot(s, s.players[p], type, tc.x, tc.y, minR, maxR, true); return r ? [r.x + def.w / 2, r.y + def.h / 2] : null; };
      for (const k of partners) cmp(`findBuildSpot ${type}`, spot(0), spot(k), k);
    }
    for (const want of ['food', 'wood', 'gold'] as const) {
      const nn = (p: number): [number, number] | null => { const tc = tcOf(s, p); const r = nearestNode(s, tc.x, tc.y, want, 18); return r ? [r.x + 0.5, r.y + 0.5] : null; };
      for (const k of partners) cmp(`nearestNode ${want}`, nn(0), nn(k), k);
    }
    const sp = (p: number): [number, number] => { const r = findSpawnTile(s, tcOf(s, p)); return [r.x, r.y]; };
    for (const k of partners) cmp('findSpawnTile', sp(0), sp(k), k);
    return { ok, bad };
  }
  it('Egeu (espelho em x, rotação de 180°, espelho em y): 30/30', () => {
    const W = 113, H = 113;
    const tf: Record<number, (x: number, y: number) => [number, number]> = { 1: (x, y) => [W - x, y], 2: (x, y) => [W - x, H - y], 3: (x, y) => [x, H - y] };
    const r = probe('egeu', tf);
    expect(r.bad).toEqual([]);
    expect(r.ok).toBe(30);
    expect(probe('egeu', tf, EXTRA_TYPES).bad).toEqual([]);
  });
  it('Estreito (rotação de 180°; inícios na diagonal do mapa): 10/10', () => {
    const W = 80, H = 80;
    const tf: Record<number, (x: number, y: number) => [number, number]> = { 1: (x, y) => [W - x, H - y] };
    const r = probe('estreito', tf);
    expect(r.bad).toEqual([]);
    expect(r.ok).toBe(10);
    expect(probe('estreito', tf, EXTRA_TYPES).bad).toEqual([]);
  });
});

describe('inícios na diagonal do mapa (|dx| = |dy|): desempates no referencial local', () => {
  // inícios no anti-diagonal de um mapa 64×64, simétricos por rotação de 180° (tile (x, y) → (63 − x, 63 − y))
  const rot = ([t, x, y]: [NodeType, number, number]): [NodeType, number, number] => [t, W - 1 - x, H - 1 - y];
  function diagonal(): GameState {
    const nodes: [NodeType, number, number][] = [['tree', 8, 40], ['tree', 9, 40], ['tree', 20, 58], ['gold', 22, 44], ['gold', 22, 45], ['berry', 10, 52], ['berry', 18, 56]];
    const s = game(mapWith([[14, 49], [49, 14]], [...nodes, ...nodes.map(rot)]));
    placeBuilding(s, 0, 'house', 18, 42, true); placeBuilding(s, 1, 'house', W - 18 - 2, H - 42 - 2, true);
    return s;
  }
  it('o CC fica exatamente na diagonal do centro (o caso em que swap é sempre false)', () => {
    const s = diagonal(), tc = tcOf(s, 0);
    expect(Math.abs(tc.x - W / 2)).toBe(Math.abs(tc.y - H / 2));
    expect(centerFrame(s.map, tc.x, tc.y).swap).toBe(false);
  });
  it('findBuildSpot com âncora no CC e à volta dele: o outro início acha a rotação exata (tipos e raios variados)', () => {
    const s = diagonal();
    const tc0 = tcOf(s, 0), tc1 = tcOf(s, 1);
    const TYPES = ['house', 'temple', 'barracks', 'market', 'farm', 'tower', 'granary', 'academy'];
    let checked = 0;
    for (let k = 0; k < 96; k++) {
      const type = TYPES[k % TYPES.length], def = BUILDINGS[type];
      // âncoras no CC e em pontos da diagonal (onde os candidatos refletidos nela empatam em tudo, menos no lado)
      const off = (k % 5) - 2;
      const ax = tc0.x + off, ay = tc0.y - off, bxA = tc1.x - off, byA = tc1.y + off;
      const minR = k % 3, maxR = 5 + (k % 10);
      const a = findBuildSpot(s, s.players[0], type, ax, ay, minR, maxR, true);
      const b = findBuildSpot(s, s.players[1], type, bxA, byA, minR, maxR, true);
      if (!a) { expect(b).toBeNull(); continue; }
      expect(b).toEqual({ x: W - a.x - def.w, y: H - a.y - def.h });
      checked++;
    }
    expect(checked).toBeGreaterThan(60);
  });
  it('findSpawnTile e nearestNode com empate de distância e de centro: rotação exata (antes: o norte nos dois)', () => {
    const s = diagonal();
    const a = findSpawnTile(s, tcOf(s, 0)), b = findSpawnTile(s, tcOf(s, 1));
    expect(b).toEqual({ x: W - a.x, y: H - a.y });
    for (const want of ['food', 'wood', 'gold'] as const) {
      const n0 = nearestNode(s, tcOf(s, 0).x, tcOf(s, 0).y, want, 20)!, n1 = nearestNode(s, tcOf(s, 1).x, tcOf(s, 1).y, want, 20)!;
      expect([n1.x, n1.y]).toEqual([W - 1 - n0.x, H - 1 - n0.y]);
    }
  });
  it('frameCompare: pontos refletidos na diagonal empatam em distância e em centro, e o referencial local os distingue igual dos dois lados', () => {
    const f0 = centerFrame({ w: W, h: H }, 14.5, 49.5), f1 = centerFrame({ w: W, h: H }, 49.5, 14.5);
    // em volta do início 0: (dx, dy) e o refletido na diagonal (−dy, −dx); no início 1, as rotações (−dx, −dy) e (dy, dx)
    for (const [dx, dy] of [[3, 1], [2, -4], [-1, 5]]) {
      expect(Math.sign(frameCompare(f0, dx, dy, -dy, -dx))).toBe(Math.sign(frameCompare(f1, -dx, -dy, dy, dx)));
      expect(frameCompare(f0, dx, dy, -dy, -dx)).not.toBe(0);
    }
  });
});

describe('resíduos de orientação absoluta (poderes, empurrões, entidades do mapa)', () => {
  // mapa espelhado em y (norte × sul), como o Egeu
  const mirrorY = ([t, x, y]: [NodeType, number, number]): [NodeType, number, number] => [t, x, H - 1 - y];
  function ns(): GameState {
    const nodes: [NodeType, number, number][] = [['tree', 12, 18], ['tree', 13, 18], ['tree', 27, 20], ['gold', 28, 14]];
    const s = game(mapWith([[18, 12], [18, H - 1 - 12]], [...nodes, ...nodes.map(mirrorY)]));
    for (let i = 0; i < 2 * TICK_RATE; i++) tick(s);   // território calculado
    return s;
  }
  const give = (s: GameState, p: number, power: string) => { s.players[p].powers.push({ id: power, used: false } as Player['powers'][number]); };
  it('Fartura: a cornucópia (2×2) fica centrada no ponto e pontos espelhados dão cornucópias espelhadas', () => {
    const s = ns();
    const tc0 = tcOf(s, 0), tc1 = tcOf(s, 1);
    const q0 = frameOffset(centerFrame(s.map, tc0.x, tc0.y), tc0.x, tc0.y, 4, 4), q1 = frameOffset(centerFrame(s.map, tc1.x, tc1.y), tc1.x, tc1.y, 4, 4);
    expect(q1).toEqual({ x: q0.x, y: H - q0.y });
    give(s, 0, 'plenty'); give(s, 1, 'plenty');
    expect(usePower(s, s.players[0], 'plenty', q0.x, q0.y).ok).toBe(true);
    expect(usePower(s, s.players[1], 'plenty', q1.x, q1.y).ok).toBe(true);
    const c0 = [...s.buildings.values()].find((b) => b.owner === 0 && b.type === 'cornucopia')!, c1 = [...s.buildings.values()].find((b) => b.owner === 1 && b.type === 'cornucopia')!;
    expect({ x: c1.tx, y: c1.ty }).toEqual({ x: c0.tx, y: H - c0.ty - 2 });
    // centrada: o centro da pegada é o ponto arredondado de forma espelhável (22,5 → 23 ao norte; 41,5 → 41 ao sul)
    const f0 = centerFrame(s.map, q0.x, q0.y);
    expect({ x: c0.x, y: c0.y }).toEqual({ x: frameRound(q0.x, f0.sx), y: frameRound(q0.y, f0.sy) });
  });
  it('Isca: com o tile do ponto ocupado, a pedra vai para o tile espelhado', () => {
    const s = ns();
    // ponto sobre uma árvore (bloqueado): a espiral procura em volta
    give(s, 0, 'lure'); give(s, 1, 'lure');
    expect(usePower(s, s.players[0], 'lure', 27.5, 20.5).ok).toBe(true);
    expect(usePower(s, s.players[1], 'lure', 27.5, H - 20.5).ok).toBe(true);
    const lures = [...s.map.nodes.values()].filter((n) => n.type === 'lure');
    expect(lures).toHaveLength(2);
    const [n, m] = lures[0].y < H / 2 ? lures : [lures[1], lures[0]];
    expect([m.x, m.y]).toEqual([n.x, H - 1 - n.y]);
  });
  it('pushUnitsOutOfTile: unidades espelhadas no tile que fecha saem por tiles espelhados (antes: o norte primeiro)', () => {
    const s = ns();
    const tx = 30, ty = 20;
    const a = spawnUnit(s, 0, 'villager', tx + 0.5, ty + 0.5), b = spawnUnit(s, 1, 'villager', tx + 0.5, H - ty - 0.5);
    const c = spawnUnit(s, 0, 'villager', tx + 0.8, ty + 0.3), d = spawnUnit(s, 1, 'villager', tx + 0.8, H - ty - 0.3);
    s.map.blocked[idx(s.map, tx, ty)] = 1; s.map.blocked[idx(s.map, tx, H - 1 - ty)] = 1;
    pushUnitsOutOfTile(s, tx, ty); pushUnitsOutOfTile(s, tx, H - 1 - ty);
    expect({ x: b.x, y: b.y }).toEqual({ x: a.x, y: H - a.y });
    expect({ x: d.x, y: d.y }).toEqual({ x: c.x, y: H - c.y });
    expect(c.x).toBeGreaterThan(tx + 1);   // no lado leste do tile, sai pelo leste
  });
  it('entidades pré-colocadas sobre um tile ocupado nascem em tiles espelhados', () => {
    const base = mapWith([[18, 12], [18, H - 1 - 12]]);
    const map: FixedMapData = { ...base, entities: [
      { kind: 'building', type: 'barracks', owner: 0, x: 30, y: 20, complete: true }, { kind: 'building', type: 'barracks', owner: 1, x: 30, y: H - 20 - BUILDINGS.barracks.h, complete: true },
      { kind: 'unit', type: 'hoplite', owner: 0, x: 31, y: 21 }, { kind: 'unit', type: 'hoplite', owner: 1, x: 31, y: H - 1 - 21 },
    ] };
    const s = game(map);
    const h0 = [...s.units.values()].find((u) => u.owner === 0 && u.type === 'hoplite')!, h1 = [...s.units.values()].find((u) => u.owner === 1 && u.type === 'hoplite')!;
    expect({ x: h1.x, y: h1.y }).toEqual({ x: h0.x, y: H - h0.y });
  });
});
