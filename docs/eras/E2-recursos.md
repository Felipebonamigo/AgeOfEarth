# E2 — Pedra, petróleo e recursos raros

- Estado: pendente · Pré-requisitos: **E1 concluída** (8 Eras em `AGES`, Biblioteca, avanço de Era, `SIM_VERSION` já subido uma vez) · Estimativa: 5 dias de trabalho do agente

> Guia de execução para um agente sem o contexto da conversa que o escreveu. Siga os passos na ordem, um commit por
> fase (A–E). Cada número de jogo daqui é **valor inicial para o balanceamento** (E10 ajusta); não invente outros. Onde
> o guia diz "como hoje", o código citado foi conferido em 06/10/2026, antes da E1: a E1 pode ter mexido em volta (por
> exemplo trocado um `if` por tabela). Se um trecho citado não existir mais na forma descrita, procure o equivalente
> pelo nome da função e aplique a mesma mudança; não reescreva a lógica da E1.

## Objetivo e resultado jogável

Ao fim da E2, numa partida rápida:

- A barra do topo mostra **Comida, Madeira, Pedra, Ouro, Conhecimento, Favor** e, da **Era IV** (índice 3) em diante,
  **Petróleo** (7 recursos).
- Cidadãos colhem **pedra** em afloramentos de calcário (nó `limestone`) desde a Era I e entregam no Centro Cívico ou na
  nova **Pedreira**, que tem 3 pesquisas de economia.
- A partir da Era IV, cidadãos colhem **nafta** nas fontes (nó `naphtha`) e entregam no **Poço de Nafta**.
- A partir da Era VII (índice 6), o **Poço de Petróleo**, construído encostado numa **jazida** (nó `oil_field`), extrai
  petróleo sozinho (sem cidadão), e a **Refinaria** recebe petróleo e pesquisa o refino.
- Templo, torres, muralhas, portões, Fortaleza, Centro Cívico, Mercado, Oficina, maravilhas, Portal dos Titãs e os
  avanços de Era passam a custar pedra; os avanços das Eras V–VIII custam também petróleo.
- O mapa tem **7 recursos raros** (oliveiras, vinhedos, mármore de Paros, sal, cavalos selvagens, cobre, incenso). Um
  **Mercador** (treinado no Mercado) parado num raro rende ouro por segundo e dá o bônus daquele raro ao império inteiro.
- O gerador aleatório, os 2 mapas oficiais e os 6 mapas fixos da campanha têm pedra perto de cada base; o editor pinta os
  10 nós novos; `map:check` e a tabela por início mostram pedra, petróleo e raros.
- A IA coleta pedra e petróleo, constrói pedreira e poços, usa o mercado com pedra e põe Mercadores nos raros.
- Arte provisória: nós desenhados pelo procedural; os 4 edifícios e o Mercador usam a arte assada de um tipo existente
  (alias), até a E8.

## Decisões já tomadas (não reabrir; cite docs/ERAS.md)

Do plano aprovado pelo dono (`docs/ERAS.md`):

- §3: os recursos são comida, madeira, **pedra** (afloramentos de calcário e mármore, **pedreira**, desde a I; usada em
  muralhas, torres, fortalezas, Templo, maravilhas e Eras), ouro, conhecimento, favor e **petróleo** (IV: fontes de nafta
  e betume; VII: poços e refinaria).
- §3: **recursos raros** marcados no mapa (oliveiras, vinhedos, mármore de Paros, sal, cavalos selvagens, cobre, peixes
  raros, incenso). **Um Mercador ocupa o raro, que rende ouro e um bônus.** Exemplos do plano: azeite = comida das
  fazendas +; cavalos = cavalaria mais barata; mármore = edifícios mais resistentes.
- §3: o gerador e o editor distribuem pedra, nafta e raros com **a mesma justiça por início** que já vale para ouro e
  madeira (`map:check` com a tabela por início).
- §3: a barra do topo mostra 7 recursos; **o petróleo só aparece a partir da IV**.
- §5: edifícios novos **Pedreira** (entrega de pedra), **Poço de nafta** (IV), **Poço de petróleo + Refinaria** (VII).
- §2: as pesquisas de economia (celeiro, serraria, mina, **pedreira**) **ficam fora da Biblioteca**.
- §10 e §11: E2 = pedra e petróleo (nós, pedreira, poços, custos, mapgen, editor, barra do topo) e recursos raros;
  determinismo como hoje; `SIM_VERSION` sobe; arte provisória até a E8; a campanha continua nas Eras I–IV.

Decisões deste guia (tomadas ao escrevê-lo; cada uma em uma linha, não reabrir sem o dono):

1. **Ids dos nós diferentes dos ids de recurso** (`limestone`, `naphtha`, `oil_field`): `nearestNode` decide "tipo de nó ×
   recurso" pelo id (`queries.ts`), e um nó chamado `stone` ou `oil` confundiria as buscas.
2. **O Centro Cívico também recebe pedra** (dropoff `food, wood, stone, gold`): a Era I não depende de pedreira e a IA
   não trava; a Pedreira vale pela distância e pelas pesquisas.
3. **Petróleo da IV = coleta normal** (nó `naphtha` + entrega no Poço de Nafta, cidadão recusa antes da IV); **petróleo da
   VII = extrator passivo** (Poço de Petróleo encostado na jazida `oil_field` tira 1/s; nenhum cidadão colhe jazida).
   Assim cada edifício tem um papel e a IA da IV reaproveita o caminho genérico de coleta.
4. **Raro = nó que não se esgota** (`NODE_AMOUNT` 99 999, nunca decrementado), capacidade 1. O Mercador fica ao lado e
   rende ouro direto (sem carregar); o bônus vale enquanto houver **um** Mercador seu trabalhando num raro daquele tipo
   (não soma dois do mesmo tipo). Sem exigência de território (o Mercador fica exposto; revisar na E10).
   **Um nó rende para um Mercador só** (o de menor id ao lado dele): a renda e o bônus são calculados uma vez por
   segundo em `economySecond` (passo 11), não por tick em `updateGather` — a capacidade 1 de `NODE_CAPACITY` só desvia
   quem chega (`nearestNodeWithRoom`) e, sem essa regra, 10 Mercadores empilhados num olival renderiam 5 de ouro/s.
5. O ERAS §11 põe "Mercador nos raros" na E5; **este guia antecipa o Mercador mínimo** (unidade + ocupação), senão os
   raros da E2 seriam enfeite. A E5 fica com caravanas e navios mercantes. Registre isso no `PROGRESSO.md`.
6. **Peixes raros ficam para a E4** (precisam de nó na água; hoje `addNode` recusa água). A E2 entrega 7 raros.
7. **Arte provisória por alias** (`src/render/art/alias.ts`): tipo novo sem manifesto usa a arte assada e o ícone de um
   tipo existente com a mesma pegada (edifício) ou classe (unidade). Não há bake de edifício/unidade na E2; só o
   `npm run art:hud` (ícones de recurso). Nós novos: procedural (`textures.ts`).
8. **Atalhos**: Pedreira = `Y`; os 3 edifícios de petróleo dividem `O` num **grupo de atalho** (`hotkeyGroup: 'oil'`,
   apertar de novo alterna, como `M` nas maravilhas). Sobram `I` e `L` para a E4 (Estaleiro, Universidade).
9. **Gerador**: uma passada nova (`placeEraResources`) com **RNG próprio**, rodando **depois** de toda a geração antiga:
   nenhum nó antigo muda de lugar (os roteiros da campanha com mapa gerado continuam valendo; só um edifício de roteiro
   posto por `placeNear` pode andar um tile se um nó novo ocupar o lugar — passo 30). O algoritmo abaixo foi
   prototipado e medido: 0 nós antigos removidos e nenhum ponto de articulação novo em 11 sementes/tipos (13 na revisão).
10. **Campanha**: a IA não treina Mercador nem coleta petróleo dentro de cenário (`state.scenario`): a campanha ganha só a
    pedra. Missões recebem pedra no `startingResources` e afloramentos nos mapas fixos.
11. **Save**: sem subir `SAVE_VERSION` na E2 (a E1 renomeou o `VERSION` de `serialize.ts` para `SAVE_VERSION` e o
    subiu para 2); o `deserialize` dá padrão 0 às chaves novas. `SIM_VERSION` sobe mais 1.
12. **Petróleo sem ponto de entrega trava o cidadão**: hoje o Centro Cívico recebe tudo, então nunca houve carga sem
    destino; o petróleo só entra no Poço de Nafta/Refinaria. Um cidadão com nafta na mão e sem poço vai para `return`, não
    acha entrega e volta a `idle` com a carga — e `switchCargo` o manda entregar de novo a cada ordem de coleta. Por isso
    a IA **nunca** manda cidadão à nafta sem um ponto de entrega de petróleo pronto e constrói o primeiro Poço de Nafta ao
    lado da fonte (passos 20 e 21); para o humano, a dica da fonte avisa (passo 24). A regra de `switchCargo` não muda.

## Arquivos que mudam

| Caminho | O que muda |
|---|---|
| `src/core/constants.ts` | `RESOURCES` com `stone` e `oil`; nomes/ícones; `OIL_FROM_AGE`; `NodeType` com 10 tipos novos e as 4 tabelas por nó; `RARE_NODES`, `RARE_SET`, `WELL_NODES`, `NOT_GATHERED`, `RARE_GOLD_RATE`, `MERCHANT_MAX_AI`; `DEATHMATCH_RESOURCES`; `SIM_VERSION` +1 |
| `src/core/types.ts` | `BuildingDef.extract?`, `BuildingDef.hotkeyGroup?`; `Player.rares` |
| `src/core/data/buildings.ts` | 4 edifícios novos; custos com pedra (tabela); CC recebe pedra; Mercado treina `merchant`; `BUILD_MENU` |
| `src/core/data/units.ts` | unidade `merchant` |
| `src/core/data/techs.ts` | 6 pesquisas novas; custo de `masonry` e `fortified_towns` |
| `src/core/data/ages.ts` | pedra e petróleo somados ao custo de cada Era |
| `src/core/data/rares.ts` (novo) | `RARES`: bônus de cada raro (`Effect[]`) |
| `src/core/data/index.ts` | reexporta `rares.ts` |
| `src/core/map/mapgen.ts` | `NODE_AMOUNT` dos 10 tipos; `placeEraResources` chamada no fim de `generateMap` |
| `src/core/map/fixed.ts` | `StartResources` e `startResourceTable` com `stone`, `oil`, `rare` |
| `src/core/sim/queries.ts` | `nearestNodeBy`, `nearestNode` sem raros/jazidas na busca por recurso, `nearestRareNode`, `canWorkNode`, `extractorNode` |
| `src/core/sim/commands.ts` | `gather` filtra por `canWorkNode`; `pray` recusa Mercador; `trade` de petróleo só da IV |
| `src/core/sim/units.ts` | `startOrder` (gather/pray), `updateGather` (Mercador parado no raro) e `pickNewSource` (Mercador não troca de fonte) |
| `src/core/sim/entities.ts` | `canPlaceBuilding`: extrator precisa encostar no nó |
| `src/core/sim/economy.ts` | extração do Poço de Petróleo; ocupação e renda dos raros (um Mercador por nó); `marketTrade` de petróleo |
| `src/core/sim/modifiers.ts` | `defaultMods` com `stone`/`oil`; bônus dos raros em `recomputeMods` |
| `src/core/sim/game.ts` | literais de recursos, `gathered`, `prices`, `rares: []` |
| `src/core/sim/ai.ts` | pedra e petróleo na economia, entrega, orçamento, mercado, pesquisa; Poço de Nafta, Poço de Petróleo, Refinaria; Mercadores; `nearestUnclaimedNode` e `sealsNode` ignoram raros/jazidas |
| `src/core/scenario/testing.ts` | conferências de custo e cofres (`reserve`) do harness com pedra (passo 30) |
| `scripts/loadtest.ts` | bots do teste de carga também coletam pedra (passo 20) |
| `src/core/serialize.ts` | padrões para `stone`/`oil`/`rares`; `mods` por `defaultMods()` |
| `src/core/net/hash.ts`, `src/core/net/desync.ts` | pedra, petróleo e raros no hash e no relatório |
| `src/core/scenario/schema.ts`, `compile.ts`, `helpers.ts`, `campaign.ts` | stats `stone`/`oil`; `give` tipado por `ResourceType`; pedra inicial das missões TS |
| `src/core/scenario/missions/*.scenario.json` | `startingResources.stone` (todas) e `map.data` regerado (m4, m5, m8, m10, m11, m12) |
| `scripts/maps/lib.ts`, `estreito.ts`, `egeu.ts` | pedra no layout do início; nós novos simétricos; igualdade de pedra/petróleo/raros |
| `scripts/maps/m4_caucaso.ts`, `m5_itaca.ts`, `m8_oceano.ts`, `m10_otris.ts`, `m11_chamas.ts`, `m12_titanomaquia.ts` | `STONE_CLUSTERS` com RNG próprio, depois dos bosques |
| `src/core/data/maps/estreito.map.json`, `egeu.map.json` | regerados pelos scripts (nunca à mão) |
| `scripts/mapcheck.ts` | imprime pedra, petróleo e raros por início |
| `src/editor/ops.ts`, `src/editor/panel.ts` | `isNodeType` pela tabela; paleta e ícones dos nós novos; colunas da tabela por início |
| `src/ui/hud.ts` | barra do topo (petróleo escondido antes da IV), raros no topo, mercado, extrator no cartão, fim de partida |
| `src/ui/input.ts` | dica do nó; clique direito confere `canWorkNode`; ciclo do atalho filtra pela Era |
| `src/ui/icons.ts` | `ic.unit`/`ic.bld` resolvem o alias |
| `src/render/art/alias.ts` (novo) | `UNIT_ART_ALIAS`, `BUILDING_ART_ALIAS` |
| `src/render/art/ArtLibrary.ts` | `unitId`, `prewarmUnits`, `buildingArt`, `building`, `icon` resolvem o alias |
| `src/render/textures.ts`, `src/render/shadows.ts`, `src/render/minimap.ts` | desenho, sombra e cor dos nós novos |
| `src/render/fx/rules.ts`, `src/render/fx/unitFx.ts`, `src/render/fx/handlers/nodeGone.ts`, `src/audio/events.ts` | trabalho/som/queda do calcário; raros e jazida sem efeito de trabalho |
| `src/i18n/strings.ts`, `src/i18n/en-data.ts` | textos PT e EN |
| `scripts/bake/hud/catalog.mjs`, `scripts/bake/page/hud-objects.js` | ícones `res/stone`, `res/oil` e das 6 pesquisas |
| `public/art/hud-*.{png,json}`, `public/art/manifest.json` | regerados por `npm run art:hud` |
| `scripts/playtest-editor.mjs` | paleta de nós com 16 chips |
| testes (ver seção própria) | `command-fuzz`, `fixedmap`, `editor`, `data`, `position-fairness`, `hud-icons`, `hud-text`, `art-etapa6`, `art-library`, `art-manifest`, `m4_caucaso`, `m6_estatua`, `scenario-gaps`, `resources-e2` (novo); `m4_caucaso`, `m5_itaca`, `m8_oceano`, `m10_otris`, `m11_chamas`, `m12_titanomaquia` só passam depois do `--write` do passo 19 |

## Dados prontos

Todos os números são valores iniciais para o balanceamento (E10).

### Recursos (`src/core/constants.ts`)

Ordem nova de `RESOURCES` (é também a ordem da barra do topo e a dos literais; **use exatamente esta ordem em todo
literal**, senão a ida e volta do save muda a ordem das chaves e o fuzz acusa):

