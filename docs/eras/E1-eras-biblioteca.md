# E1 — 8 Eras e Biblioteca (com o painel da Biblioteca e a árvore de estudos da E9)

- Estado: pendente · Pré-requisitos: nenhum (parte do `main` de 06/10/2026: `SIM_VERSION = 3`, 5 Idades, save formato 1) · Estimativa: 7 dias de trabalho do agente (núcleo 2, IA e campanha 2, interface 2, verificação e documentação 1)

> **Antes de começar:** leia `docs/eras/LEIA-ME.md` (rotina de cada sessão, regras, quando parar) e marque cada
> passo em `docs/eras/PROGRESSO.md`. Ordem das etapas: E1, E2, E3, E4, E5+E7, E6, E8, E9+E10. Onde este guia falar de
> commit ou de push, vale a rotina do LEIA-ME: um commit por passo e push só para a branch da sessão.

Este guia foi escrito para ser seguido **na ordem**, sem o contexto da conversa que o gerou. Todo caminho, função e
símbolo citado existe no código de 06/10/2026 (ou está marcado "(novo)"). Números de linha são aproximados: procure
pelo trecho citado. Quando o guia diz "troque X por Y", X está escrito exatamente como aparece no arquivo hoje.

---

## Objetivo e resultado jogável

Ao terminar a E1, uma partida rápida tem **8 Eras** (Arcaica, Clássica, Helenística, Bizantina, Pólvora, Iluminismo,
Industrial, Moderna), e o avanço de Era acontece **na Biblioteca** (a antiga Academia, mesmo id `academy`):

- a Biblioteca se constrói desde a Era I, faz **um estudo por vez** e aceita **até 5 itens na fila**: estudos, avanço de
  Era e filósofos. Pode haver uma por Centro Cívico, até 3;
- o avanço de Era sai do Centro Cívico. Ele é um item da fila da Biblioteca e continua escolhendo o deus menor nas
  Eras II, III e IV. As Eras V, VI e VII ganham deus menor só na E6;
- as 4 linhas (Civismo, Comércio, Militar, Ciência) passam de 5 para **8 níveis**, um por Era;
- **Era inicial e Era final** escolhidas na partida rápida, no lobby (multiplayer) e no "Testar" do editor. Os cenários
  JSON já tinham `startingAge`/`maxAge`, agora de 0 a 7;
- a campanha continua nas Eras I–IV, com a aparência limitada à Helenística (`visualEraMax: 2`). O Prometeu do jogador
  (m3, m8, m12) vem **por roteiro**, quando há uma Fortaleza pronta, 6 estudos das linhas e 500 de Favor (pagos na hora),
  já que o Portal dos Titãs só abre na VIII;
- a IA constrói a Biblioteca, estuda e avança de Era nela até a VIII;
- painel da Biblioteca com o avanço de Era em primeiro lugar, a fila "n/5" e o botão da **árvore de estudos**;
- **árvore de estudos** em tela cheia (F3, botão da Biblioteca, menu da partida), com o que está feito, em andamento, na
  fila, disponível e bloqueado (com o motivo). Funciona em PT e EN, sem emoji e com controle;
- `SIM_VERSION` 4 e formato de save 2. Um save antigo aparece no menu com aviso e botão para apagar.

Não há arte nova: as Eras V–VIII usam a arte de hoje. O Centro Cívico fica em mármore (`a2`) da Era III em diante, e os
ícones das Eras V–VII são provisórios, montados com objetos que já existem. É a "partida de 8 Eras com arte provisória"
da `docs/ERAS.md` §11.

---

## Decisões já tomadas (não reabrir; cite docs/ERAS.md)

Do plano aprovado (`docs/ERAS.md`):

- **§1:** 8 Eras I–VIII. As 5 Idades de hoje viram I–IV (Heroica→Helenística, Mítica→Bizantina), e a Idade dos Titãs vira
  a VIII. O Portal dos Titãs só abre na VIII. A Era inicial e a final são configuráveis. A campanha atual continua nas Eras I–IV.
- **§2:** a Academia vira **Biblioteca** e o id `academy` fica. Ela faz um estudo por vez, com fila de até 5. O limite é 3,
  uma por cidade. O avanço de Era sai do Centro Cívico e vai para a Biblioteca, pede estudos das linhas e escolhe o deus
  menor (II–VII). As 4 linhas passam a ter 8 níveis. Ficam fora da Biblioteca as pesquisas de economia, do Templo e dos
  deuses menores. A interface ganha a árvore de estudos.
- **§6:** há deus menor a cada avanço da II à VII. Os pares das Eras V–VII são da E6.
- **§10:** o `SIM_VERSION` sobe e os saves antigos ficam incompatíveis, com aviso no menu. A campanha fica nas Eras I–IV com
  `visualEraMax` (Helenística), e os Titãs das missões surgem por roteiro. Os heróis entram nas Eras I–V, e Perseu
  (índice 4) passa a ser da Era V.
- **§11:** E1 = núcleo das Eras e da Biblioteca, com IA e testes. E9 corre junto (aqui só o painel e a árvore).

Decisões deste guia (cada uma com o motivo em uma linha):

| # | Decisão | Motivo |
|---|---|---|
| D1 | Índices: 0–3 mantêm o número (Arcaica, Clássica, Helenística, Bizantina). A antiga 4 (Titãs) vira **7**. Os novos são 4 Pólvora, 5 Iluminismo e 6 Industrial. Mapa antigo→novo: `LEGACY_AGE_TO_ERA = [0, 1, 2, 3, 7]`. | A campanha só usa 0–3; somar ou renumerar tudo quebraria as 12 missões. |
| D2 | **Custos, tempos e requisitos das Eras II–IV iguais aos de hoje.** O requisito "Academia" da antiga Heroica sai, porque ele já está implícito: o avanço é feito numa Biblioteca. | A campanha e o harness estão calibrados com esses números; o ritmo-alvo é trabalho da E10. |
| D3 | Eras V–VIII: custos e `techCount` da tabela "Dados prontos". V exige Fortaleza, como a antiga Idade dos Titãs. Só os recursos de hoje (`food`, `gold`, `knowledge`, `favor`). | A E2 ainda não existe; ela acrescenta pedra e petróleo pela tabela-gancho. |
| D4 | Biblioteca: `age: 0` e custo de hoje (200 madeira, 100 ouro), mais as flags novas `library: true`, `queueMax: 5` e `perCity: true`, com `limit: 3`. | Com `age: 1`, ninguém sairia da Era I. Chegar à II custa 200 de madeira e 100 de ouro a mais (a Biblioteca), compensados pelo Centro Cívico, que fica livre para treinar cidadãos durante o avanço. |
| D5 | O filósofo continua sendo item da fila (15 s) e conta no limite de 5. | É a menor mudança, e saves, fuzz e `QueueItem.kind` continuam válidos. |
| D6 | O comando continua `{ type: 'advanceAge', buildingId, minorGod? }`. Só muda o edifício aceito: o que tem `library`. | O validador (`validate.ts`) e o relay ficam intactos. |
| D7 | Linhas com 8 níveis e **as mesmas fórmulas** de custo, tempo e efeito. Civismo continua dando +1 Centro Cívico por nível. | Os números dos níveis 1–5 não mudam (campanha). Ajuste fino é da E10. |
| D8 | `minorGod: true` só nas Eras 1, 2 e 3. Nas 4, 5 e 6 fica `false` até a E6 criar os pares; na 7 é sempre `false`. | Com `true` sem par em `MAJOR_GODS.minorGods`, o avanço recusa com "Escolha um deus menor" e trava. |
| D9 | Era inicial acima da I, fora de cenário: o jogador recebe o deus menor e o poder de cada Era pulada (humano: o 1º do par; IA: `(personalidade + Era−1) % 2`, a mesma conta de `tryAdvanceAge`) e os estudos que a Era inicial exigiu (`AGES[start].requires.techCount`, nível 1 de cada linha em rodízio). | Sem isso, quem começa na IV fica sem panteão e precisa de 7 estudos para a V, contra 3 de quem chegou jogando. Os cenários já dão os seus por roteiro. |
| D10 | Era final = `config.maxAge`, que já existe (G6). Fora de cenário, o motivo da recusa é "Era final desta partida: X"; em cenário continua "Proibido nesta missão". | O texto de missão não serve para a partida rápida. |
| D11 | Campanha: `maxAge: 3` e `visualEraMax: 2` **explícitos** nas 13 configs (m1–m3 em TS, o gêmeo JSON da m1 e os 9 JSON m4–m12). A Horda fica sem teto. | Explícito fica no arquivo, no hash e na validação. A Horda não é campanha (§1 fala só da campanha). |
| D12 | Prometeu do jogador por roteiro: gatilho "Fortaleza pronta + 6 estudos das linhas + 500 de Favor → paga os 500 de Favor e faz `spawn` de Prometeu" nas m3, m8 e m12, com textos novos. As falas de `age ≥ 4` das m4 e m6 (avisos do Portal) saem. | O Portal só abre na VIII (§1), a campanha fica na IV (§10), e "os Titãs das missões surgem por roteiro" (§10). Assim a "3ª resposta" da m8 continua possível. Os 500 de Favor são os 300 da antiga Idade dos Titãs + os 200 do Portal: sem esse custo, Prometeu sairia quase de graça (na m12 a Fortaleza é obrigatória e falta 1 estudo; na variante principal da m8 a IA do jogador ergue Fortaleza e estuda sozinha) e as janelas do `missions.ts` estourariam. O Favor era o gargalo de verdade da variante "titãs" da m8 (`docs/STORY.md`: os 10 cidadãos rezando), que assim continua valendo. |
| D13 | `visualEraMax` só no renderizador. `ageTier`: Era 0 → `a0`, Era 1 → `a1`, Era ≥ 2 → `a2` (mármore = Helenística, §1). | A campanha a 2 continua em `a2`, como hoje na Mítica. O kit de Era é da E8. |
| D14 | Save: `SAVE_VERSION = 2`, a chave `aoe_save_v1` fica (Steam Cloud). Menu: "save de versão antiga" + botão "Apagar save antigo". Cenários v1 do jogador **não** são migrados: os números 0–3 valem igual e o 4 passa a ser a Pólvora. | Renomear a chave exigiria mudar `cloud.ts` e `desktop/cloud.cjs` juntos. A migração de cenário mudaria o `mapHash`. |
| D15 | `SIM_VERSION = 4`. | A mesma semente dá outra partida (IA, Biblioteca, Eras). O relay recusa a versão antiga sozinho. |
| D16 | Ícones `age/4..6` provisórios com objetos existentes; `age/7` é o vulcão de hoje. | A E8 desenha os definitivos; o teste exige um ícone por Era agora. |
| D17 | Árvore de estudos = modal em tela cheia com F3, botão no painel da Biblioteca e botão no menu da partida. **Sem** aba na enciclopédia na E1. | Fica no escopo pedido; a enciclopédia completa é da E9. |
| D18 | Atalho **E** = avançar de Era com a Biblioteca selecionada; **F3** = árvore (global). | E e F3 estão livres (`src/ui/input.ts`). A, R e U são proibidos. |
| D19 | Conquistas: os ids ficam (API da Steam). `titans` passa a exigir a Era 7. Textos: Clássica/Helenística/Bizantina/Moderna. | Os ids já estão cadastrados no Steamworks. |
| D20 | **Não** realinhar as Eras das unidades (hipaspista 2, arqueiro cretense 2, mirmidão 3, helépole 3) nem das maravilhas (3). | Isso é da E3/E7; mexer agora muda a campanha sem necessidade. |

---

## Arquivos que mudam

| Caminho | O que muda |
|---|---|
| `src/core/data/ages.ts` | `AGES` com 8 Eras; constantes `ERA`, `ERA_TITANS`, `LEGACY_AGE_TO_ERA`, `CAMPAIGN_MAX_ERA`, `CAMPAIGN_VISUAL_ERA_MAX`; função `clampEra` |
| `src/core/data/index.ts` | reexporta as constantes novas de `ages.ts` e `ROMAN`/`LINE_LEVELS` de `techs.ts` |
| `src/core/data/techs.ts` | `ROMAN` (I–VIII), `LINE_LEVELS = 8`; `line()` usa `ROMAN`; as 4 linhas com 8 níveis |
| `src/core/data/buildings.ts` | `academy` → Biblioteca (age 0, `library`, `queueMax`, `perCity`, desc nova); `titan_gate.age = ERA_TITANS`; descs de `town_center` e `temple` |
| `src/core/data/units.ts` | `prometheus`, `oceanus` e `cronus` com `age: ERA_TITANS` (perseus continua 4) |
| `src/core/data/gods.ts` | textos dos `perks` de Zeus e Hades ("Idade" → "Era") |
| `src/core/types.ts` | `BuildingDef`: `library?`, `queueMax?`, `perCity?`; `GameConfig`: `visualEraMax?` e o comentário de `maxAge` (0–7) |
| `src/core/constants.ts` | `SIM_VERSION = 4` (com a linha do histórico); `DEFAULT_QUEUE_MAX = 10` |
| `src/core/sim/commands.ts` | `queueMaxOf`, `canHireScholar` (nova, exportada); limites de fila em `canTrain`/`canResearch`; `canAdvanceAge` na Biblioteca |
| `src/core/sim/restrictions.ts` | `isScenarioConfig`, `endAgeReason` |
| `src/core/sim/entities.ts` | `buildingLimitOk`: regra `perCity` |
| `src/core/sim/game.ts` | `clampEra` na Era inicial; `grantStartingEras` (nova, exportada) |
| `src/core/sim/ai.ts` | tabelas com 8 posições (exportadas); Biblioteca na Era I; Portal na `titan_gate.age`; `tryAdvanceAge` na Biblioteca; `RESEARCH_PRIORITY` com os níveis 6–8 (exportada); `budgetOf` genérico |
| `src/core/serialize.ts` | `SAVE_VERSION = 2`, `saveVersionOf`, erro traduzido |
| `src/core/scenario/schema.ts` | `config.visualEraMax` (tipo + validação); stat `studies` |
| `src/core/scenario/compile.ts` | `value()` com `studies`; `scenarioConfig` copia `visualEraMax` |
| `src/core/scenario/campaign.ts` | m1–m3: `maxAge`/`visualEraMax`, textos, dica da Biblioteca (m1), Prometeu por roteiro (m3) |
| `src/core/scenario/testing.ts` | casca de `staticMissionIssues` com `maxAge`/`visualEraMax`; `m8Titans`, `m8ArmyReserve` e o `reserve` da variante "titãs" (o passo "reza" fica) |
| `src/core/scenario/missions/m1_despertar.scenario.json` … `m12_titanomaquia.scenario.json` (os 10 arquivos) | `maxAge`/`visualEraMax`; textos "Idade"/"Academia"; gatilhos removidos (m4, m6); gatilho `chama_prometeu` (m8, m12) |
| `src/i18n/strings.ts` | chaves novas e textos revistos (PT e EN) |
| `src/i18n/en-data.ts` | `EN_AGES` 0–7; `line()` I–VIII; `academy`/`town_center`/`temple`; perks |
| `src/ui/hud.ts` | painel da Biblioteca, `tryAdvanceAge(lib)`, fila "n/5", árvore de estudos (abrir/atualizar), menu, atalhos, enciclopédia (aba Eras) |
| `src/ui/studytree.ts` (novo) | modelo e HTML puros da árvore de estudos |
| `src/ui/era-select.ts` (novo) | seletores de Era inicial/final e conversão para a `GameConfig` |
| `src/ui/input.ts` | F3 (árvore) e E (avançar, com Biblioteca selecionada) |
| `src/ui/menu.ts` | seletores de Era (partida rápida e lobby); aviso e botão do save antigo |
| `src/ui/icons.ts` | `ic.age` limitado a `AGES.length - 1` |
| `src/ui/emoji.ts` | `'🌋': '@age/7'` |
| `src/ui/styles.css` | `#modal.tree` e a grade da árvore |
| `src/editor/panel.ts` | `TestOpts.startAge/endAge` e os seletores no modal Testar |
| `src/main.ts` | Era inicial/final no teste do editor; `hasSave`/`hasOldSave`/`onDeleteOldSave` |
| `src/net/client.ts` | `LobbyState.settings.startAge?/endAge?` |
| `server/relay.mjs` | `cleanSettings` aceita `startAge` e `endAge` |
| `src/render/art/logic.ts` | `ageTier` novo; `visualEra` (nova) |
| `src/render/renderer.ts` | variante do Centro Cívico e fantasma com `visualEra(..., config.visualEraMax)` |
| `src/game/achievements.ts` | `titans` = Era 7; textos PT/EN |
| `desktop/steam/achievements.json`, `desktop/steam/achievements.csv` | regenerados por `npx tsx scripts/steam-achievements.ts` |
| `scripts/bake/hud/catalog.mjs` | `AGE_ICONS` com 8 entradas |
| `public/art/hud-*.png`, `public/art/hud-*.json`, `public/art/manifest.json` | regenerados por `npm run art:hud` (nunca à mão) |
| `scripts/loadtest.ts` | Biblioteca na Era I e avanço na Biblioteca |
| `scripts/maps/fairness.ts` | médias por Era para N Eras |
| `scripts/artages.mjs` | `TC_TIER` com o mapa novo |
| `scripts/playtest.mjs` | ergue uma Biblioteca antes de avançar |
| `scripts/playtest-library.mjs` (novo) | playtest do painel, da fila e da árvore (PT/EN) |
| `tests/eras.test.ts` (novo), `tests/studytree.test.ts` (novo) | testes novos |
| `tests/data.test.ts`, `tests/sim.test.ts`, `tests/economy-regressions.test.ts`, `tests/movement-ai.test.ts`, `tests/scenario-gaps.test.ts`, `tests/position-fairness.test.ts`, `tests/art-library.test.ts`, `tests/hud-icons.test.ts`, `tests/m4_caucaso.test.ts`, `tests/m5_itaca.test.ts`, `tests/m6_estatua.test.ts`, `tests/relay-anticheat.test.ts`, `tests/modes.test.ts` | atualizações listadas em "Testes" |
| `docs/eras/PROGRESSO.md` (novo, se faltar), `docs/ROADMAP.md`, `CLAUDE.md`, `docs/STORY.md`, `docs/EDITOR.md` | documentação (bloco J) |

