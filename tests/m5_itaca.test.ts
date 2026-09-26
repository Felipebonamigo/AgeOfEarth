// m5 "O Hóspede de Ítaca" (docs/STORY.md §5.2): o mapa fixo "Planície da Argólida" é reprodutível pelo script
// scripts/maps/m5_itaca.ts e tem a identidade da ficha (Argos na colina, o Ínaco com dois vaus, o Heraion, a praia de Náuplia,
// Corinto atrás do istmo, as torres de sinal); a caça, a espera de Odisseu na praia, os caçadores da estrada, o vau, o Heraion,
// os náufragos, a oferta do Emissário e o resgate, o segredo das fogueiras e as variações de dificuldade (G3) funcionam; a vitória
// exige o encontro na praia (nada de levar Odisseu sozinho a Argos) e a escolta ativa sem trégua é viável (variante "escolta").
// O roteiro longo (vitória dentro da janela) fica em scripts/missions.ts; a passiva curta, em tests/missions.test.ts.
import { describe, it, expect } from 'vitest';
import { TICK_RATE, TERRAIN } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { buildingLimitOk, placeBuilding } from '../src/core/sim/entities';
import { destroyBuilding, killUnit } from '../src/core/sim/combat';
import { componentAt, invalidateComponents } from '../src/core/map/components';
import { mapHash, validateMap, type FixedMapData } from '../src/core/map/fixed';
import { placeNear, setRaidObserver, tagIds, townCenter, type RaidRecord } from '../src/core/scenario/helpers';
import { MISSION_SCRIPTS, runMissionScript, scriptVerdict, variantIssues } from '../src/core/scenario/testing';
import { campaignMission, missionConfig, withCampaignDifficulty } from '../src/core/scenario/campaign';
import { gameConfigFor } from '../src/core/scenario/compile';
import type { CampaignDifficulty, ScenarioFile } from '../src/core/scenario/schema';
import type { Command, GameState, Unit } from '../src/core/types';
import m5 from '../src/core/scenario/missions/m5_itaca.scenario.json';
import { buildArgolisMap, POINTS, riverX } from '../scripts/maps/m5_itaca';

const file = m5 as unknown as ScenarioFile;
const data = (file.map as { data: FixedMapData }).data;
const start = (d: CampaignDifficulty) => createGame(missionConfig(campaignMission('m5_itaca')!, d));
const seconds = (s: GameState, n: number) => { for (let i = 0; i < n * TICK_RATE && !s.gameOver; i++) tick(s); };
const byTag = (s: GameState, tag: string) => { const id = s.scenario!.vars['#' + tag]; return id === undefined ? undefined : s.units.get(id) ?? s.buildings.get(id); };
const group = (s: GameState, tag: string) => tagIds(s, tag).map((id) => s.units.get(id)).filter((u): u is Unit => !!u && !u.dead);
const odysseus = (s: GameState) => byTag(s, 'odisseu') as Unit;
const dialogues = (s: GameState) => s.events.filter((e) => e.type === 'dialogue').map((e) => e.data ?? '');
const teleport = (u: Unit, x: number, y: number) => { u.x = u.px = u.tx = x; u.y = u.py = u.ty = y; u.path = null; u.order = null; u.state = 'idle'; };
const now = (s: GameState) => Math.floor(s.tick / TICK_RATE);
const hunters = (s: GameState) => [...group(s, 'cacadores_norte'), ...group(s, 'cacadores_sul')];
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
/** 3 hoplitas junto de Odisseu na praia: o encontro se cumpre (e ele pode deixar a praia). */
const meet = (s: GameState) => { const o = odysseus(s); [...s.units.values()].filter((u) => u.owner === 0 && !u.dead && u.type === 'hoplite').slice(0, 3).forEach((u, k) => teleport(u, o.x - 1 + k, o.y - 1)); seconds(s, 2); expect(s.scenario!.objectives.encontrar).toBe('done'); };
/** O cenário sem a caça, sem o vau e com a Liga parada (para correr o relógio do Emissário sem que Odisseu ou Argos caiam). */
function withoutHunt(d: CampaignDifficulty): GameState {
  const f = JSON.parse(JSON.stringify(file)) as ScenarioFile;
  f.id = 'm5_teste';
  f.triggers = f.triggers.filter((t) => !t.id.startsWith('caca') && !t.id.startsWith('estrada') && t.id !== 'vau');
  f.config.players = f.config.players.map((p, i) => (i === 1 ? { ...p, isAI: false, puppet: true } : p));
  return createGame(withCampaignDifficulty(gameConfigFor(f), d));
}

