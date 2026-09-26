// Anti-trapaça básico (ROADMAP 4.5): fuzz determinístico de comandos e testes pontuais das regras de applyCommand.
// Um cliente modificado pode mandar qualquer JSON pela rede; nenhum comando pode lançar exceção, corromper o estado (NaN,
// recursos negativos, população incoerente, ids quebrados) nem agir por outro jogador — e o resultado tem de ser o mesmo em
// todas as máquinas (mesmo stateHash em duas execuções).
import { describe, it, expect } from 'vitest';
import { createGame, tick } from '../src/core/sim/game';
import { applyCommand } from '../src/core/sim/commands';
import { sanitizeCommand, netCommands, MAX_CMD_IDS, MAX_ORDER_QUEUE, COORD_MARGIN, MAX_CMDS_PER_TICK, MAX_OTHER_CMDS_PER_TICK, MAX_ORDER_IDS_PER_TICK, MAX_BUILD_IDS_PER_TICK } from '../src/core/sim/validate';
import { getRuntime } from '../src/core/sim/runtime';
import { stateHash } from '../src/core/net/hash';
import { NetworkScheduler } from '../src/core/net/lockstep';
import { serialize, deserialize } from '../src/core/serialize';
import { RNG } from '../src/core/rng';
import { BUILDINGS, POWERS, TECHS, UNITS, MINOR_GODS } from '../src/core/data';
import { FORMATIONS, RESOURCES, STANCES } from '../src/core/constants';
import { placeBuilding, spawnUnit } from '../src/core/sim/entities';
import type { Command, GameConfig, GameState } from '../src/core/types';

