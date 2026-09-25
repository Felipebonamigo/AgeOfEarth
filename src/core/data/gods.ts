// Deuses maiores, deuses menores e poderes divinos (estilo Age of Mythology, panteão grego).
import type { MajorGodDef, MinorGodDef, PowerDef } from '../types';

export const POWERS: Record<string, PowerDef> = {
  bolt: { id: 'bolt', name: 'Raio de Zeus', icon: '⚡', targeting: 'unit', desc: 'Um raio mata instantaneamente qualquer unidade inimiga (Titãs perdem metade da vida).' },
  lure: { id: 'lure', name: 'Isca de Poseidon', icon: '🪨', targeting: 'place', desc: 'Ergue uma pedra sagrada com 800 de comida, caçada rapidamente pelos seus cidadãos.' },
  sentinel: { id: 'sentinel', name: 'Sentinelas', icon: '🗿', targeting: 'building', desc: 'Quatro estátuas guardiãs surgem ao redor de um edifício seu e o defendem com flechas.' },
  restoration: { id: 'restoration', name: 'Restauração', icon: '💚', targeting: 'area', radius: 8, desc: 'Cura completamente suas unidades e edifícios em uma área.' },
  ceasefire: { id: 'ceasefire', name: 'Trégua', icon: '🕊️', targeting: 'global', desc: 'Ninguém pode atacar por 30 segundos. Ideal para recuar ou ganhar tempo.' },
  pestilence: { id: 'pestilence', name: 'Pestilência', icon: '☠️', targeting: 'area', radius: 10, desc: 'Edifícios militares inimigos na área ficam sem produzir por 60 segundos.' },
  oracle: { id: 'oracle', name: 'Oráculo', icon: '👁️', targeting: 'global', desc: 'Revela o mapa inteiro por 60 segundos.' },
  bronze: { id: 'bronze', name: 'Pele de Bronze', icon: '🥉', targeting: 'global', desc: 'Todas as suas unidades ganham +30% de armadura por 45 segundos.' },
  curse: { id: 'curse', name: 'Maldição', icon: '🐗', targeting: 'area', radius: 4, desc: 'Até 8 soldados humanos inimigos na área viram javalis (comida para quem os caçar).' },
  lightning_storm: { id: 'lightning_storm', name: 'Tempestade de Raios', icon: '🌩️', targeting: 'area', radius: 6, desc: 'Durante 8 segundos, raios caem sobre inimigos na área, cada um causando 200 de dano.' },
  plenty: { id: 'plenty', name: 'Abundância', icon: '🌽', targeting: 'place', desc: 'Cria uma Cornucópia que gera comida, madeira e ouro para sempre.' },
  earthquake: { id: 'earthquake', name: 'Terremoto', icon: '🌋', targeting: 'area', radius: 7, desc: 'Sacode a terra: edifícios na área perdem até 1500 de vida e unidades 60.' },
};

export const MINOR_GODS: Record<string, MinorGodDef> = {
  athena: { id: 'athena', name: 'Atena', title: 'Deusa da Sabedoria', icon: '🦉', age: 1, power: 'restoration', mythUnit: 'minotaur', techs: ['aegis', 'wisdom'],
    desc: 'Restauração cura seu exército; Minotauros; infantaria mais resistente e mais Conhecimento.' },
  hermes: { id: 'hermes', name: 'Hermes', title: 'Mensageiro dos Deuses', icon: '👟', age: 1, power: 'ceasefire', mythUnit: 'centaur', techs: ['winged_sandals', 'caduceus'],
    desc: 'Trégua global; Centauros; cavalaria e cidadãos mais rápidos, mercado lucrativo e regeneração.' },
  ares: { id: 'ares', name: 'Ares', title: 'Deus da Guerra', icon: '🗡️', age: 1, power: 'pestilence', mythUnit: 'cyclops', techs: ['fury', 'war_drums'],
    desc: 'Pestilência paralisa a produção inimiga; Ciclopes; infantaria mais forte e treino mais rápido.' },
  apollo: { id: 'apollo', name: 'Apolo', title: 'Deus do Sol e da Profecia', icon: '☀️', age: 2, power: 'oracle', mythUnit: 'manticore', techs: ['delphi', 'golden_bow'],
    desc: 'Oráculo revela o mapa; Mantícoras; mais Favor, mais visão e arqueiros letais.' },
  dionysus: { id: 'dionysus', name: 'Dionísio', title: 'Deus do Vinho e do Êxtase', icon: '🍇', age: 2, power: 'bronze', mythUnit: 'hydra', techs: ['bacchanal', 'anthropomorphic'],
    desc: 'Pele de Bronze protege o exército; Hidras; militares mais resistentes e heróis mais fortes.' },
  aphrodite: { id: 'aphrodite', name: 'Afrodite', title: 'Deusa do Amor', icon: '💘', age: 2, power: 'curse', mythUnit: 'nemean_lion', techs: ['charm', 'ambrosia'],
    desc: 'Maldição transforma inimigos em javalis; Leões de Nemeia; cidadãos baratos e regeneração.' },
  hera: { id: 'hera', name: 'Hera', title: 'Rainha do Olimpo', icon: '👑', age: 3, power: 'lightning_storm', mythUnit: 'medusa', techs: ['royalty', 'crown'],
    desc: 'Tempestade de Raios; Medusas que petrificam; fronteiras maiores e criaturas míticas superiores.' },
  hephaestus: { id: 'hephaestus', name: 'Hefesto', title: 'Deus da Forja', icon: '⚒️', age: 3, power: 'plenty', mythUnit: 'colossus', techs: ['divine_forge', 'automatons'],
    desc: 'Abundância gera recursos infinitos; Colossos; armaduras e máquinas de cerco superiores.' },
  artemis: { id: 'artemis', name: 'Ártemis', title: 'Deusa da Caça', icon: '🌙', age: 3, power: 'earthquake', mythUnit: 'chimera', techs: ['moon_arrows', 'great_hunt'],
    desc: 'Terremoto arrasa cidades; Quimeras; unidades à distância mais fortes e caça abundante.' },
};

