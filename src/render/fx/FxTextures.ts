// Texturas dos efeitos (docs/ART.md Apêndice F — Etapa 5): os quadros do atlas `fx` (scripts/bake/fx.mjs, servido pela
// ArtLibrary como o grupo `fx`, 1× ou 2× pelo preset) ou, sem ele (arte assada desligada, atlas ainda carregando ou
// ausente), um atlas PROCEDURAL de reserva desenhado uma vez em canvas com os MESMOS nomes e tamanhos a 1× — as
// partículas e os decalques funcionam nos dois modos. Tudo de um atlas só por fonte: os ParticleContainer exigem que
// as partículas dividam a mesma textura-base. Quando a fonte muda (a arte chegou, foi desligada, trocou de escala) o
// FxSystem limpa partículas e decalques (`source` muda).
import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import type { ArtLibrary } from '../art/ArtLibrary';
import type { PassFrames } from '../art/AtlasSource';
import { PROJECTILE_KINDS, type ProjectileKind } from './logic';

/** Famílias do atlas `fx`: quantos quadros, tamanho a 1× (px) e âncora — o mesmo catálogo de scripts/bake/fx/catalog.mjs
 *  (tests/fx-atlas.test.ts confere). Uma família de 1 quadro tem o nome da própria família. */
export const FX_FAMILIES: Record<string, { n: number; w: number; h: number; ax?: number; ay?: number }> = {
  'proj/arrow': { n: 8, w: 26, h: 26 }, 'proj/javelin': { n: 8, w: 32, h: 32 }, 'proj/stone': { n: 8, w: 14, h: 14 },
  'proj/spike': { n: 8, w: 20, h: 20 }, 'proj/fireball': { n: 8, w: 26, h: 26 }, 'proj/bolt': { n: 8, w: 28, h: 28 },
  puff: { n: 1, w: 32, h: 32 }, smoke: { n: 4, w: 32, h: 32 }, dust: { n: 4, w: 24, h: 24 },
  spark: { n: 1, w: 12, h: 4, ax: 0.83 }, ember: { n: 1, w: 6, h: 6 }, glow: { n: 1, w: 32, h: 32 }, mote: { n: 1, w: 12, h: 12 },
  chip_wood: { n: 4, w: 7, h: 7 }, chip_stone: { n: 4, w: 7, h: 7 }, leaf: { n: 4, w: 8, h: 8 }, drop: { n: 1, w: 6, h: 8, ay: 0.6 },
  ring: { n: 1, w: 64, h: 64 }, fire: { n: 8, w: 24, h: 40, ay: 0.92 },
  'decal/burn': { n: 2, w: 64, h: 64 }, 'decal/crack': { n: 2, w: 64, h: 64 }, 'decal/impact': { n: 2, w: 32, h: 32 }, 'decal/debris': { n: 2, w: 64, h: 64 },
};
/** Nome do quadro `i` de uma família (projéteis e decalques: `/<i>`; fogo: `/<ii>`; família de 1 quadro: o nome dela). */
export function fxFrameName(family: string, i: number): string {
  const f = FX_FAMILIES[family];
  if (!f || f.n === 1) return family;
  return family === 'fire' ? `fire/${String(i).padStart(2, '0')}` : `${family}/${i}`;
}
/** Todos os nomes, na ordem das famílias. */
let NAMES: readonly string[] | null = null;
export function allFxNames(): readonly string[] {
  if (!NAMES) { const out: string[] = []; for (const [fam, f] of Object.entries(FX_FAMILIES)) for (let i = 0; i < f.n; i++) out.push(fxFrameName(fam, i)); NAMES = out; }
  return NAMES;
}

export type FxSource = 'baked' | 'fallback' | 'none';

export class FxTextures {
  private byName = new Map<string, Texture>();
  private byFamily = new Map<string, Texture[]>();
  private fallback: Map<string, Texture> | null = null;
  private servedKey = '';
  /** Último passe conferido (o ArtLibrary guarda o objeto): a lista inteira só é conferida quando ele muda. */
  private checkedPass: PassFrames | null = null;
  private checkedComplete = false;
  /** Fonte dos quadros servidos agora. */
  source: FxSource = 'none';

  /** `art` devolve a ArtLibrary do renderizador (null antes do init e nos testes em Node). */
  constructor(private art: () => ArtLibrary | null) {}

