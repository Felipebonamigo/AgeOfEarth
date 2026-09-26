// Arte assada no renderizador (docs/ART.md §3.7, Etapa 2 parte B): funções puras de src/render/art/logic.ts e o
// contrato com os artefatos da parte A — toda chave que o renderizador vai pedir para hoplita, cidadão, templo e props
// existe nos três passes (cor, time, sombra) e nas duas escalas, e os atlas passam na checagem de meta.aoe.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  dirFromAngle, dirFromVector, dirWithHysteresis, chooseAnim, frameIndex, animDuration, unitFrameName, unitAnimName, buildingFrameName,
  propFrameName, buildingStage, treeLook, stumpVariant, animalDir, amountStage, nodeFrameName, nodeStage, treeScale, treeOffset, checkSheetMeta, pickScale,
  isMirrored, frameBox, mulColor, isWalking, freshHit, deathAlpha, isRunning, isMoveAnim, RUN_SPEED, warmUnitTypes, type UnitAnim,
  BUILDING_STATES, damageLevel, buildingState, fallbackState, WALL_LINK_TYPES, wallMask, wallVariant, gateAxis, ageTier,
  buildingVariant, placementMasks, gateNear, GATE_OPEN_RANGE, rubbleName, rubbleAlpha, RUBBLE_SECONDS, RUBBLE_FADE, smokeRate,
  smokeBudget, ghostTint, wallFlagAt, WALL_FLAG_PROBE,
} from '../src/render/art/logic';
import { BUILDINGS, UNITS } from '../src/core/data';
import { DT } from '../src/core/constants';
import { PNG } from 'pngjs';
import { loadManifests } from '../scripts/bake/manifest.mjs';
import { maskHit, ALPHA_HIT } from '../src/render/art/alphaMask';
import { PARTICLE_BUDGET } from '../src/render/quality';
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