```ts
export const RESOURCES = ['food', 'wood', 'stone', 'gold', 'oil', 'knowledge', 'favor'] as const;
```

| id | PT (`res.*`) | EN | emoji (só dado) | inicial | Deathmatch |
|---|---|---|---|---|---|
| food | Comida | Food | 🍖 | 300 | 4000 |
| wood | Madeira | Wood | 🪵 | 250 | 4000 |
| stone | Pedra | Stone | 🪨 | **100** | **2000** |
| gold | Ouro | Gold | 🪙 | 120 | 3000 |
| oil | Petróleo | Oil | 🛢️ | **0** | **500** |
| knowledge | Conhecimento | Knowledge | 📜 | 0 | 300 |
| favor | Favor | Favor | ⚡ | 0 | 150 |

Constantes novas:

```ts
/** Era IV (índice 3): a nafta passa a ser coletada, o petróleo aparece na barra do topo e entra no mercado. */
export const OIL_FROM_AGE = 3;
/** Ouro por segundo de um Mercador trabalhando num recurso raro (antes de mods.gather.gold). */
export const RARE_GOLD_RATE = 0.5;
/** A IA mantém no máximo este número de Mercadores. */
export const MERCHANT_MAX_AI = 3;
```

### Nós (`constants.ts` + `NODE_AMOUNT` em `mapgen.ts`)

| NodeType | PT (`node.*`, `NODE_NAMES`) | EN (`node.*`) | `NODE_RESOURCE` | `GATHER_RATES` | `NODE_CAPACITY` | `NODE_AMOUNT` | quem trabalha | desde |
|---|---|---|---|---|---|---|---|---|
| limestone | Afloramento de Calcário | Limestone Outcrop | stone | 0.85 | 4 | 600 | cidadão | I |
| naphtha | Fonte de Nafta | Naphtha Seep | oil | 0.6 | 3 | 1500 | cidadão | IV (`OIL_FROM_AGE`) |
| oil_field | Jazida de Petróleo | Oil Field | oil | 0 | 0 | 8000 | Poço de Petróleo (1/s) | VII |
| olive | Olival | Olive Grove | gold | 0.5 | 1 | 99999 | Mercador | II |
| vineyard | Vinhedo | Vineyard | gold | 0.5 | 1 | 99999 | Mercador | II |
| paros_marble | Mármore de Paros | Parian Marble | gold | 0.5 | 1 | 99999 | Mercador | II |
| salt | Salinas | Salt Pans | gold | 0.5 | 1 | 99999 | Mercador | II |
| wild_horses | Cavalos Selvagens | Wild Horses | gold | 0.5 | 1 | 99999 | Mercador | II |
| copper | Minas de Cobre | Copper Mines | gold | 0.5 | 1 | 99999 | Mercador | II |
| incense | Árvores de Incenso | Frankincense Trees | gold | 0.5 | 1 | 99999 | Mercador | II |

("desde II" dos raros = o Mercado, que treina o Mercador, é `age: 1`.)

Conjuntos (em `constants.ts`, depois de `HUNT_TYPES`; a ordem de `RARE_NODES` é usada pelo gerador — não reordene):

```ts
export const RARE_NODES: readonly NodeType[] = ['olive', 'vineyard', 'paros_marble', 'salt', 'wild_horses', 'copper', 'incense'];
export const RARE_SET: ReadonlySet<string> = new Set<string>(RARE_NODES);
/** Nós que só um extrator (BuildingDef.extract) explora. */
export const WELL_NODES: ReadonlySet<string> = new Set<string>(['oil_field']);
/** Nós que nenhum cidadão coleta: fora das buscas por recurso (nearestNode com 'gold', 'oil'…). */
export const NOT_GATHERED: ReadonlySet<string> = new Set<string>([...RARE_NODES, 'oil_field']);
```

### Recursos raros (`src/core/data/rares.ts`, novo)

| id | bônus (PT, `rare.<id>`) | bônus (EN) | `effects` |
|---|---|---|---|
| olive | Azeite: fazendas +10%. | Olive oil: farms +10%. | `[{ type: 'gather', resource: 'farm', mult: 1.1 }]` |
| vineyard | Vinho: taxas do Mercado 20% menores. | Wine: Market fees 20% lower. | `[{ type: 'player', stat: 'tradeTax', mult: 0.8 }]` |
| paros_marble | Mármore: edifícios +10% de vida. | Marble: buildings +10% health. | `[{ type: 'building', match: 'all', stat: 'hp', mult: 1.1 }]` |
| salt | Sal: suas tropas sofrem 25% menos atrito. | Salt: your troops suffer 25% less attrition. | `[{ type: 'player', stat: 'attritionResist', add: 0.25 }]` |
| wild_horses | Cavalos: cavalaria 15% mais barata. | Horses: cavalry 15% cheaper. | `[{ type: 'cost', match: { tags: ['cavalry'] }, mult: 0.85 }]` |
| copper | Cobre: militares +5% de ataque. | Copper: military units +5% attack. | `[{ type: 'unit', match: { tags: ['military'] }, stat: 'attack', mult: 1.05 }]` |
| incense | Incenso: Favor +15%. | Incense: Favor +15%. | `[{ type: 'player', stat: 'favorRate', mult: 1.15 }]` |

```ts
// src/core/data/rares.ts
// Recursos raros (docs/ERAS.md §3; docs/eras/E2-recursos.md): um Mercador trabalhando num nó deste tipo rende ouro
// (RARE_GOLD_RATE/s) e o bônus abaixo vale para o império inteiro enquanto ele estiver lá (Player.rares, recomputeMods).
import type { Effect } from '../types';
export interface RareDef { id: string; effects: Effect[] }
export const RARES: Record<string, RareDef> = {
  olive: { id: 'olive', effects: [{ type: 'gather', resource: 'farm', mult: 1.1 }] },
  vineyard: { id: 'vineyard', effects: [{ type: 'player', stat: 'tradeTax', mult: 0.8 }] },
  paros_marble: { id: 'paros_marble', effects: [{ type: 'building', match: 'all', stat: 'hp', mult: 1.1 }] },
  salt: { id: 'salt', effects: [{ type: 'player', stat: 'attritionResist', add: 0.25 }] },
  wild_horses: { id: 'wild_horses', effects: [{ type: 'cost', match: { tags: ['cavalry'] }, mult: 0.85 }] },
  copper: { id: 'copper', effects: [{ type: 'unit', match: { tags: ['military'] }, stat: 'attack', mult: 1.05 }] },
  incense: { id: 'incense', effects: [{ type: 'player', stat: 'favorRate', mult: 1.15 }] },
};
```

Os textos dos raros moram em `strings.ts` (`node.<id>` e `rare.<id>`), não no dado: assim não é preciso mexer em
`setLocale`.

### Edifícios novos (`src/core/data/buildings.ts`)

| id | PT | EN | Era (`age`) | custo | vida | pegada | obra (s) | entrega | atalho | outros | alias de arte |
|---|---|---|---|---|---|---|---|---|---|---|---|
| quarry | Pedreira | Quarry | I (0) | wood 100 | 500 | 2×2 | 30 | stone | `Y` | — | mine |
| naphtha_well | Poço de Nafta | Naphtha Well | IV (3) | wood 150, stone 50 | 600 | 2×2 | 35 | oil | `O` | `hotkeyGroup: 'oil'` | granary |
| oil_well | Poço de Petróleo | Oil Well | VII (6) | wood 200, stone 100, gold 100 | 900 | 2×2 | 45 | — | `O` | `hotkeyGroup: 'oil'`, `extract: { node: 'oil_field', rate: 1 }` | lumber_camp |
| refinery | Refinaria | Refinery | VII (6) | wood 300, stone 200, gold 150 | 1500 | 3×3 | 60 | oil | `O` | `hotkeyGroup: 'oil'`, `limit: 2` | market |

Descrições:

| id | `desc` PT | `desc` EN |
|---|---|---|
| quarry | Ponto de entrega de pedra e pesquisas de cantaria. | Stone drop-off point and stonecutting research. |
| naphtha_well | Ponto de entrega de petróleo: os cidadãos colhem a nafta das fontes (a partir da Era IV) e a trazem para cá. | Oil drop-off point: citizens gather naphtha from the seeps (from Era IV on) and bring it here. |
| oil_well | Construído encostado numa jazida de petróleo, extrai 1 de petróleo por segundo sem cidadãos, até a jazida secar. | Built touching an oil field, it extracts 1 oil per second with no citizens until the field runs dry. |
| refinery | Recebe petróleo e pesquisa o refino (coleta e extração de petróleo mais rápidas). | Receives oil and researches refining (faster oil gathering and extraction). |

Código (todos com `armor: BARMOR`; `icon` é emoji de dado, o HUD não o mostra):

```ts
  quarry: { id: 'quarry',
    name: 'Pedreira', icon: '🪨', cost: { wood: 100 }, hp: 500, w: 2, h: 2, buildTime: 30, armor: BARMOR,
    dropoff: ['stone'], age: 0, hotkey: 'Y', desc: 'Ponto de entrega de pedra e pesquisas de cantaria.',
  },
  naphtha_well: { id: 'naphtha_well',
    name: 'Poço de Nafta', icon: '🛢️', cost: { wood: 150, stone: 50 }, hp: 600, w: 2, h: 2, buildTime: 35, armor: BARMOR,
    dropoff: ['oil'], age: 3, hotkey: 'O', hotkeyGroup: 'oil',
    desc: 'Ponto de entrega de petróleo: os cidadãos colhem a nafta das fontes (a partir da Era IV) e a trazem para cá.',
  },
  oil_well: { id: 'oil_well',
    name: 'Poço de Petróleo', icon: '🛢️', cost: { wood: 200, stone: 100, gold: 100 }, hp: 900, w: 2, h: 2, buildTime: 45, armor: BARMOR,
    age: 6, hotkey: 'O', hotkeyGroup: 'oil', extract: { node: 'oil_field', rate: 1 },
    desc: 'Construído encostado numa jazida de petróleo, extrai 1 de petróleo por segundo sem cidadãos, até a jazida secar.',
  },
  refinery: { id: 'refinery',
    name: 'Refinaria', icon: '🏭', cost: { wood: 300, stone: 200, gold: 150 }, hp: 1500, w: 3, h: 3, buildTime: 60, armor: BARMOR,
    dropoff: ['oil'], age: 6, limit: 2, hotkey: 'O', hotkeyGroup: 'oil',
    desc: 'Recebe petróleo e pesquisa o refino (coleta e extração de petróleo mais rápidas).',
  },
```

Se a E1 criou `ERA` em `src/core/data/ages.ts` (o guia dela cria: `ERA.BYZANTINE = 3`, `ERA.INDUSTRIAL = 6`), escreva
`age: ERA.BYZANTINE` no Poço de Nafta e `age: ERA.INDUSTRIAL` no Poço de Petróleo e na Refinaria (o arquivo já importa de
`./ages` por causa de `ERA_TITANS`). `OIL_FROM_AGE` (em `constants.ts`, que não pode importar `data`) fica 3; o teste
novo confere `OIL_FROM_AGE === ERA.BYZANTINE`.

`BUILD_MENU`: `'quarry'` logo depois de `'mine'`; `'naphtha_well', 'oil_well', 'refinery'` logo depois de `'market'`.

Atalhos: antes de gravar, confira que `Y` e `O` estão livres no `BUILD_MENU` que a E1 deixou
(`npx tsx -e "import {BUILDINGS,BUILD_MENU} from './src/core/data'; console.log(BUILD_MENU.map(b=>BUILDINGS[b].hotkey).join(' '))"`).
Se a E1 já usou um deles, use a primeira letra livre de `Y, O, L, I`, nessa ordem (nunca `A`, `R`, `U`, `H`, `P`). O
`M` do Mercador no Mercado é contexto de edifício e não colide com o `M` das maravilhas (contexto de cidadão).

### Tabela completa de custos de edifício

| id | custo de hoje | custo da E2 |
|---|---|---|
| town_center | wood 300, gold 150 | **wood 250, stone 100, gold 150** |
| house | wood 40 | igual |
| farm | wood 60 | igual |
| granary | wood 100 | igual |
| lumber_camp | wood 100 | igual |
| mine | wood 100 | igual |
| quarry (novo) | — | wood 100 |
| market | wood 150, gold 50 | **wood 125, stone 50, gold 50** |
| temple | wood 200, gold 50 | **wood 150, stone 100, gold 50** |
| barracks | wood 150 | igual |
| stable | wood 150, gold 50 | igual |
| siege_workshop | wood 200, gold 100 | **wood 150, stone 50, gold 100** |
| academy (Biblioteca) | wood 200, gold 100 | igual (é da E1; não mexer) |
| tower | wood 100, gold 50 | **wood 50, stone 100** |
| wall | wood 15 | **wood 5, stone 10** |
| gate | wood 40 | **wood 20, stone 30** |
| fortress | wood 400, gold 300 | **wood 250, stone 350, gold 250** |
| wonder_zeus | wood 800, gold 800, food 600, favor 100 | **wood 600, stone 600, gold 600, food 600, favor 100** |
| wonder_artemis | wood 900, gold 700, food 600, knowledge 200 | **wood 650, stone 600, gold 550, food 600, knowledge 200** |
| wonder_colossus | wood 700, gold 1000, food 600, knowledge 200 | **wood 500, stone 700, gold 800, food 600, knowledge 200** |
| titan_gate | wood 600, gold 600, food 600, favor 200 | **wood 400, stone 400, gold 600, food 600, favor 200** (sem petróleo de propósito: o Portal da campanha não pode depender de nafta) |
| cornucopia | — | igual |
| naphtha_well, oil_well, refinery (novos) | — | ver tabela acima |

Centro Cívico: `dropoff: ['food', 'wood', 'stone', 'gold']`. Mercado: `trains: ['merchant']` (a E5 acrescenta a
caravana a esta lista).

### Custos de Era (`src/core/data/ages.ts`)

**Some** estes valores ao custo que a E1 deixou em cada `AGES[i].cost` (não mexa nos outros recursos nem nos requisitos).
São os números do "Gancho para a E2" do guia `docs/eras/E1-eras-biblioteca.md` (seção das Eras): use estes, não outros.

| índice | Era | + stone | + oil |
|---|---|---|---|
| 0 | I Arcaica | — | — |
| 1 | II Clássica | 0 | — |
| 2 | III Helenística | 150 | — |
| 3 | IV Bizantina | 300 | — |
| 4 | V Pólvora | 400 | 150 |
| 5 | VI Iluminismo | 500 | 300 |
| 6 | VII Industrial | 600 | 450 |
| 7 | VIII Moderna | 800 | 600 |

Se `AGES.length` não for 8, pare: a E1 não está pronta.

### Pesquisas novas (`src/core/data/techs.ts`, no bloco "Economia")

