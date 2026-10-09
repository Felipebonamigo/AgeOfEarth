# E9 + E10 — Interface final (enciclopédia, textos, configuração, controle) e balanceamento das 8 Eras

- Estado: pendente · Pré-requisitos: **E9** — E1, E2, E3, E4, E5, E6 e E7 concluídas (na ordem oficial a E8 vem antes; sem
  ela os ícones e a arte continuariam provisórios, o que não muda nada da E9). **E10** — E1 a E9 concluídas; os blocos de
  desempenho do renderizador, `art:diff` e capturas da loja (N3, P1–P3) exigem a **E8** pronta (na ordem oficial ela vem antes) · Estimativa: **E9 4 dias**,
  **E10 6 dias** de trabalho do agente (metade da E10 é espera de medições longas, sempre em segundo plano)

> **Antes de começar:** leia `docs/eras/LEIA-ME.md` (rotina de cada sessão, regras, quando parar) e marque cada
> passo em `docs/eras/PROGRESSO.md`. Ordem das etapas: E1, E2, E3, E4, E5+E7, E6, E8, E9+E10. Onde este guia falar de
> commit ou de push, vale a rotina do LEIA-ME: um commit por passo e push só para a branch da sessão.

> Guia para um agente que **não** viu a conversa que o escreveu. Siga os blocos na ordem: **Parte 1 = E9** (blocos 0, A–G,
> um commit) e **Parte 2 = E10** (blocos H–P, um commit). Todo caminho citado existe no código de 06/10/2026 (commit
> `00a3809`) ou está marcado "(novo)", "(da E1)" … "(da E8)". As etapas E1–E8 mexem em volta dos trechos citados: se um
> trecho não estiver exatamente como descrito, procure **pelo nome da função ou da chave** e aplique a mesma mudança sobre
> o que elas deixaram; nunca desfaça nada delas. Números de linha são aproximados. **Se um arquivo ou símbolo marcado
> "(da E<n>)" não existir, pare: a pré-condição não foi cumprida.** Todo número de jogo da E10 vem das tabelas daqui;
> não invente outro. Revisado em 09/10/2026 contra o código e os guias E1–E8 (nomes, assinaturas, ids e comandos).
> Lembrete de shell: `npm run <script>` **engole** as opções `--x` que vêm antes de um `--`; passe-as depois dele
> (`npm run balance 60 1-18 -- --jobs 3`) ou rode o script direto com `npx tsx`/`node`.

---

## Objetivo e resultado jogável

### E9 — o resto da interface

Ao fim da E9, em PT e em EN, com mouse, teclado e controle:

- **Enciclopédia** (F2, menu da partida e menu principal) com **8 abas** geradas dos dados: Unidades (agrupadas em linhas,
  navios, heróis, criaturas, Titãs e outras, com linha · Era), **Linhas** (as linhas de unidade × as 8 Eras, com o
  pedra-papel-tesoura), Edifícios, **Maravilhas** (Era, pontos, efeito e, numa partida, o dono atual), Tecnologias
  (agrupadas por edifício; as linhas da Biblioteca resumidas por nível), **Deuses** (as 6 escolhas por Era de cada deus
  maior, os 18 menores com poder, criatura e a escala do poder, as Bênçãos e o Titã), **Eras** (custo, requisitos, deus
  menor, o que chega; numa partida, a sua Era marcada e o botão da árvore de estudos) e **Recursos** (os 7 recursos, as
  fontes no mapa, quem coleta e os raros com o bônus). Filtro "Era" nas abas Unidades, Edifícios, Maravilhas,
  Tecnologias e Deuses. Nenhum emoji, nenhum id cru.
- **Ajuda** (F1) com 4 seções novas (Eras e Biblioteca, Recursos, Mar e comércio, Maravilhas) e objetivo e combate
  reescritos; **18 dicas** na tela de carregamento.
- **Todos os textos PT/EN novos revisados**: um teste automático (glossário PT→EN, números iguais nos dois idiomas, nenhum
  acento do português no inglês, descrição EN nunca cópia da PT, plural EN, nenhuma "Idade"/"Academia" sobrando, requisito
  das Eras igual ao da descrição) e uma planilha gerada (`docs/eras/textos-pt-en.md`) lida de ponta a ponta.
- **Configuração de Eras no multiplayer**: a lista de salas mostra as Eras e a regra de maravilha; o menu da partida diz
  "Partida: Eras I–VIII · Pontos de maravilha" para todos (inclusive convidados e espectadores); o relay só aceita
  valores válidos de Era e de vitória.
- **Controle na árvore de estudos**: foco inicial no primeiro estudo disponível, D-pad entre os nós, **LB/RB = Era
  anterior/seguinte**, o painel de detalhe acompanha o foco, o outro analógico rola a grade, A estuda, B fecha; o foco
  sobrevive ao redesenho ao vivo.
- **Playtests** estendidos (`playtest.mjs`, `playtest-noemoji.mjs`, `playtest-i18n.mjs`, `playtest-gamepad.mjs`,
  `playtest-mp.mjs`, `playtest-rooms.mjs`) e um novo, **`scripts/playtest-eras.mjs`**, que atravessa as 8 Eras no
  navegador pelo caminho do jogador.

### E10 — balanceamento, IA em partidas longas, justiça de posição e desempenho

Ao fim da E10, numa partida rápida padrão (3 IAs Normal, mapa médio continental):

- as Eras chegam no **ritmo alvo** da `docs/ERAS.md` §1 — II ~4, III ~9, IV ~14, V ~20, VI ~26, VII ~33, VIII ~40 min —
  medido pela mediana de 54 IAs (18 sementes × 3) em 60 min, dentro da tolerância da tabela E10-1;
- nenhuma IA **para** (cidadãos todos ociosos, nada feito em 10 min) nem **trava** numa Era por motivo que não seja
  recurso, em 60 e 75 min, nas 4 dificuldades e nos 3 tipos de mapa com mar;
- a justiça de posição continua dentro do critério nos mapas oficiais (Egeu navegável e Estreito) e o critério de
  **índice** passa nos mapas com mar gerados;
- a simulação aguenta 60 min de 4 IAs Muito difícil no mapa grande dentro do orçamento; o renderizador e a rede, com as
  unidades e Eras novas, dentro dos orçamentos de `docs/ART.md` §6 e do relay;
- a **campanha não muda**: `npx tsx scripts/missions.ts` dá os mesmos veredictos e minutos de antes da E10, nas 3
  dificuldades;
- referências do `art:diff` e **screenshots da loja** (PT e EN) refeitas com o jogo final, e os números da página da loja
  (`docs/steam/LOJA.md`) em dia.

---

## Decisões já tomadas (não reabrir; cite docs/ERAS.md)

Do plano aprovado pelo dono (`docs/ERAS.md`):

- **§1:** 8 Eras; ritmo alvo II ~4, III ~9, IV ~14, V ~20, VI ~26, VII ~33, VIII ~40 min, partida completa em 45–60 min;
  Era inicial e final configuráveis; a campanha continua nas Eras I–IV.
- **§2:** a interface ganha a árvore de estudos (tela inteira, por Era e por linha), com o que está liberado, em andamento
  e bloqueado. **§3:** 7 recursos (petróleo só a partir da IV), recursos raros com Mercador. **§4:** 11 linhas de unidade
  com o pedra-papel-tesoura de hoje em todas as Eras. **§6:** deus menor da II à VII, poderes que crescem com a Era,
  Bênçãos. **§8:** naval, mapas Costeiro/Ilhas/Mediterrâneo, justiça de posição nos mapas com mar. **§9:** 20 maravilhas
  únicas no mapa e vitória por pontos.
- **§10:** "Interface: … configuração de Eras na partida, enciclopédia e textos PT/EN de tudo (centenas de nomes)";
  "IA: … partidas de 60 min sem travar; justiça de posição". **§11:** E9 = interface (corre junto de E1–E8), E10 =
  balanceamento e IA em partidas longas, justiça de posição, desempenho com mais unidades.

Das etapas anteriores (não reabrir):

- **E1** D11/D2: campanha com `maxAge: 3` e `visualEraMax: 2`; os custos das Eras II–IV são os da campanha. D17: a árvore
  não entrou na enciclopédia na E1 (fica para a E9 decidir: ver D6 abaixo). D18: atalhos E (avançar, com Biblioteca) e
  F3 (árvore). Seletores de Era na partida rápida, no lobby e no Testar do editor já existem (`src/ui/era-select.ts`).
- **E2** D10, **E3** D4, **E4** D14, **E6** D5, **E7** D14: dentro de cenário (campanha, Horda, cenários JSON) vale o
  conteúdo clássico — elenco clássico, sem navios, sem escala dos poderes, maravilhas clássicas. **A E10 segue a mesma
  regra** (D16).
- **E8** D29: a E8 não muda o núcleo. A E8 cria `window.aoe.debugData()` e `debugSetAge()`.

Decisões deste guia (cada uma com o motivo em uma linha):

| # | Decisão | Motivo |
|---|---|---|
| D1 | A enciclopédia vira um **módulo puro** `src/ui/encyclopedia.ts` (`ENC_TABS`, `encyclopediaHtml`, `encyclopediaBody`); o HUD só monta o modal e liga os cliques. | Testável sem DOM, como `scenario-hud.ts` e `studytree.ts`; o `hud.ts` já tem 800+ linhas. |
| D2 | **8 abas, nesta ordem:** `units`, `lines`, `buildings`, `wonders`, `techs`, `gods`, `ages`, `resources`. Os ids de hoje ficam (`ages` é a aba Eras). | O controle guarda o foco por `tab:<id>` e os playtests clicam `[data-tab="…"]`. |
| D3 | A enciclopédia mostra **sempre o jogo inteiro**; numa partida de cenário, as abas Unidades/Linhas e Maravilhas avisam que vale o elenco ou as regras clássicas. | Enciclopédia é referência; esconder conteúdo por partida confundiria mais do que o aviso. |
| D4 | **Filtro "Era"** (`<select id="enc-era">`: Todas, I…VIII) nas abas `units`, `buildings`, `wonders`, `techs`, `gods`; guardado só na memória do HUD (campo `encEra`), sem gravar. | São as abas longas; preferência de tela não precisa de `storeSet`. |
| D5 | Nada de emoji no HTML novo: ícones `ic.*`, `glyph()`; os rótulos de aba passam por `noEmoji` (os de hoje têm emoji). | Regra "nenhum emoji" (`tests/hud-icons.test.ts`, `playtest-noemoji`). |
| D6 | **A árvore não vira aba**: na aba Eras, com partida aberta, o botão "Abrir a árvore de estudos (F3)" (`#enc-tree`). No menu principal (sem partida) as abas Eras e Linhas já mostram o conteúdo da árvore. | A árvore depende do estado do jogador (fila, recursos); copiá-la sem estado duplicaria código. |
| D7 | Ajuda: 4 seções novas e `help.goal`/`help.combat` reescritos; `help.goal` ganha a variável `{hold}` (minutos da vitória por pontos). | O texto de hoje fala em "uma Maravilha por {min} minutos" e Idades. |
| D8 | Revisão de textos = **teste automático** `tests/i18n-eras.test.ts` + **planilha gerada** `docs/eras/textos-pt-en.md` (só o que é novo ou mudou desde o commit `00a3809`, pela base `docs/eras/E9-base-textos.json` que acompanha este guia). | Centenas de nomes: o teste pega os erros mecânicos; a planilha deixa a leitura humana viável. |
| D9 | Configuração: Eras e regra de maravilha na lista de salas e no menu da partida; o relay troca a validação genérica `WORD` por listas fechadas (`startAge` `auto`/`0`–`7`, `endAge` `0`–`7`, `wonderVictory` `points`/`hold`/`off`). | O convidado precisa ver o que vai jogar; `WORD` aceita "banana". |
| D10 | Controle na árvore: memória do foco por `data-study`, `padfocus` (evento disparado pelo controle) atualiza o detalhe, `data-scroll` diz o que rolar, LB/RB pulam de Era pela função pura `treeJump`, foco inicial por `data-autofocus` só no 1º desenho. | Hoje o foco do controle não dispara `focus` (o detalhe não muda), o analógico rola o modal errado e a memória cai no índice. |
| D11 | Playtest novo `scripts/playtest-eras.mjs`: comandos reais para avançar (tecla E na Biblioteca, carta do deus menor) e **atalhos de teste só para requisitos** (estudos empurrados em `player.techs`, edifícios por `debugBuild`, cofres cheios, simulação por `scheduler.step` e a espera do avanço já na fila encurtada para ~1 s). Sai com código 1 em qualquer falha. | Jogar 40 min por Era no navegador é inviável; o que interessa é a interface em cada Era. |
| D12 | Gancho de teste novo `window.aoe.debugNames()` (nomes, degraus, requisitos por Era), fora do lockstep, como `debugSpawn`. | Os playtests `.mjs` não importam TypeScript; nomes fixos no script quebrariam em EN. |
| D13 | **Universidade e Fábrica** (§5) não estão em nenhum guia E1–E8: a E9 não as cita nos textos e registra a lacuna para o dono. | Texto não pode prometer o que o jogo não tem. |
| D14 | A E9 **não muda a simulação**: só textos (inclusive `desc` em `src/core/data`, que não entra no hash), interface, relay e scripts. `SIM_VERSION` não sobe; o `smoke 20 42` dá o mesmo hash antes e depois. | A E10 sobe a versão uma vez. |
| D15 | Ritmo medido pela **mediana dos minutos de chegada** de todas as IAs (3 IAs Normal, mapa médio continental, 18 sementes, 60 min), com tolerância e taxa mínima de chegada por Era (tabela E10-1). | Mediana resiste a uma IA destruída cedo; 18 sementes é a regra do ROADMAP 1.5. |
| D16 | **Campanha intacta**: todo ajuste de ritmo da IA vai num objeto `AI_PACE` usado **só fora de cenário**; dentro de cenário a IA usa `AI_PACE_CLASSIC` (os valores de hoje). Os dados das Eras II–IV, dos níveis 1–4 das linhas e das 35 unidades clássicas **não mudam** (o teste novo congela). `missions.ts` tem de sair igual à base. | Mesmo padrão de E2–E7; o harness das 12 missões × 3 dificuldades é estrito e caro de recalibrar. |
| D17 | Botões de ajuste permitidos, nesta ordem (escada E10-4): (1) `AI_PACE`; (2) dados das Eras V–VIII (`AGES[4..7]`: `techCount`, `time`, `cost`) e o multiplicador novo `LINE_LEVEL_COST_MULT` dos níveis 5–7 das linhas (índices 4–6; o nível 8 só se estuda na Era VIII e não pesa em nenhum avanço); (3) tabelas da IA que só rodam fora de cenário (E2 `MERCHANT_MAX_AI`, E4 `FISH_BOATS`/`WARSHIPS_*`, E5 `CARAVAN_TARGET_AI`). **Nunca** `DIFFICULTIES`/`thinkEvery`. | Cada botão mexe num ponto conhecido sem tocar na campanha; `thinkEvery` muda a dificuldade, não o ritmo. |
| D18 | Se II–IV não fecharem só com o `AI_PACE`: **pendência para o dono** com os números (mudar custo/tempo de II–IV muda a campanha). | Decisão de produto, não de agente. |
| D19 | `scripts/balance.ts` é **estendido** (não um script novo): sementes por intervalo (`1-18`), `--jobs`, `--json`, `--targets`, `--stalls-only`, `--diff`, `--map-type`, `--size`, detectores a cada 10 min e marcos por IA. O uso de hoje (`npm run balance 35 1,2,3`) continua igual. | CLAUDE.md, QA.md e os guias E1–E7 já chamam `npm run balance`. |
| D20 | Detectores (tabela E10-5): **PARADA** e **TRAVADA** (por motivo que não seja recurso) reprovam; **TRAVADA-RECURSO**, **ACUMULANDO** e **SEM-ONDAS** só se registram. | Uma IA sob ataque pode ficar sem recurso de verdade; uma IA que tem tudo e não avança é bug. |
| D21 | Fim de partida é critério **macio** (registrar): ≤ 25 % das sementes terminando antes de 30 min e mediana ≥ 40 min das que terminam. | A agressividade da IA é ajuste fino de playtest humano; a E10 só evita o extremo (escada, último degrau). |
| D22 | Justiça: Egeu e Estreito a **60 min**, 1–16, `--both`, critério de sempre (posição e índice); o Egeu também com `--mirror-ai`; mapas com mar **gerados** (Costeiro, Ilhas, Mediterrâneo, semente de mapa 42) só pelo critério de **índice** (o mapa gerado não é simétrico, então "posição" mistura mapa e motor). | Mesmo critério do CLAUDE.md; o índice mede o motor/IA em qualquer mapa. |
| D23 | Simulação: `scripts/perf.ts` 60 min, 4 IAs Muito difícil, mapa grande — **média ≤ 5 ms/tick em todo minuto, p95 ≤ 12 ms, pior ≤ 50 ms**; também com `--map-type mediterranean` e `--start-age 4`. Otimização **só** se o hash do `smoke` e a saída do `missions.ts` ficarem idênticos. | 5 ms/tick a 20 Hz ≈ 1,7 ms por quadro a 60 fps, dentro dos 3 ms de `docs/ART.md` §6; otimizar sem mudar o resultado é o único caminho seguro sem novo balanceamento. |
| D24 | Render: `renderperf` (Médio, `--reveal`, `--start-age 6`, 400 unidades de Eras altas) e `rendercpu` (`--battle 100` com linhas de pólvora, `--powers`): critérios de `docs/ART.md` §6 (texturas ≤ 160 MB típico, CPU de `renderer.render` ≤ 3 ms de média e ≤ 6 ms de p95, draw calls ≤ 40 ou no máximo +10 % sobre a base da E8). | Os orçamentos já aprovados; a E8 mediu a base da arte. |
| D25 | Rede: `loadtest` 60 min, 4 bots, queda aos 45 e espectador aos 50: todos os hashes iguais e instantâneo < 4 MB (balde do relay). | Partidas mais longas e com mais unidades aumentam o instantâneo de reconexão. |
| D26 | `SIM_VERSION` +1 **uma vez**, no fim do bloco K. O formato do save não muda (nenhum campo novo de estado). | A mesma semente dá outra partida fora de cenário. |
| D27 | Capturas finais: `art:shot` + `art:diff` (referência só se atualiza depois de olhar a diferença); `store:shots` PT e EN com **2 cenas novas** (`moderna`: cidade da Era Industrial/Moderna com exército de pólvora; `mar`: batalha naval no Mediterrâneo). | A loja precisa mostrar as Eras e o mar que o jogo agora tem. |
| D28 | `docs/steam/LOJA.md`: troca só as frases factuais que mudaram (textos prontos em E10-8); o tom e o resto ficam; o dono aprova. | A página não pode dizer "Cinco Idades". |
| D29 | A E10 **não** mexe em arte, manifestos nem bake. | A arte é da E8; mudar `scripts/bake/page/*` reassa tudo. |

---

## Arquivos que mudam

### E9

| Caminho | O que muda |
|---|---|
| `src/ui/encyclopedia.ts` (novo) | `ENC_TABS`, `ENC_ERA_FILTER`, `EncCtx`, `unitGroup`, `encyclopediaBody`, `encyclopediaHtml` (as 8 abas) |
| `src/ui/hud.ts` | `showEncyclopedia` usa o módulo novo e o filtro `encEra`; `showHelp` com as seções novas e `{hold}`; `showMenu` com a linha da partida (`#m-matchinfo`); `showHotkeys` com `U` (se faltar); `renderStudyTree` (da E1) com `autofocus` e `padfocus` |
| `src/ui/studytree.ts` (da E1) | `studyTreeHtml` ganha `data-era`/`data-row` nos nós, `data-scroll` no corpo e o parâmetro `opts.autofocus` |
| `src/ui/gamepad.ts` | `treeJump` (nova, exportada); `keyOf` com `study:`; `setFocus` dispara `padfocus`; `scrollBox` lê `[data-scroll]`; `navTab` pula de Era na árvore; `navHints` mostra LB/RB na árvore |
| `src/ui/menu.ts` | lista de salas com as Eras e a regra de maravilha |
| `src/ui/loading.ts` | `LOADING_TIPS = 18` |
| `src/ui/styles.css` | `.enc-filter`, `.enc-note`, `tr.enc-cur`, `td.enc-retired` |
| `src/i18n/strings.ts` | chaves novas e textos revistos (PT e EN; tabelas E9-2 a E9-4) |
| `src/i18n/en-data.ts` | correções que o teste e a planilha apontarem |
| `src/core/data/*.ts` | só textos (`name`/`desc`/`perks`) que a revisão corrigir — nada de número |
| `src/core/scenario/missions/*.scenario.json`, `src/core/scenario/campaign.ts` | só textos `"pt"`/`"en"` que a revisão corrigir |
| `src/net/client.ts` | `RoomSummary.startAge?`, `endAge?`, `wonderVictory?` |
| `server/relay.mjs` | `cleanSettings` com listas fechadas; `rooms` leva `startAge`, `endAge`, `wonderVictory` |
| `src/main.ts` | `window.aoe.debugNames()` |
| `scripts/i18n-review.ts` (novo) | gera `docs/eras/textos-pt-en.md` |
| `scripts/playtest-eras.mjs` (novo) | playtest das 8 Eras |
| `scripts/playtest.mjs`, `scripts/playtest-noemoji.mjs`, `scripts/playtest-i18n.mjs`, `scripts/playtest-gamepad.mjs`, `scripts/playtest-mp.mjs`, `scripts/playtest-rooms.mjs` | conferências novas (bloco F) |
| `tests/encyclopedia.test.ts` (novo), `tests/i18n-eras.test.ts` (novo) | testes novos |
| `tests/gamepad.test.ts`, `tests/relay-anticheat.test.ts`, `tests/hud-icons.test.ts`, `tests/studytree.test.ts` (da E1) | atualizações (seção "Testes") |
| `docs/eras/E9-base-textos.json` | **já existe** (gravado junto deste guia): hash dos textos PT do commit `00a3809`; não edite |
| `docs/eras/textos-pt-en.md` (novo) | planilha gerada por `scripts/i18n-review.ts` |

### E10

| Caminho | O que muda |
|---|---|
| `src/core/sim/ai.ts` | `AiPace`, `AI_PACE_CLASSIC`, `AI_PACE`, `AI_PACE_LIMITS`, `aiPace(state)`; os números fixos lidos do `AiPace` |
| `src/core/data/ages.ts` (da E1) | `techCount`/`time`/`cost` das Eras 4–7 pela escada; `desc` PT junto quando o `techCount` muda |
| `src/i18n/en-data.ts` | `EN_AGES['4'..'7'].desc` junto do PT |
| `src/core/data/techs.ts` | `LINE_LEVEL_COST_MULT` (novo, exportado) aplicado em `line()` |
| `src/core/data/index.ts` | reexporta `LINE_LEVEL_COST_MULT` |
| `src/core/constants.ts` | `SIM_VERSION` +1; `MERCHANT_MAX_AI` (da E2) e `CARAVAN_TARGET_AI` (da E5) só se a escada mandar |
| `scripts/balance.ts` | flags novas, detectores, marcos, resumo `--targets` |
| `scripts/perf.ts` | `--seed`, `--size`, `--map-type`, `--start-age`, `--json`; veredito do orçamento |
| `scripts/renderperf.mjs`, `scripts/rendercpu.mjs` | `--start-age N`; `renderperf` também `--types a,b,…` |
| `scripts/storeshots.mjs` | cenas `moderna` e `mar`; `ORDER` com 9 cenas |
| `scripts/profsum.mjs` (novo) | resumo de um `.cpuprofile` (funções com mais tempo próprio) |
| `tests/ai-pace.test.ts` (novo) | tabelas, limites, cenário clássico, II–IV e unidades clássicas congeladas |
| `docs/perf/*.json` | resultados das medições (balance, perf, renderperf, rendercpu, loadtest) |
| `docs/art/ref/*.png` | só se a diferença for intencional e olhada (passo P1) |
| `docs/steam/screens/`, `docs/steam/screens-en/`, `docs/steam/LOJA.md`, `docs/steam/PRESSKIT.md` | screenshots refeitas e frases factuais (E10-8) |
| `docs/QA.md`, `docs/ART.md`, `docs/EDITOR.md`, `docs/eras/PROGRESSO.md`, `docs/ROADMAP.md`, `CLAUDE.md` | números de referência e memória (seção "Ao terminar") |

