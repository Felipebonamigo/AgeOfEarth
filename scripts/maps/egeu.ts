// Mapa oficial "Egeu" (2v2, 113×113), desenhado com as operações do editor (scripts/maps/lib.ts).
// Um mar atravessa o mapa de leste a oeste e separa os times: norte (inícios 1 e 2) contra sul (3 e 4). Três ilhas
// no eixo do mar ligam as costas por baixios de areia — a do oeste, a do leste e a central, maior, com a colina do Rei
// da Colina e ouro disputado; ilhotas de pedra enfeitam o mar. Em cada costa, um lago entre os aliados, serras nos
// cantos, bosques às costas e os recursos de cada início a curta distância. Simetria de espelho dupla (horizontal e
// vertical): os quatro inícios são equivalentes, com recursos idênticos. Times sugeridos: [1, 1, 2, 2].
// Uso: npx tsx scripts/maps/egeu.ts [saida.map.json]   (padrão: src/core/data/maps/egeu.map.json)
import { pathToFileURL } from 'node:url';
import type { FixedMapData, MapIssue } from '../../src/core/map/fixed';
import { LOCAL_RADIUS, MapBuilder, T, d2, dist, mirrorXY, placeStartLayout, writeMap, type Pt, type Route, type RouteReport } from './lib';

// lado ímpar: os eixos de simetria passam pelo meio de uma coluna e de uma linha, e a colina do Rei da Colina (padrão:
// o tile central de createGame) fica exatamente no centro, à mesma distância dos quatro inícios
const W = 113, H = 113, SEED = 8989;
const CX = (W - 1) / 2, CY = (H - 1) / 2;            // 56: eixos de simetria
const START: Pt = [27, 25];                           // início 1 (noroeste); os outros são as imagens pelos espelhos
const mirror = ([x, y]: Pt, mx: boolean, my: boolean): Pt => [mx ? W - 1 - x : x, my ? H - 1 - y : y];
const STARTS: Pt[] = [START, mirror(START, true, false), mirror(START, true, true), mirror(START, false, true)];   // NO, NE, SE, SO

