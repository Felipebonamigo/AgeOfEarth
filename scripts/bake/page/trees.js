// Árvores realistas (Etapa 9 do visual, docs/ART.md Apêndice I): oliveira, cipreste e carvalho com tronco e galhos de
// casca pintada (textura e relevo gerados em canvas) e copa de "cartões" de folhas — quadriláteros com ramos de folhas
// pintados (lanceoladas prata-esverdeadas na oliveira, ovais verde-escuras no carvalho-azinheiro, escamas no cipreste),
// recortados por alfa. O truque que dá volume: a normal de cada cartão aponta para fora do centro da copa (misturada à
// do próprio cartão), então a copa sombreia como um volume e o contorno fica recortado folha a folha; a cor de cada
// cartão varia e escurece para o miolo (oclusão). Tudo em METROS com a base em y = 0 (o chamador converte para tiles) e
// sem Math.random: o gerador é o mulberry32 de props.js com semente pelo nome, então `olive/2/big` sai igual sempre.

import { rng, seedOf } from './props.js';

// ---------------------------------------------------------------------------------------------------------------
// Texturas em canvas (a página vive entre lotes: cada textura é gerada uma vez)

const TEX = new Map();
function canvasTex(THREE, key, w, h, paint, color = true) {
  if (TEX.has(key)) return TEX.get(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  paint(cv.getContext('2d'), w, h, cv);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  TEX.set(key, t);
  return t;
}

/** Normal map (tangente) a partir da luminância de um canvas de alturas (Sobel), com força `k`. */
function normalFromHeight(src, k) {
  const w = src.width, h = src.height, sg = src.getContext('2d'), s = sg.getImageData(0, 0, w, h).data;
  const H = (x, y) => s[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), out = g.createImageData(w, h), d = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    let nx = -dx * k, ny = -dy * k, nz = 1; const l = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return cv;
}

/** Casca: fissuras verticais onduladas e cristas (oliveira: cinza com líquen; carvalho: marrom fundo; cipreste: fibrosa avermelhada). */
const BARK = {
  olive: { base: '#6e675b', dark: '#3f3a32', light: '#8f887a', fissures: 26, wave: 7, lichen: 0.35 },
  oak: { base: '#4f3f30', dark: '#2a2119', light: '#6a5845', fissures: 34, wave: 4, lichen: 0.12 },
  cypress: { base: '#6a4a36', dark: '#3a2618', light: '#8a654a', fissures: 44, wave: 2, lichen: 0 },
};
function barkMaterial(THREE, species) {
  const key = `bark/${species}`;
  if (TEX.has(`${key}/mat`)) return TEX.get(`${key}/mat`);
  const B = BARK[species], r = rng(seedOf(key));
  const W = 256, Hh = 512;
  // alturas: fissuras escuras (fundas) e cristas claras
  const hcv = document.createElement('canvas'); hcv.width = W; hcv.height = Hh;
  const hg = hcv.getContext('2d');
  hg.fillStyle = '#8a8a8a'; hg.fillRect(0, 0, W, Hh);
  const lines = (color, n, wmin, wmax) => {
    for (let i = 0; i < n; i++) {
      const x0 = r() * W, ph = r() * 6.28, lw = wmin + r() * (wmax - wmin), len = Hh * (0.3 + r() * 0.8), y0 = r() * Hh;
      hg.strokeStyle = color; hg.lineWidth = lw; hg.beginPath();
      for (let y = 0; y <= len; y += 6) { const x = x0 + Math.sin(ph + y * 0.02) * B.wave + (r() - 0.5) * 2; const yy = (y0 + y) % Hh; if (y === 0 || yy < 6) hg.moveTo(x, yy); else hg.lineTo(x, yy); }
      hg.stroke();
    }
  };
  lines('#2a2a2a', B.fissures, 1.5, 4.5);
  lines('#c8c8c8', Math.round(B.fissures * 0.7), 1, 3);
  const albedo = canvasTex(THREE, `${key}/albedo`, W, Hh, (g) => {
    g.fillStyle = B.base; g.fillRect(0, 0, W, Hh);
    // cor seguindo as alturas (fissuras escuras, cristas claras) + manchas
    g.globalAlpha = 0.65; g.globalCompositeOperation = 'multiply'; g.drawImage(hcv, 0, 0); g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    for (let i = 0; i < 90; i++) { g.fillStyle = r() > 0.5 ? B.dark : B.light; g.globalAlpha = 0.08 + r() * 0.12; g.beginPath(); g.ellipse(r() * W, r() * Hh, 4 + r() * 16, 6 + r() * 30, 0, 0, 6.28); g.fill(); }
    if (B.lichen) for (let i = 0; i < 70 * B.lichen; i++) { g.fillStyle = r() > 0.5 ? '#9aa184' : '#b3b39a'; g.globalAlpha = 0.25 + r() * 0.3; g.beginPath(); g.ellipse(r() * W, r() * Hh, 2 + r() * 7, 2 + r() * 5, r() * 3, 0, 6.28); g.fill(); }
    g.globalAlpha = 1;
  });
  const normal = canvasTex(THREE, `${key}/normal`, W, Hh, (g) => { g.drawImage(normalFromHeight(hcv, 2.2), 0, 0); }, false);
  const mat = new THREE.MeshStandardMaterial({ map: albedo, normalMap: normal, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95, metalness: 0 });
  TEX.set(`${key}/mat`, mat);
  return mat;
}

/** Folhas: 4 ramos diferentes numa textura 2×2 (o cartão escolhe um quadrante), com alfa recortando as folhas. */
const LEAF = {
  // Olea europaea: folha estreita e comprida, verde-acinzentada por cima e prateada por baixo
  olive: { tones: ['#566b3c', '#627746', '#6e8250', '#7b8d5d', '#4b5f33', '#899769'], len: [17, 27], wid: [3.4, 5.2], count: 78, twig: '#5a4a38', spread: 0.9, angle: [0.45, 0.95] },
  // Quercus ilex (azinheira): folha oval pequena, verde-escura lustrosa
  oak: { tones: ['#46652a', '#507233', '#5c7f3a', '#688b44', '#3c5a24', '#739550'], len: [10, 16], wid: [6, 9.5], count: 96, twig: '#43352a', spread: 1, angle: [0.35, 0.9] },
  // Cupressus sempervirens: ramos de escamas, verde-escuro fosco, bem cheios
  cypress: { tones: ['#4a6e36', '#557a3e', '#608647', '#6b9150', '#42642f', '#77995a'], len: [5, 9], wid: [3.2, 4.6], count: 260, twig: '#3a3024', spread: 0.75, angle: [0.15, 0.45] },
};
function leafTexture(THREE, species) {
  return canvasTex(THREE, `leaf/${species}`, 512, 512, (g) => {
    const L = LEAF[species], r = rng(seedOf(`leaf/${species}`));
    for (let q = 0; q < 4; q++) {
      const ox = (q % 2) * 256, oy = Math.floor(q / 2) * 256;
      g.save(); g.beginPath(); g.rect(ox + 2, oy + 2, 252, 252); g.clip(); g.translate(ox + 128, oy + 238);
      // raminhos: um eixo curvo saindo da base e 4–7 ramificações abrindo em leque
      const twigs = [];
      const axis = []; let x = 0, y = 0, a = -Math.PI / 2 + (r() - 0.5) * 0.3;
      for (let i = 0; i < 14; i++) { axis.push([x, y]); x += Math.cos(a) * 16; y += Math.sin(a) * 16; a += (r() - 0.5) * 0.25; }
      twigs.push(axis);
      const nb = 4 + Math.floor(r() * 4);
      for (let b = 0; b < nb; b++) {
        const from = axis[2 + Math.floor(r() * 10)], side = r() > 0.5 ? 1 : -1;
        let bx = from[0], by = from[1], ba = -Math.PI / 2 + side * (0.5 + r() * 0.6) * L.spread; const tw = [];
        const n = 5 + Math.floor(r() * 5);
        for (let i = 0; i < n; i++) { tw.push([bx, by]); bx += Math.cos(ba) * 14; by += Math.sin(ba) * 14; ba += (r() - 0.5) * 0.3 - side * 0.05; }
        twigs.push(tw);
      }
      g.lineCap = 'round';
      for (const tw of twigs) { g.strokeStyle = L.twig; g.lineWidth = tw === axis ? 3 : 1.8; g.beginPath(); tw.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); }
      // folhas ao longo dos raminhos, alternadas, apontando para a ponta
      const leaves = [];
      for (let i = 0; i < L.count; i++) {
        const tw = twigs[Math.floor(r() * twigs.length)], k = Math.floor(r() * (tw.length - 1)), t = r();
        const [x0, y0] = tw[k], [x1, y1] = tw[k + 1];
        const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t, dir = Math.atan2(y1 - y0, x1 - x0);
        const side = r() > 0.5 ? 1 : -1, ang = dir + side * (L.angle[0] + r() * (L.angle[1] - L.angle[0]));
        leaves.push({ px, py, ang, len: L.len[0] + r() * (L.len[1] - L.len[0]), wid: L.wid[0] + r() * (L.wid[1] - L.wid[0]), tone: L.tones[Math.floor(r() * L.tones.length)], z: r() });
      }
      leaves.sort((a, b) => a.z - b.z);
      for (const f of leaves) {
        g.save(); g.translate(f.px, f.py); g.rotate(f.ang);
        const gr = g.createLinearGradient(0, -f.wid, 0, f.wid);
        gr.addColorStop(0, f.tone); gr.addColorStop(0.5, f.tone); gr.addColorStop(1, shade(f.tone, -0.18));
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0);
        g.quadraticCurveTo(f.len * 0.42, -f.wid, f.len, 0); g.quadraticCurveTo(f.len * 0.42, f.wid, 0, 0); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(1, 0); g.lineTo(f.len * 0.9, 0); g.stroke();
        g.restore();
      }
      g.restore();
    }
  });
}
/** Clareia (k > 0) ou escurece (k < 0) uma cor #rrggbb. */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16); const f = (c) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function leafMaterials(THREE, species) {
  const key = `leafmat/${species}`;
  if (TEX.has(key)) return TEX.get(key);
  const map = leafTexture(THREE, species);
  const mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, vertexColors: true, roughness: species === 'oak' ? 0.62 : 0.85, metalness: 0, side: THREE.FrontSide });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.45 });
  const out = { mat, depth };
  TEX.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Geometria