**Não mexa em:** `src/core/scenario/testing.ts`, `src/core/scenario/missions/*.json` (números), `scripts/maps/*`,
`src/core/data/maps/*.map.json`, `art/manifest/*`, `scripts/bake/page/*`, `public/art/*` (exceto se a E8 mandar).

---

## Dados prontos

Todos os textos abaixo vão **nas duas tabelas** de `src/i18n/strings.ts` (`pt` e `en`), com as mesmas `{variáveis}`.
Valor EN com apóstrofo vai entre aspas duplas (como `"Poseidon's Stone"`, que já existe). **Nenhum emoji.** Todos os
números da E10 são os valores de partida do ajuste; a escada E10-4 diz como mudá-los.

### E9-1 — Abas da enciclopédia

| id | ícone (código) | rótulo (chave) | conteúdo | filtro Era |
|---|---|---|---|---|
| `units` | `ic.unit('hoplite', undefined, 'sm')` | `enc.units` (existe) | grupos linhas · navios · heróis · criaturas · Titãs · outras; colunas unidade, Era, linha · degrau, custo, vida, ataque (tipo traduzido), armadura, alcance, velocidade, onde, descrição | sim |
| `lines` | `glyph('fColumn')` | `enc.lines` | uma linha por `LINE_ORDER` × uma coluna por Era; degrau novo = ícone + nome; mesmo tipo = nome do estudo da Era; `·` = mantém; "aposentada" a partir de `retireAt` | não |
| `buildings` | `ic.bld('town_center', undefined, 'sm')` | `enc.buildings` (existe) | edifícios construíveis sem as maravilhas, por Era | sim |
| `wonders` | `ic.bld('wonder_zeus', undefined, 'sm')` | `enc.wonders` | regra (pontos, meta, manter) + maravilha, Era, pontos, custo, efeito, dono | sim |
| `techs` | `ic.tech('civic1', 'sm')` | `enc.techs` (existe) | linhas da Biblioteca resumidas (custo por nível) + as outras por edifício; sem evoluções (aba Linhas) nem Bênçãos (aba Deuses) | sim |
| `gods` | `ic.god('zeus', 'sm')` | `enc.gods` (existe) | por deus maior: perks, escolhas por Era, Titã; tabela dos menores (poder com a escala, criatura, pesquisas); Bênçãos | sim |
| `ages` | `ic.age(0, 'sm')` | `enc.ages` (existe) | Era, custo, requisitos, deus menor, o que chega, descrição; numa partida, a Era do jogador marcada e o botão `#enc-tree` | não |
| `resources` | `ic.res('food')` | `enc.resources` | os 7 recursos (fonte, desde, uso); fontes no mapa (rende, quem coleta, desde); raros (bônus) | não |

### E9-2 — Textos novos de interface

| Chave | PT | EN |
|---|---|---|
| `enc.lines` | Linhas | Lines |
| `enc.wonders` | Maravilhas | Wonders |
| `enc.resources` | Recursos | Resources |
| `enc.eraFilter` | Era | Era |
| `enc.allEras` | Todas as Eras | All Eras |
| `enc.empty` | Nada nesta Era. | Nothing in this Era. |
| `enc.group.lines` | Linhas de unidade | Unit lines |
| `enc.group.ships` | Navios | Ships |
| `enc.group.heroes` | Heróis | Heroes |
| `enc.group.myth` | Criaturas míticas | Mythic creatures |
| `enc.group.titans` | Titãs | Titans |
| `enc.group.other` | Outras unidades | Other units |
| `enc.line` | Linha | Line |
| `enc.retired` | aposentada | retired |
| `enc.linesIntro` | Cada linha tem um degrau por Era. A evolução se estuda na Biblioteca: as unidades da linha que você já tem se transformam e o treino passa a sair na versão nova. Os pontos (·) mantêm o degrau anterior. | Each line has one step per Era. Evolutions are studied at the Library: the line's units you already have transform, and training switches to the new version. Dots (·) keep the previous step. |
| `enc.linesRps` | Em todas as Eras vale o pedra-papel-tesoura: infantaria pesada vence cavalaria, cavalaria vence tiro, tiro vence infantaria, escaramuça vence tiro, cerco e artilharia derrubam edifícios; a infantaria da Era VIII tem dano dobrado contra tanques. | Rock-paper-scissors holds in every Era: heavy infantry beats cavalry, cavalry beats missile troops, missile troops beat infantry, skirmishers beat missile troops, siege and artillery bring down buildings; Era VIII infantry deals double damage to tanks. |
| `enc.classicNote` | Nesta partida (cenário) vale o elenco clássico: as unidades não evoluem pelas linhas. | This match (a scenario) uses the classic roster: units do not evolve along the lines. |
| `enc.classicWonders` | Nesta partida (cenário) valem as regras clássicas das maravilhas: só as 3 de antes, uma por jogador. | This match (a scenario) uses the classic wonder rules: only the original 3, one per player. |
| `enc.points` | Pontos | Points |
| `enc.owner` | Dono | Owner |
| `enc.free` | livre | free |
| `enc.wondersRule` | Cada maravilha é única no mapa (quem termina primeiro fica com ela) e vale o número da sua Era em pontos. O time que somar {target} pontos e mantiver por {hold} s vence. | Each wonder is unique on the map (whoever finishes it first keeps it) and is worth its Era number in points. The team that reaches {target} points and holds them for {hold}s wins. |
| `enc.lineStudies` | Linhas da Biblioteca (níveis I–VIII) | Library lines (levels I–VIII) |
| `enc.levels` | Custo por nível | Cost per level |
| `enc.evoNote` | As evoluções das linhas de unidade (estudos da Biblioteca) estão na aba Linhas; as Bênçãos, na aba Deuses. | Unit line evolutions (Library studies) are in the Lines tab; Blessings, in the Gods tab. |
| `enc.minorPairs` | Escolhas de deus menor por Era | Minor god choices by Era |
| `enc.choice` | Opção {n} | Option {n} |
| `enc.titansNote` | Na {age}, o Portal dos Titãs liberta {titan}. | In the {age}, the Titan Gate frees {titan}. |
| `enc.powerScales` | Fora dos cenários, cresce {pct}% por Era acima da {era}. | Outside scenarios, it grows {pct}% per Era above the {era}. |
| `enc.matchRule` | Nesta partida: {rule}. | This match: {rule}. |
| `enc.blessings` | Bênçãos do Templo | Temple Blessings |
| `enc.minorGod` | Deus menor | Minor god |
| `enc.yes` | sim | yes |
| `enc.no` | não | no |
| `enc.unlocks` | O que chega | What arrives |
| `enc.unlockCount` | {u} unidades · {b} edifícios · {w} maravilhas | {u} units · {b} buildings · {w} wonders |
| `enc.yourEra` | sua Era | your Era |
| `enc.openTree` | Abrir a árvore de estudos (F3) | Open the study tree (F3) |
| `enc.source` | Fonte | Source |
| `enc.since` | Desde | Since |
| `enc.use` | Uso | Use |
| `enc.nodes` | Fontes no mapa | Map sources |
| `enc.gives` | Rende | Yields |
| `enc.who` | Quem coleta | Who gathers |
| `enc.who.villager` | Cidadão | Citizen |
| `enc.who.boat` | Barco de pesca | Fishing boat |
| `enc.who.merchant` | Mercador | Merchant |
| `enc.who.extractor` | Poço de Petróleo (sozinho) | Oil Well (by itself) |
| `enc.rares` | Recursos raros | Rare resources |
| `enc.rareBonus` | Bônus enquanto alguém trabalha no raro | Bonus while someone works the rare resource |
| `enc.res.food.src` | Caça, frutas, fazendas e pesca (barcos de pesca) | Hunting, berries, farms and fishing (fishing boats) |
| `enc.res.food.use` | Cidadãos, unidades e Eras | Citizens, units and Eras |
| `enc.res.wood.src` | Árvores (Serraria) | Trees (Lumber Camp) |
| `enc.res.wood.use` | Edifícios, arqueiros, cerco e navios | Buildings, archers, siege and ships |
| `enc.res.stone.src` | Afloramentos de calcário (Pedreira) | Limestone outcrops (Quarry) |
| `enc.res.stone.use` | Muralhas, torres, fortalezas, o Templo, maravilhas e Eras | Walls, towers, fortresses, the Temple, wonders and Eras |
| `enc.res.gold.src` | Veios (Mina), caravanas, navios mercantes, o Mercado e recursos raros (Mercador) | Veins (Mine), caravans, merchant ships, the Market and rare resources (Merchant) |
| `enc.res.gold.use` | Militares, estudos e heróis | Military units, studies and heroes |
| `enc.res.oil.src` | Fontes de nafta (Era IV, Poço de Nafta) e jazidas (Era VII, Poço de Petróleo) | Naphtha seeps (Era IV, Naphtha Well) and oil fields (Era VII, Oil Well) |
| `enc.res.oil.use` | Fogo grego, artilharia, navios a vapor e tanques | Greek fire, artillery, steamships and tanks |
| `enc.res.knowledge.src` | Filósofos na Biblioteca | Philosophers at the Library |
| `enc.res.knowledge.use` | Estudos e Eras | Studies and Eras |
| `enc.res.favor.src` | Cidadãos rezando no Templo, relíquias e maravilhas | Citizens praying at the Temple, relics and wonders |
| `enc.res.favor.use` | Criaturas míticas, heróis, poderes e pesquisas divinas | Mythic creatures, heroes, powers and divine research |
| `menu.matchInfo` | Partida: Eras {from}–{to} · {victory} | Match: Eras {from}–{to} · {victory} |
| `menu.matchInfoScenario` | Cenário: Eras {from}–{to} | Scenario: Eras {from}–{to} |
| `mp.roomEras` | Eras {from}–{to} | Eras {from}–{to} |
| `pad.hint.eras` | Era anterior/seguinte | Previous/next Era |
| `help.erasTitle` | Eras e Biblioteca | Eras and the Library |
| `help.eras` | São 8 Eras, da Arcaica à Moderna. Tudo se estuda na <b>Biblioteca</b>, um estudo por vez em cada uma (fila de até 5): o avanço de Era, as 4 linhas (Civismo, Comércio, Militar e Ciência, um nível por Era) e a evolução de cada linha de unidade, que transforma as unidades que você já tem. Cada avanço pede estudos das linhas e, da II à VII, a escolha de um deus menor. Uma Biblioteca por Centro Cívico, até 3. A árvore de estudos (F3) mostra o que está feito, em andamento e bloqueado. | There are 8 Eras, from the Archaic to the Modern. Everything is studied at the <b>Library</b>, one study at a time in each (queue of up to 5): advancing the Era, the 4 lines (Civics, Commerce, Military and Science, one level per Era) and the evolution of each unit line, which transforms the units you already have. Each advance requires line studies and, from II to VII, the choice of a minor god. One Library per Town Center, up to 3. The study tree (F3) shows what is done, in progress and locked. |
| `help.resourcesTitle` | Recursos | Resources |
| `help.resources` | Pedra vem dos afloramentos de calcário (Pedreira) e paga muralhas, torres, fortalezas, o Templo, maravilhas e Eras. Petróleo aparece na Era IV: cidadãos colhem nafta nas fontes e a levam ao Poço de Nafta; na Era VII, o Poço de Petróleo construído numa jazida extrai sozinho. Recursos raros (oliveiras, vinhedos, mármore, sal, cavalos, cobre, incenso; atum no mar) rendem ouro e um bônus para todo o império enquanto um Mercador (ou um barco de pesca, no atum) trabalhar neles. | Stone comes from limestone outcrops (Quarry) and pays for walls, towers, fortresses, the Temple, wonders and Eras. Oil appears in Era IV: citizens gather naphtha from seeps and bring it to the Naphtha Well; in Era VII, an Oil Well built on an oil field extracts it by itself. Rare resources (olives, vineyards, marble, salt, horses, copper, incense; tuna at sea) yield gold and an empire-wide bonus while a Merchant (or a fishing boat, for tuna) works them. |
| `help.seaTitle` | Mar e comércio | Sea and trade |
| `help.sea` | Construa o Estaleiro (tecla I) na margem: ele treina barcos de pesca (comida dos cardumes), transportes e a linha de navios de guerra, do Pentecôntero ao Encouraçado. Para atravessar o mar, selecione as tropas e clique com o botão direito num transporte; depois, com o transporte selecionado, clique com o botão direito na costa (ou aperte U) para desembarcar. Caravanas (Mercado, tecla C) e navios mercantes fazem rotas entre os seus pontos de comércio e os de aliados: cada viagem rende ouro pela distância. São alvos fáceis: escolte-as. | Build the Shipyard (I key) on the shore: it trains fishing boats (food from fish shoals), transports and the warship line, from the Penteconter to the Battleship. To cross the sea, select your troops and right-click a transport; then, with the transport selected, right-click the coast (or press U) to unload. Caravans (Market, C key) and merchant ships run routes between your trading posts and your allies': each trip yields gold by distance. They are easy targets: escort them. |
| `help.wondersTitle` | Maravilhas | Wonders |
| `help.wonders` | São 20 maravilhas, das Eras I a VIII, cada uma com um efeito próprio (veja a aba Maravilhas da enciclopédia). Cada uma é única no mapa: quem termina primeiro fica com ela, e as obras dos outros desabam devolvendo os recursos. Um jogador pode ter várias. | There are 20 wonders, from Era I to VIII, each with its own effect (see the Wonders tab of the encyclopedia). Each is unique on the map: whoever finishes it first keeps it, and the others' foundations collapse and refund their resources. A player can own several. |
| `hk.unload` (só se `grep -n "'hk.unload'" src/i18n/strings.ts` vier vazio) | Desembarcar a carga (transporte selecionado) | Unload cargo (transport selected) |

Antes de usar um nome de tecla nos textos (`I`, `C`, `U`), confira no código: `grep -n "hotkey: 'I'" src/core/data/buildings.ts`
(Estaleiro), `grep -n "caravan" src/core/data/units.ts` (atalho da Caravana) e `grep -n "'u'" src/ui/input.ts` (desembarque).
Se a etapa anterior usou outra tecla, troque a letra **nos dois idiomas**.

### E9-3 — Textos que mudam (a chave fica; troque o valor inteiro)

| Chave | PT novo | EN novo |
|---|---|---|
| `help.goal` | Destrua todos os edifícios e cidadãos inimigos (Conquista) ou vença por maravilhas: cada maravilha é única no mapa e vale o número da sua Era em pontos; o time que somar a meta e mantiver por {hold} minutos vence (nas opções da partida há também "manter uma maravilha por {min} minutos"). Avance pelas Eras na Biblioteca, escolha deuses menores, treine heróis e criaturas míticas e use poderes divinos. | Destroy every enemy building and citizen (Conquest) or win by wonders: each wonder is unique on the map and worth its Era number in points; the team that reaches the target and holds it for {hold} minutes wins (the match options also offer "hold one wonder for {min} minutes"). Advance through the Eras at the Library, choose minor gods, train heroes and mythic creatures and use god powers. |
| `help.combat` | Infantaria pesada vence cavalaria, cavalaria vence tiro, tiro vence infantaria; escaramuça vence tiro. Cerco e artilharia derrubam edifícios. Da Era V em diante a pólvora acerta forte e recarrega devagar; na VIII, a infantaria tem dano dobrado contra tanques. Heróis causam dano triplo em criaturas míticas; criaturas míticas devastam humanos. Navios lutam com navios e com a costa; tropas atravessam o mar em transportes. Guarneça cidadãos e infantaria em Centros Cívicos, Fortalezas e Torres para protegê-los (e disparar mais flechas). | Heavy infantry beats cavalry, cavalry beats missile troops, missile troops beat infantry; skirmishers beat missile troops. Siege and artillery bring down buildings. From Era V on, gunpowder hits hard but reloads slowly; in Era VIII, infantry deals double damage to tanks. Heroes deal triple damage to mythic creatures; mythic creatures devastate humans. Ships fight ships and the coast; troops cross the sea in transports. Garrison citizens and infantry in Town Centers, Fortresses and Towers to protect them (and fire extra arrows). |
| `load.tip10` | Cada maravilha vale o número da sua Era em pontos: some a meta e mantenha-a para vencer (ou mantenha uma maravilha por {min} minutos, se a partida usar a regra clássica). | Each wonder is worth its Era number in points: reach the target and hold it to win (or hold one wonder for {min} minutes if the match uses the classic rule). |

### E9-4 — Dicas de carregamento novas (`LOADING_TIPS` 12 → 18)

| Chave | PT | EN |
|---|---|---|
| `load.tip13` | A Biblioteca faz um estudo por vez: mais Bibliotecas (uma por Centro Cívico) estudam em paralelo. | The Library runs one study at a time: more Libraries (one per Town Center) study in parallel. |
| `load.tip14` | Estudar a evolução de uma linha transforma na hora as unidades dela que você já tem. | Studying a line's evolution instantly transforms the units of that line you already have. |
| `load.tip15` | O petróleo aparece na Era IV: procure as fontes de nafta e construa um Poço de Nafta perto delas. | Oil appears in Era IV: look for naphtha seeps and build a Naphtha Well near them. |
| `load.tip16` | Um Mercador num recurso raro rende ouro sem parar e dá um bônus a todo o império. | A Merchant on a rare resource yields gold nonstop and gives your whole empire a bonus. |
| `load.tip17` | Nas Ilhas o inimigo só se alcança por mar: Estaleiro cedo, transportes e escolta. | On Islands the enemy can only be reached by sea: an early Shipyard, transports and an escort. |
| `load.tip18` | F3 abre a árvore de estudos; F2, a enciclopédia com as linhas, os deuses e as 20 maravilhas. | F3 opens the study tree; F2, the encyclopedia with the lines, the gods and the 20 wonders. |

### E9-5 — Glossário PT → EN (o teste `tests/i18n-eras.test.ts` usa exatamente esta lista)

Se o texto PT contém o termo da esquerda (expressão regular, maiúsculas como estão), o EN do mesmo texto tem de conter o
da direita.

| PT (regex) | EN (regex) |
|---|---|
| `\bEras?\b` | `\bEras?\b` |
| `Biblioteca` | `Librar(y\|ies)` |
| `\bPedra\b` | `Stone` (i) |
| `Petróleo` | `\bOil\b` (i) |
| `Maravilha` (i) | `Wonder` (i) |
| `Estaleiro` | `Shipyard` |
| `Caravana` (i) | `Caravan` (i) |
| `Mercador` | `Merchant` |
| `\bestudos?\b` (i) | `stud(y\|ies)` (i) |
| `Bênçãos?` | `Blessing` |
| `Centros? Cívicos?` | `Town Centers?` |
| `Templo` | `Temple` |
| `Fortaleza` | `Fortress` |
| `Conhecimento` | `Knowledge` |
| `\bFavor\b` | `Favor` |
| `Titã` | `Titan` |
| `deus(es)? menor(es)?` (i) | `minor gods?` (i) |

Termos proibidos (o teste acusa): no PT, `\bIdades?\b` (exceto "Idade de Ouro" e "Idade de Cronos") e `Academia`; no EN,
`\bAges?\b` (exceto "Age of Mythology", "Age of Earth", "Age of Cronus" e "Golden Age") e `Academy`.

Nomes que podem ser iguais em PT e EN (nomes próprios), lista inicial `SAME_NAME_OK` do teste:
`unit.medusa`, `tech.ambrosia`, `minor.hermes`, `minor.ares`, `minor.hera`, `major.zeus`, `major.poseidon`,
`major.hades`, `unit.evzone`, `unit.empusa`, `unit.talos`, `unit.ceto`, `unit.dromon`, `building.wonder_hagia_sophia`.
Acrescente só nome próprio (pessoa, lugar, criatura, navio histórico), com um comentário.

### E10-1 — Metas e tolerâncias por Era

| Era | índice | alvo (min) | tolerância da mediana | chegada mínima |
|---|---|---|---|---|
| II | 1 | 4 | ±1 | 80 % |
| III | 2 | 9 | ±1,5 | 80 % |
| IV | 3 | 14 | ±1,5 | 80 % |
| V | 4 | 20 | ±2 | 80 % |
| VI | 5 | 26 | ±2 | 70 % |
| VII | 6 | 33 | ±2,5 | 70 % |
| VIII | 7 | 40 | ±3 | 60 % |

"Chegada mínima" = das IAs vivas no minuto alvo + tolerância (ou que já tinham chegado), a fração que chegou. Uma Era
cuja tolerância passa do tempo medido não é avaliada (o resumo avisa).

### E10-2 — Amostragem e comandos

| Uso | Comando | Sementes | Min | Tempo aprox. |
|---|---|---|---|---|
| rodada rápida da escada | `npm run balance 50 1-6 -- --jobs 3 --targets` | 6 (18 IAs) | 50 | ~10 min |
| aceitação | `npm run balance 60 1-18 -- --jobs 3 --targets --json docs/perf/<data>-e10-balance.json` | 18 (54 IAs) | 60 | ~30 min |
| dificuldades | `npm run balance 60 1-6 -- --jobs 3 --diff hard --stalls-only` e o mesmo com `easy` e `brutal` | 6 | 60 | ~10 min cada |
| mapas com mar | `npm run balance 60 1-6 -- --jobs 3 --map-type islands --stalls-only` e o mesmo com `coastal` e `mediterranean` | 6 | 60 | ~10 min cada |
| partidas longas | `npm run balance 75 1-6 -- --jobs 3 --stalls-only` | 6 | 75 | ~15 min |

Rode as medições longas **sozinhas** (nada pesado em paralelo) e em segundo plano com log, por exemplo
`npm run balance 60 1-18 -- --jobs 3 --targets > /tmp/e10/bal-aceite.txt 2>&1`.

### E10-3 — `AI_PACE`: botões, valores de partida, limites e passo

Os "clássicos" são os valores que estão no código no começo da E10 (o passo H2 imprime); a coluna mostra os que a E1
deixou. `AI_PACE` começa **igual** ao clássico.

| Campo | O que faz (onde lê hoje) | Clássico (E1) | Limites | Passo |
|---|---|---|---|---|
| `villagerTarget[8]` | meta de cidadãos por Era (`manageEconomy`, `manageTraining`: `VILLAGER_TARGET[...]`) | 18, 26, 34, 40, 44, 48, 52, 56 | clássico ±12 por posição | ±2 |
| `farmLimit[8]` | fazendas (`assignGatherer`: `FARM_LIMIT[...]`) | 4, 8, 12, 16, 18, 20, 22, 24 | ±6 | ±2 |
| `armyAttack[8]` | tamanho mínimo da onda (`manageArmy`: `ARMY_ATTACK[...]`) | 7, 12, 16, 20, 24, 28, 32, 36 | ±8 | ±2 |
| `minArmy[8]` | exército mínimo (`budgetOf`: `MIN_ARMY[...]`) | 6, 10, 14, 18, 22, 26, 30, 34 | ±6 | ±2 |
| `advanceMinVillagers` | cidadãos para o 1º avanço (`tryAdvanceAge`: `snap.villagers.length < 12`) | 12 | 8–14 | ±1 |
| `templeVillagers` | Templo no plano (`manageBuilding`: `snap.villagers.length >= 8 && has('temple') === 0`) | 8 | 5–10 | ±1 |
| `barracksVillagers` | 1º Quartel (`snap.villagers.length >= 10 && has('barracks') === 0`) | 10 | 7–14 | ±1 |
| `libraryVillagers` | 1ª Biblioteca (E1 D3: `has('academy') === 0 && snap.villagers.length >= 9`) | 9 | 5–12 | ±1 |
| `fortressWood` | madeira para a Fortaleza (`age >= 2 && has('fortress') === 0 && player.resources.wood > 500`) | 500 | 250–600 | ±50 |
| `scholarsEarly` | filósofos com ouro ≥ 100 (`manageTraining`: `ac.scholars < 3`) | 3 | 2–5 | ±1 |
| `armyFundCap` | exército máximo antes de juntar o fundo da Era (`budget.minArmy * 1.6`) | 1.6 | 1.2–2.0 | ±0.1 |
| `evoUsers` | unidades da linha para estudar a evolução sem o fundo (E3: `EVO_USERS`) | 4 (ou o que a E3 deixou) | 2–10 | ±1 |
| `farSearch` | raio da busca longa de madeira/ouro (`assignGatherer`: o último `nearestNode(..., 70, ...)`) | 70 | 70–120 | +10 |
| `sellLots` | lotes vendidos por pensamento no Mercado (`manageTrade`: `sold < 4`) | 4 | 2–8 | ±1 |