| id | PT | EN | edifício | Era | custo | tempo | pré-req. | efeito | desc PT | desc EN | ícone (`TECH_ICONS`) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| stone_wedges | Cunhas de Bronze | Bronze Wedges | quarry | 0 | food 80, wood 60 | 30 | — | gather stone ×1,15 | Coleta de pedra +15%. | Stone gathering +15%. | `O('blocks')` |
| stone_saws | Serra de Areia | Sand Saw | quarry | 1 | food 160, wood 120 | 40 | stone_wedges | gather stone ×1,15 | Coleta de pedra +15%. | Stone gathering +15%. | `O('saw')` |
| stone_cranes | Guindaste Trispastos | Trispastos Crane | quarry | 2 | food 300, wood 200, gold 100 | 50 | stone_saws | gather stone ×1,15; player buildSpeed ×1,1 | Coleta de pedra +15% e construção 10% mais rápida. | Stone gathering +15% and building 10% faster. | `O('blocks')` |
| bitumen_jars | Jarros de Betume | Bitumen Jars | naphtha_well | 3 | food 200, wood 150 | 40 | — | gather oil ×1,15 | Coleta de petróleo +15%. | Oil gathering +15%. | `O('hydria')` |
| distillation | Destilação | Distillation | refinery | 6 | wood 300, gold 300, knowledge 100 | 50 | — | gather oil ×1,2 | Coleta e extração de petróleo +20%. | Oil gathering and extraction +20%. | `O('crucible')` |
| cracking | Craqueamento | Cracking | refinery | 7 | gold 500, knowledge 200 | 60 | distillation | gather oil ×1,25 | Coleta e extração de petróleo +25%. | Oil gathering and extraction +25%. | `O('crucible')` |

Código no formato de `picks1`: `{ name, icon, building, age, cost, time, prereq?, effects, desc }` (ícones de dado:
`'🪨'`, `'🪚'`, `'🏗️'`, `'🏺'`, `'⚗️'`, `'⚗️'`). Ids sem número no fim, de propósito: `techIconKey` trata `<ramo><dígito>`
como nível de linha.

Pesquisas que passam a usar pedra (se ainda existirem com este id depois da E1):

| id | custo de hoje | custo da E2 |
|---|---|---|
| masonry | wood 200, knowledge 100 | wood 100, stone 150, knowledge 100 |
| fortified_towns | wood 200, gold 100 | wood 100, stone 150, gold 100 |

### Unidade nova (`src/core/data/units.ts`, logo depois de `villager`)

```ts
  merchant: { id: 'merchant',
    name: 'Mercador', plural: 'Mercadores', icon: '🧳', cls: 'villager',
    cost: { food: 50, gold: 50 }, hp: 50, attack: 0, attackType: 'hack', armor: { ...H },
    range: 0.6, speed: 2.4, los: 8, trainTime: 20, pop: 1, radius: 0.28,
    tags: ['civilian', 'human', 'merchant'], bonus: {}, building: 'market', age: 1,
    canGather: true, hotkey: 'M',
    desc: 'Ocupa um recurso raro do mapa: enquanto trabalha nele, rende ouro e o bônus do raro vale para todo o seu império. Não coleta outros recursos, não reza e não constrói.',
  },
```

EN: `merchant: { name: 'Merchant', plural: 'Merchants', desc: 'Works a rare resource on the map: while there, it earns gold and the rare bonus applies to your whole empire. It does not gather other resources, pray or build.' }`.
Sem `canBuild` (não constrói). `attack: 0` tem precedente (Pégaso). Arte e ícone: alias `villager`.

### Textos novos de interface (`src/i18n/strings.ts`, PT e EN, sem emoji)

| chave | PT | EN |
|---|---|---|
| res.stone | Pedra | Stone |
| res.oil | Petróleo | Oil |
| node.limestone … node.incense | (coluna PT da tabela de nós) | (coluna EN) |
| rare.olive … rare.incense | (coluna PT da tabela de raros) | (coluna EN) |
| rare.hint | Recurso raro: um Mercador nele rende {g} de ouro por segundo e o bônus vale para todo o império. | Rare resource: a Merchant here earns {g} gold per second and the bonus applies to your whole empire. |
| err.oilEra | O petróleo só pode ser coletado a partir da {age}. | Oil can only be gathered from the {age} on. |
| err.wellOnly | Só um Poço de Petróleo explora esta jazida. | Only an Oil Well can tap this field. |
| err.merchantOnly | Só um Mercador trabalha num recurso raro. | Only a Merchant can work a rare resource. |
| err.merchantRare | O Mercador só trabalha em recursos raros. | Merchants only work rare resources. |
| err.needsOilField | O Poço de Petróleo precisa encostar numa jazida de petróleo. | The Oil Well must touch an oil field. |
| sel.extract | Jazida | Field |
| top.rares | Raros: {n} | Rares: {n} |
| node.oilDrop | Entregue no Poço de Nafta ou na Refinaria (o Centro Cívico não recebe petróleo). | Deliver to a Naphtha Well or a Refinery (the Town Center does not take oil). |
| editor.resRare | Recursos raros (nós) | Rare resources (nodes) |

`{g}` de `rare.hint` recebe o número já formatado: `String(RARE_GOLD_RATE).replace('.', getLocale() === 'pt' ? ',' : '.')`
(`getLocale` de `src/i18n`), para sair "0,5" em PT e "0.5" em EN.

E no fim de `help.econ` (PT e EN), acrescente uma frase: PT `Pedra (afloramentos de calcário; Pedreira) serve para
muralhas, torres, Templo, Fortaleza, maravilhas e Eras; da Era IV em diante, o Petróleo vem das fontes de nafta (Poço de
Nafta) e, na Era VII, das jazidas (Poço de Petróleo). Mercadores nos recursos raros rendem ouro e bônus.` / EN `Stone
(limestone outcrops; Quarry) builds walls, towers, Temple, Fortress, wonders and Eras; from Era IV on, Oil comes from
naphtha seeps (Naphtha Well) and, in Era VII, from oil fields (Oil Well). Merchants on rare resources earn gold and
bonuses.`

### Ícones (`scripts/bake/hud/catalog.mjs`)

- `RESOURCE_ICONS`: `{ food, wood, stone: O('stone'), gold, oil: O('oil'), knowledge, favor }` (objetos novos, código no
  passo 21).
- `TECH_ICONS`: as 6 pesquisas da tabela acima.
- Ícones do editor para os nós (`NODE_ICONS` em `panel.ts`): limestone `res/stone`; naphtha e oil_field `res/oil`; olive
  `tech/irrigation`; vineyard `tech/bacchanal`; paros_marble `tech/masonry`; salt `tech/logistics`; wild_horses
  `tech/horse_breeding`; copper `tech/bronze_armor`; incense `tech/oracles` (todos já existem no atlas, menos os dois
  `res/` novos).

### Mapas fixos da campanha (`STONE_CLUSTERS`, conferidos)

Cada linha foi testada no script de verdade (com `tryNode`, RNG próprio, depois dos bosques): os 5 nós entram e os
avisos de `validateMap` ficam iguais aos de hoje.

| script | `STONE_CLUSTERS` (`type: 'limestone', n: 5, r: 1.4`) | base atendida |
|---|---|---|
| `scripts/maps/m4_caucaso.ts` | `{x:46,y:75}`, `{x:80,y:14}` | Vale da Cólquida (Argos), cidade do Culto |
| `scripts/maps/m5_itaca.ts` | `{x:20,y:12}`, `{x:108,y:7}` | Argos, Liga |
| `scripts/maps/m8_oceano.ts` | `{x:62,y:7}`, `{x:116,y:57}`, `{x:20,y:15}` | Argos, Liga, Micenas |
| `scripts/maps/m10_otris.ts` | `{x:24,y:111}`, `{x:120,y:111}`, `{x:63,y:32}` | Argos, Hades, Culto |
| `scripts/maps/m11_chamas.ts` | `{x:66,y:50}`, `{x:107,y:12}` | Argos, Culto |
| `scripts/maps/m12_titanomaquia.ts` | `{x:26,y:12}`, `{x:24,y:129}`, `{x:120,y:111}`, `{x:119,y:15}` | os 4 inícios |

### Pedra inicial das missões (`startingResources.stone`)

Regra: metade da madeira inicial, arredondada a 50; m1 e m6 têm valor próprio (Templo na m1; Estátua de Zeus na m6).

| missão | onde | madeira hoje | stone |
|---|---|---|---|
| Horda | `campaign.ts` (`HORDE.config`) | 500 | 250 |
| m1 | `campaign.ts` **e** `missions/m1_despertar.scenario.json` (gêmeo de paridade) | 300 | 150 |
| m2 | `campaign.ts` | 800 | 400 |
| m3 | `campaign.ts` | 1000 | 500 |
| m4 | `m4_caucaso.scenario.json` | 600 | 300 |
| m5 | `m5_itaca.scenario.json` | 800 | 400 |
| m6 | `m6_estatua.scenario.json` | 1000 | 600 |
| m7 | `m7_aquiles.scenario.json` | 800 | 400 |
| m8 | `m8_oceano.scenario.json` | 1500 | 750 |
| m9 | `m9_tenaro.scenario.json` | 500 | 250 |
| m10 | `m10_otris.scenario.json` | 2000 | 1000 |
| m11 | `m11_chamas.scenario.json` | 800 | 400 |
| m12 | `m12_titanomaquia.scenario.json` | 1500 | 750 |

### Proporção de cidadãos da IA (`manageEconomy` em `ai.ts`)

| Era (`player.age`) | food | wood | stone | gold | oil | favor |
|---|---|---|---|---|---|---|
| 0 | 0.40 | 0.34 | 0.10 | 0.16 | 0 | 0 |
| 1 | 0.34 | 0.24 | 0.10 | 0.26 | 0 | 0.06 |
| 2 | 0.30 | 0.20 | 0.10 | 0.30 | 0 | 0.10 |
| ≥ 3 (`OIL_FROM_AGE`) | 0.28 | 0.18 | 0.10 | 0.28 | 0.06 (0 em cenário) | 0.10 |

`need` (falta para a próxima Era): `stone = (next.cost.stone ?? 0) + 150`; `oil = age >= OIL_FROM_AGE && !state.scenario ? (next.cost.oil ?? 0) : 0`.

## Passo a passo

Em cada passo, importe os nomes novos que o código usar (`canWorkNode`, `OIL_FROM_AGE`, `RARE_SET`, `RARE_GOLD_RATE`,
`extractorNode`, `unitArtType`…): o `npm run -s typecheck` acusa o que faltar. Antes de tudo, rode e guarde a linha de
base (você vai comparar no fim):

```bash
mkdir -p /tmp/e2-base
npm run -s typecheck && npx vitest run 2>&1 | tail -5 > /tmp/e2-base/vitest.txt
npm run smoke 20 42 > /tmp/e2-base/smoke.txt
npm run balance 60 1,2,3 > /tmp/e2-base/balance.txt
for f in m4_caucaso m5_itaca m8_oceano m10_otris m11_chamas m12_titanomaquia; do npx tsx scripts/maps/$f.ts > /tmp/e2-base/$f.txt; done
```

### Fase A — núcleo dos recursos (commit "E2-A: pedra, petróleo e raros no núcleo")

- [ ] **1. Pré-voo.** Confira: `npx tsx -e "import {AGES} from './src/core/data'; console.log(AGES.length)"` imprime 8;
  `docs/eras/PROGRESSO.md` (se existir) marca a E1 como pronta; `git status` limpo. Leia o guia da E1 em
  `docs/eras/E1-*.md` para saber o que ela mudou em `ai.ts`, `ages.ts` e nos testes.
  *Conferir:* `AGES[3].name` é a Bizantina e `AGES[6].name` a Industrial.

- [ ] **2. Recursos e constantes.** Em `src/core/constants.ts`: `RESOURCES` na ordem nova; `RESOURCE_NAMES` e
  `RESOURCE_ICONS` com `stone`/`oil`; `OIL_FROM_AGE`, `RARE_GOLD_RATE`, `MERCHANT_MAX_AI`; `DEATHMATCH_RESOURCES =
  { food: 4000, wood: 4000, stone: 2000, gold: 3000, oil: 500, knowledge: 300, favor: 150 } as const`.
  Depois rode `npm run -s typecheck` e corrija **todo** literal `Record<ResourceType, …>` que ele acusar:
  - `src/core/sim/modifiers.ts` `defaultMods().gather`: `{ food: 1, wood: 1, stone: 1, gold: 1, oil: 1, knowledge: 1, favor: 1, hunt: 1, farm: 1 }`.
  - `src/core/sim/game.ts` `createGame`: recursos `{ food: 300, wood: 250, stone: 100, gold: 120, oil: 0, knowledge: 0, favor: 0 }`
    (esse literal tem `as Record<…>` e **o tsc não acusa**: mude à mão), `gathered` com as 7 chaves em 0, `prices` com
    as 7 chaves em `MARKET_BASE_PRICE`, todos **na ordem de `RESOURCES`**.
  - Testes com `resources = { food: …, wood: …, gold: …, favor: …, knowledge: … }` (o tsc acusa exatamente estes, conferido
    num protótipo em 06/10: `tests/m4_caucaso.test.ts` ~linha 126, `tests/m6_estatua.test.ts` ~linha 242,
    `tests/scenario-gaps.test.ts` ~linhas 434 e 495 — o `const rich`): acrescente `stone` e `oil` com o mesmo valor de
    `wood` daquele literal. O tsc também acusa `serialize.ts` (literal de `mods`: faça já a troca por `defaultMods()` do
    passo 3, senão este passo não fecha), `modifiers.ts`, `game.ts` (`gathered`, `prices`, `DEATHMATCH_RESOURCES[r]`) e,
    depois do passo 6, `NODE_NAMES` e `NODE_ICONS` (`panel.ts`).
  - `tests/hud-text.test.ts` (~linha 76): o jogador falso do teste de fim de partida tem
    `gathered: { food: 0, wood: 0, gold: 0 }`; acrescente `stone: 0, oil: 0` (o tsc não acusa: o objeto não é tipado; sem
    isso a tabela do passo 24 mostra `NaN` e o teste continua verde, escondendo o erro).
  *Conferir:* `npm run -s typecheck` sem erro.

- [ ] **3. Save, hash e relatório de dessincronia.**
  - `src/core/serialize.ts`, no `deserialize`, no `map` dos players: troque o literal de `mods` por
    `mods: mods.defaultMods()` (o módulo já está importado como `mods` no fim do arquivo) e acrescente padrões:
    ```ts
    const ZERO = Object.fromEntries(constants.RESOURCES.map((r) => [r, 0]));
    const BASE = Object.fromEntries(constants.RESOURCES.map((r) => [r, constants.MARKET_BASE_PRICE]));
    // dentro do map: { ...p, team: …, visibility: …, resources: { ...ZERO, ...p.resources },
    //   stats: { ...p.stats, gathered: { ...ZERO, ...p.stats.gathered } }, prices: { ...BASE, ...p.prices },
    //   rares: Array.isArray(p.rares) ? p.rares : [], mods: mods.defaultMods() }
    ```
    (o spread de `ZERO` primeiro põe as chaves na ordem de `RESOURCES`, a mesma do `createGame`).
  - `src/core/net/hash.ts`: no laço dos jogadores, depois de `mix(Math.floor(p.resources.favor * 10));`, acrescente
    `mix(Math.floor(p.resources.stone)); mix(Math.floor(p.resources.oil)); mix(p.rares.length);`.
  - `src/core/net/desync.ts`: some `stone` e `oil` à linha dos recursos e troque a lista literal dos preços por
    `RESOURCES`; em `pl`, `for (const r of p.rares) h = strHash(h, r);`.
  - `src/core/types.ts`: em `Player`, `rares: string[];   // E2: tipos de raro ocupados por um Mercador (bônus em recomputeMods)`;
    em `createGame`, `rares: []`.
  *Conferir:* `npx vitest run tests/sim.test.ts tests/determinism.test.ts` passa.

