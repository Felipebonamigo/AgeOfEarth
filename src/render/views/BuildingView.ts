// Vista de um edifício com arte assada (docs/ART.md §1.8, §3.7; genérica desde a Etapa 3): quadro do estado — obra
// (build0/1/2 pelo progresso), pronto, dano (damage1/2 pela vida), portão aberto — na variante pedida (bitmask da
// muralha, eixo do portão, Idade do Centro Cívico), estandartes pelo passe de time (tint = cor do jogador), sombra
// projetada na camada 'shadows'. A âncora é o centro da área ocupada (= x/y do edifício no núcleo). Um estado sem quadro
// cai no mais próximo (damage2 → damage1 → complete; open → complete); sem nem o complete, o renderizador usa o
// procedural. A vista guarda o bitmask da muralha (recalculado só quando a topologia das muralhas muda) e o acumulador
// da fumaça de dano. Um edifício com sobreposição animada (o vórtice do portal dos titãs) ganha um sprite aditivo por
// cima do corpo, criado só quando pedido (muralhas e casas não pagam o sprite extra).
import { Container, Sprite } from 'pixi.js';
import { SHADOW_ALPHA } from '../palette';
import type { ArtLibrary, BakedFrame } from '../art/ArtLibrary';
import { fallbackState, frameBox, type BuildingState } from '../art/logic';

export class BuildingView {
  readonly root = new Container();
  readonly body: Sprite;
  readonly team: Sprite;
  readonly shadow: Sprite;
  /** Estado pedido e variante atuais ('' = nenhum ainda). */
  state: BuildingState | '' = '';
  variant: string | null = null;
  /** Bitmask da muralha, a variante que ele dá (bitmask/eixo) e a versão da topologia em que foi calculado
   *  (renderer.wallVersion): recalculados só quando a topologia muda, sem string nova por quadro. */
  mask = 0;
  maskVariant: string | null = null;
  maskVersion = -1;
  /** Fração de baforada de fumaça acumulada entre quadros. */
  smokeAcc = 0;
  /** Caixa do quadro atual relativa ao centro (px): pick do telhado/fachada fora do footprint (ver contains()). */
  lx0 = 0; ly0 = 0; lx1 = 0; ly1 = 0;
  /** Topo visível do quadro atual acima do centro (px): barra de vida/obra acima do telhado. */
  top = 0;
  private px = 0; private py = 0;
  private hasShadow = false;
  private glowSprite: Sprite | null = null;

  constructor(private lib: ArtLibrary, readonly type: string, readonly color: number, shadowLayer: Container) {
    this.body = new Sprite(); this.team = new Sprite(); this.shadow = new Sprite();
    this.team.tint = color;
    this.root.addChild(this.body, this.team);
    this.shadow.alpha = SHADOW_ALPHA; this.shadow.blendMode = 'multiply';
    shadowLayer.addChild(this.shadow);
  }

  /** Troca o quadro quando o estado ou a variante mudam; false se nem o `complete` tiver quadro (procedural). */
  show(state: BuildingState, variant: string | null = null): boolean {
    // chamado a cada quadro para cada edifício na tela: comparação direta, sem montar chave
    if (state === this.state && variant === this.variant) return true;
    let st: BuildingState | null = state, f: BakedFrame | null = null;
    while (st && !(f = this.lib.building(this.type, st, variant))) st = fallbackState(st);
    if (!f) return false;
    this.state = state; this.variant = variant;
    for (const s of [this.body, this.team, this.shadow]) s.anchor.set(f.anchor.x, f.anchor.y);
    this.body.texture = f.color;
    this.team.visible = !!f.team; if (f.team) this.team.texture = f.team;
    this.hasShadow = !!f.shadow; if (f.shadow) this.shadow.texture = f.shadow;
    this.shadow.visible = this.root.visible && this.hasShadow;
    const b = frameBox(f.color, f.anchor, false, { x0: 0, y0: 0, x1: 0, y1: 0 });
    this.top = -b.y0;
    this.lx0 = b.x0; this.lx1 = b.x1; this.ly0 = b.y0; this.ly1 = b.y1;
    return true;
  }

  /** Centro do edifício (px de mundo). */
  place(x: number, y: number): void {
    if (x === this.px && y === this.py) return;
    this.px = x; this.py = y;
    this.root.position.set(x, y);
    this.shadow.position.set(x, y);
  }
  get x(): number { return this.px; }
  get y(): number { return this.py; }
  /** O ponto (px de mundo) cai na caixa do quadro atual? */
  contains(x: number, y: number): boolean {
    return x >= this.px + this.lx0 && x <= this.px + this.lx1 && y >= this.py + this.ly0 && y <= this.py + this.ly1;
  }

  /** Quadro da sobreposição animada (blend aditivo, mesma âncora do corpo) ou null para escondê-la. */
  showGlow(f: BakedFrame | null): void {
    if (!f) { if (this.glowSprite) this.glowSprite.visible = false; return; }
    let g = this.glowSprite;
    if (!g) { g = this.glowSprite = new Sprite(); g.blendMode = 'add'; g.tint = this.body.tint; this.root.addChild(g); }
    if (g.texture !== f.color) { g.texture = f.color; g.anchor.set(f.anchor.x, f.anchor.y); }
    g.visible = true;
  }

  tint(body: number, team: number): void {
    if (this.body.tint !== body) { this.body.tint = body; if (this.glowSprite) this.glowSprite.tint = body; }
    if (this.team.tint !== team) this.team.tint = team;
  }
  set visible(v: boolean) { this.root.visible = v; this.shadow.visible = v && this.hasShadow; }
  get visible(): boolean { return this.root.visible; }

  destroy(): void {
    this.root.destroy({ children: true });
    this.shadow.destroy();
  }
}
