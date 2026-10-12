// Arte provisória dos tipos novos (docs/eras/E2-recursos.md): um tipo sem manifesto próprio usa a arte assada e o ícone
// de um tipo existente — edifício com a MESMA pegada, unidade da mesma classe — até a E8 trazer a arte dele. Quem
// resolve: ArtLibrary (unitId, prewarmUnits, buildingArt, building, icon) e src/ui/icons.ts (ic.unit, ic.bld). Quando o
// tipo ganhar manifesto próprio, ele SAI daqui (os testes de arte passam a exigir o assado dele).
export const UNIT_ART_ALIAS: Readonly<Record<string, string>> = {
  merchant: 'villager',
  caravan: 'kataskopos',   // E5
  // E3: degraus novos das linhas de unidade (docs/eras/E3-linhas-de-unidade.md) até a E8 trazer a arte própria
  prodromos: 'kataskopos', trapezites: 'kataskopos', stradiot: 'hippeus', hussar: 'hippeus', mounted_scout: 'hippeus', motorcyclist: 'hippeus',
  phalangite: 'hypaspist', skoutatos: 'hypaspist', pikeman: 'hypaspist', grenadier: 'hypaspist', fusilier: 'hypaspist', modern_infantry: 'hypaspist',
  rhodian_slinger: 'cretan_archer', byzantine_archer: 'cretan_archer', arquebusier: 'cretan_archer', musketeer: 'cretan_archer', sharpshooter: 'cretan_archer', machine_gunner: 'cretan_archer',
  thureophoros: 'peltast', akritas: 'peltast', rodelero: 'peltast', chasseur: 'peltast', light_infantry: 'peltast', commando: 'peltast',
  cataphract: 'hetairoi', cuirassier: 'hetairoi', dragoon: 'hetairoi', lancer: 'hetairoi', tank: 'helepolis', athanatos: 'myrmidon',
  knight_of_rhodes: 'myrmidon', guard_grenadier: 'myrmidon', evzone: 'myrmidon', sacred_band: 'myrmidon', trebuchet: 'petrobolos', bombard: 'petrobolos',
  field_gun: 'petrobolos', howitzer: 'petrobolos', self_propelled_gun: 'petrobolos', covered_ram: 'helepolis', greek_fire_siphon: 'petrobolos',
};
export const BUILDING_ART_ALIAS: Readonly<Record<string, string>> = { quarry: 'mine', naphtha_well: 'granary', oil_well: 'lumber_camp', refinery: 'market', shipyard: 'siege_workshop',
  // E7: as 17 maravilhas novas usam a arte das 3 de hoje (mesma pegada 4×4) até a E8
  wonder_lion_gate: 'wonder_colossus', wonder_labyrinth: 'wonder_artemis', wonder_delphi: 'wonder_artemis', wonder_parthenon: 'wonder_artemis', wonder_epidaurus: 'wonder_artemis', wonder_mausoleum: 'wonder_artemis', wonder_pharos: 'wonder_colossus', wonder_great_library: 'wonder_artemis', wonder_hagia_sophia: 'wonder_artemis', wonder_theodosian_walls: 'wonder_colossus', wonder_meteora: 'wonder_artemis', wonder_candia_arsenal: 'wonder_colossus', wonder_knights_rhodes: 'wonder_colossus', wonder_palamidi: 'wonder_colossus', wonder_corinth_canal: 'wonder_colossus', wonder_panathenaic: 'wonder_artemis', wonder_olympus_throne: 'wonder_zeus' };
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
export const unitArtType = (type: string): string => (own(UNIT_ART_ALIAS, type) ? UNIT_ART_ALIAS[type] : type);
export const buildingArtType = (type: string): string => (own(BUILDING_ART_ALIAS, type) ? BUILDING_ART_ALIAS[type] : type);
