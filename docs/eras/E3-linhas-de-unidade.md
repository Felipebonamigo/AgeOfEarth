# E3 — Linhas de unidade I–VIII com evolução na Biblioteca

- Estado: pendente · Pré-requisitos: **E1 e E2 concluídas** (8 Eras em `AGES`, Biblioteca com `library`/`queueMax`, `queueMaxOf`, `isScenarioConfig`, árvore de estudos em `src/ui/studytree.ts`; recursos `stone` e `oil` em `RESOURCES`, alias de arte em `src/render/art/alias.ts`) · Estimativa: 5 dias de trabalho do agente (dados 1, núcleo 1, IA e balanceamento 1, renderização, ícones e interface 1, verificação e documentação 1)

> **Antes de começar:** leia `docs/eras/LEIA-ME.md` (rotina de cada sessão, regras, quando parar) e marque cada
> passo em `docs/eras/PROGRESSO.md`. Ordem das etapas: E1, E2, E3, E4, E5+E7, E6, E8, E9+E10. Onde este guia falar de
> commit ou de push, vale a rotina do LEIA-ME: um commit por passo e push só para a branch da sessão.

> Guia de execução para um agente que não viu a conversa que o escreveu. Siga os blocos na ordem (0, A … H), com um
> commit por bloco ou um único no fim. Todo número de jogo daqui é **valor inicial para o balanceamento** (a E10 ajusta):
> não invente outros e não recalcule os que já vêm prontos. O código citado foi conferido em 06/10/2026, **antes** da E1
> e da E2; elas mexem em volta (por exemplo, trocam o `10` da fila por `queueMaxOf`). Se um trecho citado não estiver
> exatamente como descrito, procure pelo nome da função e aplique a mesma mudança em cima do que a E1/E2 deixaram; não
> desfaça nada delas. Números de linha são aproximados. Rode **todos** os comandos na raiz do repositório
> (`cd /home/user/AgeOfEarth` antes de cada um, se o seu terminal não guarda o diretório). Arquivos temporários (as
> medições "antes", o script de médias do bloco H) vão em `/tmp`, nunca no repositório.

---

## Objetivo e resultado jogável

Ao terminar a E3, numa **partida rápida, no multiplayer e em qualquer partida fora de cenário**:

- O jogo passa a ter **10 linhas de unidade em terra**: as 9 linhas terrestres da tabela de `docs/ERAS.md` §4 (do
  Cidadão ao Assalto a muralhas) e o Sifão de fogo grego como ramo da linha de arremesso. Cada uma tem um degrau por
  Era, da Arcaica à Moderna. São **41 unidades novas**, do Falangita ao Tanque.
- Os quartéis treinam **uma linha por botão**: o botão da Infantaria pesada mostra o Hoplita até alguém estudar
  "Infantaria pesada: Hipaspista" na Biblioteca. Daí em diante ele mostra e treina o Hipaspista.
- A **evolução é um estudo da Biblioteca**, um por linha por Era, em sequência, e entra na mesma fila de um estudo por
  vez da E1. Ao terminar, **todas as unidades daquela linha que o jogador já tem se transformam** no degrau novo:
  - a vida fica proporcional;
  - a patente (abates), a ordem, a postura e a guarnição continuam;
  - aparece uma nuvem de poeira e um brilho dourado no pé.
  Uma unidade que estava na fila sai já no degrau novo.
- Os **cidadãos** evoluem por 7 estudos que dão vida, coleta e construção, sem trocar de tipo.
- **Unidades de pólvora** (da Era V em diante) atiram de longe, com cadência própria. O **Tanque** é o degrau VIII da
  Cavalaria, e a Infantaria VIII tem dano dobrado contra ele. A **Elite** sai só da Fortaleza (Mirmidão → … → Batalhão
  Sagrado). O Assalto a muralhas e o Fogo grego se aposentam na Era V.
- Uma partida que começa numa Era alta já começa com os degraus daquela Era.
- A IA treina pelas linhas, estuda as evoluções das linhas que usa e transforma o exército.
- A árvore de estudos (F3) ganha uma linha por linha de unidade. O cartão da unidade mostra "Linha: … · Era".

**Na campanha, na Horda e nos cenários JSON que não pedem as linhas, nada muda.** Eles continuam no **elenco clássico**:
as mesmas unidades de hoje, treinadas direto, sem evoluções. As 12 missões vencem no harness estrito com os mesmos
resultados de antes da E3.

**Arte provisória:**
- cada unidade nova usa a arte assada de uma unidade de hoje (alias da E2);
- o procedural desenha o mesmo alias;
- os estudos de evolução têm um ícone por linha.

Nenhum manifesto nem bake novo. A arte própria é da E8.

---

## Decisões já tomadas (não reabrir; cite docs/ERAS.md)

Do plano aprovado (`docs/ERAS.md`):

- **§2:** a evolução de cada tipo de unidade se estuda **na Biblioteca**, "uma por linha por Era", um estudo por vez.
  Ao terminar, "as unidades da linha que já existem se transformam (com a vida proporcional e um efeito de poeira e
  brilho), e o treino passa a sair na versão nova". "Cidadãos, navios e batedores também evoluem aqui." Não é automática:
  o jogador escolhe o que estudar.
- **§4:** a tabela das linhas I–VIII. "As unidades de hoje viram o primeiro degrau das linhas (os ids continuam)". A
  tabela mantém o pedra-papel-tesoura (infantaria pesada > cavalaria > tiro > infantaria; escaramuça > tiro; cerco >
  edifícios). Não há aviões. Os heróis continuam lendários.
- **§3:** o petróleo serve para fogo grego, cerco incendiário, navios a vapor, tanques e artilharia.
- **§10:** uma tabela de linhas (tipo → linha → degrau), a transformação das existentes, IA com as evoluções, arte das
  ~50 unidades novas na E8 e a campanha nas Eras I–IV.
- **§11:** E3 = dados das linhas I–VIII, evolução na Biblioteca, transformação, IA e balanceamento, com arte provisória.

Decisões deste guia (cada uma com o motivo em uma linha):

| # | Decisão | Motivo |
|---|---|---|
| D1 | **Um `UnitDef` por degrau** (ids novos em snake_case). A transformação troca `u.type`. `UnitDef` ganha `line`, `tier` (Era do degrau, 0–7) e `lineOnly` (degrau novo). | Atributos, bônus, custo e arte já são por tipo, e o renderizador recria a vista sozinho quando o tipo muda (`src/render/renderer.ts`, `getView`). |
| D2 | O degrau atual **sai de `player.techs`** (`lineUnitOf`). Nenhum campo novo no estado. | Nada no save, no `deserialize` nem no hash; a mesma conta em todos os clientes. |
| D3 | Evolução = `TechDef` id `evo_<linha>_<n>`, onde `n` é o número da Era (2–8, como `civic2…8`). Fica na `academy`, com `age = n − 1`, `prereq` = o estudo anterior da mesma linha e o campo novo `evolve: { line, to }`. **Sem** o campo `line`. | Reaproveita `canResearch`, a fila de 5, `forbid.techs`, a árvore e o HUD. Sem `line`, não conta no `requires.techCount` das Eras (`academyTechCount`). |
| D4 | **Elenco clássico nos cenários.** `unitLinesOn(state) = config.unitLines ?? !isScenarioConfig(config)`: as linhas ficam ligadas fora de cenário e desligadas na campanha, na Horda e nos cenários JSON, a menos que o cenário ponha `"unitLines": true`. | Campanha e harness intactos: os roteiros e a m10 usam tipos literais (`hypaspist`, `helepolis`…) e misturas de treino fixas (`testing.ts`). |
| D5 | As **12 unidades de hoje** que entram nas linhas mantêm id, números, `age`, `building`, `hotkey` e lugar nos `trains`; só ganham `line`/`tier`. `age` continua sendo a Era de treino direto no elenco clássico; `tier` é a Era delas na linha. | Resolve a D20 da E1 (hipaspista 2, cretense 2, mirmidão 3, helépole 3 × ERAS §4) sem mudar a campanha. |
| D6 | Degraus novos: `lineOnly: true`, fora de **todo** `trains`, `building` = 1º edifício da linha e sem `hotkey`; a tecla é da linha. | No elenco clássico eles não aparecem nem treinam; o teste de atalhos do `trains` continua igual. |
| D7 | Treino com linhas: a linha decide os edifícios e a tecla (`LineDef.buildings`/`hotkey`). Mandar **qualquer** id da linha treina o degrau atual. A fila guarda o tipo resolvido e o item é resolvido de novo ao nascer. | Uma regra só (`trainChoices`/`canTrain`) para HUD, atalhos, IA e comando de rede; não há item velho preso na fila. |
| D8 | **Elite só na Fortaleza** (com linhas); no elenco clássico o Mirmidão continua também no Quartel. | ERAS §4: "Elite (Fortaleza)". |
| D9 | Arremesso IV = **Trabuco**. O **Sifão de fogo grego** é uma linha técnica de um degrau (`greek_fire`, só IV) na Oficina, com petróleo. O Assalto (Helépole → Aríete coberto) e o Fogo grego **aposentam na Era V** (`retireAt: 4`): não treinam mais, e as unidades que existem ficam. | ERAS §4: "Trabuco / Sifão de fogo grego" e "(a pólvora aposenta)". |
| D10 | Navio de guerra e Barcos: **só ids e nomes reservados** (tabela em "Dados prontos"); `UnitDef`, linhas e atributos são da E4. | Navio sem água navegável nem Estaleiro não tem onde nascer nem andar. |
| D11 | O **cidadão não troca de tipo**: a linha `citizen` tem `villager` nos 8 degraus e 7 estudos com efeitos (vida, coleta, construção). | Há dezenas de comparações com `'villager'` em `src/core` (`grep -rn "'villager'" src/core` acha ~40: eliminação, kit, IA, harness). |
| D12 | **Regra de escala por Era** (seção "Regra de escala"): ×1,20 na vida e no dano por segundo, +0,02 em cada armadura, ×1,10 no custo, +1 s no treino; o resto vem da âncora, e as exceções estão numa tabela. | Os números saem de uma fórmula, sem chute, e o pedra-papel-tesoura de hoje continua (os bônus por tag vêm da âncora). |
| D13 | **Pólvora:** `attackType: 'pierce'` (granadas `crush` com área), cadência própria no campo novo `attackInterval` e o mesmo bônus da linha. Tag nova `'gunpowder'` (gancho dos efeitos de tiro da E8). | Mosquete forte e lento; o RPS fica igual; a E8 escolhe bala × flecha pela tag. |
| D14 | **Tanque** = degrau VIII da Cavalaria: `cls: 'cavalry'`, tag `'mechanical'` e **sem** `'human'`. Alcance 5, `crush`, vida ×1,5 e petróleo. A Infantaria VIII tem bônus ×2 contra `cavalry`. | ERAS §4. Sem `human`, a Medusa não petrifica o tanque e as míticas não ganham contra ele o bônus ×1,3 que têm contra `human`; a infantaria antitanque fecha o RPS. |
| D15 | **Petróleo nos custos:** sifão 50, obus 40, autopropulsada 100, tanque 120, motociclista 30. Nenhuma unidade custa pedra. | ERAS §3. A pedra é dos edifícios (E2). |
| D16 | Partida que começa numa Era acima da I, fora de cenário, ganha **todos os estudos de evolução até essa Era**, e o batedor do kit nasce no degrau atual. | Começar na V com Hoplitas não faz sentido; é o mesmo espírito da D9 da E1. |
| D17 | Arte provisória = alias da E2: as 41 entradas em `UNIT_ART_ALIAS`, o procedural desenhando o alias e `ic.unit` pelo alias. Ícone de estudo = **um por linha** (`tech/evo_<linha>`), com o modelo da âncora. **Sem manifesto nem bake.** | Nenhuma página nova de VRAM; os testes de arte passam; a E8 troca. |
| D18 | Efeito visual novo `'evolve'`, um por unidade transformada fora de edifício (poeira e brilho), com o som da cura. | ERAS §2 pede o efeito. Tipo novo no núcleo exige o registro em `src/render/fx` (`tests/fx-registry.test.ts`). |
| D19 | IA: treina por `trainChoices` (a mesma função do HUD). Estuda o próximo degrau das linhas que mais usa, **depois** dos estudos que a próxima Era exige. Cidadãos sempre; as outras linhas só com o fundo da Era junto ou com 4+ unidades da linha. | Não atrasar as Eras (ritmo alvo de ERAS §1) e ainda evoluir o exército em campo. Na prática a IA evolui quando a Biblioteca fica livre: enquanto junta recursos para a Era, numa 2ª Biblioteca (2º Centro Cívico) ou na Era final. Com recursos de sobra ela avança assim que cumpre os estudos e quase não evolui — por isso o teste da IA usa uma Era final (`maxAge`). |
| D20 | `SIM_VERSION` sobe 1. O formato do save **não** muda (nenhum campo novo de estado). | A mesma semente dá outra partida; os saves da E2 carregam (tipos só ganham campos opcionais). |
| D21 | `forbid.units` vale para o tipo que **sairia** do treino (o degrau atual). Para travar a evolução, use `forbid.techs` com os `evo_*`. | É o que o jogador recebe; a regra de cenário continua simples. |

---

## Arquivos que mudam

Os marcados "(da E1)"/"(da E2)" foram criados por essas etapas. **Se não existirem, pare: a pré-condição não foi cumprida.**

| Caminho | O que muda |
|---|---|
| `src/core/types.ts` | `UnitDef`: `line?`, `tier?`, `lineOnly?`, `attackInterval?`; `TechDef`: `evolve?`; `GameConfig`: `unitLines?` |
| `src/core/data/lines.ts` (novo) | `LineDef`, `LINES` (10 linhas), `LINE_ORDER`, `lineStart`, `evoTechId` |
| `src/core/data/index.ts` | `export * from './lines';` |
| `src/core/data/units.ts` | `line`/`tier` nas 12 unidades de hoje; as 41 unidades novas; `UNIT_TAGS` com `gunpowder`, `mechanical`, `fire` |
| `src/core/data/techs.ts` | `CITIZEN_EVO_EFFECTS`, `evolutions()` e os 50 estudos no `RAW` |
| `src/core/sim/lines.ts` (novo) | `unitLinesOn`, `lineUnitOf`, `nextEvolution`, `trainTypeOf`, `trainChoices`, `applyEvolution` |
| `src/core/sim/commands.ts` | `canTrain` com o ramo das linhas (`canTrainLine`); `train` resolve o tipo; `canResearch` recusa evolução no elenco clássico |
| `src/core/sim/buildings.ts` | `completeQueueItem`: unidade resolvida ao nascer; `applyEvolution` antes de `recomputeMods` |
| `src/core/sim/combat.ts` | `attackInterval` lê `UnitDef.attackInterval` |
| `src/core/sim/game.ts` | `grantStartingEvolutions` (nova, exportada); batedor do kit pelo degrau atual; `summarize` com `evo=` |
| `src/core/sim/ai.ts` | imports `LINES`/`LINE_ORDER`; treino por `trainChoices`; `lineUsers`, `evolutionPriority` (sem as linhas aposentadas), `evolutionAllowed`; `manageResearch` |
| `src/core/scenario/helpers.ts` | `grantTech` transforma (`applyEvolution`) |
| `src/core/scenario/schema.ts` | `config.unitLines?: boolean` (tipo + validação) |
| `src/core/scenario/compile.ts` | `scenarioConfig` copia `unitLines` |
| `src/core/constants.ts` | `SIM_VERSION` + 1 (com a linha do histórico) |
| `src/i18n/en-data.ts` | 41 entradas em `EN_UNITS`; `EN_LINES`; `CITIZEN_STUDIES_EN`; `evolutionsEN()` dentro de `EN_TECHS` |
| `src/i18n/index.ts` | `setLocale` aplica `EN_LINES` em `LINES` |
| `src/i18n/strings.ts` | chaves `err.legacyRoster`, `err.lineRetired`, `sel.line`, `cmd.lineTip` (PT e EN) |
| `src/ui/hud.ts` | botões de treino por `trainChoices`; evolução escondida no elenco clássico; linha no cartão da unidade (menos cidadão); chave da seleção com o tipo; atalhos de treino na tela de atalhos; fila do edifício mostra o degrau que vai nascer (`trainTypeOf`) |
| `src/ui/input.ts` | atalho de treino por `trainChoices` |
| `src/ui/studytree.ts` (da E1) | `rowOf` com as linhas de unidade; uma linha da árvore por linha de unidade |
| `src/ui/icons.ts` | `techIconName` para `evo_*` |
| `scripts/bake/hud/catalog.mjs` | 9 entradas `evo_*` em `TECH_ICONS`; `techIconKey` para `evo_*` |
| `public/art/hud-*.png`, `public/art/hud-*.json`, `public/art/manifest.json` | regenerados por `npm run art:hud` (nunca à mão) |
| `src/render/art/alias.ts` (da E2) | 41 entradas em `UNIT_ART_ALIAS` |
| `src/render/textures.ts` | `TextureCache.unit` desenha o alias |
| `src/render/fx/types.ts` | `'evolve'` em `EFFECT_TYPES` |
| `src/render/fx/handlers/evolve.ts` (novo) | handler da evolução |
| `src/render/fx/registry.ts` | `evolve` em `FX_HANDLERS` |
| `src/render/fx/logic.ts` | `projectileKind`: tag `fire` → `'fireball'` |
| `src/audio/events.ts` | `cuesForEffect`: `'evolve'` → receita `heal` |
| `scripts/playtest-lines.mjs` (novo) | playtest da Biblioteca, da transformação, do Quartel e da árvore |
| `tests/unit-lines.test.ts` (novo) | testes de dados, núcleo e IA das linhas |
| `tests/data.test.ts`, `tests/i18n.test.ts`, `tests/fx-registry.test.ts`, `tests/fx-logic.test.ts`, `tests/studytree.test.ts` (da E1), `tests/eras.test.ts` (da E1) | atualizações da seção "Testes" |
| `docs/EDITOR.md` | `unitLines` na config do cenário |
| `docs/eras/PROGRESSO.md` (novo, se faltar), `docs/ROADMAP.md`, `CLAUDE.md` | documentação (bloco H) |

**Não mexa em:**
- `art/manifest/*`, `scripts/bake/page/*`, `materials.js`: mudar qualquer um deles reassa a arte;
- `src/core/scenario/missions/*.json` e `src/core/scenario/testing.ts`: a campanha fica no elenco clássico sem tocar neles;
- os `UnitDef` de antes da E3 (os 35 de hoje mais o `merchant` da E2), além do `line`/`tier` das 12 da tabela;
- as listas `trains` dos edifícios.

---

## Dados prontos

Todos os números são **valores iniciais para o balanceamento da E10**. Os blocos de código abaixo já trazem os valores
calculados: copie-os, não recalcule.

### As linhas (`src/core/data/lines.ts`)

Índice da Era = posição no vetor `steps` (0 = I … 7 = VIII); `—` = nenhum degrau novo naquela Era (o anterior continua).
Em negrito, as unidades que já existem.

| id | Nome PT / EN | Treina em (com linhas) | Tecla | I | II | III | IV | V | VI | VII | VIII | Aposenta |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `citizen` | Cidadãos / Citizens | `town_center` | Q | **villager** | villager | villager | villager | villager | villager | villager | villager | — |
| `scout` | Batedores / Scouts | `town_center`, `stable` | W | **kataskopos** | — | prodromos | trapezites | stradiot | hussar | mounted_scout | motorcyclist | — |
| `heavy_infantry` | Infantaria pesada / Heavy Infantry | `barracks`, `fortress` | Q | **hoplite** | **hypaspist** | phalangite | skoutatos | pikeman | grenadier | fusilier | modern_infantry | — |
| `ranged` | Tiro / Missile Troops | `barracks`, `fortress` | W | **toxotes** | **cretan_archer** | rhodian_slinger | byzantine_archer | arquebusier | musketeer | sharpshooter | machine_gunner | — |
| `skirmisher` | Escaramuça / Skirmishers | `barracks` | E | — | **peltast** | thureophoros | akritas | rodelero | chasseur | light_infantry | commando | — |
| `cavalry` | Cavalaria / Cavalry | `stable`, `fortress` | E | — | **hippeus** | **hetairoi** | cataphract | cuirassier | dragoon | lancer | tank | — |
| `elite` | Elite da Fortaleza / Fortress Elite | `fortress` | Y | — | — | **myrmidon** | athanatos | knight_of_rhodes | guard_grenadier | evzone | sacred_band | — |
| `artillery` | Arremesso / Artillery | `siege_workshop` | Q | — | — | **petrobolos** | trebuchet | bombard | field_gun | howitzer | self_propelled_gun | — |
| `assault` | Assalto a muralhas / Wall Assault | `siege_workshop` | W | — | — | **helepolis** | covered_ram | — | — | — | — | Era V (`retireAt: 4`) |
| `greek_fire` | Fogo grego / Greek Fire | `siege_workshop` | E | — | — | — | greek_fire_siphon | — | — | — | — | Era V (`retireAt: 4`) |

Teclas por edifício, com as linhas ligadas (todas únicas; nenhuma é A, R ou U; a Biblioteca não treina):

| Edifício | Teclas |
|---|---|
| `town_center` | Q Cidadãos · W Batedores |
| `stable` | W Batedores · E Cavalaria |
| `barracks` | Q Infantaria pesada · W Tiro · E Escaramuça |
| `fortress` | Q Infantaria pesada · W Tiro · E Cavalaria · Y Elite |
| `siege_workshop` | Q Arremesso · W Assalto · E Fogo grego |

O botão de cada linha manda o id da **base**: o primeiro degrau não nulo, por exemplo `hoplite`, `peltast` ou
`myrmidon`. O núcleo troca pelo degrau atual. Edifício que treina algo fora das linhas (o Templo e os heróis; o Mercado
e o Mercador da E2) continua com os botões do `trains`, depois dos das linhas.

Ids e nomes reservados para a E4 (não entram em `UNITS` nem em `LINES` na E3):

| Linha | id | PT / EN | Era |
|---|---|---|---|
| `warship` | `penteconter` | Pentecôntero / Penteconter | I |
| `warship` | `trireme` | Trirreme / Trireme | II |
| `warship` | `quinquereme` | Quinquerreme / Quinquereme | III |
| `warship` | `dromon` | Dromon / Dromon (fogo grego) | IV |
| `warship` | `galleon` | Galeão / Galleon | V |
| `warship` | `ship_of_the_line` | Navio de linha / Ship of the Line | VI |
| `warship` | `ironclad` | Couraçado / Ironclad | VII |
| `warship` | `battleship` | Encouraçado / Battleship | VIII |
| `fishing` | `fishing_boat` | Barco de pesca / Fishing Boat | I |
| `transport` | `transport_ship` | Transporte / Transport Ship | I |
| (a E5 decide) | `merchant_ship` | Navio mercante / Merchant Ship | III (E5) |

Os barcos de pesca e de transporte são duas linhas de tipo fixo (`fishing`, `transport`; D11 da E4) que evoluem
"a vapor" na VII sem trocar de tipo, como os cidadãos. A E4 cria essas linhas, a `warship` e o Estaleiro; o navio
mercante é da E5.

### Regra de escala por Era (como os números foram calculados)

Cada degrau novo deriva da **âncora**, o último degrau que já existe na linha: `kataskopos` (I) para os batedores,
`hypaspist` (II), `cretan_archer` (II), `peltast` (II), `hetairoi` (III), `myrmidon` (III), `petrobolos` (III) e
`helepolis` (III). Com `n` = Era do degrau − Era da âncora:

- vida = arredonda para múltiplo de 5 (vida_âncora × 1,2ⁿ × multVida);
- dano por segundo (DPS) = ataque_âncora ÷ intervalo_âncora × 1,2ⁿ, e ataque = arredonda(DPS × intervalo do degrau);
- armadura = armadura_âncora + 0,02·n em cada tipo (teto 0,6), salvo exceção;
- custo = arredonda para múltiplo de 5 (cada recurso da âncora × 1,1ⁿ × multCusto), mais o petróleo fixo;
- treino = treino_âncora + n segundos;
- pop, raio, velocidade, visão, alcance, tipo de ataque, tags e bônus = os da âncora, salvo exceção.

O intervalo padrão é o da classe (`ATTACK_INTERVAL` em `src/core/sim/combat.ts`: infantaria e batedor 1,0, arqueiro 1,5,
escaramuça 1,2, cavalaria 1,1, cerco 3,0). Na tabela, `*` marca intervalo próprio (`attackInterval`).

Exceções (todas já aplicadas na tabela e no código):

