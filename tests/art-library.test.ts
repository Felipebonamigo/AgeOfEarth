// Arte assada no renderizador (docs/ART.md §3.7, Etapa 2 parte B): funções puras de src/render/art/logic.ts e o
// contrato com os artefatos da parte A — toda chave que o renderizador vai pedir para hoplita, cidadão, templo e props
// existe nos três passes (cor, time, sombra) e nas duas escalas, e os atlas passam na checagem de meta.aoe.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  dirFromAngle, dirFromVector, dirWithHysteresis, chooseAnim, frameIndex, animDuration, unitFrameName, unitAnimName, buildingFrameName,
  propFrameName, buildingStage, treeLook, stumpVariant, animalDir, amountStage, nodeFrameName, nodeStage, treeScale, treeOffset, checkSheetMeta, pickScale,
  isMirrored, frameBox, mulColor, isWalking, freshHit, deathAlpha, type UnitAnim,
} from '../src/render/art/logic';
import type { ArtManifest, SheetJson } from '../src/render/art/types';
import { resolveQuality, QUALITY_PRESETS } from '../src/render/quality';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/game/settings';

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'public', 'art');
const PI = Math.PI;

describe('direção (8, 0 = E, sentido horário na tela)', () => {
  it('vetores de tela nas 8 direções e o ângulo nas bordas', () => {
    const cases: [number, number, number][] = [[1, 0, 0], [1, 1, 1], [0, 1, 2], [-1, 1, 3], [-1, 0, 4], [-1, -1, 5], [0, -1, 6], [1, -1, 7]];
    for (const [dx, dy, d] of cases) expect(dirFromVector(dx, dy), `${dx},${dy}`).toBe(d);
    expect(dirFromVector(0, 0)).toBe(-1);
    expect(dirFromAngle(PI)).toBe(4); expect(dirFromAngle(-PI)).toBe(4);
    expect(dirFromAngle(-PI / 2)).toBe(6); expect(dirFromAngle(2 * PI)).toBe(0);
    expect(dirFromAngle(PI / 8 - 0.01)).toBe(0); expect(dirFromAngle(PI / 8 + 0.01)).toBe(1);
    expect(dirFromAngle(-PI / 8 - 0.01)).toBe(7);
    // fórmula do contrato: ((round(angle/(π/4)) % 8) + 8) % 8
    for (let a = -7; a <= 7; a += 0.05) expect(dirFromAngle(a)).toBe(((Math.round(a / (PI / 4)) % 8) + 8) % 8);
  });
  it('histerese: não pisca na fronteira de 22,5°; muda quando passa da margem', () => {
    expect(dirWithHysteresis(PI / 8 + 0.05, 0)).toBe(0);
    expect(dirWithHysteresis(PI / 8 + 0.2, 0)).toBe(1);
    expect(dirWithHysteresis(-PI / 8 - 0.05, 0)).toBe(0);
    expect(dirWithHysteresis(PI, 0)).toBe(4);
    expect(dirWithHysteresis(0.1, -1)).toBe(0);            // sem direção anterior
    expect(dirWithHysteresis(-PI + 0.05, 4)).toBe(4);      // volta pelo ±π
  });
});

