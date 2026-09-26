// Lote "cavalaria" da Etapa 4 (docs/ART.md Apêndice E): batedor (kataskopos), hipeu (hippeus) e hetairo (hetairoi) no
// rig do cavalo com o cavaleiro no rig humano. Manifestos (tipos do jogo, kits do cavalo e do cavaleiro, trote/galope,
// poses que existem) e — se o bake local existir — a leitura a zoom 1: cascos no chão sob a âncora, sombra para SE,
// cavaleiro acima do hoplita, máscara de time em todo quadro e silhuetas distintas entre si e do hoplita.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { loadManifests, validateManifest, expandFrames, animationsOf, posesOf, type ArtManifest } from '../scripts/bake/manifest.mjs';
import { poseErrors } from '../scripts/bake/check';
import { UNIT_KITS } from '../scripts/bake/page/rigs/units.js';
import { UNITS } from '../src/core/data';
import { isRunning, unitFrameName, unitAnimName } from '../src/render/art/logic';
import { DT } from '../src/core/constants';
import type { SheetJson } from '../src/render/art/types';

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'public', 'art');
const LOT = ['kataskopos', 'hippeus', 'hetairoi'];
const manifests = new Map(loadManifests(path.join(ROOT, 'art', 'manifest')).map((l) => [l.manifest.id, l.manifest]));
const params = (m: ArtManifest) => (m.source.type === 'param' ? m.source.params ?? {} : {}) as Record<string, unknown>;
const rider = (m: ArtManifest) => (params(m).rider ?? {}) as Record<string, unknown>;

describe('lote cavalaria: manifestos', () => {
  it('os 3 montados: tipos de cavalaria do jogo, rig do cavalo, 8 direções, parado/trote/galope/ataque/morte com pose do cavalo e do cavaleiro', () => {
    for (const id of LOT) {
      const m = manifests.get(id)!;
      expect(m, id).toBeTruthy();
      expect(validateManifest(m), id).toEqual([]);
      expect(poseErrors(ROOT, m), id).toEqual([]);
      expect(UNITS[id]?.tags, id).toContain('cavalry');
      expect(m.kind).toBe('unit');
      expect(m.source.type === 'param' && m.source.rig, id).toBe('horse');
      expect(posesOf(m), id).toEqual({ main: 'art/poses/horse.json', rider: 'art/poses/human.json' });
      expect(m.dirs).toBe(8);
      expect(Object.keys(m.anims!).sort(), id).toEqual(['attack', 'die', 'idle', 'run', 'walk']);
      // walk = trote (em formação com a infantaria), run = galope (acima de RUN_SPEED: os três passam dele soltos)
      expect([m.anims!.walk.pose, m.anims!.walk.rider, m.anims!.run.pose, m.anims!.run.rider], id).toEqual(['trot', 'ride_trot', 'gallop', 'ride_gallop']);
      expect(isRunning((UNITS[id].speed * DT) ** 2, DT, false), id).toBe(true);
      expect([m.anims!.idle.pose, m.anims!.attack.pose, m.anims!.die.pose, m.anims!.die.rider], id).toEqual(['idle_horse', 'attack_horse', 'die_horse', 'ride_die']);
      expect(expandFrames(m).length, id).toBe(8 * Object.values(m.anims!).reduce((s, a) => s + a.frames, 0));
      expect(Object.keys(animationsOf(m)).length, id).toBe(8 * 5);
      expect([m.team, m.shadow], id).toEqual([true, true]);
    }
  });
  it('kits distintos: porte, pelagem e manta do cavalo; armadura, elmo e arma do cavaleiro (batedor leve, hipeu médio, hetairo pesado)', () => {
    const horseKit = UNIT_KITS.horse as Record<string, unknown[]>;
    const look = LOT.map((id) => { const m = manifests.get(id)!, p = params(m), r = rider(m); return [p.coat, p.build, p.cloth, !!p.peytral, r.armor, r.helmet, r.weapon]; });
    for (let i = 0; i < LOT.length; i++) for (let j = i + 1; j < LOT.length; j++) {
      const diff = look[i].filter((v, k) => v !== look[j][k]).length;
      expect(diff, `${LOT[i]} × ${LOT[j]}`).toBeGreaterThanOrEqual(5);
    }
    expect(LOT.map((id) => params(manifests.get(id)!).build)).toEqual(['light', 'medium', 'heavy']);
    for (const k of ['coat', 'build', 'cloth']) for (const id of LOT) expect(horseKit[k], `${id} ${k}`).toContain(params(manifests.get(id)!)[k]);
    // cor de time em todo montado: no cavaleiro (capa/túnica/crina) e, fora o batedor, no xairel
    for (const id of LOT) expect(rider(manifests.get(id)!).cape, id).not.toBe('none');
    expect(params(manifests.get('kataskopos')!).cloth).toBe('fleece');
    expect(rider(manifests.get('kataskopos')!).tunicTeam).toBe(true);
    // o kit novo do cavalo é recusado fora dos valores aceitos
    const het = manifests.get('hetairoi')!;
    const withParams = (p: Record<string, unknown>) => ({ ...het, source: { ...het.source, params: { ...params(het), ...p } } }) as ArtManifest;
    expect(validateManifest(withParams({ build: 'giant' })).join()).toMatch(/build/);
    expect(validateManifest(withParams({ cloth: 'silk' })).join()).toMatch(/cloth/);
  });
});

