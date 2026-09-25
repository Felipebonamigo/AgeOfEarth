// Geração procedural de texturas (sem arquivos de arte): terreno, recursos, unidades e edifícios.
// Tudo é desenhado com Graphics e convertido em textura uma única vez (cache por chave).
import { Graphics, Rectangle, Texture, type Renderer } from 'pixi.js';
import { TERRAIN, TILE } from '../core/constants';
import { BUILDINGS, UNITS } from '../core/data';

const SKIN = 0xe8c39e, SKIN_DARK = 0xc49a6c, WOOD = 0x8b5a2b, WOOD_DARK = 0x5e3a1a, STONE = 0xb8b4a8, STONE_DARK = 0x7d7a70, MARBLE = 0xf1ece2, TERRACOTTA = 0xb5573a, GOLD = 0xf2c14e, BRONZE = 0xb8742a, IRON = 0x9aa0a6, DARK = 0x1f2937;

export function darken(c: number, f: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((c >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((c >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((c & 255) * f)));
  return (r << 16) | (g << 8) | b;
}
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

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

  // ---------------- Terreno ----------------
  tile(terrain: number, variant: number): Texture {
    return this.make(`tile:${terrain}:${variant}`, TILE, (g) => drawTile(g, terrain, variant), 1);
  }
  node(type: string, variant: number): Texture {
    return this.make(`node:${type}:${variant}`, TILE * 1.6, (g) => drawNode(g, type, variant), 2);
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
    const s = new (Graphics as unknown as { new (): Graphics })();
    void s;
    return this.renderer.extract.base64({ target: tex, format: 'png' }) as unknown as string;
  }
}

function hash(x: number, y: number, s: number): number { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

function drawTile(g: Graphics, terrain: number, variant: number) {
  const T = TILE, h = T / 2;
  const v = variant / 255;
  switch (terrain) {
    case TERRAIN.GRASS: {
      const base = mix(0x5f9a3c, 0x4f8a34, v);
      g.rect(-h, -h, T, T).fill(base);
      for (let i = 0; i < 7; i++) { const x = -h + hash(i, variant, 1) * T, y = -h + hash(i, variant, 2) * T; g.rect(x, y, 2, 1.2).fill(darken(base, 0.82 + hash(i, variant, 3) * 0.4)); }
      if (v > 0.8) g.circle(-h + hash(1, variant, 9) * T, -h + hash(2, variant, 9) * T, 1.5).fill(0xe9d16c);
      break;
    }
    case TERRAIN.DIRT: { const base = mix(0x9c7b4d, 0x8a6b40, v); g.rect(-h, -h, T, T).fill(base); for (let i = 0; i < 5; i++) g.circle(-h + hash(i, variant, 4) * T, -h + hash(i, variant, 5) * T, 1.5).fill(darken(base, 0.85)); break; }
    case TERRAIN.SAND: { const base = mix(0xe3d39a, 0xd8c78c, v); g.rect(-h, -h, T, T).fill(base); for (let i = 0; i < 4; i++) g.circle(-h + hash(i, variant, 6) * T, -h + hash(i, variant, 7) * T, 1).fill(darken(base, 0.9)); break; }
    case TERRAIN.WATER: { const base = mix(0x2f79b5, 0x2a6fa8, v); g.rect(-h, -h, T, T).fill(base); g.moveTo(-h + 3, -4 + v * 6).quadraticCurveTo(0, -8 + v * 6, h - 3, -4 + v * 6).stroke({ width: 1.2, color: 0x7fb6e3, alpha: 0.6 }); g.moveTo(-h + 6, 8 - v * 5).quadraticCurveTo(2, 4 - v * 5, h - 6, 8 - v * 5).stroke({ width: 1, color: 0x9fd0f0, alpha: 0.4 }); break; }
    case TERRAIN.DEEP: { const base = mix(0x1f5a8f, 0x1b5083, v); g.rect(-h, -h, T, T).fill(base); g.moveTo(-h + 4, 0).quadraticCurveTo(0, -4 + v * 4, h - 4, 0).stroke({ width: 1, color: 0x5a98cc, alpha: 0.35 }); break; }
    case TERRAIN.MOUNTAIN: {
      const base = mix(0x8b8a83, 0x74736c, v);
      g.rect(-h, -h, T, T).fill(base);
      const px = -h + hash(1, variant, 11) * 10, py = -h + hash(2, variant, 11) * 10;
      g.poly([px, py + 20, px + 12, py + 2, px + 24, py + 20]).fill(darken(base, 1.18));
      g.poly([px + 12, py + 2, px + 24, py + 20, px + 16, py + 20]).fill(darken(base, 0.85));
      g.poly([px + 9, py + 7, px + 12, py + 2, px + 15, py + 7]).fill(0xf3f3f3);
      break;
    }
    default: g.rect(-h, -h, T, T).fill(0xff00ff);
  }
}

function drawNode(g: Graphics, type: string, variant: number) {
  const v = variant / 255;
  switch (type) {
    case 'tree': {
      g.ellipse(2, 6, 11, 6).fill({ color: 0x000000, alpha: 0.22 });
      g.rect(-2, 2, 4, 8).fill(WOOD_DARK);
      const c1 = mix(0x2f7a2a, 0x3f8f30, v), c2 = mix(0x4caf50, 0x5cbf5a, v);
      g.circle(-4, -3, 8).fill(c1); g.circle(5, -2, 8).fill(c1); g.circle(0, -8, 8).fill(c1);
      g.circle(-3, -6, 5).fill(c2); g.circle(4, -5, 4).fill(c2);
      break;
    }
    case 'berry': {
      g.ellipse(1, 6, 10, 5).fill({ color: 0x000000, alpha: 0.2 });
      g.circle(-4, 0, 7).fill(0x3d7d3a); g.circle(4, -1, 7).fill(0x47904a); g.circle(0, -5, 6).fill(0x5aa35c);
      for (let i = 0; i < 7; i++) g.circle(-7 + hash(i, variant, 1) * 14, -8 + hash(i, variant, 2) * 12, 1.6).fill(0xd22a3c);
      break;
    }
    case 'gold': {
      g.ellipse(1, 7, 12, 5).fill({ color: 0x000000, alpha: 0.22 });
      g.poly([-12, 6, -6, -6, 2, -2, 6, -9, 13, 6]).fill(STONE).poly([-6, -6, 2, -2, -1, 6, -8, 6]).fill(STONE_DARK);
      for (let i = 0; i < 5; i++) g.circle(-8 + hash(i, variant, 3) * 16, -3 + hash(i, variant, 4) * 7, 1.8).fill(GOLD);
      break;
    }
    case 'deer': {
      for (let k = 0; k < 2; k++) {
        const ox = k === 0 ? -6 : 6, oy = k === 0 ? -3 : 4;
        g.ellipse(ox, oy + 5, 7, 3).fill({ color: 0x000000, alpha: 0.2 });
        g.ellipse(ox, oy, 7, 3.5).fill(0x9a6b3c); g.circle(ox + 6, oy - 1, 2.5).fill(0x8a5c30);
        g.moveTo(ox + 7, oy - 3).lineTo(ox + 9, oy - 6).moveTo(ox + 7, oy - 3).lineTo(ox + 5, oy - 6).stroke({ width: 1, color: 0x5e3a1a });
        g.circle(ox - 2, oy - 1, 1).fill(0xf3e2c6);
      }
      break;
    }
    case 'boar': { g.ellipse(0, 5, 8, 3).fill({ color: 0x000000, alpha: 0.2 }); g.ellipse(0, 0, 8, 4.5).fill(0x4a3320); g.circle(7, 0, 3).fill(0x3d2a1a); g.moveTo(9, 1).lineTo(11, -1).stroke({ width: 1.2, color: 0xeeeeee }); break; }
    case 'lure': { g.ellipse(0, 7, 10, 4).fill({ color: 0x000000, alpha: 0.25 }); g.poly([-9, 7, -5, -8, 5, -9, 10, 7]).fill(0x3d7ea6).poly([-5, -8, 5, -9, 2, 0]).fill(0x7fc3e8); g.circle(0, -1, 2).fill(0xdff6ff); break; }
  }
}

// ---------------- Unidades (vistas de cima, olhando para +x) ----------------
function drawUnit(g: Graphics, type: string, color: number) {
  const def = UNITS[type];
  const r = def.radius * TILE;
  const dark = darken(color, 0.65);
  g.ellipse(0, r * 0.35, r * 1.15, r * 0.7).fill({ color: 0x000000, alpha: 0.25 });   // sombra
  const humanoid = (tunic: number, head = SKIN) => {
    g.ellipse(0, 0, r * 0.75, r).fill(tunic).ellipse(0, 0, r * 0.75, r).stroke({ width: 1, color: darken(tunic, 0.6) });
    g.circle(r * 0.15, 0, r * 0.48).fill(head).circle(r * 0.15, 0, r * 0.48).stroke({ width: 0.8, color: SKIN_DARK });
  };
  const spear = (len: number) => g.moveTo(-r * 0.3, r * 0.6).lineTo(len, r * 0.6).stroke({ width: 1.5, color: WOOD }).poly([len, r * 0.6 - 2, len + 4, r * 0.6, len, r * 0.6 + 2]).fill(IRON);
  const shield = (rad: number, c: number) => g.circle(r * 0.1, -r * 0.75, rad).fill(c).circle(r * 0.1, -r * 0.75, rad).stroke({ width: 1, color: darken(c, 0.5) }).circle(r * 0.1, -r * 0.75, rad * 0.35).fill(BRONZE);
  const bow = () => g.moveTo(r * 0.9, -r * 0.8).quadraticCurveTo(r * 1.5, 0, r * 0.9, r * 0.8).stroke({ width: 1.5, color: WOOD }).moveTo(r * 0.9, -r * 0.8).lineTo(r * 0.9, r * 0.8).stroke({ width: 0.8, color: 0xeeeeee });
  const horse = (c: number) => { g.ellipse(0, 0, r * 1.05, r * 0.55).fill(c).ellipse(0, 0, r * 1.05, r * 0.55).stroke({ width: 1, color: darken(c, 0.6) }); g.ellipse(r * 1.0, 0, r * 0.35, r * 0.25).fill(darken(c, 0.9)); g.moveTo(-r * 1.0, 0).lineTo(-r * 1.4, r * 0.2).stroke({ width: 2, color: darken(c, 0.7) }); };
  const marker = () => g.circle(0, 0, r * 1.05).stroke({ width: 1.5, color, alpha: 0.9 });
  switch (type) {
    case 'villager': humanoid(mix(color, 0xd9c7a3, 0.55)); g.moveTo(r * 0.5, r * 0.7).lineTo(r * 1.1, r * 0.2).stroke({ width: 1.5, color: WOOD }).rect(r * 1.0, r * 0.05, 4, 3).fill(IRON); break;
    case 'kataskopos': horse(0x8a6a4a); g.circle(-r * 0.1, 0, r * 0.4).fill(color); g.circle(0, 0, r * 0.25).fill(SKIN); break;
    case 'hoplite': humanoid(color); shield(r * 0.55, mix(color, BRONZE, 0.4)); spear(r * 1.4); g.rect(-r * 0.1, -r * 0.45, r * 0.5, 2).fill(0xc9302c); break;
    case 'hypaspist': humanoid(darken(color, 0.85)); shield(r * 0.6, mix(color, IRON, 0.5)); spear(r * 1.2); g.circle(r * 0.15, 0, r * 0.5).stroke({ width: 1.5, color: BRONZE }); break;
    case 'myrmidon': humanoid(darken(color, 0.8)); shield(r * 0.62, DARK); spear(r * 1.3); g.circle(r * 0.15, 0, r * 0.5).stroke({ width: 2, color: GOLD }); break;
    case 'militia': humanoid(mix(color, 0xa08a6a, 0.5)); g.moveTo(r * 0.3, r * 0.6).lineTo(r * 1.2, r * 0.6).stroke({ width: 2, color: WOOD }); break;
    case 'toxotes': humanoid(color); bow(); g.rect(-r * 0.9, -r * 0.4, r * 0.4, r * 0.8).fill(WOOD_DARK); break;
    case 'cretan_archer': humanoid(darken(color, 0.9)); bow(); g.rect(-r * 0.9, -r * 0.4, r * 0.4, r * 0.8).fill(WOOD_DARK); g.circle(r * 0.15, 0, r * 0.5).stroke({ width: 1.2, color: GOLD }); break;
    case 'peltast': humanoid(color); g.poly([r * 0.1, -r * 0.9, r * 0.5, -r * 0.4, -r * 0.3, -r * 0.4]).fill(mix(color, WOOD, 0.5)); g.moveTo(r * 0.3, r * 0.5).lineTo(r * 1.3, r * 0.3).stroke({ width: 1.2, color: WOOD }); break;
    case 'hippeus': horse(0x6d4c2e); g.circle(-r * 0.1, 0, r * 0.42).fill(color); g.circle(0, 0, r * 0.26).fill(SKIN); spear(r * 1.5); break;
    case 'hetairoi': horse(0x3b2a1a); g.circle(-r * 0.1, 0, r * 0.45).fill(color); g.circle(0, 0, r * 0.26).fill(SKIN); g.circle(-r * 0.1, 0, r * 0.45).stroke({ width: 1.5, color: BRONZE }); spear(r * 1.5); break;
    case 'petrobolos': g.rect(-r, -r * 0.7, r * 2, r * 1.4).fill(WOOD).rect(-r, -r * 0.7, r * 2, r * 1.4).stroke({ width: 1, color: WOOD_DARK }); g.moveTo(-r * 0.6, 0).lineTo(r * 1.1, 0).stroke({ width: 3, color: WOOD_DARK }); g.circle(r * 1.1, 0, r * 0.35).fill(STONE_DARK); g.rect(-r * 0.9, -r * 0.9, r * 0.5, r * 0.25).fill(color).rect(-r * 0.9, r * 0.65, r * 0.5, r * 0.25).fill(color); break;
    case 'helepolis': g.rect(-r, -r, r * 2, r * 2).fill(WOOD_DARK).rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6).fill(WOOD); g.rect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2).fill(IRON); g.rect(-r, -r, r * 2, r * 0.25).fill(color); g.rect(r * 0.6, -r * 0.3, r * 0.6, r * 0.6).fill(IRON); break;
    case 'jason': case 'odysseus': case 'heracles': case 'achilles': case 'perseus': {
      const cape = { jason: 0xd4af37, odysseus: 0x1e3a8a, heracles: 0x8b4513, achilles: 0xb91c1c, perseus: 0x0f766e }[type] ?? GOLD;
      g.ellipse(-r * 0.3, 0, r * 0.8, r * 1.05).fill(cape);
      humanoid(color);
      if (type === 'odysseus') bow(); else if (type === 'heracles') g.moveTo(r * 0.3, r * 0.6).lineTo(r * 1.4, r * 0.9).stroke({ width: 4, color: WOOD_DARK }); else { spear(r * 1.4); shield(r * 0.55, GOLD); }
      g.circle(r * 0.15, 0, r * 0.6).stroke({ width: 2, color: GOLD, alpha: 0.9 });
      break;
    }
    case 'pegasus': g.ellipse(0, 0, r * 1.0, r * 0.5).fill(0xf8fafc); g.ellipse(-r * 0.2, -r * 0.9, r * 0.9, r * 0.35).fill({ color: 0xffffff, alpha: 0.9 }); g.ellipse(-r * 0.2, r * 0.9, r * 0.9, r * 0.35).fill({ color: 0xffffff, alpha: 0.9 }); g.ellipse(r * 0.95, 0, r * 0.3, r * 0.22).fill(0xe2e8f0); marker(); break;
    case 'minotaur': g.ellipse(0, 0, r * 0.9, r * 1.0).fill(0x6b4423); g.circle(r * 0.3, 0, r * 0.55).fill(0x4a2f17); g.moveTo(r * 0.4, -r * 0.5).quadraticCurveTo(r * 1.1, -r * 0.9, r * 0.9, -r * 0.2).moveTo(r * 0.4, r * 0.5).quadraticCurveTo(r * 1.1, r * 0.9, r * 0.9, r * 0.2).stroke({ width: 2.5, color: 0xf1e3c6 }); g.moveTo(-r * 0.2, r * 0.7).lineTo(r * 0.9, r * 1.1).stroke({ width: 3, color: IRON }); marker(); break;
    case 'centaur': horse(0x8a5a3a); g.ellipse(r * 0.4, 0, r * 0.4, r * 0.55).fill(SKIN); g.circle(r * 0.55, 0, r * 0.28).fill(SKIN_DARK); bow(); marker(); break;
    case 'cyclops': g.ellipse(0, 0, r * 0.85, r * 1.0).fill(0x9c8a6e); g.circle(r * 0.25, 0, r * 0.55).fill(0xb09c7d); g.circle(r * 0.45, 0, r * 0.18).fill(0xffffff).circle(r * 0.5, 0, r * 0.09).fill(0x1e293b); g.moveTo(-r * 0.4, r * 0.7).lineTo(r * 0.9, r * 1.2).stroke({ width: 4, color: WOOD_DARK }); marker(); break;
    case 'manticore': g.ellipse(0, 0, r * 1.0, r * 0.6).fill(0xc2410c); g.circle(r * 0.8, 0, r * 0.4).fill(0x9a3412); g.moveTo(-r * 0.9, 0).quadraticCurveTo(-r * 1.6, -r * 0.6, -r * 1.3, -r * 1.0).stroke({ width: 2.5, color: 0x1f2937 }); g.circle(-r * 1.3, -r * 1.0, r * 0.15).fill(0x84cc16); marker(); break;
    case 'hydra': g.ellipse(-r * 0.2, 0, r * 0.9, r * 0.7).fill(0x166534); for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; g.moveTo(r * 0.3, 0).quadraticCurveTo(r * 0.9, a * r * 1.2, r * 1.2, a * r * 1.4).stroke({ width: 3, color: 0x15803d }); g.circle(r * 1.2, a * r * 1.4, r * 0.18).fill(0x22c55e); } marker(); break;
    case 'nemean_lion': g.ellipse(0, 0, r * 1.0, r * 0.6).fill(0xd4a017); g.circle(r * 0.7, 0, r * 0.55).fill(0xa16207); g.circle(r * 0.8, 0, r * 0.32).fill(0xd4a017); marker(); break;
    case 'medusa': humanoid(0x4d7c0f, 0xa3e635); for (let i = 0; i < 6; i++) { const a = -1 + i * 0.4; g.moveTo(r * 0.1, 0).quadraticCurveTo(-r * 0.4, a * r, -r * 0.9, a * r * 1.1).stroke({ width: 1.5, color: 0x365314 }); } bow(); marker(); break;
    case 'colossus': g.rect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4).fill(BRONZE).rect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4).stroke({ width: 2, color: darken(BRONZE, 0.6) }); g.circle(r * 0.35, 0, r * 0.45).fill(darken(BRONZE, 1.15)); g.rect(r * 0.7, -r * 0.15, r * 0.7, r * 0.3).fill(darken(BRONZE, 0.8)); marker(); break;
    case 'chimera': g.ellipse(0, 0, r * 1.0, r * 0.6).fill(0xb45309); g.circle(r * 0.75, -r * 0.25, r * 0.38).fill(0x92400e); g.circle(r * 0.75, r * 0.3, r * 0.3).fill(0x365314); g.moveTo(-r * 0.9, 0).quadraticCurveTo(-r * 1.5, r * 0.5, -r * 1.2, r * 1.0).stroke({ width: 2.5, color: 0x166534 }); g.poly([r * 1.1, -r * 0.3, r * 1.7, -r * 0.4, r * 1.3, -r * 0.05]).fill(0xf97316); marker(); break;
    case 'cerberus': g.ellipse(0, 0, r * 1.0, r * 0.6).fill(0x1f2937); for (const a of [-0.55, 0, 0.55]) g.circle(r * 0.85, a * r, r * 0.3).fill(0x111827).circle(r * 1.0, a * r, r * 0.08).fill(0xef4444); marker(); break;
    case 'sentinel': g.rect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2).fill(STONE_DARK).rect(-r * 0.45, -r * 0.45, r * 0.9, r * 0.9).fill(STONE); g.circle(r * 0.2, 0, r * 0.35).fill(STONE_DARK); bow(); marker(); break;
    case 'shade': g.ellipse(0, 0, r * 0.75, r).fill({ color: 0x94a3b8, alpha: 0.55 }); g.circle(r * 0.15, 0, r * 0.45).fill({ color: 0xe2e8f0, alpha: 0.6 }); g.moveTo(r * 0.3, r * 0.5).lineTo(r * 1.2, r * 0.5).stroke({ width: 1.5, color: 0xcbd5e1, alpha: 0.7 }); marker(); break;
    case 'prometheus': case 'oceanus': case 'cronus': {
      const c = type === 'prometheus' ? 0xdc2626 : type === 'oceanus' ? 0x0369a1 : 0x4c1d95;
      g.circle(0, 0, r * 1.05).fill({ color: c, alpha: 0.25 });
      g.ellipse(0, 0, r * 0.75, r * 0.95).fill(darken(c, 0.9)).ellipse(0, 0, r * 0.75, r * 0.95).stroke({ width: 3, color: darken(c, 0.5) });
      g.circle(r * 0.2, 0, r * 0.45).fill(mix(c, 0xffffff, 0.35));
      g.circle(r * 0.35, 0, r * 0.1).fill(0xfef08a);
      g.moveTo(-r * 0.3, r * 0.6).lineTo(r * 1.5, r * 0.9).stroke({ width: 6, color: darken(c, 0.6) });
      marker();
      break;
    }
    default: humanoid(color);
  }
}

