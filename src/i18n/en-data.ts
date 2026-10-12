// Tradução para inglês do conteúdo do jogo (unidades, edifícios, tecnologias, deuses, poderes, idades).
// Chaveado por id; os dados canônicos em português ficam em src/core/data.
import { LINES, lineStart, evoTechId } from '../core/data/lines';
export interface TextOverlay { name?: string; plural?: string; desc?: string; title?: string; short?: string; perks?: string[] }

export const EN_UNITS: Record<string, TextOverlay> = {
  villager: { name: 'Citizen', plural: 'Citizens', desc: 'Gathers resources, builds and repairs buildings, and prays at temples to generate Favor.' },
  merchant_ship: { name: 'Merchant Ship', plural: 'Merchant Ships', desc: "Cargo ship: runs a route between two Shipyards (yours or an ally's) 16 tiles or more apart; each arrival earns gold by distance. Right-click the destination Shipyard. Does not fight." },
  caravan: { name: 'Caravan', plural: 'Caravans', desc: 'Carries goods on a route between a Town Center or Market of yours and another of yours or an ally\'s, 16 tiles or more apart: each arrival earns gold by distance (+25% if the destination is an ally\'s). Right-click the destination. Does not fight or enter buildings.' },
  merchant: { name: 'Merchant', plural: 'Merchants', desc: 'Works a rare resource on the map: while there, it earns gold and the rare bonus applies to your whole empire. It does not gather other resources, pray or build.' },
  kataskopos: { name: 'Scout', plural: 'Scouts', desc: 'Light, fast rider. Excellent for exploring the map, weak in combat.' },
  hoplite: { name: 'Hoplite', plural: 'Hoplites', desc: 'Spear-and-shield infantry. Strong against cavalry, weak against archers.' },
  toxotes: { name: 'Toxotes', plural: 'Toxotai', desc: 'Archer. Strong against infantry, weak against cavalry.' },
  peltast: { name: 'Peltast', plural: 'Peltasts', desc: 'Javelin skirmisher. Strong against archers, weak against infantry and cavalry.' },
  hippeus: { name: 'Hippeus', plural: 'Hippeis', desc: 'Light cavalry. Strong against archers and siege, weak against infantry.' },
  hypaspist: { name: 'Hypaspist', plural: 'Hypaspists', desc: 'Elite heavy infantry. Strong against cavalry.' },
  cretan_archer: { name: 'Cretan Archer', plural: 'Cretan Archers', desc: 'Elite archer with long range. Strong against infantry.' },
  hetairoi: { name: 'Hetairos', plural: 'Hetairoi', desc: "Heavy cavalry of the king's companions. Strong against archers and siege." },
  petrobolos: { name: 'Petrobolos', plural: 'Petroboloi', desc: 'Catapult. Devastating against buildings, fragile against cavalry.' },
  myrmidon: { name: 'Myrmidon', plural: 'Myrmidons', desc: "Achilles' warriors. Supreme infantry with bonus damage against mythic creatures." },
  helepolis: { name: 'Helepolis', plural: 'Helepoleis', desc: 'Armored siege tower. Brings down walls and fortresses.' },
  fishing_boat: { name: 'Fishing Boat', plural: 'Fishing Boats', desc: 'Fishes the shoals and delivers food to the Shipyard. Parked on a tuna run, it earns gold.' },
  transport_ship: { name: 'Transport Ship', plural: 'Transport Ships', desc: 'Carries up to 20 population. Right-click it with troops to board; with it selected, click on land to unload (U: here).' },
  penteconter: { name: 'Penteconter', plural: 'Penteconters', desc: 'Fifty-oared galley with archers. Strong against ships.' },
  trireme: { name: 'Trireme', plural: 'Triremes', desc: 'Fast galley with three banks of oars.' },
  quinquereme: { name: 'Quinquereme', plural: 'Quinqueremes', desc: 'Heavy galley with deck ballistae.' },
  dromon: { name: 'Dromon', plural: 'Dromons', desc: 'Byzantine galley with a Greek fire siphon: short range, area damage.' },
  galleon: { name: 'Galleon', plural: 'Galleons', desc: 'Cannon-armed sailing ship. Bombards ships and the coast.' },
  ship_of_the_line: { name: 'Ship of the Line', plural: 'Ships of the Line', desc: 'Two-decked sailing ship of cannons.' },
  ironclad: { name: 'Ironclad', plural: 'Ironclads', desc: 'Steam-powered iron-hulled warship.' },
  battleship: { name: 'Battleship', plural: 'Battleships', desc: 'Battleship with huge gun turrets.' },
  militia: { name: 'Militia', plural: 'Militia', desc: 'Citizens hastily armed by Poseidon when a building falls.' },
  basileus: { name: 'King', plural: 'Kings', desc: 'Regicide: if the king dies, the kingdom falls. Garrison him in a Town Center or a Fortress.' },
  jason: { name: 'Jason', plural: 'Jason', desc: 'Leader of the Argonauts. Heroes deal triple damage to mythic creatures.' },
  odysseus: { name: 'Odysseus', plural: 'Odysseus', desc: 'The cunning king of Ithaca and his bow. Ranged hero.' },
  heracles: { name: 'Heracles', plural: 'Heracles', desc: 'The greatest of heroes. His club also brings down buildings.' },
  achilles: { name: 'Achilles', plural: 'Achilles', desc: 'Invulnerable except for his heel. Fast and deadly.' },
  perseus: { name: 'Perseus', plural: 'Perseus', desc: 'Slayer of Medusa. Bonus damage against Titans.' },
  pegasus: { name: 'Pegasus', plural: 'Pegasi', desc: "Zeus's winged horse. Flies over any terrain and sees very far." },
  minotaur: { name: 'Minotaur', plural: 'Minotaurs', desc: 'The beast of the labyrinth. Gores human soldiers with its horns.' },
  centaur: { name: 'Centaur', plural: 'Centaurs', desc: 'Swift archer, half man and half horse.' },
  cyclops: { name: 'Cyclops', plural: 'Cyclopes', desc: 'One-eyed giant. Crushes men and walls alike.' },
  manticore: { name: 'Manticore', plural: 'Manticores', desc: 'Lion with a scorpion tail that fires venomous spines.' },
  hydra: { name: 'Hydra', plural: 'Hydras', desc: 'Grows a head every 3 kills (up to 5), increasing its attack.' },
  nemean_lion: { name: 'Nemean Lion', plural: 'Nemean Lions', desc: 'Impenetrable hide: very high armor against ordinary weapons.' },
  medusa: { name: 'Medusa', plural: 'Medusas', desc: 'Her gaze has a 12% chance to instantly petrify humans (except heroes).' },
  colossus: { name: 'Colossus', plural: 'Colossi', desc: 'Bronze statue animated by Hephaestus. Slow, colossal, razes buildings.' },
  chimera: { name: 'Chimera', plural: 'Chimeras', desc: 'Breathes fire in an area, hitting several enemies at once.' },
  cerberus: { name: 'Cerberus', plural: 'Cerberi', desc: "Hades's three-headed hound. Hunts heroes voraciously." },
  sentinel: { name: 'Sentinel', plural: 'Sentinels', desc: 'Guardian statue summoned by Hades. Immobile, but shoots from afar.' },
  shade: { name: 'Shade', plural: 'Shades', desc: 'Spirit of a fallen warrior who returns from the underworld to fight for Hades.' },
  prometheus: { name: 'Prometheus', plural: 'Prometheus', desc: 'Titan of fire, freed by Zeus. His passage sets armies and cities ablaze.' },
  oceanus: { name: 'Oceanus', plural: 'Oceanus', desc: 'Titan of the primordial waters, summoned by Poseidon.' },
  cronus: { name: 'Cronus', plural: 'Cronus', desc: 'King of the Titans, torn from Tartarus by Hades.' },
  prodromos: { name: 'Prodromos', plural: 'Prodromoi', desc: 'Vanguard rider of the Hellenistic armies. Fast and far-sighted; weak in combat.' },
  trapezites: { name: 'Trapezites', plural: 'Trapezitai', desc: 'Byzantine border rider trained for ambushes. Fast and far-sighted; weak in combat.' },
  stradiot: { name: 'Stradiot', plural: 'Stradiots', desc: 'Light Greek horseman in Venetian service. Fast and far-sighted; weak in combat.' },
  hussar: { name: 'Hussar', plural: 'Hussars', desc: 'Sabre-armed light cavalry. Fast and far-sighted; weak against line troops.' },
  mounted_scout: { name: 'Mounted Scout', plural: 'Mounted Scouts', desc: 'Carbine scout: shoots at short range while scouting; weak in a long fight.' },
  motorcyclist: { name: 'Motorcyclist', plural: 'Motorcyclists', desc: 'Motorized scout with a submachine gun, very fast. Costs oil.' },
  phalangite: { name: 'Phalangite', plural: 'Phalangites', desc: 'Sarissa infantry of the Macedonian phalanx. Strong against cavalry, weak against missile troops.' },
  skoutatos: { name: 'Skoutatos', plural: 'Skoutatoi', desc: 'Byzantine heavy infantry with oval shield and spear. Strong against cavalry, weak against missile troops.' },
  pikeman: { name: 'Pikeman', plural: 'Pikemen', desc: 'Steel-cuirassed pikeman. Strong against cavalry, weak against missile troops.' },
  grenadier: { name: 'Grenadier', plural: 'Grenadiers', desc: 'Throws grenades at short range, with area damage. Strong against cavalry, weak against missile troops.' },
  fusilier: { name: 'Fusilier', plural: 'Fusiliers', desc: 'Line infantry with rifle and bayonet. Strong against cavalry, weak against missile troops.' },
  modern_infantry: { name: 'Infantry', plural: 'Infantry', desc: 'Steel-helmeted infantry with anti-tank weapons: double damage against cavalry and tanks.' },
  rhodian_slinger: { name: 'Rhodian Slinger', plural: 'Rhodian Slingers', desc: 'Rhodian slinger with long range. Strong against infantry, weak against cavalry.' },
  byzantine_archer: { name: 'Byzantine Archer', plural: 'Byzantine Archers', desc: 'Byzantine composite-bow archer. Strong against infantry, weak against cavalry.' },
  arquebusier: { name: 'Arquebusier', plural: 'Arquebusiers', desc: 'Arquebus shooter: slow, heavy shots. Strong against infantry, weak against cavalry.' },
  musketeer: { name: 'Musketeer', plural: 'Musketeers', desc: 'Line musketeer. Strong against infantry, weak against cavalry.' },
  sharpshooter: { name: 'Sharpshooter', plural: 'Sharpshooters', desc: 'Precision rifleman with great range. Strong against infantry, weak against cavalry.' },
  machine_gunner: { name: 'Machine Gunner', plural: 'Machine Gunners', desc: 'Machine gun: continuous bursts, devastating against infantry; slow and weak against cavalry.' },
  thureophoros: { name: 'Thureophoros', plural: 'Thureophoroi', desc: 'Light infantry with oval shield and javelins. Strong against missile troops, weak against infantry and cavalry.' },
  akritas: { name: 'Akritas', plural: 'Akritai', desc: 'Byzantine border guard with javelins. Strong against missile troops, weak against infantry and cavalry.' },
  rodelero: { name: 'Rodelero', plural: 'Rodeleros', desc: 'Sword-and-buckler man who charges the shooters. Strong against missile troops, weak against infantry and cavalry.' },
  chasseur: { name: 'Chasseur', plural: 'Chasseurs', desc: 'Mobile, accurate carbine skirmisher. Strong against missile troops, weak against infantry and cavalry.' },
  light_infantry: { name: 'Light Infantry', plural: 'Light Infantry', desc: 'Rifle-armed light infantry. Strong against missile troops, weak against infantry and cavalry.' },
  commando: { name: 'Commando', plural: 'Commandos', desc: 'Fast elite assault troops. Strong against missile troops, weak against infantry and cavalry.' },
  cataphract: { name: 'Cataphract', plural: 'Cataphracts', desc: 'Byzantine armored cavalry, horse and rider in mail. Strong against missile troops and siege, weak against heavy infantry.' },
  cuirassier: { name: 'Cuirassier', plural: 'Cuirassiers', desc: 'Steel-cuirassed cavalry. Strong against missile troops and siege, weak against heavy infantry.' },
  dragoon: { name: 'Dragoon', plural: 'Dragoons', desc: 'Mounted infantry with carbines. Strong against missile troops and siege, weak against heavy infantry.' },
  lancer: { name: 'Lancer', plural: 'Lancers', desc: 'Charging mounted lancer. Strong against missile troops and siege, weak against heavy infantry.' },
  tank: { name: 'Tank', plural: 'Tanks', desc: 'Armored gun vehicle: high health and armor, strong against missile troops, siege and buildings; weak against anti-tank infantry. Costs oil.' },
  athanatos: { name: 'Athanatos', plural: 'Athanatoi', desc: 'The Immortals of the Byzantine guard. Elite infantry with bonus damage against mythic creatures.' },
  knight_of_rhodes: { name: 'Knight of Rhodes', plural: 'Knights of Rhodes', desc: 'Hospitaller knight in full armor. Elite infantry with bonus damage against mythic creatures.' },
  guard_grenadier: { name: 'Guard Grenadier', plural: 'Guard Grenadiers', desc: 'Guard grenadiers with area damage. Elite, with bonus damage against mythic creatures.' },
  evzone: { name: 'Evzone', plural: 'Evzones', desc: 'The Greek elite guard, in kilt and with rifle. Elite, with bonus damage against mythic creatures.' },
  sacred_band: { name: 'Sacred Band', plural: 'Sacred Band', desc: 'Commando heirs of the Sacred Band of Thebes. Elite, with bonus damage against mythic creatures.' },
  trebuchet: { name: 'Trebuchet', plural: 'Trebuchets', desc: 'Counterweight trebuchet with enormous range. Devastating against buildings, fragile against cavalry.' },
  bombard: { name: 'Bombard', plural: 'Bombards', desc: 'Heavy siege cannon. Brings down walls; slow and fragile against cavalry.' },
  field_gun: { name: 'Field Gun', plural: 'Field Guns', desc: 'Light field cannon with area canister. Good against troops and buildings, fragile against cavalry.' },
  howitzer: { name: 'Howitzer', plural: 'Howitzers', desc: 'Long-range, high-angle howitzer with area damage. Fragile against cavalry. Costs oil.' },
  self_propelled_gun: { name: 'Self-Propelled Gun', plural: 'Self-Propelled Guns', desc: 'Tracked, armored gun, faster than towed artillery. Area damage at great range. Costs oil.' },
  covered_ram: { name: 'Covered Ram', plural: 'Covered Rams', desc: 'Ram under a roof of wet hides: melee, shrugs off arrows and breaks gates. Gunpowder retires it.' },
  greek_fire_siphon: { name: 'Greek Fire Siphon', plural: 'Greek Fire Siphons', desc: 'Greek fire siphon: short-range jet of flame with area damage against troops and buildings. Costs oil; gunpowder retires it.' },
};

