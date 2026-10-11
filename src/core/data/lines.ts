// Linhas de unidade (E3; docs/ERAS.md §4 e docs/eras/E3-linhas-de-unidade.md). Cada linha tem um degrau por Era
// (índice = Era: 0 = I … 7 = VIII; null = nenhum degrau novo naquela Era, o anterior continua). O primeiro degrau não
// nulo é a BASE: treina sem estudo desde aquela Era. Cada degrau seguinte é liberado pelo estudo evo_<linha>_<Era+1> da
// Biblioteca (src/core/data/techs.ts), em sequência; ao terminar, as unidades da linha se transformam
// (src/core/sim/lines.ts). Nome em PT aqui; EN em src/i18n/en-data.ts (EN_LINES). Só valem com as linhas ligadas
// (unitLinesOn): a campanha e os cenários usam o elenco clássico (os trains de src/core/data/buildings.ts).
import type { Effect } from '../types';

export interface LineDef {
  id: string;
  name: string;
  /** Edifícios que treinam a linha com as linhas ligadas (o 1º é o `building` dos degraus novos). */
  buildings: string[];
  /** Tecla de treino da linha nesses edifícios (única por edifício; nunca A, R ou U). */
  hotkey: string;
  /** Um degrau por Era (AGES.length posições). */
  steps: (string | null)[];
  /** Da Era retireAt em diante a linha não treina mais (as unidades que já existem continuam). */
  retireAt?: number;
  /** Só na linha dos cidadãos (o tipo não muda): nome PT de cada estudo, pela Era. */
  studyNames?: (string | null)[];
  /** E4: efeitos de cada estudo de uma linha que não troca de tipo (barcos "a vapor"); os cidadãos usam CITIZEN_EVO_EFFECTS. */
  studyEffects?: Effect[];
  /** E4: descrição PT desses estudos (EN em src/i18n/en-data.ts, LINE_STUDIES_EN). */
  studyDesc?: string;
}

export const LINES: Record<string, LineDef> = {
  citizen: { id: 'citizen', name: 'Cidadãos', buildings: ['town_center'], hotkey: 'Q',
    steps: ['villager', 'villager', 'villager', 'villager', 'villager', 'villager', 'villager', 'villager'],
    studyNames: [null, 'Ferramentas de ferro', 'Artesãos', 'Guildas', 'Ferramentas de aço', 'Manufatura', 'Operários', 'Operários modernos'] },
  scout: { id: 'scout', name: 'Batedores', buildings: ['town_center', 'stable'], hotkey: 'W',
    steps: ['kataskopos', null, 'prodromos', 'trapezites', 'stradiot', 'hussar', 'mounted_scout', 'motorcyclist'] },
  heavy_infantry: { id: 'heavy_infantry', name: 'Infantaria pesada', buildings: ['barracks', 'fortress'], hotkey: 'Q',
    steps: ['hoplite', 'hypaspist', 'phalangite', 'skoutatos', 'pikeman', 'grenadier', 'fusilier', 'modern_infantry'] },
  ranged: { id: 'ranged', name: 'Tiro', buildings: ['barracks', 'fortress'], hotkey: 'W',
    steps: ['toxotes', 'cretan_archer', 'rhodian_slinger', 'byzantine_archer', 'arquebusier', 'musketeer', 'sharpshooter', 'machine_gunner'] },
  skirmisher: { id: 'skirmisher', name: 'Escaramuça', buildings: ['barracks'], hotkey: 'E',
    steps: [null, 'peltast', 'thureophoros', 'akritas', 'rodelero', 'chasseur', 'light_infantry', 'commando'] },
  cavalry: { id: 'cavalry', name: 'Cavalaria', buildings: ['stable', 'fortress'], hotkey: 'E',
    steps: [null, 'hippeus', 'hetairoi', 'cataphract', 'cuirassier', 'dragoon', 'lancer', 'tank'] },
  elite: { id: 'elite', name: 'Elite da Fortaleza', buildings: ['fortress'], hotkey: 'Y',
    steps: [null, null, 'myrmidon', 'athanatos', 'knight_of_rhodes', 'guard_grenadier', 'evzone', 'sacred_band'] },
  artillery: { id: 'artillery', name: 'Arremesso', buildings: ['siege_workshop'], hotkey: 'Q',
    steps: [null, null, 'petrobolos', 'trebuchet', 'bombard', 'field_gun', 'howitzer', 'self_propelled_gun'] },
  assault: { id: 'assault', name: 'Assalto a muralhas', buildings: ['siege_workshop'], hotkey: 'W', retireAt: 4,
    steps: [null, null, 'helepolis', 'covered_ram', null, null, null, null] },
  greek_fire: { id: 'greek_fire', name: 'Fogo grego', buildings: ['siege_workshop'], hotkey: 'E', retireAt: 4,
    steps: [null, null, null, 'greek_fire_siphon', null, null, null, null] },
  // ---- E4: naval (só o Estaleiro treina; os barcos não trocam de tipo, ganham o estudo "a vapor" na Era VII) ----
  fishing: { id: 'fishing', name: 'Barcos de pesca', buildings: ['shipyard'], hotkey: 'Q',
    steps: ['fishing_boat', null, null, null, null, null, 'fishing_boat', null],
    studyNames: [null, null, null, null, null, null, 'A vapor', null],
    studyDesc: 'Barcos de pesca a vapor: +25% de velocidade, +50% de vida e pesca +25%.',
    studyEffects: [
      { type: 'unit', match: { types: ['fishing_boat'] }, stat: 'speed', mult: 1.25 },
      { type: 'unit', match: { types: ['fishing_boat'] }, stat: 'hp', mult: 1.5 },
      { type: 'gather', resource: 'fish', mult: 1.25 },
    ] },
  transport: { id: 'transport', name: 'Transportes', buildings: ['shipyard'], hotkey: 'W',
    steps: ['transport_ship', null, null, null, null, null, 'transport_ship', null],
    studyNames: [null, null, null, null, null, null, 'A vapor', null],
    studyDesc: 'Transportes a vapor: +30% de velocidade e +50% de vida.',
    studyEffects: [
      { type: 'unit', match: { types: ['transport_ship'] }, stat: 'speed', mult: 1.3 },
      { type: 'unit', match: { types: ['transport_ship'] }, stat: 'hp', mult: 1.5 },
    ] },
  warship: { id: 'warship', name: 'Navios de guerra', buildings: ['shipyard'], hotkey: 'E',
    steps: ['penteconter', 'trireme', 'quinquereme', 'dromon', 'galleon', 'ship_of_the_line', 'ironclad', 'battleship'] },
};

/** Ordem das linhas nos botões, na IA (desempate) e na árvore de estudos. */
export const LINE_ORDER: readonly string[] = ['citizen', 'scout', 'heavy_infantry', 'ranged', 'skirmisher', 'cavalry', 'elite', 'artillery', 'assault', 'greek_fire', 'fishing', 'transport', 'warship'];
/** Era da base da linha (o primeiro degrau não nulo). */
export function lineStart(l: LineDef): number { return l.steps.findIndex((s) => s !== null); }
/** Id do estudo que libera o degrau da Era `era` (índice 0–7) da linha: evo_<linha>_<número da Era> (como civic3 = Era III). */
export function evoTechId(line: string, era: number): string { return `evo_${line}_${era + 1}`; }

