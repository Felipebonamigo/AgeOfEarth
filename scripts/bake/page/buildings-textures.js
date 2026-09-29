// Texturas dos edifícios (Etapa 9 do visual, docs/ART.md Apêndice I): telhas de capa e canal (imbrex/tegula), cantaria
// em fiadas, alvenaria de pedra irregular, reboco de cal, mármore com veios e madeira com veio — geradas em canvas por
// pixel (alturas + cor), com mapa normal por Sobel, SEM Math.random (mulberry32 com semente pelo nome).
//
// `texturize(THREE, M, group)` troca, depois de o edifício estar montado, os materiais lisos da paleta pelos texturizados
// (clones: as unidades e as árvores continuam com os materiais de sempre, e o hash delas não muda) e dá UV em METROS no
// espaço do edifício a cada triângulo: `u` na horizontal ao longo da face, `v` subindo a face (numa água de telhado, `v`
// sobe a água e `u` corre ao longo da cumeeira; numa parede, `v` é a altura). Peças vizinhas continuam a mesma textura
// sem costura, e a mesma fiada de pedra dá a volta no canto. A madeira gira o veio para o comprimento da peça.
// A cor de cada material texturizado é a da paleta dividida pela média da textura (a cidade não muda de tom).
// Os materiais de parede escurecem perto do chão (respingo de terra e oclusão, pela altura no mundo, no shader).

const TEX = new Map();
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function seedOf(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function hash2(x, y, s) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };

/** Ruído de valor periódico (período `p` células no lado `size`), fBm de `oct` oitavas, em [0, 1]. */
function fbm(size, p, oct, seed) {
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++, amp *= 0.5) {
    const c = p << o, per = size / c;
    for (let y = 0; y < size; y++) {
      const fy = y / per, j = Math.floor(fy), ty = fy - j, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = x / per, i = Math.floor(fx), tx = fx - i, sx = tx * tx * (3 - 2 * tx);
        const a = hash2(i % c, j % c, seed + o), b = hash2((i + 1) % c, j % c, seed + o), cc = hash2(i % c, (j + 1) % c, seed + o), d = hash2((i + 1) % c, (j + 1) % c, seed + o);
        out[y * size + x] += amp * ((a + (b - a) * sx) + ((cc + (d - cc) * sx) - (a + (b - a) * sx)) * sy);
      }
    }
    tot += amp;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

/** Canvas RGB a partir de três canais em [0, 1] (dados lineares: a textura é multiplicadora da cor da paleta). */
function toCanvas(size, col) {
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
  const g = cv.getContext('2d'), img = g.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) { d[i * 4] = clamp01(col[i * 3]) * 255; d[i * 4 + 1] = clamp01(col[i * 3 + 1]) * 255; d[i * 4 + 2] = clamp01(col[i * 3 + 2]) * 255; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  return cv;
}
/** Mapa normal (espaço tangente, periódico) das alturas `h` em [0, 1] com força `k` (Sobel). */
function normalCanvas(size, h, k) {
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
  const g = cv.getContext('2d'), img = g.createImageData(size, size), d = img.data, m = size - 1;
  const H = (x, y) => h[(y & m) * size + (x & m)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    // v cresce para CIMA na face e a linha 0 do canvas é o topo da textura (flipY): subir na imagem = +v
    const dy = (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1)) - (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1));
    let nx = -dx * k, ny = -dy * k, nz = 1; const l = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------
// Geradores: { size, meters, col (RGB multiplicadores), h (alturas), normal (força) }. Linha 0 = topo (v alto).

/** Telhado de capa e canal: canais (tegulae) planos em fiadas que sobrepõem a de baixo e capas (imbrices) em meia-cana
 *  cobrindo as juntas, correndo água abaixo; cada telha com o seu tom (cozida mais ou menos, desbotada, com líquen) e
 *  manchas largas de intempérie. Telhas do tamanho grego (~0,48 × 0,6 m): legíveis a zoom 1 (≈ 8 px por coluna). */
