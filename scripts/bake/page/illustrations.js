// Ilustrações da campanha (ROADMAP 2.7, docs/ART.md Apêndice H): uma cena por missão, em perspectiva, montada com os MESMOS
// modelos do jogo — rigs de unidade com o kit do manifesto (hoplitas, heróis, cerco, criaturas, titãs), edifícios de
// buildings*.js em qualquer estado (obra, dano), árvores de props.js e os deuses dos retratos do HUD — sobre o relevo, o céu e
// o pós-processamento do fundo do menu (page/backdrop.js). Como lá, a luz é de capa: contraluz, fogo, névoa e silhuetas, que
// leem como pintura sem pedir de perto o detalhe que os modelos (feitos para 32–64 px) não têm.
// A cena vem em dados (scripts/bake/illustrations/scenes.mjs, uma por missão): câmera, sol, aparência, relevo, mar, edifícios,
// unidades soltas e em fileiras (com cor de time por figura), árvores, ruínas, fogo com fumaça, brilhos, correntes, pilares.
// Carregado sob demanda pela página do bake (scripts/bake/illustrations.mjs: `await import('/illustrations.js')`).

import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { UNIT_RIGS } from './rigs/units.js';
import { buildBuilding } from './buildings.js';
import { buildProp, rng } from './props.js';
import { buildGod } from './hud-gods.js';
import { renderer, makeSky, valueNoise, bump, mesa, makeRuin, readRGBA, downsample, post } from './backdrop.js';

// ---------------------------------------------------------------------------------------------------------------
// relevo

const PALETTES = {
  // grama mediterrânea, capim seco, rocha, areia (o fundo do menu)
  greek: { grass: 0x46552a, dry: 0x6f6538, rock: 0x635a50, sand: 0x9c8660, snow: 0xe8ecf2 },
  // montanha fria: capim ralo, rocha azulada, neve
  alpine: { grass: 0x4a5236, dry: 0x6b6a58, rock: 0x5a5b60, sand: 0x8a8274, snow: 0xe6ebf2 },
  // cinza de vulcão / submundo
  ash: { grass: 0x2c2826, dry: 0x3a3230, rock: 0x2a2424, sand: 0x4a3c34, snow: 0x5a4a44 },
  // planície seca da Tessália
  plain: { grass: 0x5a5a2e, dry: 0x86763e, rock: 0x6a6052, sand: 0xa08a60, snow: 0xe8ecf2 },
};

/** Ruído de cristas (1 − |2n − 1|, somado em oitavas): picos com arestas. */
function ridge(noise, x, z) {
  let s = 0, a = 0.55, f = 1, sum = 0;
  // noise(…, 1) cobre [0, 0.5]: ×2 para [0, 1]; a crista fica onde o ruído passa pelo meio
  for (let i = 0; i < 4; i++) { const n = 1 - Math.abs(4 * noise(x * f + i * 17, z * f, 1) - 1); s += a * n * n; sum += a; f *= 2.1; a *= 0.5; }
  return s / sum;   // [0, 1], média ~1/3
}

/** Altura do relevo: base (plana ou descendo para o mar a partir de `coast.z`), morros/mesas e ruído. */
function heightAt(x, z, noise, G) {
  let y = G.base ?? 0.2;
  // costa: o chão desce para o mar além de `at` (no eixo z por padrão; `axis: 'x'` põe o mar de lado)
  if (G.coast) { const c = G.coast, u = c.axis === 'x' ? x : z; y = Math.max(-2.4, y - Math.max(0, (c.dir ?? -1) * (u - (c.at ?? c.z))) * c.slope); }
  let rocky = 0;
  for (const b of G.bumps ?? []) {
    const wob = b.mesa ? 1 + (noise(Math.atan2(z - b.z, x - b.x) * 2.2 + 7, 3.1) - 0.5) * 0.5 : 1;
    const m = b.mesa ? mesa(x, z, b.x, b.z, b.rx, b.rz, b.h, b.mesa, wob) : bump(x, z, b.x, b.z, b.rx, b.rz, b.h, b.sharp);
    if (m === null || (!b.mesa && m <= 0)) continue;
    // `jag`: cristas e ravinas (ruído "ridged" proporcional à altura do morro), para picos que não sejam cones lisos
    const jagged = b.jag ? m * b.jag * 2 * (ridge(noise, x * (b.jf ?? 0.09) + b.x, z * (b.jf ?? 0.09) + b.z) - 0.33) : 0;
    const v = m + jagged + (b.base ?? 0);
    if (b.cut ? v < y : v > y) { y = v; rocky = b.mesa || b.rocky ? 1 : 0; }
  }
  const rough = G.rough ?? 1;
  y += ((noise(x * 0.12, z * 0.12) - 0.5) * 0.9 + (noise(x * 0.6 + 40, z * 0.6) - 0.5) * (0.22 + rocky * 0.5)) * rough;
  return y;
}