describe('m5: mapa fixo "Planície da Argólida"', () => {
  it('o mapa embutido no cenário é o que scripts/maps/m5_itaca.ts gera (reprodutível, forma canônica)', () => {
    const built = buildArgolisMap();
    expect(JSON.stringify(built)).toBe(JSON.stringify(data));
    expect(mapHash(built)).toBe(mapHash(data));
  }, 60_000);

  it('validateMap sem erros; 128×112, 3 inícios, sem kit e sem relíquias; a cidade de Argos, o Heraion e as torres de sinal da ficha', () => {
    expect(validateMap(data, { players: 3 }).filter((i) => i.level === 'error')).toEqual([]);
    expect([data.w, data.h, data.starts.length, data.relics, data.startKit]).toEqual([128, 112, 3, false, false]);
    expect(data.starts).toEqual([[22, 22], [108, 16], [119, 56]]);
    const ents = data.entities ?? [];
    const at = (tag: string) => ents.filter((e) => e.tag === tag).map((e) => [e.kind, e.type, e.owner, e.x, e.y]);
    expect(at('heraion')).toEqual([['building', 'temple', 0, ...POINTS.heraion]]);
    expect(at('sinal1')).toEqual([['building', 'tower', 2, ...POINTS.sinal1]]);
    expect(at('sinal2')).toEqual([['building', 'tower', 2, ...POINTS.sinal2]]);
    // Argos: CC centrado no início 0, Templo, Quartel, Estábulo, Academia e 4 Casas; 12 cidadãos, 6 hoplitas, 4 toxotas, 2 hipeus
    expect(ents.filter((e) => e.kind === 'building' && e.type === 'town_center').map((e) => [e.owner, e.x, e.y])).toEqual([[0, 21, 21]]);
    const mineB = (t: string) => ents.filter((e) => e.kind === 'building' && e.owner === 0 && e.type === t && !e.tag).length;
    expect(['temple', 'barracks', 'stable', 'academy', 'house'].map(mineB)).toEqual([1, 1, 1, 1, 4]);
    const mineU = (t: string) => ents.filter((e) => e.kind === 'unit' && e.owner === 0 && e.type === t).length;
    expect(['villager', 'hoplite', 'toxotes', 'hippeus'].map(mineU)).toEqual([12, 6, 4, 2]);
  });

  it('o Ínaco só se cruza pelos dois vaus: sem eles, Argos e a praia de Náuplia ficam em regiões diferentes', () => {
    const s = start('normal');
    const home = componentAt(s.map, 25, 22), beach = componentAt(s.map, 108, 97);
    expect(home).toBeGreaterThanOrEqual(0);
    expect(beach).toBe(home);
    // todos os pontos da ficha na mesma região (Heraion pelo lado da Via Sagrada, Corinto, o acampamento, os vaus)
    for (const [x, y] of [[54, 61], [104, 20], [119, 56], [64, 36], [64, 78], [110, 98]]) expect(componentAt(s.map, x, y), `${x},${y}`).toBe(home);
    // fecha os vaus (a areia no leito do rio): a margem oeste e a leste se separam
    for (const fy of [POINTS.fordN[1], POINTS.fordS[1]]) for (let y = fy - 2; y <= fy + 2; y++) {
      const rx = riverX(y);
      for (let x = rx - 4; x <= rx + 4; x++) if (s.map.terrain[y * s.map.w + x] === TERRAIN.SAND) s.map.blocked[y * s.map.w + x] = 1;
    }
    invalidateComponents(s.map);
    expect(componentAt(s.map, 108, 97)).not.toBe(componentAt(s.map, 25, 22));
    expect(componentAt(s.map, 104, 20)).toBe(componentAt(s.map, 108, 97));   // Corinto fica do lado da praia
  });

  it('partida: Corinto com o kit (CC no início 1), Argos com a cidade do mapa; Odisseu e os 6 náufragos na praia, parados', () => {
    const s = start('normal');
    expect(townCenter(s, 1)).not.toBeNull();
    expect([...s.buildings.values()].filter((b) => b.owner === 0 && b.type === 'town_center')).toHaveLength(1);
    const o = odysseus(s);
    expect(o.type).toBe('odysseus');
    expect(Math.abs(o.x - POINTS.beach[0]) + Math.abs(o.y - POINTS.beach[1])).toBeLessThan(4);
    const cast = group(s, 'naufragos');
    expect(cast).toHaveLength(6);
    seconds(s, 20);
    for (const u of cast) expect(Math.abs(u.x - POINTS.castaways[0]) + Math.abs(u.y - POINTS.castaways[1]), 'náufrago não sai coletando').toBeLessThan(6);
  });
});