const hasArt = fs.existsSync(path.join(ART, 'manifest.json')) && LOT.every((id) => JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8')).assets[id]);
describe.skipIf(!hasArt)('lote cavalaria: arte assada a zoom 1 (public/art)', () => {
  const index = hasArt ? JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8')) as { atlases: { json: string; image: string; group: string; pass: string; scale: number }[]; assets: Record<string, { anims: Record<string, { frames: number }>; atlases: Record<string, Record<string, string[]>> }> } : null!;
  const sheets = new Map<string, SheetJson>();
  const imgs = new Map<string, PNG>();
  const frameOf = (pass: string, name: string, scale = 1) => {
    for (const a of index.atlases) if (a.group === 'units' && a.scale === scale && a.pass === pass) {
      if (!sheets.has(a.json)) sheets.set(a.json, JSON.parse(fs.readFileSync(path.join(ART, a.json), 'utf8')) as SheetJson);
      const f = sheets.get(a.json)!.frames[name];
      if (!f) continue;
      if (!imgs.has(a.image)) imgs.set(a.image, PNG.sync.read(fs.readFileSync(path.join(ART, a.image))));
      return { f, img: imgs.get(a.image)! };
    }
    return null;
  };
  // composição a 1× (32 px/tile = zoom 1): cor + máscara de time tingida, alinhadas pela âncora (como o renderizador)
  const W = 160, H = 160, AX = 80, AY = 110;
  const compose = (id: string, anim: string, dir: number, pass = 'color', frame = 0) => {
    const out = new Float32Array(W * H * 4);
    const put = (p: string, tint: number | null) => {
      const r = frameOf(p, unitFrameName(id, anim, dir, frame)); if (!r) return;
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
  const topOf = (id: string) => { let top = Infinity; for (let d = 0; d < 8; d++) { const c = compose(id, 'idle', d); let y0 = H; for (let i = 0; i < W * H; i++) if (opaque(c, i)) { y0 = Math.floor(i / W); break; } top = Math.min(top, AY - y0); } return top; };

  it('cascos no chão sob a âncora (de lado), sombra para SE e cavaleiro acima do hoplita', () => {
    const hopTop = topOf('hoplite');
    for (const id of LOT) {
      // de lado (E e O): os quatro cascos na linha da âncora (± a largura do cavalo), centrados nela na horizontal
      for (const dir of [0, 4]) {
        const c = compose(id, 'idle', dir);
        let bottom = -1; for (let i = 0; i < W * H; i++) if (opaque(c, i)) bottom = Math.floor(i / W);
        expect(Math.abs(bottom - AY), `${id} dir ${dir}: casco a ${bottom - AY} px da âncora`).toBeLessThanOrEqual(4);
        let sx = 0, n = 0; for (let x = 0; x < W; x++) for (let y = bottom - 3; y <= bottom; y++) if (opaque(c, y * W + x)) { sx += x; n++; }
        expect(Math.abs(sx / n - AX), `${id} dir ${dir}: cascos centrados (${(sx / n - AX).toFixed(1)} px)`).toBeLessThanOrEqual(4);
      }
      const sh = compose(id, 'idle', 2, 'shadow');
      let sx = 0, sy = 0, sw = 0; for (let i = 0; i < W * H; i++) { const a = sh[i * 4 + 3]; sx += (i % W - AX) * a; sy += (Math.floor(i / W) - AY) * a; sw += a; }
      expect(sw, `${id}: sombra`).toBeGreaterThan(60);
      expect(sx / sw > 1 && sy / sw > 0.5, `${id}: sombra para SE (${(sx / sw).toFixed(1)}, ${(sy / sw).toFixed(1)})`).toBe(true);
      const t = topOf(id);
      expect(t / hopTop, `${id}: topo ${t} px × hoplita ${hopTop} px`).toBeGreaterThan(1.0);
      expect(t / hopTop, `${id}: topo ${t} px × hoplita ${hopTop} px`).toBeLessThan(1.8);
    }
  });

  it('máscara de time em todo quadro (a capa/túnica do cavaleiro nunca some inteira), nas duas escalas', () => {
    for (const id of LOT) for (const scale of [1, 2]) for (const [anim, info] of Object.entries(index.assets[id].anims)) for (let d = 0; d < 8; d++) for (let i = 0; i < info.frames; i++) {
      const name = unitFrameName(id, anim, d, i);
      expect(frameOf('team', name, scale), `${name} ${scale}x`).toBeTruthy();
    }
    // galope a 12 fps com 8 quadros por direção (o trote fica a 10 fps)
    for (const id of LOT) {
      expect(index.assets[id].anims.run, id).toMatchObject({ frames: 8, fps: 12, loop: true });
      expect(index.assets[id].anims.walk, id).toMatchObject({ frames: 8, fps: 10, loop: true });
      const color = index.assets[id].atlases['1'].color.map((j) => JSON.parse(fs.readFileSync(path.join(ART, j), 'utf8')) as SheetJson);
      for (let d = 0; d < 8; d++) expect(color.some((s) => s.animations?.[unitAnimName(id, 'run', d)]?.length === 8), `${id} run ${d}`).toBe(true);
    }
  });

  it('silhuetas: ≥ 36 % dos pixels diferem entre quaisquer dois do lote e o hoplita (parado S e SE, galope SE)', () => {
    const ids = ['hoplite', ...LOT];
    const views: [string, number][] = [['idle', 2], ['idle', 1], ['run', 1]];
    for (const [anim, dir] of views) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const ai = ids[i] === 'hoplite' && anim === 'run' ? 'walk' : anim, aj = anim;
      const a = compose(ids[i], ai, dir), b = compose(ids[j], aj, dir);
      let union = 0, diff = 0;
      for (let k = 0; k < W * H; k++) {
        const oa = opaque(a, k), ob = opaque(b, k);
        if (!oa && !ob) continue;
        union++;
        if (oa !== ob || Math.max(Math.abs(a[k * 4] - b[k * 4]), Math.abs(a[k * 4 + 1] - b[k * 4 + 1]), Math.abs(a[k * 4 + 2] - b[k * 4 + 2])) > 60) diff++;
      }
      expect(diff / union, `${ids[i]} × ${ids[j]} (${anim} dir ${dir}): ${(100 * diff / union).toFixed(0)} % diferentes`).toBeGreaterThanOrEqual(0.36);
    }
  });
});
