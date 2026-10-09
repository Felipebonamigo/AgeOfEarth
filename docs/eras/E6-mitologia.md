# E6 — Mitologia em todas as Eras (9 deuses menores novos, poderes que crescem com a Era, criaturas navais e voadoras, Bênçãos, Talos)

- Estado: pendente · Pré-requisitos: **E1, E2, E3 e E4 concluídas** (E1: 8 Eras, `ERA_TITANS`, `ROMAN`, `grantStartingEras`, `isScenarioConfig`, Biblioteca; E2: `src/render/art/alias.ts`; E3: `src/core/sim/lines.ts`, `trainChoices`, efeito `evolve`, tag `fire`/`gunpowder`; E4: `src/core/map/naval.ts`, `src/core/sim/naval.ts`, `navalOn`, Estaleiro `shipyard`, `UnitDef.naval`, `Snapshot.ships`). Na ordem oficial (E1, E2, E3, E4, E5+E7, E6…) a **E5 e a E7 já estão prontas** quando a E6 começa: o código desta etapa não depende delas, mas convive com o que elas deixaram — `PowerState.charges`/`powerReady` (Trono do Olimpo, E7), o `merchant_ship` no `shipyard.trains` (E5) e o `setNavalOpen` do Canal em `src/core/map/naval.ts` (E7). · Estimativa: 7 dias de trabalho do agente (dados e textos 1, poderes e escala 1,5, criaturas, Talos e camada anfíbia 1,5, IA 1, efeitos, ícones e interface 1, verificação e documentação 1)

> **Antes de começar:** leia `docs/eras/LEIA-ME.md` (rotina de cada sessão, regras, quando parar) e marque cada
> passo em `docs/eras/PROGRESSO.md`. Ordem das etapas: E1, E2, E3, E4, E5+E7, E6, E8, E9+E10. Onde este guia falar de
> commit ou de push, vale a rotina do LEIA-ME: um commit por passo e push só para a branch da sessão.

> Guia de execução para um agente que não viu a conversa que o escreveu. Siga os blocos na ordem (0, A … J). Todo
> número de jogo daqui é **valor inicial para o balanceamento** (a E10 ajusta): copie, não recalcule, não invente outro.
> O código citado foi conferido em 06/10/2026, **antes** de E1–E4; elas mexem em volta (por exemplo a E3 troca o laço de
> treino por `trainChoices` e a E4 põe `layer` no pathfinding). Se um trecho não estiver exatamente como descrito,
> procure pelo nome da função e aplique a mesma mudança sobre o que E1–E4 deixaram; **nunca desfaça nada delas**. Números
> de linha são aproximados. **Se algum arquivo marcado "(da E1/E2/E3/E4)" não existir, pare: a pré-condição não foi
> cumprida.** Recomendado: um commit só no fim (alguns testes só voltam ao verde depois dos blocos F e G).

---

## Objetivo e resultado jogável

Ao fim da E6, numa **partida rápida, no multiplayer e em qualquer partida fora de cenário**:

- Cada avanço da Era II à VII escolhe um **deus menor** (6 escolhas, 2 opções por Era para cada deus maior). Os 9 de hoje
  continuam nas Eras II–IV; os **9 novos** entram nas Eras V–VII: **Pã, Hécate, Perséfone** (V), **Éolo, Tritão,
  Deméter** (VI), **Hélio, Nice, Nêmesis** (VII). Cada um traz um poder, uma criatura mítica e 2 pesquisas no Templo.
- **9 poderes novos**: Pânico (inimigos fogem e não atacam), Encruzilhada (leva o grupo selecionado a outro ponto),
  Primavera (os mortos da área voltam como Sombras suas), Vendaval (empurra, freia, para navios e "apaga incêndios"),
  Maremoto (dano em área, dobrado em navios), Colheita Divina (+50 % de coleta), Carro do Sol (faixa de fogo), Vitória
  Alada (+30 % de ataque) e Retribuição (metade do dano volta a quem atacou).
- **Os poderes crescem com a Era**: +15 % de dano, área ou duração por Era acima da Era em que o poder chega (o Raio de
  Zeus a um Titã tira até 75 % da vida na Era Moderna).
- **12 criaturas novas**: as 9 dos deuses (Sátiro, Empusa, Lâmpade, Harpia [voa], Hipocampo [nada], Dragão de Triptólemo
  [voa], Fênix [voa, renasce], Grifo [voa, luta no ar], Erínia), as navais de Poseidon (**Escila**, nada; **Ceto**, anda e
  nada) e **Talos**, que substitui o Colosso de Hefesto na Era VII (os Colossos vivos se transformam).
- **Bênçãos do Templo**: uma por Era (II–VIII), cada uma dá +20 % de vida e de ataque e +0,02 de armadura às criaturas
  míticas e aos heróis (os Titãs não), para "um Minotauro abençoado ainda enfrentar fuzileiros".
- **Titãs na Era VIII** (pelo Portal, como a E1 deixou): vida ×2 e ataque ×1,5 fora de cenário; **Oceano anda no mar**
  (camada anfíbia). **Heróis nas Eras I–V** (já é assim desde a E1: Jasão I … Perseu V) e recebem as Bênçãos.
- Os deuses maiores ganham um bônus de pólvora cada (o naval foi da E4).
- A IA escolhe os deuses novos, usa os 9 poderes, treina as criaturas novas (as navais no Estaleiro) e estuda as Bênçãos.
- **Na campanha e nos cenários JSON nada muda** (`config.eraMyth` desligado em cenário: sem escala dos poderes,
  sem Bênçãos, Titãs sem reforço, Oceano só em terra). As 12 missões vencem no harness estrito com os mesmos resultados
  (a campanha para na Era IV, `maxAge: 3` da E1). **Na Horda** (cenário sem teto de Era, D11 da E1) vale o mesmo, mas os
  pares V–VII e o Talos são dados, não regra de Era: quem chegar à Era V na Horda escolhe um deus novo e, na VII, vê o
  Colosso virar Talos. É esperado (`scripts/horde.ts` não chega lá); não "conserte" com guarda de `eraMyth`.
- **Arte provisória**: criaturas com a arte assada de uma criatura de hoje (alias da E2); efeitos dos poderes por um
  handler provisório `divine` (anel, brilho e centelhas na cor do poder) e 3 handlers de duração; ícones de objetos que já
  existem; 9 retratos novos de deuses no atlas `hud`. Nenhum manifesto nem bake de unidade. A arte própria é da E8.

---

## Decisões já tomadas (não reabrir; cite docs/ERAS.md)

Do plano aprovado pelo dono (`docs/ERAS.md`):

- **§6:** "Deus menor a cada avanço da II à VII (6 escolhas, 2 opções por Era para cada deus maior): os 9 de hoje + 9
  novos. Cada um traz um poder, uma criatura mítica e 2 pesquisas." A tabela da §6 fixa Era, deus, poder e criatura:
  V Pã/Pânico/Sátiros, Hécate/Encruzilhada/Empusas, Perséfone/Primavera/Lâmpades; VI Éolo/Vendaval/Harpias (voadoras),
  Tritão/Maremoto/Hipocampos (navais), Deméter/Colheita Divina/Dragões de Triptólemo (voadores); VII Hélio/Carro do
  Sol/Fênix (voadora, renasce), Nice/Vitória Alada/Grifos (voadores), Nêmesis/Retribuição/Erínias.
- **§6:** "Os poderes crescem com a Era (+15 % de dano, área ou duração por Era): o Raio de Zeus continua decidindo
  batalhas na Era Moderna."
- **§6:** "Bênçãos do Templo: uma por Era, fortalecem criaturas míticas e heróis (vida, ataque, armadura) — um Minotauro
  abençoado ainda enfrenta fuzileiros. O Colosso de Hefesto vira Talos na Era Industrial." (Industrial = Era VII, índice 6.)
- **§6:** "Míticos navais: Hipocampos, Escila (Poseidon) e Ceto; o Titã Oceano luta no mar. Míticos voadores fazem o papel
  dos aviões: Pégaso, Harpias, Grifos, Fênix, Dragões de Triptólemo." "Titãs: Era VIII, pelo Portal dos Titãs."
- **§6:** "Deus maior no início (Zeus, Poseidon, Hades), com os bônus de hoje e novos para naval e pólvora."
- **§4/§10:** "Os 5 heróis continuam lendários em qualquer Era (recebem as Bênçãos do Templo)"; heróis nas Eras I–V.
- **§1/§10:** a campanha continua nas Eras I–IV, determinismo como hoje, `SIM_VERSION` sobe, arte provisória até a E8.
- **§11:** E6 = 9 deuses menores novos, poderes, 9 criaturas (navais e voadoras), Bênçãos, escala dos poderes.

Decisões deste guia (cada uma com o motivo em uma linha):

| # | Decisão | Motivo |
|---|---|---|
| D1 | **Pares por Era** (tabela "Pares"): cada deus novo aparece em 2 dos 3 deuses maiores, como os de hoje. Hades fica com Hécate/Perséfone, Poseidon com Tritão/Éolo, Zeus com Nice/Hélio. | Mesmo padrão de hoje (cada menor em 2 pares por Era); as afinidades míticas mais óbvias. |
| D2 | `MINOR_GODS[x].age` = 4 (Pã, Hécate, Perséfone), 5 (Éolo, Tritão, Deméter), 6 (Hélio, Nice, Nêmesis); `AGES[4..6].minorGod = true`. | É a regra que `canAdvanceAge`/`completeQueueItem` já leem (`minorGods[player.age]`); a E1 deixou `false` à espera da E6 (D8 da E1). |
| D3 | Poder continua **de uso único** (`PowerState.used`). Os usos extras do Trono do Olimpo (`charges`) são da E7, que vem antes. | Não mexer no consumo que a E7 já trocou por `powerReady`/`charges`. |
| D4 | **Escala**: `powerScale = 1 + 0,15 × max(0, Era do jogador − Era do poder)`, na hora do uso; a Era do poder é a `age` do deus menor que o traz (poder de deus maior = 0). Cada poder escala **uma** dimensão (tabela "Escala"). Os temporizados gravam a escala no `TimedEffect.mult`. | "+15 % de dano, área ou duração por Era"; os números de base valem na Era do poder; a Era pode mudar no meio do efeito. |
| D5 | **`config.eraMyth`** (como o `unitLines` da E3 e o `naval` da E4): `eraMythOn(state) = config.eraMyth ?? !isScenarioConfig(config)`. Desligado: escala = 1, Bênçãos recusadas, Titãs sem reforço. | A campanha e o harness estão calibrados (o Raio da m12 vale "metade de um Titã"; a m8 tem Oceano). |
| D6 | **Encruzilhada** = targeting novo `'group'`: as unidades **selecionadas** vão ao ponto clicado. `Command` `power` ganha `ids?: number[]`. Destino precisa estar explorado e ser terra passável; até 20 de população (escala); navios, Titãs, imóveis e transportes não vão. | Um clique só, sem segundo ponto no comando; a IA manda o próprio exército. |
| D7 | **Carro do Sol** = faixa de 16 × 3 tiles centrada no ponto, **alinhada do seu Centro Cívico mais perto até o ponto** (sem CC, do ponto para o centro do mapa); 6 s de fogo. | Um clique; a direção sai de posições (espelhável), nada de orientação absoluta. |
| D8 | **Vendaval**: empurra os inimigos até 3 tiles para fora (tile a tile, sem atravessar obstáculo); por 12 s os inimigos na área andam a 50 % e os **navios param**; "apaga incêndios" = seus edifícios na área recuperam 20 % da vida e os Carros do Sol inimigos na área se apagam. | §6 "empurra e para navios, apaga incêndios", lido com o que o motor tem (não há fogo de edifício na simulação). |
| D9 | **Pânico**: ordem de fuga de 8 tiles e `Unit.fearUntil` (não ataca) por 8 s; heróis, Titãs, navios e imóveis resistem. | "Inimigos fogem"; a flag impede que a IA os mande de volta lutar. |
| D10 | **Primavera**: por 20 s, todo soldado humano (não herói) que morrer na área vira uma **Sombra do lançador** (até 12 por lançamento). | "Os mortos da área voltam como Sombras"; reaproveita a `shade` de Hades. |
| D11 | Colheita Divina, Vitória Alada e Retribuição são **flags no jogador** (`harvestUntil`, `nikeUntil`, `nemesisUntil`), como `bronzeUntil`. Campos opcionais lidos com `?? 0`. | Mesmo modelo da Pele de Bronze; save antigo funciona sem migração. |
| D12 | **Números das criaturas na faixa das míticas de hoje** (sem multiplicador de Era). Quem acompanha a Era são as **Bênçãos**. | As míticas de hoje das Eras II–IV não seguem escala por Era; a Bênção faz isso para todas igualmente. |
| D13 | **Bênçãos**: 7 estudos do Templo `blessing2…blessing8` (Eras II–VIII), em sequência; cada um: vida ×1,2, ataque ×1,2, armadura +0,02 (h/p/c) nas criaturas míticas e heróis, **exceto Titãs** (`match.types = BLESSED_TYPES`). | ×1,2 por Era é a regra de escala da E3: com todas as Bênçãos as míticas acompanham os degraus humanos (×1,2⁷). |
| D14 | **Navais**: Hipocampo (Tritão, Era VI) e **Escila** (Poseidon, Era III) com `naval: true` e tag `ship`; **Ceto** (Poseidon, Era V) **anfíbio** (`amphibious: true`). Os três treinam no **Estaleiro**. Escila e Ceto são as criaturas do deus maior Poseidon. | Poseidon é o único deus maior sem criatura própria hoje; criatura naval só nasce na água (`findSpawnTile` naval). |
| D15 | **Camada `'amphibious'`** (terra caminhável **ou** água navegável) para Ceto e **Oceano**. Oceano só é anfíbio com navios ligados: `unitLayer(state, def)` devolve `'land'` quando `!navalOn(state)`. | Gancho deixado pela E4 (D19 de lá); a m8 (Oceano em três marés) continua igual. |
| D16 | **Talos** é automático: `MYTH_UPGRADES = { colossus: { to: 'talos', age: 6 } }`. Ao chegar à Era VII, os Colossos do jogador viram Talos (vida proporcional, efeito `evolve` da E3), o treino do Colosso é recusado e o item da fila sai Talos. | §6 diz "vira" (não é estudo); o mecanismo é o da transformação da E3. |
| D17 | Voador **corpo a corpo** (Harpia, Grifo) pode atacar outro voador (`canTarget`); corpo a corpo terrestre continua sem alcançar voador. | Os Grifos são a caça "ar-ar" (bônus ×2 contra `flying`). |
| D18 | Especiais novos de `UnitDef.special`: `'drain'` (Empusa cura 30 % do dano causado) e `'rebirth'` (Fênix: na primeira morte por inimigo, renasce com 50 % da vida; `Unit.reborn`). | §6 "Fênix (voadora, renasce)"; a Empusa precisa de um papel além do dano. |
| D19 | **Heróis**: nenhum dado muda (idades 0–4 desde a E1 = Eras I–V); só um teste confere e eles entram nas Bênçãos. | §10 já foi cumprido pela E1. |
| D20 | **Titãs**: ficam na Era VIII (E1); com `eraMythOn`, vida ×2 e ataque ×1,5 (`TITAN_ERA_HP`, `TITAN_ERA_ATTACK`, em `recomputeMods`); fora das Bênçãos; o Raio tira `min(0,75; 0,5 × escala)` da vida. | Na VIII os exércitos estão ~3,6× mais fortes (E3); o Titã continua o clímax. Campanha intacta (D5). |
| D21 | **Deuses maiores, pólvora**: Zeus `gunpowder` +10 % de ataque; Poseidon `gunpowder` 10 % mais barata; Hades `gunpowder` +10 % de vida. | §6 "novos para naval e pólvora"; o naval foi feito na E4. Sem efeito na campanha (não há pólvora no elenco clássico). |
| D22 | **Arte provisória**: 12 entradas em `UNIT_ART_ALIAS` (E2); um tipo de efeito novo `'divine'` (`data` = raio, `src` = id do poder) e 3 `TimedEffect` novos (`spring`, `gale`, `sun_chariot`) com handler; ícones de poder e de pesquisa com objetos que já existem; 9 bustos novos em `scripts/bake/page/hud-gods.js`. Sem manifesto nem bake de unidade. | Nenhuma página nova de VRAM; os testes de arte (35 unidades com manifesto) continuam valendo pelo filtro do alias. |
| D23 | **Atalhos**: criaturas do Templo com `Z` (como hoje; Talos também `Z`); no Estaleiro, Hipocampo `Z`, Escila `X`, Ceto `C` (letras que a E4 reservou para a E6, D11 de lá; o navio mercante da E5 fica com `M`, a 1ª livre de M, C, V, B). Com várias unidades na mesma tecla, a tecla treina a **de Era mais alta que o jogador pode treinar** (`pickTrainHotkey`; empate de Era: a primeira do `trains`). | `tests/data.test.ts` aceita tecla repetida só em unidade com `god`; hoje o `Z` sempre pegava o primeiro da lista (o Pégaso). |
| D24 | `SIM_VERSION` +1. O formato do save **não** muda (campos novos opcionais, lidos com `?? 0`/`?? false`). | A mesma semente dá outra partida fora de cenário; a regra do núcleo para campos novos. |
| D25 | **IA**: um `case` por poder novo (alvos pelo aglomerado inimigo de sempre ou por vetores, nunca deslocamento absoluto); criaturas do Templo pela ordem dos `trains` (Era crescente); criaturas do Estaleiro só com frota (≥ 2 navios de guerra) e Favor > 40; Bênçãos com ≥ 3 míticas/heróis vivos. | Mesmo estilo de `managePowers`/`manageTraining` de hoje; justiça de posição (CLAUDE.md). |

---

## Arquivos que mudam

| Caminho | O que muda |
|---|---|
| `src/core/types.ts` | `UnitDef.amphibious?`; `UnitDef.special` + `'drain' \| 'rebirth'`; `TechDef.blessing?`; `PowerTargeting` + `'group'`; `Unit.fearUntil?`, `Unit.reborn?`; `Player.harvestUntil?`, `nikeUntil?`, `nemesisUntil?`; `TimedEffect.mult?`, `dx?`, `dy?`, `count?`; `GameConfig.eraMyth?`; `Command` `power` + `ids?` |
| `src/core/constants.ts` | `TITAN_ERA_HP`, `TITAN_ERA_ATTACK`; `SIM_VERSION` + 1 (com a linha do histórico) |
| `src/core/data/ages.ts` (da E1) | `minorGod: true` nas Eras 4, 5 e 6 |
| `src/core/data/gods.ts` | 9 `POWERS`, 9 `MINOR_GODS`, `minorGods` com 6 pares nos 3 deuses maiores, bônus e perks de pólvora (e do Poseidon, Escila/Ceto) |
| `src/core/data/units.ts` | 12 unidades novas; `MYTH_UPGRADES`; `oceanus.amphibious = true` |
| `src/core/data/buildings.ts` | `temple.trains` + 9 criaturas; `shipyard.trains` (da E4) + 3 |
| `src/core/data/techs.ts` | 18 pesquisas dos deuses novos; `BLESSED_TYPES`, `blessings()` (7 Bênçãos), `BLESSING_IDS` |
| `src/core/data/index.ts` | exporta `MYTH_UPGRADES`, `BLESSED_TYPES`, `BLESSING_IDS` |
| `src/core/map/naval.ts` (da E4) | `Layer` + `'amphibious'`; `layerOf` com `amphibious`; `amphibBlocked`; `layerBlocked`; `invalidateNaval` apaga o cache anfíbio |
| `src/core/map/grid.ts` | `isPassable`/`canPass` com a camada anfíbia |
| `src/core/map/pathfinding.ts` | `findPathEx` (o `pass`) com a camada anfíbia (importa `layerBlocked`) |
| `src/core/map/components.ts` | terceiro cache de regiões (`amphStore`), invalidado junto (importa `amphibBlocked`) |
| `src/core/sim/naval.ts` (da E4) | `unitLayer`, `mediumOf` (novas); `canBoard` recusa anfíbio |
| `src/core/sim/divine.ts` (novo) | `POWER_TUNING`, `powerEraOf`, `powerScale`, `powerRadius`, `galeFactor`, `harvestMult`, `inStrip`, `homeOf` |
| `src/core/sim/myth.ts` (novo) | `mythUpgradeOf`, `applyMythUpgrades`, `springRaise` |
| `src/core/sim/powers.ts` | 9 `case` novos; escala nos 12 de hoje; parâmetro `ids`; `updateTimedEffects` com `mult` e `sun_chariot` |
| `src/core/sim/commands.ts` | `godAllows` (nova, exportada); `canTrain` (deus pela lista de menores, Talos); `canResearch` (Bênçãos); `case 'power'` passa `ids` |
| `src/core/sim/validate.ts` | `power` aceita `ids` |
| `src/core/sim/combat.ts` | `canTarget` (Pânico, voador contra voador, meio da anfíbia); `computeDamage` (Vitória Alada); `applyDamage` (Retribuição); `performAttack` (`drain`); `killUnit` (`rebirth`, `springRaise`) |
| `src/core/sim/units.ts` | velocidade × `galeFactor`; coleta × `harvestMult`; `layerOf(...)` → `unitLayer(state, ...)`; aproximação de ataque com anfíbio/voador |
| `src/core/sim/buildings.ts` | item de unidade resolvido por `mythUpgradeOf`; `applyMythUpgrades` ao subir de Era; `layerOf` → `unitLayer` |
| `src/core/sim/entities.ts`, `src/core/sim/commands.ts` | os `layerOf(...)` que a E4 pôs → `unitLayer(state, ...)` |
| `src/core/sim/economy.ts` | Cornucópia × `powerScale` |
| `src/core/sim/modifiers.ts` | reforço dos Titãs por Era (com `eraMythOn`) |
| `src/core/sim/restrictions.ts` | `eraMythOn` |
| `src/core/sim/ai.ts` | 9 casos em `managePowers` (e `ids` no `use`); Bênçãos em `manageResearch`; `trainSeaMyths` (nova, chamada logo depois de `manageNavy` em `aiThink`); o `pick` de guerra do `manageNavy` (E4) sem criaturas |
| `src/core/scenario/schema.ts`, `src/core/scenario/compile.ts` | `config.eraMyth?: boolean` (tipo, validação, cópia em `scenarioConfig`) |
| `src/i18n/strings.ts` | 10 chaves novas (PT e EN) |
| `src/i18n/en-data.ts` | EN de 12 unidades, 9 poderes, 9 deuses, 25 pesquisas e perks dos deuses maiores |
| `src/ui/train-hotkey.ts` (novo) | `pickTrainHotkey` (pura) |
| `src/ui/input.ts` | Encruzilhada (`'group'`), raio escalado na mira, tecla de treino por `pickTrainHotkey` |
| `src/ui/hud.ts` | dica do poder com a força da Era (e `p.age` na chave do painel), alvo `'group'`, Bênçãos escondidas em cenário, Colosso escondido na VII, filtro de deus dos botões de treino por `godAllows` (senão o Talos nunca aparece) |
| `src/render/art/alias.ts` (da E2) | 12 entradas em `UNIT_ART_ALIAS` |
| `src/render/fx/types.ts` | `'divine'` em `EFFECT_TYPES`; `'spring'`, `'gale'`, `'sun_chariot'` em `TIMED_TYPES` |
| `src/render/fx/handlers/divine.ts` (novo) | `divine`, `springTimed`, `galeTimed`, `sunChariotTimed`, `DIVINE_TINT` |
| `src/render/fx/registry.ts` | registro dos handlers e 9 linhas em `POWER_ART` |
| `src/audio/events.ts` | `cuesForEffect`: `'divine'` → receita `summon` |
| `scripts/bake/hud/catalog.mjs` | 9 `POWER_ICONS`, 19 `TECH_ICONS`, 9 `GODS`, `techIconKey` com `blessing` |
| `src/ui/icons.ts` | `techIconName` com `blessing` (igual ao catálogo) |
| `scripts/bake/page/hud-gods.js` | 9 bustos novos em `GODS` |
| `public/art/hud-*.png`, `public/art/hud-*.json`, `public/art/manifest.json` | regerados por `npm run art:hud` (nunca à mão) |
| `scripts/bake/check.ts` | **só se** o `art:check` acusar o atlas `hud` acima de 4 MB: `BUDGET.maxHudPngMB` 4 → 5 (ver Armadilhas) |
| `scripts/playtest-myth.mjs` (novo) | playtest dos poderes, criaturas, Bênçãos e ícones (PT e EN) |
| `tests/myth-eras.test.ts` (novo) | testes de dados, poderes, criaturas, Talos, Bênçãos, anfíbio, IA e save |
| `tests/data.test.ts`, `tests/fx-registry.test.ts`, `tests/movement-ai.test.ts`, `tests/eras.test.ts` (da E1), `tests/naval.test.ts` (da E4), `tests/unit-lines.test.ts` (da E3, com o caso do Estaleiro da E4) | atualizações da seção "Testes" |
| `docs/EDITOR.md` | `eraMyth` na config do cenário |
| `docs/eras/PROGRESSO.md` (novo, se faltar), `docs/ROADMAP.md`, `CLAUDE.md` | documentação (bloco J) |

