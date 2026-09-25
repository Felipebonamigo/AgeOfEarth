// Geração procedural de texturas (sem arquivos de arte): recursos, unidades e edifícios — o placeholder até a arte
// assada da Fase 2 (docs/ART.md). O terreno é desenhado por shader (terrain/*). Paleta terrosa e materiais de
// palette.ts; nenhuma sombra é assada nos sprites de unidades/edifícios (elas vivem na camada 'shadows'); os nós vêm de
// um atlas único (NODE_VARIANTS variantes por tipo) com a sombra SE já desenhada no quadro, pela regra de shadows.ts.
import { Container, Graphics, Rectangle, Texture, type Renderer } from 'pixi.js';
import { TILE, type NodeType } from '../core/constants';
import { BUILDINGS, UNITS } from '../core/data';
import { MATERIALS, SHADOW_ALPHA, hash01, mixColor, scaleColor, teamTint } from './palette';
import { nodeShadow } from './shadows';

const { skin: SKIN, skinDark: SKIN_DARK, wood: WOOD, woodDark: WOOD_DARK, stone: STONE, stoneDark: STONE_DARK, marble: MARBLE, terracotta: TERRACOTTA, gold: GOLD, bronze: BRONZE, iron: IRON, linen: LINEN, leather: LEATHER } = MATERIALS;
const DARK = 0x2a2622;

export const darken = scaleColor;

/** Tipos de nó no atlas (linhas) e variantes por tipo (colunas). */
const NODE_TYPES: readonly NodeType[] = ['tree', 'berry', 'gold', 'deer', 'boar', 'lure'];
export const NODE_VARIANTS = 8;
/** Lado (px) da célula do atlas de nós: cabe a copa (± 16 px) e a sombra SE deslocada (até ≈ 24 px do centro). */
const NODE_CELL = 56;
/** O desenho do nó fica NODE_LIFT px acima do ponto de âncora (o centro do tile), como o antigo anchor (0,5; 0,6) de 51 px. */
const NODE_LIFT = 5;
/** Âncora dos sprites de nó: o centro do tile cai NODE_LIFT px abaixo do centro do desenho. */
export const NODE_ANCHOR = { x: 0.5, y: (NODE_CELL / 2 + NODE_LIFT) / NODE_CELL } as const;
export const mix = mixColor;

export class TextureCache {
  private cache = new Map<string, Texture>();
  constructor(private renderer: Renderer) {}

  private make(key: string, size: number, draw: (g: Graphics) => void, resolution = 2, w = size, h = size): Texture {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const g = new Graphics();
    draw(g);
    const tex = this.renderer.generateTexture({ target: g, resolution, frame: new Rectangle(-w / 2, -h / 2, w, h), antialias: true });
    g.destroy();
    this.cache.set(key, tex);
    return tex;
  }

