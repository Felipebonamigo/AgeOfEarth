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
    expect(msgPanel.children[0].textContent).toBe(`Beto: ${XSS}`);   // aparece como texto, inteiro (sem o emoji: Etapa 7)
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

  it('briefing e fim de um cenário JSON (do anfitrião) escapam título, subtítulo, intro, objetivos, dicas e desfecho', () => {
    const file = {
      format: 'aoe-scenario', version: 1, id: 'xss', title: { pt: `T ${XSS}` }, subtitle: { pt: `S ${XSS}` }, intro: [{ pt: `I ${XSS}` }],
      hints: [{ pt: `H ${XSS}` }], outro: [{ pt: `O ${XSS}` }],
      map: { gen: { mapSize: 'small', seed: 1 } },
      config: { players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: true, difficulty: 'normal' }] },
      objectives: [{ id: 'a', text: { pt: `Obj ${XSS}` } }], triggers: [], victory: { time: { gte: 99999 } },
    };
    const shown: string[] = [];
    const btn = { addEventListener: () => {} };
    const state = { config: { scenarioData: file, players: [] }, scenario: { id: 'xss', objectives: { a: 'done' }, hidden: {}, winner: 0, winnerTeam: 0 }, time: 60, players: [] };
    const fake = {
      session: { state, player: { team: 0, stats: { kills: 0, losses: 0 } } }, modal: { querySelector: () => btn, classList: { add: () => {} } }, audio: { play: () => {} }, cb: { onQuit: () => {} }, testMode: true,
      showModal: (html: string) => { shown.push(html); }, hideModal: () => {},
    };
    (HUD.prototype as unknown as { showIntro(this: unknown, f: () => void): void }).showIntro.call(fake, () => {});
    (HUD.prototype as unknown as { showScenarioEnd(this: unknown): void }).showScenarioEnd.call(fake);
    expect(shown).toHaveLength(2);
    for (const html of shown) { expect(html).not.toContain('<img'); expect(html).toContain('&lt;img src=x onerror=&quot;'); }
    for (const k of ['T', 'S', 'I', 'Obj', 'H']) expect(shown[0]).toContain(`${k} &lt;img`);
    expect(shown[1]).toContain('T &lt;img');
  });

  it('fim de partida: o texto de vitória (com os nomes dos jogadores) sai escapado', () => {
    const shown: string[] = [];
    const player = (id: number, name: string) => ({ id, name, team: id, color: 0x3b82f6, age: 0, stats: { kills: 0, losses: 0, razed: 0, buildingsBuilt: 0, unitsTrained: 0, gathered: { food: 0, wood: 0, stone: 0, oil: 0, gold: 0 } }, techs: [], territoryTiles: 0 });
    const st = { scenario: undefined, winner: 1, time: 90, players: [player(0, 'Ana'), player(1, XSS)], events: [{ type: 'victory', text: `Vitória de ${XSS}!` }], config: { players: [] } };
    const fake = { session: { state: st, player: st.players[0] }, audio: { play: () => {} }, modal: { querySelector: () => ({ addEventListener: () => {} }), classList: { add: () => {} } }, showModal: (h: string) => { shown.push(h); }, hideModal: () => {}, cb: { onQuit: () => {} } };
    (HUD.prototype as unknown as { showGameOver(this: unknown): void }).showGameOver.call(fake);
    expect(shown).toHaveLength(1);
    expect(shown[0]).not.toContain('<img');
    expect(shown[0]).toContain('Vitória de &lt;img src=x onerror=&quot;');
  });
});
