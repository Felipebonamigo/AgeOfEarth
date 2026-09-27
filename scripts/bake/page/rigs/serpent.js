// Rig da SERPENTE (Etapa 6, docs/ART.md §1.8 e Apêndice G): corpo em segmentos com ondulação — a hidra (N pescoços e
// cabeças) e a Medusa (torso humano sobre a cauda de serpente). O corpo tem dois ramos a partir da raiz (o ponto mais
// grosso, no chão): a CAUDA, para trás, com a onda que corre da frente para trás (o corpo segue o próprio rastro), e o
// PEITO, para a frente, erguido pelo escalar `lift`, de onde saem os pescoços (hidra) ou o torso humano (Medusa).
// As poses (art/poses/serpent.json) movem a raiz e ESCALARES, sem um pivô por vértebra:
//   wave   fase da onda (0–1; no andar vai de 0 a 1 no ciclo: uma onda por ciclo = a passada, `glide`)
//   amp    amplitude da onda (graus de rumo na ponta da cauda; cresce da raiz para a ponta)
//   lift   quanto o peito se ergue (graus por segmento)       coil  enrola a cauda em volta (0–1: parada, morte)
//   neck   inclinação dos pescoços para a frente (graus)       sway  fase do balanço dos pescoços (0–1, defasados)
//   swayAmp amplitude do balanço (graus)                       strike bote (0–1: os pescoços avançam e descem)
//   jaw    abertura das bocas (0–1)                            roll  tombo de lado (graus, morte)
// A Medusa usa também os pivôs e escalares do humano (torso, head, braços, bow/weapon; draw/hold).
// Kit (`source.params`):
//   form    'hydra' (corpo grosso de escamas, N pescoços com cabeças de serpente-dragão) · 'medusa'
//   heads   1–5 (hidra; a variante de unidade `heads` do manifesto assa as cinco)
//   scales  'bronze' (verde-bronze com faixas escuras, barriga creme) · 'green' · 'dark' · 'swamp' (hidra do lote feras:
//           dorso oliva-escuro de pântano, flanco bronze, escudos do ventre cor de osso, faixas quase negras)
//   team    'band' (faixa larga de time em volta do peito e colares de time nos pescoços) · 'sash' (Medusa: o talabarte)
//   torso   kit do rig humano para a Medusa (armor, tunicTeam, weapon 'bow'…)
// Hidra (lote feras, Etapa 6 — só no form 'hydra'; a Medusa não muda): corpo mais grosso de pele fosca (escama rugosa,
// sem o brilho de brinquedo), crista de espinhos ao longo do dorso e dos pescoços, escudos claros no ventre, pescoços
// longos e grossos (5 segmentos) abrindo em leque cada vez mais largo com as cabeças, e cabeças de serpente-dragão:
// crânio alongado, arcadas, chifres para trás, olhos em brasa, mandíbula com fileiras de dentes e a boca vermelha por
// dentro. Cada cabeça a mais abre o leque e sobe a silhueta (a hidra muda a zoom 1 com as cabeças).
// Metros, frente em −z, barriga em y = 0; o grupo externo converte para tiles.

import { M2T, dirYaw } from '../camera.js';
import { applyPose, poseAt, JOINTS as HUMAN_JOINTS, SCALARS as HUMAN_SCALARS } from './human.js';
import { paint, mottle, mix, smooth, taperTube } from './organic.js';
import { medusaTorso } from './medusa.js';

