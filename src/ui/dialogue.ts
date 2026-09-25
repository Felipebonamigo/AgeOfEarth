// Fila das falas de cenário do painel #dialogue. Um gatilho com vários `say`, ou gatilhos que disparam na mesma passada do
// runner (uma por segundo), emitem as falas no mesmo tick: sem fila, só a última ficava na tela. Aqui cada fala fica um
// tempo mínimo de leitura antes da próxima; a última some depois de DIALOGUE_LINGER_MS (ou com um clique, que passa adiante).
// Sem DOM e com o relógio injetado (ms), para os testes.

export interface DialogueLine { meta: string; text: string }

/** Tempo mínimo de leitura (ms) de uma fala antes de passar à próxima da fila: 5 a 10 s conforme o tamanho. */
export function dialogueHoldMs(text: string): number { return Math.max(5000, Math.min(10000, 55 * text.length)); }

/** Quanto a última fala fica na tela quando não há outra esperando (ms). */
export const DIALOGUE_LINGER_MS = 14000;

export class DialogueQueue {
  private pending: DialogueLine[] = [];
  /** Fala na tela (null = painel escondido). */
  current: DialogueLine | null = null;
  private since = 0;

  /** Enfileira a fala; devolve true se ela entrou direto na tela (nada estava sendo mostrado). */
  push(line: DialogueLine, now: number): boolean {
    if (this.current) { this.pending.push(line); return false; }
    this.current = line; this.since = now;
    return true;
  }

  /** Falas esperando a vez. */
  get waiting(): number { return this.pending.length; }

  /** Instante (ms) em que a fala atual sai da tela: a próxima entra ou o painel some. Infinity sem fala. */
  dueAt(): number {
    if (!this.current) return Infinity;
    return this.since + (this.pending.length ? dialogueHoldMs(this.current.text) : DIALOGUE_LINGER_MS);
  }

  /** Passa à próxima fala (clique no painel ou prazo vencido); devolve a nova fala atual (null = esconder). */
  next(now: number): DialogueLine | null {
    this.current = this.pending.shift() ?? null; this.since = now;
    return this.current;
  }

  /** Avança se o prazo da fala atual venceu; devolve true se a fala na tela mudou (ou o painel deve sumir). */
  update(now: number): boolean {
    if (!this.current || now < this.dueAt()) return false;
    this.next(now);
    return true;
  }

  /** Esvazia (outra partida, editor). */
  clear(): void { this.pending = []; this.current = null; }
}
