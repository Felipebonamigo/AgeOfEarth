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
  // menu principal, lobby e editor (emoji → glifo em src/ui/emoji.ts)
  scroll: '<path d="M8 4h10a2 2 0 0 1 2 2v1.5h-3.5M8 4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2M8 4a2 2 0 0 0-2 2v1.5h3.5M8 20a2 2 0 0 1-2-2v-1.5h3M8 20h8a2 2 0 0 0 2-2V7.5M12.5 10h3M12.5 13.5h3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.2 3.2 3.2 14.8 0 18M12 3c-3.2 3.2-3.2 14.8 0 18"/>',
  map: '<path d="M3 6.5L9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
  skull: '<path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.3 4.5 3 5.5V20h10v-3.5c1.7-1 3-2.7 3-5.5a8 8 0 0 0-8-8z"/><circle cx="9" cy="11.5" r="1.9" fill="currentColor" stroke="none"/><circle cx="15" cy="11.5" r="1.9" fill="currentColor" stroke="none"/><path d="M10.5 20v-2.5M13.5 20v-2.5"/>',
  replay: '<path d="M19.5 12A7.5 7.5 0 1 1 17 6.4M19.5 3.5V7.5h-4"/><path d="M10 9l5 3-5 3z" fill="currentColor"/>',
  folder: '<path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/><path d="M3 10h18"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.3a2.8 2.8 0 1 1 3.9 2.6c-.8.3-1.2 1-1.2 1.8v.5"/><circle cx="12" cy="17.2" r="1.1" fill="currentColor" stroke="none"/>',
  gear: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.3"/><path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2M5.3 5.3l2.2 2.2M16.5 16.5l2.2 2.2M5.3 18.7l2.2-2.2M16.5 7.5l2.2-2.2" stroke-width="2.6"/>',
  save: '<path d="M5 3h11.5L20 6.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 1-2z"/><path d="M8 3v5h7V3M7.5 21v-6.5h9V21"/>',
  pencil: '<path d="M4 20l1.2-4.8L16 4.4a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L8.8 18.8z"/><path d="M14 6.5l3.5 3.5M4 20l4.8-1.2"/>',
  plug: '<path d="M9 3v5M15 3v5M6 8h12v2.5a6 6 0 0 1-12 0zM12 16.5V21"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21" stroke-width="2.6"/>',
  target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>',
  door: '<path d="M3.5 21h17M6 21V3h12v18"/><path d="M6 3l7.5 2.5V21"/><circle cx="11.2" cy="13" r="1" fill="currentColor" stroke="none"/>',
  warn: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.4" r="1.1" fill="currentColor" stroke="none"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h0M9.3 10h0M12.6 10h0M16 10h0M18 10h0M6 14h0M18 14h0M8.5 14h7" stroke-width="2.2"/>',
  gamepad: '<path d="M7.5 7h9a5 5 0 0 1 4.8 6.3l-1 3.6a2.4 2.4 0 0 1-4.2.9L14 15.5h-4l-2.1 2.3a2.4 2.4 0 0 1-4.2-.9l-1-3.6A5 5 0 0 1 7.5 7z"/><path d="M8 9.8v3.4M6.3 11.5h3.4"/><circle cx="15.5" cy="10.3" r="1.1" fill="currentColor" stroke="none"/><circle cx="17.5" cy="12.6" r="1.1" fill="currentColor" stroke="none"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10.5H5z" fill="currentColor" fill-opacity=".25"/><path d="M5.5 15.5h13"/>',
  mountain: '<path d="M2 20L9 7.5l3.4 5.4L15 9.5 22 20z"/><path d="M6.8 11.5L9 13l1.5-1.4"/>',
  pin: '<path d="M12 21.5V15M8 3h8l-1.2 5.5L18 12v2.5H6V12l3.2-3.5z"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  bolt: '<path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6.2z" fill="currentColor" fill-opacity=".25"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><g fill="currentColor" stroke="none"><circle cx="8.5" cy="8.5" r="1.5"/><circle cx="15.5" cy="8.5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="8.5" cy="15.5" r="1.5"/><circle cx="15.5" cy="15.5" r="1.5"/></g>',
  flask: '<path d="M9 3h6M10 3v6.2L4.6 18.8A1.5 1.5 0 0 0 5.9 21h12.2a1.5 1.5 0 0 0 1.3-2.2L14 9.2V3"/><path d="M7.2 15h9.6"/>',
  pulse: '<path d="M2.5 12h4.2l2.3-5.5 4.5 11 2.3-5.5h5.7"/>',
  temple: '<path d="M2.5 9L12 4l9.5 5zM3.5 20.5h17M5 17.5h14M6.5 11v6.5M10 11v6.5M14 11v6.5M17.5 11v6.5"/>',
  tree: '<path d="M12 2.5l5 6.5h-3l4.5 6h-4l3 4.5H6.5l3-4.5h-4L10 9H7z"/><path d="M12 19.5V22"/>',
  brush: '<path d="M20.5 3.5c-4 1.6-8.2 5.6-10.3 8.7l1.9 1.9c3.1-2.1 7.1-6.3 8.4-10.6z"/><path d="M9.3 13.3c-2.4.1-4.1 1.6-4.1 3.9 0 1.3-.9 2.3-2.2 2.9 3.3 1.3 7.9.4 8.3-3.8z" fill="currentColor"/>',
  pointer: '<path d="M5.5 3l12.5 6.3-5.4 1.9-1.9 5.3z" fill="currentColor" fill-opacity=".25"/><path d="M12.6 11.2l5.9 6.3"/>',
  eraser: '<path d="M9 20.5h11.5M3.8 14.8l9.6-10.3 6.7 6.7-8.9 9.3H8.5z"/><path d="M9 9.8l6.2 6.2"/>',
  pipette: '<path d="M18.2 3.6a2.3 2.3 0 0 1 3.2 3.2l-2.6 2.6.9.9-2 2-.9-.9-7.3 7.3H6.1v-3.4l7.3-7.3-.9-.9 2-2 .9.9z"/><path d="M6.1 17.9L3 21"/>',
  bucket: '<path d="M4.5 10.5L11 4l7 7-6.5 6.5z"/><path d="M4.5 10.5c-1 2-1.3 4.2-.8 5.2M20.5 16c0 1.6-.9 3-2 3s-2-1.4-2-3c0-1.2 2-4 2-4s2 2.8 2 4z"/><path d="M8 7.5L3.5 3"/>',
  dpad: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  dpadUp: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/><path d="M9.5 3.5h5v5h-5z" fill="currentColor" stroke="none"/>',
  dpadDown: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/><path d="M9.5 15.5h5v5h-5z" fill="currentColor" stroke="none"/>',
  dpadLeft: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/><path d="M3.5 9.5h5v5h-5z" fill="currentColor" stroke="none"/>',
  dpadRight: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/><path d="M15.5 9.5h5v5h-5z" fill="currentColor" stroke="none"/>',
};

/** SVG do glifo `name` (1em, traço em currentColor). `cls` extra para a classe. */
export function glyph(name: keyof typeof P | string, cls = ''): string {
  const body = P[name];
  if (!body) return '';
  return `<svg class="gly${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
export const GLYPHS = Object.keys(P);
