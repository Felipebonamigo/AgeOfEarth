# Expansão das Eras — progresso

Manual de operação: `docs/eras/LEIA-ME.md` (leia antes). Plano: `docs/ERAS.md`. Cronograma: `docs/ROADMAP.md`.

Caixas: `[ ]` a fazer · `[x]` feito · `[~]` bloqueado ou pulado (o motivo vai em **Notas → Bloqueios**).
Ordem de execução: E1, E2, E3, E4, E5 + E7, E6, E8, E9 + E10. Cada etapa lista os passos do guia dela, com o número do
passo como está no guia.

## Resumo

Estados: `pendente` · `em andamento` · `feito` · `feito com pendências` · `bloqueado`.

| Etapa | Estado | Data | Commit | Notas |
|---|---|---|---|---|
| E1 + painel/árvore (E9) | em andamento | | | |
| E2 | pendente | | | |
| E3 | pendente | | | |
| E4 | pendente | | | |
| E5 — comércio | pendente | | | |
| E7 — maravilhas | pendente | | | |
| E6 | pendente | | | |
| E8 | pendente | | | |
| E9 — interface | pendente | | | |
| E10 — balanceamento | pendente | | | |

---

## E1 — 8 Eras e Biblioteca (com o painel e a árvore da E9)

Guia: `docs/eras/E1-eras-biblioteca.md`

Bloco 0 — Preparação
- [x] 0.1 Conferir o ponto de partida (`SIM_VERSION = 3`, 5 Idades)
- [x] 0.2 Registrar o "antes" (balance 35, build, playtest)

Bloco A — Dados das Eras
- [x] A1 `ages.ts`: as 8 Eras e as constantes `ERA`, `ERA_TITANS`, `clampEra`…
- [x] A2 `data/index.ts`: reexportar as constantes novas
- [x] A3 Titãs e Portal dos Titãs na Era 7
- [x] A4 `techs.ts`: `ROMAN`, `LINE_LEVELS` e linhas com 8 níveis
- [x] A5 Biblioteca (`academy`) e descrições nos dados (faça antes o B1)
- [x] A6 `en-data.ts`: Eras, linhas, Biblioteca e perks em inglês
- [x] A7 `data.test.ts`: 8 Eras

Bloco B — Biblioteca no núcleo
- [x] B1 `types.ts`: `library`, `queueMax`, `perCity`, `visualEraMax`
- [x] B2 `constants.ts`: `DEFAULT_QUEUE_MAX`
- [x] B3 `commands.ts`: fila por edifício, `canHireScholar`, avanço de Era na Biblioteca
- [x] B4 `restrictions.ts`: `isScenarioConfig` e `endAgeReason`
- [x] B5 `entities.ts`: limite de uma Biblioteca por cidade
- [x] B6 `strings.ts`: chaves renomeadas e novas
- [x] B7 Testes do núcleo que avançavam no Centro Cívico

Bloco C — Era inicial, Era final e `visualEraMax`
- [x] C1 `game.ts`: `grantStartingEras` e Era inicial
- [x] C2 `schema.ts`: `visualEraMax` e stat `studies`
- [x] C3 `compile.ts`: `studies` e `visualEraMax`
- [x] C4 Testes de Era inicial/final e de cenário

Bloco D — IA
- [ ] D1 Tabelas da IA com 8 posições (exportadas)
- [ ] D2 `RESEARCH_PRIORITY` exportada, níveis 6–8 no fim
- [ ] D3 Plano de construção: Biblioteca na Era I, Portal, 2ª Biblioteca
- [ ] D4 `tryAdvanceAge` na Biblioteca
- [ ] D5 `budgetOf` genérico (todos os recursos)
- [ ] D6 `scripts/loadtest.ts`: Biblioteca e avanço nela
- [ ] D7 `SIM_VERSION = 4`
- [ ] D8 `position-fairness`: 33/11 e testes da IA

Bloco E — Save de versão antiga
- [ ] E1 `serialize.ts`: `SAVE_VERSION = 2` e `saveVersionOf`
- [ ] E2 `main.ts`: `hasSave`/`hasOldSave`/apagar save antigo
- [ ] E3 `menu.ts`: aviso e botão do save antigo

Bloco F — Campanha
- [ ] F1 Configs `maxAge 3`/`visualEraMax 2` nas missões
- [ ] F2 Textos "Idade/Academia" → "Era/Biblioteca" nas missões
- [ ] F3 Apagar as falas do Portal (m4, m6)
- [ ] F4 Prometeu por roteiro (m3, m8, m12) e harness
- [ ] F5 m1: dica da Biblioteca (TS e JSON)
- [ ] F6 Testes de campanha e `scripts/missions.ts`

