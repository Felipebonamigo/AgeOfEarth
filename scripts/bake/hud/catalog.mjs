// Catálogo dos ícones do HUD (Etapa 7; docs/ART.md Apêndice H): o nome de cada ícone no atlas `hud` e o modelo que o
// gera (scripts/bake/page/hud.js). Os ids seguem os dados do jogo (src/core/data/*.ts); tests/hud-icons.test.ts
// confere que TODA unidade, tecnologia, poder, deus, Idade, habilidade e recurso tem o seu ícone aqui.
//   unit/<id>      o rig da unidade (manifesto de art/manifest) num quadro do `idle`, em três quartos (dir SO), com a
//                  máscara de time; humanos da coxa para cima, gigantes e titãs em busto, o resto de corpo inteiro
//   tech/<id>      um objeto (hud-objects.js), um edifício ou um rig
//   bld/<id>       o modelo do edifício no estado/variante do ícone do manifesto (como o atlas `icons` da Etapa 3, mas na
//                  câmera baixa dos ícones), com a máscara de time (estandartes)
//   power/<id>     poderes divinos · god/<id> retratos (128 px a 1×) · age/<n> Idades · ability/<id> · res/<id>

/** Lado do ícone a 1× (px). Retratos dos deuses: o dobro. */
export const ICON = 64, PORTRAIT = 128;

const O = (key, params = {}, frame = {}) => ({ kind: 'object', key, params, frame: { margin: 0.07, ...frame }, team: false });

/** Tecnologias → modelo. As de nível (civic1…5) repetem o ícone do ramo (o nome já diz o nível). */
export const TECH_ICONS = {
  civic: O('column', { order: 'ionic' }), commerce: O('scales'), military: O('crossed_swords'), science: O('armillary'),
  masonry: O('blocks'), ballista_towers: O('ballista'), logistics: O('satchel'), wheel: O('wheel'),
  hunting_dogs: { kind: 'unit', rigManifest: { id: 'dog', source: { type: 'param', rig: 'beast', params: { build: 'hound', size: 0.9, coat: 'grey', mane: 'none', heads: 1, face: 'hound', tail: 'hound', team: 'collar', eyes: 'amber', mouth: 'closed' } }, anims: { idle: { frames: 4, pose: 'idle_cerberus' } } }, frame: { margin: 0.05 } },
  fortified_towns: { kind: 'building', key: 'tower', frame: { margin: 0.05 }, team: false },
  census: O('tablet'), harvest: O('sheaf'), irrigation: O('hydria'),
  axes1: O('axe'), axes2: O('axe', { iron: true }), axes3: O('saw'),
  picks1: O('pickaxe'), picks2: O('pickaxe', { gallery: true }), picks3: O('crucible'),
  coinage: O('coins'), oracles: O('tripod'), sacred_rites: O('altar'), mythic_blood: O('vial'), divine_arms: O('divine_sword'),
  phalanx: O('phalanx'), bronze_armor: O('cuirass'), iron_weapons: O('iron_sword'), composite_bows: O('bow'),
  horse_breeding: { kind: 'unit', rigManifest: { id: 'horse_icon', source: { type: 'param', rig: 'horse', params: { coat: 'bay', build: 'medium', cloth: false, rider: null } }, anims: { idle: { frames: 4, pose: 'idle_horse' } } }, frame: { mode: 'bust', frac: 0.62, margin: 0.04 }, team: false },
  barding: { kind: 'unit', rigManifest: { id: 'horse_barding', source: { type: 'param', rig: 'horse', params: { coat: 'black', build: 'heavy', cloth: 'long', peytral: true, chamfron: true, rider: null } }, anims: { idle: { frames: 4, pose: 'idle_horse' } } }, frame: { mode: 'bust', frac: 0.62, margin: 0.04 } },
  ballistics: O('compass'), aegis: O('aegis'), wisdom: O('owl'), winged_sandals: O('sandal'), caduceus: O('caduceus'),
  fury: O('helm', { crest: 'red', flame: true }), war_drums: O('drum'), delphi: O('tripod', { laurel: true, glow: true }),
  golden_bow: O('bow', { mat: 'gold' }), bacchanal: O('grapes'), anthropomorphic: O('kylix'), charm: O('hand_mirror'),
  ambrosia: O('ambrosia'), royalty: O('diadem'), crown: O('crown'), divine_forge: O('anvil'),
  automatons: { kind: 'unit', unit: 'colossus', frame: { mode: 'bust', frac: 0.3, margin: 0.04 } },
  moon_arrows: O('bow', { mat: 'silver', moon: true }), great_hunt: O('antlers'),
};
/** Tecnologia → chave do ícone (as de nível usam o ramo). */
export function techIconKey(id) {
  const m = /^(civic|commerce|military|science|harvest)\d$/.exec(id);
  return m ? m[1] : id;
}

