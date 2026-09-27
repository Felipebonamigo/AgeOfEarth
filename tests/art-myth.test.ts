// Etapa 6 da arte (docs/ART.md Apêndice G): a base das criaturas — rigs quadrúpede (`beast`), bípede grande (`giant`),
// serpente (`serpent`) e as asas acopláveis (Pégaso no rig do cavalo) — e o lote 1 de aprovação (minotauro, Leão de
// Nemeia, Pégaso) com a hidra por cabeças. Confere os manifestos e o esquema novo (classe de tamanho, escalas, voadora,
// página própria, variantes de unidade), o gerador de poses do quadrúpede (IK: a pata de apoio parada no chão), a passada
// medida no rig, o empacotador (página própria e divisão de um asset grande), as regras do renderizador (variante pela
// entidade, aparência da voadora, míticas fora do pré-carregamento) e — com o bake local — a leitura a zoom 1: escala
// contra o hoplita e o hetairo, o Pégaso no ar com a sombra para SE, a hidra mudando com as cabeças e silhuetas distintas.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { loadManifests, loadAssets, validateManifest, expandUnitVariants, expandFrames, posesOf, sizeCeiling, SIZE_CLASSES, type ArtManifest } from '../scripts/bake/manifest.mjs';
import { poseErrors, runCheck } from '../scripts/bake/check';
import { measureUnit, footSamples } from '../scripts/bake/measure.mjs';
import { packShelf } from '../scripts/bake/page/atlas.js';
import { UNIT_KITS, DEFAULT_POSES } from '../scripts/bake/page/rigs/units.js';
import { UNITS } from '../src/core/data';
import { unitArtId, unitLook, warmUnitTypes, unitFrameName } from '../src/render/art/logic';
import type { ArtManifest as ArtIndex, SheetJson } from '../src/render/art/types';

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'public', 'art');
const LOT = ['minotaur', 'nemean_lion', 'pegasus'];
const RIG_OF: Record<string, string> = { minotaur: 'giant', nemean_lion: 'beast', pegasus: 'horse', hydra: 'serpent' };
const manifests = new Map(loadManifests(path.join(ROOT, 'art', 'manifest')).map((l) => [l.manifest.id, l.manifest]));
const assets = new Map(loadAssets(path.join(ROOT, 'art', 'manifest')).map((m) => [m.id, m]));
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const posesFor = (m: ArtManifest) => { const pf = posesOf(m); return { main: pf.main ? readJson(pf.main) : null, rider: pf.rider ? readJson(pf.rider) : null }; };

