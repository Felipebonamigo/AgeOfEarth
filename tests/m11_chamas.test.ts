// m11 "Argos em Chamas" (docs/STORY.md §5.8): o mapa fixo "Argólida em Chamas" é reprodutível pelo script
// scripts/maps/m11_chamas.ts e tem a identidade da ficha (Argos inteira sob a Descida de Cronos, o vale do Culto a nordeste,
// a Via de Náuplia por Tirinto em ruínas, o Ínaco com dois vaus e o cais de Náuplia a sudoeste); o setup da ficha (o arconte e
// o sacerdote com nome, G8; as naus com piso de vida, G9), a meta e as naus por dificuldade (G3), o embarque limpo (G6 remove:
// sem morte), o segredo da chama (G1), as ondas com um poder cada, a vanguarda de Lícaon, o 2º Raio (G11), Cronos imbatível
// (G9) com Prometeu, a caça ao arconte, vitória/derrota e o HUD (G4). A passiva curta roda em tests/missions.test.ts; o roteiro
// (vitória dentro da janela, com a Maldição e a Tempestade usadas nas ondas delas) só em scripts/missions.ts.
import { describe, it, expect } from 'vitest';
import { TICK_RATE, TERRAIN } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { applyCommand } from '../src/core/sim/commands';
import { killUnit } from '../src/core/sim/combat';
import { spawnUnit } from '../src/core/sim/entities';
import { isForbidden, maxAgeOf } from '../src/core/sim/restrictions';
import { componentAt, invalidateComponents } from '../src/core/map/components';
import { isPassable, spiralSearch } from '../src/core/map/grid';
import { mapHash, validateMap, type FixedMapData } from '../src/core/map/fixed';
import { scriptedDamage } from '../src/core/scenario/helpers';
import { MISSION_SCRIPTS, m11Levas, missionRunConfig } from '../src/core/scenario/testing';
import { campaignMission, CAMPAIGN, withCampaignDifficulty } from '../src/core/scenario/campaign';
import { gameConfigFor } from '../src/core/scenario/compile';
import { lintScenario, type CampaignDifficulty, type ScenarioFile } from '../src/core/scenario/schema';
import { entityDisplayName } from '../src/core/scenario/text';
import { scenarioHudHtml } from '../src/ui/scenario-hud';
import { setLocale } from '../src/i18n';
import type { Building, GameState, Unit } from '../src/core/types';
import m11 from '../src/core/scenario/missions/m11_chamas.scenario.json';
import { buildFlamesMap, POINTS, QUAY_COAST, PASS, inFord } from '../scripts/maps/m11_chamas';

const file = m11 as unknown as ScenarioFile;
const data = (file.map as { data: FixedMapData }).data;
const start = (d: CampaignDifficulty) => createGame(missionRunConfig('m11_chamas', d).config);
const run = (s: GameState, seconds: number) => { for (let i = 0; i < seconds * TICK_RATE && !s.gameOver; i++) tick(s); };
/** Adianta o relógio (só o instante importa para os gatilhos de tempo; a linha do tempo inteira roda em scripts/missions.ts). */
const jump = (s: GameState, sec: number) => { s.tick = sec * TICK_RATE; s.time = sec; };
const now = (s: GameState) => Math.floor(s.tick / TICK_RATE);
const lines = (s: GameState) => s.events.filter((e) => e.type === 'dialogue').map((e) => e.text ?? '');
const alive = (s: GameState, owner: number, type?: string) => [...s.units.values()].filter((u) => u.owner === owner && !u.dead && (!type || u.type === type));
const byTag = (s: GameState, tag: string): Unit | Building | undefined => { const id = s.scenario!.vars['#' + tag]; return id === undefined ? undefined : (s.units.get(id) ?? s.buildings.get(id)); };
const frac = (e: { hp: number; maxHp: number }) => Math.round((e.hp / e.maxHp) * 1000) / 1000;
const QUAY = { x: 19.5, y: 110.5 };
/** `n` cidadãos novos no cais, a ≤ 4 tiles do centro das naus ([19.5,113.5]), fora do Mercado. */
const crowd = (s: GameState, n: number) => { for (let k = 0; k < n; k++) spawnUnit(s, 0, 'villager', 17.6 + (k % 4) * 1.2, 110.3 + Math.floor(k / 4) * 0.3); };
/**
 * O cenário sem as ondas e com o Culto parado (marionete): só o relógio (naus, Prometeu, Cronos) e o que o teste fizer. O
 * arconte ganha piso de vida 1 (nada o fere) para a partida não acabar antes do instante que o teste quer ver.
 */
