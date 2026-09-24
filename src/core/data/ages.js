// Idades: progressão no estilo Rise of Nations, com sabor de Age of Mythology.
export const AGES = [
  {
    id: 0, name: 'Idade Arcaica', short: 'Arcaica', icon: '🏺',
    cost: {}, time: 0, requires: {},
    desc: 'O começo da civilização: aldeias, caça e os primeiros hoplitas.',
  },
  {
    id: 1, name: 'Idade Clássica', short: 'Clássica', icon: '🏛️',
    cost: { food: 400, gold: 300 }, time: 60,
    requires: { building: 'temple' }, minorGod: true,
    desc: 'Filosofia, cavalaria e os primeiros deuses menores. Requer um Templo.',
  },
  {
    id: 2, name: 'Idade Heroica', short: 'Heroica', icon: '⚔️',
    cost: { food: 800, gold: 500, knowledge: 200 }, time: 75,
    requires: { building: 'academy', techCount: 2 }, minorGod: true,
    desc: 'Heróis lendários, máquinas de cerco e fortalezas. Requer Academia e 2 pesquisas da Academia.',
  },
  {
    id: 3, name: 'Idade Mítica', short: 'Mítica', icon: '🔱',
    cost: { food: 1000, gold: 1000, knowledge: 500 }, time: 90,
    requires: { techCount: 4 }, minorGod: true,
    desc: 'Criaturas colossais, maravilhas do mundo e poder divino. Requer 4 pesquisas da Academia.',
  },
  {
    id: 4, name: 'Idade dos Titãs', short: 'Titãs', icon: '🌋',
    cost: { food: 1500, gold: 1500, knowledge: 1000, favor: 300 }, time: 120,
    requires: { building: 'fortress', techCount: 6 }, minorGod: false,
    desc: 'O ápice: abra o Portal dos Titãs e liberte um Titã. Requer Fortaleza e 6 pesquisas da Academia.',
  },
];
export const MAX_AGE = AGES.length - 1;