### E10-4 — Escada de ajuste (um degrau por rodada; sempre a Era mais cedo fora da tolerância primeiro)

| Sintoma (resumo `--targets`) | Degraus, nesta ordem (pare quando a Era entrar na tolerância) |
|---|---|
| II **LENTA** | `advanceMinVillagers` −1 (até 9) → `templeVillagers` −1 (até 6) → `libraryVillagers` −1 (até 6) → `villagerTarget[0]` +2 (até 24) |
| II **RÁPIDA** | `advanceMinVillagers` +1 (até 14) → `villagerTarget[0]` −2 (até 14) |
| III **LENTA** | `scholarsEarly` +1 (até 5) → `villagerTarget[1]` +2 (até 34) → `armyFundCap` −0,1 (até 1,2) |
| III **RÁPIDA** | `scholarsEarly` −1 (até 2) → `armyFundCap` +0,1 (até 2,0) |
| IV **LENTA** | `villagerTarget[2]` +2 (até 42) → `armyFundCap` −0,1 (até 1,2) → `minArmy[2]` −2 (até 8) |
| IV **RÁPIDA** | `minArmy[2]` +2 (até 20) → `villagerTarget[2]` −2 (até 26) |
| V–VIII (Era k) **LENTA** | `AGES[k].requires.techCount` −1 (nunca abaixo do da Era k−1 nem acima de 4·k) → `AGES[k].time` −10 s (piso 90 s) → todos os custos de `AGES[k].cost` × 0,9 (piso: 70 % do valor no início da E10) → `LINE_LEVEL_COST_MULT[k − 1]` × 0,9 (piso 0,7; só k ≥ 5 — o índice k − 1 é o nível k, estudado na Era anterior e contado no requisito da Era k; os índices 0–3 são da campanha e ficam 1) → `villagerTarget[k−1]` +2 |
| V–VIII (Era k) **RÁPIDA** | custos de `AGES[k].cost` × 1,1 (teto 130 %) → `AGES[k].time` +10 s (teto 180 s) → `techCount` +1 (respeitando ≤ 4·k) |
| **POUCOS** (chegada abaixo do mínimo) numa Era sem LENTA | primeiro os detectores (E10-5); depois `armyAttack[k−1]` +2 (ondas maiores e menos frequentes deixam as IAs crescerem) |
| > 25 % das partidas terminando antes de 30 min | `armyAttack[0]`, `[1]` e `[2]` +2 cada (até clássico +6) |
| II–IV continuam fora depois de todos os degraus deles | **pare**: registre os números como pendência do dono (D18) |

Regras: arredonde custos para múltiplos de 5 (`Math.round(v / 5) * 5`); ao mudar `techCount`, troque o número **na
`desc` PT de `AGES[k]` e na `EN_AGES[k].desc`** (o teste confere); no máximo **12 rodadas**; cada rodada vai numa linha da
tabela "Rodadas de ajuste" do `PROGRESSO.md` (degrau, valor antes → depois, mediana antes → depois de cada Era).
Uma rodada é aceita se a Era alvo chegou mais perto do alvo, nenhuma outra Era saiu da tolerância e não apareceu PARADA
nem TRAVADA; senão, desfaça a mudança.

### E10-5 — Detectores de partida longa (a cada 10 min de jogo, por IA viva)

| Rótulo | Condição | Reprova? | Onde olhar e o que fazer |
|---|---|---|---|
| `PARADA` | cidadãos > 0 e todos ociosos, **ou** nada treinado nem construído nos últimos 10 min com `pop < popCap − 5` | sim | ociosos: `assignGatherer` (`ai.ts`) não acha nó alcançável → `farSearch` +10 (até 120); nada feito: o pensamento sai cedo antes do treino → confira os `return` de `manageBuilding` (o `if (p.type === 'house') return;` sem madeira) e o `armyFundCap` |
| `TRAVADA` | mesma Era há ≥ 12 min, abaixo da Era final, e `canAdvanceAge(state, p)` **ok** (pode e não avança) ou recusa por motivo que **não** é `err.noResources` nem `err.advancing` (avanço já na fila: não é trava) | sim | o motivo vem impresso. "Requer N estudos": `manageResearch` não estuda as linhas (fila da Biblioteca cheia de evoluções ou filósofos) → confira `RESEARCH_PRIORITY` (todo nível das linhas) e a ordem "estudos exigidos antes das evoluções" da E3. "Biblioteca": Biblioteca destruída e não reposta → `findBuildSpot` sem lugar. "Fortaleza": `fortressWood` −50. Pode e não avança: `tryAdvanceAge` (E1) não acha Biblioteca com `queue.length <= 1` |
| `TRAVADA-RECURSO` | como acima, mas o motivo é `err.noResources` | não (registre) | ouro esgotado depois dos 40 min: `CARAVAN_TARGET_AI[3..7]` +1 (até 8; E5), `MERCHANT_MAX_AI` +1 (até 5; E2), `sellLots` +1 |
| `ACUMULANDO` | comida, madeira, pedra ou ouro > 6000 em duas checagens seguidas | não (registre) | a IA não gasta: `armyFundCap` +0,1 ou `armyAttack[k]` −2 da Era em que acumula |
| `SEM-ONDAS` | aos 30 min, `ai.waves === 0` | não (registre) | `armyAttack[k]` −2 da Era em que está |

### E10-6 — Orçamentos de desempenho

| Medida | Comando | Critério |
|---|---|---|
| simulação | `npx tsx scripts/perf.ts 60` (4 IAs Muito difícil, grande) | média ≤ 5 ms/tick em **todo** minuto, p95 ≤ 12 ms, pior ≤ 50 ms |
| simulação, mar | `npx tsx scripts/perf.ts 60 --map-type mediterranean` | idem |
| simulação, Era alta | `npx tsx scripts/perf.ts 40 --start-age 4` | idem |
| renderizador (GPU por software: vale CPU, MB e draw calls) | `node scripts/renderperf.mjs http://localhost:4173/ 20 --quality medium --reveal --start-age 6 --units 400 --types fusilier,machine_gunner,tank,field_gun,lancer,commando` | texturas residentes ≤ 160 MB; draw calls ≤ 40 ou ≤ base da E8 + 10 % |
| CPU do renderizador | `node scripts/rendercpu.mjs http://localhost:4173/ --start-age 6 --battle 100 --types fusilier,machine_gunner,tank,field_gun,dragoon --powers --label e10` | `render` ≤ 3 ms de média e ≤ 6 ms de p95 em todas as vistas; partículas abaixo do orçamento (o script avisa) |
| rede | `npm run loadtest -- --minutes 60 --bots 4 --drop-at 45 --drop-mode wait --spectator-at 50 --label e10-60min` | "Resultado: OK (sem dessincronização)"; todo "Instantâneo: … KB" < 4096 KB |

Antes de mudar qualquer tipo em `--types`, confira que o id existe: `grep -n "fusilier\|machine_gunner\|tank:" src/core/data/units.ts`.
Não use tipos navais em `--types`: os dois scripts põem as unidades em terra (em volta dos Centros Cívicos e no meio do
mapa continental), e o `debugSpawn` da E4 procura tile pela camada da unidade (`layerOf`) — o navio não acha água a
≤ 12 tiles e não nasce, e a medição sai com menos unidades do que o `--units` pediu.

### E10-7 — Justiça de posição

| Mapa | Comando | Critério |
|---|---|---|
| Egeu (oficial, navegável) | `npx tsx scripts/maps/fairness.ts egeu 60 1-16 zeus --both --jobs 3 --json docs/perf/<data>-e10-fair-egeu.json` | linha `critério … DENTRO` (posição **e** índice ≤ 65 %) |
| Egeu, mesma personalidade | `npx tsx scripts/maps/fairness.ts egeu 60 1-16 zeus --both --mirror-ai --jobs 3` | DENTRO |
| Estreito (oficial) | `npx tsx scripts/maps/fairness.ts estreito 60 1-16 zeus --both --jobs 3 --json docs/perf/<data>-e10-fair-estreito.json` | DENTRO |
| Costeiro, Ilhas, Mediterrâneo (gerados) | `npx tsx scripts/export-map.ts /tmp/e10/<tipo>.map.json --size small --seed 42 --type <tipo> --players 2` e `npx tsx scripts/maps/fairness.ts /tmp/e10/<tipo>.map.json 60 1-16 zeus --both --jobs 3` | só a linha **ÍNDICE**: (vitórias + à frente) do lado mais forte ≤ 65 % do total dessa linha, com total ≥ 8 (a mesma conta do `tally` do `fairness.ts`, que só imprime o veredito conjunto); a de POSIÇÃO se registra |
| sondagens | `npx vitest run tests/position-fairness.test.ts` | verde |

Um "fora" isolado em 16 sementes pede confirmação com `101-132` (32 sementes) antes de qualquer correção (CLAUDE.md).

O `map:export` vai direto pelo `npx tsx`: `npm run map:export … --size small` **não funciona** (o npm come as opções
que vêm antes de um `--` e repassa só os valores; conferido em 09/10/2026 com o npm 10). Pelo `npm run`, só com
`npm run map:export -- <arquivo> --size small …`.

### E10-8 — Textos da loja (`docs/steam/LOJA.md` e `docs/steam/PRESSKIT.md`)

Confira os números no código antes de colar:
`npx tsx -e "import { POWERS, BUILDINGS, MINOR_GODS } from './src/core/data'; import { MAP_TYPES } from './src/core/constants'; import { ACHIEVEMENTS } from './src/game/achievements'; console.log(Object.keys(POWERS).length, Object.values(BUILDINGS).filter((b) => b.wonder).length, Object.keys(MINOR_GODS).length, MAP_TYPES.length, ACHIEVEMENTS.length)"`
— o esperado é `21 20 18 8 40` (se der outro número, use o do código nos dois idiomas; o 40 é o das "40 conquistas" do
parágrafo "No PC e no Steam Deck", que fica como está se o número não mudou).

Para o `PRESSKIT.md` (linhas de fatos 22–37 de hoje), os números saem de:
`npx tsx -e "import { UNITS, BUILDINGS, MAJOR_GODS, MINOR_GODS, POWERS, LINES } from './src/core/data'; import { MAP_TYPES } from './src/core/constants'; const u = Object.values(UNITS); console.log({ unidades: u.length, miticas: u.filter((x) => x.tags.includes('myth') && !x.tags.includes('titan')).length, titas: u.filter((x) => x.tags.includes('titan')).length, navios: u.filter((x) => x.cls === 'ship').length, edificios: Object.keys(BUILDINGS).length, maravilhas: Object.values(BUILDINGS).filter((b) => b.wonder).length, linhas: Object.keys(LINES).length, menores: Object.keys(MINOR_GODS).length, poderes: Object.keys(POWERS).length, tiposDeMapa: MAP_TYPES.length, panteoes: Object.values(MAJOR_GODS).reduce((n, g) => n + 2 ** g.minorGods.length, 0) })"`
(`edificios` = todos os tipos, maravilhas incluídas — o critério dos "21 edifícios" de hoje; `panteoes` = combinações de
deus maior × uma escolha por Era: hoje 3 × 2³ = 24; com as 6 escolhas, 3 × 2⁶ = 192). Troque
"5 Idades (Arcaica → Titãs)" por "8 Eras (Arcaica → Moderna)", "Escolhas divinas por Idade" por "Escolhas divinas por
Era", "Idades de *Rise of Nations*" por "Eras de *Rise of Nations*" (PT) e "Ages of *Rise of Nations*" por "Eras of *Rise
of Nations*" (EN), e cada número pelo do comando. Não invente número que o comando não imprime.

| Trecho | PT novo | EN novo |
|---|---|---|
| Descrição curta (≤ 300 caracteres; esta tem 276 / 275) | Estratégia em tempo real com os deuses gregos ao longo da história: avance da Era Arcaica à Era Moderna, expanda fronteiras, estude na Biblioteca, domine o mar e desperte um Titã. Campanha da Titanomaquia em 12 missões, escaramuças, Horda e multiplayer online até 4 jogadores. | Real-time strategy with the Greek gods across history: rise from the Archaic Era to the Modern Era, push your borders, study at the Library, rule the sea and awaken a Titan. A 12-mission Titanomachy campaign, skirmishes, Horde mode and online multiplayer for up to 4 players. |
| 1º parágrafo ("RTS clássico…") | troque "o território e as Idades de *Rise of Nations*" por "o território e as Eras de *Rise of Nations*" | troque "the territory and Ages of *Rise of Nations*" por "the territory and Eras of *Rise of Nations*" (o nome *Age of Mythology* fica) |
| "Cinco Idades, escolhas divinas" (parágrafo inteiro) | **Oito Eras, escolhas divinas.** Da Grécia arcaica à Era Moderna, passando por Alexandre, Bizâncio, a pólvora, o Iluminismo e a indústria: escolha Zeus, Poseidon ou Hades e, a cada Era da II à VII, um deus menor entre dois. Cada escolha traz um poder divino, uma criatura mítica e pesquisas próprias — 21 poderes que crescem com a Era, do Raio de Zeus ao Carro do Sol. Tudo se estuda na Biblioteca, um estudo por vez: as Eras, a evolução de cada tipo de unidade e as quatro grandes linhas do império. | **Eight Eras, divine choices.** From archaic Greece to the Modern Era, through Alexander, Byzantium, gunpowder, the Enlightenment and industry: pick Zeus, Poseidon or Hades and, at every Era from II to VII, one of two minor gods. Each choice brings a god power, a mythic creature and its own technologies — 21 powers that grow with the Era, from Zeus's Bolt to the Sun Chariot. Everything is studied at the Library, one study at a time: the Eras, the evolution of each unit type and the empire's four great lines. |
| "Heróis, monstros e Titãs" (parágrafo inteiro) | **Exércitos de todas as Eras, heróis e Titãs.** As linhas de unidade evoluem Era a Era — do hoplita ao fuzileiro, do arqueiro cretense ao metralhador, dos hetairos ao tanque, do pentecôntero ao encouraçado — e as tropas que você já tem se transformam ao estudar a evolução. Aquiles, Héracles, Perseu, Jasão e Odisseu lutam ao lado delas; Minotauros, hidras, Fênix e Grifos respondem ao Favor dos deuses. Na Era Moderna, o Portal dos Titãs desperta Prometeu, Oceano ou Cronos. | **Armies of every Era, heroes and Titans.** Unit lines evolve Era by Era — from hoplite to fusilier, from Cretan archer to machine gunner, from Companion cavalry to tank, from penteconter to battleship — and the troops you already have transform when you study the evolution. Achilles, Heracles, Perseus, Jason and Odysseus fight alongside them; Minotaurs, hydras, Phoenixes and Griffins answer to the gods' Favor. In the Modern Era, the Titan Gate awakens Prometheus, Oceanus or Cronus. |
| "Do seu jeito" (parágrafo inteiro) | **Do seu jeito.** Escaramuças contra até três IAs (Fácil a Muito difícil) em oito tipos de mapa — do Continental às Ilhas e ao Mediterrâneo — ou em mapas fixos, com a Era inicial e a final à sua escolha; modos Conquista (com a vitória por pontos entre 20 maravilhas únicas), Deathmatch, Regicídio e Rei da Colina; o **Modo Horda**, sozinho ou em cooperação; e o **editor** de mapas e cenários com gatilhos. | **Your way.** Skirmishes against up to three AIs (Easy to Very Hard) on eight map types — from Continental to Islands and the Mediterranean — or on fixed maps, with the starting and final Era of your choice; Conquest (with the points victory among 20 unique wonders), Deathmatch, Regicide and King of the Hill modes; **Horde mode**, solo or co-op; and the map and scenario **editor** with triggers. |
| linha "Números conferidos no código em …" | troque a data pela do dia em que você conferiu | — |

---

## Passo a passo

Rode `npm run -s typecheck` no fim de **todo** passo. Testes podem ficar vermelhos dentro de um bloco, nunca no fim dele.

## Parte 1 — E9

### Bloco 0 — Preparação

- [ ] **0.1. Pré-condições.** Todos estes comandos têm de achar algo; se um vier vazio, pare (a etapa anterior não foi feita):
  ```sh
  grep -n "export function studyTreeHtml" src/ui/studytree.ts            # E1
  grep -n "export function eraSelectsHtml" src/ui/era-select.ts          # E1
  grep -n "export const RARES" src/core/data/rares.ts                    # E2
  grep -n "OIL_FROM_AGE\|RARE_SET\|WELL_NODES" src/core/constants.ts     # E2
  grep -n "export const LINES\|export const LINE_ORDER\|export function evoTechId" src/core/data/lines.ts   # E3
  grep -n "export function unitLinesOn" src/core/sim/lines.ts            # E3
  grep -n "SHIP_NODES" src/core/constants.ts                             # E4 (anote se é Set ou lista)
  grep -n "export function powerEraOf\|export const POWER_TUNING" src/core/sim/divine.ts   # E6
  grep -n "export const BLESSING_IDS" src/core/data/techs.ts             # E6
  grep -n "export function wonderPoints\|export function wonderTakenBy\|export function wonderPointsTarget\|export function wonderVictoryMode" src/core/sim/wonders.ts   # E7
  grep -n "export function allWondersOn\|export function buildingAgeOf" src/core/sim/restrictions.ts   # E7
  grep -n "WONDER_POINTS_HOLD_SECONDS\|WONDER_POINTS_MAX_TARGET\|WONDER_VICTORIES" src/core/constants.ts   # E7
  grep -n "export const CLASSIC_WONDERS" src/core/data/buildings.ts      # E7
  grep -n "export function effectiveStartEra" src/ui/era-select.ts      # E1
  grep -n "showStudyTree()\|private renderStudyTree" src/ui/hud.ts      # E1
  grep -n "export const EN_LINES" src/i18n/en-data.ts                    # E3
  grep -n "'hk.unload'" src/i18n/strings.ts                              # E4 (se vier vazio, o B1 cria)
  grep -n "layerOf" src/main.ts                                         # E4 (debugSpawn pela camada)
  ```
  Única exceção à regra de parar: `hk.unload` vazio só quer dizer que o B1/B4 entram (a E4 normalmente já criou a chave).
- [ ] **0.2. Base.** `mkdir -p /tmp/e9`; `npm run smoke 20 42 > /tmp/e9/smoke-antes.txt` (anote o "hash final");
  `npm run build`, `npm run preview` em segundo plano e `node scripts/playtest.mjs http://localhost:4173/ /tmp/e9/antes`
  (guarde `/tmp/e9/antes-4-enc.png`, a enciclopédia de antes).

### Bloco A — Enciclopédia

- [ ] **A1. Textos.** Acrescente em `src/i18n/strings.ts` (`pt` e `en`) todas as chaves `enc.*`, `menu.matchInfo*`,
  `mp.roomEras` e `pad.hint.eras` da tabela E9-2. *Conferir:* `npm run -s typecheck` (o `en` é
  `Record<keyof typeof pt, string>`: chave de um lado só não compila).
