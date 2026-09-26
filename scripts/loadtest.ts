// Teste de carga do multiplayer (ROADMAP 4.4): N bots em Node, cada um com o seu NetClient e a SUA simulação
// (createGame + NetworkScheduler, o mesmo fluxo de startNetworkGame/rejoinNetworkGame em src/main.ts), jogando pelo
// relay real o mais rápido que a rede permite. Os bots geram comandos plausíveis e determinísticos (RNG próprio
// semeado pelo slot) a partir do próprio estado. Mede: hashes de todos a cada 100 ticks, banda, instantâneos,
// ms/tick, espera pela rede, CPU/memória do relay. Eventos: queda (--drop-at) com reconexão ou "seguir sem ele",
// espectador entrando no meio (--spectator-at).
//
// Uso: npx tsx scripts/loadtest.ts [--minutes 40] [--bots 4] [--delay 4] [--jitter 0-80] [--drop-at 15[,25]]
//        [--drop-mode wait|resume|resume-rejoin[,…]] [--drop-bot 2] [--rejoin-after 10] [--spectator-at 20] [--map arquivo.map.json]
//        [--map-size large] [--seed 42] [--relay ws://host:porta] [--realtime] [--inject-desync M[:cmd]]
//        [--label nome] [--out arquivo.json] [--no-report]      (npm run loadtest -- …)
//   --realtime: cada bot anda a 20 ticks/s com o acumulador de Session.step (em vez de acelerado) e mede quadros travados
//   --drop-mode wait   (padrão): todos pausam; o bot volta após --rejoin-after s reais com o mesmo nome e recebe o instantâneo
//   --drop-mode resume: o anfitrião segue sem ele após 2 s (P → 'resume'); o bot não volta
//   --drop-mode resume-rejoin: o anfitrião segue sem ele e o bot volta depois, com a partida andando
//   --inject-desync M[:cmd]: autoteste do detector — no minuto M o bot 1 muta o próprio estado por fora de um Command
//                     (ou, com :cmd, executa um comando que não mandou para a rede)
//   --drop-bot N: quem cai (padrão: bot 2; 0 = o próprio anfitrião, o relay passa a vez ao próximo)
// Cada processo filho é um bot (fork deste arquivo com --worker); o relay é um processo próprio numa porta livre, sem limite de
// taxa no modo acelerado (--no-rate-limit) e com os limites normais em --realtime. Com --relay externo e sem --realtime, o
// relay precisa ter sido iniciado com --no-rate-limit.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fork, spawn, execSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NetClient } from '../src/net/client';
import { createGame, tick as simTick } from '../src/core/sim/game';
import { NetworkScheduler } from '../src/core/net/lockstep';
import { stateHash } from '../src/core/net/hash';
import { serialize, deserialize } from '../src/core/serialize';
import { migrateMap, validateMap, mapHash, type FixedMapData } from '../src/core/map/fixed';
import { MAP_SIZES, TICK_RATE } from '../src/core/constants';
import { RNG } from '../src/core/rng';
import { AGES, BUILDINGS, MAX_AGE, TECHS, UNITS } from '../src/core/data';
import { academyTechCount, canAdvanceAge, canResearch, canTrain } from '../src/core/sim/commands';
import { findBuildSpot } from '../src/core/sim/ai';
import { nearestEnemyBuilding, nearestFreeFarm, nearestNode, nodeHasRoom, isEnemy } from '../src/core/sim/queries';
import { rectReachable } from '../src/core/map/components';
import { canAfford } from '../src/core/sim/economy';
import { getBuildingStats } from '../src/core/sim/modifiers';
import type { Building, Command, GameConfig, GameState, Unit } from '../src/core/types';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const now = () => performance.now();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const MIN = 60 * TICK_RATE;   // ticks por minuto simulado

type Frames = [number, Command[]][];
type Pending = [number, [number, Command[]][]][];
type DropMode = 'wait' | 'resume' | 'resume-rejoin';

interface WorkerInit {
  t: 'init'; idx: number; name: string; god: string; relay: string; room: string; spectator: boolean; isHost: boolean;
  delay: number; endTick: number; jitterMin: number; jitterMax: number; dropModes: DropMode[]; realtime: boolean; injectAt: number; injectKind: 'state' | 'cmd';
}
interface BotStats {
  idx: number; name: string; role: string; slot: number; tick: number; ticks: number; realMs: number; simMs: number; maxTickMs: number;
  thinkMs: number; waitMs: number; pausedMs: number; cmdsIssued: number; bytesSent: number; bytesRecv: number; msgsSent: number; msgsRecv: number;
  rtt: number; rssPeakMB: number; cpuS: number; desynced: boolean; dropped: boolean; rejoins: number; frames: number; stallFrames: number;
  final?: { units: number; buildings: number; gameOver: boolean; winner: number; players: { name: string; alive: boolean; age: number; pop: number; units: number; military: number; buildings: number; techs: number; kills: number }[] };
}

// ============================================================ BOT (processo filho) ============================================================

/** Cérebro do bot: lê o próprio estado e devolve comandos para o próprio jogador. Só leitura do estado (nunca muta). */
export class Brain {
  private rng: RNG;
  private nextAttack: number;
  private nextResearch = 0;
  private nextPower: number;
  private nextScout = 0;
  constructor(private me: number) {
    this.rng = new RNG(0x5eed + me * 7919);
    this.nextAttack = 6 * MIN + me * 30 * TICK_RATE;   // primeiro ataque ~6 min, depois a cada ~3 min simulados, defasado por slot
    this.nextPower = 6 * MIN + me * 45 * TICK_RATE;
  }

