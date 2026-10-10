// Etapa 7 do visual (docs/ART.md §1.10, §5 e Apêndice H): ícones do HUD e glifos no lugar dos emoji.
import { describe, it, expect } from 'vitest';
import { buildingArtType, unitArtType } from '../src/render/art/alias';
import fs from 'node:fs';
import path from 'node:path';
import { UNITS, TECHS, POWERS, MAJOR_GODS, MINOR_GODS, AGES, ABILITIES, BUILDINGS } from '../src/core/data';
import { RESOURCES } from '../src/core/constants';
import { hudNames, techIconKey, TECH_ICONS } from '../scripts/bake/hud/catalog.mjs';
import { runCheck } from '../scripts/bake/check';
import { GLYPHS } from '../src/ui/glyphs';
import { noEmoji } from '../src/ui/html';
import { techIconName, MISSION_ICONS } from '../src/ui/icons';
import { EMOJI_GLYPHS } from '../src/ui/emoji';
import { CAMPAIGN } from '../src/core/scenario/campaign';

const ROOT = path.resolve(__dirname, '..');
const manifests = fs.readdirSync(path.join(ROOT, 'art/manifest')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'art/manifest', f), 'utf8')) as { id: string; kind: string; icon?: unknown });
const unitIds = manifests.filter((m) => m.kind === 'unit').map((m) => m.id);
const buildingIds = manifests.filter((m) => m.kind === 'building' && m.icon).map((m) => m.id);
const names = new Set(hudNames(unitIds, buildingIds));

describe('atlas hud: todo conteúdo do jogo tem ícone no catálogo', () => {
  it('unidades, edifícios, tecnologias, poderes, deuses, Idades, habilidades e recursos', () => {
    const missing: string[] = [];
    for (const id of Object.keys(UNITS)) if (!names.has(`unit/${unitArtType(id)}`)) missing.push(`unit/${id}`);
    for (const [id, b] of Object.entries(BUILDINGS)) if (!b.notBuildable && !names.has(`bld/${buildingArtType(id)}`)) missing.push(`bld/${id}`);
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
    for (const f of ['src/ui/hud.ts', 'src/ui/scenario-hud.ts', 'src/ui/icons.ts', 'src/ui/glyphs.ts', 'src/ui/studytree.ts']) {
      const hits = code(f).split('\n').filter((l) => EMOJI.test(l) && !/tipHtml|⏱|👥/.test(l));
      expect(hits, f).toEqual([]);
    }
    // toasts do laço principal: conquista e chat sem emoji
    const main = code('src/main.ts').split('\n').filter((l) => /hud\.toast\(/.test(l) && EMOJI.test(l));
    expect(main).toEqual([]);
  });
  it('todo glifo pedido pelo HUD existe', () => {
    const used = new Set<string>();
    for (const f of ['src/ui/hud.ts', 'src/ui/scenario-hud.ts', 'src/ui/studytree.ts']) for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/glyph\('([A-Za-z]+)'/g)) used.add(m[1]);
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

describe('menu, lobby e editor sem emoji (Etapa 8)', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]/u;
  const EMOJI_G = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]/gu;
  const code = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  it('o código do menu, do editor e do controle não escreve emoji (os ícones de cenário nos modelos do editor são dado)', () => {
    for (const f of ['src/ui/menu.ts', 'src/editor/panel.ts', 'src/ui/gamepad.ts', 'src/ui/options.ts', 'src/ui/credits.ts', 'src/ui/era-select.ts']) {
      const hits = code(f).split('\n').filter((l) => EMOJI.test(l) && !/icon: '[^']+'/.test(l));
      expect(hits, f).toEqual([]);
    }
  });
  it('todo emoji dos textos da interface tem glifo (nenhum some sem substituto no menu e nos modais)', () => {
    const strings = fs.readFileSync(path.join(ROOT, 'src/i18n/strings.ts'), 'utf8');
    const used = new Set([...strings.matchAll(EMOJI_G)].map((m) => m[0]));
    expect([...used].filter((e) => !EMOJI_GLYPHS[e])).toEqual([]);
  });
  it('o destino de cada emoji existe (glifo desenhado ou ícone do atlas hud)', () => {
    const bad = Object.entries(EMOJI_GLYPHS).filter(([, v]) => (v.startsWith('@') ? !names.has(v.slice(1)) : !GLYPHS.includes(v)));
    expect(bad).toEqual([]);
    // glifos pedidos direto pelo menu, editor, controle e objetivos
    const want = new Set<string>();
    for (const f of ['src/ui/menu.ts', 'src/editor/panel.ts', 'src/ui/gamepad.ts', 'src/ui/icons.ts']) for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/glyph\('([A-Za-z]+)'/g)) want.add(m[1]);
    for (const m of fs.readFileSync(path.join(ROOT, 'src/editor/panel.ts'), 'utf8').matchAll(/icon: '([a-z]+)' \}/g)) want.add(m[1]);
    expect([...want].filter((g) => !GLYPHS.includes(g))).toEqual([]);
  });
  it('cada missão da campanha (e a Horda) tem ícone escolhido, e ele existe no atlas', () => {
    for (const e of CAMPAIGN) expect(MISSION_ICONS[e.id], e.id).toBeTruthy();
    expect(MISSION_ICONS.horde).toBeTruthy();
    expect(Object.values(MISSION_ICONS).filter((n) => !names.has(n))).toEqual([]);
  });
});