describe('animação das unidades da Etapa 4: mira, galope e pré-carregamento por tipo', () => {
  const idle = { moving: false, attacking: false, carrying: false, working: false };
  const archer = (a: UnitAnim) => ['idle', 'walk', 'attack', 'die', 'aim'].includes(a);
  const rider = (a: UnitAnim) => ['idle', 'walk', 'attack', 'die', 'run'].includes(a);
  it('à distância no posto entre disparos: mira (aim); o disparo (attack) vence; sem aim fica parado', () => {
    expect(chooseAnim({ ...idle, engaged: true }, archer)).toBe('aim');
    expect(chooseAnim({ ...idle, engaged: true, attacking: true }, archer)).toBe('attack');
    expect(chooseAnim({ ...idle, engaged: true }, (a) => a !== 'aim')).toBe('idle');
    expect(chooseAnim({ ...idle, engaged: true, moving: true }, archer)).toBe('walk');
  });
  it('cavalaria: galope (run) acima de RUN_SPEED, trote (walk) abaixo — em formação com a infantaria trota', () => {
    expect(chooseAnim({ ...idle, moving: true, running: true }, rider)).toBe('run');
    expect(chooseAnim({ ...idle, moving: true, running: false }, rider)).toBe('walk');
    expect(chooseAnim({ ...idle, moving: true, running: true }, archer)).toBe('walk');   // sem run: anda
    const step = (speed: number) => (speed * DT) ** 2;
    for (const id of ['hippeus', 'hetairoi', 'kataskopos']) expect(isRunning(step(UNITS[id].speed), DT, false), id).toBe(true);
    const infantry = Object.values(UNITS).filter((u) => !u.tags.includes('cavalry') && u.tags.includes('human'));
    for (const u of infantry) expect(isRunning(step(u.speed), DT, false), u.id).toBe(false);
    expect(RUN_SPEED).toBeLessThan(Math.min(...['hippeus', 'hetairoi', 'kataskopos'].map((id) => UNITS[id].speed)));
    expect(isRunning(step(RUN_SPEED * 0.95), DT, true)).toBe(true);    // histerese: já galopando, segue até 90 %
    expect(isRunning(step(RUN_SPEED * 0.95), DT, false)).toBe(false);
    expect(['walk', 'carry', 'run'].every((a) => isMoveAnim(a as UnitAnim))).toBe(true);
    expect(isMoveAnim('aim')).toBe(false);
  });
  it('pré-carregamento por tipo: os da Idade do jogador (treináveis e humanos sem edifício) e os presentes; voadoras fora', () => {
    const a0 = warmUnitTypes(UNITS, 0);
    for (const id of ['villager', 'hoplite', 'toxotes', 'kataskopos', 'militia', 'basileus']) expect(a0, id).toContain(id);
    for (const id of ['hypaspist', 'myrmidon', 'hippeus', 'helepolis', 'pegasus']) expect(a0, id).not.toContain(id);
    const a3 = warmUnitTypes(UNITS, 3, ['cronus']);
    for (const id of ['hypaspist', 'myrmidon', 'helepolis', 'cronus']) expect(a3, id).toContain(id);
    expect(a3).not.toContain('pegasus');
    expect(warmUnitTypes(UNITS, 0)).toEqual(warmUnitTypes(UNITS, 0));   // estável (ordenado)
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

describe('edifícios (Etapa 3): dano, variantes, muralha, portão, escombros, fumaça', () => {
  it('dano pela vida perdida: ≥ 1/3 → damage1, ≥ 2/3 → damage2; obra continua pelo progresso; portão aberto vence o dano', () => {
    expect([1, 0.9, 0.67, 0.666, 0.5, 0.34, 0.333, 0.1, 0].map(damageLevel)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect(damageLevel(Number.NaN)).toBe(0);
    expect(buildingState(0.2, false, 0.1)).toBe('build0');            // em obra: o dano não muda o quadro da obra
    expect(buildingState(0.5, false, 1)).toBe('build1');
    expect(buildingState(0.9, false, 1)).toBe('build2');
    expect(buildingState(1, true, 1)).toBe('complete');
    expect(buildingState(1, true, 0.6)).toBe('damage1');
    expect(buildingState(1, true, 0.3)).toBe('damage2');
    expect(buildingState(1, true, 0.3, true)).toBe('open');
    expect(buildingState(0.5, false, 1, true)).toBe('build1');        // portão em obra não abre
    expect([...BUILDING_STATES]).toEqual(['build0', 'build1', 'build2', 'complete', 'damage1', 'damage2']);
  });
  it('estado de reserva: damage2 → damage1 → complete; open → complete; obra e complete sem reserva', () => {
    expect(fallbackState('damage2')).toBe('damage1');
    expect(fallbackState('damage1')).toBe('complete');
    expect(fallbackState('open')).toBe('complete');
    expect(fallbackState('complete')).toBeNull();
    expect(fallbackState('build1')).toBeNull();
  });
  it('bitmask da muralha: N = 1, L = 2, S = 4, O = 8, as 16 combinações com nomes 00–15', () => {
    const names = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const m = wallMask(!!(i & 1), !!(i & 2), !!(i & 4), !!(i & 8));
      expect(m).toBe(i);
      names.add(wallVariant(m));
    }
    expect([...names]).toEqual(Array.from({ length: 16 }, (_, i) => String(i).padStart(2, '0')));
    expect(wallVariant(5)).toBe('05'); expect(wallVariant(15)).toBe('15'); expect(wallVariant(16 + 3)).toBe('03');
    // estandarte de time nos trechos retos marcados (um a cada 3 tiles); pontas/cantos já têm no pilar
    expect([wallVariant(5, true), wallVariant(10, true), wallVariant(3, true)]).toEqual(['05f', '10f', '03']);
    expect(buildingVariant('wallMask', { mask: 10, age: 0, flag: true })).toBe(WALL_FLAG_PROBE);
    const run = Array.from({ length: 9 }, (_, x) => wallFlagAt(x + 4, 7));
    expect(run.filter(Boolean)).toHaveLength(3);
    expect(wallFlagAt(-2, 2)).toBe(wallFlagAt(1, 2));
    expect([...WALL_LINK_TYPES].sort()).toEqual(['gate', 'tower', 'wall']);
    for (const t of WALL_LINK_TYPES) expect(BUILDINGS[t], t).toBeTruthy();
  });
  it('eixo do portão pelos vizinhos: só norte/sul → ns; leste/oeste, cruz ou isolado → ew', () => {
    expect(gateAxis(wallMask(true, false, true, false))).toBe('ns');
    expect(gateAxis(wallMask(true, false, false, false))).toBe('ns');
    expect(gateAxis(wallMask(false, true, false, true))).toBe('ew');
    expect(gateAxis(0)).toBe('ew');
    expect(gateAxis(15)).toBe('ew');
    expect(gateAxis(wallMask(true, true, false, false))).toBe('ew');
  });
  it('Idade → variante do Centro Cívico e critério genérico de variante', () => {
    expect([0, 1, 2, 3, 4].map(ageTier)).toEqual(['a0', 'a1', 'a1', 'a2', 'a2']);
    expect(buildingVariant('wallMask', { mask: 10, age: 0 })).toBe('10');
    expect(buildingVariant('gateAxis', { mask: 5, age: 0 })).toBe('ns');
    expect(buildingVariant('ageTier', { mask: 0, age: 3 })).toBe('a2');
    expect(buildingVariant(null, { mask: 3, age: 3 })).toBeNull();
  });
  it('fantasma de uma linha de muralha: liga os tiles da linha entre si e às muralhas existentes', () => {
    const line = [{ x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }];
    expect(placementMasks(line, () => false)).toEqual([2, 10, 8]);                       // ponta, reta, ponta
    const existing = (x: number, y: number) => x === 6 && y === 5;                       // muralha pronta a leste
    expect(placementMasks(line, existing)).toEqual([2, 10, 10]);
    expect(placementMasks([{ x: 0, y: 0 }], (x, y) => x === 0 && y === 1)).toEqual([4]);   // portão sobre muralha ao sul
    expect(gateAxis(placementMasks([{ x: 0, y: 0 }], (x, y) => x === 0 && (y === 1 || y === -1))[0])).toBe('ns');
  });
  it('portão abre com aliado perto (Chebyshev do centro do tile)', () => {
    expect(gateNear(10.5, 10.5, 10.5, 10.5)).toBe(true);
    expect(gateNear(10.5 + GATE_OPEN_RANGE - 1e-9, 10.5, 10.5, 10.5)).toBe(true);
    expect(gateNear(10.5 + GATE_OPEN_RANGE + 0.01, 10.5, 10.5, 10.5)).toBe(false);
    expect(gateNear(11.5, 12.2, 10.5, 10.5)).toBe(false);
  });
  it('escombros: nome por pegada, alfa 1 até apagar no fim, 0 depois', () => {
    expect(rubbleName(3, 3)).toBe('rubble/3x3');
    expect(rubbleAlpha(-1)).toBe(1); expect(rubbleAlpha(0)).toBe(1);
    expect(rubbleAlpha(RUBBLE_SECONDS - RUBBLE_FADE)).toBe(1);
    expect(rubbleAlpha(RUBBLE_SECONDS - RUBBLE_FADE / 2)).toBeCloseTo(0.5);
    expect(rubbleAlpha(RUBBLE_SECONDS)).toBe(0); expect(rubbleAlpha(99)).toBe(0);
  });
  it('fumaça: 0 sem dano, mais no dano pesado e nos edifícios grandes; orçamento pela fração do preset', () => {
    expect(smokeRate(0, 9)).toBe(0);
    expect(smokeRate(2, 9)).toBeGreaterThan(smokeRate(1, 9));
    expect(smokeRate(1, 9)).toBeGreaterThan(smokeRate(1, 1));
    expect(smokeRate(1, 0)).toBe(smokeRate(1, 1));
    for (const b of PARTICLE_BUDGET) { expect(smokeBudget(b)).toBeGreaterThan(0); expect(smokeBudget(b)).toBeLessThan(b); }
    expect(smokeBudget(PARTICLE_BUDGET[0])).toBeLessThan(smokeBudget(PARTICLE_BUDGET[2]));
  });
  it('alfa do atlas no pick: só pixel opaco conta; fora do recorte, não; resolução 2× lê o pixel certo', () => {
    const m = { w: 4, h: 2, res: 1, data: new Uint8Array([0, 255, 255, 0, 0, 30, 200, 0]) };
    expect([maskHit(m, 0.5, 0.5), maskHit(m, 1.5, 0.5), maskHit(m, 1.5, 1.5), maskHit(m, 2.9, 1.2)]).toEqual([false, true, false, true]);
    expect([maskHit(m, -0.1, 0.5), maskHit(m, 4, 0), maskHit(m, 1, 2)]).toEqual([false, false, false]);
    expect(ALPHA_HIT).toBeGreaterThan(30);
    const m2 = { w: 4, h: 2, res: 2, data: new Uint8Array([0, 0, 255, 255, 0, 0, 255, 255]) };
    expect([maskHit(m2, 0.4, 0.2), maskHit(m2, 1.2, 0.7)]).toEqual([false, true]);
  });
  it('fantasma: verde claro onde pode; vermelho forte onde não pode (a terracota não passa por edifício de verdade)', () => {
    const ok = ghostTint(true), no = ghostTint(false);
    expect(((ok >> 8) & 255) > ((ok >> 16) & 255)).toBe(true);
    expect(Math.min((ok >> 16) & 255, (ok >> 8) & 255, ok & 255)).toBeGreaterThan(0x80);
    expect((no >> 16) & 255).toBe(255);
    expect(Math.max((no >> 8) & 255, no & 255)).toBeLessThanOrEqual(0x60);
    // telhado de terracota (#9e4c2a) tingido: o verde cai a menos da metade (o tint claro antigo deixava ~61 %)
    const roof = 0x9e4c2a, t = mulColor(roof, no);
    expect(((t >> 8) & 255) / ((roof >> 8) & 255)).toBeLessThan(0.5);
    expect(buildingFrameName('wall', 'complete', '05')).toBe('wall/complete/05');
    expect(buildingFrameName('house', 'damage1', null)).toBe('house/damage1');
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

  it('toda unidade com arte (Etapa 4: hoplita, cidadão e o lote 1): cada animação × 8 direções × quadros nos três passes, nas duas escalas', () => {
    const unitManifests = loadManifests(path.join(ROOT, 'art', 'manifest')).map((l) => l.manifest).filter((m) => m.kind === 'unit');
    expect(unitManifests.map((m) => m.id)).toEqual(expect.arrayContaining(['hoplite', 'villager', 'militia', 'hypaspist', 'myrmidon', 'toxotes']));
    for (const m of unitManifests) {
      const a = manifest.assets[m.id];
      expect(a?.kind, m.id).toBe('unit');
      expect(a.team && a.shadow, m.id).toBe(true);
      expect(Object.keys(a.anims!).sort(), m.id).toEqual(Object.keys(m.anims!).sort());
      expect(Object.keys(a.atlases).sort(), m.id).toEqual(['1', '2']);
      for (const s of scales) {
        for (const pass of ['color', 'team', 'shadow']) {
          const p = passOf(a.group, s, pass);
          for (const [anim, info] of Object.entries(a.anims!)) for (let d = 0; d < 8; d++) {
            const list = p.anims.get(unitAnimName(m.id, anim, d));
            // a máscara de time pode faltar num quadro em que a parte de time fica toda atrás do corpo (art:check avisa)
            if (pass === 'team' && !list) continue;
            expect(list, `${m.id}/${anim}/${d} ${pass} ${s}x`).toHaveLength(info.frames);
            for (let i = 0; i < info.frames; i++) expect(p.frames.has(unitFrameName(m.id, anim, d, i)), `${unitFrameName(m.id, anim, d, i)} ${pass} ${s}x`).toBe(true);
          }
        }
        // o tipo inteiro numa página por passe (o carregamento por tipo pede só essas)
        for (const pass of ['color', 'team', 'shadow'] as const) expect(a.atlases[String(s)][pass], `${m.id} ${pass} ${s}x`).toHaveLength(1);
        const size = a.sizes![String(s)];
        for (const a2 of manifest.atlases) if (a2.group === a.group && a2.scale === s) for (const [k, f] of Object.entries(sheets.get(a2.json)!.frames)) if (k.startsWith(m.id + '/')) {
          expect(f.anchor, k).toEqual(size.anchor); expect(f.sourceSize, k).toEqual(size.sourceSize);
        }
      }
    }
  });

  it('lote 1 a zoom 1: pé na âncora, sombra para SE, altura do hoplita e silhuetas distintas entre si e do hoplita', () => {
    // composição a 1× (32 px/tile = zoom 1): cor + máscara de time tingida, alinhadas pela âncora
    const imgs = new Map<string, PNG>();
    const frameOf = (pass: string, name: string) => {
      for (const a of manifest.atlases) if (a.group === 'units' && a.scale === 1 && a.pass === pass) {
        const f = sheets.get(a.json)!.frames[name];
        if (!f) continue;
        if (!imgs.has(a.image)) imgs.set(a.image, PNG.sync.read(fs.readFileSync(path.join(ART, a.image))));
        return { f, img: imgs.get(a.image)! };
      }
      return null;
    };
    const W = 112, H = 112, AX = 56, AY = 84;
    const compose = (id: string, anim: string, dir: number, pass = 'color') => {
      const out = new Float32Array(W * H * 4);
      const put = (p: string, tint: number | null) => {
        const r = frameOf(p, unitFrameName(id, anim, dir, 0)); if (!r) return;
        const { f, img } = r;
        const ox = Math.round(AX - f.anchor.x * f.sourceSize.w + f.spriteSourceSize.x), oy = Math.round(AY - f.anchor.y * f.sourceSize.h + f.spriteSourceSize.y);
        for (let y = 0; y < f.frame.h; y++) for (let x = 0; x < f.frame.w; x++) {
          const s = ((f.frame.y + y) * img.width + f.frame.x + x) * 4, dx = ox + x, dy = oy + y, a = img.data[s + 3] / 255;
          if (!a || dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
          const d = (dy * W + dx) * 4;
          for (let c = 0; c < 3; c++) { const tc = tint === null ? 1 : ((tint >> (16 - 8 * c)) & 255) / 255; out[d + c] = img.data[s + c] * tc * a + out[d + c] * (1 - a); }
          out[d + 3] = Math.max(out[d + 3], a);
        }
      };
      put(pass, null);
      if (pass === 'color') put('team', 0x3b82f6);
      return out;
    };
    const opaque = (img: Float32Array, i: number) => img[i * 4 + 3] > 0.5;
    const lot = ['hoplite', 'militia', 'hypaspist', 'myrmidon', 'toxotes'];
    const topOf = (id: string) => { let top = Infinity; for (let d = 0; d < 8; d++) { const c = compose(id, 'idle', d); let y0 = H; for (let i = 0; i < W * H; i++) if (opaque(c, i)) { y0 = Math.floor(i / W); break; } top = Math.min(top, AY - y0); } return top; };
    const hopTop = topOf('hoplite');
    for (const id of lot) {
      const c = compose(id, 'idle', 2);
      // o pé: o pixel opaco mais baixo na faixa de ±3 px em volta da âncora (a arma apontada para a câmera passa do pé)
      let bottom = -1; for (let i = 0; i < W * H; i++) if (opaque(c, i) && Math.abs((i % W) - AX) <= 3) bottom = Math.floor(i / W);
      expect(Math.abs(bottom - AY), `${id}: pé a ${bottom - AY} px da âncora`).toBeLessThanOrEqual(3);
      const sh = compose(id, 'idle', 2, 'shadow');
      let sx = 0, sy = 0, sw = 0; for (let i = 0; i < W * H; i++) { const a = sh[i * 4 + 3]; sx += (i % W - AX) * a; sy += (Math.floor(i / W) - AY) * a; sw += a; }
      expect(sw, `${id}: sombra`).toBeGreaterThan(20);
      expect(sx / sw > 1 && sy / sw > 0.5, `${id}: sombra para SE (${(sx / sw).toFixed(1)}, ${(sy / sw).toFixed(1)})`).toBe(true);
      const t = topOf(id);
      // o corpo é o mesmo rig (mesma altura); o topo muda com o elmo/crina (gorro da milícia ≈ 25 px, crina do hoplita 30)
      expect(t / hopTop, `${id}: altura ${t} px × hoplita ${hopTop} px`).toBeGreaterThan(0.8);
      expect(t / hopTop, `${id}: altura ${t} px × hoplita ${hopTop} px`).toBeLessThan(1.2);
    }
    // silhuetas: nas vistas de frente (S) e de 3/4 (SE), pelo menos 30 % dos pixels opacos de qualquer um dos dois diferem
    // (um só é opaco, ou a cor muda > 60 num canal) entre quaisquer dois do lote e o hoplita
    for (const dir of [1, 2]) for (let i = 0; i < lot.length; i++) for (let j = i + 1; j < lot.length; j++) {
      const a = compose(lot[i], 'idle', dir), b = compose(lot[j], 'idle', dir);
      let union = 0, diff = 0;
      for (let k = 0; k < W * H; k++) {
        const oa = opaque(a, k), ob = opaque(b, k);
        if (!oa && !ob) continue;
        union++;
        if (oa !== ob || Math.max(Math.abs(a[k * 4] - b[k * 4]), Math.abs(a[k * 4 + 1] - b[k * 4 + 1]), Math.abs(a[k * 4 + 2] - b[k * 4 + 2])) > 60) diff++;
      }
      expect(diff / union, `${lot[i]} × ${lot[j]} (dir ${dir}): ${(100 * diff / union).toFixed(0)} % diferentes`).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('edifícios assados (os 21 do jogo, Etapa 3): todo estado × variante na cor, sombra e (com time) máscara, nas duas escalas; ícones; escombros', () => {
    // nenhum tipo de BUILDINGS cai no ProceduralSource numa partida com a arte assada ligada (critério da Etapa 3)
    const lot = Object.keys(BUILDINGS);
    expect(lot).toHaveLength(21);
    for (const id of lot) {
      const a = manifest.assets[id];
      expect(a?.kind, id).toBe('building');
      // o `glow` do portal é sobreposição só de cor, conferida em tests/art-military.test.ts
      const states = Object.keys(a.anims!).filter((st) => st !== 'glow');
      expect(states, id).toEqual(expect.arrayContaining([...BUILDING_STATES]));
      for (const s of scales) {
        const color = passOf('buildings', s, 'color'), shadow = passOf('buildings', s, 'shadow'), team = passOf('buildings', s, 'team');
        let withTeam = 0;
        for (const st of states) for (const v of a.variants ?? [null]) {
          const n = buildingFrameName(id, st, v);
          expect(color.frames.has(n), `${n} cor ${s}x`).toBe(true);
          expect(shadow.frames.has(n), `${n} sombra ${s}x`).toBe(true);
          if (team.frames.has(n)) withTeam++;
        }
        if (a.team) expect(withTeam, `${id} máscara ${s}x`).toBeGreaterThan(0); else expect(withTeam).toBe(0);
        // ícone do HUD no atlas icons (cor, e máscara quando tem time)
        expect(a.icon, id).toBe(true);
        expect(passOf('icons', s, 'color').frames.has(id), `${id} ícone ${s}x`).toBe(true);
        if (a.team) expect(passOf('icons', s, 'team').frames.has(id), `${id} ícone time ${s}x`).toBe(true);
      }
      // âncora e moldura iguais em todos os estados/variantes (a vista troca só a textura)
      for (const s of scales) {
        const size = a.sizes![String(s)];
        for (const a2 of manifest.atlases) if (a2.group === 'buildings' && a2.scale === s) for (const [k, f] of Object.entries(sheets.get(a2.json)!.frames)) if (k.startsWith(id + '/')) {
          expect(f.anchor, k).toEqual(size.anchor); expect(f.sourceSize, k).toEqual(size.sourceSize);
        }
      }
    }
    expect(manifest.assets.wall.variants).toHaveLength(18);
    expect(manifest.assets.tower.variantBy).toBe('wallMask');
    // torre: a variante só muda a sombra — cor igual em todas (o empacotador guarda um retângulo só) e sombra com a faixa
    // da muralha vizinha a leste/sul recortada (sem o dobro de escuro)
    const rectOf = (s: number, pass: string, name: string) => {
      for (const a2 of manifest.atlases) if (a2.group === 'buildings' && a2.scale === s && a2.pass === pass) { const f = sheets.get(a2.json)!.frames[name]; if (f) return a2.json + JSON.stringify(f.frame); }
      return undefined;
    };
    for (const s of scales) {
      const c0 = rectOf(s, 'color', 'tower/complete/00');
      expect(c0).toBeTruthy();
      for (let m = 1; m < 16; m++) expect(rectOf(s, 'color', `tower/complete/${String(m).padStart(2, '0')}`), `cor ${m} ${s}x`).toBe(c0);
      expect(rectOf(s, 'shadow', 'tower/complete/08')).toBe(rectOf(s, 'shadow', 'tower/complete/00'));   // oeste: não recorta
      expect(rectOf(s, 'shadow', 'tower/complete/10')).not.toBe(rectOf(s, 'shadow', 'tower/complete/00'));
    }
    expect(manifest.assets.wall.variantBy).toBe('wallMask');
    expect(manifest.assets.gate.variantBy).toBe('gateAxis');
    expect(Object.keys(manifest.assets.gate.anims!)).toContain('open');
    expect(manifest.assets.town_center.variantBy).toBe('ageTier');
    // escombros: um por pegada de todo edifício do jogo
    expect(manifest.assets.rubble?.rubble).toBe(true);
    for (const s of scales) for (const b of Object.values(BUILDINGS)) expect(passOf('buildings', s, 'color').frames.has(rubbleName(b.w, b.h)), `${b.id} ${s}x`).toBe(true);
    // ícones: 64×64 a 1× (128 a 2×)
    for (const a2 of manifest.atlases) if (a2.group === 'icons') for (const f of Object.values(sheets.get(a2.json)!.frames)) expect(f.sourceSize).toEqual({ w: 64 * a2.scale, h: 64 * a2.scale });
  });

  it('templo: build0/1/2 e completo nos três passes; tipo sem manifesto fica sem arte no índice (procedural)', () => {
    const a = manifest.assets.temple;
    expect(a?.kind).toBe('building');
    for (const s of scales) for (const pass of ['color', 'team', 'shadow']) {
      const p = passOf('buildings', s, pass);
      for (const st of [0, 0.4, 0.8].map((f) => buildingStage(f, false)).concat(['complete'])) expect(p.frames.has(buildingFrameName('temple', st)), `${st} ${pass} ${s}x`).toBe(true);
    }
    // tipo sem manifesto em art/manifest continua sem arte no índice (procedural)
    const withManifest = new Set(fs.readdirSync(path.join(ROOT, 'art', 'manifest')).map((f) => f.replace(/\.json$/, '')));
    for (const id of Object.keys(BUILDINGS)) if (!withManifest.has(id)) expect(manifest.assets[id], id).toBeUndefined();
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
