// m8 "A Maré de Oceano" (docs/STORY.md §5.5): o mapa fixo "Golfo da Argólida" é reprodutível pelo script
// scripts/maps/m8_oceano.ts e tem a identidade da ficha (Argos na colina atrás da crista com dois portões e a brecha, Micenas a
// noroeste, a Liga a leste, Lerna no centro, a praia larga e o golfo ao sul); o setup da ficha, o Portal só para Argos (G6), as
// três marés do chefe (G9: piso de vida por maré, recuo invulnerável, volta com a contagem do painel, G4), a cura do Difícil (G3),
// o segredo de Lerna (G13: só a Hidra morta por Argos), Jasão e o HUD. A passiva curta roda em tests/missions.test.ts; o roteiro
// longo (vitória dentro da janela, e a variante dos Titãs) só em scripts/missions.ts.
import { describe, it, expect } from 'vitest';
import { TICK_RATE, TERRAIN } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { killUnit } from '../src/core/sim/combat';
import { isForbidden } from '../src/core/sim/restrictions';
import { componentAt, invalidateComponents } from '../src/core/map/components';
import { mapHash, validateMap, type FixedMapData } from '../src/core/map/fixed';
import { scriptedDamage } from '../src/core/scenario/helpers';
import { MISSION_SCRIPTS, missionRunConfig } from '../src/core/scenario/testing';
import { campaignMission, withCampaignDifficulty } from '../src/core/scenario/campaign';
import { gameConfigFor } from '../src/core/scenario/compile';
import { lintScenario, type CampaignDifficulty, type ScenarioFile } from '../src/core/scenario/schema';
import { entityDisplayName } from '../src/core/scenario/text';
import { scenarioHudHtml } from '../src/ui/scenario-hud';
import { setLocale } from '../src/i18n';
import type { GameState, Unit } from '../src/core/types';
import m8 from '../src/core/scenario/missions/m8_oceano.scenario.json';
import { buildGulfMap, COAST, POINTS, inPass } from '../scripts/maps/m8_oceano';

const file = m8 as unknown as ScenarioFile;
const data = (file.map as { data: FixedMapData }).data;
const start = (d: CampaignDifficulty) => createGame(missionRunConfig('m8_oceano', d).config);
const run = (s: GameState, seconds: number) => { for (let i = 0; i < seconds * TICK_RATE && !s.gameOver; i++) tick(s); };
const now = (s: GameState) => Math.floor(s.tick / TICK_RATE);
const lines = (s: GameState) => s.events.filter((e) => e.type === 'dialogue').map((e) => e.text ?? '');
const alive = (s: GameState, owner: number, type: string) => [...s.units.values()].filter((u) => u.owner === owner && !u.dead && u.type === type);
const byTag = (s: GameState, tag: string) => { const id = s.scenario!.vars['#' + tag]; return id === undefined ? undefined : s.units.get(id); };
const oceanus = (s: GameState) => alive(s, 2, 'oceanus')[0] as Unit | undefined;
const frac = (u: Unit) => Math.round((u.hp / u.maxHp) * 1000) / 1000;
/**
 * O cenário só com Oceano em cena: a Liga e Micenas viram marionetes paradas e as ondas de cavaleiros saem (para correr o relógio
 * das marés sem que Argos caia nem que terceiros firam o Titã).
 */
function calm(d: CampaignDifficulty): GameState {
  const f = JSON.parse(JSON.stringify(file)) as ScenarioFile;
  f.id = 'm8_teste';
  f.triggers = f.triggers.filter((t) => !['onda1', 'onda2', 'mare_escolta1', 'mare_escolta'].includes(t.id));
  f.config.players = f.config.players.map((p, i) => (i === 1 || i === 3 ? { ...p, isAI: false, puppet: true } : p));
  return createGame(withCampaignDifficulty(gameConfigFor(f), d));
}