- [ ] **4. Cenários.** `src/core/scenario/schema.ts`: `StatName` e `STATS` com `'stone', 'oil'`; mensagem de
  `checkResources` com as 7 chaves. `compile.ts` `value()`: `case 'food': case 'wood': case 'stone': case 'gold': case 'oil': case 'favor': case 'knowledge': return p.resources[v.stat];`.
  `helpers.ts` `give(…, res: Partial<Record<ResourceType, number>>)` (importe `ResourceType`).
  *Conferir:* `npx vitest run tests/scenario-json.test.ts tests/scenario-gaps.test.ts`.

- [ ] **5. Fuzz.** `tests/command-fuzz.test.ts`: troque `'stone'` por `'marble'` nas duas listas de recurso inválido
  (`this.pick([...PROTO_KEYS, 'stone', 7])` e o teste do mercado). `'marble'` não é recurso nem nó.
  *Conferir:* `npx vitest run tests/command-fuzz.test.ts`.

- [ ] **6. Nós.** Em `constants.ts`, `NodeType` com os 10 tipos e as linhas de `GATHER_RATES`, `NODE_RESOURCE`,
  `NODE_NAMES`, `NODE_CAPACITY` (tabela de nós); os conjuntos `RARE_NODES`, `RARE_SET`, `WELL_NODES`, `NOT_GATHERED`.
  Em `mapgen.ts`, `NODE_AMOUNT` com os 10 (o tsc acusa os `Record<NodeType>` que faltarem, inclusive `NODE_ICONS` em
  `panel.ts`: preencha-o já com a lista de ícones de "Dados prontos").
  *Conferir:* typecheck sem erro.

- [ ] **7. Buscas e regra de quem trabalha cada nó** (`src/core/sim/queries.ts`; importe `NOT_GATHERED`, `RARE_SET`,
  `WELL_NODES`, `OIL_FROM_AGE` de constants, `AGES` de `../data`, `t` de `'../../i18n'` e o tipo `Player`).
  1. Renomeie o corpo atual de `nearestNode` para `nearestNodeBy(state, x, y, match: (n: ResourceNode) => boolean, maxR = 18, exclude = -1, pred?)`,
     trocando a linha `if (isResource ? NODE_RESOURCE[n.type] !== want : n.type !== want) continue;` por
     `if (!match(n)) continue;` (o resto — anéis, `nodeAccessTiles`, desempate por `centerDist2` e `frameCompare` — fica
     idêntico).
  2. Recrie `nearestNode` por cima dele (mesma assinatura de hoje):
     ```ts
     export function nearestNode(state: GameState, x: number, y: number, want: ResourceType | NodeType, maxR = 18, exclude = -1, pred?: (n: ResourceNode) => boolean): ResourceNode | null {
       const byType = (want as string) in NODE_RESOURCE;
       // busca por recurso nunca devolve raro nem jazida (ninguém os coleta: Mercador e Poço de Petróleo os acham pelo tipo)
       const match = byType ? (n: ResourceNode) => n.type === want : (n: ResourceNode) => NODE_RESOURCE[n.type] === want && !NOT_GATHERED.has(n.type);
       return nearestNodeBy(state, x, y, match, maxR, exclude, pred);
     }
     export function nearestRareNode(state: GameState, x: number, y: number, maxR = 40, pred?: (n: ResourceNode) => boolean): ResourceNode | null {
       return nearestNodeBy(state, x, y, (n) => RARE_SET.has(n.type), maxR, -1, pred);
     }
     ```
  3. Regra única de "quem pode trabalhar este nó" (usada pelo comando, pela ordem e pela interface):
     ```ts
     export function canWorkNode(player: Player, unitType: string, node: ResourceNode): { ok: boolean; reason?: string } {
       const merchant = UNITS[unitType]?.tags.includes('merchant') ?? false;
       if (WELL_NODES.has(node.type)) return { ok: false, reason: t('err.wellOnly') };
       if (RARE_SET.has(node.type)) return merchant ? { ok: true } : { ok: false, reason: t('err.merchantOnly') };
       if (merchant) return { ok: false, reason: t('err.merchantRare') };
       if (NODE_RESOURCE[node.type] === 'oil' && player.age < OIL_FROM_AGE) return { ok: false, reason: t('err.oilEra', { age: AGES[OIL_FROM_AGE].name }) };
       return { ok: true };
     }
     ```
  4. O nó que um extrator explora (desempate explícito: a escolha não depende da ordem da varredura):
     ```ts
     /** Nó `type` encostado no anel da pegada (8 vizinhos dos tiles da borda), com quantidade > 0: o de mais quantidade;
      *  empate pelo menor id (só muda qual nó seca primeiro, não o total extraído). */
     export function extractorNode(map: GameMap, tx: number, ty: number, w: number, h: number, type: NodeType): ResourceNode | null {
       let best: ResourceNode | null = null;
       for (let y = ty - 1; y <= ty + h; y++) for (let x = tx - 1; x <= tx + w; x++) {
         if (x >= tx && x < tx + w && y >= ty && y < ty + h) continue;
         if (!inBounds(map, x, y)) continue;
         const id = map.nodeAt[idx(map, x, y)];
         if (id === -1) continue;
         const n = map.nodes.get(id);
         if (!n || n.type !== type || n.amount <= 0) continue;
         if (!best || n.amount > best.amount || (n.amount === best.amount && n.id < best.id)) best = n;
       }
       return best;
     }
     ```
  *Conferir:* `npx vitest run tests/position-fairness.test.ts tests/economy-regressions.test.ts` passa igual a antes
  (a refatoração não pode mudar nenhuma escolha antiga).

- [ ] **8. Coleta com a regra nova.**
  - `src/core/sim/commands.ts`, `case 'gather'`: depois da conferência do alvo, troque o laço por:
    ```ts
    const node = state.map.nodes.get(cmd.targetId);
    let any = false, reason: string | undefined;
    for (const u of ownedUnits(state, cmd.player, cmd.ids)) {
      if (!UNITS[u.type].canGather) continue;
      const w = node ? canWorkNode(player, u.type, node) : UNITS[u.type].tags.includes('merchant') ? { ok: false, reason: t('err.merchantRare') } : { ok: true };
      if (!w.ok) { reason = w.reason; continue; }
      giveOrder(state, u, { type: 'gather', targetId: cmd.targetId }, cmd.queue); any = true;
    }
    return any || reason === undefined ? { ok: true } : { ok: false, reason };
    ```
    (`player` é o `const player = state.players[cmd.player]` do início de `applyCommand`.)
  - `case 'pray'`: só `canGather && !UNITS[u.type].tags.includes('merchant')`.
  - `src/core/sim/units.ts`, `startOrder`: em `case 'gather'`, no ramo da fazenda (`if (b && !b.dead && BUILDINGS[b.type].farm …)`)
    acrescente na primeira linha `if (def.tags.includes('merchant')) { finishOrder(state, u); return; }`; no ramo do nó,
    logo depois de `if (node) {`, `if (!canWorkNode(state.players[u.owner], u.type, node).ok) { finishOrder(state, u); return; }`.
    Em `case 'pray'`: `if (!def.canGather || def.tags.includes('merchant')) { finishOrder(state, u); return; }`.
  - `updateGather`, logo depois de `u.orderTick = state.tick;` (quando a unidade já está no nó) e **antes** de
    `let rate = …`:
    ```ts
    // Mercador num raro: fica parado ao lado, sem carga e sem gastar o nó; a renda e o bônus (um Mercador por nó) saem
    // de economySecond (passo 11)
    if (RARE_SET.has(node.type)) return;
    ```
  - `pickNewSource` (em `units.ts`), **primeira** linha do corpo:
    `if (UNITS[u.type].tags.includes('merchant')) return null;   // Mercador não troca de fonte (iria a um veio de ouro: raro conta como 'gold')`.
    Sem isso, um Mercador bloqueado no caminho cai em `findNewSource(state, u, 'gold')` e passa a minerar ouro
    (`updateGather` não consulta `canWorkNode`). Com o `null`, ele fica ocioso (`fallbackIdle`), como manda a regra.
  *Conferir:* `npx vitest run tests/economy-regressions.test.ts tests/sim.test.ts tests/command-fuzz.test.ts`.

- [ ] **9. Edifícios, unidade, atalhos.**
  - `types.ts` `BuildingDef`: `extract?: { node: NodeType; rate: number };   // E2: extrator passivo encostado no nó` e
    `hotkeyGroup?: string;   // E2: edifícios que dividem o atalho (apertar de novo alterna)`.
  - `buildings.ts`: 4 edifícios, custos da tabela, `town_center.dropoff`, `market.trains = ['merchant']`, `BUILD_MENU`.
  - `units.ts`: `merchant`.
  - `tests/data.test.ts`, regra do atalho repetido:
    ```ts
    for (const [hk, list] of hotkeys) if (list.length > 1) {
      const g = BUILDINGS[list[0]].hotkeyGroup;
      const ok = list.every((x) => x.startsWith('wonder_')) || (!!g && list.every((x) => BUILDINGS[x].hotkeyGroup === g));
      expect(ok, `atalho ${hk} duplicado: ${list}`).toBe(true);
    }
    ```
  - `src/ui/input.ts`, no ciclo do atalho de construção (`const cands = …`): filtre pela Era antes de alternar:
    `const age = s.state.players[s.local].age; const avail = cands.filter((c) => BUILDINGS[c].age <= age); const pool = avail.length ? avail : cands;`
    e use `pool` no lugar de `cands` na escolha do tipo.
  *Conferir:* `npx vitest run tests/data.test.ts`.

- [ ] **10. Poço de Petróleo: colocação e extração.**
  - `entities.ts` `canPlaceBuilding`, depois do laço da pegada e antes do `return { ok: true }`:
    `if (def.extract && !force && !extractorNode(map, tx, ty, def.w, def.h, def.extract.node)) return { ok: false, reason: t('err.needsOilField') };`
    (importe `extractorNode` de `./queries`).
  - `economy.ts` `economySecond`, dentro do laço dos edifícios (depois do `if (def.plenty) …`):
    ```ts
    if (def.extract) {
      const n = extractorNode(map, b.tx, b.ty, b.w, b.h, def.extract.node);
      if (n) {
        const take = Math.min(def.extract.rate * p.mods.gather[NODE_RESOURCE[n.type]], n.amount);
        n.amount -= take;
        p.resources[NODE_RESOURCE[n.type]] += take; p.stats.gathered[NODE_RESOURCE[n.type]] += take;
        if (n.amount <= 0.001) {
          removeNode(map, n.id);
          state.effects.push({ type: 'nodeGone', x: n.x + 0.5, y: n.y + 0.5, ttl: 6, total: 6, data: n.type });
        }
      }
    }
    ```
    (importe `removeNode` de `'../map/mapgen'`, `NODE_RESOURCE` de constants e `extractorNode` de `./queries`; o push
    tem de ser literal assim por causa de `tests/fx-registry.test.ts`.)
  - `hud.ts` `buildingCard`, junto dos outros `stats.push` (importe `extractorNode` de `'../core/sim/queries'`; o
    `hud.ts` já importa de lá):
    ```ts
    if (def.extract) { const n = extractorNode(s.state.map, b.tx, b.ty, b.w, b.h, def.extract.node); stats.push(`${t('sel.extract')} <b>${n ? Math.round(n.amount) : 0}</b>`); }
    ```
  *Conferir:* o teste novo `tests/resources-e2.test.ts` (passo 28) cobre; por ora `npm run -s typecheck`.

- [ ] **11. Raros e Mercador.**
  - `src/core/data/rares.ts` (código pronto acima) e `export * from './rares';` em `src/core/data/index.ts`.
  - `modifiers.ts` `recomputeMods`, logo depois da linha das techs: `for (const r of player.rares ?? []) { const d = RARES[r]; if (d) effects.push(...d.effects); }`.
  - `economy.ts` `economySecond`, depois do laço dos edifícios (antes de "Regeneração e atrito"):
    ```ts
    // Raros ocupados (E2): em cada raro, o Mercador de MENOR id em 'gather' nele e ao lado (distância à borda do tile ≤ 1)
    // rende RARE_GOLD_RATE de ouro por segundo ao dono e conta o tipo do raro para o bônus; outros no mesmo nó não rendem
    const holder = new Map<number, Unit>();
    for (const u of state.units.values()) {
      if (u.dead || u.state !== 'gather' || u.nodeId <= 0 || !UNITS[u.type].tags.includes('merchant')) continue;
      const n = map.nodes.get(u.nodeId);
      if (!n || !RARE_SET.has(n.type) || distToRect(u.x, u.y, n.x, n.y, 1, 1) > 1) continue;
      const h = holder.get(n.id);
      if (!h || u.id < h.id) holder.set(n.id, u);
    }
    const occ: string[][] = state.players.map(() => []);
    for (const [nodeId, u] of holder) {
      const n = map.nodes.get(nodeId)!, p = state.players[u.owner];
      const g = RARE_GOLD_RATE * p.mods.gather.gold;
      p.resources.gold += g; p.stats.gathered.gold += g;
      if (!occ[u.owner].includes(n.type)) occ[u.owner].push(n.type);
    }
    for (const p of state.players) {
      const next = occ[p.id].sort();
      if (next.join(',') === p.rares.join(',')) continue;
      p.rares = next; recomputeMods(state, p); refreshMaxHp(state, p);
    }
    ```
    (importe `recomputeMods`, `refreshMaxHp` de `./modifiers` — o arquivo já importa `getUnitStats`/`techCost` de lá —,
    `distToRect` de `'../map/grid'`, `RARE_SET` e `RARE_GOLD_RATE` de `'../constants'` e o tipo `Unit` de `'../types'`.
    Mantenha o texto `!UNITS[u.type].tags.includes('merchant')` assim: o guia da E4 o substitui literalmente.)
  *Conferir:* typecheck.

- [ ] **12. Pesquisas e custos de Era.** As 6 pesquisas, `masonry`, `fortified_towns` e a tabela de Era.
  *Conferir:* `npx vitest run tests/data.test.ts` (efeitos válidos, edifício existente, pré-requisitos).

- [ ] **13. Mercado.** `economy.ts` `marketTrade`: logo no começo, `if (resource === 'oil' && player.age < OIL_FROM_AGE) return false;`.
  `commands.ts` `case 'trade'`: antes do `marketTrade`,
  `if (cmd.resource === 'oil' && player.age < OIL_FROM_AGE) return { ok: false, reason: t('err.oilEra', { age: AGES[OIL_FROM_AGE].name }) };`.
  Os preços de pedra e petróleo voltam ao equilíbrio sozinhos (a lista negra de `economySecond` não os exclui).
  *Conferir:* `npx vitest run tests/command-fuzz.test.ts tests/movement-ai.test.ts`.

- [ ] **14. SIM_VERSION.** `constants.ts`: some 1 ao valor atual e acrescente ao comentário:
  `N = E2: pedra, petróleo e raros (recursos, nós, gerador, custos, IA)` (N = o valor novo).
  *Conferir:* `npx vitest run tests/relay-version.test.ts`. **Commit da fase A.**

### Fase B — mapas e editor (commit "E2-B: pedra, nafta, jazidas e raros nos mapas e no editor")

