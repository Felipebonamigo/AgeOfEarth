// Fase 6 (Steam e legal): conquistas para o Steamworks, espelho dos saves em arquivos (Steam Cloud) e licenças de terceiros.
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ACHIEVEMENTS, Achievements, STEAM_API_NAME_RE, achievementEnglish, type AchievementDef } from '../src/game/achievements';
import { steamAchievementProblems, steamAchievementRows, steamAchievementsCSV, steamAchievementsJSON, STEAM_DIR } from '../scripts/steam-achievements';
import { CLOUD_FIXED_KEYS, CLOUD_MAP_ID_MAX_BYTES, CLOUD_MAX_BYTES, CLOUD_MAX_FILES, CLOUD_PREV_PREFIX, CLOUD_STAMPS_KEY, cloudFileForKey, cloudKeyForFile, cloudValueValid, contentStamp, initCloud, mergeCloudValue, planCloudSync, storeRemove, storeSet, utf8Bytes } from '../src/game/cloud';
import { slugify, uniqueMapId } from '../src/game/maps';
import { classifyLicense, collectDependencies, creditsJSON, detail, distributable, thirdPartyMarkdown, OUT_JSON, OUT_MD } from '../scripts/licenses';
import { THIRD_PARTY, creditsHTML } from '../src/ui/credits';
import { setLocale } from '../src/i18n';
import { defaultRelayUrl } from '../src/ui/menu';

const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cloudCjs = require('../desktop/cloud.cjs') as { FIXED: Record<string, string>; MAX_BYTES: number; MAX_FILES: number; fileForKey: (k: unknown) => string | null; keyForFile: (f: unknown) => string | null; readAll: (dir: string) => Record<string, string | null>; write: (dir: string, k: unknown, v: unknown) => boolean; remove: (dir: string, k: unknown) => boolean };

/** localStorage em memória (o vitest roda em Node); `quota` (caracteres de chaves + valores) imita a cota cheia. */
class MemoryStorage {
  private m = new Map<string, string>();
  constructor(private quota = Infinity) {}
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) {
    let used = String(v).length + k.length;
    for (const [kk, vv] of this.m) if (kk !== k) used += kk.length + vv.length;
    if (used > this.quota) throw new Error('QuotaExceededError');
    this.m.set(k, String(v));
  }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
