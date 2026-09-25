// Funções puras da arte assada (docs/ART.md §1.4, §1.8, §3.7): direção, animação, quadro por tempo, nomes de quadro,
// estágio de obra, estágio/variante de props e validação do meta.aoe dos atlas. Sem Pixi e sem DOM: testáveis em Node
// (tests/art-library.test.ts). Fica fora do núcleo determinístico: pode usar Math.atan2/Math.round à vontade.
import type { NodeType } from '../../core/constants';
import { hash01, noise2 } from '../palette';
import { ART_CONTRACT_VERSION, ART_PITCH_DEG, ART_PX_PER_TILE, type ArtScale, type SheetAoeMeta } from './types';

const OCTANT = Math.PI / 4;

// ---------------- Direção ----------------
/** Direção 0–7 de um ângulo de tela (radianos, y para baixo): 0 = E e sentido horário (E, SE, S, SO, O, NO, N, NE). */
export function dirFromAngle(angle: number): number {
  return ((Math.round(angle / OCTANT) % 8) + 8) % 8;
}
/** Direção 0–7 de um vetor na TELA (dx para a direita, dy para baixo); vetor nulo → -1. */
export function dirFromVector(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return -1;
  return dirFromAngle(Math.atan2(dy, dx));
}
/** Diferença angular absoluta entre dois ângulos (0–π). */
function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d < 0) d += 2 * Math.PI;
  return d > Math.PI ? 2 * Math.PI - d : d;
}
/**
 * Direção com histerese: mantém `prev` enquanto o ângulo não passar `margin` radianos além da borda do octante de
 * `prev` (evita o sprite piscar entre duas direções num caminho em diagonal quase na fronteira de 22,5°).
 */
export function dirWithHysteresis(angle: number, prev: number, margin = 0.12): number {
  if (prev >= 0 && prev < 8 && angleDiff(angle, prev * OCTANT) <= OCTANT / 2 + margin) return prev;
  return dirFromAngle(angle);
}

// ---------------- Animação ----------------
export type UnitAnim = 'idle' | 'walk' | 'attack' | 'die' | 'carry' | 'gather';

export interface AnimInput {
  /** A unidade se deslocou desde o tick anterior. */
  moving: boolean;
  /** Um golpe começou há menos que a duração da animação de ataque. */
  attacking: boolean;
  /** Carrega recurso (≥ 1). */
  carrying: boolean;
  /** Parada trabalhando: coletando, construindo ou reparando. */
  working: boolean;
}
/** Animação a tocar: ataque em curso > andar (ou carregar) > coletar > parado; cai para a mais próxima que existir. */
export function chooseAnim(i: AnimInput, has: (a: UnitAnim) => boolean): UnitAnim {
  if (i.attacking && has('attack')) return 'attack';
  if (i.moving) return i.carrying && has('carry') ? 'carry' : 'walk';
  if (i.working && has('gather')) return 'gather';
  return 'idle';
}
/**
 * A unidade anda de fato neste tick? O deslocamento `disp2` (tiles², desde o tick anterior) tem de passar de 30 % do
 * passo `step` (velocidade · DT) para começar a andar e de 15 % para continuar: o empurrão da separação entre vizinhos
 * (≈ 0,005–0,03 tile/tick, contra ≈ 0,11 do passo) não vira ciclo de passos nem direção. Quem está no posto (alvo ao
 * alcance) nem chega aqui: o renderizador já trata como parado.
 */
export function isWalking(disp2: number, step: number, wasWalking: boolean): boolean {
  const m = (wasWalking ? 0.15 : 0.3) * step;
  return disp2 > m * m;
}
/**
 * Golpe novo a animar: o attackTick mudou desde o último visto pela vista E é recente (≤ `windowTicks`, a duração do
 * ataque). Uma vista que volta à tela ou sai da névoa não toca um golpe antigo.
 */
export function freshHit(attackTick: number, lastSeen: number, tick: number, windowTicks: number): boolean {
  return attackTick !== lastSeen && tick - attackTick <= windowTicks;
}
/**
 * Alfa da unidade assada morrendo pelo progresso `p` (0–1) do efeito 'death': opaca até o último quadro da queda
 * (`dieTicks` de jogo, de `totalTicks`) e então apaga até o fim do efeito — nunca antes da metade.
 */
export function deathAlpha(p: number, dieTicks: number, totalTicks: number): number {
  const from = Math.min(0.85, Math.max(0.5, dieTicks / Math.max(1, totalTicks)));
  return p < from ? 1 : Math.max(0, 1 - (p - from) / (1 - from));
}

/**
 * Índice do quadro de uma animação a `fps` quadros/s depois de `elapsed` segundos: em loop volta ao 0 (o último quadro
 * não repete o primeiro); sem loop para no último (ataque/morte).
 */
