// Terreno por shader (docs/ART.md §3.6): a geometria é um quad (2 triângulos) por chunk de 16×16 tiles, todos num
// único Mesh com o mesmo Shader e os mesmos uniforms; o culling por visibleTiles reescreve só o índice (os chunks
// fora da tela não entram no draw), então o terreno inteiro custa 1 draw call em qualquer zoom (81 meshes separados
// custariam até 81 a zoom 0,35 num mapa 144×144, acima do orçamento de 40 da §6). Os dados do mapa vivem em três
// texturas w×h (um texel por tile): uWeights (pesos de material, bilinear), uKind (água/profundidade/grama seca/altura
// da montanha, bilinear) e uOwner (dono do território, nearest). invalidateRect reescreve só os bytes do retângulo e
// sobe a textura (source.update()); território muda → só uOwner. Nada de generateTexture: não há textura por chunk.
// A malha de 16×16 quads por chunk (relevo por vértice) do preset alto não compensa numa câmera ortográfica de topo
// (o deslocamento vertical não aparece), por isso todos os presets usam 2 triângulos por chunk.
import { BufferImageSource, Mesh, MeshGeometry, Shader, UniformGroup } from 'pixi.js';
import { TILE, TERRAIN, PLAYER_COLORS } from '../../core/constants';
import { FOAM, GRASS_DRY, MOUNTAIN_TOP, SUN_DIR, TERRAIN_PALETTE } from '../palette';
import type { Quality } from '../quality';
import { cachedMaterials, generateMaterials, generateMaterialsLazy, writeOwner, writeTerrainRect, TERRAIN_INFLUENCE, type MaterialSize, type TerrainMaterials, type TerrainSource } from './materials';
import { TERRAIN_FRAG_FULL, TERRAIN_FRAG_SIMPLE, TERRAIN_VERT } from './shaders';

export const CHUNK = 16;
export type TerrainQuality = Pick<Quality, 'terrainShader' | 'normalMaps' | 'water'>;

/** Lado dos materiais por preset: 512² no completo, 256² no simples (preset baixo / Deck). */
export function materialSizeFor(q: TerrainQuality): MaterialSize { return q.terrainShader === 'simple' ? 256 : 512; }

// ---------------- Materiais na GPU (compartilhados entre partidas; nunca destruídos) ----------------
interface GpuMaterials { grass: BufferImageSource; grassN: BufferImageSource; dirt: BufferImageSource; dirtN: BufferImageSource; sand: BufferImageSource; sandN: BufferImageSource; rock: BufferImageSource; rockN: BufferImageSource; water: BufferImageSource; macro: BufferImageSource }
const gpuCache = new Map<number, GpuMaterials>();
const pending = new Map<number, Generator<string, TerrainMaterials, void>>();

/** Começa a gerar os materiais em segundo plano (um material por macrotarefa), para a primeira partida não esperar. */
export function prewarmTerrain(size: MaterialSize): void {
  if (cachedMaterials(size) || pending.has(size)) return;
  const g = generateMaterialsLazy(size);
  pending.set(size, g);
  const step = () => { if (pending.get(size) !== g) return; if (g.next().done) pending.delete(size); else setTimeout(step, 0); };
  setTimeout(step, 0);
}
/** Materiais prontos (termina a geração em curso de uma vez, se preciso). */
function ensureMaterials(size: MaterialSize): TerrainMaterials {
  const hit = cachedMaterials(size);
  if (hit) return hit;
  const g = pending.get(size);
  if (g) { pending.delete(size); for (;;) { const r = g.next(); if (r.done) return r.value; } }
  return generateMaterials(size);
}
function repeatSource(data: Uint8Array, size: number): BufferImageSource {
  return new BufferImageSource({ resource: data, width: size, height: size, format: 'rgba8unorm', scaleMode: 'linear', mipmapFilter: 'linear', addressMode: 'repeat', autoGenerateMipmaps: true, alphaMode: 'no-premultiply-alpha' });
}
function gpuMaterials(size: MaterialSize): GpuMaterials {
  const hit = gpuCache.get(size);
  if (hit) return hit;
  const m = ensureMaterials(size);
  const g: GpuMaterials = {
    grass: repeatSource(m.grass.albedo, size), grassN: repeatSource(m.grass.normal, size),
    dirt: repeatSource(m.dirt.albedo, size), dirtN: repeatSource(m.dirt.normal, size),
    sand: repeatSource(m.sand.albedo, size), sandN: repeatSource(m.sand.normal, size),
    rock: repeatSource(m.rock.albedo, size), rockN: repeatSource(m.rock.normal, size),
    water: repeatSource(m.waterNormal, Math.sqrt(m.waterNormal.length / 4)), macro: repeatSource(m.macro, Math.sqrt(m.macro.length / 4)),
  };
  gpuCache.set(size, g);
  return g;
}

