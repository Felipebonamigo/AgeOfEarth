# E4 — Guerra no mar: água navegável, Estaleiro, pesca, transporte e navios I–VIII

- Estado: pendente · Pré-requisitos: **E1, E2 e E3 concluídas** (8 Eras e `isScenarioConfig` da E1; `stone`/`oil`, `RARE_NODES`, `RARE_SET`, `NOT_GATHERED`, `canWorkNode`, `src/core/data/rares.ts` e `src/render/art/alias.ts` da E2; `src/core/data/lines.ts`, `src/core/sim/lines.ts`, `trainChoices`, `evolutions()` e `UnitDef.line/tier/lineOnly/attackInterval` da E3) · Estimativa: 9 dias de trabalho do agente (camada naval e núcleo 3, mapas e editor 2, IA 2, renderização/interface/ícones 1, verificação e documentação 1)

> **Antes de começar:** leia `docs/eras/LEIA-ME.md` (rotina de cada sessão, regras, quando parar) e marque cada
> passo em `docs/eras/PROGRESSO.md`. Ordem das etapas: E1, E2, E3, E4, E5+E7, E6, E8, E9+E10. Onde este guia falar de
> commit ou de push, vale a rotina do LEIA-ME: um commit por passo e push só para a branch da sessão.

> Guia de execução para um agente sem o contexto da conversa que o escreveu. Siga os blocos na ordem (0, A … H), um
> commit por bloco ou um só no fim. Todo número de jogo daqui é **valor inicial para o balanceamento** (a E10 ajusta):
> copie, não recalcule. O código citado foi conferido em 06/10/2026, **antes** de E1–E3; elas mexem em volta (por exemplo
> a E3 troca o laço de treino da IA por `trainChoices`). Se um trecho não estiver exatamente como descrito, procure pelo
> nome da função e aplique a mesma mudança sobre o que E1–E3 deixaram; nunca desfaça nada delas. Números de linha são
> aproximados. **Se algum arquivo marcado "(da E1/E2/E3)" não existir, pare: a pré-condição não foi cumprida.**
>
> Revisão adversarial contra o código (09/10/2026): caminhos, funções e testes citados conferidos; corrigidos o custo do
> Dromon (teste de custo crescente da E3), os comandos `map:export` (o npm engole as opções sem `--`), o laço de tentativa
> do Estaleiro da IA (só o jogador 0 construía), a IA estudando evoluções navais em mapa terrestre (quebraria o diff do
> smoke), o aviso `seasApart` no Estreito, a pesca nas Ilhas pequenas e uma dúzia de pontos em que o navio caía em terra
> (`createGame`, `debugSpawn`, guarnição, oração). Os trechos de código continuam sem compilar: o typecheck é o juiz.

---

## Objetivo e resultado jogável

Ao fim da E4, numa partida rápida:

- O menu oferece três tipos de mapa novos: **Costeiro** (continente cercado de mar), **Ilhas** (cada jogador na sua ilha,
  o inimigo só se alcança por mar) e **Mediterrâneo** (mar no centro, terra em anel). O mapa oficial **Egeu** passa a ter
  um mar só, navegável de ponta a ponta (os baixios continuam caminháveis).
- Há três terrenos de água: **água rasa** e **água profunda** (só navios) e **baixio** (terreno novo: navios passam por
  cima e tropas atravessam a pé).
- Cidadãos constroem o **Estaleiro** (Era I, tecla `I`) na margem. Ele treina **Barco de Pesca**, **Transporte** e a
  linha de **navios de guerra** (Pentecôntero, Trirreme, Quinquerreme, Dromon com fogo grego, Galeão, Navio de Linha,
  Couraçado, Encouraçado), evoluída na Biblioteca como as linhas da E3.
- **Barcos de pesca** colhem comida em **cardumes** e entregam no Estaleiro; um barco parado num **cardume de atum**
  (peixe raro) rende ouro e dá "pesca +15 %".
- **Transporte**: tropas embarcam (clique direito no transporte), o navio leva até 20 de população e desembarca onde o
  jogador manda (clique direito em terra ou tecla `U`). Navio afundado leva a tropa junto.
- Navios de guerra atacam navios, tropas na margem e edifícios da costa; arqueiros, torres e Centros Cívicos atiram em
  navios; infantaria corpo a corpo não alcança navio (titãs alcançam).
- A IA pesca, defende o litoral, monta frota e, nas Ilhas, faz desembarques.
- O editor pinta baixio (tecla `7`), cardumes e atum, coloca navios e mostra as regiões do mar (tecla `J`); `map:check`
  mostra peixe e lugar de Estaleiro por início.
- Poseidon ganha bônus navais; Oceano (Titã) golpeia navios da margem.
- **Partidas sem mar navegável útil ficam idênticas às de antes** (o mesmo resumo minuto a minuto no smoke e no balance) e
  a campanha não muda (navios desligados em cenário).
- Arte provisória: navios desenhados pelo procedural (casco, remos, velas ou chaminés pela Era) com esteira na água;
  Estaleiro com a arte da Oficina de Cerco (alias); ícones do HUD gerados por `npm run art:hud`.

## Decisões já tomadas (não reabrir; cite docs/ERAS.md)

Do plano aprovado pelo dono (`docs/ERAS.md`):

- **§8:** "Água navegável no mapa (águas rasas e profundas), com pathfinding próprio para navios; Estaleiro na margem."
  "Barcos de pesca (comida em cardumes), transporte (embarcar e desembarcar exércitos), navios mercantes e a linha de
  navios de guerra (seção 4), que atacam outros navios e a costa." "Tipos de mapa novos: Costeiro, Ilhas (pendente desde o
  5.1) e Mediterrâneo; o Egeu ganha mar navegável." "IA naval (pesca, defesa do litoral, desembarque); justiça de posição
  nos mapas com mar (mesmos testes de hoje)." "Poseidon ganha bônus navais."
- **§4:** linha "Navio de guerra: Pentecôntero, Trirreme, Quinquerreme, Dromon (fogo grego), Galeão, Navio de linha,
  Couraçado, Encouraçado"; "Barcos: Barco de pesca, Transporte (I), Navio mercante (III), (vapor) (VII)".
- **§2:** "Cidadãos, navios e batedores também evoluem aqui" (na Biblioteca); as pesquisas de economia ficam fora dela.
- **§3:** comida vem também da **pesca**; **peixes raros** estão na lista de raros; petróleo serve aos navios a vapor.
- **§6:** "o Titã Oceano luta no mar"; míticos navais (Hipocampos, Escila, Ceto) e Tritão são da E6.
- **§7:** navios mercantes (Estaleiro, III) são da **E5**. **§9:** Farol, Arsenal de Cândia e Canal de Corinto são da **E7**.
- **§11:** E4 = água navegável, Estaleiro, pesca, transporte, navios I–VIII, IA naval, mapas Costeiro/Ilhas/Mediterrâneo;
  `SIM_VERSION` sobe; arte provisória até a E8; a campanha continua nas Eras I–IV.

Decisões deste guia (cada uma com o motivo em uma linha):

| # | Decisão | Motivo |
|---|---|---|
| D1 | Terreno novo **baixio** = `TERRAIN.SHALLOWS = 6`: caminhável (`blocked = 0`), navegável e **não construível** (nem edifício nem nó terrestre). Tecla `7` no editor; o "sentinela 6 = profunda forçada" do editor sai. | Os vaus de hoje são areia e cortariam o mar em pedaços; com o baixio o mar fica inteiro e o vau continua. |
| D2 | Água rasa (`WATER`) e profunda (`DEEP`) são navegáveis por **todos** os navios; não há calado. | §8 pede as duas; calado exigiria duas camadas navais e uma IA bem mais difícil. Revisar na E10. |
| D3 | A camada naval é **derivada** (`navalBlocked(map)`: 1 = navio não passa), calculada sob demanda e descartada em `invalidateComponents`. Nada no save nem no hash. | Toda mudança de bloqueio já passa por `invalidateComponents`; `GameMap`, `serialize` e os literais de mapa ficam intocados. |
| D4 | `grid.ts`, `pathfinding.ts` e `components.ts` ganham um parâmetro final `layer: Layer = 'land'`. | As chamadas de hoje não mudam de comportamento (partidas terrestres idênticas). |
| D5 | Navio = `UnitDef` com `cls: 'ship'`, `naval: true` e tag `'ship'`; transporte com `capacity` (em população). Navio nunca sai da camada naval; unidade terrestre nunca entra em `WATER`/`DEEP`. | Uma regra só para movimento, colisão, caminho e regiões. |
| D6 | **Estaleiro** `shipyard` (3×3, Era I, tecla `I`): pegada em terra construível e **≥ 2 tiles do anel** (sem os 4 cantos) em água aberta de um mar com **≥ 60 tiles** (`MIN_DOCK_WATER`). Pode ficar em território **próprio ou neutro** (inimigo não). | No Egeu a costa fica a ~19 tiles do início (fora do raio 12 do território); o protótipo de 06/10 mediu 0 inícios sem lugar nos 3 tipos novos (270 mapas). |
| D7 | **Pesca**: nó `fish` só em água aberta (450 de comida, 2 barcos), coletado só por barco de pesca, entregue só no Estaleiro (`navalDropoff`); cidadão não pesca. **Atum** `rare_fish`: raro do mar, ocupado por **barco de pesca** (não pelo Mercador), ouro como os raros da E2 e bônus "pesca +15 %". | Um papel claro para cada unidade; o raro do mar fecha a lista de §3. |
| D8 | `rare_fish` entra em `RARE_SET` e `NOT_GATHERED`, **não** em `RARE_NODES`. | A E2 sorteia `rng.int(0, RARE_NODES.length - 1)` no gerador: aumentar a lista mudaria todos os mapas da E2 e poria peixe em terra. |
| D9 | **Transporte**: comandos novos `embark` (tropas → transporte) e `unload` (transporte → ponto). Passageiro fica com `inside = id do navio` (como a guarnição) e o navio guarda `Unit.cargo`. Capacidade 20 de população; titãs, voadoras, imóveis e navios não embarcam; cavalaria e cerco embarcam. Navio morto mata a carga. | Reaproveita tudo o que já ignora unidade guarnecida (render, névoa, colisão, IA, seleção). |
| D10 | **Combate entre meios**: corpo a corpo (alcance < 1,6) não ataca o outro meio, exceto titãs; tiro e edifícios atacam. Quem ataca anda até o tile **do próprio meio** de onde alcança o alvo (`approachTile`). | "Atacam outros navios e a costa" (§8) sem anfíbios nesta etapa. |
| D11 | Linhas (E3): `warship` (8 degraus), `fishing` e `transport` (tipo fixo, um estudo "A vapor" na Era VII, como os cidadãos), todas no Estaleiro, teclas `Q` pesca, `W` transporte, `E` guerra. Elenco clássico: `shipyard.trains = ['fishing_boat', 'transport_ship', 'penteconter']`. | Mesmo mecanismo da E3 (D3/D6/D7 de lá). Letras **reservadas** no Estaleiro, que a E4 não usa: `T` e `M`/`C`/`V`/`B` (mercante da E5: o guia dela pega a 1ª livre de M, C, V, B) e `Z`/`X`/`C` (criaturas navais da E6). |
| D12 | Números dos navios de guerra pela **regra de escala da E3** a partir do Pentecôntero (vida e DPS ×1,2 por Era, armadura +0,02, custo ×1,1, treino +1 s); exceções na tabela. | Sem chute; consistente com as linhas terrestres. |
| D13 | **Navio mercante** só reservado (linha de dados de referência); a E5 cria a unidade e as rotas. | Rotas entre portos são da E5 (§7, §11). |
| D14 | **Navios desligados em cenário**: `navalOn(state) = state.config.naval ?? !isScenarioConfig(state.config)`. Desligado, `isForbidden` proíbe edifício `shore` e unidade `naval` (o HUD mostra o motivo como qualquer proibido). Cenário JSON liga com `"naval": true`. | As 12 missões e a Horda não foram calibradas com frota (a m8 tem Oceano na costa); mesma forma do `unitLines` da E3. |
| D15 | Tipos novos `coastal`, `islands`, `mediterranean` **no fim** de `MAP_TYPES`. Para os 5 tipos de hoje o gerador não muda (os hashes de `tests/fixedmap.test.ts` ficam iguais). Peixe só nos 3 tipos novos e no Egeu (`placeNavalResources`, RNG próprio `seed ^ 0x6a09e667`, depois de `placeEraResources` da E2). Lagos dos mapas de hoje ficam navegáveis, sem peixe. | Nenhum mapa gerado de hoje muda (campanha m9 em `lakes` 9909, roteiros, hashes). |
| D16 | Ilhas: **sem** `ensureConnectivity` (inícios separados por mar). Ilhas com Rei da Colina: o `ensureConnectivity` do `if (clearCenter)` roda com `SHALLOWS` — ele liga cada ilha **e** a ilhota central à região do início 1 por corredores de baixio (não necessariamente pela ilhota), e o mar continua um só. Nesse modo as ilhas ficam ligadas a pé e a IA não entra em "modo ilha". | O tipo existe para forçar o mar; o modo KotH precisa de rota a pé. |
| D17 | **Egeu**: os baixios de areia viram `SHALLOWS` (o mar fica um só), com 6 cardumes por início e 1 atum por quadrante, simétricos. O **Estreito não muda**. | §8 pede o Egeu; o Estreito fica de controle da justiça (sem peixe a IA não monta frota lá). |
| D18 | **Visão no mar** igual à de hoje (sem bloqueio de linha de visão): navio vê pelo `los`, passageiro não vê, edifício na margem vê o mar. | `fog.ts` já marca por círculo e ignora quem está dentro. |
| D19 | **Poseidon**: navios −10 % de custo e +10 % de velocidade, pesca +15 %. **Oceano**: bônus ×3 contra `ship` e, como todo titã, golpeia navio a partir da margem; andar no mar (anfíbio) fica para a **E6**. | §8 e §6; o anfíbio vem junto com Hipocampos/Escila/Ceto na E6 e não mexe na m8 agora. |
| D20 | **IA**: Estaleiro só com peixe perto (≥ 2 cardumes) **ou** em "modo ilha" (nenhum Centro Cívico inimigo alcançável por terra **e** o meu e o dele no mesmo mar grande — `seaOfStart`). Uma tentativa por janela de 10 s de jogo, igual para todos os jogadores. Barcos, frota e transportes por tabelas de 8 posições; um barco ocioso ocupa o atum livre; desembarque por máquina de estados em `ai.navy`; nada de rng; escolhas por `findBuildSpot`, `approachTile` e `shoreTileNear` (desempate pelo centro do mapa e `frameCompare`). As evoluções das linhas navais (E3, `evolutionPriority`) só entram na lista de estudos de quem tem Estaleiro pronto. | Justiça de posição (CLAUDE.md) e partidas terrestres idênticas (sem a última regra, a IA estudaria `evo_warship_*` num mapa sem mar e o diff do smoke não ficaria vazio). |
| D21 | Pesquisas do Estaleiro (4) ficam **fora** da Biblioteca. | §2: as de economia ficam fora; estas são do edifício. |
| D22 | Arte provisória: navio **procedural** (`drawShip` em `textures.ts`) e esteira (`unitFx.ts`); ícones `unit/<navio>` de um objeto novo `ship` (`hud-objects.js`); Estaleiro pelo alias `siege_workshop`. Sem bake. | Nenhuma página nova de VRAM; a E8 faz os rigs. |
| D23 | `SIM_VERSION` +1. O formato do save **não** sobe (o `deserialize` dá `cargo: []`; `ai.navy` é opcional). | Novos campos com padrão (regra do núcleo). |
| D24 | Atalhos: Estaleiro `I`; treino `Q`/`W`/`E`; com transporte selecionado, `U` desembarca no lugar; no editor, `7` baixio e `J` sobreposição do mar. Nenhum usa `A`/`R` nem é de treino/construção com `U`. | `tests/data.test.ts`; `U` já é "liberar" (guarnição), aqui "liberar a carga". |

---

## Arquivos que mudam

| Caminho | O que muda |
|---|---|
| `src/core/constants.ts` | `TERRAIN.SHALLOWS = 6`; `NodeType` com `fish`, `rare_fish` e as linhas nas 4 tabelas por nó; `SHIP_NODES`; `RARE_SET` e `NOT_GATHERED` com os dois nós (da E2); `MapType`/`MAP_TYPES` com os 3 tipos; `NAVAL_MAP_TYPES`; `SIM_VERSION` +1 |
| `src/core/types.ts` | `UnitClass` com `'ship'`; `UnitDef.naval?`, `capacity?`; `BuildingDef.shore?`, `navalDropoff?`; `Effect` gather e `PlayerMods.gather` com `'fish'`; `Order.type` com `'embark' \| 'unload'`; `Unit.cargo`; `GameConfig.naval?`; `AIState.navy?`; `Command` com `embark` e `unload` |
| `src/core/map/naval.ts` (novo) | `Layer`, `layerOf`, `isNavigableTerrain`, `isOpenWater`, `isUnbuildableTerrain`, `isLandBlockedTerrain`, `nodeFitsTerrain`, `MIN_DOCK_WATER`, `navalBlocked`, `invalidateNaval` |
| `src/core/map/grid.ts` | `isPassable`, `canPass`, `canStep`, `lineClear` com `layer` |
| `src/core/map/pathfinding.ts` | `findPath`, `findPathEx`, `smoothPath`, `nearestFreeTile` com `layer` |
| `src/core/map/components.ts` | cache por camada; `componentAt`, `componentSize`, `rectReachable`, `nearestLargeComponentTile` com `layer`; `invalidateComponents` apaga também a naval; `shoreWaterCount`, `shoreOk` (novos) |
| `src/core/map/mapgen.ts` | `addNode`/`removeNode` pela camada; `MAP_PRESETS` dos 3 tipos; formas de mar; ângulo dos recursos iniciais; `placeNavalResources`; `carveCorridor`/`ensureConnectivity` com terreno de preenchimento; `NODE_AMOUNT` dos 2 nós |
| `src/core/map/fixed.ts` | checagens de terreno pelas funções de `naval.ts`; códigos novos de validação; `hasShipyardSite`; coluna `fish` em `StartResources`/`startResourceTable` |
| `src/core/serialize.ts` | `blocked` por `isLandBlockedTerrain`; `cargo` padrão `[]` |
| `src/core/net/hash.ts`, `src/core/net/desync.ts` | `inside` e `cargo.length` de cada unidade |
| `src/core/data/units.ts` | 10 unidades navais; `UNIT_TAGS` com `'ship'`; `oceanus.bonus.ship` |
| `src/core/data/buildings.ts` | `shipyard`; `BUILD_MENU` |
| `src/core/data/techs.ts` | 4 pesquisas do Estaleiro; `evolutions()` generalizado (estudos de tipo fixo) |
| `src/core/data/lines.ts` (da E3) | `LineDef.studyEffects?`, `studyDesc?`; linhas `fishing`, `transport`, `warship`; `LINE_ORDER` |
| `src/core/data/gods.ts` | bônus e perks navais de Poseidon |
| `src/core/data/rares.ts` (da E2) | `rare_fish` |
| `src/core/sim/naval.ts` (novo) | `fairer`, `approachTile`, `shoreTileNear`, `cargoPop`, `canBoard`, `boardShip`, `dropCargo`, `nearestNavalDropoff`, `dropoffFor`, `fishNear` |
| `src/core/sim/units.ts` | movimento, separação, coleta, entrega e ataque pela camada; ordens `embark`/`unload` |
| `src/core/sim/queries.ts` | `nodeAccessTiles` pela camada do nó; `canWorkNode` (da E2) com barcos |
| `src/core/sim/combat.ts` | `ATTACK_INTERVAL.ship`; `canTarget` entre meios; `killUnit` afunda a carga e sai do navio |
| `src/core/sim/entities.ts` | `canPlaceBuilding` (terreno, margem, território); `openTile`/`findSpawnTile` com `layer`; empurrões ignoram navios; `removeUnitNow` com carga; `canGarrison` recusa navio |
| `src/core/sim/buildings.ts` | navio nasce na água |
| `src/core/sim/commands.ts` | `move` pela camada; casos `embark` e `unload` |
| `src/core/sim/validate.ts` | `embark` e `unload` no `sanitizeCommand` |
| `src/core/sim/restrictions.ts` | `navalOn`; `isForbidden` com navios |
| `src/core/sim/modifiers.ts` | `defaultMods().gather.fish` |
| `src/core/sim/economy.ts` | ocupação de raro (da E2) aceita barco de pesca |
| `src/core/sim/powers.ts` | Isca, Maldição e Cornucópia não caem em água/baixio |
| `src/core/sim/game.ts` | `summarize` com `nav=` (só quando > 0); `createGame` põe as unidades do mapa fixo pela camada delas |
| `src/core/sim/ai.ts` | `Snapshot.ships`; `manageNavy`, `manageInvasion`, `islandMode`, `invasionTarget`; tabelas navais; guardas em `manageTraining`/`manageArmy`; `RESEARCH_PRIORITY`; `evolutionPriority` (da E3) sem linhas navais para quem não tem Estaleiro; `manageMerchants` (da E2) sem o atum |
| `src/main.ts` | `debugSpawn` pela camada da unidade (o playtest põe navios na água) |
| `src/core/scenario/schema.ts`, `src/core/scenario/compile.ts` | `config.naval?: boolean` (como o `unitLines` da E3) |
| `src/i18n/strings.ts`, `src/i18n/en-data.ts` | textos PT e EN (tabelas abaixo) |
| `src/editor/editor.ts`, `src/editor/ops.ts`, `src/editor/panel.ts`, `src/editor/types.ts` | baixio, peixes, navios, sobreposição do mar, regras de terreno pela camada (inclusive `runMapFix` e `moveEntity`); coluna `fish` na tabela por início |
| `src/render/textures.ts` | `drawShip`; desenho de `fish`/`rare_fish`; `NODE_TYPES` |
| `src/render/renderer.ts` | balanço do navio; sobreposição `showNaval` |
| `src/render/palette.ts`, `src/render/terrain/materials.ts`, `src/render/minimap.ts`, `src/render/props.ts` | cor e material do baixio; cor dos peixes; água inclui baixio |
| `src/render/fx/logic.ts`, `src/render/fx/rules.ts`, `src/render/fx/unitFx.ts`, `src/render/fx/handlers/projectile.ts` | navio sem poeira; esteira; água inclui baixio |
| `src/render/art/alias.ts` (da E2) | `shipyard: 'siege_workshop'` |
| `src/audio/audio.ts`, `src/audio/events.ts`, `src/audio/ambience.ts` | `ACKS.ship`; morte de navio; água inclui baixio |
| `src/ui/hud.ts`, `src/ui/input.ts` | carga no cartão; botão e tecla de desembarque; clique direito embarca/desembarca; Estaleiro fora do menu de construção com navios desligados; navio fora de "guarnecer" |
| `scripts/bake/hud/catalog.mjs`, `scripts/bake/page/hud-objects.js` | `SHIP_ICONS`; `OBJ.ship`, `OBJ.fish`; ícones das pesquisas e das 3 linhas |
| `public/art/hud-*.png`, `public/art/hud-*.json`, `public/art/manifest.json` | regerados por `npm run art:hud` (nunca à mão) |
| `scripts/export-map.ts`, `scripts/mapcheck.ts` | texto de uso com os tipos novos; peixe e Estaleiro por início |
| `scripts/maps/lib.ts`, `scripts/maps/egeu.ts`, `src/core/data/maps/egeu.map.json` | `fish` na igualdade por início; Egeu navegável com peixe (arquivo regerado pelo script) |
| `scripts/playtest-naval.mjs` (novo), `scripts/playtest-editor.mjs` | playtest naval; chips de terreno e de nós |
| `tests/naval.test.ts` (novo) e os da seção "Testes" (inclusive `tests/unit-lines.test.ts` e `tests/studytree.test.ts` da E3, que contam linhas, degraus e estudos) | — |
| `docs/EDITOR.md`, `docs/eras/PROGRESSO.md`, `docs/ROADMAP.md`, `CLAUDE.md` | documentação (bloco H) |