describe('m8: mapa fixo "Golfo da Argólida"', () => {
  it('o mapa embutido no cenário é o que scripts/maps/m8_oceano.ts gera (reprodutível, forma canônica)', () => {
    const built = buildGulfMap();
    expect(JSON.stringify(built)).toBe(JSON.stringify(data));
    expect(mapHash(built)).toBe(mapHash(data));
  }, 60_000);

  it('validateMap sem erros; 128×128, 4 inícios, sem kit e sem relíquias; a cidade de Argos da ficha e a muralha parcial', () => {
    expect(validateMap(data, { players: 4 }).filter((i) => i.level === 'error')).toEqual([]);
    expect([data.w, data.h, data.starts.length, data.relics, data.startKit]).toEqual([128, 128, 4, false, false]);
    expect(data.starts).toEqual([[64, 20], [110, 64], [64, 119], [20, 24]]);
    const ents = data.entities ?? [];
    // CC centrado no início 0, Templo, Academia, Quartel, Estábulo, Oficina de Cerco e 4 Casas; 2 Torres; 20 cidadãos
    expect(ents.filter((e) => e.kind === 'building' && e.type === 'town_center').map((e) => [e.owner, e.x, e.y])).toEqual([[0, 63, 19]]);
    const mineB = (t: string) => ents.filter((e) => e.kind === 'building' && e.owner === 0 && e.type === t).length;
    expect(['temple', 'academy', 'barracks', 'stable', 'siege_workshop', 'house', 'tower'].map(mineB)).toEqual([1, 1, 1, 1, 1, 4, 2]);
    expect(ents.filter((e) => e.kind === 'unit' && e.owner === 0 && e.type === 'villager')).toHaveLength(20);
    expect(ents.filter((e) => e.owner !== 0)).toEqual([]);
    // a muralha: muro-portão-muro nas passagens laterais, só os muros das pontas na brecha (grupo 'muralha', G5); uma tag por portão/torre
    const row = POINTS.wallRow;
    expect(ents.filter((e) => e.tag === 'muralha').map((e) => [e.type, e.x, e.y])).toEqual([[49, row], [51, row], [62, row], [66, row], [77, row], [79, row]].map(([x, y]) => ['wall', x, y]));
    expect(ents.filter((e) => e.tag === 'portao_oeste' || e.tag === 'portao_leste').map((e) => [e.tag, e.type, e.x, e.y])).toEqual([['portao_oeste', 'gate', 50, row], ['portao_leste', 'gate', 78, row]]);
    expect(ents.filter((e) => e.tag?.startsWith('torre_')).map((e) => e.tag)).toEqual(['torre_oeste', 'torre_leste']);
  });

  it('a crista da Áspis só se atravessa pelas três passagens; a praia larga, o golfo e os pântanos de Lerna', () => {
    const s = start('normal');
    const at = (x: number, y: number) => s.map.terrain[y * s.map.w + x];
    // a subida de Oceano e o início 2 na areia, o golfo a partir da linha 124 (intransponível: água), Lerna em areia
    for (const [x, y] of [[POINTS.rise[0], POINTS.rise[1]], [64, 119], [30, 114], [100, 114]]) expect(at(x, y), `${x},${y}`).toBe(TERRAIN.SAND);
    for (let y = COAST; y < 128; y++) expect([TERRAIN.WATER, TERRAIN.DEEP], `64,${y}`).toContain(at(64, y));
    expect(at(POINTS.hydra[0], POINTS.hydra[1])).toBe(TERRAIN.SAND);
    // todos os pontos da ficha na mesma região: Argos, a brecha, Micenas, a Liga, Lerna, a praia
    const home = componentAt(s.map, 64, 24);
    for (const [x, y] of [[64, 44], [22, 28], [104, 64], [44, 80], [64, 118]]) expect(componentAt(s.map, x, y), `${x},${y}`).toBe(home);
    // a crista é contínua entre os braços da Lárissa: fora das passagens, as linhas 36–40 são montanha
    for (let x = 38; x <= 90; x++) if (!inPass(x)) for (let y = 36; y <= 40; y++) expect(at(x, y), `${x},${y}`).toBe(TERRAIN.MOUNTAIN);
    // fecha as três passagens (e os portões): Argos fica sozinha na colina
    for (let x = 0; x < s.map.w; x++) if (inPass(x)) for (let y = 35; y <= 41; y++) { const i = y * s.map.w + x; s.map.blocked[i] = 1; s.map.gateTeam[i] = -1; }
    invalidateComponents(s.map);
    expect(componentAt(s.map, 64, 24)).not.toBe(componentAt(s.map, 64, 44));
    expect(componentAt(s.map, 64, 44)).toBe(componentAt(s.map, 64, 118));
  });
});