  think(state: GameState): Command[] {
    const me = this.me, p = state.players[me];
    if (!p || !p.alive || state.gameOver) return [];
    const out: Command[] = [];
    const units: Unit[] = [], buildings: Building[] = [];
    for (const u of state.units.values()) if (u.owner === me && !u.dead) units.push(u);
    for (const b of state.buildings.values()) if (b.owner === me && !b.dead) buildings.push(b);
    const tc = buildings.find((b) => b.type === 'town_center' && b.complete) ?? buildings.find((b) => b.type === 'town_center');
    const anchor = tc ?? units[0];
    if (!anchor) return out;
    const vills = units.filter((u) => u.type === 'villager' && u.inside === -1);
    const busy = new Set<number>();   // cidadãos já usados nesta rodada
    const military = units.filter((u) => u.inside === -1 && UNITS[u.type].tags.includes('military') && !UNITS[u.type].tags.includes('scout') && UNITS[u.type].attack > 0);
    const has = (type: string, complete = false) => buildings.filter((b) => b.type === type && (!complete || b.complete)).length;
    const cost = (type: string) => getBuildingStats(state, p, type).cost;
    const builderNear = (x: number, y: number, n: number): number[] => {
      const c = vills.filter((v) => v.state !== 'build' && !busy.has(v.id)).sort((a, b) => ((a.x - x) ** 2 + (a.y - y) ** 2) - ((b.x - x) ** 2 + (b.y - y) ** 2)).slice(0, n);
      for (const v of c) busy.add(v.id);
      return c.map((v) => v.id);
    };
    const tryBuild = (type: string, ax: number, ay: number, minR: number, maxR: number, nBuilders: number): boolean => {
      if (!canAfford(p, cost(type))) return false;
      const spot = findBuildSpot(state, p, type, ax, ay, minR, maxR);
      if (!spot) return false;
      const ids = builderNear(spot.x, spot.y, nBuilders);
      if (ids.length === 0) return false;
      out.push({ type: 'build', player: me, ids, building: type, tx: spot.x, ty: spot.y });
      return true;
    };

    // Poupança para a próxima Idade: requisitos (edifício/techs) cumpridos, falta só recurso → sem tropas novas, coleta o que falta
    const next = p.age < MAX_AGE ? AGES[p.age + 1] : null;
    const reqOk = !!next && (!next.requires.building || has(next.requires.building, true) > 0) && (!next.requires.techCount || academyTechCount(p) >= next.requires.techCount);
    const deficit = (r: 'food' | 'wood' | 'gold') => (reqOk && next ? ((next.cost as Record<string, number>)[r] ?? 0) - p.resources[r] : 0);
    const saving = reqOk && (['food', 'gold'] as const).some((r) => deficit(r) > 0);
    // Defesa: inimigo armado perto da base → exército ataca-move até ele
    let threat: Unit | null = null, threatD = 18 * 18;
    for (const u of state.units.values()) {
      if (u.dead || u.inside !== -1 || !isEnemy(state, me, u.owner) || UNITS[u.type].attack <= 0 || UNITS[u.type].tags.includes('scout')) continue;
      const d = (u.x - anchor.x) ** 2 + (u.y - anchor.y) ** 2;
      if (d < threatD) { threatD = d; threat = u; }
    }
    if (threat) {
      const t = threat as Unit;
      const defenders = military.filter((u) => u.state !== 'attack');
      if (defenders.length) out.push({ type: 'attackMove', player: me, ids: defenders.map((u) => u.id), x: t.x, y: t.y });
    }

    // 1) Cidadãos ociosos coletam (comida/madeira/ouro, favor no templo)
    const temple = buildings.find((b) => b.type === 'temple' && b.complete);
    const praying = vills.filter((v) => v.state === 'pray').length;
    let assigned = 0;
    for (const v of vills) {
      if (assigned >= 6) break;
      if (v.state !== 'idle' || v.order) continue;
      busy.add(v.id); assigned++;
      if (temple && praying + assigned <= 3 && this.rng.chance(0.3)) { out.push({ type: 'pray', player: me, ids: [v.id], targetId: temple.id }); continue; }
      const r = this.rng.float();
      const lacking = (['food', 'gold'] as const).filter((x) => deficit(x) > 0);
      const res = lacking.length && this.rng.chance(0.6) ? this.rng.pick(lacking) : r < 0.4 ? 'food' : r < 0.7 ? 'wood' : 'gold';
      const fx = Math.floor(v.x), fy = Math.floor(v.y);
      const reach = (n: { x: number; y: number }) => rectReachable(state.map, fx, fy, n.x, n.y, 1, 1, true);
      if (res === 'food') {
        const node = nearestNode(state, v.x, v.y, 'food', 16, -1, (n) => nodeHasRoom(state, n) && reach(n));
        if (node) { out.push({ type: 'gather', player: me, ids: [v.id], targetId: node.id }); continue; }
        const farm = nearestFreeFarm(state, me, v.x, v.y, 25);
        if (farm) { out.push({ type: 'gather', player: me, ids: [v.id], targetId: farm.id }); continue; }
        if (canAfford(p, cost('farm'))) {
          const spot = findBuildSpot(state, p, 'farm', anchor.x, anchor.y, 2, 10);
          if (spot) { out.push({ type: 'build', player: me, ids: [v.id], building: 'farm', tx: spot.x, ty: spot.y }); continue; }
        }
      }
      const want = res === 'food' ? 'wood' : res;
      const node = nearestNode(state, v.x, v.y, want, 24, -1, (n) => nodeHasRoom(state, n) && reach(n)) ?? nearestNode(state, anchor.x, anchor.y, want, 45, -1, reach);
      if (node) out.push({ type: 'gather', player: me, ids: [v.id], targetId: node.id });
    }

    // 2) Treino de cidadãos no centro cívico
    const queuedV = buildings.reduce((n, b) => n + b.queue.filter((q) => q.kind === 'unit' && q.id === 'villager').length, 0);
    const vTarget = Math.min(60, 24 + 8 * p.age);
    if (tc && tc.queue.length < 2 && vills.length + queuedV < vTarget && canTrain(state, p, tc, 'villager').ok) out.push({ type: 'train', player: me, buildingId: tc.id, unit: 'villager' });

    // 3) Casas quando a população aperta
    const buildingHouse = buildings.some((b) => b.type === 'house' && !b.complete);
    if (!buildingHouse && p.popCap - p.pop <= 5 && has('house') < 25) tryBuild('house', anchor.x, anchor.y, 3, 16, 1);

    // 4) Edifícios por idade (um de cada vez), pontos de entrega perto de recursos distantes
    const plan: [string, number, number][] = [['barracks', 1, 0], ['temple', 1, 0], ['academy', 1, 1], ['barracks', 2, 1], ['stable', 1, 1], ['market', 1, 1], ['tower', 2, 1], ['siege_workshop', 1, 2], ['fortress', 1, 2], ['academy', 2, 2], ['barracks', 3, 2], ['stable', 2, 2], ['tower', 6, 2], ['fortress', 2, 3]];
    // obras abandonadas (construtor morto ou realocado) recebem um cidadão
    for (const b of buildings) {
      if (b.complete || vills.some((v) => v.state === 'build' && v.targetId === b.id)) continue;
      const ids = builderNear(b.x, b.y, 1);
      if (ids.length) out.push({ type: 'repair', player: me, ids, targetId: b.id });
    }
    const underConstruction = buildings.filter((b) => !b.complete && !['house', 'farm', 'lumber_camp', 'mine'].includes(b.type)).length;
    if (underConstruction === 0) {
      for (const [type, n, age] of plan) {
        if (p.age < age || has(type) >= n) continue;
        if (tryBuild(type, anchor.x, anchor.y, 4, 18, 2)) break;   // sem recurso/lugar: tenta o próximo do plano
      }
    }
    for (const [res, drop] of [['wood', 'lumber_camp'], ['gold', 'mine']] as const) {
      if (has(drop) >= 2 || !this.rng.chance(0.1)) continue;
      const far = vills.find((v) => { if (v.nodeId <= 0) return false; const n = state.map.nodes.get(v.nodeId); return !!n && (res === 'wood' ? n.type === 'tree' : n.type === 'gold') && Math.abs(n.x - anchor.x) + Math.abs(n.y - anchor.y) > 12; });
      if (far) { const n = state.map.nodes.get(far.nodeId)!; tryBuild(drop, n.x, n.y, 2, 6, 1); }
    }

    // Mercado: troca o excedente de comida/madeira por ouro (o ouro acaba antes)
    const market = buildings.find((b) => b.type === 'market' && b.complete);
    if (market && (p.resources.gold < 400 || deficit('gold') > 0)) {
      for (let k = 0; k < 3; k++) {
        const r = p.resources.food > p.resources.wood ? 'food' : 'wood';
        if (p.resources[r] < 800) break;
        out.push({ type: 'trade', player: me, action: 'sell', resource: r });
        out.push({ type: 'trade', player: me, action: 'buy', resource: 'gold' });
      }
    }

    // 5) Exército, templo, academia
    for (const b of buildings) {
      if (!b.complete || b.queue.length >= 2) continue;
      const def = BUILDINGS[b.type];
      if (def.military && def.trains && (!saving || threat || military.length < 8) && p.resources.food >= 120 && (p.resources.gold >= 60 || p.resources.wood >= 100)) {
        const opts = def.trains.filter((u) => !UNITS[u].tags.includes('hero') && !UNITS[u].tags.includes('scout') && canTrain(state, p, b, u).ok);
        if (opts.length) out.push({ type: 'train', player: me, buildingId: b.id, unit: this.rng.pick(opts) });
      }
      if (b.type === 'temple' && !saving && b.queue.length === 0 && p.resources.favor >= 30 && this.rng.chance(0.2)) {
        const opts = (def.trains ?? []).filter((u) => canTrain(state, p, b, u).ok);
        if (opts.length) out.push({ type: 'train', player: me, buildingId: b.id, unit: this.rng.pick(opts) });
      }
      if (b.type === 'academy' && b.queue.length === 0 && b.scholars < 3 && p.resources.gold >= 150) out.push({ type: 'hireScholar', player: me, buildingId: b.id });
    }

    // 6) Pesquisa (a cada ~20 s simulados) e avanço de Idade
    if (state.tick >= this.nextResearch && (!saving || p.age >= 1)) {
      this.nextResearch = state.tick + 20 * TICK_RATE;
      const idle = buildings.filter((b) => b.complete && b.queue.length === 0);
      const opts: [number, string][] = [];
      for (const b of idle) for (const id of Object.keys(TECHS)) if (TECHS[id].building === b.type && canResearch(state, p, b, id).ok) opts.push([b.id, id]);
      const academyOpts = opts.filter(([, id]) => TECHS[id].building === 'academy');   // a Academia destrava as Idades seguintes
      if (academyOpts.length && this.rng.chance(0.7)) { const [bid, tech] = this.rng.pick(academyOpts); out.push({ type: 'research', player: me, buildingId: bid, tech }); }
      else if (opts.length) { const [bid, tech] = this.rng.pick(opts); out.push({ type: 'research', player: me, buildingId: bid, tech }); }
    }
    if (tc) {
      const adv = canAdvanceAge(state, p, tc);
      if (adv.ok) out.push({ type: 'advanceAge', player: me, buildingId: tc.id, minorGod: adv.minorOptions && adv.minorOptions.length ? this.rng.pick(adv.minorOptions) : undefined });
    }

    // 7) Batedores exploram; exército ataca o CC inimigo mais próximo a cada ~3 min
    if (state.tick >= this.nextScout) {
      this.nextScout = state.tick + 15 * TICK_RATE;
      for (const s of units) if (s.type === 'kataskopos' && s.state === 'idle' && s.inside === -1) out.push({ type: 'move', player: me, ids: [s.id], x: this.rng.range(4, state.map.w - 4), y: this.rng.range(4, state.map.h - 4) });
    }
    if (state.tick >= this.nextAttack && military.length >= 10 && !threat) {
      this.nextAttack = state.tick + 3 * MIN;
      const wave = military.slice(0, Math.ceil(military.length * 2 / 3));   // parte do exército fica em casa
      const lead = wave[0];
      const reachable = (b: Building) => rectReachable(state.map, Math.floor(lead.x), Math.floor(lead.y), b.tx, b.ty, b.w, b.h, true);
      const target = nearestEnemyBuilding(state, me, anchor.x, anchor.y, (b) => b.type === 'town_center' && reachable(b)) ?? nearestEnemyBuilding(state, me, anchor.x, anchor.y, reachable);
      if (target) out.push({ type: 'attackMove', player: me, ids: wave.map((u) => u.id), x: target.x, y: target.y + target.h / 2 + 1, formation: this.rng.pick(['line', 'box', 'wedge'] as const) });
    }

    // 8) Poder divino de vez em quando
    if (state.tick >= this.nextPower) {
      this.nextPower = state.tick + (60 + this.rng.int(0, 120)) * TICK_RATE;
      const avail = p.powers.filter((x) => !x.used);
      if (avail.length) {
        const pw = this.rng.pick(avail).id;
        let enemyUnit: Unit | null = null, bestD = Infinity;
        for (const u of state.units.values()) if (!u.dead && u.inside === -1 && isEnemy(state, me, u.owner)) { const d = (u.x - anchor.x) ** 2 + (u.y - anchor.y) ** 2; if (d < bestD) { bestD = d; enemyUnit = u; } }
        const enemyB = nearestEnemyBuilding(state, me, anchor.x, anchor.y);
        const armyAt = military[0] ?? anchor;
        switch (pw) {
          case 'bolt': if (enemyUnit) out.push({ type: 'power', player: me, power: pw, targetId: enemyUnit.id }); break;
          case 'sentinel': if (tc) out.push({ type: 'power', player: me, power: pw, targetId: tc.id }); break;
          case 'restoration': out.push({ type: 'power', player: me, power: pw, x: armyAt.x, y: armyAt.y }); break;
          case 'curse': case 'lightning_storm': case 'pestilence': case 'earthquake': { const t = enemyUnit ?? enemyB; if (t) out.push({ type: 'power', player: me, power: pw, x: t.x, y: t.y }); break; }
          default: out.push({ type: 'power', player: me, power: pw, x: anchor.x + 4, y: anchor.y + 4 });
        }
      }
    }
    return out;
  }
}

