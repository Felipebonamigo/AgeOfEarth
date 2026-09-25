import { describe, it, expect } from 'vitest';
import { AGES, BUILDINGS, BUILD_MENU, MAJOR_GODS, MINOR_GODS, POWERS, TECHS, UNITS } from '../src/core/data';
import { BUILTIN_MAPS } from '../src/core/data/maps';
import { validateMap, mapHash, canonicalize, startResourcesOf, blankMap, base64ToBytes, bytesToBase64 } from '../src/core/map/fixed';
import { TERRAIN } from '../src/core/constants';
import { checkMap } from '../src/core/map/check';
import { EDITOR_KEYS, TOOL_KEYS, TERRAIN_KEYS } from '../src/editor/editor';
import { buildEstreito } from '../scripts/maps/estreito';
import { buildEgeu } from '../scripts/maps/egeu';
import { MIN_ROUTE_CUT, routeReport } from '../scripts/maps/lib';

describe('integridade dos dados', () => {
  it('unidades referenciam edifícios que as treinam', () => {
    for (const u of Object.values(UNITS)) {
      if (!u.building) continue;
      expect(BUILDINGS[u.building], `edifício ${u.building} de ${u.id}`).toBeDefined();
      expect(BUILDINGS[u.building].trains, `trains de ${u.building}`).toContain(u.id);
    }
    for (const b of Object.values(BUILDINGS)) for (const t of b.trains ?? []) expect(UNITS[t], `unidade ${t} em ${b.id}`).toBeDefined();
  });
  it('tecnologias têm edifício, pré-requisitos e efeitos válidos', () => {
    const stats = new Set(['hp', 'attack', 'speed', 'range', 'los', 'armor.hack', 'armor.pierce', 'armor.crush']);
    for (const t of Object.values(TECHS)) {
      expect(BUILDINGS[t.building], `edifício ${t.building} de ${t.id}`).toBeDefined();
      for (const p of t.prereq) expect(TECHS[p], `prereq ${p} de ${t.id}`).toBeDefined();
      for (const e of t.effects) {
        if (e.type === 'unit') expect(stats.has(e.stat), `stat ${e.stat} em ${t.id}`).toBe(true);
        if (e.type === 'building') expect(['hp', 'attack', 'range', 'los'].includes(e.stat), `stat ${e.stat} em ${t.id}`).toBe(true);
      }
      if (t.god) expect(MINOR_GODS[t.god] ?? MAJOR_GODS[t.god], `deus ${t.god} de ${t.id}`).toBeDefined();
    }
  });
  it('deuses referenciam poderes, criaturas e tecnologias existentes', () => {
    for (const g of Object.values(MINOR_GODS)) {
      expect(POWERS[g.power]).toBeDefined();
      expect(UNITS[g.mythUnit]).toBeDefined();
      expect(UNITS[g.mythUnit].god).toBe(g.id);
      for (const t of g.techs) { expect(TECHS[t]).toBeDefined(); expect(TECHS[t].god).toBe(g.id); }
    }
    for (const g of Object.values(MAJOR_GODS)) {
      expect(POWERS[g.power]).toBeDefined();
      expect(UNITS[g.titan]).toBeDefined();
      expect(g.minorGods.length).toBe(3);
      g.minorGods.forEach((pair, i) => { for (const m of pair) { expect(MINOR_GODS[m]).toBeDefined(); expect(MINOR_GODS[m].age).toBe(i + 1); } });
      if (g.mythUnit) expect(UNITS[g.mythUnit]).toBeDefined();
    }
    // toda criatura mítica com deus tem alguém que a desbloqueia
    for (const u of Object.values(UNITS)) if (u.god) expect(MINOR_GODS[u.god] ?? MAJOR_GODS[u.god], `deus ${u.god} de ${u.id}`).toBeDefined();
  });
  it('menu de construção e idades são consistentes', () => {
    for (const b of BUILD_MENU) expect(BUILDINGS[b]).toBeDefined();
    const hotkeys = new Map<string, string[]>();
    for (const b of BUILD_MENU) { const hk = BUILDINGS[b].hotkey!; hotkeys.set(hk, [...(hotkeys.get(hk) ?? []), b]); }
    for (const [hk, list] of hotkeys) if (list.length > 1) expect(list.every((x) => x.startsWith('wonder_')), `atalho ${hk} duplicado: ${list}`).toBe(true);
    // editor de mapas: uma tecla por ação, sem A (atacar-mover), R (ponto de encontro), U (liberar) nem W/S/D (câmera)
    const edKeys = [...Object.keys(TOOL_KEYS), ...Object.keys(EDITOR_KEYS), ...Object.keys(TERRAIN_KEYS)];
    expect(new Set(edKeys).size, `atalhos do editor repetidos: ${edKeys}`).toBe(edKeys.length);
    for (const k of ['A', 'R', 'U', 'W', 'S', 'D']) expect(edKeys, `atalho ${k} no editor`).not.toContain(k);
    expect(hotkeys.has('A'), 'A é atacar-mover: nenhum edifício pode usá-lo').toBe(false);
    expect(AGES.length).toBe(5);
    for (const a of AGES) if (a.requires.building) expect(BUILDINGS[a.requires.building]).toBeDefined();
    // atalhos de treino únicos por edifício
    for (const b of Object.values(BUILDINGS)) {
      const seen = new Set<string>();
      for (const t of b.trains ?? []) { const hk = UNITS[t].hotkey; if (!hk) continue; expect(hk === 'R' || hk === 'U', `atalho ${hk} de ${t} colide com ponto de encontro (R) / liberar (U)`).toBe(false); if (b.scholars) expect(hk, `atalho Q de ${t} colide com filósofo em ${b.id}`).not.toBe('Q'); if (UNITS[t].god) continue; expect(seen.has(hk), `atalho ${hk} duplicado em ${b.id}`).toBe(false); seen.add(hk); }
    }
  });
});

