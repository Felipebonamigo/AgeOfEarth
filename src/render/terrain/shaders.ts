// GLSL ES 3.00 do terreno (docs/ART.md §3.6): um shader completo (splatting por pesos bilineares + ruído de transição,
// texture bombing em três grades de 4 tiles com rotação/deslocamento hasheados, duas escalas
// de textura, normal map + relevo macro + AO, sol único a noroeste (uSun, §1.5), água animada com duas camadas de
// normais, especular, cor por profundidade, espuma e areia molhada, montanha com encosta iluminada e topo claro,
// fronteira de território por uOwner com linha de 1,5 px de tela e tingimento) e um shader simples (≤ 5 amostras no
// interior, água estática, sem normais nem bombing) para o preset baixo. As strings são puras (testadas em
// tests/terrain-shader.test.ts); "#version 300 es" na primeira linha faz o GlProgram do Pixi compilar como ES 3.00
// (textureGrad, dFdx sem extensão). Coordenadas: vUV em tiles do mapa;
// espaço de tela com y para baixo e z para cima (o mesmo de uSun e das normais de materials.ts).
import { TILE } from '../../core/constants';
import { MACRO_TILES } from './materials';

/** Tiles cobertos por uma repetição do material (128 texels/tile a 512²). */
export const TEX_TILES = 4;
/** Lado (tiles) da célula do texture bombing. */
export const BOMB_CELL = 4;

/** Uniforms escalares/vetoriais do grupo `terrainUniforms` (o mesmo UniformGroup serve aos dois shaders). */
export const TERRAIN_UNIFORMS = ['uSize', 'uTime', 'uSun', 'uZoom', 'uNormals', 'uWaterAnim', 'uLine', 'uLineAlpha', 'uTint', 'uShallow', 'uDeep', 'uFoam', 'uTop', 'uDry'] as const;
/** Texturas de dados w×h (um texel por tile). */
export const TERRAIN_DATA_SAMPLERS = ['uWeights', 'uKind', 'uOwner'] as const;
/** Texturas de material do shader completo. */
export const TERRAIN_MATERIAL_SAMPLERS = ['uMacro', 'uGrass', 'uGrassN', 'uDirt', 'uDirtN', 'uSand', 'uSandN', 'uRock', 'uRockN', 'uWaterN'] as const;
/** Texturas usadas pelo shader simples (sem normais nem macro). */
export const TERRAIN_SIMPLE_SAMPLERS = ['uWeights', 'uKind', 'uOwner', 'uGrass', 'uDirt', 'uSand', 'uRock'] as const;

export const TERRAIN_VERT = /* glsl */ `#version 300 es
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

// Cabeçalho comum: dados, luz e cores; utilitários
const HEAD = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uWeights;   // w×h RGBA: grama, terra, areia, rocha (bilinear)
uniform sampler2D uKind;      // w×h RGBA: água, profundidade, grama seca, altura da montanha (bilinear)
uniform sampler2D uOwner;     // w×h RGBA: cor do dono, A = dono + 1 (nearest)
uniform sampler2D uGrass;
uniform sampler2D uDirt;
uniform sampler2D uSand;
uniform sampler2D uRock;
uniform vec2 uSize;
uniform float uTime;
uniform vec3 uSun;
uniform float uZoom;
uniform float uNormals;
uniform float uWaterAnim;
uniform float uLine;
uniform float uLineAlpha;
uniform float uTint;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uTop;
uniform vec3 uDry;
out vec4 finalColor;
const float TEX_TILES = ${TEX_TILES}.0;
const float CELL = ${BOMB_CELL}.0;
const float MACRO_TILES = ${MACRO_TILES}.0;
const float PX_TILE = ${TILE}.0;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
bool sameOwner(vec4 a, vec4 b) { return abs(a.a - b.a) < 0.002; }
`;

