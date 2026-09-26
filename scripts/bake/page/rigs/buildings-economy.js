// Lote "economia" da Etapa 3 (docs/ART.md Apêndice D): fazenda, celeiro, serraria, mina, mercado, academia e cornucópia.
// Mesmo contrato de page/buildings.js (que registra estes estilos em BUILDERS): modelos em METROS com a origem no centro
// da área ocupada, chão em y = 0, +x = leste, +z = sul (de frente para a câmera); `p.stage` 0–2 = obra (< 33 / < 66 /
// < 100 %), 3 = pronto; `p.damage` 0–2 (o dano genérico — rachaduras, buracos no telhado, fuligem, peças quebráveis
// caídas, entulho — é aplicado depois por buildings.js; aqui só o que é próprio do edifício: plantação queimada, toras
// roladas, cavalete tombado…); `p.variant` = plantação da fazenda (sown/growing/ripe).
// Nada abaixo de y = 0 (o passe de cor não tem chão: o que afundasse apareceria "abaixo" do chão na tela). As faces sul
// ficam na meia-sombra (sol de noroeste): fachadas claras. Sem Math.random: sementes por estilo/variante — não por
// estado, para o dano partir do mesmo modelo do `complete`.

const TAU = Math.PI * 2;
function seedOf(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// =================================================================================================================
// Materiais do lote (aqui e não em materials.js: mudar aquele arquivo invalidaria o cache de todos os assets)

const XM = new WeakMap();
function mats(k) {
  let x = XM.get(k.M);
  if (x) return x;
  const { THREE, M } = k;
  const std = (color, roughness, metalness = 0, more = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...more });
  const goldIn = M.gold.clone(); goldIn.side = THREE.DoubleSide;   // chifre aberto: o interior também aparece
  x = {
    soil: std(0x7a5c3d, 1), soilDark: std(0x55402a, 1),                   // camalhões de terra lavrada e o fundo dos sulcos
    sprout: std(0x86a24a, 0.9), crop: std(0x5f8a36, 0.9), cropDark: std(0x4d7231, 0.9),
    wheat: std(0xd2ac52, 0.85), wheatHead: std(0xb8903e, 0.9), straw: std(0xc6a866, 0.95), stubble: std(0xa88f5a, 1),
    woodLight: std(0xdcb880, 0.85),                                       // madeira recém-cortada (topo das toras, tábuas)
    apple: std(0xa83a2a, 0.55), pear: std(0xa2ab4c, 0.6), grape: std(0x51305a, 0.45), pomegranate: std(0x962a33, 0.5),
    dark: std(0x17120e, 1),                                               // boca da mina, poço, porta aberta
    goldIn,
  };
  XM.set(k.M, x);
  return x;
}

// =================================================================================================================
// Peças do lote

/** Bandeirola de time numa estaca (obra de edifícios sem andaime: fazenda, serraria, mina). */
function pennant(k, x, z, h = 1.2) {
  k.cyl(0.025, 0.03, h, k.M.wood, x, 0, z, 6);
  k.box(0.4, 0.26, 0.03, k.M.team, x + 0.22, h - 0.16, z);
}

/** Tora com casca e os topos claros; `axis` 'z' (topo virado para a câmera) ou 'x'. y = centro. */
function log(k, x, y, z, r, L, axis = 'z') {
  const { THREE, M } = k;
  const X = mats(k);
  const m = k.mesh(new THREE.CylinderGeometry(r, r * 1.04, L, 10), [M.bark, X.woodLight, X.woodLight], x, y, z);
  if (axis === 'z') m.rotation.x = Math.PI / 2; else m.rotation.z = Math.PI / 2;
  return m;
}

/** Saco de linho em pé (boca amarrada). */
function sack(k, x, z, s = 1, mat = null) {
  const { THREE, M } = k;
  const body = k.mesh(new THREE.SphereGeometry(0.21 * s, 10, 8), mat ?? M.linenDark, x, 0.25 * s, z);
  body.scale.set(1, 1.18, 0.82);
  k.cyl(0.05 * s, 0.09 * s, 0.1 * s, mat ?? M.linenDark, x, 0.46 * s, z, 8);
  return body;
}

/** Pithos (jarra de armazenar grão/azeite) de terracota com borda; `s` = escala. */
function pithos(k, x, z, s = 1) {
  const { THREE, M } = k;
  const body = k.mesh(new THREE.SphereGeometry(0.3 * s, 12, 10), M.terracotta, x, 0.36 * s, z);
  body.scale.set(1, 1.2, 1);
  k.cyl(0.13 * s, 0.16 * s, 0.1 * s, M.terracotta, x, 0.7 * s, z, 10);
  k.cyl(0.17 * s, 0.17 * s, 0.05 * s, M.terracottaDark, x, 0.8 * s, z, 10);
  return body;
}

/** Ânfora de terracota com a base em y (prateleiras, mesas); `parent` opcional. */
function amph(k, x, y, z, s = 1, parent) {
  const m = k.mesh(new k.THREE.SphereGeometry(0.16 * s, 10, 8), k.M.terracotta, x, y + 0.24 * s, z, parent);
  m.scale.set(1, 1.5, 1);
  k.cyl(0.05 * s, 0.07 * s, 0.14 * s, k.M.terracotta, x, y + 0.46 * s, z, 8, parent);
  return m;
}

/** Cesto de vime com conteúdo (`fill`: material das frutas/grãos) no topo. */
function basket(k, x, z, r = 0.2, h = 0.26, fill = null) {
  const { THREE, M } = k;
  k.cyl(r, r * 0.8, h, M.wicker, x, 0, z, 12);
  if (fill) { const top = k.mesh(new THREE.SphereGeometry(r * 0.92, 10, 6, 0, TAU, 0, Math.PI / 2), fill, x, h - 0.02, z); top.scale.y = 0.45; }
}

/** Frutas soltas: esfera de raio `r` pousada em y0. */
function fruit(k, x, y0, z, r, mat) { return k.mesh(new k.THREE.SphereGeometry(r, 8, 6), mat, x, y0 + r * 0.92, z); }

/** Cacho de uvas (bolinhas em cone) com o topo em (x, yTop, z). */
function grapes(k, x, yTop, z, s = 1) {
  const X = mats(k);
  const rows = [4, 3, 2, 1];
  let y = yTop;
  for (let i = 0; i < rows.length; i++) {
    const n = rows[i], rr = 0.045 * s * (n - 1) * 0.55;
    for (let j = 0; j < n; j++) { const a = (j / n) * TAU + i; fruit(k, x + Math.cos(a) * rr, y - 0.05 * s, z + Math.sin(a) * rr, 0.045 * s, X.grape); }
    y -= 0.07 * s;
  }
}

/** Feixe de trigo (medas) em pé: molho de palha amarrado com as espigas abertas no topo. */
function sheaf(k, x, z, s = 1) {
  const { THREE, M } = k;
  const X = mats(k);
  k.cyl(0.1 * s, 0.16 * s, 0.45 * s, X.straw, x, 0, z, 8);
  k.cyl(0.11 * s, 0.11 * s, 0.05 * s, M.rope, x, 0.3 * s, z, 8);
  const top = k.mesh(new THREE.ConeGeometry(0.17 * s, 0.26 * s, 8), X.wheatHead, x, 0.58 * s, z);
  top.rotation.x = Math.PI;
}

/**
 * Toldo de pano inclinado sobre 4 esteios: cobre [x0,x1]×[z0,z1], alto atrás (z0, yBack) e baixo na frente (z1, yFront),
 * com uma sanefa pendurada na frente. `stripes` = material das listras (null = liso).
 */
