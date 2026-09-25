// Mapa oficial "Estreito" (1v1, 80×80), desenhado com as operações do editor (scripts/maps/lib.ts).
// Um estreito de mar corta o mapa na diagonal, do canto noroeste ao sudeste; três vaus de areia o atravessam — o
// central, largo e guardado por rochedos nas duas margens, e dois laterais, estreitos, perto dos cantos. Cada jogador
// tem a sua metade (sudoeste / nordeste) com serra e bosque às costas, frutas, caça e dois veios de ouro perto do
// Centro Cívico, e um veio avançado junto ao vau central. Simetria de rotação de 180°: recursos idênticos por início.
// Uso: npx tsx scripts/maps/estreito.ts [saida.map.json]   (padrão: src/core/data/maps/estreito.map.json)
import { pathToFileURL } from 'node:url';
import type { FixedMapData, MapIssue } from '../../src/core/map/fixed';
import { LOCAL_RADIUS, MapBuilder, T, d2, dist, placeStartLayout, rot180, writeMap, type Pt } from './lib';

const W = 80, H = 80, SEED = 4242;
const START: Pt = [18, 61];                          // início 1 (sudoeste); o 2 é a imagem pela rotação: (61, 18)
const CORNER: Pt = [0, H - 1];                       // canto às costas do início 1

// Coordenadas diagonais: u = x − y (atravessa o estreito), v = x + y (ao longo dele); centro em v = 79
const uv = (x: number, y: number) => ({ u: x - y, v: x + y });
const xy = (u: number, v: number): Pt => [Math.round((v + u) / 2), Math.round((v - u) / 2)];
/** Linha central do estreito (u em função de v): curva em S ímpar em torno do centro (a rotação a preserva). */
const mid = (v: number) => { const r = (v - 79) / 79; return 26 * r * (1 - r * r); };
const FORDS = [{ v: 79, half: 3.5 }, { v: 33, half: 2.5 }, { v: 125, half: 2.5 }];   // vau central e laterais (meia largura em v)