  // ---------------- Nós ----------------
  private nodeAtlas: Texture | null = null;
  private nodeFrames = new Map<string, Texture>();
  /**
   * Quadro do nó `type` com a variação `variant` (decor 0–255, quantizada em NODE_VARIANTS): todos os quadros vêm de
   * UMA textura (gerada uma vez), então milhares de nós são desenhados em poucos lotes. Âncora: NODE_ANCHOR.
   */
  node(type: string, variant: number): Texture {
    const v = Math.min(NODE_VARIANTS - 1, Math.max(0, Math.floor((variant & 255) * NODE_VARIANTS / 256)));
    const key = `${type}:${v}`;
    const hit = this.nodeFrames.get(key);
    if (hit) return hit;
    const atlas = this.nodeAtlas ?? (this.nodeAtlas = this.buildNodeAtlas());
    const row = NODE_TYPES.indexOf(type as NodeType);
    const tex = new Texture({ source: atlas.source, frame: new Rectangle(v * NODE_CELL, Math.max(0, row) * NODE_CELL, NODE_CELL, NODE_CELL) });
    this.nodeFrames.set(key, tex);
    return tex;
  }
  /** Atlas NODE_VARIANTS × NODE_TYPES células de NODE_CELL px: sombra SE (elíptica, borda macia) e o nó por cima. */
  private buildNodeAtlas(): Texture {
    // um Graphics para as sombras e um por nó, num Container (Graphics não aceita filhos no Pixi 8)
    const root = new Container(), g = new Graphics();
    root.addChild(g);
    NODE_TYPES.forEach((type, row) => {
      for (let v = 0; v < NODE_VARIANTS; v++) {
        const ox = v * NODE_CELL + NODE_CELL / 2, oy = row * NODE_CELL + NODE_CELL / 2;
        const sh = nodeShadow(type, 1);
        if (sh) {
          const cx = ox + sh.dx, cy = oy + NODE_LIFT + sh.dy;
          g.ellipse(cx, cy, sh.rx + 1.5, sh.ry + 1).fill({ color: 0x000000, alpha: SHADOW_ALPHA * 0.4 });
          g.ellipse(cx, cy, sh.rx - 0.5, sh.ry - 0.4).fill({ color: 0x000000, alpha: SHADOW_ALPHA * 0.62 });
        }
        const node = new Graphics();
        drawNode(node, type, Math.round((v + 0.5) * 256 / NODE_VARIANTS));
        node.position.set(ox, oy);
        root.addChild(node);
      }
    });
    const tex = this.renderer.generateTexture({ target: root, resolution: 2, frame: new Rectangle(0, 0, NODE_VARIANTS * NODE_CELL, NODE_TYPES.length * NODE_CELL), antialias: true });
    root.destroy({ children: true });
    return tex;
  }
  // ---------------- Unidades ----------------
  unit(type: string, color: number): Texture {
    const def = UNITS[type];
    const size = Math.ceil(def.radius * TILE * 2 * 2.6);
    return this.make(`unit:${type}:${color}`, size, (g) => drawUnit(g, type, color), 2);
  }
  // ---------------- Edifícios ----------------
  building(type: string, color: number, complete: boolean): Texture {
    const def = BUILDINGS[type];
    const w = def.w * TILE, h = def.h * TILE;
    return this.make(`bld:${type}:${color}:${complete ? 1 : 0}`, w, (g) => (complete ? drawBuilding(g, type, color) : drawConstruction(g, type, color)), 2, w, h);
  }
  // ---------------- Sombras (camada 'shadows'; o sprite recebe alpha SHADOW_ALPHA e blend multiply) ----------------
  /** Elipse preta de bordas macias; rx/ry arredondados ao meio px para o cache não explodir. */
  shadowEllipse(rx: number, ry: number): Texture {
    const a = Math.round(rx * 2) / 2, b = Math.round(ry * 2) / 2;
    return this.make(`shE:${a}:${b}`, 0, (g) => {
      g.ellipse(0, 0, a + 2, b + 1.5).fill({ color: 0x000000, alpha: 0.35 });
      g.ellipse(0, 0, a + 0.8, b + 0.6).fill({ color: 0x000000, alpha: 0.5 });
      g.ellipse(0, 0, Math.max(1, a - 0.5), Math.max(1, b - 0.4)).fill({ color: 0x000000, alpha: 0.8 });
    }, 2, a * 2 + 6, b * 2 + 5);
  }
  /** Retângulo preto arredondado (footprint de edifício) de bordas macias. */
  shadowRect(w: number, h: number): Texture {
    return this.make(`shR:${w}:${h}`, 0, (g) => {
      g.roundRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 6).fill({ color: 0x000000, alpha: 0.35 });
      g.roundRect(-w / 2 - 0.8, -h / 2 - 0.8, w + 1.6, h + 1.6, 5).fill({ color: 0x000000, alpha: 0.5 });
      g.roundRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1, 4).fill({ color: 0x000000, alpha: 0.8 });
    }, 2, w + 6, h + 6);
  }
  circle(radius: number, color: number, width = 2, alpha = 1): Texture {
    return this.make(`circle:${radius}:${color}:${width}:${alpha}`, radius * 2 + width * 2 + 2, (g) => { g.circle(0, 0, radius).stroke({ width, color, alpha }); }, 2);
  }
  disc(radius: number, color: number, alpha = 1): Texture {
    return this.make(`disc:${radius}:${color}:${alpha}`, radius * 2 + 2, (g) => { g.circle(0, 0, radius).fill({ color, alpha }); }, 2);
  }
  arrow(kind: string): Texture {
    return this.make(`proj:${kind}`, 16, (g) => {
      if (kind === 'rock') g.circle(0, 0, 4).fill(STONE_DARK).circle(-1, -1, 1.5).fill(STONE);
      else if (kind === 'bolt') g.circle(0, 0, 3).fill(0x7dd3fc).circle(0, 0, 1.5).fill(0xffffff);
      else g.moveTo(-6, 0).lineTo(6, 0).stroke({ width: 1.5, color: 0x3b2a1a }).poly([6, 0, 3, -2, 3, 2]).fill(IRON).moveTo(-6, -2).lineTo(-4, 0).lineTo(-6, 2).stroke({ width: 1, color: 0xeeeeee });
    }, 2);
  }
  extractDataURL(tex: Texture): string {
    return this.renderer.extract.base64({ target: tex, format: 'png' }) as unknown as string;
  }
}

