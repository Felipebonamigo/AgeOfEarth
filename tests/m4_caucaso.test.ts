// m4 "O Fogo do Cáucaso" (docs/STORY.md §5.1): o mapa fixo "Garganta do Cáucaso" é reprodutível pelo script
// scripts/maps/m4_caucaso.ts e tem a identidade da ficha (pontos, tags, rotas); as variações de dificuldade (G3), a
// libertação, o segredo de Hefesto e os paliativos sem G6 (Portal dos Titãs) funcionam. O roteiro longo (vitória dentro da
// janela) fica em scripts/missions.ts; a passiva curta, em tests/missions.test.ts.
import { describe, it, expect } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { placeBuilding } from '../src/core/sim/entities';
import { destroyBuilding } from '../src/core/sim/combat';
import { componentAt } from '../src/core/map/components';
import { mapHash, validateMap, type FixedMapData } from '../src/core/map/fixed';
import { campaignMission, missionConfig } from '../src/core/scenario/campaign';
import type { ScenarioFile } from '../src/core/scenario/schema';
import type { GameState } from '../src/core/types';
import m4 from '../src/core/scenario/missions/m4_caucaso.scenario.json';
import { buildCaucasusMap, POINTS } from '../scripts/maps/m4_caucaso';

const file = m4 as unknown as ScenarioFile;
const data = (file.map as { data: FixedMapData }).data;
const start = (d: 'easy' | 'normal' | 'hard') => createGame(missionConfig(campaignMission('m4_caucaso')!, d));
const seconds = (s: GameState, n: number) => { for (let i = 0; i < n * TICK_RATE; i++) tick(s); };
const byTag = (s: GameState, tag: string) => { const id = s.scenario!.vars['#' + tag]; return id === undefined ? undefined : s.units.get(id) ?? s.buildings.get(id); };
const dialogues = (s: GameState) => s.events.filter((e) => e.type === 'dialogue').map((e) => e.data ?? '');

describe('m4: mapa fixo "Garganta do Cáucaso"', () => {
  it('o mapa embutido no cenário é o que scripts/maps/m4_caucaso.ts gera (reprodutível, forma canônica)', () => {
    const built = buildCaucasusMap();
    expect(JSON.stringify(built)).toBe(JSON.stringify(data));
    expect(mapHash(built)).toBe(mapHash(data));
  }, 60_000);

  it('validateMap sem erros; 96×144, 3 inícios, sem relíquias; tags da ficha nas posições da ficha', () => {
    expect(validateMap(data, { players: 3 }).filter((i) => i.level === 'error')).toEqual([]);
    expect([data.w, data.h, data.starts.length, data.relics]).toEqual([96, 144, 3, false]);
    expect(data.starts).toEqual([[48, 135], [82, 24], [52, 12]]);
    const ents = data.entities ?? [];
    const at = (tag: string) => ents.filter((e) => e.tag === tag).map((e) => [e.kind, e.type, e.owner, e.x, e.y]);
    expect(at('corrente1')).toEqual([['building', 'tower', 2, ...POINTS.corrente1]]);
    expect(at('corrente2')).toEqual([['building', 'tower', 2, ...POINTS.corrente2]]);
    expect(at('corrente3')).toEqual([['building', 'tower', 2, ...POINTS.corrente3]]);
    expect(at('fortaleza_culto')).toEqual([['building', 'fortress', 1, ...POINTS.fortress]]);
    expect(at('heracles').map((e) => e.slice(0, 3))).toEqual([['unit', 'heracles', 0]]);
    // guardas em grupo (G5): 3, 4 e 5 por platô; o kit de desembarque do jogador 0
    expect(['guarda1', 'guarda2', 'guarda3'].map((g) => ents.filter((e) => e.tag === g && e.owner === 2).length)).toEqual([3, 4, 5]);
    const mine = (t: string) => ents.filter((e) => e.owner === 0 && e.type === t).length;
    expect([mine('hypaspist'), mine('cretan_archer'), mine('villager'), mine('petrobolos')]).toEqual([6, 4, 5, 1]);
  });

  it('praia, vale, platôs, Rochedo, cidade do Culto e o Altar de Hefesto estão ligados por terra (uma região só)', () => {
    const s = start('normal');
    const beach = componentAt(s.map, POINTS.beach[0], POINTS.beach[1] - 3);
    expect(beach).toBeGreaterThanOrEqual(0);
    const near = (x: number, y: number) => { for (let r = 0; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const c = componentAt(s.map, x + dx, y + dy); if (c >= 0) return c; } return -1; };
    for (const [name, p] of Object.entries(POINTS)) if (name !== 'beach') expect(near(p[0], p[1]), name).toBe(beach);
  });
});