describe('Etapa 6: manifestos e esquema', () => {
  it('lote 1 e hidra: tipos míticos do jogo nos rigs da etapa, classe myth, página própria, 8 direções e as 4 animações', () => {
    for (const id of [...LOT, 'hydra']) {
      const m = manifests.get(id)!;
      expect(m, id).toBeTruthy();
      expect(validateManifest(m), id).toEqual([]);
      expect(poseErrors(ROOT, m), id).toEqual([]);
      expect(UNITS[id]?.tags, id).toContain('myth');
      expect(m.source.type === 'param' && m.source.rig, id).toBe(RIG_OF[id]);
      expect([m.sizeClass, m.page, m.stage, m.dirs, m.team, m.shadow], id).toEqual(['myth', 'own', 6, 8, true, true]);
      for (const a of ['idle', 'walk', 'attack', 'die']) expect(m.anims?.[a], `${id} ${a}`).toBeTruthy();
    }
    // o leão (3,2 tiles/s) galopa na velocidade dele; o minotauro (2,6) e a hidra (2,0) só andam
    expect(manifests.get('nemean_lion')!.anims!.run).toBeTruthy();
    expect(manifests.get('minotaur')!.anims!.run).toBeUndefined();
  });
  it('voadora: o Pégaso tem `flying` como no núcleo e as outras não; ninguém mais do lote usa asas', () => {
    for (const id of [...LOT, 'hydra']) expect(!!manifests.get(id)!.flying, id).toBe(!!UNITS[id].flying);
    const peg = manifests.get('pegasus')!;
    expect(peg.source.type === 'param' && peg.source.params?.wings).toBe('feather');
    expect(peg.source.type === 'param' && peg.source.params?.rider).toBeNull();
    expect((UNIT_KITS.horse as Record<string, unknown[]>).wings).toContain('feather');
  });
  it('hidra: `unitVariants` vira um asset por número de cabeças (hydra = 1; hydra_heads2…5 com o parâmetro e a folha própria)', () => {
    const h = manifests.get('hydra')!;
    const ex = expandUnitVariants(h);
    expect(ex.map((m) => m.id)).toEqual(['hydra', 'hydra_heads2', 'hydra_heads3', 'hydra_heads4', 'hydra_heads5']);
    ex.forEach((m, i) => {
      expect(m.source.type === 'param' && m.source.params?.heads, m.id).toBe(i + 1);
      expect(validateManifest(m), m.id).toEqual([]);
      if (i) expect([m.variantOf, m.variantValue, m.contact, m.contactDirs], m.id).toEqual(['hydra', i + 1, 'hydra-heads', [1]]);
    });
    for (const m of ex) expect(assets.get(m.id), m.id).toBeTruthy();
    expect((UNIT_KITS.serpent as Record<string, unknown[]>).heads).toEqual([1, 2, 3, 4, 5]);
  });
  it('o esquema recusa classe, escalas, voadora, página e variantes inválidas; o teto do quadro é o da classe', () => {
    const lion = manifests.get('nemean_lion')!;
    expect(validateManifest({ ...lion, sizeClass: 'huge' } as never).join()).toMatch(/sizeClass/);
    expect(validateManifest({ ...lion, scales: [2] } as never).join()).toMatch(/scales/);
    expect(validateManifest({ ...lion, flying: 'yes' } as never).join()).toMatch(/flying/);
    expect(validateManifest({ ...lion, page: 'mine' } as never).join()).toMatch(/page/);
    expect(validateManifest({ ...lion, unitVariants: { by: 'size', param: 'x', values: [1, 2] } } as never).join()).toMatch(/unitVariants/);
    expect(validateManifest({ ...lion, source: { ...lion.source, params: { coat: 'zebra' } } } as never).join()).toMatch(/coat/);
    const mino = manifests.get('minotaur')!;
    expect(validateManifest({ ...mino, source: { ...mino.source, params: { human: { helmet: 'tophat' } } } } as never).join()).toMatch(/human/);
    expect([sizeCeiling(lion), sizeCeiling({ ...lion, sizeClass: undefined }), sizeCeiling({ ...lion, sizeClass: 'titan' })]).toEqual([SIZE_CLASSES.myth, SIZE_CLASSES.unit, SIZE_CLASSES.titan]);
  });
  it('arquivos de poses dos rigs novos: beast, giant (pivôs do humano) e serpent (escalares do corpo)', () => {
    for (const rig of ['beast', 'giant', 'serpent'] as const) expect(fs.existsSync(path.join(ROOT, DEFAULT_POSES[rig])), rig).toBe(true);
    expect(readJson(DEFAULT_POSES.giant).joints).toEqual(readJson(DEFAULT_POSES.human).joints);
    expect(readJson(DEFAULT_POSES.serpent).scalars).toEqual(expect.arrayContaining(['wave', 'amp', 'lift', 'neck', 'sway', 'strike', 'jaw']));
  });
});

