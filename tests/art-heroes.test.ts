// Lote heróis da Etapa 4 (docs/ART.md, Apêndice E): o rei e os 5 heróis — kits únicos (coroa e cetro, velo de ouro,
// pílos e arco, pele do leão e clava, escudo de Hefesto, pétaso e escudo espelhado), capa longa, poses da habilidade Q
// (animação `ability`, uma vez, a partir do tick do uso — o renderizador só lê a recarga do núcleo) e, com os atlas,
// silhuetas distintas a zoom 1 entre si, do hoplita, do cidadão e do lote 1.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { chooseAnim, abilityUseTick, freshHit, animDuration, unitFrameName, type UnitAnim } from '../src/render/art/logic';
import { ABILITIES, UNITS } from '../src/core/data';
import { TICK_RATE } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { applyCommand } from '../src/core/sim/commands';
import { spawnUnit } from '../src/core/sim/entities';
import type { GameState } from '../src/core/types';
import { loadManifests, validateManifest, ONCE_UNIT_ANIMS } from '../scripts/bake/manifest.mjs';
import type { SheetJson } from '../src/render/art/types';

// manifestos-fonte (art/manifest) e índice do bake (public/art/manifest.json) lidos como JSON
type Json = Record<string, any>;

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'public', 'art');
const HEROES = ['basileus', 'jason', 'odysseus', 'heracles', 'achilles', 'perseus'];
const readJson = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

describe('habilidade do herói (Q): animação `ability`', () => {
  const idle = { moving: false, attacking: false, carrying: false, working: false };
  const hero = (a: UnitAnim) => ['idle', 'walk', 'attack', 'die', 'ability', 'aim'].includes(a);
  it('a habilidade vence ataque, andar e mira; sem a animação no atlas, segue o resto', () => {
    expect(chooseAnim({ ...idle, ability: true }, hero)).toBe('ability');
    expect(chooseAnim({ ...idle, ability: true, attacking: true, moving: true, engaged: true }, hero)).toBe('ability');
    expect(chooseAnim({ ...idle, ability: true, attacking: true }, (a) => a !== 'ability')).toBe('attack');
    expect(chooseAnim({ ...idle, ability: true, moving: true }, (a) => a !== 'ability')).toBe('walk');
    expect(chooseAnim({ ...idle, ability: false, attacking: true }, hero)).toBe('attack');
  });
  it('o uso vem da recarga do núcleo (abilityReadyAt = uso + recarga): toca uma vez, só se for recente', () => {
    expect(abilityUseTick(0, 60 * TICK_RATE)).toBe(-1);          // nunca usada
    expect(abilityUseTick(1500, 0)).toBe(-1);                    // tipo sem habilidade
    const s: GameState = createGame({ seed: 7, mapSize: 'small', players: [
      { name: 'A', god: 'zeus', isAI: false, difficulty: 'normal', team: 0 }, { name: 'B', god: 'poseidon', isAI: false, difficulty: 'normal', team: 1 }] });
    for (const id of HEROES.filter((h) => UNITS[h].ability)) {
      const u = spawnUnit(s, 0, id, 30.5, 30.5);
      tick(s);
      const cd = ABILITIES[UNITS[id].ability!].cooldown * TICK_RATE;
      const seen = abilityUseTick(u.abilityReadyAt, cd);   // a vista nasce com o valor atual (nada a tocar)
      expect(seen, id).toBe(-1);
      const at = s.tick;
      expect(applyCommand(s, { type: 'ability', player: 0, unitId: u.id }).ok, id).toBe(true);
      const used = abilityUseTick(u.abilityReadyAt, cd);
      expect(used, id).toBe(at);
      const win = Math.ceil(animDuration(8, 10) * TICK_RATE);
      expect(freshHit(used, seen, s.tick, win), id).toBe(true);            // no tick do uso: começa do quadro 0
      expect(freshHit(used, used, s.tick + 1, win), id).toBe(false);       // já vista: não recomeça
      expect(freshHit(used, seen, s.tick + win + 1, win), id).toBe(false); // vista que chega depois não toca uso antigo
      s.units.delete(u.id);
    }
  });
});

