// Conquistas para o Steamworks (ROADMAP 6.4): gera a planilha de cadastro a partir de src/game/achievements.ts.
// Uso: npx tsx scripts/steam-achievements.ts [--check]
//   grava desktop/steam/achievements.json e desktop/steam/achievements.csv (api name = id, nome e descrição em
//   brazilian/english, oculta ou não). --check: não grava; falha se os arquivos estiverem desatualizados ou se alguma
//   conquista não tiver tradução ou tiver um id que não sirva de API name.
// O jogo destrava na Steam com window.desktop.achievement(id) (src/game/achievements.ts → desktop/main.cjs), o mesmo id.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ACHIEVEMENTS, STEAM_API_NAME_RE, achievementEnglish, type AchievementDef } from '../src/game/achievements';

/** Códigos de idioma da Steam para os idiomas do jogo. */
export const STEAM_LANGUAGES = { pt: 'brazilian', en: 'english' } as const;

export interface SteamAchievementRow {
  apiName: string;
  hidden: boolean;
  /** Emoji do jogo: referência para o artista desenhar os ícones 256×256 (pendente, ver docs/STEAM.md). */
  icon: string;
  displayName: { brazilian: string; english: string };
  description: { brazilian: string; english: string };
}

/** Problemas que impedem o cadastro: id que não serve de API name, id repetido, tradução em inglês ausente. */
export function steamAchievementProblems(list: readonly AchievementDef[] = ACHIEVEMENTS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of list) {
    if (!STEAM_API_NAME_RE.test(a.id)) out.push(`${a.id}: id não serve como API name da Steam (só letras ASCII, dígitos e _)`);
    if (seen.has(a.id.toUpperCase())) out.push(`${a.id}: id repetido (a Steam não diferencia maiúsculas no cadastro)`);
    seen.add(a.id.toUpperCase());
    if (!a.name.trim() || !a.desc.trim()) out.push(`${a.id}: nome ou descrição em português vazio`);
    const en = achievementEnglish(a);
    if (!en) out.push(`${a.id}: sem nome ou descrição em inglês`);
    else if (en.desc === a.desc) out.push(`${a.id}: descrição em inglês igual à portuguesa (tradução faltando)`);
  }
  return out;
}

export function steamAchievementRows(list: readonly AchievementDef[] = ACHIEVEMENTS): SteamAchievementRow[] {
  return list.map((a) => {
    const en = achievementEnglish(a) ?? { name: a.name, desc: a.desc };
    return { apiName: a.id, hidden: !!a.hidden, icon: a.icon, displayName: { brazilian: a.name, english: en.name }, description: { brazilian: a.desc, english: en.desc } };
  });
}

export function steamAchievementsJSON(rows: SteamAchievementRow[] = steamAchievementRows()): string {
  return JSON.stringify({
    generatedBy: 'scripts/steam-achievements.ts (não edite à mão)',
    languages: STEAM_LANGUAGES,
    count: rows.length,
    achievements: rows,
  }, null, 2) + '\n';
}

/** CSV (RFC 4180, UTF-8, vírgula): uma linha por conquista, na ordem do jogo. */
export function steamAchievementsCSV(rows: SteamAchievementRow[] = steamAchievementRows()): string {
  const cell = (v: string | boolean) => { const s = String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['api_name', 'hidden', 'icon', 'name_brazilian', 'desc_brazilian', 'name_english', 'desc_english'];
  const lines = rows.map((r) => [r.apiName, r.hidden ? '1' : '0', r.icon, r.displayName.brazilian, r.description.brazilian, r.displayName.english, r.description.english].map(cell).join(','));
  return [head.join(','), ...lines].join('\r\n') + '\r\n';
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STEAM_DIR = path.join(ROOT, 'desktop', 'steam');

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const check = process.argv.includes('--check');
  const problems = steamAchievementProblems();
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  const rows = steamAchievementRows();
  const files: [string, string][] = [[path.join(STEAM_DIR, 'achievements.json'), steamAchievementsJSON(rows)], [path.join(STEAM_DIR, 'achievements.csv'), steamAchievementsCSV(rows)]];
  if (check) {
    const stale = files.filter(([f, txt]) => { try { return readFileSync(f, 'utf8') !== txt; } catch { return true; } });
    if (stale.length) { console.error(`desatualizado: ${stale.map(([f]) => path.relative(ROOT, f)).join(', ')} — rode npx tsx scripts/steam-achievements.ts`); process.exit(1); }
    console.log(`ok: ${rows.length} conquistas (${rows.filter((r) => r.hidden).length} ocultas), arquivos em dia`);
  } else {
    mkdirSync(STEAM_DIR, { recursive: true });
    for (const [f, txt] of files) writeFileSync(f, txt);
    console.log(`${rows.length} conquistas (${rows.filter((r) => r.hidden).length} ocultas) → ${files.map(([f]) => path.relative(ROOT, f)).join(', ')}`);
  }
}
