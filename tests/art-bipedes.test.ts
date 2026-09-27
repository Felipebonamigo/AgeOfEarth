// Etapa 6 da arte, lote bípedes-espíritos (docs/ART.md Apêndice G): ciclope, colosso, sentinela e a Sombra no rig
// `biped` (o esqueleto humano vestido com o corpo esculpido de rigs/anatomy.js e um acabamento — pele, bronze com
// pátina, mármore pintado, espectro), o centauro (cavalo com `centaur: true`, rigs/centaur.js) e a Medusa (serpente com
// `form: 'medusa'`, rigs/medusa.js). Confere os manifestos, os kits e as poses; o rig rodando no Node (o tronco de uma
// malha só que dobra sem abrir a cintura, a estátua que desmorona em volta do pedestal, o espectro que se desfaz, o
// centauro sem cabeça de cavalo e com o tronco na cernelha, a Medusa em pé sobre o peito erguido); passada e topo
// medidos; e — com o bake local — a leitura a zoom 1: escala contra o hoplita, a cor de time à vista nas 8 direções, a
// sombra para SE, silhuetas distintas, a queda da estátua e o espectro que some.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { loadManifests, validateManifest, posesOf, sizeCeiling, type ArtManifest } from '../scripts/bake/manifest.mjs';
import { poseErrors, runCheck } from '../scripts/bake/check';
import { measureUnit } from '../scripts/bake/measure.mjs';
import { UNIT_KITS, UNIT_POSE_KEYS, DEFAULT_POSES, NESTED_HUMAN, RIG_FILES } from '../scripts/bake/page/rigs/units.js';
import { UNITS } from '../src/core/data';
import { unitFrameName } from '../src/render/art/logic';
import type { ArtManifest as ArtIndex, SheetJson } from '../src/render/art/types';

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'public', 'art');
const LOT = ['cyclops', 'colossus', 'medusa', 'centaur', 'sentinel', 'shade'];
const RIG_OF: Record<string, string> = { cyclops: 'biped', colossus: 'biped', sentinel: 'biped', shade: 'biped', centaur: 'horse', medusa: 'serpent' };
const CLASS_OF: Record<string, string> = { cyclops: 'myth', colossus: 'titan', medusa: 'myth', centaur: 'myth', sentinel: 'myth', shade: 'unit' };
const manifests = new Map(loadManifests(path.join(ROOT, 'art', 'manifest')).map((l) => [l.manifest.id, l.manifest]));
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const posesFor = (m: ArtManifest) => { const pf = posesOf(m); return { main: pf.main ? readJson(pf.main) : null, rider: pf.rider ? readJson(pf.rider) : null }; };
const params = (m: ArtManifest) => (m.source.type === 'param' ? (m.source.params ?? {}) : {}) as Record<string, any>;
/** Módulos sem tipos (three.js e a página do bake) carregados no Node pelo caminho. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dyn = (spec: string): Promise<any> => import(spec.startsWith('.') ? pathToFileURL(path.join(ROOT, spec)).href : spec);
/** O rig de unidade de um manifesto rodando no Node, com a pose de `anim` no quadro `frame` (modelo virado para −z). */
async function rigAt(id: string, anim: string, frame: number, extra: Record<string, unknown> = {}) {
  const THREE = await dyn('three');
  const { createMaterials } = await dyn('./scripts/bake/page/materials.js');
  const { UNIT_RIGS } = await dyn('./scripts/bake/page/rigs/units.js');
  const m = manifests.get(id)!, a = m.anims![anim];
  const unit = UNIT_RIGS[m.source.type === 'param' ? m.source.rig : ''](THREE, createMaterials(THREE), { ...params(m), ...extra });
  const pose = (f: number) => {
    unit.pose({ anim, pose: a.pose, rider: a.rider, dir: 2, frame: f, frames: a.frames, loop: a.loop ?? !['attack', 'die'].includes(anim) }, posesFor(m));
    unit.group.rotation.y = 0;
    unit.group.updateMatrixWorld(true);
  };
  pose(frame);
  return { THREE, unit, pose };
}