function genRoof(size) {
  const meters = 2.4, cols = 5, rows = 4, r = rng(seedOf('roof'));   // tégulas de ~0,48 × 0,6 m (coríntias/lacônias)
  const col = new Float32Array(size * size * 3), h = new Float32Array(size * size);
  const cw = size / cols, rh = size / rows;
  const tone = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols * 2; i++) {
    const u = r();
    // cozida escura / desbotada rosada / clara / comum / parda (trocada por outra de outro lote)
    const t = u < 0.1 ? [0.74, 0.66, 0.64] : u < 0.22 ? [1.04, 0.92, 0.88] : u < 0.36 ? [1.08, 1.02, 0.94] : u < 0.46 ? [0.86, 0.8, 0.78] : [1, 0.96, 0.94];
    const k = 0.84 + r() * 0.26;
    tone.push([t[0] * k, t[1] * k, t[2] * k, r() < 0.1 ? 1 : 0]);
  }
  const grain = fbm(size, 16, 3, seedOf('roof-grain')), lich = fbm(size, 8, 3, seedOf('roof-lichen')), weather = fbm(size, 2, 3, seedOf('roof-weather'));
  for (let y = 0; y < size; y++) {
    const j = Math.floor(y / rh), ty = (y - j * rh) / rh;   // 0 no topo da fiada (sob a de cima), 1 na borda de baixo
    for (let x = 0; x < size; x++) {
      const o = y * size + x, i = Math.floor(x / cw), tx = (x - i * cw) / cw;
      // capa: meia-cana centrada na junta (tx = 0 / 1), largura 0,4 da coluna, alta
      const dj = Math.min(tx, 1 - tx) / 0.2, cap = dj < 1 ? Math.sqrt(1 - dj * dj) : 0;
      const isCap = dj < 1;
      // a fiada sobe um pouco de trás (sob a de cima) para a borda da frente
      const course = 0.25 + 0.2 * ty;
      h[o] = isCap ? course + 0.2 + 0.45 * cap : course + 0.03 * Math.sin(tx * Math.PI);
      const id = (j * cols * 2) + i * 2 + (isCap ? 1 : 0), t = tone[id % tone.length];
      let shade = isCap ? 0.82 + 0.26 * cap : 0.9;
      shade *= 1 - 0.22 * smooth(0.9, 1, ty) * (isCap ? 0.5 : 1);    // borda de baixo da fiada
      shade *= 1 - 0.34 * (1 - smooth(0, 0.08, ty));                 // sombra da fiada de cima (degrau)
      if (!isCap) shade *= 1 - 0.42 * (1 - smooth(0.2, 0.34, Math.min(tx, 1 - tx)));   // canal escuro junto das capas
      shade *= (0.93 + 0.14 * grain[o]) * (0.86 + 0.2 * weather[o]);
      let cr = t[0] * shade, cg = t[1] * shade, cb = t[2] * shade;
      const l = t[3] ? smooth(0.5, 0.66, lich[o]) * 0.65 : smooth(0.7, 0.84, lich[o]) * 0.4;
      cr = cr + (0.9 - cr) * l; cg = cg + (1.1 - cg) * l * 0.9; cb = cb + (0.82 - cb) * l;   // líquen cinza-amarelado
      col[o * 3] = cr * 0.8; col[o * 3 + 1] = cg * 0.8; col[o * 3 + 2] = cb * 0.8;
    }
  }
  return { size, meters, col, h, normal: 7 };
}

/** Cantaria: fiadas de 0,5 m com blocos de 0,6–1,3 m, juntas finas recuadas, arestas gastas, tom por bloco e escorridos
 *  de chuva. */
