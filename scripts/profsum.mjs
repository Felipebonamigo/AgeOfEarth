// Resumo de um perfil de CPU do Node (.cpuprofile, de `node --cpu-prof`): as funções com mais tempo PRÓPRIO.
// Uso: npx tsx --cpu-prof --cpu-prof-dir /tmp/e10/prof scripts/perf.ts 30 && node scripts/profsum.mjs /tmp/e10/prof/<arquivo>.cpuprofile [25]
// (o tsx grava 2 perfis, o do lançador e o do script: passe o maior, `ls -S /tmp/e10/prof | head -1`)
import fs from 'node:fs';
const [file, topArg] = process.argv.slice(2);
const prof = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(prof.nodes.map((n) => [n.id, n]));
const self = new Map();
for (let i = 0; i < prof.samples.length; i++) { const n = byId.get(prof.samples[i]); const cf = n.callFrame; const key = `${cf.functionName || '(anônima)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`; self.set(key, (self.get(key) ?? 0) + (prof.timeDeltas[i] ?? 0)); }
const total = [...self.values()].reduce((a, b) => a + b, 0) || 1;
for (const [k, us] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(topArg ?? 25))) console.log(`${((us / total) * 100).toFixed(1).padStart(5)} %  ${(us / 1000).toFixed(0).padStart(7)} ms  ${k}`);
