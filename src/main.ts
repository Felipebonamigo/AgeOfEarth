// Ponto de entrada: menu → partida (laço de renderização com simulação em passo fixo) → fim de jogo.
import { Renderer } from './render/renderer';
import { HUD } from './ui/hud';
import { Input } from './ui/input';
import { MainMenu } from './ui/menu';
import { Audio } from './audio/audio';
import { Session } from './game/session';
import type { GameConfig } from './core/types';
import { SCENARIOS, HORDE } from './core/scenario/campaign';
import { NetworkScheduler, LocalScheduler } from './core/net/lockstep';
import type { NetClient } from './net/client';
import type { Command } from './core/types';
import { spawnUnit } from './core/sim/entities';
import { nearestFreeTile } from './core/map/pathfinding';
import { Achievements } from './game/achievements';
import { detectLocale, setLocale, t } from './i18n';
import { loadSettings, saveSettings } from './game/settings';
import { exportText, importText } from './game/files';
import { applyUiScale, initDisplay, isFullscreen, setFullscreen, desktop } from './game/display';
import type { OptionsContext } from './ui/options';
import { MAJOR_GODS } from './core/data';
import { serialize, deserialize } from './core/serialize';

const SAVE_KEY = 'aoe_save_v1';
const REPLAY_KEY = 'aoe_replay_v1';

