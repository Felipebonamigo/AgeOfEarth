// Câmera 2D: posição em pixels de mundo (zoom 1 = TILE px por tile), zoom em torno do cursor, limites do mapa.
import { TILE } from '../core/constants';

export class Camera {
  x = 0; y = 0; zoom = 1;
  width = 1; height = 1;
  mapW = 1; mapH = 1;
  shake = 0;
  minZoom = 0.35; maxZoom = 2.2;

  resize(w: number, h: number) { this.width = w; this.height = h; this.clamp(); }
  setMap(w: number, h: number) { this.mapW = w * TILE; this.mapH = h * TILE; }
  /** Centraliza em coordenadas de tile. */
  centerOn(tx: number, ty: number) {
    this.x = tx * TILE - this.width / 2 / this.zoom;
    this.y = ty * TILE - this.height / 2 / this.zoom;
    this.clamp();
  }
  pan(dx: number, dy: number) { this.x += dx / this.zoom; this.y += dy / this.zoom; this.clamp(); }
  zoomAt(sx: number, sy: number, factor: number) {
    const wx = this.x + sx / this.zoom, wy = this.y + sy / this.zoom;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    this.x = wx - sx / this.zoom; this.y = wy - sy / this.zoom;
    this.clamp();
  }
  clamp() {
    const vw = this.width / this.zoom, vh = this.height / this.zoom;
    const margin = TILE * 3;
    this.x = Math.max(-margin, Math.min(this.mapW - vw + margin, this.x));
    this.y = Math.max(-margin, Math.min(this.mapH - vh + margin, this.y));
    if (this.mapW < vw) this.x = (this.mapW - vw) / 2;
    if (this.mapH < vh) this.y = (this.mapH - vh) / 2;
  }
  screenToWorld(sx: number, sy: number): { x: number; y: number } { return { x: (this.x + sx / this.zoom) / TILE, y: (this.y + sy / this.zoom) / TILE }; }
  worldToScreen(tx: number, ty: number): { x: number; y: number } { return { x: (tx * TILE - this.x) * this.zoom, y: (ty * TILE - this.y) * this.zoom }; }
  /** Retângulo visível em tiles. */
  visibleTiles(): { x0: number; y0: number; x1: number; y1: number } {
    return {
      x0: Math.max(0, Math.floor(this.x / TILE) - 1), y0: Math.max(0, Math.floor(this.y / TILE) - 1),
      x1: Math.ceil((this.x + this.width / this.zoom) / TILE) + 1, y1: Math.ceil((this.y + this.height / this.zoom) / TILE) + 1,
    };
  }
}
