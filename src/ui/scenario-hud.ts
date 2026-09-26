// Indicadores genéricos do painel de objetivos (def.hud de cenários TS ou JSON): cronômetro enquanto a condição valer,
// absoluto ou relativo a um instante marcado (G4, fromVar), e barras de progresso — obra de um edifício ou variável do
// cenário (G4), escritas em porcentagem, contagem ou tempo. Função pura (sem DOM): o HUD só insere o HTML devolvido; os
// rótulos vêm de arquivos de cenário (também de outros pares) e são escapados.
import type { GameState } from '../core/types';
import type { ScenarioDef } from '../core/scenario/types';
import { esc } from './html';

export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** HTML dos indicadores do cenário para o estado atual (rótulos já no idioma da compilação). Indicador que falha é omitido. */
export function scenarioHudHtml(def: Pick<ScenarioDef, 'hud'>, state: GameState): string {
  let out = '';
  for (const h of def.hud ?? []) {
    try {
      if (h.type === 'countdown') {
        if (!h.while(state)) continue;
        const start = h.start ? h.start(state) : 0;
        if (start === null) continue;   // contagem relativa ainda não marcada
        out += `<div class="timer">⏳ ${h.label ? `${esc(h.label)}: ` : ''}${fmtClock(Math.max(0, h.seconds - (state.time - start)))}</div>`;
        continue;
      }
      const cur = h.entity(state);
      if (cur < 0) continue;
      const rawMax = h.maxOf ? h.maxOf(state) : h.max;
      const max = rawMax > 0 ? rawMax : 1;
      const pct = Math.max(0, Math.min(100, Math.round((cur / max) * 100)));
      const text = h.format === 'count' ? `${Math.floor(cur)}/${Math.round(max)}` : h.format === 'time' ? `${fmtClock(Math.min(cur, max))} / ${fmtClock(max)}` : `${pct}%`;
      out += `<div class="timer">${esc(h.label)}: ${text}<div class="bar"><span style="width:${pct}%"></span></div></div>`;
    } catch { /* condição do HUD falhou: sem indicador */ }
  }
  return out;
}