// Fronteira de território do shader simples: linha de meia largura r (px de tela → tiles) até a aresta de tile mais
// próxima cujo vizinho tem outro dono; cada lado desenha a sua metade na própria cor; tingimento uTint dentro do
// território. Só os fragmentos perto de uma aresta de tile leem os vizinhos (o interior lê 1 texel, dentro do
// orçamento de ≤ 5 amostras); o completo usa BORDER_SMOOTH.
const BORDER_TILE = /* glsl */ `
vec3 border(vec3 col, vec2 p) {
  vec2 ts = 1.0 / uSize;
  vec2 c0 = floor(p) + 0.5;
  vec2 f = p - floor(p);
  vec4 c = texture(uOwner, c0 * ts);
  float px = 1.0 / (uZoom * PX_TILE);
  float r = uLine * 0.5 * px;
  float m = r + 0.6 * px;
  float d = 1e9; vec4 lc = c;
  bool nearL = f.x < m, nearR = 1.0 - f.x < m, nearU = f.y < m, nearD = 1.0 - f.y < m;
  if (nearL || nearR || nearU || nearD) {
    vec4 nr = texture(uOwner, (c0 + vec2(1.0, 0.0)) * ts);
    vec4 nl = texture(uOwner, (c0 - vec2(1.0, 0.0)) * ts);
    vec4 nd = texture(uOwner, (c0 + vec2(0.0, 1.0)) * ts);
    vec4 nu = texture(uOwner, (c0 - vec2(0.0, 1.0)) * ts);
    bool sr = sameOwner(c, nr), sl = sameOwner(c, nl), sd = sameOwner(c, nd), su = sameOwner(c, nu);
    if (!sr && 1.0 - f.x < d) { d = 1.0 - f.x; lc = c.a > 0.0 ? c : nr; }
    if (!sl && f.x < d) { d = f.x; lc = c.a > 0.0 ? c : nl; }
    if (!sd && 1.0 - f.y < d) { d = 1.0 - f.y; lc = c.a > 0.0 ? c : nd; }
    if (!su && f.y < d) { d = f.y; lc = c.a > 0.0 ? c : nu; }
  }
  float cov = 1.0 - smoothstep(r - 0.6 * px, r + 0.6 * px, d);
  float la = cov * uLineAlpha;
  float ta = c.a > 0.0 ? uTint : 0.0;
  float a = la + ta * (1.0 - la);
  vec3 rgb = lc.rgb * la + c.rgb * ta * (1.0 - la);
  return col * (1.0 - a) + rgb;
}
`;

// Fronteira suave do shader completo: em vez da aresta do tile (degraus de 1 tile, a "grade" que sobrava a zoom 1,3),
// a linha segue a curva de nível de um campo bilinear por dono. Lê os 4 texels de uOwner em volta do ponto; para cada
// dono presente, F = soma dos pesos bilineares dos texels dele (1 no centro do próprio tile, 0,5 na aresta entre dois
// donos) e o gradiente analítico de F. A = dono de maior F, B = o segundo; a linha fica em F(A) = F(B), à distância
// (F(A) − F(B)) / |∇(F(A) − F(B))| tiles — degraus viram diagonais e quinas viram arcos, com largura uLine px de tela
// em qualquer zoom. O tingimento segue A (a mesma curva). Custo fixo: 4 leituras de uma textura w×h minúscula.
const BORDER_SMOOTH = /* glsl */ `
vec3 border(vec3 col, vec2 p) {
  vec2 ts = 1.0 / uSize;
  vec2 st = p - 0.5;
  vec2 i0 = floor(st), f = st - i0;
  vec4 o[4];
  o[0] = texture(uOwner, (i0 + vec2(0.5, 0.5)) * ts);
  o[1] = texture(uOwner, (i0 + vec2(1.5, 0.5)) * ts);
  o[2] = texture(uOwner, (i0 + vec2(0.5, 1.5)) * ts);
  o[3] = texture(uOwner, (i0 + vec2(1.5, 1.5)) * ts);
  float wt[4]; vec2 gr[4];
  wt[0] = (1.0 - f.x) * (1.0 - f.y); gr[0] = vec2(f.y - 1.0, f.x - 1.0);
  wt[1] = f.x * (1.0 - f.y);         gr[1] = vec2(1.0 - f.y, -f.x);
  wt[2] = (1.0 - f.x) * f.y;         gr[2] = vec2(-f.y, 1.0 - f.x);
  wt[3] = f.x * f.y;                 gr[3] = vec2(f.y, f.x);
  float fa = -1.0, fb = -1.0; vec2 ga = vec2(0.0), gb = vec2(0.0); vec4 ca = o[0], cb = o[0];
  for (int k = 0; k < 4; k++) {
    if (k > 0 && sameOwner(o[k], ca)) continue;
    if (fb >= 0.0 && sameOwner(o[k], cb)) continue;
    float F = 0.0; vec2 G = vec2(0.0);
    for (int j = 0; j < 4; j++) if (sameOwner(o[k], o[j])) { F += wt[j]; G += gr[j]; }
    if (F > fa) { fb = fa; gb = ga; cb = ca; fa = F; ga = G; ca = o[k]; }
    else if (F > fb) { fb = F; gb = G; cb = o[k]; }
  }
  float px = 1.0 / (uZoom * PX_TILE);
  float r = uLine * 0.5 * px;
  float la = 0.0;
  vec4 lc = ca.a > 0.0 ? ca : cb;
  if (fb >= 0.0) {
    float d = (fa - fb) / max(length(ga - gb), 1e-3);
    la = (1.0 - smoothstep(r - 0.6 * px, r + 0.6 * px, d)) * uLineAlpha;
  }
  float ta = ca.a > 0.0 ? uTint : 0.0;
  float a = la + ta * (1.0 - la);
  vec3 rgb = lc.rgb * la + ca.rgb * ta * (1.0 - la);
  return col * (1.0 - a) + rgb;
}
`;