function calm(d: CampaignDifficulty, keep: string[] = []): GameState {
  const f = JSON.parse(JSON.stringify(file)) as ScenarioFile;
  f.id = 'm11_teste';
  f.triggers = f.triggers.filter((t) => keep.includes(t.id) || !['ira1', 'ira2', 'ira3', 'vanguarda', 'hostes'].includes(t.id));
  f.config.players = f.config.players.map((p, i) => (i === 1 ? { ...p, isAI: false, puppet: true } : p));
  const s = createGame(withCampaignDifficulty(gameConfigFor(f), d));
  (byTag(s, 'arconte') as Unit).hpFloor = 1;
  return s;
}

describe('m11: mapa fixo "Argólida em Chamas"', () => {
  it('o mapa embutido no cenário é o que scripts/maps/m11_chamas.ts gera (reprodutível, forma canônica)', () => {
    const built = buildFlamesMap();
    expect(JSON.stringify(built)).toBe(JSON.stringify(data));
    expect(mapHash(built)).toBe(mapHash(data));
  }, 60_000);

  it('validateMap sem erros; 128×128, 3 inícios, sem kit e sem relíquias; Argos inteira da ficha, com a muralha norte e Tirinto', () => {
    expect(validateMap(data, { players: 3 }).filter((i) => i.level === 'error')).toEqual([]);
    expect([data.w, data.h, data.starts.length, data.relics, data.startKit]).toEqual([128, 128, 3, false, false]);
    expect(data.starts).toEqual([[64, 40], [116, 12], [64, 8]]);
    const ents = data.entities ?? [];
    expect(ents.filter((e) => e.owner !== 0)).toEqual([]);
    // CC centrado no início 0, Templo (tag templo), Academia, Quartel, Estábulo, Mercado, Fortaleza, 10 Casas; 3 Torres (2 na muralha e Tirinto)
    expect(ents.filter((e) => e.kind === 'building' && e.type === 'town_center').map((e) => [e.x, e.y])).toEqual([[63, 39]]);
    const mineB = (t: string) => ents.filter((e) => e.kind === 'building' && e.type === t).length;
    expect(['temple', 'academy', 'barracks', 'stable', 'market', 'fortress', 'house', 'tower'].map(mineB)).toEqual([1, 1, 1, 1, 1, 1, 10, 3]);
    expect(ents.find((e) => e.type === 'temple')?.tag).toBe('templo');
    // unidades: 40 cidadãos, 8 hoplitas, 6 arqueiros cretenses e 4 hipeus
    const mineU = (t: string) => ents.filter((e) => e.kind === 'unit' && e.type === t).length;
    expect(['villager', 'hoplite', 'cretan_archer', 'hippeus'].map(mineU)).toEqual([40, 8, 6, 4]);
    // a muralha norte (grupo muralha, G5) com o portão no meio (grupo portao) e uma torre em cada ponta; Tirinto em [40,80]
    const row = POINTS.wallRow;
    expect(ents.filter((e) => e.tag === 'portao').map((e) => [e.type, e.x, e.y])).toEqual([[63, row], [64, row], [65, row]].map(([x, y]) => ['gate', x, y]));
    expect(ents.filter((e) => e.tag === 'muralha').length).toBe(22);
    expect(ents.filter((e) => e.tag === 'muralha').every((e) => e.type === 'wall' && e.y === row)).toBe(true);
    expect(ents.filter((e) => e.tag?.startsWith('torre_') || e.tag === 'tirinto').map((e) => [e.tag, e.x, e.y])).toEqual([['torre_oeste', 51, row], ['torre_leste', 77, row], ['tirinto', 40, 80]]);
  });

  it('o Ínaco só se cruza nos dois vaus; a Descida de Cronos, as ruínas de Tirinto e o cais de Náuplia junto ao golfo', () => {
    const s = start('normal');
    const at = (x: number, y: number) => s.map.terrain[y * s.map.w + x];
    // a Descida: terra batida de ponta a ponta no meio do desfiladeiro, montanha dos dois lados
    for (let y = 4; y <= 20; y++) for (let x = PASS[0] + 1; x <= PASS[1] - 1; x++) expect(at(x, y), `${x},${y}`).toBe(TERRAIN.DIRT);
    for (const x of [40, 50, 80, 90]) expect(at(x, 10), `${x},10`).toBe(TERRAIN.MOUNTAIN);
    // Tirinto: a torre no outeiro e restos de muralha ciclópica (rocha) em volta, abertos na Via
    let ruins = 0;
    for (let y = 72; y <= 88; y++) for (let x = 32; x <= 48; x++) { const d = Math.sqrt((x + 0.5 - 40.5) ** 2 + (y + 0.5 - 80.5) ** 2); if (d >= 4.3 && d <= 5.3 && at(x, y) === TERRAIN.MOUNTAIN) ruins++; }
    expect(ruins).toBeGreaterThanOrEqual(8);
    // o cais: o Mercado das naus (3×3 em [18,112]) em areia livre, a água do golfo logo abaixo (linha 116)
    for (let y = POINTS.naus[1]; y < POINTS.naus[1] + 3; y++) for (let x = POINTS.naus[0]; x < POINTS.naus[0] + 3; x++) expect(at(x, y), `${x},${y}`).toBe(TERRAIN.SAND);
    for (let x = 16; x <= 23; x++) { expect(at(x, QUAY_COAST - 1), `${x}`).toBe(TERRAIN.SAND); expect([TERRAIN.WATER, TERRAIN.DEEP]).toContain(at(x, QUAY_COAST)); }
    // os vaus são de areia; Argos, o cais, Tirinto, o vale do Culto, a margem oeste e Lerna estão na mesma região
    for (const [x, y] of [POINTS.fordN, POINTS.fordS]) expect(at(x, y), `${x},${y}`).toBe(TERRAIN.SAND);
    const home = componentAt(s.map, 60, 60);
    for (const [x, y] of [[64, 36], [19, 110], [40, 76], [110, 20], [12, 60], [86, 98]]) expect(componentAt(s.map, x, y), `${x},${y}`).toBe(home);
    // fechando os dois vaus, a margem oeste (e o cais) fica separada da planície: o Ínaco só se cruza neles
    for (let y = 0; y < s.map.h; y++) for (let x = 0; x < s.map.w; x++) if (inFord(x, y)) s.map.blocked[y * s.map.w + x] = 1;
    invalidateComponents(s.map);
    expect(componentAt(s.map, 12, 60)).not.toBe(componentAt(s.map, 60, 60));
    expect(componentAt(s.map, 19, 110)).toBe(componentAt(s.map, 12, 60));
  });
});

