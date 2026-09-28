// Etapa 7 do visual (docs/ART.md §1.10, §5 e Apêndice H): ícones do HUD e glifos no lugar dos emoji.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { UNITS, TECHS, POWERS, MAJOR_GODS, MINOR_GODS, AGES, ABILITIES, BUILDINGS } from '../src/core/data';
import { RESOURCES } from '../src/core/constants';
import { hudNames, techIconKey, TECH_ICONS } from '../scripts/bake/hud/catalog.mjs';
import { runCheck } from '../scripts/bake/check';
import { GLYPHS } from '../src/ui/glyphs';
import { noEmoji } from '../src/ui/html';
import { techIconName } from '../src/ui/icons';

const ROOT = path.resolve(__dirname, '..');
const manifests = fs.readdirSync(path.join(ROOT, 'art/manifest')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'art/manifest', f), 'utf8')) as { id: string; kind: string; icon?: unknown });
const unitIds = manifests.filter((m) => m.kind === 'unit').map((m) => m.id);
const buildingIds = manifests.filter((m) => m.kind === 'building' && m.icon).map((m) => m.id);
const names = new Set(hudNames(unitIds, buildingIds));

describe('atlas hud: todo conteúdo do jogo tem ícone no catálogo', () => {
  it('unidades, edifícios, tecnologias, poderes, deuses, Idades, habilidades e recursos', () => {
    const missing: string[] = [];
    for (const id of Object.keys(UNITS)) if (!names.has(`unit/${id}`)) missing.push(`unit/${id}`);
    for (const [id, b] of Object.entries(BUILDINGS)) if (!b.notBuildable && !names.has(`bld/${id}`)) missing.push(`bld/${id}`);
    for (const id of Object.keys(TECHS)) if (!names.has(`tech/${techIconKey(id)}`)) missing.push(`tech/${id}`);
    for (const id of Object.keys(POWERS)) if (!names.has(`power/${id}`)) missing.push(`power/${id}`);
    for (const id of [...Object.keys(MAJOR_GODS), ...Object.keys(MINOR_GODS)]) if (!names.has(`god/${id}`)) missing.push(`god/${id}`);
    AGES.forEach((_, n) => { if (!names.has(`age/${n}`)) missing.push(`age/${n}`); });
    for (const id of Object.keys(ABILITIES)) if (!names.has(`ability/${id}`)) missing.push(`ability/${id}`);
    for (const r of RESOURCES) if (!names.has(`res/${r}`)) missing.push(`res/${r}`);
    expect(missing).toEqual([]);
  });
  it('o nome do ícone da tecnologia é o mesmo no gerador e no HUD (níveis usam o ramo)', () => {
    for (const id of Object.keys(TECHS)) expect(techIconName(id)).toBe(`tech/${techIconKey(id)}`);
    expect(techIconKey('civic3')).toBe('civic');
    // o catálogo não tem ícone órfão (tecnologia removida dos dados)
    const techKeys = new Set(Object.keys(TECHS).map(techIconKey));
    expect(Object.keys(TECH_ICONS).filter((k) => !techKeys.has(k))).toEqual([]);
  });
  it('art:check aceita o atlas hud gerado (ícones do índice = catálogo, máscara de time, PNG no orçamento)', () => {
    const r = runCheck(ROOT);
    if (!r.stats.hasArtifacts) return;
    expect(r.errors.filter((e) => e.startsWith('hud'))).toEqual([]);
    expect(r.warnings.filter((w) => w.startsWith('hud'))).toEqual([]);
  });
});

describe('HUD sem emoji (Etapa 7)', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]/u;
  const code = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  it('o código da interface da partida não escreve emoji (só ícones do atlas e glifos)', () => {
    for (const f of ['src/ui/hud.ts', 'src/ui/scenario-hud.ts', 'src/ui/icons.ts', 'src/ui/glyphs.ts']) {
      const hits = code(f).split('\n').filter((l) => EMOJI.test(l) && !/tipHtml|⏱|👥/.test(l));
      expect(hits, f).toEqual([]);
    }
    // toasts do laço principal: conquista e chat sem emoji
    const main = code('src/main.ts').split('\n').filter((l) => /hud\.toast\(/.test(l) && EMOJI.test(l));
    expect(main).toEqual([]);
  });
  it('todo glifo pedido pelo HUD existe', () => {
    const used = new Set<string>();
    for (const f of ['src/ui/hud.ts', 'src/ui/scenario-hud.ts']) for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/glyph\('([A-Za-z]+)'/g)) used.add(m[1]);
    for (const m of fs.readFileSync(path.join(ROOT, 'src/ui/hud.ts'), 'utf8').matchAll(/(?:line|box|column|wedge): '(f[A-Z][a-z]+)'/g)) used.add(m[1]);
    for (const g of ['mute', 'sound', 'aggressive', 'defensive', 'passive', 'check', 'cross', 'box', 'clock', 'people']) used.add(g);
    expect([...used].filter((g) => !GLYPHS.includes(g))).toEqual([]);
  });
  it('noEmoji tira pictográficos, símbolos-ícone, seletor de variação e ZWJ, e mantém o texto', () => {
    expect(noEmoji('☰ Menu')).toBe('Menu');
    expect(noEmoji('Há relíquias 🏺 espalhadas')).toBe('Há relíquias espalhadas');
    expect(noEmoji('🧑‍🏫 Acadêmico')).toBe('Acadêmico');
    expect(noEmoji('<b>⚔️ Unidades</b>')).toBe('<b>Unidades</b>');
    expect(noEmoji('Vida 350/350 · ×1.5 vs edifícios → ok')).toBe('Vida 350/350 · ×1.5 vs edifícios → ok');
  });
});
