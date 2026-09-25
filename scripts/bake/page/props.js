// Props paramétricos (docs/ART.md §1.7, §4): oliveira, cipreste e carvalho × variantes por semente × 2 escalas, tocos,
// rochas, arbusto de frutas (cheio/meio/vazio), veio de ouro (3 estágios) e animais simples (cervo, javali) em 4 direções.
// Tudo em METROS com a base em y = 0; o grupo externo converte para tiles. Sem Math.random: gerador com semente por
// nome (mulberry32), então `olive/2/big` sai igual em qualquer máquina.

import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { M2T, dirYaw } from './camera.js';

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
  const canopy = tag === 'thin' ? 0.45 : 1;          // 'thin' = árvore sendo cortada (copa rala, docs/ART.md §4)
  const V = Number(variant) || 0;

  switch (kind) {
    case 'olive': {
      rig.scale.setScalar(M2T * sizeScale);
      let p = new THREE.Vector3(0, 0, 0); let dir = new THREE.Vector3((r() - 0.5) * 0.4, 1, (r() - 0.5) * 0.4).normalize();
      for (let i = 0; i < 5; i++) {
        const len = 0.55, rad = 0.24 - i * 0.035;
        const seg = new THREE.Group(); seg.position.copy(p); seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); rig.add(seg);
        mesh(new THREE.CylinderGeometry(rad - 0.03, rad, len, 9), M.bark, 0, len / 2, 0, seg);
        p = p.clone().add(dir.clone().multiplyScalar(len));
        dir = dir.clone().add(new THREE.Vector3((r() - 0.5) * 0.9, 0.2, (r() - 0.5) * 0.9)).normalize();
      }
      const n = Math.round((9 + Math.floor(r() * 4)) * canopy);
      for (let i = 0; i < n; i++) { const s = 0.55 + r() * 0.45; mesh(jitter(new THREE.IcosahedronGeometry(s, 1), 0.25), r() > 0.5 ? M.olive : M.olive2, (r() - 0.5) * 2.4, 2.5 + r() * 1.1, (r() - 0.5) * 2.4); }
      break;
    }
    case 'cypress': {
      rig.scale.setScalar(M2T * sizeScale);
      mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.8, 8), M.bark, 0, 0.4, 0);
      const pts = []; const H = (6.2 + r() * 1.2) * (tag === 'thin' ? 0.6 : 1); const W = (0.7 + r() * 0.15) * (tag === 'thin' ? 0.7 : 1);
      for (let i = 0; i <= 12; i++) { const t = i / 12; const w = Math.sin(Math.pow(t, 0.55) * Math.PI) * W + (i === 0 ? 0.05 : 0); pts.push(new THREE.Vector2(Math.max(0.01, w), 0.5 + t * H)); }
      const cone = mesh(new THREE.LatheGeometry(pts, 14), M.cypress, 0, 0, 0);
      const pos = cone.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { const n = 1 + (r() - 0.5) * 0.18; pos.setX(i, pos.getX(i) * n); pos.setZ(i, pos.getZ(i) * n); }
      cone.geometry.computeVertexNormals();
      break;
    }
    case 'oak': {
      rig.scale.setScalar(M2T * sizeScale * 0.85);
      mesh(new THREE.CylinderGeometry(0.26, 0.38, 2.0, 10), M.bark, 0, 1.0, 0);
      for (let i = 0; i < 4; i++) { const b = mesh(new THREE.CylinderGeometry(0.08, 0.16, 1.4, 7), M.bark, 0, 2.5, 0); b.rotation.z = (r() - 0.5) * 1.4; b.rotation.x = (r() - 0.5) * 1.4; }
      const n = Math.round((12 + Math.floor(r() * 4)) * canopy);
      for (let i = 0; i < n; i++) { const s = 0.8 + r() * 0.6; mesh(jitter(new THREE.IcosahedronGeometry(s, 1), 0.2), r() > 0.5 ? M.oak : M.oak2, (r() - 0.5) * 3.4, 3.1 + r() * 1.6, (r() - 0.5) * 3.4); }
      break;
    }
    case 'stump': {
      const h = 0.35 + V * 0.12, rad = 0.32 + r() * 0.1;
      mesh(jitter(new THREE.CylinderGeometry(rad, rad * 1.2, h, 10), 0.08), M.bark, 0, h / 2, 0);
      mesh(new THREE.CylinderGeometry(rad * 0.92, rad * 0.92, 0.04, 10), M.wood, 0, h, 0);                    // topo cortado
      for (let i = 0; i < 3; i++) { const a = r() * Math.PI * 2; const root = mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.5, 6), M.bark, Math.cos(a) * rad * 1.1, 0.08, Math.sin(a) * rad * 1.1); root.rotation.z = Math.PI / 2 - 0.3; root.rotation.y = -a; }
      break;
    }
    case 'rock': {
      const s = [0.35, 0.5, 0.65, 0.45, 0.8, 0.3][V % 6];
      const geo = solid(new THREE.IcosahedronGeometry(s, 1)); const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + r() * 0.5), p.getY(i) * (0.45 + r() * 0.3), p.getZ(i) * (0.8 + r() * 0.5));
      geo.computeVertexNormals();
      mesh(geo, V % 2 ? M.stoneDark : M.stone, 0, s * 0.3, 0);
      if (V >= 3) { const g2 = jitter(new THREE.IcosahedronGeometry(s * 0.5, 1), 0.4); mesh(g2, M.stone, s * 0.9, s * 0.15, s * 0.4); }
      break;
    }
    case 'berry': {
      const full = variant === 'full' ? 1 : variant === 'half' ? 0.5 : 0;
      const n = 5 + Math.round(full * 6);
      for (let i = 0; i < 4; i++) { const t = mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.7, 5), M.bark, (r() - 0.5) * 0.5, 0.3, (r() - 0.5) * 0.5); t.rotation.z = (r() - 0.5) * 0.8; t.rotation.x = (r() - 0.5) * 0.8; } // galhos
      for (let i = 0; i < n; i++) { const s = 0.28 + r() * 0.2; mesh(jitter(new THREE.IcosahedronGeometry(s, 1), 0.3), M.berryLeaf, (r() - 0.5) * 1.1, 0.35 + r() * 0.55, (r() - 0.5) * 1.1); }
      const berries = Math.round(full * 14);
      for (let i = 0; i < berries; i++) mesh(new THREE.SphereGeometry(0.06, 6, 5), M.berry, (r() - 0.5) * 1.2, 0.45 + r() * 0.6, (r() - 0.5) * 1.2);
      break;
    }
    case 'gold': {
      const stage = V;                                           // 0 = cheio … 2 = quase esgotado
      const rocks = 3 - stage;
      for (let i = 0; i < rocks + 1; i++) { const s = 0.45 + r() * 0.35 - stage * 0.08; const g = jitter(new THREE.IcosahedronGeometry(s, 1), 0.45); mesh(g, M.stoneDark, (r() - 0.5) * 1.4, s * 0.35, (r() - 0.5) * 1.4); }
      const nuggets = 10 - stage * 4;
      for (let i = 0; i < nuggets; i++) { const s = 0.09 + r() * 0.1; mesh(jitter(new THREE.IcosahedronGeometry(s, 0), 0.3), M.gold, (r() - 0.5) * 1.5, 0.2 + r() * 0.5, (r() - 0.5) * 1.5); }
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
