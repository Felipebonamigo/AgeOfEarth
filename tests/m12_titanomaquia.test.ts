// m12 "O Fim da Idade de Ouro" (docs/STORY.md §5.9): o mapa fixo "Planície da Tessália" é reprodutível pelo script
// scripts/maps/m12_titanomaquia.ts e tem a identidade da ficha (a Nova Argos na escarpa do Olimpo com três passagens, o Ossa
// entre o Tempe e o Ótris, o Trono na Estrada do Trono, a caverna de Hades, a costa de Poseidon, os três Altares no Campo);
// o setup (G6: Portal só para Argos, heróis só de Argos), o juramento do Estige (os Altares e o Trono só caem com seis
// soldados de Argos por perto; o Trono só depois que Cronos sai), as vinganças da Foice, o prazo de Cronos por dificuldade
// (G3), as três idades do chefe (G9: piso por idade, o recuo ao Trono, a hora devorada, a cura do Difícil), o golpe final de
// Perseu (G13) e o HUD (G4). A passiva curta roda em tests/missions.test.ts; o roteiro longo (vitória dentro da janela) só em
// scripts/missions.ts.
import { describe, it, expect } from 'vitest';
import { TICK_RATE, TERRAIN } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { destroyBuilding, killUnit } from '../src/core/sim/combat';
import { spawnUnit } from '../src/core/sim/entities';
import { isForbidden } from '../src/core/sim/restrictions';
import { componentAt, invalidateComponents } from '../src/core/map/components';
import { mapHash, validateMap, type FixedMapData } from '../src/core/map/fixed';
import { scriptedDamage } from '../src/core/scenario/helpers';
import { MISSION_SCRIPTS, missionRunConfig } from '../src/core/scenario/testing';
import { campaignMission, nextCampaignMission, withCampaignDifficulty, CAMPAIGN, CAMPAIGN_PLAN } from '../src/core/scenario/campaign';
import { gameConfigFor } from '../src/core/scenario/compile';
import { lintScenario, type CampaignDifficulty, type ScenarioFile } from '../src/core/scenario/schema';
import { scenarioHudHtml } from '../src/ui/scenario-hud';
import { setLocale } from '../src/i18n';
import type { Building, GameState, Unit } from '../src/core/types';
import m12 from '../src/core/scenario/missions/m12_titanomaquia.scenario.json';
import { buildThessalyMap, POINTS } from '../scripts/maps/m12_titanomaquia';

const file = m12 as unknown as ScenarioFile;
const data = (file.map as { data: FixedMapData }).data;
const start = (d: CampaignDifficulty) => createGame(missionRunConfig('m12_titanomaquia', d).config);
const run = (s: GameState, seconds: number) => { for (let i = 0; i < seconds * TICK_RATE && !s.gameOver; i++) tick(s); };
const now = (s: GameState) => Math.floor(s.tick / TICK_RATE);
const lines = (s: GameState) => s.events.filter((e) => e.type === 'dialogue').map((e) => e.text ?? '');
const byTag = (s: GameState, tag: string): Unit | Building | undefined => { const id = s.scenario!.vars['#' + tag]; return id === undefined ? undefined : s.units.get(id) ?? s.buildings.get(id); };
const cronus = (s: GameState) => [...s.units.values()].find((u) => u.type === 'cronus' && !u.dead);
const frac = (e: Unit | Building) => Math.round((e.hp / e.maxHp) * 1000) / 1000;
/** Seis soldados de Argos junto de (x, y): abrem o juramento do Estige ali. */
const squad = (s: GameState, x: number, y: number): Unit[] => Array.from({ length: 6 }, (_, k) => spawnUnit(s, 0, 'hoplite', x + (k % 3) - 1 + 0.5, y + Math.floor(k / 3) + 0.5));
/** Um ponto livre ao norte do Trono, a ~11 tiles do centro dele (dentro do raio de 14 do juramento), fora do alcance de Cronos parado no pé do Trono. */
const NEAR_THRONE: [number, number] = [110, 20];
/**
 * O cenário só com o Culto e Cronos em cena, para correr o relógio: Hades, Poseidon e o Culto viram marionetes paradas, o
 * devorar e as vinganças saem, e o prazo de Cronos vira `prazo` segundos (as três dificuldades usam o mesmo).
 */
