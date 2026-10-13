// Enciclopédia (E9, docs/eras/E9-E10-interface-balanceamento.md): HTML puro (sem DOM) de cada aba, gerado dos dados —
// unidades, linhas I–VIII, edifícios, maravilhas, tecnologias, deuses, Eras e recursos. Sem emoji: ícones do atlas e glifos.
// O HUD (hud.ts, showEncyclopedia) só monta o modal e liga os cliques; tests/encyclopedia.test.ts lê estas funções.
import { ACADEMY_LINES, AGES, BLESSING_IDS, BUILDINGS, CLASSIC_WONDERS, ERA_TITANS, LINES, LINE_LEVELS, LINE_ORDER, MAJOR_GODS, MINOR_GODS, POWERS, RARES, ROMAN, TECHS, UNITS, evoTechId, lineStart } from '../core/data';
import { NODE_NAMES, NODE_RESOURCE, OIL_FROM_AGE, RARE_SET, RESOURCES, SHIP_NODES, WELL_NODES, WONDER_POINTS_HOLD_SECONDS, WONDER_POINTS_MAX_TARGET } from '../core/constants';
import type { GameState, TechDef, UnitDef } from '../core/types';
import { unitLinesOn } from '../core/sim/lines';
import { allWondersOn, buildingAgeOf } from '../core/sim/restrictions';
import { wonderPoints, wonderPointsTarget, wonderTakenBy, wonderVictoryMode } from '../core/sim/wonders';
import { POWER_TUNING, powerEraOf } from '../core/sim/divine';
import { t } from '../i18n';
import { esc, noEmoji } from './html';
import { ic } from './icons';
import { glyph } from './glyphs';

export type EncTab = 'units' | 'lines' | 'buildings' | 'wonders' | 'techs' | 'gods' | 'ages' | 'resources';
export const ENC_TABS: readonly EncTab[] = ['units', 'lines', 'buildings', 'wonders', 'techs', 'gods', 'ages', 'resources'];
/** Abas com o filtro "Era" (as outras já são organizadas por Era). */
export const ENC_ERA_FILTER: ReadonlySet<EncTab> = new Set<EncTab>(['units', 'buildings', 'wonders', 'techs', 'gods']);
/** era: filtro ('all' ou índice); state/local: a partida aberta (ausentes no menu principal). */
export interface EncCtx { era: number | 'all'; state?: GameState | null; local?: number }

const LABEL: Record<EncTab, string> = { units: 'enc.units', lines: 'enc.lines', buildings: 'enc.buildings', wonders: 'enc.wonders', techs: 'enc.techs', gods: 'enc.gods', ages: 'enc.ages', resources: 'enc.resources' };
const ICON: Record<EncTab, () => string> = {
  units: () => ic.unit('hoplite', undefined, 'sm'), lines: () => glyph('fColumn'), buildings: () => ic.bld('town_center', undefined, 'sm'),
  wonders: () => ic.bld('wonder_zeus', undefined, 'sm'), techs: () => ic.tech('civic1', 'sm'), gods: () => ic.god('zeus', 'sm'),
  ages: () => ic.age(0, 'sm'), resources: () => ic.res('food'),
};
const head = (keys: string[]) => keys.map((k) => esc(noEmoji(t(k))));
const costHtml = (c: Partial<Record<string, number>>): string => Object.entries(c).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `${ic.res(k)} ${v}`).join(' ') || '—';
const era = (n: number) => esc(AGES[Math.max(0, Math.min(AGES.length - 1, n))].short);
const pass = (ctx: EncCtx, age: number) => ctx.era === 'all' || ctx.era === age;
const note = (key: string) => `<p class="enc-note">${t(key)}</p>`;
const note2 = (key: string, vars: Record<string, string | number>) => `<p class="enc-note">${esc(t(key, vars))}</p>`;
const table = (cols: string[], rows: string[]) => (rows.length ? `<table><tr>${cols.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.join('')}</table>` : note('enc.empty'));
/** Era de uma unidade nas linhas (tier) ou a de treino (age). */
const unitEra = (u: UnitDef) => u.tier ?? u.age;
const classic = (ctx: EncCtx) => (ctx.state && !unitLinesOn(ctx.state) ? note('enc.classicNote') : '');

