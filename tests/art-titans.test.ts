// Etapa 6 da arte, lote titãs (docs/ART.md Apêndice G, "Lote titãs"): Prometeu, Cronos e Oceano no rig `titan` — 3,5–4× a
// altura humana, material próprio (brasa e fogo nas mãos; pele de pedra e a foice; pele verde-azulada, algas e a cauda),
// peças de time, sombra longa para SE e a ascensão (`rise`, 8 quadros, saindo da terra, só de frente) que o efeito
// `titanRise` toca. Confere o esquema novo (animação só em algumas direções, espelhamento por asset com a sombra nas 8
// direções), os pés no chão e a passada medidos no rig, as regras do renderizador (a ascensão pelo nascimento) e — com o
// bake local — a leitura a zoom 1: escala contra o hoplita, sombra longa, time em todas as direções, silhuetas distintas,
// ascensão e queda, páginas próprias e a VRAM de cada titã (a escolha registrada no Apêndice G).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { loadManifests, validateManifest, expandFrames, animationsOf, animSummary, animDirOf, bakedDirs, packedDirs, ownMirror, mirrorOf, posesOf, type ArtManifest } from '../scripts/bake/manifest.mjs';
import { poseErrors, runCheck } from '../scripts/bake/check';
import { measureUnit, footSamples, bodyHeight } from '../scripts/bake/measure.mjs';
import { UNIT_KITS, DEFAULT_POSES } from '../scripts/bake/page/rigs/units.js';
import { MIRROR_FROM, MIRROR_BAKED } from '../scripts/bake/page/camera.js';
import { UNITS } from '../src/core/data';
import { MAJOR_GODS } from '../src/core/data/gods';
import { chooseAnim, riseElapsed, type AnimInput, type UnitAnim } from '../src/render/art/logic';
import type { ArtManifest as ArtIndex, SheetJson } from '../src/render/art/types';

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'public', 'art');
const TITANS = ['prometheus', 'cronus', 'oceanus'];
/** Espelhados (simétricos o bastante: corpo e time de E/SE/NE = O/SO/NO espelhados); Cronos tem a foice na direita. */
const MIRRORED = ['prometheus', 'oceanus'];
const manifests = new Map(loadManifests(path.join(ROOT, 'art', 'manifest')).map((l) => [l.manifest.id, l.manifest]));
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const posesFor = (m: ArtManifest) => { const pf = posesOf(m); return { main: pf.main ? readJson(pf.main) : null, rider: pf.rider ? readJson(pf.rider) : null }; };
const ALL8 = [0, 1, 2, 3, 4, 5, 6, 7];

