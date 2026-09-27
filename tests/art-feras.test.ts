// Etapa 6 da arte, LOTE FERAS (docs/ART.md Apêndice G, "Lote feras"): Cérbero, Quimera e Mantícora no rig do quadrúpede
// (`beast`, poses por IK em scripts/bake/gait.mjs) e a hidra refeita no rig da serpente (1–5 cabeças, poses em
// art/poses/hydra.json). Confere os manifestos e o kit novo, as patas de apoio paradas no chão nas poses novas, a FORMA
// no próprio rig (sonda em Node, tests/feras-probe.mjs: três cabeças separadas, a cabra e a víbora acima do dorso da
// quimera com a boca aberta no sopro, a cauda de escorpião armada e as asas dobradas × abertas da mantícora) e — com o
// bake local — a leitura a zoom 1: cor de time visível em todos os quadros parados e andando das 8 direções, sombra para
// SE, escala contra o hoplita, o leão e o hetairo, a goela em brasa no quadro do sopro, a hidra mudando a cada cabeça e
// silhuetas distintas entre as feras, o leão, o hoplita e o hetairo.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { loadManifests, loadAssets, validateManifest, expandFrames, posesOf, type ArtManifest } from '../scripts/bake/manifest.mjs';
import { poseErrors, runCheck } from '../scripts/bake/check';
import { measureUnit, footSamples } from '../scripts/bake/measure.mjs';
import { UNIT_KITS } from '../scripts/bake/page/rigs/units.js';
import { UNITS } from '../src/core/data';
import { RUN_SPEED, unitFrameName } from '../src/render/art/logic';
import type { ArtManifest as ArtIndex, SheetJson } from '../src/render/art/types';
import { probeBeast } from './feras-probe.mjs';

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'public', 'art');
const BEASTS = ['cerberus', 'chimera', 'manticore'];
const LOT = [...BEASTS, 'hydra'];
const HYDRA_IDS = ['hydra', 'hydra_heads2', 'hydra_heads3', 'hydra_heads4', 'hydra_heads5'];
const manifests = new Map(loadManifests(path.join(ROOT, 'art', 'manifest')).map((l) => [l.manifest.id, l.manifest]));
const assets = new Map(loadAssets(path.join(ROOT, 'art', 'manifest')).map((m) => [m.id, m]));
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const posesFor = (m: ArtManifest) => { const pf = posesOf(m); return { main: pf.main ? readJson(pf.main) : null, rider: pf.rider ? readJson(pf.rider) : null }; };
const paramsOf = (id: string) => { const s = manifests.get(id)!.source; return (s.type === 'param' ? s.params : {}) as Record<string, unknown>; };
/** Sonda o rig de uma fera no quadro `frame` da animação `anim` do manifesto. */
const probe = (id: string, anim: string, frame = 0) => {
  const m = manifests.get(id)!, a = m.anims![anim];
  return probeBeast(paramsOf(id), posesFor(m).main.anims[a.pose!], frame, a.frames);
};