export const EN_BUILDINGS: Record<string, TextOverlay> = {
  town_center: { name: 'Town Center', desc: 'Heart of the city. Trains citizens, receives resources and projects borders. Shelters up to 15 units, which reinforce its arrows.' },
  house: { name: 'House', desc: 'Supports 10 population.' },
  farm: { name: 'Farm', desc: 'Infinite food source for 1 citizen. Slower than hunting and berries.' },
  granary: { name: 'Granary', desc: 'Food drop-off point and farming research.' },
  lumber_camp: { name: 'Lumber Camp', desc: 'Wood drop-off point and woodcutting research.' },
  mine: { name: 'Mine', desc: 'Gold drop-off point and mining research.' },
  quarry: { name: 'Quarry', desc: 'Stone drop-off point and stonecutting research.' },
  naphtha_well: { name: 'Naphtha Well', desc: 'Oil drop-off point: citizens gather naphtha from the seeps (from Era IV on) and bring it here.' },
  oil_well: { name: 'Oil Well', desc: 'Built touching an oil field, it extracts 1 oil per second with no citizens until the field runs dry.' },
  refinery: { name: 'Refinery', desc: 'Receives oil and researches refining (faster oil gathering and extraction).' },
  market: { name: 'Market', desc: 'Buy and sell resources for gold. Prices shift with use.' },
  temple: { name: 'Temple', desc: 'Citizens pray here to generate Favor. Trains heroes and mythic creatures. Required for the Classical Era.' },
  barracks: { name: 'Barracks', desc: 'Trains infantry and archers.' },
  stable: { name: 'Stable', desc: 'Trains cavalry.' },
  siege_workshop: { name: 'Siege Workshop', desc: 'Builds siege engines.' },
  shipyard: { name: 'Shipyard', desc: 'Builds ships on the shore: needs open sea alongside (2 tiles or more) and can stand in your own or neutral territory. Fishing boats deliver food here.' },
  academy: { name: 'Library', desc: 'Library: advance the Eras and study the Civic, Commerce, Military and Science lines, one study at a time (queue of up to 5). Philosophers generate Knowledge. One per Town Center, up to 3.' },
  tower: { name: 'Watchtower', desc: 'Ranged defense that also slightly extends your borders.' },
  wall: { name: 'Wall', desc: 'Blocks passage. Click and drag to build in a line.' },
  gate: { name: 'Gate', desc: 'Wall segment that lets your units and allies through but blocks enemies.' },
  fortress: { name: 'Fortress', desc: 'Bastion that projects borders, trains elite troops and defends with volleys of arrows.' },
  wonder_zeus: { name: 'Statue of Zeus', desc: 'Era II wonder (2 points). Favor +50%.' },
  wonder_artemis: { name: 'Temple of Artemis', desc: 'Era II wonder (2 points). Mythic creatures +25% health.' },
  wonder_colossus: { name: 'Colossus of Rhodes', desc: 'Era III wonder (3 points). Borders +4 and buildings +20% health.' },
  wonder_lion_gate: { name: "Lion Gate of Mycenae", desc: "Era I wonder (1 point). Walls and gates +50% health; borders +2." },
  wonder_labyrinth: { name: "Labyrinth of Knossos", desc: "Era I wonder (1 point). Enemies inside your territory move 25% slower; Minotaurs 25% cheaper." },
  wonder_delphi: { name: "Sanctuary of Delphi", desc: "Era I wonder (1 point). Favor +20%; every 3 minutes a free Oracle reveals the map for 20 s." },
  wonder_parthenon: { name: "Parthenon", desc: "Era II wonder (2 points). Knowledge +25%; infantry +10% health." },
  wonder_epidaurus: { name: "Theatre of Epidaurus", desc: "Era II wonder (2 points). Asclepius heals: your units regain 1.5 health per second inside your territory, 5 s after the last hit." },
  wonder_mausoleum: { name: "Mausoleum at Halicarnassus", desc: "Era III wonder (3 points). Your heroes slain in battle are reborn at one of your Temples 30 s later." },
  wonder_pharos: { name: "Lighthouse of Alexandria", desc: "Era III wonder (3 points). Reveals the coastline; ships +15% speed and sight; sea trade routes +25% gold." },
  wonder_great_library: { name: "Library of Alexandria", desc: "Era III wonder (3 points). Studies 25% cheaper; each Library runs two studies at once." },
  wonder_hagia_sophia: { name: "Hagia Sophia", desc: "Era IV wonder (4 points). Favor +25%; enemy attrition inside your territory doubles." },
  wonder_theodosian_walls: { name: "Theodosian Walls", desc: "Era IV wonder (4 points). Walls, gates and towers +100% health; towers +1 range." },
  wonder_meteora: { name: "Monasteries of Meteora", desc: "Era IV wonder (4 points). Knowledge +30%; all buildings +10% health." },
  wonder_candia_arsenal: { name: "Arsenal of Candia", desc: "Era V wonder (5 points). Ships 30% cheaper and 30% faster to build." },
  wonder_knights_rhodes: { name: "Fortress of the Knights of Rhodes", desc: "Era V wonder (5 points). Fortresses +50% health and attack; Fortress elite 20% cheaper." },
  wonder_palamidi: { name: "Palamidi Fortress", desc: "Era VI wonder (6 points). Artillery and towers +50% sight and +1 range." },
  wonder_corinth_canal: { name: "Corinth Canal", desc: "Era VII wonder (7 points). Caravans and merchant ships +50% gold; troops walk over it and ships sail through it (build it on an isthmus)." },
  wonder_panathenaic: { name: "Panathenaic Stadium", desc: "Era VII wonder (7 points). Your units earn veterancy ranks twice as fast." },
  wonder_olympus_throne: { name: "Throne of Olympus", desc: "Era VIII wonder (8 points). When finished, it recharges all your divine powers and grants +1 use of each." },
  titan_gate: { name: 'Titan Gate', desc: "When completed, frees your major god's Titan. Can only be built once." },
  cornucopia: { name: 'Cornucopia', desc: "Hephaestus's gift: generates food, wood and gold continuously." },
};

