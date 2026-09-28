// Molduras de bronze (Etapa 8; docs/ART.md §1.10 e Apêndice H): nine-slice desenhado em canvas 2D uma vez, na densidade da
// tela — faixa de bronze com o meandro grego (a "grega") em relevo e rosetas nos cantos —, publicado como a variável CSS
// `--frame-meander` para `border-image` (caixa do menu principal e telas de fim). Desenho procedural (nada de imagem
// pintada) com a mesma paleta de bronze dos ícones; sem canvas (testes), a variável fica vazia e vale a borda comum.

/** Largura da faixa em px CSS e da fatia do nine-slice (a imagem tem 3 × 3 fatias; a do meio repete). */
export const FRAME_PX = 16;

function draw(scale: number): string {
  const B = Math.round(FRAME_PX * scale), S = B * 3;
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  if (!g) return '';
  const k = B / FRAME_PX;   // px da imagem por px CSS
  // faixa: bronze escuro com fios claros nas bordas (relevo), dos quatro lados
  const band = (x: number, y: number, w: number, h: number, vertical: boolean) => {
    const grad = vertical ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#2a1d0c'); grad.addColorStop(0.12, '#b8903e'); grad.addColorStop(0.2, '#6a4c1e');
    grad.addColorStop(0.5, '#4a3414'); grad.addColorStop(0.8, '#6a4c1e'); grad.addColorStop(0.88, '#c9a14a'); grad.addColorStop(1, '#23180a');
    g.fillStyle = grad; g.fillRect(x, y, w, h);
  };
  band(0, 0, S, B, false); band(0, S - B, S, B, false); band(0, 0, B, S, true); band(S - B, 0, B, S, true);
  // meandro: uma volta da grega por fatia de borda, desenhada no sistema local da faixa (u ao longo, v através)
  const key = (ox: number, oy: number, ux: number, uy: number, vx: number, vy: number) => {
    const P = (u: number, v: number) => [ox + (ux * u + vx * v) * k, oy + (uy * u + vy * v) * k] as const;
    // volta quadrada em 16 × 16 (margem de 3 px): sobe, vira, desce em espiral e segue para a próxima
    const pts: [number, number][] = [[0, 12], [0, 4], [12, 4], [12, 12], [5, 12], [5, 8], [8.5, 8]];
    const tail: [number, number][] = [[12, 12], [16, 12]];
    const path = (list: [number, number][]) => { g.beginPath(); list.forEach(([u, v], i) => { const [x, y] = P(u, v); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); };
    g.lineCap = 'square'; g.lineJoin = 'miter';
    for (const [color, off, w] of [['#1a1106', 0.9, 2.4], ['#e6c068', 0, 1.7]] as const) {
      g.save(); g.translate(off * k, off * k); g.strokeStyle = color; g.lineWidth = w * k; path(pts); path(tail); g.restore();
    }
  };
  key(B, 0, 1, 0, 0, 1);                 // topo (da esquerda para a direita)
  key(2 * B, S, -1, 0, 0, -1);           // base (espelhada: a grega corre no mesmo sentido visto de fora)
  key(0, 2 * B, 0, -1, 1, 0);            // esquerda (de baixo para cima)
  key(S, B, 0, 1, -1, 0);                // direita
  // rosetas dos cantos: disco de bronze com anel claro e botão
  for (const [cx, cy] of [[B / 2, B / 2], [S - B / 2, B / 2], [B / 2, S - B / 2], [S - B / 2, S - B / 2]]) {
    g.fillStyle = '#23180a'; g.fillRect(cx - B / 2, cy - B / 2, B, B);
    const rg = g.createRadialGradient(cx - B * 0.12, cy - B * 0.14, B * 0.05, cx, cy, B * 0.46);
    rg.addColorStop(0, '#f1d58a'); rg.addColorStop(0.45, '#b08634'); rg.addColorStop(1, '#3e2b10');
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, B * 0.42, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e6c068'; g.lineWidth = 1 * k; g.beginPath(); g.arc(cx, cy, B * 0.28, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#2a1d0c'; g.beginPath(); g.arc(cx, cy, B * 0.1, 0, Math.PI * 2); g.fill();
  }
  // miolo transparente (o fundo do painel aparece; border-image sem `fill`)
  g.clearRect(B, B, B, B);
  try { return cv.toDataURL('image/png'); } catch { return ''; }
}

/** Publica `--frame-meander` (e `--frame-slice`) no documento; redesenha se a densidade da tela mudar. */
export function installFrames(): void {
  if (typeof document === 'undefined') return;
  const apply = () => {
    const scale = Math.max(1, Math.min(3, Math.round((window.devicePixelRatio || 1) * 2) / 2));
    const url = draw(scale);
    if (!url) return;
    const root = document.documentElement.style;
    root.setProperty('--frame-meander', `url("${url}")`);
    root.setProperty('--frame-slice', String(Math.round(FRAME_PX * scale)));
  };
  apply();
  try { matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener('change', () => apply()); } catch { /* sem matchMedia */ }
}