**Não mexa em:** `art/manifest/*`, `scripts/bake/page/rigs/*`, `scripts/bake/page/materials.js`, `scripts/bake/page/bake.js`
(reassariam a arte inteira); `src/core/scenario/missions/*.json`, `src/core/scenario/campaign.ts` e
`src/core/scenario/testing.ts` (a campanha fica igual pelo D5); os 35 `UnitDef` de hoje além de `oceanus.amphibious`; o
consumo do fim de `usePower` (a E7 já o trocou por `if (ps.used) ps.charges = …; else ps.used = true;` com `powerReady`: não mexa).

---

## Dados prontos

Todos os números são **valores iniciais para o balanceamento da E10**.

### Pares de deuses menores por Era (`MAJOR_GODS[g].minorGods`, índice k = escolha ao entrar na Era k + 1)

| k | Era | Zeus | Poseidon | Hades |
|---|---|---|---|---|
| 0 | II (hoje) | `athena`, `hermes` | `ares`, `hermes` | `ares`, `athena` |
| 1 | III (hoje) | `apollo`, `dionysus` | `aphrodite`, `dionysus` | `aphrodite`, `apollo` |
| 2 | IV (hoje) | `hera`, `artemis` | `hephaestus`, `artemis` | `hephaestus`, `hera` |
| 3 | V (novo) | `pan`, `hecate` | `pan`, `persephone` | `hecate`, `persephone` |
| 4 | VI (novo) | `aeolus`, `demeter` | `aeolus`, `triton` | `triton`, `demeter` |
| 5 | VII (novo) | `helios`, `nike` | `helios`, `nemesis` | `nike`, `nemesis` |

O primeiro de cada par é o que um humano recebe quando a partida começa acima da Era I (`grantStartingEras` da E1).

### Os 9 deuses menores novos (`MINOR_GODS`, `src/core/data/gods.ts`)

| id | Era (`age`) | PT nome / título | EN nome / título | poder | criatura | pesquisas | `icon` (dado) |
|---|---|---|---|---|---|---|---|
| `pan` | 4 | Pã / Deus dos Pastores e do Pânico | Pan / God of Shepherds and Panic | `panic` | `satyr` | `rustic_flute`, `wild_hooves` | 🦌 |
| `hecate` | 4 | Hécate / Deusa das Encruzilhadas e da Magia | Hecate / Goddess of Crossroads and Magic | `crossroads` | `empusa` | `torch_of_hecate`, `crossroads_rites` | 🌙 |
| `persephone` | 4 | Perséfone / Rainha do Submundo e da Primavera | Persephone / Queen of the Underworld and of Spring | `spring` | `lampad` | `pomegranate`, `eternal_spring` | 💚 |
| `aeolus` | 5 | Éolo / Senhor dos Ventos | Aeolus / Keeper of the Winds | `gale` | `harpy` | `bag_of_winds`, `storm_lord` | 🌬️ |
| `triton` | 5 | Tritão / Mensageiro do Mar | Triton / Herald of the Sea | `tidal_wave` | `hippocampus` | `conch_horn`, `tidal_lore` | 🔱 |
| `demeter` | 5 | Deméter / Deusa das Colheitas | Demeter / Goddess of the Harvest | `divine_harvest` | `triptolemus_dragon` | `golden_harvest`, `eleusinian_mysteries` | 🌾 |
| `helios` | 6 | Hélio / O Sol | Helios / The Sun | `sun_chariot` | `phoenix` | `solar_fire`, `all_seeing_sun` | ☀️ |
| `nike` | 6 | Nice / Deusa da Vitória | Nike / Goddess of Victory | `winged_victory` | `griffin` | `laurels_of_victory`, `golden_wings` | 👑 |
| `nemesis` | 6 | Nêmesis / Deusa da Retribuição | Nemesis / Goddess of Retribution | `retribution` | `erinys` | `balance_of_fate`, `wrath_of_nemesis` | 🗡️ |

O `icon` é dado (o HUD usa o atlas) e não precisa de `EMOJI_GLYPHS`. Cuidado só com o `emojiIcon` de `src/ui/icons.ts`
(emoji de fala dos roteiros → retrato): ele monta o mapa com os deuses maiores, depois os menores, depois as unidades, e o
primeiro que chega fica. Um deus menor novo com o emoji de uma **unidade** "roubaria" o ícone de fala dela; por isso o Éolo
usa 🌬️, e não 🕊️ (o 🕊️ continua sendo o Pégaso). Emoji repetido de outro **deus** (🌙, 🔱, ☀️, 👑, 🗡️) não muda nada: o
deus de hoje vem antes. Os emoji das 12 criaturas também já têm dono antes delas (heróis, titãs, criaturas de hoje).

Descrições (`desc`, sem emoji):

| id | PT | EN |
|---|---|---|
| pan | Pânico põe o inimigo em fuga; Sátiros; caça e fazendas fartas e criaturas mais rápidas. | Panic sends the enemy fleeing; Satyrs; plentiful hunting and farms, faster creatures. |
| hecate | Encruzilhada leva um grupo de unidades a outro ponto; Empusas; mais visão, Favor e ataque mítico. | Crossroads carries a group of units elsewhere; Empusae; more sight, Favor and mythic attack. |
| persephone | Primavera faz os mortos da área voltarem como Sombras; Lâmpades; Sombras mais fortes, fazendas e regeneração. | Spring raises the dead of an area as Shades; Lampads; stronger Shades, farms and regeneration. |
| aeolus | Vendaval empurra e freia os inimigos e para os navios; Harpias; navios e voadoras mais rápidos e fortes. | Gale pushes and slows enemies and stops ships; Harpies; faster and stronger ships and flyers. |
| triton | Maremoto arrasa tropas, navios e a costa; Hipocampos; navios mais fortes e baratos e pesca farta. | Tidal Wave crushes troops, ships and the coast; Hippocampi; stronger, cheaper ships and rich fishing. |
| demeter | Colheita Divina acelera toda a coleta; Dragões de Triptólemo; mais comida, população e cidadãos resistentes. | Divine Harvest speeds up all gathering; Dragons of Triptolemus; more food, population and hardier citizens. |
| helios | Carro do Sol risca uma faixa de fogo; Fênix; unidades de fogo mais fortes, visão e torres de maior alcance. | Sun Chariot scorches a strip of fire; Phoenixes; stronger fire units, sight and longer-ranged towers. |
| nike | Vitória Alada dá +30% de ataque a todo o exército; Grifos; militares mais fortes e cavalaria mais rápida. | Winged Victory gives your whole army +30% attack; Griffins; stronger military and faster cavalry. |
| nemesis | Retribuição devolve metade do dano sofrido; Erínias; militares mais resistentes e heróis mais fortes. | Retribution returns half the damage taken; Erinyes; sturdier military and stronger heroes. |

### Os 9 poderes novos (`POWERS`, `src/core/data/gods.ts`; números em `src/core/sim/divine.ts`)

| id | PT | EN | `targeting` | `radius` | `icon` (dado) | Era do poder | Mecânica exata (na Era do poder; escala na tabela seguinte) |
|---|---|---|---|---|---|---|---|
| `panic` | Pânico | Panic | `area` | 7 | ☠️ | 4 | Inimigos na área (não heróis, Titãs, navios, imóveis nem guarnecidos) recebem ordem `move` 8 tiles para fora do centro e `fearUntil = tick + 8 s`: não atacam. Sem alvo, recusa (`err.noEnemiesHere`) e não gasta. |
| `crossroads` | Encruzilhada | Crossroads | `group` | — | 👁️ | 4 | As unidades de `ids` (suas, vivas, fora de edifício; sem navios, Titãs, imóveis ou transportes) somando até 20 de população (cada uma conta `max(1, pop)`) vão para tiles livres em espiral (raio 6, `centerFrame` do ponto) em volta do ponto. O ponto precisa estar explorado por você (`visibility > 0`) e ser terra passável; senão `err.crossroadsDest`. Ninguém pode ir: `err.crossroadsNoUnits`. Ordens zeradas (ficam `idle`). |
| `spring` | Primavera | Spring | `area` | 6 | 💚 | 4 | `TimedEffect` `spring` de 20 s: todo soldado humano não herói (tags `human` + `military`) de qualquer jogador que morrer na área (morte por alguém: `killerOwner ≠ −1`, num tile caminhável) vira uma `shade` sua, agressiva; até 12 por lançamento (`count`). Sempre gasta. |
| `gale` | Vendaval | Gale | `area` | 8 | 🌩️ | 5 | No lançamento: inimigos na área (não Titãs, navios nem imóveis) recuam até 3 tiles para fora, tile a tile, parando no primeiro tile não passável da camada deles; seus edifícios completos na área recuperam 20 % da vida máxima; os `sun_chariot` inimigos com centro na área são apagados. `TimedEffect` `gale` de 12 s: inimigos na área andam a 50 % e navios inimigos param (velocidade 0). Sempre gasta. |
| `tidal_wave` | Maremoto | Tidal Wave | `area` | 7 | 🌊 | 5 | Dano direto (`applyDamage`, sem armadura): 120 em cada unidade inimiga na área (240 se tiver a tag `ship`), 300 em cada edifício inimigo com centro na área. Sem alvo, recusa (`err.noEnemiesHere`). |
| `divine_harvest` | Colheita Divina | Divine Harvest | `global` | — | 🌽 | 5 | `harvestUntil = tick + 45 s`: toda coleta sua (nós, fazendas, pesca) × 1,5. |
| `sun_chariot` | Carro do Sol | Sun Chariot | `area` | 8 | ☀️ | 6 | `TimedEffect` `sun_chariot` de 6 s: faixa de meio-comprimento 8 e meia-largura 1,5 centrada no ponto, direção = do seu Centro Cívico mais perto até o ponto (empate: menor id; sem CC ou a < 1 tile dele: do ponto para o centro do mapa; tudo zero: (1, 0)). A cada 5 ticks: 30 de dano em cada unidade inimiga na faixa e 80 em cada edifício inimigo cujo centro está na faixa alargada pela metade do maior lado do edifício. |
| `winged_victory` | Vitória Alada | Winged Victory | `global` | — | 👑 | 6 | `nikeUntil = tick + 30 s`: ataque das suas unidades × 1,3 (em `computeDamage`). |
| `retribution` | Retribuição | Retribution | `global` | — | 🗡️ | 6 | `nemesisUntil = tick + 20 s`: quando uma unidade inimiga causa dano numa unidade sua, 50 % desse dano volta para a unidade atacante (sem ricochete). |

Descrições (`desc`) dos poderes:

| id | PT | EN |
|---|---|---|
| panic | Os inimigos na área fogem e não atacam por 8 segundos (Titãs, heróis e navios resistem). | Enemies in the area flee and cannot attack for 8 seconds (Titans, heroes and ships resist). |
| crossroads | Leva as unidades selecionadas (até 20 de população) a um ponto já explorado do mapa. | Carries the selected units (up to 20 population) to an already explored point of the map. |
| spring | Por 20 segundos, todo soldado humano que morrer na área volta como uma Sombra sua (até 12). | For 20 seconds, every human soldier who dies in the area returns as one of your Shades (up to 12). |
| gale | Empurra os inimigos para fora da área; por 12 segundos eles andam pela metade e os navios param. Seus edifícios na área recuperam 20% da vida. | Pushes enemies out of the area; for 12 seconds they move at half speed and ships stop. Your buildings in the area regain 20% health. |
| tidal_wave | Uma onda gigante causa 120 de dano às tropas, 240 aos navios e 300 aos edifícios inimigos na área. | A giant wave deals 120 damage to troops, 240 to ships and 300 to enemy buildings in the area. |
| divine_harvest | Por 45 segundos, seus cidadãos e barcos coletam 50% mais rápido. | For 45 seconds, your citizens and boats gather 50% faster. |
| sun_chariot | O carro de Hélio risca uma faixa de fogo de 16 tiles, da sua cidade para o ponto, queimando inimigos por 6 segundos. | Helios' chariot scorches a 16-tile strip of fire, from your city towards the point, burning enemies for 6 seconds. |
| winged_victory | Todas as suas unidades ganham +30% de ataque por 30 segundos. | All your units gain +30% attack for 30 seconds. |
| retribution | Por 20 segundos, metade do dano que suas unidades sofrem volta para quem atacou. | For 20 seconds, half the damage your units take goes back to the attacker. |

As descrições dão os números de base; a força da Era aparece numa linha a mais da dica do poder no HUD (`power.scale`).

### Escala dos poderes por Era (`s = powerScale(state, player, id)`; s = 1 com `eraMythOn` desligado)

| Poder | Era do poder | O que escala | Fórmula |
|---|---|---|---|
| `bolt` (Raio) | 0 | fração da vida do Titã | `min(0.75, 0.5 × s)` (não Titã: morre, como hoje) |
| `lure` (Isca) | 0 | comida da pedra | `round(800 × s)` |
| `sentinel` (Sentinelas) | 0 | número de estátuas | `min(8, round(4 × s))`, distribuídas nos 4 cantos em rodízio |
| `restoration` | 1 | raio | `8 × s` (o efeito `heal` leva o raio no `data`) |
| `ceasefire` | 1 | duração | `30 s × s` |
| `pestilence` | 1 | duração | `60 s × s` |
| `oracle` | 2 | duração | `60 s × s` |
| `bronze` | 2 | duração | `45 s × s` |
| `curse` | 2 | vítimas | `round(8 × s)` |
| `lightning_storm` | 3 | dano por raio | `200 × mult` (`mult = s` no `TimedEffect`) |
| `plenty` (Cornucópia) | 3 | renda por segundo | `1,5 × s` com a Era **atual** do dono (cada segundo) |
| `earthquake` | 3 | dano por pulso | `75 × mult` (edifício) e `3 × mult` (unidade) |
| `panic` | 4 | duração | `8 s × s` |
| `crossroads` | 4 | população levada | `round(20 × s)` |
| `spring` | 4 | duração | `20 s × s` |
| `gale` | 5 | duração | `12 s × s` |
| `tidal_wave` | 5 | dano | `120 / 240 / 300 × s` |
| `divine_harvest` | 5 | duração | `45 s × s` |
| `sun_chariot` | 6 | dano | `30 / 80 × mult` |
| `winged_victory` | 6 | duração | `30 s × s` |
| `retribution` | 6 | duração | `20 s × s` |

Exemplos de `s`: Raio usado na Era VIII (age 7): `1 + 0,15 × 7 = 2,05` → Titã perde 75 %. Restauração (Era II, age 1)
usada na Era V (age 4): `1,45` → raio 11,6. Pânico na Era V: `1` (8 s); na VIII: `1,45` (11,6 s).

### As 12 criaturas novas (`src/core/data/units.ts`, todas `cls: 'myth'`)

Colunas: custo · vida · ataque (tipo) · armadura hack/pierce/crush · alcance · velocidade · visão · treino (s) · pop · raio ·
tags · bônus · área (`splash`) · extras. Intervalo de ataque = o da classe `myth` (1,5 s).

| id | PT (sing. / plural) | EN (sing. / plural) | Era (`age`) | `god` | `building` · tecla | custo | vida | ataque | armadura | alc. | vel. | visão | treino | pop | raio | tags | bônus | área | extras |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `satyr` | Sátiro / Sátiros | Satyr / Satyrs | V (4) | pan | temple · Z | food 140, favor 22 | 300 | 18 pierce | .2/.25/.15 | 5 | 3.2 | 9 | 22 | 3 | 0.38 | myth, military, ranged, skirmisher | human 1.3, archer 1.5 | — | — |
| `empusa` | Empusa / Empusas | Empusa / Empusae | V (4) | hecate | temple · Z | gold 160, favor 26 | 420 | 26 hack | .25/.3/.2 | 0.7 | 3.8 | 9 | 26 | 4 | 0.38 | myth, military | human 1.3 | — | `special: 'drain'` |
| `lampad` | Lâmpade / Lâmpades | Lampad / Lampads | V (4) | persephone | temple · Z | wood 150, favor 28 | 360 | 20 pierce | .2/.25/.15 | 6 | 2.8 | 10 | 28 | 4 | 0.36 | myth, military, ranged, fire | human 1.3, building 1.5 | 1.0 | — |
| `harpy` | Harpia / Harpias | Harpy / Harpies | VI (5) | aeolus | temple · Z | food 120, favor 22 | 240 | 14 hack | .15/.2/.1 | 0.7 | 5.2 | 12 | 20 | 2 | 0.34 | myth, military, flying | archer 1.6, siege 1.6 | — | `flying: true` |
| `hippocampus` | Hipocampo / Hipocampos | Hippocampus / Hippocampi | VI (5) | triton | shipyard · Z | food 160, favor 24 | 450 | 22 hack | .2/.3/.15 | 0.8 | 4.0 | 10 | 24 | 3 | 0.5 | myth, military, ship | ship 1.8 | — | `naval: true` |
| `triptolemus_dragon` | Dragão de Triptólemo / Dragões de Triptólemo | Dragon of Triptolemus / Dragons of Triptolemus | VI (5) | demeter | temple · Z | gold 220, favor 34 | 520 | 24 hack | .25/.3/.2 | 3 | 3.6 | 11 | 34 | 5 | 0.5 | myth, military, ranged, flying, fire | human 1.3, building 1.5 | 1.4 | `flying: true` |
| `phoenix` | Fênix / Fênix | Phoenix / Phoenixes | VII (6) | helios | temple · Z | gold 250, favor 40 | 480 | 28 pierce | .25/.3/.2 | 5 | 4.2 | 12 | 36 | 5 | 0.45 | myth, military, ranged, flying, fire | human 1.3 | 1.0 | `flying: true`, `special: 'rebirth'` |
| `griffin` | Grifo / Grifos | Griffin / Griffins | VII (6) | nike | temple · Z | food 220, favor 32 | 560 | 30 hack | .3/.3/.2 | 0.8 | 4.6 | 12 | 30 | 4 | 0.48 | myth, military, flying | flying 2, cavalry 1.5 | — | `flying: true` |
| `erinys` | Erínia / Erínias | Erinys / Erinyes | VII (6) | nemesis | temple · Z | gold 200, favor 34 | 500 | 30 hack | .3/.35/.2 | 0.8 | 3.8 | 10 | 30 | 4 | 0.4 | myth, military | hero 2, human 1.3 | — | — |
| `scylla` | Escila / Escilas | Scylla / Scyllas | III (2) | poseidon | shipyard · X | food 300, favor 36 | 900 | 34 hack | .3/.4/.25 | 1.2 | 2.4 | 10 | 36 | 5 | 0.7 | myth, military, ship | ship 2, human 1.3 | 1.4 | `naval: true` |
| `ceto` | Ceto / Cetos | Ceto / Cetos | V (4) | poseidon | shipyard · C | gold 380, favor 45 | 1400 | 50 crush | .4/.5/.3 | 1.2 | 2.2 | 10 | 44 | 6 | 0.75 | myth, military | ship 2.5, building 2, human 1.3 | 1.6 | `amphibious: true` |
| `talos` | Talos / Talos | Talos / Taloi | VII (6) | hephaestus | temple · Z | gold 450, favor 45 | 2000 | 75 crush | .55/.65/.35 | 1.0 | 2.0 | 10 | 45 | 6 | 0.65 | myth, military | building 3 | 1.2 | substitui o Colosso (`MYTH_UPGRADES`) |

Descrições (`desc`):