export const EN_LINES: Record<string, TextOverlay> = {
  citizen: { name: 'Citizens' }, scout: { name: 'Scouts' }, heavy_infantry: { name: 'Heavy Infantry' }, ranged: { name: 'Missile Troops' },
  skirmisher: { name: 'Skirmishers' }, cavalry: { name: 'Cavalry' }, elite: { name: 'Fortress Elite' }, artillery: { name: 'Artillery' },
  assault: { name: 'Wall Assault' }, greek_fire: { name: 'Greek Fire' },
  fishing: { name: 'Fishing Boats' }, transport: { name: 'Transport Ships' }, warship: { name: 'Warships' },
};
/** E4: EN dos estudos de linhas que não trocam de tipo (na mesma conta de evolutions() em techs.ts). */
const LINE_STUDIES_EN: Record<string, { names: (string | null)[]; desc: string }> = {
  fishing: { names: [null, null, null, null, null, null, 'Steam', null], desc: 'Steam fishing boats: +25% speed, +50% health and fishing +25%.' },
  transport: { names: [null, null, null, null, null, null, 'Steam', null], desc: 'Steam transports: +30% speed and +50% health.' },
};
const CITIZEN_STUDIES_EN = [null, 'Iron Tools', 'Artisans', 'Guilds', 'Steel Tools', 'Manufacture', 'Factory Workers', 'Modern Workers'];
/** EN dos estudos de evolução (E3), na mesma conta de src/core/data/techs.ts (evolutions). */
function evolutionsEN(): Record<string, TextOverlay> {
  const out: Record<string, TextOverlay> = {};
  for (const [id, l] of Object.entries(LINES)) {
    for (let k = lineStart(l) + 1; k < l.steps.length; k++) {
      const to = l.steps[k];
      if (!to) continue;
      out[evoTechId(id, k)] = id === 'citizen'
        ? { name: `${EN_LINES[id].name}: ${CITIZEN_STUDIES_EN[k]}`, desc: 'Citizens +10% health; food, wood, stone and gold gathering +4%; building 5% faster.' }
        : LINE_STUDIES_EN[id] ? { name: `${EN_LINES[id].name}: ${LINE_STUDIES_EN[id].names[k]}`, desc: LINE_STUDIES_EN[id].desc }
        : { name: `${EN_LINES[id].name}: ${EN_UNITS[to].name}`, desc: `Trains ${EN_UNITS[to].plural} instead of the previous step; the line's units you already have are transformed (health in proportion, rank and orders kept).` };
    }
  }
  return out;
}

