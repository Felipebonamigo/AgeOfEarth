// Ponto de entrada: menu → partida (laço de renderização com simulação em passo fixo) → fim de jogo.
import { Renderer } from './render/renderer';
import { HUD } from './ui/hud';
import { Input } from './ui/input';
import { MainMenu } from './ui/menu';
import { Audio } from './audio/audio';
import { Session } from './game/session';
import type { GameConfig } from './core/types';

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
  const menu = new MainMenu(root, { onStart: startGame, onLoad: loadGame, hasSave, onHelp: () => hud.showHelp(), onEncyclopedia: () => hud.showEncyclopedia() });

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
  (window as unknown as { aoe: unknown }).aoe = { get session() { return session; }, renderer, startGame, loadGame };
}

boot().catch((e) => { console.error(e); document.body.innerHTML = `<pre style="color:#f88;padding:20px">Erro ao iniciar: ${(e as Error).stack}</pre>`; });