afterEach(() => { delete g.window; delete g.localStorage; });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('conquistas no Steamworks (6.4)', () => {
  it('todo id serve como API name e é único; toda conquista tem nome e descrição em inglês', () => {
    expect(steamAchievementProblems()).toEqual([]);
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids.map((i) => i.toUpperCase())).size).toBe(ids.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.id, a.id).toMatch(STEAM_API_NAME_RE);
      const en = achievementEnglish(a);
      expect(en, `${a.id} sem tradução`).not.toBeNull();
      expect(en!.desc, `${a.id}: descrição EN igual à PT`).not.toBe(a.desc);
    }
  });
  it('o verificador acusa id inválido e tradução ausente', () => {
    const base = { icon: '⭐', check: () => false } as Pick<AchievementDef, 'icon' | 'check'>;
    const probs = steamAchievementProblems([
      { id: 'm1-despertar', name: 'X', desc: 'Faça X.', nameEn: 'X', descEn: 'Do X.', ...base },
      { id: 'sem_ingles', name: 'Y', desc: 'Faça Y.', ...base },
      { id: 'meio_ingles', name: 'Z', desc: 'Faça Z.', nameEn: 'Z', ...base },
      { id: 'Dup', name: 'A', desc: 'a', nameEn: 'A', descEn: 'b', ...base }, { id: 'dup', name: 'A', desc: 'a', nameEn: 'A', descEn: 'b', ...base },
    ]);
    expect(probs.some((p) => p.startsWith('m1-despertar') && p.includes('API name'))).toBe(true);
    expect(probs.some((p) => p.startsWith('sem_ingles') && p.includes('inglês'))).toBe(true);
    expect(probs.some((p) => p.startsWith('meio_ingles') && p.includes('inglês'))).toBe(true);
    expect(probs.some((p) => p.startsWith('dup') && p.includes('repetido'))).toBe(true);
  });
  it('desktop/steam/achievements.{json,csv} estão em dia com o jogo (npx tsx scripts/steam-achievements.ts)', () => {
    const rows = steamAchievementRows();
    expect(readFileSync(path.join(STEAM_DIR, 'achievements.json'), 'utf8')).toBe(steamAchievementsJSON(rows));
    expect(readFileSync(path.join(STEAM_DIR, 'achievements.csv'), 'utf8')).toBe(steamAchievementsCSV(rows));
    const json = JSON.parse(readFileSync(path.join(STEAM_DIR, 'achievements.json'), 'utf8'));
    expect(json.achievements.map((r: { apiName: string }) => r.apiName)).toEqual(ACHIEVEMENTS.map((a) => a.id));
    expect(json.languages).toEqual({ pt: 'brazilian', en: 'english' });
    // ocultas: as missões e os atos II e III (nomes contam a história); nenhuma das fixas
    const hidden = rows.filter((r) => r.hidden).map((r) => r.apiName);
    expect(hidden).toContain('m12_titanomaquia'); expect(hidden).toContain('campaign_act3');
    expect(hidden).not.toContain('m1_despertar'); expect(hidden).not.toContain('first_temple');
    // CSV: cabeçalho + uma linha por conquista; vírgula dentro do texto vai entre aspas
    const lines = steamAchievementsCSV(rows).trimEnd().split('\r\n');
    expect(lines.length).toBe(ACHIEVEMENTS.length + 1);
    expect(steamAchievementsCSV([{ ...rows[0], description: { brazilian: 'a, "b"', english: 'c' } }])).toContain('"a, ""b"""');
  });
  it('window.desktop.achievement recebe o mesmo id (destravar e ressincronizar)', () => {
    const sent: string[] = [];
    g.localStorage = new MemoryStorage();
    (g.localStorage as MemoryStorage).setItem('aoe_achievements_v1', JSON.stringify(['first_temple', 'm12_titanomaquia', 'id_que_nao_existe']));
    g.window = { desktop: { achievement: async (id: string) => { sent.push(id); return true; } } };
    const a = new Achievements();
    a.syncToSteam();
    expect(sent).toEqual(['first_temple', 'm12_titanomaquia']);
    const src = readFileSync(path.join(ROOT, 'src/game/achievements.ts'), 'utf8');
    expect(src).toContain('desktop()?.achievement?.(a.id)');
    const main = readFileSync(path.join(ROOT, 'desktop/main.cjs'), 'utf8');
    expect(main).toMatch(/ipcMain\.handle\('steam:achievement', \(_e, id\) => \{[^}]*steam\.achievement\.activate\(id\)/);
  });
});

