#!/usr/bin/env node
// Prévia de cidade sem o jogo (docs/ART.md Etapa 3): monta uma cena a partir dos atlas de edifícios já empacotados —
// Centro Cívico, casas, templo, muralha fechada com portões e torres, obras, dano e escombros — com as mesmas regras do
// renderizador (âncora no centro da área, sombras multiplicadas a 0,45 antes dos corpos, ordem pelo y, máscara de time
// tingida, bitmask da muralha pelos vizinhos muralha/portão/torre do mesmo dono, eixo do portão). Serve para conferir
// costuras da muralha, escala e âncoras logo depois do bake, sem abrir o navegador.
//
// Uso: node scripts/bake/compose.mjs [--art public/art] [--scale 1|2] [--zoom 2] [--out docs/art/etapa3-composicao.png]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ART = path.resolve(ROOT, opt('--art', 'public/art'));
const SCALE = Number(opt('--scale', '1'));
const ZOOM = Number(opt('--zoom', '2'));
const OUT = path.resolve(ROOT, opt('--out', 'docs/art/etapa3-composicao.png'));
const PPT = 32 * SCALE;
const TEAM = [0x3b82f6, 0xef4444];

// ---------- atlas ----------
const index = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8'));
const frames = { color: new Map(), team: new Map(), shadow: new Map() };
const images = new Map();
for (const a of index.atlases) {
  if (a.group !== 'buildings' || a.scale !== SCALE) continue;
  const json = JSON.parse(fs.readFileSync(path.join(ART, a.json), 'utf8'));
  if (!images.has(a.image)) images.set(a.image, PNG.sync.read(fs.readFileSync(path.join(ART, a.image))));
  for (const [name, f] of Object.entries(json.frames)) frames[a.pass].set(name, { ...f, img: images.get(a.image), k: 1 / (a.texel ?? 1) });   // sombra a ½: k = 2
}
const has = (name) => frames.color.has(name);

// ---------- cena ----------
const W = 26, H = 20;
/** Edifícios: { type, tx, ty, w, h, owner, state, variant } (tx/ty = canto do footprint em tiles). */
const B = [];
const at = new Map();
const add = (type, tx, ty, w, h, extra = {}) => { const b = { type, tx, ty, w, h, owner: 0, state: 'complete', ...extra }; B.push(b); for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) at.set(`${x},${y}`, b); return b; };
// muralha: retângulo (3,2)–(22,17) com torres nos cantos, portão ao sul e a leste
const x0 = 3, y0 = 2, x1 = 22, y1 = 17;
for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) add(x === 12 && y === y1 ? 'gate' : (x === x0 || x === x1) ? 'tower' : 'wall', x, y, 1, 1);
for (let y = y0 + 1; y < y1; y++) for (const x of [x0, x1]) add(x === x1 && y === 9 ? 'gate' : 'wall', x, y, 1, 1);
// trecho interno em L e um pilar solto
for (let y = 11; y <= 14; y++) add('wall', 17, y, 1, 1);
for (let x = 18; x <= 19; x++) add('wall', x, 11, 1, 1);
add('wall', 20, 14, 1, 1);
// dano e obra na muralha norte
at.get(`8,${y0}`).state = 'damage1'; at.get(`9,${y0}`).state = 'damage2'; at.get(`10,${y0}`).state = 'damage1';
for (let x = 14; x <= 16; x++) at.get(`${x},${y0}`).state = ['build0', 'build1', 'build2'][x - 14];
// cidade
add('town_center', 10, 7, 3, 3, { variant: 'a1' });
add('temple', 15, 5, 3, 3);
add('house', 6, 4, 2, 2); add('house', 6, 7, 2, 2, { state: 'damage1' }); add('house', 6, 11, 2, 2, { state: 'damage2' });
add('house', 9, 12, 2, 2, { state: 'build1' }); add('house', 13, 12, 2, 2);
add('house', 18, 7, 2, 2, { owner: 1 });
const rubble = [{ x: 9.5, y: 4.5, w: 2, h: 2 }];
// portão sul aberto
at.get(`12,${y1}`).state = 'open';

