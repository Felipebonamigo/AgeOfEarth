// Hash espacial para consultas de vizinhança (reconstruído a cada tick; não é serializado).
import type { Unit } from '../types';

export class SpatialHash {
  cell: number; cols: number; rows: number; buckets: Unit[][];
  constructor(w: number, h: number, cell = 4) {
    this.cell = cell; this.cols = Math.ceil(w / cell) + 1; this.rows = Math.ceil(h / cell) + 1;
    this.buckets = new Array(this.cols * this.rows);
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
  }
  clear() { for (const b of this.buckets) b.length = 0; }
  insert(u: Unit) {
    const cx = Math.max(0, Math.min(this.cols - 1, Math.floor(u.x / this.cell)));
    const cy = Math.max(0, Math.min(this.rows - 1, Math.floor(u.y / this.cell)));
    this.buckets[cy * this.cols + cx].push(u);
  }
  /** Chama fn para cada unidade em células que cobrem o círculo (x,y,r). Não filtra pela distância exata. */
  each(x: number, y: number, r: number, fn: (u: Unit) => void) {
    const x0 = Math.max(0, Math.floor((x - r) / this.cell)), x1 = Math.min(this.cols - 1, Math.floor((x + r) / this.cell));
    const y0 = Math.max(0, Math.floor((y - r) / this.cell)), y1 = Math.min(this.rows - 1, Math.floor((y + r) / this.cell));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const b = this.buckets[cy * this.cols + cx];
      for (let i = 0; i < b.length; i++) fn(b[i]);
    }
  }
  query(x: number, y: number, r: number): Unit[] {
    const out: Unit[] = []; const r2 = r * r;
    this.each(x, y, r, (u) => { const dx = u.x - x, dy = u.y - y; if (dx * dx + dy * dy <= r2) out.push(u); });
    return out;
  }
}
