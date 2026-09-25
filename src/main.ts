// Ponto de entrada: menu → partida (laço de renderização com simulação em passo fixo) → fim de jogo.
import { Renderer } from './render/renderer';
import { HUD } from './ui/hud';
import { Input } from './ui/input';
import { MainMenu } from './ui/menu';
import { Audio } from './audio/audio';
import { Session } from './game/session';
import type { GameConfig } from './core/types';
import { SCENARIOS, HORDE } from './core/scenario/campaign';
import { migrateMap, validateMap, canonicalize, mapHash, type FixedMapData } from './core/map/fixed';
import { validateScenario } from './core/scenario/schema';
import { gameConfigFor } from './core/scenario/compile';
import { putMap, slugify } from './game/maps';
import { MapEditor } from './editor/editor';
import { EditorPanel, type TestOpts } from './editor/panel';
import type { EditorView } from './editor/types';
import { issueText } from './ui/menu';
import type { Difficulty } from './core/constants';
import { NetworkScheduler, LocalScheduler } from './core/net/lockstep';
import type { NetClient } from './net/client';
import type { Command } from './core/types';
import { spawnUnit } from './core/sim/entities';
import { nearestFreeTile } from './core/map/pathfinding';
import { Achievements } from './game/achievements';
import { detectLocale, setLocale, t } from './i18n';
import { loadSettings, saveSettings } from './game/settings';
import { exportText, importText } from './game/files';
import { applyUiScale, initDisplay, isFullscreen, setFullscreen, desktop, setPresence } from './game/display';
import type { OptionsContext } from './ui/options';
import { MAJOR_GODS, MAJOR_GOD_LIST, AGES } from './core/data';
import { serialize, deserialize } from './core/serialize';
import { mapToData } from './core/map/fixed';

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
  // Editor de mapas: a instância vive enquanto o editor estiver aberto ou uma partida de teste estiver rodando (reaproveitada ao voltar)
  let editor: MapEditor | null = null;
  let editorPanel: EditorPanel | null = null;
  let returnToEditor = false;                 // a partida atual é um teste do editor: sem conquistas, replay ou F5
  let editorCam: { x: number; y: number; zoom: number } | null = null;
  const inEditor = () => !!session && session.ui.mode === 'editor';
  const editorOrTest = () => returnToEditor || inEditor();
  const saveReplay = () => { if (!session || session.spectator || editorOrTest()) return; const json = session.replayJSON(); if (!json) return; try { localStorage.setItem(REPLAY_KEY, json); replaySaved = true; } catch { /* ignore */ } };

  const hud: HUD = new HUD(root, renderer, audio, {
    hasSave,
    onSave: () => { if (!session) return; try { localStorage.setItem(SAVE_KEY, session.save()); hud.toast(t('msg.saved'), 'good'); } catch (e) { hud.toast(t('msg.saveFail', { err: (e as Error).message }), 'warn'); } },
    onExport: () => { if (!session) return; void exportText(`age-of-earth-${new Date().toISOString().slice(0, 10)}.json`, session.save()).then((ok) => { if (ok) hud.toast(t('msg.saved'), 'good'); }); },
    onImport: () => { void importText().then((json) => { if (!json) return; try { session = Session.load(json); replaySaved = false; renderer.setState(session.state); hud.setSession(session); hud.setVisible(true); menu.hide(); hud.toast(t('msg.loaded'), 'good'); } catch (e) { hud.toast(t('msg.loadFail', { err: (e as Error).message }), 'warn'); } }); },
    getOptions: () => options,
    onExportMap: () => { if (!session) return; const data = canonicalize({ ...mapToData(session.state.map, `mapa-${session.state.seed}`), id: `mapa-${session.state.seed}` }); void exportText(`age-of-earth-mapa-${session.state.seed}.map.json`, JSON.stringify(data)).then((ok) => { if (ok) hud.toast(t('msg.mapExported'), 'good'); }); },
    onSaveMapLocal: () => {
      if (!session) return;
      const name = (window.prompt(t('main.fixedMapSel'), session.state.config.map?.name ?? `mapa-${session.state.seed}`) ?? '').trim(); if (!name) return;
      try { const entry = putMap({ ...mapToData(session.state.map, name), id: slugify(name) }); hud.toast(t('msg.mapSaved', { name: entry.name }), 'good'); } catch { hud.toast(t('msg.mapQuota'), 'warn'); }
    },
    onDiagnostic: () => { void exportText(`age-of-earth-diagnostico-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`, diagnostic()).then((ok) => { if (ok) hud.toast(t('msg.diagnosticSaved'), 'good'); }); },
    onLocaleChanged: () => { settings.locale = (localStorage.getItem('aoe_locale') as 'pt' | 'en') ?? 'pt'; saveSettings(settings); if (session) { hud.setSession(session); hud.refreshTop(); } },
    onLoad: () => loadGame(),
    onQuit: () => { if (returnToEditor && editor) { returnFromTest(); return; } saveReplay(); session = null; hostResumeCheck = null; hud.onChat = null; hud.closeChat(); hud.setSession(null); hud.setVisible(false); menu.show(); document.body.className = ''; },
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
      if (editorOrTest()) leaveEditorView();   // carregar um save encerra o editor/teste (o rascunho fica no autosave)
      session = Session.load(json); replaySaved = false;
      renderer.setState(session.state);
      const tc = [...session.state.buildings.values()].find((b) => b.owner === session!.local && b.type === 'town_center');
      if (tc) renderer.cam.centerOn(tc.x, tc.y);
      hud.setSession(session); hud.setVisible(true); menu.hide();
      hud.toast(t('msg.loaded'), 'good');
    } catch (e) { hud.toast(t('msg.loadFail', { err: (e as Error).message }), 'warn'); }
  };
  // Dificuldade da campanha: Fácil deixa as IAs inimigas fáceis; Difícil sobe um degrau (normal→difícil, difícil→muito difícil); as invasões roteirizadas escalam em helpers.raid
  const enemyDifficulty = (d: Difficulty, c: 'easy' | 'normal' | 'hard'): Difficulty => (c === 'easy' ? 'easy' : c === 'hard' ? ({ easy: 'normal', normal: 'hard', hard: 'brutal', brutal: 'brutal' } as Record<Difficulty, Difficulty>)[d] : d);
  const startMission = (id: string, diff: 'easy' | 'normal' | 'hard' = 'normal') => {
    const def = id === HORDE.id ? HORDE : SCENARIOS.find((m) => m.id === id); if (!def) return;
    replaySaved = false;
    startGame({ ...def.config, scenario: id, campaignDifficulty: diff, players: def.config.players.map((p) => (p.isAI ? { ...p, difficulty: enemyDifficulty(p.difficulty, diff) } : p)) });
    if (session) { session.paused = true; hud.showIntro(() => { if (session) session.paused = false; }); }
  };
  /**
   * Cenário personalizado (docs/EDITOR.md §4.7): mapa de Meus mapas (ou importado) com `scenario` embutido. Config do
   * arquivo (gameConfigFor) + mapa inline e hash; semente do cenário ou sorteada. Ids reservados são recusados
   * (validateScenario sem allowReserved): nunca marca progresso da campanha nem conquistas de missão.
   */
  const startScenarioFile = (map: FixedMapData): boolean => {
    const sc = map.scenario;
    if (!sc) { hud.toast(t('main.customScenarioNo'), 'warn'); return false; }
    const issues = validateScenario(sc);
    if (issues.length) { alert(`${t('main.customScenarioBad')}\n${issues.slice(0, 5).map((i) => `${i.path || '$'}: ${i.message}`).join('\n')}`); return false; }
    const mapIssues = validateMap(map, { players: sc.config.players.length, mode: sc.config.mode, ai: sc.config.players.map((p) => p.isAI) });
    const errors = mapIssues.filter((i) => i.level === 'error');
    if (errors.length) { alert(`${t('main.fixedMapErrors')}\n${errors.slice(0, 5).map(issueText).join('\n')}`); return false; }
    if (editorOrTest()) leaveEditorView();
    replaySaved = false;
    const base = gameConfigFor(sc);
    try { startGame({ ...base, seed: sc.config.seed ?? ((Math.floor(Math.random() * 1e9)) >>> 0), map, mapHash: mapHash(map), scenarioData: sc }); }
    catch (e) { hud.toast(t('msg.loadFail', { err: (e as Error).message }), 'warn'); return false; }
    if (session) { session.paused = true; hud.showIntro(() => { if (session) session.paused = false; }); }
    return true;
  };
  let hostResumeCheck: (() => void) | null = null;
  const startNetworkGame = (client: NetClient, config: GameConfig, slots: number[], delay = 4) => {
    // Dado de outro par: o mapa fixo recebido em `start` é migrado e validado antes de criar a sessão
    if (config.map) {
      try { config.map = migrateMap(config.map); } catch { config.map = undefined; menu.showNetError(t('mp.mapInvalid', { reason: t('main.fixedMapBad') })); return; }
      const issues = validateMap(config.map, { players: config.players.length, mode: config.mode });
      const errors = issues.filter((i) => i.level === 'error');
      if (errors.length) { menu.showNetError(t('mp.mapInvalid', { reason: errors.slice(0, 2).map(issueText).join('; ') })); return; }
    }
    // Cenário JSON vindo do anfitrião: validado em todos os clientes (ids reservados recusados) antes de criar a sessão
    if (config.scenarioData !== undefined) {
      const issues = validateScenario(config.scenarioData);
      if (issues.length) { menu.showNetError(t('mp.scenarioInvalid', { reason: issues.slice(0, 2).map((i) => `${i.path || '$'}: ${i.message}`).join('; ') })); return; }
    }
    const spectator = client.isSpectator || slots.indexOf(client.slot) < 0;
    const local = spectator ? Math.max(0, config.players.findIndex((p) => !p.isAI)) : slots.indexOf(client.slot);   // espectador assiste pela perspectiva do primeiro humano, com o mapa revelado
    session = Session.newGame(config, local); session.spectator = spectator;
    const humans = slots.map((_, i) => i);
    const sched = new NetworkScheduler(spectator ? -1 : local, humans, delay, { sendCmds: (t, c) => client.sendCmds(t, c), sendHash: (t, h) => client.sendHash(t, h) });
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
      const idx = slots.indexOf(Number(m.slot)); if (idx < 0 && !m.spectator) return;
      const tk = session.state.tick;
      const sch = session.scheduler as NetworkScheduler;
      client.snapshot(Number(m.slot), JSON.stringify({ state: serialize(session.state), pending: sch.exportPending(tk) }), tk);
      if (idx < 0) { hud.toast(t('msg.spectatorJoined', { name: String(m.name ?? '?') }), 'info'); return; }   // espectador: só o instantâneo
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
    hud.setRevealAll(spectator);
    if (spectator) hud.toast(t('msg.spectating'), 'gold');
    else hud.toast(t('msg.online', { n: config.players.filter((p) => !p.isAI).length, name: config.players[local].name }), 'gold');
    hud.toast(t('mp.delayInfo', { n: delay, ms: delay * 50 }) + ' · ' + t('msg.chatHint'), 'info');
  };
  /** Reconexão: entra na partida em andamento com o instantâneo do anfitrião. */
  const rejoinNetworkGame = (client: NetClient, config: GameConfig, slots: number[], delay: number, dropped: number[] = []) => {
    startNetworkGame(client, config, slots, delay);
    if (!session) return;
    const s = session; s.paused = true;
    for (const slot of dropped) { const idx = slots.indexOf(slot); if (idx >= 0) (s.scheduler as NetworkScheduler).dropPlayer(idx); }   // quem já caiu não é aguardado
    hud.toast(t('msg.rejoining'), 'info');
    client.on('snapshot', (m) => {
      if (session !== s) return;
      try {
        const data = JSON.parse(String(m.data)) as { state: string; pending: [number, [number, Command[]][]][] };
        const st = deserialize(data.state);
        s.state = st; s.eventCursor = st.events.length; s.selection.clear();
        renderer.setState(st);
        const sch = s.scheduler as NetworkScheduler;
        sch.importPending(data.pending, NetworkScheduler.resumeTick(Number(m.tick), delay), Number(m.tick));
        s.paused = false; hud.setSession(s); hud.setRevealAll(s.spectator); hud.refreshTop();
        hud.toast(s.spectator ? t('msg.spectating') : t('msg.rejoined', { name: config.players[s.local]?.name ?? '' }), 'good');
      } catch (e) { hud.toast(t('msg.loadFail', { err: (e as Error).message }), 'warn'); }
    });
  };
  const startHorde = (god: string, difficulty: GameConfig['players'][number]['difficulty']) => {
    const cfg: GameConfig = { ...HORDE.config, seed: (Math.floor(Math.random() * 1e9)) >>> 0, scenario: HORDE.id, campaignDifficulty: difficulty === 'easy' ? 'easy' : difficulty === 'normal' ? 'normal' : 'hard', players: HORDE.config.players.map((p, i) => (i === 0 ? { ...p, god, difficulty } : p)) };
    replaySaved = false;
    startGame(cfg);
    if (session) { session.paused = true; hud.showIntro(() => { if (session) session.paused = false; }); }
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
  // ---------------- Editor de mapas (docs/EDITOR.md §4) ----------------
  const editorView: EditorView = { invalidateRect: (x0, y0, x1, y1) => renderer.invalidateRect(x0, y0, x1, y1), invalidateMinimap: () => hud.minimap.invalidate() };
  /** Mostra a instância do editor (nova ou de volta do teste): sessão pausada, HUD em modo editor, painel e entrada delegada. */
  const showEditor = (ed: MapEditor, cam: { x: number; y: number; zoom: number } | null) => {
    session = ed.session; hostResumeCheck = null; hud.onChat = null; hud.closeChat();
    const { w, h } = ed.map;
    renderer.chunkCacheLimit = Math.ceil(w / 16) * Math.ceil(h / 16);
    renderer.setState(ed.state);
    if (cam) { renderer.cam.zoom = cam.zoom; renderer.cam.x = cam.x; renderer.cam.y = cam.y; renderer.cam.clamp(); } else renderer.fitMap();
    hud.setSession(ed.session); hud.setEditorMode(true); hud.setRevealAll(true); hud.setVisible(true); hud.setTestMode(null);
    editorPanel = new EditorPanel(ed, hud, renderer, { onTest: (opts) => testFromEditor(opts), onExit: () => exitEditor() });
    const panel = editorPanel;
    input.setEditor(ed, { menu: () => panel.showMenu(), hotkeys: () => panel.showHotkeys(), save: () => { panel.save(); }, test: () => panel.showTest(), pickTile: (x, y) => panel.pickTile(x, y) });
    menu.hide();
  };
  /** Desmonta o painel e devolve renderer/HUD/entrada ao modo de partida (a MapEditor continua em `editor`). */
  const leaveEditorView = () => {
    editorPanel?.destroy(); editorPanel = null;
    input.setEditor(null);
    hud.setEditorMode(false); hud.setTestMode(null);
    renderer.chunkCacheLimit = 60;
    returnToEditor = false;
    document.body.className = '';
  };
  const startEditor = (file: FixedMapData) => {
    let ed: MapEditor;
    try { ed = new MapEditor(file, editorView); } catch (e) { hud.toast(t('msg.loadFail', { err: (e as Error).message }), 'warn'); menu.show(); return; }
    // O cenário embutido acompanha o mapa no editor (MapEditor só copia os metadados do terreno; setMeta não deve sujar o documento aqui)
    if (editorOrTest()) leaveEditorView();
    editor = ed; returnToEditor = false; editorCam = null;
    showEditor(ed, null);
    hud.toast(t('editor.opened', { name: ed.meta.name ?? t('editor.untitled') }), 'gold');
  };
  const exitEditor = () => {
    const ed = editor; if (!ed) return;
    if (ed.dirty && !confirm(t('editor.exitConfirm'))) return;
    leaveEditorView();
    editor = null; session = null; hud.setSession(null); hud.setVisible(false); menu.show();
  };
  /** Testar: partida real a partir do arquivo (mesmo createGame do multiplayer); ao sair volta ao editor com a mesma instância. */
  const testFromEditor = (opts: TestOpts) => {
    const ed = editor; if (!ed || session !== ed.session) return;
    const file = ed.toFile();
    const starts = file.starts.length;
    if (starts < 2) { hud.toast(t('editor.testNeedStarts'), 'warn'); return; }
    // Testar com o cenário embutido: jogadores, modo e recursos vêm do cenário (gameConfigFor) sobre o mapa inline; intro como na campanha
    if (opts.scenario && file.scenario) {
      const sc = file.scenario;
      const scIssues = validateScenario(sc);
      if (scIssues.length) { hud.toast(`${t('editor.testScenarioErrors')} ${scIssues.slice(0, 3).map((i) => `${i.path || '$'}: ${i.message}`).join('; ')}`, 'warn'); return; }
      const base = gameConfigFor(sc);
      const issues = validateMap(file, { players: base.players.length, mode: base.mode, ai: base.players.map((p) => p.isAI) });
      const errors = issues.filter((i) => i.level === 'error');
      if (errors.length) { hud.toast(`${t('editor.testErrors')} ${errors.slice(0, 3).map(issueText).join('; ')}`, 'warn'); return; }
      editorPanel?.autosaveNow();
      editorCam = { x: renderer.cam.x, y: renderer.cam.y, zoom: renderer.cam.zoom };
      leaveEditorView();
      returnToEditor = true; replaySaved = true;
      try { startGame({ ...base, seed: (Math.floor(Math.random() * 1e9)) >>> 0, revealMap: opts.reveal || base.revealMap, map: file, mapHash: mapHash(file), scenarioData: sc }); }
      catch (e) { hud.toast(t('msg.loadFail', { err: (e as Error).message }), 'warn'); returnFromTest(); return; }
      hud.setTestMode(() => returnFromTest());
      if (session) { session.paused = true; hud.showIntro(() => { if (session) session.paused = false; }); }
      return;
    }
    let saved: { name?: string } = {}; try { saved = JSON.parse(localStorage.getItem('aoe_setup') ?? '{}'); } catch { /* ignore */ }
    const names = ['Leônidas', 'Péricles', 'Agamenon', 'Odisseu'];
    const as = Math.max(0, Math.min(starts - 1, opts.as | 0));
    const players: GameConfig['players'] = [{ name: saved.name ?? t('main.player'), god: opts.god, isAI: false, difficulty: 'normal', team: 0 }];
    const order = [as];
    for (let i = 0; i < starts; i++) {
      if (i === as) continue;
      const d = opts.slots[i]; if (!d || d === 'empty') continue;
      players.push({ name: `${names[order.length % names.length]} (IA)`, god: MAJOR_GOD_LIST[(as + order.length) % MAJOR_GOD_LIST.length], isAI: true, difficulty: d, team: order.length });
      order.push(i);
    }
    const issues = validateMap(file, { players: players.length, mode: opts.mode, ai: players.map((p) => p.isAI) });
    const errors = issues.filter((i) => i.level === 'error');
    if (errors.length) { hud.toast(`${t('editor.testErrors')} ${errors.slice(0, 3).map(issueText).join('; ')}`, 'warn'); return; }
    editorPanel?.autosaveNow();
    editorCam = { x: renderer.cam.x, y: renderer.cam.y, zoom: renderer.cam.zoom };
    leaveEditorView();
    returnToEditor = true; replaySaved = true;
    startGame({ seed: (Math.floor(Math.random() * 1e9)) >>> 0, mapSize: 'medium', players, mode: opts.mode, revealMap: opts.reveal, map: file, mapHash: mapHash(file), startOrder: order });
    hud.setTestMode(() => returnFromTest());
  };
  /** Volta ao editor após o teste (menu → sair ou fim de partida): documento, câmera e pilha de desfazer intactos. */
  const returnFromTest = () => {
    const ed = editor;
    if (!ed) { returnToEditor = false; hud.setTestMode(null); return; }
    leaveEditorView();
    showEditor(ed, editorCam);
  };

  const menu = new MainMenu(root, { onStart: (cfg) => { replaySaved = false; startGame(cfg); }, onLoad: loadGame, hasSave, onEditor: startEditor, onHelp: () => hud.showHelp(), onEncyclopedia: () => hud.showEncyclopedia(), onMission: startMission, onScenarioFile: startScenarioFile, onNetworkStart: startNetworkGame, onNetworkRejoin: rejoinNetworkGame, onHorde: startHorde, onReplay: watchReplay, hasReplay, onLocaleChanged: () => { settings.locale = (localStorage.getItem('aoe_locale') as 'pt' | 'en') ?? 'pt'; saveSettings(settings); }, getOptions: () => options, onHotkeys: () => hud.showHotkeys() });
  input.edgeScroll = settings.edgeScroll;
  // Tela, escala e qualidade salvas
  initDisplay((v) => { if (settings.fullscreen !== v) { settings.fullscreen = v; saveSettings(settings); } });
  applyUiScale(settings.uiScale);
  if (settings.renderScale !== 1) renderer.setRenderScale(settings.renderScale);
  if (desktop()?.setFullscreen && settings.fullscreen !== isFullscreen()) setFullscreen(settings.fullscreen);

  window.addEventListener('keydown', (e) => {
    if (!session) return;
    if (editorOrTest()) { if (e.key === 'F5' || e.key === 'F9') e.preventDefault(); return; }   // editor/teste: nada de salvar ou carregar
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
      const editing = editor !== null && session === editor.session;
      if (editing) editor!.flush();   // uma vez por quadro: retângulo sujo → renderer/minimapa
      if (session.state.gameOver && !replaySaved && !editorOrTest()) saveReplay();
      if (!session.spectator && !editorOrTest()) achievements.update(session.state, session.local, dt);
      input.update(dt);
      renderer.render(session.state, alpha, input.renderUI(), dt);
      hud.update(dt);
      if (editing) editorPanel?.update();
      if (editing) setPresence(t('presence.menu'));
      else if (session.state.tick % 200 === 0) setPresence(t('presence.playing', { age: AGES[session.player.age].name, min: Math.floor(session.state.time / 60) }));
    } else setPresence(t('presence.menu'));
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // Expõe para depuração/testes automatizados
  (window as unknown as { aoe: unknown }).aoe = { get session() { return session; }, renderer, startGame, loadGame, diagnostic, menu, startEditor, exitEditor, testFromEditor, startScenarioFile, get editor() { return editor; }, get editorPanel() { return editorPanel; }, mapData: () => (session ? mapToData(session.state.map) : null), debugSpawn: (owner: number, type: string, x: number, y: number) => { if (!session) return null; const t = nearestFreeTile(session.state.map, x, y, 12); return t ? spawnUnit(session.state, owner, type, t.x + 0.5, t.y + 0.5) : null; } };
}

boot().catch((e) => { console.error(e); document.body.innerHTML = `<pre style="color:#f88;padding:20px">Erro ao iniciar: ${(e as Error).stack}</pre>`; });