const rgb01 = (c: number) => new Float32Array([((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]);
/** Fator por canal que leva a grama viva à seca (GRASS_DRY / GRASS), aplicado pelas manchas secas do shader. */
function dryFactor(): Float32Array {
  const a = rgb01(TERRAIN_PALETTE[TERRAIN.GRASS]), b = rgb01(GRASS_DRY);
  return new Float32Array([b[0] / a[0], b[1] / a[1], b[2] / a[2]]);
}
function sunVector(): Float32Array {
  const l = Math.sqrt(SUN_DIR.x * SUN_DIR.x + SUN_DIR.y * SUN_DIR.y + SUN_DIR.z * SUN_DIR.z);
  return new Float32Array([SUN_DIR.x / l, SUN_DIR.y / l, SUN_DIR.z / l]);
}

/** Um quad por chunk: posições em px do mundo, uv em tiles (o shader trabalha em tiles). */
function buildGeometry(w: number, h: number, cw: number, ch: number): MeshGeometry {
  const n = cw * ch;
  const pos = new Float32Array(n * 8), uv = new Float32Array(n * 8);
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    const k = (cy * cw + cx) * 8;
    const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = Math.min(w, x0 + CHUNK), y1 = Math.min(h, y0 + CHUNK);
    const q = [x0, y0, x1, y0, x1, y1, x0, y1];
    for (let i = 0; i < 8; i++) { uv[k + i] = q[i]; pos[k + i] = q[i] * TILE; }
  }
  return new MeshGeometry({ positions: pos, uvs: uv, indices: new Uint32Array(0) });
}

export class ChunkMesh {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  /** Bytes das texturas de dados (w·h·4 cada); expostos para testes e diagnóstico. */
  readonly weights: Uint8Array; readonly kind: Uint8Array; readonly owner: Uint8Array;
  readonly cw: number; readonly ch: number;
  /** Chunks desenhados no último cull. */
  visibleChunks = 0;
  /** Custo (ms de cálculo) da geração dos materiais em uso, para diagnóstico/QA. */
  materialsMs = 0;
  private wSrc: BufferImageSource; private kSrc: BufferImageSource; private oSrc: BufferImageSource;
  private group: UniformGroup;
  private shader: Shader | null = null;
  private shaderKey = '';
  private cullKey = '';

  constructor(private map: TerrainSource, quality: TerrainQuality) {
    const { w, h } = map;
    this.cw = Math.ceil(w / CHUNK); this.ch = Math.ceil(h / CHUNK);
    this.weights = new Uint8Array(w * h * 4); this.kind = new Uint8Array(w * h * 4); this.owner = new Uint8Array(w * h * 4);
    writeTerrainRect(map, this.weights, this.kind, 0, 0, w - 1, h - 1);
    const data = (resource: Uint8Array, scaleMode: 'linear' | 'nearest') => new BufferImageSource({ resource, width: w, height: h, format: 'rgba8unorm', scaleMode, addressMode: 'clamp-to-edge', alphaMode: 'no-premultiply-alpha' });
    this.wSrc = data(this.weights, 'linear'); this.kSrc = data(this.kind, 'linear'); this.oSrc = data(this.owner, 'nearest');
    this.group = new UniformGroup({
      uSize: { value: new Float32Array([w, h]), type: 'vec2<f32>' },
      uTime: { value: 0, type: 'f32' },
      uSun: { value: sunVector(), type: 'vec3<f32>' },
      uZoom: { value: 1, type: 'f32' },
      uNormals: { value: 1, type: 'f32' },
      uWaterAnim: { value: 1, type: 'f32' },
      uLine: { value: 1.5, type: 'f32' },
      uLineAlpha: { value: 0.6, type: 'f32' },
      uTint: { value: 0.07, type: 'f32' },
      uShallow: { value: rgb01(TERRAIN_PALETTE[TERRAIN.WATER]), type: 'vec3<f32>' },
      uDeep: { value: rgb01(TERRAIN_PALETTE[TERRAIN.DEEP]), type: 'vec3<f32>' },
      uFoam: { value: rgb01(FOAM), type: 'vec3<f32>' },
      uTop: { value: rgb01(MOUNTAIN_TOP), type: 'vec3<f32>' },
      uDry: { value: dryFactor(), type: 'vec3<f32>' },
    });
    this.mesh = new Mesh({ geometry: buildGeometry(w, h, this.cw, this.ch), shader: this.makeShader(quality) });
    this.mesh.visible = false;
  }

  private get u(): Record<string, unknown> { return this.group.uniforms as Record<string, unknown>; }

  private makeShader(q: TerrainQuality): Shader {
    const size = materialSizeFor(q);
    const simple = q.terrainShader === 'simple';
    this.shaderKey = `${q.terrainShader}:${size}`;
    const m = gpuMaterials(size);
    this.materialsMs = ensureMaterials(size).ms;
    const resources: Record<string, unknown> = {
      terrainUniforms: this.group, uWeights: this.wSrc, uKind: this.kSrc, uOwner: this.oSrc,
      uGrass: m.grass, uDirt: m.dirt, uSand: m.sand, uRock: m.rock,
    };
    if (!simple) Object.assign(resources, { uMacro: m.macro, uGrassN: m.grassN, uDirtN: m.dirtN, uSandN: m.sandN, uRockN: m.rockN, uWaterN: m.water });
    const shader = Shader.from({ gl: { vertex: TERRAIN_VERT, fragment: simple ? TERRAIN_FRAG_SIMPLE : TERRAIN_FRAG_FULL, name: simple ? 'terrain-simple' : 'terrain-full' }, resources });
    this.shader?.destroy();
    this.shader = shader;
    this.u.uNormals = q.normalMaps ? 1 : 0;
    this.u.uWaterAnim = q.water === 'animated' ? 1 : 0;
    return shader;
  }

  /** Aplica o preset: troca o shader (completo/simples, materiais 512²/256²) só se preciso; normais e água por uniform. */
  setQuality(q: TerrainQuality): void {
    if (`${q.terrainShader}:${materialSizeFor(q)}` !== this.shaderKey) this.mesh.shader = this.makeShader(q);
    this.u.uNormals = q.normalMaps ? 1 : 0;
    this.u.uWaterAnim = q.water === 'animated' ? 1 : 0;
  }

  /** Tempo (s, para a água) e zoom da câmera (a fronteira tem largura constante em px de tela). */
  frame(time: number, zoom: number): void { this.u.uTime = time % 3600; this.u.uZoom = zoom; }

  /** Desenha só os chunks que tocam o retângulo de tiles visível (reescreve o índice só quando o conjunto muda). */
  cull(v: { x0: number; y0: number; x1: number; y1: number }): void {
    const cx0 = Math.max(0, Math.floor(v.x0 / CHUNK)), cy0 = Math.max(0, Math.floor(v.y0 / CHUNK));
    const cx1 = Math.min(this.cw - 1, Math.floor(v.x1 / CHUNK)), cy1 = Math.min(this.ch - 1, Math.floor(v.y1 / CHUNK));
    const key = `${cx0},${cy0},${cx1},${cy1}`;
    if (key === this.cullKey) return;
    this.cullKey = key;
    const n = Math.max(0, cx1 - cx0 + 1) * Math.max(0, cy1 - cy0 + 1);
    this.visibleChunks = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    const idx = new Uint32Array(n * 6);
    let k = 0;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const b = (cy * this.cw + cx) * 4;
      idx[k++] = b; idx[k++] = b + 1; idx[k++] = b + 2; idx[k++] = b; idx[k++] = b + 2; idx[k++] = b + 3;
    }
    this.mesh.geometry.indices = idx;
  }

  /**
   * O terreno mudou no retângulo [x0,x1]×[y0,y1] (inclusivo): reescreve os bytes de uWeights/uKind dos tiles do
   * retângulo ampliado em TERRAIN_INFLUENCE (profundidade da água e altura da montanha dependem dos vizinhos) e sobe as
   * duas texturas. Nenhum mesh é recriado.
   */
  invalidateRect(x0: number, y0: number, x1: number, y1: number): void {
    const r = TERRAIN_INFLUENCE;
    const done = writeTerrainRect(this.map, this.weights, this.kind, Math.min(x0, x1) - r, Math.min(y0, y1) - r, Math.max(x0, x1) + r, Math.max(y0, y1) + r);
    if (!done) return;
    this.wSrc.update(); this.kSrc.update();
  }

  /** Território mudou: só uOwner é reescrito e enviado. */
  updateOwner(territory: ArrayLike<number>): void {
    writeOwner(this.map.w, this.map.h, territory, PLAYER_COLORS.map((c) => c.num), this.owner);
    this.oSrc.update();
  }

  destroy(): void {
    const geometry = this.mesh.geometry;
    this.mesh.destroy();
    geometry.destroy();
    this.shader?.destroy(); this.shader = null;
    this.wSrc.destroy(); this.kSrc.destroy(); this.oSrc.destroy();
  }
}
