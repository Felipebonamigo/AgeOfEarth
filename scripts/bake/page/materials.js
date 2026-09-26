// Materiais PBR do bake (docs/ART.md §1.6): albedo + rugosidade (+ metalicidade). A cor de time é um material próprio
// marcado com `userData.team = true`: no passe de cor sai num cinza neutro, no passe de máscara sai em branco
// iluminado (o jogo multiplica pela cor do jogador, `team.tint`, sem perder o sombreado). Recebe `THREE` por parâmetro.

export const PALETTE = {
  skin: 0xc19a6b, hair: 0x3b2a1a, linen: 0xe8dcc0, linenDark: 0xcfc2a4, wool: 0xb8a98a,
  bronze: 0x8c6a2e, bronzeDark: 0x6a4d20, iron: 0x6e6e70, leather: 0x5a3d26, wood: 0x6b4a2b, woodDark: 0x4a331c, bark: 0x5d4a33,
  marble: 0xd9cdb4, marbleDark: 0xbfb49c, terracotta: 0xa3552e, terracottaDark: 0x7e3f22, stone: 0x74736c, stoneDark: 0x5a5953,
  crest: 0x8a2a24, olive: 0x7c8a5a, olive2: 0x6a7a4e, cypress: 0x506f40, oak: 0x4e6b2f, oak2: 0x5f7a33, leafDry: 0x8a8a4a,
  wicker: 0xa88a52, berry: 0x7a2a3a, berryLeaf: 0x4f6b32, gold: 0xd4a83a, fur: 0x8a6a48, furDark: 0x5a4632, hoof: 0x3a2e24,
  rope: 0xb09a6a, glow: 0x9fe8ff,
  // edifícios (Etapa 3): calcário, reboco de cal, pedra quente das muralhas, telha escura, fuligem/carvão (dano), terra
  limestone: 0xc8b995, limestoneDark: 0xa99a78, plaster: 0xe0d5bb, plasterDark: 0xc4b89c, stoneWarm: 0x8e8574, stoneLight: 0xa39a88,
  soot: 0x1b1714, char: 0x3a2d23, earth: 0x8a7a62, ash: 0x6d675e, canvas: 0xd9ccaa,
  // cantaria de calcário das muralhas/torres (clara: a face sul fica na meia-sombra do sol de noroeste, §1.5)
  ashlar: 0xc9bc9c, ashlar2: 0xbcae8f, ashlarDark: 0x8e836d,
  // unidades (Etapa 4): feltro do pílos/chapéu, crina de elmo escura, pelagens do cavalo (baio, alazão, tordilho,
  // preto), crina/cauda, couro cru das coberturas do cerco
  felt: 0x6b5238, crestDark: 0x2a221c, horseBay: 0x6e4326, horseChestnut: 0x8a4f2a, horseGrey: 0xa5a19a, horseBlack: 0x2f2925,
  mane: 0x231c16, hide: 0x9c7b52, bronzeBlack: 0x4a3a28,
  // heróis (Etapa 4): bronze polido como espelho (escudo de Perseu), pele e juba do leão de Nemeia (Héracles), velo de
  // ouro (Jasão)
  mirror: 0xdfe0dc, lion: 0xa8793c, lionMane: 0x4e321a, fleece: 0xc99a38,
  teamNeutral: 0x8f9098,   // cor de time no passe de cor (neutra; o jogo desenha a máscara tingida por cima)
  teamMask: 0xffffff,      // cor de time no passe de máscara (branco iluminado → tint)
};

