# Age of Earth — Documento de design

## Visão
RTS clássico que mistura **Rise of Nations** (progressão por Idades, fronteiras nacionais, atrito, biblioteca de
pesquisas, expansão por cidades) com **Age of Mythology** (deuses maiores e menores, Favor, heróis, criaturas
míticas, poderes divinos, Titãs) no panteão grego.

## Pilares
1. **Território importa**: só se constrói dentro das fronteiras; tropas inimigas dentro delas sofrem atrito.
   Expandir fronteiras (Civismo, Centros Cívicos, Fortalezas, Torres, Templos) é tão estratégico quanto lutar.
2. **Escolhas divinas permanentes**: 3 deuses maiores × 2 deuses menores por Idade = árvores de 24 combinações,
   cada uma com poder único, criatura mítica e tecnologias exclusivas.
3. **Pedra-papel-tesoura legível**: infantaria > cavalaria > arqueiros > infantaria; cerco > edifícios;
   heróis > míticos > humanos.
4. **Determinismo**: a simulação é reproduzível (mesma semente, mesmos comandos → mesmo resultado),
   o que habilita replays, saves compactos e multiplayer em lockstep.

## Recursos
| Recurso | Fonte | Uso |
|---|---|---|
| Comida | frutas, caça, fazendas | unidades, idades |
| Madeira | árvores | edifícios, arqueiros, cerco |
| Ouro | veios | militares, tecnologias, heróis |
| Conhecimento | filósofos na Academia | linhas da Academia, idades |
| Favor | cidadãos rezando no Templo | míticos, heróis, tecnologias divinas |

## Idades
Arcaica → Clássica (Templo) → Heroica (Academia + 2 pesquisas) → Mítica (4 pesquisas) → Titãs (Fortaleza + 6 pesquisas).
Cada avanço (exceto Titãs) exige escolher um deus menor.

## Vitória e modos
Conquista (eliminar todos) ou Maravilha (manter uma por 6 minutos). Modos alternativos (`GameConfig.mode`): **Deathmatch** (cofres cheios, Idade Clássica), **Regicídio** (cada jogador tem um Rei 👑; sem rei, o reino cai — a IA o guarnece) e **Rei da Colina** (clareira central; um time que a segura sozinho com tropas por 240 s vence; `state.koth` guarda time e segundos). Tipos de mapa (`mapType`): continental, montanhoso, florestas, deserto e lagos — presets de limiares do ruído de elevação em `mapgen.ts`.

## Arquitetura
```
src/core        simulação determinística (sem DOM): dados, mapa, sim, rede (lockstep), serialização
src/render      PixiJS: texturas procedurais, chunks, entidades, névoa, efeitos
src/ui          DOM: HUD, comandos, menus, enciclopédia; entrada
src/game        sessão (estado + agendador + seleção)
src/audio       WebAudio: síntese própria de efeitos, ambiente e música (lê o estado, nunca altera)
desktop/        wrapper Electron para Steam
tests/          vitest: dados, determinismo, pathfinding, simulação
scripts/        headless (IA x IA), balanceamento, screenshots automatizados
```
O renderizador nunca altera o estado; toda mutação vem de `Command`s aplicados no tick. A camada de
apresentação pode ser trocada (por exemplo, por Unity) sem reescrever as regras.

Movimento: A* em grade sem cortar cantos + movimento físico com a mesma regra (`canStep`). Regiões conexas do mapa
(`src/core/map/components.ts`, cache invalidado quando o bloqueio muda) respondem "há caminho?" sem A*: alvos em outra região
são abandonados (`moveTowards` devolve `blocked`), a IA não constrói onde selaria a passagem (`wouldSeal`) e a geração de mapas
alarga gargalos de 1 tile (pontos de articulação).

## Áudio
Tudo é sintetizado pelo próprio código em WebAudio (`src/audio/`), sem arquivos: nada a licenciar e nada a baixar. O áudio não
toca a simulação (pode usar `Math.random`) e só lê o estado.
- `engine.ts`: contexto criado no primeiro gesto; barramentos efeitos/interface/música/ambiente → mestre → compressor; reverberação
  por convolução com resposta ao impulso gerada; ruídos e cordas Karplus-Strong em cache (nada é alocado por disparo); limite de
  24 vozes (roubo da menos importante) e limite por categoria; `stats()` com vozes por categoria, pico, CPU e ganhos.