// ---------------- Edifícios (vista de cima com leve relevo) ----------------
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
  g.rect(x0 + 3, y0 + 4, W, H).fill({ color: 0x000000, alpha: 0.25 });  // sombra
  const base = (c: number, inset = P) => { g.rect(x0 + inset, y0 + inset, W - inset * 2, H - inset * 2).fill(c).rect(x0 + inset, y0 + inset, W - inset * 2, H - inset * 2).stroke({ width: 1.5, color: darken(c, 0.55) }); };
  switch (type) {
    case 'town_center': {
      base(STONE);
      g.rect(x0 + 14, y0 + 14, W - 28, H - 28).fill(0xd8b98a);
      g.rect(x0 + W / 2 - 4, y0 + 8, 8, H - 16).fill(0xc9a875).rect(x0 + 8, y0 + H / 2 - 4, W - 16, 8).fill(0xc9a875);
      for (const [cx, cy] of [[x0 + 10, y0 + 10], [x0 + W - 10, y0 + 10], [x0 + 10, y0 + H - 10], [x0 + W - 10, y0 + H - 10]]) { g.circle(cx, cy, 8).fill(STONE_DARK).circle(cx, cy, 6).fill(STONE); }
      roof(g, x0 + W / 2 - 16, y0 + H / 2 - 12, 32, 24, TERRACOTTA);
      banner(g, x0 + W / 2 - 1, y0 + H / 2 - 24, color);
      break;
    }
    case 'house': base(MARBLE); roof(g, x0 + 6, y0 + 6, W - 12, H - 12, TERRACOTTA); g.rect(x0 + W / 2 - 3, y0 + H - 9, 6, 4).fill(WOOD_DARK); banner(g, x0 + W - 12, y0 + 4, color); break;
    case 'farm': {
      g.rect(x0, y0, W, H).fill(0x8a6a3a);
      for (let i = 0; i < 6; i++) { const y = y0 + 5 + i * ((H - 10) / 5); g.moveTo(x0 + 4, y).lineTo(x0 + W - 4, y).stroke({ width: 3, color: 0xa3b83b }); }
      g.rect(x0, y0, W, H).stroke({ width: 1.5, color: WOOD_DARK });
      break;
    }
    case 'granary': base(0xd9c39a); roof(g, x0 + 6, y0 + 6, W - 12, H - 12, 0xc8a24a); for (let i = 0; i < 5; i++) g.circle(x0 + 10 + i * 10, y0 + H - 10, 3).fill(0xe9d16c); banner(g, x0 + W - 10, y0 + 3, color); break;
    case 'lumber_camp': base(WOOD); for (let i = 0; i < 4; i++) g.circle(x0 + 12 + i * 11, y0 + 14, 5).fill(0xc99a5b).circle(x0 + 12 + i * 11, y0 + 14, 5).stroke({ width: 1, color: WOOD_DARK }); roof(g, x0 + 8, y0 + 26, W - 16, H - 34, WOOD_DARK); banner(g, x0 + W - 10, y0 + 3, color); break;
    case 'mine': base(STONE_DARK); g.poly([x0 + 10, y0 + H - 10, x0 + W / 2, y0 + 8, x0 + W - 10, y0 + H - 10]).fill(STONE); g.rect(x0 + W / 2 - 8, y0 + H / 2, 16, 12).fill(DARK); g.circle(x0 + 14, y0 + 16, 2.5).fill(GOLD).circle(x0 + W - 16, y0 + 24, 2.5).fill(GOLD); banner(g, x0 + W - 10, y0 + 3, color); break;
    case 'market': {
      base(0xd8c8a8);
      for (let i = 0; i < 3; i++) { const y = y0 + 10 + i * 26; g.rect(x0 + 8, y, W - 16, 14).fill(i % 2 ? 0xc0392b : 0xf1e2c0); for (let k = 0; k < 8; k++) g.rect(x0 + 8 + k * ((W - 16) / 8), y, (W - 16) / 16, 14).fill(i % 2 ? 0xf1e2c0 : 0xc0392b); }
      g.circle(x0 + W / 2, y0 + H / 2, 6).fill(GOLD);
      banner(g, x0 + W - 12, y0 + 4, color);
      break;
    }
    case 'temple': {
      base(MARBLE, 2);
      g.rect(x0 + 10, y0 + 10, W - 20, H - 20).fill(0xe6dcc8);
      columns(g, x0 + 10, y0 + 10, W - 20, H - 20, 5);
      for (let i = 1; i < 4; i++) { g.circle(x0 + 10, y0 + 10 + ((H - 20) * i) / 4, 2.2).fill(MARBLE); g.circle(x0 + W - 10, y0 + 10 + ((H - 20) * i) / 4, 2.2).fill(MARBLE); }
      g.rect(x0 + W / 2 - 9, y0 + H / 2 - 9, 18, 18).fill(GOLD).rect(x0 + W / 2 - 9, y0 + H / 2 - 9, 18, 18).stroke({ width: 1.5, color: darken(GOLD, 0.6) });
      g.circle(x0 + W / 2, y0 + H / 2, 4).fill(0xfff7cc);
      banner(g, x0 + W - 12, y0 + 2, color);
      break;
    }
    case 'barracks': {
      base(0xb59b7a);
      g.rect(x0 + 10, y0 + 10, W - 20, H - 20).fill(0xa8503e);
      roof(g, x0 + 8, y0 + 8, W - 16, 22, TERRACOTTA);
      g.moveTo(x0 + W / 2 - 12, y0 + H - 14).lineTo(x0 + W / 2 + 12, y0 + H - 34).moveTo(x0 + W / 2 + 12, y0 + H - 14).lineTo(x0 + W / 2 - 12, y0 + H - 34).stroke({ width: 3, color: IRON });
      banner(g, x0 + W - 12, y0 + 2, color);
      break;
    }
    case 'stable': {
      base(0xc9a26e);
      roof(g, x0 + 6, y0 + 6, W - 12, 30, WOOD_DARK);
      g.rect(x0 + 8, y0 + 40, W - 16, H - 48).fill(0xd6b370);
      for (let i = 0; i < 4; i++) g.rect(x0 + 12 + i * 18, y0 + 44, 12, 8).fill(0xe9d16c);
      g.circle(x0 + W / 2, y0 + H - 16, 6).stroke({ width: 3, color: IRON });
      banner(g, x0 + W - 12, y0 + 2, color);
      break;
    }
    case 'siege_workshop': {
      base(WOOD);
      g.rect(x0 + 10, y0 + 10, W - 20, H - 20).fill(0x9a6e42);
      g.moveTo(x0 + 20, y0 + H - 20).lineTo(x0 + W - 24, y0 + 24).stroke({ width: 4, color: WOOD_DARK });
      g.circle(x0 + W - 24, y0 + 24, 6).fill(STONE_DARK); g.rect(x0 + 16, y0 + H - 26, 26, 8).fill(WOOD_DARK);
      banner(g, x0 + W - 12, y0 + 2, color);
      break;
    }
    case 'academy': {
      base(MARBLE, 2);
      g.rect(x0 + 8, y0 + 8, W - 16, H - 16).fill(0xe8e0cf);
      columns(g, x0 + 8, y0 + 8, W - 16, H - 16, 6);
      g.rect(x0 + W / 2 - 14, y0 + H / 2 - 8, 28, 16).fill(0xf6efd8).rect(x0 + W / 2 - 14, y0 + H / 2 - 8, 28, 16).stroke({ width: 1, color: STONE_DARK });
      for (let i = 0; i < 3; i++) g.moveTo(x0 + W / 2 - 10, y0 + H / 2 - 4 + i * 4).lineTo(x0 + W / 2 + 10, y0 + H / 2 - 4 + i * 4).stroke({ width: 1, color: 0x6b7280 });
      banner(g, x0 + W - 12, y0 + 2, color);
      break;
    }
    case 'tower': g.circle(0, 0, 13).fill(STONE_DARK).circle(0, 0, 10).fill(STONE); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; g.circle(Math.cos(a) * 11, Math.sin(a) * 11, 2.2).fill(STONE_DARK); } g.circle(0, 0, 4).fill(color); break;
    case 'wall': g.rect(x0, y0, W, H).fill(STONE_DARK).rect(x0 + 2, y0 + 2, W - 4, H - 4).fill(STONE); g.moveTo(x0 + 2, y0 + H / 2).lineTo(x0 + W - 2, y0 + H / 2).moveTo(x0 + W / 2, y0 + 2).lineTo(x0 + W / 2, y0 + H / 2).moveTo(x0 + W / 4, y0 + H / 2).lineTo(x0 + W / 4, y0 + H - 2).moveTo(x0 + (3 * W) / 4, y0 + H / 2).lineTo(x0 + (3 * W) / 4, y0 + H - 2).stroke({ width: 1, color: STONE_DARK }); break;
    case 'fortress': {
      base(STONE_DARK, 1);
      g.rect(x0 + 12, y0 + 12, W - 24, H - 24).fill(STONE);
      for (const [cx, cy] of [[x0 + 12, y0 + 12], [x0 + W - 12, y0 + 12], [x0 + 12, y0 + H - 12], [x0 + W - 12, y0 + H - 12]]) { g.circle(cx, cy, 12).fill(STONE_DARK).circle(cx, cy, 9).fill(STONE); }
      g.rect(x0 + W / 2 - 20, y0 + H / 2 - 20, 40, 40).fill(STONE_DARK).rect(x0 + W / 2 - 16, y0 + H / 2 - 16, 32, 32).fill(0xc9c5b8);
      roof(g, x0 + W / 2 - 12, y0 + H / 2 - 12, 24, 24, darken(color, 0.9));
      banner(g, x0 + W / 2 + 14, y0 + H / 2 - 30, color);
      break;
    }
    case 'wonder_zeus': base(MARBLE, 2); g.rect(x0 + 12, y0 + 12, W - 24, H - 24).fill(0xe6dcc8); columns(g, x0 + 12, y0 + 12, W - 24, H - 24, 7); g.circle(0, 0, 26).fill(GOLD).circle(0, 0, 26).stroke({ width: 2, color: darken(GOLD, 0.6) }); g.circle(0, -6, 9).fill(0xfff1b8); g.poly([-6, 4, 6, 4, 0, 22]).fill(0xfde68a); g.moveTo(-18, 14).lineTo(-10, -4).lineTo(-14, -6).lineTo(-6, -24).stroke({ width: 3, color: 0x7dd3fc }); banner(g, x0 + W - 14, y0 + 4, color); break;
    case 'wonder_artemis': base(MARBLE, 2); g.rect(x0 + 8, y0 + 8, W - 16, H - 16).fill(0xf3ead6); columns(g, x0 + 8, y0 + 8, W - 16, H - 16, 9); for (let i = 1; i < 6; i++) { g.circle(x0 + 8, y0 + 8 + ((H - 16) * i) / 6, 2.2).fill(MARBLE); g.circle(x0 + W - 8, y0 + 8 + ((H - 16) * i) / 6, 2.2).fill(MARBLE); } roof(g, x0 + 24, y0 + 24, W - 48, H - 48, 0xd6d1c2); g.circle(0, 0, 8).fill(0xa3e635); banner(g, x0 + W - 14, y0 + 4, color); break;
    case 'wonder_colossus': base(STONE, 2); g.circle(0, 0, 40).fill(darken(BRONZE, 0.7)); g.rect(-16, -40, 32, 80).fill(BRONZE).rect(-16, -40, 32, 80).stroke({ width: 2, color: darken(BRONZE, 0.5) }); g.circle(0, -30, 12).fill(darken(BRONZE, 1.15)); g.rect(-30, -14, 14, 8).fill(BRONZE).rect(16, -14, 14, 8).fill(BRONZE); g.circle(0, -30, 5).fill(0xfef08a); banner(g, x0 + W - 14, y0 + 4, color); break;
    case 'titan_gate': g.rect(x0, y0, W, H).fill(0x1c1917); g.circle(0, 0, 60).fill(0x292524).circle(0, 0, 48).fill(0x7c2d12).circle(0, 0, 36).fill(0xb91c1c).circle(0, 0, 22).fill(0xf97316).circle(0, 0, 10).fill(0xfde68a); for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; g.rect(Math.cos(a) * 66 - 4, Math.sin(a) * 66 - 4, 8, 8).fill(STONE_DARK); } break;
    case 'cornucopia': base(0xd9c39a); g.moveTo(x0 + 10, y0 + H - 10).quadraticCurveTo(x0 + W / 2, y0 + 4, x0 + W - 8, y0 + 12).stroke({ width: 8, color: 0xc8a24a }); g.circle(x0 + W - 12, y0 + 16, 5).fill(0xef4444).circle(x0 + W - 22, y0 + 12, 4).fill(0xa3e635).circle(x0 + W - 16, y0 + 26, 4).fill(0xf59e0b); break;
    default: base(STONE);
  }
}

function drawConstruction(g: Graphics, type: string, color: number) {
  const def = BUILDINGS[type];
  const W = def.w * TILE, H = def.h * TILE, x0 = -W / 2, y0 = -H / 2;
  g.rect(x0 + 2, y0 + 2, W - 4, H - 4).fill({ color: 0x8a6a3a, alpha: 0.75 }).rect(x0 + 2, y0 + 2, W - 4, H - 4).stroke({ width: 2, color: WOOD_DARK });
  const n = Math.max(2, def.w);
  for (let i = 1; i < n; i++) { g.moveTo(x0 + (W * i) / n, y0 + 4).lineTo(x0 + (W * i) / n, y0 + H - 4).stroke({ width: 2, color: WOOD }); g.moveTo(x0 + 4, y0 + (H * i) / n).lineTo(x0 + W - 4, y0 + (H * i) / n).stroke({ width: 2, color: WOOD }); }
  g.moveTo(x0 + 6, y0 + 6).lineTo(x0 + W - 6, y0 + H - 6).stroke({ width: 1.5, color: WOOD_DARK, alpha: 0.6 });
  banner(g, x0 + W - 12, y0 + 2, color);
}