| Degrau | Exceção |
|---|---|
| `mounted_scout`, `motorcyclist` | à distância (alcance 3, `pierce`), intervalo 1,6 / 1,2; o motociclista tem velocidade 5,0 e petróleo 30 |
| `grenadier`, `guard_grenadier` | alcance 3, `crush`, intervalo 2,2, área 0,8 |
| `fusilier`, `modern_infantry`, `evzone`, `sacred_band` | à distância (`pierce`), alcance 4,5–5; a Infantaria VIII tem bônus ×2 contra `cavalry` |
| `byzantine_archer`, gunpowder do Tiro | alcance 7 / 6 / 6 / 7,5 / 6; intervalos 2,4 / 2,2 / 2,0 / 0,7; o atirador (`sharpshooter`) tem visão 11; o metralhador tem bônus ×1,75 e velocidade 2,0 |
| `akritas`, `chasseur`, `light_infantry`, `commando` | alcance 4 / 5 / 5 / 4,5; intervalos (pólvora) 2,0 / 1,8 / 1,4; o comando tem velocidade 2,8 |
| `evzone`, `sacred_band` | velocidade 2,6 (a do Mirmidão é 2,4), além do que está na linha da infantaria de fuzil acima |
| `rodelero` | **corpo a corpo** (alcance 0,6, `hack`, intervalo 1,0, velocidade 2,8, sem a tag `ranged`): espada e rodela contra os atiradores |
| `dragoon` | alcance 3,5, `pierce`, intervalo 2,0 |
| `tank` | vida ×1,5, armadura 0,5/0,7/0,35, alcance 5, `crush`, intervalo 2,5, velocidade 3,0, visão 9, raio 0,45, custo ×1,5 + petróleo 120; tags sem `human`, com `mechanical`; bônus também ×1,5 contra `building` |
| `trebuchet` | alcance 9, velocidade 1,1 |
| `bombard`, `field_gun`, `howitzer` | alcance 8 / 9 / 11; intervalo 4,0 / 3,5 / 4,0; área — / 1,0 / 1,4; velocidade 1,2 / 1,6 / 1,6; bônus `building` ×6 / ×3 / ×3; o obus tem petróleo 40 |
| `self_propelled_gun` | vida ×1,5, armadura 0,4/0,6/0,25, alcance 11, intervalo 3,5, área 1,4, velocidade 2,4, raio 0,45, `building` ×3, petróleo 100 |
| `covered_ram` | **corpo a corpo** (alcance 0,8, sem `ranged`), armadura 0,3/0,75/0,15, velocidade 1,3 |
| `greek_fire_siphon` | sem âncora (degrau único): números próprios da tabela |

Pedra-papel-tesoura resultante (igual ao de hoje em todas as Eras): Infantaria pesada e Elite têm bônus contra
`cavalry`; Tiro contra `infantry`; Escaramuça contra `archer` (o Tiro inteiro mantém a tag `archer`); Cavalaria contra
`archer`, `skirmisher` e `siege`; Arremesso e Assalto contra `building`; a Elite mantém ×1,25 contra `myth`.

### Unidades novas (41)

Colunas: id · nome PT (singular / plural) · nome EN · Era (número da Era e o índice `age` = `tier`) · custo · vida ·
ataque · intervalo · armadura (hack/pierce/crush) · alcance · velocidade · visão · treino (s) · pop · raio · tags ·
bônus · área (`splash`).

| id | PT | EN | Era (`age`) | custo | vida | ataque | interv. | armadura | alc. | vel. | visão | treino | pop | raio | tags | bônus | área |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `prodromos` | Pródromo / Pródromos | Prodromos / Prodromoi | 3 (2) | food 75 | 100 | 6 hack | 1.0 | 0.14/0.14/0.09 | 0.6 | 4.3 | 13 | 17 | 1 | 0.3 | cavalry, human, scout, military | — | — |
| `trapezites` | Trapezita / Trapezitas | Trapezites / Trapezitai | 4 (3) | food 80 | 120 | 7 hack | 1.0 | 0.16/0.16/0.11 | 0.6 | 4.3 | 13 | 18 | 1 | 0.3 | cavalry, human, scout, military | — | — |
| `stradiot` | Estradiota / Estradiotas | Stradiot / Stradiots | 5 (4) | food 90 | 145 | 8 hack | 1.0 | 0.18/0.18/0.13 | 0.6 | 4.3 | 13 | 19 | 1 | 0.3 | cavalry, human, scout, military | — | — |
| `hussar` | Hussardo / Hussardos | Hussar / Hussars | 6 (5) | food 95 | 175 | 10 hack | 1.0 | 0.2/0.2/0.15 | 0.6 | 4.3 | 13 | 20 | 1 | 0.3 | cavalry, human, scout, military | — | — |
| `mounted_scout` | Batedor Montado / Batedores Montados | Mounted Scout / Mounted Scouts | 7 (6) | food 105 | 210 | 19 pierce | 1.6* | 0.22/0.22/0.17 | 3 | 4.3 | 13 | 21 | 1 | 0.3 | cavalry, human, scout, military, ranged, gunpowder | — | — |
| `motorcyclist` | Motociclista / Motociclistas | Motorcyclist / Motorcyclists | 8 (7) | food 115, oil 30 | 250 | 17 pierce | 1.2* | 0.24/0.24/0.19 | 3 | 5 | 13 | 22 | 1 | 0.3 | cavalry, human, scout, military, ranged, gunpowder, mechanical | — | — |
| `phalangite` | Falangita / Falangitas | Phalangite / Phalangites | 3 (2) | food 75, gold 55 | 180 | 16 hack | 1.0 | 0.32/0.32/0.12 | 0.6 | 2.2 | 7 | 17 | 2 | 0.3 | infantry, human, military | cavalry ×1.5 | — |
| `skoutatos` | Escutato / Escutatos | Skoutatos / Skoutatoi | 4 (3) | food 85, gold 60 | 215 | 19 hack | 1.0 | 0.34/0.34/0.14 | 0.6 | 2.2 | 7 | 18 | 2 | 0.3 | infantry, human, military | cavalry ×1.5 | — |
| `pikeman` | Piqueiro / Piqueiros | Pikeman / Pikemen | 5 (4) | food 95, gold 65 | 260 | 22 hack | 1.0 | 0.36/0.36/0.16 | 0.6 | 2.2 | 7 | 19 | 2 | 0.3 | infantry, human, military | cavalry ×1.5 | — |
| `grenadier` | Granadeiro / Granadeiros | Grenadier / Grenadiers | 6 (5) | food 100, gold 75 | 310 | 59 crush | 2.2* | 0.38/0.38/0.18 | 3 | 2.2 | 7 | 20 | 2 | 0.3 | infantry, human, military, ranged, gunpowder | cavalry ×1.5 | 0.8 |
| `fusilier` | Fuzileiro / Fuzileiros | Fusilier / Fusiliers | 7 (6) | food 115, gold 80 | 375 | 65 pierce | 2.0* | 0.4/0.4/0.2 | 4.5 | 2.2 | 7 | 21 | 2 | 0.3 | infantry, human, military, ranged, gunpowder | cavalry ×1.5 | — |
| `modern_infantry` | Infantaria / Infantaria | Infantry / Infantry | 8 (7) | food 125, gold 90 | 450 | 62 pierce | 1.6* | 0.42/0.42/0.22 | 5 | 2.2 | 7 | 22 | 2 | 0.3 | infantry, human, military, ranged, gunpowder | cavalry ×2 | — |
| `rhodian_slinger` | Fundibulário Ródio / Fundibulários Ródios | Rhodian Slinger / Rhodian Slingers | 3 (2) | wood 75, gold 55 | 110 | 13 pierce | 1.5 | 0.12/0.22/0.07 | 6.5 | 2.3 | 10 | 17 | 2 | 0.28 | archer, human, military, ranged | infantry ×1.5 | — |
| `byzantine_archer` | Tocsota Bizantino / Tocsotas Bizantinos | Byzantine Archer / Byzantine Archers | 4 (3) | wood 85, gold 60 | 130 | 16 pierce | 1.5 | 0.14/0.24/0.09 | 7 | 2.3 | 10 | 18 | 2 | 0.28 | archer, human, military, ranged | infantry ×1.5 | — |
| `arquebusier` | Arcabuzeiro / Arcabuzeiros | Arquebusier / Arquebusiers | 5 (4) | wood 95, gold 65 | 155 | 30 pierce | 2.4* | 0.16/0.26/0.11 | 6 | 2.3 | 10 | 19 | 2 | 0.28 | archer, human, military, ranged, gunpowder | infantry ×1.5 | — |
| `musketeer` | Mosqueteiro / Mosqueteiros | Musketeer / Musketeers | 6 (5) | wood 100, gold 75 | 185 | 33 pierce | 2.2* | 0.18/0.28/0.13 | 6 | 2.3 | 10 | 20 | 2 | 0.28 | archer, human, military, ranged, gunpowder | infantry ×1.5 | — |
| `sharpshooter` | Atirador / Atiradores | Sharpshooter / Sharpshooters | 7 (6) | wood 115, gold 80 | 225 | 36 pierce | 2.0* | 0.2/0.3/0.15 | 7.5 | 2.3 | 11 | 21 | 2 | 0.28 | archer, human, military, ranged, gunpowder | infantry ×1.5 | — |
| `machine_gunner` | Metralhador / Metralhadores | Machine Gunner / Machine Gunners | 8 (7) | wood 125, gold 90 | 270 | 15 pierce | 0.7* | 0.22/0.32/0.17 | 6 | 2 | 10 | 22 | 2 | 0.28 | archer, human, military, ranged, gunpowder | infantry ×1.75 | — |
| `thureophoros` | Tureóforo / Tureóforos | Thureophoros / Thureophoroi | 3 (2) | food 45, wood 45 | 100 | 7 pierce | 1.2 | 0.12/0.32/0.07 | 3.5 | 2.6 | 8 | 14 | 2 | 0.28 | skirmisher, human, military, ranged | archer ×1.8 | — |
| `akritas` | Acrita / Acritas | Akritas / Akritai | 4 (3) | food 50, wood 50 | 120 | 9 pierce | 1.2 | 0.14/0.34/0.09 | 4 | 2.6 | 8 | 15 | 2 | 0.28 | skirmisher, human, military, ranged | archer ×1.8 | — |
| `rodelero` | Rodeleiro / Rodeleiros | Rodelero / Rodeleros | 5 (4) | food 55, wood 55 | 145 | 9 hack | 1.0* | 0.16/0.36/0.11 | 0.6 | 2.8 | 8 | 16 | 2 | 0.28 | skirmisher, human, military | archer ×1.8 | — |
| `chasseur` | Caçador / Caçadores | Chasseur / Chasseurs | 6 (5) | food 60, wood 60 | 175 | 21 pierce | 2.0* | 0.18/0.38/0.13 | 5 | 2.6 | 8 | 17 | 2 | 0.28 | skirmisher, human, military, ranged, gunpowder | archer ×1.8 | — |
| `light_infantry` | Infantaria Ligeira / Infantaria Ligeira | Light Infantry / Light Infantry | 7 (6) | food 65, wood 65 | 210 | 22 pierce | 1.8* | 0.2/0.4/0.15 | 5 | 2.6 | 8 | 18 | 2 | 0.28 | skirmisher, human, military, ranged, gunpowder | archer ×1.8 | — |
| `commando` | Comando / Comandos | Commando / Commandos | 8 (7) | food 70, wood 70 | 255 | 21 pierce | 1.4* | 0.22/0.42/0.17 | 4.5 | 2.8 | 8 | 19 | 2 | 0.28 | skirmisher, human, military, ranged, gunpowder | archer ×1.8 | — |
| `cataphract` | Catafracto / Catafractos | Cataphract / Cataphracts | 4 (3) | food 110, gold 90 | 230 | 17 hack | 1.1 | 0.27/0.32/0.12 | 0.7 | 3.4 | 8 | 23 | 3 | 0.36 | cavalry, human, military | archer ×1.5, skirmisher ×1.5, siege ×1.5 | — |
| `cuirassier` | Couraceiro / Couraceiros | Cuirassier / Cuirassiers | 5 (4) | food 120, gold 95 | 275 | 20 hack | 1.1 | 0.29/0.34/0.14 | 0.7 | 3.4 | 8 | 24 | 3 | 0.36 | cavalry, human, military | archer ×1.5, skirmisher ×1.5, siege ×1.5 | — |
| `dragoon` | Dragão / Dragões | Dragoon / Dragoons | 6 (5) | food 135, gold 105 | 330 | 44 pierce | 2.0* | 0.31/0.36/0.16 | 3.5 | 3.4 | 8 | 25 | 3 | 0.36 | cavalry, human, military, ranged, gunpowder | archer ×1.5, skirmisher ×1.5, siege ×1.5 | — |
| `lancer` | Lanceiro / Lanceiros | Lancer / Lancers | 7 (6) | food 145, gold 115 | 395 | 29 hack | 1.1 | 0.33/0.38/0.18 | 0.7 | 3.4 | 8 | 26 | 3 | 0.36 | cavalry, human, military | archer ×1.5, skirmisher ×1.5, siege ×1.5 | — |
| `tank` | Tanque / Tanques | Tank / Tanks | 8 (7) | food 240, gold 195, oil 120 | 710 | 79 crush | 2.5* | 0.5/0.7/0.35 | 5 | 3 | 9 | 27 | 3 | 0.45 | cavalry, military, ranged, gunpowder, mechanical | archer ×1.5, skirmisher ×1.5, siege ×1.5, building ×1.5 | — |
| `athanatos` | Atânato / Atânatos | Athanatos / Athanatoi | 4 (3) | food 100, gold 75 | 240 | 20 hack | 1.0 | 0.37/0.37/0.17 | 0.6 | 2.4 | 8 | 19 | 2 | 0.3 | infantry, human, military | cavalry ×1.5, myth ×1.25 | — |
| `knight_of_rhodes` | Cavaleiro de Rodes / Cavaleiros de Rodes | Knight of Rhodes / Knights of Rhodes | 5 (4) | food 110, gold 85 | 290 | 24 hack | 1.0 | 0.39/0.39/0.19 | 0.6 | 2.4 | 8 | 20 | 2 | 0.3 | infantry, human, military | cavalry ×1.5, myth ×1.25 | — |
| `guard_grenadier` | Granadeiro da Guarda / Granadeiros da Guarda | Guard Grenadier / Guard Grenadiers | 6 (5) | food 120, gold 95 | 345 | 65 crush | 2.2* | 0.41/0.41/0.21 | 3 | 2.4 | 8 | 21 | 2 | 0.3 | infantry, human, military, ranged, gunpowder | cavalry ×1.5, myth ×1.25 | 0.8 |
| `evzone` | Evzone / Evzones | Evzone / Evzones | 7 (6) | food 130, gold 100 | 415 | 63 pierce | 1.8* | 0.43/0.43/0.23 | 4.5 | 2.6 | 8 | 22 | 2 | 0.3 | infantry, human, military, ranged, gunpowder | cavalry ×1.5, myth ×1.25 | — |
| `sacred_band` | Batalhão Sagrado / Batalhão Sagrado | Sacred Band / Sacred Band | 8 (7) | food 145, gold 115 | 500 | 59 pierce | 1.4* | 0.45/0.45/0.25 | 4.5 | 2.6 | 8 | 23 | 2 | 0.3 | infantry, human, military, ranged, gunpowder | cavalry ×1.5, myth ×1.25 | — |
| `trebuchet` | Trabuco / Trabucos | Trebuchet / Trebuchets | 4 (3) | wood 165, gold 110 | 145 | 36 crush | 3.0 | 0.07/0.52/0.12 | 9 | 1.1 | 9 | 31 | 4 | 0.4 | siege, military, ranged | building ×5 | — |
| `bombard` | Bombarda / Bombardas | Bombard / Bombards | 5 (4) | wood 180, gold 120 | 175 | 58 crush | 4.0* | 0.09/0.54/0.14 | 8 | 1.2 | 9 | 32 | 4 | 0.4 | siege, military, ranged, gunpowder | building ×6 | — |
| `field_gun` | Canhão de Campanha / Canhões de Campanha | Field Gun / Field Guns | 6 (5) | wood 200, gold 135 | 205 | 60 crush | 3.5* | 0.11/0.56/0.16 | 9 | 1.6 | 9 | 33 | 4 | 0.4 | siege, military, ranged, gunpowder | building ×3 | 1 |
| `howitzer` | Obus / Obuses | Howitzer / Howitzers | 7 (6) | wood 220, gold 145, oil 40 | 250 | 83 crush | 4.0* | 0.13/0.58/0.18 | 11 | 1.6 | 9 | 34 | 4 | 0.4 | siege, military, ranged, gunpowder | building ×3 | 1.4 |
| `self_propelled_gun` | Artilharia Autopropulsada / Artilharias Autopropulsadas | Self-Propelled Gun / Self-Propelled Guns | 8 (7) | wood 240, gold 160, oil 100 | 450 | 87 crush | 3.5* | 0.4/0.6/0.25 | 11 | 2.4 | 9 | 35 | 4 | 0.45 | siege, military, ranged, gunpowder, mechanical | building ×3 | 1.4 |
| `covered_ram` | Aríete Coberto / Aríetes Cobertos | Covered Ram / Covered Rams | 4 (3) | wood 275, gold 220 | 480 | 54 crush | 3.0 | 0.3/0.75/0.15 | 0.8 | 1.3 | 9 | 41 | 5 | 0.5 | siege, military | building ×5 | — |
| `greek_fire_siphon` | Sifão de Fogo Grego / Sifões de Fogo Grego | Greek Fire Siphon / Greek Fire Siphons | 4 (3) | wood 120, gold 80, oil 50 | 180 | 20 crush | 2.0* | 0.2/0.5/0.1 | 2.5 | 1.6 | 8 | 30 | 3 | 0.4 | siege, military, ranged, fire | building ×2 | 1.2 |

Código pronto para `src/core/data/units.ts`, para colar como está no passo A4. Os emoji de `icon` são **dado**: o HUD não
os mostra, porque usa `ic.unit`.