**Não mexa em:** `scripts/maps/estreito.ts` e o seu `.map.json`; os mapas de missão (`scripts/maps/m*.ts`,
`src/core/scenario/missions/*.json`) e `src/core/scenario/testing.ts`; `art/manifest/*`, `scripts/bake/page/rigs/*`,
`materials.js` (reassaria a arte); as passadas antigas de `generateMap` para os 5 tipos de hoje.

---

## Dados prontos

Todos os números são **valores iniciais para o balanceamento da E10**.

### Terrenos e camadas

| `TERRAIN` | valor | terrestre (`blocked`) | naval | constrói / nó terrestre | peixe | editor |
|---|---|---|---|---|---|---|
| GRASS, SAND, DIRT | 0, 3, 4 | passa | não | sim | não | `1`, `2`, `3` |
| WATER (água rasa) | 1 | bloqueia | passa | não | sim | `4` |
| MOUNTAIN | 2 | bloqueia | não | não | não | `5` |
| DEEP (profunda) | 5 | bloqueia | passa | não | sim | `6` |
| **SHALLOWS (baixio)** | **6** | **passa** | **passa** | **não** | **não** | **`7`** |

Nó em qualquer tile bloqueia as duas camadas. Edifício só fica em terra construível.

### Constantes (`src/core/constants.ts`)

```ts
export const TERRAIN = { GRASS: 0, WATER: 1, MOUNTAIN: 2, SAND: 3, DIRT: 4, DEEP: 5, SHALLOWS: 6 } as const;
// MapType e MAP_TYPES: os 3 novos NO FIM (o menu e os testes indexam os de hoje)
export type MapType = 'continental' | 'mountains' | 'forest' | 'desert' | 'lakes' | 'coastal' | 'islands' | 'mediterranean';
export const MAP_TYPES: MapType[] = ['continental', 'mountains', 'forest', 'desert', 'lakes', 'coastal', 'islands', 'mediterranean'];
/** E4: tipos de mapa com mar (formas de mar e peixe em generateMap). */
export const NAVAL_MAP_TYPES: ReadonlySet<string> = new Set(['coastal', 'islands', 'mediterranean']);
/** E4: nós de água, trabalhados só por barco de pesca (canWorkNode). */
export const SHIP_NODES: ReadonlySet<string> = new Set(['fish', 'rare_fish']);
```

### Nós (`constants.ts` + `NODE_AMOUNT` em `mapgen.ts`)

| NodeType | PT (`node.*`) | EN (`node.*`) | `NODE_RESOURCE` | `GATHER_RATES` | `NODE_CAPACITY` | `NODE_AMOUNT` | quem trabalha | onde |
|---|---|---|---|---|---|---|---|---|
| fish | Cardume | Fish Shoal | food | 1.0 | 2 | 450 | barco de pesca | WATER/DEEP |
| rare_fish | Cardume de Atum | Tuna Run | gold | 0.5 | 1 | 99999 | barco de pesca (raro) | WATER/DEEP |

Acrescente `'fish', 'rare_fish'` **no fim** do union `NodeType` e as linhas nas tabelas `GATHER_RATES`, `NODE_RESOURCE`,
`NODE_NAMES` (PT da tabela) e `NODE_CAPACITY`. Nos conjuntos da E2:
`RARE_SET = new Set<string>([...RARE_NODES, 'rare_fish'])` e `NOT_GATHERED` com `'fish', 'rare_fish'` a mais.
**Não** acrescente nada a `RARE_NODES` (D8).

### Raro do mar (`src/core/data/rares.ts`, da E2)

| id | bônus PT (`rare.rare_fish`) | EN | `effects` |
|---|---|---|---|
| rare_fish | Atum: pesca +15%. | Tuna: fishing +15%. | `[{ type: 'gather', resource: 'fish', mult: 1.15 }]` |

### Unidades (`src/core/data/units.ts`)

Bloco novo `// ---------------- Navios (E4) ----------------` depois dos degraus da E3 e antes dos heróis. `icon`: copie o
caractere do `icon` de `oceanus` (já existe nos dados; o HUD usa o ícone do atlas). `cls: 'ship'` e `naval: true` em
todas. Colunas: custo · vida · ataque · intervalo (`*` = `attackInterval` próprio; o da classe é 2,0) · armadura
hack/pierce/crush · alcance · velocidade · visão · treino (s) · pop · raio · tags · bônus · área (`splash`).

| id | PT (sing. / plural) | EN (sing. / plural) | Era (`age`) · linha/`tier` | custo | vida | ataque | int. | armadura | alc. | vel. | visão | treino | pop | raio | tags | bônus | área |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `fishing_boat` | Barco de Pesca / Barcos de Pesca | Fishing Boat / Fishing Boats | I (0) · fishing/0 | wood 60 | 120 | 0 hack | — | .05/.10/0 | 0 | 3.0 | 7 | 18 | 1 | 0.45 | ship, civilian | — | — |
| `transport_ship` | Transporte / Transportes | Transport Ship / Transport Ships | I (0) · transport/0 | wood 100 | 260 | 0 hack | — | .15/.25/.05 | 0 | 3.3 | 8 | 25 | 2 | 0.6 | ship | — | — |
| `penteconter` | Pentecôntero / Pentecônteros | Penteconter / Penteconters | I (0) · warship/0 | wood 120, gold 40 | 300 | 12 pierce | 2.0 | .15/.25/.05 | 6 | 3.2 | 10 | 30 | 3 | 0.6 | ship, military, ranged | ship ×1.5 | — |
| `trireme` | Trirreme / Trirremes | Trireme / Triremes | II (1) · warship/1 | wood 130, gold 45 | 360 | 14 pierce | 2.0 | .17/.27/.07 | 6 | 3.6 | 10 | 31 | 3 | 0.6 | ship, military, ranged | ship ×1.5 | — |
| `quinquereme` | Quinquerreme / Quinquerremes | Quinquereme / Quinqueremes | III (2) · warship/2 | wood 145, gold 50 | 430 | 19 pierce | 2.2* | .19/.29/.09 | 6.5 | 3.0 | 10 | 32 | 3 | 0.65 | ship, military, ranged | ship ×1.5 | — |
| `dromon` | Dromon / Dromons | Dromon / Dromons | IV (3) · warship/3 | wood 160, gold 55, oil 15 | 520 | 26 crush | 2.0 | .21/.31/.11 | 3.5 | 3.2 | 10 | 33 | 3 | 0.65 | ship, military, ranged, fire | ship ×1.5, building ×1.5 | 1.0 |
| `galleon` | Galeão / Galeões | Galleon / Galleons | V (4) · warship/4 | wood 175, gold 60 | 620 | 37 crush | 3.0* | .23/.33/.13 | 7 | 2.8 | 11 | 34 | 3 | 0.7 | ship, military, ranged, gunpowder | ship ×1.5, building ×2 | 0.6 |
| `ship_of_the_line` | Navio de Linha / Navios de Linha | Ship of the Line / Ships of the Line | VI (5) · warship/5 | wood 195, gold 65 | 745 | 45 crush | 3.0* | .25/.35/.15 | 7.5 | 2.7 | 11 | 35 | 3 | 0.7 | ship, military, ranged, gunpowder | ship ×1.5, building ×2 | 0.8 |
| `ironclad` | Couraçado / Couraçados | Ironclad / Ironclads | VII (6) · warship/6 | wood 215, gold 70, oil 40 | 1075 | 54 crush | 3.0* | .37/.47/.27 | 8 | 3.0 | 12 | 36 | 3 | 0.7 | ship, military, ranged, gunpowder, mechanical | ship ×1.5, building ×2 | 0.8 |
| `battleship` | Encouraçado / Encouraçados | Battleship / Battleships | VIII (7) · warship/7 | wood 235, gold 80, oil 100 | 1290 | 75 crush | 3.5* | .39/.49/.29 | 10 | 3.0 | 13 | 37 | 3 | 0.75 | ship, military, ranged, gunpowder, mechanical | ship ×1.5, building ×2 | 1.2 |

Campos extras: `fishing_boat`: `canGather: true, building: 'shipyard', line: 'fishing', tier: 0, hotkey: 'Q'`.
`transport_ship`: `capacity: 20, building: 'shipyard', line: 'transport', tier: 0, hotkey: 'W'`. `penteconter`:
`building: 'shipyard', line: 'warship', tier: 0, hotkey: 'E'`. Os 7 degraus seguintes: `lineOnly: true`,
`building: 'shipyard'`, `line: 'warship'`, `tier` = `age`, **sem** `hotkey` (regra D6 da E3). Na coluna "int.",
escreva `attackInterval` só onde há `*`.

Como os números saíram (não recalcule): âncora `penteconter` (vida 300, DPS 6); degrau `n` Eras acima: vida ×1,2ⁿ
(múltiplo de 5), DPS ×1,2ⁿ e ataque = DPS × intervalo, armadura +0,02·n, custo ×1,1ⁿ (múltiplo de 5), treino +n.
Exceções: trirreme velocidade 3,6; quinquerreme alcance 6,5 e intervalo 2,2; dromon alcance 3,5, DPS ×1,25 (fogo de
curto alcance), `crush`, área 1,0, petróleo 15; pólvora (V+) `crush`, intervalo 3,0 (3,5 no VIII), área e bônus contra
edifício; couraçado e encouraçado vida ×1,2 extra e armadura +0,1 (ferro), petróleo 40/100.
O petróleo do Dromon é 15 (e não 30) porque o teste da E3 "dentro de cada linha, vida e custo crescem com o degrau"
(`tests/unit-lines.test.ts`) soma todos os recursos do custo: com 30, o Dromon (245) passaria do Galeão (235). Totais da
linha: 160, 175, 195, 230, 235, 260, 325, 415 — estritamente crescentes; não mexa em um sem refazer a soma.

Descrições (`desc`, PT e EN):

| id | PT | EN |
|---|---|---|
| fishing_boat | Pesca nos cardumes e entrega a comida no Estaleiro. Parado num cardume de atum, rende ouro. | Fishes the shoals and delivers food to the Shipyard. Parked on a tuna run, it earns gold. |
| transport_ship | Leva até 20 de população. Clique direito nele com tropas para embarcar; com ele selecionado, clique em terra para desembarcar (U: aqui). | Carries up to 20 population. Right-click it with troops to board; with it selected, click on land to unload (U: here). |
| penteconter | Galera de 50 remos com arqueiros. Forte contra navios. | Fifty-oared galley with archers. Strong against ships. |
| trireme | Galera rápida de três ordens de remos. | Fast galley with three banks of oars. |
| quinquereme | Galera pesada com balistas no convés. | Heavy galley with deck ballistae. |
| dromon | Galera bizantina com sifão de fogo grego: curto alcance, dano em área. | Byzantine galley with a Greek fire siphon: short range, area damage. |
| galleon | Veleiro de canhões. Bombardeia navios e a costa. | Cannon-armed sailing ship. Bombards ships and the coast. |
| ship_of_the_line | Veleiro de duas cobertas de canhões. | Two-decked sailing ship of cannons. |
| ironclad | Navio a vapor com casco de ferro. | Steam-powered iron-hulled warship. |
| battleship | Couraçado de torres de canhões gigantes. | Battleship with huge gun turrets. |

Reservado para a **E5** (não crie agora): `merchant_ship` · Navio Mercante / Navios Mercantes · Merchant Ship / Merchant
Ships · III (2) · wood 120, gold 30 · vida 280 · ataque 0 · .15/.25/.05 · vel. 3.4 · visão 8 · treino 25 · pop 2 · raio
0.6 · tags ship, civilian. A tecla e a forma de treino são decisão do guia da E5 (lá: no `trains` do Estaleiro, a 1ª letra
livre de M, C, V, B); por isso a E4 não usa nenhuma dessas letras, nem `T`, `Z` e `X`, no Estaleiro.

Também em `units.ts`: `UNIT_TAGS` com `'ship'` no fim; `oceanus.bonus = { building: 4, ship: 3 }`.

### Linhas (`src/core/data/lines.ts`, da E3)

Na interface `LineDef`, depois de `studyNames?`:

```ts
  /** E4: efeitos de cada estudo de uma linha que não troca de tipo (barcos "a vapor"); os cidadãos usam CITIZEN_EVO_EFFECTS. */
  studyEffects?: Effect[];
  /** E4: descrição PT desses estudos (EN em src/i18n/en-data.ts, LINE_STUDIES_EN). */
  studyDesc?: string;
```

(`import type { Effect } from '../types';` no topo.) No fim de `LINES`:

```ts
  // ---- E4: naval (só o Estaleiro treina; os barcos não trocam de tipo, ganham o estudo "a vapor" na Era VII) ----
  fishing: { id: 'fishing', name: 'Barcos de pesca', buildings: ['shipyard'], hotkey: 'Q',
    steps: ['fishing_boat', null, null, null, null, null, 'fishing_boat', null],
    studyNames: [null, null, null, null, null, null, 'A vapor', null],
    studyDesc: 'Barcos de pesca a vapor: +25% de velocidade, +50% de vida e pesca +25%.',
    studyEffects: [
      { type: 'unit', match: { types: ['fishing_boat'] }, stat: 'speed', mult: 1.25 },
      { type: 'unit', match: { types: ['fishing_boat'] }, stat: 'hp', mult: 1.5 },
      { type: 'gather', resource: 'fish', mult: 1.25 },
    ] },
  transport: { id: 'transport', name: 'Transportes', buildings: ['shipyard'], hotkey: 'W',
    steps: ['transport_ship', null, null, null, null, null, 'transport_ship', null],
    studyNames: [null, null, null, null, null, null, 'A vapor', null],
    studyDesc: 'Transportes a vapor: +30% de velocidade e +50% de vida.',
    studyEffects: [
      { type: 'unit', match: { types: ['transport_ship'] }, stat: 'speed', mult: 1.3 },
      { type: 'unit', match: { types: ['transport_ship'] }, stat: 'hp', mult: 1.5 },
    ] },
  warship: { id: 'warship', name: 'Navios de guerra', buildings: ['shipyard'], hotkey: 'E',
    steps: ['penteconter', 'trireme', 'quinquereme', 'dromon', 'galleon', 'ship_of_the_line', 'ironclad', 'battleship'] },
```

`LINE_ORDER`: acrescente `'fishing', 'transport', 'warship'` **no fim** (a ordem alimenta botões e desempates da IA).

### Estudos de evolução novos (gerados por `evolutions()` da E3)

| id | Era | PT | EN |
|---|---|---|---|
| `evo_fishing_7` | VII | Barcos de pesca: A vapor | Fishing Boats: Steam |
| `evo_transport_7` | VII | Transportes: A vapor | Transport Ships: Steam |
| `evo_warship_2` … `evo_warship_8` | II–VIII | Navios de guerra: Trirreme … Encouraçado | Warships: Trireme … Battleship |

Custos e tempos: as fórmulas da E3 (conhecimento 40 + 60·k, ouro 40 + 50·k, tempo 25 + 8·k). Total: 9 estudos novos
(50 + 9 = 59 com `evolve`).

### Edifício (`src/core/data/buildings.ts`, depois de `siege_workshop`)

```ts
  shipyard: { id: 'shipyard',
    name: 'Estaleiro', icon: '<copie o icon de siege_workshop>', cost: { wood: 150 }, hp: 1200, w: 3, h: 3, buildTime: 45, armor: BARMOR,
    los: 8, trains: ['fishing_boat', 'transport_ship', 'penteconter'], navalDropoff: ['food'], shore: true,
    age: 0, hotkey: 'I', military: true,
    desc: 'Constrói navios na margem: precisa de mar aberto encostado (2 tiles ou mais) e pode ficar em território seu ou neutro. Barcos de pesca entregam comida aqui.' },
```

EN (`EN_BUILDINGS.shipyard`): `{ name: 'Shipyard', desc: 'Builds ships on the shore: needs open sea alongside (2 tiles or more) and can stand in your own or neutral territory. Fishing boats deliver food here.' }`.
`BUILD_MENU`: `'shipyard'` logo depois de `'siege_workshop'`. Sem pedra no custo (Era I acessível).

### Pesquisas do Estaleiro (`src/core/data/techs.ts`, bloco novo "Estaleiro (E4)" no fim de `RAW`)

| id | PT | EN | `age` | custo | tempo | `prereq` | efeitos | desc PT | desc EN |
|---|---|---|---|---|---|---|---|---|---|
| fishing_nets | Redes de Pesca | Fishing Nets | 0 | wood 100, gold 50 | 30 | — | `{ type: 'gather', resource: 'fish', mult: 1.2 }` | Barcos de pesca coletam 20% mais rápido. | Fishing boats gather 20% faster. |
| caulking | Calafeto com Piche | Pitch Caulking | 1 | wood 150, gold 100 | 40 | — | `{ type: 'unit', match: { tags: ['ship'] }, stat: 'hp', mult: 1.15 }` | Navios +15% de vida. | Ships +15% health. |
| bronze_rams | Esporões de Bronze | Bronze Rams | 2 | wood 200, gold 150 | 50 | caulking | `{ type: 'unit', match: { tags: ['ship'] }, stat: 'attack', mult: 1.15 }` | Navios de guerra +15% de ataque. | Warships +15% attack. |
| navigation | Navegação Astronômica | Celestial Navigation | 4 | wood 250, gold 200 | 60 | bronze_rams | `{ type: 'unit', match: { tags: ['ship'] }, stat: 'speed', mult: 1.1 }`, `{ type: 'unit', match: { tags: ['ship'] }, stat: 'los', add: 2 }` | Navios 10% mais rápidos e +2 de visão. | Ships 10% faster and +2 sight. |

`building: 'shipyard'`, `icon`: o mesmo caractere de `oceanus`.

### Poseidon (`src/core/data/gods.ts`) e Oceano

`poseidon.bonuses`, no fim: `{ type: 'cost', match: { tags: ['ship'] }, mult: 0.9 }`,
`{ type: 'unit', match: { tags: ['ship'] }, stat: 'speed', mult: 1.1 }`, `{ type: 'gather', resource: 'fish', mult: 1.15 }`.
`perks`: insira antes de `'Poder: Isca'` o texto `'Navios 10% mais baratos e 10% mais rápidos; pesca +15%'`; em
`EN_MAJOR_GODS.poseidon.perks`, na mesma posição, `'Ships 10% cheaper and 10% faster; fishing +15%'`.
Oceano: `bonus.ship = 3` (tabela de unidades) e a exceção de titã em `canTarget` (passo C6).

### Tipos de mapa (gerador)

| id | PT (`maptype.*`) | EN | forma (medida no protótipo de 06/10, 270 mapas por tipo) |
|---|---|---|---|
| coastal | Costeiro | Coastal | terra num disco de raio `R + 10` (R = 36 % do lado menor; os inícios ficam em R) e mar fora dele e a menos de 3 tiles da borda; costa a 9–12 tiles atrás de cada início |
| islands | Ilhas (só por mar) | Islands (by sea only) | uma ilha de raio `clamp(round(0,16·lado), 13, 22)` por início, com o centro deslocado `raio − 9,5` para o meio do mapa; mar no resto; sem ponte de terra |
| mediterranean | Mediterrâneo (mar no centro) | Mediterranean (sea in the middle) | mar num disco de raio `R − 10` no centro; terra em anel; costa a ~10 tiles na frente de cada início |

Em todos: borda da forma com ruído `±1,5` (`makeNoise(seed + 303)`), sem lagos do ruído de elevação (o que seria água
vira grama), montanha a até 13,5 tiles de um início vira terra. Recursos iniciais: o ângulo-base do bosque/frutas/ouro
deixa de ser sorteado e aponta para a terra (Costeiro e Ilhas: para o centro do mapa; Mediterrâneo: tangente, +8 em
`CIRCLE32`); medido: razão mín/máx por início 0,98–1,00 em média.

Peixe (`placeNavalResources`): por início, na direção do mar (Costeiro e Ilhas: oposta ao centro; Mediterrâneo: para o
centro), 3 cardumes de 3 peixes a `r0 + 2,5` e `r0 + 3` (ângulos 0, +4, −4), onde `r0` (≤ 20) é o primeiro tile de mar
grande nessa direção, e 1 atum a `r0 + 8`; se essa direção não comportar os 9 peixes, as direções +8, −8 e +16 (o lado
oposto) completam. Mais 1 cardume de alto-mar a cada 450 tiles de mar, longe ≥ 20 de todo início. **Isto não foi medido
no protótipo** (ele mediu formas, recursos iniciais e lugar de Estaleiro): o fallback existe porque, nas Ilhas do mapa
pequeno (80×80), a faixa de mar atrás de uma ilha alinhada a um eixo tem ~1,7 tile e não cabe cardume nenhum.

### Textos novos (`src/i18n/strings.ts`, PT e EN; sem emoji)