describe('espelho dos saves em arquivos / Steam Cloud (6.4)', () => {
  const keys = ['aoe_save_v1', 'aoe_settings_v1', 'aoe_map_vale-do-eco', 'aoe_map_Mapa do João', 'aoe_map_../../etc', 'aoe_map_', 'aoe_map_' + 'x'.repeat(200), 'aoe_desync_v1', 'aoe_seat:OLIMPO:Ana', CLOUD_STAMPS_KEY, 'aoe_volume', '__proto__', 'constructor', 'toString'];
  it('a lista fixa e o nome dos arquivos são iguais no jogo e no processo principal (desktop/cloud.cjs)', () => {
    expect(cloudCjs.FIXED).toEqual(CLOUD_FIXED_KEYS);
    expect(cloudCjs.MAX_BYTES).toBe(CLOUD_MAX_BYTES); expect(cloudCjs.MAX_FILES).toBe(CLOUD_MAX_FILES);
    for (const k of [...keys, ...Object.keys(CLOUD_FIXED_KEYS)]) {
      const f = cloudFileForKey(k);
      expect(cloudCjs.fileForKey(k), k).toBe(f);
      if (f) {
        expect(f, k).toMatch(/^[a-z0-9][a-z0-9-]*\.json$/);   // nunca barra, ponto extra ou caminho
        expect(cloudKeyForFile(f), f).toBe(k); expect(cloudCjs.keyForFile(f), f).toBe(k);
      }
    }
    for (const k of ['aoe_desync_v1', 'aoe_seat:OLIMPO:Ana', CLOUD_STAMPS_KEY, 'aoe_volume', '__proto__', 'constructor', 'aoe_map_', 'aoe_map_' + 'x'.repeat(200)]) expect(cloudFileForKey(k), k).toBeNull();
    for (const f of ['../save.json', 'save.json.tmp', 'map-.json', 'map-A.json', 'mapx-zz.json', 'mapx-76616c65.json', 'mapx-ff.json', '.json', 'outro.json']) {
      expect(cloudKeyForFile(f), f).toBeNull(); expect(cloudCjs.keyForFile(f), f).toBeNull();
    }
    expect(cloudCjs.fileForKey(42)).toBeNull(); expect(cloudCjs.keyForFile(null)).toBeNull();
  });
  it('planCloudSync: restaura o que falta, grava o que falta e decide pelo carimbo quando divergem', () => {
    const s = (v: string) => contentStamp(v);
    // (os valores são JSON, como no jogo: arquivo que não analisa nunca é restaurado — teste abaixo)
    const V = (x: string) => JSON.stringify({ v: x });
    // localStorage apagado → restaura tudo o que há em arquivo (inclui mapas); chaves fora da lista são ignoradas
    let p = planCloudSync({}, { aoe_settings_v1: '{"a":1}', aoe_map_x: V('M'), aoe_desync_v1: 'D' }, {});
    expect(p.restore).toEqual(['aoe_map_x', 'aoe_settings_v1']); expect(p.upload).toEqual([]);
    expect(p.stamps).toEqual({ aoe_map_x: s(V('M')), aoe_settings_v1: s('{"a":1}') });
    // saves de antes do espelho → grava os arquivos
    p = planCloudSync({ aoe_save_v1: V('S'), aoe_seat: 'x' }, {}, {});
    expect(p.upload).toEqual(['aoe_save_v1']); expect(p.restore).toEqual([]);
    // iguais → nada
    p = planCloudSync({ aoe_save_v1: V('S') }, { aoe_save_v1: V('S') }, {});
    expect(p.upload).toEqual([]); expect(p.restore).toEqual([]); expect(p.stamps.aoe_save_v1).toBe(s(V('S')));
    // outra máquina mudou o arquivo (Steam Cloud) e o local é o último sincronizado → restaura
    p = planCloudSync({ aoe_save_v1: V('velho') }, { aoe_save_v1: V('novo') }, { aoe_save_v1: s(V('velho')) });
    expect(p.restore).toEqual(['aoe_save_v1']); expect(p.stamps.aoe_save_v1).toBe(s(V('novo')));
    // o local mudou e a gravação no arquivo não chegou (carimbo = arquivo) → grava
    p = planCloudSync({ aoe_save_v1: V('novo') }, { aoe_save_v1: V('velho') }, { aoe_save_v1: s(V('velho')) });
    expect(p.upload).toEqual(['aoe_save_v1']); expect(p.restore).toEqual([]);
    // os dois mudaram (ou sem carimbo) → vence o local
    p = planCloudSync({ aoe_save_v1: V('L') }, { aoe_save_v1: V('F') }, { aoe_save_v1: s('outro') });
    expect(p.upload).toEqual(['aoe_save_v1']);
    p = planCloudSync({ aoe_save_v1: V('L') }, { aoe_save_v1: V('F') }, {});
    expect(p.upload).toEqual(['aoe_save_v1']);
  });
  it('planCloudSync: arquivo truncado/corrompido nunca substitui o save bom do localStorage', () => {
    const good = '{"good":true}';
    // o carimbo diz "o local é o último sincronizado" (o caso que antes restaurava o lixo): agora o arquivo é regravado
    let p = planCloudSync({ aoe_save_v1: good }, { aoe_save_v1: '{"goo' }, { aoe_save_v1: contentStamp(good) });
    expect(p.restore).toEqual([]); expect(p.upload).toEqual(['aoe_save_v1']); expect(p.stamps.aoe_save_v1).toBe(contentStamp(good));
    // sem nada no local, o lixo também não entra
    p = planCloudSync({}, { aoe_save_v1: '{"goo', aoe_map_x: '' }, {});
    expect(p.restore).toEqual([]); expect(p.upload).toEqual([]);
    // idioma e dificuldade da campanha são texto simples (não JSON) e continuam restaurando
    p = planCloudSync({}, { aoe_locale: 'en', aoe_campaign_diff: 'hard' }, {});
    expect(p.restore).toEqual(['aoe_campaign_diff', 'aoe_locale']);
    expect(cloudValueValid('aoe_locale', '{"x"')).toBe(false); expect(cloudValueValid('aoe_settings_v1', '')).toBe(false);
    expect(cloudValueValid('aoe_map_vale', '{"w":8}')).toBe(true);
    // arquivo que existe mas não foi lido (null: grande demais/ilegível) → não mexe e guarda o carimbo
    p = planCloudSync({ aoe_save_v1: good }, { aoe_save_v1: null }, { aoe_save_v1: contentStamp(good) });
    expect([p.restore, p.upload, p.remove]).toEqual([[], [], []]); expect(p.stamps.aoe_save_v1).toBe(contentStamp(good));
  });
  it('planCloudSync: exclusão feita em outra máquina se propaga (e só ela)', () => {
    const s = (v: string) => contentStamp(v);
    // o local é o último sincronizado e o arquivo sumiu → apagado lá: sai daqui, não volta para a nuvem
    let p = planCloudSync({ aoe_map_vale: 'M' }, { aoe_maps_v1: '[]' }, { aoe_map_vale: s('M') });
    expect(p.remove).toEqual(['aoe_map_vale']); expect(p.upload).toEqual([]); expect(p.restore).toEqual(['aoe_maps_v1']);
    expect(p.stamps.aoe_map_vale).toBeUndefined();
    // sem carimbo (save de antes do espelho) ou com o local mudado depois da última sincronização → grava
    p = planCloudSync({ aoe_map_vale: 'M' }, { aoe_maps_v1: '[]' }, {});
    expect(p.remove).toEqual([]); expect(p.upload).toContain('aoe_map_vale');
    p = planCloudSync({ aoe_map_vale: 'M2' }, { aoe_maps_v1: '[]' }, { aoe_map_vale: s('M') });
    expect(p.remove).toEqual([]); expect(p.upload).toContain('aoe_map_vale');
    // leitura da pasta falhou ou veio vazia: initCloud desliga a propagação (nunca confunde pasta perdida com exclusão)
    p = planCloudSync({ aoe_map_vale: 'M' }, {}, { aoe_map_vale: s('M') }, { remoteDeletes: false });
    expect(p.remove).toEqual([]); expect(p.upload).toEqual(['aoe_map_vale']);
  });
  it('planCloudSync: campanha, conquistas e deuses jogados se fundem por união (nada se perde num conflito)', () => {
    const camp = (c: string[], h?: string[]) => JSON.stringify(h ? { completed: c, hard: h } : { completed: c });
    // o arquivo da nuvem está mais avançado e não há carimbo (build antiga): restaura em vez de descartar m2 e m3
    let p = planCloudSync({ aoe_campaign: camp(['m1']) }, { aoe_campaign: camp(['m1', 'm2', 'm3']) }, {});
    expect(p.restore).toEqual(['aoe_campaign']); expect(p.upload).toEqual([]);
    // o local está mais avançado → grava
    p = planCloudSync({ aoe_campaign: camp(['m1', 'm2'], ['m1']) }, { aoe_campaign: camp(['m1']) }, {});
    expect(p.upload).toEqual(['aoe_campaign']);
    // cada lado tem algo que o outro não tem → a união vai para os dois
    p = planCloudSync({ aoe_campaign: camp(['m1', 'm4'], ['m4']), aoe_achievements_v1: '["a","b"]', aoe_gods_played: '["zeus"]' },
      { aoe_campaign: camp(['m1', 'm2'], ['m2']), aoe_achievements_v1: '["a","c"]', aoe_gods_played: '["hades","zeus"]' }, {});
    expect(JSON.parse(p.merged.aoe_campaign)).toEqual({ completed: ['m1', 'm4', 'm2'], hard: ['m4', 'm2'] });
    expect(JSON.parse(p.merged.aoe_achievements_v1)).toEqual(['a', 'b', 'c']);
    expect(p.restore).toEqual(['aoe_gods_played']);   // ["hades","zeus"] já contém ["zeus"]
    // as outras chaves seguem a regra dos carimbos; formato inesperado também
    expect(mergeCloudValue('aoe_save_v1', '[]', '["x"]')).toBeNull();
    expect(mergeCloudValue('aoe_achievements_v1', '{"a":1}', '["x"]')).toBeNull();
  });
  it('utf8Bytes e contentStamp', () => {
    expect(utf8Bytes('abc')).toBe(3); expect(utf8Bytes('ção')).toBe(Buffer.byteLength('ção')); expect(utf8Bytes('⚡🏛️')).toBe(Buffer.byteLength('⚡🏛️'));
    expect(contentStamp('a')).not.toBe(contentStamp('b')); expect(contentStamp('abc')).toBe(contentStamp('abc'));
  });
  it('processo principal: só chaves da lista, tamanho e número de arquivos limitados, gravação atômica', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'aoe-cloud-'));
    try {
      expect(cloudCjs.write(dir, 'aoe_settings_v1', '{"x":1}')).toBe(true);
      expect(readFileSync(path.join(dir, 'settings.json'), 'utf8')).toBe('{"x":1}');
      expect(cloudCjs.write(dir, 'aoe_desync_v1', 'x')).toBe(false);
      expect(cloudCjs.write(dir, '../../fora', 'x')).toBe(false);
      expect(cloudCjs.write(dir, 'aoe_save_v1', 42)).toBe(false);
      expect(cloudCjs.write(dir, 'aoe_save_v1', 'é'.repeat(CLOUD_MAX_BYTES / 2 + 1))).toBe(false);   // 2 bytes por caractere
      writeFileSync(path.join(dir, 'intruso.json'), 'x'); writeFileSync(path.join(dir, 'save.json.tmp'), 'x');
      expect(cloudCjs.readAll(dir)).toEqual({ aoe_settings_v1: '{"x":1}' });
      expect(readdirSync(dir).filter((f) => f.endsWith('.tmp') && f !== 'save.json.tmp')).toEqual([]);
      expect(cloudCjs.remove(dir, 'aoe_settings_v1')).toBe(true);
      expect(existsSync(path.join(dir, 'settings.json'))).toBe(false);
      expect(cloudCjs.remove(dir, 'aoe_desync_v1')).toBe(false);
      // teto de arquivos: o N+1-ésimo mapa novo é recusado, mas regravar um existente continua valendo
      for (let i = 0; i < CLOUD_MAX_FILES; i++) expect(cloudCjs.write(dir, `aoe_map_m${i}`, 'M')).toBe(true);
      expect(cloudCjs.write(dir, 'aoe_map_mais-um', 'M')).toBe(false);
      expect(cloudCjs.write(dir, 'aoe_map_m0', 'M2')).toBe(true);
      expect(statSync(path.join(dir, 'map-m0.json')).size).toBe(2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('ids de mapa longos: o nome do arquivo (e o .tmp da gravação) cabe em 255 bytes; acima de 120 bytes o mapa não é espelhado', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'aoe-cloud-'));
    try {
      expect(CLOUD_MAP_ID_MAX_BYTES).toBe(120);
      for (const n of [100, 119, 120, 121, 122, 128]) {
        const key = 'aoe_map_' + 'a'.repeat(n);   // 65+ caracteres: fora do slug → mapx-<hex>
        const f = cloudFileForKey(key);
        expect(cloudCjs.fileForKey(key), `${n}`).toBe(f);
        if (n <= 120) {
          expect(f, `${n}`).toMatch(/^mapx-[0-9a-f]+\.json$/); expect(`${f}.tmp`.length, `${n}`).toBeLessThanOrEqual(255);
          expect(cloudCjs.write(dir, key, '{}'), `${n}`).toBe(true);
          expect(cloudCjs.keyForFile(f)).toBe(key);
        } else {
          expect(f, `${n}`).toBeNull(); expect(cloudCjs.write(dir, key, '{}'), `${n}`).toBe(false);
          expect(planCloudSync({ [key]: '{}' }, {}, {}).upload, `${n}`).toEqual([]);   // não fica tentando a cada boot
        }
      }
      // multibyte: o teto é em bytes
      expect(cloudFileForKey('aoe_map_' + 'ç'.repeat(60))).not.toBeNull(); expect(cloudFileForKey('aoe_map_' + 'ç'.repeat(61))).toBeNull();
      // arquivo da lista que existe mas não pode ser lido vem como null (a página não o toma por apagado)
      mkdirSync(path.join(dir, 'save.json'));
      expect(cloudCjs.readAll(dir).aoe_save_v1).toBeNull();
      // o editor não cria ids longos: slug até 60 caracteres, com sufixo livre ainda no formato map-<id>.json
      g.localStorage = new MemoryStorage();
      expect(slugify('Mapa '.repeat(40)).length).toBeLessThanOrEqual(60);
      const copy = uniqueMapId(slugify(`${'vale-'.repeat(20)}-copia-copia-copia`));
      expect(cloudFileForKey(`aoe_map_${copy}`)).toBe(`map-${copy}.json`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('de ponta a ponta com a pasta real: grava nos dois, apaga o localStorage e restaura do arquivo', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'aoe-cloud-'));
    const bridge = { cloudReadAll: async () => cloudCjs.readAll(dir), cloudWrite: async (k: string, v: string) => cloudCjs.write(dir, k, v), cloudRemove: async (k: string) => cloudCjs.remove(dir, k) };
    try {
      const ls = new MemoryStorage(); g.localStorage = ls;
      ls.setItem('aoe_save_v1', '{"save":"antigo"}');          // save de antes do espelho
      ls.setItem('aoe_seat:OLIMPO:Ana', 'ficha');              // ficha de vaga: nunca vai para arquivo
      g.window = { desktop: bridge };
      let r = await initCloud(); await flush();
      expect(r).toEqual({ restored: [], uploaded: ['aoe_save_v1'], removed: [], merged: [], files: 0 });
      expect(readFileSync(path.join(dir, 'save.json'), 'utf8')).toBe('{"save":"antigo"}');
      storeSet('aoe_settings_v1', '{"edgeScroll":false}');
      storeSet('aoe_map_vale', '{"w":8}');
      storeSet('aoe_map_Mapa do João', '{"w":9}');
      storeSet('aoe_desync_v1', '{}');
      await flush();
      expect(readdirSync(dir).sort()).toEqual(['map-vale.json', `mapx-${Buffer.from('Mapa do João').toString('hex')}.json`, 'save.json', 'settings.json']);
      storeRemove('aoe_map_vale'); await flush();
      expect(existsSync(path.join(dir, 'map-vale.json'))).toBe(false);
      // "reinstalação": localStorage vazio → volta tudo do arquivo, menos o que não é espelhado
      const fresh = new MemoryStorage(); g.localStorage = fresh;
      r = await initCloud();
      expect(r!.restored.sort()).toEqual(['aoe_map_Mapa do João', 'aoe_save_v1', 'aoe_settings_v1']);
      expect(fresh.getItem('aoe_settings_v1')).toBe('{"edgeScroll":false}');
      expect(fresh.getItem('aoe_desync_v1')).toBeNull(); expect(fresh.getItem('aoe_seat:OLIMPO:Ana')).toBeNull();
      // outra máquina muda o arquivo (Steam Cloud) → a próxima inicialização traz a versão nova
      writeFileSync(path.join(dir, 'settings.json'), '{"edgeScroll":true}');
      r = await initCloud();
      expect(r!.restored).toEqual(['aoe_settings_v1']); expect(fresh.getItem('aoe_settings_v1')).toBe('{"edgeScroll":true}');
      // no navegador (sem ponte) initCloud não faz nada e storeSet é só o localStorage
      g.window = {};
      expect(await initCloud()).toBeNull();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('de ponta a ponta: arquivo corrompido, exclusão remota, união, cópia do valor anterior e cota cheia', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'aoe-cloud-'));
    const bridge = { cloudReadAll: async () => cloudCjs.readAll(dir), cloudWrite: async (k: string, v: string) => cloudCjs.write(dir, k, v), cloudRemove: async (k: string) => cloudCjs.remove(dir, k) };
    const file = (f: string) => { try { return readFileSync(path.join(dir, f), 'utf8'); } catch { return null; } };
    try {
      const ls = new MemoryStorage(); g.localStorage = ls; g.window = { desktop: bridge };
      await initCloud();
      storeSet('aoe_save_v1', '{"good":true}'); storeSet('aoe_map_vale', '{"w":8}'); storeSet('aoe_maps_v1', '[{"id":"vale"}]');
      storeSet('aoe_settings_v1', '{"v":1}'); storeSet('aoe_campaign', '{"completed":["m1"]}');
      await flush();
      // save.json truncado: o save bom fica e o arquivo é regravado a partir dele
      writeFileSync(path.join(dir, 'save.json'), '{"goo');
      // outra máquina: apagou o mapa (arquivo + índice), mudou as opções e avançou a campanha
      rmSync(path.join(dir, 'map-vale.json')); writeFileSync(path.join(dir, 'maps-index.json'), '[]');
      writeFileSync(path.join(dir, 'settings.json'), '{"v":2}'); writeFileSync(path.join(dir, 'campaign.json'), '{"completed":["m2"]}');
      // e esta máquina avançou a campanha sem sincronizar (a gravação no arquivo "falhou": carimbo antigo)
      ls.setItem('aoe_campaign', '{"completed":["m1","m3"]}');
      const r = await initCloud(); await flush();
      expect(r!.removed).toEqual(['aoe_map_vale']); expect(r!.merged).toEqual(['aoe_campaign']);
      expect(r!.restored.sort()).toEqual(['aoe_maps_v1', 'aoe_settings_v1']); expect(r!.uploaded).toEqual(['aoe_save_v1']);
      expect(ls.getItem('aoe_save_v1')).toBe('{"good":true}'); expect(file('save.json')).toBe('{"good":true}');
      expect(ls.getItem('aoe_map_vale')).toBeNull(); expect(file('map-vale.json')).toBeNull();
      expect(ls.getItem(CLOUD_PREV_PREFIX + 'aoe_map_vale')).toBe('{"w":8}');         // cópia do que a sincronização apagou
      expect(ls.getItem('aoe_settings_v1')).toBe('{"v":2}'); expect(ls.getItem(CLOUD_PREV_PREFIX + 'aoe_settings_v1')).toBe('{"v":1}');
      const camp = JSON.parse(ls.getItem('aoe_campaign')!).completed.sort();
      expect(camp).toEqual(['m1', 'm2', 'm3']); expect(JSON.parse(file('campaign.json')!).completed.sort()).toEqual(camp);
      // as cópias ficam fora do espelho e da próxima sincronização
      expect(readdirSync(dir).some((f) => f.includes('prev'))).toBe(false);
      expect((await initCloud())).toEqual({ restored: [], uploaded: [], removed: [], merged: [], files: readdirSync(dir).length });
      // cota cheia: storeSet descarta as cópias (descartáveis) para caber; sem cópias, lança como o localStorage
      const tight = new MemoryStorage(260); g.localStorage = tight;
      tight.setItem(CLOUD_PREV_PREFIX + 'aoe_save_v1', 'x'.repeat(200));
      expect(() => storeSet('aoe_replay_v1', 'r'.repeat(100))).not.toThrow();
      expect(tight.getItem(CLOUD_PREV_PREFIX + 'aoe_save_v1')).toBeNull(); expect(tight.getItem('aoe_replay_v1')).toBe('r'.repeat(100));
      expect(() => storeSet('aoe_replay_v1', 'r'.repeat(300))).toThrow();
      await flush();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('restauração que não cabe (cota cheia) não faz o valor velho do local voltar para a nuvem', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'aoe-cloud-'));
    const bridge = { cloudReadAll: async () => cloudCjs.readAll(dir), cloudWrite: async (k: string, v: string) => cloudCjs.write(dir, k, v), cloudRemove: async (k: string) => cloudCjs.remove(dir, k) };
    try {
      const ls = new MemoryStorage(300); g.localStorage = ls; g.window = { desktop: bridge };
      await initCloud();
      storeSet('aoe_save_v1', '{"v":"velho"}'); await flush();
      const novo = JSON.stringify({ v: 'novo'.repeat(60) });   // não cabe na cota
      writeFileSync(path.join(dir, 'save.json'), novo);        // veio de outra máquina
      for (let i = 0; i < 2; i++) {
        const r = await initCloud(); await flush();
        expect(r!.restored).toEqual([]); expect(r!.uploaded).toEqual([]);
        expect(readFileSync(path.join(dir, 'save.json'), 'utf8')).toBe(novo);   // o arquivo novo continua lá
        expect(JSON.parse(ls.getItem(CLOUD_STAMPS_KEY)!).aoe_save_v1).toBe(contentStamp('{"v":"velho"}'));
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('nenhuma gravação de chave espelhada escapa do storeSet/storeRemove', () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(f)) files.push(p); } };
    walk(path.join(ROOT, 'src'));
    const offenders: string[] = [];
    for (const f of files) {
      if (f.endsWith(path.join('game', 'cloud.ts'))) continue;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (!/localStorage\.(setItem|removeItem)\(/.test(line)) return;
        // permitidas: ficha de vaga do relay (por sala/nome) e o relatório de dessincronização (diagnóstico, não é do jogador)
        if (/localStorage\.setItem\(key, token\)/.test(line) || /'aoe_desync_v1'/.test(line)) return;
        offenders.push(`${path.relative(ROOT, f)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('versão desktop', () => {
  it('servidor de multiplayer padrão: host da página no navegador, localhost no Electron (app://game)', () => {
    expect(defaultRelayUrl({ protocol: 'http:', hostname: 'jogo.exemplo' })).toBe('ws://jogo.exemplo:8787');
    expect(defaultRelayUrl({ protocol: 'https:', hostname: 'jogo.exemplo' })).toBe('wss://jogo.exemplo:8787');
    expect(defaultRelayUrl({ protocol: 'app:', hostname: 'game' })).toBe('ws://localhost:8787');
    expect(defaultRelayUrl({ protocol: 'file:', hostname: '' })).toBe('ws://localhost:8787');
  });
});

describe('licenças de terceiros e créditos (6.7)', () => {
  it('classifica expressões SPDX', () => {
    expect(classifyLicense('MIT')).toBe('permissive');
    expect(classifyLicense('(MIT OR GPL-3.0)')).toBe('permissive');
    expect(classifyLicense('MIT AND GPL-2.0-only')).toBe('strong-copyleft');
    expect(classifyLicense('AGPL-3.0-or-later')).toBe('strong-copyleft');
    expect(classifyLicense('GPL-2.0 WITH Classpath-exception-2.0')).toBe('strong-copyleft');
    expect(classifyLicense('LGPL-2.1-or-later')).toBe('weak-copyleft');
    expect(classifyLicense('(BSD-3-Clause AND (MIT OR Apache-2.0))')).toBe('permissive');
    for (const bad of ['', 'UNLICENSED', 'SEE LICENSE IN LICENSE.md', 'Custom', 'MIT OR', '(MIT']) expect(classifyLicense(bad), bad).toBe('unknown');
    expect(distributable('GPL-3.0')).toBe(false); expect(distributable('')).toBe(false); expect(distributable('LicenseRef-Steamworks-SDK')).toBe(true);
  });
  it('nenhuma dependência distribuída sem licença conhecida ou com copyleft forte (GPL/AGPL)', () => {
    const deps = collectDependencies(ROOT);
    expect(deps.map((d) => d.name)).toEqual(expect.arrayContaining(['pixi.js', 'electron', 'steamworks.js', 'Chromium']));
    const bad = deps.filter((d) => !distributable(d.license)).map((d) => `${d.scope}:${d.name}@${d.version} "${d.license}" (${classifyLicense(d.license)})`);
    expect(bad).toEqual([]);
    // ferramentas de desenvolvimento não entram
    for (const dev of ['vite', 'typescript', 'vitest', 'playwright', 'three', 'electron-builder', '@electron/get']) expect(deps.some((d) => d.name === dev), dev).toBe(false);
  });
  it('src/ui/third-party.json (tela Créditos) e docs/THIRD_PARTY.md estão em dia com os lockfiles (npx tsx scripts/licenses.ts)', () => {
    const deps = collectDependencies(ROOT);
    const embedded = JSON.parse(readFileSync(OUT_JSON, 'utf8')) as { packages: { n: string; v: string; l: string; s: string }[] };
    expect(embedded.packages.map((p) => `${p.s}:${p.n}@${p.v}=${p.l}`)).toEqual(deps.map((d) => `${d.scope}:${d.name}@${d.version}=${d.license}`));
    // com os dois node_modules instalados, os arquivos inteiros (copyright e textos) batem com o gerado
    const d = detail(deps, ROOT);
    if (d.missing.length === 0) {
      expect(readFileSync(OUT_JSON, 'utf8')).toBe(creditsJSON(d.entries));
      expect(readFileSync(OUT_MD, 'utf8')).toBe(thirdPartyMarkdown(d));
    }
  });
  it('a tela Créditos mostra a equipe e as licenças em PT e EN', () => {
    expect(THIRD_PARTY.length).toBeGreaterThan(10);
    setLocale('pt');
    const pt = creditsHTML();
    setLocale('en');
    const en = creditsHTML();
    setLocale('pt');
    for (const html of [pt, en]) {
      expect(html).toContain('Felipe Bonamigo'); expect(html).toContain('Claude Code');
      for (const p of THIRD_PARTY) expect(html).toContain(p.n.replace(/&/g, '&amp;'));
      expect(html).toContain('id="m-close"');
      expect(html.startsWith('<h2 data-nav data-autofocus>')).toBe(true);   // controle: foco inicial no topo, não no Fechar
    }
    expect(pt).toContain('criação e direção'); expect(pt).toContain('Licenças de terceiros');
    expect(en).toContain('creation and direction'); expect(en).toContain('Third-party licenses');
    expect(en).toContain('Electron&#39;s dynamic library');
  });
});
