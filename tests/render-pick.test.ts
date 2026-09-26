// Pick do renderizador com a arte assada (docs/ART.md §1.8): a caixa larga de um sprite assado não esconde unidades
// procedurais nem voadoras sob o cursor, e entre sprites que se sobrepõem ganha o desenhado na frente (unidade pelo pé,
// edifício pelo centro; fazenda, plana, fica sob quem está em cima dela). As vistas assadas são substituídas por caixas
// com a geometria medida no atlas 1× (hoplita/cidadão parado ≈ ±0,6 tile, do pé até ≈ 1,35 tile acima; templo
// completo −3,44 a +1,50 tile do centro).
import { describe, it, expect } from 'vitest';
import { Renderer } from '../src/render/renderer';
import { TILE } from '../src/core/constants';
import { spawnUnit, placeBuilding } from '../src/core/sim/entities';
import type { GameState } from '../src/core/types';
import { quickGame } from './helpers';

/** Vista assada falsa: só o que o pick lê (visible + contains em px de mundo). */
function box(cx: number, cy: number, x0: number, y0: number, x1: number, y1: number) {
  return { visible: true, contains: (x: number, y: number) => x >= (cx + x0) * TILE && x <= (cx + x1) * TILE && y >= (cy + y0) * TILE && y <= (cy + y1) * TILE };
}
function setup(): { r: Renderer; st: GameState; views: Map<number, unknown>; cx: number; cy: number } {
  const st = quickGame();
  const r = new Renderer();
  r.revealAll = true;
  const R = r as unknown as { bakedMode: boolean; views: Map<number, unknown> };
  R.bakedMode = true;
  return { r, st, views: R.views, cx: Math.floor(st.map.w / 2), cy: Math.floor(st.map.h / 2) };
}
const bakedUnit = (views: Map<number, unknown>, id: number, x: number, y: number) => views.set(id, { unit: box(x, y, -0.6, -1.35, 0.6, 0.1), bld: null });