// Últimos erros do navegador (para o diagnóstico exportável)
const recentErrors: { when: string; msg: string }[] = [];
const noteError = (msg: string) => { recentErrors.push({ when: new Date().toISOString(), msg: msg.slice(0, 500) }); if (recentErrors.length > 50) recentErrors.shift(); };
window.addEventListener('error', (e) => noteError(`${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => noteError(`promise: ${String((e as PromiseRejectionEvent).reason)}`));

async function boot() {
  const settings = loadSettings();
  setLocale(settings.locale ?? detectLocale());
  const root = document.getElementById('app')!;
  const renderer = new Renderer();
  await renderer.init(root);
  const audio = new Audio();
  let session: Session | null = null;
  const achievements = new Achievements();
  const hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } };
  const hasReplay = () => { try { return !!localStorage.getItem(REPLAY_KEY); } catch { return false; } };
  let replaySaved = false;
  const saveReplay = () => { if (!session || session.spectator) return; const json = session.replayJSON(); if (!json) return; try { localStorage.setItem(REPLAY_KEY, json); replaySaved = true; } catch { /* ignore */ } };

  const hud: HUD = new HUD(root, renderer, audio, {
    hasSave,
    onSave: () => { if (!session) return; try { localStorage.setItem(SAVE_KEY, session.save()); hud.toast(t('msg.saved'), 'good'); } catch (e) { hud.toast(t('msg.saveFail', { err: (e as Error).message }), 'warn'); } },
    onExport: () => { if (!session) return; void exportText(`age-of-earth-${new Date().toISOString().slice(0, 10)}.json`, session.save()).then((ok) => { if (ok) hud.toast(t('msg.saved'), 'good'); }); },
    onImport: () => { void importText().then((json) => { if (!json) return; try { session = Session.load(json); replaySaved = false; renderer.setState(session.state); hud.setSession(session); hud.setVisible(true); menu.hide(); hud.toast(t('msg.loaded'), 'good'); } catch (e) { hud.toast(t('msg.loadFail', { err: (e as Error).message }), 'warn'); } }); },
    getOptions: () => options,
    onDiagnostic: () => { void exportText(`age-of-earth-diagnostico-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`, diagnostic()).then((ok) => { if (ok) hud.toast(t('msg.diagnosticSaved'), 'good'); }); },
    onLocaleChanged: () => { settings.locale = (localStorage.getItem('aoe_locale') as 'pt' | 'en') ?? 'pt'; saveSettings(settings); if (session) { hud.setSession(session); hud.refreshTop(); } },
    onLoad: () => loadGame(),
    onQuit: () => { saveReplay(); session = null; hostResumeCheck = null; hud.onChat = null; hud.closeChat(); hud.setSession(null); hud.setVisible(false); menu.show(); document.body.className = ''; },
    onNextMission: (id) => { const i = SCENARIOS.findIndex((m) => m.id === id); const next = SCENARIOS[i + 1]; if (next) startMission(next.id); else { session = null; hud.setSession(null); hud.setVisible(false); menu.show(); } },
  });
  hud.setVisible(false);
  /** Pacote de diagnóstico: versão, configurações, erros recentes, relatório de dessincronização e o save atual. */
  const diagnostic = (): string => {
    let desync: unknown = null; try { desync = JSON.parse(localStorage.getItem('aoe_desync_v1') ?? 'null'); } catch { /* ignore */ }
    return JSON.stringify({ version: 1, when: new Date().toISOString(), userAgent: navigator.userAgent, screen: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }, settings, locale: settings.locale, errors: recentErrors, desync, session: session ? { tick: session.state.tick, local: session.local, config: session.state.config, online: !(session.scheduler instanceof LocalScheduler), save: session.save() } : null });
  };
  // Opções compartilhadas (menu principal e menu da partida)
  const options: OptionsContext = {
    settings,
    getVolume: () => audio.volume, setVolume: (v) => { audio.setVolume(v); settings.volume = v; saveSettings(settings); },
    setEdgeScroll: (v) => { input.edgeScroll = v; settings.edgeScroll = v; saveSettings(settings); },
    setUiScale: (v) => { settings.uiScale = v; saveSettings(settings); applyUiScale(v); },
    setRenderScale: (v) => { settings.renderScale = v; saveSettings(settings); renderer.setRenderScale(v); },
    setFullscreen: (v) => { settings.fullscreen = v; saveSettings(settings); setFullscreen(v); },
    onLocaleChanged: () => { settings.locale = (localStorage.getItem('aoe_locale') as 'pt' | 'en') ?? 'pt'; saveSettings(settings); if (session) { hud.setSession(session); hud.refreshTop(); } },
    onHotkeys: () => hud.showHotkeys(),
  };
  achievements.onUnlock = (a) => { hud.toast(`🏅 Conquista: ${a.icon} ${a.name} — ${a.desc}`, 'gold'); audio.play('complete'); };
  const input: Input = new Input(renderer.canvas, () => session, renderer, hud, audio);

  const startGame = (config: GameConfig) => {
    session = Session.newGame(config);
    achievements.recordGod(config.players[session.local]?.god ?? 'zeus');
    renderer.setState(session.state);
    const home = [...session.state.buildings.values()].find((b) => b.owner === session!.local && b.type === 'town_center');
    if (home) renderer.cam.centerOn(home.x, home.y);
    hud.setSession(session); hud.setVisible(true); menu.hide();
    hud.toast(t('msg.welcome', { name: session.player.name, god: MAJOR_GODS[session.state.players[session.local].god]?.name ?? '' }), 'gold');
    if (config.mode === 'regicide') hud.toast(t('msg.regicideStart'), 'info');
    if (config.mode === 'koth') hud.toast(t('msg.kothStart', { min: 4 }), 'info');
    if (session.state.relics.length > 0 && !config.scenario) hud.toast(t('msg.relicsStart'), 'info');
  };
  const loadGame = () => {
    try {
      const json = localStorage.getItem(SAVE_KEY); if (!json) return;
      session = Session.load(json); replaySaved = false;
      renderer.setState(session.state);
      const tc = [...session.state.buildings.values()].find((b) => b.owner === session!.local && b.type === 'town_center');
      if (tc) renderer.cam.centerOn(tc.x, tc.y);
      hud.setSession(session); hud.setVisible(true); menu.hide();
      hud.toast(t('msg.loaded'), 'good');
    } catch (e) { hud.toast(t('msg.loadFail', { err: (e as Error).message }), 'warn'); }
  };
  const startMission = (id: string) => {
    const def = id === HORDE.id ? HORDE : SCENARIOS.find((m) => m.id === id); if (!def) return;
    replaySaved = false;
    startGame({ ...def.config, scenario: id });
    if (session) { session.paused = true; hud.showIntro(id, () => { if (session) session.paused = false; }); }
  };
  let hostResumeCheck: (() => void) | null = null;
  const startNetworkGame = (client: NetClient, config: GameConfig, slots: number[], delay = 4) => {
    const local = slots.indexOf(client.slot);
    session = Session.newGame(config, local);
    const humans = slots.map((_, i) => i);
    const sched = new NetworkScheduler(local, humans, delay, { sendCmds: (t, c) => client.sendCmds(t, c), sendHash: (t, h) => client.sendHash(t, h) });
    hud.onChat = (text) => client.chat(text);
    client.on('chat', (m) => hud.toast(`💬 ${String(m.name ?? '?')}: ${String(m.text ?? '')}`, 'info'));
    sched.onDesync = (tk) => {
      hud.toast(t('msg.desync', { tick: tk }), 'warn');
      // relatório de dessincronização (para depuração): hashes, configuração e o estado local no momento
      try { if (session) localStorage.setItem('aoe_desync_v1', JSON.stringify({ when: new Date().toISOString(), local, slots, delay, desync: sched.lastDesync, config, state: session.save() })); } catch { /* ignore */ }
    };
    client.on('cmds', (m) => { const idx = slots.indexOf(Number(m.slot)); if (idx >= 0) sched.receive(idx, Number(m.tick), (m.cmds as Command[]) ?? []); });
    client.on('hash', (m) => { const idx = slots.indexOf(Number(m.slot)); if (idx >= 0) sched.receiveHash(idx, Number(m.tick), Number(m.hash)); });
    // Queda de um jogador: todos pausam aguardando a reconexão; o anfitrião pode seguir sem ele (P → 'resume' para todos)
    let awaiting = -1;
    client.on('left', (m) => {
      const idx = slots.indexOf(Number(m.slot)); if (idx < 0 || !session) return;
      sched.dropPlayer(idx);
      awaiting = idx; session.paused = true; hud.refreshTop();
      hud.toast(t('msg.waitingRejoin', { name: config.players[idx]?.name ?? t('msg.someone') }), 'warn');
      if (client.isHost) hud.toast(t('msg.hostResumeHint'), 'info');
    });
    client.on('resume', () => { if (!session) return; awaiting = -1; session.paused = false; hud.refreshTop(); hud.toast(t('msg.resumed'), 'good'); });
    const resumeAfterRejoin = () => { if (awaiting !== -1 && session) { awaiting = -1; session.paused = false; hud.refreshTop(); } };
    hostResumeCheck = () => { if (awaiting !== -1 && client.isHost && session && !session.paused) { awaiting = -1; client.resume(); } };
    client.on('close', () => { hud.toast(t('msg.connectionLost'), 'warn'); hud.toast(t('msg.reconnectHint'), 'info'); });
    // Anfitrião: alguém reconectou → manda o estado atual e os comandos já recebidos; todos voltam a exigir os comandos dele mais adiante
    client.on('snapshotRequest', (m) => {
      if (!session || !(session.scheduler instanceof NetworkScheduler)) return;
      const idx = slots.indexOf(Number(m.slot)); if (idx < 0) return;
      const tk = session.state.tick;
      const sch = session.scheduler as NetworkScheduler;
      client.snapshot(Number(m.slot), JSON.stringify({ state: serialize(session.state), pending: sch.exportPending(tk) }), tk);
      sch.addPlayer(idx, NetworkScheduler.resumeTick(tk, sch.delayTicks));
      hud.toast(t('msg.rejoined', { name: config.players[idx]?.name ?? t('msg.someone') }), 'good');
      resumeAfterRejoin();
    });
    client.on('rejoined', (m) => {
      if (!session || !(session.scheduler instanceof NetworkScheduler)) return;
      const idx = slots.indexOf(Number(m.slot)); if (idx < 0) return;
      const sch = session.scheduler as NetworkScheduler;
      sch.addPlayer(idx, NetworkScheduler.resumeTick(Number(m.tick), sch.delayTicks));
      hud.toast(t('msg.rejoined', { name: config.players[idx]?.name ?? t('msg.someone') }), 'good');
      resumeAfterRejoin();
    });
    session.scheduler = sched;
    session.speed = 1;
    renderer.setState(session.state);
    const home = [...session.state.buildings.values()].find((b) => b.owner === session!.local && b.type === 'town_center');
    if (home) renderer.cam.centerOn(home.x, home.y);
    hud.setSession(session); hud.setVisible(true); menu.hide();
    hud.toast(t('msg.online', { n: config.players.filter((p) => !p.isAI).length, name: config.players[local].name }), 'gold');
    hud.toast(t('mp.delayInfo', { n: delay, ms: delay * 50 }) + ' · ' + t('msg.chatHint'), 'info');
  };
  /** Reconexão: entra na partida em andamento com o instantâneo do anfitrião. */
  const rejoinNetworkGame = (client: NetClient, config: GameConfig, slots: number[], delay: number) => {
    startNetworkGame(client, config, slots, delay);
    if (!session) return;
    const s = session; s.paused = true;
    hud.toast(t('msg.rejoining'), 'info');
    client.on('snapshot', (m) => {
      if (session !== s) return;
      try {
        const data = JSON.parse(String(m.data)) as { state: string; pending: [number, [number, Command[]][]][] };
        const st = deserialize(data.state);
        s.state = st; s.eventCursor = st.events.length; s.selection.clear();
        renderer.setState(st);
        const sch = s.scheduler as NetworkScheduler;
        sch.importPending(data.pending, NetworkScheduler.resumeTick(Number(m.tick), delay));
        s.paused = false; hud.setSession(s); hud.refreshTop();
        hud.toast(t('msg.rejoined', { name: config.players[s.local]?.name ?? '' }), 'good');
      } catch (e) { hud.toast(t('msg.loadFail', { err: (e as Error).message }), 'warn'); }
    });
  };
  const startHorde = (god: string, difficulty: GameConfig['players'][number]['difficulty']) => {
    const cfg: GameConfig = { ...HORDE.config, seed: (Math.floor(Math.random() * 1e9)) >>> 0, scenario: HORDE.id, players: HORDE.config.players.map((p, i) => (i === 0 ? { ...p, god, difficulty } : p)) };
    replaySaved = false;
    startGame(cfg);
    if (session) { session.paused = true; hud.showIntro(HORDE.id, () => { if (session) session.paused = false; }); }
  };
  const watchReplay = () => {
    try {
      const json = localStorage.getItem(REPLAY_KEY); if (!json) return;
      session = Session.replay(json);
      renderer.setState(session.state);
      const home = [...session.state.buildings.values()].find((b) => b.owner === session!.local && b.type === 'town_center');
      if (home) renderer.cam.centerOn(home.x, home.y);
      hud.setSession(session); hud.setVisible(true); menu.hide();
      hud.toast(t('msg.replay'), 'gold');
    } catch (e) { hud.toast(t('msg.replayFail', { err: (e as Error).message }), 'warn'); }
  };
  const menu = new MainMenu(root, { onStart: (cfg) => { replaySaved = false; startGame(cfg); }, onLoad: loadGame, hasSave, onHelp: () => hud.showHelp(), onEncyclopedia: () => hud.showEncyclopedia(), onMission: startMission, onNetworkStart: startNetworkGame, onNetworkRejoin: rejoinNetworkGame, onHorde: startHorde, onReplay: watchReplay, hasReplay, onLocaleChanged: () => { settings.locale = (localStorage.getItem('aoe_locale') as 'pt' | 'en') ?? 'pt'; saveSettings(settings); }, getOptions: () => options, onHotkeys: () => hud.showHotkeys() });
  input.edgeScroll = settings.edgeScroll;
  // Tela, escala e qualidade salvas
  initDisplay((v) => { if (settings.fullscreen !== v) { settings.fullscreen = v; saveSettings(settings); } });
  applyUiScale(settings.uiScale);
  if (settings.renderScale !== 1) renderer.setRenderScale(settings.renderScale);
  if (desktop()?.setFullscreen && settings.fullscreen !== isFullscreen()) setFullscreen(settings.fullscreen);

  window.addEventListener('keydown', (e) => {
    if (!session) return;
    if (e.key === 'F5') { e.preventDefault(); try { localStorage.setItem(SAVE_KEY, session.save()); hud.toast(t('msg.savedF5'), 'good'); } catch { /* ignore */ } }
    if (e.key === 'F9') { e.preventDefault(); loadGame(); }
  });
  window.addEventListener('resize', () => renderer.resize());

  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (session) {
      hostResumeCheck?.();
      const alpha = session.step(dt);
      if (session.state.gameOver && !replaySaved) saveReplay();
      if (!session.spectator) achievements.update(session.state, session.local, dt);
      input.update(dt);
      renderer.render(session.state, alpha, input.renderUI(), dt);
      hud.update(dt);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // Expõe para depuração/testes automatizados
  (window as unknown as { aoe: unknown }).aoe = { get session() { return session; }, renderer, startGame, loadGame, diagnostic, debugSpawn: (owner: number, type: string, x: number, y: number) => { if (!session) return null; const t = nearestFreeTile(session.state.map, x, y, 12); return t ? spawnUnit(session.state, owner, type, t.x + 0.5, t.y + 0.5) : null; } };
}

boot().catch((e) => { console.error(e); document.body.innerHTML = `<pre style="color:#f88;padding:20px">Erro ao iniciar: ${(e as Error).stack}</pre>`; });
