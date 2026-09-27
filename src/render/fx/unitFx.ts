// Efeitos contínuos POR UNIDADE à vista (docs/ART.md §1.9 e Apêndice F — lote combate-ambiente), pedidos pelo
// renderizador no laço das vistas (FxSystem.unit), com a posição interpolada do pé e a vista assada quando houver:
//  - halo dos heróis (pendência da Etapa 4): um brilho dourado sutil no chão sob o herói (luz aditiva na camada das
//    sombras, por baixo do corpo) e centelhas douradas subindo devagar do corpo;
//  - auras das habilidades em curso (lidas dos buffs do núcleo): brasas quentes no Grito dos Argonautas, riscos de vento
//    atrás de quem anda na Astúcia, chamas aos pés na Fúria de Aquiles, cintilas prateadas no Escudo Espelhado e a luz
//    dourada juntando na clava de Héracles carregado;
//  - cura: quando a vida SOBE (regeneração da Ambrosia/Caduceu, cura de cenário, patente), um brilho verde suave sobe
//    do corpo — quem está sendo curado; a Restauração tem a arte própria dela (o handler `heal`) e não dobra aqui;
//  - coleta e obra no posto: a cada golpe da animação de coleta (o quadro do machado descendo) lascas de madeira no
//    tronco e, às vezes, uma folha caindo da copa; lascas de pedra e cintila no ouro; folhas no arbusto; pó na fazenda;
//    lascas e pó na obra — rareando quando há muita gente trabalhando na tela;
//  - margem da água: quem anda na faixa molhada da margem levanta respingos e uma ondulação (e não poeira).
// Tudo só com a unidade na tela e à vista (o laço do renderizador já cortou o resto) e acima do zoom 0,5.
import { Container, Sprite } from 'pixi.js';
import { TILE, DT } from '../../core/constants';
import { UNITS } from '../../core/data';
import type { Unit } from '../../core/types';
import type { UnitView } from '../views/UnitView';
import type { FxContext } from './types';
import { PRIO } from '../particles';
import { chips, dust, flame, embers, glow, leaves } from './emitters';
import { bodyMotes, waterSplash, windStreak } from './recipes';
import { AURA, auraOf, hasHalo, healGain, shoreDistance, workOf, SHORE_WET, WORK_CHIP_CHANCE, WORK_CROWD, WORK_STRIKE_FRAME, WORK_STRIKE_PERIOD } from './rules';
import { DUST_MIN_ZOOM, dustColor, gaitOf } from './logic';
import { treeOffset, treeScale } from '../art/logic';
import { terrainAt } from './handlers/util';

/** Acumuladores de uma vista (guardados no FxAcc dela; nada de Map por unidade). */
export interface UnitAcc { hp: number; halo: number; aura: number; work: number; frame: number; wet: number }
const R = Math.random;

export class UnitFx {
  private halos = new Map<number, { s: Sprite; seen: number }>();
  private haloRoot: Container | null = null;
  private frameN = 0;
  private workers = 0; private workersPrev = 0;
  private dir = { x: 0, y: 0 };
  /** Contadores de diagnóstico (scripts/artfx.mjs, testes): golpes com lascas, folhas da coleta, respingos, curas, auras. */
  readonly counts = { strike: 0, leaf: 0, shore: 0, heal: 0, aura: 0 };

  /** Começo do quadro: quantos trabalhavam na tela no quadro anterior decide a densidade das lascas. */
  begin(): void { this.frameN++; this.workersPrev = this.workers; this.workers = 0; }

