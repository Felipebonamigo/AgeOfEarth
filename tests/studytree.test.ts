// Árvore de estudos da Biblioteca (src/ui/studytree.ts): modelo com as mesmas regras do núcleo, HTML sem emoji e navegável.
import { describe, it, expect } from 'vitest';
import { AGES } from '../src/core/data';
import { applyCommand } from '../src/core/sim/commands';
import { buildingsOf, placeBuilding } from '../src/core/sim/entities';
import { studyNodeDetail, studyTreeHtml, studyTreeKey, studyTreeModel, type StudyNode } from '../src/ui/studytree';
import { setLocale, t } from '../src/i18n';
import { quickGame, run } from './helpers';

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]/u;
const node = (m: ReturnType<typeof studyTreeModel>, id: string): StudyNode => m.rows.flatMap((r) => r.cells.flat()).find((x) => x.id === id)!;
const fc = (c: Record<string, number>) => Object.entries(c).map(([k, v]) => `${k} ${v}`).join(' ');
const RICH = { food: 5000, wood: 5000, gold: 5000, knowledge: 5000, favor: 500 };

describe('árvore de estudos', () => {
  it('sem Biblioteca tudo fica bloqueado com o motivo; com ela, só o que o núcleo permite', () => {
    const s = quickGame();
    const p = s.players[0]; p.resources = { ...p.resources, ...RICH };
    expect(node(studyTreeModel(s, 0), 'civic1').status).toBe('locked');
    expect(node(studyTreeModel(s, 0), 'civic1').reason).toBe(t('tree.noLibrary'));
    const tc = buildingsOf(s, 0)[0];
    placeBuilding(s, 0, 'academy', tc.tx - 5, tc.ty, true);
    const m = studyTreeModel(s, 0);
    expect(node(m, 'civic1').status).toBe('available');
    expect(node(m, 'civic2').status).toBe('locked');
    expect(node(m, 'civic2').reason).toBe(t('err.requiresAge', { age: AGES[1].name }));
    expect(node(m, 'age:1').status).toBe('locked');
    expect(node(m, 'age:1').reason).toContain('Templo');
    placeBuilding(s, 0, 'temple', tc.tx + 5, tc.ty, true);
    expect(node(studyTreeModel(s, 0), 'age:1').status).toBe('available');
  });

  it('estudo em andamento e na fila; a chave muda depois de um comando', () => {
    const s = quickGame();
    const p = s.players[0]; p.resources = { ...p.resources, ...RICH };
    const tc = buildingsOf(s, 0)[0];
    const lib = placeBuilding(s, 0, 'academy', tc.tx - 5, tc.ty, true);
    const k0 = studyTreeKey(s, 0);
    expect(applyCommand(s, { type: 'research', player: 0, buildingId: lib.id, tech: 'civic1' }).ok).toBe(true);
    expect(applyCommand(s, { type: 'research', player: 0, buildingId: lib.id, tech: 'commerce1' }).ok).toBe(true);
    run(s, 2);
    const m = studyTreeModel(s, 0);
    expect(node(m, 'civic1').status).toBe('active');
    expect(node(m, 'commerce1').status).toBe('queued');
    expect(studyTreeKey(s, 0)).not.toBe(k0);
    expect(m.queueUsed).toBe(2);
  });

  it('HTML: 8 colunas de Era, nós navegáveis, sem emoji; EN traduz; leitura apenas marca aria-disabled', () => {
    const s = quickGame();
    const p = s.players[0]; p.resources = { ...p.resources, ...RICH };
    const tc = buildingsOf(s, 0)[0];
    placeBuilding(s, 0, 'academy', tc.tx - 5, tc.ty, true);
    const html = studyTreeHtml(studyTreeModel(s, 0), fc);
    expect((html.match(/class="tree-era/g) ?? []).length).toBe(AGES.length);
    const nodes = (html.match(/<button class="tree-node/g) ?? []).length;
    expect(nodes).toBeGreaterThan(30);
    expect((html.match(/data-nav/g) ?? []).length).toBe(nodes);
    expect((html.match(/data-study=/g) ?? []).length).toBe(nodes);
    expect((html.match(/<button/g) ?? []).length).toBe(nodes + 1);   // + #m-close
    expect(html).not.toMatch(/ disabled/);
    expect(EMOJI.test(html)).toBe(false);
    const ro = studyTreeHtml(studyTreeModel(s, 0, true), fc);
    expect((ro.match(/aria-disabled="true"/g) ?? []).length).toBe((ro.match(/<button class="tree-node/g) ?? []).length);
    try {
      setLocale('en');
      const en = studyTreeHtml(studyTreeModel(s, 0), fc);
      expect(en).toContain('Study tree');
      expect(en).toContain('Civics I');
    } finally { setLocale('pt'); }
    const x = node(studyTreeModel(s, 0), 'civic2');
    expect(studyNodeDetail(x, fc)).toContain('class="why"');
  });
});
