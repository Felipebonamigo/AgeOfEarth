// Malhas w×h sobre o mapa desenhadas por shader (docs/ART.md §3.8): a névoa de guerra com bordas macias e as
// fronteiras de território (linha fina + tingimento). Cada uma é um único quad do tamanho do mapa com uma textura de
// w×h texels (um por tile) atualizada só quando a versão muda (upload de ~80 KB); todo o resto é feito no fragmento.
import { BufferImageSource, Mesh, MeshGeometry, Shader, Texture } from 'pixi.js';
import { TILE, PLAYER_COLORS } from '../core/constants';

const VERT = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

// Névoa: v = visibilidade amostrada bilinearmente (0 nunca, 0,5 já visto, 1 visível), com a posição de amostragem
// perturbada por ruído de valor (bordas irregulares); smoothstep em ≈ 1 tile. Uma amostra por fragmento.
const FOG_FRAG = /* glsl */ `
in vec2 vUV;
uniform sampler2D uTexture;
uniform vec2 uSize;
uniform vec3 uColor;
uniform float uNever;
uniform float uSeen;
out vec4 finalColor;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
  vec2 p = vUV * uSize;
  float n1 = vnoise(p * 0.85 + 3.1) - 0.5, n2 = vnoise(p * 0.85 + 17.7) - 0.5;
  vec2 t = 1.0 / uSize;
  float v = texture(uTexture, (p + vec2(n1, n2) * 0.9) * t).r;
  float k = v * 2.0;
  float a = k < 1.0 ? mix(uNever, uSeen, smoothstep(0.0, 1.0, k)) : mix(uSeen, 0.0, smoothstep(1.0, 2.0, k));
  finalColor = vec4(uColor * a, a);
}`;

// Fronteiras: texel = cor do dono (a = 1) ou transparente. A linha tem meia largura r (px de tela → tiles) medida
// até a aresta/quina mais próxima cujo vizinho tem outro dono; quinas convexas viram arcos (distância ao vértice),
// cada lado desenha a sua metade na própria cor; tingimento leve dentro do território. Só os fragmentos a menos de
// r + 0,6 px de uma aresta de tile leem os vizinhos (o interior lê um texel só).
const TERR_FRAG = /* glsl */ `
in vec2 vUV;
uniform sampler2D uTexture;
uniform vec2 uSize;
uniform float uZoom;
uniform float uLine;
uniform float uLineAlpha;
uniform float uTint;
out vec4 finalColor;
bool same(vec4 a, vec4 b) { return a.a == b.a && distance(a.rgb, b.rgb) < 0.02; }
void main() {
  vec2 p = vUV * uSize;
  vec2 t = 1.0 / uSize;
  vec2 c0 = floor(p) + 0.5;
  vec2 f = p - floor(p);
  vec4 c = texture(uTexture, c0 * t);
  float px = 1.0 / (uZoom * ${TILE}.0);
  float r = uLine * 0.5 * px;
  float m = r + 0.6 * px;
  float d = 1e9; vec4 lc = c;
  bool nearL = f.x < m, nearR = 1.0 - f.x < m, nearU = f.y < m, nearD = 1.0 - f.y < m;
  if (nearL || nearR || nearU || nearD) {
    vec4 nr = texture(uTexture, (c0 + vec2(1.0, 0.0)) * t);
    vec4 nl = texture(uTexture, (c0 - vec2(1.0, 0.0)) * t);
    vec4 nd = texture(uTexture, (c0 + vec2(0.0, 1.0)) * t);
    vec4 nu = texture(uTexture, (c0 - vec2(0.0, 1.0)) * t);
    bool sr = same(c, nr), sl = same(c, nl), sd = same(c, nd), su = same(c, nu);
    if (!sr && 1.0 - f.x < d) { d = 1.0 - f.x; lc = c.a > 0.0 ? c : nr; }
    if (!sl && f.x < d) { d = f.x; lc = c.a > 0.0 ? c : nl; }
    if (!sd && 1.0 - f.y < d) { d = 1.0 - f.y; lc = c.a > 0.0 ? c : nd; }
    if (!su && f.y < d) { d = f.y; lc = c.a > 0.0 ? c : nu; }
    if (nearR && nearD && sr && sd) { vec4 n = texture(uTexture, (c0 + vec2(1.0, 1.0)) * t); if (!same(c, n)) { float e = length(f - vec2(1.0, 1.0)); if (e < d) { d = e; lc = c.a > 0.0 ? c : n; } } }
    if (nearL && nearD && sl && sd) { vec4 n = texture(uTexture, (c0 + vec2(-1.0, 1.0)) * t); if (!same(c, n)) { float e = length(f - vec2(0.0, 1.0)); if (e < d) { d = e; lc = c.a > 0.0 ? c : n; } } }
    if (nearR && nearU && sr && su) { vec4 n = texture(uTexture, (c0 + vec2(1.0, -1.0)) * t); if (!same(c, n)) { float e = length(f - vec2(1.0, 0.0)); if (e < d) { d = e; lc = c.a > 0.0 ? c : n; } } }
    if (nearL && nearU && sl && su) { vec4 n = texture(uTexture, (c0 + vec2(-1.0, -1.0)) * t); if (!same(c, n)) { float e = length(f); if (e < d) { d = e; lc = c.a > 0.0 ? c : n; } } }
  }
  float cov = 1.0 - smoothstep(r - 0.6 * px, r + 0.6 * px, d);
  float la = cov * uLineAlpha;
  float ta = c.a > 0.0 ? uTint : 0.0;
  float a = la + ta * (1.0 - la);
  vec3 rgb = lc.rgb * la + c.rgb * ta * (1.0 - la);
  finalColor = vec4(rgb, a);
}`;