  /** Uma unidade à vista na tela em (x, y) (tiles, interpolado); `uv` = vista assada (sincroniza o golpe da coleta);
   *  `coast` = há água no tile do pé ou em volta (senão a margem nem é conferida). */
  unit(fx: FxContext, a: UnitAcc, u: Unit, x: number, y: number, uv: UnitView | null, coast = true): void {
    const def = UNITS[u.type];
    if (!def) return;
    const hp = u.hp, gain = healGain(a.hp < 0 ? undefined : a.hp, hp);
    a.hp = hp;
    if (fx.zoom < DUST_MIN_ZOOM || fx.dt <= 0) { if (hasHalo(u.type)) this.halo(fx, u, x, y); return; }
    const px = x * TILE, py = y * TILE, top = uv ? uv.art.top : Math.max(12, def.radius * 60);
    if (hasHalo(u.type)) {
      this.halo(fx, u, x, y);
      a.halo += fx.dt * 2.6;
      if (a.halo >= 1) { a.halo -= 1; bodyMotes(fx.particles, fx.tex, px, py, 1, { tint: R() < 0.5 ? 0xffd98a : 0xffe9b8, z0: top * 0.2, z1: top * 0.95, w: 6, rise: 9, life: 1.6, scale: 0.5, alpha: 0.75 }); }
    }
    // cura: o brilho verde sobe de quem ganhou vida (a Restauração, que cura muito de uma vez, tem a arte dela)
    if (gain > 0 && !(gain > u.maxHp * 0.3 && restorationHere(fx, u))) {
      // um pulso por ganho (a regeneração do núcleo é 1×/s): brilho verde macio no corpo e centelhas subindo dele
      const big = gain > u.maxHp * 0.1;
      this.counts.heal++;
      bodyMotes(fx.particles, fx.tex, px, py, big ? 5 : 3, { tint: R() < 0.5 ? 0xa8ec90 : 0xd0f6b0, z0: top * 0.15, z1: top * 0.85, w: 6, rise: 16, life: 1.2, scale: 0.8, alpha: 0.9 });
      glow(fx.particles, fx.tex, px, py, top * 0.45, big ? 14 : 11, 0xb8f09a, 0.7, PRIO.ambient, big ? 0.55 : 0.42);
    }
    const aura = auraOf(u, fx.state.tick);
    if (aura) this.aura(fx, a, u, aura, px, py, top);
    const work = u.state === 'gather' || u.state === 'build' ? workOf(fx.state, u) : null;
    if (work) this.work(fx, a, u, work, px, py, uv);
    // margem da água: respingos no lugar da poeira (FxSystem.footstep não levanta pó aqui)
    const mdx = u.x - u.px, mdy = u.y - u.py;
    if (coast && mdx * mdx + mdy * mdy > 4e-4 && gaitOf(u.type) !== 'none') {   // `coast`: há água em volta do tile do pé
      const d = shoreDistance(fx.state.map, x, y, this.dir);
      if (d < SHORE_WET) {
        const speed = Math.sqrt(mdx * mdx + mdy * mdy) / DT;
        a.wet += fx.dt * speed * (gaitOf(u.type) === 'hoof' ? 2.4 : 1.4);
        if (a.wet >= 1) {
          a.wet -= 1;
          this.counts.shore++;
          // gotas nos pés, um pouco para o lado da água; a ondulação só na linha d'água (onde a água está de fato)
          const k = 0.35 * TILE * (1 - d / SHORE_WET);
          waterSplash(fx.particles, fx.tex, px + this.dir.x * k, py + this.dir.y * k, { n: gaitOf(u.type) === 'hoof' ? 4 : 2, power: gaitOf(u.type) === 'foot' ? 0.8 : 1.3, ring: false });
          if (R() < 0.5) waterSplash(fx.particles, fx.tex, px + this.dir.x * (d * TILE + 3), py + this.dir.y * (d * TILE + 3), { n: 0, power: 0.9 });
        }
      }
    }
  }

  /** Brilho dourado no chão sob o herói (um sprite por herói, na camada das sombras: fica POR BAIXO do corpo). */
  private halo(fx: FxContext, u: Unit, x: number, y: number): void {
    let h = this.halos.get(u.id);
    if (!h) {
      if (!this.haloRoot || this.haloRoot.destroyed || !this.haloRoot.parent) { this.haloRoot = new Container(); fx.host.shadows.addChild(this.haloRoot); }
      const s = new Sprite(fx.tex.frame('glow'));
      s.anchor.set(0.5); s.blendMode = 'add'; s.tint = 0xffc864;
      this.haloRoot.addChild(s);
      h = { s, seen: 0 }; this.halos.set(u.id, h);
    }
    h.seen = this.frameN;
    // ≈ 1,3 × 0,75 tile de luz dourada no chão, pulsando devagar (o núcleo do `glow` tem ~1/3 do quadro)
    const pulse = 0.4 + 0.06 * Math.sin(fx.clock * 2.4 + u.id);
    h.s.visible = true; h.s.alpha = pulse;
    h.s.position.set(x * TILE, y * TILE + 1);
    h.s.scale.set(2.6, 1.5);
  }

