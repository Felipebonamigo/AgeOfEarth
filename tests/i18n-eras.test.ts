// Revisão dos textos PT/EN da expansão das Eras (E9, docs/eras/E9-E10-interface-balanceamento.md, E9-5): acento do
// português no inglês, números iguais, glossário, cópia do PT, plural, termos proibidos e requisitos das Eras.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ABILITIES, ACADEMY_LINES, AGES, BUILDINGS, LINES, MAJOR_GODS, MINOR_GODS, POWERS, RARES, TECHS, UNITS } from '../src/core/data';
import { GAME_MODES, MAP_TYPES, NODE_NAMES, RESOURCES, WONDER_VICTORIES } from '../src/core/constants';
import * as EN from '../src/i18n/en-data';
import { STRINGS } from '../src/i18n/strings';
import { LOADING_TIPS } from '../src/ui/loading';

const ROOT = path.join(__dirname, '..');
const PT = STRINGS.pt as Record<string, string>, ENS = STRINGS.en as Record<string, string>;
const PT_DIACRITIC = /[ãõçÃÕÇ]/;
/** Números do texto em ordem (sem HTML, {variáveis}, ordinais e separador de milhar; vírgula decimal = ponto). */
function numbersOf(s: string): string {
  return (s.replace(/<[^>]+>/g, ' ').replace(/\{[a-zA-Z]+\}/g, ' ').replace(/\b\d+(?:ª|º|(?:st|nd|rd|th)\b)/g, ' ').replace(/(\d)[   ,](?=\d{3}\b)/g, '$1').match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => x.replace(',', '.')).sort().join(' ');
}
const GLOSSARY: [RegExp, RegExp][] = [
  [/\bEras?\b/, /\bEras?\b/], [/Biblioteca/, /Librar(y|ies)/], [/\bPedra\b/, /Stone/i], [/Petróleo/, /\bOil\b/i],
  [/Maravilha/i, /Wonder/i], [/Estaleiro/, /Shipyard/], [/Caravana/i, /Caravan/i], [/Mercador/, /Merchant/],
  [/\bestudos?\b/i, /stud(y|ies)/i], [/Bênçãos?/, /Blessing/], [/Centros? Cívicos?/, /Town Centers?/], [/Templo/, /Temple/],
  [/Fortaleza/, /Fortress/], [/Conhecimento/, /Knowledge/], [/\bFavor\b/, /Favor/], [/Titã/, /Titan/],   // sem \b depois do "ã": no JS sem a flag u o \b não vê o ã como letra e o singular escaparia
  [/deus(es)? menor(es)?/i, /minor gods?/i],
];
/** Nomes próprios iguais nos dois idiomas (acrescente só nome próprio, com comentário). */
const SAME_NAME_OK = new Set(['unit.medusa', 'tech.ambrosia', 'minor.hermes', 'minor.ares', 'minor.hera', 'major.zeus', 'major.poseidon', 'major.hades', 'unit.evzone', 'unit.empusa', 'unit.talos', 'unit.ceto', 'unit.dromon', 'building.wonder_hagia_sophia']);
type Txt = { name?: string; plural?: string; desc?: string; title?: string; perks?: string[] };
const TABLES: [string, Record<string, Txt>, Record<string, Txt>][] = [
  ['unit', UNITS, EN.EN_UNITS], ['building', BUILDINGS, EN.EN_BUILDINGS], ['tech', TECHS, EN.EN_TECHS], ['power', POWERS, EN.EN_POWERS],
  ['minor', MINOR_GODS, EN.EN_MINOR_GODS], ['major', MAJOR_GODS, EN.EN_MAJOR_GODS], ['ability', ABILITIES, EN.EN_ABILITIES],
];
/** Todos os pares [rótulo, PT, EN] de textos: interface, dados, Eras, linhas e missões. */
function pairs(): [string, string, string][] {
  const out: [string, string, string][] = [];
  for (const [k, v] of Object.entries(PT)) out.push([`str ${k}`, v, ENS[k] ?? '']);
  for (const [tb, pt, en] of TABLES) for (const [id, o] of Object.entries(pt)) {
    const e = en[id] ?? {};
    for (const f of ['name', 'plural', 'desc', 'title'] as const) if (o[f] && e[f]) out.push([`${tb}.${id}.${f}`, o[f]!, e[f]!]);
    (o.perks ?? []).forEach((p, i) => { if (e.perks?.[i]) out.push([`${tb}.${id}.perks.${i}`, p, e.perks[i]]); });
  }
  AGES.forEach((a, i) => { const e = (EN.EN_AGES as Record<string, Txt & { short?: string }>)[String(i)] ?? {}; for (const f of ['name', 'short', 'desc'] as const) if ((a as Txt & { short: string })[f] && e[f]) out.push([`age.${i}.${f}`, (a as unknown as Record<string, string>)[f], e[f]!]); });
  for (const l of Object.values(LINES)) { const e = (EN as unknown as { EN_LINES?: Record<string, Txt> }).EN_LINES?.[l.id]; if (e?.name) out.push([`line.${l.id}`, l.name, e.name]); }
  const dir = path.join(ROOT, 'src/core/scenario/missions');
  const walk = (o: unknown, f: string, p: string) => { if (!o || typeof o !== 'object') return; const r = o as Record<string, unknown>; if (typeof r.pt === 'string' && typeof r.en === 'string') out.push([`${f}${p}`, r.pt, r.en]); for (const [k, v] of Object.entries(r)) if (k !== 'map') walk(v, f, `${p}.${k}`); };
  for (const f of fs.readdirSync(dir)) walk(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), f, '');
  return out;
}