describe('Etapa 6, lote bípedes-espíritos: manifestos, kits e poses', () => {
  it('os 6 tipos míticos do jogo têm manifesto válido no rig certo: classe, página própria, 8 direções, time, sombra e as 4 animações', () => {
    for (const id of LOT) {
      const m = manifests.get(id)!;
      expect(m, id).toBeTruthy();
      expect(validateManifest(m), id).toEqual([]);
      expect(poseErrors(ROOT, m), id).toEqual([]);
      expect(UNITS[id]?.tags, id).toContain('myth');
      expect(m.source.type === 'param' && m.source.rig, id).toBe(RIG_OF[id]);
      expect([m.sizeClass, m.page, m.stage, m.dirs, m.team, m.shadow], id).toEqual([CLASS_OF[id], 'own', 6, 8, true, true]);
      for (const a of ['idle', 'walk', 'attack', 'die']) expect(m.anims?.[a], `${id} ${a}`).toBeTruthy();
      expect(!!m.flying, id).toBe(!!UNITS[id].flying);
    }
    // quem atira mira entre um disparo e outro; o centauro (3,6 tiles/s, acima de RUN_SPEED) galopa
    for (const id of ['medusa', 'centaur', 'sentinel']) expect(manifests.get(id)!.anims!.aim, id).toBeTruthy();
    expect(manifests.get('centaur')!.anims!.run).toBeTruthy();
    // a sentinela é imóvel: o andar é o mesmo quadro parado
    const sen = manifests.get('sentinel')!;
    expect(UNITS.sentinel.speed).toBe(0);
    expect([sen.anims!.walk.frames, sen.anims!.walk.pose]).toEqual([1, sen.anims!.idle.pose]);
  });
  it('kits: o rig bípede recusa valores fora do KIT (e o kit humano aninhado em `human`); o cavalo aceita `centaur`', () => {
    const cyc = manifests.get('cyclops')!;
    const withP = (m: ArtManifest, p: Record<string, unknown>) => ({ ...m, source: { ...m.source, params: { ...params(m), ...p } } }) as ArtManifest;
    expect(validateManifest(withP(cyc, { finish: 'gold' })).join()).toMatch(/finish/);
    expect(validateManifest(withP(cyc, { weapon: 'bazooka' })).join()).toMatch(/weapon/);
    expect(validateManifest(withP(cyc, { human: { helmet: 'tophat' } })).join()).toMatch(/human/);
    expect(NESTED_HUMAN.biped).toBe('human');
    expect((UNIT_KITS.horse as Record<string, unknown[]>).centaur).toEqual([false, true]);
    expect(params(manifests.get('centaur')!).centaur).toBe(true);
    expect(params(manifests.get('medusa')!).form).toBe('medusa');
    // os arquivos do corpo esculpido entram no hash dos rigs que o usam
    for (const rig of ['biped', 'horse', 'serpent'] as const) expect(RIG_FILES[rig], rig).toContain('scripts/bake/page/rigs/anatomy.js');
    expect(RIG_FILES.horse).toContain('scripts/bake/page/rigs/centaur.js');
    expect(RIG_FILES.serpent).toContain('scripts/bake/page/rigs/medusa.js');
  });
  it('arquivos de poses: biped (pivôs do humano + crumble/fade), centaur (tronco, pivôs do humano) e medusa (corpo da serpente); t crescente', () => {
    expect(DEFAULT_POSES.biped).toBe('art/poses/biped.json');
    const files: [string, { joints: string[]; scalars: string[] }][] = [
      ['art/poses/biped.json', UNIT_POSE_KEYS.biped], ['art/poses/centaur.json', UNIT_POSE_KEYS.human], ['art/poses/medusa.json', UNIT_POSE_KEYS.serpent],
    ];
    expect(UNIT_POSE_KEYS.biped.joints).toEqual(UNIT_POSE_KEYS.human.joints);
    expect(UNIT_POSE_KEYS.biped.scalars).toEqual(expect.arrayContaining(['draw', 'hold', 'crumble', 'fade']));
    for (const [file, keys] of files) {
      const f = readJson(file) as { joints: string[]; anims: Record<string, { keys: Record<string, unknown>[] }> };
      expect(f.joints, file).toEqual(keys.joints);
      for (const [name, a] of Object.entries(f.anims)) {
        let last = -1;
        for (const k of a.keys) {
          const t = k.t as number;
          expect(t >= 0 && t <= 1 && t > last, `${file} ${name} t=${t}`).toBe(true);
          last = t;
          for (const key of Object.keys(k)) if (key !== 't') expect([...keys.joints, ...keys.scalars], `${file} ${name}: ${key}`).toContain(key);
        }
      }
    }
  });
  it('disparos: a corda solta no quadro 0 (o projétil sai no tick do ataque) e a mira segura a corda puxada; golpes chegam no 2º quadro', () => {
    const kf = (file: string, name: string) => (readJson(file).anims[name].keys as Record<string, any>[]);
    for (const [file, atk, aim] of [['art/poses/biped.json', 'attack_sentinel', 'aim_sentinel'], ['art/poses/centaur.json', 'attack_centaur', 'aim_centaur'], ['art/poses/medusa.json', 'attack_medusa', 'aim_medusa']]) {
      const k = kf(file, atk);
      expect(k[0].t, atk).toBe(0);
      expect(k[0].draw, atk).toBe(0);
      expect(k[k.length - 1].draw, atk).toBe(1);
      for (const a of kf(file, aim)) expect(a.draw, aim).toBe(1);
    }
    // corpo a corpo (6 quadros): o impacto é a chave t = 0,2 (o 2º quadro), com a arma mais baixa que no quadro 0
    for (const atk of ['attack_cyclops', 'attack_colossus', 'attack_shade']) {
      const k = kf('art/poses/biped.json', atk);
      const hit = k.find((x) => x.t === 0.2)!;
      expect(hit, atk).toBeTruthy();
      expect(hit.shoulderR[0], atk).toBeLessThan(k[0].shoulderR[0]);
    }
  });
});