export function buildEgeu(): { file: FixedMapData; warnings: MapIssue[]; routes: RouteReport[] } {
  const b = new MapBuilder(W, H, mirrorXY(W, H), SEED, STARTS);
  const n = b.noise;
  const nearStart = (x: number, y: number, r: number) => STARTS.some(([sx, sy]) => d2(x, y, sx, sy) <= r * r);
  // ilhas no eixo do mar (oeste, central, leste) e baixios que as ligam às duas costas
  const islands = [{ x: 27, rx: 6.5, ry: 4.6 }, { x: CX, rx: 9, ry: 5.6 }, { x: W - 1 - 27, rx: 6.5, ry: 4.6 }];
  // meia largura 3,6 e oscilação suave por linha: linhas vizinhas se sobrepõem o bastante para nenhum edifício de até 4×4
  // fechar um baixio sozinho (lib.routeReport confere no build)
  const shoals = [{ x: 27, half: 3.6 }, { x: CX, half: 3.6 }, { x: W - 1 - 27, half: 3.6 }];
  // rotas entre as costas: cada ilha com os seus baixios; a zona é a faixa do eixo do mar em volta da ilha
  const routes: Route[] = shoals.map((s, i) => ({ name: ['oeste', 'central', 'leste'][i], zone: (x, y) => Math.abs(y - CY) <= 3 && Math.abs(x - s.x) <= 11 }));
  // ilhotas de pedra (a função de terreno roda só no representante: a lista traz as imagens)
  const islets = ([[41, 51, 2.6], [11, 51, 2.1], [46, 47, 1.4], [18, 47, 1.2]] as const).flatMap(([x, y, r]) => b.images(x, y).map((p) => ({ p, r })));
  const lake = { x: CX, y: 14, rx: 7.5, ry: 5.5 };                    // lago entre os aliados, em cada costa
  const hills = ([[5, 33, 2.8], [38, 5, 2.6]] as const).flatMap(([x, y, r]) => b.images(x, y).map((p) => ({ p, r })));   // morros de pedra na costa
  const corners = b.images(0, 0);

  // ---- terreno ----
  b.terrain((x, y) => {
    if (nearStart(x, y, 9.5)) return T.GRASS;
    const fromAxis = Math.abs(y - CY);
    // costa recortada: baías e cabos ao longo de x, mais ruído local
    const sea = 11.5 + (n.noise(x * 0.09, 1.7) - 0.5) * 8 + (n.noise(x * 0.22, y * 0.22) - 0.5) * 2.6;
    const isl = islands.find((i) => ((x - i.x) / (i.rx + (n.noise(x * 0.4, y * 0.4) - 0.5) * 2.2)) ** 2 + (fromAxis / (i.ry + (n.noise(x * 0.3 + 4, y * 0.3) - 0.5) * 1.6)) ** 2 <= 1);
    const shoal = shoals.find((s) => Math.abs(x - s.x - (s.x === CX ? 0 : (n.noise(3.1, y * 0.18) - 0.5) * 2)) <= s.half + (n.noise(x * 0.5 + 5, y * 0.5) - 0.5) * 0.6);
    if (fromAxis <= sea) {
      if (isl) return isl.x === CX && fromAxis <= 2.2 && Math.abs(x - CX) <= 3.5 ? T.DIRT : T.GRASS;   // colina central de terra batida
      if (shoal) return T.SAND;
      if (islets.some(({ p, r }) => dist(x, y, p[0], p[1]) + (n.noise(x * 0.7 + 1, y * 0.7) - 0.5) * 1.4 <= r)) return T.MOUNTAIN;
      return T.WATER;
    }
    if (fromAxis <= sea + 1.3 + n.noise(x * 0.45 + 2, y * 0.45) * 0.9) return T.SAND;                    // praias
    // lago entre os aliados (norte e, pelo espelho, sul)
    const lk = ((x - lake.x) / lake.rx) ** 2 + (((y < CY ? y : H - 1 - y) - lake.y) / lake.ry) ** 2 + (n.noise(x * 0.22, y * 0.22) - 0.5) * 0.9;
    if (lk <= 1) return T.WATER;
    if (lk <= 1.35) return T.SAND;
    // serras nos cantos, às costas de cada início
    const ridge = Math.min(...corners.map(([cx, cy]) => dist(x, y, cx, cy)));
    const rw = (n.noise(x * 0.2 + 7, y * 0.2) - 0.5) * 6;
    if (ridge <= 11 + rw) return T.MOUNTAIN;
    if (ridge <= 13 + rw) return T.DIRT;
    for (const { p, r } of hills) {
      const dd = dist(x, y, p[0], p[1]) + (n.noise(x * 0.6 + 3, y * 0.6) - 0.5) * 1.4;
      if (dd <= r) return T.MOUNTAIN;
      if (dd <= r + 1.4) return T.DIRT;
    }
    // terra batida na chegada dos baixios
    if (shoal && fromAxis <= sea + 5) return T.DIRT;
    return null;
  });

  // ---- vizinhança de cada início (até 12 tiles): a mesma nos quatro, também na orientação (lib.placeStartLayout) ----
  const [sx, sy] = START;
  placeStartLayout(b, sx, sy);
  // ---- além dos 12 tiles, definidos para o início 1 (os espelhos dão os dos outros) ----
  const far = (x: number, y: number) => !nearStart(x, y, LOCAL_RADIUS + 0.5);
  b.nodes('gold', MapBuilder.rect(sx - 15, sy + 8, sx - 14, sy + 9));          // ouro de reserva (~17), a oeste
  b.nodes('deer', MapBuilder.rect(sx + 15, sy - 12, sx + 16, sy - 11));        // cervos (~19)
  b.forest(sx - 12, sy - 11, 6.5, 0.85, far, 11);                               // bosque grande às costas (serra do canto)
  b.forest(sx - 16, sy - 1, 4.5, 0.85, far, 12);                                // bosque do flanco oeste
  b.forest(sx + 3, sy - 15, 4.5, 0.85, far, 13);                                // bosque ao norte

  // ---- disputados: ouro e caça nas ilhas, caça e bosques na costa ----
  b.nodes('gold', [[26, 55], [27, 55]]);                                        // ilha oeste: 2 + 2 veios dos dois lados do eixo (leste pelo espelho)
  b.nodes('deer', [[23, 54], [23, 55]]);
  b.nodes('gold', [[50, 55], [51, 55]]);                                        // ilha central: 4 veios de cada lado da colina
  b.nodes('boar', [[55, 52]]);                                                  // javalis ao norte e ao sul da colina
  b.nodes('deer', MapBuilder.rect(44, 37, 45, 38));                             // caça na costa entre os aliados
  for (const [x, y, r] of [[40, 40, 3.4], [8, 42, 3.2], [45, 26, 3.0], [16, 38, 2.4]] as const) b.forest(x, y, r, 0.75, far, 30 + x);

  b.fillPockets();
  return b.finish({
    id: 'egeu', name: 'Egeu', nameEn: 'Aegean', author: 'Age of Earth', startTeams: [0, 0, 1, 1],
    relics: false,   // relíquias sorteadas pela semente quebrariam a simetria
    description: 'Um mar separa o norte (inícios 1 e 2) do sul (3 e 4); três ilhas ligadas às costas por baixios — oeste, central (colina do Rei da Colina e ouro) e leste — são as rotas entre os times. Lago entre os aliados, serras nos cantos; os quatro inícios são equivalentes (simetria de espelho dupla). Desenhado por scripts/maps/egeu.ts.',
  }, routes);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { file, warnings, routes } = buildEgeu();
  writeMap(file, warnings, process.argv[2] ?? 'src/core/data/maps/egeu.map.json', routes);
}
