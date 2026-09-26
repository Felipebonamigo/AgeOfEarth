// Licenças de terceiros (ROADMAP 6.7): lista o que vai no pacote distribuído — dependências de produção do jogo (package.json)
// e do executável desktop (desktop/package.json + o próprio Electron) — com versão, licença e aviso de copyright.
// Uso: npx tsx scripts/licenses.ts [--check]
//   grava docs/THIRD_PARTY.md (tabela + textos completos das licenças, vai também no pacote desktop em resources/) e
//   src/ui/third-party.json (JSON enxuto embutido no build, mostrado na tela Créditos). --check: não grava; falha se algum
//   dos dois estiver desatualizado. Falha sempre se houver dependência distribuída sem licença conhecida ou com copyleft
//   forte (GPL/AGPL/SSPL…), o mesmo critério de tests/steam.test.ts.
// Fonte: os package-lock.json (quem é de produção, versões, licença declarada) + node_modules (LICENSE, copyright, site).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Onde a dependência vai: bundle do jogo (web e desktop), executável desktop, servidor de retransmissão. */
export type Scope = 'game' | 'desktop' | 'relay';
export type LicenseClass = 'permissive' | 'redistributable' | 'weak-copyleft' | 'strong-copyleft' | 'unknown';

export interface Dependency { name: string; version: string; license: string; scope: Scope; note?: string; noteEn?: string }
export interface ThirdPartyEntry extends Dependency { copyright: string[]; url?: string }

// ---------------- Classificação SPDX ----------------
const PERMISSIVE = new Set(['MIT', 'MIT-0', 'X11', 'ISC', '0BSD', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'Zlib', 'CC0-1.0', 'Unlicense', 'BlueOak-1.0.0', 'Python-2.0', 'CC-BY-3.0', 'CC-BY-4.0', 'BSL-1.0', 'PSF-2.0']);
const WEAK = /^(LGPL-(2\.0|2\.1|3\.0)(-only|-or-later|\+)?|MPL-(1\.1|2\.0)|EPL-(1\.0|2\.0)|CDDL-1\.[01])$/;
const STRONG = /^(A?GPL-(1\.0|2\.0|3\.0)(-only|-or-later|\+)?|SSPL-1\.0|OSL-3\.0|EUPL-1\.[12]|CC-BY-(NC-)?SA-[0-9.]+|CC-BY-NC.*)$/;
/** Licenças proprietárias que o parceiro pode redistribuir (Steamworks SDK dentro do steamworks.js). */
const REDISTRIBUTABLE = new Set(['LicenseRef-Steamworks-SDK']);
const RANK: Record<LicenseClass, number> = { permissive: 0, redistributable: 1, 'weak-copyleft': 2, 'strong-copyleft': 3, unknown: 4 };

function classifyId(id: string): LicenseClass {
  if (PERMISSIVE.has(id)) return 'permissive';
  if (REDISTRIBUTABLE.has(id)) return 'redistributable';
  if (WEAK.test(id)) return 'weak-copyleft';
  if (STRONG.test(id)) return 'strong-copyleft';
  return 'unknown';
}

/**
 * Classe de uma expressão SPDX ("MIT", "(MIT OR Apache-2.0)", "BSD-3-Clause AND ISC", "GPL-2.0 WITH Classpath-exception-2.0").
 * OR = a melhor opção (podemos escolher), AND = a pior, WITH = a da licença base. Vazio/"UNLICENSED"/"SEE LICENSE IN…" = desconhecida.
 */