/** Galho: cilindro afunilado de `a` a `b` com UV da casca proporcional ao comprimento (sem esticar a textura). */
function branchGeo(THREE, a, b, r0, r1, radial = 9) {
  const d = b.clone().sub(a), len = d.length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, radial, 1, false);   // fechado: nas emendas não aparece o avesso
  const uv = geo.attributes.uv; const k = len / (2 * Math.PI * Math.max(0.03, (r0 + r1) / 2)) * 0.5;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * k);
  geo.translate(0, len / 2, 0);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  geo.translate(a.x, a.y, a.z);
  return geo;
}

/**
 * Crescimento dos galhos: a partir de `start` na direção `dir`, `depth` níveis de ramificação; cada segmento se curva
 * um pouco (`bend`), afina e se divide em 2–3 filhos abrindo `spread`. Devolve os segmentos e as pontas (onde nascem
 * os tufos de folhas).
 */
function grow(THREE, r, { start, dir, len, rad, depth, spread, bend, taper = 0.7, lenK = 0.72, children = [2, 3], up = 0.35 }) {
  const segs = [], tips = [];
  const rec = (p, d, L, R, lvl) => {
    const steps = 3;
    let q = p.clone(), dd = d.clone(), rr = R;
    for (let s = 0; s < steps; s++) {
      const n = q.clone().add(dd.clone().multiplyScalar(L / steps));
      const r1 = rr * (1 - (1 - taper) / steps);
      segs.push({ a: q, b: n, r0: rr, r1 });
      q = n; rr = r1;
      dd.add(new THREE.Vector3((r() - 0.5) * bend, (r() - 0.3) * bend * 0.5, (r() - 0.5) * bend)).normalize();
    }
    if (lvl <= 0) { tips.push({ p: q, d: dd, r: rr }); return; }
    const nc = children[0] + Math.floor(r() * (children[1] - children[0] + 1));
    for (let c = 0; c < nc; c++) {
      const az = (c / nc) * Math.PI * 2 + r() * 1.2;
      const side = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const nd = dd.clone().multiplyScalar(1 - spread).add(side.multiplyScalar(spread)).add(new THREE.Vector3(0, up, 0)).normalize();
      rec(q, nd, L * (lenK + r() * 0.15), rr * 0.72, lvl - 1);
    }
  };
  rec(start, dir.clone().normalize(), len, rad, depth);
  return { segs, tips };
}