function genAshlar(size) {
  const meters = 2, rows = 4, r = rng(seedOf('ashlar'));
  const col = new Float32Array(size * size * 3), h = new Float32Array(size * size);
  const rh = size / rows, pxm = size / meters, joint = 0.018 * pxm;
  const rowsBlocks = [];
  for (let j = 0; j < rows; j++) {
    const cuts = []; let x = r() * 0.8 * pxm;
    const start = x;
    while (x < start + size - 0.55 * pxm) { cuts.push(x); x += (0.6 + r() * 0.7) * pxm; }
    cuts.push(start + size);
    rowsBlocks.push(cuts.map((c) => [c, 0.86 + r() * 0.2, (r() - 0.5) * 0.06]));
  }
  const grain = fbm(size, 32, 3, seedOf('ashlar-grain')), blot = fbm(size, 6, 4, seedOf('ashlar-blot')), streak = fbm(size, 24, 2, seedOf('ashlar-streak'));
  for (let y = 0; y < size; y++) {
    const j = Math.floor(y / rh), ty = y - j * rh, cuts = rowsBlocks[j];
    for (let x = 0; x < size; x++) {
      const o = y * size + x;
      // bloco: o último corte ≤ x (com a volta periódica)
      let xs = x; if (xs < cuts[0][0]) xs += size;
      let b = 0; while (b + 1 < cuts.length && cuts[b + 1][0] <= xs) b++;
      const x0 = cuts[b][0], x1 = b + 1 < cuts.length ? cuts[b + 1][0] : cuts[0][0] + size;
      const ex = Math.min(xs - x0, x1 - xs), ey = Math.min(ty, rh - ty), e = Math.min(ex, ey);
      const [, tone, warm] = cuts[b];
      const inJoint = e < joint;
      const bevel = smooth(joint, joint + 0.05 * pxm, e);
      const chip = hash2(Math.floor(x / 3), Math.floor(y / 3), 71) < 0.08 && e < joint + 0.06 * pxm;   // lascas na aresta
      h[o] = inJoint ? 0.1 : 0.55 + 0.3 * bevel - (chip ? 0.2 : 0) + 0.08 * (grain[o] - 0.5);
      let s = inJoint ? 0.55 : tone * (0.92 + 0.12 * grain[o]) * (0.88 + 0.12 * bevel) * (0.9 + 0.2 * blot[o]);
      // escorrido: faixas verticais escuras que descem da junta horizontal
      const st = smooth(0.62, 0.8, streak[Math.floor(y / 8) * 8 * size + x] ?? 0) * (1 - ty / rh) * 0.12;
      s *= 1 - st;
      col[o * 3] = s * (1 + warm) * 0.85; col[o * 3 + 1] = s * 0.85; col[o * 3 + 2] = s * (1 - warm) * 0.85;
    }
  }
  return { size, meters, col, h, normal: 4 };
}

