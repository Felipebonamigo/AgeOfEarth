// Espelho em arquivos do que o jogador guarda no localStorage (ROADMAP 6.4, Steam Cloud).
// No Electron, cada chave da lista fixa abaixo também vive em <userData>/saves/<arquivo>.json (desktop/main.cjs via
// desktop/cloud.cjs), pasta que o Steam Auto-Cloud sincroniza (docs/STEAM.md §4). Grava nos dois; na inicialização,
// `initCloud` compara localStorage × arquivos e restaura o que faltar (ou o que outra máquina mudou pelo Steam Cloud).
// No navegador (sem window.desktop) nada muda: storeSet/storeRemove são localStorage.setItem/removeItem.
import { desktop } from './display';

/** Chaves fixas espelhadas → nome do arquivo (sem .json). Mantenha igual a FIXED em desktop/cloud.cjs (teste em tests/steam.test.ts). */
export const CLOUD_FIXED_KEYS: Readonly<Record<string, string>> = {
  aoe_save_v1: 'save',
  aoe_replay_v1: 'replay',
  aoe_campaign: 'campaign',
  aoe_campaign_diff: 'campaign-difficulty',
  aoe_achievements_v1: 'achievements',
  aoe_gods_played: 'gods-played',
  aoe_settings_v1: 'settings',
  aoe_locale: 'locale',
  aoe_setup: 'skirmish-setup',
  aoe_mp: 'multiplayer',
  aoe_maps_v1: 'maps-index',
  aoe_editor_autosave: 'editor-draft',
  aoe_editor_test: 'editor-test',
};
/**
 * Mapas de "Meus mapas": aoe_map_<id> → map-<id>.json quando o id tem o formato do slugify; ids importados de arquivo com
 * outros caracteres (espaço, acento, maiúscula) ou slugs longos → mapx-<hex do UTF-8>.json, com id de até 120 bytes: o nome
 * fica em até 250 caracteres e o temporário da gravação (`.json.tmp`) em 254, dentro dos 255 do ext4/NTFS. Id maior não é
 * espelhado (fica só no localStorage). Nunca há ponto nem barra no nome.
 */