```ts
  prodromos: { id: 'prodromos',
    name: 'Pródromo', plural: 'Pródromos', icon: '🐎', cls: 'scout',
    cost: { food: 75 }, hp: 100, attack: 6, attackType: 'hack',
    armor: { hack: 0.14, pierce: 0.14, crush: 0.09 }, range: 0.6, speed: 4.3, los: 13, trainTime: 17, pop: 1, radius: 0.3,
    tags: ['cavalry', 'human', 'scout', 'military'], bonus: {}, building: 'town_center', age: 2,
    line: 'scout', tier: 2, lineOnly: true,
    desc: 'Cavaleiro de vanguarda dos exércitos helenísticos. Veloz e de visão longa; fraco em combate.',
  },
  trapezites: { id: 'trapezites',
    name: 'Trapezita', plural: 'Trapezitas', icon: '🐎', cls: 'scout',
    cost: { food: 80 }, hp: 120, attack: 7, attackType: 'hack',
    armor: { hack: 0.16, pierce: 0.16, crush: 0.11 }, range: 0.6, speed: 4.3, los: 13, trainTime: 18, pop: 1, radius: 0.3,
    tags: ['cavalry', 'human', 'scout', 'military'], bonus: {}, building: 'town_center', age: 3,
    line: 'scout', tier: 3, lineOnly: true,
    desc: 'Cavaleiro de fronteira bizantino, treinado para emboscadas. Veloz e de visão longa; fraco em combate.',
  },
  stradiot: { id: 'stradiot',
    name: 'Estradiota', plural: 'Estradiotas', icon: '🐎', cls: 'scout',
    cost: { food: 90 }, hp: 145, attack: 8, attackType: 'hack',
    armor: { hack: 0.18, pierce: 0.18, crush: 0.13 }, range: 0.6, speed: 4.3, los: 13, trainTime: 19, pop: 1, radius: 0.3,
    tags: ['cavalry', 'human', 'scout', 'military'], bonus: {}, building: 'town_center', age: 4,
    line: 'scout', tier: 4, lineOnly: true,
    desc: 'Cavaleiro ligeiro grego a serviço de Veneza. Veloz e de visão longa; fraco em combate.',
  },
  hussar: { id: 'hussar',
    name: 'Hussardo', plural: 'Hussardos', icon: '🐎', cls: 'scout',
    cost: { food: 95 }, hp: 175, attack: 10, attackType: 'hack',
    armor: { hack: 0.2, pierce: 0.2, crush: 0.15 }, range: 0.6, speed: 4.3, los: 13, trainTime: 20, pop: 1, radius: 0.3,
    tags: ['cavalry', 'human', 'scout', 'military'], bonus: {}, building: 'town_center', age: 5,
    line: 'scout', tier: 5, lineOnly: true,
    desc: 'Cavalaria ligeira de sabre. Veloz e de visão longa; fraca contra tropas de linha.',
  },
  mounted_scout: { id: 'mounted_scout',
    name: 'Batedor Montado', plural: 'Batedores Montados', icon: '🐎', cls: 'scout',
    cost: { food: 105 }, hp: 210, attack: 19, attackType: 'pierce',
    armor: { hack: 0.22, pierce: 0.22, crush: 0.17 }, range: 3, speed: 4.3, los: 13, trainTime: 21, pop: 1, radius: 0.3,
    tags: ['cavalry', 'human', 'scout', 'military', 'ranged', 'gunpowder'], bonus: {}, building: 'town_center', age: 6,
    line: 'scout', tier: 6, lineOnly: true, attackInterval: 1.6,
    desc: 'Batedor de carabina: atira de perto enquanto explora; fraco em combate prolongado.',
  },
  motorcyclist: { id: 'motorcyclist',
    name: 'Motociclista', plural: 'Motociclistas', icon: '🐎', cls: 'scout',
    cost: { food: 115, oil: 30 }, hp: 250, attack: 17, attackType: 'pierce',
    armor: { hack: 0.24, pierce: 0.24, crush: 0.19 }, range: 3, speed: 5, los: 13, trainTime: 22, pop: 1, radius: 0.3,
    tags: ['cavalry', 'human', 'scout', 'military', 'ranged', 'gunpowder', 'mechanical'], bonus: {}, building: 'town_center', age: 7,
    line: 'scout', tier: 7, lineOnly: true, attackInterval: 1.2,
    desc: 'Batedor motorizado com submetralhadora, muito veloz. Gasta petróleo.',
  },
  phalangite: { id: 'phalangite',
    name: 'Falangita', plural: 'Falangitas', icon: '⚔️', cls: 'infantry',
    cost: { food: 75, gold: 55 }, hp: 180, attack: 16, attackType: 'hack',
    armor: { hack: 0.32, pierce: 0.32, crush: 0.12 }, range: 0.6, speed: 2.2, los: 7, trainTime: 17, pop: 2, radius: 0.3,
    tags: ['infantry', 'human', 'military'], bonus: { cavalry: 1.5 }, building: 'barracks', age: 2,
    line: 'heavy_infantry', tier: 2, lineOnly: true,
    desc: 'Infantaria de sarissa da falange macedônica. Forte contra cavalaria, fraca contra tiro.',
  },
  skoutatos: { id: 'skoutatos',
    name: 'Escutato', plural: 'Escutatos', icon: '⚔️', cls: 'infantry',
    cost: { food: 85, gold: 60 }, hp: 215, attack: 19, attackType: 'hack',
    armor: { hack: 0.34, pierce: 0.34, crush: 0.14 }, range: 0.6, speed: 2.2, los: 7, trainTime: 18, pop: 2, radius: 0.3,
    tags: ['infantry', 'human', 'military'], bonus: { cavalry: 1.5 }, building: 'barracks', age: 3,
    line: 'heavy_infantry', tier: 3, lineOnly: true,
    desc: 'Infantaria pesada bizantina de escudo oval e lança. Forte contra cavalaria, fraca contra tiro.',
  },
  pikeman: { id: 'pikeman',
    name: 'Piqueiro', plural: 'Piqueiros', icon: '⚔️', cls: 'infantry',
    cost: { food: 95, gold: 65 }, hp: 260, attack: 22, attackType: 'hack',
    armor: { hack: 0.36, pierce: 0.36, crush: 0.16 }, range: 0.6, speed: 2.2, los: 7, trainTime: 19, pop: 2, radius: 0.3,
    tags: ['infantry', 'human', 'military'], bonus: { cavalry: 1.5 }, building: 'barracks', age: 4,
    line: 'heavy_infantry', tier: 4, lineOnly: true,
    desc: 'Piqueiro de couraça de aço. Forte contra cavalaria, fraco contra tiro.',
  },
  grenadier: { id: 'grenadier',
    name: 'Granadeiro', plural: 'Granadeiros', icon: '⚔️', cls: 'infantry',
    cost: { food: 100, gold: 75 }, hp: 310, attack: 59, attackType: 'crush',
    armor: { hack: 0.38, pierce: 0.38, crush: 0.18 }, range: 3, speed: 2.2, los: 7, trainTime: 20, pop: 2, radius: 0.3,
    tags: ['infantry', 'human', 'military', 'ranged', 'gunpowder'], bonus: { cavalry: 1.5 }, building: 'barracks', age: 5,
    line: 'heavy_infantry', tier: 5, lineOnly: true, attackInterval: 2.2, splash: 0.8,
    desc: 'Lança granadas de perto, com dano em área. Forte contra cavalaria, fraco contra tiro.',
  },
  fusilier: { id: 'fusilier',
    name: 'Fuzileiro', plural: 'Fuzileiros', icon: '⚔️', cls: 'infantry',
    cost: { food: 115, gold: 80 }, hp: 375, attack: 65, attackType: 'pierce',
    armor: { hack: 0.4, pierce: 0.4, crush: 0.2 }, range: 4.5, speed: 2.2, los: 7, trainTime: 21, pop: 2, radius: 0.3,
    tags: ['infantry', 'human', 'military', 'ranged', 'gunpowder'], bonus: { cavalry: 1.5 }, building: 'barracks', age: 6,
    line: 'heavy_infantry', tier: 6, lineOnly: true, attackInterval: 2,
    desc: 'Infantaria de linha de fuzil e baioneta. Forte contra cavalaria, fraca contra tiro.',
  },
  modern_infantry: { id: 'modern_infantry',
    name: 'Infantaria', plural: 'Infantaria', icon: '⚔️', cls: 'infantry',
    cost: { food: 125, gold: 90 }, hp: 450, attack: 62, attackType: 'pierce',
    armor: { hack: 0.42, pierce: 0.42, crush: 0.22 }, range: 5, speed: 2.2, los: 7, trainTime: 22, pop: 2, radius: 0.3,
    tags: ['infantry', 'human', 'military', 'ranged', 'gunpowder'], bonus: { cavalry: 2 }, building: 'barracks', age: 7,
    line: 'heavy_infantry', tier: 7, lineOnly: true, attackInterval: 1.6,
    desc: 'Infantaria de capacete de aço com armas antitanque: dano dobrado contra cavalaria e tanques.',
  },
  rhodian_slinger: { id: 'rhodian_slinger',
    name: 'Fundibulário Ródio', plural: 'Fundibulários Ródios', icon: '🏹', cls: 'archer',
    cost: { wood: 75, gold: 55 }, hp: 110, attack: 13, attackType: 'pierce',
    armor: { hack: 0.12, pierce: 0.22, crush: 0.07 }, range: 6.5, speed: 2.3, los: 10, trainTime: 17, pop: 2, radius: 0.28,
    tags: ['archer', 'human', 'military', 'ranged'], bonus: { infantry: 1.5 }, building: 'barracks', age: 2,
    line: 'ranged', tier: 2, lineOnly: true,
    desc: 'Fundibulário de Rodes, de alcance longo. Forte contra infantaria, fraco contra cavalaria.',
  },
  byzantine_archer: { id: 'byzantine_archer',
    name: 'Tocsota Bizantino', plural: 'Tocsotas Bizantinos', icon: '🏹', cls: 'archer',
    cost: { wood: 85, gold: 60 }, hp: 130, attack: 16, attackType: 'pierce',
    armor: { hack: 0.14, pierce: 0.24, crush: 0.09 }, range: 7, speed: 2.3, los: 10, trainTime: 18, pop: 2, radius: 0.28,
    tags: ['archer', 'human', 'military', 'ranged'], bonus: { infantry: 1.5 }, building: 'barracks', age: 3,
    line: 'ranged', tier: 3, lineOnly: true,
    desc: 'Arqueiro bizantino de arco composto. Forte contra infantaria, fraco contra cavalaria.',
  },
  arquebusier: { id: 'arquebusier',
    name: 'Arcabuzeiro', plural: 'Arcabuzeiros', icon: '🏹', cls: 'archer',
    cost: { wood: 95, gold: 65 }, hp: 155, attack: 30, attackType: 'pierce',
    armor: { hack: 0.16, pierce: 0.26, crush: 0.11 }, range: 6, speed: 2.3, los: 10, trainTime: 19, pop: 2, radius: 0.28,
    tags: ['archer', 'human', 'military', 'ranged', 'gunpowder'], bonus: { infantry: 1.5 }, building: 'barracks', age: 4,
    line: 'ranged', tier: 4, lineOnly: true, attackInterval: 2.4,
    desc: 'Atirador de arcabuz: tiros lentos e fortes. Forte contra infantaria, fraco contra cavalaria.',
  },
  musketeer: { id: 'musketeer',
    name: 'Mosqueteiro', plural: 'Mosqueteiros', icon: '🏹', cls: 'archer',
    cost: { wood: 100, gold: 75 }, hp: 185, attack: 33, attackType: 'pierce',
    armor: { hack: 0.18, pierce: 0.28, crush: 0.13 }, range: 6, speed: 2.3, los: 10, trainTime: 20, pop: 2, radius: 0.28,
    tags: ['archer', 'human', 'military', 'ranged', 'gunpowder'], bonus: { infantry: 1.5 }, building: 'barracks', age: 5,
    line: 'ranged', tier: 5, lineOnly: true, attackInterval: 2.2,
    desc: 'Mosqueteiro de linha. Forte contra infantaria, fraco contra cavalaria.',
  },
  sharpshooter: { id: 'sharpshooter',
    name: 'Atirador', plural: 'Atiradores', icon: '🏹', cls: 'archer',
    cost: { wood: 115, gold: 80 }, hp: 225, attack: 36, attackType: 'pierce',
    armor: { hack: 0.2, pierce: 0.3, crush: 0.15 }, range: 7.5, speed: 2.3, los: 11, trainTime: 21, pop: 2, radius: 0.28,
    tags: ['archer', 'human', 'military', 'ranged', 'gunpowder'], bonus: { infantry: 1.5 }, building: 'barracks', age: 6,
    line: 'ranged', tier: 6, lineOnly: true, attackInterval: 2,
    desc: 'Atirador de fuzil de precisão, de grande alcance. Forte contra infantaria, fraco contra cavalaria.',
  },
  machine_gunner: { id: 'machine_gunner',
    name: 'Metralhador', plural: 'Metralhadores', icon: '🏹', cls: 'archer',
    cost: { wood: 125, gold: 90 }, hp: 270, attack: 15, attackType: 'pierce',
    armor: { hack: 0.22, pierce: 0.32, crush: 0.17 }, range: 6, speed: 2, los: 10, trainTime: 22, pop: 2, radius: 0.28,
    tags: ['archer', 'human', 'military', 'ranged', 'gunpowder'], bonus: { infantry: 1.75 }, building: 'barracks', age: 7,
    line: 'ranged', tier: 7, lineOnly: true, attackInterval: 0.7,
    desc: 'Metralhadora: rajadas contínuas, devastadora contra infantaria; lenta e fraca contra cavalaria.',
  },
  thureophoros: { id: 'thureophoros',
    name: 'Tureóforo', plural: 'Tureóforos', icon: '🎯', cls: 'skirmisher',
    cost: { food: 45, wood: 45 }, hp: 100, attack: 7, attackType: 'pierce',
    armor: { hack: 0.12, pierce: 0.32, crush: 0.07 }, range: 3.5, speed: 2.6, los: 8, trainTime: 14, pop: 2, radius: 0.28,
    tags: ['skirmisher', 'human', 'military', 'ranged'], bonus: { archer: 1.8 }, building: 'barracks', age: 2,
    line: 'skirmisher', tier: 2, lineOnly: true,
    desc: 'Infantaria ligeira de escudo oval e dardos. Forte contra tiro, fraca contra infantaria e cavalaria.',
  },
  akritas: { id: 'akritas',
    name: 'Acrita', plural: 'Acritas', icon: '🎯', cls: 'skirmisher',
    cost: { food: 50, wood: 50 }, hp: 120, attack: 9, attackType: 'pierce',
    armor: { hack: 0.14, pierce: 0.34, crush: 0.09 }, range: 4, speed: 2.6, los: 8, trainTime: 15, pop: 2, radius: 0.28,
    tags: ['skirmisher', 'human', 'military', 'ranged'], bonus: { archer: 1.8 }, building: 'barracks', age: 3,
    line: 'skirmisher', tier: 3, lineOnly: true,
    desc: 'Guarda de fronteira bizantino de dardos. Forte contra tiro, fraco contra infantaria e cavalaria.',
  },
  rodelero: { id: 'rodelero',
    name: 'Rodeleiro', plural: 'Rodeleiros', icon: '🎯', cls: 'skirmisher',
    cost: { food: 55, wood: 55 }, hp: 145, attack: 9, attackType: 'hack',
    armor: { hack: 0.16, pierce: 0.36, crush: 0.11 }, range: 0.6, speed: 2.8, los: 8, trainTime: 16, pop: 2, radius: 0.28,
    tags: ['skirmisher', 'human', 'military'], bonus: { archer: 1.8 }, building: 'barracks', age: 4,
    line: 'skirmisher', tier: 4, lineOnly: true, attackInterval: 1,
    desc: 'Espadachim de rodela que avança sobre os atiradores. Forte contra tiro, fraco contra infantaria e cavalaria.',
  },
  chasseur: { id: 'chasseur',
    name: 'Caçador', plural: 'Caçadores', icon: '🎯', cls: 'skirmisher',
    cost: { food: 60, wood: 60 }, hp: 175, attack: 21, attackType: 'pierce',
    armor: { hack: 0.18, pierce: 0.38, crush: 0.13 }, range: 5, speed: 2.6, los: 8, trainTime: 17, pop: 2, radius: 0.28,
    tags: ['skirmisher', 'human', 'military', 'ranged', 'gunpowder'], bonus: { archer: 1.8 }, building: 'barracks', age: 5,
    line: 'skirmisher', tier: 5, lineOnly: true, attackInterval: 2,
    desc: 'Caçador de carabina, móvel e preciso. Forte contra tiro, fraco contra infantaria e cavalaria.',
  },
  light_infantry: { id: 'light_infantry',
    name: 'Infantaria Ligeira', plural: 'Infantaria Ligeira', icon: '🎯', cls: 'skirmisher',
    cost: { food: 65, wood: 65 }, hp: 210, attack: 22, attackType: 'pierce',
    armor: { hack: 0.2, pierce: 0.4, crush: 0.15 }, range: 5, speed: 2.6, los: 8, trainTime: 18, pop: 2, radius: 0.28,
    tags: ['skirmisher', 'human', 'military', 'ranged', 'gunpowder'], bonus: { archer: 1.8 }, building: 'barracks', age: 6,
    line: 'skirmisher', tier: 6, lineOnly: true, attackInterval: 1.8,
    desc: 'Infantaria ligeira de fuzil. Forte contra tiro, fraca contra infantaria e cavalaria.',
  },
  commando: { id: 'commando',
    name: 'Comando', plural: 'Comandos', icon: '🎯', cls: 'skirmisher',
    cost: { food: 70, wood: 70 }, hp: 255, attack: 21, attackType: 'pierce',
    armor: { hack: 0.22, pierce: 0.42, crush: 0.17 }, range: 4.5, speed: 2.8, los: 8, trainTime: 19, pop: 2, radius: 0.28,
    tags: ['skirmisher', 'human', 'military', 'ranged', 'gunpowder'], bonus: { archer: 1.8 }, building: 'barracks', age: 7,
    line: 'skirmisher', tier: 7, lineOnly: true, attackInterval: 1.4,
    desc: 'Tropa de assalto de elite, rápida. Forte contra tiro, fraca contra infantaria e cavalaria.',
  },
  cataphract: { id: 'cataphract',
    name: 'Catafracto', plural: 'Catafractos', icon: '🐎', cls: 'cavalry',
    cost: { food: 110, gold: 90 }, hp: 230, attack: 17, attackType: 'hack',
    armor: { hack: 0.27, pierce: 0.32, crush: 0.12 }, range: 0.7, speed: 3.4, los: 8, trainTime: 23, pop: 3, radius: 0.36,
    tags: ['cavalry', 'human', 'military'], bonus: { archer: 1.5, skirmisher: 1.5, siege: 1.5 }, building: 'stable', age: 3,
    line: 'cavalry', tier: 3, lineOnly: true,
    desc: 'Cavalaria couraçada bizantina, cavalo e cavaleiro de malha. Forte contra tiro e cerco, fraca contra infantaria pesada.',
  },
  cuirassier: { id: 'cuirassier',
    name: 'Couraceiro', plural: 'Couraceiros', icon: '🐎', cls: 'cavalry',
    cost: { food: 120, gold: 95 }, hp: 275, attack: 20, attackType: 'hack',
    armor: { hack: 0.29, pierce: 0.34, crush: 0.14 }, range: 0.7, speed: 3.4, los: 8, trainTime: 24, pop: 3, radius: 0.36,
    tags: ['cavalry', 'human', 'military'], bonus: { archer: 1.5, skirmisher: 1.5, siege: 1.5 }, building: 'stable', age: 4,
    line: 'cavalry', tier: 4, lineOnly: true,
    desc: 'Cavalaria de couraça de aço. Forte contra tiro e cerco, fraca contra infantaria pesada.',
  },
  dragoon: { id: 'dragoon',
    name: 'Dragão', plural: 'Dragões', icon: '🐎', cls: 'cavalry',
    cost: { food: 135, gold: 105 }, hp: 330, attack: 44, attackType: 'pierce',
    armor: { hack: 0.31, pierce: 0.36, crush: 0.16 }, range: 3.5, speed: 3.4, los: 8, trainTime: 25, pop: 3, radius: 0.36,
    tags: ['cavalry', 'human', 'military', 'ranged', 'gunpowder'], bonus: { archer: 1.5, skirmisher: 1.5, siege: 1.5 }, building: 'stable', age: 5,
    line: 'cavalry', tier: 5, lineOnly: true, attackInterval: 2,
    desc: 'Infantaria montada de carabina. Forte contra tiro e cerco, fraca contra infantaria pesada.',
  },
  lancer: { id: 'lancer',
    name: 'Lanceiro', plural: 'Lanceiros', icon: '🐎', cls: 'cavalry',
    cost: { food: 145, gold: 115 }, hp: 395, attack: 29, attackType: 'hack',
    armor: { hack: 0.33, pierce: 0.38, crush: 0.18 }, range: 0.7, speed: 3.4, los: 8, trainTime: 26, pop: 3, radius: 0.36,
    tags: ['cavalry', 'human', 'military'], bonus: { archer: 1.5, skirmisher: 1.5, siege: 1.5 }, building: 'stable', age: 6,
    line: 'cavalry', tier: 6, lineOnly: true,
    desc: 'Lanceiro montado de carga. Forte contra tiro e cerco, fraco contra infantaria pesada.',
  },
  tank: { id: 'tank',
    name: 'Tanque', plural: 'Tanques', icon: '🛡️', cls: 'cavalry',
    cost: { food: 240, gold: 195, oil: 120 }, hp: 710, attack: 79, attackType: 'crush',
    armor: { hack: 0.5, pierce: 0.7, crush: 0.35 }, range: 5, speed: 3, los: 9, trainTime: 27, pop: 3, radius: 0.45,
    tags: ['cavalry', 'military', 'ranged', 'gunpowder', 'mechanical'], bonus: { archer: 1.5, skirmisher: 1.5, siege: 1.5, building: 1.5 }, building: 'stable', age: 7,
    line: 'cavalry', tier: 7, lineOnly: true, attackInterval: 2.5,
    desc: 'Blindado de canhão: muita vida e armadura, forte contra tiro, cerco e edifícios; fraco contra infantaria antitanque. Gasta petróleo.',
  },
  athanatos: { id: 'athanatos',
    name: 'Atânato', plural: 'Atânatos', icon: '🗡️', cls: 'infantry',
    cost: { food: 100, gold: 75 }, hp: 240, attack: 20, attackType: 'hack',
    armor: { hack: 0.37, pierce: 0.37, crush: 0.17 }, range: 0.6, speed: 2.4, los: 8, trainTime: 19, pop: 2, radius: 0.3,
    tags: ['infantry', 'human', 'military'], bonus: { cavalry: 1.5, myth: 1.25 }, building: 'fortress', age: 3,
    line: 'elite', tier: 3, lineOnly: true,
    desc: 'Os Imortais da guarda bizantina. Infantaria de elite, com dano extra contra criaturas míticas.',
  },
  knight_of_rhodes: { id: 'knight_of_rhodes',
    name: 'Cavaleiro de Rodes', plural: 'Cavaleiros de Rodes', icon: '🗡️', cls: 'infantry',
    cost: { food: 110, gold: 85 }, hp: 290, attack: 24, attackType: 'hack',
    armor: { hack: 0.39, pierce: 0.39, crush: 0.19 }, range: 0.6, speed: 2.4, los: 8, trainTime: 20, pop: 2, radius: 0.3,
    tags: ['infantry', 'human', 'military'], bonus: { cavalry: 1.5, myth: 1.25 }, building: 'fortress', age: 4,
    line: 'elite', tier: 4, lineOnly: true,
    desc: 'Cavaleiro hospitalário de armadura completa. Infantaria de elite, com dano extra contra criaturas míticas.',
  },
  guard_grenadier: { id: 'guard_grenadier',
    name: 'Granadeiro da Guarda', plural: 'Granadeiros da Guarda', icon: '🗡️', cls: 'infantry',
    cost: { food: 120, gold: 95 }, hp: 345, attack: 65, attackType: 'crush',
    armor: { hack: 0.41, pierce: 0.41, crush: 0.21 }, range: 3, speed: 2.4, los: 8, trainTime: 21, pop: 2, radius: 0.3,
    tags: ['infantry', 'human', 'military', 'ranged', 'gunpowder'], bonus: { cavalry: 1.5, myth: 1.25 }, building: 'fortress', age: 5,
    line: 'elite', tier: 5, lineOnly: true, attackInterval: 2.2, splash: 0.8,
    desc: 'Granadeiros da guarda, com dano em área. Elite, com dano extra contra criaturas míticas.',
  },
  evzone: { id: 'evzone',
    name: 'Evzone', plural: 'Evzones', icon: '🗡️', cls: 'infantry',
    cost: { food: 130, gold: 100 }, hp: 415, attack: 63, attackType: 'pierce',
    armor: { hack: 0.43, pierce: 0.43, crush: 0.23 }, range: 4.5, speed: 2.6, los: 8, trainTime: 22, pop: 2, radius: 0.3,
    tags: ['infantry', 'human', 'military', 'ranged', 'gunpowder'], bonus: { cavalry: 1.5, myth: 1.25 }, building: 'fortress', age: 6,
    line: 'elite', tier: 6, lineOnly: true, attackInterval: 1.8,
    desc: 'A guarda de elite grega, de saiote e fuzil. Elite, com dano extra contra criaturas míticas.',
  },
  sacred_band: { id: 'sacred_band',
    name: 'Batalhão Sagrado', plural: 'Batalhão Sagrado', icon: '🗡️', cls: 'infantry',
    cost: { food: 145, gold: 115 }, hp: 500, attack: 59, attackType: 'pierce',
    armor: { hack: 0.45, pierce: 0.45, crush: 0.25 }, range: 4.5, speed: 2.6, los: 8, trainTime: 23, pop: 2, radius: 0.3,
    tags: ['infantry', 'human', 'military', 'ranged', 'gunpowder'], bonus: { cavalry: 1.5, myth: 1.25 }, building: 'fortress', age: 7,
    line: 'elite', tier: 7, lineOnly: true, attackInterval: 1.4,
    desc: 'Os comandos herdeiros do Batalhão Sagrado de Tebas. Elite, com dano extra contra criaturas míticas.',
  },
  trebuchet: { id: 'trebuchet',
    name: 'Trabuco', plural: 'Trabucos', icon: '🪨', cls: 'siege',
    cost: { wood: 165, gold: 110 }, hp: 145, attack: 36, attackType: 'crush',
    armor: { hack: 0.07, pierce: 0.52, crush: 0.12 }, range: 9, speed: 1.1, los: 9, trainTime: 31, pop: 4, radius: 0.4,
    tags: ['siege', 'military', 'ranged'], bonus: { building: 5 }, building: 'siege_workshop', age: 3,
    line: 'artillery', tier: 3, lineOnly: true,
    desc: 'Trabuco de contrapeso, de alcance enorme. Devastador contra edifícios, frágil contra cavalaria.',
  },
  bombard: { id: 'bombard',
    name: 'Bombarda', plural: 'Bombardas', icon: '🪨', cls: 'siege',
    cost: { wood: 180, gold: 120 }, hp: 175, attack: 58, attackType: 'crush',
    armor: { hack: 0.09, pierce: 0.54, crush: 0.14 }, range: 8, speed: 1.2, los: 9, trainTime: 32, pop: 4, radius: 0.4,
    tags: ['siege', 'military', 'ranged', 'gunpowder'], bonus: { building: 6 }, building: 'siege_workshop', age: 4,
    line: 'artillery', tier: 4, lineOnly: true, attackInterval: 4,
    desc: 'Canhão de cerco pesado. Derruba muralhas; lento e frágil contra cavalaria.',
  },
  field_gun: { id: 'field_gun',
    name: 'Canhão de Campanha', plural: 'Canhões de Campanha', icon: '🪨', cls: 'siege',
    cost: { wood: 200, gold: 135 }, hp: 205, attack: 60, attackType: 'crush',
    armor: { hack: 0.11, pierce: 0.56, crush: 0.16 }, range: 9, speed: 1.6, los: 9, trainTime: 33, pop: 4, radius: 0.4,
    tags: ['siege', 'military', 'ranged', 'gunpowder'], bonus: { building: 3 }, building: 'siege_workshop', age: 5,
    line: 'artillery', tier: 5, lineOnly: true, attackInterval: 3.5, splash: 1,
    desc: 'Canhão leve de campanha, com metralha em área. Bom contra tropas e edifícios, frágil contra cavalaria.',
  },
  howitzer: { id: 'howitzer',
    name: 'Obus', plural: 'Obuses', icon: '🪨', cls: 'siege',
    cost: { wood: 220, gold: 145, oil: 40 }, hp: 250, attack: 83, attackType: 'crush',
    armor: { hack: 0.13, pierce: 0.58, crush: 0.18 }, range: 11, speed: 1.6, los: 9, trainTime: 34, pop: 4, radius: 0.4,
    tags: ['siege', 'military', 'ranged', 'gunpowder'], bonus: { building: 3 }, building: 'siege_workshop', age: 6,
    line: 'artillery', tier: 6, lineOnly: true, attackInterval: 4, splash: 1.4,
    desc: 'Obus de tiro curvo e alcance longo, com dano em área. Frágil contra cavalaria. Gasta petróleo.',
  },
  self_propelled_gun: { id: 'self_propelled_gun',
    name: 'Artilharia Autopropulsada', plural: 'Artilharias Autopropulsadas', icon: '🪨', cls: 'siege',
    cost: { wood: 240, gold: 160, oil: 100 }, hp: 450, attack: 87, attackType: 'crush',
    armor: { hack: 0.4, pierce: 0.6, crush: 0.25 }, range: 11, speed: 2.4, los: 9, trainTime: 35, pop: 4, radius: 0.45,
    tags: ['siege', 'military', 'ranged', 'gunpowder', 'mechanical'], bonus: { building: 3 }, building: 'siege_workshop', age: 7,
    line: 'artillery', tier: 7, lineOnly: true, attackInterval: 3.5, splash: 1.4,
    desc: 'Canhão sobre lagartas, blindado e mais rápido que a artilharia rebocada. Dano em área a grande distância. Gasta petróleo.',
  },
  covered_ram: { id: 'covered_ram',
    name: 'Aríete Coberto', plural: 'Aríetes Cobertos', icon: '🏗️', cls: 'siege',
    cost: { wood: 275, gold: 220 }, hp: 480, attack: 54, attackType: 'crush',
    armor: { hack: 0.3, pierce: 0.75, crush: 0.15 }, range: 0.8, speed: 1.3, los: 9, trainTime: 41, pop: 5, radius: 0.5,
    tags: ['siege', 'military'], bonus: { building: 5 }, building: 'siege_workshop', age: 3,
    line: 'assault', tier: 3, lineOnly: true,
    desc: 'Aríete sob um telhado de couro molhado: corpo a corpo, resiste a flechas e derruba portões. A pólvora o aposenta.',
  },
  greek_fire_siphon: { id: 'greek_fire_siphon',
    name: 'Sifão de Fogo Grego', plural: 'Sifões de Fogo Grego', icon: '🔥', cls: 'siege',
    cost: { wood: 120, gold: 80, oil: 50 }, hp: 180, attack: 20, attackType: 'crush',
    armor: { hack: 0.2, pierce: 0.5, crush: 0.1 }, range: 2.5, speed: 1.6, los: 8, trainTime: 30, pop: 3, radius: 0.4,
    tags: ['siege', 'military', 'ranged', 'fire'], bonus: { building: 2 }, building: 'siege_workshop', age: 3,
    line: 'greek_fire', tier: 3, lineOnly: true, attackInterval: 2, splash: 1.2,
    desc: 'Sifão de fogo grego: jato de chamas de curto alcance, com dano em área contra tropas e edifícios. Gasta petróleo; a pólvora o aposenta.',
  },
```