export function createMaterials(THREE) {
  const std = (color, roughness, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const M = {
    skin: std(PALETTE.skin, 0.8), hair: std(PALETTE.hair, 0.9),
    linen: std(PALETTE.linen, 0.92), linenDark: std(PALETTE.linenDark, 0.92), wool: std(PALETTE.wool, 0.95),
    bronze: std(PALETTE.bronze, 0.35, 0.9), bronzeDark: std(PALETTE.bronzeDark, 0.45, 0.9), iron: std(PALETTE.iron, 0.4, 0.85),
    leather: std(PALETTE.leather, 0.85), wood: std(PALETTE.wood, 0.85), woodDark: std(PALETTE.woodDark, 0.9), bark: std(PALETTE.bark, 0.95),
    marble: std(PALETTE.marble, 0.55), marbleDark: std(PALETTE.marbleDark, 0.6), terracotta: std(PALETTE.terracotta, 0.85), terracottaDark: std(PALETTE.terracottaDark, 0.9),
    stone: std(PALETTE.stone, 0.95), stoneDark: std(PALETTE.stoneDark, 0.95), crest: std(PALETTE.crest, 0.85),
    olive: std(PALETTE.olive, 0.9), olive2: std(PALETTE.olive2, 0.9), cypress: std(PALETTE.cypress, 0.9),
    oak: std(PALETTE.oak, 0.9), oak2: std(PALETTE.oak2, 0.9), leafDry: std(PALETTE.leafDry, 0.9),
    wicker: std(PALETTE.wicker, 0.9, 0, { side: THREE.DoubleSide }), berry: std(PALETTE.berry, 0.6), berryLeaf: std(PALETTE.berryLeaf, 0.9),
    gold: std(PALETTE.gold, 0.3, 0.9), fur: std(PALETTE.fur, 0.95), furDark: std(PALETTE.furDark, 0.95), hoof: std(PALETTE.hoof, 0.8),
    rope: std(PALETTE.rope, 0.95), glow: std(PALETTE.glow, 0.4, 0, { emissive: PALETTE.glow, emissiveIntensity: 0.8 }),
    limestone: std(PALETTE.limestone, 0.8), limestoneDark: std(PALETTE.limestoneDark, 0.85), plaster: std(PALETTE.plaster, 0.9), plasterDark: std(PALETTE.plasterDark, 0.92),
    stoneWarm: std(PALETTE.stoneWarm, 0.92), stoneLight: std(PALETTE.stoneLight, 0.9), char: std(PALETTE.char, 0.95), earth: std(PALETTE.earth, 1),
    ash: std(PALETTE.ash, 1), canvas: std(PALETTE.canvas, 0.95, 0, { side: THREE.DoubleSide }),
    ashlar: std(PALETTE.ashlar, 0.88), ashlar2: std(PALETTE.ashlar2, 0.9), ashlarDark: std(PALETTE.ashlarDark, 0.95),
    team: std(PALETTE.teamNeutral, 0.8),
  };
  M.team.userData.team = true;
  // materiais dos passes especiais
  M.mask = std(PALETTE.teamMask, 0.85);                                   // passe de máscara: partes de time
  M.occluder = new THREE.MeshBasicMaterial({ colorWrite: false });         // só profundidade (esconde a máscara atrás do corpo)
  M.invisible = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }); // passe de sombra: modelo invisível
  M.shadowGround = new THREE.ShadowMaterial({ color: 0x000000, opacity: 1 });
  // Etapa 4 (unidades): criados DEPOIS de todos os outros — a ordem de criação decide o id do material, que o three usa
  // para ordenar o desenho; acrescentar no fim não muda a ordem relativa dos antigos (edifícios e props saem idênticos)
  Object.assign(M, {
    felt: std(PALETTE.felt, 0.95), crestDark: std(PALETTE.crestDark, 0.9),
    horseBay: std(PALETTE.horseBay, 0.7), horseChestnut: std(PALETTE.horseChestnut, 0.7), horseGrey: std(PALETTE.horseGrey, 0.75),
    horseBlack: std(PALETTE.horseBlack, 0.65), mane: std(PALETTE.mane, 0.9), hide: std(PALETTE.hide, 0.9),
    bronzeBlack: std(PALETTE.bronzeBlack, 0.42, 0.85),
  });
  // Etapa 4, lote heróis: também no fim (a ordem dos anteriores não muda); espelho e velo recebem o reflexo de ambiente
  // dos metais em bake.js
  Object.assign(M, {
    mirror: std(PALETTE.mirror, 0.12, 1.0), lion: std(PALETTE.lion, 0.95), lionMane: std(PALETTE.lionMane, 0.95),
    fleece: std(PALETTE.fleece, 0.6, 0.45),
  });
  return M;
}

/** Cor de time como parâmetro (uniform `color` do material `team`): prévias; o atlas usa a máscara (passe `team`). */
export function setTeamColor(M, hex) { M.team.color.setHex(hex); }