describe('manifestos do lote heróis', () => {
  const all = loadManifests(path.join(ROOT, 'art', 'manifest')).map((l) => l.manifest as Json);
  const byId = new Map(all.map((m) => [m.id, m]));
  const poses = readJson('art/poses/human.json').anims as Record<string, { loop?: boolean; keys: Record<string, any>[] }>;

  it('os 6 existem (ids de UNITS, rig humano, folha da Etapa 4) e passam na validação', () => {
    for (const id of HEROES) {
      const m = byId.get(id)!;
      expect(m, id).toBeTruthy();
      expect(UNITS[id], id).toBeTruthy();
      expect(validateManifest(m as never), id).toEqual([]);
      expect(m.source.rig, id).toBe('human');
      expect(m.stage, id).toBe(4);
    }
  });

  it('habilidade: todo herói com Q em UNITS tem `ability` (uma vez, pose ability_<herói>); o rei (Regicídio, sem Q) não tem', () => {
    expect(ONCE_UNIT_ANIMS).toContain('ability');
    for (const id of HEROES) {
      const m = byId.get(id)!;
      if (UNITS[id].ability) {
        expect(m.anims.ability?.pose, id).toBe(`ability_${id}`);
        expect(poses[`ability_${id}`]?.loop, id).toBe(false);
      } else expect(m.anims.ability, id).toBeUndefined();
    }
    expect(UNITS.basileus.ability).toBeUndefined();
    // nenhuma unidade de fora do lote pede `ability`
    for (const m of all) if (m.kind === 'unit' && !HEROES.includes(m.id)) expect(m.anims.ability, m.id).toBeUndefined();
  });

  it('as poses da habilidade saem e voltam da pose parada do herói (sem salto no quadro 0)', () => {
    for (const id of HEROES.filter((h) => UNITS[h].ability)) {
      const m = byId.get(id)!;
      const idle = poses[m.anims.idle.pose].keys[0], ab = poses[m.anims.ability.pose].keys;
      expect(ab[0].t, id).toBe(0); expect(ab[ab.length - 1].t, id).toBe(1);
      for (const [k, v] of Object.entries(idle)) if (Array.isArray(v) && !k.startsWith('hip') && !k.startsWith('knee')) expect(ab[0][k], `${id} ${k}`).toEqual(v);
    }
  });

  it('silhueta de herói: capa longa (Héracles: a pele do leão), estatura acima da tropa e kit único entre todas as unidades', () => {
    const sig = (p: Record<string, unknown>) => ['helmet', 'weapon', 'shield', 'offhand', 'armor'].map((k) => p[k] ?? '-').join('/');
    const sigs = new Map<string, string>();
    for (const m of all) if (m.kind === 'unit' && m.source.type === 'param' && m.source.rig === 'human') sigs.set(m.id, sig(m.source.params));
    for (const id of HEROES) {
      const p = byId.get(id)!.source.params;
      if (id === 'heracles') expect(p.helmet).toBe('lion'); else expect(p.cape, id).toBe('long');
      expect(['tall', 'huge'], id).toContain(p.stature);
      for (const [other, s] of sigs) if (other !== id) expect(s, `${id} × ${other}`).not.toBe(sigs.get(id));
    }
    expect(byId.get('heracles')!.source.params.stature).toBe('huge');
  });
});

