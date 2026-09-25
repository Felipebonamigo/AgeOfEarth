// Controle (src/ui/gamepad.ts): lógica pura sem navegador — zona morta, curva, tabela de ações, repetição do D-pad,
// prioridade mouse × controle, navegação espacial dos menus e configurações com padrões para saves antigos.
import { describe, it, expect } from 'vitest';
import { BTN, BUTTON_COUNT, ButtonMapper, DeviceArbiter, Repeater, SCHEMES, buttonsFor, cursorSpeed, CURSOR_SPEED, dirFrom, magnetStep, navPick, padDisplayName, padHelpRows, radialDeadzone, responseCurve, stick, triggerDown, type Rect } from '../src/ui/gamepad';
import { DEFAULT_SETTINGS, PAD_SCHEMES, sanitizeSettings } from '../src/game/settings';
import { STRINGS } from '../src/i18n/strings';

const press = (...idx: number[]) => { const a = new Array(BUTTON_COUNT).fill(false); for (const i of idx) a[i] = true; return a; };

describe('controle: analógicos', () => {
  it('zona morta radial: zero dentro, sem degrau na borda, direção preservada', () => {
    expect(radialDeadzone(0.1, 0.1, 0.15)).toEqual({ x: 0, y: 0, mag: 0 });   // |v| = 0,141 < 0,15
    expect(radialDeadzone(0, 0)).toEqual({ x: 0, y: 0, mag: 0 });
    const justOut = radialDeadzone(0.16, 0, 0.15, 0.95);
    expect(justOut.mag).toBeGreaterThan(0); expect(justOut.mag).toBeLessThan(0.02);   // começa perto de zero
    const full = radialDeadzone(0.7071, -0.7071, 0.15, 0.95);
    expect(full.mag).toBeCloseTo(1, 2);
    expect(full.x).toBeCloseTo(0.707, 2); expect(full.y).toBeCloseTo(-0.707, 2);
    expect(radialDeadzone(1, 1).mag).toBe(1);   // diagonal além do círculo satura
    expect(radialDeadzone(NaN, 0).mag).toBe(0);
  });
  it('curva de resposta: 0→0, 1→1, monotônica e mais fina perto do centro', () => {
    expect(responseCurve(0)).toBe(0); expect(responseCurve(1)).toBe(1);
    expect(responseCurve(0.5, 1.7)).toBeLessThan(0.5);
    expect(responseCurve(0.5, 1)).toBeCloseTo(0.5);
    let prev = -1; for (let m = 0; m <= 1.0001; m += 0.05) { const c = responseCurve(m); expect(c).toBeGreaterThanOrEqual(prev); prev = c; }
    expect(responseCurve(2)).toBe(1); expect(responseCurve(-1)).toBe(0);
    const s = stick(0, 0.5);
    expect(s.x).toBe(0); expect(s.y).toBeGreaterThan(0); expect(s.y).toBeLessThan(0.5); expect(s.mag).toBeCloseTo(s.y);
  });
  it('velocidade do cursor: proporcional à inclinação e à sensibilidade, acelera ao segurar no máximo', () => {
    expect(cursorSpeed(1, 0, 1)).toBe(CURSOR_SPEED);
    expect(cursorSpeed(0.5, 0, 1)).toBe(CURSOR_SPEED / 2);
    expect(cursorSpeed(1, 0, 2)).toBe(CURSOR_SPEED * 2);
    expect(cursorSpeed(1, 0.3, 1)).toBe(CURSOR_SPEED);             // ainda sem aceleração
    expect(cursorSpeed(1, 5, 1)).toBeCloseTo(CURSOR_SPEED * 1.9);  // teto
    expect(cursorSpeed(0, 5, 1)).toBe(0);
  });
  it('ímã leve: puxa para a unidade só dentro do raio', () => {
    expect(magnetStep(100, 100, 200, 100, 0.016)).toEqual({ x: 100, y: 100 });   // longe demais
    const m = magnetStep(100, 100, 110, 100, 0.05, 26, 9);
    expect(m.x).toBeGreaterThan(100); expect(m.x).toBeLessThan(110); expect(m.y).toBe(100);
    expect(magnetStep(100, 100, 110, 100, 1, 26, 9)).toEqual({ x: 110, y: 100 });  // não passa do alvo
  });
  it('gatilho analógico conta a partir de 35 %', () => {
    expect(triggerDown(0.2, false)).toBe(false); expect(triggerDown(0.5, false)).toBe(true); expect(triggerDown(0, true)).toBe(true);
  });
});

