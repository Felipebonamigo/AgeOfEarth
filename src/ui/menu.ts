// Menu principal: configuração da partida (nome, deus, mapa, oponentes, dificuldade, semente).
import { DIFFICULTIES, MAP_SIZES, type Difficulty, type MapSize } from '../core/constants';
import { MAJOR_GODS, MAJOR_GOD_LIST } from '../core/data';
import type { GameConfig } from '../core/types';
import { hashString } from '../core/rng';
import { SCENARIOS } from '../core/scenario/campaign';
import { NetClient, type LobbyState } from '../net/client';

export interface MenuCallbacks { onStart: (config: GameConfig) => void; onLoad: () => void; hasSave: () => boolean; onHelp: () => void; onEncyclopedia: () => void; onMission: (id: string) => void; onNetworkStart: (client: NetClient, config: GameConfig, slots: number[]) => void }

export class MainMenu {
  root: HTMLElement; el: HTMLElement;
  private god = 'zeus';
  private tab: 'skirmish' | 'campaign' | 'multiplayer' = 'skirmish';
  net: NetClient | null = null;
  private netStatus = '';
  constructor(root: HTMLElement, private cb: MenuCallbacks) {
    this.root = root;
    this.el = document.createElement('div'); this.el.id = 'menu';
    root.appendChild(this.el);
    this.render();
  }
  show() { this.el.classList.remove('hidden'); this.render(); }
  hide() { this.el.classList.add('hidden'); }

  private render() {
    let saved: Partial<{ name: string; god: string; map: string; ais: number; diff: string; teams: string }> = {};
    try { saved = JSON.parse(localStorage.getItem('aoe_setup') ?? '{}'); } catch { /* ignore */ }
    this.god = saved.god ?? this.god;
    let completed: string[] = [];
    try { completed = JSON.parse(localStorage.getItem('aoe_campaign') ?? '{"completed":[]}').completed ?? []; } catch { /* ignore */ }
    const campaign = `<h3 style="margin:0 0 4px;color:#f2c14e">A Sombra dos Titãs — Prólogo</h3><p style="color:#9aa5b8;margin:0 0 8px;font-size:13px">Três missões que ensinam o jogo enquanto contam o despertar dos Titãs. Complete uma para liberar a próxima.</p><div class="missions">${SCENARIOS.map((m, i) => { const locked = i > 0 && !completed.includes(SCENARIOS[i - 1].id); const done = completed.includes(m.id); return `<div class="mission ${locked ? 'locked' : ''}" data-id="${m.id}"><span class="ic">${m.icon}</span><div><b>${m.title} ${done ? '✅' : ''}</b><small>${m.subtitle}${locked ? ' · bloqueada' : ''}</small></div></div>`; }).join('')}</div>`;
    this.el.innerHTML = `<div class="box">
      <h1>AGE OF EARTH</h1>
      <div class="sub">Idades, fronteiras e atrito no estilo Rise of Nations · deuses, favor, heróis e criaturas míticas no estilo Age of Mythology.</div>
      <div class="tabs"><button class="btn ${this.tab === 'skirmish' ? 'active' : ''}" data-tab="skirmish">⚔️ Partida rápida</button><button class="btn ${this.tab === 'campaign' ? 'active' : ''}" data-tab="campaign">📜 Campanha</button><button class="btn ${this.tab === 'multiplayer' ? 'active' : ''}" data-tab="multiplayer">🌐 Multiplayer</button></div>
      <div class="${this.tab === 'campaign' ? '' : 'hidden'}">${campaign}</div>
      <div class="${this.tab === 'multiplayer' ? '' : 'hidden'}" id="mp">${this.renderMultiplayer()}</div>
      <div class="grid ${this.tab === 'skirmish' ? '' : 'hidden'}">
        <div>
          <label>Seu nome</label><input id="m-name" value="${saved.name ?? 'Jogador'}" maxlength="18">
          <label>Deus maior</label>
          <div class="gods">${MAJOR_GOD_LIST.map((g) => { const d = MAJOR_GODS[g]; return `<div class="god ${g === this.god ? 'sel' : ''}" data-god="${g}"><div class="ic">${d.icon}</div><b>${d.name}</b><small>${d.title}</small><small>${d.perks.slice(0, 3).join(' · ')}</small></div>`; }).join('')}</div>
          <label>Semente do mapa (opcional)</label><input id="m-seed" placeholder="aleatória">
        </div>
        <div>
          <label>Tamanho do mapa</label><select id="m-map">${Object.entries(MAP_SIZES).map(([k, v]) => `<option value="${k}" ${(saved.map ?? 'medium') === k ? 'selected' : ''}>${v.label} (${v.w}×${v.h})</option>`).join('')}</select>
          <label>Oponentes (IA)</label><select id="m-ais">${[1, 2, 3].map((n) => `<option value="${n}" ${(saved.ais ?? 1) === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <label>Dificuldade</label><select id="m-diff">${Object.entries(DIFFICULTIES).map(([k, v]) => `<option value="${k}" ${(saved.diff ?? 'normal') === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
          <label>Times</label><select id="m-teams"><option value="ffa" ${(saved.teams ?? 'ffa') === 'ffa' ? 'selected' : ''}>Todos contra todos</option><option value="coop" ${saved.teams === 'coop' ? 'selected' : ''}>Cooperativo: você + 1 IA aliada contra o resto</option><option value="alliance" ${saved.teams === 'alliance' ? 'selected' : ''}>Você contra uma aliança de IAs</option></select>
          <label>Deuses dos oponentes</label><select id="m-aigod"><option value="random">Aleatórios</option>${MAJOR_GOD_LIST.map((g) => `<option value="${g}">${MAJOR_GODS[g].name}</option>`).join('')}</select>
          <label><input type="checkbox" id="m-reveal"> Mapa revelado (sem névoa)</label>
        </div>
      </div>
      <div class="actions">
        <button class="btn primary ${this.tab === 'skirmish' ? '' : 'hidden'}" id="m-start">▶ Jogar</button>
        <button class="btn" id="m-load" ${this.cb.hasSave() ? '' : 'disabled'}>📂 Carregar</button>
        <button class="btn" id="m-help">❓ Como jogar</button>
        <button class="btn" id="m-enc">📖 Enciclopédia</button>
      </div>
      <div class="credits">Versão 0.1 (fatia vertical): skirmish contra IA. Multiplayer em lockstep, co-op e campanha estão no roteiro.</div>
    </div>`;
    this.el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.tab = (b as HTMLElement).dataset.tab as 'skirmish' | 'campaign' | 'multiplayer'; this.render(); }));
    this.bindMultiplayer();
    this.el.querySelectorAll('.mission').forEach((m) => m.addEventListener('click', () => { if ((m as HTMLElement).classList.contains('locked')) return; this.cb.onMission((m as HTMLElement).dataset.id!); }));
    this.el.querySelectorAll('.god').forEach((g) => g.addEventListener('click', () => { this.god = (g as HTMLElement).dataset.god!; this.el.querySelectorAll('.god').forEach((x) => x.classList.toggle('sel', (x as HTMLElement).dataset.god === this.god)); }));
    const q = (id: string) => this.el.querySelector(id) as HTMLInputElement;
    q('#m-start').addEventListener('click', () => {
      const name = q('#m-name').value.trim() || 'Jogador';
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
      try { localStorage.setItem('aoe_setup', JSON.stringify({ name, god: this.god, map, ais, diff, teams })); } catch { /* ignore */ }
      this.cb.onStart({ seed, mapSize: map, players, revealMap: q('#m-reveal').checked });
    });
    q('#m-load').addEventListener('click', () => this.cb.onLoad());
    q('#m-help').addEventListener('click', () => this.cb.onHelp());
    q('#m-enc').addEventListener('click', () => this.cb.onEncyclopedia());
  }