describe('Etapa 6: poses e passada medidas no rig', () => {
  it('art/poses/beast.json em dia com o gerador (scripts/bake/gait.mjs: IK das patas)', () => {
    expect(() => execFileSync('node', ['scripts/bake/gait.mjs', '--check'], { cwd: ROOT, stdio: 'pipe' })).not.toThrow();
  });
  it('IK: no andar e no galope do leão a pata de apoio fica no chão (≤ 1,5 cm) e recua a passada do gerador por ciclo', () => {
    const m = manifests.get('nemean_lion')!, poses = posesFor(m), size = Number((m.source.type === 'param' ? m.source.params?.size : 1) ?? 1);
    for (const [anim, S] of [['walk', 1.5], ['run', 3.8]] as const) {
      const a = m.anims![anim], step = (S * size * 0.5) / a.frames;   // tiles que o chão anda por quadro
      // por quadro: altura do fundo e z do centro de cada pata (modelo virado para −z; measure.mjs roda o rig no Node)
      const samples = footSamples(m, poses, anim)!;
      let planted = 0, pairs = 0;
      for (let i = 0; i < a.frames; i++) samples[i].forEach((A, k) => {
        if (A.low >= 0.01) return;
        planted++;
        expect(A.low, `${anim} ${i}: pata abaixo do chão`).toBeGreaterThan(-0.008);
        const B = samples[(i + 1) % a.frames][k];
        // apoiada nos dois quadros: recua exatamente o que o chão anda (a pata parada no chão, ±10 %)
        if (B.low < 0.01) { pairs++; expect(B.z - A.z, `${anim} ${i}→${i + 1} pata ${k}`).toBeCloseTo(step, 1); expect(Math.abs(B.z - A.z - step) / step).toBeLessThan(0.1); }
      });
      // (galope: apoio de 30 % por pata — ≈ 2–3 quadros cada; no andar, 70 %)
      expect(planted, `${anim}: patas × quadros apoiados`).toBeGreaterThanOrEqual(Math.floor(a.frames * (anim === 'run' ? 0.85 : 2.5)));
      expect(pairs, `${anim}: pares de quadros com a pata apoiada`).toBeGreaterThanOrEqual(anim === 'run' ? 3 : 12);
      // a passada medida pelo bake (measure.mjs: média do apoio que mais recua por par) fica perto da do gerador — no
      // galope um pouco abaixo (os pares da troca de apoio entram com o recuo parcial)
      const me = measureUnit(m, poses)!;
      expect(me.strides[anim] / (S * size * 0.5), anim).toBeGreaterThan(anim === 'run' ? 0.8 : 0.95);
      expect(me.strides[anim] / (S * size * 0.5), anim).toBeLessThan(1.05);
    }
  });
  it('passada: minotauro ≈ humano × 2,6/1,8; hidra = um comprimento de onda por ciclo; Pégaso (voa) sem passada; topo nas 8 direções', () => {
    const mino = measureUnit(manifests.get('minotaur')!, posesFor(manifests.get('minotaur')!))!;
    expect(mino.strides.walk).toBeGreaterThan(0.65 * 2.6 / 1.8);
    expect(mino.strides.walk).toBeLessThan(1.0 * 2.6 / 1.8);
    const hydra = measureUnit(manifests.get('hydra')!, posesFor(manifests.get('hydra')!))!;
    expect(hydra.strides.walk).toBeCloseTo(7 * 0.3 * 0.5, 2);
    const peg = measureUnit(manifests.get('pegasus')!, posesFor(manifests.get('pegasus')!))!;
    expect(peg.strides).toEqual({});
    for (const me of [mino, hydra, peg]) { expect(me.tops).toHaveLength(8); for (const t of me.tops) expect(t).toBeGreaterThan(20); }
    // o Pégaso voa: o topo (no ar, asas abertas) passa do da hidra e do minotauro
    expect(Math.min(...peg.tops)).toBeGreaterThan(Math.min(...mino.tops));
  });
});

describe('Etapa 6: empacotador (página própria e divisão)', () => {
  it('`fresh`: o asset começa numa página nova; as páginas de antes ficam como estavam', () => {
    const items = [
      ...Array.from({ length: 6 }, (_, i) => ({ key: `a/${i}`, group: 'a', w: 40, h: 40 })),
      ...Array.from({ length: 6 }, (_, i) => ({ key: `b/${i}`, group: 'b', w: 40, h: 40, fresh: true })),
    ];
    const withB = packShelf(items, { maxSize: 512 }), onlyA = packShelf(items.slice(0, 6), { maxSize: 512 });
    expect(withB.pages).toHaveLength(2);
    expect(withB.pages[0]).toEqual(onlyA.pages[0]);
    expect(withB.pages[1].items.every((it) => it.key.startsWith('b/'))).toBe(true);
  });
  it('asset maior que uma página: dividido pelos `sub` (animação × direção), cada parte inteira numa página', () => {
    const items = [0, 1, 2, 3].flatMap((d) => Array.from({ length: 4 }, (_, i) => ({ key: `t/walk/${d}/${i}`, group: 't', w: 120, h: 120, sub: `walk/${d}` })));
    const { pages } = packShelf(items, { maxSize: 256 });
    expect(pages.length).toBeGreaterThanOrEqual(4);
    for (const p of pages) expect(new Set(p.items.map((it) => it.key.split('/').slice(1, 3).join('/'))).size).toBe(1);
    expect(pages.reduce((n, p) => n + p.items.length, 0)).toBe(16);
  });
});