**Não mexa** em `scripts/bake/page/*`, `art/manifest/*` nem `materials.js`: qualquer mudança neles reassa a arte inteira
(ver Armadilhas). A E1 **não cria** unidade nem edifício novo.

---

## Dados prontos

Todos os números são **valores iniciais** para o balanceamento da E10. Não invente outros: se a verificação falhar,
siga o que a seção "Verificação" diz para ajustar.

### Eras (`src/core/data/ages.ts`)

| id | `name` PT | `short` PT | `name` EN | `short` EN | `icon` (dado) | `cost` | `time` (s) | `requires` | `minorGod` |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Era Arcaica | Arcaica | Archaic Era | Archaic | 🏺 | `{}` | 0 | `{}` | false |
| 1 | Era Clássica | Clássica | Classical Era | Classical | 🏛️ | food 400, gold 300 | 60 | `{ building: 'temple' }` | true |
| 2 | Era Helenística | Helenística | Hellenistic Era | Hellenistic | ⚔️ | food 800, gold 500, knowledge 200 | 75 | `{ techCount: 2 }` | true |
| 3 | Era Bizantina | Bizantina | Byzantine Era | Byzantine | 🔱 | food 1000, gold 1000, knowledge 500 | 90 | `{ techCount: 4 }` | true |
| 4 | Era da Pólvora | Pólvora | Gunpowder Era | Gunpowder | 💣 | food 1500, gold 1500, knowledge 1000 | 120 | `{ building: 'fortress', techCount: 7 }` | false (a E6 liga) |
| 5 | Era do Iluminismo | Iluminismo | Enlightenment Era | Enlightenment | 📜 | food 1800, gold 1800, knowledge 1300 | 130 | `{ techCount: 10 }` | false (a E6 liga) |
| 6 | Era Industrial | Industrial | Industrial Era | Industrial | 🏭 | food 2100, gold 2100, knowledge 1600 | 140 | `{ techCount: 13 }` | false (a E6 liga) |
| 7 | Era Moderna | Moderna | Modern Era | Modern | 🌋 | food 2400, gold 2400, knowledge 2000, favor 300 | 150 | `{ techCount: 16 }` | false (sempre) |

- O `techCount` conta todos os estudos das 4 linhas (`academyTechCount`, cumulativo).
- Para avançar à Era k, o jogador está na k−1 e pode estudar até o nível k em cada linha, ou seja, no máximo 4·k
  estudos. Por isso cada `techCount(k)` é ≤ 4·k (o teste confere).
- `icon` é dado e não aparece na interface (o HUD usa `ic.age`); emoji em dado é permitido.

Descrições (`desc`), sem emoji:

| id | PT | EN |
|---|---|---|
| 0 | O começo da civilização: aldeias, caça e os primeiros hoplitas. Erga uma Biblioteca para estudar e avançar de Era. | The dawn of civilization: villages, hunting and the first hoplites. Raise a Library to study and advance Eras. |
| 1 | Filosofia, cavalaria e o primeiro deus menor. Requer um Templo; avance na Biblioteca. | Philosophy, cavalry and the first minor god. Requires a Temple; advance at the Library. |
| 2 | O mundo de Alexandre: heróis lendários, máquinas de cerco e fortalezas. Requer 2 estudos das linhas da Biblioteca. | Alexander's world: legendary heroes, siege engines and fortresses. Requires 2 Library line studies. |
| 3 | Constantinopla: criaturas colossais, maravilhas do mundo e poder divino. Requer 4 estudos das linhas da Biblioteca. | Constantinople: colossal creatures, wonders of the world and divine power. Requires 4 Library line studies. |
| 4 | A pólvora chega a Creta: fortes estrelados e couraças de aço. Requer uma Fortaleza e 7 estudos das linhas da Biblioteca. | Gunpowder reaches Crete: star forts and steel cuirasses. Requires a Fortress and 7 Library line studies. |
| 5 | A razão e o renascimento grego em pedra neoclássica. Requer 10 estudos das linhas da Biblioteca. | Reason and the Greek revival in neoclassical stone. Requires 10 Library line studies. |
| 6 | Vapor, ferro e chaminés. Requer 13 estudos das linhas da Biblioteca. | Steam, iron and chimneys. Requires 13 Library line studies. |
| 7 | Concreto e aço, e o clímax: abra o Portal dos Titãs e liberte um Titã. Requer 16 estudos das linhas da Biblioteca. | Concrete and steel, and the climax: open the Titan Gate and free a Titan. Requires 16 Library line studies. |

**Gancho para a E2 (não aplicar na E1).** Quando `stone` e `oil` existirem em `RESOURCES`, somar aos `cost` das Eras:

| Era | II | III | IV | V | VI | VII | VIII |
|---|---|---|---|---|---|---|---|
| pedra (`stone`) | 0 | 150 | 300 | 400 | 500 | 600 | 800 |
| petróleo (`oil`) | 0 | 0 | 0 | 150 | 300 | 450 | 600 |

A E2 também precisa incluir os dois recursos em `manageEconomy` (`need`, em `src/core/sim/ai.ts`). Já o `budgetOf`
fica genérico na E1 (passo D5) e não precisa mudar. Os custos de II a IV mudam a campanha, então a E2 recalibra o
harness.

### Mapa Idade antiga → Era nova

| Idade antiga | Era nova | Observação |
|---|---|---|
| 0 Arcaica | 0 Arcaica | igual |
| 1 Clássica | 1 Clássica | igual |
| 2 Heroica | 2 Helenística | mesmo número |
| 3 Mítica | 3 Bizantina | mesmo número |
| 4 Titãs | **7** Moderna | `LEGACY_AGE_TO_ERA[4] = 7`; Titãs e Portal com `age: ERA_TITANS` |

A **Era das unidades não passa por esse mapa**: Perseu (`age: 4`) continua 4, que agora é a Era da Pólvora (§10).

### Biblioteca (`BUILDINGS.academy`)

| Campo | Valor |
|---|---|
| id | `academy` (não muda) |
| nome PT / EN | Biblioteca / Library |
| Era (`age`) | 0 |
| custo / vida / pegada / obra | `{ wood: 200, gold: 100 }` / 1000 / 3×3 / 60 s (como hoje) |
| atalho de construção | `Z` (como hoje) |
| flags | `scholars: true`, `library: true` (nova), `queueMax: 5` (nova), `limit: 3`, `perCity: true` (nova) |
| desc PT | Biblioteca: avance as Eras e estude as linhas Cívica, Comercial, Militar e Científica, um estudo por vez (fila de até 5). Filósofos geram Conhecimento. Uma por Centro Cívico, até 3. |
| desc EN | Library: advance the Eras and study the Civic, Commerce, Military and Science lines, one study at a time (queue of up to 5). Philosophers generate Knowledge. One per Town Center, up to 3. |

Outras descs que mudam:

| Edifício | PT | EN |
|---|---|---|
| `town_center` | Coração da cidade. Treina cidadãos, recebe recursos e projeta fronteiras. Abriga até 15 unidades, que reforçam suas flechas. | Heart of the city. Trains citizens, receives resources and projects borders. Shelters up to 15 units, which reinforce its arrows. |
| `temple` | (troque só o fim) "Necessário para a Era Clássica." | (troque só o fim) "Required for the Classical Era." |

### Linhas da Biblioteca: 4 × 8 (mesmas fórmulas de `techs.ts`)

`age` de cada nível = nível − 1. Os ids são `civic1..8`, `commerce1..8`, `military1..8` e `science1..8`. Os nomes PT são
"Civismo I…VIII", "Comércio I…VIII", "Militar I…VIII" e "Ciência I…VIII"; os EN, "Civics I…VIII", "Commerce I…VIII",
"Military I…VIII" e "Science I…VIII". Custos já calculados, para conferir (Conhecimento / Ouro / tempo):

| Nível | Era (`age`) | civic | commerce | military | science |
|---|---|---|---|---|---|
| I (1) | 0 | 150 / 100 / 42 s | 120 / 80 / 40 s | 140 / 130 / 42 s | 100 / 100 / 35 s |
| II (2) | 1 | 240 / 160 / 54 s | 190 / 130 / 50 s | 220 / 200 / 54 s | 160 / 160 / 45 s |
| III (3) | 2 | 330 / 220 / 66 s | 260 / 180 / 60 s | 300 / 270 / 66 s | 220 / 220 / 55 s |
| IV (4) | 3 | 420 / 280 / 78 s | 330 / 230 / 70 s | 380 / 340 / 78 s | 280 / 280 / 65 s |
| V (5) | 4 | 510 / 340 / 90 s | 400 / 280 / 80 s | 460 / 410 / 90 s | 340 / 340 / 75 s |
| VI (6) | 5 | 600 / 400 / 102 s | 470 / 330 / 90 s | 540 / 480 / 102 s | 400 / 400 / 85 s |
| VII (7) | 6 | 690 / 460 / 114 s | 540 / 380 / 100 s | 620 / 550 / 114 s | 460 / 460 / 95 s |
| VIII (8) | 7 | 780 / 520 / 126 s | 610 / 430 / 110 s | 700 / 620 / 126 s | 520 / 520 / 105 s |

### IA (`src/core/sim/ai.ts`): tabelas por Era (índice = `player.age`)

| Tabela | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| `VILLAGER_TARGET` | 18 | 26 | 34 | 40 | 44 | 48 | 52 | 56 |
| `FARM_LIMIT` | 4 | 8 | 12 | 16 | 18 | 20 | 22 | 24 |
| `ARMY_ATTACK` | 7 | 12 | 16 | 20 | 24 | 28 | 32 | 36 |
| `MIN_ARMY` | 6 | 10 | 14 | 18 | 22 | 26 | 30 | 34 |

As posições 0–4 são as de hoje.

### Atalhos (respeitam `tests/data.test.ts` e o CLAUDE.md: nada de A, R, U)

| Tecla | Contexto | Ação |
|---|---|---|
| `Z` | cidadãos selecionados | construir Biblioteca (já existe) |
| `Q` | Biblioteca selecionada | contratar filósofo (já existe) |
| `E` (novo) | Biblioteca selecionada | avançar de Era (`hud.tryAdvanceAge(b)`) |
| `R` | Biblioteca selecionada | ponto de encontro (já existe) |
| `F3` (novo) | global na partida | abrir a árvore de estudos |

Nenhum atalho de construção ou de treino muda.

### Ícones do HUD (`scripts/bake/hud/catalog.mjs`, `AGE_ICONS`)

| Ícone | Modelo | Situação |
|---|---|---|
| `age/0` | `O('amphora')` | igual |
| `age/1` | `O('column', { order: 'doric' })` | igual |
| `age/2` | `O('helm', { crest: 'red' })` | igual |
| `age/3` | `O('trident')` | igual |
| `age/4` | `O('helm', { metal: 'dark', crest: 'dark' })` | provisório (E8) |
| `age/5` | `O('column', { order: 'corinthian' })` | provisório (E8) |
| `age/6` | `O('anvil')` | provisório (E8) |
| `age/7` | `O('volcano')` | o vulcão de hoje (Titãs = Moderna) |

### Textos de interface (`src/i18n/strings.ts`)

**Chaves novas** (crie nas duas tabelas, `pt` e `en`, com as mesmas `{variáveis}`):

| Chave | PT | EN |
|---|---|---|
| `err.advanceAtLibrary` (substitui `err.advanceAtTC`) | Avance de Era numa Biblioteca. | Advance the Era at a Library. |
| `msg.needLibrary` (substitui `msg.needTC`) | Você precisa de uma Biblioteca pronta para avançar de Era. | You need a finished Library to advance an Era. |
| `err.endAge` | Era final desta partida: {age}. | Final Era of this match: {age}. |
| `err.limitPerCity` | Uma {name} por Centro Cívico ({n} agora; máximo {max}). | One {name} per Town Center ({n} now; max {max}). |
| `err.saveVersion` | save de outra versão do jogo (formato v{v}; esta é a v{cur}) | save from another game version (format v{v}; this one is v{cur}) |
| `main.oldSave` | O save guardado é de uma versão antiga do jogo e não pode ser carregado. | The stored save is from an older game version and cannot be loaded. |
| `main.oldSaveDelete` | Apagar save antigo | Delete old save |
| `main.oldSaveConfirm` | Apagar o save antigo? Não dá para desfazer. | Delete the old save? This cannot be undone. |
| `main.startAge` | Era inicial | Starting Era |
| `main.endAge` | Era final | Final Era |
| `main.startAgeAuto` | Padrão do modo | Mode default |
| `main.endBeforeStart` | A Era final não pode vir antes da Era inicial. | The final Era cannot come before the starting Era. |
| `cmd.studyTree` | Árvore de estudos | Study tree |
| `cmd.studyTreeTip` | `<b>Árvore de estudos</b><div class="desc">Todas as Eras e linhas da Biblioteca: o que está feito, em andamento, disponível e bloqueado. Atalho: F3.</div>` | `<b>Study tree</b><div class="desc">Every Era and Library line: what is done, in progress, available and locked. Shortcut: F3.</div>` |
| `sel.queue` | Fila | Queue |
| `hk.advance` | Avançar de Era (Biblioteca) | Advance Era (Library) |
| `menu.tree` | Árvore de estudos | Study tree |
| `tree.title` | Árvore de estudos | Study tree |
| `tree.queue` | Biblioteca: {n}/{max} na fila | Library: {n}/{max} queued |
| `tree.noLibrary` | Construa uma Biblioteca (tecla Z com cidadãos) para estudar. | Build a Library (Z key with villagers) to study. |
| `tree.hint` | Clique num estudo disponível para pô-lo na fila da Biblioteca menos ocupada. | Click an available study to queue it at the least busy Library. |
| `tree.row.age` | Avanço de Era | Era advance |
| `tree.row.other` | Outros estudos | Other studies |
| `tree.st.done` / `tree.st.active` / `tree.st.queued` / `tree.st.available` / `tree.st.locked` | Concluído / Estudando / Na fila / Disponível / Bloqueado | Done / Studying / Queued / Available / Locked |
| `line.civic` / `line.commerce` / `line.military` / `line.science` | Civismo / Comércio / Militar / Ciência | Civics / Commerce / Military / Science |

**Textos que mudam.** A chave fica a mesma. Troque o valor inteiro ou só o trecho indicado:

| Chave | PT novo | EN novo |
|---|---|---|
| `top.advance` | ⬆ Avançar Era | ⬆ Advance Era |
| `top.maxAge` | 🌋 Era máxima | 🌋 Max Era |
| `top.maxAgeTip` | Você alcançou a Era Moderna. | You have reached the Modern Era. |
| `cmd.scholarTip` | trecho "por Academia" → "por Biblioteca" | trecho "per Academy" → "per Library" |
| `modal.chooseMinor` | trecho "nesta Idade" → "nesta Era" | trecho "in this Age" → "in this Era" |
| `over.age` | Era | Era |
| `enc.ages` | 🏺 Eras | 🏺 Eras |
| `enc.academyLines` | {n} estudos das linhas da Biblioteca ({lines}) | {n} Library line studies ({lines}) |
| `help.goal` | trecho "Avance pelas Idades" → "Avance pelas Eras" | trecho "Advance through the Ages" → "Advance through the Eras" |
| `help.econ` | trecho "Filósofos na Academia geram <b>Conhecimento</b> (para pesquisas e Idades)" → "Filósofos na Biblioteca geram <b>Conhecimento</b> (para estudos e Eras)" | trecho "Scholars at the Academy yield <b>Knowledge</b> (for research and Ages)" → "Scholars at the Library yield <b>Knowledge</b> (for studies and Eras)" |
| `help.borders` | trecho "Pesquise <b>Civismo</b> na Academia" → "Estude <b>Civismo</b> na Biblioteca" | trecho "Research <b>Civics</b> at the Academy" → "Study <b>Civics</b> at the Library" |
| `hk.scholar` | Contratar filósofo (Biblioteca) | Hire scholar (Library) |
| `hk.fkeys` | Ajuda · Enciclopédia · Árvore de estudos · Salvar · Carregar · Tela cheia | Help · Encyclopedia · Study tree · Save · Load · Fullscreen |
| `main.sub` | trecho "Idades, fronteiras" → "Eras, fronteiras" | trecho "Ages, borders" → "Eras, borders" (**não** toque em "Age of Mythology") |
| `load.tip7` | Filósofos na Biblioteca geram Conhecimento, usado nos estudos e para avançar de Era. | Scholars at the Library yield Knowledge, used for studies and to advance through the Eras. |
| `load.tip9` | Estude Civismo na Biblioteca para expandir as fronteiras e liberar mais Centros Cívicos. | Study Civics at the Library to expand your borders and allow more Town Centers. |
| `mode.deathmatch` | Deathmatch: cofres cheios, começa na Era Clássica | Deathmatch: full coffers, starts in the Classical Era |
| `err.maxScholars` | Máximo de {n} filósofos por Biblioteca. | Maximum of {n} philosophers per Library. |
| `err.maxAge` | Era máxima alcançada. | Maximum Era reached. |
| `err.advancing` | Avanço de Era já em andamento. | Era advance already in progress. |
| `err.requiresTechCount` | Requer {n} estudos das linhas da Biblioteca ({have}/{n}). | Requires {n} Library line studies ({have}/{n}). |
| `err.cityLimit` | Limite de Centros Cívicos: {n}. Estude Civismo na Biblioteca. | Town Center limit: {n}. Study Civics at the Library. |

`err.requiresAge` ("Requer a {age}." / "Requires the {age}.") e `msg.advanceStarted` não mudam: "a Era…"/"the …Era"
continuam corretos.

### Conteúdo traduzido nos dados

- `src/core/data/gods.ts` (perks PT): troque "Pégasos no Templo desde a Idade Arcaica" por "Pégasos no Templo desde a
  Era Arcaica", e "Cérbero no Templo a partir da Idade Heroica" por "Cérbero no Templo a partir da Era Helenística".
- `src/i18n/en-data.ts` (perks EN): "Pegasi at the Temple from the Archaic Era" e "Cerberus at the Temple from the Hellenistic Era".

