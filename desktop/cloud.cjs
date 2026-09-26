// Espelho em arquivos do localStorage (Steam Cloud, ROADMAP 6.4) — lado do processo principal, sem Electron (testável em Node).
// A página só alcança estas funções pelos canais cloud:* do preload, e só com chaves da lista fixa abaixo: nada de caminho
// vindo da página, nada de fs genérico. Mantenha FIXED igual a CLOUD_FIXED_KEYS em src/game/cloud.ts (tests/steam.test.ts).
const fs = require('node:fs');
const path = require('node:path');

const FIXED = {
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
const MAP_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
// id de até 120 bytes: `mapx-` + 240 hex + `.json` = 250 caracteres e o temporário `.json.tmp` = 254, dentro dos 255 do
// ext4/NTFS; id maior não é espelhado (igual a CLOUD_MAP_ID_MAX_BYTES em src/game/cloud.ts)
const MAP_HEX_RE = /^(?:[0-9a-f]{2}){1,120}$/;
/** Teto por arquivo (bytes em UTF-8) e de arquivos na pasta: iguais a CLOUD_MAX_BYTES/CLOUD_MAX_FILES em src/game/cloud.ts. */
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_FILES = 300;
/** Leitura inicial: soma máxima devolvida à página (o que passar fica no disco e não é restaurado nesta execução). */
const MAX_TOTAL_READ = 256 * 1024 * 1024;

function fileForKey(key) {
  if (typeof key !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(FIXED, key)) return `${FIXED[key]}.json`;
  if (key.startsWith('aoe_map_')) {
    const id = key.slice(8);
    if (MAP_ID_RE.test(id)) return `map-${id}.json`;
    const hex = Buffer.from(id, 'utf8').toString('hex');
    if (MAP_HEX_RE.test(hex)) return `mapx-${hex}.json`;
  }
  return null;
}

function keyForFile(file) {
  if (typeof file !== 'string') return null;
  for (const [k, f] of Object.entries(FIXED)) if (`${f}.json` === file) return k;
  let m = /^map-(.+)\.json$/.exec(file);
  if (m) return MAP_ID_RE.test(m[1]) ? `aoe_map_${m[1]}` : null;
  m = /^mapx-(.+)\.json$/.exec(file);
  if (!m || !MAP_HEX_RE.test(m[1])) return null;
  const id = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.from(m[1], 'hex'));
  // forma única (a mesma que fileForKey produziria): recusa UTF-8 inválido e slugs disfarçados de hex
  return !MAP_ID_RE.test(id) && Buffer.from(id, 'utf8').toString('hex') === m[1] ? `aoe_map_${id}` : null;
}

/** Valor aceito para gravação: texto de até MAX_BYTES em UTF-8. */
const validValue = (value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= MAX_BYTES;

function listOwnFiles(dir) {
  try { return fs.readdirSync(dir).filter((f) => keyForFile(f) !== null); } catch { return []; }
}

/**
 * Todos os arquivos da lista na pasta, por chave do localStorage (ignora o que não é da lista). O que existe mas não é
 * lido (grande demais, acima do total ou ilegível) vem como null: a página não o restaura, não o regrava e — importante —
 * não o toma por apagado em outra máquina.
 */
function readAll(dir) {
  const out = {};
  let total = 0;
  for (const f of listOwnFiles(dir).sort()) {
    const full = path.join(dir, f);
    const key = keyForFile(f);
    try {
      const st = fs.statSync(full);
      if (!st.isFile() || st.size > MAX_BYTES || total + st.size > MAX_TOTAL_READ) { out[key] = null; continue; }
      out[key] = fs.readFileSync(full, 'utf8');
      total += st.size;
    } catch { out[key] = null; }
  }
  return out;
}

/**
 * Grava (atômico: arquivo temporário + rename) o valor de uma chave da lista. Síncrono de propósito: as gravações chegam
 * pela IPC na ordem em que a página as fez e terminam antes da próxima (e antes de o app fechar).
 */
function write(dir, key, value) {
  const file = fileForKey(key);
  if (!file || !validValue(value)) return false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const full = path.join(dir, file);
    if (!fs.existsSync(full) && listOwnFiles(dir).length >= MAX_FILES) return false;
    const tmp = `${full}.tmp`;
    fs.writeFileSync(tmp, value, 'utf8');
    fs.renameSync(tmp, full);
    return true;
  } catch { return false; }
}

function remove(dir, key) {
  const file = fileForKey(key);
  if (!file) return false;
  try { fs.rmSync(path.join(dir, file), { force: true }); return true; } catch { return false; }
}

module.exports = { FIXED, MAP_ID_RE, MAX_BYTES, MAX_FILES, fileForKey, keyForFile, validValue, readAll, write, remove };