describe('animação e quadro por tempo (10 fps)', () => {
  const all = (a: UnitAnim) => a !== 'die';
  const hop = (a: UnitAnim) => a === 'idle' || a === 'walk' || a === 'attack';
  it('ataque > andar/carregar > coletar > parado, com recuo para a animação que existe', () => {
    expect(chooseAnim({ moving: false, attacking: false, carrying: false, working: false }, all)).toBe('idle');
    expect(chooseAnim({ moving: true, attacking: false, carrying: false, working: false }, all)).toBe('walk');
    expect(chooseAnim({ moving: true, attacking: false, carrying: true, working: false }, all)).toBe('carry');
    expect(chooseAnim({ moving: true, attacking: false, carrying: true, working: false }, hop)).toBe('walk');
    expect(chooseAnim({ moving: false, attacking: false, carrying: true, working: true }, all)).toBe('gather');
    expect(chooseAnim({ moving: false, attacking: false, carrying: false, working: true }, hop)).toBe('idle');
    expect(chooseAnim({ moving: true, attacking: true, carrying: false, working: false }, all)).toBe('attack');
  });
  it('andar de fato: o empurrão da separação não vira passo (histerese 30 % / 15 % do passo)', () => {
    const step = 2.2 / 20;   // hoplita: 0,11 tile/tick
    expect(isWalking(step * step, step, false)).toBe(true);
    for (const push of [0.005, 0.02, 0.03]) expect(isWalking(push * push, step, false), `${push}`).toBe(false);
    expect(isWalking(0.02 * 0.02, step, true)).toBe(true);    // andando, continua até cair abaixo de 15 %
    expect(isWalking(0.01 * 0.01, step, true)).toBe(false);
    expect(isWalking(0, step, true)).toBe(false);
  });
  it('golpe: só um attackTick novo E recente anima (vista que volta à tela não toca golpe antigo)', () => {
    expect(freshHit(100, 90, 101, 12)).toBe(true);
    expect(freshHit(100, 100, 101, 12)).toBe(false);          // já visto
    expect(freshHit(100, -100, 2100, 12)).toBe(false);        // golpe de 100 s atrás
    expect(freshHit(100, -100, 112, 12)).toBe(true);
  });
  it('morte: opaca até o último quadro da queda, depois apaga até o fim do efeito', () => {
    // queda de 0,6 s = 12 ticks num efeito de 24: apaga a partir da metade
    expect(deathAlpha(0.3, 12, 24)).toBe(1); expect(deathAlpha(0.49, 12, 24)).toBe(1);
    expect(deathAlpha(0.75, 12, 24)).toBeCloseTo(0.5); expect(deathAlpha(1, 12, 24)).toBe(0);
    // queda mais longa que meio efeito: começa a apagar só depois dela (até 85 %)
    expect(deathAlpha(0.6, 18, 24)).toBe(1); expect(deathAlpha(0.8, 18, 24)).toBeLessThan(1);
  });
  it('loop volta ao 0 sem repetir o último; sem loop para no último', () => {
    expect([0, 0.05, 0.1, 0.3, 0.79, 0.8, 1.25].map((t) => frameIndex(t, 8, 10, true))).toEqual([0, 0, 1, 3, 7, 0, 4]);
    expect([0, 0.1, 0.55, 0.6, 5].map((t) => frameIndex(t, 6, 10, false))).toEqual([0, 1, 5, 5, 5]);
    expect(frameIndex(-1, 6, 10, false)).toBe(0);
    expect(frameIndex(3, 1, 10, true)).toBe(0);
    expect(animDuration(6, 10)).toBeCloseTo(0.6);
  });
  it('nomes de quadro', () => {
    expect(unitFrameName('hoplite', 'walk', 3, 5)).toBe('hoplite/walk/3/05');
    expect(unitFrameName('villager', 'carry', 0, 12)).toBe('villager/carry/0/12');
    expect(unitAnimName('hoplite', 'die', 7)).toBe('hoplite/die/7');
    expect(buildingFrameName('temple', 'build1')).toBe('temple/build1');
    expect(propFrameName('olive', 2, 'big')).toBe('olive/2/big');
    expect(propFrameName('berry', 'half')).toBe('berry/half');
  });
});