describe('controle: tabela de ações', () => {
  it('esquema padrão (Xbox/Deck): A seleciona, B ordem, X atacar-mover, Y parar, RT também seleciona, D-pad e sistema', () => {
    const b = SCHEMES.standard.buttons;
    expect(b[BTN.A]).toBe('primary'); expect(b[BTN.RT]).toBe('primary'); expect(b[BTN.B]).toBe('context');
    expect(b[BTN.X]).toBe('attackMove'); expect(b[BTN.Y]).toBe('stop'); expect(b[BTN.LT]).toBe('modifier');
    expect(b[BTN.LB]).toBe('groups'); expect(b[BTN.RB]).toBe('cycleType');
    expect([b[BTN.LEFT], b[BTN.RIGHT], b[BTN.UP], b[BTN.DOWN]]).toEqual(['idle', 'army', 'home', 'power']);
    expect(b[BTN.START]).toBe('menu'); expect(b[BTN.VIEW]).toBe('overview'); expect(b[BTN.L3]).toBe('sameType');
    expect(SCHEMES.standard.cursorStick).toBe('left');
    expect(b.length).toBe(BUTTON_COUNT);
  });
  it('esquema alternativo: A↔B e analógicos trocados; confirmar/voltar acompanham', () => {
    const alt = SCHEMES.alt;
    expect(alt.buttons[BTN.A]).toBe('context'); expect(alt.buttons[BTN.B]).toBe('primary');
    expect(alt.cursorStick).toBe('right'); expect(alt.confirm).toBe(BTN.B); expect(alt.back).toBe(BTN.A);
    expect(alt.buttons[BTN.R3]).toBe('sameType');
    expect(buttonsFor(alt, 'primary')).toEqual([BTN.B, BTN.RT]);
    expect(Object.keys(SCHEMES).sort()).toEqual([...PAD_SCHEMES].sort());
  });
  it('bordas: dispara na descida e devolve a mesma ação na subida', () => {
    const m = new ButtonMapper(); const sc = SCHEMES.standard;
    expect(m.update(sc, press())).toEqual({ down: [], up: [] });
    expect(m.update(sc, press(BTN.A))).toEqual({ down: ['primary'], up: [] });
    expect(m.update(sc, press(BTN.A))).toEqual({ down: [], up: [] });           // segurar não repete
    expect(m.update(sc, press())).toEqual({ down: [], up: ['primary'] });
    expect(m.update(sc, press(BTN.B, BTN.Y))).toEqual({ down: ['context', 'stop'], up: [] });
  });
  it('LT (modificador): A/B/X/Y viram a grade do painel, LB/RB a página e ▲ salva grupo', () => {
    const m = new ButtonMapper(); const sc = SCHEMES.standard;
    expect(m.update(sc, press(BTN.LT)).down).toEqual(['modifier']);
    expect(m.update(sc, press(BTN.LT, BTN.A)).down).toEqual(['grid0']);
    expect(m.update(sc, press(BTN.LT, BTN.A, BTN.Y)).down).toEqual(['grid3']);
    expect(m.update(sc, press(BTN.LT)).up).toEqual(['grid0', 'grid3']);
    expect(m.update(sc, press(BTN.LT, BTN.RB)).down).toEqual(['gridNext']);
    expect(m.update(sc, press(BTN.LT, BTN.LB)).down).toEqual(['gridPrev']);
    expect(m.update(sc, press(BTN.LT, BTN.UP)).down).toEqual(['saveGroup']);
    expect(m.update(sc, press(BTN.LT, BTN.LEFT)).down).toEqual(['idle']);       // o resto do D-pad segue normal
  });
  it('soltar LT antes de A devolve grid0 (não "primary")', () => {
    const m = new ButtonMapper(); const sc = SCHEMES.standard;
    m.update(sc, press(BTN.LT)); m.update(sc, press(BTN.LT, BTN.A));
    expect(m.update(sc, press(BTN.A))).toEqual({ down: [], up: ['modifier'] });
    expect(m.update(sc, press())).toEqual({ down: [], up: ['grid0'] });
  });
  it('sync (menus): botões segurados ao voltar para a partida não disparam', () => {
    const m = new ButtonMapper(); const sc = SCHEMES.standard;
    m.sync(press(BTN.B));                                           // B fechou o menu
    expect(m.update(sc, press(BTN.B))).toEqual({ down: [], up: [] });
    expect(m.update(sc, press())).toEqual({ down: [], up: [] });   // e soltar também não
  });
  it('tela de atalhos lista cursor, câmera e todas as ações do esquema', () => {
    const rows = padHelpRows('standard');
    expect(rows.length).toBe(2 + 14 + 1);
    expect(rows[2][0]).toContain('pb-a');   // selecionar: A (e RT)
    expect(padHelpRows('alt')[2][0]).toContain('pb-b');
  });
});

