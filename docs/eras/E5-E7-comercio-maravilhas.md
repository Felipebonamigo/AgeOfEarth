# E5 + E7 — Comércio por caravanas e as 20 maravilhas (com a vitória por pontos)

- Estado: pendente · Pré-requisitos: **E5** — E1, E2 e E3 concluídas (8 Eras, Biblioteca, `isScenarioConfig`, pedra e petróleo em `RESOURCES`, Mercador e `src/render/art/alias.ts` da E2, linhas da E3); a E4 só é exigida pelo passo do navio mercante (Fase F) — na ordem oficial (E1, E2, E3, E4, E5+E7, E6…) ela já está pronta, então a Fase F é feita normalmente. **E7** — E5 concluída (usa `tradeIncome`/`seaTradeIncome`) e E4 pronta (Fase M); a **E6 vem depois** da E7 na ordem oficial: o 0'.2 não acha `charges` e o H1/J7 criam o campo e o `powerReady`, que a E6 depois respeita · Estimativa: **E5 3 dias**, **E7 5 dias** de trabalho do agente

> **Antes de começar:** leia `docs/eras/LEIA-ME.md` (rotina de cada sessão, regras, quando parar) e marque cada
> passo em `docs/eras/PROGRESSO.md`. Ordem das etapas: E1, E2, E3, E4, E5+E7, E6, E8, E9+E10. Onde este guia falar de
> commit ou de push, vale a rotina do LEIA-ME: um commit por passo e push só para a branch da sessão.

