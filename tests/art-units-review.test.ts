// Revisão da Etapa 4 (unidades assadas): o que os atlas e o índice têm de garantir além do que os testes dos lotes já
// conferem —
//   • passada: toda animação de andar (walk/run/carry) tem `stride` no índice, igual à medida no rig (measure.mjs); o
//     renderizador avança o quadro pela distância e o pé de apoio, medido nos PIXELS do atlas 2× (vista E), desliza
//     ≤ 20 % em relação ao chão;
//   • barra de vida: `tops` (topo do corpo por direção) no índice, igual à medida, e acima dele só passam itens finos;
//   • cor de time: ≥ 30 px de máscara a 1× em todo tipo, direção e quadro do parado e do andar (o rei de frente tinha 14);
//   • máscara de time em todo quadro de cor (a Q de Héracles de costas não tinha, e a máscara velha ficava por cima);
//   • roda do cerco: 15° por quadro e ciclo de 90° (a simetria da roda marcada), sem o efeito estroboscópico.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { loadManifests, posesOf } from '../scripts/bake/manifest.mjs';
import { measureUnit, MOVE_ANIMS } from '../scripts/bake/measure.mjs';
import { unitFrameName } from '../src/render/art/logic';
import type { SheetJson, ArtManifest } from '../src/render/art/types';

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'public', 'art');
const readJson = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const manifests = loadManifests(path.join(ROOT, 'art', 'manifest')).map((l) => l.manifest as unknown as Record<string, any>);
const units = manifests.filter((m) => m.kind === 'unit');
const posesFor = (m: Record<string, any>) => { const pf = posesOf(m as never); return { main: pf.main ? readJson(pf.main) : null, rider: pf.rider ? readJson(pf.rider) : null }; };

describe('roda do cerco: 15° por quadro no ciclo de 90° (simetria da roda), sem estroboscópio', () => {
  const siege = readJson('art/poses/siege.json');
  for (const m of units.filter((u) => u.source.rig === 'siege')) it(m.id, () => {
    const a = m.anims.walk;
    const keys = siege.anims[a.pose].keys as { t: number; wheel?: number[] }[];
    const turn = (keys[keys.length - 1].wheel?.[0] ?? 0) - (keys[0].wheel?.[0] ?? 0);
    expect(Math.abs(turn), 'giro do ciclo = 90° (2 dos 4 raios marcados: a roda repete a cada 90°)').toBe(90);
    expect(turn, 'para a frente (x negativo)').toBeLessThan(0);
    expect(Math.abs(turn) / a.frames, 'graus por quadro < 22,5° (metade dos 45° entre raios)').toBeLessThanOrEqual(15);
  });
});