Bloco G — Renderização, ícones e conquistas
- [ ] G1 `ageTier`/`visualEra` no renderizador
- [ ] G2 Ícones das 8 Eras (`AGE_ICONS` + `npm run art:hud`)
- [ ] G3 Conquistas (`titans` = Era 7) e planilha da Steam

Bloco H — Interface
- [ ] H1 Textos que mudam em `strings.ts`
- [ ] H2 `src/ui/studytree.ts` (novo)
- [ ] H3 CSS da árvore
- [ ] H4 `hud.ts`: painel da Biblioteca, árvore, menu, atalhos
- [ ] H5 `input.ts`: F3 e E
- [ ] H6 `src/ui/era-select.ts` (novo)
- [ ] H7 Partida rápida: seletores de Era
- [ ] H8 Lobby e relay: Era inicial/final
- [ ] H9 Editor (Testar): seletores de Era
- [ ] H10 Testes de interface
- [ ] H11 Playtests (`playtest.mjs` e `playtest-library.mjs`)

Bloco I — Ferramentas de medição
- [ ] I1 `scripts/maps/fairness.ts` com N Eras

Bloco J — Verificação e documentação
- [ ] J1 Seção "Verificação" inteira
- [ ] J2 Seção "Ao terminar"

---

## E2 — Pedra, petróleo e recursos raros

Guia: `docs/eras/E2-recursos.md`

Fase A — núcleo dos recursos
- [ ] 1 Pré-voo (E1 pronta) e linha de base
- [ ] 2 Recursos e constantes (`stone`, `oil`)
- [ ] 3 Save, hash e relatório de dessincronia
- [ ] 4 Cenários (stats e `give`)
- [ ] 5 Fuzz (`'marble'` como recurso inválido)
- [ ] 6 Nós novos (10 tipos)
- [ ] 7 Buscas e regra de quem trabalha cada nó (`canWorkNode`)
- [ ] 8 Coleta com a regra nova (Mercador)
- [ ] 9 Edifícios, unidade `merchant` e atalhos (`hotkeyGroup`)
- [ ] 10 Poço de Petróleo: colocação e extração
- [ ] 11 Raros e Mercador (`rares.ts`, renda por nó)
- [ ] 12 Pesquisas novas e custos de Era
- [ ] 13 Mercado (petróleo só da Era IV)
- [ ] 14 `SIM_VERSION` +1

Fase B — mapas e editor
- [ ] 15 Tabela de recursos por início
- [ ] 16 Editor (`isNodeType`, paleta, tabela) — antes do 18 e do 19
- [ ] 17 Gerador aleatório (`placeEraResources`)
- [ ] 18 Mapas oficiais (Estreito e Egeu)
- [ ] 19 Mapas fixos da campanha (pedra) e pedra inicial das missões

Fase C — IA
- [ ] 20 Economia da IA (pedra, petróleo, loadtest)
- [ ] 21 Construção da IA (Pedreira, poços, Refinaria)
- [ ] 22 Mercadores da IA (`manageMerchants`)

Fase D — interface, textos e arte provisória
- [ ] 23 Textos PT/EN
- [ ] 24 HUD (barra de 7 recursos, raros, mercado)
- [ ] 25 Arte provisória por alias (`src/render/art/alias.ts`)
- [ ] 26 Nós no renderizador (procedural)
- [ ] 27 Ícones do HUD (`res/stone`, `res/oil`) + `art:hud`

Fase E — testes, calibração e documentação
- [ ] 28 Teste novo `tests/resources-e2.test.ts`
- [ ] 29 Verificação completa
- [ ] 30 Campanha: harness com pedra e `scripts/missions.ts`
- [ ] 31 Documentação e commit ("Ao terminar")

---

## E3 — Linhas de unidade I–VIII com evolução na Biblioteca

Guia: `docs/eras/E3-linhas-de-unidade.md`

Bloco 0 — Preparação
- [ ] 0.1 Conferir as pré-condições (E1 e E2)
- [ ] 0.2 Registrar o "antes" (balance 60, missions, horde, smoke)