describe('textos PT/EN das Eras (E9)', () => {
  const all = pairs();
  it('nenhum texto em inglês tem acento do português', () => {
    expect(all.filter(([, , en]) => PT_DIACRITIC.test(en)).map(([l, , en]) => `${l}: ${en.slice(0, 60)}`)).toEqual([]);
  });
  it('os números são os mesmos em PT e EN', () => {
    expect(all.filter(([, pt, en]) => numbersOf(pt) !== numbersOf(en)).map(([l, pt, en]) => `${l}: [${numbersOf(pt)}] × [${numbersOf(en)}]`)).toEqual([]);
  });
  it('glossário: o termo PT tem o seu par no EN', () => {
    const bad: string[] = [];
    for (const [l, pt, en] of all) for (const [a, b] of GLOSSARY) if (a.test(pt) && !b.test(en)) bad.push(`${l}: ${a.source} → ${en.slice(0, 60)}`);
    expect(bad).toEqual([]);
  });
  it('descrição EN nunca é cópia do PT; nome igual só para nome próprio', () => {
    const bad: string[] = [];
    for (const [tb, pt, en] of TABLES) for (const [id, o] of Object.entries(pt)) {
      const e = en[id]; if (!e) continue;
      if (o.desc && e.desc === o.desc) bad.push(`${tb}.${id}.desc`);
      if (o.name && e.name === o.name && !SAME_NAME_OK.has(`${tb}.${id}`)) bad.push(`${tb}.${id}.name = ${o.name}`);
    }
    expect(bad).toEqual([]);
  });
  it('plural EN para toda unidade com plural; Eras e linhas completas em EN', () => {
    expect(Object.values(UNITS).filter((u) => u.plural && !(EN.EN_UNITS as Record<string, Txt>)[u.id]?.plural).map((u) => u.id)).toEqual([]);
    AGES.forEach((_, i) => { const e = (EN.EN_AGES as Record<string, Txt & { short?: string }>)[String(i)]; expect(e?.name && e?.short && e?.desc, `EN_AGES ${i}`).toBeTruthy(); });
    const enLines = (EN as unknown as { EN_LINES?: Record<string, Txt> }).EN_LINES ?? {};
    expect(Object.keys(LINES).filter((id) => !enLines[id]?.name)).toEqual([]);
  });
  it('toda tabela tem as suas chaves de texto', () => {
    const need = [
      ...Object.keys(NODE_NAMES).map((n) => `node.${n}`), ...Object.keys(RARES).map((r) => `rare.${r}`), ...MAP_TYPES.map((m) => `maptype.${m}`),
      ...GAME_MODES.map((m) => `mode.${m}`), ...WONDER_VICTORIES.map((v) => `wv.${v}`), ...RESOURCES.flatMap((r) => [`res.${r}`, `enc.res.${r}.src`, `enc.res.${r}.use`]),
      ...ACADEMY_LINES.map((l) => `line.${l}`), ...Array.from({ length: LOADING_TIPS }, (_, i) => `load.tip${i + 1}`),
    ];
    expect(need.filter((k) => !PT[k] || !ENS[k])).toEqual([]);
  });
  it('termos proibidos: Idade/Academia no PT, Age/Academy no EN', () => {
    const bad: string[] = [];
    for (const [l, pt, en] of all) {
      if (/\bIdades?\b/.test(pt.replace(/Idade de (Ouro|Cronos)/g, '')) || /Academia/.test(pt)) bad.push(`PT ${l}: ${pt.slice(0, 60)}`);
      if (/\bAges?\b/.test(en.replace(/Age of (Mythology|Earth|Cronus)|Golden Age/g, '')) || /Academy/.test(en)) bad.push(`EN ${l}: ${en.slice(0, 60)}`);
    }
    expect(bad).toEqual([]);
  });
  it('o número de estudos da descrição de cada Era é o do requisito', () => {
    AGES.forEach((a, i) => {
      const n = a.requires.techCount; if (!n) return;
      expect(a.desc, `AGES[${i}].desc`).toContain(String(n));
      expect((EN.EN_AGES as Record<string, Txt>)[String(i)]?.desc ?? '', `EN_AGES[${i}].desc`).toContain(String(n));
    });
  });
});