/** Shader completo (presets médio e alto). */
export const TERRAIN_FRAG_FULL = /* glsl */ `${HEAD}
uniform sampler2D uMacro;     // RGBA periódica (MACRO_TILES): normal das colinas (RG), altura macro (B), ruído largo (A)
uniform sampler2D uGrassN;
uniform sampler2D uDirtN;
uniform sampler2D uSandN;
uniform sampler2D uRockN;
uniform sampler2D uWaterN;
${BORDER_SMOOTH}
// B-spline cúbica com 4 leituras bilineares (GPU Gems 2, cap. 20): a altura da serra e a profundidade ficam C¹, então
// a encosta tirada por dFdx não tem vincos nas linhas entre tiles (a bilinear dá derivada constante por célula = grade).
vec4 bspline(sampler2D tex, vec2 p) {
  vec2 st = p - 0.5;
  vec2 i = floor(st), f = st - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (-f3 + 3.0 * f2 - 3.0 * f + 1.0) / 6.0, w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;
  vec2 w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0, w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 p0 = (i + w1 / g0 - 0.5) / uSize, p1 = (i + w3 / g1 + 1.5) / uSize;
  return g0.y * (g0.x * texture(tex, p0) + g1.x * texture(tex, vec2(p1.x, p0.y))) + g1.y * (g0.x * texture(tex, vec2(p0.x, p1.y)) + g1.x * texture(tex, p1));
}
// Texture bombing em TRÊS grades de células CELL×CELL deslocadas de CELL/3 na diagonal (com duas grades sempre sobra
// um ponto — aresta de uma no x, da outra no y — em que ambas têm costura; com três, as costuras de cada eixo ficam a
// 1/3 de célula umas das outras e em todo ponto ao menos uma grade está a ≥ 1/6 de célula das suas). Cada célula gira
// (até rot rad) e desloca o material por hash; o peso de uma grade vai a 0 a 1/12 de célula da sua costura.
const float THIRD = CELL / 3.0;
vec3 gridWeights(vec2 t) {
  vec3 w;
  for (int k = 0; k < 3; k++) {
    vec2 f = fract((t + float(k) * THIRD) / CELL);
    vec2 s = smoothstep(1.0 / 12.0, 1.0 / 6.0, min(f, 1.0 - f));
    w[k] = s.x * s.y;
  }
  return w / (w.x + w.y + w.z);
}
vec2 bombUV(vec2 t, float k, float rot, out vec2 cs) {
  vec2 c = floor((t + k * THIRD) / CELL) + k * 17.0;
  float a = (hash21(c + 0.5) - 0.5) * rot;
  cs = vec2(cos(a), sin(a));
  vec2 r = vec2(cs.x * t.x - cs.y * t.y, cs.y * t.x + cs.x * t.y);
  return r / TEX_TILES + vec2(hash21(c + 11.3), hash21(c + 5.9)) * 3.0;
}
// Normal amostrada numa célula girada de volta para o espaço da tela (senão cada célula seria iluminada de um lado).
vec2 unrot(vec2 n, vec2 cs) { return vec2(cs.x * n.x + cs.y * n.y, -cs.y * n.x + cs.x * n.y); }
// Um material: albedo (grades com peso > 0 + escala larga) e normal (as mesmas grades, giradas de volta). textureGrad
// com o gradiente contínuo de t: o salto de uv na aresta da célula não derruba o mip (sem linha de costura), e as
// derivadas ficam válidas dentro dos ramos não uniformes (todas as derivadas são tiradas no topo de main).
void sampleMat(sampler2D alb, sampler2D nrm, vec2 t, vec2 gx, vec2 gy, float rot, vec3 gw, float broadK, out vec4 a, out vec3 n) {
  a = vec4(0.0); vec2 xy = vec2(0.0); float occ = 0.0;
  for (int k = 0; k < 3; k++) {
    float wk = gw[k];
    if (wk > 0.001) {
      vec2 cs; vec2 uv = bombUV(t, float(k), rot, cs);
      a += textureGrad(alb, uv, gx, gy) * wk;
      if (uNormals > 0.5) { vec4 nn = textureGrad(nrm, uv, gx, gy); xy += unrot(nn.xy * 2.0 - 1.0, cs) * wk; occ += nn.a * wk; }
    }
  }
  vec3 broad = textureGrad(alb, vec2(t.y, -t.x) / (TEX_TILES * 4.7) + 0.31, gx / 4.7, gy / 4.7).rgb;
  a.rgb = mix(a.rgb, broad, broadK);
  n = uNormals > 0.5 ? vec3(xy, occ) : vec3(0.0, 0.0, 1.0);   // z carrega a oclusão
}
// Mistura por altura: peso² × (altura + 0,2)⁶ — na transição o material mais alto (pedrinhas, tufos) vence primeiro,
// o que dá bordas irregulares e nítidas em vez de um degradê borrado.
#define ACC(W, ALB, NRM, ROT, BROAD) if (W > 0.004) { vec4 a; vec3 n; sampleMat(ALB, NRM, t, gx, gy, ROT, gw, BROAD, a, n); float k = W * W * pow(0.2 + a.a, 6.0); albedo += a.rgb * k; nxy += n.xy * k; ao += n.z * k; wsum += k; }
void main() {
  vec2 t = vUV;
  vec2 dtx = dFdx(t), dty = dFdy(t);
  vec2 gx = dtx / TEX_TILES, gy = dty / TEX_TILES;
  // relevo macro: duas amostras em escalas incomensuráveis (a segunda girada 90°) → sem período visível a 0,35
  vec4 mac = texture(uMacro, t / MACRO_TILES);
  vec4 mac2 = texture(uMacro, vec2(t.y, -t.x) / (MACRO_TILES * 0.61) + 0.43);
  vec4 fine = texture(uMacro, t / 5.3 + vec2(0.37, 0.71));
  vec4 fine2 = texture(uMacro, vec2(-t.y, t.x) / 2.3 + vec2(0.61, 0.13));
  float hill = (mac.b + mac2.b) * 0.5;
  vec2 hillN = (mac.rg * 2.0 - 1.0) + vec2(-(mac2.g * 2.0 - 1.0), mac2.r * 2.0 - 1.0);
  // transições irregulares: pesos e tipo lidos numa posição perturbada (≈ ± 0,5 tile) por ruído
  vec2 jit = (fine.ba - 0.5) * 0.8 + (vec2(mac.a, mac2.a) - 0.5) * 0.5 + (fine2.ab - 0.5) * 0.35;
  vec2 duv = (t + jit) / uSize;
  vec4 w = texture(uWeights, duv);
  // água pela bilinear (fiel ao tile: um lago de 1 tile não some); profundidade, manchas e altura pela B-spline
  float wm = texture(uKind, duv).r;
  vec4 kd = bspline(uKind, t + jit);
  // montanha: altura = distância à borda da serra (B-spline) modulada por colinas macro (cristas e vales dentro de um
  // maciço largo, que senão viraria um platô liso); derivada fora dos ramos
  float hc = clamp((hill - 0.5) * 2.5 + 0.5, 0.0, 1.0), hf = clamp((fine.b - 0.5) * 2.0 + 0.5, 0.0, 1.0);
  float mh = kd.a * (0.45 + 0.4 * hc + 0.15 * hf);
  // derivada em tiles do mundo (regra da cadeia com dFdx/dFdy de t): independe do zoom e do sentido do y da janela
  // (a tela tem y para cima, uma RenderTexture não), então a encosta NO é sempre a iluminada
  vec2 slope = vec2(dFdx(mh) / dtx.x, dFdy(mh) / dty.y);
  vec3 col = vec3(0.0);
  if (wm < 0.58) {
    vec3 gw = gridWeights(t);
    vec3 albedo = vec3(0.0); vec2 nxy = vec2(0.0); float ao = 0.0; float wsum = 0.0;
    ACC(w.r, uGrass, uGrassN, 6.2832, 0.3)
    ACC(w.g, uDirt, uDirtN, 6.2832, 0.3)
    ACC(w.b, uSand, uSandN, 0.5, 0.35)
    ACC(w.a, uRock, uRockN, 6.2832, 0.25)
    wsum = max(wsum, 1e-4); albedo /= wsum; nxy /= wsum; ao /= wsum;
    // manchas secas na grama (ruído não periódico por tile, bilinear)
    albedo = mix(albedo, albedo * uDry, smoothstep(0.25, 0.85, kd.b) * w.r * 0.85);
    // montanha: encosta pela derivada da altura, topo claro
    // topo claro só nas cristas altas
    float top = smoothstep(0.58, 0.85, mh + (fine.a - 0.5) * 0.2) * w.a;
    albedo = mix(albedo, uTop, top * 0.65);
    // normal: material (rocha mais forte) + colinas macro + encosta da serra
    float strT = uNormals > 0.5 ? mix(1.0, 1.8, w.a) : 0.0;
    vec3 n = normalize(vec3(nxy * strT + hillN * (0.3 + 0.9 * w.a) - slope * 2.2, 1.0));   // colinas mais fortes na rocha
    float dif = max(dot(n, uSun), 0.0);
    vec3 light = vec3(0.40, 0.41, 0.44) + dif * vec3(0.86, 0.84, 0.78);
    float aoM = 0.84 + 0.16 * hill;
    col = albedo * light * mix(1.0, ao, 0.6 * step(0.5, uNormals)) * aoM;
    // areia molhada: a terra escurece (× 0,75) na faixa que encosta na água
    col *= mix(1.0, 0.75, smoothstep(0.08, 0.42, wm));
  }
  // água: cor por profundidade, normais animadas em duas camadas, especular do sol, espuma na margem
  if (wm > 0.42) {
    float depth = kd.g;
    vec3 wc = mix(uShallow, uDeep, smoothstep(0.05, 0.85, depth));
    wc = mix(wc * vec3(1.14, 1.2, 1.05), wc, smoothstep(0.5, 0.95, wm));
    float anim = uTime * uWaterAnim;
    vec3 n1 = textureGrad(uWaterN, t / 7.0 + anim * vec2(0.035, 0.02), dtx / 7.0, dty / 7.0).xyz * 2.0 - 1.0;
    vec3 n2 = textureGrad(uWaterN, vec2(t.y, -t.x) / 2.6 - anim * vec2(0.025, 0.045), dtx / 2.6, dty / 2.6).xyz * 2.0 - 1.0;
    vec3 nw = normalize(vec3((n1.xy + vec2(-n2.y, n2.x)) * (0.35 + 0.25 * depth), 1.0));
    float wd = max(dot(nw, uSun), 0.0);
    vec3 hv = normalize(uSun + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(nw, hv), 0.0), 80.0) * 0.6;
    vec3 water = wc * (0.5 + 0.65 * wd) + spec * vec3(1.0, 0.97, 0.9);
    float fn = textureGrad(uWaterN, t / 3.0 + anim * vec2(0.02, -0.03), dtx / 3.0, dty / 3.0).a;
    float band = smoothstep(0.44, 0.52, wm) * (1.0 - smoothstep(0.58, 0.8, wm));
    float foam = band * smoothstep(0.38, 0.68, fn + 0.12 * sin(anim * 1.3 + t.x * 1.7 + t.y * 0.9));
    water = mix(water, uFoam, foam * 0.8);
    col = mix(col, water, smoothstep(0.42, 0.58, wm));
  }
  col = border(col, t);
  finalColor = vec4(col, 1.0);
}`;