Este guia é para ser seguido **na ordem**, sem o contexto da conversa que o gerou. Ele cobre duas etapas do
`docs/ERAS.md` §11, cada uma com o seu commit: **Parte 1 = E5** (Fases 0, A–G) e **Parte 2 = E7** (Fases 0', H–N).
Todo caminho e símbolo citado existe no código de 06/10/2026 ou está marcado "(novo)", "(da E1)", "(da E2)", "(da E3)"
ou "(da E4)". As etapas E1–E4 podem ter mexido em volta do trecho citado (trocado um literal por tabela, por exemplo):
se o trecho não estiver mais na forma descrita, procure o equivalente **pelo nome da função** e aplique a mesma mudança,
sem reescrever a lógica das outras etapas. Números de linha são aproximados.

Todos os números de jogo deste guia são **valores iniciais para o balanceamento da E10**. Não invente outros: se a
verificação falhar, siga o que a seção "Verificação" manda ajustar.

---

## Objetivo e resultado jogável

**E5 — rotas de ouro.** Numa partida rápida (fora de cenário):

- o Mercado (Era II) treina a **Caravana** (tecla `C`), além do Mercador da E2 (tecla `M`);
- com caravanas selecionadas, **clique direito** num Centro Cívico ou Mercado **seu ou de um aliado** a 16 tiles ou mais
  do seu ponto de comércio mais próximo cria uma **rota automática**: a caravana vai ao ponto de casa, carrega, vai ao
  destino, recebe ouro, volta, recebe de novo, e assim por diante, sem nova ordem;
- cada chegada rende `round(0,5 × distância entre os centros × bônus)` de ouro (+25 % se o destino for de um aliado). O
  cartão da unidade mostra a rota e o ouro por viagem;
- a rota para (com aviso) se um dos pontos cair ou o caminho fechar. A caravana não luta, não entra em edifícios e sofre
  atrito em território inimigo: é alvo fácil, então escolta e fronteiras importam;
- a IA treina caravanas até uma meta por Era e escolhe a rota mais longa alcançável, sem viés de posição;
- o Mercador da E2 continua ocupando os recursos raros (a E5 só confere e protege essa parte);
- **navio mercante** (Estaleiro, Era III): a mesma rota por mar entre Estaleiros. Só entra se a E4 já estiver pronta
  (Fase F; na ordem oficial ela está); senão fica registrado como pendente.

**E7 — 20 maravilhas.** Numa partida rápida:

- as **20 maravilhas** da `docs/ERAS.md` §9, das Eras I a VIII, todas com o atalho `M`, cada uma com o seu efeito;
- **cada maravilha é única no mapa**: quem termina primeiro fica com ela; as obras dos outros da mesma maravilha
  desabam e devolvem os recursos. Um jogador pode ter várias maravilhas diferentes;
- **vitória por pontos de maravilha** (padrão): cada maravilha vale o número da sua Era (I = 1 … VIII = 8); o time que
  somar a meta (20 numa partida de 8 Eras; menos com Era final mais baixa) e **mantiver por 2 minutos** vence. A regra de
  hoje (**manter uma maravilha por 6 minutos**) e "desligada" são opções da partida rápida e do lobby;
- a IA ergue maravilhas da sua Era quando sobra recurso, disputa as mesmas que os outros e ataca primeiro as maravilhas
  de quem está na contagem de vitória;
- barra do topo com "Maravilhas n/meta" e a contagem; cartão da maravilha com os pontos;
- arte e ícones provisórios: cada maravilha nova usa a arte assada e o ícone de uma das 3 maravilhas de hoje (alias da
  E2), até a E8;
- **a campanha não muda**: em cenário valem as regras clássicas (só as 3 maravilhas de hoje, na Era IV, uma por
  jogador, sem unicidade), e o harness das 12 missões continua igual.

---

## Decisões já tomadas (não reabrir; cite docs/ERAS.md)

Do plano aprovado pelo dono (`docs/ERAS.md`):

- **§7:** caravanas treinadas no Mercado **desde a II**; vão e voltam entre as suas cidades e os mercados aliados; cada
  viagem rende ouro **pela distância**; são alvo fácil (escolta e fronteiras importam). **Navios mercantes** (Estaleiro,
  **III**) fazem o mesmo por rotas marítimas entre portos. O Mercado continua comprando e vendendo; os raros rendem ouro
  com o Mercador (§3).
- **§3:** um Mercador ocupa o raro, que rende ouro e um bônus.
- **§9:** as 20 maravilhas da tabela (Era, nome e efeito); **única no mapa** (quem termina primeiro fica com ela); as 3 de
  hoje continuam; vitória por **pontos de maravilha** (Eras mais altas valem mais), com a regra de hoje ("manter por
  6 minutos") como opção.
- **§10:** `SIM_VERSION` sobe; a campanha continua nas Eras I–IV. **§11:** E5 = caravanas, navios mercantes, Mercador nos
  raros; E7 = as 17 maravilhas novas + pontos de maravilha (núcleo e arte provisória).

Das etapas anteriores (não reabrir): E2 D4/D5 — o **Mercador mínimo já foi antecipado pela E2** (unidade `merchant`,
raro = nó que não se esgota, `Player.rares`, bônus em `recomputeMods`); E2 D7 — **arte provisória por alias**
(`src/render/art/alias.ts`); E2 D10 / E3 D4 — **dentro de cenário a IA não usa conteúdo novo** (elenco clássico); E3 D10 —
o id `merchant_ship` está reservado para a E5.

Decisões deste guia (cada uma com o motivo em uma linha):

| # | Decisão | Motivo |
|---|---|---|
| D1 | Comando novo `{ type: 'route', player, ids, targetId, queue? }`, estado e ordem `'route'`. **Não** reaproveite `trade` (é a compra/venda do Mercado). | `trade` já existe com outra forma; o validador e o fuzz tratam um tipo por vez. |
| D2 | Ponto de comércio = `BuildingDef.tradeRoute?: 'land' \| 'sea'`: `town_center` e `market` = `'land'`; o Estaleiro da E4 = `'sea'`. **Não** use a flag `trade` (ela libera a compra/venda do Mercado). | Pôr `trade` no Centro Cívico liberaria o mercado sem Mercado. |
| D3 | A rota tem **casa** (o ponto de comércio **próprio** mais perto da unidade, sem contar o destino) e **destino** (ponto seu ou de aliado, vivo e pronto). Mínimo de **16 tiles** entre os centros. A 1ª perna vai à casa **sem pagar**; depois paga a cada chegada (B, A, B…). | Impede o "dar a ordem colado no destino e receber a viagem inteira"; rotas curtas não valem a pena. |
| D4 | Ouro por chegada = `round(TRADE_GOLD_PER_TILE[tipo] × d × tradeIncome × seaTradeIncome(se mar) × gather.gold × 1,25 se o destino for de outro jogador)`, com `d` = distância euclidiana entre os centros (`Math.sqrt`). Terra 0,5/tile; mar 0,7/tile. | "Pela distância" (§7); `gather.gold` faz a linha Comércio e a dificuldade da IA valerem também aqui. |
| D5 | Campos novos em `Unit`: `routeA`, `routeB` (ids, padrão −1) e `routeLeg` (0 = indo à casa sem carga, 1 = indo ao destino, 2 = voltando). **Não** reaproveite `nodeId`/`targetId`/`carry`. | `nodeGatherers`, fazendas e templos dependem de `nodeId`; `carry` dispara a entrega automática no estado ocioso. |
| D6 | A caravana: `cls: 'villager'`, tags `['civilian', 'caravan']` (sem `human`), `trader: 'land'`, ataque 0, sem `canGather`/`canBuild`; não guarnece. Arte e ícone provisórios = alias `kataskopos` (cavaleiro leve: silhueta distinta do cidadão). | `villager` dá a fila de formação dos civis e as falas de seleção; sem `human`, a Medusa e a Maldição não a pegam. |
| D7 | Rota interrompida (ponto destruído ou sem caminho) → a caravana fica ociosa e o dono humano recebe um aviso (no máximo 1 a cada 10 s). | Sem isso ela fica parada sem explicação. |
| D8 | IA: fora de cenário, treina caravanas até `CARAVAN_TARGET_AI[Era]` (0, 2, 3, 4, 5, 6, 6, 6) se houver uma rota válida, e manda cada caravana ociosa para a rota mais longa (`bestRoute`). Dentro de cenário, nada. | Mesmo critério da E2 para o Mercador; a campanha e o harness ficam iguais. |
| D9 | Mercador (E2): a E5 **não** cria "posto de raro" como edifício (ERAS §5): o próprio Mercador é o posto, como decidiu a E2. A E5 só confere a parte da E2 e impede a troca de papéis (caravana não ocupa raro; Mercador não faz rota). | A E2 já entregou a ocupação; um edifício novo repetiria a regra. |
| D10 | Navio mercante: id `merchant_ship` (reservado pela E3; números reservados pela E4), `trader: 'sea'`, Era III (`age: 2`), no `shipyard`, mesmo `updateRoute`; só com a E4 pronta (Fase F). | Navio sem água navegável nem Estaleiro não tem onde nascer. |
| D11 | Maravilhas: ids `wonder_<nome>`, todas `limit: 'wonder'`, `hotkey: 'M'`, pegada **4×4**, `BARMOR`. As 3 de hoje mudam de Era (Zeus 3→1, Ártemis 3→1, Colosso 3→2, como a §9) e **guardam custo, vida e obra de hoje** (os da E2). | A pegada igual permite o alias de arte; mexer no custo das 3 mudaria a m6. |
| D12 | Efeitos das maravilhas viram dado: `BuildingDef.wonderEffects?: Effect[]`, lido por `recomputeMods`. Os efeitos que um `Effect` não expressa ganham **PlayerStat novo** (efeito simples) ou **código em `src/core/sim/wonders.ts`** (Delfos, Mausoléu, Trono). | Tira os 3 `if` fixos de `modifiers.ts` e deixa as 20 iguais. |
| D13 | PlayerStats novos: `tradeIncome` e `seaTradeIncome` (E5, mult 1); `enemySpeed` (mult 1), `territoryRegen` (add 0), `veteranRate` (mult 1), `studySlots` (add 0), `coastSight` (add 0) (E7). | Cada um é um número com padrão neutro: nada de estado novo nem campo serializado. |
| D14 | **Regras modernas fora de cenário, clássicas dentro**: `allWondersOn(config) = config.allWonders ?? !isScenarioConfig(config)`. Desligado (cenário): só `CLASSIC_WONDERS`, Era de construção `scenarioAge` (3 = Era IV, como hoje), **1 por jogador**, sem unicidade, sem desabar obras, contagem de vitória de 6 min. Ligado: as 20, várias por jogador, únicas no mapa. | A campanha e o harness (m6: o jogador PRECISA da Estátua de Zeus) não mudam em nada. |
| D15 | Pontos de uma maravilha = `def.age + 1`. Meta = `config.wonderPointsToWin` ou `min(20, ceil(40 % da soma dos pontos das maravilhas até a Era final))` — tabela pronta abaixo. O time precisa **manter** a meta por **120 s**. Só contam maravilhas prontas de jogadores vivos. | Eras altas valem mais (§9); com Era final baixa a meta cai junto; os 2 min dão chance de reação. |
| D16 | `config.wonderVictory?: 'points' \| 'hold' \| 'off'` (padrão `'points'`). `'hold'` = a regra de hoje (uma maravilha por 6 min). Seletor na partida rápida e no lobby. | A §9 manda manter a regra de hoje como opção. |
| D17 | Desempate da vitória por maravilha: quem cumpriu primeiro (tick); empate → mais pontos do time; empate de novo → ninguém vence neste segundo. **Nunca** o índice do jogador (hoje `victory.ts` dá ao primeiro da lista). | Justiça de posição (CLAUDE.md). |
| D18 | Obra perdida na corrida: ao concluir uma maravilha, as obras **incompletas** do mesmo tipo dos outros jogadores são destruídas com reembolso do custo atual (como o cancelar) e aviso ao dono. | "Quem termina primeiro fica com ela" (§9) sem prejuízo injusto. |
| D19 | Efeitos que o motor não tem: **Meteora** "edifícios no alto" vira "todos os edifícios +10 % de vida" (não há altitude na simulação); **Teatro de Epidauro** cura 1,5 de vida/s no território próprio, 5 s depois do último golpe; **Mausoléu**: herói morto em combate renasce em 30 s no Templo de menor id; **Delfos**: Oráculo de 20 s a cada 180 s; **Trono**: ao ficar pronto, `used = false` e `charges + 1` em todos os poderes. | São as leituras mais diretas da §9 que cabem no motor; a E10 ajusta os números. |
| D20 | **Canal de Corinto**: `passable: true` (tropas andam por cima, como ponte) e `navalPassable: true` (navios atravessam a pegada; gancho da E4, Fase M). Não exige istmo para ser construído. | Não sela rotas de terra; quem o põe num istmo ganha a passagem naval. |
| D21 | Navios nos efeitos (Farol, Arsenal) = `match: { tags: ['ship'] }`. Se a E4 deu outra tag a todos os navios, troque pela dela. | Sem a E4, o efeito não pega nada e não quebra nada. |
| D22 | Painel de construção: a maravilha só aparece **na Era dela ou depois** e **enquanto ninguém a concluiu**; em cenário vale a regra antiga (Era + 1, só as 3 clássicas). O ciclo da tecla `M` usa o mesmo filtro (`wonderListed`). | 20 botões não cabem; as tomadas não servem para nada. |
| D23 | IA (fora de cenário): escolhe entre as maravilhas disponíveis da Era mais alta (ordenadas por Era desc. e id), a `personalidade % min(3, n)`; ergue uma por vez quando tem 1,25× o custo em todos os recursos; ataca primeiro a maravilha pronta e alcançável de um inimigo em contagem. Dentro de cenário, a regra de hoje. | Disputa real sem travar a economia; o cenário fica igual. |
| D24 | `SIM_VERSION` sobe **1 na E5** e **mais 1 na E7**. O formato do save **não** muda (só campos com padrão no `deserialize`). | A mesma semente dá outra partida; saves da etapa anterior carregam. |
| D25 | Arte provisória: **alias** da E2 (caravana e as 17 maravilhas); **nenhum** manifesto, bake ou `npm run art:hud` nesta etapa (não há tecnologia, poder, recurso nem Era nova). **Exceção:** o navio mercante (Fase F) segue os navios da E4 — procedural, sem alias — e ganha o ícone no `SHIP_ICONS` com `npm run art:hud`. | Nenhuma página nova de VRAM; os testes de arte já filtram o alias (E2, passo 25) e os navios (E4, F8). |

---

## Arquivos que mudam

| Caminho | O que muda |
|---|---|
| `src/core/types.ts` | E5: `UnitDef.trader?`; `BuildingDef.tradeRoute?`; `UnitState` e `Order.type` + `'route'`; `Unit.routeA/routeB/routeLeg`; `Command` `route`; `PlayerStat` + `tradeIncome`, `seaTradeIncome`. E7: `BuildingDef.wonderEffects?`, `scenarioAge?`, `navalPassable?`; `GameConfig.wonderVictory?`, `wonderPointsToWin?`, `allWonders?`; `Player.wonderHoldStart`, `Player.respawns`; `PowerState.charges?`; `PlayerStat` + `enemySpeed`, `territoryRegen`, `veteranRate`, `studySlots`, `coastSight` |
| `src/core/constants.ts` | E5: `TRADE_*`, `CARAVAN_TARGET_AI`, `MERCHANT_SHIP_TARGET_AI`; E7: `WONDER_*`, `DELPHI_*`, `MAUSOLEUM_RESPAWN_SECONDS`, `WonderVictory`, `WONDER_VICTORIES`; `SIM_VERSION` +1 em cada etapa |
| `src/core/data/units.ts` | E5: `caravan` (e `merchant_ship` na Fase F) |
| `src/core/data/buildings.ts` | E5: `tradeRoute` em `town_center`/`market`, `market.trains` + `caravan`. E7: 17 maravilhas novas, `wonderEffects` nas 20, Eras novas das 3 de hoje, `scenarioAge`, `BUILD_MENU`, `CLASSIC_WONDERS` |
| `src/core/data/index.ts` | reexporta `CLASSIC_WONDERS` e `WONDER_EFFECTS` |
| `src/core/sim/trade.ts` (novo) | `tradeKindOf`, `isTradePost`, `nearestOwnPost`, `canRoute`, `routeGold`, `bestRoute`, `reachableFor` |
| `src/core/sim/wonders.ts` (novo) | `wonderVictoryMode`, `wonderPoints`, `teamWonderPoints`, `wonderPointsTarget`, `wonderTakenBy`, `hasWonder`, `wonderListed`, `onWonderComplete`, `queueHeroRespawn`, `wonderSecond`, `wonderWinner` |
| `src/core/sim/units.ts` | E5: `startOrder` case `'route'`, `updateUnit` case `'route'`, `updateRoute`/`endRoute` (privadas). E7: velocidade com `enemyTerritorySpeed` |
| `src/core/sim/commands.ts` | E5: case `'route'`. E7: `canTrain` recusa herói que vai renascer |
| `src/core/sim/validate.ts` | E5: `'route'` no case de `attack/gather/pray/repair/garrison` |
| `src/core/sim/entities.ts` | E5: literal de `spawnUnit`; `canGarrison` recusa `trader`. E7: `buildingLimitOk` (ramo `'wonder'`), `canPlaceBuilding` (`buildingAgeOf`), `onBuildingComplete` chama `onWonderComplete` |
| `src/core/sim/buildings.ts` | E5: ponto de encontro num ponto de comércio vira rota. E7: `studySlotsOf` e a fila com N vagas |
| `src/core/sim/modifiers.ts` | E5/E7: `PLAYER_STATS`, `defaultMods`; E7: `wonderEffects` no lugar dos 3 `if`; `unitRank` |
| `src/core/sim/economy.ts` | E7: sai o bloco do cronômetro da maravilha; entra a cura de `territoryRegen` |
| `src/core/sim/combat.ts` | E7: `rankOf(...)` → `unitRank(...)`; `killUnit` chama `queueHeroRespawn`; `destroyBuilding` marca `territoryDirty` para maravilha |
| `src/core/sim/victory.ts` | E7: `declareWinner` usa `wonderWinner` |
| `src/core/sim/game.ts` | E7: `wonderHoldStart`/`respawns` no literal do jogador; `wonderSecond` no tick (o `summarize` do smoke **não** muda: as contagens novas vão só para `scripts/balance.ts`) |
| `src/core/sim/restrictions.ts` | E7: `allWondersOn`, `buildingAgeOf` |
| `src/core/sim/territory.ts` | E7: `enemyTerritorySpeed` |
| `src/core/sim/fog.ts` | E7: litoral visível com `coastSight` |
| `src/core/serialize.ts` (Fase M, só com a E4) | reabre a passagem naval do Canal ao carregar (`setNavalOpen`) |
| `src/core/sim/powers.ts` | E7: `powerReady`, uso extra por `charges` |
| `src/core/sim/ai.ts` | E5: `manageCaravans`. E7: `aiWonderChoice`, plano das maravilhas, prioridade de ataque, `powerReady` |
| `src/core/serialize.ts` | padrões de `routeA/routeB/routeLeg` (E5) e `wonderHoldStart/respawns` (E7); `mods` (se ainda for literal) com os stats novos |
| `src/core/net/desync.ts` | campos novos no relatório |
| `src/render/art/alias.ts` (da E2) | `caravan: 'kataskopos'`; 17 maravilhas |
| `scripts/bake/hud/catalog.mjs`, `public/art/hud-*` (só Fase F, com a E4) | `SHIP_ICONS.merchant_ship`; atlas regerado por `npm run art:hud` (nunca à mão) |
| `src/render/renderer.ts` | E7: `rankOf(u.kills)` → `unitRank(state, u)` |
| `src/ui/input.ts` | E5: clique direito de caravana; E7: ciclo do `M` por `wonderListed` |
| `src/ui/hud.ts` | E5: `issueChecked` da rota, cartão da caravana. E7: lista de maravilhas (e a chave de redesenho do painel), barra do topo, cartão da maravilha, poderes com `charges`, fila com N vagas, `powerReady` |
| `src/ui/studytree.ts` (da E1) | E7: status `active` para os itens dentro de `studySlotsOf` (J4) |
| `src/ui/gamepad.ts` | E7: `powerReady` |
| `src/ui/menu.ts` | E7: seletor "Vitória por maravilha" na partida rápida e no lobby |
| `src/net/client.ts` | E7: `LobbyState.settings.wonderVictory?` |
| `server/relay.mjs` | E7: `cleanSettings` aceita `wonderVictory` |
| `src/i18n/strings.ts`, `src/i18n/en-data.ts` | textos PT/EN (tabelas abaixo) |
| `src/game/achievements.ts`, `desktop/steam/achievements.json`, `desktop/steam/achievements.csv` | E7: texto de `win_wonder` (os dois `.json/.csv` são regerados pelo script, nunca à mão) |
| `scripts/balance.ts` | colunas `caravanas=` e `maravilhas=` |
| `scripts/playtest-trade.mjs` (novo), `scripts/playtest-wonders.mjs` (novo) | playtests no navegador |
| `tests/trade-e5.test.ts` (novo), `tests/wonders-e7.test.ts` (novo) | testes novos |
| `tests/command-fuzz.test.ts`, `tests/movement-ai.test.ts`, `tests/relay-anticheat.test.ts` | ver "Testes a escrever ou atualizar" |
| `src/core/map/naval.ts` (da E4) | E7, Fase M: tiles abertos à navegação pelo Canal de Corinto (`setNavalOpen`) — só com a E4 |
| `docs/eras/PROGRESSO.md`, `docs/ROADMAP.md`, `CLAUDE.md`, `docs/DESIGN.md` | documentação ("Ao terminar") |

**Não mexa** em `art/manifest/*`, `scripts/bake/page/*`, `materials.js` (reassa a arte), em
`src/core/scenario/missions/*.json`, `src/core/scenario/testing.ts` e `src/core/scenario/campaign.ts` (D14 deixa a
campanha intacta) nem nos mapas `src/core/data/maps/*.map.json`.

---

## Dados prontos

### E5 — constantes (`src/core/constants.ts`, depois de `MARKET_TAX`)

```ts
// Comércio (docs/ERAS.md §7; docs/eras/E5-E7-comercio-maravilhas.md): caravanas (terra) e navios mercantes (mar)
/** Distância mínima (tiles, entre os centros) entre a casa e o destino de uma rota. */
export const TRADE_MIN_DISTANCE = 16;
/** Ouro por tile de distância a cada chegada (antes dos bônus). */
export const TRADE_GOLD_PER_TILE = { land: 0.5, sea: 0.7 } as const;
/** Rota até um ponto de comércio de OUTRO jogador do time. */
export const TRADE_ALLY_BONUS = 1.25;
/** Meta de caravanas da IA por Era (índice = player.age); o teste exige length === AGES.length. */
export const CARAVAN_TARGET_AI = [0, 2, 3, 4, 5, 6, 6, 6];
/** Meta de navios mercantes da IA por Era (Fase F, com a E4). */
export const MERCHANT_SHIP_TARGET_AI = [0, 0, 1, 2, 2, 3, 3, 3];
```

### E5 — a Caravana (`src/core/data/units.ts`, logo depois de `merchant` da E2)

| Campo | Valor |
|---|---|
| id / PT / EN | `caravan` · Caravana / Caravanas · Caravan / Caravans |
| `cls`, `tags`, `trader` | `'villager'`, `['civilian', 'caravan']`, `'land'` |
| custo, vida, armadura | `{ food: 60, wood: 60 }`, 180, `{ hack: 0.1, pierce: 0.3, crush: 0 }` |
| ataque, alcance, velocidade, visão | 0 (`attackType: 'hack'`), 0.6, 2.2, 6 |
| treino, população, raio | 25 s, 1, 0.42 |
| edifício, Era, atalho | `market`, 1 (Era II), `C` |
| alias de arte e ícone | `kataskopos` |

```ts
  caravan: { id: 'caravan',
    name: 'Caravana', plural: 'Caravanas', icon: '🐫', cls: 'villager',
    cost: { food: 60, wood: 60 }, hp: 180, attack: 0, attackType: 'hack', armor: { hack: 0.1, pierce: 0.3, crush: 0 },
    range: 0.6, speed: 2.2, los: 6, trainTime: 25, pop: 1, radius: 0.42,
    tags: ['civilian', 'caravan'], bonus: {}, building: 'market', age: 1, hotkey: 'C', trader: 'land',
    desc: 'Leva mercadorias numa rota entre um Centro Cívico ou Mercado seu e outro seu ou de um aliado, a 16 tiles ou mais: cada chegada rende ouro pela distância (+25% se o destino for de um aliado). Clique com o botão direito no destino. Não luta nem entra em edifícios.',
  },
```

EN (`EN_UNITS`): `caravan: { name: 'Caravan', plural: 'Caravans', desc: 'Carries goods on a route between a Town Center or Market of yours and another of yours or an ally\'s, 16 tiles or more apart: each arrival earns gold by distance (+25% if the destination is an ally\'s). Right-click the destination. Does not fight or enter buildings.' }`.

Edifícios: `town_center` e `market` ganham `tradeRoute: 'land'`; `market.trains` passa a `['merchant', 'caravan']`
(a E2 deixou `['merchant']`). O atalho `C` do treino é contexto de edifício: não colide com o `C` da muralha (contexto
de cidadão). Confira que nenhuma outra unidade de `market.trains` usa `C`.

### E5 — Navio mercante (Fase F, só com a E4)

| Campo | Valor |
|---|---|
| id / PT / EN | `merchant_ship` · Navio Mercante / Navios Mercantes · Merchant Ship / Merchant Ships |
| `cls`, flag de navio, `tags`, `trader` | `'ship'`, `naval: true` (D5 da E4), `['ship', 'civilian', 'merchant_ship']`, `'sea'` |
| custo, vida, ataque, armadura | `{ wood: 120, gold: 30 }`, 280, 0 (`attackType: 'hack'`), `{ hack: 0.15, pierce: 0.25, crush: 0.05 }` |
| alcance, velocidade, raio, visão | 0, 3.4, 0.6, 8 |
| treino, população | 25 s, 2 |
| edifício, Era, atalho | `shipyard` (Estaleiro da E4), 2 (Era III), `M` (a E4 deixou `M`, `C`, `V` e `B` livres no Estaleiro para isto; confira que o `trains` dele não usa `M`, senão pegue a 1ª livre dessas quatro) |
| arte e ícone | **sem alias**: a E4 desenha os navios no procedural (`drawShip`, D22 dela) e o mercante sai desenhado por ele; o ícone é uma entrada `merchant_ship: S({ kind: 'transport' })` no `SHIP_ICONS` de `scripts/bake/hud/catalog.mjs` + `npm run art:hud` |
| desc PT | Navio de carga: faz rota entre dois Estaleiros (seus ou de aliados) a 16 tiles ou mais; cada chegada rende ouro pela distância. Clique com o botão direito no Estaleiro de destino. Não luta. |
| desc EN | Cargo ship: runs a route between two Shipyards (yours or an ally's) 16 tiles or more apart; each arrival earns gold by distance. Right-click the destination Shipyard. Does not fight. |

Os números são os da linha "Reservado para a E5" de `docs/eras/E4-naval.md` (tabela das unidades). Se a E4 executada
tiver mudado essa linha, siga a E4.

### E5 — PlayerStats novos

| stat | tipo | padrão | quem mexe |
|---|---|---|---|
| `tradeIncome` | mult | 1 | Canal de Corinto (×1,5) |
| `seaTradeIncome` | mult | 1 | Farol de Alexandria (×1,25) |

### E5 — textos de interface (`src/i18n/strings.ts`, PT e EN, sem emoji)

| chave | PT | EN |
|---|---|---|
| `state.route` | Comerciando | Trading |
| `err.notTrader` | Só caravanas e navios mercantes fazem rotas comerciais. | Only caravans and merchant ships run trade routes. |
| `err.routeTarget` | Escolha um Centro Cívico ou Mercado pronto, seu ou de um aliado. | Pick a finished Town Center or Market, yours or an ally's. |
| `err.routeSeaTarget` | Escolha um Estaleiro pronto, seu ou de um aliado. | Pick a finished Shipyard, yours or an ally's. |
| `err.routeNoHome` | Você precisa de um ponto de comércio próprio pronto para a rota começar. | You need a finished trading post of your own for the route to start. |
| `err.routeShort` | Rota curta demais: os dois pontos precisam estar a pelo menos {n} tiles um do outro. | Route too short: the two posts must be at least {n} tiles apart. |
| `err.routeUnreachable` | Não há caminho até esse ponto de comércio. | There is no path to that trading post. |
| `ev.routeLost` | Rota comercial parada: um dos pontos foi perdido. | Trade route stopped: one of its posts was lost. |
| `ev.routeBlocked` | Rota comercial parada: o caminho foi bloqueado. | Trade route stopped: the path was blocked. |
| `sel.route` | Rota | Route |
| `sel.routeGold` | {g} de ouro por viagem | {g} gold per trip |

---

### E7 — constantes (`src/core/constants.ts`, depois de `WONDER_VICTORY_SECONDS`)

```ts
// Maravilhas (docs/ERAS.md §9; docs/eras/E5-E7-comercio-maravilhas.md)
export type WonderVictory = 'points' | 'hold' | 'off';
export const WONDER_VICTORIES: WonderVictory[] = ['points', 'hold', 'off'];
/** Teto da meta de pontos de maravilha (a meta é 40% dos pontos existentes até a Era final, no máximo isto). */
export const WONDER_POINTS_MAX_TARGET = 20;
/** Segundos que o time precisa manter a meta de pontos para vencer. */
export const WONDER_POINTS_HOLD_SECONDS = 120;
/** Santuário de Delfos: Oráculo grátis a cada N segundos, durando M segundos. */
export const DELPHI_ORACLE_EVERY = 180;
export const DELPHI_ORACLE_SECONDS = 20;
/** Mausoléu de Halicarnasso: segundos até o herói morto renascer no Templo. */
export const MAUSOLEUM_RESPAWN_SECONDS = 30;
```

### E7 — meta de pontos por Era final (D15; o teste confere esta linha)

| Era final (`config.maxAge`) | 0 (I) | 1 (II) | 2 (III) | 3 (IV) | 4 (V) | 5 (VI) | 6 (VII) | 7 (VIII) |
|---|---|---|---|---|---|---|---|---|
| maravilhas até a Era | 3 | 7 | 11 | 14 | 16 | 17 | 19 | 20 |
| pontos existentes | 3 | 11 | 23 | 35 | 45 | 51 | 65 | 73 |
| **meta** = `min(20, ceil(pontos × 2 / 5))` | **2** | **5** | **10** | **14** | **18** | **20** | **20** | **20** |

### E7 — as 20 maravilhas (`src/core/data/buildings.ts`)

Todas: `w: 4, h: 4`, `armor: BARMOR`, `wonder: true`, `limit: 'wonder'`, `hotkey: 'M'`. Pontos = `age + 1`.
Custos por Era (modelo das novas): I `food 400, wood 400, stone 400, gold 300` + 50 de extra; II `600/550/550/550` + 100;
III `600/550/700/750` + 200; IV `700/650/850/900` + 300; V `800/700/1000/1050, oil 100` + 350; VI `900/800/1150/1200, oil 150`
+ 400; VII `1000/900/1300/1350, oil 200` + 450; VIII `1100/1000/1500/1500, oil 300` + 600 (o "extra" é `favor` ou
`knowledge`, coluna abaixo). As 3 de hoje guardam os números da E2 (D11).

| # | id | PT | EN | `age` | pts | custo completo | vida | obra (s) | outros campos | alias de arte |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `wonder_lion_gate` | Porta dos Leões de Micenas | Lion Gate of Mycenae | 0 | 1 | food 400, wood 400, stone 400, gold 300, knowledge 50 | 3000 | 180 | — | `wonder_colossus` |
| 2 | `wonder_labyrinth` | Labirinto de Cnossos | Labyrinth of Knossos | 0 | 1 | food 400, wood 400, stone 400, gold 300, favor 50 | 3000 | 180 | — | `wonder_artemis` |
| 3 | `wonder_delphi` | Santuário de Delfos | Sanctuary of Delphi | 0 | 1 | food 400, wood 400, stone 400, gold 300, favor 50 | 3000 | 180 | — | `wonder_artemis` |
| 4 | `wonder_parthenon` | Partenon | Parthenon | 1 | 2 | food 600, wood 550, stone 550, gold 550, knowledge 100 | 4000 | 240 | — | `wonder_artemis` |
| 5 | `wonder_zeus` (existe) | Estátua de Zeus | Statue of Zeus | **3→1** | 2 | (da E2) wood 600, stone 600, gold 600, food 600, favor 100 | 4000 | 240 | `scenarioAge: 3` | — |
| 6 | `wonder_artemis` (existe) | Templo de Ártemis | Temple of Artemis | **3→1** | 2 | (da E2) wood 650, stone 600, gold 550, food 600, knowledge 200 | 4000 | 240 | `scenarioAge: 3` | — |
| 7 | `wonder_epidaurus` | Teatro de Epidauro | Theatre of Epidaurus | 1 | 2 | food 600, wood 550, stone 550, gold 550, favor 100 | 4000 | 240 | — | `wonder_artemis` |
| 8 | `wonder_colossus` (existe) | Colosso de Rodes | Colossus of Rhodes | **3→2** | 3 | (da E2) wood 500, stone 700, gold 800, food 600, knowledge 200 | 5000 | 240 | `territory: 6`, `scenarioAge: 3` | — |
| 9 | `wonder_mausoleum` | Mausoléu de Halicarnasso | Mausoleum at Halicarnassus | 2 | 3 | food 600, wood 550, stone 700, gold 750, favor 200 | 5000 | 240 | — | `wonder_artemis` |
| 10 | `wonder_pharos` | Farol de Alexandria | Lighthouse of Alexandria | 2 | 3 | food 600, wood 550, stone 700, gold 750, knowledge 200 | 5000 | 240 | — | `wonder_colossus` |
| 11 | `wonder_great_library` | Biblioteca de Alexandria | Library of Alexandria | 2 | 3 | food 600, wood 550, stone 700, gold 750, knowledge 200 | 5000 | 240 | — | `wonder_artemis` |
| 12 | `wonder_hagia_sophia` | Hagia Sophia | Hagia Sophia | 3 | 4 | food 700, wood 650, stone 850, gold 900, favor 300 | 6000 | 270 | — | `wonder_artemis` |
| 13 | `wonder_theodosian_walls` | Muralhas de Teodósio | Theodosian Walls | 3 | 4 | food 700, wood 650, stone 850, gold 900, knowledge 300 | 6000 | 270 | — | `wonder_colossus` |
| 14 | `wonder_meteora` | Mosteiros de Meteora | Monasteries of Meteora | 3 | 4 | food 700, wood 650, stone 850, gold 900, favor 300 | 6000 | 270 | — | `wonder_artemis` |
| 15 | `wonder_candia_arsenal` | Arsenal de Cândia | Arsenal of Candia | 4 | 5 | food 800, wood 700, stone 1000, gold 1050, oil 100, knowledge 350 | 7000 | 300 | — | `wonder_colossus` |
| 16 | `wonder_knights_rhodes` | Fortaleza dos Cavaleiros de Rodes | Fortress of the Knights of Rhodes | 4 | 5 | food 800, wood 700, stone 1000, gold 1050, oil 100, favor 350 | 7000 | 300 | — | `wonder_colossus` |
| 17 | `wonder_palamidi` | Forte de Palamidi | Palamidi Fortress | 5 | 6 | food 900, wood 800, stone 1150, gold 1200, oil 150, knowledge 400 | 8000 | 330 | — | `wonder_colossus` |
| 18 | `wonder_corinth_canal` | Canal de Corinto | Corinth Canal | 6 | 7 | food 1000, wood 900, stone 1300, gold 1350, oil 200, knowledge 450 | 9000 | 360 | `passable: true`, `navalPassable: true` | `wonder_colossus` |
| 19 | `wonder_panathenaic` | Estádio Panatenaico | Panathenaic Stadium | 6 | 7 | food 1000, wood 900, stone 1300, gold 1350, oil 200, favor 450 | 9000 | 360 | — | `wonder_artemis` |
| 20 | `wonder_olympus_throne` | Trono do Olimpo | Throne of Olympus | 7 | 8 | food 1100, wood 1000, stone 1500, gold 1500, oil 300, favor 600 | 10000 | 400 | — | `wonder_zeus` |

Ícones de dado (`icon`, só dado, o HUD não mostra): 1 `'🦁'`, 2 `'🌀'`, 3 `'🔮'`, 4 `'🏛️'`, 7 `'🎭'`, 9 `'⚱️'`, 10 `'🗼'`,
11 `'📜'`, 12 `'⛪'`, 13 `'🧱'`, 14 `'⛰️'`, 15 `'⚓'`, 16 `'🛡️'`, 17 `'🏰'`, 18 `'🌊'`, 19 `'🏟️'`, 20 `'👑'`.

Se a E1 criou `ERA` em `src/core/data/ages.ts`, pode escrever `age: ERA.CLASSICAL` etc.; o valor é o da tabela.

**Ordem** em `BUILDINGS` e em `BUILD_MENU`: as 17 novas entram **logo depois de `wonder_colossus`**, na ordem da coluna
`#` (1, 2, 3, 4, 7, 9, 10, 11, 12…20), e antes de `titan_gate`. Não reordene as 3 de hoje.

### E7 — efeitos (`wonderEffects`), prontos para colar

Os ids das linhas `elite` e `artillery` são os da E3 (`docs/eras/E3-linhas-de-unidade.md`, tabela das linhas). Antes de
colar, confira: `grep -n "athanatos\|self_propelled_gun" src/core/data/units.ts`. Se a E3 usou outros ids, copie os
`steps` não nulos de `LINES.elite` e `LINES.artillery` de `src/core/data/lines.ts` (o teste novo acusa id inexistente).

```ts
// Em src/core/data/buildings.ts, antes de BUILDINGS (Effect vem de '../types'):
const ELITE_LINE = ['myrmidon', 'athanatos', 'knight_of_rhodes', 'guard_grenadier', 'evzone', 'sacred_band'];
const ARTILLERY_LINE = ['petrobolos', 'trebuchet', 'bombard', 'field_gun', 'howitzer', 'self_propelled_gun'];
const SHIP = { tags: ['ship'] };   // E4: a tag de todo navio (D21)
export const WONDER_EFFECTS: Record<string, Effect[]> = {
  wonder_lion_gate: [{ type: 'building', match: { types: ['wall', 'gate'] }, stat: 'hp', mult: 1.5 }, { type: 'player', stat: 'territory', add: 2 }],
  wonder_labyrinth: [{ type: 'player', stat: 'enemySpeed', mult: 0.75 }, { type: 'cost', match: { types: ['minotaur'] }, mult: 0.75 }],
  wonder_delphi: [{ type: 'player', stat: 'favorRate', mult: 1.2 }],                                   // + Oráculo periódico (wonders.ts)
  wonder_parthenon: [{ type: 'player', stat: 'knowledgeRate', mult: 1.25 }, { type: 'unit', match: { tags: ['infantry'] }, stat: 'hp', mult: 1.1 }],
  wonder_zeus: [{ type: 'player', stat: 'favorRate', mult: 1.5 }],
  wonder_artemis: [{ type: 'unit', match: { tags: ['myth'] }, stat: 'hp', mult: 1.25 }],
  wonder_epidaurus: [{ type: 'player', stat: 'territoryRegen', add: 1.5 }],
  wonder_colossus: [{ type: 'player', stat: 'territory', add: 4 }, { type: 'building', match: 'all', stat: 'hp', mult: 1.2 }],
  wonder_mausoleum: [],                                                                                // renascer dos heróis (wonders.ts)
  wonder_pharos: [{ type: 'unit', match: SHIP, stat: 'speed', mult: 1.15 }, { type: 'unit', match: SHIP, stat: 'los', mult: 1.15 }, { type: 'player', stat: 'seaTradeIncome', mult: 1.25 }, { type: 'player', stat: 'coastSight', add: 1 }],
  wonder_great_library: [{ type: 'player', stat: 'researchCost', mult: 0.75 }, { type: 'player', stat: 'studySlots', add: 1 }],
  wonder_hagia_sophia: [{ type: 'player', stat: 'favorRate', mult: 1.25 }, { type: 'player', stat: 'attrition', add: 0.4 }],   // 0,4 = BASE_ATTRITION: o atrito dobra
  wonder_theodosian_walls: [{ type: 'building', match: { types: ['wall', 'gate', 'tower'] }, stat: 'hp', mult: 2 }, { type: 'building', match: { types: ['tower'] }, stat: 'range', add: 1 }],
  wonder_meteora: [{ type: 'player', stat: 'knowledgeRate', mult: 1.3 }, { type: 'building', match: 'all', stat: 'hp', mult: 1.1 }],
  wonder_candia_arsenal: [{ type: 'cost', match: SHIP, mult: 0.7 }, { type: 'unit', match: SHIP, stat: 'trainTime', mult: 0.7 }],
  wonder_knights_rhodes: [{ type: 'building', match: { types: ['fortress'] }, stat: 'hp', mult: 1.5 }, { type: 'building', match: { types: ['fortress'] }, stat: 'attack', mult: 1.5 }, { type: 'cost', match: { types: ELITE_LINE }, mult: 0.8 }],
  wonder_palamidi: [{ type: 'unit', match: { types: ARTILLERY_LINE }, stat: 'los', mult: 1.5 }, { type: 'unit', match: { types: ARTILLERY_LINE }, stat: 'range', add: 1 }, { type: 'building', match: { types: ['tower'] }, stat: 'los', mult: 1.5 }, { type: 'building', match: { types: ['tower'] }, stat: 'range', add: 1 }],
  wonder_corinth_canal: [{ type: 'player', stat: 'tradeIncome', mult: 1.5 }],                            // + passagem naval (Fase M)
  wonder_panathenaic: [{ type: 'player', stat: 'veteranRate', mult: 2 }],
  wonder_olympus_throne: [],                                                                           // poderes recarregados (wonders.ts)
};
```

Cada maravilha recebe `wonderEffects: WONDER_EFFECTS.<id>` no próprio objeto (as 20, inclusive as 3 de hoje).
`'trainTime'` é um campo de `UnitStats` (`src/core/sim/runtime.ts`) e `applyStat` o aplica; `'speed'`, `'los'`,
`'range'`, `'hp'` também. Em edifício só valem `hp`, `attack`, `range`, `los` (`getBuildingStats`); em `match` de
edifício só `'all'` e `types` funcionam (`matches(..., [])`, sem tags).

### E7 — descrições (`desc`, PT nos dados e EN em `EN_BUILDINGS`)

| id | desc PT | desc EN |
|---|---|---|
| `wonder_lion_gate` | Maravilha da Era I (1 ponto). Muralhas e portões +50% de vida; fronteiras +2. | Era I wonder (1 point). Walls and gates +50% health; borders +2. |
| `wonder_labyrinth` | Maravilha da Era I (1 ponto). Inimigos no seu território andam 25% mais devagar; Minotauros 25% mais baratos. | Era I wonder (1 point). Enemies inside your territory move 25% slower; Minotaurs 25% cheaper. |
| `wonder_delphi` | Maravilha da Era I (1 ponto). Favor +20%; a cada 3 minutos, um Oráculo grátis revela o mapa por 20 s. | Era I wonder (1 point). Favor +20%; every 3 minutes a free Oracle reveals the map for 20 s. |
| `wonder_parthenon` | Maravilha da Era II (2 pontos). Conhecimento +25%; infantaria +10% de vida. | Era II wonder (2 points). Knowledge +25%; infantry +10% health. |
| `wonder_zeus` | Maravilha da Era II (2 pontos). Favor +50%. | Era II wonder (2 points). Favor +50%. |
| `wonder_artemis` | Maravilha da Era II (2 pontos). Criaturas míticas +25% de vida. | Era II wonder (2 points). Mythic creatures +25% health. |
| `wonder_epidaurus` | Maravilha da Era II (2 pontos). Asclépio cura: suas unidades recuperam 1,5 de vida por segundo dentro do seu território, 5 s depois do último golpe. | Era II wonder (2 points). Asclepius heals: your units regain 1.5 health per second inside your territory, 5 s after the last hit. |
| `wonder_colossus` | Maravilha da Era III (3 pontos). Fronteiras +4 e edifícios +20% de vida. | Era III wonder (3 points). Borders +4 and buildings +20% health. |
| `wonder_mausoleum` | Maravilha da Era III (3 pontos). Seus heróis mortos em combate renascem num Templo seu 30 s depois. | Era III wonder (3 points). Your heroes slain in battle are reborn at one of your Temples 30 s later. |
| `wonder_pharos` | Maravilha da Era III (3 pontos). Revela o litoral; navios +15% de velocidade e de visão; rotas marítimas +25% de ouro. | Era III wonder (3 points). Reveals the coastline; ships +15% speed and sight; sea trade routes +25% gold. |
| `wonder_great_library` | Maravilha da Era III (3 pontos). Estudos 25% mais baratos; cada Biblioteca faz dois estudos ao mesmo tempo. | Era III wonder (3 points). Studies 25% cheaper; each Library runs two studies at once. |
| `wonder_hagia_sophia` | Maravilha da Era IV (4 pontos). Favor +25%; o atrito dos inimigos no seu território dobra. | Era IV wonder (4 points). Favor +25%; enemy attrition inside your territory doubles. |
| `wonder_theodosian_walls` | Maravilha da Era IV (4 pontos). Muralhas, portões e torres +100% de vida; torres +1 de alcance. | Era IV wonder (4 points). Walls, gates and towers +100% health; towers +1 range. |
| `wonder_meteora` | Maravilha da Era IV (4 pontos). Conhecimento +30%; todos os edifícios +10% de vida. | Era IV wonder (4 points). Knowledge +30%; all buildings +10% health. |
| `wonder_candia_arsenal` | Maravilha da Era V (5 pontos). Navios 30% mais baratos e 30% mais rápidos de construir. | Era V wonder (5 points). Ships 30% cheaper and 30% faster to build. |
| `wonder_knights_rhodes` | Maravilha da Era V (5 pontos). Fortalezas +50% de vida e de ataque; elite da Fortaleza 20% mais barata. | Era V wonder (5 points). Fortresses +50% health and attack; Fortress elite 20% cheaper. |
| `wonder_palamidi` | Maravilha da Era VI (6 pontos). Artilharia e torres +50% de visão e +1 de alcance. | Era VI wonder (6 points). Artillery and towers +50% sight and +1 range. |
| `wonder_corinth_canal` | Maravilha da Era VII (7 pontos). Caravanas e navios mercantes +50% de ouro; tropas passam por cima dela e navios a atravessam (construa-a num istmo). | Era VII wonder (7 points). Caravans and merchant ships +50% gold; troops walk over it and ships sail through it (build it on an isthmus). |
| `wonder_panathenaic` | Maravilha da Era VII (7 pontos). Suas unidades ganham patentes de veterania duas vezes mais rápido. | Era VII wonder (7 points). Your units earn veterancy ranks twice as fast. |
| `wonder_olympus_throne` | Maravilha da Era VIII (8 pontos). Ao ficar pronta, recarrega todos os seus poderes divinos e dá +1 uso de cada. | Era VIII wonder (8 points). When finished, it recharges all your divine powers and grants +1 use of each. |

A vitória (pontos ou 6 min) sai das descs das 3 de hoje: ela é explicada na barra do topo e na ajuda.

### E7 — PlayerStats novos

| stat | tipo | padrão | quem lê |
|---|---|---|---|
| `enemySpeed` | mult | 1 | `enemyTerritorySpeed` (territory.ts) → velocidade em `updateUnit` |
| `territoryRegen` | add | 0 | `economySecond` (cura no território próprio) |
| `veteranRate` | mult | 1 | `unitRank` (modifiers.ts) |
| `studySlots` | add | 0 | `studySlotsOf` (buildings.ts) |
| `coastSight` | add | 0 | `updateFog` (fog.ts) |

### E7 — textos de interface (`src/i18n/strings.ts`, PT e EN, mesmas `{variáveis}`, sem emoji)

| chave | PT | EN |
|---|---|---|
| `err.wonderTaken` | {name} já foi erguida por {player}. | {name} has already been raised by {player}. |
| `err.wonderBuilding` | Você já tem uma obra de {name}. | You already have {name} under construction. |
| `err.alreadyRespawning` | {name} vai renascer no Templo em breve. | {name} will be reborn at the Temple soon. |
| `ev.wonderPoints` | {player} concluiu {name} (+{pts} pontos de maravilha). | {player} completed {name} (+{pts} wonder points). |
| `ev.wonderRaceLost` | {player} concluiu {name} primeiro: sua obra foi desfeita e os recursos voltaram. | {player} completed {name} first: your foundation was undone and the resources returned. |
| `ev.wonderRace` | {players} somam {n} pontos de maravilha: vitória em {s} s se ninguém derrubar uma! | {players} hold {n} wonder points: victory in {s}s unless someone topples one! |
| `ev.wonderRaceStop` | A contagem de vitória por maravilhas de {players} parou. | The wonder victory countdown of {players} stopped. |
| `ev.victoryWonderPoints` | {players} venceu por pontos de maravilha! | {players} won by wonder points! |
| `ev.heroReborn` | {name} renasceu no Templo. | {name} was reborn at the Temple. |
| `ev.oracleFree` | O Santuário de Delfos revela o mapa por {s} s. | The Sanctuary of Delphi reveals the map for {s}s. |
| `ev.throne` | O Trono do Olimpo recarregou os poderes de {player} (+1 uso de cada). | The Throne of Olympus recharged {player}'s powers (+1 use each). |
| `top.wonders` | Maravilhas {mine}/{target} | Wonders {mine}/{target} |
| `top.wonderRace` | Vitória por maravilhas: {who} em {s}s | Wonder victory: {who} in {s}s |
| `top.wondersTip` | `<b>Pontos de maravilha</b><div class="desc">Cada maravilha vale o número da sua Era (I = 1 … VIII = 8). O time que somar {target} e mantiver por {hold} s vence.</div>` | `<b>Wonder points</b><div class="desc">Each wonder is worth its Era number (I = 1 … VIII = 8). The team that reaches {target} and holds it for {hold}s wins.</div>` |
| `sel.wonderPoints` | Pontos de maravilha | Wonder points |
| `power.charges` | +{n} uso(s) | +{n} use(s) |
| `main.wonderVictory` | Vitória por maravilha | Wonder victory |
| `wv.points` | Pontos de maravilha (padrão) | Wonder points (default) |
| `wv.hold` | Manter uma maravilha por 6 minutos | Hold one wonder for 6 minutes |
| `wv.off` | Desligada | Off |

Textos que mudam: `win_wonder` em `src/game/achievements.ts` — desc PT `Vença por maravilhas (pontos ou 6 minutos).`, EN
(linha `win_wonder: [...]` da tabela EN no mesmo arquivo) `['Wonder of the World', 'Win by wonders (points or 6 minutes).']`.
O id fica (API da Steam).

---

## Passo a passo

Faça **um commit por parte** (E5 no fim da Fase G, E7 no fim da Fase N). Rode `npm run -s typecheck` no fim de cada
passo. Testes podem ficar vermelhos entre passos da mesma fase, nunca no fim de uma fase.

### Parte 1 — E5 (comércio)

#### Fase 0 — Preparação

- [ ] **0.1. Pré-requisitos.** Cada comando abaixo precisa achar alguma coisa; se algum não achar, **pare** (a etapa
  anterior não está pronta):
  ```sh
  grep -n "ERA_TITANS" src/core/data/ages.ts                        # E1
  grep -n "export function isScenarioConfig" src/core/sim/restrictions.ts   # E1
  grep -n "'stone'" src/core/constants.ts                             # E2
  grep -n "merchant:" src/core/data/units.ts                          # E2 (Mercador)
  ls src/core/data/rares.ts src/render/art/alias.ts                   # E2
  grep -n "BUILDING_ART_ALIAS\|UNIT_ART_ALIAS" src/render/art/alias.ts   # E2
  ls src/core/data/lines.ts                                           # E3
  grep -n "SIM_VERSION =" src/core/constants.ts                       # anote o valor
  ```
- [ ] **0.2. Mercador (D9).** Confira que a E2 entregou o Mercador: `npx vitest run tests/resources-e2.test.ts` verde
  (caso 6: "Mercador em `wild_horses`…"). Se o arquivo não existir ou o Mercador não estiver lá, **antes de seguir**
  implemente os passos 9 (só a unidade e `market.trains`), 11, 22 e 25 de `docs/eras/E2-recursos.md` e registre no
  `docs/eras/PROGRESSO.md` que a E5 completou o Mercador.
- [ ] **0.3. "Antes".** `git status` limpo. Guarde (fora do repositório, em `/tmp`):
  `npm run smoke 20 42 > /tmp/e5-smoke-antes.txt` e `npm run balance 35 1,2,3 > /tmp/e5-balance-antes.txt`.

#### Fase A — Dados e tipos

- [ ] **A1. `src/core/types.ts`.**
  - `UnitDef`: acrescente no fim `trader?: 'land' | 'sea';   // E5: caravana (terra) ou navio mercante (mar)`.
  - `BuildingDef`: acrescente `tradeRoute?: 'land' | 'sea';   // E5: ponto de comércio das rotas (≠ trade, a compra/venda do Mercado)`.
  - `UnitState`: acrescente `| 'route'`. `Order.type`: acrescente `| 'route'`.
  - `Unit`: depois de `orderTick`, acrescente
    `routeA: number; routeB: number; routeLeg: number;   // E5: rota comercial (casa, destino, perna: 0 = à casa sem carga, 1 = ao destino, 2 = voltando)`.
  - `PlayerStat`: acrescente `| 'tradeIncome' | 'seaTradeIncome'`.
  - `Command`: acrescente `| { type: 'route'; player: number; ids: number[]; targetId: number; queue?: boolean }`.
  *Conferir:* `npm run -s typecheck` acusa os literais que faltam (`spawnUnit`, `defaultMods`); eles são os próximos passos.
- [ ] **A2. `src/core/constants.ts`:** cole o bloco "E5 — constantes".
- [ ] **A3. `src/core/sim/modifiers.ts`:** em `PLAYER_STATS` acrescente `'tradeIncome', 'seaTradeIncome'`; em
  `defaultMods().player` acrescente `tradeIncome: 1, seaTradeIncome: 1`. Se `src/core/serialize.ts` ainda montar `mods`
  com um literal (a E2 deveria ter trocado por `defaultMods()`), troque esse literal por `defaultMods()` (importe de
  `./sim/modifiers`, que o arquivo já usa como `mods.recomputeMods`).
- [ ] **A4. Dados.** `src/core/data/units.ts`: a `caravan` (bloco "E5 — a Caravana"). `src/core/data/buildings.ts`:
  `town_center` e `market` com `tradeRoute: 'land'`; `market.trains: ['merchant', 'caravan']`.
  *Conferir:* `npx vitest run tests/data.test.ts` verde (trains ↔ building, atalho único por edifício, nada de R/U).
- [ ] **A5. Arte provisória.** `src/render/art/alias.ts`: em `UNIT_ART_ALIAS`, acrescente `caravan: 'kataskopos',`.
  *Conferir:* `npx vitest run tests/art-etapa6.test.ts tests/hud-icons.test.ts` verde (os dois filtram o alias desde a E2).
- [ ] **A6. Textos.** `src/i18n/strings.ts`: as chaves da tabela "E5 — textos" nas tabelas `pt` e `en`.
  `src/i18n/en-data.ts`: `EN_UNITS.caravan`. *Conferir:* `npx vitest run tests/i18n.test.ts` verde.

#### Fase B — Núcleo

- [ ] **B1. `src/core/sim/trade.ts` (novo).** Copie e ajuste os imports se o typecheck pedir:
  ```ts
  // Rotas comerciais (docs/ERAS.md §7; docs/eras/E5-E7-comercio-maravilhas.md): caravanas por terra entre Centros Cívicos
  // e Mercados do time, navios mercantes por mar entre Estaleiros. Funções puras sobre o estado: o comando `route`
  // (commands.ts), o movimento (units.ts, updateRoute), a IA e o HUD usam as mesmas.
  import { TRADE_ALLY_BONUS, TRADE_GOLD_PER_TILE, TRADE_MIN_DISTANCE } from '../constants';
  import { BUILDINGS, UNITS } from '../data';
  import type { Building, GameState, Unit } from '../types';
  import { centerFrame, distToRect, frameCompare } from '../map/grid';
  import { rectReachable } from '../map/components';
  import { centerDist2, isAlly } from './queries';
  import { t } from '../../i18n';

  export type TradeKind = 'land' | 'sea';
  export const tradeKindOf = (type: string): TradeKind | null => UNITS[type]?.trader ?? null;

  /** Ponto de comércio do tipo pedido: vivo, pronto e de um jogador ainda na partida. */
  export function isTradePost(state: GameState, b: Building | undefined, kind: TradeKind): b is Building {
    return !!b && !b.dead && b.complete && BUILDINGS[b.type].tradeRoute === kind && state.players[b.owner]?.alive === true;
  }
  export function centerDist(a: Building, b: Building): number { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  /** Dá para chegar ao edifício a partir do tile (sx, sy)? Terra: regiões conexas. Mar: gancho da E4 (Fase F). */
  export function reachableFor(state: GameState, kind: TradeKind, sx: number, sy: number, b: Building): boolean {
    if (kind === 'land') return rectReachable(state.map, sx, sy, b.tx, b.ty, b.w, b.h, true);
    return false;   // E4/Fase F: troque pela alcançabilidade da camada de água
  }

  /** Ponto de comércio PRÓPRIO mais perto de (x, y) pela borda, sem `exclude`. Empate: mais perto do centro do mapa,
   *  depois frameCompare no referencial de (x, y) (nunca a ordem do Map). */
  export function nearestOwnPost(state: GameState, owner: number, kind: TradeKind, x: number, y: number, exclude = -1): Building | null {
    let best: Building | null = null, bestD = Infinity, bestC = Infinity;
    const f = centerFrame(state.map, x, y);
    for (const b of state.buildings.values()) {
      if (b.owner !== owner || b.id === exclude || !isTradePost(state, b, kind)) continue;
      const d = distToRect(x, y, b.tx, b.ty, b.w, b.h), c = centerDist2(state.map, b.x, b.y);
      const tie = Math.abs(d - bestD) <= 1e-9;
      if (d < bestD - 1e-9 || (tie && (c < bestC || (c === bestC && best !== null && frameCompare(f, b.x - x, b.y - y, best.x - x, best.y - y) < 0)))) { best = b; bestD = d; bestC = c; }
    }
    return best;
  }

  export interface RouteCheck { ok: boolean; reason?: string; home?: Building }
  /** A unidade pode fazer rota até `dest`? Devolve a casa (D3). Mesma regra no comando, no início da ordem e no HUD. */
  export function canRoute(state: GameState, u: Unit, dest: Building | undefined): RouteCheck {
    const kind = tradeKindOf(u.type);
    if (!kind) return { ok: false, reason: t('err.notTrader') };
    if (!isTradePost(state, dest, kind) || !isAlly(state, u.owner, dest.owner)) return { ok: false, reason: t(kind === 'sea' ? 'err.routeSeaTarget' : 'err.routeTarget') };
    const home = nearestOwnPost(state, u.owner, kind, u.x, u.y, dest.id);
    if (!home) return { ok: false, reason: t('err.routeNoHome') };
    if (centerDist(home, dest) < TRADE_MIN_DISTANCE) return { ok: false, reason: t('err.routeShort', { n: TRADE_MIN_DISTANCE }) };
    const sx = Math.floor(u.x), sy = Math.floor(u.y);
    if (!reachableFor(state, kind, sx, sy, home) || !reachableFor(state, kind, sx, sy, dest)) return { ok: false, reason: t('err.routeUnreachable') };
    return { ok: true, home };
  }

  /** Ouro de uma chegada (D4). `a` é a casa (sempre do dono), `b` o destino. */
  export function routeGold(state: GameState, owner: number, a: Building, b: Building, kind: TradeKind): number {
    const p = state.players[owner];
    const ally = a.owner !== owner || b.owner !== owner ? TRADE_ALLY_BONUS : 1;
    const sea = kind === 'sea' ? p.mods.player.seaTradeIncome : 1;
    return Math.round(TRADE_GOLD_PER_TILE[kind] * centerDist(a, b) * p.mods.player.tradeIncome * sea * p.mods.gather.gold * ally);
  }

  /** Melhor rota a partir de (x, y): casa = nearestOwnPost; destino = o ponto do time mais LONGE (≥ mínimo, alcançável).
   *  Empate: mais perto do centro do mapa, depois frameCompare no referencial da casa. Usada pela IA. */
  export function bestRoute(state: GameState, owner: number, kind: TradeKind, x: number, y: number): { home: Building; dest: Building } | null {
    const home = nearestOwnPost(state, owner, kind, x, y);
    if (!home) return null;
    const sx = Math.floor(x), sy = Math.floor(y);
    if (!reachableFor(state, kind, sx, sy, home)) return null;
    const f = centerFrame(state.map, home.x, home.y);
    let best: Building | null = null, bestD = -1, bestC = Infinity;
    for (const b of state.buildings.values()) {
      if (b.id === home.id || !isTradePost(state, b, kind) || !isAlly(state, owner, b.owner)) continue;
      const d = centerDist(home, b);
      if (d < TRADE_MIN_DISTANCE || !reachableFor(state, kind, sx, sy, b)) continue;
      const c = centerDist2(state.map, b.x, b.y), tie = Math.abs(d - bestD) <= 1e-9;
      if (d > bestD + 1e-9 || (tie && (c < bestC || (c === bestC && best !== null && frameCompare(f, b.x - home.x, b.y - home.y, best.x - home.x, best.y - home.y) < 0)))) { best = b; bestD = d; bestC = c; }
    }
    return best ? { home, dest: best } : null;
  }
  ```
  *Conferir:* `npm run -s typecheck`.
- [ ] **B2. Campos da unidade.** `src/core/sim/entities.ts`, literal de `spawnUnit`: acrescente
  `routeA: -1, routeB: -1, routeLeg: 0,` (por exemplo depois de `chargeUntil: 0,`). `src/core/serialize.ts`, no
  `deserialize`, no objeto de cada unidade (onde estão `chargeUntil: u.chargeUntil ?? 0`), acrescente
  `routeA: u.routeA ?? -1, routeB: u.routeB ?? -1, routeLeg: u.routeLeg ?? 0`.
- [ ] **B3. Sem guarnição.** `src/core/sim/entities.ts`, `canGarrison`: logo depois da 1ª linha de `return false`,
  acrescente `if (def.trader) return false;   // E5: caravana e navio mercante não entram em edifícios`.
- [ ] **B4. Movimento da rota (`src/core/sim/units.ts`).** A função `moveTowards` é privada deste arquivo: a rota
  **tem** de ficar aqui. Importe `isTradePost, canRoute, routeGold, reachableFor` de `'./trade'` e `isAlly` de
  `'./queries'` (já há import de `./queries`).
  1. Em `startOrder`, no `switch (order.type)`, acrescente antes do `}` final:
     ```ts
     case 'route': {
       const dest = state.buildings.get(order.targetId!);
       const r = canRoute(state, u, dest);
       if (!r.ok || !r.home || !dest) { finishOrder(state, u); return; }
       u.routeA = r.home.id; u.routeB = dest.id; u.routeLeg = 0; u.targetId = -1; u.state = 'route'; break;
     }
     ```
  2. Em `updateUnit`, no `switch (u.state)`, depois de `case 'build': …`, acrescente
     `case 'route': updateRoute(state, rt, u, dt, spd); return;`.
  3. Depois de `updateReturn`, acrescente:
     ```ts
     // ---------------- Rota comercial (E5) ----------------
     function updateRoute(state: GameState, rt: Runtime, u: Unit, dt: number, speed: number): void {
       const kind = UNITS[u.type].trader;
       const a = state.buildings.get(u.routeA), b = state.buildings.get(u.routeB);
       if (!kind || !isTradePost(state, a, kind) || !isTradePost(state, b, kind) || !isAlly(state, u.owner, a.owner) || !isAlly(state, u.owner, b.owner)) { endRoute(state, u, 'ev.routeLost'); return; }
       const to = u.routeLeg === 1 ? b : a;   // perna 0 e 2: rumo à casa; 1: rumo ao destino
       if (distToRect(u.x, u.y, to.tx, to.ty, to.w, to.h) > 0.9) {
         const r = moveTowards(state, rt, u, speed * dt, to.x, to.y, { tx: to.tx, ty: to.ty, w: to.w, h: to.h }, 0.9, true);
         // 'blocked' por multidão passa (o A* tenta de novo); sem caminho de verdade (outra região), a rota acaba
         if (r === 'blocked' && !reachableFor(state, kind, Math.floor(u.x), Math.floor(u.y), to)) endRoute(state, u, 'ev.routeBlocked');
         return;
       }
       if (u.routeLeg !== 0) {
         const g = routeGold(state, u.owner, a, b, kind);
         const p = state.players[u.owner];
         p.resources.gold += g; p.stats.gathered.gold += g;
       }
       u.routeLeg = u.routeLeg === 1 ? 2 : 1;
       u.path = null;
     }
     function endRoute(state: GameState, u: Unit, key: string): void {
       const p = state.players[u.owner];
       if (!p.isAI && !state.events.some((e) => e.type === 'routeStopped' && e.player === u.owner && state.tick - e.tick < 10 * TICK_RATE)) state.events.push({ tick: state.tick, type: 'routeStopped', player: u.owner, x: u.x, y: u.y, text: t(key) });
       u.routeA = -1; u.routeB = -1; u.routeLeg = 0;
       finishOrder(state, u);
     }
     ```
  **Não** pague na perna 0 (D3). **Não** use `u.carry`/`u.carryAmt` para a carga (o estado ocioso manda quem tem carga
  entregar).
- [ ] **B5. Validação (`src/core/sim/validate.ts`).** No `case 'attack': case 'gather': case 'pray': case 'repair':
  case 'garrison':`, acrescente `case 'route':` (o corpo é o mesmo: `ids` + `targetId` + `queue`).
- [ ] **B6. Comando (`src/core/sim/commands.ts`).** Importe `canRoute` de `'./trade'`. No `switch` de `applyCommand`,
  depois de `case 'garrison': {…}`, acrescente:
  ```ts
  case 'route': {
    // alvo: ponto de comércio pronto do próprio time; cada caravana/navio mercante confere a própria rota (casa, distância, caminho)
    const dest = state.buildings.get(cmd.targetId);
    if (!dest || dest.dead || !validOwner(state, dest.owner)) return { ok: false };
    const traders = ownedUnits(state, cmd.player, cmd.ids).filter((u) => !!UNITS[u.type].trader);
    if (traders.length === 0) return { ok: false, reason: t('err.notTrader') };
    let firstFail: CommandResult | null = null, any = false;
    for (const u of traders) {
      const r = canRoute(state, u, dest);
      if (r.ok) { giveOrder(state, u, { type: 'route', targetId: dest.id }, cmd.queue); any = true; } else if (!firstFail) firstFail = { ok: false, reason: r.reason };
    }
    return any ? { ok: true } : (firstFail ?? { ok: false });
  }
  ```
  *Conferir:* `npm run -s typecheck`.
- [ ] **B7. Ponto de encontro (`src/core/sim/buildings.ts`, `completeQueueItem`, case `'unit'`).** Logo depois de
  `if (b.rallyX >= 0) {`, antes de `const rallyTarget = …`, acrescente:
  ```ts
  if (def.trader) {   // E5: ponto de encontro num ponto de comércio = rota automática
    const tx = Math.floor(b.rallyX), ty = Math.floor(b.rallyY);
    const bid = tx >= 0 && ty >= 0 && tx < state.map.w && ty < state.map.h ? state.map.buildingAt[ty * state.map.w + tx] : -1;
    const post = bid !== -1 ? state.buildings.get(bid) : undefined;
    if (post && !post.dead && BUILDINGS[post.type].tradeRoute === def.trader) { giveOrder(state, u, { type: 'route', targetId: post.id }); break; }
  }
  ```
  (Só vira rota se o ponto de encontro estiver **num ponto de comércio do tipo certo**; em qualquer outro lugar — chão,
  casa, fazenda — o código de baixo manda a caravana andar até lá, como hoje. Se a rota não for válida — curta, sem casa,
  inimigo —, `startOrder` a termina e a caravana fica ociosa ao lado do Mercado. `BUILDINGS` já é importado no arquivo.)
- [ ] **B8. Relatório de dessincronia (`src/core/net/desync.ts`).** No laço das unidades, depois de `h = step(h, u.inside);`,
  acrescente `h = step(h, u.routeA); h = step(h, u.routeB); h = step(h, u.routeLeg);`.
- [ ] **B9. `SIM_VERSION`.** Some 1 ao valor anotado em 0.1 e acrescente ao comentário: `N = comércio (E5): caravanas
  com rotas automáticas, IA treina caravanas.`
  *Conferir (fim da Fase B):* `npm run -s typecheck` e `npx vitest run tests/command-fuzz.test.ts tests/determinism.test.ts`.

#### Fase C — IA

- [ ] **C1. `src/core/sim/ai.ts`, `manageCaravans` (nova).** Importe `CARAVAN_TARGET_AI` de `'../constants'`,
  `bestRoute` de `'./trade'` e `findSpawnTile` de `'./entities'` (se não estiver importado). Chame em `aiThink`, logo
  depois de `manageTrade(state, player, snap);`: `manageCaravans(state, player, snap);`. Função:
  ```ts
  /** E5: caravanas até a meta da Era, só com rota válida; cada caravana ociosa vai para a rota mais longa. Fora de cenário (D8). */
  function manageCaravans(state: GameState, player: Player, snap: Snapshot): void {
    if (state.scenario) return;
    const mine: Unit[] = [];
    for (const u of state.units.values()) if (u.owner === player.id && !u.dead && UNITS[u.type].trader === 'land') mine.push(u);
    for (const u of mine) {
      if (u.state !== 'idle' || u.order) continue;
      const r = bestRoute(state, player.id, 'land', u.x, u.y);
      if (r) applyCommand(state, { type: 'route', player: player.id, ids: [u.id], targetId: r.dest.id });
    }
    const market = (snap.byType.get('market') ?? []).find((b) => b.complete && b.queue.length < 2);
    if (!market) return;
    const queued = snap.buildings.reduce((n, b) => n + b.queue.filter((q) => q.kind === 'unit' && q.id === 'caravan').length, 0);
    if (mine.length + queued >= (CARAVAN_TARGET_AI[player.age] ?? 0) || savingForAge(state, player)) return;
    const spot = findSpawnTile(state, market);
    if (!bestRoute(state, player.id, 'land', spot.x, spot.y)) return;   // sem rota possível, não treina
    if (canTrain(state, player, market, 'caravan').ok) applyCommand(state, { type: 'train', player: player.id, buildingId: market.id, unit: 'caravan' });
  }
  ```
  Se `snap.buildings` não existir com esse nome no `Snapshot` da sua versão, use o que `manageMerchants` (E2) usa para
  contar a fila. **Não** escolha a rota pela ordem de `state.buildings` sem o desempate de `bestRoute`.
  *Conferir:* `npx vitest run tests/position-fairness.test.ts tests/movement-ai.test.ts` verde.
- [ ] **C2. `scripts/balance.ts`.** Na linha `console.log(\`${p.name.padEnd(10)} …`, acrescente antes do fim
  ` caravanas=${[...state.units.values()].filter((u) => u.owner === p.id && !u.dead && u.type === 'caravan').length}`.

#### Fase D — Interface

- [ ] **D1. `src/ui/hud.ts`, `issueChecked`.** Importe `canRoute` de `'../core/sim/trade'`. Depois da linha do
  `hireScholar`, acrescente:
  ```ts
  else if (cmd.type === 'route') { const u = cmd.ids.map((id) => s.state.units.get(id)).find((x) => x && UNITS[x.type].trader); if (u) check = canRoute(s.state, u, s.state.buildings.get(cmd.targetId)); }
  ```
- [ ] **D2. `src/ui/input.ts`, `contextCommand`.** Logo depois de `let cmd: Command | null = null;`, acrescente:
  ```ts
  // E5: só caravanas/navios mercantes selecionados + clique direito num ponto de comércio do time = rota
  if (units.every((u) => !!UNITS[u.type].trader) && target && target.kind === 'building' && BUILDINGS[target.type].tradeRoute && !isEnemy(s.state, s.local, target.owner)) {
    if (this.hud.issueChecked({ type: 'route', player: s.local, ids, targetId: target.id, queue })) {
      this.audio.ack('move', this.dominantClass(s));
      s.state.effects.push({ type: 'spawn', x, y, ttl: 8, total: 8, data: 'order' });
    }
    return;
  }
  ```
  (O `spawn` com `data: 'order'` é o marcador de clique que a interface já usa; não é tipo novo de efeito.)
- [ ] **D3. Cartão da caravana (`src/ui/hud.ts`, `unitCard`).** Importe `routeGold` de `'../core/sim/trade'`. Depois
  da linha `if (u.owner === s.local) stats.push(\`${t('sel.state')}…`, acrescente:
  ```ts
  if (u.owner === s.local && u.state === 'route') {
    const ra = s.state.buildings.get(u.routeA), rb = s.state.buildings.get(u.routeB), kind = UNITS[u.type].trader;
    if (ra && rb && kind) stats.push(`${t('sel.route')} <b>${esc(BUILDINGS[ra.type].name)} – ${esc(BUILDINGS[rb.type].name)}</b> · ${t('sel.routeGold', { g: routeGold(s.state, u.owner, ra, rb, kind) })}`);
  }
  ```
  Use o travessão "–" (U+2013). **Não** use "↔" (U+2194 tem apresentação de emoji em várias fontes, e nenhuma das
  regexes do projeto — `tests/hud-icons.test.ts`, `noEmoji` em `src/ui/html.ts`, `scripts/playtest-noemoji.mjs` — cobre a
  faixa das setas U+2190–21FF: um emoji colorido no cartão passaria sem nenhum teste avisar).
- [ ] **D4. Ajudas dos playtests.** **Não** crie nada em `src/main.ts`: `window.aoe.debugBuild(owner, type, tx, ty, frac = 1)`
  (põe um edifício pronto, ignora Era, território e limites; devolve `null` se o terreno/espaço não servir) e
  `window.aoe.debugSpawn(owner, type, x, y)` já existem.
- [ ] **D5. `scripts/playtest-trade.mjs` (novo).** Copie o cabeçalho de `scripts/playtest.mjs` (launch com
  `env: { LANG: 'pt_BR.UTF-8' }`, `executablePath`, `--use-gl=swiftshader`, coleta de `pageerror`/`console.error`).
  Roteiro:
  1. `#m-seed` = 7, `#m-start`, pausa (`window.aoe.session.paused = true`).
  2. `page.evaluate`: `p.age = 1`; recursos 2000; acha o Centro Cívico; `window.aoe.debugBuild(s.local, 'market', tc.tx + dx, tc.ty)`
     com `dx = tc.x < map.w / 2 ? 22 : -25` (se o retorno for `null`, tente `dy = ±6`);
     `const c = window.aoe.debugSpawn(s.local, 'caravan', tc.x + 3, tc.y + 3); s.select([c.id]);`.
  3. Clique direito no centro do Mercado (`window.aoe.renderer.cam.worldToScreen(m.x, m.y)`, `page.mouse.click(x, y, { button: 'right' })`).
  4. Despausa, `speed = 3`, espere 15 s reais; pausa.
  5. Confira e imprima: estado da caravana `'route'`, ouro final > inicial, o texto de `#selection` contém "Rota".
  6. Captura `docs/art/eras-e5-caravana.png`; imprima `errors: none` ou a lista.
  Saída esperada: `rota: ok`, `ouro: +N`, `cartão: ok`, `errors: none`.

#### Fase E — Testes da E5

- [ ] **T1. `tests/trade-e5.test.ts` (novo).** Estrutura (o `arena` é o de `tests/movement-ai.test.ts`: copie
  `clearRect` e `arena` com os imports deles — `idx` de `'../src/core/map/grid'`, `invalidateComponents` de
  `'../src/core/map/components'` e o tipo `GameState` —, e na cópia do `clearRect` **pule os tiles com
  `s.map.buildingAt[i] !== -1`**: o retângulo daqui inclui o Centro Cívico, e zerar `blocked` debaixo dele deixaria as
  unidades atravessarem o CC):
  ```ts
  import { describe, it, expect } from 'vitest';
  import { AGES, BUILDINGS, UNITS } from '../src/core/data';
  import { CARAVAN_TARGET_AI, MERCHANT_SHIP_TARGET_AI, RESOURCES, TICK_RATE, TRADE_MIN_DISTANCE } from '../src/core/constants';
  import { applyCommand } from '../src/core/sim/commands';
  import { buildingsOf, placeBuilding, spawnUnit } from '../src/core/sim/entities';
  import { routeGold, canRoute } from '../src/core/sim/trade';
  import { destroyBuilding } from '../src/core/sim/combat';
  import { serialize, deserialize } from '../src/core/serialize';
  import { addNode } from '../src/core/map/mapgen';
  import { idx } from '../src/core/map/grid';
  import { invalidateComponents } from '../src/core/map/components';
  import type { GameState } from '../src/core/types';
  import { t } from '../src/i18n';
  import { quickGame, run } from './helpers';
  // clearRect / arena copiados de tests/movement-ai.test.ts (clearRect pulando os tiles com edifício)
  function setup(dx: number) {
    const s = quickGame(); const p = s.players[0]; p.age = 1;
    const tc = buildingsOf(s, 0).find((b) => b.type === 'town_center')!;
    const sign = tc.x < s.map.w / 2 ? 1 : -1;
    arena(s, Math.min(tc.tx, tc.tx + sign * dx) - 2, tc.ty - 4, Math.max(tc.tx + 3, tc.tx + sign * dx + 3) + 2, tc.ty + 6);
    const market = placeBuilding(s, 0, 'market', tc.tx + sign * dx, tc.ty, true);
    const c = spawnUnit(s, 0, 'caravan', tc.x, tc.ty + 4.5);
    return { s, p, tc, market, c };
  }
  ```
  Casos (um `it` cada):
  1. **Dados:** `UNITS.caravan.trader === 'land'`, `building === 'market'`, `age === 1`; `BUILDINGS.market.trains`
     contém `'merchant'` e `'caravan'`; `town_center`/`market` com `tradeRoute === 'land'`;
     `CARAVAN_TARGET_AI.length === AGES.length` e `MERCHANT_SHIP_TARGET_AI.length === AGES.length`.
  2. **Rota rende ouro:** `setup(24)`; `applyCommand(s, { type: 'route', player: 0, ids: [c.id], targetId: market.id })`
     → `ok`; `c.state === 'route'`, `c.routeA === tc.id`, `c.routeB === market.id`, `c.routeLeg === 0`;
     `const g = routeGold(s, 0, tc, market, 'land')` > 0; `run(s, 70 * TICK_RATE)` → o ganho de ouro é ≥ `g` e múltiplo de `g`.
  3. **Recusas:** `setup(10)` → `reason` contém o texto de `err.routeShort`; um cidadão no lugar da caravana →
     `err.notTrader`; destino = edifício do jogador 1 (inimigo) → `ok: false`; destino = uma fazenda própria → `ok: false`.
  4. **Rota quebra:** caso 2 rodando 5 s, `destroyBuilding(s, market, -1)`, `run(s, 2 * TICK_RATE)` → `c.state === 'idle'`,
     `c.routeA === -1` e um evento `routeStopped` do jogador 0.
  5. **Aliado:** `quickGame` com `players` de time 0 e 0 (passe `players: [{…, team: 0}, {…, team: 0}]`); destino =
     Mercado do jogador 1 → `routeGold` = `round(base × 1.25)` onde `base` é o de um Mercado próprio na mesma posição.
  6. **Save:** com o caso 2 no meio da rota, `serialize(deserialize(serialize(s))) === serialize(s)`; apague
     `routeA/routeB/routeLeg` da unidade no JSON (`JSON.parse`, `delete`, `JSON.stringify`) e `deserialize` → `-1/-1/0`.
  7. **Mercador × caravana (D9):** ponha um raro com `addNode(s.map, 'wild_horses', x, y)` (de `'../src/core/map/mapgen'`;
     num tile livre da arena, fora da linha da rota) e mande `gather` da caravana nele → `c.state !== 'gather'` (ela não tem
     `canGather`); um Mercador (`spawnUnit(s, 0, 'merchant', …)`) manda `route` ao Mercado → `reason === t('err.notTrader')`.
  8. **IA (timeout 60 000):** `quickGame({}, true)`, os dois com `age = 1` e 5000 de **cada** recurso
     (`for (const r of RESOURCES) p.resources[r] = 5000`, senão `savingForAge` segura o treino); Mercado
     pronto do jogador 0 a 24 tiles do seu CC (`arena` + `placeBuilding`, como no `setup`); `run(s, 90 * TICK_RATE)` → o
     jogador 0 tem pelo menos 1 `caravan` e pelo menos uma em `'route'`. (Sem o Mercado posto pelo teste a IA quase nunca
     teria rota: ela ergue o Mercado a até ~16 tiles do CC — `maxR: 16` no `plan` —, e os centros raramente ficam a ≥ 16.)
- [ ] **T2. `tests/command-fuzz.test.ts`:** acrescente `'route'` à lista `TYPES` (linha ~29).
  *Conferir:* `npx vitest run tests/trade-e5.test.ts tests/command-fuzz.test.ts`.

#### Fase F — Navio mercante (exige a E4 — na ordem oficial ela já está pronta)

- [ ] **F0. Pré-condição.** `grep -n "transport_ship:" src/core/data/units.ts`, `grep -n "shipyard:" src/core/data/buildings.ts`
  e `grep -n "layer: Layer" src/core/map/components.ts` precisam achar o transporte, o Estaleiro e o `rectReachable` por
  camada da E4 (na ordem oficial, acham). **Se algum não achar, pule a Fase F inteira** e escreva no
  `docs/eras/PROGRESSO.md`: "E5: navio mercante pendente (depende da E4); `merchant_ship` reservado; `reachableFor('sea')`
  devolve false". Nada mais da E5 depende dela.
- [ ] **F1. Dados.** `merchant_ship` pela tabela "E5 — Navio mercante" (no bloco dos navios da E4, depois do
  `transport_ship`; **sem** `line`/`tier`: não é degrau de linha). Estaleiro (`shipyard`): `tradeRoute: 'sea'` e
  `'merchant_ship'` no fim do `trains`. EN em `EN_UNITS` (`name`, `plural` e `desc` da tabela). **Arte e ícone** (a
  única exceção desta etapa à regra "sem `art:hud`" do D25): nada em `alias.ts` — a E4 não deu alias a navio nenhum, o
  procedural `drawShip` lê `UNITS[type]` e já desenha o mercante; no `SHIP_ICONS` de `scripts/bake/hud/catalog.mjs`
  acrescente `merchant_ship: S({ kind: 'transport' })` e rode `npm run art:hud` (senão `tests/hud-icons.test.ts` acusa
  `unit/merchant_ship`); o filtro por `naval` que a E4 pôs em `tests/art-etapa6.test.ts` já o exclui do "tudo assado".
  `tests/unit-lines.test.ts` (o caso do Estaleiro que a E4 pôs): `trainChoices(…, 'shipyard')` passa a ter o
  `merchant_ship` no fim (sem linha, tecla `M`) e o `trains` do elenco clássico passa a ter 4 navios; ajuste só a
  asserção (a lista esperada), sem mudar a regra.
  *Conferir:* `npx vitest run tests/data.test.ts tests/hud-icons.test.ts tests/art-etapa6.test.ts tests/unit-lines.test.ts` (atalho `M` único no
  Estaleiro; as criaturas navais da E6, que vem depois, terão `god` e não contam na regra) e `npm run art:check`.
- [ ] **F2. Alcance no mar.** Em `src/core/sim/trade.ts`, `reachableFor`, troque `return false;` por
  `return rectReachable(state.map, sx, sy, b.tx, b.ty, b.w, b.h, true, 'naval');` (a E4 deu a `rectReachable` o parâmetro
  `layer`; o anel em volta do Estaleiro tem água). O movimento já funciona: `updateRoute` chama `moveTowards`, e a E4 pôs
  nele o ramo naval pela `layerOf(def)` (é o mesmo caminho que o barco de pesca usa para entregar no Estaleiro).
- [ ] **F3. IA.** Em `manageCaravans`, repita o bloco de treino para `'sea'`: `UNITS[u.type].trader === 'sea'`, o
  Estaleiro (`snap.byType.get('shipyard')`) no lugar do Mercado, `MERCHANT_SHIP_TARGET_AI`,
  `bestRoute(state, player.id, 'sea', …)`. **Não** mande navios para a rota de terra (filtre por `trader`). O `mine` da
  rota de terra também precisa filtrar `trader === 'land'` (já filtra). Espere pouco uso: a IA da E4 ergue um Estaleiro
  só quando há peixe ou em "modo ilha", e uma rota marítima pede **dois** Estaleiros do time a ≥ 16 tiles; a E5 **não**
  manda a IA erguer um 2º Estaleiro (fica para a E10, registre no `PROGRESSO.md`).
- [ ] **F4. Teste.** Em `tests/trade-e5.test.ts`, um caso com dois Estaleiros no mar de um mapa da E4 (copie a montagem
  do teste de pesca da E4): rota marítima rende `routeGold(..., 'sea')` e `seaTradeIncome` ×1,25 aumenta o valor.

#### Fase G — Verificação, documentação e commit da E5

- [ ] **G1.** Rode a seção "Verificação", itens 1–9, 11 e 12 (parte E5; o 10 é só da E7).
- [ ] **G2.** "Ao terminar", parte E5, e o commit da E5.

### Parte 2 — E7 (maravilhas)

#### Fase 0' — Preparação

- [ ] **0'.1.** `git status` limpo e a E5 commitada. `grep -n "tradeIncome" src/core/sim/modifiers.ts` acha o stat
  (E5). Anote o `SIM_VERSION`. Guarde `npm run smoke 20 42 > /tmp/e7-smoke-antes.txt` e
  `npm run balance 35 1,2,3 > /tmp/e7-balance-antes.txt`.
- [ ] **0'.2.** Confira se alguém já criou usos extras de poder: `grep -n "charges" src/core/types.ts src/core/sim/powers.ts`.
  (A E6 decidiu **não** criar — D3 dela —, então o normal é não achar e o H1/J7 criarem.) Se achar, **use o campo
  existente** no passo J7 (com a mesma semântica: usos extras restantes).

#### Fase H — Dados e tipos

- [ ] **H1. `src/core/types.ts`.**
  - `BuildingDef`: `wonderEffects?: Effect[];   // E7: efeitos da maravilha pronta (recomputeMods)`,
    `scenarioAge?: number;   // E7: Era de construção em cenário (as 3 maravilhas clássicas: 3)`,
    `navalPassable?: boolean;   // E7: navios atravessam a pegada (Canal de Corinto; camada naval da E4)`.
  - `GameConfig`: `wonderVictory?: WonderVictory; wonderPointsToWin?: number; allWonders?: boolean;   // E7 (D14–D16)`
    (importe o tipo `WonderVictory` de `'./constants'` na 1ª linha).
  - `Player`: `wonderHoldStart: number;   // E7: tick em que o time chegou à meta de pontos (-1 = abaixo)` e
    `respawns: { type: string; at: number }[];   // E7: heróis que renascem (Mausoléu)`.
  - `PowerState`: `{ id: string; used: boolean; charges?: number }` (usos extras restantes; pule se a E6 já criou).
  - `PlayerStat`: acrescente `| 'enemySpeed' | 'territoryRegen' | 'veteranRate' | 'studySlots' | 'coastSight'`.
- [ ] **H2. `src/core/constants.ts`:** cole o bloco "E7 — constantes".
- [ ] **H3. `src/core/sim/modifiers.ts`:** `PLAYER_STATS` + os 5; `defaultMods().player` +
  `enemySpeed: 1, territoryRegen: 0, veteranRate: 1, studySlots: 0, coastSight: 0`.
- [ ] **H4. `src/core/data/buildings.ts`.**
  1. Importe `Effect` (`import type { BuildingDef, Effect } from "../types";`).
  2. Cole o bloco "E7 — efeitos" antes de `export const BUILDINGS`.
  3. Nas 3 de hoje: `age` 1/1/2, `scenarioAge: 3`, `wonderEffects: WONDER_EFFECTS.<id>`, `desc` da tabela.
  4. As 17 novas, logo depois de `wonder_colossus`, no formato das de hoje. Exemplo (repita para cada linha da tabela):
     ```ts
     wonder_lion_gate: { id: 'wonder_lion_gate',
       name: 'Porta dos Leões de Micenas', icon: '🦁', cost: { food: 400, wood: 400, stone: 400, gold: 300, knowledge: 50 }, hp: 3000, w: 4, h: 4, buildTime: 180, armor: BARMOR,
       age: 0, wonder: true, limit: 'wonder', hotkey: 'M', wonderEffects: WONDER_EFFECTS.wonder_lion_gate,
       desc: 'Maravilha da Era I (1 ponto). Muralhas e portões +50% de vida; fronteiras +2.',
     },
     ```
     No Canal, acrescente `passable: true, navalPassable: true`.
  5. `BUILD_MENU`: as 17 ids logo depois de `'wonder_colossus'`, na mesma ordem.
  6. No fim do arquivo: `export const CLASSIC_WONDERS: readonly string[] = ['wonder_zeus', 'wonder_artemis', 'wonder_colossus'];`
     e, em `src/core/data/index.ts`, acrescente `CLASSIC_WONDERS, WONDER_EFFECTS` à linha `export { BUILDINGS, BUILD_MENU… } from './buildings';`
     (sem tirar o que as etapas anteriores puseram nela).
  *Conferir:* `npx vitest run tests/data.test.ts` verde (o atalho `M` repetido só vale para `wonder_*`).
- [ ] **H5. Arte provisória.** `src/render/art/alias.ts`, `BUILDING_ART_ALIAS`: as 17 entradas da coluna "alias de arte".
  *Conferir:* `npx vitest run tests/art-library.test.ts tests/art-manifest.test.ts tests/hud-icons.test.ts` verde (o
  teste de manifesto confere que a pegada do alias é 4×4).
- [ ] **H6. Textos.** `src/i18n/strings.ts`: as chaves da tabela "E7 — textos". `src/i18n/en-data.ts`: `EN_BUILDINGS`
  das 17 novas (name + desc) e as 3 descs novas. `src/game/achievements.ts`: textos de `win_wonder` (PT e EN).
  *Conferir:* `npx vitest run tests/i18n.test.ts tests/steam.test.ts`.

#### Fase I — Regras de maravilha no núcleo

- [ ] **I1. `src/core/sim/restrictions.ts`.** Importe `BUILDINGS` de `'../data'` e o tipo `GameConfig`. Acrescente:
  ```ts
  /** E7 (D14): as 20 maravilhas com as regras novas (únicas no mapa, várias por jogador, pontos)? Padrão: fora de cenário. */
  export function allWondersOn(config: GameConfig): boolean { return config.allWonders ?? !isScenarioConfig(config); }
  /** Era exigida para construir: em cenário, `scenarioAge` (as 3 maravilhas clássicas continuam na Era IV da campanha). */
  export function buildingAgeOf(config: GameConfig, type: string): number {
    const d = BUILDINGS[type];
    return !allWondersOn(config) && d.scenarioAge !== undefined ? d.scenarioAge : d.age;
  }
  ```
- [ ] **I2. `src/core/sim/entities.ts`, `buildingLimitOk`.** Importe `CLASSIC_WONDERS` de `'../data'` e `allWondersOn`
  de `'./restrictions'`. Troque o ramo inteiro `} else if (def.limit === 'wonder') { … }` por:
  ```ts
  } else if (def.limit === 'wonder') {
    if (!allWondersOn(state.config)) {   // regras clássicas (cenário): só as 3, uma por jogador, sem unicidade
      if (!CLASSIC_WONDERS.includes(type)) return { ok: false, reason: t('err.forbidden') };
      if (countBuildings(state, player.id, (b) => !!BUILDINGS[b.type].wonder) >= 1) return { ok: false, reason: t('err.oneWonder') };
    } else for (const b of state.buildings.values()) {   // única no mapa; uma obra por jogador
      if (b.dead || b.type !== type) continue;
      if (b.complete) return { ok: false, reason: t('err.wonderTaken', { name: def.name, player: state.players[b.owner].name }) };
      if (b.owner === player.id) return { ok: false, reason: t('err.wonderBuilding', { name: def.name }) };
    }
  }
  ```
- [ ] **I3. `canPlaceBuilding`** (mesmo arquivo): troque `if (def.age > player.age && !force) return { ok: false, reason: t('err.requiresAge', { age: AGES[def.age].name }) };`
  por `const reqAge = buildingAgeOf(state.config, type); if (reqAge > player.age && !force) return { ok: false, reason: t('err.requiresAge', { age: AGES[reqAge].name }) };`
  (importe `buildingAgeOf`).
- [ ] **I4. `src/core/sim/wonders.ts` (novo).**
  ```ts
  // Maravilhas (docs/ERAS.md §9; docs/eras/E5-E7-comercio-maravilhas.md): unicidade no mapa, pontos e vitória, e os efeitos
  // que um Effect não expressa (Delfos, Mausoléu, Trono). Determinístico: nada de Math.random/trigonometria; desempates
  // por tick e pontos, nunca pelo índice do jogador.
  import { DELPHI_ORACLE_EVERY, DELPHI_ORACLE_SECONDS, MAUSOLEUM_RESPAWN_SECONDS, TICK_RATE, WONDER_POINTS_HOLD_SECONDS, WONDER_POINTS_MAX_TARGET, WONDER_VICTORIES, WONDER_VICTORY_SECONDS, type WonderVictory } from '../constants';
  import { BUILDINGS, CLASSIC_WONDERS, MAX_AGE, UNITS } from '../data';
  import type { Building, GameConfig, GameState, Unit } from '../types';
  import { findSpawnTile, recomputePop, spawnUnit } from './entities';
  import { getBuildingStats } from './modifiers';
  import { refund } from './economy';
  import { allWondersOn, buildingAgeOf } from './restrictions';
  import { teamNames } from './modes';
  import { t } from '../../i18n';
  import * as combatNs from './combat';   // ciclo combat ↔ wonders: só usado dentro de funções

  export function wonderVictoryMode(config: GameConfig): WonderVictory {
    if (!allWondersOn(config)) return 'hold';   // cenário: a regra de hoje (o roteiro decide a vitória)
    return (WONDER_VICTORIES as string[]).includes(config.wonderVictory as string) ? config.wonderVictory! : 'points';
  }
  export function wonderPoints(type: string): number { const d = BUILDINGS[type]; return d?.wonder ? d.age + 1 : 0; }
  /** Pontos das maravilhas prontas dos jogadores vivos do time. */
  export function teamWonderPoints(state: GameState, team: number): number {
    let n = 0;
    for (const b of state.buildings.values()) {
      if (b.dead || !b.complete || !BUILDINGS[b.type].wonder) continue;
      const o = state.players[b.owner];
      if (o && o.alive && o.team === team) n += wonderPoints(b.type);
    }
    return n;
  }
  /** Meta (D15): config.wonderPointsToWin ou min(20, ceil(40% dos pontos até a Era final)) — conta inteira (×2/5). */
  export function wonderPointsTarget(state: GameState): number {
    const c = state.config.wonderPointsToWin;
    if (typeof c === 'number' && Number.isFinite(c) && c >= 1) return Math.floor(c);
    const maxEra = Math.max(0, Math.min(MAX_AGE, Math.floor(state.config.maxAge ?? MAX_AGE)));
    let sum = 0;
    for (const d of Object.values(BUILDINGS)) if (d.wonder && d.age <= maxEra) sum += d.age + 1;
    return Math.max(1, Math.min(WONDER_POINTS_MAX_TARGET, Math.ceil((sum * 2) / 5)));
  }
  /** Maravilha pronta e viva daquele tipo (de qualquer dono) ou null. */
  export function wonderTakenBy(state: GameState, type: string): Building | null {
    for (const b of state.buildings.values()) if (!b.dead && b.complete && b.type === type) return b;
    return null;
  }
  export function hasWonder(state: GameState, owner: number, type: string): boolean {
    for (const b of state.buildings.values()) if (!b.dead && b.complete && b.owner === owner && b.type === type) return true;
    return false;
  }
  /** O painel de construção e a tecla M mostram esta maravilha? (D22) */
  export function wonderListed(state: GameState, playerId: number, type: string): boolean {
    const d = BUILDINGS[type];
    if (!d?.wonder) return true;
    const p = state.players[playerId];
    if (!allWondersOn(state.config)) return CLASSIC_WONDERS.includes(type) && buildingAgeOf(state.config, type) <= p.age + 1;
    return d.age <= p.age && !wonderTakenBy(state, type);
  }

  /** Chamado por onBuildingComplete quando uma maravilha fica pronta (antes do recomputeMods). */
  export function onWonderComplete(state: GameState, b: Building): void {
    const def = BUILDINGS[b.type];
    const owner = state.players[b.owner];
    state.territoryDirty = true;   // fronteiras +N (Porta dos Leões, Colosso)
    if (!allWondersOn(state.config)) return;
    // D18: as obras dos outros desabam e devolvem o custo
    for (const x of state.buildings.values()) {
      if (x === b || x.dead || x.complete || x.type !== b.type) continue;
      const loser = state.players[x.owner];
      if (!x.unpaid) refund(loser, getBuildingStats(state, loser, x.type).cost, 1);
      combatNs.destroyBuilding(state, x, -1);
      if (!loser.isAI) state.events.push({ tick: state.tick, type: 'wonderRaceLost', player: x.owner, x: x.x, y: x.y, text: t('ev.wonderRaceLost', { player: owner.name, name: def.name }) });
    }
    if (b.type === 'wonder_olympus_throne') {   // D19: Trono do Olimpo
      for (const ps of owner.powers) { ps.used = false; ps.charges = (ps.charges ?? 0) + 1; }
      state.events.push({ tick: state.tick, type: 'throne', player: b.owner, x: b.x, y: b.y, text: t('ev.throne', { player: owner.name }) });
    }
  }

  /** killUnit: herói morto em combate com um Mausoléu pronto do dono entra na fila de renascimento. */
  export function queueHeroRespawn(state: GameState, u: Unit, killerOwner: number): void {
    const def = UNITS[u.type];
    if (!def.tags.includes('hero') || def.tags.includes('king') || killerOwner < 0 || killerOwner === u.owner) return;
    const p = state.players[u.owner];
    if (!p.alive || !hasWonder(state, u.owner, 'wonder_mausoleum') || p.respawns.some((r) => r.type === u.type)) return;
    p.respawns.push({ type: u.type, at: state.tick + MAUSOLEUM_RESPAWN_SECONDS * TICK_RATE });
  }

  function ownTemple(state: GameState, owner: number): Building | null {
    let best: Building | null = null;
    for (const b of state.buildings.values()) if (b.owner === owner && !b.dead && b.complete && BUILDINGS[b.type].worship && (!best || b.id < best.id)) best = b;
    return best;   // menor id: só os edifícios do próprio jogador, sem viés de posição
  }

  /** Uma vez por segundo (game.ts, logo depois de economySecond): contagens de vitória, Delfos e Mausoléu. */
  export function wonderSecond(state: GameState): void {
    const mode = wonderVictoryMode(state.config);
    if (mode === 'hold') {   // a regra de hoje: uma maravilha pronta há 6 min
      for (const b of state.buildings.values()) {
        if (b.dead || !b.complete || !BUILDINGS[b.type].wonder || b.wonderStart < 0) continue;
        const p = state.players[b.owner];
        if (p.wonderVictoryAt < 0 && state.tick - b.wonderStart >= WONDER_VICTORY_SECONDS * TICK_RATE) p.wonderVictoryAt = state.tick;
      }
    } else if (mode === 'points' && !state.scenario) {
      const target = wonderPointsTarget(state);
      const teams = [...new Set(state.players.map((p) => p.team))].sort((a, b) => a - b);
      for (const team of teams) {
        const members = state.players.filter((p) => p.team === team);
        const pts = teamWonderPoints(state, team);
        const holding = members.some((p) => p.wonderHoldStart >= 0);
        if (pts >= target && !holding) {
          for (const p of members) p.wonderHoldStart = state.tick;
          state.events.push({ tick: state.tick, type: 'wonderRace', player: members[0].id, text: t('ev.wonderRace', { players: teamNames(state, team), n: pts, s: WONDER_POINTS_HOLD_SECONDS }) });
        } else if (pts < target && holding) {
          for (const p of members) p.wonderHoldStart = -1;
          state.events.push({ tick: state.tick, type: 'wonderRaceStop', player: members[0].id, text: t('ev.wonderRaceStop', { players: teamNames(state, team) }) });
        }
      }
    }
    // Delfos: Oráculo grátis a cada DELPHI_ORACLE_EVERY s (exatamente uma chamada por período cai na janela de 1 s)
    const P = DELPHI_ORACLE_EVERY * TICK_RATE;
    for (const b of state.buildings.values()) {
      if (b.dead || !b.complete || b.type !== 'wonder_delphi' || b.wonderStart < 0) continue;
      const e = state.tick - b.wonderStart;
      if (e < P || e % P >= TICK_RATE) continue;
      const p = state.players[b.owner];
      p.revealUntil = Math.max(p.revealUntil, state.tick + DELPHI_ORACLE_SECONDS * TICK_RATE);
      if (!p.isAI) state.events.push({ tick: state.tick, type: 'oracleFree', player: p.id, text: t('ev.oracleFree', { s: DELPHI_ORACLE_SECONDS }) });
    }
    // Mausoléu: heróis que renascem (sem Templo, esperam; se já existe um vivo do tipo, a entrada sai)
    for (const p of state.players) {
      if (!p.alive || p.respawns.length === 0) continue;
      const keep: { type: string; at: number }[] = [];
      for (const r of p.respawns) {
        if (r.at > state.tick) { keep.push(r); continue; }
        const temple = ownTemple(state, p.id);
        if (!temple) { keep.push(r); continue; }
        let alive = false;
        for (const u of state.units.values()) if (u.owner === p.id && !u.dead && u.type === r.type) { alive = true; break; }
        if (alive) continue;
        const spot = findSpawnTile(state, temple);
        const h = spawnUnit(state, p.id, r.type, spot.x, spot.y);
        h.stance = 'aggressive';
        state.effects.push({ type: 'spawn', x: spot.x, y: spot.y, ttl: 12, total: 12 });
        if (!p.isAI) state.events.push({ tick: state.tick, type: 'heroReborn', player: p.id, x: spot.x, y: spot.y, text: t('ev.heroReborn', { name: UNITS[r.type].name }) });
      }
      p.respawns = keep;
      recomputePop(state, p);
    }
  }

  /** Time vencedor por maravilha agora, ou null (D17). Só fora de cenário (declareWinner). */
  export function wonderWinner(state: GameState): number | null {
    const mode = wonderVictoryMode(state.config);
    if (mode === 'off') return null;
    let bestTick = Infinity; let teams: number[] = [];
    if (mode === 'hold') {
      for (const p of state.players) {
        if (!p.alive || p.wonderVictoryAt < 0) continue;
        if (p.wonderVictoryAt < bestTick) { bestTick = p.wonderVictoryAt; teams = [p.team]; }
        else if (p.wonderVictoryAt === bestTick && !teams.includes(p.team)) teams.push(p.team);
      }
    } else {
      const target = wonderPointsTarget(state);
      for (const p of state.players) {
        if (!p.alive || p.wonderHoldStart < 0 || state.tick - p.wonderHoldStart < WONDER_POINTS_HOLD_SECONDS * TICK_RATE) continue;
        if (teamWonderPoints(state, p.team) < target) continue;
        if (p.wonderHoldStart < bestTick) { bestTick = p.wonderHoldStart; teams = [p.team]; }
        else if (p.wonderHoldStart === bestTick && !teams.includes(p.team)) teams.push(p.team);
      }
    }
    if (teams.length === 0) return null;
    if (teams.length === 1) return teams[0];
    const pts = teams.map((tm) => teamWonderPoints(state, tm));
    const max = Math.max(...pts);
    const top = teams.filter((_tm, i) => pts[i] === max);
    return top.length === 1 ? top[0] : null;   // empate total: ninguém vence neste segundo
  }
  ```
  (Se `teamNames` não estiver exportado de `src/core/sim/modes.ts`, ele está: `export function teamNames`.)
  *Conferir:* `npm run -s typecheck`.
- [ ] **I5. Ganchos em `entities.ts` e `combat.ts`.**
  - `src/core/sim/entities.ts`, `onBuildingComplete`: acrescente `import * as wondersNs from './wonders';` (perto do
    `import * as modsMod`) e, na linha `if (def.wonder) { const { recomputeMods, refreshMaxHp } = requireMods(); …`,
    chame `wondersNs.onWonderComplete(state, b);` **antes** do `recomputeMods`. Troque o texto do evento `'wonder'`:
    `t(state.scenario ? 'ev.wonderScenario' : 'ev.wonder', …)` passa a
    `t(state.scenario || wondersNs.wonderVictoryMode(state.config) === 'off' ? 'ev.wonderScenario' : wondersNs.wonderVictoryMode(state.config) === 'points' ? 'ev.wonderPoints' : 'ev.wonder', { player: player.name, name: def.name, pts: wondersNs.wonderPoints(b.type) })`.
  - `src/core/sim/combat.ts`, `destroyBuilding`: troque `if (def.territory) state.territoryDirty = true;` por
    `if (def.territory || def.wonder) state.territoryDirty = true;`.
  - `combat.ts`, `killUnit`: importe `queueHeroRespawn` de `'./wonders'` e chame-o logo depois da linha do evento
    `heroDied`: `queueHeroRespawn(state, u, killerOwner);`.
- [ ] **I6. `src/core/sim/modifiers.ts`, `recomputeMods`.** Troque o bloco `// Maravilhas concluídas` (os 3 `if`) por:
  ```ts
  // Maravilhas concluídas (efeitos nos dados: BuildingDef.wonderEffects)
  for (const b of state.buildings.values()) {
    if (b.owner !== player.id || !b.complete || b.dead) continue;
    const we = BUILDINGS[b.type].wonderEffects;
    if (we) effects.push(...we);
  }
  ```
  *Conferir:* `npx vitest run tests/movement-ai.test.ts` (o caso "bônus de vida da maravilha…" passa sem mudança).
- [ ] **I7. Tick (`src/core/sim/game.ts`).** Importe `wonderSecond` de `'./wonders'`. Troque
  `if (state.tick % TICK_RATE === 0) { economySecond(state); …` por `… { economySecond(state); wonderSecond(state); …`.
  Em `src/core/sim/economy.ts`, **apague** o bloco `if (def.wonder && b.wonderStart >= 0 && p.wonderVictoryAt < 0) { … }`
  (ele mudou para `wonderSecond`) e tire `WONDER_VICTORY_SECONDS` do import se sobrar sem uso.
- [ ] **I8. Vitória (`src/core/sim/victory.ts`).** Importe `wonderWinner, wonderVictoryMode, teamWonderPoints` de
  `'./wonders'`. Troque o laço final `for (const p of alive) if (p.wonderVictoryAt >= 0) { … }` por:
  ```ts
  const wt = wonderWinner(state);
  if (wt !== null) {
    const w = alive.find((p) => p.team === wt && !p.isAI) ?? alive.find((p) => p.team === wt);
    if (w) {
      for (const p of state.players) if (p.team === wt && p.wonderVictoryAt < 0) p.wonderVictoryAt = state.tick;   // conquista win_wonder
      state.gameOver = true; state.winner = w.id;
      const pts = wonderVictoryMode(state.config) === 'points';
      state.events.push({ tick: state.tick, type: 'victory', player: w.id, text: pts ? t('ev.victoryWonderPoints', { players: teamNames(state, wt), n: teamWonderPoints(state, wt) }) : t('ev.victoryWonder', { player: w.name }) });
    }
  }
  ```
  Ajuste o comentário do topo do arquivo: "conquista, Rei da Colina ou maravilha (pontos ou 6 minutos)".
- [ ] **I9. Estado do jogador.** `src/core/sim/game.ts`, literal do jogador em `createGame`: acrescente
  `wonderHoldStart: -1, respawns: [],` depois de `titanSpawned: false,`. `src/core/serialize.ts`, no `map` dos
  `players` do `deserialize`: acrescente `wonderHoldStart: p.wonderHoldStart ?? -1, respawns: Array.isArray(p.respawns) ? p.respawns : [],`.
  `src/core/net/desync.ts`, no laço dos jogadores: depois de `h = step(h, pw.used ? 1 : 0);` acrescente
  `h = step(h, pw.charges ?? 0);`, e depois de `h = step(h, p.titanSpawned ? 1 : 0);` acrescente
  `h = step(h, p.wonderHoldStart); h = step(h, p.respawns.length);`.
- [ ] **I10. `SIM_VERSION`** + 1, com a linha `N = maravilhas (E7): 20 maravilhas únicas no mapa, pontos de maravilha,
  IA disputa maravilhas.`
  *Conferir (fim da Fase I):* `npm run -s typecheck` e `npx vitest run tests/movement-ai.test.ts tests/scenario-gaps.test.ts tests/m6_estatua.test.ts tests/determinism.test.ts tests/command-fuzz.test.ts`.

#### Fase J — Efeitos que pedem código

- [ ] **J1. Labirinto (`enemySpeed`).** `src/core/sim/territory.ts`: importe `UNITS` de `'../data'`, `isEnemy` de
  `'./queries'` e o tipo `Unit`; acrescente:
  ```ts
  /** E7 (Labirinto): fator de velocidade de uma unidade dentro do território de um inimigo dela (1 = normal; Titãs ignoram). */
  export function enemyTerritorySpeed(state: GameState, u: Unit): number {
    const o = territoryOwnerAt(state, u.x, u.y);
    if (o < 0 || o === u.owner || !isEnemy(state, o, u.owner)) return 1;
    const m = state.players[o].mods.player.enemySpeed;
    return m < 1 && !UNITS[u.type].tags.includes('titan') ? m : 1;
  }
  ```
  `src/core/sim/units.ts`, `updateUnit`: troque
  `const spd = state.tick < u.buffUntil ? stats.speed * u.buffSpeed : stats.speed;` por
  `const spd = (state.tick < u.buffUntil ? stats.speed * u.buffSpeed : stats.speed) * enemyTerritorySpeed(state, u);`.
- [ ] **J2. Epidauro (`territoryRegen`).** `src/core/sim/economy.ts`, laço de regeneração e atrito: depois da linha
  `if (p.mods.player.regen > 0 && …)`, acrescente:
  ```ts
  const tr = p.mods.player.territoryRegen;
  if (tr > 0 && u.hp < u.maxHp && state.tick - u.lastDamageTick > 5 * TICK_RATE && territoryOwnerAt(state, u.x, u.y) === u.owner) u.hp = Math.min(u.maxHp, u.hp + tr);
  ```
- [ ] **J3. Estádio (`veteranRate`).** `src/core/sim/modifiers.ts`:
  `export function unitRank(state: GameState, u: Unit): number { return rankOf(u.kills * (state.players[u.owner]?.mods.player.veteranRate ?? 1)); }`.
  Troque `rankOf(u.kills)` por `unitRank(state, u)` em `unitMaxHp` (modifiers.ts), em `src/ui/hud.ts` (`unitCard`, duas
  vezes, com `s.state`) e em `src/render/renderer.ts` (linha ~736, com `state`). Em `src/core/sim/combat.ts`:
  `computeDamage` troca `rankOf(attacker.kills)` por `unitRank(state, attacker)`; em `killUnit`,
  `rankOf(killer.kills - 0)` e `rankOf(killer.kills)` (as duas) por `unitRank(state, killer)`. Tire `rankOf` dos imports
  que sobrarem sem uso. **Não** mude `u.kills` nem `VETERAN_KILLS`.
- [ ] **J4. Biblioteca de Alexandria (`studySlots`).** `src/core/sim/buildings.ts`:
  ```ts
  /** E7: quantos itens da fila andam juntos (Biblioteca de Alexandria = 2 nas Bibliotecas; resto = 1). */
  export function studySlotsOf(state: GameState, b: Building): number {
    return BUILDINGS[b.type].library ? 1 + Math.max(0, Math.floor(state.players[b.owner].mods.player.studySlots)) : 1;
  }
  ```
  e troque o bloco `// Fila de produção` de `updateBuilding` por:
  ```ts
  if (b.queue.length > 0 && state.tick >= b.disabledUntil) {
    const slots = Math.min(b.queue.length, studySlotsOf(state, b));
    for (let i = 0; i < slots; i++) b.queue[i].elapsed += dt;
    const done: QueueItem[] = [];
    for (let i = slots - 1; i >= 0; i--) if (b.queue[i].elapsed >= b.queue[i].total) done.unshift(b.queue.splice(i, 1)[0]);
    for (const item of done) completeQueueItem(state, b, item);
  }
  ```
  (Com 1 vaga é exatamente o comportamento de hoje, e o teste "um por vez" da E1 continua valendo sem a maravilha.)
  `library` é a flag da E1 na Biblioteca. HUD: em `buildingCard`, troque `i === 0 ?` (as duas ocorrências: barra e dica)
  por `i < slots ?`, com `const slots = studySlotsOf(s.state, b);` antes do `forEach` (importe `studySlotsOf` de
  `'../core/sim/buildings'`). Na árvore de estudos da E1 (`src/ui/studytree.ts`, `studyTreeModel`), o status `active`
  (com `progress`) vale só para o item de **índice 0** da fila (`queuedIn`); troque por "índice < `studySlotsOf(state, b)`"
  do edifício onde o item está (e o `progress` passa a ser o do próprio item, não o do item 0), senão o 2º estudo
  simultâneo aparece como "na fila" na árvore. `tests/studytree.test.ts` (da E1) continua verde: sem a maravilha, 1 vaga.
- [ ] **J5. Farol (`coastSight`).** `src/core/sim/fog.ts`: importe `TERRAIN` de `'../constants'` e o tipo `GameMap`;
  acrescente no topo `const coastCache = new WeakMap<GameMap, Int32Array>();` e a função
  ```ts
  const isWaterT = (t: number): boolean => t === TERRAIN.WATER || t === TERRAIN.DEEP;   // com a E4: isNavigableTerrain (src/core/map/naval.ts), que inclui o baixio
  /** Litoral que o Farol de Alexandria revela: tiles de água com um vizinho (4 lados) de terra. O terreno não muda em
   *  partida, então a lista vale para o mapa inteiro (cache por mapa, fora do save e do hash). */
  function coastTiles(map: GameMap): Int32Array {
    let c = coastCache.get(map);
    if (!c) {
      const out: number[] = [];
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
        const i = y * map.w + x;
        if (!isWaterT(map.terrain[i])) continue;
        if ((x > 0 && !isWaterT(map.terrain[i - 1])) || (x < map.w - 1 && !isWaterT(map.terrain[i + 1])) || (y > 0 && !isWaterT(map.terrain[i - map.w])) || (y < map.h - 1 && !isWaterT(map.terrain[i + map.w]))) out.push(i);
      }
      c = Int32Array.from(out); coastCache.set(map, c);
    }
    return c;
  }
  ```
  (Não use só `TERRAIN.WATER`: o gerador não garante que a água rasa seja um anel de 1 tile — um lago raso inteiro
  apareceria —, e com a E4 o mar aberto também é `WATER`.)
  Em `updateFog`, antes de `state.fogVersion++;` final:
  `if (state.players.some((q) => q.team === player.team && q.alive && q.mods.player.coastSight > 0)) for (const i of coastTiles(map)) vis[i] = 2;`.
- [ ] **J6. Mausoléu no treino.** `src/core/sim/commands.ts`, `canTrain`, dentro de `if (def.unique) {`, acrescente
  `if (player.respawns.some((r) => r.type === unit)) return { ok: false, reason: t('err.alreadyRespawning', { name: def.name }) };`.
- [ ] **J7. Trono do Olimpo e usos extras (`src/core/sim/powers.ts`).**
  ```ts
  /** O poder pode ser usado agora? (uso normal ou um uso extra do Trono do Olimpo) */
  export function powerReady(ps: { used: boolean; charges?: number }): boolean { return !ps.used || (ps.charges ?? 0) > 0; }
  ```
  Em `usePower`, troque `if (ps.used) return { ok: false, reason: t('err.powerUsed') };` por
  `if (!powerReady(ps)) return { ok: false, reason: t('err.powerUsed') };` e, no fim, `ps.used = true;` por
  `if (ps.used) ps.charges = Math.max(0, (ps.charges ?? 0) - 1); else ps.used = true;`.
  Troque `!p.used`/`!x.used`/`p.used` (disponibilidade) por `powerReady(...)` em `src/core/sim/ai.ts` (`managePowers`,
  `const avail = …`), `src/ui/gamepad.ts` (linha ~507) e `src/ui/hud.ts` (painel de poderes: o `if` de modo, a chave
  `key` com `${powerReady(x) ? 0 : 1}${x.charges ?? 0}`, a classe `used`, o texto e o `addEventListener`). No texto do
  poder, quando `(ps.charges ?? 0) > 0`, acrescente ` · ${t('power.charges', { n: ps.charges })}`. **Não** mexa em
  `src/core/scenario/testing.ts` (o `keepPowers` lê `used`, e o Trono não existe em cenário).
- [ ] **J8. Canal de Corinto.** Nada a fazer no núcleo além de `passable: true` (H4): a pegada não bloqueia tropas
  (`placeBuilding` não marca `blocked` em edifício `passable`). A passagem dos navios é a Fase M.
  *Conferir (fim da Fase J):* `npm run -s typecheck` e `npx vitest run tests/movement-ai.test.ts tests/sim.test.ts tests/economy-regressions.test.ts`.

#### Fase K — IA

- [ ] **K1. Escolha e plano (`src/core/sim/ai.ts`).** Importe `BUILD_MENU` de `'../data'` (se faltar),
  `buildingLimitOk` de `'./entities'`, `buildingAgeOf` de `'./restrictions'`. Acrescente:
  ```ts
  /** E7 (D23): maravilha a erguer fora de cenário — entre as disponíveis da Era mais alta, pela personalidade. */
  export function aiWonderChoice(state: GameState, player: Player): string | null {
    const cands = BUILD_MENU.filter((ty) => BUILDINGS[ty].wonder && BUILDINGS[ty].age <= player.age && buildingLimitOk(state, player, ty).ok)
      .sort((a, b) => BUILDINGS[b].age - BUILDINGS[a].age || (a < b ? -1 : a > b ? 1 : 0));   // nunca localeCompare
    return cands.length ? cands[player.ai!.personality % Math.min(3, cands.length)] : null;
  }
  ```
  No `plan` de `manageBuilding`, troque a linha da maravilha por:
  ```ts
  ...(state.scenario
    ? [{ type: 'wonder_' + wonderChoice(player), anchorX: tc.x, anchorY: tc.y, minR: 4, maxR: 14, cond: age >= 3 && countBuildings(state, player.id, (b) => !!BUILDINGS[b.type].wonder) === 0 && player.resources.gold > 1500 && player.resources.wood > 1500 }]
    : (() => {
        const w = aiWonderChoice(state, player);
        if (!w) return [];
        const cost = getBuildingStats(state, player, w).cost;
        const rich = Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, Math.ceil(v * 1.25)]));
        return [{ type: w, anchorX: tc.x, anchorY: tc.y, minR: 4, maxR: 14, cond: age >= 1 && !snap.underConstruction.some((b) => !!BUILDINGS[b.type].wonder) && canAfford(player, rich) }];
      })()),
  ```
  (A linha do cenário é a de hoje, sem mudança. `aiWonderChoice` é exportada só para o teste N1.18; o parâmetro do
  `filter` chama `ty`, não `t`, para não esconder o `t` do i18n importado no arquivo.) No laço `for (const p of plan)`,
  troque `def.age > age` por `buildingAgeOf(state.config, p.type) > age`.
- [ ] **K2. Ataque à maravilha em contagem.** Em `chooseAttackTarget`, logo no início, acrescente:
  ```ts
  if (!state.scenario) {   // E7: quem está na contagem de vitória por maravilha vira o alvo
    const fx0 = Math.floor(from.x), fy0 = Math.floor(from.y);
    const racing = (b: Building) => {
      if (!BUILDINGS[b.type].wonder || !b.complete || invulnerable(b)) return false;
      const o = state.players[b.owner];
      const counting = o.wonderHoldStart >= 0 || (b.wonderStart >= 0 && wonderVictoryMode(state.config) === 'hold');
      return counting && rectReachable(state.map, fx0, fy0, b.tx, b.ty, b.w, b.h, true);
    };
    const w = nearestEnemyBuilding(state, player.id, tc.x, tc.y, racing);
    if (w) return w;
  }
  ```
  (importe `wonderVictoryMode` de `'./wonders'`).
  *Conferir:* `npx vitest run tests/position-fairness.test.ts tests/movement-ai.test.ts tests/scenario-gaps.test.ts`.

#### Fase L — Interface

- [ ] **L1. Painel e tecla `M`.** `src/ui/hud.ts`, `refreshCommands`, laço `for (const type of BUILD_MENU)`: como 1ª
  linha do corpo, `if (!wonderListed(s.state, s.local, type)) continue;`; logo depois de `const def = BUILDINGS[type];`,
  `const reqAge = buildingAgeOf(s.state.config, type);` e troque **todas** as ocorrências de `def.age` do corpo do laço
  por `reqAge` (são 3: as duas da linha `if (def.age > p.age && def.age > p.age + 1) continue;` e a do `AGES[def.age]`
  da linha `cmd.requiresAge`). Faça o mesmo em `startPlacement` (`if (def.age > s.player.age) … AGES[def.age]`), senão o
  toast da Era fica errado em cenário. Na mesma função `refreshCommands`, no fim do template da `const key = …` (a
  chave de redesenho, que termina em `|${b?.scholars}`), acrescente
  `|w${[...s.state.buildings.values()].filter((x) => x.complete && BUILDINGS[x.type].wonder).length}`: sem isso o painel
  não se redesenha quando **outro** jogador conclui uma maravilha (a chave só olha o que é seu).
  `src/ui/input.ts`, no ciclo da tecla de construção, o bloco que começa em `const cands = (BUILD_HOTKEYS[keyU] ?? '')…`
  (com o filtro de Era que a E2 pôs: `const age = …; const avail = cands.filter(…); const pool = …`) passa a ser:
  ```ts
  const cands = (BUILD_HOTKEYS[keyU] ?? '').split(',').filter(Boolean).filter((ty) => wonderListed(s.state, s.local, ty));
  if (cands.length > 0) {
    // 'M' alterna entre maravilhas (só as listadas: da Era do jogador e ainda livres — D22); a Era vem de buildingAgeOf (cenário: scenarioAge)
    const age = s.state.players[s.local].age;
    const avail = cands.filter((c) => buildingAgeOf(s.state.config, c) <= age);
    const pool = avail.length ? avail : cands;
    const type = pool.length === 1 ? pool[0] : pool[(pool.indexOf(s.ui.placeType ?? '') + 1) % pool.length];
    this.hud.startPlacement(type); return;
  }
  ```
  (Se a E2 não tiver posto o filtro de Era, o bloco acima o traz.) Importe `wonderListed` de `'../core/sim/wonders'` e
  `buildingAgeOf` de `'../core/sim/restrictions'` nos dois arquivos; em `hud.ts`, `BUILDINGS` já é importado.
- [ ] **L2. Barra do topo.** `src/ui/hud.ts`, `refreshTop`: monte, antes de `this.modeEl.textContent = …`,
  ```ts
  let wonderTxt = '';
  if (!s.state.scenario && wonderVictoryMode(s.state.config) === 'points') {
    const target = wonderPointsTarget(s.state), mine = teamWonderPoints(s.state, p.team);
    const racer = s.state.players.find((q) => q.alive && q.wonderHoldStart >= 0);
    wonderTxt = racer ? t('top.wonderRace', { who: teamNames(s.state, racer.team), s: Math.max(0, Math.ceil(WONDER_POINTS_HOLD_SECONDS - (s.state.tick - racer.wonderHoldStart) / TICK_RATE)) }) : (mine > 0 || s.state.players.some((q) => q.team !== p.team && teamWonderPoints(s.state, q.team) > 0) ? t('top.wonders', { mine, target }) : '');
  }
  ```
  acrescente `+ (wonderTxt ? ' ' + wonderTxt : '')` ao fim do `textContent`, e no `dataset.tip`:
  `relics > 0 ? t('top.relicsTip') : wonderTxt ? t('top.wondersTip', { target: wonderPointsTarget(s.state), hold: WONDER_POINTS_HOLD_SECONDS }) : ''`.
  Imports: `wonderVictoryMode, wonderPointsTarget, teamWonderPoints` de `'../core/sim/wonders'` e
  `WONDER_POINTS_HOLD_SECONDS` no import de `'../core/constants'` que já existe (linha 3). `teamNames` e `TICK_RATE` **já
  são importados** em `hud.ts` — não repita o import (o tsc acusa "Duplicate identifier").
- [ ] **L3. Cartão da maravilha.** `buildingCard`: troque a condição da linha `sel.victoryIn` por
  `def.wonder && b.complete && b.wonderStart >= 0 && !s.state.scenario && wonderVictoryMode(s.state.config) === 'hold'`,
  e acrescente depois `if (def.wonder && !s.state.scenario && wonderVictoryMode(s.state.config) === 'points') stats.push(\`${t('sel.wonderPoints')} <b>${wonderPoints(b.type)}</b>\`);`
  (importe `wonderPoints` junto com os do L2).
  O evento `'wonderRace'`/`'wonderRaceStop'` é de todos: em `drainEvents`, acrescente os dois à lista `global`.
- [ ] **L4. Opção na partida rápida e no lobby.**
  - `src/ui/menu.ts`: acrescente `WONDER_VICTORIES` e `type WonderVictory` ao import de `'../core/constants'` (linha 2).
    Partida rápida: depois do `<select id="m-mode">…</select>` (e dos seletores de Era da E1),
    acrescente `<label>${t('main.wonderVictory')}</label><select id="m-wonder">${WONDER_VICTORIES.map((w) => \`<option value="${w}" ${(saved.wonderVictory ?? 'points') === w ? 'selected' : ''}>${t(\`wv.${w}\`)}</option>\`).join('')}</select>`;
    acrescente `wonderVictory?: string` ao tipo de `saved`; no `#m-start`, `const wonderVictory = q('#m-wonder').value as WonderVictory;`,
    grave-o no `aoe_setup` (no objeto que já é **mesclado** desde a E1, sempre por `storeSet`) e passe `wonderVictory` no
    objeto de `this.cb.onStart({...})`.
  - Lobby: `<select id="mp-wonder" ${host ? '' : 'disabled'}>` com `st.wonderVictory ?? 'points'`; em `settingsChanged`,
    `wonderVictory: q('#mp-wonder')!.value`; no `net.start` do ramo normal, `wonderVictory: (st.wonderVictory ?? 'points') as WonderVictory`
    (**não** nos ramos Horda e cenário embutido). Ligue `change` do `#mp-wonder` a `settingsChanged` como os outros selects.
  - `src/net/client.ts`: `wonderVictory?: string` em `LobbyState.settings`.
  - `server/relay.mjs`, `cleanSettings`: acrescente `'wonderVictory'` à lista de chaves string (o `WORD` aceita
    `points/hold/off`). **Sem isso o relay descarta a chave em silêncio** e os convidados não veem a mudança.
  - `tests/relay-anticheat.test.ts`: um `it` novo no modelo do que a E1 pôs para `startAge`/`endAge` — o anfitrião manda
    `settings` com `wonderVictory: 'hold'` → o `lobby` dos outros traz a chave; `wonderVictory: 'x y'` é ignorado. O
    `toEqual` da linha ~252 não muda (não manda a chave nova).
- [ ] **L5. Conquista.** Depois do H6, rode `npx tsx scripts/steam-achievements.ts` (regera
  `desktop/steam/achievements.{json,csv}`) e `npx tsx scripts/steam-achievements.ts --check` (ok).
- [ ] **L6. `scripts/balance.ts`:** acrescente ` maravilhas=${[...state.buildings.values()].filter((b) => b.owner === p.id && !b.dead && b.complete && BUILDINGS[b.type].wonder).length}`
  na linha de cada IA (importe `BUILDINGS`).
- [ ] **L7. `scripts/playtest-wonders.mjs` (novo).** Mesmo cabeçalho do `playtest-trade.mjs`. Roteiro:
  1. Partida rápida semente 7 (Era final padrão, a VIII: meta 20); pausa; `p.age = 7`; recursos 20 000 de cada;
     `window.aoe.debugBuild(s.local, 'wonder_parthenon', tx, ty)` e `window.aoe.debugBuild(s.local, 'wonder_great_library', tx2, ty2)`
     perto do CC (tente alguns deslocamentos até um não ser `null`; o `debugBuild` ignora Era e limites, mas confere o terreno).
  2. Seleciona o Partenon: `#selection` contém "Pontos de maravilha".
  3. `#top` mostra "Maravilhas 5/20".
  4. Seleciona 3 cidadãos pelo `page.evaluate` (`s.select(ids)` com os ids dos `villager` do jogador local; duplo clique
     depende de onde eles estão na tela) e aperta `m` 3 vezes (`page.keyboard.press('m')`, com 200 ms entre elas):
     `s.ui.placeType` muda entre maravilhas e **nunca** é `wonder_parthenon` nem `wonder_great_library` (já tomadas). `Escape`.
  5. Captura `docs/art/eras-e7-maravilhas.png`; `errors: none`.

#### Fase M — Ganchos navais (exige a E4 — na ordem oficial ela já está pronta)

- [ ] **M0.** Se a E4 não estiver pronta (`grep -rn "transport_ship" src/core/data/units.ts` vazio), pule e registre
  no `PROGRESSO.md`: "E7: Farol/Arsenal sem navios para afetar; Canal sem passagem naval (gancho `navalPassable`)".
- [ ] **M1. Tag dos navios.** `grep -n "'ship'" src/core/data/units.ts`: todos os navios da E4 têm a tag `'ship'`? Se a
  E4 usou outra tag comum a todos, troque `SHIP` em `WONDER_EFFECTS` (D21).
- [ ] **M2. Passagem do Canal.** A camada naval da E4 é `navalBlocked(map)` em `src/core/map/naval.ts` (cache por
  mapa: navegável = terreno de água **e** `nodeAt === -1` **e** `buildingAt === -1`). Ela só enxerga o `GameMap`, e o
  Canal fica sobre **terra** (o istmo), então:
  1. Em `naval.ts`, acrescente `const navalOpen = new WeakMap<GameMap, Set<number>>();` e
     `export function setNavalOpen(map: GameMap, tiles: number[], open: boolean): void` (cria/atualiza o `Set` do mapa
     com os índices `y * w + x` da pegada e chama `invalidateNaval(map)`); em `navalBlocked`, com
     `const open = navalOpen.get(map)?.has(i) ?? false`, a regra passa a ser
     `(isNavigableTerrain(t) || open) && map.nodeAt[i] === -1 && (map.buildingAt[i] === -1 || open) ? 0 : 1` (a mesma
     fórmula que o gancho "E7" do fim do guia da E4 propõe; um `Set` num `WeakMap` em vez de um campo novo no `GameMap`
     evita mexer nos literais de mapa, no editor e no save).
  2. Chame `setNavalOpen(state.map, <tiles da pegada>, true)` em `onWonderComplete` quando
     `BUILDINGS[b.type].navalPassable` — **antes** do `if (!allWondersOn(state.config)) return;` (um Canal pré-colocado
     num cenário também abre a passagem) —, e com `false` em `destroyBuilding` e `removeBuildingNow` para o mesmo caso. É
     obrigatório chamar `invalidateNaval` ali: edifício `passable` **não** passa por `invalidateComponents` (o
     `if (!def.passable) invalidateComponents(...)` pula), e o cache naval ficaria velho. Invalide também as regiões
     navais se a E4 as guardar à parte (o `invalidateComponents` da E4 apaga as duas; chame-o direto aqui).
  3. `deserialize` (`src/core/serialize.ts`): depois de reconstruir `buildingAt`, para cada edifício pronto com
     `navalPassable`, `setNavalOpen(map, …, true)`. Sem isso, um save carregado perde a passagem (o `Set` não vai para o
     save: é derivado, como a própria camada).
  **Não** escreva em `map.terrain` (o terreno não muda em partida; o renderizador e o `stateHash` dependem dele).
- [ ] **M3. Teste.** Num mapa da E4 com istmo de 4 tiles entre dois mares, um navio sem caminho
  (`rectReachable(…, 'naval')` falso até um alvo no outro mar) passa a ter caminho depois do Canal pronto sobre o istmo,
  continua tendo depois de `deserialize(serialize(s))`, e volta a não ter depois de `destroyBuilding`. Uma unidade de
  terra continua atravessando o istmo com o Canal de pé (`passable`).

#### Fase N — Testes da E7, verificação e commit

- [ ] **N1. `tests/wonders-e7.test.ts` (novo).** Use `quickGame`/`run` de `./helpers`. Para montar maravilhas, use
  `placeBuilding(s, owner, type, tx, ty, complete)` direto (não confere território, Era nem limite), num canto achado
  por `findFree` (copie-o de `tests/movement-ai.test.ts`: ele usa `canPlaceBuilding`, que confere o terreno —
  `placeBuilding` sozinho põe a pegada em cima de água ou de nós sem reclamar). Quem testa `canPlaceBuilding`/`canTrain`
  precisa pôr antes `p.age` na Era do item (senão o motivo é `err.requiresAge`, que vem primeiro). Um `it` por item:
  1. **Dados:** exatamente 20 `BUILDINGS` com `wonder`; ids = os da tabela; cada uma com `limit === 'wonder'`,
     `hotkey === 'M'`, `w === 4 && h === 4`, `wonderEffects` definido; contagem por Era = `[3, 4, 4, 3, 2, 1, 2, 1]`;
     todo `Effect` de unidade com `stat` em `{hp, attack, speed, range, los, trainTime, armor.hack, armor.pierce, armor.crush}`,
     de edifício em `{hp, attack, range, los}`, de jogador em `PLAYER_STATS`; todo id em `match.types` existe em `UNITS`
     ou `BUILDINGS`; as 17 novas estão em `BUILDING_ART_ALIAS` com um alias que é maravilha 4×4; as 20 estão em `BUILD_MENU`.
  2. **Meta:** para `maxAge` 0…7, `wonderPointsTarget(quickGame({ maxAge }))` = `[2, 5, 10, 14, 18, 20, 20, 20]`;
     com `wonderPointsToWin: 7` dá 7.
  3. **Única no mapa:** `p.age = 1` nos dois; jogador 0 conclui `wonder_parthenon` → `canPlaceBuilding` do jogador 1 para
     ela tem a `reason` de `err.wonderTaken`; o jogador 0 põe um alicerce **incompleto** de `wonder_epidaurus` → um 2º de
     `wonder_epidaurus` dele dá `err.wonderBuilding` (com a maravilha pronta, o laço do I2 acha a pronta primeiro e o motivo
     seria `err.wonderTaken`).
  4. **Corrida (D18):** alicerces incompletos de `wonder_parthenon` dos dois; conclua o do jogador 0
     (`onBuildingComplete`) → o do jogador 1 fica `dead` e os recursos dele sobem exatamente o custo.
  5. **Várias por jogador** fora de cenário: jogador 0 com Partenon e Epidauro prontos → os dois valem
     (`getBuildingStats`/`mods`).
  6. **Regras clássicas (D14):** `quickGame({ allWonders: false })` (o mesmo caminho que um cenário toma; não monte um
     cenário de verdade) e `p.age = 3` → `wonder_parthenon` recusada com `err.forbidden`; `buildingAgeOf(s.config, 'wonder_zeus') === 3`
     e, com `p.age = 2`, `wonder_zeus` recusada com `err.requiresAge`; com uma `wonder_zeus` pronta, `wonder_artemis` →
     `err.oneWonder`; com `allWonders` ausente e sem cenário, `allWondersOn(s.config) === true`.
  7. **Efeitos simples:** Porta dos Leões → `getBuildingStats(s, p, 'wall').hp === Math.round(BUILDINGS.wall.hp * 1.5)` e
     `p.mods.player.territory === 2`; Muralhas de Teodósio → torre `range` = `BUILDINGS.tower.range + 1`; Biblioteca de
     Alexandria → `techCost(p, 'civic1')` = o de antes × 0,75 (arredondado); Hagia Sophia → `p.mods.player.attrition === 0.4`.
  8. **Labirinto:** depois do `placeBuilding` do Labirinto, `recomputeTerritory(s)` (de `'../src/core/sim/territory'`; o
     território só é recalculado no tick); unidade do jogador 1 dentro do território do jogador 0 →
     `enemyTerritorySpeed === 0.75`; fora → 1; um `cronus` do jogador 1 no mesmo tile → 1.
  9. **Epidauro:** unidade do jogador 0 no próprio território com `hp = maxHp − 20` e `lastDamageTick` antigo →
     `run(s, 5 * TICK_RATE)` sobe ≈ 7,5 (±1,5).
  10. **Delfos:** pronto no tick T; `run` até T + 180 s + 1 s → `p.revealUntil > s.tick`; antes de 180 s, não.
  11. **Mausoléu (timeout 30 000):** `p.age = 3`; Templo e Mausoléu prontos; spawn de `heracles`; `killUnit(s, h, 1)` →
      `p.respawns.length === 1`; `canTrain(s, p, temple, 'heracles')` → `err.alreadyRespawning` (Héracles é da Era III:
      sem o `p.age` o motivo seria `err.requiresAge`); `run(s, 31 * TICK_RATE)` → um `heracles` vivo do jogador 0 e
      `respawns` vazio. Morte por `delete` (dono −1) **não** entra na fila.
  12. **Biblioteca de Alexandria (vagas):** Biblioteca (`academy`) pronta com 2 itens `tech` empurrados direto na fila
      (`b.queue.push({ kind: 'tech', id: 'civic1', elapsed: 0, total: 42 }, { kind: 'tech', id: 'science1', elapsed: 0, total: 35 })`); com a maravilha, os dois avançam
      juntos (`elapsed` dos dois > 0 depois de 1 s); sem ela, só o primeiro.
  13. **Estádio:** unidade militar com `kills = 2` → `unitRank === 1` com a maravilha e 0 sem.
  14. **Trono:** `p.powers = [{ id: 'bolt', used: true }]`; Trono pronto → `used === false`, `charges === 1`; com 3
      hoplitas do jogador 1 por perto, `usePower(s, p, 'bolt', undefined, undefined, h.id)` funciona em 2 deles e o 3º falha com `err.powerUsed`.
  15. **Vitória por pontos (timeout 30 000):** `quickGame({ wonderVictory: 'points', wonderPointsToWin: 5 })`; jogador 0
      com Partenon (2) + Biblioteca de Alexandria (3) prontos → `wonderHoldStart >= 0` no 1º segundo; `run(s, 121 * TICK_RATE)`
      → `s.gameOver` e `s.winner === 0`. Variante: destruir uma delas aos 60 s → sem vencedor aos 121 s e
      `wonderHoldStart === -1`.
  16. **Modo `hold` (timeout 30 000):** `quickGame({ wonderVictory: 'hold' })`, uma maravilha pronta no tick 0,
      `run(s, 361 * TICK_RATE)` → vencedor 0. **Modo `off`:** `quickGame({ wonderVictory: 'off' })`, o mesmo → `!s.gameOver`.
  17. **Desempate (D17):** `quickGame({ wonderPointsToWin: 2 })`; jogador 0 com `wonder_parthenon` (2) e jogador 1 com
      `wonder_epidaurus` (2) prontos; `p.wonderHoldStart = 0` nos dois e `s.tick = 121 * TICK_RATE` → `wonderWinner(s) === null`
      (nunca o jogador 0 por ser o primeiro da lista); troque a do jogador 1 por `wonder_colossus` (3) → `wonderWinner(s) === 1`.
  18. **IA (timeout 60 000):** `quickGame({}, true)`, jogador 0 com `age = 3` e 30 000 de cada recurso; `run(s, 120 * TICK_RATE)`
      → o jogador 0 tem uma maravilha (pronta ou em obra) com `age ≤ 3`. `aiWonderChoice` (exportada no K1) muda com a
      personalidade: com `p.age = 3`, `p.ai!.personality = 0` e depois `= 1` dão tipos diferentes.
  19. **Save:** com `respawns` e `wonderHoldStart` preenchidos e um poder com `charges`, `serialize(deserialize(serialize(s))) === serialize(s)`;
      sem os campos no JSON → `-1` e `[]`.
- [ ] **N2.** Rode a "Verificação" inteira (parte E7) e faça "Ao terminar", parte E7.

---

## Testes a escrever ou atualizar

| Arquivo | O que verifica |
|---|---|
| `tests/trade-e5.test.ts` (novo) | Fase E: dados da caravana, rota que rende `routeGold` por chegada, recusas (curta, não comerciante, inimigo, fazenda), rota quebrada, bônus de aliado, save com padrões, Mercador × caravana, IA treina e manda caravanas |
| `tests/wonders-e7.test.ts` (novo) | Fase N1: dados das 20, meta por Era final, unicidade, corrida com reembolso, várias por jogador, regras clássicas em cenário, efeitos simples, Labirinto, Epidauro, Delfos, Mausoléu, vagas da Biblioteca, Estádio, Trono, vitória por pontos/hold/off, desempate sem índice, IA, save |
| `tests/command-fuzz.test.ts` | `'route'` em `TYPES`; os invariantes (sem NaN, pop, fila ≤ 16, ida e volta do save) continuam verdes |
| `tests/movement-ai.test.ts` | "bônus de vida da maravilha…" continua verde sem mudança (o Templo de Ártemis agora é `age: 1`; o teste põe `p.age = 3`, que serve) |
| `tests/data.test.ts` | sem mudança: o `M` repetido continua só em `wonder_*`; `market.trains` com `M` e `C` únicos |
| `tests/i18n.test.ts`, `tests/hud-icons.test.ts`, `tests/art-*.test.ts` | sem mudança de código: passam com o EN novo e o alias |
| `tests/steam.test.ts` | continua verde com o texto novo de `win_wonder` (PT e EN); o `--check` do L5 confere a planilha |
| `tests/m6_estatua.test.ts`, `tests/missions.test.ts`, `tests/scenario-gaps.test.ts` | sem mudança: provam que o cenário ficou com as regras clássicas |
| `tests/position-fairness.test.ts` | sem mudança: as sondagens de simetria continuam 100 % |
| `tests/relay-anticheat.test.ts` | E7 (L4): `wonderVictory` passa pelo `cleanSettings` do relay; valor fora do `WORD` é descartado |

---

## Verificação

Rode na ordem. Cada item diz o que esperar.

1. `npm run -s typecheck`: sem saída, código 0.
2. Testes novos e tocados:
   - E5: `npx vitest run tests/trade-e5.test.ts tests/command-fuzz.test.ts tests/data.test.ts tests/i18n.test.ts tests/art-etapa6.test.ts tests/hud-icons.test.ts tests/determinism.test.ts tests/position-fairness.test.ts`
   - E7: `npx vitest run tests/wonders-e7.test.ts tests/movement-ai.test.ts tests/scenario-gaps.test.ts tests/m6_estatua.test.ts tests/sim.test.ts tests/economy-regressions.test.ts tests/art-library.test.ts tests/art-manifest.test.ts tests/steam.test.ts tests/command-fuzz.test.ts tests/determinism.test.ts tests/relay-anticheat.test.ts tests/i18n.test.ts tests/hud-icons.test.ts tests/data.test.ts tests/eras.test.ts tests/studytree.test.ts` (os dois últimos são da E1: a fila com N vagas não pode mudar o "um por vez" sem a maravilha)

   Esperado: tudo verde.
3. `npm test`: todos verdes. Se sair `Timeout calling "onTaskUpdate"` com 100 % dos testes passando (código 1), o
   culpado é um `it` longo (os de IA e de vitória): divida-o em `it`s menores com timeout explícito. Não ignore o código 1.
4. `npm run art:check`: ok (o alias não cria página; nenhum erro `hud`).
5. `npm run smoke 20 42` **duas vezes**: o mesmo "hash final" nas duas (determinismo). Ele muda em relação ao "antes"
   (esperado: `SIM_VERSION` subiu).
6. `npm run balance 35 1,2,3`:
   - nenhuma `PARADA` aos 5 min;
   - E5: as Eras não ficam **mais lentas** que no "antes" em mais de 1 min; em pelo menos 2 das 3 sementes alguma IA tem
     `caravanas=` ≥ 1 aos 35 min. Com um só Centro Cívico a IA quase nunca tem rota (ela põe o Mercado a até ~16 tiles do
     CC); as rotas dela vêm do 2º CC (expansão). Se nenhuma tiver: confira com um `console.log` temporário em
     `manageCaravans` se `bestRoute` devolve null; se for a distância, (1) no `plan` de `manageBuilding`, troque o `minR` do
     `market` por `state.scenario ? 3 : 8` (cenário igual) e rode de novo o item 9; (2) só se ainda faltar, baixe
     `TRADE_MIN_DISTANCE` para 14. Registre o que fez no `PROGRESSO.md`;
   - E7: pelo menos uma IA com `maravilhas=` ≥ 1 em alguma semente; nenhuma partida acaba por maravilha antes dos
     25 min (se acabar, suba `WONDER_POINTS_HOLD_SECONDS` para 180 e registre).

   Depois, `npm run balance 60 1,2,3` e anote no `PROGRESSO.md` as Eras, caravanas, maravilhas e o vencedor.
7. `npx tsx scripts/missions.ts`: as 12 missões × 3 dificuldades e as variantes OK. **Deve passar sem mexer no
   harness**: a E5 e a E7 não mudam nada em cenário (IA sem caravanas, regras clássicas de maravilha). Se uma janela
   sair, a causa é vazamento de regra nova para cenário: procure um `state.scenario`/`allWondersOn` esquecido. **Não**
   afrouxe `expect`.
8. `npx tsx scripts/horde.ts` e `npm run map:check`: ok, como antes.
9. Justiça de posição (critério do CLAUDE.md: nenhum lado com > 65 % das decididas + à frente, por posição e por índice):
   ```sh
   npx tsx scripts/maps/fairness.ts egeu 45 1-16 zeus --both --jobs 3
   npx tsx scripts/maps/fairness.ts estreito 45 1-16 zeus --both --jobs 3
   npx tsx scripts/maps/fairness.ts egeu 45 1-16 zeus --both --mirror-ai --jobs 3     # só na E7 (a escolha de maravilha vem da personalidade)
   ```
   Um "fora" isolado pede confirmação em 32 sementes (`101-132`). Registre os números no `PROGRESSO.md`.
10. `npx tsx scripts/steam-achievements.ts --check` (E7): ok.
11. `npm run build`, `npm run preview` em segundo plano (porta 4173) e:
    - E5: `node scripts/playtest-trade.mjs http://localhost:4173/` → `rota: ok`, `ouro: +N`, `cartão: ok`, `errors: none`;
    - E7: `node scripts/playtest-wonders.mjs http://localhost:4173/` → pontos no cartão e no topo, `M` sem as tomadas, `errors: none`;
    - `node scripts/playtest.mjs http://localhost:4173/ /tmp/pt` e `node scripts/playtest-modes.mjs http://localhost:4173/`: sem erros;
    - `node scripts/playtest-noemoji.mjs http://localhost:4173/`: sem emoji e sem ícone vazio;
    - E7, com `npm run relay` de pé: `node scripts/playtest-mp.mjs http://localhost:4173/` e
      `node scripts/playtest-rooms.mjs http://localhost:4173/` sem erros.
12. Olhe com a ferramenta Read `docs/art/eras-e5-caravana.png` e `docs/art/eras-e7-maravilhas.png`: a caravana aparece
    (silhueta de batedor com a cor do time), o cartão mostra "Rota … – … · N de ouro por viagem", a barra do topo mostra
    "Maravilhas 5/20" sem cortar o resto, o painel não estoura a grade.

---

## Critérios de pronto

**E5**
- [ ] Caravana treinada no Mercado (Era II, `C`); clique direito num CC/Mercado do time a ≥ 16 tiles cria a rota; ela
      vai e volta sozinha e cada chegada (depois da 1ª perna) rende `routeGold`.
- [ ] Recusas com motivo traduzido (curta, sem casa, sem caminho, alvo inválido, não comerciante); rota que perde um
      ponto para com aviso.
- [ ] IA (fora de cenário) treina caravanas até a meta da Era e as manda à rota mais longa; dentro de cenário, não.
- [ ] Mercador da E2 intacto; caravana não ocupa raro; Mercador não faz rota.
- [ ] Navio mercante feito (com a E4) **ou** registrado como pendente no `PROGRESSO.md`.
- [ ] `SIM_VERSION` +1; saves da E4 carregam (padrões no `deserialize`); fuzz, determinismo e missões verdes.

**E7**
- [ ] 20 maravilhas com os dados e efeitos das tabelas; únicas no mapa; obras perdidas desabam com reembolso; várias por
      jogador.
- [ ] Vitória por pontos (padrão, meta pela Era final, 120 s), "manter 6 min" e "desligada" na partida rápida e no lobby;
      desempate sem índice.
- [ ] Delfos, Mausoléu, Epidauro, Labirinto, Estádio, Biblioteca de Alexandria, Farol (litoral) e Trono funcionando;
      Canal passável (e navegável com a E4, ou pendente registrado).
- [ ] IA ergue e disputa maravilhas e ataca quem está na contagem; justiça de posição dentro do critério.
- [ ] Campanha intacta (`scripts/missions.ts` sem mexer no harness); textos PT/EN; nenhum emoji novo na interface.
- [ ] `SIM_VERSION` +1; `npm test` e `npm run art:check` verdes.

---

## Armadilhas

- **Determinismo.** Nada de `Math.random`, `Math.sin/cos/atan2/pow/exp/log/hypot` nem `Date.now` em `src/core`
  (`tests/determinism.test.ts`). Distância só por `Math.sqrt`. **Ordenação de strings com `<`/`>`, nunca
  `localeCompare`** (depende do idioma do sistema e dessincroniza a rede).
- **Ponto flutuante na meta.** `Math.ceil(35 * 0.4)` dá **15** (`14.000000000000002`). Use a conta inteira
  `Math.ceil((sum * 2) / 5)` do I4; o teste da meta pega isso.
- **Justiça de posição.** Toda escolha nova (casa da rota, destino, Templo do renascimento, alvo de ataque) desempata por
  distância ao centro do mapa e `frameCompare`, ou por id de edifícios **do próprio jogador**. Nunca pela ordem de
  `state.buildings` sem desempate nem pelo índice do jogador (o `victory.ts` antigo dava a vitória ao primeiro da lista).
  A escolha de maravilha usa a personalidade, que vem do índice: meça com `--mirror-ai`.
- **`SIM_VERSION`.** Suba em cada etapa (B9, I10). Sem isso, replays e o relay misturam partidas de regras diferentes.
- **Valores padrão no `deserialize`.** `routeA/routeB/routeLeg` (Unit) e `wonderHoldStart/respawns` (Player) precisam de
  padrão, senão um save da etapa anterior dá `undefined`/NaN. `charges` é opcional e se lê sempre com `?? 0`. Os
  PlayerStats novos entram em `defaultMods` (e no literal de `serialize.ts`, se ele ainda existir).
- **Não reaproveite campos.** A rota não usa `nodeId` (fazendas, templos, `nodeGatherers`), `targetId` nem `carry`
  (o estado ocioso manda quem tem carga entregar). O nome `trade` é a compra/venda do Mercado.
- **`moveTowards` é privada de `units.ts`.** Não copie o movimento para `trade.ts`; `updateRoute` mora em `units.ts`.
- **Ciclos de import.** `wonders.ts` ↔ `combat.ts` e `entities.ts` → `wonders.ts`: use o import por namespace
  (`import * as combatNs`, `import * as wondersNs`) e só chame dentro de funções, como o projeto já faz com
  `modsMod`/`modsModule`. Nada de usar um import desses no nível do módulo.
- **Regras novas vazando para cenário.** Toda regra da E7 passa por `allWondersOn`/`buildingAgeOf`, e toda IA nova
  checa `state.scenario`. Se `scripts/missions.ts` mudar de resultado, foi isso. **Não** edite os JSON de missão.
- **Corrida de maravilhas entre IAs espelhadas.** Com `--mirror-ai` (ou duas IAs de personalidade igual) as duas podem
  erguer a **mesma** maravilha; quem termina primeiro depende da ordem de atualização das unidades (alterna por tick), e a
  outra perde a obra (com reembolso). Se o item 9 der "fora" só com `--mirror-ai`, confira essa corrida antes de mexer em
  outra coisa (registre; a E10 decide se a IA evita a maravilha que um inimigo já começou).
- **Cenário com maravilha nova pré-colocada.** O editor lista as 20 maravilhas na paleta. Num cenário, uma maravilha
  nova posta pelo autor vale (os `wonderEffects` saem do `recomputeMods` sem olhar `allWondersOn`), mas ninguém pode
  **construir** outra (regra clássica: `err.forbidden`). É o comportamento esperado; não "conserte".
- **Efeito de edifício só por `types`.** `matches(..., [])` em `getBuildingStats` ignora tags: `match: { tags: [...] }`
  num `building` não pega nada, em silêncio. Edifício só aceita `hp/attack/range/los`.
- **Atalhos.** Nada de `A`, `R`, `U` (nem `H`, `P`, dígitos, que o `input.ts` consome antes). A caravana usa `C` no
  Mercado (o Mercador da E2 já usa `M`). Todas as maravilhas dividem o `M` (o teste só permite repetição em `wonder_*`).
- **Textos PT e EN.** Toda chave nova nas duas tabelas de `strings.ts`, com as mesmas `{variáveis}`; nomes e descs em
  `en-data.ts`. Nada de emoji nos textos de interface novos (senão é preciso `EMOJI_GLYPHS`); o "↔" conta como
  pictográfico (forma emoji em várias fontes) e nenhuma regex do projeto o pega — use "–".
- **Ícone do HUD.** Esta etapa não cria tecnologia, poder, recurso nem Era, então **não precisa** de `npm run art:hud`:
  caravana e maravilhas usam o ícone do alias. A exceção é o navio mercante (Fase F): navio não tem alias (E4, D22), e o
  ícone sai do `SHIP_ICONS` + `npm run art:hud`. Se você acrescentar qualquer tecnologia ou poder, aí também precisa de
  entrada no catálogo do atlas `hud` e do `art:hud`.
- **Arte provisória.** Só o alias da E2. **Não** crie manifesto (`art/manifest/*.json`) sem assar e fundir: o
  `tests/art-manifest.test.ts` falha com manifesto fora do índice. Não rode `npm run art:bake` sem `--out`.
- **Gravação.** O `aoe_setup` com `wonderVictory` vai por `storeSet` (nunca `localStorage.setItem`; `tests/steam.test.ts`
  acusa), mesclado com o que já existe (a E1 já mescla).
- **Relay.** Chave nova do lobby fora de `cleanSettings` some em silêncio. O relay de produção também precisa ser
  atualizado (pendência do dono no `PROGRESSO.md`).
- **VRAM.** O alias não carrega página nova; nada a medir além do `art:check`.
- **vitest.** `it` com mais de ~20 s numa máquina carregada dá `Timeout calling "onTaskUpdate"` e código de saída 1 com
  tudo passando: divida em `it`s menores e passe timeout explícito.

---

## Ao terminar

**Parte E5** (depois da Fase G):

1. `docs/eras/PROGRESSO.md` (crie se faltar, com `| Etapa | Estado | Data | Commit | Notas |`): linha "E5 — comércio",
   estado "feito", com as notas: comando `route`, `src/core/sim/trade.ts`, ouro = 0,5 × distância (+25 % aliado),
   mínimo 16 tiles, `CARAVAN_TARGET_AI`, navio mercante feito **ou** pendente (E4), Mercador da E2 conferido; os números
   do `balance 35` e `balance 60` antes × depois e a justiça de posição.
2. `docs/ROADMAP.md`, tabela "Cronograma a partir de 06/10/2026", semana 8: `✅ E5 (data)` (ou "E5 sem navio mercante"
   se a Fase F ficou pendente).
3. `CLAUDE.md`, "Memória do projeto", "Estado atual": uma frase — "E5 concluída: caravanas do Mercado (`caravan`, `C`)
   em rotas automáticas (`route`, `src/core/sim/trade.ts`, `BuildingDef.tradeRoute`), ouro pela distância, IA fora de
   cenário; navio mercante [feito/pendente da E4]". Em "Comandos", acrescente `scripts/playtest-trade.mjs` à lista dos
   playtests.
4. Commit em português, com o rodapé de atribuição exigido pela **sua** sessão, por exemplo:
   ```
   E5: comércio por caravanas (rotas automáticas, ouro pela distância, IA)

   - Caravana no Mercado (Era II, tecla C); comando route; casa = ponto próprio mais perto; mínimo 16 tiles
   - Ouro por chegada = 0,5 × distância × bônus (+25% aliado); rota para com aviso se um ponto cair
   - IA treina caravanas por Era e escolhe a rota mais longa (desempate invariante); nada em cenário
   - SIM_VERSION +1; testes tests/trade-e5.test.ts; playtest-trade

   <rodapé de atribuição da sessão>
   ```
   Faça push só para a branch da sessão (rotina do `docs/eras/LEIA-ME.md`); nunca para `main` sem pedido do dono.

**Parte E7** (depois da Fase N):

1. `docs/eras/PROGRESSO.md`: linha "E7 — maravilhas", com as notas: 20 maravilhas em `BUILDINGS` com `wonderEffects`,
   lógica em `src/core/sim/wonders.ts`, vitória por pontos (meta por Era final, 120 s) e as opções `hold`/`off`, regras
   clássicas em cenário (`allWondersOn`, `scenarioAge`), Fase M feita ou pendente (E4), `charges` (criado aqui ou da E6);
   números do balance e da justiça (inclusive `--mirror-ai`). Em "Pendências para o dono": aprovar as leituras da D19
   (Meteora, Epidauro, Mausoléu, Delfos, Trono) e a meta de 20 pontos / 120 s; atualizar o relay de produção
   (`wonderVictory`).
2. `docs/ROADMAP.md`, semanas 11–12: `✅ E7 (data)`; em "O que já existe hoje", troque "3 maravilhas" por "20 maravilhas".
3. `CLAUDE.md`, "Estado atual": "E7 concluída: 20 maravilhas únicas no mapa (`wonderEffects` nos dados, efeitos de código
   em `src/core/sim/wonders.ts`), vitória por pontos de maravilha (`config.wonderVictory` points/hold/off), regras
   clássicas em cenário (`allWondersOn`); arte provisória pelo alias". Em "Comandos": `scripts/playtest-wonders.mjs`.
4. `docs/DESIGN.md`: na parte de vitória, troque "manter uma maravilha por 6 minutos" pela regra nova (pontos = Era da
   maravilha; meta e 120 s; 6 minutos como opção).
5. Commit em português, com o rodapé da sua sessão, por exemplo:
   ```
   E7: as 20 maravilhas e a vitória por pontos de maravilha

   - 17 maravilhas novas (Eras I–VIII) + as 3 de hoje nas Eras da ERAS.md §9; efeitos nos dados (wonderEffects)
   - Únicas no mapa; obras perdidas desabam com reembolso; várias por jogador
   - Vitória por pontos (meta pela Era final, 120 s) com as opções manter 6 min e desligada (partida rápida e lobby)
   - Delfos, Mausoléu, Epidauro, Labirinto, Estádio, Biblioteca de Alexandria, Farol e Trono em src/core/sim/wonders.ts
   - IA ergue, disputa e ataca maravilhas; cenário com as regras clássicas; SIM_VERSION +1

   <rodapé de atribuição da sessão>
   ```

Ganchos para as etapas seguintes (não implemente agora):

- **E4:** na ordem oficial ela vem antes; se a Fase F (navio mercante) ou a M (tag `ship`, passagem do Canal) ficou
  pendente por algum motivo, ela entra logo que a E4 estiver pronta.
- **E6** (vem depois, na ordem oficial): ela usa `PowerState.charges` e `powerReady` daqui; poderes novos entram no
  `switch` de `usePower` sem tocar no consumo de `charges`, e o Trono recarrega também os poderes dela.
- **E8:** arte própria da caravana, do navio mercante e das 17 maravilhas (saem do `alias.ts`); ícones próprios; o
  "+N ouro" na chegada da caravana é um **observador** do renderizador (troca de `routeLeg`, D31 e passo P6 da E8),
  sem tipo novo de efeito no núcleo (a E8 não muda o núcleo).
- **E9:** aba de maravilhas na enciclopédia (Era, pontos, efeito, dono atual); linha da rota no mapa.
- **E10:** `TRADE_GOLD_PER_TILE`, `TRADE_MIN_DISTANCE`, `CARAVAN_TARGET_AI`, a escolta das caravanas e a renda delas no
  `budgetOf` da IA; custos das maravilhas, meta de pontos e `WONDER_POINTS_HOLD_SECONDS` com partidas de 60 min.