async function runWorker(): Promise<void> {
  const ipc = (m: Record<string, unknown>) => { if (process.connected) process.send!(m); };
  const init = await new Promise<WorkerInit>((r) => process.once('message', (m) => r(m as WorkerInit)));
  const c = { bytesSent: 0, bytesRecv: 0, msgsSent: 0, msgsRecv: 0, ticks: 0, simMs: 0, maxTickMs: 0, thinkMs: 0, waitMs: 0, pausedMs: 0, cmds: 0, frames: 0, stallFrames: 0 };
  const role = init.spectator ? 'espectador' : init.isHost ? 'anfitrião' : 'jogador';
  let rssPeak = 0; const cpu0 = process.cpuUsage(); let real0 = now();   // real0: início da partida (reinicia no start)
  let rejoins = 0, dropped = false, stopping = false, finalSent = false, dumpAt = -1, dumped = false;
  let wake: (() => void) | null = null;

  interface Game { state: GameState; sched: NetworkScheduler; slots: number[]; local: number; spectator: boolean; config: GameConfig; delay: number; base: { kind: 'config' } | { kind: 'snapshot'; tick: number; data: string }; frames: Frames }
  let game: Game | null = null;
  let client!: NetClient;
  let paused = false, pauseStart = 0;
  let leftCount = 0;   // quedas vistas por este bot (índice em --drop-mode; sobrevive à reconexão do próprio bot)
  const setPaused = (v: boolean) => { if (v === paused) return; paused = v; if (v) pauseStart = now(); else c.pausedMs += now() - pauseStart; };
  let brain: Brain | null = null;

  /** Cliente com contagem de bytes/mensagens e latência artificial no envio (fila FIFO, como o TCP). */
  const makeClient = async (): Promise<NetClient> => {
    const cl = new NetClient();
    await cl.connect(init.relay);
    const ws = cl.ws!;
    ws.addEventListener('message', (ev: MessageEvent) => { c.msgsRecv++; c.bytesRecv += Buffer.byteLength(String(ev.data)); const w = wake; wake = null; w?.(); });
    const queue: { at: number; s: string }[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pump = () => {
      timer = null;
      const t = now();
      while (queue.length && queue[0].at <= t + 0.5) { const q = queue.shift()!; if (ws.readyState === 1) ws.send(q.s); }
      if (queue.length) timer = setTimeout(pump, Math.max(0, queue[0].at - now()));
    };
    cl.send = (msg: Record<string, unknown>) => {
      if (ws.readyState !== 1) return;
      const s = JSON.stringify(msg);
      c.msgsSent++; c.bytesSent += Buffer.byteLength(s);
      if (init.jitterMax <= 0) { ws.send(s); return; }
      const at = Math.max(queue.length ? queue[queue.length - 1].at : 0, now() + init.jitterMin + Math.random() * (init.jitterMax - init.jitterMin));
      queue.push({ at, s });
      if (!timer) timer = setTimeout(pump, Math.max(0, queue[0].at - now()));
    };
    cl.on('error', (m) => ipc({ t: 'error', msg: `relay: ${String(m.msg)}` }));
    return cl;
  };

  /** Espelha startNetworkGame (src/main.ts): validação do mapa, slots, agendador, queda/retomada, instantâneo. */
  const startGame = (cl: NetClient, config: GameConfig, slots: number[], delay: number): Game | null => {
    if (config.map) {
      config.map = migrateMap(config.map);
      const errors = validateMap(config.map, { players: config.players.length, mode: config.mode }).filter((i) => i.level === 'error');
      if (errors.length) { ipc({ t: 'error', msg: `mapa inválido: ${errors.map((e) => e.code).join(', ')}` }); return null; }
    }
    const spectator = cl.isSpectator || slots.indexOf(cl.slot) < 0;
    const local = spectator ? Math.max(0, config.players.findIndex((p) => !p.isAI)) : slots.indexOf(cl.slot);
    const t0 = now();
    const state = createGame(config);
    const createMs = now() - t0;
    const humans = slots.map((_, i) => i);
    const sched = new NetworkScheduler(spectator ? -1 : local, humans, delay, { sendCmds: (t, cmds) => cl.sendCmds(t, cmds), sendHash: (t, h, p) => cl.sendHash(t, h, p) });
    const g: Game = { state, sched, slots, local, spectator, config, delay, base: { kind: 'config' }, frames: [] };
    sched.onDesync = (tk) => ipc({ t: 'desync', tick: tk, detail: sched.lastDesync });
    cl.on('cmds', (m) => { const i = slots.indexOf(Number(m.slot)); if (i >= 0) sched.receive(i, Number(m.tick), (m.cmds as Command[]) ?? []); });
    cl.on('hash', (m) => { const i = slots.indexOf(Number(m.slot)); if (i >= 0) sched.receiveHash(i, Number(m.tick), Number(m.hash), m.parts); });
    let awaiting = -1;
    cl.on('left', (m) => {
      const i = slots.indexOf(Number(m.slot)); if (i < 0 || game !== g) return;
      sched.dropPlayer(i);
      awaiting = i; setPaused(true);
      ipc({ t: 'left', slot: i, tick: g.state.tick });
      // anfitrião decide: esperar a reconexão (padrão) ou seguir sem o jogador (P → 'resume')
      const mode = init.dropModes[leftCount++] ?? 'wait';
      if (cl.isHost && mode !== 'wait') setTimeout(() => { if (game === g && awaiting !== -1) cl.resume(); }, 2000);
    });
    cl.on('resume', () => { if (game !== g) return; awaiting = -1; setPaused(false); ipc({ t: 'resumed', tick: g.state.tick }); });
    const resumeAfterRejoin = () => { if (awaiting !== -1) { awaiting = -1; setPaused(false); } };
    cl.on('snapshotRequest', (m) => {
      if (game !== g) return;
      const i = slots.indexOf(Number(m.slot)); if (i < 0 && !m.spectator) return;
      const tk = g.state.tick;
      const s0 = now();
      const data = JSON.stringify({ state: serialize(g.state), pending: sched.exportPending(tk) });
      const serializeMs = now() - s0;
      cl.snapshot(Number(m.slot), data, tk);
      ipc({ t: 'snapshotSent', forSlot: Number(m.slot), spectator: i < 0, tick: tk, bytes: Buffer.byteLength(data), serializeMs });
      if (i < 0) return;
      sched.addPlayer(i, NetworkScheduler.resumeTick(tk, sched.delayTicks));
      resumeAfterRejoin();
    });
    cl.on('rejoined', (m) => {
      if (game !== g) return;
      const i = slots.indexOf(Number(m.slot)); if (i < 0) return;
      sched.addPlayer(i, NetworkScheduler.resumeTick(Number(m.tick), sched.delayTicks));
      resumeAfterRejoin();
    });
    if (c.ticks === 0 && rejoins === 0) real0 = now();
    ipc({ t: 'started', local, spectator, createMs });
    return g;
  };

  /** Espelha rejoinNetworkGame: entra pausado, descarta quem já caiu e adota o instantâneo do anfitrião. */
  const beginRejoin = (cl: NetClient, m: Record<string, unknown>, joinAt: number) => {
    const g = startGame(cl, m.config as GameConfig, m.slots as number[], Number(m.delay) || 4);
    if (!g) return;
    setPaused(true);
    for (const s of (m.dropped as number[]) ?? []) { const i = g.slots.indexOf(s); if (i >= 0) g.sched.dropPlayer(i); }
    game = g;
    cl.on('snapshot', (sm) => {
      if (game !== g) return;
      const a0 = now();
      const raw = String(sm.data);
      const data = JSON.parse(raw) as { state: string; pending: Pending };
      g.state = deserialize(data.state);
      g.sched.importPending(data.pending, NetworkScheduler.resumeTick(Number(sm.tick), g.delay), Number(sm.tick));
      g.base = { kind: 'snapshot', tick: Number(sm.tick), data: data.state };
      g.frames = [];
      const applyMs = now() - a0;
      if (!g.spectator) brain = new Brain(g.local);
      setPaused(false);
      ipc({ t: 'rejoined', tick: Number(sm.tick), bytes: Buffer.byteLength(raw), applyMs, waitedMs: now() - joinAt, spectator: g.spectator });
    });
  };

  /** Conecta e entra na sala (primeira vez ou reconexão: o relay responde 'joined' com rejoin quando a partida já começou). */
  const connectAndJoin = async () => {
    const joinAt = now();
    client = await makeClient();
    const cl = client;
    cl.on('joined', (m) => {
      if (m.rejoin) beginRejoin(cl, m, joinAt);
      else ipc({ t: 'joined', slot: cl.slot, host: cl.isHost });
    });
    cl.on('start', (m) => {
      const g = startGame(cl, m.config as GameConfig, m.slots as number[], Number(m.delay) || 4);
      if (!g) return;
      game = g;
      if (!g.spectator) brain = new Brain(g.local);
    });
    cl.on('close', () => { if (!stopping && cl === client && !dropped) ipc({ t: 'error', msg: 'conexão com o relay caiu' }); });
    cl.join(init.room, init.name, init.god, init.spectator);
  };

  const stats = (): BotStats => {
    const g = game;
    const st = g?.state;
    const cu = process.cpuUsage(cpu0);
    const final = st ? {
      units: st.units.size, buildings: st.buildings.size, gameOver: st.gameOver, winner: st.winner,
      players: st.players.map((p) => {
        let u = 0, mil = 0, b = 0;
        for (const x of st.units.values()) if (x.owner === p.id) { u++; if (UNITS[x.type].tags.includes('military')) mil++; }
        for (const x of st.buildings.values()) if (x.owner === p.id) b++;
        return { name: p.name, alive: p.alive, age: p.age, pop: p.pop, units: u, military: mil, buildings: b, techs: p.techs.length, kills: p.stats.kills };
      }),
    } : undefined;
    return {
      idx: init.idx, name: init.name, role, slot: client?.slot ?? -1, tick: st?.tick ?? 0, ticks: c.ticks, realMs: now() - real0, simMs: c.simMs, maxTickMs: c.maxTickMs,
      thinkMs: c.thinkMs, waitMs: c.waitMs, pausedMs: c.pausedMs + (paused ? now() - pauseStart : 0), cmdsIssued: c.cmds, bytesSent: c.bytesSent, bytesRecv: c.bytesRecv,
      msgsSent: c.msgsSent, msgsRecv: c.msgsRecv, rtt: client?.rtt ?? -1, rssPeakMB: rssPeak / 1048576, cpuS: (cu.user + cu.system) / 1e6,
      desynced: !!g?.sched.desynced, dropped, rejoins, frames: c.frames, stallFrames: c.stallFrames, final,
    };
  };

  process.on('message', async (raw) => {
    const m = raw as Record<string, unknown>;
    if (m.t === 'start' && client) client.start(m.config as GameConfig, init.delay);
    if (m.t === 'drop') {
      // queda: fecha a conexão; a simulação local é descartada (como recarregar a página)
      const mode = m.mode as DropMode;
      dropped = true; game = null; brain = null; setPaused(false);
      client.close();
      ipc({ t: 'droppedSelf', mode });
      if (mode !== 'resume') {
        await sleep(Number(m.rejoinAfterMs) || 10000);
        dropped = false; rejoins++; finalSent = false;
        await connectAndJoin();
      } else { finalSent = true; ipc({ t: 'final', stats: stats() }); }
    }
    if (m.t === 'dump') dumpAt = Number(m.atTick);
    if (m.t === 'stop') { stopping = true; ipc({ t: 'bye', stats: stats() }); client?.close(); setTimeout(() => process.exit(0), 200); }
  });
  setInterval(() => {
    rssPeak = Math.max(rssPeak, process.memoryUsage().rss);
    const g = game;
    ipc({ t: 'progress', tick: g?.state.tick ?? -1, paused, waiting: g?.sched.waiting ?? 0, alive: !!g });
  }, 1000).unref();

  await connectAndJoin();

  // Laço: avança o mais rápido possível; cede ao event loop a cada ~10 ms ou quando precisa esperar a rede
  const inboxOf = (s: NetworkScheduler) => (s as unknown as { inbox: Map<number, Map<number, Command[]>> }).inbox;   // só leitura: registra os comandos executados (diagnóstico)
  let waitStart = -1, lastThink = -1;
  const thinkOffset = (init.idx * 5) % TICK_RATE;
  /** Um tick: pensa (a cada segundo, defasado por slot), registra os comandos que vão executar e avança. */
  const stepOnce = (g: Game): 'ok' | 'blocked' | 'stop' => {
    if ((game as Game | null) !== g || paused || g.state.tick >= init.endTick || (dumpAt >= 0 && g.state.tick >= dumpAt)) return 'stop';
    const s = g.state, T = s.tick;
    const br = brain as Brain | null;   // atribuído nos tratadores de mensagem
    if (br && T !== lastThink && T % TICK_RATE === thinkOffset) {
      lastThink = T;
      const k0 = now();
      for (const cmd of br.think(s)) { g.sched.issue(cmd); c.cmds++; }
      c.thinkMs += now() - k0;
    }
    if (T === init.injectAt && init.injectKind === 'cmd') {
      // autoteste: comando local que só este bot executa (nunca vai para a rede)
      const v = [...s.units.values()].find((x) => x.owner === g.local && x.type === 'villager');
      if (v) g.sched.receive(g.local, T, [{ type: 'move', player: g.local, ids: [v.id], x: v.x + 3, y: v.y + 3 }]);
    }
    const m = inboxOf(g.sched).get(T);
    const cmds: Command[] = [];
    if (m) for (const k of [...m.keys()].sort((a, b) => a - b)) cmds.push(...(m.get(k) ?? []));
    const s0 = now();
    const ok = g.sched.step(s);
    const s1 = now();
    if (!ok) { if (waitStart < 0) waitStart = s1; return 'blocked'; }
    // autoteste do detector (--inject-desync): muta o estado por fora de um Command, só neste bot
    if (s.tick === init.injectAt && init.injectKind === 'state') { const u = [...s.units.values()].find((x) => x.owner === g.local); if (u) u.hp = Math.max(1, u.hp - 7); }
    if (waitStart >= 0) { c.waitMs += s0 - waitStart; waitStart = -1; }
    c.simMs += s1 - s0; c.ticks++; if (s1 - s0 > c.maxTickMs) c.maxTickMs = s1 - s0;
    if (cmds.length) g.frames.push([T, cmds]);
    if (s.tick % 100 === 0) ipc({ t: 'hash', tick: s.tick, hash: stateHash(s), units: s.units.size, buildings: s.buildings.size });
    return 'ok';
  };
  /** Fim de partida / pedido de estado para diagnóstico. Devolve true se não há o que simular agora. */
  const idleChecks = (g: Game): boolean => {
    const st = g.state;
    if (dumpAt >= 0 && st.tick >= dumpAt && !dumped) {
      dumped = true;
      ipc({ t: 'dump', tick: st.tick, state: serialize(st), frames: g.frames, base: g.base, config: g.config });
    }
    if (st.tick >= init.endTick || (dumpAt >= 0 && st.tick >= dumpAt)) {
      if (st.tick >= init.endTick && !finalSent) { finalSent = true; ipc({ t: 'final', stats: stats() }); }
      return true;
    }
    return false;
  };
  if (init.realtime) {
    // Tempo real: quadros de ~16 ms com o mesmo acumulador de Session.step (src/game/session.ts): no máximo 12 ticks por
    // quadro; tick bloqueado pela rede segura o acumulador em 2 ticks (a partida desacelera em vez de "correr atrás")
    let last = now(), acc = 0;
    while (!stopping) {
      await sleep(16);
      const t = now(), dt = (t - last) / 1000; last = t;
      const g = game as Game | null;
      if (!g || paused) { acc = 0; if (waitStart >= 0) { c.waitMs += t - waitStart; waitStart = -1; } continue; }
      if (idleChecks(g)) continue;
      c.frames++;
      acc += Math.min(0.25, dt);
      let n = 0, stalled = false;
      while (acc >= 1 / TICK_RATE && n < 12) {
        const r = stepOnce(g);
        if (r === 'stop') break;
        if (r === 'blocked') { acc = Math.min(acc, 2 / TICK_RATE); stalled = true; break; }
        acc -= 1 / TICK_RATE; n++;
      }
      if (n >= 12) acc = 0;
      if (stalled) c.stallFrames++;
    }
    return;
  }
  // Acelerado: avança o mais rápido possível; cede ao event loop a cada ~10 ms ou quando precisa esperar a rede
  while (!stopping) {
    const g = game as Game | null;   // trocado pelos tratadores de mensagem (queda/reconexão)
    if (!g || paused) { if (waitStart >= 0) { c.waitMs += now() - waitStart; waitStart = -1; } await sleep(5); continue; }
    if (idleChecks(g)) { await sleep(20); continue; }
    let blocked = false;
    const b0 = now();
    while (now() - b0 < 10) {
      const r = stepOnce(g);
      if (r === 'stop') break;
      if (r === 'blocked') { blocked = true; break; }
    }
    if (blocked) await new Promise<void>((r) => { wake = r; setTimeout(r, 4); });
    else await new Promise<void>((r) => setImmediate(r));
  }
}

// ============================================================ ORQUESTRADOR ============================================================

interface Args {
  minutes: number; bots: number; delay: number; jitterMin: number; jitterMax: number; dropAt: number[]; dropModes: DropMode[]; rejoinAfter: number;
  dropBot: number; injectAt: number; injectKind: 'state' | 'cmd'; spectatorAt: number; map?: string; mapSize: 'small' | 'medium' | 'large'; seed: number; relay?: string; label?: string; out?: string; report: boolean; realtime: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { minutes: 40, bots: 4, delay: 4, jitterMin: 0, jitterMax: 0, dropAt: [], dropModes: [], rejoinAfter: 10, dropBot: -1, injectAt: -1, injectKind: 'state', spectatorAt: -1, mapSize: 'large', seed: 42, report: true, realtime: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => { const x = argv[++i]; if (x === undefined) { console.error(`Falta o valor de ${k}`); process.exit(2); } return x; };
    switch (k) {
      case '--minutes': a.minutes = Number(v()); break;
      case '--bots': a.bots = Math.max(1, Math.min(4, Number(v()) | 0)); break;
      case '--delay': a.delay = Math.max(1, Number(v()) | 0); break;
      case '--jitter': { const s = v().replace(/ms$/, ''); const [lo, hi] = s.includes('-') ? s.split('-').map(Number) : [0, Number(s)]; a.jitterMin = lo; a.jitterMax = hi; break; }
      case '--drop-at': a.dropAt = v().split(',').map(Number).filter((x) => x >= 0); break;
      case '--drop-mode': a.dropModes = v().split(',').map((x) => (x === 'resume' || x === 'resume-rejoin' ? x : 'wait')); break;
      case '--rejoin-after': a.rejoinAfter = Number(v()); break;
      case '--drop-bot': a.dropBot = Number(v()) | 0; break;
      case '--inject-desync': { const [m, kind] = v().split(':'); a.injectAt = Math.round(Number(m) * MIN); a.injectKind = kind === 'cmd' ? 'cmd' : 'state'; break; }
      case '--spectator-at': a.spectatorAt = Number(v()); break;
      case '--map': a.map = v(); break;
      case '--map-size': a.mapSize = v() as Args['mapSize']; break;
      case '--seed': a.seed = Number(v()) >>> 0; break;
      case '--relay': a.relay = v(); break;
      case '--label': a.label = v(); break;
      case '--out': a.out = v(); break;
      case '--no-report': a.report = false; break;
      case '--realtime': a.realtime = true; break;
      default: console.error(`Opção desconhecida: ${k}`); process.exit(2);
    }
  }
  while (a.dropModes.length < a.dropAt.length) a.dropModes.push('wait');
  return a;
}

const freePort = () => new Promise<number>((resolve, reject) => { const s = net.createServer(); s.once('error', reject); s.listen(0, () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); }); });

