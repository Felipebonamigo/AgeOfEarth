// m10 "O Cerco de Ótris" (docs/STORY.md §5.7): o mapa fixo "Monte Ótris" é reprodutível pelo script scripts/maps/m10_otris.ts e
// tem a identidade da ficha (a cidadela no platô com dois anéis de muralha — o Portão de Bronze no externo —, os três Pilares
// no santuário, o Altar do Tempo no meio da planície, Argos a sudoeste e Hades a sudeste); o setup da ficha; a pedra do Ótris
// que só cede perto das máquinas de cerco de Argos (G9 hpFloor); as colmeias dos Pilares (G9 hp); o altar que só conta com
// Argos nele (G2 koth) e corta as sortidas; as sortidas por dificuldade (G3); o segredo de Lícaon (G13) e o HUD (G4). A passiva
// curta roda em tests/missions.test.ts; o roteiro longo (vitória dentro da janela) só em scripts/missions.ts.
import { describe, it, expect } from 'vitest';
import { TICK_RATE, TERRAIN } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { killUnit } from '../src/core/sim/combat';
import { spawnUnit } from '../src/core/sim/entities';
import { isForbidden } from '../src/core/sim/restrictions';
import { componentAt, invalidateComponents } from '../src/core/map/components';
import { mapHash, validateMap, type FixedMapData } from '../src/core/map/fixed';
import { scriptedDamage } from '../src/core/scenario/helpers';
import { MISSION_SCRIPTS, missionRunConfig } from '../src/core/scenario/testing';
import { campaignMission, withCampaignDifficulty, CAMPAIGN } from '../src/core/scenario/campaign';
import { gameConfigFor } from '../src/core/scenario/compile';
import { lintScenario, type CampaignDifficulty, type ScenarioFile } from '../src/core/scenario/schema';
import { entityDisplayName } from '../src/core/scenario/text';
import { scenarioHudHtml } from '../src/ui/scenario-hud';
import { setLocale } from '../src/i18n';
import type { Building, GameState, Unit } from '../src/core/types';
import m10 from '../src/core/scenario/missions/m10_otris.scenario.json';
import { buildOthrysMap, PILLAR_CORNERS, POINTS, STONES, inOpening, inRamp } from '../scripts/maps/m10_otris';

const file = m10 as unknown as ScenarioFile;
const data = (file.map as { data: FixedMapData }).data;
const start = (d: CampaignDifficulty) => createGame(missionRunConfig('m10_otris', d).config);
const run = (s: GameState, seconds: number) => { for (let i = 0; i < seconds * TICK_RATE && !s.gameOver; i++) tick(s); };
const lines = (s: GameState) => s.events.filter((e) => e.type === 'dialogue').map((e) => e.text ?? '');
const alive = (s: GameState, owner: number, type: string) => [...s.units.values()].filter((u) => u.owner === owner && !u.dead && u.type === type);
const unitByTag = (s: GameState, tag: string) => { const id = s.scenario!.vars['#' + tag]; const u = id === undefined ? undefined : s.units.get(id); return u && !u.dead ? u : undefined; };
const bldByTag = (s: GameState, tag: string) => { const id = s.scenario!.vars['#' + tag]; const b = id === undefined ? undefined : s.buildings.get(id); return b && !b.dead ? b : undefined; };
const tagged = (s: GameState, tag: string) => [...s.units.values()].filter((u) => !u.dead && (s.scenario!.vars['#' + tag] === u.id || Object.entries(s.scenario!.vars).some(([k, v]) => k.startsWith(`#${tag}[`) && v === u.id)));
/**
 * O cenário sem os terceiros: Hades e o Culto viram marionetes paradas e as sortidas saem (para medir a pedra do Ótris, as
 * colmeias e o altar sem que as IAs mexam em nada).
 */