describe('Lote feras: manifestos e kit', () => {
  it('as quatro criaturas: tipos míticos do jogo, rig, classe myth, página própria, 8 direções, time, sombra e as animações de cada uma', () => {
    for (const id of LOT) {
      const m = manifests.get(id)!;
      expect(m, id).toBeTruthy();
      expect(validateManifest(m), id).toEqual([]);
      expect(poseErrors(ROOT, m), id).toEqual([]);
      const u = UNITS[id];
      expect(u?.tags, id).toContain('myth');
      expect(m.source.type === 'param' && m.source.rig, id).toBe(id === 'hydra' ? 'serpent' : 'beast');
      expect([m.sizeClass, m.page, m.stage, m.dirs, m.team, m.shadow, !!m.flying], id).toEqual(['myth', 'own', 6, 8, true, true, false]);
      for (const a of ['idle', 'walk', 'attack', 'die']) expect(m.anims?.[a], `${id} ${a}`).toBeTruthy();
      // galope só para a mantícora (3,2 = RUN_SPEED); o Cérbero (3,4) anda pelo `walk` avançado pela distância — com o
      // galope ele não cabia numa página 2048² a 2×; mira só para quem atira (mantícora)
      expect(!!m.anims!.run, `${id} run`).toBe(id === 'manticore');
      if (m.anims!.run) expect(u.speed, `${id}: galopa solto`).toBeGreaterThanOrEqual(RUN_SPEED);
      expect(!!m.anims!.aim, `${id} aim`).toBe(u.tags.includes('ranged'));
    }
    // a hidra usa as próprias poses (serpent.json fica para a Medusa e os titãs)
    const hy = manifests.get('hydra')!;
    expect(hy.source.type === 'param' && hy.source.poses).toBe('art/poses/hydra.json');
    expect(Object.keys(readJson('art/poses/hydra.json').anims)).toEqual(['idle_hydra', 'slither', 'strike_hydra', 'die_hydra']);
  });
  it('kit: os valores novos do quadrúpede e da serpente são aceitos, outros recusados; o leão não usa nenhum deles', () => {
    const beast = UNIT_KITS.beast as Record<string, unknown[]>;
    expect(beast.coat).toEqual(expect.arrayContaining(['hellhound', 'chimera']));
    expect(beast.team).toContain('croup');
    expect([beast.eyes, beast.mouth, beast.back]).toEqual([['amber', 'fire'], ['closed', 'fangs', 'fire'], ['none', 'serpents']]);
    expect((UNIT_KITS.serpent as Record<string, unknown[]>).scales).toContain('swamp');
    const cer = manifests.get('cerberus')!;
    for (const [k, bad] of [['mouth', 'smile'], ['eyes', 'blue'], ['back', 'spikes'], ['coat', 'zebra'], ['team', 'saddle']] as const) {
      expect(validateManifest({ ...cer, source: { ...cer.source, params: { ...paramsOf('cerberus'), [k]: bad } } } as never).join(), k).toMatch(new RegExp(k));
    }
    const lion = paramsOf('nemean_lion');
    for (const k of ['eyes', 'mouth', 'back']) expect(lion[k], `leão: ${k}`).toBeUndefined();
    expect(['cloth', 'nemean', 'lion', 'tuft']).toEqual([lion.team, lion.coat, lion.mane, lion.tail]);
  });
  it('kits das feras: Cérbero de 3 cabeças com olhos em brasa e presas; quimera com a cabra, a víbora e a goela em brasa; mantícora com rosto humano, escorpião e asas de morcego', () => {
    expect(paramsOf('cerberus')).toMatchObject({ build: 'hound', heads: 3, face: 'hound', coat: 'hellhound', eyes: 'fire', mouth: 'fangs', back: 'serpents', team: 'collar' });
    expect(paramsOf('chimera')).toMatchObject({ build: 'heavy', goat: true, tail: 'serpent', mouth: 'fire', team: 'croup', mane: 'lion' });
    expect(paramsOf('manticore')).toMatchObject({ face: 'human', tail: 'scorpion', wings: 'bat', team: 'harness', coat: 'tawny' });
    expect(paramsOf('hydra')).toMatchObject({ form: 'hydra', scales: 'swamp', team: 'band' });
  });
});

