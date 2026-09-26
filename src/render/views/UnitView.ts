// Vista de uma unidade com arte assada (docs/ART.md §1.8, §3.7) — GENÉRICA: serve qualquer tipo com atlas (humano,
// montado, cerco; Etapa 4), com as animações que o manifesto dele tiver: corpo (passe de cor) + máscara de time (mesma âncora,
// tint = cor do jogador) num Container posicionado no pé, e a sombra projetada (passe de sombra) na camada 'shadows',
// alfa SHADOW_ALPHA, sem espelhar (o sol é fixo: a sombra cai sempre para SE). Direção 0–7 e animação vêm do
// renderizador; aqui só se escolhe o quadro — pelo tempo (10 fps) ou, nas animações de andar com passada no índice
// (walk/run/carry), pela DISTÂNCIA andada (o pé de apoio não desliza em nenhuma velocidade) — com troca de textura
// apenas quando o quadro muda. Um quadro sem máscara de time esconde o sprite de time (nada de máscara velha por cima).
// Também serve para a morte (animação 'die' sem loop), o cadáver (último quadro de 'die') e a petrificação (quadro
// parado tingido de cinza). Texturas do atlas são compartilhadas: destroy() destrói só os sprites.
import { Container, Sprite, type Texture } from 'pixi.js';
import { TILE } from '../../core/constants';
import { SHADOW_ALPHA } from '../palette';
import type { ArtLibrary, UnitArt } from '../art/ArtLibrary';
import { frameBox, frameIndex, isMirrored, strideAdvance, type Box, type UnitAnim } from '../art/logic';
import { maskHit, textureAlpha } from '../art/alphaMask';

/** Índice numérico das animações (chave sem string para a troca de pose). */
const ANIM_INDEX: Record<UnitAnim, number> = { idle: 0, walk: 1, attack: 2, die: 3, carry: 4, gather: 5, aim: 6, run: 7, ability: 8 };
/** Caixa de trabalho de updateBounds (reutilizada). */
const BOX: Box = { x0: 0, y0: 0, x1: 0, y1: 0 };

export class UnitView {
  readonly root = new Container();
  readonly body: Sprite;
  readonly team: Sprite | null;
  readonly shadow: Sprite | null;
  dir: number;
  anim: UnitAnim = 'idle';
  /** Início (s) da animação atual (ataque e morte tocam do quadro 0). */
  animStart = 0;
  /** Último attackTick já transformado em golpe (cada golpe recomeça o ataque). */
  lastAttackTick = -1;
  /** Último uso da habilidade (herói) já animado (`abilityUseTick`). */
  lastAbilityTick = -1;
  private poseKey = -1;
  private frame = -1;
  private cur: readonly Texture[] | null = null;
  private curTeam: readonly Texture[] | null = null;
  private curShadow: readonly Texture[] | null = null;
  private mirrored = false;
  private shadowAlpha = SHADOW_ALPHA;
  /** Caixa do corpo no mundo (px), para o pick em dois estágios; atualizada quando muda o quadro ou a posição. */
  bx0 = 0; by0 = 0; bx1 = 0; by1 = 0;
  private px = NaN; private py = NaN;
  /** Posição no ciclo das animações de andar (quadros), avançada pela distância; tiles andados desde o último tick. */
  private stepPos = 0;
  private moved = 0;
  /** Topo da barra de vida (px acima do pé), suavizado ao virar (a cabeça do cavalo sobe o topo em N, por exemplo). */
  private bar = NaN;

  constructor(readonly art: UnitArt, private lib: ArtLibrary, readonly type: string, readonly color: number, shadowLayer: Container, dir = 2) {
    this.dir = dir;
    const first = lib.frames(art, 'idle', dir)?.[0];
    this.body = new Sprite(first);
    this.body.anchor.set(art.anchor.x, art.anchor.y);
    this.root.addChild(this.body);
    if (art.team) {
      this.team = new Sprite(lib.teamFrames(art, 'idle', dir)?.[0]);
      this.team.anchor.set(art.anchor.x, art.anchor.y);
      this.team.tint = color;
      this.root.addChild(this.team);
    } else this.team = null;
    if (art.shadow) {
      this.shadow = new Sprite(lib.shadowFrames(art, 'idle', dir)?.[0]);
      this.shadow.anchor.set(art.anchor.x, art.anchor.y);
      this.shadow.alpha = SHADOW_ALPHA;
      this.shadow.blendMode = 'multiply';   // igual às sombras procedurais: um lote só na camada
      shadowLayer.addChild(this.shadow);
    } else this.shadow = null;
  }

  /** Posição do pé (px de mundo). */
  place(x: number, y: number): void {
    if (x === this.px && y === this.py) return;
    if (this.px === this.px) { const dx = x - this.px, dy = y - this.py; this.moved += Math.sqrt(dx * dx + dy * dy) / TILE; }
    this.px = x; this.py = y;
    this.root.position.set(x, y);
    this.shadow?.position.set(x, y);
    this.updateBounds();
  }