export const POWER_ICONS = {
  bolt: O('bolt'), lure: O('lure_stone'), sentinel: { kind: 'unit', unit: 'sentinel', frame: { margin: 0.04 } }, restoration: O('chalice'),
  ceasefire: O('olive_branch'), pestilence: O('skull_miasma'), oracle: O('eye'), bronze: O('bronze_shield'), curse: O('boar'),
  lightning_storm: O('storm_cloud'), plenty: O('cornucopia'), earthquake: O('quake'),
};
export const GODS = ['zeus', 'poseidon', 'hades', 'athena', 'hermes', 'ares', 'apollo', 'dionysus', 'aphrodite', 'hera', 'hephaestus', 'artemis'];
export const AGE_ICONS = [O('amphora'), O('column', { order: 'doric' }), O('helm', { crest: 'red' }), O('trident'), O('volcano')];
export const ABILITY_ICONS = { war_cry: O('salpinx'), cunning: O('wooden_horse'), titanic_blow: O('club_impact'), fury: O('flaming_spear'), mirror_shield: O('mirror_shield') };
export const RESOURCE_ICONS = { food: O('food'), wood: O('wood'), gold: O('gold'), knowledge: O('knowledge'), favor: O('favor') };

/** Enquadramento dos ícones de unidade: humanos da coxa para cima (3/4 da altura sem as armas finas: o equipamento é o
 *  que distingue, e a cabeça simples do rig não lê num busto curto a 34 px); gigantes e titãs em busto; montados, cerco e
 *  criaturas de corpo inteiro. */
export function unitFrame(m) {
  const rig = m.source?.rig;
  if (rig === 'human') return { mode: 'bust', frac: 0.74, margin: 0.03 };
  if (rig === 'titan') return { mode: 'bust', frac: 0.55, margin: 0.03 };
  if (rig === 'giant' || rig === 'biped') return { mode: 'bust', frac: m.id === 'sentinel' ? 1 : 0.6, margin: 0.04 };
  return { margin: 0.04 };
}

/**
 * Lista completa: [{ name, size, spec }]. `manifests` = { id: manifesto } das unidades (art/manifest); `poses(m)` =
 * { main, rider } (JSON) do manifesto.
 */
export function hudItems(manifests, poses) {
  const items = [];
  const unitSpec = (m, extra = {}) => ({ kind: 'unit', manifest: m, poses: poses(m), anim: 'idle', frameIndex: 0, dir: 3, frame: unitFrame(m), ...extra });
  for (const id of Object.keys(manifests).sort()) {
    const m = manifests[id];
    if (m.kind === 'unit') items.push({ name: `unit/${id}`, size: ICON, spec: unitSpec(m) });
  }
  for (const id of Object.keys(manifests).sort()) {
    const m = manifests[id];
    if (m.kind !== 'building' || !m.icon) continue;
    items.push({ name: `bld/${id}`, size: ICON, spec: { kind: 'building', style: m.source?.params?.style ?? id, params: m.source?.params ?? {}, state: m.icon.anim, variant: m.icon.variant, frame: { margin: 0.04 } } });
  }
  const resolve = (s) => {
    if (s.kind === 'unit' && s.unit) return unitSpec(manifests[s.unit], { frame: s.frame, team: s.team });
    if (s.kind === 'unit' && s.rigManifest) return { ...unitSpec(s.rigManifest), frame: s.frame ?? { margin: 0.05 }, team: s.team };
    return s;
  };
  for (const [id, s] of Object.entries(TECH_ICONS)) items.push({ name: `tech/${id}`, size: ICON, spec: resolve(s) });
  for (const [id, s] of Object.entries(POWER_ICONS)) items.push({ name: `power/${id}`, size: ICON, spec: resolve(s) });
  for (const id of GODS) items.push({ name: `god/${id}`, size: PORTRAIT, spec: { kind: 'god', key: id, frame: { mode: 'band', y0: 1.08, y1: 2.2, margin: 0.03 }, team: false, hemi: 1.1 } });
  AGE_ICONS.forEach((s, n) => items.push({ name: `age/${n}`, size: ICON, spec: s }));
  for (const [id, s] of Object.entries(ABILITY_ICONS)) items.push({ name: `ability/${id}`, size: ICON, spec: s });
  for (const [id, s] of Object.entries(RESOURCE_ICONS)) items.push({ name: `res/${id}`, size: ICON, spec: s });
  return items;
}

/** Nomes dos ícones sem renderizar (art:check e testes): as unidades pelos ids dos manifestos de unidade. */
export function hudNames(unitIds, buildingIds = []) {
  return [
    ...[...unitIds].sort().map((id) => `unit/${id}`),
    ...[...buildingIds].sort().map((id) => `bld/${id}`),
    ...Object.keys(TECH_ICONS).map((id) => `tech/${id}`),
    ...Object.keys(POWER_ICONS).map((id) => `power/${id}`),
    ...GODS.map((id) => `god/${id}`),
    ...AGE_ICONS.map((_, n) => `age/${n}`),
    ...Object.keys(ABILITY_ICONS).map((id) => `ability/${id}`),
    ...Object.keys(RESOURCE_ICONS).map((id) => `res/${id}`),
  ];
}