describe('controle: repetição do D-pad e prioridade', () => {
  it('dispara ao pressionar, espera o atraso e repete no intervalo', () => {
    const r = new Repeater(0.4, 0.1);
    expect(r.update(true, 0.016)).toBe(true);    // pressão
    let fired = 0; for (let i = 0; i < 20; i++) if (r.update(true, 0.016)) fired++;   // 0,32 s: ainda no atraso
    expect(fired).toBe(0);
    fired = 0; for (let i = 0; i < 25; i++) if (r.update(true, 0.02)) fired++;         // mais 0,5 s: 1 no fim do atraso + ~4 repetições
    expect(fired).toBeGreaterThanOrEqual(4); expect(fired).toBeLessThanOrEqual(6);
    expect(r.update(false, 0.016)).toBe(false);
    expect(r.update(true, 0.016)).toBe(true);    // soltar e pressionar de novo dispara na hora
  });
  it('quadro longo não gera rajada (no máximo um disparo por quadro)', () => {
    const r = new Repeater(0.4, 0.1);
    r.update(true, 0.016);
    expect(r.update(true, 2)).toBe(true);
    expect(r.update(true, 0.016)).toBe(false);
  });
  it('controle assume ao ser usado; mouse retoma só após andar de verdade ou clicar', () => {
    const a = new DeviceArbiter(8);
    expect(a.active).toBe('mouse');
    expect(a.mouseMoved(50, 0, 0)).toBe(false);          // já era o mouse
    expect(a.padUsed()).toBe(true); expect(a.active).toBe('pad');
    expect(a.padUsed()).toBe(false);
    expect(a.mouseMoved(2, 1, 1000)).toBe(false);        // tremida
    expect(a.mouseMoved(1, 1, 2000)).toBe(false);        // outra tremida bem depois: não acumula
    expect(a.active).toBe('pad');
    expect(a.mouseMoved(4, 0, 3000)).toBe(false);
    expect(a.mouseMoved(5, 0, 3050)).toBe(true);         // 9 px na mesma rajada
    expect(a.active).toBe('mouse');
    a.padUsed();
    expect(a.mouseClicked()).toBe(true); expect(a.active).toBe('mouse');
  });
});