function calm(d: CampaignDifficulty = 'normal', keep: string[] = []): GameState {
  const f = JSON.parse(JSON.stringify(file)) as ScenarioFile;
  f.id = 'm10_teste';
  f.triggers = f.triggers.filter((t) => keep.includes(t.id) || !['sortida', 'sortida_facil', 'sortida_dificil'].includes(t.id));
  f.config.players = f.config.players.map((p, i) => (i === 1 || i === 2 ? { ...p, isAI: false, puppet: true } : p));
  return createGame(withCampaignDifficulty(gameConfigFor(f), d));
}
/** Uma unidade que não cai (piso de vida 1, G9) no tile (x, y): presença estável para as condições de área. */
const post = (s: GameState, owner: number, type: string, x: number, y: number): Unit => { const u = spawnUnit(s, owner, type, x + 0.5, y + 0.5); u.hpFloor = 1; return u; };
/** Tira do mapa uma unidade posta por post(). */
const drop = (s: GameState, u: Unit) => { u.hpFloor = 0; killUnit(s, u, u.owner === 0 ? 1 : 0); };
/** Uma helépole de Argos no tile (x, y). */
const engine = (s: GameState, x: number, y: number) => post(s, 0, 'helepolis', x, y);

describe('m10: mapa fixo "Monte Ótris"', () => {
  it('o mapa embutido no cenário é o que scripts/maps/m10_otris.ts gera (reprodutível, forma canônica)', () => {
    const built = buildOthrysMap();
    expect(JSON.stringify(built)).toBe(JSON.stringify(data));
    expect(mapHash(built)).toBe(mapHash(data));
  }, 60_000);

  it('validateMap sem erros; 144×144, 4 inícios, colina no altar, sem kit e sem relíquias; a cidadela do Culto e os dois anéis', () => {
    expect(validateMap(data, { players: 4, mode: 'koth' }).filter((i) => i.level === 'error')).toEqual([]);
    expect([data.w, data.h, data.starts.length, data.relics, data.startKit, data.koth]).toEqual([144, 144, 4, false, false, [72, 80]]);
    expect(data.starts).toEqual([[24, 120], [120, 120], [72, 32], [72, 8]]);
    const ents = data.entities ?? [];
    // Argos (0): só a Oficina de Cerco do acampamento; o CC vem do kit
    expect(ents.filter((e) => e.owner === 0).map((e) => [e.kind, e.type, e.x, e.y])).toEqual([['building', 'siege_workshop', 29, 112]]);
    expect(ents.filter((e) => e.owner === 1 || e.owner === 3)).toEqual([]);
    // o Culto (2): CC centrado no início [72,32], 15 cidadãos, 6 torres
    expect(ents.filter((e) => e.kind === 'building' && e.type === 'town_center').map((e) => [e.owner, e.x, e.y])).toEqual([[2, 71, 31]]);
    expect(ents.filter((e) => e.kind === 'unit' && e.owner === 2 && e.type === 'villager')).toHaveLength(15);
    expect(ents.filter((e) => e.kind === 'building' && e.type === 'tower')).toHaveLength(6);
    // os três Pilares do Tempo: Fortalezas do Culto, uma tag por pilar, centradas nos pontos da ficha
    for (const [k, tag] of ['pilar1', 'pilar2', 'pilar3'].entries()) {
      expect(ents.filter((e) => e.tag === tag).map((e) => [e.type, e.owner, e.x, e.y])).toEqual([['fortress', 2, ...PILLAR_CORNERS[k]]]);
    }
    expect(POINTS.pillars).toEqual([[60, 24], [84, 24], [72, 14]]);
    // os dois anéis: muro-muro-[portão]-muro-muro na rampa (linha 52) e na abertura do santuário (linha 28); grupos por tag (G5).
    // O vão do anel externo é o Portão de Bronze, que o cenário põe lacrado e com nome (place, G8); o portão interno é do mapa
    for (const [row, walls] of [[52, 'muralha_externa'], [28, 'muralha_interna']] as const) {
      expect(ents.filter((e) => e.tag === walls).map((e) => [e.type, e.x, e.y])).toEqual([70, 71, 73, 74].map((x) => ['wall', x, row]));
    }
    expect(ents.filter((e) => e.tag === 'portao_interno').map((e) => [e.type, e.x, e.y])).toEqual([['gate', 72, 28]]);
    expect(ents.some((e) => e.tag === 'portao_bronze' || (e.x === 72 && e.y === 52))).toBe(false);
    expect(file.setup?.find((a) => a.do === 'place' && a.tag === 'portao_bronze')).toMatchObject({ building: 'wall', at: { at: [72, 52] }, exact: true });
  });

  it('a cidadela só se atravessa pelos dois anéis; o altar é uma clareira entre seis pedras eretas', () => {
    const s = start('normal');
    const at = (x: number, y: number) => s.map.terrain[y * s.map.w + x];
    for (const [x, y] of STONES) expect(at(x, y), `${x},${y}`).toBe(TERRAIN.MOUNTAIN);
    expect(at(72, 80)).toBe(TERRAIN.DIRT);
    expect([s.koth?.x, s.koth?.y]).toEqual([72.5, 80.5]);
    // abre os dois portões para todos: o santuário, o pátio e a planície são uma região só
    const plain = () => componentAt(s.map, 72, 60), bailey = () => componentAt(s.map, 72, 40), sanctum = () => componentAt(s.map, 72, 20);
    const set = (x: number, y: number, blocked: number) => { const i = y * s.map.w + x; s.map.blocked[i] = blocked; s.map.gateTeam[i] = -1; };
    for (let x = 0; x < s.map.w; x++) { if (inRamp(x)) set(x, POINTS.outerRow, 0); if (inOpening(x)) set(x, POINTS.innerRow, 0); }
    invalidateComponents(s.map);
    expect(bailey()).toBe(plain());
    expect(sanctum()).toBe(plain());
    // fecha a rampa: o pátio e o santuário ficam isolados da planície
    for (let x = 0; x < s.map.w; x++) if (inRamp(x)) set(x, POINTS.outerRow, 1);
    invalidateComponents(s.map);
    expect(bailey()).not.toBe(plain());
    expect(sanctum()).toBe(bailey());
    // fecha também a abertura do santuário: três regiões
    for (let x = 0; x < s.map.w; x++) if (inOpening(x)) set(x, POINTS.innerRow, 1);
    invalidateComponents(s.map);
    expect(sanctum()).not.toBe(bailey());
    // os acampamentos e o altar na planície
    for (const [x, y] of [[26, 116], [118, 116], [72, 76]]) expect(componentAt(s.map, x, y), `${x},${y}`).toBe(plain());
  });
});

