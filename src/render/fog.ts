// Malha w×h sobre o mapa desenhada por shader (docs/ART.md §3.8): a névoa de guerra com bordas macias. É um único quad
// do tamanho do mapa com uma textura de w×h texels (um por tile) atualizada só quando a versão muda (upload de ~80 KB);
// todo o resto é feito no fragmento. As fronteiras de território migraram para o shader do terreno (terrain/shaders.ts).
import { BufferImageSource, Mesh, MeshGeometry, Shader, Texture } from 'pixi.js';
import { TILE } from '../core/constants';

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
uniform vec3 uFogColor;
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
  finalColor = vec4(uFogColor * a, a);
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
  protected upload(): void { this.source.update(); }
  /** O shader (dono do BindGroup que prende a textura) sai antes da textura: senão o Pixi avisa "textureSource was
   *  destroyed while still bound to a shader" a cada partida nova. */
  destroy(): void {
    const { shader, geometry } = this.mesh;
    this.mesh.destroy(); shader?.destroy(); geometry.destroy(); this.source.destroy();
  }
}

/** Névoa de guerra: R = 0 (nunca visto), 128 (já visto), 255 (visível); bilinear + smoothstep no shader. */
export class FogMesh extends MapMesh {
  constructor(w: number, h: number) {
    super(w, h, FOG_FRAG, {
      // uFogColor, não uColor: o Pixi já envia um uColor vec4 (grupo local do Mesh) a todo shader de malha
      uFogColor: { value: new Float32Array([6 / 255, 8 / 255, 18 / 255]), type: 'vec3<f32>' },
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