- [ ] **A2. `src/ui/encyclopedia.ts` (novo).** Copie o código abaixo. Se `SHIP_NODES` (passo 0.1) for uma lista, troque
  `SHIP_NODES.has(type)` por `SHIP_NODES.includes(type)`.
  ```ts
  // Enciclopédia (E9, docs/eras/E9-E10-interface-balanceamento.md): HTML puro (sem DOM) de cada aba, gerado dos dados —
  // unidades, linhas I–VIII, edifícios, maravilhas, tecnologias, deuses, Eras e recursos. Sem emoji: ícones do atlas e glifos.
  // O HUD (hud.ts, showEncyclopedia) só monta o modal e liga os cliques; tests/encyclopedia.test.ts lê estas funções.
  import { ACADEMY_LINES, AGES, BLESSING_IDS, BUILDINGS, CLASSIC_WONDERS, ERA_TITANS, LINES, LINE_LEVELS, LINE_ORDER, MAJOR_GODS, MINOR_GODS, POWERS, RARES, ROMAN, TECHS, UNITS, evoTechId, lineStart } from '../core/data';
  import { NODE_NAMES, NODE_RESOURCE, OIL_FROM_AGE, RARE_SET, RESOURCES, SHIP_NODES, WELL_NODES, WONDER_POINTS_HOLD_SECONDS, WONDER_POINTS_MAX_TARGET } from '../core/constants';
  import type { GameState, TechDef, UnitDef } from '../core/types';
  import { unitLinesOn } from '../core/sim/lines';
  import { allWondersOn, buildingAgeOf } from '../core/sim/restrictions';
  import { wonderPoints, wonderPointsTarget, wonderTakenBy, wonderVictoryMode } from '../core/sim/wonders';
  import { POWER_TUNING, powerEraOf } from '../core/sim/divine';
  import { t } from '../i18n';
  import { esc, noEmoji } from './html';
  import { ic } from './icons';
  import { glyph } from './glyphs';

  export type EncTab = 'units' | 'lines' | 'buildings' | 'wonders' | 'techs' | 'gods' | 'ages' | 'resources';
  export const ENC_TABS: readonly EncTab[] = ['units', 'lines', 'buildings', 'wonders', 'techs', 'gods', 'ages', 'resources'];
  /** Abas com o filtro "Era" (as outras já são organizadas por Era). */
  export const ENC_ERA_FILTER: ReadonlySet<EncTab> = new Set<EncTab>(['units', 'buildings', 'wonders', 'techs', 'gods']);
  /** era: filtro ('all' ou índice); state/local: a partida aberta (ausentes no menu principal). */
  export interface EncCtx { era: number | 'all'; state?: GameState | null; local?: number }

  const LABEL: Record<EncTab, string> = { units: 'enc.units', lines: 'enc.lines', buildings: 'enc.buildings', wonders: 'enc.wonders', techs: 'enc.techs', gods: 'enc.gods', ages: 'enc.ages', resources: 'enc.resources' };
  const ICON: Record<EncTab, () => string> = {
    units: () => ic.unit('hoplite', undefined, 'sm'), lines: () => glyph('fColumn'), buildings: () => ic.bld('town_center', undefined, 'sm'),
    wonders: () => ic.bld('wonder_zeus', undefined, 'sm'), techs: () => ic.tech('civic1', 'sm'), gods: () => ic.god('zeus', 'sm'),
    ages: () => ic.age(0, 'sm'), resources: () => ic.res('food'),
  };
  const head = (keys: string[]) => keys.map((k) => esc(noEmoji(t(k))));
  const costHtml = (c: Partial<Record<string, number>>): string => Object.entries(c).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `${ic.res(k)} ${v}`).join(' ') || '—';
  const era = (n: number) => esc(AGES[Math.max(0, Math.min(AGES.length - 1, n))].short);
  const pass = (ctx: EncCtx, age: number) => ctx.era === 'all' || ctx.era === age;
  const note = (key: string) => `<p class="enc-note">${t(key)}</p>`;
  const note2 = (key: string, vars: Record<string, string | number>) => `<p class="enc-note">${esc(t(key, vars))}</p>`;
  const table = (cols: string[], rows: string[]) => (rows.length ? `<table><tr>${cols.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.join('')}</table>` : note('enc.empty'));
  /** Era de uma unidade nas linhas (tier) ou a de treino (age). */
  const unitEra = (u: UnitDef) => u.tier ?? u.age;
  const classic = (ctx: EncCtx) => (ctx.state && !unitLinesOn(ctx.state) ? note('enc.classicNote') : '');

  export type UnitGroup = 'lines' | 'ships' | 'heroes' | 'myth' | 'titans' | 'other';
  const GROUPS: UnitGroup[] = ['lines', 'ships', 'heroes', 'myth', 'titans', 'other'];
  export function unitGroup(u: UnitDef): UnitGroup {
    if (u.tags.includes('titan')) return 'titans';
    if (u.tags.includes('hero')) return 'heroes';
    if (u.tags.includes('myth')) return 'myth';
    if (u.cls === 'ship' || u.naval) return 'ships';
    if (u.line) return 'lines';
    return 'other';
  }
  function whereOf(u: UnitDef): string {
    const list = u.line && LINES[u.line] ? LINES[u.line].buildings : u.building ? [u.building] : [];
    const names = list.filter((b) => BUILDINGS[b]).map((b) => esc(BUILDINGS[b].name)).join(', ');
    const god = u.god ? ` (${esc((MINOR_GODS[u.god] ?? MAJOR_GODS[u.god])?.name ?? u.god)})` : '';
    return (names || (u.tags.includes('titan') ? esc(BUILDINGS.titan_gate.name) : '—')) + god;
  }

  function unitsTab(ctx: EncCtx): string {
    const shown = Object.values(UNITS).filter((u) => (u.building || u.line || u.tags.includes('titan')) && pass(ctx, unitEra(u)));
    const order = (u: UnitDef) => (u.line ? LINE_ORDER.indexOf(u.line) : 99);
    const cols = head(['enc.units', 'over.age', 'enc.line', 'enc.cost', 'sel.hp', 'sel.attack', 'sel.armor', 'sel.range', 'sel.speed', 'enc.where', 'enc.description']);
    const body = GROUPS.map((g) => {
      const list = shown.filter((u) => unitGroup(u) === g).sort((a, b) => unitEra(a) - unitEra(b) || order(a) - order(b) || a.id.localeCompare(b.id));
      if (!list.length) return '';
      return `<h3>${t(`enc.group.${g}`)}</h3>` + table(cols, list.map((u) => `<tr><td>${ic.unit(u.id, undefined, 'sm')} ${esc(u.name)}</td><td>${era(unitEra(u))}</td><td>${u.line && LINES[u.line] ? `${esc(LINES[u.line].name)} · ${ROMAN[unitEra(u)]}` : '—'}</td><td>${costHtml(u.cost)}</td><td>${u.hp}</td><td>${u.attack} ${t(`dmg.${u.attackType}`)}</td><td>${Math.round(u.armor.hack * 100)}/${Math.round(u.armor.pierce * 100)}/${Math.round(u.armor.crush * 100)}</td><td>${u.range >= 1.6 ? u.range : t('sel.melee')}</td><td>${u.speed}</td><td>${whereOf(u)}</td><td>${esc(u.desc)}</td></tr>`));
    }).join('');
    return classic(ctx) + (body || note('enc.empty'));
  }

  function linesTab(ctx: EncCtx): string {
    const cols = [esc(t('enc.line')), ...AGES.map((a, n) => `${ic.age(n, 'sm')} ${esc(a.short)}`)];
    const rows = LINE_ORDER.filter((id) => LINES[id]).map((id) => {
      const l = LINES[id];
      const cells = l.steps.map((s, n) => {
        if (l.retireAt !== undefined && n >= l.retireAt) return `<td class="enc-retired">${t('enc.retired')}</td>`;
        if (n < lineStart(l) || !s) return '<td>·</td>';
        if (n > 0 && l.steps[n - 1] === s) { const study = TECHS[evoTechId(id, n)]; return `<td>${study ? `${ic.tech(study.id, 'sm')} ${esc(study.name)}` : '·'}</td>`; }
        return `<td>${ic.unit(s, undefined, 'sm')} ${esc(UNITS[s]?.name ?? s)}</td>`;
      }).join('');
      return `<tr><td><b>${esc(l.name)}</b></td>${cells}</tr>`;
    });
    return classic(ctx) + `<p>${t('enc.linesIntro')}</p>` + table(cols, rows) + `<p>${t('enc.linesRps')}</p>`;
  }

  function buildingsTab(ctx: EncCtx): string {
    const list = Object.values(BUILDINGS).filter((b) => !b.notBuildable && !b.wonder && pass(ctx, b.age)).sort((a, b) => a.age - b.age);
    return table(head(['enc.buildings', 'over.age', 'enc.cost', 'sel.hp', 'enc.size', 'enc.description']), list.map((b) => `<tr><td>${ic.bld(b.id, undefined, 'sm')} ${esc(b.name)}</td><td>${era(b.age)}</td><td>${costHtml(b.cost)}</td><td>${b.hp}</td><td>${b.w}×${b.h}</td><td>${esc(b.desc)}</td></tr>`));
  }

  function wondersTab(ctx: EncCtx): string {
    const s = ctx.state ?? null;
    const modern = !s || allWondersOn(s.config);
    const ageOf = (id: string) => (s ? buildingAgeOf(s.config, id) : BUILDINGS[id].age);
    const list = Object.values(BUILDINGS).filter((b) => b.wonder && (modern || CLASSIC_WONDERS.includes(b.id)) && pass(ctx, ageOf(b.id))).sort((a, b) => ageOf(a.id) - ageOf(b.id));
    const owner = (id: string) => { if (!s) return '—'; const b = wonderTakenBy(s, id); return b ? esc(s.players[b.owner]?.name ?? '?') : t('enc.free'); };
    const mode = s ? wonderVictoryMode(s.config) : 'points';   // numa partida com "manter por 6 min" ou sem vitória por maravilha, diga qual vale
    const rule = modern ? `<p>${t('enc.wondersRule', { target: s ? wonderPointsTarget(s) : WONDER_POINTS_MAX_TARGET, hold: WONDER_POINTS_HOLD_SECONDS })}</p>${mode !== 'points' ? note2('enc.matchRule', { rule: t(`wv.${mode}`) }) : ''}` : note('enc.classicWonders');
    return rule + table(head(['enc.wonders', 'over.age', 'enc.points', 'enc.cost', 'enc.effect', 'enc.owner']), list.map((b) => `<tr><td>${ic.bld(b.id, undefined, 'sm')} ${esc(b.name)}</td><td>${era(ageOf(b.id))}</td><td>${wonderPoints(b.id)}</td><td>${costHtml(b.cost)}</td><td>${esc(b.desc)}</td><td>${owner(b.id)}</td></tr>`));
  }

  function techsTab(ctx: EncCtx): string {
    const isLine = (x: TechDef) => !!x.line && ACADEMY_LINES.includes(x.line);
    const lineRows = ACADEMY_LINES.map((l) => {
      const levels = Array.from({ length: LINE_LEVELS }, (_, i) => TECHS[`${l}${i + 1}`]).filter((x): x is TechDef => !!x && pass(ctx, x.age));
      if (!levels.length) return '';
      return `<tr><td>${ic.tech(`${l}1`, 'sm')} ${t(`line.${l}`)}</td><td>${levels.map((x) => `${ROMAN[(x.level ?? 1) - 1]} (${era(x.age)}): ${costHtml(x.cost)}`).join('<br>')}</td><td>${esc(levels[0].desc)}</td></tr>`;
    }).filter(Boolean);
    const lib = lineRows.length ? `<h3>${ic.bld('academy', undefined, 'sm')} ${t('enc.lineStudies')}</h3>` + table(head(['enc.line', 'enc.levels', 'enc.effect']), lineRows) : '';
    const byB = new Map<string, TechDef[]>();
    for (const x of Object.values(TECHS)) {
      if (isLine(x) || x.evolve || x.blessing || !pass(ctx, x.age)) continue;
      const a = byB.get(x.building) ?? []; a.push(x); byB.set(x.building, a);
    }
    const cols = head(['modal.tech', 'over.age', 'enc.cost', 'enc.effect']);
    const sections = Object.keys(BUILDINGS).filter((b) => byB.has(b)).map((b) => `<h3>${ic.bld(b, undefined, 'sm')} ${esc(BUILDINGS[b].name)}</h3>` + table(cols, byB.get(b)!.sort((p, q) => p.age - q.age).map((x) => `<tr><td>${ic.tech(x.id, 'sm')} ${esc(x.name)}${x.god ? ` <small>(${esc((MINOR_GODS[x.god] ?? MAJOR_GODS[x.god])?.name ?? x.god)})</small>` : ''}</td><td>${era(x.age)}</td><td>${costHtml(x.cost)}</td><td>${esc(x.desc)}</td></tr>`))).join('');
    return lib + sections + note('enc.evoNote');
  }

  function godsTab(ctx: EncCtx): string {
    const pick = (m: string) => { const d = MINOR_GODS[m]; if (!d) return esc(m); return `${ic.god(m, 'sm')} <b>${esc(d.name)}</b> · ${ic.power(d.power, 'sm')} ${esc(POWERS[d.power]?.name ?? d.power)} · ${ic.unit(d.mythUnit, undefined, 'sm')} ${esc(UNITS[d.mythUnit]?.name ?? d.mythUnit)}`; };
    const pct = Math.round(POWER_TUNING.eraScale * 100);
    const majors = Object.values(MAJOR_GODS).map((g) => {
      const rows = g.minorGods.map((pair, i) => (pass(ctx, i + 1) ? `<tr><td>${ic.age(i + 1, 'sm')} ${era(i + 1)}</td>${pair.map((m) => `<td>${pick(m)}</td>`).join('')}</tr>` : '')).filter(Boolean);
      const titan = UNITS[g.titan] ? `<p>${ic.unit(g.titan, undefined, 'sm')} ${t('enc.titansNote', { age: esc(AGES[ERA_TITANS].name), titan: esc(UNITS[g.titan].name) })}</p>` : '';
      return `<h3>${ic.god(g.id, 'md')} ${esc(g.name)} — ${esc(g.title)}</h3><p>${esc(g.desc)}</p><ul>${g.perks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
        + (rows.length ? `<h4>${t('enc.minorPairs')}</h4>` + table([esc(noEmoji(t('over.age'))), t('enc.choice', { n: 1 }), t('enc.choice', { n: 2 })], rows) : '') + titan;
    }).join('');
    const minors = Object.values(MINOR_GODS).filter((m) => pass(ctx, m.age)).sort((a, b) => a.age - b.age).map((m) => `<tr><td>${ic.god(m.id, 'sm')} ${esc(m.name)}<br><small>${esc(m.title)}</small></td><td>${era(m.age)}</td><td>${ic.power(m.power, 'sm')} ${esc(POWERS[m.power]?.name ?? m.power)}<br><small>${esc(POWERS[m.power]?.desc ?? '')} ${t('enc.powerScales', { pct, era: esc(AGES[powerEraOf(m.power)]?.name ?? '') })}</small></td><td>${ic.unit(m.mythUnit, undefined, 'sm')} ${esc(UNITS[m.mythUnit]?.name ?? m.mythUnit)}</td><td>${m.techs.map((x) => `${ic.tech(x, 'sm')} ${esc(TECHS[x]?.name ?? x)}`).join('<br>')}</td></tr>`);
    const bless = BLESSING_IDS.map((id) => TECHS[id]).filter((x) => x && pass(ctx, x.age)).map((x) => `<tr><td>${ic.tech(x.id, 'sm')} ${esc(x.name)}</td><td>${era(x.age)}</td><td>${costHtml(x.cost)}</td><td>${esc(x.desc)}</td></tr>`);
    return majors + `<h3>${esc(noEmoji(t('enc.minorGods')))}</h3>` + table(head(['enc.god', 'over.age', 'modal.power', 'modal.creature', 'enc.techs']), minors)
      + `<h3>${t('enc.blessings')}</h3>` + table(head(['modal.tech', 'over.age', 'enc.cost', 'enc.effect']), bless);
  }

  function agesTab(ctx: EncCtx): string {
    const me = ctx.state && ctx.local !== undefined ? ctx.state.players[ctx.local] : undefined;
    const rows = AGES.map((a, n) => {
      const units = Object.values(UNITS).filter((u) => (u.building || u.line || u.tags.includes('titan')) && unitEra(u) === n).length;
      const blds = Object.values(BUILDINGS).filter((b) => !b.notBuildable && !b.wonder && b.age === n).length;
      const wds = Object.values(BUILDINGS).filter((b) => b.wonder && b.age === n).length;
      const req = [a.requires.building ? esc(BUILDINGS[a.requires.building]?.name ?? a.requires.building) : '', a.requires.techCount ? t('enc.academyLines', { n: a.requires.techCount, lines: ACADEMY_LINES.map((l) => t(`line.${l}`)).join(', ') }) : ''].filter(Boolean).join(' · ') || '—';
      const cur = me?.age === n;
      return `<tr${cur ? ' class="enc-cur"' : ''}><td>${ic.age(n, 'sm')} ${esc(a.name)}${cur ? ` <small>(${t('enc.yourEra')})</small>` : ''}</td><td>${costHtml(a.cost)}</td><td>${req}</td><td>${a.minorGod ? t('enc.yes') : t('enc.no')}</td><td>${t('enc.unlockCount', { u: units, b: blds, w: wds })}</td><td>${esc(a.desc)}</td></tr>`;
    });
    const tree = ctx.state ? `<div class="actions" style="justify-content:flex-start"><button class="btn" id="enc-tree">${glyph('scroll')} ${t('enc.openTree')}</button></div>` : '';
    return table(head(['over.age', 'enc.cost', 'enc.requirements', 'enc.minorGod', 'enc.unlocks', 'enc.description']), rows) + tree;
  }

  function whoOf(type: string): string {
    if (SHIP_NODES.has(type)) return t('enc.who.boat');        // E4: cardume e atum são do barco de pesca
    if (WELL_NODES.has(type)) return t('enc.who.extractor');
    if (RARE_SET.has(type)) return t('enc.who.merchant');
    return t('enc.who.villager');
  }
  function sinceOf(type: string): number {
    if (type === 'naphtha') return OIL_FROM_AGE;
    if (WELL_NODES.has(type)) return BUILDINGS.oil_well?.age ?? 6;
    if (SHIP_NODES.has(type)) return BUILDINGS.shipyard?.age ?? 0;
    if (RARE_SET.has(type)) return BUILDINGS.market?.age ?? 1;
    return 0;
  }
  function resourcesTab(): string {
    const since: Partial<Record<string, number>> = { oil: OIL_FROM_AGE };
    const res = RESOURCES.map((r) => `<tr><td>${ic.res(r)} ${t(`res.${r}`)}</td><td>${t(`enc.res.${r}.src`)}</td><td>${era(since[r] ?? 0)}</td><td>${t(`enc.res.${r}.use`)}</td></tr>`);
    const nodes = Object.keys(NODE_NAMES).filter((n) => n !== 'lure').map((n) => { const r = NODE_RESOURCE[n as keyof typeof NODE_RESOURCE]; return `<tr><td>${t(`node.${n}`)}</td><td>${ic.res(r)} ${t(`res.${r}`)}</td><td>${whoOf(n)}</td><td>${era(sinceOf(n))}</td></tr>`; });
    const rares = Object.keys(RARES).map((id) => `<tr><td>${t(`node.${id}`)}</td><td>${t(`rare.${id}`)}</td></tr>`);
    return table(head(['enc.resources', 'enc.source', 'enc.since', 'enc.use']), res)
      + `<h3>${t('enc.nodes')}</h3>` + table(head(['enc.nodes', 'enc.gives', 'enc.who', 'enc.since']), nodes)
      + `<h3>${t('enc.rares')}</h3>` + table(head(['enc.rares', 'enc.rareBonus']), rares);
  }

  /** Corpo de uma aba (sem cabeçalho, abas nem botões). */
  export function encyclopediaBody(tab: EncTab, ctx: EncCtx): string {
    switch (tab) {
      case 'units': return unitsTab(ctx);
      case 'lines': return linesTab(ctx);
      case 'buildings': return buildingsTab(ctx);
      case 'wonders': return wondersTab(ctx);
      case 'techs': return techsTab(ctx);
      case 'gods': return godsTab(ctx);
      case 'ages': return agesTab(ctx);
      case 'resources': return resourcesTab();
    }
  }
  /** Modal inteiro: título, abas (`[data-tab]`), filtro `#enc-era`, corpo rolável (`[data-scroll]`) e Fechar (`#m-close`). */
  export function encyclopediaHtml(tab: EncTab, ctx: EncCtx): string {
    const tabs = ENC_TABS.map((k) => `<button class="btn ${k === tab ? 'active' : ''}" data-tab="${k}">${ICON[k]()} ${esc(noEmoji(t(LABEL[k])))}</button>`).join('');
    const filter = ENC_ERA_FILTER.has(tab) ? `<label class="enc-filter">${t('enc.eraFilter')} <select id="enc-era"><option value="all"${ctx.era === 'all' ? ' selected' : ''}>${t('enc.allEras')}</option>${AGES.map((a, n) => `<option value="${n}"${ctx.era === n ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>` : '';
    return `<h2>${esc(noEmoji(t('enc.title')))}</h2><div class="tabs">${tabs}</div>${filter}<div data-scroll style="max-height:60vh;overflow:auto">${encyclopediaBody(tab, ctx)}</div><div class="actions"><button class="btn primary" id="m-close">${t('modal.close')}</button></div>`;
  }
  ```
  Notas: `CLASSIC_WONDERS` e `POWER_TUNING.eraScale` vêm da E7 e da E6 (se o campo da E6 tiver outro nome, use o
  campo de `POWER_TUNING` que guarda o 0,15). Não troque o `style="max-height:60vh;overflow:auto"`: o controle de hoje
  rola por ele. *Conferir:* `npm run -s typecheck`.
- [ ] **A3. `src/ui/hud.ts`.**
  1. Importe `ENC_TABS`, `encyclopediaHtml` e `type EncTab` de `'./encyclopedia'`.
  2. Acrescente o campo `private encEra: number | 'all' = 'all';` perto de `private treeKey` (da E1).
  3. Troque o corpo inteiro de `showEncyclopedia(tab = 'units')` por:
     ```ts
     showEncyclopedia(tab: string = 'units') {
       const k: EncTab = (ENC_TABS as readonly string[]).includes(tab) ? (tab as EncTab) : 'units';
       const s = this.session;
       this.showModal(encyclopediaHtml(k, { era: this.encEra, state: s?.state ?? null, local: s?.local }));
       this.modal.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => this.showEncyclopedia(b.dataset.tab!)));
       this.modal.querySelector('#enc-era')?.addEventListener('change', (e) => { const v = (e.target as HTMLSelectElement).value; this.encEra = v === 'all' ? 'all' : Number(v); this.showEncyclopedia(k); });
       this.modal.querySelector('#enc-tree')?.addEventListener('click', () => this.showStudyTree());
       this.modal.querySelector('#m-close')!.addEventListener('click', () => this.hideModal());
     }
     ```
  4. Apague os imports que ficaram sem uso. O typecheck **não** acusa (o `tsconfig.json` não liga `noUnusedLocals`):
     confira cada nome que só o corpo antigo usava, por exemplo `grep -n "ACADEMY_LINES\|MAJOR_GODS\|enc.gate" src/ui/hud.ts`
     — só apague o import se o `grep` não achar outro uso no arquivo.
- [ ] **A4. CSS (`src/ui/styles.css`)**, perto das regras de `#modal`:
  ```css
  #modal .enc-filter { display: inline-flex; gap: 6px; align-items: center; margin: 2px 0 6px; font-size: 13px; }
  #modal .enc-note { color: #9aa5b8; font-size: 12px; margin: 4px 0; }
  #modal tr.enc-cur td { background: rgba(242, 193, 78, 0.12); }
  #modal td.enc-retired { color: #9aa5b8; font-style: italic; }
  ```
- [ ] **A5. Testes.** Escreva `tests/encyclopedia.test.ts` (seção "Testes") e acrescente `'src/ui/encyclopedia.ts'` às
  duas listas de `tests/hud-icons.test.ts` (a do "HUD sem emoji" e a dos glifos usados). *Conferir:*
  `npx vitest run tests/encyclopedia.test.ts tests/hud-icons.test.ts tests/i18n.test.ts`.

### Bloco B — Ajuda, dicas, atalhos e informação da partida

- [ ] **B1. Textos.** `help.*` (E9-2), `hk.unload` se faltar, os três textos da E9-3 e as dicas da E9-4 em
  `strings.ts` (PT e EN).
- [ ] **B2. `showHelp` (`hud.ts`).** Importe `WONDER_POINTS_HOLD_SECONDS` de `'../core/constants'`. Troque
  `t('help.goal', { min: WONDER_VICTORY_SECONDS / 60 })` por
  `t('help.goal', { min: WONDER_VICTORY_SECONDS / 60, hold: WONDER_POINTS_HOLD_SECONDS / 60 })` e monte as seções nesta
  ordem: objetivo, **Eras e Biblioteca**, economia, **Recursos**, fronteiras, combate, **Mar e comércio**,
  **Maravilhas**, controles. Cada seção nova no formato das de hoje: `<h3>${t('help.erasTitle')}</h3><p>${t('help.eras')}</p>`.
- [ ] **B3. Tela de carregamento.** Em `src/ui/loading.ts`, `export const LOADING_TIPS = 18;`. A dica 10 continua
  recebendo `{ min }` (a chamada de hoje passa `min` para todas).
- [ ] **B4. Atalhos (`showHotkeys`).** Se `hk.unload` foi criado no B1, acrescente `[k('U'), t('hk.unload')]` à lista
  `general` logo depois de `[k('G'), t('hk.garrison')]`.
- [ ] **B5. Linha da partida no menu (`showMenu`).** Importe `clampEra`, `ROMAN` de `'../core/data'`,
  `isScenarioConfig`, `maxAgeOf` de `'../core/sim/restrictions'` e `wonderVictoryMode` de `'../core/sim/wonders'`.
  No começo de `showMenu`, depois de `const s = this.session; if (!s) return;`:
  ```ts
  const c = s.state.config;
  const from = ROMAN[clampEra(c.startingAge ?? (c.mode === 'deathmatch' ? 1 : 0))], to = ROMAN[maxAgeOf(s.state, s.local)];
  const matchInfo = isScenarioConfig(c) ? t('menu.matchInfoScenario', { from, to }) : t('menu.matchInfo', { from, to, victory: t(`wv.${wonderVictoryMode(c)}`) });
  ```
  e, no HTML, logo depois de `<h2>${t('menu.title')}</h2>`: `<div class="enc-note" id="m-matchinfo">${esc(matchInfo)}</div>`.
  (Horda, campanha e cenário JSON caem no `isScenarioConfig`: por isso o texto diz "Cenário", não "Missão".)
  *Conferir:* `npx vitest run tests/i18n.test.ts tests/hud-text.test.ts`.

### Bloco C — Revisão dos textos PT/EN

- [ ] **C1. `tests/i18n-eras.test.ts` (novo)** — o código está na seção "Testes". Rode
  `npx vitest run tests/i18n-eras.test.ts`. **Vai falhar** nas primeiras vezes: é para isso. Para cada falha:
  - acento do português no EN, número diferente, glossário, cópia do PT, plural faltando, "Idade"/"Academia": **corrija
    o texto** (EN em `src/i18n/en-data.ts`/`strings.ts`/missões; PT em `src/core/data/*.ts`/`strings.ts`/missões);
  - nome igual nos dois idiomas: se for nome próprio, acrescente `tabela.id` em `SAME_NAME_OK` com um comentário; senão,
    traduza;
  - descrição de Era com outro número de estudos: corrija a `desc` (o número que vale é o do `requires.techCount`).

  **Nunca** mude um número de jogo para "casar" com o texto: o texto segue o dado.
- [ ] **C2. `scripts/i18n-review.ts` (novo).** Gera a planilha do que é novo ou mudou desde o commit `00a3809`:
  ```ts
  // Planilha de revisão PT/EN (E9): o que é novo ou mudou desde a base docs/eras/E9-base-textos.json (commit 00a3809),
  // lado a lado, para leitura humana. Uso: npx tsx scripts/i18n-review.ts [saída=docs/eras/textos-pt-en.md]
  import fs from 'node:fs';
  import { STRINGS } from '../src/i18n/strings';
  import * as EN from '../src/i18n/en-data';
  import { ABILITIES, AGES, BUILDINGS, MAJOR_GODS, MINOR_GODS, POWERS, TECHS, UNITS } from '../src/core/data';
  const base = JSON.parse(fs.readFileSync('docs/eras/E9-base-textos.json', 'utf8')) as { strings: Record<string, string>; data: Record<string, string>; missions: string[] };
  const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
  const dataText = (o: { name?: string; plural?: string; desc?: string; title?: string; perks?: string[] }) => `${o.name ?? ''}|${o.plural ?? ''}|${o.desc ?? ''}|${o.title ?? ''}|${(o.perks ?? []).join('|')}`;
  const cell = (s: string | undefined) => (s ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const out: string[] = ['# Textos PT/EN novos ou mudados desde a base (gerado por scripts/i18n-review.ts; não edite à mão)', ''];
  const sec = (title: string, rows: string[]) => { if (!rows.length) return; out.push(`## ${title} (${rows.length})`, '', '| id | PT | EN |', '|---|---|---|', ...rows, ''); };
  sec('Textos de interface', Object.entries(STRINGS.pt).filter(([k, v]) => base.strings[k] !== fnv(v)).map(([k, v]) => `| \`${k}\` | ${cell(v)} | ${cell((STRINGS.en as Record<string, string>)[k])} |`));
  const tables: [string, Record<string, object>, Record<string, object>][] = [['unit', UNITS, EN.EN_UNITS], ['building', BUILDINGS, EN.EN_BUILDINGS], ['tech', TECHS, EN.EN_TECHS], ['power', POWERS, EN.EN_POWERS], ['minor', MINOR_GODS, EN.EN_MINOR_GODS], ['major', MAJOR_GODS, EN.EN_MAJOR_GODS], ['ability', ABILITIES, EN.EN_ABILITIES]];
  for (const [tb, pt, en] of tables) sec(`Dados: ${tb}`, Object.entries(pt).filter(([id, o]) => base.data[`${tb}.${id}`] !== fnv(dataText(o as never))).map(([id, o]) => { const p = o as Record<string, string>, e = (en[id] ?? {}) as Record<string, string>; return `| \`${id}\` | **${cell(p.name)}**${p.plural ? ` / ${cell(p.plural)}` : ''} — ${cell(p.desc)} | **${cell(e.name)}**${e.plural ? ` / ${cell(e.plural)}` : ''} — ${cell(e.desc)} |`; }));
  sec('Eras', AGES.map((a, i) => ({ a, i })).filter(({ a, i }) => base.data[`age.${i}`] !== fnv(`${a.name}|${a.short}|${a.desc}`)).map(({ a, i }) => { const e = (EN.EN_AGES as Record<string, { name?: string; short?: string; desc?: string }>)[String(i)] ?? {}; return `| ${i} | **${cell(a.name)}** (${cell(a.short)}) — ${cell(a.desc)} | **${cell(e.name)}** (${cell(e.short)}) — ${cell(e.desc)} |`; }));
  const mis: string[] = []; const seen = new Set(base.missions);
  const walk = (o: unknown, f: string) => { if (!o || typeof o !== 'object') return; const r = o as Record<string, unknown>; if (typeof r.pt === 'string' && typeof r.en === 'string' && !seen.has(fnv(r.pt))) mis.push(`| ${f} | ${cell(r.pt)} | ${cell(r.en)} |`); for (const [k, v] of Object.entries(r)) if (k !== 'map') walk(v, f); };
  for (const f of fs.readdirSync('src/core/scenario/missions').sort()) walk(JSON.parse(fs.readFileSync(`src/core/scenario/missions/${f}`, 'utf8')), f);
  sec('Missões (JSON)', mis);
  const file = process.argv[2] ?? 'docs/eras/textos-pt-en.md';
  fs.writeFileSync(file, out.join('\n'));
  console.log(`${file}: ${out.filter((l) => l.startsWith('| ') && !l.startsWith('| id')).length} linhas`);
  ```
  A E3 criou `LINES` e `EN_LINES` (nomes das linhas): acrescente `LINES` ao import de `'../src/core/data'` e, antes de
  `sec('Eras', …)`, a linha
  ```ts
  sec('Linhas', Object.values(LINES).map((l) => `| \`${l.id}\` | ${cell(l.name)} | ${cell((EN as unknown as { EN_LINES?: Record<string, { name?: string }> }).EN_LINES?.[l.id]?.name)} |`));
  ```
  (a base não tem linhas: todas aparecem). A planilha compara só o **PT** com a base: um EN que mudou sozinho não aparece
  nela (o teste do C1 cobre os erros mecânicos do EN). Rode `npx tsx scripts/i18n-review.ts`.
- [ ] **C3. Leitura da planilha.** Leia **inteira** `docs/eras/textos-pt-en.md` com a ferramenta Read (em partes de
  ~300 linhas). Em cada linha confira, nesta ordem:
  1. **Sentido**: o EN diz o mesmo que o PT (nada a mais, nada a menos);
  2. **Termos do glossário E9-5** e nomes iguais aos da enciclopédia (a mesma unidade não pode ter dois nomes);
  3. **Gênero e número em PT** ("a Biblioteca", "os Escutatos"; plural das unidades em `plural`);
  4. **Maiúsculas**: nomes de edifício, unidade, Era e recurso com inicial maiúscula nos dois idiomas, como os de hoje
     ("Centro Cívico", "Town Center", "Era Clássica", "Classical Era");
  5. **Pontuação**: PT com vírgula decimal ("1,5") e espaço antes de "%" só se os textos vizinhos usam; EN com ponto
     decimal ("1.5"); frase termina com ponto nas descrições;
  6. **Teclas**: a letra citada existe no código para aquilo.

  Corrija direto nos arquivos de origem; rode `npx tsx scripts/i18n-review.ts` de novo e `npx vitest run tests/i18n-eras.test.ts`.
  A planilha vai no commit (registro da revisão).

### Bloco D — Configuração no multiplayer

- [ ] **D1. Relay (`server/relay.mjs`, `cleanSettings`).** Tire `'startAge'`, `'endAge'` e `'wonderVictory'` da lista
  que passa pela regex `WORD` (a E1 e a E7 as puseram lá) e acrescente, depois do laço:
  ```js
  // Eras (0–7 = as 8 Eras do jogo; mude junto com AGES) e a regra de maravilha (E7): só valores conhecidos
  if (typeof s.startAge === 'string' && /^(auto|[0-7])$/.test(s.startAge)) out.startAge = s.startAge;
  if (typeof s.endAge === 'string' && /^[0-7]$/.test(s.endAge)) out.endAge = s.endAge;
  if (typeof s.wonderVictory === 'string' && /^(points|hold|off)$/.test(s.wonderVictory)) out.wonderVictory = s.wonderVictory;
  ```
  No `send(ws, { t: 'rooms', … })`, acrescente ao objeto de cada sala
  `startAge: r.settings.startAge ?? null, endAge: r.settings.endAge ?? null, wonderVictory: r.settings.wonderVictory ?? null`.
- [ ] **D2. Cliente (`src/net/client.ts`).** Em `RoomSummary`, acrescente
  `startAge?: string | null; endAge?: string | null; wonderVictory?: string | null;`.
- [ ] **D3. Lista de salas (`src/ui/menu.ts`, `roomListHTML`).** Importe `ROMAN`, `MAX_AGE`, `clampEra` de
  `'../core/data'` e `effectiveStartEra` de `'./era-select'` (da E1; se ainda não estiverem) e, antes do `return`, defina
  ```ts
  const erasOf = (r: RoomSummary) => {
    const a = effectiveStartEra(r.startAge ?? 'auto', r.mode as GameMode);   // 'auto' segue o modo (Deathmatch começa na II)
    const b = r.endAge != null ? clampEra(Number(r.endAge)) : MAX_AGE;
    return t('mp.roomEras', { from: ROMAN[a], to: ROMAN[b] });
  };
  ```
  e, no texto da sala, logo depois do `t('mp.roomInfo', {...})`, acrescente
  `` `${r.mode !== 'horde' ? ` · ${erasOf(r)}` : ''}${r.wonderVictory && r.wonderVictory !== 'points' ? ` · ${esc(t(`wv.${r.wonderVictory}`))}` : ''}` ``
  (sala de Horda: o `mode` é `horde` e as Eras não valem; o `esc` protege contra um relay antigo que repasse um valor
  qualquer — `t()` devolve a própria chave quando ela não existe). `GameMode` vem de `'../core/constants'` (o menu já o
  importa desde a E1; confira com `grep -n "GameMode" src/ui/menu.ts`).
- [ ] **D4. Teste.** Em `tests/relay-anticheat.test.ts`, o `it` novo da seção "Testes". *Conferir:*
  `npx vitest run tests/relay-anticheat.test.ts tests/relay-version.test.ts`.

### Bloco E — Controle na árvore de estudos

- [ ] **E1. `src/ui/studytree.ts` (da E1), `studyTreeHtml`.**
  1. Assinatura: `studyTreeHtml(m: StudyTreeModel, fmtCost: (c: Record<string, number>) => string, opts: { autofocus?: boolean } = {})`.
  2. O corpo da grade: troque `<div class="tree-body">` por `<div class="tree-body" data-scroll>`.
  3. Ao montar os nós, numere as linhas: `m.rows.map((row, ri) => …)`. Em cada `<button class="tree-node …">`
     acrescente `data-era="${x.era}" data-row="${ri}"`.
  4. Foco inicial: antes de montar, `const first = opts.autofocus ? (m.rows.flatMap((r) => r.cells.flat()).find((x) => x.status === 'available') ?? m.rows.flatMap((r) => r.cells.flat()).find((x) => x.status === 'active'))?.id : undefined;`
     e no botão cujo `x.id === first`, acrescente ` data-autofocus`.
- [ ] **E2. `src/ui/hud.ts`, `renderStudyTree(first)` (da E1).** Troque `studyTreeHtml(m, fc)` por
  `studyTreeHtml(m, fc, { autofocus: first })`. No laço `querySelectorAll('[data-study]')`, junto de
  `el.addEventListener('focus', show)`, acrescente `el.addEventListener('padfocus', show);`.
  Em `showMenu`, troque o bind do `#m-tree` (E1) por
  `q('#m-tree').addEventListener('click', () => { this.menuOpen = false; s.paused = this.pausedBeforeMenu; this.showStudyTree(); });`.
  Motivo: o menu pausa a partida e o `LocalScheduler` só aplica um comando no próximo tick; aberta pelo menu (o único
  caminho do controle, que não tem F3), a árvore ficava pausada e o A "estudava" sem nada mudar na fila até o jogador
  fechar o menu. Com isso a árvore aberta pelo menu se comporta como a aberta pelo F3 (que não pausa).
- [ ] **E3. `src/ui/gamepad.ts`.**
  1. Função pura exportada, perto de `navPick`:
     ```ts
     /** Árvore de estudos (E9): LB/RB pulam para a coluna da Era anterior/seguinte que tenha nó, na mesma linha se houver;
      *  senão, na linha mais próxima. `from` = índice do nó em foco (-1: nenhum, parte do primeiro). Sem coluna nessa direção: fica. */
     export function treeJump(nodes: { era: number; row: number }[], from: number, dir: -1 | 1): number {
       if (!nodes.length) return -1;
       const cur = nodes[from] ?? nodes[0];
       const eras = [...new Set(nodes.map((n) => n.era))].sort((a, b) => a - b);
       const target = eras[eras.indexOf(cur.era) + dir];
       if (target === undefined) return Math.max(0, from);
       const same = nodes.findIndex((n) => n.era === target && n.row === cur.row);
       if (same >= 0) return same;
       let best = -1, bestD = Infinity;
       nodes.forEach((n, k) => { if (n.era !== target) return; const d = Math.abs(n.row - cur.row); if (d < bestD) { bestD = d; best = k; } });
       return best;
     }
     ```
  2. Em `keyOf`, logo depois de `if (ds.god) return \`god:${ds.god}\`;`, acrescente
     `if (ds.study) return \`study:${ds.study}\`;`.
  3. Em `setFocus`, depois de `ring.scrollIntoView?.(…)`, acrescente
     `e.dispatchEvent(new CustomEvent('padfocus'));` (o painel de detalhe da árvore escuta; o foco do navegador não muda).
  4. Em `scrollBox`, troque a busca do modal por
     `const inner = (root.querySelector('[data-scroll]') ?? root.querySelector('[style*="overflow:auto"]')) as HTMLElement | null;`.
  5. Em `navTab`, troque `if (tabs.length < 2) return;` por
     `if (tabs.length < 2) { if (root.querySelector('.tree-grid')) this.treeEra(root, dir < 0 ? -1 : 1); return; }`
     e acrescente o método:
     ```ts
     /** Árvore de estudos: LB/RB = Era anterior/seguinte (treeJump). */
     private treeEra(root: HTMLElement, dir: -1 | 1): void {
       const list = [...root.querySelectorAll<HTMLElement>('.tree-node[data-era]')].filter((e) => e.getClientRects().length > 0);
       const k = treeJump(list.map((e) => ({ era: Number(e.dataset.era), row: Number(e.dataset.row) })), this.focusEl ? list.indexOf(this.focusEl) : -1, dir);
       if (k >= 0 && list[k]) { this.focusRoot = root; this.setFocus(list[k]); }
     }
     ```
  6. Em `navHints`, depois de `const tabs = …`, acrescente `const tree = !tabs && !!root.querySelector('.tree-grid');`
     e, na lista sem `editingSelect`, troque o item final por
     `tabs ? it(\`${padGlyph(BTN.LB)}${padGlyph(BTN.RB)}\`, t('pad.hint.tabs')) : tree ? it(\`${padGlyph(BTN.LB)}${padGlyph(BTN.RB)}\`, t('pad.hint.eras')) : ''`.
- [ ] **E4. Testes:** `treeJump` em `tests/gamepad.test.ts` e os atributos novos em `tests/studytree.test.ts` (seção
  "Testes"). *Conferir:* `npx vitest run tests/gamepad.test.ts tests/studytree.test.ts`.

### Bloco F — Playtests

- [ ] **F1. Gancho `debugNames` (`src/main.ts`).** No objeto `window.aoe`, ao lado de `debugBuild`:
  ```ts
  /** E9: nomes, degraus e requisitos para os playtests (scripts/playtest-eras.mjs), sem importar TypeScript; fora do lockstep. */
  debugNames: () => ({
    ages: AGES.map((a) => a.short), techCount: AGES.map((a) => a.requires.techCount ?? 0), reqBuilding: AGES.map((a) => a.requires.building ?? null), minorGod: AGES.map((a) => a.minorGod),
    resources: [...RESOURCES], oilFromAge: OIL_FROM_AGE, academyLines: [...ACADEMY_LINES],
    units: Object.fromEntries(Object.values(UNITS).map((u) => [u.id, u.name])), buildings: Object.fromEntries(Object.values(BUILDINGS).map((b) => [b.id, b.name])),
    lines: Object.fromEntries(Object.values(LINES).map((l) => [l.id, l.steps])),
  }),
  ```
  (importe o que faltar de `'./core/data'` e `'./core/constants'`).
- [ ] **F2. `scripts/playtest-eras.mjs` (novo).** Copie e complete:
  ```js
  // 8 Eras no navegador (E9, docs/eras/E9-E10-interface-balanceamento.md): uma partida rápida atravessa as Eras I → VIII pelo
  // caminho do jogador — avanço na Biblioteca (tecla E) e carta do deus menor (II–VII) —, com atalhos de teste só para os
  // requisitos (estudos das linhas em player.techs, edifícios por debugBuild, cofres cheios) e a simulação por
  // scheduler.step. Em cada Era: topo (nome, petróleo só da IV), painel da Biblioteca, árvore (8 colunas, Era atual
  // marcada), Quartel com o degrau atual da Infantaria pesada, enciclopédia (8 abas), nenhum emoji e nenhum ícone vazio;
  // grava <out>/eras-e9-era<n>[-en].png. Código de saída 1 em qualquer falha.
  // Uso: node scripts/playtest-eras.mjs [url] [--lang pt|en] [--out docs/art]   (exige `npm run build && npm run preview`)
  import { chromium } from 'playwright';
  import fs from 'node:fs';
  const args = process.argv.slice(2);
  const url = args[0] && !args[0].startsWith('--') ? args[0] : 'http://localhost:4173/';
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const LANG = opt('--lang', 'pt'), OUT = opt('--out', 'docs/art');
  const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch({ env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' }, executablePath: fs.existsSync(CHROME) ? CHROME : undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failures = [], errors = [];
  const check = (label, cond, extra = '') => { console.log(`${label}: ${cond ? 'ok' : 'FALHOU'}${extra ? ' | ' + extra : ''}`); if (!cond) failures.push(label); };
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}]/u;
  const emojiIn = (sel) => page.evaluate(([s, src]) => { const re = new RegExp(src, 'u'); const root = document.querySelector(s); if (!root) return []; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const hits = []; for (let n = w.nextNode(); n; n = w.nextNode()) if (re.test(n.nodeValue ?? '') && !n.parentElement?.closest('[data-raw], .hidden')) hits.push((n.nodeValue ?? '').trim().slice(0, 40)); return hits; }, [sel, EMOJI.source]);

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.selectOption('#m-locale', LANG).catch(() => {});
  await page.fill('#m-seed', '31'); await page.selectOption('#m-ais', '1').catch(() => {});
  await page.click('#m-start');
  await page.waitForFunction(() => window.aoe?.session, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const s = window.aoe.session; s.paused = true;
    window.__build = (type) => {   // edifício pronto perto do Centro Cívico (anel de tentativas, como no playtest-noemoji)
      const st = s.state; const old = [...st.buildings.values()].find((x) => x.owner === s.local && x.type === type && !x.dead); if (old) return old;
      const tc = [...st.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center');
      for (let r = 5; r < 18; r++) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; const b = window.aoe.debugBuild(s.local, type, Math.round(tc.x + Math.cos(a) * r), Math.round(tc.y + Math.sin(a) * r)); if (b) return b; }
      return null;
    };
    window.__ff = (sec) => { for (let i = 0; i < sec * 20; i++) s.scheduler.step(s.state); };
    // cofres cheios; o petróleo só a partir da Era dele (a E2 esconde o petróleo do topo só com age < OIL_FROM_AGE **e** oil < 1)
    window.__rich = (oil) => { for (const r of Object.keys(s.player.resources)) s.player.resources[r] = r === 'oil' && !oil ? 0 : 99999; };
  });
  const N = await page.evaluate(() => window.aoe.debugNames());
  check('8 Eras nos dados', N.ages.length === 8, N.ages.join(', '));
  const lib = await page.evaluate(() => window.__build('academy')?.id ?? -1);
  const brk = await page.evaluate(() => window.__build('barracks')?.id ?? -1);
  check('Biblioteca e Quartel prontos', lib >= 0 && brk >= 0);
  const oilIdx = N.resources.indexOf('oil');
  for (let k = 0; k < N.ages.length; k++) {
    await page.waitForTimeout(500);
    const top = await page.evaluate((oi) => { const res = [...document.querySelectorAll('#top .res')]; return { age: document.querySelector('#top .age')?.textContent ?? '', oil: res[oi] ? !res[oi].classList.contains('hidden') : false }; }, oilIdx);
    check(`Era ${k + 1}: topo mostra ${N.ages[k]}`, top.age.includes(N.ages[k]), top.age);
    check(`Era ${k + 1}: petróleo ${k >= N.oilFromAge ? 'visível' : 'escondido'}`, top.oil === (k >= N.oilFromAge));
    // Infantaria pesada no degrau da Era (estudos de evolução empurrados até a Era atual)
    const heavy = N.lines.heavy_infantry;
    const want = N.units[[...heavy.slice(0, k + 1)].reverse().find(Boolean)];
    await page.evaluate(([k, id]) => { const s = window.aoe.session; for (let n = 1; n <= k; n++) { const t = `evo_heavy_infantry_${n + 1}`; if (!s.player.techs.includes(t)) s.player.techs.push(t); } s.select([id]); }, [k, brk]);
    await page.waitForTimeout(400);
    const labels = await page.$$eval('#commands .cmd .lbl', (els) => els.map((e) => e.textContent.trim()));
    check(`Era ${k + 1}: Quartel treina ${want}`, labels.some((l) => l.includes(want)), labels.slice(0, 4).join(', '));
    // árvore de estudos
    await page.keyboard.press('F3'); await page.waitForTimeout(600);
    const tree = await page.evaluate(() => ({ open: !!document.querySelector('#modal.tree'), eras: document.querySelectorAll('#modal .tree-era').length, cur: document.querySelector('#modal .tree-era.cur')?.textContent ?? '', ph: document.querySelectorAll('#modal .hic-ph').length, h2: document.querySelector('#modal h2')?.textContent ?? '' }));
    check(`Era ${k + 1}: árvore com 8 colunas e a Era marcada`, tree.open && tree.eras === 8 && tree.cur.includes(N.ages[k]) && tree.ph === 0, JSON.stringify(tree));
    if (LANG === 'en') check(`Era ${k + 1}: árvore em inglês`, tree.h2.includes('Study tree'), tree.h2);
    check(`Era ${k + 1}: árvore sem emoji`, (await emojiIn('#modal')).length === 0);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    // enciclopédia
    await page.keyboard.press('F2'); await page.waitForTimeout(500);
    check(`Era ${k + 1}: enciclopédia com 8 abas`, (await page.$$('#modal [data-tab]')).length === 8);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    check(`Era ${k + 1}: HUD sem emoji`, (await emojiIn('#hud')).length === 0);
    await page.evaluate((id) => window.aoe.session.select([id]), lib); await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/eras-e9-era${k + 1}${LANG === 'en' ? '-en' : ''}.png` });
    if (k === N.ages.length - 1) break;
    // requisitos da próxima Era (atalhos de teste) e avanço pelo caminho do jogador
    const req = N.reqBuilding[k + 1];
    if (req) check(`Era ${k + 2}: requisito ${req}`, await page.evaluate((t) => !!window.__build(t), req));
    await page.evaluate(([n, lines, oil]) => { const p = window.aoe.session.player; window.__rich(oil); for (let i = 0; i < n; i++) { const id = `${lines[i % lines.length]}${Math.floor(i / lines.length) + 1}`; if (!p.techs.includes(id)) p.techs.push(id); } }, [N.techCount[k + 1], N.academyLines, k + 1 >= N.oilFromAge]);
    await page.evaluate((id) => window.aoe.session.select([id]), lib); await page.waitForTimeout(400);
    await page.keyboard.press('e'); await page.waitForTimeout(500);
    if (N.minorGod[k + 1]) {
      const cards = await page.$$('#modal .card');
      check(`Era ${k + 2}: modal do deus menor com 2 cartas`, cards.length === 2, String(cards.length));
      if (cards.length) await cards[0].click();
      await page.waitForTimeout(300);
    }
    // o avanço entra na fila da Biblioteca pelo comando de verdade; aqui só se encurta a espera (o tempo da Era, 60–150 s):
    // 8 Eras de espera inteira dariam ~15 min de jogo, e a IA adversária atacaria uma cidade sem exército
    const reached = await page.evaluate((target) => { const s = window.aoe.session; window.__ff(0.2); for (const b of s.state.buildings.values()) if (b.owner === s.local) for (const q of b.queue) if (q.kind === 'age') q.elapsed = Math.max(q.elapsed, q.total - 0.5); for (let i = 0; i < 20 && s.player.age < target; i++) window.__ff(1); return s.player.age; }, k + 1);
    check(`avanço para a Era ${k + 2}`, reached === k + 1, `Era ${reached + 1}`);
  }
  // Era VIII: Portal dos Titãs no menu de construção do cidadão
  await page.evaluate(() => { const s = window.aoe.session; const v = [...s.state.units.values()].find((u) => u.owner === s.local && u.type === 'villager'); if (v) s.select([v.id]); });
  await page.waitForTimeout(400);
  check('Era VIII: Portal dos Titãs no menu', (await page.textContent('#commands'))?.includes(N.buildings.titan_gate) ?? false);
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
  console.log(failures.length ? `${failures.length} falha(s): ${failures.join('; ')}` : 'playtest-eras: tudo ok');
  await browser.close();
  process.exit(failures.length || errors.length ? 1 : 0);
  ```
  Se a Biblioteca recusar a tecla `E` porque a fila do edifício está ocupada por filósofos, esvazie a fila antes
  (`s.state.buildings.get(lib).queue.length = 0` no `evaluate`). Rode em PT e em EN; olhe as 8 capturas de cada idioma.
- [ ] **F3. `scripts/playtest.mjs`.** Acrescente um vetor `fails` e, no fim, `process.exit(fails.length || errors.length ? 1 : 0)`.
  Depois do passo "enciclopédia e ajuda": `F3` → `#modal.tree` visível e 8 `.tree-era` (senão `fails.push`), `Escape`;
  `F2` → 8 `#modal [data-tab]`, clique em cada aba (sem erro de página), `Escape`. Clique pelas ids, não por
  `ElementHandle`: cada clique redesenha o modal e os handles antigos ficam soltos (o clique falha em silêncio com o
  `.catch`). Modelo: `for (const id of await page.$$eval('#modal [data-tab]', (els) => els.map((e) => e.dataset.tab))) { await page.click('#modal [data-tab="' + id + '"]'); await page.waitForTimeout(250); … }`.