  // ---------------- Multiplayer (lobby via relay WebSocket) ----------------
  private renderMultiplayer(): string {
    const lobby = this.net?.lobby;
    let saved: Partial<{ url: string; room: string; name: string }> = {};
    try { saved = JSON.parse(localStorage.getItem('aoe_mp') ?? '{}'); } catch { /* ignore */ }
    const defaultUrl = saved.url ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname || 'localhost'}:8787`;
    if (!this.net || !lobby) {
      return `<p style="color:#9aa5b8;font-size:13px;margin:0 0 8px">Partidas online em <b>lockstep determinístico</b>: todos rodam a mesma simulação e só trocam comandos. Rode o servidor com <code>npm run relay</code> (porta 8787) e entre na mesma sala. Jogadores na mesma equipe cooperam contra os outros e contra as IAs.</p>
        <div class="grid"><div><label>Servidor</label><input id="mp-url" value="${defaultUrl}"><label>Sala (código)</label><input id="mp-room" value="${saved.room ?? 'OLIMPO'}" maxlength="12"></div>
        <div><label>Seu nome</label><input id="mp-name" value="${saved.name ?? 'Jogador'}" maxlength="18"><label>Deus maior</label><select id="mp-god">${MAJOR_GOD_LIST.map((g) => `<option value="${g}">${MAJOR_GODS[g].icon} ${MAJOR_GODS[g].name}</option>`).join('')}</select></div></div>
        <div class="actions"><button class="btn primary" id="mp-join">🔌 Entrar na sala</button><span style="color:#ef4444;font-size:13px">${this.netStatus}</span></div>`;
    }
    const me = this.net.slot; const host = lobby.host === me;
    const rows = lobby.players.map((p) => `<tr><td>${p.slot === lobby.host ? '👑 ' : ''}${p.name}${p.slot === me ? ' (você)' : ''}</td><td>${MAJOR_GODS[p.god]?.icon ?? ''} ${MAJOR_GODS[p.god]?.name ?? p.god}</td><td>${host ? `<select data-team="${p.slot}">${[0, 1, 2, 3].map((t) => `<option value="${t}" ${p.team === t ? 'selected' : ''}>Time ${t + 1}</option>`).join('')}</select>` : `Time ${p.team + 1}`}</td></tr>`).join('');
    const st = lobby.settings;
    return `<h3 style="margin:0;color:#f2c14e">Sala ${this.net.room} <small style="color:#9aa5b8;font-weight:normal">— ${lobby.players.length} jogador(es) conectados</small></h3>
      <table style="width:100%;font-size:13px;margin:8px 0;border-collapse:collapse"><tr style="color:#9aa5b8"><th align="left">Jogador</th><th align="left">Deus</th><th align="left">Time</th></tr>${rows}</table>
      <div class="grid"><div>
        <label>Tamanho do mapa</label><select id="mp-map" ${host ? '' : 'disabled'}>${Object.entries(MAP_SIZES).map(([k, v]) => `<option value="${k}" ${st.mapSize === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
        <label>IAs adicionais</label><select id="mp-ais" ${host ? '' : 'disabled'}>${[0, 1, 2, 3].map((n) => `<option value="${n}" ${st.ais === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div><label>Dificuldade das IAs</label><select id="mp-diff" ${host ? '' : 'disabled'}>${Object.entries(DIFFICULTIES).map(([k, v]) => `<option value="${k}" ${st.difficulty === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
        <label>Meu deus</label><select id="mp-mygod">${MAJOR_GOD_LIST.map((g) => `<option value="${g}" ${lobby.players.find((p) => p.slot === me)?.god === g ? 'selected' : ''}>${MAJOR_GODS[g].icon} ${MAJOR_GODS[g].name}</option>`).join('')}</select></div></div>
      <div class="actions">${host ? '<button class="btn primary" id="mp-start">▶ Iniciar partida</button>' : '<span style="color:#9aa5b8">Aguardando o anfitrião iniciar...</span>'}<button class="btn" id="mp-leave">Sair da sala</button><span style="color:#ef4444;font-size:13px">${this.netStatus}</span></div>`;
  }

  private bindMultiplayer() {
    const q = (id: string) => this.el.querySelector(id) as HTMLInputElement | null;
    q('#mp-join')?.addEventListener('click', async () => {
      const url = q('#mp-url')!.value.trim(), room = q('#mp-room')!.value.trim() || 'OLIMPO', name = q('#mp-name')!.value.trim() || 'Jogador', god = q('#mp-god')!.value;
      try { localStorage.setItem('aoe_mp', JSON.stringify({ url, room, name })); } catch { /* ignore */ }
      const net = new NetClient();
      net.on('lobby', () => { if (this.tab === 'multiplayer') this.render(); });
      net.on('error', (m) => { this.netStatus = String(m.msg); this.render(); });
      net.on('close', () => { if (this.net === net) { this.net = null; this.netStatus = 'Conexão encerrada.'; if (!this.el.classList.contains('hidden')) this.render(); } });
      net.on('start', (m) => { this.cb.onNetworkStart(net, m.config as GameConfig, m.slots as number[]); });
      this.netStatus = 'Conectando...'; this.render();
      try { await net.connect(url); } catch (e) { this.netStatus = (e as Error).message; this.render(); return; }
      this.net = net; this.netStatus = '';
      net.join(room, name, god);
    });
    q('#mp-leave')?.addEventListener('click', () => { this.net?.close(); this.net = null; this.netStatus = ''; this.render(); });
    const settingsChanged = () => { if (!this.net?.isHost) return; this.net.settings({ mapSize: q('#mp-map')!.value, ais: Number(q('#mp-ais')!.value), difficulty: q('#mp-diff')!.value }); };
    q('#mp-map')?.addEventListener('change', settingsChanged); q('#mp-ais')?.addEventListener('change', settingsChanged); q('#mp-diff')?.addEventListener('change', settingsChanged);
    q('#mp-mygod')?.addEventListener('change', () => this.net?.player({ god: q('#mp-mygod')!.value }));
    this.el.querySelectorAll('[data-team]').forEach((sel) => sel.addEventListener('change', () => this.net?.player({ slot: Number((sel as HTMLElement).dataset.team), team: Number((sel as HTMLSelectElement).value) })));
    q('#mp-start')?.addEventListener('click', () => {
      const net = this.net; const lobby = net?.lobby; if (!net || !lobby) return;
      const st = lobby.settings;
      const players: GameConfig['players'] = lobby.players.map((p) => ({ name: p.name, god: p.god, isAI: false, difficulty: st.difficulty as Difficulty, team: p.team }));
      const names = ['Leônidas', 'Péricles', 'Agamenon', 'Temístocles'];
      const usedTeams = new Set(players.map((p) => p.team));
      for (let i = 0; i < Number(st.ais); i++) { let t = 3; while (usedTeams.has(t) && t > 0) t--; usedTeams.add(t); players.push({ name: `${names[i % names.length]} (IA)`, god: MAJOR_GOD_LIST[(st.seed + i) % 3], isAI: true, difficulty: st.difficulty as Difficulty, team: t }); }
      if (players.length > 4) { this.netStatus = 'Máximo de 4 jogadores (humanos + IAs).'; this.render(); return; }
      net.start({ seed: st.seed >>> 0, mapSize: st.mapSize as MapSize, players });
    });
  }
}
