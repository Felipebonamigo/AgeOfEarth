// Lado da página do bake (Chromium headless + three.js). Recebe do bake.mjs um "lote" (manifesto + lista de quadros)
// e devolve, por quadro, os três passes em RGBA não pré-multiplicado (base64), já reduzidos da super-amostragem:
//   cor    — o modelo com materiais PBR e sombras próprias (sem chão), fundo transparente;
//   time   — só as partes marcadas como time (material `team` ou `userData.team`), em branco iluminado; o resto do
//            modelo só escreve profundidade (esconde o que está atrás do corpo);
//   sombra — só a sombra projetada no chão (ShadowMaterial), modelo invisível; alfa = intensidade da sombra.
// O mapa de sombras é calculado uma vez por pose (autoUpdate desligado) e reaproveitado nos três passes.
// Edifícios (Etapa 3): peças `userData.context` (vizinhos da muralha) só projetam sombra; `userData.decal` (dano) não
// projetam sombra nem entram na máscara de time; `group.userData.shadowClip` recorta a sombra no chão à região da peça
// (menos os retângulos de `cut`).
// Ícones (`f.icon`): câmera do contrato enquadrada no modelo, ICON_PX² sem chão, passes cor e time.
// Tudo é reproduzível: nada de Math.random; variações vêm de sementes por nome (props.js).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PX_PER_TILE, SSAA, M2T, dirYaw, makeCamera, makeLights, HEMI_INTENSITY, HEMI_INTENSITY_BUILDINGS } from './camera.js';
import { createMaterials } from './materials.js';
import { buildHuman } from './rigs/human.js';
import { UNIT_RIGS } from './rigs/units.js';
import { buildProp } from './props.js';
import { buildBuilding } from './buildings.js';

const LAYER_MODEL = 0, LAYER_GROUND = 1;

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;      // r0.186 removeu PCFSoft; a penumbra vem de shadow.radius (camera.js)
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();

const M = createMaterials(THREE);
// Reflexo de ambiente só nos metais (sem ele o bronze metálico fica quase preto fora do brilho do sol)
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
for (const k of ['bronze', 'bronzeDark', 'iron', 'gold', 'bronzeBlack', 'mirror', 'fleece']) { M[k].envMap = envTex; M[k].envMapIntensity = 0.55; }
const scene = new THREE.Scene();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), M.shadowGround);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.layers.set(LAYER_GROUND);
scene.add(ground);
let lights = null;
function setLights(extent, hemi = HEMI_INTENSITY) {
  if (lights) { scene.remove(lights.sun, lights.sun.target, lights.hemi); lights.sun.shadow.map?.dispose(); lights.sun.dispose(); }
  lights = makeLights(THREE, extent, hemi);
  for (const o of [lights.sun, lights.hemi]) o.layers.enableAll();   // luzes valem nos dois layers (cor e sombra)
  scene.add(lights.sun, lights.sun.target, lights.hemi);
}

// ---------------------------------------------------------------------------------------------------------------
// Leitura de pixels e redução da super-amostragem

function readRGBA(w, h) {
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const out = new Uint8Array(w * h * 4);                // o WebGL lê de baixo para cima
  for (let y = 0; y < h; y++) out.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  return out;
}

/** Média S×S ponderada pelo alfa (cor não pré-multiplicada na entrada e na saída). */
function downsample(src, W, H, S) {
  const w = W / S, h = H / S, out = new Uint8Array(w * h * 4), n = S * S;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const p = ((y * S + j) * W + x * S + i) * 4, al = src[p + 3];
      r += src[p] * al; g += src[p + 1] * al; b += src[p + 2] * al; a += al;
    }
    const d = (y * w + x) * 4;
    if (a > 0) { out[d] = Math.round(r / a); out[d + 1] = Math.round(g / a); out[d + 2] = Math.round(b / a); }
    out[d + 3] = Math.round(a / n);
  }
  return out;
}

function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