const CONFIG: GameConfig = {
  seed: 4545, mapSize: 'small', startingAge: 1,
  startingResources: { food: 3000, wood: 3000, gold: 3000, favor: 200, knowledge: 1500 },
  players: [
    { name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' },
    { name: 'B', god: 'hades', isAI: false, difficulty: 'normal' },
    { name: 'IA', god: 'poseidon', isAI: true, difficulty: 'hard' },
  ],
};

const TYPES = ['move', 'attackMove', 'attack', 'gather', 'build', 'pray', 'repair', 'stop', 'stance', 'train', 'research', 'hireScholar', 'cancel', 'rally', 'advanceAge', 'power', 'trade', 'delete', 'ungarrison', 'garrison', 'ability'];
const WEIRD: unknown[] = [NaN, Infinity, -Infinity, -0, 1e21, -1, 0.5, '3', '', null, undefined, true, {}, [], [1], { valueOf: 3 }, '__proto__', 'constructor', 'toString', 'hasOwnProperty'];
const PROTO_KEYS = ['__proto__', 'constructor', 'toString', 'valueOf', 'prototype', 'hasOwnProperty'];

/** Gerador de comandos malucos (PRNG de semente fixa): tipos válidos com campos válidos, alheios, faltando, sobrando ou absurdos. */
class Fuzzer {
  constructor(private rng: RNG) {}
  private pick<T>(a: readonly T[]): T { return this.rng.pick(a); }
  private chance(p: number) { return this.rng.chance(p); }
  private weird() { return this.pick(WEIRD); }
  /** Id de alguma entidade (qualquer dono), de um nó, inexistente ou um valor estranho. */
  private anyId(s: GameState): unknown {
    const r = this.rng.float();
    if (r < 0.35) { const u = [...s.units.values()]; return u.length ? this.pick(u).id : 1; }
    if (r < 0.6) { const b = [...s.buildings.values()]; return b.length ? this.pick(b).id : 1; }
    if (r < 0.75) { const n = [...s.map.nodes.values()]; return n.length ? this.pick(n).id : 1; }
    if (r < 0.85) return this.rng.int(-5, s.nextId + 50);
    return this.weird();
  }
  private ownId(s: GameState, p: number): unknown {
    const own = [...s.units.values()].filter((u) => u.owner === p);
    return own.length && this.chance(0.8) ? this.pick(own).id : this.anyId(s);
  }
  private ids(s: GameState, p: number): unknown {
    const r = this.rng.float();
    if (r < 0.04) return this.weird();                                               // não é lista
    if (r < 0.06) return Array.from({ length: MAX_CMD_IDS + 1 + this.rng.int(0, 50) }, (_, i) => i);   // lista grande demais
    const n = this.rng.int(0, 14);
    const out: unknown[] = [];
    for (let i = 0; i < n; i++) out.push(this.chance(0.55) ? this.ownId(s, p) : this.anyId(s));   // misturando ids alheios
    return out;
  }
  private coord(size: number): unknown {
    const r = this.rng.float();
    if (r < 0.7) return this.rng.range(0, size);
    if (r < 0.8) return this.rng.range(-COORD_MARGIN - 50, size + COORD_MARGIN + 50);   // fora do mapa (perto ou longe demais)
    if (r < 0.85) return this.chance(0.5) ? 0 : size;
    return this.weird();
  }
  private key(table: object): unknown {
    const r = this.rng.float();
    if (r < 0.7) return this.pick(Object.keys(table));
    if (r < 0.85) return this.pick(PROTO_KEYS);
    return this.chance(0.5) ? `x${this.rng.int(0, 99)}` : this.weird();
  }
  player(s: GameState): unknown {
    const r = this.rng.float();
    if (r < 0.85) return this.rng.int(0, s.players.length - 1);
    return this.pick([-1, s.players.length, 99, '0', null, undefined, 0.5, NaN]);
  }
  command(s: GameState): unknown {
    if (this.chance(0.02)) return this.pick([null, undefined, 5, 'move', [], [{ type: 'stop', player: 0, ids: [] }], true]);
    const type = this.chance(0.97) ? this.pick(TYPES) : this.pick(['fly', '', 'constructor', '__proto__', 7]);
    const player = this.player(s);
    const p = typeof player === 'number' && player >= 0 && player < s.players.length ? player : 0;
    const { w, h } = s.map;
    const c: Record<string, unknown> = { type, player };
    c.ids = this.ids(s, p);
    c.x = this.coord(w); c.y = this.coord(h);
    c.tx = this.chance(0.8) ? this.rng.int(-3, w + 3) : this.weird();
    c.ty = this.chance(0.8) ? this.rng.int(-3, h + 3) : this.weird();
    c.targetId = this.anyId(s); c.unitId = this.chance(0.7) ? this.ownId(s, p) : this.anyId(s);
    const bs = [...s.buildings.values()], own = bs.filter((b) => b.owner === p);
    c.buildingId = own.length && this.chance(0.7) ? this.pick(own).id : this.anyId(s);
    c.building = this.key(BUILDINGS); c.unit = this.key(UNITS); c.tech = this.key(TECHS); c.power = this.key(POWERS);
    c.minorGod = this.chance(0.5) ? this.key(MINOR_GODS) : undefined;
    c.stance = this.key(STANCES); c.formation = this.chance(0.6) ? this.pick(FORMATIONS) : this.weird();
    c.index = this.chance(0.7) ? this.rng.int(-2, 12) : this.weird(); c.itemId = this.chance(0.5) ? this.anyId(s) : undefined;
    c.action = this.chance(0.8) ? this.pick(['buy', 'sell']) : this.weird();
    c.resource = this.chance(0.8) ? this.pick(RESOURCES) : this.pick([...PROTO_KEYS, 'stone', 7]);
    c.queue = this.chance(0.7) ? this.chance(0.3) : this.weird();
    // campos faltando e sobrando
    for (const k of Object.keys(c)) if (k !== 'type' && this.chance(0.08)) delete c[k];
    if (this.chance(0.1)) c.extra = this.weird();
    if (this.chance(0.03)) return JSON.parse(JSON.stringify(c).replace('{', '{"__proto__":{"player":0,"type":"delete"},'));
    return c;
  }
}

/** Invariantes do estado depois de cada tick: nada de NaN, recursos ≥ 0, população coerente, ids e guarnições consistentes. */
function checkInvariants(s: GameState, full: boolean): string[] {
  const bad: string[] = [];
  const fin = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const n = s.players.length;
  for (const p of s.players) {
    for (const r of RESOURCES) if (!fin(p.resources[r]) || p.resources[r] < 0) bad.push(`J${p.id} ${r}=${p.resources[r]}`);
    if (Object.keys(p.resources).some((k) => !(RESOURCES as readonly string[]).includes(k))) bad.push(`J${p.id} recurso estranho ${Object.keys(p.resources)}`);
    for (const r of RESOURCES) if (!fin(p.prices[r] ?? 0)) bad.push(`J${p.id} preço ${r}`);
    let pop = 0;
    for (const u of s.units.values()) if (u.owner === p.id && !u.dead) pop += UNITS[u.type].pop;
    for (const b of s.buildings.values()) if (b.owner === p.id && !b.dead) for (const q of b.queue) if (q.kind === 'unit') pop += UNITS[q.id]?.pop ?? NaN;
    if (p.pop !== pop) bad.push(`J${p.id} pop ${p.pop} ≠ ${pop}`);
    if (!p.techs.every((t) => TECHS[t])) bad.push(`J${p.id} tecnologia estranha`);
  }
  for (const [id, u] of s.units) {
    if (u.id !== id || id >= s.nextId) bad.push(`unidade ${id} id`);
    if (s.buildings.has(id)) bad.push(`id ${id} duplicado`);
    if (!UNITS[u.type] || u.owner < 0 || u.owner >= n) bad.push(`unidade ${id} tipo/dono`);
    if (![u.x, u.y, u.hp, u.maxHp, u.tx, u.ty].every(fin)) bad.push(`unidade ${id} NaN ${u.x},${u.y},${u.hp},${u.tx},${u.ty}`);
    if (u.x < 0 || u.y < 0 || u.x > s.map.w || u.y > s.map.h) bad.push(`unidade ${id} fora do mapa`);
    if (u.hp < 0 || u.hp > u.maxHp + 1e-6) bad.push(`unidade ${id} vida ${u.hp}/${u.maxHp}`);
    if (!(u.stance in STANCES)) bad.push(`unidade ${id} postura ${String(u.stance)}`);
    if (u.queue.length > MAX_ORDER_QUEUE) bad.push(`unidade ${id} fila ${u.queue.length}`);
    for (const o of [u.order, ...u.queue]) if (o && ((o.x !== undefined && !fin(o.x)) || (o.y !== undefined && !fin(o.y)))) bad.push(`unidade ${id} ordem NaN`);
    if (u.inside !== -1 && !u.dead) { const g = s.buildings.get(u.inside); if (!g || !g.garrison.includes(id)) bad.push(`unidade ${id} guarnição`); }
  }
  for (const [id, b] of s.buildings) {
    if (b.id !== id || id >= s.nextId) bad.push(`edifício ${id} id`);
    if (!BUILDINGS[b.type] || b.owner < 0 || b.owner >= n) bad.push(`edifício ${id} tipo/dono`);
    if (![b.hp, b.maxHp, b.progress, b.rallyX, b.rallyY].every(fin)) bad.push(`edifício ${id} NaN`);
    if (b.queue.length > 16) bad.push(`edifício ${id} fila ${b.queue.length}`);
    for (const q of b.queue) {
      const okId = q.kind === 'unit' ? !!UNITS[q.id] : q.kind === 'tech' ? !!TECHS[q.id] : q.kind === 'scholar' || q.kind === 'age';
      if (!okId || !fin(q.elapsed) || !fin(q.total)) bad.push(`edifício ${id} item ${q.kind}:${q.id}`);
    }
    for (const gid of b.garrison) { const u = s.units.get(gid); if (!u || u.inside !== id) bad.push(`edifício ${id} guarnição ${gid}`); }
  }
  for (const te of s.timed) if ((te.x !== undefined && !fin(te.x)) || (te.y !== undefined && !fin(te.y))) bad.push(`efeito ${te.type} NaN`);
  if (full) {
    const { w, h } = s.map;
    for (let i = 0; i < w * h; i++) { const bid = s.map.buildingAt[i]; if (bid !== -1 && !s.buildings.has(bid)) { bad.push(`tile ${i} aponta p/ edifício ${bid}`); break; } }
    for (let i = 0; i < w * h; i++) { const nid = s.map.nodeAt[i]; if (nid !== -1 && !s.map.nodes.has(nid)) { bad.push(`tile ${i} aponta p/ nó ${nid}`); break; } }
  }
  return bad;
}

/** Partida em curso + N ticks com `perTick` comandos aleatórios pela porta de entrada real (tick). */
function fuzzRun(seed: number, ticks: number, perTick: number) {
  const s = createGame(JSON.parse(JSON.stringify(CONFIG)));
  for (let i = 0; i < 300; i++) tick(s);   // a IA e os kits já produziram alguma coisa
  const fz = new Fuzzer(new RNG(seed));
  const violations: string[] = [];
  let sent = 0, accepted = 0;
  for (let i = 0; i < ticks; i++) {
    const cmds: unknown[] = [];
    for (let k = 0; k < perTick; k++) cmds.push(fz.command(s));
    for (const c of cmds) if (sanitizeCommand(s, c)) accepted++;
    sent += cmds.length;
    tick(s, cmds as Command[]);
    const bad = checkInvariants(s, i % 50 === 0);
    if (bad.length) violations.push(`tick ${s.tick}: ${bad.slice(0, 5).join('; ')}`);
    if (violations.length > 5) break;
  }
  return { s, violations, sent, accepted, errors: getRuntime(s).commandErrors, lastError: getRuntime(s).lastCommandError };
}

describe('fuzz determinístico de comandos', () => {
  it('milhares de comandos malucos: sem exceção, estado íntegro e o mesmo hash em duas execuções', () => {
    const r1 = fuzzRun(20260926, 400, 18);
    expect(r1.lastError).toBe('');
    expect(r1.errors).toBe(0);
    expect(r1.violations).toEqual([]);
    expect(r1.sent).toBeGreaterThanOrEqual(7000);
    expect(r1.accepted).toBeGreaterThan(r1.sent * 0.1);          // o fuzz também exercita comandos bem formados…
    expect(r1.accepted).toBeLessThan(r1.sent * 0.95);            // …e muitos malformados
    const r2 = fuzzRun(20260926, 400, 18);
    expect(stateHash(r2.s)).toBe(stateHash(r1.s));
    const ser = serialize(r1.s);
    expect(serialize(r2.s)).toBe(ser);
    // o estado continua serializável sem perda (NaN viraria null e dessincronizaria quem reconecta)
    expect(serialize(deserialize(ser))).toBe(ser);
    // e a partida segue normalmente depois do fuzz
    for (let i = 0; i < 200; i++) tick(r1.s);
    expect(checkInvariants(r1.s, true)).toEqual([]);
  }, 60_000);

  it('applyCommand direto (sem a rede de segurança do tick) nunca lança', () => {
    const s = createGame(JSON.parse(JSON.stringify(CONFIG)));
    for (let i = 0; i < 200; i++) tick(s);
    const fz = new Fuzzer(new RNG(77));
    for (let i = 0; i < 3000; i++) {
      const c = fz.command(s);
      expect(() => applyCommand(s, c as Command), JSON.stringify(c)).not.toThrow();
      if (i % 20 === 0) tick(s);
    }
    expect(checkInvariants(s, true)).toEqual([]);
  }, 60_000);
});

// ---------------- Regras pontuais ----------------
function game(): GameState {
  const s = createGame(JSON.parse(JSON.stringify(CONFIG)));
  for (let i = 0; i < 5; i++) tick(s);
  return s;
}
const unitsOf = (s: GameState, p: number, type?: string) => [...s.units.values()].filter((u) => u.owner === p && !u.dead && (!type || u.type === type));
const tcOf = (s: GameState, p: number) => [...s.buildings.values()].find((b) => b.owner === p && b.type === 'town_center')!;
const snapshot = (s: GameState) => serialize(s);

describe('applyCommand: regras de validação (4.5)', () => {
  it('ids de outro dono são ignorados, mesmo misturados na lista', () => {
    const s = game();
    const mine = unitsOf(s, 0, 'villager')[0], theirs = unitsOf(s, 1, 'villager')[0];
    const before = { x: theirs.tx, y: theirs.ty, order: theirs.order };
    expect(applyCommand(s, { type: 'move', player: 0, ids: [theirs.id, mine.id], x: 10.5, y: 10.5 }).ok).toBe(true);
    expect(mine.order?.type).toBe('move');
    expect(theirs.order).toBe(before.order); expect(theirs.tx).toBe(before.x);
    // só ids alheios: no-op
    expect(applyCommand(s, { type: 'stop', player: 0, ids: [theirs.id] }).ok).toBe(true);
    expect(applyCommand(s, { type: 'delete', player: 0, ids: [theirs.id, tcOf(s, 1).id] }).ok).toBe(true);
    expect(theirs.dead).toBe(false); expect(tcOf(s, 1).dead).toBe(false);
    expect(applyCommand(s, { type: 'train', player: 0, buildingId: tcOf(s, 1).id, unit: 'villager' }).ok).toBe(false);
    expect(applyCommand(s, { type: 'rally', player: 0, buildingId: tcOf(s, 1).id, x: 5, y: 5 }).ok).toBe(false);
    expect(applyCommand(s, { type: 'ability', player: 0, unitId: theirs.id }).ok).toBe(false);
  });

  it('jogador inexistente, espectador (-1) e jogador eliminado não comandam', () => {
    const s = game();
    const v = unitsOf(s, 1, 'villager')[0];
    const ref = snapshot(s);
    for (const player of [-1, 3, 99, NaN, 0.5]) expect(applyCommand(s, { type: 'move', player, ids: [v.id], x: 10, y: 10 } as Command).ok).toBe(false);
    expect(snapshot(s)).toBe(ref);
    s.players[1].alive = false;
    const r = applyCommand(s, { type: 'move', player: 1, ids: [v.id], x: 10, y: 10 });
    expect(r.ok).toBe(false);
    expect(v.order?.type).not.toBe('move');
  });

  it('alvos: atacar só inimigo visível fora de edifício; coletar em nó ou na própria fazenda; rezar no próprio templo; guarnecer em aliado', () => {
    const s = game();
    const hop = spawnUnit(s, 0, 'hoplite', tcOf(s, 0).x + 3, tcOf(s, 0).y + 3);
    const ally = unitsOf(s, 0, 'villager')[0], enemy = unitsOf(s, 1, 'villager')[0];
    // aliado/próprio: no-op (a unidade não perde a ordem atual)
    applyCommand(s, { type: 'move', player: 0, ids: [hop.id], x: hop.x + 2, y: hop.y });
    expect(applyCommand(s, { type: 'attack', player: 0, ids: [hop.id], targetId: ally.id }).ok).toBe(false);
    expect(applyCommand(s, { type: 'attack', player: 0, ids: [hop.id], targetId: tcOf(s, 0).id }).ok).toBe(false);
    expect(hop.order?.type).toBe('move');
    // inimigo guarnecido: não é alvo
    const tcB = tcOf(s, 1);
    enemy.inside = tcB.id; tcB.garrison.push(enemy.id);
    expect(applyCommand(s, { type: 'attack', player: 0, ids: [hop.id], targetId: enemy.id }).ok).toBe(false);
    expect(applyCommand(s, { type: 'attack', player: 0, ids: [hop.id], targetId: tcB.id }).ok).toBe(true);
    expect(hop.state).toBe('attack');
    // coleta: fazenda inimiga e unidade não são alvo; nó é
    const farmB = placeBuilding(s, 1, 'farm', tcB.tx - 4, tcB.ty, true);
    const node = [...s.map.nodes.values()][0];
    expect(applyCommand(s, { type: 'gather', player: 0, ids: [ally.id], targetId: farmB.id }).ok).toBe(false);
    expect(applyCommand(s, { type: 'gather', player: 0, ids: [ally.id], targetId: enemy.id }).ok).toBe(false);
    expect(applyCommand(s, { type: 'gather', player: 0, ids: [ally.id], targetId: node.id }).ok).toBe(true);
    // rezar só no próprio templo; guarnecer só em edifício aliado
    const templeB = placeBuilding(s, 1, 'temple', tcB.tx, tcB.ty - 6, true);
    expect(applyCommand(s, { type: 'pray', player: 0, ids: [ally.id], targetId: templeB.id }).ok).toBe(false);
    expect(applyCommand(s, { type: 'pray', player: 0, ids: [ally.id], targetId: tcOf(s, 0).id }).ok).toBe(false);
    expect(applyCommand(s, { type: 'garrison', player: 0, ids: [ally.id], targetId: tcB.id }).ok).toBe(false);
    expect(applyCommand(s, { type: 'repair', player: 0, ids: [ally.id], targetId: tcB.id }).ok).toBe(false);
  });

  it('coordenadas: NaN/Infinity/longe demais são no-op; um clique pouco fora do mapa continua valendo (vai à borda)', () => {
    const s = game();
    const v = unitsOf(s, 0, 'villager')[0], tc = tcOf(s, 0);
    const rally = [tc.rallyX, tc.rallyY], order = JSON.stringify([v.order, v.tx, v.ty]);
    for (const [x, y] of [[NaN, 5], [5, Infinity], [-Infinity, 5], [s.map.w + COORD_MARGIN + 1, 5], [5, -COORD_MARGIN - 1]]) {
      expect(applyCommand(s, { type: 'move', player: 0, ids: [v.id], x, y }).ok).toBe(false);
      expect(applyCommand(s, { type: 'rally', player: 0, buildingId: tc.id, x, y }).ok).toBe(false);
      expect(applyCommand(s, { type: 'power', player: 0, power: 'bolt', x, y }).ok).toBe(false);
    }
    expect(JSON.stringify([v.order, v.tx, v.ty])).toBe(order); expect([tc.rallyX, tc.rallyY]).toEqual(rally);
    expect(s.players[0].powers.every((p) => !p.used)).toBe(true);
    expect(applyCommand(s, { type: 'move', player: 0, ids: [v.id], x: -2, y: 5 }).ok).toBe(true);
    expect(v.order?.type).toBe('move');
    expect(v.tx).toBeGreaterThanOrEqual(0);
    // obra: canto do tile precisa ser inteiro dentro do mapa
    const wood = s.players[0].resources.wood;
    expect(applyCommand(s, { type: 'build', player: 0, ids: [v.id], building: 'house', tx: 10.5, ty: 10 }).ok).toBe(false);
    expect(applyCommand(s, { type: 'build', player: 0, ids: [v.id], building: 'house', tx: -1, ty: 10 }).ok).toBe(false);
    expect(s.players[0].resources.wood).toBe(wood);
  });

  it('ids de dados inexistentes (inclusive __proto__/constructor/toString) e enums inválidos são no-op', () => {
    const s = game();
    const p = s.players[0], tc = tcOf(s, 0), v = unitsOf(s, 0, 'villager')[0];
    const res = { ...p.resources }, queue = tc.queue.length, stance0 = v.stance;
    for (const bad of ['__proto__', 'constructor', 'toString', 'nada', 5]) {
      expect(applyCommand(s, { type: 'train', player: 0, buildingId: tc.id, unit: bad } as Command).ok).toBe(false);
      expect(applyCommand(s, { type: 'research', player: 0, buildingId: tc.id, tech: bad } as Command).ok).toBe(false);
      expect(applyCommand(s, { type: 'build', player: 0, ids: [v.id], building: bad, tx: 10, ty: 10 } as Command).ok).toBe(false);
      expect(applyCommand(s, { type: 'power', player: 0, power: bad } as Command).ok).toBe(false);
      expect(applyCommand(s, { type: 'stance', player: 0, ids: [v.id], stance: bad } as Command).ok).toBe(false);
      expect(applyCommand(s, { type: 'advanceAge', player: 0, buildingId: tc.id, minorGod: bad } as Command).ok).toBe(false);
      expect(applyCommand(s, { type: 'move', player: 0, ids: [v.id], x: 5, y: 5, formation: bad } as Command).ok).toBe(false);
    }
    expect(v.stance).toBe(stance0);
    expect(p.resources).toEqual(res); expect(tc.queue.length).toBe(queue);
    expect(applyCommand(s, { type: 'stance', player: 0, ids: [v.id], stance: 'defensive' }).ok).toBe(true);
    expect(v.stance).toBe('defensive');
  });

  it('mercado com recurso ou ação inválidos não corrompe o ouro (antes: NaN)', () => {
    const s = game();
    const p = s.players[0], tc = tcOf(s, 0);
    placeBuilding(s, 0, 'market', tc.tx + 6, tc.ty + 6, true);
    const res = { ...p.resources };
    for (const resource of ['toString', 'stone', '__proto__', 'constructor', 7]) for (const action of ['buy', 'sell', 'steal']) {
      expect(applyCommand(s, { type: 'trade', player: 0, action, resource } as Command).ok).toBe(false);
    }
    expect(applyCommand(s, { type: 'trade', player: 0, action: 'steal', resource: 'wood' } as unknown as Command).ok).toBe(false);
    expect(p.resources).toEqual(res);
    expect(Object.keys(p.resources).sort()).toEqual([...RESOURCES].sort());
    expect(applyCommand(s, { type: 'trade', player: 0, action: 'sell', resource: 'wood' }).ok).toBe(true);
    expect(Number.isFinite(p.resources.gold)).toBe(true);
  });

  it('filas, índices e custos: cancel fora da fila, lista grande demais e fila de ordens limitada', () => {
    const s = game();
    const p = s.players[0], tc = tcOf(s, 0), v = unitsOf(s, 0, 'villager')[0];
    expect(applyCommand(s, { type: 'train', player: 0, buildingId: tc.id, unit: 'villager' }).ok).toBe(true);
    const res = { ...p.resources };
    for (const index of [5, 9999, 0.5, -2, NaN]) expect(applyCommand(s, { type: 'cancel', player: 0, buildingId: tc.id, index } as Command).ok).toBe(false);
    expect(applyCommand(s, { type: 'cancel', player: 0, buildingId: tc.id, index: 0, itemId: 123456 }).ok).toBe(false);
    expect(p.resources).toEqual(res); expect(tc.queue.length).toBe(1);
    // tecnologia de outro edifício / Idade futura / já pesquisada: no-op sem cobrar
    const futureTech = Object.values(TECHS).find((t) => t.age > p.age && t.building === 'town_center') ?? Object.values(TECHS).find((t) => t.age > p.age)!;
    expect(applyCommand(s, { type: 'research', player: 0, buildingId: tc.id, tech: futureTech.id }).ok).toBe(false);
    expect(p.resources).toEqual(res);
    // poder já usado não se usa de novo
    const power = p.powers[0].id;
    p.powers[0].used = true;
    expect(applyCommand(s, { type: 'power', player: 0, power, x: tc.x, y: tc.y, targetId: unitsOf(s, 1)[0].id }).ok).toBe(false);
    expect(applyCommand(s, { type: 'power', player: 0, power: 'earthquake', x: tc.x, y: tc.y }).ok).toBe(false);   // poder que não tem
    // listas
    const many = Array.from({ length: MAX_CMD_IDS + 1 }, () => v.id);
    expect(applyCommand(s, { type: 'stop', player: 0, ids: many }).ok).toBe(false);
    expect(applyCommand(s, { type: 'stop', player: 0, ids: [v.id, 'x'] } as unknown as Command).ok).toBe(false);
    // ordens enfileiradas (Shift): no máximo MAX_ORDER_QUEUE
    applyCommand(s, { type: 'move', player: 0, ids: [v.id], x: 20, y: 20 });
    for (let i = 0; i < MAX_ORDER_QUEUE + 50; i++) applyCommand(s, { type: 'move', player: 0, ids: [v.id], x: 10 + (i % 5), y: 12, queue: true });
    expect(v.queue.length).toBe(MAX_ORDER_QUEUE);
    // queue só vale como booleano verdadeiro
    applyCommand(s, { type: 'move', player: 0, ids: [v.id], x: 22, y: 22, queue: 'sim' } as unknown as Command);
    expect(v.queue.length).toBe(0);
  });

  it('campos a mais são descartados e campos faltando tornam o comando no-op', () => {
    const s = game();
    const v = unitsOf(s, 0, 'villager')[0];
    const c = sanitizeCommand(s, { type: 'move', player: 0, ids: [v.id], x: 5, y: 6, hack: true, player2: 1, __proto__: { x: 1 } });
    expect(c).toEqual({ type: 'move', player: 0, ids: [v.id], x: 5, y: 6, queue: false });
    expect(sanitizeCommand(s, { type: 'move', player: 0, ids: [v.id], x: 5 })).toBeNull();
    expect(sanitizeCommand(s, { type: 'train', player: 0, unit: 'villager' })).toBeNull();
    expect(sanitizeCommand(s, { player: 0, ids: [v.id] })).toBeNull();
    expect(sanitizeCommand(s, JSON.parse('{"type":"delete","player":0,"__proto__":{"ids":[1]}}'))).toBeNull();
    for (const raw of [null, undefined, 1, 'move', [], [{ type: 'stop', player: 0, ids: [] }]]) expect(applyCommand(s, raw as unknown as Command).ok).toBe(false);
  });

  it('a rede de segurança do tick engole uma exceção inesperada sem derrubar a partida', () => {
    const s = game();
    const evil = { get type(): string { throw new Error('boom'); }, player: 0 } as unknown as Command;
    const v = unitsOf(s, 0, 'villager')[0];
    tick(s, [evil, { type: 'move', player: 0, ids: [v.id], x: 12, y: 12 }]);
    expect(getRuntime(s).commandErrors).toBe(1);
    expect(getRuntime(s).lastCommandError).toMatch(/boom/);
    expect(v.order?.type).toBe('move');   // o comando seguinte do mesmo tick foi aplicado
  });
});

describe('config vinda do lobby (4.5)', () => {
  it('deus que é chave do protótipo (constructor, __proto__, toString…) vira Zeus e a partida roda (antes: createGame lançava)', () => {
    for (const god of PROTO_KEYS) {
      const s = createGame({ seed: 1, mapSize: 'small', players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'B', god, isAI: false, difficulty: 'normal' }] });
      expect(s.players[1].god).toBe('zeus');
      expect(s.players[1].powers).toEqual(s.players[0].powers);   // o poder de Zeus
      for (let i = 0; i < 60; i++) tick(s);
      expect(s.players[1].alive).toBe(true);
    }
  });
});