const line = (name: string, desc: string): Record<string, TextOverlay> => {
  const out: Record<string, TextOverlay> = {};
  const key = { Civics: 'civic', Commerce: 'commerce', Military: 'military', Science: 'science' }[name]!;
  ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'].forEach((r, i) => { out[`${key}${i + 1}`] = { name: `${name} ${r}`, desc }; });
  return out;
};

export const EN_TECHS: Record<string, TextOverlay> = {
  ...line('Civics', 'Borders +2, +1 Town Center allowed, attrition +0.25/s, population +10.'),
  ...line('Commerce', 'All resource gathering +8% and lower Market fees.'),
  ...line('Military', 'All military units +6% health and attack.'),
  ...line('Science', 'Knowledge +15%, research 8% cheaper and line of sight +1.'),
  masonry: { name: 'Masonry', desc: 'All buildings +20% health.' },
  ballista_towers: { name: 'Ballista Towers', desc: 'Towers, fortresses and town centers +50% attack; towers and fortresses +1 range.' },
  logistics: { name: 'Logistics', desc: 'Your troops suffer 50% less attrition in enemy territory and train 15% faster.' },
  wheel: { name: 'Wheel', desc: 'Citizens move 15% faster.' },
  hunting_dogs: { name: 'Hunting Dogs', desc: 'Hunting 25% faster.' },
  fortified_towns: { name: 'Fortified Towns', desc: 'Town Centers +30% health and +50% attack.' },
  census: { name: 'Census', desc: 'Population cap +20.' },
  harvest1: { name: 'Harvest I', desc: 'Food gathering +15%.' }, harvest2: { name: 'Harvest II', desc: 'Food gathering +15%.' }, harvest3: { name: 'Harvest III', desc: 'Food gathering +15%.' },
  irrigation: { name: 'Irrigation', desc: 'Farms yield 30% more.' },
  axes1: { name: 'Bronze Axes', desc: 'Woodcutting +15%.' }, axes2: { name: 'Iron Axes', desc: 'Woodcutting +15%.' }, axes3: { name: 'Saws', desc: 'Woodcutting +15%.' },
  stone_wedges: { name: 'Bronze Wedges', desc: 'Stone gathering +15%.' }, stone_saws: { name: 'Sand Saw', desc: 'Stone gathering +15%.' }, stone_cranes: { name: 'Trispastos Crane', desc: 'Stone gathering +15% and building 10% faster.' },
  bitumen_jars: { name: 'Bitumen Jars', desc: 'Oil gathering +15%.' }, distillation: { name: 'Distillation', desc: 'Oil gathering and extraction +20%.' }, cracking: { name: 'Cracking', desc: 'Oil gathering and extraction +25%.' },
  picks1: { name: 'Pickaxes', desc: 'Mining +15%.' }, picks2: { name: 'Galleries', desc: 'Mining +15%.' }, picks3: { name: 'Smelting', desc: 'Mining +15%.' },
  coinage: { name: 'Coinage', desc: 'Market fees 30% lower.' },
  oracles: { name: 'Oracles', desc: 'Favor generation +20%.' },
  sacred_rites: { name: 'Sacred Rites', desc: 'Favor generation +25%.' },
  mythic_blood: { name: 'Mythic Blood', desc: 'Mythic creatures +15% health.' },
  divine_arms: { name: 'Divine Arms', desc: 'Heroes +25% attack and +15% health.' },
  phalanx: { name: 'Phalanx', desc: 'Infantry +15% health.' },
  bronze_armor: { name: 'Bronze Armor', desc: 'Infantry and archers +10% armor.' },
  iron_weapons: { name: 'Iron Weapons', desc: 'Infantry +15% attack.' },
  composite_bows: { name: 'Composite Bows', desc: 'Archers +1 range and +10% attack.' },
  horse_breeding: { name: 'Horse Breeding', desc: 'Cavalry +10% speed and health.' },
  barding: { name: 'Barding', desc: 'Cavalry +10% armor.' },
  ballistics: { name: 'Ballistics', desc: 'Siege +1 range and +15% attack.' },
  aegis: { name: 'Aegis', desc: "Athena's shield: infantry +15% pierce armor." },
  wisdom: { name: "Athena's Wisdom", desc: 'Knowledge +30%.' },
  winged_sandals: { name: 'Winged Sandals', desc: 'Cavalry +15% and citizens +10% speed.' },
  caduceus: { name: 'Caduceus', desc: 'Far more profitable Market and units regenerate 0.5 health/s.' },
  fury: { name: 'Fury of Ares', desc: 'Infantry +20% attack.' },
  war_drums: { name: 'War Drums', desc: 'Units train 25% faster.' },
  delphi: { name: 'Oracle of Delphi', desc: 'Favor +30% and line of sight +2 for everything.' },
  golden_bow: { name: 'Golden Bow', desc: 'Archers +1 range and +15% attack.' },
  bacchanal: { name: 'Bacchanal', desc: 'Military +10% health and farms +20%.' },
  anthropomorphic: { name: 'Titan Blood', desc: 'Heroes +30% health.' },
  charm: { name: 'Charm', desc: 'Citizens 25% cheaper and build 20% faster.' },
  ambrosia: { name: 'Ambrosia', desc: 'All units regenerate 1 health per second.' },
  royalty: { name: "Hera's Royalty", desc: 'Borders +3; Town Centers and Fortresses +25% health.' },
  crown: { name: 'Divine Crown', desc: 'Mythic creatures +20% health and +15% attack.' },
  divine_forge: { name: 'Divine Forge', desc: 'All military units +10% armor.' },
  automatons: { name: 'Automatons', desc: 'Siege engines +40% health and +20% attack.' },
  moon_arrows: { name: 'Moon Arrows', desc: 'All ranged units +20% attack.' },
  great_hunt: { name: 'Great Hunt', desc: 'Hunting +50% and all food +10%.' },
  fishing_nets: { name: 'Fishing Nets', desc: 'Fishing boats gather 20% faster.' },
  caulking: { name: 'Pitch Caulking', desc: 'Ships +15% health.' },
  bronze_rams: { name: 'Bronze Rams', desc: 'Warships +15% attack.' },
  navigation: { name: 'Celestial Navigation', desc: 'Ships 10% faster and +2 sight.' },
  ...evolutionsEN(),
};

