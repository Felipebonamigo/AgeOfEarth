// Árvore de estudos da Biblioteca (E1/E9, docs/eras/E1-eras-biblioteca.md): modelo e HTML puros (sem DOM), com as MESMAS
// regras do núcleo (canResearch/canAdvanceAge). Colunas = Eras; linhas = avanço de Era, as 4 linhas e outros estudos.
import { ACADEMY_LINES, AGES, BUILDINGS, TECHS } from '../core/data';
import type { Building, GameState, TechDef } from '../core/types';
import { canAdvanceAge, canResearch, queueMaxOf } from '../core/sim/commands';
import { endAgeReason, maxAgeOf } from '../core/sim/restrictions';
import { techCost } from '../core/sim/modifiers';
import { t } from '../i18n';
import { esc } from './html';
import { ic } from './icons';
import { glyph } from './glyphs';

export type StudyStatus = 'done' | 'active' | 'queued' | 'available' | 'locked';
export interface StudyNode { id: string; kind: 'age' | 'tech'; era: number; name: string; desc: string; cost: Record<string, number>; time: number; status: StudyStatus; reason: string; progress: number }
export interface StudyRow { id: string; label: string; cells: StudyNode[][] }   // cells[era]: nós daquela Era
export interface StudyTreeModel { readOnly: boolean; era: number; libraries: number; queueUsed: number; queueMax: number; rows: StudyRow[] }

/** Linha da árvore de uma tecnologia da Biblioteca (gancho da E3: as evoluções ganham linhas próprias aqui). */
export function rowOf(tech: TechDef): string { return tech.line && ACADEMY_LINES.includes(tech.line) ? tech.line : 'other'; }
/** Bibliotecas prontas do jogador pela fila (empate: menor id). */
export function librariesOf(state: GameState, playerId: number): Building[] {
  return [...state.buildings.values()].filter((b) => b.owner === playerId && !b.dead && b.complete && !!BUILDINGS[b.type]?.library).sort((a, b) => a.queue.length - b.queue.length || a.id - b.id);
}
/** Biblioteca que recebe o próximo estudo: a de menor fila com vaga, ou null. */
export function pickLibrary(state: GameState, playerId: number): Building | null { return librariesOf(state, playerId).find((b) => b.queue.length < queueMaxOf(b.type)) ?? null; }

export function studyTreeModel(state: GameState, playerId: number, readOnly = false): StudyTreeModel {
  const p = state.players[playerId];
  const libs = librariesOf(state, playerId);
  const lib = pickLibrary(state, playerId);
  const mine = [...state.buildings.values()].filter((b) => b.owner === playerId && !b.dead);
  /** Item na fila de qualquer edifício do jogador: posição e, se for o 1º, o progresso. */
  const queuedIn = (kind: 'age' | 'tech', id?: string): { at: number; progress: number } | null => {
    for (const b of mine) {
      for (let i = 0; i < b.queue.length; i++) {
        const q = b.queue[i];
        if (q.kind !== kind || (id !== undefined && q.id !== id)) continue;
        return { at: i, progress: i === 0 ? Math.min(1, q.elapsed / Math.max(1e-6, q.total)) : 0 };
      }
    }
    return null;
  };
  const n = AGES.length;
  const blank = (): StudyNode[][] => Array.from({ length: n }, () => []);
  const rows = new Map<string, StudyRow>();
  const row = (id: string, label: string): StudyRow => { let r = rows.get(id); if (!r) { r = { id, label, cells: blank() }; rows.set(id, r); } return r; };

  // Avanço de Era: um nó por Era a partir da II
  const ageRow = row('age', t('tree.row.age'));
  for (let k = 1; k < n; k++) {
    const def = AGES[k];
    const node: StudyNode = { id: `age:${k}`, kind: 'age', era: k, name: def.name, desc: def.desc, cost: { ...(def.cost as Record<string, number>) }, time: def.time, status: 'locked', reason: '', progress: 0 };
    if (p.age >= k) node.status = 'done';
    else if (k === p.age + 1) {
      const q = queuedIn('age');
      if (q) { node.status = q.at === 0 ? 'active' : 'queued'; node.progress = q.progress; }
      else {
        const c = canAdvanceAge(state, p, lib ?? undefined);
        if (c.ok && lib) node.status = 'available';
        else node.reason = c.ok ? t('err.queueFull') : (c.reason ?? '');
      }
    } else node.reason = k > maxAgeOf(state, playerId) ? endAgeReason(state, playerId) : t('err.requiresAge', { age: AGES[k - 1].name });
    ageRow.cells[k].push(node);
  }

  // Linhas fixas na ordem: as 4 linhas e "outros"
  for (const l of ACADEMY_LINES) row(l, t(`line.${l}`));
  row('other', t('tree.row.other'));
  for (const tech of Object.values(TECHS)) {
    if (!BUILDINGS[tech.building]?.library) continue;
    const node: StudyNode = { id: tech.id, kind: 'tech', era: Math.min(n - 1, tech.age), name: tech.name, desc: tech.desc, cost: techCost(p, tech.id), time: tech.time, status: 'locked', reason: '', progress: 0 };
    if (p.techs.includes(tech.id)) node.status = 'done';
    else {
      const q = queuedIn('tech', tech.id);
      if (q) { node.status = q.at === 0 ? 'active' : 'queued'; node.progress = q.progress; }
      else if (!lib) node.reason = libs.length ? t('err.queueFull') : t('tree.noLibrary');
      else {
        const c = canResearch(state, p, lib, tech.id);
        if (c.ok) node.status = 'available'; else node.reason = c.reason ?? '';
      }
    }
    row(rowOf(tech), '').cells[node.era].push(node);
  }
  const order = ['age', ...ACADEMY_LINES, 'other'];
  return {
    readOnly, era: p.age, libraries: libs.length,
    queueUsed: (lib ?? libs[0])?.queue.length ?? 0,
    queueMax: libs[0] ? queueMaxOf(libs[0].type) : queueMaxOf('academy'),
    rows: order.map((id) => rows.get(id)!).filter((r) => r.cells.some((c) => c.length > 0)),
  };
}

