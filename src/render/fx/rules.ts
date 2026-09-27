// Regras puras do lote combate-ambiente da Etapa 5 (docs/ART.md Apêndice F): sem Pixi nem DOM, testáveis em Node. Tudo
// aqui só LÊ o estado — de onde veio um golpe em área, qual herói usou a Q, quem está coletando/construindo no posto,
// quem pisa na margem da água, quanto do chão à vista é árido e onde sai a fumaça de trabalho de cada edifício.
import { ABILITIES, UNITS } from '../../core/data';
import { TERRAIN, TICK_RATE } from '../../core/constants';
import type { Building, GameMap, GameState, Unit, VisualEffect } from '../../core/types';
import { abilityUseTick } from '../art/logic';

/** Tick em que o núcleo criou o efeito: o `cleanup` do fim daquele tick já descontou 1 do ttl e avançou `state.tick`. */
export function effectTick(state: Pick<GameState, 'tick'>, e: Pick<VisualEffect, 'ttl' | 'total'>): number {
  return state.tick - (e.total - e.ttl);
}

// ---------------- Golpe em área ('splash') ----------------
/** Quem deu o golpe em área: a unidade com dano em área (Quimera, titãs) ou o Héracles carregado cujo golpe caiu no
 *  tick do efeito, ao alcance do ponto. O núcleo não põe o atacante no efeito; o `attackTick` do mesmo tick basta. */
export interface SplashSource { id: number; type: string; x: number; y: number }
export function splashSource(state: GameState, e: VisualEffect): SplashSource | null {
  const t0 = effectTick(state, e);
  let best: SplashSource | null = null, bestD = Infinity;
  for (const u of state.units.values()) {
    if (u.attackTick !== t0) continue;
    const d = UNITS[u.type];
    if (!d || (!(d.splash && d.splash > 0) && d.ability !== 'titanic_blow')) continue;
    const dist = Math.sqrt((u.x - e.x) ** 2 + (u.y - e.y) ** 2);
    if (dist > d.range + d.radius + 1.6 || dist >= bestD) continue;
    bestD = dist; best = { id: u.id, type: u.type, x: u.x, y: u.y };
  }
  return best;
}
/** Aparência do golpe em área pelo atacante: fogo (Quimera, Prometeu — o titã do fogo), água (Oceano), pancada pesada
 *  (Cronos), o Golpe Titânico de Héracles, ou só poeira (fonte desconhecida). */
export type SplashStyle = 'fire' | 'water' | 'slam' | 'titanic' | 'dust';
export function splashStyle(src: string | null | undefined): SplashStyle {
  switch (src) {
    case 'chimera': case 'prometheus': return 'fire';
    case 'oceanus': return 'water';
    case 'cronus': return 'slam';
    case 'heracles': return 'titanic';
    default: return 'dust';
  }
}

// ---------------- Habilidade Q ('ability') ----------------
/** O herói do dono que usou a Q no tick do efeito (a recarga do núcleo diz quando: `abilityReadyAt − recarga`), o mais
 *  perto do ponto; null se não achar (morreu no mesmo tick, efeito de cenário sem herói). */
export function abilityHero(state: GameState, e: VisualEffect): Unit | null {
  const t0 = effectTick(state, e);
  let best: Unit | null = null, bestD = Infinity;
  for (const u of state.units.values()) {
    if (e.owner !== undefined && u.owner !== e.owner) continue;
    const id = UNITS[u.type]?.ability;
    if (!id || !ABILITIES[id]) continue;
    if (Math.abs(abilityUseTick(u.abilityReadyAt, ABILITIES[id].cooldown * TICK_RATE) - t0) > 1) continue;
    const d = Math.sqrt((u.x - e.x) ** 2 + (u.y - e.y) ** 2);
    if (d > 3 || d >= bestD) continue;
    bestD = d; best = u;
  }
  return best;
}

// ---------------- Auras (buffs das habilidades em curso) ----------------
export const AURA = { attack: 1, speed: 2, haste: 4, ward: 8, charged: 16 } as const;
/** Buffs ativos de uma unidade (bits de AURA): Grito dos Argonautas (ataque), Astúcia (velocidade), Fúria (pressa),
 *  Escudo Espelhado (proteção) e o Golpe Titânico carregado. */
export function auraOf(u: Unit, tick: number): number {
  let m = 0;
  if (u.buffUntil > tick) {
    if (u.buffAttack > 1) m |= AURA.attack;
    if (u.buffSpeed > 1) m |= AURA.speed;
    if (u.buffHaste > 1) m |= AURA.haste;
    if (u.buffWard) m |= AURA.ward;
  }
  if (u.chargeUntil > tick) m |= AURA.charged;
  return m;
}
/** Herói com halo (os cinco da classe `hero`; o rei tem coroa, não halo). */
const HALO = new Set(Object.values(UNITS).filter((d) => d.cls === 'hero' && !d.tags.includes('king')).map((d) => d.id));
export const hasHalo = (type: string): boolean => HALO.has(type);

