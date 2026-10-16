// Configuração de partida do menu do Unreal: validação, 12 jogadores e a mensagem `novaPartida` da ponte.
import { describe, it, expect } from 'vitest';
import WebSocket from 'ws';
import { configFromSetup } from '../scripts/unreal/match';
import { createBridgeServer, parseArgs } from '../scripts/unreal/sim-server';
import { relevoMensagens } from '../scripts/unreal/relevo';
import { createGame } from '../src/core/sim/game';

const slots = (n: number, extra: object = {}) => Array.from({ length: n }, (_, i) => ({ tipo: i === 0 ? 'humano' : 'bot', deus: ['zeus', 'poseidon', 'hades'][i % 3], equipe: i + 1, dificuldade: 'normal', ...extra }));
const setup = (n: number, tamanho = 'giant') => ({ jogadores: slots(n), mapa: { tipo: 'continental', tamanho, semente: 7 } });

describe('configFromSetup', () => {
  it('aceita 12 jogadores em mapa gigante e devolve o humano', () => {
    const r = configFromSetup(setup(12));
    expect(r.errors).toEqual([]);
    expect(r.config!.players).toHaveLength(12);
    expect(r.human).toBe(0);
    expect(r.config!.players.filter((p) => !p.isAI)).toHaveLength(1);
  });
  it('recusa mapa pequeno demais, 13 jogadores, dois humanos e deus inválido', () => {
    expect(configFromSetup(setup(12, 'small')).errors.join()).toMatch(/pedem pelo menos/);
    expect(configFromSetup(setup(13)).config).toBeNull();
    const dois = setup(4); dois.jogadores[1].tipo = 'humano';
    expect(configFromSetup(dois).errors.join()).toMatch(/exatamente 1 humano/);
    const ruim = setup(2, 'small'); ruim.jogadores[1].deus = 'xyz';
    expect(configFromSetup(ruim).errors.join()).toMatch(/deus inválido/);
  });
  it('lugares fechados não entram; regras viram a configuração', () => {
    const s: any = setup(4, 'small'); s.jogadores.push({ tipo: 'fechada', deus: 'zeus', equipe: 1 });
    s.regras = { eraInicial: 2, eraFinal: 5, vitoria: 'maravilhas', mapaRevelado: true };
    const r = configFromSetup(s);
    expect(r.errors).toEqual([]);
    expect(r.config!.players).toHaveLength(4);
    expect(r.config!.startingAge).toBe(2); expect(r.config!.maxAge).toBe(5);
    expect(r.config!.wonderVictory).toBe('points'); expect(r.config!.revealMap).toBe(true);
  });
  it('12 jogadores geram uma partida com 12 inícios afastados', () => {
    const r = configFromSetup(setup(12));
    const st = createGame(r.config!);
    const cs = st.players.map((p) => { const tc = [...st.buildings.values()].find((b) => b.owner === p.id && b.type === 'town_center')!; return [tc.x, tc.y]; });
    let min = Infinity;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) min = Math.min(min, Math.sqrt((cs[i][0] - cs[j][0]) ** 2 + (cs[i][1] - cs[j][1]) ** 2));
    expect(cs).toHaveLength(12);
    expect(min).toBeGreaterThan(40);
  });
});

describe('ponte: relevo e novaPartida', () => {
  it('relevoMensagens gera cabeçalho e partes', () => {
    const st = createGame({ seed: 3, mapSize: 'small', players: [{ name: 'A', god: 'zeus', isAI: false, difficulty: 'normal' }, { name: 'B', god: 'hades', isAI: true, difficulty: 'normal' }] });
    const ms = relevoMensagens(st, { n: 253 }) as any[];
    expect(ms.some((m) => m.type === 'relevo')).toBe(true);
  });
  it('novaPartida refaz a partida e reenvia hello', async () => {
    const o = parseArgs(['--port', '0', '--relevo', '0', '--paused']);
    const srv = createBridgeServer(o);
    await srv.listening;
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    const got: any[] = [];
    ws.on('message', (d) => got.push(JSON.parse(String(d))));
    await new Promise((r) => ws.on('open', r));
    await new Promise((r) => setTimeout(r, 200));
    expect(got.filter((m) => m.type === 'hello')).toHaveLength(1);
    ws.send(JSON.stringify({ type: 'novaPartida', setup: setup(6, 'large') }));
    await new Promise((r) => setTimeout(r, 1500));
    const hellos = got.filter((m) => m.type === 'hello');
    expect(hellos).toHaveLength(2);
    expect(hellos[1].players).toHaveLength(6);
    ws.send(JSON.stringify({ type: 'novaPartida', setup: { jogadores: [] } }));
    await new Promise((r) => setTimeout(r, 300));
    expect(got.some((m) => m.type === 'erro')).toBe(true);
    ws.close(); await srv.close();
  }, 20000);
});
