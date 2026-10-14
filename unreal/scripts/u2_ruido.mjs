// Gera uma textura de ruído fBm 256×256 que se repete sem emenda (para fumaça/poeira): Content/Fontes/fx/T_Ruido.png
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
const N = 256, png = new PNG({ width: N, height: N });
const h = (x, y, s) => { let n = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const sm = (t) => t * t * (3 - 2 * t);
const valor = (x, y, p, s) => { const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
  const g = (a, b) => h(((a % p) + p) % p, ((b % p) + p) % p, s);
  return (g(xi, yi) * (1 - fx) + g(xi + 1, yi) * fx) * (1 - fy) + (g(xi, yi + 1) * (1 - fx) + g(xi + 1, yi + 1) * fx) * fy; };
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  let v = 0, a = 0.5, f = 4;
  for (let o = 0; o < 5; o++) { v += a * valor(x / N * f, y / N * f, f, o + 1); a *= 0.5; f *= 2; }
  const c = Math.max(0, Math.min(255, Math.round(v * 255)));
  const i = (y * N + x) * 4; png.data[i] = png.data[i + 1] = png.data[i + 2] = c; png.data[i + 3] = 255;
}
const out = path.resolve('unreal/AgeOfEarthUE/Content/Fontes/fx/T_Ruido.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, PNG.sync.write(png));
console.log('ok', out);