function makeTerrain(G, noise) {
  const W = G.w ?? 220, D = G.d ?? 200, SX = G.sx ?? 400, SZ = G.sz ?? 340;
  const geo = new THREE.PlaneGeometry(W, D, SX, SZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(G.cx ?? 0, 0, -D / 2 + 14);
  const pos = geo.attributes.position;
  const P = { ...PALETTES[G.palette ?? 'greek'], ...(G.colors ?? {}) };
  const grass = new THREE.Color(P.grass), dry = new THREE.Color(P.dry), rock = new THREE.Color(P.rock), sand = new THREE.Color(P.sand), snow = new THREE.Color(P.snow);
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i), noise, G));
  geo.computeVertexNormals();
  const nor = geo.attributes.normal, c = new THREE.Color(), colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), slope = 1 - nor.getY(i), n = noise(pos.getX(i) * 0.3 + 11, pos.getZ(i) * 0.3);
    c.copy(grass).lerp(dry, THREE.MathUtils.clamp(n * 1.1 - 0.4 + (G.dryness ?? 0), 0, 1));
    c.lerp(rock, THREE.MathUtils.smoothstep(slope, 0.14, 0.36));
    if (y < -1.0) c.lerp(sand, THREE.MathUtils.smoothstep(-y, 1.0, 1.4));
    if (G.snowAbove !== undefined) c.lerp(snow, THREE.MathUtils.smoothstep(y + (n - 0.5) * 3, G.snowAbove, G.snowAbove + 2.5) * (1 - THREE.MathUtils.smoothstep(slope, 0.5, 0.75) * 0.6));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------------------------------------------
// fogo, fumaça, brilho (texturas de canvas; sprites na névoa da cena)

const texCache = new Map();
function radialTex(key, stops) {
  if (texCache.has(key)) return texCache.get(key);
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}
/** Fumaça: bolota macia com borda irregular (várias manchas somadas), determinística. */
function smokeTex() {
  if (texCache.has('smoke')) return texCache.get('smoke');
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), r = rng(404);
  for (let i = 0; i < 14; i++) {
    const x = S / 2 + (r() - 0.5) * S * 0.36, y = S / 2 + (r() - 0.5) * S * 0.36, rad = S * (0.16 + r() * 0.2);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  texCache.set('smoke', t);
  return t;
}
const glowTex = () => radialTex('glow', [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [0.6, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);

function sprite(tex, color, opacity, size, additive) {
  const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !additive });
  const s = new THREE.Sprite(m); s.scale.setScalar(size); return s;
}

/** Coluna de fumaça subindo e derivando com o vento. */
function smokeColumn(scene, r, x, y, z, { h = 7, size = 1.6, color = 0x2c2a2a, opacity = 0.55, drift = [0.35, 0.05], puffs = 14 } = {}) {
  for (let i = 0; i < puffs; i++) {
    const t = i / (puffs - 1), s = sprite(smokeTex(), color, opacity * (1 - t * 0.55), size * (0.7 + t * 2.2), false);
    s.position.set(x + drift[0] * t * h + (r() - 0.5) * size * 0.5, y + 0.4 + t * h, z + drift[1] * t * h + (r() - 0.5) * size * 0.3);
    s.material.rotation = r() * 6.28;
    s.renderOrder = 2;
    scene.add(s);
  }
}

/** Língua de fogo: gota vertical (núcleo claro, borda laranja) para sprites aditivos. */
function flameTex() {
  if (texCache.has('flame')) return texCache.get('flame');
  const S = 128, cv = document.createElement('canvas'); cv.width = S; cv.height = S * 2;
  const g = cv.getContext('2d');
  g.translate(S / 2, S * 1.55); g.scale(1, 2.6);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.42);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, S * 0.42, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  texCache.set('flame', t);
  return t;
}

