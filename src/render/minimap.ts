// Minimapa em canvas 2D: terreno, fronteiras, edifícios, unidades, névoa e retângulo da câmera.
import { TILE, PLAYER_COLORS } from '../core/constants';
import type { GameState } from '../core/types';
import type { Camera } from './camera';
import { tileColor } from './palette';

/** Opções de desenho: no editor, inícios numerados e nada de névoa. */
export interface MinimapDrawOpts { editor?: boolean }

export class Minimap {
  /** Espectador: mostra tudo. */
  revealAll = false;
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
    // mesma cor modulada do terreno da partida (paleta terrosa + ruído de baixa frequência), 1 px por tile
    for (let i = 0; i < w * h; i++) {
      const x = i % w, y = (i - x) / w;
      const col = tileColor(state.map.terrain[i], x, y, state.map.decor[i]);
      let r = (col >> 16) & 255, g = (col >> 8) & 255, b = col & 255;
      const nid = state.map.nodeAt[i];
      if (nid !== -1) { const n = state.map.nodes.get(nid); if (n) { if (n.type === 'tree') { r = 0x3a; g = 0x55; b = 0x22; } else if (n.type === 'gold') { r = 0xd0; g = 0xa1; b = 0x2e; } else if (n.type === 'berry') { r = 0xb8; g = 0x30; b = 0x3a; } else { r = 0x8a; g = 0x62; b = 0x38; } } }
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.base = c; this.baseNodes = state.map.nodes.size;
  }

  /** Editor: o terreno ou os nós mudaram; a base é reconstruída no próximo draw. */
  invalidate(): void { this.base = null; this.baseNodes = -1; }

  pings: { x: number; y: number; until: number }[] = [];
  ping(x: number, y: number) { this.pings.push({ x, y, until: performance.now() + 6000 }); if (this.pings.length > 8) this.pings.shift(); }

  draw(state: GameState, cam: Camera, local: number, opts?: MinimapDrawOpts): void {
    const { w, h } = state.map;
    const editor = opts?.editor === true;
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
    const reveal = state.config.revealMap || this.revealAll || editor;
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
    // alertas de ataque
    const now = performance.now();
    this.pings = this.pings.filter((p) => p.until > now);
    for (const p of this.pings) { const r = 4 + ((now / 150) % 6); ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, r, 0, Math.PI * 2); ctx.stroke(); }
    // editor: inícios numerados (disco na cor do slot + número)
    if (editor) {
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      state.map.starts.forEach((st, i) => {
        const px = (st.x + 0.5) * sx, py = (st.y + 0.5) * sy;
        ctx.fillStyle = PLAYER_COLORS[i % PLAYER_COLORS.length].hex; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.fillText(String(i + 1), px, py + 0.5);
      });
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
