// Asas acopláveis (Etapa 6, docs/ART.md Apêndice G): um par simétrico preso a um pivô do corpo de outro rig — o cavalo
// (Pégaso, `rigs/horse.js`, `params.wings`) e o quadrúpede (mantícora, `rigs/beast.js`, `params.wings`). Dois pivôs por
// lado, comandados pelas poses do rig hospedeiro com UM valor para as duas asas (a esquerda espelhada):
//   wing     braço (ombro da asa): x = torção (bordo de ataque para cima/baixo), y = varrer (dobrar para trás, +),
//            z = bater (erguer, +)
//   wingTip  mão (pulso): as mesmas convenções, em relação ao braço — no bater, a mão atrasa o braço (a ponta "chicoteia")
// Estilos:
//   feather  penas brancas (Pégaso): coberteiras em cima do braço e da mão, 8 secundárias no bordo de fuga do braço e 10
//            primárias abertas em leque na mão, cada pena uma lâmina fina com a raque mais clara; em cima branco, embaixo
//            um cinza quente (a face de baixo fica na sombra do sol de noroeste)
//   bat      membrana de couro (mantícora): osso do braço, 4 dedos na mão e a membrana esticada entre eles e o corpo
// Metros; a asa direita se estende para +x a partir do pivô, a frente é −z. Em repouso (pose sem `wing`) a asa fica
// aberta na horizontal; as poses dobram (y) e batem (z).

const DEG = Math.PI / 180;

/**
 * Constrói o par de asas sob `parent` com o ombro em `at` = [x, y, z] (o lado direito; o esquerdo é o espelho em x).
 * `span` = comprimento de uma asa (m, do ombro à ponta da primária mais longa). Devolve `{ apply(pose), groups, meshes }`.
 */