/** Alvenaria irregular: pedras de Voronoi (~0,3 m) em cúpula com argamassa clara recuada entre elas, tom forte por pedra. */
function genRubble(size) {
  const meters = 2, cells = 7, seed = seedOf('rubble');
  const col = new Float32Array(size * size * 3), h = new Float32Array(size * size);
  const px = [], py = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) { px.push(i + 0.5 + (hash2(i, j, seed) - 0.5) * 0.8); py.push(j + 0.5 + (hash2(i, j, seed + 1) - 0.5) * 0.8); }
  const grain = fbm(size, 32, 3, seed + 3), warp = fbm(size, 8, 2, seed + 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = y * size + x;
    // deforma o domínio (pedras menos poligonais); a distância em x pesa 0,8 (pedras deitadas)
    const fx = (x / size) * cells + (warp[o] - 0.5) * 0.5, fy = (y / size) * cells + (warp[(o + (size >> 1)) % (size * size)] - 0.5) * 0.5;
    const ci = Math.floor(fx), cj = Math.floor(fy);
    let d1 = 9, d2 = 9, best = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ni = ci + di, nj = cj + dj, wi = ((ni % cells) + cells) % cells, wj = ((nj % cells) + cells) % cells, w = wj * cells + wi;
      const ex = (fx - (px[w] + ni - wi)) * 0.8, ey = fy - (py[w] + nj - wj), d = ex * ex + ey * ey;
      if (d < d1) { d2 = d1; d1 = d; best = w; } else if (d < d2) d2 = d;
    }
    const e = Math.sqrt(d2) - Math.sqrt(d1);
    const mortar = e < 0.07;
    const dome = smooth(0.07, 0.3, e);
    const tone = 0.72 + hash2(best, 5, seed) * 0.38, warm = (hash2(best, 6, seed) - 0.5) * 0.12;
    h[o] = mortar ? 0.12 + 0.05 * grain[o] : 0.4 + 0.45 * dome + 0.1 * (grain[o] - 0.5);
    const s = mortar ? 0.95 * (0.9 + 0.1 * grain[o]) : tone * (0.85 + 0.15 * dome) * (0.9 + 0.16 * grain[o]);
    col[o * 3] = s * (1 + warm) * 0.8; col[o * 3 + 1] = s * 0.8; col[o * 3 + 2] = s * (1 - warm) * 0.8;
  }
  return { size, meters, col, h, normal: 5 };
}

/** Reboco de cal: manchas largas, grão, fissuras finas e trechos em que o reboco caiu e aparece a pedra. */
function genPlaster(size) {
  const meters = 2, seed = seedOf('plaster'), r = rng(seed);
  const col = new Float32Array(size * size * 3), h = new Float32Array(size * size);
  const blot = fbm(size, 4, 5, seed), grain = fbm(size, 64, 2, seed + 1), fall = fbm(size, 6, 4, seed + 2);
  for (let i = 0; i < size * size; i++) {
    const bare = smooth(0.74, 0.8, fall[i]);
    h[i] = 0.6 + 0.08 * (blot[i] - 0.5) + 0.05 * (grain[i] - 0.5) - 0.3 * bare;
    const s = (0.9 + 0.12 * blot[i]) * (0.95 + 0.07 * grain[i]);
    const st = 0.62 * (0.85 + 0.2 * grain[i]);   // pedra por baixo
    col[i * 3] = (s + (st * 1.02 - s) * bare) * 0.88; col[i * 3 + 1] = (s + (st - s) * bare) * 0.88; col[i * 3 + 2] = (s + (st * 0.95 - s) * bare) * 0.88;
  }
  // fissuras finas: caminhadas aleatórias
  for (let c = 0; c < 10; c++) {
    let x = r() * size, y = r() * size, a = r() * 6.28;
    for (let s = 0, n = 40 + r() * 120; s < n; s++) {
      a += (r() - 0.5) * 0.7; x += Math.cos(a) * 1.2; y += Math.sin(a) * 1.2;
      const o = ((Math.floor(y) & (size - 1)) * size) + (Math.floor(x) & (size - 1));
      col[o * 3] *= 0.7; col[o * 3 + 1] *= 0.7; col[o * 3 + 2] *= 0.7; h[o] -= 0.15;
    }
  }
  return { size, meters, col, h, normal: 2.5 };
}

/** Mármore: branco com veios cinzentos finos (turbulência) e manchas amareladas leves; quase liso. */
function genMarble(size) {
  const meters = 2, seed = seedOf('marble');
  const col = new Float32Array(size * size * 3), h = new Float32Array(size * size);
  const turb = fbm(size, 4, 5, seed), blot = fbm(size, 3, 3, seed + 1), grain = fbm(size, 64, 2, seed + 2);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = y * size + x;
    const v = Math.abs(Math.sin((x / size) * Math.PI * 2 * 2 + (y / size) * Math.PI * 2 + turb[o] * 9));
    const vein = Math.pow(1 - v, 14);
    const s = (0.96 + 0.06 * blot[o]) * (1 - 0.16 * vein) * (0.98 + 0.03 * grain[o]);
    h[o] = 0.5 + 0.02 * grain[o];
    col[o * 3] = s * 0.92; col[o * 3 + 1] = s * 0.91 * (1 - 0.02 * blot[o]); col[o * 3 + 2] = s * 0.89 * (1 - 0.05 * blot[o]);
  }
  return { size, meters, col, h, normal: 0.6 };
}