export function classifyLicense(expr: string | undefined | null): LicenseClass {
  if (!expr || !expr.trim()) return 'unknown';
  const tokens = expr.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').trim().split(/\s+/);
  let pos = 0;
  const worst = (a: LicenseClass, b: LicenseClass) => (RANK[a] >= RANK[b] ? a : b);
  const best = (a: LicenseClass, b: LicenseClass) => (RANK[a] <= RANK[b] ? a : b);
  const primary = (): LicenseClass => {
    const tk = tokens[pos++];
    if (tk === '(') { const v = orExpr(); if (tokens[pos++] !== ')') throw new Error('parêntese'); return v; }
    if (!tk || /^(AND|OR|WITH|\))$/i.test(tk)) throw new Error('termo');
    let c = classifyId(tk);
    if (/^WITH$/i.test(tokens[pos] ?? '')) { pos += 2; c = worst(c, 'permissive'); }
    return c;
  };
  const andExpr = (): LicenseClass => { let v = primary(); while (/^AND$/i.test(tokens[pos] ?? '')) { pos++; v = worst(v, primary()); } return v; };
  const orExpr = (): LicenseClass => { let v = andExpr(); while (/^OR$/i.test(tokens[pos] ?? '')) { pos++; v = best(v, andExpr()); } return v; };
  try { const v = orExpr(); return pos === tokens.length ? v : 'unknown'; } catch { return 'unknown'; }
}
/** Pode ir no pacote distribuído (licença conhecida e sem copyleft forte). */
export const distributable = (license: string) => { const c = classifyLicense(license); return c !== 'unknown' && c !== 'strong-copyleft'; };

// ---------------- Dependências a partir dos package-lock.json ----------------
interface LockPackage { version?: string; license?: string; dev?: boolean; devOptional?: boolean; optional?: boolean; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }
interface Lock { packages: Record<string, LockPackage> }
const readJSON = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;

/** Resolve `dep` a partir do pacote em `from` (caminho do lockfile) como o Node: node_modules aninhados primeiro, depois os de cima. */
function resolveLock(lock: Lock, from: string, dep: string): string | null {
  let base = from;
  for (;;) {
    const cand = `${base ? base + '/' : ''}node_modules/${dep}`;
    if (lock.packages[cand]) return cand;
    if (!base) return null;
    const i = base.lastIndexOf('/node_modules/');
    base = i >= 0 ? base.slice(0, i) : '';
  }
}

/** Fecho das dependências de produção a partir de `roots` (caminhos do lockfile), sem as de desenvolvimento. */
function closure(lock: Lock, roots: string[]): string[] {
  const seen = new Set<string>(); const stack = [...roots];
  while (stack.length) {
    const p = stack.pop()!;
    if (seen.has(p)) continue;
    const pkg = lock.packages[p]; if (!pkg || pkg.dev) continue;
    seen.add(p);
    for (const dep of Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}) })) { const r = resolveLock(lock, p, dep); if (r) stack.push(r); }
  }
  return [...seen];
}
const nameOf = (lockPath: string) => lockPath.slice(lockPath.lastIndexOf('node_modules/') + 'node_modules/'.length);

/** Dependências de produção do jogo no package.json raiz; `ws` (e o que ele puxar) só serve ao servidor de retransmissão. */
const RELAY_ONLY = new Set(['ws']);

/** Componentes que vêm dentro de outros pacotes distribuídos (sem entrada própria no npm); `via` = pacote que os traz. */
export const EMBEDDED: (Omit<Dependency, 'version'> & { via: string })[] = [
  { name: 'Chromium', via: 'electron', license: 'BSD-3-Clause', scope: 'desktop', note: 'navegador embutido no Electron; licenças de todos os componentes em LICENSES.chromium.html, ao lado do executável', noteEn: 'browser engine bundled with Electron; licenses of every component in LICENSES.chromium.html, next to the executable' },
  { name: 'Node.js', via: 'electron', license: 'MIT', scope: 'desktop', note: 'runtime do processo principal do Electron', noteEn: "runtime of Electron's main process" },
  { name: 'FFmpeg', via: 'electron', license: 'LGPL-2.1-or-later', scope: 'desktop', note: 'biblioteca dinâmica (libffmpeg) do Electron, na versão sem codecs proprietários (sem H.264/AAC; trocada no empacotamento por desktop/after-pack.cjs); pode ser substituída pelo usuário', noteEn: "Electron's dynamic library (libffmpeg), in the build without proprietary codecs (no H.264/AAC; swapped in at packaging by desktop/after-pack.cjs); replaceable by the user" },
  { name: 'Steamworks SDK (steam_api)', via: 'steamworks.js', license: 'LicenseRef-Steamworks-SDK', scope: 'desktop', note: 'biblioteca da Valve, redistribuída conforme o Steamworks SDK Access Agreement', noteEn: "Valve's library, redistributed under the Steamworks SDK Access Agreement" },
];

