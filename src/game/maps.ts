// Biblioteca local de mapas fixos (localStorage) + mapas embutidos + importar/exportar arquivos .map.json.
// Índice em aoe_maps_v1 ({ id, name, w, h, starts, hash, updatedAt }[]) e um item aoe_map_<id> por mapa.
import { canonicalize, mapHash, migrateMap, validateMap, type FixedMapData, type MapIssue, type ValidateOpts } from '../core/map/fixed';
import { BUILTIN_MAPS } from '../core/data/maps';
import { exportText, importText } from './files';
import { getLocale } from '../i18n';

export interface MapEntry { id: string; name: string; nameEn?: string; w: number; h: number; starts: number; hash: number; updatedAt: number; builtin?: boolean }

const INDEX_KEY = 'aoe_maps_v1';
const itemKey = (id: string) => `aoe_map_${id}`;

function readIndex(): MapEntry[] {
  try { const v = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((e) => e && typeof e.id === 'string') : []; } catch { return []; }
}
function writeIndex(list: MapEntry[]): void { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); }

/** "Vale do Eco" → "vale-do-eco" (só ASCII minúsculo, dígitos e hífen). */
export function slugify(name: string): string {
  const s = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'mapa';
}

export function entryOf(d: FixedMapData, builtin = false, updatedAt = 0): MapEntry {
  return { id: d.id ?? slugify(d.name ?? 'mapa'), name: d.name ?? d.id ?? 'mapa', nameEn: d.nameEn, w: d.w, h: d.h, starts: d.starts.length, hash: mapHash(d), updatedAt, builtin };
}

/** Nome do mapa no idioma atual. */
export function mapName(d: { name?: string; nameEn?: string; id?: string }): string {
  return (getLocale() === 'en' ? d.nameEn ?? d.name : d.name) ?? d.id ?? 'mapa';
}

export function listMaps(): MapEntry[] { return readIndex().sort((a, b) => b.updatedAt - a.updatedAt); }
export function builtinMaps(): MapEntry[] { return Object.values(BUILTIN_MAPS).map((d) => entryOf(d, true)); }
/** Embutidos primeiro, depois os locais (mais recentes primeiro). */
export function allMaps(): MapEntry[] { return [...builtinMaps(), ...listMaps()]; }

export function getMap(id: string): FixedMapData | null {
  if (BUILTIN_MAPS[id]) return BUILTIN_MAPS[id];
  try { const raw = localStorage.getItem(itemKey(id)); if (!raw) return null; return migrateMap(JSON.parse(raw)); } catch { return null; }
}

/** Guarda (ou substitui) um mapa na biblioteca local; devolve a entrada. Lança em cota cheia (QuotaExceededError). */
export function putMap(input: FixedMapData, now = Date.now()): MapEntry {
  const data = canonicalize(input);
  let id = data.id ?? slugify(data.name ?? 'mapa');
  if (BUILTIN_MAPS[id]) id = `${id}-copia`;   // não sobrescreve embutidos
  data.id = id;
  localStorage.setItem(itemKey(id), JSON.stringify(data));
  const entry = entryOf(data, false, now);
  writeIndex([...readIndex().filter((e) => e.id !== id), entry]);
  return entry;
}

export function removeMap(id: string): void {
  try { localStorage.removeItem(itemKey(id)); } catch { /* ignore */ }
  writeIndex(readIndex().filter((e) => e.id !== id));
}

export function duplicateMap(id: string, newName?: string, now = Date.now()): MapEntry | null {
  const src = getMap(id); if (!src) return null;
  const name = newName ?? `${src.name ?? id} (cópia)`;
  const base = slugify(name); let slug = base; let n = 2;
  while (BUILTIN_MAPS[slug] || readIndex().some((e) => e.id === slug)) slug = `${base}-${n++}`;
  return putMap({ ...src, id: slug, name, nameEn: src.nameEn ? `${src.nameEn} (copy)` : undefined }, now);
}

/** Lê um arquivo .map.json: migra, valida e devolve dados + problemas (erros bloqueiam o uso). Lança se o JSON for inválido. */
export function parseMapFile(json: string, opts: ValidateOpts = {}): { data: FixedMapData; issues: MapIssue[] } {
  const data = migrateMap(JSON.parse(json));
  return { data, issues: validateMap(data, opts) };
}
export async function importMapFile(opts: ValidateOpts = {}): Promise<{ data: FixedMapData; issues: MapIssue[] } | null> {
  const json = await importText(); if (!json) return null;
  return parseMapFile(json, opts);
}
export function exportMapFile(data: FixedMapData): Promise<boolean> {
  const c = canonicalize(data);
  return exportText(`${c.id ?? slugify(c.name ?? 'mapa')}.map.json`, JSON.stringify(c));
}

export const hasErrors = (issues: MapIssue[]) => issues.some((i) => i.level === 'error');

/** Jogador i usa map.starts[startOrder[i]]: com startTeams no arquivo, aliados ficam em inícios do mesmo time. Identidade quando não há como casar. */
export function startOrderFor(map: FixedMapData, teams: number[]): number[] | undefined {
  const st = map.startTeams; if (!st || st.length < teams.length) return undefined;
  const free = new Set<number>(); for (let i = 0; i < Math.min(st.length, map.starts.length); i++) free.add(i);
  const order: number[] = [];
  // times na ordem em que aparecem → cada time recebe os inícios marcados com o mesmo rótulo do arquivo (primeiro rótulo livre serve para o primeiro time)
  const label = new Map<number, number>();
  for (const tm of teams) {
    if (!label.has(tm)) { const candidates = [...free].map((i) => st[i]); const used = new Set(label.values()); const pick = candidates.find((l) => !used.has(l)); if (pick === undefined) return undefined; label.set(tm, pick); }
    const want = label.get(tm)!;
    let idx = [...free].find((i) => st[i] === want); if (idx === undefined) idx = [...free][0]; if (idx === undefined) return undefined;
    free.delete(idx); order.push(idx);
  }
  return order;
}