### Conquistas (`src/game/achievements.ts`)

| id | nome (fica) | desc PT nova | desc EN nova | check |
|---|---|---|---|---|
| `classical` | Filósofo | Alcance a Era Clássica. | Reach the Classical Era. | `advancedTo(s, l, 1)` |
| `heroic` | Canção dos Heróis | Alcance a Era Helenística. | Reach the Hellenistic Era. | `advancedTo(s, l, 2)` |
| `mythic` | Toque dos Deuses | Alcance a Era Bizantina. | Reach the Byzantine Era. | `advancedTo(s, l, 3)` |
| `titans` | Titanomaquia | Alcance a Era Moderna. | Reach the Modern Era. | `advancedTo(s, l, ERA_TITANS)` |

### Campanha: o que muda em cada missão

| Missão | Config | Textos e gatilhos |
|---|---|---|
| m1 (TS em `campaign.ts` e o gêmeo `missions/m1_despertar.scenario.json`) | + `maxAge: 3`, `visualEraMax: 2` nos dois | "Idade Clássica" → "Era Clássica" (intro e objetivo `age`); gatilho novo `tip_library` nos dois (texto abaixo) |
| m2 (TS) | + `maxAge: 3`, `visualEraMax: 2` | — |
| m3 (TS) | + `maxAge: 3`, `visualEraMax: 2` | intro, objetivo `titan`, fala de Zeus e gatilho novo `prometeu_chamado` (passo F4) |
| m4 | + `"maxAge": 3, "visualEraMax": 2` | apagar o gatilho `aviso_portal`; "Academia"→"Biblioteca"; no `intro`, "Se Prometeu atendeu ao Portal de Argos" → "Se Prometeu atendeu ao chamado de Argos" (EN "If Prometheus answered Argos' Gate" → "If Prometheus answered Argos' call") |
| m5, m7 | + `"maxAge": 3, "visualEraMax": 2` | substituições da tabela abaixo, se houver |
| m6 | + `"maxAge": 3, "visualEraMax": 2` | apagar `portal_liga_fala`, `portal_micenas_fala` e `portal_argos_fala`; substituições |
| m8 | + `"maxAge": 3, "visualEraMax": 2` | dica, fala `pitia_portal`, objetivo `titas` e gatilho novo `chama_prometeu` (passo F4) |
| m9, m10, m11 | já têm `"maxAge": 3`; + `"visualEraMax": 2` | substituições |
| m12 | + `"maxAge": 3, "visualEraMax": 2` (global; os `players[1..3].maxAge: 3` ficam) | dica, fala `pitia_portal`, objetivo `prometeu` e gatilho `chama_prometeu` (passo F4); na fala do gatilho `altares_caem`, "o Culto, o Portal, as muralhas" → "o Culto, Prometeu, as muralhas" (EN "the Cult, the Gate, the walls" → "the Cult, Prometheus, the walls") |
| Horda (`HORDE` em `campaign.ts`) | **sem** mudança de config | intro: "avance de Idade" → "avance de Era" |

Substituições de texto nas missões (só nos valores `"pt"`/`"en"` e nas strings de `campaign.ts`; os comentários podem ficar):

| PT antes | PT depois | EN antes | EN depois |
|---|---|---|---|
| Idade Arcaica | Era Arcaica | Archaic Age | Archaic Era |
| Idade Clássica | Era Clássica | Classical Age | Classical Era |
| Idade Heroica | Era Helenística | Heroic Age | Hellenistic Era |
| Idade Mítica | Era Bizantina | Mythic Age | Byzantine Era |
| Academia | Biblioteca | Academy | Library |

**Não troque** "Idade de Ouro", "Idade de Cronos", "Golden Age" e "Age of Cronus" (m12, mito). "Idade dos Titãs"/"Age
of Titans" tem de sumir das missões depois dos passos F3 e F4 (o `grep` do passo F2 confere).

Texto do gatilho novo `tip_library` da m1. Fala: speaker "Oráculo de Delfos", ícone 🔮, com o MESMO texto PT no TS e
no JSON, porque o teste de paridade compara as falas:

- PT: `Para avançar de Era, erga uma Biblioteca (tecla Z com cidadãos selecionados), selecione-a e use Avançar (tecla E). Ela também estuda as linhas que abrem as próximas Eras.`
- EN (só no JSON): `To advance an Era, raise a Library (Z key with villagers selected), select it and use Advance (E key). It also studies the lines that open the next Eras.`

---

## Passo a passo

Um commit por passo (rotina do `docs/eras/LEIA-ME.md`); se um teste ficar vermelho de propósito (lista abaixo), diga
qual na mensagem. Rode `npm run -s typecheck` no fim de cada passo (a partir do A4; antes dele o A2 ainda não compila).

**Testes durante o trabalho:** rode só os do `Confira:` de cada passo; eles têm de passar ali. O `npm test` inteiro só
precisa estar verde no bloco J. Antes disso, testes de blocos posteriores falham **de propósito** e não devem ser
"consertados" fora do passo deles: `tests/position-fairness.test.ts` (30 → 33) até o D8; `tests/sim.test.ts`,
`tests/economy-regressions.test.ts` e `tests/movement-ai.test.ts` até o B7; `tests/scenario-gaps.test.ts` até o C4;
`tests/m4_caucaso.test.ts`, `tests/m5_itaca.test.ts` e `tests/m6_estatua.test.ts` até o F6; `tests/art-library.test.ts`
até o G1; `tests/hud-icons.test.ts` até o G2/H10.

### Bloco 0 — Preparação

- [ ] **0.1.** Confira o ponto de partida: `git status --short` sem nada fora de `docs/eras/` (os próprios guias podem
  aparecer como `?? docs/eras/`), `grep -n "SIM_VERSION = 3" src/core/constants.ts` acha a linha e
  `grep -c "id: [0-9]" src/core/data/ages.ts` dá 5. Se algo disso falhar, pare: o guia foi escrito para esse ponto.
- [ ] **0.2.** Registre o "antes":
  - `npm run -s balance 35 1,2,3 > /tmp/e1-balance-antes.txt` (~1–2 min). Referência medida em 06/10/2026 nas IAs
    vivas: Clássica 5–7 min, Heroica 13–17, Mítica 18–23, Titãs 23–27;
  - `npm run build`, depois `npm run preview` em segundo plano (porta 4173);
  - `node scripts/playtest.mjs http://localhost:4173/ /tmp/e1-antes`;
  - guarde `/tmp/e1-antes-2-tc.png` e `/tmp/e1-antes-3-minorgod.png` (não commitar).

### Bloco A — Dados das Eras (sem mudar regras)

- [ ] **A1. `src/core/data/ages.ts`:** troque o array `AGES` pelas 8 Eras da tabela "Eras" e acrescente, depois de
  `MAX_AGE`:

  ```ts
  /** Índices das Eras (docs/ERAS.md §1). */
  export const ERA = { ARCHAIC: 0, CLASSICAL: 1, HELLENISTIC: 2, BYZANTINE: 3, GUNPOWDER: 4, ENLIGHTENMENT: 5, INDUSTRIAL: 6, MODERN: 7 } as const;
  /** Era dos Titãs e do Portal dos Titãs (a Moderna). */
  export const ERA_TITANS = ERA.MODERN;
  /** Idade antiga (0–4, até 06/10/2026) → Era nova: só a dos Titãs muda (4 → 7). Só para dados gravados antes da E1. */
  export const LEGACY_AGE_TO_ERA: readonly number[] = [0, 1, 2, 3, 7];
  /** Campanha atual: Eras I–IV, com a aparência limitada à Helenística (docs/ERAS.md §10). */
  export const CAMPAIGN_MAX_ERA = ERA.BYZANTINE;
  export const CAMPAIGN_VISUAL_ERA_MAX = ERA.HELLENISTIC;
  /** Inteiro de Era válido (0…MAX_AGE); NaN/infinito → 0. */
  export function clampEra(n: number): number { return Number.isFinite(n) ? Math.max(0, Math.min(MAX_AGE, Math.floor(n))) : 0; }
  ```

  Ponha um comentário acima de `AGES`:

  > os índices 0–3 são as Idades de antes com os mesmos custos; a antiga Idade dos Titãs (4) virou a Moderna (7);
  > `minorGod` só onde `MAJOR_GODS.minorGods` tem o par (índice k ↔ `minorGods[k − 1]`).

  Confira: `npm run -s typecheck`.
- [ ] **A2. `src/core/data/index.ts`:**
  - troque `export { AGES, MAX_AGE } from './ages';` por
    `export { AGES, MAX_AGE, ERA, ERA_TITANS, LEGACY_AGE_TO_ERA, CAMPAIGN_MAX_ERA, CAMPAIGN_VISUAL_ERA_MAX, clampEra } from './ages';`;
  - troque `export { TECHS, ACADEMY_LINES } from './techs';` por
    `export { TECHS, ACADEMY_LINES, ROMAN, LINE_LEVELS } from './techs';`.

  O typecheck só passa depois do A4.
- [ ] **A3.** Titãs e Portal na Era 7:
  - `src/core/data/units.ts`: acrescente `import { ERA_TITANS } from './ages';` e troque `age: 4` por
    `age: ERA_TITANS` **só** em `prometheus`, `oceanus` e `cronus` (as três linhas com `tags: ['myth', 'titan', 'military']`).
    **Não** mexa em `perseus` (age 4);
  - `src/core/data/buildings.ts`: acrescente o mesmo import e troque, em `titan_gate`, `age: 4` por `age: ERA_TITANS`.
- [ ] **A4. `src/core/data/techs.ts`:**
  - acrescente, antes de `line`:
    ```ts
    /** Numerais dos níveis das linhas (I–VIII: um nível por Era). */
    export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] as const;
    /** Níveis de cada linha da Biblioteca (= número de Eras; tests/eras.test.ts confere). */
    export const LINE_LEVELS = 8;
    ```
  - em `line()`, troque `` name: `${name} ${['I', 'II', 'III', 'IV', 'V'][lvl - 1]}` `` por `` name: `${name} ${ROMAN[lvl - 1]}` ``;
  - nas 4 chamadas (`line('civic', 'Civismo', 5, …)` e as outras), troque o `5` por `LINE_LEVELS`.

  Confira: `npm run -s typecheck`, e
  `npx tsx -e "import { TECHS } from './src/core/data'; console.log(TECHS.science8.name, TECHS.science8.age)"`
  imprime `Ciência VIII 7`.
- [ ] **A5. Outros dados:**
  - **Faça antes o passo B1** (só os tipos em `src/core/types.ts`): sem ele, `library`, `queueMax` e `perCity` não
    compilam. Marque o B1 como feito e siga;
  - `src/core/data/buildings.ts`:
    - `academy` com os campos da tabela "Biblioteca" (troque `age: 1` por `age: 0`, `name` por `'Biblioteca'`, a
      `desc` pela nova e acrescente `library: true, queueMax: 5, perCity: true`; `limit: 3`, `scholars`, custo, vida,
      pegada, obra, ícone e atalho ficam);
    - descs de `town_center` e `temple`.
  - `src/core/data/gods.ts`: os perks da seção "Conteúdo traduzido nos dados".
- [ ] **A6. `src/i18n/en-data.ts`:**
  - troque `EN_AGES` pelas 8 entradas `'0'..'7'` com `name`, `short` e `desc` (tabelas acima);
  - na `line()` do EN, troque `['I', 'II', 'III', 'IV', 'V']` por `['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']`;
  - `academy`: `{ name: 'Library', desc: … }` (tabela "Biblioteca");
  - desc de `town_center` e o fim da desc de `temple`;
  - os perks EN de Zeus e Hades.
- [ ] **A7. `tests/data.test.ts`:** troque `expect(AGES.length).toBe(5);` por `expect(AGES.length).toBe(8);`. Confira:
  `npx vitest run tests/data.test.ts tests/i18n.test.ts` passa. O i18n acusa `civic6..8` se o A6 faltar.

### Bloco B — Biblioteca no núcleo

- [ ] **B1. `src/core/types.ts`, interface `BuildingDef`** (já feito no A5, se seguiu a ordem)**:** acrescente, depois
  de `gate?: boolean;`:
  ```ts
  library?: boolean;          // Biblioteca (id 'academy'): o avanço de Era sai daqui (canAdvanceAge)
  queueMax?: number;          // itens que cabem na fila (padrão DEFAULT_QUEUE_MAX = 10; a Biblioteca: 5)
  perCity?: boolean;          // com limit numérico: no máximo um por Centro Cívico (a Biblioteca: uma por cidade, até 3)
  ```
  Em `GameConfig`, troque o comentário de `maxAge` (0–4) por "(0–7)" e acrescente:
  ```ts
  visualEraMax?: number;      // aparência por Era limitada a esta Era (só o renderizador lê; campanha: 2 = Helenística)
  ```
- [ ] **B2. `src/core/constants.ts`:** acrescente
  `export const DEFAULT_QUEUE_MAX = 10;   // itens na fila de um edifício sem queueMax`.
  Ainda **não** suba o `SIM_VERSION` (passo D7).
- [ ] **B3. `src/core/sim/commands.ts`:**
  1. Importe `DEFAULT_QUEUE_MAX` de `'../constants'`, e `endAgeReason` de `'./restrictions'` (que já é importado
     para `forbiddenReason`/`maxAgeOf`).
  2. Acrescente e exporte:
     ```ts
     /** Itens que cabem na fila do edifício (Biblioteca: 5; os outros: 10). */
     export function queueMaxOf(type: string): number { return BUILDINGS[type]?.queueMax ?? DEFAULT_QUEUE_MAX; }
     /** Contratar filósofo: Biblioteca pronta, teto de filósofos, fila com vaga e recursos (a mesma regra no HUD e na IA). */
     export function canHireScholar(state: GameState, player: Player, b: Building): CommandResult {
       void state;
       if (!b.complete || !BUILDINGS[b.type].scholars) return { ok: false };
       const queued = b.queue.filter((q) => q.kind === 'scholar').length;
       if (b.scholars + queued >= MAX_SCHOLARS) return { ok: false, reason: t('err.maxScholars', { n: MAX_SCHOLARS }) };
       if (b.queue.length >= queueMaxOf(b.type)) return { ok: false, reason: t('err.queueFull') };
       if (!canAfford(player, SCHOLAR_COST)) return { ok: false, reason: t('err.noResources') };
       return { ok: true };
     }
     ```
  3. No `case 'hireScholar':`, mantenha a 1ª linha (`const b = ownedBuilding(state, cmd.player, cmd.buildingId);`) e
     troque as **quatro** linhas de checagem logo abaixo dela (`if (!b || !b.complete …`, `const queued …`,
     `if (b.scholars + queued …` e `if (!canAfford(player, SCHOLAR_COST)) …`) por
     `if (!b) return { ok: false }; const c = canHireScholar(state, player, b); if (!c.ok) return c;`.
     Mantenha o pagamento (`const paid …`, `pay(…)`) e o `push` iguais.
  4. Em `canTrain` e em `canResearch`, troque `if (b.queue.length >= 10)` por `if (b.queue.length >= queueMaxOf(b.type))`.
  5. Em `canAdvanceAge`, troque a linha `if (player.age >= maxAgeOf(...)) return { ok: false, reason: t('err.forbidden') };`
     por `… return { ok: false, reason: endAgeReason(state, player.id) };`. Depois, troque a linha
     `if (b && (b.type !== 'town_center' || !b.complete)) return { ok: false, reason: t('err.advanceAtTC') };` por:
     ```ts
     if (b) {
       if (!BUILDINGS[b.type]?.library || !b.complete) return { ok: false, reason: t('err.advanceAtLibrary') };
       if (b.queue.length >= queueMaxOf(b.type)) return { ok: false, reason: t('err.queueFull') };
     } else if (countBuildings(state, player.id, (x) => x.complete && !!BUILDINGS[x.type]?.library) === 0) return { ok: false, reason: t('msg.needLibrary') };
     ```
     A ordem das checagens fica assim:
     - Era máxima;
     - Era final/trava;
     - Biblioteca;
     - avanço em andamento;
     - edifício requerido;
     - estudos;
     - recursos.

     O `tests/scenario-gaps.test.ts` depende de "Era final/trava" vir antes de "Biblioteca".

  `advanceAge()` não muda: ele já chama `canAdvanceAge(state, player, b)`, que agora confere a fila.
- [ ] **B4. `src/core/sim/restrictions.ts`:** importe `AGES` junto de `MAX_AGE` e o tipo `GameConfig`, e acrescente:
  ```ts
  /** Partida de cenário (campanha, Horda, cenário JSON): as travas falam "Proibido nesta missão". */
  export function isScenarioConfig(c: GameConfig): boolean { return !!(c.scenario || c.scenarioData); }
  /** Motivo de recusa do avanço além da Era final: em cenário "Proibido nesta missão"; na partida rápida "Era final desta partida: X". */
  export function endAgeReason(state: GameState, player: number): string {
    return isScenarioConfig(state.config) ? t('err.forbidden') : t('err.endAge', { age: AGES[maxAgeOf(state, player)].name });
  }
  ```
- [ ] **B5. `src/core/sim/entities.ts`, `buildingLimitOk`:** troque o ramo `else if (typeof def.limit === 'number') {…}` por:
  ```ts
  } else if (typeof def.limit === 'number') {
    const have = countBuildings(state, player.id, (b) => b.type === type);
    if (have >= def.limit) return { ok: false, reason: t('err.limit', { name: def.name, n: def.limit }) };
    if (def.perCity) {
      const cities = countBuildings(state, player.id, (b) => b.type === 'town_center');
      if (have >= cities) return { ok: false, reason: t('err.limitPerCity', { name: def.name, n: cities, max: def.limit }) };
    }
  }
  ```
