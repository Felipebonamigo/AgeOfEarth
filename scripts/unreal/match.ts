// Configuração da partida vinda do menu "Criar partida" do Unreal (U4, unreal/U4-MENU-PARTIDA.md): valida o que o cliente
// mandou e monta o GameConfig da simulação. Funções puras (testadas em tests/unreal-match.test.ts).
//
// { jogadores: [{ tipo:'humano'|'bot'|'fechada', nome?, deus, equipe (1–12), dificuldade?, personalidade? }],
//   mapa: { tipo, tamanho, semente }, regras?: { eraInicial?, eraFinal?, recursos?, vitoria?, mapaRevelado?, modo? } }
// Notas: a COR do jogador é a do seu lugar na lista (PLAYER_COLORS[i], 12 cores): para o jogador escolher a cor, o cliente reordena
// os lugares. Lugar "fechada" não entra na partida. Só um humano por partida (o cliente); o resto é bot.
import { DIFFICULTIES, GAME_MODES, MAP_SIZES, MAP_TYPES, MAX_MATCH_PLAYERS, RESOURCES, type MapSize, type MapType } from '../../src/core/constants';
import { MAJOR_GODS } from '../../src/core/data';
import type { GameConfig } from '../../src/core/types';

export interface MatchSetup {
  jogadores: { tipo: 'humano' | 'bot' | 'fechada'; nome?: string; deus: string; equipe: number; dificuldade?: string; personalidade?: number }[];
  mapa: { tipo: string; tamanho: string; semente: number };
  regras?: { eraInicial?: number; eraFinal?: number; recursos?: Record<string, number>; vitoria?: 'conquista' | 'maravilhas' | 'posse'; mapaRevelado?: boolean; modo?: string };
}
export interface MatchResult { config: GameConfig | null; /** índice (na partida) do jogador que o cliente controla */ human: number; errors: string[] }

/** Menor mapa que comporta N jogadores com os inícios a >= ~40 tiles uns dos outros (círculo a 0,36 do lado). */
export const MIN_SIZE_FOR_PLAYERS: { max: number; size: MapSize }[] = [{ max: 4, size: 'small' }, { max: 6, size: 'medium' }, { max: 8, size: 'large' }, { max: 10, size: 'huge' }, { max: 12, size: 'giant' }];
const SIZE_ORDER: MapSize[] = ['small', 'medium', 'large', 'huge', 'giant'];
const DIFF_ALIAS: Record<string, keyof typeof DIFFICULTIES> = { facil: 'easy', fácil: 'easy', easy: 'easy', normal: 'normal', dificil: 'hard', difícil: 'hard', hard: 'hard', muito_dificil: 'brutal', 'muito difícil': 'brutal', brutal: 'brutal', expert: 'brutal' };
const WIN: Record<string, 'off' | 'points' | 'hold'> = { conquista: 'off', maravilhas: 'points', posse: 'hold' };

