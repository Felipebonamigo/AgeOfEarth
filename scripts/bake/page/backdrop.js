// Página do fundo do menu e da tela de carregamento (Etapa 8; docs/ART.md Apêndice H): uma cena em perspectiva, em
// contraluz ao pôr do sol, montada com os MESMOS modelos do jogo — o templo de buildings.js no alto de um promontório, uma
// falange de hoplitas (rig humano com o kit do manifesto) no cume em primeiro plano, oliveiras e ciprestes de props.js — sobre
// um relevo procedural, com mar, céu em gradiente com nuvens baixas, névoa de distância e pós-processamento em 2D (brilho,
// vinheta, grão). O contraluz deixa as figuras em silhueta com borda iluminada: a cena lê como pintura de capa sem pedir o
// detalhe de perto que os modelos (feitos para 32–64 px) não têm. Módulo carregado sob demanda pela página do bake
// (scripts/bake/backdrop.mjs: `await import('/backdrop.js')`) com o seu próprio renderizador; não toca em bake.js.

import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { UNIT_RIGS } from './rigs/units.js';
import { buildBuilding } from './buildings.js';
import { buildProp, rng } from './props.js';

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const gl = renderer.getContext();

// ---------------------------------------------------------------------------------------------------------------
// céu

const SKY_VERT = `varying vec3 vDir; void main() { vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz); vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0); gl_Position = p.xyww; }`;
const SKY_FRAG = `
uniform vec3 sunDir; uniform vec3 zenith; uniform vec3 mid; uniform vec3 horizon; uniform vec3 glow; uniform float clouds; uniform float seed;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.16, h));
  col = mix(col, zenith, smoothstep(0.1, 0.42, h));
  float s = max(dot(d, sunDir), 0.0);
  col += glow * (pow(s, 6.0) * 0.55 + pow(s, 60.0) * 0.9);
  // nuvens baixas em faixas (estratos), mais densas perto do horizonte e acesas do lado do sol
  if (h > -0.02 && clouds > 0.0) {
    float hh = max(h, 0.0) + 0.06;
    vec2 q = vec2(d.x / hh * 0.9, 1.0 / hh * 0.45);
    float c = fbm(q * vec2(0.9, 3.2) + vec2(seed * 0.1, 0.0));
    float band = smoothstep(0.46, 0.74, c) * smoothstep(0.3, 0.03, h) * clouds;
    vec3 lit = mix(vec3(0.30, 0.20, 0.27), vec3(1.35, 0.74, 0.40), pow(s, 2.5));
    col = mix(col, lit, band * 0.9);
  }
  // disco do sol
  col += vec3(1.6, 1.25, 0.9) * smoothstep(0.99975, 0.99988, s) * 3.0;
  if (h < 0.0) col = mix(col, horizon * 0.9, smoothstep(0.0, -0.05, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function makeSky(sunDir, look) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, toneMapped: true, fog: false,
    uniforms: {
      sunDir: { value: sunDir.clone() }, zenith: { value: new THREE.Color(look.zenith) }, mid: { value: new THREE.Color(look.mid) },
      horizon: { value: new THREE.Color(look.horizon) }, glow: { value: new THREE.Color(look.glow) }, clouds: { value: look.clouds ?? 1 }, seed: { value: look.seed ?? 3.7 },
    },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  sky.scale.setScalar(5000); sky.renderOrder = -1; sky.frustumCulled = false;
  return sky;
}

// ---------------------------------------------------------------------------------------------------------------
// relevo

/** Ruído de valor 2D determinístico (fbm) para o relevo. */
function valueNoise(seed) {
  const r = rng(seed); const P = new Float32Array(512); for (let i = 0; i < 512; i++) P[i] = r();
  const h = (x, y) => P[((x * 73856093) ^ (y * 19349663)) & 511];
  const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v; };
  return (x, y, oct = 5) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); f *= 2.02; a *= 0.5; } return s; };
}
const bump = (x, z, cx, cz, rx, rz, h, sharp = 2) => { const d = Math.sqrt(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2); return d >= 1 ? 0 : h * (1 - d ** sharp) ** 1.6; };
/** Mesa: topo plano até `top` do raio e penhasco até a borda. */
const mesa = (x, z, cx, cz, rx, rz, h, top = 0.7, wob = 1) => { const d = Math.sqrt(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2) * wob; if (d >= 1) return null; const t = d <= top ? 1 : 1 - (d - top) / (1 - top); return h * (t * t * (3 - 2 * t)) ** 0.55; };

/** Relevo em tiles: chão perto da câmera, cume do primeiro plano, promontório do templo caindo em penhasco no mar. */
function heightAt(x, z, noise, layout) {
  let y = -2.4;
  // terra firme perto da câmera, descendo para o mar ao norte
  y = Math.max(y, 0.2 - Math.max(0, -z - 4) * 0.16);
  let rocky = 0;
  for (const b of layout.bumps) {
    // a borda da mesa ondula com o ângulo (penhasco recortado, não uma elipse perfeita)
    const wob = b.mesa ? 1 + (noise(Math.atan2(z - b.z, x - b.x) * 2.2 + 7, 3.1) - 0.5) * 0.5 : 1;
    const m = b.mesa ? mesa(x, z, b.x, b.z, b.rx, b.rz, b.h, b.mesa, wob) : bump(x, z, b.x, b.z, b.rx, b.rz, b.h, b.sharp);
    if (m === null || (!b.mesa && m <= 0)) continue;   // fora do morro: o `base` não vale
    const v = m + (b.base ?? 0);
    if (v > y) { y = v; rocky = b.mesa ? 1 : 0; }
  }
  y += (noise(x * 0.12, z * 0.12) - 0.5) * 0.9 + (noise(x * 0.6 + 40, z * 0.6) - 0.5) * (0.22 + rocky * 0.5);
  return y;
}

function makeTerrain(layout, noise) {
  const W = 180, D = 150, SX = 360, SZ = 300;
  const geo = new THREE.PlaneGeometry(W, D, SX, SZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -D / 2 + 12);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x46552a), dry = new THREE.Color(0x6f6538), rock = new THREE.Color(0x635a50), sand = new THREE.Color(0x9c8660);
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i), noise, layout));
  geo.computeVertexNormals();
  const nor = geo.attributes.normal, c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), slope = 1 - nor.getY(i), n = noise(pos.getX(i) * 0.3 + 11, pos.getZ(i) * 0.3);
    c.copy(grass).lerp(dry, THREE.MathUtils.clamp(n * 1.1 - 0.4, 0, 1));
    c.lerp(rock, THREE.MathUtils.smoothstep(slope, 0.14, 0.36));
    if (y < -1.0) c.lerp(sand, THREE.MathUtils.smoothstep(-y, 1.0, 1.4));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // difuso (Lambert): o PBR daria ao chão um brilho de Fresnel do céu no ângulo rasante, que lê como laje molhada
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
}

/** Coluna dórica quebrada (tambores caneluras, um caído ao lado) sobre um estilóbato: a ruína do primeiro plano. */
function makeRuin(M, r, drums = 3) {
  const g = new THREE.Group();
  const flute = (rad, h) => {
    const geo = new THREE.CylinderGeometry(rad * 0.97, rad, h, 40, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 - 0.035 * Math.abs(Math.sin(a * 10)); p.setX(i, x * k); p.setZ(i, z * k); }
    geo.computeVertexNormals();
    return geo;
  };
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.24, 1.25), M.stoneDark); base.position.y = 0.12; g.add(base);
  let y = 0.28;
  for (let i = 0; i < drums; i++) {
    const h = 0.72 + r() * 0.12, rad = 0.46 - i * 0.02;
    const d = new THREE.Mesh(flute(rad, h), i % 2 ? M.marbleDark : M.marble);
    d.position.set((r() - 0.5) * 0.04, y + h / 2, (r() - 0.5) * 0.04); d.rotation.y = r() * 3; d.rotation.z = (r() - 0.5) * 0.03;
    g.add(d); y += h;
  }
  // topo quebrado: tampa inclinada e irregular
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.22, 10), M.marbleDark); cap.position.y = y + 0.05; cap.rotation.z = 0.35; cap.rotation.x = -0.2; g.add(cap);
  const fallen = new THREE.Mesh(flute(0.45, 0.8), M.marble); fallen.rotation.z = Math.PI / 2; fallen.rotation.y = 0.5; fallen.position.set(-1.35, 0.42, 0.6); g.add(fallen);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// pós-processamento (2D)

function readRGBA(w, h) {
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  return out;
}
function downsample(src, W, H, S) {
  const w = W / S, h = H / S, out = new Uint8ClampedArray(w * h * 4), n = S * S;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const p = ((y * S + j) * W + x * S + i) * 4; r += src[p]; g += src[p + 1]; b += src[p + 2]; }
    const d = (y * w + x) * 4; out[d] = r / n; out[d + 1] = g / n; out[d + 2] = b / n; out[d + 3] = 255;
  }
  return out;
}
/** Brilho (bloom barato: realces borrados somados em "screen"), vinheta e grão; devolve o canvas final. */
function post(rgba, w, h, look) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.putImageData(new ImageData(rgba, w, h), 0, 0);
  // realces: limiar de luminância numa cópia a 1/4, borrada
  const q = 4, bw = w / q, bh = h / q;
  const small = document.createElement('canvas'); small.width = bw; small.height = bh;
  const sg = small.getContext('2d'); sg.drawImage(cv, 0, 0, bw, bh);
  const im = sg.getImageData(0, 0, bw, bh), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; const k = Math.max(0, (l - look.bloomThreshold) / (1 - look.bloomThreshold)); d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
  sg.putImageData(im, 0, 0);
  const blur = document.createElement('canvas'); blur.width = bw; blur.height = bh;
  const bg = blur.getContext('2d'); bg.filter = `blur(${Math.round(bw / 90)}px)`; bg.drawImage(small, 0, 0); bg.filter = `blur(${Math.round(bw / 30)}px)`; bg.globalAlpha = 0.8; bg.drawImage(small, 0, 0);
  g.globalCompositeOperation = 'screen'; g.globalAlpha = look.bloom; g.drawImage(blur, 0, 0, w, h);
  // vinheta
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 1;
  const vg = g.createRadialGradient(w * 0.5, h * 0.45, h * 0.35, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.6);
  vg.addColorStop(0, 'rgb(255,255,255)'); vg.addColorStop(1, `rgb(${look.vignette},${look.vignette},${Math.round(look.vignette * 1.1)})`);
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  // grão fino determinístico
  g.globalCompositeOperation = 'source-over';
  const fin = g.getImageData(0, 0, w, h), f = fin.data, r = rng(1234);
  for (let i = 0; i < f.length; i += 4) { const n = (r() - 0.5) * look.grain; f[i] += n; f[i + 1] += n; f[i + 2] += n; }
  g.putImageData(fin, 0, 0);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------
// cena

/** Tomadas disponíveis. `menu`: falange no cume à esquerda, templo no promontório à direita, sol baixo entre os dois. */
const SHOTS = {
  menu: {
    cam: { pos: [0, 1.2, 8], target: [0, 2.3, -40], fov: 32 },
    sun: { az: 0.12, el: 0.06, color: 0xffb46e, intensity: 3.4 },
    look: { zenith: 0x22335e, mid: 0x8a5e6e, horizon: 0xf7a55c, glow: 0xffc27a, clouds: 1, seed: 3.7, fog: 0xdc9e72, fogDensity: 0.0095, hemiSky: 0x6f7fb8, hemiGround: 0x2e2218, hemi: 0.32, env: 0.22, exposure: 1.0, bloom: 0.45, bloomThreshold: 0.7, vignette: 120, grain: 7 },
    layout: {
      bumps: [
        { x: -8.5, z: -10, rx: 9.5, rz: 4.5, h: 2.25, sharp: 1.8 },          // cume da falange
        { x: 12.5, z: -38, rx: 8.5, rz: 8, h: 6.2, mesa: 0.42, base: -1.6 },  // promontório do templo (penhasco no mar)
        { x: 27, z: -31, rx: 13, rz: 11, h: 3.6, sharp: 1.7, base: -1.5 },     // morro costeiro à direita (o promontório sai dele)
        { x: -34, z: -70, rx: 16, rz: 7, h: 4.6, sharp: 2.2, base: -2 },      // ilha à esquerda
        { x: 40, z: -80, rx: 14, rz: 6, h: 3.8, sharp: 2.4, base: -2 },       // cabo à direita
      ],
    },
    phalanx: { x0: -9.2, x1: -4.3, z: -9.6, rows: 2, rowGap: 0.75, per: 8, jitter: 0.12 },
    temple: { x: 12.3, z: -38.6, yaw: -0.42, scale: 1.7 },
    ruin: { x: 3.0, z: 2.2, drums: 2, yaw: 2.2, scale: 0.9 },
    trees: [
      ['cypress', 0, 'big', 8.6, -36.2, 1.45], ['cypress', 1, 'big', 9.6, -35.4, 1.25], ['cypress', 2, 'big', 16.4, -36.8, 1.5], ['cypress', 3, 'big', 17.2, -38.6, 1.3],
      ['olive', 0, 'small', 7.6, -39.6, 1.0], ['olive', 2, 'small', 15.2, -41.5, 0.95],
      ['cypress', 3, 'big', -10.6, -9.2, 1.3], ['olive', 1, 'small', -3.1, -11.2, 0.9], ['olive', 3, 'small', -11.6, -11.8, 0.85],
      ['olive', 2, 'small', -1.4, -18, 0.8], ['olive', 0, 'small', 3.4, -14, 0.8],
    ],
  },
};

/**
 * Variantes da tomada `menu` para outras proporções (peças da loja Steam, docs/STEAM.md §5): a mesma cena com outra câmera
 * (o campo horizontal fica perto dos ~54° do 16:9) e, na vertical, um cume a mais com um grupo de hoplitas em primeiro plano.
 */
const VARIANTS = {
  hero: { cam: { pos: [0, 1.2, 8], target: [0.5, 2.1, -40], fov: 20 } },
  header: { cam: { pos: [0, 1.2, 8], target: [0.8, 2.3, -40], fov: 26 } },
  small: { cam: { pos: [0, 1.2, 8], target: [1.2, 2.4, -40], fov: 22 } },
  vertical: {
    cam: { pos: [6.2, 1.25, 6], target: [8.6, 8.2, -40], fov: 42 },
    extraBumps: [{ x: 6.6, z: -5.5, rx: 5.5, rz: 2.6, h: 1.25, sharp: 1.8 }],
    phalanx2: { x0: 4.4, x1: 8.4, z: -5.4, rows: 2, rowGap: 0.7, per: 5, jitter: 0.1 },
    ruin: null,
  },
};
const shotOf = (name) => {
  const base = SHOTS.menu, v = VARIANTS[name];
  if (SHOTS[name]) return SHOTS[name];
  if (!v) throw new Error(`tomada desconhecida: ${name}`);
  return { ...base, ...v, layout: { bumps: [...base.layout.bumps, ...(v.extraBumps ?? [])] }, ruin: v.ruin === undefined ? base.ruin : v.ruin };
};

/** Kit do hoplita e poses (vêm do Node: art/manifest/hoplite.json e art/poses/human.json). */
let MODELS = null;

/** Renderiza a tomada `shot` em w×h (super-amostragem ss) e devolve o JPEG em base64 (sem o prefixo data:). */
export function renderBackdrop(job) {
  MODELS = { hoplite: job.hoplite, poses: job.poses };
  const cv = renderScene(job.shot ?? 'menu', job.w, job.h, job.ss ?? 2);
  return { w: job.w, h: job.h, jpeg: cv.toDataURL('image/jpeg', job.quality ?? 0.86).split(',')[1] };
}

/** A cena de uma tomada (ou variante) já pós-processada, num canvas w×h. */
function renderScene(shot, w, h, ss = 2) {
  const S = shotOf(shot);
  const W = w * ss, H = h * ss;
  const look = S.look;
  renderer.setSize(W, H, false);
  renderer.toneMappingExposure = look.exposure;
  const scene = new THREE.Scene();
  const M = createMaterials(THREE);
  const el = S.sun.el, az = S.sun.az;
  const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  const sky = makeSky(sunDir, look);
  scene.add(sky);
  // ambiente: o próprio céu (reflexo do mar e dos metais)
  const skyScene = new THREE.Scene(); skyScene.add(makeSky(sunDir, look));
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(skyScene, 0).texture;
  scene.environment = env; scene.environmentIntensity = look.env;
  for (const k of ['bronze', 'bronzeDark', 'iron', 'gold', 'bronzeBlack', 'mirror']) if (M[k]) { M[k].envMap = env; M[k].envMapIntensity = 0.8; }
  scene.fog = new THREE.FogExp2(look.fog, look.fogDensity);
  // luz
  const sun = new THREE.DirectionalLight(S.sun.color, S.sun.intensity);
  sun.position.copy(sunDir).multiplyScalar(120).add(new THREE.Vector3(0, 0, -18));
  sun.target.position.set(0, 0, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target, new THREE.HemisphereLight(look.hemiSky, look.hemiGround, look.hemi));
  // relevo e mar
  const noise = valueNoise(97);
  scene.add(makeTerrain(S.layout, noise));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x163449, roughness: 0.2, metalness: 0.8, envMapIntensity: 1.25 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -1.25; sea.receiveShadow = false;   // sol rasante: sombra no mar só daria acne
  scene.add(sea);
  // templo no promontório
  const T = S.temple;
  const temple = buildBuilding(THREE, M, 'temple', { state: 'complete', frame: 0, frames: 1 });
  temple.position.set(T.x, heightAt(T.x, T.z, noise, S.layout) - 0.05, T.z); temple.rotation.y = T.yaw; temple.scale.setScalar(T.scale);
  temple.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(temple);
  // árvores
  for (const [kind, v, tag, x, z, sc] of S.trees) {
    const t = buildProp(THREE, M, kind, v, tag);
    t.position.set(x, heightAt(x, z, noise, S.layout) - 0.05, z); t.scale.setScalar(sc); t.rotation.y = (x * 7.1 + z * 3.3) % 6.28;
    t.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(t);
  }
  // ruína do primeiro plano
  if (S.ruin) { const ru = makeRuin(M, rng(5), S.ruin.drums); ru.position.set(S.ruin.x, heightAt(S.ruin.x, S.ruin.z, noise, S.layout) - 0.1, S.ruin.z); ru.rotation.y = S.ruin.yaw ?? 0; ru.scale.setScalar(S.ruin.scale ?? 1); scene.add(ru); }
  // falange no cume, de costas para a câmera, olhando o mar
  const r = rng(71);
  const man = MODELS.hoplite;
  for (const P of [S.phalanx, S.phalanx2].filter(Boolean)) for (let row = 0; row < P.rows; row++) for (let i = 0; i < P.per; i++) {
    const rig = UNIT_RIGS.human(THREE, M, man.params);
    const a = man.anims.idle;
    rig.pose({ anim: 'idle', dir: 6, frame: Math.floor(r() * a.frames), frames: a.frames, loop: true, pose: a.pose, params: a.params }, MODELS.poses);
    const x = P.x0 + (P.x1 - P.x0) * (i + (row % 2) * 0.5) / (P.per - 0.5) + (r() - 0.5) * P.jitter, z = P.z - row * P.rowGap + (r() - 0.5) * P.jitter;
    rig.group.position.set(x, heightAt(x, z, noise, S.layout) - 0.03, z);
    rig.group.rotation.y += (r() - 0.5) * 0.25 + 0.12;
    rig.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(rig.group);
  }
  // câmera
  const cam = new THREE.PerspectiveCamera(S.cam.fov, w / h, 0.1, 8000);
  cam.position.set(...S.cam.pos); cam.lookAt(new THREE.Vector3(...S.cam.target));
  sun.shadow.needsUpdate = true;
  renderer.render(scene, cam);
  const rgba = downsample(readRGBA(W, H), W, H, ss);
  const cv = post(rgba, w, h, look);
  pm.dispose(); env.dispose();
  scene.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------
// logo e peças da loja (docs/STEAM.md §5)

/** Ramo de louro em canvas (a mesma geometria de laurelSvg em src/ui/glyphs.ts), em (x, y) com altura `size`. */
function drawLaurel(g, x, y, size, flip, fill) {
  const k = size / 100, D = Math.PI / 180, cx = 80, cy = 52, r = 38, N = 9;
  g.save(); g.translate(x, y); if (flip) g.scale(-1, 1); g.translate(-50 * k, -50 * k); g.scale(k, k);
  g.fillStyle = fill; g.strokeStyle = fill; g.lineWidth = 2.4; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cy, r, -258 * D, -104 * D, false); g.stroke();
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1), th = 250 - u * 138, px = cx + r * Math.cos(th * D), py = cy - r * Math.sin(th * D);
    const tang = Math.atan2(Math.cos(th * D), Math.sin(th * D)) + Math.PI / 2, nx = Math.cos(th * D), ny = -Math.sin(th * D), sc = 1.15 - u * 0.5;
    for (const side of [1, -1]) {
      g.beginPath(); g.ellipse(px + side * nx * 5.5 * sc, py + side * ny * 5.5 * sc, 3.3 * sc, 8.2 * sc, tang + side * 32 * D, 0, Math.PI * 2); g.fill();
    }
  }
  for (const th of [214, 160]) { g.beginPath(); g.arc(cx + r * Math.cos(th * D) - Math.cos(th * D) * 2, cy - r * Math.sin(th * D) + Math.sin(th * D) * 2, 2.2, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

/** Logo "AGE OF EARTH" em Cinzel dourada com contorno escuro e sombra, entre dois ramos de louro; largura total `width`. */
function drawLogo(g, cx, cy, width, { laurels = true, glow = 0.75 } = {}) {
  const text = 'AGE OF EARTH';
  g.save();
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  let size = 100;
  g.font = `700 ${size}px Cinzel`; g.letterSpacing = `${size * 0.07}px`;
  const w0 = g.measureText(text).width;
  size = (size * width * (laurels ? 0.72 : 0.98)) / w0;
  g.font = `700 ${size}px Cinzel`; g.letterSpacing = `${size * 0.07}px`;
  const tw = g.measureText(text).width, base = cy + size * 0.34;
  const grad = g.createLinearGradient(0, base - size * 0.72, 0, base + size * 0.05);
  grad.addColorStop(0, '#fff3c8'); grad.addColorStop(0.42, '#f4c95a'); grad.addColorStop(0.58, '#c8922e'); grad.addColorStop(1, '#8c5e1a');
  g.shadowColor = `rgba(0,0,0,${glow})`; g.shadowBlur = size * 0.22; g.shadowOffsetY = size * 0.05;
  g.lineJoin = 'round'; g.lineWidth = size * 0.07; g.strokeStyle = '#231505'; g.strokeText(text, cx, base);
  g.shadowColor = 'transparent';
  g.fillStyle = grad; g.fillText(text, cx, base);
  // brilho fino no alto das letras (bronze polido)
  g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.35;
  const hl = g.createLinearGradient(0, base - size * 0.72, 0, base - size * 0.45); hl.addColorStop(0, '#ffffff'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl; g.fillText(text, cx, base);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  if (laurels) {
    const ls = size * 1.55, lg = g.createLinearGradient(0, cy - ls / 2, 0, cy + ls / 2);
    lg.addColorStop(0, '#f4d27a'); lg.addColorStop(1, '#a8741f');
    g.shadowColor = `rgba(0,0,0,${glow})`; g.shadowBlur = size * 0.16;
    drawLaurel(g, cx - tw / 2 - ls * 0.42, cy, ls, false, lg);
    drawLaurel(g, cx + tw / 2 + ls * 0.42, cy, ls, true, lg);
  }
  g.restore();
}

async function ensureFont() {
  if ([...document.fonts].some((f) => f.family === 'Cinzel' && f.status === 'loaded')) return;
  const f = new FontFace('Cinzel', 'url(/node_modules/@fontsource/cinzel/files/cinzel-latin-700-normal.woff2)', { weight: '700' });
  await f.load(); document.fonts.add(f);
}

/**
 * Peças da página da loja: cada item { name, w, h, shot|null, logo: { y, width } | null, shade, format } vira JPEG (ou PNG
 * transparente, para o logo da biblioteca). `shade` escurece o fundo sob o logo (legibilidade nas cápsulas pequenas).
 */
export async function renderSteam(job) {
  MODELS = { hoplite: job.hoplite, poses: job.poses };
  await ensureFont();
  const out = [];
  for (const it of job.items) {
    const cv = document.createElement('canvas'); cv.width = it.w; cv.height = it.h;
    const g = cv.getContext('2d');
    if (it.shot) g.drawImage(renderScene(it.shot, it.w, it.h, it.ss ?? 2), 0, 0);
    if (it.dim) { g.fillStyle = `rgba(8,10,18,${it.dim})`; g.fillRect(0, 0, it.w, it.h); }
    if (it.logo) {
      const ly = it.logo.y * it.h;
      if (it.shade) {
        const sg = g.createRadialGradient(it.w / 2, ly, 0, it.w / 2, ly, it.w * 0.6);
        sg.addColorStop(0, `rgba(10,8,14,${it.shade})`); sg.addColorStop(1, 'rgba(10,8,14,0)');
        g.fillStyle = sg; g.fillRect(0, 0, it.w, it.h);
      }
      drawLogo(g, it.w / 2, ly, it.logo.width * it.w, { laurels: it.logo.laurels !== false, glow: it.logo.glow ?? 0.75 });
    }
    const png = it.format === 'png';
    out.push({ name: it.name, w: it.w, h: it.h, mime: png ? 'image/png' : 'image/jpeg', b64: cv.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9).split(',')[1] });
  }
  return out;
}

window.__backdrop = { renderBackdrop, renderSteam, shots: Object.keys(SHOTS), three: THREE.REVISION };

// peças reaproveitadas pelas ilustrações da campanha (page/illustrations.js): o mesmo renderizador, céu, ruído, ruína e pós
export { renderer, makeSky, valueNoise, bump, mesa, makeRuin, readRGBA, downsample, post };
