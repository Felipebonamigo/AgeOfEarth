// Habilidade Q dos heróis (`ability`: `data` = raio, `owner`; docs/ART.md §1.9 e Apêndice F — lote combate-ambiente).
// O núcleo não diz qual herói; é o do dono cuja recarga começou no tick do efeito (rules.ts abilityHero). Cada Q tem arte
// própria, sincronizada com a animação `ability` assada (8 quadros a 10 fps) e legível a zoom 1 — a ÁREA (a onda chega
// até o raio da habilidade) e QUEM recebeu (cada aliado alcançado brilha quando a onda passa por ele):
//  - Jasão, Grito dos Argonautas (ataque, 6 tiles): com o braço no alto (0,2 s), o brado — onda de ar e poeira rasteira
//    até o raio e um aro dourado-avermelhado de luz; cada aliado acende em brasas quentes;
//  - Odisseu, Astúcia (velocidade, 6 tiles): um redemoinho de vento com folhas e poeira clara abrindo até o raio; cada
//    aliado ganha riscos de vento e uma folha;
//  - Héracles, Golpe Titânico (o próximo golpe triplo): a luz dourada converge na clava erguida (0,24 s) e ele ESMAGA o
//    chão (0,4 s) — onda de poeira de 2 tiles, pedras, rachadura, tremor; o brilho da carga segue nele (fx/unitFx.ts)
//    até o golpe, e o golpe em si sai em splash.ts;
//  - Aquiles, Fúria (pressa, só ele): o fogo da fúria — chamas em flipbook aos pés, brasas e um clarão vermelho, com
//    lampejos a cada estocada da animação; as chamas seguem nele enquanto dura (unitFx);
//  - Perseu, Escudo Espelhado (proteção, 5 tiles): o escudo erguido (0,24 s) reflete — lampejo prateado e um aro de luz
//    fria até o raio; cada aliado protegido cintila.
// Sem herói identificado: a onda dourada genérica da base. Partículas com PRIO.power; um disparo por fase, só enquanto o
// efeito é novo (não repete ao voltar à tela ou ao trocar a arte).
import { UNITS } from '../../../core/data';
import type { GameState, Unit } from '../../../core/types';
import type { FxContext, FxHandler } from '../types';
import { PRIO } from '../../particles';
import { chips, dust, embers, flame, glow, leaves, motes, ring, sparks } from '../emitters';
import { bodyMotes, converge, dustWave, windStreak } from '../recipes';
import { abilityHero } from '../rules';
import { FRESH, TILE, dustAt, seenNow } from './util';

const R = Math.random;
interface S {
  /** Herói (id; −1 = não achado) e o tipo dele (a arte). */
  hero: number; kind: string;
  /** Centro (tiles), acompanhando o herói; raio (tiles). */
  x: number; y: number; r: number;
  /** Fases já disparadas (bits) e aliados já alcançados pela onda. */
  done: number; reached: Set<number>;
  /** Início da onda (s desde o começo; −1 = ainda não). */
  wave: number;
}
/** Instante (s desde o uso) de cada fase por herói, casado com a pose `ability_<herói>` (art/poses/human.json). */
const WAVE_AT: Record<string, number> = { jason: 0.2, odysseus: 0.25, heracles: 0.4, achilles: 0.2, perseus: 0.24 };
/** Velocidade da onda (tiles/s) até o raio. */
const WAVE_SPEED = 9;

/** Aliados do dono (o mesmo time) fora de edifícios num raio `r` de (x, y) — quem a Q alcança. */
function allies(state: GameState, owner: number, x: number, y: number, r: number, fn: (u: Unit, d: number) => void): void {
  const team = state.players[owner]?.team;
  for (const u of state.units.values()) {
    if (u.inside !== -1 || state.players[u.owner]?.team !== team) continue;
    const d = Math.sqrt((u.x - x) ** 2 + (u.y - y) ** 2);
    if (d <= r) fn(u, d);
  }
}
const once = (s: S, bit: number): boolean => { if (s.done & bit) return false; s.done |= bit; return true; };

/** Altura (px) do corpo de um herói assado (a luz/brasas nascem no tronco e no alto). */
const HERO_TOP = 28;

