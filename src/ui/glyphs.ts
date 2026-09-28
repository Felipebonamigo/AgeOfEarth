// Glifos vetoriais do HUD (Etapa 7; docs/ART.md §1.10): comandos, posturas, sistema (pausa, som, menu), marcas de estado
// e setas — SVG inline de traço em `currentColor` (herdam a cor e o tamanho do texto: 1em), no lugar dos emoji que o
// HUD usava. Desenhados à mão numa grade 24×24 com o vocabulário grego do jogo (espadas cruzadas, hoplon, ramo de
// oliveira, estandarte), legíveis de 14 a 32 px.

const P: Record<string, string> = {
  // sistema
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  play: '<path d="M7 5l12 7-12 7z" fill="currentColor"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/><path d="M16 9l5 6M21 9l-5 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-3.5 2.6-5.5 5.5-5.5s5 2 5.5 5.5"/><circle cx="16.5" cy="9" r="2.5"/><path d="M15 13.6c2.9-.3 5 1.4 5.5 4.9"/>',
  up: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  hourglass: '<path d="M7 3h10M7 21h10M8 3c0 5 8 6 8 9s-8 4-8 9M16 3c0 5-8 6-8 9s8 4 8 9"/>',
  // comandos
  stop: '<path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z"/><path d="M8 12h8"/>',
  attack: '<path d="M4 4l11 11M20 4L9 15M13 17l4 4M11 17l-4 4M15.5 13.5l3 3M8.5 13.5l-3 3"/>',
  build: '<path d="M14 4l6 6-3 3-6-6z" fill="currentColor"/><path d="M12.5 8.5L4 17l3 3 8.5-8.5"/>',
  garrison: '<path d="M5 21V9h14v12M5 9V5h3v2h2V5h4v2h2V5h3v4M10 21v-5h4v5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  cancel: '<path d="M6 6l12 12M18 6L6 18" stroke-width="2.6"/>',
  scholar: '<path d="M5 5c2-1 5-1 7 1 2-2 5-2 7-1v14c-2-1-5-1-7 1-2-2-5-2-7-1z"/><path d="M12 6v14"/>',
  buy: '<circle cx="12" cy="15" r="5"/><path d="M12 2v7M9 6l3 3 3-3"/>',
  sell: '<circle cx="12" cy="15" r="5"/><path d="M12 9V2M9 5l3-3 3 3"/>',
  release: '<path d="M4 3h9v18H4zM13 12h8M18 9l3 3-3 3"/>',
  rally: '<path d="M6 21V3M6 4h11l-3 4 3 4H6"/>',
  // posturas
  aggressive: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z" fill="currentColor" stroke="none"/>',
  defensive: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  passive: '<path d="M5 19C9 15 13 11 19 5"/><path d="M9 15c-3 0-4-2-4-2s2-2 4-1M12 12c-1-3 0-5 0-5s2 1 2 4M13 11c3 0 4 2 4 2s-2 2-4 1M16 8c-1-2 0-4 0-4s2 1 2 3"/>',
  // formações (pontos = soldados)
  fLine: '<g fill="currentColor" stroke="none"><circle cx="4" cy="12" r="2"/><circle cx="9.3" cy="12" r="2"/><circle cx="14.7" cy="12" r="2"/><circle cx="20" cy="12" r="2"/></g>',
  fBox: '<g fill="currentColor" stroke="none"><circle cx="7" cy="7" r="2"/><circle cx="12" cy="7" r="2"/><circle cx="17" cy="7" r="2"/><circle cx="7" cy="12" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="7" cy="17" r="2"/><circle cx="12" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></g>',
  fColumn: '<g fill="currentColor" stroke="none"><circle cx="9.5" cy="4" r="2"/><circle cx="14.5" cy="4" r="2"/><circle cx="9.5" cy="9.3" r="2"/><circle cx="14.5" cy="9.3" r="2"/><circle cx="9.5" cy="14.7" r="2"/><circle cx="14.5" cy="14.7" r="2"/><circle cx="9.5" cy="20" r="2"/><circle cx="14.5" cy="20" r="2"/></g>',
  fWedge: '<g fill="currentColor" stroke="none"><circle cx="12" cy="5" r="2"/><circle cx="8.5" cy="10.5" r="2"/><circle cx="15.5" cy="10.5" r="2"/><circle cx="5" cy="16" r="2"/><circle cx="12" cy="16" r="2"/><circle cx="19" cy="16" r="2"/></g>',
  // estado e marcas
  check: '<path d="M4 12.5l5 5L20 6.5" stroke-width="2.8"/>',
  cross: '<path d="M6 6l12 12M18 6L6 18" stroke-width="2.6"/>',
  box: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor" stroke="none"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4c0 3 1 5 3.5 5.5M17 6h3c0 3-1 5-3.5 5.5M12 14v4M8 20h8"/>',
  medal: '<path d="M8 3l4 6 4-6" /><circle cx="12" cy="15" r="5.5"/><path d="M12 12.3l.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z" fill="currentColor" stroke="none"/>',
  chat: '<path d="M4 5h16v11H10l-5 4v-4H4z"/>',
  export: '<path d="M12 15V3M7 8l5-5 5 5M4 15v5h16v-5"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5M4 15v5h16v-5"/>',
  relic: '<path d="M9 3h6M10 3v3c-3 1-5 4-5 8 0 4 3 7 7 7s7-3 7-7c0-4-2-7-5-8V3"/>',
};

/** SVG do glifo `name` (1em, traço em currentColor). `cls` extra para a classe. */
export function glyph(name: keyof typeof P | string, cls = ''): string {
  const body = P[name];
  if (!body) return '';
  return `<svg class="gly${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
export const GLYPHS = Object.keys(P);
