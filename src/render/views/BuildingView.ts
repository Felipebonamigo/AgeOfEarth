// Vista de um edifício com arte assada (docs/ART.md §1.8, §3.7): quadro do estágio de obra (build0/1/2 pelo progresso)
// ou completo, estandartes pelo passe de time (tint = cor do jogador), sombra projetada na camada 'shadows'. A âncora é
// o centro da área ocupada (= x/y do edifício no núcleo). Só o templo tem arte nesta etapa; os demais seguem procedurais.
import { Container, Sprite } from 'pixi.js';
import { SHADOW_ALPHA } from '../palette';
import type { ArtLibrary, BakedFrame } from '../art/ArtLibrary';
import type { BuildStage } from '../art/logic';

export class BuildingView {
  readonly root = new Container();
  readonly body: Sprite;
  readonly team: Sprite;
  readonly shadow: Sprite;
  stage: BuildStage | '' = '';
  /** Caixa do quadro atual relativa ao centro (px): pick do telhado/fachada fora do footprint (ver contains()). */
  private lx0 = 0; private ly0 = 0; private lx1 = 0; private ly1 = 0;
  /** Topo visível do quadro atual acima do centro (px): barra de vida/obra acima do telhado. */
  top = 0;
  private px = 0; private py = 0;
  private hasShadow = false;

  constructor(private lib: ArtLibrary, readonly type: string, readonly color: number, shadowLayer: Container) {
    this.body = new Sprite(); this.team = new Sprite(); this.shadow = new Sprite();
    this.team.tint = color;
    this.root.addChild(this.body, this.team);
    this.shadow.alpha = SHADOW_ALPHA; this.shadow.blendMode = 'multiply';
    shadowLayer.addChild(this.shadow);
  }

  /** Troca o quadro quando o estágio muda; devolve false se não houver quadro assado (o renderizador cai no procedural). */
  setStage(stage: BuildStage): boolean {
    if (stage === this.stage) return true;
    const f: BakedFrame | null = this.lib.building(this.type, stage);
    if (!f) return false;
    this.stage = stage;
    for (const s of [this.body, this.team, this.shadow]) s.anchor.set(f.anchor.x, f.anchor.y);
    this.body.texture = f.color;
    this.team.visible = !!f.team; if (f.team) this.team.texture = f.team;
    this.hasShadow = !!f.shadow; if (f.shadow) this.shadow.texture = f.shadow;
    this.shadow.visible = this.root.visible && this.hasShadow;
    const tex = f.color, ay = f.anchor.y * tex.orig.height, ax = f.anchor.x * tex.orig.width;
    const tx = tex.trim ? tex.trim.x : 0, ty = tex.trim ? tex.trim.y : 0;
    const tw = tex.trim ? tex.trim.width : tex.orig.width, th = tex.trim ? tex.trim.height : tex.orig.height;
    this.top = ay - ty;
    this.lx0 = tx - ax; this.lx1 = tx + tw - ax; this.ly0 = ty - ay; this.ly1 = ty + th - ay;
    return true;
  }

  /** Centro do edifício (px de mundo). */
  place(x: number, y: number): void {
    if (x === this.px && y === this.py) return;
    this.px = x; this.py = y;
    this.root.position.set(x, y);
    this.shadow.position.set(x, y);
  }
  /** O ponto (px de mundo) cai na caixa do quadro atual? */
  contains(x: number, y: number): boolean {
    return x >= this.px + this.lx0 && x <= this.px + this.lx1 && y >= this.py + this.ly0 && y <= this.py + this.ly1;
  }

  tint(body: number, team: number): void {
    if (this.body.tint !== body) this.body.tint = body;
    if (this.team.tint !== team) this.team.tint = team;
  }
  set visible(v: boolean) { this.root.visible = v; this.shadow.visible = v && this.hasShadow; }
  get visible(): boolean { return this.root.visible; }

  destroy(): void {
    this.root.destroy({ children: true });
    this.shadow.destroy();
  }
}