// ---------------- Nós (a sombra SE é desenhada no mesmo quadro do atlas, pela regra de shadows.ts) ----------------
function drawNode(g: Graphics, type: string, variant: number) {
  const v = variant / 255;
  switch (type) {
    case 'tree': {
      g.rect(-2, 2, 4, 8).fill(WOOD_DARK);
      const c1 = mix(0x3f5a22, 0x4d6b2a, v), c2 = mix(0x6a8a3a, 0x7a9a44, v), c3 = scaleColor(c1, 0.78);
      g.circle(-4, -3, 8).fill(c1); g.circle(5, -2, 8).fill(c1); g.circle(0, -8, 8).fill(c1);
      g.circle(6, 1, 6).fill({ color: c3, alpha: 0.6 }); g.circle(-2, 2, 5).fill({ color: c3, alpha: 0.45 });   // lado sudeste na sombra
      g.circle(-5, -7, 5).fill(c2); g.circle(2, -10, 4).fill(c2);                                                // topo noroeste ao sol
      break;
    }
    case 'berry': {
      g.circle(-4, 0, 7).fill(0x40602a); g.circle(4, -1, 7).fill(0x4a6e30); g.circle(-1, -6, 6).fill(0x5a7e3a);
      g.circle(4, 2, 4).fill({ color: 0x33501f, alpha: 0.6 });
      for (let i = 0; i < 7; i++) g.circle(-7 + hash01(i, variant, 1) * 14, -8 + hash01(i, variant, 2) * 12, 1.6).fill(0xb8303a);
      break;
    }
    case 'gold': {
      g.poly([-12, 6, -6, -6, 2, -2, 6, -9, 13, 6]).fill(STONE).poly([-6, -6, 2, -2, -1, 6, -8, 6]).fill(STONE_DARK);
      g.poly([6, -9, 13, 6, 4, 6]).fill(scaleColor(STONE, 0.85));
      for (let i = 0; i < 5; i++) g.circle(-8 + hash01(i, variant, 3) * 16, -3 + hash01(i, variant, 4) * 7, 1.8).fill(GOLD);
      break;
    }
    case 'deer': {
      for (let k = 0; k < 2; k++) {
        const ox = k === 0 ? -6 : 6, oy = k === 0 ? -3 : 4;
        g.ellipse(ox, oy, 7, 3.5).fill(0x8a6238); g.circle(ox + 6, oy - 1, 2.5).fill(0x7a542c);
        g.moveTo(ox + 7, oy - 3).lineTo(ox + 9, oy - 6).moveTo(ox + 7, oy - 3).lineTo(ox + 5, oy - 6).stroke({ width: 1, color: 0x4a3219 });
        g.circle(ox - 2, oy - 1, 1).fill(0xe8dcc0);
      }
      break;
    }
    case 'boar': { g.ellipse(0, 0, 8, 4.5).fill(0x4a3320); g.circle(7, 0, 3).fill(0x3d2a1a); g.moveTo(9, 1).lineTo(11, -1).stroke({ width: 1.2, color: 0xe8dcc0 }); break; }
    case 'lure': { g.poly([-9, 7, -5, -8, 5, -9, 10, 7]).fill(0x3d7ea6).poly([-5, -8, 5, -9, 2, 0]).fill(0x7fc3e8); g.circle(0, -1, 2).fill(0xdff6ff); break; }
  }
}

