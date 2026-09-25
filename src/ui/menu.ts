// Menu principal: configuração da partida (nome, deus, mapa, oponentes, dificuldade, semente).
import { DIFFICULTIES, MAP_SIZES, type Difficulty, type MapSize } from '../core/constants';
import { MAJOR_GODS, MAJOR_GOD_LIST } from '../core/data';
import type { GameConfig } from '../core/types';
import { hashString } from '../core/rng';
import { SCENARIOS } from '../core/scenario/campaign';

export interface MenuCallbacks { onStart: (config: GameConfig) => void; onLoad: () => void; hasSave: () => boolean; onHelp: () => void; onEncyclopedia: () => void; onMission: (id: string) => void }

export class MainMenu {
  root: HTMLElement; el: HTMLElement;
  private god = 'zeus';
  private tab: 'skirmish' | 'campaign' = 'skirmish';
  constructor(root: HTMLElement, private cb: MenuCallbacks) {
    this.root = root;
    this.el = document.createElement('div'); this.el.id = 'menu';
    root.appendChild(this.el);
    this.render();
  }
  show() { this.el.classList.remove('hidden'); this.render(); }
  hide() { this.el.classList.add('hidden'); }

  private render() {
    let saved: Partial<{ name: string; god: string; map: string; ais: number; diff: string }> = {};
    try { saved = JSON.parse(localStorage.getItem('aoe_setup') ?? '{}'); } catch { /* ignore */ }
    this.god = saved.god ?? this.god;
    let completed: string[] = [];
    try { completed = JSON.parse(localStorage.getItem('aoe_campaign') ?? '{"completed":[]}').completed ?? []; } catch { /* ignore */ }
    const campaign = `<h3 style="margin:0 0 4px;color:#f2c14e">A Sombra dos Titãs — Prólogo</h3><p style="color:#9aa5b8;margin:0 0 8px;font-size:13px">Três missões que ensinam o jogo enquanto contam o despertar dos Titãs. Complete uma para liberar a próxima.</p><div class="missions">${SCENARIOS.map((m, i) => { const locked = i > 0 && !completed.includes(SCENARIOS[i - 1].id); const done = completed.includes(m.id); return `<div class="mission ${locked ? 'locked' : ''}" data-id="${m.id}"><span class="ic">${m.icon}</span><div><b>${m.title} ${done ? '✅' : ''}</b><small>${m.subtitle}${locked ? ' · bloqueada' : ''}</small></div></div>`; }).join('')}</div>`;
    this.el.innerHTML = `<div class="box">
      <h1>AGE OF EARTH</h1>
      <div class="sub">Idades, fronteiras e atrito no estilo Rise of Nations · deuses, favor, heróis e criaturas míticas no estilo Age of Mythology.</div>
      <div class="tabs"><button class="btn ${this.tab === 'skirmish' ? 'active' : ''}" data-tab="skirmish">⚔️ Partida rápida</button><button class="btn ${this.tab === 'campaign' ? 'active' : ''}" data-tab="campaign">📜 Campanha</button></div>
      <div class="${this.tab === 'campaign' ? '' : 'hidden'}">${campaign}</div>
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
    this.el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.tab = (b as HTMLElement).dataset.tab as 'skirmish' | 'campaign'; this.render(); }));
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
      const players: GameConfig['players'] = [{ name, god: this.god, isAI: false, difficulty: diff }];
      for (let i = 0; i < ais; i++) players.push({ name: `${names[(seed + i) % names.length]} (IA)`, god: aiGod === 'random' ? gods[(seed + i * 7) % gods.length] : aiGod, isAI: true, difficulty: diff });
      try { localStorage.setItem('aoe_setup', JSON.stringify({ name, god: this.god, map, ais, diff })); } catch { /* ignore */ }
      this.cb.onStart({ seed, mapSize: map, players, revealMap: q('#m-reveal').checked });
    });
    q('#m-load').addEventListener('click', () => this.cb.onLoad());
    q('#m-help').addEventListener('click', () => this.cb.onHelp());
    q('#m-enc').addEventListener('click', () => this.cb.onEncyclopedia());
  }
}