describe('Etapa 6: regras do renderizador', () => {
  it('hidra: o asset pelas cabeças da entidade (fora da lista, a maior abaixo); tipo sem variantes = o próprio tipo', () => {
    const entry = { unitVariants: { by: 'heads', ids: { 1: 'hydra', 2: 'hydra_heads2', 3: 'hydra_heads3', 4: 'hydra_heads4', 5: 'hydra_heads5' } } };
    expect([1, 2, 3, 4, 5].map((h) => unitArtId('hydra', entry, h))).toEqual(['hydra', 'hydra_heads2', 'hydra_heads3', 'hydra_heads4', 'hydra_heads5']);
    expect(unitArtId('hydra', entry, 9)).toBe('hydra_heads5');   // acima do declarado: a maior abaixo
    expect(unitArtId('hydra', { unitVariants: { by: 'heads', ids: { 1: 'hydra', 3: 'hydra_heads3' } } }, 2)).toBe('hydra');
    expect(unitArtId('minotaur', {}, 3)).toBe('minotaur');
    expect(unitArtId('hydra', undefined, 3)).toBe('hydra');
  });
  it('aparência: a voadora com a sombra no chão translúcida; a sombra de Hades translúcida; o resto normal', () => {
    expect(unitLook('pegasus', true)).toEqual({ alpha: 1, shadow: 0.6 });
    expect(unitLook('shade', false)).toEqual({ alpha: 0.7, shadow: 0.4 });
    expect(unitLook('minotaur', false)).toEqual({ alpha: 1, shadow: 1 });
  });
  it('pré-carregamento: nenhuma mítica/titã entra sem aparecer (página própria, carregada na primeira vista)', () => {
    for (const age of [0, 1, 2, 3, 4]) for (const id of warmUnitTypes(UNITS, age)) expect(UNITS[id].tags, `${id} (Idade ${age})`).not.toContain('myth');
    expect(warmUnitTypes(UNITS, 2, ['minotaur'])).toContain('minotaur');
  });
});

