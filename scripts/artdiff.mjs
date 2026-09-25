// Compara uma série de capturas (docs/art/<prefixo>-<nome>.png, geradas por scripts/artshot.mjs) com as referências em
// docs/art/ref/<nome>.png usando pixelmatch. Passa se, em cada captura, no máximo `tolerância` % dos pixels diferem
// (padrão 2 %, docs/ART.md §3.11). As imagens de diferença vão para scratch/artdiff/ (fora do git).
// Uso: node scripts/artdiff.mjs [prefixo=atual] [--tolerance 2] [--update]
//      --update: copia a série para docs/art/ref/ (só em mudança visual intencional, commitada junto)
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ART_SHOTS = ['z035', 'z13', 'z22', 'editor', 'cidade', 'batalha'];
const args = process.argv.slice(2);
const prefix = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--tolerance') ?? 'atual';
const tolerance = args.includes('--tolerance') ? Number(args[args.indexOf('--tolerance') + 1]) : 2;
const update = args.includes('--update');
const refDir = 'docs/art/ref', diffDir = 'scratch/artdiff';
mkdirSync(refDir, { recursive: true }); mkdirSync(diffDir, { recursive: true });

let failed = 0;
for (const name of ART_SHOTS) {
  const cur = join('docs/art', `${prefix}-${name}.png`), ref = join(refDir, `${name}.png`);
  if (!existsSync(cur)) { console.log(`${name.padEnd(8)} FALTA ${cur}`); failed++; continue; }
  if (update) { copyFileSync(cur, ref); console.log(`${name.padEnd(8)} referência atualizada → ${ref}`); continue; }
  if (!existsSync(ref)) { console.log(`${name.padEnd(8)} sem referência (${ref}); rode com --update`); failed++; continue; }
  const a = PNG.sync.read(readFileSync(cur)), b = PNG.sync.read(readFileSync(ref));
  if (a.width !== b.width || a.height !== b.height) { console.log(`${name.padEnd(8)} FALHOU tamanho ${a.width}×${a.height} ≠ ${b.width}×${b.height}`); failed++; continue; }
  const out = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold: 0.1 });
  const pct = (100 * n) / (a.width * a.height);
  const ok = pct <= tolerance;
  if (!ok) failed++;
  const diffFile = join(diffDir, `${prefix}-${name}.png`);
  writeFileSync(diffFile, PNG.sync.write(out));
  console.log(`${name.padEnd(8)} ${ok ? 'ok    ' : 'FALHOU'} ${pct.toFixed(2).padStart(6)} % diferentes (${n} px, tolerância ${tolerance} %)${ok ? '' : ' → ' + diffFile}`);
}
console.log(update ? `referências em ${refDir}` : failed ? `artdiff: ${failed} captura(s) fora da tolerância` : 'artdiff: todas dentro da tolerância');
process.exit(failed ? 1 : 0);