describe('Lote feras: poses por IK e forma no rig', () => {
  it('andar e galope das feras: a pata de apoio fica no chão e recua a passada do gerador (como o leão)', () => {
    for (const id of BEASTS) {
      const m = manifests.get(id)!, poses = posesFor(m), size = Number(paramsOf(id).size ?? 1);
      for (const [anim, S] of [['walk', id === 'chimera' ? 1.4 : 1.5], ['run', 3.8]] as const) {
        const a = m.anims![anim]; if (!a) continue;
        const step = (S * size * 0.5) / a.frames;
        const samples = footSamples(m, poses, anim)!;
        let pairs = 0;
        for (let i = 0; i < a.frames; i++) samples[i].forEach((A, k) => {
          if (A.low >= 0.01) return;
          expect(A.low, `${id} ${anim} ${i}: pata abaixo do chão`).toBeGreaterThan(-0.008);
          const B = samples[(i + 1) % a.frames][k];
          if (B.low < 0.01) { pairs++; expect(Math.abs(B.z - A.z - step) / step, `${id} ${anim} ${i} pata ${k}`).toBeLessThan(0.1); }
        });
        expect(pairs, `${id} ${anim}: pares apoiados`).toBeGreaterThanOrEqual(anim === 'run' ? 3 : 12);
        const me = measureUnit(m, poses)!;
        expect(me.strides[anim] / (S * size * 0.5), `${id} ${anim}: passada medida`).toBeGreaterThan(anim === 'run' ? 0.8 : 0.95);
      }
    }
  });
  it('Cérbero: três cabeças separadas (as de fora ≥ 0,6 m para cada lado, a do meio mais alta) e seis olhos em brasa, parado, andando e mordendo', () => {
    for (const [anim, fr] of [['idle', 0], ['walk', 3], ['walk', 6], ['attack', 1]] as const) {
      const p = probe('cerberus', anim, fr);
      expect(p.heads, anim).toHaveLength(3);
      const [l, c, r] = p.heads;
      expect(c.x - l.x, `${anim}: esquerda`).toBeGreaterThan(0.6);
      expect(r.x - c.x, `${anim}: direita`).toBeGreaterThan(0.6);
      expect(c.y, `${anim}: a do meio mais alta`).toBeGreaterThan(Math.max(l.y, r.y));
      expect(p.eyes, anim).toHaveLength(6);
    }
  });
  it('Quimera: a víbora da cauda ≥ 0,6 m acima do dorso; no sopro (quadros 0–2) a goela aberta ≥ 40° e fechando no fim', () => {
    for (const [anim, fr] of [['idle', 0], ['idle', 2], ['walk', 0], ['walk', 5]] as const) {
      const p = probe('chimera', anim, fr);
      expect(p.tailTip.y - p.backTop, `${anim} ${fr}: víbora acima do dorso`).toBeGreaterThan(0.6);
      expect(p.eyes, 'leão, cabra e víbora').toHaveLength(6);
    }
    const a = manifests.get('chimera')!.anims!.attack;
    for (let i = 0; i < 3; i++) expect(probe('chimera', 'attack', i).jawOpen, `sopro ${i}`).toBeGreaterThanOrEqual(40);
    expect(probe('chimera', 'attack', a.frames - 1).jawOpen).toBeLessThan(20);
    // a cabeça do leão erguida no sopro (a goela à mostra vista de cima): acima da cabeça parada
    expect(probe('chimera', 'attack', 0).heads[0].y).toBeGreaterThan(probe('chimera', 'idle', 0).heads[0].y - 0.2);
  });
  it('Mantícora: a cauda de escorpião armada sobre o dorso; no disparo ela chicoteia para a frente e as asas abrem; parada, as asas recolhidas e caídas sobre os flancos', () => {
    for (const [anim, fr] of [['idle', 0], ['walk', 0], ['walk', 4], ['aim', 0]] as const) {
      const p = probe('manticore', anim, fr);
      expect(p.tailTip.y - p.backTop, `${anim} ${fr}: ferrão acima do dorso`).toBeGreaterThan(0.3);
    }
    const idle = probe('manticore', 'idle', 0), shot = probe('manticore', 'attack', 0), aim = probe('manticore', 'aim', 0);
    expect(shot.tailTip.z, 'disparo: o ferrão passa do meio do corpo para a frente').toBeLessThan(idle.tailTip.z - 0.3);
    // pontas das asas: parada, recolhidas (a mão dobrada para trás) e caídas abaixo do dorso, atrás dos ombros; no disparo,
    // abertas e erguidas acima do dorso; na mira, entre as duas
    const span = (q: typeof idle) => Math.max(...q.wingEnds.map((w) => Math.abs(w.x)));
    for (const w of idle.wingEnds) { expect(w.y, 'parada: ponta abaixo do dorso').toBeLessThan(idle.backTop - 0.2); expect(w.z, 'parada: ponta atrás').toBeGreaterThan(0.5); }
    for (const w of shot.wingEnds) expect(w.y, 'disparo: ponta acima do dorso').toBeGreaterThan(shot.backTop + 0.4);
    expect(span(shot), 'asas abertas no disparo').toBeGreaterThan(span(idle) + 0.5);
    expect(span(aim), 'mira: meio abertas').toBeGreaterThan(span(idle) + 0.2);
    expect(span(aim)).toBeLessThan(span(shot));
  });
  it('hidra: a passada continua um comprimento de onda por ciclo; o topo sobe com as cabeças', () => {
    const tops = HYDRA_IDS.map((id) => { const m = assets.get(id)!; return Math.min(...measureUnit(m, posesFor(m))!.tops); });
    const me = measureUnit(assets.get('hydra')!, posesFor(assets.get('hydra')!))!;
    expect(me.strides.walk).toBeCloseTo(7 * 0.3 * 0.5, 2);
    for (const t of tops) expect(t).toBeGreaterThan(20);
    expect(tops[4], `topo 5 × 1 cabeça: ${tops.join(', ')}`).toBeGreaterThanOrEqual(tops[0] - 1);
  });
});