describe('Etapa 6 (lote titãs): manifestos e esquema', () => {
  it('os 3 titãs dos deuses maiores: rig titan, classe titan, página própria, só 1×, 8 direções, 3,5–4× a altura humana', () => {
    expect(new Set(Object.values(MAJOR_GODS).map((g) => g.titan))).toEqual(new Set(TITANS));
    for (const id of TITANS) {
      const m = manifests.get(id)!;
      expect(m, id).toBeTruthy();
      expect(validateManifest(m), id).toEqual([]);
      expect(poseErrors(ROOT, m), id).toEqual([]);
      expect(UNITS[id]?.tags, id).toContain('titan');
      expect(m.source.type === 'param' && m.source.rig, id).toBe('titan');
      expect(m.source.type === 'param' && m.source.params?.style, id).toBe(id);
      expect([m.sizeClass, m.page, m.stage, m.dirs, m.team, m.shadow, m.scales], id).toEqual(['titan', 'own', 6, 8, true, true, [1]]);
      const h = Number(m.source.type === 'param' ? m.source.params?.height : 0) / 1.8;
      expect(h, `${id}: altura / humano`).toBeGreaterThanOrEqual(3.5);
      expect(h, `${id}: altura / humano`).toBeLessThanOrEqual(4.1);
      expect(!!m.mirror, `${id}: espelhado`).toBe(MIRRORED.includes(id));
    }
    expect((UNIT_KITS.titan as Record<string, unknown[]>).style).toEqual(expect.arrayContaining(TITANS));
  });
  it('animações: parado, andar, golpe de área, queda e a ascensão (≥ 8 quadros, uma vez, só de frente — S)', () => {
    for (const id of TITANS) {
      const m = manifests.get(id)!;
      for (const a of ['idle', 'walk', 'attack', 'die', 'rise']) expect(m.anims?.[a], `${id} ${a}`).toBeTruthy();
      expect(m.anims!.rise.frames, id).toBeGreaterThanOrEqual(8);
      expect(m.anims!.rise.dirs, id).toEqual([2]);
      const sum = animSummary(m);
      expect([sum.rise.loop, sum.rise.dirs, sum.die.loop, sum.attack.loop, sum.walk.loop], id).toEqual([false, [2], false, false, true]);
      expect(sum.idle.dirs, id).toBeUndefined();
    }
  });
  it('o esquema recusa estilo, direções de animação e espelhamento inválidos', () => {
    const p = manifests.get('prometheus')!;
    expect(validateManifest({ ...p, source: { ...p.source, params: { ...(p.source.type === 'param' ? p.source.params : {}), style: 'hyperion' } } } as never).join()).toMatch(/style/);
    for (const dirs of [[9], [], [2, 2], 'S']) expect(validateManifest({ ...p, anims: { ...p.anims, rise: { ...p.anims!.rise, dirs } } } as never).join(), JSON.stringify(dirs)).toMatch(/dirs/);
    expect(validateManifest({ ...p, mirror: 'yes' } as never).join()).toMatch(/mirror/);
    expect(validateManifest({ ...p, page: undefined } as never).join()).toMatch(/mirror/);   // espelho por asset só em página própria
  });
  it('poses: arquivo próprio com os pivôs do humano e os escalares da cauda e do fogo', () => {
    const doc = readJson(DEFAULT_POSES.titan);
    expect(doc.joints).toEqual(readJson(DEFAULT_POSES.human).joints);
    expect(doc.scalars).toEqual(expect.arrayContaining(['wave', 'amp', 'coil', 'flame']));
    for (const id of TITANS) for (const a of Object.values(manifests.get(id)!.anims!)) expect(doc.anims[a.pose!], `${id} ${a.pose}`).toBeTruthy();
  });
});

describe('Etapa 6 (lote titãs): direções parciais e espelhamento por asset', () => {
  it('animação só em algumas direções: a direção assada mais próxima (empate: a de menor índice)', () => {
    expect(ALL8.map((d) => animDirOf({ frames: 8, dirs: [2] }, d))).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
    expect(animDirOf({ frames: 8, dirs: [0, 4] }, 2)).toBe(0);
    expect(animDirOf({ frames: 8, dirs: [0, 4] }, 3)).toBe(4);
    expect(animDirOf({ frames: 8 }, 5)).toBe(5);
    const p = manifests.get('prometheus')!;
    const rise = expandFrames(p).filter((f) => f.anim === 'rise');
    expect(rise.map((f) => f.dir)).toEqual(Array(8).fill(2));
    const anims = animationsOf(p);
    for (const d of ALL8) expect(anims[`prometheus/rise/${d}`], `rise ${d}`).toEqual(Array.from({ length: 8 }, (_, i) => `prometheus/rise/2/0${i}`));
  });
  it('espelhado: assa as 8 direções; o atlas leva cor e time de S, SO, O, NO, N e a sombra das 8 (o sol é fixo)', () => {
    const p = manifests.get('prometheus')!, c = manifests.get('cronus')!;
    expect([ownMirror(p), mirrorOf(p), ownMirror(c), mirrorOf(c)]).toEqual([true, true, false, false]);
    expect(bakedDirs(p)).toEqual(ALL8);
    expect(packedDirs(p, 'color')).toEqual(MIRROR_BAKED);
    expect(packedDirs(p, 'team')).toEqual(MIRROR_BAKED);
    expect(packedDirs(p, 'shadow')).toEqual(ALL8);
    expect(packedDirs(c, 'color')).toEqual(ALL8);
    expect(expandFrames(p)).toHaveLength(8 * (4 + 8 + 6 + 6) + 8);
    const color = animationsOf(p), shadow = animationsOf(p, { pass: 'shadow' });
    for (const [d, src] of Object.entries(MIRROR_FROM)) {
      expect(color[`prometheus/idle/${d}`][0], `cor ${d}`).toBe(`prometheus/idle/${src}/00`);
      expect(shadow[`prometheus/idle/${d}`][0], `sombra ${d}`).toBe(`prometheus/idle/${d}/00`);
    }
    expect(animationsOf(c)['cronus/idle/0'][0]).toBe('cronus/idle/0/00');
    // o `--mirror` global continua como antes (5 direções, a sombra da origem)
    expect(bakedDirs(p, true)).toEqual(MIRROR_BAKED);
    expect(ownMirror(p, true)).toBe(false);
    expect(animationsOf(p, { mirror: true, pass: 'shadow' })['prometheus/idle/0'][0]).toBe('prometheus/idle/4/00');
  });
});