function fireWave(s: S, fx: FxContext): void {
  const x = s.x * TILE, y = s.y * TILE, R0 = s.r * TILE, tint = dustAt(fx, s.x, s.y);
  switch (s.kind) {
    case 'jason':
      dustWave(fx.particles, fx.tex, x, y, 10, R0, 22, tint, { prio: PRIO.power, scale: 0.5, alpha: 0.4, life: 0.7 });
      ring(fx.particles, fx.tex, x, y, 10, R0, 0xffb860, 0.8, 'add', PRIO.power, 0.5);
      glow(fx.particles, fx.tex, x, y, HERO_TOP, 18, 0xffc070, 0.45, PRIO.power, 0.75);
      dust(fx.particles, fx.tex, x, y, { n: 4, tint, spread: 6, speed: 18, scale: 0.45, alpha: 0.45, life: 0.9, prio: PRIO.power });
      break;
    case 'odysseus':
      // redemoinho: folhas e poeira clara num anel girando e abrindo
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2, d = 10 + R() * 8, sp = R0 * (0.9 + R() * 0.4);
        const leaf = i % 2 === 0;
        fx.particles.emit({ frames: [leaf ? fx.tex.pick('leaf') : fx.tex.pick('dust')], blend: 'normal', prio: PRIO.power, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, z: leaf ? 6 + R() * 10 : 2,
          vx: Math.cos(a) * sp - Math.sin(a) * 50, vy: (Math.sin(a) * sp + Math.cos(a) * 50) * 0.7, vz: leaf ? 10 + R() * 12 : 4, drag: 1.6, wind: 0.6,
          life: 0.9 + R() * 0.4, scale0: leaf ? 1 : 0.45, scale1: leaf ? 1 : 1.2, alpha0: leaf ? 1 : 0.45, alpha1: 0, fadeIn: 0.05, tint: leaf ? undefined : 0xe8e6dc, rot: R() * 6.28, spin: leaf ? 8 : 1 });
      }
      ring(fx.particles, fx.tex, x, y, 8, R0, 0xeef2ea, 0.8, 'normal', PRIO.power, 0.4);
      break;
    case 'heracles':
      // o chão esmagado pela clava
      dustWave(fx.particles, fx.tex, x, y, 6, R0 * 1.15, 22, tint, { prio: PRIO.power, scale: 0.7, alpha: 0.6, life: 0.9 });
      ring(fx.particles, fx.tex, x, y, 6, R0 * 1.2, tint, 0.7, 'normal', PRIO.power, 0.6);
      dust(fx.particles, fx.tex, x, y, { n: 8, tint, spread: 8, speed: 20, scale: 0.6, grow: 2.6, alpha: 0.55, life: 1.2, prio: PRIO.power, rise: 12 });
      chips(fx.particles, fx.tex, x, y, 4, 10, 'stone', PRIO.power, 1.3);
      glow(fx.particles, fx.tex, x, y, 6, 30, 0xffcf70, 0.4, PRIO.power, 0.85);
      fx.decal('decal/crack', s.x, s.y, { rot: R() * 6.28, size: 2.2 * TILE, alpha: 0.9, life: 30 });
      fx.shake(5);
      break;
    case 'achilles':
      // um círculo de chamas baixas em volta dos pés (não no corpo: o fogo lambe o chão) e o clarão vermelho da fúria
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; flame(fx.particles, fx.tex, x + Math.cos(a) * 11, y + Math.sin(a) * 6 + 2, 0, 0.32 + R() * 0.12, 0.55 + R() * 0.3, PRIO.power); }
      embers(fx.particles, fx.tex, x, y, 8, 14, PRIO.power);
      glow(fx.particles, fx.tex, x, y, 4, 26, 0xff5a28, 0.55, PRIO.power, 0.6);
      ring(fx.particles, fx.tex, x, y, 6, 1.6 * TILE, 0xff6a30, 0.6, 'add', PRIO.power, 0.55);
      break;
    case 'perseus':
      glow(fx.particles, fx.tex, x - 3, y, 18, 30, 0xe6f4ff, 0.35, PRIO.power, 1);
      ring(fx.particles, fx.tex, x, y, 8, R0, 0xcfe8ff, 0.9, 'add', PRIO.power, 0.6);
      bodyMotes(fx.particles, fx.tex, x - 3, y, 6, { tint: 0xf0f8ff, z0: 12, z1: 24, w: 6, rise: 16, life: 0.7, scale: 0.9, prio: PRIO.power });
      break;
    default:
      ring(fx.particles, fx.tex, x, y, 8, R0, 0xffd070, 0.75, 'add', PRIO.power, 0.85);
      glow(fx.particles, fx.tex, x, y, 12, 20, 0xffe4a0, 0.5, PRIO.power, 0.8);
      motes(fx.particles, fx.tex, x, y, 10, 0xffe0a0, 8, PRIO.power, 40);
  }
}