export type UnitGroup = 'lines' | 'ships' | 'heroes' | 'myth' | 'titans' | 'other';
const GROUPS: UnitGroup[] = ['lines', 'ships', 'heroes', 'myth', 'titans', 'other'];
export function unitGroup(u: UnitDef): UnitGroup {
  if (u.tags.includes('titan')) return 'titans';
  if (u.tags.includes('hero')) return 'heroes';
  if (u.tags.includes('myth')) return 'myth';
  if (u.cls === 'ship' || u.naval) return 'ships';
  if (u.line) return 'lines';
  return 'other';
}
function whereOf(u: UnitDef): string {
  const list = u.line && LINES[u.line] ? LINES[u.line].buildings : u.building ? [u.building] : [];
  const names = list.filter((b) => BUILDINGS[b]).map((b) => esc(BUILDINGS[b].name)).join(', ');
  const god = u.god ? ` (${esc((MINOR_GODS[u.god] ?? MAJOR_GODS[u.god])?.name ?? u.god)})` : '';
  return (names || (u.tags.includes('titan') ? esc(BUILDINGS.titan_gate.name) : '—')) + god;
}

function unitsTab(ctx: EncCtx): string {
  const shown = Object.values(UNITS).filter((u) => (u.building || u.line || u.tags.includes('titan')) && pass(ctx, unitEra(u)));
  const order = (u: UnitDef) => (u.line ? LINE_ORDER.indexOf(u.line) : 99);
  const cols = head(['enc.units', 'over.age', 'enc.line', 'enc.cost', 'sel.hp', 'sel.attack', 'sel.armor', 'sel.range', 'sel.speed', 'enc.where', 'enc.description']);
  const body = GROUPS.map((g) => {
    const list = shown.filter((u) => unitGroup(u) === g).sort((a, b) => unitEra(a) - unitEra(b) || order(a) - order(b) || a.id.localeCompare(b.id));
    if (!list.length) return '';
    return `<h3>${t(`enc.group.${g}`)}</h3>` + table(cols, list.map((u) => `<tr><td>${ic.unit(u.id, undefined, 'sm')} ${esc(u.name)}</td><td>${era(unitEra(u))}</td><td>${u.line && LINES[u.line] ? `${esc(LINES[u.line].name)} · ${ROMAN[unitEra(u)]}` : '—'}</td><td>${costHtml(u.cost)}</td><td>${u.hp}</td><td>${u.attack} ${t(`dmg.${u.attackType}`)}</td><td>${Math.round(u.armor.hack * 100)}/${Math.round(u.armor.pierce * 100)}/${Math.round(u.armor.crush * 100)}</td><td>${u.range >= 1.6 ? u.range : t('sel.melee')}</td><td>${u.speed}</td><td>${whereOf(u)}</td><td>${esc(u.desc)}</td></tr>`));
  }).join('');
  return classic(ctx) + (body || note('enc.empty'));
}

function linesTab(ctx: EncCtx): string {
  const cols = [esc(t('enc.line')), ...AGES.map((a, n) => `${ic.age(n, 'sm')} ${esc(a.short)}`)];
  const rows = LINE_ORDER.filter((id) => LINES[id]).map((id) => {
    const l = LINES[id];
    const cells = l.steps.map((s, n) => {
      if (l.retireAt !== undefined && n >= l.retireAt) return `<td class="enc-retired">${t('enc.retired')}</td>`;
      if (n < lineStart(l) || !s) return '<td>·</td>';
      if (n > 0 && l.steps[n - 1] === s) { const study = TECHS[evoTechId(id, n)]; return `<td>${study ? `${ic.tech(study.id, 'sm')} ${esc(study.name)}` : '·'}</td>`; }
      return `<td>${ic.unit(s, undefined, 'sm')} ${esc(UNITS[s]?.name ?? s)}</td>`;
    }).join('');
    return `<tr><td><b>${esc(l.name)}</b></td>${cells}</tr>`;
  });
  return classic(ctx) + `<p>${t('enc.linesIntro')}</p>` + table(cols, rows) + `<p>${t('enc.linesRps')}</p>`;
}

function buildingsTab(ctx: EncCtx): string {
  const list = Object.values(BUILDINGS).filter((b) => !b.notBuildable && !b.wonder && pass(ctx, b.age)).sort((a, b) => a.age - b.age);
  return table(head(['enc.buildings', 'over.age', 'enc.cost', 'sel.hp', 'enc.size', 'enc.description']), list.map((b) => `<tr><td>${ic.bld(b.id, undefined, 'sm')} ${esc(b.name)}</td><td>${era(b.age)}</td><td>${costHtml(b.cost)}</td><td>${b.hp}</td><td>${b.w}×${b.h}</td><td>${esc(b.desc)}</td></tr>`));
}

