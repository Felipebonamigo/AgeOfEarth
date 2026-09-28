// Escape de texto para innerHTML: nomes de jogadores, salas, mapas e mensagens vêm de outros pares ou de arquivos.
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/**
 * Tira os emoji de um texto (Etapa 7: nenhum emoji na partida — o HUD usa os ícones do atlas `hud` e os glifos SVG):
 * pictográficos, símbolos que eram usados como ícone (☰ ⏳ ⬆ …), o seletor de variação e o ZWJ das sequências. Espaços
 * duplicados que sobram viram um.
 */
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]\u{FE0F}?|[\u{FE0F}\u{200D}]/gu;
export function noEmoji(s: string): string {
  return s.replace(EMOJI_RE, '').replace(/ {2,}/g, ' ').replace(/(^|>)\s+/g, '$1').replace(/\(\s+/g, '(').trim();
}