  /**
   * Confere a fonte (chamado uma vez por quadro): atlas `fx` servido pela ArtLibrary ou o procedural. Devolve true se
   * mudou (o chamador limpa partículas e decalques que usavam a fonte anterior).
   */
  refresh(): boolean {
    const art = this.art();
    let pass = art?.fxPass() ?? null;
    // o atlas assado só serve se tiver TODOS os quadros: os lotes de partículas exigem uma textura-base só, então um atlas
    // antigo (sem algum quadro novo) não pode ser completado com o procedural — vai o procedural inteiro
    if (pass && pass !== this.checkedPass) { this.checkedPass = pass; this.checkedComplete = allFxNames().every((n) => pass!.frames.has(n)); }
    if (pass && !this.checkedComplete) pass = null;
    const key = pass ? `baked:${art?.fxScale()}` : 'fallback';
    if (key === this.servedKey) return false;
    this.servedKey = key;
    this.byName.clear(); this.byFamily.clear();
    // sem DOM (Node, testes) o procedural fica vazio: textura branca (as partículas funcionam, só sem desenho)
    const fb = pass ? null : this.fallbackFrames();
    for (const n of allFxNames()) this.byName.set(n, pass ? pass.frames.get(n)! : fb!.get(n) ?? Texture.WHITE);
    for (const [fam, f] of Object.entries(FX_FAMILIES)) this.byFamily.set(fam, Array.from({ length: f.n }, (_, i) => this.byName.get(fxFrameName(fam, i))!));
    this.source = pass ? 'baked' : 'fallback';
    return true;
  }
  /** Quadro pelo nome (`spark`, `fire/03`, `decal/burn/1`). Nome desconhecido: Texture.EMPTY (transparente — nunca um
   *  quadrado branco no chão) e um aviso no console (uma vez por nome). */
  frame(name: string): Texture {
    const t = this.byName.get(name);
    if (t) return t;
    if (!this.missing.has(name)) { this.missing.add(name); console.warn(`[efeitos] quadro fx inexistente: ${name}`); }
    return Texture.EMPTY;
  }
  private missing = new Set<string>();
  /** Quadros de uma família, na ordem (flipbook do fogo, variantes da fumaça, 8 direções de um projétil). */
  family(fam: string): readonly Texture[] { return this.byFamily.get(fam) ?? [Texture.WHITE]; }
  /** Um quadro aleatório da família (variantes). */
  pick(fam: string): Texture { const l = this.family(fam); return l[Math.floor(Math.random() * l.length)]; }
  /** Projétil `kind` na direção assada `dir` (0 = E, sentido horário na tela). */
  proj(kind: ProjectileKind, dir: number): Texture { return this.family(`proj/${kind}`)[dir & 7]; }

  // ---------------------------------------------------------------------------------------------------------------
  // atlas procedural de reserva (canvas, uma vez; sem DOM — Node/testes — tudo vira Texture.WHITE)

  private fallbackFrames(): Map<string, Texture> {
    if (this.fallback) return this.fallback;
    this.fallback = new Map();
    if (typeof document === 'undefined') return this.fallback;
    const CELL = 66, COLS = 16;
    const names = allFxNames();
    const cv = document.createElement('canvas');
    cv.width = CELL * COLS; cv.height = CELL * Math.ceil(names.length / COLS);
    const g = cv.getContext('2d');
    if (!g) return this.fallback;
    const rects = new Map<string, Rectangle>();
    let i = 0;
    for (const [fam, f] of Object.entries(FX_FAMILIES)) for (let k = 0; k < f.n; k++, i++) {
      const x = (i % COLS) * CELL + 1, y = Math.floor(i / COLS) * CELL + 1;
      g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, f.w, f.h); g.clip();
      drawFallback(g, fam, k, f.w, f.h);
      g.restore();
      rects.set(fxFrameName(fam, k), new Rectangle(x, y, f.w, f.h));
    }
    const source = new CanvasSource({ resource: cv });
    for (const [name, r] of rects) {
      const fam = Object.keys(FX_FAMILIES).find((f) => name === f || name.startsWith(f + '/'))!;
      const f = FX_FAMILIES[fam];
      this.fallback.set(name, new Texture({ source, frame: r, defaultAnchor: { x: f.ax ?? 0.5, y: f.ay ?? 0.5 } }));
    }
    return this.fallback;
  }
}