export function frameIndex(elapsed: number, frames: number, fps: number, loop: boolean): number {
  if (frames <= 1) return 0;
  const i = Math.floor(Math.max(0, elapsed) * fps + 1e-6);
  return loop ? i % frames : Math.min(frames - 1, i);
}
/** Duração (s) de uma animação. */
export function animDuration(frames: number, fps: number): number { return frames / Math.max(1, fps); }

// ---------------- Nomes de quadro ----------------
const pad2 = (n: number) => (n < 10 ? '0' + n : String(n));
/** `<id>/<anim>/<dir>/<nn>` (unidades). */
export function unitFrameName(id: string, anim: string, dir: number, i: number): string { return `${id}/${anim}/${dir}/${pad2(i)}`; }
/** `<id>/<anim>/<dir>` (chave de animações do atlas). */
export function unitAnimName(id: string, anim: string, dir: number): string { return `${id}/${anim}/${dir}`; }
/** `<id>/<estado>` (edifícios). */
export function buildingFrameName(id: string, stage: string): string { return `${id}/${stage}`; }
/** `<kind>/<variante>[/<tag>]` (props). */
export function propFrameName(kind: string, variant: string | number, tag?: string): string { return tag ? `${kind}/${variant}/${tag}` : `${kind}/${variant}`; }

// ---------------- Edifícios ----------------
export type BuildStage = 'build0' | 'build1' | 'build2' | 'complete';
/** Estágio de obra: progresso < 33 % → build0, < 66 % → build1, < 100 % → build2; completo → complete. */
export function buildingStage(frac: number, complete: boolean): BuildStage {
  if (complete) return 'complete';
  if (!(frac >= 1 / 3)) return 'build0';
  if (frac < 2 / 3) return 'build1';
  return 'build2';
}

// ---------------- Props ----------------
export type TreeSpecies = 'olive' | 'cypress' | 'oak';
export interface TreeLook { species: TreeSpecies; variant: number; size: 'big' | 'small' }
/**
 * Espécie, variante (0–3) e porte de uma árvore no tile (x, y): espécies em manchas de ≈ 12 tiles (ruído de baixa
 * frequência, bosques coerentes) com 12 % de árvores "intrusas" por hash; variante e porte por hash do tile.
 * Determinístico (sem Math.random): o mesmo mapa desenha as mesmas árvores em qualquer máquina.
 */
export function treeLook(x: number, y: number): TreeLook {
  const n = noise2(x * 0.085 + 311, y * 0.085 + 97);
  let s: TreeSpecies = n < 0.44 ? 'olive' : n < 0.6 ? 'oak' : 'cypress';
  const j = hash01(x, y, 71);
  if (j < 0.12) s = (['olive', 'oak', 'cypress'] as const)[Math.floor(j / 0.04)];
  return { species: s, variant: Math.floor(hash01(x, y, 72) * 4) & 3, size: hash01(x, y, 73) < 0.3 ? 'small' : 'big' };
}
/** Toco que fica no lugar de uma árvore esgotada (0–2). */
export function stumpVariant(x: number, y: number): number { return Math.floor(hash01(x, y, 74) * 3) % 3; }
/** Direção assada de um animal (0, 2, 4 ou 6), fixa por id. */
export function animalDir(id: number): number { return (Math.floor(hash01(id, 0, 75) * 4) & 3) * 2; }
/** Estágio de um nó por amount/max: 0 = cheio, 1 = meio, 2 = quase vazio. */
export function amountStage(amount: number, max: number): 0 | 1 | 2 {
  const f = max > 0 ? amount / max : 0;
  return f > 2 / 3 ? 0 : f > 1 / 3 ? 1 : 2;
}
const BERRY_STAGES = ['full', 'half', 'empty'] as const;
/**
 * Nome do quadro assado de um nó do mapa (null = sem arte; continua procedural). Árvore cheia: espécie/variante/porte do
 * tile; sendo cortada (amount < max): `<espécie>/0/thin`. Frutas full/half/empty e ouro 0–2 pelo que resta; animais
 * por direção; Pedra de Poseidon `lure/0`.
 */
export function nodeFrameName(type: NodeType | string, id: number, x: number, y: number, amount: number, max: number): string | null {
  switch (type) {
    case 'tree': {
      const t = treeLook(x, y);
      return amount < max - 0.5 ? propFrameName(t.species, 0, 'thin') : propFrameName(t.species, t.variant, t.size);
    }
    case 'berry': return propFrameName('berry', BERRY_STAGES[amountStage(amount, max)]);
    case 'gold': return propFrameName('gold', amountStage(amount, max));
    case 'deer': case 'boar': return propFrameName(type, animalDir(id));
    case 'lure': return propFrameName('lure', 0);
    default: return null;
  }
}
/** Estágio visual de um nó (muda o quadro): árvore 0 = inteira, 1 = em corte; frutas/ouro 0–2; demais 0. Barato: a
 *  conferência periódica dos props compara só isto e recalcula o nome do quadro quando muda. */