describe('m8_oceano', () => {
  it('setup da ficha: Argos na Mítica com as 4 pesquisas, Atena e Apolo, Jasão e 8 soldados; a Hidra de Lerna; a Liga com menos estoque', () => {
    const s = start('normal');
    const p0 = s.players[0];
    expect(p0.age).toBe(3);
    expect(p0.minorGods).toEqual(['athena', 'apollo']);
    for (const t of ['civic1', 'science1', 'military1', 'commerce1']) expect(p0.techs).toContain(t);
    expect(p0.resources).toMatchObject({ food: 1500, wood: 1500, gold: 1500, favor: 200, knowledge: 800 });
    expect(byTag(s, 'jasao')?.type).toBe('jason');
    expect([alive(s, 0, 'hoplite').length, alive(s, 0, 'cretan_archer').length, alive(s, 0, 'villager').length]).toEqual([4, 4, 20]);
    const h = byTag(s, 'hidra')!;
    expect([h.type, h.owner, Math.floor(h.x), Math.floor(h.y)]).toEqual(['hydra', 2, 44, 80]);
    expect(entityDisplayName(h)).toBe('Hidra de Lerna');
    expect([...s.units.values()].filter((u) => u.owner === 2 && !u.dead)).toHaveLength(1);
    expect(s.players.map((p) => p.team)).toEqual([0, 1, 1, 0]);
    expect(s.players[1].resources).toMatchObject({ food: 500, wood: 500, gold: 300, favor: 50, knowledge: 200 });
    for (const t of ['civic1', 'military1', 'military2', 'science1']) expect(s.players[1].techs).toContain(t);
    // Liga e Micenas com kit (CC); Argos com a cidade do mapa; Oceano sem nada além da Hidra
    for (const p of [0, 1, 3]) expect([...s.buildings.values()].some((b) => b.owner === p && b.type === 'town_center'), `${p}`).toBe(true);
  }, 60_000);

  it('G6: só Argos pode erguer o Portal dos Titãs (nada de outro Prometeu nem de outro Oceano)', () => {
    const s = start('normal');
    expect(isForbidden(s, 0, 'buildings', 'titan_gate')).toBe(false);
    expect(isForbidden(s, 1, 'buildings', 'titan_gate')).toBe(true);
    expect(isForbidden(s, 3, 'buildings', 'titan_gate')).toBe(true);
    expect(lintScenario(file)).toEqual([]);
  });

  it('as três marés: sobe aos 10 min rumo à crista, recua com 2/3 da vida (invulnerável até voltar), volta 6 min depois com piso de 1/3 e cai de vez na última', () => {
    const s = calm('normal');
    run(s, 599);
    expect(oceanus(s)).toBeUndefined();
    expect(s.scenario!.objectives.preparar).toBe('pending');
    run(s, 1);
    const o = oceanus(s)!;
    expect([Math.floor(o.x), Math.floor(o.y), o.hpFloor]).toEqual([64, 118, 0.66]);
    expect(s.scenario!.objectives.preparar).toBe('done');
    expect(s.scenario!.hidden.oceano).toBe(false);
    expect(s.scenario!.vars).toMatchObject({ mare: 1, alta: 1 });
    expect(lines(s).some((t) => t.includes('três marés'))).toBe(true);
    // a 1ª maré só fere até 2/3; ao chegar lá, o mar recua: piso 1, ordem de voltar à praia e a contagem da volta
    scriptedDamage(s, o, 99999);
    expect(frac(o)).toBe(0.66);
    run(s, 1);
    expect(s.scenario!.fired).toContain('recua1');
    const recuo = now(s);
    expect([o.hpFloor, s.scenario!.vars.alta, s.scenario!.vars.t_recuo]).toEqual([1, 0, recuo]);
    scriptedDamage(s, o, 500);
    expect(frac(o)).toBe(0.66);   // na maré baixa, nada o fere
    run(s, 90);
    expect(o.y).toBeGreaterThan(110);   // de volta à praia
    run(s, recuo + 360 - now(s) - 1);
    expect(s.scenario!.fired).not.toContain('ergue2');
    run(s, 1);
    expect(s.scenario!.fired).toContain('ergue2');
    expect([o.hpFloor, frac(o), s.scenario!.vars.mare, s.scenario!.vars.alta]).toEqual([0.33, 0.66, 2, 1]);
    scriptedDamage(s, o, 99999);
    expect(frac(o)).toBe(0.33);
    run(s, 1);
    expect(s.scenario!.fired).toContain('recua2');
    expect(lines(s).some((t) => t.includes('guarde o raio'))).toBe(true);
    run(s, s.scenario!.vars.t_recuo + 360 - now(s));
    expect(s.scenario!.fired).toContain('ergue3');
    expect(o.hpFloor).toBeUndefined();
    expect(s.scenario!.objectives.oceano).toBe('pending');
    // o Raio de Zeus (metade da vida de um Titã) sem piso: cai de vez, e a missão termina em vitória
    expect(frac(o)).toBe(0.33);
    scriptedDamage(s, o, o.maxHp * 0.5);
    expect(o.dead).toBe(true);
    run(s, 2);
    expect(s.scenario!.objectives).toMatchObject({ oceano: 'done', jasao: 'done' });
    expect(s.scenario!.outcome).toBe('victory');
    expect(lines(s).some((t) => t.includes('memória longa'))).toBe(true);
  }, 120_000);

  it('a 1ª maré recua sozinha 150 s depois de subir; no Difícil o golfo devolve 10 % da vida a cada volta (G3)', () => {
    for (const d of ['normal', 'hard'] as const) {
      const s = calm(d);
      run(s, 600);
      const o = oceanus(s)!;
      o.hpFloor = 1;   // ninguém o fere nesta sonda: a maré acaba pelo tempo
      run(s, 149);
      expect(s.scenario!.fired, d).not.toContain('recua1');
      run(s, 1);
      expect(s.scenario!.fired, d).toContain('recua1');
      o.hp = o.maxHp * 0.7;   // como se a 1ª maré o tivesse ferido até 70 %
      run(s, 360);
      expect(s.scenario!.fired, d).toContain('ergue2');
      expect(frac(o), d).toBe(d === 'hard' ? 0.8 : 0.7);
      expect(s.scenario!.fired.includes('devolve2'), d).toBe(d === 'hard');
    }
  }, 120_000);

  it('segredo de Lerna (G13): só vale a Hidra morta por Argos antes de Oceano subir, e rende 100 de Favor', () => {
    const s = start('normal');
    run(s, 61);
    const favor = s.players[0].resources.favor;
    killUnit(s, byTag(s, 'hidra')!, 3);   // Micenas a derruba: não conta para Argos
    run(s, 2);
    expect(s.scenario!.objectives.lerna).toBe('pending');
    expect(s.scenario!.hidden.lerna).toBe(true);
    const t = start('normal');
    run(t, 61);
    const f0 = t.players[0].resources.favor;
    killUnit(t, byTag(t, 'hidra')!, 0);
    run(t, 2);
    expect(t.scenario!.objectives.lerna).toBe('done');
    expect(t.scenario!.hidden.lerna).toBe(false);
    expect(t.players[0].resources.favor - f0).toBeGreaterThanOrEqual(100);
    expect(s.players[0].resources.favor - favor).toBeLessThan(100);
  }, 60_000);

  it('Jasão: se cair, o objetivo falha e a Pítia lamenta', () => {
    const s = start('normal');
    run(s, 61);
    killUnit(s, byTag(s, 'jasao')!, 1);
    run(s, 2);
    expect(s.scenario!.objectives.jasao).toBe('failed');
    expect(lines(s).some((t) => t.includes('Jasão caiu'))).toBe(true);
  }, 60_000);

  it('HUD (G4): contagem até Oceano subir, a barra das marés e a contagem da volta (PT e EN)', () => {
    const s = calm('normal');
    run(s, 5);
    const def = campaignMission('m8_oceano')!;
    expect(scenarioHudHtml(def, s)).toContain('🌊 Oceano sobe em: 9:5');
    run(s, 596);
    let html = scenarioHudHtml(def, s);
    expect(html).not.toContain('Oceano sobe em');
    expect(html).toContain('🌊 Maré: 1/3');
    expect(html).not.toContain('A maré volta em');
    scriptedDamage(s, oceanus(s)!, 99999);
    run(s, 2);
    html = scenarioHudHtml(def, s);
    expect(html).toContain('🌊 A maré volta em: 5:5');
    setLocale('en');
    try { expect(scenarioHudHtml(campaignMission('m8_oceano')!, s)).toContain('🌊 The tide returns in: 5:5'); } finally { setLocale('pt'); }
  }, 60_000);

  it('roteiro de teste registrado: janela da §4 ±30 % (30–35 min → 21m–45m30s) e a variante dos Titãs exige Prometeu', () => {
    const sc = MISSION_SCRIPTS.m8_oceano;
    expect(sc.expect).toEqual([21, 45.5]);
    expect(sc.variants?.map((v) => [v.label, v.expect, v.fired])).toEqual([['titãs', [21, 45.5], ['prometeu']]]);
  });
});
