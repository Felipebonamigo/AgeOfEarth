import type { Cost } from '../types';

export interface AgeDef { id: number; name: string; short: string; icon: string; cost: Cost; time: number; requires: { building?: string; techCount?: number }; minorGod: boolean; desc: string }

// Os índices 0–3 são as Idades de antes com os mesmos custos; a antiga Idade dos Titãs (4) virou a Moderna (7);
// `minorGod` só onde `MAJOR_GODS.minorGods` tem o par (índice k ↔ `minorGods[k − 1]`).
export const AGES: AgeDef[] = [
  { id: 0, name: 'Era Arcaica', short: 'Arcaica', icon: '🏺', cost: {}, time: 0, requires: {}, minorGod: false,
    desc: 'O começo da civilização: aldeias, caça e os primeiros hoplitas. Erga uma Biblioteca para estudar e avançar de Era.' },
  { id: 1, name: 'Era Clássica', short: 'Clássica', icon: '🏛️', cost: { food: 400, gold: 300 }, time: 60,
    requires: { building: 'temple' }, minorGod: true,
    desc: 'Filosofia, cavalaria e o primeiro deus menor. Requer um Templo; avance na Biblioteca.' },
  { id: 2, name: 'Era Helenística', short: 'Helenística', icon: '⚔️', cost: { food: 800, gold: 500, knowledge: 200 }, time: 75,
    requires: { techCount: 2 }, minorGod: true,
    desc: 'O mundo de Alexandre: heróis lendários, máquinas de cerco e fortalezas. Requer 2 estudos das linhas da Biblioteca.' },
  { id: 3, name: 'Era Bizantina', short: 'Bizantina', icon: '🔱', cost: { food: 1000, gold: 1000, knowledge: 500 }, time: 90,
    requires: { techCount: 4 }, minorGod: true,
    desc: 'Constantinopla: criaturas colossais, maravilhas do mundo e poder divino. Requer 4 estudos das linhas da Biblioteca.' },
  { id: 4, name: 'Era da Pólvora', short: 'Pólvora', icon: '💣', cost: { food: 1500, gold: 1500, knowledge: 1000 }, time: 120,
    requires: { building: 'fortress', techCount: 7 }, minorGod: false,
    desc: 'A pólvora chega a Creta: fortes estrelados e couraças de aço. Requer uma Fortaleza e 7 estudos das linhas da Biblioteca.' },
  { id: 5, name: 'Era do Iluminismo', short: 'Iluminismo', icon: '📜', cost: { food: 1800, gold: 1800, knowledge: 1300 }, time: 130,
    requires: { techCount: 10 }, minorGod: false,
    desc: 'A razão e o renascimento grego em pedra neoclássica. Requer 10 estudos das linhas da Biblioteca.' },
  { id: 6, name: 'Era Industrial', short: 'Industrial', icon: '🏭', cost: { food: 2100, gold: 2100, knowledge: 1600 }, time: 140,
    requires: { techCount: 13 }, minorGod: false,
    desc: 'Vapor, ferro e chaminés. Requer 13 estudos das linhas da Biblioteca.' },
  { id: 7, name: 'Era Moderna', short: 'Moderna', icon: '🌋', cost: { food: 2400, gold: 2400, knowledge: 2000, favor: 300 }, time: 150,
    requires: { techCount: 16 }, minorGod: false,
    desc: 'Concreto e aço, e o clímax: abra o Portal dos Titãs e liberte um Titã. Requer 16 estudos das linhas da Biblioteca.' },
];
export const MAX_AGE = AGES.length - 1;

/** Índices das Eras (docs/ERAS.md §1). */
export const ERA = { ARCHAIC: 0, CLASSICAL: 1, HELLENISTIC: 2, BYZANTINE: 3, GUNPOWDER: 4, ENLIGHTENMENT: 5, INDUSTRIAL: 6, MODERN: 7 } as const;
/** Era dos Titãs e do Portal dos Titãs (a Moderna). */
export const ERA_TITANS = ERA.MODERN;
/** Idade antiga (0–4, até 06/10/2026) → Era nova: só a dos Titãs muda (4 → 7). Só para dados gravados antes da E1. */
export const LEGACY_AGE_TO_ERA: readonly number[] = [0, 1, 2, 3, 7];
/** Campanha atual: Eras I–IV, com a aparência limitada à Helenística (docs/ERAS.md §10). */
export const CAMPAIGN_MAX_ERA = ERA.BYZANTINE;
export const CAMPAIGN_VISUAL_ERA_MAX = ERA.HELLENISTIC;
/** Inteiro de Era válido (0…MAX_AGE); NaN/infinito → 0. */
export function clampEra(n: number): number { return Number.isFinite(n) ? Math.max(0, Math.min(MAX_AGE, Math.floor(n))) : 0; }