function wondersTab(ctx: EncCtx): string {
  const s = ctx.state ?? null;
  const modern = !s || allWondersOn(s.config);
  const ageOf = (id: string) => (s ? buildingAgeOf(s.config, id) : BUILDINGS[id].age);
  const list = Object.values(BUILDINGS).filter((b) => b.wonder && (modern || CLASSIC_WONDERS.includes(b.id)) && pass(ctx, ageOf(b.id))).sort((a, b) => ageOf(a.id) - ageOf(b.id));
  const owner = (id: string) => { if (!s) return '—'; const b = wonderTakenBy(s, id); return b ? esc(s.players[b.owner]?.name ?? '?') : t('enc.free'); };
  const mode = s ? wonderVictoryMode(s.config) : 'points';   // numa partida com "manter por 6 min" ou sem vitória por maravilha, diga qual vale
  const rule = modern ? `<p>${t('enc.wondersRule', { target: s ? wonderPointsTarget(s) : WONDER_POINTS_MAX_TARGET, hold: WONDER_POINTS_HOLD_SECONDS })}</p>${mode !== 'points' ? note2('enc.matchRule', { rule: t(`wv.${mode}`) }) : ''}` : note('enc.classicWonders');
  return rule + table(head(['enc.wonders', 'over.age', 'enc.points', 'enc.cost', 'enc.effect', 'enc.owner']), list.map((b) => `<tr><td>${ic.bld(b.id, undefined, 'sm')} ${esc(b.name)}</td><td>${era(ageOf(b.id))}</td><td>${wonderPoints(b.id)}</td><td>${costHtml(b.cost)}</td><td>${esc(b.desc)}</td><td>${owner(b.id)}</td></tr>`));
}

function techsTab(ctx: EncCtx): string {
  const isLine = (x: TechDef) => !!x.line && ACADEMY_LINES.includes(x.line);
  const lineRows = ACADEMY_LINES.map((l) => {
    const levels = Array.from({ length: LINE_LEVELS }, (_, i) => TECHS[`${l}${i + 1}`]).filter((x): x is TechDef => !!x && pass(ctx, x.age));
    if (!levels.length) return '';
    return `<tr><td>${ic.tech(`${l}1`, 'sm')} ${t(`line.${l}`)}</td><td>${levels.map((x) => `${ROMAN[(x.level ?? 1) - 1]} (${era(x.age)}): ${costHtml(x.cost)}`).join('<br>')}</td><td>${esc(levels[0].desc)}</td></tr>`;
  }).filter(Boolean);
  const lib = lineRows.length ? `<h3>${ic.bld('academy', undefined, 'sm')} ${t('enc.lineStudies')}</h3>` + table(head(['enc.line', 'enc.levels', 'enc.effect']), lineRows) : '';
  const byB = new Map<string, TechDef[]>();
  for (const x of Object.values(TECHS)) {
    if (isLine(x) || x.evolve || x.blessing || !pass(ctx, x.age)) continue;
    const a = byB.get(x.building) ?? []; a.push(x); byB.set(x.building, a);
  }
  const cols = head(['modal.tech', 'over.age', 'enc.cost', 'enc.effect']);
  const sections = Object.keys(BUILDINGS).filter((b) => byB.has(b)).map((b) => `<h3>${ic.bld(b, undefined, 'sm')} ${esc(BUILDINGS[b].name)}</h3>` + table(cols, byB.get(b)!.sort((p, q) => p.age - q.age).map((x) => `<tr><td>${ic.tech(x.id, 'sm')} ${esc(x.name)}${x.god ? ` <small>(${esc((MINOR_GODS[x.god] ?? MAJOR_GODS[x.god])?.name ?? x.god)})</small>` : ''}</td><td>${era(x.age)}</td><td>${costHtml(x.cost)}</td><td>${esc(x.desc)}</td></tr>`))).join('');
  return lib + sections + note('enc.evoNote');
}