Bloco A — Tipos e dados
- [ ] A1 `types.ts`: `line`, `tier`, `lineOnly`, `attackInterval`, `evolve`, `unitLines`
- [ ] A2 `src/core/data/lines.ts` (novo)
- [ ] A3 `data/index.ts`: exportar `lines`
- [ ] A4 `units.ts`: `line`/`tier` nas 12 de hoje e as 41 novas
- [ ] A5 `techs.ts`: `evolutions()` (50 estudos)
- [ ] A6 `en-data.ts`: inglês das unidades, linhas e estudos
- [ ] A7 `i18n/index.ts`: `EN_LINES` no `setLocale`
- [ ] A8 `strings.ts`: 4 chaves novas
- [ ] A9 Testes de dados

Bloco B — Núcleo
- [ ] B1 `src/core/sim/lines.ts` (novo)
- [ ] B2 `commands.ts`: treino pela linha
- [ ] B3 `buildings.ts`: item resolvido ao nascer e `applyEvolution`
- [ ] B4 `helpers.ts`: `grantTech` transforma
- [ ] B5 `combat.ts`: `attackInterval`
- [ ] B6 `game.ts`: `grantStartingEvolutions`, kit e `evo=`
- [ ] B7 Cenário: `config.unitLines`
- [ ] B8 `SIM_VERSION` +1
- [ ] B9 `tests/unit-lines.test.ts` (dados e núcleo)

Bloco C — IA
- [ ] C1 Imports da IA
- [ ] C2 Treino do exército por `trainChoices`
- [ ] C3 Evoluções em `manageResearch`
- [ ] C4 Teste da IA e smoke

Bloco D — Renderização provisória
- [ ] D1 Alias das 41 unidades
- [ ] D2 `TextureCache.unit` desenha o alias
- [ ] D3 Efeito `evolve`
- [ ] D4 Projétil do sifão (`fireball`)
- [ ] D5 Testes de efeitos

Bloco E — Ícones do HUD
- [ ] E1 `catalog.mjs`: ícones `evo_<linha>`
- [ ] E2 `icons.ts`: `techIconName` para `evo_*`
- [ ] E3 Gerar o atlas (`art:hud`) e `art:check`

Bloco F — Interface
- [ ] F1 `hud.ts`: botões por linha, cartão, atalhos, fila
- [ ] F2 `input.ts`: atalho de treino por `trainChoices`
- [ ] F3 `studytree.ts`: uma linha da árvore por linha de unidade
- [ ] F4 Testes da interface

Bloco G — Playtest
- [ ] G1 `scripts/playtest-lines.mjs` (novo)
- [ ] G2 Rodar no build e olhar as 3 capturas

Bloco H — Verificação e documentação
- [ ] H1 Seção "Verificação" inteira
- [ ] H2 `docs/EDITOR.md`: `unitLines`
- [ ] H3 "Ao terminar"

---

## E4 — Naval

Guia: `docs/eras/E4-naval.md`

Bloco 0 — Preparação
- [ ] 01 Pré-voo (E1–E3 prontas)
- [ ] 02 Linha de base (smoke, balance, missions, fairness)

Bloco A — Terreno, camada naval e regiões
- [ ] A1 Constantes e tipos (baixio, nós de peixe, tipos de mapa)
- [ ] A2 `src/core/map/naval.ts` (novo)
- [ ] A3 `grid.ts` com camada
- [ ] A4 `pathfinding.ts` com camada
- [ ] A5 `components.ts`: regiões navais e `shoreOk`
- [ ] A6 Bloqueio terrestre pela regra única

Bloco B — Dados
- [ ] B1 Unidades (10 navios)
- [ ] B2 Linhas `fishing`, `transport`, `warship`
- [ ] B3 Estudos (`evolutions()` com linhas de tipo fixo) e pesquisas do Estaleiro
- [ ] B4 Estaleiro, Poseidon e `rare_fish`
- [ ] B5 Textos PT/EN
- [ ] B6 Testes da E3 que contam linhas, degraus e estudos

Bloco C — Núcleo
- [ ] C1 `src/core/sim/naval.ts` (novo)
- [ ] C2 `queries.ts` pela camada do nó
- [ ] C3 `entities.ts`: Estaleiro, spawn, guarnição
- [ ] C4 `completeQueueItem`: navio nasce na água
- [ ] C5 Movimento pela camada
- [ ] C6 `combat.ts`: navios, afundamento
- [ ] C7 Ataque entre meios
- [ ] C8 Coleta e entrega de navio
- [ ] C9 Ordens `embark`/`unload`
- [ ] C9b Barco de pesca não reza nem cultiva
- [ ] C10 `commands.ts`: `move` por camada, `embark`, `unload`
- [ ] C11 `restrictions.ts`: `navalOn`
- [ ] C12 Resto do núcleo (economia, poderes, createGame, debugSpawn…)

