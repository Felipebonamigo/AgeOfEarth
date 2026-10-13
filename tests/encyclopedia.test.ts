// Enciclopédia (E9): HTML puro de cada aba, gerado dos dados (src/ui/encyclopedia.ts).
import { describe, it, expect } from 'vitest';
import { AGES, LINE_ORDER, RARES, UNITS } from '../src/core/data';
import { RESOURCES } from '../src/core/constants';
import { ENC_TABS, encyclopediaBody, encyclopediaHtml, unitGroup } from '../src/ui/encyclopedia';
import { setLocale, t } from '../src/i18n';
import { quickGame } from './helpers';

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]/u;
const count = (s: string, needle: string) => s.split(needle).length - 1;
const unitEra = (id: string) => UNITS[id].tier ?? UNITS[id].age;

describe('E9 — enciclopédia', () => {
  it('cada aba: 8 abas no cabeçalho, a ativa marcada, sem emoji nem lixo de formatação', () => {
    for (const tab of ENC_TABS) {
      const h = encyclopediaHtml(tab, { era: 'all' });
      expect(count(h, 'data-tab="')).toBe(8);
      expect(h).toContain(`class="btn active" data-tab="${tab}"`);
      expect(EMOJI.test(h)).toBe(false);
      for (const bad of ['>hack<', '>pierce<', '>crush<', '>divine<', 'undefined', 'NaN', '[object']) expect(h.includes(bad), `${tab}: ${bad}`).toBe(false);
    }
  });
  it('unidades: toda unidade de treino aparece; o filtro de Era esconde as outras', () => {
    const all = encyclopediaBody('units', { era: 'all' });
    for (const u of Object.values(UNITS)) if (u.building || u.line || u.tags.includes('titan')) expect(all, u.id).toContain(u.name);   // o ícone pode ser o do alias (Mercador, Caravana): confere pelo nome
    const e4 = encyclopediaBody('units', { era: 4 });
    for (const u of Object.values(UNITS)) if ((u.building || u.line || u.tags.includes('titan')) && unitEra(u.id) !== 4) expect(e4.includes(`</span> ${u.name}</td>`) || e4.includes(`> ${u.name}</td>`), u.id).toBe(false);
  });
  it('linhas: uma linha por linha de unidade, 8 células de Era', () => {
    const body = encyclopediaBody('lines', { era: 'all' });
    expect(count(body, '<tr>')).toBe(LINE_ORDER.length + 1);
    const rows = body.split('<tr>').slice(2);
    for (const r of rows.slice(0, LINE_ORDER.length)) expect(count(r.split('</tr>')[0], '<td')).toBe(AGES.length + 1);
  });
  it('maravilhas: 20, dono livre e a regra da partida', () => {
    const s = quickGame();
    const body = encyclopediaBody('wonders', { era: 'all', state: s, local: 0 });
    expect(count(body, 'data-ic="bld/wonder_')).toBe(20);
    expect(body).toContain(t('enc.free'));
    s.config.wonderVictory = 'hold';
    expect(encyclopediaBody('wonders', { era: 'all', state: s, local: 0 })).toContain(t('wv.hold'));
  });
  it('recursos: os 7 recursos e os raros', () => {
    const body = encyclopediaBody('resources', { era: 'all' });
    for (const r of RESOURCES) expect(body).toContain(`data-ic="res/${r}"`);
    for (const id of Object.keys(RARES)) expect(body).toContain(t(`rare.${id}`));
  });
  it('Eras: 8 linhas; o botão da árvore e a Era atual só com partida', () => {
    const none = encyclopediaBody('ages', { era: 'all' });
    expect(count(none, 'data-ic="age/')).toBe(AGES.length);
    expect(none.includes('id="enc-tree"')).toBe(false);
    const s = quickGame();
    const body = encyclopediaBody('ages', { era: 'all', state: s, local: 0 });
    expect(body).toContain('id="enc-tree"');
    expect(body).toContain('enc-cur');
  });
  it('unitGroup', () => {
    expect(unitGroup(UNITS.hoplite)).toBe('lines');
    expect(unitGroup(UNITS.heracles)).toBe('heroes');
    expect(unitGroup(UNITS.minotaur)).toBe('myth');
    expect(unitGroup(UNITS.cronus)).toBe('titans');
  });
  it('em inglês: rótulos traduzidos e nenhum acento do português', () => {
    setLocale('en');
    try {
      const h = encyclopediaHtml('units', { era: 'all' });
      for (const w of ['Lines', 'Wonders', 'Resources']) expect(h).toContain(w);
      for (const tab of ENC_TABS) expect(/[ãõç]/.test(encyclopediaBody(tab, { era: 'all' })), tab).toBe(false);
    } finally { setLocale('pt'); }
  });
});