function awning(k, { x0, x1, z0, z1, yBack, yFront, mat, stripes = null, posts = true, cloth = true }) {
  const { THREE, M } = k;
  if (posts) {
    for (const x of [x0 + 0.06, x1 - 0.06]) { k.cyl(0.035, 0.04, yBack, M.wood, x, 0, z0 + 0.06, 6); k.cyl(0.035, 0.04, yFront, M.wood, x, 0, z1 - 0.06, 6); }
    k.box(x1 - x0, 0.06, 0.06, M.wood, (x0 + x1) / 2, yFront - 0.03, z1 - 0.06);
    k.box(x1 - x0, 0.06, 0.06, M.wood, (x0 + x1) / 2, yBack - 0.03, z0 + 0.06);
  }
  if (!cloth) return null;
  const dz = z1 - z0, dy = yFront - yBack, L = Math.sqrt(dz * dz + dy * dy);
  const g = new THREE.Group(); g.position.set((x0 + x1) / 2, (yBack + yFront) / 2 + 0.03, (z0 + z1) / 2); g.rotation.x = Math.atan2(-dy, dz); k.r.add(g);
  const w = x1 - x0 + 0.1;
  const slab = k.box(w, 0.03, L + 0.08, mat, 0, 0, 0, g); slab.userData.roof = true;
  if (stripes) { const n = Math.max(3, Math.round(w / 0.32)); for (let i = 0; i < n; i += 2) k.box(w / n, 0.035, L + 0.08, stripes, -w / 2 + (i + 0.5) * (w / n), 0.002, 0, g); }
  // sanefa: faixa pendurada na frente, em "dentes"
  const nt = Math.max(3, Math.round(w / 0.3));
  for (let i = 0; i < nt; i++) {
    const m = (stripes && i % 2) ? stripes : mat;
    k.box(w / nt - 0.02, 0.2, 0.025, m, (x0 + x1) / 2 - w / 2 + (i + 0.5) * (w / nt), yFront - 0.1, z1 + 0.04);
  }
  return g;
}

/** Cúpula de silo "colmeia" (perfil de ogiva por LatheGeometry) de raio r e altura h sobre y0; `upTo` < 1 = em obra. */
function beehive(k, x, z, y0, r, h, mat, upTo = 1) {
  const { THREE } = k;
  const pts = [];
  const n = 14, last = Math.round(n * upTo);
  for (let i = 0; i <= last; i++) { const t = i / n; pts.push(new THREE.Vector2(r * Math.pow(Math.max(0, 1 - t * t), 0.55), t * h)); }
  if (upTo >= 1) pts[pts.length - 1].x = 0;
  return k.mesh(new THREE.LatheGeometry(pts, 24), mat, x, y0, z);
}

/** Geometria de rocha: icosaedro com os vértices deslocados por semente (os repetidos juntos, sem rachar), base
 *  cortada em `cut` (unidades locais) para não afundar no chão. */