// ---------------- Cura contínua ----------------
/** Vida ganha desde o último quadro (0 se não subiu ou se ainda não havia leitura). */
export function healGain(prev: number | undefined, hp: number): number {
  return prev === undefined || !(hp > prev) ? 0 : hp - prev;
}

// ---------------- Trabalho no posto (coleta e obra) ----------------
export type WorkKind = 'tree' | 'gold' | 'berry' | 'hunt' | 'farm' | 'build';
export interface Work { kind: WorkKind; /** ponto do alvo (tiles): tronco, veio, obra */ x: number; y: number }
/** Folga (tiles) sobre as distâncias de trabalho do núcleo (a mesma POST_SLACK do renderizador). */
const SLACK = 0.15;
function rectDist(x: number, y: number, rx: number, ry: number, w: number, h: number): number {
  const dx = Math.max(rx - x, 0, x - (rx + w)), dy = Math.max(ry - y, 0, y - (ry + h));
  return Math.sqrt(dx * dx + dy * dy);
}
/** O que a unidade está trabalhando NO POSTO (ao alcance do nó, da fazenda ou da obra), ou null. */
export function workOf(state: GameState, u: Unit): Work | null {
  if (u.state === 'gather') {
    if (u.nodeId > 0) {
      const n = state.map.nodes.get(u.nodeId);
      if (!n || rectDist(u.x, u.y, n.x, n.y, 1, 1) > 1 + SLACK) return null;
      const kind: WorkKind = n.type === 'tree' || n.type === 'gold' || n.type === 'berry' ? n.type : 'hunt';
      return { kind, x: n.x + 0.5, y: n.y + 0.5 };
    }
    const f = u.nodeId < 0 ? state.buildings.get(-u.nodeId) : undefined;
    if (!f || rectDist(u.x, u.y, f.tx, f.ty, f.w, f.h) > 0.9 + SLACK) return null;
    return { kind: 'farm', x: u.x, y: u.y };
  }
  if (u.state === 'build') {
    const b = state.buildings.get(u.targetId);
    if (!b || b.complete || rectDist(u.x, u.y, b.tx, b.ty, b.w, b.h) > 0.95 + SLACK) return null;
    // o ponto da obra mais perto do cidadão (a borda da pegada)
    return { kind: 'build', x: Math.max(b.tx, Math.min(b.tx + b.w, u.x)), y: Math.max(b.ty, Math.min(b.ty + b.h, u.y)) };
  }
  return null;
}
/** Quadro do golpe na animação de coleta assada (`gather_axe`: machado no alto em 0, golpe em 0,5 do ciclo de 4). */
export const WORK_STRIKE_FRAME = 2;
/** Sem a animação assada (procedural), um golpe a cada tantos segundos. */
export const WORK_STRIKE_PERIOD = 0.8;
/** Fração dos golpes que solta lascas (o machado nem sempre arranca uma lasca visível) e quantos trabalhadores na tela
 *  antes de rarear mais (como a poeira dos pés: um bosque cheio de cortadores não estoura o orçamento). */
export const WORK_CHIP_CHANCE = 0.6;
export const WORK_CROWD = 16;

// ---------------- Margem da água ----------------
/** Até esta distância (tiles) do pé à borda de um tile de água o corpo da unidade encosta na água (o raio de um humano é
 *  0,28–0,36; a água não é passável, então só quem anda RENTE à linha d'água respinga — quem passa pela areia da praia,
 *  a meio tile, não). */
export const SHORE_WET = 0.34;
const isWater = (map: GameMap, x: number, y: number): boolean => {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const t = map.terrain[y * map.w + x];
  return t === TERRAIN.WATER || t === TERRAIN.DEEP;
};
/** Há água no tile (x, y) ou num dos 8 vizinhos (só aí `shoreDistance` pode dar < Infinity). */
export function nearWater(map: GameMap, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isWater(map, x + dx, y + dy)) return true;
  return false;
}
/** Cache por unidade da vizinhança d'água do tile do pé (`ct` = índice do tile, `coast` = `nearWater` dele): recalcula só
 *  quando o pé muda de tile — a poeira dos pés e a margem deixam de olhar 9 tiles por unidade andando a cada quadro. */
export interface CoastCache { ct?: number; coast?: boolean }
export function coastal(c: CoastCache, map: GameMap, x: number, y: number): boolean {
  const tx = Math.floor(x), ty = Math.floor(y), ti = ty * map.w + tx;
  if (c.ct !== ti) { c.ct = ti; c.coast = nearWater(map, tx, ty); }
  return c.coast!;
}
/**
 * Distância (tiles) do ponto até a borda do tile de água mais perto entre os 8 vizinhos (Infinity sem água em volta; 0
 * sobre a água) e, em `dir`, o vetor unitário do ponto para a água.
 */