- [ ] **B6. `src/i18n/strings.ts`:** nas tabelas `pt` e `en`:
  - renomeie a chave `err.advanceAtTC` para `err.advanceAtLibrary` e `msg.needTC` para `msg.needLibrary`, com os
    textos novos;
  - crie `err.endAge`, `err.limitPerCity`, `err.saveVersion`, `sel.queue`, `cmd.studyTree`, `cmd.studyTreeTip`,
    `hk.advance`, `menu.tree`, os `tree.*`, os `line.*` e os `main.*` da tabela.

  Confira: `npm run -s typecheck` (o `en` é `Record<keyof typeof pt>`: chave só de um lado não compila) e
  `grep -rn "advanceAtTC\|needTC" src` vazio. O `msg.needTC` ainda está em `src/ui/hud.ts`; troque-o já pelo
  `msg.needLibrary`.
- [ ] **B7. Testes do núcleo que avançavam no Centro Cívico** (detalhes em "Testes a escrever ou atualizar"):
  `tests/sim.test.ts`, `tests/economy-regressions.test.ts`, `tests/movement-ai.test.ts`, `tests/scenario-gaps.test.ts`.
  Escreva a parte "Biblioteca" de `tests/eras.test.ts`. Confira:
  `npx vitest run tests/eras.test.ts tests/sim.test.ts tests/economy-regressions.test.ts tests/movement-ai.test.ts tests/command-fuzz.test.ts`
  (o `scenario-gaps` só fica verde no C4).

### Bloco C — Era inicial, Era final e `visualEraMax` no núcleo

- [ ] **C1. `src/core/sim/game.ts`:**
  1. Importe `ACADEMY_LINES`, `AGES`, `MINOR_GODS`, `TECHS` e `clampEra` de `'../data'` (junto de `BUILDINGS`,
     `MAJOR_GODS` e `UNITS`). Importe também `isScenarioConfig` de `'./restrictions'` e o tipo `Player` (já importado).
  2. Acrescente e exporte, antes de `createGame`:
     ```ts
     /**
      * Era inicial acima da I numa partida sem cenário (docs/eras/E1, D9): o deus menor e o poder de cada Era pulada (humano: o 1º
      * do par; IA: (personalidade + Era − 1) % 2, a conta de tryAdvanceAge) e os estudos das linhas que a Era inicial exigiu (nível 1
      * de cada linha em rodízio, na ordem de ACADEMY_LINES). Determinístico: só config e personalidade.
      */
     export function grantStartingEras(p: Player, startAge: number): void {
       const major = MAJOR_GODS[p.god];
       for (let k = 1; k <= startAge; k++) {
         if (!AGES[k].minorGod) continue;
         const pair = major?.minorGods[k - 1] ?? [];
         if (pair.length === 0) continue;
         const pick = p.ai ? pair[(p.ai.personality + (k - 1)) % pair.length] : pair[0];
         if (!MINOR_GODS[pick] || p.minorGods.includes(pick)) continue;
         p.minorGods.push(pick);
         const power = MINOR_GODS[pick].power;
         if (!p.powers.some((x) => x.id === power)) p.powers.push({ id: power, used: false });
       }
       const n = AGES[startAge].requires.techCount ?? 0;
       for (let i = 0; i < n; i++) {
         const id = `${ACADEMY_LINES[i % ACADEMY_LINES.length]}${Math.floor(i / ACADEMY_LINES.length) + 1}`;
         if (TECHS[id] && !p.techs.includes(id)) p.techs.push(id);
       }
     }
     ```
  3. Em `createGame`, logo depois de `const mode = …`, acrescente
     `const startAge = clampEra(config.startingAge ?? (mode === 'deathmatch' ? 1 : 0));`. No literal do `Player`, troque
     `age: config.startingAge ?? (mode === 'deathmatch' ? 1 : 0)` por `age: startAge`.
  4. Entre o literal `const p: Player = {…};` e `state.players.push(p);`, acrescente
     `if (!isScenarioConfig(config)) grantStartingEras(p, startAge);`. O `recomputeMods(state, p)`, que já vem logo
     depois, aplica os estudos concedidos.
- [ ] **C2. `src/core/scenario/schema.ts`:**
  - no tipo `ScenarioFile.config`, acrescente `visualEraMax?: number;` depois de `maxAge?: number; forbid?: Forbid;`;
  - na validação da config (perto de `if (c.startingAge !== undefined …)`):
    ```ts
    if (c.visualEraMax !== undefined && (!isInt(c.visualEraMax) || c.visualEraMax < 0 || c.visualEraMax > MAX_AGE)) err('config.visualEraMax', `esperado um inteiro entre 0 e ${MAX_AGE}`);
    ```
    Use `if`; **não** use `checkMaxAge`, que recusaria valor abaixo de `startingAge`, e a campanha precisa de 2 com
    `startingAge` 3;
  - no tipo `StatName`, acrescente `| 'studies'`; na constante `STATS`, acrescente `'studies'`.
- [ ] **C3. `src/core/scenario/compile.ts`:**
  - importe `academyTechCount` de `'../sim/commands'` (o arquivo já importa `useAbility` de lá);
  - em `value()`, no `switch (v.stat)`, acrescente
    `case 'studies': return academyTechCount(p);   // estudos das 4 linhas da Biblioteca (requisito das Eras)`;
  - em `scenarioConfig`, depois de `if (c.maxAge !== undefined) cfg.maxAge = c.maxAge;`, acrescente
    `if (c.visualEraMax !== undefined) cfg.visualEraMax = c.visualEraMax;`.
- [ ] **C4. Testes** (partes "Era inicial/final" e "cenário" de `tests/eras.test.ts`; ver a seção de testes). Em
  `tests/scenario-gaps.test.ts`, a validação de `maxAge: 7` passa a ser `maxAge: 8` (D1), e o teste do `remove` muda
  como diz a tabela de testes. Em `tests/modes.test.ts`, acrescente o `expect` do deus menor no Deathmatch. Confira:
  `npx vitest run tests/eras.test.ts tests/scenario-gaps.test.ts tests/scenario-json.test.ts tests/modes.test.ts`.

### Bloco D — IA

- [ ] **D1.** Em `src/core/sim/ai.ts`, troque as tabelas pelas da seção "IA" e exporte-as: `export const VILLAGER_TARGET`,
  `FARM_LIMIT`, `ARMY_ATTACK` e, mais abaixo, `MIN_ARMY`. Comentário: "uma posição por Era (tests/eras.test.ts confere)".
- [ ] **D2.** Exporte `RESEARCH_PRIORITY` e acrescente os níveis 6–8 **no fim** da lista, para manter igual a ordem de
  hoje até o nível 5:
  ```ts
  export const RESEARCH_PRIORITY = [
    …os ids de hoje, sem mudar a ordem…,
    ...[6, 7, 8].flatMap((l) => ['civic', 'military', 'science', 'commerce'].map((k) => `${k}${l}`)),
  ];
  ```
- [ ] **D3. Plano de construção (o array `plan` dentro de `manageBuilding` em `ai.ts`):**
  - troque a condição da 1ª entrada `academy` de `cond: age >= 1 && has('academy') === 0` por
    `cond: has('academy') === 0 && (age >= 1 || snap.villagers.length >= 9)`. Na Era I a Biblioteca vem depois do
    Templo (≥ 8 cidadãos) e junto do Quartel; quem começa na Era II ou acima (campanha, Deathmatch, testes) a ergue logo,
    como hoje fazia com a Academia;
  - troque a condição do `titan_gate` (`cond: age >= 4 && …`) por `cond: age >= BUILDINGS.titan_gate.age && has('titan_gate') === 0`;
  - na 2ª Biblioteca, troque `has('academy') < 2` por `has('academy') < Math.min(2, has('town_center'))` (o resto da
    condição fica). Sem isso, com 1 Centro Cívico a IA tenta a cada pensamento um local que o `perCity` recusa, e cada
    tentativa varre centenas de tiles (`findBuildSpot` e os fallbacks em volta dos outros edifícios).
- [ ] **D4. `tryAdvanceAge`:** troque o corpo inteiro por:
  ```ts
  function tryAdvanceAge(state: GameState, player: Player, snap: Snapshot): void {
    if (player.age === 0 && snap.villagers.length < 12) return;
    // Biblioteca pronta com a menor fila (empate: menor id — são edifícios do próprio jogador, sem viés de posição);
    // o avanço pode entrar atrás de no máximo 1 estudo
    const lib = (snap.byType.get('academy') ?? []).filter((b) => b.complete && b.queue.length <= 1).sort((a, b) => a.queue.length - b.queue.length || a.id - b.id)[0];
    if (!lib) return;
    const c = canAdvanceAge(state, player, lib);
    if (!c.ok) return;
    let minor: string | undefined;
    if (c.minorOptions && c.minorOptions.length > 0) minor = c.minorOptions[(player.ai!.personality + player.age) % c.minorOptions.length];
    applyCommand(state, { type: 'advanceAge', player: player.id, buildingId: lib.id, minorGod: minor });
  }
  ```
- [ ] **D5. `budgetOf`:** troque o laço `for (const r of ['food', 'wood', 'gold', 'knowledge', 'favor'])` por
  `for (const r of RESOURCES)` (o import já existe). Troque também
  `const fundMet = done || (surplus.food >= 0 && surplus.gold >= 0 && surplus.knowledge >= 0 && surplus.favor >= 0);`
  por `const fundMet = done || RESOURCES.every((r) => surplus[r] >= 0);`. Para os custos de hoje dá o mesmo resultado,
  porque `surplus.wood` nunca é negativo sem madeira no custo; e a E2 já fica pronta.
- [ ] **D6. `scripts/loadtest.ts`:**
  - no `plan`, troque `['academy', 1, 1]` por `['academy', 1, 0]`;
  - no bloco `if (tc) { const adv = canAdvanceAge(state, p, tc); … buildingId: tc.id … }`, troque por:
    ```ts
    const lib = buildings.filter((b) => b.type === 'academy' && b.complete).sort((a, b) => a.queue.length - b.queue.length || a.id - b.id)[0];
    if (lib) {
      const adv = canAdvanceAge(state, p, lib);
      if (adv.ok) out.push({ type: 'advanceAge', player: me, buildingId: lib.id, minorGod: adv.minorOptions && adv.minorOptions.length ? this.rng.pick(adv.minorOptions) : undefined });
    }
    ```
- [ ] **D7. `src/core/constants.ts`:** `export const SIM_VERSION = 4;`. No comentário acima, acrescente:
  > 4 = Eras (E1): 8 Eras, Biblioteca (avanço de Era e fila de 5, uma por cidade), linhas × 8, Era inicial/final; a IA
  > avança na Biblioteca.
- [ ] **D8.** `tests/position-fairness.test.ts`: `expect(r.ok).toBe(30)` → `33` (Egeu) e `expect(r.ok).toBe(10)` →
  `11` (Estreito). A Biblioteca na Era I passa a dar local nos dois lados; a simetria foi conferida em 06/10/2026:
  - Egeu: (27,5; 21,5) ↔ (85,5; 21,5) / (85,5; 91,5) / (27,5; 91,5);
  - Estreito: (18,5; 65,5) ↔ (61,5; 14,5).

  Escreva a parte "IA" de `tests/eras.test.ts`. Confira:
  `npx vitest run tests/eras.test.ts tests/position-fairness.test.ts tests/movement-ai.test.ts tests/scenario-gaps.test.ts tests/determinism.test.ts`,
  e `npm run smoke 20 42` duas vezes com o mesmo "hash final".

### Bloco E — Save de versão antiga

- [ ] **E1. `src/core/serialize.ts`:**
  - importe `t` de `'../i18n'`;
  - troque `const VERSION = 1;` por:
    ```ts
    /** Formato do save: 2 = Eras (E1). Save de outro formato não carrega (o menu avisa por saveVersionOf). */
    export const SAVE_VERSION = 2;
    /** Versão do formato de um save sem interpretar o JSON inteiro (null: não é um save). */
    export function saveVersionOf(json: string): number | null {
      const m = /^\s*\{\s*"version"\s*:\s*(\d+)/.exec(json.slice(0, 64));
      if (m) return Number(m[1]);
      try { const o = JSON.parse(json) as { version?: unknown }; return typeof o?.version === 'number' ? o.version : null; } catch { return null; }
    }
    ```
  - troque os usos de `VERSION` por `SAVE_VERSION`;
  - troque `throw new Error('Versão de save incompatível.');` por
    `throw new Error(t('err.saveVersion', { v: String(o.version ?? '?'), cur: SAVE_VERSION }));`.
- [ ] **E2. `src/main.ts`:**
  - importe `SAVE_VERSION` e `saveVersionOf` de `'./core/serialize'`, e `storeRemove` de `'./game/cloud'`;
  - troque `const hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } };` por:
    ```ts
    const savedJson = () => { try { return localStorage.getItem(SAVE_KEY); } catch { return null; } };
    const hasSave = () => { const j = savedJson(); return !!j && saveVersionOf(j) === SAVE_VERSION; };
    const hasOldSave = () => { const j = savedJson(); return !!j && saveVersionOf(j) !== SAVE_VERSION; };
    ```
  - no `new MainMenu(root, {…})`, acrescente
    `hasOldSave, onDeleteOldSave: () => { try { storeRemove(SAVE_KEY); } catch { /* ignore */ } }`.
- [ ] **E3. `src/ui/menu.ts`:**
  - em `MenuCallbacks`, acrescente `hasOldSave?: () => boolean; onDeleteOldSave?: () => void;`;
  - em `render()`, logo depois do botão `#m-load`, acrescente
    `${this.cb.hasOldSave?.() ? `<button class="btn danger" id="m-oldsave" title="${t('main.oldSave')}">${t('main.oldSaveDelete')}</button>` : ''}`;
  - depois do `</div>` de `.actions`, acrescente
    `${this.cb.hasOldSave?.() ? `<div id="m-oldsave-note" style="color:#f2c14e;font-size:12px;margin-top:6px">${t('main.oldSave')}</div>` : ''}`;
  - no bind, acrescente
    `this.el.querySelector('#m-oldsave')?.addEventListener('click', () => { if (!confirm(t('main.oldSaveConfirm'))) return; this.cb.onDeleteOldSave?.(); this.render(); });`.

  Confira: `npx vitest run tests/eras.test.ts tests/steam.test.ts` passa. O steam.test acusa `localStorage.removeItem`
  direto: use `storeRemove`.

### Bloco F — Campanha

- [ ] **F1. Configs.**
  - TS (`src/core/scenario/campaign.ts`): importe `CAMPAIGN_MAX_ERA` e `CAMPAIGN_VISUAL_ERA_MAX` de `'../data'` e
    acrescente `maxAge: CAMPAIGN_MAX_ERA, visualEraMax: CAMPAIGN_VISUAL_ERA_MAX` ao `config` de `m1_despertar`,
    `m2_cerco` e `m3_portal` (não na `HORDE`);
  - JSON (os 10 arquivos de `src/core/scenario/missions/`): no objeto `"config"`, acrescente uma linha
    `    "maxAge": 3, "visualEraMax": 2,` **imediatamente antes** da linha `"startingResources"`. Em m9, m10 e m11, que já
    têm `"maxAge": 3`, acrescente só `    "visualEraMax": 2,`. **Não** reescreva os arquivos com `JSON.stringify`:
    o diff ficaria gigante (os mapas embutidos);
  - `src/core/scenario/testing.ts`, `staticMissionIssues`: na casca `shell.config`, acrescente
    `...(c.maxAge !== undefined ? { maxAge: c.maxAge } : {}), ...(c.visualEraMax !== undefined ? { visualEraMax: c.visualEraMax } : {})`.

  Confira: `npx vitest run tests/missions.test.ts` (validação estática).
- [ ] **F2. Textos.** Aplique as substituições da tabela "Substituições de texto nas missões" em `campaign.ts` (m1 e
  `HORDE.intro`) e nos 10 JSON, e as trocas pontuais da tabela da campanha (m4 `intro`, m12 `altares_caem`). Depois,
  rode o comando abaixo: só podem sobrar linhas de comentário (`//`, em `campaign.ts`), ocorrências de "Idade de
  Ouro"/"Idade de Cronos"/"Golden Age"/"Age of Cronus" e, até o F3/F4, as dos gatilhos e textos de Titãs.
  ```sh
  grep -rn "Idade \(Arcaica\|Clássica\|Heroica\|Mítica\|dos Titãs\)\|Academia\|Heroic Age\|Mythic Age\|Classical Age\|Archaic Age\|Age of Titans\|Academy" src/core/scenario/missions src/core/scenario/campaign.ts
  ```
- [ ] **F3. Falas de "Idade dos Titãs" que nunca mais disparam (D12):**
  - apague o gatilho `aviso_portal` de `m4_caucaso.scenario.json`;
  - apague `portal_liga_fala`, `portal_micenas_fala` e `portal_argos_fala` de `m6_estatua.scenario.json`. Cuidado com a
    vírgula entre os objetos da lista `triggers`;
  - `tests/m4_caucaso.test.ts` e `tests/m6_estatua.test.ts`: ver a seção de testes.
