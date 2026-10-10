// Ícones do HUD (Etapa 7; docs/ART.md §1.10 e Apêndice H): o atlas `hud` (public/art/hud-<escala>x-*.png/json, gerado por
// `npm run art:hud` a partir dos mesmos modelos do bake) com unidades, edifícios, tecnologias, poderes, retratos dos
// deuses, Idades, habilidades e recursos. Independe da opção "Arte assada": o HUD carrega o atlas sozinho (imagem + JSON,
// sem GPU) e compõe cada ícone num canvas 2D — cor e, para quem tem partes de time, a máscara tingida na cor do dono —,
// guardado como data URL por nome e cor. Enquanto o atlas não chega (ou se faltar), o HUD mostra um marcador neutro,
// nunca um emoji; quem desenha o HUD escuta `onIconsReady` para redesenhar.
import { UNITS } from '../core/data/units';
import { AGES } from '../core/data/ages';
import { TECHS } from '../core/data/techs';
import { MAJOR_GODS, MINOR_GODS } from '../core/data/gods';
import { glyph } from './glyphs';
import { buildingArtType, unitArtType } from '../render/art/alias';

interface Frame { img: HTMLImageElement; x: number; y: number; w: number; h: number; tx: number; ty: number; sw: number; sh: number }
interface SheetJson { frames: Record<string, { frame: { x: number; y: number; w: number; h: number }; spriteSourceSize: { x: number; y: number }; sourceSize: { w: number; h: number } }>; meta: { image: string } }
interface IndexJson { assets: Record<string, { kind: string; atlases: Record<string, { color?: string[]; team?: string[] }> }> }

const color = new Map<string, Frame>();
const team = new Map<string, Frame>();
const cache = new Map<string, string | null>();
const listeners = new Set<() => void>();
let state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
let generation = 0;

/** Registra quem redesenha quando os ícones ficam prontos (devolve o cancelamento). */
export function onIconsReady(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
/** Geração dos ícones (muda quando o atlas carrega): entra nas chaves de redesenho do HUD. */
export function iconsGeneration(): number { return generation; }
export function iconsReady(): boolean { return state === 'ready'; }

const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error(`imagem ${url}`)); i.src = url; });

/**
 * Carrega o atlas do HUD (uma vez). `scale` 2 nas telas densas (devicePixelRatio × escala da interface ≥ 1,5), senão 1;
 * sem a escala pedida no índice, usa a outra. `base` = pasta de public/art.
 */
export async function loadIcons(base = `${import.meta.env?.BASE_URL ?? './'}art/`, scale?: number): Promise<void> {
  if (state === 'loading' || state === 'ready') return;
  state = 'loading';
  try {
    const want = scale ?? ((typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1) >= 1.5 ? 2 : 1);
    const r = await fetch(base + 'manifest.json');
    if (!r.ok) throw new Error(`manifest.json ${r.status}`);
    const index = (await r.json()) as IndexJson;
    const hud = index.assets?.hud;
    if (!hud) throw new Error('sem o grupo hud no índice (npm run art:hud)');
    const byScale = hud.atlases[String(want)] ?? hud.atlases['1'] ?? Object.values(hud.atlases)[0];
    if (!byScale) throw new Error('grupo hud sem atlas');
    const load = async (file: string, into: Map<string, Frame>): Promise<void> => {
      const jr = await fetch(base + file);
      if (!jr.ok) throw new Error(`${file} ${jr.status}`);
      const sheet = (await jr.json()) as SheetJson;
      const img = await loadImage(base + sheet.meta.image);
      for (const [name, f] of Object.entries(sheet.frames)) into.set(name, { img, x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h, tx: f.spriteSourceSize.x, ty: f.spriteSourceSize.y, sw: f.sourceSize.w, sh: f.sourceSize.h });
    };
    await Promise.all([...(byScale.color ?? []).map((f) => load(f, color)), ...(byScale.team ?? []).map((f) => load(f, team))]);
    state = 'ready';
    generation++;
    cache.clear();
    hydrate();
    for (const fn of listeners) { try { fn(); } catch { /* um ouvinte com erro não impede os outros */ } }
  } catch (err) {
    state = 'failed';
    console.warn('[ícones do HUD]', (err as Error).message);
  }
}