describe('m10_otris', () => {
  it('setup da ficha: Argos na Mítica com Atena, Apolo e Hera, as 4 pesquisas, Perseu e o cerco; Hades com a legião; Lícaon; o Culto', () => {
    const s = start('normal');
    const p0 = s.players[0];
    expect(p0.age).toBe(3);
    expect(p0.minorGods).toEqual(['athena', 'apollo', 'hera']);
    for (const t of ['civic1', 'science1', 'military1', 'military2']) expect(p0.techs).toContain(t);
    expect(p0.resources).toMatchObject({ food: 2000, wood: 2000, gold: 1500, favor: 150, knowledge: 600 });
    expect(unitByTag(s, 'perseu')?.type).toBe('perseus');
    expect([alive(s, 0, 'helepolis').length, alive(s, 0, 'petrobolos').length]).toEqual([2, 2]);
    expect(tagged(s, 'cerco').map((u) => u.type).sort()).toEqual(['helepolis', 'helepolis', 'petrobolos', 'petrobolos']);
    expect(s.players.map((p) => p.team)).toEqual([0, 0, 1, 1]);
    // Hades trouxe as legiões dele (kit + 10)
    expect(tagged(s, 'legiao')).toHaveLength(10);
    // o Culto: as três pesquisas de defesa e o estoque da ficha; trancado na cidadela (o Portão de Bronze é lacrado), não sai
    for (const t of ['masonry', 'fortified_towns', 'ballista_towers']) expect(s.players[2].techs).toContain(t);
    expect(s.players[2].resources).toMatchObject({ food: 2000, wood: 2000, gold: 1500 });
    // Lícaon, o lobo, no santuário, com nome próprio (G8)
    const l = unitByTag(s, 'licaon')!;
    expect([l.type, l.owner, Math.floor(l.x), Math.floor(l.y)]).toEqual(['nemean_lion', 3, 72, 20]);
    expect(entityDisplayName(l)).toBe('Lícaon, o Rei-Lobo');
    // as Sentinelas: 16 + 16 no santuário e a guarda do altar (7 no Normal; escala com a dificuldade, G3)
    expect([...s.units.values()].filter((u) => u.owner === 3 && !u.dead)).toHaveLength(1 + 32 + 7);
    expect(tagged(s, 'guarda_altar').map((u) => [Math.floor(u.x), Math.floor(u.y)]).every(([x, y]) => Math.abs(x - 72) <= 4 && Math.abs(y - 80) <= 4)).toBe(true);
    // Rei da Colina (koth) sem vitória nativa; Idade Mítica é o teto; ninguém treina Jasão nem Aquiles; o Culto não treina heróis
    expect(s.config.mode).toBe('koth');
    for (const p of [0, 1, 2]) {
      expect(isForbidden(s, p, 'units', 'jason'), `${p}`).toBe(true);
      expect(isForbidden(s, p, 'units', 'achilles'), `${p}`).toBe(true);
    }
    for (const h of ['perseus', 'heracles', 'odysseus']) expect(isForbidden(s, 2, 'units', h), h).toBe(true);
    expect(isForbidden(s, 0, 'units', 'heracles')).toBe(false);
    expect(lintScenario(file)).toEqual([]);
  }, 60_000);

  it('a pedra do Ótris: portões, muralhas e Pilares não sofrem dano sem uma máquina de cerco de Argos a até 12 tiles', () => {
    const s = calm();
    run(s, 2);
    const gate = bldByTag(s, 'portao_bronze')!, inner = bldByTag(s, 'portao_interno')!, p1 = bldByTag(s, 'pilar1')!;
    // todas as peças dos dois anéis (os quatro muros de cada um, o Portão de Bronze e o portão interno) e os três Pilares
    const ring = (row: number) => [...s.buildings.values()].filter((b) => !b.dead && b.ty === row && (b.type === 'wall' || b.type === 'gate'));
    expect(ring(POINTS.outerRow).map((b) => b.tx).sort((a, b) => a - b)).toEqual([70, 71, 72, 73, 74]);
    expect(ring(POINTS.innerRow).map((b) => b.tx).sort((a, b) => a - b)).toEqual([70, 71, 72, 73, 74]);
    for (const b of [...ring(POINTS.outerRow), ...ring(POINTS.innerRow), bldByTag(s, 'pilar2')!, bldByTag(s, 'pilar3')!, p1]) { const hp = b.hp; scriptedDamage(s, b, 500); expect(b.hp, `${b.type} ${b.tx},${b.ty}`).toBe(hp); }
    // o Portão de Bronze é um bloco lacrado com nome próprio (G8): nem o Culto passa
    expect([gate.type, entityDisplayName(gate)]).toEqual(['wall', 'Portão de Bronze']);
    expect(s.map.gateTeam[POINTS.outerRow * s.map.w + 72]).toBe(-1);
    // um soldado não basta: é preciso a máquina
    const hop = post(s, 0, 'hoplite', 72, 56);
    run(s, 2);
    scriptedDamage(s, gate, 500);
    expect(gate.hp).toBe(gate.maxHp);
    // a helépole a 5 tiles do portão: ele cede (e a muralha também), mas o anel interno e os Pilares não
    const h = engine(s, 72, 57);
    run(s, 2);
    let before = gate.hp;
    scriptedDamage(s, gate, 500);
    expect(gate.hp).toBe(before - 500);
    const wall = [...s.buildings.values()].find((b) => !b.dead && b.type === 'wall' && b.ty === POINTS.outerRow)!;
    before = wall.hp;
    scriptedDamage(s, wall, 100);
    expect(wall.hp).toBe(before - 100);
    scriptedDamage(s, inner, 500);
    expect(inner.hp).toBe(inner.maxHp);
    // a máquina se afasta: a pedra volta a não ceder
    drop(s, h);
    drop(s, hop);
    run(s, 2);
    before = gate.hp;
    scriptedDamage(s, gate, 500);
    expect(gate.hp).toBe(before);
    // Hades bate no bronze sem as máquinas de Argos: ele avisa (uma vez)
    for (let k = 0; k < 3; k++) post(s, 1, 'hypaspist', 71 + k, 55);
    run(s, 2);
    expect(lines(s).filter((t) => t.includes('traga as suas máquinas'))).toHaveLength(1);
  }, 60_000);

  it('as colmeias (G9): com 3/4, 1/2 e 1/4 da vida, o Pilar solta um enxame de 8 e não cede enquanto ele viver', () => {
    const s = calm();
    run(s, 2);
    const p1 = bldByTag(s, 'pilar1')!;
    engine(s, 60, 29);
    run(s, 2);
    scriptedDamage(s, p1, p1.maxHp * 0.3);   // 70 %
    run(s, 1);
    expect(s.scenario!.fired).toContain('colmeia1a');
    expect(tagged(s, 'enxame1a')).toHaveLength(8);
    expect(lines(s).some((t) => t.includes('se abre como colmeia'))).toBe(true);
    run(s, 1);
    const hp = p1.hp;
    scriptedDamage(s, p1, 500);
    expect(p1.hp).toBe(hp);
    // morto cada enxame, a pedra volta a ceder até o próximo limiar: metade e um quarto
    for (const [swarm, frac] of [['b', 0.45], ['c', 0.2]] as const) {
      for (const u of tagged(s, 'enxame1' + String.fromCharCode(swarm.charCodeAt(0) - 1))) killUnit(s, u, 0);
      run(s, 2);
      scriptedDamage(s, p1, p1.hp - p1.maxHp * frac);
      run(s, 1);
      expect(s.scenario!.fired).toContain('colmeia1' + swarm);
      expect(tagged(s, 'enxame1' + swarm)).toHaveLength(8);
      const at = p1.hp;
      scriptedDamage(s, p1, 300);
      expect(p1.hp).toBe(at);
    }
    // os outros Pilares seguem intactos e não soltaram enxame
    expect(s.scenario!.fired.filter((f) => f.startsWith('colmeia2') || f.startsWith('colmeia3'))).toEqual([]);
  }, 60_000);

  it('o altar (G2 koth): só conta com soldados de Argos nele; Hades sozinho não conta; 2 minutos seguidos cortam as sortidas', () => {
    const s = calm('normal', ['sortida']);
    for (const u of tagged(s, 'guarda_altar')) killUnit(s, u, 1);
    run(s, 2);
    for (let k = 0; k < 3; k++) post(s, 1, 'hypaspist', 71 + k, 80);
    run(s, 20);
    expect(s.koth?.team).toBe(0);
    expect(s.scenario!.vars.altar_s).toBe(0);
    const a = post(s, 0, 'hypaspist', 72, 79);
    run(s, 60);
    expect(s.scenario!.vars.altar_s).toBeGreaterThanOrEqual(58);
    // um inimigo no altar zera a conta
    const foe = post(s, 2, 'hoplite', 73, 81);
    run(s, 2);
    expect(s.scenario!.vars.altar_s).toBe(0);
    drop(s, foe);
    run(s, 125);
    expect(s.scenario!.objectives.altar).toBe('done');
    expect(lines(s).some((t) => t.includes('As sortidas acabaram'))).toBe(true);
    expect(a.dead).toBe(false);
    const n = s.scenario!.vars['@sortida'] ?? 0;
    run(s, 300);
    expect(s.scenario!.vars['@sortida'] ?? 0).toBe(n);
  }, 60_000);

  it('as sortidas (G3): Fácil a cada 3 min desde os 6, Normal a cada 4,5 min desde os 9, Difícil a cada 5,5 min desde os 11; o tamanho escala (4/6/9)', () => {
    const ids = ['sortida_facil', 'sortida', 'sortida_dificil'];
    for (const [d, id, first, size] of [['easy', 'sortida_facil', 360, 4], ['normal', 'sortida', 540, 6], ['hard', 'sortida_dificil', 660, 9]] as const) {
      const s = calm(d, ids);
      run(s, first - 1);
      expect(s.scenario!.vars['@' + id] ?? 0, d).toBe(0);
      run(s, 2);
      expect(s.scenario!.vars['@' + id], d).toBe(1);
      for (const other of ids.filter((x) => x !== id)) expect(s.scenario!.vars['@' + other] ?? 0, `${d} ${other}`).toBe(0);
      const tc = [...s.buildings.values()].find((b) => b.owner === 0 && b.type === 'town_center')!;
      const near = [...s.units.values()].filter((u) => u.owner === 3 && !u.dead && Math.abs(u.x - tc.x) < 30 && Math.abs(u.y - tc.y) < 30);
      expect(near.length, d).toBe(size);
      expect(lines(s).some((t) => t.includes('As Sentinelas do Ótris desceram a encosta'))).toBe(true);
    }
  }, 120_000);

  it('o segredo de Lícaon (G13): só conta se Argos o matar antes do último Pilar; a coleira o devolve ao santuário', () => {
    const s = calm();
    run(s, 2);
    const l = unitByTag(s, 'licaon')!;
    l.x = 72.5; l.y = 45.5;
    run(s, 20);
    expect(Math.abs(l.y - 20)).toBeLessThan(10);
    killUnit(s, l, 1);   // Hades o mata: o segredo não conta
    run(s, 2);
    expect(s.scenario!.objectives.licaon).toBe('pending');
    const t = calm();
    run(t, 2);
    killUnit(t, unitByTag(t, 'licaon')!, 0);
    run(t, 2);
    expect(t.scenario!.objectives.licaon).toBe('done');
    expect(t.scenario!.hidden.licaon).toBe(false);
    expect(lines(t).some((x) => x.includes('O banquete já está servido'))).toBe(true);
  }, 60_000);

  it('os Pilares caem: Cronos conta as pedras, o painel conta os Pilares e a peripécia encerra a missão com vitória', () => {
    const s = calm();
    run(s, 2);
    const def = campaignMission('m10_otris')!;
    expect(scenarioHudHtml(def, s)).toContain('🏛️ Pilares derrubados');
    for (const [k, tag] of ['pilar1', 'pilar2', 'pilar3'].entries()) {
      const b = bldByTag(s, tag) as Building;
      b.hpFloor = 0;
      scriptedDamage(s, b, b.maxHp + 1);
      run(s, 2);
      expect(s.scenario!.vars.caidos).toBe(k + 1);
    }
    expect(lines(s).some((t) => t.includes('Cada pedra que cai'))).toBe(true);
    expect(lines(s).some((t) => t.includes('agora só uma pedra'))).toBe(true);
    expect(s.scenario!.objectives.pilares).toBe('done');
    expect(s.scenario!.outcome).toBe('victory');
    expect(lines(s).some((t) => t.includes('Prendiam-no'))).toBe(true);
  }, 60_000);

  it('HUD (G4): a barra do altar em tempo (PT e EN)', () => {
    const s = calm();
    for (const u of tagged(s, 'guarda_altar')) killUnit(s, u, 1);
    post(s, 0, 'hypaspist', 72, 79);
    run(s, 31);
    const def = campaignMission('m10_otris')!;
    expect(scenarioHudHtml(def, s)).toContain('⏳ Altar do Tempo');
    setLocale('en');
    try { expect(scenarioHudHtml(campaignMission('m10_otris')!, s)).toContain('⏳ Altar of Time'); } finally { setLocale('pt'); }
  }, 60_000);

  it('registro e roteiro: Ato III depois da m9; janela da §4 ±30 % (30–35 min → 21m–45m30s)', () => {
    const ids = CAMPAIGN.map((e) => e.id);
    expect(ids.indexOf('m10_otris')).toBe(ids.indexOf('m9_tenaro') + 1);
    expect(CAMPAIGN.find((e) => e.id === 'm10_otris')?.act).toBe(3);
    expect(MISSION_SCRIPTS.m10_otris.expect).toEqual([21, 45.5]);
  });
});