| id | PT | EN |
|---|---|---|
| satyr | Seguidor de Pã: atira dardos de longe e caça arqueiros. | Follower of Pan: hurls javelins from range and hunts archers. |
| empusa | Demônio veloz de Hécate: cura 30% do dano que causa. | Hecate's swift demon: heals 30% of the damage it deals. |
| lampad | Ninfa do submundo com tochas: fogo em área contra tropas e edifícios. | Underworld nymph with torches: area fire against troops and buildings. |
| harpy | Voa rápido sobre tudo e ataca arqueiros e artilharia; só tropas à distância e outros voadores a acertam. | Flies fast over anything and strikes archers and artillery; only ranged troops and other flyers can hit it. |
| hippocampus | Cavalo-marinho de Tritão: nada rápido e afunda barcos e galeras. Treinado no Estaleiro. | Triton's sea-horse: swims fast and sinks boats and galleys. Trained at the Shipyard. |
| triptolemus_dragon | Serpente alada do carro de Triptólemo: sopra fogo em área de perto. | Winged serpent of Triptolemus' chariot: breathes area fire at close range. |
| phoenix | Ave de fogo de Hélio: atira chamas e, na primeira morte, renasce das cinzas com metade da vida. | Helios' firebird: shoots flames and, on its first death, rises from its ashes with half its health. |
| griffin | Leão alado de Nice: caça outras criaturas voadoras no ar e a cavalaria no chão. | Nike's winged lion: hunts other flying creatures in the air and cavalry on the ground. |
| erinys | Fúria de Nêmesis: persegue os poderosos, com dano dobrado contra heróis. | Nemesis' Fury: hunts down the mighty, with double damage against heroes. |
| scylla | Monstro de seis cabeças do estreito: devora tripulações, dano em área contra navios. Treinada no Estaleiro. | Six-headed monster of the strait: devours crews, area damage against ships. Trained at the Shipyard. |
| ceto | Monstro marinho primordial: nada e anda em terra, esmaga navios e a costa. Treinado no Estaleiro. | Primordial sea monster: swims and walks on land, crushing ships and the coast. Trained at the Shipyard. |
| talos | Gigante de bronze de Hefesto, o Colosso da Era Industrial: mais forte, incandescente (dano em área) e arrasa edifícios. | Hephaestus' bronze giant, the Colossus of the Industrial Era: stronger, red-hot (area damage), razes buildings. |

`icon` (dado; o HUD usa o atlas): satyr 🏹 · empusa 👻 · lampad 🔥 · harpy 🕊️ · hippocampus 🌊 · triptolemus_dragon 🔥 ·
phoenix ☀️ · griffin 🦁 · erinys 🗡️ · scylla 🐍 · ceto 🌊 · talos 🗿.

Ordem nos `trains` (a IA treina **a última** treinável do Templo): no fim de `temple.trains`, depois de `'cerberus'`:
`'satyr', 'empusa', 'lampad', 'harpy', 'triptolemus_dragon', 'phoenix', 'griffin', 'erinys', 'talos'`. No fim de
`shipyard.trains` (depois do que E4/E5 puseram, inclusive o `merchant_ship`): `'scylla', 'ceto', 'hippocampus'` — também
em Era crescente (III, V, VI), porque `trainSeaMyths` treina a última treinável: com `'hippocampus'` antes do `'ceto'`, o
Poseidon com Tritão nunca treinaria Hipocampos.

### Pesquisas dos 9 deuses novos (`src/core/data/techs.ts`, `building: 'temple'`, `god` = o deus)

| id | deus | `age` | PT | EN | custo | tempo | efeitos | desc PT | desc EN |
|---|---|---|---|---|---|---|---|---|---|
| `rustic_flute` | pan | 4 | Flauta Silvestre | Rustic Flute | food 400, favor 45 | 55 | gather hunt ×1.3; gather farm ×1.15 | Caça +30% e fazendas +15%. | Hunting +30% and farms +15%. |
| `wild_hooves` | pan | 4 | Cascos Selvagens | Wild Hooves | gold 400, favor 45 | 55 | unit tags myth speed ×1.15; unit types satyr attack ×1.2 | Criaturas míticas +15% de velocidade e Sátiros +20% de ataque. | Mythic creatures +15% speed and Satyrs +20% attack. |
| `torch_of_hecate` | hecate | 4 | Tocha de Hécate | Torch of Hecate | gold 400, favor 45 | 55 | player los +3; unit tags myth attack ×1.1 | Visão +3 para tudo e criaturas míticas +10% de ataque. | Sight +3 for everything and mythic creatures +10% attack. |
| `crossroads_rites` | hecate | 4 | Ritos da Encruzilhada | Rites of the Crossroads | gold 450, favor 50 | 60 | player favorRate ×1.25; unit types empusa hp ×1.2 | Favor +25% e Empusas +20% de vida. | Favor +25% and Empusae +20% health. |
| `pomegranate` | persephone | 4 | Romã do Submundo | Pomegranate of the Underworld | food 400, favor 45 | 55 | unit types shade hp ×2; unit types shade attack ×2; player favorRate ×1.15 | Sombras com o dobro de vida e de ataque; Favor +15%. | Shades with double health and attack; Favor +15%. |
| `eternal_spring` | persephone | 4 | Primavera Eterna | Eternal Spring | food 450, favor 50 | 60 | gather farm ×1.25; player regen +0.5 | Fazendas +25% e unidades regeneram 0,5 de vida/s. | Farms +25% and units regenerate 0.5 health/s. |
| `bag_of_winds` | aeolus | 5 | Odre dos Ventos | Bag of Winds | wood 450, favor 50 | 60 | unit tags ship speed ×1.2; unit tags flying speed ×1.15 | Navios +20% e voadoras +15% de velocidade. | Ships +20% and flyers +15% speed. |
| `storm_lord` | aeolus | 5 | Senhor das Tempestades | Lord of Storms | gold 450, favor 50 | 60 | unit tags flying hp ×1.2; unit tags flying attack ×1.2 | Criaturas voadoras +20% de vida e de ataque. | Flying creatures +20% health and attack. |
| `conch_horn` | triton | 5 | Concha de Tritão | Triton's Conch | gold 450, favor 50 | 60 | unit tags ship attack ×1.15; unit types hippocampus hp ×1.2 | Navios +15% de ataque e Hipocampos +20% de vida. | Ships +15% attack and Hippocampi +20% health. |
| `tidal_lore` | triton | 5 | Saber das Marés | Lore of the Tides | wood 450, favor 50 | 60 | gather fish ×1.25; cost tags ship ×0.9 | Pesca +25% e navios 10% mais baratos. | Fishing +25% and ships 10% cheaper. |
| `golden_harvest` | demeter | 5 | Colheita Dourada | Golden Harvest | food 450, favor 50 | 60 | gather food ×1.15; gather farm ×1.2 | Comida +15% e fazendas +20%. | Food +15% and farms +20%. |
| `eleusinian_mysteries` | demeter | 5 | Mistérios de Elêusis | Eleusinian Mysteries | gold 450, favor 50 | 60 | player popCap +20; unit types villager hp ×1.2 | População +20 e cidadãos +20% de vida. | Population +20 and citizens +20% health. |
| `solar_fire` | helios | 6 | Fogo Solar | Solar Fire | gold 500, favor 55 | 65 | unit tags fire attack ×1.2; unit types phoenix hp ×1.2 | Unidades de fogo +20% de ataque e Fênix +20% de vida. | Fire units +20% attack and Phoenixes +20% health. |
| `all_seeing_sun` | helios | 6 | Sol que Tudo Vê | All-Seeing Sun | gold 500, favor 55 | 65 | player los +3; building types tower, fortress range +1 | Visão +3; torres e fortalezas +1 de alcance. | Sight +3; towers and fortresses +1 range. |
| `laurels_of_victory` | nike | 6 | Louros da Vitória | Laurels of Victory | food 500, favor 55 | 65 | unit tags military attack ×1.1 | Militares +10% de ataque. | Military +10% attack. |
| `golden_wings` | nike | 6 | Asas Douradas | Golden Wings | gold 500, favor 55 | 65 | unit types griffin hp ×1.2; unit tags cavalry speed ×1.1 | Grifos +20% de vida e cavalaria +10% de velocidade. | Griffins +20% health and cavalry +10% speed. |
| `balance_of_fate` | nemesis | 6 | Balança do Destino | Scales of Fate | gold 500, favor 55 | 65 | unit tags military hp ×1.1 | Militares +10% de vida. | Military +10% health. |
| `wrath_of_nemesis` | nemesis | 6 | Ira de Nêmesis | Wrath of Nemesis | gold 500, favor 55 | 65 | unit types erinys attack ×1.25; unit tags hero attack ×1.15 | Erínias +25% de ataque e heróis +15% de ataque. | Erinyes +25% attack and heroes +15% attack. |

`icon` (dado): o mesmo do deus (`rustic_flute` e `wild_hooves` 🦌, `torch_of_hecate` e `crossroads_rites` 🌙, …).
`gather fish` existe desde a E4 (`Effect` gather com `'fish'`); `gunpowder`, `fire`, `ship` são tags da E3/E4.

### Bênçãos do Templo (geradas por `blessings()` em `techs.ts`)

| id | Era | `age` | nome PT | nome EN | custo | tempo | `prereq` |
|---|---|---|---|---|---|---|---|
| `blessing2` | II | 1 | Bênção do Olimpo II | Blessing of Olympus II | gold 140, favor 30 | 36 | — |
| `blessing3` | III | 2 | Bênção do Olimpo III | Blessing of Olympus III | gold 200, favor 40 | 42 | `blessing2` |
| `blessing4` | IV | 3 | Bênção do Olimpo IV | Blessing of Olympus IV | gold 260, favor 50 | 48 | `blessing3` |
| `blessing5` | V | 4 | Bênção do Olimpo V | Blessing of Olympus V | gold 320, favor 60 | 54 | `blessing4` |
| `blessing6` | VI | 5 | Bênção do Olimpo VI | Blessing of Olympus VI | gold 380, favor 70 | 60 | `blessing5` |
| `blessing7` | VII | 6 | Bênção do Olimpo VII | Blessing of Olympus VII | gold 440, favor 80 | 66 | `blessing6` |
| `blessing8` | VIII | 7 | Bênção do Olimpo VIII | Blessing of Olympus VIII | gold 500, favor 90 | 72 | `blessing7` |

Fórmulas (k = `age`): ouro 80 + 60·k, favor 20 + 10·k, tempo 30 + 6·k. Efeitos de cada uma (match `{ types: BLESSED_TYPES }`):
vida ×1,2; ataque ×1,2; `armor.hack`, `armor.pierce`, `armor.crush` +0,02. `BLESSED_TYPES` = todo `UNITS` com a tag `myth`
ou `hero` e **sem** a tag `titan` (inclui Pégaso, Sentinela, Sombra e o Rei). desc PT: `Criaturas míticas e heróis +20% de
vida e de ataque e +0,02 de armadura (os Titãs não recebem).` EN: `Mythic creatures and heroes +20% health and attack and
+0.02 armor (Titans excluded).`

### Talos, Titãs, heróis e deuses maiores

- `MYTH_UPGRADES = { colossus: { to: 'talos', age: 6 } }` (`src/core/data/units.ts`).
- `src/core/constants.ts`: `TITAN_ERA_HP = 2`, `TITAN_ERA_ATTACK = 1.5` (só com `eraMythOn`).
- `oceanus`: acrescente `amphibious: true` (o resto igual).
- Heróis (conferência, nada muda): `jason 0`, `odysseus 1`, `heracles 2`, `achilles 3`, `perseus 4`; Titãs `age: ERA_TITANS`.
- Bônus de pólvora (no **fim** de `bonuses`) e perks (inseridos **antes** do último item, o "Poder: …"):

| Deus | Effect | perk PT | perk EN |
|---|---|---|---|
| zeus | `{ type: 'unit', match: { tags: ['gunpowder'] }, stat: 'attack', mult: 1.1 }` | Unidades de pólvora +10% de ataque | Gunpowder units +10% attack |
| poseidon | `{ type: 'cost', match: { tags: ['gunpowder'] }, mult: 0.9 }` | Unidades de pólvora 10% mais baratas; Escila no Estaleiro desde a Era Helenística e Ceto desde a Era da Pólvora | Gunpowder units 10% cheaper; Scylla at the Shipyard from the Hellenistic Era and Ceto from the Gunpowder Era |
| hades | `{ type: 'unit', match: { tags: ['gunpowder'] }, stat: 'hp', mult: 1.1 }` | Unidades de pólvora +10% de vida | Gunpowder units +10% health |

(O Poseidon ganha **um** perk com os dois trechos separados por ponto e vírgula; os outros, um perk cada.)

### Arte provisória (alias) e ícones

`UNIT_ART_ALIAS` (`src/render/art/alias.ts`, da E2), acrescente sem tirar nada:

```ts
  // E6: criaturas das Eras V–VII e as navais de Poseidon (arte própria na E8)
  satyr: 'peltast', empusa: 'shade', lampad: 'medusa', harpy: 'pegasus', hippocampus: 'centaur', triptolemus_dragon: 'manticore',
  phoenix: 'chimera', griffin: 'nemean_lion', erinys: 'cerberus', scylla: 'hydra', ceto: 'cyclops', talos: 'colossus',
```

Voar, nadar e a sombra continuam pelo tipo de verdade (`UNITS[type].flying` no renderizador); o alias só troca o desenho.

`POWER_ICONS` (`scripts/bake/hud/catalog.mjs`), no fim:

```js
  // E6: poderes dos deuses das Eras V–VII (provisórios com objetos que já existem; a E8 desenha os próprios)
  panic: O('salpinx'), crossroads: O('compass'), spring: O('kylix'), gale: O('storm_cloud'), tidal_wave: O('trident'),
  divine_harvest: O('sheaf'), sun_chariot: O('wheel'), winged_victory: O('crown'), retribution: O('scales'),
```

`TECH_ICONS`, no fim:

```js
  // E6: pesquisas dos deuses das Eras V–VII e as Bênçãos do Templo (blessing2…8 usam o ícone `blessing`)
  rustic_flute: O('salpinx'), wild_hooves: O('antlers'), torch_of_hecate: O('tripod', { glow: true }), crossroads_rites: O('altar'),
  pomegranate: O('ambrosia'), eternal_spring: O('olive_branch'), bag_of_winds: O('satchel'), storm_lord: O('storm_cloud'),
  conch_horn: O('salpinx'), tidal_lore: O('trident'), golden_harvest: O('sheaf'), eleusinian_mysteries: O('hydria'),
  solar_fire: O('chalice'), all_seeing_sun: O('eye'), laurels_of_victory: O('crown'), golden_wings: O('sandal'),
  balance_of_fate: O('scales'), wrath_of_nemesis: O('divine_sword'), blessing: O('altar', { }, { margin: 0.05 }),
```

`GODS`: acrescente no fim `'pan', 'hecate', 'persephone', 'aeolus', 'triton', 'demeter', 'helios', 'nike', 'nemesis'`.
Os ícones `unit/<criatura>` vêm do alias (`ic.unit` da E2 resolve `unit/<alias>`); nada a acrescentar para eles.

### Textos de interface novos (`src/i18n/strings.ts`, nas duas tabelas, sem emoji)

| Chave | PT | EN |
|---|---|---|
| `msg.powerTarget.group` | clique no destino das unidades selecionadas | click the destination of the selected units |
| `msg.selectGroup` | Selecione as suas unidades que vão atravessar a Encruzilhada. | Select your units that will cross the Crossroads. |
| `err.crossroadsDest` | Destino inexplorado ou bloqueado. | Destination unexplored or blocked. |
| `err.crossroadsNoUnits` | Nenhuma unidade selecionada pode atravessar (navios, Titãs e imóveis não vão). | No selected unit can cross (ships, Titans and immobile units cannot). |
| `err.noEnemiesHere` | Nenhum inimigo na área. | No enemies in the area. |
| `err.classicMyth` | Este cenário usa a mitologia clássica: sem Bênçãos. | This scenario uses the classic mythology: no Blessings. |
| `err.mythUpgraded` | {name} viraram {to} nesta Era. | {name} became {to} in this Era. |
| `power.scale` | Força da Era: +{pct}% | Era strength: +{pct}% |
| `ev.reborn` | {name} renasceu das cinzas! | {name} rose from its ashes! |
| `ev.mythUpgrade` | Seus {from} viraram {to}. | Your {from} became {to}. |

Antes de criar, confira com `grep -n "'err.noEnemiesHere'\|'power.scale'" src/i18n/strings.ts` que nenhuma já existe.

### Atalhos (respeitam `tests/data.test.ts` e o CLAUDE.md: nada de A, R, U)

| Edifício | Tecla | Unidades |
|---|---|---|
| `temple` | `Z` | todas as criaturas de deus menor (as de hoje e as 9 novas) e `talos` |
| `temple` | `X` | `cerberus` (como hoje) |
| `shipyard` | `Z` / `X` / `C` | `hippocampus` / `scylla` / `ceto` (o Estaleiro da E4 usa Q, W, E; o navio mercante da E5 pega `M`, a 1ª livre de M, C, V, B — `C` nunca chega a ele) |

---

## Passo a passo

Rode `npm run -s typecheck` no fim de cada passo. Entre passos os testes podem ficar vermelhos; o fim de cada bloco diz
quais têm de estar verdes.

### Bloco 0 — Preparação

- [ ] **0.1. Pré-condições.** Todos estes comandos precisam achar a linha (senão pare e avise):
  ```sh
  grep -n "export function isScenarioConfig" src/core/sim/restrictions.ts      # E1
  grep -n "export function grantStartingEras" src/core/sim/game.ts             # E1
  grep -n "export const ROMAN" src/core/data/techs.ts                          # E1
  grep -n "UNIT_ART_ALIAS" src/render/art/alias.ts                             # E2
  grep -n "export function applyEvolution" src/core/sim/lines.ts               # E3
  grep -n "export function trainChoices" src/core/sim/lines.ts                 # E3
  grep -n "'evolve'" src/render/fx/types.ts                                    # E3
  grep -n "export function navalOn" src/core/sim/restrictions.ts               # E4
  grep -n "export type Layer" src/core/map/naval.ts                            # E4
  grep -n "shipyard:" src/core/data/buildings.ts                               # E4
  grep -n "export function canBoard" src/core/sim/naval.ts                     # E4
  grep -n "ships:" src/core/sim/ai.ts                                          # E4 (campo Snapshot.ships)
  grep -n "function manageNavy" src/core/sim/ai.ts                             # E4
  grep -c "minorGod: true" src/core/data/ages.ts                               # deve dar 3
  grep -n "export function powerReady" src/core/sim/powers.ts                  # E7 (vem antes da E6)
  grep -n "merchant_ship" src/core/data/buildings.ts                           # E5 (no shipyard.trains)
  ```
- [ ] **0.2. O "antes"** (não commitar):
  ```sh
  npx tsx scripts/missions.ts > /tmp/e6-missions-antes.txt 2>&1
  npm run balance 35 1,2,3 > /tmp/e6-balance35-antes.txt 2>&1
  npm run balance 60 1,2,3 > /tmp/e6-balance-antes.txt 2>&1
  npm run smoke 20 42 > /tmp/e6-smoke-antes.txt 2>&1
  ```

### Bloco A — Tipos, dados e textos

- [ ] **A1. `src/core/types.ts`.**
  - `UnitDef`: depois do que a E3/E4 acrescentaram (`attackInterval?`, `naval?`, `capacity?`), numa linha própria:
    `amphibious?: boolean;   // E6: anda em terra e nada (camada 'amphibious', src/core/map/naval.ts): Ceto, Oceano`.
  - `UnitDef.special`: troque `special?: 'heads' | 'petrify'` por `special?: 'heads' | 'petrify' | 'drain' | 'rebirth'`.
  - `TechDef`: depois de `evolve?` (da E3), `blessing?: boolean;   // E6: Bênção do Templo (só com eraMythOn)`.
  - `PowerTargeting`: acrescente `| 'group'` (`'unit' | 'area' | 'building' | 'global' | 'place' | 'group'`).
  - `Unit`: depois de `hpFloor?: number;`:
    ```ts
    fearUntil?: number;                                  // E6: Pânico — até este tick a unidade não ataca (canTarget)
    reborn?: boolean;                                    // E6: a Fênix já renasceu uma vez
    ```
  - `Player`: depois de `revealUntil: number; bronzeUntil: number;`, numa linha própria:
    `harvestUntil?: number; nikeUntil?: number; nemesisUntil?: number;   // E6: Colheita Divina, Vitória Alada, Retribuição (tick final; ausente = 0)`.
  - `TimedEffect`: troque por
    ```ts
    export interface TimedEffect { type: string; owner: number; until: number; x?: number; y?: number; data?: number; mult?: number; dx?: number; dy?: number; count?: number }
    // E6: mult = escala do poder na hora do uso (ausente = 1); dx/dy = direção unitária (Carro do Sol); count = Sombras já erguidas (Primavera)
    ```
  - `GameConfig`: depois de `naval?` (da E4), `eraMyth?: boolean;   // E6: escala dos poderes, Bênçãos e Titãs reforçados; padrão ligado fora de cenário`.
  - `Command`: na variante `power`, acrescente `ids?: number[]` (`… x?: number; y?: number; targetId?: number; ids?: number[] }`).
- [ ] **A2. `src/core/constants.ts`.** Perto de `WONDER_VICTORY_SECONDS`:
  ```ts
  /** E6: os Titãs só chegam na Era VIII (Portal) diante de exércitos de pólvora e aço: vida e ataque multiplicados fora de cenário. */
  export const TITAN_ERA_HP = 2;
  export const TITAN_ERA_ATTACK = 1.5;
  ```
  O `SIM_VERSION` sobe no passo C9.
- [ ] **A3. `src/core/data/ages.ts`.** Nas Eras de id 4, 5 e 6, troque `minorGod: false` por `minorGod: true` (o comentário
  "a E6 liga" sai). A 7 continua `false`. *Confira:* `grep -c "minorGod: true" src/core/data/ages.ts` dá 6.
