// Interface em DOM: barra de recursos, painel de seleção, grade de comandos, poderes divinos,
// minimapa, mensagens, tooltips e modais (deuses menores, menu, ajuda, enciclopédia, fim de jogo).
import { RESOURCES, RESOURCE_ICONS, STANCES, TICK_RATE, MAX_SCHOLARS, SCHOLAR_COST, WONDER_VICTORY_SECONDS, KOTH_SECONDS, FORMATIONS, rankOf, type ResourceType, type Stance, type Formation } from '../core/constants';
const FORMATION_ICONS: Record<Formation, string> = { line: '▬', box: '▦', column: '▮', wedge: '▲' };
import { teamNames } from '../core/sim/modes';
import { relicsOf } from '../core/sim/relics';
import { AGES, BUILDINGS, BUILD_MENU, MAJOR_GODS, MINOR_GODS, POWERS, TECHS, UNITS, ACADEMY_LINES, ABILITIES } from '../core/data';
import type { Building, GameEvent, Unit } from '../core/types';
import { getUnitStats, getBuildingStats, techCost } from '../core/sim/modifiers';
import { canTrain, canResearch, canAdvanceAge, academyTechCount } from '../core/sim/commands';
import { canPlaceBuilding, buildingLimitOk } from '../core/sim/entities';
import { farmGatherers, isMilitary } from '../core/sim/queries';
import { canAfford, missingResources } from '../core/sim/economy';
import type { Session } from '../game/session';
import type { Renderer } from '../render/renderer';
import { Minimap } from '../render/minimap';
import type { Audio } from '../audio/audio';
import { getScenario } from '../core/scenario/runner';
import { t } from '../i18n';
import { optionsHTML, bindOptions, type OptionsContext } from './options';

export interface HUDCallbacks { onSave: () => void; onLoad: () => void; onQuit: () => void; hasSave: () => boolean; onNextMission?: (currentId: string) => void; onExport?: () => void; onImport?: () => void; onLocaleChanged?: () => void; getOptions?: () => OptionsContext; onDiagnostic?: () => void; onExportMap?: () => void }