- [ ] **F4. Prometeu por roteiro (D12): Fortaleza pronta + 6 estudos das linhas + 500 de Favor.**
  1. **m8** (`m8_oceano.scenario.json`; o jogador começa com 4 estudos e 200 de Favor):
     - dica que começa com "Para chamar Prometeu" (a 6ª da lista `hints`, índice 5): PT
       `Para chamar Prometeu: erga uma Fortaleza, complete 6 estudos das linhas da Biblioteca (faltam dois) e junte 500 de Favor (cidadãos rezando no Templo); ele atende ao chamado de Argos e leva o Favor.`,
       EN
       `To call Prometheus: raise a Fortress, complete 6 Library line studies (two to go) and gather 500 Favor (villagers praying at the Temple); he answers Argos's call and takes the Favor.`;
     - texto do `say` do gatilho `pitia_portal`: PT
       `Vejo fogo que atende a Argos. Uma Fortaleza (tecla V), mais dois estudos na Biblioteca e 500 de Favor chamam Prometeu.`,
       EN `I see a fire that answers Argos. A Fortress (V key), two more Library studies and 500 Favor call Prometheus.`;
     - objetivo `titas`: PT `Chame Prometeu (Fortaleza, 6 estudos das linhas e 500 de Favor)`, EN
       `Call Prometheus (Fortress, 6 line studies and 500 Favor)`;
     - gatilho novo, imediatamente **antes** do gatilho `"id": "prometeu"` (o `give` negativo cobra o Favor; a m5 já usa
       `give` com valor negativo):
       ```json
       { "id": "chama_prometeu", "when": { "all": [ { "buildings": { "player": 0, "type": "fortress", "complete": true }, "gte": 1 }, { "value": { "stat": "studies", "player": 0 }, "gte": 6 }, { "value": { "stat": "favor", "player": 0 }, "gte": 500 }, { "units": { "player": 0, "type": "prometheus" }, "eq": 0 } ] }, "then": [
         { "do": "give", "player": 0, "resources": { "favor": -500 } },
         { "do": "spawn", "player": 0, "units": ["prometheus"], "at": { "entity": { "player": 0, "type": "fortress" }, "dy": 4 } } ] },
       ```
  2. **m12** (`m12_titanomaquia.scenario.json`; o jogador começa com 5 estudos e 200 de Favor):
     - dica que começa com "Para chamar Prometeu" (a 5ª da lista `hints`, índice 4): PT
       `Para chamar Prometeu: termine a Fortaleza da Nova Argos com cidadãos (botão direito nela), faça mais um estudo na Biblioteca e junte 500 de Favor. Terminar a Fortaleza também salva a missão: sem Centro Cívico e sem Fortaleza pronta, os exilados estão perdidos.`,
       EN
       `To call Prometheus: finish the New Argos Fortress with villagers (right-click it), complete one more study at the Library and gather 500 Favor. Finishing the Fortress also saves the mission: with no Town Center and no finished Fortress, the exiles are lost.`;
     - `say` do `pitia_portal`: PT `Prometeu ainda atende a Argos. Termine a Fortaleza, faça mais um estudo na Biblioteca e junte 500 de Favor: ele vem.`,
       EN `Prometheus still answers Argos. Finish the Fortress, complete one more study at the Library and gather 500 Favor: he will come.`;
     - objetivo `prometeu`: PT `Chame Prometeu de volta (Fortaleza, 6 estudos das linhas e 500 de Favor)`, EN
       `Call Prometheus back (Fortress, 6 line studies and 500 Favor)`;
     - o mesmo gatilho `chama_prometeu` (com o `give` de −500 de Favor) antes do gatilho `"id": "prometeu"`.
  3. **m3** (`campaign.ts`, `m3_portal`; o jogador começa com 3 estudos e 80 de Favor):
     - 2º parágrafo do `intro`:
       `'Você tem a liberdade de escolher o caminho: destrua o Portal antes que se conclua, ou erga uma Fortaleza, complete 6 estudos das linhas da Biblioteca, junte 500 de Favor e chame Prometeu para enfrentá-lo.'`;
     - objetivo `titan`: `text: 'Ou: erga uma Fortaleza, complete 6 estudos das linhas da Biblioteca e junte 500 de Favor para chamar Prometeu'`
       (o `check` fica);
     - na fala de Zeus do gatilho `cronus_rises`, troque `Perseu tem dano extra contra Titãs.` por
       `Uma Fortaleza, 6 estudos na Biblioteca e 500 de Favor chamam Prometeu.`;
     - importe `academyTechCount` de `'../sim/commands'` e acrescente, depois do gatilho `start`:
       ```ts
       { id: 'prometeu_chamado', when: (s) => countBuildings(s, ME, 'fortress') >= 1 && academyTechCount(s.players[ME]) >= 6 && s.players[ME].resources.favor >= 500 && count(s, ME, (u) => u.type === 'prometheus') === 0, then: (s, c) => { const f = [...s.buildings.values()].find((b) => b.owner === ME && !b.dead && b.complete && b.type === 'fortress'); if (!f) return; s.players[ME].resources.favor -= 500; spawnGroup(s, ME, ['prometheus'], f.x, f.y + f.h / 2 + 2); c.say('Prometeu', 'Argos me chamou, e eu atendo. O fogo que roubei arde agora contra Cronos.', '🔥'); } },
       ```
       O `countBuildings` de `helpers.ts` só conta os edifícios prontos.
  4. **Harness** (`src/core/scenario/testing.ts`):
     - em `m8Titans`, apague o bloco `if (p.age >= 4) { … }` (Portal) e troque a última linha
       `return canAdvanceAge(state, p, tc).ok ? { type: 'advanceAge', player: 0, buildingId: tc.id } : null;` por
       `return null;` (a Fortaleza pronta e os estudos bastam; quem chama Prometeu é o gatilho `chama_prometeu`, quando o
       passo `reza` juntou o Favor). Atualize o comentário acima da função no mesmo sentido. Se `canAdvanceAge` ficar sem
       uso em `testing.ts` (`grep -n "canAdvanceAge" src/core/scenario/testing.ts`), tire-o do `import` da linha 16;
     - troque o corpo inteiro de `m8ArmyReserve` por:
       ```ts
       const base = { food: 150, wood: 150, gold: 100 };
       if (!titans || state.scenario?.fired.includes('prometeu')) return base;
       if (!firstBuilding(state, 'fortress')) return { food: 150, wood: 550, gold: 400, favor: 500 };
       return { ...base, favor: 500 };
       ```
       e o comentário acima dela por "folga das filas militares; na variante dos Titãs, também a Fortaleza e os 500 de
       Favor de Prometeu";
     - na variante `'titãs'` de `m8_oceano`, troque a lista `reserve` por:
       ```ts
       reserve: [
         { when: { not: { fired: 'prometeu' } }, resources: { favor: 500, knowledge: 600 } },
         { when: { buildings: { player: 0, type: 'fortress' }, eq: 0 }, resources: { wood: 400, gold: 300 } },
       ],
       ```
     - o passo `reza` de `m8Steps(true)`, `m8Pray`, `m8Praying`, `M8_WORSHIPPERS` e o `m8Detach` **ficam** como estão:
       eles juntam o Favor de Prometeu. Só atualize o comentário de `M8_WORSHIPPERS` ("o Favor de Prometeu: 500").
- [ ] **F5. m1, dica da Biblioteca.**
  - TS (`campaign.ts`), depois do gatilho `tip_temple`:
    ```ts
    { id: 'tip_library', when: (s) => s.scenario!.objectives.temple === 'done', then: (_s, c) => c.say('Oráculo de Delfos', 'Para avançar de Era, erga uma Biblioteca (tecla Z com cidadãos selecionados), selecione-a e use Avançar (tecla E). Ela também estuda as linhas que abrem as próximas Eras.', '🔮') },
    ```
  - JSON (`m1_despertar.scenario.json`), depois de `tip_temple`:
    ```json
    { "id": "tip_library", "when": { "objective": "temple", "is": "done" }, "then": [
      { "do": "say", "speaker": { "pt": "Oráculo de Delfos", "en": "Oracle of Delphi" }, "icon": "🔮",
        "text": { "pt": "<o texto PT acima, idêntico>", "en": "To advance an Era, raise a Library (Z key with villagers selected), select it and use Advance (E key). It also studies the lines that open the next Eras." } } ] },
    ```
- [ ] **F6. Testes de campanha:** a parte "campanha" de `tests/eras.test.ts`. Atualize `tests/m4_caucaso.test.ts`,
  `tests/m5_itaca.test.ts` e `tests/m6_estatua.test.ts`. Confira:
  - `npx vitest run tests/eras.test.ts tests/missions.test.ts tests/scenario-json.test.ts tests/m4_caucaso.test.ts tests/m5_itaca.test.ts tests/m6_estatua.test.ts tests/m8_oceano.test.ts tests/m12_titanomaquia.test.ts`;
  - depois, `npx tsx scripts/missions.ts`: tudo OK, em ~12 min ou mais. Missão fora da janela: ajuste o roteiro em
    `testing.ts` (passos, cofres, `mix`) ou os números da missão. **Nunca** afrouxe o `expect` sem registrar o motivo
    em `docs/STORY.md`. Causas prováveis:
    - a IA do jogador gastou na Biblioteca da Era I;
    - Prometeu apareceu na variante principal da m3/m8/m12 (procure `prometeu` nos gatilhos disparados da variante
      principal): a IA do jogador ergueu Fortaleza, estudou e juntou 500 de Favor sozinha. Não tire o custo do gatilho;
      registre o caso em `docs/STORY.md` e ajuste o roteiro da variante principal para o Favor não ficar parado em 500
      (por exemplo, gastá-lo em criaturas míticas no Templo pelo `mix` do `trainArmy`); ou declare que a variante
      principal agora tem Prometeu, com o motivo, e mande a decisão ao dono (pendência no `PROGRESSO.md`);
    - a variante "titãs" da m8 não chamou Prometeu: confira se o passo `reza` continua lá e se o `reserve` guarda os
      500 de Favor;
    - a fila de 5 da Biblioteca atrasou um passo do roteiro.

### Bloco G — Renderização, ícones e conquistas

- [ ] **G1. `src/render/art/logic.ts`:** troque `ageTier` por:
  ```ts
  /** Variante por Era do Centro Cívico até a E8: a0 = Arcaica, a1 = Clássica, a2 = da Helenística em diante (mármore). */
  export function ageTier(age: number): 'a0' | 'a1' | 'a2' { return age <= 0 ? 'a0' : age === 1 ? 'a1' : 'a2'; }
  /** Era que a arte mostra: a do dono, limitada por config.visualEraMax (campanha: 2 = Helenística). Só aparência. */
  export function visualEra(age: number, cap?: number): number { return typeof cap === 'number' && Number.isFinite(cap) ? Math.max(0, Math.min(age, Math.floor(cap))) : age; }
  ```
  Em `src/render/renderer.ts`:
  - importe `visualEra` junto de `ageTier`;
  - troque `variant = ageTier(state.players[b.owner].age)` por
    `variant = ageTier(visualEra(state.players[b.owner].age, state.config.visualEraMax))`;
  - no fantasma, troque `ageTier(state.players[local]?.age ?? 0)` por
    `ageTier(visualEra(state.players[local]?.age ?? 0, state.config.visualEraMax))`.

  Em `tests/art-library.test.ts`, troque `expect([0, 1, 2, 3, 4].map(ageTier)).toEqual(['a0', 'a1', 'a1', 'a2', 'a2']);`
  por `expect([0, 1, 2, 3, 4, 5, 6, 7].map(ageTier)).toEqual(['a0', 'a1', 'a2', 'a2', 'a2', 'a2', 'a2', 'a2']);`.
  Em `scripts/artages.mjs`, `const TC_TIER = ['a0', 'a1', 'a2', 'a2', 'a2'];`.
- [ ] **G2. Ícones das Eras:**
  1. Em `scripts/bake/hud/catalog.mjs`, troque `AGE_ICONS` pela lista da tabela "Ícones do HUD" e, no comentário do
     topo, "Idades" por "Eras".
  2. Em `src/ui/icons.ts`, importe `AGES` de `'../core/data/ages'` e troque
     `age: (n: number, cls?: string): string => iconHtml(`age/${Math.max(0, Math.min(4, n))}`, { cls }),` por
     `… Math.min(AGES.length - 1, n) …`.
  3. Em `src/ui/emoji.ts`, troque `'🌋': '@age/4'` por `'🌋': '@age/7'`.
  4. Rode `npm run art:hud`. O hash do cache inclui `catalog.mjs`, então ele re-renderiza o atlas `hud` inteiro no
     Chromium (alguns minutos) e grava `public/art/hud-*` e o grupo `hud` de `public/art/manifest.json`. É normal todos
     os PNG `hud-*` mudarem no diff (binário); não mexa em outros grupos do `manifest.json`.
  5. Rode `npm run art:hud -- --only age/ --scale 2 --contact /tmp/e1-icones` e olhe a folha de contato
     `/tmp/e1-icones/etapa7-icones-contato.png` com a ferramenta Read: as 8 Eras têm de ser distintas (o `--only` não
     grava índice nem cache). O `age/4` é o mesmo elmo do `age/2` em bronze escuro e o `age/6` repete a bigorna de
     `tech/divine_forge`: é o provisório combinado (D16), não "corrija".
  6. Rode `npm run art:check`: ok, sem erro `hud`.
- [ ] **G3. Conquistas:**
  - em `src/game/achievements.ts`, importe `ERA_TITANS` de `'../core/data'`;
  - troque o `check` de `titans` por `advancedTo(s, l, ERA_TITANS)`;
  - troque as `desc` PT de `classical`, `heroic`, `mythic` e `titans` e as EN no mapa de nomes EN (linhas ~45–48),
    pela tabela "Conquistas";
  - rode `npx tsx scripts/steam-achievements.ts` (regera `desktop/steam/achievements.{json,csv}`) e depois
    `npx tsx scripts/steam-achievements.ts --check`.

  Confira: `npx vitest run tests/hud-icons.test.ts tests/art-library.test.ts tests/steam.test.ts tests/i18n.test.ts`.

### Bloco H — Interface: textos, painel da Biblioteca, árvore de estudos e Eras na partida

- [ ] **H1. Textos:** aplique a tabela "Textos que mudam" em `src/i18n/strings.ts` (`pt` e `en`). Confira com:
  ```sh
  grep -n "Idade\|Academia" src/i18n/strings.ts
  ```
  Tem de sair vazio (conferido em 06/10/2026: todas as ocorrências de hoje estão nas duas tabelas acima). Confira também com:
  ```sh
  grep -n "Academy\|\bAges\?\b" src/i18n/strings.ts
  ```
  Aqui só podem sobrar "Age of Mythology", "Age of Earth" e as chaves.
- [ ] **H2. `src/ui/studytree.ts` (novo).** Funções puras, sem DOM, como `src/ui/scenario-hud.ts`:
  ```ts
  // Árvore de estudos da Biblioteca (E1/E9, docs/eras/E1-eras-biblioteca.md): modelo e HTML puros (sem DOM), com as MESMAS
  // regras do núcleo (canResearch/canAdvanceAge). Colunas = Eras; linhas = avanço de Era, as 4 linhas e outros estudos.
  import { ACADEMY_LINES, AGES, BUILDINGS, TECHS } from '../core/data';
  import type { Building, GameState, TechDef } from '../core/types';
  import { canAdvanceAge, canResearch, queueMaxOf } from '../core/sim/commands';
  import { endAgeReason, maxAgeOf } from '../core/sim/restrictions';
  import { techCost } from '../core/sim/modifiers';
  import { t } from '../i18n';
  import { esc } from './html';
  import { ic } from './icons';
  import { glyph } from './glyphs';

  export type StudyStatus = 'done' | 'active' | 'queued' | 'available' | 'locked';
  export interface StudyNode { id: string; kind: 'age' | 'tech'; era: number; name: string; desc: string; cost: Record<string, number>; time: number; status: StudyStatus; reason: string; progress: number }
  export interface StudyRow { id: string; label: string; cells: StudyNode[][] }   // cells[era]: nós daquela Era
  export interface StudyTreeModel { readOnly: boolean; era: number; libraries: number; queueUsed: number; queueMax: number; rows: StudyRow[] }

  /** Linha da árvore de uma tecnologia da Biblioteca (gancho da E3: as evoluções ganham linhas próprias aqui). */
  export function rowOf(tech: TechDef): string { return tech.line && ACADEMY_LINES.includes(tech.line) ? tech.line : 'other'; }
  /** Bibliotecas prontas do jogador pela fila (empate: menor id). */
  export function librariesOf(state: GameState, playerId: number): Building[] {
    return [...state.buildings.values()].filter((b) => b.owner === playerId && !b.dead && b.complete && !!BUILDINGS[b.type]?.library).sort((a, b) => a.queue.length - b.queue.length || a.id - b.id);
  }
  /** Biblioteca que recebe o próximo estudo: a de menor fila com vaga, ou null. */
  export function pickLibrary(state: GameState, playerId: number): Building | null { return librariesOf(state, playerId).find((b) => b.queue.length < queueMaxOf(b.type)) ?? null; }
  ```
  `studyTreeModel(state, playerId, readOnly = false): StudyTreeModel`:
  - `p = state.players[playerId]`, `libs = librariesOf(...)`, `lib = pickLibrary(...)`. `mine` = todos os edifícios
    vivos do jogador, usados para achar itens na fila: `queuedIn(kind, id?)` devolve
    `{ at: índice, progress: elapsed/total do item 0 }` ou null. `n = AGES.length`. Cada linha tem
    `cells = Array.from({ length: n }, () => [])`.
  - Linha `age` (`label: t('tree.row.age')`), para k = 1…n−1, com `id: \`age:${k}\``, `name/desc/cost/time` de
    `AGES[k]` e status:
    - `p.age >= k` → `done`;
    - `k === p.age + 1` e há item `age` na fila → `active` (índice 0, com `progress`) ou `queued`;
    - `k === p.age + 1` sem item → `c = canAdvanceAge(state, p, lib ?? undefined)`. Se `c.ok && lib`, `available`.
      Senão `locked`, com `reason = c.ok ? t('err.queueFull') : (c.reason ?? '')`;
    - `k > p.age + 1` → `locked`, com `reason = k > maxAgeOf(state, playerId) ? endAgeReason(state, playerId) : t('err.requiresAge', { age: AGES[k - 1].name })`.
  - Linhas das 4 linhas (`label: t(\`line.${l}\`)`) e `other` (`t('tree.row.other')`). Para cada `tech` de `TECHS`
    com `BUILDINGS[tech.building]?.library`:
    - linha `rowOf(tech)`, célula `Math.min(n − 1, tech.age)`, `cost: techCost(p, tech.id)`;
    - status `done` se `p.techs.includes(id)`;
    - senão, item na fila → `active`/`queued`;
    - senão, sem `lib` → `locked`, com `reason = libs.length ? t('err.queueFull') : t('tree.noLibrary')`;
    - senão, `canResearch(state, p, lib, id)`: ok → `available`, não ok → `locked` com `c.reason ?? ''`.
  - `queueUsed = (lib ?? libs[0])?.queue.length ?? 0`, `queueMax = libs[0] ? queueMaxOf(libs[0].type) : queueMaxOf('academy')`.

  `studyTreeKey(state, playerId): string` muda quando algo visível muda:
  ```ts
  const p = state.players[playerId];
  const q = [...state.buildings.values()].filter((b) => b.owner === playerId && !b.dead && BUILDINGS[b.type]?.library).map((b) => `${b.id}:${b.complete ? 1 : 0}:${b.queue.map((x) => `${x.id}@${Math.floor((x.elapsed / Math.max(1e-6, x.total)) * 20)}`).join(',')}`).join(';');
  return `${p.age}|${p.techs.length}|${q}|${Object.values(p.resources).map((v) => Math.floor(v / 25)).join(',')}`;
  ```
  `studyTreeHtml(m, fmtCost: (c: Record<string, number>) => string): string`, nesta ordem:
  - cabeçalho: `<div class="tree-head"><h2>${glyph('scroll')} ${t('tree.title')}</h2><span class="tree-queue">${m.libraries ? t('tree.queue', { n: m.queueUsed, max: m.queueMax }) : t('tree.noLibrary')}</span></div>`;
  - `<div class="tree-body"><div class="tree-grid" style="grid-template-columns: 150px repeat(${AGES.length}, minmax(120px, 1fr))">`
    com um `<div class="tree-corner"></div>`;
  - uma `<div class="tree-era${k === m.era ? ' cur' : ''}">${ic.age(k, 'sm')} <b>${esc(AGES[k].short)}</b></div>` por Era;
  - por linha: `<div class="tree-label">${esc(label)}</div>` e uma `<div class="tree-cell">` por Era com os nós;
  - cada nó é um `<button class="tree-node st-${status}" data-nav data-study="${esc(id)}"${status === 'available' && !m.readOnly ? '' : ' aria-disabled="true"'}>${kind === 'age' ? ic.age(era, 'sm') : ic.tech(id, 'sm')}<span class="nm">${esc(name)}</span>${status === 'active' ? `<span class="bar"><i style="width:${Math.round(progress * 100)}%"></i></span>` : ''}</button>`;
  - feche a grade e a `tree-body` e acrescente `<div class="tree-detail" id="tree-detail">${t('tree.hint')}</div>`, a
    legenda `<div class="tree-legend">…</div>` (dentro dela, `<span class="tree-chip st-${s}">${t(\`tree.st.${s}\`)}</span>`
    para os 5 status, na ordem done, active, queued, available, locked) e
    `<div class="actions"><button class="btn primary" id="m-close">${t('modal.close')}</button></div>` (o único
    `<button` sem `data-study`).

  `studyNodeDetail(x, fmtCost)`:
  `<b>${esc(x.name)}</b> · ${t(\`tree.st.${x.status}\`)}<div class="cost">${fmtCost(x.cost)} · ${glyph('clock')} ${x.time} s</div><div class="desc">${esc(x.desc)}</div>${x.reason ? `<div class="why">${esc(x.reason)}</div>` : ''}`.

  **Nada de `disabled` nos botões** (o controle não foca botão desabilitado: use `aria-disabled`) e **nada de emoji**.
