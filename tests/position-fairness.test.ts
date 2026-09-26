// Justiça de posição (docs/EDITOR.md, "Justiça de posição"): as regras da IA e do motor que dependiam da orientação
// absoluta (norte primeiro, kit ao sul, casas com y fixo) agora usam o vetor ponto→centro do mapa ou o lado de quem chega;
// num mapa simétrico os dois lados tomam decisões espelhadas. A ordem das IAs gira e todas começam no mesmo instante.
import { describe, it, expect } from 'vitest';
import { createGame, firstThinker } from '../src/core/sim/game';
import { applyCommand } from '../src/core/sim/commands';
import { blankMap, type FixedMapData } from '../src/core/map/fixed';
import { centerFrame, towardFrame, frameTile, spiralSearch, spiralSearchFrame, IDENTITY_FRAME, idx, inBounds, isPassable, type Frame } from '../src/core/map/grid';
import { nearestFreeTile } from '../src/core/map/pathfinding';
import { nearestNode } from '../src/core/sim/queries';
import { findBuildSpot } from '../src/core/sim/ai';
import { canPlaceBuilding, findSpawnTile, placeBuilding, spawnUnit } from '../src/core/sim/entities';
import { wouldSeal } from '../src/core/map/components';
import { BUILDINGS } from '../src/core/data';
import { RNG } from '../src/core/rng';
import { SIM_VERSION, TICK_RATE, type NodeType } from '../src/core/constants';
import { Session } from '../src/game/session';
import type { GameState, Player } from '../src/core/types';

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
      cands.sort((p1, q) => p1.s - q.s || q.c - p1.c || p1.y - q.y || p1.x - q.x);
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

describe('ordem e início das IAs', () => {
  it('todas as IAs começam a pensar no mesmo tick (antes: 2 + índice segundos)', () => {
    const s = game(mapWith([[14, 12], [49, 12], [49, 51], [14, 51]]), true);
    expect(new Set(s.players.map((p) => p.ai!.nextThink)).size).toBe(1);
  });
  it('a primeira IA a pensar gira a cada segundo e cobre todos os jogadores', () => {
    for (const n of [2, 3, 4]) {
      const firsts: number[] = [];
      for (let sec = 0; sec < 2 * n; sec++) {
        const f = firstThinker(sec * TICK_RATE, n);
        for (let t = 1; t < TICK_RATE; t++) expect(firstThinker(sec * TICK_RATE + t, n)).toBe(f);   // fixa dentro do segundo
        firsts.push(f);
      }
      expect(firsts).toEqual(Array.from({ length: 2 * n }, (_, k) => k % n));
    }
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