Bloco D — Mapas e editor
- [ ] D1 `generateMap`: Costeiro, Ilhas, Mediterrâneo
- [ ] D2 `placeNavalResources`
- [ ] D3 `fixed.ts`: validação e tabela por início
- [ ] D4 Egeu navegável
- [ ] D5 `mapcheck` e `export-map`
- [ ] D6 Editor — terreno
- [ ] D7 Editor — painel e tipos
- [ ] D8 Renderizador do editor (sobreposição do mar)
- [ ] D9 `docs/EDITOR.md`

Bloco E — IA naval
- [ ] E1 Snapshot (`ships`) e evoluções navais só com Estaleiro
- [ ] E2 Guardas no treino e no exército
- [ ] E3 Funções (`manageNavy`, `manageInvasion`, modo ilha)

Bloco F — Renderização, áudio, interface e ícones
- [ ] F1 Terreno (baixio)
- [ ] F2 Nós (peixe, atum)
- [ ] F3 Navio procedural (`drawShip`)
- [ ] F4 Efeitos (esteira)
- [ ] F5 Áudio
- [ ] F6 Interface (carga, desembarque)
- [ ] F7 Ícones (`SHIP_ICONS` + `art:hud`)
- [ ] F8 Testes de arte (navios fora do "tudo assado")

Bloco G — Testes, playtest e calibração
- [ ] G1 `tests/naval.test.ts` (novo)
- [ ] G2 Fuzz com `embark`/`unload`
- [ ] G3 Testes que mudam (modes, editor, data, fairness)
- [ ] G4 `scripts/playtest-editor.mjs`
- [ ] G5 `scripts/playtest-naval.mjs` (novo)
- [ ] G6 Calibração

Bloco H — Verificação e documentação
- [ ] H1 Seção "Verificação" inteira
- [ ] H2 Seção "Ao terminar"

---

## E5 — Comércio por caravanas (Parte 1)

Guia: `docs/eras/E5-E7-comercio-maravilhas.md`

Fase 0 — Preparação
- [ ] 0.1 Pré-requisitos
- [ ] 0.2 Conferir o Mercador da E2
- [ ] 0.3 "Antes" (smoke e balance)

Fase A — Dados e tipos
- [ ] A1 `types.ts`: `trader`, `tradeRoute`, rota, comando `route`
- [ ] A2 Constantes do comércio
- [ ] A3 `modifiers.ts`: `tradeIncome`, `seaTradeIncome`
- [ ] A4 Dados: `caravan`, pontos de comércio
- [ ] A5 Arte provisória (alias `kataskopos`)
- [ ] A6 Textos PT/EN

Fase B — Núcleo
- [ ] B1 `src/core/sim/trade.ts` (novo)
- [ ] B2 Campos da unidade e `deserialize`
- [ ] B3 Caravana sem guarnição
- [ ] B4 Movimento da rota (`updateRoute`)
- [ ] B5 Validação do comando
- [ ] B6 Comando `route`
- [ ] B7 Ponto de encontro num ponto de comércio vira rota
- [ ] B8 Relatório de dessincronia
- [ ] B9 `SIM_VERSION` +1

Fase C — IA
- [ ] C1 `manageCaravans`
- [ ] C2 `scripts/balance.ts`: `caravanas=`

Fase D — Interface
- [ ] D1 `issueChecked` da rota
- [ ] D2 Clique direito de caravana
- [ ] D3 Cartão da caravana
- [ ] D4 Ganchos dos playtests (nada a criar)
- [ ] D5 `scripts/playtest-trade.mjs` (novo)

Fase E — Testes
- [ ] T1 `tests/trade-e5.test.ts` (novo)
- [ ] T2 Fuzz com `route`

Fase F — Navio mercante (com a E4)
- [ ] F0 Pré-condição (E4 pronta)
- [ ] F1 Dados do `merchant_ship` e ícone
- [ ] F2 Alcance no mar
- [ ] F3 IA com navios mercantes
- [ ] F4 Teste da rota marítima

Fase G — Verificação e commit
- [ ] G1 "Verificação" (itens da E5)
- [ ] G2 "Ao terminar" da E5 e commit

---

## E7 — As 20 maravilhas e a vitória por pontos (Parte 2)

Guia: `docs/eras/E5-E7-comercio-maravilhas.md`