const isEmpty = (u8) => { for (let i = 3; i < u8.length; i += 4) if (u8[i]) return false; return true; };

// ---------------------------------------------------------------------------------------------------------------
// Passes

function forEachMesh(root, fn) { root.traverse((o) => { if (o.isMesh) fn(o); }); }
const isTeam = (mat) => !!mat?.userData?.team;

/**
 * Recorta a sombra no chão à região { x0, x1, z0, z1 } (tiles em relação à origem do asset; ±Infinity = aberto). O
 * passe de sombra só desenha o chão (y = 0), que a câmera projeta 1:1: o pixel (px, py) do quadro é o ponto
 * ((px − ax)/ppt, (py − ay)/ppt) do chão. Com a âncora em px inteiros e as bordas em múltiplos de ½ tile, a fronteira
 * cai exatamente entre pixels — duas peças vizinhas se completam sem sobra nem falta. (O ShadowMaterial do three não
 * aceita clippingPlanes, por isso o recorte é feito nos pixels.)
 */
function clipShadow(s, box, ppt, c) {
  const cuts = c.cut ?? [];
  for (let py = 0; py < box.h; py++) {
    const z = (py + 0.5 - box.ay) / ppt;
    const rowOut = z < c.z0 || z > c.z1;
    const rowCuts = cuts.filter((r) => z >= r.z0 && z <= r.z1);
    for (let px = 0; px < box.w; px++) {
      const x = (px + 0.5 - box.ax) / ppt;
      if (rowOut || x < c.x0 || x > c.x1 || rowCuts.some((r) => x >= r.x0 && x <= r.x1)) s[(py * box.w + px) * 4 + 3] = 0;
    }
  }
}

/**
 * Renderiza os três passes do `model` (já posado) num quadro `box` = { w, h, ax, ay } em px finais (1× ou 2×).
 * Devolve `{ color, team, shadow }` em RGBA (Uint8Array) ou null para passes desligados/vazios. `cam` opcional (ícones).
 */