// ---------------- Unidades (vistas de cima, olhando para +x; sem sombra assada) ----------------
function drawUnit(g: Graphics, type: string, color: number) {
  const def = UNITS[type];
  const r = def.radius * TILE;
  const team = teamTint(color);
  const humanoid = (tunic: number, head: number = SKIN) => {
    g.ellipse(0, 0, r * 0.75, r).fill(tunic).ellipse(0, 0, r * 0.75, r).stroke({ width: 1, color: darken(tunic, 0.6) });
    g.circle(r * 0.15, 0, r * 0.48).fill(head).circle(r * 0.15, 0, r * 0.48).stroke({ width: 0.8, color: SKIN_DARK });
  };
  const spear = (len: number) => g.moveTo(-r * 0.3, r * 0.6).lineTo(len, r * 0.6).stroke({ width: 1.5, color: WOOD }).poly([len, r * 0.6 - 2, len + 4, r * 0.6, len, r * 0.6 + 2]).fill(BRONZE);
  const shield = (rad: number, c: number) => g.circle(r * 0.1, -r * 0.75, rad).fill(c).circle(r * 0.1, -r * 0.75, rad).stroke({ width: 1, color: darken(c, 0.5) }).circle(r * 0.1, -r * 0.75, rad * 0.35).fill(MATERIALS.bronzeLight);
  const bow = () => g.moveTo(r * 0.9, -r * 0.8).quadraticCurveTo(r * 1.5, 0, r * 0.9, r * 0.8).stroke({ width: 1.5, color: WOOD }).moveTo(r * 0.9, -r * 0.8).lineTo(r * 0.9, r * 0.8).stroke({ width: 0.8, color: LINEN });
  const horse = (c: number) => { g.ellipse(0, 0, r * 1.05, r * 0.55).fill(c).ellipse(0, 0, r * 1.05, r * 0.55).stroke({ width: 1, color: darken(c, 0.6) }); g.ellipse(r * 1.0, 0, r * 0.35, r * 0.25).fill(darken(c, 0.9)); g.moveTo(-r * 1.0, 0).lineTo(-r * 1.4, r * 0.2).stroke({ width: 2, color: darken(c, 0.7) }); };
  const marker = () => g.circle(0, 0, r * 1.05).stroke({ width: 1.5, color, alpha: 0.9 });
  switch (type) {
    case 'villager': humanoid(mix(LINEN, team, 0.35)); g.moveTo(r * 0.5, r * 0.7).lineTo(r * 1.1, r * 0.2).stroke({ width: 1.5, color: WOOD }).rect(r * 1.0, r * 0.05, 4, 3).fill(IRON); break;
    case 'kataskopos': horse(0x7a5a3a); g.circle(-r * 0.1, 0, r * 0.4).fill(team); g.circle(0, 0, r * 0.25).fill(SKIN); break;
    case 'hoplite': humanoid(team); shield(r * 0.55, mix(team, BRONZE, 0.45)); spear(r * 1.4); g.rect(-r * 0.1, -r * 0.45, r * 0.5, 2).fill(0xa8322f); break;
    case 'hypaspist': humanoid(darken(team, 0.85)); shield(r * 0.6, mix(team, IRON, 0.5)); spear(r * 1.2); g.circle(r * 0.15, 0, r * 0.5).stroke({ width: 1.5, color: BRONZE }); break;
    case 'myrmidon': humanoid(darken(team, 0.8)); shield(r * 0.62, DARK); spear(r * 1.3); g.circle(r * 0.15, 0, r * 0.5).stroke({ width: 2, color: GOLD }); break;
    case 'militia': humanoid(mix(team, LEATHER, 0.5)); g.moveTo(r * 0.3, r * 0.6).lineTo(r * 1.2, r * 0.6).stroke({ width: 2, color: WOOD }); break;
    case 'toxotes': humanoid(team); bow(); g.rect(-r * 0.9, -r * 0.4, r * 0.4, r * 0.8).fill(LEATHER); break;
    case 'cretan_archer': humanoid(darken(team, 0.9)); bow(); g.rect(-r * 0.9, -r * 0.4, r * 0.4, r * 0.8).fill(LEATHER); g.circle(r * 0.15, 0, r * 0.5).stroke({ width: 1.2, color: GOLD }); break;
    case 'peltast': humanoid(team); g.poly([r * 0.1, -r * 0.9, r * 0.5, -r * 0.4, -r * 0.3, -r * 0.4]).fill(mix(team, WOOD, 0.5)); g.moveTo(r * 0.3, r * 0.5).lineTo(r * 1.3, r * 0.3).stroke({ width: 1.2, color: WOOD }); break;
    case 'hippeus': horse(0x5e4228); g.circle(-r * 0.1, 0, r * 0.42).fill(team); g.circle(0, 0, r * 0.26).fill(SKIN); spear(r * 1.5); break;
    case 'hetairoi': horse(0x3b2a1a); g.circle(-r * 0.1, 0, r * 0.45).fill(team); g.circle(0, 0, r * 0.26).fill(SKIN); g.circle(-r * 0.1, 0, r * 0.45).stroke({ width: 1.5, color: BRONZE }); spear(r * 1.5); break;
    case 'petrobolos': g.rect(-r, -r * 0.7, r * 2, r * 1.4).fill(WOOD).rect(-r, -r * 0.7, r * 2, r * 1.4).stroke({ width: 1, color: WOOD_DARK }); g.moveTo(-r * 0.6, 0).lineTo(r * 1.1, 0).stroke({ width: 3, color: WOOD_DARK }); g.circle(r * 1.1, 0, r * 0.35).fill(STONE_DARK); g.rect(-r * 0.9, -r * 0.9, r * 0.5, r * 0.25).fill(team).rect(-r * 0.9, r * 0.65, r * 0.5, r * 0.25).fill(team); break;
    case 'helepolis': g.rect(-r, -r, r * 2, r * 2).fill(WOOD_DARK).rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6).fill(WOOD); g.rect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2).fill(IRON); g.rect(-r, -r, r * 2, r * 0.25).fill(team); g.rect(r * 0.6, -r * 0.3, r * 0.6, r * 0.6).fill(IRON); break;
    case 'jason': case 'odysseus': case 'heracles': case 'achilles': case 'perseus': {
      const cape = { jason: 0xc09a2e, odysseus: 0x2f4a8a, heracles: 0x7a4a26, achilles: 0x9a2a26, perseus: 0x1f6a62 }[type] ?? GOLD;
      g.ellipse(-r * 0.3, 0, r * 0.8, r * 1.05).fill(cape);
      humanoid(team);
      if (type === 'odysseus') bow(); else if (type === 'heracles') g.moveTo(r * 0.3, r * 0.6).lineTo(r * 1.4, r * 0.9).stroke({ width: 4, color: WOOD_DARK }); else { spear(r * 1.4); shield(r * 0.55, GOLD); }
      g.circle(r * 0.15, 0, r * 0.6).stroke({ width: 2, color: GOLD, alpha: 0.9 });
      break;
    }
    case 'pegasus': g.ellipse(0, 0, r * 1.0, r * 0.5).fill(0xf0ece2); g.ellipse(-r * 0.2, -r * 0.9, r * 0.9, r * 0.35).fill({ color: 0xf8f6f0, alpha: 0.9 }); g.ellipse(-r * 0.2, r * 0.9, r * 0.9, r * 0.35).fill({ color: 0xf8f6f0, alpha: 0.9 }); g.ellipse(r * 0.95, 0, r * 0.3, r * 0.22).fill(0xd8d4c8); marker(); break;
    case 'minotaur': g.ellipse(0, 0, r * 0.9, r * 1.0).fill(0x5e3d22); g.circle(r * 0.3, 0, r * 0.55).fill(0x452b16); g.moveTo(r * 0.4, -r * 0.5).quadraticCurveTo(r * 1.1, -r * 0.9, r * 0.9, -r * 0.2).moveTo(r * 0.4, r * 0.5).quadraticCurveTo(r * 1.1, r * 0.9, r * 0.9, r * 0.2).stroke({ width: 2.5, color: 0xe6d8bc }); g.moveTo(-r * 0.2, r * 0.7).lineTo(r * 0.9, r * 1.1).stroke({ width: 3, color: IRON }); marker(); break;
    case 'centaur': horse(0x7a5232); g.ellipse(r * 0.4, 0, r * 0.4, r * 0.55).fill(SKIN); g.circle(r * 0.55, 0, r * 0.28).fill(SKIN_DARK); bow(); marker(); break;
    case 'cyclops': g.ellipse(0, 0, r * 0.85, r * 1.0).fill(0x8c7a5e); g.circle(r * 0.25, 0, r * 0.55).fill(0xa08c6d); g.circle(r * 0.45, 0, r * 0.18).fill(0xf4f0e6).circle(r * 0.5, 0, r * 0.09).fill(0x1e293b); g.moveTo(-r * 0.4, r * 0.7).lineTo(r * 0.9, r * 1.2).stroke({ width: 4, color: WOOD_DARK }); marker(); break;
    case 'manticore': g.ellipse(0, 0, r * 1.0, r * 0.6).fill(0xa8420e); g.circle(r * 0.8, 0, r * 0.4).fill(0x8a3412); g.moveTo(-r * 0.9, 0).quadraticCurveTo(-r * 1.6, -r * 0.6, -r * 1.3, -r * 1.0).stroke({ width: 2.5, color: 0x2a2622 }); g.circle(-r * 1.3, -r * 1.0, r * 0.15).fill(0x84cc16); marker(); break;
    case 'hydra': g.ellipse(-r * 0.2, 0, r * 0.9, r * 0.7).fill(0x1f5a30); for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; g.moveTo(r * 0.3, 0).quadraticCurveTo(r * 0.9, a * r * 1.2, r * 1.2, a * r * 1.4).stroke({ width: 3, color: 0x2a7a3c }); g.circle(r * 1.2, a * r * 1.4, r * 0.18).fill(0x3fa050); } marker(); break;
    case 'nemean_lion': g.ellipse(0, 0, r * 1.0, r * 0.6).fill(0xc09a2a); g.circle(r * 0.7, 0, r * 0.55).fill(0x8a5e14); g.circle(r * 0.8, 0, r * 0.32).fill(0xc09a2a); marker(); break;
    case 'medusa': humanoid(0x4d6c1a, 0x9ac846); for (let i = 0; i < 6; i++) { const a = -1 + i * 0.4; g.moveTo(r * 0.1, 0).quadraticCurveTo(-r * 0.4, a * r, -r * 0.9, a * r * 1.1).stroke({ width: 1.5, color: 0x365314 }); } bow(); marker(); break;
    case 'colossus': g.rect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4).fill(BRONZE).rect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4).stroke({ width: 2, color: darken(BRONZE, 0.6) }); g.circle(r * 0.35, 0, r * 0.45).fill(MATERIALS.bronzeLight); g.rect(r * 0.7, -r * 0.15, r * 0.7, r * 0.3).fill(darken(BRONZE, 0.8)); marker(); break;
    case 'chimera': g.ellipse(0, 0, r * 1.0, r * 0.6).fill(0xa04e0a); g.circle(r * 0.75, -r * 0.25, r * 0.38).fill(0x82400e); g.circle(r * 0.75, r * 0.3, r * 0.3).fill(0x365314); g.moveTo(-r * 0.9, 0).quadraticCurveTo(-r * 1.5, r * 0.5, -r * 1.2, r * 1.0).stroke({ width: 2.5, color: 0x1f5a30 }); g.poly([r * 1.1, -r * 0.3, r * 1.7, -r * 0.4, r * 1.3, -r * 0.05]).fill(0xe8701a); marker(); break;
    case 'cerberus': g.ellipse(0, 0, r * 1.0, r * 0.6).fill(0x2a2622); for (const a of [-0.55, 0, 0.55]) g.circle(r * 0.85, a * r, r * 0.3).fill(0x1a1614).circle(r * 1.0, a * r, r * 0.08).fill(0xd8302a); marker(); break;
    case 'sentinel': g.rect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2).fill(STONE_DARK).rect(-r * 0.45, -r * 0.45, r * 0.9, r * 0.9).fill(STONE); g.circle(r * 0.2, 0, r * 0.35).fill(STONE_DARK); bow(); marker(); break;
    case 'shade': g.ellipse(0, 0, r * 0.75, r).fill({ color: 0x94a3b8, alpha: 0.55 }); g.circle(r * 0.15, 0, r * 0.45).fill({ color: 0xe2e8f0, alpha: 0.6 }); g.moveTo(r * 0.3, r * 0.5).lineTo(r * 1.2, r * 0.5).stroke({ width: 1.5, color: 0xcbd5e1, alpha: 0.7 }); marker(); break;
    case 'prometheus': case 'oceanus': case 'cronus': {
      const c = type === 'prometheus' ? 0xb8281e : type === 'oceanus' ? 0x1a5f8a : 0x4a2680;
      g.circle(0, 0, r * 1.05).fill({ color: c, alpha: 0.25 });
      g.ellipse(0, 0, r * 0.75, r * 0.95).fill(darken(c, 0.9)).ellipse(0, 0, r * 0.75, r * 0.95).stroke({ width: 3, color: darken(c, 0.5) });
      g.circle(r * 0.2, 0, r * 0.45).fill(mix(c, 0xffffff, 0.35));
      g.circle(r * 0.35, 0, r * 0.1).fill(0xfef08a);
      g.moveTo(-r * 0.3, r * 0.6).lineTo(r * 1.5, r * 0.9).stroke({ width: 6, color: darken(c, 0.6) });
      marker();
      break;
    }
    default: humanoid(team);
  }
}

