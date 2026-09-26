// Menu principal: configuração da partida (nome, deus, mapa, oponentes, dificuldade, semente).
import { DIFFICULTIES, MAP_SIZES, GAME_MODES, MAP_TYPES, type Difficulty, type MapSize, type GameMode, type MapType } from '../core/constants';
import { MAJOR_GODS, MAJOR_GOD_LIST } from '../core/data';
import type { GameConfig } from '../core/types';
import { hashString } from '../core/rng';
import { CAMPAIGN, campaignMission } from '../core/scenario/campaign';
import { NetClient, type LobbyState, type RoomSummary } from '../net/client';
import { t, getLocale, setLocale, LOCALE_NAMES, type Locale } from '../i18n';
import { optionsHTML, bindOptions, type OptionsContext } from './options';
import { mapHash, validateMap, blankMap, mapToData, migrateMap, MAP_LIMITS, type FixedMapData, type MapIssue } from '../core/map/fixed';
import { generateMap } from '../core/map/mapgen';
import { allMaps, getMap, hasErrors, importMapFile, parseMapFile, mapName, putMap, startOrderFor, slugify, duplicateMap, removeMap, exportMapFile, uniqueMapId } from '../game/maps';
import { importText } from '../game/files';
import { validateScenario, type ScenarioFile } from '../core/scenario/schema';
import { gameConfigFor } from '../core/scenario/compile';
import { tx } from '../core/scenario/text';
import { AUTOSAVE_KEY } from '../editor/panel';
import { esc } from './html';
import { syncUiZoom } from './hud';

const fixedMapLabel = (d: { name?: string; nameEn?: string; id?: string; w: number; h: number; starts: number | unknown[]; hash?: number }) => t('main.fixedMapInfo', { name: esc(mapName(d)), w: d.w, h: d.h, n: Array.isArray(d.starts) ? d.starts.length : d.starts }) + (d.hash !== undefined ? ` <span style="color:#6b7690">#${(d.hash >>> 0).toString(16).slice(0, 6)}</span>` : '');
/** Texto de um problema de validação (código traduzido + posição). */
export const issueText = (i: MapIssue) => t(`map.issue.${i.code}`, i.params ?? {}) + (i.x !== undefined && i.y !== undefined ? ' ' + t('map.issues.at', { x: i.x, y: i.y }) : '');
const issuesSummary = (issues: MapIssue[]) => { const e = issues.filter((i) => i.level === 'error').length, w = issues.length - e; return e === 0 && w === 0 ? t('map.issues.ok') : [e ? t('map.issues.errors', { n: e }) : '', w ? t('map.issues.warnings', { n: w }) : ''].filter(Boolean).join(' · '); };

export interface MenuCallbacks { onStart: (config: GameConfig) => void; onLoad: () => void; hasSave: () => boolean; onHelp: () => void; onEncyclopedia: () => void; onMission: (id: string, difficulty: 'easy' | 'normal' | 'hard') => void; onScenarioFile: (map: FixedMapData) => void; onNetworkStart: (client: NetClient, config: GameConfig, slots: number[], delay: number) => void; onNetworkRejoin: (client: NetClient, config: GameConfig, slots: number[], delay: number, dropped?: number[]) => void; onHorde: (god: string, difficulty: Difficulty) => void; onReplay: () => void; hasReplay: () => boolean; onEditor: (file: FixedMapData) => void; onLocaleChanged?: () => void; getOptions?: () => OptionsContext; onHotkeys?: () => void }

