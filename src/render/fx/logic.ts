// Funções puras dos efeitos (docs/ART.md §1.9 e Apêndice F — Etapa 5): sem Pixi nem DOM, testáveis em Node. O arco e a
// sombra dos projéteis seguem o contrato de câmera (§1.4: chão 1:1, verticais × cot 50° ≈ 0,84) e de luz (§1.5: sol de
// noroeste-alto; a sombra de um ponto a altura h cai h·(0,55; 0,35)/1,0 tile para sudeste — SUN_DIR do bake).
import { BUILDINGS, UNITS } from '../../core/data';
import { TERRAIN } from '../../core/constants';
import type { VisualEffect } from '../../core/types';

/** Altura visual das verticais (cot 50°): uma altura h (tiles) sobe h·VERTICAL tiles na tela. */
export const VERTICAL = 0.8391;
/** Deslocamento da sombra no chão (tiles) por tile de altura: −SUN_DIR.xz/SUN_DIR.y do bake (sol (−0,55; 1; −0,35)). */
export const SHADOW_PER_HEIGHT = { x: 0.55, y: 0.35 } as const;

/** Tipos de projétil com quadros no atlas `fx` (8 direções cada). */
export const PROJECTILE_KINDS = ['arrow', 'javelin', 'stone', 'spike', 'fireball', 'bolt'] as const;
export type ProjectileKind = typeof PROJECTILE_KINDS[number];

/**
 * Projétil de quem atirou: `e.src` (tipo do atirador, campo visual do núcleo) decide dardo × flecha × pedra × espinho;
 * sem ele, `e.data` do núcleo ('arrow' | 'rock' | 'bolt').
 */
export function projectileKind(src: string | undefined, data: unknown): ProjectileKind {
  if (src) {
    if (BUILDINGS[src]) return 'arrow';
    const u = UNITS[src];
    if (u) {
      if (u.tags.includes('skirmisher')) return 'javelin';
      if (u.cls === 'siege') return 'stone';
      if (src === 'manticore') return 'spike';
      if (src === 'chimera') return 'fireball';
      if (src === 'medusa' || src === 'sentinel') return 'bolt';
      if (u.tags.includes('archer') || src === 'centaur') return 'arrow';
    }
  }
  return data === 'rock' ? 'stone' : data === 'bolt' ? 'bolt' : 'arrow';
}
/** Emissivos (desenhados aditivos, sem sombra no chão: emitem luz). */
export const isEmissive = (k: ProjectileKind): boolean => k === 'fireball' || k === 'bolt';

/** Altura máxima do arco (tiles) de um projétil que voa `dist` tiles: flecha e dardo sobem pouco, a pedra mais. */
export function arcHeight(kind: ProjectileKind, dist: number): number {
  const k = kind === 'stone' ? 0.34 : kind === 'javelin' ? 0.22 : kind === 'bolt' ? 0.05 : kind === 'fireball' ? 0.12 : 0.2;
  return Math.min(kind === 'stone' ? 3.2 : 1.8, dist * k);
}

export interface ArcPoint {
  /** Ponto no chão (tiles). */
  gx: number; gy: number;
  /** Altura (tiles). */
  h: number;
  /** Posição do projétil na tela em tiles de mundo (chão menos a altura × VERTICAL). */
  sx: number; sy: number;
  /** Ângulo da velocidade NA TELA (rad; 0 = leste, y para baixo). */
  angle: number;
  /** Onde a sombra cai no chão (tiles). */
  shx: number; shy: number;
}
/** Ponto do arco parabólico na fração `p` (0–1) do voo de (x0, y0) a (x1, y1) com altura máxima `H`. */
export function arcPoint(x0: number, y0: number, x1: number, y1: number, H: number, p: number): ArcPoint {
  const t = p < 0 ? 0 : p > 1 ? 1 : p;
  const dx = x1 - x0, dy = y1 - y0;
  const gx = x0 + dx * t, gy = y0 + dy * t;
  const h = 4 * H * t * (1 - t), dh = 4 * H * (1 - 2 * t);
  // velocidade na tela: chão 1:1 menos a derivada da altura × VERTICAL (subindo = para cima na tela)
  const vx = dx, vy = dy - dh * VERTICAL;
  return { gx, gy, h, sx: gx, sy: gy - h * VERTICAL, angle: Math.atan2(vy, vx), shx: gx + h * SHADOW_PER_HEIGHT.x, shy: gy + h * SHADOW_PER_HEIGHT.y };
}
/** Direção assada mais próxima (0 = E, sentido horário na tela) e o resto (rad) para girar o sprite até o ângulo exato. */
export function dirAndResidual(angle: number): { dir: number; residual: number } {
  const step = Math.PI / 4;
  const k = Math.round(angle / step);
  return { dir: ((k % 8) + 8) % 8, residual: angle - k * step };
}

