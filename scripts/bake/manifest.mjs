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
import { UNIT_KITS, DEFAULT_POSES, NESTED_HUMAN } from './page/rigs/units.js';

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
/** Rigs paramétricos conhecidos pela página de bake (scripts/bake/page/rigs/*.js, props.js, buildings.js). Etapa 6:
 *  `beast` (quadrúpede grande), `giant` (bípede grande sobre o rig humano), `serpent` (corpo em segmentos) e `titan`
 *  (lote titãs: corpo esculpido sobre os pivôs do humano, a cauda do Oceano). */
export const RIGS = ['human', 'horse', 'siege', 'beast', 'giant', 'serpent', 'titan', 'building', 'props'];
/**
 * Classes de tamanho das unidades (Etapa 6): teto do lado do quadro (sourceSize) a 1× que o `art:check` aceita — `unit`
 * (humanos, cavalaria, cerco: 128 px), `myth` (criaturas grandes, voadoras com a sombra longe do corpo, hidra: 192 px) e
 * `titan` (titãs e o colosso: 288 px). O manifesto escolhe em `sizeClass` (padrão `unit`).
 */
export const SIZE_CLASSES = { unit: 128, myth: 192, titan: 288 };
/** Critérios de variante de UNIDADE (Etapa 6): `heads` = pelo número de cabeças da entidade (hidra, 1–5). */
export const UNIT_VARIANT_BY = ['heads'];
/** Rigs de unidade (registro em scripts/bake/page/rigs/units.js) e o arquivo de poses padrão de cada um. */
export const UNIT_RIG_POSES = DEFAULT_POSES;
/** Animações de unidade que o renderizador conhece (src/render/art/logic.ts `UnitAnim`): as 4 obrigatórias e as
 *  especiais — carry/gather (cidadão), aim (à distância no posto entre disparos), run (galope acima de RUN_SPEED) e
 *  ability (a habilidade Q do herói, uma vez, no tick em que é usada). Etapa 6 (lote titãs): rise (a ascensão — sai do
 *  chão ao nascer: o titã do Portal dos Titãs; uma vez, do tick em que a unidade surgiu). */
export const UNIT_ANIMS = ['idle', 'walk', 'attack', 'die', 'carry', 'gather', 'aim', 'run', 'ability', 'rise'];
export const REQUIRED_UNIT_ANIMS = ['idle', 'walk', 'attack', 'die'];
/** Animações de unidade que tocam uma vez (sem loop), do quadro 0: golpe/disparo, morte, habilidade e ascensão. */
export const ONCE_UNIT_ANIMS = ['attack', 'die', 'ability', 'rise'];

/** Arquivo de poses de um manifesto de unidade paramétrico (o do rig, se o manifesto não trouxer) e o do cavaleiro. */
export function posesOf(m) {
  const s = m?.source;
  if (!s || s.type !== 'param' || !DEFAULT_POSES[s.rig]) return { main: null, rider: null };
  return { main: s.poses ?? DEFAULT_POSES[s.rig], rider: s.rig === 'horse' && s.params?.rider !== null ? (s.riderPoses ?? DEFAULT_POSES.human) : null };
}