/** Madeira: veio ao longo de v (anéis alongados), nós raros e tom por tábua de 0,18 m (sem frestas: vigas finas também usam). */
function genWood(size) {
  const meters = 1, seed = seedOf('wood'), r = rng(seed);
  const col = new Float32Array(size * size * 3), h = new Float32Array(size * size);
  const n1 = fbm(size, 8, 4, seed), plank = size / (meters / 0.18);
  const knots = Array.from({ length: 5 }, () => [r() * size, r() * size, 3 + r() * 5]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = y * size + x;
    let ring = Math.sin((x / size) * Math.PI * 2 * 28 + n1[o] * 14 + (y / size) * Math.PI * 2 * 1);
    for (const [kx, ky, kr] of knots) {
      const dx = x - kx, dy = (y - ky) * 0.5, d = Math.sqrt(dx * dx + dy * dy);
      if (d < kr * 3) ring = Math.sin(d * 1.2 + n1[o] * 4) * (1 - d / (kr * 3)) + ring * (d / (kr * 3));
    }
    const s = (0.84 + 0.1 * ring) * (0.92 + 0.12 * n1[o]) * (0.94 + 0.08 * hash2(Math.floor(x / plank), 0, seed));   // tom por tábua
    h[o] = 0.55 + 0.05 * ring;
    col[o * 3] = s * 0.9; col[o * 3 + 1] = s * 0.88; col[o * 3 + 2] = s * 0.86;
  }
  return { size, meters, col, h, normal: 2 };
}

// ---------------------------------------------------------------------------------------------------------------

const KINDS = { roof: genRoof, ashlar: genAshlar, rubble: genRubble, plaster: genPlaster, marble: genMarble, wood: genWood };
/** Material da paleta → [textura, escurece perto do chão]. */
export const TEXTURED = {
  terracotta: ['roof', false], terracottaDark: ['roof', false],
  limestone: ['ashlar', true], limestoneDark: ['ashlar', true], ashlar: ['ashlar', true], ashlar2: ['ashlar', true], ashlarDark: ['ashlar', true],
  stone: ['rubble', true], stoneDark: ['rubble', true], stoneWarm: ['rubble', true], stoneLight: ['rubble', true],
  plaster: ['plaster', true], plasterDark: ['plaster', true],
  marble: ['marble', true], marbleDark: ['marble', true],
  wood: ['wood', false], woodDark: ['wood', false],
};

function textureSet(THREE, kind) {
  if (TEX.has(kind)) return TEX.get(kind);
  const size = kind === 'wood' ? 256 : 512;
  const g = KINDS[kind](size);
  let mean = 0; for (let i = 0; i < g.col.length; i++) mean += g.col[i]; mean /= g.col.length;
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(1 / g.meters, 1 / g.meters); return t; };
  const set = { map: mk(toCanvas(size, g.col)), normalMap: mk(normalCanvas(size, g.h, g.normal)), mean };
  TEX.set(kind, set);
  return set;
}

/** Sujeira junto ao chão: o shader escurece a cor até 0,45 tile (≈ 0,9 m) acima do chão do mundo. */
function withGrime(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vGrimeY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGrimeY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGrimeY;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(0.74, 1.0, smoothstep(0.0, 0.45, vGrimeY));');
  };
  mat.customProgramCacheKey = () => 'grime';
  return mat;
}