Inglês, para colar em `EN_UNITS` (`src/i18n/en-data.ts`) no passo A6:

```ts
  prodromos: { name: 'Prodromos', plural: 'Prodromoi', desc: 'Vanguard rider of the Hellenistic armies. Fast and far-sighted; weak in combat.' },
  trapezites: { name: 'Trapezites', plural: 'Trapezitai', desc: 'Byzantine border rider trained for ambushes. Fast and far-sighted; weak in combat.' },
  stradiot: { name: 'Stradiot', plural: 'Stradiots', desc: 'Light Greek horseman in Venetian service. Fast and far-sighted; weak in combat.' },
  hussar: { name: 'Hussar', plural: 'Hussars', desc: 'Sabre-armed light cavalry. Fast and far-sighted; weak against line troops.' },
  mounted_scout: { name: 'Mounted Scout', plural: 'Mounted Scouts', desc: 'Carbine scout: shoots at short range while scouting; weak in a long fight.' },
  motorcyclist: { name: 'Motorcyclist', plural: 'Motorcyclists', desc: 'Motorized scout with a submachine gun, very fast. Costs oil.' },
  phalangite: { name: 'Phalangite', plural: 'Phalangites', desc: 'Sarissa infantry of the Macedonian phalanx. Strong against cavalry, weak against missile troops.' },
  skoutatos: { name: 'Skoutatos', plural: 'Skoutatoi', desc: 'Byzantine heavy infantry with oval shield and spear. Strong against cavalry, weak against missile troops.' },
  pikeman: { name: 'Pikeman', plural: 'Pikemen', desc: 'Steel-cuirassed pikeman. Strong against cavalry, weak against missile troops.' },
  grenadier: { name: 'Grenadier', plural: 'Grenadiers', desc: 'Throws grenades at short range, with area damage. Strong against cavalry, weak against missile troops.' },
  fusilier: { name: 'Fusilier', plural: 'Fusiliers', desc: 'Line infantry with rifle and bayonet. Strong against cavalry, weak against missile troops.' },
  modern_infantry: { name: 'Infantry', plural: 'Infantry', desc: 'Steel-helmeted infantry with anti-tank weapons: double damage against cavalry and tanks.' },
  rhodian_slinger: { name: 'Rhodian Slinger', plural: 'Rhodian Slingers', desc: 'Rhodian slinger with long range. Strong against infantry, weak against cavalry.' },
  byzantine_archer: { name: 'Byzantine Archer', plural: 'Byzantine Archers', desc: 'Byzantine composite-bow archer. Strong against infantry, weak against cavalry.' },
  arquebusier: { name: 'Arquebusier', plural: 'Arquebusiers', desc: 'Arquebus shooter: slow, heavy shots. Strong against infantry, weak against cavalry.' },
  musketeer: { name: 'Musketeer', plural: 'Musketeers', desc: 'Line musketeer. Strong against infantry, weak against cavalry.' },
  sharpshooter: { name: 'Sharpshooter', plural: 'Sharpshooters', desc: 'Precision rifleman with great range. Strong against infantry, weak against cavalry.' },
  machine_gunner: { name: 'Machine Gunner', plural: 'Machine Gunners', desc: 'Machine gun: continuous bursts, devastating against infantry; slow and weak against cavalry.' },
  thureophoros: { name: 'Thureophoros', plural: 'Thureophoroi', desc: 'Light infantry with oval shield and javelins. Strong against missile troops, weak against infantry and cavalry.' },
  akritas: { name: 'Akritas', plural: 'Akritai', desc: 'Byzantine border guard with javelins. Strong against missile troops, weak against infantry and cavalry.' },
  rodelero: { name: 'Rodelero', plural: 'Rodeleros', desc: 'Sword-and-buckler man who charges the shooters. Strong against missile troops, weak against infantry and cavalry.' },
  chasseur: { name: 'Chasseur', plural: 'Chasseurs', desc: 'Mobile, accurate carbine skirmisher. Strong against missile troops, weak against infantry and cavalry.' },
  light_infantry: { name: 'Light Infantry', plural: 'Light Infantry', desc: 'Rifle-armed light infantry. Strong against missile troops, weak against infantry and cavalry.' },
  commando: { name: 'Commando', plural: 'Commandos', desc: 'Fast elite assault troops. Strong against missile troops, weak against infantry and cavalry.' },
  cataphract: { name: 'Cataphract', plural: 'Cataphracts', desc: 'Byzantine armored cavalry, horse and rider in mail. Strong against missile troops and siege, weak against heavy infantry.' },
  cuirassier: { name: 'Cuirassier', plural: 'Cuirassiers', desc: 'Steel-cuirassed cavalry. Strong against missile troops and siege, weak against heavy infantry.' },
  dragoon: { name: 'Dragoon', plural: 'Dragoons', desc: 'Mounted infantry with carbines. Strong against missile troops and siege, weak against heavy infantry.' },
  lancer: { name: 'Lancer', plural: 'Lancers', desc: 'Charging mounted lancer. Strong against missile troops and siege, weak against heavy infantry.' },
  tank: { name: 'Tank', plural: 'Tanks', desc: 'Armored gun vehicle: high health and armor, strong against missile troops, siege and buildings; weak against anti-tank infantry. Costs oil.' },
  athanatos: { name: 'Athanatos', plural: 'Athanatoi', desc: 'The Immortals of the Byzantine guard. Elite infantry with bonus damage against mythic creatures.' },
  knight_of_rhodes: { name: 'Knight of Rhodes', plural: 'Knights of Rhodes', desc: 'Hospitaller knight in full armor. Elite infantry with bonus damage against mythic creatures.' },
  guard_grenadier: { name: 'Guard Grenadier', plural: 'Guard Grenadiers', desc: 'Guard grenadiers with area damage. Elite, with bonus damage against mythic creatures.' },
  evzone: { name: 'Evzone', plural: 'Evzones', desc: 'The Greek elite guard, in kilt and with rifle. Elite, with bonus damage against mythic creatures.' },
  sacred_band: { name: 'Sacred Band', plural: 'Sacred Band', desc: 'Commando heirs of the Sacred Band of Thebes. Elite, with bonus damage against mythic creatures.' },
  trebuchet: { name: 'Trebuchet', plural: 'Trebuchets', desc: 'Counterweight trebuchet with enormous range. Devastating against buildings, fragile against cavalry.' },
  bombard: { name: 'Bombard', plural: 'Bombards', desc: 'Heavy siege cannon. Brings down walls; slow and fragile against cavalry.' },
  field_gun: { name: 'Field Gun', plural: 'Field Guns', desc: 'Light field cannon with area canister. Good against troops and buildings, fragile against cavalry.' },
  howitzer: { name: 'Howitzer', plural: 'Howitzers', desc: 'Long-range, high-angle howitzer with area damage. Fragile against cavalry. Costs oil.' },
  self_propelled_gun: { name: 'Self-Propelled Gun', plural: 'Self-Propelled Guns', desc: 'Tracked, armored gun, faster than towed artillery. Area damage at great range. Costs oil.' },
  covered_ram: { name: 'Covered Ram', plural: 'Covered Rams', desc: 'Ram under a roof of wet hides: melee, shrugs off arrows and breaks gates. Gunpowder retires it.' },
  greek_fire_siphon: { name: 'Greek Fire Siphon', plural: 'Greek Fire Siphons', desc: 'Greek fire siphon: short-range jet of flame with area damage against troops and buildings. Costs oil; gunpowder retires it.' },
```

### As 12 unidades de hoje que viram degraus

Fica **tudo igual**: id, atributos, custo, `age`, `building`, `hotkey` e lugar nos `trains`. Só entram `line` e `tier`.

| id | `line` | `tier` | `age` (fica) | Com linhas (partida rápida) | Elenco clássico (campanha, Horda, cenários) |
|---|---|---|---|---|---|
| `villager` | `citizen` | 0 | 0 | base; não troca de tipo; evolui por efeitos | igual a hoje |
| `kataskopos` | `scout` | 0 | 0 | base (CC e Estábulo, W) | igual a hoje |
| `hoplite` | `heavy_infantry` | 0 | 0 | base (Quartel e Fortaleza, Q) | igual a hoje |
| `hypaspist` | `heavy_infantry` | 1 | 2 | só por evolução (estudo da Era II) | treina direto da Helenística, como hoje |
| `toxotes` | `ranged` | 0 | 0 | base (Quartel e Fortaleza, W) | igual a hoje |
| `cretan_archer` | `ranged` | 1 | 2 | só por evolução (estudo da Era II) | como hoje |
| `peltast` | `skirmisher` | 1 | 1 | base desde a II (Quartel, E) | igual a hoje |
| `hippeus` | `cavalry` | 1 | 1 | base desde a II (Estábulo e Fortaleza, E) | igual a hoje |
| `hetairoi` | `cavalry` | 2 | 2 | só por evolução (estudo da Era III) | como hoje |
| `myrmidon` | `elite` | 2 | 3 | base desde a III, **só na Fortaleza** (Y) | Quartel e Fortaleza, na Bizantina, como hoje |
| `petrobolos` | `artillery` | 2 | 2 | base desde a III (Oficina, Q) | igual a hoje |
| `helepolis` | `assault` | 2 | 3 | base desde a III (Oficina, W); aposentada na V | Bizantina, como hoje |

### Estudos de evolução (50, gerados por `evolutions()`)

Todos ficam na `academy`, com `age` = Era do degrau e `prereq` = o estudo anterior da mesma linha (o primeiro da linha
não tem pré-requisito). O custo e o tempo dependem só da Era do estudo, `k` = `age`:

| `age` (Era) | sufixo do id | Conhecimento | Ouro (cidadãos: Comida) | Tempo |
|---|---|---|---|---|
| 1 (II) | `_2` | 100 | 90 | 33 s |
| 2 (III) | `_3` | 160 | 140 | 41 s |
| 3 (IV) | `_4` | 220 | 190 | 49 s |
| 4 (V) | `_5` | 280 | 240 | 57 s |
| 5 (VI) | `_6` | 340 | 290 | 65 s |
| 6 (VII) | `_7` | 400 | 340 | 73 s |
| 7 (VIII) | `_8` | 460 | 390 | 81 s |

Fórmulas: conhecimento = 40 + 60·k; ouro (ou comida) = 40 + 50·k; tempo = 25 + 8·k. A Ciência da Biblioteca barateia
como qualquer estudo (`techCost`).

| Linha | Estudos (id → degrau) | Quantos |
|---|---|---|
| `citizen` | `evo_citizen_2` … `evo_citizen_8` (o tipo continua `villager`) | 7 |
| `scout` | `evo_scout_3` → prodromos · `_4` → trapezites · `_5` → stradiot · `_6` → hussar · `_7` → mounted_scout · `_8` → motorcyclist | 6 |
| `heavy_infantry` | `evo_heavy_infantry_2` → hypaspist · `_3` → phalangite · `_4` → skoutatos · `_5` → pikeman · `_6` → grenadier · `_7` → fusilier · `_8` → modern_infantry | 7 |
| `ranged` | `evo_ranged_2` → cretan_archer · `_3` → rhodian_slinger · `_4` → byzantine_archer · `_5` → arquebusier · `_6` → musketeer · `_7` → sharpshooter · `_8` → machine_gunner | 7 |
| `skirmisher` | `evo_skirmisher_3` → thureophoros · `_4` → akritas · `_5` → rodelero · `_6` → chasseur · `_7` → light_infantry · `_8` → commando | 6 |
| `cavalry` | `evo_cavalry_3` → hetairoi · `_4` → cataphract · `_5` → cuirassier · `_6` → dragoon · `_7` → lancer · `_8` → tank | 6 |
| `elite` | `evo_elite_4` → athanatos · `_5` → knight_of_rhodes · `_6` → guard_grenadier · `_7` → evzone · `_8` → sacred_band | 5 |
| `artillery` | `evo_artillery_4` → trebuchet · `_5` → bombard · `_6` → field_gun · `_7` → howitzer · `_8` → self_propelled_gun | 5 |
| `assault` | `evo_assault_4` → covered_ram | 1 |
| `greek_fire` | nenhum (degrau único) | 0 |

Nomes: PT `"<nome da linha>: <nome do degrau>"` (por exemplo, "Infantaria pesada: Falangita"); EN `"<line>: <unit>"`
("Heavy Infantry: Phalangite"). Descrição PT: `Treina <plural do degrau> no lugar do degrau anterior; as unidades da linha que você já tem se transformam (vida proporcional, patente e ordens mantidas).`
EN: `Trains <plural> instead of the previous step; the line's units you already have are transformed (health in proportion, rank and orders kept).`

Estudos dos cidadãos (o mesmo efeito em todos: vida dos cidadãos ×1,10; coleta de comida, madeira, pedra e ouro ×1,04;
construção ×1,05):

| id | Era | Nome PT | Nome EN |
|---|---|---|---|
| `evo_citizen_2` | II | Cidadãos: Ferramentas de ferro | Citizens: Iron Tools |
| `evo_citizen_3` | III | Cidadãos: Artesãos | Citizens: Artisans |
| `evo_citizen_4` | IV | Cidadãos: Guildas | Citizens: Guilds |
| `evo_citizen_5` | V | Cidadãos: Ferramentas de aço | Citizens: Steel Tools |
| `evo_citizen_6` | VI | Cidadãos: Manufatura | Citizens: Manufacture |
| `evo_citizen_7` | VII | Cidadãos: Operários | Citizens: Factory Workers |
| `evo_citizen_8` | VIII | Cidadãos: Operários modernos | Citizens: Modern Workers |

Descrição: PT `Cidadãos +10% de vida; coleta de comida, madeira, pedra e ouro +4%; construção 5% mais rápida.` · EN
`Citizens +10% health; food, wood, stone and gold gathering +4%; building 5% faster.`

### Arte provisória (alias) e ícones

`UNIT_ART_ALIAS` (`src/render/art/alias.ts`, da E2): acrescente estas 41 entradas, sem tirar o `merchant` da E2.

```ts
  prodromos: 'kataskopos', trapezites: 'kataskopos', stradiot: 'hippeus', hussar: 'hippeus', mounted_scout: 'hippeus', motorcyclist: 'hippeus',
  phalangite: 'hypaspist', skoutatos: 'hypaspist', pikeman: 'hypaspist', grenadier: 'hypaspist', fusilier: 'hypaspist', modern_infantry: 'hypaspist',
  rhodian_slinger: 'cretan_archer', byzantine_archer: 'cretan_archer', arquebusier: 'cretan_archer', musketeer: 'cretan_archer', sharpshooter: 'cretan_archer', machine_gunner: 'cretan_archer',
  thureophoros: 'peltast', akritas: 'peltast', rodelero: 'peltast', chasseur: 'peltast', light_infantry: 'peltast', commando: 'peltast',
  cataphract: 'hetairoi', cuirassier: 'hetairoi', dragoon: 'hetairoi', lancer: 'hetairoi', tank: 'helepolis', athanatos: 'myrmidon',
  knight_of_rhodes: 'myrmidon', guard_grenadier: 'myrmidon', evzone: 'myrmidon', sacred_band: 'myrmidon', trebuchet: 'petrobolos', bombard: 'petrobolos',
  field_gun: 'petrobolos', howitzer: 'petrobolos', self_propelled_gun: 'petrobolos', covered_ram: 'helepolis', greek_fire_siphon: 'petrobolos',
```

Ícones dos estudos (`scripts/bake/hud/catalog.mjs`, `TECH_ICONS`): um por linha que tem estudo (9; o `greek_fire` não
tem estudo e por isso **não** ganha ícone, senão o teste acusa ícone órfão):

| chave | modelo | enquadramento |
|---|---|---|
| `evo_citizen` | `villager` | busto (`{ mode: 'bust', frac: 0.74, margin: 0.03 }`) |
| `evo_scout` | `kataskopos` | corpo inteiro (`{ margin: 0.04 }`) |
| `evo_heavy_infantry` | `hypaspist` | busto |
| `evo_ranged` | `cretan_archer` | busto |
| `evo_skirmisher` | `peltast` | busto |
| `evo_cavalry` | `hetairoi` | corpo inteiro |
| `evo_elite` | `myrmidon` | busto |
| `evo_artillery` | `petrobolos` | corpo inteiro |
| `evo_assault` | `helepolis` | corpo inteiro |

### Textos de interface novos (`src/i18n/strings.ts`, PT e EN, sem emoji)

| Chave | PT | EN |
|---|---|---|
| `err.legacyRoster` | Este cenário usa o elenco clássico: sem linhas de unidade. | This scenario uses the classic roster: no unit lines. |
| `err.lineRetired` | {line}: aposentada a partir da {age}. | {line}: retired from the {age} on. |
| `sel.line` | Linha | Line |
| `cmd.lineTip` | Linha {line}: evolui na Biblioteca. | {line} line: evolves at the Library. |

---

## Passo a passo

Rode `npm run -s typecheck` no fim de cada passo (ele cobre `src`, `tests` e `scripts`). No fim de cada bloco, os testes
que o bloco manda conferir ficam verdes. O `npm test` **inteiro** só fica verde depois do bloco E, e isso é esperado:
- do passo A4 até o D1, `tests/art-etapa6.test.ts` (os 35 tipos com manifesto) e `tests/hud-icons.test.ts` (`unit/<id>`)
  acusam as 41 unidades novas, que só entram no alias no D1;
- do passo A5 até o E3, `tests/hud-icons.test.ts` acusa os 50 estudos sem ícone (`tech/evo_*`);
- do passo B1 até o D3, `tests/fx-registry.test.ts` acusa o tipo `'evolve'` (o núcleo já o emite em
  `src/core/sim/lines.ts`, mas ele só entra em `EFFECT_TYPES`/`FX_HANDLERS` no D3);
- do passo A4 até o C3, o `it` da IA de `tests/unit-lines.test.ts` não roda (o arquivo é criado no B9 e o `it` da IA
  só é conferido no C4).

Se fizer um commit por bloco, escreva na mensagem quais desses testes ainda estão vermelhos.

### Bloco 0 — Preparação

- [ ] **0.1. Confira as pré-condições.** Cada comando tem de achar algo; se algum vier vazio, pare e conclua a E1/E2:
  ```sh
  grep -n "ERA_TITANS" src/core/data/ages.ts
  grep -n "export function queueMaxOf" src/core/sim/commands.ts
  grep -n "export function isScenarioConfig" src/core/sim/restrictions.ts
  grep -n "export function rowOf" src/ui/studytree.ts
  grep -n "export.*studyTreeModel" src/ui/studytree.ts
  grep -n "export function grantStartingEras" src/core/sim/game.ts
  grep -n "export const unitArtType" src/render/art/alias.ts
  grep -n "UNIT_ART_ALIAS" src/render/art/alias.ts
  grep -n "'stone'" src/core/constants.ts && grep -n "'oil'" src/core/constants.ts
  grep -n "SIM_VERSION =" src/core/constants.ts
  ```
  Anote o valor de `SIM_VERSION`; ele sobe 1 no passo B8.
- [ ] **0.2. Registre o "antes"** (não commitar):
  ```sh
  npm run -s balance 60 1,2,3 > /tmp/e3-balance-antes.txt
  npx tsx scripts/missions.ts > /tmp/e3-missions-antes.txt 2>&1
  npx tsx scripts/horde.ts > /tmp/e3-horde-antes.txt
  npm run -s smoke 20 42 | tail -5 > /tmp/e3-smoke-antes.txt
  ```
  - `scripts/missions.ts` leva uns 12 minutos; o `balance 60` leva alguns minutos.
  - É `balance 60` (não 35) porque as evoluções pesam mais nas Eras V–VIII, que só aparecem depois dos 35 min
    (ritmo alvo de `docs/ERAS.md` §1; a E2 também mede com 60).

### Bloco A — Tipos e dados

- [ ] **A1. `src/core/types.ts`.**
  - Na interface `UnitDef`, depois de `splash?: number; canGather?: boolean; canBuild?: boolean;`, acrescente:
    ```ts
    line?: string; tier?: number;          // E3: linha de unidade (src/core/data/lines.ts) e degrau = Era do degrau (0–7)
    lineOnly?: boolean;                    // E3: degrau novo — só existe com as linhas ligadas (fora do elenco clássico)
    attackInterval?: number;               // E3: segundos entre ataques (armas de fogo); padrão ATTACK_INTERVAL[cls]
    ```
  - Em `TechDef`, depois de `line?: string; level?: number; god?: string;`, acrescente:
    ```ts
    evolve?: { line: string; to: string };   // E3: estudo de evolução da Biblioteca (a Era é `age`); sem `line` de propósito
    ```
  - Em `GameConfig`, depois de `startingAge?: number; startingResources?: …;`, numa linha própria:
    ```ts
    unitLines?: boolean;   // E3: linhas de unidade; padrão ligadas fora de cenário e desligadas em cenário (elenco clássico)
    ```
- [ ] **A2. `src/core/data/lines.ts` (novo).** O arquivo inteiro:
  ```ts
  // Linhas de unidade (E3; docs/ERAS.md §4 e docs/eras/E3-linhas-de-unidade.md). Cada linha tem um degrau por Era
  // (índice = Era: 0 = I … 7 = VIII; null = nenhum degrau novo naquela Era, o anterior continua). O primeiro degrau não
  // nulo é a BASE: treina sem estudo desde aquela Era. Cada degrau seguinte é liberado pelo estudo evo_<linha>_<Era+1> da
  // Biblioteca (src/core/data/techs.ts), em sequência; ao terminar, as unidades da linha se transformam
  // (src/core/sim/lines.ts). Nome em PT aqui; EN em src/i18n/en-data.ts (EN_LINES). Só valem com as linhas ligadas
  // (unitLinesOn): a campanha e os cenários usam o elenco clássico (os trains de src/core/data/buildings.ts).
  export interface LineDef {
    id: string;
    name: string;
    /** Edifícios que treinam a linha com as linhas ligadas (o 1º é o `building` dos degraus novos). */
    buildings: string[];
    /** Tecla de treino da linha nesses edifícios (única por edifício; nunca A, R ou U). */
    hotkey: string;
    /** Um degrau por Era (AGES.length posições). */
    steps: (string | null)[];
    /** Da Era retireAt em diante a linha não treina mais (as unidades que já existem continuam). */
    retireAt?: number;
    /** Só na linha dos cidadãos (o tipo não muda): nome PT de cada estudo, pela Era. */
    studyNames?: (string | null)[];
  }

  export const LINES: Record<string, LineDef> = {
    citizen: { id: 'citizen', name: 'Cidadãos', buildings: ['town_center'], hotkey: 'Q',
      steps: ['villager', 'villager', 'villager', 'villager', 'villager', 'villager', 'villager', 'villager'],
      studyNames: [null, 'Ferramentas de ferro', 'Artesãos', 'Guildas', 'Ferramentas de aço', 'Manufatura', 'Operários', 'Operários modernos'] },
    scout: { id: 'scout', name: 'Batedores', buildings: ['town_center', 'stable'], hotkey: 'W',
      steps: ['kataskopos', null, 'prodromos', 'trapezites', 'stradiot', 'hussar', 'mounted_scout', 'motorcyclist'] },
    heavy_infantry: { id: 'heavy_infantry', name: 'Infantaria pesada', buildings: ['barracks', 'fortress'], hotkey: 'Q',
      steps: ['hoplite', 'hypaspist', 'phalangite', 'skoutatos', 'pikeman', 'grenadier', 'fusilier', 'modern_infantry'] },
    ranged: { id: 'ranged', name: 'Tiro', buildings: ['barracks', 'fortress'], hotkey: 'W',
      steps: ['toxotes', 'cretan_archer', 'rhodian_slinger', 'byzantine_archer', 'arquebusier', 'musketeer', 'sharpshooter', 'machine_gunner'] },
    skirmisher: { id: 'skirmisher', name: 'Escaramuça', buildings: ['barracks'], hotkey: 'E',
      steps: [null, 'peltast', 'thureophoros', 'akritas', 'rodelero', 'chasseur', 'light_infantry', 'commando'] },
    cavalry: { id: 'cavalry', name: 'Cavalaria', buildings: ['stable', 'fortress'], hotkey: 'E',
      steps: [null, 'hippeus', 'hetairoi', 'cataphract', 'cuirassier', 'dragoon', 'lancer', 'tank'] },
    elite: { id: 'elite', name: 'Elite da Fortaleza', buildings: ['fortress'], hotkey: 'Y',
      steps: [null, null, 'myrmidon', 'athanatos', 'knight_of_rhodes', 'guard_grenadier', 'evzone', 'sacred_band'] },
    artillery: { id: 'artillery', name: 'Arremesso', buildings: ['siege_workshop'], hotkey: 'Q',
      steps: [null, null, 'petrobolos', 'trebuchet', 'bombard', 'field_gun', 'howitzer', 'self_propelled_gun'] },
    assault: { id: 'assault', name: 'Assalto a muralhas', buildings: ['siege_workshop'], hotkey: 'W', retireAt: 4,
      steps: [null, null, 'helepolis', 'covered_ram', null, null, null, null] },
    greek_fire: { id: 'greek_fire', name: 'Fogo grego', buildings: ['siege_workshop'], hotkey: 'E', retireAt: 4,
      steps: [null, null, null, 'greek_fire_siphon', null, null, null, null] },
  };

  /** Ordem das linhas nos botões, na IA (desempate) e na árvore de estudos. */
  export const LINE_ORDER: readonly string[] = ['citizen', 'scout', 'heavy_infantry', 'ranged', 'skirmisher', 'cavalry', 'elite', 'artillery', 'assault', 'greek_fire'];
  /** Era da base da linha (o primeiro degrau não nulo). */
  export function lineStart(l: LineDef): number { return l.steps.findIndex((s) => s !== null); }
  /** Id do estudo que libera o degrau da Era `era` (índice 0–7) da linha: evo_<linha>_<número da Era> (como civic3 = Era III). */
  export function evoTechId(line: string, era: number): string { return `evo_${line}_${era + 1}`; }
  ```