- [ ] **H3. `src/ui/styles.css`:** acrescente, perto das regras de `#modal`:
  ```css
  #modal.tree { max-width: none; width: calc(96vw / var(--uiz, 1)); height: calc(92vh / var(--uiz, 1)); max-height: none; display: flex; flex-direction: column; }
  #modal.tree .tree-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  #modal.tree .tree-body { flex: 1; overflow: auto; }
  #modal.tree .tree-grid { display: grid; gap: 6px; align-items: start; }
  #modal.tree .tree-era { position: sticky; top: 0; background: var(--panel2); padding: 4px 6px; border-radius: 6px; text-align: center; }
  #modal.tree .tree-era.cur { outline: 1px solid var(--gold); }
  #modal.tree .tree-label { position: sticky; left: 0; background: var(--panel2); padding: 6px; border-radius: 6px; color: var(--marble); font-weight: bold; }
  #modal.tree .tree-cell { display: flex; flex-direction: column; gap: 4px; }
  #modal.tree .tree-node { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--border); background: var(--panel); color: var(--text); text-align: left; cursor: pointer; position: relative; }
  #modal.tree .tree-node .hic { width: 22px; height: 22px; flex: none; }
  #modal.tree .tree-node .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(0,0,0,.4); }
  #modal.tree .tree-node .bar i { display: block; height: 100%; background: var(--gold); }
  #modal.tree .st-done { border-color: #3f7d4a; background: #1d3324; }
  #modal.tree .st-active { border-color: var(--gold); }
  #modal.tree .st-queued { border-style: dashed; border-color: var(--gold); }
  #modal.tree .st-available { border-color: #5b8bd6; }
  #modal.tree .st-locked { opacity: .55; cursor: default; }
  #modal.tree .tree-detail { min-height: 56px; margin-top: 8px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); font-size: 13px; }
  #modal.tree .tree-detail .why { color: #ef4444; margin-top: 4px; }
  #modal.tree .tree-legend { display: flex; gap: 8px; margin-top: 6px; font-size: 12px; }
  #modal.tree .tree-chip { padding: 2px 8px; border: 1px solid var(--border); border-radius: 10px; }
  html.pad-active #modal.tree { max-height: none; height: calc(86vh / var(--uiz, 1)); }
  ```
  A última regra existe porque `html.pad-active #modal` (com controle) é mais específica que `#modal.tree` e cortaria a
  árvore em 82vh.
- [ ] **H4. `src/ui/hud.ts`:**
  1. Imports:
     - de `'../core/sim/commands'`, acrescente `canHireScholar`;
     - de `'./studytree'`, importe `studyTreeModel`, `studyTreeHtml`, `studyTreeKey`, `studyNodeDetail`,
       `pickLibrary`, `librariesOf` e `type StudyNode`.
  2. `tryAdvanceAge(tcArg?: Building)` vira `tryAdvanceAge(libArg?: Building)`. Troque as **três** primeiras linhas do
     corpo (`const s = …; const p = …;`, `const tc = tcArg ?? …;` e `if (!tc) { this.toast(t('msg.needTC'), 'warn'); return; }`)
     por:
     ```ts
     const s = this.session!; const p = s.player;
     const lib = libArg ?? pickLibrary(s.state, s.local);
     if (!lib) { this.toast(librariesOf(s.state, s.local).length ? t('err.queueFull') : t('msg.needLibrary'), 'warn'); this.audio.play('error'); return; }
     ```
     Depois troque `tc` por `lib` no resto da função (`canAdvanceAge(s.state, p, lib)`, `buildingId: lib.id`).
  3. Em `refreshCommands`, dentro de `if (b) {`, logo depois da linha `if (!b.complete) { … return; }`, acrescente:
     ```ts
     if (def.library) {
       const adv = canAdvanceAge(s.state, p, b);
       add(ic.age(Math.min(p.age + 1, AGES.length - 1)), p.age < AGES.length - 1 ? AGES[p.age + 1].short : t('cmd.ageMax'), this.ageBtn.dataset.tip ?? '', 'E', () => this.tryAdvanceAge(b), { disabled: !adv.ok });
       add(glyph('scroll'), t('cmd.studyTree'), t('cmd.studyTreeTip'), 'F3', () => this.showStudyTree());
     }
     ```
     **Apague** o bloco `if (b.type === 'town_center') { const adv = …; add(ic.age(…), …); }`. No botão do filósofo,
     troque o cálculo de `c` por
     `const ch = canHireScholar(s.state, p, b); const c = ch.ok ? '' : (ch.reason ?? t('cmd.noResources'));`.
  4. Em `buildingCard`, depois da linha do `def.scholars`, acrescente
     `if (def.queueMax) stats.push(`${t('sel.queue')} <b>${b.queue.length}/${def.queueMax}</b>`);`.
  5. Em `issueChecked`, troque o ramo do `hireScholar` por
     `else if (cmd.type === 'hireScholar') { const b = s.state.buildings.get(cmd.buildingId); if (b) check = canHireScholar(s.state, p, b); }`.
  6. Árvore, com os campos `private treeKey = '';` e os métodos:
     ```ts
     showStudyTree() { if (!this.session) return; this.renderStudyTree(true); }
     private renderStudyTree(first: boolean) {
       const s = this.session!;
       const m = studyTreeModel(s.state, s.local, !!s.spectator);
       const fc = (c: Record<string, number>) => fmtCost(c, s.player);
       const old = this.modal.querySelector('.tree-body') as HTMLElement | null;
       const scroll = !first && old ? [old.scrollLeft, old.scrollTop] : null;
       const focus = !first ? ((document.activeElement as HTMLElement | null)?.dataset?.study ?? null) : null;
       const html = studyTreeHtml(m, fc);
       if (first) this.showModal(html); else this.modal.innerHTML = html;
       this.modal.classList.add('tree');   // depois do showModal, que zera className
       this.treeKey = studyTreeKey(s.state, s.local);
       const body = this.modal.querySelector('.tree-body') as HTMLElement;
       if (scroll) { body.scrollLeft = scroll[0]; body.scrollTop = scroll[1]; }
       const nodes = new Map<string, StudyNode>(m.rows.flatMap((r) => r.cells.flat()).map((x) => [x.id, x]));
       const detail = this.modal.querySelector('#tree-detail') as HTMLElement;
       this.modal.querySelectorAll<HTMLElement>('[data-study]').forEach((el) => {
         const x = nodes.get(el.dataset.study!); if (!x) return;
         const show = () => { detail.innerHTML = studyNodeDetail(x, fc); };
         el.addEventListener('mouseenter', show); el.addEventListener('focus', show);
         el.addEventListener('click', () => this.studyClick(x, m.readOnly));
         if (focus && el.dataset.study === focus) el.focus();
       });
       this.modal.querySelector('#m-close')!.addEventListener('click', () => this.hideModal());
     }
     private studyClick(x: StudyNode, readOnly: boolean) {
       if (readOnly || x.status !== 'available') { this.audio.play('error'); return; }
       const s = this.session!;
       const lib = pickLibrary(s.state, s.local);
       if (!lib) { this.toast(t('tree.noLibrary'), 'warn'); return; }
       if (x.kind === 'age') { this.tryAdvanceAge(lib); return; }
       if (this.issueChecked({ type: 'research', player: s.local, buildingId: lib.id, tech: x.id })) { this.audio.play('command'); this.treeKey = ''; }
     }
     private refreshStudyTree() {
       const s = this.session;
       if (!s || !this.modalOpen || !this.modal.classList.contains('tree')) return;
       if (studyTreeKey(s.state, s.local) !== this.treeKey) this.renderStudyTree(false);
     }
     ```
     Em `update()`, dentro do `if (this.acc > 0.12) { … }`, acrescente `this.refreshStudyTree();` no fim.
  7. Menu da partida (`showMenu`):
     - acrescente `<button class="btn" id="m-tree">${t('menu.tree')}</button>` depois do botão `#m-enc`;
     - no bind, `q('#m-tree').addEventListener('click', () => this.showStudyTree());`.
  8. `showHotkeys`:
     - troque `` `${k('F1')} ${k('F2')} ${k('F5')} ${k('F9')} ${k('F11')}` `` por
       `` `${k('F1')} ${k('F2')} ${k('F3')} ${k('F5')} ${k('F9')} ${k('F11')}` ``;
     - em `buildingSel`, acrescente `[k('E'), t('hk.advance')]`.
  9. Enciclopédia, aba `ages`: troque `lines: ACADEMY_LINES.join(', ')` por
     ``lines: ACADEMY_LINES.map((l) => t(`line.${l}`)).join(', ')``.
- [ ] **H5. `src/ui/input.ts`:**
  - no ramo da partida (não do editor), depois de `if (k === 'f2') {…}`, acrescente
    `if (k === 'f3') { e.preventDefault(); this.hud.showStudyTree(); return; }`;
  - no ramo `else if (b) {`, depois da linha do filósofo (`if (def.scholars && keyU === 'Q') …`), acrescente
    `if (def.library && keyU === 'E') { this.hud.tryAdvanceAge(b); return; }`.
- [ ] **H6. `src/ui/era-select.ts` (novo):**
  ```ts
  // Era inicial e Era final da partida (E1): o mesmo seletor na partida rápida, no lobby e no Testar do editor.
  import { AGES, MAX_AGE, clampEra } from '../core/data';
  import type { GameMode } from '../core/constants';
  import type { GameConfig } from '../core/types';
  import { t } from '../i18n';

  /** Era de início efetiva: 'auto' segue o modo (Deathmatch começa na II, como createGame). */
  export function effectiveStartEra(start: string, mode?: GameMode): number { return start === 'auto' ? (mode === 'deathmatch' ? 1 : 0) : clampEra(Number(start)); }
  export function eraChoiceValid(start: string, end: number, mode?: GameMode): boolean { return clampEra(end) >= effectiveStartEra(start, mode); }
  /** Campos da GameConfig: 'auto' deixa startingAge de fora (vale o padrão do modo); a última Era deixa maxAge de fora. */
  export function eraConfig(start: string, end: number): Pick<GameConfig, 'startingAge' | 'maxAge'> {
    const out: Pick<GameConfig, 'startingAge' | 'maxAge'> = {};
    if (start !== 'auto') out.startingAge = clampEra(Number(start));
    const e = clampEra(end); if (e < MAX_AGE) out.maxAge = e;
    return out;
  }
  /** <label> + <select> da Era inicial ('auto' | '0'…'7') e da final (índice). */
  export function eraSelectsHtml(ids: { start: string; end: string }, cur: { start: string; end: number }, disabled = false): string {
    const dis = disabled ? ' disabled' : '';
    const starts = [`<option value="auto"${cur.start === 'auto' ? ' selected' : ''}>${t('main.startAgeAuto')}</option>`, ...AGES.map((a, n) => `<option value="${n}"${cur.start === String(n) ? ' selected' : ''}>${a.name}</option>`)].join('');
    const ends = AGES.map((a, n) => `<option value="${n}"${cur.end === n ? ' selected' : ''}>${a.name}</option>`).join('');
    return `<label>${t('main.startAge')}</label><select id="${ids.start}"${dis}>${starts}</select><label>${t('main.endAge')}</label><select id="${ids.end}"${dis}>${ends}</select>`;
  }
  ```
- [ ] **H7. Partida rápida (`src/ui/menu.ts`, `render()` e `#m-start`):**
  - importe `eraSelectsHtml`, `eraChoiceValid` e `eraConfig` de `'./era-select'`, e acrescente `MAX_AGE` ao import de
    `'../core/data'` (que hoje traz `MAJOR_GODS` e `MAJOR_GOD_LIST`);
  - no tipo de `saved`, acrescente `startAge: string; endAge: number`;
  - depois do `<select id="m-mode">…</select>`, acrescente
    `${eraSelectsHtml({ start: 'm-startage', end: 'm-endage' }, { start: saved.startAge ?? 'auto', end: saved.endAge ?? MAX_AGE })}`;
  - no clique de `#m-start`, depois de `const mode = …`:
    ```ts
    const startAge = q('#m-startage').value, endAge = Number(q('#m-endage').value);
    if (!eraChoiceValid(startAge, endAge, mode)) { alert(t('main.endBeforeStart')); return; }
    const prev = (() => { try { return JSON.parse(localStorage.getItem('aoe_setup') ?? '{}') as Record<string, unknown>; } catch { return {}; } })();
    ```
  - troque o `storeSet('aoe_setup', JSON.stringify({ name, … }))` por
    `storeSet('aoe_setup', JSON.stringify({ ...prev, name, god: this.god, map, ais, diff, teams, mode, mapType, startAge, endAge }))`.
    O merge com `prev` também preserva o `fixedMapId`, que hoje se perdia;
  - no `this.cb.onStart({…})`, acrescente `...eraConfig(startAge, endAge)`.
- [ ] **H8. Lobby e relay:**
  1. `src/net/client.ts`: em `LobbyState.settings`, acrescente `startAge?: string; endAge?: string;`.
  2. `server/relay.mjs`, `cleanSettings`: troque `['mapSize', 'difficulty', 'mode', 'mapType', 'teams']` por
     `['mapSize', 'difficulty', 'mode', 'mapType', 'teams', 'startAge', 'endAge']`. A regex `WORD` aceita `auto` e
     `0`–`7`.
  3. `src/ui/menu.ts`, lobby:
     - depois do `<select id="mp-maptype">…</select>`, acrescente
       `${eraSelectsHtml({ start: 'mp-startage', end: 'mp-endage' }, { start: st.startAge ?? 'auto', end: st.endAge !== undefined ? Number(st.endAge) : MAX_AGE }, !host || !!st.horde || !!st.fixedMap?.scenario)}`;
     - em `settingsChanged`, acrescente `startAge: q('#mp-startage')!.value, endAge: q('#mp-endage')!.value`;
     - ligue `change` dos dois selects a `settingsChanged`;
     - no ramo normal do `#mp-start`, antes do `net.start` final:
       ```ts
       const sa = st.startAge ?? 'auto', ea = Number(st.endAge ?? MAX_AGE);
       if (!eraChoiceValid(sa, ea, (st.mode ?? 'conquest') as GameMode)) { this.netStatus = t('main.endBeforeStart'); this.render(); return; }
       ```
       e acrescente `...eraConfig(sa, ea)` ao objeto do `net.start`. **Não** aplique nos ramos Horda e cenário
       embutido.
- [ ] **H9. Editor (Testar):**
  1. `src/editor/panel.ts`:
     - importe `eraSelectsHtml` e `eraChoiceValid` de `'../ui/era-select'`, e `MAX_AGE` de `'../core/data'`;
     - `TestOpts` ganha `startAge?: string; endAge?: number;`;
     - no modal, depois do `<label>…et-mode…</label>`, acrescente
       `<div id="et-eras">${eraSelectsHtml({ start: 'et-startage', end: 'et-endage' }, { start: saved.startAge ?? 'auto', end: saved.endAge ?? MAX_AGE })}</div>`;
     - em `syncSlots`, acrescente `'#et-startage', '#et-endage'` à lista `['#et-as', '#et-god', '#et-mode']`;
     - no `#et-go`, logo depois da linha `const opts: TestOpts = { … };`, acrescente
       `opts.startAge = q('#et-startage').value; opts.endAge = Number(q('#et-endage').value);` e
       `if (!opts.scenario && !eraChoiceValid(opts.startAge, opts.endAge, opts.mode)) { alert(t('main.endBeforeStart')); return; }`
       (antes do `storeSet` e do `hideModal`). Com o cenário embutido marcado, as Eras não valem (o ramo do cenário em
       `testFromEditor` não as lê).
  2. `src/main.ts`, `testFromEditor`:
     - importe `eraConfig` de `'./ui/era-select'` e `MAX_AGE` de `'./core/data'` (junte ao import de `'./core/data'`
       que já existe);
     - no `startGame({ seed: …, startOrder: order })` do ramo sem cenário, acrescente
       `...eraConfig(opts.startAge ?? 'auto', opts.endAge ?? MAX_AGE)`.