describe('estágios (obra e props)', () => {
  it('obra: < 33 % build0, < 66 % build1, < 100 % build2, completo', () => {
    expect([0, 0.2, 0.33, 0.34, 0.5, 0.66, 0.67, 0.99].map((f) => buildingStage(f, false))).toEqual(['build0', 'build0', 'build0', 'build1', 'build1', 'build1', 'build2', 'build2']);
    expect(buildingStage(1, false)).toBe('build2');
    expect(buildingStage(0.1, true)).toBe('complete');
    expect(buildingStage(Number.NaN, false)).toBe('build0');
  });
  it('props por amount/max: frutas full/half/empty, ouro 0–2, árvore em corte thin, animais por direção', () => {
    expect(amountStage(100, 100)).toBe(0); expect(amountStage(50, 100)).toBe(1); expect(amountStage(10, 100)).toBe(2); expect(amountStage(1, 0)).toBe(2);
    expect(nodeFrameName('berry', 1, 3, 4, 200, 200)).toBe('berry/full');
    expect(nodeFrameName('berry', 1, 3, 4, 100, 200)).toBe('berry/half');
    expect(nodeFrameName('berry', 1, 3, 4, 20, 200)).toBe('berry/empty');
    expect(nodeFrameName('gold', 1, 3, 4, 800, 800)).toBe('gold/0');
    expect(nodeFrameName('gold', 1, 3, 4, 100, 800)).toBe('gold/2');
    expect(nodeFrameName('lure', 1, 3, 4, 1, 1)).toBe('lure/0');
    const t = treeLook(10, 20);
    expect(nodeFrameName('tree', 1, 10, 20, 150, 150)).toBe(`${t.species}/${t.variant}/${t.size}`);
    expect(nodeFrameName('tree', 1, 10, 20, 149, 150)).toBe(`${t.species}/0/thin`);
    for (let id = 0; id < 50; id++) expect([0, 2, 4, 6]).toContain(animalDir(id));
    expect(nodeFrameName('deer', 7, 0, 0, 1, 1)).toBe(`deer/${animalDir(7)}`);
    expect(nodeFrameName('unknown', 1, 0, 0, 1, 1)).toBeNull();
    // estágio barato que decide quando trocar o quadro
    expect(nodeStage('tree', 150, 150)).toBe(0); expect(nodeStage('tree', 149, 150)).toBe(1);
    expect(nodeStage('berry', 50, 100)).toBe(1); expect(nodeStage('gold', 10, 100)).toBe(2); expect(nodeStage('deer', 1, 100)).toBe(0);
  });
  it('árvores: determinísticas por tile, as 3 espécies em manchas, 4 variantes, porte e escala', () => {
    expect(treeLook(33, 44)).toEqual(treeLook(33, 44));
    const species = new Set<string>(), variants = new Set<number>(), sizes = new Set<string>();
    let same = 0, pairs = 0;
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      const t = treeLook(x, y); species.add(t.species); variants.add(t.variant); sizes.add(t.size);
      if (x > 0) { pairs++; if (treeLook(x - 1, y).species === t.species) same++; }
      const k = treeScale(x, y); expect(k >= 0.94 && k <= 1.06).toBe(true);
      const o = treeOffset(x, y); expect(Math.abs(o.dx) <= 0.18 && Math.abs(o.dy) <= 0.14).toBe(true);   // tronco sempre dentro do tile
      expect([0, 1, 2]).toContain(stumpVariant(x, y));
    }
    expect([...species].sort()).toEqual(['cypress', 'oak', 'olive']);
    expect([...variants].sort()).toEqual([0, 1, 2, 3]);
    expect([...sizes].sort()).toEqual(['big', 'small']);
    expect(same / pairs).toBeGreaterThan(0.75);   // vizinhos quase sempre da mesma espécie (bosques, não confete)
  });
});

