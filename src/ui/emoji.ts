// Emoji → glifo nas telas fora da partida (Etapa 8; docs/ART.md Apêndice H): menu principal, lobby, editor e os modais.
// Os textos (i18n, dados, roteiros) ainda marcam o ícone com um emoji ("📂 Carregar"); aqui cada emoji conhecido vira o
// glifo SVG correspondente (ou o ícone do atlas `hud`, para os recursos) e os outros saem — o mesmo emoji dá sempre o
// mesmo glifo em todas as telas. Trabalha no DOM, não no HTML: texto de <option>/<textarea> e atributos (title,
// placeholder…) não aceitam marcação e só perdem o emoji; conteúdo do jogador marcado com [data-raw] (chat) fica intacto.
import { glyph } from './glyphs';
import { iconHtml } from './icons';

/** Emoji (sem o seletor de variação) → nome do glifo, ou `@nome` de um ícone do atlas `hud`. */
export const EMOJI_GLYPHS: Record<string, string> = {
  '⚔': 'attack', '📜': 'scroll', '🌐': 'globe', '🗺': 'map', '💀': 'skull', '🎬': 'replay', '📂': 'folder', '❓': 'help',
  '📖': 'scholar', '📚': 'scholar', '🎖': 'medal', '⚙': 'gear', '💾': 'save', '✏': 'pencil', '🔌': 'plug', '🔎': 'search',
  '🎯': 'target', '🗑': 'trash', '🚪': 'door', '🚧': 'build', '✔': 'check', '✅': 'check', '❌': 'cross', '✖': 'cross',
  '⚠': 'warn', '⌨': 'keyboard', '🎮': 'gamepad', '👑': 'crown', '⛰': 'mountain', '🏆': 'trophy', '🔥': 'aggressive',
  '⏳': 'hourglass', '⏱': 'clock', '👥': 'people', '👤': 'people', '⬆': 'up', '☰': 'menu', '📤': 'export', '🎲': 'dice',
  '🧪': 'flask', '🩺': 'pulse', '👁': 'eye', '⭐': 'star', '📌': 'pin', '🗣': 'chat', '💬': 'chat', '🚩': 'rally',
  '🏛': 'temple', '🌲': 'tree', '🖌': 'brush', '🖱': 'pointer', '🧽': 'eraser', '💧': 'pipette', '🪣': 'bucket', '⚡': 'bolt',
  '🏺': 'relic', '🛡': 'defensive', '▶': 'play', '⏸': 'pause', '🔇': 'mute', '🔊': 'sound',
  '🪙': '@res/gold', '🍖': '@res/food', '🪵': '@res/wood', '🌋': '@age/4',
};

const ONE = /([\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{25B6}])\u{FE0F}?|[\u{FE0F}\u{200D}]/gu;
const ANY = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{25B6}\u{FE0F}\u{200D}]/u;
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
/** Elementos cujo texto não aceita marcação (só perdem o emoji). */
const PLAIN = 'option, select, textarea, title';

/** HTML do glifo (ou ícone) de um emoji; '' se não houver correspondência. */
export function emojiGlyph(emoji: string): string {
  const name = EMOJI_GLYPHS[emoji.replace(/\uFE0F/g, '')];
  if (!name) return '';
  return name.startsWith('@') ? iconHtml(name.slice(1), { cls: 'hic-res' }) : glyph(name);
}

/** Tira os emoji de um texto sem marcação (o espaço que separava o emoji do texto sai junto). */
function strip(s: string): string {
  const out = s.replace(ONE, '').replace(/ {2,}/g, ' ');
  return /^\s/.test(s) ? out : out.replace(/^\s+/, '');
}

function fixText(t: Text): void {
  const s = t.data;
  if (!ANY.test(s)) return;
  const parent = t.parentElement;
  if (!parent || parent.closest('[data-raw], svg')) return;
  if (parent.closest(PLAIN)) { t.data = strip(s); return; }
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of s.matchAll(ONE)) {
    const i = m.index ?? 0;
    if (i > last) frag.append(s.slice(last, i));
    const html = m[1] ? emojiGlyph(m[1]) : '';
    let skip = 0;
    if (html) { const tpl = document.createElement('template'); tpl.innerHTML = html; frag.append(tpl.content); }
    else if (s[i + m[0].length] === ' ' && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '>')) skip = 1;   // emoji sem glifo: some com o espaço que o separava
    last = i + m[0].length + skip;
  }
  if (last < s.length) frag.append(s.slice(last));
  t.replaceWith(frag);
}

function fixAttrs(el: Element): void {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v && ANY.test(v)) el.setAttribute(a, strip(v).trim());
  }
}

/** Troca os emoji de `node` e descendentes (texto → glifo; atributos e texto sem marcação → sem emoji). */
export function glyphify(node: Node): void {
  if (node.nodeType === 3) { fixText(node as Text); return; }
  if (node.nodeType !== 1 && node.nodeType !== 11) return;
  if (node.nodeType === 1) {
    const el = node as Element;
    if (el.closest('[data-raw]')) return;
    fixAttrs(el);
    for (const d of el.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) fixAttrs(d);
  }
  const texts: Text[] = [];
  const walk = document.createTreeWalker(node, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (ANY.test((n as Text).data)) texts.push(n as Text);
  for (const t of texts) fixText(t);
}

/**
 * Mantém `root` sem emoji: troca já e a cada mudança (innerHTML novo, texto alterado, atributo trocado). O observador
 * roda antes da pintura (microtarefa), então o emoji nunca aparece. Devolve o cancelamento.
 */
export function watchEmoji(root: HTMLElement): () => void {
  glyphify(root);
  if (typeof MutationObserver === 'undefined') return () => {};
  const mo = new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === 'childList') r.addedNodes.forEach((n) => glyphify(n));
      else if (r.type === 'characterData') fixText(r.target as Text);
      else if (r.type === 'attributes' && r.attributeName) { const el = r.target as Element; if (!el.closest('[data-raw]')) fixAttrs(el); }
    }
  });
  mo.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  return () => mo.disconnect();
}
