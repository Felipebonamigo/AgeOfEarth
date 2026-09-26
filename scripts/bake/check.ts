// `npm run art:check` (docs/ART.md §3.11): valida os manifestos de arte e, se public/art existir, os atlas gerados —
// todo quadro/animação/direção declarado está no JSON, âncoras em [0,1], nomes no padrão, retângulos dentro do atlas,
// hashes dos PNG iguais aos do índice e tamanhos dentro do orçamento da seção 6. Usado também por tests/art-manifest.test.ts.
// Não abre o navegador nem compara pixels (o bake não roda em CI).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { loadManifests, validateManifest, validateAll, expandFrames, animationsOf, posesOf, FRAME_NAME_RE, GROUP_OF, BUILDING_STATES, ICON_PX, type ArtManifest, type AssetKind } from './manifest.mjs';
import { PX_PER_TILE, PITCH_DEG, PIPELINE_VERSION, DIRS, FPS } from './page/camera.js';

/** Orçamento (docs/ART.md §6 e §3.5). Tamanhos de quadro a 1× (multiplicados pela escala). */
export const BUDGET = {
  maxAtlasSide: 2048,
  maxPngMB: 150,            // pacote completo a 1× estimado em 75–150 MB (§3.5)
  // texturas residentes, pior caso (§6: ≤ 250 MB a 1×) — POR ESCALA, em texels de 1×: uma partida carrega uma escala só
  // (1× ou 2×, pelo preset) e o pacote 2× é o mesmo conteúdo com 4× os texels, então vale vram(2×)/4 ≤ 250 (lote
  // distância-cerco da Etapa 4: a soma das duas escalas, 318,8 MB, deixou de dizer algo sobre uma partida)
  maxVramMB: 250,
  maxSourceSize: { unit: 128, building: 256, prop: 224, icon: ICON_PX } as Record<AssetKind | 'icon', number>,
};

interface SheetFrame { frame: { x: number; y: number; w: number; h: number }; spriteSourceSize: { x: number; y: number; w: number; h: number }; sourceSize: { w: number; h: number }; anchor: { x: number; y: number } }
interface Sheet { frames: Record<string, SheetFrame>; animations: Record<string, string[]>; meta: { image: string; size: { w: number; h: number }; scale: string; aoe: Record<string, unknown> } }
interface IndexAtlas { json: string; image: string; group: string; pass: string; scale: number; w: number; h: number; frames: number; bytes: number; sha256: string }
interface ArtIndex { version: number; aoe: Record<string, unknown>; atlases: IndexAtlas[]; assets: Record<string, { kind: AssetKind; mirror: boolean; variants?: string[]; variantBy?: string; icon?: boolean; rubble?: boolean; anims?: Record<string, unknown>; atlases: Record<string, Partial<Record<'color' | 'team' | 'shadow', string[]>>> }>; totals: { pngBytes: number; vramBytes: number } }

/** Poses que o manifesto de unidade pede (`pose` no arquivo do rig, `rider` no do cavaleiro) existem nos arquivos. */
export function poseErrors(root: string, m: ArtManifest): string[] {
  const e: string[] = [];
  const pf = posesOf(m);
  const read = (rel: string): { anims: Record<string, unknown> } | null => {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) { e.push(`${m.id}: poses ${rel} não existe`); return null; }
    return JSON.parse(fs.readFileSync(file, 'utf8')) as { anims: Record<string, unknown> };
  };
  const main = pf.main ? read(pf.main) : null, rider = pf.rider ? read(pf.rider) : null;
  for (const [a, d] of Object.entries(m.anims ?? {})) {
    if (main && d.pose && !main.anims[d.pose]) e.push(`${m.id}: pose ${d.pose} (${a}) ausente em ${pf.main}`);
    if (rider && d.rider && !rider.anims[d.rider]) e.push(`${m.id}: pose de cavaleiro ${d.rider} (${a}) ausente em ${pf.rider}`);
  }
  return e;
}

export interface CheckResult { errors: string[]; warnings: string[]; stats: { manifests: number; atlases: number; frames: number; pngBytes: number; vramBytes: number; vramByScale: Record<string, number>; hasArtifacts: boolean } }