- [ ] **F4. `scripts/playtest-noemoji.mjs`.** Na parte da partida:
  - troque `p.age = 3; Object.assign(p.resources, { food: 9000, … })` por `p.age = 7;` e
    `for (const r of Object.keys(p.resources)) p.resources[r] = 9000;`;
  - o `showMinorGodChoice` lê `AGES[p.age + 1]`: com `p.age = 7` ele quebra (`AGES[8]` não existe). No passo `'deus-menor'`
    de hoje ponha `p.age = 0` antes da chamada (Atena/Hermes são da Era II) e, no novo `'deus-menor-v'`, `p.age = 3`
    (Pã/Hécate são da Era V); depois de cada um, `hideModal()` e `p.age = 7` de novo;
  - novos `step`: `'arvore'` (`window.aoe.hud.showStudyTree()`; depois do passo, `window.aoe.hud.hideModal()`), `'poco'` (`window.__build('naphtha_well')`),
    `'refinaria'` (`window.__build('refinery')`), `'estaleiro'` (`window.__build('shipyard')`; se voltar `null`, só
    `console.log` — o mapa da semente pode não ter costa perto), `'maravilha'` (`window.__build('wonder_parthenon')`),
    `'deus-menor-v'` (`window.aoe.hud.showMinorGodChoice(['pan', 'hecate'], () => {})`);
  - nos dois laços das abas (`#modal [data-tab]`: o da enciclopédia do menu principal e o da partida), troque o
    `for (const tb of await page.$$(…))` pelo laço por ids do F3 (os handles ficam soltos depois do 1º clique: hoje só a
    1ª aba é escaneada); depois de clicar cada aba, se houver `#enc-era`, `selectOption('#enc-era', '4')` e escaneie de novo.
  *Conferir:* sai com "nenhum emoji …" e código 0.
