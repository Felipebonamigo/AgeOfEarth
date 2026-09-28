// Página do gerador de ícones do HUD (Etapa 7; docs/ART.md §1.10 e Apêndice H): os ícones de unidades, tecnologias,
// poderes, recursos, Idades e habilidades e os retratos dos deuses saem dos MESMOS modelos e da mesma luz do bake
// (câmera de 50°, sol de noroeste, materiais PBR de materials.js), com um enquadramento próprio de ícone e uma luz de
// contorno que destaca a silhueta do fundo escuro do HUD. Módulo carregado sob demanda pela página do bake
// (scripts/bake/hud.mjs: `await import('/hud.js')`) com o seu próprio renderizador: não mexe em bake.js (que entra no
// hash de todos os atlas) nem no estado dele.
//
// Tipos de ícone (`spec.kind`):
//   unit      o rig de uma unidade (manifesto de art/manifest), posado num quadro de uma animação (`anim`, `frame`, `dir`)
//   object    um objeto da biblioteca de hud-objects.js (`key`, `params`)
//   god       o busto de um deus (hud-gods.js)
//   building  o modelo de um edifício (buildings.js), no estado `state` (padrão `complete`) e na `variant` pedida
// Enquadramento (`spec.frame`): mode 'full' (a caixa do modelo) · 'bust' (só a parte de cima: `frac` da altura a partir do
// topo) · 'band' (só entre as alturas `y0` e `y1` do modelo: o busto dos deuses) · 'focus' (a caixa dos objetos marcados com userData.focus); `margin` (fração do lado); `pan` [x, y] (fração do lado).
// Saída: cor RGBA e, se o modelo tiver partes de time, a máscara (o jogo tinge com a cor do jogador, como nos atlas).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeLights, HEMI_INTENSITY } from './camera.js';
import { createMaterials } from './materials.js';
import { UNIT_RIGS } from './rigs/units.js';
import { buildBuilding } from './buildings.js';
import { buildObject } from './hud-objects.js';
import { buildGod } from './hud-gods.js';

/** Super-amostragem dos ícones (4×4: bordas e detalhes finos limpos a 64 px). */
const SS = 4;

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const gl = renderer.getContext();

const M = createMaterials(THREE);
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
// nos ícones o reflexo é mais fraco que no bake (0,35): de perto, com a luz de contorno, o bronze a 0,55 lava para um amarelo pálido
for (const k of ['bronze', 'bronzeDark', 'iron', 'gold', 'bronzeBlack', 'mirror', 'fleece']) { M[k].envMap = envTex; M[k].envMapIntensity = 0.35; }
const scene = new THREE.Scene();
let lights = null;
/** Luz de contorno (de trás e do alto, fria e fraca): separa a silhueta do fundo azul-escuro do HUD. */
const rim = new THREE.DirectionalLight(0xdfe8ff, 0.9);
rim.position.set(0.45, 0.75, -1.0);
scene.add(rim, rim.target);
function setLights(extent, hemi) {
  if (lights) { scene.remove(lights.sun, lights.sun.target, lights.hemi); lights.sun.shadow.map?.dispose(); lights.sun.dispose(); }
  lights = makeLights(THREE, extent, hemi);
  scene.add(lights.sun, lights.sun.target, lights.hemi);
}

// ---------------------------------------------------------------------------------------------------------------
// pixels

function readRGBA(w, h) {
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  return out;
}
/** Média S×S ponderada pelo alfa (como no bake). */
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
const isEmpty = (u8) => { for (let i = 3; i < u8.length; i += 4) if (u8[i]) return false; return true; };
function forEachMesh(root, fn) { root.traverse((o) => { if (o.isMesh && o.visible && isVisible(o)) fn(o); }); }
function isVisible(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
const isTeam = (mat) => !!mat?.userData?.team;

// ---------------------------------------------------------------------------------------------------------------
// enquadramento

const _v = new THREE.Vector3();
/**
 * Câmera ortográfica de ícone: olha do sul, `pitch` graus acima do horizonte (sem o estiramento do chão da câmera do
 * contrato — o ícone mostra o objeto com as proporções verdadeiras, e o busto de frente, não de cima). O quadro é o dos
 * vértices do modelo vistos por ela: mode 'full' = todos; 'bust' = os `frac` de cima da altura; 'band' = entre as
 * alturas y0 e y1; 'focus' = só as malhas com userData.focus (e filhas). Malhas com userData.noFrame (armas finas,
 * raios de luz) não contam. Quadrado com `margin` de folga; no busto a borda de baixo é o corte. `pan` desloca o quadro.
 */
function iconCamera(model, frame = {}, pitchDeg = 30) {
  const { mode = 'full', frac = 0.5, margin = 0.06, pan = [0, 0], zoom = 1 } = frame;
  model.updateMatrixWorld(true);
  const p = (pitchDeg * Math.PI) / 180, D = 100;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  cam.position.set(0, D * Math.sin(p), D * Math.cos(p));
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  const view = cam.matrixWorldInverse;
  const pts = [];
  let yMin = Infinity, yMax = -Infinity;
  const focusSet = new Set();
  if (mode === 'focus') model.traverse((o) => { if (o.userData.focus) o.traverse((c) => focusSet.add(c)); });
  const skip = new Set();
  model.traverse((o) => { if (o.userData.noFrame) o.traverse((c) => skip.add(c)); });
  forEachMesh(model, (o) => {
    if (skip.has(o)) return;
    if (mode === 'focus' && !focusSet.has(o)) return;
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 1500));
    for (let i = 0; i < pos.count; i += step) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      pts.push(_v.x, _v.y, _v.z);
      yMin = Math.min(yMin, _v.y); yMax = Math.max(yMax, _v.y);
    }
  });
  if (!pts.length) throw new Error('ícone sem malhas visíveis');
  const yCut = mode === 'bust' ? yMax - frac * (yMax - yMin) : mode === 'band' ? frame.y0 : -Infinity;
  const yTop = mode === 'band' ? frame.y1 : Infinity;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    if (pts[i + 1] < yCut || pts[i + 1] > yTop) continue;
    _v.set(pts[i], pts[i + 1], pts[i + 2]).applyMatrix4(view);
    x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y);
    zMin = Math.min(zMin, _v.z); zMax = Math.max(zMax, _v.z);
  }
  const w = x1 - x0, h = y1 - y0;
  const side = (Math.max(w, h) * (1 + 2 * margin)) / zoom;
  let cx = (x0 + x1) / 2 + pan[0] * side, cy = (y0 + y1) / 2 + pan[1] * side;
  if ((mode === 'bust' || mode === 'band') && h < side) cy = y1 + margin * side - side / 2;   // encosta o topo (com folga) e corta embaixo
  cam.left = cx - side / 2; cam.right = cx + side / 2; cam.top = cy + side / 2; cam.bottom = cy - side / 2;
  cam.near = 0.1; cam.far = D * 4;
  cam.updateProjectionMatrix();
  const extent = Math.max(2, Math.sqrt((yMax - yMin) ** 2 + side * side));
  return { cam, extent };
}