export function nodeStage(type: NodeType | string, amount: number, max: number): number {
  if (type === 'tree') return amount < max - 0.5 ? 1 : 0;
  if (type === 'berry' || type === 'gold') return amountStage(amount, max);
  return 0;
}
/** Deslocamento (tiles) da base de uma árvore dentro do tile, ±0,18 em x e ±0,14 em y por hash: bosques sem a grade
 *  dos centros dos tiles. O tile bloqueado continua o mesmo (só o desenho muda). */
export function treeOffset(x: number, y: number): { dx: number; dy: number } {
  return { dx: (hash01(x, y, 77) - 0.5) * 0.36, dy: (hash01(x, y, 78) - 0.5) * 0.28 };
}
/** Pequena variação de escala (0,94–1,06) por tile para as árvores não parecerem carimbadas. */
export function treeScale(x: number, y: number): number { return 0.94 + hash01(x, y, 76) * 0.12; }

// ---------------- Atlas ----------------
/** Confere o meta.aoe de um atlas contra o contrato esperado para a escala; devolve o motivo da recusa ou null. */
export function checkSheetMeta(aoe: SheetAoeMeta | undefined, scale: ArtScale, pass?: string): string | null {
  if (!aoe) return 'meta.aoe ausente';
  if (aoe.version !== ART_CONTRACT_VERSION) return `versão ${aoe.version} ≠ ${ART_CONTRACT_VERSION}`;
  if (aoe.pxPerTile !== ART_PX_PER_TILE * scale) return `pxPerTile ${aoe.pxPerTile} ≠ ${ART_PX_PER_TILE * scale}`;
  if (aoe.pitchDeg !== ART_PITCH_DEG) return `pitchDeg ${aoe.pitchDeg} ≠ ${ART_PITCH_DEG}`;
  if (pass && aoe.pass !== pass) return `passe ${aoe.pass} ≠ ${pass}`;
  return null;
}
/** Escala do atlas a usar: a pedida pelo preset se existir no manifesto, senão 1×. */
export function pickScale(wanted: ArtScale, available: readonly number[]): ArtScale {
  return wanted === 2 && available.includes(2) ? 2 : 1;
}
/**
 * Espelhamento (`--mirror`): E/SE/NE apontam para os quadros de O/SO/NO e o jogo desenha com scale.x = −1. No Pixi a
 * escala negativa gira em torno da âncora, então o pé continua no mesmo ponto sem mexer na âncora; o `1 − anchor.x` da
 * especificação do bake vale para quem espelha a própria textura (groupD8), não para scale.x = −1.
 */
export function isMirrored(mirrored: Record<string, number> | null | undefined, dir: number): boolean {
  return !!mirrored && mirrored[String(dir)] !== undefined;
}
/** Geometria de um quadro recortado (o que o Pixi guarda em Texture.orig/trim). */
export interface FrameGeom { orig: { width: number; height: number }; trim?: { x: number; y: number; width: number; height: number } | null }
export interface Box { x0: number; y0: number; x1: number; y1: number }
/**
 * Caixa (px, relativa ao pé = âncora) da parte não transparente de um quadro recortado — a que as vistas usam no pick e
 * a barra de vida acima do telhado. Espelhado (scale.x = −1 em torno da âncora): x vira −x, então a caixa troca de lado
 * em volta do pé ([x0, x1] → [−x1, −x0]); y não muda. Escreve em `out` (sem alocar por quadro).
 */
export function frameBox(f: FrameGeom, anchor: { x: number; y: number }, mirrored: boolean, out: Box): Box {
  const ax = anchor.x * f.orig.width, ay = anchor.y * f.orig.height;
  const tx = f.trim ? f.trim.x : 0, ty = f.trim ? f.trim.y : 0;
  const tw = f.trim ? f.trim.width : f.orig.width, th = f.trim ? f.trim.height : f.orig.height;
  const x0 = tx - ax, x1 = tx + tw - ax;
  out.x0 = mirrored ? -x1 : x0; out.x1 = mirrored ? -x0 : x1;
  out.y0 = ty - ay; out.y1 = ty + th - ay;
  return out;
}

// ---------------- Cor ----------------
/** Produto de duas cores 0xRRGGBB por canal (tint composto: cor do time × flash de dano, por exemplo). */
export function mulColor(a: number, b: number): number {
  const r = (((a >> 16) & 255) * ((b >> 16) & 255) / 255) | 0;
  const g = (((a >> 8) & 255) * ((b >> 8) & 255) / 255) | 0;
  const bl = ((a & 255) * (b & 255) / 255) | 0;
  return (r << 16) | (g << 8) | bl;
}
