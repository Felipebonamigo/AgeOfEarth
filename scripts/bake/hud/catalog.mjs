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
  // E2: pedra e petróleo
  stone_wedges: O('blocks'), stone_saws: O('saw'), stone_cranes: O('blocks'), bitumen_jars: O('hydria'), distillation: O('crucible'), cracking: O('crucible'),
  // E3: um ícone por linha de unidade para os estudos de evolução (evo_<linha>_<n>), com o modelo do degrau-âncora
  evo_citizen: { kind: 'unit', unit: 'villager', frame: { mode: 'bust', frac: 0.74, margin: 0.03 } },
  evo_scout: { kind: 'unit', unit: 'kataskopos', frame: { margin: 0.04 } },
  evo_heavy_infantry: { kind: 'unit', unit: 'hypaspist', frame: { mode: 'bust', frac: 0.74, margin: 0.03 } },
  evo_ranged: { kind: 'unit', unit: 'cretan_archer', frame: { mode: 'bust', frac: 0.74, margin: 0.03 } },
  evo_skirmisher: { kind: 'unit', unit: 'peltast', frame: { mode: 'bust', frac: 0.74, margin: 0.03 } },
  evo_cavalry: { kind: 'unit', unit: 'hetairoi', frame: { margin: 0.04 } },
  evo_elite: { kind: 'unit', unit: 'myrmidon', frame: { mode: 'bust', frac: 0.74, margin: 0.03 } },
  evo_artillery: { kind: 'unit', unit: 'petrobolos', frame: { margin: 0.04 } },
  evo_assault: { kind: 'unit', unit: 'helepolis', frame: { margin: 0.04 } },
  // E4: Estaleiro e as linhas navais
  fishing_nets: O('fish'), caulking: O('hydria'), bronze_rams: O('ship', { kind: 'galley', ram: true }),
  navigation: O('armillary'), evo_fishing: O('ship', { kind: 'fishing', steam: true }),
  evo_transport: O('ship', { kind: 'transport', steam: true }), evo_warship: O('ship', { kind: 'sail' }),
  // E6: pesquisas dos deuses das Eras V–VII e as Bênçãos do Templo (blessing2…8 usam o ícone `blessing`)
  rustic_flute: O('salpinx'), wild_hooves: O('antlers'), torch_of_hecate: O('tripod', { glow: true }), crossroads_rites: O('altar'),
  pomegranate: O('ambrosia'), eternal_spring: O('olive_branch'), bag_of_winds: O('satchel'), storm_lord: O('storm_cloud'),
  conch_horn: O('salpinx'), tidal_lore: O('trident'), golden_harvest: O('sheaf'), eleusinian_mysteries: O('hydria'),
  solar_fire: O('chalice'), all_seeing_sun: O('eye'), laurels_of_victory: O('crown'), golden_wings: O('sandal'),
  balance_of_fate: O('scales'), wrath_of_nemesis: O('divine_sword'), blessing: O('altar', { }, { margin: 0.05 }),
};
/** E4: ícones dos navios (unit/<id>): o objeto `ship` de hud-objects.js com a flâmula do time, até a E8 trazer os rigs. */
const S = (params) => ({ ...O('ship', params), team: true });
export const SHIP_ICONS = {
  fishing_boat: S({ kind: 'fishing' }), transport_ship: S({ kind: 'transport' }), merchant_ship: S({ kind: 'transport' }),
  penteconter: S({ kind: 'galley' }), trireme: S({ kind: 'galley', ram: true }), quinquereme: S({ kind: 'galley', ram: true }),
  dromon: S({ kind: 'dromon' }), galleon: S({ kind: 'sail' }), ship_of_the_line: S({ kind: 'sail' }),
  ironclad: S({ kind: 'steam' }), battleship: S({ kind: 'battleship' }),
};
/** Tecnologia → chave do ícone (as de nível usam o ramo). */
export function techIconKey(id) {
  if (id.startsWith('evo_')) return id.slice(0, id.lastIndexOf('_'));   // E3: evo_heavy_infantry_3 → evo_heavy_infantry
  const m = /^(civic|commerce|military|science|harvest|blessing)\d$/.exec(id);
  return m ? m[1] : id;
}

export const POWER_ICONS = {
  bolt: O('bolt'), lure: O('lure_stone'), sentinel: { kind: 'unit', unit: 'sentinel', frame: { margin: 0.04 } }, restoration: O('chalice'),
  ceasefire: O('olive_branch'), pestilence: O('skull_miasma'), oracle: O('eye'), bronze: O('bronze_shield'), curse: O('boar'),
  lightning_storm: O('storm_cloud'), plenty: O('cornucopia'), earthquake: O('quake'),
  // E6: poderes dos deuses das Eras V–VII (provisórios com objetos que já existem; a E8 desenha os próprios)
  panic: O('salpinx'), crossroads: O('compass'), spring: O('kylix'), gale: O('storm_cloud'), tidal_wave: O('trident'),
  divine_harvest: O('sheaf'), sun_chariot: O('wheel'), winged_victory: O('crown'), retribution: O('scales'),
};
export const GODS = ['zeus', 'poseidon', 'hades', 'athena', 'hermes', 'ares', 'apollo', 'dionysus', 'aphrodite', 'hera', 'hephaestus', 'artemis', 'pan', 'hecate', 'persephone', 'aeolus', 'triton', 'demeter', 'helios', 'nike', 'nemesis'];
// uma por Era (docs/ERAS.md §1); 4–6 são provisórias até o U3 do Unreal (o 4 é o elmo do 2 em bronze escuro, o 6 repete a bigorna da forja divina)
export const AGE_ICONS = [O('amphora'), O('column', { order: 'doric' }), O('helm', { crest: 'red' }), O('trident'),
  O('helm', { metal: 'dark', crest: 'dark' }), O('column', { order: 'corinthian' }), O('anvil'), O('volcano')];
export const ABILITY_ICONS = { war_cry: O('salpinx'), cunning: O('wooden_horse'), titanic_blow: O('club_impact'), fury: O('flaming_spear'), mirror_shield: O('mirror_shield') };
export const RESOURCE_ICONS = { food: O('food'), wood: O('wood'), stone: O('stone'), gold: O('gold'), oil: O('oil'), knowledge: O('knowledge'), favor: O('favor') };

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
  for (const [id, s] of Object.entries(SHIP_ICONS)) items.push({ name: `unit/${id}`, size: ICON, spec: s });   // E4
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
    ...Object.keys(SHIP_ICONS).map((id) => `unit/${id}`),   // E4
    ...[...buildingIds].sort().map((id) => `bld/${id}`),
    ...Object.keys(TECH_ICONS).map((id) => `tech/${id}`),
    ...Object.keys(POWER_ICONS).map((id) => `power/${id}`),
    ...GODS.map((id) => `god/${id}`),
    ...AGE_ICONS.map((_, n) => `age/${n}`),
    ...Object.keys(ABILITY_ICONS).map((id) => `ability/${id}`),
    ...Object.keys(RESOURCE_ICONS).map((id) => `res/${id}`),
  ];
}