- [ ] **15. Tabela por início.** `src/core/map/fixed.ts`:
  ```ts
  export interface StartResources { food: number; wood: number; gold: number; stone: number; oil: number; rare: number; foodNodes: number; woodNodes: number; goldNodes: number; stoneNodes: number; oilNodes: number }
  ```
  Em `startResourceTable`, o zero de cada linha com todas as chaves e o mapeamento:
  ```ts
  if (RARE_SET.has(n.type)) { starts.forEach((s, i) => { const dx = n.x - s.x, dy = n.y - s.y; if (dx * dx + dy * dy <= r2) out[i].rare++; }); continue; }
  const kind = n.type === 'tree' ? 'wood' : n.type === 'gold' ? 'gold' : n.type === 'limestone' ? 'stone' : n.type === 'naphtha' || n.type === 'oil_field' ? 'oil' : FOOD_NODES.has(n.type) ? 'food' : null;
  ```
  (`rare` é contagem de nós, não quantidade; importe `RARE_SET` de `'../constants'`). `validateMap` não muda (`unknownNode` já aceita qualquer chave de
  `NODE_AMOUNT`).
  - `tests/editor.test.ts`, teste "tabela de recursos por início": os objetos esperados ganham
    `stone: 0, oil: 0, rare: 0, stoneNodes: 0, oilNodes: 0`.
  - `scripts/mapcheck.ts`: na linha de cada início acrescente `· pedra ${row.stone} (${row.stoneNodes}) · petróleo ${row.oil} (${row.oilNodes}) · raros ${row.rare}`.
  - `scripts/maps/lib.ts`: no `finish`, o laço de igualdade passa a `['food', 'wood', 'gold', 'stone', 'oil', 'rare'] as const`;
    no `writeMap`, imprima também pedra, petróleo e raros.
  *Conferir:* `npx vitest run tests/editor.test.ts tests/fixedmap.test.ts`.

- [ ] **16. Editor.** `src/editor/ops.ts`: `function isNodeType(t: string): t is NodeType { return Object.prototype.hasOwnProperty.call(NODE_AMOUNT, t); }`
  (acrescente `NODE_AMOUNT` ao `import { addNode, deriveDeepWater, … } from '../core/map/mapgen'` que já existe).
  **Faça este passo antes do 18 e do 19**: com o `isNodeType` de hoje (lista fixa de 6 tipos), `b.nodes('limestone', …)`
  dos scripts de mapa e o `addNode` do `tryNode` das missões são recusados **em silêncio** (o protótipo de 06/10 gerou o
  Estreito com 0 nós novos até este passo entrar).
  `src/editor/panel.ts` (importe `RARE_NODES`): `NODE_TYPES = ['tree', 'berry', 'deer', 'boar', 'gold', 'lure', 'limestone', 'naphtha', 'oil_field', ...RARE_NODES]`;
  `NODE_ICONS` da lista de "Dados prontos". Em `renderResources`:
  - `const kinds = ['food', 'wood', 'stone', 'gold', 'oil', 'rare'] as const;`
  - na `cell`, o `title` de `rare` é `t('editor.resNodes', { n: r.rare })` (não existe `rareNodes`); os outros seguem
    `r[`${k}Nodes`]` (o TS aceita com `k as Exclude<typeof k, 'rare'>`);
  - a linha de cabeçalho hoje tem 3 `<th>` escritos à mão (food, wood, gold): gere-a de `kinds`, com
    `title="${k === 'rare' ? t('editor.resRare') : t(`res.${k}`)}"` e o ícone `k === 'rare' ? iconHtml('tech/masonry', { cls: 'hic-res' }) : ic.res(k)`.
  Não crie atalho de teclado novo no editor. `scripts/playtest-editor.mjs`: a conferência `'paleta de nós'` passa de
  `=== 6` para `=== 16`.
  *Conferir:* `npx vitest run tests/editor.test.ts`.

- [ ] **17. Gerador aleatório.** Em `src/core/map/mapgen.ts`, importe `wouldSeal` (já importa `articulationPoints` e
  `invalidateComponents` de `./components`) e `RARE_NODES` de constants; acrescente a função abaixo e chame-a na
  **última** linha de `generateMap`, depois de `widenChokepoints(map);`: `placeEraResources(map, seed, clearCenter);`.
  O código é o do protótipo medido (não mude a ordem das chamadas ao `rng`, senão os números do teste mudam de novo):
  ```ts
  /**
   * E2: pedra, nafta, jazidas e raros, numa passada própria (RNG separado) DEPOIS de toda a geração antiga: nenhum nó
   * antigo muda de lugar. Mesma receita por início (como placeStartResources): calcário a ~8 e ~14, nafta a ~13, jazida a
   * ~17, um raro do tipo A a ~19 e um do tipo B a 60% do caminho até o centro; extras longe dos inícios. Um nó novo só
   * entra em terra livre sem obstáculo antigo nos 8 vizinhos, com ≥ 3 vizinhos livres e sem selar a passagem local; no
   * fim, os nós novos que criaram ponto de articulação saem (os antigos nunca).
   */
  export function placeEraResources(map: GameMap, seed: number, clearCenter: boolean): void {
    const rng = new RNG((seed ^ 0x2c1b3c6d) >>> 0);
    const oldBlocked = map.blocked.slice();
    const apBefore = articulationPoints(map);
    const near = (x: number, y: number, r: number) => map.starts.some((s) => dist(s.x, s.y, x, y) < r);
    const ok = (x: number, y: number): boolean => {
      if (x < 2 || y < 2 || x > map.w - 3 || y > map.h - 3) return false;
      const i = idx(map, x, y), t = map.terrain[i];
      if (t === TERRAIN.WATER || t === TERRAIN.DEEP || t === TERRAIN.MOUNTAIN || map.blocked[i] !== 0) return false;
      if (near(x, y, 4.5)) return false;
      if (clearCenter && dist(x, y, map.w / 2, map.h / 2) < 7) return false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBounds(map, x + dx, y + dy) && oldBlocked[idx(map, x + dx, y + dy)] !== 0) return false;
      let free = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inBounds(map, x + dx, y + dy) && map.blocked[idx(map, x + dx, y + dy)] === 0) free++;
      if (free < 3) return false;
      return !wouldSeal(map, x, y, 1, 1);
    };
    const added = new Set<number>();
    const cluster = (type: NodeType, cx: number, cy: number, radius: number, count: number): number => {
      let placed = 0, tries = 0;
      while (placed < count && tries++ < count * 12) {
        const x = Math.round(cx + rng.range(-radius, radius)), y = Math.round(cy + rng.range(-radius, radius));
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > radius * radius + 1) continue;
        if (!ok(x, y)) continue;
        const nd = addNode(map, type, x, y);
        if (nd) { placed++; added.add(nd.id); }
      }
      return placed;
    };
    const at = (s: { x: number; y: number }, a: number, r: number): [number, number] => { const k = ((a % 32) + 32) % 32; return [s.x + Math.round(CIRCLE32[k][0] * r), s.y + Math.round(CIRCLE32[k][1] * r)]; };
    // grupo num ângulo; se não couber, tenta os ângulos vizinhos e os raios r−2 e r+2 até completar
    const around = (s: { x: number; y: number }, type: NodeType, a: number, r: number, radius: number, count: number): number => {
      let placed = 0;
      for (const dr of [0, -2, 2]) for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) { if (placed >= count) break; placed += cluster(type, ...at(s, a + k, r + dr), radius, count - placed); }
      return placed;
    };
    const ra = rng.int(0, RARE_NODES.length - 1); let rb = rng.int(0, RARE_NODES.length - 2); if (rb >= ra) rb++;
    for (const s of map.starts) {
      const ang = rng.int(0, 31);
      around(s, 'limestone', ang, 8, 1.3, 5);
      around(s, 'limestone', ang + 16 + rng.int(-3, 3), 14, 1.5, 6);
      around(s, 'naphtha', ang + 8 + rng.int(-3, 3), 13, 1.2, 4);
      around(s, 'oil_field', ang + 24 + rng.int(-3, 3), 17, 1.0, 3);
      around(s, RARE_NODES[ra], ang + 4 + rng.int(-2, 2), 19, 2.5, 1);
      cluster(RARE_NODES[rb], Math.round(s.x + (map.w / 2 - s.x) * 0.6), Math.round(s.y + (map.h / 2 - s.y) * 0.6), 2.5, 1);
    }
    const extra = Math.round((map.w * map.h) / 2500);
    for (let k = 0; k < extra; k++) {
      const x = rng.int(4, map.w - 5), y = rng.int(4, map.h - 5);
      if (near(x, y, 18)) continue;
      const roll = rng.float();
      if (roll < 0.5) cluster('limestone', x, y, 1.4, 5);
      else if (roll < 0.8) cluster('naphtha', x, y, 1.2, 4);
      else cluster('oil_field', x, y, 1.0, 3);
    }
    for (let pass = 0; pass < 3; pass++) {
      const ap = articulationPoints(map);
      let removed = 0;
      for (let i = 0; i < ap.length; i++) {
        if (!ap[i] || apBefore[i]) continue;
        const x = i % map.w, y = (i - x) / map.w;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!inBounds(map, x + dx, y + dy)) continue;
          const id = map.nodeAt[idx(map, x + dx, y + dy)];
          if (id !== -1 && added.has(id)) { removeNode(map, id); added.delete(id); removed++; }
        }
      }
      if (removed === 0) break;
    }
  }
  ```
  Números medidos com este código (protótipo de 06/10): 1,5–25 ms por mapa; 5–15 calcários a até 20 tiles de cada
  início; nenhuma relíquia fixa da m9 (`[97,66]`, `[55,44]`, `[95,13]`) coberta.
  Conferido de novo na revisão (13 mapas: as 4 sementes do teste, as das missões m1/m2/m3/m6/m7/m9/Horda e 2 de 4
  jogadores): 0 nós antigos removidos ou movidos, 0 pontos de articulação novos; por início, calcário 5–14, nafta 0–4,
  jazida 1–5 e raros 0–2 a até 20 tiles — variação do mesmo tamanho da do ouro de hoje (1–12 veios por início), ou
  seja, "mesma justiça" do gerador antigo, não igualdade (só os mapas oficiais garantem igualdade).
  - `tests/fixedmap.test.ts`, teste "generateMap produz exatamente…": os 4 hashes e contagens mudam (a passada nova é
    intencional). Troque temporariamente os dois `expect` do laço por
    `console.log(w, h, seed, p, type, clear, hashGenerated(m), m.nodes.size)`, rode
    `npx vitest run tests/fixedmap.test.ts -t "generateMap produz"`, copie os números para `expected` e restaure os
    `expect`. Atualize o comentário do teste: "E2: + placeEraResources". Valores que o código acima deu no protótipo da
    revisão (com os `NODE_AMOUNT` da tabela de nós), para conferir que você copiou o algoritmo sem mudar nada:
    `[80, 80, 42, 2, 'continental', false, 3625703368, 995]`, `[112, 112, 7, 4, 'lakes', false, 3367152841, 1416]`,
    `[144, 144, 99, 3, 'mountains', false, 1777911223, 3369]`, `[80, 80, 5, 2, 'desert', true, 337209012, 285]`.
    Se os seus saírem diferentes, compare `placeEraResources` linha a linha com o bloco acima antes de seguir.
  *Conferir:* `npx vitest run tests/fixedmap.test.ts tests/missions.test.ts` (o lint das relíquias da m9 tem de continuar
  vazio).

- [ ] **18. Mapas oficiais.**
  - `scripts/maps/lib.ts` `placeStartLayout`: acrescente no fim `b.nodes('limestone', at([[10, 3], [10, 4]]));` (8 nós
    a ~10,5 tiles, nos dois lados do eixo leste-oeste; invariantes pelos espelhos locais) e cite-os no comentário.
  - `scripts/maps/estreito.ts`, logo depois de `placeStartLayout(b, sx, sy);` e **antes** do ouro de reserva:
    ```ts
    b.nodes('limestone', MapBuilder.rect(sx + 1, sy - 15, sx + 2, sy - 14));      // pedra de reserva (~14,5)
    b.nodes('naphtha', MapBuilder.rect(sx + 12, sy - 7, sx + 13, sy - 6));       // fontes de nafta (~14; Era IV)
    b.nodes('oil_field', [[sx - 6, sy - 16], [sx - 5, sy - 16], [sx - 6, sy - 17]]);   // jazida (~17; Era VII)
    b.nodes('olive', [[sx + 16, sy + 4]]);                                        // raro de cada lado (~16,5)
    b.nodes('copper', [xy(mid(79) - 7, 79)]);                                     // raro na margem do vau central
    ```
  - `scripts/maps/egeu.ts`, no mesmo lugar:
    ```ts
    b.nodes('limestone', MapBuilder.rect(sx + 10, sy + 11, sx + 11, sy + 12));   // pedra de reserva (~15)
    b.nodes('naphtha', MapBuilder.rect(sx + 14, sy + 2, sx + 15, sy + 3));       // fontes de nafta (~14,5; Era IV)
    b.nodes('oil_field', [[sx - 12, sy + 14], [sx - 11, sy + 14], [sx - 12, sy + 15]]);   // jazida (~18,5; Era VII)
    b.nodes('salt', [[sx + 18, sy + 8]]);                                        // raro de cada início (~19,7)
    b.nodes('paros_marble', [[53, 53]]);                                          // raros da ilha central (1 por quadrante)
    ```
    (Posições testadas com `finish()`: todos os nós entram, simetria e recursos iguais, nenhum aviso, rotas com o mesmo
    corte de hoje — Estreito central 6, noroeste 5, sudeste 5; Egeu 12/12/12 e 6/5/6.)
  - Regere: `npx tsx scripts/maps/estreito.ts` e `npx tsx scripts/maps/egeu.ts` (gravam `src/core/data/maps/*.map.json`).
    Resultado conferido na revisão (06/10), linha do `writeMap`: Estreito **660 nós**, "pedra 7200 · petróleo 6000 ·
    raros 0", 0 avisos; Egeu **1280 nós**, "pedra 6600 · petróleo 6000 · raros 0", 0 avisos. No Egeu entram 84 nós novos
    e saem **68 árvores** (os bosques são desenhados depois e evitam os nós novos; a madeira por início continua 13 800),
    por isso o total sobe só 16 — é esperado. "Raros 0" também é esperado (os raros ficam além do raio 16). Se a linha
    mostrar "pedra 0", o passo 16 (`isNodeType`) não foi feito.
  - `tests/data.test.ts`, "mapas oficiais: sem avisos…": acrescente `expect(res[0].stone, key).toBeGreaterThan(3000); expect(res[0].oil, key).toBeGreaterThan(5000);`
    (medido: Estreito 7200/6000, Egeu 6600/6000).
  - `tests/position-fairness.test.ts`, sondagem (o laço `for (const want of ['food', 'wood', 'gold'] as const)` da
    função `probe`, ~linha 348; **não** mexa no laço igual do teste "inícios na diagonal", ~linha 411):
    `for (const want of ['food', 'wood', 'gold', 'stone'] as const)`; os `ok` esperados sobem **+3 no Egeu e +1 no
    Estreito** em relação ao número que a E1 deixou (conferido na revisão com os mapas regerados: 30→33 e 10→11 sem a
    E1; com a E1, 33→36 e 11→12); `EXTRA_TYPES` ganha `['quarry', 2, 14]`.
  *Conferir:* `npx vitest run tests/data.test.ts tests/position-fairness.test.ts`; `npm run map:check` sem erro nem
  aviso nos dois embutidos e com pedra/petróleo iguais por início.