/** Data URL do ícone `name` (cor + máscara tingida em `teamColor`), ou null se não houver. */
export function iconUrl(name: string, teamColor?: number): string | null {
  if (state !== 'ready') return null;
  const key = teamColor === undefined ? name : `${name}|${teamColor}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const f = color.get(name);
  let url: string | null = null;
  if (f) {
    try {
      const cv = document.createElement('canvas'); cv.width = f.sw; cv.height = f.sh;
      const g = cv.getContext('2d')!;
      g.drawImage(f.img, f.x, f.y, f.w, f.h, f.tx, f.ty, f.w, f.h);
      const t = teamColor !== undefined ? team.get(name) : undefined;
      if (t) {
        // máscara de time: branco iluminado × cor do dono, recortada pelo próprio alfa (como no renderizador)
        const tc = document.createElement('canvas'); tc.width = f.sw; tc.height = f.sh;
        const tg = tc.getContext('2d')!;
        tg.drawImage(t.img, t.x, t.y, t.w, t.h, t.tx, t.ty, t.w, t.h);
        tg.globalCompositeOperation = 'multiply'; tg.fillStyle = '#' + teamColor!.toString(16).padStart(6, '0'); tg.fillRect(0, 0, f.sw, f.sh);
        tg.globalCompositeOperation = 'destination-in'; tg.drawImage(t.img, t.x, t.y, t.w, t.h, t.tx, t.ty, t.w, t.h);
        g.drawImage(tc, 0, 0);
      }
      url = cv.toDataURL('image/png');
    } catch { url = null; }
  }
  cache.set(key, url);
  return url;
}

/** Troca os marcadores neutros que já estão na página (menu, lobby, editor) pelos ícones, sem redesenhar a tela. */
function hydrate(): void {
  if (typeof document === 'undefined') return;
  for (const ph of document.querySelectorAll<HTMLElement>('span.hic-ph[data-ic]')) {
    const team = ph.dataset.team !== undefined ? Number(ph.dataset.team) : undefined;
    const url = iconUrl(ph.dataset.ic!, team);
    if (!url) continue;
    const img = document.createElement('img');
    img.className = [...ph.classList].filter((c) => c !== 'hic-ph').join(' ');
    img.src = url; img.alt = ph.getAttribute('aria-label') ?? ''; img.draggable = false;
    ph.replaceWith(img);
  }
}

/** Nome do ícone de uma tecnologia (as de nível — civic1…5 — usam o do ramo). */
export function techIconName(id: string): string {
  const m = /^(civic|commerce|military|science|harvest)\d$/.exec(id);
  return `tech/${m ? m[1] : id}`;
}

/**
 * HTML de um ícone: `<img>` do atlas ou o marcador neutro (o atlas ainda não carregou). `cls` extra; `label` vira o alt
 * (leitor de tela) — o nome já aparece ao lado na maioria dos lugares, então o padrão é vazio.
 */
export function iconHtml(name: string, opts: { team?: number; cls?: string; label?: string } = {}): string {
  const url = iconUrl(name, opts.team);
  const cls = `hic${opts.cls ? ' ' + opts.cls : ''}`;
  const alt = (opts.label ?? '').replace(/"/g, '&quot;');
  return url ? `<img class="${cls}" src="${url}" alt="${alt}" draggable="false">` : `<span class="${cls} hic-ph" aria-label="${alt}" data-ic="${name}"${opts.team !== undefined ? ` data-team="${opts.team}"` : ''}></span>`;
}

/** Atalhos por tipo de conteúdo. */
export const ic = {
  unit: (type: string, team?: number, cls?: string): string => iconHtml(`unit/${unitArtType(type)}`, { team, cls, label: UNITS[type]?.name }),
  bld: (type: string, team?: number, cls?: string): string => iconHtml(`bld/${buildingArtType(type)}`, { team, cls }),
  tech: (id: string, cls?: string): string => iconHtml(techIconName(id), { cls, label: TECHS[id]?.name }),
  power: (id: string, cls?: string): string => iconHtml(`power/${id}`, { cls }),
  god: (id: string, cls?: string): string => iconHtml(`god/${id}`, { cls: `hic-god${cls ? ' ' + cls : ''}` }),
  age: (n: number, cls?: string): string => iconHtml(`age/${Math.max(0, Math.min(AGES.length - 1, n))}`, { cls }),
  ability: (id: string, cls?: string): string => iconHtml(`ability/${id}`, { cls }),
  res: (r: string, cls?: string): string => iconHtml(`res/${r}`, { cls: `hic-res${cls ? ' ' + cls : ''}` }),
};

/**
 * Ícone de quem fala / de um cenário: o emoji do roteiro (o ícone de um deus ou de uma unidade nos dados) vira o retrato
 * ou o ícone correspondente do atlas; sem correspondência, `fallback` (glifo; padrão: o de fala) — nunca o emoji.
 */
let emojiMap: Map<string, string> | null = null;
export function emojiIcon(emoji: string, cls = '', fallback = 'chat'): string {
  if (!emojiMap) {
    emojiMap = new Map();
    for (const [id, g] of Object.entries(MAJOR_GODS)) emojiMap.set(g.icon, `god/${id}`);
    for (const [id, g] of Object.entries(MINOR_GODS)) if (!emojiMap.has(g.icon)) emojiMap.set(g.icon, `god/${id}`);
    // titãs e heróis antes das criaturas (ícones repetidos: 🔥 é Prometeu, não a Quimera)
    const units = Object.values(UNITS).sort((a, b) => (a.cls === 'titan' || a.cls === 'hero' ? 0 : 1) - (b.cls === 'titan' || b.cls === 'hero' ? 0 : 1));
    for (const u of units) if (!emojiMap.has(u.icon)) emojiMap.set(u.icon, `unit/${u.id}`);
  }
  const name = emojiMap.get(emoji.trim());
  if (!name) return `<span class="hic hic-gly ${cls}">${glyph(fallback)}</span>`;
  return iconHtml(name, { cls: name.startsWith('god/') ? `hic-god${cls ? ' ' + cls : ''}` : cls });
}

/**
 * Ícone de cada missão da campanha (menu e objetivos): o protagonista, o antagonista ou o lugar da missão, escolhido à
 * mão entre os ícones do atlas (o emoji do roteiro é genérico — três missões usam 🔥).
 */
export const MISSION_ICONS: Record<string, string> = {
  m1_despertar: 'age/0', m2_cerco: 'bld/tower', m3_portal: 'bld/titan_gate', m4_caucaso: 'unit/prometheus',
  m5_itaca: 'unit/odysseus', m6_estatua: 'bld/wonder_zeus', m7_aquiles: 'unit/achilles', m8_oceano: 'unit/oceanus',
  m9_tenaro: 'god/hades', m10_otris: 'unit/helepolis', m11_chamas: 'unit/basileus', m12_titanomaquia: 'unit/cronus',
  horde: 'power/pestilence',
};
/** Ícone de uma missão ou cenário (`id` do registro; senão o emoji do arquivo, pelo `emojiIcon`, com o pergaminho). */
export function missionIcon(id: string, emoji: string | undefined, cls = ''): string {
  const name = MISSION_ICONS[id];
  if (name) return iconHtml(name, { cls: name.startsWith('god/') ? `hic-god${cls ? ' ' + cls : ''}` : cls });
  return emojiIcon(emoji ?? '', cls, 'scroll');
}
