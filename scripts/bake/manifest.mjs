// Manifestos de arte (docs/ART.md §3.4): leitura, validação mínima e expansão em quadros. Módulo puro (sem three.js,
// sem DOM): usado pelo bake (Node), pelo `art:check` e por `tests/art-manifest.test.ts` (tipos em manifest.d.mts).
//
// Um manifesto por arquivo em art/manifest/<id>.json. Nomes de quadro (os mesmos nos três passes — cor, time, sombra):
//   unidade   <id>/<anim>/<dir>/<quadro 2 dígitos>          ex.: hoplite/walk/3/05   (animação: hoplite/walk/3)
//   edifício  <id>/<estado>  ou  <id>/<estado>/<variante|quadro>   ex.: temple/build0, wall/complete/05, gate/open/ns
//   prop      <kind>/<variante>[/<tag>]                     ex.: olive/2/big, stump/1, berry/full, deer/4
//   ícone     <id>                                          ex.: house (atlas `icons`, 64×64 a 1×, docs/ART.md §1.10)
//
// Edifícios (Etapa 3): `anims` = estados; todo edifício com arte declara os 6 de BUILDING_STATES (o portão também
// `open`); `variants` + `variantBy` multiplicam os estados (muralha: bitmask 00–15; portão: eixo ew/ns; Centro Cívico:
// Idade a0–a2; fazenda: plantação sown/growing/ripe); `icon: { anim, variant? }` pede o ícone do HUD; `rubble: true`
// marca o conjunto de escombros (um estado por pegada, ex.: rubble/3x3); `contact` dá o nome da folha de contato.

import fs from 'node:fs';
import path from 'node:path';
import { DIRS, FPS, MIRROR_BAKED, MIRROR_FROM } from './page/camera.js';

export const KINDS = ['unit', 'building', 'prop'];
/** Grupo de atlas de cada tipo de asset (units-1x-0.png, buildings-1x-0.png, props-1x-0.png). */
export const GROUP_OF = { unit: 'units', building: 'buildings', prop: 'props' };
/** Todos os grupos de atlas (os ícones do HUD vão para `icons`, com cor e máscara de time). */
export const ATLAS_GROUPS = ['units', 'buildings', 'props', 'icons'];
export const PASSES = ['color', 'team', 'shadow'];
/** Estados de todo edifício com arte (docs/ART.md §1.8): obra 0–2, pronto, dano 1–2. */
export const BUILDING_STATES = ['build0', 'build1', 'build2', 'complete', 'damage1', 'damage2'];
/** Como o renderizador escolhe a variante de um edifício (src/render/art/logic.ts). */
export const VARIANT_BY = ['wallMask', 'gateAxis', 'ageTier', 'farmCrop'];
/** Lado do ícone a 1× (px). */
export const ICON_PX = 64;
/** Rigs paramétricos conhecidos pela página de bake (scripts/bake/page/rigs/*.js, props.js, buildings.js). */
export const RIGS = ['human', 'building', 'props'];

export const FRAME_NAME_RE = {
  unit: /^[a-z][a-z0-9_]*\/[a-z][a-z0-9_]*\/[0-7]\/\d{2}$/,
  building: /^[a-z][a-z0-9_]*\/[a-z0-9][a-z0-9_]*(\/[a-z0-9_]+)?$/,
  prop: /^[a-z][a-z0-9_]*\/[a-z0-9_]+(\/[a-z0-9_]+)?$/,
  icon: /^[a-z][a-z0-9_]*$/,
};

const pad2 = (n) => String(n).padStart(2, '0');