describe('Etapa 6 (lote titãs): pés, passada e topo medidos no rig', () => {
  it('pés no chão parado e andando (Prometeu e Cronos) e a queda termina deitada com os pés no chão', () => {
    for (const id of ['prometheus', 'cronus']) {
      const m = manifests.get(id)!, poses = posesFor(m);
      const idle = footSamples(m, poses, 'idle')!, walk = footSamples(m, poses, 'walk')!, die = footSamples(m, poses, 'die')!;
      expect(idle[0], id).toHaveLength(2);
      // (tiles; 0,01 tile = 2 cm) parado: os dois pés; andando: ao menos um de apoio; nunca afundando
      for (const fr of idle) { expect(Math.max(...fr.map((f) => f.low)), `${id} parado`).toBeLessThan(0.02); expect(Math.min(...fr.map((f) => f.low))).toBeGreaterThan(-0.012); }
      walk.forEach((fr, i) => { expect(Math.min(...fr.map((f) => f.low)), `${id} andar ${i}`).toBeLessThan(0.02); expect(Math.min(...fr.map((f) => f.low))).toBeGreaterThan(-0.012); });
      // e o pé de trás sai do chão em algum quadro (passo, não deslize)
      expect(Math.max(...walk.flatMap((fr) => fr.map((f) => f.low))), `${id} andar: pé no ar`).toBeGreaterThan(0.1);
      const last = die[die.length - 1];
      for (const f of last) { expect(f.low, `${id} caído`).toBeLessThan(0.06); expect(f.low).toBeGreaterThan(-0.012); }
    }
  });
  it('queda pesada: o corpo termina deitado (≤ 35 % da altura de pé, sem a arma/cauda/fogo; Oceano cai de lado: ≤ 45 %, a largura dos ombros); a ascensão começa enterrada', () => {
    for (const id of TITANS) {
      const m = manifests.get(id)!, poses = posesFor(m);
      const stand = bodyHeight(m, poses, 'idle', 0)!, fallen = bodyHeight(m, poses, 'die', m.anims!.die.frames - 1)!, buried = bodyHeight(m, poses, 'rise', 0)!;
      expect(fallen / stand, `${id}: caído ${fallen.toFixed(2)} / de pé ${stand.toFixed(2)} tiles`).toBeLessThan(id === 'oceanus' ? 0.45 : 0.35);
      expect(buried / stand, `${id}: ascensão no quadro 0 (${buried.toFixed(2)} tiles)`).toBeLessThan(0.75);
    }
  });
  it('passada ≈ a do humano na escala do titã (Oceano desliza: a onda da cauda) e topo do corpo ~3× o do hoplita', () => {
    const hop = measureUnit(manifests.get('hoplite')!, posesFor(manifests.get('hoplite')!))!;
    for (const id of TITANS) {
      const m = manifests.get(id)!, me = measureUnit(m, posesFor(m))!;
      const k = Number(m.source.type === 'param' ? m.source.params?.height : 0) / 1.8;
      const r = me.strides.walk / (hop.strides.walk * k);
      expect(r, `${id}: passada / (hoplita × ${k.toFixed(2)})`).toBeGreaterThan(id === 'oceanus' ? 0.5 : 0.75);
      expect(r).toBeLessThan(1.2);
      expect(me.tops).toHaveLength(8);
      for (let d = 0; d < 8; d++) expect(me.tops[d] / hop.tops[d], `${id} topo dir ${d}`).toBeGreaterThan(2.5);
    }
  });
});