describe('Etapa 6, lote bípedes-espíritos: o rig no Node', () => {
  it('corpo esculpido: o tronco é UMA malha com pele de dois ossos — a bacia fica, o peito dobra com o tronco, sem abrir fresta', async () => {
    const torsoOf = (unit: any) => { let t: any = null; unit.group.traverse((o: any) => { if (o.isMesh && o.visible && o.geometry.type === 'BufferGeometry' && o.geometry.attributes.position.count > 1000 && !t) t = o; }); return t; };
    const ringGap = (geo: any, THREE: any) => {
      const p = geo.attributes.position, seg = 30, a = new THREE.Vector3(), b = new THREE.Vector3();
      let worst = 0; for (let i = 0; i + seg < p.count - 1; i++) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + seg); worst = Math.max(worst, a.distanceTo(b)); }
      return worst;
    };
    const idle = await rigAt('cyclops', 'idle', 0), atk = await rigAt('cyclops', 'attack', 1);   // impacto: tronco ~36° à frente
    const t0 = torsoOf(idle.unit), t1 = torsoOf(atk.unit);
    const p0 = t0.geometry.attributes.position, p1 = t1.geometry.attributes.position;
    expect(p0.count).toBe(p1.count);
    // no espaço da malha (pivô root): o primeiro anel (virilha) quase não se mexe; o último (pescoço) anda bastante
    const d = (i: number) => Math.hypot(p1.getX(i) - p0.getX(i), p1.getY(i) - p0.getY(i), p1.getZ(i) - p0.getZ(i));
    expect(d(0), 'virilha parada').toBeLessThan(0.01);
    expect(d(p0.count - 2), 'pescoço dobrado com o tronco').toBeGreaterThan(0.1);
    // a distância entre anéis vizinhos não cresce mais que 35 % com a dobra (nenhuma fresta na cintura)
    const g0 = ringGap(t0.geometry, idle.THREE), g1 = ringGap(t1.geometry, atk.THREE);
    expect(g1 / g0, `anéis: ${g0.toFixed(3)} → ${g1.toFixed(3)} m`).toBeLessThan(1.35);
  });
  it('sentinela: com crumble = 1 as peças caem no chão ou em cima do pedestal (nada fica no alto) e as lascas aparecem', async () => {
    const { THREE, unit, pose } = await rigAt('sentinel', 'die', 0);
    const top = () => { let t = -Infinity; const v = new THREE.Vector3(); unit.group.traverse((o: any) => { if (o.isMesh && o.visible) { o.getWorldPosition(v); t = Math.max(t, v.y); } }); return t; };
    const standing = top();
    pose(5);
    const fallen = top();
    // (tiles: a estátua de 2,2 m em pé passa de 1 tile de altura; os pedaços ficam abaixo de ~0,4 tile)
    expect(standing).toBeGreaterThan(1.0);
    expect(fallen, `topo ${fallen.toFixed(2)} tile`).toBeLessThan(0.45);
    let chips = 0; unit.group.traverse((o: any) => { if (o.isMesh && o.geometry.type === 'DodecahedronGeometry' && o.visible) chips++; });
    expect(chips).toBeGreaterThan(8);
    // e volta inteira no quadro seguinte de outra animação (o desmoronar não fica "grudado" no rig)
    pose(0);
    expect(top()).toBeCloseTo(standing, 3);
  });
  it('Sombra: `fade` apaga o espectro — material translúcido, olhos, partes de time e sombras somem; só o elmo de bronze (com a crina de time) cai e fica no chão', async () => {
    const { THREE, unit, pose } = await rigAt('shade', 'die', 0);
    const state = () => {
      const r = { team: 0, shadows: 0, helmTeam: 0, helmShadows: 0, opacity: 1, mats: new Set<any>() };
      unit.group.traverse((o: any) => {
        if (!o.isMesh || !o.visible) return;
        const helm = !!o.userData.helm;
        if (o.material?.userData?.team) { if (helm) r.helmTeam++; else r.team++; }
        if (!o.userData.noShadow) { if (helm) r.helmShadows++; else r.shadows++; }
        if (o.material?.transparent) r.mats.add(o.material);
      });
      r.opacity = Math.min(...[...r.mats].map((m: any) => m.opacity));
      return r;
    };
    // caixa do elmo no espaço do grupo (tiles; y = altura acima do chão)
    const helmBox = () => { const b = new THREE.Box3(); unit.group.traverse((o: any) => { if (o.isMesh && o.visible && o.userData.helm) b.expandByObject(o); }); return b; };
    const alive = state();
    expect(alive.team).toBeGreaterThan(1);
    expect(alive.helmTeam).toBe(1);
    expect(alive.opacity).toBe(1);
    expect(helmBox().max.y).toBeGreaterThan(0.8);   // na cabeça (1,9 m = 0,95 tile)
    pose(manifests.get('shade')!.anims!.die.frames - 1);
    const gone = state(), box = helmBox();
    expect(gone.team).toBe(0);
    expect(gone.shadows).toBe(0);
    expect(gone.opacity).toBeLessThan(0.15);
    // o que fica: o elmo com a crina (máscara de time e sombra no último quadro, como o art:check pede), deitado no chão
    expect(gone.helmTeam).toBe(1);
    expect(gone.helmShadows).toBeGreaterThan(0);
    expect(box.max.y).toBeLessThan(0.2);
    expect(box.min.y).toBeGreaterThan(-0.03);
    // e volta à cabeça no quadro seguinte de outra animação
    pose(0);
    expect(helmBox().max.y).toBeGreaterThan(0.8);
  });
  it('centauro: sem pescoço nem cabeça de cavalo; o tronco humano sobe da cernelha (topo ≥ 2 m) na frente do corpo', async () => {
    const { THREE, unit } = await rigAt('centaur', 'idle', 0);
    let neckHidden = false;
    unit.group.traverse((o: any) => { if (o.isMesh && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.height === 0.74) for (let q = o; q; q = q.parent) if (!q.visible) neckHidden = true; });
    expect(neckHidden, 'pescoço do cavalo escondido').toBe(true);
    // o ponto mais alto visível (a cabeça humana) em metros (M2T = 0,5), à frente (−z) do centro do cavalo
    const v = new THREE.Vector3();
    let top = -Infinity, topZ = 0;
    unit.group.traverse((o: any) => {
      if (!o.isMesh) return;
      for (let q = o; q; q = q.parent) if (!q.visible) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 7) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.y > top) { top = v.y; topZ = v.z; } }
    });
    expect(top * 2, `topo a ${(top * 2).toFixed(2)} m`).toBeGreaterThan(2.0);
    expect(topZ, 'à frente (−z)').toBeLessThan(-0.1);
  });
  it('Medusa: o tronco fica em pé sobre o peito erguido da serpente (o `lift` não o inclina) e tomba junto no `roll` da morte', async () => {
    // o pivô da cabeça é o pai dos olhos que brilham; a raiz humana, 2 níveis acima: a orientação dela é a do tronco
    const upOf = (THREE: any, unit: any) => {
      let eye: any = null;
      unit.group.traverse((o: any) => { if (o.isMesh && o.material?.type === 'MeshBasicMaterial' && o.material.color?.getHex() === 0xffd84a) eye = o; });
      const root = eye.parent.parent.parent, q = new THREE.Quaternion();
      root.getWorldQuaternion(q);
      return new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    };
    const a = await rigAt('medusa', 'idle', 0);
    const u0 = upOf(a.THREE, a.unit);
    expect(u0.y, `em pé: ${u0.toArray().map((x: number) => x.toFixed(2))}`).toBeGreaterThan(0.97);
    const b = await rigAt('medusa', 'die', 5);
    expect(upOf(b.THREE, b.unit).y, 'tombada no fim da queda').toBeLessThan(0.6);
  });
});