Fase 0' — Preparação
- [ ] 0'.1 E5 commitada e "antes"
- [ ] 0'.2 Conferir `charges` (o normal é não achar)

Fase H — Dados e tipos
- [ ] H1 `types.ts`: efeitos, `scenarioAge`, vitória, `respawns`, `charges`
- [ ] H2 Constantes das maravilhas
- [ ] H3 `modifiers.ts`: 5 stats novos
- [ ] H4 `buildings.ts`: 20 maravilhas e `CLASSIC_WONDERS`
- [ ] H5 Arte provisória (17 aliases)
- [ ] H6 Textos PT/EN e conquista `win_wonder`

Fase I — Regras no núcleo
- [ ] I1 `restrictions.ts`: `allWondersOn`, `buildingAgeOf`
- [ ] I2 `buildingLimitOk`: única no mapa
- [ ] I3 `canPlaceBuilding` pela Era de cenário
- [ ] I4 `src/core/sim/wonders.ts` (novo)
- [ ] I5 Ganchos em `entities.ts` e `combat.ts`
- [ ] I6 `recomputeMods` com `wonderEffects`
- [ ] I7 Tick com `wonderSecond`
- [ ] I8 Vitória por maravilha (`wonderWinner`)
- [ ] I9 Estado do jogador e `deserialize`
- [ ] I10 `SIM_VERSION` +1

Fase J — Efeitos com código
- [ ] J1 Labirinto (`enemySpeed`)
- [ ] J2 Epidauro (`territoryRegen`)
- [ ] J3 Estádio (`veteranRate`)
- [ ] J4 Biblioteca de Alexandria (`studySlots`)
- [ ] J5 Farol (`coastSight`)
- [ ] J6 Mausoléu no treino
- [ ] J7 Trono do Olimpo e usos extras (`powerReady`)
- [ ] J8 Canal de Corinto (passável)

Fase K — IA
- [ ] K1 Escolha e plano das maravilhas
- [ ] K2 Ataque à maravilha em contagem

Fase L — Interface
- [ ] L1 Painel e tecla `M`
- [ ] L2 Barra do topo
- [ ] L3 Cartão da maravilha
- [ ] L4 Opção na partida rápida e no lobby (relay)
- [ ] L5 Conquista (planilha da Steam)
- [ ] L6 `scripts/balance.ts`: `maravilhas=`
- [ ] L7 `scripts/playtest-wonders.mjs` (novo)

Fase M — Ganchos navais (com a E4)
- [ ] M0 Conferir a E4
- [ ] M1 Tag dos navios
- [ ] M2 Passagem do Canal (`setNavalOpen`)
- [ ] M3 Teste do Canal

Fase N — Testes, verificação e commit
- [ ] N1 `tests/wonders-e7.test.ts` (novo)
- [ ] N2 "Verificação" e "Ao terminar" da E7

---

## E6 — Mitologia em todas as Eras

Guia: `docs/eras/E6-mitologia.md`

Bloco 0 — Preparação
- [ ] 0.1 Pré-condições (E1–E4; E5 e E7 já feitas)
- [ ] 0.2 O "antes" (missions, balance 35/60, smoke)

Bloco A — Tipos, dados e textos
- [ ] A1 `types.ts`: anfíbio, especiais, `group`, flags dos poderes, `eraMyth`
- [ ] A2 Constantes dos Titãs por Era
- [ ] A3 `ages.ts`: `minorGod` nas Eras V–VII
- [ ] A4 `gods.ts`: 9 poderes, 9 deuses, pares, bônus de pólvora
- [ ] A5 `units.ts`: 12 criaturas, `MYTH_UPGRADES`, Oceano anfíbio
- [ ] A6 `buildings.ts`: Templo e Estaleiro treinam as criaturas
- [ ] A7 `techs.ts`: 18 pesquisas e as Bênçãos
- [ ] A8 `data/index.ts`: exportações novas
- [ ] A9 `en-data.ts`: inglês
- [ ] A10 `strings.ts`: 10 chaves
- [ ] A11 `eraMyth` (restrições, schema, compile)
- [ ] A12 `data.test.ts`: 6 pares por deus maior

Bloco B — Camada anfíbia
- [ ] B1 `map/naval.ts`: camada `amphibious`
- [ ] B2 `grid.ts`
- [ ] B3 `pathfinding.ts`
- [ ] B4 `components.ts`
- [ ] B5 `sim/naval.ts`: `unitLayer`, `mediumOf`
- [ ] B6 Trocar `layerOf` por `unitLayer` no núcleo
- [ ] B7 Aproximação de ataque com anfíbio/voador
- [ ] B8 `canTarget` com anfíbio