describe('atlas: meta.aoe, escala, espelhamento e cor', () => {
  const meta = (o: Record<string, unknown> = {}) => ({ version: 1, pass: 'color' as const, pxPerTile: 32, pitchDeg: 50, ...o });
  it('recusa atlas fora do contrato', () => {
    expect(checkSheetMeta(meta(), 1)).toBeNull();
    expect(checkSheetMeta(meta({ pxPerTile: 64 }), 2, 'color')).toBeNull();
    expect(checkSheetMeta(meta({ pxPerTile: 64 }), 1)).toMatch(/pxPerTile/);
    expect(checkSheetMeta(meta({ pitchDeg: 90 }), 1)).toMatch(/pitchDeg/);
    expect(checkSheetMeta(meta({ version: 2 }), 1)).toMatch(/versão/);
    expect(checkSheetMeta(meta(), 1, 'team')).toMatch(/passe/);
    expect(checkSheetMeta(undefined, 1)).toMatch(/ausente/);
  });
  it('1×/2× pelo preset; 2× só se existir', () => {
    expect(pickScale(2, [1, 2])).toBe(2); expect(pickScale(2, [1])).toBe(1); expect(pickScale(1, [1, 2])).toBe(1);
  });
  it('espelhado com scale.x = −1: a caixa do quadro (pick) troca de lado em volta do pé; y e o pé não mudam', () => {
    expect(isMirrored({ 0: 4, 1: 3, 7: 5 }, 1)).toBe(true);
    expect(isMirrored({ 0: 4 }, 2)).toBe(false); expect(isMirrored(null, 0)).toBe(false);
    // quadro 88×72, âncora (0,4; 0,8) → pé em (35,2; 57,6) da moldura; recorte x 30–60, y 10–62
    const f = { orig: { width: 88, height: 72 }, trim: { x: 30, y: 10, width: 30, height: 52 } }, anchor = { x: 0.4, y: 0.8 };
    const out = { x0: 0, y0: 0, x1: 0, y1: 0 };
    const n = { ...frameBox(f, anchor, false, out) };
    expect(n.x0).toBeCloseTo(30 - 35.2); expect(n.x1).toBeCloseTo(60 - 35.2);
    expect(n.y0).toBeCloseTo(10 - 57.6); expect(n.y1).toBeCloseTo(62 - 57.6);
    const m = frameBox(f, anchor, true, out);
    expect(m.x0).toBeCloseTo(-n.x1); expect(m.x1).toBeCloseTo(-n.x0);   // o que ficava à direita do pé vai para a esquerda
    expect(m.y0).toBeCloseTo(n.y0); expect(m.y1).toBeCloseTo(n.y1);
    // um ponto da textura cai do lado oposto do pé no espelhado (Pixi: scale.x = −1 gira em torno da âncora)
    const px = 58 - 35.2;   // coluna 58 da moldura, 22,8 px à direita do pé
    expect(px >= n.x0 && px <= n.x1).toBe(true); expect(-px >= m.x0 && -px <= m.x1).toBe(true); expect(px >= m.x0 && px <= m.x1).toBe(false);
    // sem recorte: a moldura inteira
    const full = frameBox({ orig: { width: 64, height: 64 } }, { x: 0.5, y: 1 }, true, out);
    expect([full.x0, full.x1, full.y0, full.y1]).toEqual([-32, 32, -64, 0]);
  });
  it('tint composto por canal', () => {
    expect(mulColor(0xffffff, 0x3b82f6)).toBe(0x3b82f6);
    expect(mulColor(0x3b82f6, 0xffffff)).toBe(0x3b82f6);
    expect(mulColor(0x808080, 0x808080)).toBe(0x404040);
    expect(mulColor(0xff0000, 0x00ff00)).toBe(0);
  });
});

describe('qualidade e opções: arte assada', () => {
  it('bakedArt ligada em todos os presets; desligável pela opção; 2× só no alto', () => {
    for (const p of QUALITY_PRESETS) expect(resolveQuality(p).bakedArt).toBe(true);
    expect(resolveQuality('high', { bakedArt: false }).bakedArt).toBe(false);
    expect(resolveQuality('high').atlasScale).toBe(2);
    expect(resolveQuality('medium').atlasScale).toBe(1); expect(resolveQuality('low').atlasScale).toBe(1); expect(resolveQuality('auto').atlasScale).toBe(1);
  });
  it('Settings.bakedArt: padrão true, saves antigos ganham true, false persiste', () => {
    expect(DEFAULT_SETTINGS.bakedArt).toBe(true);
    expect(sanitizeSettings({ volume: 0.2 }).bakedArt).toBe(true);
    expect(sanitizeSettings({ bakedArt: false }).bakedArt).toBe(false);
  });
});

