#!/usr/bin/env node
// Funde num índice de atlas existente (public/art/manifest.json) os grupos que um bake parcial empacotou numa pasta de
// rascunho, sem reassar o resto: útil num contêiner novo, em que o cache do bake (art/cache, fora do git) está vazio e
// `art:bake --only …` sem `--out` refaria os atlas só com o que houver no cache. Para cada grupo presente no rascunho:
// tira do índice os atlas desse grupo e os assets que apontam para ele, põe os do rascunho, copia as páginas (PNG +
// JSON) e recalcula os totais. Os demais grupos, arquivos e assets ficam intactos.
// Uso: node scripts/bake/bake.mjs --only props-trees,props-nodes --scale 1,2 --out <rascunho>
//      node scripts/bake/merge-group.mjs <rascunho> [--into public/art] [--groups props]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const src = args[0] && !args[0].startsWith('--') ? path.resolve(args[0]) : null;
if (!src) { console.error('uso: node scripts/bake/merge-group.mjs <pasta do bake parcial> [--into public/art] [--groups props,…]'); process.exit(2); }
const into = path.resolve(ROOT, opt('--into', 'public/art'));
const read = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const part = read(src), full = read(into);
const groups = opt('--groups', null)?.split(',') ?? [...new Set(part.atlases.map((a) => a.group))];
if (!groups.length) { console.error('o rascunho não tem atlas'); process.exit(1); }

// assets do rascunho só dos grupos fundidos, e que tenham TODAS as escalas que o índice tinha para eles
const partAssets = Object.fromEntries(Object.entries(part.assets).filter(([, a]) => groups.includes(a.group)));
for (const [id, a] of Object.entries(partAssets)) {
  const before = full.assets[id];
  if (before) for (const sc of Object.keys(before.atlases)) if (!a.atlases[sc]) { console.error(`${id}: o rascunho não tem a escala ${sc}× que o índice tinha (asse com --scale 1,2)`); process.exit(1); }
}
// todo asset do índice que usa um desses grupos precisa estar no rascunho (senão perderia os quadros ao trocar as páginas)
for (const [id, a] of Object.entries(full.assets)) if (groups.includes(a.group) && !partAssets[id]) { console.error(`${id} usa o grupo ${a.group} e não está no rascunho: asse junto (--only …,${id})`); process.exit(1); }

const oldFiles = full.atlases.filter((a) => groups.includes(a.group)).flatMap((a) => [a.json, a.image]);
full.atlases = [...full.atlases.filter((a) => !groups.includes(a.group)), ...part.atlases.filter((a) => groups.includes(a.group))];
for (const id of Object.keys(full.assets)) if (groups.includes(full.assets[id].group)) delete full.assets[id];
Object.assign(full.assets, partAssets);
full.assets = Object.fromEntries(Object.entries(full.assets).sort(([a], [b]) => a.localeCompare(b)));
full.totals = { pngBytes: full.atlases.reduce((s, a) => s + a.bytes, 0), vramBytes: full.atlases.reduce((s, a) => s + a.w * a.h * 4, 0), atlases: full.atlases.length };

const newFiles = part.atlases.filter((a) => groups.includes(a.group)).flatMap((a) => [a.json, a.image]);
for (const f of oldFiles) if (!newFiles.includes(f)) fs.rmSync(path.join(into, f), { force: true });
for (const f of newFiles) fs.copyFileSync(path.join(src, f), path.join(into, f));
fs.writeFileSync(path.join(into, 'manifest.json'), JSON.stringify(full, null, 1) + '\n');   // mesmo formato do bake.mjs
console.log(`fundido(s) ${groups.join(', ')}: ${newFiles.length / 2} página(s), assets ${Object.keys(partAssets).join(', ')}; índice com ${full.totals.atlases} atlas, ${(full.totals.pngBytes / 1048576).toFixed(2)} MB em PNG`);
