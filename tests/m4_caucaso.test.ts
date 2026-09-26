// m4 "O Fogo do Cáucaso" (docs/STORY.md §5.1): o mapa fixo "Garganta do Cáucaso" é reprodutível pelo script
// scripts/maps/m4_caucaso.ts e tem a identidade da ficha (pontos, tags, rotas); as variações de dificuldade (G3), a
// libertação, o segredo de Hefesto, o Portal dos Titãs proibido (G6 forbid) e o nome da Águia (G8) funcionam. O roteiro longo (vitória dentro da
// janela) fica em scripts/missions.ts; a passiva curta, em tests/missions.test.ts.
import { describe, it, expect } from 'vitest';
import { TICK_RATE } from '../src/core/constants';
import { createGame, tick } from '../src/core/sim/game';
import { buildingLimitOk, canPlaceBuilding, placeBuilding } from '../src/core/sim/entities';
import { applyCommand } from '../src/core/sim/commands';
import { entityDisplayName } from '../src/core/scenario/text';
import { setLocale } from '../src/i18n';
import { destroyBuilding, killUnit } from '../src/core/sim/combat';
import { territoryOwnerAt } from '../src/core/sim/territory';
import { setRaidObserver } from '../src/core/scenario/helpers';
import { DialogueQueue, dialogueHoldMs, DIALOGUE_LINGER_MS } from '../src/ui/dialogue';
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
const units = (s: GameState, pred: (u: import('../src/core/types').Unit) => boolean) => [...s.units.values()].filter((u) => !u.dead && pred(u));
const dist = (a: { x: number; y: number }, b: readonly number[]) => Math.sqrt((a.x - b[0]) * (a.x - b[0]) + (a.y - b[1]) * (a.y - b[1]));
/** Derruba as três correntes (como se o exército as tivesse rompido) e roda 2 s: a libertação dispara. */
const breakChains = (s: GameState) => { for (const t of ['corrente1', 'corrente2', 'corrente3']) { const b = byTag(s, t); if (b && b.kind === 'building') destroyBuilding(s, b, 0); } seconds(s, 2); };
const teleport = (u: import('../src/core/types').Unit, x: number, y: number) => { u.x = u.px = u.tx = x; u.y = u.py = u.ty = y; };

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
  it('Fácil: os 5 guardas do platô 3 desertam no 1º segundo (sem Sombras) e as 3 correntes ficam; Normal/Difícil: 2ª cidade opcional ou obrigatória', () => {
    const e = start('easy'); seconds(e, 2);
    expect(byTag(e, 'corrente3')).toBeDefined();   // as três correntes em todas as dificuldades (o ritmo não encurta no Fácil)
    expect(e.scenario!.fired).toContain('facil'); expect(e.scenario!.fired).not.toContain('corrente3_cai');
    const ids = Object.keys(e.scenario!.vars).filter((k) => k.startsWith('#guarda3[')).map((k) => e.scenario!.vars[k]);
    expect(ids.length).toBe(5);
    expect(ids.every((id) => !e.units.get(id) || e.units.get(id)!.dead)).toBe(true);
    expect(units(e, (u) => u.owner === 2 && u.type === 'shade')).toEqual([]);   // kill sem matador: Hades não gera Sombras
    expect(byTag(start('normal'), 'guarda3')).toBeDefined();
    expect(e.scenario!.objectives.correntes).toBe('pending');
    expect([e.scenario!.hidden.cidades, e.scenario!.hidden.cidades_dificil]).toEqual([false, true]);
    const h = start('hard'); seconds(h, 2);
    expect(byTag(h, 'corrente3')).toBeDefined();
    expect([h.scenario!.hidden.cidades, h.scenario!.hidden.cidades_dificil]).toEqual([true, false]);
    const n = start('normal'); seconds(n, 2);
    expect([n.scenario!.hidden.cidades, n.scenario!.hidden.cidades_dificil]).toEqual([false, true]);
  });

  it('libertação: sem as 3 correntes, Prometeu surge para Argos na descida rumo à Fortaleza, o objetivo culto aparece; a Fortaleza caída vence (com a colônia)', () => {
    const s = start('normal'); seconds(s, 2);
    breakChains(s);
    const sc = s.scenario!;
    expect(sc.objectives.correntes).toBe('done'); expect(sc.fired).toContain('libertado'); expect(sc.hidden.culto).toBe(false);
    const prom = [...s.units.values()].filter((u) => u.type === 'prometheus' && !u.dead);
    expect(prom.map((u) => u.owner)).toEqual([0]);
    expect(dist(prom[0], POINTS.freed)).toBeLessThan(4);
    expect(dialogues(s).some((d) => d.includes('Lícaon, o Rei-Lobo'))).toBe(true);
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

  it('G6: Portal dos Titãs proibido para Argos e o Culto (config.forbid); o aviso da Pítia vem quando Argos chega à Idade dos Titãs', () => {
    const s = start('hard'); seconds(s, 1);
    expect(s.config.forbid?.buildings).toEqual(['titan_gate']);
    for (const p of [0, 1]) {
      s.players[p].age = 4;
      expect(buildingLimitOk(s, s.players[p], 'titan_gate')).toEqual({ ok: false, reason: 'Proibido nesta missão' });
      expect(canPlaceBuilding(s, s.players[p], 'titan_gate', 44, 88).ok).toBe(false);
    }
    const v = [...s.units.values()].find((u) => u.owner === 0 && u.type === 'villager')!;
    s.players[0].resources = { food: 9000, wood: 9000, gold: 9000, favor: 900, knowledge: 900 };
    expect(applyCommand(s, { type: 'build', player: 0, ids: [v.id], building: 'titan_gate', tx: 44, ty: 88 })).toEqual({ ok: false, reason: 'Proibido nesta missão' });
    expect(s.players[0].resources.wood).toBe(9000);   // nada foi pago
    expect(s.scenario!.fired).not.toContain('aviso_portal');
    seconds(s, 2);
    expect(s.scenario!.fired).toContain('aviso_portal');   // Idade dos Titãs: a Pítia explica por que o Portal não se ergue
    placeBuilding(s, 1, 'titan_gate', 84, 30, false);      // o roteiro (e o editor) ainda podem pôr um Portal: a trava é só para comandos
    seconds(s, 2);
    expect([...s.buildings.values()].filter((b) => b.type === 'titan_gate' && !b.dead).length).toBe(1);
  });
  it('G8: a Águia é uma mantícora com nome próprio, no idioma atual', () => {
    const s = start('normal');
    const aguia = byTag(s, 'aguia')!;
    expect(aguia.kind === 'unit' && aguia.type).toBe('manticore');
    expect(aguia.displayName).toEqual({ pt: 'Águia do Cáucaso', en: 'Eagle of the Caucasus' });
    expect(entityDisplayName(aguia)).toBe('Águia do Cáucaso');
    setLocale('en'); try { expect(entityDisplayName(aguia)).toBe('Eagle of the Caucasus'); } finally { setLocale('pt'); }
  });
});

