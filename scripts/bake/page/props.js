// Props paramétricos (docs/ART.md §1.7, §4): oliveira, cipreste e carvalho × variantes por semente × 2 escalas, tocos,
// rochas, arbusto de frutas (cheio/meio/vazio), veio de ouro (3 estágios) e animais simples (cervo, javali) em 4 direções;
// Etapa 9 (Apêndice I): medronheiro de cartões de folhas com frutas, afloramento de calcário com veio de quartzo e ouro,
// rochas e tocos texturizados e a vegetação rasteira (maquis, capim seco, flores, seixos) espalhada pelo renderizador.
// Tudo em METROS com a base em y = 0; o grupo externo converte para tiles. Sem Math.random: gerador com semente por
// nome (mulberry32), então `olive/2/big` sai igual em qualquer máquina.

import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { M2T, dirYaw } from './camera.js';
import { buildTree, buildShrub, buildGrassTuft, barkMaterial } from './trees.js';
import { rockMaterial, rockVertexMaterial, stumpTopMaterial, worldUV } from './nature-textures.js';
import { buildDeer, buildBoar } from './animals.js';

/** Semente inteira a partir de um texto (FNV-1a). */
export function seedOf(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** mulberry32: números em [0, 1) reproduzíveis. */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Constrói o prop `kind/variant[/tag]` e devolve um grupo em tiles com a origem no pé. */
export function buildProp(THREE, M, kind, variant, tag) {
  const r = rng(seedOf(`${kind}/${variant}/${tag ?? ''}`));
  const group = new THREE.Group();
  const rig = new THREE.Group(); rig.scale.setScalar(M2T); group.add(rig);
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = rig) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  // Os poliedros do three não são indexados (cada face tem os seus vértices): deformar vértice a vértice abriria
  // rachaduras. `solid` funde os vértices coincidentes antes; depois a deformação e as normais saem contínuas.
  const solid = (geo) => { geo.deleteAttribute('uv'); geo.deleteAttribute('normal'); return mergeVertices(geo, 1e-4); };
  const jitter = (geo, amt) => { geo = solid(geo); const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const n = 1 + (r() - 0.5) * amt; p.setXYZ(i, p.getX(i) * n, p.getY(i) * n, p.getZ(i) * n); } geo.computeVertexNormals(); return geo; };
  // Bloco de rocha fraturada: icosaedro subdividido e deformado, cortado por `cuts` planos (faces planas de fratura, um
  // deles quase no topo) e com normal por face (arestas vivas). Devolve a geometria não indexada e os planos.
  const fractured = (s, sx, sy, sz, cuts, detail = 3) => {
    const g = solid(new THREE.IcosahedronGeometry(s, detail)); const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const j = 1 + (r() - 0.5) * 0.1; p.setXYZ(k, p.getX(k) * sx * j, Math.max(-0.4 * s * sy, p.getY(k) * sy * j), p.getZ(k) * sz * j); }
    const planes = [];
    for (let c = 0; c < cuts; c++) {
      const a = r() * 6.28, e = c === 0 ? 1.25 + r() * 0.25 : (r() - 0.2) * 0.9;
      const n = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).normalize();
      const ext = s * Math.sqrt((n.x * sx) ** 2 + (n.y * sy) ** 2 + (n.z * sz) ** 2);
      planes.push({ n, d: ext * (0.62 + r() * 0.26) });
    }
    const v = new THREE.Vector3();
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k);
      for (const pl of planes) { const dist = v.dot(pl.n) - pl.d; if (dist > 0) v.addScaledVector(pl.n, -dist); }
      p.setXYZ(k, v.x, v.y, v.z);
    }
    const out = g.toNonIndexed(); out.computeVertexNormals();
    return out;
  };
  // Cor por vértice: fn(posição, normal da face) → hex (sRGB). O ruído deve depender só da posição (`posNoise`), para que
  // os vértices repetidos das faces vizinhas tenham a mesma cor e as faixas passem contínuas de uma face para a outra.
  const paintFaces = (g, fn) => {
    const p = g.attributes.position, nr = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); n.fromBufferAttribute(nr, i);
      c.setHex(fn(v, n));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  };
  // ruído suave da posição (m), em [0, 1): soma de ondas cruzadas (só para a cor por vértice; o bake não tem determinismo de rede)
  const posNoise = (v, f = 9, seed = 0) => {
    const a = Math.sin(v.x * f + seed) * Math.cos(v.z * f * 0.83 - seed * 1.7) + Math.sin(v.y * f * 1.21 + v.x * f * 0.37 + seed * 2.3);
    return Math.min(0.999, Math.max(0, 0.5 + a * 0.25));
  };
  const lerpHex = (x, y, t) => { const k = Math.max(0, Math.min(1, t)); const ch = (sh) => Math.round(((x >> sh) & 255) * (1 - k) + ((y >> sh) & 255) * k); return (ch(16) << 16) | (ch(8) << 8) | ch(0); };
  const sizeScale = tag === 'small' ? 0.72 : 1;
  const V = Number(variant) || 0;

  switch (kind) {
    case 'olive': case 'cypress': case 'oak': {
      // Etapa 9: árvores de galhos com casca e copa de cartões de folhas (trees.js); o carvalho fica um pouco menor
      rig.scale.setScalar(M2T * sizeScale * (kind === 'oak' ? 0.85 : 1));
      rig.add(buildTree(THREE, kind, V, tag));
      break;
    }
    case 'stump': {
      // toco de carvalho: casca texturizada, topo serrado com anéis e raízes aparentes
      const bark = barkMaterial(THREE, 'oak');
      const h = 0.35 + V * 0.12, rad = 0.32 + r() * 0.1;
      const side = new THREE.CylinderGeometry(rad, rad * 1.25, h, 14, 1, true);
      const uv = side.attributes.uv; for (let i = 0; i < uv.count; i++) { uv.setX(i, uv.getX(i) * 2); uv.setY(i, uv.getY(i) * h * 0.9); }
      mesh(side, bark, 0, h / 2, 0);
      const top = mesh(new THREE.CircleGeometry(rad * 1.02, 24), stumpTopMaterial(THREE), 0, h + 0.002, 0); top.rotation.x = -Math.PI / 2;
      for (let i = 0; i < 4; i++) { const a = r() * Math.PI * 2; const root = mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.55, 7), bark, Math.cos(a) * rad * 1.1, 0.07, Math.sin(a) * rad * 1.1); root.rotation.z = Math.PI / 2 - 0.25; root.rotation.y = -a; }
      // lascas e serragem em volta
      for (let i = 0; i < 6; i++) { const a = r() * 6.28, d = rad * (1.3 + r() * 0.8); mesh(new THREE.BoxGeometry(0.1 + r() * 0.08, 0.02, 0.04), M.wood, Math.cos(a) * d, 0.01, Math.sin(a) * d).rotation.y = r() * 3; }
      break;
    }
    case 'rock': {
      const s = [0.35, 0.5, 0.65, 0.45, 0.8, 0.3][V % 6];
      const geo = solid(new THREE.IcosahedronGeometry(s, 2)); const p = geo.attributes.position;
      const sx = 0.8 + r() * 0.5, sy = 0.45 + r() * 0.3, sz = 0.8 + r() * 0.5;
      for (let i = 0; i < p.count; i++) { const j = 1 + (r() - 0.5) * 0.18; p.setXYZ(i, p.getX(i) * sx * j, p.getY(i) * sy * j, p.getZ(i) * sz * j); }
      geo.computeVertexNormals();
      const m = mesh(geo, rockMaterial(THREE, V % 2 ? 0x8a857c : 0xa39d92), 0, s * 0.3, 0); m.rotation.y = r() * 6.28; worldUV(THREE, rig, m, 1);
      if (V >= 3) { const g2 = jitter(new THREE.IcosahedronGeometry(s * 0.5, 1), 0.3); const m2 = mesh(g2, rockMaterial(THREE, 0xa39d92), s * 0.9, s * 0.15, s * 0.4); worldUV(THREE, rig, m2, 1); }
      break;
    }
    case 'berry': {
      // medronheiro (Arbutus unedo): copa redonda de folhas lustrosas e frutas vermelhas/laranja/amarelas por fora
      const full = variant === 'full' ? 1 : variant === 'half' ? 0.45 : 0;
      const { group: bush, surface } = buildShrub(THREE, 'arbutus', 0, { radii: [0.8, 0.6, 0.8], cy: 0.72, cards: 150, size: 0.52, dark: 0.6, core: variant === 'empty' ? 0 : 0x2e4420 });
      rig.add(bush);
      const mats = [new THREE.MeshStandardMaterial({ color: 0xb8241a, roughness: 0.42 }), new THREE.MeshStandardMaterial({ color: 0xd8701c, roughness: 0.48 }), new THREE.MeshStandardMaterial({ color: 0xd2b23a, roughness: 0.55 })];
      for (let i = 0, n = Math.round(full * 48); i < n; i++) {
        const u = r(), mt = u < 0.64 ? mats[0] : u < 0.88 ? mats[1] : mats[2], p = surface(r);
        mesh(new THREE.SphereGeometry(0.045 + r() * 0.02, 8, 6), mt, p.x, p.y, p.z);
      }
      break;
    }
    case 'gold': {
      // afloramento de calcário fraturado atravessado por um veio de quartzo leitoso com ouro nativo e o halo ferruginoso
      // (gossan: óxido de ferro que denuncia o minério de longe); minério solto no chão
      const stage = V;                                           // 0 = cheio … 2 = quase esgotado
      const rockVC = rockVertexMaterial(THREE, 0.88);
      const spots = [[-0.32, -0.1, 0.73], [0.46, 0.26, 0.57], [-0.02, 0.6, 0.48]];
      const HOST = 0xaea89b, QUARTZ = 0xeae4d8, RUST = 0x8e6038, GOLDC = 0xe0b23a;
      for (let i = 0, n = [3, 2, 1][stage]; i < n; i++) {
        const [bx, bz, s0] = spots[i], s = s0 * (1 - stage * 0.1);
        const sx = 0.95 + r() * 0.35, sy = 0.7 + r() * 0.25, sz = 0.9 + r() * 0.3;
        const geo = fractured(s, sx, sy, sz, 5);
        // veio: faixa entre dois planos quase verticais pelo miolo do bloco, de largura irregular; em volta, o halo ocre
        // de óxido de ferro em manchas; ouro nativo em pintas no quartzo
        const va = r() * 6.28, vn = new THREE.Vector3(Math.cos(va), (r() - 0.5) * 0.5, Math.sin(va)).normalize(), w = 0.05 + r() * 0.025;
        const o = new THREE.Vector3((r() - 0.5) * s * 0.3, 0, (r() - 0.5) * s * 0.3), seed = r() * 10;
        const veinAt = [], rel = new THREE.Vector3();
        paintFaces(geo, (pos, nrm) => {
          const n1 = posNoise(pos, 11, seed), n2 = posNoise(pos, 23, seed + 3);
          const dv = Math.abs(rel.subVectors(pos, o).dot(vn)) - (n1 - 0.5) * w * 0.9;
          const tone = lerpHex(HOST, 0x857f73, n2 * 0.6);
          if (dv < w) {
            if (n2 > 0.64 && nrm.y > -0.2) { if (n2 > 0.7) veinAt.push({ c: pos.clone(), n: nrm.clone() }); return GOLDC; }
            return lerpHex(QUARTZ, 0xd6ccb4, n1 * 0.7);
          }
          const halo = w * (2.2 + n1 * 1.6);
          return dv < halo ? lerpHex(tone, RUST, (1 - (dv - w) / (halo - w)) * (0.35 + n2 * 0.4)) : tone;
        });
        const b = mesh(geo, rockVC, bx, s * sy * 0.42, bz); b.rotation.y = r() * 6.28; worldUV(THREE, rig, b, 1);
        // pepitas de ouro nativo cravadas no veio (brilho metálico)
        b.updateMatrixWorld(true);
        for (let q = 0, k = Math.min(veinAt.length, 10 - stage * 3); q < k; q++) {
          const at = veinAt[Math.floor(r() * veinAt.length)];
          const pw = at.c.clone().addScaledVector(at.n, 0.015).applyMatrix4(b.matrix);
          mesh(jitter(new THREE.IcosahedronGeometry(0.035 + r() * 0.03, 1), 0.5), M.gold, pw.x, pw.y, pw.z);
        }
      }
      // minério solto: lascas de calcário, quartzo e ouro
      const quartz = new THREE.MeshStandardMaterial({ color: QUARTZ, roughness: 0.35, metalness: 0 });
      const rock = rockMaterial(THREE, HOST);
      for (let i = 0, k = [18, 11, 6][stage]; i < k; i++) {
        const a = r() * 6.28, d = 0.45 + r() * 0.45, sz0 = 0.05 + r() * 0.08, u = r();
        const mt = u < 0.35 ? M.gold : u < 0.6 ? quartz : rock;
        const m = mesh(jitter(new THREE.IcosahedronGeometry(sz0, 0), 0.4), mt, Math.cos(a) * d, sz0 * 0.45, Math.sin(a) * d * 0.9);
        if (mt === rock) worldUV(THREE, rig, m, 1);
      }
      break;
    }
    // ---- vegetação rasteira (decoração do renderizador; não é nó do jogo) ----
    case 'maquis': {
      const { group: bush } = buildShrub(THREE, 'lentisk', V, { radii: [0.55 + V * 0.07, 0.38 + (V % 2) * 0.08, 0.5 + V * 0.05], cy: 0.42, cards: 150, size: 0.5, dark: 0.6, core: 0x33421f });
      rig.add(bush);
      break;
    }
    case 'tuft': {
      rig.add(buildGrassTuft(THREE, 'grass', V, { h: 0.7 + V * 0.07, radius: 0.22, count: 18 }));
      for (let i = 0; i < 2; i++) { const t = buildGrassTuft(THREE, 'grass', V * 10 + i + 1, { h: 0.45, radius: 0.14, count: 10 }); const a = r() * 6.28; t.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.36); rig.add(t); }
      break;
    }
    case 'flowers': {
      rig.add(buildGrassTuft(THREE, 'meadow', V, { h: 0.4, radius: 0.38, count: 26 }));
      // corolas achatadas viradas para o céu (de cima, pintas de cor sobre o capim, não bolinhas): papoulas vermelhas de
      // miolo escuro (0), camomilas brancas de miolo amarelo (1) ou papoula, cardo roxo e botão-de-ouro (2)
      const mix = [[['poppy', 1]], [['daisy', 1]], [['poppy', 0.4], ['thistle', 0.3], ['butter', 0.3]]][V % 3];
      const SP = { poppy: { c: 0xc8261c, eye: 0x1c1410, r: 0.05, lobes: 4 }, daisy: { c: 0xf4f1e6, eye: 0xe0b820, r: 0.034, lobes: 12 }, thistle: { c: 0x8e5aa8, eye: 0x6a3c80, r: 0.03, lobes: 0 }, butter: { c: 0xe8c230, eye: 0xc89a18, r: 0.026, lobes: 5 } };
      const mats = new Map(), matOf = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, side: THREE.DoubleSide })); return mats.get(c); };
      const stem = new THREE.MeshStandardMaterial({ color: 0x5a7a34, roughness: 0.8 });
      for (let i = 0, n = 18 + Math.floor(r() * 10); i < n; i++) {
        let u = r(), k = mix[0][0]; for (const [kk, w] of mix) if ((u -= w) < 0) { k = kk; break; }
        const sp = SP[k], a = r() * 6.28, d = Math.sqrt(r()) * 0.48, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.26 + r() * 0.22, rad = sp.r * (0.8 + r() * 0.4);
        mesh(new THREE.CylinderGeometry(0.006, 0.008, h, 4), stem, x, h / 2, z).castShadow = false;
        const head = new THREE.Group(); head.position.set(x, h, z); head.rotation.set((r() - 0.5) * 0.7, r() * 6.28, (r() - 0.5) * 0.7); rig.add(head);
        if (!sp.lobes) { const b = mesh(new THREE.SphereGeometry(rad, 8, 6), matOf(sp.c), 0, rad * 0.4, 0, head); b.scale.set(1, 0.8, 1); continue; }   // cardo: pompom
        // corola: disco com `lobes` pétalas (raio modulado pelo ângulo), a papoula em taça rasa
        const g = new THREE.CircleGeometry(rad, sp.lobes * 6); const p = g.attributes.position;
        for (let q = 1; q < p.count; q++) {
          const px = p.getX(q), py = p.getY(q), ang = Math.atan2(py, px), f = 0.55 + 0.45 * Math.abs(Math.cos(ang * sp.lobes / 2));
          p.setXYZ(q, px * f, py * f, k === 'poppy' ? rad * 0.35 : 0);
        }
        g.rotateX(-Math.PI / 2); g.computeVertexNormals();
        mesh(g, matOf(sp.c), 0, 0, 0, head).castShadow = false;
        mesh(new THREE.SphereGeometry(rad * (k === 'daisy' ? 0.38 : 0.28), 6, 4), matOf(sp.eye), 0, rad * 0.12, 0, head).castShadow = false;
      }
      break;
    }
    case 'crag': {
      // afloramento de calcário da serra: 2–4 blocos altos e fraturados (1–1,8 m) com faces planas de fratura e arestas
      // vivas (`fractured`), manchas de líquen e tom por face; às vezes um lentisco numa fenda
      const mat = rockVertexMaterial(THREE, 0.92), base = V % 2 ? 0x958f84 : 0xa7a194;
      const n = 2 + (V % 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.28 + r() * 1.2, d = i === 0 ? 0 : 0.45 + r() * 0.35, s = (i === 0 ? 0.62 : 0.34 + r() * 0.22);
        const sx = 0.8 + r() * 0.4, sy = (i === 0 ? 1.45 : 0.95) + r() * 0.5, sz = 0.75 + r() * 0.4;
        const g = fractured(s, sx, sy, sz, 5, i === 0 ? 3 : 2);
        const seed = r() * 10;
        paintFaces(g, (pos, nrm) => { const h = posNoise(pos, 7, seed); return nrm.y > 0.55 && h > 0.68 ? lerpHex(base, 0x8c8a62, 0.45) : lerpHex(base, 0x7e786c, h * 0.45 + (nrm.y < 0 ? 0.3 : 0)); });
        const m = mesh(g, mat, Math.cos(a) * d, s * sy * 0.36, Math.sin(a) * d * 0.8); m.rotation.y = r() * 6.28; worldUV(THREE, rig, m, 1);
      }
      if (V !== 1) { const { group: b } = buildShrub(THREE, 'lentisk', 10 + V, { radii: [0.3, 0.22, 0.28], cy: 0.25, cards: 45, size: 0.36, core: 0x33421f }); b.position.set(0.55, 0, 0.3); rig.add(b); }
      break;
    }
    case 'reeds': {
      // caniçal da margem (Phragmites): folhas verde-acinzentadas embaixo e hastes cor de palha de 1,3–2 m com o penacho
      // pardo-arroxeado na ponta, todas inclinadas para o mesmo lado pelo vento
      rig.add(buildGrassTuft(THREE, 'reed', V, { h: 0.95 + V * 0.1, radius: 0.26, count: 16 }));
      const t = buildGrassTuft(THREE, 'reed', V + 20, { h: 0.7, radius: 0.16, count: 10 }); t.position.set(0.35, 0, 0.2); rig.add(t);
      const straw = new THREE.MeshStandardMaterial({ color: 0xc8b88a, roughness: 0.8 });
      const plumes = [new THREE.MeshStandardMaterial({ color: 0x8a6e62, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0xb49a7c, roughness: 1 })];
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0, n = 7 + V * 2; i < n; i++) {
        const a = r() * 6.28, d = Math.sqrt(r()) * 0.3, x0 = Math.cos(a) * d, z0 = Math.sin(a) * d * 0.9;
        const H = 1.3 + r() * 0.65, lx = (0.07 + (r() - 0.5) * 0.14) * H, lz = (-0.03 + (r() - 0.5) * 0.14) * H;
        const tip = new THREE.Vector3(x0 + lx, H, z0 + lz);
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x0 + lx * 0.2, H * 0.5, z0 + lz * 0.2), tip]);
        mesh(new THREE.TubeGeometry(curve, 8, 0.018, 4), straw).castShadow = false;
        // penacho: fuso na ponta, seguindo a curva da haste e pendendo um pouco
        const dir = new THREE.Vector3(lx * 2.2 + 0.05 * H, H * 0.3, lz * 2.2).normalize();
        const pl = mesh(new THREE.SphereGeometry(1, 8, 6), plumes[Math.floor(r() * 2)], tip.x + dir.x * 0.13, tip.y + dir.y * 0.13, tip.z + dir.z * 0.13);
        pl.scale.set(0.05, 0.19, 0.05); pl.quaternion.setFromUnitVectors(up, dir);
      }
      break;
    }
    case 'pebbles': {
      const mat = rockMaterial(THREE, V === 1 ? 0x8f8a80 : 0xa8a295);
      for (let i = 0, n = 4 + V + Math.floor(r() * 3); i < n; i++) {
        const a = r() * 6.28, d = i === 0 ? 0 : Math.sqrt(r()) * 0.45, s = i === 0 ? 0.24 + r() * 0.08 : 0.07 + r() * 0.12;   // a primeira é a maior (faz sombra)
        const g = solid(new THREE.IcosahedronGeometry(s, 1)); const p = g.attributes.position;
        const sy = (i === 0 ? 0.75 : 0.55) + r() * 0.2; for (let k = 0; k < p.count; k++) { const j = 1 + (r() - 0.5) * 0.25; p.setXYZ(k, p.getX(k) * j, p.getY(k) * sy * j, p.getZ(k) * j); }
        g.computeVertexNormals();
        const m = mesh(g, mat, Math.cos(a) * d, s * sy * 0.5, Math.sin(a) * d); m.rotation.y = r() * 6.28; worldUV(THREE, rig, m, 1);
      }
      break;
    }
    case 'deer': case 'boar': {
      // Etapa 9: cervo e javali esculpidos (animals.js); a variante é a direção (0 = E, horário); o cervo pasta em 2 e 6
      const body = kind === 'deer' ? buildDeer(THREE, M, V === 2 || V === 6) : buildBoar(THREE, M);
      body.rotation.y = dirYaw(V);
      rig.add(body);
      break;
    }
    case 'lure': {
      // Pedra de Poseidon: bloco de mármore com um tridente de bronze e um brilho azul-claro no topo
      mesh(jitter(new THREE.CylinderGeometry(0.5, 0.65, 0.9, 7), 0.08), M.marbleDark, 0, 0.45, 0);
      mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 8), M.bronze, 0, 1.6, 0);
      for (const x of [-0.18, 0, 0.18]) mesh(new THREE.ConeGeometry(0.04, 0.3, 6), M.bronze, x, 2.5, 0);
      mesh(new THREE.BoxGeometry(0.44, 0.05, 0.05), M.bronze, 0, 2.33, 0);
      mesh(new THREE.SphereGeometry(0.16, 12, 10), M.glow, 0, 2.05, 0);
      break;
    }
    default: throw new Error(`prop desconhecido: ${kind}`);
  }
  return group;
}