describe('m11_chamas', () => {
  it('setup da ficha: Mítica, 800/800/800/100; o arconte (G8) e o sacerdote de Héstia; as naus no cais com nome e piso de vida (G9)', () => {
    const s = start('normal');
    const p0 = s.players[0];
    expect([p0.age, p0.resources.food, p0.resources.wood, p0.resources.gold, p0.resources.favor]).toEqual([3, 800, 800, 800, 100]);
    expect(s.players.map((p) => p.team)).toEqual([0, 1, 1]);
    const a = byTag(s, 'arconte') as Unit;
    expect([a.type, a.owner]).toEqual(['basileus', 0]);
    expect(entityDisplayName(a)).toBe('Arconte de Argos');
    const priest = byTag(s, 'sacerdote') as Unit;
    expect([priest.type, entityDisplayName(priest)]).toEqual(['villager', 'Sacerdote de Héstia']);
    expect(alive(s, 0, 'villager')).toHaveLength(41);
    const naus = byTag(s, 'naus') as Building;
    expect([naus.type, naus.owner, naus.tx, naus.ty, naus.complete, naus.hpFloor]).toEqual(['market', 0, 18, 112, true, 0.3]);
    expect(entityDisplayName(naus)).toBe('Naus de Micenas');
    // o Culto (IA com kit) com as pesquisas militares; Cronos (marionete) sem nada até descer
    expect([...s.buildings.values()].some((b) => b.owner === 1 && b.type === 'town_center')).toBe(true);
    for (const t of ['military1', 'military2']) expect(s.players[1].techs).toContain(t);
    expect(alive(s, 2)).toHaveLength(0);
    // G6: ninguém ergue o Portal dos Titãs (nada de outro Prometeu nem de outro Cronos), a Idade para na Mítica, Jasão e Aquiles não voltam
    for (const p of [0, 1]) {
      expect(isForbidden(s, p, 'buildings', 'titan_gate'), `${p}`).toBe(true);
      expect(maxAgeOf(s, p), `${p}`).toBe(3);
      for (const u of ['jason', 'achilles']) expect(isForbidden(s, p, 'units', u), `${p} ${u}`).toBe(true);
    }
    for (const u of ['odysseus', 'heracles', 'perseus']) expect([isForbidden(s, 0, 'units', u), isForbidden(s, 1, 'units', u)], u).toEqual([false, true]);
    expect(lintScenario(file)).toEqual([]);
  });

  it('G3: meta 20/30/40 e as naus 7-7-6 (Fácil), 10-10-10 (Normal) e 10-10-10-10 (Difícil, a 4ª aos 14 min)', () => {
    const want: Record<CampaignDifficulty, [number, number[]]> = { easy: [20, [7, 14, 20, 20]], normal: [30, [10, 20, 30, 30]], hard: [40, [10, 20, 30, 40]] };
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const s = calm(d);
      run(s, 2);
      expect(s.scenario!.vars.meta, d).toBe(want[d][0]);
      expect(s.scenario!.vars.capacidade, d).toBe(0);
      [240, 540, 780, 840].forEach((t, k) => {
        jump(s, t - 2); run(s, 1);
        expect(s.scenario!.vars.capacidade, `${d} antes de ${t}`).toBe(k === 0 ? 0 : want[d][1][k - 1]);
        run(s, 2);
        expect(s.scenario!.vars.capacidade, `${d} ${t}`).toBe(want[d][1][k]);
      });
      expect(s.scenario!.fired.includes('nau4'), d).toBe(d === 'hard');
      expect(lines(s).some((t) => t.includes('primeira nau de Micenas')), d).toBe(true);
    }
  });

  it('embarque (G6 remove): no cais, um cidadão a cada 2 s até encher os lugares, sem morte; o sacerdote salva a chama (G1)', () => {
    const s = calm('normal');
    const priest = byTag(s, 'sacerdote') as Unit;
    // parado antes (tecla S): um cidadão que coletava guarda o nó antigo, e o motor o manda de volta à coleta se esse nó se esgota
    // no caminho (depleteNode; pendência registrada em docs/STORY.md §5.8)
    applyCommand(s, { type: 'stop', player: 0, ids: [priest.id] });
    applyCommand(s, { type: 'move', player: 0, ids: [priest.id], x: QUAY.x, y: QUAY.y });
    run(s, 90);
    expect(s.scenario!.objectives.chama).toBe('done');   // chegou ao cais (antes da nau): a chama está salva e o segredo aparece
    expect(s.scenario!.hidden.chama).toBe(false);
    expect(lines(s).some((t) => t.includes('lareira comum sobe a bordo'))).toBe(true);
    crowd(s, 11);
    const losses = s.players[0].stats.losses;
    jump(s, 237); run(s, 2);
    expect(s.scenario!.vars.embarcados).toBe(0);   // antes da nau, ninguém embarca
    run(s, 1);
    expect(s.scenario!.vars.embarcados).toBe(1);   // a nau atraca e o 1º sobe no mesmo segundo
    run(s, 40);
    expect(s.scenario!.vars.embarcados).toBe(10);   // os 10 lugares da 1ª nau, um a cada 2 s
    expect(s.players[0].stats.losses).toBe(losses);   // G6: sem morte nem abate
    expect(priest.dead).toBe(true);                   // embarcou (removido)
    expect(alive(s, 0, 'villager').filter((u) => (u.x - QUAY.x) ** 2 + (u.y - 113.5) ** 2 < 25)).toHaveLength(2);   // os 2 que sobraram esperam a próxima nau
    expect(lines(s).some((t) => t.includes('O primeiro sobe a bordo'))).toBe(true);
    expect(s.scenario!.objectives).toMatchObject({ exodo: 'pending', arconte: 'pending' });
  }, 60_000);

  it('vitória com a meta a bordo e o arconte vivo; derrota se o arconte cai ou se as naus zarpam sem a meta (18 min)', () => {
    const s = calm('easy');
    s.scenario!.vars.capacidade = 20;   // as três naus do Fácil já no cais
    crowd(s, 20);
    run(s, 44);
    expect(s.scenario!.vars.embarcados).toBe(20);
    run(s, 2);
    expect(s.scenario!.objectives).toMatchObject({ exodo: 'done', arconte: 'done' });
    expect(s.scenario!.outcome).toBe('victory');
    // o arconte cai: derrota na hora
    const t = calm('normal');
    run(t, 3);
    const a = byTag(t, 'arconte') as Unit;
    a.hpFloor = undefined;
    killUnit(t, a, 1);
    run(t, 1);
    expect(t.scenario!.objectives.arconte).toBe('failed');
    expect(t.scenario!.outcome).toBe('defeat');
    // o relógio: aos 18 min, sem a meta, as naus zarpam e a missão falha
    const u = calm('normal');
    run(u, 3);
    jump(u, 1077); run(u, 2);
    expect(u.scenario!.outcome).toBe('playing');
    expect(lines(u).some((x) => x.includes('soltam as amarras'))).toBe(true);
    run(u, 2);
    expect(u.scenario!.objectives.exodo).toBe('failed');
    expect(u.scenario!.outcome).toBe('defeat');
  }, 60_000);

  it('as ondas, um poder cada: Maldição e hoplitas (2 min), Tempestade e arqueiros atrás do arconte (5,5 min), Trégua e cavalaria rumo às naus (9,5 min), escaladas pela dificuldade', () => {
    for (const [d, n] of [['easy', [6, 6, 4]], ['normal', [8, 8, 6]], ['hard', [12, 12, 9]]] as const) {
      const s = calm(d, ['ira1', 'ira2', 'ira3']);
      const a = byTag(s, 'arconte') as Unit;
      // novos do jogador 2 (fora as Sombras: o Culto é de Hades, e soldado dele morto em combate às vezes volta como Sombra)
      const wave = () => alive(s, 2).filter((u) => !seen.has(u.id) && u.type !== 'shade');
      const seen = new Set<number>();
      const check = (t: number, god: string, power: string, types: string[], count: number, target: { x: number; y: number }) => {
        jump(s, t - 1); run(s, 2);
        expect(s.players[0].minorGods, `${d} ${t}`).toContain(god);
        expect(s.players[0].powers.some((p) => p.id === power && !p.used), `${d} ${power}`).toBe(true);
        const w = wave();
        for (const u of w) seen.add(u.id);
        expect(w.length, `${d} ${t}`).toBe(count);
        for (const u of w) expect(types, `${d} ${t}`).toContain(u.type);
        // o raid vira ponto fixo no alvo do disparo
        for (const u of w) expect(Math.abs((u.order as { x: number }).x - target.x) + Math.abs((u.order as { y: number }).y - target.y), `${d} ${t}`).toBeLessThan(1.5);
      };
      const tc = [...s.buildings.values()].find((b) => b.owner === 0 && b.type === 'town_center')!;
      check(120, 'aphrodite', 'curse', ['hoplite'], n[0], tc);
      check(330, 'hera', 'lightning_storm', ['toxotes', 'cretan_archer'], n[1], a);
      const naus = byTag(s, 'naus')!;
      check(570, 'hermes', 'ceasefire', ['hetairoi', 'hippeus'], n[2], naus);
    }
  }, 60_000);

  it('a vanguarda de Lícaon desce pela Descida aos 7,5 min, com catapultas, rumo à cidade (G3: escalada)', () => {
    for (const [d, n] of [['easy', 8], ['normal', 12], ['hard', 18]] as const) {
      const s = calm(d, ['vanguarda']);
      jump(s, 449); run(s, 2);
      const v = alive(s, 2);
      expect(v.length, d).toBe(n);
      expect(v.filter((u) => u.type === 'petrobolos').length, d).toBeGreaterThanOrEqual(1);
      for (const u of v) expect(u.x >= PASS[0] - 2 && u.x <= PASS[1] + 2 && u.y <= 24, `${d} ${u.x},${u.y}`).toBe(true);
      for (const u of v) expect(u.order, d).toMatchObject({ type: 'attackMove', x: 64, y: 40 });
      expect(lines(s).some((t) => t.includes('a mesa está posta')), d).toBe(true);
    }
  });

  it('hostes: quem sobra das ondas, parado, vai caçar o arconte', () => {
    const s = calm('normal', ['hostes']);
    const a = byTag(s, 'arconte') as Unit;
    const h = spawnUnit(s, 2, 'hoplite', 100, 60);
    run(s, 6);
    expect(h.order).toMatchObject({ type: 'attackMove' });
    expect(Math.abs((h.order as { x: number }).x - a.x) + Math.abs((h.order as { y: number }).y - a.y)).toBeLessThan(2);
  });

  it('2º Raio (G11): depois dos 5,5 min, o Raio já usado volta uma vez', () => {
    const s = calm('normal');
    run(s, 2);
    const foe = spawnUnit(s, 2, 'hoplite', 70, 50);
    expect(applyCommand(s, { type: 'power', player: 0, power: 'bolt', targetId: foe.id }).ok).toBe(true);
    run(s, 2);
    const bolt = () => s.players[0].powers.find((p) => p.id === 'bolt')!;
    expect(bolt().used).toBe(true);
    jump(s, 320); run(s, 5);
    expect(s.scenario!.fired).not.toContain('raio2');
    jump(s, 329); run(s, 2);
    expect(s.scenario!.fired).toContain('raio2');
    expect(bolt().used).toBe(false);
    expect(lines(s).some((t) => t.includes('Tens outro'))).toBe(true);
  });

  it('Prometeu surge 1 min antes de Cronos (13/11/9 min) e Cronos aos 14/12/10 min, imbatível (G9: piso de 30 %), rumo à cidade', () => {
    for (const [d, at] of [['easy', 840], ['normal', 720], ['hard', 600]] as const) {
      const s = calm(d);
      run(s, 2);
      jump(s, at - 62); run(s, 1);
      expect(s.scenario!.fired, d).not.toContain('prometeu');
      run(s, 2);
      const p = byTag(s, 'prometeu') as Unit;
      expect([p?.type, p?.owner, Math.floor(p.x), Math.floor(p.y)], d).toEqual(['prometheus', 0, 64, 22]);
      expect(s.scenario!.fired, d).not.toContain('cronos');
      jump(s, at - 1); run(s, 2);
      const c = byTag(s, 'cronos') as Unit;
      expect([c.type, c.owner, c.hpFloor], d).toEqual(['cronus', 2, 0.3]);
      expect(Math.abs(c.x - 64.5) <= 3 && c.y <= 14, `${d} ${c.x},${c.y}`).toBe(true);
      expect(c.order, d).toMatchObject({ type: 'attackMove', x: 64, y: 40 });
      // Prometeu recebe a ordem de lutar 1 s depois (no disparo que o invoca, a marionete Cronos ainda não conta como viva)
      expect(p.order, d).toMatchObject({ type: 'attack', targetId: c.id });
      expect(s.players[0].minorGods, d).toContain('athena');
      expect(lines(s).some((t) => t.includes('Devorei meus filhos')), d).toBe(true);
      // imbatível: dano, o Raio de Zeus (metade da vida de um Titã) e o Raio de novo param no piso
      scriptedDamage(s, c, 99999);
      expect(frac(c), d).toBe(0.3);
      c.hp = c.maxHp;
      expect(applyCommand(s, { type: 'power', player: 0, power: 'bolt', targetId: c.id }).ok, d).toBe(true);
      expect(frac(c), d).toBe(0.5);
      killUnit(s, c, 0);
      expect([c.dead, frac(c)], d).toEqual([false, 0.3]);
      expect(s.scenario!.objectives.arconte, d).toBe('pending');
      expect(now(s), d).toBe(at + 1);
    }
  }, 60_000);

  it('Cronos, parado depois da cidade, desce a Via de Náuplia até Tirinto e fica lá (a estrada fecha; o vau do norte continua aberto)', () => {
    const s = calm('hard');
    run(s, 2);
    jump(s, 599); run(s, 2);
    const c = byTag(s, 'cronos') as Unit;
    // longe de tudo de Argos (no pântano de Lerna), para que, parado, ele não ache alvo sozinho: só o roteiro o move
    const spot = spiralSearch(96, 95, 6, (x, y) => isPassable(s.map, x, y))!;
    c.x = spot.x + 0.5; c.y = spot.y + 0.5;
    applyCommand(s, { type: 'stop', player: 2, ids: [c.id] });
    run(s, 2);
    expect(s.scenario!.fired).toContain('cronos_estrada');
    expect(c.order).toMatchObject({ type: 'attackMove', x: 40, y: 80 });
    expect(lines(s).some((t) => t.includes('vau do norte'))).toBe(true);
    // parado de novo (em Tirinto), ninguém o manda adiante: o cais não é dele
    applyCommand(s, { type: 'stop', player: 2, ids: [c.id] });
    run(s, 4);
    expect(c.order).toBeNull();
  });

  it('as naus não afundam (G9: piso de 30 %); o Templo de Zeus até os 12 min é o objetivo da retaguarda', () => {
    const s = calm('normal');
    run(s, 2);
    const naus = byTag(s, 'naus') as Building;
    scriptedDamage(s, naus, 99999);
    expect([naus.dead, frac(naus)]).toEqual([false, 0.3]);
    jump(s, 718); run(s, 1);
    expect(s.scenario!.objectives.retaguarda).toBe('pending');
    run(s, 2);
    expect(s.scenario!.objectives.retaguarda).toBe('done');
    const t = calm('normal');
    run(t, 2);
    scriptedDamage(t, byTag(t, 'templo') as Building, 99999);
    run(t, 2);
    expect(t.scenario!.objectives.retaguarda).toBe('failed');
    expect(lines(t).some((x) => x.includes('eu não moro em pedra'))).toBe(true);
  });

  it('HUD (G4): as naus zarpam, a próxima nau, Cronos (pela dificuldade), a bordo e os lugares (PT e EN)', () => {
    const s = calm('normal');
    run(s, 5);
    const def = campaignMission('m11_chamas')!;
    let html = scenarioHudHtml(def, s);
    for (const t of ['⛵ As naus zarpam em: 17:5', '⚓ Primeira nau em: 3:5', '⏳ Cronos chega em: 11:5', '⛵ A bordo: 0/30', '⚓ Lugares nas naus atracadas: 0/30']) expect(html).toContain(t);
    expect(html).not.toContain('⏳ ⏳');
    jump(s, 300); run(s, 2);
    html = scenarioHudHtml(def, s);
    expect(html).toContain('⚓ Próxima nau em: 3:5');
    expect(html).toContain('⚓ Lugares nas naus atracadas: 10/30');
    expect(html).not.toContain('Primeira nau');
    setLocale('en');
    try {
      const en = scenarioHudHtml(campaignMission('m11_chamas')!, s);
      for (const t of ['⛵ The ships sail in: 12:5', '⚓ Next ship in: 3:5', '⏳ Cronus arrives in: 6:5', '⛵ Aboard: 0/30']) expect(en).toContain(t);
    } finally { setLocale('pt'); }
    const h = calm('hard');
    run(h, 5);
    expect(scenarioHudHtml(def, h)).toContain('⏳ Cronos chega em: 9:5');
    expect(scenarioHudHtml(def, h)).toContain('⛵ A bordo: 0/40');
  });

  it('registro e roteiro: Ato III depois da m9; janela da §4 ±30 % (18 min → 12m36s–23m24s), levas antes de Cronos e os poderes das ondas no fim', () => {
    const i = CAMPAIGN.findIndex((e) => e.id === 'm11_chamas');
    expect(CAMPAIGN[i].act).toBe(3);
    expect(CAMPAIGN.findIndex((e) => e.id === 'm9_tenaro')).toBeLessThan(i);
    const sc = MISSION_SCRIPTS.m11_chamas;
    expect(sc.expect).toEqual([12.6, 23.4]);
    expect(sc.atEnd?.map((c) => c.label)).toEqual(['Maldição e Tempestade de Raios usadas']);
    // a última leva leva todos e sai antes de Cronos chegar à cidade
    expect(m11Levas('normal')).toEqual([{ at: 170, size: 12 }, { at: 470, size: 12 }, { at: 640, size: 'all' }]);
    expect(m11Levas('easy')).toEqual([{ at: 170, size: 9 }, { at: 470, size: 9 }, { at: 710, size: 'all' }]);
    expect(m11Levas('hard')).toEqual([{ at: 170, size: 12 }, { at: 470, size: 12 }, { at: 520, size: 'all' }]);
  });
});