- [ ] **H10. Testes de interface:** `tests/studytree.test.ts`; listas de `tests/hud-icons.test.ts`;
  `tests/relay-anticheat.test.ts`. Confira:
  `npx vitest run tests/studytree.test.ts tests/hud-icons.test.ts tests/relay-anticheat.test.ts tests/hud-text.test.ts tests/i18n.test.ts tests/editor.test.ts`.
- [ ] **H11. Playtests:**
  1. `scripts/playtest.mjs`: entre "construir templo" e o clique em `'#top .btn.gold'`, repita o laço do templo com a
     tecla `'z'` (Biblioteca) nos pontos `[[-7, 0], [0, 7], [7, -6], [-8, 6]]`. Depois force a conclusão, como já é
     feito com o templo:
     `b.type === 'academy'` → `b.complete = true; b.progress = 60; b.hp = b.maxHp`.
  2. `scripts/playtest-library.mjs` (novo), copiando o cabeçalho de `playtest.mjs` (Chromium, `LANG` PT, erros de
     página). Passos:
     - `page.selectOption('#m-startage', '2')` e `page.selectOption('#m-endage', '4')`, semente 7, `#m-start`;
     - confira por `window.aoe.session`: `player.age === 2`, `player.minorGods.length === 2` e 2 estudos de linha;
     - ponha uma Biblioteca pronta pelo laço da tecla `z` (como no item 1), dê 9000 de cada recurso, selecione-a com
       clique e confira:
       - `#commands .cmd .lbl` [0] contém `Bizantina`;
       - [1] é `Árvore de estudos`;
       - `#selection .stats` contém `Fila`;
     - encha a fila: com o jogo rodando (`pause(false)`), clique no 1º botão `#commands .cmd` sem `disabled` cujo
       `.lbl` comece com `Civismo`, `Comércio`, `Militar`, `Ciência`, `Alvenaria` ou `Logística` (só estudos: **nunca**
       clique "às cegas" pelo índice, porque os últimos botões são ponto de encontro e Demolir), espere 300 ms e repita
       até `#selection .stats` mostrar `5/5` (no máximo 8 tentativas; se não chegar, falhe). Com a fila cheia os botões
       ficam `disabled` e o clique não gera toast; por isso a recusa se confere pelo atalho: tecla `e` → aparece um
       `.toast.warn` com `Fila cheia`;
     - tecla `F3`:
       - `#modal.tree` visível;
       - 8 `.tree-era`;
       - ≥ 1 `.tree-node.st-active`;
       - nenhum `.hic-ph`;
       - nenhum emoji em `#modal` (`/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]/u`);
     - captura `docs/art/eras-e1-arvore-pt.png`;
     - `Escape`, menu da partida (`#top-menu`), `page.selectOption('#modal #o-lang', 'en')`, `Escape`, `F3`: o texto
       de `#modal h2` contém `Study tree`; captura `docs/art/eras-e1-arvore-en.png`; volte a `pt` do mesmo jeito no fim
       (o idioma fica gravado no perfil);
     - selecione a Biblioteca de novo e capture o painel: `docs/art/eras-e1-biblioteca.png`;
     - termine imprimindo `errors: none`.

### Bloco I — Ferramentas de medição

- [ ] **I1. `scripts/maps/fairness.ts`:**
  - importe `AGES` junto de `BUILDINGS` (`from '../../src/core/data'`);
  - troque `const ages: number[][] = [[], [], [], []];` por `const ages: number[][] = AGES.slice(1).map(() => []);`;
  - no `console.log` do "início", troque
    `· Clássica ${avg(ages[0])} · Heroica ${avg(ages[1])} · Mítica ${avg(ages[2])} · Titãs ${avg(ages[3])}` por
    ``· ${AGES.slice(1).map((a, k) => `${a.short} ${avg(ages[k])}`).join(' · ')}``.

### Bloco J — Verificação final e documentação

- [ ] **J1.** Toda a seção "Verificação", na ordem.
- [ ] **J2.** Toda a seção "Ao terminar".

---

## Testes a escrever ou atualizar

| Arquivo | O que verifica |
|---|---|
| `tests/eras.test.ts` (novo) — dados | `AGES.length === 8`, `ids` 0..7 em ordem; `ERA_TITANS === MAX_AGE`; `LEGACY_AGE_TO_ERA` = `[0,1,2,3,7]`; `BUILDINGS.titan_gate.age === ERA_TITANS`; `prometheus/oceanus/cronus` com `age === ERA_TITANS`; `UNITS.perseus.age === 4`; `techCount` não decresce e `techCount(k) ≤ 4·k`; para cada deus maior e k = 1..7: `AGES[k].minorGod === (k <= 6 && (MAJOR_GODS[g].minorGods[k − 1]?.length ?? 0) > 0)`; `LINE_LEVELS === AGES.length`; para cada linha e nível 1..8: `TECHS[`${l}${n}`]` existe, `age === n−1`, `building === 'academy'` e `name` termina com `ROMAN[n−1]`; Biblioteca: `age 0`, `library`, `queueMax 5`, `limit 3`, `perCity`; com `setLocale('en')` o nome é `Library` (volte a `'pt'` no `finally`) |
| `tests/eras.test.ts` — Biblioteca | com `quickGame()` (de `tests/helpers.ts`) e `p.resources = { food: 5000, wood: 5000, gold: 5000, knowledge: 5000, favor: 500 }` (o padrão não paga a Era II): `canAdvanceAge(s, p, tc).reason === t('err.advanceAtLibrary')`; `canAdvanceAge(s, p).reason === t('msg.needLibrary')`; com Templo e Biblioteca prontos (`placeBuilding(s, 0, 'temple', tc.tx + 5, tc.ty, true)` e `'academy'` em `tc.tx − 5`): ok e `minorOptions` = `['athena', 'hermes']`; `advanceAge` na Biblioteca + `run(s, 62 * TICK_RATE)` → `age 1`, `minorGods ['athena']`; **um por vez**: 4 estudos de nível 1 + 1 filósofo na fila → depois de 1 tick, `queue[0].elapsed > 0` e `queue[1].elapsed === 0`; o 6º item (`hireScholar`) recusado com `t('err.queueFull')`; o avanço com a fila cheia é recusado com o mesmo motivo; **uma por cidade**: com 1 Centro Cívico, `buildingLimitOk(s, p, 'academy')` recusa a 2ª (motivo contém o nome da Biblioteca); com um 2º Centro Cívico (`placeBuilding(s, 0, 'town_center', tc.tx, tc.ty + 6, true)`) aceita |
| `tests/eras.test.ts` — Era inicial/final | `createGame({ seed: 5, mapSize: 'small', startingAge: 3, players: [humano zeus, IA hades] })`: `players[0].age === 3`, `minorGods === ['athena', 'apollo', 'hera']`, `powers` contém `bolt`, `restoration`, `oracle` e `lightning_storm`, `academyTechCount(players[0]) === AGES[3].requires.techCount`; a IA tem 3 deuses menores, todos nos pares de Hades; `startingAge: 99` → `age === MAX_AGE`; Deathmatch → `age 1` e 1 deus menor; com `scenario: 'horde'` e `startingAge: 2` → `minorGods` vazio (não concede em cenário); com `maxAge: 1` sem cenário, num jogador na Era 1 com Biblioteca → `canAdvanceAge(...).reason === t('err.endAge', { age: AGES[1].name })` |
| `tests/eras.test.ts` — cenário | `validateScenario` aceita `config.visualEraMax: 2` com `startingAge: 3` e recusa `visualEraMax: 8` e `1.5` (caminho `config.visualEraMax`); `gameConfigFor(file).visualEraMax === 2`; a condição `{ value: { stat: 'studies', player: 0 }, gte: 2 }` valida |
| `tests/eras.test.ts` — save | `saveVersionOf(serialize(quickGame())) === SAVE_VERSION`; `saveVersionOf('lixo') === null`; `deserialize` de um save com `version: 1` lança uma mensagem que contém `v1` |
| `tests/eras.test.ts` — IA | `VILLAGER_TARGET`, `FARM_LIMIT`, `ARMY_ATTACK` e `MIN_ARMY` com `length === AGES.length`; todo id de `RESEARCH_PRIORITY` existe em `TECHS`; toda tech com `line` está em `RESEARCH_PRIORITY`; em um `it` próprio (timeout 60 000): 2 IAs `hard` (`seed: 21`, `small`, `startingResources` 20 000 de comida/madeira/ouro, 5000 de conhecimento, 300 de favor) por 9 min de jogo → nenhum item `age` na fila de edifício sem `library` (amostra a cada segundo) e a maior Era ≥ 2 |
| `tests/eras.test.ts` — campanha | para cada `CAMPAIGN` entry: `campaignMission(id)!.config` com `(players[0].maxAge ?? maxAge) === CAMPAIGN_MAX_ERA` e `visualEraMax === CAMPAIGN_VISUAL_ERA_MAX`; `HORDE.config.maxAge === undefined`; m3, m8, m12 (um `it` por missão, timeout 30 000): `const s = createGame(missionConfig(campaignMission(id)!, 'normal'))`, `const tc = townCenter(s, 0)!` e `placeNear(s, 0, 'fortress', tc.x + 8, tc.y, true)` (os dois de `src/core/scenario/helpers.ts`); acrescente a `players[0].techs`, nesta ordem e pulando os que ele já tem, `civic1, commerce1, military1, science1, civic2, commerce2, military2, science2` até `academyTechCount(p) >= 6`, e chame `recomputeMods(s, p)`; ponha `p.resources.favor = 400`, rode 3 s (`for (let i = 0; i < 3 * TICK_RATE; i++) tick(s)`) → **nenhum** `prometheus` do jogador 0 (falta Favor); ponha `p.resources.favor = 600`, rode mais 3 s → existe `prometheus` do jogador 0 e `p.resources.favor < 200` (o gatilho cobrou 500); nenhuma missão tem "Idade dos Titãs"/"Age of Titans" no texto (`JSON.stringify(e.file)` nas entradas `source: 'json'`; nas TS o `grep` do F2 cobre) |
| `tests/studytree.test.ts` (novo) | sem Biblioteca: `civic1` `locked` com `t('tree.noLibrary')`; com Biblioteca pronta e recursos: `civic1` `available`, `civic2` `locked` com `t('err.requiresAge', { age: AGES[1].name })`, `age:1` `locked` (motivo contém o nome do Templo) e, depois do Templo, `available`; depois de `research civic1` e `commerce1` (por `applyCommand`): `active` e `queued`; `studyTreeKey` muda depois de um comando; o HTML tem `AGES.length` `class="tree-era`, todo `<button class="tree-node` tem `data-nav` e `data-study` (as três contagens iguais; o `#m-close` é o único outro `<button`), nenhum emoji (regex do `hud-icons.test.ts`); com `setLocale('en')` o HTML contém `Study tree` e `Civics I` (volte a `'pt'` no `finally`); `readOnly: true` marca todos os nós com `aria-disabled` |
| `tests/data.test.ts` | `AGES.length` 5 → 8; no laço dos atalhos de treino por edifício (perto da regra do Q do filósofo), acrescente `if (b.library) expect(hk, 'atalho E de ' + t + ' colide com avançar de Era em ' + b.id).not.toBe('E');` (hoje a Biblioteca não treina nada; a regra protege a E3) |
| `tests/sim.test.ts` | o `it('avanço de idade exige templo …')`: troque `tc` pela Biblioteca, `placeBuilding(s, 0, 'academy', tc.tx - 5, tc.ty, true)`. Antes da Biblioteca, `canAdvanceAge(s, p, tc).ok === false` continua valendo |
| `tests/economy-regressions.test.ts` | `it('demolir devolve …')`: ponha uma Biblioteca pronta (`const lib = placeBuilding(s, 0, 'academy', tc.tx - 5, tc.ty, true)`) e mande o `advanceAge` com `buildingId: lib.id`. Troque `applyCommand(s, { type: 'delete', player: 0, ids: [tc.id] })` por `… ids: [lib.id, tc.id] …`: a Biblioteca devolve o avanço e o Centro Cívico devolve os 2 cidadãos. Os `expect` de 1500/1700 ficam iguais. A 2ª metade (cancelar `civic1` na Academia com `p2.age = 1`) não muda |
| `tests/movement-ai.test.ts` | linha ~211: `p.age = 4` → `p.age = ERA_TITANS`. O `it('avançar para a Idade dos Titãs …')` vira "avançar para uma Era sem deus menor (V) ignora o deus enviado": `p.age = 3`, `p.techs` = `civic1, commerce1, military1, science1, civic2, commerce2, military2` (7), Fortaleza (como hoje, em `tc.tx + 6`) e **Biblioteca** prontas (`const lib = placeBuilding(s, 0, 'academy', tc.tx - 6, tc.ty, true)`), `advanceAge` com `buildingId: lib.id`, e as conferências da fila em `lib.queue[0]` e `minorGod: 'artemis'` → `queue[0].id === 'age:'`, `age === 4`, `minorGods` iguais |
| `tests/scenario-gaps.test.ts` | No `it('remove de edifício reembolsa a fila …')` (linhas ~431–450): <br>• depois do `placeBuilding` do requisito, ponha `const lib = placeBuilding(s, 0, 'academy', tc.tx + 7, tc.ty, true); s.scenario!.vars['#lib'] = lib.id;` (o mesmo canto que o teste de `maxAge` da linha ~498 já usa nesse mapa; o quartel está em `tc.ty + 7` e o Templo em `tc.tx - 7`); <br>• troque `buildingId: tc.id` por `buildingId: lib.id` e `tc.queue.some(…)` por `lib.queue.some(…)`; <br>• troque `act(s, [{ do: 'remove', entity: { tc: 0 } }])` por `act(s, [{ do: 'remove', entity: { var: '#lib' } }])`; <br>• os `expect` de reembolso ficam. <br>Linha ~578: `maxAge: 7` → `maxAge: 8` (continua inválido). Linha ~559: `old.players[gated].age = 4` → `ERA_TITANS`. O `it('maxAge e forbid …')` continua igual: a trava vem antes da checagem da Biblioteca. O `it('a IA respeita maxAge e forbid …')` (6 min, começa na Era II) também fica igual, mas depende do D3: a IA de controle precisa erguer a Biblioteca logo (`age >= 1 ||`) para chegar à Era III em 6 min; se ele falhar em `control.players[1].age >= 2`, confira o D3 antes de mexer no teste |
| `tests/position-fairness.test.ts` | `30` → `33` (Egeu) e `10` → `11` (Estreito) |
| `tests/art-library.test.ts` | o `ageTier` de 8 Eras (passo G1) |
| `tests/hud-icons.test.ts` | linha ~53: acrescente `'src/ui/studytree.ts'` à lista; linha ~63: acrescente `'src/ui/studytree.ts'` (glifos usados existem); linha ~82: acrescente `'src/ui/era-select.ts'` |
| `tests/m4_caucaso.test.ts` | `s.players[p].age = 4` → `ERA_TITANS` (import de `'../src/core/data'`); apague as duas linhas de `aviso_portal` e o `seconds(s, 2)` entre elas; título do `it` sem "o aviso da Pítia …" |
| `tests/m5_itaca.test.ts` | `s.players[1].age = 4; s.players[0].age = 4;` → `ERA_TITANS` |
| `tests/m6_estatua.test.ts` | `s.players[p].age = 4` → `ERA_TITANS`; apague o `expect(...portal_argos_fala…)` e o `expect(lines(s).some(… 'Prometeu ainda sangra'))`; título do `it` sem "as falas vêm …" |
| `tests/relay-anticheat.test.ts` | novo `it`: o anfitrião manda `settings` com `startAge: '2', endAge: '5'` → o `lobby` dos outros traz as duas chaves; `startAge: 'x y'` é ignorado. O `toEqual` da linha ~252 não muda (não manda as chaves novas) |
| `tests/modes.test.ts` | no Deathmatch, acrescente `expect(s.players[0].minorGods.length).toBe(1)` |

**Divida os testes longos** (simulação de vários minutos) em `it`s próprios de no máximo ~10 s, com timeout explícito
(ver Armadilhas: RPC do vitest).

---

## Verificação

Rode na ordem. Cada linha diz o que esperar.

1. `npm run -s typecheck`: sem saída, código 0.
2. Os testes alterados e os novos, juntos:
   ```sh
   npx vitest run tests/eras.test.ts tests/studytree.test.ts tests/data.test.ts tests/i18n.test.ts tests/sim.test.ts tests/economy-regressions.test.ts tests/movement-ai.test.ts tests/scenario-gaps.test.ts tests/position-fairness.test.ts tests/art-library.test.ts tests/hud-icons.test.ts tests/m4_caucaso.test.ts tests/m5_itaca.test.ts tests/m6_estatua.test.ts tests/m8_oceano.test.ts tests/m12_titanomaquia.test.ts tests/relay-anticheat.test.ts tests/steam.test.ts tests/modes.test.ts tests/command-fuzz.test.ts tests/determinism.test.ts
   ```
   Esperado: tudo verde.
3. `npm test`: todos os arquivos verdes. Se sair `Timeout calling "onTaskUpdate"` com 100 % dos testes passando, o
   culpado é um `it` longo: divida-o. Não ignore o código de saída 1.