Bloco C — Poderes e escala por Era
- [ ] C1 `src/core/sim/divine.ts` (novo)
- [ ] C2 `powers.ts`: assinatura e imports
- [ ] C3 Escala nos 12 poderes de hoje
- [ ] C4 Os 9 `case` novos
- [ ] C5 Carro do Sol em `updateTimedEffects`
- [ ] C6 Comando `power` com `ids`
- [ ] C7 Leituras por tick (Vendaval, Colheita, Pânico…)
- [ ] C8 Titãs reforçados por Era
- [ ] C9 `SIM_VERSION` +1

Bloco D — Criaturas, Talos e Bênçãos
- [ ] D1 `src/core/sim/myth.ts` (novo)
- [ ] D2 `combat.ts` (voador × voador, Vitória, Retribuição, dreno, renascer)
- [ ] D3 `commands.ts` (`godAllows`, Talos, Bênçãos)
- [ ] D4 `completeQueueItem` (Talos)

Bloco E — IA
- [ ] E1 `managePowers` com os 9 poderes
- [ ] E2 Bênçãos em `manageResearch`
- [ ] E3 Criaturas do Estaleiro (`trainSeaMyths`)
- [ ] E4 Templo (conferir, nada a mudar)

Bloco F — Efeitos, arte provisória e áudio
- [ ] F1 Alias das 12 criaturas
- [ ] F2 `fx/types.ts`: `divine` e 3 efeitos temporizados
- [ ] F3 `fx/handlers/divine.ts` (novo)
- [ ] F4 `fx/registry.ts`
- [ ] F5 Áudio (`cuesForEffect`)
- [ ] F6 `tests/fx-registry.test.ts`

Bloco G — Ícones do HUD
- [ ] G1 `catalog.mjs`: poderes, pesquisas, deuses
- [ ] G2 `icons.ts`: `techIconName` com `blessing`
- [ ] G3 `hud-gods.js`: 9 bustos
- [ ] G4 Iterar um retrato e gerar o atlas

Bloco H — Interface
- [ ] H1 `src/ui/train-hotkey.ts` (novo)
- [ ] H2 `input.ts`: Encruzilhada e tecla de treino
- [ ] H3 `hud.ts`: força da Era, Bênçãos, Talos

Bloco I — Testes e playtest
- [ ] I1 `tests/myth-eras.test.ts` (novo)
- [ ] I2 `scripts/playtest-myth.mjs` (novo)

Bloco J — Verificação e documentação
- [ ] J1 Seção "Verificação" inteira
- [ ] J2 Seção "Ao terminar"

---

## E8 — Arte por Era

Guia: `docs/eras/E8-arte-por-era.md`

Bloco 0 — Preparação
- [ ] 0.1 Conferir os pré-requisitos e a lista de alias
- [ ] 0.2 Fotografia do antes
- [ ] 0.3 Cache de referência dos edifícios
- [ ] 0.4 Ganchos `debugSetAge`/`debugData` em `main.ts`

Bloco A — Manifesto, bake e check por Era
- [ ] A1 Constantes e validação em `manifest.mjs`
- [ ] A2 Expansão das Eras (`expandEraVariants`)
- [ ] A3 Grupo nos quadros e no filtro
- [ ] A4 `bake.mjs` com os grupos por Era
- [ ] A5 `check.ts` por Era
- [ ] A6 `scripts/bake/cache-diff.mjs` (novo)
- [ ] A7 Centro Cívico por Era (prova com manifesto de prova)

Bloco B — Renderizador por Era
- [ ] B1 Tipos e funções puras
- [ ] B2 `src/render/art/era.ts` (novo)
- [ ] B3 `AtlasSource`/`ArtLibrary` com grupos sob demanda
- [ ] B4 `BuildingView` com `artId` e Era
- [ ] B5 `renderer.ts`: edifícios por Era
- [ ] B6 Fantasma, desabamento e escombros
- [ ] B7 Unidades por Era
- [ ] B8 Testes do bloco (`tests/art-eras.test.ts`)

Bloco C — Kit de Era no rig de edifícios
- [ ] C1 Materiais novos
- [ ] C2 `rigs/buildings-era.js` (novo)
- [ ] C3 `buildBuilding` com a Era
- [ ] C4 Telhado e coluna pelo kit
- [ ] C5 Prova byte a byte da base
- [ ] C6 Folha de prova do kit

