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

## Andamento (14/10/2026, sessão local — feito sem esperar a aprovação formal, por pedido do dono de seguir com tudo que desse)
- **U2a feito**: clique direito contextual (inimigo → `attack`, recurso → `gather`, senão `move`; Shift enfileira), A + clique =
  `attackMove`, S = `stop`, arrastar = caixa de seleção, Ctrl+1..9 grava e 1..9 chama grupo, câmera WASD/roda. Teste automático:
  `-AoEAutoTest -AoEOrderTest` (com `u1-servidor.ts --humano --avancar 0`): coletar levou as unidades de 12,4 a 9,8 tiles do nó em 40 s.
- **U2b em versão mínima**: HUD em C++ (`AoEHud`): recursos, população, Era, caixa de seleção, barras de vida da seleção, dicas;
  clicar num edifício próprio o seleciona e **Z X C V N M** treinam os tipos que ele treina (hello `buildingTypes.trains`); **B** abre o menu
  de construção (lista fixa de 9), número escolhe, clique no chão posiciona. Teste: treinar um cidadão (+1) e construir uma casa (0→1) por esses comandos.
- **Falta no U2b**: fantasma da construção, custo/Era/atalhos de cada edifício, Biblioteca (estudos) e avanço de Era, poderes, fila de treino visível.
  **Pedido à nuvem** (precisa de `scripts/unreal/protocol.ts`): no `hello`, por tipo de edifício `age`, `cost`, `hotkey`, `trains[].cost`, `limit`; por
  tipo de unidade `cost`; e no `state` a fila de produção dos edifícios próprios e o progresso de pesquisa.
- **U2c (névoa) e demais fatias** seguem como no plano acima.

- **14/10, tarde**: poderes divinos (barra de ícones abaixo dos recursos; **G** arma/alterna, clique esquerdo usa no ponto ou na unidade inimiga sob o cursor; Esc cancela), **E** na Biblioteca avança de Era, **U** libera guarnição, **Delete** apaga a seleção, clique direito com edifício selecionado marca o **ponto de encontro**; painel do edifício mostra vida/obra e a fila. Efeitos de poder: raio (segmentos + clarão de luz), terremoto (anel de poeira), brilho divino (halo e coluna dourados). Teste automático: o raio usado pelo cliente gastou o poder (bolt: pronto → usado).