function renderPasses(model, box, { scale, team, shadow, cam: camIn = null }) {
  const ppt = PX_PER_TILE * scale;
  const W = box.w * SSAA, H = box.h * SSAA;
  if (renderer.domElement.width !== W || renderer.domElement.height !== H) renderer.setSize(W, H, false);
  const cam = camIn ?? makeCamera(THREE, { wTiles: box.w / ppt, hTiles: box.h / ppt, anchor: [box.ax / box.w, box.ay / box.h] });
  model.updateMatrixWorld(true);
  forEachMesh(model, (o) => { o.layers.set(LAYER_MODEL); o.castShadow = !o.userData.noShadow; o.receiveShadow = !o.userData.context; });
  const out = { color: null, team: null, shadow: null };

  // 1) cor (o mapa de sombras é atualizado aqui e reaproveitado nos outros passes)
  cam.layers.set(LAYER_MODEL);
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, cam);
  out.color = downsample(readRGBA(W, H), W, H, SSAA);

  // 2) máscara de time
  if (team) {
    const saved = [];
    let any = false;
    // os oclusores (só profundidade) têm de ser desenhados ANTES das partes de time: um oclusor desenhado depois não
    // apaga a cor já escrita. renderOrder tem precedência sobre a ordenação por distância do three.
    forEachMesh(model, (o) => {
      saved.push([o, o.material, o.renderOrder, o.visible]);
      if (o.userData.context || o.userData.decal) { o.visible = false; return; }   // sombra de vizinho / dano: fora da máscara
      if (Array.isArray(o.material)) { o.material = o.material.map((mm) => (isTeam(mm) ? ((any = true), M.mask) : M.occluder)); o.renderOrder = 1; }
      else if (isTeam(o.material)) { any = true; o.material = M.mask; o.renderOrder = 1; } else { o.material = M.occluder; o.renderOrder = -1; }
    });
    if (any) {
      renderer.render(scene, cam);
      const t = downsample(readRGBA(W, H), W, H, SSAA);
      out.team = isEmpty(t) ? null : t;
    }
    for (const [o, mat, ro, vis] of saved) { o.material = mat; o.renderOrder = ro; o.visible = vis; }
  }

  // 3) sombra projetada no chão (modelo fora do layer da câmera, mas ainda no mapa de sombras já calculado)
  if (shadow) {
    cam.layers.set(LAYER_GROUND);
    renderer.render(scene, cam);
    const s = downsample(readRGBA(W, H), W, H, SSAA);
    for (let i = 0; i < s.length; i += 4) { s[i] = 0; s[i + 1] = 0; s[i + 2] = 0; }   // só alfa importa
    if (model.userData.shadowClip) clipShadow(s, box, ppt, model.userData.shadowClip);
    out.shadow = isEmpty(s) ? null : s;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Fontes: rig paramétrico ou .glb

const gltfCache = new Map();
async function loadGlb(src) {
  if (!gltfCache.has(src.path)) gltfCache.set(src.path, await new GLTFLoader().loadAsync('/' + src.path));
  const gltf = gltfCache.get(src.path);
  const group = new THREE.Group();
  const inner = gltf.scene.clone(true);
  const fwd = { '-z': 0, '+z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 }[src.forward ?? '-z'] ?? 0;
  inner.rotation.y = fwd;
  inner.scale.setScalar(src.scale);
  group.add(inner);
  const teamNames = new Set(src.teamMaterials ?? []);
  forEachMesh(inner, (o) => {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mm of mats) if (teamNames.has(mm.name) || /^team_/i.test(mm.name)) mm.userData.team = true;
  });
  const mixer = new THREE.AnimationMixer(inner);
  return { group, mixer, clips: gltf.animations };
}

/** Constrói o modelo de um quadro (ou reaproveita). Devolve `{ model, pose(f) }`. */
async function sourceFor(manifest, poses, state, f) {
  const src = manifest.source;
  if (src.type === 'glb') {
    if (!state.glb) state.glb = await loadGlb(src);
    const { group, mixer, clips } = state.glb;
    return {
      model: group,
      pose(fr) {
        const clipName = src.anims?.[fr.anim] ?? manifest.anims?.[fr.anim]?.clip ?? fr.anim;
        const clip = clips.find((c) => c.name === clipName);
        mixer.stopAllAction();
        if (clip) {
          const act = mixer.clipAction(clip); act.reset(); act.play();
          const t = fr.loop ? (fr.frame / fr.frames) * clip.duration : fr.frames > 1 ? (fr.frame / (fr.frames - 1)) * clip.duration : 0;
          mixer.setTime(Math.min(t, clip.duration - 1e-4));
        }
        group.rotation.y = dirYaw(fr.dir);
      },
    };
  }
  // unidades: rig do registro (humano, cavalo + cavaleiro, cerco), kit pelos parâmetros do manifesto (Etapa 4)
  if (UNIT_RIGS[src.rig]) {
    if (!state.unit) state.unit = UNIT_RIGS[src.rig](THREE, M, src.params ?? {});
    const rig = state.unit;
    return { model: rig.group, pose(fr) { rig.pose(fr, poses); } };
  }
  if (src.rig === 'building') {
    const key = fr_key(f);
    state.buildings ??= new Map();
    if (!state.buildings.has(key)) state.buildings.set(key, buildBuilding(THREE, M, src.params?.style ?? manifest.id, { ...(src.params ?? {}), ...(f.params ?? {}), state: f.anim, variant: f.variant ?? undefined, frame: f.frame, frames: f.frames }));
    return { model: state.buildings.get(key), pose() {} };
  }
  if (src.rig === 'props') return { model: buildProp(THREE, M, f.item.kind, f.item.variant, f.item.tag), pose() {} };
  throw new Error(`fonte desconhecida: ${JSON.stringify(src)}`);
}
const fr_key = (f) => `${f.anim}/${f.variant ?? ''}/${f.frame}`;

/**
 * Ícone do HUD: a mesma câmera do contrato (pitch e sol), enquadrada no modelo — caixa do modelo projetada na tela,
 * quadrado com 6 % de margem, origem posicionada para o modelo ficar no centro. Sem chão (fundo transparente).
 */
function iconCamera(model) {
  model.updateMatrixWorld(true);
  const bb = new THREE.Box3();
  forEachMesh(model, (o) => { if (!o.userData.context) bb.expandByObject(o); });
  const probe = makeCamera(THREE, { wTiles: 2, hTiles: 2, anchor: [0.5, 0.5] });   // origem no centro; NDC × 1 = tiles
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const cx of [bb.min.x, bb.max.x]) for (const cy of [bb.min.y, bb.max.y]) for (const cz of [bb.min.z, bb.max.z]) {
    const p = new THREE.Vector3(cx, cy, cz).project(probe);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const half = (Math.max(x1 - x0, y1 - y0) / 2) * 1.06, side = 2 * half;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const extent = Math.max(2, bb.getSize(new THREE.Vector3()).length());
  return { cam: makeCamera(THREE, { wTiles: side, hTiles: side, anchor: [0.5 - cx / side, 0.5 + cy / side] }), extent };
}

/**
 * Assa um lote de quadros de um manifesto. `job` = { manifest, poses: { main, rider }, scale, frames: [{ name, anim, dir,
 * frame, frames, loop, pose, rider, item, box: {w, h, ax, ay} }] }. Devolve `[{ name, w, h, color, team, shadow }]` (base64 RGBA).
 */
export async function bakeBatch(job) {
  const { manifest, poses, scale } = job;
  const state = job.stateKey && window.__state?.key === job.stateKey ? window.__state : { key: job.stateKey };
  window.__state = state;
  const results = [];
  let extent = -1;
  // edifícios e máquinas de cerco (paredes de madeira/couro voltadas para a câmera, que nunca pegam o sol de noroeste)
  // com o preenchimento dos edifícios; pessoas, cavalos e props com o de sempre
  const hemi = manifest.kind === 'building' || manifest.source?.rig === 'siege' ? HEMI_INTENSITY_BUILDINGS : HEMI_INTENSITY;
  for (const f of job.frames) {
    const ppt = PX_PER_TILE * scale;
    const { model, pose } = await sourceFor(manifest, poses, state, f);
    scene.add(model);
    pose(f);
    let r;
    if (f.icon) {
      const ic = iconCamera(model);
      if (ic.extent !== extent) { setLights(ic.extent, hemi); extent = ic.extent; }
      r = renderPasses(model, f.box, { scale, team: manifest.team, shadow: false, cam: ic.cam });
    } else {
      const ext = Math.max(f.box.w, f.box.h) / ppt;
      if (ext !== extent) { setLights(ext, hemi); extent = ext; }
      r = renderPasses(model, f.box, { scale, team: manifest.team, shadow: manifest.shadow });
    }
    scene.remove(model);
    results.push({ name: f.name, w: f.box.w, h: f.box.h, color: toB64(r.color), team: r.team ? toB64(r.team) : null, shadow: r.shadow ? toB64(r.shadow) : null });
  }
  return results;
}

/** Exporta um modelo de teste (cidadão paramétrico + 1 clipe "Wave") para .glb — prova do caminho `source.type = glb`. */
export async function exportTestGlb() {
  const rig = buildHuman(THREE, M, { hair: true, tunicTeam: 'upper', carry: 'basket' });
  rig.setAnim('carry');
  const root = rig.group;
  // tiles → metros para o .glb (o manifesto de teste usa scale 0,5)
  root.scale.setScalar(1 / M2T);
  // materiais com nome (o de time com prefixo team_) para o exportador
  forEachMesh(root, (o) => { o.material = o.material.clone(); const n = Object.entries(M).find(([, v]) => v.color && v.color.equals(o.material.color))?.[0] ?? 'mat'; o.material.name = isTeam(o.material) ? 'team_cloth' : n; });
  const armR = rig.joints.shoulderR;
  armR.name = 'shoulderR';
  const track = new THREE.QuaternionKeyframeTrack('shoulderR.quaternion', [0, 0.5, 1],
    [0, 0, 0, 1, ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 2.4)).toArray(), 0, 0, 0, 1]);
  const clip = new THREE.AnimationClip('Wave', 1, [track]);
  const buf = await new GLTFExporter().parseAsync(root, { binary: true, animations: [clip] });
  return toB64(new Uint8Array(buf));
}

