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
import type { MapEditor } from '../editor/editor';

/** Ganchos da camada DOM do editor (menu por Esc, atalhos por H, Ctrl+S/Ctrl+Enter e "escolher no mapa"). */
export interface EditorHooks { menu?: () => void; hotkeys?: () => void; save?: () => void; test?: () => void; pickTile?: (x: number, y: number) => boolean }
/** Modificadores do ponteiro (Shift enfileira, Ctrl acrescenta à seleção, Alt inclui cidadãos na caixa). */
export interface PointerMods { shift: boolean; alt: boolean; ctrl: boolean }
const NO_MODS: PointerMods = { shift: false, alt: false, ctrl: false };

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
  private lastEditorTile: { x: number; y: number } | null = null;
  /** Editor de mapas ativo: quando s.ui.mode === 'editor', ponteiro e teclas são delegados a ele (a câmera continua aqui). */
  private editor: MapEditor | null = null;
  private editorHooks: EditorHooks | null = null;
  setEditor(ed: MapEditor | null, hooks: EditorHooks | null = null) { this.editor = ed; this.editorHooks = hooks; }
  private inEditor(s: Session): boolean { return s.ui.mode === 'editor' && this.editor !== null; }
  private tileAt(sx: number, sy: number) { const w = this.worldAt(sx, sy); return { x: Math.floor(w.x), y: Math.floor(w.y) }; }
  private mods(e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean }): PointerMods { return { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey }; }

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
    if (this.inEditor(s)) { this.renderer.cam.centerOn(w.x, w.y); return; }   // editor: clique centra; botão direito não emite ordens
    if (e.button === 2 || (e.buttons & 2)) { this.contextCommand(w.x, w.y, e.shiftKey); return; }
    this.renderer.cam.centerOn(w.x, w.y);
  }

  private onDown(e: PointerEvent) {
    if (this.overHud(e)) return;
    if (e.button === 1) e.preventDefault();
    this.pointerPress(e.clientX, e.clientY, e.button, this.mods(e));
  }
  private onMove(e: PointerEvent) { this.pointerMoveTo(e.clientX, e.clientY, this.mods(e)); }
  private onUp(e: PointerEvent) { this.pointerRelease(e.clientX, e.clientY, e.button, this.mods(e), this.overHud(e)); }

  // ---------------- Ponteiro (mouse ou cursor virtual do controle: src/ui/gamepad.ts) ----------------
  /** Posição atual do ponteiro em pixels de tela (a do mouse ou a do cursor virtual). */
  get pointer(): { x: number; y: number; down: boolean; button: number } { return { x: this.mouse.x, y: this.mouse.y, down: this.mouse.down, button: this.mouse.button }; }
  /** Há elemento de interface (e não o mapa) sob o ponto? Avisos e tooltip não contam como HUD. */
  hudAt(x: number, y: number): boolean { const t = document.elementFromPoint(x, y); return !!t && t !== this.canvas && !t.closest('#messages, #tooltip'); }

  /** Botão pressionado sobre o mapa (0 esquerdo, 1 meio, 2 direito): seleção, colocação, alvo de poder ou ordem contextual. */
  pointerPress(x: number, y: number, button: number, m: PointerMods = NO_MODS) {
    const s = this.getSession(); if (!s || this.hud.modalOpen) return;
    this.mouse.down = true; this.mouse.button = button; this.mouse.downX = x; this.mouse.downY = y; this.mouse.dragging = false;
    if (button === 1) { this.middleDrag = { x, y }; return; }
    if (this.inEditor(s)) {
      const tile = this.tileAt(x, y);
      if (button === 0 && this.editorHooks?.pickTile?.(tile.x, tile.y)) return;   // "escolher no mapa" (colina do KotH)
      if (button === 0 || button === 2) this.editor!.pointerDown(tile.x, tile.y, button, m);
      return;
    }
    const w = this.worldAt(x, y);
    if (button === 0) {
      if (s.ui.mode === 'place' && s.ui.placeType) { this.placeAt(w.x, w.y, m.shift); return; }
      if (s.ui.mode === 'attackMove') { this.attackMove(w.x, w.y, m.shift); this.hud.cancelMode(); return; }
      if (s.ui.mode === 'rally') { const b = s.ownSelectedBuilding(); if (b) s.issue({ type: 'rally', player: s.local, buildingId: b.id, x: w.x, y: w.y }); this.hud.cancelMode(); return; }
      if (s.ui.mode === 'power' && s.ui.powerId) { this.usePowerAt(w.x, w.y); return; }
    } else if (button === 2) {
      if (s.ui.mode !== 'normal') { this.hud.cancelMode(); return; }
      this.contextCommand(w.x, w.y, m.shift);
    }
  }

  /** Ponteiro moveu: arrastar (caixa de seleção, muralha, câmera pelo botão do meio), editor e dica sob o cursor. */
  pointerMoveTo(x: number, y: number, m: PointerMods = NO_MODS) {
    this.mouse.x = x; this.mouse.y = y; this.mouse.inside = true;
    const s = this.getSession(); if (!s) return;
    if (this.middleDrag) { this.renderer.cam.pan(-(x - this.middleDrag.x), -(y - this.middleDrag.y)); this.middleDrag = { x, y }; return; }
    const overHud = this.hudAt(x, y);
    if (this.inEditor(s)) {
      if (overHud) {
        // saiu do canvas: encerra o traço em curso (não liga em linha reta ao voltar)
        if (this.mouse.down && this.lastEditorTile) { this.editor!.pointerUp(this.lastEditorTile.x, this.lastEditorTile.y, this.mouse.button === 2 ? 2 : 0, m); this.mouse.down = false; }
        this.editor!.setHover(null); this.hud.hideTooltip(); return;
      }
      const tile = this.tileAt(x, y); this.lastEditorTile = tile;
      this.editor!.pointerMove(tile.x, tile.y, this.mouse.down && this.mouse.button === 2 ? 2 : 0, m);
    }
    if (this.mouse.down && this.mouse.button === 0 && s.ui.mode === 'normal') {
      if (Math.abs(x - this.mouse.downX) + Math.abs(y - this.mouse.downY) > 6) this.mouse.dragging = true;
    }
    if (this.mouse.down && this.mouse.button === 0 && s.ui.mode === 'place' && s.ui.placeType === 'wall' && s.ui.wallStart === null) {
      const w = this.worldAt(this.mouse.downX, this.mouse.downY); s.ui.wallStart = { x: Math.floor(w.x), y: Math.floor(w.y) };
    }
    // hover
    if (!overHud) {
      const w = this.worldAt(x, y);
      const ent = this.renderer.pick(s.state, w.x, w.y, s.local);
      this.hoverId = ent ? ent.id : -1;
      if (ent) this.hud.showTooltip(this.hud.describeEntityTip(ent), x, y);
      else {
        const tx = Math.floor(w.x), ty = Math.floor(w.y);
        const nid = tx >= 0 && ty >= 0 && tx < s.state.map.w && ty < s.state.map.h ? s.state.map.nodeAt[ty * s.state.map.w + tx] : -1;
        const vis = s.state.players[s.local].visibility;
        if (nid !== -1 && (s.state.config.revealMap || vis[ty * s.state.map.w + tx] >= 1)) { const n = s.state.map.nodes.get(nid)!; this.hud.showTooltip(`<b>${t(`node.${n.type}`)}</b><div class="desc">${t('node.remaining', { n: Math.round(n.amount) })}</div>`, x, y); }
        else this.hud.hideTooltip();
      }
    }
  }

  /** Botão solto: fim da caixa de seleção, muralha, clique simples/duplo numa entidade. `overHud`: soltou sobre a interface. */
  pointerRelease(x: number, y: number, button: number, m: PointerMods = NO_MODS, overHud = false) {
    const s = this.getSession();
    if (button === 1) { this.middleDrag = null; }
    if (!s || !this.mouse.down) { this.mouse.down = false; return; }
    this.mouse.down = false;
    if (this.inEditor(s)) { const tile = this.tileAt(x, y); if (button === 0 || button === 2) this.editor!.pointerUp(tile.x, tile.y, button, m); return; }
    if (button !== 0) return;
    if (s.ui.mode === 'place' && s.ui.placeType === 'wall') { const w = this.worldAt(x, y); const end = { x: Math.floor(w.x), y: Math.floor(w.y) }; if (!overHud) this.placeWallLine(s.ui.wallStart ?? end, end, m.shift); s.ui.wallStart = null; return; }
    if (s.ui.mode !== 'normal') return;
    if (this.mouse.dragging) {
      const a = this.worldAt(Math.min(this.mouse.downX, x), Math.min(this.mouse.downY, y));
      const b = this.worldAt(Math.max(this.mouse.downX, x), Math.max(this.mouse.downY, y));
      const ids: number[] = [];
      for (const u of s.state.units.values()) if (u.owner === s.local && u.x >= a.x && u.x <= b.x && u.y >= a.y && u.y <= b.y) ids.push(u.id);
      // se houver militares na área, ignora cidadãos (facilita selecionar exército)
      const mil = ids.filter((id) => isMilitary(s.state.units.get(id)!));
      const final = mil.length > 0 && mil.length < ids.length && !m.alt ? mil : ids;
      if (final.length > 0 || !m.ctrl) s.select(final, m.ctrl, false);
      if (final.length > 0) this.audio.play('select');
      this.mouse.dragging = false;
      return;
    }
    if (overHud) return;
    const w = this.worldAt(x, y);
    const ent = this.renderer.pick(s.state, w.x, w.y, s.local);
    const now = performance.now();
    if (ent) {
      if (now - this.lastClick < 450 && this.lastClickId === ent.id && ent.kind === 'unit' && ent.owner === s.local) this.selectTypeOnScreen(ent.type, m.ctrl);   // duplo clique: todas do mesmo tipo visíveis na tela
      else s.select([ent.id], m.ctrl);
      this.audio.play('select');
    } else if (!m.ctrl) s.select([]);
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
      else if (target.hp < target.maxHp && builders.length > 0) cmd = { type: 'repair', player: s.local, ids: builders.map((u) => u.id), targetId: target.id, queue };   // danificado: reparar (guarnecer é G / botão)
      else if (def.farm && builders.length > 0) cmd = { type: 'gather', player: s.local, ids: builders.map((u) => u.id), targetId: target.id, queue };
      else if (def.worship && builders.length > 0) cmd = { type: 'pray', player: s.local, ids: builders.map((u) => u.id), targetId: target.id, queue };
      else if (def.garrison && target.complete && canEnter.length > 0 && target.garrison.length < def.garrison) cmd = { type: 'garrison', player: s.local, ids: canEnter.map((u) => u.id), targetId: target.id, queue };
      else cmd = { type: 'move', player: s.local, ids, x, y, queue, formation: s.ui.formation };
    } else if (target && target.kind === 'building' && target.complete && s.state.players[target.owner].team === s.player.team && BUILDINGS[target.type].garrison) {
      const canEnter = units.filter((u) => ['civilian', 'infantry', 'archer', 'skirmisher', 'hero'].some((t) => UNITS[u.type].tags.includes(t)) && !UNITS[u.type].tags.includes('cavalry') && !UNITS[u.type].tags.includes('myth'));
      cmd = canEnter.length > 0 ? { type: 'garrison', player: s.local, ids: canEnter.map((u) => u.id), targetId: target.id, queue } : { type: 'move', player: s.local, ids, x, y, queue };
    } else {
      cmd = { type: 'move', player: s.local, ids, x, y, queue, formation: s.ui.formation };
    }
    if (cmd) {
      if (cmd.type === 'build') { // juntar-se a uma obra existente: usa "repair" (mesmo comportamento para obras incompletas)
        s.issue({ type: 'repair', player: s.local, ids: cmd.ids, targetId: (target as Building).id, queue });
      } else s.issue(cmd);
      this.audio.play('command');
      s.state.effects.push({ type: 'spawn', x, y, ttl: 8, total: 8 });
    }
  }

  private attackMove(x: number, y: number, queue: boolean): boolean {
    const s = this.getSession()!; const ids = s.ownSelectedUnits().map((u) => u.id);
    if (ids.length === 0) return false;
    s.issue({ type: 'attackMove', player: s.local, ids, x, y, queue, formation: s.ui.formation }); this.audio.play('command');
    return true;
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
    if (builders.length === 0) { this.hud.toast(t('msg.selectBuilders'), 'warn'); this.hud.cancelMode(); return; }
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
    const k = e.key.toLowerCase();
    if (this.hud.modalOpen) { if (k === 'escape') { (e.target as HTMLElement).blur?.(); this.hud.hideModal(); } return; }   // também no menu principal e com foco num campo do modal
    const tag = (e.target as HTMLElement).tagName;
    const itype = ((e.target as HTMLInputElement).type ?? '').toLowerCase();
    if (tag === 'TEXTAREA' || (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(itype)) || (e.target as HTMLElement).isContentEditable) return;   // só campos de texto bloqueiam os atalhos
    const s = this.getSession(); if (!s) return;
    if (this.inEditor(s)) {
      // Editor: nada de pausa, velocidade, grupos, Delete de unidades ou F5; WASD/setas continuam movendo a câmera
      if (k === 'escape') { this.editorHooks?.menu?.(); return; }
      if (k === 'f1') { e.preventDefault(); this.hud.showHelp(); return; }
      if (k === 'f11') { e.preventDefault(); toggleFullscreen(); return; }
      if (k === 'f2') { e.preventDefault(); this.hud.showEncyclopedia(); return; }
      if (e.ctrlKey && k === 'm') { this.audio.toggleMute(); return; }
      if (e.ctrlKey && k === 's') { e.preventDefault(); this.editorHooks?.save?.(); return; }
      if (e.ctrlKey && k === 'enter') { e.preventDefault(); this.editorHooks?.test?.(); return; }
      if (k === 'h' && !e.ctrlKey && !e.altKey) { this.editorHooks?.hotkeys?.(); return; }
      if (!e.ctrlKey && !e.altKey && ['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) { this.keys.add(k); return; }
      if (this.editor!.key(e.key, this.mods(e))) e.preventDefault();
      return;
    }
    if (k === 'enter' && this.hud.onChat && !this.hud.chatOpen) { e.preventDefault(); this.hud.openChat(); return; }   // bate-papo (partidas online)
    this.keys.add(k);
    if (k === 'escape') { this.escape(); return; }
    if (k === 'f1') { e.preventDefault(); this.hud.showHelp(); return; }
    if (k === 'f11') { e.preventDefault(); toggleFullscreen(); return; }
    if (k === 'f2') { e.preventDefault(); this.hud.showEncyclopedia(); return; }
    if (k === 'p' || k === 'pause') { s.paused = !s.paused; this.hud.refreshTop(); return; }
    if (k === '+' || k === '=') { s.speed = Math.min(3, s.speed + 0.5); this.hud.refreshTop(); return; }
    if (k === '-' || k === '_') { s.speed = Math.max(0.5, s.speed - 0.5); this.hud.refreshTop(); return; }
    if (k === 'm' && e.ctrlKey) { this.audio.toggleMute(); return; }
    if (k === ' ') { e.preventDefault(); if (s.lastEvent) this.renderer.cam.centerOn(s.lastEvent.x, s.lastEvent.y); return; }
    if (k === 'h') { this.goHome(e.shiftKey); return; }
    if (k === '.' || k === ',') { this.hud.selectIdleVillager(); return; }
    if (k === 'delete' || k === 'backspace') { const ids = [...s.selection].filter((id) => { const u = s.state.units.get(id); const b = s.state.buildings.get(id); return (u && u.owner === s.local) || (b && b.owner === s.local); }); if (ids.length) { s.issue({ type: 'delete', player: s.local, ids }); s.select([]); } return; }
    if (/^[1-9]$/.test(k)) { if (e.ctrlKey || e.shiftKey) s.setGroup(Number(k)); else this.recallGroup(Number(k), e.altKey); e.preventDefault(); return; }
    if (k === 'tab') { e.preventDefault(); this.cycleSelectionType(); return; }
    if (k === 'a' && e.ctrlKey) { e.preventDefault(); this.selectMilitaryOnScreen(); return; }
    const units = s.ownSelectedUnits(); const b = s.ownSelectedBuilding();
    if (units.length > 0) {
      const villagersOnly = units.every((u) => !!UNITS[u.type].canBuild);
      if (k === 's' && (!villagersOnly || e.shiftKey)) { this.stopSelected(); return; }
      if (k === 'a' && !villagersOnly) { this.enterAttackMove(); return; }
      if (k === 'g' && !villagersOnly) { this.hud.garrisonNearest(units); return; }
      if (k === 'q' && !villagersOnly) { if (this.useAbility()) return; }
      if (villagersOnly && !e.ctrlKey && !e.altKey) {
        const keyU = e.key.toUpperCase();
        const cands = (BUILD_HOTKEYS[keyU] ?? '').split(',').filter(Boolean);
        if (cands.length > 0) {
          // 'M' alterna entre maravilhas
          const type = cands.length === 1 ? cands[0] : cands[(cands.indexOf(s.ui.placeType ?? '') + 1) % cands.length];
          this.hud.startPlacement(type); return;
        }
      }
      if (k === 'a' && villagersOnly) { this.enterAttackMove(); return; }
    } else if (b) {
      const def = BUILDINGS[b.type];
      const keyU = e.key.toUpperCase();
      if (keyU === 'R') { s.ui.mode = 'rally'; document.body.className = 'cur-attack'; return; }
      if (keyU === 'U' && (BUILDINGS[b.type].garrison || BUILDINGS[b.type].worship)) { s.issue({ type: 'ungarrison', player: s.local, buildingId: b.id }); return; }
      if (def.scholars && keyU === 'Q') { this.hud.issueChecked({ type: 'hireScholar', player: s.local, buildingId: b.id }); return; }
      if (def.trains) for (const ut of def.trains) if (UNITS[ut].hotkey === keyU) { this.hud.issueChecked({ type: 'train', player: s.local, buildingId: b.id, unit: ut }); return; }
    }
  }

  // ---------------- Ações (teclado e controle chamam as mesmas) ----------------
  /** Esc: cancela o modo atual, depois limpa a seleção, depois abre o menu. */
  escape() { const s = this.getSession(); if (!s) return; if (s.ui.mode !== 'normal') this.hud.cancelMode(); else if (s.selection.size > 0) s.select([]); else this.hud.showMenu(); }
  /** H: centra no Centro Cívico (e o seleciona com Shift / no controle). */
  goHome(select: boolean) { const s = this.getSession(); if (!s) return; const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center'); if (tc) { this.renderer.cam.centerOn(tc.x, tc.y); if (select) s.select([tc.id]); } }
  /** S: para as unidades próprias selecionadas. */
  stopSelected(): boolean { const s = this.getSession(); if (!s) return false; const ids = s.ownSelectedUnits().map((u) => u.id); if (!ids.length) return false; s.issue({ type: 'stop', player: s.local, ids }); return true; }
  /** A: modo atacar-mover (o próximo clique esquerdo escolhe o ponto). */
  enterAttackMove() { const s = this.getSession(); if (!s) return; s.ui.mode = 'attackMove'; document.body.className = 'cur-attack'; this.hud.refreshCommands(true); }
  /** Atacar-mover direto no ponteiro (controle: X); devolve false sem unidades ou sobre a interface. */
  attackMoveAtPointer(queue = false): boolean {
    const s = this.getSession(); if (!s || this.hudAt(this.mouse.x, this.mouse.y)) return false;
    const w = this.worldAt(this.mouse.x, this.mouse.y);
    if (!this.attackMove(w.x, w.y, queue)) return false;
    if (s.ui.mode === 'attackMove') this.hud.cancelMode();
    s.state.effects.push({ type: 'spawn', x: w.x, y: w.y, ttl: 8, total: 8 });
    return true;
  }
  /** Q: habilidade do herói selecionado (a pronta primeiro). */
  useAbility(): boolean {
    const s = this.getSession(); if (!s) return false;
    const units = s.ownSelectedUnits();
    const h = units.find((x) => UNITS[x.type].ability && s.state.tick >= x.abilityReadyAt) ?? units.find((x) => UNITS[x.type].ability);
    if (!h) return false;
    this.hud.issueChecked({ type: 'ability', player: s.local, unitId: h.id });
    return true;
  }
  /** Ctrl+A: militares visíveis na tela. */
  selectMilitaryOnScreen() { const s = this.getSession(); if (!s) return; const vt = this.renderer.cam.visibleTiles(); const ids: number[] = []; for (const u of s.state.units.values()) if (u.owner === s.local && isMilitary(u) && u.x >= vt.x0 && u.x <= vt.x1 && u.y >= vt.y0 && u.y <= vt.y1) ids.push(u.id); if (ids.length) { s.select(ids); this.audio.play('select'); } }
  /** Todo o exército (militares próprios no mapa inteiro); centra a câmera no grupo. */
  selectArmy(): boolean {
    const s = this.getSession(); if (!s) return false;
    const us = [...s.state.units.values()].filter((u) => u.owner === s.local && !u.dead && u.inside === -1 && isMilitary(u));
    if (!us.length) return false;
    s.select(us.map((u) => u.id)); this.audio.play('select');
    this.renderer.cam.centerOn(us.reduce((a, u) => a + u.x, 0) / us.length, us.reduce((a, u) => a + u.y, 0) / us.length);
    return true;
  }
  /** Duplo clique: todas as unidades próprias do tipo visíveis na tela. */
  selectTypeOnScreen(type: string, additive = false) {
    const s = this.getSession(); if (!s) return;
    const vt = this.renderer.cam.visibleTiles();
    const ids: number[] = [];
    for (const u of s.state.units.values()) if (u.owner === s.local && u.type === type && u.x >= vt.x0 && u.x <= vt.x1 && u.y >= vt.y0 && u.y <= vt.y1) ids.push(u.id);
    s.select(ids, additive, false);
  }
  /** Mesmo tipo da unidade própria sob o ponteiro (ou da primeira selecionada) na tela; controle: clique do analógico esquerdo. */
  selectSameTypeAtPointer(): boolean {
    const s = this.getSession(); if (!s) return false;
    const w = this.worldAt(this.mouse.x, this.mouse.y);
    const ent = this.hudAt(this.mouse.x, this.mouse.y) ? null : this.renderer.pick(s.state, w.x, w.y, s.local);
    const type = ent && ent.kind === 'unit' && ent.owner === s.local ? ent.type : s.ownSelectedUnits()[0]?.type;
    if (!type) return false;
    this.selectTypeOnScreen(type); this.audio.play('select');
    return true;
  }
  /** 1–9: recupera o grupo (Alt/controle: centra a câmera nele). */
  recallGroup(n: number, center: boolean) { const s = this.getSession(); if (!s) return; s.recallGroup(n); const us = s.selectedUnits(); if (us.length && center) this.renderer.cam.centerOn(us[0].x, us[0].y); }
  /** Próximo grupo de controle salvo (com algo vivo), em ordem; devolve o número ou 0 se não houver. */
  cycleGroups(dir = 1): number {
    const s = this.getSession(); if (!s) return 0;
    const alive = (n: number) => (s.groups.get(n) ?? []).some((id) => { const u = s.state.units.get(id); const b = s.state.buildings.get(id); return (!!u && !u.dead) || (!!b && !b.dead); });
    const nums = [...s.groups.keys()].filter(alive).sort((a, b) => a - b); if (!nums.length) return 0;
    const i = nums.indexOf(this.lastGroup);
    const next = nums[i < 0 ? (dir > 0 ? 0 : nums.length - 1) : (i + dir + nums.length) % nums.length];
    this.lastGroup = next; this.recallGroup(next, true); this.audio.play('select');
    return next;
  }
  /** Salva a seleção no primeiro número livre (1–9; tudo ocupado: substitui o 9); devolve o número ou 0 sem seleção. */
  saveNewGroup(): number {
    const s = this.getSession(); if (!s || s.selection.size === 0) return 0;
    let n = 1; while (n < 9 && s.groups.has(n)) n++;
    s.setGroup(n); this.lastGroup = n;
    return n;
  }
  private lastGroup = 0;

  private tabPool: { ids: number[]; idx: number; last: string } | null = null;
  /** Tab alterna o tipo mostrado dentro da seleção original (guardada na 1ª pressão); qualquer outra seleção zera o ciclo. */
  cycleSelectionType() {
    const s = this.getSession()!;
    const cur = [...s.selection].sort((a, b) => a - b).join(',');
    if (!this.tabPool || this.tabPool.last !== cur) this.tabPool = { ids: s.ownSelectedUnits().map((u) => u.id), idx: 0, last: cur };
    const units = this.tabPool.ids.map((id) => s.state.units.get(id)).filter((u): u is Unit => !!u && !u.dead);
    const types = [...new Set(units.map((u) => u.type))]; if (types.length < 2) return;
    this.tabPool.idx = (this.tabPool.idx + 1) % types.length;
    const next = types[this.tabPool.idx];
    s.select(units.filter((u) => u.type === next).map((u) => u.id));
    this.tabPool.last = [...s.selection].sort((a, b) => a - b).join(',');
  }

  /** Rolagem por borda/teclado. */
  update(dtReal: number) {
    const s = this.getSession(); if (!s || this.hud.modalOpen) return;
    const cam = this.renderer.cam; const speed = 900 * dtReal;
    let dx = 0, dy = 0;
    const free = s.selection.size === 0 || this.inEditor(s);   // com unidades ou edifício selecionados, W/A/S/D são atalhos
    if (this.keys.has('arrowleft') || (this.keys.has('a') && this.keys.size === 1 && free)) dx -= 1;
    if (this.keys.has('arrowright') || (this.keys.has('d') && free)) dx += 1;
    if (this.keys.has('arrowup') || (this.keys.has('w') && free)) dy -= 1;
    if (this.keys.has('arrowdown') || (this.keys.has('s') && free)) dy += 1;
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
    return { localPlayer: s.local, selection: s.selection, hoverId: this.hoverId, placement, dragRect, showRanges: s.ui.showRanges, editor: s.ui.editor ?? null, powerTarget: power && power.radius ? { radius: power.radius } : null, mouseWorld: w };
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