export const CLOUD_MAP_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const CLOUD_MAP_ID_MAX_BYTES = 120;
const CLOUD_MAP_HEX_RE = /^(?:[0-9a-f]{2}){1,120}$/;
const hexOf = (s: string) => [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
function fromHex(hex: string): string | null {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
}
/** Teto por valor (bytes em UTF-8), igual ao do processo principal; acima disso a chave fica só no localStorage. */
export const CLOUD_MAX_BYTES = 16 * 1024 * 1024;
/** Teto de arquivos na pasta (mapas incluídos), igual ao do processo principal. */
export const CLOUD_MAX_FILES = 300;
/** Carimbos do último conteúdo sincronizado por chave (fica só no localStorage: é o estado desta máquina). */
export const CLOUD_STAMPS_KEY = 'aoe_cloud_sync_v1';
/**
 * Cópia (só no localStorage, fora do espelho) do valor local que a sincronização substituiu ou apagou: `aoe_cloud_prev:<chave>`.
 * Uma por chave (a seguinte sobrescreve); descartável: some sozinha quando falta espaço para gravar algo do jogador.
 */
export const CLOUD_PREV_PREFIX = 'aoe_cloud_prev:';

/** Arquivo do espelho para uma chave do localStorage, ou null se a chave não é espelhada. */
export function cloudFileForKey(key: string): string | null {
  if (Object.prototype.hasOwnProperty.call(CLOUD_FIXED_KEYS, key)) return `${CLOUD_FIXED_KEYS[key]}.json`;
  if (key.startsWith('aoe_map_')) {
    const id = key.slice(8);
    if (CLOUD_MAP_ID_RE.test(id)) return `map-${id}.json`;
    const hex = hexOf(id);
    if (CLOUD_MAP_HEX_RE.test(hex)) return `mapx-${hex}.json`;
  }
  return null;
}
/** Inverso de cloudFileForKey (arquivos fora do padrão → null). */
export function cloudKeyForFile(file: string): string | null {
  for (const [k, f] of Object.entries(CLOUD_FIXED_KEYS)) if (`${f}.json` === file) return k;
  let m = /^map-(.+)\.json$/.exec(file);
  if (m) return CLOUD_MAP_ID_RE.test(m[1]) ? `aoe_map_${m[1]}` : null;
  m = /^mapx-(.+)\.json$/.exec(file);
  if (!m || !CLOUD_MAP_HEX_RE.test(m[1])) return null;
  const id = fromHex(m[1]);
  return id !== null && !CLOUD_MAP_ID_RE.test(id) && hexOf(id) === m[1] ? `aoe_map_${id}` : null;   // forma única: slug nunca vai para mapx-
}
export const isCloudKey = (key: string) => cloudFileForKey(key) !== null;

/** Tamanho em UTF-8 sem alocar (o processo principal mede com Buffer.byteLength). */
export function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/** Carimbo barato do conteúdo (FNV-1a 32 bits + tamanho): só para saber se um valor mudou desde a última sincronização. */
export function contentStamp(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${value.length.toString(36)}.${(h >>> 0).toString(36)}`;
}

/** Chaves de texto simples (idioma, dificuldade da campanha); as demais fixas e os mapas guardam JSON. */
const CLOUD_TEXT_KEYS = new Set(['aoe_locale', 'aoe_campaign_diff']);
/**
 * O conteúdo de um arquivo pode substituir o localStorage? JSON que analisa (texto curto para idioma e dificuldade).
 * Arquivo truncado ou corrompido (edição à mão, disco, sincronização interrompida) → false: nunca apaga um valor bom.
 */
export function cloudValueValid(key: string, value: string): boolean {
  if (CLOUD_TEXT_KEYS.has(key)) return /^[A-Za-z_-]{1,32}$/.test(value);
  try { JSON.parse(value); return true; } catch { return false; }
}

/** Conjuntos que só crescem (nada no jogo os esvazia): em divergência vale a união dos dois lados, sem perder nada. */
const CLOUD_UNION_KEYS = new Set(['aoe_campaign', 'aoe_achievements_v1', 'aoe_gods_played']);
const strList = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null);
const covers = (big: string[], small: string[]) => { const b = new Set(big); return small.every((x) => b.has(x)); };
/**
 * União de dois valores de uma chave de CLOUD_UNION_KEYS (aoe_campaign: `completed` e `hard`; conquistas e deuses: listas).
 * Devolve exatamente `a` ou `b` quando um já contém o outro (nada a gravar desse lado); null se a chave não é de união ou
 * um dos lados não tem o formato esperado (aí vale a regra dos carimbos).
 */
export function mergeCloudValue(key: string, a: string, b: string): string | null {
  if (!CLOUD_UNION_KEYS.has(key)) return null;
  let va: unknown, vb: unknown;
  try { va = JSON.parse(a); vb = JSON.parse(b); } catch { return null; }
  const union = (x: string[], y: string[]) => [...x, ...y.filter((i) => !x.includes(i))];
  if (key === 'aoe_campaign') {
    const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
    if (!isObj(va) || !isObj(vb)) return null;
    const ca = strList(va.completed ?? []), cb = strList(vb.completed ?? []), ha = strList(va.hard ?? []), hb = strList(vb.hard ?? []);
    if (!ca || !cb || !ha || !hb) return null;
    if (covers(cb, ca) && covers(hb, ha)) return b;
    if (covers(ca, cb) && covers(ha, hb)) return a;
    return JSON.stringify({ ...vb, ...va, completed: union(ca, cb), hard: union(ha, hb) });
  }
  const la = strList(va), lb = strList(vb);
  if (!la || !lb) return null;
  if (covers(lb, la)) return b;
  if (covers(la, lb)) return a;
  return JSON.stringify(union(la, lb));
}

export interface CloudPlan {
  /** Arquivo → localStorage (faltava aqui, ou outra máquina o mudou pelo Steam Cloud). */
  restore: string[];
  /** localStorage → arquivo (arquivo ausente, desatualizado, corrompido ou em conflito: esta máquina vence). */
  upload: string[];
  /** Apagadas em outra máquina (arquivo sumiu e o local é o último sincronizado): saem do localStorage. */
  remove: string[];
  /** Conflito em conjunto que só cresce: a união vai para os dois lados. */
  merged: Record<string, string>;
  /** Carimbos depois do plano (os de `upload`/`merged` só avançam quando a gravação der certo; initCloud cuida disso). */
  stamps: Record<string, string>;
}

/**
 * Decide, por chave espelhada, quem vale na inicialização (função pura). `local`: valores do localStorage (só chaves
 * espelhadas); `files`: conteúdo dos arquivos, por chave (null = o arquivo existe mas não foi lido: grande demais ou
 * ilegível — a chave fica como está); `stamps`: carimbo do último conteúdo sincronizado nesta máquina.
 * - só no arquivo → restaura (localStorage apagado, reinstalação, máquina nova);
 * - só no localStorage → grava o arquivo (saves de antes do espelho, gravação que falhou); mas, se o local ainda é o último
 *   sincronizado (carimbo = local), o arquivo foi apagado em outra máquina → sai do localStorage (`remoteDeletes`; initCloud
 *   o desliga quando a leitura da pasta falhou ou ela veio vazia, para nunca confundir pasta perdida com exclusão);
 * - iguais → nada;
 * - arquivo que não analisa (truncado/corrompido) → nunca restaura; é regravado a partir do local;
 * - conquistas, deuses jogados e progresso da campanha → união dos dois lados (nada se perde);
 * - diferentes: se o local ainda é o último sincronizado (carimbo = local), o arquivo mudou fora daqui (Steam Cloud de
 *   outra máquina) → restaura; se o arquivo é o último sincronizado (carimbo = arquivo), o local mudou sem chegar ao arquivo
 *   (gravação que falhou) → grava; sem carimbo que explique (os dois mudaram), vence o local e o arquivo é regravado.
 * Chaves fora da lista fixa são ignoradas dos dois lados.
 */
export function planCloudSync(local: Record<string, string | null | undefined>, files: Record<string, string | null>, stamps: Record<string, string>, opts: { remoteDeletes?: boolean } = {}): CloudPlan {
  const restore: string[] = [], upload: string[] = [], remove: string[] = [];
  const merged: Record<string, string> = {};
  const out: Record<string, string> = {};
  const keep = (k: string) => { if (stamps[k]) out[k] = stamps[k]; };
  const keys = new Set([...Object.keys(local), ...Object.keys(files)].filter(isCloudKey));
  for (const k of [...keys].sort()) {
    const inFiles = Object.prototype.hasOwnProperty.call(files, k);
    const L = local[k] ?? null, F = inFiles && typeof files[k] === 'string' ? files[k] as string : null;
    if (inFiles && F === null) { keep(k); continue; }   // existe e não foi lido: não restaura, não regrava, não apaga
    if (L === null && F === null) continue;
    if (L === F) { out[k] = contentStamp(L!); continue; }
    if (F !== null && !cloudValueValid(k, F)) { if (L !== null) { upload.push(k); keep(k); } continue; }
    if (L === null) { restore.push(k); out[k] = contentStamp(F!); continue; }
    if (F === null) {
      if (opts.remoteDeletes !== false && stamps[k] !== undefined && stamps[k] === contentStamp(L)) remove.push(k);
      else { upload.push(k); keep(k); }
      continue;
    }
    const m = mergeCloudValue(k, L, F);
    if (m !== null) {
      if (m === F) { restore.push(k); out[k] = contentStamp(F); }
      else if (m === L) { upload.push(k); keep(k); }
      else { merged[k] = m; keep(k); }
      continue;
    }
    const hl = contentStamp(L), hf = contentStamp(F), s = stamps[k];
    if (s === hl && s !== hf) { restore.push(k); out[k] = hf; }
    else { upload.push(k); keep(k); }
  }
  return { restore, upload, remove, merged, stamps: out };
}

// ---------------- Ponte com o Electron (desktop/preload.cjs) ----------------
export interface CloudBridge {
  cloudReadAll: () => Promise<Record<string, string | null> | null>;
  cloudWrite: (key: string, value: string) => Promise<boolean>;
  cloudRemove: (key: string) => Promise<boolean>;
}
function bridge(): CloudBridge | null {
  const d = desktop();
  return typeof d?.cloudReadAll === 'function' && typeof d.cloudWrite === 'function' && typeof d.cloudRemove === 'function' ? (d as CloudBridge) : null;
}

let mirror: CloudBridge | null = null;
let stamps: Record<string, string> = {};
function readStamps(): Record<string, string> {
  try { const v = JSON.parse(localStorage.getItem(CLOUD_STAMPS_KEY) ?? '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
function writeStamps(): void { try { localStorage.setItem(CLOUD_STAMPS_KEY, JSON.stringify(stamps)); } catch { /* ignore */ } }

/** Grava no arquivo espelho; o carimbo só avança quando o processo principal confirma. Valor grande demais: apaga o arquivo (nunca fica um antigo). */
function mirrorWrite(key: string, value: string): void {
  const m = mirror; if (!m) return;
  if (utf8Bytes(value) > CLOUD_MAX_BYTES) { mirrorRemove(key); return; }
  void m.cloudWrite(key, value).then((ok) => { if (ok) { stamps[key] = contentStamp(value); writeStamps(); } }, () => { /* fica para a próxima inicialização */ });
}
function mirrorRemove(key: string): void {
  const m = mirror; if (!m) return;
  void m.cloudRemove(key).then((ok) => { if (ok && stamps[key]) { delete stamps[key]; writeStamps(); } }, () => { /* ignore */ });
}

/** Apaga as cópias CLOUD_PREV_PREFIX (descartáveis); devolve se havia alguma. */
function dropCloudBackups(): boolean {
  const ks: string[] = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(CLOUD_PREV_PREFIX)) ks.push(k); } } catch { return false; }
  for (const k of ks) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  return ks.length > 0;
}
/** localStorage.setItem que, com a cota cheia, abre espaço descartando as cópias da sincronização e tenta de novo (senão lança). */
function setWithRoom(key: string, value: string): void {
  try { localStorage.setItem(key, value); }
  catch (e) { if (!dropCloudBackups()) throw e; localStorage.setItem(key, value); }
}

/**
 * Grava no localStorage (lança como ele, ex.: cota cheia) e, no Electron, também no arquivo espelho se a chave for da lista.
 * Use no lugar de localStorage.setItem para tudo o que o jogador guarda (save, replay, campanha, conquistas, opções, mapas).
 */
export function storeSet(key: string, value: string): void {
  setWithRoom(key, value);
  if (mirror && isCloudKey(key)) mirrorWrite(key, value);
}
/** Remove do localStorage e do arquivo espelho. */
export function storeRemove(key: string): void {
  localStorage.removeItem(key);
  if (mirror && isCloudKey(key)) mirrorRemove(key);
}

/** Valores atuais das chaves espelhadas no localStorage. */
function localSnapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); if (k === null || !isCloudKey(k)) continue;
      const v = localStorage.getItem(k); if (v !== null) out[k] = v;
    }
  } catch { /* ignore */ }
  return out;
}

export interface CloudInitResult { restored: string[]; uploaded: string[]; removed: string[]; merged: string[]; files: number }
/**
 * Chamar uma vez no começo do boot, antes de ler opções/saves. No Electron: lê os arquivos, restaura/grava/apaga conforme
 * planCloudSync e liga o espelho das gravações seguintes. No navegador devolve null sem tocar em nada.
 */
export async function initCloud(): Promise<CloudInitResult | null> {
  const m = bridge(); if (!m) return null;
  let files: Record<string, string | null> = {}, readOk = false;
  try { const r = await m.cloudReadAll(); if (r && typeof r === 'object') { files = r; readOk = true; } } catch { files = {}; }
  const local = localSnapshot();
  const prev = readStamps();
  const plan = planCloudSync(local, files, prev, { remoteDeletes: readOk && Object.keys(files).length > 0 });
  stamps = plan.stamps;
  /** Depois de trocar/apagar um valor local diferente, guarda o anterior (melhor esforço: sem espaço, segue sem a cópia). */
  const backup = (k: string) => { if (local[k] !== undefined) { try { localStorage.setItem(CLOUD_PREV_PREFIX + k, local[k]); } catch { /* ignore */ } } };
  const restored: string[] = [], merged: string[] = [];
  for (const k of plan.restore) {
    try { setWithRoom(k, files[k] as string); restored.push(k); backup(k); }
    // cota cheia: fica só no arquivo. O carimbo anterior (o do local) volta, para a próxima inicialização tentar restaurar de
    // novo em vez de achar que o local mudou e reenviar o valor velho por cima do arquivo novo
    catch { if (prev[k]) stamps[k] = prev[k]; else delete stamps[k]; }
  }
  for (const k of plan.remove) { try { localStorage.removeItem(k); backup(k); } catch { /* ignore */ } }
  for (const [k, v] of Object.entries(plan.merged)) { try { setWithRoom(k, v); merged.push(k); } catch { /* o arquivo recebe a união mesmo assim */ } }
  writeStamps();
  mirror = m;
  for (const k of plan.upload) mirrorWrite(k, local[k]);
  for (const [k, v] of Object.entries(plan.merged)) mirrorWrite(k, v);
  return { restored, uploaded: plan.upload, removed: plan.remove, merged, files: Object.keys(files).length };
}