describe('Etapa 6 (lote titãs): regras do renderizador', () => {
  const base: AnimInput = { moving: false, attacking: false, carrying: false, working: false };
  const has = (list: UnitAnim[]) => (a: UnitAnim) => list.includes(a);
  it('a ascensão vem antes de tudo enquanto dura (golpe, andar); sem `rise` no asset, a de sempre', () => {
    const titan = has(['idle', 'walk', 'attack', 'die', 'rise']);
    expect(chooseAnim({ ...base, rising: true, attacking: true, moving: true }, titan)).toBe('rise');
    expect(chooseAnim({ ...base, rising: false, attacking: true }, titan)).toBe('attack');
    expect(chooseAnim({ ...base, rising: true, moving: true }, has(['idle', 'walk', 'attack', 'die']))).toBe('walk');
  });
  it('riseElapsed: segundos desde o nascimento durante a ascensão; fora dela (ou pré-colocado no tick 0), −1', () => {
    expect(riseElapsed(100, 100, 32, 20)).toBe(0);
    expect(riseElapsed(100, 120, 32, 20)).toBe(1);
    expect(riseElapsed(100, 131, 32, 20)).toBeCloseTo(1.55, 5);
    expect(riseElapsed(100, 132, 32, 20)).toBe(-1);
    expect(riseElapsed(100, 99, 32, 20)).toBe(-1);
    expect(riseElapsed(0, 5, 32, 20)).toBe(-1);   // titã do cenário, já em pé
    expect(riseElapsed(100, 110, 0, 20)).toBe(-1);
  });
});

