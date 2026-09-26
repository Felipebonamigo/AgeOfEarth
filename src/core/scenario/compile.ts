// Compila um ScenarioFile (JSON, docs/EDITOR.md §2.3) num ScenarioDef executável pelo runner. Cada operador da gramática
// mapeia num helper de helpers.ts; nada de eval. Textos são resolvidos por tx() aqui (título, intro, objetivos) ou ao
// emitir (diálogos), por isso o cache é por (hash do JSON, idioma): trocar de idioma recompila.
import { TICK_RATE, type ResourceType } from '../constants';
import { BUILDINGS, MINOR_GODS, POWERS, UNITS } from '../data';
import type { Building, Forbid, GameConfig, GameState, Unit } from '../types';
import { rectReachable } from '../map/components';
import { giveOrder } from '../sim/units';
import { killUnit, destroyBuilding } from '../sim/combat';
import { canGarrison, ejectGarrison, removeBuildingNow, removeUnitNow } from '../sim/entities';
import { queueItemCost, refund } from '../sim/economy';
import { useAbility } from '../sim/commands';
import { relicsOf } from '../sim/relics';
import { isEnemy } from '../sim/queries';
import { getLocale } from '../../i18n';
import type { ObjectiveDef, ObjectiveStatus, ScenarioDef, ScenarioHudDef, TriggerCtx, TriggerDef } from './types';
import type { Action, BuildingFilter, Cmp, Condition, EntityRef, PlayerSel, Point, ScenarioFile, UnitFilter, Value } from './schema';
import { isPointLike, validateScenario } from './schema';
import { killCount, powerUseCount } from './log';
import { localText, tx } from './text';
import { advanceBuild, ceasefire, count, give, grantTech, healEntity, localHumanIndex, scenarioAlive, military, nearCount, notifyRaid, placeExact, placeNear, prayAt, raid, removeAllOf, scaledGroup, scriptedDamage, spawnGroup, tagIds, townCenter } from './helpers';
import { defeatPlayer } from '../sim/victory';
import { kingAlive } from '../sim/modes';