export const MAJOR_GODS: Record<string, MajorGodDef> = {
  zeus: {
    id: 'zeus', name: 'Zeus', title: 'Rei dos Deuses', icon: '⚡', power: 'bolt', titan: 'prometheus', mythUnit: 'pegasus',
    minorGods: [['athena', 'hermes'], ['apollo', 'dionysus'], ['hera', 'artemis']],
    bonuses: [
      { type: 'player', stat: 'favorRate', mult: 1.25 },
      { type: 'unit', match: { tags: ['infantry'] }, stat: 'attack', mult: 1.1 },
      { type: 'cost', match: { tags: ['hero'] }, mult: 0.8 },
    ],
    perks: ['Favor +25%', 'Infantaria +10% de ataque', 'Heróis 20% mais baratos', 'Pégasos no Templo desde a Idade Arcaica', 'Poder: Raio'],
    desc: 'O senhor do Olimpo favorece exércitos de hoplitas devotos e heróis lendários.',
  },
  poseidon: {
    id: 'poseidon', name: 'Poseidon', title: 'Deus dos Mares e dos Cavalos', icon: '🔱', power: 'lure', titan: 'oceanus',
    minorGods: [['ares', 'hermes'], ['aphrodite', 'dionysus'], ['hephaestus', 'artemis']],
    bonuses: [
      { type: 'cost', match: { tags: ['cavalry'] }, mult: 0.85 },
      { type: 'unit', match: { tags: ['cavalry'] }, stat: 'speed', mult: 1.1 },
      { type: 'player', stat: 'tradeTax', mult: 0.8 },
      { type: 'gather', resource: 'all', mult: 1.08 },
    ],
    perks: ['Cavalaria 15% mais barata e 10% mais rápida', 'Coleta de recursos +8% (a fartura dos mares)', 'Mercado com taxas menores', 'Milícia surge quando um edifício seu é destruído', 'Poder: Isca'],
    desc: 'O abalador da terra comanda cavalarias velozes e uma economia de comércio.',
  },
  hades: {
    id: 'hades', name: 'Hades', title: 'Senhor do Submundo', icon: '💀', power: 'sentinel', titan: 'cronus',
    minorGods: [['ares', 'athena'], ['aphrodite', 'apollo'], ['hephaestus', 'hera']],
    bonuses: [
      { type: 'building', match: 'all', stat: 'hp', mult: 1.25 },
      { type: 'unit', match: { tags: ['archer'] }, stat: 'attack', mult: 1.1 },
      { type: 'player', stat: 'attrition', add: 0.3 },
    ],
    perks: ['Edifícios +25% de vida', 'Arqueiros +10% de ataque', 'Atrito +0,3/s em seu território', 'Guerreiros mortos podem voltar como Sombras', 'Cérbero no Templo a partir da Idade Heroica', 'Poder: Sentinelas'],
    desc: 'O rei dos mortos ergue muralhas inexpugnáveis e um exército que retorna do Tártaro.',
  },
};

export const MAJOR_GOD_LIST = ['zeus', 'poseidon', 'hades'];