/** Erros do kit (`source.params`) contra os valores aceitos pelo rig (e o kit humano do cavaleiro). */
function kitErrors(where, kit, params) {
  const e = [];
  for (const [k, allowed] of Object.entries(kit ?? {})) {
    const v = params?.[k];
    if (v !== undefined && !allowed.includes(v)) e.push(`${where}: ${k} = ${JSON.stringify(v)} (aceitos: ${allowed.join(', ')})`);
  }
  return e;
}

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
    if (UNIT_KITS[s.rig]) {
      if (m.kind !== 'unit') e.push(`${where}: rig ${s.rig} é de unidade`);
      e.push(...kitErrors(where, UNIT_KITS[s.rig], s.params));
      // kits humanos aninhados: o cavaleiro, o corpo do bípede grande (Etapa 6) e o torso da Medusa
      const nested = NESTED_HUMAN[s.rig];
      if (nested && s.params?.[nested]) e.push(...kitErrors(`${where} (${nested === 'rider' ? 'cavaleiro' : nested})`, UNIT_KITS.human, s.params[nested]));
    }
  } else {
    if (typeof s.path !== 'string') e.push(`${where}: source.path ausente`);
    if (!isNum(s.scale)) e.push(`${where}: source.scale ausente`);
  }
  const t = m.size?.tiles;
  if (!Array.isArray(t) || t.length !== 2 || !t.every((v) => isNum(v) && v > 0 && v <= 12)) e.push(`${where}: size.tiles [w, h] inválido`);
  if (!Array.isArray(m.anchor) || m.anchor.length !== 2 || !m.anchor.every(inUnit)) e.push(`${where}: anchor fora de [0,1]`);
  if (m.kind === 'unit' && m.dirs !== 8) e.push(`${where}: unidades têm 8 direções`);
  // Etapa 6: classe de tamanho, escalas assadas, voadora, página própria e variantes de unidade
  if (m.sizeClass !== undefined && !Object.hasOwn(SIZE_CLASSES, m.sizeClass)) e.push(`${where}: sizeClass deve ser ${Object.keys(SIZE_CLASSES).join('|')}`);
  if (m.scales !== undefined && !(Array.isArray(m.scales) && m.scales.length && m.scales.every((v) => v === 1 || v === 2) && new Set(m.scales).size === m.scales.length && m.scales.includes(1))) e.push(`${where}: scales deve ser [1] ou [1, 2] (a 1× é obrigatória)`);
  if (m.flying !== undefined && (typeof m.flying !== 'boolean' || m.kind !== 'unit')) e.push(`${where}: flying (boolean) só em unidades`);
  if (m.page !== undefined && m.page !== 'own') e.push(`${where}: page só aceita 'own'`);
  if (m.mirror !== undefined && (typeof m.mirror !== 'boolean' || m.kind !== 'unit' || (m.mirror && m.page !== 'own'))) e.push(`${where}: mirror (boolean) só em unidades com página própria (page: 'own')`);
  for (const k of ['contactDirs', 'variantContactDirs']) if (m[k] !== undefined && !(Array.isArray(m[k]) && m[k].length && m[k].every((d) => Number.isInteger(d) && d >= 0 && d < 8))) e.push(`${where}: ${k} deve listar direções 0–7`);
  if (m.unitVariants !== undefined) {
    const v = m.unitVariants;
    if (m.kind !== 'unit') e.push(`${where}: unitVariants só em unidades`);
    else if (!v || !UNIT_VARIANT_BY.includes(v.by) || typeof v.param !== 'string' || !Array.isArray(v.values) || v.values.length < 2 || !v.values.every((x) => Number.isInteger(x) && x >= 1 && x <= 9) || new Set(v.values).size !== v.values.length) e.push(`${where}: unitVariants = { by: ${UNIT_VARIANT_BY.join('|')}, param, values: [inteiros 1–9, ≥ 2 distintos] }`);
  }
  if (m.kind === 'unit' && m.anims) for (const a of REQUIRED_UNIT_ANIMS) if (!m.anims[a]) e.push(`${where}: animação ${a} ausente (unidades têm ${REQUIRED_UNIT_ANIMS.join(', ')})`);
  if (m.stage !== undefined && !(Number.isInteger(m.stage) && m.stage >= 2 && m.stage <= 8)) e.push(`${where}: stage (etapa da folha de contato) deve ser 2–8`);
  if (m.kind !== 'unit' && m.dirs !== undefined && m.dirs !== 1) e.push(`${where}: só unidades têm direções`);
  if (m.kind !== 'prop') {
    if (!m.anims || typeof m.anims !== 'object' || !Object.keys(m.anims).length) e.push(`${where}: anims vazio`);
    else for (const [name, a] of Object.entries(m.anims)) {
      if (!(m.kind === 'building' ? /^[a-z0-9][a-z0-9_]*$/ : /^[a-z][a-z0-9_]*$/).test(name)) e.push(`${where}: nome de animação inválido ${name}`);
      if (!Number.isInteger(a?.frames) || a.frames < 1 || a.frames > 32) e.push(`${where}: ${name}.frames inválido`);
      if (a?.fps !== undefined && !(isNum(a.fps) && a.fps > 0)) e.push(`${where}: ${name}.fps inválido`);
      if (m.kind === 'unit' && s?.type === 'param' && typeof a?.pose !== 'string') e.push(`${where}: ${name}.pose ausente`);
      if (m.kind === 'unit' && s?.type === 'param' && s.rig === 'horse' && s.params?.rider !== null && typeof a?.rider !== 'string') e.push(`${where}: ${name}.rider (pose do cavaleiro) ausente`);
      if (m.kind === 'unit' && !UNIT_ANIMS.includes(name)) e.push(`${where}: animação de unidade desconhecida ${name} (${UNIT_ANIMS.join(', ')})`);
      // Etapa 6 (lote titãs): uma animação pode ser assada em menos direções (`dirs`: a ascensão do titã só de frente);
      // as outras apontam para a mais próxima (animDirOf)
      if (a?.dirs !== undefined && !(m.kind === 'unit' && Array.isArray(a.dirs) && a.dirs.length && a.dirs.every((d) => Number.isInteger(d) && d >= 0 && d < 8) && new Set(a.dirs).size === a.dirs.length)) e.push(`${where}: ${name}.dirs deve listar direções 0–7 distintas (só unidades)`);
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

/** Id do asset de uma variante de unidade (`hydra` + heads 3 → `hydra_heads3`); o primeiro valor é o próprio id. */
export function unitVariantId(m, value) {
  const v = m.unitVariants;
  return !v || value === v.values[0] ? m.id : `${m.id}_${v.by}${value}`;
}

/**
 * Variantes de unidade (Etapa 6, hidra por cabeças): um manifesto com `unitVariants` vira um asset por valor — o
 * primeiro é o próprio manifesto (id sem sufixo) e os outros são cópias com o id `<id>_<by><valor>`, o parâmetro do kit
 * (`param`) no valor e `variantOf` = o id base (folha de contato `<contact>-<by>`, só as direções `contactDirs`). O
 * renderizador escolhe a variante pela entidade (`unitVariants.ids` no índice). Sem o campo: [m].
 */
export function expandUnitVariants(m) {
  const v = m?.unitVariants;
  if (!v || m.kind !== 'unit' || !Array.isArray(v.values) || m.source?.type !== 'param') return [m];
  const withParam = (x, value) => ({ ...x, source: { ...x.source, params: { ...(x.source.params ?? {}), [v.param]: value } } });
  const out = [withParam(m, v.values[0])];
  for (const value of v.values.slice(1)) {
    const { unitVariants: _u, ...rest } = m;
    void _u;
    out.push({ ...withParam(rest, value), id: unitVariantId(m, value), variantOf: m.id, variantValue: value, contact: `${m.contact ?? m.id}-${v.by}`, contactDirs: m.variantContactDirs ?? [1, 2] });
  }
  return out;
}
/** Lê os manifestos de `dir` já com as variantes de unidade expandidas (bake, art:check, testes). */
export function loadAssets(dir) { return loadManifests(dir).flatMap((l) => expandUnitVariants(l.manifest)); }
/** Escalas assadas de um manifesto: as pedidas no CLI que ele aceita (`scales`; padrão, todas). */
export function scalesOf(m, wanted = [1, 2]) { return wanted.filter((s) => !m.scales || m.scales.includes(s)); }
/** Lado máximo do quadro (px a 1×) da classe de tamanho do manifesto. */
export function sizeCeiling(m) { return SIZE_CLASSES[m?.sizeClass ?? 'unit'] ?? SIZE_CLASSES.unit; }

/**
 * Espelhamento efetivo de um asset: o do CLI (`--mirror`, todos) ou o do próprio manifesto (`mirror: true`, Etapa 6 — os
 * titãs simétricos: E, SE e NE são O, SO e NO desenhados com scale.x = −1; a página leva `aoe.mirroredAssets`).
 */
export function mirrorOf(m, mirror = false) { return !!mirror || (m?.kind === 'unit' && m?.mirror === true); }
/**
 * Espelhamento do próprio manifesto (sem o `--mirror` global): espelha só a cor e o time — a sombra é assada nas 8
 * direções, porque o sol é fixo (a sombra da direção de origem não bate com o corpo espelhado: a cauda de Oceano).
 */
export function ownMirror(m, mirror = false) { return !mirror && m?.kind === 'unit' && m?.mirror === true; }
/**
 * Direções efetivamente assadas (com `--mirror`, só S, SO, O, NO, N; as outras 3 são espelhadas no jogo). Com o
 * espelhamento do manifesto, as 8 (a cor e o time de E, SE e NE ficam fora do atlas: `packedDirs`).
 */
export function bakedDirs(m, mirror = false) {
  if (m.kind !== 'unit') return [0];
  return mirrorOf(m, mirror) && !ownMirror(m, mirror) ? [...MIRROR_BAKED] : Array.from({ length: m.dirs ?? DIRS }, (_, i) => i);
}
/**
 * Direções de um passe que entram no atlas: com o espelhamento do manifesto, cor e time só nas 5 de origem (as animações
 * com `dirs` — nunca espelhadas — entram nas direções delas).
 */
export function packedDirs(m, pass, mirror = false) {
  return ownMirror(m, mirror) && pass !== 'shadow' ? [...MIRROR_BAKED] : bakedDirs(m, mirror);
}

/**
 * Direção assada que serve a direção `dir` numa animação com `dirs` (Etapa 6, lote titãs: a ascensão só de frente): a
 * mais próxima na volta (empate: a de menor índice); sem `dirs`, a própria.
 */
export function animDirOf(a, dir) {
  if (!a?.dirs?.length || a.dirs.includes(dir)) return dir;
  let best = a.dirs[0], bd = 9;
  for (const d of [...a.dirs].sort((x, y) => x - y)) { const k = Math.abs(d - dir), dd = Math.min(k, 8 - k); if (dd < bd) { bd = dd; best = d; } }
  return best;
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
    const loop = a.loop ?? (m.kind === 'unit' ? !ONCE_UNIT_ANIMS.includes(anim) : true);
    if (m.kind === 'building' && m.variants) {
      for (const v of m.variants) out.push({ name: `${m.id}/${anim}/${v}`, group: m.id, anim, variant: v, dir: 0, frame: 0, frames: 1, loop, params: a.params });
      continue;
    }
    for (const dir of bakedDirs(m, mirror).filter((d) => !a.dirs || a.dirs.includes(d))) for (let i = 0; i < a.frames; i++) {
      const name = m.kind === 'unit' ? `${m.id}/${anim}/${dir}/${pad2(i)}` : a.frames > 1 ? `${m.id}/${anim}/${pad2(i)}` : `${m.id}/${anim}`;
      out.push({ name, group: m.id, anim, dir, frame: i, frames: a.frames, loop, pose: a.pose, ...(a.rider ? { rider: a.rider } : {}), params: a.params });
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
export function animationsOf(m, { mirror = false, pass = 'color' } = {}) {
  const out = {};
  if (m.kind === 'prop') return out;
  // espelhamento do manifesto: a sombra não espelha (cada direção tem a sua)
  const mir = mirrorOf(m, mirror) && !(pass === 'shadow' && ownMirror(m, mirror));
  for (const [anim, a] of Object.entries(m.anims ?? {})) {
    if (m.kind === 'unit') {
      for (let dir = 0; dir < (m.dirs ?? DIRS); dir++) {
        const src = a.dirs ? animDirOf(a, dir) : mir && MIRROR_FROM[dir] !== undefined ? MIRROR_FROM[dir] : dir;
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
    out[anim] = { frames: a.frames, fps: a.fps ?? FPS, loop: a.loop ?? (m.kind === 'unit' ? !ONCE_UNIT_ANIMS.includes(anim) : true) };
    // Etapa 6 (titãs): animação só em algumas direções — o jogo não espelha os quadros dela (a ascensão sempre de frente)
    if (a.dirs) out[anim].dirs = [...a.dirs];
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
