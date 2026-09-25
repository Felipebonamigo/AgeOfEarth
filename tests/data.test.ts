import { describe, it, expect } from 'vitest';
import { AGES, BUILDINGS, BUILD_MENU, MAJOR_GODS, MINOR_GODS, POWERS, TECHS, UNITS } from '../src/core/data';
import { BUILTIN_MAPS } from '../src/core/data/maps';
import { validateMap, mapHash, canonicalize } from '../src/core/map/fixed';

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
});
