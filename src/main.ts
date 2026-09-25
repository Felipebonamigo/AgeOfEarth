// Ponto de entrada: menu → partida (laço de renderização com simulação em passo fixo) → fim de jogo.
import { Renderer } from './render/renderer';
import { HUD } from './ui/hud';
import { Input } from './ui/input';
import { MainMenu } from './ui/menu';
import { Audio } from './audio/audio';
import { Session } from './game/session';
import type { GameConfig } from './core/types';
import { SCENARIOS } from './core/scenario/campaign';
import { NetworkScheduler } from './core/net/lockstep';
import type { NetClient } from './net/client';
import type { Command } from './core/types';
import { spawnUnit } from './core/sim/entities';
import { nearestFreeTile } from './core/map/pathfinding';

const SAVE_KEY = 'aoe_save_v1';

async function boot() {
  const root = document.getElementById('app')!;
  const renderer = new Renderer();
  await renderer.init(root);
  const audio = new Audio();
  let session: Session | null = null;
  const hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } };

  const hud = new HUD(root, renderer, audio, {
    hasSave,
    onSave: () => { if (!session) return; try { localStorage.setItem(SAVE_KEY, session.save()); hud.toast('Jogo salvo.', 'good'); } catch (e) { hud.toast('Falha ao salvar: ' + (e as Error).message, 'warn'); } },
    onLoad: () => loadGame(),
    onQuit: () => { session = null; hud.setSession(null); hud.setVisible(false); menu.show(); document.body.className = ''; },
    onNextMission: (id) => { const i = SCENARIOS.findIndex((m) => m.id === id); const next = SCENARIOS[i + 1]; if (next) startMission(next.id); else { session = null; hud.setSession(null); hud.setVisible(false); menu.show(); } },
  });
  hud.setVisible(false);
  const input = new Input(renderer.canvas, () => session, renderer, hud, audio);

  const startGame = (config: GameConfig) => {
    session = Session.newGame(config);
    renderer.setState(session.state);
    const home = [...session.state.buildings.values()].find((b) => b.owner === session!.local && b.type === 'town_center');
    if (home) renderer.cam.centerOn(home.x, home.y);
    hud.setSession(session); hud.setVisible(true); menu.hide();
    hud.toast(`Bem-vindo, ${session.player.name}. Você serve a ${session.state.players[session.local].god === 'zeus' ? 'Zeus' : session.state.players[session.local].god === 'poseidon' ? 'Poseidon' : 'Hades'}. Pressione F1 para ajuda.`, 'gold');
  };
  const loadGame = () => {
    try {
      const json = localStorage.getItem(SAVE_KEY); if (!json) return;
      session = Session.load(json);
      renderer.setState(session.state);
      const tc = [...session.state.buildings.values()].find((b) => b.owner === session!.local && b.type === 'town_center');
      if (tc) renderer.cam.centerOn(tc.x, tc.y);
      hud.setSession(session); hud.setVisible(true); menu.hide();
      hud.toast('Jogo carregado.', 'good');
    } catch (e) { hud.toast('Falha ao carregar: ' + (e as Error).message, 'warn'); }
  };
  const startMission = (id: string) => {
    const def = SCENARIOS.find((m) => m.id === id); if (!def) return;
    startGame({ ...def.config, scenario: id });
    if (session) { session.paused = true; hud.showIntro(id, () => { if (session) session.paused = false; }); }
  };
  const startNetworkGame = (client: NetClient, config: GameConfig, slots: number[]) => {
    const local = slots.indexOf(client.slot);
    session = Session.newGame(config, local);
    const humans = slots.map((_, i) => i);
    const sched = new NetworkScheduler(local, humans, 4, { sendCmds: (t, c) => client.sendCmds(t, c), sendHash: (t, h) => client.sendHash(t, h) });
    sched.onDesync = (t) => hud.toast(`⚠️ Dessincronização detectada no tick ${t}. A partida pode divergir entre os jogadores.`, 'warn');
    client.on('cmds', (m) => { const idx = slots.indexOf(Number(m.slot)); if (idx >= 0) sched.receive(idx, Number(m.tick), (m.cmds as Command[]) ?? []); });
    client.on('hash', (m) => { const idx = slots.indexOf(Number(m.slot)); if (idx >= 0) sched.receiveHash(idx, Number(m.tick), Number(m.hash)); });
    client.on('left', (m) => { const idx = slots.indexOf(Number(m.slot)); if (idx >= 0) { sched.dropPlayer(idx); hud.toast(`${config.players[idx]?.name ?? 'Um jogador'} saiu da partida.`, 'warn'); } });
    client.on('close', () => hud.toast('Conexão com o servidor perdida.', 'warn'));
    session.scheduler = sched;
    session.speed = 1;
    renderer.setState(session.state);
    const home = [...session.state.buildings.values()].find((b) => b.owner === session!.local && b.type === 'town_center');
    if (home) renderer.cam.centerOn(home.x, home.y);
    hud.setSession(session); hud.setVisible(true); menu.hide();
    hud.toast(`Partida online: ${config.players.filter((p) => !p.isAI).length} jogadores. Você é ${config.players[local].name}.`, 'gold');
  };
  const menu = new MainMenu(root, { onStart: startGame, onLoad: loadGame, hasSave, onHelp: () => hud.showHelp(), onEncyclopedia: () => hud.showEncyclopedia(), onMission: startMission, onNetworkStart: startNetworkGame });

  window.addEventListener('keydown', (e) => {
    if (!session) return;
    if (e.key === 'F5') { e.preventDefault(); try { localStorage.setItem(SAVE_KEY, session.save()); hud.toast('Jogo salvo (F5).', 'good'); } catch { /* ignore */ } }
    if (e.key === 'F9') { e.preventDefault(); loadGame(); }
  });
  window.addEventListener('resize', () => renderer.resize());

  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (session) {
      const alpha = session.step(dt);
      input.update(dt);
      renderer.render(session.state, alpha, input.renderUI(), dt);
      hud.update(dt);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // Expõe para depuração/testes automatizados
  (window as unknown as { aoe: unknown }).aoe = { get session() { return session; }, renderer, startGame, loadGame, debugSpawn: (owner: number, type: string, x: number, y: number) => { if (!session) return null; const t = nearestFreeTile(session.state.map, x, y, 12); return t ? spawnUnit(session.state, owner, type, t.x + 0.5, t.y + 0.5) : null; } };
}

boot().catch((e) => { console.error(e); document.body.innerHTML = `<pre style="color:#f88;padding:20px">Erro ao iniciar: ${(e as Error).stack}</pre>`; });