export function shoreDistance(map: GameMap, x: number, y: number, dir?: { x: number; y: number }): number {
  const tx = Math.floor(x), ty = Math.floor(y), fx = x - tx, fy = y - ty;
  if (isWater(map, tx, ty)) { if (dir) { dir.x = 0; dir.y = 0; } return 0; }
  let best = Infinity, bx = 0, by = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((dx || dy) && isWater(map, tx + dx, ty + dy)) {
      const ex = dx < 0 ? fx : dx > 0 ? 1 - fx : 0, ey = dy < 0 ? fy : dy > 0 ? 1 - fy : 0;
      const d = Math.sqrt(ex * ex + ey * ey);
      if (d < best) { best = d; bx = dx; by = dy; }
    }
  }
  if (dir) { const l = Math.sqrt(bx * bx + by * by) || 1; dir.x = bx / l; dir.y = by / l; }
  return best;
}

// ---------------- Poeira no vento (bioma árido) ----------------
/** Fração árida (areia + terra) dos tiles de chão à vista na área [x0,x1]×[y0,y1] (amostra ≤ 16 × 16, só tiles vistos
 *  agora: vis = 2, ou tudo com `reveal`). Água não conta; 0 sem chão à vista. */
export function aridFraction(map: GameMap, vis: Uint8Array | null, reveal: boolean, x0: number, y0: number, x1: number, y1: number): number {
  const ax = Math.max(0, Math.floor(x0)), ay = Math.max(0, Math.floor(y0)), bx = Math.min(map.w - 1, Math.ceil(x1)), by = Math.min(map.h - 1, Math.ceil(y1));
  if (bx < ax || by < ay) return 0;
  const step = Math.max(1, Math.floor(Math.max(bx - ax, by - ay) / 16));
  let land = 0, arid = 0;
  for (let y = ay; y <= by; y += step) for (let x = ax; x <= bx; x += step) {
    const i = y * map.w + x;
    if (!reveal && (!vis || vis[i] !== 2)) continue;
    const t = map.terrain[i];
    if (t === TERRAIN.WATER || t === TERRAIN.DEEP) continue;
    land++;
    if (t === TERRAIN.SAND || t === TERRAIN.DIRT) arid++;
  }
  return land === 0 ? 0 : arid / land;
}
/** Abaixo desta fração árida não venta poeira (praias e trilhas de terra num mapa verde não viram deserto). */
export const ARID_MIN = 0.3;
/** Rajadas de poeira por segundo na tela: 0 abaixo de ARID_MIN, até ≈ 10/s num deserto inteiro com ~1 200 tiles na tela
 *  (zoom 1), proporcional à área de chão árido; nada abaixo do zoom 0,5 (a rajada viraria um borrão de 2 px). */
export function windDustRate(arid: number, tilesOnScreen: number, zoom: number): number {
  if (zoom < 0.5 || arid < ARID_MIN) return 0;
  const k = (arid - ARID_MIN) / (1 - ARID_MIN);
  return 10 * k * Math.min(2, Math.max(0.3, tilesOnScreen / 1200));
}

// ---------------- Fumaça de trabalho dos edifícios ----------------
/** Onde sai a fumaça de um edifício de produção trabalhando: `dx` (tiles, a partir do centro) e `h` (fração do topo
 *  visível do quadro assado acima do centro; sem arte assada, `hp` px). Lareira de Héstia no pátio do Centro Cívico,
 *  forja do quartel, da oficina e da fortaleza, ferraria do estábulo. */
export const WORK_SMOKE: Record<string, { dx: number; h: number; hp: number; kind: 'hearth' | 'forge' }> = {
  town_center: { dx: 0.05, h: 0.2, hp: 6, kind: 'hearth' },
  barracks: { dx: 0.75, h: 0.86, hp: 14, kind: 'forge' },
  stable: { dx: -0.7, h: 0.86, hp: 14, kind: 'forge' },
  siege_workshop: { dx: -0.75, h: 0.8, hp: 14, kind: 'forge' },
  fortress: { dx: 0.55, h: 0.8, hp: 18, kind: 'forge' },
};
/** O edifício está trabalhando (fila não vazia, pronto, sem desabilitar) e a fumaça pode aparecer para o jogador local:
 *  só nos edifícios do time dele (a fila de um inimigo é segredo; a fumaça não pode delatá-la), ou tudo revelado. */
export function workSmokeOn(state: GameState, b: Building, local: number, revealAll: boolean): boolean {
  if (!WORK_SMOKE[b.type] || !b.complete || b.queue.length === 0 || b.disabledUntil > state.tick) return false;
  if (revealAll) return true;
  const me = state.players[local], owner = state.players[b.owner];
  return !!me && !!owner && me.team === owner.team;
}