/** Um aliado alcançado pela onda: a marca de "recebeu" de cada Q. */
function touch(u: Unit, s: S, fx: FxContext): void {
  if (!fx.visibleAt(u.x, u.y) || !fx.onScreen(u.x, u.y, 1)) return;
  const x = u.x * TILE, y = u.y * TILE, top = Math.max(14, (UNITS[u.type]?.radius ?? 0.3) * 60);
  switch (s.kind) {
    case 'jason':
      bodyMotes(fx.particles, fx.tex, x, y, 5, { tint: 0xffa050, z0: top * 0.3, z1: top * 0.9, w: 5, rise: 26, life: 1, scale: 0.8, prio: PRIO.power });
      glow(fx.particles, fx.tex, x, y, top * 0.6, 12, 0xff9a50, 0.45, PRIO.power, 0.6);
      break;
    case 'odysseus':
      for (let i = 0; i < 2; i++) windStreak(fx.particles, fx.tex, x + (R() - 0.5) * 10, y + (R() - 0.5) * 4, 4 + R() * 12, 60 + R() * 30, (R() - 0.5) * 16, 0xeef2f0, PRIO.power, 0.6);
      leaves(fx.particles, fx.tex, x, y, top * 0.8, 1, PRIO.power);
      break;
    case 'perseus':
      glow(fx.particles, fx.tex, x, y, top * 0.6, 9, 0xdff0ff, 0.4, PRIO.power, 0.55);
      bodyMotes(fx.particles, fx.tex, x, y, 2, { tint: 0xeaf6ff, z0: top * 0.3, z1: top, w: 4, rise: 14, life: 0.8, scale: 0.8, prio: PRIO.power });
      break;
  }
}

export const ability: FxHandler<S> = {
  create(e, fx, age) {
    const hero = abilityHero(fx.state, e);
    const s: S = { hero: hero?.id ?? -1, kind: hero?.type ?? '', x: hero?.x ?? e.x, y: hero?.y ?? e.y, r: Math.max(1, Number(e.data) || 1), done: 0, reached: new Set(), wave: -1 };
    if (age > FRESH) s.done = ~0;   // efeito refeito/visto tarde: não repete
    return s;
  },
  update(e, s, fx, t) {
    const h = s.hero >= 0 ? fx.state.units.get(s.hero) : undefined;
    if (h) { s.x = h.x; s.y = h.y; }
    if (!seenNow(fx, s.x, s.y, s.r + 1)) return;
    const x = s.x * TILE, y = s.y * TILE;
    // preparação antes do golpe/brado
    if (s.kind === 'heracles' && t >= 0.22 && once(s, 1)) converge(fx.particles, fx.tex, x + 4, y, HERO_TOP + 6, 20, 12, 0xffd27a, PRIO.power, 0.2);
    if (s.kind === 'achilles' && t >= 0.36 && once(s, 4)) sparks(fx.particles, fx.tex, x, y, 14, 6, PRIO.power);
    if (s.kind === 'achilles' && t >= 0.64 && once(s, 8)) sparks(fx.particles, fx.tex, x, y, 14, 6, PRIO.power);
    if (t >= (WAVE_AT[s.kind] ?? 0) && once(s, 2)) { s.wave = t; fireWave(s, fx); }
    // a onda alcança os aliados (Jasão, Odisseu, Perseu): cada um brilha quando a frente passa por ele
    if (s.wave >= 0 && (s.kind === 'jason' || s.kind === 'odysseus' || s.kind === 'perseus')) {
      const front = (t - s.wave) * WAVE_SPEED;
      if (front <= s.r + 0.5) allies(fx.state, e.owner ?? -1, s.x, s.y, Math.min(s.r, front), (u) => { if (!s.reached.has(u.id) && u.id !== s.hero) { s.reached.add(u.id); touch(u, s, fx); } });
    }
  },
};