/** Tudo o que vai no pacote distribuído, só com dados dos lockfiles (versão e licença declarada); ordem estável. */
export function collectDependencies(root = ROOT): Dependency[] {
  const out: Dependency[] = [];
  const rootPkg = readJSON<{ dependencies?: Record<string, string> }>(path.join(root, 'package.json'));
  const rootLock = readJSON<Lock>(path.join(root, 'package-lock.json'));
  const direct = Object.keys(rootPkg.dependencies ?? {});
  const gameSet = new Set(closure(rootLock, direct.filter((d) => !RELAY_ONLY.has(d)).map((d) => `node_modules/${d}`)));
  const relaySet = new Set(closure(rootLock, direct.filter((d) => RELAY_ONLY.has(d)).map((d) => `node_modules/${d}`)));
  for (const p of [...gameSet].sort()) out.push({ name: nameOf(p), version: rootLock.packages[p].version ?? '?', license: rootLock.packages[p].license ?? '', scope: 'game' });
  for (const p of [...relaySet].filter((x) => !gameSet.has(x)).sort()) out.push({ name: nameOf(p), version: rootLock.packages[p].version ?? '?', license: rootLock.packages[p].license ?? '', scope: 'relay' });

  const deskPkg = readJSON<{ dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }>(path.join(root, 'desktop', 'package.json'));
  const deskLock = readJSON<Lock>(path.join(root, 'desktop', 'package-lock.json'));
  // o Electron é devDependency (o electron-builder o põe como executável), mas vai inteiro no pacote
  const deskRoots = ['electron', ...Object.keys(deskPkg.dependencies ?? {}), ...Object.keys(deskPkg.optionalDependencies ?? {})].map((d) => `node_modules/${d}`);
  const deskSet = new Set<string>(['node_modules/electron']);
  for (const p of closure(deskLock, deskRoots.filter((r) => r !== 'node_modules/electron'))) deskSet.add(p);
  for (const p of [...deskSet].sort()) { const pkg = deskLock.packages[p]; if (pkg) out.push({ name: nameOf(p), version: pkg.version ?? '?', license: pkg.license ?? '', scope: 'desktop' }); }
  for (const { via, ...e } of EMBEDDED) out.push({ ...e, version: `via ${via} ${deskLock.packages[`node_modules/${via}`]?.version ?? '?'}` });
  return out;
}