/** Pivôs do humano que a Medusa usa (as pernas não existem). */
const HUMAN_UPPER = ['torso', 'head', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'weapon', 'bow'];
export const JOINTS = ['root', ...HUMAN_UPPER];
export const SCALARS = ['wave', 'amp', 'lift', 'coil', 'neck', 'sway', 'swayAmp', 'strike', 'jaw', 'roll', ...HUMAN_SCALARS];
export const KIT = { form: ['hydra', 'medusa'], heads: [1, 2, 3, 4, 5], scales: ['bronze', 'green', 'dark', 'swamp'], team: ['band', 'sash'] };
const DEG = Math.PI / 180;
/** Formas: raio máximo, segmento, número de segmentos da cauda e do peito, segmentos por comprimento de onda. */
const FORMS = {
  // (a passada é o deslizar: seg × wave — a hidra continua com 0,3 × 7; neckR/headR = raio do pescoço na base e da cabeça)
  hydra: { r: 0.5, seg: 0.3, tail: 9, front: 3, wave: 7, neckSeg: 0.34, neckN: 5, neckR: 0.22, headR: 0.24 },
  medusa: { r: 0.3, seg: 0.27, tail: 10, front: 4, wave: 7, neckSeg: 0, neckN: 0 },
};
const SCALES = {
  bronze: { back: 0x5a6a3e, side: 0x86925a, belly: 0xd8c898, band: 0x364228 },
  green: { back: 0x3e5e38, side: 0x62824a, belly: 0xd0c894, band: 0x24381e },
  dark: { back: 0x34372c, side: 0x525542, belly: 0x9a9272, band: 0x1e2018 },
  swamp: { back: 0x4e5a32, side: 0x84904e, belly: 0xd8c690, band: 0x28301c, spine: 0x4a3a28 },
};