describe('m4: dificuldades (G3), libertação, segredo e paliativos', () => {
  it('Fácil: a corrente3 cai no 1º segundo (só 2 correntes) sem a vingança; Normal/Difícil: 2ª cidade opcional ou obrigatória', () => {
    const e = start('easy'); seconds(e, 2);
    expect(byTag(e, 'corrente3')).toBeUndefined();
    expect(e.scenario!.fired).toContain('facil'); expect(e.scenario!.fired).not.toContain('corrente3_cai');
    expect(e.scenario!.objectives.correntes).toBe('pending');
    expect([e.scenario!.hidden.cidades, e.scenario!.hidden.cidades_dificil]).toEqual([false, true]);
    const h = start('hard'); seconds(h, 2);
    expect(byTag(h, 'corrente3')).toBeDefined();
    expect([h.scenario!.hidden.cidades, h.scenario!.hidden.cidades_dificil]).toEqual([true, false]);
    const n = start('normal'); seconds(n, 2);
    expect([n.scenario!.hidden.cidades, n.scenario!.hidden.cidades_dificil]).toEqual([false, true]);
  });

  it('libertação: sem as 3 correntes, Prometeu nasce no Rochedo para Argos, o objetivo culto aparece; a Fortaleza caída vence (com a colônia)', () => {
    const s = start('normal'); seconds(s, 2);
    for (const t of ['corrente1', 'corrente2', 'corrente3']) { const b = byTag(s, t); if (b && b.kind === 'building') destroyBuilding(s, b, 0); }
    seconds(s, 2);
    const sc = s.scenario!;
    expect(sc.objectives.correntes).toBe('done'); expect(sc.fired).toContain('libertado'); expect(sc.hidden.culto).toBe(false);
    const prom = [...s.units.values()].filter((u) => u.type === 'prometheus' && !u.dead);
    expect(prom.map((u) => u.owner)).toEqual([0]);
    expect(Math.abs(prom[0].x - POINTS.prometheus[0]) + Math.abs(prom[0].y - POINTS.prometheus[1])).toBeLessThan(6);
    expect(dialogues(s).some((d) => d.includes('Lícaon'))).toBe(true);
    expect(sc.objectives.culto).toBe('pending');
    const f = byTag(s, 'fortaleza_culto'); expect(f?.kind).toBe('building'); if (f?.kind === 'building') destroyBuilding(s, f, 0);
    seconds(s, 2);
    expect(sc.objectives.culto).toBe('done');
    expect(sc.outcome).toBe('playing');   // a colônia (principal) ainda não foi fundada
    placeBuilding(s, 0, 'town_center', 47, 83, true);
    seconds(s, 2);
    expect(sc.outcome).toBe('victory');
  });

  it('segredo: um homem de Argos no Altar de Hefesto cumpre (e revela) hefesto e concede a Abundância', () => {
    const s = start('normal'); seconds(s, 1);
    const v = [...s.units.values()].find((u) => u.owner === 0 && u.type === 'villager')!;
    v.x = v.px = v.tx = POINTS.altar[0] + 0.5; v.y = v.py = v.ty = POINTS.altar[1] + 0.5;
    seconds(s, 2);
    expect(s.scenario!.objectives.hefesto).toBe('done'); expect(s.scenario!.hidden.hefesto).toBe(false);
    expect(s.players[0].minorGods).toContain('hephaestus');
    expect(s.players[0].powers.some((p) => p.id === 'plenty')).toBe(true);
  });

  it('paliativo sem G6: Portal dos Titãs do Culto cai no mesmo segundo; o de Argos também, com o custo devolvido e o aviso da Pítia', () => {
    const s = start('hard'); seconds(s, 1);
    placeBuilding(s, 1, 'titan_gate', 84, 30, false);
    placeBuilding(s, 0, 'titan_gate', 44, 88, false);
    const before = { ...s.players[0].resources };
    seconds(s, 2);
    expect([...s.buildings.values()].filter((b) => b.type === 'titan_gate' && !b.dead)).toEqual([]);
    expect(s.players[0].resources.wood - before.wood).toBeGreaterThanOrEqual(599);
    expect(s.scenario!.fired).toContain('aviso_portal');
  });
});
