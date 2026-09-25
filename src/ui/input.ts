// Entrada do jogador: mouse (seleção, ordens contextuais, colocação de edifícios, poderes) e teclado.
import { TILE } from '../core/constants';
import { BUILDINGS, UNITS, POWERS } from '../core/data';
import type { Building, Command, Unit } from '../core/types';
import type { Session } from '../game/session';
import type { Renderer, RenderUI } from '../render/renderer';
import type { HUD } from './hud';
import type { Audio } from '../audio/audio';
import { isMilitary, isEnemy } from '../core/sim/queries';
import { t } from '../i18n';
import { toggleFullscreen } from '../game/display';

const BUILD_HOTKEYS: Record<string, string> = {};
for (const [id, b] of Object.entries(BUILDINGS)) if (b.hotkey && !b.notBuildable) BUILD_HOTKEYS[b.hotkey] = BUILD_HOTKEYS[b.hotkey] ? BUILD_HOTKEYS[b.hotkey] + ',' + id : id;

export class Input {
  private canvas: HTMLCanvasElement;
  private getSession: () => Session | null;
  private renderer: Renderer; private hud: HUD; private audio: Audio;
  private mouse = { x: 0, y: 0, down: false, button: -1, downX: 0, downY: 0, dragging: false, inside: true };
  private keys = new Set<string>();
  private hoverId = -1;
  private lastClick = 0; private lastClickId = -1;
  edgeScroll = true;
  private middleDrag: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement, getSession: () => Session | null, renderer: Renderer, hud: HUD, audio: Audio) {
    this.canvas = canvas; this.getSession = getSession; this.renderer = renderer; this.hud = hud; this.audio = audio;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); const f = e.deltaY < 0 ? 1.15 : 1 / 1.15; this.renderer.cam.zoomAt(e.clientX, e.clientY, f); }, { passive: false });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    document.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    document.addEventListener('mouseenter', () => { this.mouse.inside = true; });
    window.addEventListener('blur', () => this.keys.clear());
    hud.minimap.canvas.addEventListener('pointerdown', (e) => this.onMinimap(e));
    hud.minimap.canvas.addEventListener('pointermove', (e) => { if (e.buttons === 1) this.onMinimap(e); });
  }

  private worldAt(sx: number, sy: number) { return this.renderer.cam.screenToWorld(sx, sy); }
  private overHud(e: PointerEvent): boolean { const t = e.target as HTMLElement; return !(t === this.canvas); }

  private onMinimap(e: PointerEvent) {
    const s = this.getSession(); if (!s) return;
    const w = this.hud.minimap.toWorld(s.state, e.clientX, e.clientY);
    if (e.button === 2 || (e.buttons & 2)) { this.contextCommand(w.x, w.y, e.shiftKey); return; }
    this.renderer.cam.centerOn(w.x, w.y);
  }

  private onDown(e: PointerEvent) {
    const s = this.getSession(); if (!s || this.hud.modalOpen) return;
    if (this.overHud(e)) return;
    this.mouse.down = true; this.mouse.button = e.button; this.mouse.downX = e.clientX; this.mouse.downY = e.clientY; this.mouse.dragging = false;
    if (e.button === 1) { this.middleDrag = { x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
    const w = this.worldAt(e.clientX, e.clientY);
    if (e.button === 0) {
      if (s.ui.mode === 'place' && s.ui.placeType) { this.placeAt(w.x, w.y, e.shiftKey); return; }
      if (s.ui.mode === 'attackMove') { this.attackMove(w.x, w.y, e.shiftKey); this.hud.cancelMode(); return; }
      if (s.ui.mode === 'rally') { const b = s.ownSelectedBuilding(); if (b) s.issue({ type: 'rally', player: s.local, buildingId: b.id, x: w.x, y: w.y }); this.hud.cancelMode(); return; }
      if (s.ui.mode === 'power' && s.ui.powerId) { this.usePowerAt(w.x, w.y); return; }
    } else if (e.button === 2) {
      if (s.ui.mode !== 'normal') { this.hud.cancelMode(); return; }
      this.contextCommand(w.x, w.y, e.shiftKey);
    }
  }

  private onMove(e: PointerEvent) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
    const s = this.getSession(); if (!s) return;
    if (this.middleDrag) { this.renderer.cam.pan(-(e.clientX - this.middleDrag.x), -(e.clientY - this.middleDrag.y)); this.middleDrag = { x: e.clientX, y: e.clientY }; return; }
    if (this.mouse.down && this.mouse.button === 0 && s.ui.mode === 'normal') {
      if (Math.abs(e.clientX - this.mouse.downX) + Math.abs(e.clientY - this.mouse.downY) > 6) this.mouse.dragging = true;
    }
    if (this.mouse.down && this.mouse.button === 0 && s.ui.mode === 'place' && s.ui.placeType === 'wall' && s.ui.wallStart === null) {
      const w = this.worldAt(this.mouse.downX, this.mouse.downY); s.ui.wallStart = { x: Math.floor(w.x), y: Math.floor(w.y) };
    }
    // hover
    if (!this.overHudPoint(e)) {
      const w = this.worldAt(e.clientX, e.clientY);
      const ent = this.renderer.pick(s.state, w.x, w.y, s.local);
      this.hoverId = ent ? ent.id : -1;
      if (ent) this.hud.showTooltip(this.hud.describeEntityTip(ent), e.clientX, e.clientY);
      else {
        const tx = Math.floor(w.x), ty = Math.floor(w.y);
        const nid = tx >= 0 && ty >= 0 && tx < s.state.map.w && ty < s.state.map.h ? s.state.map.nodeAt[ty * s.state.map.w + tx] : -1;
        const vis = s.state.players[s.local].visibility;
        if (nid !== -1 && (s.state.config.revealMap || vis[ty * s.state.map.w + tx] >= 1)) { const n = s.state.map.nodes.get(nid)!; this.hud.showTooltip(`<b>${t(`node.${n.type}`)}</b><div class="desc">${t('node.remaining', { n: Math.round(n.amount) })}</div>`, e.clientX, e.clientY); }
        else this.hud.hideTooltip();
      }
    }
  }
  private overHudPoint(e: PointerEvent): boolean { const t = document.elementFromPoint(e.clientX, e.clientY); return !!t && t !== this.canvas; }

  private onUp(e: PointerEvent) {
    const s = this.getSession();
    if (e.button === 1) { this.middleDrag = null; }
    if (!s || !this.mouse.down) { this.mouse.down = false; return; }
    this.mouse.down = false;
    if (e.button !== 0) return;
    if (s.ui.mode === 'place' && s.ui.placeType === 'wall' && s.ui.wallStart) { const w = this.worldAt(e.clientX, e.clientY); this.placeWallLine(s.ui.wallStart, { x: Math.floor(w.x), y: Math.floor(w.y) }, e.shiftKey); s.ui.wallStart = null; return; }
    if (s.ui.mode !== 'normal') return;
    if (this.mouse.dragging) {
      const a = this.worldAt(Math.min(this.mouse.downX, e.clientX), Math.min(this.mouse.downY, e.clientY));
      const b = this.worldAt(Math.max(this.mouse.downX, e.clientX), Math.max(this.mouse.downY, e.clientY));
      const ids: number[] = [];
      for (const u of s.state.units.values()) if (u.owner === s.local && u.x >= a.x && u.x <= b.x && u.y >= a.y && u.y <= b.y) ids.push(u.id);
      // se houver militares na área, ignora cidadãos (facilita selecionar exército)
      const mil = ids.filter((id) => isMilitary(s.state.units.get(id)!));
      const final = mil.length > 0 && mil.length < ids.length && !e.altKey ? mil : ids;
      if (final.length > 0 || !e.ctrlKey) s.select(final, e.ctrlKey);
      if (final.length > 0) this.audio.play('select');
      this.mouse.dragging = false;
      return;
    }
    if (this.overHud(e)) return;
    const w = this.worldAt(e.clientX, e.clientY);
    const ent = this.renderer.pick(s.state, w.x, w.y, s.local);
    const now = performance.now();
    if (ent) {
      if (now - this.lastClick < 450 && this.lastClickId === ent.id && ent.kind === 'unit' && ent.owner === s.local) {
        // duplo clique: todas do mesmo tipo visíveis na tela
        const vt = this.renderer.cam.visibleTiles();
        const ids: number[] = [];
        for (const u of s.state.units.values()) if (u.owner === s.local && u.type === ent.type && u.x >= vt.x0 && u.x <= vt.x1 && u.y >= vt.y0 && u.y <= vt.y1) ids.push(u.id);
        s.select(ids, e.ctrlKey);
      } else s.select([ent.id], e.ctrlKey);
      this.audio.play('select');
    } else if (!e.ctrlKey) s.select([]);
    this.lastClick = now; this.lastClickId = ent ? ent.id : -1;
  }

  /** Ordem contextual com o botão direito. */
  private contextCommand(x: number, y: number, queue: boolean) {
    const s = this.getSession(); if (!s) return;
    const units = s.ownSelectedUnits();
    const b = s.ownSelectedBuilding();
    if (units.length === 0 && b) { s.issue({ type: 'rally', player: s.local, buildingId: b.id, x, y }); this.audio.play('command'); return; }
    if (units.length === 0) return;
    const ids = units.map((u) => u.id);
    const target = this.renderer.pick(s.state, x, y, s.local);
    const map = s.state.map;
    const tx = Math.floor(x), ty = Math.floor(y);
    const nid = tx >= 0 && ty >= 0 && tx < map.w && ty < map.h ? map.nodeAt[ty * map.w + tx] : -1;
    let cmd: Command | null = null;
    if (target && isEnemy(s.state, s.local, target.owner)) {
      cmd = { type: 'attack', player: s.local, ids, targetId: target.id, queue };
    } else if (nid !== -1) {
      const gatherers = units.filter((u) => UNITS[u.type].canGather);
      if (gatherers.length > 0) cmd = { type: 'gather', player: s.local, ids: gatherers.map((u) => u.id), targetId: nid, queue };
      else cmd = { type: 'move', player: s.local, ids, x, y, queue };
    } else if (target && target.kind === 'building' && target.owner === s.local) {
      const def = BUILDINGS[target.type];
      const builders = units.filter((u) => UNITS[u.type].canBuild);
      const canEnter = units.filter((u) => ['civilian', 'infantry', 'archer', 'skirmisher', 'hero'].some((t) => UNITS[u.type].tags.includes(t)) && !UNITS[u.type].tags.includes('cavalry') && !UNITS[u.type].tags.includes('myth'));
      if (!target.complete && builders.length > 0) cmd = { type: 'build', player: s.local, ids: builders.map((u) => u.id), building: target.type, tx: target.tx, ty: target.ty, queue };
      else if (def.farm && builders.length > 0) cmd = { type: 'gather', player: s.local, ids: builders.map((u) => u.id), targetId: target.id, queue };
      else if (def.worship && builders.length > 0) cmd = { type: 'pray', player: s.local, ids: builders.map((u) => u.id), targetId: target.id, queue };
      else if (def.garrison && canEnter.length > 0 && target.garrison.length < def.garrison) cmd = { type: 'garrison', player: s.local, ids: canEnter.map((u) => u.id), targetId: target.id, queue };
      else if (target.hp < target.maxHp && builders.length > 0) cmd = { type: 'repair', player: s.local, ids: builders.map((u) => u.id), targetId: target.id, queue };
      else cmd = { type: 'move', player: s.local, ids, x, y, queue };
    } else if (target && target.kind === 'building' && s.state.players[target.owner].team === s.player.team && BUILDINGS[target.type].garrison) {
      const canEnter = units.filter((u) => ['civilian', 'infantry', 'archer', 'skirmisher', 'hero'].some((t) => UNITS[u.type].tags.includes(t)) && !UNITS[u.type].tags.includes('cavalry') && !UNITS[u.type].tags.includes('myth'));
      cmd = canEnter.length > 0 ? { type: 'garrison', player: s.local, ids: canEnter.map((u) => u.id), targetId: target.id, queue } : { type: 'move', player: s.local, ids, x, y, queue };
    } else {
      cmd = { type: 'move', player: s.local, ids, x, y, queue };
    }
    if (cmd) {
      if (cmd.type === 'build') { // juntar-se a uma obra existente: usa "repair" (mesmo comportamento para obras incompletas)
        s.issue({ type: 'repair', player: s.local, ids: cmd.ids, targetId: (target as Building).id, queue });
      } else s.issue(cmd);
      this.audio.play('command');
      s.state.effects.push({ type: 'spawn', x, y, ttl: 8, total: 8 });
    }
  }

  private attackMove(x: number, y: number, queue: boolean) {
    const s = this.getSession()!; const ids = s.ownSelectedUnits().map((u) => u.id);
    if (ids.length === 0) return;
    s.issue({ type: 'attackMove', player: s.local, ids, x, y, queue }); this.audio.play('command');
  }

  private placeAt(x: number, y: number, keep: boolean) {
    const s = this.getSession()!; const type = s.ui.placeType!;
    const def = BUILDINGS[type];
    if (type === 'wall') return; // muralha: tratada no arrastar/soltar
    const tx = Math.floor(x - def.w / 2 + 0.5), ty = Math.floor(y - def.h / 2 + 0.5);
    const builders = s.ownSelectedUnits().filter((u) => UNITS[u.type].canBuild).map((u) => u.id);
    if (builders.length === 0) { this.hud.toast(t('msg.selectBuilders'), 'warn'); this.hud.cancelMode(); return; }
    if (!this.hud.canPlaceHere(type, tx, ty)) { this.hud.toast(t('msg.cantBuildHere'), 'warn'); this.audio.play('error'); return; }
    s.issue({ type: 'build', player: s.local, ids: builders, building: type, tx, ty, queue: keep });
    this.audio.play('build');
    if (!keep) this.hud.cancelMode();
  }

  private placeWallLine(a: { x: number; y: number }, b: { x: number; y: number }, keep: boolean) {
    const s = this.getSession()!;
    const builders = s.ownSelectedUnits().filter((u) => UNITS[u.type].canBuild).map((u) => u.id);
    if (builders.length === 0) return;
    const tiles = lineTiles(a, b);
    let n = 0;
    for (const t of tiles) { if (this.hud.canPlaceHere('wall', t.x, t.y)) { s.issue({ type: 'build', player: s.local, ids: builders, building: 'wall', tx: t.x, ty: t.y, queue: n > 0 }); n++; } }
    if (n > 0) this.audio.play('build');
    if (!keep) this.hud.cancelMode();
  }

  private usePowerAt(x: number, y: number) {
    const s = this.getSession()!; const id = s.ui.powerId!; const def = POWERS[id];
    const target = this.renderer.pick(s.state, x, y, s.local);
    if (def.targeting === 'unit') { if (!target || target.kind !== 'unit' || !isEnemy(s.state, s.local, target.owner)) { this.hud.toast(t('msg.chooseEnemyUnit'), 'warn'); return; } s.issue({ type: 'power', player: s.local, power: id, targetId: target.id }); }
    else if (def.targeting === 'building') { if (!target || target.kind !== 'building' || target.owner !== s.local) { this.hud.toast(t('msg.chooseOwnBuilding'), 'warn'); return; } s.issue({ type: 'power', player: s.local, power: id, targetId: target.id }); }
    else s.issue({ type: 'power', player: s.local, power: id, x, y });
    this.audio.play('power');
    this.hud.cancelMode();
  }

  private onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (this.hud.modalOpen) { if (k === 'escape') this.hud.hideModal(); return; }   // também no menu principal (ajuda, atalhos)
    const s = this.getSession(); if (!s) return;
    this.keys.add(k);
    if (k === 'escape') { if (s.ui.mode !== 'normal') this.hud.cancelMode(); else if (s.selection.size > 0) s.select([]); else this.hud.showMenu(); return; }
    if (k === 'f1') { e.preventDefault(); this.hud.showHelp(); return; }
    if (k === 'f11') { e.preventDefault(); toggleFullscreen(); return; }
    if (k === 'f2') { e.preventDefault(); this.hud.showEncyclopedia(); return; }
    if (k === 'p' || k === 'pause') { s.paused = !s.paused; this.hud.refreshTop(); return; }
    if (k === '+' || k === '=') { s.speed = Math.min(3, s.speed + 0.5); this.hud.refreshTop(); return; }
    if (k === '-' || k === '_') { s.speed = Math.max(0.5, s.speed - 0.5); this.hud.refreshTop(); return; }
    if (k === 'm' && e.ctrlKey) { this.audio.toggleMute(); return; }
    if (k === ' ') { e.preventDefault(); if (s.lastEvent) this.renderer.cam.centerOn(s.lastEvent.x, s.lastEvent.y); return; }
    if (k === 'h') { const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center'); if (tc) { this.renderer.cam.centerOn(tc.x, tc.y); if (e.shiftKey) s.select([tc.id]); } return; }
    if (k === '.' || k === ',') { this.hud.selectIdleVillager(); return; }
    if (k === 'delete' || k === 'backspace') { const ids = [...s.selection].filter((id) => { const u = s.state.units.get(id); const b = s.state.buildings.get(id); return (u && u.owner === s.local) || (b && b.owner === s.local); }); if (ids.length) { s.issue({ type: 'delete', player: s.local, ids }); s.select([]); } return; }
    if (/^[1-9]$/.test(k)) { if (e.ctrlKey || e.shiftKey) s.setGroup(Number(k)); else { s.recallGroup(Number(k)); const us = s.selectedUnits(); if (us.length && e.altKey) this.renderer.cam.centerOn(us[0].x, us[0].y); } e.preventDefault(); return; }
    if (k === 'tab') { e.preventDefault(); this.cycleSelectionType(); return; }
    if (k === 'a' && e.ctrlKey) { e.preventDefault(); const vt = this.renderer.cam.visibleTiles(); const ids: number[] = []; for (const u of s.state.units.values()) if (u.owner === s.local && isMilitary(u) && u.x >= vt.x0 && u.x <= vt.x1 && u.y >= vt.y0 && u.y <= vt.y1) ids.push(u.id); if (ids.length) { s.select(ids); this.audio.play('select'); } return; }
    const units = s.ownSelectedUnits(); const b = s.ownSelectedBuilding();
    if (units.length > 0) {
      const villagersOnly = units.every((u) => !!UNITS[u.type].canBuild);
      if (k === 's' && (!villagersOnly || e.shiftKey)) { s.issue({ type: 'stop', player: s.local, ids: units.map((u) => u.id) }); return; }
      if (k === 'a' && !villagersOnly) { s.ui.mode = 'attackMove'; document.body.className = 'cur-attack'; this.hud.refreshCommands(true); return; }
      if (k === 'g' && !villagersOnly) { this.hud.garrisonNearest(units); return; }
      if (villagersOnly && !e.ctrlKey && !e.altKey) {
        const keyU = e.key.toUpperCase();
        const cands = (BUILD_HOTKEYS[keyU] ?? '').split(',').filter(Boolean);
        if (cands.length > 0) {
          // 'M' alterna entre maravilhas
          const type = cands.length === 1 ? cands[0] : cands[(cands.indexOf(s.ui.placeType ?? '') + 1) % cands.length];
          this.hud.startPlacement(type); return;
        }
      }
      if (k === 'a' && villagersOnly) { s.ui.mode = 'attackMove'; document.body.className = 'cur-attack'; return; }
    } else if (b) {
      const def = BUILDINGS[b.type];
      const keyU = e.key.toUpperCase();
      if (def.trains) for (const ut of def.trains) if (UNITS[ut].hotkey === keyU) { this.hud.issueChecked({ type: 'train', player: s.local, buildingId: b.id, unit: ut }); return; }
      if (def.scholars && keyU === 'Q') { this.hud.issueChecked({ type: 'hireScholar', player: s.local, buildingId: b.id }); return; }
      if (keyU === 'R') { s.ui.mode = 'rally'; document.body.className = 'cur-attack'; return; }
      if (keyU === 'U' && (BUILDINGS[b.type].garrison || BUILDINGS[b.type].worship)) { s.issue({ type: 'ungarrison', player: s.local, buildingId: b.id }); return; }
    }
  }

  private cycleSelectionType() {
    const s = this.getSession()!; const units = s.ownSelectedUnits(); if (units.length < 2) return;
    const types = [...new Set(units.map((u) => u.type))]; if (types.length < 2) return;
    const cur = units[0].type; const next = types[(types.indexOf(cur) + 1) % types.length];
    s.select(units.filter((u) => u.type === next).map((u) => u.id));
  }

  /** Rolagem por borda/teclado. */
  update(dtReal: number) {
    const s = this.getSession(); if (!s || this.hud.modalOpen) return;
    const cam = this.renderer.cam; const speed = 900 * dtReal;
    let dx = 0, dy = 0;
    if (this.keys.has('arrowleft') || (this.keys.has('a') && this.keys.size === 1 && s.ownSelectedUnits().length === 0)) dx -= 1;
    if (this.keys.has('arrowright') || (this.keys.has('d') && s.ownSelectedUnits().length === 0)) dx += 1;
    if (this.keys.has('arrowup') || (this.keys.has('w') && s.ownSelectedUnits().length === 0)) dy -= 1;
    if (this.keys.has('arrowdown') || (this.keys.has('s') && s.ownSelectedUnits().length === 0)) dy += 1;
    if (this.edgeScroll && this.mouse.inside && document.hasFocus() && !this.middleDrag) {
      const m = 14; const W = window.innerWidth, H = window.innerHeight;
      if (this.mouse.x <= m) dx -= 1; if (this.mouse.x >= W - m) dx += 1;
      if (this.mouse.y <= m) dy -= 1; if (this.mouse.y >= H - m) dy += 1;
    }
    if (dx || dy) cam.pan(dx * speed, dy * speed);
  }

  renderUI(): RenderUI {
    const s = this.getSession()!;
    const w = this.worldAt(this.mouse.x, this.mouse.y);
    let placement: RenderUI['placement'] = null;
    if (s.ui.mode === 'place' && s.ui.placeType) {
      const def = BUILDINGS[s.ui.placeType];
      if (s.ui.placeType === 'wall' && s.ui.wallStart) {
        const tiles = lineTiles(s.ui.wallStart, { x: Math.floor(w.x), y: Math.floor(w.y) }).map((t) => ({ x: t.x, y: t.y, ok: this.hud.canPlaceHere('wall', t.x, t.y) }));
        placement = { type: 'wall', tx: tiles[0]?.x ?? 0, ty: tiles[0]?.y ?? 0, ok: true, tiles };
      } else {
        const tx = Math.floor(w.x - def.w / 2 + 0.5), ty = Math.floor(w.y - def.h / 2 + 0.5);
        placement = { type: s.ui.placeType, tx, ty, ok: this.hud.canPlaceHere(s.ui.placeType, tx, ty) };
      }
    }
    let dragRect: RenderUI['dragRect'] = null;
    if (this.mouse.down && this.mouse.dragging && this.mouse.button === 0) dragRect = { x0: this.mouse.downX, y0: this.mouse.downY, x1: this.mouse.x, y1: this.mouse.y };
    const power = s.ui.mode === 'power' && s.ui.powerId ? POWERS[s.ui.powerId] : null;
    return { localPlayer: s.local, selection: s.selection, hoverId: this.hoverId, placement, dragRect, showRanges: s.ui.showRanges, powerTarget: power && power.radius ? { radius: power.radius } : null, mouseWorld: w };
  }

  get tileSize() { return TILE; }
  pickUnit(x: number, y: number): Unit | null { const s = this.getSession()!; const e = this.renderer.pick(s.state, x, y, s.local); return e && e.kind === 'unit' ? e : null; }
}

function lineTiles(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let x0 = a.x, y0 = a.y; const x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy; let guard = 0;
  for (;;) {
    out.push({ x: x0, y: y0 });
    if ((x0 === x1 && y0 === y1) || guard++ > 500) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return out;
}