describe('m5: caça, vau, Heraion e náufragos', () => {
  for (const [d, first] of [['normal', 150], ['hard', 165]] as const) {
    it(`[${d}] a caça começa depois da trégua, aos ${first} s, mirando Odisseu, com todos os cavaleiros`, () => {
      const s = start(d);
      const got: { t: number; r: RaidRecord }[] = [];
      setRaidObserver((r) => got.push({ t: now(s) + 1, r }));
      try {
        seconds(s, first - 2);
        expect(got, d).toEqual([]);
        seconds(s, 4);
        expect(got.map((g) => [g.t, g.r.owner]), d).toEqual([[first, 2]]);
        expect(got[0].r.spawned, d).toBe(got[0].r.requested);
      } finally { setRaidObserver(null); }
    });
  }

  for (const d of ['easy', 'normal', 'hard'] as const) {
    it(`[${d}] parado na praia, Odisseu cai para a caça: derrota entre 2 e 5 min`, () => {
      const s = start(d);
      seconds(s, 5 * 60);
      expect(s.scenario!.outcome).toBe('defeat');
      expect(now(s)).toBeGreaterThanOrEqual(120);
      expect(odysseus(s)?.dead ?? true).toBe(true);
    });
  }

  it('antes do encontro, Odisseu não sai da praia: longe dela, volta sozinho e diz por quê; depois dos 3 soldados, anda livre', () => {
    const s = start('normal'); seconds(s, 2);
    const o = odysseus(s);
    teleport(o, 90.5, 90.5);
    seconds(s, 2);
    expect(o.state).toBe('move');
    expect(s.scenario!.fired).toContain('espera_fala');
    expect(dialogues(s).some((d) => d.includes('Odisseu'))).toBe(true);
    seconds(s, 12);
    expect(Math.abs(o.x - POINTS.beach[0]) + Math.abs(o.y - POINTS.beach[1])).toBeLessThan(8);
    // 3 hoplitas junto dele: encontro feito, e ele pode deixar a praia
    meet(s);
    teleport(o, 90.5, 90.5);
    seconds(s, 2);
    expect(o.state === 'move' && Math.abs(o.tx - POINTS.beach[0]) < 1, 'não é puxado de volta').toBe(false);
  });

  it('estrada: fora da praia, cada fogueira de pé manda UMA leva de cavaleiros (8 no Normal, 12 no Difícil) da própria torre, em ataque-movimento atrás dele', () => {
    for (const [d, n] of [['normal', 8], ['hard', 12]] as const) {
      const s = start(d); seconds(s, 2);
      const o = odysseus(s);
      teleport(o, 84.5, 86.5);
      seconds(s, 2);
      expect(hunters(s), 'antes do encontro, nada').toEqual([]);
      teleport(o, 110.5, 98.5); meet(s);
      teleport(o, 84.5, 86.5);
      seconds(s, 2);
      expect(s.scenario!.fired, d).toContain('estrada_aviso');
      const north = group(s, 'cacadores_norte');
      expect(north.length, d).toBe(n);
      const t1 = byTag(s, 'sinal1')!, t2 = byTag(s, 'sinal2')!;
      for (const u of north) {
        expect(u.owner, d).toBe(2);
        expect(u.state, d).toBe('attackMove');
        expect(dist(u, t1), `${d}: nasce junto da torre do norte, não na frente de Odisseu`).toBeLessThan(8);
      }
      expect(group(s, 'cacadores_sul'), d).toEqual([]);
      seconds(s, 21);   // 20 s depois, a leva da torre do sul
      const south = group(s, 'cacadores_sul');
      expect(south.length, d).toBe(n);
      for (const u of south) expect(dist(u, t2), d).toBeLessThan(14);
      teleport(o, 84.5, 86.5);
      seconds(s, 45);   // e não há terceira leva
      expect([s.scenario!.vars.estrada_norte, s.scenario!.vars.estrada_sul], d).toEqual([1, 1]);
    }
  });

  it('estrada: com Odisseu a 17 tiles do Centro Cívico, os caçadores nascem na torre, longe de Argos (nunca dentro da cidade)', () => {
    const s = start('normal'); seconds(s, 2); meet(s);
    const tc = townCenter(s, 0)!;
    teleport(odysseus(s), 34.5, 35.5);
    expect(dist(odysseus(s), tc)).toBeGreaterThan(16);
    seconds(s, 2);
    const h = hunters(s);
    expect(h.length).toBe(8);
    for (const u of h) expect(dist(u, tc)).toBeGreaterThan(40);
  });

  it('estrada: nada de caçadores na trégua comprada nem com as duas fogueiras apagadas', () => {
    const s = start('normal'); seconds(s, 2); meet(s);
    const t1 = byTag(s, 'sinal1'); if (t1?.kind === 'building') destroyBuilding(s, t1, 0);
    const tc = townCenter(s, 0)!;
    expect(placeNear(s, 0, 'market', tc.x + 6, tc.y + 8, true)).not.toBeNull();
    s.players[0].resources.gold = 1600;
    seconds(s, 2);
    expect(s.scenario!.fired).toContain('resgate_pago');
    teleport(odysseus(s), 84.5, 86.5);
    seconds(s, 30);
    expect(hunters(s)).toEqual([]);
    const f = start('normal'); seconds(f, 2); meet(f);
    for (const t of ['sinal1', 'sinal2']) { const b = byTag(f, t); if (b?.kind === 'building') destroyBuilding(f, b, 0); }
    seconds(f, 2);
    teleport(odysseus(f), 84.5, 86.5);
    seconds(f, 30);
    expect(hunters(f)).toEqual([]);
    expect(f.scenario!.fired).not.toContain('estrada_aviso');
  });

  it('vau: Odisseu no vau sul chama a emboscada (5 cavaleiros no Normal) a leste, com a fala do Batedor (só depois do encontro)', () => {
    const b = start('normal'); seconds(b, 2);
    teleport(odysseus(b), 66.5, 78.5);
    seconds(b, 2);
    expect(b.scenario!.fired, 'antes do encontro, nada de emboscada').not.toContain('vau');
    const s = start('normal'); seconds(s, 2); meet(s);
    const got: RaidRecord[] = [];
    setRaidObserver((r) => got.push(r));
    try {
      teleport(odysseus(s), 66.5, 78.5);
      seconds(s, 2);
    } finally { setRaidObserver(null); }
    expect(s.scenario!.fired).toContain('vau');
    expect(got).toEqual([{ owner: 2, requested: 5, spawned: 5 }]);
    expect(dialogues(s).some((d) => d.includes('Batedor'))).toBe(true);
    const riders = [...s.units.values()].filter((u) => u.owner === 2 && !u.dead && (u.type === 'hetairoi' || u.type === 'hippeus') && u.state === 'attackMove');
    expect(riders.length).toBeGreaterThanOrEqual(5);
    for (const u of riders) expect(u.x, 'a emboscada vem da margem leste').toBeGreaterThan(66);
  });

  it('Heraion: Odisseu passando por ele (depois do encontro) cumpre o objetivo (+80 de favor e a fala de Hera); o templo destruído o faz falhar', () => {
    const b = start('normal'); seconds(b, 2);
    teleport(odysseus(b), 55.5, 62.5);
    seconds(b, 2);
    expect(b.scenario!.objectives.heraion, 'sem o encontro, não conta').toBe('pending');
    const s = start('normal'); seconds(s, 2); meet(s);
    const favor = s.players[0].resources.favor;
    teleport(odysseus(s), 55.5, 62.5);
    seconds(s, 2);
    expect(s.scenario!.objectives.heraion).toBe('done');
    expect(s.players[0].resources.favor - favor).toBeGreaterThanOrEqual(80);
    expect(dialogues(s).some((d) => d.includes('Hera'))).toBe(true);
    const f = start('normal'); seconds(f, 2);
    const h = byTag(f, 'heraion'); if (h?.kind === 'building') destroyBuilding(f, h, 1);
    seconds(f, 2);
    expect(f.scenario!.objectives.heraion).toBe('failed');
    expect(f.scenario!.fired).toContain('heraion_cai');
  });

  it('náufragos: 4 no Centro Cívico cumprem (Fácil/Normal); no Difícil são os 6, e perder um falha o objetivo', () => {
    const s = start('normal'); seconds(s, 2); meet(s);
    expect([s.scenario!.hidden.naufragos, s.scenario!.hidden.naufragos_todos]).toEqual([false, true]);
    const tc = townCenter(s, 0)!;
    group(s, 'naufragos').slice(0, 4).forEach((u, k) => teleport(u, tc.x - 2 + k, tc.y + 3));
    seconds(s, 2);
    expect(s.scenario!.objectives.naufragos).toBe('done');
    const h = start('hard'); seconds(h, 2);
    expect([h.scenario!.hidden.naufragos, h.scenario!.hidden.naufragos_todos]).toEqual([true, false]);
    killUnit(h, group(h, 'naufragos')[0], 2);
    seconds(h, 2);
    expect(h.scenario!.objectives.naufragos_todos).toBe('failed');
    expect(h.scenario!.objectives.naufragos).toBe('pending');   // o objetivo do Fácil/Normal nem aparece no Difícil
  });

  it('náufragos mandados sozinhos a Argos no segundo 0 voltam à praia (esperam a escolta) e o objetivo não se cumpre sem o encontro', () => {
    for (const d of ['normal', 'hard'] as const) {
      const s = start(d);
      const tc = townCenter(s, 0)!;
      tick(s, [{ type: 'move', player: 0, ids: group(s, 'naufragos').map((u) => u.id), x: tc.x + 3, y: tc.y + 4 }]);
      seconds(s, 60);
      expect([s.scenario!.objectives.naufragos, s.scenario!.objectives.naufragos_todos], d).toEqual(['pending', 'pending']);
      for (const u of group(s, 'naufragos')) expect(dist(u, { x: POINTS.castaways[0], y: POINTS.castaways[1] }), d).toBeLessThan(14);
      // mesmo teleportados ao Centro Cívico, não contam antes do encontro
      group(s, 'naufragos').forEach((u, k) => teleport(u, tc.x - 2 + k, tc.y + 3));
      seconds(s, 1);
      expect([s.scenario!.objectives.naufragos, s.scenario!.objectives.naufragos_todos], d).toEqual(['pending', 'pending']);
    }
  });

  it('escolta: Odisseu no Centro Cívico depois do encontro vence (com a fala de Poseidon); Odisseu morto perde', () => {
    const s = start('normal'); seconds(s, 2); meet(s);
    const tc = townCenter(s, 0)!;
    teleport(odysseus(s), tc.x + 3, tc.y + 3);
    seconds(s, 2);
    expect(s.scenario!.outcome).toBe('victory');
    expect(dialogues(s).some((d) => d.includes('Poseidon'))).toBe(true);
    const d = start('normal'); seconds(d, 2);
    killUnit(d, odysseus(d), 2);
    seconds(d, 2);
    expect(d.scenario!.outcome).toBe('defeat');
  });

  it('sem o encontro na praia não há vitória: nem Odisseu levado a Argos, nem 3 soldados junto dele lá', () => {
    const s = start('normal'); seconds(s, 2);
    const tc = townCenter(s, 0)!;
    const o = odysseus(s);
    teleport(o, tc.x + 3, tc.y + 3);
    [...s.units.values()].filter((u) => u.owner === 0 && !u.dead && u.type === 'hoplite').slice(0, 3).forEach((u, k) => teleport(u, o.x - 1 + k, o.y - 1));
    seconds(s, 1);
    expect([s.scenario!.objectives.encontrar, s.scenario!.objectives.escolta, s.scenario!.outcome]).toEqual(['pending', 'pending', 'playing']);
  });

  it('regressão: clicar sem parar para Odisseu andar rumo a Argos (a cada 5 ticks) não vence, nem cumpre o Heraion, nem gasta a emboscada', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const s = start(d);
      const route: [number, number][] = [[72, 81], [57, 74], [56, 62], [40, 44], [25, 26]];
      let at = 0;
      for (let i = 0; i < 150 * TICK_RATE && !s.gameOver; i++) {
        const o = odysseus(s); const cmds: Command[] = [];
        if (o && i % 5 === 0) {
          // um ponto ~12 tiles à frente, pela Via Sagrada (praia → vau sul → Heraion → Argos)
          while (at < route.length - 1 && (route[at][0] - o.x) * (route[at][0] - o.x) + (route[at][1] - o.y) * (route[at][1] - o.y) <= 16) at++;
          const next = route[at];
          const dx = next[0] - o.x, dy = next[1] - o.y, len = Math.max(1, Math.sqrt(dx * dx + dy * dy)), k = Math.min(1, 12 / len);
          cmds.push({ type: 'move', player: 0, ids: [o.id], x: o.x + dx * k, y: o.y + dy * k });
        }
        tick(s, cmds);
      }
      expect(s.scenario!.outcome, d).not.toBe('victory');
      expect([s.scenario!.objectives.encontrar, s.scenario!.objectives.escolta, s.scenario!.objectives.heraion], d).toEqual(['pending', 'pending', 'pending']);
      expect(s.scenario!.fired, d).not.toContain('vau');
    }
  });

  it('variante "escolta" (Normal): sem Mercado nem trégua, o comboio de 20 sobe a Via Sagrada sob os caçadores e o vau e vence na janela', () => {
    const v = MISSION_SCRIPTS.m5_itaca.variants!.find((x) => x.label === 'escolta')!;
    const r = runMissionScript('m5_itaca', 'normal', false, 'escolta');
    expect(scriptVerdict(r, v).inWindow, `${r.outcome}@${r.atSeconds}s`).toBe(true);
    expect(variantIssues(r, v)).toEqual([]);
    expect(r.fired).toEqual(expect.arrayContaining(['estrada_aviso', 'vau']));
    expect(r.fired).not.toContain('resgate_pago');
  }, 60_000);
});