export function configFromSetup(raw: unknown): MatchResult {
  const errors: string[] = [];
  const fail = (m: string) => { errors.push(m); };
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const slots = Array.isArray(r.jogadores) ? r.jogadores as Record<string, unknown>[] : [];
  if (!slots.length) fail('jogadores: lista obrigatória');
  const open = slots.filter((s) => s?.tipo !== 'fechada');
  if (open.length < 2) fail('jogadores: precisa de pelo menos 2 lugares abertos');
  if (open.length > MAX_MATCH_PLAYERS) fail(`jogadores: no máximo ${MAX_MATCH_PLAYERS}`);
  const humans = open.filter((s) => s?.tipo === 'humano');
  if (humans.length !== 1) fail(`jogadores: exatamente 1 humano (veio ${humans.length})`);
  const m = (typeof r.mapa === 'object' && r.mapa !== null ? r.mapa : {}) as Record<string, unknown>;
  const mapType = String(m.tipo ?? 'continental') as MapType, mapSize = String(m.tamanho ?? 'medium') as MapSize;
  if (!MAP_TYPES.includes(mapType)) fail(`mapa.tipo inválido: ${mapType}`);
  if (!(mapSize in MAP_SIZES)) fail(`mapa.tamanho inválido: ${mapSize}`);
  const seed = Number.isInteger(m.semente) ? (m.semente as number) : NaN;
  if (!Number.isFinite(seed) || seed < 0 || seed > 2 ** 31 - 1) fail('mapa.semente: inteiro de 0 a 2147483647');
  const need = MIN_SIZE_FOR_PLAYERS.find((x) => open.length <= x.max)?.size ?? 'giant';
  if (mapSize in MAP_SIZES && SIZE_ORDER.indexOf(mapSize) < SIZE_ORDER.indexOf(need)) fail(`mapa.tamanho: ${open.length} jogadores pedem pelo menos "${need}"`);
  const players: GameConfig['players'] = [];
  let human = -1;
  open.forEach((s, i) => {
    const deus = String(s?.deus ?? '');
    if (!(deus in MAJOR_GODS)) fail(`jogadores[${i}].deus inválido: ${deus}`);
    const eq = Number(s?.equipe);
    if (!Number.isInteger(eq) || eq < 1 || eq > MAX_MATCH_PLAYERS) fail(`jogadores[${i}].equipe: 1 a ${MAX_MATCH_PLAYERS}`);
    const isHuman = s?.tipo === 'humano';
    if (isHuman) human = i;
    const dif = DIFF_ALIAS[String(s?.dificuldade ?? 'normal').toLowerCase()];
    if (!isHuman && !dif) fail(`jogadores[${i}].dificuldade inválida: ${String(s?.dificuldade)}`);
    const nome = typeof s?.nome === 'string' && s.nome.trim() ? s.nome.trim().slice(0, 24) : (isHuman ? 'Jogador' : `IA ${i + 1}`);
    const pers = Number.isInteger(s?.personalidade) && (s.personalidade as number) >= 0 ? (s.personalidade as number) : undefined;
    players.push({ name: nome, god: deus, isAI: !isHuman, difficulty: (dif ?? 'normal') as GameConfig['players'][number]['difficulty'], team: eq - 1, ...(pers !== undefined ? { personality: pers } : {}) });
  });
  const rg = (typeof r.regras === 'object' && r.regras !== null ? r.regras : {}) as NonNullable<MatchSetup['regras']>;
  const cfg: Partial<GameConfig> = {};
  if (rg.eraInicial !== undefined) { if (Number.isInteger(rg.eraInicial) && rg.eraInicial >= 0 && rg.eraInicial <= 7) cfg.startingAge = rg.eraInicial || undefined; else fail('regras.eraInicial: 0 a 7'); }
  if (rg.eraFinal !== undefined) { if (Number.isInteger(rg.eraFinal) && rg.eraFinal >= 0 && rg.eraFinal <= 7) cfg.maxAge = rg.eraFinal; else fail('regras.eraFinal: 0 a 7'); }
  if (cfg.startingAge !== undefined && cfg.maxAge !== undefined && cfg.maxAge < cfg.startingAge) fail('regras: Era final antes da inicial');
  if (rg.recursos) {
    const res: Record<string, number> = {};
    for (const [k, v] of Object.entries(rg.recursos)) { if ((RESOURCES as readonly string[]).includes(k) && Number.isFinite(v) && v >= 0 && v <= 99999) res[k] = Math.round(v); else fail(`regras.recursos.${k} inválido`); }
    cfg.startingResources = res;
  }
  if (rg.vitoria !== undefined) { if (rg.vitoria in WIN) cfg.wonderVictory = WIN[rg.vitoria]; else fail(`regras.vitoria inválida: ${rg.vitoria} (conquista, maravilhas ou posse)`); }
  if (rg.mapaRevelado !== undefined) cfg.revealMap = !!rg.mapaRevelado;
  if (rg.modo !== undefined) { if ((GAME_MODES as readonly string[]).includes(rg.modo)) cfg.mode = rg.modo as GameConfig['mode']; else fail(`regras.modo inválido: ${rg.modo}`); }
  if (errors.length) return { config: null, human: -1, errors };
  return { config: { seed, mapSize, mapType, players, ...cfg }, human, errors: [] };
}