- [ ] **19. Mapas fixos da campanha.** Em cada um dos 6 scripts da tabela "Mapas fixos da campanha":
  - logo depois de `const CLUSTERS: Cluster[] = [ … ];`, a constante
    `const STONE_CLUSTERS: Cluster[] = [ { type: 'limestone', x: 46, y: 75, n: 5, r: 1.4 }, … ];` (coordenadas da tabela);
  - dentro da função de build, **imediatamente antes** da linha
    `STARTS.forEach(([x, y], index) => applyEditOp(state, { kind: 'setStart', index, x, y }));` (logo acima do comentário
    `// 5) inícios …`). Atenção à m10: lá as entidades (`// 4) entidades`) vêm **depois** dos bosques; a pedra entra depois
    delas também, colada no `STARTS.forEach` — foi assim que a revisão conferiu os 6 scripts (todos os 5 nós de cada grupo
    entram: m4 10, m5 10, m8 15, m10 15, m11 10, m12 20 nós novos; avisos idênticos aos de hoje):
    ```ts
    // 4b) E2 (docs/eras/E2-recursos.md): pedra depois de todos os outros nós, com RNG próprio — os nós antigos não mudam
    const rngStone = new RNG(SEED ^ 0x570e);
    for (const c of STONE_CLUSTERS) {
      let placed = 0;
      for (let tries = 0; tries < c.n * 30 && placed < c.n; tries++) {
        const x = Math.round(c.x + (rngStone.float() * 2 - 1) * c.r), y = Math.round(c.y + (rngStone.float() * 2 - 1) * c.r);
        if (tryNode(c.type, x, y, c.amount)) placed++;
      }
    }
    ```
  - grave cada um: `npx tsx scripts/maps/m4_caucaso.ts --write` (e m5_itaca, m8_oceano, m10_otris, m11_chamas,
    m12_titanomaquia). Sem `--write`, o script só confere. Antes do `--write`, rode sem ele e compare a lista de avisos
    com a de hoje (guardada na linha de base: `/tmp/e2-base/<id>.txt`); a contagem de nós
    sobe exatamente 5 × (nº de grupos) e os avisos não mudam (m4: 4, m5: 4, m8: 3, m10: 5, m11: 3, m12: 2). Os testes
    `tests/m*_*.test.ts` comparam o mapa gerado com o `map.data` do cenário: só passam depois do `--write`.
  - `startingResources.stone` de todas as missões (tabela). Na m1, mude o TS (`campaign.ts`) **e** o gêmeo
    `m1_despertar.scenario.json` igual.
  - Testes que conferem recursos iniciais com `toMatchObject`/`toEqual` (`tests/m10_otris.test.ts`,
    `tests/m11_chamas.test.ts`, `tests/m12_titanomaquia.test.ts`): `toMatchObject` continua valendo; o `toEqual` da m11
    (lista de 5 números) fica igual (não lê pedra).
  *Conferir:* `npx vitest run tests/m4_caucaso.test.ts tests/m5_itaca.test.ts tests/m8_oceano.test.ts tests/m10_otris.test.ts tests/m11_chamas.test.ts tests/m12_titanomaquia.test.ts tests/scenario-json.test.ts`.
  **Commit da fase B.**

### Fase C — IA (commit "E2-C: a IA coleta pedra e petróleo e usa Mercadores")