4. `npm run art:check`: ok, sem erro `hud`, VRAM e PNG dentro do teto.
5. `npm run smoke 20 42` duas vezes: o mesmo "hash final" (determinismo). Nos eventos aparecem avanços "para a Era …".
6. `npm run -s balance 35 1,2,3` (a lista `idades aos minutos [0, II, III, …]` de cada IA):
   - nenhuma `PARADA` aos 5 min;
   - em cada IA viva, as idades aos minutos crescem;
   - em cada IA viva: Era II ≤ 8 min, III ≤ 19 e IV ≤ 25 (medido em 06/10/2026, antes da E1: 5–7, 13–17 e 18–23;
     a folga é a Biblioteca, que agora vem antes do avanço);
   - pelo menos uma IA por semente chega à V antes dos 35 min (antes da E1, a antiga Idade dos Titãs, com custo e
     requisitos parecidos com os da V, saía aos 23–27 min).

   Depois, `npm run balance 60 1,2,3`: anote em `docs/eras/PROGRESSO.md` os minutos da V à VIII (alvo da E10: V ~20,
   VI ~26, VII ~33, VIII ~40). O que fazer se falhar:
   - II–IV piores que os limites: ajuste **só a IA** (ordem e condições do plano, `VILLAGER_TARGET`). **Não** mude os
     custos de II–IV (campanha);
   - nenhuma IA na V aos 35 min numa semente: baixe primeiro o `techCount` da V de 7 para 6 (o da antiga Idade dos
     Titãs; ajuste o `desc` PT/EN). Se ainda falhar, baixe em até 20 % os custos de V–VIII, nessa ordem. Registre a
     mudança no `PROGRESSO.md`.
7. `npx tsx scripts/missions.ts`: as 12 missões × 3 dificuldades e as variantes OK (~12 min ou mais). Se falhar, siga
   o F6.
8. `npx tsx scripts/horde.ts`: OK, como antes.
9. `npm run map:check`: os mapas embutidos ok (2 min de IA × IA sem travar).
10. Justiça de posição, cada um com o critério do CLAUDE.md (nenhum lado com > 65 % das decididas + à frente, por
    posição e por índice):
    ```sh
    npx tsx scripts/maps/fairness.ts egeu 45 1-16 zeus --both --jobs 3
    npx tsx scripts/maps/fairness.ts estreito 45 1-16 zeus --both --jobs 3
    ```
    Um "fora" isolado pede confirmação em 32 sementes (`101-132`). Registre os números em `docs/eras/PROGRESSO.md`.
11. `npx tsx scripts/steam-achievements.ts --check`: ok.
12. `npm run build` e `npm run preview` (em segundo plano, porta 4173). Depois:
    - `node scripts/playtest.mjs http://localhost:4173/ /tmp/pt`: "cartas de deus menor: 2" e `errors: none`;
    - `node scripts/playtest-library.mjs http://localhost:4173/`: todas as conferências e `errors: none`;
    - `node scripts/playtest-i18n.mjs http://localhost:4173/`: o botão de avanço mostra "Classical Era"/"Era
      Clássica", sem erros;
    - `node scripts/playtest-noemoji.mjs http://localhost:4173/`: sem emoji e sem ícone vazio;
    - `node scripts/playtest-editor.mjs http://localhost:4173/` e `node scripts/playtest-modes.mjs http://localhost:4173/`:
      sem erros;
    - com `npm run relay` de pé: `node scripts/playtest-mp.mjs http://localhost:4173/` e
      `node scripts/playtest-rooms.mjs http://localhost:4173/`, sem erros.
13. Olhe com a ferramenta Read:
    - `docs/art/eras-e1-arvore-pt.png`, `docs/art/eras-e1-arvore-en.png` e `docs/art/eras-e1-biblioteca.png`;
    - o "antes" (`/tmp/e1-antes-2-tc.png`) contra o "depois".

    Confira:
    - a grade cabe na tela;
    - as colunas são as 8 Eras;
    - as cores de status são distintas;
    - o detalhe mostra o motivo do bloqueio.

---

## Critérios de pronto

- [ ] Uma partida rápida vai da Era I à VIII e, na VIII, o Portal dos Titãs liberta o Titã (confira no balance de 60 min
      ou forçando recursos no navegador).
- [ ] O avanço de Era só acontece na Biblioteca, um item por vez, com fila de no máximo 5; o Centro Cívico não tem mais
      o botão de avanço.
- [ ] As 4 linhas têm 8 níveis (I–VIII) em PT e EN.
- [ ] Era inicial e Era final funcionam na partida rápida, no lobby (com os outros vendo a mudança) e no Testar do editor;
      começar na IV dá 3 deuses menores com os poderes e 4 estudos.
- [ ] A campanha inteira roda com `maxAge 3`/`visualEraMax 2`, o Prometeu do jogador vem por roteiro (m3, m8, m12:
      Fortaleza, 6 estudos e 500 de Favor) e `npx tsx scripts/missions.ts` passa, com a variante "titãs" da m8 exigindo
      o gatilho `prometeu`.
- [ ] A IA constrói a Biblioteca na Era I, avança nela e, no balance de 35 min, pelo menos uma IA de cada semente chega
      à V.
- [ ] Painel da Biblioteca (avanço, árvore, filósofo, estudos, fila n/5) e árvore em tela cheia (F3, botão, menu)
      funcionam com mouse, teclado e controle (navegação por `data-nav`), sem emoji, em PT e EN.
- [ ] `SIM_VERSION` 4; save antigo aparece com aviso e pode ser apagado; save novo salva e carrega (F5/F9).
- [ ] `npm run -s typecheck`, `npm test`, `npm run art:check`, smoke (hash igual 2×), fairness dentro do critério e
      playtests sem erros.
- [ ] `docs/eras/PROGRESSO.md`, `docs/ROADMAP.md`, `CLAUDE.md`, `docs/STORY.md` e `docs/EDITOR.md` atualizados.

---

## Armadilhas

- **Biblioteca com `age: 1`**: o avanço I→II sai da Biblioteca. Se ela não for construível na Era I, ninguém sai da
  Arcaica: nem o jogador, nem a IA, nem o harness. E nenhum erro aparece.
- **`minorGod: true` nas Eras 4–6 antes da E6**: `canAdvanceAge` devolve `minorOptions: []` e `advanceAge` recusa com
  "Escolha um deus menor". Todos ficam presos na IV.
- **Renumerar as Idades por conta**: os índices 0–3 não mudam. Só Titãs e Portal vão para 7. Perseu fica 4 de propósito
  (Era V).
- **Esquecer uma das duas `line()`** (`techs.ts` e `en-data.ts`): o nome vira "Civismo undefined" ou o `i18n.test`
  acusa `civic6..8` sem tradução.
- **Tabelas da IA com 5 posições**: `VILLAGER_TARGET[5]` é `undefined`, o `Math.min` dá `NaN` e a IA para de treinar,
  de fazer fazendas e de atacar, sem exceção. O teste de tamanho em `tests/eras.test.ts` existe para isso.
- **IA que ainda manda o id do Centro Cívico** (`ai.ts`, `testing.ts`, `loadtest.ts`): o comando é recusado em
  silêncio e as janelas da campanha estouram. Procure com `grep -rn "advanceAge" src scripts tests`.
- **Ordem das checagens em `canAdvanceAge`**: a trava de Era (`maxAgeOf`) precisa vir antes da checagem da Biblioteca.
  Senão o teste de G6 recebe "Avance de Era numa Biblioteca" no lugar de "Proibido nesta missão".
- **`checkMaxAge` para `visualEraMax`**: ele recusa valor abaixo de `startingAge`, e a campanha precisa de 2 com
  `startingAge` 3. Use a validação simples do C2.
- **Era inicial em cenário**: `grantStartingEras` só fora de cenário (`isScenarioConfig`). Na campanha, a ação `set` e
  os `setup` já dão os deuses; conceder de novo daria deuses e poderes a mais e mudaria todas as missões.
- **`startingAge: 0` no lugar de "auto"**: o Deathmatch passaria a começar na Arcaica. O `eraConfig('auto', …)` não
  grava `startingAge`.
- **Determinismo**: nada de `Math.random`, `Math.sin`/`cos`/`atan2`/`pow`/`exp`/`log`/`hypot`, `Date.now` ou
  `performance.now` em `src/core`. `grantStartingEras` usa só a config e a personalidade. O `tests/determinism.test.ts`
  varre o código.
- **Justiça de posição**: a escolha da Biblioteca (IA, HUD) desempata pelo id **entre os edifícios do próprio jogador**,
  o que não cria viés de posição. Não escolha "a primeira do Map" de edifícios de outros jogadores. Não use orientação
  absoluta.
- **`SIM_VERSION`**: suba para 4 uma vez só (D7). O relay de produção também precisa do `server/relay.mjs` novo (as
  chaves `startAge`/`endAge` do lobby). Sem isso, os convidados não veem a Era escolhida pelo anfitrião.
- **Save**: subir só o `SIM_VERSION` não basta, porque o save não confere essa versão. Mantenha a chave `aoe_save_v1`:
  ela está em `CLOUD_FIXED_KEYS` e em `desktop/cloud.cjs`, e o `tests/steam.test.ts` compara os dois. Apague com
  `storeRemove`, nunca com `localStorage.removeItem`.
- **`aoe_setup`**: grave mesclando com o que já existe e sempre com `storeSet`.
- **Textos PT e EN**: toda chave nova entra nas duas tabelas com as mesmas `{variáveis}`; o typecheck e o
  `tests/i18n.test.ts` acusam. **Não** troque "Age" em "Age of Mythology"/"Age of Earth".
- **Emoji**: nenhum emoji em `src/ui/studytree.ts`, `src/ui/era-select.ts` nem nos textos novos. Use `glyph(...)` e
  `ic.*`. Emoji novo em `strings.ts` exige entrada em `EMOJI_GLYPHS`.
- **Ícone do HUD obrigatório**: Era nova sem `AGE_ICONS` + `npm run art:hud` derruba o `tests/hud-icons.test.ts` e o
  `art:check`. **Não** edite `public/art/hud-*` à mão.
- **Arte**: não mexa em `scripts/bake/page/*`, `art/manifest/*`, `materials.js` nem `camera.js`. Isso reassa tudo, e o
  cache local não tem todas as unidades: `art:bake` sem `--out` apagaria unidades do atlas. A E1 não cria unidade nem
  edifício novo; se criar, quebra `art-etapa6.test.ts` (35 unidades) e `art-library.test.ts` (21 edifícios).
- **Botão desabilitado na árvore**: `disabled` impede o foco do controle (gamepad). Use `aria-disabled` e ignore o
  clique.
- **`showModal` zera `className`**: a classe `tree` vai depois dele. O `refreshStudyTree` só redesenha quando a chave
  muda e mantém rolagem e foco; redesenhar a cada 0,12 s quebra a navegação.
- **Tooltips no modal**: o `data-tip` só funciona dentro de `#hud`. Na árvore, o detalhe vai no painel `#tree-detail`
  (mouse e foco).
- **Edição dos JSON de missão**: não reescreva com `JSON.stringify`. Edite a linha e confira as vírgulas com
  `npx vitest run tests/missions.test.ts`. O teste de paridade da m1 exige o MESMO texto PT no TS e no JSON.
- **Harness**: janela fora não se resolve afrouxando `expect`. Ajuste o roteiro em `testing.ts` e registre em
  `docs/STORY.md`.
- **vitest**: `it` com mais de ~20 s numa máquina carregada dá `Timeout calling "onTaskUpdate"` e código de saída 1
  com tudo passando (`docs/QA.md`). Divida em `it`s menores e passe timeout explícito (o padrão do projeto é 30 s,
  em `vite.config.ts`).
- **`tests/position-fairness.test.ts`**: 33/11 é o número novo correto. Se aparecer `bad` (lista não vazia), é bug
  de simetria de verdade: não ajuste o número para esconder. (Conta: hoje a Academia e o Mercado são da Era II e dão
  "nenhum local" dos dois lados, que não conta; com a Biblioteca na Era I, ela soma 3 no Egeu e 1 no Estreito.)
- **Prometeu de graça**: não tire os 500 de Favor do gatilho `chama_prometeu`/`prometeu_chamado` para "fazer o teste
  passar". Sem eles, Prometeu sai sozinho na m12 (Fortaleza obrigatória + 1 estudo) e na variante principal da m8.
- **`canAdvanceAge` sem edifício** (barra do topo, `savingForAge` da IA) agora responde "precisa de uma Biblioteca"
  antes dos requisitos. É de propósito: a IA só junta fundo para a Era II depois de ter a Biblioteca.
- **Coisas que parecem bug e não são** (não mexa na E1): a música (`src/audio/music.ts`) satura o andamento na Era IV
  (`Math.min(4, age)`); o pré-carregamento de unidades por Era (`warmUnitTypes`) já cobre todas as não míticas a
  partir da IV; os edifícios do inimigo seguem a Era dele (só o Centro Cívico muda de variante).
- **Playtest da Biblioteca**: nunca clique nos botões de comando pelo índice. Os últimos são Ponto de encontro e
  Demolir; um clique errado apaga a Biblioteca e o teste passa a medir outra coisa.

---

## Ao terminar

1. **`docs/eras/PROGRESSO.md`** (já existe; o formato está no `docs/eras/LEIA-ME.md`): confira que todas as caixas da
   E1 estão marcadas, preencha a linha "E1 + painel/árvore (E9)" do Resumo (estado `feito`, data, hash curto, notas
   "SIM_VERSION 4, save v2; Prometeu por roteiro nas m3/m8/m12") e escreva em **Notas**:
   ```markdown
   ### E1 — medições
   - balance 35 1,2,3: II …, III …, IV …, V … (min)
   - balance 60 1,2,3: V …, VI …, VII …, VIII …
   - fairness Egeu/Estreito 1–16 (--both): …
   - missions.ts: ok (… min)
   ### Pendências para o dono
   - Aprovar o Prometeu por roteiro (Fortaleza + 6 estudos + 500 de Favor, cobrados pelo gatilho) no lugar do Portal na
     campanha (D12).
   - Relay de produção: atualizar server/relay.mjs (chaves startAge/endAge do lobby).
   ### E1 — ganchos para as próximas etapas
   - E2: somar pedra/petróleo aos custos das Eras (tabela do guia E1); `need` da IA (manageEconomy).
   - E3: evoluções como TechDef da Biblioteca; `rowOf` em src/ui/studytree.ts ganha as linhas de unidade; Eras de hipaspista/arqueiro cretense/mirmidão/helépole.
   - E6: pares de deuses menores das Eras V–VII e `minorGod: true` em AGES[4..6] (o teste de tests/eras.test.ts acompanha).
   - E8: kit de Era no lugar de ageTier; ícones definitivos age/4..6.
   - E9: botão "Abrir a árvore de estudos" na aba Eras da enciclopédia (a árvore não vira aba: D6 do guia E9-E10).
   - E10: ritmo das Eras (alvo II ~4, III ~9, IV ~14, V ~20, VI ~26, VII ~33, VIII ~40).
   ```
   Se a seção "Pendências para o dono" já existir, só acrescente os itens nela.
2. **`docs/ROADMAP.md`**:
   - na tabela "Cronograma a partir de 06/10/2026", marque a linha das semanas 1–2 com "✅ E1 (data)";
   - em "O que já existe hoje" (o parágrafo descreve o jogo antes da expansão), corrija "47 pesquisas" para
     "67 pesquisas (20 das linhas + 47 avulsas)" e acrescente uma frase com o que a E1 entregou (8 Eras, Biblioteca,
     linhas × 8 — agora 79 pesquisas, 32 delas das linhas —, Era inicial/final, árvore de estudos). Confira o 79 com
     `npx tsx -e "import { TECHS } from './src/core/data'; console.log(Object.keys(TECHS).length)"`.
3. **`CLAUDE.md`**: na "Memória do projeto", acrescente um item curto:
   > **Eras (E1, data)**: `AGES` 0–7 (Arcaica…Moderna, `ERA`, `ERA_TITANS = 7`, `LEGACY_AGE_TO_ERA`); Biblioteca
   > (id `academy`, Era I, `library`, `queueMax` 5, uma por cidade) com o avanço de Era (`err.advanceAtLibrary`);
   > linhas × 8; Era inicial/final (`startingAge`/`maxAge`, seletores em `src/ui/era-select.ts`); `visualEraMax`
   > (campanha 2); árvore de estudos (`src/ui/studytree.ts`, F3); `SIM_VERSION` 4; save v2; guias em `docs/eras/`.

   Em "Comandos", acrescente `node scripts/playtest-library.mjs` à lista dos playtests.
4. **`docs/STORY.md`**: uma seção curta "Eras (E1)" com:
   - campanha em `maxAge 3` e `visualEraMax 2`;
   - Prometeu do jogador por roteiro nas m3, m8 e m12 (Fortaleza + 6 estudos + 500 de Favor cobrados; gatilhos
     `prometeu_chamado` e `chama_prometeu`);
   - falas de Portal removidas nas m4 e m6;
   - as janelas medidas pelo `scripts/missions.ts` depois da E1.

   Atualize também o parágrafo da variante "titãs" da m8 (`docs/STORY.md`, o item que começa com
   "**Variante "titãs"**"): o roteiro não avança mais à Idade dos Titãs nem ergue o Portal; faz os estudos, a Fortaleza
   e junta os 500 de Favor com os dez cidadãos rezando.
5. **`docs/EDITOR.md`**: no G6, troque "(0–4, …)" por "(0–7, …)"; documente `config.visualEraMax` (0–7, só aparência)
   e a stat `studies` nas condições.
6. **Commit** em português, com o rodapé de atribuição exigido pela **sua** sessão (não copie o de outra). Por exemplo:
   ```
   E1: 8 Eras e Biblioteca (fila de 5, avanço de Era, linhas × 8, Era inicial/final, árvore de estudos)

   - AGES 0–7; Titãs e Portal na Era Moderna (7); campanha em maxAge 3 / visualEraMax 2
   - Biblioteca (id academy) na Era I: um estudo por vez, fila de 5, uma por cidade, avanço de Era
   - IA avança na Biblioteca; tabelas por Era; SIM_VERSION 4; save v2 com aviso no menu
   - Painel da Biblioteca e árvore de estudos (F3), PT/EN, sem emoji, controle

   <rodapé de atribuição da sessão>
   ```
   Faça push só para a branch da sessão (rotina do `docs/eras/LEIA-ME.md`); nunca para `main` sem pedido do dono.