describe('Etapa 6, lote bípedes-espíritos: passada e topo medidos no rig', () => {
  const me = (id: string) => measureUnit(manifests.get(id)!, posesFor(manifests.get(id)!))!;
  it('passada: ciclope ≈ humano × 3,6/1,8; colosso a passos curtos e pesados; Sombra pelo deslizar; Medusa pela onda; sentinela parada; centauro trota e galopa', () => {
    const hop = me('hoplite').strides.walk;
    const cyc = me('cyclops'), col = me('colossus'), sha = me('shade'), med = me('medusa'), sen = me('sentinel'), cen = me('centaur');
    expect(cyc.strides.walk / hop).toBeGreaterThan(1.7);
    expect(cyc.strides.walk / hop).toBeLessThan(2.3);
    // 5 m de altura (× 2,78) mas passos curtos: menos de 2,6× a passada humana e mais que a do ciclope
    expect(col.strides.walk).toBeGreaterThan(cyc.strides.walk);
    expect(col.strides.walk / hop).toBeLessThan(2.6);
    expect(sha.strides.walk).toBeCloseTo(4.0 * 0.5 * (1.9 / 1.8), 2);
    expect(med.strides.walk).toBeCloseTo(7 * 0.27 * 0.5, 2);
    // a sentinela não anda (velocidade 0): a passada do andar de um quadro é só nominal (o art:check pede passada > 0)
    expect(sen.strides.walk).toBeCloseTo(1.0 * 0.5 * (2.2 / 1.8), 2);
    expect(cen.strides.walk).toBeGreaterThan(0.6);
    expect(cen.strides.run).toBeGreaterThan(1.4);
    for (const id of LOT) { const t = me(id).tops; expect(t, id).toHaveLength(8); for (const x of t) expect(x, id).toBeGreaterThan(20); }
  });
  it('topo do corpo (barra de vida) a zoom 1: ciclope ≈ 1,5–2× o hoplita e o colosso ≈ 2,5×; o tronco e o malho não contam', () => {
    const top = (id: string) => Math.max(...me(id).tops.slice(0, 5));
    const hop = top('hoplite');
    expect(top('cyclops') / hop).toBeGreaterThan(1.4);
    expect(top('cyclops') / hop).toBeLessThan(2.1);
    expect(top('colossus') / hop).toBeGreaterThan(2.1);
    expect(top('colossus') / hop).toBeLessThan(2.9);
    expect(top('colossus')).toBeGreaterThan(top('cyclops'));
  });
});