- [ ] **A4. `src/core/data/gods.ts`.**
  1. No fim de `POWERS` (antes do `};`):
     ```ts
     // ---- E6: poderes dos deuses menores das Eras V–VII (docs/eras/E6-mitologia.md; números em src/core/sim/divine.ts) ----
     panic: { id: 'panic', name: 'Pânico', icon: '☠️', targeting: 'area', radius: 7, desc: 'Os inimigos na área fogem e não atacam por 8 segundos (Titãs, heróis e navios resistem).' },
     crossroads: { id: 'crossroads', name: 'Encruzilhada', icon: '👁️', targeting: 'group', desc: 'Leva as unidades selecionadas (até 20 de população) a um ponto já explorado do mapa.' },
     spring: { id: 'spring', name: 'Primavera', icon: '💚', targeting: 'area', radius: 6, desc: 'Por 20 segundos, todo soldado humano que morrer na área volta como uma Sombra sua (até 12).' },
     gale: { id: 'gale', name: 'Vendaval', icon: '🌩️', targeting: 'area', radius: 8, desc: 'Empurra os inimigos para fora da área; por 12 segundos eles andam pela metade e os navios param. Seus edifícios na área recuperam 20% da vida.' },
     tidal_wave: { id: 'tidal_wave', name: 'Maremoto', icon: '🌊', targeting: 'area', radius: 7, desc: 'Uma onda gigante causa 120 de dano às tropas, 240 aos navios e 300 aos edifícios inimigos na área.' },
     divine_harvest: { id: 'divine_harvest', name: 'Colheita Divina', icon: '🌽', targeting: 'global', desc: 'Por 45 segundos, seus cidadãos e barcos coletam 50% mais rápido.' },
     sun_chariot: { id: 'sun_chariot', name: 'Carro do Sol', icon: '☀️', targeting: 'area', radius: 8, desc: 'O carro de Hélio risca uma faixa de fogo de 16 tiles, da sua cidade para o ponto, queimando inimigos por 6 segundos.' },
     winged_victory: { id: 'winged_victory', name: 'Vitória Alada', icon: '👑', targeting: 'global', desc: 'Todas as suas unidades ganham +30% de ataque por 30 segundos.' },
     retribution: { id: 'retribution', name: 'Retribuição', icon: '🗡️', targeting: 'global', desc: 'Por 20 segundos, metade do dano que suas unidades sofrem volta para quem atacou.' },
     ```
  2. No fim de `MINOR_GODS`, as 9 entradas da tabela, no mesmo formato das de hoje. Exemplo exato da primeira; as outras
     seguem a tabela:
     ```ts
     // ---- E6: Eras V–VII ----
     pan: { id: 'pan', name: 'Pã', title: 'Deus dos Pastores e do Pânico', icon: '🦌', age: 4, power: 'panic', mythUnit: 'satyr', techs: ['rustic_flute', 'wild_hooves'],
       desc: 'Pânico põe o inimigo em fuga; Sátiros; caça e fazendas fartas e criaturas mais rápidas.' },
     ```
  3. Troque os três `minorGods` pelos da tabela "Pares" (os 3 primeiros pares ficam **idênticos** aos de hoje):
     ```ts
     // zeus
     minorGods: [['athena', 'hermes'], ['apollo', 'dionysus'], ['hera', 'artemis'], ['pan', 'hecate'], ['aeolus', 'demeter'], ['helios', 'nike']],
     // poseidon
     minorGods: [['ares', 'hermes'], ['aphrodite', 'dionysus'], ['hephaestus', 'artemis'], ['pan', 'persephone'], ['aeolus', 'triton'], ['helios', 'nemesis']],
     // hades
     minorGods: [['ares', 'athena'], ['aphrodite', 'apollo'], ['hephaestus', 'hera'], ['hecate', 'persephone'], ['triton', 'demeter'], ['nike', 'nemesis']],
     ```
  4. Bônus de pólvora no **fim** de cada `bonuses` e os perks (tabela "Talos, Titãs, heróis e deuses maiores"), inseridos
     antes do último item de `perks` (o "Poder: …"; o Poseidon já tem o perk naval da E4 antes dele: o novo vem depois do
     naval).
- [ ] **A5. `src/core/data/units.ts`.**
  1. Depois de `shade` e antes do comentário dos Titãs, o bloco das 12 criaturas, no formato dos de hoje. Código exato das
     duas primeiras e das três com campo especial; as outras seguem a tabela:
     ```ts
     // ---------------- Criaturas das Eras V–VII e as navais de Poseidon (E6; docs/eras/E6-mitologia.md) ----------------
     satyr: { id: 'satyr',
       name: 'Sátiro', plural: 'Sátiros', icon: '🏹', cls: 'myth',
       cost: { food: 140, favor: 22 }, hp: 300, attack: 18, attackType: 'pierce',
       armor: { hack: 0.2, pierce: 0.25, crush: 0.15 }, range: 5, speed: 3.2, los: 9, trainTime: 22, pop: 3, radius: 0.38,
       tags: ['myth', 'military', 'ranged', 'skirmisher'], bonus: { human: 1.3, archer: 1.5 }, building: 'temple', age: 4, god: 'pan', hotkey: 'Z',
       desc: 'Seguidor de Pã: atira dardos de longe e caça arqueiros.',
     },
     empusa: { id: 'empusa',
       name: 'Empusa', plural: 'Empusas', icon: '👻', cls: 'myth',
       cost: { gold: 160, favor: 26 }, hp: 420, attack: 26, attackType: 'hack',
       armor: { hack: 0.25, pierce: 0.3, crush: 0.2 }, range: 0.7, speed: 3.8, los: 9, trainTime: 26, pop: 4, radius: 0.38,
       tags: ['myth', 'military'], bonus: { human: 1.3 }, building: 'temple', age: 4, god: 'hecate', hotkey: 'Z', special: 'drain',
       desc: 'Demônio veloz de Hécate: cura 30% do dano que causa.',
     },
     hippocampus: { id: 'hippocampus',
       name: 'Hipocampo', plural: 'Hipocampos', icon: '🌊', cls: 'myth', naval: true,
       cost: { food: 160, favor: 24 }, hp: 450, attack: 22, attackType: 'hack',
       armor: { hack: 0.2, pierce: 0.3, crush: 0.15 }, range: 0.8, speed: 4.0, los: 10, trainTime: 24, pop: 3, radius: 0.5,
       tags: ['myth', 'military', 'ship'], bonus: { ship: 1.8 }, building: 'shipyard', age: 5, god: 'triton', hotkey: 'Z',
       desc: 'Cavalo-marinho de Tritão: nada rápido e afunda barcos e galeras. Treinado no Estaleiro.',
     },
     ceto: { id: 'ceto',
       name: 'Ceto', plural: 'Cetos', icon: '🌊', cls: 'myth', amphibious: true,
       cost: { gold: 380, favor: 45 }, hp: 1400, attack: 50, attackType: 'crush',
       armor: { hack: 0.4, pierce: 0.5, crush: 0.3 }, range: 1.2, speed: 2.2, los: 10, trainTime: 44, pop: 6, radius: 0.75, splash: 1.6,
       tags: ['myth', 'military'], bonus: { ship: 2.5, building: 2, human: 1.3 }, building: 'shipyard', age: 4, god: 'poseidon', hotkey: 'C',
       desc: 'Monstro marinho primordial: nada e anda em terra, esmaga navios e a costa. Treinado no Estaleiro.',
     },
     phoenix: { id: 'phoenix',
       name: 'Fênix', plural: 'Fênix', icon: '☀️', cls: 'myth', flying: true,
       cost: { gold: 250, favor: 40 }, hp: 480, attack: 28, attackType: 'pierce',
       armor: { hack: 0.25, pierce: 0.3, crush: 0.2 }, range: 5, speed: 4.2, los: 12, trainTime: 36, pop: 5, radius: 0.45, splash: 1.0,
       tags: ['myth', 'military', 'ranged', 'flying', 'fire'], bonus: { human: 1.3 }, building: 'temple', age: 6, god: 'helios', hotkey: 'Z', special: 'rebirth',
       desc: 'Ave de fogo de Hélio: atira chamas e, na primeira morte, renasce das cinzas com metade da vida.',
     },
     ```
     Coloque `flying: true` em `harpy`, `triptolemus_dragon`, `phoenix` e `griffin`; `naval: true` em `hippocampus` e
     `scylla`; `amphibious: true` em `ceto`; `splash` onde a tabela tem área. **Não** ponha `naval` no Ceto (o anfíbio
     tem regra própria).
  2. Em `oceanus`, acrescente `amphibious: true,` depois de `unique: true,` (nada mais muda).
  3. Depois de `UNITS` (antes de `UNIT_TAGS`):
     ```ts
     /** E6: criatura que vira outra numa Era (docs/ERAS.md §6: "o Colosso de Hefesto vira Talos na Era Industrial" = índice 6). */
     export const MYTH_UPGRADES: Readonly<Record<string, { to: string; age: number }>> = { colossus: { to: 'talos', age: 6 } };
     ```
- [ ] **A6. `src/core/data/buildings.ts`.** No fim de `temple.trains`, depois de `'cerberus'`:
  `'satyr', 'empusa', 'lampad', 'harpy', 'triptolemus_dragon', 'phoenix', 'griffin', 'erinys', 'talos'`. No fim de
  `shipyard.trains` (da E4): `'scylla', 'ceto', 'hippocampus'` (nessa ordem: ver "Ordem nos `trains`"). Na desc do Templo (PT) nada muda.
- [ ] **A7. `src/core/data/techs.ts`.**
  1. Se o arquivo ainda não importa `UNITS`, acrescente `import { UNITS } from './units';` (a E3 já pode ter posto).
  2. Antes de `const RAW`:
     ```ts
     /** E6: tipos que as Bênçãos do Templo fortalecem — criaturas míticas e heróis, nunca os Titãs (docs/eras/E6, D13). */
     export const BLESSED_TYPES: string[] = Object.values(UNITS).filter((u) => (u.tags.includes('myth') || u.tags.includes('hero')) && !u.tags.includes('titan')).map((u) => u.id);
     /** E6: Bênçãos do Olimpo II–VIII (uma por Era, em sequência; Templo). Só valem com eraMythOn (src/core/sim/restrictions.ts). */
     const blessings = (): Record<string, TechInput> => {
       const out: Record<string, TechInput> = {};
       const m = { types: BLESSED_TYPES };
       for (let n = 2; n <= 8; n++) {
         const k = n - 1;
         out[`blessing${n}`] = {
           name: `Bênção do Olimpo ${ROMAN[n - 1]}`, icon: '🕯️', building: 'temple', age: k, blessing: true,
           cost: { gold: 80 + 60 * k, favor: 20 + 10 * k }, time: 30 + 6 * k, prereq: n > 2 ? [`blessing${n - 1}`] : [],
           effects: [
             { type: 'unit', match: m, stat: 'hp', mult: 1.2 }, { type: 'unit', match: m, stat: 'attack', mult: 1.2 },
             { type: 'unit', match: m, stat: 'armor.hack', add: 0.02 }, { type: 'unit', match: m, stat: 'armor.pierce', add: 0.02 }, { type: 'unit', match: m, stat: 'armor.crush', add: 0.02 },
           ],
           desc: 'Criaturas míticas e heróis +20% de vida e de ataque e +0,02 de armadura (os Titãs não recebem).',
         };
       }
       return out;
     };
     ```
     (`ROMAN` é o vetor I–VIII que a E1 pôs neste arquivo; se ele estiver declarado **depois** de `blessings`, mova a
     função para baixo dele.)
  3. No fim de `RAW` (antes do `};`), as 18 pesquisas da tabela e as Bênçãos:
     ```ts
     // ---------- Deuses menores das Eras V–VII (E6) ----------
     rustic_flute: { name: 'Flauta Silvestre', icon: '🦌', building: 'temple', age: 4, god: 'pan', cost: { food: 400, favor: 45 }, time: 55, effects: [{ type: 'gather', resource: 'hunt', mult: 1.3 }, { type: 'gather', resource: 'farm', mult: 1.15 }], desc: 'Caça +30% e fazendas +15%.' },
     wild_hooves: { name: 'Cascos Selvagens', icon: '🦌', building: 'temple', age: 4, god: 'pan', cost: { gold: 400, favor: 45 }, time: 55, effects: [{ type: 'unit', match: { tags: ['myth'] }, stat: 'speed', mult: 1.15 }, { type: 'unit', match: { types: ['satyr'] }, stat: 'attack', mult: 1.2 }], desc: 'Criaturas míticas +15% de velocidade e Sátiros +20% de ataque.' },
     all_seeing_sun: { name: 'Sol que Tudo Vê', icon: '☀️', building: 'temple', age: 6, god: 'helios', cost: { gold: 500, favor: 55 }, time: 65, effects: [{ type: 'player', stat: 'los', add: 3 }, { type: 'building', match: { types: ['tower', 'fortress'] }, stat: 'range', add: 1 }], desc: 'Visão +3; torres e fortalezas +1 de alcance.' },
     // … as outras 15 pela tabela, no mesmo formato (efeito "unit tags X" = { type: 'unit', match: { tags: ['X'] }, … };
     //   "unit types X" = match { types: ['X'] }; "player S +n" = { type: 'player', stat: 'S', add: n }; "cost tags X ×m" = { type: 'cost', match: { tags: ['X'] }, mult: m })
     ...blessings(),
     ```
  4. Depois de `TECHS`: `export const BLESSING_IDS: string[] = Object.keys(TECHS).filter((id) => TECHS[id].blessing);`
- [ ] **A8. `src/core/data/index.ts`.** Acrescente `MYTH_UPGRADES` ao `export { UNITS, UNIT_TAGS … } from './units';` e
  `BLESSED_TYPES`, `BLESSING_IDS` ao export de `'./techs'`.
- [ ] **A9. `src/i18n/en-data.ts`.** Na mesma forma das entradas de hoje:
  - `EN_UNITS`: as 12 criaturas (`name`, `plural`, `desc` das tabelas);
  - `EN_POWERS`: os 9 poderes (`name`, `desc`);
  - `EN_MINOR_GODS`: os 9 deuses (`name`, `title`, `desc`);
  - `EN_TECHS`: as 18 pesquisas (`name`, `desc`) e as Bênçãos geradas:
    `...Object.fromEntries(['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'].map((r, i) => [`blessing${i + 2}`, { name: `Blessing of Olympus ${r}`, desc: 'Mythic creatures and heroes +20% health and attack and +0.02 armor (Titans excluded).' }])),`
    (numerais literais, como a `line()` do EN que a E1 deixou: o `en-data.ts` não importa nada de `src/core` e deve continuar
    assim — o `src/i18n/index.ts` importa os dois e os sobrepõe);
  - `EN_MAJOR_GODS`: os perks EN da tabela, na mesma posição dos PT.
- [ ] **A10. `src/i18n/strings.ts`.** As 10 chaves da tabela, em `pt` e em `en` (o typecheck exige as duas).
- [ ] **A11. `eraMyth` (`src/core/sim/restrictions.ts`, `src/core/scenario/schema.ts`, `src/core/scenario/compile.ts`).**
  - `restrictions.ts`, perto de `navalOn` (da E4):
    ```ts
    /** E6: mitologia por Era (escala dos poderes, Bênçãos, Titãs reforçados). Fora de cenário, sempre; em cenário, só com config.eraMyth === true. */
    export function eraMythOn(state: GameState): boolean { return state.config.eraMyth ?? !isScenarioConfig(state.config); }
    ```
  - `schema.ts` e `compile.ts`: `eraMyth?: boolean` **exatamente** como o `unitLines` da E3 (tipo em `ScenarioFile.config`,
    validação booleana com `err('config.eraMyth', …)`, cópia em `scenarioConfig` com `if (c.eraMyth !== undefined) cfg.eraMyth = c.eraMyth;`).
- [ ] **A12. `tests/data.test.ts`.** Troque `expect(g.minorGods.length).toBe(3);` por `toBe(6)`.

*Confira:* `npm run -s typecheck` e `npx vitest run tests/data.test.ts tests/i18n.test.ts tests/eras.test.ts`
(o `eras.test.ts` da E1 confere `AGES[k].minorGod` contra os pares: tem de passar sem mudar).

### Bloco B — Camada anfíbia (sobre a E4)

- [ ] **B1. `src/core/map/naval.ts` (da E4).**
  ```ts
  /** Camada de movimento: terrestre, naval ou anfíbia (E6: Ceto e Oceano; terra caminhável OU água navegável). */
  export type Layer = 'land' | 'naval' | 'amphibious';
  export const layerOf = (def: { naval?: boolean; amphibious?: boolean }): Layer => (def.amphibious ? 'amphibious' : def.naval ? 'naval' : 'land');
  ```
  Depois de `navalBlocked`:
  ```ts
  const amphCache = new WeakMap<GameMap, Uint8Array>();
  /** E6: 1 = nem a pé nem a nado (montanha, nó, edifício). Portão do próprio time: canPass. Derivada; descartada com a naval. */
  export function amphibBlocked(map: GameMap): Uint8Array {
    let ab = amphCache.get(map);
    if (!ab) {
      const nb = navalBlocked(map);
      ab = new Uint8Array(map.w * map.h);
      for (let i = 0; i < ab.length; i++) ab[i] = map.blocked[i] === 0 || nb[i] === 0 ? 0 : 1;
      amphCache.set(map, ab);
    }
    return ab;
  }
  /** Bloqueio por camada (land = map.blocked). */
  export function layerBlocked(map: GameMap, layer: Layer): Uint8Array { return layer === 'naval' ? navalBlocked(map) : layer === 'amphibious' ? amphibBlocked(map) : map.blocked; }
  ```
  e troque `invalidateNaval` por `export function invalidateNaval(map: GameMap): void { cache.delete(map); amphCache.delete(map); }`.
  A E7 (passo M2 do guia E5–E7) já pôs neste arquivo o `navalOpen`/`setNavalOpen` do Canal de Corinto e a regra
  `open` no `navalBlocked`: não mexa neles. O `amphibBlocked` lê o `navalBlocked`, então herda a passagem do Canal, e o
  `setNavalOpen` já chama o `invalidateNaval` (que agora apaga também o cache anfíbio).
- [ ] **B2. `src/core/map/grid.ts`.** Importe `amphibBlocked` junto de `navalBlocked`. Em `isPassable`, troque o `return`
  por `return layer === 'land' ? map.blocked[i] === 0 : layerBlocked(map, layer)[i] === 0;` (importe `layerBlocked`). Em
  `canPass`, logo depois da linha `if (layer === 'naval') …`, acrescente
  `if (layer === 'amphibious') return amphibBlocked(map)[i] === 0 || (team >= 0 && map.gateTeam[i] === team);`.
- [ ] **B3. `src/core/map/pathfinding.ts`.** Troque o import `navalBlocked` de `'./naval'` (da E4) por `layerBlocked` (ou
  acrescente-o, se o `navalBlocked` ainda for usado no arquivo). Em `findPathEx`, troque as duas linhas do `nb`/`pass` da E4 por:
  ```ts
  const nb = layer === 'land' ? null : layerBlocked(map, layer);
  const pass = !nb ? (i: number) => map.blocked[i] === 0 || (team >= 0 && map.gateTeam[i] === team)
    : layer === 'amphibious' ? (i: number) => nb[i] === 0 || (team >= 0 && map.gateTeam[i] === team) : (i: number) => nb[i] === 0;
  ```
- [ ] **B4. `src/core/map/components.ts`.** Acrescente `amphibBlocked` ao import de `'./naval'` (o da E4). Terceiro cache:
  ```ts
  const amphStore = new WeakMap<GameMap, Components>();   // E6: regiões da camada anfíbia
  ```
  `invalidateComponents` passa a apagar também `amphStore`. Em `get(map, layer)`:
  `const store = layer === 'naval' ? navalCache : layer === 'amphibious' ? amphStore : cache;` e, no cálculo,
  `else if (layer === 'amphibious') { const ab = amphibBlocked(map); c = compute(map, (i) => ab[i] === 0 || map.gateTeam[i] !== -1); }`
  antes do ramo terrestre. Nada mais muda (`wouldSeal`/`articulationPoints` continuam terrestres).
- [ ] **B5. `src/core/sim/naval.ts` (da E4).** Importe `isOpenWater`, `layerOf`, `type Layer` de `'../map/naval'`, `idx` de
  `'../map/grid'` e `navalOn` de `'./restrictions'` (o que faltar). Acrescente:
  ```ts
  /** E6: camada de uma unidade nesta partida — anfíbia só com navios ligados (na campanha, Oceano anda só em terra; D15). */
  export function unitLayer(state: GameState, def: { naval?: boolean; amphibious?: boolean }): Layer {
    if (def.amphibious && !navalOn(state)) return 'land';
    return layerOf(def);
  }
  /** E6: em que meio a unidade está agora (terra × mar): naval no mar; anfíbia pelo tile (água aberta = mar; baixio = terra). */
  export function mediumOf(state: GameState, u: Unit): 'land' | 'sea' {
    const lay = unitLayer(state, UNITS[u.type]);
    if (lay === 'naval') return 'sea';
    if (lay === 'amphibious') { const m = state.map; const tx = Math.floor(u.x), ty = Math.floor(u.y); return tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && isOpenWater(m.terrain[idx(m, tx, ty)]) ? 'sea' : 'land'; }
    return 'land';
  }
  ```
  Em `canBoard`, troque `if (d.naval || d.flying || d.immobile || d.tags.includes('titan')) return false;` por
  `if (d.naval || d.amphibious || d.flying || d.immobile || d.tags.includes('titan')) return false;`.
- [ ] **B6. Troque `layerOf` por `unitLayer` no núcleo.** Liste com `grep -n "layerOf(" src/core/sim/*.ts`. Em cada
  chamada que tem `state` à mão, troque `layerOf(X)` por `unitLayer(state, X)` (importe `unitLayer` de `'./naval'`; em
  `src/core/sim/naval.ts` mesmo, chame direto). Onde a função não tem `state` (por exemplo `stepTo`/`moveExact`, que
  recebem `layer`), não mexa: quem chama já passa a camada. **Não** troque nada em `src/core/map/*` nem em `src/editor/*`.
- [ ] **B7. `src/core/sim/units.ts`, aproximação de ataque (passo C7 da E4).** Troque as duas primeiras linhas do bloco
  "alvo no outro meio" por:
  ```ts
  const layer = unitLayer(state, def);
  const tLayer: Layer = t.kind === 'unit' ? (mediumOf(state, t) === 'sea' ? 'naval' : 'land') : 'land';
  if (!def.flying && layer !== 'amphibious' && layer !== tLayer) {
  ```
  (o resto do bloco fica; importe `mediumOf` e `type Layer`).
- [ ] **B8. `src/core/sim/combat.ts`, `canTarget`.** Troque o bloco da E4 "corpo a corpo não alcança o outro meio" por:
  ```ts
  // E4/E6: corpo a corpo não alcança o outro meio (terra × mar); titãs, voadores e anfíbios alcançam
  if (attacker.kind === 'unit' && isMelee(state, attacker)) {
    const ad = UNITS[attacker.type];
    const other = target.kind === 'unit' ? mediumOf(state, target) : 'land';
    if (!ad.tags.includes('titan') && !ad.flying && unitLayer(state, ad) !== 'amphibious' && mediumOf(state, attacker) !== other) return false;
  }
  ```
  (importe `mediumOf` e `unitLayer` de `'./naval'`).

*Confira:* `npx vitest run tests/naval.test.ts tests/pathfinding.test.ts tests/fixedmap.test.ts tests/movement-ai.test.ts tests/determinism.test.ts`
— tudo verde, os hashes de "generateMap produz exatamente…" sem mudar.

### Bloco C — Poderes e a escala por Era

