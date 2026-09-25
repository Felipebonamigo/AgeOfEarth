// Conquistas: avaliadas no cliente a partir do estado; persistidas localmente e enviadas à Steam quando disponível.
import { AGES, UNITS } from '../core/data';
import type { GameState } from '../core/types';
import { desktop } from './files';

export interface AchievementDef { id: string; name: string; desc: string; icon: string; check: (s: GameState, local: number, ctx: AchievementCtx) => boolean }
export interface AchievementCtx { godsPlayed: string[]; hordeWaves: number; missionsDone: string[] }

const p = (s: GameState, l: number) => s.players[l];
const wonBy = (s: GameState, l: number) => s.gameOver && s.winner >= 0 && s.players[s.winner].team === p(s, l).team;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_temple', name: 'Primeira Oferenda', desc: 'Conclua um Templo.', icon: '⚡', check: (s, l) => [...s.buildings.values()].some((b) => b.owner === l && b.complete && b.type === 'temple') },
  { id: 'classical', name: 'Filósofo', desc: 'Alcance a Idade Clássica.', icon: '🏛️', check: (s, l) => p(s, l).age >= 1 },
  { id: 'heroic', name: 'Canção dos Heróis', desc: 'Alcance a Idade Heroica.', icon: '⚔️', check: (s, l) => p(s, l).age >= 2 },
  { id: 'mythic', name: 'Toque dos Deuses', desc: 'Alcance a Idade Mítica.', icon: '🔱', check: (s, l) => p(s, l).age >= 3 },
  { id: 'titans', name: 'Titanomaquia', desc: 'Alcance a Idade dos Titãs.', icon: '🌋', check: (s, l) => p(s, l).age >= 4 },
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
  { id: 'campaign_prologue', name: 'A Sombra dos Titãs', desc: 'Complete o prólogo da campanha.', icon: '📜', check: (_s, _l, c) => ['m1_despertar', 'm2_cerco', 'm3_portal'].every((m) => c.missionsDone.includes(m)) },
  { id: 'garrison_defense', name: 'Portas Fechadas', desc: 'Tenha 15 unidades guarnecidas em um único edifício.', icon: '🏰', check: (s, l) => [...s.buildings.values()].some((b) => b.owner === l && b.garrison.length >= 15) },
];

const KEY = 'aoe_achievements_v1';
export class Achievements {
  unlocked = new Set<string>();
  onUnlock: ((a: AchievementDef) => void) | null = null;
  private acc = 0;
  constructor() { try { for (const id of JSON.parse(localStorage.getItem(KEY) ?? '[]')) this.unlocked.add(id); } catch { /* ignore */ } }
  private ctx(): AchievementCtx {
    let godsPlayed: string[] = [], missionsDone: string[] = [];
    try { godsPlayed = JSON.parse(localStorage.getItem('aoe_gods_played') ?? '[]'); missionsDone = JSON.parse(localStorage.getItem('aoe_campaign') ?? '{"completed":[]}').completed ?? []; } catch { /* ignore */ }
    return { godsPlayed, hordeWaves: 0, missionsDone };
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