/** Fogo: línguas em sprites aditivos (laranja por fora, amarelo por dentro), brasa no pé, luz pontual e fumaça. */
function fire(scene, r, x, y, z, { size = 1, light = 1, smoke = true, smokeH = 8, smokeColor } = {}) {
  const n = 7 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const inner = i >= n - 3, k = size * (inner ? 0.55 + r() * 0.3 : 0.8 + r() * 0.6);
    const m = new THREE.SpriteMaterial({ map: flameTex(), color: inner ? 0xffd070 : [0xff5a14, 0xff7a22, 0xff4a10][i % 3], transparent: true, opacity: inner ? 0.85 : 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const s = new THREE.Sprite(m); s.scale.set(k * 0.7, k * 1.4, 1); s.center.set(0.5, 0.2);
    s.position.set(x + (r() - 0.5) * size * 0.8, y + (inner ? 0 : r() * 0.15 * size), z + (r() - 0.5) * size * 0.5);
    s.renderOrder = 3; scene.add(s);
  }
  const ember = sprite(glowTex(), 0xff7a2a, 0.75, size * 3.2, true); ember.position.set(x, y + size * 0.4, z); ember.renderOrder = 3; scene.add(ember);
  const L = new THREE.PointLight(0xff8a3c, 22 * light * size, 14 * size, 1.6); L.position.set(x, y + size * 0.9, z); scene.add(L);
  if (smoke) smokeColumn(scene, r, x, y + size, z, { h: smokeH * size, size: 1.2 * size, color: smokeColor ?? 0x2a2624, opacity: 0.6 });
}

/** Raio: poligonal em zigue-zague (tubos finos brancos) com ramos, halo e clarão. */
function bolt(scene, r, from, to, { color = 0xdfe9ff, width = 0.08, branches = 3, light = 60 } = {}) {
  const A = new THREE.Vector3(...from), B = new THREE.Vector3(...to);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const halo = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const seg = (a, b, wd) => {
    const d = b.clone().sub(a), len = d.length(), mid = a.clone().addScaledVector(d, 0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    for (const [m, k] of [[mat, 1], [halo, 4]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(wd * k, wd * k, len, 5), m); c.position.copy(mid); c.quaternion.copy(q); scene.add(c); }
  };
  const path = (a, b, n, amp, wd, depth) => {
    let prev = a.clone();
    for (let i = 1; i <= n; i++) {
      const t = i / n, p = a.clone().lerp(b, t);
      if (i < n) p.add(new THREE.Vector3((r() - 0.5) * amp, (r() - 0.5) * amp * 0.3, (r() - 0.5) * amp * 0.4));
      seg(prev, p, wd);
      if (depth > 0 && i < n - 1 && r() < branches / n) path(p, p.clone().add(new THREE.Vector3((r() - 0.5) * amp * 3, -amp * (1 + r() * 2), (r() - 0.5) * amp)), 4, amp * 0.6, wd * 0.6, depth - 1);
      prev = p;
    }
  };
  path(A, B, 12, A.distanceTo(B) * 0.08, width, 1);
  for (const t of [0.1, 0.5, 0.95]) { const s = sprite(glowTex(), color, 0.5, 6 + t * 4, true); s.position.copy(A).lerp(B, t); scene.add(s); }
  const L = new THREE.PointLight(color, light, 60, 1.2); L.position.copy(B).add(new THREE.Vector3(0, 2, 0)); scene.add(L);
}

// ---------------------------------------------------------------------------------------------------------------
// peças de cena

/** Corrente de elos de ferro entre dois pontos (m4). */
function chain(scene, M, a, b, link = 0.26) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), n = Math.max(2, Math.round(d.length() / (link * 0.78)));
  const geo = new THREE.TorusGeometry(link * 0.42, link * 0.1, 6, 14);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  for (let i = 0; i <= n; i++) {
    const m = new THREE.Mesh(geo, M.iron);
    m.position.copy(A).addScaledVector(d, i / n);
    m.quaternion.copy(q); m.rotateY(i % 2 ? Math.PI / 2 : 0); m.scale.set(1, 1.5, 1);
    m.castShadow = true; scene.add(m);
  }
}