/** Muda quando algo visível na árvore muda (idade, estudos, filas, recursos em degraus de 25). */
export function studyTreeKey(state: GameState, playerId: number): string {
  const p = state.players[playerId];
  const q = [...state.buildings.values()].filter((b) => b.owner === playerId && !b.dead && BUILDINGS[b.type]?.library).map((b) => `${b.id}:${b.complete ? 1 : 0}:${b.queue.map((x) => `${x.id}@${Math.floor((x.elapsed / Math.max(1e-6, x.total)) * 20)}`).join(',')}`).join(';');
  return `${p.age}|${p.techs.length}|${q}|${Object.values(p.resources).map((v) => Math.floor(v / 25)).join(',')}`;
}

export function studyTreeHtml(m: StudyTreeModel, _fmtCost?: (c: Record<string, number>) => string): string {
  const head = `<div class="tree-head"><h2>${glyph('scroll')} ${t('tree.title')}</h2><span class="tree-queue">${m.libraries ? t('tree.queue', { n: m.queueUsed, max: m.queueMax }) : t('tree.noLibrary')}</span></div>`;
  const eras = AGES.map((a, k) => `<div class="tree-era${k === m.era ? ' cur' : ''}">${ic.age(k, 'sm')} <b>${esc(a.short)}</b></div>`).join('');
  const body = m.rows.map((r) => {
    const cells = r.cells.map((nodes) => `<div class="tree-cell">${nodes.map((x) => {
      const clickable = x.status === 'available' && !m.readOnly;
      const bar = x.status === 'active' ? `<span class="bar"><i style="width:${Math.round(x.progress * 100)}%"></i></span>` : '';
      return `<button class="tree-node st-${x.status}" data-nav data-study="${esc(x.id)}"${clickable ? '' : ' aria-disabled="true"'}>${x.kind === 'age' ? ic.age(x.era, 'sm') : ic.tech(x.id, 'sm')}<span class="nm">${esc(x.name)}</span>${bar}</button>`;
    }).join('')}</div>`).join('');
    return `<div class="tree-label">${esc(r.label)}</div>${cells}`;
  }).join('');
  const legend = (['done', 'active', 'queued', 'available', 'locked'] as StudyStatus[]).map((s) => `<span class="tree-chip st-${s}">${t(`tree.st.${s}`)}</span>`).join('');
  return `${head}<div class="tree-body"><div class="tree-grid" style="grid-template-columns: 150px repeat(${AGES.length}, minmax(120px, 1fr))"><div class="tree-corner"></div>${eras}${body}</div></div>`
    + `<div class="tree-detail" id="tree-detail">${t('tree.hint')}</div><div class="tree-legend">${legend}</div>`
    + `<div class="actions"><button class="btn primary" id="m-close">${t('modal.close')}</button></div>`;
}

export function studyNodeDetail(x: StudyNode, fmtCost: (c: Record<string, number>) => string): string {
  return `<b>${esc(x.name)}</b> · ${t(`tree.st.${x.status}`)}<div class="cost">${fmtCost(x.cost)} · ${glyph('clock')} ${x.time} s</div><div class="desc">${esc(x.desc)}</div>${x.reason ? `<div class="why">${esc(x.reason)}</div>` : ''}`;
}