  private aura(fx: FxContext, a: UnitAcc, u: Unit, m: number, px: number, py: number, top: number): void {
    a.aura += fx.dt;
    // ~5 disparos/s por unidade, cada aura com a sua chance
    if (a.aura < 0.2) return;
    a.aura -= 0.2;
    this.counts.aura++;
    if (m & AURA.attack && R() < 0.35) bodyMotes(fx.particles, fx.tex, px, py, 1, { tint: R() < 0.5 ? 0xff9a48 : 0xffc070, z0: top * 0.4, z1: top * 0.95, w: 5, rise: 18, life: 0.8, scale: 0.55, prio: PRIO.combat });
    if (m & AURA.ward && R() < 0.3) bodyMotes(fx.particles, fx.tex, px, py, 1, { tint: 0xe6f4ff, z0: top * 0.3, z1: top * 0.85, w: 5, rise: 6, life: 0.7, scale: 0.75, prio: PRIO.combat });
    if (m & AURA.haste) {
      flame(fx.particles, fx.tex, px + (R() - 0.5) * 8, py + (R() - 0.5) * 3, 0, 0.3 + R() * 0.1, 0.45 + R() * 0.2, PRIO.combat);
      if (R() < 0.5) embers(fx.particles, fx.tex, px, py, top * 0.4, 1, PRIO.combat);
    }
    if (m & AURA.charged) {
      bodyMotes(fx.particles, fx.tex, px + 4, py, 1, { tint: 0xffd070, z0: top * 0.7, z1: top * 1.05, w: 5, rise: 4, life: 0.5, scale: 0.7, prio: PRIO.combat });
      if (R() < 0.4) glow(fx.particles, fx.tex, px + 4, py, top * 0.85, 8, 0xffc860, 0.4, PRIO.combat, 0.5);
    }
    if (m & AURA.speed) {
      const dx = u.x - u.px, dy = u.y - u.py, l = Math.sqrt(dx * dx + dy * dy);
      if (l > 0.01) for (let i = 0; i < 2; i++) windStreak(fx.particles, fx.tex, px - dx / l * 6 + (R() - 0.5) * 8, py - dy / l * 4 + (R() - 0.5) * 4, 3 + R() * top * 0.7, -dx / l * 55, -dy / l * 55, 0xeef2f0, PRIO.combat, 0.45);
    }
  }