/** Pilar do Tempo (m10): coluna escura com anéis acesos e brilho no topo. */
function pillar(scene, M, x, y, z, { h = 6, r = 0.55, color = 0x9f7bff } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 16), M.stoneDark); col.position.y = h / 2; col.castShadow = true; col.receiveShadow = true; g.add(col);
  const ringMat = new THREE.MeshBasicMaterial({ color, fog: false });
  for (let i = 1; i <= 4; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r * (0.95 - i * 0.02), 0.05, 6, 32), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = (h * i) / 5; g.add(ring); }
  const top = sprite(glowTex(), color, 0.95, 3.2, true); top.position.y = h + 0.3; g.add(top);
  scene.add(g);
  const L = new THREE.PointLight(color, 30, 16, 1.6); L.position.set(x, y + h + 0.5, z); scene.add(L);
}

/** Altar da Foice (m12): base de pedra com a lâmina curva acesa. */
function altar(scene, M, x, y, z, { color = 0xff5a3a, yaw = 0 } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.2), M.stoneDark); base.position.y = 0.25; g.add(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.9), M.stone); top.position.y = 0.65; g.add(top);
  const blade = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 6, 24, Math.PI * 1.1), new THREE.MeshBasicMaterial({ color, fog: false })); blade.position.y = 1.35; blade.rotation.z = 0.2; g.add(blade);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), M.woodDark ?? M.stoneDark); handle.position.set(0.72, 1.05, 0); handle.rotation.z = 0.15; g.add(handle);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const glow = sprite(glowTex(), color, 0.8, 3.4, true); glow.position.y = 1.3; g.add(glow);
  scene.add(g);
  const L = new THREE.PointLight(color, 18, 10, 1.6); L.position.set(x, y + 1.4, z); scene.add(L);
}

// ---------------------------------------------------------------------------------------------------------------
// cena

let UNITS = null;   // tipo → { source, anims, poses: { main, rider } } (vêm do Node)

/** Troca o material de time (compartilhado) por um clone na cor pedida, figura a figura. */
function paintTeam(root, M, hex, cache) {
  if (hex === undefined || hex === null) return;
  let mat = cache.get(hex);
  if (!mat) { mat = M.team.clone(); mat.color.setHex(hex); cache.set(hex, mat); }
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material)) o.material = o.material.map((m) => (m === M.team ? mat : m));
    else if (o.material === M.team) o.material = mat;
  });
}

function shadowAll(o, cast = true) { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast && !m.userData?.noShadow; m.receiveShadow = true; } }); }

function placeUnit(scene, M, teamCache, S, u, r, groundAt) {
  const def = UNITS[u.type];
  if (!def) throw new Error(`unidade sem manifesto: ${u.type}`);
  const rig = UNIT_RIGS[def.source.rig](THREE, M, def.source.params ?? {});
  const anim = u.anim ?? 'idle', a = def.anims[anim] ?? def.anims.idle;
  const frame = u.frame ?? Math.floor(r() * a.frames);
  rig.pose({ anim, dir: u.dir ?? 6, frame: Math.min(frame, a.frames - 1), frames: a.frames, loop: anim !== 'die' && anim !== 'rise', pose: a.pose, rider: a.rider, params: a.params }, def.poses);
  paintTeam(rig.group, M, u.team, teamCache);
  rig.group.position.set(u.x, (u.y ?? groundAt(u.x, u.z)) - 0.03, u.z);
  rig.group.rotation.y += u.yaw ?? 0;
  if (u.scale) rig.group.scale.multiplyScalar(u.scale);
  shadowAll(rig.group);
  scene.add(rig.group);
}

