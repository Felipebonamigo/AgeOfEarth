# U4 — menu principal e "Criar partida" no Unreal (decisões do dono, 16/10/2026)

Decidido: o menu de partida (fora da campanha) deixa o jogador montar a partida como quiser, no estilo dos RTS clássicos
(Rise of Nations como referência de funcionalidade, Age of Empires de visual moderno), bonito e combinando com o jogo.

## Decisões
1. **Começar só contra bots** (1 humano + bots, com equipes). Online com amigos vem depois.
2. **Online: lockstep** (cada máquina roda a simulação, o relay só passa comandos), o que o jogo já tem. Ver "Por quê" abaixo.
3. **Até 12 jogadores**, com opção de tamanho do mapa que acompanhe (12 jogadores pedem mapa grande).
4. **Visual**: moderno, limpo, no tema do jogo (bronze, mármore, Cinzel), inspirado no menu do Age of Empires; não copiar.

## Telas
- **Menu principal**: Jogar (Criar partida / Campanha / Online depois), Editor de mapas, Opções, Créditos, Sair. Fundo: cena viva do
  jogo (câmera lenta sobre uma cidade), música.
- **Criar partida** (uma tela, três colunas):
  - *Jogadores*: até 12 vagas; cada uma com cor, deus, equipe (1–12) e tipo (Humano, Bot, Fechada); bot com dificuldade
    (fácil, normal, difícil, muito difícil) e personalidade (aleatória ou escolhida). Botões: equipes automáticas, embaralhar, 2v2, 3v3…
  - *Mapa*: tipo (continental, costeiro, ilhas, mediterrâneo, oficiais), tamanho (pequeno, médio, grande, enorme), semente
    (aleatória/fixa), bioma (automático ou manual) e **prévia** do terreno com os inícios.
  - *Regras*: Era inicial e final, recursos iniciais, vitória (conquista, maravilhas por pontos ou posse), mapa revelado ou névoa,
    modo de jogo (padrão, horda…), velocidade; predefinições salvas.
- **Carregando**: tela com arte do mapa e dicas.
- **Fim da partida**: resultado, estatísticas, revanche.

## Por que lockstep (e não servidor que manda o estado)
- A simulação é em TypeScript e **determinística**; o jogo online, os replays e a verificação de dessincronia já existem
  (`server/relay.mjs`, `src/net`). Reaproveita tudo.
- Banda: lockstep manda só comandos; um servidor autoritativo mandaria o estado de centenas de unidades × 12 jogadores a cada
  atualização, e exigiria hospedar a simulação (custo por partida).
- Replays e salvamentos saem de graça.
- Custo: cada máquina precisa rodar a simulação TypeScript. O Unreal **não roda TypeScript**, então a build empacotada leva um
  processo local (Node embutido) que roda a simulação e fala com o jogo pela ponte, como hoje; o jogador não vê isso.
  Dessincronia entre máquinas continua sendo o risco do lockstep (hoje há detecção por hash).

## Pedidos à nuvem (simulação e ponte)
1. A ponte aceitar a **configuração da partida** em vez de fixa: `{ jogadores[{ tipo, cor, deus, equipe, dificuldade, personalidade }],
   mapa{ tipo, tamanho, semente }, regras{…} }`; hoje o `u1-servidor.ts` fixa tudo e limita a 3 IAs.
2. `PLAYER_COLORS` tem **4 cores**; precisa de 12 distinguíveis (e daltonismo).
3. **Mapa de alturas e camadas no `hello`** (U3) e a lista de inícios para a prévia.
4. Orçamento da simulação com **12 jogadores**: rodar `npx tsx scripts/perf.ts` e `npm run smoke` com 12 e o mapa enorme, e
   ver se cabe no tick (hoje a medição é 4 jogadores, ~250 unidades).
5. Inícios para 12 jogadores nos mapas oficiais e nos tipos gerados (hoje o gerador pensa em até 4).
6. Empacotar Node + simulação junto da build do Unreal e subir o processo local ao iniciar a partida.