// ---------------------------------------------------------------------------------------------------------------
// passes

function renderPasses(model, size, cam, team) {
  const W = size * SS, H = size * SS;
  if (renderer.domElement.width !== W || renderer.domElement.height !== H) renderer.setSize(W, H, false);
  model.updateMatrixWorld(true);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = !o.userData.noShadow; o.receiveShadow = true; } });
  const out = { color: null, team: null };
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, cam);
  out.color = downsample(readRGBA(W, H), W, H, SS);
  if (team) {
    const saved = [];
    let any = false;
    model.traverse((o) => {
      if (!o.isMesh) return;
      saved.push([o, o.material, o.renderOrder]);
      if (Array.isArray(o.material)) { o.material = o.material.map((mm) => (isTeam(mm) ? ((any = true), M.mask) : M.occluder)); o.renderOrder = 1; }
      else if (isTeam(o.material)) { any = true; o.material = M.mask; o.renderOrder = 1; } else { o.material = M.occluder; o.renderOrder = -1; }
    });
    if (any) {
      renderer.render(scene, cam);
      const t = downsample(readRGBA(W, H), W, H, SS);
      out.team = isEmpty(t) ? null : t;
    }
    for (const [o, mat, ro] of saved) { o.material = mat; o.renderOrder = ro; }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// modelos

const unitCache = new Map();
function modelFor(spec) {
  if (spec.kind === 'unit') {
    const m = spec.manifest;
    const key = `${m.id}`;
    let rig = unitCache.get(key);
    if (!rig) { rig = UNIT_RIGS[m.source.rig](THREE, M, m.source.params ?? {}); unitCache.set(key, rig); }
    const a = m.anims[spec.anim ?? 'idle'];
    rig.pose({ anim: spec.anim ?? 'idle', dir: spec.dir ?? 3, frame: spec.frameIndex ?? 0, frames: a.frames, loop: true, pose: a.pose, rider: a.rider, params: a.params }, spec.poses);
    // armas e itens finos (lança, arco, clava…) não entram no quadro: o ícone enquadra o corpo
    for (const t of rig.thin ?? []) t.userData.noFrame = true;
    if (spec.yaw) rig.group.rotation.y += spec.yaw;
    return { model: rig.group, dispose: false };
  }
  if (spec.kind === 'object') return { model: buildObject(THREE, M, spec.key, spec.params ?? {}, { pitch: spec.pitch ?? 32 }), dispose: true };
  if (spec.kind === 'god') return { model: buildGod(THREE, M, spec.key, spec.params ?? {}), dispose: true };
  if (spec.kind === 'building') {
    const g = buildBuilding(THREE, M, spec.style ?? spec.key, { ...(spec.params ?? {}), state: spec.state ?? 'complete', variant: spec.variant ?? undefined, frame: 0, frames: 1 });
    return { model: g, dispose: true };
  }
  throw new Error(`tipo de ícone desconhecido: ${spec.kind}`);
}

function dispose(root) {
  root.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
}

/**
 * Renderiza uma lista de ícones. `job` = { scale, items: [{ name, size, spec }] } (size = lado em px a 1×). Devolve
 * `[{ name, w, h, color, team }]` (base64 RGBA; team null se o modelo não tiver partes de time).
 */
export function renderIcons(job) {
  const out = [];
  for (const it of job.items) {
    const size = it.size * job.scale;
    const { model, dispose: disp } = modelFor(it.spec);
    scene.add(model);
    const { cam, extent } = iconCamera(model, it.spec.frame, it.spec.pitch ?? (it.spec.kind === 'god' ? 6 : it.spec.kind === 'unit' ? 26 : 32));
    setLights(extent, it.spec.hemi ?? HEMI_INTENSITY * 1.35);
    rim.intensity = it.spec.rim ?? 0.9;
    const r = renderPasses(model, size, cam, it.spec.team !== false);
    scene.remove(model);
    if (disp) dispose(model);
    out.push({ name: it.name, w: size, h: size, color: toB64(r.color), team: r.team ? toB64(r.team) : null });
  }
  return out;
}

window.__hud = { renderIcons, three: THREE.REVISION };