// ---------------- Edifícios (vista de cima com leve relevo; sem sombra assada) ----------------
function roof(g: Graphics, x: number, y: number, w: number, h: number, c: number) {
  g.rect(x, y, w, h).fill(c);
  g.rect(x, y, w, h / 2).fill(darken(c, 1.12));
  g.moveTo(x, y + h / 2).lineTo(x + w, y + h / 2).stroke({ width: 1.5, color: darken(c, 0.7) });
  for (let i = 1; i < 6; i++) g.moveTo(x + (w * i) / 6, y).lineTo(x + (w * i) / 6, y + h).stroke({ width: 0.8, color: darken(c, 0.82), alpha: 0.7 });
}
function columns(g: Graphics, x: number, y: number, w: number, h: number, n: number) {
  for (let i = 0; i < n; i++) { const px = x + (w * (i + 0.5)) / n; g.circle(px, y, 2.2).fill(MARBLE).circle(px, y, 2.2).stroke({ width: 0.8, color: STONE_DARK }); g.circle(px, y + h, 2.2).fill(MARBLE).circle(px, y + h, 2.2).stroke({ width: 0.8, color: STONE_DARK }); }
}
function banner(g: Graphics, x: number, y: number, color: number) { g.rect(x, y, 3, 10).fill(WOOD_DARK); g.poly([x + 3, y, x + 12, y + 3, x + 3, y + 6]).fill(color); }