/** Contexto de avaliação: estado + segundos inteiros + jogador/índice do forEachPlayer ('$p', k). */
interface Env { state: GameState; seconds: number; fired: (id: string) => boolean; p: number; k: number }

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function envOf(state: GameState, ctx?: TriggerCtx): Env {
  return {
    state,
    seconds: ctx ? ctx.seconds : Math.floor((state.tick + 1) / TICK_RATE),   // mesma fórmula do runner (objetivos não recebem ctx)
    fired: ctx ? ctx.fired : (id) => !!state.scenario?.fired.includes(id),
    p: -1, k: 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Resolução de seletores
// ---------------------------------------------------------------------------------------------------------------

function player(env: Env, sel: PlayerSel): number {
  const ps = env.state.players;
  if (typeof sel === 'number') return sel >= 0 && sel < ps.length ? sel : -1;
  if (sel === 'local') return localHumanIndex(env.state.config);   // primeiro humano que não é marionete
  if (sel === '$p') return env.p;
  if (sel && typeof sel === 'object') return ps.findIndex((p) => p.team === sel.team);
  return -1;
}

function entity(env: Env, ref: EntityRef): Unit | Building | undefined {
  const s = env.state;
  const byId = (id: number | undefined) => { if (id === undefined || id < 0) return undefined; const e = s.units.get(id) ?? s.buildings.get(id); return e && !e.dead ? e : undefined; };
  if (!ref || typeof ref !== 'object') return undefined;
  if ('tag' in ref) {
    // grupo da tag (G5): first = vars['#tag'] (compatível); alive = primeiro vivo do grupo; nearest = vivo mais perto de near (desempata por id)
    if (ref.pick === 'alive') { for (const id of tagIds(s, ref.tag)) { const e = byId(id); if (e) return e; } return undefined; }
    if (ref.pick === 'nearest') {
      const pt = ref.near ? point(env, ref.near) : undefined; if (!pt) return undefined;
      let best: Unit | Building | undefined; let bd = Infinity;
      for (const id of tagIds(s, ref.tag)) { const e = byId(id); if (!e) continue; const d = (e.x - pt.x) * (e.x - pt.x) + (e.y - pt.y) * (e.y - pt.y); if (d < bd || (d === bd && best && e.id < best.id)) { bd = d; best = e; } }
      return best;
    }
    return byId(s.scenario?.vars['#' + ref.tag]);
  }
  if ('var' in ref) return byId(s.scenario?.vars[ref.var]);
  if ('tc' in ref) return townCenter(s, player(env, ref.tc)) ?? undefined;
  const owner = player(env, ref.player);
  if (owner < 0) return undefined;
  const list: (Unit | Building)[] = [];
  if (has(UNITS, ref.type)) for (const u of s.units.values()) if (u.owner === owner && !u.dead && u.type === ref.type) list.push(u);
  if (has(BUILDINGS, ref.type)) for (const b of s.buildings.values()) if (b.owner === owner && !b.dead && b.type === ref.type) list.push(b);
  if (list.length === 0) return undefined;
  if (ref.pick === 'nearest' && ref.near) {
    const pt = point(env, ref.near); if (!pt) return undefined;
    let best: Unit | Building | undefined; let bd = Infinity;
    for (const e of list) { const d = (e.x - pt.x) * (e.x - pt.x) + (e.y - pt.y) * (e.y - pt.y); if (d < bd || (d === bd && best && e.id < best.id)) { bd = d; best = e; } }
    return best;
  }
  let best = list[0]; for (const e of list) if (e.id < best.id) best = e;   // first = menor id
  return best;
}

function point(env: Env, pt: Point): { x: number; y: number } | undefined {
  if (!pt || typeof pt !== 'object') return undefined;
  if ('at' in pt) return { x: pt.at[0], y: pt.at[1] };
  let base: { x: number; y: number } | undefined;
  if ('start' in pt) base = env.state.map.starts[pt.start];
  else if ('tc' in pt) { const tc = townCenter(env.state, player(env, pt.tc)); if (tc) base = { x: tc.x, y: tc.y }; }
  else if ('entity' in pt) { const e = entity(env, pt.entity); if (e) base = { x: e.x, y: e.y }; }
  if (!base) return undefined;
  return { x: base.x + (pt.dx ?? 0), y: base.y + (pt.dy ?? 0) };
}

function value(env: Env, v: Value): number {
  if (typeof v === 'number') return v;
  if (!v || typeof v !== 'object') return 0;
  if ('stat' in v) {
    if (v.stat === 'difficulty') return difficultyIndex(env.state);
    const p = env.state.players[player(env, v.player)]; if (!p) return 0;
    switch (v.stat) {
      case 'age': return p.age; case 'pop': return p.pop; case 'popCap': return p.popCap; case 'alive': return scenarioAlive(env.state, p.id) ? 1 : 0;
      case 'relics': return relicsOf(env.state, p.id);   // G10: relíquias guardadas nos Templos do jogador
      case 'food': case 'wood': case 'gold': case 'favor': case 'knowledge': return p.resources[v.stat];
      default: return 0;
    }
  }
  if ('var' in v) return env.state.scenario?.vars[v.var] ?? 0;
  if ('add' in v) return value(env, v.add[0]) + v.add[1];
  if ('time' in v) return env.seconds;   // G4: segundos inteiros de jogo (marca instantes com setVar)
  return 0;
}

function cmp(env: Env, c: Cmp, x: number): boolean {
  if (c.gte !== undefined && !(x >= value(env, c.gte))) return false;
  if (c.lte !== undefined && !(x <= value(env, c.lte))) return false;
  if (c.eq !== undefined && !(x === value(env, c.eq))) return false;
  if (c.gt !== undefined && !(x > value(env, c.gt))) return false;
  if (c.lt !== undefined && !(x < value(env, c.lt))) return false;
  return true;
}

/** Dificuldade da campanha como número: 0 = Fácil, 1 = Normal (padrão), 2 = Difícil. */
function difficultyIndex(state: GameState): number { const d = state.config.campaignDifficulty ?? 'normal'; return d === 'easy' ? 0 : d === 'hard' ? 2 : 1; }

/** Segundos que o jogador mantém uma Maravilha concluída de pé (a mais antiga); 0 sem Maravilha. */
function wonderHeldSeconds(state: GameState, owner: number): number {
  let best = 0;
  for (const b of state.buildings.values()) {
    if (b.dead || b.owner !== owner || !b.complete || b.wonderStart < 0 || !BUILDINGS[b.type].wonder) continue;
    best = Math.max(best, Math.floor((state.tick - b.wonderStart) / TICK_RATE));
  }
  return best;
}

/**
 * G9: fração da vida (0-1) arredondada a 1e-9. O piso grava hp = maxHp·f, e (maxHp·f)/maxHp pode sair um ulp acima de f
 * (ex.: 130.9/154 = 0.8500000000000001): sem o arredondamento, { hp: { lte: f } } nunca valeria com o chefe no piso.
 */
function hpFraction(e: Unit | Building): number {
  return e.maxHp > 0 ? Math.round((e.hp / e.maxHp) * 1e9) / 1e9 : 0;
}

function typeMatch(type: string | string[] | undefined, t: string): boolean {
  return type === undefined || (Array.isArray(type) ? type.includes(t) : type === t);
}

function buildingsMatching(env: Env, f: BuildingFilter): Building[] {
  const s = env.state; const out: Building[] = [];
  const owner = f.player !== undefined ? player(env, f.player) : undefined;
  const tagged = f.tag !== undefined ? tagIds(s, f.tag) : undefined;
  for (const b of s.buildings.values()) {
    if (b.dead) continue;
    if (tagged && !tagged.includes(b.id)) continue;
    if (owner !== undefined && b.owner !== owner) continue;
    const team = s.players[b.owner]?.team;
    if (f.team !== undefined && team !== f.team) continue;
    if (f.notTeam !== undefined && team === f.notTeam) continue;
    if (!typeMatch(f.type, b.type)) continue;
    if (f.complete !== undefined && b.complete !== f.complete) continue;
    out.push(b);
  }
  return out;
}

function unitsMatching(env: Env, f: UnitFilter): Unit[] {
  const s = env.state;
  const owner = player(env, f.player);
  const tagged = f.tag !== undefined ? tagIds(s, f.tag) : undefined;
  const excluded = f.excludeTag !== undefined ? tagIds(s, f.excludeTag) : undefined;
  const near = f.near ? point(env, f.near.point) : undefined;
  const r2 = f.near ? f.near.radius * f.near.radius : 0;
  const targets = f.reachable ? buildingsMatching(env, f.reachable.buildingsOf) : undefined;
  const out: Unit[] = [];
  for (const u of s.units.values()) {
    if (u.dead || u.owner !== owner) continue;
    if (!typeMatch(f.type, u.type)) continue;
    if (tagged && !tagged.includes(u.id)) continue;
    if (excluded && excluded.includes(u.id)) continue;
    if (f.state !== undefined && u.state !== f.state) continue;
    if (f.military !== undefined && military(u) !== f.military) continue;
    if (f.near) { if (!near) continue; const dx = u.x - near.x, dy = u.y - near.y; if (!(dx * dx + dy * dy < r2)) continue; }
    if (targets) { const ux = Math.floor(u.x), uy = Math.floor(u.y); if (!targets.some((b) => rectReachable(s.map, ux, uy, b.tx, b.ty, b.w, b.h, true))) continue; }
    out.push(u);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Condições
// ---------------------------------------------------------------------------------------------------------------

function evalCondition(env: Env, c: Condition): boolean {
  if (!c || typeof c !== 'object') return false;
  const s = env.state;
  if ('all' in c) return c.all.every((x) => evalCondition(env, x));
  if ('any' in c) return c.any.some((x) => evalCondition(env, x));
  if ('not' in c) return !evalCondition(env, c.not);
  if ('time' in c) return cmp(env, c.time, env.seconds);
  if ('every' in c) return env.seconds % c.every.seconds === 0 && env.seconds >= (c.every.after ?? 0);
  if ('objective' in c) return (s.scenario?.objectives[c.objective] ?? 'pending') === c.is;
  if ('fired' in c) return env.fired(c.fired);
  if ('firedCount' in c) { const pre = c.firedCount.prefix; return cmp(env, c, (s.scenario?.fired ?? []).filter((f) => f.startsWith(pre)).length); }
  if ('units' in c) return cmp(env, c, unitsMatching(env, c.units).length);
  if ('buildings' in c) return cmp(env, c, buildingsMatching(env, c.buildings).length);
  if ('value' in c) return cmp(env, c, value(env, c.value));
  if ('var' in c) return cmp(env, c, s.scenario?.vars[c.var] ?? 0);
  if ('entity' in c) {
    const e = entity(env, c.entity);
    const exists = c.exists ?? true;   // G9: { entity, hp } sem exists exige a entidade viva
    if (!e) return !exists;
    if (!exists) return false;
    if (e.kind === 'building') {
      if (c.complete !== undefined && e.complete !== c.complete) return false;
      if (c.progress !== undefined && !cmp(env, c.progress, e.progress)) return false;
    } else if (c.complete !== undefined || c.progress !== undefined) return false;   // unidade não tem obra
    if (c.hp !== undefined && !cmp(env, c.hp, hpFraction(e))) return false;   // G9: fração da vida
    return true;
  }
  if ('koth' in c) { const k = s.koth; return cmp(env, c, k && k.team === c.koth.team ? k.seconds : 0); }
  if ('wonderHeld' in c) { const p = player(env, c.wonderHeld.player); return cmp(env, c, p >= 0 ? wonderHeldSeconds(s, p) : 0); }
  if ('kingAlive' in c) { const p = player(env, c.kingAlive); return p >= 0 && kingAlive(s, p); }
  if ('alive' in c) { const p = player(env, c.alive); return p >= 0 && scenarioAlive(s, p); }   // marionete: tem entidade viva
  if ('difficulty' in c) { const d = s.config.campaignDifficulty ?? 'normal'; return Array.isArray(c.difficulty) ? c.difficulty.includes(d) : c.difficulty === d; }
  if ('powerUsed' in c) {   // G11: usos desde o início; sem comparação, ao menos 1
    const p = player(env, c.powerUsed.player); const n = p >= 0 ? powerUseCount(s.scenario, p, c.powerUsed.id) : 0;
    return hasCmp(c) ? cmp(env, c, n) : n >= 1;
  }
  if ('kills' in c) {   // G13: abates com autor; by.tag = só os das entidades do grupo (vivas ou não); by.type = só os desse tipo
    const k = c.kills; const types = k.type === undefined ? undefined : Array.isArray(k.type) ? k.type : [k.type];
    const by = k.by;
    return cmp(env, c, killCount(s.scenario, player(env, k.player), types, by && 'tag' in by ? tagIds(s, by.tag) : undefined, by && 'type' in by ? by.type : undefined));
  }
  return false;
}

function hasCmp(c: Cmp): boolean { return c.gte !== undefined || c.lte !== undefined || c.eq !== undefined || c.gt !== undefined || c.lt !== undefined; }

/** Compila uma condição isolada (harness de testes, roteiros de jogador): avaliada com os segundos inteiros do runner. */
export function compileCondition(c: Condition): (state: GameState) => boolean {
  return (state) => evalCondition(envOf(state), c);
}

// ---------------------------------------------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------------------------------------------

function storeTag(state: GameState, tag: string, ids: number[]): void {
  const vars = state.scenario?.vars; if (!vars || ids.length === 0) return;
  vars['#' + tag] = ids[0];
  ids.forEach((id, k) => { vars[`#${tag}[${k}]`] = id; });
  // a tag reusada substitui o grupo: apaga os índices do grupo antigo além do novo tamanho (senão tagIds os contaria)
  for (let k = ids.length; vars[`#${tag}[${k}]`] !== undefined; k++) delete vars[`#${tag}[${k}]`];
}

type OrderSpec = Extract<Action, { do: 'order' }>['order'];
/** Ordem por ponto (move/attackMove): decidida pelo tipo, não pela presença de 'at' (a validação recusa o campo trocado). */
function isPointOrder(o: OrderSpec): o is Extract<OrderSpec, { at: Point }> { return o.type === 'move' || o.type === 'attackMove'; }

function runActions(env: Env, ctx: TriggerCtx, list: Action[]): void {
  for (const a of list) runAction(env, ctx, a);
}

function runAction(env: Env, ctx: TriggerCtx, a: Action): void {
  const s = env.state;
  if (!a || typeof a !== 'object') return;
  switch (a.do) {
    case 'say': ctx.say(tx(a.speaker), tx(a.text), a.icon); return;
    case 'objective': ctx.objective(a.id, a.status); return;
    case 'reveal': ctx.reveal(a.id); return;
    case 'raid': {
      const owner = player(env, a.player); const pt = point(env, a.target);
      if (owner < 0 || !pt) { notifyRaid({ owner, requested: a.units.length, spawned: 0, noTarget: true }); return; }
      const angle = typeof a.angle === 'number' ? a.angle : a.angle.base + a.angle.perIndex * env.k;
      raid(s, owner, a.units, pt.x, pt.y, angle, a.distance ?? 22);
      return;
    }
    case 'spawn': {
      const owner = player(env, a.player); const pt = point(env, a.at);
      if (owner < 0 || !pt) return;
      const units = spawnGroup(s, owner, a.scaled ? scaledGroup(s, a.units) : a.units, pt.x, pt.y);
      if (a.name !== undefined) for (const u of units) u.displayName = localText(a.name);   // G8
      if (a.tag) storeTag(s, a.tag, units.map((u) => u.id));
      if (a.state === 'pray' && a.prayAt) { const b = entity(env, a.prayAt); if (b && b.kind === 'building') prayAt(units, b); }
      return;
    }
    case 'place': {
      const owner = player(env, a.player); const pt = point(env, a.at);
      if (owner < 0 || !pt || !has(BUILDINGS, a.building)) return;
      const complete = a.complete !== false;
      const b = a.exact ? placeExact(s, owner, a.building, pt.x, pt.y, complete) : placeNear(s, owner, a.building, pt.x, pt.y, complete);
      if (!b) return;
      if (!complete) { b.unpaid = true; if (a.progress !== undefined) b.progress = Math.max(0, a.progress); }
      if (a.name !== undefined) b.displayName = localText(a.name);   // G8
      if (a.tag) storeTag(s, a.tag, [b.id]);
      return;
    }
    case 'give': { const owner = player(env, a.player); if (owner >= 0) give(s, owner, a.resources); return; }
    case 'set': {
      const owner = player(env, a.player); const p = s.players[owner]; if (!p) return;
      if (a.age !== undefined) p.age = a.age;
      if (a.resources) for (const [k, v] of Object.entries(a.resources)) if (typeof v === 'number' && has(p.resources, k)) p.resources[k as ResourceType] = v;
      if (a.techs) for (const t of a.techs) grantTech(s, owner, t);
      if (a.minorGods) for (const g of a.minorGods) {
        if (!has(MINOR_GODS, g) || p.minorGods.includes(g)) continue;
        p.minorGods.push(g);
        const power = MINOR_GODS[g].power;
        if (power && !p.powers.some((x) => x.id === power)) p.powers.push({ id: power, used: false });
      }
      if (a.powers) {   // G11: tira, concede (sem repetir) e devolve o uso, nesta ordem; a barra de poderes e a IA leem p.powers
        const { add, remove, reset } = a.powers;
        if (remove) p.powers = p.powers.filter((x) => !remove.includes(x.id));
        if (add) for (const id of add) if (has(POWERS, id) && !p.powers.some((x) => x.id === id)) p.powers.push({ id, used: false });
        if (reset) for (const x of p.powers) if (reset.includes(x.id)) x.used = false;
      }
      return;
    }
    case 'removeAll': {
      const owner = a.player !== undefined ? player(env, a.player) : undefined;
      if (owner === undefined && a.team === undefined) return;
      removeAllOf(s, (o) => (owner === undefined || o === owner) && (a.team === undefined || s.players[o]?.team === a.team));
      return;
    }
    case 'setVar': if (s.scenario) s.scenario.vars[a.name] = value(env, a.value); return;
    case 'addVar': if (s.scenario) s.scenario.vars[a.name] = (s.scenario.vars[a.name] ?? 0) + a.delta; return;
    case 'storeEntity': { const e = entity(env, a.entity); if (s.scenario) s.scenario.vars[a.var] = e ? e.id : -1; return; }
    case 'advanceBuild': { const e = entity(env, a.entity); if (e && e.kind === 'building') advanceBuild(s, e, a.seconds); return; }
    case 'order': {
      const units = 'tag' in a.units && !('player' in a.units) ? tagIds(s, a.units.tag).map((id) => s.units.get(id)).filter((u): u is Unit => !!u && !u.dead) : unitsMatching(env, a.units as UnitFilter);
      const o = a.order;
      if (isPointOrder(o)) { const pt = point(env, o.at); if (!pt) return; for (const u of units) giveOrder(s, u, { type: o.type, x: pt.x, y: pt.y }); }   // pelo tipo, não por 'at'
      else if (o.type === 'ungarrison') {   // G6: sai do alvo (ou, sem alvo, de qualquer edifício em que esteja)
        const from = o.target ? entity(env, o.target) : undefined;
        if (o.target && (!from || from.kind !== 'building')) return;
        const byBuilding = new Map<number, number[]>();
        for (const u of units) { if (u.inside === -1 || (from && u.inside !== from.id)) continue; const ids = byBuilding.get(u.inside) ?? []; ids.push(u.id); byBuilding.set(u.inside, ids); }
        for (const [bid, ids] of byBuilding) { const b = s.buildings.get(bid); if (b && !b.dead) ejectGarrison(s, b, ids); }
      } else {
        const e = entity(env, o.target); if (!e) return;
        if (o.type === 'garrison') {   // G6: só em edifício aliado (mesma regra do comando 'garrison'); os demais seguem a ordem atual
          if (e.kind !== 'building') return;
          const team = s.players[e.owner]?.team;
          for (const u of units) if (s.players[u.owner]?.team === team && canGarrison(u, e)) giveOrder(s, u, { type: 'garrison', targetId: e.id });
        }
        else for (const u of units) giveOrder(s, u, { type: o.type, targetId: e.id });
      }
      return;
    }
    case 'kill': { const e = entity(env, a.entity); if (!e) return; if (e.kind === 'unit') killUnit(s, e, -1); else destroyBuilding(s, e, -1); return; }
    case 'remove': {   // G6: sem morte nem abate; a fila do edifício (unidades, tecnologias, avanço de Idade) é reembolsada como no destroyBuilding
      const e = entity(env, a.entity); if (!e) return;
      if (e.kind === 'unit') { removeUnitNow(s, e); return; }
      const owner = s.players[e.owner];
      if (owner) for (const q of e.queue) refund(owner, queueItemCost(s, owner, q));
      removeBuildingNow(s, e);
      return;
    }
    case 'hpFloor': { const e = entity(env, a.entity); if (!e) return; if (a.value > 0) e.hpFloor = Math.min(1, a.value); else delete e.hpFloor; return; }   // G9
    case 'damage': case 'heal': {   // G9
      const e = entity(env, a.entity); if (!e) return;
      const amount = a.amount ?? e.maxHp * (a.fraction ?? 0);
      if (a.do === 'damage') scriptedDamage(s, e, amount); else healEntity(e, amount);
      return;
    }
    case 'ability': {   // G12: mesmo caminho do comando 'ability' do jogador (useAbility: recarga, guarnecida, herói sem habilidade)
      const u = entity(env, a.unit); if (!u || u.kind !== 'unit') return;
      const owner = s.players[u.owner]; if (!owner || !useAbility(s, owner, u.id).ok) return;
      if (a.target === undefined) return;
      if (isPointLike(a.target)) { const pt = point(env, a.target as Point); if (pt) giveOrder(s, u, { type: 'attackMove', x: pt.x, y: pt.y }); return; }
      const t = entity(env, a.target as EntityRef); if (!t || t.id === u.id) return;
      if (isEnemy(s, u.owner, t.owner)) giveOrder(s, u, { type: 'attack', targetId: t.id }); else giveOrder(s, u, { type: 'move', x: t.x, y: t.y });
      return;
    }
    case 'ceasefire': ceasefire(s, a.seconds); return;
    case 'defeat': {   // derrota roteirizada: alive=false, evento de derrota e tudo do jogador some (marionete ou não)
      const owner = player(env, a.player); const p = s.players[owner]; if (!p) return;
      if (p.alive) defeatPlayer(s, p);
      removeAllOf(s, (o) => o === owner);
      p.alive = false;
      return;
    }
    case 'forEachPlayer': {
      let k = 0;
      for (const p of s.players) {
        if (a.team !== undefined && p.team !== a.team) continue;
        if (a.alive !== undefined && p.alive !== a.alive) continue;
        runActions({ ...env, p: p.id, k }, ctx, a.then);
        k++;
      }
      return;
    }
    default: return;   // ação desconhecida (validateScenario já recusou): não faz nada
  }
}

/** Contexto mínimo para o setup (antes do primeiro tick): diálogos viram eventos como no runner; objetivos/reveal mexem no estado. */
function setupCtx(state: GameState): TriggerCtx {
  return {
    say: (speaker, text, icon) => state.events.push({ tick: state.tick, type: 'dialogue', player: -1, text, data: `${icon ?? '🗣️'}|${speaker}` }),
    objective: (id, status) => { const sc = state.scenario; if (sc && sc.objectives[id] !== undefined) { sc.objectives[id] = status; sc.hidden[id] = false; } },
    reveal: (id) => { const sc = state.scenario; if (sc && sc.hidden[id] !== undefined) sc.hidden[id] = false; },
    seconds: 0,
    fired: (id) => !!state.scenario?.fired.includes(id),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Compilação
// ---------------------------------------------------------------------------------------------------------------

function objectiveCheck(o: { done?: Condition; failed?: Condition }): ObjectiveDef['check'] | undefined {
  if (!o.done && !o.failed) return undefined;
  return (state: GameState): ObjectiveStatus => {
    const env = envOf(state);
    if (o.failed && evalCondition(env, o.failed)) return 'failed';
    if (o.done && evalCondition(env, o.done)) return 'done';
    return 'pending';
  };
}

/** Config de partida derivada do arquivo: map.gen → mapSize/mapType/seed; map.data → config.map inline. */
export function scenarioConfig(file: ScenarioFile): ScenarioDef['config'] {
  const c = file.config;
  const gen = file.map && 'gen' in file.map ? file.map.gen : undefined;
  const data = file.map && 'data' in file.map ? file.map.data : undefined;
  const cfg: ScenarioDef['config'] = {
    seed: c.seed ?? gen?.seed ?? 1,
    mapSize: gen?.mapSize ?? 'medium',
    // G8: name { pt, en } vira o texto do idioma atual (state.players[i].name) e fica em nameText para o HUD trocar de idioma
    players: c.players.map((p): GameConfig['players'][number] => {
      const { name, ...rest } = p;
      const out: GameConfig['players'][number] = { ...rest, name: tx(name) };
      if (typeof name === 'object' && name !== null) out.nameText = localText(name);
      if (rest.forbid) out.forbid = copyForbid(rest.forbid);
      return out;
    }),
  };
  if (gen?.mapType) cfg.mapType = gen.mapType;
  const relics = file.map && 'gen' in file.map ? file.map.relics : undefined;   // G10: no mapa fixo, ficam em data.relics
  if (relics !== undefined) cfg.relics = Array.isArray(relics) ? relics.map(([x, y]) => [x, y] as [number, number]) : relics;
  if (data) cfg.map = data;
  if (c.startingAge !== undefined) cfg.startingAge = c.startingAge;
  if (c.startingResources) cfg.startingResources = { ...c.startingResources };
  if (c.revealMap !== undefined) cfg.revealMap = c.revealMap;
  if (c.startKit !== undefined) cfg.startKit = c.startKit;
  if (c.mode) cfg.mode = c.mode;
  if (c.campaignDifficulty) cfg.campaignDifficulty = c.campaignDifficulty;
  if (c.maxAge !== undefined) cfg.maxAge = c.maxAge;   // G6
  if (c.forbid) cfg.forbid = copyForbid(c.forbid);
  return cfg as ScenarioDef['config'];
}

/** Cópia das listas (a config da partida não compartilha arrays com o arquivo em cache). */
export function copyForbid(f: Forbid): Forbid {
  const out: Forbid = {};
  if (f.buildings) out.buildings = [...f.buildings];
  if (f.units) out.units = [...f.units];
  if (f.techs) out.techs = [...f.techs];
  return out;
}

/** Compila o arquivo (já validado) num ScenarioDef. Textos fixos (título, intro, objetivos, HUD) usam o idioma atual. */
export function compileScenario(file: ScenarioFile): ScenarioDef {
  const objectives: ObjectiveDef[] = (file.objectives ?? []).map((o) => {
    const d: ObjectiveDef = { id: o.id, text: tx(o.text) };
    if (o.optional) d.optional = true;
    if (o.hidden) d.hidden = true;
    const check = objectiveCheck(o); if (check) d.check = check;
    return d;
  });
  const triggers: TriggerDef[] = (file.triggers ?? []).map((tr) => ({
    id: tr.id,
    when: (state, ctx) => evalCondition(envOf(state, ctx), tr.when),
    then: (state, ctx) => runActions(envOf(state, ctx), ctx, tr.then),
    ...(tr.repeat ? { repeat: true } : {}),
    ...(tr.repeat && typeof tr.repeat === 'object' ? { maxFires: tr.repeat.max } : {}),   // G17
  }));
  const def: ScenarioDef = {
    id: file.id, title: tx(file.title), subtitle: tx(file.subtitle), icon: file.icon ?? '📜',
    intro: (file.intro ?? []).map(tx),
    config: scenarioConfig(file),
    objectives, triggers,
    victory: (state) => evalCondition(envOf(state), file.victory),
  };
  if (file.outro) def.outro = file.outro.map(tx);
  if (file.hints) def.hints = file.hints.map(tx);
  if (file.defeat) { const d = file.defeat; def.defeat = (state) => evalCondition(envOf(state), d); }
  if (file.setup || file.vars) {
    const setup = file.setup ?? [], vars = file.vars ?? {};
    def.setup = (state) => {
      if (state.scenario) for (const [k, v] of Object.entries(vars)) if (typeof v === 'number') state.scenario.vars[k] = v;
      runActions(envOf(state), setupCtx(state), setup);
    };
  }
  if (file.hud) def.hud = file.hud.map((h): ScenarioHudDef => {
    if (h.type === 'countdown') {
      const d: ScenarioHudDef = { type: 'countdown', seconds: h.seconds, while: (state) => evalCondition(envOf(state), h.while), label: tx(h.label) };
      const from = h.fromVar;   // G4: contagem relativa ao instante marcado (setVar { time: true }); sem marca, não aparece (valor em `vars` vale como marca; o lint avisa)
      if (from) d.start = (state) => { const v = state.scenario?.vars[from]; return typeof v === 'number' ? v : null; };
      return d;
    }
    const w = h.while;
    const shown = (state: GameState) => !w || evalCondition(envOf(state), w);
    if ('var' in h) {   // G4: barra de uma variável do cenário (máximo fixo ou dinâmico)
      const name = h.var, max = h.max;
      const d: ScenarioHudDef = { type: 'progress', max: typeof max === 'number' ? max : 0, label: tx(h.label), entity: (state) => (shown(state) ? Math.max(0, state.scenario?.vars[name] ?? 0) : -1) };
      if (typeof max !== 'number') d.maxOf = (state) => value(envOf(state), max);
      if (h.format) d.format = h.format;
      return d;
    }
    const ref = h.entity;
    const d: ScenarioHudDef = { type: 'progress', max: h.max, label: tx(h.label), entity: (state) => { if (!shown(state)) return -1; const e = entity(envOf(state), ref); return e && e.kind === 'building' && !e.complete ? e.progress : -1; } };
    if (h.format) d.format = h.format;
    return d;
  });
  return def;
}

// ---------------------------------------------------------------------------------------------------------------
// Cache por (hash do JSON, idioma)
// ---------------------------------------------------------------------------------------------------------------

/** FNV-1a 32 bits sobre JSON.stringify(file): identifica o cenário (cache, lobby). Não é segurança. */
export function scenarioHash(file: ScenarioFile): number {
  let js = ''; try { js = JSON.stringify(file); } catch { js = ''; }
  let h = 2166136261 >>> 0;
  for (let i = 0; i < js.length; i++) { h ^= js.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

const CACHE_MAX = 8;
const cache = new Map<string, ScenarioDef>();

/**
 * Compila com cache por (hash do JSON, idioma): o mesmo JSON devolve o mesmo objeto; outro idioma devolve um objeto novo.
 * Valida antes de compilar (ids reservados permitidos: um arquivo já carregado na partida não passa pelo filtro de import);
 * lança Error com os primeiros problemas se o arquivo for inválido.
 */
export function compileScenarioCached(file: ScenarioFile): ScenarioDef {
  const key = `${scenarioHash(file)}:${getLocale()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const issues = validateScenario(file, { allowReserved: true });
  if (issues.length > 0) throw new Error('cenário inválido: ' + issues.slice(0, 3).map((i) => `${i.path}: ${i.message}`).join('; '));
  const def = compileScenario(file);
  if (cache.size >= CACHE_MAX) { const first = cache.keys().next().value; if (first !== undefined) cache.delete(first); }
  cache.set(key, def);
  return def;
}

/** Esvazia o cache (testes). */
export function clearScenarioCache(): void { cache.clear(); }

/** Config de partida pronta para createGame a partir de um arquivo de cenário. */
export function gameConfigFor(file: ScenarioFile): GameConfig { return { ...scenarioConfig(file), scenarioData: file }; }