describe('mapas embutidos', () => {
  it('cada mapa embutido tem id igual à chave, nomes PT/EN, passa na validação sem erros e já está canônico', () => {
    for (const [key, m] of Object.entries(BUILTIN_MAPS)) {
      expect(m.id, key).toBe(key);
      expect(m.name, key).toBeTruthy(); expect(m.nameEn, key).toBeTruthy();
      const issues = validateMap(m, { players: m.starts.length, mode: 'conquest', ai: m.starts.map(() => true) });
      expect(issues.filter((i) => i.level === 'error'), `${key}: ${JSON.stringify(issues.filter((i) => i.level === 'error').slice(0, 3))}`).toEqual([]);
      for (const e of m.entities ?? []) expect(e.kind === 'building' ? BUILDINGS[e.type] : UNITS[e.type], `${key}: entidade ${e.type}`).toBeTruthy();
      expect(mapHash(canonicalize(m)), key).toBe(mapHash(m));
      expect(canonicalize(m), `${key}: o arquivo deve estar na forma canônica`).toEqual(m);
    }
  });
  it('mapcheck (src/core/map/check.ts): sem erros e 2 min de IA x IA sem IA parada nem partida encerrada em cada embutido', () => {
    for (const [key, m] of Object.entries(BUILTIN_MAPS)) {
      const r = checkMap(m, { minutes: 2 });
      expect(r.failures, `${key}: ${r.failures.join('; ')}`).toEqual([]);
      expect(r.errors, key).toBe(0);
      expect(r.players.length, key).toBe(m.starts.length);
      for (const p of r.players) { expect(p.trained, `${key}: ${p.name}`).toBeGreaterThan(0); expect(p.built, `${key}: ${p.name}`).toBeGreaterThan(0); }
    }
  });
  it('mapas oficiais: sem avisos, recursos idênticos por início (raio 16) e times sugeridos coerentes', () => {
    for (const [key, m] of Object.entries(BUILTIN_MAPS)) {
      expect(validateMap(m, { players: m.starts.length, mode: 'conquest', ai: m.starts.map(() => true) }), key).toEqual([]);
      const res = startResourcesOf(m);
      for (const r of res) expect(r, `${key}: ${JSON.stringify(res)}`).toEqual(res[0]);
      expect(res[0].food, key).toBeGreaterThan(2000); expect(res[0].wood, key).toBeGreaterThan(8000); expect(res[0].gold, key).toBeGreaterThan(5000);
      if (m.startTeams) { expect(m.startTeams.length, key).toBe(m.starts.length); expect(new Set(m.startTeams).size, key).toBeGreaterThan(1); }
    }
    expect(BUILTIN_MAPS.estreito.starts.length).toBe(2); expect([BUILTIN_MAPS.estreito.w, BUILTIN_MAPS.estreito.h]).toEqual([80, 80]);
    expect(BUILTIN_MAPS.egeu.starts.length).toBe(4); expect([BUILTIN_MAPS.egeu.w, BUILTIN_MAPS.egeu.h]).toEqual([113, 113]);   // lado ímpar: colina no centro exato
    expect(BUILTIN_MAPS.egeu.startTeams).toEqual([0, 0, 1, 1]);
    for (const m of Object.values(BUILTIN_MAPS)) expect(m.relics, m.id).toBe(false);   // relíquias sorteadas quebrariam a simetria
  });
  it('mapas oficiais são reprodutíveis: scripts/maps/<id>.ts gera exatamente o arquivo embutido, com rotas largas', () => {
    const est = buildEstreito(), eg = buildEgeu();
    expect(est.file).toEqual(BUILTIN_MAPS.estreito);
    expect(eg.file).toEqual(BUILTIN_MAPS.egeu);
    // finish() recusa rota estreita ou selável; aqui só se confere que cada rota foi medida
    expect(est.routes.map((r) => r.route)).toEqual(['central', 'noroeste', 'sudeste']);
    expect(eg.routes.length).toBe(9);
    for (const r of [...est.routes, ...eg.routes]) { expect(r.cut.length, r.route).toBeGreaterThanOrEqual(MIN_ROUTE_CUT); expect(r.seals, r.route).toEqual([]); }
  });
  it('routeReport acha a seção de um vau estreito e os edifícios que o selam', () => {
    // rio vertical em x = 30..33 com um vau de 2 tiles (y = 40..41): uma casa 2×2 sobre o vau sela a rota
    const base = blankMap(80, 80, 2, 1);
    const terr = base64ToBytes(base.terrain, 80 * 80);
    for (let y = 0; y < 80; y++) for (let x = 30; x <= 33; x++) if (y < 40 || y > 41) terr[y * 80 + x] = TERRAIN.WATER;
    const file = { ...base, terrain: bytesToBase64(terr), starts: [[12, 40], [60, 40]] as [number, number][] };
    const [r] = routeReport(file, [{ name: 'vau', zone: () => false }]);
    expect(r.cut.length).toBe(2);
    expect(r.seals.some((s) => s.side === 2 && s.x >= 29 && s.x <= 33 && s.y === 40)).toBe(true);
    expect(r.seals.every((s) => s.x + s.side - 1 >= 29 && s.x <= 34)).toBe(true);   // só sobre o vau ou na boca dele
  });
});