- [ ] **F5. `scripts/playtest-i18n.mjs`.** Crie `fails` e `process.exit(...)` como no F3. Ainda em inglês, logo **antes**
  de `// menu in-game: idioma de volta para PT`:
  - `F3`: `#modal h2` contém `Study tree`; `Escape`;
  - `F2`: para cada aba (laço por ids, como no F3), clique e rode o detector de português no `#modal`:
    ```js
    const PT_LEAK = /[ãõçÃÕÇ]|\b(Biblioteca|Pedra|Petróleo|Maravilha|Estudos?|Cidadãos?|Fortaleza|Templo|Comida|Madeira|Ouro|Conhecimento|Estaleiro|Caravana|Mercador|Idade|Linha)\b/;
    const leaks = await page.evaluate((src) => { const re = new RegExp(src); const out = []; const w = document.createTreeWalker(document.querySelector('#modal'), NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (re.test(n.nodeValue ?? '') && !n.parentElement?.closest('[data-raw]')) out.push((n.nodeValue ?? '').trim().slice(0, 50)); return out; }, PT_LEAK.source);
    ```
    `leaks` vazio (senão `fails.push`, mostrando os 5 primeiros);
  - `F1` (ajuda): o mesmo detector; `#top .age` contém `Era`.
- [ ] **F6. `scripts/playtest-gamepad.mjs`.** Na parte da partida, **antes** do bloco `// desconexão` (ele desliga o
  controle e o resto do script não funcionaria), acrescente:
  1. Biblioteca pronta (`debugBuild` como no F2) e cofres cheios;
  2. `START` abre o menu; ande com `walkTo('m-tree', B.DOWN, B.RIGHT)` e `tap(B.A)`;
  3. `ok('árvore pelo controle: foco num estudo', …)` — o elemento `.pad-focus` é um `.tree-node` com `data-study`;
  4. guarde o `#tree-detail` e dê `tap(B.RIGHT)`: o texto do detalhe mudou (o `padfocus` funcionou);
  5. `tap(B.RB)`: o `data-era` do foco aumentou; `tap(B.LB)`: voltou;
  6. mexa o analógico de rolagem (`setAxes([0, 0, 0, 0.9])`, espere 10 quadros, zere): o `scrollTop` de
     `#modal .tree-body` aumentou;
  7. com o foco num nó `st-available`, `tap(B.A)` e espere ~1 s de jogo (`waitFrames(30)`; a partida tem de estar
     rodando — o E2 tira a pausa do menu ao abrir a árvore; confira `window.aoe.session.paused === false`): a fila
     (`#modal .tree-queue`) mudou e o foco continua num `.tree-node` com o mesmo `data-study` ou no seguinte;
  8. `tap(B.B)` fecha a árvore. Capture `docs/art/eras-e9-arvore-controle.png`.
- [ ] **F7. `scripts/playtest-mp.mjs` e `scripts/playtest-rooms.mjs`.**
  - mp: antes de `#mp-start`, o anfitrião faz `selectOption('#mp-startage', '2')` e `selectOption('#mp-endage', '4')`;
    o convidado vê os dois selects com esses valores (desabilitados); depois do início, nos dois:
    `s.player.age === 2` e `s.state.config.maxAge === 4`; o `#m-matchinfo` do menu da partida diz `Eras III–V` nos dois.
  - rooms: o anfitrião escolhe Eras III–V; a lista do convidado contém `Eras III–V`.

### Bloco G — Verificação e commit da E9

- [ ] **G1.** Seção "Verificação", itens 1–8 (E9).
- [ ] **G2.** Seção "Ao terminar", itens da E9, e commit.

## Parte 2 — E10

### Bloco H — Base (antes de qualquer ajuste)

- [ ] **H0. Pré-condições** (vazio = pare):
  ```sh
  git log --oneline -1 | grep -i "E9"                                            # o commit da E9 é o último
  grep -n "export const VILLAGER_TARGET\|export const FARM_LIMIT\|export const ARMY_ATTACK\|export const MIN_ARMY" src/core/sim/ai.ts   # E1
  grep -n "EVO_USERS\|function evolutionAllowed" src/core/sim/ai.ts           # E3
  grep -n "export const FISH_BOATS\|export const WARSHIPS_ISLAND" src/core/sim/ai.ts   # E4
  grep -n "export const MERCHANT_MAX_AI\|export const CARAVAN_TARGET_AI" src/core/constants.ts   # E2, E5
  grep -n "export function isScenarioConfig" src/core/sim/restrictions.ts     # E1
  ```
  Os blocos N3 e P1–P3 pedem também a E8 (linha "E8" com estado "feito" em `docs/eras/PROGRESSO.md` e
  `grep -n "debugSetAge" src/main.ts` não vazio); sem ela, faça o resto e deixe os três como pendência no `PROGRESSO.md`.
- [ ] **H1. Medições de base**, em segundo plano, uma de cada vez, com o log em `/tmp/e10/`:
  ```sh
  mkdir -p /tmp/e10
  npx tsx scripts/missions.ts 2>&1 | sed -E 's/ \([0-9.]+s\)$//' > /tmp/e10/missions-base.txt
  npm run smoke 60 42 > /tmp/e10/smoke60-base.txt
  npx tsx scripts/perf.ts 60 > /tmp/e10/perf-base.txt
  ```
  (O `balance` de base roda depois do bloco I, com as flags novas.)
- [ ] **H2. Valores congelados.** Imprima e guarde (vão para o teste do J4, `tests/ai-pace.test.ts`):
  ```sh
  npx tsx -e "import { AGES, UNITS, TECHS, ACADEMY_LINES } from './src/core/data'; const ids = ['villager','kataskopos','hoplite','toxotes','peltast','hippeus','hypaspist','cretan_archer','hetairoi','petrobolos','myrmidon','helepolis','basileus','militia','jason','odysseus','heracles','achilles','perseus','pegasus','minotaur','centaur','cyclops','manticore','hydra','nemean_lion','medusa','colossus','chimera','cerberus','sentinel','shade','prometheus','oceanus','cronus']; console.log(JSON.stringify({ ages: AGES.slice(0, 4).map((a) => ({ cost: a.cost, time: a.time, requires: a.requires })), units: Object.fromEntries(ids.map((id) => { const u = UNITS[id]; return [id, [u.cost, u.hp, u.attack, u.armor, u.range, u.speed, u.trainTime, u.bonus, u.age]]; })), lines: Object.fromEntries(ACADEMY_LINES.flatMap((l) => [1, 2, 3, 4].map((n) => [l + n, [TECHS[l + n].cost, TECHS[l + n].time]]))) }))" > /tmp/e10/frozen.json
  ```
  e anote em `/tmp/e10/pace-classico.txt` os valores atuais de cada campo da tabela E10-3 (procure os trechos citados
  na coluna "onde lê hoje" em `src/core/sim/ai.ts`).

### Bloco I — Ferramentas de medição

- [ ] **I1. `scripts/balance.ts`.** Reescreva mantendo o formato das linhas de hoje (`=== semente …`, `aos 5 min: …`,
  `<nome> vivo|morto idade=… idades aos minutos [...] …`, `Vencedor: …`). Estrutura:
  1. Argumentos: posicionais `[minutos=30] [sementes=1,2,3]` (aceite intervalo `1-18` e lista, como `fairness.ts`);
     flags `--map arquivo` (como hoje), `--jobs N`, `--json saída`, `--targets`, `--stalls-only`,
     `--diff easy|normal|hard|brutal` (padrão `normal`), `--map-type <MapType>` (padrão `continental`; recuse tipo fora
     de `MAP_TYPES`), `--size small|medium|large` (padrão `medium`; recuse fora de `MAP_SIZES`), `--worker k/of` (interno).
  2. `runOne(seed)` cria a partida como hoje (3 IAs Zeus/Poseidon/Hades, ou tantas quantos inícios no mapa fixo),
     com `difficulty` = `--diff`, `mapType` e `mapSize` das flags, e devolve:
     ```ts
     interface PlayerRun { name: string; alive: boolean; died: number | null; arrivals: number[]; age: number; waves: number; kills: number; losses: number; razed: number; territory: number; techs: number; evo: number; bless: number; wonders: number; titan: boolean; ships: number; caravans: number }
     interface Flag { min: number; player: string; kind: 'PARADA' | 'TRAVADA' | 'TRAVADA-RECURSO' | 'ACUMULANDO' | 'SEM-ONDAS'; detail: string }
     interface SeedRun { seed: number; minutes: number; ms: number; msPerTick: number; winner: string | null; endMin: number | null; at5: string; flags: Flag[]; players: PlayerRun[] }
     ```
     - `arrivals[k]` = minuto (1 casa decimal: `Math.round(state.time / 6) / 10`) em que chegou à Era `k`
       (`arrivals[0] = 0`; quem começa numa Era alta tem 0 nas anteriores); a linha "idades aos minutos" continua
       arredondando para o minuto inteiro, como hoje;
     - `died` = `p.defeatedTick / TICK_RATE / 60` se morto, senão `null`;
     - marcos no fim: `evo` = estudos `evo_*` em `p.techs`, `bless` = `blessing*`, `wonders` = maravilhas prontas vivas
       do jogador, `titan` = `p.titanSpawned`, `ships` = unidades vivas com `UNITS[t].cls === 'ship'`,
       `caravans` = unidades vivas do tipo `caravan`;
     - detectores a cada `600 * TICK_RATE` ticks, pela tabela E10-5 (PARADA com `p.pop < p.popCap - 5`; TRAVADA usa
       `canAdvanceAge(state, p)` de `src/core/sim/commands.ts`, `maxAgeOf(state, p.id)` de `restrictions.ts` e
       `t('err.noResources')`/`t('err.advancing')` de `src/i18n` para separar o caso de recurso e ignorar o avanço já em
       andamento; ACUMULANDO compara com a checagem anterior;
       SEM-ONDAS só aos 30 min).
  3. Impressão por semente (na ordem das sementes, depois de todas terminarem): as linhas de hoje, mais
     `alertas: <lista>` (só se houver) e
     `marcos: <nome> evo=… bless=… mar=… tita=sim|não nav=… car=…` por IA.
  4. Paralelismo: copie o esquema de `scripts/maps/fairness.ts` (`spawn(process.execPath, [...process.execArgv,
     process.argv[1], ...argsSemJobsNemJson, '--worker', k + '/' + of])` — sem o `process.execArgv` o filho roda sem o carregador do
     `tsx` e não importa TypeScript; o filho imprime `@@<json>` por semente e sai). O resultado não depende
     de `--jobs`.
  5. `--targets` imprime no fim o resumo por Era (tabela E10-1; constantes no arquivo):
     ```ts
     const ERA_TARGET_MIN = [0, 4, 9, 14, 20, 26, 33, 40];
     const ERA_TOLERANCE_MIN = [0, 1, 1.5, 1.5, 2, 2, 2.5, 3];
     const ERA_MIN_REACH = [0, 0.8, 0.8, 0.8, 0.8, 0.7, 0.7, 0.6];
     ```
     Para cada Era `k ≥ 1` com `alvo + tolerância ≤ minutos`: elegíveis = IAs com `died === null || died > alvo + tol`
     **ou** que chegaram; mediana, p25 e p75 das que chegaram; situação `OK`, `LENTA (+x)`, `RÁPIDA (−x)` ou `POUCOS`
     (menos de 5 chegadas ou taxa abaixo do mínimo). Depois: `fim de partida: N/M com vencedor; antes de 30 min: X;
     mediana Y min`, `alertas: PARADA a · TRAVADA b · TRAVADA-RECURSO c · ACUMULANDO d · SEM-ONDAS e` e a linha final
     `ritmo: DENTRO|FORA`. Código de saída 1 se FORA (alguma Era fora ou PARADA/TRAVADA > 0).
  6. `--stalls-only`: imprime só os alertas e sai com 1 se houver PARADA ou TRAVADA.
  7. `--json`: grava `{ minutes, seeds, diff, mapType, size, map, runs }`.

  *Conferir:* `npm run balance 6 1` (sem flags) imprime como hoje; `npm run balance 12 1-3 -- --jobs 3 --targets` sai
  com "fora do tempo medido" nas Eras altas e o resumo; `--jobs 1` e `--jobs 3` dão os mesmos números.
- [ ] **I2. `scripts/perf.ts`.** Flags `[minutos=30] --seed 2026 --size large --map-type continental --start-age N --json saída`
  (passe `startingAge` e `mapType` ao `createGame`); mantenha a linha por minuto; acumule por minuto `{ min, units,
  buildings, avg, p95 }`; no fim imprima `pior tick` (como hoje) e
  `orçamento (média ≤ 5 ms em todo minuto, p95 ≤ 12 ms, pior ≤ 50 ms): DENTRO|FORA`; com `--json`, grave tudo. Código
  de saída 1 se FORA.
- [ ] **I3. `scripts/renderperf.mjs` e `scripts/rendercpu.mjs`.** `--start-age N` → `startingAge: N` no objeto passado a
  `window.aoe.startGame(...)`. No `renderperf`, `--types a,b,…`: o laço que completa até `--units` usa
  `types[i % types.length]` no lugar de `'hoplite'` (padrão continua `hoplite`). Registre as flags no comentário de uso.