- [ ] **20. Economia da IA** (`src/core/sim/ai.ts`; importe `OIL_FROM_AGE`, `MERCHANT_MAX_AI` de constants e
  `nearestNodeBy`, `nearestRareNode` de `./queries`).
  1. Uma lista no topo: `const AI_RES = ['food', 'wood', 'stone', 'gold', 'oil', 'favor'] as const;` e troque **todos**
     os laços literais `['food', 'wood', 'gold', 'favor']` de `manageEconomy` por `AI_RES` (são 4 hoje: soma das
     proporções, `want`, rebalanceamento, escolha do recurso do ocioso). O tsc **não** acusa esses laços.
  2. `snapshot`: `gatherers = { food: 0, wood: 0, stone: 0, gold: 0, oil: 0, favor: 0 }`; acrescente ao `Snapshot`
     `merchants: Unit[]` = `units.filter((u) => u.type === 'merchant' && u.inside === -1)`.
  3. Proporções e `need` da tabela de "Dados prontos". Se a E1 já trocou o `if/else` por uma tabela por Era, ponha lá as
     colunas `stone`/`oil` com os mesmos valores. O `oil` é 0 também quando `state.scenario` existe.
  4. `neededDropoffs`: `dropType` ganha `stone: 'quarry', oil: 'naphtha_well'`; o laço passa a
     `['food', 'wood', 'stone', 'gold', 'oil']`.
  5. `budgetOf`: a E1 (passo D5 do guia dela) já o deixou genérico (`for (const r of RESOURCES)` e
     `fundMet = done || RESOURCES.every((r) => surplus[r] >= 0)`), então pedra e petróleo entram sozinhos. Se ainda
     houver lista literal ali, troque por `RESOURCES` como descrito.
  6. `manageTrade`: mantenha `['food', 'wood']` para "escasso", "abundante" e venda; só o último laço ("Recurso que
     trava a Idade com ouro sobrando: compra") usa
     `(['food', 'wood', 'stone', ...(player.age >= OIL_FROM_AGE ? ['oil'] : [])] as ResourceType[])` (o cast é
     necessário: sem ele o array vira `string[]` e `player.prices[k]` não compila).
     (Comprar petróleo "escasso" toda hora queimaria o ouro.)
  7. `RESEARCH_PRIORITY`: `'stone_wedges'` logo depois de `'picks1'`, `'stone_saws'` depois de `'picks2'`,
     `'stone_cranes'` depois de `'picks3'`, `'bitumen_jars'` depois de `'commerce4'`, e `'distillation', 'cracking'` no
     fim. (Se a E1 gerou a lista a partir dos dados, ponha estes 6 ids no grupo de economia dela.) **Atenção:**
     `manageResearch` monta `[...RESEARCH_PRIORITY.slice(0, 12), ...godTechs, ...RESEARCH_PRIORITY.slice(12)]`; como
     `stone_wedges` entra antes da posição 12, troque o `12` (as duas vezes) por `13`, para os mesmos 12 ids de hoje
     continuarem antes das pesquisas de deus.
  8. `assignGatherer`, logo depois de `const drop = nearestDropoffFor(state, player, res, anchor.x, anchor.y);`:
     `if (res === 'oil' && !drop) return false;` (decisão 12: nada de cidadão na nafta sem Poço de Nafta/Refinaria
     pronto; o `return false` faz o laço do ocioso cair na comida/madeira, como já faz hoje).
  9. `nearestUnclaimedNode` (usado na expansão com `'gold'`): troque `if (NODE_RESOURCE[n.type] !== res) continue;` por
     `if (NODE_RESOURCE[n.type] !== res || NOT_GATHERED.has(n.type)) continue;` (importe `NOT_GATHERED`). Sem isso a IA
     funda a 2ª cidade ao lado de um olival (raro conta como `'gold'` em `NODE_RESOURCE`). É a única outra varredura de
     nós por recurso fora de `queries.ts` (conferido com `grep -n "NODE_RESOURCE" src/core/sim/ai.ts`: as outras leem o nó
     de um cidadão, que nunca é raro).
  10. `sealsNode` (usado por `findBuildSpot`): no laço, depois do `if (inside(nx, ny) || … === -1) continue;`, pule a
     jazida: `if (WELL_NODES.has(map.nodes.get(map.nodeAt[idx(map, nx, ny)])?.type ?? '')) continue;` (importe
     `WELL_NODES`). A jazida não precisa de tile livre (ninguém a coleta a pé); sem isso o Poço de Petróleo encostado
     num grupo de 3 jazidas é recusado sempre que tapa o último vizinho livre de uma delas.
  11. `scripts/loadtest.ts` (bots do teste de carga, não a IA): o tipo de `deficit` passa a
     `'food' | 'wood' | 'stone' | 'gold'`; `saving` e `lacking` usam `(['food', 'stone', 'gold'] as const)`; a escolha
     aleatória vira `r < 0.35 ? 'food' : r < 0.6 ? 'wood' : r < 0.75 ? 'stone' : 'gold'`. Sem isso os bots param na
     Era II por falta de pedra e o `npm run loadtest` mede uma partida que não acontece mais.
  *Conferir:* `npx vitest run tests/movement-ai.test.ts tests/scenario-gaps.test.ts`; `npm run smoke 12 42`: na linha
  final `coletado: {…}` de cada IA, `"stone"` > 0. (Não use o `s=` do resumo por minuto: ele é o estoque, e os 100 de
  pedra iniciais já o deixam > 0 sem nenhuma coleta.)

- [ ] **21. Construção da IA.** Em `manageBuilding`:
  - condições: torre `player.resources.stone > 150` (no lugar de `wood > 250`); Fortaleza
    `player.resources.wood > 300 && player.resources.stone > 400` (no lugar de `wood > 500`); maravilha acrescenta
    `&& player.resources.stone > 700`;
  - lista `essential` com `'quarry', 'naphtha_well', 'oil_well', 'refinery'`;
  - o **primeiro** Poço de Nafta (decisão 12: o `neededDropoffs` só pede ponto de entrega quando já há ≥ 3 cidadãos na
    fonte, e o passo 20.8 não deixa ninguém ir à nafta sem poço — sem esta entrada a IA nunca começaria), junto das
    entradas abaixo e antes do laço `for (const p of plan)`:
    ```ts
    if (!state.scenario && age >= BUILDINGS.naphtha_well.age && has('naphtha_well') === 0) {
      const seep = nearestNodeBy(state, tc.x, tc.y, (n) => n.type === 'naphtha' && state.territory[idx(state.map, n.x, n.y)] === player.id, 40);
      if (seep) plan.splice(1, 0, { type: 'naphtha_well', anchorX: seep.x + 0.5, anchorY: seep.y + 0.5, minR: 1, maxR: 5, cond: true });
    }
    ```
    (sem fonte no território, nada: a IA segue sem petróleo até as fronteiras crescerem, como com um veio de ouro longe);
  - Poço de Petróleo e Refinaria (fora de cenário), antes do laço `for (const p of plan)`:
    ```ts
    if (!state.scenario && age >= BUILDINGS.oil_well.age && has('oil_well') < 6) {
      const field = nearestNodeBy(state, tc.x, tc.y, (n) => n.type === 'oil_field' && state.territory[idx(state.map, n.x, n.y)] === player.id && !wellTouching(state, n), 40);
      if (field) plan.splice(1, 0, { type: 'oil_well', anchorX: field.x + 0.5, anchorY: field.y + 0.5, minR: 0, maxR: 3, cond: true });
    }
    if (!state.scenario && age >= BUILDINGS.refinery.age) plan.push({ type: 'refinery', anchorX: tc.x, anchorY: tc.y, minR: 4, maxR: 14, cond: has('refinery') === 0 && has('oil_well') >= 1 });
    ```
    e a função auxiliar:
    ```ts
    /** Já há um Poço de Petróleo encostado neste nó? */
    function wellTouching(state: GameState, n: ResourceNode): boolean {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = n.x + dx, y = n.y + dy;
        if (!inBounds(state.map, x, y)) continue;
        const b = state.buildings.get(state.map.buildingAt[idx(state.map, x, y)]);
        if (b && !b.dead && b.type === 'oil_well') return true;
      }
      return false;
    }
    ```
    (`findBuildSpot` já usa a ordem invariante; `canPlaceBuilding` recusa o que não encosta na jazida.)
  *Conferir:* `npx vitest run tests/position-fairness.test.ts`.

- [ ] **22. Mercadores da IA.** Função nova, chamada em `aiThink` logo depois de `manageEconomy(state, player, snap);`:
  ```ts
  /** E2: Mercadores nos raros livres e alcançáveis (até MERCHANT_MAX_AI), treinados no Mercado. Fora de cenário. */
  function manageMerchants(state: GameState, player: Player, snap: Snapshot): void {
    if (state.scenario || !snap.tc) return;
    for (const m of snap.merchants) {
      if (m.state !== 'idle' || m.order) continue;
      const mx = Math.floor(m.x), my = Math.floor(m.y);
      const node = nearestRareNode(state, m.x, m.y, 40, (n) => nodeHasRoom(state, n) && rectReachable(state.map, mx, my, n.x, n.y, 1, 1, true));
      if (node) { applyCommand(state, { type: 'gather', player: player.id, ids: [m.id], targetId: node.id }); break; }   // um por pensamento: a vaga só é recontada no próximo tick
    }
    const queued = snap.buildings.reduce((n, b) => n + b.queue.filter((q) => q.kind === 'unit' && q.id === 'merchant').length, 0);
    if (snap.merchants.length + queued >= MERCHANT_MAX_AI) return;
    const market = (snap.byType.get('market') ?? []).find((b) => b.complete && b.queue.length === 0);
    if (!market || !nearestRareNode(state, snap.tc.x, snap.tc.y, 40, (n) => nodeHasRoom(state, n))) return;
    if (player.resources.gold < budgetOf(state, player).reserveGold + 150) return;
    if (canTrain(state, player, market, 'merchant').ok) applyCommand(state, { type: 'train', player: player.id, buildingId: market.id, unit: 'merchant' });
  }
  ```
  *Conferir:* `npm run smoke 20 42` duas vezes: o hash final é o mesmo nas duas. **Commit da fase C.**

### Fase D — interface, textos e arte provisória (commit "E2-D: barra de 7 recursos, textos, ícones e arte provisória")

- [ ] **23. Textos.** `strings.ts` (PT e EN, mesmas `{variáveis}`): tabela "Textos novos de interface" + `help.econ`.
  `en-data.ts`: `EN_BUILDINGS` dos 4 edifícios, `EN_UNITS.merchant`, `EN_TECHS` das 6 pesquisas.
  *Conferir:* `npx vitest run tests/i18n.test.ts`.

- [ ] **24. HUD.** `src/ui/hud.ts`:
  - `refreshTop`, depois do laço dos recursos:
    `this.resEls.oil.classList.toggle('hidden', p.age < OIL_FROM_AGE && p.resources.oil < 1);` (esconder com a classe,
    nunca remover o elemento: `redrawIcons` indexa `resEls[r]`).
  - a linha do `modeEl`: acrescente `+ (p.rares.length ? ' ' + t('top.rares', { n: p.rares.length }) : '')` ao texto e
    junte à dica o texto abaixo (separe da dica das relíquias com `<br>` quando as duas existirem):
    ```ts
    const raresTip = p.rares.map((r) => `${t(`node.${r}`)}: ${t(`rare.${r}`)}`).join('<br>');
    ```
  - Mercado: troque `for (const r of ['food', 'wood'] as ResourceType[])` por
    `for (const r of ['food', 'wood', 'stone', ...(p.age >= OIL_FROM_AGE ? ['oil'] : [])] as ResourceType[])`.
  - Fim de partida (`showGameOver`): o total coletado soma também `gathered.stone + gathered.oil`.
  - `src/ui/input.ts`, dica do nó (o `showTooltip` com `node.remaining`, ~linha 137): para raro, a descrição é
    `t(`rare.${n.type}`) + '<br>' + t('rare.hint', { g: <número formatado, ver a tabela de textos> })` (sem
    `node.remaining`: o raro não se esgota); para jazida, `t('err.wellOnly')` + a linha `node.remaining`; para nafta antes
    da IV, `t('err.oilEra', { age: AGES[OIL_FROM_AGE].name })` + `node.remaining`; para nafta da IV em diante,
    `node.remaining` + `<br>` + `t('node.oilDrop')` (decisão 12).
    No clique direito sobre nó (~linha 201, `const gatherers = units.filter((u) => UNITS[u.type].canGather)`), filtre
    também por `canWorkNode(s.player, u.type, node)` (importe de `'../core/sim/queries'`, que o `input.ts` já importa);
    se sobrar nenhum, mostre `this.hud.toast(motivo, 'warn')` com o `reason` do primeiro recusado e mande `move` no
    lugar de `gather`.
  - Nenhum emoji em código de `hud.ts`/`input.ts` (`tests/hud-icons.test.ts` varre `hud.ts`).
  *Conferir:* `npx vitest run tests/hud-icons.test.ts tests/hud-text.test.ts`.

- [ ] **25. Arte provisória dos tipos novos (alias).** Crie `src/render/art/alias.ts`:
  ```ts
  // Arte provisória dos tipos novos (docs/eras/E2-recursos.md): um tipo sem manifesto próprio usa a arte assada e o ícone
  // de um tipo existente — edifício com a MESMA pegada, unidade da mesma classe — até a E8 trazer a arte dele. Quem
  // resolve: ArtLibrary (unitId, prewarmUnits, buildingArt, building, icon) e src/ui/icons.ts (ic.unit, ic.bld). Quando o
  // tipo ganhar manifesto próprio, ele SAI daqui (os testes de arte passam a exigir o assado dele).
  export const UNIT_ART_ALIAS: Readonly<Record<string, string>> = { merchant: 'villager' };
  export const BUILDING_ART_ALIAS: Readonly<Record<string, string>> = { quarry: 'mine', naphtha_well: 'granary', oil_well: 'lumber_camp', refinery: 'market' };
  const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  export const unitArtType = (type: string): string => (own(UNIT_ART_ALIAS, type) ? UNIT_ART_ALIAS[type] : type);
  export const buildingArtType = (type: string): string => (own(BUILDING_ART_ALIAS, type) ? BUILDING_ART_ALIAS[type] : type);
  ```
  - `ArtLibrary.ts`: em `unitId`, `const t = unitArtType(type); return this.enabled ? unitArtId(t, this.atlas.manifest?.assets[t], heads) : type;`;
    em `prewarmUnits`, `for (const raw of types) { const id = unitArtType(raw); … }`; primeira linha de `buildingArt`,
    `building` e `icon`: `id = buildingArtType(id);`.
  - `src/ui/icons.ts`: `ic.unit` usa `` `unit/${unitArtType(type)}` `` e `ic.bld` usa `` `bld/${buildingArtType(type)}` ``
    (o `label` continua com o nome do tipo de verdade).
  - Testes: `tests/art-etapa6.test.ts` — `const types = Object.keys(UNITS).filter((t) => !(t in UNIT_ART_ALIAS));` antes
    do `toHaveLength(35)`; `tests/art-library.test.ts` — `const lot = Object.keys(BUILDINGS).filter((id) => !(id in BUILDING_ART_ALIAS));`
    antes do `toHaveLength(21)`; `tests/art-manifest.test.ts` "todo tipo de BUILDINGS tem manifesto…" — procure o
    manifesto por `buildingArtType(b.id)` (isso confere que a pegada do alias é a mesma); `tests/hud-icons.test.ts` —
    as duas conferências passam a ser
    ```ts
    if (!names.has(`unit/${unitArtType(id)}`)) missing.push(`unit/${id}`);
    if (!b.notBuildable && !names.has(`bld/${buildingArtType(id)}`)) missing.push(`bld/${id}`);
    ```
  *Conferir:* `npx vitest run tests/art-etapa6.test.ts tests/art-library.test.ts tests/art-manifest.test.ts tests/hud-icons.test.ts`
  (o de ícones ainda falha em `res/stone`/`res/oil` até o passo 27).

- [ ] **26. Nós no renderizador (procedural).**
  - `src/render/textures.ts`: `NODE_TYPES` (linhas do atlas) ganha os 10 tipos **no fim**, nesta ordem:
    `'limestone', 'naphtha', 'oil_field', 'olive', 'vineyard', 'paros_marble', 'salt', 'wild_horses', 'copper', 'incense'`.
    Sem isso o nó novo sai desenhado como árvore (linha 0). Em `drawNode`:
    ```ts
    case 'limestone': {
      g.poly([-12, 7, -9, -4, -2, -8, 5, -6, 12, 7]).fill(0xd8d2c2).poly([-2, -8, 5, -6, 3, 7, -6, 7]).fill(0xb9b2a0);
      g.poly([5, -6, 12, 7, 3, 7]).fill(0xa49c8a); g.rect(-10, 3, 6, 3).fill(0xece6d6);   // bloco já cortado
      break;
    }
    case 'naphtha': {
      g.ellipse(0, 3, 11, 5).fill(0x1a1612); g.ellipse(-2, 2, 6, 2.5).fill({ color: 0x4a3f6a, alpha: 0.5 });
      g.poly([-11, 4, -8, -2, -4, 1]).fill(0x8a7a5c).poly([8, 5, 10, -1, 12, 4]).fill(0x8a7a5c);
      break;
    }
    case 'oil_field': {
      g.ellipse(0, 4, 12, 5).fill(0x2a2018); g.ellipse(0, 3, 7, 3).fill(0x0c0a08); g.circle(-3, 1, 1.5).fill({ color: 0x6a5a8a, alpha: 0.6 });
      break;
    }
    default: {
      const c = RARE_COLORS[type];
      if (c !== undefined) { g.ellipse(0, 4, 11, 5).fill({ color: 0x3a3226, alpha: 0.35 }); g.circle(0, -2, 7).fill(c); g.circle(0, -2, 9).stroke({ width: 1.5, color: GOLD }); }
    }
    ```
    com `const RARE_COLORS: Record<string, number> = { olive: 0x7a8a5a, vineyard: 0x5a2a6a, paros_marble: 0xf2efe6, salt: 0xf6f6f2, wild_horses: 0x8a6238, copper: 0xb87333, incense: 0xc9b27a };`.
  - `src/render/shadows.ts` `nodeShadow`: `case 'limestone': case 'naphtha': case 'oil_field':` com a sombra do `gold`.
  - `src/render/minimap.ts`: calcário `0xc8c4b8`, nafta/jazida `0x1e1a16`, raros (`RARE_SET`) `0xa060c0`.
  - `src/render/fx/rules.ts` `workOf`: `WorkKind` ganha `'stone'`; `limestone` → `'stone'`; `naphtha`, `oil_field` e raros
    → `return null` (sem efeito de trabalho). `src/render/fx/unitFx.ts`: `case 'stone':` = o `case 'gold':` sem a linha
    dos `bodyMotes` dourados. `src/render/fx/handlers/nodeGone.ts`: `case 'limestone':` como o `'gold'` sem `motes`, e
    no topo da função, na linha dos decalques (`else if (e.data === 'gold') fx.decal('decal/debris', …)`), troque a
    condição por `e.data === 'gold' || e.data === 'limestone'` (o calcário esgotado deixa o mesmo entulho).
    `src/audio/events.ts`: `workRecipe` com `limestone` → `pick` (período 1,15); `nodeGone` de `limestone` →
    `rockCrumble`.
  - O renderizador nunca altera o estado; nada aqui entra em `src/core`.
  *Conferir:* `npx vitest run tests/art-library.test.ts tests/fx-registry.test.ts tests/fx-logic.test.ts tests/audio.test.ts`.

- [ ] **27. Ícones do HUD.** `scripts/bake/hud/catalog.mjs`: `RESOURCE_ICONS` na ordem de `RESOURCES` com
  `stone: O('stone')` e `oil: O('oil')`; `TECH_ICONS` das 6 pesquisas. `scripts/bake/page/hud-objects.js`, no bloco
  "recursos", depois de `OBJ.favor`:
  ```js
  OBJ.stone = (THREE, M, T) => {
    // blocos brutos de calcário recém-cortados, empilhados, e lascas no chão
    const b = (x, y, z, w, h, d, ry, mat) => T.add(T.box(w, h, d), mat, x, y, z, 0, ry, 0);
    b(-0.18, 0.11, 0.02, 0.36, 0.22, 0.3, 0.12, M.limestone);
    b(0.2, 0.1, -0.04, 0.32, 0.2, 0.28, -0.2, M.stone);
    b(0.02, 0.31, -0.01, 0.34, 0.2, 0.26, 0.35, M.limestone);
    for (let i = 0; i < 5; i++) { const r = T.add(new THREE.DodecahedronGeometry(0.035 + 0.02 * hash(i + 40), 0), M.stoneDark, -0.3 + 0.15 * i, 0.03, 0.24 + 0.04 * hash(i + 50)); r.rotation.set(hash(i) * 3, hash(i + 7) * 3, 0); }
  };
  OBJ.oil = (THREE, M, T) => {
    const x = X(THREE, M);
    // ânfora de nafta selada, com betume escorrendo do gargalo até uma poça preta
    amphoraShape(T, M.terracotta, T.root, { h: 0.82, r: 0.22 });
    T.add(T.cyl(0.075, 0.075, 0.04, 20), x.wax, 0, 0.82, 0);
    T.add(T.tube([[0.06, 0.8, 0.05], [0.1, 0.6, 0.18], [0.12, 0.3, 0.2], [0.16, 0.04, 0.22]], 0.02, 20, 8), x.wax, 0, 0, 0);
    T.add(T.cyl(0.16, 0.16, 0.008, 28), x.wax, 0.2, 0.004, 0.24);
  };
  ```
  Rode `npm run art:hud -- --contact docs/art` (Chromium do Playwright; refaz o atlas inteiro porque o hash mudou) e olhe
  `docs/art/etapa7-icones-contato.png` com a ferramenta Read: `res/stone` e `res/oil` legíveis a 34 px. Depois
  `npm run art:check` sem erro.
  *Conferir:* `npx vitest run tests/hud-icons.test.ts`. **Commit da fase D.**

### Fase E — testes novos, calibração e documentação (commit "E2-E: testes, calibração e docs")

- [ ] **28. Teste novo** `tests/resources-e2.test.ts` (modelo: `tests/economy-regressions.test.ts`; partidas com
  `quickGame`/`run` de `tests/helpers.ts` — que chamam `createGame` e `tick` —, posições por `placeBuilding(..., true)`
  e `addNode`; `economySecond` direto para os casos "por segundo"). Casos (ver tabela de testes; os números 10–12
  cobrem as regras desta revisão: um Mercador por nó, Mercador não minera, IA sem cidadão na nafta sem poço).
- [ ] **29. Verificação completa** (seção "Verificação") e calibração da campanha (passo 30).
- [ ] **30. Campanha.** Antes de rodar, atualize o harness (`src/core/scenario/testing.ts`), que hoje confere custos
  só em madeira/ouro e guarda cofres sem pedra — com os custos novos esses comandos de construção falham em silêncio
  (o passo dispara, o `applyCommand` recusa por falta de pedra e o roteiro segue sem a torre/muralha/Maravilha):
  - conferências `p.resources.wood < … || p.resources.gold < …` antes de construir torre/muralha/edifício: m4 (torres
    das gargantas, `wood < 130 || gold < 70`, ~linha 582), m6 (torres em volta da Estátua, ~739), m5 (torres do Heraion,
    `m5HeraionTower`, ~930), m7 (`m7Build`, genérico, ~1097) e m8 (torres, ~1176): acrescente
    `|| p.resources.stone < (cost.stone ?? 0) + <a mesma folga da madeira>` (na m4, que não lê `cost`, use
    `|| p.resources.stone < 130`). As que já usam `canAfford(p, getBuildingStats(…).cost)` (Maravilha da m6, mercados,
    Fortaleza e Portal da m8) não mudam.
  - cofres (`reserve`) e `m8ArmyReserve` que guardam o custo de um edifício: some a pedra do custo novo — m6
    (`reserve` da Estátua, hoje `{ wood: 800, gold: 800, food: 600, favor: 100 }` → os números da tabela de custos:
    `{ wood: 600, stone: 600, gold: 600, food: 600, favor: 100 }`), m8 variante "titãs" (cofre da Fortaleza
    `{ wood: 400, gold: 300 }` → `{ wood: 250, stone: 350, gold: 250 }`; cofre do Portal
    `{ food: 600, wood: 600, gold: 600 }` → `{ food: 600, wood: 400, stone: 400, gold: 600 }`) e `m8ArmyReserve`
    (custo + a folga `base` de 150/150/100: Fortaleza `{ food: 150, wood: 550, gold: 400, favor: 500 }` →
    `{ food: 150, wood: 400, stone: 350, gold: 350, favor: 500 }`; Portal `{ food: 750, wood: 750, gold: 700, favor: 200 }`
    → `{ food: 750, wood: 550, stone: 400, gold: 700, favor: 200 }`). Se a E1 já reescreveu essa variante (Portal na
    Era VIII), siga o que ela deixou e só some a pedra.
  Depois `npx tsx scripts/missions.ts`. Se uma janela estourar: (1) primeiro suba
  `startingResources.stone` daquela missão em +50% e rode de novo só ela; (2) se ainda falhar, ajuste o roteiro dela em
  `src/core/scenario/testing.ts` (mais cidadãos na pedra, ou um cofre de pedra como os de ouro), como manda a prática do
  projeto ("roteiros reajustados só em testing.ts"); (3) nunca afrouxe `expect` nem crie `exceptions` sem motivo.
  As missões de mapa gerado (m1, m2, m3, m6, m7, m9 e a Horda) também ganham nafta, jazidas e raros pelo
  `placeEraResources`; os edifícios dos roteiros são postos com `placeNear` (procura o tile livre mais perto), então um
  nó novo no lugar só desloca o edifício — se uma missão mudar de comportamento por isso, é aqui que aparece.
- [ ] **31. Documentação e commit** (seção "Ao terminar").

## Testes a escrever ou atualizar

| Arquivo | O que verifica |
|---|---|
| `tests/resources-e2.test.ts` (novo) | (1) todo jogador nasce com as 7 chaves finitas; um save sem `stone`/`oil`/`rares` (apague-as do JSON) volta com 0/[]. (2) cidadão colhe `limestone` e entrega no CC: `resources.stone` sobe. (3) `gather` em `naphtha` com `age = 2` devolve `ok: false` e o motivo `err.oilEra`; com `age = OIL_FROM_AGE` e um `naphtha_well` concluído, `resources.oil` sobe. (4) `gather` de cidadão em `oil_field` e em raro: recusado; Mercador em `gold` ou em fazenda: recusado; Mercador não reza. (5) `canPlaceBuilding('oil_well')` longe da jazida = `err.needsOilField`, encostado = ok; após 10 s de `economySecond` o petróleo sobe 10 (± mods) e a jazida desce o mesmo; jazida de 3 some (`map.nodes` sem ela). (6) Mercador em `wild_horses`: ouro sobe ~0,5/s (× `mods.gather.gold`), `p.rares` = `['wild_horses']` em ≤ 1 s, `getUnitStats(…, 'hippeus').cost` passa de `{ food: 80, gold: 50 }` a `{ food: 68, gold: 43 }` (`Math.round(42,5)` = 43); mandado embora (`move`), o bônus sai e o custo volta. (7) `trade` de pedra funciona; de petróleo antes da IV, não; `OIL_FROM_AGE === ERA.BYZANTINE` (se `ERA` existir). (8) `generateMap` 3 sementes (as do `fixedmap.test.ts`): ≥ 5 `limestone` a até 16 de cada início, nenhum a < 4,5; duas gerações iguais. (9) partida de 2 IAs, 8 min: `stats.gathered.stone > 0` nas duas. (10) **dois** Mercadores do mesmo jogador no mesmo raro, os dois ao lado: em 10 s o ouro sobe ~5 (um só rende), não ~10. (11) Mercador em `gather` num raro com o caminho bloqueado (cerque o nó com `placeBuilding(…, 'wall', …, true)`): depois de 5 s ele não está em nenhum veio de ouro (`u.nodeId` não aponta para `gold`). (12) IA sem poder ter ponto de entrega de petróleo: `quickGame({ startingAge: 3, startingResources: { food: 5000, wood: 5000, stone: 5000, gold: 5000 }, forbid: { buildings: ['naphtha_well', 'refinery'] } }, true)` e `run` 90 s → nenhum cidadão com `carry === 'oil'` (o `forbid` de `config` vale fora de cenário: `isForbidden` lê `state.config`; se a E1 trocou `startingAge` pelo campo de Era inicial dela, use esse). Use `quickGame`/`run` de `tests/helpers.ts`. |
| `tests/command-fuzz.test.ts` | `'stone'` deixou de ser recurso inválido: troque por `'marble'` |
| `tests/fixedmap.test.ts` | hashes e contagens novos de `generateMap`; `'oil'` continua tipo de nó desconhecido (não mude) |
| `tests/editor.test.ts` | formato novo de `StartResources` |
| `tests/data.test.ts` | regra do `hotkeyGroup`; pedra > 3000 e petróleo > 5000 por início nos oficiais; acrescente: todo `RARE_NODES` tem `RARES[id]` com efeitos de stat válido e `NODE_RESOURCE[id] === 'gold'` |
| `tests/position-fairness.test.ts` | sondagem com `'stone'` (+3 Egeu, +1 Estreito) e `quarry` nos extras |
| `tests/hud-icons.test.ts`, `art-etapa6.test.ts`, `art-library.test.ts`, `art-manifest.test.ts` | alias de arte (passo 25) |
| `tests/m4_caucaso.test.ts`, `m6_estatua.test.ts`, `scenario-gaps.test.ts` | literais de recursos com `stone`/`oil` (são só estes 4 literais; passo 2) |
| `tests/hud-text.test.ts` | jogador falso do fim de partida com `gathered.stone`/`oil` (passo 2) |
| `tests/m4_caucaso`, `m5_itaca`, `m8_oceano`, `m10_otris`, `m11_chamas`, `m12_titanomaquia` | nada a mudar no teste; passam depois do `--write` do passo 19 (comparam o mapa gerado com o `map.data`) |
| `tests/i18n.test.ts` | nada a mudar: já exige EN de todo id novo e as mesmas variáveis |
| `scripts/playtest-editor.mjs` | 16 chips na paleta de nós |

## Verificação

Na ordem; não passe para o próximo com o anterior vermelho.

1. `npm run -s typecheck` — sem saída.
2. `npx vitest run tests/resources-e2.test.ts tests/data.test.ts tests/fixedmap.test.ts tests/editor.test.ts tests/position-fairness.test.ts tests/command-fuzz.test.ts tests/hud-icons.test.ts` — tudo verde.
3. `npm test` — tudo verde. Falha conhecida do vitest: às vezes o processo termina com exit 1 por timeout de RPC do
   worker ("Timeout calling …") **com todos os testes passando**; confira o resumo ("Tests N passed") e rode de novo só os
   arquivos citados no erro antes de concluir que algo quebrou.
4. `npm run smoke 20 42` duas vezes — o hash final é igual nas duas; na linha `coletado: {…}` de cada IA, `"stone"` > 0 (o `s=` do resumo é estoque, não coleta), e as IAs avançam de Era.
5. `npm run balance 60 1,2,3` — nenhuma `PARADA`; compare com `/tmp/e2-base/balance.txt`: cada Era no máximo ~2 min
   mais tarde que antes da E2 (alvo do ERAS: II ~4, III ~9, IV ~14, V ~20, VI ~26, VII ~33, VIII ~40). Se uma IA parar
   por pedra, suba `stone` da proporção da Era em 0,04 (tirando de `wood`) e meça de novo; se parar por petróleo na V+,
   faça o mesmo com `oil`.
6. `npm run map:check` — os 2 embutidos sem erro nem aviso, pedra/petróleo/raros iguais por início, 2 min de IA sem
   "IA PARADA". `npm run map:export -- /tmp/e2.map.json --size medium --seed 42 && npm run map:check /tmp/e2.map.json` —
   sem erro (avisos são normais num mapa gerado: hoje essa semente dá 27). O `--` depois de `map:export` é obrigatório:
   sem ele o npm engole `--size`/`--seed` e o script sai com a mensagem de uso (conferido em 06/10).
7. `npx tsx scripts/missions.ts` (~12 min) — todas as missões × dificuldades dentro de `expect` (passo 30 se não).
8. `npx tsx scripts/maps/fairness.ts egeu 60 1-16 zeus --both --jobs 3` e o mesmo com `estreito` — critério de sempre:
   nenhum lado com > 65 % das decididas + à frente, por posição e por índice; um "fora" isolado pede confirmação nas
   sementes 101–132.
9. Navegador: `npm run build && npm run preview` (porta 4173), depois `node scripts/playtest.mjs`,
   `node scripts/playtest-editor.mjs`, `node scripts/playtest-noemoji.mjs http://localhost:4173/` e
   `node scripts/playtest-i18n.mjs` — todos verdes (o noemoji exige `res/stone`/`res/oil` no atlas e nenhum `.hic-ph`).
   Captura: `node scripts/actionshot.mjs http://localhost:4173/ docs/art/e2-barra.png` e olhe com Read: 6 recursos na
   barra na Era I, sem corte a 1280 px.

## Critérios de pronto

- [ ] `typecheck`, `npm test`, `smoke` (hash estável), `balance 60` sem PARADA, `map:check`, `missions.ts` e os 4
  playtests verdes; `fairness.ts` dentro do critério nos dois mapas oficiais.
- [ ] Partida rápida: cidadão colhe pedra desde a Era I; nafta só da IV; Poço de Petróleo só encostado numa jazida e
  extraindo sozinho; Mercador num raro rende ouro e mostra o bônus no topo; dois Mercadores no mesmo raro rendem como
  um; Mercador nunca vira mineiro.
- [ ] Harness (`testing.ts`) com pedra nas conferências de custo e nos cofres (passo 30); `missions.ts` sem
  `exceptions` novas.
- [ ] Barra do topo: 6 recursos até a III, 7 da IV em diante; mercado compra e vende pedra (e petróleo da IV).
- [ ] Editor: 16 nós na paleta; tabela por início com pedra, petróleo e raros; `map:check` idem.
- [ ] Mapas oficiais e os 6 mapas de missão regerados pelos scripts, idênticos ao arquivo (testes).
- [ ] Nenhum `Math.random`/trigonometria em `src/core`; `SIM_VERSION` subiu; ícones `res/stone` e `res/oil` no atlas.
- [ ] `docs/eras/PROGRESSO.md`, `docs/ROADMAP.md` e `CLAUDE.md` atualizados; commit feito.

## Armadilhas

- **Literal com cast**: `const resources = { … } as Record<ResourceType, number>` em `createGame` não é acusado pelo tsc.
  Esquecer `stone` ali dá `NaN` na primeira cobrança (`pay` não usa `?? 0`). O fuzz pega; não ignore.
- **Laços literais da IA** (`['food', 'wood', 'gold', 'favor']`) e `Record<string, number>` não são acusados pelo tsc:
  `gatherers.stone++` sobre `undefined` vira `NaN` e a IA nunca põe ninguém na pedra. Use `AI_RES`.
- **Ordem das chaves**: todo literal de recursos na ordem de `RESOURCES`; o `deserialize` usa `{ ...ZERO, ...p.resources }`.
  Ordem diferente muda o JSON da ida e volta do save e quebra o teste do fuzz.
- **Nunca dê a um nó o id de um recurso** (`stone`, `oil`): `nearestNode` passaria a tratar o pedido de recurso como
  pedido de tipo de nó. E não mude `'oil'` em `tests/fixedmap.test.ts` (continua tipo desconhecido, de propósito).
- **`nearestNode` por recurso não pode achar raro nem jazida**: sem o `NOT_GATHERED`, um mineiro cujo veio secou vai
  "minerar" um olival (o raro rende ouro). A regra mora em `nearestNode` + `canWorkNode`; a única outra varredura por
  `NODE_RESOURCE` que precisa dela é `nearestUnclaimedNode` da IA (passo 20.9). Não espalhe outras cópias.
- **Mercador fora do raro**: `updateGather` não consulta `canWorkNode`; quem impede o Mercador de virar mineiro é o
  `return null` em `pickNewSource` (passo 8). E a renda é por nó, uma vez por segundo (passo 11): não volte a pagar ouro
  por tick em `updateGather`, senão Mercadores empilhados multiplicam a renda.
- **Petróleo sem entrega** (decisão 12): o Centro Cívico não recebe petróleo; a IA só manda cidadão à nafta com
  ponto de entrega pronto (passo 20.8) e constrói o primeiro Poço de Nafta (passo 21). Não "resolva" pondo `oil` no
  `dropoff` do Centro Cívico sem falar com o dono (esvazia o papel do Poço de Nafta).
- **`isNodeType` do editor recusa em silêncio**: enquanto ele for a lista fixa de hoje, `b.nodes(…)` e `tryNode(…)` dos
  scripts de mapa devolvem 0/false sem erro. Faça o passo 16 antes do 18 e do 19 e confira as contagens de nós deles.
- **Gerador**: não mexa nas passadas antigas nem na ordem das chamadas a `rng` dentro de `placeEraResources`; não rode
  `widenChokepoints` de novo (removeria nós antigos). Os 4 hashes de `fixedmap.test.ts` mudam uma vez, de propósito.
- **Determinismo**: nada de `Math.random`, `Math.sin/cos/atan2/pow/hypot`, `Date.now` em `src/core`; use `state.rng` (ou o
  RNG da passada), `Math.sqrt` (`dist`) e `x * x`. O editor e os scripts também não usam aleatoriedade nativa.
- **Justiça de posição**: toda escolha nova da IA (jazida, raro) passa por `nearestNodeBy`/`findBuildSpot` (desempate
  pelo centro do mapa e `frameCompare`); nada de "o primeiro do `Map`" nem varredura (y, x) decidindo. `extractorNode`
  desempata por quantidade e id e não muda o total extraído. Rode a sondagem e o `fairness.ts`.
- **Selar o mapa**: os nós dos mapas oficiais vão sempre por `b.node`/`b.nodes` (simetria) e o `finish()` confere rotas;
  não ponha nó no vau/baixio "a olho".
- **Mapas versionados**: `src/core/data/maps/*.map.json` e o `map.data` dos cenários **só** pelos scripts (`--write` nas
  missões). Editar à mão quebra os testes de igualdade.
- **Campanha**: pedra é obrigatória (custos), petróleo e Mercador não (IA fora de cenário). Não ponha nafta nem raros
  nos mapas fixos das missões nesta etapa; a E3 decide se a campanha precisa de petróleo. Os mapas **gerados** das
  missões (m1, m2, m3, m6, m7, m9, Horda) ganham nafta, jazidas e raros pelo `placeEraResources` — é esperado e não
  dá para evitar sem tirar a pedra deles também; o jogador pode até treinar Mercador no Mercado (Era II). O harness
  (`testing.ts`) tem conferências de custo e cofres sem pedra: atualize-os (passo 30) antes de culpar o balanceamento.
- **`SIM_VERSION`**: some 1; o relay recusa salas de outra versão e os replays antigos deixam de valer (esperado).
- **Atalhos**: nunca `A`, `R`, `U` (nem `H`, `P`, dígitos, que o `input.ts` consome antes). Treino no Mercado: `M` não
  pode ser usado de novo pela caravana da E5.
- **Textos PT e EN**: toda chave nova nos dois idiomas com as mesmas `{variáveis}`; sem emoji em `strings.ts` (emoji novo
  exigiria `EMOJI_GLYPHS`).
- **Ícone do HUD obrigatório**: recurso novo sem `res/<id>` no atlas quebra `hud-icons.test.ts` e o `playtest-noemoji`.
  Só o `npm run art:hud` grava o atlas; `art:check` confere índice = catálogo.
- **Não rode `npm run art:bake`** nesta etapa: sem `--out` ele reempacota `public/art` só com o cache e pode apagar
  unidades e o atlas `hud`. A E2 não assa edifício nem unidade (alias).
- **VRAM**: o alias não carrega página nova (o Mercador usa a do cidadão, os edifícios as dos seus pares).
- **Procedural**: tipo novo de nó sem linha em `NODE_TYPES` (`textures.ts`) sai desenhado como árvore, sem erro.
- **storeSet**: a E2 não grava nada do jogador; se acrescentar algo (por exemplo um filtro do editor), use
  `storeSet`/`storeRemove`, nunca `localStorage.setItem`.

## Ao terminar

1. `docs/eras/PROGRESSO.md` (crie se faltar, com a tabela `| Etapa | Estado | Data | Commit | Notas |`): linha da E2
   "pronta", com as notas: Mercador mínimo antecipado da E5 (um Mercador rende por nó, renda em `economySecond`);
   o Centro Cívico recebe pedra mas não petróleo (a IA só põe cidadão na nafta com poço pronto); peixes raros para a
   E4; letras `I` e `L` livres; alias de arte em `src/render/art/alias.ts` (a E8 tira os tipos de lá); números do
   `balance 60` depois da E2; o que mudou no harness (passo 30).
2. `docs/ROADMAP.md`, tabela "Cronograma a partir de 06/10/2026", linha das semanas 3–4: marque a E2 como feita
   (`✅ E2 …`) com a data.
3. `CLAUDE.md`, "Estado atual": uma frase — E2 concluída (pedra, petróleo, 7 raros e o Mercador; nós `limestone`,
   `naphtha`, `oil_field` e raros; Poço de Petróleo extrator; `placeEraResources` no gerador; arte provisória por
   `src/render/art/alias.ts`); em "Convenções", "atalhos de petróleo dividem `O` por `hotkeyGroup`".
4. Commit em português, por exemplo `E2: pedra, petróleo e recursos raros (nós, pedreira, poços, Mercador, gerador, editor, IA)`,
   com o rodapé de atribuição exigido pela sua sessão.

Ganchos para as etapas seguintes (não implemente agora):

- **E3**: custos de unidade com pedra/petróleo (fogo grego, dromon, artilharia); se a campanha (Eras I–IV) precisar de
  petróleo, repita o passo 19 com `'naphtha'` nos mapas de missão e libere o petróleo da IA em cenário.
- **E4**: `rare_fish` (peixes raros) como nó de água; ele entra em `RARE_SET` e `NOT_GATHERED`, **não** em
  `RARE_NODES` (o gerador da E2 sorteia `rng.int(0, RARE_NODES.length - 1)`: aumentar a lista mudaria todos os mapas e
  poria peixe em terra — decisão D8 do guia da E4); atalhos `I`/`L` para Estaleiro e Universidade. A E4 também troca
  o filtro `!UNITS[u.type].tags.includes('merchant')` da ocupação dos raros (passo 11) para aceitar o barco de pesca, e
  acrescenta linhas no começo de `canWorkNode` e de `pickNewSource`: mantenha esses três trechos como o guia os escreve.
- **E5**: caravana no `market.trains` (atalho ≠ `M`); regras extras do Mercador (território, escolta) se o dono pedir.
- **E8**: arte própria da Pedreira, dos poços, da Refinaria e do Mercador (sai do `alias.ts`), nós assados em
  `props-nodes.json` (`nodeFrameName`), ícones próprios das 6 pesquisas.
- **E9**: aba de recursos raros na enciclopédia; **E10**: custos de pedra/petróleo e `RARE_GOLD_RATE` no balanceamento.