/**
 * Copa de cartões: `cards` = [{ c: centro, s: tamanho, n: normal do cartão }]; a normal de sombreamento mistura a direção
 * para fora do centro da copa (`center`, elipsoide `radii`) com a do cartão; a cor varia por cartão e escurece para o
 * miolo. Cada cartão tem as duas faces (duas ordens de vértices, a mesma normal).
 */
function cardsMesh(THREE, r, species, cards, center, radii, { dark = 0.55 } = {}) {
  const { mat, depth } = leafMaterials(THREE, species);
  const n = cards.length;
  const pos = new Float32Array(n * 4 * 3), nor = new Float32Array(n * 4 * 3), uv = new Float32Array(n * 4 * 2), col = new Float32Array(n * 4 * 3);
  const idx = new Uint32Array(n * 12);
  const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), radial = new THREE.Vector3(), nn = new THREE.Vector3();
  cards.forEach((cd, i) => {
    // base do cartão: u ⟂ normal, v = n × u, com rolagem aleatória
    const nrm = cd.n.clone().normalize();
    u.crossVectors(Math.abs(nrm.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up, nrm).normalize();
    v.crossVectors(nrm, u).normalize();
    const roll = r() * Math.PI * 2, cr = Math.cos(roll), sr = Math.sin(roll);
    const U = u.clone().multiplyScalar(cr).add(v.clone().multiplyScalar(sr)), Vv = v.clone().multiplyScalar(cr).sub(u.clone().multiplyScalar(sr));
    const h = cd.s / 2;
    // sombreamento: para fora do centro (no espaço do elipsoide)
    radial.copy(cd.c).sub(center); radial.set(radial.x / radii.x, radial.y / radii.y, radial.z / radii.z);
    const depthK = Math.min(1, radial.length());
    radial.normalize();
    nn.copy(radial).multiplyScalar(0.78).add(nrm.clone().multiplyScalar(0.22)).normalize();
    // cor: variação por cartão e oclusão para o miolo e para baixo
    const t = 0.82 + r() * 0.3, ao = dark + (1 - dark) * Math.pow(depthK, 1.3), below = radial.y < 0 ? 1 + radial.y * 0.25 : 1;
    const warm = 0.96 + r() * 0.08;
    const cR = t * ao * below * warm, cG = t * ao * below, cB = t * ao * below * (2 - warm);
    const q = Math.floor(r() * 4), u0 = (q % 2) * 0.5, v0 = Math.floor(q / 2) * 0.5;
    const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
    corners.forEach(([a, b, s, tt], k) => {
      tmp.copy(cd.c).addScaledVector(U, a * h).addScaledVector(Vv, b * h);
      const o = (i * 4 + k) * 3; pos[o] = tmp.x; pos[o + 1] = tmp.y; pos[o + 2] = tmp.z;
      nor[o] = nn.x; nor[o + 1] = nn.y; nor[o + 2] = nn.z;
      col[o] = cR; col[o + 1] = cG; col[o + 2] = cB;
      const ou = (i * 4 + k) * 2; uv[ou] = u0 + s * 0.5; uv[ou + 1] = 1 - (v0 + (1 - tt) * 0.5);
    });
    const b = i * 4, x = i * 12;
    idx.set([b, b + 1, b + 2, b, b + 2, b + 3, b, b + 2, b + 1, b, b + 3, b + 2], x);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

/** Tufo de cartões em volta de um ponto (as pontas dos galhos). */
function tuft(THREE, r, out, p, radius, count, size, lift = 0.15) {
  for (let i = 0; i < count; i++) {
    const d = new THREE.Vector3(r() * 2 - 1, (r() * 2 - 1) * 0.75, r() * 2 - 1);
    if (d.lengthSq() > 1) { i--; continue; }
    const c = p.clone().addScaledVector(d, radius); c.y += lift * radius;
    const n = d.clone().add(new THREE.Vector3((r() - 0.5) * 0.8, 0.35 + r() * 0.3, (r() - 0.5) * 0.8));
    if (n.lengthSq() < 1e-4) n.set(0, 1, 0);
    out.push({ c, s: size * (0.75 + r() * 0.5), n });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Espécies

/**
 * Árvore `species` (olive | cypress | oak), variante V, tag (big | small | thin): devolve um grupo em METROS com a base
 * em y = 0. `thin` é a árvore sendo cortada (copa rala); `small` só muda a escala (o chamador aplica).
 */
export function buildTree(THREE, species, V, tag) {
  const r = rng(seedOf(`tree/${species}/${V}/${tag ?? ''}`));
  const g = new THREE.Group();
  const bark = barkMaterial(THREE, species);
  const thin = tag === 'thin';
  const addSegs = (segs, radial = 9) => {
    for (const s of segs) { const m = new THREE.Mesh(branchGeo(THREE, s.a, s.b, s.r0, s.r1, radial), bark); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  };
  const cards = [];

  if (species === 'olive') {
    // tronco torcido que se divide em 2–3 pernadas grossas logo acima do chão, copa aberta e irregular
    const lean = new THREE.Vector3((r() - 0.5) * 0.5, 1, (r() - 0.5) * 0.5);
    const trunk = grow(THREE, r, { start: new THREE.Vector3(0, 0, 0), dir: lean, len: 1.1, rad: 0.3, depth: 0, spread: 0, bend: 0.55, taper: 0.85 });
    addSegs(trunk.segs, 11);
    const top = trunk.tips[0];
    const limbs = 2 + Math.floor(r() * 2);
    const tips = [];
    for (let i = 0; i < limbs; i++) {
      const az = (i / limbs) * 6.28 + r() * 1.5;
      const d = new THREE.Vector3(Math.cos(az) * 0.8, 1, Math.sin(az) * 0.8);
      const t = grow(THREE, r, { start: top.p.clone(), dir: d, len: 1.0 + r() * 0.3, rad: top.r * 0.85, depth: 2, spread: 0.55, bend: 0.7, taper: 0.62, lenK: 0.62, up: 0.25 });
      addSegs(t.segs, 8); tips.push(...t.tips);
    }
    const center = tips.reduce((a, t) => a.add(t.p), new THREE.Vector3()).multiplyScalar(1 / tips.length); center.y += 0.1;
    const keep = thin ? 0.45 : 1;
    tips.forEach((t) => { if (r() < keep) tuft(THREE, r, cards, t.p, 0.75 + r() * 0.3, 30, 0.68, 0.2); });
    // enchimento: a oliveira é aberta, mas sem ele a copa some contra a grama no zoom de jogo
    const radii = new THREE.Vector3(1.9, 1.1, 1.9);
    for (let i = 0, fill = thin ? 25 : 90; i < fill; i++) {
      const d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); if (d.lengthSq() > 1) { i--; continue; }
      cards.push({ c: center.clone().add(new THREE.Vector3(d.x * radii.x * 0.75, d.y * radii.y * 0.7, d.z * radii.z * 0.75)), s: 0.7 + r() * 0.3, n: d.clone().add(new THREE.Vector3(0, 0.3, 0)) });
    }
    g.add(cardsMesh(THREE, r, 'olive', cards, center, radii, { dark: 0.7 }));
  } else if (species === 'oak') {
    // azinheira: tronco curto e grosso, 4–5 pernadas, copa redonda e densa
    const trunk = grow(THREE, r, { start: new THREE.Vector3(0, 0, 0), dir: new THREE.Vector3((r() - 0.5) * 0.25, 1, (r() - 0.5) * 0.25), len: 1.3, rad: 0.34, depth: 0, spread: 0, bend: 0.3, taper: 0.8 });
    addSegs(trunk.segs, 12);
    const top = trunk.tips[0], tips = [];
    const limbs = 4 + Math.floor(r() * 2);
    for (let i = 0; i < limbs; i++) {
      const az = (i / limbs) * 6.28 + r() * 0.8;
      const d = new THREE.Vector3(Math.cos(az) * 0.9, 1.1, Math.sin(az) * 0.9);
      const t = grow(THREE, r, { start: top.p.clone(), dir: d, len: 1.2 + r() * 0.4, rad: top.r * 0.62, depth: 2, spread: 0.6, bend: 0.5, taper: 0.6, lenK: 0.6, up: 0.3 });
      addSegs(t.segs, 8); tips.push(...t.tips);
    }
    const center = tips.reduce((a, t) => a.add(t.p), new THREE.Vector3()).multiplyScalar(1 / tips.length); center.y -= 0.1;
    const radii = new THREE.Vector3(2.3, 1.65, 2.3);
    const keep = thin ? 0.45 : 1;
    tips.forEach((t) => { if (r() < keep) tuft(THREE, r, cards, t.p, 0.85 + r() * 0.35, 22, 0.72, 0.1); });
    // enchimento: cartões no volume da copa (sem buracos que mostrem o céu através de uma copa densa)
    const fill = Math.round((thin ? 40 : 150));
    for (let i = 0; i < fill; i++) {
      const d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); if (d.lengthSq() > 1) { i--; continue; }
      const c = center.clone().add(new THREE.Vector3(d.x * radii.x * 0.8, d.y * radii.y * 0.75, d.z * radii.z * 0.8));
      cards.push({ c, s: 0.8 + r() * 0.35, n: d.clone().add(new THREE.Vector3(0, 0.3, 0)) });
    }
    g.add(cardsMesh(THREE, r, 'oak', cards, center, radii, { dark: 0.64 }));
  } else {
    // cipreste: tronco curto aparente e uma chama estreita de ramos de escamas; núcleo escuro para não ver o céu através
    const H = (6.2 + r() * 1.2) * (thin ? 0.6 : 1), W = (0.72 + r() * 0.16) * (thin ? 0.72 : 1);
    const trunk = new THREE.Mesh(branchGeo(THREE, new THREE.Vector3(0, 0, 0), new THREE.Vector3((r() - 0.5) * 0.04, 1.2, 0), 0.15, 0.1, 10), bark);
    trunk.castShadow = true; g.add(trunk);
    const prof = (t) => Math.max(0.02, Math.sin(Math.pow(Math.max(0, t), 0.55) * Math.PI)) * W * (1 + 0.12 * Math.sin(t * 17 + V) + 0.06 * Math.sin(t * 41 + V * 3));
    const y0 = 0.45;
    // núcleo
    const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(prof(t) * 0.62, y0 + t * H)); }
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x3b5e31, roughness: 0.95 });
    const core = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), coreMat); core.castShadow = true; core.receiveShadow = true; g.add(core);
    // escamas: cartões perto da superfície da chama, normais para fora do eixo
    const n = thin ? 420 : 900;
    for (let i = 0; i < n; i++) {
      const t = Math.pow(r(), 0.85) * 0.98, az = r() * 6.28, rad = prof(t) * (0.62 + 0.42 * Math.sqrt(r()));
      const c = new THREE.Vector3(Math.cos(az) * rad, y0 + t * H, Math.sin(az) * rad);
      const s = (0.44 + r() * 0.3) * (1 - t * 0.35);
      cards.push({ c, s, n: new THREE.Vector3(Math.cos(az), 0.25 + r() * 0.4, Math.sin(az)) });
    }
    g.add(cardsMesh(THREE, r, 'cypress', cards, new THREE.Vector3(0, y0 + H * 0.4, 0), new THREE.Vector3(W, H * 0.6, W), { dark: 0.8 }));
  }
  return g;
}