/** Desenho procedural simples de cada família (reserva, sem luz assada): formas e gradientes nas mesmas medidas. */
function drawFallback(g: CanvasRenderingContext2D, fam: string, k: number, w: number, h: number): void {
  const cx = w / 2, cy = h / 2;
  const radial = (r: number, stops: [number, string][], x = cx, y = cy) => { const gr = g.createRadialGradient(x, y, 0.5, x, y, r); for (const [t, c] of stops) gr.addColorStop(t, c); g.fillStyle = gr; g.fillRect(0, 0, w, h); };
  if (fam.startsWith('proj/')) {
    const kind = fam.slice(5) as ProjectileKind;
    g.translate(cx, cy); g.rotate((k * Math.PI) / 4);
    if (kind === 'arrow' || kind === 'javelin' || kind === 'spike') {
      const L = kind === 'javelin' ? 13 : kind === 'arrow' ? 9 : 6.5;
      g.strokeStyle = kind === 'spike' ? '#3a2e24' : '#9a7a50'; g.lineWidth = kind === 'javelin' ? 1.6 : 1.2;
      g.beginPath(); g.moveTo(-L, 0); g.lineTo(L - 2, 0); g.stroke();
      g.fillStyle = kind === 'spike' ? '#cbbb9a' : '#a8843e'; g.beginPath(); g.moveTo(L + 1, 0); g.lineTo(L - 3, -1.6); g.lineTo(L - 3, 1.6); g.fill();
      if (kind === 'arrow') { g.fillStyle = '#e8dcc0'; g.fillRect(-L, -1.4, 3, 2.8); }
    } else if (kind === 'stone') { g.fillStyle = '#8a8378'; g.beginPath(); g.arc(0, 0, 3.4, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(-1, -1, 1.4, 0, Math.PI * 2); g.fill(); }
    else if (kind === 'fireball') { g.translate(-cx, -cy); radial(9, [[0, 'rgba(255,240,200,1)'], [0.35, 'rgba(255,150,40,0.9)'], [1, 'rgba(160,30,0,0)']]); }
    else { g.strokeStyle = 'rgba(220,240,255,0.95)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-9, 0); g.lineTo(-3, -1.5); g.lineTo(3, 1.5); g.lineTo(9, 0); g.stroke(); }
    return;
  }
  switch (fam) {
    case 'puff': {   // o gradiente da fumaça da Etapa 3, exatamente (círculo interno de 1 px)
      const gr = g.createRadialGradient(16, 16, 1, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h); break;
    }
    case 'smoke': case 'dust': radial(w / 2, [[0, 'rgba(235,230,222,0.8)'], [0.55, 'rgba(225,220,210,0.45)'], [1, 'rgba(220,215,205,0)']], cx + (k - 1.5), cy + ((k * 7) % 3 - 1)); break;
    case 'spark': { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,160,60,0)'); gr.addColorStop(0.83, 'rgba(255,245,220,1)'); gr.addColorStop(1, 'rgba(255,245,220,0)'); g.fillStyle = gr; g.fillRect(0, 1, w, 2); break; }
    case 'ember': radial(3, [[0, 'rgba(255,220,140,1)'], [1, 'rgba(255,90,20,0)']]); break;
    case 'glow': radial(16, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]); break;
    case 'mote': radial(4, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(0, cy - 0.5, w, 1); g.fillRect(cx - 0.5, 0, 1, h); break;
    case 'chip_wood': g.fillStyle = k % 2 ? '#b89366' : '#8a6a45'; g.translate(cx, cy); g.rotate(k * 0.8); g.fillRect(-2.5, -0.7, 5, 1.4); break;
    case 'chip_stone': g.fillStyle = k % 2 ? '#a39a88' : '#c8b995'; g.beginPath(); g.moveTo(cx - 2, cy - 1); g.lineTo(cx + 1, cy - 2.2); g.lineTo(cx + 2.4, cy + 0.5); g.lineTo(cx - 0.5, cy + 2.2); g.fill(); break;
    case 'leaf': g.fillStyle = ['#7c8a5a', '#5f7a33', '#8a8a4a', '#6a7a4e'][k]; g.translate(cx, cy); g.rotate(k * 0.9); g.beginPath(); g.ellipse(0, 0, 3, 1.2, 0, 0, Math.PI * 2); g.fill(); break;
    case 'drop': g.fillStyle = 'rgba(190,215,240,0.85)'; g.beginPath(); g.arc(cx, h * 0.62, 1.8, 0, Math.PI * 2); g.fill(); break;
    case 'ring': g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, w * 0.42, 0, Math.PI * 2); g.stroke(); break;
    case 'fire': {
      const sway = Math.sin(k * 0.785) * 2;
      const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,230,160,1)'); gr.addColorStop(0.45, 'rgba(255,130,30,0.9)'); gr.addColorStop(1, 'rgba(140,20,0,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(cx - w * 0.4, h * 0.92); g.quadraticCurveTo(cx - w * 0.45, h * 0.4, cx + sway, h * 0.05); g.quadraticCurveTo(cx + w * 0.45, h * 0.4, cx + w * 0.4, h * 0.92); g.fill(); break;
    }
    case 'decal/burn': radial(w / 2, [[0, 'rgba(77,64,51,0.92)'], [0.6, 'rgba(120,102,82,0.6)'], [1, 'rgba(140,120,96,0)']]); break;
    case 'decal/crack': {
      g.strokeStyle = 'rgba(40,33,24,0.9)'; g.lineWidth = 1.2;
      for (let b = 0; b < 4; b++) { let x = cx, y = cy, a = b * 1.57 + k; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 9; s++) { a += Math.sin(b * 3 + s * 1.7 + k) * 0.4; x += Math.cos(a) * 3; y += Math.sin(a) * 3; g.lineTo(x, y); } g.stroke(); }
      break;
    }
    case 'decal/impact': radial(w / 2, [[0, 'rgba(60,48,34,0.5)'], [0.55, 'rgba(70,56,40,0.45)'], [1, 'rgba(90,70,50,0)']]); break;
    case 'decal/debris': for (let s = 0; s < 18; s++) { const a = s * 2.4 + k, d = ((s * 37) % 23) + 2; g.fillStyle = s % 5 ? '#a39a88' : '#8a6a45'; g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.2 + (s % 3) * 0.6, 0, Math.PI * 2); g.fill(); } break;
    default: g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  }
}

/** Projéteis conhecidos (reexport para quem só importa as texturas). */
export { PROJECTILE_KINDS };
