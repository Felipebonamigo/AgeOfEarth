// Lote "distância-cerco" da Etapa 4 (docs/ART.md Apêndice E): peltasta (dardos e pelta), arqueiro cretense (arco de
// elite), petróbolo e helépole. Manifestos (tipos do jogo, rigs, kits distintos, poses que existem, animações do
// cerco no ritmo de §1.4) e — se o bake local existir (public/art) — o que se lê a zoom 1: pé na âncora, sombra para
// SE, altura do hoplita, cerco dentro do teto de 128 px com a âncora no meio da máquina e silhuetas distintas entre
// quaisquer dois do lote e o hoplita. O teste "toda unidade com arte" (art-library) cobre animações × direções ×
// passes × escalas e a página única por passe.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { loadManifests, validateManifest, expandFrames, REQUIRED_UNIT_ANIMS, type ArtManifest } from '../scripts/bake/manifest.mjs';
import { poseErrors, BUDGET } from '../scripts/bake/check';
import { UNIT_KITS } from '../scripts/bake/page/rigs/units.js';
import { UNITS } from '../src/core/data';
import type { SheetJson } from '../src/render/art/types';

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'public', 'art');
const HUMANS = ['peltast', 'cretan_archer'];
const SIEGE = ['petrobolos', 'helepolis'];
const LOT = [...HUMANS, ...SIEGE];
const manifests = new Map(loadManifests(path.join(ROOT, 'art', 'manifest')).map((l) => [l.manifest.id, l.manifest]));
const params = (m: ArtManifest) => (m.source.type === 'param' ? m.source.params ?? {} : {}) as Record<string, unknown>;
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