describe('controle: navegação nos menus', () => {
  it('direção: D-pad tem prioridade; analógico pelo eixo dominante acima do limiar', () => {
    expect(dirFrom(true, false, false, false, 0, 0)).toBe('up');
    expect(dirFrom(false, false, false, true, -1, 0)).toBe('right');
    expect(dirFrom(false, false, false, false, 0.3, 0.2)).toBeNull();
    expect(dirFrom(false, false, false, false, 0.2, 0.9)).toBe('down');
    expect(dirFrom(false, false, false, false, -0.8, 0.3)).toBe('left');
    expect(dirFrom(true, true, false, false, 0, 0)).toBeNull();   // cima+baixo se anulam
  });
  // Menu em duas colunas: abas no topo, campos à esquerda e à direita, botões de ação embaixo
  const r = (left: number, top: number, w: number, h: number): Rect => ({ left, top, right: left + w, bottom: top + h });
  const rects = [
    r(0, 0, 100, 30), r(110, 0, 100, 30), r(220, 0, 100, 30),   // 0-2 abas
    r(0, 50, 400, 30), r(440, 50, 400, 30),                      // 3 nome · 4 tamanho do mapa
    r(0, 100, 400, 30), r(440, 100, 400, 30),                    // 5 semente · 6 oponentes
    r(440, 150, 400, 30),                                        // 7 dificuldade (só à direita)
    r(0, 210, 120, 40), r(130, 210, 120, 40),                    // 8 Jogar · 9 Horda
  ];
  it('ordem visual: abas lado a lado, desce pela coluna, atravessa colunas e chega aos botões', () => {
    expect(navPick(rects, 0, 'right')).toBe(1);
    expect(navPick(rects, 1, 'right')).toBe(2);
    expect(navPick(rects, 2, 'right')).toBe(4);             // ninguém na mesma linha: o mais próximo à direita (diagonal)
    expect(navPick(rects, 4, 'right')).toBe(-1);            // nada à direita
    expect(navPick(rects, 0, 'down')).toBe(3);
    expect(navPick(rects, 3, 'down')).toBe(5);
    expect(navPick(rects, 5, 'down')).toBe(8);               // semente → Jogar (alinhado) em vez da dificuldade à direita
    expect(navPick(rects, 3, 'right')).toBe(4);
    expect(navPick(rects, 6, 'down')).toBe(7);
    expect(navPick(rects, 7, 'left')).toBe(5);               // sem vizinho alinhado: o mais próximo à esquerda
    expect(navPick(rects, 8, 'right')).toBe(9);
    expect(navPick(rects, 8, 'up')).toBe(5);
    expect(navPick(rects, 0, 'up')).toBe(-1);
    expect(navPick(rects, -1, 'down')).toBe(0);              // sem foco: o primeiro
    expect(navPick([], 0, 'down')).toBe(-1);
  });
  it('nome curto do controle', () => {
    expect(padDisplayName('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toBe('Xbox Wireless Controller');
    expect(padDisplayName('Steam Deck')).toBe('Steam Deck');
    expect(padDisplayName('x'.repeat(60)).length).toBe(40);
  });
});

describe('controle: configurações', () => {
  it('padrões e saves antigos sem os campos do controle', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ padSensitivity: 1, padInvertY: false, padScheme: 'standard', padVibration: true });
    const old = sanitizeSettings({ volume: 0.3, uiScale: 1.3 } as never);
    expect(old).toMatchObject({ volume: 0.3, uiScale: 1.3, padSensitivity: 1, padInvertY: false, padScheme: 'standard', padVibration: true });
  });
  it('valores inválidos voltam ao padrão ou são limitados', () => {
    expect(sanitizeSettings({ padScheme: 'nintendo' } as never).padScheme).toBe('standard');
    expect(sanitizeSettings({ padSensitivity: 'x' } as never).padSensitivity).toBe(1);
    expect(sanitizeSettings({ padSensitivity: 99 }).padSensitivity).toBe(3);
    expect(sanitizeSettings({ padSensitivity: 0 }).padSensitivity).toBe(0.25);
    expect(sanitizeSettings({ padVibration: false }).padVibration).toBe(false);
    expect(sanitizeSettings({ padInvertY: 1 } as never).padInvertY).toBe(true);
    expect(sanitizeSettings({ padScheme: 'alt' }).padScheme).toBe('alt');
  });
  it('textos do controle existem em PT e EN', () => {
    const keys = Object.keys(STRINGS.pt).filter((k) => k.startsWith('pad.') || k.startsWith('menu.pad') || k === 'hk.pad');
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) expect((STRINGS.en as Record<string, string>)[k], k).toBeTruthy();
    for (const a of ['primary', 'context', 'attackMove', 'stop', 'modifier', 'groups', 'cycleType', 'idle', 'army', 'home', 'power', 'menu', 'overview', 'sameType', 'cursor', 'camera', 'menus']) expect((STRINGS.pt as Record<string, string>)[`pad.act.${a}`], a).toBeTruthy();
  });
});