Bloco R — Lote 1, edifícios I–IV
- [ ] R1 `eras` nos manifestos
- [ ] R2 Plantas próprias das Eras 0 e 3
- [ ] R3 Edifícios novos (Pedreira, Estaleiro, poços, Refinaria)
- [ ] R4 Bake do lote 1
- [ ] R5 Fusão
- [ ] R6 Capturas, testes e commit do bloco

Bloco U — Lote 1, unidades I–IV
- [ ] U1 Kit humano
- [ ] U2 Poses
- [ ] U3 Cerco do lote 1
- [ ] U4 Cavalo (barding, mula, hipocampo)
- [ ] U5 Rig `ship` (novo)
- [ ] U6 Manifestos do lote 1
- [ ] U7 Nós da E2 (props)
- [ ] U8 Bake e fusão do lote 1 de unidades
- [ ] U9 Alias (congelar o procedural)
- [ ] U10 Capturas, testes e commit

Bloco F — Lote 1, maravilhas I–IV
- [ ] F1 `rigs/buildings-wonders.js` (novo)
- [ ] F2 Manifestos das 11
- [ ] F3 Bake e fusão
- [ ] F4 Alias, capturas e commit

Bloco G — Lote 2, edifícios V–VIII
- [ ] G1 Plantas próprias das Eras 4, 6 e 7
- [ ] G2 Bake, fusão e prova
- [ ] G3 Capturas e commit

Bloco P — Efeitos
- [ ] P1 Atlas `fx` (bala, obus, granada, clarão)
- [ ] P2 Escolha do projétil
- [ ] P3 Clarão, fumaça de pólvora e explosão
- [ ] P4 Motor, vapor, esteira e chaminés
- [ ] P5 Poeira da troca de Era
- [ ] P6 "+N ouro" da caravana (observador)
- [ ] P7 Áudio e passos
- [ ] P8 Registro e testes
- [ ] P9 Poderes da E6 com arte própria
- [ ] P10 Capturas e commit

Bloco H — Lote 2, unidades V–VIII
- [ ] H1 Poses de arma de fogo
- [ ] H2 Cerco de pólvora
- [ ] H3 Rig `vehicle` (novo)
- [ ] H4 Manifestos do lote 2
- [ ] H5 Muzzles no índice
- [ ] H6 Bake e fusão do lote 2
- [ ] H7 Alias, capturas e commit

Bloco J — Criaturas da E6 e Talos
- [ ] J1 Rig `bird` (novo)
- [ ] J2 Kits das criaturas
- [ ] J3 Manifestos das 12
- [ ] J4 Bake e fusão
- [ ] J5 Alias, capturas e commit

Bloco K — Lote 2, maravilhas V–VIII
- [ ] K1 As 6 do lote 2 e os manifestos
- [ ] K2 Bake e fusão
- [ ] K3 Alias, capturas e commit

Bloco L — Ícones, alias e contagens
- [ ] L1 Ícones do HUD (degraus, Eras, poderes, retratos)
- [ ] L2 `icons.ts`: `techIconName` por degrau
- [ ] L3 Alias vazio
- [ ] L4 Testes de contagem

Bloco M — VRAM, desempenho, capturas e documentos
- [ ] M1 Orçamento (`art:check`)
- [ ] M2 `scripts/artages.mjs` completo
- [ ] M3 `scripts/artlines.mjs` (novo)
- [ ] M4 `scripts/artparade.mjs` com todos os tipos
- [ ] M5 Desempenho (`renderperf`)
- [ ] M6 Regressões visuais (`art:shot`/`art:diff`)
- [ ] M7 Documentos ("Ao terminar")

---

## E9 — Interface final (Parte 1)

Guia: `docs/eras/E9-E10-interface-balanceamento.md`

Bloco 0 — Preparação
- [ ] 0.1 Pré-condições
- [ ] 0.2 Base (smoke e enciclopédia de antes)

Bloco A — Enciclopédia
- [ ] A1 Textos `enc.*` e afins
- [ ] A2 `src/ui/encyclopedia.ts` (novo)
- [ ] A3 `hud.ts`: enciclopédia nova e filtro de Era
- [ ] A4 CSS
- [ ] A5 Testes (`tests/encyclopedia.test.ts`)

Bloco B — Ajuda, dicas, atalhos e partida
- [ ] B1 Textos de ajuda e dicas
- [ ] B2 `showHelp`
- [ ] B3 Tela de carregamento (18 dicas)
- [ ] B4 Atalhos (`U`)
- [ ] B5 Linha da partida no menu