- [ ] **I4. `scripts/profsum.mjs` (novo):**
  ```js
  // Resumo de um perfil de CPU do Node (.cpuprofile, de `node --cpu-prof`): as funções com mais tempo PRÓPRIO.
  // Uso: npx tsx --cpu-prof --cpu-prof-dir /tmp/e10/prof scripts/perf.ts 30 && node scripts/profsum.mjs /tmp/e10/prof/<arquivo>.cpuprofile [25]
  // (o tsx grava 2 perfis, o do lançador e o do script: passe o maior, `ls -S /tmp/e10/prof | head -1`)
  import fs from 'node:fs';
  const [file, topArg] = process.argv.slice(2);
  const prof = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < prof.samples.length; i++) { const n = byId.get(prof.samples[i]); const cf = n.callFrame; const key = `${cf.functionName || '(anônima)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`; self.set(key, (self.get(key) ?? 0) + (prof.timeDeltas[i] ?? 0)); }
  const total = [...self.values()].reduce((a, b) => a + b, 0) || 1;
  for (const [k, us] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(topArg ?? 25))) console.log(`${((us / total) * 100).toFixed(1).padStart(5)} %  ${(us / 1000).toFixed(0).padStart(7)} ms  ${k}`);
  ```
- [ ] **I5. Base do balance**, com as flags novas (em segundo plano):
  `npm run balance 60 1-18 -- --jobs 3 --targets --json /tmp/e10/bal-base.json > /tmp/e10/bal-base.txt 2>&1`.
  Copie o resumo para o `PROGRESSO.md` (seção "Medições da E10 — antes").

### Bloco J — `AI_PACE` (troca de lugar, sem mudar comportamento)

- [ ] **J1. `src/core/sim/ai.ts`.** Importe `isScenarioConfig` de `'./restrictions'` e acrescente, depois das tabelas
  por Era:
  ```ts
  /** Ritmo da IA (E10, docs/eras/E9-E10-interface-balanceamento.md, tabela E10-3): os números que o balanceamento ajusta. */
  export interface AiPace {
    villagerTarget: readonly number[]; farmLimit: readonly number[]; armyAttack: readonly number[]; minArmy: readonly number[];
    advanceMinVillagers: number; templeVillagers: number; barracksVillagers: number; libraryVillagers: number;
    fortressWood: number; scholarsEarly: number; armyFundCap: number; evoUsers: number; farSearch: number; sellLots: number;
  }
  /** Os valores de antes da E10: valem em cenário (campanha, Horda, cenários JSON) — o harness das missões depende deles. */
  export const AI_PACE_CLASSIC: AiPace = {
    villagerTarget: VILLAGER_TARGET, farmLimit: FARM_LIMIT, armyAttack: ARMY_ATTACK, minArmy: MIN_ARMY,
    advanceMinVillagers: 12, templeVillagers: 8, barracksVillagers: 10, libraryVillagers: 9,
    fortressWood: 500, scholarsEarly: 3, armyFundCap: 1.6, evoUsers: EVO_USERS, farSearch: 70, sellLots: 4,
  };
  /** Partida fora de cenário: o que a E10 ajusta (começa igual ao clássico). Arrays COPIADOS: ajuste escrevendo os
   *  valores neste literal (ex.: `villagerTarget: [20, 26, …]`); nunca mexa em VILLAGER_TARGET & cia., que são da campanha. */
  export const AI_PACE: AiPace = { ...AI_PACE_CLASSIC, villagerTarget: [...VILLAGER_TARGET], farmLimit: [...FARM_LIMIT], armyAttack: [...ARMY_ATTACK], minArmy: [...MIN_ARMY] };
  /** Limites de cada botão (tests/ai-pace.test.ts confere). */
  export const AI_PACE_LIMITS = {
    advanceMinVillagers: [8, 14], templeVillagers: [5, 10], barracksVillagers: [7, 14], libraryVillagers: [5, 12], fortressWood: [250, 600],
    scholarsEarly: [2, 5], armyFundCap: [1.2, 2.0], evoUsers: [2, 10], farSearch: [70, 120], sellLots: [2, 8],
  } as const;
  export function aiPace(state: GameState): AiPace { return isScenarioConfig(state.config) ? AI_PACE_CLASSIC : AI_PACE; }
  ```
  Use nos campos os valores que o H2 anotou (se a E1/E3 deixaram outro número, é ele que vale). Se `EVO_USERS` for
  `const` local, exporte-o ou declare-o antes deste bloco. Se `MIN_ARMY` vier depois no arquivo, mova a declaração para
  cima, junto das outras tabelas.
- [ ] **J2. Troque cada leitura** pelo campo (cada função que precisa recebe `const pace = aiPace(state);` no começo).
  Liste antes **todas** as leituras — as etapas E2–E7 acrescentaram outras (a E4, por exemplo, lê `ARMY_ATTACK` em
  `manageInvasion`): `grep -n "VILLAGER_TARGET\[\|FARM_LIMIT\[\|ARMY_ATTACK\[\|MIN_ARMY\[\|EVO_USERS" src/core/sim/*.ts`; depois da
  troca, o mesmo `grep` só pode achar as declarações e o `AI_PACE_CLASSIC`/`AI_PACE`:
  `VILLAGER_TARGET[...]` → `pace.villagerTarget[...]` (as duas), `FARM_LIMIT[...]` → `pace.farmLimit[...]`,
  `ARMY_ATTACK[...]` → `pace.armyAttack[...]`, `MIN_ARMY[...]` → `pace.minArmy[...]`, `snap.villagers.length < 12` →
  `< pace.advanceMinVillagers`, Templo `>= 8` → `>= pace.templeVillagers`, 1º Quartel `>= 10` → `>= pace.barracksVillagers`,
  1ª Biblioteca `>= 9` → `>= pace.libraryVillagers`, Fortaleza `wood > 500` → `wood > pace.fortressWood`,
  `ac.scholars < 3` → `ac.scholars < pace.scholarsEarly`, `budget.minArmy * 1.6` → `budget.minArmy * pace.armyFundCap`,
  `EVO_USERS` em `evolutionAllowed` → `pace.evoUsers`, o último `nearestNode(..., 70, ...)` de `assignGatherer` →
  `pace.farSearch`, `sold < 4` → `sold < pace.sellLots`. **Não** troque as condições `age >= …` do plano.
  *Conferir (obrigatório, prova de que nada mudou):* `npm run smoke 20 42` dá o **mesmo hash** da E9 (anotado no 0.2 da
  E9 ou rode antes da troca); `npx vitest run tests/eras.test.ts tests/movement-ai.test.ts tests/position-fairness.test.ts tests/determinism.test.ts`.
- [ ] **J3. `src/core/data/techs.ts`.** Acrescente e exporte, antes de `line()`:
  ```ts
  /** E10: multiplicador do custo de cada nível das linhas da Biblioteca (índice = nível − 1). Os níveis 1–4 são da
   *  campanha e ficam 1 (tests/ai-pace.test.ts confere); o balanceamento das Eras V–VIII mexe nos níveis 5–8. */
  export const LINE_LEVEL_COST_MULT: readonly number[] = [1, 1, 1, 1, 1, 1, 1, 1];
  const scaleCost = (c: Cost, m: number): Cost => (m === 1 ? c : (Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(((v ?? 0) * m) / 5) * 5])) as Cost));
  ```
  (`Cost` já é importado no topo de `techs.ts`). Dentro de `line()`, envolva o custo do nível: troque
  `cost: opts.cost(lvl),` por `cost: scaleCost(opts.cost(lvl), LINE_LEVEL_COST_MULT[lvl - 1] ?? 1),`. As duas declarações
  ficam **antes** de `line()` e de `RAW` (o `RAW` chama `line()` ao carregar o módulo: `const` declarado depois daria
  `ReferenceError`).
  Reexporte em `src/core/data/index.ts` (na linha de `techs`). *Conferir:* smoke com o mesmo hash.
- [ ] **J4. `tests/ai-pace.test.ts` (novo)** — seção "Testes" (com o `/tmp/e10/frozen.json` colado como constante).
  *Conferir:* `npx vitest run tests/ai-pace.test.ts`. Commit intermediário opcional: "E10: AI_PACE (sem mudança de
  comportamento)".

### Bloco K — Ajuste do ritmo

- [ ] **K1. Leia o `/tmp/e10/bal-base.txt`** e escolha a **Era mais cedo** fora da tolerância.
- [ ] **K2. Rodada:** aplique **um** degrau da escada E10-4 para essa Era (em `AI_PACE` ou nos dados V–VIII), rode
  `npm run balance 50 1-6 -- --jobs 3 --targets > /tmp/e10/rodada-<n>.txt 2>&1` e decida pela regra da E10-4
  (aceita ou desfaz). Anote a rodada no `PROGRESSO.md`. Repita o K2 até: todas as Eras avaliadas em `OK` na rodada
  rápida, **ou** 12 rodadas, **ou** só restarem II–IV fora com os degraus deles esgotados (D18).
- [ ] **K3. Aceitação:** `npm run balance 60 1-18 -- --jobs 3 --targets --json docs/perf/<data>-e10-balance.json > /tmp/e10/bal-aceite.txt 2>&1`.
  Tem de sair `ritmo: DENTRO` (ou só II–IV fora, registrado como pendência). Se uma Era passou na rodada rápida e saiu
  aqui, volte ao K2 com ela.
- [ ] **K4. `SIM_VERSION`.** `src/core/constants.ts`: some 1 e acrescente a linha no histórico do comentário
  (`<n> = E10: ritmo das Eras (AI_PACE fora de cenário, Eras V–VIII, LINE_LEVEL_COST_MULT)`). *Conferir:*
  `npx vitest run tests/relay-version.test.ts tests/ai-pace.test.ts tests/i18n-eras.test.ts tests/eras.test.ts`.

### Bloco L — IA em partidas longas

- [ ] **L1.** Rode os quatro, em segundo plano, um por vez:
  `npm run balance 60 1-6 -- --jobs 3 --diff hard --stalls-only`, o mesmo com `--diff easy` e `--diff brutal`, e
  `npm run balance 75 1-6 -- --jobs 3 --stalls-only`.
- [ ] **L2.** Para cada PARADA ou TRAVADA: leia o `detail` (motivo), siga a coluna "Onde olhar" da E10-5, faça a
  correção indicada (botão do `AI_PACE` ou a tabela da IA citada) e rode de novo **só** a semente e a dificuldade em que
  apareceu (`npm run balance 60 <semente> -- --diff <d> --stalls-only`). Se a correção mexer num botão de ritmo, refaça
  o K3. Corrija código da IA (não só números) apenas se o motivo apontar para uma condição impossível (por exemplo a IA
  esperando uma Biblioteca com fila vazia que nunca esvazia): mude a condição no próprio ponto, **só fora de cenário**
  (`if (!isScenarioConfig(state.config)) …`), e confira o `missions.ts` (bloco O).
- [ ] **L3.** Mapas com mar: `npm run balance 60 1-6 -- --jobs 3 --map-type islands --stalls-only` e o mesmo com
  `coastal` e `mediterranean`; depois `--targets` em cada um só para **registrar** as medianas (o mar pode atrasar até
  +3 min por Era; mais que isso vai como pendência no `PROGRESSO.md`).
- [ ] **L4.** `npm run smoke 60 42` duas vezes: mesmo "hash final"; anote a maior Era aos 60 min e os eventos de Titã e
  maravilha.

### Bloco M — Justiça de posição

- [ ] **M1.** `npx vitest run tests/position-fairness.test.ts`.
- [ ] **M2.** Rode a tabela E10-7, uma linha por vez, em segundo plano (cada uma leva 20–40 min). Um "fora" isolado:
  confirme com `101-132` antes de corrigir.
- [ ] **M3. Se o índice sair do critério** (em qualquer mapa): o motor ou a IA está favorecendo a ordem dos jogadores.
  Procure laços novos sobre jogadores em que um recurso disputado é tomado por quem vem primeiro:
  ```sh
  grep -n "for (const p of state.players)" src/core/sim/ai.ts src/core/sim/wonders.ts src/core/sim/trade.ts src/core/sim/naval.ts src/core/sim/economy.ts
  grep -n "< bestD\|> bestV\|< best\b" src/core/sim/ai.ts src/core/sim/trade.ts src/core/sim/naval.ts
  ```
  Corrija com as regras do CLAUDE.md ("Justiça de posição"): desempate por `centerDist2` e `frameCompare`, ordem de
  pensamento por `aiThinkOrder`. Depois da correção: `SIM_VERSION` já subiu no K4 (não suba de novo nesta etapa),
  `npm run smoke 20 42` duas vezes e a linha da E10-7 de novo.
- [ ] **M4. Se só a posição de um mapa oficial sair** (índice ok): é o mapa. Registre no `PROGRESSO.md` com os números e
  **não** mexa nos mapas nesta etapa (a correção é dos scripts `scripts/maps/*.ts`, numa etapa própria).

### Bloco N — Desempenho

- [ ] **N1. Simulação.** As três linhas de simulação da E10-6, sozinhas na máquina. FORA: rode de novo (ruído de JIT);
  FORA duas vezes no mesmo trecho:
  1. `npx tsx --cpu-prof --cpu-prof-dir /tmp/e10/prof scripts/perf.ts 40` e `node scripts/profsum.mjs /tmp/e10/prof/<arquivo>.cpuprofile`
     (o `tsx` grava **dois** perfis — o do lançador, pequeno, e o do script: use o maior, `ls -S /tmp/e10/prof | head -1`;
     esvazie a pasta antes de cada rodada);
  2. otimize **só** a função do topo, sem mudar o resultado (cache por tick, menos alocação, sair cedo de laço);
  3. prova: `npm run smoke 20 42` com o mesmo hash de antes da otimização e `missions.ts` igual à base;
  4. se não houver otimização sem mudar o resultado, registre como pendência (não reduza `PATH_BUDGET_PER_TICK` nem a
     frequência da IA nesta etapa: mudam o jogo e a campanha).
- [ ] **N2. Rede.** A linha "rede" da E10-6. Instantâneo ≥ 4 MB: registre como pendência (o limite é do relay; mudar
  pede o dono, porque o relay de produção também muda).
- [ ] **N3. Renderizador** (só com a E8 pronta). `npm run build`, `npm run preview` em segundo plano e as duas linhas de
  render da E10-6; compare com a base da E8 (`docs/perf/` da E8). FORA: registre com os números e a vista; correções de
  render são da E8 (não mexa em `scripts/bake/page/*`).

### Bloco O — Campanha e Horda

- [ ] **O1.** `npx tsx scripts/missions.ts 2>&1 | sed -E 's/ \([0-9.]+s\)$//' > /tmp/e10/missions-depois.txt` e
  `diff /tmp/e10/missions-base.txt /tmp/e10/missions-depois.txt` → **vazio**. Qualquer diferença é vazamento do ajuste
  para dentro de cenário: procure uma leitura de `AI_PACE` sem `aiPace(state)`, uma mudança em dado das Eras 0–3 ou em
  unidade clássica (o `tests/ai-pace.test.ts` acusa as duas últimas), ou uma correção do L2 sem o
  `!isScenarioConfig`. **Nunca** mexa em `testing.ts` nem nas janelas `expect` para "consertar".
- [ ] **O2.** `npx tsx scripts/horde.ts` (como antes) e `npx vitest run tests/missions.test.ts tests/m4_caucaso.test.ts tests/m5_itaca.test.ts tests/m8_oceano.test.ts tests/m12_titanomaquia.test.ts`.

### Bloco P — Capturas finais, loja e documentos

- [ ] **P1. `art:diff`** (só com a E8 pronta). Com o preview de pé: `npm run art:shot -- http://localhost:4173/ e10` e
  `npm run art:diff -- e10`. Para cada tomada acima de 2 %: olhe com a ferramenta Read `docs/art/e10-<nome>.png`,
  `docs/art/ref/<nome>.png` e `scratch/artdiff/<nome>*.png`. Se a diferença for só o que as etapas E1–E9 mudaram de
  propósito (nós de pedra, mar navegável, arte da E8), `node scripts/artdiff.mjs e10 --update` e diga no commit quais
  tomadas e por quê; se houver diferença sem explicação, **não** atualize: registre e investigue. A tomada `cidade` é a
  cidade da IA depois de 10 min simulados: o `AI_PACE` (bloco K) muda o que a IA constrói, então ela **vai** mudar — é
  diferença esperada, mas olhe se a cidade continua cheia e sem nada procedural.
- [ ] **P2. Cenas novas em `scripts/storeshots.mjs`.** `ORDER = ['cidade', 'moderna', 'batalha', 'mar', 'poder', 'tita', 'cerco', 'campanha', 'editor']`.
  - `moderna`: página nova (`newPage()`), `startGame` igual ao bloco de hoje mas com `startingAge: 6`; avance
    `Math.min(MINUTES, 14)` min como hoje (o jogador local como IA); escolha a cidade de IA com mais edifícios (o mesmo
    código de `info.cities`); ponha ao lado, vindo do centro do mapa (o mesmo cálculo de `dx, dy` da cena `cerco`),
    12 `fusilier`, 6 `machine_gunner`, 3 `tank` e 2 `howitzer` do jogador local (vida × 3) com `attackMove` para o
    Centro Cívico; rode 10 s (`run`, `waitTicks(page, 200)`, `pause`), `look` no meio do caminho a zoom 1,1, `ready`
    com esses tipos e `shot(page, 'moderna')`.
  - `mar`: página nova, `startGame` com `mapType: 'mediterranean'`, `startingAge: 4`, 2 jogadores (local + 1 IA
    Muito difícil), avance 3 min; ache o tile de água profunda mais perto do centro do mapa
    (`state.map.terrain[y * w + x] === 5`, varrendo anéis a partir do centro); ponha 6 `galleon` do jogador local a
    6 tiles de um lado e 6 da IA do outro (pelo `debugSpawn`, que desde a E4 procura tile pela camada da unidade —
    `layerOf` — e põe o navio na água; confira com `grep -n "debugSpawn" src/main.ts`; um `null` = não achou água a
    ≤ 12 tiles: escolha outro ponto do anel), `attackMove` de uns contra os
    outros, rode 8 s, `look` no ponto a zoom 1,2 e `shot(page, 'mar')`.
  - Os ids `fusilier`, `machine_gunner`, `tank`, `howitzer`, `galleon` são os da E3/E4: confira com `grep`.
  Rode `rm docs/steam/screens/*.jpg docs/steam/screens-en/*.jpg` e depois
  `npm run store:shots -- http://localhost:4173/ --out docs/steam/screens` e
  `npm run store:shots -- http://localhost:4173/ --lang en --out docs/steam/screens-en`. Olhe as 18 imagens com a
  ferramenta Read: HUD em PT/EN conforme a pasta, nenhuma cena vazia, nada procedural visível.
- [ ] **P3. `docs/steam/LOJA.md` e `docs/steam/PRESSKIT.md`:** aplique a tabela E10-8 (confira os números antes) e conte
  os caracteres da descrição curta: `node -e "console.log('<texto>'.length)"` ≤ 300; troque também as contagens no
  título de cada versão (`**PT-BR** (249):` → `(276)`, `**EN** (257):` → `(275)`, ou o que o `node` der). No mesmo
  arquivo, em "Requisitos", refaça o tamanho com `npm run build && du -sh dist public/art` (a arte da E8 cresce) e
  ajuste a frase "o `dist/` do jogo tem ~… MB" e o armazenamento (500 MB) se não couber mais com folga. No
  `PRESSKIT.md`, as linhas de fatos ("5 Idades…", "12 poderes", "35 unidades…", "21 edifícios", "5 tipos de terreno",
  "Escolhas divinas por Idade… 24 combinações", e as "Idades" do resumo PT/EN) saem dos números do comando da E10-8.
- [ ] **P4.** Seção "Verificação" (itens da E10) e "Ao terminar".

---

## Testes a escrever ou atualizar

| Arquivo | O que verifica |
|---|---|
| `tests/encyclopedia.test.ts` (novo) | (1) para cada aba de `ENC_TABS`, `encyclopediaHtml(tab, { era: 'all' })` tem 8 `data-tab="`, a aba ativa, nenhum emoji (regex do `hud-icons.test.ts`), nenhum `>hack<`/`>pierce<`/`>crush<`/`>divine<`, nenhum `undefined`/`NaN`/`[object`. **Do item (2) em diante, conte no `encyclopediaBody(tab, ctx)`, não no `encyclopediaHtml`**: as abas do cabeçalho têm ícones (`unit/hoplite`, `bld/wonder_zeus`, `res/food`) que sujariam as contagens; (2) aba `units`: todo `UNITS` com `building`, `line` ou tag `titan` aparece (procure `data-ic="unit/<id>"`, com as aspas: `unit/hydra` não pode casar com outro id); com `era: 4`, nenhuma unidade de outra Era (procure os ids e confira `unitEra`); (3) aba `lines`: `LINE_ORDER.length` linhas `<tr>` + 1 do cabeçalho, cada uma com 8 células de Era; (4) aba `wonders`: 20 maravilhas (`bld/wonder_` aparece 20 vezes no corpo) e, com `state` de `quickGame()`, a coluna Dono diz `t('enc.free')`; com `s.config.wonderVictory = 'hold'`, o corpo contém `t('wv.hold')`; (5) aba `resources`: um `res/<r>` para cada `RESOURCES` e um `t('rare.<id>')` para cada `RARES`; (6) aba `ages`: 8 linhas; sem `state`, sem `#enc-tree`; com `state` e `local: 0`, `#enc-tree` e uma `enc-cur`; (7) `unitGroup`: `hoplite` → `lines`, `heracles` → `heroes`, `minotaur` → `myth`, `cronus` → `titans`; (8) com `setLocale('en')` (volte a `'pt'` no `finally`): os rótulos `Lines`, `Wonders`, `Resources` e nenhum `[ãõç]` fora de nomes de jogador |
| `tests/i18n-eras.test.ts` (novo) | código abaixo |
| `tests/gamepad.test.ts` | `treeJump`: nós `[{era:0,row:0},{era:1,row:0},{era:1,row:2},{era:3,row:2}]` → de 0 com +1 dá 1; de 2 com +1 dá 3; de 1 com −1 dá 0; de 0 com −1 dá 0; de 3 com +1 dá 3; de −1 com +1 dá 1; `[{era:0,row:5},{era:1,row:1},{era:1,row:4}]` de 0 com +1 dá 2; lista vazia dá −1; o texto `pad.hint.eras` existe em PT e EN |
| `tests/studytree.test.ts` (da E1) | todo `<button class="tree-node` tem `data-era="` e `data-row="` (contagens iguais às de `data-study`); a `.tree-body` tem `data-scroll`; sem `opts`, nenhum `data-autofocus`; com `{ autofocus: true }` e uma Biblioteca pronta, exatamente um `data-autofocus`, num nó `st-available` |
| `tests/relay-anticheat.test.ts` | `it` novo: o anfitrião manda `settings` `{ startAge: '2', endAge: '5', wonderVictory: 'hold' }` → o `lobby` dos outros traz os três; depois `{ startAge: 'banana', endAge: '9', wonderVictory: 'x' }` → o `lobby` continua com `'2'`, `'5'`, `'hold'`; `listRooms()` traz a sala com `startAge: '2', endAge: '5', wonderVictory: 'hold'`. O `toEqual` de hoje (linha ~252) não muda |
| `tests/hud-icons.test.ts` | `'src/ui/encyclopedia.ts'` nas listas de "sem emoji" e de glifos usados |
| `tests/ai-pace.test.ts` (novo) | (1) `AI_PACE` e `AI_PACE_CLASSIC`: as 4 tabelas com `AGES.length` posições; `AI_PACE_CLASSIC.villagerTarget` igual a `VILLAGER_TARGET` (idem as outras 3); `AI_PACE.villagerTarget !== VILLAGER_TARGET` (cópia, não o mesmo array; idem as outras 3); (1b) `AI_PACE_CLASSIC` inteiro igual (`toEqual`) a um literal com os valores anotados no H2 (`/tmp/e10/pace-classico.txt`) — sem isso, "ajustar" `VILLAGER_TARGET` em vez de `AI_PACE` mudaria a campanha e o (1) continuaria verde; (2) cada campo numérico de `AI_PACE` dentro de `AI_PACE_LIMITS`; cada posição de `AI_PACE.villagerTarget` a no máximo 12 do clássico, `farmLimit` e `minArmy` a 6, `armyAttack` a 8; (3) `aiPace(quickGame())` é `AI_PACE`; com `s.config = { ...s.config, scenario: 'm1_despertar' }`, é `AI_PACE_CLASSIC`; (4) `LINE_LEVEL_COST_MULT.slice(0, 4)` é `[1, 1, 1, 1]`, todo valor em [0,7; 1,3]; (5) congelados: `const FROZEN = <conteúdo de /tmp/e10/frozen.json>` e o mesmo `JSON.stringify(...)` do H2 dá igual; (6) `AGES[k].requires.techCount` não decresce e é ≤ 4·k |
| `tests/eras.test.ts` (da E1) | sem mudança de lógica; se a E10 mudou `techCount` das Eras 4–7, o teste da E1 (não decresce, ≤ 4·k) continua valendo |

Código de `tests/i18n-eras.test.ts`:

```ts
// Revisão dos textos PT/EN da expansão das Eras (E9, docs/eras/E9-E10-interface-balanceamento.md, E9-5): acento do
// português no inglês, números iguais, glossário, cópia do PT, plural, termos proibidos e requisitos das Eras.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ABILITIES, ACADEMY_LINES, AGES, BUILDINGS, LINES, MAJOR_GODS, MINOR_GODS, POWERS, RARES, TECHS, UNITS } from '../src/core/data';
import { GAME_MODES, MAP_TYPES, NODE_NAMES, RESOURCES, WONDER_VICTORIES } from '../src/core/constants';
import * as EN from '../src/i18n/en-data';
import { STRINGS } from '../src/i18n/strings';
import { LOADING_TIPS } from '../src/ui/loading';

const ROOT = path.join(__dirname, '..');
const PT = STRINGS.pt as Record<string, string>, ENS = STRINGS.en as Record<string, string>;
const PT_DIACRITIC = /[ãõçÃÕÇ]/;
/** Números do texto em ordem (sem HTML, {variáveis}, ordinais e separador de milhar; vírgula decimal = ponto). */
function numbersOf(s: string): string {
  return (s.replace(/<[^>]+>/g, ' ').replace(/\{[a-zA-Z]+\}/g, ' ').replace(/\b\d+(?:ª|º|(?:st|nd|rd|th)\b)/g, ' ').replace(/(\d)[   ,](?=\d{3}\b)/g, '$1').match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => x.replace(',', '.')).sort().join(' ');
}
const GLOSSARY: [RegExp, RegExp][] = [
  [/\bEras?\b/, /\bEras?\b/], [/Biblioteca/, /Librar(y|ies)/], [/\bPedra\b/, /Stone/i], [/Petróleo/, /\bOil\b/i],
  [/Maravilha/i, /Wonder/i], [/Estaleiro/, /Shipyard/], [/Caravana/i, /Caravan/i], [/Mercador/, /Merchant/],
  [/\bestudos?\b/i, /stud(y|ies)/i], [/Bênçãos?/, /Blessing/], [/Centros? Cívicos?/, /Town Centers?/], [/Templo/, /Temple/],
  [/Fortaleza/, /Fortress/], [/Conhecimento/, /Knowledge/], [/\bFavor\b/, /Favor/], [/Titã/, /Titan/],   // sem \b depois do "ã": no JS sem a flag u o \b não vê o ã como letra e o singular escaparia
  [/deus(es)? menor(es)?/i, /minor gods?/i],
];
/** Nomes próprios iguais nos dois idiomas (acrescente só nome próprio, com comentário). */
const SAME_NAME_OK = new Set(['unit.medusa', 'tech.ambrosia', 'minor.hermes', 'minor.ares', 'minor.hera', 'major.zeus', 'major.poseidon', 'major.hades', 'unit.evzone', 'unit.empusa', 'unit.talos', 'unit.ceto', 'unit.dromon', 'building.wonder_hagia_sophia']);
type Txt = { name?: string; plural?: string; desc?: string; title?: string; perks?: string[] };
const TABLES: [string, Record<string, Txt>, Record<string, Txt>][] = [
  ['unit', UNITS, EN.EN_UNITS], ['building', BUILDINGS, EN.EN_BUILDINGS], ['tech', TECHS, EN.EN_TECHS], ['power', POWERS, EN.EN_POWERS],
  ['minor', MINOR_GODS, EN.EN_MINOR_GODS], ['major', MAJOR_GODS, EN.EN_MAJOR_GODS], ['ability', ABILITIES, EN.EN_ABILITIES],
];
/** Todos os pares [rótulo, PT, EN] de textos: interface, dados, Eras, linhas e missões. */
function pairs(): [string, string, string][] {
  const out: [string, string, string][] = [];
  for (const [k, v] of Object.entries(PT)) out.push([`str ${k}`, v, ENS[k] ?? '']);
  for (const [tb, pt, en] of TABLES) for (const [id, o] of Object.entries(pt)) {
    const e = en[id] ?? {};
    for (const f of ['name', 'plural', 'desc', 'title'] as const) if (o[f] && e[f]) out.push([`${tb}.${id}.${f}`, o[f]!, e[f]!]);
    (o.perks ?? []).forEach((p, i) => { if (e.perks?.[i]) out.push([`${tb}.${id}.perks.${i}`, p, e.perks[i]]); });
  }
  AGES.forEach((a, i) => { const e = (EN.EN_AGES as Record<string, Txt & { short?: string }>)[String(i)] ?? {}; for (const f of ['name', 'short', 'desc'] as const) if ((a as Txt & { short: string })[f] && e[f]) out.push([`age.${i}.${f}`, (a as unknown as Record<string, string>)[f], e[f]!]); });
  for (const l of Object.values(LINES)) { const e = (EN as unknown as { EN_LINES?: Record<string, Txt> }).EN_LINES?.[l.id]; if (e?.name) out.push([`line.${l.id}`, l.name, e.name]); }
  const dir = path.join(ROOT, 'src/core/scenario/missions');
  const walk = (o: unknown, f: string, p: string) => { if (!o || typeof o !== 'object') return; const r = o as Record<string, unknown>; if (typeof r.pt === 'string' && typeof r.en === 'string') out.push([`${f}${p}`, r.pt, r.en]); for (const [k, v] of Object.entries(r)) if (k !== 'map') walk(v, f, `${p}.${k}`); };
  for (const f of fs.readdirSync(dir)) walk(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), f, '');
  return out;
}