const hasArt = fs.existsSync(path.join(ART, 'manifest.json'));
describe.skipIf(!hasArt)('atlas do lote heróis', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8')) as Json;
  const sheets = new Map<string, SheetJson>();
  for (const a of manifest.atlases) if (a.group === 'units') sheets.set(a.json, JSON.parse(fs.readFileSync(path.join(ART, a.json), 'utf8')) as SheetJson);

  it('`ability` sem loop no índice, com as 8 direções nos três passes', () => {
    for (const id of HEROES) {
      const a = manifest.assets[id];
      expect(a?.kind, id).toBe('unit');
      if (!UNITS[id].ability) { expect(a.anims.ability, id).toBeUndefined(); continue; }
      expect(a.anims.ability, id).toEqual({ frames: 8, fps: 10, loop: false });
      for (const pass of ['color', 'shadow']) for (let d = 0; d < 8; d++) {
        const names = new Set<string>();
        for (const at of manifest.atlases) if (at.group === 'units' && at.scale === 1 && at.pass === pass) for (const k of Object.keys(sheets.get(at.json)!.frames)) names.add(k);
        for (let i = 0; i < 8; i++) expect(names.has(unitFrameName(id, 'ability', d, i)), `${id} ability ${d} ${i} ${pass}`).toBe(true);
      }
    }
  });

  it('a zoom 1: pé na âncora, sombra para SE, altura perto da do hoplita e silhuetas ≥ 36 % distintas nas 8 direções, parados e andando (entre si, do hoplita, do cidadão e do lote 1)', () => {
    const imgs = new Map<string, PNG>();
    const frameOf = (pass: string, name: string) => {
      for (const a of manifest.atlases) if (a.group === 'units' && a.scale === 1 && a.pass === pass) {
        const f = sheets.get(a.json)!.frames[name];
        if (!f) continue;
        if (!imgs.has(a.image)) imgs.set(a.image, PNG.sync.read(fs.readFileSync(path.join(ART, a.image))));
        return { f, img: imgs.get(a.image)!, k: 1 / ((a as { texel?: number }).texel ?? 1) };   // sombra a ½: cada texel cobre k × k px
      }
      return null;
    };
    const W = 112, H = 112, AX = 56, AY = 84;
    const compose = (id: string, anim: string, dir: number, pass = 'color', frame = 0) => {
      const out = new Float32Array(W * H * 4);
      const put = (p: string, tint: number | null) => {
        const r = frameOf(p, unitFrameName(id, anim, dir, frame)); if (!r) return;
        const { f, img, k } = r;
        const ox = Math.round(AX - (f.anchor!.x * f.sourceSize.w - f.spriteSourceSize.x) * k), oy = Math.round(AY - (f.anchor!.y * f.sourceSize.h - f.spriteSourceSize.y) * k);
        for (let y = 0; y < f.frame.h * k; y++) for (let x = 0; x < f.frame.w * k; x++) {
          const s = ((f.frame.y + Math.floor(y / k)) * img.width + f.frame.x + Math.floor(x / k)) * 4, dx = ox + x, dy = oy + y, a = img.data[s + 3] / 255;
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
    const topOf = (id: string) => { let top = Infinity; for (let d = 0; d < 8; d++) { const c = compose(id, 'idle', d); let y0 = H; for (let i = 0; i < W * H; i++) if (opaque(c, i)) { y0 = Math.floor(i / W); break; } top = Math.min(top, AY - y0); } return top; };
    const hopTop = topOf('hoplite');
    for (const id of HEROES) {
      const c = compose(id, 'idle', 2);
      let bottom = -1; for (let i = 0; i < W * H; i++) if (opaque(c, i) && Math.abs((i % W) - AX) <= 3) bottom = Math.floor(i / W);
      expect(Math.abs(bottom - AY), `${id}: pé a ${bottom - AY} px da âncora`).toBeLessThanOrEqual(3);
      const sh = compose(id, 'idle', 2, 'shadow');
      let sx = 0, sy = 0, sw = 0; for (let i = 0; i < W * H; i++) { const a = sh[i * 4 + 3]; sx += (i % W - AX) * a; sy += (Math.floor(i / W) - AY) * a; sw += a; }
      expect(sw, `${id}: sombra`).toBeGreaterThan(20);
      expect(sx / sw > 1 && sy / sw > 0.5, `${id}: sombra para SE (${(sx / sw).toFixed(1)}, ${(sy / sw).toFixed(1)})`).toBe(true);
      // estatura 1,05–1,1 do rig, mas o topo do hoplita é a crina: a coroa/pílos/capuz ficam 0,85–1,25 dele
      const t = topOf(id);
      expect(t / hopTop, `${id}: altura ${t} px × hoplita ${hopTop} px`).toBeGreaterThan(0.85);
      expect(t / hopTop, `${id}: altura ${t} px × hoplita ${hopTop} px`).toBeLessThan(1.25);
    }
    // integração da Etapa 4: também contra os humanos a pé do lote distância-cerco (peltasta e arqueiro cretense)
    const others = ['hoplite', 'villager', 'militia', 'hypaspist', 'myrmidon', 'toxotes', 'peltast', 'cretan_archer'].filter((id) => manifest.assets[id]);
    // nas 8 direções (revisão da Etapa 4): de costas Jasão e Odisseu eram 28 % distintos — o velo agora cobre o alto das
    // costas de Jasão; parado e andando (os 8 quadros do andar, quadro a quadro)
    const frames = (id: string, anim: string) => (anim === 'walk' ? manifest.assets[id].anims.walk.frames : 1);
    for (const anim of ['idle', 'walk']) for (let dir = 0; dir < 8; dir++) for (let i = 0; i < HEROES.length; i++) for (const b of [...HEROES.slice(i + 1), ...others]) {
      const n = Math.min(frames(HEROES[i], anim), frames(b, anim));
      for (let f = 0; f < n; f++) {
      const A = compose(HEROES[i], anim, dir, 'color', f), B = compose(b, anim, dir, 'color', f);
      let union = 0, diff = 0;
      for (let k = 0; k < W * H; k++) {
        const oa = opaque(A, k), ob = opaque(B, k);
        if (!oa && !ob) continue;
        union++;
        if (oa !== ob || Math.max(Math.abs(A[k * 4] - B[k * 4]), Math.abs(A[k * 4 + 1] - B[k * 4 + 1]), Math.abs(A[k * 4 + 2] - B[k * 4 + 2])) > 60) diff++;
      }
      expect(diff / union, `${HEROES[i]} × ${b} (${anim} dir ${dir} quadro ${f}): ${(100 * diff / union).toFixed(0)} % diferentes`).toBeGreaterThanOrEqual(0.36);
      }
    }
  });
});