Bloco C — Revisão dos textos PT/EN
- [ ] C1 `tests/i18n-eras.test.ts` (novo)
- [ ] C2 `scripts/i18n-review.ts` (novo)
- [ ] C3 Leitura da planilha inteira

Bloco D — Configuração no multiplayer
- [ ] D1 Relay com listas fechadas
- [ ] D2 Cliente (`RoomSummary`)
- [ ] D3 Lista de salas com as Eras
- [ ] D4 Teste do relay

Bloco E — Controle na árvore de estudos
- [ ] E1 `studyTreeHtml` com atributos de navegação
- [ ] E2 `renderStudyTree` com foco e pausa
- [ ] E3 `gamepad.ts`: `treeJump`, foco, rolagem
- [ ] E4 Testes

Bloco F — Playtests
- [ ] F1 Gancho `debugNames`
- [ ] F2 `scripts/playtest-eras.mjs` (novo)
- [ ] F3 `scripts/playtest.mjs`
- [ ] F4 `scripts/playtest-noemoji.mjs`
- [ ] F5 `scripts/playtest-i18n.mjs`
- [ ] F6 `scripts/playtest-gamepad.mjs`
- [ ] F7 `scripts/playtest-mp.mjs` e `playtest-rooms.mjs`

Bloco G — Verificação e commit
- [ ] G1 "Verificação" (itens da E9)
- [ ] G2 "Ao terminar" da E9 e commit

---

## E10 — Balanceamento, IA longa, justiça e desempenho (Parte 2)

Guia: `docs/eras/E9-E10-interface-balanceamento.md`

Bloco H — Base
- [ ] H0 Pré-condições
- [ ] H1 Medições de base (missions, smoke 60, perf)
- [ ] H2 Valores congelados (`frozen.json`)

Bloco I — Ferramentas de medição
- [ ] I1 `scripts/balance.ts` estendido
- [ ] I2 `scripts/perf.ts`
- [ ] I3 `renderperf`/`rendercpu` com `--start-age`
- [ ] I4 `scripts/profsum.mjs` (novo)
- [ ] I5 Base do balance (18 sementes × 60 min)

Bloco J — `AI_PACE`
- [ ] J1 `ai.ts`: `AI_PACE` e `aiPace`
- [ ] J2 Trocar cada leitura pelo campo
- [ ] J3 `techs.ts`: `LINE_LEVEL_COST_MULT`
- [ ] J4 `tests/ai-pace.test.ts` (novo)

Bloco K — Ajuste do ritmo
- [ ] K1 Ler a base e escolher a Era mais cedo fora
- [ ] K2 Rodadas da escada
- [ ] K3 Aceitação
- [ ] K4 `SIM_VERSION` +1

Bloco L — IA em partidas longas
- [ ] L1 Balance de 60 min nas 4 dificuldades
- [ ] L2 Corrigir PARADA/TRAVADA
- [ ] L3 Mapas com mar
- [ ] L4 Smoke de 60 min (2×)

Bloco M — Justiça de posição
- [ ] M1 `tests/position-fairness.test.ts`
- [ ] M2 Tabela E10-7 (fairness 60 min)
- [ ] M3 Se o índice sair do critério
- [ ] M4 Se só a posição de um mapa oficial sair

Bloco N — Desempenho
- [ ] N1 Simulação (`perf.ts`)
- [ ] N2 Rede (`loadtest`)
- [ ] N3 Renderizador (com a E8)

Bloco O — Campanha e Horda
- [ ] O1 `scripts/missions.ts` igual à base
- [ ] O2 Horda e testes das missões

Bloco P — Capturas, loja e documentos
- [ ] P1 `art:diff`
- [ ] P2 Cenas novas em `scripts/storeshots.mjs`
- [ ] P3 `docs/steam/LOJA.md` e `PRESSKIT.md`
- [ ] P4 "Verificação" (itens da E10) e "Ao terminar"

---

## Notas

## Notas

### Sessões
- 2026-10-09 · branch claude/ecstatic-albattani-atz7h5 · E1: feitos 0.1–0.2, A1–A7, B1–B2 (dados das Eras, tipos e constante); próximo: B3 (fila por edifício e avanço de Era na Biblioteca).

### E1 — medições
- Antes (balance 35 1,2,3, 09/10/2026): Clássica 5–7 min, Heroica 13–17, Mítica 19–23, Titãs 23–27 (semente 2: [0,5,17,20,27]; semente 3 chega só à Mítica/Heroica).