const LINK = new Set(['wall', 'gate', 'tower']);
function mask(b) {
  const n = (dx, dy) => { const o = at.get(`${b.tx + dx},${b.ty + dy}`); return !!o && o !== b && LINK.has(o.type) && o.owner === b.owner; };
  return (n(0, -1) ? 1 : 0) | (n(1, 0) ? 2 : 0) | (n(0, 1) ? 4 : 0) | (n(-1, 0) ? 8 : 0);
}
function frameName(b) {
  let v = b.variant;
  // muralha e torre por bitmask (a torre só muda a sombra); reta com estandarte a cada 3 tiles, como no jogo (wallFlagAt)
  if (b.type === 'wall' || b.type === 'tower') { const m = mask(b); v = String(m).padStart(2, '0'); if (b.type === 'wall' && (m === 5 || m === 10) && (((b.tx + b.ty) % 3) + 3) % 3 === 0) v += 'f'; }
  if (b.type === 'gate') { const m = mask(b); v = (m & 5) && !(m & 10) ? 'ns' : 'ew'; }
  const n = v ? `${b.type}/${b.state}/${v}` : `${b.type}/${b.state}`;
  return has(n) ? n : v ? `${b.type}/complete/${v}` : `${b.type}/complete`;
}

// ---------- composição ----------
const cw = W * PPT, ch = H * PPT;
const out = new Uint8Array(cw * ch * 4);
for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
  const i = (y * cw + x) * 4, n = ((x * 73856093) ^ (y * 19349663)) & 7;
  out[i] = 0x5f + n - 3; out[i + 1] = 0x7a + n - 3; out[i + 2] = 0x33 + n; out[i + 3] = 255;
}
/** Desenha o quadro `f` com a âncora em (px, py): modo 'over' (alfa), 'shadow' (multiplica 1 − 0,45·a) ou tinta (máscara). */
function draw(f, px, py, mode, tint = 0xffffff) {
  const { img, frame: fr, spriteSourceSize: ss, sourceSize: so, anchor, k } = f;
  const ox = Math.round(px - (anchor.x * so.w - ss.x) * k), oy = Math.round(py - (anchor.y * so.h - ss.y) * k);
  const tr = ((tint >> 16) & 255) / 255, tg = ((tint >> 8) & 255) / 255, tb = (tint & 255) / 255;
  for (let y = 0; y < fr.h * k; y++) for (let x = 0; x < fr.w * k; x++) {
    const dx = ox + x, dy = oy + y;
    if (dx < 0 || dy < 0 || dx >= cw || dy >= ch) continue;
    const s = ((fr.y + Math.floor(y / k)) * img.width + fr.x + Math.floor(x / k)) * 4, d = (dy * cw + dx) * 4;
    const a = img.data[s + 3] / 255; if (!a) continue;
    if (mode === 'shadow') { const k = 1 - 0.45 * a; out[d] *= k; out[d + 1] *= k; out[d + 2] *= k; continue; }
    const r = img.data[s] * tr, g = img.data[s + 1] * tg, bl = img.data[s + 2] * tb;
    out[d] = r * a + out[d] * (1 - a); out[d + 1] = g * a + out[d + 1] * (1 - a); out[d + 2] = bl * a + out[d + 2] * (1 - a);
  }
}
const items = [];
for (const b of B) items.push({ name: frameName(b), x: (b.tx + b.w / 2) * PPT, y: (b.ty + b.h / 2) * PPT, z: b.ty + b.h / 2, owner: b.owner });
for (const r of rubble) items.push({ name: `rubble/${r.w}x${r.h}`, x: r.x * PPT, y: r.y * PPT, z: r.y - r.h / 2, owner: 0 });
const missing = items.filter((it) => !has(it.name)).map((it) => it.name);
if (missing.length) console.warn('sem quadro:', [...new Set(missing)].join(', '));
const ok = items.filter((it) => has(it.name));
for (const it of ok) { const s = frames.shadow.get(it.name); if (s) draw(s, it.x, it.y, 'shadow'); }
ok.sort((a, b) => a.z - b.z);
for (const it of ok) {
  draw(frames.color.get(it.name), it.x, it.y, 'over');
  const t = frames.team.get(it.name); if (t) draw(t, it.x, it.y, 'over', TEAM[it.owner]);
}
// ampliação sem filtro
const png = new PNG({ width: cw * ZOOM, height: ch * ZOOM });
for (let y = 0; y < ch * ZOOM; y++) for (let x = 0; x < cw * ZOOM; x++) {
  const s = (Math.floor(y / ZOOM) * cw + Math.floor(x / ZOOM)) * 4, d = (y * cw * ZOOM + x) * 4;
  png.data[d] = out[s]; png.data[d + 1] = out[s + 1]; png.data[d + 2] = out[s + 2]; png.data[d + 3] = 255;
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(png));
console.log(`composição: ${path.relative(ROOT, OUT)} (${cw * ZOOM}×${ch * ZOOM}, ${ok.length} sprites)`);