describe('lote distância-cerco: manifestos', () => {
  it('os 4 tipos do jogo têm manifesto válido (etapa 4, 8 direções, time e sombra) e poses que existem', () => {
    for (const id of LOT) {
      const m = manifests.get(id)!;
      expect(m?.kind, id).toBe('unit');
      expect(UNITS[id], id).toBeTruthy();
      expect(validateManifest(m), id).toEqual([]);
      expect(poseErrors(ROOT, m), id).toEqual([]);
      expect([m.stage, m.dirs, m.team, m.shadow], id).toEqual([4, 8, true, true]);
      for (const a of REQUIRED_UNIT_ANIMS) expect(m.anims?.[a], `${id} ${a}`).toBeTruthy();
      expect(expandFrames(m).length, id).toBe(8 * Object.values(m.anims!).reduce((s, a) => s + a.frames, 0));
    }
  });
  it('peltasta e arqueiro cretense: rig humano, arma à distância com mira entre disparos', () => {
    expect(params(manifests.get('peltast')!)).toMatchObject({ shield: 'pelte', weapon: 'javelin' });
    expect(params(manifests.get('cretan_archer')!)).toMatchObject({ weapon: 'bow' });
    for (const id of HUMANS) {
      const m = manifests.get(id)!;
      expect(m.source.type === 'param' && m.source.rig, id).toBe('human');
      expect(m.anims!.aim, id).toBeTruthy();
    }
    const a = manifests.get('peltast')!.anims!, b = manifests.get('cretan_archer')!.anims!;
    expect([a.attack.pose, a.aim!.pose, b.attack.pose, b.aim!.pose]).toEqual(['attack_javelin', 'aim_javelin', 'attack_bow', 'aim_bow']);
  });
  it('pelta à frente no parado e no andar (poses idle_pelte/walk_pelte): antebraço esquerdo erguido e o feixe de dardos atrás dela', () => {
    const human = readJson('art/poses/human.json').anims as Record<string, { keys: Record<string, number[]>[] }>;
    const m = manifests.get('peltast')!;
    expect([m.anims!.idle.pose, m.anims!.walk.pose]).toEqual(['idle_pelte', 'walk_pelte']);
    for (const p of ['idle_pelte', 'walk_pelte']) for (const k of human[p].keys) {
      // ombro + cotovelo ≥ 100°: o antebraço aponta para a frente (a face da pelta, de time, vira para onde ele olha)
      expect(k.shoulderL[0] + k.elbowL[0], p).toBeGreaterThanOrEqual(100);
      expect(k.shield, p).toBeTruthy();
      expect(k.bundle, p).toBeTruthy();
    }
  });
  it('kits distintos: pelo menos 3 das 8 peças diferem entre quaisquer dois dos humanos do lote, o hoplita e o toxota', () => {
    const kitOf = (id: string) => { const p = params(manifests.get(id)!); return [p.helmet ?? 'none', p.armor ?? 'tunic', p.shield ?? 'none', p.weapon ?? 'none', p.metal ?? 'bronze', p.shieldTeam ?? 'center', p.cape ?? 'none', p.helmetMat ?? 'bronze']; };
    const ids = ['hoplite', 'toxotes', ...HUMANS];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = kitOf(ids[i]), b = kitOf(ids[j]);
      expect(a.filter((v, k) => v !== b[k]).length, `${ids[i]} × ${ids[j]}`).toBeGreaterThanOrEqual(3);
    }
  });
  it('petróbolo e helépole: rig de cerco com o estilo do próprio tipo; parado 1, rodar 6, disparo 8 e desmonte 6 quadros (§1.4)', () => {
    for (const id of SIEGE) {
      const m = manifests.get(id)!;
      expect(m.source).toMatchObject({ type: 'param', rig: 'siege', params: { style: id } });
      expect(UNIT_KITS.siege.style, id).toContain(id);
      expect(Object.fromEntries(Object.entries(m.anims!).map(([a, d]) => [a, [d.frames, d.pose]])), id)
        .toEqual({ idle: [1, `idle_${id}`], walk: [6, `roll_${id}`], attack: [8, `fire_${id}`], die: [6, `die_${id}`] });
    }
    // o disparo começa no tick em que o projétil sai: sem pedra no primeiro quadro, recarregada no último
    const siege = readJson('art/poses/siege.json').anims as Record<string, { keys: Record<string, number>[] }>;
    for (const id of SIEGE) {
      const k = siege[`fire_${id}`].keys;
      expect([k[0].stone, k.at(-1)!.stone], id).toEqual([0, 1]);
      expect(siege[`die_${id}`].keys.at(-1)!.collapse, id).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Com o bake local (public/art): composição a 1× (32 px/tile = zoom 1), como em art-library.test.ts

const hasArt = fs.existsSync(path.join(ART, 'manifest.json'));
const index = hasArt ? JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8')) as { atlases: { json: string; image: string; group: string; pass: string; scale: number }[]; assets: Record<string, { sizes?: Record<string, { sourceSize: { w: number; h: number } }> }> } : null;

describe.runIf(hasArt)('lote distância-cerco assado (public/art)', () => {
  const sheets = new Map<string, SheetJson>(), imgs = new Map<string, PNG>();
  const frameOf = (pass: string, name: string) => {
    for (const a of index!.atlases) if (a.group === 'units' && a.scale === 1 && a.pass === pass) {
      if (!sheets.has(a.json)) sheets.set(a.json, JSON.parse(fs.readFileSync(path.join(ART, a.json), 'utf8')) as SheetJson);
      const f = sheets.get(a.json)!.frames[name];
      if (!f) continue;
      if (!imgs.has(a.image)) imgs.set(a.image, PNG.sync.read(fs.readFileSync(path.join(ART, a.image))));
      return { f, img: imgs.get(a.image)! };
    }
    return null;
  };
  const W = 160, H = 160, AX = 80, AY = 104;
  const name = (id: string, anim: string, dir: number, i = 0) => `${id}/${anim}/${dir}/${String(i).padStart(2, '0')}`;
  /** Cor + máscara de time tingida (ou só a sombra), com a âncora em (AX, AY). */
  const compose = (id: string, anim: string, dir: number, pass = 'color') => {
    const out = new Float32Array(W * H * 4);
    const put = (p: string, tint: number | null) => {
      const r = frameOf(p, name(id, anim, dir)); if (!r) return;
      const { f, img } = r;
      const ox = Math.round(AX - f.anchor!.x * f.sourceSize.w + f.spriteSourceSize.x), oy = Math.round(AY - f.anchor!.y * f.sourceSize.h + f.spriteSourceSize.y);
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
  const shadowCentroid = (id: string, dir: number) => {
    const sh = compose(id, 'idle', dir, 'shadow');
    let sx = 0, sy = 0, sw = 0; for (let i = 0; i < W * H; i++) { const a = sh[i * 4 + 3]; sx += (i % W - AX) * a; sy += (Math.floor(i / W) - AY) * a; sw += a; }
    return { x: sx / sw, y: sy / sw, w: sw };
  };

  it('os 4 tipos no índice, dentro do teto de unidade (128 px a 1×, 256 a 2×: a queda da helépole cabe)', () => {
    for (const id of LOT) for (const s of [1, 2]) {
      const size = index!.assets[id]?.sizes?.[String(s)]?.sourceSize;
      expect(size, `${id} ${s}×`).toBeTruthy();
      expect(Math.max(size!.w, size!.h), `${id} ${s}×: ${size!.w}×${size!.h}`).toBeLessThanOrEqual(BUDGET.maxSourceSize.unit * s);
    }
  });

  it('humanos a zoom 1: pé na âncora, sombra para SE e a altura do hoplita', () => {
    const hopTop = topOf('hoplite');
    for (const id of HUMANS) {
      const c = compose(id, 'idle', 2);
      let bottom = -1; for (let i = 0; i < W * H; i++) if (opaque(c, i) && Math.abs((i % W) - AX) <= 3) bottom = Math.floor(i / W);
      expect(Math.abs(bottom - AY), `${id}: pé a ${bottom - AY} px da âncora`).toBeLessThanOrEqual(3);
      const sc = shadowCentroid(id, 2);
      expect(sc.w, `${id}: sombra`).toBeGreaterThan(20);
      expect(sc.x > 1 && sc.y > 0.5, `${id}: sombra para SE (${sc.x.toFixed(1)}, ${sc.y.toFixed(1)})`).toBe(true);
      const t = topOf(id);
      expect(t / hopTop, `${id}: altura ${t} px × hoplita ${hopTop} px`).toBeGreaterThan(0.8);
      expect(t / hopTop, `${id}: altura ${t} px × hoplita ${hopTop} px`).toBeLessThan(1.2);
    }
  });

  it('cerco a zoom 1: âncora no meio da máquina (nas 8 direções), sombra para SE; petróbolo da altura do hoplita, helépole ≥ 2×', () => {
    const hopTop = topOf('hoplite');
    for (const id of SIEGE) for (let d = 0; d < 8; d++) {
      const c = compose(id, 'idle', d);
      let x0 = W, x1 = -1, y0 = H, y1 = -1;
      for (let i = 0; i < W * H; i++) if (opaque(c, i)) { const x = i % W, y = Math.floor(i / W); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      // a âncora (centro da máquina no chão) cai dentro da silhueta, com a frente/traseira abaixo dela e o topo acima
      expect(AX > x0 + 4 && AX < x1 - 4, `${id}/${d}: âncora x ${AX} em [${x0}, ${x1}]`).toBe(true);
      expect(y1 - AY, `${id}/${d}: base ${y1 - AY} px abaixo da âncora`).toBeGreaterThanOrEqual(6);
      // medido: petróbolo 28–47 px (o batente, 1,7 m; mais alto de frente, com o braço e a pedra), helépole 66–75, hoplita 30
      expect(AY - y0, `${id}/${d}: topo ${AY - y0} px acima (hoplita ${hopTop})`).toBeGreaterThanOrEqual((id === 'helepolis' ? 2 : 0.8) * hopTop);
      const sc = shadowCentroid(id, d);
      expect(sc.x > 1 && sc.y > 0.5, `${id}/${d}: sombra para SE (${sc.x.toFixed(1)}, ${sc.y.toFixed(1)})`).toBe(true);
    }
  });

  it('silhuetas a zoom 1: ≥ 36 % dos pixels diferem entre quaisquer dois do lote e o hoplita (S e SE); os dois arqueiros ≥ 30 %', () => {
    const diffOf = (p: string, q: string, dir: number) => {
      const a = compose(p, 'idle', dir), b = compose(q, 'idle', dir);
      let union = 0, diff = 0;
      for (let k = 0; k < W * H; k++) {
        const oa = opaque(a, k), ob = opaque(b, k);
        if (!oa && !ob) continue;
        union++;
        if (oa !== ob || Math.max(Math.abs(a[k * 4] - b[k * 4]), Math.abs(a[k * 4 + 1] - b[k * 4 + 1]), Math.abs(a[k * 4 + 2] - b[k * 4 + 2])) > 60) diff++;
      }
      return diff / union;
    };
    const ids = ['hoplite', ...LOT];
    for (const dir of [1, 2]) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const r = diffOf(ids[i], ids[j], dir);
      expect(r, `${ids[i]} × ${ids[j]} (dir ${dir}): ${(100 * r).toFixed(0)} % diferentes`).toBeGreaterThanOrEqual(0.36);
    }
    // (medido: 45–57 % entre os humanos e o hoplita, 80–96 % com o cerco)
    // arqueiro cretense (couraça de bronze, grevas, crina alta e capa longa de time) × toxota (gorro de time e linho):
    // mesmo corpo e mesmas poses de arco, então a diferença é de cor e cabeça — 32–35 % (como hoplita × hipaspista no lote 1)
    for (const dir of [1, 2, 6]) {
      const r = diffOf('cretan_archer', 'toxotes', dir);
      expect(r, `cretan_archer × toxotes (dir ${dir}): ${(100 * r).toFixed(0)} %`).toBeGreaterThanOrEqual(0.3);
    }
  });
});
