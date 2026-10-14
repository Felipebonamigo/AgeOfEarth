# U2 — cliente jogável das Eras I–IV no Unreal (proposta para aprovação)

Status: **proposta**, escrita em 14/10/2026 após a decisão do dono de seguir no Unreal. É mudança arquitetural (novo cliente de entrada e
HUD): pede aprovação antes de qualquer código. A simulação TypeScript (`src/core`) continua a fonte da verdade; o Unreal desenha o estado
e envia comandos pela ponte (`docs/UNREAL.md`, `scripts/unreal/protocol.ts`).

## Objetivo
Uma partida completa contra a IA (Eras I–IV, mapa `small`/`medium`) jogada **só no cliente Unreal**: selecionar, mover, atacar, coletar,
construir, treinar, pesquisar na Biblioteca, evoluir de Era, usar poderes, ver névoa de guerra e fim de partida.

## Fatias (cada uma entregável e medida)
1. **U2a Entrada e seleção**: caixa de seleção, grupos (Ctrl+n), clique direito contextual (mover/atacar/coletar/guarnecer/rota), `A`+clique,
   câmera RTS (borda, WASD, zoom, rotação), minimapa. Comandos pelo `Command` já existente na ponte. *Aceite*: jogar 5 min só com o mouse.
2. **U2b Economia e construção**: menu de construção com fantasma (cor válida/inválida pelo `canPlace` do núcleo), fila de treino,
   recursos no topo, Biblioteca e árvore de estudos, evolução de Era. *Aceite*: sair da Era I à II sem tocar o cliente web.
3. **U2c Névoa e estado**: névoa de guerra/explorado no material do terreno (textura dinâmica 1 byte/tile vinda do `state`), edifícios
   vistos por último, barra de vida, retratos. *Aceite*: nada inimigo visível fora da visão.
4. **U2d Arte Eras I–IV**: kit de edifícios por Era (`docs/ERAS.md` §5) com Meshy gratuito/galeria + Blender (nuvem prepara), cavalaria
   e criaturas com rig (ver `unreal/PENDENCIAS.md`), efeitos em Niagara (golpe, poeira, fumaça, poderes). *Aceite*: capturas por Era.
5. **U2e Áudio e polimento**: ganchos para o áudio da nuvem (`docs/AUDIO.md`), ciclo de dia opcional, opções gráficas (presets), 60 fps no
   preset Alto com 300 unidades.

## O que depende de quem
- **Nuvem**: modelos preparados (redução/normais/pivôs), `export-terrain --players N`, créditos em `docs/LEGAL.md`, textos i18n do HUD.
- **Local**: C++/UMG do cliente (entrada, HUD), materiais, rigs, Niagara, medição em build.
- **Dono**: aprovar o escopo; opcional: conta Fab, Mixamo (animações humanas extras).

## Riscos
- HUD em UMG por script é trabalhoso: preferir C++ + Slate/UMG mínimo, ou HUD em WebView do cliente web (reuso do que existe). Decidir na U2a.
- Animação de criaturas depende de rig externo (Meshy gratuito não entrega).
- Cada mudança do núcleo que altere a ponte exige `SIM_VERSION` e atualização do catálogo `Dados/AoEVisuais.json`.