const hasArt = fs.existsSync(path.join(ART, 'manifest.json'));
describe.skipIf(!hasArt)('Etapa 6: atlas (bake local)', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8')) as ArtIndex;
  const sheets = new Map<string, SheetJson>();
  const imgs = new Map<string, PNG>();
  for (const a of index.atlases) if (a.group === 'units') sheets.set(a.json, JSON.parse(fs.readFileSync(path.join(ART, a.json), 'utf8')) as SheetJson);
  const frameOf = (scale: number, pass: string, name: string) => {
    for (const a of index.atlases) if (a.group === 'units' && a.scale === scale && a.pass === pass) {
      const f = sheets.get(a.json)!.frames[name];
      if (!f) continue;
      if (!imgs.has(a.image)) imgs.set(a.image, PNG.sync.read(fs.readFileSync(path.join(ART, a.image))));
      return { f, img: imgs.get(a.image)!, k: 1 / (a.texel ?? 1) };
    }
    return null;
  };
  /** Pixels com alfa ≥ `min` em px de 1× (a sombra a ½ volta ao tamanho do quadro), relativos ao pé. */
  const pts = (pass: string, name: string, min = 128): { x: number; y: number }[] => {
    const r = frameOf(1, pass, name); if (!r) return [];
    const { f, img, k } = r, out: { x: number; y: number }[] = [];
    const ax = f.anchor.x * f.sourceSize.w, ay = f.anchor.y * f.sourceSize.h;
    for (let y = 0; y < f.frame.h; y++) for (let x = 0; x < f.frame.w; x++) {
      if (img.data[((f.frame.y + y) * img.width + f.frame.x + x) * 4 + 3] >= min) out.push({ x: Math.round((f.spriteSourceSize.x + x - ax) * k), y: Math.round((f.spriteSourceSize.y + y - ay) * k) });
    }
    return out;
  };
  const top = (id: string, dir = 2) => -Math.min(...pts('color', unitFrameName(id, 'idle', dir, 0)).map((p) => p.y));
  const width = (id: string, dir: number) => { const p = pts('color', unitFrameName(id, 'idle', dir, 0)); return Math.max(...p.map((q) => q.x)) - Math.min(...p.map((q) => q.x)); };

  it('art:check sem erros e cada criatura em páginas próprias (nenhuma página dela tem quadros de outro tipo), classe no índice', () => {
    expect(runCheck(ROOT).errors).toEqual([]);
    for (const id of [...LOT, 'hydra', 'hydra_heads5']) {
      const a = index.assets[id];
      expect(a?.kind, id).toBe('unit');
      expect(a.sizeClass, id).toBe('myth');
      for (const s of ['1', '2']) for (const pass of ['color', 'team', 'shadow'] as const) for (const j of a.atlases[s][pass] ?? []) {
        expect(Object.keys(sheets.get(j)!.frames).every((n) => n.startsWith(id + '/')), `${id} ${j}`).toBe(true);
      }
    }
    expect(index.assets.pegasus.flying).toBe(true);
    expect(index.assets.hydra.unitVariants?.ids['4']).toBe('hydra_heads4');
    expect(index.assets.hydra_heads3.variantOf).toBe('hydra');
  });
  it('escala a zoom 1: minotauro ≈ 1,4× o hoplita; leão ≈ cavalo sem cavaleiro (abaixo do hetairo montado, do comprimento dele); Pégaso ≈ cavalo', () => {
    const r = top('minotaur') / top('hoplite');
    expect(r, `minotauro/hoplita ${r.toFixed(2)}`).toBeGreaterThan(1.2);
    expect(r).toBeLessThan(1.7);
    const lt = top('nemean_lion') / top('hetairoi');
    expect(lt, `leão/hetairo (altura) ${lt.toFixed(2)}`).toBeGreaterThan(0.5);
    expect(lt).toBeLessThan(0.95);
    const lw = width('nemean_lion', 0) / width('hetairoi', 0);
    expect(lw, `leão/hetairo (comprimento, vista E) ${lw.toFixed(2)}`).toBeGreaterThan(0.75);
    expect(lw).toBeLessThan(1.4);
    const pw = width('pegasus', 0) / width('hetairoi', 0);
    expect(pw, `Pégaso/hetairo (comprimento, vista E) ${pw.toFixed(2)}`).toBeGreaterThan(0.75);
  });
  it('Pégaso no ar: o corpo bem acima do pé (centro ≥ 16 px acima) e a sombra no chão, abaixo e à direita do pé e do corpo (SE)', () => {
    for (const dir of [0, 1, 2, 3, 4, 5, 6, 7]) for (let i = 0; i < 6; i++) {
      const name = unitFrameName('pegasus', 'idle', dir, i);
      const c = pts('color', name), s = pts('shadow', name, 64);
      const cx = c.reduce((n, p) => n + p.x, 0) / c.length, cy = c.reduce((n, p) => n + p.y, 0) / c.length;
      const sx = s.reduce((n, p) => n + p.x, 0) / s.length, sy = s.reduce((n, p) => n + p.y, 0) / s.length;
      expect(cy, `${name}: centro do corpo`).toBeLessThanOrEqual(-16);
      expect(sy, `${name}: a sombra no chão (abaixo do pé)`).toBeGreaterThan(2);
      expect(sx, `${name}: a sombra à direita do pé`).toBeGreaterThan(6);
      expect(sx - cx, `${name}: sombra à direita do corpo`).toBeGreaterThan(4);
      expect(sy - cy, `${name}: sombra abaixo do corpo`).toBeGreaterThan(8);
    }
  });
  it('a hidra muda com as cabeças: mais pescoços, mais pixels (parado, vistas S e SE) — cada variante com todos os quadros', () => {
    const ids = ['hydra', 'hydra_heads2', 'hydra_heads3', 'hydra_heads4', 'hydra_heads5'];
    for (const dir of [1, 2]) {
      const n = ids.map((id) => pts('color', unitFrameName(id, 'idle', dir, 0)).length);
      expect(n[4], `5 cabeças × 1 (dir ${dir}): ${n.join(', ')}`).toBeGreaterThan(n[0] * 1.3);
      for (let k = 1; k < 5; k++) expect(n[k], `${ids[k]} ≥ ${ids[k - 1]} (dir ${dir})`).toBeGreaterThanOrEqual(n[k - 1] * 0.97);
    }
    for (const id of ids) for (const f of expandFrames(assets.get(id)!)) expect(frameOf(1, 'color', f.name), f.name).toBeTruthy();
  });
  it('silhuetas a zoom 1 (parado, as 8 direções): em média ≥ 36 % dos pixels diferem entre o lote, o hoplita e o hetairo, e nenhuma vista < 20 %', () => {
    // (de frente, S, o leão e o cavalo montado são dois vultos estreitos parecidos no contorno — 26 %; a cor separa:
    // dourado × murzelo com o cavaleiro. A média nas 8 vistas é a leitura de quem vê o bicho andar)
    const ids = [...LOT, 'hoplite', 'hetairoi'];
    const set = (id: string, dir: number) => new Set(pts('color', unitFrameName(id, 'idle', dir, 0)).map((p) => `${p.x},${p.y}`));
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      if (!LOT.includes(ids[i]) && !LOT.includes(ids[j])) continue;
      const ds: number[] = [];
      for (let dir = 0; dir < 8; dir++) {
        const A = set(ids[i], dir), B = set(ids[j], dir);
        let only = 0; for (const k of A) if (!B.has(k)) only++; for (const k of B) if (!A.has(k)) only++;
        ds.push(only / new Set([...A, ...B]).size);
      }
      const mean = ds.reduce((a, b) => a + b, 0) / 8;
      expect(mean, `${ids[i]} × ${ids[j]}: média ${(100 * mean).toFixed(0)} % (${ds.map((d) => (100 * d).toFixed(0)).join(', ')})`).toBeGreaterThanOrEqual(0.36);
      expect(Math.min(...ds), `${ids[i]} × ${ids[j]}: pior vista`).toBeGreaterThanOrEqual(0.2);
    }
  });
});
