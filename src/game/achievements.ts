// Conquistas: avaliadas no cliente a partir do estado; persistidas localmente e enviadas à Steam quando disponível.
import { AGES, UNITS } from '../core/data';
import type { GameState } from '../core/types';
import { desktop } from './files';
import { CAMPAIGN, CAMPAIGN_PLAN, PROLOGUE_IDS } from '../core/scenario/campaign';
import { actMissionIds, type CampaignAct } from '../core/scenario/official';

/**
 * Conquistas geradas do registro da campanha (G0): uma por missão nova registrada (as do prólogo são feitas à mão acima),
 * "Ato I/II/III completo" (todas as missões oficiais do ato — só destrava quando o ato inteiro estiver registrado) e
 * "Campanha no Difícil" (as 12 missões oficiais no Difícil).
 */
function campaignAchievements(): AchievementDef[] {
  const out: AchievementDef[] = [];
  for (const e of CAMPAIGN) {
    if (PROLOGUE_IDS.includes(e.id) || !e.file) continue;
    const n = CAMPAIGN_PLAN.findIndex((m) => m.id === e.id) + 1;
    const title = typeof e.file.title === 'string' ? e.file.title : e.file.title.pt;
    const titleEn = typeof e.file.title === 'string' ? e.file.title : (e.file.title.en ?? e.file.title.pt);
    out.push({ id: e.id, name: title, desc: `Complete a missão ${n} da campanha.`, nameEn: titleEn, descEn: `Complete mission ${n} of the campaign.`, icon: e.file.icon ?? '📜', check: (_s, _l, c) => c.missionsDone.includes(e.id) });
  }
  const acts: [CampaignAct, string, string, string, string][] = [[1, 'I', 'A Sombra dos Titãs', 'The Shadow of the Titans', '⛓️'], [2, 'II', 'A Maré de Poseidon', "Poseidon's Tide", '🌊'], [3, 'III', 'A Queda de Cronos', 'The Fall of Cronus', '⏳']];
  for (const [act, roman, name, nameEn, icon] of acts) {
    const ids = actMissionIds(act);
    out.push({ id: `campaign_act${act}`, name: `Ato ${roman} completo: ${name}`, desc: `Complete todas as missões do Ato ${roman}.`, nameEn: `Act ${roman} complete: ${nameEn}`, descEn: `Complete every mission of Act ${roman}.`, icon, check: (_s, _l, c) => ids.every((m) => c.missionsDone.includes(m)) });
  }
  out.push({ id: 'campaign_all_hard', name: 'Titanomaquia no Difícil', desc: 'Complete as 12 missões da campanha no Difícil.', nameEn: 'Titanomachy on Hard', descEn: 'Complete all 12 campaign missions on Hard.', icon: '🏛️', check: (_s, _l, c) => CAMPAIGN_PLAN.every((m) => c.missionsHard.includes(m.id)) });
  return out;
}

export interface AchievementDef { id: string; name: string; desc: string; nameEn?: string; descEn?: string; icon: string; check: (s: GameState, local: number, ctx: AchievementCtx) => boolean }

/** Nome e descrição em inglês das conquistas fixas (as geradas trazem nameEn/descEn). */
const EN: Record<string, [string, string]> = {
  first_temple: ['First Offering', 'Complete a Temple.'],
  classical: ['Philosopher', 'Reach the Classical Age.'],
  heroic: ['Song of Heroes', 'Reach the Heroic Age.'],
  mythic: ['Touch of the Gods', 'Reach the Mythic Age.'],
  titans: ['Titanomachy', 'Reach the Age of Titans.'],
  titan_summoned: ['Broken Chains', 'Unleash a Titan.'],
  hero_trio: ['Argonauts', 'Have three heroes alive at the same time.'],
  menagerie: ['Bestiary', 'Have five different mythic creatures alive at the same time.'],
  kills_100: ['Shield Wall', 'Kill 100 enemy units in one match.'],
  kills_500: ['Scourge of Tartarus', 'Kill 500 enemy units in one match.'],
  razed_25: ['Wrecker', 'Destroy 25 enemy buildings in one match.'],
  territory_2000: ['Empire', 'Control 2000 tiles of territory.'],
  all_techs_line: ['Library of Alexandria', 'Research Civics V, Commerce V, Military V and Science V.'],
  win_conquest: ['Conqueror', 'Win by conquest.'],
  win_wonder: ['Wonder of the World', 'Win by holding a Wonder.'],
  win_no_loss: ['Untouchable', 'Win a quick match losing fewer than 10 units.'],
  win_brutal: ['Titan Tamer', 'Win a quick match against a Very Hard AI.'],
  all_gods: ['Ecumenical', 'Play matches as Zeus, Poseidon and Hades.'],
  horde_10: ['Keeper of the Gates', 'Survive 10 waves in Horde Mode.'],
  horde_20: ['Lord of Tartarus', 'Win Horde Mode.'],
  m1_despertar: ['The Awakening of Argos', 'Complete mission 1 of the campaign.'],
  m2_cerco: ['Walls of Argos', 'Complete mission 2 of the campaign.'],
  m3_portal: ['The Sealed Gate', 'Complete mission 3 of the campaign.'],
  campaign_prologue: ['The Shadow of the Titans', 'Complete the campaign prologue.'],
  campaign_hard: ['Forged in Fire', 'Complete the campaign prologue on Hard.'],
  horde_hard: ['Bronze Wall', 'Win Horde Mode on Hard or above.'],
  garrison_defense: ['Closed Gates', 'Have 15 units garrisoned in a single building.'],
};