| chave | PT | EN |
|---|---|---|
| `maptype.coastal` | Costeiro | Coastal |
| `maptype.islands` | Ilhas (só por mar) | Islands (by sea only) |
| `maptype.mediterranean` | Mediterrâneo (mar no centro) | Mediterranean (sea in the middle) |
| `node.fish` | Cardume | Fish Shoal |
| `node.rare_fish` | Cardume de Atum | Tuna Run |
| `rare.rare_fish` | Atum: pesca +15%. | Tuna: fishing +15%. |
| `editor.terrain.6` | Baixio | Shallows |
| `editor.naval` | Mar | Sea |
| `editor.cls.ship` | Navios | Ships |
| `err.needsShore` | O Estaleiro precisa de mar aberto encostado (2 tiles ou mais). | The Shipyard needs open sea alongside (2 tiles or more). |
| `err.boatOnly` | Só barcos de pesca trabalham na água. | Only fishing boats work on the water. |
| `err.fishOnly` | Barcos de pesca só pescam (cardumes e atum). | Fishing boats only fish (shoals and tuna). |
| `err.notTransport` | Escolha um transporte seu. | Choose one of your transports. |
| `err.cannotBoard` | Nenhuma unidade selecionada cabe ou pode embarcar. | No selected unit fits or can board. |
| `err.nothingToUnload` | Nenhum transporte com carga selecionado. | No loaded transport selected. |
| `err.navalOff` | Sem navios neste cenário. | No ships in this scenario. |
| `ev.noLanding` | Não há onde desembarcar aqui: escolha uma praia. | Nowhere to land here: pick a beach. |
| `sel.cargo` | Carga | Cargo |
| `cmd.unload` | Desembarcar | Unload |
| `cmd.unloadTip` | `<b>Desembarcar</b><div class="desc">A carga desce na margem mais perto. Clique direito em terra desembarca lá. Atalho: U.</div>` | `<b>Unload</b><div class="desc">The cargo goes ashore on the nearest bank. Right-click on land to unload there. Hotkey: U.</div>` |
| `hk.unload` | Desembarcar a carga do transporte selecionado | Unload the selected transport's cargo |
| `map.issue.fishOnLand` | Peixe fora de água aberta | Fish outside open water |
| `map.issue.shipOnLand` | Navio fora da água | Ship outside water |
| `map.issue.shoreNoWater` | Estaleiro sem mar aberto encostado | Shipyard without open sea alongside |
| `map.issue.noShipyardSite` | Início {start} sem lugar para Estaleiro (outro início tem) | Start {start} has no Shipyard site (another start has) |
| `map.issue.seasApart` | O mar do início {start} não se liga ao do início 1 | The sea of start {start} does not connect to start 1's |

`err.navalOff` é o motivo que `forbiddenReason` devolve para navio e Estaleiro com `navalOn` desligado (passo C11).

### Inglês dos dados (`src/i18n/en-data.ts`)

- `EN_UNITS`: as 10 unidades (nomes da tabela de unidades, `desc` EN da tabela de descrições).
- `EN_TECHS`: as 4 pesquisas (nome e `desc` EN).
- `EN_LINES` (da E3): `fishing: { name: 'Fishing Boats' }, transport: { name: 'Transport Ships' }, warship: { name: 'Warships' }`.
- Logo depois de `EN_LINES`:
  ```ts
  /** E4: EN dos estudos de linhas que não trocam de tipo (na mesma conta de evolutions() em techs.ts). */
  const LINE_STUDIES_EN: Record<string, { names: (string | null)[]; desc: string }> = {
    fishing: { names: [null, null, null, null, null, null, 'Steam', null], desc: 'Steam fishing boats: +25% speed, +50% health and fishing +25%.' },
    transport: { names: [null, null, null, null, null, null, 'Steam', null], desc: 'Steam transports: +30% speed and +50% health.' },
  };
  ```

### Ícones do HUD (`scripts/bake/hud/catalog.mjs`)

```js
/** E4: ícones dos navios (unit/<id>): o objeto `ship` de hud-objects.js com a flâmula do time, até a E8 trazer os rigs. */
const S = (params) => ({ ...O('ship', params), team: true });
export const SHIP_ICONS = {
  fishing_boat: S({ kind: 'fishing' }), transport_ship: S({ kind: 'transport' }),
  penteconter: S({ kind: 'galley' }), trireme: S({ kind: 'galley', ram: true }), quinquereme: S({ kind: 'galley', ram: true }),
  dromon: S({ kind: 'dromon' }), galleon: S({ kind: 'sail' }), ship_of_the_line: S({ kind: 'sail' }),
  ironclad: S({ kind: 'steam' }), battleship: S({ kind: 'battleship' }),
};
```

`TECH_ICONS`, no fim: `fishing_nets: O('fish'), caulking: O('hydria'), bronze_rams: O('ship', { kind: 'galley', ram: true }),
navigation: O('armillary'), evo_fishing: O('ship', { kind: 'fishing', steam: true }),
evo_transport: O('ship', { kind: 'transport', steam: true }), evo_warship: O('ship', { kind: 'sail' })`.

### Tabelas da IA (`src/core/sim/ai.ts`, exportadas; 8 posições, uma por Era)

```ts
/** E4: barcos de pesca por Era (teto; também ≤ 2 por cardume a até 26 tiles do Estaleiro). */
export const FISH_BOATS = [3, 5, 6, 6, 7, 7, 8, 8];
/** E4: navios de guerra por Era no modo ilha (o inimigo só se alcança por mar) e no modo costa (há Estaleiro). */
export const WARSHIPS_ISLAND = [2, 3, 4, 5, 6, 6, 7, 8];
export const WARSHIPS_COAST = [0, 1, 2, 2, 3, 3, 4, 4];
/** E4: transportes no modo ilha; cidadãos mínimos antes do primeiro Estaleiro. */
export const TRANSPORTS = 2;
export const SHIPYARD_MIN_VILLAGERS = 12;
```

---

## Passo a passo

Rode `npm run -s typecheck` no fim de cada passo. Dentro de um bloco os testes podem ficar vermelhos; no fim do bloco,
rode o "Confira" dele. Em cada passo, importe os nomes novos que o código usar (o typecheck acusa o que faltar).

### Bloco 0 — Preparação

- [ ] **01. Pré-voo.** `git status` limpo; `docs/eras/PROGRESSO.md` marca E1, E2 e E3 como `feito`; existem
  `src/core/data/lines.ts`, `src/core/sim/lines.ts`, `src/core/data/rares.ts`, `src/render/art/alias.ts`;
  `npx tsx -e "import { LINES } from './src/core/data'; console.log(Object.keys(LINES).length)"` imprime 10. Leia os
  guias `docs/eras/E2-recursos.md` (passos 7, 8, 11, 17, 25) e `docs/eras/E3-linhas-de-unidade.md` (blocos A, B e C).
- [ ] **02. Linha de base** (você vai comparar no fim):
  ```bash
  mkdir -p /tmp/e4-base
  npx vitest run 2>&1 | tail -5 > /tmp/e4-base/vitest.txt
  npm run smoke 20 42 | grep -v "reais\|tempo real\|ms/tick\|hash final" > /tmp/e4-base/smoke.txt
  npm run balance 35 1,2,3 | grep -v "reais\|ms/tick" > /tmp/e4-base/balance.txt
  npx tsx scripts/missions.ts 2>&1 | sed -E 's/ \([0-9.]+s\)$//' > /tmp/e4-base/missions.txt   # tira o "(12.3s)" do fim das linhas
  npx tsx scripts/maps/fairness.ts estreito 45 1-16 zeus --both --jobs 3 > /tmp/e4-base/fair-estreito.txt
  npx tsx scripts/maps/fairness.ts egeu 45 1-16 zeus --both --jobs 3 > /tmp/e4-base/fair-egeu.txt
  ```

### Bloco A — Terreno, camada naval e regiões

- [ ] **A1. Constantes e tipos.** `constants.ts`: `TERRAIN.SHALLOWS`, `SHIP_NODES`, `NAVAL_MAP_TYPES`, `MapType`/`MAP_TYPES`
  e os 2 nós (tabelas de "Dados prontos"); `RARE_SET`/`NOT_GATHERED` (D8). `types.ts`:
  ```ts
  export type UnitClass = 'villager' | 'scout' | 'infantry' | 'archer' | 'skirmisher' | 'cavalry' | 'siege' | 'hero' | 'myth' | 'titan' | 'ship';
  // UnitDef, depois de canBuild?:
  naval?: boolean;                 // E4: navio (camada naval; src/core/map/naval.ts)
  capacity?: number;               // E4: transporte — população que leva a bordo
  // BuildingDef, depois de gate?:
  shore?: boolean;                 // E4: fica na margem (shoreOk) em território próprio ou neutro
  navalDropoff?: ResourceType[];   // E4: recursos que NAVIOS entregam aqui (o Estaleiro recebe o peixe)
  // Effect gather: resource: ResourceType | 'hunt' | 'farm' | 'fish' | 'all'
  // PlayerMods.gather: Record<ResourceType | 'hunt' | 'farm' | 'fish', number>
  // Order.type: … | 'garrison' | 'embark' | 'unload'
  // Unit, depois de inside:
  cargo: number[];                 // E4: ids a bordo (só transportes; o passageiro tem inside = id do navio)
  // GameConfig, junto de unitLines (E3):
  naval?: boolean;                 // E4: navios em cenário; padrão ligados fora de cenário e desligados em cenário (navalOn)
  // AIState:
  navy?: { phase: number; ship: number; x: number; y: number; since: number };   // E4: desembarque (manageInvasion); ausente = parado
  // Command:
  | { type: 'embark'; player: number; ids: number[]; targetId: number; queue?: boolean }
  | { type: 'unload'; player: number; ids: number[]; x: number; y: number; queue?: boolean }
  ```
  `modifiers.ts` `defaultMods().gather`: acrescente `fish: 1` **no fim** do literal. `entities.ts` `spawnUnit`:
  `cargo: []` no literal da unidade (depois de `inside: -1`). `serialize.ts` `deserialize`, no objeto da unidade:
  `cargo: Array.isArray(u.cargo) ? u.cargo : []`. O typecheck acusa os `Record<NodeType, …>` sem as linhas novas
  (`NODE_AMOUNT` em `mapgen.ts`: `fish: 450, rare_fish: 99999`; `NODE_ICONS` em `panel.ts`: preencha já como no passo D7)
  e o `Record<MapType, …>` de `MAP_PRESETS` em `mapgen.ts`: acrescente **já** `coastal`, `islands` e `mediterranean` com
  os números de `continental` (o passo D1.1 só confere). Se o `deserialize` ainda montar o `mods` com um literal
  `gather: { food: 1, … farm: 1 }` (a E2 o troca por `mods.defaultMods()`), acrescente `fish: 1` nele também.
  Confira também que `isNodeType` de `src/editor/ops.ts` já é a versão da E2 (`hasOwnProperty.call(NODE_AMOUNT, t)`):
  com a lista fixa de antes, `b.nodes('fish', …)` do `egeu.ts` é recusado **em silêncio** e o Egeu sai sem peixe.
- [ ] **A2. `src/core/map/naval.ts` (novo).** O arquivo inteiro:
  ```ts
  // Camada naval (E4; docs/eras/E4-naval.md): onde um navio pode estar. Derivada do terreno, dos nós e dos edifícios —
  // nunca salva nem no hash —, calculada sob demanda e descartada junto das regiões (components.invalidateComponents chama
  // invalidateNaval). Navegável = água rasa, profunda e baixio sem nó; o baixio também é caminhável (camada terrestre).
  import { TERRAIN, SHIP_NODES } from '../constants';
  import type { GameMap } from '../types';

  /** Camada de movimento: terrestre (map.blocked + portões) ou naval (navalBlocked). */
  export type Layer = 'land' | 'naval';
  export const layerOf = (def: { naval?: boolean }): Layer => (def.naval ? 'naval' : 'land');
  /** Água em que navio navega (inclui o baixio). Também é "água" para o renderizador e o áudio. */
  export const isNavigableTerrain = (t: number): boolean => t === TERRAIN.WATER || t === TERRAIN.DEEP || t === TERRAIN.SHALLOWS;
  /** Água aberta: onde há peixe e o que conta para o Estaleiro (o baixio não). */
  export const isOpenWater = (t: number): boolean => t === TERRAIN.WATER || t === TERRAIN.DEEP;
  /** Bloqueia a camada terrestre (a regra de rebuildBlocked de sempre): água aberta e montanha. */
  export const isLandBlockedTerrain = (t: number): boolean => t === TERRAIN.WATER || t === TERRAIN.DEEP || t === TERRAIN.MOUNTAIN;
  /** Não se constrói nem se põe nó terrestre: toda água (com o baixio) e montanha. */
  export const isUnbuildableTerrain = (t: number): boolean => isNavigableTerrain(t) || t === TERRAIN.MOUNTAIN;
  /** O nó `type` cabe num tile de terreno `t`? Peixe só em água aberta; os demais só em terra construível. */
  export const nodeFitsTerrain = (type: string, t: number): boolean => (SHIP_NODES.has(type) ? isOpenWater(t) : !isUnbuildableTerrain(t));
  /** Mar mínimo (tiles da região naval) para Estaleiro e peixe: lagoas menores não têm frota. */
  export const MIN_DOCK_WATER = 60;

  const cache = new WeakMap<GameMap, Uint8Array>();
  /** 1 = navio não passa (terra, montanha, nó, edifício). */
  export function navalBlocked(map: GameMap): Uint8Array {
    let nb = cache.get(map);
    if (!nb) {
      nb = new Uint8Array(map.w * map.h);
      for (let i = 0; i < nb.length; i++) nb[i] = isNavigableTerrain(map.terrain[i]) && map.nodeAt[i] === -1 && map.buildingAt[i] === -1 ? 0 : 1;
      cache.set(map, nb);
    }
    return nb;
  }
  export function invalidateNaval(map: GameMap): void { cache.delete(map); }
  ```
- [ ] **A3. `grid.ts`.** `import { navalBlocked, type Layer } from './naval';` e:
  ```ts
  export function isPassable(map: GameMap, x: number, y: number, layer: Layer = 'land'): boolean {
    if (!inBounds(map, x, y)) return false;
    const i = idx(map, x, y);
    return layer === 'naval' ? navalBlocked(map)[i] === 0 : map.blocked[i] === 0;
  }
  export function canPass(map: GameMap, x: number, y: number, team: number, layer: Layer = 'land'): boolean {
    if (!inBounds(map, x, y)) return false;
    const i = idx(map, x, y);
    if (layer === 'naval') return navalBlocked(map)[i] === 0;   // no mar não há portão
    return map.blocked[i] === 0 || (team >= 0 && map.gateTeam[i] === team);
  }
  ```
  `canStep(map, x0, y0, x1, y1, team, layer: Layer = 'land')` e `lineClear(map, x0, y0, x1, y1, team = -1, layer: Layer = 'land')`:
  passe `layer` a todo `canPass` de dentro delas. Nada mais muda.
- [ ] **A4. `pathfinding.ts`.** `findPath(..., team = -1, layer: Layer = 'land')` repassa a `findPathEx(..., team, layer)`.
  Em `findPathEx`, troque a linha do `pass` por:
  ```ts
  const nb = layer === 'naval' ? navalBlocked(map) : null;
  const pass = nb ? (i: number) => nb[i] === 0 : (i: number) => map.blocked[i] === 0 || (team >= 0 && map.gateTeam[i] === team);
  ```
  e o retorno por `smoothPath(map, sx, sy, tiles, team, layer)`; `smoothPath(..., team = -1, layer: Layer = 'land')` usa
  `lineClear(map, ax, ay, tiles[2 * j], tiles[2 * j + 1], team, layer)`. `nearestFreeTile(map, x, y, maxR = 12, f = IDENTITY_FRAME, layer: Layer = 'land')`
  usa `isPassable(map, …, layer)` nas duas chamadas.
- [ ] **A5. `components.ts`.**
  1. `import { invalidateNaval, isOpenWater, navalBlocked, MIN_DOCK_WATER, type Layer } from './naval';`
  2. Um segundo cache e invalidação conjunta:
     ```ts
     const navalCache = new WeakMap<GameMap, Components>();   // E4: regiões do mar
     export function invalidateComponents(map: GameMap): void { cache.delete(map); navalCache.delete(map); invalidateNaval(map); }
     ```
  3. `compute(map, pass: (i: number) => boolean)`: troque os 5 `passable(map, X)` do corpo por `pass(X)`.
  4. `get(map, layer: Layer = 'land')`:
     ```ts
     function get(map: GameMap, layer: Layer = 'land'): Components {
       const store = layer === 'naval' ? navalCache : cache;
       let c = store.get(map);
       if (!c) {
         if (layer === 'naval') { const nb = navalBlocked(map); c = compute(map, (i) => nb[i] === 0); }
         else c = compute(map, (i) => passable(map, i));
         store.set(map, c);
       }
       return c;
     }
     ```
  5. `componentAt(map, x, y, layer: Layer = 'land')`, `componentSize(map, label, layer: Layer = 'land')`,
     `rectReachable(map, sx, sy, tx, ty, w, h, adjacent, layer: Layer = 'land')` e
     `nearestLargeComponentTile(map, x, y, minSize, maxR = 6, layer: Layer = 'land')`: repassem `layer` a `get`/`componentAt`.
     `wouldSeal` e `articulationPoints` continuam só terrestres (não mude).
  6. No fim do arquivo:
     ```ts
     /** E4: tiles do anel da pegada (8-vizinhança, sem os 4 cantos) em água aberta, sem nó, de um mar com ≥ MIN_DOCK_WATER tiles. */
     export function shoreWaterCount(map: GameMap, tx: number, ty: number, w: number, h: number): number {
       let n = 0;
       for (let y = ty - 1; y <= ty + h; y++) for (let x = tx - 1; x <= tx + w; x++) {
         const corner = (x === tx - 1 || x === tx + w) && (y === ty - 1 || y === ty + h);
         const inside = x >= tx && x < tx + w && y >= ty && y < ty + h;
         if (corner || inside || !inBounds(map, x, y)) continue;
         const i = idx(map, x, y);
         if (!isOpenWater(map.terrain[i]) || map.nodeAt[i] !== -1) continue;
         if (componentSize(map, componentAt(map, x, y, 'naval'), 'naval') >= MIN_DOCK_WATER) n++;
       }
       return n;
     }
     /** E4: a pegada [tx, tx+w)×[ty, ty+h) fica na margem de um mar de verdade (≥ 2 tiles de água aberta encostados)? */
     export function shoreOk(map: GameMap, tx: number, ty: number, w: number, h: number): boolean { return shoreWaterCount(map, tx, ty, w, h) >= 2; }
     ```
- [ ] **A6. Bloqueio terrestre pela regra única.** Troque o teste literal `t === TERRAIN.WATER || t === TERRAIN.DEEP || t === TERRAIN.MOUNTAIN`
  por `isLandBlockedTerrain(t)` em `mapgen.ts` `rebuildBlocked` e em `serialize.ts` `deserialize` (mesmo resultado).
  Em `mapgen.ts`:
  - `addNode`: troque `if (t === TERRAIN.WATER || t === TERRAIN.DEEP || t === TERRAIN.MOUNTAIN) return null;` por
    `if (!nodeFitsTerrain(type, t)) return null;`.
  - `removeNode`: troque `map.blocked[i] = 0;` por `map.blocked[i] = isLandBlockedTerrain(map.terrain[i]) ? 1 : 0;`
    (peixe esgotado não pode abrir um tile de água para a infantaria).
  - `carveCorridor(map, x0, y0, x1, y1, fill: number = TERRAIN.SAND)`: a água vira `fill` (montanha continua virando
    terra). `ensureConnectivity(map, fill: number = TERRAIN.SAND)` repassa `fill` ao `carveCorridor`.
  - `pushUnitsOut` e `pushUnitsOutOfTile` (`entities.ts`): `if (u.dead || UNITS[u.type].flying || UNITS[u.type].naval || u.inside !== -1) continue;`.
  *Confira:* `npx vitest run tests/pathfinding.test.ts tests/fixedmap.test.ts tests/movement-ai.test.ts tests/determinism.test.ts`
  — tudo verde e **os hashes de "generateMap produz exatamente…" sem mudar** (os mapas terrestres ficam iguais).

### Bloco B — Dados

- [ ] **B1. Unidades** (`units.ts`): o bloco das 10 da tabela, `UNIT_TAGS` com `'ship'`, `oceanus.bonus`.
- [ ] **B2. Linhas** (`lines.ts`, da E3): `LineDef` e as 3 linhas; `LINE_ORDER`.
- [ ] **B3. Estudos** (`techs.ts`): em `evolutions()` da E3, troque `const citizen = id === 'citizen';` por
  `const citizen = id === 'citizen'; const keep = !!l.studyNames;   // linha que não troca de tipo (cidadãos, barcos)`
  e, no objeto do estudo, use `keep` no nome (`` keep ? `${l.name}: ${l.studyNames![k] ?? ''}` : `${l.name}: ${UNITS[to].name}` ``),
  `effects: citizen ? CITIZEN_EVO_EFFECTS : keep ? (l.studyEffects ?? []) : []` e
  `desc: citizen ? <o texto dos cidadãos de hoje> : keep ? (l.studyDesc ?? '') : <o "Treina…" de hoje>`. O custo continua
  `citizen ? comida : ouro`. Em `en-data.ts`, `evolutionsEN()` ganha o mesmo ramo:
  `LINE_STUDIES_EN[id] ? { name: \`${EN_LINES[id].name}: ${LINE_STUDIES_EN[id].names[k]}\`, desc: LINE_STUDIES_EN[id].desc } : …`
  (antes do ramo genérico, depois do dos cidadãos). Acrescente as 4 pesquisas do Estaleiro ao `RAW`.
  *Confira:* `npx tsx -e "import { TECHS } from './src/core/data'; console.log(Object.values(TECHS).filter((t) => t.evolve).length, TECHS.evo_fishing_7.name, TECHS.evo_warship_4.name)"`
  imprime `59 Barcos de pesca: A vapor Navios de guerra: Dromon`.
