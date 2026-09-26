#!/usr/bin/env node
// Fila de unidades sem o jogo (Etapa 4): lado a lado, na escala do jogo (1× = 32 px/tile, a zoom 1), cada unidade do
// atlas `units` em algumas poses — parado nas direções S/SE/E/N, um quadro de andar, de ataque e (se houver) de mira —
// com a sombra multiplicada a 0,45, a máscara de time tingida e a mesma âncora do renderizador; ampliada sem filtro.
// Serve para comparar silhuetas (a leitura "quem é quem" a zoom 1), escala contra o hoplita/cidadão, âncora e sombra SE
// logo depois do bake, sem abrir o navegador.
//
// Uso: node scripts/bake/lineup.mjs [--art public/art] [--scale 1] [--zoom 3] [--ids hoplite,militia,…]
//                                   [--team 0x3b82f6] [--out docs/art/etapa4-lote1-fila.png]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ART = path.resolve(ROOT, opt('--art', 'public/art'));
const SCALE = Number(opt('--scale', '1'));
const ZOOM = Number(opt('--zoom', '3'));
const OUT = path.resolve(ROOT, opt('--out', 'docs/art/etapa4-lote1-fila.png'));
const TEAM = Number(opt('--team', '0x3b82f6'));
const PPT = 32 * SCALE;

const index = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8'));
const units = Object.entries(index.assets).filter(([, a]) => a.kind === 'unit').map(([id]) => id);
const ids = opt('--ids', null)?.split(',') ?? units;
const frames = { color: new Map(), team: new Map(), shadow: new Map() };
const images = new Map();
for (const a of index.atlases) {
  if (a.group !== 'units' || a.scale !== SCALE) continue;
  const json = JSON.parse(fs.readFileSync(path.join(ART, a.json), 'utf8'));
  if (!images.has(a.image)) images.set(a.image, PNG.sync.read(fs.readFileSync(path.join(ART, a.image))));
  for (const [name, f] of Object.entries(json.frames)) frames[a.pass].set(name, { ...f, img: images.get(a.image) });
}
// colunas: poses a mostrar (anim, dir, quadro); a mira só para quem a tem
const POSES = [['idle', 2, 0], ['idle', 1, 0], ['idle', 0, 0], ['idle', 6, 0], ['walk', 1, 2], ['attack', 1, 1], ['aim', 1, 0], ['run', 1, 2]];
const cols = POSES.filter(([anim]) => ids.some((id) => index.assets[id]?.anims?.[anim]));
const CW = Math.round(1.6 * PPT), CH = Math.round(1.9 * PPT);   // célula: 1,6 × 1,9 tiles (pé a 72 %)
const cw = CW * cols.length, ch = CH * ids.length;
const out = new Uint8Array(cw * ch * 4);
for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
  const i = (y * cw + x) * 4, n = ((x * 73856093) ^ (y * 19349663)) & 7, cell = ((Math.floor(x / CW) + Math.floor(y / CH)) & 1) * 6;
  out[i] = 0x5f + n - 3 - cell; out[i + 1] = 0x7a + n - 3 - cell; out[i + 2] = 0x33 + n; out[i + 3] = 255;
}
function draw(f, px, py, mode, tint = 0xffffff) {
  const { img, frame: fr, spriteSourceSize: ss, sourceSize: so, anchor } = f;
  const ox = Math.round(px - anchor.x * so.w + ss.x), oy = Math.round(py - anchor.y * so.h + ss.y);
  const tr = ((tint >> 16) & 255) / 255, tg = ((tint >> 8) & 255) / 255, tb = (tint & 255) / 255;
  for (let y = 0; y < fr.h; y++) for (let x = 0; x < fr.w; x++) {
    const dx = ox + x, dy = oy + y;
    if (dx < 0 || dy < 0 || dx >= cw || dy >= ch) continue;
    const s = ((fr.y + y) * img.width + fr.x + x) * 4, d = (dy * cw + dx) * 4;
    const a = img.data[s + 3] / 255; if (!a) continue;
    if (mode === 'shadow') { const k = 1 - 0.45 * a; out[d] *= k; out[d + 1] *= k; out[d + 2] *= k; continue; }
    out[d] = img.data[s] * tr * a + out[d] * (1 - a); out[d + 1] = img.data[s + 1] * tg * a + out[d + 1] * (1 - a); out[d + 2] = img.data[s + 2] * tb * a + out[d + 2] * (1 - a);
  }
}
let n = 0;
ids.forEach((id, r) => cols.forEach(([anim, dir, i], c) => {
  const name = `${id}/${anim}/${dir}/${String(i).padStart(2, '0')}`;
  if (!frames.color.has(name)) return;
  const px = c * CW + CW / 2, py = r * CH + Math.round(CH * 0.72);
  const s = frames.shadow.get(name); if (s) draw(s, px, py, 'shadow');
  draw(frames.color.get(name), px, py, 'over');
  const t = frames.team.get(name); if (t) draw(t, px, py, 'over', TEAM);
  // pé: ponto de 1 px (âncora) para conferir
  const d = (py * cw + px) * 4; out[d] = 255; out[d + 1] = 255; out[d + 2] = 255;
  n++;
}));
const png = new PNG({ width: cw * ZOOM, height: ch * ZOOM });
for (let y = 0; y < ch * ZOOM; y++) for (let x = 0; x < cw * ZOOM; x++) {
  const s = (Math.floor(y / ZOOM) * cw + Math.floor(x / ZOOM)) * 4, d = (y * cw * ZOOM + x) * 4;
  png.data[d] = out[s]; png.data[d + 1] = out[s + 1]; png.data[d + 2] = out[s + 2]; png.data[d + 3] = 255;
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(png));
console.log(`fila: ${path.relative(ROOT, OUT)} — linhas ${ids.join(', ')} · colunas ${cols.map(([a, d, i]) => `${a}/${d}/${i}`).join(', ')} (${n} sprites, ${cw * ZOOM}×${ch * ZOOM})`);
