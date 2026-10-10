// Arte provisória dos tipos novos (docs/eras/E2-recursos.md): um tipo sem manifesto próprio usa a arte assada e o ícone
// de um tipo existente — edifício com a MESMA pegada, unidade da mesma classe — até a E8 trazer a arte dele. Quem
// resolve: ArtLibrary (unitId, prewarmUnits, buildingArt, building, icon) e src/ui/icons.ts (ic.unit, ic.bld). Quando o
// tipo ganhar manifesto próprio, ele SAI daqui (os testes de arte passam a exigir o assado dele).
export const UNIT_ART_ALIAS: Readonly<Record<string, string>> = { merchant: 'villager' };
export const BUILDING_ART_ALIAS: Readonly<Record<string, string>> = { quarry: 'mine', naphtha_well: 'granary', oil_well: 'lumber_camp', refinery: 'market' };
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
export const unitArtType = (type: string): string => (own(UNIT_ART_ALIAS, type) ? UNIT_ART_ALIAS[type] : type);
export const buildingArtType = (type: string): string => (own(BUILDING_ART_ALIAS, type) ? BUILDING_ART_ALIAS[type] : type);