/** CPU (s) e memória (MB) de um processo via /proc (Linux). */
function procStats(pid: number, clk: number): { cpuS: number; rssMB: number; hwmMB: number } | null {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const kb = (key: string) => Number(new RegExp(`${key}:\\s+(\\d+)`).exec(status)?.[1] ?? 0);
    return { cpuS: (Number(f[11]) + Number(f[12])) / clk, rssMB: kb('VmRSS') / 1024, hwmMB: kb('VmHWM') / 1024 };
  } catch { return null; }
}

/** Primeiras diferenças entre dois valores JSON (caminho → a, b). Listas de entidades são indexadas pelo id. */
function jsonDiff(a: unknown, b: unknown, pathStr = '$', out: string[] = [], limit = 20): string[] {
  if (out.length >= limit) return out;
  if (a === b) return out;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') { out.push(`${pathStr}: ${JSON.stringify(a)?.slice(0, 120)} ≠ ${JSON.stringify(b)?.slice(0, 120)}`); return out; }
  if (Array.isArray(a) && Array.isArray(b)) {
    const ids = (arr: unknown[]) => arr.map((x) => (x && typeof x === 'object' ? (x as { id?: unknown }).id : undefined));
    const idsA = ids(a), idsB = ids(b);
    const byId = a.length > 0 && [...idsA, ...idsB].every((x) => typeof x === 'number') && new Set(idsA).size === a.length && new Set(idsB).size === b.length;
    if (byId) {
      const mb = new Map((b as { id: number }[]).map((x) => [x.id, x]));
      const idSet = new Set(idsA);
      for (const x of a as { id: number }[]) { if (!mb.has(x.id)) out.push(`${pathStr}[id=${x.id}]: só no primeiro`); else jsonDiff(x, mb.get(x.id), `${pathStr}[id=${x.id}]`, out, limit); if (out.length >= limit) return out; }
      for (const x of b as { id: number }[]) if (!idSet.has(x.id)) { out.push(`${pathStr}[id=${x.id}]: só no segundo`); if (out.length >= limit) return out; }
      return out;
    }
    if (a.length !== b.length) out.push(`${pathStr}.length: ${a.length} ≠ ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length) && out.length < limit; i++) jsonDiff(a[i], b[i], `${pathStr}[${i}]`, out, limit);
    return out;
  }
  const ka = Object.keys(a as object), kb = Object.keys(b as object);
  for (const k of new Set([...ka, ...kb])) { jsonDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${pathStr}.${k}`, out, limit); if (out.length >= limit) break; }
  return out;
}