export const EN_POWERS: Record<string, TextOverlay> = {
  bolt: { name: "Zeus's Bolt", desc: 'A lightning bolt instantly kills any enemy unit (Titans lose half their health).' },
  lure: { name: "Poseidon's Lure", desc: 'Raises a sacred stone holding 800 food, hunted quickly by your citizens.' },
  sentinel: { name: 'Sentinels', desc: 'Four guardian statues rise around one of your buildings and defend it with arrows.' },
  restoration: { name: 'Restoration', desc: 'Fully heals your units and buildings in an area.' },
  ceasefire: { name: 'Ceasefire', desc: 'Nobody can attack for 30 seconds. Ideal to retreat or buy time.' },
  pestilence: { name: 'Pestilence', desc: 'Enemy military buildings in the area stop producing for 60 seconds.' },
  oracle: { name: 'Oracle', desc: 'Reveals the whole map for 60 seconds.' },
  bronze: { name: 'Bronze Skin', desc: 'All your units gain +30% armor for 45 seconds.' },
  curse: { name: 'Curse', desc: 'Up to 8 enemy human soldiers in the area turn into boars (food for whoever hunts them).' },
  lightning_storm: { name: 'Lightning Storm', desc: 'For 8 seconds, bolts strike enemies in the area, each dealing 200 damage.' },
  plenty: { name: 'Plenty', desc: 'Creates a Cornucopia that generates food, wood and gold forever.' },
  earthquake: { name: 'Earthquake', desc: 'Shakes the earth: buildings in the area lose up to 1500 health and units 60.' },
};