describe('m4: correções da revisão (Águia, falas, derrotas, contra-ataques, atrito)', () => {
  it('libertação com a Águia viva: Prometeu surge fora da visão dela, e em 30 s ela segue viva (aguia pendente, sem a fala de Héracles)', () => {
    for (const d of ['normal', 'hard'] as const) {
      const s = start(d); seconds(s, 2);
      breakChains(s);
      const prom = units(s, (u) => u.type === 'prometheus')[0];
      expect(dist(prom, POINTS.eagle), d).toBeGreaterThan(12 + 9);   // visão de Prometeu (12) + da mantícora (9)
      seconds(s, 30);
      const sc = s.scenario!;
      expect(byTag(s, 'aguia'), d).toBeDefined();
      expect(sc.objectives.aguia, d).toBe('pending');
      expect(sc.fired, d).not.toContain('aguia_vista');   // só Héracles a avista (Prometeu é do jogador 0, mas não conta)
    }
  });

  it('Héracles contra a Águia: perto do Rochedo ele a avista, a abate (dano triplo), ganha 100 de favor e comenta', () => {
    const s = start('normal'); seconds(s, 1);
    const h = byTag(s, 'heracles'); const eagle = byTag(s, 'aguia');
    expect(h?.kind).toBe('unit'); expect(eagle?.kind).toBe('unit');
    if (h?.kind !== 'unit' || eagle?.kind !== 'unit') return;
    for (const g of units(s, (u) => u.owner === 2 && u.id !== eagle.id && dist(u, POINTS.corrente3) < 8)) killUnit(s, g, -1);   // só ele e a Águia
    teleport(h, 45.5, 21.5);
    const favor = s.players[0].resources.favor;
    seconds(s, 2);
    expect(s.scenario!.fired).toContain('aguia_vista');
    expect(dialogues(s).some((d) => d.includes('Héracles'))).toBe(true);
    for (let i = 0; i < 40 && !eagle.dead; i++) { if (h.targetId !== eagle.id) tick(s, [{ type: 'attack', player: 0, ids: [h.id], targetId: eagle.id }]); seconds(s, 1); }
    seconds(s, 1);
    expect(eagle.dead).toBe(true); expect(h.dead).toBe(false);
    expect(s.scenario!.objectives.aguia).toBe('done');
    expect(s.scenario!.fired).toEqual(expect.arrayContaining(['aguia_heracles', 'aguia_cai']));
    expect(s.players[0].resources.favor - favor).toBeGreaterThanOrEqual(100);
  });

  it('a Águia abatida longe de Héracles: favor sim, mas sem a fala "Já matei essa águia"', () => {
    const s = start('normal'); seconds(s, 1);
    const eagle = byTag(s, 'aguia'); if (eagle?.kind === 'unit') killUnit(s, eagle, 0);
    seconds(s, 2);
    expect(s.scenario!.objectives.aguia).toBe('done');
    expect(s.scenario!.fired).toContain('aguia_cai'); expect(s.scenario!.fired).not.toContain('aguia_heracles');
  });

  it('Difícil: a Águia renasce ~180 s depois de abatida no Rochedo; depois da libertação, não volta mais', () => {
    const s = start('hard'); seconds(s, 1);
    let eagle = byTag(s, 'aguia'); if (eagle?.kind === 'unit') killUnit(s, eagle, 0);
    seconds(s, 170);
    expect(byTag(s, 'aguia')).toBeUndefined();
    seconds(s, 12);
    eagle = byTag(s, 'aguia');
    expect(eagle?.kind).toBe('unit');
    if (eagle?.kind === 'unit') expect(dist(eagle, POINTS.eagle)).toBeLessThan(3);
    // libertado: abatida outra vez, não renasce
    breakChains(s);
    eagle = byTag(s, 'aguia'); if (eagle?.kind === 'unit') killUnit(s, eagle, 0);
    seconds(s, 200);
    expect(byTag(s, 'aguia')).toBeUndefined();
    expect(start('normal').scenario!.fired).not.toContain('aguia_renasce');
  });

  it('derrotas: Héracles morto; sem CC completo e sem cidadãos (uma fundação não segura a missão); colônia fundada e sem CC completo', () => {
    const a = start('normal'); seconds(a, 1);
    const h = byTag(a, 'heracles'); if (h?.kind === 'unit') killUnit(a, h, 2);
    seconds(a, 2); expect(a.scenario!.outcome).toBe('defeat');
    // fundação de CC na praia e os 5 cidadãos mortos: ninguém pode terminá-la → derrota (antes, a missão ficava presa)
    const b = start('normal'); seconds(b, 1);
    placeBuilding(b, 0, 'town_center', 45, 125, false);
    for (const v of units(b, (u) => u.owner === 0 && u.type === 'villager')) killUnit(b, v, 2);
    seconds(b, 7); expect(b.scenario!.outcome).toBe('defeat');
    // colônia fundada, uma 2ª obra começada e o CC completo destruído → derrota
    const c = start('normal'); seconds(c, 1);
    const tc = placeBuilding(c, 0, 'town_center', 47, 83, true); seconds(c, 2);
    expect(c.scenario!.objectives.colonia).toBe('done');
    placeBuilding(c, 0, 'town_center', 19, 95, false);
    destroyBuilding(c, tc, 2); seconds(c, 2);
    expect(c.scenario!.outcome).toBe('defeat');
  });

  it('contra-ataques contam a partir da colônia: o 1º 300 s depois dela, depois a cada 150 s', () => {
    const s = start('normal'); seconds(s, 100);
    const times: number[] = [];
    setRaidObserver(() => times.push(Math.floor((s.tick + 1) / TICK_RATE)));
    try {
      placeBuilding(s, 0, 'town_center', 47, 83, true); seconds(s, 1);
      expect(s.scenario!.objectives.colonia).toBe('done');
      const founded = Math.floor((s.tick + 1) / TICK_RATE);
      seconds(s, 460);
      expect(times.slice(0, 2).map((t) => t - founded)).toEqual([299, 449]);   // o relógio conta o segundo da fundação
    } finally { setRaidObserver(null); }
  }, 60_000);

  it('atrito: a corrente1 também projeta território dos Guardiões, e o 1º contato (fala da Pítia) vale no platô 1', () => {
    const s = start('normal'); seconds(s, 1);
    expect(territoryOwnerAt(s, 30, 64)).toBe(2);
    const v = units(s, (u) => u.owner === 0 && u.type === 'hypaspist')[0];
    teleport(v, 31.5, 65.5);
    seconds(s, 2);
    expect(s.scenario!.fired).toContain('atrito');
  });

  it('falas do mesmo segundo (libertação: Prometeu, Zeus, Lícaon) passam pela fila do HUD uma de cada vez, na ordem, sem se perder', () => {
    const s = start('normal'); seconds(s, 2);
    const before = s.events.length;
    breakChains(s);
    const lines = s.events.slice(before).filter((e) => e.type === 'dialogue');
    const sameTick = lines.filter((e) => e.tick === lines[0].tick);
    expect(sameTick.length).toBeGreaterThanOrEqual(3);   // várias falas no mesmo tick: sem fila, só a última ficava na tela
    const q = new DialogueQueue();
    for (const e of sameTick) q.push({ meta: e.data ?? '', text: e.text ?? '' }, 0);
    const shown: { text: string; at: number }[] = [{ text: q.current!.text, at: 0 }];
    let hiddenAt = -1;
    for (let now = 0; now <= 120_000 && hiddenAt < 0; now += 100) if (q.update(now)) { if (q.current) shown.push({ text: q.current.text, at: now }); else hiddenAt = now; }
    expect(shown.map((x) => x.text)).toEqual(sameTick.map((e) => e.text));
    for (let i = 1; i < shown.length; i++) expect(shown[i].at - shown[i - 1].at).toBeGreaterThanOrEqual(dialogueHoldMs(shown[i - 1].text));
    expect(hiddenAt - shown[shown.length - 1].at).toBeGreaterThanOrEqual(DIALOGUE_LINGER_MS);
    // clique passa adiante; fila vazia esconde
    const k = new DialogueQueue(); k.push({ meta: 'a', text: '1' }, 0); k.push({ meta: 'b', text: '2' }, 0);
    expect(k.next(10)?.text).toBe('2'); expect(k.next(20)).toBeNull(); expect(k.current).toBeNull();
  });
});