/** Renderiza a cena (dados de scenes.mjs) em w×h com super-amostragem `ss`; devolve o canvas pós-processado. */
function renderScene(S, w, h, ss) {
  const W = w * ss, H = h * ss, look = S.look;
  renderer.setSize(W, H, false);
  renderer.toneMappingExposure = look.exposure ?? 1;
  const scene = new THREE.Scene();
  const M = createMaterials(THREE);
  const el = S.sun.el, az = S.sun.az;
  const dirOf = (az, el) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  const sunDir = dirOf(az, el);
  // `skySun`: onde o céu desenha o disco/halo do sol (abaixo do horizonte = sem disco: noite, tempestade, submundo)
  const skyDir = S.skySun ? dirOf(S.skySun.az, S.skySun.el) : sunDir;
  scene.add(makeSky(skyDir, look));
  const skyScene = new THREE.Scene(); skyScene.add(makeSky(skyDir, look));
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(skyScene, 0).texture;
  scene.environment = env; scene.environmentIntensity = look.env ?? 0.22;
  for (const k of ['bronze', 'bronzeDark', 'iron', 'gold', 'bronzeBlack', 'mirror']) if (M[k]) { M[k].envMap = env; M[k].envMapIntensity = 0.8; }
  scene.fog = new THREE.FogExp2(look.fog, look.fogDensity);
  // luz: sol (ou lua), céu/chão
  const sun = new THREE.DirectionalLight(S.sun.color, S.sun.intensity);
  const focus = new THREE.Vector3(...(S.focus ?? [0, 0, -18]));
  sun.position.copy(sunDir).multiplyScalar(140).add(focus);
  sun.target.position.copy(focus);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 500 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target, new THREE.HemisphereLight(look.hemiSky, look.hemiGround, look.hemi));
  if (S.fill) { const f = new THREE.DirectionalLight(S.fill.color, S.fill.intensity); f.position.set(...S.fill.dir).multiplyScalar(100); scene.add(f); }
  // relevo e mar
  const G = S.ground ?? {};
  const noise = valueNoise(G.seed ?? 97);
  const groundAt = (x, z) => heightAt(x, z, noise, G);
  scene.add(makeTerrain(G, noise));
  if (S.sea) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: S.sea.color ?? 0x163449, roughness: S.sea.roughness ?? 0.2, metalness: 0.8, envMapIntensity: S.sea.env ?? 1.25 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = S.sea.level ?? -1.25; sea.receiveShadow = false;
    scene.add(sea);
  }
  const r = rng(S.seed ?? 71), teamCache = new Map();
  // edifícios
  for (const b of S.buildings ?? []) {
    const g = buildBuilding(THREE, M, b.type, { state: b.state ?? 'complete', variant: b.variant, frame: b.frame ?? 0, frames: b.frames ?? 1 });
    paintTeam(g, M, b.team, teamCache);
    g.position.set(b.x, (b.y ?? groundAt(b.x, b.z)) - (b.sink ?? 0.05), b.z); g.rotation.y = b.yaw ?? 0; g.scale.setScalar(b.scale ?? 1);
    shadowAll(g); scene.add(g);
  }
  // árvores e ruínas
  for (const [kind, v, tag, x, z, sc] of S.trees ?? []) {
    const t = buildProp(THREE, M, kind, v, tag);
    t.position.set(x, groundAt(x, z) - 0.05, z); t.scale.setScalar(sc); t.rotation.y = (x * 7.1 + z * 3.3) % 6.28;
    shadowAll(t); scene.add(t);
  }
  for (const ru of S.ruins ?? []) { const g = makeRuin(M, rng(ru.seed ?? 5), ru.drums ?? 3); g.position.set(ru.x, groundAt(ru.x, ru.z) - 0.1, ru.z); g.rotation.y = ru.yaw ?? 0; g.scale.setScalar(ru.scale ?? 1); scene.add(g); }
  // unidades soltas e em fileiras
  for (const u of S.units ?? []) placeUnit(scene, M, teamCache, S, u, r, groundAt);
  for (const P of S.rows ?? []) {
    const [x0, z0] = P.from, [x1, z1] = P.to, dx = x1 - x0, dz = z1 - z0, len = Math.sqrt(dx * dx + dz * dz) || 1;
    const nx = -dz / len, nz = dx / len;   // normal da fileira (as fileiras seguintes recuam por ela)
    for (let row = 0; row < (P.rows ?? 1); row++) for (let i = 0; i < P.per; i++) {
      const t = (i + (row % 2) * 0.5) / Math.max(1, P.per - 0.5);
      const x = x0 + dx * t + nx * row * (P.rowGap ?? 0.75) * (P.back ?? 1) + (r() - 0.5) * (P.jitter ?? 0.1);
      const z = z0 + dz * t + nz * row * (P.rowGap ?? 0.75) * (P.back ?? 1) + (r() - 0.5) * (P.jitter ?? 0.1);
      const type = Array.isArray(P.type) ? P.type[(i + row) % P.type.length] : P.type;
      placeUnit(scene, M, teamCache, S, { type, team: P.team, x, z, dir: P.dir, anim: P.anim, yaw: (P.yaw ?? 0) + (r() - 0.5) * (P.yawJitter ?? 0.25), scale: P.scale }, r, groundAt);
    }
  }
  // deuses (as figuras dos retratos do HUD)
  for (const d of S.gods ?? []) {
    const g = buildGod(THREE, M, d.key, d.params ?? {});
    g.position.set(d.x, (d.y ?? groundAt(d.x, d.z)) - 0.02, d.z); g.rotation.y = d.yaw ?? 0; g.scale.setScalar(d.scale ?? 1);
    shadowAll(g); scene.add(g);
    if (d.halo) { const s = sprite(glowTex(), d.halo, 0.55, (d.scale ?? 1) * 3.2, true); s.position.set(d.x, g.position.y + (d.scale ?? 1) * 1.1, d.z - 0.2); scene.add(s); }
  }
  // efeitos
  for (const f of S.fires ?? []) fire(scene, r, f.x, f.y ?? groundAt(f.x, f.z), f.z, f);
  for (const s of S.smoke ?? []) smokeColumn(scene, r, s.x, s.y ?? groundAt(s.x, s.z), s.z, s);
  for (const c of S.chains ?? []) chain(scene, M, c.from, c.to, c.link);
  for (const bl of S.bolts ?? []) bolt(scene, r, bl.from, bl.to, bl);
  // destroços de navio (m5): tábuas e costelas do casco espalhadas e inclinadas
  for (const w of S.wreck ?? []) {
    const g = new THREE.Group(); g.position.set(w.x, groundAt(w.x, w.z) - 0.1, w.z); g.rotation.y = w.yaw ?? 0;
    for (let i = 0; i < (w.planks ?? 7); i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(w.len ?? 2.4, 0.08, 0.28), i % 2 ? M.woodDark : M.wood); p.position.set((r() - 0.5) * 1.2, 0.1 + r() * 0.2, (r() - 0.5) * 2); p.rotation.set((r() - 0.5) * 0.4, (r() - 0.5) * 0.8, (r() - 0.5) * 0.5); g.add(p); }
    for (let i = 0; i < (w.ribs ?? 4); i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 5, 12, Math.PI * 0.55), M.wood); rib.position.set(-0.6 + i * 0.5, -0.2, 0.1); rib.rotation.set(0.25, Math.PI / 2, Math.PI * 0.3 + (r() - 0.5) * 0.5); g.add(rib); }
    shadowAll(g); scene.add(g);
  }
  for (const p of S.pillars ?? []) pillar(scene, M, p.x, p.y ?? groundAt(p.x, p.z), p.z, p);
  for (const a of S.altars ?? []) altar(scene, M, a.x, a.y ?? groundAt(a.x, a.z), a.z, a);
  for (const g of S.glows ?? []) {
    const y = g.y ?? groundAt(g.x, g.z) + 1;
    if (g.size) { const s = sprite(glowTex(), g.color, g.opacity ?? 0.8, g.size, true); s.position.set(g.x, y, g.z); scene.add(s); }
    if (g.light) { const L = new THREE.PointLight(g.color, g.light, g.distance ?? 20, g.decay ?? 1.6); L.position.set(g.x, y, g.z); scene.add(L); }
  }
  // câmera
  const cam = new THREE.PerspectiveCamera(S.cam.fov, w / h, 0.1, 8000);
  cam.position.set(...S.cam.pos); cam.lookAt(new THREE.Vector3(...S.cam.target));
  sun.shadow.needsUpdate = true;
  renderer.render(scene, cam);
  const rgba = downsample(readRGBA(W, H), W, H, ss);
  const cv = post(rgba, w, h, { bloom: 0.45, bloomThreshold: 0.7, vignette: 120, grain: 7, ...look });
  pm.dispose(); env.dispose();
  scene.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
  return cv;
}

/** job = { scene, w, h, ss, quality, units }: devolve o JPEG em base64. */
export function renderIllustration(job) {
  UNITS = job.units;
  const cv = renderScene(job.scene, job.w, job.h, job.ss ?? 2);
  return { w: job.w, h: job.h, jpeg: cv.toDataURL('image/jpeg', job.quality ?? 0.86).split(',')[1] };
}

window.__illustrations = { renderIllustration };