export const EN_MINOR_GODS: Record<string, TextOverlay> = {
  athena: { name: 'Athena', title: 'Goddess of Wisdom', desc: 'Restoration heals your army; Minotaurs; sturdier infantry and more Knowledge.' },
  hermes: { name: 'Hermes', title: 'Messenger of the Gods', desc: 'Global Ceasefire; Centaurs; faster cavalry and citizens, profitable market and regeneration.' },
  ares: { name: 'Ares', title: 'God of War', desc: 'Pestilence halts enemy production; Cyclopes; stronger infantry and faster training.' },
  apollo: { name: 'Apollo', title: 'God of the Sun and Prophecy', desc: 'Oracle reveals the map; Manticores; more Favor, more sight and deadly archers.' },
  dionysus: { name: 'Dionysus', title: 'God of Wine and Ecstasy', desc: 'Bronze Skin protects the army; Hydras; sturdier military and stronger heroes.' },
  aphrodite: { name: 'Aphrodite', title: 'Goddess of Love', desc: 'Curse turns enemies into boars; Nemean Lions; cheap citizens and regeneration.' },
  hera: { name: 'Hera', title: 'Queen of Olympus', desc: 'Lightning Storm; petrifying Medusas; larger borders and superior mythic creatures.' },
  hephaestus: { name: 'Hephaestus', title: 'God of the Forge', desc: 'Plenty generates endless resources; Colossi; superior armor and siege engines.' },
  artemis: { name: 'Artemis', title: 'Goddess of the Hunt', desc: 'Earthquake razes cities; Chimeras; stronger ranged units and abundant hunting.' },
};