/** Shader simples (preset baixo): ≤ 5 amostras no interior (pesos, tipo, dono, 1–2 albedos), água estática. */
export const TERRAIN_FRAG_SIMPLE = /* glsl */ `${HEAD}
${BORDER_TILE}
void main() {
  vec2 t = vUV;
  // ruído aritmético (sem textura): transições irregulares e deformação do uv contra a repetição
  float n1 = vnoise(t * 0.9 + 3.1), n2 = vnoise(t * 0.9 + 17.7), n3 = vnoise(t * 0.23 + 41.0);
  vec2 duv = (t + (vec2(n1, n2) - 0.5) * 0.9) / uSize;
  vec4 w = texture(uWeights, duv);
  vec4 kd = texture(uKind, duv);
  vec2 uv = (t + vec2(n3, n2) * 0.9) / TEX_TILES;
  vec2 gx = dFdx(uv), gy = dFdy(uv);
  vec3 albedo = vec3(0.0); float wsum = 0.0;
  if (w.r > 0.004) { albedo += textureGrad(uGrass, uv, gx, gy).rgb * w.r; wsum += w.r; }
  if (w.g > 0.004) { albedo += textureGrad(uDirt, uv, gx, gy).rgb * w.g; wsum += w.g; }
  if (w.b > 0.004) { albedo += textureGrad(uSand, uv, gx, gy).rgb * w.b; wsum += w.b; }
  if (w.a > 0.004) { albedo += textureGrad(uRock, uv, gx, gy).rgb * w.a; wsum += w.a; }
  albedo /= max(wsum, 1e-4);
  albedo = mix(albedo, albedo * uDry, smoothstep(0.25, 0.85, kd.b) * w.r * 0.85);
  // sem normais nem relevo: a serra só clareia no topo (a altura bilinear daria vincos na derivada)
  albedo = mix(albedo, uTop, smoothstep(0.66, 0.98, kd.a + (n3 - 0.5) * 0.3) * w.a * 0.6);
  vec3 col = albedo * (0.93 + 0.14 * n3);
  float wm = kd.r;
  col *= mix(1.0, 0.75, smoothstep(0.08, 0.42, wm));
  if (wm > 0.42) {
    vec3 wc = mix(uShallow, uDeep, smoothstep(0.05, 0.85, kd.g));
    wc = mix(wc * vec3(1.14, 1.2, 1.05), wc, smoothstep(0.5, 0.95, wm)) * (0.92 + 0.16 * n3);
    float foam = smoothstep(0.44, 0.52, wm) * (1.0 - smoothstep(0.58, 0.78, wm)) * smoothstep(0.35, 0.7, n1);
    wc = mix(wc, uFoam, foam * 0.75);
    col = mix(col, wc, smoothstep(0.42, 0.58, wm));
  }
  col = border(col, t);
  finalColor = vec4(col, 1.0);
}`;