/** Nome e descrição da conquista no idioma pedido (PT é o original; EN cai no PT se faltar tradução). */
export function achievementText(a: AchievementDef, locale: string): { name: string; desc: string } {
  if (locale !== 'en') return { name: a.name, desc: a.desc };
  const fixed = EN[a.id];
  return { name: a.nameEn ?? fixed?.[0] ?? a.name, desc: a.descEn ?? fixed?.[1] ?? a.desc };
}
export interface AchievementCtx { godsPlayed: string[]; hordeWaves: number; missionsDone: string[]; missionsHard: string[] }

const p = (s: GameState, l: number) => s.players[l];
/** Idade com que a partida começa (startingAge do cenário/config; Deathmatch começa na Clássica). */
const startAge = (s: GameState) => s.config.startingAge ?? (s.config.mode === 'deathmatch' ? 1 : 0);
/** Conquista de Idade: só vale se o jogador AVANÇOU até ela (missões que já começam na Heroica não a concedem). */
const advancedTo = (s: GameState, l: number, age: number) => p(s, l).age >= age && startAge(s) < age;
const wonBy = (s: GameState, l: number) => s.gameOver && s.winner >= 0 && s.players[s.winner].team === p(s, l).team;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_temple', name: 'Primeira Oferenda', desc: 'Conclua um Templo.', icon: '⚡', check: (s, l) => [...s.buildings.values()].some((b) => b.owner === l && b.complete && b.type === 'temple') },
  { id: 'classical', name: 'Filósofo', desc: 'Alcance a Idade Clássica.', icon: '🏛️', check: (s, l) => advancedTo(s, l, 1) },
  { id: 'heroic', name: 'Canção dos Heróis', desc: 'Alcance a Idade Heroica.', icon: '⚔️', check: (s, l) => advancedTo(s, l, 2) },
  { id: 'mythic', name: 'Toque dos Deuses', desc: 'Alcance a Idade Mítica.', icon: '🔱', check: (s, l) => advancedTo(s, l, 3) },
  { id: 'titans', name: 'Titanomaquia', desc: 'Alcance a Idade dos Titãs.', icon: '🌋', check: (s, l) => advancedTo(s, l, 4) },
  { id: 'titan_summoned', name: 'Correntes Rompidas', desc: 'Liberte um Titã.', icon: '⛓️', check: (s, l) => [...s.units.values()].some((u) => u.owner === l && UNITS[u.type].tags.includes('titan')) },
  { id: 'hero_trio', name: 'Argonautas', desc: 'Tenha três heróis vivos ao mesmo tempo.', icon: '🦁', check: (s, l) => [...s.units.values()].filter((u) => u.owner === l && UNITS[u.type].tags.includes('hero')).length >= 3 },
  { id: 'menagerie', name: 'Bestiário', desc: 'Tenha cinco criaturas míticas diferentes vivas ao mesmo tempo.', icon: '🐉', check: (s, l) => new Set([...s.units.values()].filter((u) => u.owner === l && UNITS[u.type].tags.includes('myth')).map((u) => u.type)).size >= 5 },
  { id: 'kills_100', name: 'Muro de Escudos', desc: 'Abata 100 unidades inimigas em uma partida.', icon: '🛡️', check: (s, l) => p(s, l).stats.kills >= 100 },
  { id: 'kills_500', name: 'Flagelo do Tártaro', desc: 'Abata 500 unidades inimigas em uma partida.', icon: '💀', check: (s, l) => p(s, l).stats.kills >= 500 },
  { id: 'razed_25', name: 'Demolidor', desc: 'Destrua 25 edifícios inimigos em uma partida.', icon: '🪨', check: (s, l) => p(s, l).stats.razed >= 25 },
  { id: 'territory_2000', name: 'Império', desc: 'Controle 2000 tiles de território.', icon: '🗺️', check: (s, l) => p(s, l).territoryTiles >= 2000 },
  { id: 'all_techs_line', name: 'Biblioteca de Alexandria', desc: 'Pesquise Civismo V, Comércio V, Militar V e Ciência V.', icon: '📚', check: (s, l) => ['civic5', 'commerce5', 'military5', 'science5'].every((t) => p(s, l).techs.includes(t)) },
  { id: 'win_conquest', name: 'Conquistador', desc: 'Vença por conquista.', icon: '🏆', check: (s, l) => wonBy(s, l) && !s.players.some((x) => x.wonderVictoryAt >= 0) && !s.scenario },
  { id: 'win_wonder', name: 'Maravilha do Mundo', desc: 'Vença mantendo uma Maravilha.', icon: '🗽', check: (s, l) => wonBy(s, l) && p(s, l).wonderVictoryAt >= 0 },
  { id: 'win_no_loss', name: 'Intocável', desc: 'Vença uma partida rápida perdendo menos de 10 unidades.', icon: '✨', check: (s, l) => wonBy(s, l) && !s.scenario && p(s, l).stats.losses < 10 },
  { id: 'win_brutal', name: 'Domador de Titãs', desc: 'Vença uma partida rápida contra uma IA Muito difícil.', icon: '🔥', check: (s, l) => wonBy(s, l) && !s.scenario && s.players.some((x) => x.isAI && x.difficulty === 'brutal') },
  { id: 'all_gods', name: 'Ecumênico', desc: 'Jogue partidas com Zeus, Poseidon e Hades.', icon: '🌐', check: (_s, _l, c) => ['zeus', 'poseidon', 'hades'].every((g) => c.godsPlayed.includes(g)) },
  { id: 'horde_10', name: 'Guardião das Portas', desc: 'Sobreviva a 10 ondas no Modo Horda.', icon: '🚪', check: (s) => s.scenario?.id === 'horde' && s.scenario.fired.filter((f) => f.startsWith('wave')).length >= 10 && !s.gameOver },
  { id: 'horde_20', name: 'Senhor do Tártaro', desc: 'Vença o Modo Horda.', icon: '👑', check: (s) => s.scenario?.id === 'horde' && s.scenario.outcome === 'victory' },
  { id: 'm1_despertar', name: 'O Despertar de Argos', desc: 'Complete a missão 1 da campanha.', icon: '🏺', check: (_s, _l, c) => c.missionsDone.includes('m1_despertar') },
  { id: 'm2_cerco', name: 'Muralhas de Argos', desc: 'Complete a missão 2 da campanha.', icon: '🏰', check: (_s, _l, c) => c.missionsDone.includes('m2_cerco') },
  { id: 'm3_portal', name: 'O Portal Selado', desc: 'Complete a missão 3 da campanha.', icon: '🌀', check: (_s, _l, c) => c.missionsDone.includes('m3_portal') },
  { id: 'campaign_prologue', name: 'A Sombra dos Titãs', desc: 'Complete o prólogo da campanha.', icon: '📜', check: (_s, _l, c) => ['m1_despertar', 'm2_cerco', 'm3_portal'].every((m) => c.missionsDone.includes(m)) },
  { id: 'campaign_hard', name: 'Forjado no Fogo', desc: 'Complete o prólogo da campanha no Difícil.', icon: '🔥', check: (_s, _l, c) => ['m1_despertar', 'm2_cerco', 'm3_portal'].every((m) => c.missionsHard.includes(m)) },
  { id: 'horde_hard', name: 'Muralha de Bronze', desc: 'Vença o Modo Horda no Difícil ou acima.', icon: '🛡️', check: (s) => s.scenario?.id === 'horde' && s.scenario.outcome === 'victory' && s.config.campaignDifficulty === 'hard' },
  { id: 'garrison_defense', name: 'Portas Fechadas', desc: 'Tenha 15 unidades guarnecidas em um único edifício.', icon: '🏰', check: (s, l) => [...s.buildings.values()].some((b) => b.owner === l && b.garrison.length >= 15) },
  ...campaignAchievements(),
];