  /** Lascas/folhas/pó da coleta e da obra, no golpe da animação (assada) ou a cada WORK_STRIKE_PERIOD (procedural). */
  private work(fx: FxContext, a: UnitAcc, u: Unit, w: NonNullable<ReturnType<typeof workOf>>, px: number, py: number, uv: UnitView | null): void {
    this.workers++;
    let strike = false;
    if (uv) {
      if (uv.anim !== 'gather') { a.frame = -1; return; }
      const f = uv.shownFrame;
      strike = f === WORK_STRIKE_FRAME && a.frame !== WORK_STRIKE_FRAME;
      a.frame = f;
    } else {
      a.work += fx.dt;
      if (a.work >= WORK_STRIKE_PERIOD) { a.work -= WORK_STRIKE_PERIOD; strike = true; }
    }
    if (!strike || R() > WORK_CHIP_CHANCE * Math.min(1, WORK_CROWD / Math.max(1, this.workersPrev))) return;
    this.counts.strike++;
    // ponto do golpe: o alvo, puxado para o lado do trabalhador
    let tx = w.x * TILE, ty = w.y * TILE;
    if (w.kind === 'tree') { const nx = Math.floor(w.x), ny = Math.floor(w.y), off = treeOffset(nx, ny); tx = (nx + 0.5 + off.dx) * TILE; ty = (ny + 0.5 + off.dy) * TILE; }
    const dx = px - tx, dy = py - ty, l = Math.sqrt(dx * dx + dy * dy) || 1;
    const reach = w.kind === 'tree' ? 3 : w.kind === 'gold' ? 9 : w.kind === 'build' ? 2 : 0;
    const hx = tx + dx / l * reach, hy = ty + dy / l * reach;
    switch (w.kind) {
      case 'tree': {
        chips(fx.particles, fx.tex, hx, hy + 1, 7, 1 + (R() < 0.4 ? 1 : 0), 'wood', PRIO.ambient, 0.55);
        if (R() < 0.35) {   // folha soltando da copa com o tranco
          this.counts.leaf++;
          const nx = Math.floor(w.x), ny = Math.floor(w.y), k = treeScale(nx, ny);
          leaves(fx.particles, fx.tex, tx + (R() - 0.5) * 12, ty, (26 + R() * 12) * k, 1, PRIO.ambient);
        }
        break;
      }
      case 'gold':
        chips(fx.particles, fx.tex, hx, hy + 1, 5, 1 + (R() < 0.5 ? 1 : 0), 'stone', PRIO.ambient, 0.6);
        if (R() < 0.5) dust(fx.particles, fx.tex, hx, hy, { n: 1, tint: 0xb8b0a0, spread: 2, speed: 8, scale: 0.3, grow: 2, alpha: 0.4, life: 0.8, prio: PRIO.ambient });
        if (R() < 0.35) bodyMotes(fx.particles, fx.tex, hx, hy, 1, { tint: 0xffe07a, z0: 3, z1: 8, w: 3, rise: 6, life: 0.45, scale: 0.55, alpha: 0.9 });
        break;
      case 'berry':
        if (R() < 0.3) leaves(fx.particles, fx.tex, tx + (R() - 0.5) * 8, ty, 8 + R() * 4, 1, PRIO.ambient);
        break;
      case 'farm':
        if (R() < 0.6) dust(fx.particles, fx.tex, px + (R() - 0.5) * 6, py + 2, { n: 1, tint: dustColor(terrainAt(fx.state, u.x, u.y)), spread: 2, speed: 6, scale: 0.3, grow: 2, alpha: 0.4, life: 0.8, prio: PRIO.ambient });
        break;
      case 'build':
        if (R() < 0.6) chips(fx.particles, fx.tex, hx, hy, 6, 1, R() < 0.6 ? 'wood' : 'stone', PRIO.ambient, 0.5);
        if (R() < 0.4) dust(fx.particles, fx.tex, hx, hy, { n: 1, tint: 0xc8bca4, spread: 2, speed: 8, scale: 0.3, grow: 2, alpha: 0.4, life: 0.8, prio: PRIO.ambient });
        break;
      case 'hunt': break;   // carnear: nada salta (sem sangue)
    }
  }

  /** Fim do quadro: halos de heróis que não apareceram neste quadro somem (e saem de vez se o herói não existe mais). */
  end(fx: FxContext): void {
    for (const [id, h] of this.halos) {
      if (h.seen === this.frameN) continue;
      if (!fx.state.units.has(id) || this.frameN - h.seen > 120) { h.s.destroy(); this.halos.delete(id); }
      else h.s.visible = false;
    }
  }
  /** Troca de partida/arte. */
  reset(): void {
    for (const h of this.halos.values()) h.s.destroy();
    this.halos.clear();
    if (this.haloRoot && !this.haloRoot.destroyed) this.haloRoot.destroy({ children: true });
    this.haloRoot = null;
    this.workers = this.workersPrev = 0;
  }
  /** Diagnóstico/testes. */
  get haloCount(): number { return this.halos.size; }
}

/** Há uma Restauração recente cobrindo a unidade (a arte dela já mostra quem foi curado). */
function restorationHere(fx: FxContext, u: Unit): boolean {
  for (const e of fx.state.effects) {
    if (e.type !== 'heal' || e.total - e.ttl > 10) continue;
    const r = Number(e.data) || 8;
    if ((u.x - e.x) ** 2 + (u.y - e.y) ** 2 <= r * r) return true;
  }
  return false;
}

/** Acumuladores novos (fases aleatórias: vizinhos não piscam juntos). */
export function newUnitAcc(): UnitAcc { return { hp: -1, halo: R(), aura: R() * 0.2, work: R() * WORK_STRIKE_PERIOD, frame: -1, wet: R() }; }
