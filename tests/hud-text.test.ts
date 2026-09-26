// Revisão 4.5: textos que vêm de outros pares (chat da partida, nomes de jogadores nos avisos, falas e objetivos de um cenário
// JSON do anfitrião) nunca viram HTML no HUD. Antes, `hud.toast` fazia innerHTML: um convidado mandava no chat
// `<img src=x onerror=...>` e executava JS no cliente do anfitrião, emitindo comandos em nome dele.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { HUD } from '../src/ui/hud';

/** Elemento mínimo: registra se alguém escreveu HTML (innerHTML) ou só texto (textContent). */
class FakeEl {
  className = ''; textContent = ''; html: string | null = null;
  style: Record<string, string> = {};
  children: FakeEl[] = [];
  classList = { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false };
  set innerHTML(v: string) { this.html = v; }
  get innerHTML() { return this.html ?? ''; }
  get firstChild() { return this.children[0] ?? null; }
  addEventListener() {}
  appendChild(c: FakeEl) { this.children.push(c); return c; }
  removeChild(c: FakeEl) { this.children.splice(this.children.indexOf(c), 1); return c; }
  remove() {}
}
const g = globalThis as unknown as { document?: unknown };
let saved: unknown;
beforeAll(() => { saved = g.document; g.document = { createElement: () => new FakeEl() }; vi.useFakeTimers(); });
afterAll(() => { g.document = saved; vi.useRealTimers(); });

const XSS = `<img src=x onerror="s=aoe.session;s.issue({type:'delete',player:s.local,ids:[...s.state.units.keys()]})">`;

describe('HUD: texto de outros pares não vira HTML', () => {
  it('toast (chat da partida, avisos com nomes de jogadores) usa textContent', () => {
    const msgPanel = new FakeEl();
    const fake = { msgPanel, renderer: { cam: { centerOn: () => {} } } };
    HUD.prototype.toast.call(fake as unknown as HUD, `💬 Beto: ${XSS}`, 'info');
    HUD.prototype.toast.call(fake as unknown as HUD, `${XSS} foi eliminado!`, 'warn', { x: 1, y: 2 });
    expect(msgPanel.children).toHaveLength(2);
    for (const e of msgPanel.children) expect(e.html).toBeNull();   // ninguém escreveu HTML
    expect(msgPanel.children[0].textContent).toBe(`💬 Beto: ${XSS}`);   // aparece como texto, inteiro
    expect(msgPanel.children[0].className).toBe('toast info');
  });

  it('falas de cenário (JSON do anfitrião) saem escapadas no painel de diálogo', () => {
    const dlgPanel = new FakeEl();
    const fake = { dlgPanel, dlg: { current: { meta: `🗣️|<b onclick=x>Cronos</b>`, text: XSS }, waiting: 0 } };
    (HUD.prototype as unknown as { renderDialogue(this: unknown): void }).renderDialogue.call(fake);
    expect(dlgPanel.html).not.toBeNull();
    expect(dlgPanel.html).not.toContain('<img');
    expect(dlgPanel.html).not.toContain('<b onclick');
    expect(dlgPanel.html).toContain('&lt;img src=x onerror=&quot;');
    expect(dlgPanel.html).toContain('&lt;b onclick=x&gt;Cronos&lt;/b&gt;');
  });
});
