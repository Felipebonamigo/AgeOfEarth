// Planilha de revisão PT/EN (E9): o que é novo ou mudou desde a base docs/eras/E9-base-textos.json (commit 00a3809),
// lado a lado, para leitura humana. Uso: npx tsx scripts/i18n-review.ts [saída=docs/eras/textos-pt-en.md]
import fs from 'node:fs';
import { STRINGS } from '../src/i18n/strings';
import * as EN from '../src/i18n/en-data';
import { ABILITIES, AGES, BUILDINGS, LINES, MAJOR_GODS, MINOR_GODS, POWERS, TECHS, UNITS } from '../src/core/data';
const base = JSON.parse(fs.readFileSync('docs/eras/E9-base-textos.json', 'utf8')) as { strings: Record<string, string>; data: Record<string, string>; missions: string[] };
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
const dataText = (o: { name?: string; plural?: string; desc?: string; title?: string; perks?: string[] }) => `${o.name ?? ''}|${o.plural ?? ''}|${o.desc ?? ''}|${o.title ?? ''}|${(o.perks ?? []).join('|')}`;
const cell = (s: string | undefined) => (s ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const out: string[] = ['# Textos PT/EN novos ou mudados desde a base (gerado por scripts/i18n-review.ts; não edite à mão)', ''];
const sec = (title: string, rows: string[]) => { if (!rows.length) return; out.push(`## ${title} (${rows.length})`, '', '| id | PT | EN |', '|---|---|---|', ...rows, ''); };
sec('Textos de interface', Object.entries(STRINGS.pt).filter(([k, v]) => base.strings[k] !== fnv(v)).map(([k, v]) => `| \`${k}\` | ${cell(v)} | ${cell((STRINGS.en as Record<string, string>)[k])} |`));
const tables: [string, Record<string, object>, Record<string, object>][] = [['unit', UNITS, EN.EN_UNITS], ['building', BUILDINGS, EN.EN_BUILDINGS], ['tech', TECHS, EN.EN_TECHS], ['power', POWERS, EN.EN_POWERS], ['minor', MINOR_GODS, EN.EN_MINOR_GODS], ['major', MAJOR_GODS, EN.EN_MAJOR_GODS], ['ability', ABILITIES, EN.EN_ABILITIES]];
for (const [tb, pt, en] of tables) sec(`Dados: ${tb}`, Object.entries(pt).filter(([id, o]) => base.data[`${tb}.${id}`] !== fnv(dataText(o as never))).map(([id, o]) => { const p = o as Record<string, string>, e = (en[id] ?? {}) as Record<string, string>; return `| \`${id}\` | **${cell(p.name)}**${p.plural ? ` / ${cell(p.plural)}` : ''} — ${cell(p.desc)} | **${cell(e.name)}**${e.plural ? ` / ${cell(e.plural)}` : ''} — ${cell(e.desc)} |`; }));
sec('Linhas', Object.values(LINES).map((l) => `| \`${l.id}\` | ${cell(l.name)} | ${cell((EN as unknown as { EN_LINES?: Record<string, { name?: string }> }).EN_LINES?.[l.id]?.name)} |`));
sec('Eras', AGES.map((a, i) => ({ a, i })).filter(({ a, i }) => base.data[`age.${i}`] !== fnv(`${a.name}|${a.short}|${a.desc}`)).map(({ a, i }) => { const e = (EN.EN_AGES as Record<string, { name?: string; short?: string; desc?: string }>)[String(i)] ?? {}; return `| ${i} | **${cell(a.name)}** (${cell(a.short)}) — ${cell(a.desc)} | **${cell(e.name)}** (${cell(e.short)}) — ${cell(e.desc)} |`; }));
const mis: string[] = []; const seen = new Set(base.missions);
const walk = (o: unknown, f: string) => { if (!o || typeof o !== 'object') return; const r = o as Record<string, unknown>; if (typeof r.pt === 'string' && typeof r.en === 'string' && !seen.has(fnv(r.pt))) mis.push(`| ${f} | ${cell(r.pt)} | ${cell(r.en)} |`); for (const [k, v] of Object.entries(r)) if (k !== 'map') walk(v, f); };
for (const f of fs.readdirSync('src/core/scenario/missions').sort()) walk(JSON.parse(fs.readFileSync(`src/core/scenario/missions/${f}`, 'utf8')), f);
sec('Missões (JSON)', mis);
const file = process.argv[2] ?? 'docs/eras/textos-pt-en.md';
fs.writeFileSync(file, out.join('\n'));
console.log(`${file}: ${out.filter((l) => l.startsWith('| ') && !l.startsWith('| id')).length} linhas`);