- `synth.ts` + `sfx.ts`: 47 receitas (bronze com parciais inarmônicas, carne/escudo, arco, flecha, catapulta, cascos, marcha, machado,
  picareta, colheita, martelos, sino, desabamento, fogo, mortes estilizadas sem gore, raio com trovão, terremoto, ondas, invocação,
  Titã, cura, interface de mármore/bronze, trompa), cada uma com variação de altura/tempo por disparo e nivelada por `renderOffline`.
- `events.ts`: a cada quadro lê os `state.effects`/`state.events` novos (por identidade: o núcleo descarta eventos antigos), escolhe
  a receita, atenua pela distância ao centro da câmera (fora da tela cai forte e abafa), faz pan por x e respeita a névoa do jogador
  local. Golpes demais num quadro viram a camada de batalha (clamor + choques esparsos com intensidade). Trabalho, marcha, cascos e
  fogo vêm de amostragens periódicas das unidades visíveis perto do centro.
- `ambience.ts`: bioma sob a câmera (amostragem da vista) → vento com rajadas, montanha, água/vagas, folhas, cigarras em ciclos e
  pássaros esparsos, com crossfade.
- `music.ts`: música generativa em modos gregos (dórico, frígio, mixolídio) com lira, aulos, bordão, tambor de moldura, bumbo e
  trompa; intensidade paz/tensão/batalha pelo combate visível e ataques sofridos (histerese); andamento e instrumentação crescem
  com a Idade; tema do menu; cadências de vitória/derrota; crossfade de 4–8 s. Frases com progressão e condução de vozes simples
  (passos, saltos compensados, notas do acorde nos tempos fortes, motivos reaproveitados) — nenhuma frase se repete em 10 min.
- Opções: volume geral, efeitos, música, ambiente e mudo (Ctrl+M), persistidos em `Settings`. Testes: `tests/audio.test.ts`
  (lógica pura) e `scripts/playtest-audio.mjs` (navegador).