export function buildSerpent(THREE, M, params = {}) {
  const P = { form: 'hydra', heads: 1, scales: 'bronze', team: 'band', torso: {}, ...params };
  const F = FORMS[P.form] ?? FORMS.hydra, S = SCALES[P.scales] ?? SCALES.bronze;
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const joint = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const hydra = P.form === 'hydra';
  // hidra: a escama fosca de réptil grande (clone LOCAL de scaleV, mais rugoso: o brilho úmido de 0,42 lia como borracha;
  // materials.js intocado) e os olhos em brasa; a Medusa segue com os materiais do contrato
  const skin = hydra ? (() => { const m = M.scaleV.clone(); m.roughness = 0.66; return m; })() : M.scaleV;
  const eyeMat = hydra ? (() => { const m = M.eye.clone(); m.color.setHex(0xffc23a); m.emissive.setHex(0xffa020); m.emissiveIntensity = 1.1; return m; })() : M.eye;
  /** Escamas: dorso escuro com faixas transversais, flanco, barriga creme (y relativo ao eixo do segmento, raio r). */
  const scaleCol = (r, band) => (x, y, z) => {
    const t = (y + r) / (2 * r);
    let c = t < 0.35 ? mix(S.belly, S.side, smooth(0.2, 0.35, t)) : mix(S.side, S.back, smooth(0.45, 0.9, t));
    if (t > 0.5 && band) c = mix(c, S.band, 0.55 * smooth(0.55, 0.8, Math.abs(Math.sin((z + band) * 7.5))));
    return mottle(c, 0.08, x, y, z, 14, 5);
  };

  const group = new THREE.Group();
  const rig = new THREE.Group(); rig.scale.setScalar(M2T); group.add(rig);
  const J = {};
  J.root = joint(rig, 0, F.r, 0);
  const rollG = joint(J.root, 0, 0, 0);   // tombo de lado (escalar roll)
  const radius = (i, n, r0, r1) => r0 + (r1 - r0) * (i / Math.max(1, n - 1)) ** 1.3;

  // ---- cauda: segmentos encadeados para trás ----
  const tail = [];
  let parent = rollG;
  for (let i = 0; i < F.tail; i++) {
    const j = joint(parent, 0, 0, i === 0 ? 0 : F.seg);
    tail.push({ j, r: radius(i, F.tail, F.r, F.r * 0.14) });
    parent = j;
  }
  // ---- peito: segmentos para a frente, erguidos por `lift` ----
  const front = [];
  parent = rollG;
  for (let i = 0; i < F.front; i++) {
    const j = joint(parent, 0, 0, i === 0 ? 0 : -F.seg);
    front.push({ j, r: F.r * (1 - 0.1 * i) });
    parent = j;
  }
  const chest = joint(parent, 0, 0, -F.seg);
  // o CORPO é um tubo contínuo pelos pivôs (da ponta da cauda ao peito), refeito a cada pose (`rebuild`): sem as contas de
  // colar dos segmentos soltos; ponta da cauda afilada e o peito fechado por uma calota
  const body = mesh(new THREE.BufferGeometry(), skin, 0, 0, 0, rollG);
  const cap = mesh(new THREE.SphereGeometry(F.r * 0.86, 16, 12), skin, 0, 0, 0, chest); cap.scale.set(1, 0.95, 0.85);
  cap.updateMatrix(); paint(THREE, cap.geometry, scaleCol(F.r * 0.86, 0), cap.matrix);
  const teamParts = [];
  if (P.team === 'band' && P.form === 'hydra') {
    // manta de time sobre o dorso, logo atrás da raiz (a parte mais grossa, que a câmera vê de qualquer lado): casca de
    // cilindro por cima do tubo do corpo, com a borda de couro
    const back = tail[1].j, RR = F.r * 1.02, arc = 2.3, len = 0.5;
    const cl = mesh(new THREE.CylinderGeometry(RR, RR * 0.96, len, 22, 1, true, Math.PI - arc / 2, arc), M.team, 0, 0.0, 0.05, back);
    cl.rotation.x = Math.PI / 2;
    teamParts.push(cl);
    for (const e of [-1, 1]) mesh(new THREE.TorusGeometry(RR + 0.006, 0.018, 5, 22, arc), M.leather, 0, 0, 0.05 + e * len / 2, back).rotation.z = Math.PI / 2 - arc / 2;
    // faixa larga de time em volta do peito, com a borda de couro escuro e tachas de bronze
    const b = mesh(new THREE.CylinderGeometry(F.r * 0.97, F.r * 1.02, 0.34, 22, 1, true), M.team, 0, 0, F.seg * 0.5, front[front.length - 1].j);
    b.rotation.x = Math.PI / 2; b.scale.set(1, 1, 0.92);
    teamParts.push(b);
    for (const dz of [-0.17, 0.17]) { const t = mesh(new THREE.TorusGeometry(F.r * 1.0, 0.018, 5, 24), M.leather, 0, 0, F.seg * 0.5 + dz, front[front.length - 1].j); t.scale.set(1, 0.92, 1); }
  }

  // ---- hidra: N pescoços em leque, cada um com F.neckN segmentos e uma cabeça ----
  const necks = [];
  if (hydra) {
    const n = Math.max(1, Math.min(5, P.heads | 0));
    const spineCol = S.spine ?? S.band;
    /** Espinho dorsal (cone curvado para trás, +z) de altura h no pivô `parent`, a `y` do eixo. */
    const spineMat = M.hornDark.clone(); spineMat.color.setHex(spineCol);
    const spine = (parent, y, h, z = 0) => { const c = mesh(new THREE.ConeGeometry(h * 0.34, h, 6), spineMat, 0, y + h * 0.3, z, parent); c.rotation.x = 0.5; return c; };
    // crista ao longo do dorso: um espinho por segmento da cauda (menores para a ponta) e dois no peito
    tail.forEach(({ j }, i) => { if (i < F.tail - 1) spine(j, F.r * (0.07 + 0.93 * Math.pow((F.tail - i) / F.tail, 0.55)) * 0.9, 0.3 * (1 - i / F.tail) + 0.07, F.seg * 0.5); });
    front.forEach(({ j }, i) => { if (i) spine(j, F.r * 0.88, 0.28); });
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : (k / (n - 1) - 0.5) * 2;   // −1 … 1
      // leque cada vez mais aberto com mais cabeças (cinco pescoços ocupam ~120°) e os de fora um pouco mais baixos: a
      // silhueta da hidra muda a cada cabeça; a base dos pescoços em arco no alto do peito
      const base = joint(chest, off * F.r * 0.66, F.r * 0.32 - off * off * 0.1, 0.04 - Math.abs(off) * 0.08);
      base.rotation.y = -off * (0.26 + 0.12 * n);
      const segs = [];
      let p = base;
      for (let i = 0; i < F.neckN; i++) {
        const j = joint(p, 0, 0, i === 0 ? 0 : -F.neckSeg);
        segs.push(j);
        p = j;
        // espinhos dorsais do pescoço (segmentos 1–3)
        if (i >= 1 && i <= 3) spine(j, F.neckR * (1 - 0.1 * i), 0.16 - 0.02 * i, F.neckSeg * 0.4);
      }
      // o pescoço é um tubo pelos pivôs (refeito a cada pose), grosso na base e fino na cabeça
      const tube = mesh(new THREE.BufferGeometry(), skin, 0, 0, 0, rollG);
      if (P.team === 'band') {
        const c = mesh(new THREE.TorusGeometry(F.neckR * 1.02, 0.05, 6, 18), M.team, 0, 0, -F.neckSeg * 0.35, segs[0]);
        teamParts.push(c);
      }
      // cabeça de serpente-dragão
      const head = joint(p, 0, 0, -F.neckSeg);
      const hr = F.headR;
      const hc = scaleCol(hr, 0);
      const part = (geo, fn, x, y, z, sc, parent = head, mat = skin) => { const m = mesh(geo, mat, x, y, z, parent); m.scale.set(sc[0], sc[1], sc[2]); m.updateMatrix(); paint(THREE, geo, fn, m.matrix); return m; };
      part(new THREE.SphereGeometry(hr, 16, 12), hc, 0, hr * 0.18, -hr * 0.5, [0.95, 0.72, 1.35]);                    // crânio
      part(new THREE.SphereGeometry(hr * 0.72, 14, 10), hc, 0, hr * 0.05, -hr * 1.45, [0.78, 0.55, 1.55]);           // focinho
      for (const s of [-1, 1]) {
        part(new THREE.SphereGeometry(hr * 0.26, 10, 8), () => S.back, s * hr * 0.44, hr * 0.5, -hr * 0.85, [1, 0.6, 1.6]);   // arcada
        mesh(new THREE.SphereGeometry(hr * 0.13, 8, 6), eyeMat, s * hr * 0.5, hr * 0.36, -hr * 1.0, head);
        const hornG = taperTube(THREE, [[0, 0, 0], [s * 0.03, 0.08, 0.1], [s * 0.07, 0.12, 0.24], [s * 0.1, 0.1, 0.36]], hr * 0.2, 0.006, { tubular: 10, radial: 7 });
        mesh(hornG, M.hornDark, s * hr * 0.4, hr * 0.62, -hr * 0.2, head);
      }
      // crista no alto do crânio
      for (let i = 0; i < 3; i++) { const c = mesh(new THREE.ConeGeometry(hr * 0.1, hr * 0.42, 5), M.hornDark, 0, hr * (0.72 - i * 0.05), -hr * (0.55 - i * 0.35), head); c.rotation.x = 0.7; }
      // mandíbula (abre com `jaw`): o queixo claro, a boca vermelho-escura por dentro e as fileiras de dentes
      const jaw = joint(head, 0, -hr * 0.28, -hr * 0.2);
      part(new THREE.SphereGeometry(hr * 0.8, 12, 8), (x, y, z) => mottle(S.belly, 0.08, x, y, z, 20, 3), 0, -hr * 0.1, -hr * 1.05, [0.85, 0.3, 1.6], jaw);
      const maw = M.skin.clone(); maw.color.setHex(0x5a1a16); maw.roughness = 0.5;
      mesh(new THREE.SphereGeometry(hr * 0.6, 10, 8), maw, 0, hr * 0.02, -hr * 1.1, jaw).scale.set(0.75, 0.25, 1.45);
      mesh(new THREE.SphereGeometry(hr * 0.55, 10, 8), maw, 0, -hr * 0.2, -hr * 1.35, head).scale.set(0.72, 0.22, 1.5);
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
        const zz = -hr * (1.2 + i * 0.28), xx = s * hr * (0.5 - i * 0.07);
        mesh(new THREE.ConeGeometry(hr * 0.055, hr * (i ? 0.2 : 0.34), 5), M.horn, xx, hr * 0.06, zz, jaw);
        const up = mesh(new THREE.ConeGeometry(hr * 0.05, hr * (i ? 0.18 : 0.3), 5), M.horn, xx, -hr * 0.22, zz - hr * 0.1, head); up.rotation.x = Math.PI;
      }
      necks.push({ base, segs, head, jaw, k, n, tube });
    }
  }

  // ---- Medusa: o tronco da górgona com o corpo esculpido (rigs/medusa.js: lote bípedes-espíritos da Etapa 6) ----
  let human = null;
  if (P.form === 'medusa') human = medusaTorso(THREE, M, chest, P, F);
  const segments = { tail, front, necks };
  const v = new THREE.Vector3();
  const local = (o) => rollG.worldToLocal(o.getWorldPosition(v.set(0, 0, 0)).clone());
  /** Cor das escamas por vértice pela NORMAL (dorso para cima, barriga para baixo) e faixas pelo anel do tubo. */
  const colorTube = (geo, tubular, radial, bandEvery, seed) => {
    const n = geo.attributes.normal, p = geo.attributes.position, col = new Float32Array(n.count * 3), c = new THREE.Color();
    for (let i = 0; i <= tubular; i++) for (let j2 = 0; j2 <= radial; j2++) {
      const q = i * (radial + 1) + j2, t = (n.getY(q) + 1) / 2;
      let hex = t < 0.38 ? mix(S.belly, S.side, smooth(0.22, 0.38, t)) : mix(S.side, S.back, smooth(0.5, 0.9, t));
      if (t > 0.45 && bandEvery) hex = mix(hex, S.band, 0.5 * smooth(0.5, 0.8, t) * (((i + seed) % bandEvery) < bandEvery / 3 ? 1 : 0));
      // hidra: os escudos transversais do ventre (anéis alternados mais claros/escuros embaixo)
      if (hydra && t < 0.3) hex = mix(hex, 0x7a6c48, 0.35 * (i % 2));
      c.setHex(mottle(hex, 0.08, p.getX(q), p.getY(q), p.getZ(q), 14, 5));
      col[q * 3] = c.r; col[q * 3 + 1] = c.g; col[q * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  };
  /** Refaz os tubos do corpo e dos pescoços pelos pivôs da pose atual (depois de girar os pivôs). */
  const rebuild = () => {
    rig.updateMatrixWorld(true);
    const pts = [...tail.map((s) => local(s.j)).reverse()];
    const tipDir = pts[0].clone().sub(pts[1]).normalize();
    pts.unshift(pts[0].clone().addScaledVector(tipDir, F.seg * 0.8));
    for (const f of front.slice(1)) pts.push(local(f.j));
    pts.push(local(chest));
    const N = pts.length, tubular = (N - 1) * 3, radial = 14;
    const rAt = (u) => {
      const idx = u * (N - 1);   // 0 = ponta da cauda … F.tail = raiz … N−1 = peito
      if (idx <= F.tail) return F.r * (0.07 + 0.93 * Math.pow(idx / F.tail, 0.55));
      return F.r * (1 - 0.18 * (idx - F.tail) / Math.max(1, N - 1 - F.tail));
    };
    const g = taperTube(THREE, pts, 0, 0, { tubular, radial, rFn: rAt });
    colorTube(g, tubular, radial, 5, 0);
    body.geometry.dispose(); body.geometry = g;
    for (const nk of necks) {
      const np = [local(nk.base), ...nk.segs.slice(1).map(local), local(nk.head)];
      const tb = np.length * 3, rr = F.neckR ?? F.r * 0.44;
      const ng = taperTube(THREE, np, 0, 0, { tubular: tb, radial: 12, rFn: (u) => rr * (1 - 0.42 * u) });
      colorTube(ng, tb, 10, 4, nk.k);
      nk.tube.geometry.dispose(); nk.tube.geometry = ng;
    }
  };
  return { group, joints: J, rollG, segments, chest, human, teamParts, F, rebuild };
}

/** Aplica a pose: raiz, escalares do corpo (onda, peito, pescoços) e, na Medusa, os pivôs humanos. */
export function applySerpentPose(rig, pose) {
  const { root } = rig.joints, F = rig.F;
  const pos = pose.root?.pos ?? [0, 0, 0], rot = pose.root?.rot ?? [0, 0, 0];
  root.position.set(pos[0], F.r + pos[1], pos[2]);
  root.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
  rig.rollG.rotation.z = (pose.roll ?? 0) * DEG;
  const wave = pose.wave ?? 0, amp = (pose.amp ?? 0) * DEG, coil = pose.coil ?? 0, lift = (pose.lift ?? 0) * DEG;
  // cauda: rumo de cada segmento pela onda (amplitude crescendo da raiz à ponta); a rotação local é a diferença de rumo
  let prevHead = 0;
  rig.segments.tail.forEach(({ j }, i) => {
    const a = amp * smooth(0, 3, i) * (0.6 + 0.4 * i / rig.segments.tail.length);
    const h = a * Math.sin(2 * Math.PI * (wave - i / F.wave)) + coil * 0.5 * i / rig.segments.tail.length;
    j.rotation.set(0, i === 0 ? h : h - prevHead + coil * 0.32, 0);
    prevHead = h;
  });
  // peito: sobe `lift` graus por segmento (x positivo ergue o que aponta para −z) e acompanha um pouco a onda
  rig.segments.front.forEach(({ j }, i) => {
    j.rotation.set(lift * (i === 0 ? 0.6 : 1), i === 0 ? -amp * 0.18 * Math.sin(2 * Math.PI * (wave + 1 / F.wave)) : 0, 0);
  });
  // pescoços: inclinam para a frente, balançam (cada um na sua fase) e dão o bote; a boca abre com `jaw`
  const neck = (pose.neck ?? 0) * DEG, sw = pose.sway ?? 0, swA = (pose.swayAmp ?? 0) * DEG, strike = pose.strike ?? 0, jaw = pose.jaw ?? 0;
  for (const nk of rig.segments.necks) {
    const ph = 2 * Math.PI * (sw + nk.k / Math.max(1, nk.n) * 0.61);
    // (os pescoços pares dão o bote um pouco depois dos ímpares: as cabeças não golpeiam todas no mesmo quadro)
    const st = nk.n > 1 ? Math.max(0, Math.min(1, strike * 1.3 - (nk.k % 2) * 0.3)) : strike;
    nk.base.rotation.x = 0.95 - neck * 0.5 - st * 0.7 + (nk.n > 1 ? Math.abs((nk.k / (nk.n - 1)) - 0.5) * 0.25 : 0);
    nk.segs.forEach((j, i) => {
      if (i === 0) return;
      j.rotation.set(-(0.1 + 0.045 * i) - neck * 0.16 + st * 0.26 * (i / nk.segs.length), swA * Math.sin(ph + i * 0.7) * (0.45 + 0.16 * i), 0);
    });
    nk.head.rotation.set(-0.5 - neck * 0.3 + st * 0.25, swA * 0.3 * Math.sin(ph + 2.5), 0);
    nk.jaw.rotation.x = jaw * 0.75;
  }
  if (rig.human) {
    const hp = {};
    for (const n of HUMAN_UPPER) if (pose[n]) hp[n] = pose[n];
    for (const s of HUMAN_SCALARS) if (pose[s] !== undefined) hp[s] = pose[s];
    applyPose(rig.human, { ...hp, root: { pos: [0, 0, 0] } });
    rig.human.post(hp);
    rig.human.skin?.();
  }
  rig.rebuild();
  rig.human?.upright?.(rig.rollG);
}

/**
 * Rig de unidade serpente para o bake. `glide` (passada, measure.mjs): o corpo segue o próprio rastro, então avança um
 * comprimento de onda (F.wave segmentos) por onda; a pose de andar vai de wave 0 a 1 no ciclo.
 */
export function serpentUnit(THREE, M, params) {
  const rig = buildSerpent(THREE, M, params);
  return {
    group: rig.group, feet: [], thin: rig.human?.thin ?? [],
    glide(a, poses) {
      const def = poses.main?.anims?.[a.pose];
      if (!def) return 0;
      // ondas no ciclo: soma dos passos de fase quadro a quadro, cada um trazido para (−½, ½] (a fase volta de 1 para 0)
      let waves = 0;
      for (let i = 0; i < a.frames; i++) {
        const w0 = poseAt(def, i, a.frames, ['root'], ['wave']).wave ?? 0, w1 = poseAt(def, (i + 1) % a.frames, a.frames, ['root'], ['wave']).wave ?? 0;
        let d = (w1 - w0) % 1; if (d > 0.5) d -= 1; if (d <= -0.5) d += 1;
        waves += d;
      }
      return Math.abs(waves) * rig.F.wave * rig.F.seg * M2T;
    },
    pose(fr, poses) {
      const def = poses.main?.anims?.[fr.pose];
      if (!def) throw new Error(`pose de serpente ${fr.pose} ausente`);
      rig.human?.setAnim(fr.anim);
      applySerpentPose(rig, poseAt(def, fr.frame, fr.frames, JOINTS, SCALARS));
      rig.group.rotation.y = dirYaw(fr.dir);
    },
  };
}
