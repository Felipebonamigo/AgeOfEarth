// Ambiente (docs/ART.md §1.9 e Apêndice F — lote combate-ambiente): o que se mexe sem ninguém pedir.
//  - Poeira no vento nos biomas áridos: a cada 0,5 s de jogo a vista é amostrada (rules.ts aridFraction: areia e terra
//    entre os tiles de chão VISTOS agora); com o chão árido acima de ARID_MIN, rajadas rasteiras de poeira clara correm
//    com o vento (leste-sudeste, o mesmo da fumaça) por tiles áridos à vista, na densidade da área árida na tela — um
//    deserto "respira", um campo verde com uma praia não. Nada abaixo do zoom 0,5.
//  - Fumaça de trabalho: edifício de produção do time do jogador com fila andando solta um fio fino de fumaça clara da
//    lareira/forja (rules.ts WORK_SMOKE: lareira de Héstia no pátio do Centro Cívico, forjas do quartel, estábulo,
//    oficina e fortaleza), sutil e bem mais fraco que a fumaça de dano.
import { TILE, TERRAIN } from '../../core/constants';
import type { Building } from '../../core/types';
import type { BuildingView } from '../views/BuildingView';
import type { FxContext } from './types';
import type { FxAcc } from './FxSystem';
import { windDust, workSmoke } from './recipes';
import { aridFraction, windDustRate, workSmokeOn, WORK_SMOKE } from './rules';
import { DUST_MIN_ZOOM, dustColor } from './logic';
import { terrainAt } from './handlers/util';

export class AmbientFx {
  private sampleAt = -1;
  private arid = 0;
  private acc = 0;
  /** Contadores de diagnóstico (scripts/artfx.mjs, testes): rajadas de vento e baforadas de fumaça de trabalho. */
  readonly counts = { wind: 0, smoke: 0 };
  /** Fração árida da última amostra (diagnóstico). */
  get aridNow(): number { return this.arid; }

  /** Uma vez por quadro: poeira no vento na vista (x0..x1, y0..y1 em tiles). */
  update(fx: FxContext, view: { x0: number; y0: number; x1: number; y1: number }, reveal: boolean): void {
    if (fx.dt <= 0 || fx.zoom < DUST_MIN_ZOOM) return;
    const st = fx.state;
    if (this.sampleAt < 0 || fx.clock - this.sampleAt >= 0.5 || fx.clock < this.sampleAt) {
      this.sampleAt = fx.clock;
      this.arid = aridFraction(st.map, st.players[fx.local]?.visibility ?? null, reveal || !!st.config.revealMap, view.x0, view.y0, view.x1, view.y1);
    }
    const tiles = Math.max(0, (view.x1 - view.x0) * (view.y1 - view.y0));
    this.acc += windDustRate(this.arid, tiles, fx.zoom) * fx.dt;
    if (this.acc < 1) return;
    let n = Math.floor(this.acc); this.acc -= n;
    // pontos sorteados na vista (um pouco a oeste: a rajada entra pela tela com o vento), só em chão árido visto
    for (let tries = 0; n > 0 && tries < n * 4; tries++) {
      const x = view.x0 - 2 + Math.random() * (view.x1 - view.x0 + 2), y = view.y0 + Math.random() * (view.y1 - view.y0);
      const t = terrainAt(st, x, y);
      if (t !== TERRAIN.SAND && t !== TERRAIN.DIRT) continue;
      if (!fx.visibleAt(x, y)) continue;
      n--; this.counts.wind++;
      if (!windDust(fx.particles, fx.tex, x * TILE, y * TILE, dustColor(t))) return;
    }
  }
  reset(): void { this.sampleAt = -1; this.arid = 0; this.acc = 0; }

  /** Edifício pronto e sem dano à vista: o fio de fumaça da lareira/forja enquanto ele produz (`acc` na vista). */
  building(fx: FxContext, acc: FxAcc, b: Building, bv: BuildingView | null, revealAll: boolean): void {
    if (fx.dt <= 0 || fx.zoom < DUST_MIN_ZOOM || !workSmokeOn(fx.state, b, fx.local, revealAll)) return;
    const w = WORK_SMOKE[b.type];
    acc.dust += fx.dt * (w.kind === 'forge' ? 2.2 : 1.6);
    if (acc.dust < 1) return;
    acc.dust -= 1;
    const x = (b.x + w.dx) * TILE, y = bv ? b.y * TILE - bv.top * w.h : b.y * TILE - w.hp;
    this.counts.smoke++;
    workSmoke(fx.particles, fx.tex, x, y, w.kind === 'forge');
  }
}