const el = (tag: string, cls?: string, html?: string): HTMLElement => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const fmtCost = (cost: Record<string, number>, player?: { resources: Record<string, number> }) => Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) => `<span class="${player && player.resources[k] < v ? 'miss' : ''}">${RESOURCE_ICONS[k as ResourceType]} ${v}</span>`).join('');
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class HUD {
  root: HTMLElement;
  objPanel!: HTMLElement; dlgPanel!: HTMLElement;
  top!: HTMLElement; bottom!: HTMLElement; selPanel!: HTMLElement; cmdPanel!: HTMLElement; godsPanel!: HTMLElement; msgPanel!: HTMLElement; tooltip!: HTMLElement; modalBack!: HTMLElement; modal!: HTMLElement; idleBtn!: HTMLElement;
  minimap!: Minimap;
  chatEl!: HTMLInputElement;
  /** Definido pelo boot em partidas online: envia a mensagem para a sala. */
  onChat: ((text: string) => void) | null = null;
  private session: Session | null = null;
  private acc = 0; private mmAcc = 0;
  private lastSelKey = '';
  private lastCmdKey = '';
  private gameOverShown = false;
  private renderer: Renderer;
  private audio: Audio;
  private cb: HUDCallbacks;
  private resEls: Record<string, HTMLElement> = {};
  private popEl!: HTMLElement; private ageEl!: HTMLElement; private clockEl!: HTMLElement; private modeEl!: HTMLElement; private speedEl!: HTMLElement; private ageBtn!: HTMLElement;

  constructor(root: HTMLElement, renderer: Renderer, audio: Audio, cb: HUDCallbacks) {
    this.root = root; this.renderer = renderer; this.audio = audio; this.cb = cb;
    this.mount();
  }

  setSession(s: Session | null) {
    this.session = s; this.lastSelKey = ''; this.lastCmdKey = ''; this.gameOverShown = false;
    this.msgPanel.innerHTML = '';
    if (s) { s.onSelectionChanged = () => { this.refreshSelection(true); }; this.refreshGods(); this.refreshTop(); }
  }

  // ---------------- Montagem ----------------
  private mount() {
    const hud = el('div'); hud.id = 'hud';
    this.top = el('div'); this.top.id = 'top';
    for (const r of RESOURCES) { const e = el('div', 'res', `<span>${RESOURCE_ICONS[r]}</span><b>0</b>`); e.title = t(`res.${r}`); this.resEls[r] = e; this.top.appendChild(e); }
    this.popEl = el('div', 'res', `<span>👥</span><b>0/0</b>`); this.popEl.title = t('pop'); this.top.appendChild(this.popEl);
    this.top.appendChild(el('div', 'spacer'));
    this.ageEl = el('div', 'age', ''); this.top.appendChild(this.ageEl);
    this.ageBtn = el('button', 'btn gold', t('top.advance')); this.ageBtn.addEventListener('click', () => this.tryAdvanceAge()); this.top.appendChild(this.ageBtn);
    this.clockEl = el('div', 'clock', '0:00'); this.top.appendChild(this.clockEl);
    this.modeEl = el('div', 'clock', ''); this.modeEl.style.color = '#f2c14e'; this.top.appendChild(this.modeEl);
    this.speedEl = el('div', '', ''); this.top.appendChild(this.speedEl);
    const speedBtns = [['⏸', 0], ['1×', 1], ['2×', 2], ['3×', 3]] as const;
    for (const [lbl, sp] of speedBtns) { const b = el('button', 'btn', lbl); b.addEventListener('click', () => { if (!this.session) return; if (sp === 0) this.session.paused = !this.session.paused; else { this.session.speed = sp; this.session.paused = false; } this.refreshTop(); }); this.speedEl.appendChild(b); }
    const mute = el('button', 'btn', this.audio.muted ? '🔇' : '🔊'); mute.addEventListener('click', () => { mute.textContent = this.audio.toggleMute() ? '🔇' : '🔊'; }); this.top.appendChild(mute);
    const menuBtn = el('button', 'btn', t('top.menu')); menuBtn.addEventListener('click', () => this.showMenu()); this.top.appendChild(menuBtn);
    hud.appendChild(this.top);

    this.bottom = el('div'); this.bottom.id = 'bottom';
    const mmWrap = el('div'); mmWrap.id = 'minimap-wrap';
    const mm = document.createElement('canvas'); mm.id = 'minimap'; mmWrap.appendChild(mm);
    this.idleBtn = el('button', 'btn'); this.idleBtn.id = 'idle'; this.idleBtn.textContent = t('top.idle', { n: 0 }); this.idleBtn.title = t('top.idleTip'); this.idleBtn.addEventListener('click', () => this.selectIdleVillager()); mmWrap.appendChild(this.idleBtn);
    this.bottom.appendChild(mmWrap);
    this.minimap = new Minimap(mm);
    this.selPanel = el('div'); this.selPanel.id = 'selection'; this.bottom.appendChild(this.selPanel);
    this.cmdPanel = el('div'); this.cmdPanel.id = 'commands'; this.bottom.appendChild(this.cmdPanel);
    hud.appendChild(this.bottom);

    this.godsPanel = el('div'); this.godsPanel.id = 'gods'; hud.appendChild(this.godsPanel);
    this.msgPanel = el('div'); this.msgPanel.id = 'messages'; hud.appendChild(this.msgPanel);
    this.objPanel = el('div'); this.objPanel.id = 'objectives'; this.objPanel.classList.add('hidden'); hud.appendChild(this.objPanel);
    this.dlgPanel = el('div'); this.dlgPanel.id = 'dialogue'; this.dlgPanel.classList.add('hidden'); this.dlgPanel.addEventListener('click', () => this.dlgPanel.classList.add('hidden')); hud.appendChild(this.dlgPanel);
    this.tooltip = el('div'); this.tooltip.id = 'tooltip'; this.tooltip.classList.add('hidden'); hud.appendChild(this.tooltip);
    this.modalBack = el('div'); this.modalBack.id = 'modal-back'; this.modalBack.classList.add('hidden');
    this.modal = el('div'); this.modal.id = 'modal'; this.modalBack.appendChild(this.modal);
    this.chatEl = el('input', 'hidden') as HTMLInputElement; this.chatEl.id = 'chat'; this.chatEl.maxLength = 200; this.chatEl.placeholder = t('mp.chatPlaceholder');
    this.chatEl.style.cssText = 'position:fixed;left:50%;bottom:190px;transform:translateX(-50%);width:420px;background:#0f1628;color:#e5e7eb;border:1px solid #f2c14e;border-radius:6px;padding:6px 10px;font-size:14px;z-index:35';
    this.chatEl.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { const v = this.chatEl.value.trim(); if (v && this.onChat) this.onChat(v); this.closeChat(); } else if (e.key === 'Escape') this.closeChat(); });
    hud.appendChild(this.chatEl);
    this.modalBack.addEventListener('mousedown', (e) => { if (e.target === this.modalBack && this.modalDismissable) this.hideModal(); });
    this.root.appendChild(hud);
    this.root.appendChild(this.modalBack);   // fora do #hud: os modais (ajuda, atalhos) também servem ao menu principal
    // tooltips genéricos
    hud.addEventListener('mouseover', (e) => { const t = (e.target as HTMLElement).closest('[data-tip]') as HTMLElement | null; if (t) this.showTooltip(t.dataset.tip!, e.clientX, e.clientY); });
    hud.addEventListener('mousemove', (e) => { const t = (e.target as HTMLElement).closest('[data-tip]') as HTMLElement | null; if (t) this.positionTooltip(e.clientX, e.clientY); else this.tooltip.classList.add('hidden'); });
    hud.addEventListener('mouseout', () => this.tooltip.classList.add('hidden'));
  }
  private modalDismissable = true;
  private menuOpen = false; private pausedBeforeMenu = false;

  get hudVisible() { return !this.root.querySelector('#hud')!.classList.contains('hidden'); }
  setVisible(v: boolean) { (this.root.querySelector('#hud') as HTMLElement).classList.toggle('hidden', !v); }

  showTooltip(html: string, x: number, y: number) { this.tooltip.innerHTML = html; this.tooltip.classList.remove('hidden'); this.positionTooltip(x, y); }
  hideTooltip() { this.tooltip.classList.add('hidden'); }
  private positionTooltip(x: number, y: number) {
    const r = this.tooltip.getBoundingClientRect();
    let tx = x + 14, ty = y - r.height - 10;
    if (tx + r.width > window.innerWidth - 8) tx = x - r.width - 14;
    if (ty < 50) ty = y + 18;
    this.tooltip.style.left = `${tx}px`; this.tooltip.style.top = `${ty}px`;
  }

  /** Visão de espectador: névoa desligada e todos visíveis no mapa e no minimapa (só renderização). */
  setRevealAll(v: boolean) { this.renderer.revealAll = v; this.minimap.revealAll = v; }
  toast(text: string, kind: 'info' | 'warn' | 'good' | 'gold' = 'info', pos?: { x: number; y: number }) {
    const t = el('div', `toast ${kind}`, text);
    if (pos) t.addEventListener('click', () => { this.renderer.cam.centerOn(pos.x, pos.y); });
    this.msgPanel.appendChild(t);
    while (this.msgPanel.children.length > 6) this.msgPanel.removeChild(this.msgPanel.firstChild!);
    setTimeout(() => { t.style.transition = 'opacity 0.6s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 600); }, 7000);
  }

  // ---------------- Atualização ----------------
  update(dtReal: number) {
    const s = this.session; if (!s) return;
    this.acc += dtReal; this.mmAcc += dtReal;
    this.drainEvents();
    if (this.mmAcc > 0.15) { this.mmAcc = 0; this.minimap.draw(s.state, this.renderer.cam, s.local); }
    if (this.acc > 0.12) { this.acc = 0; this.refreshTop(); this.refreshSelection(false); this.refreshGods(); this.refreshObjectives(false); }
    if (s.state.gameOver && !this.gameOverShown) { this.gameOverShown = true; this.showGameOver(); }
  }

  private drainEvents() {
    const s = this.session!; const st = s.state;
    while (s.eventCursor < st.events.length) {
      const e: GameEvent = st.events[s.eventCursor++];
      const mine = e.player === s.local;
      const global = ['age', 'victory', 'defeated', 'wonder', 'wonderLost', 'titan', 'titanDied', 'ceasefire', 'powerUsed', 'dialogue', 'objective'].includes(e.type);
      if (!mine && !global) continue;
      if (e.type === 'dialogue') { this.showDialogue(e.data ?? '', e.text ?? ''); continue; }
      if (e.type === 'objective') { this.toast(e.text ?? '', e.data === 'done' ? 'good' : e.data === 'failed' ? 'warn' : 'gold'); this.audio.play(e.data === 'done' ? 'complete' : 'alert'); this.refreshObjectives(true); continue; }
      if (e.type === 'idleVillager' && !e.text) continue;
      let kind: 'info' | 'warn' | 'good' | 'gold' = 'info';
      if (e.type === 'underAttack' || e.type === 'buildingLost' || e.type === 'heroDied' || e.type === 'wonderLost') kind = 'warn';
      if (e.type === 'built' || e.type === 'research' || e.type === 'victory') kind = 'good';
      if (e.type === 'age' || e.type === 'wonder' || e.type === 'titan' || e.type === 'power' || e.type === 'powerUsed') kind = 'gold';
      if (e.x !== undefined && e.y !== undefined) s.lastEvent = { x: e.x, y: e.y };
      if (e.text) this.toast(e.text, kind, e.x !== undefined && e.y !== undefined ? { x: e.x, y: e.y } : undefined);
      if (e.type === 'underAttack' && mine) { this.audio.play('alert'); if (e.x !== undefined && e.y !== undefined) this.minimap.ping(e.x, e.y); }
      else if (e.type === 'age') this.audio.play('age');
      else if (e.type === 'built' || e.type === 'research') this.audio.play('complete');
      else if (e.type === 'powerUsed') this.audio.play('power');
      if (e.type === 'age' && mine) { this.refreshGods(); this.lastCmdKey = ''; }
    }
    // efeitos sonoros do mundo (limitados)
    for (const fx of st.effects) {
      if (fx.ttl !== fx.total) continue;
      if (fx.type === 'hit' || fx.type === 'projectile') this.audio.play('attack');
      else if (fx.type === 'death') this.audio.play('death');
      else if (fx.type === 'bolt') this.audio.play('bolt');
    }
  }

  refreshTop() {
    const s = this.session; if (!s) return;
    const p = s.player;
    for (const r of RESOURCES) { const e = this.resEls[r]; e.querySelector('b')!.textContent = String(Math.floor(p.resources[r])); e.classList.toggle('low', p.resources[r] < 50 && r !== 'knowledge' && r !== 'favor'); }
    this.popEl.querySelector('b')!.textContent = `${p.pop}/${p.popCap}`; this.popEl.classList.toggle('low', p.pop >= p.popCap);
    const age = AGES[p.age];
    this.ageEl.innerHTML = `${age.icon} ${age.name} · ${MAJOR_GODS[p.god].icon} ${MAJOR_GODS[p.god].name}${p.minorGods.length ? ' · ' + p.minorGods.map((g) => MINOR_GODS[g].icon).join('') : ''}`;
    const adv = canAdvanceAge(s.state, p);
    const inProgress = [...s.state.buildings.values()].some((b) => b.owner === p.id && b.queue.some((q) => q.kind === 'age'));
    this.ageBtn.textContent = inProgress ? t('top.advancing') : p.age >= AGES.length - 1 ? t('top.maxAge') : `⬆ ${AGES[p.age + 1].name}`;
    (this.ageBtn as HTMLButtonElement).disabled = inProgress || p.age >= AGES.length - 1;
    this.ageBtn.dataset.tip = p.age >= AGES.length - 1 ? t('top.maxAgeTip') : `<b>${AGES[p.age + 1].name}</b><div class="cost">${fmtCost(AGES[p.age + 1].cost as Record<string, number>, p)}</div><div class="desc">${AGES[p.age + 1].desc}</div>${adv.ok ? '' : `<div style="color:#ef4444;margin-top:4px">${adv.reason ?? ''}</div>`}`;
    this.ageBtn.classList.toggle('primary', adv.ok);
    const k = s.state.koth;
    const relics = relicsOf(s.state, p.id);
    this.modeEl.textContent = (s.spectator ? t('top.spectator') + ' ' : '') + (k ? (k.team === -1 ? t('top.kothNone') : t('top.koth', { who: teamNames(s.state, k.team), s: k.seconds, total: KOTH_SECONDS })) : '') + (relics > 0 ? ' ' + t('top.relics', { n: relics }) : '');
    this.modeEl.dataset.tip = relics > 0 ? t('top.relicsTip') : '';
    const waiting = (s.scheduler as { waiting?: number }).waiting ?? 0;
    this.clockEl.textContent = fmtTime(s.state.time) + (s.paused ? ' ⏸' : s.speed !== 1 ? ` ${s.speed}×` : '') + (waiting > 10 ? ' ' + t('top.waiting') : '');
    let idle = 0;
    for (const u of s.state.units.values()) if (u.owner === p.id && u.type === 'villager' && u.state === 'idle' && !u.order) idle++;
    this.idleBtn.textContent = t('top.idle', { n: idle });
    this.idleBtn.classList.toggle('gold', idle > 0);
  }

  selectIdleVillager() {
    const s = this.session; if (!s) return;
    const idle = [...s.state.units.values()].filter((u) => u.owner === s.local && u.type === 'villager' && u.state === 'idle' && !u.order);
    if (idle.length === 0) { this.toast(t('msg.noIdle'), 'info'); return; }
    const cur = [...s.selection][0];
    const i = idle.findIndex((u) => u.id === cur);
    const next = idle[(i + 1) % idle.length];
    s.select([next.id]); this.renderer.cam.centerOn(next.x, next.y);
  }

  private dlgTimer = 0;
  showDialogue(meta: string, text: string) {
    const [icon, speaker] = meta.split('|');
    this.dlgPanel.innerHTML = `<span class="ic">${icon}</span><div><b>${speaker}</b><div>${text}</div></div><small>${t('modal.close').toLowerCase()}</small>`;
    this.dlgPanel.classList.remove('hidden');
    clearTimeout(this.dlgTimer);
    this.dlgTimer = window.setTimeout(() => this.dlgPanel.classList.add('hidden'), 14000);
  }

  private lastObjKey = '';
  refreshObjectives(force: boolean) {
    const s = this.session; if (!s || !s.state.scenario) { this.objPanel.classList.add('hidden'); return; }
    const def = getScenario(s.state.scenario.id); if (!def) return;
    const sc = s.state.scenario;
    const key = Object.entries(sc.objectives).map(([k, v]) => `${k}${v}${sc.hidden[k] ? 'h' : ''}`).join(',') + Math.floor(s.state.time / 5);
    if (!force && key === this.lastObjKey) return;
    this.lastObjKey = key;
    const rows = def.objectives.filter((o) => !sc.hidden[o.id]).map((o) => { const st = sc.objectives[o.id]; return `<li class="${st}">${st === 'done' ? '✅' : st === 'failed' ? '❌' : '◻️'} ${o.text}${o.optional ? ` <small>${t('mission.optional')}</small>` : ''}</li>`; }).join('');
    let extra = '';
    if (s.state.scenario.id === 'm2_cerco' && sc.objectives.survive === 'pending') extra = `<div class="timer">⏳ ${fmtTime(Math.max(0, 12 * 60 - s.state.time))}</div>`;
    if (s.state.scenario.id === 'm3_portal') { const g = [...s.state.buildings.values()].find((b) => b.owner === 1 && b.type === 'titan_gate'); if (g && !g.complete) extra = `<div class="timer">🌋 Ritual do Portal: ${Math.max(0, Math.round((g.progress / 180) * 100))}%</div>`; }
    this.objPanel.innerHTML = `<h4>${def.icon} ${def.title}</h4><ul>${rows}</ul>${extra}`;
    this.objPanel.classList.remove('hidden');
  }

  refreshGods() {
    const s = this.session; if (!s) return;
    const p = s.player;
    const key = p.powers.map((x) => `${x.id}${x.used ? 1 : 0}`).join(',') + s.ui.powerId;
    if (this.godsPanel.dataset.key === key) return;
    this.godsPanel.dataset.key = key;
    this.godsPanel.innerHTML = '';
    for (const ps of p.powers) {
      const def = POWERS[ps.id];
      const e = el('div', `pw ${ps.used ? 'used' : ''} ${s.ui.powerId === ps.id ? 'active' : ''}`, `<span class="ic">${def.icon}</span><span>${def.name}<br><small style="color:#9aa5b8">${ps.used ? t('power.used') : def.targeting === 'global' ? t('power.clickInvoke') : t('power.clickTarget')}</small></span>`);
      e.dataset.tip = `<b>${def.name}</b><div class="desc">${def.desc}</div>`;
      if (!ps.used) e.addEventListener('click', () => this.activatePower(ps.id));
      this.godsPanel.appendChild(e);
    }
  }

  activatePower(id: string) {
    const s = this.session!; const def = POWERS[id];
    if (def.targeting === 'global') { s.issue({ type: 'power', player: s.local, power: id }); this.audio.play('power'); return; }
    s.ui.mode = 'power'; s.ui.powerId = id; s.ui.placeType = null;
    document.body.className = 'cur-power';
    this.toast(t('msg.powerHint', { power: def.name, target: t(def.targeting === 'unit' ? 'msg.powerTarget.unit' : def.targeting === 'building' ? 'msg.powerTarget.building' : 'msg.powerTarget.place') }), 'gold');
    this.refreshGods();
  }

  cancelMode() {
    const s = this.session; if (!s) return;
    s.ui.mode = 'normal'; s.ui.placeType = null; s.ui.powerId = null; s.ui.wallStart = null;
    document.body.className = '';
    this.lastCmdKey = ''; this.refreshGods(); this.refreshSelection(true);
  }

  // ---------------- Seleção ----------------
  refreshSelection(force: boolean) {
    const s = this.session; if (!s) return;
    s.pruneSelection();
    const units = s.selectedUnits(), blds = s.selectedBuildings();
    const key = [...s.selection].join(',') + '|' + units.map((u) => `${u.hp}`).join(',') + '|' + blds.map((b) => `${b.hp}${b.complete}${b.queue.map((q) => q.id + Math.floor(q.elapsed)).join('.')}${b.scholars}g${b.garrison.length}`).join(',') + '|' + s.ui.mode + s.ui.placeType + '|' + s.player.age + s.player.techs.length + Math.floor(s.state.tick / 10);
    if (!force && key === this.lastSelKey) return;
    this.lastSelKey = key;
    this.selPanel.innerHTML = '';
    if (units.length + blds.length === 0) { this.selPanel.innerHTML = `<div class="desc">${t('sel.hint')}</div>`; this.refreshCommands(force); return; }
    if (units.length + blds.length === 1) {
      if (units.length === 1) this.selPanel.appendChild(this.unitCard(units[0]));
      else this.selPanel.appendChild(this.buildingCard(blds[0]));
    } else {
      const title = el('div', 'title', t('sel.count', { n: units.length + blds.length }));
      this.selPanel.appendChild(title);
      const multi = el('div', 'multi');
      for (const e of [...units, ...blds].slice(0, 40)) {
        const def = e.kind === 'unit' ? UNITS[e.type] : BUILDINGS[e.type];
        const mi = el('div', 'mi', `${def.icon}<div class="hp"><div style="width:${Math.round((e.hp / e.maxHp) * 100)}%"></div></div>`);
        mi.dataset.tip = `<b>${def.name}</b> ${Math.round(e.hp)}/${e.maxHp}`;
        mi.addEventListener('click', (ev) => { if (ev.ctrlKey) s.select([e.id], true); else s.select([e.id]); });
        multi.appendChild(mi);
      }
      this.selPanel.appendChild(multi);
    }
    this.refreshCommands(force);
  }

  private unitCard(u: Unit): HTMLElement {
    const s = this.session!; const def = UNITS[u.type]; const owner = s.state.players[u.owner];
    const st = getUnitStats(s.state, owner, u.type);
    const c = el('div');
    c.appendChild(el('div', 'title', `<span class="icon">${def.icon}</span>${def.name} <small style="color:${'#' + owner.color.toString(16).padStart(6, '0')}">${owner.name}</small>`));
    c.appendChild(el('div', 'hpbar', `<div style="width:${Math.round((u.hp / u.maxHp) * 100)}%"></div>`));
    const stats: string[] = [`${t('sel.hp')} <b>${Math.round(u.hp)}/${u.maxHp}</b>`];
    if (st.attack > 0) stats.push(`${t('sel.attack')} <b>${st.attack}</b> (${t(`dmg.${def.attackType}`)})`);
    stats.push(`${t('sel.armor')} <b>${Math.round(st.armor.hack * 100)}/${Math.round(st.armor.pierce * 100)}/${Math.round(st.armor.crush * 100)}%</b>`);
    if (st.range >= 1.6) stats.push(`${t('sel.range')} <b>${st.range}</b>`);
    stats.push(`${t('sel.speed')} <b>${st.speed.toFixed(1)}</b>`);
    if (def.special === 'heads') stats.push(`${t('sel.heads')} <b>${u.heads}</b>`);
    if (u.kills > 0) stats.push(`${t('sel.kills')} <b>${u.kills}</b>`);
    if (rankOf(u.kills) > 0 && UNITS[u.type].tags.includes('military') && !UNITS[u.type].tags.includes('titan')) stats.push(`${t('sel.rank')} <b>${'⭐'.repeat(rankOf(u.kills))}</b>`);
    if (u.owner === s.local) stats.push(`${t('sel.stance')} <b>${t(`stance.${u.stance}`)}</b>`);
    if (u.carry && u.carryAmt > 0) stats.push(`${t('sel.carry')} <b>${RESOURCE_ICONS[u.carry]} ${Math.floor(u.carryAmt)}</b>`);
    if (u.owner === s.local) stats.push(`${t('sel.state')} <b>${t(`state.${u.state}`)}</b>`);
    c.appendChild(el('div', 'stats', stats.map((x) => `<span>${x}</span>`).join('')));
    const bonuses = Object.entries(def.bonus).map(([k, v]) => `×${v} vs ${t(`vs.${k}`)}`).join(', ');
    c.appendChild(el('div', 'desc', def.desc + (bonuses ? ` <i>(${bonuses})</i>` : '')));
    return c;
  }

  private buildingCard(b: Building): HTMLElement {
    const s = this.session!; const def = BUILDINGS[b.type]; const owner = s.state.players[b.owner];
    const st = getBuildingStats(s.state, owner, b.type);
    const c = el('div');
    c.appendChild(el('div', 'title', `<span class="icon">${def.icon}</span>${def.name} <small style="color:${'#' + owner.color.toString(16).padStart(6, '0')}">${owner.name}</small>`));
    if (!b.complete) c.appendChild(el('div', 'hpbar', `<div style="width:${Math.round((b.progress / st.buildTime) * 100)}%;background:#60a5fa"></div>`));
    else c.appendChild(el('div', 'hpbar', `<div style="width:${Math.round((b.hp / b.maxHp) * 100)}%"></div>`));
    const stats: string[] = [`${t('sel.hp')} <b>${Math.round(b.hp)}/${b.maxHp}</b>`];
    if (!b.complete) stats.push(`${t('sel.construction')} <b>${Math.round((b.progress / st.buildTime) * 100)}%</b>`);
    if (st.attack > 0) stats.push(`${t('sel.attack')} <b>${st.attack}</b> · ${t('sel.range')} <b>${st.range}</b>`);
    if (def.territory) stats.push(`${t('sel.border')} <b>${st.territory}</b>`);
    if (def.popCap) stats.push(`${t('sel.popCap')} <b>+${def.popCap}</b>`);
    if (def.worship) { let n = 0; for (const u of s.state.units.values()) if (u.state === 'pray' && u.nodeId === -b.id) n++; stats.push(`${t('sel.worshippers')} <b>${n}</b>`); }
    if (def.scholars) stats.push(`${t('sel.scholars')} <b>${b.scholars}/${MAX_SCHOLARS}</b>`);
    if (def.farm) stats.push(`${t('sel.farmers')} <b>${farmGatherers(s.state, b.id)}/1</b>`);
    if (def.garrison) stats.push(`${t('sel.garrison')} <b>${b.garrison.length}/${def.garrison}</b>${b.garrison.length >= 3 ? ` (${t('sel.extraArrows', { n: Math.min(4, Math.floor(b.garrison.length / 3)) })})` : ''}`);
    if (def.wonder && b.complete && b.wonderStart >= 0) stats.push(`${t('sel.victoryIn')} <b>${fmtTime(Math.max(0, WONDER_VICTORY_SECONDS - (s.state.tick - b.wonderStart) / TICK_RATE))}</b>`);
    if (b.disabledUntil > s.state.tick) stats.push(`<span style="color:#c084fc">${t('sel.pestilence', { n: Math.ceil((b.disabledUntil - s.state.tick) / TICK_RATE) })}</span>`);
    c.appendChild(el('div', 'stats', stats.map((x) => `<span>${x}</span>`).join('')));
    if (b.owner === s.local && b.queue.length > 0) {
      const q = el('div', 'queue');
      b.queue.forEach((item, i) => {
        const icon = item.kind === 'unit' ? UNITS[item.id].icon : item.kind === 'tech' ? TECHS[item.id].icon : item.kind === 'scholar' ? '🧑‍🏫' : AGES[owner.age + 1]?.icon ?? '⬆';
        const name = item.kind === 'unit' ? UNITS[item.id].name : item.kind === 'tech' ? TECHS[item.id].name : item.kind === 'scholar' ? t('cmd.scholar') : `${AGES[owner.age + 1]?.name ?? ''}`;
        const qi = el('div', 'qi', `${icon}<div class="prog" style="width:${i === 0 ? Math.round((item.elapsed / item.total) * 100) : 0}%"></div>`);
        qi.dataset.tip = `<b>${name}</b><div class="desc">${i === 0 ? t('sel.remaining', { n: Math.ceil(item.total - item.elapsed) }) : t('sel.queued')} · ${t('sel.clickCancel')}</div>`;
        qi.addEventListener('click', () => { s.issue({ type: 'cancel', player: s.local, buildingId: b.id, index: i, itemId: item.uid }); });
        q.appendChild(qi);
      });
      c.appendChild(q);
    } else c.appendChild(el('div', 'desc', def.desc));
    return c;
  }

  // ---------------- Comandos ----------------
  refreshCommands(force: boolean) {
    const s = this.session; if (!s) return;
    const p = s.player;
    const units = s.ownSelectedUnits(); const b = s.ownSelectedBuilding();
    const key = `${[...s.selection].join(',')}|${s.ui.mode}|${s.ui.placeType}|${p.age}|${p.techs.length}|${p.minorGods.length}|${b?.garrison.length ?? 0}|${Object.values(p.resources).map((v) => Math.floor(v / 25)).join(',')}|${p.pop}/${p.popCap}|${b?.queue.length}|${b?.scholars}`;
    if (!force && key === this.lastCmdKey) return;
    this.lastCmdKey = key;
    this.cmdPanel.innerHTML = '';
    const add = (icon: string, label: string, tip: string, hk: string | null, onClick: (() => void) | null, opts: { disabled?: boolean; active?: boolean; used?: boolean } = {}) => {
      const btn = el('button', `cmd ${opts.active ? 'active' : ''} ${opts.used ? 'used' : ''}`, `<span class="ic">${icon}</span><span class="lbl">${label}</span>${hk ? `<span class="hk">${hk}</span>` : ''}`) as HTMLButtonElement;
      btn.dataset.tip = tip; btn.disabled = !!opts.disabled;
      if (onClick) btn.addEventListener('click', () => { if (btn.disabled) return; onClick(); });
      this.cmdPanel.appendChild(btn);
      return btn;
    };
    if (units.length > 0) {
      const villagers = units.filter((u) => UNITS[u.type].canBuild);
      const military = units.filter((u) => !UNITS[u.type].canBuild && UNITS[u.type].attack > 0);
      if (villagers.length > 0 && military.length === 0) {
        for (const type of BUILD_MENU) {
          const def = BUILDINGS[type];
          if (def.age > p.age && def.age > p.age + 1) continue;
          const cost = getBuildingStats(s.state, p, type).cost;
          const lim = buildingLimitOk(s.state, p, type);
          const reasons: string[] = [];
          if (def.age > p.age) reasons.push(t('cmd.requiresAge', { age: AGES[def.age].name }));
          if (!lim.ok) reasons.push(lim.reason ?? '');
          if (!canAfford(p, cost)) reasons.push(t('cmd.noResources'));
          const tip = `${t('cmd.buildTipB', { name: def.name, cost: fmtCost(cost, p), desc: def.desc })}${reasons.length ? `<div style="color:#ef4444;margin-top:4px">${reasons.join(' · ')}</div>` : ''}`;
          add(def.icon, def.name, tip, def.hotkey ?? null, () => this.startPlacement(type), { disabled: reasons.length > 0, active: s.ui.mode === 'place' && s.ui.placeType === type });
        }
        add('✋', t('cmd.stop'), t('cmd.stopTipV'), '⇧S', () => { s.issue({ type: 'stop', player: s.local, ids: units.map((u) => u.id) }); });
      } else {
        const ids = units.map((u) => u.id);
        add('⚔️', t('cmd.attackMove'), t('cmd.attackMoveTip'), 'A', () => { s.ui.mode = 'attackMove'; document.body.className = 'cur-attack'; this.lastCmdKey = ''; this.refreshCommands(true); }, { active: s.ui.mode === 'attackMove' });
        const seenAb = new Set<string>();
        for (const h of units) {
          const abId = UNITS[h.type].ability; if (!abId || seenAb.has(h.type)) continue; seenAb.add(h.type);
          const ab = ABILITIES[abId]; const left = Math.ceil((h.abilityReadyAt - s.state.tick) / TICK_RATE);
          add(ab.icon, ab.name, `<b>${ab.icon} ${ab.name}</b> · ${UNITS[h.type].name}<div class="desc">${ab.desc}</div><div>${left > 0 ? t('cmd.abilityCooldown', { s: left }) : t('cmd.abilityReady')}</div>`, 'Q', () => { this.issueChecked({ type: 'ability', player: s.local, unitId: h.id }); this.lastCmdKey = ''; }, { disabled: left > 0 });
        }
        add('✋', t('cmd.stop'), t('cmd.stopTip'), 'S', () => { s.issue({ type: 'stop', player: s.local, ids }); });
        if (units.length >= 4) for (const f of FORMATIONS) add(FORMATION_ICONS[f], t(`formation.${f}`), `<b>${t(`formation.${f}`)}</b><div class="desc">${t(`formation.${f}Tip`)}</div>`, null, () => { s.ui.formation = f; this.lastCmdKey = ''; this.refreshCommands(true); }, { active: s.ui.formation === f });
        const stance = units[0].stance;
        for (const k of Object.keys(STANCES)) add(k === 'aggressive' ? '🔥' : k === 'defensive' ? '🛡️' : '🕊️', t(`stance.${k}`), `<b>${t('cmd.stance', { name: t(`stance.${k}`) })}</b><div class="desc">${t(`cmd.stanceTip.${k}`)}</div>`, null, () => { s.issue({ type: 'stance', player: s.local, ids, stance: k as Stance }); this.lastCmdKey = ''; }, { active: stance === k });
        if (villagers.length > 0) add('🏗️', t('cmd.build'), t('cmd.buildTip'), null, () => { s.select(villagers.map((u) => u.id)); });
      }
      if (units.some((u) => ['civilian', 'infantry', 'archer', 'skirmisher', 'hero'].some((t) => UNITS[u.type].tags.includes(t)))) add('🏰', t('cmd.garrison'), t('cmd.garrisonTip'), null, () => this.garrisonNearest(units));
      add('🗑️', t('cmd.dismiss'), t('cmd.dismissTip'), 'Del', () => { s.issue({ type: 'delete', player: s.local, ids: units.map((u) => u.id) }); });
      return;
    }
    if (b) {
      const def = BUILDINGS[b.type];
      if (!b.complete) { add('❌', t('cmd.cancelBuild'), t('cmd.cancelBuildTip'), null, () => { s.issue({ type: 'cancel', player: s.local, buildingId: b.id, index: -1 }); s.select([]); }); return; }
      if (def.trains) for (const ut of def.trains) {
        const ud = UNITS[ut];
        if (ud.age > p.age + 1) continue;
        if (ud.god) { const major = MAJOR_GODS[p.god]; const ok = major.mythUnit === ut || p.minorGods.some((g) => MINOR_GODS[g].mythUnit === ut) || ud.god === p.god; if (!ok) continue; }
        const st = getUnitStats(s.state, p, ut);
        const c = canTrain(s.state, p, b, ut);
        const tip = `${t('cmd.trainTip', { name: ud.name, cost: fmtCost(st.cost, p), time: Math.round(st.trainTime), pop: ud.pop, desc: ud.desc, hp: st.hp, attack: st.attack, range: st.range >= 1.6 ? st.range : t('sel.melee') })}${c.ok ? '' : `<div style="color:#ef4444;margin-top:4px">${c.reason ?? (ud.age > p.age ? t('cmd.requiresAge', { age: AGES[ud.age].name }) : '')}</div>`}`;
        add(ud.icon, ud.name, tip, ud.hotkey ?? null, () => { const r = this.issueChecked({ type: 'train', player: s.local, buildingId: b.id, unit: ut }); if (r) this.audio.play('command'); }, { disabled: !c.ok });
      }
      if (def.scholars) {
        const c = b.scholars >= MAX_SCHOLARS ? t('cmd.maxReached') : !canAfford(p, SCHOLAR_COST) ? t('cmd.noResources') : '';
        add('🧑‍🏫', t('cmd.scholar'), `${t('cmd.scholarTip', { cost: fmtCost(SCHOLAR_COST, p), max: MAX_SCHOLARS })}${c ? `<div style="color:#ef4444">${c}</div>` : ''}`, 'Q', () => this.issueChecked({ type: 'hireScholar', player: s.local, buildingId: b.id }), { disabled: !!c });
      }
      for (const tech of Object.values(TECHS)) {
        if (tech.building !== b.type || p.techs.includes(tech.id)) continue;
        if (tech.age > p.age + 1) continue;
        if (tech.god && !p.minorGods.includes(tech.god) && p.god !== tech.god) continue;
        if (tech.prereq.some((pr) => !p.techs.includes(pr))) continue;   // mostra só o próximo nível de cada linha
        const cost = techCost(p, tech.id);
        const c = canResearch(s.state, p, b, tech.id);
        const tip = `${t('cmd.techTip', { name: tech.name, cost: fmtCost(cost, p), time: tech.time, desc: tech.desc })}${c.ok ? '' : `<div style="color:#ef4444;margin-top:4px">${c.reason ?? (tech.age > p.age ? t('cmd.requiresAge', { age: AGES[tech.age].name }) : '')}</div>`}`;
        add(tech.icon, tech.name, tip, null, () => { if (this.issueChecked({ type: 'research', player: s.local, buildingId: b.id, tech: tech.id })) this.audio.play('command'); }, { disabled: !c.ok });
      }
      if (b.type === 'town_center') {
        const adv = canAdvanceAge(s.state, p, b);
        add('⬆', p.age < AGES.length - 1 ? AGES[p.age + 1].short : t('cmd.ageMax'), this.ageBtn.dataset.tip ?? '', null, () => this.tryAdvanceAge(b), { disabled: !adv.ok });
      }
      if (def.trade) {
        for (const r of ['food', 'wood'] as ResourceType[]) {
          const tax = 0.3 * p.mods.player.tradeTax;
          const buy = Math.round(p.prices[r] * (1 + tax)), sell = Math.round(p.prices[r] * (1 - tax));
          add(`🛒`, t('cmd.buy', { res: t(`res.${r}`) }), t('cmd.buyTip', { res: t(`res.${r}`), price: buy }), null, () => { if (this.issueChecked({ type: 'trade', player: s.local, action: 'buy', resource: r })) this.audio.play('coin'); }, { disabled: p.resources.gold < buy });
          add(`💰`, t('cmd.sell', { res: t(`res.${r}`) }), t('cmd.sellTip', { res: t(`res.${r}`), price: sell }), null, () => { if (this.issueChecked({ type: 'trade', player: s.local, action: 'sell', resource: r })) this.audio.play('coin'); }, { disabled: p.resources[r] < 100 });
        }
      }
      if (def.worship) add('🚪', t('cmd.releaseWorship'), t('cmd.releaseWorshipTip'), null, () => s.issue({ type: 'ungarrison', player: s.local, buildingId: b.id }));
      if (def.garrison) add('🚪', t('cmd.release', { n: b.garrison.length }), t('cmd.releaseTip'), 'U', () => s.issue({ type: 'ungarrison', player: s.local, buildingId: b.id }), { disabled: b.garrison.length === 0 });
      if (def.trains || def.scholars) add('🚩', t('cmd.rally'), t('cmd.rallyTip'), 'R', () => { s.ui.mode = 'rally'; document.body.className = 'cur-attack'; }, { active: s.ui.mode === 'rally' });
      add('🗑️', t('cmd.demolish'), t('cmd.demolishTip'), 'Del', () => { s.issue({ type: 'delete', player: s.local, ids: [b.id] }); s.select([]); });
    }
  }

  garrisonNearest(units: Unit[]) {
    const s = this.session!;
    const cx = units.reduce((a, u) => a + u.x, 0) / units.length, cy = units.reduce((a, u) => a + u.y, 0) / units.length;
    let best: Building | null = null, bestD = Infinity;
    for (const b of s.state.buildings.values()) {
      if (b.dead || !b.complete || s.state.players[b.owner].team !== s.player.team) continue;
      const cap = BUILDINGS[b.type].garrison ?? 0; if (!cap || b.garrison.length >= cap) continue;
      const d = (b.x - cx) ** 2 + (b.y - cy) ** 2; if (d < bestD) { bestD = d; best = b; }
    }
    if (!best) { this.toast(t('msg.noShelter'), 'warn'); return; }
    s.issue({ type: 'garrison', player: s.local, ids: units.map((u) => u.id), targetId: best.id });
    this.audio.play('command');
  }

  issueChecked(cmd: Parameters<Session['issue']>[0]): boolean {
    const s = this.session!;
    // Validação imediata para dar feedback (o comando real roda no próximo tick)
    const p = s.player;
    let check: { ok: boolean; reason?: string } = { ok: true };
    if (cmd.type === 'train') { const b = s.state.buildings.get(cmd.buildingId); if (b) check = canTrain(s.state, p, b, cmd.unit); }
    else if (cmd.type === 'research') { const b = s.state.buildings.get(cmd.buildingId); if (b) check = canResearch(s.state, p, b, cmd.tech); }
    else if (cmd.type === 'hireScholar') { if (!canAfford(p, SCHOLAR_COST)) check = { ok: false, reason: t('err.noResources') }; }
    if (!check.ok) { this.toast(check.reason ?? t('msg.cannot'), 'warn'); this.audio.play('error'); return false; }
    s.issue(cmd);
    return true;
  }

  startPlacement(type: string) {
    const s = this.session!;
    const def = BUILDINGS[type];
    if (def.age > s.player.age) { this.toast(t('err.requiresAge', { age: AGES[def.age].name }), 'warn'); return; }
    const lim = buildingLimitOk(s.state, s.player, type);
    if (!lim.ok) { this.toast(lim.reason ?? '', 'warn'); return; }
    const cost = getBuildingStats(s.state, s.player, type).cost;
    if (!canAfford(s.player, cost)) { this.toast(t('msg.missing', { list: missingResources(s.player, cost).map((r) => t(`res.${r}`)).join(', ') }), 'warn'); this.audio.play('error'); return; }
    s.ui.mode = 'place'; s.ui.placeType = type; s.ui.powerId = null; s.ui.wallStart = null;
    document.body.className = 'cur-place';
    this.lastCmdKey = ''; this.refreshCommands(true);
  }

  canPlaceHere(type: string, tx: number, ty: number): boolean { const s = this.session!; return canPlaceBuilding(s.state, s.player, type, tx, ty).ok; }

  tryAdvanceAge(tcArg?: Building) {
    const s = this.session!; const p = s.player;
    const tc = tcArg ?? [...s.state.buildings.values()].find((b) => b.owner === p.id && b.type === 'town_center' && b.complete && b.queue.length === 0) ?? [...s.state.buildings.values()].find((b) => b.owner === p.id && b.type === 'town_center' && b.complete);
    if (!tc) { this.toast(t('msg.needTC'), 'warn'); return; }
    const adv = canAdvanceAge(s.state, p, tc);
    if (!adv.ok) { this.toast(adv.reason ?? t('msg.cantAdvance'), 'warn'); this.audio.play('error'); return; }
    if (!adv.minorOptions || adv.minorOptions.length === 0) { s.issue({ type: 'advanceAge', player: s.local, buildingId: tc.id }); this.toast(t('msg.advanceStarted', { age: AGES[p.age + 1].name }), 'gold'); return; }
    this.showMinorGodChoice(adv.minorOptions, (god) => { s.issue({ type: 'advanceAge', player: s.local, buildingId: tc.id, minorGod: god }); this.toast(t('msg.advanceStartedGod', { age: AGES[p.age + 1].name, god: MINOR_GODS[god].name }), 'gold'); });
  }

  // ---------------- Modais ----------------
  get chatOpen() { return !this.chatEl.classList.contains('hidden'); }
  openChat() { if (!this.onChat) return; this.chatEl.classList.remove('hidden'); this.chatEl.value = ''; this.chatEl.focus(); }
  closeChat() { this.chatEl.classList.add('hidden'); this.chatEl.blur(); }

  showModal(html: string, dismissable = true) { this.modal.innerHTML = html; this.modalBack.classList.remove('hidden'); this.modalDismissable = dismissable; }
  hideModal() {
    this.modalBack.classList.add('hidden');
    if (this.menuOpen) { this.menuOpen = false; if (this.session) this.session.paused = this.pausedBeforeMenu; }   // Esc ou clique fora do menu: volta ao estado anterior
  }
  get modalOpen() { return !this.modalBack.classList.contains('hidden'); }

  showMinorGodChoice(options: string[], cb: (god: string) => void) {
    const s = this.session!;
    const cards = options.map((g) => {
      const d = MINOR_GODS[g]; const pw = POWERS[d.power]; const mu = UNITS[d.mythUnit];
      return `<div class="card" data-god="${g}"><h3>${d.icon} ${d.name}</h3><small>${d.title}</small><ul><li><b>${t('modal.power')}:</b> ${pw.icon} ${pw.name} — ${pw.desc}</li><li><b>${t('modal.creature')}:</b> ${mu.icon} ${mu.name} — ${mu.desc}</li>${d.techs.map((x) => `<li><b>${t('modal.tech')}:</b> ${TECHS[x].icon} ${TECHS[x].name} — ${TECHS[x].desc}</li>`).join('')}</ul></div>`;
    }).join('');
    this.showModal(`<h2>${AGES[s.player.age + 1].icon} ${t('modal.advanceTo', { age: AGES[s.player.age + 1].name })}</h2><p>${t('modal.chooseMinor')}</p><div class="row">${cards}</div><div class="actions"><button class="btn" id="m-cancel">${t('modal.cancel')}</button></div>`);
    this.modal.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => { const g = (c as HTMLElement).dataset.god!; this.hideModal(); cb(g); }));
    this.modal.querySelector('#m-cancel')!.addEventListener('click', () => this.hideModal());
  }

  showMenu() {
    const s = this.session; if (!s) return;
    if (!this.menuOpen) this.pausedBeforeMenu = s.paused;
    this.menuOpen = true;
    s.paused = true;
    const opts = this.cb.getOptions?.();
    this.showModal(`<h2>${t('menu.title')}</h2>
      <div class="row" style="flex-direction:column">
        <button class="btn primary" id="m-continue">${t('menu.continue')}</button>
        <button class="btn" id="m-save">${t('menu.save')}</button>
        <button class="btn" id="m-load" ${this.cb.hasSave() ? '' : 'disabled'}>${t('menu.load')}</button>
        <div style="display:flex;gap:8px"><button class="btn" id="m-export" style="flex:1">📤 → arquivo / file</button><button class="btn" id="m-import" style="flex:1">📥 ← arquivo / file</button></div>
        <button class="btn" id="m-help">${t('menu.help')}</button>
        <button class="btn" id="m-enc">${t('menu.enc')}</button>
        <div style="margin-top:8px">${opts ? optionsHTML(opts) : ''}</div>
        <label style="font-size:12px;color:#9aa5b8"><input type="checkbox" id="m-ranges" ${s.ui.showRanges ? 'checked' : ''}> ${t('menu.ranges')}</label>
        <button class="btn" id="m-exportmap">${t('menu.exportMap')}</button>
        <button class="btn" id="m-diag">${t('menu.diagnostic')}</button>
        <button class="btn danger" id="m-quit">${t('menu.quit')}</button>
      </div>`);
    const q = (id: string) => this.modal.querySelector(id) as HTMLElement;
    q('#m-continue').addEventListener('click', () => { this.menuOpen = false; this.hideModal(); s.paused = false; });
    q('#m-save').addEventListener('click', () => { this.cb.onSave(); this.menuOpen = false; this.hideModal(); s.paused = false; });
    q('#m-load').addEventListener('click', () => { this.hideModal(); this.cb.onLoad(); });
    q('#m-help').addEventListener('click', () => this.showHelp());
    q('#m-enc').addEventListener('click', () => this.showEncyclopedia());
    if (opts) bindOptions(this.modal, opts, () => this.showMenu());
    q('#m-ranges').addEventListener('change', (e) => { s.ui.showRanges = (e.target as HTMLInputElement).checked; });
    q('#m-diag').addEventListener('click', () => { this.cb.onDiagnostic?.(); });
    q('#m-exportmap').addEventListener('click', () => { this.cb.onExportMap?.(); });
    q('#m-export').addEventListener('click', () => { this.cb.onExport?.(); });
    q('#m-import').addEventListener('click', () => { this.hideModal(); this.cb.onImport?.(); });
    q('#m-quit').addEventListener('click', () => { if (confirm(t('menu.quitConfirm'))) { this.hideModal(); this.cb.onQuit(); } });
    this.modalDismissable = true;
  }

  showHelp() {
    this.showModal(`<h2>${t('help.title')}</h2>
      <h3>${t('help.goalTitle')}</h3><p>${t('help.goal', { min: WONDER_VICTORY_SECONDS / 60 })}</p>
      <h3>${t('help.econTitle')}</h3><p>${t('help.econ')}</p>
      <h3>${t('help.bordersTitle')}</h3><p>${t('help.borders')}</p>
      <h3>${t('help.combatTitle')}</h3><p>${t('help.combat')}</p>
      <h3>${t('help.controlsTitle')}</h3><p>${t('help.controls')} <button class="btn" id="m-hotkeys">${t('menu.hotkeys')}</button></p>
      <div class="actions"><button class="btn primary" id="m-close">${t('modal.close')}</button></div>`);
    this.modal.querySelector('#m-close')!.addEventListener('click', () => this.hideModal());
    this.modal.querySelector('#m-hotkeys')!.addEventListener('click', () => this.showHotkeys());
  }

  /** Tela de atalhos: controles gerais (traduzidos) e teclas de construção/treino geradas a partir dos dados. */
  showHotkeys() {
    const k = (...keys: string[]) => keys.map((x) => `<kbd>${x}</kbd>`).join(' ');
    const general: [string, string][] = [
      [`${k(t('hk.k.click'))} · ${k(t('hk.k.drag'))} · ${k(t('hk.k.dbl'))} · ${k('Ctrl')}+${k(t('hk.k.click'))}`, t('hk.select')],
      [`${k(t('hk.k.right'))} · ${k('Shift')}+${k(t('hk.k.right'))}`, t('hk.right')],
      [k('A'), t('hk.attackMove')], [k('S'), t('hk.stop')], [k('G'), t('hk.garrison')], [k('Delete'), t('hk.delete')],
      [k('Tab'), t('hk.tab')], [`${k('Ctrl')}+${k('A')}`, t('hk.selectMilitary')],
      [`${k('Ctrl')}+${k('1-9')} · ${k('1-9')} · ${k('Alt')}+${k('1-9')}`, t('hk.groups')],
      [`${k('W A S D')} · ${k(t('hk.k.arrows'))} · ${t('hk.k.edge')} · ${k(t('hk.k.middle'))}`, t('hk.camera')], [k(t('hk.k.wheel')), t('hk.zoom')],
      [k('H'), t('hk.home')], [k(t('hk.k.space')), t('hk.lastEvent')], [k('.'), t('hk.idle')],
      [`${k('P')} · ${k('+')} ${k('-')}`, t('hk.speed')], [`${k('Ctrl')}+${k('M')}`, t('hk.mute')],
      [`${k('F1')} ${k('F2')} ${k('F5')} ${k('F9')} ${k('F11')}`, t('hk.fkeys')], [k('Esc'), t('hk.esc')],
    ];
    const buildingSel: [string, string][] = [[k('R'), t('hk.rally')], [k('U'), t('hk.release')], [k('Q'), t('hk.scholar')]];
    const builds = Object.entries(BUILDINGS).filter(([, b]) => b.hotkey && !b.notBuildable).sort((a, b) => a[1].age - b[1].age || a[1].hotkey!.localeCompare(b[1].hotkey!));
    const byKey = new Map<string, string[]>();
    for (const [id, b] of builds) byKey.set(b.hotkey!, [...(byKey.get(b.hotkey!) ?? []), id]);
    const buildRows = [...byKey.entries()].map(([key, ids]) => `<tr><td>${k(key)}</td><td>${ids.map((id) => `${BUILDINGS[id].icon} ${BUILDINGS[id].name} <small style="color:#9aa5b8">(${AGES[BUILDINGS[id].age].short})</small>`).join(' · ')}${ids.length > 1 ? ` <small style="color:#9aa5b8">— ${t('hk.wonderCycle')}</small>` : ''}</td></tr>`).join('');
    const trainRows = Object.entries(BUILDINGS).filter(([, b]) => b.trains && b.trains.length > 0).map(([, b]) => `<tr><td>${b.icon} ${b.name}</td><td>${b.trains!.filter((u) => UNITS[u].hotkey).map((u) => `${k(UNITS[u].hotkey!)} ${UNITS[u].icon} ${UNITS[u].name}`).join(' · ')}</td></tr>`).join('');
    const rows = (list: [string, string][]) => list.map(([a, b]) => `<tr><td style="white-space:nowrap">${a}</td><td>${b}</td></tr>`).join('');
    this.showModal(`<h2>${t('hk.title')}</h2>
      <h3>${t('hk.general')}</h3><table>${rows(general)}</table>
      <h3>${t('hk.buildingSel')}</h3><table>${rows(buildingSel)}</table>
      <h3>${t('hk.build')}</h3><table>${buildRows}</table>
      <h3>${t('hk.train')}</h3><table>${trainRows}</table>
      <div class="actions"><button class="btn primary" id="m-close">${t('modal.close')}</button></div>`);
    this.modal.querySelector('#m-close')!.addEventListener('click', () => this.hideModal());
  }

  showEncyclopedia(tab = 'units') {
    const tabs = [['units', t('enc.units')], ['buildings', t('enc.buildings')], ['techs', t('enc.techs')], ['gods', t('enc.gods')], ['ages', t('enc.ages')]];
    let body = '';
    if (tab === 'units') body = `<table><tr><th>${t('enc.units')}</th><th>${t('enc.cost')}</th><th>${t('sel.hp')}</th><th>${t('sel.attack')}</th><th>${t('sel.armor')}</th><th>${t('sel.range')}</th><th>${t('sel.speed')}</th><th>${t('over.age')}</th><th>${t('enc.where')}</th><th>${t('enc.description')}</th></tr>${Object.values(UNITS).filter((u) => u.building || u.tags.includes('titan')).map((u) => `<tr><td>${u.icon} ${u.name}</td><td>${fmtCost(u.cost as Record<string, number>) || '—'}</td><td>${u.hp}</td><td>${u.attack} ${u.attackType}</td><td>${Math.round(u.armor.hack * 100)}/${Math.round(u.armor.pierce * 100)}/${Math.round(u.armor.crush * 100)}</td><td>${u.range >= 1.6 ? u.range : t('sel.melee')}</td><td>${u.speed}</td><td>${AGES[u.age].short}</td><td>${u.building ? BUILDINGS[u.building].name : t('enc.gate')}${u.god ? ` (${(MINOR_GODS[u.god] ?? MAJOR_GODS[u.god]).name})` : ''}</td><td>${u.desc}</td></tr>`).join('')}</table>`;
    else if (tab === 'buildings') body = `<table><tr><th>${t('enc.buildings')}</th><th>${t('enc.cost')}</th><th>${t('sel.hp')}</th><th>${t('enc.size')}</th><th>${t('over.age')}</th><th>${t('enc.description')}</th></tr>${Object.values(BUILDINGS).filter((b) => !b.notBuildable).map((b) => `<tr><td>${b.icon} ${b.name}</td><td>${fmtCost(b.cost as Record<string, number>)}</td><td>${b.hp}</td><td>${b.w}×${b.h}</td><td>${AGES[b.age].short}</td><td>${b.desc}</td></tr>`).join('')}</table>`;
    else if (tab === 'techs') body = `<table><tr><th>${t('modal.tech')}</th><th>${t('enc.buildings')}</th><th>${t('enc.cost')}</th><th>${t('over.age')}</th><th>${t('enc.effect')}</th></tr>${Object.values(TECHS).map((x) => `<tr><td>${x.icon} ${x.name}${x.god ? ` <small>(${MINOR_GODS[x.god].name})</small>` : ''}</td><td>${BUILDINGS[x.building].name}</td><td>${fmtCost(x.cost as Record<string, number>)}</td><td>${AGES[x.age].short}</td><td>${x.desc}</td></tr>`).join('')}</table>`;
    else if (tab === 'gods') body = Object.values(MAJOR_GODS).map((g) => `<h3>${g.icon} ${g.name} — ${g.title}</h3><p>${g.desc}</p><ul>${g.perks.map((x) => `<li>${x}</li>`).join('')}</ul><p><b>${t('enc.minorGods')}:</b> ${g.minorGods.map((pair, i) => `${AGES[i + 1].short}: ${pair.map((m) => `${MINOR_GODS[m].icon} ${MINOR_GODS[m].name}`).join(` ${t('enc.or')} `)}`).join(' · ')}</p>`).join('') + `<h3>${t('enc.minorGods')}</h3><table><tr><th>${t('enc.god')}</th><th>${t('over.age')}</th><th>${t('modal.power')}</th><th>${t('modal.creature')}</th><th>${t('enc.techs')}</th></tr>${Object.values(MINOR_GODS).map((m) => `<tr><td>${m.icon} ${m.name}<br><small>${m.title}</small></td><td>${AGES[m.age].short}</td><td>${POWERS[m.power].icon} ${POWERS[m.power].name}<br><small>${POWERS[m.power].desc}</small></td><td>${UNITS[m.mythUnit].icon} ${UNITS[m.mythUnit].name}</td><td>${m.techs.map((x) => `${TECHS[x].icon} ${TECHS[x].name}`).join('<br>')}</td></tr>`).join('')}</table>`;
    else body = `<table><tr><th>${t('over.age')}</th><th>${t('enc.cost')}</th><th>${t('enc.requirements')}</th><th>${t('enc.description')}</th></tr>${AGES.map((a) => `<tr><td>${a.icon} ${a.name}</td><td>${fmtCost(a.cost as Record<string, number>) || '—'}</td><td>${a.requires.building ? BUILDINGS[a.requires.building].name : ''} ${a.requires.techCount ? t('enc.academyLines', { n: a.requires.techCount, lines: ACADEMY_LINES.join(', ') }) : ''}</td><td>${a.desc}</td></tr>`).join('')}</table>`;
    this.showModal(`<h2>${t('enc.title')}</h2><div class="tabs">${tabs.map(([k, l]) => `<button class="btn ${k === tab ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div style="max-height:60vh;overflow:auto">${body}</div><div class="actions"><button class="btn primary" id="m-close">${t('modal.close')}</button></div>`);
    this.modal.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => this.showEncyclopedia((b as HTMLElement).dataset.tab!)));
    this.modal.querySelector('#m-close')!.addEventListener('click', () => this.hideModal());
  }

  showGameOver() {
    const s = this.session!; const st = s.state;
    if (st.scenario) { this.showScenarioEnd(); return; }
    const won = st.winner >= 0 && st.players[st.winner].team === s.player.team;
    this.audio.play(won ? 'victory' : 'defeat');
    const rows = st.players.map((p) => `<tr><td style="color:#${p.color.toString(16).padStart(6, '0')}">${p.name}${st.winner >= 0 && st.players[st.winner].team === p.team ? ' 🏆' : ''}</td><td>${p.team + 1}</td><td>${AGES[p.age].short}</td><td>${p.stats.kills}</td><td>${p.stats.losses}</td><td>${p.stats.razed}</td><td>${p.stats.buildingsBuilt}</td><td>${p.stats.unitsTrained}</td><td>${Math.round(p.stats.gathered.food + p.stats.gathered.wood + p.stats.gathered.gold)}</td><td>${p.techs.length}</td><td>${p.territoryTiles}</td></tr>`).join('');
    this.showModal(`<h2>${won ? t('over.victory') : st.winner === -1 ? t('over.draw') : t('over.defeat')}</h2><p>${st.events.filter((e) => e.type === 'victory').map((e) => e.text).join(' ') || ''} ${t('over.time', { time: fmtTime(st.time) })}</p>
      <table><tr><th>${t('over.player')}</th><th>${t('over.team')}</th><th>${t('over.age')}</th><th>${t('over.kills')}</th><th>${t('over.losses')}</th><th>${t('over.razed')}</th><th>${t('over.built')}</th><th>${t('over.trained')}</th><th>${t('over.gathered')}</th><th>${t('over.techs')}</th><th>${t('over.territory')}</th></tr>${rows}</table>
      <div class="actions"><button class="btn" id="m-continue">${t('over.watch')}</button><button class="btn primary" id="m-quit">${t('over.menu')}</button></div>`, false);
    this.modal.querySelector('#m-continue')!.addEventListener('click', () => this.hideModal());
    this.modal.querySelector('#m-quit')!.addEventListener('click', () => { this.hideModal(); this.cb.onQuit(); });
  }

  showScenarioEnd() {
    const s = this.session!; const st = s.state; const sc = st.scenario!; const def = getScenario(sc.id)!;
    const won = sc.outcome === 'victory';
    this.audio.play(won ? 'victory' : 'defeat');
    if (won) { try { const prog = JSON.parse(localStorage.getItem('aoe_campaign') ?? '{"completed":[]}'); if (!prog.completed.includes(sc.id)) prog.completed.push(sc.id); if (st.config.campaignDifficulty === 'hard') { prog.hard = prog.hard ?? []; if (!prog.hard.includes(sc.id)) prog.hard.push(sc.id); } localStorage.setItem('aoe_campaign', JSON.stringify(prog)); } catch { /* ignore */ } }
    const text = won ? (def.outro ?? [t('mission.done')]).map((x) => `<p>${x}</p>`).join('') : `<p>${t('mission.failedText')}</p>`;
    this.showModal(`<h2>${won ? t('mission.done') : t('mission.failed')} — ${def.title}</h2>${text}<p><small>${t('mission.stats', { time: fmtTime(st.time), kills: s.player.stats.kills, losses: s.player.stats.losses })}</small></p>
      <div class="actions"><button class="btn" id="m-continue">${t('mission.continue')}</button>${won && this.cb.onNextMission ? `<button class="btn primary" id="m-next">${t('mission.next')}</button>` : ''}<button class="btn ${won ? '' : 'primary'}" id="m-quit">${t('over.menu')}</button></div>`, false);
    this.modal.querySelector('#m-continue')!.addEventListener('click', () => this.hideModal());
    this.modal.querySelector('#m-next')?.addEventListener('click', () => { this.hideModal(); this.cb.onNextMission?.(sc.id); });
    this.modal.querySelector('#m-quit')!.addEventListener('click', () => { this.hideModal(); this.cb.onQuit(); });
  }

  showIntro(scenarioId: string, onStart: () => void) {
    const def = getScenario(scenarioId); if (!def) { onStart(); return; }
    this.showModal(`<h2>${def.icon} ${def.title}</h2><p style="color:#f2c14e">${def.subtitle}</p>${def.intro.map((x) => `<p>${x}</p>`).join('')}<h3>${t('mission.objectives')}</h3><ul>${def.objectives.filter((o) => !o.hidden).map((o) => `<li>${o.text}${o.optional ? ` <small>${t('mission.optional')}</small>` : ''}</li>`).join('')}</ul>${def.hints ? `<h3>${t('mission.hints')}</h3><ul>${def.hints.map((h) => `<li>${h}</li>`).join('')}</ul>` : ''}<div class="actions"><button class="btn primary" id="m-go">${t('mission.start')}</button></div>`, false);
    this.modal.querySelector('#m-go')!.addEventListener('click', () => { this.hideModal(); onStart(); });
  }

  describeEntityTip(e: Unit | Building): string {
    const def = e.kind === 'unit' ? UNITS[e.type] : BUILDINGS[e.type];
    const owner = this.session!.state.players[e.owner];
    return `<b>${def.icon} ${def.name}</b> <small>${owner.name}</small><div class="desc">${Math.round(e.hp)}/${e.maxHp} ${t('sel.hp').toLowerCase()}</div>`;
  }

  isMilitarySelection(): boolean { const s = this.session; if (!s) return false; return s.ownSelectedUnits().some(isMilitary); }
}