- [ ] **A3. `src/core/data/index.ts`:** acrescente a linha `export * from './lines';`.
- [ ] **A4. `src/core/data/units.ts`.**
  1. Nas 12 unidades da tabela "As 12 unidades de hoje", acrescente `line` e `tier` logo depois do `age` de cada uma.
     Por exemplo, no `hoplite`: `building: 'barracks', age: 0, line: 'heavy_infantry', tier: 0, hotkey: 'Q',`. **Não**
     mude mais nada nelas.
  2. Cole o bloco "Código pronto" das 41 unidades depois da entrada `militia` e antes do comentário
     `// ---------------- Heróis ----------------`, sob o comentário
     `// ---------------- Degraus novos das linhas (E3; só com as linhas ligadas: lineOnly) ----------------`.
  3. Em `UNIT_TAGS`, acrescente `'gunpowder', 'mechanical', 'fire'` no fim.

  Confira: `npm run -s typecheck`. O `oil` nos custos só compila com a E2, porque `Cost` é
  `Partial<Record<ResourceType, number>>`.
- [ ] **A5. `src/core/data/techs.ts`.**
  1. Imports, abaixo do `import type` que já existe:
     ```ts
     import { LINES, LINE_ORDER, lineStart, evoTechId } from './lines';
     import { UNITS } from './units';
     ```
     Importe de `./lines` e `./units`, **não** de `./index`, para não criar ciclo de importação.
  2. Acima de `const RAW`, acrescente:
     ```ts
     /** Efeitos de cada estudo da linha dos cidadãos (E3): o tipo não muda — dezenas de comparações com 'villager' no núcleo. */
     const CITIZEN_EVO_EFFECTS: Effect[] = [
       { type: 'unit', match: { types: ['villager'] }, stat: 'hp', mult: 1.1 },
       { type: 'gather', resource: 'food', mult: 1.04 }, { type: 'gather', resource: 'wood', mult: 1.04 },
       { type: 'gather', resource: 'stone', mult: 1.04 }, { type: 'gather', resource: 'gold', mult: 1.04 },
       { type: 'player', stat: 'buildSpeed', mult: 1.05 },
     ];
     /** Estudos de evolução (E3): um por degrau novo de cada linha, na Biblioteca, na Era do degrau, em sequência (prereq = o
      *  estudo anterior da mesma linha). Sem `line` de propósito: não contam no requires.techCount das Eras. */
     function evolutions(): Record<string, TechInput> {
       const out: Record<string, TechInput> = {};
       for (const id of LINE_ORDER) {
         const l = LINES[id];
         let prev: string | null = null;
         for (let k = lineStart(l) + 1; k < l.steps.length; k++) {
           const to = l.steps[k];
           if (!to) continue;
           const tid = evoTechId(id, k);
           const citizen = id === 'citizen';
           out[tid] = {
             name: citizen ? `${l.name}: ${l.studyNames?.[k] ?? ''}` : `${l.name}: ${UNITS[to].name}`,
             icon: UNITS[to].icon, building: 'academy', age: k,
             cost: citizen ? { knowledge: 40 + 60 * k, food: 40 + 50 * k } : { knowledge: 40 + 60 * k, gold: 40 + 50 * k },
             time: 25 + 8 * k, prereq: prev ? [prev] : [], effects: citizen ? CITIZEN_EVO_EFFECTS : [],
             evolve: { line: id, to },
             desc: citizen
               ? 'Cidadãos +10% de vida; coleta de comida, madeira, pedra e ouro +4%; construção 5% mais rápida.'
               : `Treina ${UNITS[to].plural} no lugar do degrau anterior; as unidades da linha que você já tem se transformam (vida proporcional, patente e ordens mantidas).`,
           };
           prev = tid;
         }
       }
       return out;
     }
     ```
  3. No fim do objeto `RAW`, depois de `great_hunt` e das pesquisas que a E2 acrescentou, cole
     `  // ---------- Evolução das linhas de unidade (E3) ----------` e `  ...evolutions(),`.

  Confira: `npx tsx -e "import { TECHS } from './src/core/data'; const e = Object.values(TECHS).filter((t) => t.evolve); console.log(e.length, TECHS.evo_heavy_infantry_3.name, TECHS.evo_heavy_infantry_3.prereq)"`
  imprime `50 Infantaria pesada: Falangita [ 'evo_heavy_infantry_2' ]`.