export class MainMenu {
  root: HTMLElement; el: HTMLElement;
  private god = 'zeus';
  private tab: 'skirmish' | 'campaign' | 'multiplayer' | 'editor' = 'skirmish';
  net: NetClient | null = null;
  private netStatus = '';
  private showOptions = false;
  /** Mapa fixo carregado de arquivo para a próxima partida rápida (null = gerar). */
  fixedMap: FixedMapData | null = null;
  fixedMapId: string | null = null;
  fixedIssues: MapIssue[] = [];
  private browsing: NetClient | null = null;   // conexão só para listar salas
  private browseTimer: ReturnType<typeof setInterval> | null = null;
  private roomList: RoomSummary[] | null = null;
  private chatLog: { name: string; text: string }[] = [];
  constructor(root: HTMLElement, private cb: MenuCallbacks) {
    this.root = root;
    this.el = document.createElement('div'); this.el.id = 'menu';
    syncUiZoom(this.el);
    root.appendChild(this.el);
    this.restoreFixedMap();
    this.render();
  }
  show() { this.el.classList.remove('hidden'); this.render(); }
  /** Mensagem de erro na aba multiplayer (ex.: mapa fixo inválido recebido do anfitrião). */
  showNetError(msg: string) { this.netStatus = msg; this.tab = 'multiplayer'; this.show(); }
  /** Dificuldade escolhida na aba Campanha (guardada em aoe_campaign_diff). */
  campaignDifficulty(): 'easy' | 'normal' | 'hard' {
    try { const d = localStorage.getItem('aoe_campaign_diff'); if (d === 'easy' || d === 'hard') return d; } catch { /* ignore */ }
    return 'normal';
  }
  /** Define o mapa fixo (skirmish e lobby); o anfitrião avisa a sala pelo relay (só o resumo — o mapa inteiro vai em `start`). */
  setFixedMap(d: FixedMapData | null, id: string | null = d?.id ?? null) {
    this.fixedMap = d; this.fixedMapId = d ? id : null;
    this.fixedIssues = d ? validateMap(d) : [];
    try { const setup = JSON.parse(localStorage.getItem('aoe_setup') ?? '{}'); setup.fixedMapId = this.fixedMapId; localStorage.setItem('aoe_setup', JSON.stringify(setup)); } catch { /* ignore */ }
    if (this.net?.isHost && this.net.lobby) this.net.settings({ fixedMap: d ? { id: this.fixedMapId ?? undefined, name: mapName(d), w: d.w, h: d.h, starts: d.starts.length, hash: mapHash(d), scenario: d.scenario ? tx(d.scenario.title) : undefined } : null });
    this.render();
  }
  /** Missões do registro da campanha (G0) com cabeçalho por ato, selo "Prólogo", desbloqueio sequencial, ✅ e 🔥 do Difícil. */
  private campaignHTML(completed: string[], hardDone: string[]): string {
    const list = CAMPAIGN.map((e) => ({ e, m: campaignMission(e.id) })).filter((x) => !!x.m);
    let act = 0;
    return list.map(({ e, m }, i) => {
      const head = e.act !== act ? `<div class="act-head" style="margin:${i ? 10 : 0}px 0 0;color:#f2c14e;font-weight:bold">${t(`main.act${(act = e.act)}`)}</div>` : '';
      const locked = i > 0 && !completed.includes(list[i - 1].e.id); const done = completed.includes(e.id); const hard = hardDone.includes(e.id);
      const badge = e.prologue ? ` <span class="badge" style="font-size:11px;color:#9aa5b8;border:1px solid var(--border);border-radius:6px;padding:0 5px">${t('main.prologue')}</span>` : '';
      return `${head}<div class="mission ${locked ? 'locked' : ''}" data-id="${e.id}"><span class="ic">${m!.icon}</span><div><b>${esc(m!.title)}${badge} ${done ? '✅' : ''}${hard ? ` <span title="${t('main.doneHard')}">🔥</span>` : ''}</b><small>${esc(m!.subtitle)}${locked ? ` · ${t('main.locked')}` : ''}</small></div></div>`;
    }).join('');
  }
  // ---------------- Cenários personalizados (aba Campanha; docs/EDITOR.md §4.7) ----------------
  /** Mapas de Meus mapas com cenário embutido. */
  private customScenarios(): { id: string; map: FixedMapData; scenario: ScenarioFile }[] {
    const out: { id: string; map: FixedMapData; scenario: ScenarioFile }[] = [];
    for (const e of allMaps()) { if (e.builtin) continue; const d = getMap(e.id); if (d?.scenario) out.push({ id: e.id, map: d, scenario: d.scenario }); }
    return out;
  }
  private customScenariosHTML(): string {
    const list = this.customScenarios();
    const card = (c: { id: string; map: FixedMapData; scenario: ScenarioFile }) => `<div class="mapcard" data-scn="${esc(c.id)}"><span class="ic" style="font-size:24px">${esc(c.scenario.icon ?? '📜')}</span><div class="info"><b>${esc(tx(c.scenario.title))}</b><small>${esc(tx(c.scenario.subtitle) || t('main.customScenarioInfo', { map: mapName(c.map), w: c.map.w, h: c.map.h, n: c.scenario.config?.players?.length ?? 0 }))} · ${esc(c.id)}</small></div><button class="btn primary" data-act="play">${t('main.customScenarioPlay')}</button></div>`;
    return `<h3 style="margin:14px 0 4px;color:#f2c14e">${t('main.customScenarios')}</h3><p style="color:#9aa5b8;margin:0 0 6px;font-size:13px">${t('main.customScenariosDesc')}</p>
      <div class="scenariocards" id="m-scenarios">${list.length ? list.map(card).join('') : `<small style="color:#9aa5b8">${t('main.customScenariosNone')}</small>`}</div>
      <div style="margin-top:8px"><button class="btn" id="m-scn-import">${t('main.customScenarioImport')}</button></div>`;
  }
  /**
   * Importa um .map.json com cenário para Meus mapas (usado pelo botão e pelos playtests): mapa validado (erros bloqueiam),
   * cenário validado sem ids reservados. Devolve o id guardado ou lança com o motivo.
   */
  importScenarioMap(json: string): string {
    const res = parseMapFile(json);
    if (hasErrors(res.issues)) throw new Error(`${t('main.fixedMapErrors')}\n${res.issues.filter((i) => i.level === 'error').slice(0, 5).map(issueText).join('\n')}`);
    if (!res.data.scenario) throw new Error(t('main.customScenarioNo'));
    const issues = validateScenario(res.data.scenario);
    if (issues.length) throw new Error(`${t('main.customScenarioBad')}\n${issues.slice(0, 5).map((i) => `${i.path || '$'}: ${i.message}`).join('\n')}`);
    const id = putMap(res.data).id;
    this.render();
    return id;
  }
  private async importScenarioFile() {
    let json: string | null;
    try { json = await importText(); } catch { alert(t('main.fixedMapBad')); return; }
    if (!json) return;
    try { this.importScenarioMap(json); } catch (e) { alert((e as Error).message || t('main.fixedMapBad')); }
  }
  private bindCustomScenarios() {
    this.el.querySelector('#m-scn-import')?.addEventListener('click', () => void this.importScenarioFile());
    this.el.querySelectorAll('[data-scn] [data-act="play"]').forEach((b) => b.addEventListener('click', () => {
      const id = (b.closest('[data-scn]') as HTMLElement).dataset.scn!;
      const d = getMap(id); if (!d?.scenario) { this.render(); return; }
      this.cb.onScenarioFile(d);
    }));
  }
  /** Seletor de mapa: aleatório, mapas do jogo, Meus mapas e importar. */
  private mapSelectHTML(id: string, enabled: boolean): string {
    const groups = [['builtin', allMaps().filter((m) => m.builtin)], ['mine', allMaps().filter((m) => !m.builtin)]] as const;
    return `<select id="${id}" ${enabled ? '' : 'disabled'}><option value="random" ${this.fixedMap ? '' : 'selected'}>${t('main.fixedMapRandom')}</option>${groups.map(([g, list]) => list.length ? `<optgroup label="${t(g === 'builtin' ? 'main.fixedMapBuiltin' : 'main.fixedMapMine')}">${list.map((m) => `<option value="${esc(m.id)}" ${this.fixedMapId === m.id ? 'selected' : ''}>${esc(mapName(m))} (${m.w}×${m.h}, ${m.starts})</option>`).join('')}</optgroup>` : '').join('')}<option value="import">${t('main.fixedMapImport')}</option></select>`;
  }
  private issuesHTML(id: string): string {
    if (!this.fixedMap) return '';
    const err = hasErrors(this.fixedIssues);
    return `<div id="${id}" style="font-size:12px;color:${err ? '#ef4444' : this.fixedIssues.length ? '#f2c14e' : '#7ad27a'};margin:-4px 0 6px">${issuesSummary(this.fixedIssues)}${this.fixedIssues.slice(0, 3).map((i) => `<div style="color:${i.level === 'error' ? '#ef4444' : '#9aa5b8'}">· ${esc(issueText(i))}</div>`).join('')}</div>`;
  }
  private bindMapSelect(id: string) {
    (this.el.querySelector(`#${id}`) as HTMLSelectElement | null)?.addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      if (v === 'random') this.setFixedMap(null);
      else if (v === 'import') void this.loadFixedMap();
      else { const d = getMap(v); if (d) this.setFixedMap(d, v); else this.setFixedMap(null); }
    });
  }
  /** Restaura o mapa escolhido na última vez (aoe_setup.fixedMapId). */
  private restoreFixedMap() {
    try { const id = JSON.parse(localStorage.getItem('aoe_setup') ?? '{}').fixedMapId; if (typeof id === 'string') { const d = getMap(id); if (d) { this.fixedMap = d; this.fixedMapId = id; this.fixedIssues = validateMap(d); } } } catch { /* ignore */ }
  }
  private roomListHTML(): string {
    if (!this.browsing) return '';
    if (!this.roomList) return `<div style="font-size:12px;color:#9aa5b8;margin-top:6px">${t('mp.connecting')}</div>`;
    if (this.roomList.length === 0) return `<div style="font-size:12px;color:#9aa5b8;margin-top:6px">${t('mp.roomsNone')}</div>`;
    const modeName = (m: string) => (m === 'horde' ? t('mp.horde') : t(`mode.${m}`)).split(/[:(]/)[0].trim();
    return `<div style="font-size:12px;color:#9aa5b8;margin-top:6px">${t('mp.roomsTitle')}</div><table style="width:100%;font-size:13px;border-collapse:collapse">${this.roomList.map((r) => `<tr><td><b>${esc(r.code)}</b></td><td style="color:#9aa5b8">${t('mp.roomInfo', { host: esc(r.host), n: r.players, mode: modeName(r.mode), map: r.fixedMap ? esc(r.fixedMap) : t(`map.${r.mapSize}`) })}${r.started ? ` · <span style="color:#f2c14e">${t('mp.roomStarted')}</span>` : ''}${r.spectators ? ` · 👁 ${r.spectators}` : ''}</td><td align="right" style="white-space:nowrap">${r.started ? '' : `<button class="btn" data-room="${esc(r.code)}" style="padding:2px 10px;font-size:12px">${t('mp.enter')}</button> `}<button class="btn" data-spectate="${esc(r.code)}" style="padding:2px 10px;font-size:12px">${t('mp.spectate')}</button></td></tr>`).join('')}</table>`;
  }
  private bindRoomList(joinRoom: (room: string, spectate?: boolean) => Promise<void>) {
    this.el.querySelectorAll('[data-room]').forEach((b) => b.addEventListener('click', () => void joinRoom(String((b as HTMLElement).dataset.room))));
    this.el.querySelectorAll('[data-spectate]').forEach((b) => b.addEventListener('click', () => void joinRoom(String((b as HTMLElement).dataset.spectate), true)));
  }
  /** Abre uma conexão só para consultar as salas públicas (atualiza a cada 3 s até entrar numa sala ou fechar a lista). */
  /** Guarda servidor/sala/nome digitados para que um redesenho da aba não os perca. */
  private rememberJoinFields() {
    const q = (id: string) => this.el.querySelector(id) as HTMLInputElement | null;
    const url = q('#mp-url')?.value, room = q('#mp-room')?.value, name = q('#mp-name')?.value;
    if (url === undefined || room === undefined || name === undefined) return;
    try { localStorage.setItem('aoe_mp', JSON.stringify({ url: url.trim(), room: room.trim() || 'OLIMPO', name: name.trim() || t('main.player') })); } catch { /* ignore */ }
  }
  private async startBrowsing(url: string, joinRoom: (room: string, spectate?: boolean) => Promise<void>) {
    this.rememberJoinFields();
    this.stopBrowsing();
    const net = new NetClient(); this.browsing = net; this.roomList = null; this.netStatus = ''; this.render();
    net.on('rooms', (m) => { if (this.browsing !== net) return; const rooms = (m.rooms as RoomSummary[]) ?? []; if (this.roomList && JSON.stringify(rooms) === JSON.stringify(this.roomList)) return; this.roomList = rooms; const box = this.el.querySelector('#mp-rooms'); if (box) { box.innerHTML = this.roomListHTML(); this.bindRoomList(joinRoom); } });   // só redesenha quando a lista muda
    net.on('close', () => { if (this.browsing === net) { this.stopBrowsing(); this.netStatus = t('mp.closed'); this.render(); } });
    try { await net.connect(url); } catch (e) { this.browsing = null; this.netStatus = (e as Error).message; this.render(); return; }
    net.list();
    this.browseTimer = setInterval(() => net.list(), 3000);
  }
  private stopBrowsing() {
    if (this.browseTimer) { clearInterval(this.browseTimer); this.browseTimer = null; }
    if (this.browsing) { const b = this.browsing; this.browsing = null; b.close(); }
    this.roomList = null;
  }
  private async loadFixedMap() {
    let res: { data: FixedMapData; issues: MapIssue[] } | null;
    try { res = await importMapFile(); } catch { alert(t('main.fixedMapBad')); this.render(); return; }
    if (!res) { this.render(); return; }
    if (hasErrors(res.issues)) { alert(`${t('main.fixedMapErrors')}\n${res.issues.filter((i) => i.level === 'error').slice(0, 5).map(issueText).join('\n')}`); this.render(); return; }
    let id = res.data.id ?? null;
    try { id = putMap(res.data).id; } catch { alert(t('msg.mapQuota')); }   // guarda em Meus mapas (cota cheia: só usa em memória)
    this.setFixedMap(res.data, id);
  }
  private renderChatLog() { const log = this.el.querySelector('#mp-chat-log'); if (!log) { this.render(); return; } log.innerHTML = this.chatLog.map((m) => `<div><b>${esc(m.name)}:</b> ${esc(m.text)}</div>`).join(''); log.scrollTop = log.scrollHeight; }
  hide() { this.el.classList.add('hidden'); }
  /** Controle (B): fecha o painel de opções ou volta à aba Partida rápida; devolve false se não havia para onde voltar. */
  navBack(): boolean {
    if (this.showOptions) { this.showOptions = false; this.render(); return true; }
    if (this.tab !== 'skirmish') { this.tab = 'skirmish'; this.render(); return true; }
    return false;
  }

  private render() {
    if (this.tab !== 'multiplayer' && this.browsing) this.stopBrowsing();
    let saved: Partial<{ name: string; god: string; map: string; ais: number; diff: string; teams: string; mode: string; mapType: string }> = {};
    try { saved = JSON.parse(localStorage.getItem('aoe_setup') ?? '{}'); } catch { /* ignore */ }
    this.god = saved.god ?? this.god;
    let completed: string[] = [];
    let hardDone: string[] = [];
    try { const prog = JSON.parse(localStorage.getItem('aoe_campaign') ?? '{"completed":[]}'); completed = prog.completed ?? []; hardDone = prog.hard ?? []; } catch { /* ignore */ }
    const cdiff = this.campaignDifficulty();
    const campaign = `<h3 style="margin:0 0 4px;color:#f2c14e">${t('main.campaignTitle')}</h3><p style="color:#9aa5b8;margin:0 0 8px;font-size:13px">${t('main.campaignDesc')}</p>
      <div style="display:flex;gap:8px;align-items:center;margin:0 0 8px"><label style="margin:0">${t('main.campaignDiff')}</label><select id="m-cdiff">${(['easy', 'normal', 'hard'] as const).map((d) => `<option value="${d}" ${cdiff === d ? 'selected' : ''}>${t(`diff.${d}`)}</option>`).join('')}</select><small style="color:#9aa5b8">${t('main.campaignDiffTip')}</small></div>
      <div class="missions">${this.campaignHTML(completed, hardDone)}</div>${this.tab === 'campaign' ? this.customScenariosHTML() : ''}`;
    const opts = this.cb.getOptions?.();
    this.el.innerHTML = `<div class="box">
      <h1>AGE OF EARTH</h1>
      <div class="sub">${t('main.sub')}</div>
      <div class="tabs"><button class="btn ${this.tab === 'skirmish' ? 'active' : ''}" data-tab="skirmish">${t('main.skirmish')}</button><button class="btn ${this.tab === 'campaign' ? 'active' : ''}" data-tab="campaign">${t('main.campaign')}</button><button class="btn ${this.tab === 'multiplayer' ? 'active' : ''}" data-tab="multiplayer">${t('main.multiplayer')}</button><button class="btn ${this.tab === 'editor' ? 'active' : ''}" data-tab="editor">${t('main.editor')}</button><span style="flex:1"></span><select id="m-locale" class="btn" title="${t('main.language')}">${(Object.keys(LOCALE_NAMES) as Locale[]).map((l) => `<option value="${l}" ${getLocale() === l ? 'selected' : ''}>${LOCALE_NAMES[l]}</option>`).join('')}</select></div>
      <div class="${this.tab === 'campaign' ? '' : 'hidden'}">${campaign}</div>
      <div class="${this.tab === 'multiplayer' ? '' : 'hidden'}" id="mp">${this.renderMultiplayer()}</div>
      <div class="${this.tab === 'editor' ? '' : 'hidden'}" id="ed">${this.tab === 'editor' ? this.renderEditor() : ''}</div>
      <div class="grid ${this.tab === 'skirmish' ? '' : 'hidden'}">
        <div>
          <label>${t('main.name')}</label><input id="m-name" value="${saved.name ?? t('main.player')}" maxlength="18">
          <label>${t('main.god')}</label>
          <div class="gods">${MAJOR_GOD_LIST.map((g) => { const d = MAJOR_GODS[g]; return `<div class="god ${g === this.god ? 'sel' : ''}" data-god="${g}"><div class="ic">${d.icon}</div><b>${d.name}</b><small>${d.title}</small><small>${d.perks.slice(0, 3).join(' · ')}</small></div>`; }).join('')}</div>
          <label>${t('main.seed')}</label><input id="m-seed" placeholder="${t('main.random')}">
        </div>
        <div>
          <label>${t('main.fixedMapSel')}</label><div style="display:flex;gap:6px;align-items:center">${this.mapSelectHTML('m-fixed-sel', true)}<button class="btn" id="m-fixed-load" title="${t('main.fixedMapImport')}" style="padding:4px 8px;font-size:12px">📂</button>${this.fixedMap ? `<button class="btn" id="m-fixed-clear" style="padding:4px 8px;font-size:12px">${t('main.fixedMapClear')}</button>` : ''}</div>
          <div id="m-fixed" style="font-size:12px;color:${this.fixedMap ? '#f2c14e' : '#9aa5b8'};margin:-4px 0 4px">${this.fixedMap ? fixedMapLabel({ ...this.fixedMap, hash: mapHash(this.fixedMap) }) : t('main.fixedMapNone')}</div>${this.issuesHTML('m-fixed-issues')}
          <label>${t('main.mapSize')}</label><select id="m-map" ${this.fixedMap ? 'disabled' : ''}>${Object.entries(MAP_SIZES).map(([k, v]) => `<option value="${k}" ${(saved.map ?? 'medium') === k ? 'selected' : ''}>${t(`map.${k}`)} (${v.w}×${v.h})</option>`).join('')}</select>
          <label>${t('main.opponents')}</label><select id="m-ais">${[1, 2, 3].filter((n) => !this.fixedMap || n <= this.fixedMap.starts.length - 1).map((n, _i, arr) => `<option value="${n}" ${Math.min(saved.ais ?? 1, arr[arr.length - 1]) === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <label>${t('main.difficulty')}</label><select id="m-diff">${Object.keys(DIFFICULTIES).map((k) => `<option value="${k}" ${(saved.diff ?? 'normal') === k ? 'selected' : ''}>${t(`diff.${k}`)}</option>`).join('')}</select>
          <label>${t('main.teams')}</label><select id="m-teams"><option value="ffa" ${(saved.teams ?? 'ffa') === 'ffa' ? 'selected' : ''}>${t('main.teams.ffa')}</option><option value="coop" ${saved.teams === 'coop' ? 'selected' : ''}>${t('main.teams.coop')}</option><option value="alliance" ${saved.teams === 'alliance' ? 'selected' : ''}>${t('main.teams.alliance')}</option></select>
          <label>${t('main.mode')}</label><select id="m-mode">${GAME_MODES.map((m) => `<option value="${m}" ${(saved.mode ?? 'conquest') === m ? 'selected' : ''}>${t(`mode.${m}`)}</option>`).join('')}</select>
          <label>${t('main.mapType')}</label><select id="m-maptype" ${this.fixedMap ? 'disabled' : ''}>${MAP_TYPES.map((m) => `<option value="${m}" ${(saved.mapType ?? 'continental') === m ? 'selected' : ''}>${t(`maptype.${m}`)}</option>`).join('')}</select>
          <label>${t('main.aiGods')}</label><select id="m-aigod"><option value="random">${t('main.randomGods')}</option>${MAJOR_GOD_LIST.map((g) => `<option value="${g}">${MAJOR_GODS[g].name}</option>`).join('')}</select>
          <label><input type="checkbox" id="m-reveal"> ${t('main.reveal')}</label>
        </div>
      </div>
      <div class="actions">
        <button class="btn primary ${this.tab === 'skirmish' ? '' : 'hidden'}" id="m-start">${t('main.play')}</button>
        <button class="btn ${this.tab === 'skirmish' ? '' : 'hidden'}" id="m-horde" title="${t('main.hordeTip')}">${t('main.horde')}</button>
        <button class="btn ${this.tab === 'skirmish' ? '' : 'hidden'}" id="m-replay" ${this.cb.hasReplay() ? '' : 'disabled'}>${t('main.replay')}</button>
        <button class="btn" id="m-load" ${this.cb.hasSave() ? '' : 'disabled'}>${t('main.load')}</button>
        <button class="btn" id="m-help">${t('main.help')}</button>
        <button class="btn" id="m-enc">${t('main.enc')}</button>
        <button class="btn" id="m-options">${this.showOptions ? t('menu.optionsHide') : t('menu.options')}</button>
      </div>
      <div id="m-options-panel" class="${this.showOptions ? '' : 'hidden'}" style="margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--panel)">${opts ? optionsHTML(opts) : ''}</div>
      <div class="credits">${t('main.credits')}</div>
    </div>`;
    (this.el.querySelector('#m-locale') as HTMLSelectElement | null)?.addEventListener('change', (e) => { setLocale((e.target as HTMLSelectElement).value as Locale); this.cb.onLocaleChanged?.(); this.render(); });
    this.el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.tab = (b as HTMLElement).dataset.tab as 'skirmish' | 'campaign' | 'multiplayer' | 'editor'; this.render(); }));
    this.bindMultiplayer();
    if (this.tab === 'editor') this.bindEditor();
    if (this.tab === 'campaign') this.bindCustomScenarios();
    (this.el.querySelector('#m-cdiff') as HTMLSelectElement | null)?.addEventListener('change', (e) => { try { localStorage.setItem('aoe_campaign_diff', (e.target as HTMLSelectElement).value); } catch { /* ignore */ } });
    this.el.querySelectorAll('.mission').forEach((m) => m.addEventListener('click', () => { if ((m as HTMLElement).classList.contains('locked')) return; this.cb.onMission((m as HTMLElement).dataset.id!, this.campaignDifficulty()); }));
    this.el.querySelectorAll('.god').forEach((g) => g.addEventListener('click', () => { this.god = (g as HTMLElement).dataset.god!; this.el.querySelectorAll('.god').forEach((x) => x.classList.toggle('sel', (x as HTMLElement).dataset.god === this.god)); }));
    const q = (id: string) => this.el.querySelector(id) as HTMLInputElement;
    q('#m-start').addEventListener('click', () => {
      const name = q('#m-name').value.trim() || t('main.player');
      const seedStr = q('#m-seed').value.trim();
      const seed = seedStr ? (Number.isFinite(Number(seedStr)) ? Number(seedStr) >>> 0 : hashString(seedStr)) : (Math.floor(Math.random() * 1e9) >>> 0);
      const ais = Number(q('#m-ais').value); const diff = q('#m-diff').value as Difficulty; const map = q('#m-map').value as MapSize;
      const aiGod = q('#m-aigod').value;
      const names = ['Leônidas', 'Péricles', 'Agamenon', 'Odisseu', 'Temístocles', 'Alexandre'];
      const gods = MAJOR_GOD_LIST;
      const teams = q('#m-teams').value;
      const players: GameConfig['players'] = [{ name, god: this.god, isAI: false, difficulty: diff, team: 0 }];
      for (let i = 0; i < ais; i++) {
        const team = teams === 'ffa' ? i + 1 : teams === 'coop' ? (i === 0 ? 0 : i + 1) : 1;
        players.push({ name: `${names[(seed + i) % names.length]} (IA)`, god: aiGod === 'random' ? gods[(seed + i * 7) % gods.length] : aiGod, isAI: true, difficulty: diff, team });
      }
      const mode = q('#m-mode').value as GameMode, mapType = q('#m-maptype').value as MapType;
      try { localStorage.setItem('aoe_setup', JSON.stringify({ name, god: this.god, map, ais, diff, teams, mode, mapType })); } catch { /* ignore */ }
      const fixed = this.fixedMap ?? undefined;
      if (fixed) {
        const issues = validateMap(fixed, { players: players.length, mode, ai: players.map((p) => p.isAI) });
        if (hasErrors(issues)) { this.fixedIssues = issues; alert(`${t('main.fixedMapErrors')}\n${issues.filter((i) => i.level === 'error').slice(0, 5).map(issueText).join('\n')}`); this.render(); return; }
      }
      this.cb.onStart({ seed, mapSize: map, players, revealMap: q('#m-reveal').checked, mode, mapType, map: fixed, mapHash: fixed ? mapHash(fixed) : undefined, startOrder: fixed && teams !== 'ffa' ? startOrderFor(fixed, players.map((p) => p.team ?? 0)) : undefined });
    });
    q('#m-load').addEventListener('click', () => this.cb.onLoad());
    q('#m-fixed-load').addEventListener('click', () => void this.loadFixedMap());
    this.el.querySelector('#m-fixed-clear')?.addEventListener('click', () => this.setFixedMap(null));
    this.bindMapSelect('m-fixed-sel');
    q('#m-horde').addEventListener('click', () => this.cb.onHorde(this.god, q('#m-diff').value as Difficulty));
    q('#m-replay').addEventListener('click', () => this.cb.onReplay());
    q('#m-help').addEventListener('click', () => this.cb.onHelp());
    q('#m-enc').addEventListener('click', () => this.cb.onEncyclopedia());
    q('#m-options').addEventListener('click', () => { this.showOptions = !this.showOptions; this.render(); });
    if (opts) bindOptions(this.el, opts, () => this.render());
  }


  // ---------------- Editor de mapas (aba) ----------------
  /** Rascunho do editor (aoe_editor_autosave), se existir e for um mapa válido. */
  private draft(): FixedMapData | null {
    try { const raw = localStorage.getItem(AUTOSAVE_KEY); if (!raw) return null; const d = migrateMap(JSON.parse(raw)); return d.w > 0 && d.h > 0 ? d : null; } catch { return null; }
  }
  private renderEditor(): string {
    const draft = this.draft();
    const card = (m: { id: string; name: string; nameEn?: string; w: number; h: number; starts: number; builtin?: boolean }) => `<div class="mapcard" data-id="${esc(m.id)}"><div class="info"><b>${esc(mapName(m))}</b><small>${t('editor.cardInfo', { w: m.w, h: m.h, n: m.starts })} · ${esc(m.id)}</small></div>${m.builtin ? `<button class="btn" data-act="copy">${t('editor.editCopy')}</button>` : `<button class="btn primary" data-act="edit">${t('editor.edit')}</button><button class="btn" data-act="dup" title="${t('editor.duplicate')}">⧉</button><button class="btn" data-act="export" title="${t('editor.export')}">📤</button><button class="btn danger" data-act="del" title="${t('editor.delete')}">🗑</button>`}</div>`;
    const mine = allMaps().filter((m) => !m.builtin), builtin = allMaps().filter((m) => m.builtin);
    return `<div class="grid">
      <div>
        <h3 style="margin:0;color:#f2c14e">${t('editor.new')}</h3>
        <label>${t('editor.newName')}</label><input id="ed-name" value="${esc(t('editor.defaultName'))}" maxlength="60">
        <label>${t('editor.size')}</label><select id="ed-size">${Object.entries(MAP_SIZES).map(([k, v]) => `<option value="${k}" ${k === 'small' ? 'selected' : ''}>${t(`map.${k}`)} (${v.w}×${v.h})</option>`).join('')}<option value="custom">${t('editor.sizeCustom')} (${MAP_LIMITS.minSide}–${MAP_LIMITS.maxSide})</option></select>
        <div class="ed-inline hidden" id="ed-custom"><div><label>${t('editor.width')}</label><input type="number" id="ed-w" min="${MAP_LIMITS.minSide}" max="${MAP_LIMITS.maxSide}" value="96"></div><div><label>${t('editor.height')}</label><input type="number" id="ed-h" min="${MAP_LIMITS.minSide}" max="${MAP_LIMITS.maxSide}" value="96"></div></div>
        <label>${t('editor.starts')}</label><select id="ed-starts"><option value="2">2</option><option value="3">3</option><option value="4">4</option></select>
        <label>${t('editor.base')}</label><select id="ed-base"><option value="blank">${t('editor.baseBlank')}</option><option value="gen" selected>${t('editor.baseGen')}</option></select>
        <div id="ed-gen"><div class="ed-inline"><div><label>${t('editor.seed')}</label><input id="ed-seed" placeholder="${t('main.random')}"></div><div><label>${t('main.mapType')}</label><select id="ed-maptype">${MAP_TYPES.map((m) => `<option value="${m}">${t(`maptype.${m}`)}</option>`).join('')}</select></div></div></div>
        <div class="actions" style="margin-top:12px;flex-wrap:wrap"><button class="btn primary" id="ed-create">${t('editor.create')}</button><button class="btn" id="ed-import">${t('editor.import')}</button></div>
        ${draft ? `<div style="margin-top:10px"><button class="btn gold" id="ed-resume">${t('editor.resume')}</button> <small style="color:#9aa5b8">${t('editor.resumeInfo', { name: esc(mapName(draft)), w: draft.w, h: draft.h, n: draft.starts.length })}</small></div>` : ''}
      </div>
      <div>
        <h3 style="margin:0;color:#f2c14e">${t('editor.myMaps')}</h3>
        <div class="mapcards" id="ed-mine">${mine.length ? mine.map(card).join('') : `<small style="color:#9aa5b8">${t('editor.noMaps')}</small>`}</div>
        <h3 style="margin:12px 0 0;color:#f2c14e">${t('editor.gameMaps')}</h3>
        <div class="mapcards" id="ed-builtin">${builtin.map(card).join('')}</div>
      </div>
    </div>`;
  }
  private bindEditor() {
    const q = (id: string) => this.el.querySelector(id) as HTMLInputElement;
    const syncForm = () => { q('#ed-custom').classList.toggle('hidden', q('#ed-size').value !== 'custom'); q('#ed-gen').classList.toggle('hidden', q('#ed-base').value !== 'gen'); };
    q('#ed-size').addEventListener('change', syncForm); q('#ed-base').addEventListener('change', syncForm); syncForm();
    q('#ed-create').addEventListener('click', () => {
      const name = q('#ed-name').value.trim() || t('editor.untitled');
      const sizeKey = q('#ed-size').value;
      const w = sizeKey === 'custom' ? Math.round(Number(q('#ed-w').value)) : MAP_SIZES[sizeKey as MapSize].w;
      const h = sizeKey === 'custom' ? Math.round(Number(q('#ed-h').value)) : MAP_SIZES[sizeKey as MapSize].h;
      const ok = (v: number) => Number.isFinite(v) && v >= MAP_LIMITS.minSide && v <= MAP_LIMITS.maxSide;
      if (!ok(w) || !ok(h) || w * h > MAP_LIMITS.maxTiles) { alert(t('editor.sizeBad', { min: MAP_LIMITS.minSide, max: MAP_LIMITS.maxSide, tiles: MAP_LIMITS.maxTiles })); return; }
      const n = Math.max(2, Math.min(4, Number(q('#ed-starts').value) || 2));
      const seedStr = q('#ed-seed').value.trim();
      const seed = seedStr ? (Number.isFinite(Number(seedStr)) ? Number(seedStr) >>> 0 : hashString(seedStr)) : (Math.floor(Math.random() * 1e9) >>> 0);
      const base = q('#ed-base').value === 'blank' ? blankMap(w, h, n, seed) : mapToData(generateMap(w, h, seed, n, q('#ed-maptype').value as MapType), name);
      this.cb.onEditor({ ...base, id: uniqueMapId(slugify(name)), name });   // id livre: não sobrescreve um mapa salvo com o mesmo nome
    });
    q('#ed-import').addEventListener('click', () => void this.importForEditor());
    this.el.querySelector('#ed-resume')?.addEventListener('click', () => { const d = this.draft(); if (d) this.cb.onEditor(d); });
    this.el.querySelectorAll('.mapcard [data-act]').forEach((b) => b.addEventListener('click', () => {
      const id = (b.closest('.mapcard') as HTMLElement).dataset.id!; const act = (b as HTMLElement).dataset.act;
      const d = getMap(id); if (!d) { this.render(); return; }
      if (act === 'edit') this.cb.onEditor(d);
      else if (act === 'copy') this.cb.onEditor({ ...d, id: uniqueMapId(`${id}-copia`), name: `${d.name ?? id} ${t('editor.copySuffix')}`, nameEn: d.nameEn ? `${d.nameEn} (copy)` : undefined });
      else if (act === 'dup') { try { duplicateMap(id); } catch { alert(t('msg.mapQuota')); } this.render(); }
      else if (act === 'export') void exportMapFile(d);
      else if (act === 'del') { if (confirm(t('editor.deleteConfirm', { name: mapName(d) }))) { removeMap(id); if (this.fixedMapId === id) this.setFixedMap(null); this.render(); } }
    }));
  }
  /** Importar .map.json para o editor: erros mostram o motivo; avisos abrem mesmo assim. */
  private async importForEditor() {
    let res: { data: FixedMapData; issues: MapIssue[] } | null;
    try { res = await importMapFile(); } catch { alert(t('main.fixedMapBad')); return; }
    if (!res) return;
    if (hasErrors(res.issues)) { alert(`${t('editor.importErrors')}\n${res.issues.filter((i) => i.level === 'error').slice(0, 8).map(issueText).join('\n')}`); return; }
    if (res.issues.length) alert(t('editor.importWarn', { n: res.issues.length }));
    this.cb.onEditor(res.data);
  }

  // ---------------- Multiplayer (lobby via relay WebSocket) ----------------
  private renderMultiplayer(): string {
    const lobby = this.net?.lobby;
    let saved: Partial<{ url: string; room: string; name: string }> = {};
    try { saved = JSON.parse(localStorage.getItem('aoe_mp') ?? '{}'); } catch { /* ignore */ }
    const defaultUrl = saved.url ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname || 'localhost'}:8787`;
    if (!this.net || !lobby) {
      return `<p style="color:#9aa5b8;font-size:13px;margin:0 0 8px">${t('mp.intro')}</p>
        <div class="grid"><div><label>${t('mp.server')}</label><input id="mp-url" value="${defaultUrl}"><label>${t('mp.room')}</label><input id="mp-room" value="${saved.room ?? 'OLIMPO'}" maxlength="12"></div>
        <div><label>${t('main.name')}</label><input id="mp-name" value="${saved.name ?? t('main.player')}" maxlength="18"><label>${t('main.god')}</label><select id="mp-god">${MAJOR_GOD_LIST.map((g) => `<option value="${g}">${MAJOR_GODS[g].icon} ${MAJOR_GODS[g].name}</option>`).join('')}</select></div></div>
        <div class="actions"><button class="btn primary" id="mp-join">${t('mp.join')}</button><button class="btn" id="mp-spectate" title="${t('mp.spectateTip')}">${t('mp.spectate')}</button><button class="btn" id="mp-browse">${this.browsing ? t('mp.browseClose') : t('mp.browse')}</button><span style="color:#ef4444;font-size:13px">${this.netStatus}</span></div>
        <div id="mp-rooms">${this.roomListHTML()}</div>`;
    }
    const me = this.net.slot; const host = lobby.host === me;
    const rows = lobby.players.map((p) => `<tr><td>${p.slot === lobby.host ? '👑 ' : ''}${esc(p.name)}${p.slot === me ? ` ${t('mp.you')}` : ''}</td><td>${MAJOR_GODS[p.god]?.icon ?? ''} ${MAJOR_GODS[p.god]?.name ?? p.god}</td><td>${host ? `<select data-team="${p.slot}">${[0, 1, 2, 3].map((k) => `<option value="${k}" ${p.team === k ? 'selected' : ''}>${t('mp.teamN', { n: k + 1 })}</option>`).join('')}</select>` : t('mp.teamN', { n: p.team + 1 })}</td><td class="ping">${(p.ping ?? -1) >= 0 ? `${p.ping} ms` : '…'}</td><td>${host && p.slot !== me ? `<button class="btn" data-kick="${p.slot}" style="padding:2px 8px;font-size:12px">${t('mp.kick')}</button>` : ''}</td></tr>`).join('');
    const chat = `<div id="mp-chat" style="margin-top:10px"><div style="font-size:12px;color:#9aa5b8">${t('mp.chat')}</div><div id="mp-chat-log" style="height:96px;overflow:auto;background:#0f1628;border:1px solid var(--border);border-radius:6px;padding:6px;font-size:13px">${this.chatLog.map((m) => `<div><b>${esc(m.name)}:</b> ${esc(m.text)}</div>`).join('')}</div><div style="display:flex;gap:6px;margin-top:6px"><input id="mp-chat-input" placeholder="${t('mp.chatPlaceholder')}" maxlength="200" style="flex:1"><button class="btn" id="mp-chat-send">${t('mp.send')}</button></div></div>`;
    const st = lobby.settings;
    return `<h3 style="margin:0;color:#f2c14e">${t('mp.roomTitle', { room: this.net.room })} <small style="color:#9aa5b8;font-weight:normal">${t('mp.connected', { n: lobby.players.length })}</small></h3>
      <table style="width:100%;font-size:13px;margin:8px 0;border-collapse:collapse"><tr style="color:#9aa5b8"><th align="left">${t('mp.player')}</th><th align="left">${t('mp.god')}</th><th align="left">${t('mp.team')}</th><th align="left">${t('mp.ping')}</th><th></th></tr>${rows}</table>
      ${lobby.spectators?.length ? `<div id="mp-spectators" style="font-size:12px;color:#9aa5b8;margin:-4px 0 8px">${t('mp.spectators', { names: lobby.spectators.map((s) => `${esc(s.name)}${s.slot === me ? ` ${t('mp.you')}` : ''}${host ? ` <button class="btn" data-kick="${s.slot}" style="padding:0 6px;font-size:11px">${t('mp.kick')}</button>` : ''}`).join(', ') })}</div>` : ''}
      <div class="grid"><div>
        <label>${t('main.fixedMapSel')}</label><div style="display:flex;gap:6px;align-items:center">${host ? `${this.mapSelectHTML('mp-fixed-sel', true)}<button class="btn" id="mp-fixed-load" title="${t('main.fixedMapImport')}" style="padding:4px 8px;font-size:12px">📂</button>${st.fixedMap ? `<button class="btn" id="mp-fixed-clear" style="padding:4px 8px;font-size:12px">${t('main.fixedMapClear')}</button>` : ''}` : ''}</div>
        <div id="mp-fixed" style="font-size:12px;color:${st.fixedMap ? '#f2c14e' : '#9aa5b8'};margin:-4px 0 4px">${st.fixedMap ? fixedMapLabel(st.fixedMap) : t('main.fixedMapNone')}</div>${host ? this.issuesHTML('mp-fixed-issues') : ''}
        ${st.fixedMap?.scenario ? `<div id="mp-scenario" style="font-size:12px;color:#f2c14e;margin:-2px 0 4px">${t('mp.scenario', { title: esc(st.fixedMap.scenario) })}<div style="color:#9aa5b8">${t('mp.scenarioAis')}</div></div>` : ''}
        <label>${t('main.mapSize')}</label><select id="mp-map" ${host && !st.fixedMap ? '' : 'disabled'}>${Object.keys(MAP_SIZES).map((k) => `<option value="${k}" ${st.mapSize === k ? 'selected' : ''}>${t(`map.${k}`)}</option>`).join('')}</select>
        <label>${t('main.mode')}</label><select id="mp-mode" ${host ? '' : 'disabled'}>${GAME_MODES.map((m) => `<option value="${m}" ${(st.mode ?? 'conquest') === m ? 'selected' : ''}>${t(`mode.${m}`)}</option>`).join('')}</select>
        <label>${t('main.mapType')}</label><select id="mp-maptype" ${host && !st.fixedMap ? '' : 'disabled'}>${MAP_TYPES.map((m) => `<option value="${m}" ${(st.mapType ?? 'continental') === m ? 'selected' : ''}>${t(`maptype.${m}`)}</option>`).join('')}</select>
        <label>${t('mp.ais')}</label><select id="mp-ais" ${host ? '' : 'disabled'}>${[0, 1, 2, 3].filter((n) => !st.fixedMap || n <= Math.max(0, st.fixedMap.starts - lobby.players.length)).map((n) => `<option value="${n}" ${st.ais === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div><label>${t('mp.aiDiff')}</label><select id="mp-diff" ${host ? '' : 'disabled'}>${Object.keys(DIFFICULTIES).map((k) => `<option value="${k}" ${st.difficulty === k ? 'selected' : ''}>${t(`diff.${k}`)}</option>`).join('')}</select>
        <label><input type="checkbox" id="mp-horde" ${host ? '' : 'disabled'} ${st.horde ? 'checked' : ''}> ${t('mp.horde')}</label>${st.horde && st.fixedMap ? `<div style="font-size:12px;color:#f2c14e">${t('mp.fixedMapHorde')}</div>` : ''}
        <label><input type="checkbox" id="mp-public" ${host ? '' : 'disabled'} ${st.public !== false ? 'checked' : ''}> ${t('mp.public')}</label>
        ${this.net.isSpectator ? '' : `<label>${t('mp.myGod')}</label><select id="mp-mygod">${MAJOR_GOD_LIST.map((g) => `<option value="${g}" ${lobby.players.find((p) => p.slot === me)?.god === g ? 'selected' : ''}>${MAJOR_GODS[g].icon} ${MAJOR_GODS[g].name}</option>`).join('')}</select>`}</div></div>
      <div class="actions">${host ? `<button class="btn primary" id="mp-start">${t('mp.start')}</button>` : `<span style="color:#9aa5b8">${t('mp.waitingHost')}</span>`}<button class="btn" id="mp-leave">${t('mp.leave')}</button><span style="color:#ef4444;font-size:13px">${this.netStatus}</span></div>${chat}`;
  }

  private bindMultiplayer() {
    const q = (id: string) => this.el.querySelector(id) as HTMLInputElement | null;
    const joinRoom = async (room: string, spectate = false) => {
      const url = q('#mp-url')!.value.trim(), name = q('#mp-name')!.value.trim() || t('main.player'), god = q('#mp-god')!.value;
      try { localStorage.setItem('aoe_mp', JSON.stringify({ url, room, name })); } catch { /* ignore */ }
      this.stopBrowsing();
      const net = new NetClient();
      net.on('lobby', () => { if (this.tab === 'multiplayer') this.render(); });
      net.on('error', (m) => { this.netStatus = String(m.msg); this.render(); });
      net.on('close', () => { if (this.net === net) { this.net = null; this.netStatus = t('mp.closed'); if (!this.el.classList.contains('hidden')) this.render(); } });
      net.on('start', (m) => { this.cb.onNetworkStart(net, m.config as GameConfig, m.slots as number[], Number(m.delay) || 4); });
      net.on('joined', (m) => { if (m.rejoin) this.cb.onNetworkRejoin(net, m.config as GameConfig, m.slots as number[], Number(m.delay) || 4, (m.dropped as number[]) ?? []); });
      net.on('chat', (m) => { this.chatLog.push({ name: String(m.name ?? '?'), text: String(m.text ?? '') }); if (this.chatLog.length > 60) this.chatLog.shift(); if (this.tab === 'multiplayer' && !this.el.classList.contains('hidden')) this.renderChatLog(); });
      this.chatLog = [];
      this.netStatus = t('mp.connecting'); this.render();
      try { await net.connect(url); } catch (e) { this.netStatus = (e as Error).message; this.render(); return; }
      this.net = net; this.netStatus = '';
      net.join(room, name, god, spectate);
    };
    q('#mp-join')?.addEventListener('click', () => void joinRoom(q('#mp-room')!.value.trim() || 'OLIMPO'));
    q('#mp-spectate')?.addEventListener('click', () => void joinRoom(q('#mp-room')!.value.trim() || 'OLIMPO', true));
    q('#mp-browse')?.addEventListener('click', () => { if (this.browsing) { this.rememberJoinFields(); this.stopBrowsing(); this.render(); return; } void this.startBrowsing(q('#mp-url')!.value.trim(), joinRoom); });
    this.bindRoomList(joinRoom);
    q('#mp-leave')?.addEventListener('click', () => { this.net?.close(); this.net = null; this.netStatus = ''; this.render(); });
    const sendChat = () => { const inp = q('#mp-chat-input'); if (!inp || !this.net) return; this.net.chat(inp.value); inp.value = ''; };
    q('#mp-chat-send')?.addEventListener('click', sendChat);
    q('#mp-chat-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } e.stopPropagation(); });
    this.el.querySelectorAll('[data-kick]').forEach((b) => b.addEventListener('click', () => this.net?.kick(Number((b as HTMLElement).dataset.kick))));
    const settingsChanged = () => { if (!this.net?.isHost) return; this.net.settings({ mapSize: q('#mp-map')!.value, ais: Number(q('#mp-ais')!.value), difficulty: q('#mp-diff')!.value, horde: !!q('#mp-horde')?.checked, public: !!q('#mp-public')?.checked, mode: q('#mp-mode')!.value, mapType: q('#mp-maptype')!.value }); };
    q('#mp-fixed-load')?.addEventListener('click', () => void this.loadFixedMap());
    q('#mp-fixed-clear')?.addEventListener('click', () => this.setFixedMap(null));
    this.bindMapSelect('mp-fixed-sel');
    q('#mp-mode')?.addEventListener('change', settingsChanged); q('#mp-maptype')?.addEventListener('change', settingsChanged);
    q('#mp-map')?.addEventListener('change', settingsChanged); q('#mp-ais')?.addEventListener('change', settingsChanged); q('#mp-diff')?.addEventListener('change', settingsChanged); q('#mp-horde')?.addEventListener('change', settingsChanged); q('#mp-public')?.addEventListener('change', settingsChanged);
    q('#mp-mygod')?.addEventListener('change', () => this.net?.player({ god: q('#mp-mygod')!.value }));
    this.el.querySelectorAll('[data-team]').forEach((sel) => sel.addEventListener('change', () => this.net?.player({ slot: Number((sel as HTMLElement).dataset.team), team: Number((sel as HTMLSelectElement).value) })));
    q('#mp-start')?.addEventListener('click', () => {
      const net = this.net; const lobby = net?.lobby; if (!net || !lobby) return;
      const st = lobby.settings;
      const delay = NetClient.delayFor(lobby.players.map((p) => p.ping ?? -1));   // atraso do lockstep pela pior latência da sala
      const players: GameConfig['players'] = lobby.players.map((p) => ({ name: p.name, god: p.god, isAI: false, difficulty: st.difficulty as Difficulty, team: p.team }));
      const names = ['Leônidas', 'Péricles', 'Agamenon', 'Temístocles'];
      const usedTeams = new Set(players.map((p) => p.team));
      for (let i = 0; i < Number(st.ais); i++) { let t = 3; while (usedTeams.has(t) && t > 0) t--; usedTeams.add(t); players.push({ name: `${names[i % names.length]} (IA)`, god: MAJOR_GOD_LIST[(st.seed + i) % 3], isAI: true, difficulty: st.difficulty as Difficulty, team: t }); }
      const map = st.fixedMap && this.fixedMap ? this.fixedMap : undefined;   // só o anfitrião tem o arquivo; os outros recebem em `start`
      if (st.horde) {
        const humans: GameConfig['players'] = lobby.players.map((p) => ({ name: p.name, god: p.god, isAI: false, difficulty: st.difficulty as Difficulty, team: 0 }));
        humans.push({ name: 'Tártaro', god: 'hades', isAI: false, difficulty: 'normal', team: 9, puppet: true });   // marionete: só as ondas
        const hordeMap = map && map.starts.length >= humans.length ? map : undefined;   // a Horda aceita mapa fixo com início para cada humano + Tártaro
        net.start({ seed: st.seed >>> 0, mapSize: st.mapSize as MapSize, players: humans, scenario: 'horde', startingResources: { food: 600, wood: 500, gold: 300, favor: 20 }, map: hordeMap, mapHash: hordeMap ? mapHash(hordeMap) : undefined }, delay);
        return;
      }
      // Mapa fixo com cenário embutido: config do cenário (gameConfigFor); os humanos da sala ocupam as primeiras vagas na ordem
      // (nome, deus e time do lobby prevalecem), as demais seguem o arquivo; as IAs do lobby são ignoradas. Todos validam em `start`.
      if (map?.scenario) {
        const sc = map.scenario;
        const scIssues = validateScenario(sc);
        if (scIssues.length) { this.netStatus = t('mp.scenarioInvalid', { reason: scIssues.slice(0, 2).map((i) => `${i.path || '$'}: ${i.message}`).join('; ') }); this.render(); return; }
        const base = gameConfigFor(sc);
        const humans = lobby.players;
        // vagas humanas = as primeiras até a primeira marionete (os humanos da sala ocupam os índices 0…n-1, como os slots do lockstep)
        const open = base.players.findIndex((p) => p.puppet === true);
        const room = open < 0 ? base.players.length : open;
        if (humans.length > room) { this.netStatus = t('mp.scenarioPlayers', { n: room, p: humans.length }); this.render(); return; }
        // marionetes explícitas em rede: humanos da sala com puppet: false; vaga sem IA que ninguém ocupou vira marionete (só gatilhos)
        const scPlayers: GameConfig['players'] = base.players.map((p, i) => (i < humans.length ? { ...p, name: humans[i].name, nameText: undefined, god: humans[i].god, isAI: false, team: humans[i].team, puppet: false } : !p.isAI ? { ...p, puppet: true } : p));
        const issues = validateMap(map, { players: scPlayers.length, mode: base.mode, ai: scPlayers.map((p) => p.isAI) });
        if (hasErrors(issues)) { this.fixedIssues = issues; this.netStatus = t('main.fixedMapErrors') + ' ' + issues.filter((i) => i.level === 'error').slice(0, 2).map(issueText).join('; '); this.render(); return; }
        net.start({ ...base, seed: sc.config.seed ?? (st.seed >>> 0), players: scPlayers, map, mapHash: mapHash(map), scenarioData: sc }, delay);
        return;
      }
      if (players.length > 4) { this.netStatus = t('mp.max4'); this.render(); return; }
      if (map && map.starts.length < players.length) { this.netStatus = t('mp.fixedMapStarts', { n: map.starts.length, p: players.length }); this.render(); return; }
      if (map) {
        const mode = (st.mode ?? 'conquest') as GameMode;
        const issues = validateMap(map, { players: players.length, mode, ai: players.map((p) => p.isAI) });
        if (hasErrors(issues)) { this.fixedIssues = issues; this.netStatus = t('main.fixedMapErrors') + ' ' + issues.filter((i) => i.level === 'error').slice(0, 2).map(issueText).join('; '); this.render(); return; }
      }
      const teamsUsed = new Set(players.map((p) => p.team ?? 0)).size;
      net.start({ seed: st.seed >>> 0, mapSize: st.mapSize as MapSize, players, mode: (st.mode ?? 'conquest') as GameMode, mapType: (st.mapType ?? 'continental') as MapType, map, mapHash: map ? mapHash(map) : undefined, startOrder: map && teamsUsed < players.length ? startOrderFor(map, players.map((p) => p.team ?? 0)) : undefined }, delay);
    });
  }
}