const hasArt = fs.existsSync(path.join(ART, 'manifest.json'));
describe.skipIf(!hasArt)('Etapa 6, lote bípedes-espíritos: atlas (bake local)', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8')) as ArtIndex;
  const baked = LOT.every((id) => index.assets[id]) && !!index.assets.hoplite;
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
  /** Pixels com alfa ≥ `min` (px de 1×, relativos ao pé). */
  const pts = (pass: string, name: string, min = 128): { x: number; y: number }[] => {
    const r = frameOf(pass, name); if (!r) return [];
    const { f, img, k } = r, out: { x: number; y: number }[] = [];
    const ax = f.anchor.x * f.sourceSize.w, ay = f.anchor.y * f.sourceSize.h;
    for (let y = 0; y < f.frame.h; y++) for (let x = 0; x < f.frame.w; x++) {
      if (img.data[((f.frame.y + y) * img.width + f.frame.x + x) * 4 + 3] >= min) out.push({ x: Math.round((f.spriteSourceSize.x + x - ax) * k), y: Math.round((f.spriteSourceSize.y + y - ay) * k) });
    }
    return out;
  };
  const top = (id: string, dir = 2, anim = 'idle', i = 0) => -Math.min(...pts('color', unitFrameName(id, anim, dir, i)).map((p) => p.y));

  it.skipIf(!baked)('art:check sem erros; cada criatura em páginas próprias, no teto da classe dela', () => {
    expect(runCheck(ROOT).errors).toEqual([]);
    for (const id of LOT) {
      const a = index.assets[id];
      expect(a?.sizeClass ?? 'unit', id).toBe(CLASS_OF[id]);   // o índice omite a classe padrão
      for (const [s, passes] of Object.entries(a.atlases)) for (const pass of ['color', 'team', 'shadow'] as const) for (const j of passes[pass] ?? []) {
        expect(Object.keys(sheets.get(j)!.frames).every((n) => n.startsWith(id + '/')), `${id} ${s}× ${j}`).toBe(true);
      }
      const f = sheets.get(a.atlases['1'].color![0])!.frames[unitFrameName(id, 'idle', 2, 0)];
      expect(Math.max(f.sourceSize.w, f.sourceSize.h), id).toBeLessThanOrEqual(sizeCeiling(manifests.get(id)!));
    }
  });
  it.skipIf(!baked)('escala a zoom 1 (topo do corpo no índice): ciclope ≈ 1,5× o hoplita, colosso ≈ 2,5×, Medusa e sentinela acima dele, Sombra da altura dele, centauro abaixo do hetairo montado', () => {
    const t = (id: string, dir = 2) => index.assets[id].tops![dir];
    const r = (id: string, dir = 2) => t(id, dir) / t('hoplite', dir);
    const between = (v: number, lo: number, hi: number, label: string) => { expect(v, `${label} ${v.toFixed(2)}`).toBeGreaterThan(lo); expect(v, `${label} ${v.toFixed(2)}`).toBeLessThan(hi); };
    between(r('cyclops'), 1.4, 2.1, 'ciclope/hoplita');
    between(r('colossus'), 2.1, 2.9, 'colosso/hoplita');
    between(r('medusa', 6), 1.2, 1.9, 'Medusa/hoplita (N: de frente o tronco fica à frente do pé)');
    between(r('sentinel'), 1.1, 1.5, 'sentinela/hoplita');
    between(r('shade'), 0.85, 1.25, 'Sombra/hoplita');
    if (index.assets.hetairoi) between(t('centaur') / t('hetairoi'), 0.6, 1.1, 'centauro/hetairo');
  });
  it.skipIf(!baked)('cor de time à vista em todas as direções (parado e andando) e a sombra caindo para SE', () => {
    for (const id of LOT) for (let dir = 0; dir < 8; dir++) for (const anim of ['idle', 'walk']) {
      const name = unitFrameName(id, anim, dir, 0);
      const team = pts('team', name, 64).length;
      expect(team, `${name}: máscara de time`).toBeGreaterThanOrEqual(id === 'shade' ? 20 : 30);
      if (anim !== 'idle') continue;
      const c = pts('color', name), s = pts('shadow', name, 64);
      const cx = c.reduce((n, p) => n + p.x, 0) / c.length, cy = c.reduce((n, p) => n + p.y, 0) / c.length;
      const sx = s.reduce((n, p) => n + p.x, 0) / s.length, sy = s.reduce((n, p) => n + p.y, 0) / s.length;
      expect(sx - cx, `${name}: sombra à direita do corpo`).toBeGreaterThan(2);
      expect(sy - cy, `${name}: sombra abaixo do corpo`).toBeGreaterThan(2);
    }
  });
  it.skipIf(!baked)('queda: a estátua desmorona (o topo cai para perto do pedestal) e o espectro some (quase nenhum pixel no último quadro)', () => {
    expect(top('sentinel', 1, 'die', 5)).toBeLessThan(top('sentinel', 1) * 0.6);
    const alive = pts('color', unitFrameName('shade', 'idle', 1, 0), 64).length, gone = pts('color', unitFrameName('shade', 'die', 1, manifests.get('shade')!.anims!.die.frames - 1), 64).length;
    expect(gone, `Sombra: ${gone} de ${alive} px no fim da queda`).toBeLessThan(alive * 0.15);
  });
  it.skipIf(!baked)('silhuetas a zoom 1 (parado, as 8 direções): em média ≥ 36 % dos pixels diferem entre as criaturas do lote, o hoplita e o hetairo', () => {
    const ids = [...LOT, 'hoplite', ...(index.assets.hetairoi ? ['hetairoi'] : [])];
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
    }
  });
});