interface DumpMsg { tick: number; state: string; frames: Frames; base: { kind: 'config' } | { kind: 'snapshot'; tick: number; data: string }; config: GameConfig }

/** Refaz offline a simulação de um bot (base + comandos gravados) até `to`, devolvendo os hashes por tick. */
function replay(d: DumpMsg, to: number, onTick?: (s: GameState) => void): GameState {
  const st = d.base.kind === 'config' ? createGame(JSON.parse(JSON.stringify(d.config))) : deserialize(d.base.data);
  const fr = new Map(d.frames.map(([t, c]) => [t, c]));
  while (st.tick < to) { simTick(st, fr.get(st.tick) ?? []); onTick?.(st); }
  return st;
}

async function runOrchestrator(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const endTick = Math.round(args.minutes * MIN);
  const t0 = now();
  let clk = 100; try { clk = Number(execSync('getconf CLK_TCK').toString().trim()) || 100; } catch { /* padrão Linux */ }

  // Mapa fixo (opcional)
  let map: FixedMapData | undefined;
  if (args.map) {
    map = migrateMap(JSON.parse(fs.readFileSync(args.map, 'utf8')));
    const errs = validateMap(map, { players: args.bots }).filter((i) => i.level === 'error');
    if (errs.length) { console.error(`Mapa inválido: ${errs.map((e) => e.code).join(', ')}`); process.exit(2); }
  }
  const gods = ['zeus', 'poseidon', 'hades', 'zeus'];
  const config: GameConfig = {
    seed: args.seed, mapSize: args.mapSize, players: Array.from({ length: args.bots }, (_, i) => ({ name: `Bot ${i}`, god: gods[i % gods.length], isAI: false, difficulty: 'normal' as const })),
    mode: 'conquest', mapType: 'continental', ...(map ? { map, mapHash: mapHash(map) } : {}),
  };
  const mapLabel = map ? `${path.basename(args.map!)} (${map.w}×${map.h})` : `${args.mapSize} ${MAP_SIZES[args.mapSize].w}×${MAP_SIZES[args.mapSize].h} gerado`;

  // Relay próprio (processo filho) numa porta livre
  let relayProc: ChildProcess | null = null, relayUrl = args.relay ?? '';
  const relaySamples: { cpuS: number; rssMB: number; hwmMB: number; tick: number }[] = [];
  if (!relayUrl) {
    const port = await freePort();
    // acelerado: os bots mandam centenas de ticks por segundo, acima do limite de taxa do relay (4.5); em tempo real o limite
    // fica ligado — e o teste mostra que o jogo normal cabe nele
    relayProc = spawn(process.execPath, [path.join(ROOT, 'server/relay.mjs'), String(port), ...(args.realtime ? [] : ['--no-rate-limit'])], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('relay não subiu')), 10000);
      relayProc!.stdout!.on('data', (d) => { if (String(d).includes('ouvindo')) { clearTimeout(to); resolve(); } });
      relayProc!.once('exit', (code) => reject(new Error(`relay saiu (${code})`)));
    });
    relayUrl = `ws://127.0.0.1:${port}`;
  }
  const room = `CARGA${process.pid % 10000}`;
  console.log(`Teste de carga: ${args.bots} bots × ${args.minutes} min simulados${args.realtime ? ' em tempo real' : ''} · atraso ${args.delay} · jitter ${args.jitterMin}-${args.jitterMax} ms · mapa ${mapLabel} · semente ${args.seed} · relay ${relayUrl}${relayProc ? ` (pid ${relayProc.pid})` : ''}`);
  if (args.dropAt.length) console.log(`Quedas do bot ${args.dropBot >= 0 ? Math.min(args.dropBot, args.bots - 1) : Math.min(2, args.bots - 1)} em ${args.dropAt.map((m, i) => `${m} min (${args.dropModes[i]})`).join(', ')}; reconexão após ${args.rejoinAfter} s reais`);
  if (args.spectatorAt >= 0) console.log(`Espectador entra em ${args.spectatorAt} min`);

  // Estado do orquestrador
  interface W { key: string; idx: number; proc: ChildProcess; tick: number; alive: boolean; done: boolean; stats?: BotStats; lastProgress: number; paused: boolean; dropped: boolean }
  const workers: W[] = [];
  const hashes = new Map<number, Map<string, number>>();
  const snapshots: Record<string, unknown>[] = [], rejoinEvents: Record<string, unknown>[] = [], events: string[] = [];
  let mismatch: { tick: number; hashes: Record<string, number> } | null = null;
  const relayDesyncs: Record<string, unknown>[] = [];
  const dumps = new Map<string, DumpMsg>();
  let dumpRequested = false;
  const dropBot = args.dropBot >= 0 ? Math.min(args.dropBot, args.bots - 1) : Math.min(2, args.bots - 1);
  let nextDrop = 0, spectatorSpawned = false;
  const observer = dropBot === 0 ? 'b1' : 'b0';   // quem narra as quedas no log
  let hostTick = 0;
  let peak = { units: 0, buildings: 0, tick: 0 };   // pico de unidades no estado do anfitrião (amostrado a cada 100 ticks)
  const log = (s: string) => { const line = `[${((now() - t0) / 1000).toFixed(1)} s] ${s}`; events.push(line); console.log(line); };

  const spawnWorker = (idx: number, spectator: boolean): W => {
    const key = spectator ? 'spec' : `b${idx}`;
    const proc = fork(SELF, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const w: W = { key, idx, proc, tick: 0, alive: true, done: false, lastProgress: now(), paused: false, dropped: false };
    workers.push(w);
    const init: WorkerInit = { t: 'init', idx, name: spectator ? 'Espectador' : `Bot ${idx}`, god: gods[idx % gods.length], relay: relayUrl, room, spectator, isHost: idx === 0 && !spectator, delay: args.delay, endTick, jitterMin: args.jitterMin, jitterMax: args.jitterMax, dropModes: args.dropModes, realtime: args.realtime, injectAt: idx === 1 && !spectator ? args.injectAt : -1, injectKind: args.injectKind };
    proc.send(init);
    proc.on('message', (raw) => onMessage(w, raw as Record<string, unknown>));
    proc.on('exit', (code) => { w.alive = false; if (code && !w.done) log(`${key} saiu com código ${code}`); });
    return w;
  };
  const waitFor = (w: W, t: string) => new Promise<Record<string, unknown>>((r) => { const h = (m: unknown) => { const mm = m as Record<string, unknown>; if (mm.t === t) { w.proc.off('message', h); r(mm); } }; w.proc.on('message', h); });

  const addHash = (key: string, tick: number, h: number) => {
    let m = hashes.get(tick); if (!m) { m = new Map(); hashes.set(tick, m); }
    m.set(key, h);
    const first = [...m.values()][0];
    if (!mismatch && [...m.values()].some((x) => x !== first)) {
      mismatch = { tick, hashes: Object.fromEntries(m) };
      log(`DESSINCRONIZAÇÃO no tick ${tick}: ${JSON.stringify(mismatch.hashes)}`);
      requestDump();
    }
  };
  const requestDump = () => {
    if (dumpRequested) return;
    dumpRequested = true;
    setTimeout(() => {
      const maxTick = Math.max(...workers.map((w) => w.tick));
      const at = Math.min(endTick, Math.ceil((maxTick + 400) / 100) * 100);
      log(`pedindo o estado de todos no tick ${at} para comparar`);
      for (const w of workers) if (w.alive && !w.dropped) w.proc.send({ t: 'dump', atTick: at });
    }, 1500);
  };

  function onMessage(w: W, m: Record<string, unknown>) {
    switch (m.t) {
      case 'hash':
        w.tick = Number(m.tick); addHash(w.key, Number(m.tick), Number(m.hash));
        if (w.key === 'b0') { hostTick = w.tick; if (Number(m.units) > peak.units) peak = { units: Number(m.units), buildings: Number(m.buildings), tick: w.tick }; }
        break;
      case 'progress': w.lastProgress = now(); if (Number(m.tick) >= 0) w.tick = Number(m.tick); w.paused = !!m.paused; if (w.key === 'b0') hostTick = w.tick; checkEvents(); break;
      case 'started': log(`${w.key} começou a partida (local ${m.local}${m.spectator ? ', espectador' : ''}; createGame ${Number(m.createMs).toFixed(0)} ms)`); break;
      case 'left': if (w.key === observer) log(`${w.key} viu a queda do jogador ${m.slot} no tick ${m.tick}`); break;
      case 'resumed': if (w.key === observer) log(`${w.key} recebeu 'resume' (o anfitrião seguiu sem o jogador) no tick ${m.tick}`); break;
      case 'droppedSelf': log(`${w.key} fechou a conexão (${m.mode})`); break;
      case 'snapshotSent': snapshots.push({ ...m, t: undefined }); log(`anfitrião enviou instantâneo para o slot ${m.forSlot}${m.spectator ? ' (espectador)' : ''}: tick ${m.tick}, ${(Number(m.bytes) / 1024).toFixed(0)} KB, serialize ${Number(m.serializeMs).toFixed(0)} ms`); break;
      case 'rejoined': rejoinEvents.push({ bot: w.key, ...m, t: undefined }); w.dropped = false; log(`${w.key} ${m.spectator ? 'entrou como espectador' : 'reconectou'} no tick ${m.tick} (instantâneo ${(Number(m.bytes) / 1024).toFixed(0)} KB, aplicado em ${Number(m.applyMs).toFixed(0)} ms, ${(Number(m.waitedMs) / 1000).toFixed(1)} s desde o join)`); break;
      case 'desync': relayDesyncs.push({ bot: w.key, tick: m.tick, detail: m.detail }); log(`${w.key}: o NetworkScheduler acusou dessincronização no tick ${m.tick}`); break;
      case 'final': w.done = true; w.stats = m.stats as BotStats; break;
      case 'bye': w.stats = m.stats as BotStats; break;
      case 'dump': dumps.set(w.key, m as unknown as DumpMsg); break;
      case 'error': log(`${w.key} ERRO: ${m.msg}`); break;
    }
  }

  function checkEvents() {
    const dw = workers.find((w) => w.key === `b${dropBot}`);
    if (dw && nextDrop < args.dropAt.length && dw.tick >= args.dropAt[nextDrop] * MIN && !dw.dropped && dw.tick >= endTick - MIN) {
      log(`queda em ${args.dropAt[nextDrop]} min ignorada: perto demais do fim (falta menos de 1 min simulado)`); nextDrop++;
    }
    if (dw && nextDrop < args.dropAt.length && dw.tick >= args.dropAt[nextDrop] * MIN && !dw.dropped) {
      const mode = args.dropModes[nextDrop++];
      dw.dropped = true;
      if (mode === 'resume') { dw.done = true; }
      dw.proc.send({ t: 'drop', mode, rejoinAfterMs: args.rejoinAfter * 1000 });
    }
    if (args.spectatorAt >= 0 && !spectatorSpawned && hostTick >= args.spectatorAt * MIN) { spectatorSpawned = true; log(`espectador entrando (anfitrião no tick ${hostTick})`); spawnWorker(args.bots, true); }
  }

  // Sobe os bots em ordem (o bot 0 vira anfitrião) e o anfitrião inicia
  for (let i = 0; i < args.bots; i++) { const w = spawnWorker(i, false); const j = await waitFor(w, 'joined'); log(`b${i} entrou na sala ${room} (slot ${j.slot}${j.host ? ', anfitrião' : ''})`); }
  workers[0].proc.send({ t: 'start', config });

  // Amostragem do relay e vigia de travamento
  let relayCpu0 = relayProc ? procStats(relayProc.pid!, clk)?.cpuS ?? 0 : 0;
  const sampler = setInterval(() => { if (relayProc) { const s = procStats(relayProc.pid!, clk); if (s) relaySamples.push({ ...s, tick: hostTick }); } }, 1000);
  let result: 'ok' | 'desync' | 'stall' | 'error' = 'ok';
  let lastMax = -1, lastMaxAt = now();
  const gameStart = now();
  while (true) {
    await sleep(250);
    checkEvents();
    const active = workers.filter((w) => !(w.dropped && w.done));
    const allDone = active.every((w) => w.done) && nextDrop >= args.dropAt.length && (args.spectatorAt < 0 || spectatorSpawned);
    if (dumpRequested && workers.filter((w) => w.alive && !w.dropped).every((w) => dumps.has(w.key))) { result = 'desync'; break; }
    if (allDone && !dumpRequested) break;
    const maxT = Math.max(...workers.map((w) => w.tick));
    if (maxT !== lastMax) { lastMax = maxT; lastMaxAt = now(); }
    const rejoinWindow = args.rejoinAfter * 1000 + 20000;
    if (now() - lastMaxAt > Math.max(60000, rejoinWindow)) { result = 'stall'; log(`TRAVOU: nenhum avanço há ${((now() - lastMaxAt) / 1000).toFixed(0)} s; ticks ${workers.map((w) => `${w.key}=${w.tick}${w.paused ? '(pausado)' : ''}`).join(' ')}`); break; }
    if (workers.some((w) => !w.alive && !w.done && !w.dropped)) { result = 'error'; log('um bot morreu antes do fim'); break; }
  }
  const gameRealS = (now() - gameStart) / 1000;
  clearInterval(sampler);
  const relayEnd = relayProc ? procStats(relayProc.pid!, clk) : null;
  if (mismatch && result === 'ok') result = 'desync';

  // Diagnóstico de dessincronização: estado ao vivo comparado + refazer offline até o primeiro tick divergente
  let diagnosis: Record<string, unknown> | null = null;
  if (mismatch) {
    const mm = mismatch as { tick: number; hashes: Record<string, number> };
    const all = Object.fromEntries(hashes.get(mm.tick) ?? new Map<string, number>());   // todos os que chegaram a esse tick (não só os dois primeiros)
    mm.hashes = all;
    const count = new Map<number, number>(); for (const h of Object.values(all)) count.set(h, (count.get(h) ?? 0) + 1);
    const ranked = [...count.entries()].sort((a, b) => b[1] - a[1]);
    // maioria; empate: fica com o grupo do anfitrião (b0)
    const majority = ranked.length > 1 && ranked[0][1] === ranked[1][1] && all.b0 !== undefined ? all.b0 : ranked[0][0];
    const good = Object.entries(all).filter(([, h]) => h === majority).map(([k]) => k);
    const bad = Object.entries(all).filter(([, h]) => h !== majority).map(([k]) => k);
    const refKey = good.find((k) => dumps.get(k)?.base.kind === 'config') ?? good[0];
    diagnosis = { firstCheckpoint: mm.tick, majority: good, divergent: bad, reference: refKey };
    const ref = dumps.get(refKey);
    for (const k of bad) {
      const d = dumps.get(k);
      if (!ref || !d) continue;
      const entry: Record<string, unknown> = {};
      entry.liveDiffAtTick = ref.tick;
      entry.liveDiff = jsonDiff(JSON.parse(ref.state), JSON.parse(d.state));
      // comandos executados: primeira diferença
      const fa = new Map(ref.frames.map(([t, c]) => [t, JSON.stringify(c)])), fb = new Map(d.frames.map(([t, c]) => [t, JSON.stringify(c)]));
      const start = d.base.kind === 'snapshot' ? d.base.tick : 0;
      let frameDiff: number | null = null;
      for (let t = start; t < Math.min(ref.tick, d.tick); t++) if ((fa.get(t) ?? '[]') !== (fb.get(t) ?? '[]')) { frameDiff = t; break; }
      entry.firstDifferentCommandsTick = frameDiff;
      if (frameDiff !== null) entry.commands = { ref: fa.get(frameDiff) ?? '[]', div: fb.get(frameDiff) ?? '[]' };
      // refaz os dois offline, tick a tick, e procura o primeiro hash diferente
      const hr = new Map<number, number>(), hd = new Map<number, number>();
      replay(ref, mm.tick, (s) => { if (s.tick >= start) hr.set(s.tick, stateHash(s)); });
      replay(d, mm.tick, (s) => hd.set(s.tick, stateHash(s)));
      if (d.base.kind === 'snapshot') { const s0 = deserialize(d.base.data); const r0 = replay(ref, start); hr.set(start, stateHash(r0)); hd.set(start, stateHash(s0)); entry.snapshotBaseMatchesReference = stateHash(r0) === stateHash(s0); if (!entry.snapshotBaseMatchesReference) entry.snapshotBaseDiff = jsonDiff(JSON.parse(serialize(r0)), JSON.parse(d.base.data)); }
      let first = -1;
      for (let t = start; t <= mm.tick; t++) if (hr.has(t) && hd.has(t) && hr.get(t) !== hd.get(t)) { first = t; break; }
      entry.replayReproduces = first >= 0;
      entry.replayRefMatchesLive = hr.get(mm.tick) === majority;
      entry.verdict = first >= 0
        ? (frameDiff !== null && frameDiff <= first ? `comandos diferentes a partir do tick ${frameDiff} (rede/agendador)` : `mesmos comandos, estados divergem no tick ${first}: não determinismo reproduzível (núcleo${d.base.kind === 'snapshot' ? ' ou instantâneo' : ''})`)
        : entry.replayRefMatchesLive ? 'refazer offline não reproduz: o estado do bot foi alterado fora dos comandos (processo/cache/efeito colateral)' : 'nem a referência reproduz o hash ao vivo: não determinismo dependente do processo';
      if (first >= 0) {
        entry.firstDivergentTick = first;
        const ra = replay(ref, first), rb = replay(d, first);
        entry.diffAtFirstTick = jsonDiff(JSON.parse(serialize(ra)), JSON.parse(serialize(rb)));
      }
      (diagnosis[k] = entry);
    }
    console.log('\nDiagnóstico da dessincronização:\n' + JSON.stringify(diagnosis, null, 2));
  }

  // Encerra
  for (const w of workers) if (w.alive) w.proc.send({ t: 'stop' });
  await sleep(800);
  for (const w of workers) if (w.alive) w.proc.kill();
  if (relayProc) relayProc.kill();

  // Hashes comparados
  let compared = 0, full = 0;
  const expectedAt = (t: number) => workers.filter((w) => w.key !== 'spec' || t >= (Number(rejoinEvents.find((r) => r.bot === 'spec')?.tick) || Infinity)).length;
  for (const [t, m] of hashes) { if (m.size >= 2) compared++; if (m.size >= expectedAt(t) - (args.dropAt.length ? 1 : 0)) full++; }

  // Tabela
  const fmt = (n: number, d = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const rows = workers.map((w) => {
    const s = w.stats;
    if (!s) return { bot: w.key, missing: true };
    const simMin = Math.max(1e-9, s.ticks / MIN);
    const busyS = Math.max(1e-9, (s.realMs - s.pausedMs) / 1000);
    return {
      bot: w.key, papel: s.role, tick: s.tick, ticks: s.ticks, 'ticks/s real': Math.round(s.ticks / busyS), 'ms/tick': +(s.simMs / Math.max(1, s.ticks)).toFixed(3), 'pior tick ms': +s.maxTickMs.toFixed(1),
      'pensar ms/min': +(s.thinkMs / simMin).toFixed(1), 'espera %': +(100 * s.waitMs / Math.max(1, s.realMs - s.pausedMs)).toFixed(1), 'pausado s': +(s.pausedMs / 1000).toFixed(1),
      'KB env/min': +(s.bytesSent / 1024 / simMin).toFixed(1), 'KB rec/min': +(s.bytesRecv / 1024 / simMin).toFixed(1), 'msg env/s': +(s.msgsSent / (s.ticks / TICK_RATE)).toFixed(1), 'msg rec/s': +(s.msgsRecv / (s.ticks / TICK_RATE)).toFixed(1),
      comandos: s.cmdsIssued, 'cmd/min': +(s.cmdsIssued / simMin).toFixed(1), 'RSS MB': +s.rssPeakMB.toFixed(0), 'CPU s': +s.cpuS.toFixed(1), rtt: s.rtt, desync: s.desynced,
      // tempo real: quadros em que um tick esperou a rede e quanto a partida ficou mais lenta que o relógio
      ...(args.realtime ? { 'quadros travados %': +(100 * s.stallFrames / Math.max(1, s.frames)).toFixed(2), 'lentidão %': +(100 * (1 - (s.ticks * 1000 / TICK_RATE) / Math.max(1, s.realMs - s.pausedMs))).toFixed(1) } : {}),
    };
  });
  console.log(`\nResultado: ${result === 'ok' ? 'OK (sem dessincronização)' : result.toUpperCase()} · ${fmt(gameRealS, 1)} s reais de partida · ${compared} checkpoints de hash comparados (${full} com todos os bots presentes)`);
  console.table(rows);
  const relayCpuS = relayEnd ? relayEnd.cpuS - relayCpu0 : NaN;
  const hostStats = workers[0].stats;
  const simMinutes = hostStats ? hostStats.ticks / MIN : args.minutes;
  const relay = relayEnd ? { cpuS: +relayCpuS.toFixed(2), cpuPctOfReal: +(100 * relayCpuS / gameRealS).toFixed(1), cpuMsPerSimMin: +(1000 * relayCpuS / simMinutes).toFixed(1), rssEndMB: +relayEnd.rssMB.toFixed(1), rssPeakMB: +relayEnd.hwmMB.toFixed(1), samples: relaySamples.length } : null;
  if (relay) console.log(`Relay: CPU ${relay.cpuS} s (${relay.cpuPctOfReal}% do tempo real; ${relay.cpuMsPerSimMin} ms por minuto simulado), RSS final ${relay.rssEndMB} MB, pico ${relay.rssPeakMB} MB`);
  for (const s of snapshots) console.log(`Instantâneo: tick ${s.tick} → ${fmt(Number(s.bytes) / 1024)} KB (${s.spectator ? 'espectador' : 'reconexão'}), serialize ${Number(s.serializeMs).toFixed(0)} ms`);
  const fin = hostStats?.final;
  if (fin) {
    console.log(`Fim (anfitrião, tick ${hostStats!.tick}): ${fin.units} unidades, ${fin.buildings} edifícios${fin.gameOver ? `, partida encerrada (vencedor ${fin.winner})` : ''}`);
    console.log(`Pico: ${peak.units} unidades e ${peak.buildings} edifícios no tick ${peak.tick} (${(peak.tick / MIN).toFixed(1)} min)`);
    for (const p of fin.players) console.log(`  ${p.name}: ${p.alive ? 'vivo' : 'derrotado'}, idade ${p.age}, pop ${p.pop}, ${p.units} unidades (${p.military} militares), ${p.buildings} edifícios, ${p.techs} techs, ${p.kills} abates`);
  }

  // Relatório JSON
  if (args.report) {
    const date = new Date().toISOString().slice(0, 10);
    const out = args.out ?? path.join(ROOT, `docs/perf/loadtest-${date}.json`);
    const label = args.label ?? `${args.bots}b-${args.minutes}m-d${args.delay}${args.jitterMax ? `-j${args.jitterMax}` : ''}${args.dropAt.length ? `-drop${args.dropAt.join('+')}` : ''}${args.spectatorAt >= 0 ? `-spec${args.spectatorAt}` : ''}${args.realtime ? '-rt' : ''}${args.map ? `-${path.basename(args.map).replace(/\.map\.json$/, '')}` : `-${args.mapSize}`}`;
    let doc: { date: string; runs: Record<string, unknown>[] } = { date, runs: [] };
    try { const prev = JSON.parse(fs.readFileSync(out, 'utf8')); if (Array.isArray(prev.runs)) doc = prev; } catch { /* novo */ }
    const run = {
      label, when: new Date().toISOString(), result, command: `npx tsx scripts/loadtest.ts ${process.argv.slice(2).join(' ')}`.trim(),
      env: { node: process.version, cpus: os.cpus().length, cpu: os.cpus()[0]?.model, platform: `${os.platform()} ${os.release()}`, loadavg: os.loadavg().map((x) => +x.toFixed(1)) },   // carga da máquina: ms/tick e pior tick variam com ela
      setup: { bots: args.bots, minutes: args.minutes, realtime: args.realtime, endTick, delay: args.delay, jitterMs: [args.jitterMin, args.jitterMax], map: mapLabel, seed: args.seed, dropAt: args.dropAt, dropModes: args.dropModes, rejoinAfterS: args.rejoinAfter, spectatorAt: args.spectatorAt },
      realSeconds: +gameRealS.toFixed(1), hashCheckpoints: { compared, withAllBots: full }, mismatch, relayDesyncs, diagnosis,
      bots: rows, botsRaw: workers.map((w) => ({ ...w.stats, final: undefined })), snapshots, rejoins: rejoinEvents, relay, final: fin ?? null, peak, events,
    };
    doc.runs = doc.runs.filter((r) => r.label !== label).concat(run);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
    console.log(`\nRelatório: ${path.relative(ROOT, out)} (execução "${label}")`);
  }
  process.exit(result === 'ok' ? 0 : 1);
}

if (process.env.LOADTEST_NO_MAIN) { /* importado (diagnóstico do cérebro dos bots) */ }
else if (process.argv.includes('--worker')) runWorker().catch((e) => { console.error('bot:', e); process.exit(3); });
else runOrchestrator().catch((e) => { console.error(e); process.exit(3); });