export function buildEstreito(): { file: FixedMapData; warnings: MapIssue[] } {
  const b = new MapBuilder(W, H, rot180(W, H), SEED, [START, [W - 1 - START[0], H - 1 - START[1]]]);
  const n = b.noise;
  const starts: Pt[] = [START, [W - 1 - START[0], H - 1 - START[1]]];
  const nearStart = (x: number, y: number, r: number) => starts.some(([sx, sy]) => d2(x, y, sx, sy) <= r * r);
  // rochedos que guardam as saídas do vau central (dois por margem; a rotação cria os da outra margem)
  // (a função de terreno roda só no representante de cada órbita: as listas de feições incluem as imagens)
  const rocks = [
    { p: xy(mid(71) - 10, 71), r: 2.6 }, { p: xy(mid(88) - 10, 88), r: 2.6 },
    { p: xy(mid(38) - 9, 38), r: 2.0 },                                       // vau lateral noroeste, margem sudoeste
  ].flatMap((r) => b.images(r.p[0], r.p[1]).map((p) => ({ p, r: r.r })));
  const islets = [xy(mid(56), 56), xy(mid(102), 102)];                         // ilhotas de pedra no meio do estreito
  const corners = b.images(CORNER[0], CORNER[1]);

  // ---- terreno ----
  b.terrain((x, y) => {
    const { u, v } = uv(x, y);
    if (nearStart(x, y, 9.5)) return T.GRASS;                                  // raio 8 limpo (como o gerador)
    const off = Math.abs(u - mid(v)) / Math.SQRT2;                            // distância ao eixo do estreito (tiles)
    const half = 3.9 + (n.noise(x * 0.16, y * 0.16) - 0.5) * 1.8;
    const ford = FORDS.find((f) => Math.abs(v - f.v) <= f.half + (n.noise(x * 0.5, y * 0.5) - 0.5) * 0.8);
    if (off <= half) return ford ? T.SAND : islets.some(([ix, iy]) => d2(x, y, ix, iy) <= 2.3) ? T.MOUNTAIN : T.WATER;
    if (off <= half + 1.2 + n.noise(x * 0.4 + 9, y * 0.4) * 0.8) return T.SAND;   // praias
    // serra às costas de cada jogador (canto sudoeste; a rotação cria a do nordeste)
    const ridge = Math.min(...corners.map(([cx, cy]) => dist(x, y, cx, cy)));
    if (ridge <= 10 + (n.noise(x * 0.22 + 3, y * 0.22) - 0.5) * 5) return T.MOUNTAIN;
    if (ridge <= 12 + (n.noise(x * 0.22 + 3, y * 0.22) - 0.5) * 5) return T.DIRT;
    for (const r of rocks) {
      const dd = dist(x, y, r.p[0], r.p[1]) + (n.noise(x * 0.6, y * 0.6) - 0.5) * 1.2;
      if (dd <= r.r) return T.MOUNTAIN;
      if (dd <= r.r + 1.3) return T.DIRT;
    }
    // manchas de terra batida perto dos veios de ouro e caminhos até os vaus
    if (off <= half + 4 && FORDS.some((f) => Math.abs(v - f.v) <= f.half + 1.5)) return T.DIRT;
    return null;
  });

  // ---- vizinhança de cada início (até 12 tiles): a mesma em todos, também na orientação (lib.placeStartLayout) ----
  const [sx, sy] = START;
  placeStartLayout(b, sx, sy);
  // ---- além dos 12 tiles, definidos para o início 1 (a rotação dá os do início 2) ----
  const far = (x: number, y: number) => !nearStart(x, y, LOCAL_RADIUS + 0.5);
  b.nodes('gold', MapBuilder.rect(sx + 13, sy + 10, sx + 14, sy + 11));       // ouro de reserva (~17)
  b.nodes('deer', MapBuilder.rect(sx - 14, sy - 13, sx - 13, sy - 12));       // cervos (~19)
  // bosques: o grande às costas (entre o Centro Cívico e a serra), um a oeste e um ao sul
  b.forest(sx - 10, sy + 10, 5.5, 0.85, far, 11);
  b.forest(sx - 15, sy - 2, 4.5, 0.85, far, 12);
  b.forest(sx + 3, sy + 15, 4.2, 0.85, far, 13);

  // ---- mapa aberto: veio avançado no vau central, caça nos vaus laterais, bosques que canalizam o caminho ----
  const goldFwd = xy(mid(90) - 11, 90);
  b.nodes('gold', [goldFwd, [goldFwd[0] + 1, goldFwd[1]], [goldFwd[0], goldFwd[1] + 1], [goldFwd[0] + 1, goldFwd[1] + 1], [goldFwd[0] + 2, goldFwd[1]], [goldFwd[0] + 2, goldFwd[1] + 1]]);
  const boarNw = xy(mid(30) - 8, 30);
  b.nodes('boar', [boarNw, [boarNw[0] + 1, boarNw[1]]]);
  const deerMid = xy(mid(60) - 13, 60);
  b.nodes('deer', MapBuilder.rect(deerMid[0], deerMid[1], deerMid[0] + 1, deerMid[1] + 1));
  // bosques entre os vaus, na margem de cada jogador (a travessia fica nos vaus)
  for (const [v, du, r] of [[56, -10, 4.2], [102, -10, 4.2], [12, -9, 3.2]] as const) { const c = xy(mid(v) + du, v); b.forest(c[0], c[1], r, 0.75, far, 20 + v); }
  // bosques espalhados no interior
  for (const [x, y, r] of [[34, 70, 3.5], [6, 42, 3.2], [30, 49, 2.6]] as const) b.forest(x, y, r, 0.7, far, 30 + x);

  b.fillPockets();
  return b.finish({
    id: 'estreito', name: 'Estreito', nameEn: 'Strait', author: 'Age of Earth',
    description: 'Um estreito corta o mapa na diagonal; três vaus o atravessam — o central, largo e guardado por rochedos, e dois laterais, estreitos. Serra e bosque às costas de cada jogador; recursos idênticos por início (simetria de 180°). Desenhado por scripts/maps/estreito.ts.',
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { file, warnings } = buildEstreito();
  writeMap(file, warnings, process.argv[2] ?? 'src/core/data/maps/estreito.map.json');
}
