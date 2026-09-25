import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { serialize } from '../src/core/serialize';
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
});