// ---------------- Contrato com os artefatos da parte A (public/art) ----------------
const hasArt = fs.existsSync(path.join(ART, 'manifest.json'));
describe.skipIf(!hasArt)('artefatos do bake: toda chave pedida pelo renderizador existe', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8')) as ArtManifest;
  const sheets = new Map<string, SheetJson>();
  for (const a of manifest.atlases) sheets.set(a.json, JSON.parse(fs.readFileSync(path.join(ART, a.json), 'utf8')) as SheetJson);
  /** Quadros e animações de um grupo/escala/passe (união das páginas). */
  const passOf = (group: string, scale: number, pass: string) => {
    const frames = new Set<string>(), anims = new Map<string, string[]>();
    for (const a of manifest.atlases) if (a.group === group && a.scale === scale && a.pass === pass) {
      const j = sheets.get(a.json)!;
      for (const k of Object.keys(j.frames)) frames.add(k);
      for (const [k, v] of Object.entries(j.animations ?? {})) anims.set(k, v);
    }
    return { frames, anims };
  };
  const scales = [...new Set(manifest.atlases.map((a) => a.scale))].sort();

  it('todo atlas passa na checagem de meta.aoe da sua escala e do seu passe (e a imagem existe)', () => {
    expect(scales).toEqual([1, 2]);
    for (const a of manifest.atlases) {
      const j = sheets.get(a.json)!;
      expect(checkSheetMeta(j.meta.aoe, a.scale as 1 | 2, a.pass), a.json).toBeNull();
      expect(j.meta.scale).toBe(String(a.scale));
      expect(fs.existsSync(path.join(ART, j.meta.image)), j.meta.image).toBe(true);
    }
  });

  it('hoplita e cidadão: animação × 8 direções × quadros nos três passes, nas duas escalas', () => {
    for (const id of ['hoplite', 'villager']) {
      const a = manifest.assets[id];
      expect(a?.kind).toBe('unit');
      expect(a.team && a.shadow).toBe(true);
      const want = id === 'villager' ? ['idle', 'walk', 'attack', 'die', 'carry', 'gather'] : ['idle', 'walk', 'attack', 'die'];
      expect(Object.keys(a.anims!).sort()).toEqual([...want].sort());
      for (const s of scales) for (const pass of ['color', 'team', 'shadow']) {
        const p = passOf(a.group, s, pass);
        for (const [anim, info] of Object.entries(a.anims!)) for (let d = 0; d < 8; d++) {
          const list = p.anims.get(unitAnimName(id, anim, d));
          expect(list, `${id}/${anim}/${d} ${pass} ${s}x`).toHaveLength(info.frames);
          for (let i = 0; i < info.frames; i++) expect(p.frames.has(unitFrameName(id, anim, d, i)), `${unitFrameName(id, anim, d, i)} ${pass} ${s}x`).toBe(true);
        }
      }
      // âncora e moldura iguais em todos os quadros (o renderizador põe os três sprites no mesmo ponto)
      for (const s of scales) {
        const size = a.sizes![String(s)];
        for (const a2 of manifest.atlases) if (a2.group === a.group && a2.scale === s) for (const [k, f] of Object.entries(sheets.get(a2.json)!.frames)) if (k.startsWith(id + '/')) {
          expect(f.anchor).toEqual(size.anchor); expect(f.sourceSize).toEqual(size.sourceSize);
        }
      }
    }
  });

  it('templo: build0/1/2 e completo nos três passes; demais edifícios sem arte (procedurais)', () => {
    const a = manifest.assets.temple;
    expect(a?.kind).toBe('building');
    for (const s of scales) for (const pass of ['color', 'team', 'shadow']) {
      const p = passOf('buildings', s, pass);
      for (const st of [0, 0.4, 0.8].map((f) => buildingStage(f, false)).concat(['complete'])) expect(p.frames.has(buildingFrameName('temple', st)), `${st} ${pass} ${s}x`).toBe(true);
    }
    expect(manifest.assets.barracks).toBeUndefined();
  });

  it('props: todo quadro que nodeFrameName/toco podem pedir existe em cor e sombra, nas duas escalas', () => {
    const want = new Set<string>();
    for (const sp of ['olive', 'cypress', 'oak']) { for (let v = 0; v < 4; v++) for (const size of ['big', 'small']) want.add(propFrameName(sp, v, size)); want.add(propFrameName(sp, 0, 'thin')); }
    for (let v = 0; v < 3; v++) want.add(propFrameName('stump', v));
    // o que o renderizador pede de fato para cada tipo de nó (varre ids, tiles e quantidades)
    for (const type of ['tree', 'berry', 'gold', 'deer', 'boar', 'lure']) for (let id = 0; id < 40; id++) for (const f of [1, 0.6, 0.3, 0.05]) {
      const n = nodeFrameName(type, id, id * 7 % 90, id * 13 % 90, 100 * f, 100);
      if (n) want.add(n);
    }
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) { const t = treeLook(x, y); want.add(propFrameName(t.species, t.variant, t.size)); want.add(propFrameName('stump', stumpVariant(x, y))); }
    expect(want.size).toBeGreaterThanOrEqual(24 + 3 + 3 + 3 + 3 + 4 + 4 + 1);
    const items = new Set([...(manifest.assets['props-trees']?.items ?? []), ...(manifest.assets['props-nodes']?.items ?? [])]);
    for (const s of scales) for (const pass of ['color', 'shadow']) {
      const p = passOf('props', s, pass);
      for (const k of want) { expect(p.frames.has(k), `${k} ${pass} ${s}x`).toBe(true); expect(items.has(k), k).toBe(true); }
    }
  });
});