// ---------------------------------------------------------------------------------------------------------------
// Folha de contato (grade para o dono aprovar): sombra (alfa 0,45) + cor + máscara tingida com a cor do time.

export async function contactSheet({ title, rows, cellW, cellH, zoom = 2, tint = 0x2f4fa8, bg = 0x5f7a33, labelW = 120 }) {
  // cada linha pode ter a sua célula (row.cellW/row.cellH); o padrão é a do asset
  const headH = 28;
  const rw = (row) => row.cellW ?? cellW, rh = (row) => row.cellH ?? cellH;
  const rowY = [];
  let yy = headH;
  for (const row of rows) { rowY.push(yy); yy += rh(row) * zoom + 16; }
  const cv = document.createElement('canvas');
  cv.width = Math.max(...rows.map((r) => labelW + r.cells.length * rw(r) * zoom + 8)); cv.height = yy + 4;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#1b1b1b'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#e8e2d0'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(title, 8, 19);
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;
  const toCanvas = (img, tintIt) => {
    const c = document.createElement('canvas'); c.width = img.w; c.height = img.h;
    const data = fromB64(img.b64);
    if (tintIt) for (let i = 0; i < data.length; i += 4) { data[i] = (data[i] * tr) / 255; data[i + 1] = (data[i + 1] * tg) / 255; data[i + 2] = (data[i + 2] * tb) / 255; }
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.buffer), img.w, img.h), 0, 0);
    return c;
  };
  rows.forEach((row, r) => {
    const y0 = rowY[r], cellW = rw(row), cellH = rh(row);
    ctx.fillStyle = '#cfc8b4'; ctx.font = '12px sans-serif'; ctx.fillText(row.label, 6, y0 + (cellH * zoom) / 2 + 4);
    row.cells.forEach((cell, c) => {
      const x0 = labelW + c * cellW * zoom;
      ctx.fillStyle = hex(bg); ctx.fillRect(x0, y0, cellW * zoom - 2, cellH * zoom);
      if (cell.label) { ctx.fillStyle = '#9a9380'; ctx.font = '10px sans-serif'; ctx.fillText(cell.label, x0 + 2, y0 + cellH * zoom + 11); }
      const draw = (img, alpha, tintIt) => {
        if (!img) return;
        ctx.globalAlpha = alpha;
        ctx.drawImage(toCanvas(img, tintIt), x0 + img.x * zoom, y0 + img.y * zoom, img.w * zoom, img.h * zoom);
        ctx.globalAlpha = 1;
      };
      draw(cell.shadow, 0.45, false);
      draw(cell.color, 1, false);
      draw(cell.team, 1, true);
      // âncora (pé): cruz de 1 px
      if (cell.anchor) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x0 + cell.anchor.x * zoom - 2, y0 + cell.anchor.y * zoom, 5, 1); ctx.fillRect(x0 + cell.anchor.x * zoom, y0 + cell.anchor.y * zoom - 2, 1, 5); }
    });
  });
  return cv.toDataURL('image/png').split(',')[1];
}

window.__bake = { bakeBatch, contactSheet, exportTestGlb, gl: gl.getParameter(gl.RENDERER), three: THREE.REVISION };
window.__ready = true;
