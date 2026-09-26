// Relatório de dessincronização (ROADMAP 4.5): dois NetworkScheduler em memória, um deles com o estado adulterado por fora de
// um Command. Os dois acusam a divergência no primeiro hash trocado e o relatório diz onde (categoria e jogador), com os
// hashes de cada um e o resumo do estado local no tick.
import { describe, it, expect } from 'vitest';
import { NetworkScheduler } from '../src/core/net/lockstep';
import { stateHash } from '../src/core/net/hash';
import { stateHashParts, diffHashParts, summarizeState, HASH_PARTS_VERSION } from '../src/core/net/desync';
import { createGame, tick } from '../src/core/sim/game';
import type { GameConfig, GameState } from '../src/core/types';

const config: GameConfig = { seed: 9090, mapSize: 'small', players: [
  { name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal' }, { name: 'IA', god: 'poseidon', isAI: true, difficulty: 'normal' },
] };

/** Dois pares em memória (entrega imediata, com o detalhamento do hash); `tamper` roda no estado de B antes de cada passo. */
function runPair(ticks: number, tamper: (b: GameState) => void, withParts = true) {
  const a = createGame(JSON.parse(JSON.stringify(config))), b = createGame(JSON.parse(JSON.stringify(config)));
  let sa!: NetworkScheduler, sb!: NetworkScheduler;
  sa = new NetworkScheduler(0, [0, 1], 3, { sendCmds: (t, c) => sb.receive(0, t, c), sendHash: (t, h, p) => sb.receiveHash(0, t, h, withParts ? p : undefined) });
  sb = new NetworkScheduler(1, [0, 1], 3, { sendCmds: (t, c) => sa.receive(1, t, c), sendHash: (t, h, p) => sa.receiveHash(1, t, h, withParts ? p : undefined) });
  const seen: number[] = [];
  sa.onDesync = (t) => seen.push(t); sb.onDesync = (t) => seen.push(t);
  for (let i = 0; i < ticks; i++) { sa.step(a); tamper(b); sb.step(b); }
  return { a, b, sa, sb, seen };
}

describe('relatório de dessincronização', () => {
  it('detalhamento do hash: formato, estável e sensível a cada categoria', () => {
    const s = createGame(JSON.parse(JSON.stringify(config)));
    for (let i = 0; i < 50; i++) tick(s);
    const p = stateHashParts(s);
    expect(p[0]).toBe(HASH_PARTS_VERSION); expect(p[1]).toBe(3); expect(p.length).toBe(3 + 4 * 3);
    expect(p.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffffffff)).toBe(true);
    expect(stateHashParts(s)).toEqual(p);
    const h = stateHash(s);
    s.players[2].resources.gold += 5;
    expect(diffHashParts(p, stateHashParts(s))).toEqual(['resources:2']);
    expect(stateHash(s)).not.toBe(h);   // o total também vê
    s.players[2].resources.gold -= 5;
    const u = [...s.units.values()].find((x) => x.owner === 1)!; u.hp -= 3;
    expect(diffHashParts(p, stateHashParts(s))).toEqual(['units:1']);
    u.hp += 3;
    const b = [...s.buildings.values()].find((x) => x.owner === 0)!; b.hp -= 10;
    expect(diffHashParts(p, stateHashParts(s))).toEqual(['buildings:0']);
    b.hp += 10;
    s.players[0].techs.push('x');
    expect(diffHashParts(p, stateHashParts(s))).toEqual(['players:0']);
    s.players[0].techs.pop();
    s.map.nodes.values().next().value!.amount -= 7;
    expect(diffHashParts(p, stateHashParts(s))).toEqual(['world']);
    // detalhamento ausente ou de outro formato: sem categoria
    expect(diffHashParts(p, undefined)).toEqual(['?']);
    expect(diffHashParts(p, [9, 3, 1])).toEqual(['?']);
  });

  it('recursos adulterados num par: os dois acusam no tick 100 e o relatório aponta "recursos do jogador 1"', () => {
    const { sa, sb, seen } = runPair(160, (b) => { if (b.tick === 60) b.players[1].resources.wood += 50; });
    expect(seen).toEqual([100, 100]);
    const ra = sa.lastDesync!, rb = sb.lastDesync!;
    expect(ra.tick).toBe(100); expect(rb.tick).toBe(100);
    expect(ra.local).toBe(0); expect(rb.local).toBe(1);
    // hashes por jogador: o do outro par difere do local
    expect(ra.theirs).toEqual([[1, rb.mine]]); expect(rb.theirs).toEqual([[0, ra.mine]]);
    expect(ra.mine).not.toBe(rb.mine);
    // onde: só os recursos do jogador 1
    expect(ra.diverged).toEqual([{ player: 1, categories: ['resources:1'] }]);
    expect(rb.diverged).toEqual([{ player: 0, categories: ['resources:1'] }]);
    // resumo legível de cada lado no tick 100: a diferença de madeira aparece
    expect(ra.summary.tick).toBe(100); expect(rb.summary.tick).toBe(100);
    expect(rb.summary.players[1].resources.wood - ra.summary.players[1].resources.wood).toBe(50);
    expect(rb.summary.players[0]).toEqual(ra.summary.players[0]);
    expect(ra.summary.units).toBe(rb.summary.units);
    // serializável para o "Exportar diagnóstico"
    expect(JSON.parse(JSON.stringify(ra))).toEqual(ra);
  });

  it('unidade adulterada aponta "unidades" do dono; par sem detalhamento (cliente antigo) dá "?"', () => {
    const hit = (b: GameState) => { if (b.tick === 95) { const u = [...b.units.values()].find((x) => x.owner === 0 && x.type === 'villager')!; u.hp -= 1; } };
    const r = runPair(130, hit);
    expect(r.sa.lastDesync!.diverged).toEqual([{ player: 1, categories: ['units:0'] }]);
    expect(r.sb.lastDesync!.summary.players[0].unitHp).toBe(r.sa.lastDesync!.summary.players[0].unitHp - 1);
    const old = runPair(130, hit, false);
    expect(old.seen).toEqual([100, 100]);
    expect(old.sa.lastDesync!.diverged).toEqual([{ player: 1, categories: ['?'] }]);
  });

  it('sem adulteração: nenhum relatório, e o resumo bate entre os pares', () => {
    const { a, b, sa, sb, seen } = runPair(210, () => {});
    expect(seen).toEqual([]); expect(sa.lastDesync).toBeNull(); expect(sb.lastDesync).toBeNull();
    while (a.tick < b.tick) sa.step(a); while (b.tick < a.tick) sb.step(b);
    expect(summarizeState(a)).toEqual(summarizeState(b));
  });
});