function drawBuilding(g: Graphics, type: string, color: number) {
  const def = BUILDINGS[type];
  const W = def.w * TILE, H = def.h * TILE, x0 = -W / 2, y0 = -H / 2;
  const P = 3;
  const team = teamTint(color);
  const base = (c: number, inset = P) => {
    g.rect(x0 + inset, y0 + inset, W - inset * 2, H - inset * 2).fill(c).rect(x0 + inset, y0 + inset, W - inset * 2, H - inset * 2).stroke({ width: 1.5, color: darken(c, 0.55) });
    // relevo: face noroeste ao sol, face sudeste na sombra
    g.moveTo(x0 + inset, y0 + H - inset).lineTo(x0 + inset, y0 + inset).lineTo(x0 + W - inset, y0 + inset).stroke({ width: 2, color: darken(c, 1.15), alpha: 0.8 });
    g.moveTo(x0 + W - inset, y0 + inset).lineTo(x0 + W - inset, y0 + H - inset).lineTo(x0 + inset, y0 + H - inset).stroke({ width: 2, color: darken(c, 0.72), alpha: 0.8 });
  };
  switch (type) {
    case 'town_center': {
      base(STONE);
      g.rect(x0 + 14, y0 + 14, W - 28, H - 28).fill(0xc8a878);
      g.rect(x0 + W / 2 - 4, y0 + 8, 8, H - 16).fill(0xb89868).rect(x0 + 8, y0 + H / 2 - 4, W - 16, 8).fill(0xb89868);
      for (const [cx, cy] of [[x0 + 10, y0 + 10], [x0 + W - 10, y0 + 10], [x0 + 10, y0 + H - 10], [x0 + W - 10, y0 + H - 10]]) { g.circle(cx, cy, 8).fill(STONE_DARK).circle(cx, cy, 6).fill(STONE); }
      roof(g, x0 + W / 2 - 16, y0 + H / 2 - 12, 32, 24, TERRACOTTA);
      banner(g, x0 + W / 2 - 1, y0 + H / 2 - 24, color);
      break;
    }
    case 'house': base(MARBLE); roof(g, x0 + 6, y0 + 6, W - 12, H - 12, TERRACOTTA); g.rect(x0 + W / 2 - 3, y0 + H - 9, 6, 4).fill(WOOD_DARK); banner(g, x0 + W - 12, y0 + 4, color); break;
    case 'farm': {
      g.rect(x0, y0, W, H).fill(0x7a5e34);
      for (let i = 0; i < 6; i++) { const y = y0 + 5 + i * ((H - 10) / 5); g.moveTo(x0 + 4, y).lineTo(x0 + W - 4, y).stroke({ width: 3, color: 0x8fa23a }); }
      g.rect(x0, y0, W, H).stroke({ width: 1.5, color: WOOD_DARK });
      break;
    }
    case 'granary': base(0xc9b38a); roof(g, x0 + 6, y0 + 6, W - 12, H - 12, 0xb8923e); for (let i = 0; i < 5; i++) g.circle(x0 + 10 + i * 10, y0 + H - 10, 3).fill(0xd9c15c); banner(g, x0 + W - 10, y0 + 3, color); break;
    case 'lumber_camp': base(WOOD); for (let i = 0; i < 4; i++) g.circle(x0 + 12 + i * 11, y0 + 14, 5).fill(0xb98a4b).circle(x0 + 12 + i * 11, y0 + 14, 5).stroke({ width: 1, color: WOOD_DARK }); roof(g, x0 + 8, y0 + 26, W - 16, H - 34, WOOD_DARK); banner(g, x0 + W - 10, y0 + 3, color); break;
    case 'mine': base(STONE_DARK); g.poly([x0 + 10, y0 + H - 10, x0 + W / 2, y0 + 8, x0 + W - 10, y0 + H - 10]).fill(STONE); g.rect(x0 + W / 2 - 8, y0 + H / 2, 16, 12).fill(DARK); g.circle(x0 + 14, y0 + 16, 2.5).fill(GOLD).circle(x0 + W - 16, y0 + 24, 2.5).fill(GOLD); banner(g, x0 + W - 10, y0 + 3, color); break;
    case 'market': {
      base(0xc8b898);
      for (let i = 0; i < 3; i++) { const y = y0 + 10 + i * 26; g.rect(x0 + 8, y, W - 16, 14).fill(i % 2 ? 0xa8362a : LINEN); for (let k = 0; k < 8; k++) g.rect(x0 + 8 + k * ((W - 16) / 8), y, (W - 16) / 16, 14).fill(i % 2 ? LINEN : 0xa8362a); }
      g.circle(x0 + W / 2, y0 + H / 2, 6).fill(GOLD);
      banner(g, x0 + W - 12, y0 + 4, color);
      break;
    }
    case 'temple': {
      base(MARBLE, 2);
      g.rect(x0 + 10, y0 + 10, W - 20, H - 20).fill(MATERIALS.marbleDark);
      columns(g, x0 + 10, y0 + 10, W - 20, H - 20, 5);
      for (let i = 1; i < 4; i++) { g.circle(x0 + 10, y0 + 10 + ((H - 20) * i) / 4, 2.2).fill(MARBLE); g.circle(x0 + W - 10, y0 + 10 + ((H - 20) * i) / 4, 2.2).fill(MARBLE); }
      g.rect(x0 + W / 2 - 9, y0 + H / 2 - 9, 18, 18).fill(GOLD).rect(x0 + W / 2 - 9, y0 + H / 2 - 9, 18, 18).stroke({ width: 1.5, color: darken(GOLD, 0.6) });
      g.circle(x0 + W / 2, y0 + H / 2, 4).fill(0xfff7cc);
      banner(g, x0 + W - 12, y0 + 2, color);
      break;
    }
    case 'barracks': {
      base(0xa58b6a);
      g.rect(x0 + 10, y0 + 10, W - 20, H - 20).fill(0x98483a);
      roof(g, x0 + 8, y0 + 8, W - 16, 22, TERRACOTTA);
      g.moveTo(x0 + W / 2 - 12, y0 + H - 14).lineTo(x0 + W / 2 + 12, y0 + H - 34).moveTo(x0 + W / 2 + 12, y0 + H - 14).lineTo(x0 + W / 2 - 12, y0 + H - 34).stroke({ width: 3, color: IRON });
      banner(g, x0 + W - 12, y0 + 2, color);
      break;
    }
    case 'stable': {
      base(0xb9926a);
      roof(g, x0 + 6, y0 + 6, W - 12, 30, WOOD_DARK);
      g.rect(x0 + 8, y0 + 40, W - 16, H - 48).fill(0xc6a368);
      for (let i = 0; i < 4; i++) g.rect(x0 + 12 + i * 18, y0 + 44, 12, 8).fill(0xd9c15c);
      g.circle(x0 + W / 2, y0 + H - 16, 6).stroke({ width: 3, color: IRON });
      banner(g, x0 + W - 12, y0 + 2, color);
      break;
    }
    case 'siege_workshop': {
      base(WOOD);
      g.rect(x0 + 10, y0 + 10, W - 20, H - 20).fill(0x8a5e3a);
      g.moveTo(x0 + 20, y0 + H - 20).lineTo(x0 + W - 24, y0 + 24).stroke({ width: 4, color: WOOD_DARK });
      g.circle(x0 + W - 24, y0 + 24, 6).fill(STONE_DARK); g.rect(x0 + 16, y0 + H - 26, 26, 8).fill(WOOD_DARK);
      banner(g, x0 + W - 12, y0 + 2, color);
      break;
    }
    case 'academy': {
      base(MARBLE, 2);
      g.rect(x0 + 8, y0 + 8, W - 16, H - 16).fill(MATERIALS.marbleDark);
      columns(g, x0 + 8, y0 + 8, W - 16, H - 16, 6);
      g.rect(x0 + W / 2 - 14, y0 + H / 2 - 8, 28, 16).fill(0xe6dcc4).rect(x0 + W / 2 - 14, y0 + H / 2 - 8, 28, 16).stroke({ width: 1, color: STONE_DARK });
      for (let i = 0; i < 3; i++) g.moveTo(x0 + W / 2 - 10, y0 + H / 2 - 4 + i * 4).lineTo(x0 + W / 2 + 10, y0 + H / 2 - 4 + i * 4).stroke({ width: 1, color: 0x6b7280 });
      banner(g, x0 + W - 12, y0 + 2, color);
      break;
    }
    case 'tower': g.circle(0, 0, 13).fill(STONE_DARK).circle(0, 0, 10).fill(STONE); g.circle(-2, -2, 8).fill({ color: darken(STONE, 1.12), alpha: 0.7 }); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; g.circle(Math.cos(a) * 11, Math.sin(a) * 11, 2.2).fill(STONE_DARK); } g.circle(0, 0, 4).fill(color); break;
    case 'gate': g.rect(x0, y0, W, H).fill(STONE_DARK).rect(x0 + 2, y0 + 2, W - 4, H - 4).fill(WOOD); g.moveTo(x0 + W / 2, y0 + 3).lineTo(x0 + W / 2, y0 + H - 3).stroke({ width: 1.5, color: WOOD_DARK }); g.rect(x0 + 3, y0 + H / 2 - 2, W - 6, 4).fill(IRON); g.circle(x0 + W / 2 - 4, y0 + H / 2, 1.5).fill(color).circle(x0 + W / 2 + 4, y0 + H / 2, 1.5).fill(color); break;
    case 'wall': g.rect(x0, y0, W, H).fill(STONE_DARK).rect(x0 + 2, y0 + 2, W - 4, H - 4).fill(STONE); g.moveTo(x0 + 2, y0 + H / 2).lineTo(x0 + W - 2, y0 + H / 2).moveTo(x0 + W / 2, y0 + 2).lineTo(x0 + W / 2, y0 + H / 2).moveTo(x0 + W / 4, y0 + H / 2).lineTo(x0 + W / 4, y0 + H - 2).moveTo(x0 + (3 * W) / 4, y0 + H / 2).lineTo(x0 + (3 * W) / 4, y0 + H - 2).stroke({ width: 1, color: STONE_DARK }); break;
    case 'fortress': {
      base(STONE_DARK, 1);
      g.rect(x0 + 12, y0 + 12, W - 24, H - 24).fill(STONE);
      for (const [cx, cy] of [[x0 + 12, y0 + 12], [x0 + W - 12, y0 + 12], [x0 + 12, y0 + H - 12], [x0 + W - 12, y0 + H - 12]]) { g.circle(cx, cy, 12).fill(STONE_DARK).circle(cx, cy, 9).fill(STONE); }
      g.rect(x0 + W / 2 - 20, y0 + H / 2 - 20, 40, 40).fill(STONE_DARK).rect(x0 + W / 2 - 16, y0 + H / 2 - 16, 32, 32).fill(0xb9b5a8);
      roof(g, x0 + W / 2 - 12, y0 + H / 2 - 12, 24, 24, darken(team, 0.95));
      banner(g, x0 + W / 2 + 14, y0 + H / 2 - 30, color);
      break;
    }
    case 'wonder_zeus': base(MARBLE, 2); g.rect(x0 + 12, y0 + 12, W - 24, H - 24).fill(MATERIALS.marbleDark); columns(g, x0 + 12, y0 + 12, W - 24, H - 24, 7); g.circle(0, 0, 26).fill(GOLD).circle(0, 0, 26).stroke({ width: 2, color: darken(GOLD, 0.6) }); g.circle(0, -6, 9).fill(0xfff1b8); g.poly([-6, 4, 6, 4, 0, 22]).fill(0xfde68a); g.moveTo(-18, 14).lineTo(-10, -4).lineTo(-14, -6).lineTo(-6, -24).stroke({ width: 3, color: 0x7dd3fc }); banner(g, x0 + W - 14, y0 + 4, color); break;
    case 'wonder_artemis': base(MARBLE, 2); g.rect(x0 + 8, y0 + 8, W - 16, H - 16).fill(0xe3dac6); columns(g, x0 + 8, y0 + 8, W - 16, H - 16, 9); for (let i = 1; i < 6; i++) { g.circle(x0 + 8, y0 + 8 + ((H - 16) * i) / 6, 2.2).fill(MARBLE); g.circle(x0 + W - 8, y0 + 8 + ((H - 16) * i) / 6, 2.2).fill(MARBLE); } roof(g, x0 + 24, y0 + 24, W - 48, H - 48, 0xc6c1b2); g.circle(0, 0, 8).fill(0x8fb83a); banner(g, x0 + W - 14, y0 + 4, color); break;
    case 'wonder_colossus': base(STONE, 2); g.circle(0, 0, 40).fill(darken(BRONZE, 0.7)); g.rect(-16, -40, 32, 80).fill(BRONZE).rect(-16, -40, 32, 80).stroke({ width: 2, color: darken(BRONZE, 0.5) }); g.circle(0, -30, 12).fill(MATERIALS.bronzeLight); g.rect(-30, -14, 14, 8).fill(BRONZE).rect(16, -14, 14, 8).fill(BRONZE); g.circle(0, -30, 5).fill(0xfef08a); banner(g, x0 + W - 14, y0 + 4, color); break;
    case 'titan_gate': g.rect(x0, y0, W, H).fill(0x1c1917); g.circle(0, 0, 60).fill(0x292524).circle(0, 0, 48).fill(0x7c2d12).circle(0, 0, 36).fill(0xb91c1c).circle(0, 0, 22).fill(0xf97316).circle(0, 0, 10).fill(0xfde68a); for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; g.rect(Math.cos(a) * 66 - 4, Math.sin(a) * 66 - 4, 8, 8).fill(STONE_DARK); } break;
    case 'cornucopia': base(0xc9b38a); g.moveTo(x0 + 10, y0 + H - 10).quadraticCurveTo(x0 + W / 2, y0 + 4, x0 + W - 8, y0 + 12).stroke({ width: 8, color: 0xb8923e }); g.circle(x0 + W - 12, y0 + 16, 5).fill(0xd8302a).circle(x0 + W - 22, y0 + 12, 4).fill(0x8fb83a).circle(x0 + W - 16, y0 + 26, 4).fill(0xe0901a); break;
    default: base(STONE);
  }
}

function drawConstruction(g: Graphics, type: string, color: number) {
  const def = BUILDINGS[type];
  const W = def.w * TILE, H = def.h * TILE, x0 = -W / 2, y0 = -H / 2;
  g.rect(x0 + 2, y0 + 2, W - 4, H - 4).fill({ color: 0x7a5e34, alpha: 0.75 }).rect(x0 + 2, y0 + 2, W - 4, H - 4).stroke({ width: 2, color: WOOD_DARK });
  const n = Math.max(2, def.w);
  for (let i = 1; i < n; i++) { g.moveTo(x0 + (W * i) / n, y0 + 4).lineTo(x0 + (W * i) / n, y0 + H - 4).stroke({ width: 2, color: WOOD }); g.moveTo(x0 + 4, y0 + (H * i) / n).lineTo(x0 + W - 4, y0 + (H * i) / n).stroke({ width: 2, color: WOOD }); }
  g.moveTo(x0 + 6, y0 + 6).lineTo(x0 + W - 6, y0 + H - 6).stroke({ width: 1.5, color: WOOD_DARK, alpha: 0.6 });
  banner(g, x0 + W - 12, y0 + 2, color);
}

