// U2: prepara unreal/AgeOfEarthUE/Dados/hud/ para o HUD do cliente Unreal (lido em tempo de execução, sem importar assets):
//   Cinzel-600.ttf / Cinzel-400.ttf  fonte dos títulos e números (OFL; convertida do WOFF do @fontsource/cinzel já instalado)
//   icones.png + icones.json         ícones de recursos, Eras, unidades e edifícios do atlas `hud` do jogo web (public/art/hud-2x-*)
//   painel.png                       textura do painel (bronze escovado com a grega em ouro), 9-slice
// Uso: node unreal/scripts/u2_hud_dados.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PNG } from 'pngjs';

const out = path.resolve('unreal/AgeOfEarthUE/Dados/hud');
fs.mkdirSync(out, { recursive: true });

// ---- WOFF 1.0 -> TTF (tabelas zlib descompactadas, diretório refeito) ----
function woffToTtf(buf) {
  if (buf.readUInt32BE(0) !== 0x774f4646) throw new Error('não é WOFF 1.0');
  const flavor = buf.readUInt32BE(4), numTables = buf.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = buf.readUInt32BE(o), off = buf.readUInt32BE(o + 4), comp = buf.readUInt32BE(o + 8), orig = buf.readUInt32BE(o + 12), sum = buf.readUInt32BE(o + 16);
    const raw = buf.subarray(off, off + comp);
    tables.push({ tag, sum, data: comp < orig ? zlib.inflateSync(raw) : Buffer.from(raw) });
  }
  let es = 0; while ((1 << (es + 1)) <= numTables) es++;
  const sr = (1 << es) * 16;
  const head = Buffer.alloc(12 + 16 * numTables);
  head.writeUInt32BE(flavor, 0); head.writeUInt16BE(numTables, 4); head.writeUInt16BE(sr, 6); head.writeUInt16BE(es, 8); head.writeUInt16BE(numTables * 16 - sr, 10);
  let off = head.length; const body = [];
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    head.writeUInt32BE(t.tag, o); head.writeUInt32BE(t.sum, o + 4); head.writeUInt32BE(off, o + 8); head.writeUInt32BE(t.data.length, o + 12);
    const pad = (4 - (t.data.length % 4)) % 4;
    body.push(t.data, Buffer.alloc(pad)); off += t.data.length + pad;
  });
  return Buffer.concat([head, ...body]);
}
for (const w of ['400', '600', '700']) {
  const src = path.resolve(`node_modules/@fontsource/cinzel/files/cinzel-latin-${w}-normal.woff`);
  if (fs.existsSync(src)) fs.writeFileSync(path.join(out, `Cinzel-${w}.ttf`), woffToTtf(fs.readFileSync(src)));
}

// ---- ícones: recorta do atlas hud 2x os grupos que o HUD usa e monta uma página única ----
const quer = (k) => /^(res|age|unit|bld|god|power)\//.test(k);
const frames = [];
for (const pag of fs.readdirSync('public/art').filter((f) => /^hud-2x-\d+\.json$/.test(f))) {
  const j = JSON.parse(fs.readFileSync(path.join('public/art', pag), 'utf8'));
  const img = PNG.sync.read(fs.readFileSync(path.join('public/art', j.meta?.image ?? pag.replace('.json', '.png'))));
  for (const [k, f] of Object.entries(j.frames)) if (quer(k)) frames.push({ k, f, img });
}
const cel = 128, cols = 16, rows = Math.ceil(frames.length / cols);
const pg = new PNG({ width: cols * cel, height: rows * cel });
const mapa = {};
frames.forEach(({ k, f, img }, i) => {
  const cx = (i % cols) * cel, cy = Math.floor(i / cols) * cel;
  // o recorte (trim) ocupa a célula inteira, centrado, com 6 % de margem: ícones pequenos no atlas ficam do mesmo tamanho dos outros
  const { x, y, w, h } = f.frame;
  const esc = (cel * 0.88) / Math.max(w, h), dw = Math.round(w * esc), dh = Math.round(h * esc);
  const ox = cx + Math.floor((cel - dw) / 2), oy = cy + Math.floor((cel - dh) / 2);
  for (let yy = 0; yy < dh; yy++) for (let xx = 0; xx < dw; xx++) {
    const sx = Math.min(w - 1, Math.floor(xx / esc)), sy = Math.min(h - 1, Math.floor(yy / esc));
    const si = ((y + sy) * img.width + (x + sx)) * 4, di = ((oy + yy) * pg.width + (ox + xx)) * 4;
    for (let c = 0; c < 4; c++) pg.data[di + c] = img.data[si + c];
  }
  mapa[k] = [cx / pg.width, cy / pg.height, cel / pg.width, cel / pg.height];
});
fs.writeFileSync(path.join(out, 'icones.png'), PNG.sync.write(pg));
fs.writeFileSync(path.join(out, 'icones.json'), JSON.stringify(mapa));

// ---- painel: bronze escuro escovado, borda dupla em ouro e a grega (meandro) numa faixa ----
const W = 512, H = 128, p = new PNG({ width: W, height: H });
const hash = (a, b) => { let n = (a * 374761393 + b * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const ouro = [196, 158, 82], ouroEsc = [120, 92, 40];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  const escova = 0.92 + 0.08 * hash(x >> 2, y * 7) ;
  const v = (1 - y / H) * 0.25 + 0.75;
  let c = [38 * v * escova, 30 * v * escova, 22 * v * escova], a = 232;
  const b = Math.min(x, y, W - 1 - x, H - 1 - y);
  if (b < 2) c = ouroEsc; else if (b < 4) c = ouro; else if (b < 6) c = [20, 16, 12];
  // grega: faixa de 14 px abaixo do topo, módulo de 16 px
  const gy = y - 9;
  if (gy >= 0 && gy < 14 && b >= 6) {
    const mx = (x - 6) % 16, my = gy;
    const on = my === 0 || my === 13 || (mx >= 0 && mx < 2 && my < 12) || (my >= 10 && my < 12 && mx < 12) || (mx >= 10 && mx < 12 && my >= 4 && my < 12) || (my >= 4 && my < 6 && mx >= 5 && mx < 12) || (mx >= 5 && mx < 7 && my >= 4 && my < 8);
    if (on) c = ouro;
  }
  p.data[i] = c[0]; p.data[i + 1] = c[1]; p.data[i + 2] = c[2]; p.data[i + 3] = a;
}
fs.writeFileSync(path.join(out, 'painel.png'), PNG.sync.write(p));
console.log('ok', Object.keys(mapa).length, 'ícones;', fs.readdirSync(out).join(' '));
