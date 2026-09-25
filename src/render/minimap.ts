// Minimapa em canvas 2D: terreno, fronteiras, edifícios, unidades, névoa e retângulo da câmera.
import { TERRAIN, TILE, PLAYER_COLORS } from '../core/constants';
import type { GameState } from '../core/types';
import type { Camera } from './camera';

const TERRAIN_COLORS: Record<number, string> = { [TERRAIN.GRASS]: '#4f8a34', [TERRAIN.WATER]: '#2f79b5', [TERRAIN.DEEP]: '#1f5a8f', [TERRAIN.SAND]: '#d8c78c', [TERRAIN.DIRT]: '#8a6b40', [TERRAIN.MOUNTAIN]: '#74736c' };

export class Minimap {
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private baseNodes = -1;
  size = 200;
  constructor(canvas: HTMLCanvasElement) { this.canvas = canvas; this.ctx = canvas.getContext('2d')!; canvas.width = this.size; canvas.height = this.size; }

  private buildBase(state: GameState) {
    const { w, h } = state.map;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const t = state.map.terrain[i];
      const col = TERRAIN_COLORS[t] ?? '#ff00ff';
      let r = parseInt(col.slice(1, 3), 16), g = parseInt(col.slice(3, 5), 16), b = parseInt(col.slice(5, 7), 16);
      const nid = state.map.nodeAt[i];
      if (nid !== -1) { const n = state.map.nodes.get(nid); if (n) { if (n.type === 'tree') { r = 0x2f; g = 0x6a; b = 0x2a; } else if (n.type === 'gold') { r = 0xf2; g = 0xc1; b = 0x4e; } else if (n.type === 'berry') { r = 0xd2; g = 0x2a; b = 0x3c; } else { r = 0x9a; g = 0x6b; b = 0x3c; } } }
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.base = c; this.baseNodes = state.map.nodes.size;
  }

  draw(state: GameState, cam: Camera, local: number): void {
    const { w, h } = state.map;
    if (!this.base || this.baseNodes !== state.map.nodes.size) this.buildBase(state);
    const ctx = this.ctx, S = this.size;
    const sx = S / w, sy = S / h;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.base!, 0, 0, S, S);
    // fronteiras
    const terr = state.territory;
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const o = terr[y * w + x];
      if (o < 0) continue;
      ctx.fillStyle = PLAYER_COLORS[o % PLAYER_COLORS.length].hex + '55';
      ctx.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5);
    }
    const vis = state.players[local].visibility;
    const reveal = state.config.revealMap;
    for (const b of state.buildings.values()) {
      const i = Math.floor(b.y) * w + Math.floor(b.x);
      if (!reveal && b.owner !== local && vis[i] < 1) continue;
      ctx.fillStyle = PLAYER_COLORS[b.owner % PLAYER_COLORS.length].hex;
      ctx.fillRect(b.tx * sx, b.ty * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
    }
    for (const u of state.units.values()) {
      const i = Math.floor(u.y) * w + Math.floor(u.x);
      if (!reveal && u.owner !== local && vis[i] < 2) continue;
      ctx.fillStyle = u.owner === local ? '#ffffff' : PLAYER_COLORS[u.owner % PLAYER_COLORS.length].hex;
      ctx.fillRect(u.x * sx - 1, u.y * sy - 1, 2, 2);
    }
    // névoa
    if (!reveal) {
      const img = ctx.getImageData(0, 0, S, S);
      const d = img.data;
      for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
        const v = vis[Math.floor(py / sy) * w + Math.floor(px / sx)];
        if (v === 2) continue;
        const k = (py * S + px) * 4;
        const f = v === 1 ? 0.55 : 0.12;
        d[k] *= f; d[k + 1] *= f; d[k + 2] *= f;
      }
      ctx.putImageData(img, 0, 0);
    }
    // câmera
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
    ctx.strokeRect((cam.x / TILE) * sx, (cam.y / TILE) * sy, (cam.width / cam.zoom / TILE) * sx, (cam.height / cam.zoom / TILE) * sy);
  }

  /** Converte um clique no minimapa para coordenadas de tile. */
  toWorld(state: GameState, px: number, py: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((px - rect.left) / rect.width) * state.map.w, y: ((py - rect.top) / rect.height) * state.map.h };
  }
}