const MATS = new Map();
function texturedFor(THREE, M, key) {
  if (MATS.has(key)) return MATS.get(key);
  const [kind, grime] = TEXTURED[key];
  const set = textureSet(THREE, kind), base = M[key];
  const m = base.clone();
  m.map = set.map; m.normalMap = set.normalMap;
  const ns = kind === 'marble' ? 0.5 : 1; m.normalScale = new THREE.Vector2(ns, ns);
  m.color = base.color.clone().multiplyScalar(1 / set.mean);
  if (kind === 'roof') {   // telha envelhecida: menos laranja (15 % para o cinza da mesma luminância) e mais escura
    const c = m.color, l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    c.setRGB(c.r + (l - c.r) * 0.15, c.g + (l - c.g) * 0.15, c.b + (l - c.b) * 0.15).multiplyScalar(key === 'terracottaDark' ? 0.78 : 0.92);
  }
  if (grime) withGrime(m);
  m.userData = { ...base.userData, textured: kind };
  MATS.set(key, m);
  return m;
}

const _a = [0, 0, 0];
/**
 * Troca os materiais lisos da paleta pelos texturizados e dá UV em metros no espaço do edifício (o grupo em tiles,
 * na origem): por triângulo, `u` = horizontal ao longo da face e `v` = subindo a face; em faces horizontais, (x, z).
 * A madeira alinha `v` ao eixo mais longo da peça (o veio). As tiras de fiada dos telhados (`userData.tileRow`) somem:
 * a textura já tem as fiadas.
 */
export function texturize(THREE, M, group) {
  const byMat = new Map(Object.keys(TEXTURED).map((k) => [M[k], k]));
  group.updateMatrixWorld(true);
  const toMeters = 1 / 0.5;   // M2T = 0,5 tile por metro (camera.js)
  const meshes = [];
  group.traverse((o) => { if (o.isMesh && !Array.isArray(o.material) && byMat.has(o.material) && !o.userData.context && !o.userData.decal) meshes.push(o); });
  const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3();
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), grainDir = new THREE.Vector3();
  for (const o of meshes) {
    const key = byMat.get(o.material);
    if (o.userData.tileRow && TEXTURED[key][0] === 'roof') { o.visible = false; continue; }
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);
    const isWood = TEXTURED[key][0] === 'wood';
    if (isWood) {
      geo.computeBoundingBox(); const s = geo.boundingBox.getSize(e1);
      grainDir.set(s.x >= s.y && s.x >= s.z ? 1 : 0, s.y > s.x && s.y >= s.z ? 1 : 0, s.z > s.x && s.z > s.y ? 1 : 0).transformDirection(o.matrixWorld);
    }
    for (let i = 0; i < pos.count; i += 3) {
      p0.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); p1.fromBufferAttribute(pos, i + 1).applyMatrix4(o.matrixWorld); p2.fromBufferAttribute(pos, i + 2).applyMatrix4(o.matrixWorld);
      n.crossVectors(e1.subVectors(p1, p0), e2.subVectors(p2, p0));
      if (n.lengthSq() < 1e-12) { for (let k = 0; k < 3; k++) { uv[(i + k) * 2] = 0; uv[(i + k) * 2 + 1] = 0; } continue; }
      n.normalize();
      if (Math.abs(n.y) > 0.97) { t.set(1, 0, 0); b.set(0, 0, 1); }
      else { t.crossVectors(up, n).normalize(); b.crossVectors(n, t); if (b.y < 0) b.negate(); }
      let swap = false;
      if (isWood && Math.abs(t.dot(grainDir)) > Math.abs(b.dot(grainDir))) swap = true;
      for (let k = 0; k < 3; k++) {
        const p = k === 0 ? p0 : k === 1 ? p1 : p2;
        _a[0] = p.dot(t) * toMeters; _a[1] = p.dot(b) * toMeters;
        uv[(i + k) * 2] = swap ? _a[1] : _a[0]; uv[(i + k) * 2 + 1] = swap ? _a[0] : _a[1];
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    o.geometry = geo;
    o.material = texturedFor(THREE, M, key);
  }
}