- [ ] **A6. `src/i18n/en-data.ts`.**
  1. No topo, `import { LINES, lineStart, evoTechId } from '../core/data/lines';`.
  2. Em `EN_UNITS`, cole o bloco "Inglês" das 41 unidades antes do `};` final.
  3. **Entre** `EN_BUILDINGS` e `const line = …` (isto é, **antes** de `EN_TECHS`: `const` não pode ser usado antes da
     declaração), acrescente:
     ```ts
     export const EN_LINES: Record<string, TextOverlay> = {
       citizen: { name: 'Citizens' }, scout: { name: 'Scouts' }, heavy_infantry: { name: 'Heavy Infantry' }, ranged: { name: 'Missile Troops' },
       skirmisher: { name: 'Skirmishers' }, cavalry: { name: 'Cavalry' }, elite: { name: 'Fortress Elite' }, artillery: { name: 'Artillery' },
       assault: { name: 'Wall Assault' }, greek_fire: { name: 'Greek Fire' },
     };
     const CITIZEN_STUDIES_EN = [null, 'Iron Tools', 'Artisans', 'Guilds', 'Steel Tools', 'Manufacture', 'Factory Workers', 'Modern Workers'];
     /** EN dos estudos de evolução (E3), na mesma conta de src/core/data/techs.ts (evolutions). */
     function evolutionsEN(): Record<string, TextOverlay> {
       const out: Record<string, TextOverlay> = {};
       for (const [id, l] of Object.entries(LINES)) {
         for (let k = lineStart(l) + 1; k < l.steps.length; k++) {
           const to = l.steps[k];
           if (!to) continue;
           out[evoTechId(id, k)] = id === 'citizen'
             ? { name: `${EN_LINES[id].name}: ${CITIZEN_STUDIES_EN[k]}`, desc: 'Citizens +10% health; food, wood, stone and gold gathering +4%; building 5% faster.' }
             : { name: `${EN_LINES[id].name}: ${EN_UNITS[to].name}`, desc: `Trains ${EN_UNITS[to].plural} instead of the previous step; the line's units you already have are transformed (health in proportion, rank and orders kept).` };
         }
       }
       return out;
     }
     ```
  4. No fim de `EN_TECHS`, antes do `};`, acrescente `  ...evolutionsEN(),`.
- [ ] **A7. `src/i18n/index.ts`.**
  - Acrescente `LINES` ao import de `'../core/data'` e `EN_LINES` ao import de `'./en-data'`.
  - Em `setLocale`, depois da linha dos `MAJOR_GODS`, acrescente
    `for (const [id, l] of Object.entries(LINES)) apply(l as unknown as Record<string, unknown>, EN_LINES[id]);`.
- [ ] **A8. `src/i18n/strings.ts`.** Acrescente as 4 chaves da tabela "Textos de interface novos":
  - na tabela `pt`, numa linha nova antes de `} as const;`;
  - na tabela `en`, antes do `};` que a fecha.

  Confira: `npm run -s typecheck`, porque `en` é `Record<keyof typeof pt, string>` e chave só de um lado não compila.
- [ ] **A9. Testes de dados.**
  - `tests/data.test.ts`, no `it('unidades referenciam edifícios que as treinam')`:
    - acrescente `LINES` ao import de `'../src/core/data'`;
    - troque a linha `expect(BUILDINGS[u.building].trains, …).toContain(u.id);` por:
      ```ts
      if (u.lineOnly) { expect(LINES[u.line!]?.buildings, `linha de ${u.id}`).toContain(u.building); continue; }   // E3: degrau novo treina pela linha
      expect(BUILDINGS[u.building].trains, `trains de ${u.building}`).toContain(u.id);
      ```
  - `tests/i18n.test.ts`:
    - importe `LINES` (de `'../src/core/data'`) e `EN_LINES` (de `'../src/i18n/en-data'`);
    - no primeiro `it`, depois dos outros `check(...)`, acrescente
      `check('line', LINES as unknown as Record<string, { name: string }>, EN_LINES);`.
  - **Ainda não** crie `tests/unit-lines.test.ts`: ele importa `src/core/sim/lines.ts`, que só nasce no B1 (o arquivo
    inteiro entra no B9).

  Confira: `npx vitest run tests/data.test.ts tests/i18n.test.ts` e o comando do fim do passo A5 (50 estudos).

### Bloco B — Núcleo: treino, evolução e transformação

- [ ] **B1. `src/core/sim/lines.ts` (novo).** O arquivo inteiro:
  ```ts
  // Linhas de unidade no núcleo (E3, docs/eras/E3-linhas-de-unidade.md): o degrau que cada linha treina (de player.techs,
  // sem estado novo), os botões de treino de um edifício (o HUD, os atalhos e a IA usam esta MESMA função) e a
  // transformação das unidades quando um estudo de evolução termina. Determinístico: só player.techs e a config.
  import { BUILDINGS, LINES, LINE_ORDER, TECHS, UNITS, lineStart, evoTechId, type LineDef } from '../data';
  import type { GameState, Player } from '../types';
  import { isScenarioConfig } from './restrictions';
  import { recomputePop } from './entities';

  /** Linhas ligadas: fora de cenário, sempre; em cenário, só com config.unitLines === true (campanha e Horda: elenco clássico). */
  export function unitLinesOn(state: GameState): boolean { return state.config.unitLines ?? !isScenarioConfig(state.config); }

  /** Degrau que a linha treina hoje para o jogador: o da maior Era cujo estudo ele já tem (sem estudo, a base). */
  export function lineUnitOf(player: Player, lineId: string): string {
    const l = LINES[lineId];
    const from = lineStart(l);
    let cur = l.steps[from]!;
    for (let k = from + 1; k < l.steps.length; k++) { const s = l.steps[k]; if (s && player.techs.includes(evoTechId(lineId, k))) cur = s; }
    return cur;
  }

  /** Próximo estudo de evolução da linha que o jogador ainda não tem (null: linha completa). */
  export function nextEvolution(player: Player, lineId: string): string | null {
    const l = LINES[lineId];
    for (let k = lineStart(l) + 1; k < l.steps.length; k++) {
      if (!l.steps[k]) continue;
      const t = evoTechId(lineId, k);
      if (!player.techs.includes(t)) return t;
    }
    return null;
  }

  /** Tipo que sai do treino de `unit`: com as linhas ligadas, o degrau atual da linha dela; senão, o próprio. */
  export function trainTypeOf(state: GameState, player: Player, unit: string): string {
    const d = UNITS[unit];
    return d?.line && unitLinesOn(state) ? lineUnitOf(player, d.line) : unit;
  }

  /** Um botão de treino: `send` vai no comando, `show` é o que sai (ícone, nome, custo); `era` = desde quando treina. */
  export interface TrainChoice { send: string; show: string; hotkey: string | null; era: number; line: LineDef | null }

  /**
   * Botões de treino de um edifício, na ordem de exibição. Com as linhas: um por linha (LINE_ORDER) que treina ali e ainda
   * não se aposentou, e depois as unidades sem linha do `trains` (heróis, míticas, Mercador). Sem as linhas: exatamente
   * o `trains`, na ordem dele (o elenco clássico de antes da E3).
   */
  export function trainChoices(state: GameState, player: Player, buildingType: string): TrainChoice[] {
    const trains = BUILDINGS[buildingType]?.trains ?? [];
    if (!unitLinesOn(state)) return trains.map((id) => ({ send: id, show: id, hotkey: UNITS[id].hotkey ?? null, era: UNITS[id].age, line: null }));
    const out: TrainChoice[] = [];
    for (const id of LINE_ORDER) {
      const l = LINES[id];
      if (!l.buildings.includes(buildingType)) continue;
      if (l.retireAt !== undefined && player.age >= l.retireAt) continue;
      out.push({ send: l.steps[lineStart(l)]!, show: lineUnitOf(player, id), hotkey: l.hotkey, era: lineStart(l), line: l });
    }
    for (const id of trains) if (!UNITS[id].line) out.push({ send: id, show: id, hotkey: UNITS[id].hotkey ?? null, era: UNITS[id].age, line: null });
    return out;
  }

  /**
   * Fim de um estudo de evolução (chamar ANTES de recomputeMods/refreshMaxHp, que mantêm a fração de vida pelo tipo
   * novo): as unidades vivas do dono naquela linha e de degrau menor viram o degrau novo. Patente (kills), ordem, alvo,
   * postura e guarnição continuam (tests/unit-lines.test.ts garante que a guarnição não muda dentro de uma linha).
   * Devolve quantas mudaram. Os cidadãos (to = villager) não mudam de tipo: só os efeitos do estudo valem.
   */
  export function applyEvolution(state: GameState, player: Player, techId: string): number {
    const evo = TECHS[techId]?.evolve;
    if (!evo || !unitLinesOn(state)) return 0;
    const tier = UNITS[evo.to].tier ?? 0;
    let n = 0;
    for (const u of state.units.values()) {
      if (u.owner !== player.id || u.dead || u.type === evo.to) continue;
      const d = UNITS[u.type];
      if (d.line !== evo.line || (d.tier ?? 0) >= tier) continue;
      u.type = evo.to;
      u.path = null;   // recalcula o caminho com a velocidade nova; ordem e estado ficam
      n++;
      if (u.inside === -1) state.effects.push({ type: 'evolve', x: u.x, y: u.y, owner: u.owner, ttl: 20, total: 20, src: evo.to });
    }
    if (n > 0) recomputePop(state, player);
    return n;
  }
  ```
  A linha do `state.effects.push` precisa ficar **literal** assim (`state.effects.push({ type: 'evolve'`), porque o
  `tests/fx-registry.test.ts` acha os tipos por regex.
- [ ] **B2. `src/core/sim/commands.ts`.**
  1. Imports:
     - acrescente `LINES` e `lineStart` ao import de `'../data'`;
     - acrescente `import { lineUnitOf, trainTypeOf, unitLinesOn } from './lines';`.
  2. Em `canTrain`, logo depois de `if (!def || !b.complete) return { ok: false };`, acrescente:
     ```ts
     if (def.line && unitLinesOn(state)) return canTrainLine(state, player, b, def.line);   // E3: a linha decide edifício, Era e degrau
     if (def.lineOnly) return { ok: false, reason: t('err.legacyRoster') };                 // E3: degrau novo não existe no elenco clássico
     ```
     O resto de `canTrain` fica igual: é o elenco clássico.
  3. Logo depois de `canTrain`, acrescente:
     ```ts
     /** Treino de uma linha (E3, com as linhas ligadas): edifício da linha, Era da base, aposentadoria, trava (no degrau que
      *  sairia), fila, população e custo do degrau atual. */
     function canTrainLine(state: GameState, player: Player, b: Building, lineId: string): CommandResult {
       const l = LINES[lineId];
       if (!l.buildings.includes(b.type)) return { ok: false, reason: t('err.notTrained') };
       const from = lineStart(l);
       if (player.age < from) return { ok: false, reason: t('err.requiresAge', { age: AGES[from].name }) };
       if (l.retireAt !== undefined && player.age >= l.retireAt) return { ok: false, reason: t('err.lineRetired', { line: l.name, age: AGES[l.retireAt].name }) };
       const unit = lineUnitOf(player, lineId);
       const forbid = forbiddenReason(state, player.id, 'units', unit); if (forbid) return { ok: false, reason: forbid };   // G6
       if (b.queue.length >= queueMaxOf(b.type)) return { ok: false, reason: t('err.queueFull') };
       if (player.pop + UNITS[unit].pop > player.popCap) return { ok: false, reason: t('err.popCap') };
       if (!canAfford(player, getUnitStats(state, player, unit).cost)) return { ok: false, reason: t('err.noResources') };
       return { ok: true };
     }
     ```
  4. Em `train`, troque as três linhas depois de `if (!c.ok) return c;` (`const paid = …`, `pay(…)` e `b.queue.push(…)`) por:
     ```ts
     const type = trainTypeOf(state, player, unit);   // E3: com as linhas, o degrau atual (sem elas, o próprio unit)
     const paid = { ...getUnitStats(state, player, type).cost };
     pay(player, paid);
     b.queue.push({ kind: 'unit', id: type, elapsed: 0, total: queueTotalFor(state, player, 'unit', type), paid, uid: state.nextId++ });
     ```
     O `recomputePop(state, player);` e o `return` ficam.
  5. Em `canResearch`, logo depois de `if (def.building !== b.type) return { ok: false };`, acrescente
     `if (def.evolve && !unitLinesOn(state)) return { ok: false, reason: t('err.legacyRoster') };`.
- [ ] **B3. `src/core/sim/buildings.ts`, `completeQueueItem`.**
  - Acrescente `import { applyEvolution, trainTypeOf } from './lines';`.
  - No `case 'unit':`, troque `const def = UNITS[item.id];` por
    `const type = trainTypeOf(state, player, item.id); const def = UNITS[type];   // E3: o item da fila sai no degrau atual`.
    Na chamada `spawnUnit(state, b.owner, item.id, spot.x, spot.y)`, troque `item.id` por `type`.
  - No `case 'tech':`, troque `if (!player.techs.includes(item.id)) player.techs.push(item.id);` por
    `if (!player.techs.includes(item.id)) { player.techs.push(item.id); applyEvolution(state, player, item.id); }   // E3: antes dos mods`.
    O `recomputeMods` e o `refreshMaxHp` que vêm logo depois ficam onde estão: são eles que acertam a vida pelo tipo novo.
- [ ] **B4. `src/core/scenario/helpers.ts`, `grantTech`.** Acrescente `import { applyEvolution } from '../sim/lines';` e
  troque o corpo por:
  ```ts
  const p = state.players[owner];
  if (!p.techs.includes(tech)) { p.techs.push(tech); applyEvolution(state, p, tech); recomputeMods(state, p); refreshMaxHp(state, p); }
  ```
  No elenco clássico, `applyEvolution` não faz nada.
- [ ] **B5. `src/core/sim/combat.ts`, `attackInterval`.** Troque
  `const base = ATTACK_INTERVAL[UNITS[attacker.type].cls] ?? 1.2;` por
  `const def = UNITS[attacker.type]; const base = def.attackInterval ?? ATTACK_INTERVAL[def.cls] ?? 1.2;   // E3: armas de fogo têm cadência própria`.
- [ ] **B6. `src/core/sim/game.ts`.**
  1. Imports:
     - acrescente `LINES`, `LINE_ORDER`, `TECHS`, `lineStart` e `evoTechId` ao import de `'../data'` (os que a E1 ainda
       não importou);
     - acrescente `import { trainTypeOf, unitLinesOn } from './lines';`.
  2. Logo depois da função `grantStartingEras` (criada pela E1), acrescente:
     ```ts
     /** Era inicial acima da I com as linhas ligadas (E3, D16): começa com os degraus da Era — todos os estudos de evolução até ela. */
     export function grantStartingEvolutions(p: Player, startAge: number): void {
       for (const id of LINE_ORDER) {
         const l = LINES[id];
         for (let k = lineStart(l) + 1; k <= startAge && k < l.steps.length; k++) {
           if (!l.steps[k]) continue;
           const tid = evoTechId(id, k);
           if (TECHS[tid] && !p.techs.includes(tid)) p.techs.push(tid);
         }
       }
     }
     ```
  3. Na linha que a E1 pôs entre o literal do `Player` e `state.players.push(p);`
     (`if (!isScenarioConfig(config)) grantStartingEras(p, startAge);`), acrescente logo depois
     `if (!isScenarioConfig(config) && unitLinesOn(state)) grantStartingEvolutions(p, startAge);`.
  4. No kit inicial, troque `spawnUnit(state, p.id, k < 5 ? 'villager' : 'kataskopos', px, py);` por
     `spawnUnit(state, p.id, k < 5 ? 'villager' : trainTypeOf(state, p, 'kataskopos'), px, py);`.
  5. Em `summarize`, troque `` techs=${p.techs.length} `` por
     `` techs=${p.techs.length} evo=${p.techs.filter((t) => TECHS[t]?.evolve).length} ``. É só texto do `npm run smoke`.
- [ ] **B7. Cenário (`unitLines`).**
  - `src/core/scenario/schema.ts`:
    - no tipo `ScenarioFile.config`, acrescente `unitLines?: boolean;` depois de `maxAge?: number; forbid?: Forbid;`;
    - na validação da config, perto de `if (c.revealMap !== undefined …)`, acrescente
      `if (c.unitLines !== undefined && typeof c.unitLines !== 'boolean') err('config.unitLines', 'esperado true/false');`.
  - `src/core/scenario/compile.ts`, `scenarioConfig`: depois de `if (c.forbid) cfg.forbid = copyForbid(c.forbid);`,
    acrescente `if (c.unitLines !== undefined) cfg.unitLines = c.unitLines;   // E3`.
- [ ] **B8. `src/core/constants.ts`.** Some 1 ao `SIM_VERSION` anotado no passo 0.1 e acrescente ao histórico do
  comentário: `<n> = linhas de unidade (E3): 41 degraus novos, evolução na Biblioteca, treino pelo degrau atual, IA com as linhas.`
- [ ] **B9. Testes de dados e do núcleo.** Crie `tests/unit-lines.test.ts` com o **arquivo inteiro** da seção "Testes"
  (os três `describe`). A IA ainda não mudou, então rode só os dois primeiros (`-t` filtra pelo nome do `describe`):
  ```sh
  npx vitest run tests/unit-lines.test.ts -t "dados|núcleo"
  npx vitest run tests/sim.test.ts tests/economy-regressions.test.ts tests/command-fuzz.test.ts tests/determinism.test.ts tests/scenario-gaps.test.ts tests/scenario-json.test.ts
  ```
  Se um teste **que já existia** falhar porque esperava o elenco clássico numa `quickGame` (sem cenário as linhas agora
  vêm ligadas), acrescente `unitLines: false` ao config daquele teste; não mude a asserção.

### Bloco C — IA

- [ ] **C1. `src/core/sim/ai.ts`, imports.**
  - acrescente `LINES` e `LINE_ORDER` ao import de `'../data'`;
  - acrescente `import { nextEvolution, trainChoices, unitLinesOn } from './lines';`.
- [ ] **C2. Treino do exército (`manageTraining`).** No laço `for (const b of snap.buildings) { … }` do bloco
  "Exército humano", troque as linhas de `const options = def.trains.filter(…)` até o `applyCommand(…)` por:
  ```ts
  const options = trainChoices(state, player, b.type).filter((c) => canTrain(state, player, b, c.send).ok && !UNITS[c.show].tags.includes('hero') && !UNITS[c.show].tags.includes('scout'));
  if (options.length === 0) continue;
  // escolhe a opção com maior peso no mix, preferindo unidades da Era mais alta disponível (com as linhas, o degrau atual)
  let best = options[0], bestW = -1;
  for (const o of options) { const d = UNITS[o.show]; const w = (mix[d.cls] ?? 0.1) * (1 + d.age * 0.5); if (w > bestW) { bestW = w; best = o; } }
  applyCommand(state, { type: 'train', player: player.id, buildingId: b.id, unit: best.send });
  ```
  - No elenco clássico, `trainChoices` devolve o `trains` como antes (`send` = `show` = id), então a campanha fica igual.
  - Use `d.age` e **não** `d.tier`: com `tier` o peso das unidades de hoje mudaria e a campanha deixaria de ser a mesma.
- [ ] **C3. Evoluções (`manageResearch`).** Acrescente, logo acima de `function manageResearch`:
  ```ts
  /** Unidades do jogador por linha (militares e cidadãos): a IA estuda primeiro a evolução das linhas que usa (E3). */
  function lineUsers(snap: Snapshot): Map<string, number> {
    const m = new Map<string, number>();
    for (const u of [...snap.military, ...snap.villagers]) { const l = UNITS[u.type].line; if (l) m.set(l, (m.get(l) ?? 0) + 1); }
    return m;
  }
  /** Próximo estudo de evolução de cada linha, das mais usadas para as menos (empate: LINE_ORDER). Vazio sem as linhas.
   *  Linha aposentada (Assalto e Fogo grego na Era V+) fica de fora: não treina mais, e o estudo seria gasto à toa. */
  function evolutionPriority(state: GameState, player: Player, users: Map<string, number>): string[] {
    if (!unitLinesOn(state)) return [];
    const out: { id: string; n: number; i: number }[] = [];
    LINE_ORDER.forEach((line, i) => {
      const r = LINES[line].retireAt; if (r !== undefined && player.age >= r) return;
      const next = nextEvolution(player, line); if (next) out.push({ id: next, n: users.get(line) ?? 0, i });
    });
    out.sort((a, b) => b.n - a.n || a.i - b.i);
    return out.map((x) => x.id);
  }
  /** Linhas com pelo menos este número de unidades em campo evoluem mesmo sem o fundo da próxima Era junto. */
  const EVO_USERS = 4;
  /** Evoluir agora? Só depois dos estudos que a próxima Era pede (ou na Era final); cidadãos sempre; as outras linhas com o
   *  fundo da Era junto ou com EVO_USERS+ unidades da linha. */
  function evolutionAllowed(state: GameState, player: Player, budget: Budget, users: Map<string, number>, line: string): boolean {
    const done = player.age >= maxAgeOf(state, player.id);
    const need = AGES[player.age + 1]?.requires.techCount ?? 0;
    if (!done && academyTechCount(player) < need) return false;
    return done || budget.fundMet || line === 'citizen' || (users.get(line) ?? 0) >= EVO_USERS;
  }
  ```
  No corpo de `manageResearch`:
  1. Troque `const list = [...RESEARCH_PRIORITY.slice(0, 12), ...godTechs, ...RESEARCH_PRIORITY.slice(12)];` por:
     ```ts
     const users = lineUsers(snap);
     const list = [...RESEARCH_PRIORITY.slice(0, 12), ...godTechs, ...evolutionPriority(state, player, users), ...RESEARCH_PRIORITY.slice(12)];
     ```
  2. Logo depois de `const cost = techCost(player, t);`, envolva as duas regras que já existem (a das linhas, com o
     comentário "Linhas da Academia além do exigido…", e a do resto, "o resto só com sobra…") num `else`, assim:
     ```ts
     if (def.evolve) {
       if (!evolutionAllowed(state, player, budget, users, def.evolve.line)) continue;
     } else {
       // …as linhas `const isLine = …`, `const cheap = …` e os dois `if (…) continue;` de hoje, sem mudar nada…
     }
     ```
     A linha `if ((cost.gold ?? 0) > player.resources.gold - 40) continue;` e o `applyCommand` continuam depois do bloco,
     valendo para todos.
- [ ] **C4. Teste e conferência.** O `describe('linhas de unidade: IA')` já está no arquivo desde o B9. Confira:
  ```sh
  npx vitest run tests/unit-lines.test.ts tests/movement-ai.test.ts tests/position-fairness.test.ts tests/determinism.test.ts tests/eras.test.ts
  npm run -s smoke 20 42
  ```
  Rode o smoke duas vezes: o "hash final" tem de ser igual nas duas, e o `evo=` das IAs vivas tem de passar de 0 no
  minuto 20 (veja o item 4 da "Verificação" para o caso em que o balanceamento obrigou ao ajuste 3).

### Bloco D — Renderização provisória

- [ ] **D1. `src/render/art/alias.ts` (da E2).** A E2 deixa o objeto numa linha só
  (`{ merchant: 'villager' }`). Quebre-o em várias linhas, ponha uma vírgula depois de `merchant: 'villager'` e cole
  as 41 entradas do bloco "Arte provisória (alias)" dentro do objeto, antes do `}`. Não mexa em `BUILDING_ART_ALIAS`.
  Confira: `npx vitest run tests/art-etapa6.test.ts tests/art-library.test.ts tests/art-manifest.test.ts` (o
  `toHaveLength(35)` volta a passar, porque a E2 filtra os tipos do alias).
- [ ] **D2. `src/render/textures.ts`, `TextureCache.unit`.**
  - Acrescente `import { unitArtType } from './art/alias';`.
  - Troque `(g) => drawUnit(g, type, color)` por `(g) => drawUnit(g, unitArtType(type), color)`.

  O tamanho continua o do tipo de verdade (`UNITS[type].radius`). Sem isso, o tanque sai como um humanoide no modo sem
  arte assada.
- [ ] **D3. Efeito `evolve`.**
  - `src/render/fx/types.ts`: acrescente `'evolve'` no fim de `EFFECT_TYPES` e troque o comentário "Os 16 tipos" por
    "Os 17 tipos".
  - `src/render/fx/handlers/evolve.ts` (novo):
    ```ts
    // Evolução de linha (E3, docs/eras/E3-linhas-de-unidade.md): a unidade que trocou de degrau solta poeira no pé e um brilho
    // dourado que sobe (o renderizador já recria a vista com o tipo novo). Só se o efeito for novo e estiver à vista.
    import type { FxHandler } from '../types';
    import { PRIO } from '../../particles';
    import { dust, glow, motes } from '../emitters';
    import { FRESH, TILE, dustAt, seenNow } from './util';

    export const evolve: FxHandler<null> = {
      create(e, fx, age) {
        if (age > FRESH || !seenNow(fx, e.x, e.y)) return null;
        const x = e.x * TILE, y = e.y * TILE;
        dust(fx.particles, fx.tex, x, y, { n: 6, tint: dustAt(fx, e.x, e.y), spread: 6, speed: 10, scale: 0.4, grow: 2, alpha: 0.45, life: 0.9, rise: 4 });
        glow(fx.particles, fx.tex, x, y, 10, 18, 0xffe3a0, 0.7, PRIO.combat, 0.55);
        motes(fx.particles, fx.tex, x, y, 5, 0xffe9b0, 6, PRIO.combat, 28);
        return null;
      },
    };
    ```
  - `src/render/fx/registry.ts`: acrescente `import { evolve } from './handlers/evolve';` e `evolve` no fim do objeto
    `FX_HANDLERS`.
  - `src/audio/events.ts`, `cuesForEffect`: antes do `default:`, acrescente
    `case 'evolve': return [{ recipe: 'heal', x: fx.x, y: fx.y, gain: 0.5 }];`.
- [ ] **D4. Projétil do sifão.** Em `src/render/fx/logic.ts`, `projectileKind`, dentro do `if (u) {`, como **primeira**
  linha (antes de `if (u.tags.includes('skirmisher'))`), acrescente `if (u.tags.includes('fire')) return 'fireball';   // E3: sifão de fogo grego`.
  As outras armas de fogo continuam com a flecha até a E8 (que usará a tag `gunpowder`).
- [ ] **D5. Testes.**
  - `tests/fx-registry.test.ts`, no `it('cada um dos 16 tipos …')`:
    - troque "16" por "17" no título;
    - acrescente `mk('evolve', { owner: 0, src: 'hypaspist' }),` à lista do `st.effects.push(`.
  - `tests/fx-logic.test.ts`: depois de `expect(projectileKind('helepolis', 'rock')).toBe('stone');`, acrescente
    `expect(projectileKind('greek_fire_siphon', 'rock')).toBe('fireball');`.

  Confira:
  `npx vitest run tests/fx-registry.test.ts tests/fx-logic.test.ts tests/audio.test.ts tests/art-etapa6.test.ts tests/art-library.test.ts tests/art-manifest.test.ts`.

### Bloco E — Ícones do HUD

- [ ] **E1. `scripts/bake/hud/catalog.mjs`.**
  - No fim de `TECH_ICONS` (antes do `};`), acrescente:
    ```js
    // E3: um ícone por linha de unidade para os estudos de evolução (evo_<linha>_<n>), com o modelo do degrau-âncora
    evo_citizen: { kind: 'unit', unit: 'villager', frame: { mode: 'bust', frac: 0.74, margin: 0.03 } },
    evo_scout: { kind: 'unit', unit: 'kataskopos', frame: { margin: 0.04 } },
    evo_heavy_infantry: { kind: 'unit', unit: 'hypaspist', frame: { mode: 'bust', frac: 0.74, margin: 0.03 } },
    evo_ranged: { kind: 'unit', unit: 'cretan_archer', frame: { mode: 'bust', frac: 0.74, margin: 0.03 } },
    evo_skirmisher: { kind: 'unit', unit: 'peltast', frame: { mode: 'bust', frac: 0.74, margin: 0.03 } },
    evo_cavalry: { kind: 'unit', unit: 'hetairoi', frame: { margin: 0.04 } },
    evo_elite: { kind: 'unit', unit: 'myrmidon', frame: { mode: 'bust', frac: 0.74, margin: 0.03 } },
    evo_artillery: { kind: 'unit', unit: 'petrobolos', frame: { margin: 0.04 } },
    evo_assault: { kind: 'unit', unit: 'helepolis', frame: { margin: 0.04 } },
    ```
    O `frame` é obrigatório: sem ele, o `resolve` de `hudItems` passa `frame: undefined` por cima do enquadramento padrão.
  - Em `techIconKey`, como primeira linha do corpo, acrescente
    `if (id.startsWith('evo_')) return id.slice(0, id.lastIndexOf('_'));   // E3: evo_heavy_infantry_3 → evo_heavy_infantry`.
- [ ] **E2. `src/ui/icons.ts`, `techIconName`.** Como primeira linha do corpo, acrescente
  `` if (id.startsWith('evo_')) return `tech/${id.slice(0, id.lastIndexOf('_'))}`;   // E3: igual a techIconKey do catálogo ``.
  As duas funções **têm** de dar o mesmo resultado para todo id (`tests/hud-icons.test.ts` confere).
- [ ] **E3. Gere o atlas** (precisa do Chromium do Playwright, como na E1/E2):
  ```sh
  npm run art:hud
  npm run art:check
  npx vitest run tests/hud-icons.test.ts
  ```
  - O `art:check` tem de sair sem erro;
  - `git status` deve mostrar só `public/art/hud-*` e `public/art/manifest.json` mudados em `public/art`.
  - **Não** rode `npm run art:bake`.

### Bloco F — Interface

- [ ] **F1. `src/ui/hud.ts`.**
  1. Imports:
     - acrescente `LINES` ao import de `'../core/data'`;
     - acrescente `import { trainChoices, unitLinesOn } from '../core/sim/lines';`.
  2. Em `refreshCommands`, troque o laço de treino inteiro (de `if (def.trains) for (const ut of def.trains) {` até o `}`
     que o fecha) por:
     ```ts
     for (const ch of trainChoices(s.state, p, b.type)) {   // E3: com as linhas, um botão por linha (o degrau atual); sem elas, o trains de sempre
       const ut = ch.show; const ud = UNITS[ut];
       if (ch.era > p.age + 1) continue;
       if (ud.god) { const major = MAJOR_GODS[p.god]; const ok = major.mythUnit === ut || p.minorGods.some((g) => MINOR_GODS[g].mythUnit === ut) || ud.god === p.god; if (!ok) continue; }
       const st = getUnitStats(s.state, p, ut);
       const c = canTrain(s.state, p, b, ch.send);
       const lineTip = ch.line ? `<div class="desc">${t('cmd.lineTip', { line: ch.line.name })}</div>` : '';
       const tip = `${t('cmd.trainTip', { name: ud.name, cost: fmtCost(st.cost, p), time: Math.round(st.trainTime), pop: ud.pop, desc: ud.desc, hp: st.hp, attack: st.attack, range: st.range >= 1.6 ? st.range : t('sel.melee') })}${lineTip}${c.ok ? '' : `<div style="color:#ef4444;margin-top:4px">${c.reason ?? (ch.era > p.age ? t('cmd.requiresAge', { age: AGES[ch.era].name }) : '')}</div>`}`;
       add(ic.unit(ut, p.color), ud.name, tip, ch.hotkey, () => { const r = this.issueChecked({ type: 'train', player: s.local, buildingId: b.id, unit: ch.send }); if (r) this.audio.play('command'); }, { disabled: !c.ok });
     }
     ```
     Se a E1 tiver mudado o `cmd.trainTip` ou o `add(...)` deste laço, mantenha a forma da E1 e troque só: `ut` vem de
     `ch.show`, o comando manda `ch.send`, a tecla é `ch.hotkey` e a Era é `ch.era`.
  3. No laço de pesquisas (`for (const tech of Object.values(TECHS)) {`), logo depois da primeira linha `if (…) continue;`,
     acrescente `if (tech.evolve && !unitLinesOn(s.state)) continue;   // E3: sem linhas (cenários), sem evoluções`.
  4. Em `unitCard`, depois de `` stats.push(`${t('sel.speed')} … `) ``, acrescente:
     ```ts
     if (def.line && def.line !== 'citizen' && unitLinesOn(s.state)) stats.push(`${t('sel.line')} <b>${esc(LINES[def.line].name)} · ${AGES[def.tier ?? def.age].short}</b>`);
     ```
     O cidadão fica de fora: o `tier` dele é sempre 0 e o cartão diria "Arcaica" mesmo depois dos 7 estudos.
  5. Em `refreshSelection`, na montagem de `key`, troque ``units.map((u) => `${u.hp}`)`` por
     ``units.map((u) => `${u.type}${u.hp}`)``. Assim o cartão se redesenha quando a unidade se transforma.
  6. Em `showHotkeys`, troque a definição de `trainRows` por:
     ```ts
     const sess = this.session?.player ? this.session : null;   // a tela de atalhos também abre do menu principal, sem partida (e o espectador pode não ter jogador)
     const trainRows = Object.entries(BUILDINGS).filter(([, b]) => b.trains && b.trains.length > 0).map(([id, b]) => {
       const items = sess
         ? trainChoices(sess.state, sess.player, id).filter((c) => c.hotkey).map((c) => `${k(c.hotkey!)} ${ic.unit(c.show, undefined, 'sm')} ${c.line ? c.line.name : UNITS[c.show].name}`)
         : b.trains!.filter((u) => UNITS[u].hotkey).map((u) => `${k(UNITS[u].hotkey!)} ${ic.unit(u, undefined, 'sm')} ${UNITS[u].name}`);
       return `<tr><td>${ic.bld(id, undefined, 'sm')} ${b.name}</td><td>${items.join(' · ')}</td></tr>`;
     }).join('');
     ```
  7. Em `buildingCard`, na fila (`b.queue.forEach((item, i) => {`), o item de unidade sai no degrau **atual** (B3), mas
     a fila guarda o tipo do momento do pedido. Para o ícone e o nome mostrarem o que vai nascer:
     - acrescente `trainTypeOf` ao import de `'../core/sim/lines'`;
     - logo no começo do `forEach`, acrescente `const qtype = item.kind === 'unit' ? trainTypeOf(s.state, owner, item.id) : item.id;   // E3: o degrau que vai nascer`;
     - nas linhas `const icon = …` e `const name = …`, troque `ic.unit(item.id, owner.color)` por
       `ic.unit(qtype, owner.color)` e `UNITS[item.id].name` por `UNITS[qtype].name` (o `itemId: item.uid` do cancelamento fica).

     A chave do `refreshSelection` já tem `s.player.techs.length`, então o cartão se redesenha quando o estudo termina.
- [ ] **F2. `src/ui/input.ts`.**
  - Acrescente `import { trainChoices } from '../core/sim/lines';`.
  - No ramo `} else if (b) {`, troque a linha
    `if (def.trains) for (const ut of def.trains) if (UNITS[ut].hotkey === keyU) { … unit: ut }); return; }` por:
    ```ts
    for (const ch of trainChoices(s.state, s.player, b.type)) if (ch.hotkey === keyU) { this.hud.issueChecked({ type: 'train', player: s.local, buildingId: b.id, unit: ch.send }); return; }
    ```
- [ ] **F3. `src/ui/studytree.ts` (da E1).**
  1. Imports:
     - acrescente `LINES` e `LINE_ORDER` ao import de `'../core/data'`;
     - acrescente `import { unitLinesOn } from '../core/sim/lines';`.
  2. Troque `rowOf` por:
     ```ts
     /** Linha da árvore de uma tecnologia da Biblioteca: evolução (E3) → a linha de unidade; as 4 linhas; o resto em 'other'. */
     export function rowOf(tech: TechDef): string {
       if (tech.evolve) return `evo:${tech.evolve.line}`;
       return tech.line && ACADEMY_LINES.includes(tech.line) ? tech.line : 'other';
     }
     ```
  3. Em `studyTreeModel`, onde a E1 monta a lista de linhas da árvore (a do avanço de Era, as 4 linhas e a `other`):
     - logo antes dessa lista, calcule as linhas de unidade (só com as linhas ligadas; as que têm pelo menos um
       estudo — 9, sem o `greek_fire`):
       ```ts
       const unitRows: StudyRow[] = unitLinesOn(state)
         ? LINE_ORDER.filter((id) => Object.values(TECHS).some((x) => x.evolve?.line === id))
             .map((id) => ({ id: `evo:${id}`, label: LINES[id].name, cells: Array.from({ length: AGES.length }, () => [] as StudyNode[]) }))
         : [];
       ```
     - ponha `...unitRows` na lista **entre as 4 linhas e a `other`**;
     - no laço que põe cada `tech` na sua linha, a linha sai de `rowOf(tech)`. Se ela não existir na lista (é o caso das
       evoluções no elenco clássico), pule a tecnologia, **em vez** de criar a linha ou de pô-la em `other`:
       ```ts
       const row = rows.find((r) => r.id === rowOf(tech)); if (!row) continue;   // E3: evolução sem as linhas
       ```
       (Use o nome que a E1 deu à lista; se ela usa um `Map` por id, faça o mesmo com `.get`.)
- [ ] **F4. Testes da interface.** Em `tests/studytree.test.ts` (da E1), acrescente o `it` abaixo dentro do `describe`
  que já existe (acrescente aos imports o que faltar: `TECHS` de `'../src/core/data'`, `studyTreeModel` de
  `'../src/ui/studytree'`, `quickGame` de `'./helpers'`):
  ```ts
  it('E3: uma linha da árvore por linha de unidade, só com as linhas ligadas', () => {
    const m = studyTreeModel(quickGame(), 0);
    const row = m.rows.find((r) => r.id === 'evo:heavy_infantry');
    expect(row, 'linha evo:heavy_infantry').toBeDefined();
    expect(row!.cells[1].map((x) => x.id)).toContain('evo_heavy_infantry_2');
    expect(m.rows.filter((r) => r.id.startsWith('evo:'))).toHaveLength(9);
    expect((m.rows.find((r) => r.id === 'other')?.cells.flat() ?? []).some((x) => !!TECHS[x.id]?.evolve)).toBe(false);
    expect(studyTreeModel(quickGame({ unitLines: false }), 0).rows.some((r) => r.id.startsWith('evo:'))).toBe(false);
  });
  ```
  Confira: `npx vitest run tests/studytree.test.ts tests/hud-icons.test.ts tests/hud-text.test.ts tests/i18n.test.ts`.

### Bloco G — Playtest no navegador

- [ ] **G1. `scripts/playtest-lines.mjs` (novo).**
  ```js
  // Playtest da E3 (linhas de unidade): a evolução no painel da Biblioteca, a transformação das unidades, o botão do
  // Quartel no degrau novo e a linha de unidade na árvore de estudos (F3). Exige `npm run preview` (porta 4173).
  import { chromium } from 'playwright';
  const url = process.argv[2] ?? 'http://localhost:4173/';
  const out = process.argv[3] ?? '/tmp/e3';
  const browser = await chromium.launch({ env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' }, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const ok = (name, cond, extra = '') => { console.log(`${cond ? 'OK   ' : 'FALHA'} ${name} ${extra}`); if (!cond) fails.push(name); };
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.fill('#m-seed', '7'); await page.click('#m-start'); await page.waitForTimeout(1500);
  const pause = (v) => page.evaluate((v) => { window.aoe.session.paused = v; }, v);
  // comandos do HUD e dos atalhos entram na fila do agendador e só valem no próximo tick: com o jogo pausado, solte
  // alguns ticks antes de conferir o estado (como o scripts/playtest.mjs faz depois de colocar a casa)
  const flush = async () => { await pause(false); await page.waitForTimeout(300); await pause(true); };
  await pause(true);
  // cenário: Era II, recursos, Biblioteca e Quartel prontos perto do Centro Cívico, 4 hoplitas
  const ids = await page.evaluate(() => {
    const a = window.aoe, s = a.session, p = s.player;
    p.age = 1;
    for (const r of Object.keys(p.resources)) p.resources[r] = 5000;
    const tc = [...s.state.buildings.values()].find((b) => b.owner === s.local && b.type === 'town_center');
    const put = (type, dx, dy) => { for (let r = 0; r < 8; r++) for (const [ox, oy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) { const b = a.debugBuild(s.local, type, tc.tx + dx + ox, tc.ty + dy + oy, 1); if (b) return b.id; } return -1; };
    const lib = put('academy', -6, 0), bar = put('barracks', 6, 0);
    const hops = [0, 1, 2, 3].map((k) => a.debugSpawn(s.local, 'hoplite', tc.x - 2 + k, tc.y + 4)?.id ?? -1);
    return { lib, bar, hops };
  });
  ok('Biblioteca, Quartel e hoplitas', ids.lib > 0 && ids.bar > 0 && ids.hops.every((h) => h > 0), JSON.stringify(ids));
  const labels = () => page.$$eval('#commands button.cmd .lbl', (els) => els.map((e) => e.textContent));
  const select = async (id) => { await page.evaluate((id) => window.aoe.session.select([id]), id); await page.waitForTimeout(400); };
  // 1) a Biblioteca mostra a evolução; clicar põe na fila
  await select(ids.lib);
  ok('Biblioteca mostra "Infantaria pesada: Hipaspista"', (await labels()).includes('Infantaria pesada: Hipaspista'), `| ${(await labels()).join(' · ')}`);
  await page.screenshot({ path: `${out}-1-biblioteca.png` });
  await page.locator('#commands button.cmd', { hasText: 'Infantaria pesada: Hipaspista' }).click();
  await flush();
  const queued = await page.evaluate((id) => window.aoe.session.state.buildings.get(id).queue.map((q) => q.id), ids.lib);
  ok('estudo na fila da Biblioteca', queued.includes('evo_heavy_infantry_2'), queued.join(','));
  // 2) acelera até o estudo terminar (33 s de jogo); os hoplitas viram hipaspistas
  await pause(false); await page.evaluate(() => { window.aoe.session.speed = 3; });
  const done = () => page.evaluate(() => window.aoe.session.player.techs.includes('evo_heavy_infantry_2'));
  for (let i = 0; i < 120 && !(await done()); i++) await page.waitForTimeout(500);   // até 60 s reais: com o swiftshader o quadro é lento e o jogo anda abaixo de 3×
  await pause(true); await page.evaluate(() => { window.aoe.session.speed = 1; });
  ok('estudo terminou', await done());
  const types = await page.evaluate((hs) => hs.map((h) => window.aoe.session.state.units.get(h)?.type), ids.hops);
  ok('hoplitas transformados', types.every((x) => x === 'hypaspist'), types.join(','));
  // 3) o Quartel treina o degrau novo pela tecla Q
  await select(ids.bar);
  ok('Quartel mostra o Hipaspista', (await labels()).includes('Hipaspista'), `| ${(await labels()).join(' · ')}`);
  await page.keyboard.press('q'); await flush();
  const barQ = await page.evaluate((id) => window.aoe.session.state.buildings.get(id).queue.map((q) => q.id), ids.bar);
  ok('Q no Quartel enfileira hipaspista', barQ.at(-1) === 'hypaspist', barQ.join(','));
  await page.screenshot({ path: `${out}-2-quartel.png` });
  // 4) árvore de estudos: a linha da infantaria pesada com o próximo degrau
  await page.keyboard.press('F3'); await page.waitForTimeout(500);
  ok('árvore tem a evolução seguinte', !!(await page.$('[data-study="evo_heavy_infantry_3"]')));
  await page.screenshot({ path: `${out}-3-arvore.png` });
  await page.keyboard.press('Escape');
  ok('sem erros no console', errors.length === 0, errors.join(' | '));
  await browser.close();
  if (fails.length) { console.log(`FALHAS: ${fails.join(', ')}`); process.exit(1); }
  console.log('playtest-lines: tudo OK');
  ```
- [ ] **G2. Rode no build** (veja "Verificação", item 9) e **olhe as 3 capturas com a ferramenta Read**. O que conferir:
  - no painel da Biblioteca, os botões de evolução com o ícone do hipaspista;
  - no Quartel, o botão "Hipaspista" com a tecla Q;
  - na árvore, uma linha "Infantaria pesada" com os estudos por Era.

### Bloco H — Verificação completa e documentação

- [ ] **H1.** Rode a seção "Verificação" inteira, na ordem.
- [ ] **H2. `docs/EDITOR.md`:**
  - no bloco `config: { … }` do formato de cenário (§2.3; hoje nas linhas ~181–182, a linha que começa com
    `maxAge?: number; forbid?: { buildings?: …` — a E1 pode ter posto `visualEraMax?` nela), acrescente
    `unitLines?: boolean;` logo depois do `forbid?: { … }`, antes do `};` que fecha a `config`;
  - no parágrafo do G6, acrescente uma frase: "`config.unitLines` (E3): `true` liga as linhas de unidade no cenário;
    sem ele, o cenário usa o elenco clássico (as unidades de antes da E3, sem evolução)".
- [ ] **H3.** Faça o "Ao terminar".

---

## Testes a escrever ou atualizar

| Arquivo | O que verifica |
|---|---|
| `tests/unit-lines.test.ts` (novo) — dados | (1) `LINES` tem exatamente os ids de `LINE_ORDER`; cada linha tem `steps.length === AGES.length`, `lineStart ≥ 0`, edifícios com `trains`, **uma só** `cls` e **um só** `pop` entre os degraus e a mesma regra de guarnição (tem tag de `GARRISON_TAGS` e não tem `myth`/`siege`/`cavalry`); fora a linha `citizen`, todo degrau não nulo tem `UNITS[s].line === id` e `UNITS[s].tier === k`. (2) Toda unidade com `line` está nos `steps` da linha (cidadão incluso). (3) Os 50 estudos: `TECHS[evoTechId(id, k)]` existe com `building: 'academy'`, `age: k`, `evolve: { line, to }`, `prereq` = o anterior (ou `[]`), `line: undefined`; total 50. (4) As 41 com `lineOnly` não estão em nenhum `trains`, e o `building` delas está em `LINES[line].buildings`. (5) As 12 de hoje mantêm vida/ataque/`age`/`building`/`hotkey`: `villager [60,3,0,town_center,Q]`, `kataskopos [70,4,0,town_center,W]`, `hoplite [110,9,0,barracks,Q]`, `toxotes [75,7,0,barracks,W]`, `peltast [85,6,1,barracks,E]`, `hippeus [140,10,1,stable,Q]`, `hypaspist [150,13,2,barracks,F]`, `cretan_archer [90,11,2,barracks,T]`, `hetairoi [190,14,2,stable,E]`, `petrobolos [120,30,2,siege_workshop,Q]`, `myrmidon [200,17,3,barracks,Y]`, `helepolis [400,45,3,siege_workshop,W]`; e os `trains` continuam os de hoje: `barracks` = `['hoplite','toxotes','peltast','hypaspist','cretan_archer','myrmidon']`, `stable` = `['kataskopos','hippeus','hetairoi']`, `fortress` = `['hoplite','toxotes','hypaspist','hetairoi','myrmidon']`, `siege_workshop` = `['petrobolos','helepolis']`. (6) Teclas por edifício: as das linhas que treinam ali mais as das unidades sem linha e sem `god` do `trains` são únicas; teclas de linha nunca A, R ou U; nenhuma linha usa Q num edifício com `scholars`. (7) Dentro de cada linha (menos `citizen`), vida e custo total crescem estritamente com o degrau. |
| `tests/unit-lines.test.ts` — núcleo | Use `quickGame` (`tests/helpers.ts`) e um `setup()`: Era 1, 5000 de cada recurso, Biblioteca e Quartel prontos por `placeBuilding(…, true)` num tile achado por um `findFree` igual ao de `tests/economy-regressions.test.ts`. Use também `studyNow(s, lib, tech)`: manda o `research`, põe `elapsed = total − 0,01` no item e roda 1 `tick`. Casos: **(a)** hoplita com `kills = 3` e vida pela metade, outro hoplita guarnecido no CC (`enterGarrison`) e um toxota; depois de uma ordem `move` e de `studyNow(…, 'evo_heavy_infantry_2')`: os dois hoplitas viram `hypaspist`, o toxota não muda, `kills` continua 3, `maxHp === round(getUnitStats(hypaspist).hp × 1,1)`, a fração de vida fica 0,5 ± 0,02, o estado continua `'move'`, o guarnecido segue com `inside === tc.id`, a pop não muda e há um efeito `evolve` com `src: 'hypaspist'`. **(b)** `trainChoices(s, p, 'barracks')` dá `[[heavy_infantry, hoplite, Q], [ranged, toxotes, W], [skirmisher, peltast, E]]` (linha, `show`, tecla); um `hoplite` posto na fila antes do estudo nasce `hypaspist`; depois do estudo, `train` com `unit: 'hoplite'` enfileira `hypaspist`. **(c)** Era 2: `canTrain(Quartel, 'myrmidon').ok === false`; numa Fortaleza, `true`; as teclas da Fortaleza são `['Q','W','E','Y']`; numa Oficina a helépole treina; na Era 4, `canTrain(Oficina, 'helepolis')` dá `{ ok: false, reason: t('err.lineRetired', { line: LINES.assault.name, age: AGES[4].name }) }` e `trainChoices(…, 'siege_workshop')` só tem `artillery`. **(d)** Elenco clássico (`setup({ unitLines: false })`): `unitLinesOn` é `false`; `canResearch(lib, 'evo_heavy_infantry_2')` e `canTrain(Quartel, 'phalangite')` dão `{ ok: false, reason: t('err.legacyRoster') }`; na Era 2, `canTrain(Quartel, 'hypaspist').ok`; `trainChoices(…, 'barracks').map((c) => c.send)` = `BUILDINGS.barracks.trains`; `unitLinesOn(createGame(missionConfig(campaignMission('m1_despertar')!, 'normal')))` é `false`. **(e)** `quickGame({ startingAge: 4 })`: o jogador 0 tem `evo_heavy_infantry_5` e não tem `evo_heavy_infantry_6`, e o batedor do kit é `stradiot`. **(f)** Cidadãos: depois de `evo_citizen_2`, o tipo continua `villager`, `maxHp` = `round(60 × 1,1)` e `mods.gather.food` ≈ antes × 1,04. **(g)** Depois de uma transformação, `serialize(deserialize(serialize(s))) === serialize(s)`. |
| `tests/unit-lines.test.ts` — IA (dois `it`) | `quickGame({ seed: 21, startingAge: 1, maxAge: 2, startingResources: { food: 20000, wood: 20000, stone: 20000, gold: 20000, knowledge: 5000, favor: 300 } }, true)` (2 IAs que começam na Era II e têm a III como Era final). **(1)** timeout 150 000, 12 min de jogo: pelo menos uma IA viva chegou à Era III (`age === 2`), e cada IA viva na Era III tem pelo menos um estudo `evolve` da Era III (`age === 2`) que não é de `citizen` e pelo menos uma unidade viva `lineOnly` ou `hetairoi` (os dois só existem depois de uma evolução da Era III; o hipaspista e o arqueiro cretense não contam, porque a D16 já os dá na Era II). **(2)** timeout 60 000: a mesma config rodada duas vezes por 4 min dá o mesmo `stateHash` (`src/core/net/hash.ts`). O `maxAge` é de propósito: na Era final a Biblioteca fica livre (D19), e o teste não depende do ritmo das Eras. |
| `tests/data.test.ts` | degrau `lineOnly` confere `LINES[line].buildings` no lugar do `trains` (passo A9) |
| `tests/i18n.test.ts` | `check('line', LINES, EN_LINES)` (passo A9). Os 41 `EN_UNITS` e os 50 `EN_TECHS` já são cobertos pelo `check` de hoje. |
| `tests/fx-registry.test.ts` | `'evolve'` na lista do teste dos tipos (passo D5) |
| `tests/fx-logic.test.ts` | sifão → `'fireball'` (passo D5) |
| `tests/studytree.test.ts` (da E1) | O `it` do passo F4 (código pronto lá): numa `quickGame` (não precisa de Biblioteca: sem ela os nós saem `locked`), 9 linhas `evo:*`, `evo:heavy_infantry` com `evo_heavy_infantry_2` na coluna 1 e a `other` sem estudo `evolve`; com `unitLines: false`, nenhuma linha `evo:`. |
| `tests/eras.test.ts` (da E1) | Só se algum `expect` comparar `p.techs` por igualdade numa partida que começa acima da Era I: filtre `p.techs.filter((t) => !TECHS[t].evolve)` nesse `expect` (a E3 acrescenta as evoluções de propósito, D16). |
| `tests/hud-icons.test.ts` | sem mudança no código; passa depois do bloco E (`techIconName` = `techIconKey`, 9 ícones `evo_*`, nenhum órfão) |
| `tests/art-etapa6.test.ts`, `tests/art-library.test.ts`, `tests/art-manifest.test.ts` | sem mudança: a E2 já filtra `UNIT_ART_ALIAS`; as 41 novas estão no alias |

Código pronto de `tests/unit-lines.test.ts` (entra inteiro no passo B9). Ele cobre as três primeiras linhas da tabela;
copie-o e só ajuste se a E1/E2 tiverem mudado o nome de um import.

```ts
// E3 (docs/eras/E3-linhas-de-unidade.md): linhas de unidade — dados, treino pelo degrau atual, evolução que transforma as
// unidades existentes, elenco clássico nos cenários, Era inicial e IA.
import { describe, it, expect } from 'vitest';
import { AGES, BUILDINGS, LINES, LINE_ORDER, TECHS, UNITS, lineStart, evoTechId } from '../src/core/data';
import { GARRISON_TAGS, TICK_RATE, type ResourceType } from '../src/core/constants';
import type { Building, GameConfig, GameState } from '../src/core/types';
import { createGame, tick } from '../src/core/sim/game';
import { applyCommand, canResearch, canTrain } from '../src/core/sim/commands';
import { buildingsOf, canPlaceBuilding, enterGarrison, placeBuilding, spawnUnit, unitsOf } from '../src/core/sim/entities';
import { getUnitStats, recomputeMods, refreshMaxHp } from '../src/core/sim/modifiers';
import { trainChoices, unitLinesOn } from '../src/core/sim/lines';
import { deserialize, serialize } from '../src/core/serialize';
import { stateHash } from '../src/core/net/hash';
import { campaignMission, missionConfig } from '../src/core/scenario/campaign';
import { t } from '../src/i18n';
import { quickGame, run } from './helpers';

function findFree(s: GameState, type: string, cx: number, cy: number, r = 10): { x: number; y: number } {
  for (let rr = 0; rr <= r; rr++) for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
    if (Math.abs(dx) !== rr && Math.abs(dy) !== rr) continue;
    if (canPlaceBuilding(s, s.players[0], type, cx + dx, cy + dy, true).ok) return { x: cx + dx, y: cy + dy };
  }
  throw new Error(`sem espaço para ${type}`);
}
/** Jogador 0 na Era II com 5000 de tudo, Biblioteca e Quartel prontos perto do Centro Cívico. */
function setup(over: Partial<GameConfig> = {}) {
  const s = quickGame(over);
  const p = s.players[0];
  p.age = 1; recomputeMods(s, p);   // os modificadores já na Era II (o caso dos cidadãos compara antes × depois)
  for (const r of Object.keys(p.resources) as ResourceType[]) p.resources[r] = 5000;
  const tc = buildingsOf(s, 0).find((b) => b.type === 'town_center')!;
  const at = (type: string, dx: number, dy: number): Building => { const f = findFree(s, type, tc.tx + dx, tc.ty + dy); return placeBuilding(s, 0, type, f.x, f.y, true); };
  return { s, p, tc, at, lib: at('academy', -6, 0), bar: at('barracks', 6, 0) };
}
/** Estuda `tech` na Biblioteca (fila vazia) e termina no próximo tick. */
function studyNow(s: GameState, lib: Building, tech: string): void {
  expect(applyCommand(s, { type: 'research', player: lib.owner, buildingId: lib.id, tech }).ok, tech).toBe(true);
  const item = lib.queue[0]; item.elapsed = item.total - 0.01;
  tick(s);
}
const steps = (id: string) => LINES[id].steps.filter((x): x is string => !!x);

describe('linhas de unidade: dados', () => {
  it('cada linha: uma posição por Era, degraus coerentes, mesma classe, população e guarnição', () => {
    expect(Object.keys(LINES).sort()).toEqual([...LINE_ORDER].sort());
    const garrisonable = (id: string) => { const d = UNITS[id]; return d.tags.some((x) => GARRISON_TAGS.has(x)) && !['myth', 'siege', 'cavalry'].some((x) => d.tags.includes(x)); };
    for (const id of LINE_ORDER) {
      const l = LINES[id];
      expect(l.steps, id).toHaveLength(AGES.length);
      expect(lineStart(l), id).toBeGreaterThanOrEqual(0);
      for (const b of l.buildings) expect(BUILDINGS[b]?.trains, `${id}: ${b}`).toBeDefined();
      for (const u of steps(id)) expect(UNITS[u], `${id}: ${u}`).toBeDefined();
      expect(new Set(steps(id).map((u) => UNITS[u].cls)).size, `${id}: classe`).toBe(1);
      expect(new Set(steps(id).map((u) => UNITS[u].pop)).size, `${id}: pop`).toBe(1);
      expect(new Set(steps(id).map(garrisonable)).size, `${id}: guarnição`).toBe(1);
      if (id !== 'citizen') l.steps.forEach((x, k) => { if (x) { expect(UNITS[x].line, x).toBe(id); expect(UNITS[x].tier, x).toBe(k); } });
    }
    for (const u of Object.values(UNITS)) if (u.line) expect(LINES[u.line].steps, u.id).toContain(u.id);
  });
  it('50 estudos de evolução: Biblioteca, Era do degrau, em sequência, fora do techCount', () => {
    let n = 0;
    for (const id of LINE_ORDER) {
      const l = LINES[id];
      let prev: string | null = null;
      for (let k = lineStart(l) + 1; k < l.steps.length; k++) {
        if (!l.steps[k]) continue;
        const tid = evoTechId(id, k), x = TECHS[tid];
        expect(x, tid).toBeDefined();
        expect([x.building, x.age, x.evolve, x.prereq, x.line], tid).toEqual(['academy', k, { line: id, to: l.steps[k] }, prev ? [prev] : [], undefined]);
        prev = tid; n++;
      }
    }
    expect(n).toBe(50);
    expect(Object.values(TECHS).filter((x) => x.evolve)).toHaveLength(50);
  });
  it('as 41 novas: lineOnly, fora de todo trains, no edifício da linha, age = tier', () => {
    const fresh = Object.values(UNITS).filter((u) => u.lineOnly);
    expect(fresh).toHaveLength(41);
    for (const u of fresh) {
      expect(LINES[u.line!].buildings, u.id).toContain(u.building);
      expect(u.age, u.id).toBe(u.tier);
      for (const b of Object.values(BUILDINGS)) expect(b.trains ?? [], `${b.id} treina ${u.id}`).not.toContain(u.id);
    }
  });
  it('as 12 de hoje e os trains não mudaram (campanha intacta)', () => {
    const OLD: Record<string, [number, number, number, string, string]> = {
      villager: [60, 3, 0, 'town_center', 'Q'], kataskopos: [70, 4, 0, 'town_center', 'W'], hoplite: [110, 9, 0, 'barracks', 'Q'],
      toxotes: [75, 7, 0, 'barracks', 'W'], peltast: [85, 6, 1, 'barracks', 'E'], hippeus: [140, 10, 1, 'stable', 'Q'],
      hypaspist: [150, 13, 2, 'barracks', 'F'], cretan_archer: [90, 11, 2, 'barracks', 'T'], hetairoi: [190, 14, 2, 'stable', 'E'],
      petrobolos: [120, 30, 2, 'siege_workshop', 'Q'], myrmidon: [200, 17, 3, 'barracks', 'Y'], helepolis: [400, 45, 3, 'siege_workshop', 'W'],
    };
    for (const [id, [hp, atk, age, bld, hk]] of Object.entries(OLD)) { const u = UNITS[id]; expect([u.hp, u.attack, u.age, u.building, u.hotkey, !!u.lineOnly], id).toEqual([hp, atk, age, bld, hk, false]); }
    expect(BUILDINGS.barracks.trains).toEqual(['hoplite', 'toxotes', 'peltast', 'hypaspist', 'cretan_archer', 'myrmidon']);
    expect(BUILDINGS.stable.trains).toEqual(['kataskopos', 'hippeus', 'hetairoi']);
    expect(BUILDINGS.fortress.trains).toEqual(['hoplite', 'toxotes', 'hypaspist', 'hetairoi', 'myrmidon']);
    expect(BUILDINGS.siege_workshop.trains).toEqual(['petrobolos', 'helepolis']);
  });
  it('teclas de treino com as linhas: únicas por edifício, nunca A/R/U, sem Q onde há filósofos', () => {
    for (const [bid, b] of Object.entries(BUILDINGS)) {
      const lineKeys = LINE_ORDER.filter((id) => LINES[id].buildings.includes(bid)).map((id) => LINES[id].hotkey);
      for (const k of lineKeys) expect(['A', 'R', 'U'], `${bid}: ${k}`).not.toContain(k);
      if (b.scholars) expect(lineKeys, bid).not.toContain('Q');
      const keys = [...lineKeys, ...(b.trains ?? []).filter((u) => !UNITS[u].line && !UNITS[u].god).map((u) => UNITS[u].hotkey).filter((k): k is string => !!k)];
      expect(new Set(keys).size, `${bid}: ${keys.join(',')}`).toBe(keys.length);
    }
  });
  it('dentro de cada linha, vida e custo crescem com o degrau', () => {
    const total = (id: string) => Object.values(UNITS[id].cost).reduce((a: number, b) => a + (b ?? 0), 0);
    for (const id of LINE_ORDER) {
      if (id === 'citizen') continue;
      const u = steps(id);
      for (let i = 1; i < u.length; i++) { expect(UNITS[u[i]].hp, u[i]).toBeGreaterThan(UNITS[u[i - 1]].hp); expect(total(u[i]), u[i]).toBeGreaterThan(total(u[i - 1])); }
    }
  });
});

describe('linhas de unidade: núcleo', () => {
  it('a evolução transforma as unidades da linha (vida proporcional, patente, ordem, guarnição, população, efeito)', () => {
    const { s, p, tc, lib } = setup();
    const h = spawnUnit(s, 0, 'hoplite', tc.x + 3, tc.y + 4);
    h.kills = 3; refreshMaxHp(s, p); h.hp = Math.round(h.maxHp / 2);
    const g = spawnUnit(s, 0, 'hoplite', tc.x - 3, tc.y + 4);
    expect(enterGarrison(s, g, tc)).toBe(true);
    const arch = spawnUnit(s, 0, 'toxotes', tc.x + 4, tc.y + 5);
    applyCommand(s, { type: 'move', player: 0, ids: [h.id], x: h.x + 6, y: h.y });
    tick(s);
    const pop0 = p.pop;
    studyNow(s, lib, 'evo_heavy_infantry_2');
    expect([h.type, g.type, arch.type]).toEqual(['hypaspist', 'hypaspist', 'toxotes']);
    expect(h.kills).toBe(3);
    expect(h.maxHp).toBe(Math.round(getUnitStats(s, p, 'hypaspist').hp * 1.1));
    expect(Math.abs(h.hp / h.maxHp - 0.5)).toBeLessThan(0.02);
    expect(h.state).toBe('move');
    expect(g.inside).toBe(tc.id);
    expect(p.pop).toBe(pop0);
    expect(s.effects.some((e) => e.type === 'evolve' && e.src === 'hypaspist')).toBe(true);
  });
  it('o treino sai no degrau atual: um botão por linha, item da fila resolvido ao nascer, id antigo treina o novo', () => {
    const { s, p, lib, bar } = setup();
    expect(trainChoices(s, p, 'barracks').map((c) => [c.line?.id, c.show, c.hotkey])).toEqual([['heavy_infantry', 'hoplite', 'Q'], ['ranged', 'toxotes', 'W'], ['skirmisher', 'peltast', 'E']]);
    expect(applyCommand(s, { type: 'train', player: 0, buildingId: bar.id, unit: 'hoplite' }).ok).toBe(true);
    expect(bar.queue[0].id).toBe('hoplite');
    studyNow(s, lib, 'evo_heavy_infantry_2');
    bar.queue[0].elapsed = bar.queue[0].total - 0.01; tick(s);
    expect(unitsOf(s, 0).some((u) => u.type === 'hypaspist')).toBe(true);
    expect(applyCommand(s, { type: 'train', player: 0, buildingId: bar.id, unit: 'hoplite' }).ok).toBe(true);
    expect(bar.queue[bar.queue.length - 1].id).toBe('hypaspist');
    expect(trainChoices(s, p, 'barracks')[0].show).toBe('hypaspist');
  });
  it('Elite só na Fortaleza; Assalto e Fogo grego aposentam na Era V', () => {
    const { s, p, bar, at } = setup();
    p.age = 2;
    expect(canTrain(s, p, bar, 'myrmidon').ok).toBe(false);
    const fort = at('fortress', 0, 8);
    expect(canTrain(s, p, fort, 'myrmidon').ok).toBe(true);
    expect(trainChoices(s, p, 'fortress').map((c) => c.hotkey)).toEqual(['Q', 'W', 'E', 'Y']);
    const ws = at('siege_workshop', 0, -8);
    expect(canTrain(s, p, ws, 'helepolis').ok).toBe(true);
    p.age = 4;
    expect(canTrain(s, p, ws, 'helepolis')).toEqual({ ok: false, reason: t('err.lineRetired', { line: LINES.assault.name, age: AGES[4].name }) });
    expect(trainChoices(s, p, 'siege_workshop').map((c) => c.line?.id)).toEqual(['artillery']);
  });
  it('elenco clássico (cenário ou unitLines: false): sem evoluções nem degraus novos; trains como antes', () => {
    const { s, p, lib, bar } = setup({ unitLines: false });
    expect(unitLinesOn(s)).toBe(false);
    expect(canResearch(s, p, lib, 'evo_heavy_infantry_2')).toEqual({ ok: false, reason: t('err.legacyRoster') });
    expect(canTrain(s, p, bar, 'phalangite')).toEqual({ ok: false, reason: t('err.legacyRoster') });
    p.age = 2;
    expect(canTrain(s, p, bar, 'hypaspist').ok).toBe(true);
    expect(trainChoices(s, p, 'barracks').map((c) => c.send)).toEqual(BUILDINGS.barracks.trains);
    expect(unitLinesOn(quickGame())).toBe(true);
    expect(unitLinesOn(createGame(missionConfig(campaignMission('m1_despertar')!, 'normal')))).toBe(false);
  });
  it('Era inicial V (fora de cenário): começa com os degraus da Era', () => {
    const s = quickGame({ startingAge: 4 });
    const p = s.players[0];
    expect(p.techs).toContain('evo_heavy_infantry_5');
    expect(p.techs).not.toContain('evo_heavy_infantry_6');
    expect(unitsOf(s, 0).some((u) => u.type === 'stradiot')).toBe(true);
  });
  it('cidadãos evoluem por efeito, sem trocar de tipo', () => {
    const { s, p, lib } = setup();
    const v = unitsOf(s, 0).find((u) => u.type === 'villager')!;
    const food0 = p.mods.gather.food;
    studyNow(s, lib, 'evo_citizen_2');
    expect(v.type).toBe('villager');
    expect(v.maxHp).toBe(Math.round(60 * 1.1));
    expect(p.mods.gather.food).toBeCloseTo(food0 * 1.04, 6);
  });
  it('save: a transformação vai e volta igual', () => {
    const { s, tc, lib } = setup();
    spawnUnit(s, 0, 'hoplite', tc.x + 3, tc.y + 4);
    studyNow(s, lib, 'evo_heavy_infantry_2');
    const a = serialize(s);
    expect(serialize(deserialize(a))).toBe(a);
  });
});

describe('linhas de unidade: IA', () => {
  // Começa na Era II com a III como Era final (maxAge 2): na Era final a IA não junta fundo para avançar e a Biblioteca
  // fica livre para as evoluções (D19). Sem Era final e com recursos de sobra, a IA avança assim que cumpre os estudos e
  // quase não sobra Biblioteca para evoluir — o teste dependeria do ritmo das Eras.
  const cfg: Partial<GameConfig> = { seed: 21, startingAge: 1, maxAge: 2, startingResources: { food: 20000, wood: 20000, stone: 20000, gold: 20000, knowledge: 5000, favor: 300 } };
  it('na Era final a IA estuda evoluções da Era e o exército passa ao degrau novo', () => {
    const s = quickGame(cfg, true);
    run(s, 12 * 60 * TICK_RATE);   // Era III (~4 min) + filósofos e estudos de nível 1 que vêm antes na lista da IA + 2 evoluções
    const final = s.players.filter((p) => p.alive && p.age === 2);
    expect(final.map((p) => p.name), 'alguma IA viva chegou à Era III (a final)').not.toEqual([]);
    for (const p of final) {
      expect(p.techs.some((x) => TECHS[x]?.evolve && TECHS[x].age === 2 && TECHS[x].evolve!.line !== 'citizen'), `${p.name}: ${p.techs.join(',')}`).toBe(true);
      expect(unitsOf(s, p.id).some((u) => UNITS[u.type].lineOnly || u.type === 'hetairoi'), p.name).toBe(true);
    }
  }, 150_000);
  it('a mesma config dá o mesmo estado (determinismo com as linhas)', () => {
    const a = quickGame(cfg, true), b = quickGame(cfg, true);
    run(a, 4 * 60 * TICK_RATE); run(b, 4 * 60 * TICK_RATE);
    expect(stateHash(a)).toBe(stateHash(b));
  }, 60_000);
});
```

Se o primeiro `it` da IA falhar, **não** afrouxe o teste. Descubra qual `expect` falhou e siga o caso:
- **nenhuma IA chegou à Era III** em 12 min: o problema é do avanço na Biblioteca (E1), não das linhas. Rode o `it` da
  IA de `tests/eras.test.ts` (da E1); se ele passa e este não, imprima `canAdvanceAge(s, p, lib)` de cada IA aos 5 min
  e procure a trava (Biblioteca, Templo, `techCount`).
- **nenhum estudo `evolve` da Era III**:
  - confira o passo C3: a `list` inclui `...evolutionPriority(state, player, users)` e o `if (def.evolve)` vem logo
    depois do `const cost = techCost(player, t);`;
  - imprima, para uma IA aos 8 min, `canResearch(s, p, lib, nextEvolution(p, 'heavy_infantry')!)` (o `lib` é a
    Biblioteca dela) e `lib.queue.map((q) => q.id)`;
  - se o `canResearch` recusa, o motivo diz o que falta. Se a fila nunca esvazia por causa dos filósofos (`scholar`) ou
    de estudos de linha, o ajuste é na IA (por exemplo, `manageResearch` aceitar uma Biblioteca com `queue.length <= 1`
    **só** para os estudos `evolve`), não no teste. Lembre a ordem real: no `aiThink`, `manageTraining` (que contrata
    filósofos com a fila **vazia**, até 5, 15 s cada) roda **antes** de `manageResearch`, e na `list` os estudos de
    nível 1 das 4 linhas (`RESEARCH_PRIORITY.slice(0, 12)`) vêm antes das evoluções; os dois passam na frente.
- **nenhuma unidade `lineOnly`/`hetairoi`**: confira o B3 (`trainTypeOf` no nascimento) e o `applyEvolution` do B1
  (`u.type = evo.to`).

---

## Verificação

Na ordem. O que esperar de cada comando:

1. `npm run -s typecheck` → nenhuma saída.
2. `npx vitest run tests/unit-lines.test.ts tests/data.test.ts tests/i18n.test.ts tests/fx-registry.test.ts tests/fx-logic.test.ts tests/studytree.test.ts tests/hud-icons.test.ts tests/art-etapa6.test.ts tests/art-library.test.ts`
   → tudo verde.
3. `npm test` → tudo verde.
   - **Falha conhecida do vitest:** às vezes o resumo mostra todos os testes passando e mesmo assim o processo sai com
     código 1 por um timeout de RPC entre os workers (`Timeout calling "onTaskUpdate"` ou parecido). Não é falha de
     teste: rode de novo. Se repetir, rode os arquivos mais lentos sozinhos (`npx vitest run tests/missions.test.ts`,
     `tests/unit-lines.test.ts`) e considere verde se cada um passar.
   - Falha de verdade (um `expect` vermelho) não é isso: corrija.
4. `npm run -s smoke 20 42`, duas vezes:
   - o "hash final" tem de ser igual nas duas;
   - no resumo do minuto 20, as IAs vivas têm `mil=` maior que 0 e `evo=` maior que 0 (os estudos dos cidadãos contam).
     Se o item 5 obrigou ao **ajuste 3**, o `evo=` pode ficar 0: anote isso no `PROGRESSO.md` em vez de mexer na IA.
5. `npm run -s balance 60 1,2,3 > /tmp/e3-balance-depois.txt` e compare com `/tmp/e3-balance-antes.txt` (passo 0.2).
   - Cada IA imprime `idades aos minutos [0, II, III, …]`: o minuto em que chegou a cada Era. Para tirar a média por
     Era de todas as IAs das 3 sementes, salve este script em `/tmp/e3-eras-mean.mjs` (fora do repositório) e rode
     `node /tmp/e3-eras-mean.mjs /tmp/e3-balance-antes.txt /tmp/e3-balance-depois.txt`:
     ```js
     // média dos minutos de chegada a cada Era (IAs de todas as sementes que chegaram a ela) e quantas chegaram
     import fs from 'node:fs';
     const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
     const means = (p) => {
       const by = [];
       for (const m of fs.readFileSync(p, 'utf8').matchAll(/idades aos minutos \[([^\]]*)\]/g)) m[1].split(',').map(Number).forEach((v, k) => (by[k] ??= []).push(v));
       return by.map((a) => ({ mean: a.reduce((x, y) => x + y, 0) / a.length, n: a.length }));
     };
     const [a, b] = [means(process.argv[2]), means(process.argv[3])];
     for (let k = 1; k < Math.max(a.length, b.length); k++) {
       const x = a[k], y = b[k];
       console.log(`Era ${ROMAN[k]}: antes ${x ? `${x.mean.toFixed(1)} min (${x.n} IAs)` : '—'} · depois ${y ? `${y.mean.toFixed(1)} min (${y.n} IAs)` : '—'} · diferença ${x && y ? (y.mean - x.mean).toFixed(1) : '—'}`);
     }
     ```
   - Critério: nenhuma `PARADA` aos 5 min, e, em cada Era que pelo menos 3 IAs alcançaram nas duas medições, a
     diferença é **no máximo +2,0** min. Chegar mais cedo não é problema. Uma Era que antes 3+ IAs alcançavam e depois
     menos de 3 conta como falha.
   - Se falhar, aplique os ajustes **nesta ordem**, um de cada vez, e meça de novo depois de cada um (pare no primeiro
     que passar):
     1. em `src/core/sim/ai.ts`, troque `const EVO_USERS = 4;` por `const EVO_USERS = 8;`;
     2. troque o `return` final de `evolutionAllowed` por `return done || budget.fundMet || line === 'citizen';`
        (as linhas militares só evoluem com o fundo da Era junto);
     3. troque-o por `return done || budget.fundMet;` (a IA só evolui com o fundo da Era já junto: na Era final, numa
        2ª Biblioteca ou quando o avanço espera um edifício). Com este ajuste as evoluções quase não competem com o
        avanço.
   - Se mesmo o ajuste 3 não passar, o atraso não vem das evoluções, e sim do treino pelas linhas (degraus mais
     caros). Nesse caso pare e registre no `PROGRESSO.md` as médias antes × depois e o ajuste usado: é a E10 que
     rebalanceia custos. Não mexa nos números das unidades.
   - Depois de qualquer ajuste, rode de novo o C4 (o teste da IA usa Era final e passa com os três).
   - Registre no `PROGRESSO.md` as médias por Era antes × depois e o ajuste final (nenhum, 1, 2 ou 3).
6. `npx tsx scripts/missions.ts` → os mesmos veredictos (todos OK) e os mesmos minutos de vitória por missão e
   dificuldade de `/tmp/e3-missions-antes.txt`. Só os tempos de execução (o `(12.3s)` no fim de cada linha) podem
   mudar. Compare assim (a saída vazia do `diff` é o esperado):
   ```sh
   npx tsx scripts/missions.ts > /tmp/e3-missions-depois.txt 2>&1
   diff <(sed -E 's/\([0-9.]+s\)//g' /tmp/e3-missions-antes.txt) <(sed -E 's/\([0-9.]+s\)//g' /tmp/e3-missions-depois.txt)
   ```
   - Qualquer diferença em veredicto ou minuto é **bug** (o elenco clássico vazou): procure um `unitLinesOn` faltando
     ou um `tier` usado no lugar de `age`.
   - Não ajuste roteiro nem janela.
   - Rode também `npx tsx scripts/horde.ts | diff /tmp/e3-horde-antes.txt -`: a saída tem de ser igual (o `diff` não
     imprime nada).
7. `npx vitest run tests/position-fairness.test.ts` → verde. Depois rode a justiça nos dois mapas oficiais. Leva
   tempo; deixe em segundo plano:
   ```sh
   npx tsx scripts/maps/fairness.ts egeu 45 1-16 zeus --both --jobs 3
   npx tsx scripts/maps/fairness.ts estreito 45 1-16 zeus --both --jobs 3
   ```
   - Critério do CLAUDE.md: nenhum lado com mais de 65 % das decididas + à frente no fim, por posição e por índice.
   - Um "fora" isolado com 16 sementes pede confirmação com `101-132`.
   - Se confirmar, procure uma escolha nova da IA que dependa da ordem do `Map` ou da posição: as funções da E3 não
     podem depender (só `LINE_ORDER` e contagens).
8. `npm run art:check` → sem erro (o atlas `hud` bate com o catálogo).
9. Navegador:
   ```sh
   npm run build
   npm run preview   # em segundo plano (porta 4173)
   node scripts/playtest-lines.mjs http://localhost:4173/ /tmp/e3
   node scripts/playtest.mjs http://localhost:4173/ /tmp/e3-pt
   node scripts/playtest-noemoji.mjs http://localhost:4173/ --out /tmp/e3-noemoji   # sem --out ele regrava as capturas de docs/art
   node scripts/playtest-i18n.mjs http://localhost:4173/
   ```
   - `playtest-lines` termina com "tudo OK".
   - `playtest` imprime `fila TC:` com `villager` (a tecla Q do Centro Cívico agora é a linha dos Cidadãos),
     `cartas de deus menor: 2` e `errors: none`.
   - `playtest-noemoji` não acha emoji nem `.hic-ph` (ícone vazio). Se achar `.hic-ph` num botão de evolução, o
     passo E3 não foi feito ou o `art:hud` não rodou.
   - Olhe `/tmp/e3-1-biblioteca.png`, `/tmp/e3-2-quartel.png` e `/tmp/e3-3-arvore.png` com a ferramenta Read.

---

## Critérios de pronto

- [ ] `UNITS` tem 41 unidades novas, `TECHS` tem 50 estudos `evolve` e `LINES` tem 10 linhas. Os 36 tipos de antes
  (os 35 de hoje e o `merchant` da E2) estão com os mesmos números (só `line`/`tier` nas 12).
- [ ] Na partida rápida:
  - o Quartel tem 3 botões de linha (Q, W, E);
  - a Fortaleza tem 4 (Q, W, E, Y);
  - estudar uma evolução transforma as unidades da linha (vida proporcional, patente, ordem e guarnição mantidas, efeito
    `evolve`) e o botão passa a treinar o degrau novo;
  - o item que estava na fila sai no degrau novo.
- [ ] Assalto e Fogo grego somem da Oficina na Era V. A Elite não aparece no Quartel. A Era inicial V já começa com os
  degraus da V.
- [ ] Campanha, Horda e cenários sem `unitLines` estão iguais a antes: `scripts/missions.ts` e `scripts/horde.ts`
  idênticos ao "antes", e nenhum botão de evolução aparece na Biblioteca de uma missão.
- [ ] A IA estuda evoluções e treina degraus novos (`evo=` no smoke). O `balance` está dentro do critério e o `fairness`
  dentro de 65 %.
- [ ] `npm test` verde; `art:check` sem erro; os 4 playtests OK; as capturas foram olhadas.
- [ ] Nenhum manifesto, bake ou arquivo de missão mudou. `public/art` só mudou no atlas `hud` e no `manifest.json`.
- [ ] `SIM_VERSION` subiu 1. Os textos novos existem em PT e EN.

---

## Armadilhas

- **Elenco clássico vazando para a campanha.** Toda regra nova passa por `unitLinesOn(state)`: `canTrain`,
  `canResearch`, `trainChoices`, `applyEvolution`, a árvore, o HUD e `grantStartingEvolutions`.
  - **Nunca** mude número, `age`, `building`, `hotkey` ou `trains` das unidades de hoje.
  - **Nunca** use `tier` onde hoje se usa `age` (peso da IA em `manageTraining`, filtro de Era do HUD no elenco
    clássico).
  - Se `scripts/missions.ts` mudar um minuto, é isso.
- **`line` nos estudos de evolução.** Não ponha `line` no `TechDef` das evoluções: `academyTechCount` contaria os 50 no
  `requires.techCount` das Eras, e avançar ficaria trivial. O campo é `evolve`.
- **Ordem da transformação.** `applyEvolution` vem **antes** de `recomputeMods`/`refreshMaxHp`. Se vier depois, a vida
  máxima fica a do tipo velho até a próxima tecnologia.
- **Não crie `kind` novo de `QueueItem`** para a evolução (o fuzz só aceita `unit`/`tech`/`scholar`/`age`) nem campo
  novo de estado para o degrau: ele sai de `player.techs`.
- **Não troque o tipo do cidadão** (dezenas de comparações com `'villager'` em `src/core`). A linha `citizen` aponta sempre para
  `villager`.
- **Uma fonte de verdade para o treino.** HUD (`refreshCommands`, `showHotkeys`), atalhos (`input.ts`) e IA usam
  `trainChoices` + `canTrain`. Duplicar a regra num deles dá botão habilitado com comando recusado.
- **Ciclo de importação.** `src/core/data/techs.ts` importa de `./lines` e `./units`; `src/i18n/en-data.ts`, de
  `../core/data/lines`. Nunca de `index.ts` dentro de `src/core/data`. Em `en-data.ts`, `EN_LINES` e `evolutionsEN`
  ficam **antes** de `EN_TECHS`: usar um `const` antes da declaração dá `ReferenceError` ao carregar.
- **Determinismo.** Nada de `Math.random`, `Math.pow`, `Math.sin` etc. em `src/core` (`tests/determinism.test.ts`):
  - os números das unidades já são literais;
  - em `evolutions()` só há soma e multiplicação;
  - `applyEvolution` percorre `state.units` na ordem do `Map`, que é a mesma em todos os clientes.
- **Justiça de posição.** As escolhas novas da IA dependem só de contagens e de `LINE_ORDER`, nunca de posição, de
  "primeiro do `Map`" para recursos disputados nem do índice do jogador. Não acrescente desempate por coordenada.
- **`SIM_VERSION`.** Suba 1 (passo B8). Sem isso, replays e o relay misturam partidas de regras diferentes.
- **Save.** Não há campo novo de estado, então nada muda no `deserialize`. Se você precisar de um campo (não deveria),
  ele exige valor padrão no `deserialize` e entrada no `serialize` (CLAUDE.md, "Regras do núcleo").
- **Unidades que não passam pelo treino ficam no tipo que receberam.** O kit inicial passa por `trainTypeOf` (B6),
  mas as unidades pré-colocadas de um mapa fixo (`config.map.entities`), o `spawn`/`place` de um cenário com
  `unitLines: true` e o `debugSpawn` nascem com o tipo pedido e só mudam na **próxima** evolução da linha (a milícia,
  a Sombra e a sentinela não têm linha e nunca mudam). É o esperado: os dois mapas oficiais não têm unidades pré-colocadas e os cenários usam o elenco
  clássico. Não "corrija" isso no `spawnUnit` (ele é usado pela campanha, pela Horda e pelos poderes).
- **Linha aposentada ainda mostra o estudo pendente.** Um jogador que chega à Era V sem ter estudado
  `evo_assault_4` ainda o vê na Biblioteca: estudar transforma as helépoles que ele já tem, o que é coerente com "as
  unidades que existem ficam". A IA não o estuda (`evolutionPriority` pula as linhas aposentadas). Não esconda.
- **`CITIZEN_EVO_EFFECTS` é um vetor só**, compartilhado pelos 7 estudos dos cidadãos. `recomputeMods` só o lê; nada
  pode alterá-lo (nem `push` nem troca de `mult`), senão os 7 mudam juntos.
- **Atalhos.**
  - Teclas de linha nunca A, R ou U. P, H, dígitos, Tab, `.` e `,` também não funcionam: o `input.ts` os consome
    antes do contexto.
  - Com a Biblioteca selecionada, Q é o filósofo e E é o avanço de Era (E1). Nenhuma linha treina na Biblioteca, então
    não há conflito.
  - A tecla da Cavalaria é **E** também no Estábulo (o Hipeu do elenco clássico continua Q).
- **Textos PT e EN.** As 4 chaves novas nos dois lados, com as mesmas `{variáveis}`; sem emoji em `strings.ts` (emoji
  novo ali exigiria `EMOJI_GLYPHS`). O `plural` EN das unidades não é cobrado pelo teste, mas está no bloco: copie
  inteiro.
- **Ícone do HUD obrigatório.**
  - `techIconKey` (catálogo) e `techIconName` (HUD) têm de dar o mesmo nome.
  - Ícone de linha sem estudo (`evo_greek_fire`) quebra o teste de órfão.
  - Só o `npm run art:hud` grava o atlas.
  - **Não rode `npm run art:bake`**: sem `--out` ele reempacota `public/art` só com o cache e pode apagar unidades e o
    atlas `hud`.
- **Arte provisória.**
  - Não crie manifesto para as unidades novas: a E2 resolve tudo pelo alias. Um manifesto sem bake quebra
    `tests/art-manifest.test.ts`, e com bake viola o escopo.
  - Unidade nova sem alias aparece no procedural como humanoide e falha em `hud-icons` (`unit/<id>`).
  - Infantaria nova (humana, sem `cavalry`) precisa de velocidade abaixo de 3,2 (`RUN_SPEED`), senão
    `tests/art-library.test.ts` acusa o galope.
- **VRAM.** O alias não carrega página nova. `warmUnitTypes` passa a listar os degraus até a Era, mas eles resolvem
  para os mesmos assets. A E8, com arte própria, precisa pré-carregar só o degrau atual (gancho abaixo).
- **Efeito novo.** O `push` do `'evolve'` tem de ser literal (`state.effects.push({ type: 'evolve'`) e o tipo tem de
  estar em `EFFECT_TYPES` e em `FX_HANDLERS`; senão `tests/fx-registry.test.ts` falha.
- **`storeSet`.** A E3 não grava nada do jogador. Se acrescentar algo, use `storeSet`/`storeRemove`, nunca
  `localStorage.setItem` (`tests/steam.test.ts`).
- **vitest.** O timeout de RPC entre os workers pode dar código de saída 1 com tudo passando (ver "Verificação", item 3).
- **As linhas vêm ligadas em toda partida sem cenário**, inclusive na `quickGame()` dos testes. Um teste antigo que
  espere o elenco clássico numa `quickGame` (treinar `hypaspist` direto, a tecla `Q` do Hipeu no Estábulo, o
  Mirmidão no Quartel) passa a falhar: acrescente `unitLines: false` ao config **desse** teste, sem mudar a asserção.
  Nos cenários (campanha, Horda, `game(mk())` de `tests/scenario-gaps.test.ts`) nada muda.
- **Comandos pausados no navegador.** O HUD e os atalhos mandam o comando para o agendador, que só o aplica no próximo
  tick. Com `session.paused = true`, a fila não muda até despausar: por isso o `playtest-lines.mjs` usa `flush()`.
- **Nomes que as etapas seguintes usam.** A E4, a E6, a E8 e a E9/E10 citam `LINES`, `LINE_ORDER`,
  `LineDef.studyNames`/`retireAt`, `lineStart`, `evoTechId`, `lineUnitOf`, `trainTypeOf`, `trainChoices` e o tipo
  `TrainChoice` (`send`/`show`/`hotkey`/`era`/`line`), `applyEvolution`, `evolutions()`, `CITIZEN_EVO_EFFECTS`,
  `EN_LINES`, `unitLinesOn`, `config.unitLines`, `UnitDef.line`/`tier`/`lineOnly`/`attackInterval`, `lineUsers`,
  `evolutionAllowed` e `EVO_USERS` (`ai.ts`), o efeito `'evolve'` e as tags `fire`/`gunpowder`/`mechanical`. Não
  renomeie nada disso. Duas linhas são trocadas **literalmente** depois: `const citizen = id === 'citizen';` em
  `evolutions()` (E4, passo B3) e `const type = trainTypeOf(state, player, item.id); const def = UNITS[type];` em
  `completeQueueItem` (E6): escreva-as exatamente assim.
- **Editor e enciclopédia.** A paleta de unidades do editor (`src/editor/panel.ts`, por `cls`) e a aba Unidades da
  enciclopédia passam a listar as 41 novas: é esperado (a E9 organiza por linha).
- **Painel da Biblioteca cheio.** Com as linhas, a Biblioteca mostra até ~7 botões de evolução a mais (o próximo de
  cada linha, inclusive os da Era seguinte, desabilitados) e passa de 3 fileiras: o `#commands` já rola
  (`overflow-y: auto` em `src/ui/styles.css`), e o `playtest-lines.mjs` acha o botão pelo texto mesmo fora da vista.
  Não esconda botões para caber; a E9 reorganiza o painel.

---

## Ao terminar

1. **`docs/eras/PROGRESSO.md`** (formato no `docs/eras/LEIA-ME.md`). Confira as caixas da E3 e preencha a linha da E3
   do Resumo com o estado `feito`, a data, o hash curto do commit e as notas:
   - 10 linhas terrestres, 41 degraus novos e 50 estudos `evo_*`;
   - elenco clássico nos cenários (`config.unitLines`);
   - Sifão como linha técnica `greek_fire`;
   - navios reservados para a E4.

   Em **Notas**, uma subseção `### E3 — medições` com: as médias por Era do `balance 60 1,2,3` antes × depois (a saída
   do script do item 5 da "Verificação"), o ajuste usado (nenhum, 1, 2 ou 3) e o valor final de `EVO_USERS`, o `evo=`
   das IAs no minuto 20 do smoke, o resultado do `fairness` e "missions.ts: igual ao antes".
2. **`docs/ROADMAP.md`**, tabela "Cronograma a partir de 06/10/2026", linha das semanas 3–4: marque a E3 como feita
   (`✅ E3 …`) com a data.
3. **`CLAUDE.md`:**
   - em "Estado atual", acrescente uma frase: E3 concluída (linhas de unidade em `src/core/data/lines.ts` e
     `src/core/sim/lines.ts`; degrau atual derivado dos estudos `evo_<linha>_<n>` da Biblioteca; transformação em
     `applyEvolution`; elenco clássico nos cenários por `config.unitLines`; arte provisória pelo alias);
   - em "Convenções", acrescente: "treino sempre por `trainChoices` + `canTrain` (HUD, atalhos e IA); teclas de linha
     em `LINES[...].hotkey`, únicas por edifício e nunca A/R/U";
   - em "Comandos", na lista dos `node scripts/playtest-*.mjs`, acrescente `playtest-lines.mjs [url] [saída]`
     (Biblioteca, transformação, Quartel e árvore das linhas de unidade; capturas em `<saída>-{1-biblioteca,2-quartel,3-arvore}.png`).
4. **Commit** em português, por exemplo
   `E3: linhas de unidade I–VIII com evolução na Biblioteca (41 degraus, transformação, IA, elenco clássico na campanha)`,
   com o rodapé de atribuição exigido pela sua sessão. Faça push só para a branch da sessão (rotina do `docs/eras/LEIA-ME.md`); nunca para `main` sem pedido do dono.

Ganchos para as etapas seguintes (não implemente agora):

- **E4 (naval):**
  - linhas `warship` e de barcos com os ids reservados;
  - o Estaleiro em `LineDef.buildings`;
  - os ids entram em `LINE_ORDER` e ganham ícone `evo_<linha>` se tiverem estudo;
  - os barcos evoluem "a vapor" sem trocar de tipo, como os cidadãos.
- **E6 (Bênçãos):** estudos do Templo com `match: { tags: ['myth'] }`/`['hero']`, para as míticas aguentarem os degraus
  V–VIII.
- **E8 (arte):**
  - um manifesto por degrau, e o id sai do `UNIT_ART_ALIAS`;
  - `warmUnitTypes` passa a pré-carregar só `lineUnitOf` das linhas do jogador local (e os presentes);
  - projétil `bullet`/`shell` pela tag `gunpowder`;
  - fumaça de motor pela tag `mechanical`;
  - `deathRecipe` e `gaitOf` (áudio, `src/audio/events.ts`) e as respostas `ACKS` (`src/audio/audio.ts`, por `cls`)
    do tanque e do motociclista sem relincho nem casco: hoje saem pela `cls` (`cavalry`/`scout`);
  - ícone por degrau nos estudos.
- **E9:** aba "Linhas" na enciclopédia (linha × Era).
- **E10:** números das 41 unidades, `EVO_USERS` e custos dos estudos com as partidas de 60 min.