const KEY = 'aoe_achievements_v1';
export class Achievements {
  unlocked = new Set<string>();
  onUnlock: ((a: AchievementDef) => void) | null = null;
  private acc = 0;
  constructor() { try { for (const id of JSON.parse(localStorage.getItem(KEY) ?? '[]')) this.unlocked.add(id); } catch { /* ignore */ } }
  private ctx(): AchievementCtx {
    let godsPlayed: string[] = [], missionsDone: string[] = [], missionsHard: string[] = [];
    try { godsPlayed = JSON.parse(localStorage.getItem('aoe_gods_played') ?? '[]'); const prog = JSON.parse(localStorage.getItem('aoe_campaign') ?? '{"completed":[]}'); missionsDone = prog.completed ?? []; missionsHard = prog.hard ?? []; } catch { /* ignore */ }
    return { godsPlayed, hordeWaves: 0, missionsDone, missionsHard };
  }
  recordGod(god: string) { try { const g: string[] = JSON.parse(localStorage.getItem('aoe_gods_played') ?? '[]'); if (!g.includes(god)) { g.push(god); localStorage.setItem('aoe_gods_played', JSON.stringify(g)); } } catch { /* ignore */ } }
  /** Chamar a cada quadro; avalia uma vez por segundo. */
  update(state: GameState, local: number, dt: number) {
    this.acc += dt; if (this.acc < 1) return; this.acc = 0;
    if (local < 0 || !state.players[local]) return;
    const ctx = this.ctx();
    for (const a of ACHIEVEMENTS) {
      if (this.unlocked.has(a.id)) continue;
      let ok = false;
      try { ok = a.check(state, local, ctx); } catch { ok = false; }
      if (!ok) continue;
      this.unlocked.add(a.id);
      try { localStorage.setItem(KEY, JSON.stringify([...this.unlocked])); } catch { /* ignore */ }
      void desktop()?.achievement?.(a.id);
      this.onUnlock?.(a);
    }
  }
}