const hasArt = fs.existsSync(path.join(ART, 'manifest.json'));
describe.skipIf(!hasArt)('atlas e índice das unidades (revisão da Etapa 4)', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8')) as ArtManifest;
  const sheets = new Map<string, SheetJson>();
  const imgs = new Map<string, PNG>();
  for (const a of index.atlases) if (a.group === 'units') sheets.set(a.json, JSON.parse(fs.readFileSync(path.join(ART, a.json), 'utf8')) as SheetJson);
  const frameOf = (scale: number, pass: string, name: string) => {
    for (const a of index.atlases) if (a.group === 'units' && a.scale === scale && a.pass === pass) {
      const f = sheets.get(a.json)!.frames[name];
      if (!f) continue;
      if (!imgs.has(a.image)) imgs.set(a.image, PNG.sync.read(fs.readFileSync(path.join(ART, a.image))));
      return { f, img: imgs.get(a.image)! };
    }
    return null;
  };
  /** Pixels opacos (alfa ≥ 128) do quadro, em coordenadas inteiras relativas ao pé (px do atlas). */
  const opaquePts = (scale: number, pass: string, name: string): { x: number; y: number }[] => {
    const r = frameOf(scale, pass, name); if (!r) return [];
    const { f, img } = r;
    const ax = f.anchor!.x * f.sourceSize.w, ay = f.anchor!.y * f.sourceSize.h, out: { x: number; y: number }[] = [];
    for (let y = 0; y < f.frame.h; y++) for (let x = 0; x < f.frame.w; x++) {
      if (img.data[((f.frame.y + y) * img.width + f.frame.x + x) * 4 + 3] >= 128) out.push({ x: Math.round(f.spriteSourceSize.x + x - ax), y: Math.round(f.spriteSourceSize.y + y - ay) });
    }
    return out;
  };

  it('passada e topo no índice = medidos no rig (o índice está em dia com poses e kits)', () => {
    for (const m of units) {
      const a = index.assets[m.id];
      expect(a, m.id).toBeTruthy();
      const me = measureUnit(m, posesFor(m))!;
      for (const anim of MOVE_ANIMS) {
        if (!m.anims[anim]) continue;
        const st = a.anims![anim].stride;
        expect(st, `${m.id} ${anim}: passada no índice`).toBeGreaterThan(0);
        expect(st, `${m.id} ${anim}`).toBeCloseTo(me.strides[anim], 3);
      }
      expect(a.tops, m.id).toHaveLength(8);
      a.tops!.forEach((t, d) => expect(t, `${m.id} dir ${d}`).toBeCloseTo(me.tops[d], 1));
    }
  });

  it('passadas plausíveis: a pé ≈ 0,7–0,9 tile por ciclo, trote ≈ 0,8–0,9, galope ≈ 1,6–1,9, roda = raio × 90°', () => {
    for (const m of units) {
      const an = index.assets[m.id].anims!;
      if (m.source.rig === 'siege') expect(an.walk.stride, m.id).toBeGreaterThan(0.2);
      else if (m.source.rig === 'horse') { expect(an.walk.stride, m.id).toBeGreaterThan(0.7); expect(an.walk.stride, m.id).toBeLessThan(1); expect(an.run.stride, m.id).toBeGreaterThan(1.5); expect(an.run.stride, m.id).toBeLessThan(2.1); }
      else { expect(an.walk.stride, m.id).toBeGreaterThan(0.65); expect(an.walk.stride, m.id).toBeLessThan(0.95); }
    }
  });

  it('pé de apoio medido nos pixels do atlas 2× (vistas E e O): desliza ≤ 20 % com o quadro avançando pela passada do índice', () => {
    // faixa do chão (pés e cascos); entre um quadro e o seguinte, o deslocamento para trás que mais sobrepõe as faixas é o
    // recuo do apoio. Virado para E o pé esquerdo (o de apoio na 1ª metade do ciclo) fica atrás da perna direita; virado
    // para O, o direito — por par de quadros vale o maior recuo das duas vistas. Média × quadros / passada = o quanto o
    // pé acompanha o chão (1 = parado no chão; com o relógio fixo de 10 fps era 0,32–0,61)
    const scale = 2, ppt = 32 * scale, UP = 3 * scale, DOWN = 6 * scale, W = 220 * scale, H = UP + DOWN, MAXS = Math.round(0.35 * ppt);
    const band = (id: string, anim: string, dir: number, i: number) => {
      const b = new Uint8Array(W * H);
      for (const p of opaquePts(scale, 'color', unitFrameName(id, anim, dir, i))) if (p.y >= -UP && p.y < DOWN) { const x = p.x + W / 2; if (x >= 0 && x < W) b[(p.y + UP) * W + x] = 1; }
      return b;
    };
    /** Recuo (px) do apoio entre A e B, com a frente para +x (sign 1, vista E) ou −x (sign −1, vista O). */
    const recoil = (A: Uint8Array, B: Uint8Array, sign: number) => {
      let best = 0, bestS = 0;
      for (let s = 1; s <= MAXS; s++) {
        let ov = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const xb = x - sign * s; if (xb >= 0 && xb < W && A[y * W + x] && B[y * W + xb]) ov++; }
        if (ov > best) { best = ov; bestS = s; }
      }
      return bestS;
    };
    let checked = 0;
    for (const m of units) {
      if (m.source.rig === 'siege') continue;   // a roda gira no lugar (o contato não anda): conferida pela pose
      for (const anim of MOVE_ANIMS) {
        const info = index.assets[m.id].anims![anim]; if (!info) continue;
        const n = info.frames;
        const E = Array.from({ length: n }, (_, i) => band(m.id, anim, 0, i)), O = Array.from({ length: n }, (_, i) => band(m.id, anim, 4, i));
        // par sem sobreposição para trás nas duas vistas = ninguém apoiado (a fase no ar do galope): fica fora da média
        const planted: number[] = [];
        for (let i = 0; i < n; i++) { const r = Math.max(recoil(E[i], E[(i + 1) % n], 1), recoil(O[i], O[(i + 1) % n], -1)); if (r > 0) planted.push(r); }
        expect(planted.length, `${m.id} ${anim}: quadros com apoio`).toBeGreaterThanOrEqual(n / 2);
        const follow = (planted.reduce((a, b) => a + b, 0) / planted.length) * n / (info.stride! * ppt);
        expect(Math.abs(1 - follow), `${m.id} ${anim}: o pé de apoio acompanha ${(100 * follow).toFixed(0)} % do chão (${planted.join(', ')} px por quadro; passada ${(info.stride! * ppt / n).toFixed(1)})`).toBeLessThanOrEqual(0.2);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(21);   // 14 a pé + carregar + 3 × (trote, galope)
  });

  it('cor de time: ≥ 30 px de máscara a 1× em todo tipo, direção e quadro do parado e do andar', () => {
    for (const m of units) {
      if (!m.team) continue;
      for (let d = 0; d < 8; d++) for (const anim of ['idle', 'walk']) for (let i = 0; i < m.anims[anim].frames; i++) {
        const n = opaquePts(1, 'team', unitFrameName(m.id, anim, d, i)).length;
        expect(n, `${m.id} ${anim} dir ${d} quadro ${i}: ${n} px de time`).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it('todo quadro de cor de unidade com time tem máscara de time (nas duas escalas)', () => {
    const missing: string[] = [];
    for (const scale of [1, 2]) for (const m of units) {
      if (!m.team) continue;
      for (const [anim, a] of Object.entries(m.anims as Record<string, { frames: number }>)) for (let d = 0; d < 8; d++) for (let i = 0; i < a.frames; i++) {
        const name = unitFrameName(m.id, anim, d, i);
        if (frameOf(scale, 'color', name) && !frameOf(scale, 'team', name)) missing.push(`${scale}× ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('barra de vida: acima do topo do corpo (tops) só passam itens de mão — ≤ 6 px opacos por linha a 1× no parado (a cabeça da clava de Héracles; a cabeça do cavalo e as ameias da helépole ficam abaixo)', () => {
    for (const m of units) {
      const tops = index.assets[m.id].tops!;
      for (let d = 0; d < 8; d++) for (let i = 0; i < m.anims.idle.frames; i++) {
        const rows = new Map<number, number>();
        for (const p of opaquePts(1, 'color', unitFrameName(m.id, 'idle', d, i))) if (-p.y > tops[d] + 1) rows.set(p.y, (rows.get(p.y) ?? 0) + 1);
        const widest = Math.max(0, ...rows.values());
        expect(widest, `${m.id} idle dir ${d} quadro ${i}: ${widest} px numa linha acima do topo ${tops[d]}`).toBeLessThanOrEqual(6);
      }
    }
  });
});
