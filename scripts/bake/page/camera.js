// Contrato de câmera e luz do bake (docs/ART.md §1.4, §1.5 e §3.2). É o ÚNICO lugar com os números que amarram a arte
// ao jogo: mudar qualquer valor invalida o cache inteiro (o hash de entrada inclui este arquivo) e vai para `meta.aoe`
// de cada JSON de atlas, onde a parte B (ArtLibrary) confere `pxPerTile`/`pitchDeg` antes de aceitar o atlas.
// O módulo não importa o three.js: recebe `THREE` por parâmetro para poder ser importado também pelo Node (bake.mjs).
//
// Convenção de eixos do bake (a mesma da tela do jogo): +x = leste (direita), +z = sul (para baixo na tela), y = altura.
// 1 unidade = 1 tile = 2 m. A câmera fica ao SUL (+z) inclinada para o norte; o sol vem de NOROESTE-alto e as sombras
// caem para SUDESTE (direita-baixo), regra 1 de §1.3. Observação da prévia (Apêndice A): §3.2 escreve o sol como
// (−0,55; 1,0; 0,35) com +z = norte; aqui, com +z = sul, o mesmo sol é (−0,55; 1,0; −0,35). O resultado na tela é idêntico.

export const PIPELINE_VERSION = 1;
export const PX_PER_TILE = 32;                   // 1×; `--scale 2` → 64
export const PITCH_DEG = 50;                     // 90 = topo puro (mesmo pipeline)
export const STRETCH_Y = 1 / Math.sin((PITCH_DEG * Math.PI) / 180);       // chão projeta 1:1
export const VERTICAL_FACTOR = Math.cos((PITCH_DEG * Math.PI) / 180) * STRETCH_Y; // ≈ 0,84: altura visual das verticais
export const SUN_DIR = [-0.55, 1.0, -0.35];      // direção PARA o sol (three.js, +z = sul); sombras para SE na tela
export const SUN_COLOR = 0xfff0d8;
export const SUN_INTENSITY = 2.6;
export const SKY = 0xbfd4ff;                     // HemisphereLight: céu
export const GROUND = 0x8a7a5a;                  // HemisphereLight: chão
export const HEMI_INTENSITY = 0.9;
export const SHADOW_MAP = 2048;                  // PCF 2048² (three r0.186 removeu PCFSoft: PCFShadowMap + radius)
export const SHADOW_SOFTNESS = 0.04;             // largura da penumbra em tiles (≈ 1,3 px a 1×)
export const DIRS = 8;                           // índice 0 = E, sentido horário na tela: E, SE, S, SO, O, NO, N, NE
export const DIR_NAMES = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
export const FPS = 10;                           // animações a 10 fps
export const PAD = 2;                            // px de espaço entre quadros no atlas
export const EXTRUDE = 1;                        // px de borda extrudada (mipmaps sem sangramento)
export const SSAA = 2;                           // super-amostragem no bake (renderiza a 2× e reduz com média)
export const M2T = 0.5;                          // metros → tiles

/** Ângulo (rad) de rotação em torno de Y para um modelo cuja frente é −z olhar na direção `dir` (0 = E, horário). */
export function dirYaw(dir, dirs = DIRS) {
  const a = (dir * 2 * Math.PI) / dirs;          // ângulo na tela: +x leste, +z sul
  return -(a + Math.PI / 2);
}

/** Com `--mirror`: direções assadas (S, SO, O, NO, N) e de onde vem cada espelhada (E←O, SE←SO, NE←NO). */
export const MIRROR_BAKED = [2, 3, 4, 5, 6];
export const MIRROR_FROM = { 0: 4, 1: 3, 7: 5 };

/**
 * Câmera ortográfica inclinada com estiramento vertical 1/sin(pitch): o chão fica 1:1 (1 tile = PX_PER_TILE·scale px)
 * e a origem do asset (pé, no chão) cai no pixel (anchor.x·W, anchor.y·H) do quadro de `wTiles`×`hTiles` tiles.
 */
export function makeCamera(THREE, { wTiles, hTiles, anchor, pitchDeg = PITCH_DEG }) {
  const pitch = (pitchDeg * Math.PI) / 180;
  const stretch = 1 / Math.sin(pitch);
  const cx = (0.5 - anchor[0]) * wTiles;         // alvo da câmera no chão, para a origem cair na âncora
  const cz = (0.5 - anchor[1]) * hTiles;
  // 1 tile de chão para o norte vale sin(pitch) no espaço da câmera; o estiramento (premultiply abaixo) devolve 1:1.
  // Por isso o frustum é de hTiles/2 (e não hTiles/(2·stretch), que aplicaria o estiramento duas vezes).
  const halfH = hTiles / 2;
  const cam = new THREE.OrthographicCamera(-wTiles / 2, wTiles / 2, halfH, -halfH, 0.1, 400);
  const D = 100;
  cam.up.set(0, 0, -1);                          // topo da tela = norte (vale também para pitch 90°)
  cam.position.set(cx, D * Math.sin(pitch), cz + D * Math.cos(pitch));
  cam.lookAt(cx, 0, cz);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  cam.projectionMatrix.premultiply(new THREE.Matrix4().makeScale(1, stretch, 1));
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  return cam;
}

/** Sol + hemisfério do contrato. `extent` (tiles) dimensiona o frustum da sombra em volta do asset. */
export function makeLights(THREE, extent = 4) {
  // Penumbra definida em tiles (e não em texels): o frustum da sombra muda com o tamanho do asset.
  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  sun.position.set(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]).normalize().multiplyScalar(60);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  sun.shadow.camera.left = -extent; sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent; sun.shadow.camera.bottom = -extent;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.shadow.radius = Math.max(1, (SHADOW_SOFTNESS * SHADOW_MAP) / (2 * extent));
  const hemi = new THREE.HemisphereLight(SKY, GROUND, HEMI_INTENSITY);
  return { sun, hemi };
}

/** Bloco `meta.aoe` gravado em todo JSON de atlas (a parte B confere antes de usar). */
export function atlasMeta({ pass, scale, mirror }) {
  return { version: PIPELINE_VERSION, pass, pxPerTile: PX_PER_TILE * scale, pitchDeg: PITCH_DEG, verticalFactor: +VERTICAL_FACTOR.toFixed(4),
    sun: SUN_DIR, shadowDir: 'SE', dirs: DIRS, dirNames: DIR_NAMES, fps: FPS, pad: PAD, extrude: EXTRUDE, mirror: !!mirror };
}
