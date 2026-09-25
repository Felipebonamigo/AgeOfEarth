import { describe, it, expect } from 'vitest';
import { AGES, BUILDINGS, MAJOR_GODS, MINOR_GODS, POWERS, TECHS, UNITS } from '../src/core/data';
import { EN_AGES, EN_BUILDINGS, EN_MAJOR_GODS, EN_MINOR_GODS, EN_POWERS, EN_TECHS, EN_UNITS } from '../src/i18n/en-data';
import { STRINGS } from '../src/i18n/strings';
import { setLocale, t, getLocale } from '../src/i18n';

describe('idiomas', () => {
  it('todo conteúdo tem tradução em inglês (nome e descrição)', () => {
    const check = (label: string, data: Record<string, { name: string; desc?: string }>, en: Record<string, { name?: string; desc?: string }>) => {
      for (const id of Object.keys(data)) { expect(en[id], `${label}.${id}`).toBeDefined(); expect(en[id].name, `${label}.${id}.name`).toBeTruthy(); if (data[id].desc) expect(en[id].desc, `${label}.${id}.desc`).toBeTruthy(); }
      for (const id of Object.keys(en)) expect(data[id], `${label}.${id} (sobra na tradução)`).toBeDefined();
    };
    check('unit', UNITS, EN_UNITS); check('building', BUILDINGS, EN_BUILDINGS); check('tech', TECHS, EN_TECHS); check('power', POWERS, EN_POWERS); check('minor', MINOR_GODS, EN_MINOR_GODS); check('major', MAJOR_GODS, EN_MAJOR_GODS);
    AGES.forEach((_, i) => expect(EN_AGES[String(i)]?.name).toBeTruthy());
  });
  it('a tabela de textos EN cobre todas as chaves PT e mantém as variáveis', () => {
    for (const [k, v] of Object.entries(STRINGS.pt)) {
      const e = (STRINGS.en as Record<string, string>)[k];
      expect(e, k).toBeTruthy();
      const vars = (s: string) => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort().join(',');
      expect(vars(e), `variáveis de ${k}`).toBe(vars(v));
    }
  });
  it('trocar o idioma muda os dados e volta ao original', () => {
    const pt = UNITS.hoplite.name;
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(UNITS.hoplite.name).toBe('Hoplite');
    expect(BUILDINGS.town_center.name).toBe('Town Center');
    expect(t('res.food')).toBe('Food');
    expect(t('top.idle', { n: 3 })).toBe('👤 Idle: 3');
    setLocale('pt');
    expect(UNITS.hoplite.name).toBe(pt);
    expect(t('res.food')).toBe('Comida');
  });
});