function godsTab(ctx: EncCtx): string {
  const pick = (m: string) => { const d = MINOR_GODS[m]; if (!d) return esc(m); return `${ic.god(m, 'sm')} <b>${esc(d.name)}</b> · ${ic.power(d.power, 'sm')} ${esc(POWERS[d.power]?.name ?? d.power)} · ${ic.unit(d.mythUnit, undefined, 'sm')} ${esc(UNITS[d.mythUnit]?.name ?? d.mythUnit)}`; };
  const pct = Math.round(POWER_TUNING.eraScale * 100);
  const majors = Object.values(MAJOR_GODS).map((g) => {
    const rows = g.minorGods.map((pair, i) => (pass(ctx, i + 1) ? `<tr><td>${ic.age(i + 1, 'sm')} ${era(i + 1)}</td>${pair.map((m) => `<td>${pick(m)}</td>`).join('')}</tr>` : '')).filter(Boolean);
    const titan = UNITS[g.titan] ? `<p>${ic.unit(g.titan, undefined, 'sm')} ${t('enc.titansNote', { age: esc(AGES[ERA_TITANS].name), titan: esc(UNITS[g.titan].name) })}</p>` : '';
    return `<h3>${ic.god(g.id, 'md')} ${esc(g.name)} — ${esc(g.title)}</h3><p>${esc(g.desc)}</p><ul>${g.perks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
      + (rows.length ? `<h4>${t('enc.minorPairs')}</h4>` + table([esc(noEmoji(t('over.age'))), t('enc.choice', { n: 1 }), t('enc.choice', { n: 2 })], rows) : '') + titan;
  }).join('');
  const minors = Object.values(MINOR_GODS).filter((m) => pass(ctx, m.age)).sort((a, b) => a.age - b.age).map((m) => `<tr><td>${ic.god(m.id, 'sm')} ${esc(m.name)}<br><small>${esc(m.title)}</small></td><td>${era(m.age)}</td><td>${ic.power(m.power, 'sm')} ${esc(POWERS[m.power]?.name ?? m.power)}<br><small>${esc(POWERS[m.power]?.desc ?? '')} ${t('enc.powerScales', { pct, era: esc(AGES[powerEraOf(m.power)]?.name ?? '') })}</small></td><td>${ic.unit(m.mythUnit, undefined, 'sm')} ${esc(UNITS[m.mythUnit]?.name ?? m.mythUnit)}</td><td>${m.techs.map((x) => `${ic.tech(x, 'sm')} ${esc(TECHS[x]?.name ?? x)}`).join('<br>')}</td></tr>`);
  const bless = BLESSING_IDS.map((id) => TECHS[id]).filter((x) => x && pass(ctx, x.age)).map((x) => `<tr><td>${ic.tech(x.id, 'sm')} ${esc(x.name)}</td><td>${era(x.age)}</td><td>${costHtml(x.cost)}</td><td>${esc(x.desc)}</td></tr>`);
  return majors + `<h3>${esc(noEmoji(t('enc.minorGods')))}</h3>` + table(head(['enc.god', 'over.age', 'modal.power', 'modal.creature', 'enc.techs']), minors)
    + `<h3>${t('enc.blessings')}</h3>` + table(head(['modal.tech', 'over.age', 'enc.cost', 'enc.effect']), bless);
}

function agesTab(ctx: EncCtx): string {
  const me = ctx.state && ctx.local !== undefined ? ctx.state.players[ctx.local] : undefined;
  const rows = AGES.map((a, n) => {
    const units = Object.values(UNITS).filter((u) => (u.building || u.line || u.tags.includes('titan')) && unitEra(u) === n).length;
    const blds = Object.values(BUILDINGS).filter((b) => !b.notBuildable && !b.wonder && b.age === n).length;
    const wds = Object.values(BUILDINGS).filter((b) => b.wonder && b.age === n).length;
    const req = [a.requires.building ? esc(BUILDINGS[a.requires.building]?.name ?? a.requires.building) : '', a.requires.techCount ? t('enc.academyLines', { n: a.requires.techCount, lines: ACADEMY_LINES.map((l) => t(`line.${l}`)).join(', ') }) : ''].filter(Boolean).join(' · ') || '—';
    const cur = me?.age === n;
    return `<tr${cur ? ' class="enc-cur"' : ''}><td>${ic.age(n, 'sm')} ${esc(a.name)}${cur ? ` <small>(${t('enc.yourEra')})</small>` : ''}</td><td>${costHtml(a.cost)}</td><td>${req}</td><td>${a.minorGod ? t('enc.yes') : t('enc.no')}</td><td>${t('enc.unlockCount', { u: units, b: blds, w: wds })}</td><td>${esc(a.desc)}</td></tr>`;
  });
  const tree = ctx.state ? `<div class="actions" style="justify-content:flex-start"><button class="btn" id="enc-tree">${glyph('scroll')} ${t('enc.openTree')}</button></div>` : '';
  return table(head(['over.age', 'enc.cost', 'enc.requirements', 'enc.minorGod', 'enc.unlocks', 'enc.description']), rows) + tree;
}

function whoOf(type: string): string {
  if (SHIP_NODES.has(type)) return t('enc.who.boat');        // E4: cardume e atum são do barco de pesca
  if (WELL_NODES.has(type)) return t('enc.who.extractor');
  if (RARE_SET.has(type)) return t('enc.who.merchant');
  return t('enc.who.villager');
}
function sinceOf(type: string): number {
  if (type === 'naphtha') return OIL_FROM_AGE;
  if (WELL_NODES.has(type)) return BUILDINGS.oil_well?.age ?? 6;
  if (SHIP_NODES.has(type)) return BUILDINGS.shipyard?.age ?? 0;
  if (RARE_SET.has(type)) return BUILDINGS.market?.age ?? 1;
  return 0;
}
function resourcesTab(): string {
  const since: Partial<Record<string, number>> = { oil: OIL_FROM_AGE };
  const res = RESOURCES.map((r) => `<tr><td>${ic.res(r)} ${t(`res.${r}`)}</td><td>${t(`enc.res.${r}.src`)}</td><td>${era(since[r] ?? 0)}</td><td>${t(`enc.res.${r}.use`)}</td></tr>`);
  const nodes = Object.keys(NODE_NAMES).filter((n) => n !== 'lure').map((n) => { const r = NODE_RESOURCE[n as keyof typeof NODE_RESOURCE]; return `<tr><td>${t(`node.${n}`)}</td><td>${ic.res(r)} ${t(`res.${r}`)}</td><td>${whoOf(n)}</td><td>${era(sinceOf(n))}</td></tr>`; });
  const rares = Object.keys(RARES).map((id) => `<tr><td>${t(`node.${id}`)}</td><td>${t(`rare.${id}`)}</td></tr>`);
  return table(head(['enc.resources', 'enc.source', 'enc.since', 'enc.use']), res)
    + `<h3>${t('enc.nodes')}</h3>` + table(head(['enc.nodes', 'enc.gives', 'enc.who', 'enc.since']), nodes)
    + `<h3>${t('enc.rares')}</h3>` + table(head(['enc.rares', 'enc.rareBonus']), rares);
}

/** Corpo de uma aba (sem cabeçalho, abas nem botões). */
export function encyclopediaBody(tab: EncTab, ctx: EncCtx): string {
  switch (tab) {
    case 'units': return unitsTab(ctx);
    case 'lines': return linesTab(ctx);
    case 'buildings': return buildingsTab(ctx);
    case 'wonders': return wondersTab(ctx);
    case 'techs': return techsTab(ctx);
    case 'gods': return godsTab(ctx);
    case 'ages': return agesTab(ctx);
    case 'resources': return resourcesTab();
  }
}
/** Modal inteiro: título, abas (`[data-tab]`), filtro `#enc-era`, corpo rolável (`[data-scroll]`) e Fechar (`#m-close`). */
export function encyclopediaHtml(tab: EncTab, ctx: EncCtx): string {
  const tabs = ENC_TABS.map((k) => `<button class="btn ${k === tab ? 'active' : ''}" data-tab="${k}">${ICON[k]()} ${esc(noEmoji(t(LABEL[k])))}</button>`).join('');
  const filter = ENC_ERA_FILTER.has(tab) ? `<label class="enc-filter">${t('enc.eraFilter')} <select id="enc-era"><option value="all"${ctx.era === 'all' ? ' selected' : ''}>${t('enc.allEras')}</option>${AGES.map((a, n) => `<option value="${n}"${ctx.era === n ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>` : '';
  return `<h2>${esc(noEmoji(t('enc.title')))}</h2><div class="tabs">${tabs}</div>${filter}<div data-scroll style="max-height:60vh;overflow:auto">${encyclopediaBody(tab, ctx)}</div><div class="actions"><button class="btn primary" id="m-close">${t('modal.close')}</button></div>`;
}