describe('textos PT/EN das Eras (E9)', () => {
  const all = pairs();
  it('nenhum texto em inglês tem acento do português', () => {
    expect(all.filter(([, , en]) => PT_DIACRITIC.test(en)).map(([l, , en]) => `${l}: ${en.slice(0, 60)}`)).toEqual([]);
  });
  it('os números são os mesmos em PT e EN', () => {
    expect(all.filter(([, pt, en]) => numbersOf(pt) !== numbersOf(en)).map(([l, pt, en]) => `${l}: [${numbersOf(pt)}] × [${numbersOf(en)}]`)).toEqual([]);
  });
  it('glossário: o termo PT tem o seu par no EN', () => {
    const bad: string[] = [];
    for (const [l, pt, en] of all) for (const [a, b] of GLOSSARY) if (a.test(pt) && !b.test(en)) bad.push(`${l}: ${a.source} → ${en.slice(0, 60)}`);
    expect(bad).toEqual([]);
  });
  it('descrição EN nunca é cópia do PT; nome igual só para nome próprio', () => {
    const bad: string[] = [];
    for (const [tb, pt, en] of TABLES) for (const [id, o] of Object.entries(pt)) {
      const e = en[id]; if (!e) continue;
      if (o.desc && e.desc === o.desc) bad.push(`${tb}.${id}.desc`);
      if (o.name && e.name === o.name && !SAME_NAME_OK.has(`${tb}.${id}`)) bad.push(`${tb}.${id}.name = ${o.name}`);
    }
    expect(bad).toEqual([]);
  });
  it('plural EN para toda unidade com plural; Eras e linhas completas em EN', () => {
    expect(Object.values(UNITS).filter((u) => u.plural && !(EN.EN_UNITS as Record<string, Txt>)[u.id]?.plural).map((u) => u.id)).toEqual([]);
    AGES.forEach((_, i) => { const e = (EN.EN_AGES as Record<string, Txt & { short?: string }>)[String(i)]; expect(e?.name && e?.short && e?.desc, `EN_AGES ${i}`).toBeTruthy(); });
    const enLines = (EN as unknown as { EN_LINES?: Record<string, Txt> }).EN_LINES ?? {};
    expect(Object.keys(LINES).filter((id) => !enLines[id]?.name)).toEqual([]);
  });
  it('toda tabela tem as suas chaves de texto', () => {
    const need = [
      ...Object.keys(NODE_NAMES).map((n) => `node.${n}`), ...Object.keys(RARES).map((r) => `rare.${r}`), ...MAP_TYPES.map((m) => `maptype.${m}`),
      ...GAME_MODES.map((m) => `mode.${m}`), ...WONDER_VICTORIES.map((v) => `wv.${v}`), ...RESOURCES.flatMap((r) => [`res.${r}`, `enc.res.${r}.src`, `enc.res.${r}.use`]),
      ...ACADEMY_LINES.map((l) => `line.${l}`), ...Array.from({ length: LOADING_TIPS }, (_, i) => `load.tip${i + 1}`),
    ];
    expect(need.filter((k) => !PT[k] || !ENS[k])).toEqual([]);
  });
  it('termos proibidos: Idade/Academia no PT, Age/Academy no EN', () => {
    const bad: string[] = [];
    for (const [l, pt, en] of all) {
      if (/\bIdades?\b/.test(pt.replace(/Idade de (Ouro|Cronos)/g, '')) || /Academia/.test(pt)) bad.push(`PT ${l}: ${pt.slice(0, 60)}`);
      if (/\bAges?\b/.test(en.replace(/Age of (Mythology|Earth|Cronus)|Golden Age/g, '')) || /Academy/.test(en)) bad.push(`EN ${l}: ${en.slice(0, 60)}`);
    }
    expect(bad).toEqual([]);
  });
  it('o número de estudos da descrição de cada Era é o do requisito', () => {
    AGES.forEach((a, i) => {
      const n = a.requires.techCount; if (!n) return;
      expect(a.desc, `AGES[${i}].desc`).toContain(String(n));
      expect((EN.EN_AGES as Record<string, Txt>)[String(i)]?.desc ?? '', `EN_AGES[${i}].desc`).toContain(String(n));
    });
  });
});
```

O `module` `src/ui/loading.ts` usa `import.meta.env` dentro de uma função (não no topo): importar `LOADING_TIPS` no Node
funciona. Se o import quebrar o teste, troque por `const LOADING_TIPS = 18;` no teste com um comentário.

---

## Verificação

Rode na ordem. Cada linha diz o que esperar. Comandos longos vão em segundo plano com log; não rode dois pesados juntos.

### E9

1. `npm run -s typecheck` → sem saída.
2. `npx vitest run tests/encyclopedia.test.ts tests/i18n-eras.test.ts tests/i18n.test.ts tests/hud-icons.test.ts tests/gamepad.test.ts tests/studytree.test.ts tests/relay-anticheat.test.ts tests/hud-text.test.ts tests/steam.test.ts` → verde.
3. `npm test` → verde. Se o resumo mostrar tudo passando e o processo sair com 1 por `Timeout calling "onTaskUpdate"`,
   rode de novo; repetindo, rode os arquivos lentos sozinhos (`tests/missions.test.ts`, `tests/unit-lines.test.ts`) e
   considere verde se cada um passar. Um `expect` vermelho é falha de verdade.
4. `npm run smoke 20 42` → o **mesmo** "hash final" do 0.2 (a E9 não muda a simulação).
5. `npx tsx scripts/i18n-review.ts` → grava a planilha; ela foi lida inteira (C3).
6. `npm run build` e `npm run preview` (porta 4173, em segundo plano). Depois, cada um com `errors: none`, código 0
   **e nenhuma linha com `FALHOU`/`DIVERGENTES`** (o `playtest-gamepad`, o `playtest-mp`, o `playtest-rooms` e o
   `playtest-spectate` só imprimem o veredito e saem com 0 mesmo falhando: rode cada um com `> /tmp/e9/<nome>.txt 2>&1`
   e confira `grep -c "FALHOU\|DIVERGENTES" /tmp/e9/<nome>.txt` = 0):
   `node scripts/playtest.mjs http://localhost:4173/ /tmp/e9/pt`, `node scripts/playtest-eras.mjs http://localhost:4173/`,
   `node scripts/playtest-eras.mjs http://localhost:4173/ --lang en`, `node scripts/playtest-i18n.mjs http://localhost:4173/`,
   `node scripts/playtest-noemoji.mjs http://localhost:4173/`, `node scripts/playtest-gamepad.mjs http://localhost:4173/`,
   `node scripts/playtest-library.mjs http://localhost:4173/` (da E1).
7. Com `npm run relay` de pé: `node scripts/playtest-mp.mjs http://localhost:4173/` ("SINCRONIZADOS" e as Eras nos dois),
   `node scripts/playtest-rooms.mjs http://localhost:4173/` (lista com `Eras III–V`), `node scripts/playtest-spectate.mjs http://localhost:4173/`.
8. Olhe com a ferramenta Read: `docs/art/eras-e9-era1.png` … `era8.png` (PT e `-en`), `docs/art/eras-e9-arvore-controle.png`
   e uma captura da enciclopédia (abra pelo `playtest.mjs`: `/tmp/e9/pt-4-enc.png`) contra `/tmp/e9/antes-4-enc.png`.
   Confira: textos cabem nas células, nenhuma aba vazia, ícones no lugar, a Era atual marcada.

### E10

9. `npm run -s typecheck`; `npx vitest run tests/ai-pace.test.ts tests/i18n-eras.test.ts tests/eras.test.ts tests/movement-ai.test.ts tests/position-fairness.test.ts tests/determinism.test.ts tests/relay-version.test.ts` → verde; `npm test` → verde (mesma regra do item 3).
10. `npm run balance 60 1-18 -- --jobs 3 --targets` → `ritmo: DENTRO` (ou só II–IV fora, registradas como pendência).
11. Os 4 comandos do L1 e os 3 do L3 com `--stalls-only` → código 0, nenhuma PARADA nem TRAVADA.
12. `npm run smoke 60 42` duas vezes → mesmo "hash final".
13. Tabela E10-7 inteira → `DENTRO` nos oficiais; ÍNDICE ≤ 65 % nos gerados com mar; `tests/position-fairness.test.ts` verde.
14. Tabela E10-6, simulação e rede → `DENTRO` e "Resultado: OK"; render (com a E8) dentro dos critérios.
15. `diff` do O1 vazio; `npx tsx scripts/horde.ts` como antes; `npm run map:check` ok.
16. `npx tsx scripts/steam-achievements.ts --check` e `npx tsx scripts/licenses.ts --check` → ok (nada mudou neles, mas
    o checklist de lançamento pede).
17. Com a E8: `npm run art:diff -- e10` dentro de 2 % (ou referências atualizadas com justificativa, P1); as 18
    screenshots da loja olhadas.

---

## Critérios de pronto

### E9

- [ ] Enciclopédia com as 8 abas, filtro de Era, aviso de cenário, dono das maravilhas e botão da árvore; sem emoji e sem
      id cru, em PT e EN (`tests/encyclopedia.test.ts`, `playtest-noemoji`, `playtest-i18n`).
- [ ] Ajuda com as 4 seções novas e as 18 dicas; nenhuma "Idade"/"Academia" nos textos (exceto os mitos permitidos).
- [ ] `tests/i18n-eras.test.ts` verde e a planilha `docs/eras/textos-pt-en.md` lida inteira e commitada.
- [ ] Lista de salas e menu da partida mostram as Eras (e a regra de maravilha fora do padrão); o relay recusa valores
      inválidos (`relay-anticheat`).
- [ ] Árvore pelo controle: foco inicial num estudo, D-pad, LB/RB por Era, detalhe acompanhando, rolagem, A estuda, B
      fecha (`playtest-gamepad`).
- [ ] `playtest-eras.mjs` em PT e EN com código 0 e as 16 capturas olhadas; os demais playtests do item 6–7 sem erros.
- [ ] Hash do `smoke 20 42` igual ao de antes da E9.

### E10

- [ ] `balance 60 1-18 --targets` DENTRO (ou pendência de II–IV registrada com os números).
- [ ] Nenhuma PARADA/TRAVADA em 60 min (Fácil, Normal, Difícil, Muito difícil; continental e os 3 tipos com mar) nem
      em 75 min.
- [ ] Justiça: oficiais DENTRO (posição e índice; Egeu também com `--mirror-ai`); índice ≤ 65 % nos mapas com mar.
- [ ] `perf.ts` dentro do orçamento nos 3 cenários; `loadtest` 60 min OK e instantâneo < 4 MB; render dentro de
      `docs/ART.md` §6 (com a E8).
- [ ] `missions.ts` idêntico à base; Horda como antes; `SIM_VERSION` subiu uma vez.
- [ ] Referências do `art:diff`, 18 screenshots da loja (PT/EN) e `LOJA.md` atualizados e olhados (com a E8).
- [ ] `docs/eras/PROGRESSO.md`, `docs/QA.md`, `docs/ROADMAP.md`, `CLAUDE.md` (e `docs/ART.md` §6, `docs/EDITOR.md`)
      com os números novos.

---

## Armadilhas

- **Campanha mudando sem querer (E10):** qualquer leitura de `AI_PACE` direta (sem `aiPace(state)`), mudança nos dados
  das Eras 0–3, nos níveis 1–4 das linhas ou nas 35 unidades clássicas muda as 12 missões. O `tests/ai-pace.test.ts`
  congela os dados; o `diff` do O1 pega o resto. **Não** "conserte" mexendo em `testing.ts` ou nas janelas.
- **Refatoração que muda o jogo:** o bloco J tem de dar o mesmo hash no `smoke 20 42`. Se mudou, algum valor clássico
  foi copiado errado (confira com o H2) ou uma comparação virou `>`/`>=` trocado.
- **`thinkEvery`/`DIFFICULTIES` para acelerar Eras:** muda a dificuldade e o rodízio das IAs, não o ritmo econômico. Fora
  da escada.
- **Medições ruidosas:** rodar `balance`, `fairness` e `perf.ts` ao mesmo tempo distorce o `perf.ts` (o QA registrou pior
  tick de 263 ms com a máquina ocupada) e atrasa tudo. Uma medição pesada por vez, em segundo plano, com log.
- **Mediana com poucas IAs:** com 6 sementes (rodada rápida) uma Era pode oscilar ±1 min entre rodadas; a decisão final é
  a da aceitação (18 sementes). Não aceite uma rodada só porque uma Era tardia melhorou 0,5 min.
- **`techCount` × descrição:** mudar o requisito sem mudar o número na `desc` PT e EN deixa o jogador lendo uma regra
  falsa; o `tests/i18n-eras.test.ts` acusa. O `techCount` da Era k nunca passa de 4·k (o jogador só pode ter estudado
  até o nível k) e nunca é menor que o da Era anterior.
- **Determinismo:** nada de `Math.random`, `Math.sin`/`cos`/`atan2`/`pow`/`exp`/`log`/`hypot`, `Date.now` ou
  `performance.now` em `src/core` (`tests/determinism.test.ts`). O `scaleCost` usa só multiplicação e `Math.round`.
  Scripts (`scripts/*`) podem usar `performance.now` (o `perf.ts` já usa).
- **Justiça de posição:** correção de IA nova com "o primeiro do `Map`" ou laço de jogadores por índice para recurso
  disputado cria viés de índice; use `centerDist2`/`frameCompare` e `aiThinkOrder` (CLAUDE.md). Mapa gerado não é
  simétrico: lá só o critério de índice vale.
- **`SIM_VERSION`:** a E10 sobe uma vez (K4). A E9 não sobe (não mexe na simulação). O relay de produção precisa do
  `server/relay.mjs` novo (validação das Eras): registre como pendência do dono.
- **Relay e lobby:** chave nova de configuração sem entrar em `cleanSettings` é descartada em silêncio; com a validação
  fechada, um valor fora da lista mantém o anterior (não zera). O teste confere os dois.
- **Textos PT e EN:** toda chave nova nas duas tabelas com as mesmas `{variáveis}` (o typecheck e `tests/i18n.test.ts`
  acusam); valor EN com apóstrofo entre aspas duplas; **nenhum emoji** em texto novo (emoji novo em `strings.ts` exige
  `EMOJI_GLYPHS`). Não troque "Age" em "Age of Mythology"/"Age of Earth".
- **Glossário × nome próprio:** "Pedra de Poseidon" → "Poseidon's Stone" passa sozinho; "pedra-papel-tesoura" está em
  minúscula de propósito (o glossário é sensível a maiúsculas). Não "conserte" o teste afrouxando a regex: corrija o texto
  ou, para nome próprio, `SAME_NAME_OK`.
- **Enciclopédia no menu principal:** ali não há partida (`session` é `null`); o código novo nunca usa `this.session!`
  dentro de `encyclopedia.ts` — tudo vem por `ctx.state` opcional.
- **Controle:** botão `disabled` não recebe foco (`focusables` filtra); os nós da árvore usam `aria-disabled` (E1). O
  `data-autofocus` só no primeiro desenho — no redesenho ao vivo ele puxaria o foco de volta ao primeiro estudo. O
  `padfocus` é um evento próprio: **não** chame `element.focus()` no controle (o `navBack` e os campos de texto dependem
  do foco real do navegador).
- **Ícone do HUD obrigatório:** a E9 não cria conteúdo; se a revisão renomear um id (não renomeie!), o
  `tests/hud-icons.test.ts` e o atlas quebram. Só textos mudam.
- **`storeSet`:** a E9 não grava nada novo do jogador (o filtro da enciclopédia fica na memória). Se gravar algo, use
  `storeSet`/`storeRemove`, nunca `localStorage.setItem` (`tests/steam.test.ts`).
- **VRAM e cenas de render:** `--types` com tipo naval não nasce (as cenas são em terra e o `debugSpawn` da E4 só põe
  navio na água) e a medição sai com menos unidades; `renderperf` com Eras altas carrega mais páginas — compare com a base
  da E8, não com a de antes da expansão.
- **Bake:** a E10 não roda `npm run art:bake` (sem `--out` ele reempacota `public/art` só com o cache e apaga unidades).
- **vitest:** `it` com mais de ~20 s numa máquina carregada dá `Timeout calling "onTaskUpdate"` e código 1 com tudo
  passando (`docs/QA.md`). Os testes novos não simulam minutos de jogo; mantenha assim.
- **JSON das missões (C1):** corrija texto com a ferramenta Edit, trecho a trecho. **Nunca** reformate o arquivo
  (`JSON.stringify(…, null, 2)`, formatador do editor): os `scripts/maps/m*.ts --write` só acham o mapa se a linha
  `  "map": { "data": … },` continuar sendo uma linha só, e os testes `m4_caucaso`/`m5_itaca`/… comparam o mapa.
- **Horda sem teto de Era:** a Horda é cenário (IA no `AI_PACE_CLASSIC`, conteúdo clássico), mas não tem `maxAge` (E1 D11):
  o jogador da Horda alcança as Eras V–VIII, então os degraus da escada nos dados de `AGES[4..7]` chegam até ela. O
  `scripts/horde.ts` (sem jogador) não percebe; registre no `PROGRESSO.md` quais custos/tempos de V–VIII mudaram.
- **Testes com números da IA:** `tests/economy-regressions.test.ts`, `tests/movement-ai.test.ts`, `tests/sim.test.ts`,
  `tests/eras.test.ts` e as sondagens de `tests/position-fairness.test.ts` rodam partidas **fora** de cenário, então veem o
  `AI_PACE`. Se um degrau derrubar um deles, o degrau não serve: desfaça (não afrouxe o teste) e tente o próximo da escada.
- **Efeitos (`tests/fx-registry.test.ts`):** a E9 e a E10 não criam `VisualEffect`/`TimedEffect`; se uma correção do L2
  emitir um evento novo do núcleo, o registro exige handler (`src/render/fx/`), como nas etapas anteriores.
- **Árvore aberta pelo menu:** o menu pausa a partida e o comando só entra no próximo tick. O E2 tira a pausa ao abrir a
  árvore pelo `#m-tree`; se um playtest abrir a árvore com o jogo pausado de outro jeito, o A/clique só muda a fila depois
  que a partida voltar a rodar.

---

## Ao terminar

### E9 (um commit)

1. **`docs/eras/PROGRESSO.md`** (crie com o modelo da E1 se faltar): linha "E9 — interface", estado "feito", data, commit
   curto, notas: enciclopédia em `src/ui/encyclopedia.ts` (8 abas); ajuda e 18 dicas; `tests/i18n-eras.test.ts` +
   planilha `docs/eras/textos-pt-en.md`; relay com validação das Eras; controle na árvore (`treeJump`, `padfocus`,
   `data-scroll`); `scripts/playtest-eras.mjs`. Em "Pendências para o dono": **Universidade e Fábrica** (§5) sem etapa;
   relay de produção a atualizar.
2. **`docs/ROADMAP.md`**: na tabela "Cronograma a partir de 06/10/2026", acrescente "E9 ✅ (data)" na linha da semana em
   que terminou; em "O que já existe hoje", uma frase sobre a enciclopédia completa e os textos PT/EN revisados.
3. **`CLAUDE.md`**: em "Comandos", acrescente `node scripts/playtest-eras.mjs [url] [--lang en]` à lista dos playtests e
   `npx tsx scripts/i18n-review.ts` (planilha PT/EN); em "Convenções": "textos PT/EN: `tests/i18n-eras.test.ts`
   (glossário, números iguais, sem acento PT no EN); nome igual só para nome próprio (`SAME_NAME_OK`)".
4. **Commit** em português com o rodapé de atribuição exigido pela **sua** sessão (não copie o de outra), por exemplo:
   ```
   E9: enciclopédia das 8 Eras, textos PT/EN revisados, Eras no multiplayer e controle na árvore

   - Enciclopédia em 8 abas (unidades, linhas, edifícios, maravilhas, tecnologias, deuses, Eras, recursos) com filtro de Era
   - Ajuda e dicas novas; teste de glossário/números/acentos e planilha docs/eras/textos-pt-en.md
   - Lista de salas e menu da partida com as Eras; relay só aceita Eras e vitória válidas
   - Controle na árvore de estudos (LB/RB por Era, detalhe e rolagem); playtest novo das 8 Eras

   <rodapé de atribuição da sessão>
   ```

### E10 (um commit)

1. **`docs/eras/PROGRESSO.md`**: linha "E10 — balanceamento", com: tabela "Rodadas de ajuste" (todas as rodadas); seção
   "Medições da E10 — antes × depois" (resumo do `--targets` de base e de aceitação, fim de partida, alertas); números do
   `perf.ts` (3 cenários), `loadtest`, `renderperf`/`rendercpu`; justiça (cada linha da E10-7); `missions.ts` idêntico.
   Em "Pendências para o dono": II–IV fora do alvo (se for o caso, com os números), posição de mapa oficial fora (se for
   o caso), instantâneo ≥ 4 MB (se for o caso), aprovar os textos da loja.
2. **`docs/QA.md`**: em "Verificações automáticas", troque a linha do `balance` por
   `npm run balance 60 1-18 -- --jobs 3 --targets` com o novo ritmo de referência, a do `perf.ts` pelo orçamento da
   E10-6 com os números medidos, e atualize as referências do `smoke` e do `fairness`; acrescente uma seção
   "Desempenho — E10 (8 Eras)" com a tabela da E10-6 medida. No checklist de lançamento, as mesmas trocas.
3. **`docs/ART.md` §6**: os números de render medidos (se a E8 criou a tabela por Era, preencha a coluna "medido").
4. **`docs/EDITOR.md`** ("Justiça de posição"): os números de referência novos (60 min).
5. **`docs/ROADMAP.md`**: linha das semanas 19–20 com "✅ E10 (data)"; no passo 1.5 (balanceamento), o ritmo novo; em "O
   que já existe hoje", "partida de 8 Eras no ritmo II ~4 … VIII ~40".
6. **`CLAUDE.md`**: em "Comandos", troque `npm run balance 35 1,2,3` por
   `npm run balance 60 1-18 -- --jobs 3 --targets` (ritmo das Eras; `--stalls-only`, `--diff`, `--map-type`) e
   acrescente `node scripts/profsum.mjs <perfil>`; em "Convenções", troque a linha "Ao mudar balanceamento, rode
   `npm run balance` e observe minutos das idades (Clássica ~5, Heroica ~15-20, Mítica ~20-28)" pelo ritmo novo medido
   (II ~4 … VIII ~40, com o comando de aceitação) e acrescente "ritmo da IA fora de cenário em `AI_PACE`
   (`src/core/sim/ai.ts`); dados das Eras II–IV, níveis 1–4 das linhas e as 35 unidades clássicas congelados
   (`tests/ai-pace.test.ts`, campanha)"; na "Memória do projeto", um item curto "E10 (data): ritmo medido …".
7. **Commit** em português com o rodapé da sua sessão, por exemplo:
   ```
   E10: ritmo das 8 Eras, IA em partidas longas, justiça de posição e desempenho

   - AI_PACE (fora de cenário) e Eras V–VIII ajustados: II … / III … / … / VIII … min (mediana de 54 IAs)
   - balance.ts com sementes em intervalo, --jobs, --targets, detectores de IA parada/travada e marcos
   - perf.ts/renderperf/rendercpu com Eras altas; profsum.mjs; loadtest de 60 min
   - fairness 60 min nos mapas oficiais e nos mapas com mar; campanha idêntica; SIM_VERSION +1
   - art:diff, screenshots da loja PT/EN (cenas moderna e mar) e LOJA.md em dia

   <rodapé de atribuição da sessão>
   ```
   Faça push só para a branch da sessão (rotina do `docs/eras/LEIA-ME.md`); nunca para `main` sem pedido do dono.
