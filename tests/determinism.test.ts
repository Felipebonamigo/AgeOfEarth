import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { serialize } from '../src/core/serialize';
import { generateMap } from '../src/core/map/mapgen';
import { mapToData, type FixedMapData } from '../src/core/map/fixed';
import { quickGame, run } from './helpers';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.ts')) out.push(p); }
  return out;
}

describe('determinismo', () => {
  it('o núcleo não usa funções não determinísticas entre máquinas', () => {
    const forbidden = /Math\.(random|sin|cos|tan|atan2?|asin|acos|pow|exp|log|hypot|cbrt|sinh|cosh|tanh)\b|Date\.now|performance\.now/;
    for (const f of walk('src/core')) {
      const src = fs.readFileSync(f, 'utf8');
      const m = src.match(forbidden);
      expect(m, `${f} usa ${m?.[0]}`).toBeNull();
    }
  });
  it('duas partidas com a mesma semente produzem o mesmo estado após 1500 ticks (IA ativa)', () => {
    const a = quickGame({}, true), b = quickGame({}, true);
    run(a, 1500); run(b, 1500);
    const sa = serialize(a), sb = serialize(b);
    expect(sa.length).toBe(sb.length);
    expect(sa).toBe(sb);
  });
  it('duas partidas com o mesmo config.map (mapa fixo com entidades) e IA ativa produzem o mesmo estado após 1500 ticks', () => {
    const base = mapToData(generateMap(64, 64, 77, 2, 'continental'), 'determinismo');
    const [sx, sy] = base.starts[0];
    const map: FixedMapData = { ...base, entities: [
      { kind: 'building', type: 'tower', owner: 0, x: sx + 6, y: sy + 6 },
      { kind: 'unit', type: 'hoplite', owner: 1, x: base.starts[1][0] + 4, y: base.starts[1][1] + 4 },
    ] };
    const a = quickGame({ map: JSON.parse(JSON.stringify(map)) }, true), b = quickGame({ map: JSON.parse(JSON.stringify(map)) }, true);
    run(a, 1500); run(b, 1500);
    const sa = serialize(a), sb = serialize(b);
    expect(sa.length).toBe(sb.length);
    expect(sa).toBe(sb);
  });
});