  /**
   * Muda animação/direção. `restart` recomeça do quadro 0 mesmo sem mudar de pose (cada golpe de ataque). Animações em
   * loop usam o relógio global (com a fase da unidade) e não precisam de reinício.
   */
  pose(anim: UnitAnim, dir: number, time: number, restart = false): void {
    const key = ANIM_INDEX[anim] * 8 + dir;
    if (key === this.poseKey && !restart) return;
    if (anim !== this.anim || restart) this.animStart = time;
    this.anim = anim; this.dir = dir; this.poseKey = key;
    const lib = this.lib, art = this.art;
    this.cur = lib.frames(art, anim, dir);
    this.curTeam = this.team ? lib.teamFrames(art, anim, dir) : null;
    this.curShadow = this.shadow ? lib.shadowFrames(art, anim, dir) : null;
    const m = isMirrored(art.mirrored, dir);
    if (m !== this.mirrored) {
      this.mirrored = m;
      // scale.x = −1 gira em torno da âncora: o pé fica no lugar (a sombra não espelha: continua caindo para SE)
      this.body.scale.x = m ? -1 : 1;
      if (this.team) this.team.scale.x = m ? -1 : 1;
    }
    this.frame = -1;
  }

  /**
   * Quadro da animação: nas de andar com passada (walk/run/carry), pela distância andada desde o último tick (`place`
   * antes); nas outras em loop, pelo tempo com a fase da unidade; ataque/morte/habilidade a partir de animStart.
   */
  tick(time: number, phase: number): void {
    const info = this.art.anims[this.anim];
    const list = this.cur;
    const moved = this.moved; this.moved = 0;
    if (!info || !list || list.length === 0) return;
    const loop = info.loop;
    let i: number;
    if (loop && info.stride && info.stride > 0) {
      this.stepPos = strideAdvance(this.stepPos, moved, info.stride, list.length);
      i = Math.floor(this.stepPos + phase * info.fps) % list.length;
    } else i = frameIndex(loop ? time + phase : time - this.animStart, list.length, info.fps, loop);
    if (i === this.frame) return;
    this.frame = i;
    this.body.texture = list[i];
    if (this.team) {
      // quadro sem máscara de time (ex.: um quadro da Q de Héracles de costas): esconde, em vez de deixar a do quadro anterior
      const t = this.curTeam?.[i];
      if (t) { this.team.texture = t; this.team.visible = true; } else this.team.visible = false;
    }
    const s = this.curShadow?.[i]; if (s && this.shadow) this.shadow.texture = s;
    this.updateBounds();
  }

  /** Topo do corpo na direção atual (px acima do pé; índice `tops`, sem armas finas), suavizado em ~0,1 s ao virar. */
  barTop(dt: number): number {
    const t = this.art.tops ? this.art.tops[this.dir] : this.art.top;
    if (this.bar !== this.bar) this.bar = t;
    else this.bar += (t - this.bar) * Math.min(1, dt * 12);
    return this.bar;
  }

  /** Terminou a animação sem loop (ataque, habilidade ou morte)? */
  finished(time: number): boolean {
    const info = this.art.anims[this.anim];
    return !info || (!info.loop && time - this.animStart >= info.frames / Math.max(1, info.fps));
  }

  /** Tints: corpo (flash de dano/bronze/cinza) e time (cor do jogador já composta com o flash). */
  tint(body: number, team: number): void {
    if (this.body.tint !== body) this.body.tint = body;
    if (this.team && this.team.tint !== team) this.team.tint = team;
  }
  /**
   * O ponto (px de mundo) cai num pixel opaco do quadro de cor atual? Primeiro a caixa do recorte, depois o alfa do atlas
   * (como no BuildingView): a helépole e a cavalaria não roubam o clique de quem aparece atrás delas pelos vãos. Espelhado,
   * a coluna do recorte conta da direita. Sem o alfa (sem DOM), só a caixa.
   */
  contains(x: number, y: number): boolean {
    if (!(x >= this.bx0 && x <= this.bx1 && y >= this.by0 && y <= this.by1)) return false;
    const m = textureAlpha(this.body.texture);
    return !m || maskHit(m, this.mirrored ? this.bx1 - x : x - this.bx0, y - this.by0);
  }
  set alpha(a: number) { this.root.alpha = a; if (this.shadow) this.shadow.alpha = this.shadowAlpha * a; }
  set visible(v: boolean) { this.root.visible = v; if (this.shadow) this.shadow.visible = v; }
  get visible(): boolean { return this.root.visible; }

  /** Caixa do quadro de cor atual (recorte, sem transparência; espelhada com o sprite) em px de mundo. */
  private updateBounds(): void {
    const b = frameBox(this.body.texture, this.art.anchor, this.mirrored, BOX);
    this.bx0 = this.px + b.x0; this.bx1 = this.px + b.x1;
    this.by0 = this.py + b.y0; this.by1 = this.py + b.y1;
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.shadow?.destroy();
  }
}