/** Lê todos os manifestos de `dir` (ordenados por nome de arquivo). */
export function loadManifests(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => ({ file: path.join(dir, f), manifest: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const inUnit = (v) => isNum(v) && v >= 0 && v <= 1;

/** Validação mínima do esquema. Devolve a lista de erros (vazia = válido). */
export function validateManifest(m) {
  const e = [];
  const where = `manifesto ${m?.id ?? '?'}`;
  if (!m || typeof m !== 'object') return ['manifesto não é objeto'];
  if (typeof m.id !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(m.id)) e.push(`${where}: id inválido`);
  if (!KINDS.includes(m.kind)) e.push(`${where}: kind deve ser ${KINDS.join('|')}`);
  if (typeof m.docs !== 'string' || !m.docs.includes('glb')) e.push(`${where}: campo docs (1 linha sobre trocar por .glb) ausente`);
  const s = m.source;
  if (!s || (s.type !== 'param' && s.type !== 'glb')) e.push(`${where}: source.type deve ser param|glb`);
  else if (s.type === 'param') {
    if (!RIGS.includes(s.rig)) e.push(`${where}: source.rig desconhecido (${s.rig})`);
    if (s.rig === 'props' && (!Array.isArray(s.items) || !s.items.length)) e.push(`${where}: props sem items`);
  } else {
    if (typeof s.path !== 'string') e.push(`${where}: source.path ausente`);
    if (!isNum(s.scale)) e.push(`${where}: source.scale ausente`);
  }
  const t = m.size?.tiles;
  if (!Array.isArray(t) || t.length !== 2 || !t.every((v) => isNum(v) && v > 0 && v <= 12)) e.push(`${where}: size.tiles [w, h] inválido`);
  if (!Array.isArray(m.anchor) || m.anchor.length !== 2 || !m.anchor.every(inUnit)) e.push(`${where}: anchor fora de [0,1]`);
  if (m.kind === 'unit' && m.dirs !== 8) e.push(`${where}: unidades têm 8 direções`);
  if (m.kind !== 'unit' && m.dirs !== undefined && m.dirs !== 1) e.push(`${where}: só unidades têm direções`);
  if (m.kind !== 'prop') {
    if (!m.anims || typeof m.anims !== 'object' || !Object.keys(m.anims).length) e.push(`${where}: anims vazio`);
    else for (const [name, a] of Object.entries(m.anims)) {
      if (!(m.kind === 'building' ? /^[a-z0-9][a-z0-9_]*$/ : /^[a-z][a-z0-9_]*$/).test(name)) e.push(`${where}: nome de animação inválido ${name}`);
      if (!Number.isInteger(a?.frames) || a.frames < 1 || a.frames > 32) e.push(`${where}: ${name}.frames inválido`);
      if (a?.fps !== undefined && !(isNum(a.fps) && a.fps > 0)) e.push(`${where}: ${name}.fps inválido`);
      if (m.kind === 'unit' && s?.type === 'param' && typeof a?.pose !== 'string') e.push(`${where}: ${name}.pose ausente`);
    }
  } else if (s?.type === 'param' && Array.isArray(s.items)) {
    for (const it of s.items) {
      if (typeof it.kind !== 'string' || !Array.isArray(it.variants) || !it.variants.length) e.push(`${where}: item de prop inválido`);
      if (it.anchor && !(Array.isArray(it.anchor) && it.anchor.every(inUnit))) e.push(`${where}: anchor de ${it.kind} fora de [0,1]`);
    }
  }
  if (m.kind === 'building') {
    const states = Object.keys(m.anims ?? {});
    if (!m.rubble) for (const st of BUILDING_STATES) if (!states.includes(st)) e.push(`${where}: estado ${st} ausente (edifícios têm ${BUILDING_STATES.join(', ')})`);
    if (m.variants !== undefined) {
      if (!Array.isArray(m.variants) || !m.variants.length || !m.variants.every((v) => typeof v === 'string' && /^[a-z0-9_]+$/.test(v))) e.push(`${where}: variants deve ser lista de nomes [a-z0-9_]`);
      else if (new Set(m.variants).size !== m.variants.length) e.push(`${where}: variants repetidas`);
      if (!VARIANT_BY.includes(m.variantBy)) e.push(`${where}: variantBy deve ser ${VARIANT_BY.join('|')}`);
      for (const [name, a] of Object.entries(m.anims ?? {})) if ((a?.frames ?? 1) > 1) e.push(`${where}: ${name} com variantes não pode ter vários quadros`);
    } else if (m.variantBy !== undefined) e.push(`${where}: variantBy sem variants`);
    if (m.icon !== undefined) {
      if (!m.icon || typeof m.icon.anim !== 'string' || !m.anims?.[m.icon.anim]) e.push(`${where}: icon.anim deve ser um estado do manifesto`);
      else if (m.variants && !m.variants.includes(m.icon.variant)) e.push(`${where}: icon.variant deve ser uma das variants`);
    }
  } else if (m.variants !== undefined || m.icon !== undefined || m.rubble !== undefined) e.push(`${where}: variants/icon/rubble só em edifícios`);
  if (typeof m.team !== 'boolean') e.push(`${where}: team deve ser boolean`);
  if (typeof m.shadow !== 'boolean') e.push(`${where}: shadow deve ser boolean`);
  return e;
}

/** Erros entre manifestos (ids repetidos, nomes de quadro repetidos entre props). */
export function validateAll(list) {
  const e = [];
  const ids = new Set();
  const names = new Map();
  for (const m of list) {
    if (ids.has(m.id)) e.push(`id repetido: ${m.id}`);
    ids.add(m.id);
    for (const f of expandFrames(m)) {
      if (names.has(f.name)) e.push(`quadro ${f.name} declarado em ${names.get(f.name)} e ${m.id}`);
      names.set(f.name, m.id);
    }
  }
  return e;
}

/** Direções efetivamente assadas (com `mirror`, só S, SO, O, NO, N; as outras 3 são espelhadas no jogo). */
export function bakedDirs(m, mirror = false) {
  if (m.kind !== 'unit') return [0];
  return mirror ? [...MIRROR_BAKED] : Array.from({ length: m.dirs ?? DIRS }, (_, i) => i);
}

/** Grupo de atlas de um quadro expandido (ícones vão para `icons`). */
export function atlasOf(m, f) { return f.atlas ?? GROUP_OF[m.kind]; }

/**
 * Lista de quadros a assar de um manifesto: `{ name, group, anim?, dir, frame, frames, loop, pose?, item?, variant?,
 * atlas?, icon? }`. `group` = quadros que compartilham `sourceSize`/`anchor` no atlas (unidade/edifício: o asset
 * inteiro; prop e ícone: cada quadro). `atlas` = grupo de atlas quando difere do kind (ícones: 'icons').
 */
export function expandFrames(m, { mirror = false } = {}) {
  const out = [];
  if (m.kind === 'prop') {
    const items = m.source?.items ?? [];
    for (const it of items) for (const v of it.variants) for (const tag of it.tags ?? [null]) {
      const name = tag ? `${it.kind}/${v}/${tag}` : `${it.kind}/${v}`;
      out.push({ name, group: name, dir: 0, frame: 0, frames: 1, loop: false, item: { kind: it.kind, variant: v, tag, size: it.size, anchor: it.anchor } });
    }
    return out;
  }
  for (const [anim, a] of Object.entries(m.anims ?? {})) {
    const loop = a.loop ?? (m.kind === 'unit' ? !['attack', 'die'].includes(anim) : true);
    if (m.kind === 'building' && m.variants) {
      for (const v of m.variants) out.push({ name: `${m.id}/${anim}/${v}`, group: m.id, anim, variant: v, dir: 0, frame: 0, frames: 1, loop, params: a.params });
      continue;
    }
    for (const dir of bakedDirs(m, mirror)) for (let i = 0; i < a.frames; i++) {
      const name = m.kind === 'unit' ? `${m.id}/${anim}/${dir}/${pad2(i)}` : a.frames > 1 ? `${m.id}/${anim}/${pad2(i)}` : `${m.id}/${anim}`;
      out.push({ name, group: m.id, anim, dir, frame: i, frames: a.frames, loop, pose: a.pose, params: a.params });
    }
  }
  if (m.kind === 'building' && m.icon && m.anims?.[m.icon.anim]) {
    out.push({ name: m.id, group: `icon:${m.id}`, atlas: 'icons', icon: true, anim: m.icon.anim, variant: m.icon.variant, dir: 0, frame: 0, frames: 1, loop: false, params: m.anims[m.icon.anim].params });
  }
  return out;
}

/**
 * Animações que o JSON do atlas declara para o manifesto: `{ nome: [quadros] }`. Com `mirror`, as direções espelhadas
 * (E, SE, NE) apontam para os quadros da direção de origem (O, SO, NO) — o jogo desenha com `scale.x = -1`.
 */
export function animationsOf(m, { mirror = false } = {}) {
  const out = {};
  if (m.kind === 'prop') return out;
  for (const [anim, a] of Object.entries(m.anims ?? {})) {
    if (m.kind === 'unit') {
      for (let dir = 0; dir < (m.dirs ?? DIRS); dir++) {
        const src = mirror && MIRROR_FROM[dir] !== undefined ? MIRROR_FROM[dir] : dir;
        out[`${m.id}/${anim}/${dir}`] = Array.from({ length: a.frames }, (_, i) => `${m.id}/${anim}/${src}/${pad2(i)}`);
      }
    } else if (a.frames > 1) out[`${m.id}/${anim}`] = Array.from({ length: a.frames }, (_, i) => `${m.id}/${anim}/${pad2(i)}`);
  }
  return out;
}

/** Resumo das animações para o índice public/art/manifest.json. */
export function animSummary(m) {
  const out = {};
  for (const [anim, a] of Object.entries(m.anims ?? {})) {
    out[anim] = { frames: a.frames, fps: a.fps ?? FPS, loop: a.loop ?? (m.kind === 'unit' ? !['attack', 'die'].includes(anim) : true) };
  }
  return out;
}

/** Filtro `--only a,b`: casa id exato, prefixo com hífen (props → props-trees) ou grupo/kind (units, prop…). */
export function matchesOnly(m, only) {
  if (!only || !only.length) return true;
  return only.some((o) => o === m.id || m.id.startsWith(o + '-') || o === m.kind || o === GROUP_OF[m.kind]);
}

/** Nome do quadro de edifício: `<id>/<estado>` ou `<id>/<estado>/<variante>` (o mesmo de src/render/art/logic.ts). */
export function buildingFrame(id, state, variant) { return variant ? `${id}/${state}/${variant}` : `${id}/${state}`; }