/** Material de quem levou um golpe corpo a corpo: faíscas no metal, lascas de madeira/pedra, poeira no resto. */
export type HitMaterial = 'metal' | 'wood' | 'stone' | 'flesh';
const WOOD_BUILDINGS = new Set(['house', 'farm', 'granary', 'lumber_camp', 'market', 'stable', 'siege_workshop', 'barracks', 'cornucopia']);
export function hitMaterial(target: unknown): HitMaterial {
  if (typeof target !== 'string') return 'flesh';
  if (BUILDINGS[target]) return WOOD_BUILDINGS.has(target) ? 'wood' : 'stone';
  const u = UNITS[target];
  if (!u) return 'flesh';
  if (u.cls === 'siege') return 'wood';
  if (target === 'colossus' || target === 'sentinel') return 'stone';
  if (u.cls === 'villager' || u.cls === 'myth' || u.cls === 'titan' || target === 'militia') return 'flesh';
  return 'metal';   // bronze: hoplitas, arqueiros, cavalaria, heróis
}

/** Como os pés tocam o chão: passos, cascos, rodas ou nada (voadoras, sombras, imóveis). */
export type Gait = 'foot' | 'hoof' | 'wheel' | 'none';
export function gaitOf(type: string): Gait {
  const u = UNITS[type];
  if (!u || u.flying || u.immobile || type === 'shade') return 'none';
  if (u.cls === 'siege') return 'wheel';
  if (u.cls === 'cavalry' || u.cls === 'scout' || type === 'centaur') return 'hoof';
  return 'foot';
}
/**
 * Baforadas de poeira por segundo de uma unidade que anda a `speed` tiles/s (docs/ART.md §1.9, "poeira de marcha"):
 * cresce com a velocidade (o galope levanta muito mais que o passo) e é dividida pelo número de unidades andando na tela
 * acima de `crowd` (um exército inteiro não estoura o orçamento). 0 em água ou parada.
 */
export const FOOT_CROWD = 28;
/** Abaixo deste zoom a poeira dos pés não sai: a baforada teria 3–5 px na tela (o mapa inteiro custava ~0,1 ms à toa). */
export const DUST_MIN_ZOOM = 0.5;
export function footDustRate(gait: Gait, speed: number, movingOnScreen: number, terrain: number): number {
  if (gait === 'none' || speed < 0.4 || terrain === TERRAIN.WATER || terrain === TERRAIN.DEEP) return 0;
  // cavalo a galope (3,6 tiles/s na grama): ≈ 6,7 baforadas/s — uma nuvem contínua; hoplita a passo (2,4): ≈ 1,3/s
  const base = gait === 'hoof' ? 2.2 * speed * speed / 3 : gait === 'wheel' ? 2 * speed : 0.8 * speed;
  const soil = terrain === TERRAIN.SAND ? 1.5 : terrain === TERRAIN.DIRT ? 1.25 : terrain === TERRAIN.MOUNTAIN ? 0.8 : 0.7;
  return base * soil * Math.min(1, FOOT_CROWD / Math.max(1, movingOnScreen));
}
/** Cor da poeira levantada em cada terreno (tint da textura `dust`; a da grama é seca e fraca). */
export function dustColor(terrain: number): number {
  switch (terrain) {
    case TERRAIN.SAND: return 0xeadcb4;
    case TERRAIN.DIRT: return 0xc9ad84;
    case TERRAIN.MOUNTAIN: return 0xbdb8ac;
    default: return 0xcdbf94;   // grama: a terra seca que o pé levanta, bem mais clara que o verde (lê a zoom 1)
  }
}

/** Tempo (s de jogo) desde o começo de um efeito, pelo ttl que o núcleo já descontou (efeito de ttl 8 criado há 3 ticks = 0,15 s). */
export function effectAge(e: Pick<VisualEffect, 'ttl' | 'total'>, tickRate: number): number { return (e.total - e.ttl) / tickRate; }

/** Cor interpolada (0xRRGGBB) entre `a` e `b`. */
export function lerpColor(a: number, b: number, t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * k);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** Orçamento por prioridade (fração do orçamento TOTAL do preset): ambiente ≤ 45 %, combate ≤ 85 %, poderes 100 %. */
export const PRIO_CAP = [0.45, 0.85, 1] as const;
/** Teto de partículas por família (fração do total): a fumaça dos edifícios ocupava 35 % na Etapa 3 (smokeBudget). */
export const GROUP_CAP: Record<string, number> = { smoke: 0.35, dust: 0.2, fire: 0.12 };
/** Teto de decalques por preset (índice = Quality.particles). */
export const DECAL_CAP = [48, 128, 256] as const;