export function runCheck(root: string): CheckResult {
  const errors: string[] = [], warnings: string[] = [];
  const loaded = loadManifests(path.join(root, 'art', 'manifest'));
  for (const l of loaded) for (const e of validateManifest(l.manifest)) errors.push(`${path.relative(root, l.file)}: ${e}`);
  const manifests = loaded.map((l) => l.manifest);
  errors.push(...validateAll(manifests));
  for (const l of loaded) if (path.basename(l.file) !== `${l.manifest.id}.json`) errors.push(`${path.relative(root, l.file)}: o nome do arquivo deve ser <id>.json`);
  for (const m of manifests) errors.push(...poseErrors(root, m));

  const outDir = path.join(root, 'public', 'art');
  const indexFile = path.join(outDir, 'manifest.json');
  const stats = { manifests: manifests.length, atlases: 0, frames: 0, pngBytes: 0, vramBytes: 0, vramByScale: {} as Record<string, number>, hasArtifacts: fs.existsSync(indexFile) };
  if (!stats.hasArtifacts) return { errors, warnings, stats };

  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8')) as ArtIndex;
  const sheets = new Map<string, Sheet>();
  for (const a of index.atlases) {
    const jf = path.join(outDir, a.json), pf = path.join(outDir, a.image);
    if (!fs.existsSync(jf) || !fs.existsSync(pf)) { errors.push(`atlas ${a.json}/${a.image} listado no índice mas ausente`); continue; }
    const buf = fs.readFileSync(pf);
    const png = PNG.sync.read(buf);
    const sheet = JSON.parse(fs.readFileSync(jf, 'utf8')) as Sheet;
    sheets.set(a.json, sheet);
    stats.atlases++; stats.pngBytes += buf.length; stats.vramBytes += png.width * png.height * 4;
    stats.vramByScale[a.scale] = (stats.vramByScale[a.scale] ?? 0) + png.width * png.height * 4;
    if (crypto.createHash('sha256').update(buf).digest('hex') !== a.sha256) errors.push(`${a.image}: sha256 difere do índice (rode art:bake --pack-only)`);
    if (png.width !== sheet.meta.size.w || png.height !== sheet.meta.size.h) errors.push(`${a.image}: tamanho ${png.width}×${png.height} ≠ meta.size`);
    if (png.width > BUDGET.maxAtlasSide || png.height > BUDGET.maxAtlasSide) errors.push(`${a.image}: maior que ${BUDGET.maxAtlasSide}²`);
    const aoe = sheet.meta.aoe;
    if (aoe.pxPerTile !== PX_PER_TILE * a.scale) errors.push(`${a.json}: meta.aoe.pxPerTile ${aoe.pxPerTile} ≠ ${PX_PER_TILE * a.scale}`);
    if (aoe.pitchDeg !== PITCH_DEG) errors.push(`${a.json}: meta.aoe.pitchDeg ${aoe.pitchDeg} ≠ ${PITCH_DEG}`);
    if (aoe.version !== PIPELINE_VERSION) errors.push(`${a.json}: meta.aoe.version ${aoe.version} ≠ ${PIPELINE_VERSION} (reasse)`);
    if (aoe.pass !== a.pass) errors.push(`${a.json}: meta.aoe.pass ${aoe.pass} ≠ ${a.pass}`);
    if (sheet.meta.image !== a.image || sheet.meta.scale !== String(a.scale)) errors.push(`${a.json}: meta.image/scale incoerentes`);
    for (const [name, f] of Object.entries(sheet.frames)) {
      stats.frames++;
      const kind: AssetKind | 'icon' = a.group === 'icons' ? 'icon' : (Object.keys(GROUP_OF) as AssetKind[]).find((k) => GROUP_OF[k] === a.group)!;
      if (!FRAME_NAME_RE[kind].test(name)) errors.push(`${a.json}: nome de quadro fora do padrão: ${name}`);
      const { x, y, w, h } = f.frame;
      if (x < 0 || y < 0 || x + w > png.width || y + h > png.height) errors.push(`${a.json}: ${name} fora do atlas`);
      if (!(f.anchor.x >= 0 && f.anchor.x <= 1 && f.anchor.y >= 0 && f.anchor.y <= 1)) errors.push(`${a.json}: ${name} âncora fora de [0,1]`);
      const s = f.spriteSourceSize;
      if (s.x < 0 || s.y < 0 || s.x + s.w > f.sourceSize.w || s.y + s.h > f.sourceSize.h || s.w !== w || s.h !== h) errors.push(`${a.json}: ${name} recorte fora do sourceSize`);
      const max = BUDGET.maxSourceSize[kind] * a.scale;
      if (f.sourceSize.w > max || f.sourceSize.h > max) errors.push(`${a.json}: ${name} sourceSize ${f.sourceSize.w}×${f.sourceSize.h} acima do orçamento ${max}`);
    }
    for (const [anim, list] of Object.entries(sheet.animations)) for (const n of list) if (!sheet.frames[n]) errors.push(`${a.json}: animação ${anim} referencia quadro ausente ${n}`);
  }

  // cada manifesto: todos os quadros declarados, nas três passagens pedidas, com todas as animações × direções
  for (const m of manifests) {
    const asset = index.assets[m.id];
    if (!asset) { warnings.push(`${m.id}: ainda não assado (fora de public/art/manifest.json)`); continue; }
    if (asset.kind !== m.kind) errors.push(`${m.id}: kind no índice (${asset.kind}) ≠ manifesto`);
    const mirror = !!asset.mirror;
    const all = expandFrames(m, { mirror });
    const expected = all.map((f) => f.name);
    // ícones: sem sombra, fora dos estados; `glow` (sobreposição aditiva do portal dos titãs): só cor, sem sombra
    const bodyFrames = all.filter((f) => !f.icon && f.anim !== 'glow').map((f) => f.name);
    if (m.kind === 'building') {
      // Etapa 3: estados, variantes e ícone declarados no índice como no manifesto
      if (JSON.stringify(asset.variants ?? null) !== JSON.stringify(m.variants ?? null)) errors.push(`${m.id}: variants do índice ≠ manifesto`);
      if (!m.rubble) for (const st of BUILDING_STATES) if (!asset.anims || !(st in asset.anims)) errors.push(`${m.id}: estado ${st} ausente no índice`);
      if (!!m.icon !== !!asset.icon) errors.push(`${m.id}: ícone ${m.icon ? 'ausente' : 'sobrando'} no índice`);
    }
    for (const [scale, byPass] of Object.entries(asset.atlases)) {
      const collect = (pass: 'color' | 'team' | 'shadow') => {
        const frames = new Map<string, SheetFrame>(); const anims: Record<string, string[]> = {};
        for (const j of byPass[pass] ?? []) { const sh = sheets.get(j); if (!sh) continue; for (const [k, v] of Object.entries(sh.frames)) frames.set(k, v); Object.assign(anims, sh.animations); }
        return { frames, anims };
      };
      const color = collect('color'), team = collect('team'), shadow = collect('shadow');
      const missing = expected.filter((n) => !color.frames.has(n));
      if (missing.length) errors.push(`${m.id} ${scale}×: ${missing.length} quadros de cor ausentes (ex.: ${missing.slice(0, 3).join(', ')})`);
      if (m.team) {
        const t = expected.filter((n) => team.frames.has(n)).length;
        if (t === 0) errors.push(`${m.id} ${scale}×: team = true mas nenhum quadro de máscara`);
        else if (t < expected.length) warnings.push(`${m.id} ${scale}×: ${expected.length - t} quadros sem máscara de time (parte de time escondida na pose)`);
      } else if (team.frames.size) errors.push(`${m.id} ${scale}×: team = false mas há máscara`);
      if (m.shadow) {
        const s = bodyFrames.filter((n) => !shadow.frames.has(n));
        if (s.length) errors.push(`${m.id} ${scale}×: ${s.length} quadros sem sombra (ex.: ${s.slice(0, 3).join(', ')})`);
      }
      // âncora e sourceSize comuns aos três passes de um mesmo quadro
      for (const n of expected) {
        const c = color.frames.get(n); if (!c) continue;
        for (const other of [team.frames.get(n), shadow.frames.get(n)]) if (other && (other.anchor.x !== c.anchor.x || other.anchor.y !== c.anchor.y || other.sourceSize.w !== c.sourceSize.w || other.sourceSize.h !== c.sourceSize.h)) errors.push(`${m.id}: ${n} com âncora/sourceSize diferente entre passes`);
      }
      if (m.kind === 'unit') {
        const anims = animationsOf(m, { mirror });
        for (const [k, list] of Object.entries(anims)) {
          const got = color.anims[k];
          if (!got) { errors.push(`${m.id} ${scale}×: animação ${k} ausente no JSON`); continue; }
          if (got.join() !== list.join()) errors.push(`${m.id} ${scale}×: animação ${k} com quadros diferentes do manifesto`);
        }
        for (const [a, d] of Object.entries(m.anims ?? {})) {
          for (let dir = 0; dir < (m.dirs ?? DIRS); dir++) if (!color.anims[`${m.id}/${a}/${dir}`]) errors.push(`${m.id}: ${a} sem a direção ${dir}`);
          if ((d.fps ?? FPS) <= 0) errors.push(`${m.id}: fps inválido em ${a}`);
        }
      }
    }
  }
  if (stats.pngBytes > BUDGET.maxPngMB * 1048576) errors.push(`PNG somam ${(stats.pngBytes / 1048576).toFixed(1)} MB > ${BUDGET.maxPngMB} MB`);
  for (const [s, bytes] of Object.entries(stats.vramByScale)) if (bytes / (Number(s) * Number(s)) > BUDGET.maxVramMB * 1048576) errors.push(`atlas ${s}× somam ${(bytes / 1048576).toFixed(1)} MB de VRAM > ${BUDGET.maxVramMB} MB × ${Number(s) * Number(s)} (texels de 1×)`);
  if (index.totals.pngBytes !== stats.pngBytes) errors.push('totals.pngBytes do índice difere dos arquivos');
  return { errors, warnings, stats };
}

export type { ArtManifest };

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const r = runCheck(root);
  for (const w of r.warnings) console.warn('aviso:', w);
  for (const e of r.errors) console.error('ERRO:', e);
  const s = r.stats;
  const vram = Object.entries(s.vramByScale).map(([k, v]) => `${(v / 1048576).toFixed(1)} MB a ${k}×`).join(', ');
  console.log(`art:check — ${s.manifests} manifestos` + (s.hasArtifacts ? `, ${s.atlases} atlas, ${s.frames} quadros, ${(s.pngBytes / 1048576).toFixed(2)} MB de PNG, VRAM se tudo carregado ${vram} (orçamento ${BUDGET.maxPngMB} MB de PNG / ${BUDGET.maxVramMB} MB por escala em texels de 1×)` : ' (public/art ainda não gerado)') + (r.errors.length ? ` — ${r.errors.length} erro(s)` : ' — ok'));
  process.exit(r.errors.length ? 1 : 0);
}