/** Quad do tamanho do mapa com textura RGBA w×h em buffer e um shader próprio. */
abstract class MapMesh {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  protected data: Uint8Array;
  protected source: BufferImageSource;
  constructor(readonly w: number, readonly h: number, frag: string, uniforms: Record<string, { value: unknown; type: string }>, scaleMode: 'linear' | 'nearest') {
    this.data = new Uint8Array(w * h * 4);
    this.source = new BufferImageSource({ resource: this.data, width: w, height: h, format: 'rgba8unorm', scaleMode, addressMode: 'clamp-to-edge', alphaMode: 'no-premultiply-alpha' });
    const W = w * TILE, H = h * TILE;
    const geometry = new MeshGeometry({ positions: new Float32Array([0, 0, W, 0, W, H, 0, H]), uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) });
    const shader = Shader.from({ gl: { vertex: VERT, fragment: frag }, resources: { uTexture: this.source, uSampler: this.source.style, mapUniforms: { uSize: { value: new Float32Array([w, h]), type: 'vec2<f32>' }, ...uniforms } } });
    this.mesh = new Mesh({ geometry, shader, texture: new Texture({ source: this.source }) });
  }
  protected get uniforms(): Record<string, unknown> { return (this.mesh.shader!.resources.mapUniforms as { uniforms: Record<string, unknown> }).uniforms; }
  protected upload(): void { this.source.update(); }
  destroy(): void { this.mesh.destroy(); this.source.destroy(); }
}

/** Névoa de guerra: R = 0 (nunca visto), 128 (já visto), 255 (visível); bilinear + smoothstep no shader. */
export class FogMesh extends MapMesh {
  constructor(w: number, h: number) {
    super(w, h, FOG_FRAG, {
      uColor: { value: new Float32Array([6 / 255, 8 / 255, 18 / 255]), type: 'vec3<f32>' },
      uNever: { value: 0.94, type: 'f32' },
      uSeen: { value: 0.46, type: 'f32' },
    }, 'linear');
  }
  /** Reescreve o canal R a partir da visibilidade do jogador (≈ 20 k bytes) e sobe a textura. */
  update(vis: Uint8Array): void {
    const d = this.data, n = this.w * this.h;
    for (let i = 0, k = 0; i < n; i++, k += 4) { d[k] = vis[i] === 2 ? 255 : vis[i] === 1 ? 128 : 0; d[k + 3] = 255; }
    this.upload();
  }
}

/** Fronteiras de território: RGB = cor do dono, A = 255 se há dono. Linha de 1,5 px (alfa 0,6) e tingimento 7 %. */
export class TerritoryMesh extends MapMesh {
  constructor(w: number, h: number) {
    super(w, h, TERR_FRAG, {
      uZoom: { value: 1, type: 'f32' },
      uLine: { value: 1.5, type: 'f32' },
      uLineAlpha: { value: 0.6, type: 'f32' },
      uTint: { value: 0.07, type: 'f32' },
    }, 'nearest');
  }
  update(territory: Int8Array | Int16Array | Int32Array | Uint8Array | number[]): void {
    const d = this.data, n = this.w * this.h;
    for (let i = 0, k = 0; i < n; i++, k += 4) {
      const o = territory[i];
      if (o < 0) { d[k] = 0; d[k + 1] = 0; d[k + 2] = 0; d[k + 3] = 0; continue; }
      const c = PLAYER_COLORS[o % PLAYER_COLORS.length].num;
      d[k] = (c >> 16) & 255; d[k + 1] = (c >> 8) & 255; d[k + 2] = c & 255; d[k + 3] = 255;
    }
    this.upload();
  }
  /** Zoom atual da câmera, para a linha ter largura constante em px de tela. */
  setZoom(zoom: number): void { this.uniforms.uZoom = zoom; }
}