function calm(d: CampaignDifficulty, prazo = 60): GameState {
  const f = JSON.parse(JSON.stringify(file)) as ScenarioFile;
  f.id = 'm12_teste';
  f.vars = { ...f.vars, prazo };
  f.triggers = f.triggers.filter((t) => !['devorar', 'devorar_hades', 'devorar_poseidon', 'prazo_facil', 'prazo_dificil', 'foice1_cai', 'foice2_cai', 'foice3_cai', 'vinganca_marcha'].includes(t.id));
  f.config.players = f.config.players.map((p, i) => (i > 0 ? { ...p, isAI: false, puppet: true } : p));
  f.setup = [...(f.setup ?? []), { do: 'hpFloor', entity: { tc: 0 }, value: 1 }];   // a Nova Argos não cai enquanto a sonda corre o relógio
  return createGame(withCampaignDifficulty(gameConfigFor(f), d));
}
/** Derruba os três Altares (sem o juramento: é o teste que os tira do caminho). */
const razeAltars = (s: GameState) => { for (const t of ['foice1', 'foice2', 'foice3']) destroyBuilding(s, byTag(s, t) as Building, 0); };

describe('m12: mapa fixo "Planície da Tessália"', () => {
  it('o mapa embutido no cenário é o que scripts/maps/m12_titanomaquia.ts gera (reprodutível, forma canônica)', () => {
    const built = buildThessalyMap();
    expect(JSON.stringify(built)).toBe(JSON.stringify(data));
    expect(mapHash(built)).toBe(mapHash(data));
  }, 60_000);

  it('validateMap sem erros; 144×144, 4 inícios, sem kit e sem relíquias; a Nova Argos da ficha, o Trono e os Altares com uma tag cada', () => {
    expect(validateMap(data, { players: 4 }).filter((i) => i.level === 'error')).toEqual([]);
    expect([data.w, data.h, data.starts.length, data.relics, data.startKit]).toEqual([144, 144, 4, false, false]);
    expect(data.starts).toEqual([[24, 24], [24, 120], [120, 120], [120, 24]]);
    const ents = data.entities ?? [];
    const mineB = (t: string) => ents.filter((e) => e.kind === 'building' && e.owner === 0 && e.type === t);
    // CC centrado no início 0, Templo, Academia, a Fortaleza em obra, 4 Casas e as 3 torres das passagens; 15 cidadãos, Odisseu e Héracles
    expect(mineB('town_center').map((e) => [e.x, e.y])).toEqual([[23, 23]]);
    expect(['temple', 'academy', 'fortress', 'house', 'tower'].map((t) => mineB(t).length)).toEqual([1, 1, 1, 4, 3]);
    expect(mineB('fortress').map((e) => e.kind === 'building' && e.complete)).toEqual([false]);
    expect(ents.filter((e) => e.kind === 'unit' && e.owner === 0 && e.type === 'villager')).toHaveLength(15);
    expect(ents.filter((e) => e.tag === 'odisseu' || e.tag === 'heracles').map((e) => [e.tag, e.type])).toEqual([['odisseu', 'odysseus'], ['heracles', 'heracles']]);
    // o Trono (Fortaleza do Culto) e os três Altares da Foice (Templos do Culto) nos pontos da ficha, uma tag por entidade
    expect(ents.filter((e) => e.tag === 'trono').map((e) => [e.type, e.owner, e.x, e.y])).toEqual([['fortress', 3, 111, 29]]);
    expect(ents.filter((e) => e.tag?.startsWith('foice')).map((e) => [e.tag, e.type, e.owner, e.x + 1, e.y + 1])).toEqual(POINTS.altars.map(([x, y], k) => [`foice${k + 1}`, 'temple', 3, x, y]));
    const tags = ents.filter((e) => e.tag).map((e) => e.tag);
    expect(new Set(tags).size).toBe(tags.length);
    // três sentinelas do Culto em volta de cada Altar; Hades e Poseidon só com o kit (nada no mapa)
    expect(ents.filter((e) => e.kind === 'unit' && e.type === 'sentinel' && e.owner === 3)).toHaveLength(9);
    expect(ents.filter((e) => e.owner === 1 || e.owner === 2)).toEqual([]);
  });

  it('o Olimpo só se deixa pelas três passagens, o Ótris pelas duas saídas e a caverna pelas duas bocas; o Ossa separa o Tempe do Ótris; o mar de Poseidon', () => {
    const s = start('normal');
    const m = s.map;
    const at = (x: number, y: number) => m.terrain[y * m.w + x];
    expect([at(72, 20), at(6, 6), at(24, 28), at(72, 76)]).toEqual([TERRAIN.MOUNTAIN, TERRAIN.MOUNTAIN, TERRAIN.DIRT, TERRAIN.DIRT]);
    for (const [x, y] of [[140, 140], [108, 74], [9, 133]]) expect([TERRAIN.WATER, TERRAIN.DEEP], `${x},${y}`).toContain(at(x, y));
    const field = () => componentAt(m, 72, 76);
    for (const [x, y] of [[24, 28], [56, 20], [100, 20], [24, 126], [120, 128]]) expect(componentAt(m, x, y), `${x},${y}`).toBe(field());
    const saved = m.blocked.slice(), savedGate = m.gateTeam.slice();
    const close = (pts: readonly (readonly [number, number])[]) => {
      m.blocked.set(saved); m.gateTeam.set(savedGate);
      for (const [cx, cy] of pts) for (let y = cy - 5; y <= cy + 5; y++) for (let x = cx - 5; x <= cx + 5; x++) { const i = y * m.w + x; m.blocked[i] = 1; m.gateTeam[i] = -1; }
      invalidateComponents(m);
    };
    close([POINTS.olympusEast, POINTS.olympusRamp, POINTS.olympusSouth]);
    expect(componentAt(m, 24, 28)).not.toBe(field());
    expect(componentAt(m, 56, 20)).toBe(field());   // o Vale do Tempe abre para a planície, não para o Olimpo
    close([POINTS.throneRoad, POINTS.othrysEast]);
    expect(componentAt(m, 100, 20)).not.toBe(field());
    expect(componentAt(m, 56, 20)).toBe(field());   // o Ossa: do Tempe ao Ótris só pela planície
    close([POINTS.caveNorth, POINTS.caveEast]);
    expect(componentAt(m, 24, 126)).not.toBe(field());
    m.blocked.set(saved); m.gateTeam.set(savedGate); invalidateComponents(m);
  });
});