- [ ] **C1. `src/core/sim/divine.ts` (novo).** O arquivo inteiro (atenção: o `tests/determinism.test.ts` varre o **texto**
  de `src/core`, comentários incluídos — nunca escreva `Math.random`, `Math.sin`, `Date.now` etc. nem num comentário):
  ```ts
  // Mitologia nas Eras (E6; docs/eras/E6-mitologia.md): números dos poderes novos, a escala dos poderes por Era e as leituras
  // que o combate, o movimento e a coleta fazem a cada tick (Vendaval, Colheita Divina). Determinístico: só o estado, aritmética e
  // raiz quadrada; nada de sorteio nem trigonometria. Valores iniciais para o balanceamento (E10).
  import { MINOR_GODS, POWERS, UNITS } from '../data';
  import type { GameState, Player, Unit } from '../types';
  import { isEnemy } from './queries';
  import { eraMythOn } from './restrictions';

  /** Segundos de jogo, tiles e pontos de vida. */
  export const POWER_TUNING = {
    eraScale: 0.15,                                    // +15% por Era acima da Era do poder (docs/ERAS.md §6)
    boltTitanBase: 0.5, boltTitanMax: 0.75,            // Raio num Titã: fração da vida
    panic: { seconds: 8, flee: 8 },
    crossroads: { pop: 20, spread: 6 },
    spring: { seconds: 20, maxShades: 12 },
    gale: { seconds: 12, push: 3, slow: 0.5, repair: 0.2 },
    tidal: { unit: 120, ship: 240, building: 300 },
    harvest: { seconds: 45, mult: 1.5 },
    sun: { half: 8, width: 1.5, seconds: 6, unit: 30, building: 80 },
    nike: { seconds: 30, mult: 1.3 },
    nemesis: { seconds: 20, reflect: 0.5 },
    drain: 0.3, rebirthHp: 0.5,                        // Empusa (cura) e Fênix (vida ao renascer)
  } as const;

  /** Era em que cada poder chega: a do deus menor que o traz (poder de deus maior = Era I). */
  const POWER_ERA: Record<string, number> = {};
  for (const g of Object.values(MINOR_GODS)) POWER_ERA[g.power] = g.age;
  export function powerEraOf(id: string): number { return POWER_ERA[id] ?? 0; }

  /** Força do poder agora: 1 + 0,15 por Era acima da Era do poder; 1 com eraMyth desligado (campanha, Horda, cenários). */
  export function powerScale(state: GameState, player: Player, id: string): number {
    if (!eraMythOn(state)) return 1;
    return 1 + POWER_TUNING.eraScale * Math.max(0, player.age - powerEraOf(id));
  }
  /** Raio que a mira mostra (só a Restauração escala o raio). */
  export function powerRadius(state: GameState, player: Player, id: string): number | undefined {
    const r = POWERS[id]?.radius;
    if (r === undefined) return undefined;
    return id === 'restoration' ? r * powerScale(state, player, id) : r;
  }
  /** Vendaval: fator de velocidade da unidade (0,5 dentro de um Vendaval inimigo; 0 para navio; titãs não sentem). */
  export function galeFactor(state: GameState, u: Unit): number {
    if (state.timed.length === 0) return 1;
    let f = 1;
    for (const t of state.timed) {
      if (t.type !== 'gale' || state.tick >= t.until || t.x === undefined || t.y === undefined || !isEnemy(state, t.owner, u.owner)) continue;
      const r = t.data ?? 8, dx = u.x - t.x, dy = u.y - t.y;
      if (dx * dx + dy * dy > r * r) continue;
      const d = UNITS[u.type];
      if (d.tags.includes('titan')) continue;
      f = Math.min(f, d.naval ? 0 : POWER_TUNING.gale.slow);
    }
    return f;
  }
  /** Colheita Divina: multiplicador de coleta do jogador agora. */
  export function harvestMult(state: GameState, player: Player): number { return state.tick < (player.harvestUntil ?? 0) ? POWER_TUNING.harvest.mult : 1; }
  /** O ponto (rx, ry), relativo ao centro da faixa, está na faixa de direção unitária (dx, dy), meio-comprimento `half` e meia-largura `w`? */
  export function inStrip(rx: number, ry: number, dx: number, dy: number, half: number, w: number): boolean {
    const a = rx * dx + ry * dy, b = ry * dx - rx * dy;
    return a >= -half && a <= half && b >= -w && b <= w;
  }
  /** Ponto da "casa" do jogador para os efeitos dos poderes globais: o Centro Cívico pronto de menor id (edifícios do próprio jogador:
   *  sem viés de posição); sem nenhum, o centro do mapa. Só visual. */
  export function homeOf(state: GameState, player: Player): { x: number; y: number } {
    let best: { id: number; x: number; y: number } | null = null;
    for (const b of state.buildings.values()) if (b.owner === player.id && !b.dead && b.complete && b.type === 'town_center' && (!best || b.id < best.id)) best = b;
    return best ? { x: best.x, y: best.y } : { x: state.map.w / 2, y: state.map.h / 2 };
  }
  ```
- [ ] **C2. `src/core/sim/powers.ts`, assinatura e imports.**
  - Imports: `POWER_TUNING as P6, homeOf, inStrip, powerScale` de `'./divine'`; `giveOrder` de `'./units'`;
    `unitLayer` de `'./naval'`; `TERRAIN` não é necessário. Acrescente `Building, Unit` ao `import type` de `'../types'`.
  - Troque a assinatura por
    `export function usePower(state: GameState, player: Player, powerId: string, x?: number, y?: number, targetId?: number, ids?: number[]): PowerResult {`
    e, logo depois de `const px = x ?? 0, py = y ?? 0;`, acrescente `const s = powerScale(state, player, powerId);   // E6: força da Era`.
- [ ] **C3. `powers.ts`, escala nos 12 poderes de hoje** (troque só o número indicado):

  | case | troque | por |
  |---|---|---|
  | `bolt` | `applyDamage(state, tgt, tgt.maxHp * 0.5, player.id)` | `applyDamage(state, tgt, tgt.maxHp * Math.min(P6.boltTitanMax, P6.boltTitanBase * s), player.id)` |
  | `lure` | `addNode(state.map, 'lure', spot.x, spot.y, 800)` | `addNode(state.map, 'lure', spot.x, spot.y, Math.round(800 * s))` |
  | `sentinel` | o laço `for (const [sx, sy] of spots) { … }` | o laço abaixo |
  | `restoration` | `const r = def.radius ?? 8;` | `const r = (def.radius ?? 8) * s;` |
  | `ceasefire` | `state.tick + 30 * TICK_RATE` | `state.tick + Math.round(30 * TICK_RATE * s)` |
  | `pestilence` | `state.tick + 60 * TICK_RATE` | `state.tick + Math.round(60 * TICK_RATE * s)` |
  | `oracle` | `state.tick + 60 * TICK_RATE` | `state.tick + Math.round(60 * TICK_RATE * s)` |
  | `bronze` | `state.tick + 45 * TICK_RATE` | `state.tick + Math.round(45 * TICK_RATE * s)` |
  | `curse` | `let n = 0;` (a do `case 'curse'`) e `if (n >= 8) break;` | `let n = 0; const maxVictims = Math.round(8 * s);` e `if (n >= maxVictims) break;` |
  | `lightning_storm` | `data: def.radius ?? 6 });` (no `timed.push`) | `data: def.radius ?? 6, mult: s });` |
  | `earthquake` | `data: def.radius ?? 7 });` (no `timed.push`) | `data: def.radius ?? 7, mult: s });` |

  **Por que `maxVictims` fora do laço:** dentro do `for` da Maldição já existe um `const s = spiralSearchFrame(…)` (o lugar
  do javali). Um `Math.round(8 * s)` dentro do mesmo bloco leria esse `s` antes da declaração (erro TS2448 / zona morta
  temporal), e não a escala. Não renomeie a escala: só tire a conta do laço, como na tabela.

  Laço novo das Sentinelas (mesma busca por canto, agora em rodízio; as estátuas extras não repetem tile). As 4 primeiras
  têm de sair **exatamente** como hoje (a m9 joga como Hades e o `scripts/missions.ts` tem de dar o mesmo resultado): o
  filtro de tile usado só vale a partir da 5ª.
  ```ts
  const n = Math.min(8, Math.round(4 * s)), used = new Set<number>();
  for (let k = 0; k < n; k++) {
    const [sx, sy] = spots[k % 4];
    const sp = spiralSearchFrame(sx, sy, 4, (a, c) => isPassable(state.map, a, c) && (k < 4 || !used.has(idx(state.map, a, c))), towardFrame(sx + 0.5 - b.x, sy + 0.5 - b.y));
    if (sp) { used.add(idx(state.map, sp.x, sp.y)); spawnUnit(state, player.id, 'sentinel', sp.x + 0.5, sp.y + 0.5); state.effects.push({ type: 'spawn', x: sp.x + 0.5, y: sp.y + 0.5, ttl: 20, total: 20 }); }
  }
  ```
  (se a E4 já trocou `isPassable` por uma versão com camada, mantenha a dela). Em `updateTimedEffects`, troque
  `applyDamage(state, v, 200, t.owner)` por `applyDamage(state, v, 200 * (t.mult ?? 1), t.owner)`,
  `applyDamage(state, b, 75, t.owner)` por `applyDamage(state, b, 75 * (t.mult ?? 1), t.owner)` e
  `applyDamage(state, u, 3, t.owner)` por `applyDamage(state, u, 3 * (t.mult ?? 1), t.owner)`.
- [ ] **C4. `powers.ts`, os 9 `case` novos**, antes do `default:`. Todos terminam em `break` (o consumo do fim — `used`/`charges`
  da E7 — continua valendo; **não** marque `used` dentro do case):
  ```ts
  // ---------------- E6: deuses menores das Eras V–VII (docs/eras/E6-mitologia.md) ----------------
  case 'panic': {
    const r = def.radius ?? 7, until = state.tick + Math.round(P6.panic.seconds * s * TICK_RATE);
    let n = 0;
    for (const u of rt.hash.query(px, py, r)) {
      if (u.dead || u.inside !== -1 || !isEnemy(state, player.id, u.owner)) continue;
      const d = UNITS[u.type];
      if (d.immobile || d.naval || d.tags.includes('titan') || d.tags.includes('hero')) continue;
      let dx = u.x - px, dy = u.y - py, l = Math.sqrt(dx * dx + dy * dy);
      if (l < 0.01) { dx = state.map.w / 2 - px; dy = state.map.h / 2 - py; l = Math.sqrt(dx * dx + dy * dy); if (l < 0.01) { dx = 1; dy = 0; l = 1; } }
      const tx = Math.max(1, Math.min(state.map.w - 2, u.x + (dx / l) * P6.panic.flee)), ty = Math.max(1, Math.min(state.map.h - 2, u.y + (dy / l) * P6.panic.flee));
      giveOrder(state, u, { type: 'move', x: tx, y: ty });
      u.fearUntil = until;
      n++;
    }
    if (n === 0) return { ok: false, reason: t('err.noEnemiesHere') };
    state.effects.push({ type: 'divine', x: px, y: py, ttl: 30, total: 30, data: r, src: powerId, owner: player.id });
    break;
  }
  case 'crossroads': {
    const tx0 = Math.floor(px), ty0 = Math.floor(py);
    if (!inBounds(state.map, tx0, ty0) || player.visibility[idx(state.map, tx0, ty0)] === 0 || !isPassable(state.map, tx0, ty0)) return { ok: false, reason: t('err.crossroadsDest') };
    const cap = Math.round(P6.crossroads.pop * s);
    const group: Unit[] = [];
    let pop = 0;
    for (const id of ids ?? []) {
      const u = state.units.get(id);
      if (!u || u.dead || u.owner !== player.id || u.inside !== -1 || group.includes(u)) continue;
      const d = UNITS[u.type];
      if (d.immobile || d.naval || d.tags.includes('titan') || (d.capacity ?? 0) > 0) continue;
      const need = Math.max(1, d.pop);
      if (pop + need > cap) continue;
      group.push(u); pop += need;
    }
    if (group.length === 0) return { ok: false, reason: t('err.crossroadsNoUnits') };
    const ox = group.reduce((a, u) => a + u.x, 0) / group.length, oy = group.reduce((a, u) => a + u.y, 0) / group.length;
    const f = centerFrame(state.map, px, py), taken = new Set<number>();
    for (const u of group) {
      const lay = unitLayer(state, UNITS[u.type]);
      const sp = spiralSearchFrame(tx0, ty0, P6.crossroads.spread, (a, b) => inBounds(state.map, a, b) && !taken.has(idx(state.map, a, b)) && isPassable(state.map, a, b, lay), f);
      if (!sp) continue;   // sem lugar perto do destino: fica onde está
      taken.add(idx(state.map, sp.x, sp.y));
      u.x = sp.x + 0.5; u.y = sp.y + 0.5; u.px = u.x; u.py = u.y; u.tx = u.x; u.ty = u.y;
      u.path = null; u.state = 'idle'; u.order = null; u.queue = []; u.targetId = -1;
    }
    state.effects.push({ type: 'divine', x: ox, y: oy, ttl: 30, total: 30, data: 3, src: powerId, owner: player.id });
    state.effects.push({ type: 'divine', x: px, y: py, ttl: 30, total: 30, data: 3, src: powerId, owner: player.id });
    break;
  }
  case 'spring': {
    const r = def.radius ?? 6;
    state.timed.push({ type: 'spring', owner: player.id, until: state.tick + Math.round(P6.spring.seconds * s * TICK_RATE), x: px, y: py, data: r, count: 0 });
    state.effects.push({ type: 'divine', x: px, y: py, ttl: 30, total: 30, data: r, src: powerId, owner: player.id });
    break;
  }
  case 'gale': {
    const r = def.radius ?? 8;
    for (const u of rt.hash.query(px, py, r)) {
      if (u.dead || u.inside !== -1 || !isEnemy(state, player.id, u.owner)) continue;
      const d = UNITS[u.type];
      if (d.immobile || d.naval || d.tags.includes('titan')) continue;
      const dx = u.x - px, dy = u.y - py, l = Math.sqrt(dx * dx + dy * dy);
      if (l < 0.01) continue;
      const lay = unitLayer(state, d);
      let bx = u.x, by = u.y;
      for (let k = 1; k <= P6.gale.push; k++) {
        const nx = u.x + (dx / l) * k, ny = u.y + (dy / l) * k;
        if (!isPassable(state.map, Math.floor(nx), Math.floor(ny), lay)) break;
        bx = nx; by = ny;
      }
      if (bx !== u.x || by !== u.y) { u.x = bx; u.y = by; u.px = bx; u.py = by; u.path = null; }
    }
    for (const b of state.buildings.values()) {
      if (b.owner !== player.id || b.dead || !b.complete || (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py) > r * r) continue;
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * P6.gale.repair);
    }
    for (let i = state.timed.length - 1; i >= 0; i--) {   // apaga o Carro do Sol inimigo na área
      const o = state.timed[i];
      if (o.type === 'sun_chariot' && isEnemy(state, player.id, o.owner) && o.x !== undefined && o.y !== undefined && (o.x - px) * (o.x - px) + (o.y - py) * (o.y - py) <= r * r) state.timed.splice(i, 1);
    }
    state.timed.push({ type: 'gale', owner: player.id, until: state.tick + Math.round(P6.gale.seconds * s * TICK_RATE), x: px, y: py, data: r });
    state.effects.push({ type: 'divine', x: px, y: py, ttl: 30, total: 30, data: r, src: powerId, owner: player.id });
    break;
  }
  case 'tidal_wave': {
    const r = def.radius ?? 7;
    let n = 0;
    for (const u of rt.hash.query(px, py, r)) {
      if (u.dead || u.inside !== -1 || !isEnemy(state, player.id, u.owner)) continue;
      applyDamage(state, u, (UNITS[u.type].tags.includes('ship') ? P6.tidal.ship : P6.tidal.unit) * s, player.id); n++;
    }
    for (const b of state.buildings.values()) {
      if (b.dead || !isEnemy(state, player.id, b.owner) || (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py) > r * r) continue;
      applyDamage(state, b, P6.tidal.building * s, player.id); n++;
    }
    if (n === 0) return { ok: false, reason: t('err.noEnemiesHere') };
    state.effects.push({ type: 'divine', x: px, y: py, ttl: 30, total: 30, data: r, src: powerId, owner: player.id });
    break;
  }
  case 'divine_harvest': {
    player.harvestUntil = state.tick + Math.round(P6.harvest.seconds * s * TICK_RATE);
    const h = homeOf(state, player);
    state.effects.push({ type: 'divine', x: h.x, y: h.y, ttl: 30, total: 30, data: 6, src: powerId, owner: player.id });
    break;
  }
  case 'sun_chariot': {
    let tc: Building | null = null, bd = Infinity;
    for (const b of state.buildings.values()) {
      if (b.owner !== player.id || b.dead || b.type !== 'town_center') continue;
      const d = (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py);
      if (d < bd || (d === bd && tc !== null && b.id < tc.id)) { bd = d; tc = b; }
    }
    let dx = tc ? px - tc.x : state.map.w / 2 - px, dy = tc ? py - tc.y : state.map.h / 2 - py;
    if (dx * dx + dy * dy < 1) { dx = state.map.w / 2 - px; dy = state.map.h / 2 - py; }
    const l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6) { dx = 1; dy = 0; } else { dx /= l; dy /= l; }
    state.timed.push({ type: 'sun_chariot', owner: player.id, until: state.tick + P6.sun.seconds * TICK_RATE, x: px, y: py, data: P6.sun.half, dx, dy, mult: s });
    state.effects.push({ type: 'divine', x: px, y: py, ttl: 30, total: 30, data: P6.sun.half, src: powerId, owner: player.id });
    break;
  }
  case 'winged_victory': {
    player.nikeUntil = state.tick + Math.round(P6.nike.seconds * s * TICK_RATE);
    const h = homeOf(state, player);
    state.effects.push({ type: 'divine', x: h.x, y: h.y, ttl: 30, total: 30, data: 6, src: powerId, owner: player.id });
    break;
  }
  case 'retribution': {
    player.nemesisUntil = state.tick + Math.round(P6.nemesis.seconds * s * TICK_RATE);
    const h = homeOf(state, player);
    state.effects.push({ type: 'divine', x: h.x, y: h.y, ttl: 30, total: 30, data: 6, src: powerId, owner: player.id });
    break;
  }
  ```
  - Os `state.effects.push({ type: 'divine'` e `state.timed.push({ type: 'spring'` / `'gale'` / `'sun_chariot'` precisam
    ficar **literais** assim (o `tests/fx-registry.test.ts` acha os tipos por expressão regular).
  - `isPassable(map, x, y, layer)` é a versão da E4 (com camada). `centerFrame`, `spiralSearchFrame`, `inBounds`, `idx` já
    são importados pelo arquivo.
  - `(a - b) * (a - b)` no lugar de `** 2` nos códigos novos (os `** 2` de hoje podem ficar).
- [ ] **C5. `powers.ts`, `updateTimedEffects`, o Carro do Sol.** Encadeie um ramo novo depois do ramo `earthquake`: troque
  o `}` que fecha o `else if (t.type === 'earthquake' …) {` pelo bloco abaixo (ele começa fechando o ramo do terremoto e
  termina fechando o seu; o `}` do `for` continua depois dele):
  ```ts
  } else if (t.type === 'sun_chariot' && state.tick % 5 === 0 && t.x !== undefined && t.y !== undefined) {   // E6
    const half = t.data ?? P6.sun.half, w = P6.sun.width, m = t.mult ?? 1, dx = t.dx ?? 1, dy = t.dy ?? 0;
    for (const u of rt.hash.query(t.x, t.y, half + w)) {
      if (u.dead || u.inside !== -1 || !isEnemy(state, t.owner, u.owner)) continue;
      if (inStrip(u.x - t.x, u.y - t.y, dx, dy, half, w)) applyDamage(state, u, P6.sun.unit * m, t.owner);
    }
    for (const b of state.buildings.values()) {
      if (b.dead || !isEnemy(state, t.owner, b.owner)) continue;
      if (inStrip(b.x - t.x, b.y - t.y, dx, dy, half, w + Math.max(b.w, b.h) / 2)) applyDamage(state, b, P6.sun.building * m, t.owner);
    }
  }
  ```
  `spring` e `gale` não precisam de ramo aqui (são lidos por `springRaise` e `galeFactor`); eles saem da lista sozinhos
  quando `state.tick >= t.until`, pela linha do começo do laço.
- [ ] **C6. Comando (`src/core/sim/commands.ts`, `src/core/sim/validate.ts`).**
  - `commands.ts`: `case 'power': return usePower(state, player, cmd.power, cmd.x, cmd.y, cmd.targetId, cmd.ids);`.
  - `validate.ts`, no `case 'power'`, antes do `return cmd;`:
    `if (!absent(raw.ids)) { const ids = idList(raw.ids); if (!ids) return null; cmd.ids = ids; }   // E6: Encruzilhada`.
- [ ] **C7. Leituras por tick.**
  - `src/core/sim/units.ts`, `updateUnit`: troque
    `const spd = state.tick < u.buffUntil ? stats.speed * u.buffSpeed : stats.speed;   // Astúcia` por
    `const spd = (state.tick < u.buffUntil ? stats.speed * u.buffSpeed : stats.speed) * galeFactor(state, u);   // Astúcia; E6: Vendaval`.
  - `units.ts`, `updateGather`: no ramo da fazenda, troque `const rate = GATHER_RATES.farm * …;` por
    `const rate = GATHER_RATES.farm * player.mods.gather.food * player.mods.gather.farm * harvestMult(state, player);   // E6: Colheita Divina`;
    no ramo do nó, logo depois da(s) linha(s) `if (HUNT_TYPES.has(node.type)) …` (e da do peixe da E4), acrescente
    `rate *= harvestMult(state, player);`. Importe `galeFactor`, `harvestMult` de `'./divine'`.
  - `src/core/sim/combat.ts`, `computeDamage`: no ramo da unidade atacante, depois de `if (state.tick < attacker.buffUntil) attack *= attacker.buffAttack;`:
    `if (state.tick < (state.players[attacker.owner].nikeUntil ?? 0)) attack *= POWER_TUNING.nike.mult;   // E6: Vitória Alada`.
  - `combat.ts`, `applyDamage`: como **última** instrução do corpo (depois do `if (target.hp <= 0) {…}`):
    ```ts
    // E6 (Retribuição): parte do dano volta para quem atacou — sem `attacker` na volta, então não ricocheteia de novo
    if (attacker && attacker.kind === 'unit' && target.kind === 'unit' && !attacker.dead && attacker.owner !== target.owner && state.tick < (victim.nemesisUntil ?? 0)) applyDamage(state, attacker, dmg * POWER_TUNING.nemesis.reflect, target.owner);
    ```
  - `combat.ts`, `canTarget`, logo depois de `if (!isEnemy(…)) return false;`:
    `if (attacker.kind === 'unit' && state.tick < (attacker.fearUntil ?? 0)) return false;   // E6: Pânico`.
  - Importe `POWER_TUNING` de `'./divine'` em `combat.ts`.
  - `src/core/sim/economy.ts`, Cornucópia: troque
    `if (def.plenty) { p.resources.food += 1.5; p.resources.wood += 1.5; p.resources.gold += 1.5; }` por
    `if (def.plenty) { const k = 1.5 * powerScale(state, p, 'plenty'); p.resources.food += k; p.resources.wood += k; p.resources.gold += k; }   // E6: cresce com a Era`
    (importe `powerScale` de `'./divine'`).