export function buildWings(THREE, M, parent, { style = 'feather', at = [0.2, 0.2, -0.3], span = 1.9, membrane = null, bone = null } = {}) {
  const sides = [];
  const meshes = [];
  const mk = (geo, mat, x, y, z, p) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; p.add(m); meshes.push(m); return m; };
  const ARM = span * 0.4, HAND = span * 0.6;
  /** Pena: lâmina afilada de comprimento `len` e largura `w`, da base (origem) para +x local, com a raque. */
  const featherGeo = (len, w) => {
    const s = new THREE.Shape();
    s.moveTo(0, -w * 0.25);
    s.quadraticCurveTo(len * 0.45, -w * 0.62, len * 0.92, -w * 0.18);
    s.quadraticCurveTo(len, 0, len * 0.9, w * 0.2);
    s.quadraticCurveTo(len * 0.5, w * 0.5, 0, w * 0.25);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, -0.006);
    g.rotateX(-Math.PI / 2);   // a lâmina deitada no plano xz (face para cima), comprimento em +x, largura em z
    return g;
  };
  for (const s of [1, -1]) {
    // pivô do ombro da asa; o lado esquerdo é o espelho (posição em −x e as rotações y/z com o sinal trocado em apply)
    const root = new THREE.Group(); root.position.set(s * at[0], at[1], at[2]); parent.add(root);
    const arm = new THREE.Group(); root.add(arm);
    const tip = new THREE.Group(); tip.position.set(s * ARM, 0, 0); arm.add(tip);
    if (style === 'feather') {
      // braço: osso coberto de coberteiras (elipsoide achatado, bordo de ataque grosso na frente)
      const cov = mk(new THREE.SphereGeometry(1, 14, 8), M.feather, s * ARM * 0.5, 0.01, 0.02, arm);
      cov.scale.set(ARM * 0.56, 0.05, 0.2);
      const lead = mk(new THREE.CylinderGeometry(0.04, 0.05, ARM, 8), M.feather, s * ARM * 0.5, 0.0, -0.12, arm); lead.rotation.z = Math.PI / 2;
      // secundárias: do bordo de fuga do braço para trás (+z), um pouco abertas para fora
      for (let i = 0; i < 8; i++) {
        const x = s * (0.06 + (i / 7) * (ARM - 0.06)), len = 0.44 + 0.05 * Math.sin(i * 0.9);
        const f = mk(featherGeo(len, 0.13), i % 2 ? M.feather : M.featherUnder, x, -0.005 - i * 0.001, 0.04, arm);
        f.rotation.y = -Math.PI / 2 + s * (0.1 + i * 0.012);   // aponta para trás (+z), levemente para fora
        f.rotation.z = s * 0.04;
      }
      // mão: coberteiras menores e as primárias em leque (da direção da asa, +x, até perto de trás)
      const hc = mk(new THREE.SphereGeometry(1, 12, 8), M.feather, s * HAND * 0.22, 0.012, 0.0, tip);
      hc.scale.set(HAND * 0.26, 0.045, 0.14);
      for (let i = 0; i < 10; i++) {
        const k = i / 9, len = HAND * (1 - 0.42 * k) * 0.9;
        const f = mk(featherGeo(len, 0.14 - 0.02 * k), i % 3 === 2 ? M.featherUnder : M.feather, s * (0.08 + HAND * 0.28 * (1 - k)), -0.004 - i * 0.0015, 0.03 + 0.1 * k, tip);
        // leque: a 1ª primária sai quase na direção da asa (+x), a última a ~70° para trás
        f.rotation.y = s === 1 ? -(0.08 + k * 1.15) : Math.PI + (0.08 + k * 1.15);
      }
    } else {
      // membrana de couro entre os dedos (mantícora): osso do braço, 4 dedos na mão, a membrana em painéis
      const boneMat = bone ?? M.hornDark, skin = membrane ?? M.leather;
      const armBone = mk(new THREE.CylinderGeometry(0.035, 0.045, ARM, 8), boneMat, s * ARM * 0.5, 0, -0.05, arm); armBone.rotation.z = Math.PI / 2;
      const pts = [];
      for (let i = 0; i < 4; i++) {
        const a = (0.1 + i * 0.36), len = HAND * (1 - i * 0.16);
        const fx = Math.cos(a) * len, fz = Math.sin(a) * len;
        const b = mk(new THREE.CylinderGeometry(0.012, 0.024, len, 6), boneMat, s * fx * 0.5, 0, fz * 0.5, tip);
        b.rotation.z = Math.PI / 2; b.rotation.y = s === 1 ? -a : Math.PI + a;
        pts.push([s * fx, fz]);
      }
      // painéis: do pulso até cada par de dedos consecutivos (e do último dedo de volta ao braço)
      const panel = (P, parentG) => {
        const sh = new THREE.Shape(); sh.moveTo(P[0][0], P[0][1]); for (const q of P.slice(1)) sh.lineTo(q[0], q[1]); sh.closePath();
        const g = new THREE.ShapeGeometry(sh); g.rotateX(Math.PI / 2);   // plano xz
        const m = mk(g, skin, 0, -0.01, 0, parentG); m.material = skin;
        return m;
      };
      for (let i = 0; i < 3; i++) panel([[0, 0], [pts[i][0], pts[i][1]], [(pts[i][0] + pts[i + 1][0]) * 0.46, (pts[i][1] + pts[i + 1][1]) * 0.62], [pts[i + 1][0], pts[i + 1][1]]], tip);
      panel([[-s * ARM, 0.05], [0, 0], [pts[3][0] * 0.9, pts[3][1] * 0.95], [-s * ARM * 0.4, HAND * 0.55], [-s * ARM, 0.3]], tip);
    }
    sides.push({ s, root, arm, tip });
  }
  /** Pose das asas: `wing`/`wingTip` = [x, y, z] graus (o mesmo valor nas duas; a esquerda espelhada). */
  const apply = (pose) => {
    const w = pose?.wing ?? [0, 0, 0], t = pose?.wingTip ?? [0, 0, 0];
    for (const { s, arm, tip } of sides) {
      arm.rotation.set(w[0] * DEG, s * -w[1] * DEG, s * w[2] * DEG, 'YZX');
      tip.rotation.set(t[0] * DEG, s * -t[1] * DEG, s * t[2] * DEG, 'YZX');
    }
  };
  apply(null);
  return { apply, sides, meshes };
}