describe('m12_titanomaquia', () => {
  it('setup da ficha: a Nova Argos na Mítica com as 5 pesquisas, Atena, Apolo e Hera, Perseu, Odisseu, Héracles e a guarda do êxodo; os irmãos e o Culto', () => {
    const s = start('normal');
    const p0 = s.players[0];
    expect(p0.age).toBe(3);
    expect(p0.minorGods).toEqual(['athena', 'apollo', 'hera']);
    for (const t of ['civic1', 'civic2', 'science1', 'military1', 'commerce1']) expect(p0.techs).toContain(t);
    expect(p0.resources).toMatchObject({ food: 1500, wood: 1500, gold: 1200, favor: 200, knowledge: 800 });
    expect(['perseu', 'odisseu', 'heracles'].map((t) => byTag(s, t)?.type)).toEqual(['perseus', 'odysseus', 'heracles']);
    const count = (t: string) => [...s.units.values()].filter((u) => u.owner === 0 && !u.dead && u.type === t).length;
    expect(['villager', 'hoplite', 'toxotes'].map(count)).toEqual([15, 6, 4]);
    expect(p0.popCap - p0.pop).toBeGreaterThan(10);   // as 4 Casas: há população para treinar
    expect(s.players.map((p) => p.team)).toEqual([0, 0, 0, 1]);
    expect(s.players[3].resources).toMatchObject({ food: 600, wood: 600, gold: 500, favor: 100, knowledge: 300 });
    expect(s.players[3].minorGods).toEqual(['ares', 'aphrodite', 'hera']);
    for (const p of [1, 2, 3]) expect([...s.buildings.values()].some((b) => b.owner === p && b.type === 'town_center'), `${p}`).toBe(true);
    // o Culto tem o Trono, os Altares e as torres da Estrada do Trono; ninguém mais sai do setup com Titã
    expect([...s.units.values()].filter((u) => u.type === 'cronus')).toHaveLength(0);
    expect(lintScenario(file)).toEqual([]);
  }, 60_000);

  it('G6: só Argos ergue o Portal (nada de outro Cronos nem de Oceano) e treina Perseu, Héracles e Odisseu; Aquiles e Jasão fora', () => {
    const s = start('normal');
    expect(isForbidden(s, 0, 'buildings', 'titan_gate')).toBe(false);
    for (const p of [1, 2, 3]) {
      expect(s.config.players[p].maxAge, `${p}`).toBe(3);
      for (const h of ['perseus', 'heracles', 'odysseus']) expect(isForbidden(s, p, 'units', h), `${p} ${h}`).toBe(true);
    }
    for (const p of [0, 1, 2, 3]) for (const h of ['achilles', 'jason']) expect(isForbidden(s, p, 'units', h), `${p} ${h}`).toBe(true);
  });

  it('o juramento do Estige: um Altar não sofre dano (dos irmãos nem de ninguém) sem seis soldados de Argos a até 14 tiles; com eles, cai e o Culto se vinga', () => {
    const s = start('normal');
    run(s, 3);
    const a = byTag(s, 'foice1') as Building;
    scriptedDamage(s, a, 900);
    expect(frac(a)).toBe(1);
    const [x, y] = POINTS.altars[0];
    squad(s, x, y + 4);
    run(s, 2);
    expect(a.hpFloor).toBeUndefined();
    scriptedDamage(s, a, 99999);
    expect(a.dead).toBe(true);
    run(s, 1);
    expect(s.scenario!.vars.foices).toBe(1);
    const revenge = tagIdsAlive(s, 'vinganca1').map((id) => s.units.get(id)!);
    expect(revenge.map((u) => u.owner)).toEqual(new Array(8).fill(3));
    for (const u of revenge) expect(u.order, u.type).toMatchObject({ type: 'attackMove' });
    expect(lines(s).some((t) => t.includes('cobrar a louça'))).toBe(true);
    // os outros dois continuam protegidos
    const b = byTag(s, 'foice2') as Building;
    scriptedDamage(s, b, 900);
    expect(frac(b)).toBe(1);
  }, 60_000);

  it('prazo de Cronos por dificuldade (G3): 30, 25 ou 20 min; o aviso da Pítia 3 min antes; no Difícil, dois Colossos', () => {
    for (const [d, prazo] of [['easy', 1800], ['normal', 1500], ['hard', 1200]] as const) {
      const s = start(d);
      run(s, 2);
      expect(s.scenario!.vars.prazo, d).toBe(prazo);
      const def = campaignMission('m12_titanomaquia')!;
      expect(scenarioHudHtml(def, s), d).toContain(`⏳ Cronos deixa o trono em: ${Math.floor((prazo - 2) / 60)}:`);
    }
    const s = calm('hard', 200);
    run(s, 21);
    expect(lines(s).some((t) => t.includes('Três minutos'))).toBe(true);
    run(s, 178);
    expect(cronus(s)).toBeUndefined();
    run(s, 2);
    const c = cronus(s)!;
    expect([c.owner, c.hpFloor]).toEqual([3, 0.66]);
    expect((c.x - 113.5) * (c.x - 113.5) + (c.y - 36.5) * (c.y - 36.5)).toBeLessThan(4 * 4);   // surge ao pé do Trono
    expect(s.scenario!.hidden.cronos).toBe(false);
    expect([...s.units.values()].filter((u) => u.owner === 3 && u.type === 'colossus' && !u.dead)).toHaveLength(2);
    expect(lines(s).some((t) => t.includes('Eu SOU a espera'))).toBe(true);
    // Cronos marcha sobre a Nova Argos em ataque-movimento
    expect(c.order).toMatchObject({ type: 'attackMove' });
  }, 120_000);

  it('com Altares de pé, Cronos não passa de dois terços; o Trono não cai antes de Cronos sair nem sem os Altares no chão', () => {
    const s = calm('normal');
    run(s, 10);
    const throne = byTag(s, 'trono') as Building;
    squad(s, ...NEAR_THRONE);
    run(s, 2);
    scriptedDamage(s, throne, 99999);
    expect(frac(throne)).toBe(1);   // antes de Cronos sair: o juramento vale mesmo com os soldados lá
    run(s, 50);
    const c = cronus(s)!;
    expect(c).toBeDefined();
    scriptedDamage(s, c, 99999);
    expect(frac(c)).toBe(0.66);
    run(s, 3);
    expect(s.scenario!.fired).not.toContain('fase2');
    expect(lines(s).some((t) => t.includes('Altares de pé'))).toBe(true);
    scriptedDamage(s, throne, 99999);
    expect(frac(throne)).toBe(1);   // Cronos saiu, mas os Altares ainda queimam: o Trono não está exposto
  }, 120_000);

  it('as três idades: sem os Altares, o Trono exposto; a 2/3 Cronos volta ao Trono (invulnerável até ele cair e 150 s), a 1/3 devora a hora e depois cai', () => {
    const s = calm('normal');
    razeAltars(s);
    run(s, 62);
    const c = cronus(s)!;
    expect(s.scenario!.objectives.foices).toBe('done');
    expect(s.scenario!.hidden.trono).toBe(false);
    expect(lines(s).some((t) => t.includes('Trono do Ótris ficou vazio'))).toBe(true);
    scriptedDamage(s, c, 99999);
    expect(frac(c)).toBe(0.66);
    run(s, 1);
    expect(s.scenario!.fired).toEqual(expect.arrayContaining(['fase2', 'fase2_trono']));
    expect([c.hpFloor, s.scenario!.vars.fase, s.scenario!.vars.recuo]).toEqual([1, 2, 1]);
    expect(c.order).toMatchObject({ type: 'move' });
    const t0 = s.scenario!.vars.t_fome;
    // sentado no Trono: nada o fere até o Trono cair (com seis soldados de Argos lá) e passarem 150 s
    run(s, 160);
    expect(s.scenario!.fired).not.toContain('fase2_fere');
    const throne = byTag(s, 'trono') as Building;
    scriptedDamage(s, throne, 99999);
    expect(frac(throne)).toBe(1);   // sem soldados de Argos perto, o juramento ainda o guarda
    const guard = squad(s, ...NEAR_THRONE);
    run(s, 2);
    scriptedDamage(s, throne, 99999);
    expect(throne.dead).toBe(true);
    for (const u of guard) if (!u.dead) killUnit(s, u, -1);   // ninguém de Argos fere Cronus nesta sonda
    run(s, 2);
    expect(s.scenario!.objectives.trono).toBe('done');
    expect(s.scenario!.fired).toContain('fase2_fere');
    expect(now(s)).toBeGreaterThanOrEqual(t0 + 150);
    expect([c.hpFloor, frac(c), s.scenario!.vars.recuo]).toEqual([0.33, 0.66, 0]);
    // 3ª idade: devora a hora (150 s de piso 1, uma onda do Culto) e depois fica sem piso
    scriptedDamage(s, c, 99999);
    run(s, 1);
    expect(s.scenario!.fired).toContain('fase3');
    expect([c.hpFloor, s.scenario!.vars.fase]).toEqual([1, 3]);
    expect(tagIdsAlive(s, 'fome2').length).toBeGreaterThanOrEqual(6);
    run(s, 149);
    expect(c.hpFloor).toBe(1);
    run(s, 2);
    expect(c.hpFloor).toBeUndefined();
    // o Raio de Zeus (metade da vida de um Titã) sem piso: cai de vez, e a campanha termina em vitória
    scriptedDamage(s, c, c.maxHp * 0.5);
    expect(c.dead).toBe(true);
    run(s, 2);
    expect(s.scenario!.objectives).toMatchObject({ cronos: 'done', foices: 'done', trono: 'done', irmaos: 'done', perseu: 'pending' });
    expect(s.scenario!.outcome).toBe('victory');
    expect(lines(s).some((t) => t.includes('cospe de volta ao Tártaro'))).toBe(true);
    expect(lines(s).some((t) => t.includes('É tudo o que uma tragédia concede'))).toBe(true);
  }, 180_000);

  it('sem o Trono na 2ª idade, Cronos devora a hora ali mesmo; no Difícil, ele recupera 10 % a cada idade (G3)', () => {
    for (const d of ['normal', 'hard'] as const) {
      const s = calm(d);
      razeAltars(s);
      run(s, 62);
      const c = cronus(s)!;
      const throne = byTag(s, 'trono') as Building;
      destroyBuilding(s, throne, 0);
      run(s, 1);
      expect(lines(s).some((t) => t.includes('velho com fome')), d).toBe(true);
      scriptedDamage(s, c, 99999);
      run(s, 1);
      expect(s.scenario!.fired, d).toContain('fase2_fome');
      expect(s.scenario!.fired, d).not.toContain('fase2_trono');
      expect(s.scenario!.vars.recuo, d).toBe(0);
      run(s, 150);
      expect(s.scenario!.fired, d).toContain('fase2_fere');
      expect(frac(c), d).toBe(d === 'hard' ? 0.76 : 0.66);
      scriptedDamage(s, c, 99999);
      run(s, 1);
      expect(frac(c), d).toBe(d === 'hard' ? 0.43 : 0.33);
    }
  }, 180_000);

  it('segredo de Perseu (G13): só vale se o golpe final for dele, e ele ganha a fala no lugar da de Zeus', () => {
    const s = calm('normal');
    razeAltars(s);
    run(s, 62);
    const c = cronus(s)!;
    delete c.hpFloor;
    s.scenario!.vars.fase = 3;
    c.hp = 1;
    const perseus = byTag(s, 'perseu') as Unit;
    killUnit(s, c, 0, perseus);
    run(s, 2);
    expect(s.scenario!.objectives).toMatchObject({ cronos: 'done', perseu: 'done' });
    expect(s.scenario!.hidden.perseu).toBe(false);
    expect(lines(s).some((t) => t.includes('a dívida está paga'))).toBe(true);
    expect(lines(s).some((t) => t.includes('cospe de volta'))).toBe(false);
  }, 120_000);

  it('HUD (G4): a contagem de Cronos, os Altares derrubados, a idade de Cronos e a hora devorada (PT e EN)', () => {
    const s = calm('normal');
    run(s, 5);
    const def = campaignMission('m12_titanomaquia')!;
    let html = scenarioHudHtml(def, s);
    expect(html).toContain('🔥 Altares da Foice derrubados: 0/3');
    razeAltars(s);
    run(s, 58);
    html = scenarioHudHtml(def, s);
    expect(html).not.toContain('Altares da Foice derrubados');
    expect(html).toContain('⏳ Idade de Cronos: 1/3');
    const c = cronus(s)!;
    destroyBuilding(s, byTag(s, 'trono') as Building, 0);
    scriptedDamage(s, c, 99999);
    run(s, 2);
    html = scenarioHudHtml(def, s);
    expect(html).toContain('⏳ Idade de Cronos: 2/3');
    expect(html).toContain('⏳ Cronos devora a hora: 2:');
    setLocale('en');
    try { expect(scenarioHudHtml(campaignMission('m12_titanomaquia')!, s)).toContain('⏳ Cronus devours the hour: 2:'); } finally { setLocale('pt'); }
  }, 120_000);

  it('última missão do plano, registrada no Ato III; roteiro de teste com a janela da §4 ±30 % (35–40 min → 24m30s–52m) e o chefe lutando', () => {
    expect(CAMPAIGN_PLAN[CAMPAIGN_PLAN.length - 1].id).toBe('m12_titanomaquia');
    const e = CAMPAIGN.find((x) => x.id === 'm12_titanomaquia')!;
    expect([e.act, e.source, CAMPAIGN[CAMPAIGN.length - 1].id]).toEqual([3, 'json', 'm12_titanomaquia']);
    expect(nextCampaignMission('m12_titanomaquia')).toBeUndefined();
    const sc = MISSION_SCRIPTS.m12_titanomaquia;
    expect(sc.expect).toEqual([24.5, 52]);
    expect(sc.atEnd?.map((c) => c.label)).toEqual(['Cronos atacou por ao menos 25 s']);
    expect(sc.keepPowers).toEqual(['bolt']);
  });
});

function tagIdsAlive(s: GameState, tag: string): number[] {
  const out: number[] = [];
  for (let k = 0; ; k++) { const id = s.scenario!.vars[`#${tag}[${k}]`]; if (id === undefined) break; const u = s.units.get(id); if (u && !u.dead) out.push(id); }
  return out;
}