- [ ] **C8. Titãs (`src/core/sim/modifiers.ts`, `recomputeMods`).** Depois de `if (god) effects.push(...god.bonuses);`:
  ```ts
  // E6: os Titãs chegam na Era VIII diante de exércitos de pólvora e aço (docs/eras/E6, D20); campanha e cenários sem isso
  if (eraMythOn(state)) effects.push({ type: 'unit', match: { tags: ['titan'] }, stat: 'hp', mult: TITAN_ERA_HP }, { type: 'unit', match: { tags: ['titan'] }, stat: 'attack', mult: TITAN_ERA_ATTACK });
  ```
  (importe `eraMythOn` de `'./restrictions'` e as duas constantes de `'../constants'`).
- [ ] **C9. `SIM_VERSION`.** Em `src/core/constants.ts`, some 1 ao valor atual e acrescente no histórico:
  > N = mitologia nas Eras (E6): deuses menores V–VII, 9 poderes, escala dos poderes por Era, Bênçãos, Talos, Titãs
  > reforçados e camada anfíbia fora de cenário; a campanha não muda.

*Confira:* `npm run -s typecheck` e
`npx vitest run tests/sim.test.ts tests/determinism.test.ts tests/command-fuzz.test.ts tests/economy-regressions.test.ts tests/scenario-gaps.test.ts`.

### Bloco D — Criaturas, Talos e Bênçãos no núcleo

- [ ] **D1. `src/core/sim/myth.ts` (novo).** O arquivo inteiro:
  ```ts
  // Criaturas da E6 (docs/eras/E6-mitologia.md): o Colosso que vira Talos na Era VII e a Primavera de Perséfone. Determinístico.
  import { MYTH_UPGRADES, UNITS } from '../data';
  import type { GameState, Player, Unit } from '../types';
  import { isPassable } from '../map/grid';
  import { POWER_TUNING } from './divine';
  import { spawnUnit } from './entities';
  import { t } from '../../i18n';

  /** Tipo que um treino de `unit` dá na Era `age` (o Colosso vira Talos a partir da Era VII). */
  export function mythUpgradeOf(unit: string, age: number): string {
    const up = MYTH_UPGRADES[unit];
    return up && age >= up.age ? up.to : unit;
  }

  /** Ao subir de Era: as criaturas do jogador que ganham versão nova nesta Era se transformam (a vida proporcional vem do
   *  refreshMaxHp que quem chama roda depois). Devolve quantas mudaram. */
  export function applyMythUpgrades(state: GameState, player: Player): number {
    let n = 0;
    const changed = new Set<string>();
    for (const u of state.units.values()) {
      if (u.owner !== player.id || u.dead) continue;
      const to = mythUpgradeOf(u.type, player.age);
      if (to === u.type) continue;
      changed.add(u.type);
      u.type = to; u.path = null; u.cooldown = 0; n++;
      if (u.inside === -1) state.effects.push({ type: 'evolve', x: u.x, y: u.y, owner: u.owner, ttl: 20, total: 20, src: to });
    }
    if (!player.isAI) for (const from of changed) state.events.push({ tick: state.tick, type: 'research', player: player.id, text: t('ev.mythUpgrade', { from: UNITS[from].plural, to: UNITS[MYTH_UPGRADES[from].to].plural }) });
    return n;
  }

  /** Primavera (Perséfone): um soldado humano morto dentro de uma Primavera ativa volta como Sombra de quem a lançou. */
  export function springRaise(state: GameState, u: Unit, killerOwner: number): void {
    if (killerOwner === -1 || state.timed.length === 0) return;
    const d = UNITS[u.type];
    if (!d.tags.includes('human') || !d.tags.includes('military') || d.tags.includes('hero')) return;
    if (!isPassable(state.map, Math.floor(u.x), Math.floor(u.y))) return;
    for (const tm of state.timed) {
      if (tm.type !== 'spring' || state.tick >= tm.until || tm.x === undefined || tm.y === undefined || (tm.count ?? 0) >= POWER_TUNING.spring.maxShades) continue;
      if (!state.players[tm.owner]?.alive) continue;
      const r = tm.data ?? 6, dx = u.x - tm.x, dy = u.y - tm.y;
      if (dx * dx + dy * dy > r * r) continue;
      tm.count = (tm.count ?? 0) + 1;
      const sh = spawnUnit(state, tm.owner, 'shade', u.x, u.y);
      sh.stance = 'aggressive';
      state.effects.push({ type: 'spawn', x: u.x, y: u.y, ttl: 12, total: 12 });
      return;   // um morto vira uma Sombra só (a Primavera mais antiga da lista)
    }
  }
  ```
- [ ] **D2. `src/core/sim/combat.ts`.**
  1. Voador contra voador: troque
     `if (target.kind === 'unit' && UNITS[target.type].flying && isMelee(state, attacker)) return false;` por
     `if (target.kind === 'unit' && UNITS[target.type].flying && isMelee(state, attacker) && !(attacker.kind === 'unit' && UNITS[attacker.type].flying)) return false;   // E6: voador corpo a corpo luta no ar`.
  2. `performAttack`, Empusa: logo depois de `applyDamage(state, target, dmg, attacker.owner, attacker);`:
     `if (attacker.kind === 'unit' && !attacker.dead && UNITS[attacker.type].special === 'drain') attacker.hp = Math.min(attacker.maxHp, attacker.hp + dmg * POWER_TUNING.drain);   // E6: Empusa`.
  3. `killUnit`, Fênix: logo depois da linha do piso de vida (G9) e antes de `u.dead = true;`:
     ```ts
     // E6: a Fênix renasce uma vez quando morta por um inimigo (dispensar ou roteiro, dono −1, matam de vez)
     if (UNITS[u.type].special === 'rebirth' && !u.reborn && killerOwner >= 0 && killerOwner !== u.owner) {
       u.reborn = true; u.hp = Math.max(1, Math.round(u.maxHp * POWER_TUNING.rebirthHp)); u.lastDamageTick = state.tick;
       state.effects.push({ type: 'divine', x: u.x, y: u.y, ttl: 30, total: 30, data: 1.5, src: 'phoenix', owner: u.owner });
       if (!state.players[u.owner].isAI) state.events.push({ tick: state.tick, type: 'reborn', player: u.owner, x: u.x, y: u.y, text: t('ev.reborn', { name: UNITS[u.type].name }) });
       return;
     }
     ```
  4. `killUnit`, Primavera: logo depois do bloco "Hades: sombras" e antes de `recomputePop(state, victim);`:
     `springRaise(state, u, killerOwner);   // E6: Primavera de Perséfone`. Importe `springRaise` de `'./myth'`.
- [ ] **D3. `src/core/sim/commands.ts`.**
  1. Acima de `canTrain`:
     ```ts
     /** O jogador tem o deus que libera esta unidade? (sem `god`: sempre) — a criatura do deus maior, a de um deus menor
      *  escolhido ou uma unidade de um deus escolhido (Talos é de Hefesto). */
     export function godAllows(player: Player, unit: string): boolean {
       const def = UNITS[unit];
       if (!def?.god) return true;
       const major = MAJOR_GODS[player.god];
       return (!!major && major.mythUnit === unit) || def.god === player.god || player.minorGods.includes(def.god) || player.minorGods.some((g) => MINOR_GODS[g]?.mythUnit === unit);
     }
     ```
  2. Em `canTrain`, troque o bloco inteiro `if (def.god) { const major = …; const allowed = …; if (!allowed) return …; }` (5 linhas) por:
     ```ts
     if (def.god && !godAllows(player, unit)) return { ok: false, reason: t('err.requiresGod') };
     const up = MYTH_UPGRADES[unit];   // E6: o Colosso vira Talos na Era VII
     if (up && player.age >= up.age) return { ok: false, reason: t('err.mythUpgraded', { name: def.plural, to: UNITS[up.to].plural }) };
     ```
     (importe `MYTH_UPGRADES` de `'../data'`).
  3. Em `canResearch`, logo depois de `if (def.building !== b.type) return { ok: false };` (e da linha da E3):
     `if (def.blessing && !eraMythOn(state)) return { ok: false, reason: t('err.classicMyth') };   // E6` (importe `eraMythOn`).
- [ ] **D4. `src/core/sim/buildings.ts`, `completeQueueItem`.**
  - `case 'unit'`: na linha que a E3 deixou (`const type = trainTypeOf(state, player, item.id); …`), troque por
    `const type = mythUpgradeOf(trainTypeOf(state, player, item.id), player.age); const def = UNITS[type];   // E3: degrau atual; E6: Talos`.
  - `case 'age'`: logo antes de `recomputeMods(state, player);` desse case: `applyMythUpgrades(state, player);   // E6: Colosso → Talos`.
  - Importe `applyMythUpgrades, mythUpgradeOf` de `'./myth'`.

*Confira:* `npm run -s typecheck` e `npx vitest run tests/sim.test.ts tests/movement-ai.test.ts tests/determinism.test.ts`.

### Bloco E — IA (`src/core/sim/ai.ts`)

- [ ] **E1. `managePowers`.**
  - Troque `const use = (power: string, x?: number, y?: number, targetId?: number) => applyCommand(state, { type: 'power', player: player.id, power, x, y, targetId }).ok;`
    por `const use = (power: string, x?: number, y?: number, targetId?: number, ids?: number[]) => applyCommand(state, { type: 'power', player: player.id, power, x, y, targetId, ids }).ok;`.
  - No `switch (p)`, antes do `}` final, os casos novos (o aglomerado `clumpX/clumpY/clumpN` é o de hoje):
    ```ts
    // ---- E6 ----
    case 'panic': case 'spring': case 'sun_chariot': case 'tidal_wave': if (clumpN >= 6) { use(p, clumpX, clumpY); return; } break;
    case 'gale': if (defending && clumpN >= 5) { use(p, clumpX, clumpY); return; } break;
    case 'retribution': if (defending && clumpN >= 8) { use(p); return; } break;
    case 'winged_victory': if (player.ai!.attackTarget !== -1 || (defending && clumpN >= 6)) { use(p); return; } break;
    case 'divine_harvest': if (snap.villagers.length >= 30) { use(p); return; } break;
    case 'crossroads': {
      // leva o exército para perto do alvo do ataque, pelo lado de onde ele vem (vetor alvo → exército; nada de rumo absoluto)
      const tid = player.ai!.attackTarget, tgt = tid !== -1 ? state.buildings.get(tid) : undefined;
      const army = snap.military.filter((u) => { const d = UNITS[u.type]; return !d.naval && !d.immobile && !d.tags.includes('titan'); });
      if (!tgt || tgt.dead || army.length < 8) break;
      const cx = army.reduce((a, u) => a + u.x, 0) / army.length, cy = army.reduce((a, u) => a + u.y, 0) / army.length;
      const dx = cx - tgt.x, dy = cy - tgt.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 30) break;   // já está perto
      if (use(p, tgt.x + (dx / d) * 8, tgt.y + (dy / d) * 8, undefined, army.map((u) => u.id))) return;
      break;
    }
    ```
- [ ] **E2. `manageResearch`, Bênçãos.** Na linha que monta `list` (a de hoje ou a que a E3 deixou), insira as Bênçãos
  depois de `...godTechs`:
  ```ts
  const blessed = snap.military.filter((u) => UNITS[u.type].tags.includes('myth') || UNITS[u.type].tags.includes('hero')).length;
  const blessings = eraMythOn(state) && blessed >= 3 ? BLESSING_IDS : [];   // E6: só com 3+ míticas/heróis em campo
  ```
  e use `...godTechs, ...blessings,` na montagem. Importe `BLESSING_IDS` de `'../data'` e `eraMythOn` de `'./restrictions'`.
  As Bênçãos seguem a regra "o resto só com sobra" de hoje (não são linha).
- [ ] **E3. Criaturas do Estaleiro.** Função nova, logo acima de `manageNavy`, chamada em `aiThink` **logo depois** de
  `manageNavy(state, player, snap);` (uma vez por pensamento; **não** no fim de `manageTraining`, que tem `return` no meio):
  ```ts
  /** E6: criaturas do Estaleiro (Escila, Hipocampo, Ceto) — só quem já tem frota (≥ 2 navios de guerra) e Favor. */
  function trainSeaMyths(state: GameState, player: Player, snap: Snapshot): void {
    if (player.resources.favor <= 40) return;
    // frota de verdade: Hipocampo e Escila também são `naval` (estão em snap.ships), mas não contam como navio de guerra
    if (snap.ships.filter((u) => isMilitary(u) && !UNITS[u.type].tags.includes('myth')).length < 2) return;
    for (const b of snap.byType.get('shipyard') ?? []) {
      if (!b.complete || b.queue.length > 0) continue;
      const opts = (BUILDINGS.shipyard.trains ?? []).filter((u) => UNITS[u].tags.includes('myth') && canTrain(state, player, b, u).ok);
      if (opts.length > 0) { applyCommand(state, { type: 'train', player: player.id, buildingId: b.id, unit: opts[opts.length - 1] }); return; }
    }
  }
  ```
  (`snap.ships` é o da E4.) No `manageNavy` da E4, o treino de guerra é
  `c = pick((d) => d.tags.includes('military'))` — o `pick` faz `choices.find(…)` sobre `trainChoices(…, 'shipyard')`, e
  as criaturas (militares, sem linha) entram no fim dessa lista: com o navio de guerra sem recurso, o `find` cairia na
  Escila. Troque esse predicado por `(d) => d.tags.includes('military') && !d.tags.includes('myth')` (e o do `queued`
  logo antes, na mesma linha, também): as criaturas saem só pelo `trainSeaMyths`, com a regra de Favor e frota.
- [ ] **E4. Temple.** Nada a mudar: a IA já treina a **última** criatura treinável de `BUILDINGS.temple.trains`, e o passo
  A6 pôs as novas em ordem de Era. A escolha do deus menor (`(personalidade + Era) % 2`) também já serve aos pares novos.

*Confira:* `npx vitest run tests/movement-ai.test.ts tests/position-fairness.test.ts tests/determinism.test.ts`
e `npm run smoke 20 42` duas vezes com o mesmo "hash final".

### Bloco F — Efeitos, arte provisória e áudio

