// Presets de qualidade do renderizador (docs/ART.md §3.9). Sem dependência do Pixi nem do DOM: testável em Node.
// 'auto' começa como 'medium', mede os primeiros AUTO_SAMPLE_FRAMES quadros da partida e desce um nível se o p95 do
// custo de renderização passar de AUTO_P95_MS; nunca sobe sozinho (o jogador escolhe 'high' à mão).

export type QualityLevel = 'low' | 'medium' | 'high';
export type QualityPreset = 'auto' | QualityLevel;

export interface Quality {
  preset: QualityPreset;
  /** Escala do atlas de sprites (1× ou 2×, quando existir). */
  atlasScale: 1 | 2;
  /** Sombras assadas como sprites separados (camada `shadows`). */
  shadows: boolean;
  /** Orçamento de partículas: 0 = 200, 1 = 800, 2 = 2 000. */
  particles: 0 | 1 | 2;
  water: 'static' | 'animated';
  terrainShader: 'simple' | 'full';
  normalMaps: boolean;
  /** Pós-processamento (ColorMatrixFilter na stage). */
  post: boolean;
  /** Teto da resolução do canvas: resolução efetiva = min(resolutionCap, devicePixelRatio) · renderScale. */
  resolutionCap: number;
  antialias: false;
  showFps: boolean;
  teamOutline: boolean;
  /** Arte assada (atlas do bake, docs/ART.md §3.7) onde houver; false = exatamente o visual procedural. */
  bakedArt: boolean;
}

export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];
export const QUALITY_PRESETS: readonly QualityPreset[] = ['auto', 'low', 'medium', 'high'];
/** Quadros medidos pelo preset automático no início da partida. */
export const AUTO_SAMPLE_FRAMES = 120;
/** p95 (ms de renderer.render) acima do qual o automático desce um nível. */
export const AUTO_P95_MS = 12;
/** p95 do intervalo entre quadros (ms) acima do qual o automático desce um nível (abaixo de ~25 fps). O custo JS de
 *  renderer.render não inclui a rasterização (GPU ou software), então o intervalo real entre quadros também conta. */
export const AUTO_FRAME_P95_MS = 40;
/** O automático decide cedo se os quadros forem lentos: depois deste tempo de parede com pelo menos AUTO_MIN_FRAMES. */
export const AUTO_MAX_WALL_MS = 3000;
export const AUTO_MIN_FRAMES = 8;

/** Renderização por software (sem GPU/driver): o automático começa em 'low'. `renderer` = UNMASKED_RENDERER_WEBGL. */
export function isSoftwareRenderer(renderer: string | null | undefined): boolean {
  return !!renderer && /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(renderer);
}

/** Orçamento de partículas por nível (índice = Quality.particles). */
export const PARTICLE_BUDGET = [200, 800, 2000] as const;

type LevelSettings = Omit<Quality, 'preset' | 'showFps' | 'teamOutline' | 'antialias' | 'bakedArt'>;
const LEVELS: Record<QualityLevel, LevelSettings> = {
  // Baixo / Steam Deck: 1×, sombras ligadas, partículas médias, água estática, shader simples, sem normais, cap 1
  low: { atlasScale: 1, shadows: true, particles: 1, water: 'static', terrainShader: 'simple', normalMaps: false, post: false, resolutionCap: 1 },
  // Médio (padrão do 'auto'): 1×, água animada, shader completo, normais, cap 1
  medium: { atlasScale: 1, shadows: true, particles: 2, water: 'animated', terrainShader: 'full', normalMaps: true, post: false, resolutionCap: 1 },
  // Alto: atlas 2× quando disponível (o único preset com 2×), cap min(2, dpr), pós-processamento
  high: { atlasScale: 2, shadows: true, particles: 2, water: 'animated', terrainShader: 'full', normalMaps: true, post: true, resolutionCap: 2 },
};

/** Nível concreto de um preset ('auto' → 'medium'). */
export function levelOf(preset: QualityPreset): QualityLevel { return preset === 'auto' ? 'medium' : preset; }

/** Um nível abaixo ('low' fica 'low'). */
export function lowerLevel(level: QualityLevel): QualityLevel { const i = QUALITY_LEVELS.indexOf(level); return QUALITY_LEVELS[Math.max(0, i - 1)]; }

export interface QualityOptions { showFps?: boolean; teamOutline?: boolean; level?: QualityLevel; /** padrão true em todos os presets */ bakedArt?: boolean }

/** Quality completa a partir do preset salvo e dos toggles avançados; `level` sobrepõe o nível (auto já rebaixado). */
export function resolveQuality(preset: QualityPreset, opts: QualityOptions = {}): Quality {
  const level = opts.level ?? levelOf(preset);
  return { preset, ...LEVELS[level], antialias: false, showFps: !!opts.showFps, teamOutline: !!opts.teamOutline, bakedArt: opts.bakedArt !== false };
}

/** Resolução do canvas: min(teto, dpr) · renderScale (renderScale limitado a 0,25–1). */
export function effectiveResolution(q: Pick<Quality, 'resolutionCap'>, dpr: number, renderScale = 1): number {
  const s = Math.max(0.25, Math.min(1, renderScale));
  return Math.min(q.resolutionCap, Math.max(0.5, dpr || 1)) * s;
}

/** Percentil 95 de uma amostra (0 se vazia). */
export function p95(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
}

/**
 * Calibração do preset automático: recebe o custo (ms) de cada quadro; ao completar AUTO_SAMPLE_FRAMES amostras decide
 * uma única vez — devolve o novo nível se rebaixou, senão null. Depois de decidir não mede mais (nunca sobe).
 */
export class AutoQuality {
  level: QualityLevel;
  decided = false;
  private samples: number[] = [];
  private intervals: number[] = [];
  private wallMs = 0;
  constructor(level: QualityLevel = 'medium', readonly frames = AUTO_SAMPLE_FRAMES, readonly limitMs = AUTO_P95_MS, readonly frameLimitMs = AUTO_FRAME_P95_MS) { this.level = level; }
  /** Recomeça a medição (nova partida) mantendo o nível atual. */
  reset(): void { this.samples = []; this.intervals = []; this.wallMs = 0; this.decided = false; }
  /**
   * `ms` = custo JS de renderer.render; `intervalMs` = tempo desde o quadro anterior (opcional). Decide após `frames`
   * quadros ou, com quadros lentos, após AUTO_MAX_WALL_MS de parede com pelo menos AUTO_MIN_FRAMES amostras.
   */
  sample(ms: number, intervalMs?: number): QualityLevel | null {
    if (this.decided) return null;
    this.samples.push(ms);
    if (intervalMs !== undefined && intervalMs > 0 && intervalMs < 5000) { this.intervals.push(intervalMs); this.wallMs += intervalMs; }
    const early = this.wallMs >= AUTO_MAX_WALL_MS && this.samples.length >= AUTO_MIN_FRAMES;
    if (this.samples.length < this.frames && !early) return null;
    this.decided = true;
    const worst = p95(this.samples), worstFrame = p95(this.intervals);
    this.samples = []; this.intervals = []; this.wallMs = 0;
    if (worst <= this.limitMs && worstFrame <= this.frameLimitMs) return null;
    const next = lowerLevel(this.level);
    if (next === this.level) return null;
    this.level = next;
    return next;
  }
}