## Ordem
1. U3 (terreno na partida + biomas) — `U3-TERRENO-RUNTIME.md`.
2. Menu principal + "Criar partida" para 1 humano contra bots (UMG, tema do jogo), com pedidos 1–3 e 5 da nuvem.
3. Orçamento de 12 jogadores (pedido 4) e ajustes.
4. Online por lockstep (cliente Unreal falando com o relay) e salas de amigos (chat, pronto, expulsar, reconexão).
5. Campanha, editor e opções no mesmo menu principal.

## Em aberto
- Se o bioma é escolhido pelo jogador ou automático (padrão: automático com opção manual).
- Quais biomas (proposta: Egeu, Ática, Montanha, Creta árida/Egito, Submundo; começar por Egeu e Ática).
- Arte do menu: fundo vivo ou pintado; vozes e música (áudio adiado pelo dono, pedido 0007).


## Respostas da nuvem (16/10/2026)
Pedidos 1–5 atendidos na ponte: `novaPartida`/`--setup`, relevo e plantas, 12 cores, inícios para 12 jogadores (mapas `huge`/`giant`) e medição de custo. Detalhes em `art/meshy/canal/pedidos/0012-nuvem-u4-pronto.md`; formato do setup em `scripts/unreal/match.ts`.

## Estado (17/10/2026): menu v1 funcionando
- `-AoEMenu` abre o menu (Principal e Criar partida) sobre o jogo; a ponte abre o `sim-server.ts` oficial sozinha (node direto, `-AoERepo=` muda o repositório) e fecha no EndPlay.
- Criar partida: até 12 lugares (Você/Bot/Fechada, deus, equipe, dificuldade), predefinições de equipe, 8 tipos de mapa, 5 tamanhos (sobe sozinho ao mínimo dos jogadores), semente, eras, vitória, mapa revelado. "Começar" manda `novaPartida` e `pause false`; terreno, plantas e estradas da partida anterior são trocados no hello.
- Provado: 12 jogadores em 2 equipes, mapa Gigante, partida iniciada pelo menu (capturas `menu.png`, `partida.png`).
- Ganchos de captura: `-AoEMenuTela=criar -AoEMenuVagas=N -AoEMenuTimes -AoEMenuTamanho=N -AoEMenuMapa=N -AoEMenuJogar`.
- Falta: prévia do mapa, online, Campanha/Editor/Opções, fundo vivo, empacotar Node + simulação, escolha de bioma, ligar `-AoEMenu` por padrão na build.
- Armadilha: dentro do Unreal `cmd /c npx ...` falha com "A sintaxe do comando está incorreta"; usar `node node_modules/tsx/dist/cli.mjs`, com diretório de trabalho em barras invertidas.

## Visual v2 (17/10/2026)
Menu refeito sem molduras de bronze: vidro escuro, filetes de ouro com losango, título com espaçamento entre letras, hover, retratos dos deuses (atlas `hud`), equipes pela cor, cartões de mapa tingidos pelo bioma com forma própria, tamanho em botões (os menores que o mínimo ficam apagados), faixa das 8 Eras com os ícones do jogo (clique leva a ponta mais próxima) e rodapé com resumo + Começar. Teste do clique: `-AoEMenuTeste` aperta Jogar e Começar pelo mesmo `MenuClick` do mouse (provado: partida de 12 em Lagos iniciou).

Bloqueio de empacotamento: com outro editor aberto com Live Coding no mesmo motor (CitySample, TDFende, Zombie) o UAT recusa ("Unable to build while Live Coding is active"); `u1-empacotar.sh` tenta 10 vezes e desiste. Empacotar e medir fps da partida de 12 só quando esses editores fecharem. Pedidos à nuvem: `art/meshy/canal/pedidos/0013-unreal-menu-pronto-pedidos.md`.
