// Props paramétricos (docs/ART.md §1.7, §4): oliveira, cipreste e carvalho × variantes por semente × 2 escalas, tocos,
// rochas, arbusto de frutas (cheio/meio/vazio), veio de ouro (3 estágios) e animais simples (cervo, javali) em 4 direções;
// Etapa 9 (Apêndice I): medronheiro de cartões de folhas com frutas, afloramento de calcário com veio de quartzo e ouro,
// rochas e tocos texturizados e a vegetação rasteira (maquis, capim seco, flores, seixos) espalhada pelo renderizador.
// Tudo em METROS com a base em y = 0; o grupo externo converte para tiles. Sem Math.random: gerador com semente por
// nome (mulberry32), então `olive/2/big` sai igual em qualquer máquina.

import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { M2T, dirYaw } from './camera.js';
import { buildTree, buildShrub, buildGrassTuft, barkMaterial } from './trees.js';
import { rockMaterial, stumpTopMaterial, worldUV } from './nature-textures.js';

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
      // afloramento de calcário claro com um veio de quartzo leitoso e ouro nativo; minério solto no chão
      const stage = V;                                           // 0 = cheio … 2 = quase esgotado
      const rock = rockMaterial(THREE, 0x9d978b);
      const quartz = new THREE.MeshStandardMaterial({ color: 0xece7da, roughness: 0.32, metalness: 0 });
      const spots = [[-0.28, -0.12, 0.62], [0.42, 0.22, 0.5], [-0.02, 0.52, 0.42]];
      const n = [3, 2, 1][stage];
      for (let i = 0; i < n; i++) {
        const [bx, bz, s0] = spots[i], s = s0 * (1 - stage * 0.1);
        const geo = solid(new THREE.IcosahedronGeometry(s, 2)); const p = geo.attributes.position;
        const sx = 0.95 + r() * 0.35, sy = 0.62 + r() * 0.22, sz = 0.9 + r() * 0.3;
        for (let k = 0; k < p.count; k++) { const j = 1 + (r() - 0.5) * 0.22; p.setXYZ(k, p.getX(k) * sx * j, p.getY(k) * sy * j, p.getZ(k) * sz * j); }
        geo.computeVertexNormals();
        const b = mesh(geo, rock, bx, s * sy * 0.55, bz); b.rotation.y = r() * 6.28; worldUV(THREE, rig, b, 1);
        // veio: cristais de quartzo cravados ao longo de uma faixa inclinada na face de cima, com pepitas de ouro
        const va = r() * 6.28, vx = Math.cos(va), vz = Math.sin(va);
        for (let q = 0; q < 6 - stage * 2; q++) {
          const t = (q / 5 - 0.5) * 1.3, px = bx + vx * t * s * sx * 0.8, pz = bz + vz * t * s * sz * 0.8;
          const py = s * sy * 0.55 + Math.sqrt(Math.max(0, 1 - t * t)) * s * sy * 0.8;
          const c = mesh(jitter(new THREE.IcosahedronGeometry(0.07 + r() * 0.05, 0), 0.4), quartz, px, py, pz);
          c.scale.set(1, 1.6 + r() * 0.8, 1); c.rotation.set((r() - 0.5) * 0.8, r() * 3, (r() - 0.5) * 0.8);
          for (let gq = 0; gq < 2; gq++) mesh(jitter(new THREE.IcosahedronGeometry(0.05 + r() * 0.04, 1), 0.45), M.gold, px + (r() - 0.5) * 0.14, py + 0.03, pz + (r() - 0.5) * 0.14);
        }
      }
      // minério solto: pedrinhas de calcário e de quartzo com ouro
      for (let i = 0, k = [18, 11, 6][stage]; i < k; i++) {
        const a = r() * 6.28, d = 0.45 + r() * 0.45, s = 0.06 + r() * 0.08, u = r();
        const mt = u < 0.5 ? M.gold : u < 0.7 ? quartz : rock;
        const m = mesh(jitter(new THREE.IcosahedronGeometry(s, 0), 0.4), mt, Math.cos(a) * d, s * 0.5, Math.sin(a) * d * 0.9);
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
      rig.add(buildGrassTuft(THREE, 'meadow', V, { h: 0.42, radius: 0.38, count: 26 }));
      // papoulas (0), camomilas (1), ou mistura de papoula, lavanda e botão-de-ouro (2)
      const palettes = [[0xc4261c, 0xd02a1e, 0xb02016], [0xf2efe4, 0xf4f1e8, 0xe9d44a], [0xc4261c, 0x8a62b4, 0xe2c23a]];
      const mats = palettes[V % 3].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
      for (let i = 0, n = 16 + Math.floor(r() * 8); i < n; i++) {
        const a = r() * 6.28, d = Math.sqrt(r()) * 0.45, h = 0.3 + r() * 0.16;
        const f = mesh(new THREE.SphereGeometry(0.05 + r() * 0.025, 8, 5), mats[Math.floor(r() * mats.length)], Math.cos(a) * d, h, Math.sin(a) * d);
        f.scale.set(1, 0.4, 1);
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
      const deer = kind === 'deer';
      const body = new THREE.Group(); rig.add(body);
      body.rotation.y = dirYaw(V);                              // a variante é a direção (0 = E, horário)
      const bodyMat = deer ? M.fur : M.furDark, H = deer ? 0.95 : 0.6, L = deer ? 1.3 : 1.1;
      mesh(new THREE.CapsuleGeometry(deer ? 0.28 : 0.32, L - 0.5, 6, 12), bodyMat, 0, H, 0, body).rotation.x = Math.PI / 2;
      for (const [x, z] of [[-0.16, -0.4], [0.16, -0.4], [-0.16, 0.4], [0.16, 0.4]]) mesh(new THREE.CylinderGeometry(0.05, 0.04, H, 6), deer ? M.furDark : M.hoof, x, H / 2, z, body);
      const neck = mesh(new THREE.CylinderGeometry(0.1, 0.14, deer ? 0.6 : 0.3, 8), bodyMat, 0, H + (deer ? 0.25 : 0.05), -L / 2 + 0.05, body); neck.rotation.x = deer ? 0.7 : 1.2;
      const head = mesh(new THREE.BoxGeometry(0.18, 0.2, deer ? 0.36 : 0.4), deer ? M.fur : M.furDark, 0, H + (deer ? 0.5 : 0.05), -L / 2 - (deer ? 0.15 : 0.3), body);
      if (deer) { for (const s of [-1, 1]) { const a = mesh(new THREE.ConeGeometry(0.03, 0.4, 5), M.bark, s * 0.08, 0.3, 0.05, head); a.rotation.z = -s * 0.5; a.rotation.x = -0.3; } }
      else { for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(0.025, 0.14, 5), M.marble, s * 0.07, -0.06, -0.2, head).rotation.x = -Math.PI / 2; }
      mesh(new THREE.ConeGeometry(0.05, 0.16, 5), bodyMat, 0, H + 0.05, L / 2 - 0.05, body).rotation.x = Math.PI / 2 + 0.5; // cauda
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