// ---------------- Detalhes a partir do node_modules ----------------
function pkgDir(root: string, dep: Dependency): string | null {
  if (dep.version.startsWith('via ')) return null;
  const base = dep.scope === 'desktop' ? path.join(root, 'desktop') : root;
  const dir = path.join(base, 'node_modules', dep.name);
  return existsSync(path.join(dir, 'package.json')) ? dir : null;
}
function licenseFile(dir: string): string | null {
  const f = readdirSync(dir).find((x) => /^(licen[cs]e|copying)([.-]|$)/i.test(x));
  return f ? path.join(dir, f) : null;
}
/** Linhas "Copyright …" do arquivo de licença (sem as frases do próprio texto da licença). */
export function copyrightLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/\s+/g, ' ');
    if (!/^(copyright\b|\(c\)|©)/i.test(line)) continue;
    if (/copyright (notice|holders?|owners?)|this copyright/i.test(line)) continue;
    if (!out.includes(line)) out.push(line.slice(0, 200));
    if (out.length >= 3) break;
  }
  return out;
}
function repoUrl(pkg: { homepage?: string; repository?: string | { url?: string } }): string | undefined {
  let u = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  if (u && /^[\w.-]+\/[\w.-]+$/.test(u)) u = `https://github.com/${u}`;
  if (u) u = u.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/').replace(/\.git$/, '');
  const home = pkg.homepage?.split('#')[0];
  return (u && /^https:\/\//.test(u) ? u : undefined) ?? (home && /^https:\/\//.test(home) ? home : undefined);
}

export interface Detailed { entries: ThirdPartyEntry[]; texts: Record<string, string>; missing: string[] }
/** Junta copyright, site e o texto da licença (do node_modules) a cada dependência; `missing` lista o que não achou instalado. */
export function detail(deps: Dependency[], root = ROOT): Detailed {
  const entries: ThirdPartyEntry[] = []; const texts: Record<string, string> = {}; const missing: string[] = [];
  for (const d of deps) {
    const dir = pkgDir(root, d);
    if (!dir) { if (!d.version.startsWith('via ')) missing.push(`${d.scope}:${d.name}`); entries.push({ ...d, copyright: [] }); continue; }
    const pkg = readJSON<{ version?: string; license?: string | { type?: string }; author?: string | { name?: string }; homepage?: string; repository?: string | { url?: string } }>(path.join(dir, 'package.json'));
    if (pkg.version !== d.version) missing.push(`${d.scope}:${d.name} (instalado ${pkg.version}, lockfile ${d.version})`);
    const lf = licenseFile(dir);
    const text = lf ? readFileSync(lf, 'utf8').replace(/\r\n/g, '\n').trim() : '';
    let copyright = copyrightLines(text);
    const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
    if (!copyright.length && author) copyright = [`Copyright (c) ${author.replace(/\s*[<(].*$/, '')}`];
    entries.push({ ...d, copyright, url: repoUrl(pkg) });
    if (text) texts[`${d.name}@${d.version}`] = text;
  }
  return { entries, texts, missing };
}

// ---------------- Saídas ----------------
/** Texto-padrão das licenças permissivas usadas (o aviso de copyright de cada pacote vai na lista). */
export const STANDARD_TEXTS: Record<string, string> = {
  MIT: 'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.',
  ISC: 'Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.',
  'BSD-3-Clause': 'Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n\n1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.\n2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.\n3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.\n\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.',
};

/** JSON enxuto embutido no build (tela Créditos): n=nome, v=versão, l=licença, s=escopo, c=copyright, u=site, x/xe=observação PT/EN. */
export interface CreditsLicenses { generatedBy: string; packages: { n: string; v: string; l: string; s: Scope; c?: string[]; u?: string; x?: string; xe?: string }[]; texts: Record<string, string> }
export function creditsJSON(entries: ThirdPartyEntry[]): string {
  const used = new Set(entries.map((e) => e.license));
  const data: CreditsLicenses = {
    generatedBy: 'scripts/licenses.ts (não edite à mão)',
    packages: entries.map((e) => ({ n: e.name, v: e.version, l: e.license, s: e.scope, ...(e.copyright.length ? { c: e.copyright } : {}), ...(e.url ? { u: e.url } : {}), ...(e.note ? { x: e.note } : {}), ...(e.noteEn ? { xe: e.noteEn } : {}) })),
    texts: Object.fromEntries(Object.entries(STANDARD_TEXTS).filter(([k]) => used.has(k))),
  };
  return JSON.stringify(data, null, 1) + '\n';
}

const SCOPE_TITLE: Record<Scope, string> = {
  game: 'Jogo (bundle `dist/`, navegador e desktop)',
  desktop: 'Executável desktop (Electron, `desktop/`)',
  relay: 'Servidor de retransmissão (`server/relay.mjs`, não vai no pacote do jogo)',
};
export function thirdPartyMarkdown(d: Detailed): string {
  const esc = (s: string) => s.replace(/\|/g, '\\|');
  const lines = [
    '# Licenças de terceiros — Age of Earth',
    '',
    '> Gerado por `npx tsx scripts/licenses.ts` a partir dos `package-lock.json` (raiz e `desktop/`) e do `node_modules`; não edite à mão.',
    '> `tests/steam.test.ts` falha se uma dependência distribuída não tiver licença conhecida ou tiver copyleft forte (GPL/AGPL),',
    '> e se este arquivo ou `src/ui/third-party.json` (a lista mostrada na tela **Créditos** do jogo) ficarem desatualizados.',
    '> O pacote desktop leva este arquivo em `resources/THIRD_PARTY.md`; o Electron põe `LICENSE.electron.txt` e',
    '> `LICENSES.chromium.html` ao lado do executável.',
    '',
    'Arte, música, efeitos sonoros e textos do jogo são do próprio projeto (texturas procedurais, sprites assados de modelos',
    'paramétricos do projeto, áudio sintetizado em tempo real); as fontes são as do sistema (nenhuma fonte embutida).',
    'Ferramentas de desenvolvimento (Vite, TypeScript, Vitest, Playwright, three.js, pngjs, pixelmatch, electron-builder) não',
    'vão no pacote e não entram nesta lista.',
    '',
  ];
  for (const scope of ['game', 'desktop', 'relay'] as Scope[]) {
    const list = d.entries.filter((e) => e.scope === scope);
    if (!list.length) continue;
    lines.push(`## ${SCOPE_TITLE[scope]}`, '', '| Pacote | Versão | Licença | Copyright | Observação |', '|---|---|---|---|---|');
    for (const e of list) lines.push(`| ${e.url ? `[${esc(e.name)}](${e.url})` : esc(e.name)} | ${esc(e.version)} | ${esc(e.license)} | ${esc(e.copyright.join('; ') || '—')} | ${esc(e.note ?? '')} |`);
    lines.push('');
  }
  lines.push('## Textos das licenças', '');
  for (const e of d.entries) {
    const text = d.texts[`${e.name}@${e.version}`];
    if (!text) continue;
    lines.push(`### ${e.name} ${e.version} (${e.license})`, '', '```text', text, '```', '');
  }
  const noText = d.entries.filter((e) => !d.texts[`${e.name}@${e.version}`]);
  if (noText.length) {
    lines.push('### Sem arquivo de licença no pacote', '');
    for (const e of noText) lines.push(`- **${e.name}** (${e.license}): ${e.note ?? (STANDARD_TEXTS[e.license] ? `texto-padrão ${e.license} com o aviso "${e.copyright.join('; ')}"` : 'ver o site do projeto')}.`);
    lines.push('');
  }
  return lines.join('\n');
}

export const OUT_MD = path.join(ROOT, 'docs', 'THIRD_PARTY.md');
export const OUT_JSON = path.join(ROOT, 'src', 'ui', 'third-party.json');

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const check = process.argv.includes('--check');
  const deps = collectDependencies();
  const bad = deps.filter((d) => !distributable(d.license));
  if (bad.length) { console.error(`licença desconhecida ou copyleft forte no pacote distribuído:\n${bad.map((b) => `  ${b.scope}: ${b.name}@${b.version} → "${b.license || '(sem licença)'}" (${classifyLicense(b.license)})`).join('\n')}`); process.exit(1); }
  const d = detail(deps);
  if (d.missing.length) { console.error(`sem node_modules atualizado (npm ci na raiz e em desktop/): ${d.missing.join(', ')}`); process.exit(1); }
  const files: [string, string][] = [[OUT_MD, thirdPartyMarkdown(d)], [OUT_JSON, creditsJSON(d.entries)]];
  if (check) {
    const stale = files.filter(([f, txt]) => { try { return readFileSync(f, 'utf8') !== txt; } catch { return true; } });
    if (stale.length) { console.error(`desatualizado: ${stale.map(([f]) => path.relative(ROOT, f)).join(', ')} — rode npx tsx scripts/licenses.ts`); process.exit(1); }
    console.log(`ok: ${deps.length} componentes distribuídos, licenças conhecidas e sem copyleft forte; arquivos em dia`);
  } else {
    for (const [f, txt] of files) writeFileSync(f, txt);
    const by = (s: Scope) => deps.filter((x) => x.scope === s).length;
    console.log(`${deps.length} componentes (jogo ${by('game')}, desktop ${by('desktop')}, relay ${by('relay')}) → ${files.map(([f]) => path.relative(ROOT, f)).join(', ')}`);
    for (const e of d.entries) console.log(`  ${e.scope.padEnd(7)} ${`${e.name}@${e.version}`.padEnd(38)} ${e.license.padEnd(26)} ${classifyLicense(e.license)}`);
  }
}