## Multiplayer (lockstep)
`NetworkScheduler` envia os comandos locais para o tick `T + atraso` (2–12 ticks, escolhido pelo anfitrião pela pior latência
da sala) e só executa o tick `T` quando os comandos de todos os humanos para `T` chegaram. O relay (`server/relay.mjs`) apenas
repassa mensagens (`join`, `lobby`, `start`, `cmds`, `hash`, `left`, `chat`, `ping`, `kick`, `snapshot`, `resume`). A cada 100 ticks
os clientes trocam um hash do estado para detectar dessincronização (um relatório fica em `localStorage`; ver "Anti-trapaça e
relatório de dessincronização" abaixo). Comandos recebidos em nome de outro jogador são descartados. Se alguém cai, todos pausam; quem entra de novo na mesma sala com o mesmo nome recebe do anfitrião
um instantâneo (estado serializado + comandos já recebidos) e volta a enviar comandos a partir de um tick combinado
(`NetworkScheduler.resumeTick`); comandos que chegam antes do instantâneo para ticks posteriores a ele são preservados. Como só
comandos trafegam, a banda é mínima e replays são gratuitos (gravar os comandos; um replay gravado após carregar um save parte desse save).
**Espectadores** ocupam vagas ≥ 100 no relay: recebem lobby, `start`, comandos e hashes, nunca enviam comandos nem são aguardados
(`NetworkScheduler` com `local = -1`), veem o mapa revelado só na renderização e entram no meio da partida pelo mesmo instantâneo.
A **lista pública de salas** (`list`/`rooms`) mostra salas abertas (entrar) e em andamento (assistir); o anfitrião pode ocultar a sala.
**Mapas fixos**: o anfitrião escolhe um mapa (embutido, Meus mapas ou arquivo); a sala vê só o resumo (nome, tamanho, inícios, hash) e
o `FixedMapData` inteiro vai uma vez dentro de `start.config` (limite de 1 MB no relay); cada cliente migra e valida o mapa antes de
criar a sessão, e o hash do estado cobre terreno e recursos, de modo que qualquer divergência aparece no primeiro hash trocado.
Na Steam, o mesmo protocolo roda sobre Steam Networking Sockets (relay da Valve) com `steamworks.js`.

### Anti-trapaça e relatório de dessincronização (4.5)
Como cada cliente simula tudo, "trapaça" aqui é um cliente modificado mandando comandos que o jogo normal não mandaria; a defesa é
cada cliente validar tudo do mesmo jeito (comando inválido = no-op em todas as máquinas) e o relay não deixar uma vaga falar por outra.
- **Forma** (`sanitizeCommand`, `src/core/sim/validate.ts`, chamado no início de `applyCommand` — vale para rede, interface, IA e
  replays): objeto com `type` conhecido; `player` inteiro de um jogador existente e vivo (espectador −1 e eliminado não comandam);
  ids inteiros (lista ≤ `MAX_CMD_IDS` = 600; repetições ficam — a própria IA as manda e tirá-las mudaria a partida); coordenadas
  finitas até `COORD_MARGIN` = 512 tiles fora da borda (a câmera deixa clicar um pouco fora do mapa e a ordem vai à borda, como
  sempre); cantos de obra inteiros dentro do mapa; unidade/edifício/tecnologia/poder/deus menor como chave própria das tabelas de
  dados (`__proto__`, `constructor`, `toString` não passam); postura, formação, recurso e ação de mercado da lista; `queue` só `true`
  liga. A cópia devolvida tem só os campos do tipo (campos a mais somem).
- **Regras** (`applyCommand` e o que ele chama): só entidades do próprio jogador obedecem (ids alheios são ignorados, mesmo
  misturados na lista); atacar só unidade/edifício vivo de um inimigo, e unidade guarnecida não é alvo; coletar só em nó do mapa ou
  na própria fazenda; rezar só no próprio templo/portal; reparar só o próprio edifício; guarnecer só em edifício aliado; treinar,
  pesquisar, contratar sábio, avançar de Idade (deus menor entre as opções) e poderes (os que o jogador tem e ainda não usou) checam
  edifício próprio e completo, fila (≤ 10), Idade, proibições do cenário e custo **antes** de pagar; `cancel` devolve o que foi pago;
  fila de ordens (Shift) ≤ `MAX_ORDER_QUEUE` = 600 por unidade. O `tick` ainda envolve cada comando de fora num `try/catch` (conta em
  `getRuntime(state).commandErrors`; o esperado é 0) para que um bug nunca derrube a partida — o descarte é igual em todos.
  A validação faz parte da simulação: `SIM_VERSION` 3 (o relay não junta na mesma sala um cliente que valida e outro que não).
- **Rede** (`NetworkScheduler.receive`): tick inteiro ainda não executado; lista que não é array vira vazia; de outro par, só
  comandos em nome dele, até `MAX_CMDS_PER_TICK` = 1024 (uma muralha arrastada vira um comando por tile no mesmo tick), e só a
  primeira mensagem de cada (par, tick) vale — uma segunda, diferente, chegaria a um par antes e a outro depois de executar o tick.
  Hashes que não são uint32 são ignorados.
- **Relay** (`server/relay.mjs`): sabe a vaga de cada conexão e repassa só os comandos com `player` igual ao índice dela em
  `room.slots` (a lista vai mesmo vazia: o tick precisa chegar a todos); `cmds` só com a partida começada e com tick estritamente
  crescente por conexão; mensagem > 512 KB de quem não é anfitrião é recusada (`tooBig`) sem interpretar; JSON malformado (ou que não
  é objeto com `t`) recebe `badMessage` e a sala segue; uma vaga por conexão; balde por conexão de 400 mensagens (repõe 100/s — o
  lockstep manda 20/s) e 4 MB (repõe 1 MB/s; o anfitrião, que manda instantâneos, fica fora do de bytes): estourou → `rateLimit` e só
  essa conexão cai (os outros recebem `left`, como numa queda). `--no-rate-limit` desliga os baldes (teste de carga acelerado).
- **Não coberto**: visão. A névoa é só da renderização e todo cliente tem o estado inteiro, então um cliente modificado pode revelar o
  mapa para si; comandos sobre alvos que o jogador não vê também não são recusados (a interface só os emite sobre o que é visível).
- **Relatório de dessincronização** (`src/core/net/desync.ts`): junto com o hash total, cada par manda a cada 100 ticks um
  detalhamento (`stateHashParts`: versão, nº de jogadores, "mundo" — tick, sorteio, próximo id, terreno, nós, relíquias, cessar-fogo —
  e, por jogador, dados do jogador, recursos, unidades e edifícios). Na primeira divergência, `NetworkScheduler.lastDesync`
  (`DesyncReport`) guarda o tick, o hash local e o de cada par, as categorias divergentes por par (`resources:1`, `units:0`, `world`;
  `?` se o par é de uma versão sem detalhamento) e um resumo legível do estado local nesse tick (`summarizeState`: recursos,
  população, contagem e soma de vida de unidades e edifícios por jogador, nós). A partida avisa onde divergiu ("Divergência em:
  recursos de B…"); o relatório vai para `localStorage` (`aoe_desync_v1`, com o save; sem espaço, sem o save) e para o "Exportar
  diagnóstico" (`desync` e `desyncLive`). Comparar o `summary` dos diagnósticos de dois jogadores aponta o valor que difere; o save
  permite reproduzir a partida com `Session.load`. O stateHash total não mudou (o detalhamento é calculado à parte).

## Profundidade (Fase 5.2)
Veterania: unidades militares (exceto Titãs) sobem 3 patentes com abates (3/8/15), +10% de ataque e vida por patente (estrelas na unidade).
Heróis têm uma habilidade ativa (`data/abilities.ts`, comando `ability`, tecla Q) com recarga e efeito temporário guardado na unidade
(`buffUntil`, `buffAttack`, `buffSpeed`, `buffHaste`, `buffWard`, `chargeUntil`) — tudo determinístico. Formações (linha, quadrado, coluna,
cunha) são escolhidas no painel e enviadas com a ordem. Relíquias (`state.relics`) ficam no chão; heróis as recolhem e guardam num Templo,
que rende favor por segundo enquanto estiver de pé.

## Controle (Steam Deck / Xbox)
`src/ui/gamepad.ts` lê `navigator.getGamepads()` uma vez por quadro no laço de `main.ts` (sem eventos; funciona no Electron e no
navegador) e trabalha com o mapeamento "standard" (índices A=0 … D-pad 12–15). Analógicos: zona morta radial (15 %, reescalada
para não ter degrau) e curva de resposta (expoente 1,7). Nada de regra de jogo nova: o controle só chama os mesmos métodos que o
mouse e o teclado — `Input.pointerPress/pointerMoveTo/pointerRelease` (clique, retângulo de seleção, colocação, alvos de poder,
ordem contextual) e as ações públicas extraídas dos atalhos (`escape`, `stopSelected`, `attackMoveAtPointer`, `useAbility`,
`selectArmy`, `cycleSelectionType`, `cycleGroups`…); comandos continuam passando por `Session.issue` (determinismo e multiplayer
intactos).
- **Partida**: um cursor virtual (`#pad-cursor`, DOM acima do canvas, mesmas coordenadas de tela do mouse) anda com o analógico
  esquerdo (aceleração ao segurar no máximo, freio e ímã leve sobre unidades); o direito rola a câmera (LT + vertical: zoom).
  Tabela de ações configurável (`SCHEMES`: "padrão" e "alternativo" com A↔B e analógicos trocados): A/RT selecionar (segurar e
  mover = retângulo), B ordem contextual/cancelar, X atacar-mover no cursor, Y parar, LB grupos de controle, RB tipos da seleção,
  LT modificador (A/B/X/Y acionam a página atual de 4 botões do painel, LB/RB trocam a página, ▲ salva a seleção num grupo),
  D-pad ◀ ocioso ▶ exército ▲ Centro Cívico ▼ habilidade/poder (poder global pede A para confirmar), Start menu, ⧉ segurado
  visão geral (`fitMap` temporário; soltar com o cursor num ponto leva a câmera até lá), L3 mesmo tipo na tela. Sobre o HUD,
  A clica o botão sob o cursor (dicas aparecem como no mouse) e o minimapa recebe o mesmo `pointerdown`.
- **Menus e modais**: foco navegável (`.pad-focus`, anel dourado) em ordem visual (`navPick`, navegação espacial); A ativa
  (listas: A entra na edição, ✚ troca, A confirma e só então dispara `change`; faixas: ◀▶ ajustam), B fecha/volta
  (`#m-continue`/`#m-close`/`#m-cancel`, `MainMenu.navBack`), LB/RB trocam abas. `confirm`/`alert`/`prompt` disparados por um
  clique do controle viram um diálogo navegável (`#pad-dialog`) — os nativos travariam o laço.
- **Prioridade** (`DeviceArbiter`): qualquer uso do controle o ativa (`html.pad-active` esconde o cursor do sistema e mostra as
  dicas `#pad-hints`/`#pad-nav-hints`); mover o mouse ≥ 8 px numa rajada ou clicar devolve tudo ao mouse.
- **Opções** (`Settings.padSensitivity/padInvertY/padScheme/padVibration`, com padrões para saves antigos) e vibração curta
  (`vibrationActuator`, no máximo a cada 1,5 s) no alerta de ataque (`HUD.onAlert`).
- **Legibilidade no Deck (1280×800, interface a 130 %)**: com largura útil < 1180 px o HUD entra em `#hud.narrow` (barra superior
  compacta, nada quebra linha) e `--uiz` compensa o `vh` multiplicado pelo zoom para o menu e os modais caberem na tela.
- O editor de mapas continua só com mouse/teclado nesta etapa (o controle apenas navega os modais dele).

## Times e co-op
`Player.team` define alianças: aliados não se atacam, compartilham visão, não sofrem atrito no território um do
outro e vencem juntos (conquista ou maravilha). A IA reconhece aliados e escolhe inimigos por time.

## Campanha
Cenários (`src/core/scenario`) rodam dentro da simulação: objetivos avaliados por segundo, gatilhos com
contexto (falas, revelar objetivos, invocar esquadrões — sempre em tiles ligados ao alvo) e condições de vitória/derrota. O estado
do cenário (objetivos, gatilhos disparados, `vars`) é serializado nos saves; `ctx.seconds` é inteiro. Novas missões são dados +
pequenas funções, sem tocar no motor; o editor interno e os cenários em JSON estão em `docs/EDITOR.md`.
**Dificuldade da campanha** (`GameConfig.campaignDifficulty`): as invasões roteirizadas passam por `scaledGroup` (Fácil ≈ 2/3, Difícil
≈ 1,5×) e as IAs inimigas sobem um degrau no Difícil; vale para a Horda. Missões concluídas no Difícil ficam em `aoe_campaign.hard`
(conquistas por missão, prólogo no Difícil, Horda no Difícil).

## Roteiro
1. ✅ Fatia vertical: skirmish contra IA com todos os sistemas centrais.
2. ✅ Times/co-op e multiplayer em lockstep via relay WebSocket (testado com dois navegadores); Modo Horda cooperativo; replays por gravação de comandos.
3. ✅ Prólogo da campanha (3 missões) com sistema de cenários reutilizável.
4. ✅ Jogabilidade sólida: guarnição, portões, formações, IA "Muito difícil" e aliadas coordenadas, idiomas PT-BR/EN, opções, caça a bugs (48 correções).
5. ✅ Multiplayer robusto: lobby com chat/ping/kick, atraso dinâmico, reconexão por instantâneo, anti-trapaça básico.
6. ✅ Modos (Deathmatch, Regicídio, Rei da Colina) e tipos de mapa.
7. Editor de cenários + mapas fixos (concluído: `docs/EDITOR.md`, Etapas 0–5; mapas oficiais por `scripts/maps/`); campanha completa (Titanomaquia em 3 atos).
8. Arte final (sprites 2.5D), animações, música; Steam (Networking Sockets, conquistas, cloud saves, Workshop).