- [ ] **B4. Edifício, Poseidon e raro:** `shipyard` + `BUILD_MENU`; `gods.ts`; `rares.ts` com `rare_fish`.
- [ ] **B5. Textos:** tabela "Textos novos" (PT na tabela `pt`, EN na tabela `en`) e o inglês dos dados.
- [ ] **B6. Testes da E3 que contam linhas, degraus e estudos** (sem isto o `unit-lines` e o `studytree` ficam vermelhos):
  - `tests/unit-lines.test.ts`, `it` dos dados das linhas: troque `if (id !== 'citizen') l.steps.forEach(…)` por
    `if (!LINES[id].studyNames) l.steps.forEach(…)` (as linhas que não trocam de tipo — cidadãos, `fishing`, `transport` —
    repetem o tipo da base no degrau do estudo, com `tier` 0).
  - `it('50 estudos de evolução…')`: `50` → `59` (no título, em `expect(n)` e no `toHaveLength`).
  - `it('as 41 novas…')`: `41` → `48` (os 7 degraus `lineOnly` da linha `warship`).
  - `it('dentro de cada linha, vida e custo crescem…')`: troque `if (id === 'citizen') continue;` por
    `if (LINES[id].studyNames) continue;`.
  - `tests/studytree.test.ts` (o `it` da E3): `toHaveLength(9)` → `toHaveLength(12)` (as linhas `evo:` ganham `fishing`,
    `transport` e `warship`).
  *Confira:* `npx vitest run tests/data.test.ts tests/i18n.test.ts tests/unit-lines.test.ts tests/studytree.test.ts` (o de
  dados ainda falha nos atalhos e edifícios se algo da tabela ficou de fora: corrija até passar; o "unidades referenciam
  edifícios" da E3 cobre os degraus `lineOnly`).

### Bloco C — Núcleo: movimento, coleta, combate, transporte e comandos

- [ ] **C1. `src/core/sim/naval.ts` (novo).** O arquivo inteiro:
  ```ts
  // Navios no núcleo (E4; docs/eras/E4-naval.md): onde parar para alcançar um alvo no outro meio, onde encostar na margem,
  // embarque e desembarque, entrega de peixe. Determinístico: só o estado; desempates pelo centro do mapa e por frameCompare
  // (justiça de posição, CLAUDE.md), nunca pela ordem da varredura.
  import { UNITS, BUILDINGS } from '../data';
  import type { Building, GameMap, GameState, Unit } from '../types';
  import type { ResourceType } from '../constants';
  import { centerFrame, distToRect, dist, frameCompare, isPassable, spiralSearchFrame, towardFrame } from '../map/grid';
  import { componentAt, rectReachable } from '../map/components';
  import { type Layer } from '../map/naval';
  import { centerDist2, nearestDropoff, nodeAccessTiles } from './queries';
  import { openTile } from './entities';

  /** Desempate justo entre dois candidatos à mesma distância: o mais perto do centro do mapa; depois frameCompare no
   *  referencial de `ref` voltado ao centro. true = `a` ganha de `b`. */
  export function fairer(map: GameMap, ref: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
    const ca = centerDist2(map, a.x + 0.5, a.y + 0.5), cb = centerDist2(map, b.x + 0.5, b.y + 0.5);
    if (ca !== cb) return ca < cb;
    return frameCompare(centerFrame(map, ref.x, ref.y), a.x - b.x, a.y - b.y, 0, 0) < 0;
  }

  /** Tile da camada `layer`, na mesma região de (fx, fy), a até `reach` do alvo (centro do tile ao ponto mais próximo
   *  dele): o mais perto de quem anda. null = o alvo está longe demais da água (ou da terra). */
  export function approachTile(map: GameMap, layer: Layer, fx: number, fy: number, target: Unit | Building, reach: number): { x: number; y: number } | null {
    const from = componentAt(map, Math.floor(fx), Math.floor(fy), layer);
    if (from < 0) return null;
    const R = Math.ceil(reach) + 1;
    const b = target.kind === 'building' ? target : null;
    const x0 = b ? b.tx : Math.floor(target.x), y0 = b ? b.ty : Math.floor(target.y), w = b ? b.w : 1, h = b ? b.h : 1;
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (let y = y0 - R; y < y0 + h + R; y++) for (let x = x0 - R; x < x0 + w + R; x++) {
      if (!isPassable(map, x, y, layer) || componentAt(map, x, y, layer) !== from) continue;
      const cx = x + 0.5, cy = y + 0.5;
      const dT = b ? distToRect(cx, cy, b.tx, b.ty, b.w, b.h) : dist(cx, cy, target.x, target.y);
      if (dT > reach) continue;
      const d = (cx - fx) * (cx - fx) + (cy - fy) * (cy - fy);
      if (d < bd || (d === bd && best && fairer(map, target, { x, y }, best))) { bd = d; best = { x, y }; }
    }
    return best;
  }

  /** Tile navegável do mar do navio em (sx, sy), encostado (4-vizinhança) num tile caminhável, mais perto de (x, y), a até
   *  maxR. É onde o navio encosta para embarcar ou desembarcar. */
  export function shoreTileNear(map: GameMap, sx: number, sy: number, x: number, y: number, maxR = 12): { x: number; y: number } | null {
    const sea = componentAt(map, Math.floor(sx), Math.floor(sy), 'naval');
    if (sea < 0) return null;
    const ox = Math.floor(x), oy = Math.floor(y);
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (let ty = oy - maxR; ty <= oy + maxR; ty++) for (let tx = ox - maxR; tx <= ox + maxR; tx++) {
      if (componentAt(map, tx, ty, 'naval') !== sea) continue;
      if (!isPassable(map, tx + 1, ty) && !isPassable(map, tx - 1, ty) && !isPassable(map, tx, ty + 1) && !isPassable(map, tx, ty - 1)) continue;
      const cx = tx + 0.5, cy = ty + 0.5, d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (d > maxR * maxR) continue;
      if (d < bd || (d === bd && best && fairer(map, { x, y }, { x: tx, y: ty }, best))) { bd = d; best = { x: tx, y: ty }; }
    }
    return best;
  }

  /** Lugar que a unidade ocupa a bordo: a população dela, no mínimo 1 (milícia, rei e Sombras têm pop 0 e não podem
   *  lotar um transporte infinito). */
  export const seatsOf = (type: string): number => Math.max(1, UNITS[type].pop);
  /** Lugares ocupados a bordo. */
  export function cargoPop(state: GameState, ship: Unit): number {
    let n = 0;
    for (const id of ship.cargo) { const u = state.units.get(id); if (u && !u.dead) n += seatsOf(u.type); }
    return n;
  }
  /** A unidade pode embarcar neste transporte agora (dono, tipo e lugar)? Quem carrega relíquia não embarca (afundando,
   *  a relíquia cairia no mar, onde ninguém a recolhe). */
  export function canBoard(state: GameState, u: Unit, ship: Unit): boolean {
    const d = UNITS[u.type], sd = UNITS[ship.type];
    if (!sd.capacity || ship.dead || u.dead || u.id === ship.id || ship.owner !== u.owner || u.inside !== -1 || ship.inside !== -1) return false;
    if (d.naval || d.flying || d.immobile || d.tags.includes('titan')) return false;
    if (state.relics.some((r) => r.carrier === u.id)) return false;
    return cargoPop(state, ship) + seatsOf(u.type) <= sd.capacity;
  }
  /** Sobe a bordo (como enterGarrison: some do mapa e para de pensar). */
  export function boardShip(state: GameState, u: Unit, ship: Unit): boolean {
    if (!canBoard(state, u, ship)) return false;
    u.inside = ship.id; u.state = 'garrison'; u.order = null; u.queue.length = 0; u.path = null; u.targetId = -1; u.nodeId = -1; u.resumeNodeId = -1;
    u.x = ship.x; u.y = ship.y; u.px = u.x; u.py = u.y;
    ship.cargo.push(u.id);
    return true;
  }
  /** Desce a carga nos tiles caminháveis livres a até 3 tiles do navio, começando pelo lado de (toX, toY). Devolve quem
   *  desceu (quem não coube fica a bordo). Quem chama dá as ordens (evita ciclo units ↔ naval). */
  export function dropCargo(state: GameState, ship: Unit, toX: number, toY: number): Unit[] {
    const map = state.map, out: Unit[] = [], left: number[] = [], taken = new Set<number>();
    const f = towardFrame(toX - ship.x, toY - ship.y, centerFrame(map, ship.x, ship.y));
    for (const id of ship.cargo) {
      const u = state.units.get(id);
      if (!u || u.dead) continue;
      const t = spiralSearchFrame(Math.floor(ship.x), Math.floor(ship.y), 3, (a, b) => openTile(state, a, b) && !taken.has(b * map.w + a), f);
      if (!t) { left.push(id); continue; }
      taken.add(t.y * map.w + t.x);
      u.inside = -1; u.state = 'idle'; u.order = null; u.path = null; u.targetId = -1; u.orderTick = state.tick;
      u.x = t.x + 0.5; u.y = t.y + 0.5; u.px = u.x; u.py = u.y;
      out.push(u);
    }
    ship.cargo = left;
    return out;
  }
  /** Estaleiro (navalDropoff) do dono que aceita `res` e que o navio alcança pelo mar; o mais perto, desempate justo. */
  export function nearestNavalDropoff(state: GameState, owner: number, x: number, y: number, res: ResourceType, avoid?: number[]): Building | null {
    const map = state.map, sx = Math.floor(x), sy = Math.floor(y);
    let best: Building | null = null, bd = Infinity;
    for (const b of state.buildings.values()) {
      if (b.owner !== owner || b.dead || !b.complete || (avoid && avoid.includes(b.id))) continue;
      if (!BUILDINGS[b.type].navalDropoff?.includes(res)) continue;
      if (!rectReachable(map, sx, sy, b.tx, b.ty, b.w, b.h, true, 'naval')) continue;
      const d = distToRect(x, y, b.tx, b.ty, b.w, b.h);
      if (d < bd || (d === bd && best && fairer(map, { x, y }, { x: b.tx, y: b.ty }, { x: best.tx, y: best.ty }))) { bd = d; best = b; }
    }
    return best;
  }
  /** Ponto de entrega da unidade: navio só entrega no Estaleiro pelo mar; o resto, como sempre. */
  export function dropoffFor(state: GameState, u: Unit, res: ResourceType, avoid?: number[]): Building | null {
    return UNITS[u.type].naval ? nearestNavalDropoff(state, u.owner, u.x, u.y, res, avoid) : nearestDropoff(state, u.owner, u.x, u.y, res, avoid);
  }
  /** Cardumes (fish, com quantidade e acesso pelo mar) a até r de (x, y). */
  export function fishNear(state: GameState, x: number, y: number, r = 26): number {
    let n = 0;
    for (const nd of state.map.nodes.values()) if (nd.type === 'fish' && nd.amount > 0 && dist(nd.x + 0.5, nd.y + 0.5, x, y) <= r && nodeAccessTiles(state.map, nd) > 0) n++;
    return n;
  }
  ```
  Dependências: `sim/naval.ts` importa `queries.ts` e `entities.ts`; **nenhum** dos dois importa `sim/naval.ts` (sem ciclo).
- [ ] **C2. `queries.ts`.**
  - `nodeAccessTiles(map, n)`: conte pela camada do nó —
    `const nb = SHIP_NODES.has(n.type) ? navalBlocked(map) : map.blocked;` e `if (inBounds(map, x, y) && nb[idx(map, x, y)] === 0) c++;`.
  - `canWorkNode` (da E2), **primeiras** linhas do corpo:
    ```ts
    const fisher = !!UNITS[unitType]?.naval && !!UNITS[unitType]?.canGather;
    if (SHIP_NODES.has(node.type)) return fisher ? { ok: true } : { ok: false, reason: t('err.boatOnly') };
    if (fisher) return { ok: false, reason: t('err.fishOnly') };
    ```
- [ ] **C3. `entities.ts`.**
  - `openTile(state, x, y, layer: Layer = 'land')`: `isPassable(state.map, x, y, layer) && componentSize(state.map, componentAt(state.map, x, y, layer), layer) >= (layer === 'naval' ? MIN_DOCK_WATER : 8)`.
  - `findSpawnTile(state, b, towardX?, towardY?, layer: Layer = 'land')`: `openTile(state, x, y, layer)` no anel e
    `isPassable(map, x, y, layer)` no fallback.
  - `canPlaceBuilding`: no laço, troque o teste de terreno por `if (isUnbuildableTerrain(tt)) return { ok: false, reason: t('err.terrain') };`
    e `if (type === 'town_center') {` por `if (type === 'town_center' || def.shore) {`. Depois do laço, **antes** do
    `return { ok: true }` (vale também com `force`, para o editor e os cenários):
    `if (def.shore && !shoreOk(map, tx, ty, def.w, def.h)) return { ok: false, reason: t('err.needsShore') };`.
  - `canGarrison`: na linha das tags, acrescente `|| def.naval` ao `if` que devolve `false` (o barco de pesca tem a tag
    `civilian`, que está em `GARRISON_TAGS`: sem isto ele entraria num Centro Cívico da costa e, ao sair, `ejectGarrison`
    o poria em terra).
  - `removeUnitNow`: troque a linha do `inside` por
    ```ts
    if (u.inside !== -1) { const g = state.buildings.get(u.inside); if (g) g.garrison = g.garrison.filter((id) => id !== u.id); const sh = state.units.get(u.inside); if (sh) sh.cargo = sh.cargo.filter((id) => id !== u.id); u.inside = -1; }
    for (const id of u.cargo) { const p = state.units.get(id); if (p && !p.dead) { p.inside = -1; removeUnitNow(state, p); } }   // E4: a carga sai junto
    u.cargo = [];
    ```
- [ ] **C4. `buildings.ts` `completeQueueItem`:** troque a linha do `spot` por
  `const spot = findSpawnTile(state, b, toward, b.rallyY >= 0 ? b.rallyY : undefined, layerOf(def));` (com o tipo que a E3
  resolve ao nascer: use o `def` desse tipo).
- [ ] **C5. `units.ts` — movimento pela camada.** Em `moveTowards`, no começo: `const layer = layerOf(def);` e passe
  `layer` a: `canPass(map, sx, sy, team, layer)`; `nearestFreeTile(…, layer)` (as duas); `componentSize(map, componentAt(map, sx, sy, layer), layer)`;
  `nearestLargeComponentTile(map, sx, sy, 8, 6, layer)`; `rectReachable(…, adjacent, layer)`; os dois `findPathEx(…, team, layer)`;
  e os dois `canPass(map, Math.floor(tx), Math.floor(ty), team, layer)`. `stepTo(u, tx, ty, step, map, fly, team, layer: Layer = 'land')`
  e `moveExact(u, x, y, map, team, layer: Layer = 'land')` passam `layer` aos `canStep`; em `moveTowards` todas as
  chamadas a `stepTo`/`moveExact` passam `layer`. `applySeparation`: pule pares de meios diferentes
  (`if (o === u || o.dead || UNITS[o.type].flying || !!UNITS[o.type].naval !== !!def.naval) return;`) e use
  `canStep(map, u.x, u.y, nx, ny, team, layerOf(def))`.
- [ ] **C6. `combat.ts`.** `ATTACK_INTERVAL` com `ship: 2.0`. Em `canTarget`, depois da linha dos voadores:
  ```ts
  // E4: corpo a corpo não alcança o outro meio (terra × mar); os titãs alcançam (golpe gigante, Oceano na margem)
  if (attacker.kind === 'unit' && isMelee(state, attacker) && !UNITS[attacker.type].tags.includes('titan')) {
    const an = !!UNITS[attacker.type].naval, tn = target.kind === 'unit' && !!UNITS[target.type].naval;
    if (an !== tn) return false;
  }
  ```
  Em `killUnit`:
  1. Logo antes de `u.dead = true; u.hp = 0;`:
     `const drowned = u.inside !== -1 && state.units.has(u.inside);   // E4: passageiro de um navio que afundou`.
  2. Troque a linha do `inside` pela mesma de `removeUnitNow` (sai do edifício **ou** do navio: só a primeira linha do
     bloco de C3, a que filtra `g.garrison` e `sh.cargo`).
  3. Na condição das Sombras de Hades, acrescente `!drowned &&` **antes** de `state.rng.chance(0.25)` (senão a Sombra
     nasce na água, presa; em partida terrestre `drowned` é sempre falso e o rng é consumido como antes).
  4. Logo depois de `recomputePop(state, victim);` no fim, afunde a carga:
     ```ts
     if (u.cargo.length) {   // E4: o navio afundou com a tropa
       for (const id of u.cargo) {
         const p = state.units.get(id);
         if (!p || p.dead) continue;
         p.x = u.x; p.y = u.y; p.px = p.x; p.py = p.y;
         killUnit(state, p, killerOwner, killer);           // ainda com inside = navio: sai da carga e não vira Sombra (drowned)
         if (!p.dead) { p.inside = -1; p.state = 'idle'; }  // hpFloor de cenário: sobrevive na água (aceito; navios desligados em cenário)
       }
       u.cargo = [];
     }
     ```
     O `for…of` percorre o array antigo do navio: o `filter` dentro do `killUnit` do passageiro troca `u.cargo` por um
     array novo e não atrapalha o laço.
- [ ] **C7. `units.ts` — ataque entre meios.** No `case 'attack'` de `updateUnit`, logo antes de `const goal: PathGoal = …`:
  ```ts
  // E4: alvo no outro meio: vai ao tile do SEU meio de onde o alcança (o fim do caminho guarda esse tile entre repaths)
  const layer = layerOf(def), tLayer = t.kind === 'unit' ? layerOf(UNITS[t.type]) : 'land';
  if (layer !== tLayer && !def.flying) {   // voador vai em linha reta pelo caminho de sempre (a E6 cuida de voador × navio)
    let ax: number, ay: number;
    if (u.path && u.path.length >= 2 && state.tick < u.repathAt) { ax = u.path[u.path.length - 2]; ay = u.path[u.path.length - 1]; }
    else {
      const a = approachTile(state.map, layer, u.x, u.y, t, reach - 0.2);
      if (!a) { giveUpTarget(state, u, t.id); return; }
      ax = a.x + 0.5; ay = a.y + 0.5; u.path = null;
    }
    if (moveTowards(state, rt, u, spd * dt, ax, ay, null) === 'blocked') giveUpTarget(state, u, t.id);
    return;
  }
  ```
  **Não** use `u.tx/u.ty` para guardar o tile (o `attackMove` volta para eles depois da luta).
- [ ] **C8. `units.ts` — coleta e entrega de navio.**
  - `updateGather`, depois de `if (HUNT_TYPES.has(node.type)) rate *= player.mods.gather.hunt;`:
    `if (node.type === 'fish') rate *= player.mods.gather.fish;`.
  - `pickNewSource`, primeira linha: barco procura só cardume —
    ```ts
    if (UNITS[u.type].naval) { const av0 = avoided(state, u); const n = nearestNodeWithRoom(state, u.x, u.y, 'fish', 20, -1, av0) ?? nearestNode(state, u.x, u.y, 'fish', 20, -1, (x) => !(av0 && av0.includes(x.id))); return n ? n.id : null; }
    ```
  - `updateReturn` e o `case 'idle'` (retomada da entrega): troque `nearestDropoff(state, u.owner, u.x, u.y, X, av)` por
    `dropoffFor(state, u, X, av)`.
- [ ] **C9. `units.ts` — ordens novas.** Em `startOrder`:
  ```ts
  case 'embark': {
    const ship = state.units.get(order.targetId!);
    if (!ship || !canBoard(state, u, ship)) { finishOrder(state, u); return; }
    u.state = 'move'; u.targetId = ship.id; break;
  }
  case 'unload': {
    if (!def.capacity || u.cargo.length === 0) { finishOrder(state, u); return; }
    const w = shoreTileNear(state.map, u.x, u.y, order.x!, order.y!, 20);
    if (!w) { if (!state.players[u.owner].isAI) state.events.push({ tick: state.tick, type: 'naval', player: u.owner, x: u.x, y: u.y, text: t('ev.noLanding') }); finishOrder(state, u); return; }
    u.state = 'move'; u.tx = w.x + 0.5; u.ty = w.y + 0.5; break;
  }
  ```
  No `case 'move'` de `updateUnit`, antes do ramo do `garrison`:
  ```ts
  if (u.order?.type === 'embark') {   // E4: vai até a margem junto do navio e sobe quando ele encosta
    const ship = state.units.get(u.targetId);
    if (!ship || !canBoard(state, u, ship) || state.tick - u.orderTick > 45 * TICK_RATE) { finishOrder(state, u); return; }
    if (dist(u.x, u.y, ship.x, ship.y) <= def.radius + UNITS[ship.type].radius + 1.0) { if (!boardShip(state, u, ship)) finishOrder(state, u); return; }
    if (u.path || state.tick >= u.repathAt) { if (moveTowards(state, rt, u, spd * dt, ship.x, ship.y, null) !== 'moving') { u.path = null; u.repathAt = state.tick + TICK_RATE; } }
    return;
  }
  if (u.order?.type === 'unload') {   // E4: o transporte encosta na margem e a carga desce
    if (moveTowards(state, rt, u, spd * dt, u.tx, u.ty, null) === 'moving') return;
    const ox = u.order.x!, oy = u.order.y!;
    const landed = dropCargo(state, u, ox, oy);
    const there = isPassable(state.map, Math.floor(ox), Math.floor(oy));
    for (const p of landed) if (there) giveOrder(state, p, { type: 'move', x: ox, y: oy });
    if (u.cargo.length && !state.players[u.owner].isAI) state.events.push({ tick: state.tick, type: 'naval', player: u.owner, x: u.x, y: u.y, text: t('ev.noLanding') });
    finishOrder(state, u); return;
  }
  ```
- [ ] **C9b. Barco de pesca não reza nem vai à fazenda** (ele tem `canGather`, que é o que essas ordens conferem hoje):
  - `units.ts` `startOrder`: no `case 'pray'`, `if (!def.canGather || def.tags.includes('merchant') || def.naval)`; no
    `case 'gather'`, na primeira linha do ramo da fazenda (onde a E2 pôs o Mercador), `|| def.naval` no mesmo `if`.
  - `commands.ts`: no `case 'pray'`, o filtro das unidades ganha `&& !UNITS[u.type].naval`; no `case 'gather'`, onde a E2
    recusa o Mercador em fazenda (`node ? canWorkNode(…) : merchant ? { ok: false, … } : { ok: true }`), recuse também o
    navio (`(merchant || UNITS[u.type].naval)`, motivo `t('err.fishOnly')`).
- [ ] **C10. `commands.ts`.**
  - `case 'move'/'attackMove'`: no laço `units.forEach`, use a camada de cada unidade:
    `const lay = layerOf(UNITS[u.type]);` e `canPass(state.map, tx, ty, player.team, lay)` nas duas chamadas (a do
    destino e a do `spiralSearchFrame`).
  - Casos novos (antes do `case 'build'`):
    ```ts
    case 'embark': {
      const ship = state.units.get(cmd.targetId);
      if (!ship || ship.dead || ship.owner !== cmd.player || !UNITS[ship.type].capacity || ship.inside !== -1) return { ok: false, reason: t('err.notTransport') };
      const riders = ownedUnits(state, cmd.player, cmd.ids).filter((u) => canBoard(state, u, ship));
      if (riders.length === 0) return { ok: false, reason: t('err.cannotBoard') };
      for (const u of riders) giveOrder(state, u, { type: 'embark', targetId: ship.id }, cmd.queue);
      if (ship.state === 'idle' && !ship.order) {   // o navio parado vem buscar: encosta na margem mais perto do grupo
        const cx = riders.reduce((s, u) => s + u.x, 0) / riders.length, cy = riders.reduce((s, u) => s + u.y, 0) / riders.length;
        const sh = shoreTileNear(state.map, ship.x, ship.y, cx, cy, 16);
        if (sh) giveOrder(state, ship, { type: 'move', x: sh.x + 0.5, y: sh.y + 0.5 });
      }
      return { ok: true };
    }
    case 'unload': {
      const ships = ownedUnits(state, cmd.player, cmd.ids).filter((u) => (UNITS[u.type].capacity ?? 0) > 0 && u.cargo.length > 0);
      if (ships.length === 0) return { ok: false, reason: t('err.nothingToUnload') };
      for (const s of ships) giveOrder(state, s, { type: 'unload', x: cmd.x, y: cmd.y }, cmd.queue);
      return { ok: true };
    }
    ```
  - `validate.ts` `sanitizeCommand`: acrescente `'embark'` ao `case 'attack': case 'gather': … case 'garrison':` e
    ```ts
    case 'unload': {
      const ids = idList(raw.ids), x = coord(raw.x, w), y = coord(raw.y, h);
      if (!ids || x === null || y === null) return null;
      return { type: 'unload', player, ids, x, y, queue };
    }
    ```
- [ ] **C11. `restrictions.ts`** (acrescente `BUILDINGS`, `UNITS` ao import de `../data`; `isScenarioConfig` a E1 pôs
  neste mesmo arquivo — `grep -n "export function isScenarioConfig" src/core/sim/restrictions.ts`):
  ```ts
  /** E4: navios ligados? Fora de cenário sempre; em cenário (campanha, Horda, JSON) só com config.naval === true. */
  export function navalOn(state: GameState): boolean { return state.config.naval ?? !isScenarioConfig(state.config); }
  ```
  Em `isForbidden`, primeira linha:
  `if (!navalOn(state) && ((kind === 'buildings' && BUILDINGS[id]?.shore) || (kind === 'units' && UNITS[id]?.naval))) return true;`.
  Em `forbiddenReason`: `if (!navalOn(state) && ((kind === 'buildings' && BUILDINGS[id]?.shore) || (kind === 'units' && UNITS[id]?.naval))) return t('err.navalOff');`
  antes da linha de hoje. `schema.ts`/`compile.ts`: `config.naval?: boolean` exatamente como o `unitLines` da E3 (tipo,
  validação booleana, cópia em `scenarioConfig`). `compile.ts` (~linha 337, ação `order` com `ungarrison`): nada a mudar
  — o laço seguinte já faz `const b = s.buildings.get(bid); if (b && !b.dead)`, que pula o id de um navio (a variável do
  estado ali é `s`, não `state`).
- [ ] **C12. Resto do núcleo.**
  - `economy.ts`, ocupação dos raros (da E2): troque `!UNITS[u.type].tags.includes('merchant')` por
    `!(UNITS[u.type].tags.includes('merchant') || (UNITS[u.type].naval && UNITS[u.type].canGather))`.
  - `powers.ts`: nas espirais da Isca, da Maldição (javali) e no `canPlaceIgnoringBuildable`, acrescente
    `&& !isUnbuildableTerrain(state.map.terrain[idx(state.map, a, b)])` (senão `addNode` recusa o baixio e o poder é
    gasto sem efeito).
  - `net/hash.ts`, no laço das unidades: `mix(u.inside); mix(u.cargo.length);`. `net/desync.ts`, na linha da unidade:
    `h = step(h, u.cargo.length);`.
  - `game.ts` `summarize`: conte `nav` (unidades `naval` do jogador) e acrescente `${nav ? ` nav=${nav}` : ''}` depois de
    `mil=${m}` (só aparece com navio: o resumo terrestre fica idêntico).
  - `game.ts` `createGame`, no laço das entidades do mapa fixo (ramo `e.kind === 'unit'`): com
    `const lay = layerOf(UNITS[e.type]);`, use `openTile(state, a, b, lay)` na espiral e
    `nearestFreeTile(map, e.x, e.y, 6, f, lay)` no fallback. Sem isso um navio posto pelo editor nasce em terra.
  - `src/main.ts` `debugSpawn` (o `window.aoe` dos playtests): `nearestFreeTile(session.state.map, x, y, 12, IDENTITY_FRAME, layerOf(UNITS[type] ?? {}))`
    (importe `UNITS`, `IDENTITY_FRAME` e `layerOf`); sem isso o transporte do `playtest-naval` nasce na praia.
  - `constants.ts`: `SIM_VERSION` +1, com a linha do histórico:
    `N = naval (E4): camada naval, Estaleiro, pesca, transporte, navios I–VIII, mapas com mar; a mesma semente em mapa terrestre dá a mesma partida, mas o hash agora inclui inside/cargo.`
  *Confira:* `npx vitest run tests/sim.test.ts tests/determinism.test.ts tests/command-fuzz.test.ts tests/economy-regressions.test.ts`
  (o fuzz precisa do passo G2 para os tipos novos; os outros passam já).

### Bloco D — Mapas: gerador, validação, Egeu e editor

- [ ] **D1. `generateMap` (`mapgen.ts`).**
  1. `MAP_PRESETS`: `coastal`, `islands` e `mediterranean` com os números de `continental`.
  2. Logo depois de `const decorN = …`:
     ```ts
     // E4: formas de mar (protótipo de 06/10/2026: 270 mapas por tipo, nenhum início sem lugar de Estaleiro, mar único).
     // Os inícios saem ANTES do terreno (o primeiro rng.float() é o mesmo de antes; os 5 tipos de hoje não passam por aqui).
     const naval = NAVAL_MAP_TYPES.has(mapType);
     const early = naval ? circleStarts(w, h, playerCount, rng.float()) : null;
     const seaN = naval ? makeNoise(seed + 303) : null;
     const mcx = w / 2, mcy = h / 2, R = Math.min(w, h) * 0.36;
     const islandR = Math.max(13, Math.min(22, Math.round(Math.min(w, h) * 0.16)));
     const centers = (early ?? []).map((s) => { const dx = mcx - s.x, dy = mcy - s.y, l = Math.sqrt(dx * dx + dy * dy) || 1; return { x: s.x + (dx / l) * (islandR - 9.5), y: s.y + (dy / l) * (islandR - 9.5) }; });
     ```
  3. No laço do terreno: `if (e < P.water) t = naval ? TERRAIN.GRASS : TERRAIN.WATER;` e, antes de `terrain[i] = t;`:
     ```ts
     if (seaN) {
       const n = (seaN.fbm(x * 0.08, y * 0.08, 3) - 0.5) * 2;
       const r = Math.sqrt((x + 0.5 - mcx) * (x + 0.5 - mcx) + (y + 0.5 - mcy) * (y + 0.5 - mcy));
       if (mapType === 'coastal') { if (r > R + 10 + n * 1.5 || Math.min(x, y, w - 1 - x, h - 1 - y) < 3) t = TERRAIN.WATER; }
       else if (mapType === 'mediterranean') { if (r < R - 10 + n * 1.5) t = TERRAIN.WATER; }
       else if (!centers.some((c) => { const dx = x + 0.5 - c.x, dy = y + 0.5 - c.y; return Math.sqrt(dx * dx + dy * dy) < islandR + n * 1.5; })) t = TERRAIN.WATER;
     }
     ```
  4. Depois do laço e **antes** de `deriveDeepWater(map)`: montanha perto dos inícios vira terra —
     `if (early) for (const s of early) for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) { const x = s.x + dx, y = s.y + dy; if (!inBounds(map, x, y) || dx * dx + dy * dy > 13.5 * 13.5) continue; const i = idx(map, x, y); if (terrain[i] === TERRAIN.MOUNTAIN) terrain[i] = TERRAIN.DIRT; }`.
  5. Inícios: troque `for (const s of circleStarts(w, h, playerCount, rng.float())) map.starts.push(s);` por
     `for (const s of early ?? circleStarts(w, h, playerCount, rng.float())) map.starts.push(s);`.
  6. Recursos iniciais: `placeStartResources(map, rng, s, angle?: number)` com `const ang = angle ?? rng.int(0, 31);`
     na primeira linha; em `generateMap`: `for (const s of map.starts) placeStartResources(map, rng, s, naval ? landwardIndex(map, s, mapType) : undefined);`
     com, no módulo:
     ```ts
     /** Índice de CIRCLE32 mais alinhado com o vetor início → centro do mapa (sem empate: os inícios não ficam no centro). */
     function towardCenterIndex(map: GameMap, s: { x: number; y: number }): number {
       const dx = map.w / 2 - s.x, dy = map.h / 2 - s.y;
       let best = 0, bv = -Infinity;
       for (let k = 0; k < 32; k++) { const v = CIRCLE32[k][0] * dx + CIRCLE32[k][1] * dy; if (v > bv) { bv = v; best = k; } }
       return best;
     }
     /** E4: direção da terra (bosque, frutas e ouro iniciais não caem no mar) e do mar (peixe) por tipo naval. */
     function landwardIndex(map: GameMap, s: { x: number; y: number }, type: MapType): number { const c = towardCenterIndex(map, s); return type === 'mediterranean' ? (c + 8) % 32 : c; }
     function seawardIndex(map: GameMap, s: { x: number; y: number }, type: MapType): number { const c = towardCenterIndex(map, s); return type === 'mediterranean' ? c : (c + 16) % 32; }
     ```
  7. Conectividade: troque `ensureConnectivity(map);` (o de fora do `if (clearCenter)`) por
     `if (mapType !== 'islands') ensureConnectivity(map);` e, dentro do `if (clearCenter)`, use
     `ensureConnectivity(map, mapType === 'islands' ? TERRAIN.SHALLOWS : TERRAIN.SAND);` (D16). Lembre que
     `ensureConnectivity` liga cada início desconexo à região do **início 1** (não à colina): com Ilhas + KotH saem
     corredores de baixio entre as ilhas; o baixio é navegável, então o mar continua um só.
  8. Última linha de `generateMap`, depois do `placeEraResources` da E2: `placeNavalResources(map, seed, mapType);`.
- [ ] **D2. `placeNavalResources` (`mapgen.ts`).**
  ```ts
  /** E4: cardumes e atum nos tipos com mar, com RNG próprio, depois de toda a geração (não mexe em nenhum nó antigo). */
  export function placeNavalResources(map: GameMap, seed: number, mapType: MapType): void {
    if (!NAVAL_MAP_TYPES.has(mapType)) return;
    const rng = new RNG((seed ^ 0x6a09e667) >>> 0);
    const bigSea = (x: number, y: number): boolean => inBounds(map, x, y) && isOpenWater(map.terrain[idx(map, x, y)]) && map.nodeAt[idx(map, x, y)] === -1 && componentSize(map, componentAt(map, x, y, 'naval'), 'naval') >= MIN_DOCK_WATER;
    const free = (x: number, y: number): boolean => {
      if (!bigSea(x, y)) return false;
      let open = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && bigSea(x + dx, y + dy)) open++;
      return open >= 5;   // cardume no meio da água, com vaga para 2 barcos
    };
    const cluster = (type: NodeType, cx: number, cy: number, radius: number, count: number): number => {
      let placed = 0, tries = 0;
      while (placed < count && tries++ < count * 12) {
        const x = Math.round(cx + rng.range(-radius, radius)), y = Math.round(cy + rng.range(-radius, radius));
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > radius * radius + 1 || !free(x, y)) continue;
        if (addNode(map, type, x, y)) placed++;
      }
      return placed;
    };
    const at = (s: { x: number; y: number }, a: number, r: number): [number, number] => { const k = ((a % 32) + 32) % 32; return [s.x + Math.round(CIRCLE32[k][0] * r), s.y + Math.round(CIRCLE32[k][1] * r)]; };
    const around = (s: { x: number; y: number }, type: NodeType, a: number, r: number, radius: number, count: number): number => {
      let placed = 0;
      for (const k of [0, 1, -1, 2, -2, 3, -3]) { if (placed >= count) break; placed += cluster(type, ...at(s, a + k, r), radius, count - placed); }
      return placed;
    };
    const FISH_PER_START = 9;
    for (const s of map.starts) {
      const sea = seawardIndex(map, s, mapType);
      let placed = 0, tuna = false;
      // direção do mar; se ela não comportar os 9 peixes (Ilhas 80×80: atrás de uma ilha alinhada a um eixo sobra ~1,7
      // tile de mar), os lados e o lado oposto completam — r0 ≤ 20, para os cardumes caberem em FISH_RADIUS (24)
      for (const dir of [sea, sea + 8, sea - 8, sea + 16]) {
        if (placed >= FISH_PER_START) break;
        let r0 = -1;
        for (let r = 6; r <= 20; r++) { const [x, y] = at(s, dir, r); if (bigSea(x, y)) { r0 = r; break; } }
        if (r0 < 0) continue;
        for (const [k, dr] of [[0, 2.5], [4, 3], [-4, 3]] as const) {
          if (placed >= FISH_PER_START) break;
          placed += around(s, 'fish', dir + k, r0 + dr, 1.6, Math.min(3, FISH_PER_START - placed));
        }
        if (!tuna) tuna = around(s, 'rare_fish', dir, r0 + 8, 2.0, 1) > 0;
      }
    }
    let seaTiles = 0;
    for (let i = 0; i < map.w * map.h; i++) if (isOpenWater(map.terrain[i])) seaTiles++;
    const extra = Math.round(seaTiles / 450);
    for (let k = 0; k < extra; k++) {
      const x = rng.int(4, map.w - 5), y = rng.int(4, map.h - 5);
      if (map.starts.some((s) => dist(s.x, s.y, x, y) < 20)) continue;
      cluster('fish', x, y, 1.6, 3);
    }
  }
  ```
  *Confira:* `npx tsx scripts/export-map.ts /tmp/e4/ilhas.map.json --size medium --seed 42 --type islands --players 4`
  (crie `/tmp/e4`) imprime 0 erros; repita com `coastal` e `mediterranean` e com `--size small`/`large`. **Não** use
  `npm run map:export … --size …` sem `--`: o npm 10 engole as opções (`--size small` vira o posicional `small`) e o
  script responde só com o "Uso:". Se for pelo npm, `npm run map:export -- /tmp/e4/ilhas.map.json --size medium …`.
- [ ] **D3. `fixed.ts` (validação e tabela).**
  - Troque o `isSolid` local por imports de `./naval` e use, em cada ponto: nó →
    `if (!nodeFitsTerrain(type, terrain[i])) { err(SHIP_NODES.has(type) ? 'fishOnLand' : 'nodeOnBlocked', x, y); continue; }`;
    CC do kit e pegada de edifício → `isUnbuildableTerrain(terrain[i])`; unidade →
    `UNITS[e.type].naval ? (!isNavigableTerrain(t) && err('shipOnLand', e.x, e.y)) : (isLandBlockedTerrain(t) && err('entityOverlap', …))`
    (escreva com `if`); `blocked` do mapa temporário → `isLandBlockedTerrain(terrain[i]) || nodeAt[i] !== -1`;
    `pocketBoundedByTerrain` (o `isSolid(map.terrain[ni])`, ~linha 684) → `isLandBlockedTerrain(map.terrain[ni])`. Depois
    disso apague a constante local `isSolid`: `grep -n "isSolid" src/core/map/fixed.ts` tem de sair vazio.
  - Edifício pré-colocado com `shore` sem `shoreOk(map, e.x, e.y, bw, bh)` (no mapa temporário, depois do `blocked`) →
    `err('shoreNoWater', e.x, e.y)`.
  - `accessTiles` para peixe: conte tiles com `isNavigableTerrain(terrain)` e `nodeAt === -1` (o `nodeNoAccess` vale para
    peixe pelo mar).
  - Exporte, perto de `startResourceTable`:
    ```ts
    /** E4: raio de busca do lugar de Estaleiro e do peixe por início (a costa do Egeu fica a ~19 tiles). */
    export const SHIPYARD_SITE_RADIUS = 24, FISH_RADIUS = 24;
    /** E4: há lugar para um Estaleiro 3×3 a até r do início (pegada livre e construível, mar aberto encostado)? */
    export function hasShipyardSite(map: GameMap, sx: number, sy: number, r = SHIPYARD_SITE_RADIUS): boolean {
      for (let ty = sy - r; ty <= sy + r - 2; ty++) for (let tx = sx - r; tx <= sx + r - 2; tx++) {
        if (dist(tx + 1.5, ty + 1.5, sx + 0.5, sy + 0.5) > r) continue;
        let ok = true;
        for (let y = ty; y < ty + 3 && ok; y++) for (let x = tx; x < tx + 3; x++) { if (!inBounds(map, x, y)) { ok = false; break; } const i = idx(map, x, y); if (isUnbuildableTerrain(map.terrain[i]) || map.blocked[i] !== 0) { ok = false; break; } }
        if (ok && shoreOk(map, tx, ty, 3, 3)) return true;
      }
      return false;
    }
    /** E4: região naval do mar grande (≥ MIN_DOCK_WATER) mais perto do início, a até r; -1 se nenhum. */
    export function seaOfStart(map: GameMap, sx: number, sy: number, r = SHIPYARD_SITE_RADIUS): number {
      let best = -1, bd = Infinity;
      for (let y = sy - r; y <= sy + r; y++) for (let x = sx - r; x <= sx + r; x++) {
        if (!inBounds(map, x, y) || !isOpenWater(map.terrain[idx(map, x, y)])) continue;
        const c = componentAt(map, x, y, 'naval');
        if (c < 0 || componentSize(map, c, 'naval') < MIN_DOCK_WATER) continue;
        const d = (x - sx) * (x - sx) + (y - sy) * (y - sy);
        if (d < bd) { bd = d; best = c; }   // o rótulo só serve para comparar inícios: empate não muda o resultado
      }
      return best;
    }
    ```
  - Na análise espacial, troque a linha do `startsDisconnected` por:
    ```ts
    // E4: início sem caminho por terra até o 1 — avisa só se também não houver o mesmo mar grande (Ilhas são válidas);
    // lagos diferentes entre inícios ligados por terra não importam (o Estreito tem um lago de 190 tiles perto de cada início)
    const seaComp = starts.map(([sx, sy]) => seaOfStart(map, sx, sy));
    for (let p = 1; p < starts.length; p++) {
      if (startComp[p] === startComp[0]) continue;
      if (seaComp[p] >= 0 && seaComp[p] === seaComp[0]) continue;
      if (seaComp[p] >= 0 && seaComp[0] >= 0) warn('seasApart', starts[p][0], starts[p][1], { start: p + 1 });
      else warn('startsDisconnected', starts[p][0], starts[p][1], { start: p + 1 });
    }
    const sites = starts.map(([sx, sy]) => hasShipyardSite(map, sx, sy));
    if (sites.some(Boolean)) starts.forEach(([sx, sy], p) => { if (!sites[p]) warn('noShipyardSite', sx, sy, { start: p + 1 }); });
    ```
    O `kothUnreachable` e as relíquias continuam pela camada terrestre. (Medido no Estreito de hoje: os dois inícios têm
    cada um o seu lago de 190 tiles a ~25 tiles — um `seasApart` "por mar diferente", sem a condição de terra, quebraria o
    "0 aviso(s)" do `map:check` dos embutidos.)
  - `StartResources` e `startResourceTable`: campos `fish` (soma das quantidades de `fish`) e `fishNodes` (contagem) —
    os dois, porque a tabela do editor lê `` r[`${k}Nodes`] `` —, contados a até `Math.max(radius, FISH_RADIUS)` (o resto
    no raio de sempre), no mesmo estilo das colunas que a E2 acrescentou. O atum (`rare_fish`) entra na contagem `rare`
    da E2 (ele está no `RARE_SET`), não em `fish`.
  *Confira:* `npx vitest run tests/fixedmap.test.ts tests/editor.test.ts` (ajuste só o formato de `StartResources`
  esperado nos testes; nenhum hash).
- [ ] **D4. Egeu** (`scripts/maps/egeu.ts`).
  1. No terreno: `if (shoal) return T.SAND;` vira `if (shoal) return T.SHALLOWS;` (só essa linha; a "terra batida na
     chegada dos baixios" continua).
  2. Depois de `placeStartLayout(b, sx, sy);` e das linhas que a E2 pôs ali, os peixes do início 1 (os espelhos fazem os
     outros):
     ```ts
     // ---- E4: peixes diante do início 1 (6 cardumes na água aberta mais perto, espaçados) e um atum entre as ilhas ----
     const water = (x: number, y: number) => { const t = b.ed.map.terrain[y * W + x]; return t === T.WATER || t === T.DEEP; };
     // tile de mar sem nó e sem terra nos 8 vizinhos: o cardume fica a 1+ tile da praia (não ocupa a margem dos Estaleiros
     // e o barco tem por onde encostar)
     const sea = (x: number, y: number) => {
       if (!water(x, y) || b.ed.map.nodeAt[y * W + x] !== -1) return false;
       for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!water(x + dx, y + dy)) return false;
       return true;
     };
     const byDist = (p: Pt, q: Pt, cx: number, cy: number) => d2(p[0], p[1], cx, cy) - d2(q[0], q[1], cx, cy) || p[1] - q[1] || p[0] - q[0];
     const cand: Pt[] = [];
     for (let y = 36; y <= CY - 3; y++) for (let x = 6; x <= CX - 6; x++) if (sea(x, y)) cand.push([x, y]);
     cand.sort((p, q) => byDist(p, q, sx, sy));
     const fish: Pt[] = [];
     for (const p of cand) { if (fish.length >= 6) break; if (fish.every((f) => d2(f[0], f[1], p[0], p[1]) >= 4)) fish.push(p); }
     if (b.nodes('fish', fish) !== 6) throw new Error(`egeu: só ${fish.length} cardumes couberam`);
     // o atum: candidato ainda livre (sea() de novo, depois dos peixes) e longe deles
     const tuna = cand.filter(([x, y]) => x >= 30 && y <= CY - 2 && sea(x, y) && fish.every((f) => d2(f[0], f[1], x, y) >= 9)).sort((p, q) => byDist(p, q, 40, 50))[0];
     if (!tuna || b.nodes('rare_fish', [tuna]) !== 1) throw new Error('egeu: atum não coube');
     ```
     (A ordem `(y, x)` aqui só desempata o desenho do representante; a simetria do `MapBuilder` copia para os 4 inícios.
     `b.nodes` devolve quantos pontos entraram — o `MapBuilder` engole a recusa do editor e só conta em `skippedNodes`;
     por isso os `throw`: um peixe que não entrou não pode passar calado.)
  3. `scripts/maps/lib.ts` `finish()`: acrescente `'fish'` à lista de colunas que precisam ser iguais em todos os inícios
     (a que a E2 estendeu com pedra/petróleo/raros).
  4. Atualize a `description` do Egeu no `b.finish({ … })` (só PT: `FixedMapData` não tem `descriptionEn`) acrescentando
     "O mar é navegável de ponta a ponta (os baixios também) e tem cardumes diante de cada início." e gere:
     `npx tsx scripts/maps/egeu.ts` (grava `src/core/data/maps/egeu.map.json`). Se a E2 tinha posto algum nó terrestre
     sobre a areia dos baixios, ele agora é recusado (`nodeFitsTerrain`): o script continua, mas `b.skippedNodes` sobe —
     confira a contagem de nós impressa antes e depois e mova esse nó para fora do baixio.
  *Confira:* o script termina sem lançar; `npm run map:check src/core/data/maps/egeu.map.json` mostra `peixe` igual nos 4
  inícios e "estaleiro: sim" em todos; `npx vitest run tests/data.test.ts` ("mapas embutidos").
- [ ] **D5. `scripts/mapcheck.ts` e `scripts/export-map.ts`.** `mapcheck`: na linha de cada início, acrescente
  `· peixe ${row.fish} (${row.fishNodes})` e `· estaleiro: sim|não` — `hasShipyardSite(gm, x, y)` sobre
  `const gm = mapFromData(map)` (`hasShipyardSite` recebe um `GameMap`, não o `FixedMapData` que o script carrega;
  `mapFromData` vem de `src/core/map/fixed.ts`). `export-map`: o texto de uso (o comentário `// Uso:` da linha 2 e o `console.error('Uso: …')`) lista os 8 tipos; a
  validação já usa `MAP_TYPES` e aceita os novos sem mudança.
- [ ] **D6. Editor — terreno.** `src/editor/editor.ts`:
  - `TERRAIN_KEYS` com `'7': TERRAIN.SHALLOWS` (comentário: teclas 1..7); `brushTerrain()`:
    `return Math.max(0, Math.min(TERRAIN.SHALLOWS, this.ui.terrain | 0));` (sai o caso `t === 6`).
  - Troque `SOLID` por funções de `naval.ts` (são 3 usos; no fim apague a constante e `grep -n "SOLID" src/editor/editor.ts` tem
    de sair vazio): em `runMapFix`, `if (isUnbuildableTerrain(t) && map.buildingAt[i] !== -1) continue;`; em `filterPaint`, `const solid = isUnbuildableTerrain(terrain);`; em
    `nodeFits(tx, ty, type: string = this.ui.nodeType)`, `return nodeFitsTerrain(type, map.terrain[i]) && map.nodeAt[i] === -1 && map.buildingAt[i] === -1;`
    e passe o tipo nas chamadas (o do nó que se move; `'tree'` no pincel de árvores).
  - `removeNodeOf`: `m.blocked[i] = isLandBlockedTerrain(m.terrain[i]) ? 1 : 0;`.
  - `canPlaceAt`, caso `'unit'`: `isPassable(map, tx, ty, layerOf(UNITS[ui.unitType] ?? {}))`.
  - `EDITOR_KEYS` com `J: 'naval'`; no tratador das teclas, `naval` alterna `ui.showNaval` como `regions` alterna
    `showRegions`; inclua `showNaval` na lista dos campos de interface preservados (a mesma de `showRegions`, ~linha 291).
  `src/editor/ops.ts`:
  - `addNode`: `if (!nodeFitsTerrain(op.type, map.terrain[i]) || map.buildingAt[i] !== -1 || map.nodeAt[i] !== -1) throw new EditError('occupied', op.x, op.y);`.
  - `applyPaint`: o teste do edifício vira `if (isUnbuildableTerrain(t) && map.buildingAt[i] !== -1) throw …`; o laço que
    remove nós passa a remover o nó cujo tipo não cabe no terreno novo
    (`const n = map.nodes.get(map.nodeAt[i]); if (n && !nodeFitsTerrain(n.type, terrainAt(k))) { removedNodes.push({ ...n }); removeNode(map, n.id); }`).
  - `pushUnitsFrom`: **entre** o laço `for (const i of tiles)` (o que chama `pushUnitsOutOfTile`) e o laço que monta
    `moved`, empurre os navios que ficaram fora da água:
    `for (const u of state.units.values()) { if (u.dead || !UNITS[u.type].naval) continue; if (isPassable(map, Math.floor(u.x), Math.floor(u.y), 'naval')) continue; const f = nearestFreeTile(map, u.x, u.y, 8, centerFrame(map, u.x, u.y), 'naval'); if (f) { u.x = f.x + 0.5; u.y = f.y + 0.5; u.px = u.x; u.py = u.y; u.path = null; } }`
    (o laço de "moved" que vem depois compara com `posBefore` e gera as inversas; importe `centerFrame` de `grid`,
    `nearestFreeTile` de `pathfinding` e `UNITS`).
  - `applyPlace`, unidade: `if (!isPassable(map, ent.x, ent.y, layerOf(UNITS[ent.type]))) throw new EditError('noRoom', ent.x, ent.y);`.
  - `case 'moveEntity'`, ramo da unidade: `if (!isPassable(state.map, op.x, op.y, layerOf(UNITS[e.type]))) throw …` (sem
    isso não se arrasta navio no editor, e a inversa de uma pintura que empurrou um navio falha). Depois, apague a
    constante `isSolid` de `ops.ts`: `grep -n "isSolid" src/editor/ops.ts` tem de sair vazio.
- [ ] **D7. Editor — painel e tipos.** `src/editor/types.ts`: `showNaval: boolean` em `EditorUI` e `showNaval: false` em
  `defaultEditorUI`. `src/editor/panel.ts`: `TERRAIN_ORDER` com `TERRAIN.SHALLOWS` no fim; tire
  `|| (ui.terrain === 6 && tr === TERRAIN.DEEP)` do chip; `NODE_TYPES` com `'fish', 'rare_fish'` no fim; `NODE_ICONS`
  `fish: 'tech/fishing_nets', rare_fish: 'tech/fishing_nets'`; `UNIT_CLASSES` com `'ship'` no fim; no laço das
  sobreposições, `['naval', 'J', 'showNaval']` depois de `regions`; `renderOverlays` com `showNaval` na chave e no tipo do
  `dataset.ov`; a lista de atalhos do editor ganha "J" (Mar). Tabela por início (`renderResources`, que a E2 passou a
  gerar de `kinds`): acrescente `'fish'` ao fim de `kinds` e trate-o como a E2 tratou o `'rare'` no cabeçalho — título
  `t('node.fish')` (não existe `res.fish`) e ícone `iconHtml('tech/fishing_nets', { cls: 'hic-res' })` (não existe
  `res/fish` no atlas; `ic.res('fish')` sairia vazio e o `playtest-noemoji` acusa ícone vazio). A célula usa
  `` r[`${k}Nodes`] `` → `fishNodes` (passo D3).
- [ ] **D8. Renderizador do editor** (`renderer.ts`, sobreposições): `this.regSprite.visible = ed.showRegions || ed.showNaval;`,
  a chave da textura ganha `${ed.showNaval}` e o laço usa `componentAt(map, x, y, ed.showNaval ? 'naval' : 'land')`
  (dê outro nome à variável, `layer` já existe ali).
- [ ] **D9. Documentação do editor:** em `docs/EDITOR.md`, no formato e nos atalhos: terreno 6 = baixio (tecla 7),
  nós `fish`/`rare_fish`, sobreposição `J`, `config.naval` dos cenários, códigos de validação novos.
  *Confira:* `npx vitest run tests/editor.test.ts tests/data.test.ts tests/fixedmap.test.ts`.

### Bloco E — IA naval (`src/core/sim/ai.ts`)

- [ ] **E1. Snapshot.** `Snapshot.ships: Unit[]` = `units.filter((u) => UNITS[u.type].naval && u.inside === -1)`;
  `military` passa a excluir navios (`&& !UNITS[u.type].naval`). Na `lineUsers` da E3, some `...snap.ships` à lista.
  Na `evolutionPriority` da E3, logo no começo do `forEach` das linhas, pule as linhas navais de quem não tem Estaleiro:
  ```ts
  // E4: sem Estaleiro pronto, a IA não estuda evoluções de navio (num mapa sem mar o estudo seria gasto à toa — e a
  // partida terrestre deixaria de ser idêntica: o diff do smoke da Verificação 4 acusa)
  if (LINES[line].buildings.every((b) => BUILDINGS[b]?.shore) && countBuildings(state, player.id, (b) => b.type === 'shipyard' && b.complete) === 0) return;
  ```
  (`countBuildings` já é importado de `./entities` no `ai.ts`.) Em `manageMerchants` da E2, os dois `nearestRareNode`
  ganham `!SHIP_NODES.has(n.type) &&` no começo do predicado: o atum é do barco de pesca, e sem isso a IA treina Mercador
  "para" um atum que ele não pode ocupar.
- [ ] **E2. Guardas.** `manageTraining` (laço do "Exército humano"): `if (BUILDINGS[b.type].shore) continue;` no começo
  do corpo do laço. `manageArmy`: na varredura de ameaças, `if (ud.naval) return;` logo depois de pegar `ud` (navio é com a
  frota); logo antes de `// 2) Ataque em ondas`, `if (islandMode(state, player, snap)) return;`. `RESEARCH_PRIORITY`:
  acrescente `'fishing_nets', 'caulking', 'bronze_rams', 'navigation'` **no fim** (não mude a ordem nem o corte `slice(0, 12)`).
  Exporte as tabelas de "Dados prontos" e inclua as 3 por Era (`FISH_BOATS`, `WARSHIPS_ISLAND`, `WARSHIPS_COAST`) no
  teste de 8 posições da E1 (`tests/eras.test.ts`).
- [ ] **E3. Funções.** Acrescente acima de `manageScouts`:
  ```ts
  // ---------------- Naval (E4) ----------------
  /** Nenhum Centro Cívico inimigo vivo é alcançável por terra a partir do meu (Ilhas), e o meu e algum deles estão no
   *  mesmo mar grande: só o mar leva ao inimigo. A condição do mar evita o "modo ilha" num mapa terrestre em que um humano
   *  se murou por inteiro (sem portão): sem ela a IA pararia de atacar por terra. */
  function islandMode(state: GameState, player: Player, snap: Snapshot): boolean {
    const tc = snap.tc; if (!tc) return false;
    const mySea = seaOfStart(state.map, Math.floor(tc.x), Math.floor(tc.y));
    if (mySea < 0) return false;
    const from = findSpawnTile(state, tc);
    let sameSea = false;
    for (const b of state.buildings.values()) {
      if (b.dead || b.type !== 'town_center' || !isEnemy(state, player.id, b.owner) || !state.players[b.owner].alive) continue;
      if (rectReachable(state.map, Math.floor(from.x), Math.floor(from.y), b.tx, b.ty, b.w, b.h, true)) return false;
      if (seaOfStart(state.map, Math.floor(b.x), Math.floor(b.y)) === mySea) sameSea = true;
    }
    return sameSea;
  }
  /** Centro Cívico inimigo mais perto do meu (desempate justo). */
  function invasionTarget(state: GameState, player: Player, snap: Snapshot): Building | null {
    const tc = snap.tc; if (!tc) return null;
    let best: Building | null = null, bd = Infinity;
    for (const b of state.buildings.values()) {
      if (b.dead || b.type !== 'town_center' || !isEnemy(state, player.id, b.owner) || !state.players[b.owner].alive) continue;
      const d = dist2(b.x, b.y, tc.x, tc.y);
      if (d < bd || (d === bd && best && fairer(state.map, tc, { x: b.tx, y: b.ty }, { x: best.tx, y: best.ty }))) { bd = d; best = b; }
    }
    return best;
  }
  function manageNavy(state: GameState, player: Player, snap: Snapshot): void {
    if (!navalOn(state) || !snap.tc) return;
    const age = player.age, tc = snap.tc;
    const yards = snap.byType.get('shipyard') ?? [];
    const yard = yards.find((b) => b.complete) ?? null;
    const island = islandMode(state, player, snap);
    // 1) Estaleiro: só com peixe perto ou no modo ilha (mapas terrestres: nada muda); uma tentativa por janela de 10 s.
    //    A IA só pensa a cada round(thinkEvery·20) ticks a partir do tick 40, então um `(tick + id) % 200 === 0` nunca
    //    bateria para os jogadores 1–3 (o 0 seria o único com Estaleiro): conta-se a passagem da janela desde o último pensamento.
    if (yards.length === 0) {
      const period = Math.round(DIFFICULTIES[player.ai!.difficulty].thinkEvery * TICK_RATE), every = 10 * TICK_RATE;
      if (snap.villagers.length < SHIPYARD_MIN_VILLAGERS || Math.floor(state.tick / every) === Math.floor((state.tick - period) / every)) return;
      if (!island && fishNear(state, tc.x, tc.y, 30) < 2) return;
      const spot = findBuildSpot(state, player, 'shipyard', tc.x, tc.y, 4, SHIPYARD_SITE_RADIUS);
      if (!spot || !canAfford(player, getBuildingStats(state, player, 'shipyard').cost)) return;
      const v = pickBuilder(state, snap, spot.x, spot.y);
      if (v) applyCommand(state, { type: 'build', player: player.id, ids: [v.id], building: 'shipyard', tx: spot.x, ty: spot.y });
      return;
    }
    if (!yard) return;
    const boats = snap.ships.filter((u) => UNITS[u.type].canGather);
    const war = snap.ships.filter((u) => isMilitary(u));
    const trans = snap.ships.filter((u) => (UNITS[u.type].capacity ?? 0) > 0);
    const queued = (pred: (d: UnitDef) => boolean) => yard.queue.filter((q) => q.kind === 'unit' && pred(UNITS[q.id])).length;
    // 2) Treino: um item por pensamento, fila de no máximo 2
    if (yard.queue.length < 2) {
      const choices = trainChoices(state, player, 'shipyard');
      const pick = (pred: (d: UnitDef) => boolean) => choices.find((c) => pred(UNITS[c.show]) && canTrain(state, player, yard, c.send).ok);
      const fishTarget = Math.min(FISH_BOATS[age], 2 * fishNear(state, yard.x, yard.y, 26));
      const warTarget = (island ? WARSHIPS_ISLAND : WARSHIPS_COAST)[age];
      let c: TrainChoice | undefined;   // tipo da E3 (src/core/sim/lines.ts)
      if (boats.length + queued((d) => !!d.canGather) < fishTarget) c = pick((d) => !!d.canGather);
      else if (island && trans.length + queued((d) => !!d.capacity) < TRANSPORTS) c = pick((d) => !!d.capacity);
      else if (war.length + queued((d) => d.tags.includes('military')) < warTarget && !savingForAge(state, player)) c = pick((d) => d.tags.includes('military'));
      if (c) applyCommand(state, { type: 'train', player: player.id, buildingId: yard.id, unit: c.send });
    }
    // 3a) Atum (raro do mar, D7): se nenhum barco meu está nele, o primeiro barco ocioso ocupa o atum livre mais perto do Estaleiro
    if (!boats.some((b) => b.nodeId > 0 && state.map.nodes.get(b.nodeId)?.type === 'rare_fish')) {
      const idleBoat = boats.find((b) => b.state === 'idle' && !b.order);
      const tuna = idleBoat ? nearestRareNode(state, yard.x, yard.y, 30, (n) => n.type === 'rare_fish' && nodeHasRoom(state, n)) : null;
      if (idleBoat && tuna) applyCommand(state, { type: 'gather', player: player.id, ids: [idleBoat.id], targetId: tuna.id });
    }
    // 3) Pesca: barco ocioso vai ao cardume com vaga mais perto
    for (const b of boats) if (b.state === 'idle' && !b.order) {
      const n = nearestNodeWithRoom(state, b.x, b.y, 'fish', 30);
      if (n) applyCommand(state, { type: 'gather', player: player.id, ids: [b.id], targetId: n.id });
    }
    // 4) Frota parada: navio inimigo a até 14 do Estaleiro ou do CC → ataca; com onda em curso, bombardeia o alvo pelo mar
    const idle = war.filter((s) => s.state === 'idle' && !s.order);
    if (idle.length) {
      let foe: Unit | null = null, fd = Infinity;
      for (const base of [yard, tc]) getRuntime(state).hash.each(base.x, base.y, 14, (u) => {
        if (u.dead || !UNITS[u.type].naval || !isEnemy(state, player.id, u.owner)) return;
        const d = dist2(u.x, u.y, base.x, base.y);
        if (d < fd || (d === fd && foe && fairer(state.map, base, { x: Math.floor(u.x), y: Math.floor(u.y) }, { x: Math.floor(foe.x), y: Math.floor(foe.y) }))) { fd = d; foe = u; }
      });
      const target = player.ai!.attackTarget !== -1 ? state.buildings.get(player.ai!.attackTarget) : undefined;
      for (const s of idle) {
        if (foe) { applyCommand(state, { type: 'attack', player: player.id, ids: [s.id], targetId: (foe as Unit).id }); continue; }
        const a = target && !target.dead ? approachTile(state.map, 'naval', s.x, s.y, target, getUnitStats(state, player, s.type).range) : null;
        if (a) applyCommand(state, { type: 'attackMove', player: player.id, ids: [s.id], x: a.x + 0.5, y: a.y + 0.5 });
        else if (dist(s.x, s.y, yard.x, yard.y) > 10) { const h = shoreTileNear(state.map, s.x, s.y, yard.x, yard.y, 6); if (h) applyCommand(state, { type: 'move', player: player.id, ids: [s.id], x: h.x + 0.5, y: h.y + 0.5 }); }
      }
    }
    // 5) Desembarque (Ilhas)
    if (island) manageInvasion(state, player, snap, trans, war);
  }
  /** Desembarque no modo ilha — fase 0 parado, 1 embarcando, 2 navegando. Uma leva por vez. */
  function manageInvasion(state: GameState, player: Player, snap: Snapshot, trans: Unit[], war: Unit[]): void {
    const ai = player.ai!, diff = DIFFICULTIES[ai.difficulty];
    const nv = ai.navy ?? (ai.navy = { phase: 0, ship: -1, x: 0, y: 0, since: 0 });
    const ship = nv.ship >= 0 ? state.units.get(nv.ship) : undefined;
    const reset = () => { nv.phase = 0; nv.ship = -1; };
    if (nv.phase > 0 && (!ship || ship.dead)) { reset(); return; }
    if (nv.phase === 0) {
      const t = trans.find((s) => s.cargo.length === 0 && s.state === 'idle' && !s.order);
      const threshold = Math.round(ARMY_ATTACK[player.age] * diff.armyMult * 0.6);   // levas menores que a onda por terra (o navio leva 20 de pop)
      if (!t || snap.military.length < threshold || state.tick - ai.lastAttack < Math.round(75 * diff.attackDelay * TICK_RATE)) return;
      const target = invasionTarget(state, player, snap);
      if (!target) return;
      const cap = UNITS[t.type].capacity ?? 0;
      // comparador consistente (sort exige: a<b ⇒ não b<a): distância, depois fairer nos dois sentidos, depois o id
      const tileOf = (u: Unit) => ({ x: Math.floor(u.x), y: Math.floor(u.y) });
      const riders = snap.military.filter((u) => !UNITS[u.type].tags.includes('titan') && !UNITS[u.type].flying).sort((a, b) =>
        dist2(a.x, a.y, t.x, t.y) - dist2(b.x, b.y, t.x, t.y) || (fairer(state.map, t, tileOf(a), tileOf(b)) ? -1 : fairer(state.map, t, tileOf(b), tileOf(a)) ? 1 : a.id - b.id));
      let pop = 0; const ids: number[] = [];
      for (const u of riders) { const p = seatsOf(u.type); if (pop + p > cap) continue; pop += p; ids.push(u.id); }
      if (ids.length === 0 || !applyCommand(state, { type: 'embark', player: player.id, ids, targetId: t.id }).ok) return;
      nv.phase = 1; nv.ship = t.id; nv.x = target.x; nv.y = target.y; nv.since = state.tick;
      return;
    }
    if (nv.phase === 1) {
      const waiting = [...state.units.values()].some((u) => !u.dead && u.owner === player.id && u.order?.type === 'embark' && u.targetId === ship!.id);
      if (waiting && cargoPop(state, ship!) < (UNITS[ship!.type].capacity ?? 0) * 0.8 && state.tick - nv.since < 45 * TICK_RATE) return;
      if (ship!.cargo.length === 0) { reset(); return; }
      applyCommand(state, { type: 'unload', player: player.id, ids: [ship!.id], x: nv.x, y: nv.y });
      const escort = war.filter((w) => w.state === 'idle' || w.state === 'move').map((w) => w.id);
      const sea = shoreTileNear(state.map, ship!.x, ship!.y, nv.x, nv.y, 20);
      if (escort.length && sea) applyCommand(state, { type: 'attackMove', player: player.id, ids: escort, x: sea.x + 0.5, y: sea.y + 0.5 });
      nv.phase = 2; nv.since = state.tick;
      return;
    }
    if (ship!.cargo.length === 0) {   // desembarcou: quem desceu ataca o Centro Cívico
      const landed = snap.military.filter((u) => dist(u.x, u.y, ship!.x, ship!.y) < 6).map((u) => u.id);
      if (landed.length) applyCommand(state, { type: 'attackMove', player: player.id, ids: landed, x: nv.x, y: nv.y });
      ai.waves++; ai.lastAttack = state.tick; reset(); return;
    }
    if (state.tick - nv.since > 120 * TICK_RATE) {   // não chegou em 2 min: volta e desce em casa
      applyCommand(state, { type: 'unload', player: player.id, ids: [ship!.id], x: snap.tc!.x, y: snap.tc!.y });
      reset();
    }
  }
  ```
  Chame `manageNavy(state, player, snap);` em `aiThink`, logo depois de `manageTraining(state, player, snap);`. Importe o
  que faltar (`navalOn`, `fairer`, `fishNear`, `approachTile`, `shoreTileNear`, `cargoPop`, `seatsOf`,
  `SHIPYARD_SITE_RADIUS` e `seaOfStart` de `../map/fixed`, `SHIP_NODES`, `nearestRareNode` (da E2), `findSpawnTile`,
  `getUnitStats`, `dist2`, `trainChoices` e `type TrainChoice` de `./lines`, `type UnitDef`; `rectReachable`, `DIFFICULTIES`,
  `TICK_RATE`, `nodeHasRoom` e `countBuildings` o `ai.ts` já importa).
  *Confira:* `npx vitest run tests/movement-ai.test.ts tests/position-fairness.test.ts tests/determinism.test.ts tests/unit-lines.test.ts`
  e `npm run smoke 20 42 | grep -v "reais\|tempo real\|ms/tick\|hash final" | diff /tmp/e4-base/smoke.txt -` **vazio**
  (a partida terrestre não mudou).

### Bloco F — Renderização, áudio, interface e ícones

- [ ] **F1. Terreno.** `palette.ts`: troque a linha `6: 0x184a66,` por `[TERRAIN.SHALLOWS]: 0x4f9aa0,` e o comentário
  ("6 = baixio, E4"). `terrain/materials.ts`: `isWaterT = isNavigableTerrain` e, antes de `case TERRAIN.WATER: case TERRAIN.DEEP: default:`,
  `case TERRAIN.SHALLOWS: { weights[o + 2] = 255; kind[o] = 255; kind[o + 1] = 38; break; }   // E4: baixio — água a 0,15, leito de areia à vista`.
  `props.ts` (função `water`), `fx/rules.ts` (`isWater` e a linha ~180), `fx/handlers/projectile.ts` (`isWater`),
  `fx/logic.ts` (`footDustRate`) e `audio/ambience.ts`: use `isNavigableTerrain` no lugar de `WATER || DEEP`.
- [ ] **F2. Nós.** `textures.ts`: `NODE_TYPES` com `'fish', 'rare_fish'` no fim e, em `drawNode`:
  ```ts
  case 'fish': {   // E4: cardume — peixinhos prateados sob a água
    g.ellipse(0, 2, 12, 6).fill({ color: 0x1d5a78, alpha: 0.35 });
    for (let i = 0; i < 6; i++) { const x = -8 + hash01(i, variant, 5) * 16, y = -3 + hash01(i, variant, 6) * 8; g.ellipse(x, y, 2.6, 1.1).fill({ color: 0xc8d8e0, alpha: 0.85 }); g.poly([x - 2.6, y, x - 4.2, y - 1.2, x - 4.2, y + 1.2]).fill({ color: 0xc8d8e0, alpha: 0.85 }); }
    break;
  }
  case 'rare_fish': {   // E4: atum — peixes grandes e o anel dourado dos raros
    g.ellipse(0, 2, 13, 6).fill({ color: 0x14465e, alpha: 0.4 });
    for (let i = 0; i < 3; i++) { const x = -6 + i * 6, y = -1 + (i % 2) * 3; g.ellipse(x, y, 4.2, 1.6).fill(0x5a7088); g.poly([x - 4.2, y, x - 6.5, y - 2, x - 6.5, y + 2]).fill(0x5a7088); }
    g.circle(0, 0, 9).stroke({ width: 1.5, color: GOLD });
    break;
  }
  ```
  (antes do `default` da E2). `shadows.ts` `nodeShadow`: `case 'fish': case 'rare_fish': return null;` (se a função
  devolver outra coisa para "sem sombra", use o mesmo da E2 para a jazida). `minimap.ts`: `fish` `0x9ec8e0` (o atum já sai
  na cor dos raros pelo `RARE_SET`).
- [ ] **F3. Navio procedural.** `textures.ts` `drawUnit`, primeira linha depois de `const team = …`:
  `if (def.cls === 'ship') { drawShip(g, type, r, team); return; }` e, no módulo:
  ```ts
  /** E4: navio visto de cima, proa para +x: casco, convés, remos (galés), vela (madeira) ou chaminé (ferro), flâmula do time. Provisório até a E8. */
  function drawShip(g: Graphics, type: string, r: number, team: number) {
    const d = UNITS[type], iron = d.tags.includes('mechanical');
    const L = r * 1.6, B = r * 0.62;
    const hull = iron ? IRON : WOOD_DARK, deck = iron ? 0x6b6e72 : WOOD;
    g.poly([-L, -B * 0.8, L * 0.55, -B, L, 0, L * 0.55, B, -L, B * 0.8]).fill(hull).stroke({ width: 1, color: darken(hull, 0.6) });
    g.poly([-L * 0.85, -B * 0.55, L * 0.5, -B * 0.72, L * 0.82, 0, L * 0.5, B * 0.72, -L * 0.85, B * 0.55]).fill(deck);
    if (d.age <= 3 && !d.canGather && !d.capacity) for (let i = 0; i < 6; i++) { const x = -L * 0.6 + i * L * 0.24; g.moveTo(x, -B).lineTo(x - 2, -B - 4).moveTo(x, B).lineTo(x - 2, B + 4).stroke({ width: 1, color: WOOD }); }
    if (iron) { g.circle(-L * 0.1, 0, B * 0.35).fill(0x2a2a2e); g.circle(L * 0.35, 0, B * 0.28).fill(IRON); }
    else g.rect(-1.5, -B * 1.3, 3, B * 2.6).fill(LINEN);
    g.circle(-L * 0.7, 0, B * 0.3).fill(team);
    if (d.tags.includes('fire')) g.circle(L * 0.85, 0, 2).fill(0xe8701a);
  }
  ```
  (use os nomes de cor que o arquivo já tem; se `LINEN`/`IRON` tiverem outro nome, use o equivalente de `MATERIALS`).
  `renderer.ts`, no ramo procedural das unidades: `const sea = !!UNITS[u.type].naval;` e
  `const bob = moving ? 1 + Math.sin(this.time * (sea ? 3 : 14) + u.id) * (sea ? 0.02 : 0.06) : 1;`.
- [ ] **F4. Efeitos.** `fx/logic.ts` `gaitOf`: `if (u.cls === 'ship') return 'none';` (sem poeira nem respingo de pé).
  `fx/unitFx.ts`: contador `wake` em `counts` e, no fim do método da unidade (depois do bloco da margem):
  ```ts
  // E4: esteira — respingos na popa do navio em movimento
  if (UNITS[u.type].naval && mdx * mdx + mdy * mdy > 4e-4) {
    const speed = Math.sqrt(mdx * mdx + mdy * mdy) / DT, len = Math.sqrt(mdx * mdx + mdy * mdy);
    a.wet += fx.dt * speed * 1.2;
    if (a.wet >= 1) { a.wet -= 1; this.counts.wake++; const k = -UNITS[u.type].radius * TILE; waterSplash(fx.particles, fx.tex, px + (mdx / len) * k, py + (mdy / len) * k, { n: 2, power: 0.6, ring: true }); }
  }
  ```
  `src/render/art/alias.ts` (da E2): `shipyard: 'siege_workshop'` em `BUILDING_ART_ALIAS`. Navios **não** entram no
  alias (são procedurais).
- [ ] **F5. Áudio.** `audio.ts` `ACKS`: `ship: { select: ['ackCreak'], move: ['ackCreak'], attack: ['ackShout', 'ackCreak'] }`.
  `events.ts` `deathRecipe`: `if (def.cls === 'ship') return 'treeFall';` (madeira rachando; a E8 faz o som próprio).
- [ ] **F6. Interface.** `hud.ts` `unitCard`: com `def.capacity`, `stats.push(\`${t('sel.cargo')} <b>${cargoPop(s.state, u)}/${def.capacity}</b>\`)`.
  Nos comandos das unidades, se alguma selecionada tiver `capacity` e carga:
  `add(glyph('release'), t('cmd.unload'), t('cmd.unloadTip'), 'U', () => { for (const sh of units.filter((x) => UNITS[x.type].capacity && x.cargo.length)) s.issue({ type: 'unload', player: s.local, ids: [sh.id], x: sh.x, y: sh.y }); });`.
  Na tela de atalhos (`showHotkeys`), na lista das unidades, a linha `[k('U'), t('hk.unload')]`. No menu de construção
  (o laço `for (const type of BUILD_MENU)` dos cidadãos), primeira linha: `if (def.shore && !navalOn(s.state)) continue;`
  — na campanha e na Horda o Estaleiro some do menu em vez de aparecer desabilitado (a interface da campanha fica igual à
  de antes, inclusive nas capturas do `art:shot`). O botão "Guarnecer" das unidades (`units.some((u) => [...].some(…))`)
  ganha `!UNITS[u.type].naval &&` no começo do predicado. `input.ts`:
  - `contextCommand`, **antes** do ramo `else if (nid !== -1)`:
    ```ts
    } else if (target && target.kind === 'unit' && target.owner === s.local && UNITS[target.type].capacity) {
      const riders = units.filter((u) => !UNITS[u.type].naval);   // E4: tropas no transporte → embarcar
      cmd = riders.length > 0 ? { type: 'embark', player: s.local, ids: riders.map((u) => u.id), targetId: target.id, queue } : { type: 'move', player: s.local, ids, x, y, queue };
    } else if (!target && nid === -1 && units.some((u) => UNITS[u.type].capacity && u.cargo.length) && isPassable(map, tx, ty)) {
      const ships = units.filter((u) => UNITS[u.type].capacity && u.cargo.length);   // E4: transporte carregado + clique em terra → desembarcar lá
      s.issue({ type: 'unload', player: s.local, ids: ships.map((u) => u.id), x, y, queue });
      const rest = units.filter((u) => !ships.includes(u));
      cmd = rest.length ? { type: 'move', player: s.local, ids: rest.map((u) => u.id), x, y, queue } : null;
    ```
    (o primeiro `if` continua sendo o do inimigo; o resto da cadeia não muda; com `cmd = null` o bloco final não roda —
    toque o som com `this.audio.ack('move', this.dominantClass(s))` no ramo do desembarque; importe `isPassable` de
    `../core/map/grid`). Nos dois `canEnter` (guarnecer em edifício próprio e aliado), acrescente `!UNITS[u.type].naval &&`.
  - Teclas, no ramo `units.length > 0`, antes de `const villagersOnly`:
    `if (k === 'u') { const sh = units.filter((u) => UNITS[u.type].capacity && u.cargo.length); if (sh.length) { for (const x of sh) s.issue({ type: 'unload', player: s.local, ids: [x.id], x: x.x, y: x.y }); return; } }`.
  - Dica do nó (E2): peixe com `node.remaining`; atum com `t('rare.rare_fish')`.
- [ ] **F7. Ícones.** `catalog.mjs`: `SHIP_ICONS` e as entradas de `TECH_ICONS` ("Dados prontos"); em `hudItems`, depois do
  laço das unidades dos manifestos: `for (const [id, s] of Object.entries(SHIP_ICONS)) items.push({ name: \`unit/${id}\`, size: ICON, spec: s });`;
  em `hudNames`, depois da linha das unidades: `...Object.keys(SHIP_ICONS).map((id) => \`unit/${id}\`),`.
  `hud-objects.js`, depois do último `OBJ.*` das tecnologias:
  ```js
  OBJ.ship = (THREE, M, T, p) => {
    // E4: navio em três quartos sobre um disco de água; kind: fishing | transport | galley | dromon | sail | steam | battleship
    const x = X(THREE, M), k = p.kind ?? 'galley', iron = k === 'steam' || k === 'battleship';
    const L = k === 'fishing' ? 0.7 : k === 'battleship' ? 1.05 : 0.9, B = k === 'fishing' ? 0.2 : 0.26;
    T.add(T.cyl(0.62, 0.62, 0.02, 40), x.water, 0, 0.01, 0);
    T.add(T.box(L, 0.16, B), iron ? M.iron : M.woodDark, 0, 0.1, 0);
    T.add(T.cone(B * 0.5, 0.22, 4), iron ? M.iron : M.woodDark, L / 2 + 0.1, 0.1, 0, 0, 0, -Math.PI / 2);
    T.add(T.box(L * 0.92, 0.02, B * 0.86), iron ? M.stone : M.wood, 0, 0.19, 0);
    if (k === 'galley' || k === 'dromon') for (let i = 0; i < 7; i++) for (const s of [-1, 1]) T.add(T.cyl(0.006, 0.006, 0.26, 4), M.wood, -L * 0.38 + i * L * 0.12, 0.08, s * (B / 2 + 0.1), s * 1.1, 0, 0);
    if (k === 'dromon') T.add(T.cyl(0.02, 0.03, 0.14, 10), M.bronze, L / 2 + 0.05, 0.24, 0, 0, 0, -1.2);
    if (!iron) { T.add(T.cyl(0.012, 0.014, 0.75, 8), M.wood, -0.05, 0.55, 0); T.add(T.box(0.02, 0.42, B * 1.6), M.linen, 0.01, 0.62, 0); T.add(T.box(0.03, 0.08, 0.05), M.team, -0.05, 0.95, 0); }
    if (k === 'sail') { T.add(T.cyl(0.012, 0.014, 0.6, 8), M.wood, 0.25, 0.48, 0); T.add(T.box(0.02, 0.32, B * 1.4), M.linen, 0.26, 0.55, 0); }
    if (iron) { T.add(T.cyl(0.05, 0.06, 0.32, 14), x.darkCloth, -0.1, 0.36, 0); T.add(T.box(0.22, 0.12, 0.18), M.iron, 0.18, 0.26, 0); T.add(T.cyl(0.015, 0.015, 0.28, 8), M.iron, 0.38, 0.29, 0, 0, 0, Math.PI / 2); T.add(T.box(0.04, 0.05, 0.05), M.team, -0.1, 0.55, 0); }
    if (k === 'battleship') T.add(T.box(0.18, 0.1, 0.16), M.iron, -0.32, 0.26, 0);
    if (k === 'transport') T.add(T.box(L * 0.5, 0.1, B * 0.7), M.woodDark, -0.05, 0.25, 0);
    if (k === 'fishing') T.add(T.tor(0.09, 0.008, 6, 20), M.rope, 0.18, 0.21, 0.05, Math.PI / 2, 0, 0);
    if (p.steam) T.add(T.cyl(0.035, 0.04, 0.22, 12), x.darkCloth, -0.18, 0.32, 0);
    if (p.ram) T.add(T.cone(0.04, 0.16, 8), M.bronze, L / 2 + 0.18, 0.05, 0, 0, 0, -Math.PI / 2);
  };
  OBJ.fish = (THREE, M, T) => {
    // E4: dois peixes prateados saltando sobre um disco de água
    const x = X(THREE, M);
    T.add(T.cyl(0.5, 0.5, 0.02, 36), x.water, 0, 0.01, 0);
    const fish = (px, py, rz, s) => { const b = T.add(T.sph(0.12 * s, 18, 12), x.silver, px, py, 0, 0, 0, rz); b.scale.set(1.6, 0.6, 0.5); T.add(T.cone(0.07 * s, 0.12 * s, 4), x.silver, px - 0.2 * s * Math.cos(rz), py - 0.2 * s * Math.sin(rz), 0, 0, 0, rz + Math.PI / 2); };
    fish(-0.08, 0.32, 0.5, 1); fish(0.16, 0.22, -0.4, 0.8);
  };
  ```
  Rode `npm run art:hud -- --contact docs/art` e olhe a folha de contato com a ferramenta Read: os 10 navios distintos a
  34 px (galés com remos, veleiros com 2 mastros, ferro com chaminé), `tech/fishing_nets` lendo como peixe. Ajuste só
  proporções dentro desses dois objetos. Depois `npm run art:check` sem erro.
- [ ] **F8. Testes de arte.** `tests/art-etapa6.test.ts`: os navios são procedurais de propósito — exclua `UNITS[t].naval`
  nos **dois** laços que exigem arte assada: o `types` do `it` "os 35 tipos…" (onde a E2 já filtra o `UNIT_ART_ALIAS`) e o
  `for (const type of Object.keys(UNITS))` do `it` "as 35 unidades e as 5 hidras saem assadas" (o `procedural` tem de
  continuar `[]`); o terceiro laço (arte desligada → tudo `null`) fica como está. `tests/hud-icons.test.ts`: nada além do que a E2 já fez (os `unit/<navio>`
  existem pelo `SHIP_ICONS`; `bld/shipyard` resolve pelo alias). `tests/audio.test.ts` passa com `ACKS.ship`.
  *Confira:* `npx vitest run tests/hud-icons.test.ts tests/art-etapa6.test.ts tests/art-library.test.ts tests/art-manifest.test.ts tests/audio.test.ts tests/fx-logic.test.ts tests/fx-registry.test.ts tests/terrain-shader.test.ts`.

### Bloco G — Testes novos, playtest e calibração

- [ ] **G1. `tests/naval.test.ts` (novo).** Modelo: `tests/economy-regressions.test.ts` (partidas com `createGame` e
  `tick`, posições por `placeBuilding(..., true)`, `spawnUnit` e `addNode`; mapas de teste montados com `mapFromData` +
  `withTerrain`, como em `tests/fixedmap.test.ts`). Casos na seção "Testes".
- [ ] **G2. Fuzz** (`tests/command-fuzz.test.ts`): `TYPES` com `'embark', 'unload'`; o invariante da guarnição aceita
  navio (`const g = s.buildings.get(u.inside), sh = s.units.get(u.inside); if (!(g?.garrison.includes(id) || sh?.cargo.includes(id))) bad.push(…)`);
  invariantes novos: todo id de `cargo` é unidade viva com `inside` = o navio; navio vivo fora de `inside` está em tile
  `isNavigableTerrain`. (Não exija o contrário para unidades terrestres: a saída de tile bloqueado de hoje anda em linha
  reta e pode cruzar um tile de água por um tick.) Acrescente uma rodada curta (o mesmo laço, ~1/4 dos ticks) com
  `mapType: 'islands'`.
- [ ] **G3. Testes que mudam:** `tests/modes.test.ts` ("tipos de mapa…"): para `islands`, exija inícios em regiões
  terrestres **diferentes** e o mesmo `seaOfStart` em todos; para os outros 7, o teste de hoje. `tests/editor.test.ts`:
  tecla `'7'` → `TERRAIN.SHALLOWS`; formato de `StartResources` com `fish`/`fishNodes`. `tests/data.test.ts`: nada se a
  regra dos atalhos já passou (confira `I` sem duplicata e as teclas do Estaleiro). `tests/position-fairness.test.ts`: as
  sondagens do Egeu e do Estreito têm de continuar passando com o Egeu novo e com os `ok` que a E1 e a E2 deixaram
  (36 no Egeu e 12 no Estreito: 30/10 de hoje, +3/+1 da Biblioteca na E1 e +3/+1 da pedra na E2; o `EXTRA_TYPES` só
  entra na lista `bad`, não no `ok`), e acrescente
  `['shipyard', 4, 24]` ao `EXTRA_TYPES` (a sondagem do Egeu com `EXTRA_TYPES` passa a conferir que o Estaleiro do
  parceiro é o espelho exato do do jogador 0 — é a justiça de posição da IA naval nascendo no estado inicial).
- [ ] **G4. `scripts/playtest-editor.mjs`:** a conferência `'subpaleta de terreno com cor'` passa de `=== 6` para `=== 7`
  (com "Baixio") e a `'paleta de nós'` de `=== 16` (valor da E2) para `=== 18` (`fish`, `rare_fish`); acrescente um `ok`
  para a tecla `J` ligar `ui.showNaval`.
- [ ] **G5. `scripts/playtest-naval.mjs` (novo)** (modelo: `scripts/playtest-modes.mjs`; Chromium do Playwright do
  CLAUDE.md, `LANG: 'pt_BR.UTF-8'`). Roteiro, cada linha imprime `ok` ou `FALHOU`:
  1. O seletor `#m-maptype` tem `coastal`, `islands`, `mediterranean`.
  2. Partida `conquest` em `islands`, semente 42: `window.aoe.session.state.map` tem peixe (`[...map.nodes.values()].some((n) => n.type === 'fish')`).
  3. Varra cantos `(tx, ty)` a até 24 tiles do Centro Cívico do jogador e use o primeiro em que
     `window.aoe.debugBuild(local, 'shipyard', tx, ty)` não devolve `null` (ele já confere `canPlaceBuilding`, margem
     incluída): o Estaleiro aparece; `s.issue({ type: 'train', … unit: 'fishing_boat' })` e, depois de ~25 s de jogo
     acelerado, existe um `fishing_boat` num tile de água.
  4. `debugSpawn` (com a camada da unidade, passo C12) de 1 `transport_ship` num tile de água do anel do Estaleiro e 4
     `hoplite` em terra ao lado; confira que o transporte ficou num tile `isNavigableTerrain`; `embark` →
     em ≤ 15 s `cargo.length === 4`; `unload` num ponto de terra da mesma ilha → em ≤ 20 s `cargo.length === 0` e os 4 em
     terra.
  5. Seleção do transporte mostra "Carga" no `#selection` e o botão "Desembarcar" no `#commands`.
  6. Capturas `docs/art/e4-naval-ilhas.png` (zoom 1, frota e cardumes) e `docs/art/e4-naval-transporte.png`; olhe as duas
     com a ferramenta Read (navios legíveis, esteira, baixio turquesa claro).
  7. Nenhum `pageerror`.
- [ ] **G6. Calibração.** Rode a "Verificação" inteira. Se um tipo naval der `PARADA` ou atraso de Era > 2 min contra o
  balance terrestre: (1) confira se a IA construiu o Estaleiro (`nav=` no resumo); (2) se sim e a economia patina, baixe
  `FISH_BOATS` em 1 nas Eras I–II; (3) se as Ilhas nunca desembarcam até o minuto 25, baixe o fator `0.6` de `manageInvasion`
  para `0.45`. Registre o que mudou no `PROGRESSO.md`. Não mexa em números das unidades (E10).

### Bloco H — Verificação completa e documentação

- [ ] **H1.** Seção "Verificação", na ordem, tudo verde.
- [ ] **H2.** Seção "Ao terminar".

---

## Testes a escrever ou atualizar

| Arquivo | O que verifica |
|---|---|
| `tests/naval.test.ts` (novo) | (1) **Camadas**: baixio passa nas duas camadas; água rasa e profunda só na naval; peixe bloqueia navio; `removeNode` de peixe deixa `blocked = 1`; pintar terra no mar (`applyEditOp` paint) muda `componentAt(..., 'naval')` na hora (cache invalidado). (2) **Caminho**: `findPathEx(..., 'naval')` contorna uma ilha num mapa 64×64; infantaria atravessa um baixio de 3 tiles; 600 ticks de navio com ordem de `move` para trás de uma ilha: todas as posições `isNavigableTerrain`; hoplita mandado para o mar fica em terra. (3) **Estaleiro**: `canPlaceBuilding` recusa no interior (`err.needsShore`), recusa com só baixio encostado, aceita na praia com 2 tiles de água de um mar ≥ 60, aceita em território neutro, recusa em território inimigo; com `s.config.scenario = 'horde'` atribuído **depois** do `createGame` (criar já com cenário monta o roteiro da Horda) recusa com o motivo `t('err.navalOff')` (o `canPlaceBuilding` sem `force` passa por `buildingLimitOk` → `forbiddenReason`), e com `s.config.naval = true` em seguida aceita. (4) **Pesca**: barco colhe `fish` e entrega no Estaleiro (comida sobe); cidadão em `fish` recusado (`err.boatOnly`); barco em `berry` recusado (`err.fishOnly`); cardume esgotado → o barco vai ao próximo; barco num `rare_fish` rende ~0,5 ouro/s e `p.rares` inclui `rare_fish` em ≤ 1 s; `fishing_nets` e Poseidon multiplicam a pesca. (5) **Transporte**: 5 hoplitas embarcam (`inside` = id do navio, `cargo.length` 5); 11 hoplitas → só 10 sobem (pop 20); titã e navio não embarcam; `unload` na outra margem → todos em terra na região do ponto, `cargo` vazio; navio morto com carga → passageiros mortos e `losses` contadas; `serialize`/`deserialize` no meio da travessia e 200 ticks depois o `stateHash` é igual ao da partida contínua. (6) **Combate**: `canTarget(hoplita, navio)` falso; toxota na praia fere navio a 4 tiles; pentecôntero fere torre e hoplita na margem; titã (Oceano) alcança navio encostado; torre atira em navio. (7) **Gerador**: 3 tipos navais × 3 tamanhos × sementes 1–5 × 2–4 jogadores: `hasShipyardSite` em todo início, `seaOfStart` igual em todos, ≥ 6 peixes a até 24 de cada início; Ilhas com regiões terrestres distintas; Costeiro e Mediterrâneo com terra ligada; duas gerações iguais. (8) **IA**: partida 2 IAs em `coastal` semente 42 (mapa pequeno), 10 min: as duas têm Estaleiro e ≥ 1 barco de pesca; partida 2 IAs em `islands`, 25 min: alguma IA com `ai.waves > 0` e algum desembarque (unidade dela na ilha do outro); a partida de `coastal` rodada duas vezes dá o mesmo `stateHash`. O `testTimeout` do `vite.config.ts` é 30 s: dê timeout explícito a esses casos (`}, 240_000);`; 25 min = 30 000 ticks) e não repita a de 25 min. (9) **Justiça**: num mapa espelhado em x com mar dos dois lados, `approachTile`, `shoreTileNear` e `findBuildSpot('shipyard')` dão resultados espelhados para os dois inícios. |
| `tests/command-fuzz.test.ts` | tipos `embark`/`unload`; invariantes de carga e de camada; rodada em `islands` |
| `tests/modes.test.ts` | Ilhas: inícios separados por terra e ligados pelo mar |
| `tests/editor.test.ts` | tecla `7`; `StartResources.fish`; pintar baixio sob edifício → `underBuilding` |
| `tests/fixedmap.test.ts` | **nenhum hash muda** (prova de que os 5 tipos de hoje ficaram iguais); validação: `fishOnLand`, `shipOnLand`, `shoreNoWater`, `noShipyardSite` |
| `tests/eras.test.ts` (da E1) | as 3 tabelas navais por Era com 8 posições |
| `tests/unit-lines.test.ts` (da E3) | `trainChoices(state, p, 'shipyard')` com linhas: Q pesca, W transporte, E guerra; no elenco clássico: os 3 do `trains`; `evo_warship_3` transforma trirremes em quinquerremes (vida proporcional) |
| `tests/art-etapa6.test.ts` | filtro sem os navios |
| `tests/data.test.ts`, `tests/i18n.test.ts`, `tests/hud-icons.test.ts`, `tests/audio.test.ts`, `tests/position-fairness.test.ts` | passam sem mudança de lógica (só dados novos) |
| `scripts/playtest-naval.mjs` (novo), `scripts/playtest-editor.mjs` | navegador (bloco G) |

## Verificação

Na ordem; não passe para o próximo com o anterior vermelho.

1. `npm run -s typecheck` — sem saída.
2. `npx vitest run tests/naval.test.ts tests/command-fuzz.test.ts tests/modes.test.ts tests/editor.test.ts tests/fixedmap.test.ts tests/data.test.ts tests/position-fairness.test.ts tests/unit-lines.test.ts tests/eras.test.ts tests/hud-icons.test.ts` — tudo verde.
3. `npm test` — tudo verde. Falha conhecida do vitest: às vezes o processo sai com exit 1 por timeout de RPC do worker
   ("Timeout calling …") **com todos os testes passando**; confira "Tests N passed" e rode de novo só os arquivos citados.
4. `npm run smoke 20 42` duas vezes: o "hash final" é igual nas duas. E
   `npm run smoke 20 42 | grep -v "reais\|tempo real\|ms/tick\|hash final" | diff /tmp/e4-base/smoke.txt -` **sem
   diferença** (só o hash muda, porque agora inclui `inside`/`cargo`).
5. Mapas navais exportados e smoke neles:
   ```bash
   mkdir -p /tmp/e4
   for t in coastal islands mediterranean; do npx tsx scripts/export-map.ts /tmp/e4/$t.map.json --size small --seed 42 --type $t --players 2 || break; done
   for run in a b; do for t in coastal islands mediterranean; do npm run -s smoke 20 42 -- --map /tmp/e4/$t.map.json > /tmp/e4/smoke-$t-$run.txt; done; done
   for t in coastal islands mediterranean; do
     echo "== $t"; grep -h "hash final" /tmp/e4/smoke-$t-a.txt /tmp/e4/smoke-$t-b.txt
     awk '/^--- minuto/{m=$3} /nav=/{print "nav= no minuto " m ": " $0; exit}' /tmp/e4/smoke-$t-a.txt
     grep "ondas de ataque" /tmp/e4/smoke-$t-a.txt
   done
   ```
   (Use `npx tsx scripts/export-map.ts` direto: `npm run map:export … --size …` sem `--` perde as opções.) As duas
   linhas `hash final` de cada tipo são iguais; a primeira linha com `nav=` sai até o minuto 10 no Costeiro e nas Ilhas
   (no Mediterrâneo pode sair mais tarde ou não sair: registre); nas Ilhas, `ondas de ataque` > 0 em pelo menos uma IA.
6. `npm run balance 35 1,2,3 | grep -v "reais\|ms/tick" | diff /tmp/e4-base/balance.txt -` — **sem diferença**. Depois
   `npm run balance 35 1,2,3 -- --map /tmp/e4/<tipo>.map.json` para os 3 tipos: nenhuma `PARADA`; Eras no máximo ~2 min
   mais tarde que no balance terrestre (alvo do ERAS: II ~4, III ~9, IV ~14, V ~20, VI ~26). Se falhar, passo G6.
7. `npm run map:check` (embutidos: sem erro nem aviso; Egeu com `peixe` igual e "estaleiro: sim" nos 4) e
   `npm run map:check /tmp/e4/islands.map.json` (sem erro; nenhum `seasApart`/`noShipyardSite`).
8. `npx tsx scripts/missions.ts 2>&1 | sed -E 's/ \([0-9.]+s\)$//' | diff /tmp/e4-base/missions.txt -` (~12 min) —
   **sem diferença** (o `sed` tira o tempo de execução do fim das linhas; vitórias, minutos e objetivos têm de ser
   iguais, porque cenário tem `navalOn` falso). `npx tsx scripts/horde.ts` sem erro e com a mesma linha "Horda: …" de
   antes da E4 (rode-o também no passo 02 se quiser comparar).
9. Justiça de posição:
   - `npx tsx scripts/maps/fairness.ts estreito 45 1-16 zeus --both --jobs 3` — igual a `/tmp/e4-base/fair-estreito.txt`
     (o Estreito não tem peixe: nada naval acontece);
   - `npx tsx scripts/maps/fairness.ts egeu 45 1-16 zeus --both --jobs 3` e
     `npx tsx scripts/maps/fairness.ts /tmp/e4/islands.map.json 45 1-16 zeus --both --jobs 3` — critério de sempre:
     nenhum lado com > 65 % das decididas + à frente no fim, por posição e por índice; um "fora" isolado pede confirmação
     nas sementes 101–132. (Mapa gerado não é perfeitamente simétrico: se só as Ilhas saírem do critério, registre no
     `PROGRESSO.md` com os números.) O Egeu tem de dar `critério … DENTRO`; se a **base** (`/tmp/e4-base/fair-egeu.txt`)
     já dava `FORA` (o CLAUDE.md registra um resíduo de índice no Egeu 1–16), a exigência passa a ser "não piorar": o
     `máx.` de cada eixo no máximo 5 pontos acima do da base, e a confirmação em `101-132` dentro.
10. Navegador: `npm run build`, depois `npm run preview` em segundo plano (porta 4173; ele não termina sozinho); depois `node scripts/playtest.mjs`,
    `node scripts/playtest-modes.mjs`, `node scripts/playtest-editor.mjs`, `node scripts/playtest-naval.mjs`,
    `node scripts/playtest-noemoji.mjs http://localhost:4173/` e `node scripts/playtest-i18n.mjs` — todos verdes.
    `npm run art:shot && npm run art:diff` — dentro da tolerância (nenhuma referência tem mar navegável novo; se o Egeu
    estiver numa captura e mudar só nos baixios, atualize a referência e diga no commit).

## Critérios de pronto

- [ ] `typecheck`, `npm test`, smoke (hash estável e resumo terrestre idêntico), balance terrestre idêntico, balance nos 3
  tipos sem PARADA, `map:check`, `missions.ts` igual à base, `horde.ts`, fairness do Estreito igual e do Egeu dentro do
  critério, e os 6 playtests verdes.
- [ ] Partida rápida nas Ilhas: Estaleiro na margem, barcos pescando e entregando, transporte embarcando e desembarcando,
  navios de guerra lutando entre si e com a costa; a IA desembarca.
- [ ] Linha `warship` evolui na Biblioteca e transforma os navios; barcos "a vapor" na VII.
- [ ] Editor: baixio (`7`), cardume e atum, navios na paleta "Navios", sobreposição do mar (`J`); validação com os códigos
  novos.
- [ ] Campanha e Horda sem navios (Estaleiro proibido com `err.navalOff`); cenário JSON com `"naval": true` liga.
- [ ] Nenhum `Math.random`/trigonometria em `src/core`; `SIM_VERSION` subiu; ícones dos 10 navios no atlas `hud`.
- [ ] `docs/EDITOR.md`, `docs/eras/PROGRESSO.md`, `docs/ROADMAP.md` e `CLAUDE.md` atualizados; commit feito.

## Armadilhas

- **`removeNode` em água**: hoje ele zera `blocked`. Sem o passo A6, um cardume esgotado vira um "buraco" caminhável no
  meio do mar e a infantaria anda sobre a água. Idem `removeNodeOf` do editor.
- **Camada esquecida**: toda chamada de movimento de navio precisa de `'naval'` (`moveTowards`, `stepTo`, `moveExact`,
  `canStep`, `nearestFreeTile`, `rectReachable`, `componentAt/Size`, `findPathEx`, destino do `move`, `findSpawnTile`).
  Uma só esquecida e o navio "sobe na praia" ou fica parado com `blocked`. O invariante do fuzz (G2) pega.
- **Nunca** guarde o tile de abordagem em `u.tx/u.ty` durante o ataque (o `attackMove` volta para eles).
- **`rare_fish` fora de `RARE_NODES`** (D8): senão os mapas da E2 mudam e aparece atum em terra.
- **Peixe na busca por recurso**: sem `fish` em `NOT_GATHERED`, um cidadão de comida ocioso vai "pescar" um cardume que
  não alcança e fica preso; sem o ramo de `pickNewSource`, o barco tenta colher frutas em terra.
- **Entrega**: barco nunca usa `nearestDropoff` (acharia o Centro Cívico em terra); sempre `dropoffFor`.
- **Ordem do rng do gerador**: nos 5 tipos de hoje, nada muda de lugar e o primeiro `rng.float()` continua sendo o dos
  inícios. Os hashes de `tests/fixedmap.test.ts` **não** podem mudar; se mudaram, você mexeu no caminho antigo.
- **`placeNavalResources` depois de `placeEraResources`** (E2) e com o RNG próprio; nunca rode `widenChokepoints` de novo.
- **Ilhas sem `ensureConnectivity`**: se ele rodar, abre corredores de areia entre as ilhas e o tipo vira "Continental".
- **Partida terrestre idêntica**: a IA não pode chamar `findBuildSpot('shipyard')` sem peixe perto nem em modo terra; não
  insira as pesquisas navais no meio de `RESEARCH_PRIORITY`; `summarize` só escreve `nav=` com navio. O diff do smoke
  (Verificação 4) é a prova.
- **Justiça de posição**: nenhum "primeiro do Map", nenhuma varredura (y, x) decidindo na IA nem no núcleo; use `fairer`.
  A única ordem (y, x) permitida é a do desenho do representante no `egeu.ts` (a simetria do `MapBuilder` copia).
- **Ciclos de importação**: `sim/naval.ts` não importa `units.ts` nem `combat.ts` (quem chama dá as ordens; o afundamento
  mora no `killUnit`). `map/naval.ts` não importa `components.ts` (o contrário sim).
- **Determinismo**: nada de `Math.random`, `Math.sin/cos/atan2/pow/hypot`, `Date.now` em `src/core`; `Math.sqrt` e `x * x`.
  O `Math.sin` do balanço do navio fica no renderizador (permitido).
- **Atalhos**: `I` só no Estaleiro (o `I` do editor é outro contexto); nenhum treino com `A`/`R`/`U`; no Estaleiro,
  `T`, `M`, `C`, `V`, `B`, `Z` e `X` ficam livres (reservados para a E5 e a E6, D11).
- **Textos**: toda chave nova PT e EN com as mesmas `{variáveis}`, sem emoji em `strings.ts`; o `icon` dos dados copia um
  caractere que já existe (nada de emoji novo, que exigiria `EMOJI_GLYPHS`).
- **Ícone do HUD obrigatório**: `unit/<navio>` faltando quebra `hud-icons.test.ts` e o `playtest-noemoji`; só o
  `npm run art:hud` grava o atlas. **Não rode `npm run art:bake`** (sem `--out` ele reempacota `public/art` só com o cache).
- **Egeu**: o `.map.json` só pelo script (`npx tsx scripts/maps/egeu.ts`); editar à mão quebra o teste de igualdade.
  O Estreito não muda.
- **Campanha**: não ponha `"naval": true` em missão nenhuma; nenhuma missão nem `testing.ts` muda nesta etapa.
- **Passageiro com `hpFloor`** (só cenário) sobrevive ao naufrágio e fica na água: aceito (navios desligados em cenário).
- **storeSet**: a E4 não grava nada do jogador; se acrescentar algo (um filtro do editor), use `storeSet`/`storeRemove`.
- **O npm engole opções**: `npm run map:export saida --size small` vira o posicional `small` e o script só imprime o
  "Uso:". Rode `npx tsx scripts/export-map.ts …` direto ou ponha `--` (`npm run map:export -- saida --size small`); o
  mesmo vale para `npm run smoke 20 42 -- --map …` e `npm run balance 35 1,2,3 -- --map …`.
- **Evoluções navais em mapa de terra**: a `evolutionPriority` da E3 percorre todas as linhas; sem o filtro do passo E1
  (linha só de Estaleiro e nenhum Estaleiro pronto → pula), a IA estuda `evo_warship_*` no Continental, o balance muda e o
  diff da Verificação 4/6 deixa de ser vazio.
- **Ritmo da IA naval**: nunca `(state.tick + player.id) % N === 0` — a IA só pensa a cada `thinkEvery` ticks e o resto
  bate só para alguns jogadores (viés de posição). Use a janela de 10 s do passo E3 (`Math.floor(tick / every)`).
- **Navio nascendo em terra**: `createGame` (entidades do mapa fixo), `findSpawnTile`, `debugSpawn` do `main.ts` e o
  `moveEntity`/`pushUnitsFrom` do editor procuram tile livre na camada terrestre; sem a camada (C12, D6), o navio nasce
  na praia e o invariante do fuzz (G2) falha. A recíproca também: hoplita de cenário não pode cair num tile de água rasa.
- **Afogados**: sem o `drowned` do C6 o naufrágio vira Sombras de Hades presas na água; sem o `p.x = u.x` antes do
  `killUnit` do passageiro, o cadáver e a queda saem na posição velha (o cais).
- **Embarque sem fim**: unidade de `pop: 0` (herói, criatura de poder) teria assento grátis; por isso `seatsOf` =
  `Math.max(1, pop)` (C1). Portador de relíquia não embarca (C1): a relíquia sumiria no naufrágio.
- **Barco não é cidadão**: o barco de pesca tem `gather`, mas não guarnece (C3), não reza nem cultiva (C9b); sem isso o
  `startOrder` o manda para o templo ou para uma fazenda em terra e ele fica parado com `blocked`.
- **Estreito tem lagos**: dois lagos de ~190 tiles (≥ `MIN_DOCK_WATER`) a ~25 tiles um do outro. O `seasApart` do
  `validateMap` (D3) só é conferido entre inícios em regiões terrestres **diferentes** — feito na ordem do D3, o Estreito
  continua com zero avisos. Também não há peixe nele: a IA não faz Estaleiro e o fairness fica igual (Verificação 9).
- **Teto do atlas `hud`**: o `art:check` limita o PNG do grupo a `BUDGET.maxHudPngMB` (4 MB, `scripts/bake/check.ts`);
  hoje ~2,6 MB, e a E2, a E3 e a E4 somam ícones (~17 KB cada, 1× + 2×). Se estourar, suba o teto para 5 com o
  comentário "E2–E4: recursos, evoluções e navios" e registre no `PROGRESSO.md`; não baixe a resolução dos ícones.
- **`isNodeType` do editor**: se ainda for a lista fixa de antes da E2, `fish`/`rare_fish` somem em silêncio das ops do
  editor (sem erro). Confira no A1 (ele tem de consultar `NODE_AMOUNT`).
- **Voador × navio** fica para a E6: com o `canTarget` do C6, voador corpo a corpo (Pégaso) não ataca navio e navio corpo
  a corpo não ataca voador. Não "corrija" agora (muda o combate das míticas).
- **Modo ilha por acidente**: o jogador humano que se emparedar ao lado de um lago grande (muralha fechando a única rota)
  deixa a IA sem Centro Cívico inimigo alcançável por terra; com o mesmo `seaOfStart`, ela entra em modo ilha e tenta
  desembarcar. É aceito (é o comportamento certo para essa geometria), mas não conte isso como bug do Continental.

## Ao terminar

1. **`docs/eras/PROGRESSO.md`** (formato no `docs/eras/LEIA-ME.md`): caixas da E4 marcadas e linha da E4 do Resumo
   com o estado `feito`, data e commit, com as notas: baixio = terreno 6; camada naval
   derivada (`src/core/map/naval.ts`); navios desligados em cenário (`config.naval`); `rare_fish` fora de `RARE_NODES`;
   Estreito sem mudança; números do balance nos 3 tipos navais; resultado do fairness do Egeu e das Ilhas; o que o G6
   mudou.
2. **`docs/ROADMAP.md`**, tabela "Cronograma a partir de 06/10/2026", linha das semanas 5–7: marque a E4 como feita, com o mesmo sinal de concluído que a E2 e a E3 usaram nessa tabela, e a data;
   na linha do passo 5.3 (Naval), `✅` no início da descrição e "feito (E4, <data>)"; na linha do passo 5.1, troque
   "Pendente: ilhas (depende do naval, 5.3)" por "Ilhas, Costeiro e Mediterrâneo com a E4".
3. **`CLAUDE.md`**:
   - em "Estado atual", uma frase: E4 concluída (água navegável com baixio, camada naval derivada em
     `src/core/map/naval.ts`, Estaleiro, pesca e atum, transporte com `embark`/`unload`, linha `warship` I–VIII e barcos a
     vapor, IA naval com desembarque nas Ilhas, mapas Costeiro/Ilhas/Mediterrâneo e Egeu navegável; navios procedurais
     até a E8);
   - em "Regras do núcleo" ou "Convenções": "movimento por camada: toda busca, caminho e região de navio passa
     `layer = 'naval'` (`Layer`/`layerOf` de `src/core/map/naval.ts`); terreno por `isNavigableTerrain`/`isUnbuildableTerrain`/`nodeFitsTerrain`, nunca `WATER || DEEP` literal";
   - em "Comandos": `node scripts/playtest-naval.mjs` na lista dos playtests; e corrija o exemplo do `map:export`, que
     hoje não funciona (o npm engole as opções): `npm run map:export -- saida.map.json --size small --seed 42
     [--type continental|…|coastal|islands|mediterranean]`.
4. **Commit** em português, por exemplo
   `E4: guerra no mar (baixio e camada naval, Estaleiro, pesca, transporte, navios I–VIII, IA naval, mapas Costeiro/Ilhas/Mediterrâneo, Egeu navegável)`,
   com o rodapé de atribuição exigido pela sua sessão. Faça push só para a branch da sessão (rotina do `docs/eras/LEIA-ME.md`); nunca para `main` sem pedido do dono.

Ganchos para as etapas seguintes (não implemente agora):

- **E5 (comércio):** `merchant_ship` (dados reservados acima) no `trains` do Estaleiro, com a tecla que o guia da E5
  escolhe entre as reservadas no D11 (a 1ª livre de `M`, `C`, `V`, `B`); rotas entre Estaleiros (portos) com
  `nearestNavalDropoff`/`shoreTileNear`/`rectReachable(..., 'naval')`; Canal de Corinto da E7 e Farol aumentam a renda.
  A E4 **não** dá alias de arte a navio nenhum (D22: procedurais), e o guia da E5 já segue isso (Fase F, D25 de lá). O mercante já sai desenhado pelo `drawShip` (F3: genérico, lê `UNITS[type]`) e precisa de uma entrada `merchant_ship: S({ kind: 'transport' })` no `SHIP_ICONS` de `scripts/bake/hud/catalog.mjs` +
  `npm run art:hud` (senão `tests/hud-icons.test.ts` falha) e o filtro do `tests/art-etapa6.test.ts` (F8) já o exclui
  por `naval`.
- **E6 (mitologia):** camada `'amphibious'` (passável se terra **ou** mar) para Oceano, Ceto e Escila; Hipocampos como
  `cls: 'myth'` com `naval: true` (o núcleo já aceita mítico naval); Vendaval (empurra e para navios) e Maremoto (Tritão).
- **E7 (maravilhas):** Farol (`{ type: 'unit', match: { tags: ['ship'] }, stat: 'speed', mult: 1.15 }` e `los`, revela a
  costa), Arsenal de Cândia (custo ×0,7 e treino mais rápido de `ship`), Canal de Corinto (`navalPassable`, passo M2
  do guia E5–E7). O Canal **não** pinta terreno (o guia da E7 proíbe escrever em `map.terrain`): o `navalBlocked` desta
  etapa só olha `map` (terreno, `nodeAt`, `buildingAt`), então a E7 guarda os tiles abertos fora do `GameMap` — um
  `Set` por mapa num `WeakMap` (`setNavalOpen` em `src/core/map/naval.ts`, passo M2 da E7), refeito em
  `onWonderComplete`, `destroyBuilding`, `removeBuildingNow` e no `deserialize` a partir dos edifícios — e o
  `navalBlocked` passa a ler `(isNavigableTerrain(t) || open) && nodeAt === -1 && (buildingAt === -1 || open)`, com
  `invalidateNaval`/`invalidateComponents(map)` a cada mudança. Não crie campo novo no `GameMap` (save, editor e
  literais de mapa ficariam diferentes).
- **E8 (arte):** rigs de navio (remos, velas, vapor) e Estaleiro por Era; os navios saem do procedural e do
  `SHIP_ICONS`; som próprio de navio. O `SHIP_ICONS` mora em `scripts/bake/hud/catalog.mjs` (passo F7): é de lá que a
  E8 o tira (D28 dela), quando os navios ganham manifesto.
- **E10:** números das 10 unidades, das tabelas navais da IA e das pesquisas do Estaleiro com partidas de 60 min nos
  mapas com mar.