describe('m5: oferta do Emissário, resgate, fogueiras e dificuldades', () => {
  it('o Emissário volta com a oferta no relógio (15/16/17 min) — não antes — e revela o resgate', () => {
    // só o relógio importa para a oferta: o teste adianta o tique (a linha do tempo inteira roda em scripts/missions.ts)
    for (const [d, at] of [['easy', 900], ['normal', 960], ['hard', 1020]] as const) {
      const s = withoutHunt(d); seconds(s, 2);
      s.tick = (at - 6) * TICK_RATE;
      seconds(s, 4);
      expect(s.scenario!.fired, d).not.toContain('oferta');
      expect(s.scenario!.hidden.resgate, d).toBe(true);
      seconds(s, 3);
      expect(s.scenario!.fired, d).toContain('oferta');
      expect(s.scenario!.hidden.resgate, d).toBe(false);
      expect(dialogues(s).some((x) => x.includes('Emissário do Istmo')), d).toBe(true);
    }
  });

  it('a fogueira do norte (sinal1) caída antecipa a oferta; com Mercado e 1500 de ouro, o resgate compra 2 min de trégua', () => {
    const s = start('normal'); seconds(s, 2);
    // antes da oferta, Mercado e ouro não compram nada
    const tc = townCenter(s, 0)!;
    expect(placeNear(s, 0, 'market', tc.x + 6, tc.y + 8, true)).not.toBeNull();
    s.players[0].resources.gold = 2000;
    seconds(s, 2);
    expect(s.scenario!.fired).not.toContain('resgate_pago');
    const t1 = byTag(s, 'sinal1'); if (t1?.kind === 'building') destroyBuilding(s, t1, 0);
    seconds(s, 2);
    expect(s.scenario!.fired).toEqual(expect.arrayContaining(['oferta', 'resgate_pago']));
    expect(s.scenario!.objectives.resgate).toBe('done');
    expect(s.players[0].resources.gold).toBeLessThan(600);
    expect(s.ceasefireUntil - s.tick).toBeGreaterThan(110 * TICK_RATE);
    expect(dialogues(s).some((d) => d.includes('Emissário do Istmo'))).toBe(true);
    // a trégua comprada avisa quando faltam 30 s e quando acaba (o painel só tem o relógio do Emissário)
    const paid = s.ceasefireUntil;
    seconds(s, 88);
    expect(s.scenario!.fired).not.toContain('tregua_30');
    seconds(s, 3);
    expect(s.scenario!.fired).toContain('tregua_30');
    expect(Math.abs((paid - s.tick) / TICK_RATE - 30)).toBeLessThanOrEqual(3);
    seconds(s, 31);
    expect(s.scenario!.fired).toContain('tregua_fim');
    expect(s.tick).toBeGreaterThanOrEqual(paid);
  });

  it('sem Mercado, o ouro não compra a trégua; e sem 1500 de ouro também não', () => {
    const s = start('normal'); seconds(s, 2);
    const t1 = byTag(s, 'sinal1'); if (t1?.kind === 'building') destroyBuilding(s, t1, 0);
    s.players[0].resources.gold = 5000;
    seconds(s, 3);
    expect(s.scenario!.fired).toContain('oferta');
    expect(s.scenario!.fired).not.toContain('resgate_pago');
    s.players[0].resources.gold = 1000;
    const tc = townCenter(s, 0)!;
    expect(placeNear(s, 0, 'market', tc.x + 6, tc.y + 8, true)).not.toBeNull();
    seconds(s, 2);
    expect(s.scenario!.fired).not.toContain('resgate_pago');
    s.players[0].resources.gold = 1500;
    seconds(s, 2);
    expect(s.scenario!.fired).toContain('resgate_pago');
  });

  it('segredo: as duas torres de sinal caídas cumprem (e revelam) sinais, param a caça a Odisseu e trazem a caça cega ao Centro Cívico', () => {
    const s = start('normal'); seconds(s, 2);
    for (const t of ['sinal1', 'sinal2']) { const b = byTag(s, t); if (b?.kind === 'building') destroyBuilding(s, b, 0); }
    seconds(s, 2);
    expect(s.scenario!.objectives.sinais).toBe('done');
    expect(s.scenario!.hidden.sinais).toBe(false);
    const got: { t: number; r: RaidRecord }[] = [];
    setRaidObserver((r) => got.push({ t: now(s) + 1, r }));
    try { seconds(s, 240); } finally { setRaidObserver(null); }
    expect(s.scenario!.outcome).toBe('playing');   // sem caça, Odisseu segue vivo na praia
    expect(got.map((g) => g.t)).toEqual([120, 240]);
    expect(got.every((g) => g.r.owner === 2 && g.r.spawned === 2)).toBe(true);
  });

  it('dificuldades (G3): no Fácil a torre do sul cai no 1º segundo; a guarda das torres escala (6/8/12)', () => {
    const e = start('easy'); seconds(e, 2);
    expect(byTag(e, 'sinal2')).toBeUndefined();
    expect(byTag(e, 'sinal1')).toBeDefined();
    expect(e.scenario!.fired).toContain('facil');
    expect(e.scenario!.objectives.sinais).toBe('pending');
    const n = start('normal'); seconds(n, 2);
    expect(byTag(n, 'sinal2')).toBeDefined();
    const guards = (d: CampaignDifficulty) => { const s = start(d); return [group(s, 'guarda_sinal1').length, group(s, 'guarda_sinal2').length]; };
    expect(guards('easy')).toEqual([6, 6]);
    expect(guards('normal')).toEqual([8, 8]);
    expect(guards('hard')).toEqual([12, 12]);
  });

  it('G6: o Portal dos Titãs é proibido só para a Liga (players[1].forbid): nada de Oceano antes da m8', () => {
    const s = start('hard'); seconds(s, 1);
    s.players[1].age = 4; s.players[0].age = 4;
    expect(buildingLimitOk(s, s.players[1], 'titan_gate')).toEqual({ ok: false, reason: 'Proibido nesta missão' });
    expect(buildingLimitOk(s, s.players[0], 'titan_gate').ok).toBe(true);   // Argos não tinha o paliativo: continua igual
    placeBuilding(s, 1, 'titan_gate', 100, 18, false);   // o roteiro ainda pode pôr um (a trava é dos comandos e da IA)
    seconds(s, 2);
    expect([...s.buildings.values()].filter((b) => b.type === 'titan_gate' && !b.dead).length).toBe(1);
  });
});