function rockGeo(THREE, R, cut = -0.35) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position, jit = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`;
    if (!jit.has(key)) jit.set(key, 0.8 + R() * 0.34);
    const f = jit.get(key);
    pos.setXYZ(i, x * f, Math.max(cut, y * f), z * f);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Geometria de tubo com raio variável ao longo de uma curva (o chifre da cornucópia): anéis de `seg` vértices em n + 1
 * pontos da curva (referencial de Frenet), faces viradas para fora; só o trecho [t0, t1] (obra, fita).
 */
function taperedTube(THREE, curve, n, seg, rOf, t1 = 1, t0 = 0) {
  const frames = curve.computeFrenetFrames(n, false);
  const pos = [], nor = [], idx = [];
  const first = Math.round(n * t0), last = Math.max(first + 1, Math.round(n * t1));
  for (let i = first; i <= last; i++) {
    const t = i / n, P = curve.getPointAt(t), r = rOf(t), N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= seg; j++) {
      const v = (j / seg) * TAU, c = Math.cos(v), s = Math.sin(v);
      const nx = c * N.x + s * B.x, ny = c * N.y + s * B.y, nz = c * N.z + s * B.z;
      pos.push(P.x + r * nx, P.y + r * ny, P.z + r * nz); nor.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < last - first; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = (i + 1) * (seg + 1) + j;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Oliveira pequena (tronco torto + copa de esferas cinza-esverdeadas), ≈ 2,2 m. */
function olive(k, x, z, R, s = 1) {
  const { THREE, M } = k;
  let px = x, py = 0, pz = z;
  for (let i = 0; i < 3; i++) {
    const h = 0.42 * s, dx = (R() - 0.5) * 0.2 * s, dz = (R() - 0.5) * 0.16 * s;
    const seg = k.cyl(0.07 * s * (1 - i * 0.18), 0.09 * s * (1 - i * 0.18), h, M.bark, px + dx / 2, py, pz + dz / 2, 7);
    seg.rotation.set(dz * 1.4, 0, -dx * 1.4);
    px += dx; py += h * 0.92; pz += dz;
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + R(), rr = i === 0 ? 0 : 0.42 * s;
    const c = k.mesh(new THREE.IcosahedronGeometry((0.34 + R() * 0.12) * s, 1), i % 2 ? M.olive : M.olive2, px + Math.cos(a) * rr, py + 0.25 * s + R() * 0.3 * s, pz + Math.sin(a) * rr * 0.8);
    c.scale.y = 0.75;
  }
}

// =================================================================================================================
// Estilos

export const ECONOMY_BUILDERS = {};
const B = ECONOMY_BUILDERS;

// ---- Fazenda 2×2 (4×4 m), plana e pisável: leito de terra lavrada com sulcos leste-oeste (a câmera os lê como
//      faixas), cerca baixa de estacas e travessas (vão ao sul) e a plantação da variante — 'sown' (sulcos com brotos),
//      'growing' (touceiras verdes), 'ripe' (trigo dourado, a fileira da frente já ceifada com medas). Espantalho com
//      túnica de time no canto noroeste. Obra: estacas, arado e o campo sendo lavrado de norte a sul. Dano: manchas de
//      plantação queimada/pisoteada, espantalho tombado. Tudo baixo (≤ 1,8 m): o renderizador desenha a fazenda na borda
//      de cima da pegada, sob o cidadão que colhe. ----
B.farm = (k, p) => {
  const { M, box, block } = k;
  const X = mats(k);
  const st = p.stage, dmg = p.damage ?? 0;
  const crop = p.variant === 'ripe' ? 2 : p.variant === 'growing' ? 1 : 0;
  const R = rng(seedOf(`farm/${crop}`));
  k.debris = { x0: -1.9, x1: 1.9, z0: -1.9, z1: 1.9 };
  k.debrisMats = [X.soilDark, X.straw, M.wood];
  const E = 1.9;                                   // meia-largura da cerca
  const rows = Array.from({ length: 9 }, (_, i) => -1.6 + i * 0.4);
  // quanto do campo já foi lavrado (de norte a sul) na obra
  const plowZ = [-0.75, 0.45, 2, 2][st];
  // fundo dos sulcos (escuro) e camalhões arredondados em trechos de comprimento variado, com torrões: terra solta,
  // não tábuas (mesma terra em todas as variantes e estados)
  const P = rng(seedOf('farm/soil'));
  block(-1.8, 1.8, 0, 0.012, -1.8, Math.min(1.8, plowZ), X.soilDark);
  for (const z of rows) {
    for (let x = -1.74; x < 1.72;) {
      const x1 = Math.min(1.74, x + 0.45 + P() * 0.4), dz = (P() - 0.5) * 0.04, w = 0.62 + P() * 0.2, hh = 0.5 + P() * 0.2;
      if (z < plowZ) {
        const m = k.mesh(new k.THREE.CylinderGeometry(0.13, 0.13, x1 - x + 0.05, 8, 1, false, 0, Math.PI), X.soil, (x + x1) / 2, 0.012, z + dz);
        m.rotation.z = Math.PI / 2; m.scale.set(hh, 1, w);
      }
      x = x1;
    }
    for (let i = 0; i < 5; i++) {
      const cx = -1.7 + P() * 3.4, cz = z + 0.2 + (P() - 0.5) * 0.06, cs = 0.03 + P() * 0.03;
      if (z + 0.2 < plowZ && z < 1.5) k.mesh(new k.THREE.IcosahedronGeometry(cs, 0), i % 2 ? X.soil : X.soilDark, cx, cs * 0.6, cz).rotation.set(P() * 3, P() * 3, 0);
    }
  }
  // manchas de dano (queimada/pisoteada): a 1ª no nível 1, as três no nível 2
  const burns = [[0.75, -0.35, 0.72], [-0.55, 0.95, 0.62], [1.3, 1.25, 0.5]].slice(0, dmg === 2 ? 3 : dmg);
  const burnt = (x, z) => burns.some(([bx, bz, br]) => (x - bx) * (x - bx) + (z - bz) * (z - bz) < br * br);
  const scare = { x: -1.25, z: -1.15 };
  const nearScare = (x, z) => (x - scare.x) * (x - scare.x) + (z - scare.z) * (z - scare.z) < 0.12;
  if (st === 3) {
    for (let ri = 0; ri < rows.length; ri++) {
      const z = rows[ri];
      for (let x = -1.62; x < 1.66; x += crop === 0 ? 0.21 : crop === 1 ? 0.3 : 0.26) {
        const jx = x + (R() - 0.5) * 0.06, jz = z + (R() - 0.5) * 0.05, rh = R(), rt = R();
        if (nearScare(jx, jz)) continue;
        if (burnt(jx, jz)) {
          // restolho queimado e palha caída
          if (rh < 0.6) box(0.1, 0.05 + rh * 0.06, 0.08, M.char, jx, 0.1, jz).rotation.y = rt * 3;
          else if (crop > 0) box(0.28, 0.025, 0.06, X.stubble, jx, 0.09, jz).rotation.y = rt * 3;
          continue;
        }
        if (crop === 0) {
          // brotos: dois pares de folhinhas em V
          for (const s of [-1, 1]) { const b = box(0.05, 0.1 + rh * 0.05, 0.04, X.sprout, jx + s * 0.025, 0.11, jz); b.rotation.z = s * 0.45; }
        } else if (crop === 1) {
          // touceiras verdes: 2–3 cones
          for (let c = 0; c < 3; c++) {
            const h = 0.3 + R() * 0.2, cc = k.mesh(new k.THREE.ConeGeometry(0.08, h, 5), c % 2 ? X.cropDark : X.crop, jx + (c - 1) * 0.07, 0.09 + h / 2, jz + (R() - 0.5) * 0.06);
            cc.rotation.set((R() - 0.5) * 0.3, R() * 3, (R() - 0.5) * 0.4);
          }
        } else {
          // trigo maduro: colmo dourado com a faixa das espigas por cima; a fileira da frente ceifada à leste
          if (ri === rows.length - 1 && x > -0.2) { box(0.22, 0.07, 0.16, X.stubble, jx, 0.12, jz); continue; }
          const h = 0.72 + rh * 0.16;
          const stalk = box(0.26, h - 0.12, 0.24, X.wheat, jx, 0.09 + (h - 0.12) / 2, jz);
          stalk.rotation.z = (rt - 0.5) * 0.12;
          box(0.29, 0.14, 0.27, X.wheatHead, jx + (rt - 0.5) * 0.06, 0.09 + h - 0.06, jz).rotation.y = (rh - 0.5) * 0.5;
        }
      }
    }
    if (crop === 2) { sheaf(k, 0.55, 1.62); sheaf(k, 1.15, 1.5, 0.95); sheaf(k, 1.6, 1.68, 0.9); }
    // espantalho: poste, travessa com as mangas de palha, túnica de time, cabeça de palha e chapéu (pétaso)
    const tilt = dmg === 2 ? 0.38 : 0;
    const g = new k.THREE.Group(); g.position.set(scare.x, 0.09, scare.z); g.rotation.z = -tilt; k.r.add(g);
    k.cyl(0.035, 0.04, 1.62, M.wood, 0, 0, 0, 6, g);
    k.box(0.95, 0.05, 0.05, M.wood, 0, 1.22, 0, g);
    k.box(0.4, 0.55, 0.14, M.team, 0, 1.0, 0.02, g);
    for (const s of [-1, 1]) { const t = k.mesh(new k.THREE.ConeGeometry(0.06, 0.2, 6), X.straw, s * 0.5, 1.2, 0, g); t.rotation.z = s * Math.PI / 2; }
    k.mesh(new k.THREE.SphereGeometry(0.12, 8, 6), X.straw, 0, 1.5, 0, g);
    k.cyl(0.22, 0.22, 0.03, X.stubble, 0, 1.6, 0, 12, g); k.cyl(0.05, 0.09, 0.1, X.stubble, 0, 1.63, 0, 8, g);
  } else if (st === 2) {
    // campo lavrado, sacos de semente
    sack(k, 1.25, 1.35); sack(k, 1.55, 1.2, 0.9);
  }
  // cerca: estacas a cada ~0,95 m, duas travessas; vão ao sul no meio. Obra: estacas (1), travessas norte/oeste (2).
  const posts = [];
  for (let i = 0; i <= 4; i++) { const t = -E + i * (E / 2); posts.push([t, -E], [-E, t], [E, t]); if (Math.abs(t) > 0.1) posts.push([t, E]); }
  const uniq = new Map(posts.map(([x, z]) => [`${x.toFixed(2)},${z.toFixed(2)}`, [x, z]]));
  if (st >= 1) for (const [x, z] of uniq.values()) box(0.07, 0.62, 0.07, M.woodDark, x, 0.31, z);
  else for (const [x, z] of [[-E, -E], [E, -E], [-E, E], [E, E]]) box(0.06, 0.5, 0.06, M.woodDark, x, 0.25, z);
  if (st >= 2) {
    const seg = (x0, z0, x1, z1) => {
      for (const y of [0.28, 0.52]) {
        const len = Math.sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0));
        const r = box(x0 === x1 ? 0.04 : len, 0.045, z0 === z1 ? 0.04 : len, M.wood, (x0 + x1) / 2, y, (z0 + z1) / 2);
        if (st === 3) k.breakable(r);
      }
    };
    for (let i = 0; i < 4; i++) {
      const a = -E + i * (E / 2), b = a + E / 2;
      seg(a, -E, b, -E); seg(-E, a, -E, b);
      if (st === 3) { seg(E, a, E, b); if (i === 0 || i === 3) seg(a, E, b, E); else if (i === 1) seg(a, E, -0.5, E); else seg(0.5, E, b, E); }
    }
  }
  if (st <= 2) {
    // arado (ara) de madeira com relha de ferro, rolo de estacas e bandeirola de time
    const ax = [0.5, 0.9, -0.9][st], az = [-0.45, 0.75, 1.3][st];
    const beam = box(1.3, 0.07, 0.07, M.wood, ax, 0.32, az); beam.rotation.z = 0.35;
    box(0.08, 0.36, 0.08, M.woodDark, ax - 0.55, 0.18, az);
    box(0.22, 0.05, 0.08, M.iron, ax - 0.66, 0.03, az);
    if (st < 2) for (let i = 0; i < 3; i++) box(1.1, 0.06, 0.06, M.wood, 1.15, 0.03 + i * 0.07, 1.15 + i * 0.04).rotation.y = 0.2 + i * 0.05;
    pennant(k, -E - 0.05, E + 0.05);
  }
};

// ---- Celeiro 2×2 (4×4 m): armazém (sitobolon) no fundo a oeste sobre soco alto de pedra (piso elevado contra umidade
//      e ratos), paredes de reboco com respiros altos, telhado de duas águas leste-oeste; dois silos redondos de cúpula
//      ("colmeia") a leste, o maior com escada; na frente, degraus até a porta, sacos, cesto de grão e pithoi.
//      Estandarte de time na fachada. ----
B.granary = (k, p) => {
  const { M, block } = k;
  const X = mats(k);
  const st = p.stage;
  k.debris = { x0: -1.95, x1: 1.9, z0: -1.9, z1: 1.45 };
  k.debrisMats = [M.plaster, M.stoneWarm, M.plasterDark];
  const x0 = -1.9, x1 = 0.5, z0 = -1.85, z1 = 0.2, T = 0.2, base = 0.45, wallH = 2.0;
  const wf = [0.22, 0.6, 1, 1][st];
  // soco de pedra em duas fiadas
  block(x0 - 0.05, x1 + 0.05, 0, st >= 1 ? base : 0.25, z0 - 0.05, z1 + 0.05, M.stoneWarm);
  if (st >= 1) block(x0 - 0.06, x1 + 0.06, 0.22, 0.25, z0 - 0.06, z1 + 0.06, M.stoneDark);
  const b0 = st >= 1 ? base : 0.25;
  const h = wallH * wf;
  const dX0 = -1.05, dX1 = -0.35, dH = 1.55;
  k.room(x0, x1, z0, z1, b0, h, T, M.plaster, [dX0, dX1, dH]);
  if (st >= 1) block(x0 + T, x1 - T, b0, b0 + 0.02, z0 + T, z1 - T, M.woodDark);   // piso escuro visto pela porta
  const eaves = b0 + wallH, cz = (z0 + z1) / 2;
  if (st >= 2) {
    // respiros altos (fendas) e cinta de reboco no topo; verga da porta
    for (const x of [-1.55, 0.32]) block(x - 0.04, x + 0.04, b0 + 1.45, b0 + 1.8, z1 - 0.005, z1 + 0.012, X.dark);
    block(x0 - 0.03, x1 + 0.03, eaves - 0.12, eaves, z0 - 0.03, z1 + 0.03, M.plasterDark);
    block(dX0 - 0.06, dX1 + 0.06, b0 + dH, b0 + dH + 0.1, z1 - T - 0.02, z1 + 0.04, M.wood);
    block(dX0 + 0.03, dX1 - 0.03, b0, b0 + dH - 0.02, z1 - T + 0.05, z1 - T + 0.09, M.woodDark);   // porta (aberta pela metade)
  }
  if (st === 2) k.gable({ cx: (x0 + x1) / 2, cz, axis: 'x', w: z1 - z0 + 0.5, len: x1 - x0 + 0.3, y: eaves, rise: 0.85, frame: true });
  if (st === 3) {
    k.gable({ cx: (x0 + x1) / 2, cz, axis: 'x', w: z1 - z0 + 0.55, len: x1 - x0 + 0.25, y: eaves, rise: 0.85, ped: M.plaster, nRows: 6 });
    // viga de guincho saindo da empena leste, com roldana e corda
    block(x1 + 0.1, x1 + 0.45, eaves + 0.25, eaves + 0.35, cz - 0.05, cz + 0.05, M.woodDark);
    k.cyl(0.06, 0.06, 0.05, M.wood, x1 + 0.4, eaves + 0.16, cz, 10);
    k.cyl(0.01, 0.01, 0.9, M.rope, x1 + 0.4, eaves - 0.75, cz + 0.06, 4);
    // estandarte de time na fachada, à direita da porta
    k.box(0.42, 0.78, 0.03, M.team, -0.02, b0 + 1.05, z1 + 0.03);
    k.box(0.5, 0.05, 0.05, M.wood, -0.02, b0 + 1.46, z1 + 0.05);
  }
  // degraus de pedra até a porta
  if (st >= 1) for (let i = 0; i < 3; i++) block(dX0 - 0.1, dX1 + 0.1, 0, base - i * 0.15, z1, z1 + 0.2 * (i + 1) + 0.02, i % 2 ? M.stoneWarm : M.stoneLight);
  // silos: tambor de pedra/reboco + cúpula colmeia; finial quebrável
  // (calcário quente, não o branco do reboco: a cúpula na meia-sombra ficava cinza), fiadas marcadas na cúpula
  const silo = (x, z, r, drumH, domeH) => {
    k.cyl(r + 0.04, r + 0.06, 0.3, M.stoneWarm, x, 0, z, 20);
    if (st === 0) return;
    const dh = st === 1 ? drumH * 0.6 : drumH;
    k.cyl(r, r + 0.02, dh, M.limestone, x, 0.3, z, 24);
    if (st === 1) return;
    beehive(k, x, z, 0.3 + drumH, r, domeH, M.limestone, st === 2 ? 0.55 : 1);
    if (st === 3) {
      k.cyl(r + 0.015, r + 0.015, 0.06, M.limestoneDark, x, 0.3 + drumH - 0.03, z, 24);
      for (const t of [0.3, 0.58]) {
        const ring = k.mesh(new k.THREE.TorusGeometry(r * Math.pow(1 - t * t, 0.55) + 0.005, 0.018, 5, 28), M.limestoneDark, x, 0.3 + drumH + t * domeH, z);
        ring.rotation.x = Math.PI / 2;
      }
      k.breakable(k.mesh(new k.THREE.SphereGeometry(0.075, 8, 6), M.stoneLight, x, 0.3 + drumH + domeH + 0.04, z));
    }
  };
  silo(1.2, -0.9, 0.74, 0.6, 1.05);
  silo(1.38, 0.92, 0.52, 0.45, 0.78);
  if (st === 3) {
    // escada encostada no silo grande até a escotilha
    const g = new k.THREE.Group(); g.position.set(1.2, 0, 0.3); g.rotation.x = -0.38; k.r.add(g);
    for (const s of [-1, 1]) k.box(0.04, 1.62, 0.04, M.wood, s * 0.17, 0.8, 0, g);
    for (let i = 0; i < 5; i++) k.box(0.34, 0.03, 0.03, M.wood, 0, 0.25 + i * 0.29, 0, g);
    block(1.08, 1.32, 1.42, 1.64, -0.35, -0.27, X.dark);
    // frente: pithoi, sacos, cesto de grão
    k.breakable(pithos(k, -1.55, 0.92, 0.9)); k.breakable(pithos(k, -1.62, 1.45, 0.75));
    sack(k, 0.02, 0.72); sack(k, 0.32, 0.92, 0.92); sack(k, -0.12, 1.12, 0.85); sack(k, 0.5, 0.55, 0.8);
    basket(k, 0.62, 1.3, 0.2, 0.24, X.wheat);
  } else {
    k.scaffold({ x0: x0 - 0.25, x1: x1 + 0.25, z0: z0 - 0.25, z1: z1 + 0.3, h: [1.3, 2.3, 3.4][st] });
    k.pile(0.2, 1.35, M.plasterDark);
  }
};

// ---- Serraria 2×2 (4×4 m): galpão aberto ao sul no fundo (parede de tábuas, esteios, telhado de uma água em telha),
//      tábuas serradas e toras sob o telhado; pilha de toras com os topos claros virados para a câmera a leste, cavalete
//      com uma tora e o serrote de dois cabos, cepo com machado e cavacos; estandarte de time. Dano: toras roladas da
//      pilha, cavalete tombado. ----
B.lumber_camp = (k, p) => {
  const { M, box, block } = k;
  const X = mats(k);
  const st = p.stage, dmg = p.damage ?? 0;
  const R = rng(seedOf('lumber_camp'));
  k.debris = { x0: -1.95, x1: 1.95, z0: -1.9, z1: 1.7 };
  k.debrisMats = [M.wood, X.woodLight, M.bark];
  const sx0 = -1.9, sx1 = 1.3, sz0 = -1.9, sz1 = -0.35;
  const postH = [0.9, 2.15, 2.15, 2.15][st];
  // esteios (frente baixa, fundo alto)
  for (const x of [sx0 + 0.08, -0.3, sx1 - 0.08]) {
    k.cyl(0.07, 0.08, postH, M.wood, x, 0, sz1, 8);
    k.cyl(0.07, 0.08, st === 0 ? postH : 2.62, M.wood, x, 0, sz0 + 0.12, 8);
  }
  // parede de tábuas no fundo (norte) e a oeste
  const wallH = [0, 1.2, 2.6, 2.6][st];
  if (wallH > 0) {
    for (let x = sx0, i = 0; x < sx1 - 0.01; x += 0.27, i++) block(x, Math.min(sx1, x + 0.26), 0, wallH, sz0, sz0 + 0.07, i % 2 ? M.woodDark : M.wood);
    for (let z = sz0 + 0.07, i = 0; z < sz1 - 0.3; z += 0.27, i++) block(sx0, sx0 + 0.07, 0, Math.min(wallH, 2.55 - (z - sz0) * 0.3), z, Math.min(sz1 - 0.3, z + 0.26), i % 2 ? M.wood : M.woodDark);
  }
  if (st >= 2) {
    k.box(sx1 - sx0, 0.12, 0.12, M.woodDark, (sx0 + sx1) / 2, 2.15, sz1);        // viga da frente
    k.shed({ x0: sx0 - 0.1, x1: sx1 + 0.1, zHigh: sz0 - 0.05, zLow: sz1 + 0.2, yHigh: 2.68, yLow: 2.16, frame: st === 2, nRows: 5 });
  }
  if (st === 3) {
    // sob o telhado: tábuas serradas empilhadas e toras deitadas
    for (let i = 0; i < 6; i++) block(-1.75, -0.45, 0.02 + i * 0.07, 0.08 + i * 0.07, -1.55 + (i % 2) * 0.03, -1.05 + (i % 2) * 0.03, i % 2 ? X.woodLight : M.wood);
    for (let i = 0; i < 3; i++) log(k, 0.25 + i * 0.32, 0.15, -1.2, 0.14, 1.2, 'z');
    log(k, 0.41, 0.4, -1.2, 0.13, 1.15, 'z');
  }
  // pilha de toras (topos para a câmera): 4-3-2-1; obra: só as fileiras de baixo
  const nRows = [0, 1, 2, 4][st];
  const r = 0.17, L = 1.0, cz = 0.85, logs = [];
  for (let row = 0; row < nRows; row++) for (let i = 0; i < 4 - row; i++) {
    const x = 0.72 + (i + row * 0.5) * (2 * r + 0.02), y = r + row * (r * 1.72);
    logs.push({ x, y, row, m: log(k, x, y, cz + (R() - 0.5) * 0.12, r * (0.92 + R() * 0.12), L, 'z') });
  }
  if (nRows) for (const x of [0.5, 1.98]) box(0.08, 0.55, 0.08, M.woodDark, x, 0.27, cz + 0.4);
  if (st === 3 && dmg) {
    // dano: as toras de cima rolam para o chão em frente à pilha
    const fall = logs.filter((l) => l.row >= (dmg === 2 ? 2 : 3));
    fall.forEach((l, i) => { l.m.position.set(1.0 + i * 0.28, r, 1.6 + (i % 2) * 0.12); l.m.rotation.set(Math.PI / 2, 0, 0); l.m.rotateZ(0.35 + i * 0.3); });
  }
  // cavalete com tora e serrote; no dano 2 o cavalete tomba para a frente e a tora rola para trás
  if (st >= 2) {
    const g = new k.THREE.Group(); g.position.set(-0.75, 0, 0.72); k.r.add(g);
    for (const s of [-1, 1]) for (const t of [-1, 1]) { const l = k.box(0.05, 0.85, 0.05, M.wood, s * 0.5, 0.4, t * 0.13, g); l.rotation.x = t * 0.32; }
    k.box(1.2, 0.07, 0.07, M.woodDark, 0, 0.78, 0, g);
    if (st === 3 && dmg < 2) {
      const lg = log(k, 0, 0.97, 0, 0.13, 1.5, 'x'); g.add(lg); lg.position.set(0, 0.97, 0);
      k.box(0.02, 0.2, 0.75, M.iron, 0.25, 1.0, 0, g).rotation.x = 0.1;           // lâmina do serrote
      for (const s of [-1, 1]) k.box(0.03, 0.2, 0.03, M.wood, 0.25, 1.1, s * 0.4, g);
    }
    if (dmg === 2) { g.rotation.x = 1.4; g.position.y = 0.08; log(k, -0.7, 0.13, 0.3, 0.13, 1.5, 'x').rotation.y = 0.2; }
  }
  if (st === 3) {
    // cepo com machado e cavacos
    k.mesh(new k.THREE.CylinderGeometry(0.24, 0.27, 0.42, 12), [M.bark, X.woodLight, X.woodLight], -1.58, 0.21, 1.62);
    const ax = new k.THREE.Group(); ax.position.set(-1.53, 0.42, 1.62); ax.rotation.set(0.2, 0.3, -0.55); k.r.add(ax);
    k.cyl(0.02, 0.022, 0.7, M.wood, 0, 0, 0, 6, ax); k.box(0.2, 0.12, 0.03, M.iron, 0.05, 0.04, 0, ax);
    for (let i = 0; i < 12; i++) { const a = R() * TAU, d = 0.3 + R() * 0.4; box(0.07, 0.015, 0.04, X.woodLight, -1.58 + Math.cos(a) * d, 0.01, 1.62 + Math.sin(a) * d * 0.7).rotation.y = R() * 3; }
    k.banner(0.28, 1.72, 2.2, -1, [0.46, 0.72]);
  } else {
    pennant(k, sx0 - 0.02, 1.8);
    for (let i = 0; i < st + 1; i++) log(k, -0.8 + i * 0.34, 0.14, 1.35, 0.13, 1.3, 'x');
  }
};

// ---- Mina 2×2 (4×4 m): morro de rochas claras com a galeria escorada em madeira aberta ao sul (boca escura), veios
//      de ouro nas faces, poço com sarilho, caçamba e carrinho de minério com pepitas, cestos; estandarte de time.
//      Obra: estacas, primeiras rochas e o escoramento subindo. ----
B.mine = (k, p) => {
  const { THREE, M, box, block } = k;
  const X = mats(k);
  const st = p.stage;
  const R = rng(seedOf('mine'));
  k.debris = { x0: -1.95, x1: 1.95, z0: -1.9, z1: 1.6 };
  k.debrisMats = [M.stoneWarm, M.stone, M.stoneLight];
  // rochas do morro: (x, z, raio, altura, escala z, estágio mínimo)
  const rocks = [
    [-1.15, -1.25, 0.85, 1.75, 0.9, 0], [0.1, -1.35, 0.95, 2.15, 0.85, 0], [1.25, -1.2, 0.8, 1.55, 0.95, 0],
    [-1.35, -0.2, 0.7, 1.3, 0.9, 1], [1.35, -0.25, 0.66, 1.2, 0.9, 1], [-0.55, -0.55, 0.7, 2.1, 0.8, 1],
    [0.6, -0.6, 0.72, 2.0, 0.8, 1], [0.05, -0.85, 0.7, 2.9, 0.8, 2], [-0.85, 0.2, 0.5, 0.9, 0.8, 2], [0.9, 0.2, 0.5, 0.85, 0.8, 2],
  ];
  const rockMats = [M.stoneWarm, M.stoneLight, M.stoneWarm, M.stone];
  const solid = [];
  for (let i = 0; i < rocks.length; i++) {
    const [x, z, rr, hh, sz, from] = rocks[i];
    const g = rockGeo(THREE, R, -0.25), yaw = R() * 3;
    if (st < from) continue;
    const m = k.mesh(g, rockMats[i % rockMats.length], x, 0.25 * (hh / 2), z);
    m.scale.set(rr, hh / 2, rr * sz); m.rotation.y = yaw;
    solid.push(m);
  }
  // galeria: boca escura recuada, escoramento (esteios + verga) e soleira de terra
  const dx = 0.42;
  if (st >= 1) block(-dx, dx, 0, 1.45, 0.05, 0.42, X.dark);
  if (st >= 1) for (const s of [-1, 1]) block(s * dx - 0.08, s * dx + 0.08, 0, st >= 2 ? 1.6 : 1.1, 0.35, 0.51, M.wood);
  if (st >= 2) k.breakable(block(-dx - 0.2, dx + 0.2, 1.6, 1.78, 0.3, 0.52, M.woodDark));
  if (st >= 2) block(-dx - 0.1, dx + 0.1, 0, 0.03, 0.4, 1.05, M.earth);
  // veios de ouro: pepitas nas faces visíveis das rochas (raios na direção da câmera)
  if (st === 3) {
    k.group.updateMatrixWorld(true);
    const pitch = (50 * Math.PI) / 180, view = new THREE.Vector3(0, -Math.sin(pitch), -Math.cos(pitch));
    const ray = new THREE.Raycaster();
    let placed = 0;
    for (let t = 0; t < 300 && placed < 26; t++) {
      const o = new THREE.Vector3((R() * 3.4 - 1.7) * 0.5, (0.3 + R() * 1.6) * 0.5, (-1.8 + R() * 1.8) * 0.5).addScaledVector(view, -30);
      ray.set(o, view);
      const h = ray.intersectObjects(solid, false)[0];
      if (!h) continue;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      if (n.z < 0.2) continue;
      const q = h.point.clone().multiplyScalar(2);   // tiles → metros
      const nug = k.mesh(new THREE.IcosahedronGeometry(0.06 + R() * 0.06, 0), M.gold, q.x, q.y, q.z);
      nug.rotation.set(R() * 3, R() * 3, R() * 3);
      placed++;
    }
    // poço com sarilho a sudoeste: colar de toras, esteios, eixo com manivela, corda e caçamba
    const wx = -1.25, wz = 1.0;
    block(wx - 0.32, wx + 0.32, 0, 0.02, wz - 0.32, wz + 0.32, X.dark);
    for (const s of [-1, 1]) { log(k, wx, 0.09, wz + s * 0.38, 0.09, 0.95, 'x'); log(k, wx + s * 0.38, 0.09, wz, 0.09, 0.95, 'z'); }
    for (const s of [-1, 1]) box(0.08, 1.15, 0.08, M.wood, wx + s * 0.45, 0.6, wz);
    const axle = k.cyl(0.06, 0.06, 1.05, M.woodDark, wx, 1.05, wz, 8); axle.rotation.z = Math.PI / 2; axle.position.y = 1.05; k.breakable(axle);
    box(0.04, 0.28, 0.04, M.wood, wx + 0.55, 0.95, wz);
    k.cyl(0.012, 0.012, 0.55, M.rope, wx, 0.5, wz, 4);
    k.cyl(0.12, 0.1, 0.2, M.wood, wx, 0.3, wz, 10);
    // carrinho de minério (caixa em duas rodas) com pedras e pepitas; cestos de minério
    const cx = 1.1, czz = 1.1;
    block(cx - 0.42, cx + 0.42, 0.28, 0.62, czz - 0.3, czz + 0.3, M.wood);
    block(cx - 0.44, cx + 0.44, 0.58, 0.64, czz - 0.32, czz + 0.32, M.woodDark);
    for (const s of [-1, 1]) { const w = k.cyl(0.22, 0.22, 0.06, M.woodDark, cx, 0, czz + s * 0.36, 12); w.rotation.x = Math.PI / 2; w.position.y = 0.22; }
    for (const s of [-1, 1]) box(0.6, 0.05, 0.05, M.wood, cx - 0.7, 0.45, czz + s * 0.22).rotation.z = 0.25;
    for (let i = 0; i < 9; i++) { const m = k.mesh(new THREE.IcosahedronGeometry(0.09 + R() * 0.05, 0), i % 3 ? M.stoneWarm : M.stone, cx + (R() - 0.5) * 0.6, 0.66 + R() * 0.08, czz + (R() - 0.5) * 0.4); m.rotation.set(R() * 3, R() * 3, R() * 3); }
    for (let i = 0; i < 6; i++) k.mesh(new THREE.IcosahedronGeometry(0.06 + R() * 0.03, 0), M.gold, cx + (R() - 0.5) * 0.55, 0.74, czz + (R() - 0.5) * 0.35).rotation.set(R() * 3, R() * 3, R() * 3);
    basket(k, 0.35, 1.2, 0.18, 0.22, M.gold); basket(k, -0.2, 1.4, 0.17, 0.2, M.stoneWarm);
    k.banner(0.62, 0.62, 2.3, 1, [0.44, 0.7]);
  } else {
    pennant(k, -1.95, 1.7);
    k.pile(1.0, 1.2, M.wood);
    for (const [x, z] of [[-1.9, 0.6], [1.9, 0.6], [-0.6, 1.0], [0.6, 1.0]]) k.cyl(0.03, 0.035, 0.5, M.wood, x, 0, z, 5);
  }
};

// ---- Mercado 3×3 (6×6 m): pátio lajeado com uma stoa ao norte (parede de fundo, 6 colunas, telhado de uma água
//      caindo para o pátio, ânforas nas prateleiras), quatro bancas com toldos — dois na máscara de time, dois de linho
//      listrado —, frutas, ânforas, peças de pano e cerâmica, e a grande balança de bronze no meio (o ⚖️ do ícone). ----
B.market = (k, p) => {
  const { THREE, M, box, block } = k;
  const X = mats(k);
  const st = p.stage;
  k.debris = { x0: -3, x1: 3, z0: -3, z1: 2.9 };
  k.debrisMats = [M.limestone, M.plaster, M.wood];
  const wf = [0.25, 0.6, 1, 1][st];
  // piso de lajes com juntas
  block(-3, 3, 0, 0.1, -3, 3, st >= 1 ? M.limestone : M.stoneWarm);
  if (st >= 1) {
    for (let x = -2.4; x <= 2.41; x += 0.6) block(x - 0.012, x + 0.012, 0.1, 0.104, -1.15, 2.95, M.limestoneDark);
    for (let z = -0.6; z <= 2.41; z += 0.6) block(-2.95, 2.95, 0.1, 0.104, z - 0.012, z + 0.012, M.limestoneDark);
  }
  // stoa
  const sz0 = -2.95, sz1 = -1.25, base = 0.3;
  block(-2.95, 2.95, 0.1, base, sz0, sz1, M.limestone);
  block(-2.97, 2.97, base - 0.03, base, sz1 - 0.02, sz1 + 0.02, M.limestoneDark);
  const wallTop = 2.85;
  block(-2.95, 2.95, base, base + (wallTop - base) * wf, sz0, sz0 + 0.22, M.plaster);
  for (const s of [-1, 1]) block(s * 2.95 - (s > 0 ? 0.22 : 0), s * 2.95 + (s < 0 ? 0.22 : 0), base, base + (wallTop - base) * wf, sz0 + 0.22, sz1 - 0.2, M.plaster);
  const colX = [-2.45, -1.47, -0.49, 0.49, 1.47, 2.45], colZ = -1.47, colH = 2.3;
  const colFrac = [0.22, 0.55, 1, 1][st];
  for (const x of colX) {
    if (st === 0 && x > 0.5) continue;
    if (colFrac < 1) k.cyl(0.12, 0.14, colH * colFrac, M.limestone, x, base, colZ, 12);
    else k.column(x, colZ, base, colH, 0.14, M.limestone, M.limestone);
  }
  if (st >= 2) {
    block(-2.97, 2.97, base + colH, wallTop, colZ - 0.18, colZ + 0.18, M.limestone);                  // arquitrave
    block(-2.99, 2.99, wallTop - 0.1, wallTop, colZ + 0.18, colZ + 0.21, M.limestoneDark);
    block(-2.95, 2.95, wallTop - 0.04, wallTop, sz0 + 0.22, colZ - 0.18, M.woodDark);                    // forro
    k.shed({ x0: -3.05, x1: 3.05, zHigh: sz0 - 0.05, zLow: sz1 + 0.12, yHigh: 3.3, yLow: wallTop, frame: st === 2, nRows: 5 });
  }
  if (st === 3) {
    // prateleiras de ânforas no fundo da stoa e um balcão
    block(-2.6, 2.6, base + 0.75, base + 0.8, sz0 + 0.22, sz0 + 0.55, M.wood);
    for (let x = -2.3; x <= 2.31; x += 0.46) amph(k, x, base, sz0 + 0.7, 0.85);
    for (let x = -2.1; x <= 2.11; x += 0.6) amph(k, x, base + 0.8, sz0 + 0.38, 0.7);
  }
  // bancas: mesa + mercadoria + toldo (esteios desde a obra 1, pano no pronto)
  const stalls = [
    { x0: -2.8, x1: -1.05, z0: -0.95, z1: 0.35, mat: M.team, goods: 'fruit' },
    { x0: 1.05, x1: 2.8, z0: -0.95, z1: 0.35, mat: M.canvas, stripes: M.crest, goods: 'amphora' },
    { x0: -2.8, x1: -1.05, z0: 1.25, z1: 2.55, mat: M.canvas, stripes: M.olive, goods: 'cloth' },
    { x0: 1.05, x1: 2.8, z0: 1.25, z1: 2.55, mat: M.team, goods: 'pottery' },
  ];
  for (const s of stalls) {
    if (st < 1) continue;
    awning(k, { x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1, yBack: 2.05, yFront: 1.72, mat: s.mat, stripes: s.stripes, cloth: st === 3 });
    if (st < 2) continue;
    const tx0 = s.x0 + 0.2, tx1 = s.x1 - 0.2, tz0 = s.z0 + 0.35, tz1 = s.z1 - 0.2, ty = 0.78;
    block(tx0, tx1, ty - 0.06, ty, tz0, tz1, M.wood);
    for (const x of [tx0 + 0.06, tx1 - 0.06]) for (const z of [tz0 + 0.06, tz1 - 0.06]) block(x - 0.035, x + 0.035, 0.1, ty - 0.06, z - 0.035, z + 0.035, M.woodDark);
    if (st < 3) continue;
    const cx = (tx0 + tx1) / 2, cz = (tz0 + tz1) / 2, n = 3;
    if (s.goods === 'fruit') {
      const fills = [X.apple, X.pear, X.pomegranate];
      for (let i = 0; i < n; i++) { const x = tx0 + 0.25 + i * ((tx1 - tx0 - 0.5) / (n - 1)); const b = new THREE.Group(); b.position.set(0, ty, 0); k.r.add(b); k.cyl(0.19, 0.15, 0.18, M.wicker, x, 0, cz, 12, b); const t = k.mesh(new THREE.SphereGeometry(0.18, 10, 6, 0, TAU, 0, Math.PI / 2), fills[i], x, 0.16, cz, b); t.scale.y = 0.55; }
      grapes(k, tx1 - 0.15, ty + 0.3, tz1 - 0.08, 0.9);
      basket(k, s.x0 + 0.35, s.z1 + 0.25, 0.2, 0.26, X.apple); basket(k, s.x0 + 0.8, s.z1 + 0.3, 0.18, 0.24, X.pear);
    } else if (s.goods === 'amphora') {
      for (let i = 0; i < 4; i++) k.breakable(amph(k, tx0 + 0.2 + i * 0.37, ty, cz, 0.75));
      for (let i = 0; i < 3; i++) amph(k, s.x0 + 0.35 + i * 0.38, 0.1, s.z1 + 0.28, 1.05);
    } else if (s.goods === 'cloth') {
      const cols = [M.crest, M.linen, M.olive2, M.wool];
      for (let i = 0; i < 4; i++) { const c = k.cyl(0.09, 0.09, tz1 - tz0 - 0.1, cols[i], tx0 + 0.22 + i * 0.36, ty + 0.09, cz, 10); c.rotation.x = Math.PI / 2; c.position.y = ty + 0.09; }
      block(tx0 + 0.1, tx1 - 0.1, ty, ty + 0.04, tz1 - 0.1, tz1 + 0.05, M.linenDark);
      sack(k, s.x0 + 0.4, s.z1 + 0.25, 0.9, M.wool);
    } else {
      for (let i = 0; i < 5; i++) { const g = new THREE.Group(); g.position.set(0, ty, 0); k.r.add(g); const b = k.mesh(new THREE.SphereGeometry(0.09 + (i % 2) * 0.03, 10, 8), i % 2 ? M.terracottaDark : M.terracotta, tx0 + 0.15 + i * 0.28, 0.1, cz + ((i % 2) - 0.5) * 0.15, g); b.scale.set(1, 1.1, 1); k.breakable(b); }
      pithos(k, s.x1 - 0.3, s.z1 + 0.3, 0.65); pithos(k, s.x1 - 0.8, s.z1 + 0.3, 0.55);
    }
  }
  // balança de bronze no meio do pátio: base de pedra, poste, travessão, correntes e pratos; pesos na base
  if (st >= 2) {
    const bx = 0, bz = 0.75;
    block(bx - 0.28, bx + 0.28, 0.1, 0.42, bz - 0.28, bz + 0.28, M.limestoneDark);
    k.cyl(0.05, 0.06, 1.9, M.woodDark, bx, 0.42, bz, 8);
    if (st === 3) {
      const yb = 2.3;
      k.box(1.3, 0.05, 0.05, M.bronze, bx, yb, bz).rotation.z = 0.06;
      k.cyl(0.07, 0.07, 0.08, M.bronze, bx, yb - 0.04, bz, 8);
      for (const s of [-1, 1]) {
        const ex = bx + s * 0.62, ey = yb - s * 0.04;
        for (const d of [-1, 1]) { const c = k.cyl(0.006, 0.006, 0.62, M.bronzeDark, ex + d * 0.1, ey - 0.62, bz, 4); c.rotation.z = d * 0.16; }
        k.breakable(k.cyl(0.2, 0.15, 0.05, M.bronze, ex, ey - 0.66, bz, 14));
        if (s < 0) fruit(k, ex, ey - 0.62, bz, 0.07, X.pomegranate); else for (let i = 0; i < 3; i++) k.cyl(0.04, 0.04, 0.05, M.bronzeDark, ex + (i - 1) * 0.08, ey - 0.62, bz, 8);
      }
      for (let i = 0; i < 3; i++) k.cyl(0.035 + i * 0.012, 0.035 + i * 0.012, 0.05 + i * 0.02, M.bronzeDark, bx - 0.12 + i * 0.12, 0.42, bz + 0.12, 8);
      // estandartes de time na entrada do pátio
      k.banner(-0.75, 2.85, 2.4, -1); k.banner(0.75, 2.85, 2.4, 1);
      // sacos e cesto perto da entrada
      sack(k, -0.4, 2.2, 0.9); sack(k, 0.45, 2.3, 0.85, M.wool); basket(k, 0.05, 2.45, 0.2, 0.24, X.wheat);
    }
  }
  if (st <= 2) {
    k.scaffold({ x0: -3.1, x1: 3.1, z0: -3.1, z1: -1.05, h: [1.3, 2.5, 3.5][st] });
    k.pile(0.3, 2.35, M.limestone);
    if (st === 0) k.pile(-1.4, 1.2, M.limestone);
  }
};

// ---- Academia 3×3 (6×6 m): salão de mármore sobre plataforma de dois degraus, pórtico de 6 colunas ao sul sob o
//      telhado de duas águas leste-oeste, com um frontão central virado para a câmera (cumeeira norte-sul cruzando a
//      principal) e acrotérios; friso com tríglifos; estandartes de time entre as colunas. No pátio, a êxedra (banco
//      semicircular dos filósofos) em volta de um pedestal com a esfera armilar de bronze e duas oliveiras (o bosque de
//      Academo). ----
B.academy = (k, p) => {
  const { THREE, M, box, block } = k;
  const st = p.stage;
  const R = rng(seedOf('academy'));
  k.debris = { x0: -3, x1: 3, z0: -3, z1: 0.3 };
  k.debrisMats = [M.marble, M.marbleDark, M.limestone];
  const wf = [0.2, 0.6, 1, 1][st];
  // plataforma (crepidoma) com dois degraus
  block(-3, 3, 0, 0.15, -3, 0.15, M.marbleDark);
  if (st >= 1) block(-2.85, 2.85, 0.15, 0.3, -2.92, 0.0, M.marble);
  const base = st >= 1 ? 0.3 : 0.15;
  // salão
  const hx0 = -2.7, hx1 = 2.7, hz0 = -2.8, hz1 = -1.2, wallH = 2.5;
  k.room(hx0, hx1, hz0, hz1, base, wallH * wf, 0.22, M.marble, [-0.45, 0.45, 1.95]);
  if (st >= 1) block(hx0 + 0.22, hx1 - 0.22, base, base + 0.02, hz0 + 0.22, hz1 - 0.22, M.woodDark);
  if (st >= 2) for (const x of [-1.7, 1.7]) block(x - 0.2, x + 0.2, base + 1.2, base + 1.9, hz1 - 0.005, hz1 + 0.01, M.woodDark);   // janelas
  // pórtico: 6 colunas
  const colZ = -0.3, colH = 2.5, colX = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];
  const colFrac = [0.2, 0.55, 1, 1][st];
  for (const x of colX) {
    if (st === 0 && Math.abs(x) < 1) continue;
    if (colFrac < 1) k.cyl(0.14, 0.16, colH * colFrac, M.marble, x, base, colZ, 14);
    else k.column(x, colZ, base, colH, 0.16, M.marble, M.marble);
  }
  const top = base + colH;
  if (st >= 2) {
    block(-2.85, 2.85, top, top + 0.24, colZ - 0.2, colZ + 0.2, M.marble);                                // arquitrave
    block(-2.87, 2.87, top + 0.24, top + 0.46, colZ - 0.22, colZ + 0.21, M.marbleDark);                     // friso
    for (let x = -2.7; x <= 2.71; x += 0.45) block(x - 0.07, x + 0.07, top + 0.26, top + 0.44, colZ + 0.2, colZ + 0.23, M.stoneLight);   // tríglifos
    block(hx0, hx1, top + 0.4, top + 0.46, hz1, colZ - 0.2, M.woodDark);                                    // forro do pórtico
  }
  const eaves = top + 0.46, rise = 0.85;
  const rz0 = hz0 - 0.2, rz1 = colZ + 0.35;
  if (st === 2) {
    k.gable({ cx: 0, cz: (rz0 + rz1) / 2, axis: 'x', w: rz1 - rz0, len: 5.9, y: eaves, rise, frame: true });
    k.gable({ cx: 0, cz: -0.95, axis: 'z', w: 2.9, len: 2.4, y: eaves, rise: 0.95, frame: true });
  }
  if (st === 3) {
    k.gable({ cx: 0, cz: (rz0 + rz1) / 2, axis: 'x', w: rz1 - rz0, len: 5.95, y: eaves, rise, ped: M.marble, nRows: 7 });
    // frontão central (cumeeira norte-sul) com tímpano mais escuro e acrotérios quebráveis
    k.gable({ cx: 0, cz: -0.95, axis: 'z', w: 2.9, len: 2.4, y: eaves, rise: 0.95, ped: M.marble, pedDark: M.marbleDark, nRows: 5 });
    block(-1.5, 1.5, eaves - 0.06, eaves + 0.04, 0.12, 0.26, M.marbleDark);
    for (const s of [-1, 0, 1]) k.breakable(k.mesh(new THREE.ConeGeometry(0.1, 0.3, 6), s ? M.marble : M.gold, s * 1.45, eaves + (s ? 0.15 : 1.1), 0.25));
    for (const s of [-1, 1]) k.breakable(k.mesh(new THREE.ConeGeometry(0.09, 0.26, 6), M.marble, s * 2.95, eaves + 0.13, rz1));
    // estandartes de time pendurados entre as colunas laterais
    for (const s of [-1, 1]) { k.box(0.46, 0.95, 0.03, M.team, s * 2.0, top - 0.55, colZ + 0.02); k.box(0.56, 0.05, 0.05, M.woodDark, s * 2.0, top - 0.06, colZ + 0.02); }
  }
  // pátio: caminho de terra batida, êxedra, pedestal com a esfera armilar, oliveiras
  if (st >= 1) { olive(k, -2.35, 2.05, R, 0.95); olive(k, 2.4, 1.75, R, 1.0); }
  if (st === 3) {
    block(-0.5, 0.5, 0, 0.02, 0.15, 0.7, M.earth);
    const cx = 0, cz = 2.05, rr = 1.2, n = 9;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + 0.25 + (i / (n - 1)) * (Math.PI - 0.5);
      const th = Math.atan2(-Math.cos(a), -Math.sin(a));
      const seat = box(0.46, 0.4, 0.42, M.marble, cx + Math.cos(a) * rr, 0.2, cz + Math.sin(a) * rr); seat.rotation.y = th;
      const back = box(0.48, 0.64, 0.12, M.marbleDark, cx + Math.cos(a) * (rr + 0.26), 0.32, cz + Math.sin(a) * (rr + 0.26)); back.rotation.y = th;
    }
    block(cx - 0.22, cx + 0.22, 0, 0.1, cz - 0.22, cz + 0.22, M.marbleDark);
    k.cyl(0.13, 0.15, 0.85, M.marble, cx, 0.1, cz, 12);
    k.cyl(0.2, 0.2, 0.06, M.marbleDark, cx, 0.95, cz, 12);
    const sy = 1.33;
    k.mesh(new THREE.SphereGeometry(0.05, 8, 6), M.gold, cx, sy, cz);
    for (const [rx, ry] of [[0, 0], [Math.PI / 2, 0], [Math.PI / 2, Math.PI / 2], [0.4, 0.9]]) {
      const ring = k.mesh(new THREE.TorusGeometry(0.28, 0.018, 6, 28), M.bronze, cx, sy, cz); ring.rotation.set(rx, ry, 0.35);
    }
    k.cyl(0.015, 0.015, 0.7, M.bronzeDark, cx, sy - 0.35, cz, 5).rotation.z = 0.35;
  }
  if (st <= 2) {
    k.scaffold({ x0: -3.0, x1: 3.0, z0: -3.0, z1: 0.1, h: [1.3, 2.6, 3.9][st] });
    k.pile(1.0, 1.0, M.marble); if (st === 0) { k.pile(-0.9, 1.3, M.marbleDark); const d = k.cyl(0.16, 0.16, 0.8, M.marble, 0.2, 0, 1.9, 12); d.rotation.z = Math.PI / 2; d.position.y = 0.16; }
  }
};

// ---- Cornucópia 2×2 (4×4 m), presente de Hefesto: pedestal redondo de mármore sobre plinto quadrado e o grande chifre
//      de ouro deitado, a boca aberta para sudoeste (a câmera vê o interior) e a ponta enrolada para cima; anéis de
//      bronze, fita na máscara de time; da boca transbordam frutas, uvas, romãs, trigo, moedas de ouro e toras (comida,
//      madeira e ouro, os três recursos que ela gera). Estandartes de time nos cantos da frente. ----
B.cornucopia = (k, p) => {
  const { THREE, M, block } = k;
  const X = mats(k);
  const st = p.stage;
  const R = rng(seedOf('cornucopia'));
  k.debris = { x0: -1.9, x1: 1.9, z0: -1.9, z1: 1.9 };
  k.debrisMats = [M.marble, M.marbleDark];
  // plinto, degrau e tambor
  block(-1.85, 1.85, 0, 0.15, -1.85, 1.85, M.marbleDark);
  k.cyl(1.62, 1.62, 0.12, M.marbleDark, 0, 0.15, 0, 32);
  const drumH = st === 0 ? 0.15 : 0.4;
  k.cyl(1.45, 1.5, drumH, M.marble, 0, 0.27, 0, 32);
  const y0 = 0.27 + drumH + 0.08;
  if (st >= 1) {
    k.cyl(1.55, 1.55, 0.08, M.marbleDark, 0, 0.27 + drumH, 0, 32);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; k.box(0.05, drumH - 0.08, 0.04, M.marbleDark, Math.cos(a) * 1.47, 0.27 + drumH / 2, Math.sin(a) * 1.47).rotation.y = -a; }
  }
  // o chifre (tubo de raio variável ao longo de uma curva), com anéis de bronze e a fita de time
  const H = [[-0.6, 0.5, 0.55], [0.0, 0.42, 0.0], [0.6, 0.55, -0.55], [0.88, 1.1, -0.72], [0.66, 1.62, -0.52], [0.32, 1.74, -0.24], [0.18, 1.52, -0.02]];
  const curve = new THREE.CatmullRomCurve3(H.map(([x, y, z]) => new THREE.Vector3(x + 0.22, y0 + y, z - 0.22)));
  const rOf = (t) => 0.5 * Math.pow(1 - t, 1.25) + 0.03;
  const tMax = [0, 0.4, 1, 1][st];
  if (tMax > 0) {
    k.mesh(taperedTube(THREE, curve, 64, 22, rOf, tMax), X.goldIn, 0, 0, 0);
    if (st === 3) k.mesh(taperedTube(THREE, curve, 64, 22, (t) => rOf(t) + 0.025, 0.34, 0.25), M.team, 0, 0, 0);   // faixa de time
    const ring = (t, extra, tube, mat) => {
      const P = curve.getPointAt(t), T = curve.getTangentAt(t);
      const m = k.mesh(new THREE.TorusGeometry(rOf(t) + extra, tube, 8, 28), mat, P.x, P.y, P.z);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), T);
      return m;
    };
    ring(0, 0.01, 0.045, M.gold);                                                     // borda da boca
    for (const t of [0.12, 0.47, 0.6, 0.72]) if (t <= tMax) ring(t, 0.005, 0.022, M.bronze);
  }
  if (st === 3) {
    // o que transborda: monte de frutas diante da boca, uvas, romãs, trigo, moedas de ouro e toras
    const C = { x: -0.62, z: 0.62 }, rad = 0.55;
    const kinds = [X.apple, X.pomegranate, X.pear, X.apple, X.pomegranate];
    for (let i = 0; i < 34; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * rad, x = C.x + Math.cos(a) * d, z = C.z + Math.sin(a) * d * 0.9;
      const y = y0 + 0.26 * (1 - d / rad);
      const m = fruit(k, x, y, z, 0.08 + R() * 0.03, kinds[i % kinds.length]);
      if (i < 6) k.breakable(m);
    }
    grapes(k, -0.25, y0 + 0.42, 0.72, 1.1); grapes(k, -0.95, y0 + 0.34, 0.25, 1.0); grapes(k, -0.55, y0 + 0.48, 0.3, 0.9);
    for (let i = 0; i < 14; i++) { const c = k.cyl(0.06, 0.06, 0.015, M.gold, -0.2 + R() * 0.7, y0 + 0.005, 0.85 + R() * 0.4, 12); c.rotation.set((R() - 0.5) * 0.4, 0, (R() - 0.5) * 0.4); }
    for (let i = 0; i < 5; i++) k.cyl(0.06, 0.06, 0.015, M.gold, 0.1, y0 + i * 0.016, 1.1, 12);
    // coisas que caíram no plinto: maçãs, moedas, um feixe de trigo e duas toras
    for (let i = 0; i < 6; i++) fruit(k, -1.55 + R() * 0.5, 0.15, 1.45 + R() * 0.3, 0.08, kinds[i % kinds.length]);
    for (let i = 0; i < 6; i++) k.cyl(0.06, 0.06, 0.015, M.gold, -0.9 + R() * 0.6, 0.15, 1.68 + R() * 0.12, 12);
    const wheat = new THREE.Group(); wheat.position.set(-1.12, y0 + 0.12, -0.12); wheat.rotation.set(0, 0.5, 1.35); k.r.add(wheat);
    k.cyl(0.1, 0.12, 0.55, X.straw, 0, -0.27, 0, 8, wheat); k.mesh(new THREE.ConeGeometry(0.16, 0.25, 8), X.wheatHead, 0, 0.38, 0, wheat).rotation.x = Math.PI;
    log(k, 0.9, 0.15 + 0.11, 1.45, 0.11, 0.75, 'x'); log(k, 1.05, 0.15 + 0.3, 1.35, 0.1, 0.65, 'x').rotation.y = 0.3;
    k.banner(-1.7, 1.72, 1.9, 1, [0.36, 0.62]); k.banner(1.7, 1.72, 1.9, -1, [0.36, 0.62]);
  } else {
    k.scaffold({ x0: -1.95, x1: 1.95, z0: -1.95, z1: 1.95, h: [1.2, 2.1, 3.0][st] });
    k.pile(1.2, 2.15, M.marble);
  }
};