const hasArt = fs.existsSync(path.join(ART, 'manifest.json'));
describe.skipIf(!hasArt)('Lote feras: atlas (bake local)', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8')) as ArtIndex;
  const sheets = new Map<string, SheetJson>();
  const imgs = new Map<string, PNG>();
  for (const a of index.atlases) if (a.group === 'units') sheets.set(a.json, JSON.parse(fs.readFileSync(path.join(ART, a.json), 'utf8')) as SheetJson);
  const frameOf = (pass: string, name: string) => {
    for (const a of index.atlases) if (a.group === 'units' && a.scale === 1 && a.pass === pass) {
      const f = sheets.get(a.json)!.frames[name];
      if (!f) continue;
      if (!imgs.has(a.image)) imgs.set(a.image, PNG.sync.read(fs.readFileSync(path.join(ART, a.image))));
      return { f, img: imgs.get(a.image)!, k: 1 / (a.texel ?? 1) };
    }
    return null;
  };
  /** Pixels (1×, relativos ao pé) com alfa ≥ `min` e o RGBA de cada um. */
  const pix = (pass: string, name: string, min = 128) => {
    const r = frameOf(pass, name); if (!r) return [];
    const { f, img, k } = r, out: { x: number; y: number; r: number; g: number; b: number }[] = [];
    const ax = f.anchor.x * f.sourceSize.w, ay = f.anchor.y * f.sourceSize.h;
    for (let y = 0; y < f.frame.h; y++) for (let x = 0; x < f.frame.w; x++) {
      const i = ((f.frame.y + y) * img.width + f.frame.x + x) * 4;
      if (img.data[i + 3] >= min) out.push({ x: Math.round((f.spriteSourceSize.x + x - ax) * k), y: Math.round((f.spriteSourceSize.y + y - ay) * k), r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] });
    }
    return out;
  };
  const top = (id: string, dir = 2) => -Math.min(...pix('color', unitFrameName(id, 'idle', dir, 0)).map((p) => p.y));
  const width = (id: string, dir: number) => { const p = pix('color', unitFrameName(id, 'idle', dir, 0)); return Math.max(...p.map((q) => q.x)) - Math.min(...p.map((q) => q.x)); };

  it('art:check sem erros; cada fera em páginas próprias, classe myth no índice, todos os quadros', () => {
    expect(runCheck(ROOT).errors).toEqual([]);
    for (const id of [...BEASTS, ...HYDRA_IDS]) {
      const a = index.assets[id];
      expect([a?.kind, a?.sizeClass], id).toEqual(['unit', 'myth']);
      for (const s of ['1', '2']) for (const pass of ['color', 'team', 'shadow'] as const) for (const j of a.atlases[s][pass] ?? []) {
        expect(Object.keys(sheets.get(j)!.frames).every((n) => n.startsWith(id + '/')), `${id} ${j}`).toBe(true);
      }
      for (const f of expandFrames(assets.get(id)!)) expect(frameOf('color', f.name), f.name).toBeTruthy();
    }
  });
  it('cor de time visível em TODOS os quadros parados e andando das 8 direções (≥ 12 px a 1×) e a sombra para SE', () => {
    for (const id of [...BEASTS, 'hydra', 'hydra_heads5']) {
      const m = assets.get(id)!;
      for (const anim of ['idle', 'walk']) for (let dir = 0; dir < 8; dir++) for (let i = 0; i < m.anims![anim].frames; i++) {
        const name = unitFrameName(id, anim, dir, i);
        expect(pix('team', name, 64).length, `${name}: time`).toBeGreaterThanOrEqual(12);
      }
      for (let dir = 0; dir < 8; dir++) {
        const name = unitFrameName(id, 'idle', dir, 0), c = pix('color', name), s = pix('shadow', name, 64);
        const cx = c.reduce((n, p) => n + p.x, 0) / c.length, sx = s.reduce((n, p) => n + p.x, 0) / s.length;
        const cy = c.reduce((n, p) => n + p.y, 0) / c.length, sy = s.reduce((n, p) => n + p.y, 0) / s.length;
        expect(sx - cx, `${name}: sombra à direita`).toBeGreaterThan(2);
        expect(sy - cy, `${name}: sombra abaixo`).toBeGreaterThan(2);
      }
    }
  });
  it('escala a zoom 1: Cérbero maior que o leão e do comprimento de um cavalo; quimera maior que o leão (a víbora da cauda sobe acima da juba); mantícora ≥ 0,8 leão; todos acima do hoplita', () => {
    const t = (id: string) => top(id);
    for (const id of [...BEASTS, 'hydra_heads3']) expect(t(id), `${id} × hoplita`).toBeGreaterThan(t('hoplite'));
    expect(t('cerberus') / t('nemean_lion'), 'Cérbero/leão (altura)').toBeGreaterThan(1.05);
    const cw = width('cerberus', 0) / width('hetairoi', 0);
    expect(cw, `Cérbero/hetairo (comprimento) ${cw.toFixed(2)}`).toBeGreaterThan(0.85);
    expect(cw).toBeLessThan(1.8);
    const ch = t('chimera') / t('nemean_lion');
    expect(ch, `quimera/leão ${ch.toFixed(2)}`).toBeGreaterThan(1.2);
    expect(ch).toBeLessThan(2.1);
    expect(t('manticore') / t('nemean_lion'), 'mantícora/leão').toBeGreaterThan(0.8);
  });
  it('quimera: a goela em brasa aparece no quadro do sopro (laranja vivo) e não no parado', () => {
    const fire = (name: string) => pix('color', name).filter((p) => p.r >= 225 && p.g >= 110 && p.g <= 215 && p.b <= 110 && p.r - p.b >= 140).length;
    let breath = 0, rest = 0;
    for (const dir of [0, 1, 2, 3, 4]) { breath += fire(unitFrameName('chimera', 'attack', dir, 0)); rest += fire(unitFrameName('chimera', 'idle', dir, 0)); }
    expect(breath, `sopro ${breath} × parado ${rest}`).toBeGreaterThanOrEqual(10);
    expect(breath).toBeGreaterThan(rest * 3 + 5);
  });
  it('a hidra muda a cada cabeça: mais pixels (parado, S e SE) de uma variante para a seguinte', () => {
    for (const dir of [1, 2]) {
      const n = HYDRA_IDS.map((id) => pix('color', unitFrameName(id, 'idle', dir, 0)).length);
      for (let k = 1; k < 5; k++) expect(n[k], `${HYDRA_IDS[k]} > ${HYDRA_IDS[k - 1]} (dir ${dir}): ${n.join(', ')}`).toBeGreaterThan(n[k - 1] * 1.02);
      expect(n[4], `5 × 1 cabeça (dir ${dir})`).toBeGreaterThan(n[0] * 1.3);
    }
  });
  it('silhuetas a zoom 1 (parado, 8 direções): em média ≥ 36 % dos pixels diferem entre as feras, o leão, o hoplita e o hetairo', () => {
    const ids = [...BEASTS, 'hydra_heads3', 'nemean_lion', 'hoplite', 'hetairoi'];
    const set = (id: string, dir: number) => new Set(pix('color', unitFrameName(id, 'idle', dir, 0)).map((p) => `${p.x},${p.y}`));
    const bad: string[] = [], all: string[] = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      if (!LOT.includes(ids[i].replace('_heads3', '')) && !LOT.includes(ids[j].replace('_heads3', ''))) continue;
      const ds: number[] = [];
      for (let dir = 0; dir < 8; dir++) {
        const A = set(ids[i], dir), B = set(ids[j], dir);
        let only = 0; for (const k of A) if (!B.has(k)) only++; for (const k of B) if (!A.has(k)) only++;
        ds.push(only / new Set([...A, ...B]).size);
      }
      const mean = ds.reduce((a, b) => a + b, 0) / 8, line = `${ids[i]} × ${ids[j]}: média ${(100 * mean).toFixed(0)} % (${ds.map((d) => (100 * d).toFixed(0)).join(', ')})`;
      all.push(line);
      if (mean < 0.36 || Math.min(...ds) < 0.2) bad.push(line);
    }
    // (todos os pares de uma vez: a mensagem mostra a tabela inteira quando algum par falha)
    expect(bad, all.join('\n')).toEqual([]);
  });
});