- [ ] **F1. `src/render/art/alias.ts` (da E2).** As 12 entradas da seção "Arte provisória".
- [ ] **F2. `src/render/fx/types.ts`.** `'divine'` no **fim** de `EFFECT_TYPES` (troque o número no comentário "Os N
  tipos"); `'spring', 'gale', 'sun_chariot'` no fim de `TIMED_TYPES`.
- [ ] **F3. `src/render/fx/handlers/divine.ts` (novo).**
  ```ts
  // Poderes e criaturas da E6 (docs/eras/E6-mitologia.md): arte PROVISÓRIA até a E8 — um anel de luz na cor do poder, um brilho
  // e centelhas no ponto (`data` = raio em tiles, `src` = id do poder ou 'phoenix' no renascimento); os poderes com duração
  // (Primavera, Vendaval, Carro do Sol) têm um handler de duração simples. Nada aparece fora da vista (névoa) nem fora da tela.
  import type { FxHandler, TimedHandler } from '../types';
  import { PRIO } from '../../particles';
  import { flame, glow, haze, motes, ring } from '../emitters';
  import { every, inDisc } from './kit';
  import { FRESH, TILE } from './util';

  const R = Math.random;
  const pt = { x: 0, y: 0 };
  /** Cor de cada poder novo (e do renascimento da Fênix). */
  export const DIVINE_TINT: Record<string, number> = {
    panic: 0x9a7a3a, crossroads: 0x8a5ad8, spring: 0x8ce07a, gale: 0xcfe3f0, tidal_wave: 0x3a9ad8,
    divine_harvest: 0xf0c850, sun_chariot: 0xffb040, winged_victory: 0xfff0b0, retribution: 0xc0304a, phoenix: 0xff8a30,
  };

  export const divine: FxHandler<null> = {
    create(e, fx, age) {
      if (age > FRESH) return null;
      const r = Number(e.data) || 3;
      if (!fx.onScreen(e.x, e.y, r) || !fx.visibleAt(e.x, e.y)) return null;
      const tint = DIVINE_TINT[String(e.src)] ?? 0xffe3a0, x = e.x * TILE, y = e.y * TILE, R0 = r * TILE;
      ring(fx.particles, fx.tex, x, y, R0 * 0.15, R0, tint, 1.0, 'add', PRIO.power, 0.85);
      glow(fx.particles, fx.tex, x, y, 6, Math.max(24, R0 * 0.8), tint, 1.2, PRIO.power, 0.5);
      motes(fx.particles, fx.tex, x, y, 10 + Math.round(r * 2), tint, R0 * 0.8, PRIO.power, 30);
      return null;
    },
  };

  interface S { acc: { acc: number } }
  function area(kind: 'spring' | 'gale'): TimedHandler<S> {
    return {
      create() { return { acc: { acc: 0 } }; },
      update(tm, s, fx) {
        if (tm.x === undefined || tm.y === undefined || fx.dt <= 0) return;
        const r = tm.data ?? 6;
        if (!fx.onScreen(tm.x, tm.y, r) || !fx.visibleAt(tm.x, tm.y)) return;
        for (let n = every(s.acc, 10 + r * 2, fx.dt); n > 0; n--) {
          inDisc(tm.x, tm.y, r, pt);
          if (!fx.visibleAt(pt.x, pt.y)) continue;
          if (kind === 'spring') motes(fx.particles, fx.tex, pt.x * TILE, pt.y * TILE, 1, DIVINE_TINT.spring, 4, PRIO.power, 18);
          else haze(fx.particles, fx.tex, pt.x * TILE, pt.y * TILE, 1, 6, DIVINE_TINT.gale, { alpha: 0.3, life: 1.2, scale: 1, rise: 4, prio: PRIO.power });
        }
      },
    };
  }
  export const springTimed = area('spring');
  export const galeTimed = area('gale');
  /** Carro do Sol: chamas no chão ao longo da faixa (centro tm.x/tm.y, direção tm.dx/tm.dy, meio-comprimento tm.data, meia-largura 1,5). */
  export const sunChariotTimed: TimedHandler<S> = {
    create() { return { acc: { acc: 0 } }; },
    update(tm, s, fx) {
      if (tm.x === undefined || tm.y === undefined || fx.dt <= 0) return;
      const half = tm.data ?? 8, dx = tm.dx ?? 1, dy = tm.dy ?? 0;
      if (!fx.onScreen(tm.x, tm.y, half)) return;
      for (let n = every(s.acc, 30, fx.dt); n > 0; n--) {
        const a = (R() * 2 - 1) * half, b = (R() * 2 - 1) * 1.5;
        const x = tm.x + dx * a - dy * b, y = tm.y + dy * a + dx * b;
        if (!fx.visibleAt(x, y)) continue;
        flame(fx.particles, fx.tex, x * TILE, y * TILE, 0, 0.8, 0.7, PRIO.power, undefined, true);
      }
    },
  };
  ```
  (No render `Math.random` é permitido; o `tests/determinism.test.ts` só varre `src/core`.)
- [ ] **F4. `src/render/fx/registry.ts`.**
  - `import { divine, galeTimed, springTimed, sunChariotTimed } from './handlers/divine';`
  - `divine` no fim de `FX_HANDLERS`; `spring: springTimed, gale: galeTimed, sun_chariot: sunChariotTimed` no fim de
    `TIMED_HANDLERS`;
  - no fim de `POWER_ART`:
    ```ts
    // E6 (provisório até a E8: src/render/fx/handlers/divine.ts)
    panic: 'effect:divine', crossroads: 'effect:divine', spring: 'effect:divine+timed:spring', gale: 'effect:divine+timed:gale',
    tidal_wave: 'effect:divine', divine_harvest: 'effect:divine', sun_chariot: 'effect:divine+timed:sun_chariot',
    winged_victory: 'effect:divine', retribution: 'effect:divine',
    ```
- [ ] **F5. `src/audio/events.ts`, `cuesForEffect`.** Antes do `default:`:
  `case 'divine': return [{ recipe: 'summon', x: fx.x, y: fx.y }];   // E6: poderes novos (provisório)`.
- [ ] **F6. `tests/fx-registry.test.ts`.** No `it('cada um dos N tipos …')`: troque o número do título; acrescente
  `mk('divine', { data: 6, src: 'panic', owner: 0, ttl: 30, total: 30 }),` à lista do `st.effects.push(` e, ao
  `st.timed.push(`, `{ type: 'spring', owner: 0, until: st.tick + 200, x: cx, y: cy, data: 6 }, { type: 'gale', owner: 0, until: st.tick + 200, x: cx, y: cy, data: 8 }, { type: 'sun_chariot', owner: 0, until: st.tick + 120, x: cx, y: cy, data: 8, dx: 1, dy: 0, mult: 1 }`.

*Confira:* `npx vitest run tests/fx-registry.test.ts tests/fx-logic.test.ts tests/audio.test.ts tests/art-etapa6.test.ts tests/art-library.test.ts tests/art-manifest.test.ts`.

### Bloco G — Ícones do HUD

- [ ] **G1. `scripts/bake/hud/catalog.mjs`.** As entradas de `POWER_ICONS`, `TECH_ICONS` e `GODS` da seção "Arte
  provisória". Em `techIconKey`, troque o grupo da expressão por `(civic|commerce|military|science|harvest|blessing)`
  (mantenha a linha `evo_` da E3 e o que mais E1–E4 puseram).
- [ ] **G2. `src/ui/icons.ts`, `techIconName`.** A mesma troca da expressão (`…|harvest|blessing)\d$`). As duas funções
  têm de dar o mesmo nome para todo id (`tests/hud-icons.test.ts`).
- [ ] **G3. `scripts/bake/page/hud-gods.js`.** No fim do objeto `GODS` (antes do `};`), os 9 bustos. Eles usam só o que
  o arquivo já tem (`base`, `wreath`, `at`, os materiais de `G(...)` e `M.wood`/`M.feather`). Acrescente também uma linha
  por deus no comentário do topo.
  ```js
  // ---- E6: deuses das Eras V–VII (provisórios até a E8) ----
  pan(THREE, M, g) {
    const r = base(THREE, M, g, { hair: 'wild', beard: 'full', hairColor: 0x4a3420, iris: g.iris, drape: 0x6b5a2a, drapeWidth: 0.16, drapeTilt: -0.7, tone: 'ruddy', seed: 30 });
    wreath(THREE, r.J.head, g.ivy, { r: 0.13, n: 16 });
    for (const s of [-1, 1]) {   // chifres de bode curvos saindo da testa
      const pts = [];
      for (let i = 0; i <= 12; i++) { const k = i / 12; pts.push(new THREE.Vector3(s * (0.05 + 0.07 * k), 0.2 + 0.1 * Math.sin(k * 2.2), -0.03 + 0.09 * k)); }
      r.J.head.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.014, 6), g.spot));
    }
    return r;
  },
  hecate(THREE, M, g) {
    const r = base(THREE, M, g, { female: true, hair: 'long', hairColor: 0x1c1418, iris: g.irisGrey, dress: 0x2e2440, collar: g.silver, seed: 32 });
    const d = new THREE.Group(); d.position.set(0, 0.18, 0.004); d.rotation.x = 0.2; r.J.head.add(d);
    { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.006, 6, 40), g.silver); ring.rotation.x = Math.PI / 2; d.add(ring); }
    d.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), g.silver), 0, 0.05, -0.12));   // a lua cheia na tiara
    for (const s of [-1, 1]) {   // duas tochas acesas atrás dos ombros
      const tg = new THREE.Group(); tg.position.set(s * 0.3, 0, 0.12); r.human.group.add(tg);
      tg.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1.9, 8), M.wood), 0, 0.95, 0));
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), g.fire); f.scale.set(1, 1.6, 1); f.position.set(0, 1.98, 0); f.userData.noShadow = true; tg.add(f);
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), g.fireCore); c.position.set(0, 1.96, -0.01); c.userData.noShadow = true; tg.add(c);
    }
    return r;
  },
  persephone(THREE, M, g) {
    const r = base(THREE, M, g, { female: true, hair: 'long', hairColor: 0x6a2a1c, iris: g.iris, dress: 0x7a3a5a, collar: g.gold, seed: 34 });
    wreath(THREE, r.J.head, g.leaf, { r: 0.126, n: 20, berry: g.rose, berryEvery: 4 });   // coroa de flores com romãs
    r.J.head.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 12), g.rose), 0.11, 0.15, -0.03));
    return r;
  },
  aeolus(THREE, M, g) {
    const r = base(THREE, M, g, { hair: 'wild', beard: 'full', hairColor: 0x9aa0a6, iris: g.irisBlue, drape: 0x8aa6c0, drapeWidth: 0.2, drapeTilt: 0.8, seed: 36 });
    for (let k = 0; k < 3; k++) {   // redemoinhos de vento em volta da cabeça
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.17 + k * 0.05, 0.006, 6, 48, Math.PI * 1.3), g.glowWhite);
      w.position.set(0, 0.14 + k * 0.03, 0.02); w.rotation.set(Math.PI / 2 - 0.2, 0, k * 1.7); w.userData.noShadow = true; r.J.head.add(w);
    }
    return r;
  },
  triton(THREE, M, g) {
    const r = base(THREE, M, g, { hair: 'wild', hairColor: 0x2f5a52, iris: g.irisBlue, drape: 0x1f6f78, drapeWidth: 0.18, seed: 38 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.007, 6, 40), g.pearl); band.position.set(0, 0.165, 0.005); band.rotation.x = Math.PI / 2 + 0.15; r.J.head.add(band);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 12), g.pearl); c.position.set(0.26, 1.62, -0.05); c.rotation.set(0, 0, -1.1); r.human.group.add(c);   // a concha
    return r;
  },
  demeter(THREE, M, g) {
    const r = base(THREE, M, g, { female: true, hair: 'long', hairColor: 0xb0843a, iris: g.iris, dress: 0x9a7a36, collar: g.gold, seed: 40 });
    wreath(THREE, r.J.head, g.leafGold, { r: 0.126, n: 24 });   // coroa de espigas
    for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 4), g.leafGold); s.position.set(0.26 + (i - 3) * 0.012, 1.55, -0.06); s.rotation.z = (i - 3) * 0.06; r.human.group.add(s); }
    return r;
  },
  helios(THREE, M, g) {
    const r = base(THREE, M, g, { hair: 'curls', hairColor: 0xd8a640, iris: g.irisBlue, drape: 0xc8662a, drapeWidth: 0.18, seed: 42 });
    const c = new THREE.Group(); c.position.set(0, 0.18, 0.004); c.rotation.x = 0.12; r.J.head.add(c);   // coroa radiada
    for (let k = 0; k < 13; k++) { const a = -1.3 + (k / 12) * 2.6; const ray = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.13, 5), g.glowGold); ray.position.set(Math.sin(a) * 0.12, 0.06, -Math.cos(a) * 0.12); ray.rotation.set(-Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3); ray.userData.noShadow = true; c.add(ray); }
    return r;
  },
  nike(THREE, M, g) {
    const r = base(THREE, M, g, { female: true, hair: 'long', hairColor: 0x5a3b22, iris: g.iris, dress: 0xe9e2d0, collar: g.gold, seed: 44 });
    wreath(THREE, r.J.head, g.leafGold, { r: 0.124 });
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {   // asas abertas atrás dos ombros
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42 - i * 0.04, 0.012), M.feather);
      f.position.set(s * (0.2 + i * 0.05), 1.55 + i * 0.04, 0.16); f.rotation.z = s * (0.5 + i * 0.12); r.human.group.add(f);
    }
    return r;
  },
  nemesis(THREE, M, g) {
    const r = base(THREE, M, g, { female: true, hair: 'long', hairColor: 0x2a1c18, iris: g.irisGrey, dress: 0x3a3a46, collar: g.darkMetal, seed: 46 });
    const d = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.008, 6, 40), g.darkMetal); d.position.set(0, 0.18, 0.004); d.rotation.x = Math.PI / 2 + 0.2; r.J.head.add(d);
    const bal = new THREE.Group(); bal.position.set(-0.3, 1.5, 0.1); r.human.group.add(bal);   // a balança atrás do ombro
    bal.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6), g.gold), 0, 0.25, 0));
    bal.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.012), g.gold), 0, 0.5, 0));
    for (const s of [-1, 1]) bal.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.02, 12), g.gold), s * 0.16, 0.38, 0));
    return r;
  },
  ```
- [ ] **G4. Itere um retrato e depois gere o atlas** (precisa do Chromium do Playwright; veja o CLAUDE.md):
  ```sh
  npm run art:hud -- --only god/pan,god/hecate,god/persephone,god/aeolus,god/triton,god/demeter,god/helios,god/nike,god/nemesis --scale 2 --contact /tmp/e6-gods
  ```
  Olhe a folha de contato com a ferramenta Read: o rosto em três quartos, o atributo dentro do quadro, nada cortado. Se um
  atributo sair do quadro ou cobrir o rosto, ajuste só a posição dele (y/z) e repita. Depois:
  ```sh
  npm run art:hud
  npm run art:check
  npx vitest run tests/hud-icons.test.ts
  ```
  O `art:check` sai sem erro; `git status` mostra em `public/art` só `hud-*` e `manifest.json` mudados. **Não** rode
  `npm run art:bake`.

### Bloco H — Interface

- [ ] **H1. `src/ui/train-hotkey.ts` (novo).**
  ```ts
  // E6: várias unidades dividem a mesma tecla de treino (as criaturas do Templo usam Z; o Estaleiro tem Z/X/C): a tecla
  // escolhe, entre os candidatos, a de Era mais alta que o jogador pode treinar agora (deus certo, Era alcançada, sem versão
  // nova como o Colosso na VII); sem nenhuma assim, a primeira (o comando devolve o motivo da recusa). Pura: os testes a usam sem DOM.
  import { UNITS } from '../core/data';
  import type { Player } from '../core/types';
  import { godAllows } from '../core/sim/commands';
  import { mythUpgradeOf } from '../core/sim/myth';

  export function pickTrainHotkey(player: Player, candidates: string[]): string | null {
    if (candidates.length <= 1) return candidates[0] ?? null;
    let best: string | null = null;
    for (const id of candidates) {
      const d = UNITS[id];
      if (!d || d.age > player.age || !godAllows(player, id) || mythUpgradeOf(id, player.age) !== id) continue;
      if (best === null || d.age > UNITS[best].age) best = id;
    }
    return best ?? candidates[0];
  }
  ```
- [ ] **H2. `src/ui/input.ts`.**
  1. `usePowerAt`, antes do `else s.issue({ type: 'power', … x, y });` final:
     ```ts
     else if (def.targeting === 'group') {   // E6: Encruzilhada — o grupo é a seleção
       const ids = s.ownSelectedUnits().map((u) => u.id);
       if (ids.length === 0) { this.hud.toast(t('msg.selectGroup'), 'warn'); return; }
       this.hud.issueChecked({ type: 'power', player: s.local, power: id, x, y, ids });
     }
     ```
  2. A mira: troque `powerTarget: power && power.radius ? { radius: power.radius } : null` por
     `powerTarget: power && power.radius ? { radius: powerRadius(s.state, s.player, s.ui.powerId!) ?? power.radius } : null`
     (importe `powerRadius` de `'../core/sim/divine'`).
  3. No `else if (b) {` de `onKey`, troque o laço que procura a tecla de treino (o `for … if (UNITS[ut].hotkey === keyU)` de
     hoje ou o laço sobre `trainChoices` da E3) por: colete **todos** os candidatos com a tecla e escolha com
     `pickTrainHotkey`:
     ```ts
     const cands = trainChoices(s.state, s.player, b.type).filter((c) => c.hotkey === keyU).map((c) => c.send);
     const pick = pickTrainHotkey(s.player, cands);
     if (pick) { this.hud.issueChecked({ type: 'train', player: s.local, buildingId: b.id, unit: pick }); return; }
     ```
     (importe `pickTrainHotkey` de `'./train-hotkey'`; `trainChoices` já é importado pela E3).
- [ ] **H3. `src/ui/hud.ts`.**
  1. `refreshGods`: troque a linha do `e.dataset.tip` do poder por
     ```ts
     const sc = powerScale(s.state, p, ps.id);   // E6: força da Era
     e.dataset.tip = `<b>${def.name}</b><div class="desc">${def.desc}</div>${sc > 1.001 ? `<div class="desc">${t('power.scale', { pct: Math.round((sc - 1) * 100) })}</div>` : ''}`;
     ```
     (a E7 já mexeu nessa linha para os usos extras: acrescente a linha da força **sem tirar** o que ela pôs). Importe
     `powerScale` de `'../core/sim/divine'`. O painel só se redesenha quando a `key` do `refreshGods` muda, e ela não tem a
     Era: acrescente `+ '|' + p.age` no fim da `const key = …` (senão a "Força da Era" fica velha depois de avançar, por
     exemplo para a VIII, que não traz deus menor).
  2. `activatePower`, no `t(...)` do alvo: `def.targeting === 'group' ? 'msg.powerTarget.group' : …` antes do
     `'msg.powerTarget.place'`.
  3. `refreshCommands`, no laço das pesquisas do edifício: `if (tech.blessing && !eraMythOn(s.state)) continue;   // E6`.
  4. `refreshCommands`, no laço dos botões de treino (o `for (const ch of trainChoices(s.state, p, b.type))` da E3): logo no
     começo, `if (mythUpgradeOf(ch.show, p.age) !== ch.show) continue;   // E6: o Colosso some na Era VII (sai o Talos)`.
  5. No mesmo laço, troque a linha do filtro de deus que a E3 manteve
     (`if (ud.god) { const major = MAJOR_GODS[p.god]; const ok = major.mythUnit === ut || p.minorGods.some(…) || ud.god === p.god; if (!ok) continue; }`)
     por `if (ud.god && !godAllows(p, ut)) continue;   // E6: mesma regra do canTrain (o Talos é de Hefesto, não é mythUnit de ninguém)`.
     Sem isto o botão do Talos nunca aparece (o atalho Z treinaria, mas o painel não mostra). Importe `godAllows` de
     `'../core/sim/commands'` (o `hud.ts` já importa `canTrain` de lá), `eraMythOn` de `'../core/sim/restrictions'` e
     `mythUpgradeOf` de `'../core/sim/myth'`.
  - Nenhum emoji em código (`tests/hud-icons.test.ts` varre `hud.ts`); textos só por `t(...)`.

*Confira:* `npx vitest run tests/hud-icons.test.ts tests/hud-text.test.ts tests/i18n.test.ts` e `npm run -s typecheck`.

### Bloco I — Testes novos e playtest

- [ ] **I1. `tests/myth-eras.test.ts` (novo).** Os casos da seção "Testes"; esqueleto e utilidades:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { quickGame, run } from './helpers';
  import { createGame } from '../src/core/sim/game';
  import { AGES, BUILDINGS, MAJOR_GODS, MINOR_GODS, POWERS, TECHS, UNITS, MYTH_UPGRADES, BLESSED_TYPES, BLESSING_IDS, ERA_TITANS } from '../src/core/data';
  import { RESOURCES, TICK_RATE } from '../src/core/constants';
  import { spawnUnit, placeBuilding, recomputePop } from '../src/core/sim/entities';
  import { usePower } from '../src/core/sim/powers';
  import { powerScale, galeFactor, harvestMult } from '../src/core/sim/divine';
  import { applyMythUpgrades, mythUpgradeOf } from '../src/core/sim/myth';
  import { unitLayer, canBoard } from '../src/core/sim/naval';
  import { findPathEx } from '../src/core/map/pathfinding';
  import { stateHash } from '../src/core/net/hash';
  import { canTarget, computeDamage, applyDamage, killUnit, performAttack } from '../src/core/sim/combat';
  import { applyCommand, canTrain, canResearch, canAdvanceAge } from '../src/core/sim/commands';
  import { recomputeMods, refreshMaxHp, getUnitStats } from '../src/core/sim/modifiers';
  import { aiThink } from '../src/core/sim/ai';
  import { serialize, deserialize } from '../src/core/serialize';
  import { campaignMission, missionConfig } from '../src/core/scenario/campaign';
  import { pickTrainHotkey } from '../src/ui/train-hotkey';
  import { t } from '../src/i18n';

  const rich = (s: ReturnType<typeof quickGame>, p = 0) => { for (const r of RESOURCES) s.players[p].resources[r] = 99999; };
  const tcOf = (s: ReturnType<typeof quickGame>, p = 0) => [...s.buildings.values()].find((b) => b.owner === p && b.type === 'town_center')!;
  /** Partida sem combate automático (Trégua longa): os poderes agem, ninguém ataca sozinho. */
  const calm = (over = {}, ai = false) => { const s = quickGame(over, ai); s.ceasefireUntil = s.tick + 100000; s.players[0].visibility.fill(2); return s; };
  ```
  Escreva um `it` por caso, cada um com timeout explícito (`it('…', () => {…}, 30000)`) e **curto** (nenhum `run` maior
  que ~3 min de jogo; ver Armadilhas sobre o vitest). Para terminar um item de fila sem esperar, faça como o
  `tests/movement-ai.test.ts`: `b.queue[0].elapsed = b.queue[0].total - 0.01; run(s, 2);`. Treinar criatura pede população
  livre: o Centro Cívico dá 20 e o kit já ocupa uma parte; ponha 2 Casas prontas (`placeBuilding(s, 0, 'house', …, true)`)
  e chame `recomputePop(s, p)` antes de `canTrain`. Imports que não usar, apague (o typecheck não reclama, o leitor sim).
- [ ] **I2. `scripts/playtest-myth.mjs` (novo).** Modelo: `scripts/playtest-noemoji.mjs` (mesmo `chromium.launch`, mesma
  função `scan` de emoji, `window.aoe.session`, `window.aoe.debugSpawn`, `window.aoe.debugBuild`). Roteiro, em PT e em EN:
  1. Partida rápida (`#m-seed` 2024, 1 IA); espere `window.aoe.session`.
  2. `page.evaluate`: `p.age = 6`, `p.minorGods = ['athena', 'apollo', 'hera', 'pan', 'aeolus', 'helios']`, todos os
     recursos 99999, `p.visibility.fill(2)`, `p.powers` = os 9 poderes novos com `used: false`; 8 hoplitas do jogador 1 a
     ~8 tiles do Centro Cívico (`debugSpawn(1, 'hoplite', …)`); 6 unidades suas (`satyr`, `harpy`, `phoenix`, `talos`,
     `hoplite`, `hoplite`).
  3. Templo pelo `window.__build('temple')` do modelo; selecione-o: o painel tem botões das criaturas novas e uma
     Bênção; nenhum `#hud .hic-ph`; capture `docs/art/e6-templo.png` (só PT).
  4. Para cada poder, **nesta ordem** (os que matam por último; o Maremoto sozinho já tira 120 de hoplitas de 110 de vida):
     `crossroads`, `divine_harvest`, `winged_victory`, `retribution`, `spring`, `panic`, `gale`, `sun_chariot`, `tidal_wave` —
     `s.issue({ type: 'power', player: s.local, power: id, x, y, ids })` (`ids` = as suas 6 unidades só na Encruzilhada;
     `x, y` = o centro dos hoplitas inimigos **vivos**, recalculado antes de cada poder, ou um tile explorado a 12 tiles do CC
     na Encruzilhada; se não sobrar hoplita inimigo vivo, crie mais 8 com `debugSpawn` antes do próximo poder de área);
     espere 600 ms; confira `p.powers.find((x) => x.id === id).used === true`; capture `docs/art/e6-poder-<id>.png` (só PT);
     rode `scan`.
  5. Passe o mouse em cada `.pw` do painel de poderes (dicas) e rode `scan`.
  6. Falhe (código de saída 1) com qualquer `pageerror`, poder não usado, `hic-ph` ou emoji.

  Rode com `npm run build && npm run preview` em segundo plano: `node scripts/playtest-myth.mjs http://localhost:4173/`.
  Olhe as capturas com a ferramenta Read (os efeitos provisórios aparecem: anel/brilho na cor do poder; o Carro do Sol
  deixa chamas numa faixa).

### Bloco J — Verificação completa e documentação

- [ ] **J1.** A seção "Verificação", na ordem.
- [ ] **J2.** A seção "Ao terminar".

---

## Testes a escrever ou atualizar

| Arquivo | O que verifica |
|---|---|
| `tests/myth-eras.test.ts` (novo) — dados | 9 deuses novos com `age` 4/5/6, `power` em `POWERS`, `UNITS[mythUnit].god === id`, 2 `techs` com `god === id` e `age === deus.age`; cada `MAJOR_GODS[g].minorGods` com 6 pares, par k com `age === k + 1`; nas Eras V–VII, cada deus novo aparece em exatamente 2 dos 3 deuses maiores; `AGES[1..6].minorGod === true` e `AGES[7].minorGod === false`; `Object.keys(POWERS).length === 21`; `MYTH_UPGRADES.colossus` = `{ to: 'talos', age: 6 }`; idades dos heróis (tag `hero` sem `king`) ordenadas = `[0, 1, 2, 3, 4]`; Titãs com `age === ERA_TITANS`; `BLESSED_TYPES` sem Titã e com todas as `myth`/`hero` não Titã; `BLESSING_IDS` = `blessing2…8`, `age` 1…7, cada um com `prereq` do anterior; `UNITS.oceanus.amphibious === true`; `UNITS.ceto.amphibious && !UNITS.ceto.naval` |
| — escala | `quickGame()` (fora de cenário): jogador na Era 4 com `restoration` → `powerScale === 1.45`; Era 4 com `panic` → `1`; Era 7 com `bolt` → `2.05`; `quickGame({ eraMyth: false })` e `createGame(missionConfig(campaignMission('m8_oceano')!, 'normal'))` (cenário) → `powerScale === 1` para qualquer poder, mesmo com `p.age = 7` |
| — avanço à Era V | `calm()`, jogador 0 com `age = 3`, recursos ricos, os 7 estudos de linha que a Era 4 exige em `p.techs` + `recomputeMods`, Fortaleza e Biblioteca prontas (`placeBuilding(…, true)`): `canAdvanceAge(s, p, lib).minorOptions` = `['pan', 'hecate']`; `applyCommand` `advanceAge` (na Biblioteca) com `minorGod: 'pan'`, depois `lib.queue[0].elapsed = lib.queue[0].total - 0.01` e `run(s, 2)` (não espere os 120 s) → `age === 4`, `minorGods` contém `pan`, `powers` contém `panic` |
| — Era inicial | `quickGame({ startingAge: 6 })`: jogador humano com `minorGods` = `['athena', 'apollo', 'hera', 'pan', 'aeolus', 'helios']` e 7 poderes |
| — poderes | Um `it` por poder, com `calm()` e o jogador 0 na Era do poder: **Pânico** (3 hoplitas do jogador 1 perto do ponto: `fearUntil > tick`, ordem `move`, `canTarget(hoplita, cidadão 0) === false`; depois de `run` 9 s, `true`; sem inimigos: `reason === t('err.noEnemiesHere')` e o poder segue `used: false`); **Encruzilhada** (12 hoplitas selecionados → 10 vão para ≤ 7 tiles do destino; `visibility.fill(0)` → `t('err.crossroadsDest')`; só navios/Titã → `t('err.crossroadsNoUnits')`); **Primavera** (hoplita do jogador 1 morto na área por `killUnit(s, u, 0)` → existe uma `shade` do jogador 0 no ponto e `timed[…].count === 1`; morto fora da área: nada); **Vendaval** (num ponto com 6 tiles livres a leste: hoplita do jogador 1 a 2 tiles a leste do ponto termina a ≥ 4 tiles dele, ou seja, recuou ≥ 2; `galeFactor(s, hoplita) === 0.5` e, num navio inimigo da E4 na área, `0`; edifício próprio com metade da vida recupera +20 %); **Maremoto** (Ciclope do jogador 1 perde exatamente 120; edifício perde 300); **Colheita** (`harvestMult === 1.5` até o fim e `1` depois); **Carro do Sol** (CC em `tc`, ponto `tc.x + 10`: Ciclope a `+3` no eixo perde vida depois de 1 s, um a `+4` de lado não); **Vitória Alada** (`computeDamage` de um hoplita ×1,3 ± 0,1); **Retribuição** (jogador 1 com `nemesisUntil`; `applyDamage(s, ciclope1, 100, 0, hoplita0)` → hoplita perde 50) |
| — criaturas | Empusa ferida ataca e recupera vida (`performAttack`); Fênix: `killUnit(s, f, 1)` → viva, `reborn`, metade da vida; segundo `killUnit` → morta; `canTarget(grifo, harpia) === true`, `canTarget(hoplita, harpia) === false`; `getUnitStats(...).range` do Sátiro = 5 e ele tem a tag `skirmisher` |
| — Talos | jogador com `minorGods` incluindo `hephaestus`, `age = 6`, um `colossus` vivo com metade da vida → `applyMythUpgrades` + `refreshMaxHp` → tipo `talos`, fração 0,5 ± 0,02, efeito `evolve`; `canTrain(templo, 'colossus')` → `t('err.mythUpgraded', …)`; `canTrain(templo, 'talos').ok` com recursos; um item `colossus` na fila do Templo (`elapsed = total − 0,01`, 1 `tick`) nasce `talos`; `mythUpgradeOf('colossus', 5) === 'colossus'` |
| — Bênçãos | `canResearch(templo, 'blessing2')` ok em `quickGame` com `p.age = 1` e recursos, e recusada com `t('err.classicMyth')` em `quickGame({ eraMyth: false })` (mesmo efeito de um cenário, sem montar roteiro); depois de pôr `blessing2` em `p.techs` + `recomputeMods`: `getUnitStats(minotaur).hp === round(380 × 1,2)` e `getUnitStats(prometheus).hp` igual ao de antes (só o reforço da D20) |
| — Titãs | `quickGame()`: `getUnitStats(s, p0, 'oceanus').hp === 13000` (6500 × 2) e `.attack === 262.5` (175 × 1,5); `quickGame({ eraMyth: false })`: `6500` e `175`. (Não use a m8 aqui: os mods do jogador da missão podem ter outros efeitos em `myth`, e o Oceano tem a tag `myth`.) |
| — anfíbio | `unitLayer(quickGame(), UNITS.oceanus) === 'amphibious'`; na `m8`: `'land'`; num mapa com uma faixa de água (como o de `tests/naval.test.ts` da E4): `findPathEx(…, 'land')` não atravessa e `findPathEx(…, 'amphibious')` atravessa; `canBoard` recusa o Ceto |
| — tecla | `pickTrainHotkey(p, ['pegasus', 'minotaur', 'satyr'])`: Zeus com `athena` e `pan` na Era 4 → `'satyr'`; sem `pan` → `'minotaur'`; `['colossus', 'talos']` na Era 6 com Hefesto → `'talos'` |
| — IA | `quickGame({}, true)`, jogador 0 só com o poder testado, `ai.nextThink = 0`, `ai.defending = tick`, 8 hoplitas do jogador 1 a 3 tiles do CC 0: depois de `aiThink(s, p)`, `panic` usado; o mesmo para `gale` e `retribution`; `divine_harvest` com 30 cidadãos; `winged_victory` com `ai.attackTarget` = o CC inimigo; Templo pronto, os 5 heróis vivos, `minorGods` `['athena', 'apollo', 'hera', 'pan']`, `age = 4`, recursos ricos → depois de `aiThink`, a fila do Templo tem `satyr`; Templo e 3 Minotauros na Era 1 com recursos → em `run` de 60 s, `blessing2` fica em `p.techs` ou na fila |
| — save | depois de usar Primavera, Carro do Sol e Pânico: `const a = serialize(s); expect(serialize(deserialize(a))).toBe(a)`; 100 ticks depois de `deserialize`, `stateHash` igual ao da partida contínua |
| `tests/data.test.ts` | `minorGods.length` = 6 (passo A12) |
| `tests/fx-registry.test.ts` | `divine` e os 3 `TimedEffect` no teste do `FxSystem` (passo F6); o resto passa sozinho |
| `tests/movement-ai.test.ts` | O `it` da E1 "avançar para uma Era sem deus menor (V) ignora o deus enviado" deixa de valer (a V agora tem deus). Troque-o por "avançar para a Era VIII ignora o deus enviado": `p.age = 6`; `p.minorGods = ['athena', 'apollo', 'hera', 'pan', 'aeolus', 'helios']`; `p.techs` = os 16 estudos de nível 1–4 das 4 linhas (`civic1…4`, `commerce1…4`, `military1…4`, `science1…4`); recursos `99999` para todo `RESOURCES`; Biblioteca pronta (como a E1 deixou o teste); `advanceAge` com `minorGod: 'artemis'` → `lib.queue[0].id === 'age:'`; `lib.queue[0].elapsed = lib.queue[0].total - 0.01; run(s, 2)` → `age === 7` e `minorGods` igual à lista de antes |
| `tests/eras.test.ts` (da E1) | Deve passar sem mudança (a regra `minorGod` × pares acompanha). Se algum `it` espera `minorGods` de uma Era inicial ≥ 5 com 3 itens, troque pelo número certo (1 por Era pulada de II a VII) |
| `tests/unit-lines.test.ts` (da E3; o caso do Estaleiro é da E4) | As conferências de `trainChoices(…, 'shipyard')` passam a ver as 3 criaturas no fim (sem linha, com `god`). Não mude a regra: filtre-as na asserção (`.filter((c) => !UNITS[c.show].tags.includes('myth'))`) — com linhas: ainda Q pesca, W transporte, E guerra (e o `M` do mercante, que a E5 pôs antes); no elenco clássico, os navios do `trains`. Se a asserção comparar com `BUILDINGS.shipyard.trains` inteiro, compare com ele filtrado do mesmo jeito |
| `tests/naval.test.ts` (da E4) | Acrescente: Escila e Hipocampo treinados no Estaleiro nascem na água (`isNavigableTerrain` no tile); Ceto treinado no Estaleiro anda até um tile de terra a 10 tiles e volta para a água; `canTarget(hoplita, ceto)` é `false` com o Ceto na água aberta e `true` com ele em terra |
| `tests/i18n.test.ts`, `tests/hud-icons.test.ts`, `tests/art-etapa6.test.ts`, `tests/audio.test.ts` | sem mudança de código: passam com os dados, o alias, o catálogo e o `npm run art:hud` |

---

## Verificação

Na ordem; o que esperar de cada um:

1. `npm run -s typecheck` — sem erro.
2. `npx vitest run tests/myth-eras.test.ts tests/data.test.ts tests/i18n.test.ts tests/fx-registry.test.ts tests/hud-icons.test.ts tests/movement-ai.test.ts tests/eras.test.ts tests/naval.test.ts tests/unit-lines.test.ts tests/determinism.test.ts tests/command-fuzz.test.ts tests/sim.test.ts`
   — tudo verde.
3. `npm test` — tudo verde. Se sair `Timeout calling "onTaskUpdate"` com código 1 e **todos** os testes passando, é a
   falha conhecida do vitest numa máquina carregada (`docs/QA.md`): divida o `it` mais longo, ponha timeout explícito e rode
   de novo; não ignore um teste vermelho de verdade.
4. `npm run smoke 20 42` duas vezes — o mesmo "hash final" nas duas (determinismo). Ele pode ser diferente do de
   `/tmp/e6-smoke-antes.txt` (escala dos poderes desde a Era II): é esperado.
5. `npm run balance 35 1,2,3` — minutos das Eras II–IV a ±1 min do "antes" (`/tmp/e6-balance35-antes.txt`; a escala nessas Eras é pequena). Se uma Era
   passar disso, confira primeiro se algum `case` velho de `usePower` ficou com a escala na dimensão errada.
6. `npm run balance 60 1,2,3` — nenhuma `PARADA`; as IAs passam das Eras V–VII com deuses novos (o resumo do balance
   mostra os minutos). Anote os minutos no `docs/eras/PROGRESSO.md`.
7. `npx tsx scripts/missions.ts` — **os mesmos veredictos e minutos** de `/tmp/e6-missions-antes.txt` (diff; só a linha
   do tempo total pode mudar). Qualquer diferença é vazamento do `eraMyth`/`navalOn` para cenário: procure uma escala, Bênção,
   reforço de Titã ou camada anfíbia sem a guarda.
8. `npx tsx scripts/horde.ts` — passa como antes.
9. `npx vitest run tests/position-fairness.test.ts` e
   `npx tsx scripts/maps/fairness.ts egeu 60 1-16 zeus --both --jobs 3`, depois o mesmo com `estreito` — critério de
   sempre (nenhum lado com > 65 % das decididas + à frente, por posição e por índice). Um "fora" isolado com 16 sementes
   pede confirmação em 32 (`101-132`). Registre no `PROGRESSO.md`.
10. Criaturas navais na prática (sem teste automático): numa partida `coastal` de 2 IAs Poseidon começando na Era V
    (na raiz do repositório; o `tsx -e` aceita `import`, conferido em 09/10/2026),
    ```sh
    npx tsx -e "import { createGame, tick } from './src/core/sim/game'; const s = createGame({ seed: 42, mapSize: 'small', mapType: 'coastal', startingAge: 4, players: [0, 1].map((i) => ({ name: 'IA' + i, god: 'poseidon', isAI: true, difficulty: 'hard' })) } as never); for (let i = 0; i < 15 * 60 * 20; i++) tick(s); console.log([...s.units.values()].filter((u) => !u.dead && ['scylla', 'hippocampus', 'ceto'].includes(u.type)).length)"
    ```
    — espera-se ≥ 1 (se der 0, confira `trainSeaMyths`, o Favor das IAs e se alguma ergueu Estaleiro; não é critério de
    pronto, é diagnóstico: anote no `PROGRESSO.md`).
11. `npm run art:check` — sem erro (o atlas `hud` = catálogo).
12. `npm run build`, `npm run preview` em segundo plano e:
    `node scripts/playtest-myth.mjs http://localhost:4173/` (sai 0; olhe as capturas `docs/art/e6-*.png` com Read),
    `node scripts/playtest-noemoji.mjs http://localhost:4173/` (sai 0) e `node scripts/playtest.mjs` (o fluxo básico
    continua).

---

## Critérios de pronto

- [ ] Os 6 pares por deus maior, `AGES[1..6].minorGod` ligados; avançar à V, VI e VII oferece os deuses novos (jogador e IA).
- [ ] Os 9 poderes novos funcionam como na tabela, com efeito provisório visível, áudio e dica no HUD (com a "Força da Era").
- [ ] Os 12 poderes de hoje crescem com a Era fora de cenário (tabela "Escala") e não mudam em cenário.
- [ ] As 12 criaturas treinam onde a tabela diz, com os atalhos certos; Escila e Hipocampo nadam, Ceto e Oceano (fora de
      cenário) andam e nadam; Harpia, Dragão, Fênix e Grifo voam; a Fênix renasce uma vez; a Empusa se cura; o Grifo luta no ar.
- [ ] Na Era VII os Colossos viram Talos e o Templo passa a treinar Talos.
- [ ] As 7 Bênçãos aparecem no Templo fora de cenário e fortalecem míticas e heróis, não os Titãs.
- [ ] Titãs reforçados fora de cenário; o Raio tira até 75 % de um Titã na Era VIII.
- [ ] A IA usa os 9 poderes, treina as criaturas novas (as navais com frota) e estuda as Bênçãos.
- [ ] Nenhum ícone vazio (`hic-ph`) nem emoji no HUD em PT e EN; 9 retratos novos no atlas `hud`.
- [ ] `npm test`, `npm run -s typecheck`, `npm run art:check` e os playtests verdes; `scripts/missions.ts` idêntico ao "antes".
- [ ] `SIM_VERSION` +1; saves da E7 (a etapa anterior na ordem oficial) carregam (campos novos opcionais).
- [ ] `docs/eras/PROGRESSO.md`, `docs/ROADMAP.md`, `CLAUDE.md` e `docs/EDITOR.md` atualizados; um commit em português.

---

## Armadilhas

- **Deixar `minorGod: false` nas Eras 4–6 com os pares criados** (ou o contrário): com `false`, os deuses novos nunca são
  oferecidos; com `true` sem par, o avanço recusa "Escolha um deus menor" e todos travam. Os dois andam juntos (A3 + A4).
- **Mudar os 3 primeiros pares**: a campanha dá deuses por roteiro e o harness/IA escolhe `(personalidade + Era) % 2`; os
  pares das Eras II–IV têm de ficar idênticos.
- **Escala vazando para a campanha**: toda regra nova de força por Era passa por `eraMythOn(state)` (`powerScale`,
  Bênçãos em `canResearch`, reforço dos Titãs) e o anfíbio por `navalOn` (`unitLayer`). O `scripts/missions.ts` idêntico ao
  "antes" é a prova; diferença = bug, não "ajuste de janela".
- **Marcar `ps.used` dentro de um `case`** ou dar `return { ok: true }` cedo: pula o `recordPowerUse` (G11 dos cenários) e
  o evento `powerUsed` (que os efeitos e o áudio usam). Todo `case` termina em `break`; só as recusas usam `return { ok: false … }`.
- **Escalar a dimensão errada** (por exemplo o raio da Pestilência em vez da duração): o efeito visual lê o raio do `data`
  e a IA calcula alvos com o raio de `POWERS`. Siga a tabela "Escala" ao pé da letra.
- **`TimedEffect` sem `mult`/`dx`/`dy` em save antigo**: leia sempre com `?? 1` / `?? 1` / `?? 0`. Campos novos de
  `Unit`/`Player` são opcionais e lidos com `?? 0` (`fearUntil`, `harvestUntil`, `nikeUntil`, `nemesisUntil`) ou
  `!u.reborn`; nunca `Infinity` nem `NaN` (o JSON vira `null`).
- **Mexer em posições durante `rt.hash.each`**: o Vendaval e a Encruzilhada movem unidades; use `rt.hash.query` (devolve
  uma lista) antes de mexer, como no código dado. O hash é refeito a cada tick.
- **Determinismo**: nada de `Math.random`, `Math.sin`/`cos`/`atan2`/`pow`/`exp`/`log`/`hypot`, `Date.now` ou
  `performance.now` em `src/core` (direções por `Math.sqrt`, sorteio por `state.rng` — este guia não sorteia nada). O
  `tests/determinism.test.ts` procura esses nomes no **texto** dos arquivos, comentários incluídos: um comentário "nada de
  Math.random" em `src/core` derruba o teste. No render (`divine.ts` do fx) `Math.random` é permitido.
- **Missões idênticas, de verdade**: com `eraMyth` desligado, `s = 1` em tudo, e cada troca do C3 dá o mesmo número de
  antes (`x * 1`, `Math.round(600 * 1)`, `Math.min(0.75, 0.5)`). As duas armadilhas conhecidas: (1) o laço das Sentinelas
  — as 4 primeiras estátuas não podem ganhar filtro novo (a m9 é do Hades); (2) a Maldição — `maxVictims` fora do laço.
  Se o diff do `scripts/missions.ts` acusar só uma missão do Hades, comece pelas Sentinelas.
- **Justiça de posição**: alvos e direções de poder só por vetores entre posições (aglomerado, CC mais perto, centro do
  mapa) ou `centerFrame`/`towardFrame`; nunca "ao norte", espiral do norte ou o primeiro do `Map` de edifícios de outro
  jogador. Desempate entre os seus próprios edifícios por id é aceitável (não cria viés de posição).
- **Retribuição em ricochete**: a volta do dano chama `applyDamage` **sem** `attacker` — senão duas Retribuições se
  rebatem para sempre (pilha estoura).
- **Spring e Hades juntos**: um soldado de Hades morto numa Primavera pode virar **duas** Sombras (a de Hades, 25 %, e a da
  Primavera). É aceitável; não "conserte" tirando uma.
- **Ceto com `naval: true`**: a E4 trata `naval` como "só mar" (separação, `canTarget`, `isForbidden`). O Ceto é
  `amphibious` e **não** `naval`.
- **`layerOf` esquecido no núcleo**: depois do B6, `grep -n "layerOf(" src/core/sim/*.ts` só pode achar a chamada
  `return layerOf(def);` dentro de `unitLayer` (`src/core/sim/naval.ts`). Um `layerOf` que sobrou deixa Oceano anfíbio na
  campanha. Fora de `src/core/sim` (editor, `src/main.ts`, `src/core/map/*`) o `layerOf` fica: lá não há `state` e o
  editor deixa pôr Ceto/Oceano na água (aceito; em cenário sem navios o Oceano posto na água fica preso — não ponha).
- **Cache anfíbio velho**: `amphibBlocked` deriva de `map.blocked`; ele só é descartado por `invalidateNaval`, que a E4 chama
  de dentro de `invalidateComponents`. Toda mudança de `map.blocked` já chama `invalidateComponents` (edifício, nó cortado,
  editor); se você escrever código que mexe em `map.blocked`, chame-o também.
- **Tecla repetida**: `tests/data.test.ts` só aceita a mesma tecla em unidades com `god` — as 12 têm `god`. Nunca use `A`,
  `R`, `U` (nem `Q` num edifício com filósofos). `P`, `H`, dígitos, `Tab`, `.` e `,` são consumidos antes do contexto.
- **Ícone obrigatório**: poder, deus e pesquisa novos sem entrada no catálogo + `npm run art:hud` derrubam o
  `tests/hud-icons.test.ts` (e a regex de `techIconKey`/`techIconName` tem de mudar nos **dois** lugares). Ícone de
  pesquisa que não corresponde a nenhum id vira "ícone órfão" e o teste também acusa. **Não** edite `public/art/hud-*` à mão.
- **Atlas `hud` no teto**: o `art:check` recusa o grupo `hud` acima de `BUDGET.maxHudPngMB` (4 MB de PNG, em
  `scripts/bake/check.ts`). Em 05/10/2026 ele tinha ~2,6 MB (1× + 2×), e E1–E5 acrescentam ícones (Eras, recursos,
  evoluções, navios). Os 9 retratos (128 px, 256 px no 2×) pesam bem mais que um ícone. Se estourar: não apague ícone e
  não mexa no catálogo dos outros; suba o teto para 5 com um comentário ("E6: 9 retratos novos; o atlas `hud` vai para o
  DOM, não para a GPU") e registre a mudança nas pendências do `PROGRESSO.md` para o dono.
- **`art:bake`**: não rode. Este guia não assa unidade; o alias da E2 cobre as 12 criaturas sem página nova de VRAM. Mexer
  em `scripts/bake/page/rigs/*` ou `materials.js` reassaria tudo (o cache local não tem todas as unidades).
- **Textos PT e EN**: toda chave nova nas duas tabelas de `strings.ts` com as mesmas `{variáveis}`; todo id novo de dado
  com EN (`name` + `desc`; `plural` nas unidades, que o teste não cobra — não esqueça); nenhum emoji em texto de
  interface (o `EMOJI_GLYPHS` só cobre os de hoje). Emoji em `icon` de dado é permitido (o HUD usa o atlas).
- **`showModal`/HUD**: a dica do poder é escrita em `dataset.tip`; passe só texto de `t(...)` e de dados (sem emoji).
- **E7 antes**: a E7 já trocou `if (ps.used)` por `powerReady(ps)` e o consumo por `charges` (em `powers.ts`, `ai.ts`,
  `hud.ts` e `gamepad.ts`). Os `case` novos não dependem disso; não crie `charges` de novo nem volte a `!ps.used` (D3).
- **vitest**: `it` com mais de ~20 s numa máquina carregada dá `Timeout calling "onTaskUpdate"` e código de saída 1 com
  tudo passando. Mantenha os testes de IA curtos (um `aiThink` ou ≤ 60 s de jogo) e com timeout explícito.
- **`SIM_VERSION`**: suba **uma** vez (C9). O relay recusa clientes de outra versão sozinho; o de produção precisa do
  build novo.

---

## Ao terminar

1. **`docs/eras/PROGRESSO.md`** (crie com o modelo da E1 se faltar): linha da E6 "feito", data e commit curto, com as
   notas: pares por Era (D1); `eraMyth` desligado em cenário; escala +15 %/Era a partir da Era do poder; 12 criaturas
   com alias; camada anfíbia (Ceto, Oceano com navios ligados); Talos automático na VII; minutos do `balance 60`; resultado
   do fairness; `missions.ts` idêntico. Em "Pendências para o dono": **aprovar os deuses e poderes novos** (ROADMAP,
   semanas 9–10) e as decisões D6 (Encruzilhada pela seleção), D7 (direção do Carro do Sol), D14 (Escila e Ceto como
   criaturas do Poseidon) e D20 (reforço dos Titãs). Em "Ganchos": E8 (arte própria das 12 criaturas — saem do `UNIT_ART_ALIAS` —, dos 9 poderes — sai o `divine` —
   e retratos definitivos), E10 (números de `POWER_TUNING`, criaturas, Bênçãos, `TITAN_ERA_*`).
2. **`docs/ROADMAP.md`**, tabela "Cronograma a partir de 06/10/2026": marque a linha das semanas 9–10 com o mesmo sinal de
   concluído das etapas anteriores e a data; em "O que já existe hoje", acrescente uma frase: 18 deuses menores (6 escolhas
   por partida), 21 poderes que crescem com a Era, 25 criaturas míticas (navais, voadoras, anfíbias), Bênçãos do Templo,
   Talos.
3. **`CLAUDE.md`**, "Memória do projeto", um item curto:
   > **Mitologia nas Eras (E6, data)**: deuses menores das Eras V–VII (Pã, Hécate, Perséfone; Éolo, Tritão, Deméter;
   > Hélio, Nice, Nêmesis; pares em `MAJOR_GODS.minorGods`), 9 poderes (`src/core/sim/powers.ts`, números em
   > `src/core/sim/divine.ts`), escala +15 %/Era (`powerScale`), Bênçãos `blessing2…8`, Talos (`MYTH_UPGRADES`), camada
   > `'amphibious'` (`unitLayer`), `config.eraMyth` (desligado em cenário); efeitos provisórios `divine`; criaturas por alias.

   Em "Comandos", acrescente `playtest-myth.mjs` à lista dos playtests.
4. **`docs/EDITOR.md`**: documente `config.eraMyth` (booleano; padrão desligado em cenário) junto do `unitLines`/`naval`.
5. **Commit** em português, com o rodapé de atribuição exigido pela **sua** sessão (não copie o de outra). Por exemplo:
   ```
   E6: mitologia em todas as Eras (deuses menores V–VII, 9 poderes, escala por Era, criaturas navais/voadoras, Bênçãos, Talos)

   - 9 deuses menores novos com poder, criatura e 2 pesquisas; 6 escolhas por partida
   - poderes +15 %/Era fora de cenário; Titãs reforçados na VIII; Oceano e Ceto anfíbios
   - Escila, Hipocampo e Ceto no Estaleiro; Harpia, Dragão, Fênix e Grifo voam; Talos na VII
   - IA usa os poderes e criaturas novas; efeitos e ícones provisórios; campanha intacta

   <rodapé de atribuição da sessão>
   ```
   Faça push só para a branch da sessão (rotina do `docs/eras/LEIA-ME.md`); nunca para `main` sem pedido do dono.