describe('NetworkScheduler: entrada da rede (4.5)', () => {
  const sched = () => new NetworkScheduler(0, [0, 1], 2, { sendCmds: () => {}, sendHash: () => {} });
  const inbox = (s: NetworkScheduler) => (s as unknown as { inbox: Map<number, Map<number, Command[]>> }).inbox;
  it('lista que não é array vira vazia; entradas que não são objetos saem; limite por tick; primeira mensagem de cada (par, tick) vale', () => {
    const s = sched();
    s.receive(1, 3, 'x' as unknown as Command[]);
    expect(inbox(s).get(3)!.get(1)).toEqual([]);
    s.receive(1, 3, [{ type: 'stop', player: 1, ids: [1] }]);   // repetida: ignorada (a 1ª já valeu)
    expect(inbox(s).get(3)!.get(1)).toEqual([]);
    s.receive(1, 4, [null, 5, 'a', { type: 'stop', player: 1, ids: [2] }, { type: 'stop', player: 0, ids: [3] }] as unknown as Command[]);
    expect(inbox(s).get(4)!.get(1)).toEqual([{ type: 'stop', player: 1, ids: [2] }]);
    s.receive(1, 5, Array.from({ length: MAX_CMDS_PER_TICK + 10 }, (_, i) => ({ type: 'build', player: 1, ids: [7], building: 'house', tx: i % 60, ty: 2 }) as Command));
    expect(inbox(s).get(5)!.get(1)!.length).toBe(MAX_CMDS_PER_TICK);   // `build` (muralha arrastada = 1 por tile)
    s.receive(1, 6, Array.from({ length: 200 }, () => ({ type: 'stop', player: 1, ids: [] }) as Command));
    expect(inbox(s).get(6)!.get(1)!.length).toBe(MAX_OTHER_CMDS_PER_TICK);   // os demais: bem menos
    for (const t of [NaN, -1, 2.5, Infinity]) s.receive(1, t, []);
    expect([...inbox(s).keys()].every((t) => Number.isInteger(t) && t >= 0)).toBe(true);
  });
  it('comandos para ticks já executados são descartados; hashes inválidos não acusam dessincronização', () => {
    const a = createGame(JSON.parse(JSON.stringify(CONFIG)));
    const s = sched();
    for (let t = 0; t < 10; t++) s.receive(1, t, []);
    for (let i = 0; i < 8; i++) s.step(a);
    expect(a.tick).toBe(8);
    s.receive(1, 3, [{ type: 'stop', player: 1, ids: [] }]);
    expect(inbox(s).has(3)).toBe(false);
    s.receiveHash(1, 100, NaN); s.receiveHash(1, 100, -3); s.receiveHash(1, 100, 2 ** 33); s.receiveHash(1, NaN, 5);
    expect((s as unknown as { hashes: Map<number, unknown> }).hashes.size).toBe(0);
  });

  it('ids repetidos × centenas de comandos não viram centenas de milhares de ordens por tick (antes ~115 ms por tick)', () => {
    const a = createGame(JSON.parse(JSON.stringify(CONFIG)));
    const own = [...a.units.values()].filter((u) => u.owner === 1).map((u) => u.id);
    const repeated = Array.from({ length: MAX_CMD_IDS }, (_, i) => own[i % own.length]);
    // a mensagem da sonda de revisão: 299 `move` × 600 ids repetidos das próprias unidades (~512 KB, dentro dos limites do relay)
    const flood = Array.from({ length: 299 }, () => ({ type: 'move', player: 1, ids: repeated, x: 40.5, y: 40.5 }) as Command);
    const s = sched();
    s.receive(1, 5, flood);
    const got = inbox(s).get(5)!.get(1)!;
    expect(got.length).toBeLessThanOrEqual(MAX_OTHER_CMDS_PER_TICK);
    for (const c of got) expect((c as { ids: number[] }).ids).toEqual(own);   // sem repetição, na ordem da 1ª ocorrência
    const orders = got.reduce((n, c) => n + (c as { ids: number[] }).ids.length, 0);
    expect(orders).toBeLessThanOrEqual(MAX_ORDER_IDS_PER_TICK);
    // ids distintos (inexistentes) também têm teto por tick: 600 por comando → cabem só 2 comandos de ordem
    const distinct = (k: number) => Array.from({ length: MAX_CMD_IDS }, (_, i) => 100_000 + k * MAX_CMD_IDS + i);
    const wide = netCommands(1, Array.from({ length: 50 }, (_, k) => ({ type: 'stop', player: 1, ids: distinct(k) })));
    expect(wide.length).toBe(MAX_ORDER_IDS_PER_TICK / MAX_CMD_IDS);
    const builds = netCommands(1, Array.from({ length: 1000 }, (_, k) => ({ type: 'build', player: 1, ids: distinct(k), building: 'wall', tx: k % 60, ty: 3 })));
    expect(builds.length).toBe(Math.floor(MAX_BUILD_IDS_PER_TICK / MAX_CMD_IDS));
    // idempotente (o relay repassa, o outro par filtra de novo): mesma lista
    expect(netCommands(1, got)).toEqual(got);
    expect(netCommands(1, wide)).toEqual(wide);
  });

  it('o par local aplica exatamente a lista que envia (mesmo corte que os outros aplicam): sem dessincronização por excesso', () => {
    const sent: [number, Command[]][] = [];
    const s = new NetworkScheduler(0, [0, 1], 2, { sendCmds: (t, c) => sent.push([t, c]), sendHash: () => {} });
    const other = new NetworkScheduler(1, [0, 1], 2, { sendCmds: () => {}, sendHash: () => {} });
    for (let i = 0; i < 100; i++) s.issue({ type: 'stop', player: 0, ids: [1, 1, 2] } as Command);
    s.issue({ type: 'stop', player: 1, ids: [5] } as Command);   // em nome de outro: nem o próprio par aplica
    s.step(createGame(JSON.parse(JSON.stringify(CONFIG))));
    const [t, list] = sent.find(([tk]) => tk === 2)!;
    expect(list.length).toBe(MAX_OTHER_CMDS_PER_TICK);
    expect(list.every((c) => c.player === 0 && (c as { ids: number[] }).ids.join() === '1,2')).toBe(true);
    expect(inbox(s).get(t)!.get(0)).toEqual(list);
    other.receive(0, t, list);
    expect(inbox(other).get(t)!.get(0)).toEqual(list);
  });

  it('comando para tick em que o par não é aguardado (antes do atraso, antes do retorno de quem reconectou, par que saiu) é descartado por todos', () => {
    // A já executou os ticks 0..2 e B nenhum; C (cliente modificado) manda ordens reais para o tick 2, em que ninguém o espera:
    // antes, A descartava (já executado) e B aplicava — dessincronização no tick 100
    const cfg: GameConfig = { seed: 9090, mapSize: 'small', players: [
      { name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: false, difficulty: 'normal' }, { name: 'C', god: 'poseidon', isAI: false, difficulty: 'normal' } ] };
    const states = [createGame(cfg), createGame(cfg), createGame(cfg)];
    const scheds: NetworkScheduler[] = [];
    for (let i = 0; i < 3; i++) scheds.push(new NetworkScheduler(i, [0, 1, 2], 4, {
      sendCmds: (t, c) => { for (let j = 0; j < 3; j++) if (j !== i) scheds[j].receive(i, t, c); },
      sendHash: (t, h, p) => { for (let j = 0; j < 3; j++) if (j !== i) scheds[j].receiveHash(i, t, h, p); },
    }));
    for (let i = 0; i < 3; i++) scheds[0].step(states[0]);
    const cUnits = [...states[2].units.values()].filter((u) => u.owner === 2).map((u) => u.id);
    for (const k of [0, 1]) scheds[k].receive(2, 2, [{ type: 'move', player: 2, ids: cUnits, x: 20.5, y: 20.5 } as Command]);
    expect(inbox(scheds[1]).get(2)?.has(2) ?? false).toBe(false);
    for (let i = 0; i < 160; i++) for (let k = 0; k < 3; k++) scheds[k].step(states[k]);
    for (let g = 0; g < 10 && states[1].tick < states[0].tick; g++) { scheds[1].step(states[1]); scheds[2].step(states[2]); }   // B e C começaram 3 ticks depois
    expect(states[0].tick).toBeGreaterThan(100);   // passou da 1ª troca de hashes (tick 100)
    expect(scheds.map((x) => x.desynced)).toEqual([false, false, false]);
    expect(states[0].tick).toBe(states[1].tick);
    expect(stateHash(states[0])).toBe(stateHash(states[1]));
    // reconectado: nada até o tick de retorno (inclusive); par que saiu: nada
    const s = sched();
    s.addPlayer(1, 50);
    s.receive(1, 50, [{ type: 'stop', player: 1, ids: [1] } as Command]);
    s.receive(1, 51, [{ type: 'stop', player: 1, ids: [2] } as Command]);
    expect(inbox(s).get(50)?.has(1) ?? false).toBe(false);
    expect(inbox(s).get(51)!.get(1)).toEqual([{ type: 'stop', player: 1, ids: [2] }]);
    s.dropPlayer(1);
    s.receive(1, 60, [{ type: 'stop', player: 1, ids: [3] } as Command]);
    expect(inbox(s).get(60)?.has(1) ?? false).toBe(false);
  });
});
