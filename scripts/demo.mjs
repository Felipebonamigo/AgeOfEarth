#!/usr/bin/env node
// Sobe a demo local do jogo com UM comando:  npm run demo   (ou: node scripts/demo.mjs)
// Faz, só o que for preciso: [--update] git pull · npm ci (se faltar node_modules ou o lockfile mudou) · build (se algo em
// src/, public/, index.html ou na configuração é mais novo que dist/) · serve dist/ e abre o navegador.
// Opções: --update (git pull --rebase da branch atual) · --port 4173 · --no-open · --rebuild (força o build) · --dev (Vite em modo dev).
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', '4173'));
const win = process.platform === 'win32';
const npm = win ? 'npm.cmd' : 'npm';
const step = (m) => console.log(`\n\x1b[36m▶ ${m}\x1b[0m`);
const run = (cmd, a, o = {}) => { const r = spawnSync(cmd, a, { stdio: 'inherit', shell: win, ...o }); if (r.status !== 0) { console.error(`\n✗ falhou: ${cmd} ${a.join(' ')}`); process.exit(r.status ?? 1); } };

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) { console.error(`Node ${process.versions.node} é antigo demais: instale o Node 20 ou mais novo (https://nodejs.org).`); process.exit(1); }

if (has('--update')) {
  step('Atualizando o código (git pull --rebase)');
  const st = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8', shell: win });
  if (st.stdout.trim()) console.log('  (há alterações locais; o pull pode recusar — guarde-as com git stash)');
  run('git', ['pull', '--rebase']);
}

const newest = (p, acc = { t: 0 }) => {
  let s; try { s = fs.statSync(p); } catch { return acc; }
  if (s.isDirectory()) { for (const f of fs.readdirSync(p)) if (f !== 'node_modules' && f !== '.git') newest(path.join(p, f), acc); }
  else acc.t = Math.max(acc.t, s.mtimeMs);
  return acc;
};

const lock = path.join(ROOT, 'package-lock.json'), modules = path.join(ROOT, 'node_modules', '.package-lock.json');
if (!fs.existsSync(modules) || (fs.existsSync(lock) && fs.statSync(lock).mtimeMs > fs.statSync(modules).mtimeMs)) {
  step('Instalando dependências (npm ci) — só na primeira vez ou quando mudam');
  run(npm, ['ci', '--no-audit', '--no-fund']);
}

if (has('--dev')) {
  step(`Modo desenvolvimento (Vite) em http://localhost:${port}/`);
  openLater(`http://localhost:${port}/`);
  run(npm, ['run', 'dev', '--', '--port', String(port), '--host', '127.0.0.1']);
  process.exit(0);
}

const dist = path.join(ROOT, 'dist', 'index.html');
const sources = ['src', 'public', 'index.html', 'vite.config.ts', 'package.json', 'tsconfig.json'].map((f) => newest(path.join(ROOT, f)).t);
if (has('--rebuild') || !fs.existsSync(dist) || Math.max(...sources) > fs.statSync(dist).mtimeMs) {
  step('Compilando o jogo (npm run build) — ~1 min');
  run(npm, ['run', 'build']);
} else console.log('\n✓ dist/ em dia (use --rebuild para forçar)');

function openLater(url) {
  if (has('--no-open')) return;
  setTimeout(() => {
    const cmd = win ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch { /* sem navegador: o endereço já está no terminal */ }
  }, 2500);
}

const url = `http://localhost:${port}/`;
step(`Demo no ar: ${url}  (Ctrl+C para encerrar)`);
console.log('  Dica: Opções → Qualidade → Alto (com placa de vídeo) e deixe a arte assada ligada.');
openLater(url);
const srv = spawn(npm, ['run', 'preview', '--', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'inherit', shell: win });
srv.on('exit', (c) => process.exit(c ?? 0));
process.on('SIGINT', () => { srv.kill(); process.exit(0); });