describe('pick com arte assada', () => {
  it('inimigo procedural 0,7 tile ao norte do hoplita assado: o clique nele pega o inimigo (ataque, não mover)', () => {
    const { r, st, views, cx, cy } = setup();
    const hop = spawnUnit(st, 0, 'hoplite', cx + 0.5, cy + 0.5);
    const archer = spawnUnit(st, 1, 'toxotes', cx + 0.6, cy - 0.2);
    bakedUnit(views, hop.id, hop.x, hop.y);
    expect(r.pick(st, archer.x, archer.y, 0)?.id).toBe(archer.id);
    // no elmo do hoplita, longe do arqueiro: o hoplita
    expect(r.pick(st, hop.x - 0.45, hop.y - 1.2, 0)?.id).toBe(hop.id);
    // sem a arte: o círculo mais próximo, como antes
    (r as unknown as { bakedMode: boolean }).bakedMode = false;
    expect(r.pick(st, archer.x, archer.y, 0)?.id).toBe(archer.id);
  });

  it('voadora sobre um cidadão assado: a voadora', () => {
    const { r, st, views, cx, cy } = setup();
    const vil = spawnUnit(st, 0, 'villager', cx + 0.5, cy + 0.5);
    const peg = spawnUnit(st, 1, 'pegasus', cx + 0.55, cy + 0.15);
    bakedUnit(views, vil.id, vil.x, vil.y);
    expect(r.pick(st, peg.x, peg.y, 0)?.id).toBe(peg.id);
  });

  it('entre caixas assadas, o pé mais à frente ganha (maior y)', () => {
    const { r, st, views, cx, cy } = setup();
    const a = spawnUnit(st, 0, 'hoplite', cx + 0.5, cy + 0.5);
    const b = spawnUnit(st, 0, 'hoplite', cx + 0.5, cy - 0.2);
    bakedUnit(views, a.id, a.x, a.y); bakedUnit(views, b.id, b.x, b.y);
    expect(r.pick(st, a.x, a.y - 0.8, 0)?.id).toBe(a.id);   // torso de A cobre os pés de B
    expect(r.pick(st, b.x, b.y - 1.2, 0)?.id).toBe(b.id);   // só a cabeça de B
  });

  it('telhado do templo cobre o cidadão atrás dele; o hoplita na frente do templo continua ganhando', () => {
    const { r, st, views, cx, cy } = setup();
    const t = placeBuilding(st, 0, 'temple', cx - 1, cy - 1, true);   // centro (cx + 0,5, cy + 0,5)
    views.set(t.id, { unit: null, bld: box(t.x, t.y, -1.6, -3.44, 1.6, 1.5) });
    const vil = spawnUnit(st, 0, 'villager', t.x + 0.2, t.ty - 0.6);   // 0,6 tile ao norte do footprint, desenhado atrás
    bakedUnit(views, vil.id, vil.x, vil.y);
    expect(r.pick(st, vil.x, vil.y - 0.4, 0)?.id).toBe(t.id);
    const hop = spawnUnit(st, 1, 'hoplite', t.x, t.ty + t.h + 0.8);   // ao sul, na frente
    bakedUnit(views, hop.id, hop.x, hop.y);
    expect(r.pick(st, hop.x, t.ty + t.h - 0.3, 0)?.id).toBe(hop.id);   // sobre o footprint, no corpo do hoplita
  });

  it('pixel transparente do quadro não é o edifício: grama acima do CC vira mover, unidade vista atrás dele é clicável', () => {
    const { r, st, views, cx, cy } = setup();
    const tc = placeBuilding(st, 1, 'town_center', cx - 1, cy - 1, true);
    // caixa alta (telhado/torre até 3 tiles acima do centro), mas só a metade de baixo é opaca — como o alfa do atlas
    const bx = box(tc.x, tc.y, -1.7, -3.0, 1.7, 1.6);
    views.set(tc.id, { unit: null, bld: { visible: true, contains: (x: number, y: number) => bx.contains(x, y) && y >= (tc.y - 1.6) * TILE } });
    expect(r.pick(st, tc.x, tc.y - 2.5, 0)).toBeNull();                   // grama 1 tile ao norte da pegada: nada (mover)
    expect(r.pick(st, tc.x, tc.y - 1.2, 0)?.id).toBe(tc.id);              // telhado opaco: o CC (atacar)
    const hop = spawnUnit(st, 0, 'hoplite', tc.x + 0.4, tc.ty - 1.2);    // atrás do CC, desenhado acima do telhado
    bakedUnit(views, hop.id, hop.x, hop.y);
    expect(r.pick(st, hop.x, hop.y - 0.8, 0)?.id).toBe(hop.id);
  });

  it('cidadão em cima da fazenda (plana) ganha dela, inclusive na metade de cima', () => {
    const { r, st, views, cx, cy } = setup();
    const f = placeBuilding(st, 0, 'farm', cx, cy, true);
    const vil = spawnUnit(st, 0, 'villager', f.tx + 0.5, f.ty + 0.4);
    bakedUnit(views, vil.id, vil.x, vil.y);
    expect(r.pick(st, vil.x, vil.y - 0.7, 0)?.id).toBe(vil.id);
    expect(r.pick(st, f.tx + 1.7, f.ty + 1.7, 0)?.id).toBe(f.id);   // longe do cidadão: a fazenda
  });
});

describe('portão aberto e névoa (Etapa 3)', () => {
  it('um inimigo escondido pela névoa não abre o portão dele na tela; à vista, abre; o do jogador local abre sempre', () => {
    const st = quickGame();
    const r = new Renderer();
    const R = r as unknown as { gateCount: number; gatesOpen: Set<number>; updateGatesOpen(s: GameState, local: number): void };
    const cx = Math.floor(st.map.w / 2), cy = Math.floor(st.map.h / 2);
    const g1 = placeBuilding(st, 1, 'gate', cx, cy, true);
    const g0 = placeBuilding(st, 0, 'gate', cx + 6, cy, true);
    spawnUnit(st, 1, 'hoplite', g1.x + 0.8, g1.y + 0.3);
    spawnUnit(st, 0, 'hoplite', g0.x + 0.8, g0.y + 0.3);
    const vis = st.players[0].visibility;
    vis.fill(1);                                   // tudo explorado, nada à vista
    R.gateCount = 2;
    R.updateGatesOpen(st, 0);
    expect(R.gatesOpen.has(g1.id)).toBe(false);
    expect(R.gatesOpen.has(g0.id)).toBe(true);
    vis[Math.floor(g1.y + 0.3) * st.map.w + Math.floor(g1.x + 0.8)] = 2;   // o tile do hoplita inimigo à vista
    R.updateGatesOpen(st, 0);
    expect(R.gatesOpen.has(g1.id)).toBe(true);
  });
});