const hasArt = fs.existsSync(path.join(ART, 'manifest.json'));
describe.skipIf(!hasArt)('Etapa 6 (lote titãs): atlas (bake local)', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8')) as ArtIndex;
  const sheets = new Map<string, SheetJson>();
  const imgs = new Map<string, PNG>();
  for (const a of index.atlases) if (a.group === 'units' && a.scale === 1) sheets.set(a.json, JSON.parse(fs.readFileSync(path.join(ART, a.json), 'utf8')) as SheetJson);
  const pages = (id: string, pass: 'color' | 'team' | 'shadow') => (index.assets[id]?.atlases['1']?.[pass] ?? []) as string[];
  /** Quadro de (id, anim, dir, i) num passe pela animação do atlas, como o jogo: espelhado se a página espelha o asset. */
  const frameOf = (pass: 'color' | 'team' | 'shadow', id: string, anim: string, dir: number, i: number) => {
    for (const j of pages(id, pass)) {
      const sh = sheets.get(j)!, name = sh.animations?.[`${id}/${anim}/${dir}`]?.[i];
      const f = name ? sh.frames[name] : null;
      if (!f) continue;
      const a = index.atlases.find((x) => x.json === j)!;
      if (!imgs.has(a.image)) imgs.set(a.image, PNG.sync.read(fs.readFileSync(path.join(ART, a.image))));
      const mirrored = pass !== 'shadow' && sh.meta.aoe?.mirroredAssets?.[id]?.[String(dir)] !== undefined && !index.assets[id].anims?.[anim]?.dirs;
      return { f, img: imgs.get(a.image)!, k: 1 / (a.texel ?? 1), mirrored };
    }
    return null;
  };
  /** Pixels com alfa ≥ `min` em px de 1× relativos ao pé (espelhados em torno da âncora quando o jogo espelha). */
  const pts = (pass: 'color' | 'team' | 'shadow', id: string, anim: string, dir: number, i = 0, min = 128) => {
    const r = frameOf(pass, id, anim, dir, i); if (!r) return [];
    const { f, img, k, mirrored } = r, out: { x: number; y: number }[] = [];
    const ax = f.anchor.x * f.sourceSize.w, ay = f.anchor.y * f.sourceSize.h;
    for (let y = 0; y < f.frame.h; y++) for (let x = 0; x < f.frame.w; x++) {
      if (img.data[((f.frame.y + y) * img.width + f.frame.x + x) * 4 + 3] < min) continue;
      const px = Math.round((f.spriteSourceSize.x + x - ax) * k);
      out.push({ x: mirrored ? -px - 1 : px, y: Math.round((f.spriteSourceSize.y + y - ay) * k) });
    }
    return out;
  };
  const top = (id: string, anim = 'idle', dir = 2, i = 0) => -Math.min(...pts('color', id, anim, dir, i).map((p) => p.y));

  it('art:check sem erros; cada titã só a 1×, em páginas próprias, com a classe e a ascensão só de frente no índice', () => {
    expect(runCheck(ROOT).errors).toEqual([]);
    for (const id of TITANS) {
      const a = index.assets[id];
      expect([a?.kind, a?.sizeClass, Object.keys(a.atlases)], id).toEqual(['unit', 'titan', ['1']]);
      expect(a.anims?.rise?.dirs, id).toEqual([2]);
      expect(!!a.mirror, id).toBe(MIRRORED.includes(id));
      for (const pass of ['color', 'team', 'shadow'] as const) for (const j of pages(id, pass)) {
        expect(Object.keys(sheets.get(j)!.frames).every((n) => n.startsWith(id + '/')), `${id} ${j}`).toBe(true);
      }
    }
  });
  it('espelhados: cor e time sem E/SE/NE (fora a ascensão) e a página diz quem espelha; a sombra com as 8 direções e sem espelho', () => {
    for (const id of TITANS) {
      const names = (pass: 'color' | 'team' | 'shadow') => pages(id, pass).flatMap((j) => Object.keys(sheets.get(j)!.frames));
      const dirsOf = (list: string[]) => new Set(list.filter((n) => !n.includes('/rise/')).map((n) => Number(n.split('/')[2])));
      const mirrored = MIRRORED.includes(id);
      for (const pass of ['color', 'team'] as const) {
        expect([...dirsOf(names(pass))].sort(), `${id} ${pass}`).toEqual(mirrored ? MIRROR_BAKED : ALL8);
        for (const j of pages(id, pass)) expect(sheets.get(j)!.meta.aoe?.mirroredAssets?.[id], `${id} ${j}`).toEqual(mirrored ? MIRROR_FROM : undefined);
      }
      expect([...dirsOf(names('shadow'))].sort(), `${id} sombra`).toEqual(ALL8);
      for (const j of pages(id, 'shadow')) expect(sheets.get(j)!.meta.aoe?.mirroredAssets, `${id} ${j}`).toBeUndefined();
    }
  });
  it('VRAM a 1× (sem mipmaps): Prometeu e Oceano espelhados ≤ 11 e ≤ 14,5 MB, Cronos ≤ 17,5 MB; os três ≤ 42,5 MB', () => {
    const mb = (id: string) => (['color', 'team', 'shadow'] as const).reduce((n, pass) => n + pages(id, pass).reduce((s, j) => { const a = index.atlases.find((x) => x.json === j)!; return s + (a.w * a.h * 4) / 1048576; }, 0), 0);
    const got = Object.fromEntries(TITANS.map((id) => [id, mb(id)]));
    expect(got.prometheus, JSON.stringify(got)).toBeLessThanOrEqual(11);
    expect(got.oceanus, JSON.stringify(got)).toBeLessThanOrEqual(14.5);
    expect(got.cronus, JSON.stringify(got)).toBeLessThanOrEqual(17.5);
    expect(got.prometheus + got.cronus + got.oceanus).toBeLessThanOrEqual(42.5);
  });
  it('escala a zoom 1: o topo parado ≈ 3× o do hoplita (3,6–4× em metros: a crina do hoplita encurta a razão)', () => {
    for (const id of TITANS) for (const dir of [0, 2, 4, 6]) {
      const r = top(id, 'idle', dir) / top('hoplite', 'idle', dir);
      expect(r, `${id}/hoplita dir ${dir}: ${r.toFixed(2)}`).toBeGreaterThan(2.4);
      expect(r).toBeLessThan(4.2);
    }
  });
  it('sombra longa para SE nas 8 direções: centro a leste do pé e ≥ 2,5× o comprimento da sombra do hoplita', () => {
    const shadow = (id: string, dir: number) => {
      const s = pts('shadow', id, 'idle', dir, 0, 64);
      return { cx: s.reduce((n, p) => n + p.x, 0) / s.length, cy: s.reduce((n, p) => n + p.y, 0) / s.length, len: Math.max(...s.map((p) => Math.sqrt(p.x * p.x + p.y * p.y))) };
    };
    for (const id of TITANS) for (const dir of ALL8) {
      const s = shadow(id, dir), h = shadow('hoplite', dir);
      expect(s.cx, `${id} dir ${dir}: centro da sombra`).toBeGreaterThan(8);
      expect(s.cy, `${id} dir ${dir}: centro da sombra`).toBeGreaterThan(-2);
      expect(s.len / h.len, `${id} dir ${dir}: comprimento`).toBeGreaterThanOrEqual(2.5);
    }
  });
  it('cor de time em todas as direções e quadros (parado, andar, golpe, queda; ≥ 120 px) e na ascensão', () => {
    for (const id of TITANS) {
      const m = manifests.get(id)!;
      for (const anim of ['idle', 'walk', 'attack', 'die']) for (const dir of ALL8) for (let i = 0; i < m.anims![anim].frames; i++) {
        expect(pts('team', id, anim, dir, i, 64).length, `${id} ${anim} ${dir}/${i}`).toBeGreaterThanOrEqual(120);
      }
      for (let i = 0; i < m.anims!.rise.frames; i++) expect(pts('team', id, 'rise', 2, i, 64).length, `${id} rise ${i}`).toBeGreaterThan(0);
    }
  });
  it('silhuetas a zoom 1 (parado, 8 direções): os titãs se distinguem entre si (média ≥ 36 %, pior vista ≥ 25 %)', () => {
    const set = (id: string, dir: number) => new Set(pts('color', id, 'idle', dir).map((p) => `${p.x},${p.y}`));
    for (let i = 0; i < TITANS.length; i++) for (let j = i + 1; j < TITANS.length; j++) {
      const ds = ALL8.map((dir) => {
        const A = set(TITANS[i], dir), B = set(TITANS[j], dir);
        let only = 0; for (const k of A) if (!B.has(k)) only++; for (const k of B) if (!A.has(k)) only++;
        return only / new Set([...A, ...B]).size;
      });
      const mean = ds.reduce((a, b) => a + b, 0) / 8;
      expect(mean, `${TITANS[i]} × ${TITANS[j]}: ${ds.map((d) => (100 * d).toFixed(0)).join(', ')}`).toBeGreaterThanOrEqual(0.36);
      expect(Math.min(...ds)).toBeGreaterThanOrEqual(0.25);
    }
  });
  it('ascensão: começa enterrado (agachado saindo da terra) e termina na pose parada', () => {
    for (const id of TITANS) {
      const idleN = pts('color', id, 'idle', 2).length, n = manifests.get(id)!.anims!.rise.frames;
      const px = Array.from({ length: n }, (_, i) => pts('color', id, 'rise', 2, i).length / idleN);
      const tp = Array.from({ length: n }, (_, i) => top(id, 'rise', 2, i) / top(id));
      expect(px[0], `${id} rise px ${px.map((v) => v.toFixed(2)).join(' ')}`).toBeLessThan(0.7);
      expect(tp[0], `${id} rise topo ${tp.map((v) => v.toFixed(2)).join(' ')}`).toBeLessThan(0.7);
      expect(Math.min(...tp.slice(1, 4))).toBeLessThan(0.45);   // agachado saindo da terra
      expect(Math.abs(px[n - 1] - 1), `${id} fim da ascensão`).toBeLessThan(0.15);
      expect(Math.abs(tp[n - 1] - 1)).toBeLessThan(0.1);
    }
  });
});