export const EN_MAJOR_GODS: Record<string, TextOverlay> = {
  zeus: { name: 'Zeus', title: 'King of the Gods', desc: 'The lord of Olympus favors armies of devout hoplites and legendary heroes.', perks: ['Favor +25%', 'Infantry +10% attack', 'Heroes 20% cheaper', 'Pegasi at the Temple from the Archaic Era', 'Power: Bolt'] },
  poseidon: { name: 'Poseidon', title: 'God of the Seas and Horses', desc: 'The earth-shaker commands swift cavalry and a trading economy.', perks: ['Cavalry 15% cheaper and 10% faster', 'Resource gathering +8% (the bounty of the seas)', 'Market with lower fees', 'Militia rises when one of your buildings is destroyed', 'Ships 10% cheaper and 10% faster; fishing +15%', 'Power: Lure'] },
  hades: { name: 'Hades', title: 'Lord of the Underworld', desc: 'The king of the dead raises impregnable walls and an army that returns from Tartarus.', perks: ['Buildings +25% health', 'Archers +10% attack', 'Attrition +0.3/s in your territory', 'Fallen warriors may return as Shades', 'Cerberus at the Temple from the Hellenistic Era', 'Power: Sentinels'] },
};

export const EN_AGES: Record<string, TextOverlay> = {
  '0': { name: 'Archaic Era', short: 'Archaic', desc: 'The dawn of civilization: villages, hunting and the first hoplites. Raise a Library to study and advance Eras.' },
  '1': { name: 'Classical Era', short: 'Classical', desc: 'Philosophy, cavalry and the first minor god. Requires a Temple; advance at the Library.' },
  '2': { name: 'Hellenistic Era', short: 'Hellenistic', desc: "Alexander's world: legendary heroes, siege engines and fortresses. Requires 2 Library line studies." },
  '3': { name: 'Byzantine Era', short: 'Byzantine', desc: 'Constantinople: colossal creatures, wonders of the world and divine power. Requires 4 Library line studies.' },
  '4': { name: 'Gunpowder Era', short: 'Gunpowder', desc: 'Gunpowder reaches Crete: star forts and steel cuirasses. Requires a Fortress and 7 Library line studies.' },
  '5': { name: 'Enlightenment Era', short: 'Enlightenment', desc: 'Reason and the Greek revival in neoclassical stone. Requires 10 Library line studies.' },
  '6': { name: 'Industrial Era', short: 'Industrial', desc: 'Steam, iron and chimneys. Requires 13 Library line studies.' },
  '7': { name: 'Modern Era', short: 'Modern', desc: 'Concrete and steel, and the climax: open the Titan Gate and free a Titan. Requires 16 Library line studies.' },
};

export const EN_ABILITIES: Record<string, TextOverlay> = {
  war_cry: { name: 'Cry of the Argonauts', desc: 'Jason and allies within 6 tiles gain +30% attack for 15 s.' },
  cunning: { name: 'Cunning', desc: 'Odysseus and allies within 6 tiles gain +40% speed for 10 s.' },
  titanic_blow: { name: 'Titanic Blow', desc: "Heracles's next strike (within 20 s) deals triple damage and hits enemies within 2 tiles." },
  fury: { name: "Achilles's Fury", desc: 'Achilles attacks twice as fast for 10 s.' },
  mirror_shield: { name: 'Mirror Shield', desc: 'Perseus and allies within 5 tiles become immune to petrification and take only 30% divine damage for 12 s.' },
};
